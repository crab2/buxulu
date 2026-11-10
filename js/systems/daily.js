// A short list of daily errands that pays Stardust for simply playing, so everyone can try what it buys.
// The step errand is an extra on top, so skipping it never costs the day's bonus.
const W = require('../data/world.js');
const E = require('./economy.js');
const Quests = require('./quests.js');

function ensure(s, day) {
  const d = s.daily;
  if (d.day !== day) {
    d.day = day;
    d.done = {};
    d.claimed = {};
    d.bonus = false;
    d.walk = false;
  }
  return d;
}

// Also counted for good, because the goal chain (systems/quests.js) asks for some of these by number.
function mark(s, id, day) {
  ensure(s, day).done[id] = true;
  Quests.note(s, id);
}

function claim(s, id, day) {
  const d = ensure(s, day);
  if (!d.done[id] || d.claimed[id]) return 0;
  const t = W.DAILY_TASKS.find((x) => x.id === id);
  if (!t) return 0;
  d.claimed[id] = true;
  E.addDust(s, t.dust);
  return t.dust;
}

function claimedCount(s, day) {
  return Object.keys(ensure(s, day).claimed).length;
}

function bonusReady(s, day) {
  const d = ensure(s, day);
  return !d.bonus && claimedCount(s, day) >= W.DAILY_BONUS.need;
}

function claimBonus(s, day) {
  if (!bonusReady(s, day)) return 0;
  s.daily.bonus = true;
  E.addDust(s, W.DAILY_BONUS.dust);
  s.gacha.tickets += W.DAILY_BONUS.tickets;
  return W.DAILY_BONUS.dust;
}

function walkReady(s, day) {
  const d = ensure(s, day);
  const v = s.steps.lastView;
  return !d.walk && !!v && !!v.today && v.today.day === day && v.today.steps >= W.DAILY_WALK.steps;
}

function claimWalk(s, day) {
  if (!walkReady(s, day)) return 0;
  s.daily.walk = true;
  E.addDust(s, W.DAILY_WALK.dust);
  return W.DAILY_WALK.dust;
}

// Is anything waiting to be claimed? Used for the red dots.
function pending(s, day) {
  const d = ensure(s, day);
  return W.DAILY_TASKS.some((t) => d.done[t.id] && !d.claimed[t.id]) || bonusReady(s, day) || walkReady(s, day);
}

module.exports = { ensure, mark, claim, claimedCount, bonusReady, claimBonus, walkReady, claimWalk, pending };
