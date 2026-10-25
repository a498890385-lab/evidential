import { logit, EPS } from './math';
import { posteriorFrom } from './bayes';
import type { Evidence, GroupStrength, ID, Session, Verdict } from './types';

/** 相关性折扣：组内第一条全额，其余按 α 折扣 logBF */
export const ALPHA: Record<GroupStrength, number> = {
  strong: 0.3,
  medium: 0.6,
  weak: 0.8
};

export const GROUP_STRENGTH_META: Record<GroupStrength, { title: string; hint: string }> = {
  strong: { title: '强相关', hint: '同一件事换个说法，几乎不提供新信息' },
  medium: { title: '中等相关', hint: '部分同源，只有一部分是新增信息' },
  weak: { title: '弱相关', hint: '略有重叠' }
};

export function focusHypothesisId(session: Session): ID {
  const base = session.hypotheses.find((h) => h.isBaseline);
  return (base ?? session.hypotheses[0]).id;
}

export function adoptedEvidence(session: Session, excludeEvidenceId?: string): Evidence[] {
  return session.evidence
    .filter((e) => e.status === 'adopted' && e.id !== excludeEvidenceId)
    .sort((a, b) => a.seq - b.seq);
}

export function alphaFor(session: Session, ev: Evidence): number {
  if (!ev.groupId) return 1;
  const group = session.groups.find((g) => g.id === ev.groupId);
  if (!group) return 1;
  const members = adoptedEvidence(session).filter((e) => e.groupId === group.id);
  if (members.length < 2) return 1;
  const idx = members.findIndex((e) => e.id === ev.id);
  return idx <= 0 ? 1 : ALPHA[group.strength];
}

export interface ReplayStep {
  index: number;
  evidenceId: string;
  before: Record<ID, number>;
  after: Record<ID, number>;
  /** 焦点假设的 log-odds 变化（等价于折扣后的 logBF） */
  logBF: number;
  alpha: number;
  saturated: boolean;
}

export interface ReplayResult {
  initial: Record<ID, number>;
  steps: ReplayStep[];
  final: Record<ID, number>;
  saturated: boolean;
  focusId: ID;
}

/** 概率裁剪到 [EPS, 1-EPS] 后重新归一 */
export function clampPosterior(p: Record<ID, number>): {
  p: Record<ID, number>;
  saturated: boolean;
} {
  const ids = Object.keys(p);
  let saturated = false;
  const c: Record<ID, number> = {};
  for (const id of ids) {
    const v = Math.min(1 - EPS, Math.max(EPS, p[id]));
    if (Math.abs(v - p[id]) > 1e-12) saturated = true;
    c[id] = v;
  }
  let sum = 0;
  for (const id of ids) sum += c[id];
  for (const id of ids) c[id] /= sum;
  return { p: c, saturated };
}

/**
 * 从先验按 seq 顺序重放全部已采纳证据。
 * 绝不信任任何缓存概率：这是唯一的真相来源。
 */
export function replay(session: Session, excludeEvidenceId?: string): ReplayResult {
  const ids = session.hypotheses.map((h) => h.id);
  const focusId = focusHypothesisId(session);

  const initial: Record<ID, number> = {};
  for (const h of session.hypotheses) initial[h.id] = h.prior;

  let current = clampPosterior(initial).p;
  const steps: ReplayStep[] = [];
  let saturated = false;

  adoptedEvidence(session, excludeEvidenceId).forEach((ev, index) => {
    const alpha = alphaFor(session, ev);
    const eff: Record<ID, number> = {};
    for (const id of ids) {
      const raw = Math.max(ev.lr[id] ?? 1, 1e-9);
      eff[id] = Math.pow(raw, alpha);
    }
    const raw = posteriorFrom(current, eff);
    const clamped = clampPosterior(raw);
    if (clamped.saturated) saturated = true;
    const logBF = logit(clamped.p[focusId]) - logit(current[focusId]);
    steps.push({
      index,
      evidenceId: ev.id,
      before: current,
      after: clamped.p,
      logBF,
      alpha,
      saturated: clamped.saturated
    });
    current = clamped.p;
  });

  return { initial, steps, final: current, saturated, focusId };
}

/**
 * 焦点假设相对于"其余假设"的似然比（用于展示/报告）。
 * 基准假设恒为 1，所以焦点若是基准，需要从其余假设反算。
 */
export function focusLikelihoodRatio(ev: Evidence, session: Session, focusId: ID): number {
  const baselineId =
    session.hypotheses.find((h) => h.isBaseline)?.id ?? session.hypotheses[0].id;
  if (focusId !== baselineId) return ev.lr[focusId] ?? 1;
  const others = session.hypotheses
    .filter((h) => h.id !== baselineId)
    .map((h) => Math.max(ev.lr[h.id] ?? 1, 1e-9));
  if (others.length === 0) return 1;
  const geoMean = Math.exp(others.reduce((a, b) => a + Math.log(b), 0) / others.length);
  return geoMean > 0 ? 1 / geoMean : 1;
}

/** 某条证据对焦点假设的方向（>1 支持焦点） */
export function evidenceDirection(
  ev: Evidence,
  focusId: ID
): 'support' | 'oppose' | 'neutral' {
  const lr = ev.lr[focusId] ?? 1;
  if (lr > 1.05) return 'support';
  if (lr < 0.95) return 'oppose';
  return 'neutral';
}

export function verdictOf(p: number, threshold: number): Verdict {
  if (p < threshold) return 'below';
  if (p < Math.min(0.995, threshold + 0.15)) return 'borderline';
  return 'above';
}

export function thresholdOf(decision: { actionCost?: number; inactionCost?: number; threshold?: number }): number {
  if (typeof decision.threshold === 'number') return decision.threshold;
  const c = decision.actionCost;
  const b = decision.inactionCost;
  if (typeof c === 'number' && typeof b === 'number' && c + b > 0) return c / (c + b);
  return 0.5;
}
