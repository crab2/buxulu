// Baked scenery. Each region is built from repeating layers: sky, far range, middle ground, near props
// and ground. The road scrolls them at different speeds; battles and menus stack them into one picture,
// so a fight always happens in the place the party was just walking through.
const { Grid, hash, fbm1, fbmLoop } = require('../core/paint.js');
const { C, mix, lit, drk } = require('../core/palette.js');

const TILE = 512;
const GROUND_TILE = 256;

const THEMES = {
  spring: { sky: [0x8fd4cf, 0xc4e6d6, 0xf7e3cc, 0xf7c9c8], far: 0x9cc9bd, mid: 0x6fae95, near: 0x3f8a6c, g: [0x7fbb6a, 0x5fa25c, 0x3f8656], road: 0xc9a673, road2: 0xa8855a, speck: C.peach2 },
  summer: { sky: [0x2c1644, 0x7a2438, 0xc8402f, 0xf0853c], far: 0x5c2438, mid: 0x3e1a2e, near: 0x281222, g: [0x5e2c28, 0x45201f, 0x2e1618], road: 0x7a4634, road2: 0x583024, speck: C.red3 },
  loess: { sky: [0xc2a064, 0xdcc084, 0xecd6a0, 0xf6e6bc], far: 0xcaa468, mid: 0xac8048, near: 0x7e5630, g: [0xcc9a5c, 0xb07e46, 0x8e6236], road: 0xe0bc80, road2: 0xba9258, speck: C.ochre2 },
  autumn: { sky: [0x4a3c6c, 0x8a5a6a, 0xd0885a, 0xeeb860], far: 0x7a5668, mid: 0x5c4256, near: 0x3a2a3e, g: [0xb0702e, 0x8e5628, 0x683e22], road: 0xc89a5e, road2: 0x9a7040, speck: C.gold },
  winter: { sky: [0x0e2044, 0x1c4470, 0x3a7a9a, 0x9ed0d8], far: 0x5a8aa8, mid: 0x8cb4cc, near: 0x2a5a6a, g: [0xe6f4f8, 0xc8e0ee, 0xa4c8e0], road: 0xb4d0e4, road2: 0x94b8d4, speck: C.white },
  void: { sky: [0x090818, 0x161034, 0x2a1c58, 0x4a2e80], far: 0x2c2058, mid: 0x1e1644, near: 0x130e2e, g: [0x4a3e6c, 0x352c54, 0x241d3e], road: 0x6a5c94, road2: 0x4e4276, speck: C.gold2 },
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

function sparkle(g, x, y, c) {
  g.set(x, y, c);
  g.set(x - 1, y, mix(c, 0x000000, 0.35));
  g.set(x + 1, y, mix(c, 0x000000, 0.35));
  g.set(x, y - 1, mix(c, 0x000000, 0.35));
  g.set(x, y + 1, mix(c, 0x000000, 0.35));
}

// A soft disc with a halo: sun or moon.
function orb(g, x, y, r, c, halo) {
  for (let i = 3; i > 0; i--) {
    const rr = r + i * 4;
    for (let yy = -rr; yy <= rr; yy++) {
      for (let xx = -rr; xx <= rr; xx++) {
        const d = Math.hypot(xx, yy);
        if (d > rr || d < r) continue;
        const px = x + xx, py = y + yy;
        const under = g.get(px, py);
        if (under !== -1 && hash(px, py, i) < 0.5 - i * 0.12) g.set(px, py, mix(under, halo, 0.28));
      }
    }
  }
  g.ell(x, y, r, r, c);
}

function cloudBank(g, x, y, w, c, shadow) {
  const puffs = Math.max(3, Math.round(w / 9));
  for (let i = 0; i < puffs; i++) {
    const px = x + (i / (puffs - 1)) * w;
    const k = 1 - Math.abs(i / (puffs - 1) - 0.5) * 1.5;
    const r = 2 + k * (3 + hash(i, x, 4) * 3);
    g.ell(px, y - r * 0.4, r * 1.4, r, c);
  }
  g.rect(x - 3, y, w + 6, 2, c);
  if (shadow !== undefined) g.rect(x, y + 2, w, 1, shadow);
}

// A mountain range drawn from looping noise, with a lit edge and a hazy foot.
function range(g, base, amp, cycles, seed, col, o) {
  o = o || {};
  const haze = o.haze;
  for (let x = 0; x < g.w; x++) {
    const n = fbmLoop(x / g.w, cycles, seed, o.oct || 4);
    const top = Math.round(base - n * amp);
    for (let y = top; y < g.h; y++) {
      let c = col;
      if (haze !== undefined) c = mix(col, haze, Math.min(0.75, ((y - top) / Math.max(1, amp * 1.4)) * 0.7));
      g.set(x, y, c);
    }
    if (o.edge !== undefined) {
      g.set(x, top, o.edge);
      if (o.snow && hash(x, 3, seed) > 0.3) {
        const depth = 1 + Math.floor(hash(x >> 1, 5, seed) * o.snow);
        for (let k = 0; k < depth; k++) g.set(x, top + k, o.edge);
      }
    }
    // Facets: darker strokes falling away from the ridge line.
    if (o.facet !== undefined && hash(x >> 2, 7, seed) > 0.72) {
      const len = 3 + Math.floor(hash(x, 9, seed) * amp * 0.28);
      for (let k = 1; k < len; k++) g.set(x + Math.floor(k * 0.5), top + k, o.facet);
    }
  }
}

// ---- Props ----
function peachTree(g, x, y, s) {
  const trunk = C.ochre2;
  g.line(x, y, x - s * 0.1, y - s * 0.62, trunk, Math.max(2, Math.round(s * 0.09)));
  g.line(x - s * 0.05, y - s * 0.36, x + s * 0.3, y - s * 0.56, trunk, 1);
  g.line(x - s * 0.06, y - s * 0.46, x - s * 0.32, y - s * 0.64, trunk, 1);
  const puffs = [[0, -0.82, 0.44], [-0.36, -0.66, 0.3], [0.36, -0.68, 0.32], [0.08, -1.06, 0.3], [-0.2, -0.98, 0.24]];
  puffs.forEach((q) => g.ell(x + q[0] * s, y + q[1] * s + s * 0.05, q[2] * s, q[2] * s * 0.82, C.peach3));
  puffs.forEach((q) => g.ell(x + q[0] * s - s * 0.03, y + q[1] * s, q[2] * s * 0.95, q[2] * s * 0.78, C.peach));
  puffs.forEach((q) => g.ell(x + q[0] * s - s * 0.08, y + q[1] * s - s * 0.06, q[2] * s * 0.55, q[2] * s * 0.42, C.peach2));
  for (let i = 0; i < s * 3; i++) {
    const a = hash(i, x, 2) * 6.28, r = hash(i, y, 3) * s * 0.6;
    g.set(x + Math.cos(a) * r, y - s * 0.82 + Math.sin(a) * r * 0.8, hash(i, 1, 4) > 0.45 ? 0xfff0f0 : C.peach3);
  }
}

function pine(g, x, y, s, c, c2, snow) {
  g.rect(x - 1, y - s * 0.32, 2, s * 0.32, C.ochre2);
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const w = s * (0.46 - i * 0.1), top = y - s * (0.56 + i * 0.22), bot = y - s * (0.22 + i * 0.22);
    g.poly([[x - w, bot], [x, top], [x + w, bot]], c);
    g.poly([[x, top], [x + w, bot], [x + 1, bot]], c2);
    if (snow) g.poly([[x - w * 0.5, top + (bot - top) * 0.5], [x, top], [x + w * 0.5, top + (bot - top) * 0.5]], snow);
  }
}

