// Creatures drawn from the Classic of Mountains and Seas and folk tales. All face right.
const { Grid } = require('../core/paint.js');
const { C, lit, drk } = require('../core/palette.js');
const { peiBoss } = require('./heroes.js');

const done = (g) => g.volume().outlineTint(0.84);
function eye(g, x, y, c, s) {
  s = s || 2;
  g.rect(x, y, s, s, c || C.gold2);
  g.set(x + s - 1, y + s - 1, C.ink);
}

const DRAW = {
  // ---- East: spring ----
  vine(p) {
    const g = new Grid(52, 52);
    const a = p.a || C.jade, b = p.b || C.jade2, f = p.f || C.peach;
    g.ell(26, 46, 18, 5, b);
    g.curve(10, 46, 2, 34, 10, 24, a, 5, 2);
    g.curve(42, 46, 50, 34, 43, 22, a, 5, 2);
    g.curve(26, 46, 18, 32, 26, 18, a, 12, 8);
    g.curve(22, 42, 14, 30, 20, 24, b, 2, 1);
    g.ell(10, 22, 3, 3, f);
    g.ell(43, 20, 3, 3, f);
    g.ell(26, 15, 12, 10, a);
    for (let i = 0; i < 7; i++) {
      const t = (i / 6) * Math.PI;
      g.ell(26 - Math.cos(t) * 12, 12 - Math.sin(t) * 8, 4, 4, i % 2 ? f : lit(f, 0.3));
    }
    g.rect(19, 14, 4, 4, C.gold2);
    g.rect(29, 14, 4, 4, C.gold2);
    g.rect(21, 15, 2, 2, C.ink);
    g.rect(31, 15, 2, 2, C.ink);
    g.rect(20, 21, 12, 3, C.ink2);
    for (let i = 0; i < 4; i++) g.set(21 + i * 3, 21, C.paper);
    return done(g);
  },
  floral(p) {
    const g = new Grid(44, 54);
    const a = p.a || C.peach, b = p.b || C.peach3, h = p.h || 0x3a2050;
    g.poly([[14, 28], [30, 28], [40, 42], [4, 42]], b);
    [[6, 41], [14, 46], [22, 49], [30, 46], [38, 41]].forEach((q, i) => {
      g.ell(q[0], q[1], 6, 7, i % 2 ? b : a);
      g.ell(q[0], q[1] - 1, 2, 3, lit(a, 0.45));
    });
    g.poly([[16, 22], [28, 22], [32, 32], [12, 32]], C.jade3);
    g.curve(14, 24, 6, 26, 3, 18, C.skin, 3, 2);
    g.curve(30, 24, 38, 26, 41, 18, C.skin, 3, 2);
    g.ell(3, 15, 3, 3, a);
    g.ell(41, 15, 3, 3, a);
    g.ell(22, 13, 9, 9, 0xf6dcc8);
    g.ell(22, 8, 11, 7, h);
    g.poly([[11, 9], [15, 9], [13, 26], [9, 25]], h);
    g.poly([[33, 9], [29, 9], [31, 26], [35, 25]], h);
    g.ell(31, 5, 4, 4, a);
    g.set(31, 5, C.gold2);
    g.rect(20, 12, 3, 3, C.ink);
    g.rect(26, 12, 3, 3, C.ink);
    g.set(20, 12, C.white);
    g.set(26, 12, C.white);
    g.rect(23, 18, 3, 1, C.red);
    return done(g, 0.22, 0.25);
  },
  xiao(p) {
    const g = new Grid(52, 50);
    const a = p.a || C.ochre, b = p.b || C.ochre2, m = p.m || C.red;
    g.ell(22, 32, 15, 13, a);
    g.ell(26, 36, 9, 8, C.ochre3);
    g.curve(10, 26, 2, 34, 6, 44, a, 7, 5);
    g.curve(34, 26, 44, 32, 44, 42, a, 7, 5);
    g.rect(42, 42, 6, 4, b);
    g.rect(3, 44, 6, 4, b);
    g.rect(13, 42, 8, 6, b);
    g.rect(26, 42, 8, 6, b);
    g.ell(26, 14, 13, 12, b);
    g.ell(30, 16, 9, 9, m);
    g.rect(29, 10, 2, 13, C.blue);
    g.rect(26, 16, 2, 6, C.blue3);
    g.rect(32, 16, 2, 6, C.blue3);
    g.rect(24, 12, 4, 3, C.gold2);
    g.rect(33, 12, 4, 3, C.gold2);
    g.set(26, 13, C.ink);
    g.set(35, 13, C.ink);
    g.rect(27, 23, 7, 2, C.ink);
    g.set(28, 25, C.paper);
    g.set(32, 25, C.paper);
    g.poly([[14, 6], [20, 6], [17, 0]], b);
    return done(g);
  },
  // ---- South: summer ----
  firerat(p) {
    const g = new Grid(50, 40);
    const a = p.a || C.red, f = p.f || C.gold;
    g.curve(8, 28, 2, 20, 6, 8, f, 3, 1);
    g.ell(8, 6, 3, 4, C.gold2);
    g.ell(22, 26, 14, 11, a);
    for (let i = 0; i < 5; i++) g.poly([[10 + i * 5, 18], [15 + i * 5, 18], [13 + i * 5, 8 + (i % 2) * 3]], i % 2 ? f : C.red3);
    g.ell(36, 26, 8, 8, a);
    g.poly([[40, 24], [49, 29], [40, 33]], lit(a, 0.2));
    g.set(48, 29, C.ink);
    g.ell(32, 18, 3, 4, C.red3);
    g.rect(37, 23, 3, 3, C.gold2);
    g.set(39, 24, C.ink);
    g.rect(14, 35, 6, 3, C.ochre2);
    g.rect(28, 35, 6, 3, C.ochre2);
    return done(g);
  },
  bifang(p) {
    const g = new Grid(52, 60);
    const a = p.a || C.red, b = p.b || C.blue2, c = p.c || C.paper;
    g.line(24, 42, 24, 56, C.ochre3, 2);
    g.rect(20, 56, 9, 2, C.ochre3);
    g.ell(22, 32, 13, 12, c);
    g.poly([[10, 26], [0, 18], [2, 34], [8, 42], [20, 44]], b);
    g.poly([[8, 28], [0, 22], [3, 32], [8, 38]], a);
    for (let i = 0; i < 4; i++) g.rect(14 + i * 5, 33 + (i % 2) * 3, 3, 2, a);
    g.curve(30, 26, 36, 18, 33, 10, c, 7, 5);
    g.ell(35, 8, 7, 6, a);
    g.poly([[40, 6], [52, 10], [40, 12]], C.gold);
    g.rect(35, 5, 3, 3, C.gold2);
    g.set(37, 6, C.ink);
    g.poly([[32, 3], [29, 0], [36, 2]], b);
    g.curve(10, 40, 2, 48, 6, 54, a, 3, 1);
    return done(g);
  },
  wisp(p) {
    const g = new Grid(44, 52);
    const a = p.a || C.red3, b = p.b || C.gold, c = p.c || C.gold2;
    g.poly([[22, 0], [30, 12], [38, 18], [36, 36], [28, 46], [14, 46], [6, 36], [6, 20], [12, 16], [14, 8], [18, 12]], a);
    g.poly([[22, 12], [29, 22], [31, 34], [26, 42], [16, 42], [11, 34], [13, 24], [18, 22]], b);
    g.poly([[22, 26], [26, 32], [25, 40], [18, 40], [16, 34]], c);
    g.rect(14, 28, 4, 5, C.ink);
    g.rect(25, 28, 4, 5, C.ink);
    g.set(15, 29, C.white);
    g.set(26, 29, C.white);
    g.rect(19, 36, 5, 2, C.ink);
    return g.volume({ keep: new Set([C.ink, C.white]), hi: 0.3, lo: 0.2 }).outlineTint(0.8, C.red2);
  },
  // ---- Centre: late summer ----
  clay(p) {
    const g = new Grid(44, 60);
    const a = p.a || C.ochre3, b = p.b || C.ochre, c = p.c || C.ochre2;
    g.rect(13, 42, 7, 15, b);
    g.rect(24, 42, 7, 15, c);
    g.rect(11, 55, 10, 3, c);
    g.rect(23, 55, 10, 3, c);
    g.poly([[10, 20], [34, 20], [36, 44], [8, 44]], a);
    for (let y = 22; y < 40; y += 4) for (let x = 11; x < 33; x += 5) g.rect(x + ((y / 4) % 2) * 2, y, 3, 2, b);
    g.rect(9, 36, 26, 3, c);
    g.rect(4, 22, 6, 18, b);
    g.rect(34, 22, 6, 12, b);
    g.rect(38, 32, 5, 4, a);
    g.line(41, 6, 41, 58, C.ochre2, 2);
    g.poly([[38, 8], [41, 0], [44, 8]], C.ink4);
    g.ell(22, 12, 9, 10, a);
    g.ell(22, 6, 9, 5, c);
    g.ell(24, 2, 3, 2, c);
    g.rect(16, 11, 12, 1, c);
    g.rect(18, 12, 3, 2, C.ink);
    g.rect(25, 12, 3, 2, C.ink);
    g.set(19, 12, C.red3);
    g.set(26, 12, C.red3);
    g.rect(20, 18, 5, 1, c);
    g.set(13, 30, C.ink3);
    g.line(29, 26, 33, 33, C.ink3);
    return done(g, 0.2, 0.25);
  },
  worm(p) {
    const g = new Grid(50, 58);
    const a = p.a || C.gold3, b = p.b || C.ochre2, c = p.c || C.ochre3;
    g.ell(25, 53, 22, 4, b);
    g.curve(22, 54, 8, 38, 24, 22, a, 15, 12);
    for (let i = 0; i < 6; i++) {
      const s = i / 6, u = 1 - s;
      const x = u * u * 22 + 2 * u * s * 8 + s * s * 24;
      const y = u * u * 54 + 2 * u * s * 38 + s * s * 22;
      g.line(x - 6, y, x + 6, y + 1, b, 1);
    }
    g.ell(28, 15, 13, 12, a);
    g.ell(34, 16, 8, 9, C.ink2);
    for (let i = 0; i < 7; i++) {
      const t = (i / 7) * Math.PI * 2;
      g.poly([[34 + Math.cos(t) * 8, 16 + Math.sin(t) * 9], [34 + Math.cos(t + 0.4) * 8, 16 + Math.sin(t + 0.4) * 9], [34 + Math.cos(t + 0.2) * 3, 16 + Math.sin(t + 0.2) * 4]], C.paper);
    }
    g.ell(34, 16, 3, 3, C.red);
    g.rect(21, 6, 4, 3, C.gold2);
    g.set(24, 7, C.ink);
    g.ell(14, 48, 3, 2, c);
    g.ell(38, 50, 2, 1, c);
    return done(g);
  },
  ram(p) {
    const g = new Grid(56, 50);
    const a = p.a || C.ink4, b = p.b || C.ink3, c = p.c || C.ochre3;
    // Far legs, then the woolly body over them.
    g.line(14, 34, 12, 46, drk(b, 0.3), 4);
    g.line(33, 34, 35, 46, drk(b, 0.3), 4);
    g.ell(23, 26, 19, 13, a);
    g.ell(14, 24, 8, 8, lit(a, 0.14));
    g.ell(28, 21, 9, 8, lit(a, 0.14));
    g.ell(20, 32, 8, 6, lit(a, 0.07));
    g.line(8, 34, 6, 46, b, 5);
    g.line(28, 35, 28, 46, b, 5);
    g.rect(3, 45, 7, 3, C.ink2);
    g.rect(25, 45, 7, 3, C.ink2);
    g.rect(10, 45, 5, 3, C.ink2);
    g.rect(33, 45, 5, 3, C.ink2);
    // Neck and head, carried low to charge.
    g.poly([[34, 16], [44, 14], [50, 24], [40, 32], [32, 28]], a);
    g.ell(44, 20, 8, 8, lit(a, 0.08));
    g.poly([[46, 18], [55, 24], [47, 29]], c);
    g.set(53, 24, C.ink);
    // Curled horn
    g.curve(40, 13, 28, 2, 37, 1, c, 5, 3);
    g.curve(37, 1, 44, 1, 43, 8, c, 3, 2);
    g.line(33, 7, 36, 10, drk(c, 0.4));
    g.rect(44, 17, 3, 3, C.gold2);
    g.set(46, 18, C.ink);
    return done(g);
  },
  // ---- West: autumn ----
  scorpion(p) {
    const g = new Grid(58, 48);
    const a = p.a || C.gold3, b = p.b || C.ochre2, c = p.c || C.gold;
    g.curve(14, 32, -2, 22, 8, 6, a, 8, 4);
    g.curve(8, 6, 14, 1, 18, 8, c, 4, 2);
    g.poly([[18, 8], [24, 12], [17, 14]], C.red3);
    g.ell(26, 33, 15, 10, a);
    for (let i = 0; i < 4; i++) g.line(15 + i * 7, 25, 16 + i * 7, 41, b);
    for (let i = 0; i < 4; i++) {
      g.line(16 + i * 7, 41, 11 + i * 8, 47, b, 2);
    }
    g.curve(38, 28, 46, 22, 50, 16, a, 4, 3);
    g.poly([[48, 16], [58, 9], [50, 18], [58, 22]], c);
    g.curve(38, 37, 46, 38, 49, 34, a, 4, 3);
    g.poly([[47, 34], [56, 28], [50, 36], [56, 41]], c);
    g.rect(37, 28, 3, 3, C.red3);
    g.rect(37, 33, 3, 3, C.red3);
    return done(g);
  },
  blade(p) {
    const g = new Grid(44, 62);
    const a = p.a || C.ice, b = p.b || C.ice2, c = p.c || C.violet3;
    g.ell(22, 26, 16, 21, drk(c, 0.45));
    g.ell(22, 24, 12, 16, c);
    g.poly([[22, 1], [28, 10], [27, 44], [17, 44], [16, 10]], a);
    g.poly([[22, 1], [28, 10], [27, 44], [22, 44]], b);
    g.rect(22, 8, 1, 34, C.white);
    g.rect(9, 44, 26, 4, C.gold);
    g.rect(9, 44, 26, 1, C.gold2);
    g.rect(19, 48, 6, 10, C.ochre);
    g.rect(19, 50, 6, 1, C.ochre2);
    g.rect(19, 54, 6, 1, C.ochre2);
    g.ell(22, 59, 4, 3, C.gold);
    g.set(22, 59, C.red);
    g.rect(13, 23, 3, 3, C.red3);
    g.rect(29, 23, 3, 3, C.red3);
    return g.volume().outlineTint(0.84);
  },
  cicada(p) {
    const g = new Grid(52, 42);
    const a = p.a || C.gold, b = p.b || C.gold3;
    g.poly([[20, 8], [2, 2], [0, 18], [10, 30], [22, 22]], 0xf7e8b0);
    g.poly([[18, 12], [6, 8], [6, 18], [12, 24]], 0xfff7d6);
    g.line(4, 6, 18, 16, b);
    g.ell(26, 22, 16, 10, a);
    for (let i = 0; i < 4; i++) g.line(14 + i * 5, 14, 13 + i * 5, 30, b);
    g.ell(40, 19, 8, 8, b);
    g.rect(42, 13, 4, 4, C.red);
    g.rect(42, 21, 4, 4, C.red);
    g.line(18, 30, 14, 39, b, 2);
    g.line(28, 31, 26, 39, b, 2);
    g.line(38, 27, 40, 37, b, 2);
    return done(g);
  },
  // ---- North: winter ----
  grub(p) {
    const g = new Grid(54, 36);
    const a = p.a || C.ice, b = p.b || C.ice2;
    for (let i = 0; i < 6; i++) g.ell(6 + i * 7, 22 - (i === 3 ? 3 : 0), 7, 9 + (i > 2 ? 1 : 0), i % 2 ? a : lit(a, 0.2));
    for (let i = 0; i < 6; i++) g.rect(3 + i * 7, 31, 3, 3, b);
    g.ell(45, 18, 9, 11, a);
    g.rect(47, 13, 3, 4, C.blue2);
    g.rect(47, 21, 3, 3, C.blue2);
    g.poly([[50, 8], [47, 0], [44, 8]], C.white);
    g.poly([[16, 13], [13, 3], [11, 13]], C.white);
    g.poly([[30, 11], [27, 1], [25, 11]], C.white);
    return done(g, 0.3, 0.35);
  },
  merfolk(p) {
    const g = new Grid(50, 60);
    const a = p.a || C.blue, b = p.b || C.blue3, c = p.c || C.ice;
    g.curve(22, 36, 6, 44, 14, 54, a, 13, 5);
    g.poly([[13, 54], [2, 50], [6, 59], [20, 59]], b);
    g.poly([[12, 20], [34, 20], [32, 40], [12, 40]], a);
    for (let y = 24; y < 40; y += 4) for (let x = 14; x < 30; x += 5) g.rect(x + ((y / 4) % 2) * 2, y, 2, 1, b);
    g.poly([[6, 20], [14, 18], [14, 30]], b);
    g.curve(32, 24, 40, 28, 42, 22, a, 5, 3);
    g.line(44, 2, 44, 56, C.ochre, 2);
    g.poly([[40, 8], [44, 0], [48, 8], [44, 6]], c);
    g.poly([[40, 12], [37, 6], [41, 6]], c);
    g.poly([[48, 12], [51, 6], [47, 6]], c);
    g.ell(23, 11, 11, 10, b);
    g.poly([[16, 2], [22, -3], [28, 2], [22, 6]], a);
    g.poly([[34, 11], [40, 13], [34, 17]], c);
    g.rect(26, 8, 4, 4, C.gold2);
    g.set(28, 9, C.ink);
    g.rect(24, 16, 9, 2, C.ink);
    g.set(26, 16, C.white);
    g.set(30, 16, C.white);
    return done(g);
  },
  serpent(p) {
    const g = new Grid(58, 52);
    const a = p.a || 0x2a3358, b = p.b || 0x4a5a8a, c = p.c || C.ice2;
    g.ell(28, 43, 25, 8, a);
    g.ell(28, 34, 19, 7, b);
    g.ell(28, 26, 13, 6, a);
    g.curve(28, 26, 22, 14, 34, 11, b, 9, 7);
    g.ell(38, 10, 10, 8, a);
    g.poly([[45, 8], [57, 12], [45, 15]], a);
    g.rect(40, 5, 3, 3, C.red3);
    g.set(42, 6, C.ink);
    g.line(50, 13, 57, 18, C.red, 1);
    g.line(57, 18, 57, 21, C.red, 1);
    for (let i = 0; i < 6; i++) g.rect(10 + i * 7, 41, 3, 2, c);
    for (let i = 0; i < 4; i++) g.rect(16 + i * 6, 33, 3, 2, c);
    return done(g, 0.3, 0.3);
  },
  // ---- Polestar ----
  puppet(p) {
    const g = new Grid(50, 62);
    const a = p.a || 0x2a2550, b = p.b || C.gold, c = p.c || C.blue3;
    const pts = [[25, 8], [14, 22], [36, 22], [25, 34], [12, 48], [38, 48], [6, 34], [44, 34]];
    g.poly([[17, 20], [33, 20], [31, 40], [19, 40]], a);
    g.line(25, 8, 25, 34, b);
    g.line(14, 22, 36, 22, b);
    g.line(25, 34, 12, 48, b);
    g.line(25, 34, 38, 48, b);
    g.line(14, 22, 6, 34, b);
    g.line(36, 22, 44, 34, b);
    pts.forEach((q) => {
      g.ell(q[0], q[1], 2, 2, c);
      g.set(q[0], q[1], C.white);
    });
    g.ell(25, 9, 7, 7, a);
    g.rect(21, 8, 3, 2, C.white);
    g.rect(27, 8, 3, 2, C.white);
    g.line(25, 2, 25, 0, b);
    return g.volume({ cap: 4, keep: new Set([C.white, C.gold, C.blue3]) }).outlineTint(0.75, C.violet2);
  },
  shade(p) {
    const g = new Grid(50, 58);
    const a = p.a || C.violet2, b = p.b || C.violet, c = p.c || C.violet3;
    g.poly([[25, 2], [40, 12], [44, 30], [46, 52], [38, 45], [31, 54], [25, 46], [18, 54], [11, 45], [4, 52], [6, 30], [10, 12]], a);
    g.poly([[25, 7], [36, 15], [38, 30], [36, 42], [14, 42], [12, 30], [14, 15]], b);
    g.curve(9, 28, 0, 28, 3, 18, a, 6, 3);
    g.curve(41, 28, 50, 28, 47, 18, a, 6, 3);
    g.ell(18, 21, 4, 5, C.ink);
    g.ell(32, 21, 4, 5, C.ink);
    g.set(18, 21, C.gold2);
    g.set(32, 21, C.gold2);
    g.ell(25, 33, 3, 4, C.ink);
    g.set(11, 40, c);
    g.set(38, 38, c);
    return g.volume({ keep: new Set([C.ink, C.gold2]), hi: 0.34, lo: 0.3 }).outlineTint(0.85);
  },
  // ---- Bosses ----
  vineMother() {
    const g = new Grid(124, 124);
    const a = C.jade2, b = C.jade, f = C.peach;
    g.ell(62, 112, 56, 11, drk(a, 0.3));
    const roots = [[12, 112, 2, 80, 16, 52], [112, 112, 124, 78, 106, 48], [28, 112, 18, 84, 32, 34], [96, 112, 108, 86, 92, 28]];
    roots.forEach((r, i) => g.curve(r[0], r[1], r[2], r[3], r[4], r[5], i % 2 ? b : a, 10, 3));
    g.curve(62, 112, 46, 78, 62, 44, a, 40, 30);
    g.curve(54, 110, 44, 80, 54, 52, b, 6, 3);
    g.curve(72, 110, 80, 80, 72, 56, b, 5, 3);
    g.ell(62, 46, 27, 25, a);
    g.ell(62, 48, 22, 19, b);
    for (let i = 0; i < 16; i++) {
      const t = (i / 15) * Math.PI;
      g.ell(62 - Math.cos(t) * 32, 38 - Math.sin(t) * 28, 7, 7, i % 2 ? f : C.peach2);
      g.ell(62 - Math.cos(t) * 32, 38 - Math.sin(t) * 28, 2, 2, C.gold2);
    }
    [[16, 50], [106, 46], [32, 32], [92, 26]].forEach((q) => {
      g.ell(q[0], q[1], 7, 7, f);
      g.ell(q[0], q[1], 2, 2, C.gold2);
    });
    g.ell(50, 44, 7, 6, C.gold2);
    g.ell(76, 44, 7, 6, C.gold2);
    g.rect(52, 42, 6, 5, C.ink);
    g.rect(78, 42, 6, 5, C.ink);
    g.set(53, 43, C.white);
    g.set(79, 43, C.white);
    g.poly([[46, 56], [82, 56], [76, 68], [52, 68]], C.ink2);
    for (let i = 0; i < 6; i++) g.poly([[48 + i * 6, 56], [53 + i * 6, 56], [50 + i * 6, 62]], C.paper);
    return done(g, 0.2, 0.28);
  },
  crow() {
    const g = new Grid(132, 112);
    const a = 0x241c34, b = 0x3f2c52, r = C.red, o = C.gold;
    g.poly([[58, 40], [0, 6], [6, 28], [2, 36], [14, 50], [8, 58], [30, 68], [58, 72]], r);
    g.poly([[58, 44], [10, 20], [22, 44], [20, 56], [58, 66]], C.red3);
    g.poly([[58, 50], [28, 38], [38, 54], [58, 62]], o);
    g.poly([[74, 40], [130, 2], [126, 24], [130, 34], [116, 48], [122, 58], [100, 68], [74, 72]], r);
    g.poly([[74, 44], [120, 16], [110, 42], [112, 54], [74, 66]], C.red3);
    g.poly([[74, 50], [102, 36], [94, 52], [74, 62]], o);
    g.ell(66, 58, 24, 26, a);
    g.ell(66, 62, 16, 19, b);
    for (let i = 0; i < 4; i++) g.line(56 + i * 7, 52 + (i % 2) * 4, 58 + i * 7, 72, a);
    g.ell(66, 28, 17, 16, a);
    g.poly([[78, 24], [100, 32], [78, 39]], o);
    g.line(82, 32, 96, 32, C.gold3);
    g.rect(70, 22, 7, 6, C.gold2);
    g.rect(73, 23, 3, 4, C.red2);
    g.poly([[56, 14], [50, 0], [62, 10], [66, 0], [70, 12]], r);
    [[52, 82], [66, 84], [80, 82]].forEach((q) => {
      g.line(q[0], q[1], q[0], q[1] + 16, o, 3);
      g.line(q[0], q[1] + 16, q[0] - 6, q[1] + 22, o, 2);
      g.line(q[0], q[1] + 16, q[0], q[1] + 23, o, 2);
      g.line(q[0], q[1] + 16, q[0] + 6, q[1] + 22, o, 2);
    });
    return done(g, 0.15, 0.25);
  },
  general() {
    const g = new Grid(112, 124);
    const a = C.ochre3, b = C.ochre, c = C.ochre2, d = C.gold3;
    g.rect(30, 86, 18, 32, b);
    g.rect(58, 86, 18, 32, c);
    g.rect(26, 112, 24, 8, c);
    g.rect(56, 112, 24, 8, c);
    g.poly([[22, 44], [84, 44], [90, 94], [16, 94]], a);
    for (let y = 48; y < 82; y += 6) for (let x = 24; x < 82; x += 9) g.rect(x + ((y / 6) % 2) * 4, y, 6, 4, b);
    g.rect(18, 80, 70, 6, d);
    g.rect(46, 78, 14, 10, C.gold);
    g.ell(16, 48, 15, 13, b);
    g.ell(90, 48, 15, 13, b);
    g.rect(2, 56, 15, 30, a);
    g.rect(89, 56, 14, 22, a);
    g.rect(0, 84, 16, 9, c);
    g.rect(94, 74, 15, 10, c);
    g.line(102, 4, 102, 120, C.ochre2, 4);
    g.poly([[94, 22], [102, 0], [110, 22], [102, 18]], C.ink4);
    g.poly([[86, 18], [94, 30], [102, 22]], C.ink4);
    g.ell(53, 26, 20, 22, a);
    g.ell(53, 14, 22, 12, c);
    g.rect(30, 16, 46, 5, d);
    g.poly([[53, 0], [46, 10], [60, 10]], C.red);
    g.rect(40, 26, 9, 5, C.ink);
    g.rect(58, 26, 9, 5, C.ink);
    g.rect(43, 27, 4, 3, C.red3);
    g.rect(61, 27, 4, 3, C.red3);
    g.rect(44, 40, 18, 3, c);
    g.line(70, 50, 78, 66, C.ink3, 2);
    g.line(30, 68, 40, 76, C.ink3, 2);
    return done(g, 0.18, 0.28);
  },
  tiger() {
    const g = new Grid(136, 108);
    const a = 0xe6e8ee, b = 0xb4bacb, s = 0x2d2a44, e = C.ice2;
    // Tail lashes up behind the haunches.
    g.curve(16, 50, -4, 34, 10, 12, a, 11, 5);
    g.curve(10, 12, 15, 5, 22, 8, s, 6, 3);
    // Far legs
    g.curve(30, 72, 24, 84, 30, 100, b, 13, 9);
    g.curve(86, 72, 92, 86, 88, 100, b, 13, 9);
    g.rect(24, 98, 14, 6, 0x9aa0b4);
    g.rect(82, 98, 14, 6, 0x9aa0b4);
    // Body: haunch, sagging belly, huge shoulder
    g.ell(32, 54, 24, 23, a);
    g.ell(66, 58, 28, 19, a);
    g.ell(90, 50, 22, 24, a);
    g.poly([[32, 74], [92, 72], [80, 80], [44, 80]], b);
    // Near legs, with bent haunch and planted paws
    g.curve(26, 66, 40, 84, 22, 100, a, 18, 11);
    g.curve(92, 64, 104, 82, 100, 100, a, 16, 12);
    g.ell(22, 102, 10, 5, a);
    g.ell(101, 102, 11, 5, a);
    for (let k = 0; k < 3; k++) {
      g.rect(14 + k * 6, 103, 2, 3, C.ink);
      g.rect(93 + k * 6, 103, 2, 3, C.ink);
    }
    // Stripes follow the curve of the body instead of hanging straight.
    [[22, 34, 30, 54], [34, 31, 40, 54], [48, 37, 52, 58], [60, 38, 62, 60], [72, 36, 72, 58], [84, 30, 82, 52], [18, 60, 28, 66], [32, 70, 26, 84], [100, 62, 92, 72]].forEach((q, i) => {
      g.curve(q[0], q[1], (q[0] + q[2]) / 2 + 3, (q[1] + q[3]) / 2, q[2], q[3], s, i < 6 ? 5 : 4, 1);
    });
    // Head, low and forward
    g.ell(108, 44, 25, 23, a);
    g.ell(119, 54, 15, 12, 0xf6f7fb);
    g.poly([[88, 26], [88, 9], [103, 20]], a);
    g.poly([[122, 22], [132, 9], [133, 28]], a);
    g.poly([[90, 21], [90, 14], [98, 20]], C.peach);
    g.poly([[124, 22], [130, 15], [131, 25]], C.peach);
    // The king mark on the brow
    g.rect(99, 25, 22, 3, s);
    g.rect(101, 30, 18, 3, s);
    g.rect(99, 35, 22, 3, s);
    g.rect(108, 25, 4, 13, s);
    g.line(90, 44, 94, 50, s, 2);
    g.line(132, 46, 128, 52, s, 2);
    g.poly([[94, 40], [106, 44], [106, 49], [95, 46]], C.gold2);
    g.poly([[129, 40], [117, 44], [117, 49], [128, 46]], C.gold2);
    g.rect(101, 44, 3, 4, C.ink);
    g.rect(118, 44, 3, 4, C.ink);
    g.line(92, 38, 106, 43, s, 2);
    g.line(131, 38, 117, 43, s, 2);
    g.ell(112, 52, 4, 3, C.peach3);
    g.line(112, 55, 112, 58, s);
    g.poly([[100, 60], [128, 59], [122, 70], [106, 70]], C.red2);
    g.poly([[103, 60], [108, 60], [105, 71]], C.paper);
    g.poly([[120, 60], [125, 60], [122, 71]], C.paper);
    // Autumn's blades float along its spine.
    [[34, 8], [58, 2], [82, 0]].forEach((q) => g.poly([[q[0], q[1]], [q[0] + 5, q[1] + 4], [q[0] + 3, q[1] + 22], [q[0] - 2, q[1] + 20]], e));
    return g.volume({ cap: 9, keep: new Set([C.ink, C.ink2, C.white, C.gold2, s]), hi: 0.1, lo: 0.34 }).outlineTint(0.85);
  },
  frostDragon() {
    const g = new Grid(128, 128);
    const a = 0x2d6a96, b = C.ice2, c = C.ice;
    g.curve(120, 116, 110, 96, 70, 104, a, 12, 18);
    g.curve(70, 104, 16, 112, 22, 80, a, 18, 20);
    g.curve(22, 80, 30, 50, 66, 66, a, 20, 18);
    g.curve(66, 66, 104, 82, 94, 44, a, 18, 15);
    const seg = [[24, 96], [36, 106], [52, 106], [24, 76], [34, 62], [50, 60], [70, 70], [90, 74], [96, 60]];
    seg.forEach((q) => g.ell(q[0], q[1], 5, 4, b));
    [[28, 60], [14, 74], [14, 100], [46, 50], [68, 56], [88, 62], [106, 62]].forEach((q) => g.poly([[q[0] - 4, q[1] + 4], [q[0], q[1] - 11], [q[0] + 4, q[1] + 4]], c));
    g.ell(88, 32, 22, 17, a);
    g.poly([[100, 26], [127, 32], [120, 46], [96, 46]], a);
    g.poly([[104, 40], [124, 38], [118, 50], [100, 50]], b);
    g.poly([[78, 18], [64, 0], [84, 10], [90, 0], [92, 16]], c);
    g.poly([[84, 14], [80, 0], [76, 16]], b);
    g.rect(90, 24, 9, 7, C.gold2);
    g.rect(94, 25, 3, 5, C.ink);
    g.rect(112, 28, 3, 2, C.ink);
    for (let i = 0; i < 4; i++) g.poly([[102 + i * 5, 43], [106 + i * 5, 43], [104 + i * 5, 49]], C.white);
    g.curve(110, 28, 122, 12, 116, 4, c, 2, 1);
    return done(g, 0.22, 0.25);
  },
  pei1() { return peiBoss(1); },
  pei2() { return peiBoss(2); },
};

function monsterGrid(art) {
  const key = typeof art === 'string' ? art : art.base;
  const p = typeof art === 'string' ? {} : art;
  return DRAW[key](p);
}

module.exports = { monsterGrid, DRAW };
