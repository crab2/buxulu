// 16x16 item and interface icons.
const { Grid } = require('../core/paint.js');
const { C, lit, drk } = require('../core/palette.js');

function g16() {
  return new Grid(16, 16);
}

const ICONS = {
  dust() {
    const g = g16();
    g.poly([[8, 1], [14, 7], [8, 15], [2, 7]], C.blue3);
    g.poly([[8, 1], [14, 7], [8, 7]], C.ice);
    g.poly([[2, 7], [8, 7], [8, 15]], C.blue);
    g.set(5, 5, C.white);
    g.set(13, 2, C.gold2);
    g.set(2, 2, C.gold2);
    return g.outline();
  },
  pill() {
    const g = g16();
    g.ell(8, 8, 5, 5, C.red);
    g.ell(7, 7, 3, 3, C.red3);
    g.set(6, 6, C.gold2);
    g.line(11, 2, 13, 4, C.jade3);
    return g.outline();
  },
  ether() {
    const g = g16();
    g.rect(6, 1, 4, 3, C.ochre3);
    g.poly([[6, 4], [10, 4], [13, 9], [12, 14], [4, 14], [3, 9]], C.blue);
    g.rect(5, 6, 3, 5, C.blue3);
    g.set(6, 7, C.white);
    return g.outline();
  },
  incense() {
    const g = g16();
    g.rect(3, 11, 10, 3, C.gold3);
    g.rect(4, 14, 2, 1, C.gold3);
    g.rect(10, 14, 2, 1, C.gold3);
    g.line(8, 11, 8, 6, C.red3);
    g.line(8, 5, 9, 4, C.paper2);
    g.line(9, 4, 7, 2, C.paper2);
    g.line(7, 2, 9, 0, C.paper2);
    return g.outline();
  },
  seal() {
    const g = g16();
    g.rect(4, 1, 8, 14, C.gold2);
    g.rect(4, 1, 8, 2, C.gold);
    g.rect(6, 4, 4, 1, C.red);
    g.rect(7, 5, 2, 4, C.red);
    g.rect(5, 7, 6, 1, C.red);
    g.rect(6, 10, 4, 3, C.red);
    g.rect(7, 11, 2, 1, C.gold2);
    return g.outline();
  },
  star() {
    const g = g16();
    g.poly([[8, 0], [10, 6], [16, 8], [10, 10], [8, 16], [6, 10], [0, 8], [6, 6]], C.gold);
    g.poly([[8, 3], [9, 7], [13, 8], [9, 9], [8, 13], [7, 9], [3, 8], [7, 7]], C.gold2);
    return g.outline(C.ink2);
  },
  sword() {
    const g = g16();
    g.line(13, 2, 5, 10, C.ice, 2);
    g.line(3, 8, 7, 12, C.gold);
    g.line(4, 11, 2, 13, C.ochre, 2);
    return g.outline();
  },
  shield() {
    const g = g16();
    g.poly([[3, 2], [13, 2], [13, 9], [8, 15], [3, 9]], C.bronze);
    g.poly([[8, 2], [13, 2], [13, 9], [8, 15]], C.bronze2);
    g.rect(7, 5, 2, 5, C.gold2);
    return g.outline();
  },
  boot() {
    const g = g16();
    g.poly([[5, 1], [11, 1], [11, 10], [15, 12], [15, 15], [3, 15], [5, 9]], C.ochre);
    g.rect(5, 1, 6, 2, C.ochre3);
    g.rect(3, 14, 12, 1, C.ochre2);
    return g.outline();
  },
  furnace() {
    const g = g16();
    g.rect(3, 13, 2, 2, C.bronze2);
    g.rect(11, 13, 2, 2, C.bronze2);
    g.ell(8, 9, 6, 5, C.bronze);
    g.rect(4, 4, 8, 2, C.bronze3);
    g.ell(8, 10, 3, 2, C.red3);
    g.set(8, 10, C.gold2);
    g.line(8, 1, 8, 3, C.gold);
    return g.outline();
  },
  shop() {
    const g = g16();
    g.rect(3, 7, 10, 8, C.ochre);
    g.rect(6, 10, 4, 5, C.ink2);
    g.poly([[1, 7], [4, 2], [12, 2], [15, 7]], C.red);
    g.rect(1, 6, 14, 2, C.red2);
    return g.outline();
  },
  chest() {
    const g = g16();
    g.rect(2, 7, 12, 7, C.ochre);
    g.rect(2, 4, 12, 4, C.ochre3);
    g.rect(2, 7, 12, 1, C.ochre2);
    g.rect(7, 6, 2, 4, C.gold2);
    return g.outline();
  },
  // Equipment as a whole, for lists and tab labels.
  gear() {
    const g = g16();
    g.poly([[4, 3], [12, 3], [14, 7], [12, 9], [12, 14], [4, 14], [4, 9], [2, 7]], C.bronze);
    g.poly([[8, 3], [12, 3], [14, 7], [12, 9], [12, 14], [8, 14]], C.bronze2);
    g.line(6, 3, 8, 6, C.gold2);
    g.line(10, 3, 8, 6, C.gold2);
    g.rect(4, 10, 8, 2, C.gold);
    return g.outline();
  },
  iron() {
    const g = g16();
    g.poly([[4, 6], [12, 6], [15, 13], [1, 13]], C.ice2);
    g.poly([[4, 6], [12, 6], [13, 9], [3, 9]], C.ice);
    g.rect(2, 12, 12, 1, C.blue2);
    g.set(5, 7, C.white);
    return g.outline();
  },
  // A star letter, the ticket for a draw.
  letter() {
    const g = g16();
    g.rect(1, 4, 14, 10, C.paper2);
    g.poly([[1, 4], [15, 4], [8, 10]], C.paper);
    g.ell(8, 9, 2, 2, C.red);
    g.set(8, 9, C.gold2);
    return g.outline();
  },
  event() {
    const g = g16();
    g.rect(6, 2, 4, 8, C.gold2);
    g.rect(6, 12, 4, 3, C.gold2);
    return g.outline();
  },
  skull() {
    const g = g16();
    g.ell(8, 7, 6, 6, C.paper);
    g.rect(5, 11, 6, 3, C.paper);
    g.rect(5, 6, 2, 3, C.ink);
    g.rect(9, 6, 2, 3, C.ink);
    g.rect(7, 12, 1, 2, C.ink);
    g.rect(9, 12, 1, 2, C.ink);
    return g.outline();
  },
  lock() {
    const g = g16();
    g.rect(3, 7, 10, 7, C.gold3);
    g.rect(5, 2, 6, 6, C.paper3);
    g.rect(7, 4, 2, 4, C.ink2);
    g.rect(7, 9, 2, 3, C.ink);
    return g.outline();
  },
  // ---- Currencies and rewards ----
  coin() {
    const g = g16();
    g.ell(8, 8, 6, 6, C.gold3);
    g.ell(7, 7, 6, 6, C.gold);
    g.ell(6, 6, 3, 3, C.gold2);
    g.rect(6, 6, 3, 3, C.gold3);
    g.rect(7, 7, 1, 1, C.ochre2);
    return g.outline();
  },
  xp() {
    const g = g16();
    g.rect(4, 2, 8, 12, C.paper);
    g.rect(4, 2, 2, 12, C.paper2);
    g.rect(2, 1, 12, 2, C.blue);
    g.rect(2, 13, 12, 2, C.blue);
    g.rect(7, 5, 3, 1, C.ink3);
    g.rect(7, 7, 4, 1, C.ink3);
    g.rect(7, 9, 3, 1, C.ink3);
    return g.outline();
  },
  bag() {
    const g = g16();
    g.poly([[4, 6], [12, 6], [15, 14], [1, 14]], C.ochre);
    g.poly([[4, 6], [8, 6], [7, 14], [1, 14]], C.ochre3);
    g.rect(5, 3, 6, 3, C.ochre2);
    g.rect(6, 2, 4, 1, C.gold3);
    g.rect(7, 8, 2, 3, C.gold2);
    return g.outline();
  },
  spirit() {
    const g = g16();
    g.poly([[8, 0], [12, 5], [13, 11], [8, 15], [3, 11], [4, 5]], C.violet);
    g.poly([[8, 4], [11, 8], [8, 13], [5, 9]], C.violet3);
    g.rect(6, 8, 1, 2, C.white);
    g.rect(9, 8, 1, 2, C.white);
    return g.outline();
  },
  power() {
    const g = g16();
    g.poly([[9, 0], [4, 8], [8, 8], [6, 15], [13, 6], [9, 6]], C.gold2);
    g.poly([[9, 0], [4, 8], [7, 8]], C.gold);
    return g.outline();
  },
  clock() {
    const g = g16();
    g.ell(8, 8, 6, 6, C.paper2);
    g.ell(8, 8, 5, 5, C.ink3);
    g.rect(8, 4, 1, 5, C.paper);
    g.rect(8, 8, 3, 1, C.paper);
    return g.outline();
  },
  // ---- Boosts ----
  wing() {
    const g = g16();
    g.poly([[4, 8], [10, 8], [10, 13], [14, 14], [14, 15], [3, 15]], C.ochre);
    g.rect(3, 14, 11, 1, C.ochre2);
    g.poly([[9, 8], [15, 1], [15, 6], [13, 6], [14, 9], [11, 9]], C.white);
    g.poly([[9, 8], [12, 3], [13, 7]], C.ice);
    return g.outline();
  },
  jump() {
    const g = g16();
    g.poly([[2, 2], [8, 8], [2, 14]], C.jade3);
    g.poly([[8, 2], [14, 8], [8, 14]], C.jade);
    g.line(2, 8, 5, 8, C.white);
    return g.outline();
  },
  dice() {
    const g = g16();
    g.rect(2, 2, 12, 12, C.paper);
    g.rect(2, 2, 12, 2, C.white);
    g.rect(2, 12, 12, 2, C.paper2);
    g.rect(4, 4, 2, 2, C.red);
    g.rect(10, 4, 2, 2, C.ink2);
    g.rect(7, 7, 2, 2, C.red);
    g.rect(4, 10, 2, 2, C.ink2);
    g.rect(10, 10, 2, 2, C.ink2);
    return g.outline();
  },
  drop() {
    const g = g16();
    g.poly([[8, 1], [13, 9], [11, 14], [5, 14], [3, 9]], C.blue3);
    g.poly([[8, 1], [8, 14], [5, 14], [3, 9]], C.ice);
    g.set(6, 10, C.white);
    return g.outline();
  },
  flame() {
    const g = g16();
    g.poly([[8, 0], [12, 6], [13, 11], [10, 15], [5, 15], [3, 11], [5, 6], [6, 7]], C.red3);
    g.poly([[8, 6], [11, 11], [9, 15], [6, 15], [5, 11]], C.gold);
    g.poly([[8, 10], [9, 13], [7, 14]], C.gold2);
    return g.outline();
  },
  // ---- Places ----
  tower() {
    const g = g16();
    g.rect(5, 6, 6, 9, C.ink4);
    g.rect(5, 6, 2, 9, C.paper3);
    g.poly([[3, 6], [13, 6], [8, 1]], C.red);
    g.rect(2, 5, 12, 1, C.red2);
    g.rect(7, 8, 2, 3, C.gold2);
    g.rect(4, 11, 8, 1, C.red2);
    g.rect(4, 14, 8, 1, C.ink3);
    return g.outline();
  },
  letter() {
    const g = g16();
    g.rect(2, 4, 12, 9, C.paper);
    g.poly([[2, 4], [14, 4], [8, 9]], C.paper2);
    g.line(2, 4, 8, 9, C.paper3);
    g.line(14, 4, 8, 9, C.paper3);
    g.rect(7, 8, 2, 2, C.red);
    return g.outline();
  },
  horse() {
    const g = g16();
    g.rect(3, 7, 9, 5, C.ochre);
    g.rect(3, 7, 9, 1, C.ochre3);
    g.poly([[11, 7], [12, 2], [15, 3], [15, 6], [13, 8]], C.ochre);
    g.rect(11, 1, 1, 2, C.ink3);
    g.line(11, 3, 10, 7, C.ink3);
    g.rect(3, 12, 2, 3, C.ochre2);
    g.rect(10, 12, 2, 3, C.ochre2);
    g.line(2, 7, 1, 11, C.ink3);
    return g.outline();
  },
  sprout() {
    const g = g16();
    g.rect(2, 12, 12, 3, C.ochre2);
    g.rect(7, 6, 2, 6, C.jade);
    g.ell(4, 6, 3, 2, C.jade3);
    g.ell(12, 5, 3, 2, C.jade3);
    return g.outline();
  },
  quest() {
    const g = g16();
    g.rect(3, 1, 10, 14, C.paper2);
    g.rect(3, 1, 10, 2, C.ochre);
    g.rect(5, 5, 2, 2, C.jade2);
    g.rect(8, 5, 4, 1, C.ochre2);
    g.rect(5, 9, 2, 2, C.jade2);
    g.rect(8, 9, 4, 1, C.ochre2);
    return g.outline();
  },
  altar() {
    const g = g16();
    g.ell(8, 8, 7, 7, C.gold3);
    g.ell(8, 8, 5, 5, C.ink2);
    g.ell(8, 8, 2, 2, C.gold2);
    [[8, 1], [15, 8], [8, 15], [1, 8]].forEach((q) => g.set(q[0], q[1], C.gold2));
    return g;
  },
  home() {
    const g = g16();
    g.rect(3, 8, 10, 7, 0x8a5a3c);
    g.rect(7, 10, 3, 5, C.gold);
    g.poly([[0, 8], [16, 8], [12, 2], [4, 2]], 0x3a4a68);
    g.rect(0, 7, 16, 1, 0x5a6a88);
    g.rect(3, 10, 2, 2, C.gold2);
    return g.outline();
  },
  pet() {
    const g = g16();
    g.ell(8, 10, 4, 3, C.gold3);
    [[3, 6], [7, 4], [10, 4], [13, 6]].forEach((q) => g.ell(q[0], q[1], 2, 2, C.gold3));
    return g.outline();
  },
  lantern() {
    const g = g16();
    g.rect(7, 0, 2, 3, C.ink3);
    g.ell(8, 8, 5, 5, C.red);
    g.ell(7, 7, 3, 3, C.red3);
    g.set(7, 7, C.gold2);
    g.rect(6, 3, 4, 1, C.gold3);
    g.rect(6, 13, 4, 1, C.gold3);
    g.rect(7, 14, 2, 2, C.gold);
    return g.outline();
  },
  // A paper sky lantern, lit from inside. Taller than the other icons: it is a thing in the scene.
  skylamp() {
    const g = new Grid(14, 20);
    g.poly([[3, 1], [10, 1], [12, 5], [12, 11], [10, 15], [3, 15], [1, 11], [1, 5]], C.red3);
    g.poly([[4, 2], [9, 2], [11, 6], [11, 10], [9, 14], [4, 14], [2, 10], [2, 6]], C.gold);
    g.ell(6, 9, 3, 4, C.gold2);
    g.ell(6, 10, 1, 2, C.white);
    g.rect(3, 1, 8, 1, C.red);
    g.rect(1, 5, 1, 7, C.red);
    g.rect(12, 5, 1, 7, C.red);
    g.rect(4, 15, 6, 1, C.ochre2);
    g.rect(6, 16, 2, 2, C.gold2);
    g.set(6, 18, C.red3);
    return g.outline();
  },
};

