import { useMemo, useState } from 'react';
import { fmtPct } from '../domain/math';
import { uid } from '../domain/factory';
import { useStore } from '../store';
import type { Session } from '../domain/types';
import { derive } from './derive';

export function LeftPanel() {
  const session = useStore((s) => s.session);
  if (!session) return null;
  return (
    <div className="col">
      <QuestionCard session={session} />
      <HypothesesCard session={session} />
      <PriorCard session={session} />
      <EvidenceCard session={session} />
    </div>
  );
}

function QuestionCard({ session }: { session: Session }) {
  const mutate = useStore((s) => s.mutate);
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">待验证的问题</span>
      </div>
      <textarea
        value={session.question}
        style={{ minHeight: 52 }}
        onChange={(e) => mutate((d) => void (d.question = e.target.value))}
      />
      <div className="field" style={{ marginTop: 8 }}>
        <label>会话名</label>
        <input value={session.title} onChange={(e) => mutate((d) => void (d.title = e.target.value))} />
      </div>
    </section>
  );
}

function HypothesesCard({ session }: { session: Session }) {
  const mutate = useStore((s) => s.mutate);
  const { r, focusId } = useMemo(() => derive(session), [session]);

  const setBaseline = (id: string) =>
    mutate((d) => {
      d.hypotheses.forEach((h) => {
        h.isBaseline = h.id === id;
      });
    });

  const addHypothesis = () =>
    mutate((d) => {
      const n = d.hypotheses.length;
      const share = 1 / (n + 1);
      const rest = 1 - share;
      d.hypotheses.forEach((h) => {
        h.prior = h.prior * rest;
      });
      d.hypotheses.push({
        id: uid('h'),
        label: '新假设',
        statement: '',
        prior: share
      });
      if (!d.priorSource.chosenLayerId) d.priorSource.mode = 'direct';
    });

  const removeHypothesis = (id: string) =>
    mutate((d) => {
      d.hypotheses = d.hypotheses.filter((h) => h.id !== id);
      if (!d.hypotheses.some((h) => h.isBaseline)) d.hypotheses[0].isBaseline = true;
      const sum = d.hypotheses.reduce((a, h) => a + h.prior, 0) || 1;
      d.hypotheses.forEach((h) => {
        h.prior = h.prior / sum;
      });
    });

  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">竞争假设</span>
        <span className="faint small">结论假设：{session.hypotheses.find((h) => h.id === focusId)?.label}</span>
      </div>
      <div className="stack">
        {session.hypotheses.map((h) => (
          <div key={h.id} className={`hyp ${h.id === focusId ? 'is-focus' : ''}`}>
            <div className="hyp-top">
              <input
                className="hyp-label"
                value={h.label}
                onChange={(e) => mutate((d) => void (d.hypotheses.find((x) => x.id === h.id)!.label = e.target.value))}
              />
              <span className="hyp-now">{fmtPct(r.final[h.id])}</span>
            </div>
            <input
              className="small"
              placeholder="完整陈述（要能判真假）"
              value={h.statement}
              onChange={(e) =>
                mutate((d) => void (d.hypotheses.find((x) => x.id === h.id)!.statement = e.target.value))
              }
            />
            <div className="row between">
              <span className="hyp-prior">先验 {fmtPct(h.prior)}</span>
              <div className="row">
                {h.id !== focusId && (
                  <button className="btn small ghost" onClick={() => setBaseline(h.id)}>
                    设为结论假设
                  </button>
                )}
                {session.hypotheses.length > 2 && (
                  <button className="btn small ghost danger" onClick={() => removeHypothesis(h.id)}>
                    删除
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        <button className="btn small" onClick={addHypothesis}>
          + 添加竞争假设
        </button>
        {session.hypotheses.length === 2 && (
          <p className="faint small" style={{ margin: 0 }}>
            两种解释都能说通时，再加第三种（例如"其实是别的因素"），否则加多少证据都不会改变判断。
          </p>
        )}
      </div>
    </section>
  );
}

function PriorCard({ session }: { session: Session }) {
  const mutate = useStore((s) => s.mutate);
  const mode = session.priorSource.mode;

  const setMode = (m: 'reference-class' | 'direct' | 'uniform') =>
    mutate((d) => {
      d.priorSource.mode = m;
      if (m === 'uniform') {
        const u = 1 / d.hypotheses.length;
        d.hypotheses.forEach((h) => void (h.prior = u));
      }
    });

  const setLayerField = (layerId: string, field: 'description' | 'source', value: string) =>
    mutate((d) => {
      const layer = d.priorSource.layers.find((l) => l.id === layerId)!;
      if (field === 'description') layer.description = value;
      else layer.source = value;
    });

  const setLayerRate = (layerId: string, hypId: string, pct: number) =>
    mutate((d) => {
      const layer = d.priorSource.layers.find((l) => l.id === layerId)!;
      layer.baseRate = { ...(layer.baseRate ?? {}), [hypId]: Math.max(0, pct) / 100 };
    });

  const applyLayer = (layerId: string) =>
    mutate((d) => {
      const layer = d.priorSource.layers.find((l) => l.id === layerId)!;
      const ids = d.hypotheses.map((h) => h.id);
      const raw = ids.map((id) => Math.max(0, layer.baseRate?.[id] ?? 0));
      let sum = raw.reduce((a, b) => a + b, 0);
      if (sum <= 0) {
        const u = 1 / ids.length;
        ids.forEach((id) => void (layer.baseRate = { ...(layer.baseRate ?? {}), [id]: u }));
        sum = 1;
      }
      ids.forEach((id, i) => {
        const v = raw[i] / sum;
        layer.baseRate = { ...(layer.baseRate ?? {}), [id]: v };
        const h = d.hypotheses.find((x) => x.id === id)!;
        h.prior = v;
      });
      d.priorSource.chosenLayerId = layerId;
      d.priorSource.mode = 'reference-class';
    });

  const addLayer = () =>
    mutate((d) => {
      d.priorSource.layers.push({
        id: uid('l'),
        description: '',
        baseRate: Object.fromEntries(
          d.hypotheses.map((h) => [h.id, h.prior])
        ) as Record<string, number>
      });
      d.priorSource.mode = 'reference-class';
    });

  const setDirectPrior = (hypId: string, pct: number) =>
    mutate((d) => {
      const h = d.hypotheses.find((x) => x.id === hypId)!;
      h.prior = Math.min(0.9999, Math.max(0.0001, pct / 100));
      const others = d.hypotheses.filter((x) => x.id !== hypId);
      const rest = 1 - h.prior;
      const otherSum = others.reduce((a, x) => a + x.prior, 0) || others.length || 1;
      others.forEach((x) => {
        x.prior = otherSum > 0 ? (x.prior / otherSum) * rest : rest / others.length;
      });
      d.priorSource.mode = 'direct';
    });

  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">先验</span>
        <div className="tabs">
          {(
            [
              ['reference-class', '参照类'],
              ['direct', '直接'],
              ['uniform', '均分']
            ] as const
          ).map(([m, label]) => (
            <button key={m} className={`tab ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'reference-class' && (
        <div className="stack">
          {session.priorSource.layers.length === 0 && (
            <p className="faint small" style={{ margin: 0 }}>
              填一个能找到统计数据的参照类（例如"同类项目第二年盈利比例"），比凭感觉拖滑块准得多。
            </p>
          )}
          {session.priorSource.layers.map((layer) => (
            <div key={layer.id} className="hyp">
              <input
                placeholder="参照类描述，如：2021 年北京考生"
                value={layer.description}
                onChange={(e) => setLayerField(layer.id, 'description', e.target.value)}
              />
              <input
                className="small"
                placeholder="数据出处 / URL"
                value={layer.source ?? ''}
                onChange={(e) => setLayerField(layer.id, 'source', e.target.value)}
              />
              <div className="row wrap">
                {session.hypotheses.map((h) => (
                  <label key={h.id} className="row small" style={{ gap: 4 }}>
                    <span className="muted">{h.label}</span>
                    <input
                      type="number"
                      style={{ width: 66 }}
                      value={Math.round(((layer.baseRate?.[h.id] ?? 0) * 100 + Number.EPSILON) * 10) / 10}
                      onChange={(e) => setLayerRate(layer.id, h.id, Number(e.target.value))}
                    />
                    <span className="faint">%</span>
                  </label>
                ))}
              </div>
              <div className="row between">
                <span className="faint small">
                  {layer.id === session.priorSource.chosenLayerId ? '当前采用' : '未采用'}
                </span>
                <button className="btn small" onClick={() => applyLayer(layer.id)}>
                  用这层作先验
                </button>
              </div>
            </div>
          ))}
          <button className="btn small ghost" onClick={addLayer}>
            + 添加参照层
          </button>
        </div>
      )}

      {mode === 'direct' && (
        <div className="stack">
          {session.hypotheses.map((h) => (
            <label key={h.id} className="row between small">
              <span className="muted">{h.label}</span>
              <span className="row" style={{ gap: 4 }}>
                <input
                  type="number"
                  style={{ width: 80 }}
                  value={Math.round(h.prior * 1000) / 10}
                  onChange={(e) => setDirectPrior(h.id, Number(e.target.value))}
                />
                <span className="faint">%</span>
              </span>
            </label>
          ))}
          <p className="faint small" style={{ margin: 0 }}>
            改动一个假设会按比例重分配其余假设。直接填百分比是最省事、也最容易拍脑袋的方式。
          </p>
        </div>
      )}

      {mode === 'uniform' && (
        <p className="small muted" style={{ margin: 0 }}>
          所有假设先验相同（{session.hypotheses.length} 个假设各 {(100 / session.hypotheses.length).toFixed(1)}%）。
          结论会对先验极度敏感。
        </p>
      )}
    </section>
  );
}

function EvidenceCard({ session }: { session: Session }) {
  const setEditingEvidenceId = useStore((s) => s.setEditingEvidenceId);
  const [filter, setFilter] = useState<'all' | 'adopted' | 'rejected'>('all');
  const { r, focusId } = useMemo(() => derive(session), [session]);

  const stepById = new Map(r.steps.map((s) => [s.evidenceId, s]));
  const list = session.evidence
    .filter((e) => (filter === 'all' ? true : e.status === filter))
    .slice()
    .sort((a, b) => b.seq - a.seq);

  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">
          证据（采纳 {session.evidence.filter((e) => e.status === 'adopted').length}）
        </span>
        <button className="btn small primary" onClick={() => setEditingEvidenceId('new')}>
          + 加证据
        </button>
      </div>

      <div className="tabs" style={{ marginBottom: 8 }}>
        {(
          [
            ['all', '全部'],
            ['adopted', '已采纳'],
            ['rejected', '已否决']
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={`tab ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <p className="faint small" style={{ margin: 0 }}>
          还没有证据。先加一条你能确认的观察，再考虑让 AI 去搜。
        </p>
      )}

      {list.map((ev) => {
        const step = stepById.get(ev.id);
        return (
          <div
            key={ev.id}
            className={`ev ${ev.status === 'rejected' ? 'rejected' : ''}`}
            onClick={() => setEditingEvidenceId(ev.id)}
            title="点击编辑"
          >
            <div className="ev-line1">
              <span className="ev-idx">E{ev.seq}</span>
              <span className="ev-claim">{ev.claim}</span>
              {step && (
                <span className="ev-delta">
                  {step.logBF >= 0 ? '+' : ''}
                  {step.logBF.toFixed(2)}
                </span>
              )}
            </div>
            <div className="ev-delta">
              {step
                ? `${fmtPct(step.before[focusId])} → ${fmtPct(step.after[focusId])}`
                : ev.status === 'rejected'
                  ? '已否决 · 不参与计算'
                  : '未采纳'}
              {ev.groupId ? ' · 已分组' : ''}
            </div>
          </div>
        );
      })}
    </section>
  );
}
