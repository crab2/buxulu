// Walking into a road stop by hand: story first, then the fight or the event. Used by the road screen
// and the region map alike, so both behave the same.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const audio = require('../core/audio.js');
const store = require('../systems/store.js');
const E = require('../systems/economy.js');
const Idle = require('../systems/idle.js');
const { NODE_INDEX } = require('../data/chapters.js');
const O = require('./overlays.js');

function startEvent(node, ci, focus, back, from) {
  const s = store.get();
  O.runEvent(node.key, () => {
    E.clearNode(s, node.id);
    store.persist();
    if (back) back();
  }, (fight, win) => {
    game.go('battle', { fight, chapter: ci, focus, from, eventWin: true, resume: { key: node.key, node: node.id, win } });
  });
}

// Plays a node from wherever the player tapped it.
function enter(nodeId, opts) {
  opts = opts || {};
  const s = store.get();
  const { node, ci, ni } = NODE_INDEX[nodeId];
  const focus = opts.focus === undefined ? ni : opts.focus;
  if (node.type === 'event') return startEvent(node, ci, focus, opts.back, opts.from);
  if (node.type === 'chest') return null;
  O.story(node.before, () => {
    if (node.id === 'c1b') {
      // A Ruo steps in at the start of this fight, then formally joins afterwards.
      E.joinHero(s, 'ruo');
      store.persist();
    }
    if (node.id === 'c6h' && s.progress.cleared.c6h) {
      // The ending can be chosen again without refighting the final boss.
      return game.go('ending', { replayChoice: true });
    }
    game.go('battle', { node, chapter: ci, focus, from: opts.from || 'road' });
  });
  return null;
}

// A chest found on the map. Footpower comes from real steps and time on the road alike.
function openChest(nodeId, done) {
  const s = store.get();
  const { node } = NODE_INDEX[nodeId];
  if (s.progress.cleared[nodeId]) return ui.toast('这里已经搜过了');
  const foot = Idle.footpower(s);
  if (foot < node.needFoot) {
    O.modal({
      title: '脚力不足',
      text: `这条岔路太险,需要 ${ui.fmt(node.needFoot)} 脚力才能攀上去。你现在有 ${ui.fmt(foot)} 脚力。队伍每走一程都在攒脚力,真实走路会攒得更快。`,
    });
    return null;
  }
  Idle.claimChests(s);
  store.persist();
  audio.sfx('win');
  O.modal({ title: '脚力宝箱', text: '你爬上险坡,找到了前人留下的行囊。东西已经放进行囊了。', rows: O.rewardRows(node.reward), buttons: [{ label: '收下', kind: 'primary', onTap: done }] });
  return null;
}

module.exports = { enter, openChest };
