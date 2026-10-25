const { ipcMain } = require('electron');
const storage = require('./storage');
const { decryptKey } = require('./secrets');

function readConfig() {
  const s = storage.readSettingsFile();
  return {
    llm: {
      baseUrl: (s.llm && s.llm.baseUrl) || 'https://api.deepseek.com',
      model: (s.llm && s.llm.model) || 'deepseek-flash',
      key: decryptKey(s.llm && s.llm.apiKeyEnc)
    },
    search: {
      provider: (s.search && s.search.provider) || 'deepseek',
      count: (s.search && s.search.count) || 8,
      key: decryptKey(s.search && s.search.apiKeyEnc)
    }
  };
}

function fail(msg) {
  const err = new Error(msg);
  err.userFacing = true;
  throw err;
}

async function httpJson(url, { method = 'GET', headers = {}, body, timeout = 60000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    const text = await res.text();
    if (!res.ok) {
      const code = res.status;
      if (code === 401 || code === 403) fail('API Key 无效或没有权限（401/403）');
      if (code === 429) fail('请求过于频繁，稍后再试（429）');
      if (code === 402) fail('账户余额不足（402）');
      fail(`请求失败 ${code}：${text.slice(0, 200)}`);
    }
    return JSON.parse(text);
  } catch (err) {
    if (err.name === 'AbortError') fail('请求超时（60 秒）');
    if (err.userFacing) throw err;
    fail(`网络错误：${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function callLlm({ system, user, json = true, temperature = 0.2 }) {
  const cfg = readConfig();
  if (!cfg.llm.key) fail('还没有配置 DeepSeek API Key，请到设置里填写');
  const url = `${cfg.llm.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const data = await httpJson(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.llm.key}` },
    body: {
      model: cfg.llm.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      stream: false
    },
    timeout: 90000
  });
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) fail('模型没有返回内容');
  return { content, usage: data.usage };
}

function parseJson(content, label) {
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fallthrough */
      }
    }
    fail(`${label}：模型返回的不是合法 JSON`);
  }
}

async function searchWeb(query, count) {
  const cfg = readConfig();
  if (cfg.search.provider === 'bocha') {
    if (!cfg.search.key) fail('还没有配置博查 API Key');
    const data = await httpJson('https://api.bochaai.com/v1/web-search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.search.key}` },
      body: { query, count, summary: true, freshness: 'noLimit' },
      timeout: 30000
    });
    const pages =
      (data && data.data && data.data.webPages && data.data.webPages.value) || [];
    return pages.map((p) => ({
      title: p.name,
      url: p.url,
      snippet: p.snippet || '',
      summary: p.summary || '',
      content: p.summary || p.snippet || '',
      site: p.siteName,
      publishedAt: p.datePublished
    }));
  }

  // DeepSeek 自带搜索
  if (!cfg.llm.key) fail('还没有配置 DeepSeek API Key');
  const url = `${cfg.llm.baseUrl.replace(/\/+$/, '')}/v1/tools/search`;
  const data = await httpJson(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.llm.key}` },
    body: { query, count, need_content: true },
    timeout: 40000
  });
  const results = (data && data.results) || [];
  return results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet || '',
    summary: r.summary || '',
    content: r.content || r.summary || r.snippet || '',
    site: r.site_name || undefined,
    publishedAt: r.date || undefined,
    authority: typeof r.authority === 'number' ? r.authority : undefined,
    score: r.rerank_score
  }));
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchPageText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36'
      }
    });
    if (!res.ok) fail(`网页抓取失败：HTTP ${res.status}`);
    const html = await res.text();
    return stripHtml(html).slice(0, 40000);
  } catch (err) {
    if (err.name === 'AbortError') fail('网页抓取超时');
    if (err.userFacing) throw err;
    fail(`网页抓取失败：${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeForMatch(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/[“”"'‘’]/g, '')
    .replace(/[，。；：！？、,.!?;:]/g, '')
    .toLowerCase();
}

function verifyQuote(quote, sourceText) {
  if (!quote || !sourceText) return 'missing';
  const q = normalizeForMatch(quote);
  if (q.length < 6) return 'unverified';
  return normalizeForMatch(sourceText).includes(q) ? 'verified' : 'unverified';
}

function hypothesisBlock(context) {
  return (context.hypotheses || [])
    .map((h, i) => `${i + 1}. id=${h.id} 名称=${h.label} 陈述=${h.statement || '（未填）'}`)
    .join('\n');
}

const SYS_QUERY = `你是一个严谨的研究助理，任务是为一个待验证的假设生成网页检索词。
要求：
1. 必须同时生成支持方向与反对方向的检索词，各 2-3 条；
2. 每条检索词 ≤ 30 个字，像真实搜索框里会输入的内容，不要写完整句子；
3. 聚焦"尚未被已有证据覆盖"的角度（政策、财报、客户口碑、行业数据、失败案例等）；
4. 不要与已有证据重复。
只输出 JSON：{"support":[{"query":"…","angle":"…"}],"oppose":[{"query":"…","angle":"…"}]}`;

const SYS_EXTRACT = `你是一个极其严格的证据提取器。给定一段网页内容和一个待验证的假设集合，请提取其中与假设相关、且可以判断真假的事实性证据。
硬性要求：
1. quote 必须是原文中逐字出现的片段（10-120 字），不得改写、不得拼接；
2. claim 是一句能判真假的命题，不要把评论/观点当事实；
3. lrForFocus 表示"该证据在焦点假设成立时出现的可能性，是不成立时的几倍"，只能取 0.2 / 0.5 / 1 / 2 / 5 之一；
4. reason 必须说明"在假设为真与为假两种世界里，这条证据的常见度差别"，禁止写"这条证据支持/反对该假设"；
5. 与假设无关的内容不要提取；没有可用证据就返回空数组；
6. reliability: high=官方/原始数据/同行评审，medium=正规媒体报道，low=自媒体/匿名/传闻。
只输出 JSON：{"candidates":[{"claim":"…","detail":"…","kind":"observation|statistic|testimony|document|inference","quote":"…","direction":"support|oppose|neutral","lrForFocus":2,"reason":"…","reliability":"high|medium|low","reliabilityReason":"…"}]}`;

function buildContext(context) {
  const existing = (context.existingClaims || []).map((c, i) => `${i + 1}. ${c}`).join('\n');
  return `待验证的问题：${context.question}

竞争假设：
${hypothesisBlock(context)}

焦点假设 id：${context.focusId}

已采纳的证据（避免重复）：
${existing || '（暂无）'}`;
}

async function generateQueries(context) {
  const { content } = await callLlm({
    system: SYS_QUERY,
    user: buildContext(context),
    temperature: 0.4
  });
  const data = parseJson(content, '生成检索词');
  return {
    support: (data.support || []).slice(0, 3),
    oppose: (data.oppose || []).slice(0, 3)
  };
}

async function extractFromSources(context, sources) {
  if (sources.length === 0) return { candidates: [] };
  const blocks = sources
    .map(
      (s, i) =>
        `【来源 ${i + 1}】标题：${s.title || ''}\nURL：${s.url || ''}\n站点：${s.site || ''}\n正文/摘要：\n${(s.content || s.summary || s.snippet || '').slice(0, 3500)}`
    )
    .join('\n\n');

  const { content, usage } = await callLlm({
    system: SYS_EXTRACT,
    user: `${buildContext(context)}\n\n待提取的网页内容：\n${blocks}`,
    temperature: 0.1
  });
  const data = parseJson(content, '证据提取');
  const rows = Array.isArray(data.candidates) ? data.candidates : [];

  const out = [];
  for (const row of rows) {
    const src = sources.find((s) => normalizeForMatch(s.content || s.summary || '').includes(normalizeForMatch(row.quote || '').slice(0, 20))) || sources[0];
    const check = verifyQuote(row.quote, src.content || src.summary || src.snippet || '');
    const lr = [0.2, 0.5, 1, 2, 5].includes(Number(row.lrForFocus)) ? Number(row.lrForFocus) : 1;
    out.push({
      claim: String(row.claim || '').slice(0, 200),
      detail: row.detail ? String(row.detail).slice(0, 500) : undefined,
      kind: ['observation', 'statistic', 'testimony', 'document', 'inference'].includes(row.kind) ? row.kind : 'observation',
      quote: row.quote ? String(row.quote).slice(0, 500) : undefined,
      url: src.url,
      title: src.title,
      site: src.site,
      direction: ['support', 'oppose', 'neutral'].includes(row.direction) ? row.direction : 'neutral',
      lrForFocus: lr,
      reason: String(row.reason || '').slice(0, 400),
      reliability: ['high', 'medium', 'low'].includes(row.reliability) ? row.reliability : 'low',
      reliabilityReason: row.reliabilityReason ? String(row.reliabilityReason).slice(0, 120) : undefined,
      provenanceCheck: check
    });
  }
  return { candidates: out, usage };
}

function dedupeSources(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    const key = (s.url || '').replace(/[#?].*$/, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

async function runSearchFlow(context) {
  const cfg = readConfig();
  const queries = await generateQueries(context);
  const all = [...(queries.support || []), ...(queries.oppose || [])].slice(0, 5);

  const results = [];
  for (const q of all) {
    try {
      const r = await searchWeb(q.query, cfg.search.count);
      results.push(...r);
    } catch (err) {
      // 单条查询失败不影响整体
      if (err.userFacing) throw err;
    }
  }

  const sources = dedupeSources(results)
    .filter((s) => (s.content || s.summary || s.snippet || '').length > 80)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 6);

  if (sources.length === 0) {
    return { candidates: [], queries, searched: results.length, error: '搜索没有返回可用正文，换个关键词或改用"贴正文"' };
  }

  const extracted = await extractFromSources(context, sources);
  return {
    candidates: extracted.candidates,
    queries,
    searched: results.length,
    usage: extracted.usage
  };
}

function registerAiIpc() {
  ipcMain.handle('ai:search', async (_e, { context, count }) => {
    try {
      if (count) {
        // 允许前端覆盖条数（不写回设置）
      }
      return await runSearchFlow(context);
    } catch (err) {
      return { candidates: [], error: err.message };
    }
  });

  ipcMain.handle('ai:parseLink', async (_e, { context, url }) => {
    try {
      if (!/^https?:\/\//i.test(String(url))) fail('链接必须以 http(s):// 开头');
      const text = await fetchPageText(url);
      const extracted = await extractFromSources(context, [
        { title: url, url, content: text, site: new URL(url).hostname }
      ]);
      return extracted;
    } catch (err) {
      return { candidates: [], error: err.message };
    }
  });

  ipcMain.handle('ai:parseText', async (_e, { context, text }) => {
    try {
      if (!text || text.trim().length < 50) fail('粘贴的正文太短，至少 50 字');
      const extracted = await extractFromSources(context, [
        { title: '用户粘贴的正文', url: '', content: String(text).slice(0, 40000) }
      ]);
      return extracted;
    } catch (err) {
      return { candidates: [], error: err.message };
    }
  });

  ipcMain.handle('ai:alternatives', async (_e, { context }) => {
    try {
      const { content } = await callLlm({
        system: `你是反确认偏误的审查员。给定一个待验证的假设和现有证据，提出 1-3 个"第三种解释"——能同样解释现有证据、但用户可能没想到的竞争假设。
只输出 JSON：{"alternatives":[{"label":"≤10字","statement":"完整陈述","why":"为什么它也能解释现有证据"}]}`,
        user: buildContext(context),
        temperature: 0.6
      });
      const data = parseJson(content, '备择假设');
      return { alternatives: (data.alternatives || []).slice(0, 3) };
    } catch (err) {
      return { alternatives: [], error: err.message };
    }
  });

  ipcMain.handle('ai:openQuestions', async (_e, { context }) => {
    try {
      const { content } = await callLlm({
        system: `你是论证审查员。给定假设、证据链，列出 3-6 个"尚未被验证的关键点"：还缺哪个方向的数据、哪个关键变量没验证、哪条证据被推翻影响最大。每条一句话。
只输出 JSON：{"questions":["…"]}`,
        user: buildContext(context),
        temperature: 0.5
      });
      const data = parseJson(content, '剩余不确定点');
      return { questions: (data.questions || []).slice(0, 6) };
    } catch (err) {
      return { questions: [], error: err.message };
    }
  });

  ipcMain.handle('ai:query', async (_e, { context }) => {
    try {
      return await generateQueries(context);
    } catch (err) {
      return { support: [], oppose: [], error: err.message };
    }
  });
}

module.exports = { registerAiIpc };
