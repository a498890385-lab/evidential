// 一条命令起开发环境：先起 vite（5178），等它就绪后再起 electron 指向它。
// 用法：npm run dev
import { spawn } from 'node:child_process';
import http from 'node:http';
import process from 'node:process';

const PORT = 5178;
const DEV_URL = `http://localhost:${PORT}`;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const children = [];

function run(command, args, env) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...(env || {}) },
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* 已经退出就忽略 */
    }
  }
  process.exit(code);
}

function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`vite 在 ${timeoutMs / 1000}s 内没有起来：${url}`));
          return;
        }
        setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run(npx, ['vite']);

try {
  await waitForServer(DEV_URL);
} catch (error) {
  console.error(error.message);
  shutdown(1);
}

const electron = run(npx, ['electron', '.'], { ELECTRON_START_URL: DEV_URL });
electron.on('exit', (code) => shutdown(code ?? 0));
