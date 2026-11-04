// Party members and story portraits. Every character faces left (toward enemies).
const { Grid } = require('../core/paint.js');
const { C, lit, drk } = require('../core/palette.js');

const FW = 40, FH = 46;

// Poses: bob (breathing), lean (torso shift), legs (stride), arm: rest | swing | thrust | raise | hurt
function layers(o, p) {
  const g = new Grid(FW, FH);
  const foot = FH - 2;
  const b = p.bob || 0, l = p.lean || 0;
  const hx = 18 + l, hy = 13 + b; // head centre
  if (o.backLayer) o.backLayer(g, hx, hy, p);

  // legs
  const top = foot - 10 + b;
  const ll = p.legA || 0, lr = p.legB || 0;
  g.rect(15 + ll, top, 4, foot - top - 1, drk(o.legs, 0.25));
  g.rect(22 + lr, top, 4, foot - top - 1, o.legs);
  g.rect(14 + ll, foot - 2, 6, 3, drk(o.boots, 0.2));
  g.rect(21 + lr, foot - 2, 6, 3, o.boots);

  o.body(g, hx, hy, p, foot);
  o.head(g, hx, hy, p);
  if (o.frontLayer) o.frontLayer(g, hx, hy, p, foot);
  return g.outline();
}

function eyes(g, x, y, c, closed) {
  if (closed) {
    g.rect(x, y + 1, 2, 1, c);
    g.rect(x + 4, y + 1, 2, 1, c);
    return;
  }
  g.rect(x, y, 2, 2, c);
  g.rect(x + 4, y, 2, 2, c);
  g.set(x, y, C.white);
  g.set(x + 4, y, C.white);
}

