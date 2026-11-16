// 七日签到: a gift for each day the player comes by, seven in a round, with the best one last. A missed day
// costs nothing: the round waits where it was, so the seventh gift is seven visits away however they fall.
const G = require('../data/game.js');
const E = require('./economy.js');
const Idle = require('./idle.js');

// mins: minutes of road income, at wherever the party has got to.
const DAYS = [
  { dust: 50 },
  { mins: 30 },
  { tickets: 1 },
  { dust: 80 },
  { items: { pill: 2, ether: 1 } },
  { tickets: 2 },
  { dust: 200, tickets: 3, items: { incense: 1 } },
];
const NO_LETTER_DUST = 40; // What a star letter turns into before the draw has opened.

function ensure(s) {
  if (!s.signin) s.signin = { day: 0, n: 0 };
  return s.signin;
}

// A clock moved backwards cannot sign in a second time for a day already taken.
function ready(s, day) {
  return day > ensure(s).day;
}

// Which of the seven comes next.
function slot(s) {
  return ensure(s).n % DAYS.length;
}

// What a day's gift comes to for this save, right now.
function reward(s, i) {
  const d = DAYS[i];
  const out = { coin: 0, dust: d.dust || 0, tickets: d.tickets || 0, items: d.items || {} };
  if (d.mins) out.coin = Math.round((G.coinPerMin(Idle.stageLevel(s)) * d.mins) / 10) * 10;
  if (out.tickets && !E.unlocked(s, 'gacha')) {
    out.dust += out.tickets * NO_LETTER_DUST;
    out.tickets = 0;
  }
  return out;
}

function claim(s, day) {
  if (!ready(s, day)) return null;
  const st = ensure(s);
  const i = slot(s);
  const r = reward(s, i);
  E.addCoin(s, r.coin);
  E.addDust(s, r.dust);
  E.addItems(s, r.items);
  s.gacha.tickets += r.tickets;
  st.day = day;
  st.n++;
  return Object.assign({ slot: i }, r);
}

module.exports = { DAYS, ensure, ready, slot, reward, claim };
