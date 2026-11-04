// World structure. Each chapter is one region, one season, one fallen star.
// node types: fight | elite | event | chest | boss. needSteps gates optional paths behind real walking.
function f(id, lv, foes, extra) {
  return Object.assign({ id, type: 'fight', lv, foes }, extra || {});
}
function e(id, lv, foes, extra) {
  return Object.assign({ id, type: 'elite', lv, foes }, extra || {});
}
function evt(id, key) {
  return { id, type: 'event', key };
}
function chest(id, needSteps, reward) {
  return { id, type: 'chest', needSteps, reward };
}
function boss(id, lv, foes, cost, extra) {
  return Object.assign({ id, type: 'boss', lv, foes, cost }, extra || {});
}

const CHAPTERS = [
  {
    id: 'c1', name: '不谢坡', dir: '东', season: '春', theme: 'spring', star: '天枢', rec: 1, bgm: 'road',
    intro: 'c1_intro', ending: 'c1_end',
    nodes: [
      f('c1a', 1, ['vine'], { before: 'c1_first_step' }),
      f('c1b', 2, ['vine', 'floral'], { before: 'c1_ruo', after: 'c1_ruo_join' }),
      evt('c1c', 'well'),
      f('c1d', 3, ['xiao', 'vine']),
      chest('c1e', 3000, { dust: 100, items: { pill: 2, seal: 2 } }),
      e('c1f', 5, ['xiaoKing', 'floral']),
      f('c1g', 5, ['floral', 'xiao', 'vine']),
      boss('c1h', 6, ['vineMother'], 500, { before: 'c1_boss', after: 'c1_after' }),
    ],
  },
  {
    id: 'c2', name: '炎陵', dir: '南', season: '夏', theme: 'summer', star: '天璇', rec: 7, bgm: 'road',
    intro: 'c2_intro', ending: 'c2_end',
    nodes: [
      f('c2a', 7, ['firerat', 'firerat']),
      f('c2b', 8, ['firerat', 'bifang'], { after: 'c2_mother' }),
      evt('c2c', 'noon'),
      f('c2d', 9, ['wisp', 'bifang']),
      chest('c2e', 15000, { dust: 200, items: { ether: 2, seal: 2 } }),
      e('c2f', 11, ['bifang2', 'wisp']),
      f('c2g', 11, ['wisp', 'firerat', 'bifang'], { before: 'c2_pei' }),
      boss('c2h', 13, ['crow'], 1000, { before: 'c2_boss', after: 'c2_after' }),
    ],
  },
  {
    id: 'c3', name: '九陌古道', dir: '中', season: '季夏', theme: 'loess', star: '天玑', rec: 14, bgm: 'road',
    intro: 'c3_intro', ending: 'c3_end',
    nodes: [
      f('c3a', 14, ['clay', 'clay']),
      f('c3b', 15, ['worm', 'clay']),
      evt('c3c', 'march'),
      f('c3d', 16, ['ram', 'worm'], { after: 'c3_maker' }),
      chest('c3e', 40000, { dust: 300, items: { incense: 1, seal: 3 } }),
      e('c3f', 18, ['clay2', 'clay']),
      f('c3g', 18, ['clay', 'ram', 'worm']),
      boss('c3h', 20, ['general'], 1800, { before: 'c3_boss', after: 'c3_after' }),
    ],
  },
  {
    id: 'c4', name: '白帝关', dir: '西', season: '秋', theme: 'autumn', star: '天权', rec: 21, bgm: 'road',
    intro: 'c4_intro', ending: 'c4_end',
    nodes: [
      f('c4a', 21, ['scorpion', 'cicada']),
      f('c4b', 22, ['blade', 'cicada']),
      evt('c4c', 'prisoner'),
      f('c4d', 24, ['scorpion', 'blade'], { before: 'c4_ruo_fade' }),
      chest('c4e', 80000, { dust: 400, items: { incense: 2, ether: 3 } }),
      e('c4f', 26, ['blade2', 'cicada']),
      f('c4g', 26, ['blade', 'scorpion', 'cicada'], { after: 'c4_truth' }),
      boss('c4h', 28, ['tiger'], 2800, { before: 'c4_boss', after: 'c4_after' }),
    ],
  },
  {
    id: 'c5', name: '玄冥渊', dir: '北', season: '冬', theme: 'winter', star: '玉衡', rec: 29, bgm: 'road',
    intro: 'c5_intro', ending: 'c5_end',
    nodes: [
      f('c5a', 29, ['grub', 'grub']),
      f('c5b', 30, ['merfolk', 'grub']),
      evt('c5c', 'buried'),
      f('c5d', 32, ['serpent', 'merfolk']),
      chest('c5e', 120000, { dust: 500, items: { incense: 2, seal: 4 } }),
      e('c5f', 34, ['merfolk2', 'serpent'], { after: 'c5_coffin' }),
      f('c5g', 34, ['serpent', 'merfolk', 'grub']),
      boss('c5h', 36, ['frostDragon'], 3800, { before: 'c5_boss', after: 'c5_after' }),
    ],
  },
  {
    id: 'c6', name: '北辰台', dir: '天', season: '无时', theme: 'void', star: '开阳', rec: 37, bgm: 'road',
    intro: 'c6_intro', ending: null,
    nodes: [
      f('c6a', 37, ['puppet', 'shade']),
      f('c6b', 38, ['shade', 'puppet']),
      evt('c6c', 'mirror'),
      e('c6d', 40, ['shade2', 'puppet']),
      chest('c6e', 160000, { dust: 600, items: { incense: 3, ether: 3 } }),
      f('c6f', 41, ['puppet', 'shade', 'puppet']),
      boss('c6g', 43, ['pei1'], 5000, { before: 'c6_boss1', after: 'c6_mid' }),
      boss('c6h', 45, ['pei2'], 0, { before: 'c6_boss2', after: 'final' }),
    ],
  },
];

const NODE_INDEX = {};
CHAPTERS.forEach((c, ci) => c.nodes.forEach((n, ni) => { NODE_INDEX[n.id] = { chapter: c, ci, ni, node: n }; }));

const STAR_NAMES = ['天枢', '天璇', '天玑', '天权', '玉衡', '开阳', '摇光'];

module.exports = { CHAPTERS, NODE_INDEX, STAR_NAMES };