function pavilion(g, x, y) {
  const pillar = 0x8e2a25, roofC = 0x2f5a5a, roofH = 0x4a8078;
  g.rect(x - 15, y - 2, 30, 2, 0x8d88a0);
  g.rect(x - 11, y - 18, 2, 16, pillar);
  g.rect(x + 9, y - 18, 2, 16, pillar);
  g.rect(x - 1, y - 18, 2, 16, drk(pillar, 0.25));
  g.rect(x - 12, y - 8, 24, 1, 0x6c3f26);
  g.poly([[x - 20, y - 18], [x + 20, y - 18], [x + 12, y - 27], [x - 12, y - 27]], roofC);
  g.poly([[x - 12, y - 27], [x + 12, y - 27], [x + 4, y - 33], [x - 4, y - 33]], roofH);
  g.line(x - 20, y - 18, x - 24, y - 21, roofC);
  g.line(x + 20, y - 18, x + 24, y - 21, roofC);
  g.rect(x - 20, y - 18, 40, 1, roofH);
  g.rect(x, y - 36, 1, 3, C.gold);
}

function gateTower(g, x, y) {
  const s = 0x4a3f55, s2 = 0x5c4f68, r = 0x2b2438;
  g.rect(x, y - 40, 60, 40, s);
  g.rect(x, y - 40, 3, 40, s2);
  for (let i = 0; i < 18; i++) g.rect(x + hash(i, 1, 4) * 54, y - 4 - hash(i, 2, 4) * 34, 3 + hash(i, 3, 4) * 3, 1, drk(s, 0.25));
  g.rect(x + 22, y - 22, 16, 22, C.ink);
  g.ell(x + 30, y - 22, 8, 7, C.ink);
  for (let i = 0; i < 6; i++) g.rect(x + i * 11, y - 44, 6, 4, s);
  g.poly([[x - 6, y - 52], [x + 66, y - 52], [x + 56, y - 62], [x + 4, y - 62]], r);
  g.rect(x + 8, y - 52, 44, 8, 0x3a3048);
  g.rect(x + 8, y - 51, 44, 1, C.red2);
  g.line(x - 6, y - 52, x - 10, y - 55, r);
  g.line(x + 66, y - 52, x + 70, y - 55, r);
  g.rect(x + 12, y - 50, 3, 4, 0x8e2a25);
  g.rect(x + 44, y - 50, 3, 4, 0x8e2a25);
}

