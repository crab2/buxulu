// Drawing helpers plus immediate-mode buttons. Each frame, whatever is drawn as tappable registers a
// hit rectangle. Only the top scene's rectangles are active.
const D = require('./display.js');
const font = require('./font.js');
const art = require('./art.js');
const audio = require('./audio.js');
const { UI } = require('./palette.js');

const { ctx, W, H } = D;
const state = { hits: [], enabled: true, clip: null, pressId: null, toast: null, toastT: 0, t: 0, debug: false, boxes: [], texts: [] };

// Scrolling lists run far past the screen. Anything wholly outside the clip costs nothing to skip.
function culled(y, h) {
  const c = state.clip;
  return !!c && (y + h <= c.y || y >= c.y + c.h);
}

function rect(x, y, w, h, c) {
  if (culled(y, h)) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function alpha(a) {
  ctx.globalAlpha = a;
}

// Draws an atlas sprite at the top-left of its frame, or a whole canvas.
function img(s, x, y) {
  if (s.tw !== undefined) {
    if (culled(y, s.h)) return;
    if (s.cv) ctx.drawImage(s.cv, s.sx, s.sy, s.tw, s.th, Math.round(x) + s.ox, Math.round(y) + s.oy, s.tw, s.th);
  } else ctx.drawImage(s, Math.round(x), Math.round(y));
}

function imgScaled(s, x, y, w, h) {
  if (s.tw !== undefined) {
    if (!s.cv) return;
    const kx = w / s.w, ky = h / s.h;
    // A resting whole-number enlargement gets its own baked copy. Only sizes that change every frame,
    // like a card turning over, are left for the runtime to scale.
    if (kx === ky && kx >= 2 && Number.isInteger(kx) && s.resized) {
      img(s.resized(w, h), x, y);
      return;
    }
    ctx.drawImage(s.cv, s.sx, s.sy, s.tw, s.th, Math.round(x + s.ox * kx), Math.round(y + s.oy * ky), Math.max(1, Math.round(s.tw * kx)), Math.max(1, Math.round(s.th * ky)));
  } else ctx.drawImage(s, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// Mirrored sprite. Flipping at draw time means left- and right-facing poses share one image.
function imgFlip(s, x, y) {
  if (!s.cv) return;
  ctx.save();
  ctx.translate(Math.round(x) + s.w, Math.round(y));
  ctx.scale(-1, 1);
  ctx.drawImage(s.cv, s.sx, s.sy, s.tw, s.th, s.ox, s.oy, s.tw, s.th);
  ctx.restore();
}

// Darkens what is already drawn while keeping its colours rich. Multiply needs no extra canvas. A
// runtime without it gets a plain wash instead, at a strength that still reads as evening.
let canMultiply = null;
function tint(color, h, washAlpha) {
  if (canMultiply === null) {
    ctx.globalCompositeOperation = 'multiply';
    canMultiply = ctx.globalCompositeOperation === 'multiply';
    ctx.globalCompositeOperation = 'source-over';
  }
  if (canMultiply) {
    ctx.globalCompositeOperation = 'multiply';
    rect(0, 0, W, h, color);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    alpha(washAlpha);
    rect(0, 0, W, h, '#0a0d3a');
    alpha(1);
  }
}

// A region's scenery behind a screen of lists and panels: dimmed all over, then sinking into ink toward the
// bottom, so the panels sit on a picture at the top and on quiet darkness below it.
function backdrop(theme, dim) {
  ctx.drawImage(art.battleBg(theme, W, H), 0, 0);
  alpha(dim);
  rect(0, 0, W, H, '#07061a');
  alpha(1);
  const y0 = Math.round(H * 0.4);
  tileX(art.scrim(H - y0), 0, y0);
}

// Draws a repeating band of scenery, wrapped horizontally.
function tileX(cv, offset, y) {
  const w = cv.width;
  let x = -(((Math.floor(offset) % w) + w) % w);
  while (x < W) {
    ctx.drawImage(cv, x, y);
    x += w;
  }
}

function text(str, x, y, color, o) {
  o = o || {};
  str = String(str);
  if (o.align === 'c') x -= font.width(str) / 2;
  else if (o.align === 'r') x -= font.width(str);
  // Automated layout checks read these. Off outside tests, so it costs nothing on a phone.
  if (culled(y, font.CELL + 2)) return;
  if (state.debug && state.enabled) state.texts.push({ str, x, y, w: font.width(str), h: font.CELL, clipped: !!state.clip });
  if (o.outline) {
    font.draw(ctx, str, x, y, color || UI.text, o.outline === true ? UI.ink : o.outline);
    return;
  }
  if (o.shadow) font.draw(ctx, str, x + 1, y + 1, o.shadow === true ? UI.ink : o.shadow);
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
  k = k || 2;
  const sheet = art.digits(color, k);
  const s = String(str);
  const adv = 4 * k;
  let cx = Math.round(x - (s.length * adv) / 2);
  for (const ch of s) {
    const i = art.DIGIT_ORDER.indexOf(ch);
    if (i >= 0) ctx.drawImage(sheet.cv, sheet.sx + i * 6 * k - sheet.ox, sheet.sy, 5 * k, sheet.th, cx, Math.round(y), 5 * k, sheet.th);
    cx += adv;
  }
}

// Ink window with a bronze inner line, soft inner shading and notched corners, after palace lattice frames.
function panel(x, y, w, h, o) {
  o = o || {};
  const fill = o.fill || UI.panel;
  const line = o.line || UI.line;
  rect(x + 2, y, w - 4, h, UI.ink);
  rect(x, y + 2, w, h - 4, UI.ink);
  rect(x + 1, y + 1, w - 2, h - 2, UI.ink);
  rect(x + 2, y + 2, w - 4, h - 4, line);
  rect(x + 3, y + 3, w - 6, h - 6, fill);
  alpha(0.06);
  rect(x + 3, y + 3, w - 6, 1, '#ffffff');
  alpha(0.22);
  rect(x + 3, y + h - 4, w - 6, 1, UI.ink);
  alpha(1);
  if (!o.plain) {
    rect(x + 2, y + 2, 3, 3, UI.ink);
    rect(x + w - 5, y + 2, 3, 3, UI.ink);
    rect(x + 2, y + h - 5, 3, 3, UI.ink);
    rect(x + w - 5, y + h - 5, 3, 3, UI.ink);
    rect(x + 3, y + 3, 1, 1, UI.lineHi);
    rect(x + w - 4, y + 3, 1, 1, UI.lineHi);
    rect(x + 3, y + h - 4, 1, 1, UI.lineHi);
    rect(x + w - 4, y + h - 4, 1, 1, UI.lineHi);
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
  normal: { fill: '#2a2542', top: '#38325a', edge: '#4a4268', text: UI.text, line: UI.line, low: '#1d1a2e' },
  primary: { fill: '#c2902e', top: '#dcae48', edge: '#f7dd7a', text: '#241a10', line: '#f7dd7a', low: '#8a6420' },
  danger: { fill: '#8e2a25', top: '#a8392e', edge: '#ec7a4e', text: UI.text, line: '#ec7a4e', low: '#641c1e' },
  jade: { fill: '#1f6a5c', top: '#2a806e', edge: '#7fd1a4', text: UI.text, line: '#7fd1a4', low: '#144a42' },
  ghost: { fill: '#1d1a2e', top: '#221e36', edge: '#2a2542', text: UI.dim, line: '#3a3350', low: '#151226' },
  off: { fill: '#242035', top: '#272339', edge: '#2e2942', text: UI.faint, line: '#332d4a', low: '#1a1728' },
};

const SUB_GAP = 1;

function button(id, x, y, w, h, o) {
  o = o || {};
  if (state.debug && state.enabled) state.boxes.push({ id, x, y, w, h, clipped: !!state.clip, clip: state.clip });
  const kind = KINDS[o.disabled ? 'off' : o.kind || 'normal'];
  const down = state.enabled && state.pressId === id && !o.disabled;
  const dy = down ? 1 : 0;
  rect(x + 1, y, w - 2, h, UI.ink);
  rect(x, y + 1, w, h - 2, UI.ink);
  rect(x + 1, y + 1 + dy, w - 2, h - 2 - dy, kind.line);
  rect(x + 2, y + 2 + dy, w - 4, h - 4 - dy, kind.fill);
  rect(x + 2, y + 2 + dy, w - 4, Math.floor((h - 4) * 0.42), kind.top);
  if (!down) {
    rect(x + 2, y + 2, w - 4, 1, kind.edge);
    rect(x + 2, y + h - 4, w - 4, 2, kind.low);
  }
  const cy = y + Math.floor((h - font.CELL) / 2) + dy - (down ? 0 : 1);
  const hasSub = o.sub !== undefined && o.sub !== null;
  const lblY = hasSub ? y + Math.floor((h - font.CELL * 2 - SUB_GAP) / 2) + dy - 1 : cy;
  const subY = lblY + font.CELL + SUB_GAP;
  if (o.icon) {
    const lw = o.label ? font.width(o.label) : 0;
    const sw = hasSub ? font.width(o.sub) : 0;
    const total = 16 + (o.label || hasSub ? 3 + Math.max(lw, sw) : 0);
    const ix = o.alignLeft ? x + 6 : x + Math.round((w - total) / 2);
    img(art.icon(o.icon), ix, y + Math.floor((h - 16) / 2) + dy - 1);
    if (o.label) text(o.label, ix + 19, lblY, o.color || kind.text);
    if (hasSub) text(o.sub, ix + 19, subY, o.subColor || UI.dim);
  } else if (o.label) {
    text(o.label, x + w / 2, lblY, o.color || kind.text, { align: 'c' });
    if (hasSub) text(o.sub, x + w / 2, subY, o.subColor || (o.kind === 'primary' ? '#3a2a14' : UI.dim), { align: 'c' });
  }
  if (o.badge) dot(x + w - 8, y - 2);
  if (o.disabled && !o.tapWhenOff) return;
  hit(id, x, y, w, h, o.onTap, { sound: o.sound, label: o.label });
}

// The small blinking marker that means something here wants attention.
function dot(x, y) {
  const on = Math.floor(state.t * 3) % 2 === 0;
  rect(x, y, 7, 7, UI.ink);
  rect(x + 1, y + 1, 5, 5, on ? '#ec7a4e' : '#c8402f');
}

// Big numbers stay short enough to fit on a phone: 9,999 then 1.2万 then 3.4亿.
function num(n) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  if (n < 100000000) {
    const v = n / 10000;
    return (v < 100 ? Math.floor(v * 10) / 10 : Math.floor(v)) + '万';
  }
  const v = n / 100000000;
  return (v < 100 ? Math.floor(v * 10) / 10 : Math.floor(v)) + '亿';
}

function chip(x, y, value, icon, color) {
  const s = num(value);
  const w = font.width(s) + 22;
  rect(x - w + 1, y, w - 2, 18, UI.ink);
  rect(x - w, y + 1, w, 16, UI.ink);
  rect(x - w + 1, y + 1, w - 2, 16, '#2a2542');
  img(art.icon(icon), x - w + 1, y + 1);
  text(s, x - 4, y + 3, color || UI.gold, { align: 'r' });
  return w;
}

// Stardust and coins, ending just left of the WeChat capsule.
function chips(y, coin, dust) {
  let x = D.capLeft - 4;
  if (dust !== undefined) x -= chip(x, y, dust, 'dust', UI.blue) + 3;
  if (coin !== undefined) chip(x, y, coin, 'coin', UI.gold);
}

// Title row aligned with the WeChat capsule, with Back on the left and currencies beside the capsule.
function header(title, onBack, dust, coin) {
  const y = D.capTop;
  const h = Math.max(20, D.capBottom - D.capTop);
  if (onBack) {
    button('back', 5, y, 26, h, { label: '<', kind: 'normal', onTap: onBack, sound: 'back' });
  }
  if (title) text(title, onBack ? 36 : 8, y + Math.floor((h - font.CELL) / 2), UI.text, { outline: true });
  chips(y + Math.floor((h - 18) / 2), coin, dust);
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

// A short rising note under the header: the party just got stronger, and by how much.
function flyer(text, icon) {
  state.flyer = { text, icon, t: 0 };
}

function drawFlyer() {
  const f = state.flyer;
  if (!f) return;
  const life = 1.8;
  if (f.t >= life) {
    state.flyer = null;
    return;
  }
  const tw = font.width(f.text) + (f.icon ? 18 : 0);
  const x = Math.round((W - tw) / 2);
  const y = Math.round(D.contentTop + 44 - Math.min(1, f.t * 5) * 8 - f.t * 5);
  alpha(f.t > life - 0.4 ? Math.max(0, (life - f.t) / 0.4) : 1);
  rect(x - 7, y - 3, tw + 14, 18, UI.ink);
  rect(x - 6, y - 2, tw + 12, 16, '#3a2a14');
  rect(x - 6, y - 2, tw + 12, 1, UI.line);
  rect(x - 6, y + 13, tw + 12, 1, UI.line);
  if (f.icon) img(art.icon(f.icon), x - 2, y - 2);
  font.draw(ctx, f.text, x + (f.icon ? 16 : 0), y + 1, UI.gold);
  alpha(1);
}

function fmt(n) {
  return Number(n).toLocaleString('en-US');
}

// A length of time, in the fewest units that still make sense.
function dur(secs) {
  const t = Math.max(0, Math.ceil(secs));
  if (t >= 3600) {
    const m = Math.floor((t % 3600) / 60);
    return `${Math.floor(t / 3600)}时${m ? m + '分' : ''}`;
  }
  if (t >= 60) {
    const sec = t % 60;
    return `${Math.floor(t / 60)}分${sec ? sec + '秒' : ''}`;
  }
  return `${t}秒`;
}

// Icon, optional text and a number, in a row. Returns the x after it.
function iconNum(icon, value, x, y, color) {
  img(art.icon(icon), x, y - 3);
  const s = String(value);
  text(s, x + 17, y, color || UI.text);
  return x + 17 + font.width(s) + 6;
}

module.exports = {
  state, rect, alpha, img, backdrop, imgScaled, imgFlip, tileX, tint, text, para, paraHeight, numberBig, panel, bar, button, dot, hit, setClip, endClip,
  chip, chips, header, toast, drawToast, flyer, drawFlyer, fmt, num, dur, iconNum, ctx, W, H, font, audio,
};
