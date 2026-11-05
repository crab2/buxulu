// The march. While the game is closed (or open), the party walks the road, fights what it meets and
// fills the pack. Everything is computed from elapsed time when the player returns, so no background
// process is needed. Pure logic: `now` is always passed in, in milliseconds.
//
// The party only stops by itself for things that need the player: a story beat, a road event, a boss,
// or a fight it just lost. Income keeps flowing while it waits, so stopping never wastes the time.
const G = require('../data/game.js');
const W = require('../data/world.js');
const E = require('./economy.js');
const P = require('./party.js');
const L = require('./ledger.js');
const Gear = require('./gear.js');
const { Battle } = require('./battle.js');
const { CHAPTERS, NODE_INDEX, FLAT } = require('../data/chapters.js');

const BASE_CAP_HOURS = 10;
const RETRY_SECS = 600;
const DUST_PER_HOUR = 4;
const SPIRITS_PER_HOUR = 0.2;
const ITEMS_PER_HOUR = 0.5;
const HERBS_PER_HOUR = 1;
const GEAR_PER_HOUR = 0.15;
const IRON_PER_HOUR = 2;
const TICKETS_PER_HOUR = 0.05;
const FOOT_PER_SEC = 8 / 60; // Every minute on the road builds as much footpower as eight real steps.
const LAP_LEVEL = 40;
const MARCH_LI_PER_MIN = 1;
const LOG_MAX = 6;

const dayOf = (now) => L.dayKey(Math.floor(now / 1000));

// ---- Stage and distance ----
function nextIndex(s) {
  for (let i = 0; i < FLAT.length; i++) {
    const n = FLAT[i].node;
    if (n.type !== 'chest' && !s.progress.cleared[n.id]) return i;
  }
  return -1;
}

function campaignDone(s) {
  return nextIndex(s) < 0;
}

// After the story ends, the road loops with stronger enemies for as long as the player cares to walk.
function lapping(s) {
  return campaignDone(s) && !!s.progress.ending;
}

function stageLevel(s) {
  if (lapping(s)) {
    const n = lapNode(s);
    return n.lv + s.progress.lap * LAP_LEVEL;
  }
  let lv = 1;
  for (let i = 0; i < FLAT.length; i++) {
    const n = FLAT[i].node;
    if (n.lv && s.progress.cleared[n.id]) lv = Math.max(lv, n.lv);
  }
  return lv;
}

function fightNodes() {
  return FLAT.filter((f) => f.node.foes);
}

function lapNode(s) {
  const list = fightNodes();
  return list[s.progress.lapAt % list.length].node;
}

// Distance to walk to reach a node, in li. Longer the further out the road goes.
function liOf(i) {
  const f = FLAT[i];
  const base = [0.4, 6, 14, 24, 38, 56][f.ci];
  return f.node.type === 'boss' ? base * 1.5 : base;
}

function holds(node) {
  return node.type === 'event' || node.type === 'boss' || !!node.before || !!node.after || node.id === 'c1b';
}

function currentChapterIndex(s) {
  return lapping(s) ? FLAT.find((f) => f.node === lapNode(s)).ci : s.progress.chapter;
}

function capSecs(s) {
  return (BASE_CAP_HOURS + E.chaptersDone(s) + s.blessings.pack) * 3600;
}

function footpower(s) {
  return Math.floor(s.steps.total + s.idle.total * FOOT_PER_SEC);
}

// ---- Rates ----
function strideBonus(s, now) {
  const v = s.steps.lastView;
  if (!v || !v.today || v.today.day !== dayOf(now)) return 0;
  let b = 0;
  W.STRIDE.forEach((t) => { if (v.today.steps >= t.steps) b = t.bonus; });
  return b;
}

function multipliers(s, now) {
  const stride = strideBonus(s, now);
  const fortune = s.blessings.fortune * 0.02;
  const meal = s.idle.mealSecs > 0 && s.idle.meal ? W.MEALS[s.idle.meal] : null;
  const gear = Gear.partyBonus(s).income;
  return {
    stride,
    meal,
    gear,
    coin: 1 + stride + fortune + gear + ((meal && meal.coin) || 0),
    xp: 1 + stride + fortune + gear + ((meal && meal.xp) || 0),
    march: 1 + stride + s.blessings.stride * 0.03 + ((meal && meal.march) || 0),
    spirit: 1 + ((meal && meal.spirit) || 0),
    haste: s.idle.hasteSecs > 0 ? 2 : 1,
  };
}

