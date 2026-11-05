// Content for the idle game's side activities. Numbers that decide pacing live with their systems.

// ---- Step-powered boosts ----
// Rule of thumb: one Stardust buys about 30 seconds of extra income. See systems/boosts.js.
const BOOSTS = {
  haste: { name: '御风符', icon: 'wing', cost: 60, secs: 1800, desc: '30 分钟内行军与收益翻倍' },
  jump: { name: '缩地符', icon: 'jump', cost: 120, secs: 3600, desc: '立刻获得 1 小时路上收益' },
  dice: { name: '星骰', icon: 'dice', cost: 50, desc: '多掷一次云游骰子' },
};
const MAX_HASTE_SECS = 12 * 3600;

// Permanent upgrades. All of them are comfort: the road is fully playable with none.
const BLESSINGS = {
  pack: { name: '行囊', icon: 'bag', base: 400, max: 10, desc: '行囊容量 +1 小时' },
  stride: { name: '神行', icon: 'boot', base: 400, max: 10, desc: '行军速度 +3%' },
  fortune: { name: '聚财', icon: 'coin', base: 600, max: 10, desc: '铜钱与阅历 +2%' },
};

// Walking more today makes the party march and earn more today. Nobody is below the baseline for not walking.
const STRIDE = [
  { steps: 3000, bonus: 0.05 },
  { steps: 6000, bonus: 0.1 },
  { steps: 10000, bonus: 0.15 },
  { steps: 15000, bonus: 0.2 },
];

// ---- Couriers ----
// after: chapters that must be finished before this courier signs on.
const COURIERS = [
  { id: 'dou', name: '小豆子', el: 'wood', after: 0, trait: 'swift', desc: '腿快,用时 -15%', head: { hair: 0x3a2a24, hat: 'cap', hatc: 0x3f9e7e } },
  { id: 'zhou', name: '老周头', el: 'earth', after: 0, trait: 'steady', desc: '稳当,酬劳 +15%', head: { hair: 0x8d8aa0, hat: 'straw', skin: 0xddb48e } },
  { id: 'hong', name: '红绡', el: 'fire', after: 1, trait: 'lucky', desc: '胆大,额外奖励 +25%', head: { hair: 0x2b2140, hat: 'bun', hatc: 0xc8402f } },
  { id: 'yuan', name: '阿沅', el: 'water', after: 2, trait: 'herbal', desc: '细致,多带回 2 株草药', head: { hair: 0x241f33, hat: 'bun', hatc: 0x6fb0e0 } },
  { id: 'jin', name: '金不换', el: 'metal', after: 3, trait: 'greedy', desc: '精明,铜钱 +30%', head: { hair: 0x4a3a2a, hat: 'cap', hatc: 0xa8741f, skin: 0xddb48e } },
  { id: 'tao', name: '小陶', el: 'earth', after: 4, trait: 'tireless', desc: '不知疲倦,用时 -25%', head: { hair: 0xc98f55, hat: 'clay', skin: 0xc98f55 } },
];

// Errands by region. el is what the road ahead favours: a courier whose element helps earns a bonus.
const JOBS = [
  [
    { title: '替寨子捎桃胶', el: 'wood' }, { title: '给守墓人带壶酒', el: 'earth' }, { title: '送药到山脚', el: 'water' }, { title: '追一只偷信的猴子', el: 'metal' },
  ],
  [
    { title: '给阿婆送一碗饭', el: 'fire' }, { title: '运水过炎陵', el: 'water' }, { title: '替窑工捎炭', el: 'earth' }, { title: '递一封晒脆的家书', el: 'wood' },
  ],
  [
    { title: '给陶俑送军令', el: 'earth' }, { title: '修一段古道', el: 'metal' }, { title: '替商队探路', el: 'wood' }, { title: '带一壶水给哨兵', el: 'water' },
  ],
  [
    { title: '替老卒捎冬衣', el: 'metal' }, { title: '把麦种送进关', el: 'wood' }, { title: '给囚徒带句话', el: 'fire' }, { title: '磨一批旧刀', el: 'earth' },
  ],
  [
    { title: '在雪里找路碑', el: 'water' }, { title: '给城里送炭火', el: 'fire' }, { title: '替渔人凿冰', el: 'metal' }, { title: '把信放进冰窟', el: 'earth' },
  ],
  [
    { title: '抄录一页星图', el: 'metal' }, { title: '替北辰台添灯油', el: 'fire' }, { title: '在云海里问路', el: 'water' }, { title: '把桃枝带上高台', el: 'wood' },
  ],
];
const JOB_LENGTHS = [
  { mins: 30, label: '短途' },
  { mins: 120, label: '中途' },
  { mins: 240, label: '长途' },
  { mins: 480, label: '远途' },
];

