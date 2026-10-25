/** 极简 Markdown → HTML，只覆盖本应用报告用到的语法 */
export function mdToHtml(md: string): string {
  const inline = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  const lines = md.split('\n');
  const out: string[] = [];
  let tableBuf: string[] = [];
  let listBuf: string[] = [];

  const flushTable = () => {
    if (tableBuf.length === 0) return;
    const rows = tableBuf.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    const header = rows[0];
    const body = rows.slice(2);
    out.push('<table>');
    out.push(`<thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`);
    out.push(`<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`);
    out.push('</table>');
    tableBuf = [];
  };
  const flushList = () => {
    if (listBuf.length === 0) return;
    out.push(`<ul>${listBuf.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`);
    listBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('|')) {
      flushList();
      tableBuf.push(line);
      continue;
    }
    flushTable();
    if (/^\s*[-*]\s+/.test(line)) {
      listBuf.push(line.replace(/^\s*[-*]\s+/, ''));
      continue;
    }
    flushList();

    if (line.startsWith('### ')) out.push(`<h3>${inline(line.slice(4))}</h3>`);
    else if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith('# ')) out.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (line.startsWith('> ')) out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    else if (line.startsWith('---')) out.push('<hr/>');
    else if (line.trim() === '') out.push('');
    else out.push(`<p>${inline(line)}</p>`);
  }
  flushTable();
  flushList();
  return out.join('\n');
}

export function reportHtml(title: string, md: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><title>${title}</title>
<style>
  body{font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;color:#111827;font-size:12.5px;line-height:1.62;margin:0;padding:0 4mm;}
  h1{font-size:22px;margin:6px 0 12px;letter-spacing:-.01em}
  h2{font-size:16px;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}
  h3{font-size:13.5px;margin:14px 0 6px}
  p{margin:5px 0}
  ul{margin:4px 0;padding-left:18px}
  li{margin:2px 0}
  blockquote{margin:6px 0;padding:6px 10px;border-left:3px solid #cbd5e1;background:#f8fafc;color:#374151}
  table{width:100%;border-collapse:collapse;margin:8px 0;font-size:11.5px}
  th,td{border:1px solid #e5e7eb;padding:4px 6px;text-align:left;vertical-align:top}
  th{background:#f8fafc;color:#4b5563;font-weight:600}
  code{background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:11.5px}
  hr{border:none;border-top:1px solid #e5e7eb;margin:14px 0}
  strong{font-weight:600}
  @page{margin:16mm 14mm}
</style></head><body>${mdToHtml(md)}</body></html>`;
}