function rates(s, now) {
  const lv = stageLevel(s);
  const m = multipliers(s, now);
  return {
    lv,
    coin: G.coinPerMin(lv) * m.coin,
    xp: G.xpPerMin(lv) * m.xp,
    march: MARCH_LI_PER_MIN * m.march,
    haste: m.haste,
    m,
  };
}

// ---- Auto battle ----
function simulate(s, foes, lv, rng) {
  const enemies = foes.map((id, i) => P.enemyUnit(id, lv, i));
  const b = new Battle({ heroes: P.partyUnits(s), enemies, stars: s.progress.stars, items: {}, rng: rng || Math.random, canFlee: false });
  let guard = 0;
  while (!b.outcome && guard++ < 500) {
    const t = b.next();
    if (t.skip) continue;
    if (t.actor.side === 'enemy') b.performEnemy(t.actor, b.enemyAction(t.actor));
    else b.perform(t.actor, b.autoAction(t.actor));
  }
  return { win: b.outcome === 'win', enemies };
}

// A rough forecast shown before a fight. Runs a handful of real simulated battles.
function estimate(s, node, tries) {
  const n = tries || 8;
  let wins = 0;
  for (let i = 0; i < n; i++) if (simulate(s, node.foes, node.lv).win) wins++;
  return wins / n;
}

function forecastLabel(rate) {
  if (rate >= 0.95) return { text: '稳胜', color: '#7fd1a4' };
  if (rate >= 0.7) return { text: '占优', color: '#7fd1a4' };
  if (rate >= 0.4) return { text: '势均', color: '#f7dd7a' };
  if (rate > 0) return { text: '艰险', color: '#ec7a4e' };
  return { text: '难敌', color: '#ec7a4e' };
}

// ---- Pack ----
function addToPack(s, r) {
  const p = s.idle.pack;
  p.coin += r.coin || 0;
  p.xp += r.xp || 0;
  p.dust += r.dust || 0;
  Object.keys(r.items || {}).forEach((k) => { p.items[k] = (p.items[k] || 0) + r.items[k]; });
  Object.keys(r.herbs || {}).forEach((k) => { p.herbs[k] = (p.herbs[k] || 0) + r.herbs[k]; });
  (r.spirits || []).forEach((id) => { p.spirits[id] = (p.spirits[id] || 0) + 1; });
  if (r.gear) p.gear = (p.gear || []).concat(r.gear);
}

function log(s, entry) {
  s.idle.log.push(entry);
  if (s.idle.log.length > LOG_MAX) s.idle.log.shift();
}

function poolFor(ci) {
  const out = [];
  CHAPTERS[ci].nodes.forEach((n) => (n.foes || []).forEach((id) => {
    if (!G.MONSTERS[id].boss && out.indexOf(id) < 0) out.push(id);
  }));
  return out;
}

function pick(list, rng) {
  return list[Math.floor((rng || Math.random)() * list.length)];
}

// Earnings for a span with constant rates.
function accrue(s, secs, r, rng) {
  const I = s.idle;
  const k = (secs / 60) * r.haste;
  I.pack.coin += r.coin * k;
  I.pack.xp += r.xp * k;
  I.pack.dust += (DUST_PER_HOUR * secs) / 3600;
  const hours = (secs / 3600) * r.haste;
  const c = I.carry;
  c.spirit += SPIRITS_PER_HOUR * hours * r.m.spirit;
  c.item += ITEMS_PER_HOUR * hours;
  c.herb += HERBS_PER_HOUR * hours;
  const ci = Math.min(currentChapterIndex(s), CHAPTERS.length - 1);
  while (c.spirit >= 1) {
    c.spirit -= 1;
    addToPack(s, { spirits: [pick(poolFor(ci), rng)] });
  }
  while (c.item >= 1) {
    c.item -= 1;
    addToPack(s, { items: { [pick(['pill', 'seal', 'ether', 'pill', 'seal'], rng)]: 1 } });
  }
  while (c.herb >= 1) {
    c.herb -= 1;
    addToPack(s, { herbs: { [pick(W.CROP_ORDER, rng)]: 1 } });
  }
  if (E.unlocked(s, 'gear')) {
    I.pack.iron = (I.pack.iron || 0) + IRON_PER_HOUR * hours;
    c.gear += GEAR_PER_HOUR * hours;
    while (c.gear >= 1) {
      c.gear -= 1;
      addToPack(s, { gear: [Gear.rollDrop(s, rng)] });
    }
  }
  // Letters come at the same pace for everyone: speed boosts do not make them arrive any sooner.
  if (E.unlocked(s, 'gacha')) I.pack.tickets = (I.pack.tickets || 0) + (TICKETS_PER_HOUR * secs) / 3600;
}

