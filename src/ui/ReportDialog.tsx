import { useMemo, useState } from 'react';
import { bridge } from '../bridge';
import { buildReportMarkdown } from '../domain/report';
import { useStore } from '../store';
import { reportHtml } from './markdown';

export function ReportDialog() {
  const session = useStore((s) => s.session);
  const setDialog = useStore((s) => s.setDialog);
  const notify = useStore((s) => s.notify);
  const [openQuestions, setOpenQuestions] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);

  const questions = openQuestions
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const markdown = useMemo(
    () => (session ? buildReportMarkdown(session, { openQuestions: questions }) : ''),
    [session, openQuestions]
  );

  if (!session) return null;
  const stamp = new Date();
  const name = `${session.title}-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}`;

  const genQuestions = async () => {
    setGenBusy(true);
    try {
      const focus = session.hypotheses.find((h) => h.isBaseline) ?? session.hypotheses[0];
      const res = (await bridge.ai.openQuestions({
        context: {
          question: session.question,
          hypotheses: session.hypotheses.map((h) => ({ id: h.id, label: h.label, statement: h.statement })),
          focusId: focus.id,
          existingClaims: session.evidence.map((e) => e.claim)
        }
      })) as { questions?: string[]; error?: string };
      if (res.error) {
        notify(res.error);
        return;
      }
      setOpenQuestions((res.questions ?? []).join('\n'));
    } catch (err) {
      notify(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGenBusy(false);
    }
  };

  const exportMd = async () => {
    setBusy('md');
    try {
      const res = await bridge.report.markdown({ defaultName: `${name}.md`, markdown });
      if (res.ok) {
        notify('已导出 Markdown');
        setDialog('none');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '导出失败');
    } finally {
      setBusy(null);
    }
  };

  const exportPdf = async () => {
    setBusy('pdf');
    try {
      const res = await bridge.report.pdf({
        defaultName: `${name}.pdf`,
        html: reportHtml(`${session.title} · 贝叶斯论证报告`, markdown)
      });
      if (res.ok) {
        notify('已导出 PDF');
        setDialog('none');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '导出失败');
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(markdown);
    notify('报告已复制到剪贴板');
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setDialog('none')}>
      <div className="dialog" style={{ width: 860 }}>
        <div className="modal-head">
          <span>导出报告</span>
          <button className="btn ghost small" onClick={() => setDialog('none')}>
            关闭
          </button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 12 }}>
          <pre
            style={{
              margin: 0,
              padding: 12,
              background: '#fafafa',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              maxHeight: '58vh',
              overflow: 'auto',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              fontFamily: 'ui-monospace, Consolas, monospace'
            }}
          >
            {markdown}
          </pre>
          <div className="stack">
            <div className="field">
              <div className="row between">
                <label>剩余不确定点（每行一条，会写进第 8 节）</label>
                <button className="btn small" disabled={genBusy} onClick={() => void genQuestions()}>
                  {genBusy ? '生成中…' : '让 AI 生成'}
                </button>
              </div>
              <textarea
                value={openQuestions}
                placeholder={'例如：\n尚未验证客户续约率\n缺一份近三年的同行业亏损率数据'}
                style={{ minHeight: 140 }}
                onChange={(e) => setOpenQuestions(e.target.value)}
              />
            </div>
            <p className="faint small" style={{ margin: 0 }}>
              报告里的每条证据都带似然比与影响幅度，算式可以手工复算。
            </p>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={() => void copy()}>
            复制
          </button>
          <button className="btn" disabled={busy !== null} onClick={() => void exportMd()}>
            {busy === 'md' ? '导出中…' : '导出 Markdown'}
          </button>
          <button className="btn primary" disabled={busy !== null} onClick={() => void exportPdf()}>
            {busy === 'pdf' ? '生成 PDF…' : '导出 PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
