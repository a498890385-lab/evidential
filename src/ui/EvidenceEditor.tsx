import { useMemo, useState } from 'react';
import { createEvidence, lrFromFocusLr, uid } from '../domain/factory';
import { TIER_LR, TIER_META, TIER_ORDER } from '../domain/tiers';
import { fmtNum } from '../domain/math';
import { useStore } from '../store';
import { derive } from './derive';
import type { Evidence, Tier } from '../domain/types';

export function EvidenceEditor() {
  const session = useStore((s) => s.session);
  const editingId = useStore((s) => s.editingEvidenceId);
  const setEditing = useStore((s) => s.setEditingEvidenceId);
  const mutate = useStore((s) => s.mutate);
  const notify = useStore((s) => s.notify);

  const existing = useMemo(
    () => (editingId && editingId !== 'new' ? session?.evidence.find((e) => e.id === editingId) : undefined),
    [editingId, session]
  );

  if (!session) return null;
  const d = derive(session);
  const focusId = d.focusId;
  const binary = session.hypotheses.length === 2;
  const baselineId = session.hypotheses.find((h) => h.isBaseline)?.id ?? session.hypotheses[0].id;

  const initialFocusLr = (() => {
    if (!existing) return 2;
    if (binary) {
      const other = session.hypotheses.find((h) => h.id !== baselineId)!;
      const v = existing.lr[other.id] ?? 1;
      return v > 0 ? 1 / v : 1;
    }
    return existing.lr[focusId] ?? 1;
  })();

  const initialTier = TIER_ORDER.find((t) => Math.abs(TIER_LR[t] - initialFocusLr) < 1e-6) ?? 'custom';

  const [claim, setClaim] = useState(existing?.claim ?? '');
  const [detail, setDetail] = useState(existing?.detail ?? '');
  const [kind, setKind] = useState<Evidence['kind']>(existing?.kind ?? 'observation');
  const [sourceType, setSourceType] = useState<Evidence['sourceType']>(existing?.sourceType ?? 'user');
  const [url, setUrl] = useState(existing?.provenance?.url ?? '');
  const [quote, setQuote] = useState(existing?.provenance?.quote ?? '');
  const [site, setSite] = useState(existing?.provenance?.site ?? '');
  const [reliability, setReliability] = useState<Evidence['reliability']>(existing?.reliability ?? 'medium');
  const [groupId, setGroupId] = useState(existing?.groupId ?? '');
  const [newGroup, setNewGroup] = useState<{ label: string; strength: 'strong' | 'medium' | 'weak' } | null>(null);
  const [tier, setTier] = useState<Tier | 'custom'>(initialTier);
  const [customLr, setCustomLr] = useState(initialFocusLr);
  const [matrix, setMatrix] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const h of session.hypotheses) m[h.id] = existing?.lr[h.id] ?? 1;
    return m;
  });
  const [status, setStatus] = useState<Evidence['status']>(existing?.status ?? 'adopted');

  const focusLr = tier === 'custom' ? customLr : TIER_LR[tier];

  const save = () => {
    if (!claim.trim()) {
      notify('先写一句能判真假的命题');
      return;
    }
    const lr = binary ? lrFromFocusLr(session, focusId, focusLr) : matrix;
    mutate((s) => {
      let gid = groupId || undefined;
      if (newGroup && newGroup.label.trim()) {
        const ng = { id: uid('g'), label: newGroup.label.trim(), strength: newGroup.strength };
        s.groups.push(ng);
        gid = ng.id;
      }
      if (existing) {
        const ev = s.evidence.find((e) => e.id === existing.id)!;
        ev.claim = claim.trim();
        ev.detail = detail || undefined;
        ev.kind = kind;
        ev.sourceType = sourceType;
        ev.provenance = { ...(ev.provenance ?? {}), url: url || undefined, quote: quote || undefined, site: site || undefined };
        ev.lr = lr;
        ev.lrInput = { mode: binary ? 'tier' : 'direct' };
        ev.reliability = reliability;
        ev.groupId = gid;
        ev.status = status;
      } else {
        const ev = createEvidence(s, {
          claim,
          detail: detail || undefined,
          kind,
          sourceType,
          provenance: { url: url || undefined, quote: quote || undefined, site: site || undefined },
          lr,
          lrInput: { mode: binary ? 'tier' : 'direct' },
          reliability,
          groupId: gid,
          status
        });
        s.evidence.push(ev);
      }
    });
    setEditing(null);
  };

  const remove = () => {
    if (!existing) return;
    mutate((s) => {
      s.evidence = s.evidence.filter((e) => e.id !== existing.id);
    });
    setEditing(null);
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
      <div className="drawer">
        <div className="modal-head">
          <span>{existing ? `编辑 E${existing.seq}` : '添加证据'}</span>
          <button className="btn ghost small" onClick={() => setEditing(null)}>
            关闭
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>证据命题（一句话，必须能判真假）</label>
            <textarea
              value={claim}
              placeholder="例如：已签下 3 家付费客户，ARR 约 120 万"
              onChange={(e) => setClaim(e.target.value)}
            />
          </div>

          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>类型</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as Evidence['kind'])}>
                <option value="observation">观察</option>
                <option value="statistic">统计数据</option>
                <option value="testimony">证言</option>
                <option value="document">文件/公告</option>
                <option value="inference">推断</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>来源类型</label>
              <select value={sourceType} onChange={(e) => setSourceType(e.target.value as Evidence['sourceType'])}>
                <option value="user">手动输入</option>
                <option value="ai_search">AI 搜索</option>
                <option value="link">用户提供链接</option>
                <option value="paste">粘贴正文</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>可信度</label>
              <select
                value={reliability}
                onChange={(e) => setReliability(e.target.value as Evidence['reliability'])}
              >
                <option value="high">高（官方/原始数据）</option>
                <option value="medium">中（媒体报道/二手）</option>
                <option value="low">低（传言/无署名）</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>似然比：这条证据在「{d.focus.label}」成立时出现，比不成立时常见多少倍？</label>
            {binary ? (
              <>
                <div className="tiers">
                  {TIER_ORDER.map((t) => (
                    <div
                      key={t}
                      className={`tier ${tier === t ? 'on' : ''}`}
                      onClick={() => setTier(t)}
                      title={TIER_META[t].hint}
                    >
                      <div className="tt">{TIER_META[t].title}</div>
                      <div className="tv">
                        {TIER_LR[t] >= 1 ? `${TIER_LR[t]} : 1` : `1 : ${(1 / TIER_LR[t]).toFixed(0)}`}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 6, gap: 6 }}>
                  <button className={`btn small ${tier === 'custom' ? 'primary' : ''}`} onClick={() => setTier('custom')}>
                    精确值
                  </button>
                  <input
                    type="number"
                    step="0.1"
                    min="0.05"
                    max="20"
                    style={{ width: 96 }}
                    disabled={tier !== 'custom'}
                    value={customLr}
                    onChange={(e) => {
                      setCustomLr(Number(e.target.value));
                      setTier('custom');
                    }}
                  />
                  <span className="faint small">
                    {focusLr >= 1 ? `${fmtNum(focusLr, 2)} : 1` : `1 : ${fmtNum(1 / focusLr, 2)}`}
                  </span>
                </div>
              </>
            ) : (
              <div className="stack">
                {session.hypotheses.map((h) => (
                  <label key={h.id} className="row between small">
                    <span className="muted">
                      {h.label}
                      {h.id === baselineId ? '（基准，固定 1）' : ''}
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      style={{ width: 96 }}
                      disabled={h.id === baselineId}
                      value={matrix[h.id] ?? 1}
                      onChange={(e) => setMatrix({ ...matrix, [h.id]: Math.max(0.02, Number(e.target.value) || 1) })}
                    />
                  </label>
                ))}
                <p className="faint small" style={{ margin: 0 }}>
                  多假设时按"相对基准"填似然比：1 表示该假设下这条证据的常见度与基准相同。
                </p>
              </div>
            )}
          </div>

          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>相关性分组</label>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">不分组（默认按独立处理）</option>
                {session.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}（{g.strength === 'strong' ? '强' : g.strength === 'medium' ? '中' : '弱'}相关）
                  </option>
                ))}
              </select>
            </div>
            <button className="btn small" style={{ alignSelf: 'flex-end' }} onClick={() => setNewGroup({ label: '', strength: 'medium' })}>
              + 新建分组
            </button>
          </div>

          {newGroup && (
            <div className="row">
              <input
                placeholder="分组名，如：同一篇报道"
                value={newGroup.label}
                onChange={(e) => setNewGroup({ ...newGroup, label: e.target.value })}
              />
              <select
                style={{ width: 120 }}
                value={newGroup.strength}
                onChange={(e) => setNewGroup({ ...newGroup, strength: e.target.value as 'strong' | 'medium' | 'weak' })}
              >
                <option value="strong">强相关 ρ=0.7</option>
                <option value="medium">中等相关 ρ=0.4</option>
                <option value="weak">弱相关 ρ=0.2</option>
              </select>
            </div>
          )}

          <div className="field">
            <label>补充说明（可选）</label>
            <input value={detail} onChange={(e) => setDetail(e.target.value)} />
          </div>

          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>来源链接</label>
              <input value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div className="field" style={{ width: 150 }}>
              <label>站点</label>
              <input value={site} onChange={(e) => setSite(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>原文引文（用于溯源，可留空）</label>
            <textarea value={quote} style={{ minHeight: 60 }} onChange={(e) => setQuote(e.target.value)} />
          </div>

          <div className="row">
            <label className="row small" style={{ gap: 6 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={status === 'rejected'}
                onChange={(e) => setStatus(e.target.checked ? 'rejected' : 'adopted')}
              />
              否决这条（保留记录但不参与计算）
            </label>
          </div>
        </div>

        <div className="modal-foot">
          {existing && (
            <button className="btn danger" onClick={remove} style={{ marginRight: 'auto' }}>
              删除
            </button>
          )}
          <button className="btn" onClick={() => setEditing(null)}>
            取消
          </button>
          <button className="btn primary" onClick={save}>
            {existing ? '保存修改' : '加入证据链'}
          </button>
        </div>
      </div>
    </div>
  );
}
