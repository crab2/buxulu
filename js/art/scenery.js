// Baked scenery: battle backdrops per region, world-map terrain, and the post-station hub.
const { Grid, hash, fbm1 } = require('../core/paint.js');
const { C, mix, lit, drk } = require('../core/palette.js');

const THEMES = {
  spring: { sky: [0x9fd8d0, 0xf7dcc8, 0xf7c4c8], far: 0x8bbfb4, mid: 0x5fa58c, near: 0x3f8a6c, g: [0x6fae62, 0x4f9358, 0x38774f], speck: C.peach2 },
  summer: { sky: [0x3a1e4a, 0xa3342f, 0xf0853c], far: 0x6c2a3e, mid: 0x4a1e30, near: 0x2e1426, g: [0x5a2a28, 0x44201f, 0x2e1618], speck: C.red3 },
  loess: { sky: [0xc9a55e, 0xe6c88a, 0xf3e0ac], far: 0xc49a5e, mid: 0xa87a44, near: 0x8a5e34, g: [0xc28f52, 0xa87640, 0x8a5e34], speck: C.ochre2 },
  autumn: { sky: [0x5a4a74, 0xb0705a, 0xeab45c], far: 0x7a5668, mid: 0x5c4256, near: 0x432f44, g: [0xa5652f, 0x854f28, 0x633a22], speck: C.gold },
  winter: { sky: [0x12264a, 0x2a5a80, 0x9ed0d8], far: 0x4a7a9a, mid: 0x7ca8c0, near: 0xb4d4e0, g: [0xdff0f5, 0xc0dceb, 0x9cc4dc], speck: C.white },
  void: { sky: [0x0c0a1e, 0x1e1640, 0x41286e], far: 0x2a1e50, mid: 0x1e1640, near: 0x151030, g: [0x3a3058, 0x2a2244, 0x1c1732], speck: C.gold2 },
};

function skyBand(g, y0, y1, stops) {
  const n = stops.length - 1;
  for (let y = y0; y < y1; y++) {
    const t = ((y - y0) / Math.max(1, y1 - y0)) * n;
    const i = Math.min(n - 1, Math.floor(t));
    // Stepped bands with a dithered seam, the way a limited-palette sky would be painted.
    const q = (t - i) * 5;
    const k = Math.floor(q);
    const a = mix(stops[i], stops[i + 1], k / 5);
    const b = mix(stops[i], stops[i + 1], Math.min(1, (k + 1) / 5));
    g.dither(0, y, g.w, 1, a, b, () => q - k);
  }
}

function ridge(g, base, amp, freq, seed, col, hi) {
  for (let x = 0; x < g.w; x++) {
    const n = fbm1(x * freq, seed, 4);
    const top = Math.round(base - n * amp);
    for (let y = top; y < g.h; y++) g.set(x, y, col);
    if (hi !== undefined && x % 2 === 0) g.set(x, top, hi);
  }
}

function ground(g, y0, th, seed) {
  for (let y = y0; y < g.h; y++) {
    const t = (y - y0) / Math.max(1, g.h - y0);
    const i = t < 0.34 ? 0 : t < 0.67 ? 1 : 2;
    for (let x = 0; x < g.w; x++) {
      const v = hash(x >> 1, y >> 1, seed);
      let c = th.g[i];
      if (v > 0.93) c = drk(c, 0.18);
      else if (v < 0.05) c = lit(c, 0.12);
      g.set(x, y, c);
    }
  }
  for (let x = 0; x < g.w; x++) if (hash(x, 1, seed) > 0.4) g.set(x, y0, lit(th.g[0], 0.3));
}

function clouds(g, y, seed, c) {
  for (let i = 0; i < 5; i++) {
    const x = hash(i, 3, seed) * g.w, yy = y + hash(i, 5, seed) * 22, w = 12 + hash(i, 7, seed) * 22;
    g.rect(x, yy, w, 2, c);
    g.rect(x + 3, yy - 2, w - 8, 2, c);
    g.rect(x - 4, yy + 2, w * 0.6, 1, c);
  }
}

