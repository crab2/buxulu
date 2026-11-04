#!/usr/bin/env node
// Plays the whole game with simulated people at several activity levels, using the real rules and real
// simulated battles, to check that the campaign can be finished, that difficulty rises smoothly and,
// above all, that walking enhances the game without ever being needed.
const G = require('../js/data/game.js');
const W = require('../js/data/world.js');
const E = require('../js/systems/economy.js');
const P = require('../js/systems/party.js');
const Idle = require('../js/systems/idle.js');
const Boosts = require('../js/systems/boosts.js');
const Dispatch = require('../js/systems/dispatch.js');
const Garden = require('../js/systems/garden.js');
const Tower = require('../js/systems/tower.js');
const Wander = require('../js/systems/wander.js');
const Daily = require('../js/systems/daily.js');
const L = require('../js/systems/ledger.js');
const { CHAPTERS, FLAT } = require('../js/data/chapters.js');

const HOUR = 3600000;

function mulberry(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Equips the best relic available in each open slot. Attack and survival first.
const RELIC_VALUE = { atkPct: 3, critDmg: 1.5, crit: 2, skillDmg: 2, hpPct: 2, defPct: 2, dmgTaken: 2, regen: 1.5, lifesteal: 1.5, spdPct: 1.5, healPct: 1, mpRegen: 1, mpCost: 1, burnChance: 1 };
function equipBest(s) {
  const score = (r) => (RELIC_VALUE[G.RELICS[r.type].stat] || 1) * (r.rank + 1);
  const sorted = s.relics.slice().sort((a, b) => score(b) - score(a));
  const slots = [];
  P.joined(s).forEach((id) => { slots.push([id, 0], [id, 1]); });
  sorted.slice(0, slots.length).forEach((r, i) => E.equipRelic(s, slots[i][0], slots[i][1], r.uid));
}

function refineWhatYouCan(s, now) {
  E.collectRefined(s, now);
  for (let guard = 0; guard < 4; guard++) {
    if (s.furnace.jobs.length >= E.FURNACE_SLOTS) break;
    const ids = Object.keys(s.spirits).filter((k) => s.spirits[k] > 0).sort((a, b) => G.MONSTERS[b].tier - G.MONSTERS[a].tier);
    let a = null, b = null;
    for (const k of ids) {
      if (!a) a = k;
      if (s.spirits[k] > (k === a ? 1 : 0)) {
        if (k !== a || s.spirits[k] >= 2) { b = k; if (b !== a || s.spirits[a] >= 2) break; }
      }
    }
    if (!a || !b) break;
    const p = E.previewRefine(a, b);
    if (s.coin < p.cost) break;
    if (!E.startRefine(s, a, b, now)) break;
  }
  equipBest(s);
}

// Gets the supplies working: garden, errands, a meal and the dice.
function doActivities(s, now, rng, day, keen) {
  if (E.unlocked(s, 'garden')) {
    Garden.harvest(s, now);
    Daily.mark(s, 'garden', day);
    for (let i = 0; i < Garden.plotCount(s); i++) {
      if (!s.garden.plots[i]) {
        // Long crops overnight, and a generating chain so neighbours help each other.
        Garden.plant(s, i, W.CROP_ORDER[i % W.CROP_ORDER.length], now);
      }
    }
    Garden.water(s, now);
    if (s.idle.mealSecs <= 0) {
      ['meal_xp', 'meal_coin', 'meal_march'].some((id) => Garden.canCook(s, id) && Garden.cook(s, id));
    }
  }
  if (E.unlocked(s, 'dispatch')) {
    Dispatch.claimAll(s, now, rng);
    Dispatch.refill(s, now, rng);
    const free = Dispatch.roster(s).filter((c) => !Dispatch.busy(s, c.id));
    while (s.dispatch.active.length < Dispatch.slots(s) && s.dispatch.board.length && free.length) {
      const c = free.shift();
      const job = s.dispatch.board.slice().sort((a, b) => b.mins - a.mins)[0];
      Dispatch.send(s, job.id, c.id, now);
      Daily.mark(s, 'dispatch', day);
    }
  }
  if (E.unlocked(s, 'wander')) {
    Wander.regen(s, now);
    while (s.wander.rolls > 0) {
      Wander.roll(s, now, rng);
      Daily.mark(s, 'wander', day);
    }
  }
  if (keen && E.unlocked(s, 'tower')) {
    Daily.mark(s, 'tower', day);
    for (let guard = 0; guard < 6; guard++) {
      const spec = Tower.floorSpec(s.tower.best + 1);
      if (!Idle.simulate(s, spec.foes, spec.lv, rng).win) break;
      Tower.win(s, s.tower.best + 1);
    }
  }
}

function claimDailies(s, day) {
  W.DAILY_TASKS.forEach((t) => Daily.claim(s, t.id, day));
  Daily.claimBonus(s, day);
  Daily.claimWalk(s, day);
  E.claimStipend(s, day);
}

// How a walker spends the day's Stardust: mostly on speed, with a share saved for permanent upgrades.
function spendDust(s, now, rng) {
  const order = ['fortune', 'stride', 'pack'];
  for (let guard = 0; guard < 40; guard++) {
    const blessing = order.find((id) => s.blessings[id] < 10 && s.stardust >= Boosts.blessingCost(id, s.blessings[id]) * 1.5);
    if (blessing) { Boosts.buyBlessing(s, blessing); continue; }
    if (s.stardust >= W.BOOSTS.jump.cost && s.idle.hasteSecs >= 2 * 3600) { Boosts.useJump(s, now, rng); continue; }
    if (s.stardust >= W.BOOSTS.haste.cost && Boosts.buyHaste(s)) continue;
    break;
  }
}

/**
 * o.steps     real steps walked per day (0 = WeRun never connected)
 * o.checkins  hours of the day the player opens the game
 * o.active    does the player use the side activities, or only collect and train?
 * o.keen      does the player also climb the tower by hand?
 */
function run(seed, o) {
  const rng = mulberry(seed);
  const realRandom = Math.random;
  Math.random = rng;
  const s = E.defaultSave();
  E.addDust(s, 300);
  const report = CHAPTERS.map((c) => ({ ch: c.name, lv: 0, day: 0, train: 0, power: 0 }));
  const hours = o.checkins || [8, 13, 19, 23];
  const start = Date.UTC(2026, 10, 4, 16, 0, 0); // midnight, Beijing time
  let now = start;
  Idle.sync(s, now);
  let blockedHours = 0, ledger = null;
  let minutesPlayed = 0;
  const maxDays = o.maxDays || 240;
  let dayN = 0, finished = false, doneAt = 0;
  outer: for (dayN = 1; dayN <= maxDays; dayN++) {
    const dayStart = start + (dayN - 1) * 24 * HOUR;
    const day = Idle.dayOf(dayStart + 8 * HOUR);
    for (const hour of hours) {
      now = dayStart + hour * HOUR;
      Idle.sync(s, now, rng);
      minutesPlayed += 3;
      if (Idle.status(s).kind === 'blocked') blockedHours += 1;
      // Real steps arrive through the actual ledger, the way the cloud function pays them.
      if (o.steps) {
        const walkedSoFar = Math.round(o.steps * Math.min(1, hour / 22));
        const list = [{ timestamp: Math.floor(dayStart / 1000), step: walkedSoFar }];
        const r = L.exchange(ledger, list, Math.floor(now / 1000));
        ledger = r.ledger;
        E.applyGrants(s, r.pending);
        ledger = L.ack(ledger, r.pending.map((g) => g.id));
        s.steps.lastView = r.view;
      }
      Idle.collect(s);
      Daily.mark(s, 'collect', day);
      // Relics first: a share of the coins goes to the furnace, then the rest to training.
      refineWhatYouCan(s, now);
      E.autoTrain(s);
      Daily.mark(s, 'train', day);
      if (o.active) doActivities(s, now, rng, day, o.keen);
      claimDailies(s, day);
      spendDust(s, now, rng);
      Idle.collect(s);
      E.autoTrain(s);
      // Fights the party stopped for, played on auto, a few tries per visit.
      for (let guard = 0; guard < 12; guard++) {
        const st = Idle.status(s);
        if (st.kind !== 'hold' && st.kind !== 'blocked') break;
        const node = st.node;
        if (node.type === 'event') { E.clearNode(s, node.id); continue; }
        if (node.id === 'c1b') E.joinHero(s, 'ruo');
        let won = false;
        for (let t = 0; t < 3 && !won; t++) {
          const r = Idle.simulate(s, node.foes, node.lv, rng);
          if (r.win) {
            won = true;
            E.battleRewards(s, r.enemies, node.id);
            E.clearNode(s, node.id);
            if (node.id === 'c1h') E.joinHero(s, 'zhuo');
            s.idle.blocked = null;
          }
        }
        if (!won) break;
        // The player stays a little while, so short walks to the next stop can finish during the visit.
        now += 150000;
        Idle.sync(s, now, rng);
        const ci = FLAT.find((f) => f.node === node).ci;
        const lastOfChapter = CHAPTERS[ci].nodes[CHAPTERS[ci].nodes.length - 1] === node;
        if (lastOfChapter) {
          report[ci].lv = s.heroes.cen.lv;
          report[ci].day = dayN - 1 + hour / 24;
          report[ci].train = Math.round(P.joined(s).reduce((a, id) => a + s.heroes[id].train.atk, 0) / P.joined(s).length);
          report[ci].power = Math.round(P.power(s));
        }
        if (Idle.campaignDone(s)) {
          finished = true;
          doneAt = dayN - 1 + hour / 24;
          break outer;
        }
      }
      Idle.nudge(s);
    }
  }
  Math.random = realRandom;
  return { report, finished, days: doneAt || maxDays, blockedHours, s, minutesPlayed };
}

const PROFILES = {
  none: { label: 'never connects WeRun, only collects and trains', steps: 0 },
  onceADay: { label: 'never connects WeRun, opens the game once a day', steps: 0, active: true, keen: true, checkins: [21] },
  noneActive: { label: 'never connects WeRun, plays the activities', steps: 0, active: true, keen: true },
  casual: { label: 'casual walker 4,000/day, plays the activities', steps: 4000, active: true, keen: true },
  typical: { label: 'typical walker 7,000/day, plays the activities', steps: 7000, active: true, keen: true },
  keen: { label: 'keen walker 12,000/day, plays the activities', steps: 12000, active: true, keen: true },
  ultra: { label: 'very keen walker 20,000/day, plays the activities', steps: 20000, active: true, keen: true },
};

if (require.main === module) {
  Object.keys(PROFILES).forEach((k) => {
    const p = PROFILES[k];
    const runs = [];
    for (let i = 1; i <= 8; i++) runs.push(run(i * 7919, p));
    const avg = (f) => Math.round((runs.reduce((a, r) => a + f(r), 0) / runs.length) * 10) / 10;
    console.log(`\n== ${p.label}: finished ${runs.filter((r) => r.finished).length}/8 in ${avg((r) => r.days)} days`);
    CHAPTERS.forEach((c, i) => {
      const boss = c.nodes[c.nodes.length - 1];
      console.log(`  ${c.name.padEnd(5, '　')} boss Lv${String(boss.lv).padEnd(3)} party Lv${String(avg((r) => r.report[i].lv)).padEnd(5)} attack tier ${String(avg((r) => r.report[i].train)).padEnd(5)} power ${String(avg((r) => r.report[i].power)).padEnd(7)} done day ${avg((r) => r.report[i].day)}`);
    });
    console.log(`  tower floor ${avg((r) => r.s.tower.best)}, blessings ${avg((r) => r.s.blessings.fortune + r.s.blessings.stride + r.s.blessings.pack)}, relics ${avg((r) => r.s.relics.length)}, letters ${avg((r) => r.s.letters.got.length)}`);
  });
}

module.exports = { run, PROFILES };
