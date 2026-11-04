// Bitmap text from a subset of Fusion Pixel Font (OFL-1.1), packed by tools/build_font.py.
// Glyphs are rasterised on demand into a small shared cache: one colour used to cost a whole canvas,
// and sixteen of them were most of the game's memory. A glyph with an outline is baked as one image,
// so outlined text needs one draw per character rather than five.
const DATA = require('../data/fontdata.js');

const CELL = DATA.h;
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

// ---- Glyph cache ----
const PAGE_W = 512;
const PAGE_H = 256;
const MAX_PAGES = 2;
const SLOT_W = 14; // 12px glyph plus a pixel of outline on each side
const SLOT_H = CELL + 2;
const COLS = Math.floor(PAGE_W / SLOT_W);
const ROWS = Math.floor(PAGE_H / SLOT_H);

const pages = [];
const styles = new Map(); // "colour|outline" -> Map(char -> slot)
let current = 0;
let used = 0;

function pageCtx(i) {
  if (!pages[i]) {
    const cv = wx.createCanvas();
    cv.width = PAGE_W;
    cv.height = PAGE_H;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, PAGE_W, PAGE_H);
    pages[i] = { cv, ctx };
  }
  return pages[i];
}

// When both pages are full the older one is wiped. Anything still on screen is simply baked again.
function nextSlot() {
  if (used >= COLS * ROWS) {
    current = (current + 1) % MAX_PAGES;
    used = 0;
    const dead = current;
    if (pages[dead]) pages[dead].ctx.clearRect(0, 0, PAGE_W, PAGE_H);
    styles.forEach((m) => m.forEach((slot, ch) => { if (slot.page === dead) m.delete(ch); }));
  }
  const n = used++;
  pageCtx(current);
  return { page: current, x: (n % COLS) * SLOT_W + 1, y: Math.floor(n / COLS) * SLOT_H + 1 };
}

function bake(g, color, outline) {
  const slot = nextSlot();
  const { ctx } = pages[slot.page];
  if (outline) {
    ctx.fillStyle = outline;
    const ink = (x, y) => y >= 0 && y < CELL && x >= 0 && x < g.cw && g.rows[y][x];
    for (let y = -1; y <= CELL; y++) {
      for (let x = -1; x <= g.cw; x++) {
        if (ink(x, y)) continue;
        if (ink(x - 1, y) || ink(x + 1, y) || ink(x, y - 1) || ink(x, y + 1)) ctx.fillRect(slot.x + x, slot.y + y, 1, 1);
      }
    }
  }
  ctx.fillStyle = color;
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
      ctx.fillRect(slot.x + x, slot.y + y, run, 1);
      x += run;
    }
  }
  return slot;
}

function styleFor(color, outline) {
  const key = outline ? color + '|' + outline : color;
  let m = styles.get(key);
  if (!m) {
    m = new Map();
    styles.set(key, m);
  }
  return m;
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

function draw(ctx, str, x, y, color, outline) {
  const style = styleFor(color, outline);
  const pad = outline ? 1 : 0;
  let cx = Math.round(x);
  y = Math.round(y);
  for (const ch of String(str)) {
    const g = glyph(ch);
    if (g.cw) {
      let s = style.get(ch);
      if (!s) {
        s = bake(g, color, outline);
        style.set(ch, s);
      }
      ctx.drawImage(pages[s.page].cv, s.x - pad, s.y - pad, g.cw + pad * 2, CELL + pad * 2, cx - pad, y - pad, g.cw + pad * 2, CELL + pad * 2);
    }
    cx += g.w;
  }
}

// Scaled text (logo and big labels): the same pixels, blown up with nearest-neighbour.
function drawBig(ctx, str, x, y, color, k) {
  const style = styleFor(color);
  let cx = Math.round(x);
  for (const ch of String(str)) {
    const g = glyph(ch);
    let s = style.get(ch);
    if (!s) {
      s = bake(g, color);
      style.set(ch, s);
    }
    ctx.drawImage(pages[s.page].cv, s.x, s.y, g.cw, CELL, cx, Math.round(y), g.cw * k, CELL * k);
    cx += g.w * k;
  }
}

const NO_LINE_START = '，。！？、；：」』）》…—,.!?;:)';

// Greedy wrap with basic Chinese line-breaking rules: punctuation never starts a line, and nothing
// runs past the given width.
function wrap(str, maxW) {
  const lines = [];
  for (const para of String(str).split('\n')) {
    let line = '', w = 0;
    for (const ch of para) {
      const cw = glyph(ch).w;
      if (w + cw > maxW && line) {
        if (NO_LINE_START.indexOf(ch) >= 0) {
          // The last character comes down with it, so punctuation never starts a line or overhangs.
          const chars = Array.from(line);
          const last = chars.pop();
          if (chars.length) lines.push(chars.join(''));
          line = last + ch;
          w = glyph(last).w + cw;
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

// Frees the older cache page under memory pressure. Glyphs on it come back as they are needed.
function purge() {
  const dead = (current + 1) % MAX_PAGES;
  if (pages[dead]) pages[dead].ctx.clearRect(0, 0, PAGE_W, PAGE_H);
  styles.forEach((m) => m.forEach((slot, ch) => { if (slot.page === dead) m.delete(ch); }));
}

const stats = () => ({ pages: pages.filter(Boolean).length, pixels: pages.filter(Boolean).length * PAGE_W * PAGE_H });

module.exports = { CELL, width, draw, drawBig, wrap, missing, hasGlyph: (ch) => glyphs.has(ch), purge, stats };
