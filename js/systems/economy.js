// Everything that changes the save file: rewards, purchases, training, refining, equipping.
// Pure functions over a plain object, so the balance simulation can use them without a phone.
//
// The one rule that shapes all of it: coins and experience, which come from time on the road, pay for
// all progress. Stardust, which comes mostly from walking, only buys enhancements (systems/boosts.js).
// Nothing a player needs in order to finish the story costs Stardust or looks at real steps.
const D = require('../data/game.js');
const W = require('../data/world.js');
const F = require('../data/gear.js');
const Gear = require('./gear.js');
const { NODE_INDEX, CHAPTERS } = require('../data/chapters.js');

function defaultSave() {
  const hero = (joined) => ({ lv: 1, xp: 0, joined, train: { hp: 0, atk: 0, def: 0, spd: 0 }, relics: [null, null], outfit: null, gear: { blade: null, coat: null, boots: null, charm: null } });
  return {
    v: 2, seq: 0,
    coin: 0,
    stardust: 0,
    items: { pill: 3, ether: 1, incense: 0, seal: 3 },
    herbs: { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 },
    spirits: {},
    relics: [], relicSeq: 0,
    gear: { bag: [], seq: 0, iron: 0, fresh: 0, seen: {}, starter: false },
    gacha: { tickets: 0, wish: null, sinceTop: 0, sinceRare: 0, total: 0, giftStars: 0, day: 0, boughtCoin: 0, boughtDust: 0 },
    heroes: { cen: hero(true), ruo: hero(false), zhuo: hero(false) },
    progress: { chapter: 0, cleared: {}, stars: 0, ending: null, lap: 0, lapAt: 0 },
    codex: { recipes: {}, monsters: {} },
    steps: { applied: [], total: 0, welcomed: false, lastView: null },
    flags: { intro: false, seen: {}, tips: {}, stipendDay: 0, replayDay: 0, replays: 0 },
    settings: { bgm: true, sfx: true, vibrate: true, auto: false, speed: 1, smooth: false, keepOn: false },
    idle: {
      last: 0, secs: 0, total: 0, li: 0, toNext: 0, target: null, wait: 0, blocked: null,
      hasteSecs: 0, meal: null, mealSecs: 0, dashLi: 0,
      pack: { coin: 0, xp: 0, dust: 0, items: {}, spirits: {}, herbs: {}, gear: [], iron: 0, tickets: 0 },
      carry: { spirit: 0, item: 0, herb: 0, gear: 0, iron: 0, ticket: 0 },
      log: [],
    },
    dispatch: { active: [], board: [], nextJob: 0, seq: 0, done: 0, rank: {} },
    garden: { plots: [], water: 0 },
    furnace: { jobs: [] },
    tower: { best: 0, tries: 0 },
    wander: { pos: 0, laps: 0, rolls: 3, regen: 0, bonus: false, stepCarry: 0 },
    daily: { day: 0, done: {}, claimed: {}, bonus: false, walk: false },
    blessings: { pack: 0, stride: 0, fortune: 0 },
    wardrobe: { owned: {}, pet: null, decor: {} },
    letters: { got: [], unread: 0 },
  };
}

// Fills in anything added by a newer version without disturbing existing progress.
function upgrade(save) {
  const fromV1 = (save.v || 1) < 2;
  const base = defaultSave();
  const merge = (a, b) => {
    Object.keys(b).forEach((k) => {
      if (a[k] === undefined) a[k] = b[k];
      else if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]);
    });
  };
  merge(save, base);
  if (fromV1) {
    // Training tiers became half as strong and twice as many, so old tiers double to keep their value.
    Object.keys(save.heroes).forEach((id) => {
      const t = save.heroes[id].train;
      Object.keys(t).forEach((k) => { t[k] = Math.min(D.TRAIN_MAX, t[k] * 2); });
    });
    // Saves from the turn-based version start the road where they had got to, with their Stardust intact.
    save.v = 2;
  }
  // Saves from before equipment existed collect what they have already earned by coming this far.
  grantMilestones(save);
  return save;
}

// What reaching a point on the road hands over. Safe to run at any time: each gift pays only once.
function grantMilestones(s) {
  if (unlocked(s, 'gear') && !s.gear.starter) {
    s.gear.starter = true;
    ['blade', 'coat'].forEach((slot) => {
      const p = Gear.add(s, { set: 'wolf', slot, rar: 0 });
      if (!s.heroes.cen.gear[slot]) Gear.equip(s, 'cen', p.uid);
    });
  }
  while (s.gacha.giftStars < s.progress.stars) {
    s.gacha.giftStars++;
    s.gacha.tickets += F.STAR_TICKETS(s.gacha.giftStars);
  }
}