function spire(g, x, y, h, w, c) {
  g.poly([[x - w, y], [x, y - h], [x + w * 0.8, y]], c);
  g.poly([[x, y - h], [x + w * 0.8, y], [x + 1, y]], drk(c, 0.2));
  g.line(x - 1, y - h + 3, x - w * 0.4, y - 2, lit(c, 0.45));
}

function maple(g, x, y, s) {
  g.line(x, y, x, y - s * 0.55, C.ochre2, 2);
  g.line(x, y - s * 0.3, x + s * 0.28, y - s * 0.55, C.ochre2);
  [[0, -0.8, 0.46, C.red2], [-0.3, -0.62, 0.3, C.red], [0.32, -0.68, 0.32, C.red]].forEach((q) => g.ell(x + q[0] * s, y + q[1] * s, q[2] * s, q[2] * s * 0.8, q[3]));
  [[-0.08, -0.88, 0.32, C.red3], [0.28, -0.74, 0.18, C.gold], [-0.28, -0.7, 0.16, C.gold]].forEach((q) => g.ell(x + q[0] * s, y + q[1] * s, q[2] * s, q[2] * s * 0.75, q[3]));
  for (let i = 0; i < s; i++) g.set(x + (hash(i, x, 2) - 0.5) * s, y - s * 0.8 + (hash(i, y, 3) - 0.5) * s * 0.7, hash(i, 1, 4) > 0.5 ? C.gold2 : C.red2);
}

function ruinPillar(g, x, y, h, c) {
  g.rect(x, y - h, 9, h, c);
  g.rect(x, y - h, 2, h, lit(c, 0.22));
  g.rect(x + 7, y - h, 2, h, drk(c, 0.3));
  g.rect(x - 2, y - 3, 13, 3, drk(c, 0.15));
  // A broken top rather than a clean cut.
  g.rect(x + 5, y - h, 4, 2, -1);
  g.rect(x + 7, y - h + 2, 2, 2, -1);
  for (let i = 0; i < 5; i++) g.set(x + hash(i, h, 2) * 9, y - hash(i, x, 3) * h, drk(c, 0.45));
}

function terracottaFile(g, x, y, n, c) {
  for (let i = 0; i < n; i++) {
    const px = x + i * 8;
    g.rect(px, y - 8, 4, 8, c);
    g.ell(px + 2, y - 10, 2, 2, c);
    g.rect(px + 5, y - 13, 1, 13, drk(c, 0.2));
  }
}

function deadTree(g, x, y, s, c) {
  g.line(x, y, x + s * 0.06, y - s * 0.6, c, 2);
  g.line(x + s * 0.04, y - s * 0.4, x - s * 0.3, y - s * 0.74, c);
  g.line(x + s * 0.06, y - s * 0.52, x + s * 0.34, y - s * 0.8, c);
  g.line(x + s * 0.06, y - s * 0.6, x + s * 0.02, y - s, c);
}

function swordStuck(g, x, y) {
  g.line(x, y, x + 2, y - 16, 0xb8bdcc, 2);
  g.line(x + 1, y, x + 3, y - 16, 0xe6e8ee);
  g.rect(x - 3, y - 15, 9, 2, C.gold3);
  g.rect(x, y - 20, 3, 5, C.ochre2);
}

function floatingIsle(g, x, y, w, c, c2) {
  g.ell(x, y, w, 4, c);
  g.poly([[x - w * 0.8, y + 2], [x + w * 0.8, y + 2], [x + w * 0.15, y + w * 0.9], [x - w * 0.25, y + w * 0.6]], c2);
  g.rect(x - w * 0.6, y - 2, w * 1.2, 1, lit(c, 0.35));
}

function starPillar(g, x, y, h, c) {
  g.rect(x, y - h, 8, h, c);
  g.rect(x, y - h, 2, h, lit(c, 0.25));
  g.rect(x - 2, y - h - 3, 12, 3, lit(c, 0.15));
  for (let i = 0; i < 3; i++) g.set(x + 4, y - h + 8 + i * Math.floor(h / 3.5), C.gold2);
}

