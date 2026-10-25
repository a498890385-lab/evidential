const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { registerIpc } = require('./ipc');

// 改名前的应用名。旧版本的数据目录挂在它下面，升级时要搬过来。
const LEGACY_APP_NAME = '贝叶斯论证工作台';

let mainWindow = null;

// 一次性迁移：只搬应用自己的 data/ 子目录。
// 不要整棵复制 userData —— 里面混着 Chromium 的 Session Storage 等运行时文件，
// 那些在启动时已被占用，拷不动会静默丢文件，也没必要搬。
function migrateLegacyData() {
  try {
    const userData = app.getPath('userData');
    const currentData = path.join(userData, 'data');
    const legacyData = path.join(app.getPath('appData'), LEGACY_APP_NAME, 'data');
    if (fs.existsSync(currentData) || !fs.existsSync(legacyData)) return;
    fs.mkdirSync(userData, { recursive: true });
    fs.cpSync(legacyData, currentData, { recursive: true });
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
