import { connect } from './cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { ws, send } = await connect();
await send('Page.enable');
await send('Runtime.enable');

const errors = [];
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
  }
});

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || 'eval failed');
  return res.result?.value;
}
const clickText = async (t) => {
  const r = await evaluate(`(() => {
    const els=[...document.querySelectorAll('button,.tab')];
    const el=els.find(e=>(e.textContent||'').trim()===${JSON.stringify(t)});
    if(!el) return 'NOT_FOUND'; el.click(); return 'OK';
  })()`);
  await sleep(500);
  return r;
};

const out = {};
out.openReport = await clickText('导出报告');
await sleep(500);
out.clickMd = await clickText('导出 Markdown');
await sleep(1200);

out.openReport2 = await clickText('导出报告');
await sleep(500);
out.clickPdf = await clickText('导出 PDF');
await sleep(4000);

const dir = 'F:\\apps\\bayes\\test-export';
out.files = fs.existsSync(dir)
  ? fs.readdirSync(dir).map((f) => ({ name: f, bytes: fs.statSync(path.join(dir, f)).size }))
  : [];
out.errors = errors;
console.log(JSON.stringify(out, null, 2));
ws.close();