function addDust(s, n) {
  s.stardust = Math.max(0, s.stardust + n);
}

function addCoin(s, n) {
  s.coin = Math.max(0, s.coin + n);
}

function addItems(s, items) {
  Object.keys(items || {}).forEach((k) => { s.items[k] = (s.items[k] || 0) + items[k]; });
}

function addHerbs(s, herbs) {
  Object.keys(herbs || {}).forEach((k) => { s.herbs[k] = (s.herbs[k] || 0) + herbs[k]; });
}

function canAfford(s, n) {
  return s.stardust >= n;
}

function spendDust(s, n) {
  if (s.stardust < n) return false;
  s.stardust -= n;
  return true;
}

function spendCoin(s, n) {
  if (s.coin < n) return false;
  s.coin -= n;
  return true;
}

// Real steps also carry the party a little further down the road, and earn extra rolls on the board.
const STEPS_PER_LI = 1000;
const STEPS_PER_ROLL = 2000;

// Applies server grants exactly once, using ids recorded in the save.
function applyGrants(s, grants) {
  const fresh = [];
  (grants || []).forEach((g) => {
    if (s.steps.applied.indexOf(g.id) >= 0) return;
    addDust(s, g.dust || 0);
    addItems(s, g.items);
    s.steps.applied.push(g.id);
    let walked = 0;
    (g.notes || []).forEach((n) => { if (n.steps && (n.kind === 'today' || n.kind === 'backfill')) walked += n.steps; });
    s.steps.total += walked;
    if (walked) {
      s.idle.dashLi += walked / STEPS_PER_LI;
      s.wander.stepCarry += walked;
      const rolls = Math.floor(s.wander.stepCarry / STEPS_PER_ROLL);
      s.wander.stepCarry -= rolls * STEPS_PER_ROLL;
      s.wander.rolls += rolls;
    }
    fresh.push(g);
  });
  if (s.steps.applied.length > 80) s.steps.applied = s.steps.applied.slice(-80);
  return fresh;
}

function addXp(s, id, xp) {
  const h = s.heroes[id];
  let ups = 0;
  if (h.lv >= D.MAX_LEVEL) return 0;
  h.xp += xp;
  while (h.lv < D.MAX_LEVEL && h.xp >= D.xpNeed(h.lv)) {
    h.xp -= D.xpNeed(h.lv);
    h.lv++;
    ups++;
  }
  if (h.lv >= D.MAX_LEVEL) h.xp = 0;
  return ups;
}

// Experience goes to everyone who has joined. Returns who levelled up.
function shareXp(s, xp) {
  const ups = [];
  Object.keys(s.heroes).forEach((id) => {
    if (!s.heroes[id].joined) return;
    const n = addXp(s, id, xp);
    if (n) ups.push({ id, n, lv: s.heroes[id].lv });
  });
  return ups;
}

function foeWeight(m) {
  return m.boss ? 6 : m.elite ? 2.5 : 1;
}

// A hand-played repeat fight is worth about two minutes on the road, up to a daily allowance.
const REPLAY_LIMIT = 30;
const FIRST_CLEAR = 7;
const FIRST_DUST = { fight: 10, elite: 25, boss: 80 };

function nodeRewards(s, enemies, nodeId, day) {
  const first = !!nodeId && !s.progress.cleared[nodeId];
  let xp = 0, coin = 0;
  enemies.forEach((e) => {
    const w = foeWeight(e.def_) * 2;
    xp += D.xpPerMin(e.lv) * w;
    coin += D.coinPerMin(e.lv) * w;
  });
  let dust = 0;
  if (first) {
    xp *= FIRST_CLEAR;
    coin *= FIRST_CLEAR;
    const node = NODE_INDEX[nodeId].node;
    dust = FIRST_DUST[node.type] || 0;
  } else if (day !== undefined) {
    if (s.flags.replayDay !== day) {
      s.flags.replayDay = day;
      s.flags.replays = 0;
    }
    if (s.flags.replays >= REPLAY_LIMIT) {
      xp *= 0.1;
      coin *= 0.1;
    }
    s.flags.replays++;
  }
  return { xp: Math.round(xp), coin: Math.round(coin), dust };
}

