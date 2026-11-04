#!/usr/bin/env node
// Offline test suite: step exchange rules, cloud functions against a fake WeChat backend, combat,
// economy, content integrity, and WeChat runtime compatibility of the source.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const ROOT = path.resolve(__dirname, '..');
const L = require('../js/systems/ledger.js');
const E = require('../js/systems/economy.js');
const G = require('../js/data/game.js');
const P = require('../js/systems/party.js');
const { Battle } = require('../js/systems/battle.js');
const { CHAPTERS } = require('../js/data/chapters.js');
const { STORY, EVENTS } = require('../js/data/story.js');
const { DRAW } = require('../js/art/monsters.js');
const stepService = require('../cloudfunctions/stepExchange/service.js');
const saveService = require('../cloudfunctions/cloudSave/service.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// A moment at 10:00 Beijing time, on a known day.
const NOW = Date.UTC(2026, 10, 4, 2, 0, 0) / 1000;
const TODAY = L.dayKey(NOW);
const midnight = (day) => day * 86400 - 8 * 3600;
const row = (daysAgo, step) => ({ timestamp: midnight(TODAY - daysAgo), step });

// ---- Ledger ----
test('day key follows Beijing time, not the UTC clock of the cloud function', () => {
  const just = Date.UTC(2026, 10, 4, 15, 59, 0) / 1000; // 23:59 Beijing on Nov 4
  const next = Date.UTC(2026, 10, 4, 16, 1, 0) / 1000; // 00:01 Beijing on Nov 5
  assert.strictEqual(L.dayKey(next), L.dayKey(just) + 1);
});

test('steps convert at 10:1 and the remainder carries to the next exchange', () => {
  const r = L.exchange(null, [row(0, 1234)], NOW);
  assert.strictEqual(r.grant.dust, 123);
  assert.strictEqual(r.view.today.exchanged, 1230);
  const r2 = L.exchange(r.ledger, [row(0, 1240)], NOW);
  assert.strictEqual(r2.grant.dust, 1, 'the 4 leftover steps plus 6 new ones make one more');
});

test('the same steps can never be paid twice', () => {
  const r1 = L.exchange(null, [row(0, 5000)], NOW);
  const r2 = L.exchange(r1.ledger, [row(0, 5000)], NOW);
  assert.strictEqual(r2.grant, null);
  assert.strictEqual(r2.view.canExchange, false);
});

test('daily cap limits currency but not the displayed steps', () => {
  const r = L.exchange(null, [row(0, 50000)], NOW);
  const today = r.grant.notes.find((n) => n.kind === 'today');
  assert.strictEqual(today.dust, L.DAILY_CAP / L.RATE);
  assert.strictEqual(r.view.today.steps, 50000);
  assert.strictEqual(r.view.today.capped, true);
});

test('impossible or malformed rows are ignored', () => {
  const r = L.exchange(null, [row(0, 9999999), { timestamp: 'x', step: 5 }, { step: 5 }, null, row(0, -5)], NOW);
  assert.strictEqual(r.grant, null);
});

test('the client clock is irrelevant: future days pay nothing', () => {
  const r = L.exchange(null, [{ timestamp: midnight(TODAY + 1), step: 20000 }], NOW);
  assert.strictEqual(r.grant, null);
});

test('missed days pay half, only for the last 7 days, and only once', () => {
  const list = [row(0, 0), row(1, 4000), row(7, 2000), row(8, 9000)];
  const r = L.exchange(null, list, NOW);
  const back = r.grant.notes.find((n) => n.kind === 'backfill');
  assert.strictEqual(back.steps, 6000, 'day 8 is outside the window');
  assert.strictEqual(back.dust, 300);
  assert.strictEqual(L.exchange(r.ledger, list, NOW).grant, null);
});

test('a day partly exchanged yesterday pays only its remainder as backfill', () => {
  const r1 = L.exchange(null, [row(0, 3000)], NOW);
  // One day later, the player's final count for that day turned out to be 5000.
  const r2 = L.exchange(r1.ledger, [{ timestamp: midnight(TODAY), step: 5000 }], NOW + 86400);
  const back = r2.grant.notes.find((n) => n.kind === 'backfill');
  assert.strictEqual(back.steps, 2000);
});

test('milestones pay once per day and again on a new day', () => {
  const r1 = L.exchange(null, [row(0, 6500)], NOW);
  assert.strictEqual(r1.grant.notes.filter((n) => n.kind === 'daily').length, 2);
  const r2 = L.exchange(r1.ledger, [row(0, 7000)], NOW);
  assert.strictEqual(r2.grant.notes.filter((n) => n.kind === 'daily').length, 0);
  const r3 = L.exchange(r2.ledger, [{ timestamp: midnight(TODAY + 1), step: 3000 }], NOW + 86400);
  assert.strictEqual(r3.grant.notes.filter((n) => n.kind === 'daily').length, 1);
});

test('walking 7 straight days pays the streak bonus on day 7', () => {
  let led = null;
  let bonus = 0;
  for (let i = 0; i < 7; i++) {
    const r = L.exchange(led, [{ timestamp: midnight(TODAY + i), step: 4000 }], NOW + i * 86400);
    led = r.ledger;
    bonus += r.grant.notes.filter((n) => n.kind === 'streak').length;
    assert.strictEqual(r.view.streak, i + 1);
  }
  assert.strictEqual(bonus, 1);
});

test('skipping a day resets the streak', () => {
  const r1 = L.exchange(null, [row(0, 4000)], NOW);
  const r2 = L.exchange(r1.ledger, [{ timestamp: midnight(TODAY + 2), step: 4000 }], NOW + 2 * 86400);
  assert.strictEqual(r2.view.streak, 1);
});

test('lifetime road markers trigger in order and only once', () => {
  // 120,000 steps in one go crosses the 10k, 50k and 100k markers.
  const list = [row(0, 30000), row(1, 30000), row(2, 30000), row(3, 30000)];
  const r = L.exchange(null, list, NOW);
  assert.deepStrictEqual(r.grant.notes.filter((n) => n.kind === 'life').map((n) => n.steps), [10000, 50000, 100000]);
  assert.strictEqual(r.ledger.life, 3);
  assert.strictEqual(L.exchange(r.ledger, list, NOW).grant, null);
});

test('old ledger days are pruned so the document cannot grow forever', () => {
  const led = L.emptyLedger();
  led.days['d' + (TODAY - 100)] = 5;
  led.days['d' + (TODAY - 3)] = 5;
  const r = L.exchange(led, [row(0, 100)], NOW);
  assert.strictEqual(r.ledger.days['d' + (TODAY - 100)], undefined);
  assert.strictEqual(r.ledger.days['d' + (TODAY - 3)], 5);
});

test('a dropped response loses nothing: grants stay pending until acknowledged', () => {
  const r1 = L.exchange(null, [row(0, 1000)], NOW);
  assert.strictEqual(r1.pending.length, 1);
  const r2 = L.status(r1.ledger, [row(0, 1000)], NOW);
  assert.strictEqual(r2.pending[0].id, r1.grant.id);
  const acked = L.ack(r1.ledger, [r1.grant.id]);
  assert.strictEqual(L.status(acked, [row(0, 1000)], NOW).pending.length, 0);
});

test('the save applies each grant exactly once, even when delivered twice', () => {
  const s = E.defaultSave();
  const g = { id: 'g1', dust: 100, items: { seal: 1 }, notes: [{ kind: 'today', steps: 1000, dust: 100 }] };
  const seal0 = s.items.seal;
  assert.strictEqual(E.applyGrants(s, [g]).length, 1);
  assert.strictEqual(E.applyGrants(s, [g]).length, 0);
  assert.strictEqual(s.stardust, 100);
  assert.strictEqual(s.items.seal, seal0 + 1);
  assert.strictEqual(s.steps.total, 1000);
});

test('client and server copies of the rules are identical', () => {
  const a = fs.readFileSync(path.join(ROOT, 'js/systems/ledger.js'), 'utf8');
  const b = fs.readFileSync(path.join(ROOT, 'cloudfunctions/stepExchange/ledger.js'), 'utf8');
  assert.strictEqual(a, b);
});

// ---- Cloud functions, against a fake WeChat backend ----
function fakeCloud(opts) {
  opts = opts || {};
  const docs = {};
  const collections = new Set(opts.collections || ['step_ledger', 'saves']);
  const key = (c, id) => c + '/' + id;
  const col = (c) => ({
    doc: (id) => ({
      async get() {
        if (!collections.has(c)) throw Object.assign(new Error('collection not exists'), { errCode: -502005 });
        const v = docs[key(c, id)];
        return { data: v ? Object.assign({ _id: id }, JSON.parse(JSON.stringify(v))) : null };
      },
      async set({ data }) {
        if (!collections.has(c)) throw Object.assign(new Error('collection not exists'), { errCode: -502005 });
        // The real database rejects a write that contains _id.
        if (data && data._id !== undefined) throw new Error('cannot set _id');
        docs[key(c, id)] = JSON.parse(JSON.stringify(data));
      },
    }),
  });
  const db = {
    collection: col,
    createCollection: async (c) => collections.add(c),
    runTransaction: async (fn) => {
      const snapshot = JSON.stringify(docs);
      try {
        return await fn({ collection: col });
      } catch (e) {
        Object.keys(docs).forEach((k) => delete docs[k]);
        Object.assign(docs, JSON.parse(snapshot));
        throw e;
      }
    },
  };
  const openData = opts.openData || {};
  return {
    docs,
    getWXContext: () => ({ OPENID: 'openid' in opts ? opts.openid : 'user1', APPID: 'wxapp' }),
    database: () => db,
    getOpenData: async ({ list }) => ({ list: list.map((id) => (openData[id] ? { cloudID: id, data: openData[id] } : { cloudID: id, errCode: -1, errMsg: 'invalid' })) }),
  };
}
const goodData = (step) => ({ stepInfoList: [row(0, step)], watermark: { appid: 'wxapp', timestamp: NOW } });

test('cloud: exchange pays from data WeChat returned, not from the client', async () => {
  const cloud = fakeCloud({ openData: { good: goodData(5000) } });
  const r = await stepService.handle(cloud, { action: 'exchange', cloudID: 'good' }, NOW * 1000);
  assert.strictEqual(r.error, undefined);
  assert.strictEqual(r.pending[0].notes.find((n) => n.kind === 'today').dust, 500);
});

test('cloud: step data forged by a tampered client is ignored', async () => {
  const cloud = fakeCloud({ openData: { good: goodData(1000) } });
  const forged = { action: 'exchange', cloudID: 'good', weRunData: { data: { stepInfoList: [row(0, 30000)], watermark: { appid: 'wxapp', timestamp: NOW } } }, stepInfoList: [row(0, 30000)] };
  const r = await stepService.handle(cloud, forged, NOW * 1000);
  assert.strictEqual(r.pending[0].notes.find((n) => n.kind === 'today').dust, 100);
});

test('cloud: a missing, fake or expired cloudID is refused and pays nothing', async () => {
  const cloud = fakeCloud({ openData: {} });
  for (const cloudID of ['nope', undefined, { data: { stepInfoList: [row(0, 30000)] } }]) {
    const r = await stepService.handle(cloud, { action: 'exchange', cloudID }, NOW * 1000);
    assert.ok(r.error, 'should return an error');
    assert.strictEqual(r.pending, undefined);
  }
  assert.deepStrictEqual(cloud.docs, {});
});

test('cloud: data issued to another app, or too old, is refused', async () => {
  const wrong = { stepInfoList: [row(0, 9000)], watermark: { appid: 'wxother', timestamp: NOW } };
  const old = { stepInfoList: [row(0, 9000)], watermark: { appid: 'wxapp', timestamp: NOW - 7200 } };
  const cloud = fakeCloud({ openData: { wrong, old } });
  assert.strictEqual((await stepService.handle(cloud, { action: 'exchange', cloudID: 'wrong' }, NOW * 1000)).error, 'wrong-app');
  assert.strictEqual((await stepService.handle(cloud, { action: 'exchange', cloudID: 'old' }, NOW * 1000)).error, 'stale-data');
});

test('cloud: repeated exchange pays once, and ack clears the pending grant', async () => {
  const cloud = fakeCloud({ openData: { a: goodData(2000) } });
  const r1 = await stepService.handle(cloud, { action: 'exchange', cloudID: 'a' }, NOW * 1000);
  const r2 = await stepService.handle(cloud, { action: 'exchange', cloudID: 'a' }, NOW * 1000);
  assert.strictEqual(r1.pending.length, 1);
  assert.strictEqual(r2.pending.length, 1, 'no second grant is created');
  await stepService.handle(cloud, { action: 'ack', ids: [r1.pending[0].id] }, NOW * 1000);
  const r3 = await stepService.handle(cloud, { action: 'status', cloudID: 'a' }, NOW * 1000);
  assert.strictEqual(r3.pending.length, 0);
});

test('cloud: the status action does not write anything', async () => {
  const cloud = fakeCloud({ openData: { a: goodData(2000) } });
  await stepService.handle(cloud, { action: 'status', cloudID: 'a' }, NOW * 1000);
  assert.deepStrictEqual(cloud.docs, {});
});

test('cloud: the collection is created on first use', async () => {
  const cloud = fakeCloud({ openData: { a: goodData(2000) }, collections: [] });
  const r = await stepService.handle(cloud, { action: 'exchange', cloudID: 'a' }, NOW * 1000);
  assert.strictEqual(r.error, undefined);
  assert.strictEqual(r.pending.length, 1);
});

test('cloud: requests without a verified user are refused', async () => {
  const cloud = fakeCloud({ openid: '', openData: { a: goodData(2000) } });
  assert.strictEqual((await stepService.handle(cloud, { action: 'exchange', cloudID: 'a' }, NOW * 1000)).error, 'no-openid');
});

test('cloud save: round trip, and a stale device cannot overwrite newer progress', async () => {
  const cloud = fakeCloud();
  const t = NOW * 1000;
  assert.strictEqual((await saveService.handle(cloud, { action: 'get' }, t)).blob, null);
  assert.ok((await saveService.handle(cloud, { action: 'put', blob: { v: 1, seq: 10, stardust: 5 } }, t)).ok);
  assert.strictEqual((await saveService.handle(cloud, { action: 'get' }, t)).blob.stardust, 5);
  const stale = await saveService.handle(cloud, { action: 'put', blob: { v: 1, seq: 3, stardust: 999 } }, t);
  assert.strictEqual(stale.error, 'stale');
  assert.strictEqual((await saveService.handle(cloud, { action: 'get' }, t)).blob.stardust, 5);
});

test('cloud save: junk and oversized saves are rejected', async () => {
  const cloud = fakeCloud();
  const t = NOW * 1000;
  assert.strictEqual((await saveService.handle(cloud, { action: 'put', blob: 'x' }, t)).error, 'bad-blob');
  assert.strictEqual((await saveService.handle(cloud, { action: 'put', blob: { seq: 1, pad: 'x'.repeat(300000) } }, t)).error, 'too-large');
});

// ---- Economy ----
test('spending cannot take Stardust below zero', () => {
  const s = E.defaultSave();
  s.stardust = 10;
  assert.strictEqual(E.buyItem(s, 'incense'), false);
  assert.strictEqual(E.train(s, 'cen', 'atk'), false);
  assert.strictEqual(s.stardust, 10);
});

test('training stops at its cap', () => {
  const s = E.defaultSave();
  s.stardust = 1e7;
  for (let i = 0; i < 40; i++) E.train(s, 'cen', 'atk');
  assert.strictEqual(s.heroes.cen.train.atk, G.TRAIN_MAX);
});

test('a star gate is paid once and stays open after losing', () => {
  const s = E.defaultSave();
  s.stardust = 600;
  assert.strictEqual(E.gateOpen(s, 'c1h'), false);
  assert.strictEqual(E.lightGate(s, 'c1h'), true);
  assert.strictEqual(s.stardust, 100);
  assert.strictEqual(E.lightGate(s, 'c1h'), true);
  assert.strictEqual(s.stardust, 100);
  assert.strictEqual(E.gateOpen(s, 'c1h'), true);
});

test('a gate cannot be opened without enough Stardust', () => {
  const s = E.defaultSave();
  s.stardust = 10;
  assert.strictEqual(E.lightGate(s, 'c1h'), false);
  assert.strictEqual(E.gateOpen(s, 'c1h'), false);
  assert.strictEqual(s.stardust, 10);
});

test('station wage can be claimed once per day', () => {
  const s = E.defaultSave();
  assert.strictEqual(E.claimStipend(s, 100), E.STIPEND);
  assert.strictEqual(E.claimStipend(s, 100), 0);
  assert.strictEqual(E.claimStipend(s, 101), E.STIPEND);
});

test('refining consumes both spirits, charges the cost, and records the recipe', () => {
  const s = E.defaultSave();
  s.stardust = 1000;
  s.spirits = { vine: 1, wisp: 1 };
  const it = E.refine(s, 'vine', 'wisp');
  assert.strictEqual(it.type, 'fire_wood');
  assert.deepStrictEqual(s.spirits, {});
  assert.strictEqual(s.stardust, 1000 - G.RANKS[0].cost);
  assert.strictEqual(s.codex.recipes.fire_wood, 0);
});

test('refining the same spirit twice needs two of it', () => {
  const s = E.defaultSave();
  s.stardust = 1000;
  s.spirits = { vine: 1 };
  assert.strictEqual(E.refine(s, 'vine', 'vine'), null);
  assert.strictEqual(s.stardust, 1000);
  s.spirits.vine = 2;
  assert.ok(E.refine(s, 'vine', 'vine'));
});

test('a refine that cannot be paid for keeps the spirits', () => {
  const s = E.defaultSave();
  s.spirits = { vine: 2 };
  assert.strictEqual(E.refine(s, 'vine', 'vine'), null);
  assert.strictEqual(s.spirits.vine, 2);
});

test('every element pair has a relic, and all 15 are distinct', () => {
  const els = Object.keys(G.ELEMENTS);
  const seen = new Set();
  els.forEach((a) => els.forEach((b) => {
    const k = G.relicKey(a, b);
    assert.ok(G.RELICS[k], 'missing relic ' + k);
    seen.add(k);
  }));
  assert.strictEqual(seen.size, 15);
  assert.strictEqual(Object.keys(G.RELICS).length, 15);
});

test('a relic can only be worn by one hero at a time', () => {
  const s = E.defaultSave();
  s.relics = [{ uid: 'r1', type: 'metal_metal', rank: 0 }];
  E.equipRelic(s, 'cen', 0, 'r1');
  E.equipRelic(s, 'ruo', 1, 'r1');
  assert.strictEqual(s.heroes.cen.relics[0], null);
  assert.strictEqual(E.relicOwner(s, 'r1'), 'ruo');
});

test('relics change stats', () => {
  const s = E.defaultSave();
  const base = P.heroStats(s, 'cen').atk;
  s.relics = [{ uid: 'r1', type: 'metal_metal', rank: 2 }];
  E.equipRelic(s, 'cen', 0, 'r1');
  assert.ok(P.heroStats(s, 'cen').atk > base);
});

test('nodes unlock in order, and optional chests never block the road', () => {
  const s = E.defaultSave();
  assert.strictEqual(E.nodeUnlocked(s, 'c1a'), true);
  assert.strictEqual(E.nodeUnlocked(s, 'c1b'), false);
  ['c1a', 'c1b', 'c1c', 'c1d'].forEach((id) => E.clearNode(s, id));
  assert.strictEqual(E.nodeUnlocked(s, 'c1f'), true, 'chest c1e was skipped');
  assert.strictEqual(E.nodeUnlocked(s, 'c2a'), false);
});

test('beating every required node opens the next chapter and lights the star', () => {
  const s = E.defaultSave();
  CHAPTERS[0].nodes.forEach((n) => { if (n.type !== 'chest') E.clearNode(s, n.id); });
  assert.strictEqual(s.progress.chapter, 1);
  assert.strictEqual(s.progress.stars, 1);
});

test('the seventh star lights only when the handle is turned', () => {
  const s = E.defaultSave();
  CHAPTERS.forEach((c) => c.nodes.forEach((n) => { if (n.type !== 'chest') E.clearNode(s, n.id); }));
  assert.strictEqual(E.starsLit(s), 6, 'every boss beaten, no choice made');
  s.progress.ending = 'hold';
  assert.strictEqual(E.starsLit(s), 6, 'letting go leaves the last star dark');
  s.progress.ending = 'turn';
  assert.strictEqual(E.starsLit(s), 7);
});

test('saves from an older version gain new fields without losing progress', () => {
  const old = { v: 1, seq: 9, stardust: 77, heroes: { cen: { lv: 12, xp: 0, joined: true, train: { hp: 1, atk: 2, def: 3, spd: 4 }, relics: [null, null] } }, progress: { chapter: 2, cleared: { c1a: true }, stars: 2 } };
  const s = E.upgrade(old);
  assert.strictEqual(s.stardust, 77);
  assert.strictEqual(s.heroes.cen.lv, 12);
  assert.ok(s.heroes.zhuo && s.settings && s.progress.lit);
});

// ---- Combat ----
function seeded(n) {
  let x = n;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
function miniBattle(lv, foes, items) {
  const s = E.defaultSave();
  ['cen', 'ruo', 'zhuo'].forEach((id) => { s.heroes[id].joined = true; s.heroes[id].lv = lv; });
  s.items = items || s.items;
  return { s, b: new Battle({ heroes: P.partyUnits(s), enemies: foes.map((f, i) => P.enemyUnit(f, lv, i)), stars: 3, items: s.items, rng: seeded(7) }) };
}

test('element cycle is correct in all directions', () => {
  const chain = ['metal', 'wood', 'earth', 'water', 'fire', 'metal'];
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(G.elementMult(chain[i], chain[i + 1]), 1.5);
    assert.strictEqual(G.elementMult(chain[i + 1], chain[i]), 0.7);
  }
  assert.strictEqual(G.elementMult('metal', 'metal'), 1);
});

test('guarding halves damage', () => {
  const { b } = miniBattle(10, ['vine']);
  const t = b.heroes[0], a = b.enemies[0];
  const open = b.damage(a, t, 1, null);
  t.statuses.guard = 1;
  b.rng = seeded(7);
  const r = new Battle({ heroes: [t], enemies: [a], rng: seeded(7) }).damage(a, t, 1, null);
  b.rng = seeded(7);
  const r2 = (() => { delete t.statuses.guard; return new Battle({ heroes: [t], enemies: [a], rng: seeded(7) }).damage(a, t, 1, null); })();
  assert.ok(Math.abs(r.amount - r2.amount / 2) <= 1, `${r.amount} vs ${r2.amount}`);
  assert.ok(open.amount > 0);
});

test('skills cost MP, and unaffordable skills are refused', () => {
  const { b } = miniBattle(30, ['vine']);
  const c = b.heroes[0];
  const before = c.mp;
  b.perform(c, { kind: 'skill', id: 'cut', target: b.enemies[0] });
  assert.strictEqual(c.mp, before - G.SKILLS.cut.mp);
  c.mp = 0;
  assert.strictEqual(b.canUse(c, 'cut'), false);
});

test('bosses cannot be sealed, and low-HP enemies are easier to seal', () => {
  const { b } = miniBattle(10, ['vine']);
  const e = b.enemies[0];
  const full = b.sealChance(e);
  e.hp = 1;
  assert.ok(b.sealChance(e) > full);
  const boss = miniBattle(10, ['vineMother']);
  assert.strictEqual(boss.b.sealChance(boss.b.enemies[0]), 0);
  assert.strictEqual(boss.b.canFlee, false);
});

test('a sealed enemy counts as defeated and consumes a talisman', () => {
  const { b, s } = miniBattle(10, ['vine'], { seal: 2 });
  b.enemies[0].hp = 1;
  b.rng = () => 0.01;
  b.perform(b.heroes[0], { kind: 'seal', target: b.enemies[0] });
  assert.strictEqual(b.outcome, 'win');
  assert.deepStrictEqual(b.sealed, ['vine']);
  assert.strictEqual(s.items.seal, 1);
});

test('Seven-Star Step strikes once per star and empties the gauge', () => {
  const { b } = miniBattle(30, ['vineMother']);
  b.ult = 100;
  const ev = b.perform(b.heroes[0], { kind: 'ult' });
  assert.strictEqual(ev.filter((e) => e.type === 'hit').length, 3);
  assert.strictEqual(b.ult, 0);
});

test('Seven-Star Step is unavailable before the first star', () => {
  const s = E.defaultSave();
  const b = new Battle({ heroes: P.partyUnits(s), enemies: [P.enemyUnit('vine', 1, 0)], stars: 0 });
  b.ult = 100;
  assert.strictEqual(b.ultReady(), false);
});

test('charged boss attacks warn first and strike on the following action', () => {
  const { b } = miniBattle(20, ['vineMother']);
  const boss = b.enemies[0];
  let warned = false;
  for (let i = 0; i < 8 && !warned; i++) {
    const act = b.enemyAction(boss);
    if (act.kind === 'charge') warned = true;
  }
  assert.ok(warned);
  assert.strictEqual(b.enemyAction(boss).kind, 'skill');
});

test('every battle ends: no infinite loops across all encounters', () => {
  CHAPTERS.forEach((c) => c.nodes.forEach((n) => {
    if (!n.foes) return;
    const { b } = miniBattle(n.lv + 3, n.foes);
    let guard = 0;
    while (!b.outcome && guard++ < 2000) {
      const t = b.next();
      if (t.skip) continue;
      if (t.actor.side === 'enemy') b.performEnemy(t.actor, b.enemyAction(t.actor));
      else b.perform(t.actor, b.autoAction(t.actor));
    }
    assert.ok(b.outcome, `no outcome in ${n.id}`);
  }));
});

test('balance: the campaign can be finished at every activity level', () => {
  const { run } = require('./simulate.js');
  const days = {};
  [0, 4000, 7000, 12000].forEach((steps) => {
    const r = run(1234, steps, 8);
    assert.ok(r.finished, `${steps} steps/day did not finish`);
    days[steps] = r.days;
  });
  assert.ok(days[7000] < days[4000] && days[4000] < days[0], 'walking more must finish sooner: ' + JSON.stringify(days));
  assert.ok(days[0] >= days[7000] * 2, 'walking must matter: ' + JSON.stringify(days));
});

// ---- Content integrity ----
test('all data references resolve', () => {
  Object.values(G.HEROES).forEach((h) => h.skills.forEach(([id]) => assert.ok(G.SKILLS[id], id)));
  Object.entries(G.MONSTERS).forEach(([id, m]) => {
    const art = typeof m.art === 'string' ? m.art : m.art.base;
    assert.ok(DRAW[art], `${id} art ${art}`);
    (m.skills || []).concat(m.pattern || []).forEach((sk) => assert.ok(G.SKILLS[sk], `${id} skill ${sk}`));
    assert.ok(G.ELEMENTS[m.el], id);
  });
  CHAPTERS.forEach((c) => {
    if (c.intro) assert.ok(STORY[c.intro], c.intro);
    c.nodes.forEach((n) => {
      (n.foes || []).forEach((f) => assert.ok(G.MONSTERS[f], f));
      if (n.before) assert.ok(STORY[n.before], n.before);
      if (n.after && n.after !== 'final') assert.ok(STORY[n.after], n.after);
      if (n.type === 'event') assert.ok(EVENTS[n.key], n.key);
    });
  });
  assert.ok(STORY.final && STORY.end_turn && STORY.end_hold && STORY.prologue);
  Object.values(EVENTS).forEach((ev) => ev.choices.forEach((c) => {
    if (c.spirit) assert.ok(G.MONSTERS[c.spirit], c.spirit);
    Object.keys(c.items || {}).forEach((k) => assert.ok(G.ITEMS[k], k));
    (c.fight ? c.fight.foes : []).forEach((f) => assert.ok(G.MONSTERS[f], f));
  }));
});

test('nothing from the inspiring game appears anywhere in the source or story', () => {
  const banned = ['轩辕', '天之痕', '陈靖仇', '于小雪', '拓跋玉儿', '张烈', '宇文拓', '炼妖壶', '崆峒印', '昆仑镜', '伏羲琴', '神农鼎', '女娲石', '盘古斧', '东皇钟', '昊天塔', '太子长琴'];
  walk(path.join(ROOT, 'js')).concat(walk(path.join(ROOT, 'cloudfunctions'))).forEach((f) => {
    const src = fs.readFileSync(f, 'utf8');
    banned.forEach((w) => assert.ok(!src.includes(w), `${w} in ${f}`));
  });
});

// ---- Runtime compatibility ----
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.name === 'node_modules') return [];
    return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}
