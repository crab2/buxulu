// Party members and story portraits. Every character faces left (toward enemies).
// Heroes are drawn from a small skeleton (hip, feet, shoulders, hands), so the walk cycle moves real
// limbs. Palettes can be swapped, which is how outfits work without any extra art.
const { Grid } = require('../core/paint.js');
const { C, mix, lit, drk } = require('../core/palette.js');

const FW = 60, FH = 58;
const FOOT = FH - 3;
const CX = 31;

const SKIN = { base: C.skin, dark: C.skin2 };

function leg(g, hipX, hipY, foot, c, boot) {
  const ax = hipX + foot.x, ay = FOOT - foot.lift;
  const kx = (hipX + ax) / 2 - 1, ky = (hipY + ay) / 2;
  g.line(hipX, hipY, kx, ky, c, 4);
  g.line(kx, ky, ax, ay - 1, c, 4);
  g.rect(ax - 4, ay - 2, 6, 3, boot);
  g.rect(ax - 4, ay - 2, 6, 1, lit(boot, 0.25));
}

function face(g, hx, hy, closed, iris, mouth) {
  if (closed) {
    g.rect(hx - 7, hy + 2, 3, 1, C.ink);
    g.rect(hx - 2, hy + 2, 3, 1, C.ink);
  } else {
    g.rect(hx - 7, hy, 3, 3, C.ink);
    g.rect(hx - 2, hy, 3, 3, C.ink);
    g.rect(hx - 6, hy + 1, 2, 2, iris);
    g.rect(hx - 1, hy + 1, 2, 2, iris);
    g.set(hx - 7, hy, C.white);
    g.set(hx - 2, hy, C.white);
  }
  g.set(hx - 4, hy + 4, SKIN.dark);
  g.rect(hx - 5, hy + 6, 2, 1, mouth);
}

