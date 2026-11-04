// What Stardust is for. Walking earns most of it, and every purchase here is an enhancement: more speed,
// more comfort, more looks. The road, the story and every activity work without any of it.
const W = require('../data/world.js');
const E = require('./economy.js');
const Idle = require('./idle.js');

function buyHaste(s) {
  const b = W.BOOSTS.haste;
  if (s.idle.hasteSecs + b.secs > W.MAX_HASTE_SECS) return false;
  if (!E.spendDust(s, b.cost)) return false;
  s.idle.hasteSecs += b.secs;
  return true;
}

// An hour of the road, right now. It goes straight to the pack without counting against its capacity.
function useJump(s, now, rng) {
  const b = W.BOOSTS.jump;
  if (!E.spendDust(s, b.cost)) return false;
  Idle.advance(s, b.secs, now, rng);
  return true;
}

function buyRoll(s) {
  if (!E.spendDust(s, W.BOOSTS.dice.cost)) return false;
  s.wander.rolls++;
  return true;
}

function blessingCost(id, tier) {
  return Math.round((W.BLESSINGS[id].base * Math.pow(1.4, tier)) / 10) * 10;
}

function buyBlessing(s, id) {
  const tier = s.blessings[id];
  if (tier >= W.BLESSINGS[id].max) return false;
  if (!E.spendDust(s, blessingCost(id, tier))) return false;
  s.blessings[id]++;
  return true;
}

// Hurrying a timer: one Stardust buys two minutes.
function rushCost(msLeft) {
  return Math.max(1, Math.ceil(msLeft / 120000));
}

module.exports = { buyHaste, useJump, buyRoll, blessingCost, buyBlessing, rushCost };
