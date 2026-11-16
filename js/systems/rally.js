// 助阵: tapping the creatures on the road joins the fight. Every blow the player lands builds 气势, and a
// full measure of it sets the whole party charging: 一鼓作气, which drops a few minutes of the road's
// income into the pack.
//
// Like the sky lanterns, this is for whoever is watching and not a way to get ahead. There is a fixed
// number of charges a day, worth under half an hour of the road in all, and tapping after that still joins
// the fight but earns nothing.
const G = require('../data/game.js');
const Idle = require('./idle.js');

const NEED = 30; // Blows to fill the measure.
const PER_DAY = 6;
const MINS = 4; // Minutes of road income in one charge.

function ensure(s, day) {
  if (!s.rally) s.rally = { day: 0, n: 0, charge: 0, total: 0, bursts: 0 };
  if (s.rally.day !== day) {
    s.rally.day = day;
    s.rally.n = 0;
  }
  return s.rally;
}

function left(s, day) {
  return Math.max(0, PER_DAY - ensure(s, day).n);
}

// One blow landed by the player. Returns what a charge paid, if this blow set one off.
function strike(s, now) {
  const day = Idle.dayOf(now);
  const r = ensure(s, day);
  r.total++;
  if (left(s, day) <= 0) return { charge: 0, burst: null, left: 0 };
  r.charge++;
  if (r.charge < NEED) return { charge: r.charge, burst: null, left: left(s, day) };
  r.charge = 0;
  r.n++;
  r.bursts = (r.bursts || 0) + 1;
  const lv = Idle.rates(s, now).lv;
  const got = { coin: Math.round(G.coinPerMin(lv) * MINS), xp: Math.round(G.xpPerMin(lv) * MINS) };
  Idle.addToPack(s, got);
  return { charge: 0, burst: got, left: left(s, day) };
}

module.exports = { NEED, PER_DAY, MINS, ensure, left, strike };