// Spoils for a fight played on the battle screen. Items can drop, and experience applies at once.
function battleRewards(s, enemies, nodeId, day) {
  const r = nodeRewards(s, enemies, nodeId, day);
  addCoin(s, r.coin);
  addDust(s, r.dust);
  const drops = {};
  enemies.forEach((e) => {
    s.codex.monsters[e.id] = true;
    if (e.def_.boss) return;
    const roll = Math.random();
    if (roll < 0.1) drops.pill = (drops.pill || 0) + 1;
    else if (roll < 0.15) drops.ether = (drops.ether || 0) + 1;
    else if (roll < 0.22) drops.seal = (drops.seal || 0) + 1;
  });
  addItems(s, drops);
  const ups = shareXp(s, r.xp);
  return { xp: r.xp, coin: r.coin, dust: r.dust, drops, ups, gear: bossGear(s, nodeId) };
}

// The first time a boss falls it hands over a piece of the set its star opens.
function bossGear(s, nodeId) {
  if (!nodeId || s.progress.cleared[nodeId]) return null;
  const { node, ci } = NODE_INDEX[nodeId];
  if (node.type !== 'boss') return null;
  return Gear.add(s, Gear.bossDrop(ci, starsForBoss(nodeId)));
}

function addSpirits(s, ids) {
  ids.forEach((id) => {
    s.spirits[id] = (s.spirits[id] || 0) + 1;
    s.codex.monsters[id] = true;
  });
}

function joinHero(s, id) {
  const h = s.heroes[id];
  if (h.joined) return;
  h.joined = true;
  // New allies arrive at the party's level, so nobody starts out useless.
  const lv = Math.max(...D.HERO_ORDER.filter((k) => k !== id && s.heroes[k].joined).map((k) => s.heroes[k].lv), 1);
  h.lv = Math.max(h.lv, lv);
}

function nodeUnlocked(s, nodeId) {
  const { ci, ni, chapter } = NODE_INDEX[nodeId];
  if (ci > s.progress.chapter) return false;
  for (let i = 0; i < ni; i++) {
    const n = chapter.nodes[i];
    if (n.type !== 'chest' && !s.progress.cleared[n.id]) return false;
  }
  return true;
}

function chapterCleared(s, ci) {
  return CHAPTERS[ci].nodes.every((n) => n.type === 'chest' || s.progress.cleared[n.id]);
}

function chaptersDone(s) {
  let n = 0;
  while (n < CHAPTERS.length && chapterCleared(s, n)) n++;
  return n;
}

function unlocked(s, feature) {
  const u = W.UNLOCKS[feature];
  return !u || !!s.progress.cleared[u.node];
}

// Marks a node as done. The caller decides when, because story beats may come first.
function clearNode(s, nodeId) {
  const { node, ci } = NODE_INDEX[nodeId];
  const was = !!s.progress.cleared[nodeId];
  s.progress.cleared[nodeId] = true;
  let litStar = false;
  if (node.type === 'boss' && !was) {
    s.progress.stars = Math.max(s.progress.stars, Math.min(6, starsForBoss(nodeId)));
    litStar = true;
  }
  if (chapterCleared(s, ci) && s.progress.chapter === ci && ci + 1 < CHAPTERS.length) s.progress.chapter = ci + 1;
  grantMilestones(s);
  return { litStar, first: !was };
}

// The seventh star has no boss. It lights only if the player turns the handle in the final choice.
function starsLit(s) {
  return s.progress.stars + (s.progress.ending === 'turn' ? 1 : 0);
}

function starsForBoss(nodeId) {
  const { ci, ni, chapter } = NODE_INDEX[nodeId];
  if (ci < 5) return ci + 1;
  // The final region holds Kaiyang (sixth). Yaoguang (seventh) is lit by the player's final choice.
  return ni === chapter.nodes.length - 1 ? 6 : 5;
}

// A small daily wage from the station. It grows with how high the player has climbed the sky stair.
const STIPEND = 100;
function stipendAmount(s) {
  return STIPEND + Math.min(150, s.tower.best * 2);
}
function claimStipend(s, day) {
  if (s.flags.stipendDay === day) return 0;
  s.flags.stipendDay = day;
  const n = stipendAmount(s);
  addDust(s, n);
  return n;
}

function buyItem(s, id, n) {
  const count = n || 1;
  const cost = D.ITEMS[id].price * count;
  if (!spendCoin(s, cost)) return false;
  s.items[id] = (s.items[id] || 0) + count;
  return true;
}

function train(s, heroId, track) {
  const t = s.heroes[heroId].train;
  if (t[track] >= D.TRAIN_MAX) return false;
  if (!spendCoin(s, D.trainCost(t[track]))) return false;
  t[track]++;
  return true;
}

