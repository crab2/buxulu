// 路引: a chain of small goals, one at a time, that always says what is worth doing next and pays a
// little for doing it. Pure logic over the save.
//
// Each goal reads the save as it is, so a goal the player has already met is finished the moment it comes
// up, and a save from before this existed catches up in one tap. Rewards are sized by the point on the
// road the goal belongs to, not by where the player is now, so catching up late pays what it would have
// paid then. Nothing here costs Stardust or looks at real steps.
const D = require('../data/game.js');
const F = require('../data/gear.js');
const E = require('./economy.js');
const Skills = require('./skills.js');
const P = require('./party.js');

const heroes = (s) => P.joined(s);
const sum = (list, fn) => list.reduce((n, x) => n + fn(x), 0);
const most = (list, fn) => list.reduce((n, x) => Math.max(n, fn(x)), 0);

const count = (s, id) => (s.quest.count[id] || 0);
const trained = (s) => sum(heroes(s), (id) => { const t = s.heroes[id].train; return t.hp + t.atk + t.def + t.spd; });
const topLevel = (s) => most(heroes(s), (id) => s.heroes[id].lv);
const skillUps = (s) => sum(heroes(s), (id) => sum(P.learned(id, s.heroes[id].lv), (k) => Skills.levelOf(s, id, k) - 1));
const topSkill = (s) => most(heroes(s), (id) => most(P.learned(id, s.heroes[id].lv), (k) => Skills.levelOf(s, id, k)));
const wornPieces = (s, id) => F.SLOT_ORDER.map((k) => s.heroes[id].gear[k] && s.gear.bag.find((p) => p.uid === s.heroes[id].gear[k])).filter(Boolean);
const mostWorn = (s) => most(heroes(s), (id) => wornPieces(s, id).length);
const topGearLv = (s) => most(heroes(s), (id) => most(wornPieces(s, id), (p) => p.lv || 0));
const topSet = (s) => most(heroes(s), (id) => {
  const n = {};
  wornPieces(s, id).forEach((p) => { n[p.set] = (n[p.set] || 0) + 1; });
  return most(Object.keys(n), (k) => n[k]);
});
const relicsWorn = (s) => sum(heroes(s), (id) => s.heroes[id].relics.filter(Boolean).length);
const planted = (s) => s.garden.plots.filter(Boolean).length;
const cleared = (id) => (s) => (s.progress.cleared[id] ? 1 : 0);
const stars = (s) => s.progress.stars;