// ---- Layers. Each returns a transparent, repeating grid whose base line is y = h. ----
function clouds(themeId, th, h) {
  const g = new Grid(TILE, h);
  g.wrap = true;
  const spec = {
    spring: [0xfdf6ea, 0xe6d4cc, 7], summer: [0x8a3a3a, 0x6a2a34, 4], loess: [0xf8e8bc, 0xdcc48c, 6],
    autumn: [0xc08a6c, 0x8a5a60, 6], winter: [0x3a6a8c, 0x28507a, 5], void: [0x3a2c6c, 0x2a2054, 5],
  }[themeId];
  for (let i = 0; i < spec[2]; i++) {
    const x = hash(i, 3, 41) * TILE, y = h * 0.16 + hash(i, 5, 41) * h * 0.62, w = 22 + hash(i, 7, 41) * 46;
    cloudBank(g, x, y, w, spec[0], spec[1]);
  }
  return g;
}

function farLayer(themeId, th, h) {
  const g = new Grid(TILE, h);
  g.wrap = true;
  const base = h - 4;
  switch (themeId) {
    case 'spring':
      range(g, base, h * 0.72, 5, 11, th.far, { edge: lit(th.far, 0.3), haze: th.sky[3], facet: drk(th.far, 0.12) });
      break;
    case 'summer':
      range(g, base, h * 0.8, 9, 15, th.far, { edge: C.red3, facet: drk(th.far, 0.25) });
      break;
    case 'loess':
      range(g, base, h * 0.5, 4, 17, th.far, { edge: lit(th.far, 0.25), haze: th.sky[3] });
      for (let i = 0; i < 5; i++) {
        const x = hash(i, 1, 8) * TILE, w = 30 + hash(i, 2, 8) * 46, tp = base - h * (0.34 + hash(i, 3, 8) * 0.34);
        const c = mix(th.far, th.sky[3], 0.28);
        g.poly([[x - 9, base], [x, tp], [x + w, tp], [x + w + 11, base]], c);
        g.poly([[x + w * 0.6, tp], [x + w, tp], [x + w + 11, base], [x + w * 0.7, base]], drk(c, 0.1));
        g.rect(x, tp, w, 2, lit(c, 0.3));
        for (let k = 1; k < 4; k++) {
          const yy = tp + ((base - tp) * k) / 4;
          g.line(x - 2, yy, x + w + 2, yy + (k % 2), drk(c, 0.08));
        }
      }
      break;
    case 'autumn':
      range(g, base, h * 0.7, 5, 19, th.far, { edge: lit(th.far, 0.35), haze: th.sky[3] });
      break;
    case 'winter':
      range(g, base, h * 0.86, 7, 23, th.far, { edge: 0xe6f4f8, snow: 8, haze: th.sky[3], facet: drk(th.far, 0.2) });
      break;
    default:
      for (let i = 0; i < 8; i++) {
        const x = hash(i, 1, 9) * TILE, y = h * 0.2 + hash(i, 2, 9) * h * 0.6, w = 10 + hash(i, 3, 9) * 24;
        floatingIsle(g, x, y, w, th.far, drk(th.far, 0.35));
      }
  }
  return g;
}

