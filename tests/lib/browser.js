// Launches headless Chromium for visual and end-to-end checks.
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const base = path.join(os.homedir(), '.cache/ms-playwright');
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    const p = path.join(base, d, 'chrome-headless-shell-linux64/chrome-headless-shell');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

async function launch() {
  return chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
}

module.exports = { launch };
