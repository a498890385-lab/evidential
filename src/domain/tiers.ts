import type { Tier } from './types';

/** 五档 → 似然比（相对"假设为真"）。依据 Kass–Raftery 分级的保守映射。 */
export const TIER_LR: Record<Tier, number> = {
  'almost-certain': 5,
  likely: 2,
  neutral: 1,
  unlikely: 0.5,
  'almost-impossible': 0.2
};

export const TIER_ORDER: Tier[] = ['almost-certain', 'likely', 'neutral', 'unlikely', 'almost-impossible'];

export const TIER_META: Record<Tier, { title: string; hint: string; strength: string }> = {
  'almost-certain': {
    title: '几乎必然',
    hint: '假设为真则几乎一定见到；假设为假则几乎不会',
    strength: '中等（BF 5）'
  },
  likely: { title: '更可能', hint: '假设为真时更常见', strength: '弱（BF 2）' },
  neutral: { title: '无差别', hint: '真假两种情况一样常见', strength: '无信息（BF 1）' },
  unlikely: { title: '更不可能', hint: '假设为假时反而更常见', strength: '弱（BF 2）' },
  'almost-impossible': {
    title: '几乎不可能',
    hint: '假设为真则几乎不会见到',
    strength: '中等（BF 5）'
  }
};

/** |logBF| 低于此值视为弱证据（对应 |ΔP| 判据的错误修正） */
export const WEAK_LOG_BF = 0.2;

export function isWeakLogBF(logBF: number): boolean {
  return Math.abs(logBF) < WEAK_LOG_BF;
}
