// Equipment rules. Each hero wears four pieces. Pieces level up and can be promoted to a higher rarity,
// wearing several of one set unlocks its bonuses, and spare pieces break down into iron.
// Pure logic over the save, with no dependency on the rest of the economy, so anything can use it.
const F = require('../data/gear.js');

const { SLOTS, SLOT_ORDER, RARITIES, SETS, SET_ORDER } = F;

// ---- Reading ----
function name(p) {
  return SETS[p.set].name + SLOTS[p.slot].word;
}

// What a piece adds to its slot's stat, as a fraction.
function value(p, lv) {
  const level = lv === undefined ? p.lv : lv;
  return SLOTS[p.slot].base * RARITIES[p.rar].mult * (1 + F.LEVEL_GAIN * level);
}

function pct(v) {
  const n = Math.round(v * 1000) / 10;
  return (n === Math.round(n) ? String(n) : n.toFixed(1)) + '%';
}

function statLine(p, lv) {
  return `${SLOTS[p.slot].label} +${pct(value(p, lv))}`;
}

function find(s, uid) {
  return s.gear.bag.find((p) => p.uid === uid) || null;
}

function heroIds(s) {
  return Object.keys(s.heroes);
}

function owner(s, uid) {
  return heroIds(s).find((id) => {
    const worn = s.heroes[id].gear || {};
    return SLOT_ORDER.some((k) => worn[k] === uid);
  }) || null;
}

function worn(s, heroId) {
  const g = s.heroes[heroId].gear || {};
  const out = [];
  SLOT_ORDER.forEach((k) => {
    const p = g[k] && find(s, g[k]);
    if (p) out.push(p);
  });
  return out;
}

// How many pieces of each set a hero is wearing.
function setCounts(s, heroId) {
  const n = {};
  worn(s, heroId).forEach((p) => { n[p.set] = (n[p.set] || 0) + 1; });
  return n;
}

function addMods(m, extra) {
  Object.keys(extra).forEach((k) => { m[k] = (m[k] || 0) + extra[k]; });
}

// Everything a hero's gear adds, in the same form relics use, so combat code treats them alike.
function mods(s, heroId) {
  const m = {};
  worn(s, heroId).forEach((p) => {
    const k = SLOTS[p.slot].stat;
    m[k] = (m[k] || 0) + value(p);
  });
  const n = setCounts(s, heroId);
  Object.keys(n).forEach((id) => {
    if (n[id] >= 2) m[SETS[id].two.stat] = (m[SETS[id].two.stat] || 0) + SETS[id].two.value;
    if (n[id] >= 4 && SETS[id].four.mods) addMods(m, SETS[id].four.mods);
  });
  return m;
}

// Effects that help the whole march instead of one hero's fights.
function partyBonus(s) {
  const out = { income: 0 };
  heroIds(s).forEach((id) => {
    if (!s.heroes[id].joined) return;
    const n = setCounts(s, id);
    Object.keys(n).forEach((set) => {
      const party = n[set] >= 4 && SETS[set].four.party;
      if (party) out.income += party.income || 0;
    });
  });
  return out;
}

// A set opens once as many stars are lit as there are sets before it.
function openSets(s) {
  return SET_ORDER.filter((id, i) => (s.progress.stars || 0) >= i);
}

// ---- Getting pieces ----
function salvageValue(p) {
  let iron = RARITIES[p.rar].salvage;
  let coin = 0;
  for (let i = 0; i < p.lv; i++) {
    const c = F.levelCost(i);
    iron += c.iron * 0.7;
    coin += c.coin * 0.5;
  }
  return { iron: Math.floor(iron), coin: Math.floor(coin) };
}

function removePiece(s, p) {
  s.gear.bag.splice(s.gear.bag.indexOf(p), 1);
  const v = salvageValue(p);
  s.gear.iron += v.iron;
  s.coin += v.coin;
  return v;
}

// When the bag is full the weakest piece nobody is wearing makes way, and pays out as if broken down.
function makeRoom(s) {
  const spare = s.gear.bag.filter((p) => !owner(s, p.uid)).sort((a, b) => a.rar - b.rar || a.lv - b.lv)[0];
  if (spare) removePiece(s, spare);
}

