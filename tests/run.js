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
const { CHAPTERS, FLAT, NODE_INDEX } = require('../js/data/chapters.js');
const { STORY, EVENTS } = require('../js/data/story.js');
const { DRAW } = require('../js/art/monsters.js');
const { ICONS } = require('../js/art/icons.js');
const W = require('../js/data/world.js');
const Idle = require('../js/systems/idle.js');
const Boosts = require('../js/systems/boosts.js');
const Dispatch = require('../js/systems/dispatch.js');
const Garden = require('../js/systems/garden.js');
const Tower = require('../js/systems/tower.js');
const Wander = require('../js/systems/wander.js');
const Daily = require('../js/systems/daily.js');
const Wardrobe = require('../js/systems/wardrobe.js');
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
const T0 = Date.UTC(2026, 10, 4, 2, 0, 0);
const HOUR = 3600000;
const seededRng = (n) => {
  let x = n;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
};
function clearUpTo(s, id) {
  for (const f of FLAT) {
    if (f.node.type !== 'chest') E.clearNode(s, f.node.id);
    if (f.node.id === id) break;
  }
}
function strongParty(s, lv, tier) {
  ['cen', 'ruo', 'zhuo'].forEach((id) => {
    const h = s.heroes[id];
    h.joined = true;
    h.lv = lv;
    h.train = { hp: tier, atk: tier, def: tier, spd: Math.round(tier / 2) };
  });
}

test('spending cannot take coins or Stardust below zero', () => {
  const s = E.defaultSave();
  s.coin = 10;
  s.stardust = 10;
  assert.strictEqual(E.buyItem(s, 'incense'), false);
  assert.strictEqual(E.train(s, 'cen', 'atk'), false);
  assert.strictEqual(s.coin, 10);
  assert.strictEqual(Boosts.buyHaste(s), false);
  assert.strictEqual(Boosts.useJump(s, T0), false);
  assert.strictEqual(s.stardust, 10);
});

test('training stops at its cap', () => {
  const s = E.defaultSave();
  s.coin = 1e15;
  for (let i = 0; i < G.TRAIN_MAX + 10; i++) E.train(s, 'cen', 'atk');
  assert.strictEqual(s.heroes.cen.train.atk, G.TRAIN_MAX);
});

test('one-tap training spends only what the player has, across the party', () => {
  const s = E.defaultSave();
  s.heroes.ruo.joined = true;
  s.coin = 20000;
  const r = E.autoTrain(s);
  assert.ok(r.n > 0);
  assert.ok(s.coin >= 0);
  assert.ok(r.bought.cen > 0 && r.bought.ruo > 0, 'everyone who has joined gets a share');
  assert.strictEqual(s.heroes.zhuo.train.atk, 0, 'nobody trains before joining');
});

test('station wage can be claimed once per day, and grows with the sky stair', () => {
  const s = E.defaultSave();
  assert.strictEqual(E.claimStipend(s, 100), E.STIPEND);
  assert.strictEqual(E.claimStipend(s, 100), 0);
  s.tower.best = 10;
  assert.strictEqual(E.claimStipend(s, 101), E.STIPEND + 20);
});

test('refining takes real time, consumes both spirits, charges coins and records the recipe', () => {
  const s = E.defaultSave();
  s.coin = 100000;
  s.spirits = { vine: 1, wisp: 1 };
  const job = E.startRefine(s, 'vine', 'wisp', T0);
  assert.strictEqual(job.type, 'fire_wood');
  assert.deepStrictEqual(s.spirits, {});
  assert.strictEqual(s.coin, 100000 - G.RANKS[0].cost);
  assert.deepStrictEqual(E.collectRefined(s, T0), [], 'nothing is ready straight away');
  const done = E.collectRefined(s, T0 + G.RANKS[0].mins * 60000);
  assert.strictEqual(done.length, 1);
  assert.strictEqual(s.relics[0].type, 'fire_wood');
  assert.strictEqual(s.codex.recipes.fire_wood, 0);
  assert.deepStrictEqual(E.collectRefined(s, T0 + 2 * HOUR), [], 'a relic is handed over once');
});

test('refining the same spirit twice needs two of it, and the furnace has limited room', () => {
  const s = E.defaultSave();
  s.coin = 1000000;
  s.spirits = { vine: 1 };
  assert.strictEqual(E.startRefine(s, 'vine', 'vine', T0), null);
  assert.strictEqual(s.coin, 1000000);
  s.spirits.vine = 6;
  for (let i = 0; i < E.FURNACE_SLOTS; i++) assert.ok(E.startRefine(s, 'vine', 'vine', T0));
  assert.strictEqual(E.startRefine(s, 'vine', 'vine', T0), null, 'furnace is full');
});

test('a refine that cannot be paid for keeps the spirits', () => {
  const s = E.defaultSave();
  s.spirits = { vine: 2 };
  assert.strictEqual(E.startRefine(s, 'vine', 'vine', T0), null);
  assert.strictEqual(s.spirits.vine, 2);
});

