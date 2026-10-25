import { useState } from 'react';
import { useStore } from '../store';

export function NewSessionDialog() {
  const newSession = useStore((s) => s.newSession);
  const newDemo = useStore((s) => s.newDemo);
  const setDialog = useStore((s) => s.setDialog);

  const [question, setQuestion] = useState('');
  const [h1, setH1] = useState('成立');
  const [h2, setH2] = useState('不成立');
  const [prior, setPrior] = useState(50);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!question.trim()) return;
    setBusy(true);
    try {
      await newSession({
        question: question.trim(),
        title: question.trim().slice(0, 28),
        h1: { label: h1.trim() || '成立', statement: '' },
        h2: { label: h2.trim() || '不成立', statement: '' },
        priorH1: prior / 100
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setDialog('none')}>
      <div className="dialog" style={{ width: 560 }}>
        <div className="modal-head">
          <span>新建论证会话</span>
          <button className="btn ghost small" onClick={() => setDialog('none')}>
            关闭
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>你要验证的问题</label>
            <textarea
              value={question}
              placeholder="例如：这个 SaaS 项目明年能盈利吗？"
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>假设 H1（你想验证的）</label>
              <input value={h1} onChange={(e) => setH1(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>假设 H2（对立面）</label>
              <input value={h2} onChange={(e) => setH2(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>先验：H1 在没看任何证据前有多可能？{prior}%</label>
            <input type="range" min={1} max={99} value={prior} onChange={(e) => setPrior(Number(e.target.value))} />
            <span className="faint small">
              建议先想一个"同类情况里有多少比例会成立"的基准率，稍后可以在左侧"参照类"里替换。
            </span>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" disabled={busy} onClick={() => void newDemo()} style={{ marginRight: 'auto' }}>
            用示例数据看看
          </button>
          <button className="btn" onClick={() => setDialog('none')}>
            取消
          </button>
          <button className="btn primary" disabled={busy || !question.trim()} onClick={() => void create()}>
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
