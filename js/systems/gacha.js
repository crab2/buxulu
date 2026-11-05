// Star letters: the draw. Each letter opens into one piece of equipment. The odds are fixed and published
// in the game, bad luck has a hard limit, and nothing here is needed to finish the story, because every
// piece can also be found on the road or forged, and promoted to the top with coins and iron.
const F = require('../data/gear.js');
const G = require('../data/game.js');
const Gear = require('./gear.js');
const E = require('./economy.js');
const Idle = require('./idle.js');

// ---- One draw ----
function rollRarity(g, rng) {
  g.sinceTop++;
  g.sinceRare++;
  let rar;
  if (g.sinceTop >= F.PITY_TOP) rar = 3;
  else {
    rar = Gear.rollRarity(F.DRAW_RATES, rng);
    if (rar < 2 && g.sinceRare >= F.PITY_RARE) rar = 2;
  }
  if (rar === 3) g.sinceTop = 0;
  if (rar >= 2) g.sinceRare = 0;
  return rar;
}

function rollSet(s, rar, rng) {
  const open = Gear.openSets(s);
  const wish = s.gacha.wish;
  if (rar >= 2 && wish && open.indexOf(wish) >= 0 && rng() < F.WISH_SHARE) return wish;
  return open[Math.floor(rng() * open.length)];
}

// Spends the letters and adds the pieces at once, so closing the game mid-reveal loses nothing.
function draw(s, n, rng) {
  const r = rng || Math.random;
  if (s.gacha.tickets < n) return null;
  s.gacha.tickets -= n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const rar = rollRarity(s.gacha, r);
    const set = rollSet(s, rar, r);
    const slot = F.SLOT_ORDER[Math.floor(r() * F.SLOT_ORDER.length)];
    out.push(Gear.add(s, { set, slot, rar }));
    s.gacha.total++;
  }
  return out;
}

function setWish(s, id) {
  if (id !== null && Gear.openSets(s).indexOf(id) < 0) return false;
  s.gacha.wish = id;
  return true;
}

// ---- Buying letters ----
function ensureDay(s, day) {
  const g = s.gacha;
  if (g.day !== day) {
    g.day = day;
    g.boughtCoin = 0;
    g.boughtDust = 0;
  }
  return g;
}

function ticketCoinCost(s) {
  return Math.max(100, Math.round((G.coinPerMin(Idle.stageLevel(s)) * F.TICKET_COIN_MINS) / 100) * 100);
}

function buyWithCoin(s, day) {
  const g = ensureDay(s, day);
  if (g.boughtCoin >= F.TICKET_COIN_DAILY) return false;
  if (!E.spendCoin(s, ticketCoinCost(s))) return false;
  g.boughtCoin++;
  g.tickets++;
  return true;
}

function buyWithDust(s, day) {
  const g = ensureDay(s, day);
  if (g.boughtDust >= F.TICKET_DUST_DAILY) return false;
  if (!E.spendDust(s, F.TICKET_DUST)) return false;
  g.boughtDust++;
  g.tickets++;
  return true;
}

// ---- The published odds ----
// What the base rates work out to once the guarantees are counted, found by running the same rules as
// rollRarity over every state of the two counters. A formula would be wrong here, because the two
// guarantees interact: a forced top piece also resets the count toward a rare one.
let exact = null;
function effectiveRates() {
  if (exact) return exact;
  const T = F.PITY_TOP, R = F.PITY_RARE;
  let dist = [];
  for (let i = 0; i < T * R; i++) dist.push(0);
  dist[0] = 1;
  const totals = [0, 0, 0, 0];
  const ROUNDS = 600, SETTLE = 200; // The counters forget where they started well within the settling rounds.
  for (let round = 0; round < ROUNDS; round++) {
    const next = dist.map(() => 0);
    const land = (rar, t, r, weight) => {
      const nt = rar === 3 ? 0 : t;
      const nr = rar >= 2 ? 0 : r;
      next[nt * R + nr] += weight;
      if (round >= SETTLE) totals[rar] += weight;
    };
    for (let t0 = 0; t0 < T; t0++) {
      for (let r0 = 0; r0 < R; r0++) {
        const w = dist[t0 * R + r0];
        if (w > 1e-12) {
          const t = t0 + 1, r = r0 + 1;
          if (t >= T) land(3, t, r, w);
          else {
            F.DRAW_RATES.forEach((p, rar) => {
              land(rar < 2 && r >= R ? 2 : rar, t, r, w * p);
            });
          }
        }
      }
    }
    dist = next;
  }
  const sum = totals.reduce((a, b) => a + b, 0);
  exact = totals.map((v) => v / sum);
  return exact;
}

module.exports = { draw, setWish, ensureDay, ticketCoinCost, buyWithCoin, buyWithDust, effectiveRates };