test('spare relics melt for coins, but anything worn is safe', () => {
  const s = E.defaultSave();
  s.relics = [{ uid: 'r1', type: 'metal_metal', rank: 1 }, { uid: 'r2', type: 'metal_metal', rank: 1 }];
  E.equipRelic(s, 'cen', 0, 'r1');
  assert.strictEqual(E.meltRelic(s, 'r1'), 0);
  assert.ok(E.meltRelic(s, 'r2') > 0);
  assert.strictEqual(s.relics.length, 1);
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

test('saves from the turn-based version keep their progress and gain the idle systems', () => {
  const old = { v: 1, seq: 9, stardust: 77, heroes: { cen: { lv: 12, xp: 0, joined: true, train: { hp: 1, atk: 2, def: 3, spd: 4 }, relics: [null, null] } }, progress: { chapter: 2, cleared: { c1a: true }, stars: 2, lit: { c1h: true } } };
  const s = E.upgrade(old);
  assert.strictEqual(s.stardust, 77);
  assert.strictEqual(s.heroes.cen.lv, 12);
  assert.strictEqual(s.progress.chapter, 2);
  assert.ok(s.progress.cleared.c1a);
  assert.ok(s.heroes.zhuo && s.settings && s.idle && s.dispatch && s.garden && s.tower && s.wander && s.daily && s.wardrobe);
  assert.strictEqual(s.coin, 0);
  assert.strictEqual(s.heroes.cen.train.atk, 4, 'tiers are half as strong now, so old ones double');
  assert.strictEqual(E.upgrade(s).heroes.cen.train.atk, 4, 'upgrading again changes nothing');
});

// ---- The rule the whole design rests on ----
test('nothing on the road costs Stardust or asks for real steps', () => {
  FLAT.forEach(({ node }) => {
    assert.strictEqual(node.cost, undefined, `${node.id} has a price`);
    assert.strictEqual(node.needSteps, undefined, `${node.id} asks for real steps`);
  });
  ['pill', 'ether', 'incense', 'seal'].forEach((id) => {
    const s = E.defaultSave();
    s.coin = 1e9;
    assert.ok(E.buyItem(s, id), 'supplies are bought with coins');
    assert.strictEqual(s.stardust, 0);
  });
});

test('a player with no steps and no Stardust can clear every node and open every feature', () => {
  const s = E.defaultSave();
  assert.strictEqual(s.steps.total, 0);
  FLAT.forEach(({ node }) => {
    if (node.type === 'chest') return;
    assert.ok(E.nodeUnlocked(s, node.id), `${node.id} locked`);
    E.clearNode(s, node.id);
  });
  assert.strictEqual(s.stardust, 0);
  assert.strictEqual(s.progress.stars, 6);
  Object.keys(W.UNLOCKS).forEach((f) => assert.ok(E.unlocked(s, f), f));
});

test('progress code never reads real steps, except footpower, which time also fills', () => {
  // These files decide what the player can reach. Stride and rolls are bonuses, so they live apart.
  ['js/systems/battle.js', 'js/systems/party.js', 'js/systems/tower.js', 'js/systems/garden.js', 'js/systems/dispatch.js'].forEach((f) => {
    assert.ok(!/steps/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), `${f} mentions steps`);
  });
});

test('every chest opens from time on the road alone, with no real steps', () => {
  const s = E.defaultSave();
  s.idle.total = 200000 / Idle.FOOT_PER_SEC;
  assert.strictEqual(s.steps.total, 0);
  FLAT.forEach(({ node }) => {
    if (node.type !== 'chest') return;
    assert.ok(Idle.footpower(s) >= node.needFoot, `${node.id} out of reach`);
  });
});

test('balance: the whole game can be finished at every activity level, walking or not', () => {
  const { run, PROFILES } = require('./simulate.js');
  const avg = (p) => {
    let t = 0;
    for (let i = 1; i <= 4; i++) {
      const r = run(1234 * i, PROFILES[p]);
      assert.ok(r.finished, `${p} did not finish`);
      t += r.days;
    }
    return t / 4;
  };
  const none = avg('noneActive');
  const typical = avg('typical');
  const keen = avg('keen');
  const lazy = avg('none');
  assert.ok(none <= 30, `no steps should be a normal pace, took ${none} days`);
  assert.ok(lazy <= 45, `even collecting only should finish, took ${lazy} days`);
  assert.ok(typical < none && keen <= typical + 1, `walking should help: ${none} / ${typical} / ${keen}`);
  // The old build's gap was 3.6x. Steps may speed things up, but they may never be the difference.
  assert.ok(none / keen <= 1.6, `no-steps pace must stay close: ${none} vs ${keen}`);
});

// ---- The march ----
test('time away fills the pack at the published rate', () => {
  const s = E.defaultSave();
  Idle.sync(s, T0);
  const r = Idle.rates(s, T0);
  const dt = Idle.sync(s, T0 + 10 * 60000);
  assert.strictEqual(dt, 600);
  assert.ok(Math.abs(s.idle.pack.coin - r.coin * 10) < r.coin * 3, 'coins near the rate, allowing for arrival rewards');
  assert.ok(s.idle.pack.xp >= r.xp * 10 - 1);
  assert.strictEqual(s.coin, 0, 'earnings wait in the pack');
});

test('the pack stops filling at capacity, so a long absence has a limit', () => {
  const s = E.defaultSave();
  Idle.sync(s, T0);
  const dt = Idle.sync(s, T0 + 1000 * HOUR);
  assert.strictEqual(dt, Idle.BASE_CAP_HOURS * 3600);
  assert.strictEqual(Idle.sync(s, T0 + 1001 * HOUR), 0, 'nothing more until it is emptied');
  Idle.collect(s);
  assert.ok(Idle.sync(s, T0 + 1002 * HOUR) > 0);
});

test('a clock moved backwards earns nothing and costs nothing', () => {
  const s = E.defaultSave();
  Idle.sync(s, T0);
  Idle.sync(s, T0 + HOUR);
  const pack = JSON.stringify(s.idle.pack);
  assert.strictEqual(Idle.sync(s, T0 - 5 * HOUR), 0);
  assert.strictEqual(JSON.stringify(s.idle.pack), pack);
  assert.strictEqual(Idle.sync(s, T0 - 5 * HOUR + 60000), 60, 'and time counts normally from there');
});

test('syncing in small steps earns about the same as one big step', () => {
  const big = E.defaultSave(), small = E.defaultSave();
  [big, small].forEach((x) => { x.progress.cleared.c1a = true; x.progress.cleared.c1b = true; x.progress.cleared.c1c = true; Idle.sync(x, T0); });
  Idle.sync(big, T0 + 2 * HOUR);
  for (let i = 1; i <= 120; i++) Idle.sync(small, T0 + i * 60000);
  const ratio = small.idle.pack.coin / big.idle.pack.coin;
  assert.ok(ratio > 0.9 && ratio < 1.1, `small/big = ${ratio}`);
});

test('collecting empties the pack exactly once and levels the party', () => {
  const s = E.defaultSave();
  Idle.sync(s, T0);
  s.idle.pack.coin = 500.7;
  s.idle.pack.xp = 100000;
  s.idle.pack.items = { pill: 2 };
  s.idle.pack.spirits = { vine: 1 };
  s.idle.pack.herbs = { wood: 3 };
  const c = Idle.collect(s);
  assert.strictEqual(c.coin, 500);
  assert.strictEqual(s.coin, 500);
  assert.strictEqual(s.items.pill, 5);
  assert.strictEqual(s.spirits.vine, 1);
  assert.strictEqual(s.herbs.wood, 3);
  assert.ok(s.heroes.cen.lv > 1);
  assert.ok(c.ups.length > 0);
  assert.ok(Idle.packEmpty(s));
  const again = Idle.collect(s);
  assert.strictEqual(again.coin, 0);
  assert.strictEqual(s.coin, 500);
});

test('the party waits for story and bosses, but keeps earning while it waits', () => {
  const s = E.defaultSave();
  Idle.sync(s, T0);
  Idle.sync(s, T0 + HOUR);
  const st = Idle.status(s);
  assert.strictEqual(st.kind, 'hold', 'the very first fight has a story beat');
  assert.strictEqual(st.node.id, 'c1a');
  assert.ok(!s.progress.cleared.c1a, 'no story is ever skipped behind the player\'s back');
  const coin = s.idle.pack.coin;
  Idle.sync(s, T0 + 2 * HOUR);
  assert.ok(s.idle.pack.coin > coin, 'time spent waiting is not wasted');
});

test('plain fights clear by themselves, and a strong party marches through them', () => {
  const s = E.defaultSave();
  strongParty(s, 30, 20);
  clearUpTo(s, 'c1d');
  Idle.sync(s, T0);
  Idle.sync(s, T0 + HOUR, seededRng(3));
  assert.ok(s.progress.cleared.c1f && s.progress.cleared.c1g, 'the elite and the fight after it fell on the march');
  assert.strictEqual(Idle.status(s).kind, 'hold');
  assert.strictEqual(Idle.status(s).node.id, 'c1h', 'and the boss waits for the player');
  assert.ok(!s.progress.cleared.c1h);
});

test('a fight too hard blocks the road until the party grows, then it retries', () => {
  const s = E.defaultSave();
  clearUpTo(s, 'c5a');
  E.joinHero(s, 'ruo');
  E.joinHero(s, 'zhuo');
  Idle.sync(s, T0);
  Idle.sync(s, T0 + 2 * HOUR, seededRng(5));
  assert.strictEqual(Idle.status(s).kind, 'blocked');
  assert.ok(!s.progress.cleared.c5b);
  const coin = s.idle.pack.coin;
  Idle.sync(s, T0 + 3 * HOUR, seededRng(5));
  assert.ok(s.idle.pack.coin > coin, 'still earning while blocked');
  strongParty(s, 90, 50);
  Idle.nudge(s);
  Idle.sync(s, T0 + 3 * HOUR + 60000, seededRng(5));
  assert.ok(s.progress.cleared.c5b, 'the retry comes as soon as the party is stronger');
});

test('a boss is never beaten on the march', () => {
  const s = E.defaultSave();
  strongParty(s, 99, 60);
  Idle.sync(s, T0);
  for (let h = 1; h <= 40; h++) {
    Idle.sync(s, T0 + h * HOUR, seededRng(h));
    Idle.collect(s);
  }
  FLAT.forEach(({ node }) => { if (node.type === 'boss') assert.ok(!s.progress.cleared[node.id], node.id); });
});

test('income rises with distance from home', () => {
  const near = E.defaultSave(), far = E.defaultSave();
  clearUpTo(far, 'c5h');
  assert.ok(Idle.rates(far, T0).coin > Idle.rates(near, T0).coin * 2);
  assert.ok(Idle.rates(far, T0).xp > Idle.rates(near, T0).xp * 2);
});

test('pack capacity grows with stars and blessings', () => {
  const s = E.defaultSave();
  const base = Idle.capSecs(s);
  clearUpTo(s, 'c1h');
  assert.strictEqual(Idle.capSecs(s), base + 3600);
  s.blessings.pack = 2;
  assert.strictEqual(Idle.capSecs(s), base + 3 * 3600);
});

test('after the ending the road loops with stronger enemies', () => {
  const s = E.defaultSave();
  FLAT.forEach(({ node }) => { if (node.type !== 'chest') E.clearNode(s, node.id); });
  assert.strictEqual(Idle.status(s).kind, 'ending', 'the final choice waits for the player');
  s.progress.ending = 'turn';
  strongParty(s, 100, 55);
  Idle.sync(s, T0);
  assert.strictEqual(Idle.status(s).kind, 'lap');
  const lv0 = Idle.stageLevel(s);
  const coin0 = Idle.rates(s, T0).coin;
  for (let h = 1; h <= 40; h++) {
    Idle.sync(s, T0 + h * HOUR, seededRng(h));
    Idle.collect(s);
  }
  assert.ok(s.progress.lap >= 1, 'a full lap was walked');
  assert.ok(Idle.stageLevel(s) > lv0, 'enemies got stronger');
  assert.ok(Idle.rates(s, T0).coin > coin0, 'and so did the income');
});

// ---- Steps as an enhancement ----
test('haste doubles earnings and is never wasted on a full pack', () => {
  // Both parties wait at the first story stop, so only the steady rate is being compared.
  const plain = E.defaultSave(), fast = E.defaultSave();
  [plain, fast].forEach((x) => Idle.sync(x, T0));
  fast.stardust = W.BOOSTS.haste.cost;
  assert.ok(Boosts.buyHaste(fast));
  assert.strictEqual(fast.stardust, 0);
  Idle.sync(plain, T0 + 1800000);
  Idle.sync(fast, T0 + 1800000);
  const r = fast.idle.pack.xp / plain.idle.pack.xp;
  assert.ok(Math.abs(r - 2) < 0.01, `haste should double earnings, got ${r}`);
  assert.strictEqual(fast.idle.hasteSecs, 0, 'and it is used up by then');
  // A full pack does not use up the bank.
  const s = E.defaultSave();
  Idle.sync(s, T0);
  s.idle.secs = Idle.capSecs(s);
  s.idle.hasteSecs = 1800;
  Idle.sync(s, T0 + HOUR);
  assert.strictEqual(s.idle.hasteSecs, 1800);
});

test('the time jump gives an hour at once, ignoring capacity', () => {
  const s = E.defaultSave();
  Idle.sync(s, T0);
  s.idle.secs = Idle.capSecs(s);
  s.stardust = W.BOOSTS.jump.cost;
  const before = s.idle.pack.coin;
  assert.ok(Boosts.useJump(s, T0));
  assert.ok(s.idle.pack.coin > before + Idle.rates(s, T0).coin * 50);
  assert.strictEqual(s.idle.secs, Idle.capSecs(s));
});

test('today\'s real steps speed up today, and only today', () => {
  const s = E.defaultSave();
  const day = Idle.dayOf(T0);
  assert.strictEqual(Idle.strideBonus(s, T0), 0, 'nobody is punished for not walking');
  const base = Idle.rates(s, T0).coin;
  s.steps.lastView = { today: { day, steps: 7000 } };
  assert.strictEqual(Idle.strideBonus(s, T0), 0.1);
  assert.ok(Math.abs(Idle.rates(s, T0).coin - base * 1.1) < 0.001);
  assert.strictEqual(Idle.strideBonus(s, T0 + 86400000), 0, 'it ends with the day');
  s.steps.lastView.today.steps = 16000;
  assert.strictEqual(Idle.strideBonus(s, T0), 0.2);
});

test('walking moves the party along and adds rolls, on top of the usual pace', () => {
  const s = E.defaultSave();
  const g = { id: 'g1', dust: 500, items: {}, notes: [{ kind: 'today', steps: 5000, dust: 500 }] };
  const rolls = s.wander.rolls;
  E.applyGrants(s, [g]);
  assert.strictEqual(s.idle.dashLi, 5);
  assert.strictEqual(s.wander.rolls, rolls + 2);
  assert.strictEqual(s.wander.stepCarry, 1000, 'the remainder carries over');
  E.applyGrants(s, [g]);
  assert.strictEqual(s.wander.rolls, rolls + 2, 'a repeated grant adds nothing');
});

test('blessing prices rise, tiers stop at their maximum, and each does its job', () => {
  const s = E.defaultSave();
  assert.ok(Boosts.blessingCost('fortune', 1) > Boosts.blessingCost('fortune', 0));
  s.stardust = 1e9;
  for (let i = 0; i < 20; i++) Boosts.buyBlessing(s, 'fortune');
  assert.strictEqual(s.blessings.fortune, W.BLESSINGS.fortune.max);
  const plain = E.defaultSave();
  assert.ok(Idle.rates(s, T0).coin > Idle.rates(plain, T0).coin);
});

test('looks do not change strength', () => {
  const s = E.defaultSave();
  s.stardust = 1e6;
  const before = JSON.stringify(P.heroStats(s, 'cen'));
  assert.ok(Wardrobe.buy(s, 'cen_moon'));
  assert.ok(Wardrobe.toggle(s, 'cen_moon'));
  assert.strictEqual(s.heroes.cen.outfit, 'cen_moon');
  assert.strictEqual(JSON.stringify(P.heroStats(s, 'cen')), before);
  assert.strictEqual(Wardrobe.buy(s, 'cen_moon'), false, 'cannot buy twice');
  Wardrobe.toggle(s, 'cen_moon');
  assert.strictEqual(s.heroes.cen.outfit, null);
});

test('some looks are earned by walking or wandering rather than bought', () => {
  const s = E.defaultSave();
  assert.strictEqual(Wardrobe.owned(s, 'pet_tortoise'), false);
  assert.strictEqual(Wardrobe.buy(s, 'pet_tortoise'), false);
  s.steps.total = 100000;
  assert.strictEqual(Wardrobe.owned(s, 'pet_tortoise'), true);
  s.wander.laps = 3;
  assert.strictEqual(Wardrobe.owned(s, 'pet_lamp'), true);
});

// ---- Activities ----
function openDispatch() {
  const s = E.defaultSave();
  clearUpTo(s, 'c1h');
  Dispatch.refill(s, T0, seededRng(1));
  return s;
}

test('the errand board fills up, and new errands arrive over time', () => {
  const s = openDispatch();
  assert.ok(s.dispatch.board.length >= 3);
  s.dispatch.board.forEach((j) => assert.ok(G.ELEMENTS[j.el] && j.mins > 0 && j.title));
  while (s.dispatch.board.length) s.dispatch.board.pop();
  Dispatch.refill(s, T0 + 1000, seededRng(2));
  const a = s.dispatch.board.length;
  Dispatch.refill(s, T0 + 12 * HOUR, seededRng(2));
  assert.ok(s.dispatch.board.length >= a);
  assert.ok(s.dispatch.board.length <= Dispatch.BOARD_SIZE);
});

test('a courier can only carry one errand, and the desk has limited room', () => {
  const s = openDispatch();
  assert.strictEqual(Dispatch.slots(s), 2);
  const [a, b, c] = s.dispatch.board;
  assert.ok(Dispatch.send(s, a.id, 'dou', T0));
  assert.strictEqual(Dispatch.send(s, b.id, 'dou', T0), false, 'already out');
  assert.ok(Dispatch.send(s, b.id, 'zhou', T0));
  assert.strictEqual(Dispatch.send(s, c.id, 'hong', T0), false, 'no free desk');
  assert.strictEqual(s.dispatch.active.length, 2);
});

test('a courier not yet hired cannot be sent', () => {
  const s = openDispatch();
  assert.strictEqual(Dispatch.send(s, s.dispatch.board[0].id, 'tao', T0), false);
});

test('an element match pays more, and traits do what they say', () => {
  const s = openDispatch();
  const job = { title: 'x', el: 'fire', mins: 240, ci: 0 };
  const hong = W.COURIERS.find((c) => c.id === 'hong');
  const zhou = W.COURIERS.find((c) => c.id === 'zhou');
  const dou = W.COURIERS.find((c) => c.id === 'dou');
  const m = Dispatch.preview(s, job, hong);
  assert.ok(m.match);
  assert.ok(m.reward.coin > Dispatch.preview(s, { ...job, el: 'metal' }, hong).reward.coin);
  assert.ok(Dispatch.preview(s, job, dou).match, 'wood feeds fire');
  assert.strictEqual(Dispatch.preview(s, job, dou).mins, Math.round(240 * 0.85));
  assert.ok(Dispatch.preview(s, { ...job, el: 'metal' }, zhou).match, 'earth bears metal');
});

test('finished errands pay exactly once, unfinished ones keep running', () => {
  const s = openDispatch();
  const [a, b] = s.dispatch.board.slice().sort((x, y) => x.mins - y.mins);
  a.mins = 30;
  b.mins = 480;
  Dispatch.send(s, a.id, 'zhou', T0);
  Dispatch.send(s, b.id, 'dou', T0);
  assert.strictEqual(Dispatch.claimAll(s, T0, seededRng(1)).n, 0);
  const r = Dispatch.claimAll(s, T0 + HOUR, seededRng(1));
  assert.strictEqual(r.n, 1);
  assert.ok(s.coin > 0);
  const coin = s.coin;
  assert.strictEqual(Dispatch.claimAll(s, T0 + HOUR, seededRng(1)).n, 0);
  assert.strictEqual(s.coin, coin);
  assert.strictEqual(s.dispatch.active.length, 1);
});

test('rushing an errand costs Stardust in proportion to the time left', () => {
  const s = openDispatch();
  const j = s.dispatch.board[0];
  j.mins = 240;
  Dispatch.send(s, j.id, 'zhou', T0);
  assert.strictEqual(Dispatch.rush(s, 0, T0), false, 'not enough Stardust');
  s.stardust = Boosts.rushCost(240 * 60000);
  assert.ok(Dispatch.rush(s, 0, T0));
  assert.strictEqual(s.stardust, 0);
  assert.strictEqual(Dispatch.ready(s, T0), 1);
});

test('letters arrive in order, without story spoilers', () => {
  const s = E.defaultSave();
  clearUpTo(s, 'c1h');
  s.dispatch.done = 0;
  s.dispatch.active = [
    { doneAt: T0, ci: 0, reward: { coin: 1, xp: 1, herbs: {}, items: {}, dust: 0, spirits: 0, bonus: 0 } },
    { doneAt: T0, ci: 0, reward: { coin: 1, xp: 1, herbs: {}, items: {}, dust: 0, spirits: 0, bonus: 0 } },
  ];
  const r = Dispatch.claimAll(s, T0, seededRng(9));
  assert.strictEqual(r.letters.length, 1);
  assert.strictEqual(W.LETTERS[r.letters[0]].after <= 1, true);
  assert.strictEqual(s.letters.unread, 1);
  W.LETTERS.forEach((l, i) => {
    if (l.ending) assert.ok(l.after === 6 && !s.letters.got.includes(i), 'ending letters wait for the ending');
  });
});

test('crops ripen on real time, and each is picked once', () => {
  const s = E.defaultSave();
  assert.ok(Garden.plant(s, 0, 'wood', T0));
  assert.strictEqual(Garden.plant(s, 0, 'fire', T0), false, 'plot is taken');
  assert.strictEqual(Garden.harvest(s, T0).n, 0);
  assert.strictEqual(Garden.stage(s.garden.plots[0], T0), 0);
  const t = T0 + W.CROPS.wood.mins * 60000;
  assert.strictEqual(Garden.stage(s.garden.plots[0], t), 2);
  const r = Garden.harvest(s, t);
  assert.strictEqual(r.n, 1);
  assert.strictEqual(s.herbs.wood, W.CROPS.wood.yield);
  assert.strictEqual(Garden.harvest(s, t).n, 0);
});

test('plots open up as the journey goes on', () => {
  const s = E.defaultSave();
  const n = Garden.plotCount(s);
  assert.strictEqual(Garden.plant(s, n, 'wood', T0), false, 'locked plot');
  clearUpTo(s, 'c1h');
  assert.strictEqual(Garden.plotCount(s), n + 1);
  assert.ok(Garden.plant(s, n, 'wood', T0));
});

test('neighbours matter: generating helps, overcoming hurts, and the order of picking does not', () => {
  const s = E.defaultSave();
  Garden.plant(s, 1, 'wood', T0);
  const alone = Garden.yieldOf(s, 1);
  Garden.plant(s, 0, 'water', T0); // Water feeds wood.
  const helped = Garden.yieldOf(s, 1);
  assert.ok(helped > alone);
  Garden.plant(s, 2, 'metal', T0); // Metal cuts wood, cancelling the help.
  assert.strictEqual(Garden.yieldOf(s, 1), alone);
  const later = T0 + 400 * 60000;
  const y = [0, 1, 2].map((i) => Garden.yieldOf(s, i));
  const r = Garden.harvest(s, later);
  assert.strictEqual(r.gained.water, y[0]);
  assert.strictEqual(r.gained.wood, y[1]);
  assert.strictEqual(r.gained.metal, y[2]);
});

test('a harvest never yields less than one', () => {
  const s = E.defaultSave();
  s.garden.plots[4] = { el: 'wood', doneAt: T0, at: T0 };
  [1, 3, 5, 7].forEach((i) => { s.garden.plots[i] = { el: 'metal', doneAt: T0, at: T0 }; });
  assert.strictEqual(Garden.bonusOf(s, 4), -1);
  assert.strictEqual(Garden.yieldOf(s, 4), 1);
});

test('free watering has a cooldown, and star dew is priced by the slowest crop', () => {
  const s = E.defaultSave();
  Garden.plant(s, 0, 'water', T0);
  const done = s.garden.plots[0].doneAt;
  assert.ok(Garden.water(s, T0));
  assert.strictEqual(s.garden.plots[0].doneAt, done - 30 * 60000);
  assert.strictEqual(Garden.water(s, T0 + 60000), false);
  assert.ok(Garden.canWater(s, T0 + 5 * HOUR));
  const cost = Garden.rushCost(s, T0);
  assert.ok(cost > 0);
  assert.strictEqual(Garden.rush(s, T0), false);
  s.stardust = cost;
  assert.ok(Garden.rush(s, T0));
  assert.strictEqual(Garden.ripeCount(s, T0), 1);
  assert.strictEqual(Garden.rushCost(s, T0), 0);
});

test('cooking spends herbs, makes items and sets a meal that wears off on the road', () => {
  const s = E.defaultSave();
  assert.strictEqual(Garden.cook(s, 'pill'), false, 'no herbs');
  s.herbs = { wood: 10, fire: 10, earth: 10, metal: 10, water: 10 };
  const pills = s.items.pill;
  assert.ok(Garden.cook(s, 'pill'));
  assert.strictEqual(s.items.pill, pills + 2);
  assert.strictEqual(s.herbs.wood, 8);
  assert.ok(Garden.cook(s, 'meal_xp'));
  assert.strictEqual(s.idle.meal, 'xp');
  const base = Idle.rates(E.defaultSave(), T0).xp;
  assert.ok(Idle.rates(s, T0).xp > base * 1.2);
  Idle.sync(s, T0);
  Idle.sync(s, T0 + 9 * HOUR);
  assert.strictEqual(s.idle.mealSecs, 0, 'eight hours later it is gone');
  assert.ok(Math.abs(Idle.rates(s, T0).xp - base) < 0.001, 'and the rate is back to normal');
});

test('every floor of the sky stair is a valid fight, and bosses mark every tenth', () => {
  for (let f = 1; f <= 120; f++) {
    const spec = Tower.floorSpec(f);
    assert.ok(spec.foes.length >= 1);
    spec.foes.forEach((id) => assert.ok(G.MONSTERS[id], `floor ${f}: ${id}`));
    if (f % 10 === 0) assert.ok(G.MONSTERS[spec.foes[0]].boss, `floor ${f} is a boss`);
    else assert.ok(spec.foes.every((id) => !G.MONSTERS[id].boss), `floor ${f} has no boss`);
    assert.ok(Tower.reward(f).dust > 0);
  }
});

test('a floor pays only the first time, and only in order', () => {
  const s = E.defaultSave();
  assert.strictEqual(Tower.win(s, 5), null, 'cannot skip ahead');
  const r = Tower.win(s, 1);
  assert.ok(r);
  const d = s.stardust;
  assert.strictEqual(s.tower.best, 1);
  assert.strictEqual(Tower.win(s, 1), null);
  assert.strictEqual(s.stardust, d);
  assert.strictEqual(d, Tower.reward(1).dust);
});

test('free rolls refill up to a small cap, and rolls earned by walking stack above it', () => {
  const s = E.defaultSave();
  s.wander.rolls = 0;
  Wander.regen(s, T0);
  assert.strictEqual(s.wander.rolls, 0);
  Wander.regen(s, T0 + Wander.REGEN_MS);
  assert.strictEqual(s.wander.rolls, 1);
  Wander.regen(s, T0 + 100 * Wander.REGEN_MS);
  assert.strictEqual(s.wander.rolls, Wander.FREE_CAP);
  s.wander.rolls += 5;
  Wander.regen(s, T0 + 200 * Wander.REGEN_MS);
  assert.strictEqual(s.wander.rolls, Wander.FREE_CAP + 5);
});

test('a roll moves the courier, pays out, and needs a roll to spend', () => {
  const s = E.defaultSave();
  clearUpTo(s, 'c2b');
  s.wander.rolls = 1;
  s.wander.regen = T0 + HOUR;
  const r = Wander.roll(s, T0, seededRng(4));
  assert.ok(r.die >= 1 && r.die <= 6);
  assert.ok(W.TILES[r.tile]);
  assert.notStrictEqual(r.tile, 'fork', 'a shortcut lands somewhere real');
  assert.strictEqual(s.wander.pos, r.to);
  assert.strictEqual(s.wander.rolls, r.rolls || 0);
  s.wander.rolls = 0;
  assert.strictEqual(Wander.roll(s, T0, seededRng(4)), null);
});

test('every tile pays what it promises, and going round pays a bonus', () => {
  const s = E.defaultSave();
  clearUpTo(s, 'c2b');
  s.wander.regen = T0 + HOUR;
  s.wander.rolls = 500;
  let laps = 0;
  const seen = new Set();
  const rng = seededRng(77);
  for (let i = 0; i < 400; i++) {
    const before = s.stardust;
    const r = Wander.roll(s, T0, rng);
    seen.add(r.tile);
    if (r.lapped) {
      laps++;
      assert.strictEqual(s.stardust, before + Wander.LAP_DUST + (r.dust || 0));
    }
    if (r.coin) assert.ok(r.coin > 0);
    assert.ok(s.wander.pos >= 0 && s.wander.pos < W.BOARD.length);
  }
  assert.strictEqual(s.wander.laps, laps);
  assert.ok(laps > 10);
  ['coin', 'xp', 'herb', 'spirit', 'item', 'dust', 'inn', 'wind', 'shrine'].forEach((t) => assert.ok(seen.has(t), t));
});

test('the shrine doubles the next stop', () => {
  const s = E.defaultSave();
  clearUpTo(s, 'c2b');
  s.wander.rolls = 2;
  s.wander.regen = T0 + HOUR;
  // Stand three short of the shrine, then land on it and on the stop after with a fixed die.
  s.wander.pos = W.BOARD.indexOf('shrine') - 1;
  let n = 0;
  const seq = [0, 0, 0, 0.5, 0.5, 0.5];
  const rng = () => seq[n++ % seq.length];
  const a = Wander.roll(s, T0, rng);
  assert.strictEqual(a.tile, 'shrine');
  assert.strictEqual(s.wander.bonus, true);
  const b = Wander.roll(s, T0, rng);
  assert.strictEqual(s.wander.bonus, false);
  if (b.coin) assert.strictEqual(b.coin, Math.round(G.coinPerMin(Idle.stageLevel(s)) * Wander.TILE_MINS * 2));
});

test('daily errands reset each day and pay once, and the bonus needs no walking', () => {
  const s = E.defaultSave();
  const day = 100;
  assert.strictEqual(Daily.claim(s, 'collect', day), 0, 'not done yet');
  Daily.mark(s, 'collect', day);
  assert.strictEqual(Daily.claim(s, 'collect', day), 25);
  assert.strictEqual(Daily.claim(s, 'collect', day), 0);
  ['train', 'dispatch', 'garden'].forEach((id) => { Daily.mark(s, id, day); Daily.claim(s, id, day); });
  assert.strictEqual(s.steps.total, 0);
  assert.ok(Daily.bonusReady(s, day), 'four errands earn the bonus without a single real step');
  assert.strictEqual(Daily.claimBonus(s, day), W.DAILY_BONUS.dust);
  assert.strictEqual(Daily.claimBonus(s, day), 0);
  Daily.ensure(s, day + 1);
  assert.strictEqual(Daily.claimedCount(s, day + 1), 0);
  assert.strictEqual(Daily.bonusReady(s, day + 1), false);
});

test('the walking errand is a separate extra', () => {
  const s = E.defaultSave();
  const day = 100;
  assert.strictEqual(Daily.claimWalk(s, day), 0);
  s.steps.lastView = { today: { day, steps: 1000 } };
  assert.strictEqual(Daily.claimWalk(s, day), 0);
  s.steps.lastView.today.steps = W.DAILY_WALK.steps;
  assert.strictEqual(Daily.claimWalk(s, day), W.DAILY_WALK.dust);
  assert.strictEqual(Daily.claimWalk(s, day), 0);
  assert.strictEqual(Daily.claimedCount(s, day), 0, 'it does not count toward the daily bonus');
});

test('hand-played repeat fights are worth having, up to a daily allowance', () => {
  const s = E.defaultSave();
  clearUpTo(s, 'c1a');
  const foes = [P.enemyUnit('vine', 1, 0)];
  const first = E.nodeRewards(s, foes, 'c1a', 100);
  for (let i = 0; i < E.REPLAY_LIMIT; i++) E.nodeRewards(s, foes, 'c1a', 100);
  const late = E.nodeRewards(s, foes, 'c1a', 100);
  assert.ok(late.coin < first.coin * 0.2);
  const nextDay = E.nodeRewards(s, foes, 'c1a', 101);
  assert.strictEqual(nextDay.coin, first.coin);
});

test('a first clear pays much more than a repeat', () => {
  const s = E.defaultSave();
  const foes = [P.enemyUnit('vine', 1, 0)];
  const first = E.nodeRewards(s, foes, 'c1a', 100);
  E.clearNode(s, 'c1a');
  const repeat = E.nodeRewards(s, foes, 'c1a', 100);
  assert.ok(first.coin > repeat.coin * 3);
  assert.ok(first.dust > 0);
  assert.strictEqual(repeat.dust, 0);
});

test('features open as the road is walked', () => {
  const s = E.defaultSave();
  Object.keys(W.UNLOCKS).forEach((f) => assert.strictEqual(E.unlocked(s, f), false, f));
  clearUpTo(s, 'c1b');
  assert.ok(E.unlocked(s, 'dispatch'));
  assert.strictEqual(E.unlocked(s, 'garden'), false);
});

test('the save stays small enough for cloud backup, even after a long game', () => {
  const { run, PROFILES } = require('./simulate.js');
  const r = run(4242, PROFILES.typical);
  assert.ok(JSON.stringify(r.s).length < 60 * 1024, `${JSON.stringify(r.s).length} bytes`);
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

test('all activity content resolves: errands, crops, recipes, stops, looks and icons', () => {
  const icon = (n) => assert.ok(ICONS[n], 'icon ' + n);
  W.COURIERS.forEach((c) => { assert.ok(G.ELEMENTS[c.el], c.id); assert.ok(c.head && c.head.hair !== undefined, c.id); });
  W.JOBS.forEach((list) => list.forEach((j) => assert.ok(G.ELEMENTS[j.el], j.title)));
  assert.strictEqual(W.JOBS.length, CHAPTERS.length);
  W.CROP_ORDER.forEach((el) => { assert.ok(W.CROPS[el], el); assert.ok(G.ELEMENTS[el], el); icon('herb_' + el); });
  assert.strictEqual(W.CROP_ORDER.length, Object.keys(G.ELEMENTS).length);
  Object.values(W.RECIPES).forEach((r) => {
    icon(r.icon);
    Object.keys(r.herbs).forEach((el) => assert.ok(W.CROPS[el], el));
    Object.keys(r.gives || {}).forEach((k) => assert.ok(G.ITEMS[k], k));
    if (r.meal) assert.ok(W.MEALS[r.meal], r.meal);
  });
  Object.values(W.MEALS).forEach((m) => icon(m.icon));
  W.BOARD.forEach((t) => { assert.ok(W.TILES[t], t); icon(W.TILES[t].icon); });
  assert.strictEqual(W.BOARD.length, 24, 'the board must match its 6 x 8 layout on screen');
  Object.values(W.BOOSTS).forEach((b) => icon(b.icon));
  Object.values(W.BLESSINGS).forEach((b) => icon(b.icon));
  Object.values(G.ITEMS).forEach((it) => icon(it.icon));
  const { PETS } = require('../js/art/heroes.js');
  Object.entries(W.COSMETICS).forEach(([id, c]) => {
    assert.ok(c.cost || c.steps || c.laps, id + ' has no way to get it');
    if (c.kind === 'outfit') assert.ok(G.HEROES[c.hero] && c.pal, id);
    if (c.kind === 'pet') assert.ok(PETS[c.pet], id);
    if (c.kind === 'decor') icon(c.icon);
  });
  Object.values(W.UNLOCKS).forEach((u) => assert.ok(NODE_INDEX[u.node], u.node));
  assert.ok(FLAT.length > 40);
});

test('every hero pose, outfit and creature can be drawn', () => {
  const { heroGrid, POSE_NAMES, PETS, PORTRAITS, courierHead } = require('../js/art/heroes.js');
  const { monsterGrid } = require('../js/art/monsters.js');
  G.HERO_ORDER.forEach((id) => POSE_NAMES.forEach((pose) => {
    assert.ok(heroGrid(id, pose).d.some((c) => c !== -1), `${id} ${pose}`);
  }));
  Object.values(W.COSMETICS).forEach((c) => { if (c.pal) assert.ok(heroGrid(c.hero, 'walk0', c.pal)); });
  Object.keys(PETS).forEach((k) => { assert.ok(PETS[k](0)); assert.ok(PETS[k](1)); });
  Object.keys(PORTRAITS).forEach((k) => assert.ok(PORTRAITS[k]()));
  W.COURIERS.forEach((c) => assert.ok(courierHead(c.head)));
  Object.values(G.MONSTERS).forEach((m) => assert.ok(monsterGrid(m.art).d.some((c) => c !== -1), m.name));
  const scenery = require('../js/art/scenery.js');
  ['spring', 'summer', 'loess', 'autumn', 'winter', 'void'].forEach((t) => {
    ['clouds', 'far', 'mid', 'near'].forEach((l) => assert.ok(scenery.layerGrid(t, l, 80).d.some((c) => c !== -1), t + l));
    assert.ok(scenery.groundGrid(t, 256, 60, true).opaque(), t + ' ground');
    assert.ok(scenery.skyGrid(t, 100, 80).opaque(), t + ' sky');
    assert.ok(scenery.foreLayer(t, 20));
  });
});

test('parallax layers repeat with no seam', () => {
  const scenery = require('../js/art/scenery.js');
  const { Grid } = require('../js/core/paint.js');
  ['spring', 'summer', 'loess', 'autumn', 'winter', 'void'].forEach((t) => {
    ['far', 'mid'].forEach((l) => {
      const g = scenery.layerGrid(t, l, 80);
      assert.ok(g instanceof Grid && g.wrap, t + l);
      // Compare the top of the ridge line on the two sides of the join.
      const topAt = (x) => {
        for (let y = 0; y < g.h; y++) if (g.get(x, y) !== -1) return y;
        return g.h;
      };
      const jump = Math.abs(topAt(0) - topAt(g.w - 1));
      if (t !== 'void') assert.ok(jump <= 8, `${t} ${l} seam jumps ${jump}px`);
    });
  });
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

test('the game source stays in one small package budget for art code', () => {
  // All art is drawn in code, so its code is its whole footprint in the package.
  const art = walk(path.join(ROOT, 'js/art')).reduce((n, f) => n + fs.statSync(f).size, 0);
  assert.ok(art < 150 * 1024, `art code is ${(art / 1024).toFixed(0)} KB`);
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
