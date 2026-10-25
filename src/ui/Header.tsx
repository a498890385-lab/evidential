import { useStore } from '../store';

export function Header() {
  const sessions = useStore((s) => s.sessions);
  const session = useStore((s) => s.session);
  const saveState = useStore((s) => s.saveState);
  const openSession = useStore((s) => s.openSession);
  const setDialog = useStore((s) => s.setDialog);

  const saveText =
    saveState === 'saving' ? '保存中…' : saveState === 'error' ? '保存失败' : saveState === 'saved' ? '已保存' : '';

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">β</span>
        <span>贝叶斯论证工作台</span>
      </div>

      <select
        className="session-select"
        value={session?.id ?? ''}
        onChange={(e) => {
          const id = e.target.value;
          if (id === '__new') setDialog('new');
          else if (id) void openSession(id);
        }}
      >
        {!session && <option value="">（未打开会话）</option>}
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}（{s.evidenceCount} 条证据）
          </option>
        ))}
        <option value="__new">+ 新建会话…</option>
      </select>

      <div className="spacer" />
      <span className="save-hint">{saveText}</span>
      <button className="btn" onClick={() => setDialog('new')}>
        新建
      </button>
      <button className="btn" onClick={() => setDialog('settings')}>
        设置
      </button>
      <button className="btn primary" disabled={!session} onClick={() => setDialog('report')}>
        导出报告
      </button>
    </header>
  );
}