const gameFiles = () => [path.join(ROOT, 'game.js')].concat(walk(path.join(ROOT, 'js'))).filter((f) => !f.endsWith('fontdata.js'));

test('source parses as ES2018, since the project compiles with es6 transforms off', () => {
  gameFiles().forEach((f) => acorn.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 2018, sourceType: 'script', allowReturnOutsideFunction: true }));
});

test('no eval or new Function, which WeChat forbids', () => {
  gameFiles().forEach((f) => {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/\beval\s*\(/.test(src), f);
    assert.ok(!/new\s+Function\s*\(/.test(src), f);
  });
});

test('no browser-only globals in game code', () => {
  const banned = /\b(window|document|localStorage|navigator|XMLHttpRequest|atob|btoa)\s*[.(\[]/;
  gameFiles().forEach((f) => {
    const src = fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!banned.test(src), `${f}: ${(src.match(banned) || [])[0]}`);
  });
});

test('project files have the shape WeChat DevTools expects', () => {
  const pc = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json')));
  assert.strictEqual(pc.compileType, 'game');
  assert.strictEqual(pc.cloudfunctionRoot, 'cloudfunctions/');
  const gj = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.json')));
  assert.strictEqual(gj.deviceOrientation, 'portrait');
  ['stepExchange', 'cloudSave'].forEach((fn) => {
    ['index.js', 'package.json', 'config.json'].forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, 'cloudfunctions', fn, f)), `${fn}/${f}`));
  });
});

test('package stays under the 4 MB main package limit', () => {
  let size = 0;
  const add = (p) => {
    fs.readdirSync(p, { withFileTypes: true }).forEach((e) => {
      const q = path.join(p, e.name);
      if (e.isDirectory()) add(q);
      else size += fs.statSync(q).size;
    });
  };
  add(path.join(ROOT, 'js'));
  add(path.join(ROOT, 'assets'));
  size += fs.statSync(path.join(ROOT, 'game.js')).size;
  assert.ok(size < 4 * 1024 * 1024, `${(size / 1048576).toFixed(2)} MB`);
  console.log(`      package size: ${(size / 1048576).toFixed(2)} MB`);
});

test('all displayed characters exist in the bundled font', () => {
  const data = require('../js/data/fontdata.js');
  const have = new Set(Array.from(data.chars));
  const missing = new Set();
  walk(path.join(ROOT, 'js')).filter((f) => !f.endsWith('fontdata.js')).forEach((f) => {
    const src = fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');
    for (const ch of src) if (ch.charCodeAt(0) > 127 && !have.has(ch)) missing.add(ch);
  });
  assert.strictEqual(Array.from(missing).join(''), '');
});

// ---- Runner ----
(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ok    ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${t.name}\n        ${e.message}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