const SPEC = {
  // Cen Xing: young courier with a red headband, indigo jacket and a letter satchel.
  cen: {
    pal: { coat: C.blue2, coat2: C.blue, scarf: C.ochre, scarf2: C.ochre3, band: C.red, band2: C.red2, legs: 0x2f3656, boot: C.ochre2, hair: 0x262038, hair2: 0x4a3f70, sash: C.gold3, blade: C.ice },
    draw(g, f, p) {
      const { hx, hy, hipX, hipY, wind } = f;
      const top = hy + 8;
      // Headband tails stream out behind, faster when the party hurries.
      g.curve(hx + 7, hy - 4, hx + 13, hy - 6 + wind * 3, hx + 19, hy + wind * 4, p.band, 3, 1);
      g.curve(hx + 7, hy - 2, hx + 12, hy + 1 - wind * 2, hx + 16, hy + 6 + wind * 3, p.band2, 2, 1);
      // Far arm
      g.line(hx + 3, top + 3, hx + 3 + f.armB, top + 11, drk(p.coat, 0.3), 3);
      g.rect(hx + 2 + f.armB, top + 11, 3, 3, drk(SKIN.base, 0.15));
      leg(g, hipX + 2, hipY, f.footB, drk(p.legs, 0.3), drk(p.boot, 0.25));
      leg(g, hipX - 2, hipY, f.footF, p.legs, p.boot);
      // Satchel on the far hip
      g.rect(hx + 5, hipY - 5, 7, 8, C.ochre);
      g.rect(hx + 5, hipY - 5, 7, 3, C.ochre3);
      g.set(hx + 8, hipY - 3, C.gold2);
      // Jacket with a skirt that swings
      const bot = hipY + 1;
      g.poly([[hx - 5, top], [hx + 6, top], [hx + 7, bot], [hx - 6, bot]], p.coat);
      g.poly([[hx - 5, top], [hx - 1, top], [hx - 2, bot], [hx - 6, bot]], p.coat2);
      g.poly([[hx - 6, bot - 2], [hx + 7, bot - 2], [hx + 8 + f.swing, bot + 5], [hx - 7 + f.swing, bot + 5]], p.coat);
      g.poly([[hx - 6, bot - 2], [hx - 2, bot - 2], [hx - 3 + f.swing, bot + 5], [hx - 7 + f.swing, bot + 5]], p.coat2);
      g.rect(hx - 6, bot - 3, 14, 2, p.sash);
      g.set(hx - 3, bot - 3, C.gold2);
      g.line(hx + 5, top + 1, hx - 4, bot - 3, C.ochre2);
      // Scarf
      g.poly([[hx - 7, top - 1], [hx + 7, top - 1], [hx + 8, top + 3], [hx - 7, top + 4]], p.scarf);
      g.rect(hx - 7, top + 3, 15, 1, drk(p.scarf, 0.3));
      g.rect(hx - 6, top - 1, 8, 1, p.scarf2);
      g.poly([[hx + 6, top], [hx + 12, top + 1 + wind * 2], [hx + 14, top + 5 + wind * 2], [hx + 7, top + 4]], p.scarf);
      // Head
      g.ell(hx + 2, hy - 2, 9, 8, p.hair);
      g.ell(hx - 1, hy + 1, 7, 7, SKIN.base);
      g.rect(hx + 4, hy + 1, 2, 3, SKIN.dark);
      g.poly([[hx + 3, hy - 3], [hx + 10, hy - 3], [hx + 10, hy + 4], [hx + 5, hy + 1]], p.hair);
      g.poly([[hx - 9, hy - 4], [hx - 2, hy - 4], [hx - 5, hy - 1], [hx - 8, hy + 1]], p.hair);
      g.poly([[hx - 3, hy - 4], [hx + 3, hy - 4], [hx + 1, hy - 1], [hx - 2, hy - 2]], p.hair);
      g.ell(hx + 3, hy - 11, 3, 3, p.hair);
      g.rect(hx + 1, hy - 8, 4, 1, C.gold);
      g.rect(hx - 3, hy - 9, 8, 1, p.hair2);
      g.rect(hx - 8, hy - 6, 17, 2, p.band);
      g.rect(hx - 8, hy - 6, 17, 1, lit(p.band, 0.35));
      face(g, hx, hy, f.closed, C.blue2, f.arm === 'hurt' ? C.ink : C.red2);
      // Near arm and sword
      const sx = hx - 3, sy = top + 3;
      const hand = (x, y) => {
        g.line(sx, sy, x, y, p.coat2, 4);
        g.rect(x - 1, y, 3, 3, SKIN.base);
      };
      if (f.arm === 'windup') {
        hand(hx + 2, top - 5);
        g.line(hx + 3, top - 5, hx + 12, top - 14, p.blade, 2);
        g.line(hx + 1, top - 7, hx + 5, top - 3, C.gold);
      } else if (f.arm === 'swing') {
        hand(hx - 12, sy - 2);
        g.line(hx - 13, sy - 2, hx - 22, sy + 2, p.blade, 2);
        g.line(hx - 13, sy - 2, hx - 22, sy + 1, C.white);
        g.line(hx - 13, sy - 5, hx - 12, sy + 1, C.gold);
      } else if (f.arm === 'thrust') {
        hand(hx - 12, sy + 1);
        g.line(hx - 14, sy + 2, hx - 26, sy + 2, p.blade, 2);
        g.line(hx - 14, sy + 2, hx - 26, sy + 2, C.white);
        g.rect(hx - 14, sy, 1, 5, C.gold);
      } else if (f.arm === 'raise') {
        hand(hx - 7, sy - 12);
        g.rect(hx - 10, sy - 21, 6, 8, C.paper);
        g.rect(hx - 9, sy - 20, 4, 6, C.red);
        g.rect(hx - 8, sy - 19, 2, 1, C.gold2);
      } else {
        const hx2 = hx - 6 + f.armF, hy2 = top + 11;
        hand(hx2, hy2);
        const back = f.moving ? 1 : -1;
        g.line(hx2 + back, hy2 + 2, hx2 + back * 9, hy2 + 8, p.blade, 2);
        g.line(hx2 - 2, hy2 + 1, hx2 + 2, hy2 + 3, C.gold);
      }
    },
  },
  // A Ruo: mountain shaman with peach blossoms in her hair and a leaf-tipped staff.
  ruo: {
    pal: { robe: C.jade, robe2: C.jade3, robe3: C.jade2, sash: C.peach, hem: C.paper2, hair: 0x2b2140, hair2: 0x54467c, flower: C.peach, flower2: C.peach2, staff: C.ochre, leaf: C.jade3 },
    draw(g, f, p) {
      const { hx, hy, wind } = f;
      const top = hy + 8;
      const foot = FOOT;
      // Long hair falls behind and drifts with the walk.
      g.poly([[hx - 1, hy - 6], [hx + 10, hy - 3], [hx + 12 + wind * 2, hy + 20], [hx + 5 + wind * 2, hy + 22], [hx + 2, hy + 8]], p.hair);
      g.line(hx + 7, hy - 1, hx + 9 + wind * 2, hy + 18, p.hair2);
      // Far sleeve
      g.line(hx + 3, top + 3, hx + 3 + f.armB, top + 11, p.robe3, 4);
      // Feet peek out below the hem while walking.
      if (f.moving) {
        g.rect(hx - 4 + f.footF.x, foot - 2 - f.footF.lift, 5, 3, p.robe3);
        g.rect(hx + 1 + f.footB.x, foot - 2 - f.footB.lift, 5, 3, drk(p.robe3, 0.3));
      }
      // Skirt
      const hem = foot - 1;
      const sw = f.swing;
      g.poly([[hx - 5, top + 5], [hx + 6, top + 5], [hx + 11 + sw, hem], [hx - 10 + sw, hem]], p.robe);
      g.poly([[hx - 5, top + 5], [hx - 1, top + 5], [hx - 4 + sw, hem], [hx - 10 + sw, hem]], p.robe2);
      g.poly([[hx + 5, top + 5], [hx + 6, top + 5], [hx + 11 + sw, hem], [hx + 6 + sw, hem]], p.robe3);
      g.rect(hx - 10 + sw, hem - 2, 21, 2, p.hem);
      // Bodice
      g.poly([[hx - 5, top], [hx + 5, top], [hx + 5, top + 6], [hx - 5, top + 6]], p.robe);
      g.rect(hx - 3, top, 6, 2, C.paper);
      g.rect(hx - 6, top + 5, 13, 2, p.sash);
      g.rect(hx + 1, top + 7, 2, 8 + Math.abs(sw), p.sash);
      // Head
      g.ell(hx + 1, hy - 2, 9, 8, p.hair);
      g.ell(hx - 1, hy + 1, 7, 7, SKIN.base);
      g.poly([[hx + 3, hy - 3], [hx + 9, hy - 3], [hx + 9, hy + 6], [hx + 5, hy + 3]], p.hair);
      g.poly([[hx - 8, hy - 3], [hx - 1, hy - 3], [hx - 6, hy], [hx - 8, hy + 1]], p.hair);
      g.rect(hx - 6, hy - 9, 9, 1, p.hair2);
      g.rect(hx - 7, hy - 5, 10, 1, 0xc9d3dd);
      g.ell(hx + 6, hy - 7, 3, 3, p.flower);
      g.set(hx + 6, hy - 7, C.gold2);
      g.ell(hx + 2, hy - 10, 2, 2, p.flower2);
      face(g, hx, hy, f.closed, C.jade2, C.red);
      g.rect(hx - 8, hy + 4, 2, 1, C.peach);
      g.rect(hx - 1, hy + 4, 2, 1, C.peach);
      // Near sleeve and staff
      const sx = hx - 3, sy = top + 3;
      const staff = (x0, y0, x1, y1) => {
        g.line(x0, y0, x1, y1, p.staff, 2);
        g.ell(x1, y1 - 3, 3, 5, p.leaf);
        g.set(x1, y1 - 3, C.gold2);
      };
      const sleeve = (x, y) => {
        g.line(sx, sy, x, y, p.robe2, 5);
        g.rect(x - 1, y + 1, 3, 3, SKIN.base);
      };
      if (f.arm === 'raise' || f.arm === 'swing' || f.arm === 'windup') {
        staff(hx - 8, sy + 4, hx - 10, sy - 26);
        sleeve(hx - 9, sy - 9);
      } else if (f.arm === 'thrust') {
        staff(hx - 3, sy + 10, hx - 22, sy - 8);
        sleeve(hx - 12, sy);
      } else {
        const ax = hx - 9 + f.armF;
        staff(ax, foot - 1 - (f.moving ? 2 : 0), ax - (f.moving ? 2 : 0), sy - 16);
        sleeve(ax + 1, sy + 5);
      }
    },
  },
  // Shou Zhuo: bronze puppet of an ancient maker, one glowing eye, patched with verdigris.
  zhuo: {
    pal: { body: C.bronze, body2: C.bronze2, body3: C.bronze3, patina: C.jade, patina2: C.jade3, core: C.blue3, core2: C.ice, hammer: C.ink3, haft: C.ochre2 },
    draw(g, f, p) {
      const { hx, hy, hipX, hipY } = f;
      const top = hy + 6;
      const armY = top + 3;
      // Far arm
      g.ell(hx + 10, armY - 1, 5, 5, drk(p.body3, 0.25));
      g.rect(hx + 8 + f.armB, armY + 3, 6, 8, drk(p.body2, 0.2));
      g.rect(hx + 7 + f.armB, armY + 10, 8, 5, drk(p.body, 0.25));
      // Legs: short, wide and heavy
      const stomp = (foot, hipOff, c, c2) => {
        const ax = hipX + hipOff + foot.x, ay = FOOT - foot.lift;
        g.line(hipX + hipOff, hipY, ax, ay - 2, c, 6);
        g.rect(ax - 5, ay - 3, 10, 4, c2);
        g.rect(ax - 5, ay - 3, 10, 1, lit(c2, 0.3));
      };
      stomp(f.footB, 4, drk(p.body2, 0.3), drk(p.body, 0.3));
      stomp(f.footF, -4, p.body2, p.body);
      // Chest plate
      const bot = hipY + 1;
      g.poly([[hx - 10, top], [hx + 10, top], [hx + 8, bot], [hx - 8, bot]], p.body);
      g.rect(hx - 8, bot - 2, 16, 2, p.body2);
      g.rect(hx - 9, top, 19, 2, p.body3);
      g.rect(hx - 4, top + 4, 8, 7, p.body2);
      g.rect(hx - 3, top + 5, 6, 5, f.glow ? p.core2 : p.core);
      g.rect(hx - 2, top + 6, 2, 2, C.white);
      g.set(hx - 7, top + 3, C.gold3);
      g.set(hx + 7, top + 3, C.gold3);
      g.set(hx - 6, top + 11, C.gold3);
      g.set(hx + 6, top + 11, C.gold3);
      g.rect(hx + 5, top + 5, 3, 3, p.patina);
      g.set(hx + 6, top + 9, p.patina2);
      // Head
      g.rect(hx - 8, hy - 7, 16, 13, p.body);
      g.rect(hx - 8, hy - 7, 16, 2, p.body3);
      g.rect(hx - 8, hy + 4, 16, 2, p.body2);
      g.rect(hx - 9, hy - 4, 1, 6, p.body2);
      g.rect(hx - 6, hy - 2, 8, 5, C.ink2);
      g.rect(hx - 5, hy - 1, 5, 3, f.closed ? C.ink3 : p.core2);
      g.set(hx - 4, hy, C.white);
      g.rect(hx + 4, hy - 3, 3, 1, p.body2);
      g.rect(hx + 4, hy, 3, 1, p.body2);
      g.set(hx + 4, hy + 2, p.patina2);
      g.rect(hx - 1, hy - 11, 2, 4, p.haft);
      g.rect(hx - 2, hy - 12, 4, 2, C.gold3);
      // Near arm and hammer
      g.ell(hx - 10, armY - 1, 5, 5, p.body3);
      g.set(hx - 10, armY - 1, p.body2);
      const fist = (x, y) => g.rect(x - 4, y, 8, 6, p.body);
      const head = (x, y) => {
        g.rect(x - 7, y - 3, 14, 7, p.hammer);
        g.rect(x - 7, y - 3, 14, 1, C.ink4);
        g.rect(x - 7, y - 3, 2, 7, C.ink4);
      };
      if (f.arm === 'swing' || f.arm === 'windup' || f.arm === 'raise') {
        g.rect(hx - 14, armY - 9, 6, 8, p.body2);
        fist(hx - 11, armY - 14);
        g.line(hx - 11, armY - 9, hx - 11, armY - 20, p.haft, 2);
        head(hx - 11, armY - 23);
      } else if (f.arm === 'thrust') {
        g.rect(hx - 20, armY - 2, 10, 6, p.body2);
        fist(hx - 23, armY - 3);
        g.line(hx - 24, armY, hx - 24, armY + 4, p.haft, 2);
        g.line(hx - 24, armY + 1, hx - 28, armY + 1, p.haft, 2);
        g.rect(hx - 28, armY - 5, 3, 11, p.hammer);
      } else if (f.moving) {
        // Marching with the hammer over the shoulder.
        g.rect(hx - 14 + f.armF, armY + 3, 6, 7, p.body2);
        fist(hx - 11 + f.armF, armY + 9);
        g.line(hx - 11 + f.armF, armY + 10, hx + 6, armY - 9, p.haft, 2);
        head(hx + 8, armY - 12);
      } else {
        g.rect(hx - 14, armY + 3, 6, 8, p.body2);
        fist(hx - 11, armY + 10);
        g.line(hx - 11, armY + 11, hx - 11, FOOT - 7, p.haft, 2);
        head(hx - 11, FOOT - 4);
      }
    },
  },
};