const SPEC = {
  // Cen Xing: young courier with a red headband, indigo jacket and a letter satchel.
  cen: {
    legs: 0x2f3656, boots: C.ochre,
    backLayer(g, hx, hy, p) {
      const w = p.anim ? 2 : 0;
      g.curve(hx + 6, hy - 3, hx + 12, hy - 5 + w, hx + 17, hy + 1 - w, C.red, 3, 1);
      g.curve(hx + 6, hy - 1, hx + 11, hy + 1 - w, hx + 15, hy + 5 + w, C.red2, 2, 1);
      g.poly([[hx + 1, hy + 7], [hx + 7, hy + 7], [hx + 12, hy + 23], [hx + 3, hy + 21]], C.ochre2);
    },
    body(g, hx, hy, p, foot) {
      const top = hy + 7, bot = foot - 9 + (p.bob || 0);
      g.poly([[hx - 5, top], [hx + 6, top], [hx + 8, bot], [hx - 6, bot]], C.blue2);
      g.poly([[hx - 5, top], [hx - 1, top], [hx - 2, bot], [hx - 6, bot]], C.blue);
      g.rect(hx - 6, bot - 5, 14, 2, C.gold3);
      g.rect(hx + 4, bot - 4, 6, 6, C.ochre);
      g.rect(hx + 4, bot - 4, 6, 1, C.ochre3);
      g.set(hx + 7, bot - 2, C.gold2);
      g.poly([[hx - 7, top - 1], [hx + 7, top - 1], [hx + 8, top + 3], [hx - 7, top + 4]], C.ochre);
      g.rect(hx - 7, top + 3, 15, 1, C.ochre2);
      const armY = top + 3;
      if (p.arm === 'swing') {
        g.curve(hx - 3, armY, hx - 9, armY - 3, hx - 13, armY - 2, C.blue, 4, 3);
        g.rect(hx - 15, armY - 4, 3, 3, C.skin);
        g.line(hx - 15, armY - 4, hx - 15 - 3, armY - 13, C.ice, 2);
        g.line(hx - 16, armY - 3, hx - 13, armY - 3, C.gold, 1);
      } else if (p.arm === 'thrust') {
        g.curve(hx - 3, armY, hx - 8, armY + 1, hx - 12, armY + 1, C.blue, 4, 3);
        g.rect(hx - 14, armY, 3, 3, C.skin);
        g.line(hx - 15, armY + 1, hx - 18, armY + 1, C.gold, 1);
        g.line(hx - 18, armY + 1, hx - 18, armY + 1, C.ice, 2);
      } else if (p.arm === 'raise') {
        g.curve(hx - 3, armY, hx - 8, armY - 5, hx - 8, armY - 11, C.blue, 4, 3);
        g.rect(hx - 9, armY - 14, 3, 3, C.skin);
        g.rect(hx - 11, armY - 20, 5, 7, C.paper);
        g.rect(hx - 10, armY - 19, 3, 5, C.red);
      } else {
        g.curve(hx - 3, armY, hx - 7, armY + 3, hx - 7, armY + 8, C.blue, 4, 3);
        g.rect(hx - 8, armY + 8, 3, 3, C.skin);
        g.line(hx - 7, armY + 8, hx - 15, armY + 14, C.ice, 2);
        g.line(hx - 9, armY + 7, hx - 5, armY + 11, C.gold, 1);
      }
    },
    head(g, hx, hy, p) {
      g.ell(hx, hy, 8, 8, C.skin);
      g.ell(hx + 1, hy - 5, 9, 5, 0x262038);
      g.poly([[hx + 4, hy - 4], [hx + 9, hy - 4], [hx + 9, hy + 5], [hx + 5, hy + 3]], 0x262038);
      g.poly([[hx - 8, hy - 3], [hx - 3, hy - 3], [hx - 7, hy], [hx - 8, hy]], 0x262038);
      g.rect(hx - 8, hy - 5, 17, 2, C.red);
      g.ell(hx + 2, hy - 11, 3, 3, 0x262038);
      g.rect(hx + 1, hy - 8, 3, 1, C.gold);
      eyes(g, hx - 6, hy + 1, C.ink, p.closed);
      g.set(hx - 4, hy + 5, C.skin2);
      g.rect(hx - 4, hy + 6, 2, 1, p.arm === 'hurt' ? C.ink : C.red2);
    },
  },
  // A Ruo: mountain shaman with peach blossoms in her hair and a leaf-tipped staff.
  ruo: {
    legs: C.jade2, boots: C.jade2,
    backLayer(g, hx, hy, p) {
      g.poly([[hx - 2, hy - 6], [hx + 10, hy - 2], [hx + 12, hy + 16], [hx + 3, hy + 18]], 0x2b2140);
    },
    body(g, hx, hy, p, foot) {
      const top = hy + 7;
      g.poly([[hx - 5, top], [hx + 6, top], [hx + 11, foot], [hx - 10, foot]], C.jade);
      g.poly([[hx - 5, top], [hx - 1, top], [hx - 4, foot], [hx - 10, foot]], C.jade3);
      g.poly([[hx + 5, top], [hx + 6, top], [hx + 11, foot], [hx + 6, foot]], C.jade2);
      g.rect(hx - 6, top + 7, 13, 2, C.peach);
      g.rect(hx + 1, top + 9, 2, 8, C.peach);
      g.rect(hx - 9, foot - 2, 20, 2, C.paper2);
      g.rect(hx - 3, top, 6, 2, C.paper);
      const armY = top + 3;
      if (p.arm === 'raise' || p.arm === 'swing') {
        g.curve(hx - 3, armY, hx - 8, armY - 4, hx - 9, armY - 9, C.jade3, 4, 3);
        g.rect(hx - 10, armY - 12, 3, 3, C.skin);
        g.line(hx - 9, armY - 2, hx - 9, armY - 22, C.ochre, 2);
        g.ell(hx - 9, armY - 25, 4, 5, C.jade3);
        g.set(hx - 9, armY - 25, C.gold2);
      } else if (p.arm === 'thrust') {
        g.curve(hx - 3, armY, hx - 8, armY, hx - 12, armY, C.jade3, 4, 3);
        g.rect(hx - 14, armY - 1, 3, 3, C.skin);
        g.line(hx - 6, armY + 8, hx - 19, armY - 7, C.ochre, 2);
        g.ell(hx - 21, armY - 10, 4, 4, C.jade3);
      } else {
        g.curve(hx - 3, armY, hx - 7, armY + 2, hx - 8, armY + 6, C.jade3, 4, 3);
        g.rect(hx - 9, armY + 6, 3, 3, C.skin);
        g.line(hx - 9, foot - 1, hx - 9, armY - 14, C.ochre, 2);
        g.ell(hx - 9, armY - 17, 3, 5, C.jade3);
        g.set(hx - 9, armY - 17, C.gold2);
      }
    },
    head(g, hx, hy, p) {
      g.ell(hx, hy, 8, 8, C.skin);
      g.ell(hx + 1, hy - 5, 9, 5, 0x2b2140);
      g.poly([[hx + 3, hy - 4], [hx + 9, hy - 4], [hx + 9, hy + 6], [hx + 5, hy + 3]], 0x2b2140);
      g.poly([[hx - 8, hy - 3], [hx - 2, hy - 3], [hx - 7, hy], [hx - 8, hy + 1]], 0x2b2140);
      g.ell(hx + 6, hy - 7, 3, 3, C.peach);
      g.set(hx + 6, hy - 7, C.gold2);
      g.ell(hx + 2, hy - 9, 2, 2, C.peach2);
      g.rect(hx - 7, hy - 6, 10, 1, 0xc9d3dd);
      eyes(g, hx - 6, hy + 1, C.ink, p.closed);
      g.rect(hx - 7, hy + 4, 2, 1, C.peach);
      g.rect(hx - 1, hy + 4, 2, 1, C.peach);
      g.rect(hx - 4, hy + 6, 2, 1, C.red2);
    },
  },
  // Shou Zhuo: bronze puppet of an ancient maker, one glowing eye, patched with verdigris.
  zhuo: {
    legs: C.bronze2, boots: C.bronze,
    body(g, hx, hy, p, foot) {
      const top = hy + 6, bot = foot - 8 + (p.bob || 0);
      g.poly([[hx - 9, top], [hx + 9, top], [hx + 7, bot], [hx - 7, bot]], C.bronze);
      g.rect(hx - 7, bot - 2, 14, 2, C.bronze2);
      g.rect(hx - 3, top + 3, 6, 6, C.bronze2);
      g.rect(hx - 2, top + 4, 4, 4, p.anim ? C.ice : C.blue3);
      g.set(hx - 6, top + 2, C.jade3);
      g.set(hx + 6, top + 8, C.jade3);
      g.rect(hx + 5, top + 4, 3, 2, C.jade);
      g.ell(hx + 9, top + 2, 5, 5, C.bronze3);
      g.set(hx + 9, top + 2, C.bronze2);
      g.rect(hx + 8, top + 6, 5, 9, C.bronze2);
      g.rect(hx + 7, top + 14, 7, 5, C.bronze);
      const armY = top + 3;
      g.ell(hx - 9, armY - 1, 5, 5, C.bronze3);
      g.set(hx - 9, armY - 1, C.bronze2);
      if (p.arm === 'swing' || p.arm === 'raise') {
        g.rect(hx - 13, armY - 9, 5, 7, C.bronze2);
        g.rect(hx - 14, armY - 13, 7, 5, C.bronze);
        g.line(hx - 11, armY - 8, hx - 11, armY - 16, C.ochre2, 2);
        g.rect(hx - 17, armY - 21, 13, 6, C.ink3);
        g.rect(hx - 17, armY - 21, 13, 1, C.ink4);
      } else if (p.arm === 'thrust') {
        g.rect(hx - 20, armY - 2, 10, 5, C.bronze2);
        g.rect(hx - 25, armY - 4, 7, 8, C.bronze);
      } else {
        g.rect(hx - 13, armY + 3, 5, 8, C.bronze2);
        g.rect(hx - 14, armY + 10, 7, 5, C.bronze);
        g.line(hx - 11, armY + 11, hx - 11, foot - 6, C.ochre2, 2);
        g.rect(hx - 17, foot - 7, 13, 6, C.ink3);
        g.rect(hx - 17, foot - 7, 13, 1, C.ink4);
      }
    },
    head(g, hx, hy, p) {
      g.rect(hx - 8, hy - 7, 16, 13, C.bronze);
      g.rect(hx - 8, hy - 7, 16, 2, C.bronze3);
      g.rect(hx - 9, hy - 4, 1, 6, C.bronze2);
      g.rect(hx - 8, hy + 4, 16, 2, C.bronze2);
      g.rect(hx - 6, hy - 2, 7, 5, C.ink2);
      g.rect(hx - 5, hy - 1, 4, 3, p.closed ? C.ink3 : C.ice);
      g.set(hx - 4, hy, C.white);
      g.set(hx + 4, hy - 3, C.bronze2);
      g.set(hx + 6, hy - 3, C.bronze2);
      g.set(hx + 4, hy + 2, C.jade3);
      g.rect(hx - 1, hy - 11, 2, 4, C.ochre2);
      g.rect(hx - 2, hy - 12, 4, 2, C.gold3);
    },
  },
};