function peachTree(g, x, y, s) {
  g.line(x, y, x - s * 0.1, y - s * 0.6, C.ochre2, 2);
  g.line(x, y - s * 0.3, x + s * 0.3, y - s * 0.55, C.ochre2, 1);
  const seeds = [[0, -0.8, 0.42], [-0.34, -0.62, 0.3], [0.34, -0.64, 0.3], [0.08, -1.02, 0.28]];
  seeds.forEach((q) => g.ell(x + q[0] * s, y + q[1] * s, q[2] * s, q[2] * s * 0.82, C.peach));
  for (let i = 0; i < s * 5; i++) {
    const a = hash(i, x, 2) * 6.28, r = hash(i, y, 3) * s * 0.55;
    g.set(x + Math.cos(a) * r, y - s * 0.8 + Math.sin(a) * r * 0.8, hash(i, 1, 4) > 0.5 ? C.peach2 : C.peach3);
  }
}

function pillar(g, x, y, h, c) {
  g.rect(x, y - h, 9, h, c);
  g.rect(x, y - h, 2, h, lit(c, 0.2));
  g.rect(x + 7, y - h, 2, h, drk(c, 0.3));
  for (let i = 0; i < 5; i++) g.set(x + hash(i, h, 2) * 9, y - hash(i, x, 3) * h, drk(c, 0.45));
}

function gateTower(g, x, y) {
  const s = 0x4a3f55, r = 0x2b2438;
  g.rect(x, y - 40, 60, 40, s);
  g.rect(x + 22, y - 22, 16, 22, C.ink);
  g.ell(x + 30, y - 22, 8, 7, C.ink);
  for (let i = 0; i < 6; i++) g.rect(x + i * 11, y - 44, 6, 4, s);
  g.poly([[x - 6, y - 52], [x + 66, y - 52], [x + 56, y - 62], [x + 4, y - 62]], r);
  g.rect(x + 8, y - 52, 44, 8, 0x3a3048);
  g.rect(x + 8, y - 51, 44, 1, C.red2);
}

function spire(g, x, y, h, w, c) {
  g.poly([[x - w, y], [x, y - h], [x + w * 0.8, y]], c);
  g.poly([[x, y - h], [x + w * 0.8, y], [x + 1, y]], drk(c, 0.2));
  g.line(x - 1, y - h + 3, x - w * 0.4, y - 2, lit(c, 0.45));
}

// Night sky with the Dipper. Lit stars shine; dim ones show how many are left to restore.
function dipperPoints(cx, cy, s) {
  const pts = [[0, 0], [0.34, 0.16], [0.42, 0.42], [0.1, 0.34], [-0.26, 0.2], [-0.58, 0.32], [-0.9, 0.2]];
  // Order: Tianshu, Tianxuan, Tianji, Tianquan, Yuheng, Kaiyang, Yaoguang.
  return pts.map((q) => [Math.round(cx + q[0] * s), Math.round(cy + q[1] * s)]);
}

