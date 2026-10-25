import type { Evidence, ID, Session } from './types';
import { TIER_LR } from './tiers';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export interface NewSessionInput {
  question: string;
  title?: string;
  h1?: { label: string; statement: string };
  h2?: { label: string; statement: string };
  priorH1?: number;
}

export function createSession(input: NewSessionInput): Session {
  const h1 = input.h1 ?? { label: '假设成立', statement: '待补充' };
  const h2 = input.h2 ?? { label: '假设不成立', statement: '待补充' };
  // 只排除 0 / 1；真实先验可以很小（罕见病基准率量级）
  const prior =
    typeof input.priorH1 === 'number'
      ? Math.min(1 - 1e-6, Math.max(1e-6, input.priorH1))
      : 0.5;
  return {
    id: uid('s'),
    schemaVersion: 1,
    title: input.title ?? input.question.slice(0, 30),
    question: input.question,
    status: 'active',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    hypotheses: [
      { id: 'h1', label: h1.label, statement: h1.statement, prior, isBaseline: true },
      { id: 'h2', label: h2.label, statement: h2.statement, prior: 1 - prior }
    ],
    priorSource: { mode: 'uniform', layers: [] },
    evidence: [],
    groups: [],
    candidates: [],
    assessments: [],
    decision: { threshold: 0.5 },
    aiLog: []
  };
}

export interface NewEvidenceInput {
  claim: string;
  detail?: string;
  kind?: Evidence['kind'];
  sourceType?: Evidence['sourceType'];
  provenance?: Evidence['provenance'];
  lr: Record<ID, number>;
  lrInput?: Evidence['lrInput'];
  reliability?: Evidence['reliability'];
  groupId?: string;
  status?: Evidence['status'];
}

export function createEvidence(
  session: Session,
  input: NewEvidenceInput
): Evidence {
  const maxSeq = session.evidence.reduce((m, e) => Math.max(m, e.seq), 0);
  return {
    id: uid('e'),
    seq: maxSeq + 1,
    claim: input.claim.trim(),
    detail: input.detail,
    kind: input.kind ?? 'observation',
    sourceType: input.sourceType ?? 'user',
    provenance: input.provenance,
    lr: input.lr,
    lrInput: input.lrInput ?? { mode: 'direct' },
    reliability: input.reliability ?? 'medium',
    groupId: input.groupId,
    status: input.status ?? 'adopted',
    createdAt: nowISO()
  };
}

/** 二元证据：tier → lr（h1 为基准） */
export function lrFromTier(h1: ID, h2: ID, tier: 'almost-certain' | 'likely' | 'neutral' | 'unlikely' | 'almost-impossible'): Record<ID, number> {
  const lr = TIER_LR[tier];
  return { [h1]: 1, [h2]: 1 / lr };
}

/** 二元证据：频率（每 1000 例）→ lr */
export function lrFromFrequency(h1: ID, h2: ID, f1: number, f2: number): Record<ID, number> {
  const a = Math.max(f1, 1e-6);
  const b = Math.max(f2, 1e-6);
  return { [h1]: 1, [h2]: a / b };
}

/**
 * 把"焦点假设 vs 其余"的似然比，转成相对基准假设的 lr 向量。
 * focus 为主时：基准=1，其余假设 = 1/LR；否则基准=1，focus = LR。
 */
export function lrFromFocusLr(
  session: Session,
  focusId: ID,
  focusLr: number
): Record<ID, number> {
  const lr = focusLr > 0 ? focusLr : 1;
  const baselineId = session.hypotheses.find((h) => h.isBaseline)?.id ?? session.hypotheses[0].id;
  const out: Record<ID, number> = {};
  for (const h of session.hypotheses) out[h.id] = 1;
  if (focusId === baselineId) {
    for (const h of session.hypotheses) {
      if (h.id !== baselineId) out[h.id] = 1 / lr;
    }
  } else {
    out[focusId] = lr;
  }
  return out;
}