const STANCE = { footF: { x: -3, lift: 0 }, footB: { x: 3, lift: 0 } };

function walkFrame(i) {
  const th = (i / 6) * Math.PI * 2;
  const foot = (t) => ({ x: Math.round(-5 * Math.cos(t)), lift: Math.sin(t) < 0 ? Math.round(3 * -Math.sin(t)) : 0 });
  return {
    moving: 1,
    bob: -Math.round(Math.abs(Math.sin(th))),
    footF: foot(th),
    footB: foot(th + Math.PI),
    armF: Math.round(3 * Math.cos(th)),
    armB: Math.round(-3 * Math.cos(th)),
    swing: Math.round(Math.cos(th)),
    wind: i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : -1,
  };
}

const POSES = {
  idle0: { arm: 'rest', bob: 0, wind: 0 },
  idle1: { arm: 'rest', bob: 1, wind: 1, glow: 1 },
  windup: { arm: 'windup', lean: 3, bob: 0, wind: 1, footF: { x: -5, lift: 0 }, footB: { x: 5, lift: 0 } },
  atk: { arm: 'swing', lean: -3, bob: 1, wind: -1, footF: { x: -7, lift: 0 }, footB: { x: 6, lift: 0 }, swing: -1 },
  thrust: { arm: 'thrust', lean: -4, bob: 1, wind: -1, footF: { x: -8, lift: 0 }, footB: { x: 7, lift: 0 }, swing: -1 },
  cast: { arm: 'raise', bob: 0, wind: 1, glow: 1 },
  hurt: { arm: 'hurt', lean: 3, bob: 1, closed: 1, wind: 1, footF: { x: -1, lift: 0 }, footB: { x: 5, lift: 0 }, swing: 1 },
};
for (let i = 0; i < 6; i++) POSES['walk' + i] = Object.assign({ arm: 'rest' }, walkFrame(i));

