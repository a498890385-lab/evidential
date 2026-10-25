const { ipcMain, dialog, shell, app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const storage = require('./storage');
const { encryptKey } = require('./secrets');

// 自动化测试用：设置该环境变量后，所有"另存为"直接写入该目录，不弹系统对话框
const TEST_EXPORT_DIR = process.env.BAYES_TEST_EXPORT_DIR || '';

function pickSavePath(win, opts) {
  if (TEST_EXPORT_DIR) {
    fs.mkdirSync(TEST_EXPORT_DIR, { recursive: true });
    return Promise.resolve(path.join(TEST_EXPORT_DIR, path.basename(opts.defaultPath || 'out.bin')));
  }
  return dialog.showSaveDialog(win, opts).then((r) => (r.canceled ? null : r.filePath));
}

function registerIpc(getWin) {
  // ---------- 会话 ----------
  ipcMain.handle('session:list', () => storage.listSessions());
  ipcMain.handle('session:load', (_e, id) => storage.loadSession(String(id)));
  ipcMain.handle('session:save', (_e, session) => storage.saveSession(session));
  ipcMain.handle('session:delete', (_e, id) => storage.deleteSession(String(id)));

  ipcMain.handle('session:exportFile', async (_e, session) => {
    const win = getWin();
    const filePath = await pickSavePath(win, {
      title: '导出会话文件',
      defaultPath: path.join(storage.exportsDir(), `${session.title || '会话'}.bayes.json`),
      filters: [{ name: 'Bayes 会话', extensions: ['json'] }]
    });
    if (!filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
    return { ok: true, path: filePath };
  });

  ipcMain.handle('session:importFile', async () => {
    const win = getWin();
    const res = await dialog.showOpenDialog(win, {
      title: '导入会话文件',
      properties: ['openFile'],
      filters: [{ name: 'Bayes 会话', extensions: ['json'] }]
    });
    if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true };
    const raw = fs.readFileSync(res.filePaths[0], 'utf8');
    const session = JSON.parse(raw);
    storage.saveSession(session);
    return { ok: true, session };
  });

  // ---------- 设置 ----------
  ipcMain.handle('settings:get', () => {
    const s = storage.readSettingsFile();
    return {
      llm: {
        baseUrl: s.llm && s.llm.baseUrl ? s.llm.baseUrl : 'https://api.deepseek.com',
        model: s.llm && s.llm.model ? s.llm.model : 'deepseek-flash',
        hasKey: Boolean(s.llm && s.llm.apiKeyEnc)
      },
      search: {
        provider: (s.search && s.search.provider) || 'deepseek',
        count: (s.search && s.search.count) || 8,
        hasKey: Boolean(s.search && s.search.apiKeyEnc)
      },
      ui: { theme: (s.ui && s.ui.theme) || 'light' }
    };
  });

  ipcMain.handle('settings:set', (_e, patch) => {
    const cur = storage.readSettingsFile();
    const next = Object.assign({}, cur);
    if (patch.llm) {
      next.llm = Object.assign({}, cur.llm, {
        baseUrl: patch.llm.baseUrl != null ? patch.llm.baseUrl : cur.llm && cur.llm.baseUrl,
        model: patch.llm.model != null ? patch.llm.model : cur.llm && cur.llm.model
      });
      if (typeof patch.llm.apiKey === 'string') {
        next.llm.apiKeyEnc = patch.llm.apiKey === '' ? '' : encryptKey(patch.llm.apiKey);
      }
    }
    if (patch.search) {
      next.search = Object.assign({}, cur.search, {
        provider: patch.search.provider != null ? patch.search.provider : cur.search && cur.search.provider,
        count: patch.search.count != null ? patch.search.count : cur.search && cur.search.count
      });
      if (typeof patch.search.apiKey === 'string') {
        next.search.apiKeyEnc = patch.search.apiKey === '' ? '' : encryptKey(patch.search.apiKey);
      }
    }
    if (patch.ui) next.ui = Object.assign({}, cur.ui, patch.ui);
    storage.writeSettingsFile(next);
    return { ok: true };
  });

  // ---------- 报告 ----------
  ipcMain.handle('report:markdown', async (_e, { defaultName, markdown }) => {
    const win = getWin();
    const filePath = await pickSavePath(win, {
      title: '导出 Markdown 报告',
      defaultPath: path.join(storage.exportsDir(), defaultName || '贝叶斯论证报告.md'),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (!filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, markdown, 'utf8');
    return { ok: true, path: filePath };
  });

  ipcMain.handle('report:pdf', async (_e, { defaultName, html }) => {
    const win = getWin();
    const filePath = await pickSavePath(win, {
      title: '导出 PDF 报告',
      defaultPath: path.join(storage.exportsDir(), defaultName || '贝叶斯论证报告.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (!filePath) return { ok: false, canceled: true };

    const tmp = path.join(os.tmpdir(), `bayes-report-${Date.now()}.html`);
    fs.writeFileSync(tmp, html, 'utf8');
    const printer = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, sandbox: true }
    });
    try {
      await printer.loadFile(tmp);
      const pdf = await printer.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'custom', top: 0.7, bottom: 0.7, left: 0.7, right: 0.7 }
      });
      fs.writeFileSync(filePath, pdf);
      return { ok: true, path: filePath };
    } finally {
      printer.destroy();
      fs.rmSync(tmp, { force: true });
    }
  });

  // ---------- 其他 ----------
  ipcMain.handle('app:openExternal', (_e, url) => {
    if (/^https?:/i.test(String(url))) shell.openExternal(String(url));
    return { ok: true };
  });
  ipcMain.handle('app:revealPath', (_e, p) => {
    shell.showItemInFolder(String(p));
    return { ok: true };
  });
  ipcMain.handle('app:version', () => app.getVersion());

  // ---------- AI（P3） ----------
  try {
    const { registerAiIpc } = require('./ai-ipc');
    registerAiIpc();
  } catch (err) {
    console.error('[ipc] AI 模块加载失败：', err);
  }
}

module.exports = { registerIpc };
