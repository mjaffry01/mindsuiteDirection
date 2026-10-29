'use strict';
const fs = require('fs');
const path = require('path');

// Read settings from a .env file next to this file, if there is one.
// Values already set in the environment win over the file.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const { createApp } = require('./src/app');

const port = Number(process.env.PORT) || 3000;
const app = createApp();
app.listen(port, () => {
  console.log(`MindSuite app running at http://localhost:${port}`);
  // Never print the key itself.
  const key = process.env.OPENROUTER_API_KEY;
  console.log(key
    ? `AI: on, using ${process.env.OPENROUTER_MODEL || 'openrouter/auto'} through OpenRouter (key ending …${key.slice(-4)})`
    : 'AI: no company key. Reps can add their own OpenRouter key under My AI, or set OPENROUTER_API_KEY in .env for everyone.');
  if (!process.env.APP_USERS && !process.env.APP_USER) console.log('Sign-in: off. Add APP_USERS to .env so each rep has their own account and AI settings.');
  if (process.env.BRAVE_SEARCH_API_KEY) console.log('Lead engine: Brave News Search is on.');
});
