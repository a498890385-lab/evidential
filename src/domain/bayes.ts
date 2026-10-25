import { normalizeLogWeights } from './math';
import type { ID } from './types';

/** 概率归一化（容错：全 0 时取均分） */
export function normalizeProbs(p: Record<ID, number>): Record<ID, number> {
  const ids = Object.keys(p);
  let sum = 0;
  for (const id of ids) sum += Math.max(0, p[id] ?? 0);
  if (sum <= 0) {
    const u = 1 / ids.length;
    const out: Record<ID, number> = {};
    for (const id of ids) out[id] = u;
    return out;
  }
  const out: Record<ID, number> = {};
  for (const id of ids) out[id] = Math.max(0, p[id] ?? 0) / sum;
  return out;
}

/**
 * 多假设后验：P(Hi|E) ∝ P(Hi) · lr[Hi]
 * lr 是相对基准假设的似然比，基准恒为 1。
 */
export function posteriorFrom(
  prior: Record<ID, number>,
  lr: Record<ID, number>
): Record<ID, number> {
  const ids = Object.keys(prior);
  const logs = ids.map((id) => {
    const pi = Math.max(prior[id] ?? 0, 1e-15);
    const li = Math.max(lr[id] ?? 1, 1e-15);
    return Math.log(pi) + Math.log(li);
  });
  const ps = normalizeLogWeights(logs);
  const out: Record<ID, number> = {};
  ids.forEach((id, i) => {
    out[id] = ps[i];
  });
  return out;
}

/** 二元情形：H1 相对于 H2 的似然比 → lr 映射 */
export function binaryLr(h1: ID, h2: ID, lrH1vsH2: number): Record<ID, number> {
  const safe = lrH1vsH2 > 0 ? lrH1vsH2 : 1;
  return { [h1]: 1, [h2]: 1 / safe };
}

export function oddsRatio(pA: number, pB: number): number {
  if (pA <= 0) return 0;
  if (pB <= 0) return Infinity;
  return (pA / (1 - pA)) / (pB / (1 - pB));
}