const POSES = {
  idle0: { arm: 'rest', bob: 0 },
  idle1: { arm: 'rest', bob: 1, anim: 1 },
  atk: { arm: 'swing', lean: -2, legA: -2, legB: 1 },
  thrust: { arm: 'thrust', lean: -4, legA: -3, legB: 2 },
  cast: { arm: 'raise', anim: 1 },
  hurt: { arm: 'rest', lean: 2, closed: 1, legA: 1, legB: 1 },
  walk0: { arm: 'rest', legA: -2, legB: 1 },
  walk1: { arm: 'rest', bob: -1, legA: 0, legB: 0 },
  walk2: { arm: 'rest', legA: 1, legB: -2 },
  walk3: { arm: 'rest', bob: -1, legA: 0, legB: 0 },
};

function heroGrid(id, pose) {
  if (pose === 'ko') {
    const g = layers(SPEC[id], { arm: 'rest', closed: 1 }).rot90();
    return g;
  }
  return layers(SPEC[id], POSES[pose]);
}

// ---- 48x48 dialogue portraits ----
function portraitBase(skin) {
  const g = new Grid(48, 48);
  g.ell(24, 24, 13, 14, skin);
  g.rect(19, 37, 10, 5, drk(skin, 0.2));
  return g;
}
function bigEyes(g, y, iris, closed) {
  if (closed) {
    g.rect(14, y + 2, 6, 1, C.ink);
    g.rect(27, y + 2, 6, 1, C.ink);
    return;
  }
  g.rect(14, y, 6, 5, C.white);
  g.rect(27, y, 6, 5, C.white);
  g.rect(16, y, 4, 5, iris);
  g.rect(29, y, 4, 5, iris);
  g.rect(14, y - 1, 6, 1, C.ink);
  g.rect(27, y - 1, 6, 1, C.ink);
  g.set(17, y + 1, C.white);
  g.set(30, y + 1, C.white);
}

