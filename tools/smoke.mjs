// 冒烟测试：验证 加证据 → 概率重算 → 报告预览 的完整链路
import { connect } from './cdp.mjs';
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { ws, send } = await connect();
await send('Page.enable');
await send('Runtime.enable');

const errors = [];
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails?.exception?.description || 'unknown exception');
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
});

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails.exception?.description || res.exceptionDetails));
  return res.result?.value;
}
const text = () => evaluate('document.body.innerText');
const clickText = async (t) => {
  const r = await evaluate(`(() => {
    const els=[...document.querySelectorAll('button,.tab,.tier,.link')];
    const el=els.find(e=>(e.textContent||'').trim()===${JSON.stringify(t)});
    if(!el) return 'NOT_FOUND'; el.click(); return 'OK';
  })()`);
  await sleep(400);
  return r;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(name, Buffer.from(s.data, 'base64'));
};

const out = {};

// 1. 打开示例（若当前为空态）
let body = await text();
if (body.includes('从一个待验证的判断开始')) {
  await clickText('用示例数据看看');
  await sleep(900);
  body = await text();
}
out.hasDemo = body.includes('示例：SaaS 项目能否盈利');

// 2. 记录当前概率与证据数
const before = await evaluate(`(() => ({
  prob: document.querySelector('.hero-value')?.textContent,
  evCount: document.querySelectorAll('.ev').length
}))()`);
out.before = before;

// 3. 加一条证据
await clickText('+ 加证据');
await sleep(400);
const filled = await evaluate(`(() => {
  const t = document.querySelector('.drawer textarea');
  if (!t) return 'NO_DRAWER';
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(t, '测试证据：核心客户续约率环比下降 20%');
  t.dispatchEvent(new Event('input', { bubbles: true }));
  return t.value;
})()`);
out.filled = filled;

// 选择"更不可能"档
out.tier = await evaluate(`(() => {
  const tiers=[...document.querySelectorAll('.drawer .tier')];
  const t=tiers.find(e=>e.textContent.includes('更不可能'));
  if(!t) return 'NO_TIER'; t.click(); return 'OK';
})()`);
await sleep(300);
await shot('F:\\apps\\bayes\\shot-drawer.png');

out.save = await clickText('加入证据链');
await sleep(900);

const after = await evaluate(`(() => ({
  prob: document.querySelector('.hero-value')?.textContent,
  evCount: document.querySelectorAll('.ev').length,
  toast: document.querySelector('.toast')?.textContent || null
}))()`);
out.after = after;

// 4. 打开报告预览
out.reportOpen = await clickText('导出报告');
await sleep(700);
out.reportHasSections = await evaluate(`document.body.innerText.includes('## 1. 结论摘要') || document.querySelector('pre')?.textContent.includes('结论摘要')`);
await shot('F:\\apps\\bayes\\shot-report.png');

// 5. 关闭
await clickText('关闭');
await sleep(400);
await shot('F:\\apps\\bayes\\shot-after.png');

out.errors = errors;
console.log(JSON.stringify(out, null, 2));
ws.close();
