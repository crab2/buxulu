// Step-to-Stardust rules. This file runs on the server, and the same copy lives at
// cloudfunctions/stepExchange/ledger.js. tests/run.js fails if the two ever differ.
//
// WeChat reports steps as one running total per day, so the ledger remembers how many steps of
// each day are already exchanged and only ever pays for the difference.

const RATE = 10; // steps per Stardust, today
const BACKFILL_RATE = 20; // steps per Stardust, for days the player did not get to exchange
const BACKFILL_DAYS = 7;
const DAILY_CAP = 30000; // steps per day that can earn currency
const MAX_PLAUSIBLE = 200000; // anything above this in a single day is treated as bad data
const KEEP_DAYS = 40;
const MAX_PENDING = 20;
const STREAK_MIN = 3000;
const STREAK_EVERY = 7;
const STREAK_DUST = 300;

const DAILY_MILESTONES = [
  { steps: 3000, dust: 0, items: { seal: 1 } },
  { steps: 6000, dust: 60, items: { pill: 1 } },
  { steps: 10000, dust: 150, items: { ether: 1, seal: 1 } },
  { steps: 15000, dust: 200, items: { incense: 1 } },
];

const LIFETIME_MILESTONES = [
  { steps: 10000, dust: 200, items: { seal: 2 }, title: '初出驿门' },
  { steps: 50000, dust: 500, items: { pill: 3 }, title: '百里之行' },
  { steps: 100000, dust: 800, items: { incense: 1 }, title: '踏遍东山' },
  { steps: 300000, dust: 1500, items: { seal: 5 }, title: '南渡炎陵' },
  { steps: 600000, dust: 2500, items: { incense: 2 }, title: '九陌行人' },
  { steps: 1000000, dust: 4000, items: { ether: 5 }, title: '西出白帝' },
  { steps: 2000000, dust: 8000, items: { incense: 3 }, title: '北渡玄冥' },
  { steps: 5000000, dust: 20000, items: { incense: 5 }, title: '步虚之人' },
];

// Chinese calendar day. Cloud functions run in UTC, so the +8 offset must be explicit.
function dayKey(ts) {
  return Math.floor((ts + 8 * 3600) / 86400);
}

function emptyLedger() {
  return { days: {}, miles: {}, total: 0, dustTotal: 0, streak: 0, streakDay: 0, life: 0, seq: 0, pending: [] };
}

function normalize(l) {
  const e = emptyLedger();
  if (!l) return e;
  Object.keys(e).forEach((k) => { if (l[k] === undefined) l[k] = e[k]; });
  return l;
}

// Keys the decrypted stepInfoList by day and rejects malformed or impossible values.
function stepsByDay(list) {
  const out = {};
  (Array.isArray(list) ? list : []).forEach((row) => {
    if (!row || !Number.isFinite(row.timestamp) || !Number.isFinite(row.step)) return;
    if (row.step < 0 || row.step > MAX_PLAUSIBLE) return;
    const d = dayKey(row.timestamp);
    out[d] = Math.max(out[d] || 0, Math.floor(row.step));
  });
  return out;
}

function counted(steps) {
  return Math.min(steps || 0, DAILY_CAP);
}

function buildView(l, byDay, now) {
  const today = dayKey(now);
  const steps = byDay[today] || 0;
  const done = l.days['d' + today] || 0;
  const free = Math.max(0, counted(steps) - done);
  const dust = Math.floor(free / RATE);
  let backSteps = 0;
  for (let d = today - BACKFILL_DAYS; d < today; d++) {
    backSteps += Math.max(0, counted(byDay[d]) - (l.days['d' + d] || 0));
  }
  const history = [];
  for (let d = today - 6; d <= today; d++) history.push({ day: d, steps: byDay[d] || 0 });
  const claimed = l.miles['d' + today] || [];
  const reachable = DAILY_MILESTONES.filter((m) => steps >= m.steps && claimed.indexOf(m.steps) < 0);
  const nextLife = LIFETIME_MILESTONES[l.life] || null;
  return {
    today: { day: today, steps, exchanged: done, available: free, dust, cap: DAILY_CAP, capped: steps > DAILY_CAP },
    backfill: { steps: backSteps, dust: Math.floor(backSteps / BACKFILL_RATE) },
    canExchange: dust > 0 || backSteps >= BACKFILL_RATE || reachable.length > 0,
    history,
    total: l.total,
    dustTotal: l.dustTotal,
    streak: l.streakDay >= today - 1 ? l.streak : 0,
    claimedMiles: claimed,
    life: l.life,
    nextLife: nextLife ? { steps: nextLife.steps, title: nextLife.title } : null,
  };
}

