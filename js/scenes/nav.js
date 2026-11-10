// The bottom tab bar shared by the five main screens, with a dot wherever something wants attention.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const clock = require('../core/clock.js');
const store = require('../systems/store.js');
const E = require('../systems/economy.js');
const G = require('../data/game.js');
const Idle = require('../systems/idle.js');
const Dispatch = require('../systems/dispatch.js');
const Garden = require('../systems/garden.js');
const Wander = require('../systems/wander.js');
const Daily = require('../systems/daily.js');
const Quests = require('../systems/quests.js');
const steps = require('../systems/steps.js');
const { UI } = require('../core/palette.js');

const { W, H } = D;
const BAR = 42;
const height = () => BAR + D.safeBottom;

const TABS = [
  { id: 'road', label: '行路', icon: 'boot' },
  { id: 'party', label: '队伍', icon: 'sword' },
  { id: 'station', label: '驿站', icon: 'home' },
  { id: 'trials', label: '历练', icon: 'tower' },
  { id: 'altar', label: '步虚', icon: 'altar' },
];

function cheapestTier(s) {
  let best = Infinity;
  G.HERO_ORDER.forEach((id) => {
    if (!s.heroes[id].joined) return;
    ['atk', 'def', 'hp'].forEach((k) => {
      const lv = s.heroes[id].train[k];
      if (lv < G.TRAIN_MAX) best = Math.min(best, G.trainCost(lv));
    });
  });
  return best;
}

function stationBusy(s, now) {
  if (E.unlocked(s, 'dispatch') && Dispatch.ready(s, now) > 0) return true;
  if (E.unlocked(s, 'garden') && Garden.ripeCount(s, now) > 0) return true;
  if (s.furnace.jobs.some((j) => j.doneAt <= now)) return true;
  return s.letters.unread > 0;
}

function trialsBusy(s, now) {
  const day = Idle.dayOf(now);
  if (Daily.pending(s, day)) return true;
  if (E.unlocked(s, 'gacha') && s.gacha.tickets > 0) return true;
  if (!E.unlocked(s, 'wander')) return false;
  Wander.regen(s, now);
  return s.wander.rolls > 0;
}

function altarBusy(s, now) {
  const view = steps.view();
  if (view && view.canExchange) return true;
  return s.flags.stipendDay !== Idle.dayOf(now);
}

function badges(s, now) {
  return {
    road: Quests.ready(s),
    party: s.coin >= cheapestTier(s) || s.gear.fresh > 0,
    station: stationBusy(s, now),
    trials: trialsBusy(s, now),
    altar: altarBusy(s, now),
  };
}

// Tab changes are instant: this is a menu a player flips through many times in a visit.
function go(id) {
  game.go(id, null, true);
}

function draw(active) {
  const s = store.get();
  const now = clock.now();
  const b = badges(s, now);
  const y = H - height();
  ui.rect(0, y, W, H - y, '#14121f');
  ui.rect(0, y, W, 1, UI.ink);
  ui.rect(0, y + 1, W, 1, UI.line);
  const tw = W / TABS.length;
  TABS.forEach((t, i) => {
    const x = Math.round(i * tw);
    const w = Math.round((i + 1) * tw) - x;
    const on = t.id === active;
    if (on) {
      ui.rect(x, y + 2, w, BAR - 2, '#2a2542');
      ui.rect(x + 2, y + 2, w - 4, 2, UI.lineHi);
    }
    ui.img(art.icon(t.icon), x + Math.round(w / 2) - 8, y + 6);
    ui.text(t.label, x + w / 2, y + 24, on ? UI.gold : UI.dim, { align: 'c' });
    if (b[t.id] && !on) ui.dot(x + Math.round(w / 2) + 8, y + 4);
    ui.hit('nav-' + t.id, x, y, w, H - y, () => { if (!on) go(t.id); }, { sound: on ? null : 'tap' });
  });
}

module.exports = { draw, height, go, TABS, badges };
