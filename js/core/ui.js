// Drawing helpers plus immediate-mode buttons. Each frame, whatever is drawn as tappable registers a
// hit rectangle. Only the top scene's rectangles are active.
const D = require('./display.js');
const font = require('./font.js');
const art = require('./art.js');
const audio = require('./audio.js');
const { UI } = require('./palette.js');

const { ctx, W, H } = D;
const state = { hits: [], enabled: true, clip: null, pressId: null, toast: null, toastT: 0, t: 0 };

function rect(x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function alpha(a) {
  ctx.globalAlpha = a;
}

function img(cv, x, y) {
  ctx.drawImage(cv, Math.round(x), Math.round(y));
}

function imgScaled(cv, x, y, w, h) {
  ctx.drawImage(cv, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function text(str, x, y, color, o) {
  o = o || {};
  str = String(str);
  if (o.align === 'c') x -= font.width(str) / 2;
  else if (o.align === 'r') x -= font.width(str);
  if (o.outline) {
    const oc = o.outline === true ? UI.ink : o.outline;
    font.draw(ctx, str, x - 1, y, oc);
    font.draw(ctx, str, x + 1, y, oc);
    font.draw(ctx, str, x, y - 1, oc);
    font.draw(ctx, str, x, y + 1, oc);
  } else if (o.shadow) {
    font.draw(ctx, str, x + 1, y + 1, o.shadow === true ? UI.ink : o.shadow);
  }
  font.draw(ctx, str, x, y, color || UI.text);
}

// Word-wrapped paragraph. Returns the height it took.
function para(str, x, y, w, color, o) {
  o = o || {};
  const lh = o.lh || font.CELL + 3;
  const lines = font.wrap(str, w);
  lines.forEach((l, i) => text(l, x, y + i * lh, color, o));
  return lines.length * lh;
}

function paraHeight(str, w, lh) {
  return font.wrap(str, w).length * (lh || font.CELL + 3);
}

// Number written with the chunky damage digits, centred on x.
function numberBig(str, x, y, color, k) {
  const sheet = art.digits(color);
  k = k || 2;
  const s = String(str);
  const adv = 4 * k;
  let cx = Math.round(x - (s.length * adv) / 2);
  for (const ch of s) {
    const i = art.DIGIT_ORDER.indexOf(ch);
    if (i >= 0) ctx.drawImage(sheet, i * 6, 0, 5, 7, cx, Math.round(y), 5 * k, 7 * k);
    cx += adv;
  }
}

// Ink window with a thin bronze inner line and notched corners, after palace lattice frames.
function panel(x, y, w, h, o) {
  o = o || {};
  const fill = o.fill || UI.panel;
  const line = o.line || UI.line;
  rect(x + 2, y, w - 4, h, UI.ink);
  rect(x, y + 2, w, h - 4, UI.ink);
  rect(x + 1, y + 1, w - 2, h - 2, UI.ink);
  rect(x + 2, y + 2, w - 4, h - 4, line);
  rect(x + 3, y + 3, w - 6, h - 6, fill);
  if (!o.plain) {
    rect(x + 2, y + 2, 3, 3, UI.ink);
    rect(x + w - 5, y + 2, 3, 3, UI.ink);
    rect(x + 2, y + h - 5, 3, 3, UI.ink);
    rect(x + w - 5, y + h - 5, 3, 3, UI.ink);
    rect(x + 3, y + 3, 1, 1, line);
    rect(x + w - 4, y + 3, 1, 1, line);
    rect(x + 3, y + h - 4, 1, 1, line);
    rect(x + w - 4, y + h - 4, 1, 1, line);
  }
}

function bar(x, y, w, h, ratio, color, back) {
  rect(x, y, w, h, UI.ink);
  rect(x + 1, y + 1, w - 2, h - 2, back || '#332d4a');
  const fw = Math.round((w - 2) * Math.max(0, Math.min(1, ratio)));
  if (fw > 0) rect(x + 1, y + 1, fw, h - 2, color);
  if (fw > 1 && h > 3) {
    alpha(0.28);
    rect(x + 1, y + 1, fw, 1, '#ffffff');
    alpha(1);
  }
}

function setClip(x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  state.clip = { x, y, w, h };
}

function endClip() {
  ctx.restore();
  state.clip = null;
}

function hit(id, x, y, w, h, onTap, o) {
  if (!state.enabled) return;
  let r = { id, x, y, w, h, onTap, sound: (o && o.sound) === undefined ? 'tap' : o.sound, label: o && o.label };
  if (state.clip) {
    const c = state.clip;
    const x0 = Math.max(x, c.x), y0 = Math.max(y, c.y), x1 = Math.min(x + w, c.x + c.w), y1 = Math.min(y + h, c.y + c.h);
    if (x1 <= x0 || y1 <= y0) return;
    r = Object.assign(r, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  state.hits.push(r);
}

const KINDS = {
  normal: { fill: '#2a2542', edge: '#4a4268', text: UI.text, line: UI.line },
  primary: { fill: '#b8862a', edge: '#f7dd7a', text: '#241a10', line: '#f7dd7a' },
  danger: { fill: '#8e2a25', edge: '#ec7a4e', text: UI.text, line: '#ec7a4e' },
  jade: { fill: '#1f6a5c', edge: '#7fd1a4', text: UI.text, line: '#7fd1a4' },
  ghost: { fill: '#1d1a2e', edge: '#2a2542', text: UI.dim, line: '#3a3350' },
  off: { fill: '#242035', edge: '#2e2942', text: UI.faint, line: '#332d4a' },
};

function button(id, x, y, w, h, o) {
  o = o || {};
  const kind = KINDS[o.disabled ? 'off' : o.kind || 'normal'];
  const down = state.enabled && state.pressId === id && !o.disabled;
  const dy = down ? 1 : 0;
  rect(x + 1, y, w - 2, h, UI.ink);
  rect(x, y + 1, w, h - 2, UI.ink);
  rect(x + 1, y + 1 + dy, w - 2, h - 2 - dy, kind.line);
  rect(x + 2, y + 2 + dy, w - 4, h - 4 - dy, kind.fill);
  if (!down) {
    rect(x + 2, y + 2, w - 4, 1, kind.edge);
    alpha(0.25);
    rect(x + 2, y + h - 3, w - 4, 1, UI.ink);
    alpha(1);
  }
  const cy = y + Math.floor((h - font.CELL) / 2) + dy;
  const hasSub = o.sub !== undefined && o.sub !== null;
  const lblY = hasSub ? y + Math.floor((h - font.CELL * 2) / 2) + dy : cy;
  if (o.icon) {
    const lw = o.label ? font.width(o.label) : 0;
    const total = 16 + (o.label ? 3 + lw : 0);
    const ix = o.alignLeft ? x + 6 : x + Math.round((w - total) / 2);
    img(art.icon(o.icon), ix, y + Math.floor((h - 16) / 2) + dy);
    if (o.label) text(o.label, ix + 19, lblY, o.color || kind.text);
    if (hasSub) text(o.sub, ix + 19, lblY + font.CELL, o.subColor || UI.dim);
  } else if (o.label) {
    text(o.label, x + w / 2, lblY, o.color || kind.text, { align: 'c' });
    if (hasSub) text(o.sub, x + w / 2, lblY + font.CELL, o.subColor || (o.kind === 'primary' ? '#3a2a14' : UI.dim), { align: 'c' });
  }
  if (o.badge) {
    const on = Math.floor(state.t * 3) % 2 === 0;
    rect(x + w - 8, y - 2, 7, 7, UI.ink);
    rect(x + w - 7, y - 1, 5, 5, on ? '#ec7a4e' : '#c8402f');
  }
  if (o.disabled && !o.tapWhenOff) return;
  hit(id, x, y, w, h, o.onTap, { sound: o.sound, label: o.label });
}

function chipDust(x, y, value) {
  const s = Number(value).toLocaleString('en-US');
  const w = font.width(s) + 26;
  rect(x - w + 1, y, w - 2, 18, UI.ink);
  rect(x - w, y + 1, w, 16, UI.ink);
  rect(x - w + 1, y + 1, w - 2, 16, '#2a2542');
  ctx.drawImage(art.icon('dust'), x - w + 2, y + 1);
  text(s, x - 5, y + 3, UI.gold, { align: 'r' });
  return w;
}

// Title row aligned with the WeChat capsule, with Back on the left and Stardust beside the capsule.
function header(title, onBack, dust) {
  const y = D.capTop;
  const h = Math.max(20, D.capBottom - D.capTop);
  if (onBack) {
    button('back', 5, y, 30, h, { label: '<', kind: 'normal', onTap: onBack, sound: 'back' });
  }
  text(title, onBack ? 40 : 8, y + Math.floor((h - font.CELL) / 2), UI.text, { outline: true });
  if (dust !== undefined) chipDust(D.capLeft - 5, y + Math.floor((h - 18) / 2), dust);
}

function toast(msg, seconds) {
  state.toast = msg;
  state.toastT = seconds || 2;
}

function drawToast() {
  if (!state.toast || state.toastT <= 0) return;
  const lines = font.wrap(state.toast, W - 50);
  const h = lines.length * (font.CELL + 2) + 12;
  const y = Math.round(H * 0.42);
  alpha(Math.min(1, state.toastT * 3));
  panel(16, y, W - 32, h, { fill: '#241f33', plain: true });
  lines.forEach((l, i) => text(l, W / 2, y + 6 + i * (font.CELL + 2), UI.text, { align: 'c' }));
  alpha(1);
}

function fmt(n) {
  return Number(n).toLocaleString('en-US');
}

module.exports = {
  state, rect, alpha, img, imgScaled, text, para, paraHeight, numberBig, panel, bar, button, hit, setClip, endClip,
  chipDust, header, toast, drawToast, fmt, ctx, W, H, font, audio,
};