function battleBg(themeId, w, h) {
  const th = THEMES[themeId];
  const g = new Grid(w, h);
  const gy = Math.round(h * 0.56);
  skyBand(g, 0, gy + 4, th.sky);
  if (themeId === 'void' || themeId === 'winter') {
    for (let i = 0; i < 110; i++) g.set(hash(i, 1, 9) * w, hash(i, 2, 9) * gy * 0.85, hash(i, 3, 9) > 0.75 ? C.gold2 : C.paper2);
  }
  if (themeId === 'winter') {
    for (let x = 0; x < w; x++) {
      const y = 20 + fbm1(x * 0.03, 8, 2) * 30;
      for (let k = 0; k < 16; k++) if (hash(x, k, 2) > k / 16) g.set(x, y + k, mix(0x3a8a8a, 0x7fd1a4, 1 - k / 16));
    }
  }
  if (themeId === 'spring') clouds(g, 12, 3, 0xfdf0e6);
  if (themeId === 'loess') {
    g.ell(w * 0.72, gy * 0.36, 16, 16, 0xfff4cc);
    clouds(g, 16, 8, 0xf8e8bc);
  }
  if (themeId === 'autumn') {
    g.ell(w * 0.26, gy * 0.42, 15, 15, 0xf8d88a);
    clouds(g, 22, 11, 0xc08a6c);
  }
  if (themeId === 'summer') {
    g.ell(w * 0.5, gy * 0.42, 22, 22, 0xffd46a);
    g.ell(w * 0.5, gy * 0.42, 17, 17, 0xfff0b0);
  }
  ridge(g, gy - 18, 44, 0.018, 11, th.far);
  ridge(g, gy - 4, 34, 0.031, 23, th.mid);
  if (themeId === 'winter') {
    for (let x = 0; x < w; x += 2) {
      const n = fbm1(x * 0.018, 11, 4);
      const top = Math.round(gy - 18 - n * 44);
      g.rect(x, top, 2, 3, 0xdff0f5);
    }
  }
  if (themeId === 'summer') {
    const vx = w * 0.72, vy = gy - 4;
    g.poly([[vx - 46, vy], [vx - 9, vy - 50], [vx + 9, vy - 50], [vx + 46, vy]], 0x35162a);
    g.rect(vx - 9, vy - 52, 18, 3, C.gold);
    g.line(vx - 3, vy - 50, vx - 13, vy - 22, C.red3, 2);
    g.line(vx + 5, vy - 50, vx + 16, vy - 12, C.red3, 2);
    g.line(vx - 13, vy - 22, vx - 22, vy - 2, C.red, 2);
  }
  ridge(g, gy + 3, 16, 0.05, 37, th.near);
  if (themeId === 'autumn') gateTower(g, w * 0.56, gy + 1);
  if (themeId === 'loess') {
    pillar(g, w * 0.14, gy + 1, 38, C.ochre);
    pillar(g, w * 0.32, gy + 1, 22, C.ochre);
    pillar(g, w * 0.82, gy + 1, 30, C.ochre);
  }
  if (themeId === 'winter') {
    spire(g, w * 0.14, gy + 2, 40, 13, 0x9fd0e0);
    spire(g, w * 0.3, gy + 2, 22, 9, 0x8ec2d6);
    spire(g, w * 0.86, gy + 2, 48, 15, 0xaad8e6);
    spire(g, w * 0.7, gy + 2, 20, 8, 0x8ec2d6);
  }
  if (themeId === 'spring') {
    peachTree(g, w * 0.13, gy + 3, 34);
    peachTree(g, w * 0.84, gy + 3, 42);
    peachTree(g, w * 0.55, gy + 1, 20);
  }
  if (themeId === 'void') {
    const pts = dipperPoints(w * 0.62, h * 0.08, w * 0.42);
    pts.forEach((q, i) => {
      if (i) g.line(pts[i - 1][0], pts[i - 1][1], q[0], q[1], 0x4a3a7a);
    });
    pts.forEach((q) => g.ell(q[0], q[1], 1, 1, C.gold2));
  }
  ground(g, gy, th, 5);
  for (let i = 0; i < 70; i++) {
    const x = hash(i, 8, 1) * w, y = gy + 4 + hash(i, 9, 1) * (h - gy - 4);
    if (themeId === 'spring' && i % 2) {
      g.set(x, y, C.peach2);
      g.set(x + 1, y, C.peach);
    } else g.set(x, y, th.speck);
  }
  return g;
}