// Letters arrive with finished errands. after: chapters finished, ending: only after the story ends.
const LETTERS = [
  { from: '南山寨的孩子', after: 0, text: '阿箬姐姐说,等桃子结了,要留最大的给送信的哥哥。我们都记着呢。' },
  { from: '老驿丞', after: 0, text: '驿站屋顶又漏了。不用回来修,走你的路。酒我替你喝了。' },
  { from: '炎陵的老妪', after: 1, text: '饭还热着。你们要是路过,进来吃一口。' },
  { from: '窑工', after: 1, text: '日头落了以后,窑火反而好看了。原来黑夜也是有用的。' },
  { from: '掉队的小陶俑', after: 2, text: '报告。此处已无军令。请问,接下来往哪里走?' },
  { from: '守拙', after: 2, text: '吾今日替驿站守门一日。门,甚好。无人来。亦甚好。' },
  { from: '白帝关的老卒', after: 3, text: '冬麦种下去了。明年这时候来,喝一口新酒。别带刀。' },
  { from: '阿箬', after: 3, text: '今天走了很远。鞋底真的快磨穿了。你别笑,我说的是你的鞋。' },
  { from: '半截路碑下的旧信', after: 4, text: '后来的人,若你读到这封信,替我走完剩下的路。九千里,不远。' },
  { from: '裴玄度', after: 5, text: '你寄来的信,我收到了。我不会回信。这一封不算。' },
  { from: '明月', after: 6, ending: true, text: '我爹说,外面开始有春天了。春天是什么颜色的?你替我看看。' },
  { from: '不认识的孩子', after: 6, ending: true, text: '东山的桃子熟了,好甜。娘说这是一个送信的人走出来的。' },
];

// ---- Garden ----
// A neighbour whose element generates a crop's element adds to the harvest. One that overcomes it takes away.
const CROPS = {
  wood: { name: '青芽', mins: 20, yield: 3 },
  fire: { name: '火棘', mins: 45, yield: 4 },
  earth: { name: '黄精', mins: 90, yield: 6 },
  metal: { name: '金线莲', mins: 180, yield: 9 },
  water: { name: '寒露草', mins: 360, yield: 14 },
};
const CROP_ORDER = ['wood', 'fire', 'earth', 'metal', 'water'];