// ---- The march ----
function claimChests(s) {
  const foot = footpower(s);
  FLAT.forEach((f) => {
    const n = f.node;
    if (n.type !== 'chest' || s.progress.cleared[n.id] || foot < n.needFoot) return;
    if (!E.nodeUnlocked(s, n.id)) return;
    s.progress.cleared[n.id] = true;
    addToPack(s, { dust: n.reward.dust, items: n.reward.items });
    log(s, { kind: 'chest', node: n.id });
  });
}

function arriveFight(s, node, rng) {
  const res = simulate(s, node.foes, node.lv, rng);
  if (res.win) {
    addToPack(s, E.nodeRewards(s, res.enemies, node.id));
    res.enemies.forEach((e) => { s.codex.monsters[e.id] = true; });
    E.clearNode(s, node.id);
    s.idle.blocked = null;
    s.idle.wait = 0;
    s.idle.toNext = 0;
    log(s, { kind: 'clear', node: node.id });
    return true;
  }
  if (s.idle.blocked !== node.id) log(s, { kind: 'block', node: node.id });
  s.idle.blocked = node.id;
  s.idle.wait = RETRY_SECS;
  return false;
}

// Post-game: every fight is just a fight, and clearing one moves on to the next.
function lapFight(s, rng) {
  const node = lapNode(s);
  const lv = node.lv + s.progress.lap * LAP_LEVEL;
  const res = simulate(s, node.foes, lv, rng);
  if (res.win) {
    const list = fightNodes();
    s.progress.lapAt++;
    if (s.progress.lapAt >= list.length) {
      s.progress.lapAt = 0;
      s.progress.lap++;
      log(s, { kind: 'lap', lap: s.progress.lap });
    }
    s.idle.toNext = 0;
    s.idle.blocked = null;
    return true;
  }
  s.idle.blocked = node.id;
  s.idle.wait = RETRY_SECS;
  return false;
}

// Works out what the party is doing, for both the march and the screen.
function status(s) {
  const I = s.idle;
  if (lapping(s)) {
    const node = lapNode(s);
    const blocked = I.blocked === node.id;
    return { kind: blocked ? 'blocked' : 'lap', node, lv: node.lv + s.progress.lap * LAP_LEVEL, li: 20, progress: Math.min(1, I.toNext / 20), retry: I.wait, lap: s.progress.lap };
  }
  const i = nextIndex(s);
  if (i < 0) return { kind: 'ending', node: FLAT[FLAT.length - 1].node };
  const node = FLAT[i].node;
  const li = liOf(i);
  if (I.target !== node.id) return { kind: 'march', node, lv: node.lv, li, progress: 0, index: i };
  if (I.toNext >= li && holds(node)) return { kind: 'hold', node, lv: node.lv, li, progress: 1, index: i };
  if (I.blocked === node.id) return { kind: 'blocked', node, lv: node.lv, li, progress: 1, retry: I.wait, index: i };
  return { kind: 'march', node, lv: node.lv, li, progress: Math.min(1, I.toNext / li), index: i };
}

