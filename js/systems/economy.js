// Everything that changes the save file: rewards, purchases, training, refining, equipping.
// Pure functions over a plain object, so the balance simulation can use them without a phone.
const D = require('../data/game.js');
const { NODE_INDEX, CHAPTERS } = require('../data/chapters.js');

function defaultSave() {
  const hero = (joined) => ({ lv: 1, xp: 0, joined, train: { hp: 0, atk: 0, def: 0, spd: 0 }, relics: [null, null] });
  return {
    v: 1, seq: 0,
    stardust: 0,
    items: { pill: 3, ether: 1, incense: 0, seal: 3 },
    spirits: {},
    relics: [], relicSeq: 0,
    heroes: { cen: hero(true), ruo: hero(false), zhuo: hero(false) },
    progress: { chapter: 0, cleared: {}, stars: 0, ending: null, lit: {} },
    codex: { recipes: {}, monsters: {} },
    steps: { applied: [], total: 0, welcomed: false, lastView: null },
    flags: { intro: false, seen: {}, tips: {}, stipendDay: 0 },
    settings: { bgm: true, sfx: true, vibrate: true, auto: false, speed: 1 },
  };
}

// Fills in anything added by a newer version without disturbing existing progress.
function upgrade(save) {
  const base = defaultSave();
  const merge = (a, b) => {
    Object.keys(b).forEach((k) => {
      if (a[k] === undefined) a[k] = b[k];
      else if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]);
    });
  };
  merge(save, base);
  return save;
}

function addDust(s, n) {
  s.stardust = Math.max(0, s.stardust + n);
}

function addItems(s, items) {
  Object.keys(items || {}).forEach((k) => { s.items[k] = (s.items[k] || 0) + items[k]; });
}

function canAfford(s, n) {
  return s.stardust >= n;
}

function spend(s, n) {
  if (s.stardust < n) return false;
  s.stardust -= n;
  return true;
}

// Applies server grants exactly once, using ids recorded in the save.
function applyGrants(s, grants) {
  const fresh = [];
  (grants || []).forEach((g) => {
    if (s.steps.applied.indexOf(g.id) >= 0) return;
    addDust(s, g.dust || 0);
    addItems(s, g.items);
    s.steps.applied.push(g.id);
    (g.notes || []).forEach((n) => { if (n.steps && (n.kind === 'today' || n.kind === 'backfill')) s.steps.total += n.steps; });
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

function enemyXp(lv, m) {
  const mult = m.boss ? 8 : m.elite ? 3 : 1;
  return Math.round((7 + 3.2 * lv) * mult);
}

function enemyDust(lv, m) {
  const mult = m.boss ? 10 : m.elite ? 4 : 1;
  return Math.round((1.5 + 0.3 * lv) * mult);
}

// Battle spoils. Repeat clears give less currency so walking stays the main income, while XP is
// unaffected so that farming can always rescue a stuck player.
function battleRewards(s, enemies, nodeId) {
  const first = nodeId && !s.progress.cleared[nodeId];
  let xp = 0, dust = 0;
  enemies.forEach((e) => {
    xp += enemyXp(e.lv, e.def_);
    dust += enemyDust(e.lv, e.def_);
    s.codex.monsters[e.id] = true;
  });
  if (!first) dust = Math.round(dust * 0.6);
  addDust(s, dust);
  const drops = {};
  enemies.forEach((e) => {
    if (e.def_.boss) return;
    const r = Math.random();
    if (r < 0.1) drops.pill = (drops.pill || 0) + 1;
    else if (r < 0.15) drops.ether = (drops.ether || 0) + 1;
    else if (r < 0.22) drops.seal = (drops.seal || 0) + 1;
  });
  addItems(s, drops);
  const ups = [];
  Object.keys(s.heroes).forEach((id) => {
    if (!s.heroes[id].joined) return;
    const n = addXp(s, id, xp);
    if (n) ups.push({ id, n, lv: s.heroes[id].lv });
  });
  return { xp, dust, drops, ups };
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

function claimChest(s, nodeId) {
  const { node } = NODE_INDEX[nodeId];
  if (s.progress.cleared[nodeId]) return null;
  s.progress.cleared[nodeId] = true;
  addDust(s, node.reward.dust || 0);
  addItems(s, node.reward.items);
  return node.reward;
}

// Paying for a star opens its gate for good, so losing the boss fight never costs currency twice.
function lightGate(s, nodeId) {
  const { node } = NODE_INDEX[nodeId];
  if (s.progress.lit[nodeId] || !node.cost) return true;
  if (!spend(s, node.cost)) return false;
  s.progress.lit[nodeId] = true;
  return true;
}

function gateOpen(s, nodeId) {
  const { node } = NODE_INDEX[nodeId];
  return !node.cost || !!s.progress.lit[nodeId];
}

// A small daily wage from the station, so players who keep WeRun off can still finish the story.
const STIPEND = 100;
function claimStipend(s, day) {
  if (s.flags.stipendDay === day) return 0;
  s.flags.stipendDay = day;
  addDust(s, STIPEND);
  return STIPEND;
}

function buyItem(s, id, n) {
  const count = n || 1;
  const cost = D.ITEMS[id].price * count;
  if (!spend(s, cost)) return false;
  s.items[id] = (s.items[id] || 0) + count;
  return true;
}

function train(s, heroId, track) {
  const t = s.heroes[heroId].train;
  if (t[track] >= D.TRAIN_MAX) return false;
  if (!spend(s, D.trainCost(t[track]))) return false;
  t[track]++;
  return true;
}

function previewRefine(aId, bId) {
  const a = D.MONSTERS[aId], b = D.MONSTERS[bId];
  const type = D.relicKey(a.el, b.el);
  const rank = D.rankFor(a.tier + b.tier);
  return { type, rank, cost: D.RANKS[rank].cost, def: D.RELICS[type], family: D.REFINE_FAMILY(a.el, b.el) };
}

function refine(s, aId, bId) {
  const need = {};
  need[aId] = (need[aId] || 0) + 1;
  need[bId] = (need[bId] || 0) + 1;
  if (Object.keys(need).some((k) => (s.spirits[k] || 0) < need[k])) return null;
  const p = previewRefine(aId, bId);
  if (!spend(s, p.cost)) return null;
  Object.keys(need).forEach((k) => {
    s.spirits[k] -= need[k];
    if (!s.spirits[k]) delete s.spirits[k];
  });
  const item = { uid: 'r' + ++s.relicSeq, type: p.type, rank: p.rank };
  s.relics.push(item);
  const best = s.codex.recipes[p.type];
  if (best === undefined || best < p.rank) s.codex.recipes[p.type] = p.rank;
  return item;
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
  defaultSave, upgrade, addDust, addItems, canAfford, spend, applyGrants, addXp, battleRewards, addSpirits, joinHero,
  nodeUnlocked, chapterCleared, clearNode, starsLit, claimChest, lightGate, gateOpen, claimStipend, STIPEND, buyItem, train, previewRefine, refine, equipRelic, unequipRelic,
  relicOwner, enemyXp, enemyDust,
};
