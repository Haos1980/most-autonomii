#!/usr/bin/env node
/**
 * Build-time only: bake HAOS-owned transport into www/native-config.json for Capacitor APK.
 * Never commit the output. Never log token values.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const www = path.join(root, 'www');
const envPath = path.join(root, 'bridge', '.env');
const statePath = path.join(root, 'bridge', 'state.json');
const outPath = path.join(www, 'native-config.json');

function loadDotEnv(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (k) out[k] = v;
  }
  return out;
}

fs.mkdirSync(www, { recursive: true });
const env = loadDotEnv(envPath);
let chatId = null;
try {
  const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  chatId = st.chat_id != null ? String(st.chat_id) : null;
} catch (_) {}

let ghToken = '';
try {
  ghToken = execSync('gh auth token', { encoding: 'utf8' }).trim();
} catch (_) {
  ghToken = '';
}

const cfg = {
  v: 1,
  tgBotToken: env.TELEGRAM_BOT_TOKEN || '',
  tgChatId: chatId || '',
  ghToken: ghToken || '',
  ghRepo: 'Haos1980/most-autonomii',
  bakedAt: new Date().toISOString(),
};

fs.writeFileSync(outPath, JSON.stringify(cfg) + '\n', { mode: 0o600 });
const hasTg = !!(cfg.tgBotToken && cfg.tgChatId);
const hasGh = !!cfg.ghToken;
console.log(
  'native-config.json written (secrets redacted): tg=' +
    (hasTg ? 'yes' : 'no') +
    ' ghWrite=' +
    (hasGh ? 'yes' : 'no') +
    ' chatId=' +
    (cfg.tgChatId ? 'set' : 'missing')
);
if (!hasTg && !hasGh) {
  console.warn('WARN: no native transport — APK sends will be local-only');
  process.exitCode = 0;
}
