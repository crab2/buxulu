// Turns save data into combat units. Pure logic with no dependency on the WeChat runtime.
const D = require('../data/game.js');
const Gear = require('./gear.js');
const Skills = require('./skills.js');

function relicMods(heroSave, save) {
  const mods = {};
  (heroSave.relics || []).forEach((uid) => {
    if (!uid) return;
    const item = save.relics.find((r) => r.uid === uid);
    if (!item) return;
    const def = D.RELICS[item.type];
    mods[def.stat] = (mods[def.stat] || 0) + def.values[item.rank];
    if (def.extra) Object.keys(def.extra).forEach((k) => { mods[k] = (mods[k] || 0) + def.extra[k]; });
  });
  return mods;
}

function heroStats(save, id) {
  const def = D.HEROES[id];
  const hs = save.heroes[id];
  const lv = hs.lv;
  const m = relicMods(hs, save);
  const gearMods = Gear.mods(save, id);
  Object.keys(gearMods).forEach((k) => { m[k] = (m[k] || 0) + gearMods[k]; });
  const t = hs.train;
  const grow = (k) => def.base[k] + def.grow[k] * (lv - 1);
  // Star relics lit so far strengthen the whole party a little.
  const star = 1 + (save.progress.stars || 0) * 0.015;
  return {
    hp: Math.round(grow('hp') * (1 + t.hp * D.TRAIN.hp.pct + (m.hpPct || 0)) * star),
    mp: Math.round(grow('mp')),
    atk: Math.round(grow('atk') * (1 + t.atk * D.TRAIN.atk.pct + (m.atkPct || 0)) * star),
    def: Math.round(grow('def') * (1 + t.def * D.TRAIN.def.pct + (m.defPct || 0)) * star),
    spd: Math.round(grow('spd') * (1 + t.spd * D.TRAIN.spd.pct + (m.spdPct || 0)) * 10) / 10,
    mods: m,
  };
}

function learned(id, lv) {
  return D.HEROES[id].skills.filter((s) => lv >= s[1]).map((s) => s[0]);
}

function heroUnit(save, id, index) {
  const s = heroStats(save, id);
  const def = D.HEROES[id];
  const skills = learned(id, save.heroes[id].lv);
  // Each skill at the level this hero has trained it to. Combat reads these rather than the base table.
  const sk = {};
  skills.forEach((k) => { sk[k] = Skills.at(k, Skills.levelOf(save, id, k)); });
  return {
    id, key: id + index, side: 'hero', name: def.name, el: def.el, lv: save.heroes[id].lv,
    maxHp: s.hp, hp: s.hp, maxMp: s.mp, mp: s.mp, atk: s.atk, def: s.def, spd: s.spd,
    mods: s.mods, skills, sk, statuses: {}, ct: Math.random() * 30, alive: true,
  };
}

// Enemy strength follows a shared curve, so each creature only has to state its personality.
function enemyUnit(id, lv, index) {
  const m = D.MONSTERS[id];
  // Enemies gain a little extra with level, so party level keeps its meaning all the way up the road.
  const hard = 1 + 0.022 * lv;
  // Equipment and skill levels add up along the road, so the road keeps pace with them. tests/simulate.js
  // sets this figure: it holds the published pace for a player who uses both, and the first region barely
  // changes.
  const geared = 1 + 0.013 * lv;
  const hp = Math.round((52 + 25 * lv) * m.hp * hard * geared);
  return {
    id, key: id + index, side: 'enemy', name: m.name, el: m.el, lv, def_: m,
    maxHp: hp, hp, maxMp: 0, mp: 0,
    atk: Math.round((12 + 4.7 * lv) * m.atk * (1 + 0.017 * lv) * geared),
    def: Math.round((4 + 1.7 * lv) * m.def),
    spd: Math.round((10 + 0.35 * lv) * m.spd * 10) / 10,
    mods: {}, skills: m.skills || [], statuses: {}, ct: Math.random() * 30, alive: true,
    boss: !!m.boss, elite: !!m.elite, pattern: m.pattern, patternI: 0, phases: (m.phases || []).slice(),
  };
}

// One number for "how strong is the party", shown on the road and party screens.
function power(save) {
  return joined(save).reduce((sum, id) => {
    const st = heroStats(save, id);
    const trained = learned(id, save.heroes[id].lv).reduce((n, k) => n + Skills.levelOf(save, id, k) - 1, 0);
    return sum + st.hp * 0.3 + st.atk * 4 + st.def * 3 + st.spd * 4 + trained * 6;
  }, 0);
}

function joined(save) {
  return D.HERO_ORDER.filter((id) => save.heroes[id].joined);
}

function partyUnits(save) {
  return joined(save).map((id, i) => heroUnit(save, id, i));
}

module.exports = { heroStats, learned, heroUnit, enemyUnit, partyUnits, joined, relicMods, power };