// Herbs from the garden, one for each element, and the dishes cooked from them.
const HERB = {
  wood(g) {
    g.line(8, 15, 8, 6, C.jade2, 2);
    g.ell(4, 6, 3, 2, C.jade3);
    g.ell(12, 4, 3, 2, C.jade3);
    g.ell(8, 2, 2, 2, C.jade);
  },
  fire(g) {
    g.line(8, 15, 8, 8, C.ochre2, 2);
    g.ell(5, 7, 3, 3, C.red);
    g.ell(11, 6, 3, 3, C.red3);
    g.ell(8, 3, 2, 2, C.gold);
  },
  earth(g) {
    g.ell(8, 11, 5, 4, C.ochre3);
    g.ell(6, 10, 2, 2, C.gold);
    g.line(8, 7, 8, 3, C.jade2);
    g.ell(10, 3, 2, 1, C.jade);
    g.ell(6, 2, 2, 1, C.jade);
  },
  metal(g) {
    g.line(8, 15, 8, 7, C.gold3, 2);
    g.ell(8, 5, 4, 3, C.gold2);
    g.ell(8, 5, 2, 1, C.white);
    g.set(3, 9, C.gold2);
    g.set(13, 9, C.gold2);
  },
  water(g) {
    g.line(8, 15, 8, 6, C.blue, 2);
    g.ell(5, 7, 3, 2, C.ice);
    g.ell(11, 5, 3, 2, C.ice2);
    g.ell(8, 2, 2, 2, C.blue3);
  },
};
Object.keys(HERB).forEach((k) => {
  ICONS['herb_' + k] = () => {
    const g = g16();
    HERB[k](g);
    return g.outline();
  };
});
function bowl(g, c) {
  g.ell(8, 9, 6, 4, C.paper);
  g.rect(2, 5, 12, 4, -1);
  g.ell(8, 8, 6, 2, c);
  g.rect(5, 13, 6, 2, C.paper2);
  g.line(5, 5, 6, 2, C.paper2);
  g.line(10, 5, 11, 2, C.paper2);
}
ICONS.meal_coin = () => { const g = g16(); bowl(g, C.peach); g.set(8, 8, C.gold2); return g.outline(); };
ICONS.meal_xp = () => { const g = g16(); bowl(g, C.ochre3); g.set(6, 8, C.red); g.set(10, 8, C.red); return g.outline(); };
ICONS.meal_march = () => { const g = g16(); g.ell(8, 9, 6, 5, C.ochre3); g.ell(7, 8, 3, 2, C.gold); [[5, 10], [10, 7], [10, 11]].forEach((q) => g.set(q[0], q[1], C.ochre2)); return g.outline(); };
ICONS.meal_spirit = () => { const g = g16(); g.rect(4, 6, 8, 8, C.jade2); g.rect(4, 6, 8, 2, C.ice2); g.rect(12, 8, 3, 1, C.jade2); g.rect(14, 8, 1, 3, C.jade2); g.line(7, 4, 8, 1, C.paper2); return g.outline(); };

