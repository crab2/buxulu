// Numbers and definitions for combat and progression. No text-heavy story here (see story.js).

const ELEMENTS = {
  metal: { name: '金', css: '#d7e6ee' },
  wood: { name: '木', css: '#7fd1a4' },
  water: { name: '水', css: '#6fb0e0' },
  fire: { name: '火', css: '#ec7a4e' },
  earth: { name: '土', css: '#e8b33a' },
};
// Metal cuts wood, wood parts earth, earth dams water, water quenches fire, fire melts metal.
const OVERCOMES = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' };
const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };

function elementMult(atk, def) {
  if (!atk || !def) return 1;
  if (OVERCOMES[atk] === def) return 1.5;
  if (OVERCOMES[def] === atk) return 0.7;
  return 1;
}

const STATUS = {
  burn: { name: '灼烧', bad: true, css: '#ec7a4e' },
  poison: { name: '中毒', bad: true, css: '#7fd1a4' },
  slow: { name: '迟缓', bad: true, css: '#6fb0e0' },
  weak: { name: '破甲', bad: true, css: '#a884c9' },
  stun: { name: '眩晕', bad: true, css: '#f7dd7a' },
  atkUp: { name: '攻升', css: '#ec7a4e' },
  defUp: { name: '防升', css: '#e8b33a' },
  regen: { name: '回春', css: '#7fd1a4' },
  guard: { name: '防御', css: '#d9c9a3' },
  taunt: { name: '嘲讽', css: '#e8b33a' },
};

