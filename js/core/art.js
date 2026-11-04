// Bakes sprites to canvases on first use and keeps them for the session.
const { heroGrid, PORTRAITS } = require('../art/heroes.js');
const { monsterGrid } = require('../art/monsters.js');
const { ICONS, relicIcon, DIGITS } = require('../art/icons.js');
const { battleBg, mapBg, hubScene, peachSprite } = require('../art/scenery.js');
const { Grid } = require('./paint.js');
const { C, drk } = require('./palette.js');

const store = new Map();
function cached(key, make) {
  let v = store.get(key);
  if (!v) {
    v = make();
    store.set(key, v);
  }
  return v;
}

const artKey = (art) => (typeof art === 'string' ? art : JSON.stringify(art));

function withFlash(grid) {
  return { cv: grid.toCanvas(), white: grid.silhouette(C.white).toCanvas(), shadow: grid.silhouette(C.ink).toCanvas(), w: grid.w, h: grid.h };
}

function medallion(col, ring) {
  const g = new Grid(26, 26);
  g.ell(13, 13, 12, 12, C.ink);
  g.ell(13, 13, 11, 11, ring);
  g.ell(13, 13, 9, 9, col);
  g.ell(11, 11, 6, 6, drk(col, -0.15));
  return g;
}

// Digit strip: each cell is 5x7 including its outline, spaced 6 apart so outlines cannot collide.
function digits(cssColor) {
  const color = parseInt(cssColor.slice(1), 16);
  const n = Object.keys(DIGITS).length;
  const g = new Grid(6 * n, 7);
  Object.keys(DIGITS).forEach((d, i) => {
    DIGITS[d].forEach((row, y) => {
      for (let x = 0; x < 3; x++) if (row[x] === '1') g.set(i * 6 + 1 + x, y + 1, color);
    });
  });
  return g.outline(C.ink).toCanvas();
}

module.exports = {
  hero: (id, pose) => cached(`h:${id}:${pose}`, () => withFlash(heroGrid(id, pose))),
  heroFlip: (id, pose) => cached(`hf:${id}:${pose}`, () => withFlash(heroGrid(id, pose).flip())),
  monster: (art) => cached(`m:${artKey(art)}`, () => withFlash(monsterGrid(art))),
  portrait: (id) => cached(`p:${id}`, () => PORTRAITS[id]().toCanvas()),
  portraitSmall(id) {
    return cached(`ps:${id}`, () => {
      const src = PORTRAITS[id]();
      const g = new Grid(16, 16);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) g.d[y * 16 + x] = src.get(x * 3 + 1, y * 3 + 2);
      return g.toCanvas();
    });
  },
  icon: (name) => cached(`i:${name}`, () => ICONS[name]().toCanvas()),
  relic: (shape, el, rank) => cached(`r:${shape}:${el}:${rank}`, () => relicIcon(shape, el, rank).toCanvas()),
  battleBg: (theme, w, h) => cached(`bb:${theme}:${w}:${h}`, () => battleBg(theme, w, h).toCanvas()),
  mapBg(theme, w, h, path, key) {
    return cached(`mb:${key}:${w}:${h}`, () => mapBg(theme, w, h, path).toCanvas());
  },
  hub: (w, h) => cached(`hub:${w}:${h}`, () => hubScene(w, h).toCanvas()),
  peach: () => cached('peach', () => peachSprite().toCanvas()),
  medallion: (col, ring) => cached(`md:${col}:${ring}`, () => medallion(col, ring).toCanvas()),
  digits: (color) => cached(`d:${color}`, () => digits(color)),
  DIGIT_ORDER: Object.keys(DIGITS),
};
