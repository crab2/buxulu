// The post station as a small diorama. It is painted once as a single picture. Anything that moves or
// changes (crops, the star disc, lantern glow, plaques) is drawn over it at runtime, using the spots
// returned by stationLayout.
const { Grid, hash, fbm1 } = require('../core/paint.js');
const { C, mix, lit, drk } = require('../core/palette.js');
const { pine, peachTree } = require('./scenery.js');

function stationLayout(w, h) {
  const gy = Math.round(h * 0.3);
  const cx = Math.round(w * 0.5);
  return {
    gy,
    hall: { x: cx - 6, y: gy + 34 },
    altar: { x: Math.round(w * 0.86), y: gy + 20 },
    furnace: { x: Math.round(w * 0.17), y: gy + Math.round(h * 0.235) },
    stable: { x: Math.round(w * 0.79), y: gy + Math.round(h * 0.245) },
    mail: { x: cx + 56, y: gy + 62 },
    garden: { x: Math.round(w * 0.05), y: gy + Math.round(h * 0.33), cell: 28 },
    pond: { x: Math.round(w * 0.22), y: gy + Math.round(h * 0.33) + 112 },
    shop: { x: Math.round(w * 0.78), y: gy + Math.round(h * 0.555) },
  };
}

function eave(g, x0, x1, y, h, tile, hi) {
  // One tier of roof: a tiled slope with curling corners, an eave board and a bright ridge.
  const inset = Math.round(h * 0.9);
  g.poly([[x0, y + h], [x1, y + h], [x1 - inset, y], [x0 + inset, y]], tile);
  for (let i = x0 + 2; i < x1 - 1; i += 3) {
    const t = (i - x0) / (x1 - x0);
    const topX = x0 + inset + t * (x1 - x0 - inset * 2);
    g.line(i, y + h - 1, topX, y + 1, drk(tile, 0.3));
  }
  g.rect(x0 - 1, y + h, x1 - x0 + 2, 2, drk(tile, 0.5));
  g.rect(x0, y + h - 1, x1 - x0, 1, hi);
  g.rect(x0 + inset, y - 1, x1 - x0 - inset * 2, 2, hi);
  g.line(x0, y + h, x0 - 5, y + h - 4, tile, 2);
  g.line(x1, y + h, x1 + 5, y + h - 4, tile, 2);
  g.set(x0 - 6, y + h - 5, C.gold);
  g.set(x1 + 6, y + h - 5, C.gold);
}

function lattice(g, x, y, w, h) {
  g.rect(x - 1, y - 1, w + 2, h + 2, 0x2a1a28);
  g.rect(x, y, w, h, 0xf0d070);
  g.rect(x, y, w, Math.round(h / 3), 0xf8e8a0);
  for (let i = 2; i < w; i += 3) g.rect(x + i, y, 1, h, 0x4a2c28);
  for (let j = 2; j < h; j += 3) g.rect(x, y + j, w, 1, 0x4a2c28);
}