// power: damage multiplier. heal: multiple of atk. target: enemy | enemies | ally | allies | self | ko | random:N
const SKILLS = {
  // Cen Xing
  cut: { name: '断金', el: 'metal', mp: 3, power: 1.5, target: 'enemy', fx: 'slash', pose: 'atk', desc: '金系单体斩击' },
  flame: { name: '炎符', el: 'fire', mp: 4, power: 1.5, target: 'enemy', fx: 'fire', pose: 'cast', status: 'burn', chance: 0.4, turns: 3, desc: '火系符咒,可能灼烧' },
  meteor: { name: '流星步', el: 'metal', mp: 8, power: 0.95, target: 'enemies', fx: 'slash', pose: 'thrust', desc: '金系全体突袭' },
  breaker: { name: '破军', el: 'metal', mp: 11, power: 2.4, ignore: 0.4, target: 'enemy', fx: 'slash', pose: 'atk', desc: '无视部分防御的重斩' },
  blaze: { name: '赤霄连斩', el: 'fire', mp: 15, power: 0.85, target: 'random:4', fx: 'fire', pose: 'atk', desc: '火系随机连击四次' },
  // A Ruo
  mend: { name: '回春', mp: 4, heal: 2.4, target: 'ally', fx: 'heal', pose: 'cast', desc: '治疗一名同伴' },
  thorn: { name: '青藤', el: 'wood', mp: 3, power: 1.4, target: 'enemy', fx: 'wood', pose: 'thrust', status: 'slow', chance: 0.5, turns: 2, desc: '木系缠绕,可能迟缓' },
  dew: { name: '寒露', el: 'water', mp: 4, power: 1.5, target: 'enemy', fx: 'water', pose: 'cast', desc: '水系单体术法' },
  rain: { name: '甘霖', mp: 9, heal: 1.5, target: 'allies', fx: 'heal', pose: 'cast', status: 'regen', chance: 1, turns: 2, desc: '治疗全体并持续回春' },
  tide: { name: '潮生', el: 'water', mp: 10, power: 1.1, target: 'enemies', fx: 'water', pose: 'cast', desc: '水系全体术法' },
  revive: { name: '返魂', mp: 15, revive: 0.5, target: 'ko', fx: 'heal', pose: 'cast', desc: '复活一名倒下的同伴' },
  // Shou Zhuo
  wall: { name: '岩盾', mp: 3, target: 'self', fx: 'earth', pose: 'cast', statuses: [['guard', 1], ['taunt', 2], ['defUp', 2]], desc: '防御并吸引敌方攻击' },
  quake: { name: '地裂', el: 'earth', mp: 6, power: 1.0, target: 'enemies', fx: 'earth', pose: 'atk', desc: '土系全体震击' },
  bronze: { name: '铜躯', mp: 7, target: 'allies', fx: 'earth', pose: 'cast', status: 'defUp', chance: 1, turns: 3, desc: '全队防御提升' },
  fall: { name: '崩山', el: 'earth', mp: 10, power: 2.0, defScale: 0.5, target: 'enemy', fx: 'earth', pose: 'atk', status: 'stun', chance: 0.3, turns: 1, desc: '依防御增伤的重击,可能眩晕' },

  // Enemies
  bite: { name: '撕咬', power: 1.15, target: 'enemy', fx: 'slash' },
  lash: { name: '藤鞭', el: 'wood', power: 1.2, target: 'enemy', fx: 'wood' },
  spores: { name: '毒粉', el: 'wood', power: 0.7, target: 'enemies', fx: 'wood', status: 'poison', chance: 0.4, turns: 2 },
  ember: { name: '火星', el: 'fire', power: 1.25, target: 'enemy', fx: 'fire', status: 'burn', chance: 0.3, turns: 2 },
  flare: { name: '烈焰', el: 'fire', power: 0.85, target: 'enemies', fx: 'fire' },
  dustup: { name: '飞沙', el: 'earth', power: 0.8, target: 'enemies', fx: 'earth' },
  slam: { name: '夯击', el: 'earth', power: 1.35, target: 'enemy', fx: 'earth' },
  sting: { name: '毒刺', el: 'metal', power: 1.1, target: 'enemy', fx: 'slash', status: 'poison', chance: 0.5, turns: 3 },
  gale: { name: '金风', el: 'metal', power: 0.85, target: 'enemies', fx: 'slash' },
  slice: { name: '白刃', el: 'metal', power: 1.4, target: 'enemy', fx: 'slash', status: 'weak', chance: 0.3, turns: 2 },
  frost: { name: '寒息', el: 'water', power: 1.2, target: 'enemy', fx: 'water', status: 'slow', chance: 0.4, turns: 2 },
  blizzard: { name: '暴雪', el: 'water', power: 0.85, target: 'enemies', fx: 'water' },
  voidtouch: { name: '虚蚀', power: 1.25, target: 'enemy', fx: 'star', status: 'weak', chance: 0.4, turns: 2 },
  starfall: { name: '星陨', power: 0.9, target: 'enemies', fx: 'star' },
  // Telegraphed attacks give the player one turn to guard or heal.
  bloom: { name: '百花杀', el: 'wood', power: 1.7, target: 'enemies', fx: 'wood', charge: '枝条开始疯狂生长', status: 'poison', chance: 0.6, turns: 3 },
  sunfire: { name: '焚天', el: 'fire', power: 1.8, target: 'enemies', fx: 'fire', charge: '双翼燃起白炽的火焰', status: 'burn', chance: 0.6, turns: 3 },
  charge: { name: '千军冲阵', el: 'earth', power: 1.9, target: 'enemies', fx: 'earth', charge: '大地随号令而震颤' },
  autumnPunish: { name: '秋刑', el: 'metal', power: 2.0, target: 'enemies', fx: 'slash', charge: '万千白刃悬于头顶', status: 'weak', chance: 0.5, turns: 2 },
  glacier: { name: '玄冰葬', el: 'water', power: 1.9, target: 'enemies', fx: 'water', charge: '深渊之水正在凝结', status: 'slow', chance: 0.6, turns: 2 },
  stopTime: { name: '定星', power: 2.1, target: 'enemies', fx: 'star', charge: '七星之光在他掌中汇聚', status: 'stun', chance: 0.25, turns: 1 },
};