// ---- World-map terrain ----
function decor(g, kind, x, y) {
  switch (kind) {
    case 'peach':
      peachTree(g, x, y, 14 + hash(x, y, 1) * 8);
      break;
    case 'pine':
      g.rect(x - 1, y - 5, 2, 5, C.ochre2);
      g.poly([[x - 7, y - 4], [x, y - 13], [x + 7, y - 4]], 0x1f5a4a);
      g.poly([[x - 5, y - 10], [x, y - 18], [x + 5, y - 10]], 0x2a6e58);
      break;
    case 'rockr':
      g.poly([[x - 7, y], [x - 4, y - 6], [x + 2, y - 8], [x + 7, y], [x, y + 1]], 0x3a1c28);
      g.line(x - 3, y - 5, x + 1, y - 7, 0x6c2a3e);
      if (hash(x, y, 5) > 0.5) g.line(x + 2, y - 2, x + 5, y - 1, C.red3);
      break;
    case 'lava':
      g.ell(x, y, 9, 4, C.red2);
      g.ell(x, y, 6, 2, C.red3);
      g.rect(x - 2, y, 4, 1, C.gold);
      break;
    case 'mesa':
      g.rect(x - 8, y - 9, 16, 9, C.ochre);
      g.rect(x - 8, y - 11, 16, 2, C.ochre3);
      g.rect(x - 4, y - 7, 2, 7, C.ochre2);
      g.rect(x + 3, y - 6, 1, 6, C.ochre2);
      break;
    case 'stump':
      g.rect(x - 3, y - 12, 6, 12, C.ochre);
      g.rect(x - 3, y - 12, 2, 12, C.ochre3);
      g.rect(x + 1, y - 16, 2, 5, C.ochre);
      break;
    case 'maple':
      g.line(x, y, x, y - 10, C.ochre2, 2);
      g.ell(x, y - 14, 9, 8, C.red);
      g.ell(x - 4, y - 11, 5, 4, C.red3);
      g.ell(x + 4, y - 16, 4, 3, C.gold);
      break;
    case 'sword':
      g.line(x, y, x + 2, y - 16, 0xb8bdcc, 2);
      g.rect(x - 3, y - 15, 9, 2, C.gold3);
      g.rect(x, y - 19, 3, 4, C.ochre2);
      break;
    case 'ice':
      spire(g, x, y, 13 + hash(x, y, 2) * 10, 6, 0x9fd0e0);
      break;
    case 'snowpine':
      g.rect(x - 1, y - 5, 2, 5, C.ochre2);
      g.poly([[x - 7, y - 4], [x, y - 13], [x + 7, y - 4]], 0x2a5a6a);
      g.poly([[x - 5, y - 10], [x, y - 18], [x + 5, y - 10]], 0xdff0f5);
      break;
    case 'isle':
      g.ell(x, y, 11, 4, 0x4a3c70);
      g.poly([[x - 9, y + 1], [x + 9, y + 1], [x + 2, y + 12]], 0x241c48);
      g.set(x - 3, y - 1, C.gold2);
      break;
    case 'star':
      g.line(x - 3, y, x + 3, y, C.gold2);
      g.line(x, y - 3, x, y + 3, C.gold2);
      break;
    default:
  }
}

const MAP_DECOR = {
  spring: ['peach', 'peach', 'pine'],
  summer: ['rockr', 'lava', 'rockr'],
  loess: ['mesa', 'stump', 'mesa'],
  autumn: ['maple', 'sword', 'maple'],
  winter: ['snowpine', 'ice', 'snowpine'],
  void: ['isle', 'star', 'star'],
};

