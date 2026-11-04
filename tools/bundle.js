#!/usr/bin/env node
// Packs the mini-game source into a single self-contained web page (dist/preview/index.html).
// Browser globals are shadowed with undefined inside every module, so accidental use of an API
// that does not exist in the WeChat runtime fails here instead of on a phone.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BLOCKED = ['window', 'document', 'location', 'localStorage', 'navigator', 'atob', 'btoa', 'Image', 'Audio', 'fetch', 'XMLHttpRequest', 'performance'];

function collect(entry) {
  const mods = new Map();
  const visit = (abs) => {
    if (mods.has(abs)) return;
    const src = fs.readFileSync(abs, 'utf8');
    const deps = {};
    mods.set(abs, { src, deps });
    const re = /require\('([^']+)'\)/g;
    let m;
    while ((m = re.exec(src))) {
      const dep = path.resolve(path.dirname(abs), m[1]);
      deps[m[1]] = dep;
      visit(dep);
    }
  };
  visit(entry);
  return mods;
}

function bundle(entry) {
  const mods = collect(entry);
  const ids = new Map(Array.from(mods.keys()).map((k, i) => [k, i]));
  let out = 'const __defs=[];const __cache=[];\nfunction __load(i){if(__cache[i])return __cache[i].exports;const m={exports:{}};__cache[i]=m;__defs[i][0](function(p){return __load(__defs[i][1][p])},m,m.exports);return m.exports}\n';
  for (const [abs, mod] of mods) {
    const map = {};
    for (const k of Object.keys(mod.deps)) map[k] = ids.get(mod.deps[k]);
    out += `__defs[${ids.get(abs)}]=[function(require,module,exports,${BLOCKED.join(',')}){\n${mod.src}\n},${JSON.stringify(map)}];\n`;
  }
  out += `__load(${ids.get(entry)});\n`;
  return out;
}

module.exports = { bundle, ROOT };

if (require.main === module) {
  const entry = path.join(ROOT, process.argv[2] || 'game.js');
  const outDir = path.join(ROOT, process.argv[3] || 'dist/preview');
  fs.mkdirSync(outDir, { recursive: true });
  const shim = fs.readFileSync(path.join(ROOT, 'tools/wx-shim.js'), 'utf8');
  const code = bundle(entry);
  // Audio is embedded so the preview stays a single file.
  const audioDir = path.join(ROOT, 'assets/audio');
  const audio = {};
  if (fs.existsSync(audioDir)) {
    for (const f of fs.readdirSync(audioDir)) {
      const mime = f.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';
      audio['assets/audio/' + f] = `data:${mime};base64,` + fs.readFileSync(path.join(audioDir, f)).toString('base64');
    }
  }
  const style = `:root{--bg:#0b0a14;--fg:#d9c9a3;--dim:#8f86a6;color-scheme:dark}
html,body{height:100%;margin:0;background:var(--bg);color:var(--fg);overflow:hidden;overscroll-behavior:none;-webkit-user-select:none;user-select:none}
#wrap{height:100%;display:flex;align-items:center;justify-content:center;gap:28px;padding-block:10px;box-sizing:border-box}
#phone{position:relative;height:100%;max-height:844px;aspect-ratio:390/844;max-width:100%;background:#000;overflow:hidden;border-radius:18px;box-shadow:0 0 0 2px #2a2542,0 12px 60px #0009;flex:none}
#note{display:none;max-width:230px;font:14px/1.6 system-ui,sans-serif;color:var(--dim);min-width:0}
#note b{display:block;font-size:22px;color:var(--fg);margin-bottom:8px;font-weight:600;letter-spacing:.08em}
@media (min-width:760px){#note{display:block}}
@media (max-width:520px){#wrap{padding-block:0}#phone{width:100%;height:100%;max-height:none;aspect-ratio:auto;border-radius:0;box-shadow:none}}`;
  const note = '<div id="note"><b>步虚录</b>Web preview of the WeChat mini-game. Steps are simulated here: on 步虚台 (the Step Altar), tap <em>+2000 步</em> to pretend you went for a walk. Progress is saved in this browser.</div>';
  const scripts = `<script>window.__AUDIO__=${JSON.stringify(audio)};window.__PREVIEW__=true;</script>
<script>${shim.replace(/<\/script/g, '<\\/script')}</script>
<script>${code.replace(/<\/script/g, '<\\/script')}</script>`;
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>步虚录</title>
<style>${style}</style></head>
<body><div id="wrap">${note}<div id="phone"></div></div>
${scripts}
</body></html>`;
  // The artifact host supplies the document skeleton, so this variant holds only the page content.
  const fragment = `<title>步虚录</title>
<style>${style}</style>
<div id="wrap">${note}<div id="phone"></div></div>
${scripts}`;
  fs.writeFileSync(path.join(outDir, 'buxulu.html'), fragment);
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`preview: ${path.join(outDir, 'index.html')} (${Math.round(html.length / 1024)} KB)`);
}
