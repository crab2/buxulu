// 一键打理: one tap at the station takes in everything that has finished there. Replies from the couriers,
// ripe crops and finished relics are collected, and each picked plot is sown again with what grew in it, so
// a garden that was laid out with care keeps its neighbours.
const E = require('./economy.js');
const Dispatch = require('./dispatch.js');
const Garden = require('./garden.js');

function pending(s, now) {
  let n = 0;
  if (E.unlocked(s, 'dispatch')) n += Dispatch.ready(s, now);
  if (E.unlocked(s, 'garden')) n += Garden.ripeCount(s, now);
  n += s.furnace.jobs.filter((j) => j.doneAt <= now).length;
  return n;
}

function tidy(s, now, rng) {
  const out = { n: 0, mail: null, herbs: {}, crops: 0, resown: 0, relics: [] };
  if (E.unlocked(s, 'dispatch')) {
    const r = Dispatch.claimAll(s, now, rng);
    if (r.n) {
      out.mail = r;
      out.n += r.n;
      Dispatch.refill(s, now, rng);
    }
  }
  if (E.unlocked(s, 'garden')) {
    const ripe = [];
    s.garden.plots.forEach((p, i) => { if (p && p.doneAt <= now) ripe.push({ i, el: p.el }); });
    const r = Garden.harvest(s, now);
    out.herbs = r.gained;
    out.crops = r.n;
    out.n += r.n;
    ripe.forEach((p) => { if (Garden.plant(s, p.i, p.el, now)) out.resown++; });
  }
  out.relics = E.collectRefined(s, now);
  out.n += out.relics.length;
  return out;
}

module.exports = { pending, tidy };