// Terrain for a chapter map. Decorations stay clear of the road so nodes remain easy to see.
function mapBg(themeId, w, h, path) {
  const th = THEMES[themeId];
  const g = new Grid(w, h);
  const base = themeId === 'void' ? 0x151030 : themeId === 'winter' ? 0xcfe5ef : th.g[1];
  const alt = themeId === 'void' ? 0x1c1640 : themeId === 'winter' ? 0xbfd9e8 : th.g[0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = fbm1(x * 0.04 + y * 0.013, 2, 3) + fbm1(y * 0.05 - x * 0.012, 7, 3);
      let c = v > 1.02 ? alt : base;
      const n = hash(x >> 1, y >> 1, 4);
      if (n > 0.96) c = drk(c, 0.16);
      else if (n < 0.03) c = lit(c, 0.14);
      g.set(x, y, c);
    }
  }
  if (themeId === 'void') {
    for (let i = 0; i < 260; i++) g.set(hash(i, 1, 3) * w, hash(i, 2, 3) * h, hash(i, 3, 3) > 0.7 ? C.gold2 : C.ink4);
  }
  // Road, drawn as a soft band with stepping stones on top.
  const road = themeId === 'void' ? 0x3a3058 : themeId === 'winter' ? 0x8fb4cc : themeId === 'summer' ? 0x2e1618 : C.ochre2;
  const stone = themeId === 'void' ? 0x7a6aa8 : themeId === 'winter' ? 0xf4fbff : themeId === 'summer' ? 0x7a4034 : C.paper2;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let k = 0; k <= n; k++) {
      const s = k / n;
      const x = a.x + (b.x - a.x) * s + Math.sin(s * Math.PI) * (a.bend || 0);
      const y = a.y + (b.y - a.y) * s;
      g.rect(Math.round(x - 3), Math.round(y - 3), 6, 6, road);
    }
    for (let k = 0; k <= n; k += 6) {
      const s = k / n;
      const x = a.x + (b.x - a.x) * s + Math.sin(s * Math.PI) * (a.bend || 0);
      const y = a.y + (b.y - a.y) * s;
      g.rect(Math.round(x - 1), Math.round(y - 1), 3, 2, stone);
    }
  }
  const kinds = MAP_DECOR[themeId];
  const clear = (x, y) => path.every((p) => Math.hypot(p.x - x, p.y - y) > 26);
  const items = [];
  for (let i = 0; i < (h / w) * 34; i++) {
    const x = hash(i, 11, 6) * w, y = 18 + hash(i, 13, 6) * (h - 18);
    if (clear(x, y) && !nearRoad(path, x, y, 13)) items.push({ x: Math.round(x), y: Math.round(y), k: kinds[i % kinds.length] });
  }
  items.sort((p, q) => p.y - q.y).forEach((d) => decor(g, d.k, d.x, d.y));
  return g;
}

function nearRoad(path, x, y, r) {
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    const n = 16;
    for (let k = 0; k <= n; k++) {
      const s = k / n;
      const px = a.x + (b.x - a.x) * s + Math.sin(s * Math.PI) * (a.bend || 0);
      if (Math.hypot(px - x, a.y + (b.y - a.y) * s - y) < r) return true;
    }
  }
  return false;
}

// ---- Post station hub ----
function roof(g, x, y, w, c) {
  g.poly([[x - 8, y + 9], [x + w + 8, y + 9], [x + w, y], [x, y]], c);
  for (let i = x - 4; i < x + w + 5; i += 3) g.line(i, y + 1, i + (i < x + w / 2 ? -1 : 1), y + 8, drk(c, 0.32));
  g.rect(x - 8, y + 9, w + 16, 2, drk(c, 0.45));
  g.rect(x, y - 1, w, 2, lit(c, 0.2));
  g.poly([[x - 11, y + 5], [x - 8, y + 9], [x - 4, y + 9]], c);
  g.poly([[x + w + 11, y + 5], [x + w + 8, y + 9], [x + w + 4, y + 9]], c);
}

