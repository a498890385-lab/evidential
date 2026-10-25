import type { EChartsOption } from 'echarts';
import { useMemo, useState } from 'react';
import { fmtNum, fmtOdds, fmtPct, odds } from '../domain/math';
import { verdictLabel } from '../domain/sufficiency';
import { useStore } from '../store';
import { Chart } from './Chart';
import { derive } from './derive';

const PALETTE = ['#2563eb', '#94a3b8', '#7c3aed', '#0ea5e9', '#64748b', '#475569'];

export function CenterPanel() {
  const session = useStore((s) => s.session);
  const mutate = useStore((s) => s.mutate);
  const setDialog = useStore((s) => s.setDialog);
  const [mode, setMode] = useState<'prob' | 'odds' | 'bf'>('prob');
  const [expandedLight, setExpandedLight] = useState<string | null>(null);

  const d = useMemo(() => (session ? derive(session) : null), [session]);
  if (!session || !d) return null;
  const { r, focusId, focus, threshold, verdict, sens, suff } = d;

  const labels = ['先验', ...r.steps.map((s, i) => `E${i + 1}`)];

  const trajectoryOption = useMemo<EChartsOption>(() => {
    const base = {
      grid: { left: 42, right: 14, top: 26, bottom: 26 },
      tooltip: {
        trigger: 'axis' as const,
        valueFormatter: (v: unknown) => `${Number(v).toFixed(1)}`,
        textStyle: { fontSize: 12 }
      },
      xAxis: {
        type: 'category' as const,
        data: labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: { color: '#9ca3af', fontSize: 11 }
      }
    };

    if (mode === 'prob') {
      return {
        ...base,
        yAxis: {
          type: 'value' as const,
          min: 0,
          max: 100,
          axisLabel: { formatter: '{value}%', color: '#9ca3af', fontSize: 11 },
          splitLine: { lineStyle: { color: '#f3f4f6' } }
        },
        legend: {
          show: session.hypotheses.length > 1,
          top: 0,
          right: 0,
          icon: 'roundRect',
          itemWidth: 8,
          itemHeight: 8,
          textStyle: { color: '#6b7280', fontSize: 11 }
        },
        series: session.hypotheses.map((h, i) => ({
          name: h.label,
          type: 'line' as const,
          data: [r.initial[h.id] * 100, ...r.steps.map((s) => s.after[h.id] * 100)],
          symbol: 'circle',
          symbolSize: 4,
          smooth: false,
          lineStyle: { width: h.id === focusId ? 2.2 : 1.2 },
          itemStyle: { color: PALETTE[i % PALETTE.length] }
        }))
      };
    }

    const values =
      mode === 'odds'
        ? [odds(r.initial[focusId]), ...r.steps.map((s) => odds(s.after[focusId]))]
        : [1, ...r.steps.map((_, i) => Math.exp(r.steps.slice(0, i + 1).reduce((a, s) => a + s.logBF, 0)))];

    return {
      ...base,
      yAxis: {
        type: 'log' as const,
        min: 0.001,
        axisLabel: { formatter: (v: number) => (v >= 1 ? `${fmtNum(v, 1)}` : fmtNum(v, 3)), color: '#9ca3af', fontSize: 11 },
        splitLine: { lineStyle: { color: '#f3f4f6' } }
      },
      series: [
        {
          name: mode === 'odds' ? `${focus.label} 胜率` : '累计贝叶斯因子',
          type: 'line' as const,
          data: values,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { width: 2.2, color: '#2563eb' },
          itemStyle: { color: '#2563eb' }
        }
      ]
    };
  }, [r, session.hypotheses, focusId, focus.label, mode, labels]);

  const waterfallOption = useMemo<EChartsOption>(() => {
    const steps = r.steps;
    return {
      grid: { left: 42, right: 14, top: 18, bottom: 26 },
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: unknown) => {
          const p = (params as { dataIndex: number }[])[0];
          const s = steps[p.dataIndex];
          const ev = session.evidence.find((e) => e.id === s.evidenceId);
          return `${ev?.claim ?? ''}<br/>logBF ${s.logBF >= 0 ? '+' : ''}${fmtNum(s.logBF, 2)}${s.alpha < 1 ? `（折扣 α=${s.alpha}）` : ''}`;
        }
      },
      xAxis: {
        type: 'category' as const,
        data: steps.map((_, i) => `E${i + 1}`),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { color: '#9ca3af', fontSize: 11 }
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { color: '#9ca3af', fontSize: 11 },
        splitLine: { lineStyle: { color: '#f3f4f6' } }
      },
      series: [
        {
          type: 'bar' as const,
          data: steps.map((s) => ({
            value: s.logBF,
            itemStyle: { color: s.logBF >= 0 ? '#2563eb' : '#94a3b8', borderRadius: 2 }
          })),
          barMaxWidth: 28
        }
      ]
    };
  }, [r.steps, session.evidence]);

  return (
    <div className="col">
      <section className="card">
        <div className="hero">
          <div>
            <div className="hero-label">{focus.label}</div>
            <div className="hero-value">{fmtPct(r.final[focusId])}</div>
          </div>
          <div className="stack" style={{ gap: 6, paddingBottom: 2 }}>
            <div className="row">
              <span className={`pill ${verdict === 'above' ? 'accent' : verdict === 'below' ? 'warn' : ''}`}>
                {verdictLabel(verdict)}
              </span>
              <button className="btn small" onClick={() => setDialog('assess')}>
                记录判断
              </button>
            </div>
            <span className="faint small">
              阈值 {fmtPct(threshold)}　胜率 {fmtOdds(r.final[focusId])}　
              {r.steps.length > 0 ? `BF ×${fmtNum(Math.exp(r.steps.reduce((a, s) => a + s.logBF, 0)), 2)}` : '尚无证据'}
            </span>
          </div>
        </div>
        {r.saturated && (
          <div className="alert" style={{ marginTop: 10 }}>
            概率已触及边界（1e-6），该方向的影响已饱和，再加同类证据不会继续放大。
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <span className="card-title">信念轨迹</span>
          <div className="tabs">
            {(
              [
                ['prob', '概率'],
                ['odds', '胜率'],
                ['bf', '累计 BF']
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={`tab ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <Chart option={trajectoryOption} height={210} />
      </section>

      <section className="card">
        <div className="card-head">
          <span className="card-title">每条证据的影响力（logBF）</span>
          <span className="faint small">蓝 = 支持{focus.label}，灰 = 反对</span>
        </div>
        {r.steps.length === 0 ? (
          <p className="faint small" style={{ margin: 0 }}>
            还没有采纳的证据。
          </p>
        ) : (
          <Chart option={waterfallOption} height={160} />
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <span className="card-title">证据充足度</span>
          <span className="faint small">
            {suff.greenCount}/{suff.lights.length} 项通过
          </span>
        </div>
        <div className="lights">
          {suff.lights.map((light) => (
            <div
              key={light.key}
              className={`light ${light.ok ? 'ok' : 'bad'}`}
              onClick={() => setExpandedLight(expandedLight === light.key ? null : light.key)}
              title={light.howToFix}
            >
              <span className="dot" />
              <div>
                <div className="t">{light.title}</div>
                <div className="r">{light.reason}</div>
                {expandedLight === light.key && (
                  <div className="r" style={{ marginTop: 4, color: '#b45309' }}>
                    怎么变绿：{light.howToFix}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {!suff.lights.find((l) => l.key === 'bothSides')!.ok && (
          <button
            className="btn small"
            style={{ marginTop: 10 }}
            onClick={() => mutate((s) => void (s.opposeChecked = true))}
          >
            我已检索过反对方向，未找到反证
          </button>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <span className="card-title">敏感性</span>
        </div>
        <div className="kv small">
          <span className="k">移除任一条证据是否翻转结论</span>
          <span>{sens.flipsUnderLoo ? '是（存在单点依赖）' : '否'}</span>
        </div>
        <div className="kv small">
          <span className="k">先验 ±10 / ±20 点后终值区间</span>
          <span>
            {fmtPct(Math.min(...sens.sweep.map((s) => s.final[focusId])))} –{' '}
            {fmtPct(Math.max(...sens.sweep.map((s) => s.final[focusId])))}
          </span>
        </div>
        <div className="kv small">
          <span className="k">距离翻转还需</span>
          <span>
            logBF {fmtNum(sens.neededLogBF, 2)} ≈ {fmtNum(sens.evidenceEquivalent, 1)} 条中等证据
          </span>
        </div>
        {sens.loo.length > 0 && (
          <>
            <div className="divider" />
            <div className="faint small" style={{ marginBottom: 4 }}>
              最关键的证据（移除后变化最大）
            </div>
            <table className="plain">
              <thead>
                <tr>
                  <th>证据</th>
                  <th style={{ width: 90 }}>移除后 Δlog-odds</th>
                </tr>
              </thead>
              <tbody>
                {[...sens.loo]
                  .sort((a, b) => Math.abs(b.deltaFocusLogOdds) - Math.abs(a.deltaFocusLogOdds))
                  .slice(0, 3)
                  .map((row) => (
                    <tr key={row.evidenceId}>
                      <td>{row.claim}</td>
                      <td>{fmtNum(row.deltaFocusLogOdds, 2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <span className="card-title">决策</span>
          <span className="faint small">阈值 = 行动成本 /（行动成本 + 不行动损失）</span>
        </div>
        <div className="row wrap">
          <label className="row small" style={{ gap: 6 }}>
            <span className="muted">行动成本</span>
            <input
              type="number"
              style={{ width: 84 }}
              value={session.decision.actionCost ?? ''}
              onChange={(e) =>
                mutate((s) => {
                  s.decision.actionCost = e.target.value === '' ? undefined : Number(e.target.value);
                  s.decision.threshold = undefined;
                })
              }
            />
          </label>
          <label className="row small" style={{ gap: 6 }}>
            <span className="muted">不行动损失</span>
            <input
              type="number"
              style={{ width: 84 }}
              value={session.decision.inactionCost ?? ''}
              onChange={(e) =>
                mutate((s) => {
                  s.decision.inactionCost = e.target.value === '' ? undefined : Number(e.target.value);
                  s.decision.threshold = undefined;
                })
              }
            />
          </label>
          <span className="faint small">当前阈值 {fmtPct(threshold)}</span>
        </div>
      </section>
    </div>
  );
}
