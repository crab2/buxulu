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
  scroll() {
    const g = g16();
    g.rect(3, 2, 10, 12, C.paper2);
    g.rect(1, 1, 14, 3, C.ochre);
    g.rect(1, 12, 14, 3, C.ochre);
    g.rect(5, 6, 6, 1, C.ochre2);
    g.rect(5, 9, 6, 1, C.ochre2);
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
  gear() {
    const g = g16();
    g.ell(8, 8, 5, 5, C.paper2);
    g.ell(8, 8, 2, 2, C.ink2);
    [[8, 1], [8, 15], [1, 8], [15, 8], [3, 3], [13, 3], [3, 13], [13, 13]].forEach((q) => g.rect(q[0] - 1, q[1] - 1, 2, 2, C.paper2));
    return g;
  },
  chest() {
    const g = g16();
    g.rect(2, 7, 12, 7, C.ochre);
    g.rect(2, 4, 12, 4, C.ochre3);
    g.rect(2, 7, 12, 1, C.ochre2);
    g.rect(7, 6, 2, 4, C.gold2);
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
  sound() {
    const g = g16();
    g.rect(2, 6, 3, 4, C.paper2);
    g.poly([[5, 6], [9, 2], [9, 14], [5, 10]], C.paper2);
    g.line(11, 5, 12, 8, C.paper2);
    g.line(12, 8, 11, 11, C.paper2);
    return g;
  },
};

// Each element gets a colour; each relic family a shape.
const EL_COLOR = { metal: C.ice, wood: C.jade3, water: C.blue3, fire: C.red3, earth: C.gold };

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

module.exports = { ICONS, relicIcon, DIGITS, EL_COLOR };