function addItems(into, from) {
  Object.keys(from || {}).forEach((k) => { into[k] = (into[k] || 0) + from[k]; });
}

// Converts everything claimable into one grant, recorded as pending until the client confirms it
// reached the save. A dropped response therefore loses nothing and can never pay twice.
function exchange(ledgerIn, list, now) {
  const l = normalize(ledgerIn);
  const byDay = stepsByDay(list);
  const today = dayKey(now);
  const grant = { dust: 0, items: {}, notes: [] };

  const steps = byDay[today] || 0;
  const done = l.days['d' + today] || 0;
  const free = Math.max(0, counted(steps) - done);
  const todayDust = Math.floor(free / RATE);
  if (todayDust > 0) {
    // Only whole multiples are consumed, so the remainder carries into the next exchange.
    const used = todayDust * RATE;
    l.days['d' + today] = done + used;
    l.total += used;
    grant.dust += todayDust;
    grant.notes.push({ kind: 'today', steps: used, dust: todayDust });
  }

  let backSteps = 0;
  for (let d = today - BACKFILL_DAYS; d < today; d++) {
    const rem = Math.max(0, counted(byDay[d]) - (l.days['d' + d] || 0));
    if (rem > 0) {
      backSteps += rem;
      l.days['d' + d] = counted(byDay[d]);
    }
  }
  if (backSteps > 0) {
    const backDust = Math.floor(backSteps / BACKFILL_RATE);
    l.total += backSteps;
    grant.dust += backDust;
    grant.notes.push({ kind: 'backfill', steps: backSteps, dust: backDust });
  }

  const claimed = l.miles['d' + today] || [];
  DAILY_MILESTONES.forEach((m) => {
    if (steps >= m.steps && claimed.indexOf(m.steps) < 0) {
      claimed.push(m.steps);
      grant.dust += m.dust;
      addItems(grant.items, m.items);
      grant.notes.push({ kind: 'daily', steps: m.steps, dust: m.dust });
    }
  });
  l.miles['d' + today] = claimed;

  if (steps >= STREAK_MIN && l.streakDay !== today) {
    l.streak = l.streakDay === today - 1 ? l.streak + 1 : 1;
    l.streakDay = today;
    if (l.streak % STREAK_EVERY === 0) {
      grant.dust += STREAK_DUST;
      grant.notes.push({ kind: 'streak', days: l.streak, dust: STREAK_DUST });
    }
  }

  while (l.life < LIFETIME_MILESTONES.length && l.total >= LIFETIME_MILESTONES[l.life].steps) {
    const m = LIFETIME_MILESTONES[l.life++];
    grant.dust += m.dust;
    addItems(grant.items, m.items);
    grant.notes.push({ kind: 'life', steps: m.steps, dust: m.dust, title: m.title });
  }

  Object.keys(l.days).forEach((k) => { if (Number(k.slice(1)) < today - KEEP_DAYS) delete l.days[k]; });
  Object.keys(l.miles).forEach((k) => { if (Number(k.slice(1)) < today - KEEP_DAYS) delete l.miles[k]; });

  const hasGrant = grant.dust > 0 || Object.keys(grant.items).length > 0 || grant.notes.length > 0;
  if (hasGrant) {
    l.seq += 1;
    grant.id = 'g' + l.seq;
    l.dustTotal += grant.dust;
    l.pending.push(grant);
    while (l.pending.length > MAX_PENDING) {
      const old = l.pending.shift();
      l.pending[0].dust += old.dust;
      addItems(l.pending[0].items, old.items);
    }
  }
  return { ledger: l, grant: hasGrant ? grant : null, view: buildView(l, byDay, now), pending: l.pending };
}

function status(ledgerIn, list, now) {
  const l = normalize(ledgerIn);
  return { view: buildView(l, stepsByDay(list), now), pending: l.pending };
}

function ack(ledgerIn, ids) {
  const l = normalize(ledgerIn);
  const set = new Set(Array.isArray(ids) ? ids : []);
  l.pending = l.pending.filter((g) => !set.has(g.id));
  return l;
}

module.exports = {
  RATE, BACKFILL_RATE, BACKFILL_DAYS, DAILY_CAP, MAX_PLAUSIBLE, STREAK_MIN, STREAK_EVERY, STREAK_DUST,
  DAILY_MILESTONES, LIFETIME_MILESTONES, dayKey, emptyLedger, stepsByDay, exchange, status, ack,
};