// Crop growth, for the plots in the garden. Stage 0 is a shoot and stage 2 is ready to pick.
function cropGrid(el, stage) {
  const g = new Grid(16, 18);
  if (stage === 0) {
    g.rect(7, 12, 2, 4, C.jade2);
    g.ell(5, 12, 2, 1, C.jade3);
    g.ell(10, 11, 2, 1, C.jade3);
    return g.outline();
  }
  if (stage === 1) {
    g.rect(7, 8, 2, 8, C.jade2);
    g.ell(4, 10, 3, 2, C.jade);
    g.ell(11, 8, 3, 2, C.jade);
    g.ell(8, 5, 2, 2, C.jade3);
    return g.outline();
  }
  const leaf = new Grid(16, 16);
  HERB[el](leaf);
  g.stamp(leaf, 0, 1);
  return g.outline();
}

// Each element gets a colour; each relic family a shape.
const EL_COLOR = { metal: C.ice, wood: C.jade3, water: C.blue3, fire: C.red3, earth: C.gold };

// ---- Equipment ----
// A shape per slot, painted in its set's colours. The outline and a glint show the rarity.
const GEAR_SHAPE = {
  blade(g, s) {
    g.line(13, 2, 6, 9, s.a, 2);
    g.line(13, 2, 7, 8, lit(s.a, 0.55));
    g.line(3, 8, 7, 12, s.c);
    g.line(4, 11, 2, 13, s.b, 2);
    g.set(1, 14, s.c);
  },
  coat(g, s) {
    g.poly([[4, 2], [12, 2], [14, 6], [12, 8], [12, 14], [4, 14], [4, 8], [2, 6]], s.a);
    g.poly([[8, 2], [12, 2], [14, 6], [12, 8], [12, 14], [8, 14]], s.b);
    g.line(6, 2, 8, 5, s.c);
    g.line(10, 2, 8, 5, s.c);
    g.rect(4, 9, 8, 2, s.c);
    g.set(8, 10, lit(s.c, 0.6));
  },
  boots(g, s) {
    g.poly([[5, 2], [10, 2], [10, 9], [14, 11], [14, 14], [4, 14], [5, 9]], s.a);
    g.rect(5, 2, 5, 2, s.c);
    g.rect(4, 13, 10, 1, s.b);
    g.line(4, 6, 1, 4, s.c);
    g.line(4, 8, 1, 7, s.c);
    g.set(11, 12, lit(s.a, 0.5));
  },
  charm(g, s) {
    g.line(8, 1, 8, 3, s.c);
    g.ell(8, 7, 5, 4, s.a);
    g.ell(8, 7, 2, 1, s.b);
    g.set(5, 5, lit(s.a, 0.7));
    g.line(8, 11, 8, 12, s.c);
    g.line(6, 13, 6, 15, s.c);
    g.line(8, 13, 8, 15, s.b);
    g.line(10, 13, 10, 15, s.c);
  },
};
const RARITY_EDGE = [C.ink, C.blue2, C.violet2, C.gold3];

