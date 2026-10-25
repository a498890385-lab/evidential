import { fmtNum, fmtOdds, fmtPct, logit, odds } from './math';
import {
  evidenceDirection,
  focusHypothesisId,
  focusLikelihoodRatio,
  GROUP_STRENGTH_META,
  replay,
  thresholdOf,
  verdictOf
} from './replay';
import { sensitivityReport } from './sensitivity';
import { assessSufficiency, verdictLabel } from './sufficiency';
import { isWeakLogBF } from './tiers';
import type { Session } from './types';

export interface ReportOptions {
  includeRejected?: boolean;
  openQuestions?: string[];
  generatedAt?: Date;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function fmtTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sourceTypeLabel(t: Session['evidence'][number]['sourceType']): string {
  switch (t) {
    case 'user':
      return '手动输入';
    case 'ai_search':
      return 'AI 搜索';
    case 'link':
      return '用户提供链接';
    case 'paste':
      return '粘贴正文';
  }
}

function reliabilityLabel(r: 'high' | 'medium' | 'low'): string {
  return r === 'high' ? '高' : r === 'medium' ? '中' : '低';
}

export function confidenceLevel(session: Session): { label: '高' | '中' | '低'; reason: string } {
  const suff = assessSufficiency(session);
  const adopted = session.evidence.filter((e) => e.status === 'adopted');
  if (suff.allGreen && adopted.length >= 5) {
    return { label: '高', reason: `四项检查全绿，已采纳 ${adopted.length} 条证据` };
  }
  if (suff.greenCount >= 2) {
    return {
      label: '中',
      reason: `四项检查中 ${suff.greenCount} 项通过，已采纳 ${adopted.length} 条证据`
    };
  }
  return { label: '低', reason: `仅 ${suff.greenCount} 项检查通过，证据基础薄弱` };
}

/** 生成完整 Markdown 报告（§7.2） */
export function buildReportMarkdown(session: Session, opts: ReportOptions = {}): string {
  const now = opts.generatedAt ?? new Date();
  const base = replay(session);
  const focusId = focusHypothesisId(session);
  const threshold = thresholdOf(session.decision);
  const verdict = verdictOf(base.final[focusId], threshold);
  const suff = assessSufficiency(session);
  const sens = sensitivityReport(session);
  const conf = confidenceLevel(session);
  const focus = session.hypotheses.find((h) => h.id === focusId)!;
  const adopted = session.evidence.filter((e) => e.status === 'adopted');
  const rejected = session.evidence.filter((e) => e.status === 'rejected');
  const bf = odds(base.final[focusId]) / Math.max(odds(base.initial[focusId]), 1e-12);

  const lines: string[] = [];
  lines.push(`# 贝叶斯论证报告 · ${session.title}`);
  lines.push('');
  lines.push(
    `> 生成时间：${fmtTime(now)}　证据 ${session.evidence.length} 条（采纳 ${adopted.length} / 否决 ${rejected.length}）`
  );
  lines.push('');
  lines.push('## 1. 结论摘要');
  lines.push('');
  lines.push(`- **问题**：${session.question}`);
  for (const h of session.hypotheses) {
    lines.push(
      `- **当前后验**：${h.label} **${fmtPct(base.final[h.id])}**（先验 ${fmtPct(h.prior)}）`
    );
  }
  lines.push(`- **胜率**：${fmtOdds(base.final[focusId])}　（累计贝叶斯因子 ×${fmtNum(bf, 2)}）`);
  lines.push(
    `- **决策阈值**：${fmtPct(threshold)}${session.decision.actionLabel ? `（行动：${session.decision.actionLabel}）` : ''}`
  );
  lines.push(`- **判定**：${verdictLabel(verdict)}`);
  lines.push(`- **置信等级**：${conf.label}（${conf.reason}）`);
  lines.push('');
  lines.push('## 2. 假设与先验');
  lines.push('');
  lines.push('| 假设 | 陈述 | 先验 |');
  lines.push('|---|---|---|');
  for (const h of session.hypotheses) {
    lines.push(`| ${h.label} | ${h.statement} | ${fmtPct(h.prior)} |`);
  }
  lines.push('');
  if (session.priorSource.mode === 'reference-class' && session.priorSource.layers.length > 0) {
    lines.push('先验来源：参照类分层（粗 → 细）');
    lines.push('');
    session.priorSource.layers.forEach((layer, i) => {
      const chosen = layer.id === session.priorSource.chosenLayerId ? ' ← 采用' : '';
      const rate =
        layer.baseRate && Object.keys(layer.baseRate).length > 0
          ? Object.entries(layer.baseRate)
              .map(([hid, p]) => {
                const h = session.hypotheses.find((x) => x.id === hid);
                return `${h?.label ?? hid} ${fmtPct(p)}`;
              })
              .join(' / ')
          : '未填';
      lines.push(`${i + 1}. ${layer.description}：${rate}${layer.source ? `（来源：${layer.source}）` : ''}${chosen}`);
    });
    lines.push('');
  } else if (session.priorSource.mode === 'uniform') {
    lines.push('先验来源：未设定（均分）。**结论对先验高度敏感，请补充参照类基准率。**');
    lines.push('');
  } else {
    lines.push('先验来源：直接设定。');
    lines.push('');
  }

  lines.push('## 3. 证据链');
  lines.push('');
  for (const ev of adopted) {
    const step = base.steps.find((s) => s.evidenceId === ev.id);
    lines.push(`### ${ev.claim}`);
    lines.push('');
    lines.push(`- 来源：${sourceTypeLabel(ev.sourceType)}${ev.provenance?.site ? ` · ${ev.provenance.site}` : ''}${ev.provenance?.url ? `（${ev.provenance.url}）` : ''}`);
    if (ev.provenance?.quote) {
      lines.push(`- 原文引文：`);
      lines.push(`  > ${ev.provenance.quote.replace(/\n/g, ' ')}`);
    }
    const lrFocus = focusLikelihoodRatio(ev, session, focusId);
    lines.push(
      `- 似然比：P(E|${focus.label}) / P(E|¬${focus.label}) = ${fmtNum(lrFocus, 2)} : 1`
    );
    if (step) {
      lines.push(
        `- 影响：${fmtPct(step.before[focusId])} → ${fmtPct(step.after[focusId])}（${step.logBF >= 0 ? '+' : ''}${fmtNum(step.logBF, 2)} logBF）`
      );
      if (step.alpha < 1) {
        const g = session.groups.find((x) => x.id === ev.groupId);
        lines.push(
          `- 相关性折扣：${g ? GROUP_STRENGTH_META[g.strength].title : '相关'}，α=${step.alpha}（原始 logBF ×${step.alpha}）`
        );
      }
    }
    lines.push(`- 可信度：${reliabilityLabel(ev.reliability)}${ev.detail ? `　说明：${ev.detail}` : ''}`);
    if (ev.tags?.length) lines.push(`- 标签：${ev.tags.join('、')}`);
    lines.push('');
  }
  if (adopted.length === 0) {
    lines.push('_尚无已采纳证据。_');
    lines.push('');
  }

  lines.push('## 4. 概率轨迹');
  lines.push('');
  lines.push('| # | 证据 | 概率 | 胜率 | 累计 BF |');
  lines.push('|---|---|---|---|---|');
  lines.push(`| 0 | 先验 | ${fmtPct(base.initial[focusId])} | ${fmtOdds(base.initial[focusId])} | — |`);
  let running = 1;
  base.steps.forEach((s, i) => {
    running *= Math.exp(s.logBF);
    lines.push(
      `| ${i + 1} | ${s.evidenceId} | ${fmtPct(s.after[focusId])} | ${fmtOdds(s.after[focusId])} | ×${fmtNum(running, 2)} |`
    );
  });
  lines.push('');

  lines.push('## 5. 敏感性分析');
  lines.push('');
  lines.push(`- 当前结论：**${verdictLabel(verdict)}**（阈值 ${fmtPct(threshold)}）`);
  lines.push(
    `- 移除任意一条证据是否翻转结论：**${sens.flipsUnderLoo ? '是（存在单点依赖）' : '否'}**`
  );
  const maxLoo = sens.loo.reduce(
    (m, r) => (Math.abs(r.deltaFocusLogOdds) > Math.abs(m.deltaFocusLogOdds) ? r : m),
    { deltaFocusLogOdds: 0, claim: '—', evidenceId: '' } as (typeof sens.loo)[number]
  );
  if (sens.loo.length > 0) {
    lines.push(
      `  - 影响最大的一条：${maxLoo.claim}（移除后 log-odds 变化 ${fmtNum(maxLoo.deltaFocusLogOdds, 2)}）`
    );
  }
  const lowP = Math.min(...sens.sweep.map((s) => s.final[focusId]));
  const highP = Math.max(...sens.sweep.map((s) => s.final[focusId]));
  lines.push(
    `- 先验 ±10 / ±20 个百分点：终值区间 ${fmtPct(lowP)} – ${fmtPct(highP)}，结论${sens.flipsUnderPriorSweep ? '**会**翻转' : '不翻转'}`
  );
  lines.push(
    `- 距离翻转还需 logBF ${fmtNum(sens.neededLogBF, 2)}，约等于 ${fmtNum(sens.evidenceEquivalent, 1)} 条中等强度证据（LR 2）`
  );
  lines.push('');

  lines.push('## 6. 证据充足度');
  lines.push('');
  for (const light of suff.lights) {
    lines.push(`- ${light.ok ? '✅' : '❌'} **${light.title}**：${light.reason}`);
  }
  lines.push('');

  const weak = base.steps.filter((s) => isWeakLogBF(s.logBF));
  lines.push('## 7. 弱证据与相关问题清单');
  lines.push('');
  if (weak.length === 0 && adopted.every((e) => e.reliability !== 'low')) {
    lines.push('- 无。');
  } else {
    for (const w of weak) {
      const ev = session.evidence.find((e) => e.id === w.evidenceId);
      lines.push(`- 弱证据：${ev?.claim ?? w.evidenceId}（|logBF| = ${fmtNum(Math.abs(w.logBF), 2)} < 0.2，几乎不改变判断）`);
    }
    for (const ev of adopted.filter((e) => e.reliability === 'low')) {
      lines.push(`- 可信度低：${ev.claim}`);
    }
    for (const g of session.groups) {
      const members = adopted.filter((e) => e.groupId === g.id);
      if (members.length > 1) {
        lines.push(
          `- 相关性：${g.label}（${GROUP_STRENGTH_META[g.strength].title}），${members.length} 条证据已折扣，可能仍高估其总影响`
        );
      }
    }
  }
  lines.push('');

  lines.push('## 8. 剩余不确定点');
  lines.push('');
  const oq = opts.openQuestions ?? [];
  if (oq.length === 0) lines.push('- 待补充（可由 AI 生成后人工编辑）。');
  else for (const q of oq) lines.push(`- ${q}`);
  lines.push('');

  lines.push('## 9. 判断记录');
  lines.push('');
  if (session.assessments.length === 0) {
    lines.push('- 尚未记录过判断。');
  } else {
    for (const a of session.assessments) {
      lines.push(
        `- ${fmtTime(new Date(a.at))}：${fmtPct(a.posterior[focusId])}（${verdictLabel(a.verdict)}）　结论：${a.userConclusion || '—'}${a.nextStep ? `　下一步：${a.nextStep}` : ''}`
      );
    }
  }
  lines.push('');

  lines.push('## 10. 方法与免责声明');
  lines.push('');
  lines.push('计算方式：内部一律使用 log-odds，单条证据等价于 `logit(P) += logBF`；多假设时 `P(Hi|E) ∝ P(Hi)·LRi` 后归一化。');
  lines.push('');
  lines.push('可复现算式（焦点假设）：');
  if (base.steps.length > 0) {
    const s = base.steps[0];
    lines.push(
      `- logit(${fmtPct(s.before[focusId])}) = ${fmtNum(logit(s.before[focusId]), 3)}　+ ${fmtNum(s.logBF, 3)} → ${fmtNum(logit(s.after[focusId]), 3)} → ${fmtPct(s.after[focusId])}`
    );
  } else {
    lines.push(`- logit(${fmtPct(base.initial[focusId])}) = ${fmtNum(logit(base.initial[focusId]), 3)}（尚无证据）`);
  }
  lines.push('');
  lines.push('**声明**：本报告中的似然值是主观估计，输出的是"信念的量化"，不是客观统计概率，也不是确定性预测。');
  lines.push('证据独立性只是工程上的近似处理，相关性折扣不能完全消除重复计数。');
  lines.push('概率不会取到 0 或 1（内部夹在 1e-6 与 1−1e-6 之间），并且当存在折扣时，单条证据的"影响幅度"与加入顺序有关。');
  lines.push('');
  lines.push(`---`);
  lines.push(`*报告生成时间：${fmtTime(now)}*`);

  return lines.join('\n');
}