function midLayer(themeId, th, h) {
  const g = new Grid(TILE, h);
  g.wrap = true;
  const base = h - 2;
  switch (themeId) {
    case 'spring':
      range(g, base, h * 0.62, 6, 23, th.mid, { edge: lit(th.mid, 0.35), oct: 3 });
      for (let i = 0; i < 16; i++) {
        const x = hash(i, 1, 7) * TILE;
        const n = fbmLoop(x / TILE, 6, 23, 3);
        const y = base - n * h * 0.62 + 6 + hash(i, 4, 7) * 18;
        g.ell(x, y, 5 + hash(i, 2, 7) * 7, 4 + hash(i, 3, 7) * 4, hash(i, 5, 7) > 0.5 ? 0xf0b4c0 : 0x5e9e80);
      }
      pavilion(g, 150, base - h * 0.26);
      break;
    case 'summer': {
      range(g, base, h * 0.42, 6, 27, th.mid, { edge: drk(C.red, 0.2), facet: drk(th.mid, 0.3) });
      // The volcano that keeps the sky lit, with lava down its flank.
      const vx = 210, vy = base;
      g.poly([[vx - 74, vy], [vx - 13, vy - h * 0.92], [vx + 13, vy - h * 0.92], [vx + 74, vy]], 0x32162a);
      g.poly([[vx, vy - h * 0.92], [vx + 13, vy - h * 0.92], [vx + 74, vy], [vx + 16, vy]], 0x271022);
      g.rect(vx - 13, vy - h * 0.92 - 2, 26, 3, C.gold);
      g.line(vx - 4, vy - h * 0.92, vx - 18, vy - h * 0.5, C.red3, 2);
      g.line(vx - 18, vy - h * 0.5, vx - 12, vy - h * 0.2, C.red, 2);
      g.line(vx + 6, vy - h * 0.92, vx + 20, vy - h * 0.34, C.red3, 2);
      g.line(vx + 20, vy - h * 0.34, vx + 34, vy - 2, C.red, 2);
      break;
    }
    case 'loess':
      range(g, base, h * 0.4, 5, 29, th.mid, { edge: lit(th.mid, 0.25), oct: 3 });
      terracottaFile(g, 40, base - 6, 12, drk(th.mid, 0.28));
      terracottaFile(g, 300, base - 3, 16, drk(th.mid, 0.28));
      ruinPillar(g, 200, base - 2, h * 0.5, th.mid);
      ruinPillar(g, 222, base - 2, h * 0.32, th.mid);
      break;
    case 'autumn':
      range(g, base, h * 0.34, 5, 31, th.mid, { edge: lit(th.mid, 0.3), oct: 3 });
      // The long wall of the pass, with its gate.
      g.rect(0, base - h * 0.34, TILE, h * 0.34 + 2, 0x4e3f58);
      for (let x = 0; x < TILE; x += 12) g.rect(x, base - h * 0.34 - 4, 7, 4, 0x4e3f58);
      for (let i = 0; i < 40; i++) g.rect(hash(i, 1, 3) * TILE, base - hash(i, 2, 3) * h * 0.3, 4, 1, 0x3e3048);
      gateTower(g, 180, base);
      break;
    case 'winter':
      range(g, base, h * 0.46, 7, 33, th.mid, { edge: 0xe6f4f8, snow: 5, oct: 3 });
      [[60, 44, 14], [110, 26, 10], [240, 54, 16], [290, 28, 9], [420, 40, 13]].forEach((q) => spire(g, q[0], base, q[1], q[2], 0x9fd0e0));
      // Roofs of the buried city, just showing above the drift.
      [[150, 24], [344, 30], [380, 22]].forEach((q) => {
        g.poly([[q[0] - q[1], base], [q[0] - q[1] * 0.7, base - 11], [q[0] + q[1] * 0.7, base - 11], [q[0] + q[1], base]], 0x2a4a6a);
        g.rect(q[0] - q[1] * 0.7, base - 13, q[1] * 1.4, 3, 0xe6f4f8);
      });
      break;
    default:
      for (let i = 0; i < 7; i++) {
        const x = hash(i, 1, 13) * TILE, y = h * 0.38 + hash(i, 2, 13) * h * 0.4, w = 18 + hash(i, 3, 13) * 30;
        floatingIsle(g, x, y, w, th.mid, drk(th.mid, 0.4));
        if (i % 2) starPillar(g, x - 4, y - 2, 18 + hash(i, 4, 13) * 18, 0x3a2e6a);
      }
  }
  return g;
}

function nearLayer(themeId, th, h) {
  const g = new Grid(TILE, h);
  g.wrap = true;
  const base = h - 1;
  const hedge = (col, edge, seed, amp) => range(g, base + 2, amp, 11, seed, col, { edge, oct: 3 });
  switch (themeId) {
    case 'spring':
      hedge(th.near, lit(th.near, 0.3), 37, h * 0.3);
      [[40, 44], [120, 30], [200, 54], [290, 34], [370, 48], [460, 28]].forEach((q) => peachTree(g, q[0], base, q[1]));
      pine(g, 86, base, 34, 0x1f5a4a, 0x174a3e);
      pine(g, 334, base, 40, 0x1f5a4a, 0x174a3e);
      break;
    case 'summer':
      hedge(th.near, 0x5c2438, 39, h * 0.28);
      for (let i = 0; i < 14; i++) {
        const x = hash(i, 1, 21) * TILE, s = 12 + hash(i, 2, 21) * 30;
        g.poly([[x - s * 0.34, base], [x - s * 0.04, base - s], [x + s * 0.34, base]], 0x1e0c1c);
        g.line(x - s * 0.04, base - s, x - s * 0.2, base - 1, 0x4a1e30);
      }
      [[70, 40], [250, 32], [400, 46]].forEach((q) => deadTree(g, q[0], base, q[1], 0x1a0a18));
      break;
    case 'loess':
      hedge(th.near, lit(th.near, 0.25), 41, h * 0.22);
      [[60, 50], [300, 40]].forEach((q) => deadTree(g, q[0], base, q[1], 0x4e3420));
      ruinPillar(g, 140, base, 40, C.ochre);
      ruinPillar(g, 162, base, 22, C.ochre);
      ruinPillar(g, 420, base, 34, C.ochre);
      // A tattered war banner
      g.rect(240, base - 50, 2, 50, 0x4e3420);
      g.poly([[242, base - 50], [262, base - 46], [256, base - 38], [262, base - 30], [242, base - 32]], C.red2);
      break;
    case 'autumn':
      hedge(th.near, lit(th.near, 0.3), 43, h * 0.24);
      [[50, 48], [140, 34], [240, 54], [340, 38], [440, 46]].forEach((q) => maple(g, q[0], base, q[1]));
      [[96, 2], [200, 0], [290, 2], [392, 0]].forEach((q) => swordStuck(g, q[0], base - q[1]));
      break;
    case 'winter':
      hedge(0xdcecf4, 0xffffff, 47, h * 0.26);
      [[40, 46], [110, 32], [210, 52], [320, 38], [420, 48]].forEach((q) => pine(g, q[0], base, q[1], th.near, drk(th.near, 0.25), 0xf0f8fc));
      [[160, 30, 9], [370, 36, 10]].forEach((q) => spire(g, q[0], base, q[1], q[2], 0xaad8e6));
      break;
    default:
      for (let x = 0; x < TILE; x += 2) {
        const n = fbmLoop(x / TILE, 9, 49, 3);
        const top = Math.round(base + 2 - n * h * 0.22);
        for (let y = top; y < h; y++) {
          g.rect(x, y, 2, 1, y === top ? 0x4a3a78 : 0x241c48);
        }
      }
      [[70, 44], [180, 30], [330, 52], [440, 36]].forEach((q) => starPillar(g, q[0], base, q[1], 0x3a2e6a));
  }
  return g;
}