// One tap spends coins on the cheapest useful tier across the party until none is affordable.
function autoTrain(s) {
  const bought = {};
  let n = 0;
  for (let guard = 0; guard < 400; guard++) {
    let best = null;
    D.HERO_ORDER.forEach((id) => {
      if (!s.heroes[id].joined) return;
      ['atk', 'def', 'hp', 'spd'].forEach((k) => {
        const lv = s.heroes[id].train[k];
        // Speed is a smaller stat, so it follows the others instead of leading them.
        const cost = lv < D.TRAIN_MAX ? D.trainCost(lv) * (k === 'spd' ? 2.2 : 1) : Infinity;
        if (!best || cost < best.cost) best = { id, k, cost, real: D.trainCost(lv) };
      });
    });
    if (!best || best.cost === Infinity || s.coin < best.real) break;
    train(s, best.id, best.k);
    bought[best.id] = (bought[best.id] || 0) + 1;
    n++;
  }
  return { n, bought };
}

function previewRefine(aId, bId) {
  const a = D.MONSTERS[aId], b = D.MONSTERS[bId];
  const type = D.relicKey(a.el, b.el);
  const rank = D.rankFor(a.tier + b.tier);
  return { type, rank, cost: D.RANKS[rank].cost, mins: D.RANKS[rank].mins, def: D.RELICS[type], family: D.REFINE_FAMILY(a.el, b.el) };
}

const FURNACE_SLOTS = 2;

// Refining takes real time, so the furnace keeps working while the player is away.
function startRefine(s, aId, bId, now) {
  if (s.furnace.jobs.length >= FURNACE_SLOTS) return null;
  const need = {};
  need[aId] = (need[aId] || 0) + 1;
  need[bId] = (need[bId] || 0) + 1;
  if (Object.keys(need).some((k) => (s.spirits[k] || 0) < need[k])) return null;
  const p = previewRefine(aId, bId);
  if (!spendCoin(s, p.cost)) return null;
  Object.keys(need).forEach((k) => {
    s.spirits[k] -= need[k];
    if (!s.spirits[k]) delete s.spirits[k];
  });
  const job = { type: p.type, rank: p.rank, doneAt: now + p.mins * 60000 };
  s.furnace.jobs.push(job);
  return job;
}

// Hands over every finished relic.
function collectRefined(s, now) {
  const done = [];
  s.furnace.jobs = s.furnace.jobs.filter((j) => {
    if (j.doneAt > now) return true;
    const item = { uid: 'r' + ++s.relicSeq, type: j.type, rank: j.rank };
    s.relics.push(item);
    const best = s.codex.recipes[j.type];
    if (best === undefined || best < j.rank) s.codex.recipes[j.type] = j.rank;
    done.push(item);
    return false;
  });
  return done;
}

// Spare relics can be melted down. Nothing equipped can be melted by accident.
function meltRelic(s, uid) {
  if (relicOwner(s, uid)) return 0;
  const i = s.relics.findIndex((r) => r.uid === uid);
  if (i < 0) return 0;
  const value = Math.round(D.RANKS[s.relics[i].rank].cost * 0.4);
  s.relics.splice(i, 1);
  addCoin(s, value);
  return value;
}

function equipRelic(s, heroId, slot, uid) {
  // A relic can only be worn by one hero at a time.
  D.HERO_ORDER.forEach((id) => {
    s.heroes[id].relics = s.heroes[id].relics.map((u) => (u === uid ? null : u));
  });
  s.heroes[heroId].relics[slot] = uid;
}

function unequipRelic(s, heroId, slot) {
  s.heroes[heroId].relics[slot] = null;
}

function relicOwner(s, uid) {
  return D.HERO_ORDER.find((id) => s.heroes[id].relics.indexOf(uid) >= 0) || null;
}

module.exports = {
  defaultSave, upgrade, grantMilestones, addDust, addCoin, addItems, addHerbs, canAfford, spendDust, spendCoin, applyGrants, addXp, shareXp,
  battleRewards, nodeRewards, addSpirits, joinHero, nodeUnlocked, chapterCleared, chaptersDone, unlocked, clearNode, starsLit,
  claimStipend, stipendAmount, STIPEND, buyItem, train, autoTrain, previewRefine, startRefine, collectRefined, meltRelic, FURNACE_SLOTS,
  equipRelic, unequipRelic, relicOwner, STEPS_PER_LI, STEPS_PER_ROLL, REPLAY_LIMIT,
};
