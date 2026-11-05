// The Sky Stair: an endless climb of hand-played or auto battles, with a first-clear reward on each step.
// It costs nothing to try, and it is the main way to earn Stardust without walking.
const G = require('../data/game.js');
const E = require('./economy.js');
const Idle = require('./idle.js');
const { CHAPTERS } = require('../data/chapters.js');

function regionOf(floor) {
  return Math.floor((floor - 1) / 10) % CHAPTERS.length;
}

function floorSpec(floor) {
  const ci = regionOf(floor);
  const lv = 2 + floor;
  if (floor % 10 === 0) {
    const bossNode = CHAPTERS[ci].nodes.filter((n) => n.type === 'boss').pop();
    return { lv, foes: [bossNode.foes[0]], ci, kind: 'boss' };
  }
  const pool = Idle.poolFor(ci);
  const normal = pool.filter((id) => !G.MONSTERS[id].elite);
  const elite = pool.filter((id) => G.MONSTERS[id].elite);
  const at = (list, k) => list[(floor * 7 + k) % list.length];
  if (floor % 5 === 0) return { lv, foes: [at(elite, 0), at(normal, 1)], ci, kind: 'elite' };
  const n = floor > 12 ? 3 : 2;
  const foes = [];
  for (let i = 0; i < n; i++) foes.push(at(normal, i));
  return { lv, foes, ci, kind: 'fight' };
}

function reward(floor) {
  const spec = floorSpec(floor);
  const r = {
    dust: 15 + floor,
    coin: Math.round(G.coinPerMin(spec.lv) * 15),
    xp: Math.round(G.xpPerMin(spec.lv) * 15),
    items: {},
    spirits: [],
    tickets: 0,
  };
  if (floor % 5 === 0) {
    r.items.seal = 2;
    r.items.pill = 2;
    r.tickets = 1;
  }
  if (floor % 10 === 0) {
    r.dust += 60;
    r.items.incense = 1;
    r.tickets = 3;
    const pool = Idle.poolFor(spec.ci).filter((id) => G.MONSTERS[id].elite);
    r.spirits = [pool[0], pool[0]];
  }
  return r;
}

// Rewards only pay the first time a floor is cleared.
function win(s, floor) {
  if (floor !== s.tower.best + 1) return null;
  s.tower.best = floor;
  const r = reward(floor);
  E.addDust(s, r.dust);
  E.addCoin(s, r.coin);
  E.addItems(s, r.items);
  E.addSpirits(s, r.spirits);
  s.gacha.tickets += r.tickets;
  return { reward: r, ups: E.shareXp(s, r.xp) };
}

module.exports = { floorSpec, reward, win, regionOf };
