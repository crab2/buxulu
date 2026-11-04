#!/usr/bin/env node
// Plays the whole campaign with the same logic as the Auto button, to check that the game can be
// finished and that difficulty rises smoothly. Prints win rates per boss and per chapter pace.
const { Battle } = require('../js/systems/battle.js');
const P = require('../js/systems/party.js');
const E = require('../js/systems/economy.js');
const D = require('../js/data/game.js');
const { CHAPTERS } = require('../js/data/chapters.js');

function fight(save, node, rng) {
  const enemies = node.foes.map((id, i) => P.enemyUnit(id, node.lv, i));
  const b = new Battle({ heroes: P.partyUnits(save), enemies, stars: save.progress.stars, items: save.items, rng });
  let guard = 0;
  while (!b.outcome && guard++ < 600) {
    const t = b.next();
    if (t.skip) continue;
    if (t.actor.side === 'enemy') b.performEnemy(t.actor, b.enemyAction(t.actor));
    else b.perform(t.actor, b.autoAction(t.actor));
  }
  return { outcome: b.outcome || 'timeout', turns: b.turns, enemies, heroes: b.heroes };
}

// Spends currency the way an attentive player would. The next star comes first, then the cheapest upgrade.
function spendAll(save, reserve) {
  for (;;) {
    let best = null;
    P.joined(save).forEach((id) => {
      ['atk', 'def', 'hp'].forEach((k) => {
        const lv = save.heroes[id].train[k];
        if (lv < D.TRAIN_MAX && (!best || D.trainCost(lv) < best.c)) best = { id, k, c: D.trainCost(lv) };
      });
    });
    if (!best || save.stardust - best.c < reserve) break;
    E.train(save, best.id, best.k);
  }
  while (save.items.pill < 5 && save.stardust >= 30 + reserve) E.buyItem(save, 'pill');
  while (save.items.incense < 1 && save.stardust >= 120 + reserve) E.buyItem(save, 'incense');
}

function dayIncome(steps) {
  let d = Math.floor(Math.min(steps, 30000) / 10) + E.STIPEND;
  if (steps >= 6000) d += 60;
  if (steps >= 10000) d += 150;
  return d;
}

// One simulated player: walks each morning, then plays up to BATTLES_PER_DAY battles.
function run(seed, dailySteps, battlesPerDay) {
  let x = seed;
  const rng = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  const realRandom = Math.random;
  Math.random = rng;
  const save = E.defaultSave();
  E.addDust(save, 300);
  const flat = [];
  CHAPTERS.forEach((c, ci) => c.nodes.forEach((n) => flat.push({ c, ci, n })));
  let i = 0, days = 0, battles = 0, losses = 0, walked = 0, earnedInBattle = 0, totalSteps = 0;
  const report = CHAPTERS.map((c) => ({ ch: c.name, lv: 0, battles: 0, bossTries: 0, days: 0, doneDay: 0 }));
  const farmTarget = (idx) => {
    for (let k = idx - 1; k >= 0; k--) if (flat[k].n.foes && flat[k].n.type !== 'boss') return flat[k];
    return flat[idx];
  };
  while (i < flat.length && days < 800) {
    days++;
    E.addDust(save, dayIncome(dailySteps));
    walked += dayIncome(dailySteps);
    totalSteps += dailySteps;
    for (let b = 0; b < battlesPerDay && i < flat.length; ) {
      const { c, ci, n } = flat[i];
      const nextCost = (flat.slice(i).find((f) => f.n.type === 'boss' && !E.gateOpen(save, f.n.id)) || { n: { cost: 0 } }).n.cost;
      spendAll(save, nextCost);
      if (n.type === 'chest') { if (totalSteps >= n.needSteps) E.claimChest(save, n.id); i++; continue; }
      if (n.type === 'event') { save.progress.cleared[n.id] = true; i++; continue; }
      if (n.id === 'c1b') E.joinHero(save, 'ruo');
      if (n.type === 'boss' && !E.gateOpen(save, n.id) && !E.lightGate(save, n.id)) {
        // Cannot afford the star yet, so spend the remaining battles levelling up.
        const t = farmTarget(i);
        const r = fight(save, t.n, rng);
        b++; battles++; report[ci].battles++;
        if (r.outcome === 'win') { const d0 = save.stardust; E.battleRewards(save, r.enemies, t.n.id); earnedInBattle += save.stardust - d0; }
        continue;
      }
      const r = fight(save, n, rng);
      b++; battles++; report[ci].battles++;
      if (n.type === 'boss') report[ci].bossTries++;
      if (r.outcome === 'win') {
        const d0 = save.stardust;
        E.battleRewards(save, r.enemies, n.id);
        earnedInBattle += save.stardust - d0;
        E.clearNode(save, n.id);
        if (n.id === 'c1h') E.joinHero(save, 'zhuo');
        i++;
        const last = c.nodes[c.nodes.length - 1] === n;
        report[ci].lv = save.heroes.cen.lv;
        if (last) report[ci].doneDay = days;
      } else {
        losses++;
        const t = farmTarget(i);
        const r2 = fight(save, t.n, rng);
        b++; battles++; report[ci].battles++;
        if (r2.outcome === 'win') { const d0 = save.stardust; E.battleRewards(save, r2.enemies, t.n.id); earnedInBattle += save.stardust - d0; }
      }
    }
  }
  Math.random = realRandom;
  return { report, battles, losses, days, walked, earnedInBattle, finished: i >= flat.length, save };
}

if (require.main === module) {
  const scenarios = [['no WeRun at all, 0/day', 0], ['casual walker, 4000/day', 4000], ['typical walker, 7000/day', 7000], ['keen walker, 12000/day', 12000]];
  scenarios.forEach(([label, steps]) => {
    const runs = [];
    for (let i = 1; i <= 12; i++) runs.push(run(i * 7919, steps, 8));
    const avg = (f) => Math.round((runs.reduce((a, r) => a + f(r), 0) / runs.length) * 10) / 10;
    console.log(`\n== ${label}: finished ${runs.filter((r) => r.finished).length}/12, ${avg((r) => r.days)} days, ${avg((r) => r.battles)} battles, ${avg((r) => r.losses)} losses`);
    CHAPTERS.forEach((c, i) => {
      console.log(`  ${c.name.padEnd(5, '\u3000')} boss Lv${c.nodes[c.nodes.length - 1].lv}  player Lv${avg((r) => r.report[i].lv)}  battles ${avg((r) => r.report[i].battles)}  boss tries ${avg((r) => r.report[i].bossTries)}  done day ${avg((r) => r.report[i].doneDay)}`);
    });
    console.log(`  Stardust: walking+stipend ${avg((r) => r.walked)}, battles ${avg((r) => r.earnedInBattle)}`);
  });
}

module.exports = { run, fight };