// lv: the point on the road this goal belongs to, which sizes its coins. mins: minutes of road income.
// go: the screen that gets it done. open: the feature that has to be open first.
const QUESTS = [
  { id: 'first', text: '打赢路上第一仗', lv: 1, mins: 4, go: 'road', now: cleared('c1a'), need: 1 },
  { id: 'collect', text: '收一次行囊', lv: 1, mins: 4, go: 'road', now: (s) => count(s, 'collect'), need: 1 },
  { id: 'train3', text: '修炼 3 次', lv: 2, mins: 6, go: 'party', now: trained, need: 3 },
  { id: 'ruo', text: '往前走,遇见同路人', lv: 2, mins: 6, go: 'road', now: cleared('c1b'), need: 1, items: { pill: 2 } },
  { id: 'send', text: '去驿传派出一封信', lv: 3, mins: 6, go: 'dispatch', open: 'dispatch', now: (s) => count(s, 'dispatch'), need: 1 },
  { id: 'lv5', text: '有人升到 5 级', lv: 4, mins: 8, go: 'road', now: topLevel, need: 5 },
  { id: 'skill2', text: '术法升级 2 次', lv: 4, mins: 8, go: 'skills', now: skillUps, need: 2 },
  { id: 'c1d', text: '走过不谢坡的山魈林', lv: 4, mins: 8, go: 'road', now: cleared('c1d'), need: 1, dust: 20 },
  { id: 'refine', text: '在星炉炼一件法宝', lv: 5, mins: 8, go: 'furnace', open: 'furnace', now: (s) => s.relicSeq + s.furnace.jobs.length, need: 1 },
  { id: 'train10', text: '修炼累计 10 层', lv: 5, mins: 10, go: 'party', now: trained, need: 10 },
  { id: 'star1', text: '点亮第一颗星:天枢', lv: 6, mins: 15, go: 'road', now: stars, need: 1, dust: 50, tickets: 1 },
  { id: 'draw10', text: '拆开 10 封星笺', lv: 7, mins: 10, go: 'gacha', open: 'gacha', now: (s) => s.gacha.total, need: 10 },
  { id: 'wear4', text: '给一个人穿齐四件行装', lv: 7, mins: 10, go: 'party', open: 'gear', now: mostWorn, need: 4 },
  { id: 'plant3', text: '在药圃种下 3 块地', lv: 7, mins: 10, go: 'garden', open: 'garden', now: (s) => Math.max(planted(s), Math.min(3, count(s, 'garden'))), need: 3 },
  { id: 'tower3', text: '登上天阶第 3 阶', lv: 8, mins: 10, go: 'tower', open: 'tower', now: (s) => s.tower.best, need: 3, dust: 20 },
  { id: 'gear3', text: '强化行装 3 次', lv: 8, mins: 10, go: 'party', open: 'gear', now: (s) => count(s, 'gear'), need: 3 },
  { id: 'c2b', text: '走进炎陵深处', lv: 8, mins: 12, go: 'road', now: cleared('c2b'), need: 1, dust: 20 },
  { id: 'wander3', text: '云游掷 3 次骰子', lv: 9, mins: 10, go: 'wander', open: 'wander', now: (s) => count(s, 'wander'), need: 3 },
  { id: 'harvest3', text: '收获药圃 3 次', lv: 9, mins: 10, go: 'garden', open: 'garden', now: (s) => count(s, 'garden'), need: 3, items: { ether: 1 } },
  { id: 'lv12', text: '有人升到 12 级', lv: 11, mins: 12, go: 'road', now: topLevel, need: 12 },
  { id: 'send8', text: '累计送到 8 封信', lv: 11, mins: 12, go: 'dispatch', open: 'dispatch', now: (s) => s.dispatch.done, need: 8, dust: 30 },
  { id: 'tower10', text: '登上天阶第 10 阶', lv: 12, mins: 12, go: 'tower', open: 'tower', now: (s) => s.tower.best, need: 10, dust: 30 },
  { id: 'star2', text: '点亮第二颗星:天璇', lv: 13, mins: 15, go: 'road', now: stars, need: 2, dust: 50, tickets: 1 },
  { id: 'train30', text: '修炼累计 30 层', lv: 14, mins: 12, go: 'party', now: trained, need: 30 },
  { id: 'skill4', text: '把一门术法练到小成', lv: 15, mins: 12, go: 'skills', now: topSkill, need: 4 },
  { id: 'relic2', text: '全队佩戴 2 件法宝', lv: 16, mins: 12, go: 'party', open: 'furnace', now: relicsWorn, need: 2 },
  { id: 'gearlv10', text: '把一件行装强化到 10 级', lv: 17, mins: 12, go: 'party', open: 'gear', now: topGearLv, need: 10, dust: 30 },
  { id: 'star3', text: '点亮第三颗星:天玑', lv: 20, mins: 15, go: 'road', now: stars, need: 3, dust: 60, tickets: 1 },
  { id: 'laps2', text: '云游走完 2 圈', lv: 21, mins: 12, go: 'wander', open: 'wander', now: (s) => s.wander.laps, need: 2 },
  { id: 'tower20', text: '登上天阶第 20 阶', lv: 23, mins: 12, go: 'tower', open: 'tower', now: (s) => s.tower.best, need: 20, dust: 40 },
  { id: 'set4', text: '给一个人凑齐同名四件', lv: 25, mins: 15, go: 'party', open: 'gear', now: topSet, need: 4, dust: 40 },
  { id: 'star4', text: '点亮第四颗星:天权', lv: 28, mins: 15, go: 'road', now: stars, need: 4, dust: 60, tickets: 1 },
  { id: 'lv30', text: '有人升到 30 级', lv: 30, mins: 12, go: 'road', now: topLevel, need: 30 },
  { id: 'skill7', text: '把一门术法练到大成', lv: 31, mins: 15, go: 'skills', now: topSkill, need: 7 },
  { id: 'train80', text: '修炼累计 80 层', lv: 33, mins: 15, go: 'party', now: trained, need: 80 },
  { id: 'star5', text: '点亮第五颗星:玉衡', lv: 36, mins: 15, go: 'road', now: stars, need: 5, dust: 80, tickets: 2 },
  { id: 'tower30', text: '登上天阶第 30 阶', lv: 38, mins: 15, go: 'tower', open: 'tower', now: (s) => s.tower.best, need: 30, dust: 50 },
  { id: 'gearlv20', text: '把一件行装强化到 20 级', lv: 40, mins: 15, go: 'party', open: 'gear', now: topGearLv, need: 20 },
  { id: 'star6', text: '点亮第六颗星:开阳', lv: 45, mins: 20, go: 'road', now: stars, need: 6, dust: 100, tickets: 2 },
  { id: 'ending', text: '登上北辰台,做出选择', lv: 45, mins: 20, go: 'road', now: (s) => (s.progress.ending ? 1 : 0), need: 1, dust: 100 },
  { id: 'skill10', text: '把一门术法练到圆满', lv: 48, mins: 20, go: 'skills', now: topSkill, need: 10, tickets: 2 },
  { id: 'lap1', text: '故地重游,走完一整周', lv: 60, mins: 20, go: 'road', now: (s) => s.progress.lap, need: 1, dust: 100, tickets: 3 },
  { id: 'tower50', text: '登上天阶第 50 阶', lv: 60, mins: 20, go: 'tower', open: 'tower', now: (s) => s.tower.best, need: 50, dust: 100, tickets: 3 },
];