// Moves time forward by `secs`. Splits the span wherever a rate could change or the party arrives.
function advance(s, secs, now, rng) {
  const I = s.idle;
  let left = secs;
  let guard = 0;
  while (left > 0.0001 && guard++ < 2000) {
    claimChests(s);
    const lap = lapping(s);
    const st = status(s);
    if (st.kind !== 'ending' && !lap && I.target !== st.node.id) {
      I.target = st.node.id;
      I.toNext = 0;
    }
    const r = rates(s, now);
    let chunk = left;
    if (I.hasteSecs > 0) chunk = Math.min(chunk, I.hasteSecs);
    if (I.mealSecs > 0) chunk = Math.min(chunk, I.mealSecs);
    const li = st.li;
    const walking = (st.kind === 'march' || st.kind === 'lap');
    const speed = (r.march * r.haste) / 60;
    if (walking) {
      if (I.dashLi > 0) {
        // Real steps carry the party forward at once, on top of its usual pace.
        const d = Math.min(I.dashLi, li - I.toNext);
        I.dashLi -= d;
        I.toNext += d;
        I.li += d;
      }
      chunk = Math.min(chunk, Math.max(0.001, (li - I.toNext) / speed));
    } else if (st.kind === 'blocked') {
      chunk = Math.min(chunk, Math.max(0.001, I.wait));
    }
    accrue(s, chunk, r, rng);
    I.total += chunk;
    I.hasteSecs = Math.max(0, I.hasteSecs - chunk);
    I.mealSecs = Math.max(0, I.mealSecs - chunk);
    left -= chunk;
    if (walking) {
      I.toNext += speed * chunk;
      I.li += speed * chunk;
      if (I.toNext >= li - 0.0001) {
        I.toNext = li;
        if (lap) lapFight(s, rng);
        else if (!holds(st.node)) arriveFight(s, st.node, rng);
      }
    } else if (st.kind === 'blocked') {
      I.wait = Math.max(0, I.wait - chunk);
      if (I.wait <= 0.0001) {
        if (lap) lapFight(s, rng);
        else arriveFight(s, st.node, rng);
      }
    }
  }
}

// Brings the save up to `now`. The pack stops filling at its capacity, and a clock moved backwards earns
// nothing and costs nothing. Returns how many seconds of progress were added.
function sync(s, now, rng) {
  const I = s.idle;
  if (!I.last) {
    I.last = now;
    return 0;
  }
  const raw = (now - I.last) / 1000;
  I.last = now;
  if (raw <= 0) return 0;
  const room = Math.max(0, capSecs(s) - I.secs);
  const dt = Math.min(raw, room);
  if (dt <= 0) return 0;
  I.secs += dt;
  advance(s, dt, now, rng);
  return dt;
}

function packEmpty(s) {
  const p = s.idle.pack;
  return p.coin < 1 && p.xp < 1 && p.dust < 1 && !Object.keys(p.items).length && !Object.keys(p.spirits).length && !Object.keys(p.herbs).length
    && !(p.gear || []).length && (p.iron || 0) < 1 && (p.tickets || 0) < 1;
}

// Empties the pack into the save.
function collect(s) {
  const I = s.idle;
  const p = I.pack;
  const out = {
    coin: Math.floor(p.coin), xp: Math.floor(p.xp), dust: Math.floor(p.dust),
    items: p.items, spirits: p.spirits, herbs: p.herbs, secs: I.secs, ups: [],
    iron: Math.floor(p.iron || 0), tickets: Math.floor(p.tickets || 0), gear: [],
  };
  E.addCoin(s, out.coin);
  E.addDust(s, out.dust);
  E.addItems(s, p.items);
  E.addHerbs(s, p.herbs);
  Object.keys(p.spirits).forEach((id) => {
    s.spirits[id] = (s.spirits[id] || 0) + p.spirits[id];
    s.codex.monsters[id] = true;
  });
  out.ups = E.shareXp(s, out.xp);
  s.gear.iron += out.iron;
  s.gacha.tickets += out.tickets;
  out.gear = (p.gear || []).map((spec) => Gear.add(s, spec));
  I.pack = {
    coin: p.coin - out.coin, xp: p.xp - out.xp, dust: p.dust - out.dust, items: {}, spirits: {}, herbs: {},
    gear: [], iron: (p.iron || 0) - out.iron, tickets: (p.tickets || 0) - out.tickets,
  };
  I.secs = 0;
  nudge(s);
  return out;
}

// The party got stronger, so a blocked road is worth trying again straight away.
function nudge(s) {
  if (s.idle.blocked) s.idle.wait = 0;
}

// Coins per minute etc., shown on the road screen.
function readout(s, now) {
  const r = rates(s, now);
  return { coin: r.coin * r.haste, xp: r.xp * r.haste, march: r.march * r.haste, m: r.m };
}

module.exports = {
  sync, advance, collect, nudge, status, rates, readout, multipliers, strideBonus, footpower, capSecs, stageLevel, liOf, holds,
  estimate, forecastLabel, simulate, packEmpty, lapping, campaignDone, nextIndex, addToPack, dayOf, poolFor, currentChapterIndex,
  claimChests, BASE_CAP_HOURS, RETRY_SECS, FOOT_PER_SEC, DUST_PER_HOUR, NODE_INDEX,
};
