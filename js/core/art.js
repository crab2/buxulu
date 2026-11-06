// Every image the game draws comes through here, under two simple budgets:
//   sprites share atlas pages (core/atlas.js) and live for the whole session;
//   large scenery is baked on demand into a small pool of canvases, oldest evicted first.
// Scenes must ask for scenery each frame instead of keeping the canvas, because it may be recycled.
const atlas = require('./atlas.js');
const font = require('./font.js');
const { heroGrid, PORTRAITS, courierHead, PETS } = require('../art/heroes.js');
const { monsterGrid } = require('../art/monsters.js');
const { ICONS, relicIcon, gearIcon, cardFront, cardBack, letterBig, cropGrid, DIGITS } = require('../art/icons.js');
const { SETS } = require('../data/gear.js');
const scenery = require('../art/scenery.js');
const station = require('../art/station.js');
const { Grid } = require('./paint.js');
const { C, drk, lit } = require('./palette.js');

// ---- Sprites ----
const sprites = new Map();
function cached(key, make) {
  let v = sprites.get(key);
  if (!v) {
    v = atlas.add(make());
    // A copy at another size, worked out pixel by pixel. Enlarging at draw time is up to the runtime's
    // filtering, which can turn a crisp icon soft on a phone however it looks in DevTools.
    v.resized = (w, h) => cached(`${key}:${w}x${h}`, () => make().resized(w, h));
    sprites.set(key, v);
  }
  return v;
}

// A sprite that can also flash white when hit. The white copy is only baked if it is ever needed.
function flashable(key, make) {
  const s = cached(key, make);
  if (!s.white) {
    s.white = () => cached(key + ':w', () => make().silhouette(C.white));
  }
  return s;
}

const artKey = (art) => (typeof art === 'string' ? art : JSON.stringify(art));

function medallion(col, ring) {
  const g = new Grid(26, 26);
  g.ell(13, 13, 12, 12, C.ink);
  g.ell(13, 13, 11, 11, ring);
  g.ell(13, 13, 9, 9, col);
  g.ell(11, 11, 6, 6, drk(col, -0.15));
  return g;
}

// Digit strip: each cell is 5x7 including its outline, spaced 6 apart so outlines cannot collide.
function digitsGrid(cssColor) {
  const color = parseInt(cssColor.slice(1), 16);
  const n = Object.keys(DIGITS).length;
  const g = new Grid(6 * n, 7);
  Object.keys(DIGITS).forEach((d, i) => {
    DIGITS[d].forEach((row, y) => {
      for (let x = 0; x < 3; x++) if (row[x] === '1') g.set(i * 6 + 1 + x, y + 1, color);
    });
  });
  return g.outline(C.ink);
}

function discGrid(r) {
  const size = (r + 3) * 2 + 1;
  const g = new Grid(size, size);
  const c = r + 3;
  g.ell(c, c, r + 3, r + 3, C.ink);
  const ring = (rad, col) => {
    const n = Math.ceil(rad * 8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.set(Math.round(c + Math.cos(a) * rad), Math.round(c + Math.sin(a) * rad), col);
    }
  };
  ring(r + 2, C.gold3);
  ring(r + 1, C.gold);
  ring(r - 6, C.ochre2);
  ring(r - 16, C.ink3);
  return g;
}

// ---- Scenery ----
const BUDGET = 1800000; // pixels, about 7 MB
const bank = new Map();
const spare = [];
let bankPx = 0;

function evictOldest() {
  const key = bank.keys().next().value;
  const e = bank.get(key);
  bank.delete(key);
  bankPx -= e.cv.width * e.cv.height;
  // A canvas keeps its memory until resized, so a retired one shrinks while it waits to be reused.
  e.cv.width = 1;
  e.cv.height = 1;
  spare.push(e.cv);
}

function baked(key, make) {
  const e = bank.get(key);
  if (e) {
    bank.delete(key);
    bank.set(key, e);
    return e.cv;
  }
  const g = make();
  while (bank.size > 1 && bankPx + g.w * g.h > BUDGET) evictOldest();
  const cv = spare.pop() || wx.createCanvas();
  cv.width = g.w;
  cv.height = g.h;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, g.w, g.h);
  g.paint(ctx, 0, 0);
  bank.set(key, { cv });
  bankPx += g.w * g.h;
  return cv;
}

function purge() {
  while (bank.size) evictOldest();
  font.purge();
}