// The ground, with the road the party walks along. It blends through its colours with a dither instead
// of hard bands, and small marks give it texture without adding noise.
function groundGrid(themeId, w, h, wrap) {
  const th = THEMES[themeId];
  const g = new Grid(w, h);
  g.wrap = !!wrap;
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const stops = th.g;
  const roadTop = Math.round(h * 0.34), roadBot = Math.round(h * 0.74);
  const edgeAt = (x, seed, range_) => Math.round((fbmLoop(x / w, 8, seed, 3) - 0.5) * range_);
  for (let x = 0; x < w; x++) {
    const rt = roadTop + edgeAt(x, 5, 6), rb = roadBot + edgeAt(x, 9, 7);
    for (let y = 0; y < h; y++) {
      const t = (y / Math.max(1, h)) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(t));
      const v = (t - i) * 4;
      const k = Math.floor(v);
      const thresh = (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      const f = (k + (v - k > thresh ? 1 : 0)) / 4;
      let c = mix(stops[i], stops[i + 1], f);
      if (y >= rt && y <= rb) {
        const rv = (y - rt) / Math.max(1, rb - rt);
        const edge = Math.min(y - rt, rb - y);
        c = mix(th.road, th.road2, rv > thresh * 0.6 + 0.3 ? 1 : 0);
        if (edge < 2) c = mix(c, stops[i], 0.55);
      }
      g.set(x, y, c);
    }
    g.set(x, 0, lit(stops[0], 0.34));
  }
  const n = Math.round((w * h) / 90);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash(i, 8, 1) * w), y = Math.floor(hash(i, 9, 1) * h);
    const rt = roadTop + edgeAt(x, 5, 6), rb = roadBot + edgeAt(x, 9, 7);
    const onRoad = y >= rt - 1 && y <= rb + 1;
    const r = hash(i, 11, 1);
    if (onRoad) {
      // Stones and ruts on the road itself.
      if (r > 0.6) {
        g.rect(x, y, 2 + Math.floor(r * 3), 1, drk(th.road2, 0.22));
        g.set(x, y - 1, lit(th.road, 0.18));
      }
      continue;
    }
    switch (themeId) {
      case 'spring':
        if (r > 0.72) {
          g.set(x, y, C.peach2);
          g.set(x + 1, y, C.peach);
        } else if (r > 0.3) {
          g.set(x, y, lit(th.g[1], 0.3));
          g.set(x, y - 1, lit(th.g[1], 0.18));
        } else g.set(x, y, drk(th.g[1], 0.3));
        break;
      case 'summer':
        if (r > 0.7) {
          g.line(x, y, x + 4 + r * 5, y + (r > 0.85 ? 1 : 0), C.red3);
          g.set(x + 2, y, C.gold);
        } else g.set(x, y, 0x1a0c12);
        break;
      case 'loess':
        g.rect(x, y, 1 + Math.floor(r * 3), 1, r > 0.5 ? lit(th.g[1], 0.25) : drk(th.g[1], 0.25));
        break;
      case 'autumn':
        g.rect(x, y, 2, 1, [C.gold, C.red, C.red3, C.ochre3][Math.floor(r * 4)]);
        break;
      case 'winter':
        g.rect(x, y, 1 + Math.floor(r * 3), 1, r > 0.55 ? 0xffffff : 0x9cc4dc);
        break;
      default:
        if (r > 0.7) sparkle(g, x, y, C.gold2);
        else g.rect(x, y, 2, 1, 0x2a2244);
    }
  }
  // Star engravings set into the terrace of the last region.
  if (themeId === 'void') {
    for (let x = 0; x < w; x += 32) g.rect(x, Math.round(h * 0.34), 1, Math.round(h * 0.4), 0x3a3060);
  }
  return g;
}