function hall(g, x, y) {
  const w = 104, x0 = x - w / 2, x1 = x + w / 2;
  const wallH = 34;
  // Platform and steps
  g.rect(x0 - 8, y - 4, w + 16, 6, 0x6c668c);
  g.rect(x0 - 8, y - 4, w + 16, 1, 0x9d98bd);
  g.rect(x0 - 8, y + 1, w + 16, 1, 0x4a4468);
  g.rect(x - 15, y + 2, 30, 3, 0x7f79a0);
  g.rect(x - 15, y + 2, 30, 1, 0xaba6c8);
  g.rect(x - 20, y + 5, 40, 3, 0x6c668c);
  g.rect(x - 20, y + 5, 40, 1, 0x9d98bd);
  // Walls and pillars
  const top = y - 4 - wallH;
  g.rect(x0, top, w, wallH, 0x7a4e36);
  g.rect(x0, top, w, 2, 0x4a2c28);
  for (let i = 0; i < 5; i++) {
    const px = x0 + 2 + i * 24.5;
    g.rect(px, top, 4, wallH, C.red2);
    g.rect(px, top, 1, wallH, C.red);
    g.rect(px - 1, y - 7, 6, 3, 0x4a4468);
  }
  lattice(g, x0 + 10, top + 9, 13, 14);
  lattice(g, x1 - 23, top + 9, 13, 14);
  // A warm open doorway
  g.rect(x - 11, top + 7, 22, wallH - 7, 0x2a1a28);
  g.rect(x - 9, top + 9, 8, wallH - 9, 0xf0b458);
  g.rect(x + 1, top + 9, 8, wallH - 9, 0xc98a40);
  g.rect(x - 9, top + 9, 18, 2, 0xf8e8a0);
  // Bracket band under the eaves
  g.rect(x0 - 2, top - 3, w + 4, 3, 0x2f5a5a);
  for (let i = x0; i < x1; i += 6) {
    g.rect(i, top - 3, 3, 2, 0x4a8078);
    g.set(i + 1, top - 3, C.gold3);
  }
  // Two tiers of roof
  eave(g, x0 - 9, x1 + 9, top - 15, 12, 0x31455f, 0x56708c);
  const upperW = 62;
  g.rect(x - upperW / 2, top - 27, upperW, 12, 0x7a4e36);
  g.rect(x - upperW / 2 + 3, top - 25, 7, 8, 0xf0d070);
  g.rect(x + upperW / 2 - 10, top - 25, 7, 8, 0xf0d070);
  g.rect(x - upperW / 2, top - 27, 3, 12, C.red2);
  g.rect(x + upperW / 2 - 3, top - 27, 3, 12, C.red2);
  eave(g, x - upperW / 2 - 8, x + upperW / 2 + 8, top - 38, 11, 0x2c3e58, 0x4e6884);
  // Ridge ornaments
  g.rect(x - 24, top - 41, 48, 2, 0x1f2c44);
  g.rect(x - 26, top - 44, 3, 4, C.gold3);
  g.rect(x + 23, top - 44, 3, 4, C.gold3);
  g.rect(x - 1, top - 45, 2, 5, C.gold);
  // Signboard: the name is written over it at runtime.
  g.rect(x - 19, top + 1, 38, 9, 0x241a28);
  g.rect(x - 18, top + 2, 36, 7, 0x8a6a2a);
  g.rect(x - 17, top + 3, 34, 5, 0x2a1a28);
  return top;
}

function altarArt(g, x, y) {
  const c = [0x5a5478, 0x6c668c, 0x7f79a0];
  [[20, 6], [15, 6], [10, 6]].forEach((q, i) => {
    const yy = y - (i + 1) * 6;
    g.rect(x - q[0], yy, q[0] * 2, q[1], c[i]);
    g.rect(x - q[0], yy, q[0] * 2, 1, lit(c[i], 0.3));
    g.rect(x + q[0] - 3, yy + 1, 3, q[1] - 1, drk(c[i], 0.3));
  });
  // Bracket that holds the turning disc.
  g.rect(x - 2, y - 26, 4, 8, 0x4a4468);
  g.rect(x - 13, y - 21, 26, 2, 0x4a4468);
}

function furnaceArt(g, x, y) {
  // An open shed around a bronze cauldron.
  g.rect(x - 28, y - 2, 56, 3, 0x5a5478);
  g.rect(x - 25, y - 32, 3, 30, 0x4a2c28);
  g.rect(x + 22, y - 32, 3, 30, 0x4a2c28);
  eave(g, x - 30, x + 30, y - 42, 9, 0x4a3a44, 0x6c5a64);
  // Cauldron
  const fx = x, fy = y - 2;
  g.rect(fx - 12, fy - 5, 4, 5, C.bronze2);
  g.rect(fx + 8, fy - 5, 4, 5, C.bronze2);
  g.ell(fx, fy - 14, 15, 11, C.bronze);
  g.ell(fx - 4, fy - 18, 8, 5, C.bronze3);
  g.rect(fx - 13, fy - 24, 26, 3, C.bronze3);
  g.rect(fx - 13, fy - 21, 26, 1, C.bronze2);
  g.rect(fx - 17, fy - 20, 4, 6, C.bronze2);
  g.rect(fx + 13, fy - 20, 4, 6, C.bronze2);
  g.ell(fx, fy - 10, 7, 5, C.ink2);
  g.ell(fx, fy - 9, 5, 3, C.red2);
  g.ell(fx, fy - 9, 3, 2, C.red3);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 6.28;
    g.set(fx + Math.cos(a) * 11, fy - 13 + Math.sin(a) * 7, C.gold);
  }
}