function frameOf(p) {
  const lean = p.lean || 0;
  const bob = p.bob || 0;
  return {
    arm: p.arm, closed: p.closed, glow: p.glow, moving: p.moving,
    wind: p.wind || 0, swing: p.swing || 0, armF: p.armF || 0, armB: p.armB || 0,
    hx: CX + lean, hy: FOOT - 31 + bob,
    hipX: CX + Math.round(lean / 2), hipY: FOOT - 12 + bob,
    footF: p.footF || STANCE.footF, footB: p.footB || STANCE.footB,
  };
}

function finish(g) {
  return g.volume({ cap: 4, hi: 0.2, lo: 0.3 }).outlineTint(0.84);
}

function heroGrid(id, pose, outfit) {
  const spec = SPEC[id];
  const pal = outfit ? Object.assign({}, spec.pal, outfit) : spec.pal;
  if (pose === 'ko') {
    const g = new Grid(FW, FH);
    spec.draw(g, frameOf({ arm: 'rest', closed: 1 }), pal);
    const r = g.rot90();
    // Lay the fallen figure on the ground line, inside a normal frame.
    let bottom = 0, left = r.w, right = 0;
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        if (r.d[y * r.w + x] !== -1) {
          bottom = Math.max(bottom, y);
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    const out = new Grid(FW, FH);
    out.stamp(r, Math.round((FW - (right - left)) / 2) - left, FOOT - bottom);
    return finish(out);
  }
  const g = new Grid(FW, FH);
  spec.draw(g, frameOf(POSES[pose]), pal);
  return finish(g);
}

// ---- 48x48 dialogue portraits ----
function headShape(g, skin) {
  g.ell(24, 23, 12, 13, skin);
  g.poly([[13, 27], [35, 27], [30, 36], [24, 38], [18, 36]], skin);
  g.rect(20, 35, 8, 6, drk(skin, 0.22));
}
function bigEyes(g, y, iris, opts) {
  opts = opts || {};
  const lash = opts.lash === undefined ? C.ink : opts.lash;
  if (opts.closed) {
    g.rect(14, y + 2, 6, 1, lash);
    g.rect(27, y + 2, 6, 1, lash);
    return;
  }
  [14, 27].forEach((x) => {
    g.rect(x, y, 7, 6, C.white);
    g.rect(x + 2, y, 4, 6, iris);
    g.rect(x + 3, y + 1, 2, 4, drk(iris, 0.5));
    g.rect(x, y - 1, 7, 1, lash);
    g.set(x + 2, y + 1, C.white);
    g.set(x + 5, y + 4, lit(iris, 0.5));
  });
}
function portraitFinish(g) {
  return g.volume({ cap: 6, hi: 0.18, lo: 0.3 });
}

const PORTRAITS = {
  cen() {
    const g = new Grid(48, 48);
    const hair = 0x262038;
    g.ell(25, 18, 16, 14, hair);
    headShape(g, C.skin);
    g.poly([[6, 42], [42, 42], [46, 48], [2, 48]], C.blue2);
    g.poly([[13, 39], [35, 39], [37, 46], [11, 46]], C.ochre);
    g.poly([[19, 39], [24, 45], [29, 39]], C.skin);
    g.rect(13, 45, 24, 1, C.ochre2);
    g.poly([[9, 15], [15, 13], [13, 26], [10, 31]], hair);
    g.poly([[39, 15], [33, 13], [36, 26], [39, 32]], hair);
    g.poly([[13, 14], [25, 14], [20, 23], [16, 20]], hair);
    g.poly([[25, 14], [35, 14], [34, 22], [29, 18]], hair);
    g.ell(26, 5, 5, 5, hair);
    g.rect(22, 7, 8, 2, C.gold);
    g.rect(22, 7, 8, 1, C.gold2);
    g.rect(16, 3, 12, 1, 0x4a3f70);
    g.rect(9, 11, 30, 3, C.red);
    g.rect(9, 11, 30, 1, C.red3);
    g.curve(39, 12, 44, 14, 46, 22, C.red, 3, 1);
    g.curve(39, 13, 43, 18, 43, 26, C.red2, 2, 1);
    portraitFinish(g);
    bigEyes(g, 22, C.blue);
    g.rect(14, 19, 7, 1, hair);
    g.rect(27, 19, 7, 1, hair);
    g.rect(23, 29, 2, 1, C.skin2);
    g.rect(21, 33, 6, 1, C.red2);
    return g;
  },
  ruo() {
    const g = new Grid(48, 48);
    const hair = 0x2b2140;
    g.poly([[4, 18], [12, 12], [10, 46], [3, 46]], hair);
    g.poly([[44, 18], [36, 12], [38, 46], [45, 46]], hair);
    g.ell(24, 16, 16, 13, hair);
    headShape(g, C.skin);
    g.poly([[9, 42], [39, 42], [43, 48], [5, 48]], C.jade);
    g.poly([[18, 40], [30, 40], [26, 47], [22, 47]], C.paper);
    g.line(18, 40, 22, 47, C.peach);
    g.line(30, 40, 26, 47, C.peach);
    g.poly([[11, 13], [24, 13], [17, 24], [12, 22]], hair);
    g.poly([[24, 13], [37, 13], [36, 22], [30, 19]], hair);
    g.rect(14, 5, 18, 1, 0x54467c);
    g.rect(13, 10, 22, 1, 0xc9d3dd);
    [[36, 10, 5], [30, 5, 3], [40, 17, 3]].forEach((q, i) => {
      g.ell(q[0], q[1], q[2], q[2], i ? C.peach2 : C.peach);
      g.set(q[0], q[1], C.gold2);
    });
    portraitFinish(g);
    bigEyes(g, 23, C.jade2);
    g.rect(14, 20, 6, 1, hair);
    g.rect(28, 20, 6, 1, hair);
    g.rect(13, 30, 4, 1, C.peach);
    g.rect(31, 30, 4, 1, C.peach);
    g.rect(22, 33, 4, 1, C.red);
    return g;
  },
  zhuo() {
    const g = new Grid(48, 48);
    g.poly([[6, 40], [42, 40], [46, 48], [2, 48]], C.bronze2);
    g.rect(16, 42, 16, 6, C.bronze);
    g.rect(20, 43, 8, 5, C.blue3);
    g.rect(10, 8, 28, 30, C.bronze);
    g.poly([[10, 8], [38, 8], [36, 5], [12, 5]], C.bronze3);
    g.rect(10, 34, 28, 4, C.bronze2);
    g.rect(22, 0, 4, 6, C.ochre2);
    g.rect(20, 0, 8, 2, C.gold3);
    g.rect(7, 18, 3, 12, C.bronze2);
    g.rect(38, 18, 3, 12, C.bronze2);
    g.rect(29, 21, 6, 1, C.bronze2);
    g.rect(29, 24, 6, 1, C.bronze2);
    g.rect(32, 13, 5, 4, C.jade);
    g.set(33, 12, C.jade3);
    g.set(13, 12, C.jade3);
    g.set(35, 30, C.jade3);
    portraitFinish(g);
    g.rect(13, 17, 14, 11, C.ink2);
    g.rect(15, 19, 9, 7, C.ice);
    g.rect(17, 21, 4, 3, C.white);
    g.rect(16, 31, 16, 2, C.ink2);
    for (let i = 0; i < 4; i++) g.rect(17 + i * 4, 31, 2, 2, C.bronze3);
    [[12, 10], [36, 10], [12, 36], [36, 36]].forEach((q) => g.set(q[0], q[1], C.gold3));
    return g;
  },
  pei() {
    const g = new Grid(48, 48);
    const hair = 0xd8dce8;
    g.poly([[5, 16], [14, 12], [12, 44], [3, 44]], hair);
    g.poly([[43, 16], [34, 12], [36, 44], [45, 44]], hair);
    g.ell(24, 16, 16, 12, hair);
    headShape(g, 0xe6c8b0);
    g.poly([[5, 42], [43, 42], [47, 48], [1, 48]], C.violet2);
    g.poly([[18, 40], [30, 40], [27, 48], [21, 48]], C.gold3);
    g.poly([[12, 14], [24, 14], [16, 26], [12, 22]], hair);
    g.poly([[24, 14], [36, 14], [36, 24], [30, 20]], hair);
    g.rect(14, 3, 20, 6, C.ink2);
    g.rect(14, 8, 20, 1, C.gold);
    g.rect(22, 0, 4, 4, C.ink2);
    g.line(4, 5, 44, 5, C.gold3, 1);
    portraitFinish(g);
    g.rect(14, 21, 7, 1, 0x8d8aa0);
    g.rect(27, 21, 7, 1, 0x8d8aa0);
    g.rect(14, 24, 7, 3, C.white);
    g.rect(27, 24, 7, 3, C.white);
    g.rect(16, 24, 3, 3, C.violet);
    g.rect(29, 24, 3, 3, C.violet);
    g.rect(14, 23, 7, 1, C.ink2);
    g.rect(27, 23, 7, 1, C.ink2);
    g.rect(18, 30, 1, 3, 0xc9a890);
    g.rect(29, 30, 1, 3, 0xc9a890);
    g.rect(21, 34, 6, 1, 0x7a5a60);
    return g;
  },
  old() {
    const g = new Grid(48, 48);
    const white = 0xe6e2d6;
    const skin = 0xddb48e;
    headShape(g, skin);
    g.poly([[5, 42], [43, 42], [47, 48], [1, 48]], C.ochre2);
    g.ell(24, 12, 14, 8, 0x3a3350);
    g.rect(10, 12, 28, 3, 0x524a6b);
    g.rect(10, 12, 28, 1, 0x6a6288);
    portraitFinish(g);
    g.rect(13, 21, 8, 2, white);
    g.rect(27, 21, 8, 2, white);
    g.rect(15, 25, 5, 2, C.ink);
    g.rect(28, 25, 5, 2, C.ink);
    g.set(16, 25, C.white);
    g.set(29, 25, C.white);
    g.rect(14, 28, 4, 1, drk(skin, 0.3));
    g.rect(30, 28, 4, 1, drk(skin, 0.3));
    g.poly([[13, 31], [35, 31], [30, 47], [24, 48], [18, 47]], white);
    g.line(20, 34, 22, 45, C.paper3);
    g.line(28, 34, 26, 45, C.paper3);
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
  return g.volume({ cap: 8, hi: 0.2, lo: 0.32 }).outlineTint(0.85);
}

// Small heads for the station's hired couriers: hair or hat, plus a skin tone.
function courierHead(o) {
  const g = new Grid(20, 20);
  g.ell(10, 11, 7, 7, o.skin || C.skin);
  g.ell(11, 7, 8, 5, o.hair);
  g.rect(14, 8, 3, 5, o.hair);
  if (o.hat === 'straw') {
    g.poly([[1, 7], [19, 7], [14, 2], [6, 2]], C.ochre3);
    g.rect(1, 7, 18, 1, C.ochre);
  } else if (o.hat === 'cap') {
    g.poly([[4, 7], [17, 7], [15, 2], [6, 2]], o.hatc);
    g.rect(3, 6, 15, 2, drk(o.hatc, 0.2));
  } else if (o.hat === 'bun') {
    g.ell(12, 2, 3, 2, o.hair);
    g.rect(7, 5, 8, 1, o.hatc);
  } else if (o.hat === 'clay') {
    g.ell(10, 4, 6, 3, C.ochre2);
    g.ell(11, 1, 2, 1, C.ochre2);
  }
  g.volume({ cap: 3, hi: 0.18, lo: 0.3 });
  g.rect(6, 11, 2, 2, C.ink);
  g.rect(11, 11, 2, 2, C.ink);
  g.set(6, 11, C.white);
  g.set(11, 11, C.white);
  g.rect(8, 15, 2, 1, C.red2);
  return g.outlineTint(0.85);
}

// Companions that follow the party on the road. Each has a two-frame hop.
const PETS = {
  crane(f) {
    const g = new Grid(26, 24);
    const y = f ? 1 : 0;
    g.ell(13, 12 + y, 6, 4, C.paper);
    g.poly([[16, 10 + y], [23, 9 + y], [21, 13 + y], [16, 14 + y]], C.ink3);
    g.curve(9, 10 + y, 6, 6 + y, 6, 3 + y, C.paper, 3, 2);
    g.ell(6, 3 + y, 2, 2, C.paper);
    g.set(5, 1 + y, C.red);
    g.set(6, 1 + y, C.red);
    g.line(4, 3 + y, 0, 4 + y, C.gold3);
    g.set(5, 3 + y, C.ink);
    g.line(12, 15 + y, 12, 22, C.ochre2);
    g.line(15, 15 + y, 15 + (f ? 2 : 0), 22, C.ochre2);
    return g.volume({ cap: 3, keep: new Set([C.ink, C.red]) }).outlineTint(0.8);
  },
  fox(f) {
    const g = new Grid(26, 20);
    const y = f ? 1 : 0;
    g.curve(18, 11 + y, 24, 8 + y, 22, 2 + y, C.red3, 5, 2);
    g.set(22, 2 + y, C.paper);
    g.ell(13, 12 + y, 7, 4, C.red3);
    g.ell(6, 9 + y, 5, 4, C.red3);
    g.poly([[2, 7 + y], [4, 2 + y], [6, 6 + y]], C.red3);
    g.poly([[6, 6 + y], [9, 2 + y], [10, 7 + y]], C.red3);
    g.poly([[1, 10 + y], [6, 10 + y], [5, 13 + y]], C.paper);
    g.set(1, 10 + y, C.ink);
    g.rect(4, 8 + y, 2, 2, C.ink);
    g.rect(8, 15, 2, 4, C.red2);
    g.rect(16, 15, 2, 4, C.red2);
    if (f) { g.rect(10, 15, 2, 3, C.red2); g.rect(18, 15, 2, 3, C.red2); }
    return g.volume({ cap: 3 }).outlineTint(0.8);
  },
  lamp(f) {
    const g = new Grid(20, 22);
    const y = f ? 1 : 0;
    g.ell(10, 13 + y, 6, 6, C.red3);
    g.ell(10, 13 + y, 4, 4, C.gold);
    g.ell(10, 13 + y, 2, 2, C.gold2);
    g.rect(7, 6 + y, 6, 2, C.gold3);
    g.line(10, 2 + y, 10, 6 + y, C.gold3);
    g.rect(7, 19 + y, 6, 1, C.gold3);
    g.set(8, 12 + y, C.ink);
    g.set(12, 12 + y, C.ink);
    return g.outlineTint(0.8, C.red2);
  },
  tortoise(f) {
    const g = new Grid(26, 16);
    g.ell(13, 9, 8, 5, C.jade2);
    g.ell(13, 8, 6, 3, C.jade);
    g.rect(11, 6, 1, 5, C.jade2);
    g.rect(15, 6, 1, 5, C.jade2);
    g.ell(4 - (f ? 1 : 0), 9, 3, 2, C.bronze3);
    g.set(3 - (f ? 1 : 0), 8, C.ink);
    g.rect(7, 13, 3, 2, C.bronze3);
    g.rect(16, 13, 3, 2, C.bronze3);
    return g.volume({ cap: 3 }).outlineTint(0.8);
  },
};

module.exports = { heroGrid, PORTRAITS, peiBoss, courierHead, PETS, FW, FH, POSES, POSE_NAMES: Object.keys(POSES).concat('ko'), mix };