// Blades of grass and drifts that pass in front of the party at the fastest speed, for depth.
function foreLayer(themeId, h) {
  const g = new Grid(TILE, h);
  g.wrap = true;
  const th = THEMES[themeId];
  const col = drk(th.g[2], 0.3), col2 = drk(th.g[2], 0.12);
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(hash(i, 1, 51) * TILE);
    if (hash(i, 6, 51) > 0.55) continue;
    const s = 6 + hash(i, 2, 51) * (h - 8);
    switch (themeId) {
      case 'summer':
        g.poly([[x - s * 0.5, h], [x + 1, h - s], [x + s * 0.5, h]], 0x12060e);
        break;
      case 'winter':
        g.ell(x, h, s * 1.2, s * 0.5, 0xf4fbff);
        g.ell(x + 2, h, s * 0.9, s * 0.3, 0xcfe5f0);
        break;
      case 'void':
        g.ell(x, h, s * 1.6, s * 0.55, 0x3a2e6a);
        g.ell(x + 3, h, s * 1.1, s * 0.34, 0x4e4286);
        break;
      case 'loess':
        g.poly([[x - s, h], [x - s * 0.2, h - s * 0.5], [x + s * 0.6, h - s * 0.4], [x + s, h]], drk(th.g[2], 0.25));
        break;
      default:
        for (let k = -3; k <= 3; k++) g.line(x + k * 2, h, x + k * 3 + (k % 2), h - s * (1 - Math.abs(k) * 0.15), k % 2 ? col : col2);
    }
  }
  return g;
}

function skyGrid(themeId, w, h) {
  const th = THEMES[themeId];
  const g = new Grid(w, h);
  skyBand(g, 0, h, th.sky);
  const star = (n, top) => {
    for (let i = 0; i < n; i++) {
      const x = hash(i, 1, 9) * w, y = hash(i, 2, 9) * h * top;
      if (hash(i, 3, 9) > 0.82) sparkle(g, x, y, C.paper);
      else g.set(x, y, hash(i, 4, 9) > 0.6 ? C.gold2 : C.paper2);
    }
  };
  if (themeId === 'winter') {
    star(90, 0.55);
    // Aurora over the buried city.
    for (let x = 0; x < w; x++) {
      const y = h * 0.1 + fbm1(x * 0.024, 8, 2) * h * 0.2;
      for (let k = 0; k < 18; k++) if (hash(x, k, 2) > k / 18) g.set(x, y + k, mix(0x3a8a8a, 0x7fd1a4, 1 - k / 18));
    }
  }
  if (themeId === 'void') {
    star(150, 0.9);
    const pts = dipperPoints(w * 0.62, h * 0.12, w * 0.42);
    pts.forEach((q, i) => {
      if (i) g.line(pts[i - 1][0], pts[i - 1][1], q[0], q[1], 0x4a3a7a);
    });
    pts.forEach((q) => sparkle(g, q[0], q[1], C.gold2));
  }
  if (themeId === 'loess') orb(g, Math.round(w * 0.72), Math.round(h * 0.34), 16, 0xfff4cc, 0xfff4cc);
  if (themeId === 'autumn') orb(g, Math.round(w * 0.26), Math.round(h * 0.46), 15, 0xf8d88a, 0xf8d88a);
  if (themeId === 'spring') orb(g, Math.round(w * 0.2), Math.round(h * 0.24), 12, 0xfff8e8, 0xfff8e8);
  if (themeId === 'summer') {
    // The sun that refuses to set.
    orb(g, Math.round(w * 0.46), Math.round(h * 0.36), 24, 0xffd46a, 0xffb04a);
    g.ell(Math.round(w * 0.46), Math.round(h * 0.36), 18, 18, 0xfff0b0);
  }
  return g;
}

// How the layers of a scene stack up, for a scene of height h with its horizon at gy.
function layerPlan(h, gy) {
  return {
    clouds: { h: Math.round(gy * 0.62), y: Math.round(gy * 0.06), speed: 0.03 },
    far: { h: Math.round(gy * 0.64), y: gy - Math.round(gy * 0.64) + 2, speed: 0.08 },
    mid: { h: Math.round(gy * 0.46), y: gy - Math.round(gy * 0.46) + 2, speed: 0.2 },
    near: { h: Math.round(gy * 0.38), y: gy - Math.round(gy * 0.38) + 2, speed: 0.48 },
    ground: { h: h - gy, y: gy, speed: 1 },
  };
}

