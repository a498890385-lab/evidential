import { useState } from 'react';
import { useStore } from '../store';

export function SettingsDialog() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const setDialog = useStore((s) => s.setDialog);
  const notify = useStore((s) => s.notify);

  const [baseUrl, setBaseUrl] = useState(settings.llm.baseUrl);
  const [model, setModel] = useState(settings.llm.model);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<'deepseek' | 'bocha'>(settings.search.provider);
  const [count, setCount] = useState(settings.search.count);
  const [searchKey, setSearchKey] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings({
        llm: { baseUrl, model, ...(apiKey ? { apiKey } : {}) },
        search: { provider, count, ...(provider === 'bocha' && searchKey ? { apiKey: searchKey } : {}) }
      });
      notify('设置已保存');
      setDialog('none');
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setDialog('none')}>
      <div className="dialog" style={{ width: 640 }}>
        <div className="modal-head">
          <span>设置</span>
          <button className="btn ghost small" onClick={() => setDialog('none')}>
            关闭
          </button>
        </div>
        <div className="modal-body">
          <div className="card" style={{ padding: 12 }}>
            <div className="card-title" style={{ marginBottom: 8 }}>
              大模型（DeepSeek · OpenAI 兼容）
            </div>
            <div className="stack">
              <div className="field">
                <label>API Base URL</label>
                <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </div>
              <div className="field">
                <label>模型 ID</label>
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-flash" />
              </div>
              <div className="field">
                <label>API Key {settings.llm.hasKey ? '（已保存，留空则不修改）' : ''}</label>
                <input
                  type="password"
                  value={apiKey}
                  placeholder={settings.llm.hasKey ? '••••••••（已保存）' : 'sk-…'}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <p className="faint small" style={{ margin: 0 }}>
                Key 只保存在本机（Electron safeStorage 加密），不会写进导出的会话文件。
              </p>
            </div>
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div className="card-title" style={{ marginBottom: 8 }}>
              联网搜索
            </div>
            <div className="stack">
              <div className="field">
                <label>服务</label>
                <select value={provider} onChange={(e) => setProvider(e.target.value as 'deepseek' | 'bocha')}>
                  <option value="deepseek">DeepSeek 自带搜索（与上面共用 Key，返回正文）</option>
                  <option value="bocha">博查 Bocha（需单独 Key）</option>
                </select>
              </div>
              <div className="field">
                <label>每次返回条数</label>
                <input
                  type="number"
                  min={3}
                  max={20}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </div>
              {provider === 'bocha' && (
                <div className="field">
                  <label>博查 API Key {settings.search.hasKey ? '（已保存，留空则不修改）' : ''}</label>
                  <input
                    type="password"
                    value={searchKey}
                    placeholder={settings.search.hasKey ? '••••••••（已保存）' : ''}
                    onChange={(e) => setSearchKey(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={() => setDialog('none')}>
            取消
          </button>
          <button className="btn primary" disabled={saving} onClick={() => void save()}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