function add(s, spec) {
  if (s.gear.bag.length >= F.BAG_CAP) makeRoom(s);
  const p = { uid: 'g' + ++s.gear.seq, set: spec.set, slot: spec.slot, rar: spec.rar, lv: 0 };
  s.gear.bag.push(p);
  s.gear.fresh = (s.gear.fresh || 0) + 1;
  const key = spec.set + '_' + spec.slot;
  const best = s.gear.seen[key];
  const isNew = best === undefined;
  if (isNew || best < spec.rar) s.gear.seen[key] = spec.rar;
  return Object.assign({ isNew }, p);
}

function pickFrom(list, rng) {
  return list[Math.floor((rng || Math.random)() * list.length)];
}

function rollRarity(rates, rng) {
  let r = (rng || Math.random)();
  for (let i = rates.length - 1; i > 0; i--) {
    if (r < rates[i]) return i;
    r -= rates[i];
  }
  return 0;
}

// Something the party picked up on the road. Plain pieces from sets the journey has reached.
function rollDrop(s, rng) {
  return { set: pickFrom(openSets(s), rng), slot: pickFrom(SLOT_ORDER, rng), rar: rollRarity(F.ROAD_RATES, rng) };
}

// A boss hands over a piece of the set that its star opens.
function bossDrop(chapter, setIndex, rng) {
  const i = Math.min(setIndex, SET_ORDER.length - 1);
  return { set: SET_ORDER[i], slot: pickFrom(SLOT_ORDER, rng), rar: F.BOSS_RARITY[Math.min(chapter, F.BOSS_RARITY.length - 1)] };
}

// ---- Wearing ----
function equip(s, heroId, uid) {
  const p = find(s, uid);
  if (!p) return false;
  // A piece can only be worn by one hero at a time.
  heroIds(s).forEach((id) => {
    const g = s.heroes[id].gear;
    if (g && g[p.slot] === uid) g[p.slot] = null;
  });
  s.heroes[heroId].gear[p.slot] = uid;
  return true;
}

function unequip(s, heroId, slot) {
  s.heroes[heroId].gear[slot] = null;
}

// ---- Upgrading ----
function levelCap(p) {
  return RARITIES[p.rar].cap;
}

function canLevel(p) {
  return p.lv < levelCap(p);
}

function canPromote(p) {
  return p.rar < RARITIES.length - 1 && p.lv >= levelCap(p);
}

function afford(s, c) {
  return s.coin >= c.coin && s.gear.iron >= c.iron;
}

function pay(s, c) {
  if (!afford(s, c)) return false;
  s.coin -= c.coin;
  s.gear.iron -= c.iron;
  return true;
}

function levelUp(s, uid) {
  const p = find(s, uid);
  if (!p || !canLevel(p) || !pay(s, F.levelCost(p.lv))) return false;
  p.lv++;
  return true;
}

// Promoting keeps every level and raises what those levels are worth.
function raiseRarity(s, p) {
  p.rar++;
  const key = p.set + '_' + p.slot;
  if (s.gear.seen[key] === undefined || s.gear.seen[key] < p.rar) s.gear.seen[key] = p.rar;
}

function promote(s, uid) {
  const p = find(s, uid);
  if (!p || !canPromote(p) || !pay(s, F.PROMOTE[p.rar])) return false;
  raiseRarity(s, p);
  return true;
}

// The next step for a piece, whichever kind it is. Null at the very top.
function nextStep(p) {
  if (canLevel(p)) return { kind: 'level', cost: F.levelCost(p.lv) };
  if (canPromote(p)) return { kind: 'promote', cost: F.PROMOTE[p.rar] };
  return null;
}

// One tap: spends up to `budget` coins on whatever worn piece is cheapest to improve.
function autoUpgrade(s, budget) {
  const limit = budget === undefined ? s.coin : Math.min(budget, s.coin);
  let spent = 0, n = 0;
  for (let guard = 0; guard < 2000; guard++) {
    let best = null;
    heroIds(s).forEach((id) => {
      if (!s.heroes[id].joined) return;
      worn(s, id).forEach((p) => {
        const step = nextStep(p);
        if (!step || !afford(s, step.cost) || spent + step.cost.coin > limit) return;
        if (!best || step.cost.coin < best.step.cost.coin) best = { p, step };
      });
    });
    if (!best) break;
    pay(s, best.step.cost);
    spent += best.step.cost.coin;
    if (best.step.kind === 'level') best.p.lv++;
    else raiseRarity(s, best.p);
    n++;
  }
  return { n, spent };
}

