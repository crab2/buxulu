// 见闻录: a record of every creature the party has driven off, and how many times. Each creature has three
// marks to reach. Writing a mark down pays a little Stardust and adds a point of 见闻, and every point
// raises what the road pays by a quarter of a percent, for good.
//
// It gives the long hours on the road something to add up to. Nothing here is needed to finish the story,
// nothing costs Stardust or looks at real steps, and a mark only counts once the player writes it down.
const G = require('../data/game.js');
const { CHAPTERS } = require('../data/chapters.js');

const NEED = [30, 300, 2000];
const BOSS_NEED = [1, 3, 10];
const DUST = [10, 20, 50];
const PER_POINT = 0.0025;
const KILLS_PER_HOUR = 120; // What the march drives off in an hour, shared among the region's creatures.

// Every creature in the order the road meets it, grouped by region.
const REGIONS = CHAPTERS.map((c) => {
  const ids = [];
  c.nodes.forEach((n) => (n.foes || []).forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); }));
  // Bosses close their region's page.
  ids.sort((a, b) => (G.MONSTERS[a].boss ? 1 : 0) - (G.MONSTERS[b].boss ? 1 : 0));
  return { name: c.name, theme: c.theme, ids };
});
const ORDER = [];
REGIONS.forEach((r) => {
  r.ids = r.ids.filter((id) => ORDER.indexOf(id) < 0);
  r.ids.forEach((id) => ORDER.push(id));
});

// One line about each creature, shown once its first mark is written down.
const NOTES = {
  vine: '怕火,更怕没人理。绕开走,它会跟上来。',
  floral: '花粉呛人。它其实只是想让你夸它一句。',
  xiao: '一条腿,跳得比两条腿的快。爱学人说话。',
  xiaoKing: '林子里它最大。也只在林子里。',
  vineMother: '活了一百年,记得每一个路过的人。',
  firerat: '皮毛不怕火烧,所以总被人惦记。',
  bifang: '单足的火鸟。它落在哪里,哪里就不缺柴。',
  wisp: '一团不肯熄的火。夜里看,有点像灯。',
  bifang2: '羽毛红得发黑。别的毕方都让着它。',
  crow: '它衔着坠星,把太阳钉在天上,不许它落。',
  clay: '烧成的那天接了军令,到今天没人叫它歇。',
  worm: '沙底下游的蛇。古道上的坑,多半是它拱的。',
  ram: '长着四只角。脾气和角一样多。',
  clay2: '比别的陶俑多一道釉。它很在意这个。',
  general: '奉令屯守,未得令不退。下令的人早不在了。',
  scorpion: '尾针是金的。蜇人的时候,它自己也心疼。',
  blade: '断剑里住着的一口气。主人是谁,它忘了。',
  cicada: '叫一个秋天,脱一层壳。壳比它本人值钱。',
  blade2: '白得晃眼的一道刃。它只记得最后那一仗。',
  tiger: '秋天的刑官。落叶在它面前都站得笔直。',
  grub: '吐的丝入水不化。冷的时候,它自己也盖。',
  merfolk: '渊底的歌是它们唱的。歌词没人听懂过。',
  serpent: '黑得像没点灯的水。它认路,比你认得准。',
  merfolk2: '披着鳞甲巡渊的将官。从不上岸。',
  frostDragon: '盘着一口冰棺守了三年。它不知道棺里是谁。',
  puppet: '星光捏的人形。捏它的人没给它起名字。',
  shade: '高台上走丢的影子。找不到自己的主人。',
  shade2: '守夜守得太久,忘了天是会亮的。',
  pei1: '太史令,观星三十年。他不觉得自己错了。',
  pei2: '他把星星按在原地。他只是不想再送别。',
};

function ensure(s) {
  if (!s.codex.kills) s.codex.kills = {};
  if (!s.codex.lore) s.codex.lore = {};
  return s.codex;
}

function needOf(id) {
  return G.MONSTERS[id].boss ? BOSS_NEED : NEED;
}

