import { useEffect } from 'react';
import { isDesktop } from './bridge';
import { useStore } from './store';
import { AssessDialog } from './ui/AssessDialog';
import { CenterPanel } from './ui/CenterPanel';
import { EvidenceEditor } from './ui/EvidenceEditor';
import { Header } from './ui/Header';
import { LeftPanel } from './ui/LeftPanel';
import { NewSessionDialog } from './ui/NewSessionDialog';
import { ReportDialog } from './ui/ReportDialog';
import { RightPanel } from './ui/RightPanel';
import { SettingsDialog } from './ui/SettingsDialog';

let booted = false;

export default function App() {
  const ready = useStore((s) => s.ready);
  const session = useStore((s) => s.session);
  const dialog = useStore((s) => s.dialog);
  const toast = useStore((s) => s.toast);
  const setDialog = useStore((s) => s.setDialog);
  const newDemo = useStore((s) => s.newDemo);
  const setEditingEvidenceId = useStore((s) => s.setEditingEvidenceId);

  useEffect(() => {
    if (booted) return;
    booted = true;
    void useStore.getState().init();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        if (!session) return;
        e.preventDefault();
        setEditingEvidenceId('new');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setDialog('new');
      }
      if (e.key === 'Escape') {
        if (dialog === 'evidence') setEditingEvidenceId(null);
        else if (dialog !== 'none') setDialog('none');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, dialog, setDialog, setEditingEvidenceId]);

  return (
    <div className="app">
      <Header />

      {!ready ? (
        <div className="empty">加载中…</div>
      ) : session ? (
        <main className="workspace">
          <LeftPanel />
          <CenterPanel />
          <RightPanel />
        </main>
      ) : (
        <div className="empty">
          <h2>从一个待验证的判断开始</h2>
          <p className="muted" style={{ margin: 0 }}>
            输入问题 → 攒证据 → 看后验概率怎么变 → 证据够了导出报告。
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => setDialog('new')}>
              新建会话
            </button>
            <button className="btn" onClick={() => void newDemo()}>
              用示例数据看看
            </button>
          </div>
          {!isDesktop && (
            <p className="faint small" style={{ maxWidth: 420, textAlign: 'center' }}>
              当前运行在浏览器预览模式，数据存在 localStorage，AI 功能不可用。正式使用时请启动桌面应用。
            </p>
          )}
        </div>
      )}

      {dialog === 'settings' && <SettingsDialog />}
      {dialog === 'new' && <NewSessionDialog />}
      {dialog === 'report' && <ReportDialog />}
      {dialog === 'assess' && <AssessDialog />}
      {dialog === 'evidence' && <EvidenceEditor key={useStore.getState().editingEvidenceId ?? 'new'} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
