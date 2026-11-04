// Outfits, companions and station decorations. They change how the game looks and nothing else.
const W = require('../data/world.js');
const E = require('./economy.js');

function owned(s, id) {
  const c = W.COSMETICS[id];
  if (!c) return false;
  if (s.wardrobe.owned[id]) return true;
  if (c.steps && s.steps.total >= c.steps) return true;
  if (c.laps && s.wander.laps >= c.laps) return true;
  return false;
}

function buy(s, id) {
  const c = W.COSMETICS[id];
  if (!c || !c.cost || owned(s, id)) return false;
  if (!E.spendDust(s, c.cost)) return false;
  s.wardrobe.owned[id] = true;
  return true;
}

// Tapping something already worn takes it off.
function toggle(s, id) {
  const c = W.COSMETICS[id];
  if (!owned(s, id)) return false;
  if (c.kind === 'outfit') {
    const h = s.heroes[c.hero];
    h.outfit = h.outfit === id ? null : id;
  } else if (c.kind === 'pet') {
    s.wardrobe.pet = s.wardrobe.pet === id ? null : id;
  } else {
    s.wardrobe.decor[id] = !s.wardrobe.decor[id];
  }
  return true;
}

function worn(s, id) {
  const c = W.COSMETICS[id];
  if (c.kind === 'outfit') return s.heroes[c.hero].outfit === id;
  if (c.kind === 'pet') return s.wardrobe.pet === id;
  return !!s.wardrobe.decor[id];
}

module.exports = { owned, buy, toggle, worn };