const HEROES = {
  cen: {
    name: '岑行', el: 'metal', role: '斥候', title: '望星驿驿卒',
    base: { hp: 120, mp: 26, atk: 24, def: 12, spd: 14 },
    grow: { hp: 19, mp: 2.6, atk: 3.8, def: 1.7, spd: 0.45 },
    skills: [['cut', 1], ['flame', 3], ['meteor', 8], ['breaker', 16], ['blaze', 26]],
  },
  ruo: {
    name: '阿箬', el: 'wood', role: '巫医', title: '南山寨巫女',
    base: { hp: 92, mp: 40, atk: 18, def: 9, spd: 16 },
    grow: { hp: 14, mp: 4, atk: 2.9, def: 1.3, spd: 0.5 },
    skills: [['mend', 1], ['thorn', 1], ['dew', 5], ['rain', 10], ['tide', 18], ['revive', 22]],
  },
  zhuo: {
    name: '守拙', el: 'earth', role: '傀儡', title: '偃师铜傀',
    base: { hp: 170, mp: 20, atk: 20, def: 19, spd: 9 },
    grow: { hp: 25, mp: 2, atk: 2.8, def: 2.5, spd: 0.25 },
    skills: [['wall', 1], ['quake', 1], ['bronze', 12], ['fall', 20]],
  },
};
const HERO_ORDER = ['cen', 'ruo', 'zhuo'];
const MAX_LEVEL = 120;

