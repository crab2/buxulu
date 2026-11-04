// Pigments of Chinese mural painting: ink, lead white, cinnabar, gamboge, ochre, malachite, azurite.
const C = {
  ink: 0x14121f, ink2: 0x241f33, ink3: 0x3a3350, ink4: 0x5a5070,
  paper: 0xf2e9d0, paper2: 0xd9c9a3, paper3: 0xa8956f,
  red: 0xc8402f, red2: 0x8e2a25, red3: 0xec7a4e,
  gold: 0xe8b33a, gold2: 0xf7dd7a, gold3: 0xa8741f,
  ochre: 0x9a5f34, ochre2: 0x6c3f26, ochre3: 0xc98f55,
  jade: 0x3f9e7e, jade2: 0x1f6a5c, jade3: 0x7fd1a4,
  blue: 0x2f6db5, blue2: 0x1f3f7a, blue3: 0x6fb0e0,
  peach: 0xe88aa0, peach2: 0xf7c4c8, peach3: 0xb85a78,
  violet: 0x6b4a94, violet2: 0x43306b, violet3: 0xa884c9,
  skin: 0xf0c8a0, skin2: 0xc98f6b,
  bronze: 0x7d8a5a, bronze2: 0x4f5c3e, bronze3: 0xa9b57a,
  ice: 0xbfe6f2, ice2: 0x7cb8d8, white: 0xffffff,
};

const cache = new Map();
function css(c) {
  let s = cache.get(c);
  if (!s) {
    s = '#' + (c & 0xffffff).toString(16).padStart(6, '0');
    cache.set(c, s);
  }
  return s;
}

function mix(a, b, t) {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

// Shadows lean toward indigo and highlights toward warm cream, instead of plain black and white.
const lit = (c, t) => mix(c, 0xfff2c8, t);
const drk = (c, t) => mix(c, 0x1d1740, t);

// CSS strings for UI code.
const UI = {
  ink: css(C.ink), panel: '#1d1a2e', panel2: '#2a2542', line: css(C.gold3), lineHi: css(C.gold),
  text: css(C.paper), dim: '#a79fb8', faint: '#6f6786', gold: css(C.gold2), red: css(C.red3),
  jade: css(C.jade3), blue: css(C.blue3), violet: css(C.violet3), peach: css(C.peach2),
  hp: '#d8503c', mp: '#4a8fd8', ult: '#e8b33a', black: '#000000', white: '#ffffff',
};

module.exports = { C, css, mix, lit, drk, UI };