function stableArt(g, x, y) {
  g.rect(x - 32, y - 28, 64, 26, 0x5a3c2c);
  for (let i = 0; i < 9; i++) g.rect(x - 32 + i * 8, y - 28, 1, 26, 0x3e2820);
  g.rect(x - 32, y - 2, 64, 2, 0x3e2820);
  // Stall opening
  g.rect(x - 22, y - 22, 30, 20, 0x241a22);
  // The horse, looking out over a half door
  const hx = x - 2, hy = y - 8;
  g.poly([[hx + 8, hy + 2], [hx - 4, hy + 2], [hx - 7, hy - 8], [hx - 2, hy - 13], [hx + 4, hy - 8]], C.ochre);
  g.poly([[hx - 2, hy - 14], [hx - 8, hy - 12], [hx - 15, hy - 6], [hx - 13, hy - 2], [hx - 7, hy - 5], [hx - 1, hy - 8]], C.ochre3);
  g.rect(hx - 15, hy - 5, 4, 3, C.paper2);
  g.set(hx - 14, hy - 4, C.ink);
  g.rect(hx - 7, hy - 10, 2, 2, C.ink);
  g.poly([[hx - 3, hy - 14], [hx - 1, hy - 18], [hx, hy - 13]], C.ochre);
  g.line(hx - 1, hy - 14, hx + 7, hy - 3, C.ink3, 2);
  // Half door and hay
  g.rect(x - 22, y - 9, 30, 7, 0x7a4e36);
  g.rect(x - 22, y - 9, 30, 1, 0x9a6a48);
  g.line(x - 22, y - 9, x + 8, y - 2, 0x4a2c28);
  g.ell(x + 20, y - 8, 9, 7, C.gold3);
  g.ell(x + 19, y - 10, 6, 4, C.gold);
  for (let i = 0; i < 8; i++) g.set(x + 13 + hash(i, 1, 5) * 14, y - 13 + hash(i, 2, 5) * 8, C.ochre3);
  eave(g, x - 36, x + 36, y - 40, 11, 0x4a3a44, 0x6c5a64);
}

function shopArt(g, x, y) {
  g.rect(x - 24, y - 20, 48, 20, 0x7a4e36);
  g.rect(x - 24, y - 20, 48, 2, 0x4a2c28);
  g.rect(x - 26, y - 34, 3, 34, 0x4a2c28);
  g.rect(x + 23, y - 34, 3, 34, 0x4a2c28);
  // Counter and goods
  g.rect(x - 26, y - 13, 52, 3, 0x9a6a48);
  g.rect(x - 26, y - 13, 52, 1, 0xc08a60);
  [[-18, C.red], [-10, C.blue], [-2, C.gold], [7, C.jade], [15, C.red3]].forEach((q) => {
    g.ell(x + q[0], y - 16, 3, 3, q[1]);
    g.set(x + q[0] - 1, y - 17, C.white);
  });
  // Striped awning
  for (let i = 0; i < 9; i++) {
    const c = i % 2 ? C.paper : C.red;
    g.poly([[x - 27 + i * 6, y - 40], [x - 21 + i * 6, y - 40], [x - 21 + i * 6, y - 31], [x - 27 + i * 6, y - 31]], c);
    g.ell(x - 24 + i * 6, y - 31, 3, 2, c);
  }
  g.rect(x - 27, y - 41, 54, 2, C.red2);
}

function mailArt(g, x, y) {
  g.rect(x - 1, y - 16, 3, 16, 0x4a2c28);
  g.rect(x - 7, y - 25, 15, 10, C.red2);
  g.rect(x - 7, y - 25, 15, 2, C.red);
  g.rect(x - 5, y - 20, 11, 1, C.ink);
  g.rect(x - 8, y - 27, 17, 2, 0x2f3656);
}