const PORTRAITS = {
  cen() {
    const g = portraitBase(C.skin);
    const hair = 0x262038;
    g.poly([[8, 42], [40, 42], [44, 48], [4, 48]], C.blue2);
    g.poly([[14, 40], [34, 40], [36, 46], [12, 46]], C.ochre);
    g.poly([[20, 40], [24, 46], [28, 40]], C.skin);
    g.ell(24, 16, 15, 11, hair);
    g.poly([[9, 16], [15, 15], [13, 26], [9, 30]], hair);
    g.poly([[39, 16], [33, 15], [36, 26], [39, 30]], hair);
    g.poly([[14, 15], [24, 15], [20, 22], [16, 19]], hair);
    g.poly([[24, 15], [34, 15], [33, 21], [28, 18]], hair);
    g.ell(26, 5, 5, 5, hair);
    g.rect(23, 8, 6, 2, C.gold);
    g.rect(9, 12, 30, 3, C.red);
    g.rect(9, 12, 30, 1, C.red3);
    g.curve(39, 13, 44, 15, 46, 22, C.red, 3, 1);
    bigEyes(g, 23, C.blue2);
    g.rect(23, 30, 2, 1, C.skin2);
    g.rect(21, 34, 6, 1, C.red2);
    return g;
  },
  ruo() {
    const g = portraitBase(C.skin);
    const hair = 0x2b2140;
    g.poly([[4, 18], [12, 14], [10, 44], [3, 44]], hair);
    g.poly([[44, 18], [36, 14], [38, 44], [45, 44]], hair);
    g.poly([[10, 42], [38, 42], [42, 48], [6, 48]], C.jade);
    g.poly([[18, 41], [30, 41], [26, 47], [22, 47]], C.paper);
    g.ell(24, 15, 15, 10, hair);
    g.poly([[11, 14], [24, 14], [17, 24], [12, 22]], hair);
    g.poly([[24, 14], [37, 14], [36, 22], [30, 20]], hair);
    g.rect(13, 11, 22, 1, 0xc9d3dd);
    g.ell(36, 11, 4, 4, C.peach);
    g.set(36, 11, C.gold2);
    g.ell(30, 7, 3, 3, C.peach2);
    g.set(30, 7, C.gold2);
    g.ell(39, 17, 2, 2, C.peach2);
    bigEyes(g, 24, C.jade2);
    g.rect(13, 30, 4, 1, C.peach);
    g.rect(31, 30, 4, 1, C.peach);
    g.rect(22, 34, 4, 1, C.red);
    return g;
  },
  zhuo() {
    const g = new Grid(48, 48);
    g.poly([[6, 40], [42, 40], [46, 48], [2, 48]], C.bronze2);
    g.rect(10, 8, 28, 30, C.bronze);
    g.rect(10, 8, 28, 3, C.bronze3);
    g.rect(10, 34, 28, 4, C.bronze2);
    g.rect(14, 18, 12, 9, C.ink2);
    g.rect(16, 20, 7, 5, C.ice);
    g.rect(17, 21, 2, 2, C.white);
    g.rect(29, 21, 6, 1, C.bronze2);
    g.rect(29, 24, 6, 1, C.bronze2);
    g.rect(16, 31, 16, 2, C.ink2);
    for (let i = 0; i < 4; i++) g.rect(17 + i * 4, 31, 2, 2, C.bronze3);
    g.rect(32, 13, 4, 3, C.jade);
    g.set(13, 12, C.jade3);
    g.set(35, 30, C.jade3);
    g.set(12, 14, C.bronze2);
    g.set(35, 14, C.jade3);
    g.rect(22, 2, 4, 6, C.ochre2);
    g.rect(20, 1, 8, 2, C.gold3);
    g.rect(7, 18, 3, 12, C.bronze2);
    g.rect(38, 18, 3, 12, C.bronze2);
    return g;
  },
  pei() {
    const g = portraitBase(0xe6c8b0);
    const hair = 0xd8dce8;
    g.poly([[6, 42], [42, 42], [46, 48], [2, 48]], C.violet2);
    g.poly([[18, 40], [30, 40], [27, 48], [21, 48]], C.gold3);
    g.poly([[6, 16], [14, 14], [12, 42], [4, 42]], hair);
    g.poly([[42, 16], [34, 14], [36, 42], [44, 42]], hair);
    g.ell(24, 15, 15, 10, hair);
    g.poly([[12, 14], [24, 14], [16, 26], [12, 22]], hair);
    g.poly([[24, 14], [36, 14], [36, 24], [30, 20]], hair);
    g.rect(14, 4, 20, 5, C.ink2);
    g.rect(14, 8, 20, 1, C.gold);
    g.rect(22, 0, 4, 5, C.ink2);
    g.line(4, 5, 44, 5, C.gold3, 1);
    g.rect(14, 22, 6, 1, 0x8d8aa0);
    g.rect(27, 22, 6, 1, 0x8d8aa0);
    g.rect(14, 24, 6, 3, C.white);
    g.rect(27, 24, 6, 3, C.white);
    g.rect(16, 24, 3, 3, C.violet);
    g.rect(29, 24, 3, 3, C.violet);
    g.rect(18, 30, 1, 3, 0xc9a890);
    g.rect(29, 30, 1, 3, 0xc9a890);
    g.rect(21, 34, 6, 1, 0x7a5a60);
    return g;
  },
  old() {
    const g = portraitBase(0xddb48e);
    const white = 0xe6e2d6;
    g.poly([[6, 42], [42, 42], [46, 48], [2, 48]], C.ochre2);
    g.ell(24, 13, 14, 8, 0x3a3350);
    g.rect(10, 13, 28, 3, 0x524a6b);
    g.rect(13, 22, 7, 2, white);
    g.rect(28, 22, 7, 2, white);
    g.rect(15, 25, 4, 2, C.ink);
    g.rect(29, 25, 4, 2, C.ink);
    g.poly([[13, 31], [35, 31], [30, 47], [24, 48], [18, 47]], white);
    g.rect(20, 32, 8, 1, 0x7a5a50);
    return g;
  },
};

