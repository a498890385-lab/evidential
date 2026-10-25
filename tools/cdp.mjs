// 极简 CDP 客户端：截图 / 执行 JS / 按文本点击，用于自动化验证 Electron 窗口
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9333';

async function pickTarget() {
  const list = await (await fetch(`${ENDPOINT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page' && /dist\/index\.html|localhost:5178/.test(t.url));
  if (!page) throw new Error('未找到应用页面 target');
  return page;
}

export async function connect() {
  const target = await pickTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { ws, send, target };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const { ws, send } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result?.value;
  };

  if (cmd === 'shot') {
    const out = args[0] || 'shot.png';
    await sleep(300);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log('saved', out);
  } else if (cmd === 'eval') {
    console.log(JSON.stringify(await evaluate(args.join(' '))));
  } else if (cmd === 'click') {
    const text = args.join(' ');
    const r = await evaluate(`(() => {
      const els = [...document.querySelectorAll('button, .tab, .link, select')];
      const el = els.find(e => (e.textContent || '').trim() === ${JSON.stringify(text)});
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'CLICKED';
    })()`);
    console.log(r);
    await sleep(600);
  } else if (cmd === 'wait') {
    await sleep(Number(args[0] || 500));
    console.log('waited');
  } else if (cmd === 'text') {
    console.log(await evaluate('document.body.innerText.slice(0, 4000)'));
  } else {
    console.log('usage: node tools/cdp.mjs shot|eval|click|text|wait ...');
  }
  ws.close();
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((err) => {
    console.error('ERR', err.message);
    process.exit(1);
  });
}
