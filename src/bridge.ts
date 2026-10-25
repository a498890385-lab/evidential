import type { Session, Settings } from './domain/types';

export interface SessionMeta {
  id: string;
  title: string;
  question: string;
  status: 'active' | 'concluded';
  updatedAt: string;
  createdAt: string;
  evidenceCount: number;
}

export interface SettingsPatch {
  llm?: { baseUrl?: string; model?: string; apiKey?: string };
  search?: { provider?: 'deepseek' | 'bocha'; count?: number; apiKey?: string };
  ui?: { theme?: 'light' | 'dark' };
}

export interface SearchResultDto {
  title: string;
  url: string;
  snippet: string;
  summary?: string;
  content?: string;
  site?: string;
  publishedAt?: string;
  authority?: number;
  score?: number;
}

export interface CandidateDto {
  claim: string;
  detail?: string;
  kind: 'observation' | 'statistic' | 'testimony' | 'document' | 'inference';
  quote?: string;
  direction: 'support' | 'oppose' | 'neutral';
  lrForFocus: number;
  reason: string;
  reliability: 'high' | 'medium' | 'low';
  reliabilityReason?: string;
  provenanceCheck: 'verified' | 'unverified' | 'missing';
}

export interface BayesBridge {
  sessions: {
    list(): Promise<SessionMeta[]>;
    load(id: string): Promise<Session | null>;
    save(session: Session): Promise<{ ok: boolean }>;
    remove(id: string): Promise<{ ok: boolean }>;
    exportFile(session: Session): Promise<{ ok: boolean; path?: string; canceled?: boolean }>;
    importFile(): Promise<{ ok: boolean; session?: Session; canceled?: boolean }>;
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: SettingsPatch): Promise<{ ok: boolean }>;
  };
  ai: {
    query(payload: unknown): Promise<unknown>;
    search(payload: unknown): Promise<unknown>;
    extract(payload: unknown): Promise<unknown>;
    alternatives(payload: unknown): Promise<unknown>;
    openQuestions(payload: unknown): Promise<unknown>;
    parseLink(payload: unknown): Promise<unknown>;
    parseText(payload: unknown): Promise<unknown>;
  };
  report: {
    markdown(payload: { defaultName: string; markdown: string }): Promise<{ ok: boolean; path?: string; canceled?: boolean }>;
    pdf(payload: { defaultName: string; html: string }): Promise<{ ok: boolean; path?: string; canceled?: boolean }>;
  };
  app: {
    openExternal(url: string): Promise<{ ok: boolean }>;
    revealPath(path: string): Promise<{ ok: boolean }>;
    version(): Promise<string>;
  };
}

export const defaultSettings: Settings = {
  llm: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', hasKey: false },
  search: { provider: 'deepseek', count: 8, hasKey: false },
  ui: { theme: 'light' }
};

/** 浏览器/无 Electron 环境下的兜底实现（localStorage），便于开发与自动化检查 */
function createLocalBridge(): BayesBridge {
  const S_KEY = 'bayes.sessions.v1';
  const CFG_KEY = 'bayes.settings.v1';
  const readAll = (): Record<string, Session> => {
    try {
      return JSON.parse(localStorage.getItem(S_KEY) || '{}');
    } catch {
      return {};
    }
  };
  const writeAll = (all: Record<string, Session>) =>
    localStorage.setItem(S_KEY, JSON.stringify(all));
  const ai = () => Promise.reject(new Error('AI 功能需要在桌面应用中运行（未检测到 Electron）'));
  const readSettings = async (): Promise<Settings> => {
    try {
      return { ...defaultSettings, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') };
    } catch {
      return defaultSettings;
    }
  };

  return {
    sessions: {
      async list() {
        return Object.values(readAll())
          .map((s) => ({
            id: s.id,
            title: s.title,
            question: s.question,
            status: s.status,
            updatedAt: s.updatedAt,
            createdAt: s.createdAt,
            evidenceCount: s.evidence.filter((e) => e.status === 'adopted').length
          }))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async load(id) {
        return readAll()[id] ?? null;
      },
      async save(session) {
        const all = readAll();
        all[session.id] = { ...session, updatedAt: new Date().toISOString() };
        writeAll(all);
        return { ok: true };
      },
      async remove(id) {
        const all = readAll();
        delete all[id];
        writeAll(all);
        return { ok: true };
      },
      async exportFile(session) {
        const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${session.title}.bayes.json`;
        a.click();
        URL.revokeObjectURL(url);
        return { ok: true };
      },
      async importFile() {
        return { ok: false, canceled: true };
      }
    },
    settings: {
      get: readSettings,
      async set(patch) {
        const cur = await readSettings();
        const next: Settings = {
          ...cur,
          llm: { ...cur.llm, ...patch.llm, hasKey: cur.llm.hasKey || Boolean(patch.llm?.apiKey) },
          search: { ...cur.search, ...patch.search, hasKey: cur.search.hasKey || Boolean(patch.search?.apiKey) },
          ui: { ...cur.ui, ...patch.ui }
        };
        localStorage.setItem(CFG_KEY, JSON.stringify(next));
        return { ok: true };
      }
    },
    ai: {
      query: ai,
      search: ai,
      extract: ai,
      alternatives: ai,
      openQuestions: ai,
      parseLink: ai,
      parseText: ai
    },
    report: {
      async markdown({ defaultName, markdown }) {
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        a.click();
        URL.revokeObjectURL(url);
        return { ok: true };
      },
      async pdf() {
        return { ok: false };
      }
    },
    app: {
      async openExternal(url) {
        window.open(url, '_blank');
        return { ok: true };
      },
      async revealPath() {
        return { ok: true };
      },
      async version() {
        return 'dev';
      }
    }
  };
}

const w = window as unknown as { bayes?: BayesBridge };
export const isDesktop = Boolean(w.bayes);
export const bridge: BayesBridge = w.bayes ?? createLocalBridge();