const LAYERS = { clouds, far: farLayer, mid: midLayer, near: nearLayer };

function layerGrid(themeId, name, lh) {
  return LAYERS[name](themeId, THEMES[themeId], lh);
}

// One flat picture of a region: used behind battles, menus and story scenes.
function battleBg(themeId, w, h) {
  const gy = Math.round(h * 0.56);
  const g = skyGrid(themeId, w, gy + 4);
  const out = new Grid(w, h);
  out.stamp(g, 0, 0);
  const plan = layerPlan(h, gy);
  ['clouds', 'far', 'mid', 'near'].forEach((name) => {
    const p = plan[name];
    const l = layerGrid(themeId, name, p.h);
    const shift = name === 'mid' ? 150 : name === 'far' ? 60 : name === 'near' ? 30 : 0;
    for (let y = 0; y < l.h; y++) {
      for (let x = 0; x < w; x++) {
        const c = l.d[y * l.w + ((x + shift) % l.w)];
        if (c !== -1) out.set(x, y + p.y, c);
      }
    }
  });
  out.stamp(groundGrid(themeId, w, h - gy), 0, gy);
  return out;
}

// Night sky with the Dipper. Lit stars shine; dim ones show how many are left to restore.
function dipperPoints(cx, cy, s) {
  const pts = [[0, 0], [0.34, 0.16], [0.42, 0.42], [0.1, 0.34], [-0.26, 0.2], [-0.58, 0.32], [-0.9, 0.2]];
  // Order: Tianshu, Tianxuan, Tianji, Tianquan, Yuheng, Kaiyang, Yaoguang.
  return pts.map((q) => [Math.round(cx + q[0] * s), Math.round(cy + q[1] * s)]);
}

// ---- World-map terrain ----
function decor(g, kind, x, y) {
  switch (kind) {
    case 'peach':
      peachTree(g, x, y, 15 + hash(x, y, 1) * 9);
      break;
    case 'pine':
      pine(g, x, y, 20, 0x1f5a4a, 0x174a3e);
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
      ruinPillar(g, x - 4, y, 14, C.ochre);
      break;
    case 'maple':
      maple(g, x, y, 22);
      break;
    case 'sword':
      swordStuck(g, x, y);
      break;
    case 'ice':
      spire(g, x, y, 13 + hash(x, y, 2) * 10, 6, 0x9fd0e0);
      break;
    case 'snowpine':
      pine(g, x, y, 20, 0x2a5a6a, 0x204a5a, 0xdff0f5);
      break;
    case 'isle':
      floatingIsle(g, x, y, 11, 0x4a3c70, 0x241c48);
      g.set(x - 3, y - 2, C.gold2);
      break;
    case 'star':
      sparkle(g, x, y, C.gold2);
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
  // The road: a soft shadow, a band and stepping stones on top.
  const road = themeId === 'void' ? 0x3a3058 : themeId === 'winter' ? 0x8fb4cc : themeId === 'summer' ? 0x2e1618 : C.ochre2;
  const stone = themeId === 'void' ? 0x7a6aa8 : themeId === 'winter' ? 0xf4fbff : themeId === 'summer' ? 0x7a4034 : C.paper2;
  const shadow = drk(base, 0.25);
  const walk = (fn) => {
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      for (let k = 0; k <= n; k++) {
        const s = k / n;
        fn(a.x + (b.x - a.x) * s + Math.sin(s * Math.PI) * (a.bend || 0), a.y + (b.y - a.y) * s, k);
      }
    }
  };
  walk((x, y) => g.rect(Math.round(x - 4), Math.round(y - 2), 9, 7, shadow));
  walk((x, y) => g.rect(Math.round(x - 3), Math.round(y - 3), 6, 6, road));
  walk((x, y, k) => { if (k % 6 === 0) g.rect(Math.round(x - 1), Math.round(y - 1), 3, 2, stone); });
  const kinds = MAP_DECOR[themeId];
  const clear = (x, y) => path.every((p) => Math.hypot(p.x - x, p.y - y) > 30);
  const items = [];
  for (let i = 0; i < (h / w) * 34; i++) {
    const x = hash(i, 11, 6) * w, y = 18 + hash(i, 13, 6) * (h - 18);
    if (clear(x, y) && !nearRoad(path, x, y, 18)) items.push({ x: Math.round(x), y: Math.round(y), k: kinds[i % kinds.length] });
  }
  items.sort((p, q) => p.y - q.y).forEach((d) => decor(g, d.k, d.x, d.y));
  return g;
}

module.exports = { battleBg, mapBg, skyGrid, groundGrid, foreLayer, layerGrid, layerPlan, dipperPoints, peachTree, pine, THEMES, TILE, GROUND_TILE };