// Tilled plots behind a low fence. Crops are added over this at runtime.
function gardenArt(g, spot, cols, rows) {
  const c = spot.cell;
  const w = cols * c, h = rows * c;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const px = spot.x + i * c + 2, py = spot.y + j * c + 2;
      g.rect(px, py, c - 4, c - 4, 0x4a2e22);
      g.rect(px, py, c - 4, 1, 0x6a4632);
      for (let k = 3; k < c - 5; k += 4) g.rect(px + 1, py + k, c - 6, 1, 0x3a2219);
    }
  }
  const fence = 0x8a6a48;
  for (let i = -2; i <= w + 2; i += 8) {
    g.rect(spot.x + i, spot.y - 5, 2, 7, fence);
    g.rect(spot.x + i, spot.y + h - 1, 2, 7, fence);
  }
  g.rect(spot.x - 2, spot.y - 3, w + 6, 1, fence);
  g.rect(spot.x - 2, spot.y + h + 1, w + 6, 1, fence);
  for (let j = 0; j <= h; j += 8) {
    g.rect(spot.x - 3, spot.y + j - 3, 2, 7, fence);
    g.rect(spot.x + w + 2, spot.y + j - 3, 2, 7, fence);
  }
}

function pondArt(g, x, y) {
  g.ell(x, y, 25, 11, 0x5a5478);
  g.ell(x, y, 23, 9, 0x24506a);
  g.ell(x - 2, y - 1, 18, 6, 0x2f6a88);
  g.rect(x - 11, y - 4, 7, 1, 0x7cb8d8);
  g.rect(x + 3, y + 2, 9, 1, 0x4a8fb4);
  // Lily pads and one flower.
  [[x - 10, y + 3], [x + 8, y - 3], [x + 14, y + 3]].forEach((q) => {
    g.ell(q[0], q[1], 3, 2, 0x3f9e7e);
    g.set(q[0] + 1, q[1], 0x24506a);
  });
  g.rect(x + 7, y - 5, 3, 2, C.peach2);
  g.set(x + 8, y - 5, C.gold2);
  [[x - 24, y + 6, 3], [x + 22, y - 6, 4], [x - 20, y - 8, 3]].forEach((q) => {
    g.ell(q[0], q[1], q[2], q[2] - 1, 0x6c6a78);
    g.set(q[0] - 1, q[1] - 1, 0x9a98a8);
  });
}

function stoneLantern(g, x, y) {
  const c = 0x7c7a88, d = 0x54525e;
  g.rect(x - 1, y - 7, 3, 7, d);
  g.rect(x - 3, y - 1, 7, 2, d);
  g.rect(x - 3, y - 12, 7, 5, c);
  g.rect(x - 1, y - 11, 3, 3, C.gold2);
  g.poly([[x - 5, y - 12], [x + 5, y - 12], [x + 1, y - 16], [x - 1, y - 16]], d);
}

function bush(g, x, y, r) {
  g.ell(x, y, r, r * 0.7, 0x24463a);
  g.ell(x - r * 0.25, y - r * 0.2, r * 0.7, r * 0.45, 0x35604a);
  for (let i = 0; i < r; i++) g.set(x + (hash(i, x, 2) - 0.5) * r * 1.4, y + (hash(i, y, 3) - 0.5) * r * 0.8, hash(i, 1, 4) > 0.6 ? C.peach2 : 0x4a7a5a);
}

// Blends a soft-edged oval of colour into what is already painted: shade under a building, or lamplight.
function wash(g, cx, cy, rx, ry, col, k, minY) {
  for (let y = Math.max(minY, Math.round(cy - ry)); y <= cy + ry; y++) {
    for (let x = Math.round(cx - rx); x <= cx + rx; x++) {
      const d = ((x - cx) / rx) * ((x - cx) / rx) + ((y - cy) / ry) * ((y - cy) / ry);
      if (d > 1) continue;
      const c = g.get(x, y);
      if (!c) continue;
      // Two flat steps rather than a gradient, with a checkered rim, to stay in keeping with the rest.
      const amt = d < 0.45 ? k : d < 0.8 || ((x + y) & 1) ? k * 0.5 : 0;
      if (amt) g.set(x, y, mix(c, col, amt));
    }
  }
}

