import { describe, expect, it } from 'vitest';
import { createEvidence, createSession } from '../src/domain/factory';
import { posteriorFrom } from '../src/domain/bayes';
import { logit, sigmoid } from '../src/domain/math';
import { replay, thresholdOf, verdictOf } from '../src/domain/replay';
import { leaveOneOut, neededLogBF } from '../src/domain/sensitivity';
import { assessSufficiency } from '../src/domain/sufficiency';
import { buildReportMarkdown, confidenceLevel } from '../src/domain/report';
import { TIER_LR, isWeakLogBF } from '../src/domain/tiers';
import type { Session } from '../src/domain/types';

function makeSession(prior = 0.5): Session {
  return createSession({ question: '测试问题', priorH1: prior });
}

describe('§3.1 log-odds 基础', () => {
  it('logit 与 sigmoid 互逆', () => {
    for (const p of [0.01, 0.3, 0.5, 0.723, 0.99]) {
      expect(sigmoid(logit(p))).toBeCloseTo(p, 12);
    }
  });
});

describe('P1-1 耳科例子回归（刘/库尔特：基准率压倒似然）', () => {
  it('似然比 2.25 支持脑瘤，但后验胜率仍是耳垢占优 ~1508:1', () => {
    const pTumor = 11 / 37011;
    const s = createSession({
      question: '听力损失 + 耳鸣，是脑瘤还是耳垢？',
      priorH1: pTumor,
      h1: { label: '脑瘤', statement: '前庭神经鞘瘤' },
      h2: { label: '耳垢', statement: '耳垢堵塞' }
    });
    s.evidence.push(
      createEvidence(s, { claim: '出现听力损失与耳鸣', lr: { h1: 1, h2: 1 / 2.25 } })
    );
    const r = replay(s);
    const pTumorPosterior = r.final.h1;
    const ratioTumorToEarwax = pTumorPosterior / (1 - pTumorPosterior);

    // 解析解：11/37000 * 2.25
    expect(ratioTumorToEarwax).toBeCloseTo((11 / 37000) * 2.25, 8);
    // 与书中的 1508:1 相差 < 1%
    expect(Math.abs(1 / ratioTumorToEarwax - 1508) / 1508).toBeLessThan(0.01);
    // 后验概率仍极低
    expect(pTumorPosterior).toBeCloseTo(0.000663, 4);
  });
});

describe('P1-2 五档似然常量', () => {
  it('档位与 logBF 对照表一致', () => {
    expect(Math.log(TIER_LR['almost-certain'])).toBeCloseTo(1.609, 3);
    expect(Math.log(TIER_LR.likely)).toBeCloseTo(0.693, 3);
    expect(Math.log(TIER_LR.neutral)).toBeCloseTo(0, 12);
    expect(Math.log(TIER_LR.unlikely)).toBeCloseTo(-0.693, 3);
    expect(Math.log(TIER_LR['almost-impossible'])).toBeCloseTo(-1.609, 3);
  });

  it('判据看似然比而非 ΔP：同样的 ΔP 可以是强反证，也可以几乎无信息', () => {
    // 0.05 vs 0.20：ΔP = 0.15，但 LR = 0.25（logBF ≈ -1.39），是强反证
    expect(isWeakLogBF(Math.log(0.25))).toBe(false);
    // 0.50 vs 0.55：ΔP = 0.05，LR = 1.1（logBF ≈ 0.095），几乎无信息
    expect(isWeakLogBF(Math.log(1.1))).toBe(true);
    // 两者 ΔP 不同但强弱相反，说明 ΔP 判据失效
    expect(Math.abs(0.05 - 0.2)).toBeGreaterThan(Math.abs(0.5 - 0.55));
  });
});