function gearIcon(slot, set, rar) {
  const g = g16();
  GEAR_SHAPE[slot](g, set);
  g.outline(RARITY_EDGE[rar]);
  if (rar >= 2) g.set(13, 1, rar === 3 ? C.gold2 : C.violet3);
  if (rar === 3) {
    g.set(1, 2, C.white);
    g.set(14, 13, C.gold2);
  }
  return g;
}

// ---- Star letter cards ----
const CARD_W = 46, CARD_H = 64;
const CARD_FACE = [
  { edge: C.paper3, fill: 0x2a2542, corner: C.paper2 },
  { edge: C.blue, fill: 0x1c2a4a, corner: C.blue3 },
  { edge: C.violet, fill: 0x2c1f4c, corner: C.violet3 },
  { edge: C.gold3, fill: 0x3a2a1c, corner: C.gold2 },
];

function cardFrame(g, edge, fill, corner) {
  g.rect(1, 0, CARD_W - 2, CARD_H, C.ink);
  g.rect(0, 1, CARD_W, CARD_H - 2, C.ink);
  g.rect(1, 1, CARD_W - 2, CARD_H - 2, edge);
  g.rect(2, 2, CARD_W - 4, CARD_H - 4, fill);
  [[2, 2], [CARD_W - 5, 2], [2, CARD_H - 5], [CARD_W - 5, CARD_H - 5]].forEach(([x, y]) => g.rect(x, y, 3, 3, corner));
}

