const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { registerIpc } = require('./ipc');

// 改名前的应用名。旧版本的数据目录挂在它下面，升级时要搬过来。
const LEGACY_APP_NAME = '贝叶斯论证工作台';

let mainWindow = null;

// 一次性迁移：新目录还没有 data/、而旧目录有时，整棵复制过来。
// 用 cpSync 而不是 rename，避免跨盘/占用时失败；失败只告警，不阻塞启动。
function migrateLegacyData() {
  try {
    const userData = app.getPath('userData');
    const currentData = path.join(userData, 'data');
    const legacyRoot = path.join(app.getPath('appData'), LEGACY_APP_NAME);
    if (fs.existsSync(currentData) || !fs.existsSync(legacyRoot)) return;
    fs.mkdirSync(userData, { recursive: true });
    fs.cpSync(legacyRoot, userData, { recursive: true });
  } catch (error) {
    console.warn('[migrate] 迁移旧数据失败：', error.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 700,
    backgroundColor: '#f6f7f9',
    title: '依证推事',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  migrateLegacyData();
  registerIpc(() => mainWindow);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
