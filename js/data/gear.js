// Equipment content: slots, rarities, the seven star sets and the odds of the star letters.
// Rules live in systems/gear.js and systems/gacha.js. Nothing here depends on the save.
const { C } = require('../core/palette.js');

// Each slot strengthens one stat, the same four that training does.
const SLOTS = {
  blade: { name: '兵刃', word: '刃', stat: 'atkPct', label: '攻击', base: 0.03 },
  coat: { name: '护甲', word: '甲', stat: 'defPct', label: '防御', base: 0.03 },
  boots: { name: '行履', word: '履', stat: 'spdPct', label: '速度', base: 0.015 },
  charm: { name: '玉佩', word: '佩', stat: 'hpPct', label: '气血', base: 0.04 },
};
const SLOT_ORDER = ['blade', 'coat', 'boots', 'charm'];

// cap: the highest level a piece of this rarity can reach before it must be promoted.
// salvage: iron a piece of this rarity breaks down into.
const RARITIES = [
  { name: '凡', css: '#d9c9a3', mult: 1, cap: 10, salvage: 3 },
  { name: '灵', css: '#6fb0e0', mult: 1.6, cap: 20, salvage: 8 },
  { name: '玄', css: '#a884c9', mult: 2.4, cap: 30, salvage: 20 },
  { name: '仙', css: '#f7dd7a', mult: 3.5, cap: 40, salvage: 50 },
];
const LEVEL_GAIN = 0.08; // Each level adds this share of the piece's base value.

// Coins and iron pay for everything, so a piece found on the road can go all the way to the top.
const levelCost = (lv) => ({ coin: Math.round((400 * Math.pow(1.18, lv)) / 10) * 10, iron: 1 + Math.floor(lv / 5) });
const PROMOTE = [
  { coin: 6000, iron: 20 },
  { coin: 60000, iron: 60 },
  { coin: 400000, iron: 150 },
];
const FORGE = { coin: 3000, iron: 30 }; // Makes a chosen piece at the lowest rarity, so no set depends on luck.
const BAG_CAP = 80;

// The seven stars of the Dipper by their old astrological names, in the order the road relights them.
// Set n opens once n stars are lit, so the pool grows with the journey and the first set is ready at the start.
// fit: how much each hero gets from the four-piece effect, used only by one-tap equip.
const SETS = {
  wolf: {
    name: '贪狼', star: '天枢', a: C.red, b: C.red2, c: C.gold2,
    two: { stat: 'atkPct', value: 0.1, desc: '攻击 +10%' },
    four: { name: '噬战', desc: '每次出手后攻击 +4%,本场最多 +24%', mods: { rage: 0.04, rageMax: 0.24 } },
    fit: { cen: 0.9, ruo: 0.3, zhuo: 0.4 },
  },
  gate: {
    name: '巨门', star: '天璇', a: C.bronze3, b: C.bronze2, c: C.gold,
    two: { stat: 'defPct', value: 0.12, desc: '防御 +12%' },
    four: { name: '不破', desc: '每场首次受到致命伤时,留下 20% 气血', mods: { lastStand: 0.2 } },
    fit: { cen: 0.5, ruo: 0.7, zhuo: 0.9 },
  },
  lu: {
    name: '禄存', star: '天玑', a: C.gold, b: C.gold3, c: C.jade3,
    two: { stat: 'hpPct', value: 0.1, desc: '气血 +10%' },
    four: { name: '禄星', desc: '路上铜钱与阅历 +6%,多人穿戴可叠加', party: { income: 0.06 } },
    fit: { cen: 0.3, ruo: 0.4, zhuo: 0.4 },
  },
  wen: {
    name: '文曲', star: '天权', a: C.blue3, b: C.blue, c: C.paper,
    two: { stat: 'skillDmg', value: 0.12, desc: '术法伤害 +12%' },
    four: { name: '文心', desc: '施放术法时 25% 再放一次,不耗灵力', mods: { echo: 0.25 } },
    fit: { cen: 0.6, ruo: 0.9, zhuo: 0.4 },
  },
  lian: {
    name: '廉贞', star: '玉衡', a: C.violet3, b: C.violet, c: C.peach2,
    two: { stat: 'crit', value: 0.08, desc: '暴击率 +8%' },
    four: { name: '判官', desc: '攻击时 20% 使敌破甲,对带异常的敌人伤害 +20%', mods: { weakChance: 0.2, ailmentDmg: 0.2 } },
    fit: { cen: 0.8, ruo: 0.5, zhuo: 0.4 },
  },
  wu: {
    name: '武曲', star: '开阳', a: C.ice2, b: C.blue2, c: C.ochre3,
    two: { stat: 'hpPct', value: 0.12, desc: '气血 +12%' },
    four: { name: '镇岳', desc: '受到攻击时 30% 反击一次', mods: { counter: 0.3, counterPower: 0.8 } },
    fit: { cen: 0.4, ruo: 0.3, zhuo: 0.9 },
  },
  po: {
    name: '破军', star: '摇光', a: C.ink4, b: C.ink2, c: C.red3,
    two: { stat: 'critDmg', value: 0.3, desc: '暴击伤害 +30%' },
    four: { name: '七杀', desc: '开场七星步充能 30,每次暴击再充 8', mods: { ultStart: 30, ultCrit: 8 } },
    fit: { cen: 0.9, ruo: 0.4, zhuo: 0.5 },
  },
};
const SET_ORDER = ['wolf', 'gate', 'lu', 'wen', 'lian', 'wu', 'po'];

// ---- Road finds ----
const ROAD_RATES = [0.75, 0.22, 0.03, 0];
// Each boss hands over one piece of the set it opens, at this rarity, by chapter.
const BOSS_RARITY = [1, 1, 2, 2, 2, 3];

// ---- Star letters: the draw ----
// These are the real odds, and the rates screen is generated from them. Rarity order matches RARITIES.
const DRAW_RATES = [0.5, 0.35, 0.13, 0.02];
const PITY_TOP = 60; // A 仙 piece at the latest on this draw.
const PITY_RARE = 10; // A 玄 piece or better at the latest on this draw.
const WISH_SHARE = 0.5; // Share of 玄 and 仙 pieces that come from the set the player asked for.

// Letters come mostly from playing. Buying more is optional and capped per day, so neither walking
// nor a big coin balance can turn the draw into the main way to get strong.
const TICKET_COIN_MINS = 30; // One letter costs this many minutes of road income.
const TICKET_COIN_DAILY = 5;
const TICKET_DUST = 120;
const TICKET_DUST_DAILY = 10;
const STAR_TICKETS = (nthStar) => (nthStar === 1 ? 10 : 5);

module.exports = {
  SLOTS, SLOT_ORDER, RARITIES, LEVEL_GAIN, levelCost, PROMOTE, FORGE, BAG_CAP, SETS, SET_ORDER, ROAD_RATES, BOSS_RARITY,
  DRAW_RATES, PITY_TOP, PITY_RARE, WISH_SHARE, TICKET_COIN_MINS, TICKET_COIN_DAILY, TICKET_DUST, TICKET_DUST_DAILY, STAR_TICKETS,
};
