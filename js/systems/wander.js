// A dice walk around a loop of roadside stops. Free rolls come back with time, and real steps add more.
// Payouts are worth a few minutes of road income, so they stay useful at every stage of the game.
const G = require('../data/game.js');
const W = require('../data/world.js');
const E = require('./economy.js');
const Idle = require('./idle.js');

const FREE_CAP = 3;
const REGEN_MS = 4 * 3600000;
const TILE_MINS = 12;
const LAP_DUST = 100;

// Free rolls refill up to a small cap. Rolls earned from steps or Stardust can stack above it.
function regen(s, now) {
  const w = s.wander;
  if (!w.regen) w.regen = now + REGEN_MS;
  while (now >= w.regen) {
    if (w.rolls < FREE_CAP) w.rolls++;
    w.regen += REGEN_MS;
  }
  return w.rolls;
}

function land(s, tile, rng) {
  const r = rng || Math.random;
  const lv = Idle.stageLevel(s);
  const k = s.wander.bonus && tile !== 'shrine' ? 2 : 1;
  if (tile !== 'shrine') s.wander.bonus = false;
  const out = { tile };
  switch (tile) {
    case 'coin':
      out.coin = Math.round(G.coinPerMin(lv) * TILE_MINS * k);
      E.addCoin(s, out.coin);
      break;
    case 'xp':
      out.xp = Math.round(G.xpPerMin(lv) * TILE_MINS * k);
      out.ups = E.shareXp(s, out.xp);
      break;
    case 'herb': {
      const el = W.CROP_ORDER[Math.floor(r() * W.CROP_ORDER.length)];
      out.herbs = { [el]: 3 * k };
      E.addHerbs(s, out.herbs);
      break;
    }
    case 'spirit': {
      const pool = Idle.poolFor(Math.min(s.progress.chapter, 5));
      out.spirits = [];
      for (let i = 0; i < k; i++) out.spirits.push(pool[Math.floor(r() * pool.length)]);
      E.addSpirits(s, out.spirits);
      break;
    }
    case 'item': {
      const id = ['pill', 'ether', 'seal'][Math.floor(r() * 3)];
      out.items = { [id]: 2 * k };
      E.addItems(s, out.items);
      break;
    }
    case 'dust':
      out.dust = (20 + Math.floor(r() * 21)) * k;
      E.addDust(s, out.dust);
      break;
    case 'wind':
      out.haste = 600 * k;
      s.idle.hasteSecs += out.haste;
      break;
    case 'inn':
      out.rolls = k;
      s.wander.rolls += k;
      break;
    case 'shrine':
      s.wander.bonus = true;
      break;
    default:
  }
  return out;
}

function roll(s, now, rng) {
  const r = rng || Math.random;
  regen(s, now);
  const w = s.wander;
  if (w.rolls <= 0) return null;
  w.rolls--;
  const die = 1 + Math.floor(r() * 6);
  const from = w.pos;
  let to = from + die;
  let tile = W.BOARD[to % W.BOARD.length];
  let forked = false;
  if (tile === 'fork') {
    to += 3;
    forked = true;
    tile = W.BOARD[to % W.BOARD.length];
    if (tile === 'fork') tile = 'coin';
  }
  const lapped = to >= W.BOARD.length;
  w.pos = to % W.BOARD.length;
  if (lapped) {
    w.laps++;
    E.addDust(s, LAP_DUST);
  }
  const out = land(s, tile, r);
  out.die = die;
  out.from = from;
  out.to = w.pos;
  out.forked = forked;
  out.lapped = lapped;
  out.line = W.WANDER_LINES[Math.floor(r() * W.WANDER_LINES.length)];
  return out;
}

module.exports = { regen, roll, FREE_CAP, REGEN_MS, LAP_DUST, TILE_MINS };