function cardFront(rar) {
  const g = new Grid(CARD_W, CARD_H);
  const f = CARD_FACE[rar];
  cardFrame(g, f.edge, f.fill, f.corner);
  g.rect(5, 44, CARD_W - 10, 1, f.edge);
  return g;
}

// The sealed side: a letter under a wax star.
function cardBack() {
  const g = new Grid(CARD_W, CARD_H);
  cardFrame(g, C.gold3, C.blue2, C.gold);
  for (let y = 6; y < CARD_H - 6; y += 4) {
    for (let x = 6 + (y % 8 ? 2 : 0); x < CARD_W - 6; x += 4) g.set(x, y, 0x2c5494);
  }
  const cx = 23, cy = 32;
  g.ell(cx, cy, 11, 11, C.ink2);
  g.ell(cx, cy, 10, 10, C.red2);
  g.ell(cx, cy, 8, 8, C.red);
  g.poly([[cx, cy - 7], [cx + 2, cy - 2], [cx + 7, cy], [cx + 2, cy + 2], [cx, cy + 7], [cx - 2, cy + 2], [cx - 7, cy], [cx - 2, cy - 2]], C.gold2);
  return g;
}

// The letter that hangs over the draw screen.
function letterBig() {
  const g = new Grid(44, 32);
  g.rect(2, 3, 40, 27, C.paper2);
  g.rect(2, 3, 40, 2, C.paper);
  g.rect(2, 26, 40, 4, C.paper3);
  g.poly([[2, 4], [42, 4], [22, 19]], C.paper3);
  g.poly([[4, 4], [40, 4], [22, 17]], C.paper);
  g.ell(22, 16, 6, 6, C.red2);
  g.ell(22, 16, 5, 5, C.red);
  g.poly([[22, 11], [23, 15], [27, 16], [23, 17], [22, 21], [21, 17], [17, 16], [21, 15]], C.gold2);
  return g.outline(C.ink);
}