// Cooking turns herbs into supplies, or into a meal that helps for hours (see idle.js).
const RECIPES = {
  pill: { name: '回春丹', icon: 'pill', herbs: { wood: 2, water: 1 }, gives: { pill: 2 } },
  ether: { name: '聚气散', icon: 'ether', herbs: { water: 2, metal: 1 }, gives: { ether: 2 } },
  seal: { name: '封灵符', icon: 'seal', herbs: { metal: 2, earth: 1 }, gives: { seal: 2 } },
  incense: { name: '还魂香', icon: 'incense', herbs: { fire: 2, wood: 2, earth: 2 }, gives: { incense: 1 } },
  meal_coin: { name: '桃花羹', icon: 'meal_coin', herbs: { wood: 4, earth: 2 }, meal: 'coin' },
  meal_xp: { name: '炙鹿脯', icon: 'meal_xp', herbs: { fire: 4, metal: 1 }, meal: 'xp' },
  meal_march: { name: '行军饼', icon: 'meal_march', herbs: { earth: 3, fire: 2 }, meal: 'march' },
  meal_spirit: { name: '灵泉茶', icon: 'meal_spirit', herbs: { water: 3, wood: 2 }, meal: 'spirit' },
};
const MEALS = {
  coin: { name: '桃花羹', icon: 'meal_coin', coin: 0.3, desc: '铜钱 +30%' },
  xp: { name: '炙鹿脯', icon: 'meal_xp', xp: 0.3, desc: '阅历 +30%' },
  march: { name: '行军饼', icon: 'meal_march', march: 0.4, desc: '行军 +40%' },
  spirit: { name: '灵泉茶', icon: 'meal_spirit', spirit: 0.6, desc: '妖灵 +60%' },
};
const MEAL_SECS = 8 * 3600;

// ---- Wander board ----
const BOARD = [
  'inn', 'coin', 'herb', 'spirit', 'xp', 'fork', 'coin', 'item', 'dust', 'herb', 'shrine', 'xp',
  'coin', 'spirit', 'item', 'wind', 'herb', 'xp', 'dust', 'coin', 'item', 'xp', 'herb', 'wind',
];
const TILES = {
  inn: { name: '客栈', icon: 'home', desc: '歇歇脚,多掷一次' },
  coin: { name: '集市', icon: 'coin', desc: '做了笔小买卖' },
  xp: { name: '书院', icon: 'xp', desc: '听先生讲了一段' },
  herb: { name: '药田', icon: 'sprout', desc: '采到几株草药' },
  spirit: { name: '荒祠', icon: 'spirit', desc: '遇到一缕妖灵' },
  item: { name: '货郎', icon: 'seal', desc: '货郎送了点东西' },
  dust: { name: '星坑', icon: 'dust', desc: '捡到几粒星砂' },
  fork: { name: '近路', icon: 'jump', desc: '抄近路,往前三格' },
  wind: { name: '顺风', icon: 'wing', desc: '顺风,御风 10 分钟' },
  shrine: { name: '土地庙', icon: 'star', desc: '土地公保佑,下一格翻倍' },
};
// Small asides that appear while wandering. No choices, no consequences: just the world going on.
const WANDER_LINES = [
  '路边的老农问你:今年的桃子,还结吗?',
  '两个孩子在争,究竟是东山远,还是太阳远。',
  '茶摊老板说,他见过星星掉下来。他还说,砸中了他家的鸡。',
  '有人在石头上刻了字:到此一游。下面又有人刻:我也是。',
  '一只狗跟你走了三里,然后回去了。',
  '货郎说他走过的路比驿卒多。你笑笑,没跟他争。',
  '你在桥上遇见一位赶考的书生。他已经考了十七年了。',
  '雨停了。路上的水洼里,有一小片天。',
];

// ---- Daily errands ----
// walk is a bonus on top of the set, so skipping it never costs the day's reward.
const DAILY_TASKS = [
  { id: 'collect', name: '收一次行囊', dust: 25 },
  { id: 'train', name: '修炼一次', dust: 25 },
  { id: 'dispatch', name: '派出一封信', dust: 25 },
  { id: 'garden', name: '收获一次药圃', dust: 25 },
  { id: 'wander', name: '云游一次', dust: 25 },
  { id: 'tower', name: '登一次天阶', dust: 25 },
  { id: 'gear', name: '强化一次行装', dust: 25 },
];
const DAILY_BONUS = { need: 4, dust: 100, tickets: 3 };
const DAILY_WALK = { steps: 3000, dust: 50 };

