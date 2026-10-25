import { useState } from 'react';
import { bridge, type CandidateDto } from '../bridge';
import { createEvidence, uid } from '../domain/factory';
import { useStore } from '../store';
import { derive } from './derive';
import type { Session } from '../domain/types';

interface SearchResponse {
  candidates: CandidateDto[];
  queries?: { support: string[]; oppose: string[] };
  searched?: number;
  error?: string;
}

interface AltHypothesis {
  label: string;
  statement: string;
  why: string;
}

export function RightPanel() {
  const session = useStore((s) => s.session);
  const settings = useStore((s) => s.settings);
  const mutate = useStore((s) => s.mutate);
  const notify = useStore((s) => s.notify);
  const setDialog = useStore((s) => s.setDialog);

  const [busy, setBusy] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [panel, setPanel] = useState<'none' | 'link' | 'paste'>('none');
  const [alts, setAlts] = useState<AltHypothesis[]>([]);

  if (!session) return null;
  const d = derive(session);
  const pending = session.candidates.filter((c) => c.state === 'pending');

  const ctx = {
    question: session.question,
    hypotheses: session.hypotheses.map((h) => ({ id: h.id, label: h.label, statement: h.statement })),
    focusId: d.focusId,
    existingClaims: session.evidence.map((e) => e.claim).slice(0, 60)
  };

  const run = async (kind: string, fn: () => Promise<unknown>) => {
    setBusy(kind);
    try {
      return (await fn()) as Record<string, unknown>;
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const addCandidates = (rows: CandidateDto[], origin: string) => {
    if (!rows || rows.length === 0) {
      notify('没有提取到可用的候选证据');
      return;
    }
    const hypotheses = session.hypotheses;
    const baselineId = hypotheses.find((h) => h.isBaseline)?.id ?? hypotheses[0].id;
    mutate((s) => {
      for (const row of rows) {
        const lr: Record<string, number> = {};
        for (const h of s.hypotheses) lr[h.id] = 1;
        const focus = d.focusId;
        if (focus === baselineId) {
          for (const h of s.hypotheses) if (h.id !== baselineId) lr[h.id] = 1 / (row.lrForFocus || 1);
        } else {
          lr[focus] = row.lrForFocus || 1;
        }
        s.candidates.push({
          id: uid('c'),
          createdAt: new Date().toISOString(),
          claim: row.claim,
          detail: row.detail,
          kind: row.kind,
          provenance: {
            url: (row as unknown as { url?: string }).url,
            title: (row as unknown as { title?: string }).title,
            site: (row as unknown as { site?: string }).site,
            quote: row.quote,
            retrievedAt: new Date().toISOString(),
            searchQuery: origin
          },
          suggestedLr: lr,
          reason: row.reason,
          reliability: row.reliability,
          reliabilityReason: row.reliabilityReason,
          provenanceCheck: row.provenanceCheck,
          direction: row.direction,
          state: 'pending'
        });
      }
    });
    notify(`收到 ${rows.length} 条候选证据，请逐条确认`);
  };

  const logRun = (
    kind: 'search' | 'parse-link' | 'parse-paste' | 'alt-hypotheses',
    ok: boolean,
    extra: { error?: string; resultCount?: number; query?: string; url?: string } = {}
  ) => {
    mutate((s) => {
      s.aiLog.push({
        id: uid('a'),
        at: new Date().toISOString(),
        kind,
        ok,
        resultCount: extra.resultCount,
        error: extra.error,
        query: extra.query,
        url: extra.url,
        model: settings.llm.model
      });
    });
  };

  const searchEvidence = async () => {
    const res = (await run('search', () =>
      bridge.ai.search({ context: ctx, count: settings.search.count })
    )) as unknown as SearchResponse | null;
    if (!res) {
      logRun('search', false, { error: '调用失败' });
      return;
    }
    if (res.error) {
      logRun('search', false, { error: res.error });
      notify(res.error);
      return;
    }
    logRun('search', true, {
      resultCount: res.candidates?.length ?? 0,
      query: res.queries?.support?.[0]
    });
    addCandidates(res.candidates ?? [], 'AI 搜索');
  };

  const parseLink = async () => {
    if (!linkUrl.trim()) return;
    const res = (await run('link', () =>
      bridge.ai.parseLink({ context: ctx, url: linkUrl.trim() })
    )) as unknown as { candidates?: CandidateDto[]; error?: string } | null;
    if (!res) {
      logRun('parse-link', false, { error: '调用失败', url: linkUrl });
      return;
    }
    if (res.error) {
      logRun('parse-link', false, { error: res.error, url: linkUrl });
      notify(res.error);
      return;
    }
    logRun('parse-link', true, { resultCount: res.candidates?.length ?? 0, url: linkUrl });
    addCandidates(res.candidates ?? [], linkUrl.trim());
    setLinkUrl('');
    setPanel('none');
  };

  const parseText = async () => {
    if (!pasteText.trim()) return;
    const res = (await run('paste', () =>
      bridge.ai.parseText({ context: ctx, text: pasteText })
    )) as unknown as { candidates?: CandidateDto[]; error?: string } | null;
    if (!res) {
      logRun('parse-paste', false, { error: '调用失败' });
      return;
    }
    if (res.error) {
      logRun('parse-paste', false, { error: res.error });
      notify(res.error);
      return;
    }
    logRun('parse-paste', true, { resultCount: res.candidates?.length ?? 0 });
    addCandidates(res.candidates ?? [], '粘贴正文');
    setPasteText('');
    setPanel('none');
  };

  const askAlternatives = async () => {
    const res = (await run('alt', () => bridge.ai.alternatives({ context: ctx }))) as unknown as {
      alternatives?: AltHypothesis[];
      error?: string;
    } | null;
    if (!res) {
      logRun('alt-hypotheses', false, { error: '调用失败' });
      return;
    }
    if (res.error) {
      logRun('alt-hypotheses', false, { error: res.error });
      notify(res.error);
      return;
    }
    logRun('alt-hypotheses', true, { resultCount: res.alternatives?.length ?? 0 });
    setAlts(res.alternatives ?? []);
  };

  const adopt = (candidateId: string) => {
    mutate((s) => {
      const c = s.candidates.find((x) => x.id === candidateId);
      if (!c || c.state !== 'pending') return;
      const ev = createEvidence(s, {
        claim: c.claim,
        detail: c.detail,
        kind: c.kind,
        sourceType: c.provenance.searchQuery ? 'ai_search' : 'user',
        provenance: c.provenance,
        lr: c.suggestedLr,
        reliability: c.reliability,
        status: 'adopted'
      });
      s.evidence.push({ ...ev, lrInput: { mode: 'tier' } });
      c.state = 'adopted';
    });
    notify('已采纳；如果 AI 建议的似然比不对，点证据条目即可改');
  };

  const reject = (candidateId: string) => {
    mutate((s) => {
      const c = s.candidates.find((x) => x.id === candidateId);
      if (c) c.state = 'rejected';
    });
  };

  const keyReady = settings.llm.hasKey;

  return (
    <div className="col">
      <section className="card">
        <div className="card-head">
          <span className="card-title">AI 证据助手</span>
          {!keyReady && <span className="pill warn">未配置 Key</span>}
        </div>

        {!keyReady && (
          <div className="alert" style={{ marginBottom: 10 }}>
            还没有配置 DeepSeek API Key。填好后才能让 AI 搜证据、解析链接。
            <button className="btn small ghost" style={{ marginLeft: 6 }} onClick={() => setDialog('settings')}>
              去设置
            </button>
          </div>
        )}

        <div className="row wrap">
          <button
            className="btn primary"
            disabled={!keyReady || busy !== null}
            onClick={() => void searchEvidence()}
          >
            {busy === 'search' ? '搜索中…' : '帮我找证据'}
          </button>
          <button
            className="btn"
            disabled={!keyReady || busy !== null}
            onClick={() => setPanel(panel === 'link' ? 'none' : 'link')}
          >
            贴链接
          </button>
          <button
            className="btn"
            disabled={!keyReady || busy !== null}
            onClick={() => setPanel(panel === 'paste' ? 'none' : 'paste')}
          >
            贴正文
          </button>
          <button className="btn" disabled={!keyReady || busy !== null} onClick={() => void askAlternatives()}>
            {busy === 'alt' ? '思考中…' : '想备择假设'}
          </button>
        </div>

        {panel === 'link' && (
          <div className="stack" style={{ marginTop: 10 }}>
            <input
              placeholder="https://… 粘贴文章链接"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <div className="row">
              <button className="btn small primary" disabled={busy !== null} onClick={() => void parseLink()}>
                {busy === 'link' ? '解析中…' : '解析并提取证据'}
              </button>
              <span className="faint small">需要能抓到正文；打不开就改用"贴正文"。</span>
            </div>
          </div>
        )}

        {panel === 'paste' && (
          <div className="stack" style={{ marginTop: 10 }}>
            <textarea
              placeholder="把文章 / 报告 / 聊天记录正文粘贴到这里"
              value={pasteText}
              style={{ minHeight: 120 }}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <button className="btn small primary" disabled={busy !== null} onClick={() => void parseText()}>
              {busy === 'paste' ? '提取中…' : '提取候选证据'}
            </button>
          </div>
        )}

        {alts.length > 0 && (
          <div className="stack" style={{ marginTop: 12 }}>
            <div className="faint small">AI 建议的第三种解释（点击添加为竞争假设）</div>
            {alts.map((a, i) => (
              <div key={i} className="hyp">
                <div className="row between">
                  <strong>{a.label}</strong>
                  <button
                    className="btn small"
                    onClick={() => {
                      mutate((s) => {
                        const n = s.hypotheses.length;
                        const share = 1 / (n + 1);
                        s.hypotheses.forEach((h) => void (h.prior = h.prior * (1 - share)));
                        s.hypotheses.push({
                          id: uid('h'),
                          label: a.label,
                          statement: a.statement,
                          prior: share
                        });
                      });
                      setAlts(alts.filter((_, j) => j !== i));
                    }}
                  >
                    加为假设
                  </button>
                </div>
                <div className="small muted">{a.statement}</div>
                <div className="faint small">{a.why}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <span className="card-title">待确认（{pending.length}）</span>
          <span className="faint small">AI 只产候选，采纳才入链</span>
        </div>
        {pending.length === 0 && (
          <p className="faint small" style={{ margin: 0 }}>
            暂无候选。点"帮我找证据"后，AI 搜到的东西会先放在这里。
          </p>
        )}
        {pending.map((c) => (
          <CandidateCard key={c.id} candidate={c} onAdopt={adopt} onReject={reject} />
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <span className="card-title">AI 检索记录</span>
        </div>
        {session.aiLog.length === 0 ? (
          <p className="faint small" style={{ margin: 0 }}>
            还没有调用过 AI。
          </p>
        ) : (
          <table className="plain">
            <thead>
              <tr>
                <th>时间</th>
                <th>类型</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {[...session.aiLog]
                .sort((a, b) => b.at.localeCompare(a.at))
                .slice(0, 6)
                .map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.at).toLocaleTimeString('zh-CN', { hour12: false })}</td>
                    <td>{kindLabel(l.kind)}</td>
                    <td>{l.ok ? `${l.resultCount ?? 0} 条` : `失败：${l.error ?? '未知'}`}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    queries: '生成检索词',
    search: '联网搜索',
    extract: '证据提取',
    'parse-link': '链接解析',
    'parse-paste': '正文解析',
    'alt-hypotheses': '备择假设',
    'open-questions': '不确定点'
  };
  return map[kind] ?? kind;
}

function CandidateCard({
  candidate,
  onAdopt,
  onReject
}: {
  candidate: Session['candidates'][number];
  onAdopt: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const dirText = candidate.direction === 'support' ? '倾向支持' : candidate.direction === 'oppose' ? '倾向反对' : '中性';
  const check =
    candidate.provenanceCheck === 'verified'
      ? { text: '引文已核对', ok: true }
      : candidate.provenanceCheck === 'unverified'
        ? { text: '引文未定位，请人工核对', ok: false }
        : { text: '无引文', ok: false };

  return (
    <div className="hyp" style={{ marginBottom: 8 }}>
      <div className="row between">
        <strong style={{ fontSize: 13 }}>{candidate.claim}</strong>
        <span className={`pill ${candidate.direction === 'oppose' ? 'warn' : 'accent'}`}>{dirText}</span>
      </div>
      {candidate.provenance.quote && (
        <blockquote
          className="small"
          style={{
            margin: 0,
            paddingLeft: 8,
            borderLeft: '2px solid #e5e7eb',
            color: '#4b5563'
          }}
        >
          {candidate.provenance.quote.slice(0, 220)}
        </blockquote>
      )}
      <div className="faint small">
        {candidate.provenance.site ?? candidate.provenance.url ?? '来源未知'}
        {candidate.provenance.url && (
          <>
            {' · '}
            <span
              className="link"
              onClick={(e) => {
                e.stopPropagation();
                void bridge.app.openExternal(candidate.provenance.url!);
              }}
            >
              打开原文
            </span>
          </>
        )}
      </div>
      <div className="small muted">建议似然比 {candidate.suggestedLr ? '' : ''}{formatLr(candidate)}：{candidate.reason}</div>
      <div className="row between">
        <span className={`small ${check.ok ? 'faint' : ''}`} style={check.ok ? {} : { color: '#b45309' }}>
          {check.text} · 可信度{' '}
          {candidate.reliability === 'high' ? '高' : candidate.reliability === 'medium' ? '中' : '低'}
        </span>
        <div className="row">
          <button className="btn small" onClick={() => onReject(candidate.id)}>
            否决
          </button>
          <button className="btn small primary" onClick={() => onAdopt(candidate.id)}>
            采纳
          </button>
        </div>
      </div>
    </div>
  );
}

function formatLr(c: Session['candidates'][number]): string {
  const values = Object.values(c.suggestedLr ?? {});
  const nonBaseline = values.filter((v) => v !== 1);
  if (nonBaseline.length === 0) return '1 : 1';
  const v = nonBaseline[0];
  return v >= 1 ? `${v.toFixed(2)} : 1` : `1 : ${(1 / v).toFixed(2)}`;
}
