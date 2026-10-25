import { create } from 'zustand';
import { bridge, defaultSettings, type SessionMeta, type SettingsPatch } from './bridge';
import type { Session, Settings } from './domain/types';
import { createSession, type NewSessionInput } from './domain/factory';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Store {
  ready: boolean;
  sessions: SessionMeta[];
  session: Session | null;
  settings: Settings;
  saveState: SaveState;
  toast: string | null;
  dialog: 'none' | 'settings' | 'report' | 'new' | 'evidence' | 'assess';
  editingEvidenceId: string | null;

  init(): Promise<void>;
  refreshSessions(): Promise<void>;
  newSession(input: NewSessionInput): Promise<void>;
  newDemo(): Promise<void>;
  openSession(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  mutate(fn: (draft: Session) => void): void;
  saveNow(): Promise<void>;
  loadSettings(): Promise<void>;
  saveSettings(patch: SettingsPatch): Promise<void>;
  setDialog(d: Store['dialog']): void;
  setEditingEvidenceId(id: string | null): void;
  notify(msg: string): void;
}

const SAVE_DEBOUNCE = 700;
let saveTimer: number | undefined;

export const useStore = create<Store>((set, get) => ({
  ready: false,
  sessions: [],
  session: null,
  settings: defaultSettings,
  saveState: 'idle',
  toast: null,
  dialog: 'none',
  editingEvidenceId: null,

  async init() {
    await get().loadSettings();
    const sessions = await bridge.sessions.list();
    set({ sessions });
    if (sessions.length > 0) {
      const s = await bridge.sessions.load(sessions[0].id);
      set({ session: s, ready: true });
    } else {
      set({ ready: true });
    }
  },

  async refreshSessions() {
    try {
      set({ sessions: await bridge.sessions.list() });
    } catch {
      /* ignore */
    }
  },

  async newSession(input) {
    const s = createSession(input);
    await bridge.sessions.save(s);
    set({ session: s, dialog: 'none' });
    await get().refreshSessions();
  },

  async newDemo() {
    const s = createSession({
      question: '这个 SaaS 项目明年能盈利吗？',
      title: '示例：SaaS 项目能否盈利',
      h1: { label: '能盈利', statement: '该项目在明年 12 月 31 日前实现正向经营现金流' },
      h2: { label: '不能盈利', statement: '该项目在明年内无法实现正向经营现金流' },
      priorH1: 0.3
    });
    s.priorSource = {
      mode: 'reference-class',
      chosenLayerId: 'l1',
      layers: [
        {
          id: 'l1',
          description: '同类 SaaS 项目第二年实现盈利的比例',
          baseRate: { h1: 0.3, h2: 0.7 },
          source: '行业报告（示例数据，可替换）'
        }
      ]
    };
    s.hypotheses[0].prior = 0.3;
    s.hypotheses[1].prior = 0.7;
    s.decision = { actionCost: 50, inactionCost: 150, actionLabel: '投入下一轮开发' };
    s.opposeChecked = false;

    const now = Date.now();
    const mk = (i: number, claim: string, lr: number, extra: Partial<typeof s.evidence[number]> = {}) => ({
      id: `demo_e${i}`,
      seq: i,
      claim,
      kind: 'observation' as const,
      sourceType: 'user' as const,
      lr: { h1: 1, h2: 1 / lr },
      lrInput: { mode: 'tier' as const },
      reliability: 'medium' as const,
      status: 'adopted' as const,
      createdAt: new Date(now - (10 - i) * 86400000).toISOString(),
      ...extra
    });
    s.evidence = [
      mk(1, '已签下 3 家付费客户，ARR 约 120 万', 2),
      mk(2, '核心客户明确表示续约意向', 2, { reliability: 'medium' }),
      mk(3, '两位联合创始人上月先后离职', 0.5),
      mk(4, '主要竞争对手宣布降价 40%', 0.5),
      mk(5, '行业整体增速跌破 5%', 0.5),
      mk(6, '同类公司第二年盈利者占比 30%', 1.2, { kind: 'statistic', reliability: 'high' }),
      mk(7, '本季度毛利转正（示例数据）', 2, { reliability: 'low' })
    ];
    s.groups = [
      { id: 'g1', label: '客户续约相关（示例）', strength: 'medium' }
    ];
    s.evidence[0].groupId = 'g1';
    s.evidence[1].groupId = 'g1';

    await bridge.sessions.save(s);
    set({ session: s });
    await get().refreshSessions();
  },

  async openSession(id) {
    const s = await bridge.sessions.load(id);
    if (s) set({ session: s, dialog: 'none' });
  },

  async deleteSession(id) {
    await bridge.sessions.remove(id);
    const cur = get().session;
    set({ sessions: await bridge.sessions.list() });
    if (cur && cur.id === id) set({ session: null });
  },

  mutate(fn) {
    const cur = get().session;
    if (!cur) return;
    const draft = structuredClone(cur);
    fn(draft);
    draft.updatedAt = new Date().toISOString();
    set({ session: draft, saveState: 'saving' });
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void get().saveNow();
    }, SAVE_DEBOUNCE);
  },

  async saveNow() {
    const s = get().session;
    if (!s) return;
    try {
      await bridge.sessions.save(s);
      set({ saveState: 'saved' });
      await get().refreshSessions();
    } catch {
      set({ saveState: 'error' });
    }
  },

  async loadSettings() {
    try {
      set({ settings: await bridge.settings.get() });
    } catch {
      set({ settings: defaultSettings });
    }
  },

  async saveSettings(patch) {
    await bridge.settings.set(patch);
    await get().loadSettings();
  },

  setDialog(d) {
    set({ dialog: d });
  },

  setEditingEvidenceId(id) {
    set({ editingEvidenceId: id, dialog: id ? 'evidence' : 'none' });
  },

  notify(msg) {
    set({ toast: msg });
    window.setTimeout(() => {
      if (get().toast === msg) set({ toast: null });
    }, 2600);
  }
}));