function ensure(s) {
  if (!s.quest) s.quest = { at: 0, count: {} };
  if (!s.quest.count) s.quest.count = {};
  return s.quest;
}

// Called wherever a daily errand is marked, so both keep one record of what the player has done.
function note(s, id) {
  const q = ensure(s);
  q.count[id] = (q.count[id] || 0) + 1;
}

function reward(q) {
  return {
    coin: Math.round((D.coinPerMin(q.lv) * q.mins) / 10) * 10,
    dust: q.dust || 0,
    tickets: q.tickets || 0,
    items: q.items || {},
  };
}

// The goal in hand, or null once the chain is finished.
function current(s) {
  const st = ensure(s);
  const q = QUESTS[st.at];
  if (!q) return null;
  const have = Math.max(0, Math.min(q.need, Math.floor(q.now(s))));
  return { q, index: st.at, total: QUESTS.length, have, need: q.need, done: have >= q.need, locked: !!q.open && !E.unlocked(s, q.open), reward: reward(q) };
}

function ready(s) {
  const c = current(s);
  return !!c && c.done;
}

// Pays the goal in hand and every goal after it that is already met, so catching up is one tap.
function claim(s) {
  const out = { n: 0, coin: 0, dust: 0, tickets: 0, items: {}, last: null };
  for (let guard = 0; guard < QUESTS.length; guard++) {
    const c = current(s);
    if (!c || !c.done) break;
    const r = c.reward;
    E.addCoin(s, r.coin);
    E.addDust(s, r.dust);
    E.addItems(s, r.items);
    s.gacha.tickets += r.tickets;
    out.n++;
    out.coin += r.coin;
    out.dust += r.dust;
    out.tickets += r.tickets;
    Object.keys(r.items).forEach((k) => { out.items[k] = (out.items[k] || 0) + r.items[k]; });
    out.last = c.q;
    s.quest.at++;
  }
  return out;
}

module.exports = { QUESTS, ensure, note, current, ready, claim, reward };