function bamboo(g, x, y, s) {
  [[0, 1], [5, 0.8], [-4, 0.7], [9, 0.55]].forEach((q, i) => {
    const bx = x + q[0], top = y - s * q[1];
    g.line(bx, y, bx + (i % 2 ? 1 : -1), top, 0x4a8a5a, 1);
    for (let yy = y - 5; yy > top; yy -= 6) g.set(bx, yy, 0x2a5a40);
    for (let j = 0; j < 5; j++) {
      const ly = top + j * s * 0.13 * q[1], dir = j % 2 ? 1 : -1;
      g.line(bx, ly + 2, bx + dir * 6, ly - 1, 0x3f7a50, 1);
      g.line(bx, ly + 3, bx + dir * 5, ly + 4, 0x5a9a62, 1);
    }
  });
}

function well(g, x, y) {
  g.ell(x, y, 9, 4, 0x54525e);
  g.rect(x - 9, y - 7, 18, 7, 0x7c7a88);
  g.rect(x - 9, y - 7, 18, 1, 0xa09eac);
  for (let i = -6; i < 9; i += 5) g.rect(x + i, y - 6, 1, 6, 0x54525e);
  g.ell(x, y - 7, 8, 3, 0x54525e);
  g.ell(x, y - 7, 6, 2, 0x1a2a44);
  g.set(x - 2, y - 7, 0x7cb8d8);
  g.rect(x - 10, y - 20, 2, 14, 0x4a2c28);
  g.rect(x + 8, y - 20, 2, 14, 0x4a2c28);
  g.poly([[x - 13, y - 19], [x + 13, y - 19], [x + 8, y - 24], [x - 8, y - 24]], 0x4a3a44);
  g.rect(x - 13, y - 19, 26, 1, 0x6c5a64);
  g.rect(x, y - 19, 1, 8, C.paper3);
  g.rect(x - 1, y - 12, 3, 3, 0x6c3f26);
}

// The gate at the foot of the picture, where the road comes in, with a low wall running off both ways.
function gate(g, x, y) {
  const wall = 0x6c6a78, cap = 0x9a98a8;
  for (let side = -1; side <= 1; side += 2) {
    const x0 = side < 0 ? 0 : x + 17, x1 = side < 0 ? x - 17 : g.w;
    g.rect(x0, y - 7, x1 - x0, 8, wall);
    g.rect(x0, y - 8, x1 - x0, 2, cap);
    g.rect(x0, y - 2, x1 - x0, 1, drk(wall, 0.3));
    for (let i = x0 + 4; i < x1; i += 9) g.rect(i, y - 6, 1, 4, drk(wall, 0.25));
  }
  [-16, 13].forEach((dx) => {
    g.rect(x + dx, y - 26, 4, 28, C.red2);
    g.rect(x + dx, y - 26, 1, 28, C.red);
  });
  g.poly([[x - 25, y - 24], [x + 26, y - 24], [x + 18, y - 31], [x - 17, y - 31]], 0x31455f);
  g.rect(x - 25, y - 24, 51, 1, 0x56708c);
  g.rect(x - 14, y - 22, 29, 2, 0x4a2c28);
  [-12, 12].forEach((dx) => {
    g.rect(x + dx, y - 20, 1, 3, C.ink);
    g.rect(x + dx - 2, y - 17, 5, 5, C.red);
    g.rect(x + dx - 1, y - 16, 3, 3, C.gold2);
  });
}

