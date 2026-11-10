// 天灯: sky lanterns that drift over the road now and then while the player is watching. Catching one
// puts a small windfall in the pack. It is a reason to look at the screen, not a way to get ahead: a day's
// lanterns are worth about half an hour on the road, and the pack's capacity does not apply to them.
const G = require('../data/game.js');
const W = require('../data/world.js');
const E = require('./economy.js');
const Idle = require('./idle.js');

const PER_DAY = 16;
const MINS = 2; // Minutes of road income in an ordinary lantern.

function ensure(s, day) {
  if (!s.finds) s.finds = { day: 0, n: 0 };
  if (s.finds.day !== day) {
    s.finds.day = day;
    s.finds.n = 0;
  }
  return s.finds;
}

function left(s, day) {
  return Math.max(0, PER_DAY - ensure(s, day).n);
}

// What a lantern carries. Mostly coins and experience at today's rate, sometimes herbs, iron or Stardust.
function roll(s, now, rng) {
  const r = (rng || Math.random)();
  const rate = Idle.rates(s, now);
  if (r < 0.12) return { kind: 'herb', herbs: { [W.CROP_ORDER[Math.floor((rng || Math.random)() * W.CROP_ORDER.length)]]: 2 } };
  if (r < 0.22 && E.unlocked(s, 'gear')) return { kind: 'iron', iron: 3 };
  if (r < 0.28) return { kind: 'dust', dust: 5 };
  return { kind: 'coin', coin: Math.round(G.coinPerMin(rate.lv) * MINS), xp: Math.round(G.xpPerMin(rate.lv) * MINS) };
}

function claim(s, now, rng) {
  const day = Idle.dayOf(now);
  if (left(s, day) <= 0) return null;
  const got = roll(s, now, rng);
  s.finds.n++;
  Idle.addToPack(s, got);
  if (got.iron) s.idle.pack.iron = (s.idle.pack.iron || 0) + got.iron;
  return got;
}

module.exports = { ensure, left, claim, roll, PER_DAY, MINS };
