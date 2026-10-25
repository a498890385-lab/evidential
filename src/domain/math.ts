// 数值基础：内部一律 log-odds。
/**
 * 概率下限/上限：不允许出现 0 或 1（数值与语义上都危险），
 * 但不设 0.5% 这种"过粗"的边界——真实先验可能只有万分之几（如罕见病基准率）。
 */
export const EPS = 1e-6;

export function logit(p: number): number {
  const q = Math.min(1 - 1e-12, Math.max(1e-12, p));
  return Math.log(q / (1 - q));
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function logSumExp(xs: number[]): number {
  if (xs.length === 0) return -Infinity;
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  if (!Number.isFinite(m)) return m;
  let s = 0;
  for (const x of xs) s += Math.exp(x - m);
  return m + Math.log(s);
}

/** 输入未归一化的对数权重，输出归一化概率 */
export function normalizeLogWeights(xs: number[]): number[] {
  const z = logSumExp(xs);
  return xs.map((x) => Math.exp(x - z));
}

export function odds(p: number): number {
  return p / (1 - p);
}

export function fmtPct(p: number, digits = 1): string {
  const v = p * 100;
  // 极大概率/极小概率保留有效位，避免显示成 0.0% / 100.0%
  if (v > 0 && v < 0.1) return `${v.toFixed(3)}%`;
  if (v > 99.9 && v < 100) return `${v.toFixed(3)}%`;
  return `${v.toFixed(digits)}%`;
}

export function fmtOdds(p: number): string {
  const o = odds(p);
  return `${o.toFixed(2)} : 1`;
}

export function fmtNum(x: number, digits = 2): string {
  return Number.isFinite(x) ? x.toFixed(digits) : '—';
}