describe('P1-3 多假设更新', () => {
  it('三假设后验归一化且比值符合先验×似然比', () => {
    const prior = { a: 0.2, b: 0.3, c: 0.5 };
    const lr = { a: 1, b: 0.5, c: 3 };
    const post = posteriorFrom(prior, lr);
    const sum = post.a + post.b + post.c;
    expect(sum).toBeCloseTo(1, 12);
    expect(post.c / post.b).toBeCloseTo((0.5 / 0.3) * (3 / 0.5), 10);
    expect(post.c / post.a).toBeCloseTo((0.5 / 0.2) * (3 / 1), 10);
  });

  it('二元是多假设的特例', () => {
    const post = posteriorFrom({ h1: 0.3, h2: 0.7 }, { h1: 1, h2: 1 / 2 });
    expect(post.h1).toBeCloseTo((0.3 * 2) / (0.3 * 2 + 0.7), 12);
  });
});

describe('P1-4 相关性折扣', () => {
  it('中等相关第二条 logBF 精确乘 0.6', () => {
    const s = makeSession(0.5);
    s.groups.push({ id: 'g1', label: '同源报道', strength: 'medium' });
    s.evidence.push(createEvidence(s, { claim: 'A', lr: { h1: 1, h2: 0.5 }, groupId: 'g1' }));
    s.evidence.push(createEvidence(s, { claim: 'B', lr: { h1: 1, h2: 0.5 }, groupId: 'g1' }));

    const r = replay(s);
    expect(r.steps).toHaveLength(2);
    // 第一条全额
    expect(r.steps[0].alpha).toBe(1);
    expect(r.steps[0].logBF).toBeCloseTo(Math.log(2), 10);
    // 第二条按 α = 0.6
    expect(r.steps[1].alpha).toBe(0.6);
    expect(r.steps[1].logBF).toBeCloseTo(0.6 * Math.log(2), 10);
  });

  it('组内只有一条时不折扣', () => {
    const s = makeSession(0.5);
    s.groups.push({ id: 'g1', label: '单条', strength: 'strong' });
    s.evidence.push(createEvidence(s, { claim: 'A', lr: { h1: 1, h2: 0.5 }, groupId: 'g1' }));
    const r = replay(s);
    expect(r.steps[0].alpha).toBe(1);
  });
});

describe('P1-5 边界与饱和', () => {
  it('连续强证据后停在 99.5% 并标记饱和', () => {
    const s = makeSession(0.5);
    for (let i = 0; i < 10; i++) {
      s.evidence.push(createEvidence(s, { claim: `E${i}`, lr: { h1: 1, h2: 0.2 } }));
    }
    const r = replay(s);
    expect(r.final.h1).toBeLessThanOrEqual(1 - 1e-6 + 1e-12);
    expect(r.final.h1).toBeGreaterThanOrEqual(0.999);
    expect(r.saturated).toBe(true);
  });
});

describe('P1-6 回放幂等与顺序无关', () => {
  it('重放两次结果相同；数组顺序不影响结果', () => {
    const s = makeSession(0.4);
    s.evidence.push(createEvidence(s, { claim: 'A', lr: { h1: 1, h2: 0.6 } }));
    s.evidence.push(createEvidence(s, { claim: 'B', lr: { h1: 1, h2: 1.5 } }));
    s.evidence.push(createEvidence(s, { claim: 'C', lr: { h1: 1, h2: 0.7 } }));

    const r1 = replay(s);
    const r2 = replay(s);
    expect(r2.final).toEqual(r1.final);
    expect(r2.steps.map((x) => x.evidenceId)).toEqual(r1.steps.map((x) => x.evidenceId));

    const shuffled: Session = { ...s, evidence: [...s.evidence].reverse() };
    const r3 = replay(shuffled);
    expect(r3.final.h1).toBeCloseTo(r1.final.h1, 12);
  });
});

describe('P1-7 留一法 (LOO)', () => {
  it('移除某条后与"新会话不含该条"终值一致', () => {
    const s = makeSession(0.3);
    s.evidence.push(createEvidence(s, { claim: 'A', lr: { h1: 1, h2: 0.5 } }));
    s.evidence.push(createEvidence(s, { claim: 'B', lr: { h1: 1, h2: 2 } }));
    const target = s.evidence[1].id;

    const loo = leaveOneOut(s);
    const row = loo.find((x) => x.evidenceId === target)!;
    const without: Session = { ...s, evidence: s.evidence.filter((e) => e.id !== target) };
    expect(row.final.h1).toBeCloseTo(replay(without).final.h1, 12);
    expect(row.final.h2).toBeCloseTo(replay(without).final.h2, 12);
  });
});

