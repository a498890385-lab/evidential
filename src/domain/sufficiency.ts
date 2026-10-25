import { replay } from './replay';
import { evidenceDirection, thresholdOf, verdictOf } from './replay';
import { leaveOneOut, priorSweep } from './sensitivity';
import type { Session } from './types';

export interface SufficiencyLight {
  key: 'stability' | 'noSinglePoint' | 'bothSides' | 'correlation';
  title: string;
  ok: boolean;
  reason: string;
  /** 怎么变绿 */
  howToFix: string;
}

export interface SufficiencyResult {
  lights: SufficiencyLight[];
  greenCount: number;
  allGreen: boolean;
}

/** §3.9 四灯 */
export function assessSufficiency(session: Session): SufficiencyResult {
  const base = replay(session);
  const focus = base.focusId;
  const threshold = thresholdOf(session.decision);
  const current = verdictOf(base.final[focus], threshold);
  const adopted = session.evidence.filter((e) => e.status === 'adopted');

  const sweep = priorSweep(session);
  const stability = sweep.every((s) => s.verdict === current);

  const loo = leaveOneOut(session);
  const noSinglePoint = loo.every((r) => verdictOf(r.final[focus], threshold) === current);

  const supports = adopted.some((e) => evidenceDirection(e, focus) === 'support');
  const opposes = adopted.some((e) => evidenceDirection(e, focus) === 'oppose');
  const bothSides = (supports && opposes) || Boolean(session.opposeChecked);

  // 同源未分组：两条已采纳证据指向同一 URL
  const urlMap = new Map<string, number>();
  for (const e of adopted) {
    const url = e.provenance?.url;
    if (!url) continue;
    const norm = url.replace(/[#?].*$/, '').replace(/\/$/, '');
    urlMap.set(norm, (urlMap.get(norm) ?? 0) + 1);
  }
  const duplicateUrls = [...urlMap.values()].filter((n) => n > 1).length;
  const correlation = duplicateUrls === 0;

  const lights: SufficiencyLight[] = [
    {
      key: 'stability',
      title: '稳健',
      ok: stability,
      reason: stability
        ? '先验 ±10 / ±20 个百分点内，结论不翻转'
        : '先验稍有变动，结论就会翻转',
      howToFix: '补充更明确的基准率（参照类分层），或增加证据数量'
    },
    {
      key: 'noSinglePoint',
      title: '无单点依赖',
      ok: noSinglePoint,
      reason: noSinglePoint
        ? '移除任意一条证据，结论都不翻转'
        : '有一条证据被移除，结论就会翻转',
      howToFix: '为被依赖的那条证据找第二条独立来源，或删掉它重新判断'
    },
    {
      key: 'bothSides',
      title: '双向覆盖',
      ok: bothSides,
      reason: bothSides
        ? '已记录反证，或已明确检索过反对方向'
        : '目前只有支持方向的证据',
      howToFix: '用「反对方向」关键词搜一轮；确实搜不到就勾选"已检索未找到"'
    },
    {
      key: 'correlation',
      title: '相关性已处理',
      ok: correlation,
      reason: correlation ? '没有发现同源未分组的证据' : `${duplicateUrls} 组证据指向同一来源`,
      howToFix: '把这些证据放进同一个"相关性分组"，系统会按强度打折'
    }
  ];

  const greenCount = lights.filter((l) => l.ok).length;
  return { lights, greenCount, allGreen: greenCount === lights.length };
}

export function verdictLabel(v: 'below' | 'borderline' | 'above'): string {
  if (v === 'above') return '支持行动';
  if (v === 'borderline') return '临界，需更多证据';
  return '不建议行动';
}
