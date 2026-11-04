// Bitmap text from a subset of Fusion Pixel Font (OFL-1.1), packed by tools/build_font.py.
// Glyphs are drawn into one atlas per colour on first use.
const DATA = require('../data/fontdata.js');

const CELL = DATA.h;
const COLS = 42;
const SLOT = CELL + 1;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(s) {
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let n = 0, acc = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64.indexOf(s[i]);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 255;
    }
  }
  return out;
}

const glyphs = new Map();
(function load() {
  const bytes = decodeBase64(DATA.bits);
  const chars = Array.from(DATA.chars);
  let bit = 0;
  chars.forEach((ch, i) => {
    const w = DATA.widths[i];
    const rows = [];
    for (let y = 0; y < CELL; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        row.push((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
        bit++;
      }
      rows.push(row);
    }
    glyphs.set(ch, { w: DATA.adv[i], cw: w, rows });
  });
})();

const missing = new Set();
const atlases = new Map();

function atlasFor(color) {
  let a = atlases.get(color);
  if (a) return a;
  const cv = wx.createCanvas();
  cv.width = COLS * SLOT;
  cv.height = COLS * SLOT;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = color;
  a = { cv, ctx, next: 0, slots: new Map() };
  atlases.set(color, a);
  return a;
}

function slotFor(a, ch, g) {
  let s = a.slots.get(ch);
  if (s) return s;
  const n = a.next++;
  s = { x: (n % COLS) * SLOT, y: Math.floor(n / COLS) * SLOT };
  a.slots.set(ch, s);
  for (let y = 0; y < CELL; y++) {
    const r = g.rows[y];
    let x = 0;
    while (x < g.cw) {
      if (!r[x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < g.cw && r[x + run]) run++;
      a.ctx.fillRect(s.x + x, s.y + y, run, 1);
      x += run;
    }
  }
  return s;
}

function glyph(ch) {
  const g = glyphs.get(ch);
  if (g) return g;
  if (ch !== '\n') missing.add(ch);
  return glyphs.get('□') || glyphs.get('?');
}

function width(str) {
  let w = 0;
  for (const ch of String(str)) w += glyph(ch).w;
  return w;
}

function draw(ctx, str, x, y, color) {
  const a = atlasFor(color);
  let cx = Math.round(x);
  y = Math.round(y);
  for (const ch of String(str)) {
    const g = glyph(ch);
    const s = slotFor(a, ch, g);
    if (g.cw) ctx.drawImage(a.cv, s.x, s.y, g.cw, CELL, cx, y, g.cw, CELL);
    cx += g.w;
  }
}

// Scaled text (logo and big labels): the same pixels, blown up with nearest-neighbour.
function drawBig(ctx, str, x, y, color, k) {
  const a = atlasFor(color);
  let cx = Math.round(x);
  for (const ch of String(str)) {
    const g = glyph(ch);
    const s = slotFor(a, ch, g);
    ctx.drawImage(a.cv, s.x, s.y, g.cw, CELL, cx, Math.round(y), g.cw * k, CELL * k);
    cx += g.w * k;
  }
}

const NO_LINE_START = '，。！？、；：」』）》…—,.!?;:)';

// Greedy wrap with basic Chinese line-breaking rules: punctuation never starts a line.
function wrap(str, maxW) {
  const lines = [];
  for (const para of String(str).split('\n')) {
    let line = '', w = 0;
    for (const ch of para) {
      const cw = glyph(ch).w;
      if (w + cw > maxW && line) {
        if (NO_LINE_START.indexOf(ch) >= 0) {
          line += ch;
          lines.push(line);
          line = '';
          w = 0;
          continue;
        }
        lines.push(line);
        line = '';
        w = 0;
      }
      line += ch;
      w += cw;
    }
    lines.push(line);
  }
  return lines;
}

module.exports = { CELL, width, draw, drawBig, wrap, missing, hasGlyph: (ch) => glyphs.has(ch) };