function hubScene(w, h, stars) {
  const g = new Grid(w, h);
  const gy = h - 34;
  skyBand(g, 0, gy + 2, [0x0f0d26, 0x1e2152, 0x3e3a78, 0xb06a78]);
  for (let i = 0; i < 90; i++) g.set(hash(i, 1, 5) * w, hash(i, 2, 5) * gy * 0.72, hash(i, 4, 5) > 0.8 ? C.paper : C.ink4);
  ridge(g, gy - 16, 42, 0.017, 4, 0x2c2a5a);
  ridge(g, gy - 2, 28, 0.034, 8, 0x201e44, 0x34315f);
  // Ground
  for (let y = gy; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = hash(x >> 1, y >> 1, 3);
      g.set(x, y, v > 0.9 ? 0x262040 : v < 0.08 ? 0x4a3a5a : 0x352b4c);
    }
  }
  const cx = Math.round(w / 2);
  // Station hall
  const hx = cx - 58, hw = 72, hy = gy - 34;
  g.rect(hx, hy + 9, hw, 34, 0x8a5a3c);
  for (let i = 0; i < 5; i++) g.rect(hx + i * 18, hy + 9, 3, 34, 0x4a2c28);
  g.rect(hx, hy + 9, hw, 3, 0x4a2c28);
  g.rect(hx + 26, hy + 19, 19, 24, 0x2a1a28);
  g.rect(hx + 28, hy + 21, 7, 22, 0xf0b458);
  g.rect(hx + 37, hy + 21, 6, 22, 0xc98a40);
  g.rect(hx + 6, hy + 19, 12, 11, 0x2a1a28);
  g.rect(hx + 8, hy + 21, 8, 7, 0xf0d070);
  g.rect(hx + 11, hy + 21, 1, 7, 0x2a1a28);
  g.rect(hx + 8, hy + 24, 8, 1, 0x2a1a28);
  g.rect(hx + 54, hy + 19, 12, 11, 0x2a1a28);
  g.rect(hx + 56, hy + 21, 8, 7, 0xf0d070);
  g.rect(hx + 59, hy + 21, 1, 7, 0x2a1a28);
  g.rect(hx + 56, hy + 24, 8, 1, 0x2a1a28);
  roof(g, hx, hy, hw, 0x3a4a68);
  roof(g, hx + 16, hy - 16, hw - 32, 0x34425f);
  g.rect(hx + 20, hy - 7, hw - 40, 7, 0x8a5a3c);
  // Sign board with a flag
  g.rect(hx + 26, hy + 11, 19, 7, C.ink2);
  g.rect(hx + 27, hy + 12, 17, 5, C.gold3);
  // Lanterns
  [hx + 22, hx + 49].forEach((lx) => {
    g.rect(lx, hy + 11, 1, 3, C.ink);
    g.ell(lx, hy + 16, 2, 2, C.red);
    g.set(lx, hy + 16, C.gold2);
  });
  // Flagpole
  g.rect(hx - 8, gy - 62, 2, 62, C.ochre2);
  g.poly([[hx - 6, gy - 62], [hx + 11, gy - 58], [hx - 6, gy - 50]], C.red);
  g.set(hx - 3, gy - 57, C.gold2);
  // Star altar on the right
  const ax = cx + 62;
  g.rect(ax - 18, gy - 6, 36, 6, 0x5a5478);
  g.rect(ax - 14, gy - 12, 28, 6, 0x6c668c);
  g.rect(ax - 10, gy - 18, 20, 6, 0x7f79a0);
  g.rect(ax - 18, gy - 6, 36, 1, 0x8d88ad);
  g.rect(ax - 14, gy - 12, 28, 1, 0x9d98bd);
  g.rect(ax - 10, gy - 18, 20, 1, 0xaba6c8);
  // Horse post and travel pack
  g.rect(hx + hw + 5, gy - 16, 3, 16, C.ochre2);
  g.rect(hx + hw + 1, gy - 14, 11, 2, C.ochre);
  g.rect(hx + hw + 13, gy - 7, 10, 7, C.ochre);
  g.rect(hx + hw + 13, gy - 7, 10, 2, C.ochre3);
  // Foreground grass
  for (let i = 0; i < 80; i++) {
    const x = hash(i, 7, 7) * w, y = gy + 4 + hash(i, 8, 7) * 28;
    g.rect(x, y, 1, 2, 0x4a4468);
  }
  return g;
}

// The peach tree that grows at the station door after the true ending.
function peachSprite() {
  const g = new Grid(54, 68);
  peachTree(g, 26, 66, 44);
  return g.outline();
}

module.exports = { battleBg, mapBg, hubScene, dipperPoints, peachSprite, THEMES };