function stats() {
  const a = atlas.stats(), f = font.stats();
  const px = a.pixels + f.pixels + bankPx;
  return {
    canvases: a.pages + f.pages + bank.size + spare.length,
    pixels: px,
    mb: Math.round((px * 4 / 1048576) * 10) / 10,
    atlasPages: a.pages, glyphPages: f.pages, sceneryCanvases: bank.size,
  };
}

// Hero outfits are palette swaps, so each one only adds the frames it actually shows.
const OUTFITS = {};
function setOutfits(map) {
  Object.assign(OUTFITS, map);
}

module.exports = {
  hero: (id, pose, outfit) => flashable(`h:${id}:${pose}:${outfit || ''}`, () => heroGrid(id, pose, outfit && OUTFITS[outfit])),
  monster: (art, frame) => flashable(`m:${artKey(art)}:${frame ? 1 : 0}`, () => {
    const g = monsterGrid(art);
    return frame ? g.squash(Math.round(g.h * 0.6)) : g;
  }),
  portrait: (id) => cached(`p:${id}`, () => PORTRAITS[id]()),
  portraitSmall(id) {
    return cached(`ps:${id}`, () => {
      const src = PORTRAITS[id]();
      const g = new Grid(16, 16);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) g.d[y * 16 + x] = src.get(x * 3 + 1, y * 3 + 2);
      return g;
    });
  },
  courier: (id, spec) => cached(`c:${id}`, () => courierHead(spec)),
  pet: (id, frame) => cached(`pet:${id}:${frame ? 1 : 0}`, () => PETS[id](frame ? 1 : 0)),
  crop: (el, stage) => cached(`crop:${el}:${stage}`, () => cropGrid(el, stage)),
  icon: (name) => cached(`i:${name}`, () => ICONS[name]()),
  relic: (shape, el, rank) => cached(`r:${shape}:${el}:${rank}`, () => relicIcon(shape, el, rank)),
  // Each set and rarity is only baked once somebody has actually owned one.
  gear: (p) => cached(`g:${p.slot}:${p.set}:${p.rar}`, () => gearIcon(p.slot, SETS[p.set], p.rar)),
  cardFront: (rar) => cached(`cf:${rar}`, () => cardFront(rar)),
  cardBack: () => cached('cb', () => cardBack()),
  letterBig: () => cached('lb', () => letterBig()),
  peach: () => cached('peach', () => station.peachSprite()),
  medallion: (col, ring) => cached(`md:${col}:${ring}`, () => medallion(col, ring)),
  // The damage digits at each size in use, so a big number is a plain copy rather than an enlargement.
  digits: (color, k) => cached(`d:${color}:${k || 1}`, () => {
    const g = digitsGrid(color);
    return k > 1 ? g.resized(g.w * k, g.h * k) : g;
  }),
  // A line of text as one sprite, outlined and enlarged: the skill name on a cut-in.
  bigLabel: (str, color, k) => cached(`bl:${str}:${color}:${k}`, () => {
    const g = font.grid(str, parseInt(color.slice(1), 16), 1).outline(C.ink);
    return g.resized(g.w * k, g.h * k);
  }),
  disc: (r) => cached(`disc:${r}`, () => discGrid(r)),
  DIGIT_ORDER: Object.keys(DIGITS),

  battleBg: (theme, w, h) => baked(`bb:${theme}:${w}:${h}`, () => scenery.battleBg(theme, w, h)),
  mapBg: (theme, w, h, path, key) => baked(`mb:${key}:${w}:${h}`, () => scenery.mapBg(theme, w, h, path)),
  hub: (w, h) => baked(`hub:${w}:${h}`, () => station.hubScene(w, h)),
  stationLayout: station.stationLayout,

  // The parallax road for a region. Returns what to draw, back to front.
  road(theme, w, h, gy) {
    const plan = scenery.layerPlan(h, gy);
    return {
      sky: baked(`sky:${theme}:${w}:${gy}`, () => scenery.skyGrid(theme, w, gy + 4)),
      layers: ['clouds', 'far', 'mid', 'near'].map((name) => ({
        cv: baked(`rl:${theme}:${name}:${plan[name].h}`, () => scenery.layerGrid(theme, name, plan[name].h)),
        y: plan[name].y, speed: plan[name].speed,
      })),
      ground: { cv: baked(`rg:${theme}:${plan.ground.h}`, () => scenery.groundGrid(theme, scenery.GROUND_TILE, plan.ground.h, true)), y: plan.ground.y, speed: 1 },
      fore: { cv: baked(`rf:${theme}`, () => scenery.foreLayer(theme, 20)), y: h - 20, speed: 1.35 },
    };
  },

  setOutfits, purge, stats, lit,
};
