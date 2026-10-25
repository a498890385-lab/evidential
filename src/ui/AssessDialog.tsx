import { useMemo, useState } from 'react';
import { fmtPct } from '../domain/math';
import { uid, nowISO } from '../domain/factory';
import { verdictLabel } from '../domain/sufficiency';
import { useStore } from '../store';
import { derive } from './derive';

export function AssessDialog() {
  const session = useStore((s) => s.session);
  const mutate = useStore((s) => s.mutate);
  const setDialog = useStore((s) => s.setDialog);
  const notify = useStore((s) => s.notify);
  const [conclusion, setConclusion] = useState('');
  const [next, setNext] = useState('');

  const d = useMemo(() => (session ? derive(session) : null), [session]);
  if (!session || !d) return null;

  const save = () => {
    mutate((s) => {
      s.assessments.push({
        id: uid('as'),
        at: nowISO(),
        posterior: { ...d.r.final },
        verdict: d.verdict,
        sufficiency: {
          stability: d.suff.lights.find((l) => l.key === 'stability')!.ok,
          noSinglePoint: d.suff.lights.find((l) => l.key === 'noSinglePoint')!.ok,
          bothSides: d.suff.lights.find((l) => l.key === 'bothSides')!.ok,
          correlation: d.suff.lights.find((l) => l.key === 'correlation')!.ok
        },
        userConclusion: conclusion.trim(),
        nextStep: next.trim() || undefined
      });
    });
    notify('已记录这次判断');
    setDialog('none');
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setDialog('none')}>
      <div className="dialog" style={{ width: 560 }}>
        <div className="modal-head">
          <span>记录判断</span>
          <button className="btn ghost small" onClick={() => setDialog('none')}>
            关闭
          </button>
        </div>
        <div className="modal-body">
          <div className="row between">
            <div>
              <div className="hero-label">{d.focus.label}</div>
              <div style={{ fontSize: 30, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
                {fmtPct(d.r.final[d.focusId])}
              </div>
            </div>
            <span className={`pill ${d.verdict === 'above' ? 'accent' : d.verdict === 'below' ? 'warn' : ''}`}>
              {verdictLabel(d.verdict)}
            </span>
          </div>

          <div className="lights">
            {d.suff.lights.map((l) => (
              <div key={l.key} className={`light ${l.ok ? 'ok' : 'bad'}`}>
                <span className="dot" />
                <div>
                  <div className="t">{l.title}</div>
                  <div className="r">{l.ok ? '通过' : '未通过'}</div>
                </div>
              </div>
            ))}
          </div>

          {!d.suff.allGreen && (
            <div className="alert">
              还有检查项没通过。仍然可以记录判断，但报告里会标注"证据不充分"的可能。
            </div>
          )}

          <div className="field">
            <label>我现在的结论（一句话）</label>
            <textarea
              value={conclusion}
              placeholder="例如：证据不足，暂不建议投入下一轮，等续约数据出来再说"
              onChange={(e) => setConclusion(e.target.value)}
            />
          </div>
          <div className="field">
            <label>下一步要做什么（可选）</label>
            <input
              value={next}
              placeholder="例如：等 11 月续约率数据；再查一下竞品降价后的客户流失情况"
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={() => setDialog('none')}>
            取消
          </button>
          <button className="btn primary" onClick={save}>
            保存这次判断
          </button>
        </div>
      </div>
    </div>
  );
}
