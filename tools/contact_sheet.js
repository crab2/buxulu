// Renders every sprite and backdrop to a PNG so the art can be reviewed at a glance.
const path = require('path');
const fs = require('fs');
const { bundle, ROOT } = require('./bundle.js');
const { launch } = require('../tests/lib/browser.js');

(async () => {
  const entry = path.join(ROOT, 'tools/contact_entry.js');
  const shim = fs.readFileSync(path.join(ROOT, 'tools/wx-shim.js'), 'utf8');
  const code = bundle(entry);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
  await page.setContent('<!doctype html><meta charset=utf8><body style="margin:0;background:#556"><div id=phone style="display:none"></div><div id=out></div></body>');
  await page.addScriptTag({ content: 'window.__SHEET__=' + JSON.stringify(process.argv[2] || 'all') });
  await page.addScriptTag({ content: shim });
  await page.addScriptTag({ content: code.replace(/,window,document,location,localStorage,navigator,atob,btoa,Image,Audio,fetch,XMLHttpRequest,performance\)/g, ')') });
  await page.waitForFunction('window.__DONE__ === true', { timeout: 30000 });
  const out = process.argv[3] || 'sheet.png';
  await page.locator('#out').screenshot({ path: out });
  await browser.close();
  console.log('wrote', out);
})().catch((e) => { console.error(e); process.exit(1); });