// Full-size antagonist battle sprite, drawn by hand because he stands much taller than the party.
function peiBoss(phase) {
  const g = new Grid(88, 112);
  const robe = phase === 2 ? 0x2a1d55 : C.violet2;
  const glow = phase === 2 ? C.gold2 : C.blue3;
  if (phase === 2) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const x = 44 + Math.cos(a) * 40, y = 42 + Math.sin(a) * 40;
      g.ell(x, y, 2, 2, C.gold2);
    }
  }
  g.poly([[28, 104], [60, 104], [68, 110], [20, 110]], drk(robe, 0.4));
  g.poly([[34, 40], [54, 40], [66, 106], [22, 106]], robe);
  g.poly([[34, 40], [41, 40], [34, 106], [22, 106]], lit(robe, 0.16));
  g.poly([[41, 42], [47, 42], [48, 106], [40, 106]], C.ink2);
  g.rect(36, 62, 16, 3, C.gold3);
  const stars = [[28, 88], [32, 72], [55, 76], [60, 94], [43, 92], [44, 74], [38, 100]];
  stars.forEach((s) => g.set(s[0], s[1], glow));
  g.poly([[32, 42], [20, 56], [16, 74], [26, 76], [33, 58]], robe);
  g.poly([[56, 42], [68, 54], [76, 68], [68, 74], [56, 58]], robe);
  g.rect(70, 66, 5, 4, 0xe6c8b0);
  g.line(72, 26, 72, 106, C.gold3, 2);
  g.ell(72, 20, 6, 6, glow);
  g.ell(72, 20, 3, 3, C.white);
  g.ell(44, 26, 11, 12, 0xe6c8b0);
  g.poly([[32, 22], [37, 16], [36, 56], [29, 54]], 0xd8dce8);
  g.poly([[56, 22], [51, 16], [52, 56], [59, 54]], 0xd8dce8);
  g.ell(44, 19, 12, 7, 0xd8dce8);
  g.rect(36, 10, 16, 5, C.ink2);
  g.rect(36, 14, 16, 1, C.gold);
  g.rect(26, 11, 36, 1, C.gold3);
  g.rect(41, 6, 6, 4, C.ink2);
  g.rect(38, 26, 4, 2, phase === 2 ? C.gold2 : C.ink);
  g.rect(47, 26, 4, 2, phase === 2 ? C.gold2 : C.ink);
  g.rect(41, 34, 6, 1, 0x7a5a60);
  return g.rim(0.18, 0.28).outline();
}

module.exports = { heroGrid, PORTRAITS, peiBoss, FW, FH, POSE_NAMES: Object.keys(POSES).concat('ko') };
