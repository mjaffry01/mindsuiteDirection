'use strict';
// Encrypts secrets (reps' OpenRouter keys) before they are written to disk,
// using AES-256-GCM. The master key comes from SECRET_KEY, or is generated
// once and kept in data/.secret-key, readable only by the server's user.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadMasterKey(dataDir, fromEnv) {
  if (fromEnv) return crypto.createHash('sha256').update(String(fromEnv)).digest();
  const file = path.join(dataDir, '.secret-key');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
}

function createVault(dataDir, fromEnv) {
  const key = loadMasterKey(dataDir, fromEnv);
  return {
    seal(plain) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
      return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
    },
    open(box) {
      if (!box) return null;
      try {
        const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
        d.setAuthTag(Buffer.from(box.tag, 'base64'));
        return Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8');
      } catch {
        return null; // wrong master key or tampered data
      }
    },
  };
}

module.exports = { createVault };