// art: sprite to draw. hp/atk/def/spd multiply the level curve in party.js.
const MONSTERS = {
  vine: { name: '藤精', art: 'vine', el: 'wood', tier: 1, hp: 0.9, atk: 0.9, def: 0.8, spd: 0.9, skills: ['lash'] },
  floral: { name: '花魅', art: 'floral', el: 'wood', tier: 1, hp: 0.8, atk: 1, def: 0.7, spd: 1.2, skills: ['spores', 'lash'] },
  xiao: { name: '山魈', art: 'xiao', el: 'earth', tier: 1, hp: 1.2, atk: 1.1, def: 1, spd: 0.8, skills: ['slam', 'bite'] },
  xiaoKing: { name: '山魈王', art: { base: 'xiao', a: 0x4a3a5a, b: 0x2c2238, m: 0x6fb0e0 }, el: 'earth', tier: 2, hp: 2.6, atk: 1.25, def: 1.2, spd: 0.9, skills: ['slam', 'bite', 'dustup'], elite: true },

  firerat: { name: '火鼠', art: 'firerat', el: 'fire', tier: 1, hp: 0.8, atk: 1, def: 0.8, spd: 1.3, skills: ['bite', 'ember'] },
  bifang: { name: '毕方', art: 'bifang', el: 'fire', tier: 1, hp: 0.9, atk: 1.1, def: 0.8, spd: 1.2, skills: ['ember', 'flare'] },
  wisp: { name: '灼灵', art: 'wisp', el: 'fire', tier: 1, hp: 0.7, atk: 1.2, def: 0.6, spd: 1, skills: ['ember', 'flare'] },
  bifang2: { name: '赤羽毕方', art: { base: 'bifang', a: 0xf7dd7a, b: 0xc8402f, c: 0x241c34 }, el: 'fire', tier: 2, hp: 2.6, atk: 1.25, def: 1, spd: 1.2, skills: ['ember', 'flare'], elite: true },

  clay: { name: '陶俑', art: 'clay', el: 'earth', tier: 2, hp: 1.1, atk: 1, def: 1.3, spd: 0.8, skills: ['slam', 'bite'] },
  worm: { name: '沙虺', art: 'worm', el: 'earth', tier: 2, hp: 1, atk: 1.1, def: 0.9, spd: 1, skills: ['dustup', 'bite'] },
  ram: { name: '土蝼', art: 'ram', el: 'metal', tier: 2, hp: 1.2, atk: 1.15, def: 1.2, spd: 0.9, skills: ['bite', 'gale'] },
  clay2: { name: '陶俑校尉', art: { base: 'clay', a: 0x8d9aa8, b: 0x5a6878, c: 0x38445a }, el: 'earth', tier: 3, hp: 2.6, atk: 1.25, def: 1.5, spd: 0.9, skills: ['slam', 'dustup'], elite: true },

  scorpion: { name: '金蝎', art: 'scorpion', el: 'metal', tier: 2, hp: 1, atk: 1.1, def: 1.2, spd: 1, skills: ['sting', 'bite'] },
  blade: { name: '剑灵', art: 'blade', el: 'metal', tier: 2, hp: 0.8, atk: 1.25, def: 0.8, spd: 1.2, skills: ['slice', 'gale'] },
  cicada: { name: '金蝉', art: 'cicada', el: 'wood', tier: 2, hp: 0.9, atk: 1, def: 1, spd: 1.4, skills: ['spores', 'gale'] },
  blade2: { name: '白刃魂', art: { base: 'blade', a: 0xf2e9d0, b: 0xc8402f, c: 0x8e2a25 }, el: 'metal', tier: 3, hp: 2.5, atk: 1.3, def: 1, spd: 1.3, skills: ['slice', 'gale'], elite: true },

  grub: { name: '冰蚕', art: 'grub', el: 'water', tier: 3, hp: 1.2, atk: 0.9, def: 1.2, spd: 0.7, skills: ['frost', 'bite'] },
  merfolk: { name: '寒鲛', art: 'merfolk', el: 'water', tier: 3, hp: 1, atk: 1.15, def: 0.9, spd: 1.1, skills: ['frost', 'blizzard'] },
  serpent: { name: '玄虺', art: 'serpent', el: 'water', tier: 3, hp: 1.1, atk: 1.2, def: 1, spd: 1, skills: ['sting', 'frost'] },
  merfolk2: { name: '鲛人将', art: { base: 'merfolk', a: 0x43306b, b: 0xa884c9, c: 0xf7dd7a }, el: 'water', tier: 4, hp: 2.6, atk: 1.3, def: 1.1, spd: 1.2, skills: ['frost', 'blizzard'], elite: true },

  puppet: { name: '星傀', art: 'puppet', el: 'metal', tier: 3, hp: 1, atk: 1.15, def: 1.1, spd: 1.1, skills: ['voidtouch', 'gale'] },
  shade: { name: '虚影', art: 'shade', el: 'water', tier: 3, hp: 1, atk: 1.2, def: 0.8, spd: 1.2, skills: ['voidtouch', 'starfall'] },
  shade2: { name: '守夜虚影', art: { base: 'shade', a: 0x8e2a25, b: 0xc8402f, c: 0xf7dd7a }, el: 'fire', tier: 4, hp: 2.6, atk: 1.3, def: 1, spd: 1.2, skills: ['voidtouch', 'starfall', 'flare'], elite: true },

  // Bosses: pattern loops in order. Charged skills take two turns, and the warning is the cue to guard.
  vineMother: { name: '百岁藤', art: 'vineMother', el: 'wood', boss: true, hp: 6.5, atk: 1.1, def: 1, spd: 0.8, pattern: ['lash', 'spores', 'lash', 'bloom'], phases: [{ at: 0.5, text: '断枝之处,开出了更多的花', status: 'atkUp' }] },
  crow: { name: '焚天鸦', art: 'crow', el: 'fire', boss: true, hp: 6.5, atk: 1.12, def: 0.95, spd: 1.05, pattern: ['ember', 'flare', 'ember', 'sunfire'], phases: [{ at: 0.5, text: '它的羽毛烧成了白色', status: 'atkUp' }] },
  general: { name: '陶俑将军', art: 'general', el: 'earth', boss: true, hp: 8.4, atk: 1.26, def: 1.3, spd: 0.75, pattern: ['slam', 'dustup', 'slam', 'charge'], phases: [{ at: 0.5, text: '他说:此阵,不可退', status: 'defUp' }] },
  tiger: { name: '白虎魄', art: 'tiger', el: 'metal', boss: true, hp: 6.6, atk: 1.04, def: 1, spd: 1.2, pattern: ['slice', 'gale', 'slice', 'autumnPunish'], phases: [{ at: 0.5, text: '虎啸之下,落叶皆成刀', status: 'atkUp' }] },
  frostDragon: { name: '霜蛟', art: 'frostDragon', el: 'water', boss: true, hp: 9, atk: 1.26, def: 1.1, spd: 1, pattern: ['frost', 'blizzard', 'frost', 'glacier'], phases: [{ at: 0.5, text: '冰甲又厚了一层', status: 'defUp' }] },
  pei1: { name: '裴玄度', art: 'pei1', el: 'water', boss: true, hp: 7, atk: 1.16, def: 1.05, spd: 1.15, pattern: ['voidtouch', 'starfall', 'frost', 'stopTime'], phases: [{ at: 0.5, text: '他收起了那一点怜悯', status: 'atkUp' }] },
  pei2: { name: '裴玄度·定星', art: 'pei2', el: 'fire', boss: true, hp: 8.5, atk: 1.2, def: 1.1, spd: 1.2, pattern: ['starfall', 'voidtouch', 'flare', 'stopTime'], phases: [{ at: 0.66, text: '天枢、天璇、天玑,一一暗去', status: 'atkUp' }, { at: 0.33, text: '他已经不再看你了', status: 'defUp' }] },
};