function forge(s, setId, slot) {
  if (openSets(s).indexOf(setId) < 0 || !SLOTS[slot]) return null;
  if (!pay(s, F.FORGE)) return null;
  return add(s, { set: setId, slot, rar: 0 });
}

// ---- Breaking down ----
function salvage(s, uid) {
  const p = find(s, uid);
  if (!p || owner(s, uid)) return null;
  return removePiece(s, p);
}

// Spares are low-rarity copies that can never be missed: nothing worn, nothing rare, and the best
// unworn copy of each piece stays in the bag in case another hero wants it.
function spares(s) {
  const out = [];
  const keep = {};
  s.gear.bag.slice().sort((a, b) => b.rar - a.rar || b.lv - a.lv).forEach((p) => {
    if (owner(s, p.uid)) return;
    const key = p.set + '_' + p.slot;
    if (!keep[key]) keep[key] = p;
    else if (p.rar <= 1) out.push(p);
  });
  return out;
}

function salvageSpares(s) {
  const total = { n: 0, iron: 0, coin: 0 };
  spares(s).forEach((p) => {
    const v = removePiece(s, p);
    total.n++;
    total.iron += v.iron;
    total.coin += v.coin;
  });
  return total;
}

// ---- One-tap equip ----
// How much each hero cares about each stat. A healer's power follows attack, and the puppet holds the line.
const WEIGHT = {
  cen: { atkPct: 3, defPct: 1, hpPct: 1, spdPct: 1.5, skillDmg: 2, crit: 2.5, critDmg: 1 },
  ruo: { atkPct: 2.5, defPct: 1, hpPct: 1.5, spdPct: 2, skillDmg: 1.5, crit: 1, critDmg: 0.5 },
  zhuo: { atkPct: 1.5, defPct: 2.5, hpPct: 2.5, spdPct: 0.5, skillDmg: 1, crit: 1, critDmg: 0.5 },
};

function pieceScore(heroId, p) {
  return WEIGHT[heroId][SLOTS[p.slot].stat] * value(p);
}

function loadoutScore(heroId, pieces) {
  let total = 0;
  const n = {};
  pieces.forEach((p) => {
    total += pieceScore(heroId, p);
    n[p.set] = (n[p.set] || 0) + 1;
  });
  Object.keys(n).forEach((id) => {
    const set = SETS[id];
    if (n[id] >= 2) total += (WEIGHT[heroId][set.two.stat] || 1) * set.two.value;
    if (n[id] >= 4) total += set.fit[heroId];
  });
  return total;
}

// For each hero in turn, tries building around every set and keeps whichever scores best.
function bestLoadout(heroId, free) {
  let best = [], bestScore = -1;
  [null].concat(SET_ORDER).forEach((focus) => {
    const pieces = [];
    SLOT_ORDER.forEach((slot) => {
      const options = free.filter((p) => p.slot === slot);
      const pool = focus ? options.filter((p) => p.set === focus) : [];
      const list = pool.length ? pool : options;
      const top = list.reduce((a, p) => (!a || pieceScore(heroId, p) > pieceScore(heroId, a) ? p : a), null);
      if (top) pieces.push(top);
    });
    const score = loadoutScore(heroId, pieces);
    if (score > bestScore) {
      bestScore = score;
      best = pieces;
    }
  });
  return best;
}

function autoEquip(s) {
  const heroes = ['cen', 'zhuo', 'ruo'].filter((id) => s.heroes[id] && s.heroes[id].joined);
  const before = JSON.stringify(heroes.map((id) => s.heroes[id].gear));
  const free = s.gear.bag.slice();
  heroes.forEach((id) => {
    SLOT_ORDER.forEach((k) => { s.heroes[id].gear[k] = null; });
    bestLoadout(id, free).forEach((p) => {
      s.heroes[id].gear[p.slot] = p.uid;
      free.splice(free.indexOf(p), 1);
    });
  });
  return before !== JSON.stringify(heroes.map((id) => s.heroes[id].gear));
}

module.exports = {
  name, value, pct, statLine, find, owner, worn, setCounts, mods, partyBonus, openSets, add, rollRarity, rollDrop, bossDrop, equip, unequip,
  levelCap, canLevel, canPromote, afford, levelUp, promote, nextStep, autoUpgrade, forge, salvage, salvageValue, spares, salvageSpares, autoEquip,
};
