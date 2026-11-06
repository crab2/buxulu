// Skill levels: what a level does, what it costs and who may buy it. Pure logic over the save, so combat
// and the balance simulation use exactly what the screen shows.
const D = require('../data/game.js');

const learnAt = (heroId, id) => {
  const row = D.HEROES[heroId].skills.find((s) => s[0] === id);
  return row ? row[1] : 1;
};

const supportOnly = (sk) => !sk.power && !sk.heal && !sk.revive;

// A skill as it is at a given level. Copies are shared, because the idle march builds units constantly.
const levelled = new Map();
function at(id, lv) {
  const key = id + ':' + lv;
  let sk = levelled.get(key);
  if (sk) return sk;
  const base = D.SKILLS[id];
  const tier = D.skillTier(lv);
  const steps = lv - 1;
  sk = Object.assign({}, base, { lv, tier });
  if (base.power) sk.power = base.power * (1 + D.SKILL_STEP * steps);
  if (base.heal) sk.heal = base.heal * (1 + D.SKILL_STEP * steps);
  if (base.revive) sk.revive = Math.min(1, base.revive + D.SKILL_REVIVE * steps);
  if (base.chance !== undefined) sk.chance = Math.min(1, base.chance + D.SKILL_CHANCE * steps);
  // Skills that only protect have nothing to multiply, so they last longer with each tier instead.
  const extra = supportOnly(base) ? tier : tier >= 3 ? 1 : 0;
  if (extra && base.turns) sk.turns = base.turns + extra;
  if (extra && base.statuses) sk.statuses = base.statuses.map((s) => (s[0] === 'guard' ? s : [s[0], s[1] + extra]));
  levelled.set(key, sk);
  return sk;
}

function levelOf(save, heroId, id) {
  const m = save.heroes[heroId].skillLv;
  return (m && m[id]) || 1;
}

// What buying the next level takes, and whether it can be bought right now.
function status(save, heroId, id) {
  const hs = save.heroes[heroId];
  const lv = levelOf(save, heroId, id);
  const from = learnAt(heroId, id);
  const known = hs.lv >= from;
  const max = lv >= D.SKILL_MAX;
  const cost = max ? 0 : D.skillCost(from, lv);
  const need = max ? 0 : D.skillNeed(from, lv);
  const grown = hs.lv >= need;
  return { lv, tier: D.skillTier(lv), from, known, max, cost, need, grown, ok: known && !max && grown && save.coin >= cost };
}

function upgrade(save, heroId, id) {
  const st = status(save, heroId, id);
  if (!st.ok) return false;
  save.coin -= st.cost;
  const hs = save.heroes[heroId];
  if (!hs.skillLv) hs.skillLv = {};
  hs.skillLv[id] = st.lv + 1;
  return true;
}

// Buys the cheapest available level across the party until the budget or the choices run out.
function autoUpgrade(save, budget) {
  let left = budget === undefined ? save.coin : Math.min(budget, save.coin);
  let n = 0;
  for (let guard = 0; guard < 200; guard++) {
    let best = null;
    D.HERO_ORDER.forEach((heroId) => {
      if (!save.heroes[heroId].joined) return;
      D.HEROES[heroId].skills.forEach(([id]) => {
        const st = status(save, heroId, id);
        if (st.ok && st.cost <= left && (!best || st.cost < best.cost)) best = { heroId, id, cost: st.cost };
      });
    });
    if (!best) break;
    upgrade(save, best.heroId, best.id);
    left -= best.cost;
    n++;
  }
  return { n };
}

// How many levels could be bought this moment, for the marker on the party screen.
function readyCount(save, heroId) {
  return D.HEROES[heroId].skills.filter(([id]) => status(save, heroId, id).ok).length;
}

// The highest tier a hero has reached, which is how grand their blows look on the road.
function bestTier(save, heroId) {
  return D.HEROES[heroId].skills.reduce((t, [id]) => Math.max(t, status(save, heroId, id).known ? D.skillTier(levelOf(save, heroId, id)) : 0), 0);
}

// One line saying what this level gives over the first, in the words a player sees.
function effect(id, lv) {
  const base = D.SKILLS[id];
  const sk = at(id, lv);
  const pct = (v) => `${Math.round(v * 100)}%`;
  if (base.power) return `威力 +${pct(sk.power / base.power - 1)}`;
  if (base.heal) return `治疗 +${pct(sk.heal / base.heal - 1)}`;
  if (base.revive) return `复活气血 ${pct(sk.revive)}`;
  const turns = base.statuses ? sk.statuses.find((s) => s[0] !== 'guard')[1] : sk.turns;
  return `持续 ${turns} 回合`;
}

function effectValue(id, lv) {
  return effect(id, lv).replace(/^[^ ]+ /, '');
}

module.exports = { at, levelOf, learnAt, status, upgrade, autoUpgrade, readyCount, bestTier, effect, effectValue, supportOnly };