const ITEMS = {
  pill: { name: '回春丹', icon: 'pill', price: 1500, use: 'heal', desc: '恢复一名同伴 40% 气血', target: 'ally' },
  ether: { name: '聚气散', icon: 'ether', price: 2000, use: 'mp', desc: '恢复一名同伴 50% 灵力', target: 'ally' },
  incense: { name: '还魂香', icon: 'incense', price: 9000, use: 'revive', desc: '复活同伴并恢复 50% 气血', target: 'ko' },
  seal: { name: '封灵符', icon: 'seal', price: 1200, use: 'seal', desc: '封印虚弱的妖灵,血量越低越易成功', target: 'enemy' },
};

// Training is paid in coins and has many small tiers, so there is always one more to buy.
const TRAIN = {
  hp: { name: '气血', pct: 0.03, unit: '%', desc: '每层气血 +3%', icon: 'pill' },
  atk: { name: '攻伐', pct: 0.025, unit: '%', desc: '每层攻击 +2.5%', icon: 'sword' },
  def: { name: '护体', pct: 0.025, unit: '%', desc: '每层防御 +2.5%', icon: 'shield' },
  spd: { name: '身法', pct: 0.015, unit: '%', desc: '每层速度 +1.5%', icon: 'boot' },
};
const TRAIN_MAX = 60;
const trainCost = (lv) => Math.round((1200 * Math.pow(1.19, lv)) / 100) * 100;

const xpNeed = (lv) => 300 + 200 * lv + 120 * lv * lv + 50 * lv * lv * lv;

// Road income per minute at a given enemy level.
const coinPerMin = (lv) => 140 * Math.pow(1.03, lv);
const xpPerMin = (lv) => 70 + 5 * lv;

// Relics refined from two spirits: the element pair picks the family, combined tier picks the rank.
const RANKS = [
  { name: '凡', css: '#d9c9a3', cost: 4000, mins: 5 },
  { name: '灵', css: '#6fb0e0', cost: 50000, mins: 30 },
  { name: '仙', css: '#f7dd7a', cost: 300000, mins: 120 },
];
function rankFor(tierSum) {
  return tierSum >= 6 ? 2 : tierSum >= 4 ? 1 : 0;
}

