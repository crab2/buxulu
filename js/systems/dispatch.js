// Courier errands. Hired hands carry letters on timers that keep running while the game is closed, so
// the choice is simply which errand suits which courier, and when the player expects to be back.
const G = require('../data/game.js');
const W = require('../data/world.js');
const E = require('./economy.js');
const Idle = require('./idle.js');
const Boosts = require('./boosts.js');

const BOARD_SIZE = 4;
const JOB_EVERY_MS = 90 * 60000;

function slots(s) {
  const done = E.chaptersDone(s);
  return 1 + (done >= 1 ? 1 : 0) + (done >= 3 ? 1 : 0);
}

function roster(s) {
  const done = E.chaptersDone(s);
  return W.COURIERS.filter((c) => c.after <= done);
}

function busy(s, courierId) {
  return s.dispatch.active.some((a) => a.courier === courierId);
}

function newJob(s, rng) {
  const r = rng || Math.random;
  const ci = Math.min(s.progress.chapter, W.JOBS.length - 1);
  const list = W.JOBS[ci];
  const t = Math.floor(r() * list.length);
  const len = W.JOB_LENGTHS[Math.floor(r() * W.JOB_LENGTHS.length)];
  s.dispatch.seq++;
  return { id: 'j' + s.dispatch.seq, ci, t, title: list[t].title, el: list[t].el, mins: len.mins, label: len.label };
}

// The board keeps a few errands open, and adds another now and then until it is full.
function refill(s, now, rng) {
  const d = s.dispatch;
  if (!d.nextJob) d.nextJob = now;
  while (d.board.length < BOARD_SIZE && now >= d.nextJob) {
    d.board.push(newJob(s, rng));
    d.nextJob = d.board.length < 3 ? now : d.nextJob + JOB_EVERY_MS;
    if (d.nextJob < now - JOB_EVERY_MS * BOARD_SIZE) d.nextJob = now;
  }
}

function matches(courier, job) {
  return courier.el === job.el || G.GENERATES[courier.el] === job.el;
}

function durationMins(job, courier) {
  const k = courier.trait === 'swift' ? 0.85 : courier.trait === 'tireless' ? 0.75 : 1;
  return Math.round(job.mins * k);
}

// What this courier would bring back. Shown before sending, so the choice is an informed one.
function preview(s, job, courier) {
  const lv = Idle.stageLevel(s);
  const match = matches(courier, job);
  let k = (match ? 1.3 : 1) * (courier.trait === 'steady' ? 1.15 : 1);
  const coinK = courier.trait === 'greedy' ? 1.3 : 1;
  const reward = {
    coin: Math.round(G.coinPerMin(lv) * job.mins * 0.5 * k * coinK),
    xp: Math.round(G.xpPerMin(lv) * job.mins * 0.25 * k),
    herbs: {},
    items: {},
    dust: job.mins >= 480 ? 40 : job.mins >= 240 ? 15 : job.mins >= 120 ? 5 : 0,
    spirits: job.mins >= 240 ? 1 : 0,
  };
  const herbs = Math.floor(job.mins / 60) + (courier.trait === 'herbal' ? 2 : 0);
  if (herbs > 0) reward.herbs[job.el] = herbs;
  if (job.mins >= 120) reward.items.seal = 1;
  reward.bonus = (courier.trait === 'lucky' ? 0.5 : 0.25);
  return { reward, match, mins: durationMins(job, courier) };
}

function send(s, jobId, courierId, now) {
  const d = s.dispatch;
  if (d.active.length >= slots(s)) return false;
  const courier = roster(s).find((c) => c.id === courierId);
  if (!courier || busy(s, courierId)) return false;
  const i = d.board.findIndex((j) => j.id === jobId);
  if (i < 0) return false;
  const job = d.board[i];
  const { reward, mins } = preview(s, job, courier);
  d.board.splice(i, 1);
  d.active.push({ title: job.title, ci: job.ci, el: job.el, mins, courier: courierId, startedAt: now, doneAt: now + mins * 60000, reward });
  return true;
}

function ready(s, now) {
  return s.dispatch.active.filter((a) => a.doneAt <= now).length;
}

function nextLetter(s) {
  const done = E.chaptersDone(s);
  const i = W.LETTERS.findIndex((l, k) => s.letters.got.indexOf(k) < 0 && l.after <= done && (!l.ending || s.progress.ending));
  return i;
}

// Hands in every finished errand. Every second one brings a letter, while there are letters left.
function claimAll(s, now, rng) {
  const r = rng || Math.random;
  const d = s.dispatch;
  const out = { n: 0, coin: 0, xp: 0, dust: 0, herbs: {}, items: {}, spirits: [], letters: [], ups: [] };
  d.active = d.active.filter((a) => {
    if (a.doneAt > now) return true;
    const rw = a.reward;
    out.n++;
    out.coin += rw.coin;
    out.xp += rw.xp;
    out.dust += rw.dust;
    Object.keys(rw.herbs).forEach((k) => { out.herbs[k] = (out.herbs[k] || 0) + rw.herbs[k]; });
    Object.keys(rw.items).forEach((k) => { out.items[k] = (out.items[k] || 0) + rw.items[k]; });
    for (let i = 0; i < rw.spirits; i++) {
      const pool = Idle.poolFor(Math.min(a.ci, s.progress.chapter));
      out.spirits.push(pool[Math.floor(r() * pool.length)]);
    }
    if (r() < rw.bonus) {
      const k = ['pill', 'ether', 'seal'][Math.floor(r() * 3)];
      out.items[k] = (out.items[k] || 0) + 1;
    }
    d.done++;
    if (d.done % 2 === 0) {
      const l = nextLetter(s);
      if (l >= 0) {
        s.letters.got.push(l);
        s.letters.unread++;
        out.letters.push(l);
      }
    }
    return false;
  });
  if (!out.n) return out;
  E.addCoin(s, out.coin);
  E.addDust(s, out.dust);
  E.addHerbs(s, out.herbs);
  E.addItems(s, out.items);
  E.addSpirits(s, out.spirits);
  out.ups = E.shareXp(s, out.xp);
  return out;
}

function rush(s, index, now) {
  const a = s.dispatch.active[index];
  if (!a || a.doneAt <= now) return false;
  if (!E.spendDust(s, Boosts.rushCost(a.doneAt - now))) return false;
  a.doneAt = now;
  return true;
}

module.exports = { slots, roster, busy, refill, preview, send, ready, claimAll, rush, matches, BOARD_SIZE };