// ---- Wardrobe ----
// Outfits change palettes, companions walk with the party, decor dresses up the station.
// steps: unlocks free on reaching that many real lifetime steps. Purely decorative.
const COSMETICS = {
  cen_moon: { kind: 'outfit', hero: 'cen', name: '月白行衣', cost: 1500, pal: { coat: 0x8d9aa8, coat2: 0xd9e2ea, scarf: 0x43306b, scarf2: 0x6b4a94, band: 0x43306b, band2: 0x2a1d55, legs: 0x4a5468 } },
  cen_ember: { kind: 'outfit', hero: 'cen', name: '赤霄短打', cost: 2500, pal: { coat: 0x8e2a25, coat2: 0xc8402f, scarf: 0xe8b33a, scarf2: 0xf7dd7a, band: 0xe8b33a, band2: 0xa8741f, legs: 0x3a1c28, blade: 0xf7dd7a } },
  ruo_snow: { kind: 'outfit', hero: 'ruo', name: '雪中春', cost: 1500, pal: { robe: 0x9fc4d8, robe2: 0xe6f4f8, robe3: 0x6a94ac, sash: 0x6fb0e0, hem: 0xffffff } },
  ruo_dusk: { kind: 'outfit', hero: 'ruo', name: '暮云裳', cost: 2500, pal: { robe: 0x6b4a94, robe2: 0xa884c9, robe3: 0x43306b, sash: 0xf7dd7a, hem: 0xf7c4c8, leaf: 0xf7dd7a } },
  zhuo_gild: { kind: 'outfit', hero: 'zhuo', name: '鎏金甲', cost: 2500, pal: { body: 0xc2902e, body2: 0x8a6420, body3: 0xf7dd7a, patina: 0xdcae48, patina2: 0xf7dd7a, core: 0xec7a4e, core2: 0xf7dd7a } },
  zhuo_jade: { kind: 'outfit', hero: 'zhuo', name: '青玉身', cost: 1500, pal: { body: 0x3f9e7e, body2: 0x1f6a5c, body3: 0x7fd1a4, patina: 0xbfe6f2, patina2: 0xffffff, core: 0xf7dd7a, core2: 0xffffff } },
  pet_crane: { kind: 'pet', name: '小鹤', cost: 3000, pet: 'crane' },
  pet_fox: { kind: 'pet', name: '赤狐', cost: 3000, pet: 'fox' },
  pet_lamp: { kind: 'pet', name: '灯灵', cost: 0, laps: 3, pet: 'lamp' },
  pet_tortoise: { kind: 'pet', name: '老龟', cost: 0, steps: 100000, pet: 'tortoise' },
  decor_lanterns: { kind: 'decor', name: '百盏灯', cost: 1200, icon: 'lantern' },
  decor_banner: { kind: 'decor', name: '驿旗', cost: 800, icon: 'horse' },
  decor_peach: { kind: 'decor', name: '门前桃', cost: 0, steps: 300000, icon: 'sprout' },
};

// ---- Feature unlocks. Each opens when this road node is first cleared. ----
const UNLOCKS = {
  dispatch: { node: 'c1b', name: '驿传' },
  shop: { node: 'c1b', name: '驿铺' },
  furnace: { node: 'c1d', name: '星炉' },
  garden: { node: 'c1h', name: '药圃' },
  tower: { node: 'c1h', name: '天阶' },
  wander: { node: 'c2b', name: '云游' },
  gear: { node: 'c1b', name: '行装' },
  gacha: { node: 'c1h', name: '星笺' },
};

module.exports = {
  BOOSTS, MAX_HASTE_SECS, BLESSINGS, STRIDE, COURIERS, JOBS, JOB_LENGTHS, LETTERS, CROPS, CROP_ORDER, RECIPES, MEALS, MEAL_SECS,
  BOARD, TILES, WANDER_LINES, DAILY_TASKS, DAILY_BONUS, DAILY_WALK, COSMETICS, UNLOCKS,
};