// values: strength per rank. Negative side effects live in `extra`.
const RELICS = {
  metal_metal: { name: '破邪佩', shape: 'pendant', el: 'metal', stat: 'atkPct', values: [0.08, 0.14, 0.22], fmt: '攻击 +{p}' },
  wood_wood: { name: '长春藤环', shape: 'ring', el: 'wood', stat: 'regen', values: [0.03, 0.05, 0.08], fmt: '每回合回复气血 {p}' },
  water_water: { name: '凝露珠', shape: 'orb', el: 'water', stat: 'mpRegen', values: [1, 2, 4], fmt: '每回合回复灵力 {v}' },
  fire_fire: { name: '燎原符', shape: 'talisman', el: 'fire', stat: 'burnChance', values: [0.12, 0.2, 0.32], fmt: '攻击时 {p} 使敌灼烧' },
  earth_earth: { name: '厚土印', shape: 'seal', el: 'earth', stat: 'defPct', values: [0.08, 0.14, 0.22], fmt: '防御 +{p}' },
  // Generating pairs: gentle and reliable.
  fire_wood: { name: '燧木灯', shape: 'lamp', el: 'fire', stat: 'crit', values: [0.06, 0.1, 0.16], fmt: '暴击率 +{p}' },
  earth_fire: { name: '窑心石', shape: 'orb', el: 'earth', stat: 'hpPct', values: [0.1, 0.16, 0.25], fmt: '气血 +{p}' },
  earth_metal: { name: '藏锋匣', shape: 'seal', el: 'metal', stat: 'critDmg', values: [0.25, 0.4, 0.65], fmt: '暴击伤害 +{p}' },
  metal_water: { name: '寒铁链', shape: 'knot', el: 'water', stat: 'spdPct', values: [0.08, 0.13, 0.2], fmt: '速度 +{p}' },
  water_wood: { name: '润物壶', shape: 'lamp', el: 'wood', stat: 'healPct', values: [0.15, 0.25, 0.4], fmt: '治疗效果 +{p}' },
  // Overcoming pairs: unstable, with stronger effects and sometimes a cost.
  metal_wood: { name: '伐木斧', shape: 'blade', el: 'metal', stat: 'atkPct', values: [0.14, 0.22, 0.32], extra: { defPct: -0.08 }, fmt: '攻击 +{p},防御 -8%' },
  earth_wood: { name: '盘根结', shape: 'knot', el: 'wood', stat: 'lifesteal', values: [0.06, 0.1, 0.16], fmt: '造成伤害的 {p} 转为气血' },
  earth_water: { name: '镇河铁', shape: 'seal', el: 'water', stat: 'dmgTaken', values: [0.06, 0.1, 0.15], fmt: '受到伤害 -{p}' },
  fire_water: { name: '霜焰盏', shape: 'lamp', el: 'water', stat: 'mpCost', values: [0.15, 0.25, 0.35], fmt: '术法灵力消耗 -{p}' },
  fire_metal: { name: '熔金坩', shape: 'blade', el: 'fire', stat: 'skillDmg', values: [0.1, 0.16, 0.25], fmt: '术法伤害 +{p}' },
};
const relicKey = (a, b) => [a, b].sort().join('_');
const REFINE_FAMILY = (a, b) => (a === b ? '同气' : GENERATES[a] === b || GENERATES[b] === a ? '相生' : '相克');

function relicDesc(type, rank) {
  const r = RELICS[type];
  const v = r.values[rank];
  return r.fmt.replace('{p}', Math.round(v * 100) + '%').replace('{v}', v);
}

const SHOP_LIST = ['pill', 'ether', 'seal', 'incense'];

module.exports = {
  ELEMENTS, OVERCOMES, GENERATES, elementMult, STATUS, SKILLS, HEROES, HERO_ORDER, MAX_LEVEL, MONSTERS, ITEMS,
  TRAIN, TRAIN_MAX, trainCost, xpNeed, coinPerMin, xpPerMin, RANKS, rankFor, RELICS, relicKey, relicDesc, REFINE_FAMILY, SHOP_LIST,
};
