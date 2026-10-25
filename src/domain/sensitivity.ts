import { clamp, logit } from './math';
import { replay, thresholdOf, verdictOf } from './replay';
import type { ID, Session, Verdict } from './types';

export interface LooRow {
  evidenceId: string;
  claim: string;
  final: Record<ID, number>;
  /** 移除后焦点假设的 log-odds 变化量（正=移除后升高） */
  deltaFocusLogOdds: number;
}

export function leaveOneOut(session: Session): LooRow[] {
  const base = replay(session);
  const focus = base.focusId;
  const baseLogOdds = logit(base.final[focus]);
  return session.evidence
    .filter((e) => e.status === 'adopted')
    .sort((a, b) => a.seq - b.seq)
    .map((e) => {
      const r = replay(session, e.id);
      return {
        evidenceId: e.id,
        claim: e.claim,
        final: r.final,
        deltaFocusLogOdds: logit(r.final[focus]) - baseLogOdds
      };
    });
}

export interface PriorSweepRow {
  delta: number;
  prior: Record<ID, number>;
  final: Record<ID, number>;
  verdict: Verdict;
}

/** 平移焦点假设的先验，其余假设按比例分摊剩余概率 */
export function shiftPrior(session: Session, focusId: ID, delta: number): Record<ID, number> {
  const ids = session.hypotheses.map((h) => h.id);
  const prior: Record<ID, number> = {};
  for (const h of session.hypotheses) prior[h.id] = h.prior;
  const base = prior[focusId];
  const target = clamp(base + delta, 0.01, 0.99);
  const restSum = 1 - base;
  const newRest = 1 - target;
  for (const id of ids) {
    if (id === focusId) continue;
    prior[id] = restSum > 1e-9 ? ((prior[id] ?? 0) / restSum) * newRest : newRest / (ids.length - 1);
  }
  prior[focusId] = target;
  return prior;
}

export function priorSweep(
  session: Session,
  deltas: number[] = [-0.2, -0.1, 0.1, 0.2]
): PriorSweepRow[] {
  const base = replay(session);
  const focus = base.focusId;
  const threshold = thresholdOf(session.decision);
  return deltas.map((delta) => {
    const prior = shiftPrior(session, focus, delta);
    const perturbed: Session = {
      ...session,
      hypotheses: session.hypotheses.map((h) => ({ ...h, prior: prior[h.id] }))
    };
    const r = replay(perturbed);
    return { delta, prior, final: r.final, verdict: verdictOf(r.final[focus], threshold) };
  });
}

/** 让焦点假设跌破/越过阈值所需的 logBF（负数=需要反证） */
export function neededLogBF(currentP: number, threshold: number): number {
  return logit(threshold) - logit(currentP);
}

/** 折算成"几条中等强度证据"（logBF 0.693 = LR 2） */
export function evidenceEquivalent(logBF: number): number {
  return Math.abs(logBF) / Math.log(2);
}

export interface SensitivityReport {
  loo: LooRow[];
  sweep: PriorSweepRow[];
  currentVerdict: Verdict;
  threshold: number;
  neededLogBF: number;
  evidenceEquivalent: number;
  flipsUnderPriorSweep: boolean;
  flipsUnderLoo: boolean;
}

export function sensitivityReport(session: Session): SensitivityReport {
  const base = replay(session);
  const focus = base.focusId;
  const threshold = thresholdOf(session.decision);
  const currentVerdict = verdictOf(base.final[focus], threshold);
  const loo = leaveOneOut(session);
  const sweep = priorSweep(session);
  const need = neededLogBF(base.final[focus], threshold);
  return {
    loo,
    sweep,
    currentVerdict,
    threshold,
    neededLogBF: need,
    evidenceEquivalent: evidenceEquivalent(need),
    flipsUnderPriorSweep: sweep.some((s) => s.verdict !== currentVerdict),
    flipsUnderLoo: loo.some(
      (r) => verdictOf(r.final[focus], threshold) !== currentVerdict
    )
  };
}