describe('P1-8 翻转所需证据（解析解 = 数值扫描）', () => {
  it('neededLogBF 与逐点扫描一致', () => {
    const p = 0.3;
    const threshold = 0.9;
    const need = neededLogBF(p, threshold);
    expect(need).toBeCloseTo(logit(0.9) - logit(0.3), 12);

    const finalWith = (logBF: number) => sigmoid(logit(p) + logBF);
    expect(finalWith(need)).toBeCloseTo(threshold, 10);
    expect(finalWith(need + 0.01)).toBeGreaterThan(threshold);
    expect(finalWith(need - 0.01)).toBeLessThan(threshold);
  });
});

describe('§3.8 决策阈值与判定', () => {
  it('阈值由成本推出，判定分三档', () => {
    expect(thresholdOf({ actionCost: 50, inactionCost: 150 })).toBeCloseTo(0.25, 12);
    expect(verdictOf(0.2, 0.25)).toBe('below');
    expect(verdictOf(0.3, 0.25)).toBe('borderline');
    expect(verdictOf(0.45, 0.25)).toBe('above');
  });
});

describe('§3.9 充足度四灯', () => {
  it('只有支持证据时双向覆盖为红', () => {
    const s = makeSession(0.5);
    s.evidence.push(createEvidence(s, { claim: '支持', lr: { h1: 1, h2: 0.5 } }));
    const suff = assessSufficiency(s);
    expect(suff.lights.find((l) => l.key === 'bothSides')!.ok).toBe(false);
    expect(suff.allGreen).toBe(false);
  });

  it('勾选"已检索反对方向"后双向覆盖变绿', () => {
    const s = makeSession(0.5);
    s.evidence.push(createEvidence(s, { claim: '支持', lr: { h1: 1, h2: 0.5 } }));
    s.opposeChecked = true;
    expect(assessSufficiency(s).lights.find((l) => l.key === 'bothSides')!.ok).toBe(true);
  });

  it('同源未分组时报相关性黄灯', () => {
    const s = makeSession(0.5);
    s.evidence.push(
      createEvidence(s, {
        claim: 'A',
        lr: { h1: 1, h2: 0.5 },
        provenance: { url: 'https://example.com/a' }
      })
    );
    s.evidence.push(
      createEvidence(s, {
        claim: 'B',
        lr: { h1: 1, h2: 0.5 },
        provenance: { url: 'https://example.com/a' }
      })
    );
    expect(assessSufficiency(s).lights.find((l) => l.key === 'correlation')!.ok).toBe(false);
  });
});

describe('§7 报告生成', () => {
  it('包含十节与免责声明', () => {
    const s = makeSession(0.35);
    s.evidence.push(createEvidence(s, { claim: '已签 3 家付费客户', lr: { h1: 1, h2: 0.5 } }));
    s.opposeChecked = true;
    const md = buildReportMarkdown(s, { openQuestions: ['尚未验证续约率'] });
    for (const title of [
      '## 1. 结论摘要',
      '## 2. 假设与先验',
      '## 3. 证据链',
      '## 4. 概率轨迹',
      '## 5. 敏感性分析',
      '## 6. 证据充足度',
      '## 7. 弱证据与相关问题清单',
      '## 8. 剩余不确定点',
      '## 9. 判断记录',
      '## 10. 方法与免责声明'
    ]) {
      expect(md).toContain(title);
    }
    expect(md).toContain('不是客观统计概率');
    expect(md).toContain('尚未验证续约率');
    expect(confidenceLevel(s).label).toMatch(/中|低/);
  });

  it('证据链里的似然比显示的是焦点假设 vs 其余（不是基准假设的 1:1）', () => {
    const s = makeSession(0.5);
    s.evidence.push(createEvidence(s, { claim: '已签 3 家付费客户', lr: { h1: 1, h2: 0.5 } }));
    const md = buildReportMarkdown(s);
    expect(md).toContain('= 2.00 : 1');
  });
});