function hubScene(w, h) {
  const L = stationLayout(w, h);
  const { gy } = L;
  const g = new Grid(w, h);
  // Evening sky
  const stops = [0x0d0b24, 0x1a1c4c, 0x3a3674, 0x8a5a7c, 0xc87a6a];
  const n = stops.length - 1;
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < gy + 2; y++) {
    const t = (y / (gy + 2)) * n, i = Math.min(n - 1, Math.floor(t));
    const q = (t - i) * 5, k = Math.floor(q);
    const a = mix(stops[i], stops[i + 1], k / 5), b = mix(stops[i], stops[i + 1], Math.min(1, (k + 1) / 5));
    for (let x = 0; x < w; x++) g.set(x, y, q - k > (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? b : a);
  }
  for (let i = 0; i < 120; i++) g.set(hash(i, 1, 5) * w, hash(i, 2, 5) * gy * 0.7, hash(i, 4, 5) > 0.8 ? C.paper : C.ink4);
  // Hills behind the station
  const ridge = (base, amp, fq, seed, col, edge) => {
    for (let x = 0; x < w; x++) {
      const v = (Math.sin(x * fq + seed) + Math.sin(x * fq * 2.3 + seed * 2) * 0.5 + 1.5) / 3;
      const top = Math.round(base - v * amp);
      for (let y = top; y < gy + 2; y++) g.set(x, y, col);
      if (edge !== undefined) g.set(x, top, edge);
    }
  };
  ridge(gy, 40, 0.019, 1, 0x2c2a5a, 0x4a4078);
  ridge(gy + 1, 22, 0.035, 4, 0x1f1d42, 0x34315f);
  // Ground: three broad tones of evening grass with wandering edges, rather than an even speckle, so the
  // eye reads lawn and shade and not noise.
  const tones = [0x2b3f3c, 0x35503f, 0x426040];
  for (let y = gy; y < h; y++) {
    const t = (y - gy) / (h - gy);
    for (let x = 0; x < w; x++) {
      const drift = fbm1(x * 0.022 + y * 0.009, 3, 3) * 0.55 + fbm1(y * 0.03 - x * 0.012, 9, 3) * 0.45;
      const v = t * 0.9 + (drift - 0.5) * 0.9;
      let c = v < 0.3 ? tones[0] : v < 0.68 ? tones[1] : tones[2];
      // One checkered row where two tones meet softens the join without filling the lawn with dots.
      const edge = Math.min(Math.abs(v - 0.3), Math.abs(v - 0.68));
      if (edge < 0.035 && ((x + y) & 1)) c = v < 0.5 ? (v < 0.3 ? tones[1] : tones[0]) : (v < 0.68 ? tones[2] : tones[1]);
      g.set(x, y, c);
    }
  }
  g.rect(0, gy, w, 1, 0x64786a);
  // Stone paths joining the buildings.
  const path = 0xa49c8c, path2 = 0x74705e;
  const lay = (x0, y0, x1, y1, t) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      g.rect(x0 + (x1 - x0) * s - t / 2, y0 + (y1 - y0) * s - t / 2, t, t, path2);
    }
    for (let i = 0; i <= steps; i += 2) {
      const s = i / steps;
      // Grass nibbling at the path's edge.
      if (hash(i, 3, 6) > 0.5) g.set(x0 + (x1 - x0) * s - t / 2 + (y0 === y1 ? 0 : -1), y0 + (y1 - y0) * s - t / 2 + (y0 === y1 ? -1 : 0), 0x54703f);
    }
    for (let i = 0; i <= steps; i += 5) {
      const s = i / steps;
      const px = x0 + (x1 - x0) * s - t / 2 + hash(i, 1, 6) * (t - 3), py = y0 + (y1 - y0) * s - t / 2 + hash(i, 2, 6) * (t - 3);
      g.rect(px, py, 3, 2, path);
      g.set(px, py, lit(path, 0.3));
    }
  };
  const hallX = L.hall.x;
  lay(hallX, L.hall.y + 8, hallX, h + 8, 14);
  lay(hallX, L.furnace.y + 2, L.stable.x - 30, L.stable.y + 2, 10);
  lay(L.furnace.x + 20, L.furnace.y + 2, hallX, L.furnace.y + 2, 10);
  lay(hallX, L.shop.y + 2, L.shop.x - 24, L.shop.y + 2, 10);
  lay(hallX + 10, L.hall.y + 8, L.altar.x, L.altar.y + 2, 8);
  // Shade under everything that stands on the lawn, and warm light spilling from doors and lamps.
  [[L.hall.x, L.hall.y + 4, 62, 7], [L.furnace.x, L.furnace.y + 2, 34, 5], [L.stable.x, L.stable.y + 1, 40, 5], [L.shop.x, L.shop.y + 2, 32, 5],
    [L.altar.x, L.altar.y + 1, 24, 4], [L.mail.x, L.mail.y + 1, 8, 2]].forEach((q) => wash(g, q[0], q[1], q[2], q[3], 0x141a2c, 0.45, gy));
  wash(g, hallX, L.hall.y + 16, 22, 12, 0xf0b458, 0.3, gy);
  wash(g, hallX, L.furnace.y - 6, 30, 9, 0xf0c070, 0.2, gy);
  wash(g, L.furnace.x, L.furnace.y + 6, 16, 5, 0xec7a4e, 0.22, gy);
  // Trees frame the scene, back to front.
  pine(g, Math.round(w * 0.06), gy + 28, 44, 0x1f4a44, 0x173a38);
  pine(g, Math.round(w * 0.15), gy + 22, 34, 0x1f4a44, 0x173a38);
  pine(g, Math.round(w * 0.95), gy + 56, 40, 0x1f4a44, 0x173a38);
  // Buildings, back to front.
  altarArt(g, L.altar.x, L.altar.y);
  hall(g, L.hall.x, L.hall.y);
  mailArt(g, L.mail.x, L.mail.y);
  furnaceArt(g, L.furnace.x, L.furnace.y);
  stableArt(g, L.stable.x, L.stable.y);
  gardenArt(g, L.garden, 3, 3);
  shopArt(g, L.shop.x, L.shop.y);
  pondArt(g, L.pond.x, L.pond.y);
  stoneLantern(g, hallX + 14, L.furnace.y - 8);
  stoneLantern(g, hallX - 14, L.furnace.y - 8);
  // A last few things near the viewer, for depth.
  pine(g, Math.round(w * 0.97), h - 2, 60, 0x1a443e, 0x123430);
  bush(g, Math.round(w * 0.62), h - 18, 10);
  bush(g, Math.round(w * 0.74), h - 8, 14);
  bush(g, Math.round(w * 0.04), Math.round(L.garden.y - 14), 8);
  // Bamboo by the garden, a well by the stable and a gate where the road comes in.
  bamboo(g, Math.round(w * 0.03), Math.round(L.garden.y + L.garden.cell * 3 + 74), 46);
  bamboo(g, Math.round(w * 0.1), Math.round(L.garden.y + L.garden.cell * 3 + 80), 36);
  well(g, Math.round(w * 0.62), Math.round(L.stable.y + 52));
  gate(g, hallX, h - 4);
  // Flower beds either side of the hall steps.
  [-1, 1].forEach((k) => {
    for (let i = 0; i < 9; i++) {
      const fx = hallX + k * (30 + i * 3), fy = L.hall.y + 9 + (i % 2);
      g.rect(fx, fy, 2, 2, 0x35604a);
      if (i % 2 === 0) g.set(fx, fy - 1, [C.peach2, C.gold2, C.red3][i % 3]);
    }
  });
  // Grass in tufts and small drifts of flowers, kept off the paths.
  const onPath = (x, y) => {
    const c = g.get(Math.round(x), Math.round(y));
    return tones.indexOf(c) < 0;
  };
  for (let i = 0; i < 70; i++) {
    const x = 3 + hash(i, 7, 7) * (w - 6), y = gy + 8 + hash(i, 8, 7) * (h - gy - 12);
    if (onPath(x, y) || onPath(x - 2, y) || onPath(x + 2, y)) continue;
    const c = g.get(Math.round(x), Math.round(y));
    g.set(x - 1, y, lit(c, 0.16));
    g.set(x, y - 1, lit(c, 0.22));
    g.set(x + 1, y, lit(c, 0.12));
    g.set(x, y, drk(c, 0.12));
  }
  for (let k = 0; k < 7; k++) {
    const cx0 = 10 + hash(k, 3, 11) * (w - 20), cy0 = gy + 20 + hash(k, 4, 11) * (h - gy - 40);
    const col = [C.peach2, C.gold2, C.paper, C.blue3][k % 4];
    for (let i = 0; i < 6; i++) {
      const x = cx0 + (hash(i, k, 12) - 0.5) * 22, y = cy0 + (hash(i, k, 13) - 0.5) * 10;
      if (!onPath(x, y)) g.set(x, y, col);
    }
  }
  return g;
}

// The peach tree that grows at the station door after the true ending.
function peachSprite() {
  const g = new Grid(54, 68);
  peachTree(g, 26, 66, 44);
  return g.outlineTint(0.85);
}

module.exports = { hubScene, peachSprite, stationLayout };