const RELIC_SHAPE = {
  pendant(g, c) {
    g.line(4, 1, 8, 6, C.paper3);
    g.line(12, 1, 8, 6, C.paper3);
    g.ell(8, 10, 4, 5, c);
    g.ell(8, 10, 1, 2, drk(c, 0.5));
  },
  ring(g, c) {
    g.ell(8, 8, 6, 6, c);
    g.ell(8, 8, 3, 3, C.ink2);
    g.set(8, 2, C.white);
  },
  orb(g, c) {
    g.ell(8, 8, 6, 6, c);
    g.ell(6, 6, 2, 2, lit(c, 0.6));
    g.rect(3, 13, 10, 2, C.gold3);
  },
  talisman(g, c) {
    g.rect(4, 1, 8, 14, c);
    g.rect(6, 3, 4, 1, C.ink2);
    g.rect(7, 4, 2, 6, C.ink2);
    g.rect(5, 12, 6, 1, C.ink2);
  },
  seal(g, c) {
    g.rect(3, 8, 10, 7, c);
    g.rect(6, 4, 4, 4, drk(c, 0.2));
    g.ell(8, 3, 3, 2, drk(c, 0.1));
    g.rect(5, 10, 6, 3, drk(c, 0.45));
  },
  lamp(g, c) {
    g.rect(4, 13, 8, 2, C.gold3);
    g.rect(7, 8, 2, 5, C.gold3);
    g.ell(8, 6, 4, 3, C.gold3);
    g.ell(8, 3, 2, 3, c);
  },
  blade(g, c) {
    g.line(13, 2, 5, 10, c, 2);
    g.line(3, 8, 7, 12, C.gold);
    g.line(4, 11, 2, 13, C.ochre, 2);
  },
  knot(g, c) {
    g.ell(5, 5, 3, 3, c);
    g.ell(11, 5, 3, 3, c);
    g.ell(8, 10, 3, 4, c);
    g.ell(5, 5, 1, 1, C.ink2);
    g.ell(11, 5, 1, 1, C.ink2);
  },
};

function relicIcon(shape, el, rank) {
  const g = g16();
  RELIC_SHAPE[shape](g, EL_COLOR[el]);
  g.outline(rank === 2 ? C.gold2 : rank === 1 ? C.blue3 : C.ink);
  return g;
}

// Crisp tiny digits for damage numbers.
const DIGITS = {
  0: ['111', '101', '101', '101', '111'], 1: ['110', '010', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '001', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'], '-': ['000', '000', '111', '000', '000'],
};

module.exports = { ICONS, relicIcon, gearIcon, cardFront, cardBack, letterBig, CARD_W, CARD_H, cropGrid, DIGITS, EL_COLOR };
