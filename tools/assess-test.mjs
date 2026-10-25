import { connect } from './cdp.mjs';
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { ws, send } = await connect();
await send('Page.enable');
await send('Runtime.enable');

const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description);
});

async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description));
  return r.result?.value;
}
const click = async (t) => {
  const r = await ev(`(() => {
    const els=[...document.querySelectorAll('button,.tab')];
    const el=els.find(e=>(e.textContent||'').trim()===${JSON.stringify(t)});
    if(!el) return 'NOT_FOUND'; el.click(); return 'OK';
  })()`);
  await sleep(500);
  return r;
};

const out = {};
// 填结论
out.fill = await ev(`(() => {
  const ta = document.querySelector('.dialog textarea');
  const inp = document.querySelector('.dialog input');
  if (!ta) return 'NO_DIALOG';
  const setTa = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
  setTa.call(ta, '证据不足，暂不建议投入下一轮');
  ta.dispatchEvent(new Event('input',{bubbles:true}));
  if (inp) {
    const setIn = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setIn.call(inp, '等 11 月续约率数据出来再说');
    inp.dispatchEvent(new Event('input',{bubbles:true}));
  }
  return 'FILLED';
})()`);
out.save = await click('保存这次判断');
await sleep(800);

// 打开报告看第 9 节
await click('导出报告');
await sleep(600);
out.previewHasAssessment = await ev(`document.querySelector('pre')?.textContent.includes('暂不建议投入下一轮')`);
out.previewHasSection9 = await ev(`document.querySelector('pre')?.textContent.includes('## 9. 判断记录')`);
await click('导出 Markdown');
await sleep(1200);
await click('导出报告');
await sleep(500);
await click('导出 PDF');
await sleep(4000);

const dir = 'F:\\apps\\bayes\\test-export';
out.files = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => ({ n: f, kb: Math.round(fs.statSync(dir + '\\' + f).size / 1024) })) : [];
out.errors = errors;
console.log(JSON.stringify(out, null, 2));
ws.close();
