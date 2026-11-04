// The herb garden. Crops grow on real timers. A plot's neighbours matter: a neighbour whose element
// generates this crop's element makes it yield more, and one that overcomes it makes it yield less, so
// laying out the garden is a small puzzle with a five-element answer.
const G = require('../data/game.js');
const W = require('../data/world.js');
const E = require('./economy.js');
const Boosts = require('./boosts.js');

const COLS = 3;
const ROWS = 3;
const WATER_EVERY_MS = 4 * 3600000;
const WATER_SAVES_MS = 30 * 60000;

function plotCount(s) {
  return Math.min(COLS * ROWS, 4 + E.chaptersDone(s));
}

function neighbours(i) {
  const c = i % COLS, r = Math.floor(i / COLS);
  const out = [];
  if (c > 0) out.push(i - 1);
  if (c < COLS - 1) out.push(i + 1);
  if (r > 0) out.push(i - COLS);
  if (r < ROWS - 1) out.push(i + COLS);
  return out;
}

function plant(s, i, el, now) {
  if (i < 0 || i >= plotCount(s) || s.garden.plots[i]) return false;
  const crop = W.CROPS[el];
  if (!crop) return false;
  s.garden.plots[i] = { el, doneAt: now + crop.mins * 60000, at: now };
  return true;
}

// Each helpful neighbour adds a quarter of the base yield, and each harmful one takes a quarter away.
function bonusOf(s, i) {
  const p = s.garden.plots[i];
  if (!p) return 0;
  let b = 0;
  neighbours(i).forEach((n) => {
    const q = s.garden.plots[n];
    if (!q) return;
    if (G.GENERATES[q.el] === p.el) b += 0.25;
    else if (G.OVERCOMES[q.el] === p.el) b -= 0.25;
  });
  return b;
}

function yieldOf(s, i) {
  const p = s.garden.plots[i];
  if (!p) return 0;
  return Math.max(1, Math.round(W.CROPS[p.el].yield * (1 + bonusOf(s, i))));
}

function stage(p, now) {
  if (p.doneAt <= now) return 2;
  return (now - p.at) / (p.doneAt - p.at) > 0.5 ? 1 : 0;
}

function ripeCount(s, now) {
  return s.garden.plots.filter((p) => p && p.doneAt <= now).length;
}

// Picks everything that is ripe. Yields are worked out first, so picking order cannot change them.
function harvest(s, now) {
  const gained = {};
  const ripe = [];
  s.garden.plots.forEach((p, i) => {
    if (p && p.doneAt <= now) {
      gained[p.el] = (gained[p.el] || 0) + yieldOf(s, i);
      ripe.push(i);
    }
  });
  ripe.forEach((i) => { s.garden.plots[i] = null; });
  E.addHerbs(s, gained);
  return { n: ripe.length, gained };
}

function canWater(s, now) {
  return now >= s.garden.water;
}

// A free watering every few hours takes half an hour off everything growing.
function water(s, now) {
  if (!canWater(s, now)) return false;
  s.garden.water = now + WATER_EVERY_MS;
  s.garden.plots.forEach((p) => {
    if (p && p.doneAt > now) {
      p.doneAt = Math.max(now, p.doneAt - WATER_SAVES_MS);
      p.at = Math.min(p.at, p.doneAt - 1);
    }
  });
  return true;
}

function growingLeft(s, now) {
  return s.garden.plots.reduce((m, p) => (p && p.doneAt > now ? Math.max(m, p.doneAt - now) : m), 0);
}

// Star dew ripens the whole garden at once. Priced by the slowest crop, since they all finish together.
function rushCost(s, now) {
  const left = growingLeft(s, now);
  return left > 0 ? Boosts.rushCost(left) : 0;
}

function rush(s, now) {
  const cost = rushCost(s, now);
  if (!cost || !E.spendDust(s, cost)) return false;
  s.garden.plots.forEach((p) => { if (p && p.doneAt > now) p.doneAt = now; });
  return true;
}

function canCook(s, id) {
  const r = W.RECIPES[id];
  return Object.keys(r.herbs).every((k) => (s.herbs[k] || 0) >= r.herbs[k]);
}

function cook(s, id) {
  const r = W.RECIPES[id];
  if (!r || !canCook(s, id)) return false;
  Object.keys(r.herbs).forEach((k) => { s.herbs[k] -= r.herbs[k]; });
  if (r.gives) E.addItems(s, r.gives);
  if (r.meal) {
    s.idle.meal = r.meal;
    s.idle.mealSecs = W.MEAL_SECS;
  }
  return true;
}

module.exports = { plotCount, neighbours, plant, bonusOf, yieldOf, stage, ripeCount, harvest, canWater, water, growingLeft, rushCost, rush, canCook, cook, COLS, ROWS };