function note(s, id, n) {
  if (!G.MONSTERS[id]) return;
  const c = ensure(s);
  c.kills[id] = (c.kills[id] || 0) + (n === undefined ? 1 : n);
  c.monsters[id] = true;
}

// Called wherever a real fight is won, with the units that fell.
function noteUnits(s, enemies) {
  enemies.forEach((e) => note(s, e.id, 1));
}

// The march between stops: whole kills are dealt out in turn, so no dice are needed.
function accrue(s, hours, pool) {
  const carry = s.idle.carry;
  carry.kill = (carry.kill || 0) + KILLS_PER_HOUR * hours;
  if (!pool.length) return;
  while (carry.kill >= 1) {
    carry.kill -= 1;
    carry.killAt = ((carry.killAt || 0) + 1) % 1000000;
    note(s, pool[carry.killAt % pool.length], 1);
  }
}

// A save from before the record existed has been fighting all along. It is credited with what its hours on
// the road would have counted, spread over the regions it has walked, and with each boss it has beaten.
function backfill(s) {
  const hours = ((s.idle && s.idle.total) || 0) / 3600;
  const upTo = Math.min(CHAPTERS.length - 1, (s.progress && s.progress.chapter) || 0);
  const each = (KILLS_PER_HOUR * hours) / (upTo + 1);
  CHAPTERS.forEach((c, ci) => {
    const pool = [];
    c.nodes.forEach((n) => (n.foes || []).forEach((id) => {
      if (G.MONSTERS[id].boss) {
        if (s.progress.cleared[n.id]) note(s, id, 1);
      } else if (pool.indexOf(id) < 0) pool.push(id);
    }));
    const n = Math.floor(each / Math.max(1, pool.length));
    if (ci <= upTo && n > 0) pool.forEach((id) => note(s, id, n));
  });
}

// Marks reached by the count, whether or not they have been written down yet.
function reached(id, kills) {
  const need = needOf(id);
  let t = 0;
  while (t < need.length && kills >= need[t]) t++;
  return t;
}

function entry(s, id) {
  const c = ensure(s);
  const kills = c.kills[id] || 0;
  const need = needOf(id);
  const got = c.lore[id] || 0;
  const at = reached(id, kills);
  return {
    id, def: G.MONSTERS[id], kills, need, got, reached: at, ready: at - got,
    known: !!c.monsters[id] || kills > 0,
    next: got < need.length ? need[got] : null,
    note: got > 0 ? NOTES[id] : null,
  };
}

function points(s) {
  const lore = ensure(s).lore;
  return Object.keys(lore).reduce((n, k) => n + lore[k], 0);
}

const TOTAL = ORDER.length * NEED.length;

// The share added to the road's coins and experience.
function bonus(s) {
  return points(s) * PER_POINT;
}

// The same share as a figure to print: 0.75, 1, 22.5.
function percent(s) {
  return String(Math.round(points(s) * PER_POINT * 10000) / 100);
}

// How many marks are waiting to be written down. Used for the red dots.
function ready(s) {
  return ORDER.reduce((n, id) => n + entry(s, id).ready, 0);
}

function claim(s, id) {
  const e = entry(s, id);
  const out = { n: 0, dust: 0 };
  for (let t = e.got; t < e.reached; t++) {
    out.n++;
    out.dust += DUST[t];
  }
  if (!out.n) return out;
  s.codex.lore[id] = e.reached;
  s.stardust = Math.max(0, s.stardust + out.dust);
  return out;
}

function claimAll(s) {
  const out = { n: 0, dust: 0 };
  ORDER.forEach((id) => {
    const r = claim(s, id);
    out.n += r.n;
    out.dust += r.dust;
  });
  return out;
}

module.exports = {
  NEED, BOSS_NEED, DUST, PER_POINT, KILLS_PER_HOUR, REGIONS, ORDER, NOTES, TOTAL,
  ensure, note, noteUnits, accrue, backfill, percent, entry, points, bonus, ready, claim, claimAll, needOf,
};
