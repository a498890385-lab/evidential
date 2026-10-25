const { safeStorage } = require('electron');

/** 加密 Key；不可用时退回 base64（仍不落明文，但强度弱，仅作兜底） */
function encryptKey(plain) {
  if (!plain) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(plain).toString('base64');
    }
  } catch (err) {
    console.error('[secrets] encrypt failed', err);
  }
  return 'b64:' + Buffer.from(plain, 'utf8').toString('base64');
}

function decryptKey(stored) {
  if (!stored) return '';
  try {
    if (stored.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    }
    if (stored.startsWith('b64:')) {
      return Buffer.from(stored.slice(4), 'base64').toString('utf8');
    }
  } catch (err) {
    console.error('[secrets] decrypt failed', err);
  }
  return '';
}

module.exports = { encryptKey, decryptKey };
