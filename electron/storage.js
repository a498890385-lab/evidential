const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

function rootDir() {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionsDir() {
  const dir = path.join(rootDir(), 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function exportsDir() {
  const dir = path.join(app.getPath('userData'), 'exports');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function settingsPath() {
  return path.join(rootDir(), 'settings.json');
}

/** 原子写：tmp → fsync → rename */
function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function backupSession(session) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const dir = path.join(rootDir(), 'backups', day);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${session.id}.json`);
    if (!fs.existsSync(file)) writeJsonAtomic(file, session);
    // 只保留最近 14 天
    const base = path.join(rootDir(), 'backups');
    const days = fs
      .readdirSync(base)
      .filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n))
      .sort();
    while (days.length > 14) {
      const old = days.shift();
      fs.rmSync(path.join(base, old), { recursive: true, force: true });
    }
  } catch (err) {
    console.error('[storage] backup failed', err);
  }
}

function saveSession(session) {
  const file = path.join(sessionsDir(), `${session.id}.json`);
  backupSession(session);
  writeJsonAtomic(file, { ...session, updatedAt: new Date().toISOString() });
  return { ok: true, path: file };
}

function listSessions() {
  const dir = sessionsDir();
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      out.push({
        id: raw.id,
        title: raw.title,
        question: raw.question,
        status: raw.status,
        updatedAt: raw.updatedAt,
        createdAt: raw.createdAt,
        evidenceCount: (raw.evidence || []).filter((e) => e.status === 'adopted').length
      });
    } catch {
      // 跳过损坏文件
    }
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return out;
}

function loadSession(id) {
  const file = path.join(sessionsDir(), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function deleteSession(id) {
  const file = path.join(sessionsDir(), `${id}.json`);
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  return { ok: true };
}

function readSettingsFile() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeSettingsFile(data) {
  writeJsonAtomic(settingsPath(), data);
  return { ok: true };
}

module.exports = {
  rootDir,
  sessionsDir,
  exportsDir,
  settingsPath,
  readSettingsFile,
  writeSettingsFile,
  saveSession,
  listSessions,
  loadSession,
  deleteSession,
  writeJsonAtomic
};
