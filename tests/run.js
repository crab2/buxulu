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
// Marks nodes cleared directly, as an old save's progress would be, without running any new rules.
function clearUpToRaw(s, id) {
  for (const f of FLAT) {
    if (f.node.type !== 'chest') s.progress.cleared[f.node.id] = true;
    if (f.node.type === 'boss') s.progress.stars = Math.max(s.progress.stars, f.ci + 1);
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
  // Single runs vary by several days, so a comparison between players needs a real sample.
  const RUNS = 12;
  const avg = (p) => {
    let t = 0;
    for (let i = 1; i <= RUNS; i++) {
      const r = run(1234 * i, PROFILES[p]);
      assert.ok(r.finished, `${p} did not finish`);
      t += r.days;
    }
    return t / RUNS;
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

// ---- Equipment ----
const F = require('../js/data/gear.js');
const Gear = require('../js/systems/gear.js');
const Gacha = require('../js/systems/gacha.js');

function wearSet(s, heroId, setId, rar) {
  F.SLOT_ORDER.forEach((slot) => Gear.equip(s, heroId, Gear.add(s, { set: setId, slot, rar: rar || 0 }).uid));
}
function joinAll(s, lv) {
  ['cen', 'ruo', 'zhuo'].forEach((id) => { s.heroes[id].joined = true; s.heroes[id].lv = lv || 30; });
}
function battleFor(s, foes, lv, rng) {
  return new Battle({ heroes: P.partyUnits(s), enemies: foes.map((f, i) => P.enemyUnit(f, lv, i)), stars: 3, items: {}, rng: rng || seeded(11) });
}

test('every piece in the catalogue resolves, and the odds add up', () => {
  assert.strictEqual(F.SET_ORDER.length, 7, 'one set for each star of the Dipper');
  F.SET_ORDER.forEach((id) => {
    const set = F.SETS[id];
    assert.ok(set.name && set.two.desc && set.four.name && set.four.desc, id);
    assert.ok(set.four.mods || set.four.party, `${id} has a four-piece effect that does something`);
    assert.ok(typeof set.two.value === 'number' && set.two.stat, id);
    G.HERO_ORDER.forEach((h) => assert.ok(set.fit[h] > 0, `${id} fit for ${h}`));
  });
  F.SLOT_ORDER.forEach((k) => assert.ok(F.SLOTS[k], k));
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum(F.DRAW_RATES) - 1) < 1e-9, 'draw odds add up to 1');
  assert.ok(Math.abs(sum(F.ROAD_RATES) - 1) < 1e-9, 'road odds add up to 1');
  assert.strictEqual(F.DRAW_RATES.length, F.RARITIES.length);
  assert.strictEqual(F.PROMOTE.length, F.RARITIES.length - 1);
  assert.strictEqual(F.BOSS_RARITY.length, CHAPTERS.length);
});

test('every set, slot and rarity can be drawn, and the icons exist', () => {
  const { gearIcon, cardFront, cardBack, letterBig } = require('../js/art/icons.js');
  F.SET_ORDER.forEach((id) => F.SLOT_ORDER.forEach((slot) => F.RARITIES.forEach((r, i) => {
    assert.ok(gearIcon(slot, F.SETS[id], i).d.some((c) => c !== -1), `${id} ${slot} ${i}`);
  })));
  F.RARITIES.forEach((r, i) => assert.ok(cardFront(i).d.some((c) => c !== -1)));
  assert.ok(cardBack().d.some((c) => c !== -1));
  assert.ok(letterBig().d.some((c) => c !== -1));
  ['gear', 'iron', 'letter'].forEach((k) => assert.ok(ICONS[k], k));
});

test('a piece strengthens its slot\'s stat, and more with rarity and level', () => {
  const s = E.defaultSave();
  const base = P.heroStats(s, 'cen');
  const p = Gear.add(s, { set: 'wolf', slot: 'blade', rar: 0 });
  assert.strictEqual(P.heroStats(s, 'cen').atk, base.atk, 'in the bag it does nothing');
  Gear.equip(s, 'cen', p.uid);
  const worn = P.heroStats(s, 'cen');
  assert.ok(worn.atk > base.atk);
  assert.strictEqual(worn.def, base.def);
  const low = { slot: 'blade', rar: 0, lv: 0 };
  assert.ok(Gear.value({ slot: 'blade', rar: 3, lv: 0 }) > Gear.value({ slot: 'blade', rar: 2, lv: 0 }));
  assert.ok(Gear.value({ slot: 'blade', rar: 0, lv: 5 }) > Gear.value(low));
  F.SLOT_ORDER.forEach((slot) => {
    const st = {};
    const q = Gear.add(s, { set: 'wolf', slot, rar: 1 });
    Gear.equip(s, 'ruo', q.uid);
    st[F.SLOTS[slot].stat] = true;
    assert.ok(Gear.mods(s, 'ruo')[F.SLOTS[slot].stat] > 0, slot);
  });
});

test('upgrades charge exactly, refuse when short, and change nothing when refused', () => {
  const s = E.defaultSave();
  const p = Gear.add(s, { set: 'wolf', slot: 'blade', rar: 0 });
  const c = F.levelCost(0);
  assert.strictEqual(Gear.levelUp(s, p.uid), false, 'no money');
  s.coin = c.coin;
  assert.strictEqual(Gear.levelUp(s, p.uid), false, 'no iron');
  assert.strictEqual(s.coin, c.coin, 'nothing was taken');
  s.gear.iron = c.iron;
  assert.strictEqual(Gear.levelUp(s, p.uid), true);
  assert.strictEqual(s.coin, 0);
  assert.strictEqual(s.gear.iron, 0);
  assert.strictEqual(Gear.find(s, p.uid).lv, 1);
});

test('a piece stops at its rarity\'s cap until promoted, and promotion keeps its levels', () => {
  const s = E.defaultSave();
  s.coin = 1e12;
  s.gear.iron = 1e6;
  const { uid } = Gear.add(s, { set: 'wolf', slot: 'blade', rar: 0 });
  const p = Gear.find(s, uid);
  assert.strictEqual(Gear.promote(s, uid), false, 'not at the cap yet');
  while (Gear.levelUp(s, uid));
  assert.strictEqual(p.lv, F.RARITIES[0].cap);
  assert.strictEqual(Gear.levelUp(s, uid), false);
  const before = Gear.value(p);
  assert.strictEqual(Gear.promote(s, uid), true);
  assert.strictEqual(p.rar, 1);
  assert.strictEqual(p.lv, F.RARITIES[0].cap, 'levels are kept');
  assert.ok(Gear.value(p) > before);
  assert.strictEqual(Gear.levelUp(s, uid), true, 'and there is room to climb again');
});

test('coins and iron alone take a plain piece from the road to the very top', () => {
  const s = E.defaultSave();
  s.coin = 1e12;
  s.gear.iron = 1e6;
  const dust = s.stardust;
  const { uid } = Gear.add(s, { set: 'wolf', slot: 'blade', rar: 0 });
  const p = Gear.find(s, uid);
  for (let guard = 0; guard < 200; guard++) {
    if (!Gear.levelUp(s, uid) && !Gear.promote(s, uid)) break;
  }
  assert.strictEqual(p.rar, F.RARITIES.length - 1);
  assert.strictEqual(p.lv, F.RARITIES[F.RARITIES.length - 1].cap);
  assert.strictEqual(Gear.nextStep(p), null);
  assert.strictEqual(s.stardust, dust, 'no Stardust anywhere on the way');
  assert.strictEqual(s.gacha.total, 0, 'and no draws');
});

test('a piece can only be worn by one hero at a time', () => {
  const s = E.defaultSave();
  const p = Gear.add(s, { set: 'wolf', slot: 'blade', rar: 0 });
  Gear.equip(s, 'cen', p.uid);
  Gear.equip(s, 'ruo', p.uid);
  assert.strictEqual(s.heroes.cen.gear.blade, null);
  assert.strictEqual(Gear.owner(s, p.uid), 'ruo');
  const q = Gear.add(s, { set: 'gate', slot: 'blade', rar: 0 });
  Gear.equip(s, 'ruo', q.uid);
  assert.strictEqual(Gear.owner(s, p.uid), null, 'a new piece replaces the old one in that slot');
});

test('set bonuses need 2 and 4 pieces of one set, of any rarity, on one hero', () => {
  const s = E.defaultSave();
  const wear = (id, set, slot, rar) => Gear.equip(s, id, Gear.add(s, { set, slot, rar }).uid);
  const two = F.SETS.gate.two;
  wear('cen', 'gate', 'blade', 0);
  assert.strictEqual(Gear.mods(s, 'cen').defPct, undefined, 'one piece is not a set');
  wear('cen', 'gate', 'boots', 3);
  assert.strictEqual(Gear.mods(s, 'cen').defPct, two.value, 'two pieces, mixed rarity');
  assert.strictEqual(Gear.mods(s, 'cen').lastStand, undefined, 'two pieces is not four');
  wear('cen', 'gate', 'charm', 1);
  assert.strictEqual(Gear.mods(s, 'cen').lastStand, undefined, 'three pieces is not four');
  wear('ruo', 'gate', 'coat', 0);
  assert.strictEqual(Gear.mods(s, 'cen').lastStand, undefined, 'pieces on another hero do not count');
  wear('cen', 'gate', 'coat', 0);
  assert.strictEqual(Gear.mods(s, 'cen').lastStand, F.SETS.gate.four.mods.lastStand);
});

test('two different sets can both be half worn', () => {
  const s = E.defaultSave();
  ['blade', 'coat'].forEach((slot) => Gear.equip(s, 'cen', Gear.add(s, { set: 'wolf', slot, rar: 0 }).uid));
  ['boots', 'charm'].forEach((slot) => Gear.equip(s, 'cen', Gear.add(s, { set: 'lian', slot, rar: 0 }).uid));
  const m = Gear.mods(s, 'cen');
  assert.strictEqual(m.crit, F.SETS.lian.two.value);
  assert.ok(m.atkPct > F.SETS.wolf.two.value, 'the set bonus adds to the piece\'s own attack');
});

// ---- The seven four-piece effects, each through the real combat code ----
test('贪狼: attack climbs with every action, up to its limit', () => {
  const s = E.defaultSave();
  joinAll(s);
  wearSet(s, 'cen', 'wolf');
  const b = battleFor(s, ['vineMother'], 30);
  const c = b.heroes[0];
  const start = b.stat(c, 'atk');
  b.perform(c, { kind: 'attack', target: b.enemies[0] });
  assert.ok(Math.abs(b.stat(c, 'atk') / start - 1.04) < 0.001, 'one action, one step');
  for (let i = 0; i < 20; i++) b.perform(c, { kind: 'guard' });
  assert.ok(Math.abs(b.stat(c, 'atk') / start - 1.04) < 0.001, 'guarding is not an attack');
  for (let i = 0; i < 20; i++) b.perform(c, { kind: 'attack', target: b.enemies[0] });
  assert.ok(Math.abs(b.stat(c, 'atk') / start - 1.24) < 0.001, 'stops at the limit');
  const fresh = battleFor(s, ['vineMother'], 30);
  assert.strictEqual(fresh.heroes[0].rage, undefined, 'and starts over next fight');
});

test('巨门: the first killing blow of a fight is survived, and only the first', () => {
  const s = E.defaultSave();
  joinAll(s);
  wearSet(s, 'zhuo', 'gate');
  const b = battleFor(s, ['vineMother'], 30);
  const z = b.heroes[2], foe = b.enemies[0];
  z.hp = 1;
  let ev = [];
  b.strike(foe, z, { power: 50 }, ev);
  assert.strictEqual(z.alive, true);
  assert.strictEqual(z.hp, Math.round(z.maxHp * 0.2));
  assert.ok(ev.some((e) => e.type === 'setfx' && e.text === '不破'));
  z.hp = 1;
  ev = [];
  b.strike(foe, z, { power: 50 }, ev);
  assert.strictEqual(z.alive, false, 'the second one lands');
  const other = battleFor(s, ['vineMother'], 30);
  const o = other.heroes[2];
  o.hp = 1;
  o.statuses.burn = 3;
  other.dot(o, 0.5, 'burn', []);
  assert.strictEqual(o.alive, true, 'a burn counts as a killing blow too');
});

test('禄存: road income rises for each hero wearing the full set', () => {
  const s = E.defaultSave();
  joinAll(s);
  const base = Idle.multipliers(s, T0);
  wearSet(s, 'cen', 'lu');
  assert.ok(Math.abs(Idle.multipliers(s, T0).coin - base.coin - 0.06) < 1e-9);
  assert.ok(Math.abs(Idle.multipliers(s, T0).xp - base.xp - 0.06) < 1e-9);
  wearSet(s, 'ruo', 'lu');
  assert.ok(Math.abs(Idle.multipliers(s, T0).coin - base.coin - 0.12) < 1e-9, 'it stacks');
  s.heroes.ruo.joined = false;
  assert.ok(Math.abs(Idle.multipliers(s, T0).coin - base.coin - 0.06) < 1e-9, 'only the party on the road counts');
});

test('禄存 pays out in the pack, not just on the label', () => {
  const plain = E.defaultSave();
  const rich = E.defaultSave();
  [plain, rich].forEach((s) => { joinAll(s); Idle.sync(s, T0); });
  wearSet(rich, 'cen', 'lu');
  Idle.sync(plain, T0 + HOUR);
  Idle.sync(rich, T0 + HOUR);
  assert.ok(Math.abs(rich.idle.pack.coin / plain.idle.pack.coin - 1.06) < 0.001, `${rich.idle.pack.coin} / ${plain.idle.pack.coin}`);
});

test('文曲: a spell can go off twice for one payment, and never on an empty field', () => {
  const s = E.defaultSave();
  joinAll(s);
  wearSet(s, 'cen', 'wen');
  const b = battleFor(s, ['vineMother'], 30, () => 0.01);
  const c = b.heroes[0];
  const mp = c.mp;
  const ev = b.perform(c, { kind: 'skill', id: 'cut', target: b.enemies[0] });
  assert.strictEqual(ev.filter((e) => e.type === 'hit').length, 2, 'two casts');
  assert.strictEqual(c.mp, mp - G.SKILLS.cut.mp, 'one payment');
  // The first cast finishes the fight: the echo must not swing at nothing.
  const d = battleFor(s, ['vine'], 1, () => 0.01);
  d.enemies[0].hp = 1;
  const ev2 = d.perform(d.heroes[0], { kind: 'skill', id: 'cut', target: d.enemies[0] });
  assert.strictEqual(d.outcome, 'win');
  assert.ok(!ev2.some((e) => e.text === '文心'));
  // Plain attacks are not spells.
  const e3 = battleFor(s, ['vineMother'], 30, () => 0.01);
  const ev3 = e3.perform(e3.heroes[0], { kind: 'attack', target: e3.enemies[0] });
  assert.strictEqual(ev3.filter((e) => e.type === 'hit').length, 1);
});

test('文曲: healing echoes too, and a revive is not wasted on a second cast', () => {
  const s = E.defaultSave();
  joinAll(s, 30);
  wearSet(s, 'ruo', 'wen');
  const b = battleFor(s, ['vineMother'], 30, () => 0.01);
  const r = b.heroes[1];
  b.heroes[0].hp = 1;
  const ev = b.perform(r, { kind: 'skill', id: 'mend', target: b.heroes[0] });
  assert.strictEqual(ev.filter((e) => e.type === 'heal').length, 2);
  const c = battleFor(s, ['vineMother'], 30, () => 0.01);
  c.heroes[0].alive = false;
  c.heroes[0].hp = 0;
  const ev2 = c.perform(c.heroes[1], { kind: 'skill', id: 'revive', target: c.heroes[0] });
  assert.ok(!ev2.some((e) => e.text === '文心'));
  assert.strictEqual(c.heroes[0].alive, true);
});

test('廉贞: strikes can break armour, and anyone already suffering takes more', () => {
  const s = E.defaultSave();
  joinAll(s);
  wearSet(s, 'cen', 'lian');
  const fixed = () => 0.5;
  const b = battleFor(s, ['vineMother'], 30, fixed);
  const c = b.heroes[0], foe = b.enemies[0];
  const clean = b.damage(c, foe, 1, null).amount;
  foe.statuses.burn = 3;
  const hurt = b.damage(c, foe, 1, null).amount;
  assert.ok(Math.abs(hurt / clean - 1.2) < 0.02, `${hurt} vs ${clean}`);
  delete foe.statuses.burn;
  foe.statuses.atkUp = 3;
  assert.strictEqual(b.damage(c, foe, 1, null).amount, clean, 'a buff is not an ailment');
  delete foe.statuses.atkUp;
  const d = battleFor(s, ['vineMother'], 30, () => 0.01);
  d.strike(d.heroes[0], d.enemies[0], { power: 0.01 }, []);
  assert.ok(d.enemies[0].statuses.weak, 'armour broken');
});

test('武曲: being struck can strike back, counters never chain, and one can end a fight', () => {
  const s = E.defaultSave();
  joinAll(s);
  wearSet(s, 'zhuo', 'wu');
  const b = battleFor(s, ['vineMother'], 30, () => 0.01);
  const z = b.heroes[2], foe = b.enemies[0];
  const ev = [];
  b.strike(foe, z, { power: 0.1 }, ev);
  assert.strictEqual(ev.filter((e) => e.type === 'hit').length, 2, 'one blow, one reply');
  assert.ok(ev.some((e) => e.text === '镇岳'));
  // Two heroes who both counter must not bounce blows between enemies and themselves forever.
  const c = battleFor(s, ['vineMother'], 30, () => 0.99);
  const ev2 = [];
  c.strike(c.enemies[0], c.heroes[2], { power: 0.1 }, ev2);
  assert.strictEqual(ev2.filter((e) => e.type === 'hit').length, 1, 'a failed roll is no reply');
  // A sweep cut short by a counter that kills the attacker.
  const k = battleFor(s, ['vine'], 1, () => 0.01);
  k.enemies[0].hp = 1;
  const ev3 = [];
  k.heroes.forEach((h) => k.strike(k.enemies[0], h, { power: 0.1 }, ev3));
  assert.strictEqual(k.enemies[0].alive, false);
  assert.strictEqual(k.check(), 'win');
  assert.ok(ev3.filter((e) => e.type === 'hit').every((e) => e.amount > 0));
  // Nor does a hero's own hit on an enemy count as being struck.
  const ally = battleFor(s, ['vineMother'], 30, () => 0.01);
  const ev4 = [];
  ally.strike(ally.heroes[2], ally.enemies[0], { power: 0.1 }, ev4);
  assert.strictEqual(ev4.filter((e) => e.type === 'hit').length, 1);
});

test('破军: the star gauge starts charged, and critical hits feed it', () => {
  const s = E.defaultSave();
  joinAll(s);
  const plain = battleFor(s, ['vineMother'], 30);
  assert.strictEqual(plain.ult, 0);
  wearSet(s, 'cen', 'po');
  const b = battleFor(s, ['vineMother'], 30, () => 0.01);
  assert.strictEqual(b.ult, F.SETS.po.four.mods.ultStart);
  const before = b.ult;
  b.strike(b.heroes[0], b.enemies[0], { power: 0.1 }, []);
  assert.strictEqual(b.ult, before + 5 + F.SETS.po.four.mods.ultCrit, 'the usual 5, plus the bonus for a critical');
  wearSet(s, 'ruo', 'po');
  wearSet(s, 'zhuo', 'po');
  const full = battleFor(s, ['vineMother'], 30);
  assert.ok(full.ult <= 100, 'the gauge never overfills');
});

test('every fight still ends with every set effect in play at once', () => {
  F.SET_ORDER.forEach((setId) => {
    CHAPTERS.forEach((c) => c.nodes.forEach((n) => {
      if (!n.foes) return;
      const s = E.defaultSave();
      joinAll(s, n.lv + 3);
      ['cen', 'ruo', 'zhuo'].forEach((id) => wearSet(s, id, setId));
      const b = battleFor(s, n.foes, n.lv, seeded(n.lv * 13));
      let guard = 0;
      while (!b.outcome && guard++ < 3000) {
        const t = b.next();
        if (t.skip) continue;
        if (t.actor.side === 'enemy') b.performEnemy(t.actor, b.enemyAction(t.actor));
        else b.perform(t.actor, b.autoAction(t.actor));
      }
      assert.ok(b.outcome, `no outcome in ${n.id} wearing ${setId}`);
    }));
  });
});

// ---- Getting pieces ----
test('sets open one by one as the stars are lit', () => {
  const s = E.defaultSave();
  assert.deepStrictEqual(Gear.openSets(s), ['wolf']);
  s.progress.stars = 2;
  assert.deepStrictEqual(Gear.openSets(s), ['wolf', 'gate', 'lu']);
  s.progress.stars = 6;
  assert.strictEqual(Gear.openSets(s).length, 7, 'finishing the story opens the last set, whichever ending was chosen');
});

test('the road brings gear and iron only once equipment has opened, and they wait in the pack', () => {
  const s = E.defaultSave();
  Idle.sync(s, T0);
  Idle.sync(s, T0 + 9 * HOUR);
  assert.strictEqual(s.idle.pack.iron || 0, 0, 'the first session stays simple');
  assert.strictEqual((s.idle.pack.gear || []).length, 0);
  const t = E.defaultSave();
  clearUpTo(t, 'c1b');
  t.gear.bag = [];
  t.gear.fresh = 0;
  Idle.sync(t, T0);
  Idle.sync(t, T0 + 10 * HOUR, seededRng(5));
  assert.ok(t.idle.pack.iron > 15 && t.idle.pack.iron <= 21, `iron ${t.idle.pack.iron}`);
  assert.ok(t.idle.pack.gear.length >= 1, 'found something');
  assert.strictEqual(t.gear.bag.length, 0, 'nothing is added until the pack is collected');
  assert.strictEqual(Idle.packEmpty(t), false);
  const n = t.idle.pack.gear.length;
  const iron = Math.floor(t.idle.pack.iron);
  const got = Idle.collect(t);
  assert.strictEqual(t.gear.bag.length, n);
  assert.strictEqual(got.gear.length, n);
  assert.strictEqual(t.gear.iron, iron);
  assert.strictEqual(Idle.collect(t).gear.length, 0, 'and only once');
  assert.ok(t.gear.fresh >= n, 'and the tab shows a marker');
});

test('old-format packs without the new fields still collect', () => {
  const s = E.defaultSave();
  s.idle.pack = { coin: 100, xp: 0, dust: 0, items: {}, spirits: {}, herbs: {} };
  assert.strictEqual(Idle.packEmpty(s), false);
  const got = Idle.collect(s);
  assert.deepStrictEqual(got.gear, []);
  assert.strictEqual(got.iron, 0);
  assert.strictEqual(Idle.packEmpty(s), true);
});

test('a boss hands over a piece of the set its star opens, the first time only', () => {
  const s = E.defaultSave();
  joinAll(s);
  clearUpTo(s, 'c1g');
  const before = s.gear.bag.length;
  const foes = [P.enemyUnit('vineMother', 6, 0)];
  const r = E.battleRewards(s, foes, 'c1h');
  assert.ok(r.gear, 'a piece was handed over');
  assert.strictEqual(r.gear.set, 'gate');
  assert.strictEqual(s.gear.bag.length, before + 1);
  E.clearNode(s, 'c1h');
  const again = E.battleRewards(s, foes, 'c1h');
  assert.strictEqual(again.gear, null);
  assert.strictEqual(E.battleRewards(s, [P.enemyUnit('vine', 2, 0)], 'c1a').gear, null, 'plain fights do not');
  assert.strictEqual(E.battleRewards(s, foes).gear, null, 'nor fights off the road');
});

test('reaching the first companion hands over a starter pair, worn and with a set bonus', () => {
  const s = E.defaultSave();
  clearUpTo(s, 'c1a');
  assert.strictEqual(s.gear.bag.length, 0);
  clearUpTo(s, 'c1b');
  assert.strictEqual(s.gear.bag.length, 2);
  assert.strictEqual(Gear.mods(s, 'cen').atkPct > F.SETS.wolf.two.value, true);
  E.grantMilestones(s);
  assert.strictEqual(s.gear.bag.length, 2, 'it only happens once');
});

test('forging makes a chosen piece of any open set, and refuses a closed one', () => {
  const s = E.defaultSave();
  s.coin = F.FORGE.coin * 3;
  s.gear.iron = F.FORGE.iron * 3;
  assert.strictEqual(Gear.forge(s, 'gate', 'coat'), null, 'closed');
  assert.strictEqual(s.coin, F.FORGE.coin * 3, 'and it cost nothing');
  const p = Gear.forge(s, 'wolf', 'coat');
  assert.strictEqual(p.set, 'wolf');
  assert.strictEqual(p.slot, 'coat');
  assert.strictEqual(p.rar, 0);
  assert.strictEqual(s.coin, F.FORGE.coin * 2);
  assert.strictEqual(s.gear.iron, F.FORGE.iron * 2);
  s.coin = 0;
  assert.strictEqual(Gear.forge(s, 'wolf', 'boots'), null, 'cannot pay');
  assert.strictEqual(s.gear.iron, F.FORGE.iron * 2);
});

test('any set can be completed with no draws, no Stardust and no luck', () => {
  const s = E.defaultSave();
  s.progress.stars = 6;
  s.coin = F.FORGE.coin * 4 * F.SET_ORDER.length;
  s.gear.iron = F.FORGE.iron * 4 * F.SET_ORDER.length;
  F.SET_ORDER.forEach((id) => {
    F.SLOT_ORDER.forEach((slot) => {
      const p = Gear.forge(s, id, slot);
      assert.ok(p, `${id} ${slot}`);
      Gear.equip(s, 'cen', p.uid);
    });
    assert.strictEqual(Gear.setCounts(s, 'cen')[id], 4);
  });
  assert.strictEqual(s.stardust, 0);
  assert.strictEqual(s.gacha.total, 0);
});

// ---- Breaking down ----
test('breaking down pays iron, gives back part of the upgrades, and spares anything worn', () => {
  const s = E.defaultSave();
  const p = Gear.add(s, { set: 'wolf', slot: 'blade', rar: 2 });
  Gear.equip(s, 'cen', p.uid);
  assert.strictEqual(Gear.salvage(s, p.uid), null, 'worn pieces are safe');
  assert.ok(Gear.find(s, p.uid));
  Gear.unequip(s, 'cen', 'blade');
  const v = Gear.salvage(s, p.uid);
  assert.strictEqual(v.iron, F.RARITIES[2].salvage);
  assert.strictEqual(s.gear.iron, F.RARITIES[2].salvage);
  assert.strictEqual(Gear.find(s, p.uid), null);
  assert.strictEqual(Gear.salvage(s, p.uid), null, 'it cannot pay twice');
  const q = Gear.add(s, { set: 'wolf', slot: 'blade', rar: 0 });
  s.coin = 1e6;
  s.gear.iron = 1000;
  Gear.levelUp(s, q.uid);
  Gear.levelUp(s, q.uid);
  const spent = F.levelCost(0).coin + F.levelCost(1).coin;
  const r = Gear.salvageValue(Gear.find(s, q.uid));
  assert.ok(r.coin > 0 && r.coin < spent, 'part of the coins come back, never more than was paid');
});

test('one-tap breakdown never touches anything worn, rare, or the best copy of a piece', () => {
  const s = E.defaultSave();
  const make = (set, slot, rar) => Gear.add(s, { set, slot, rar }).uid;
  const worn = make('wolf', 'blade', 0);
  Gear.equip(s, 'cen', worn);
  const bestSpare = make('wolf', 'blade', 1);
  const lesser = make('wolf', 'blade', 0);
  const rareA = make('wolf', 'coat', 3);
  const rareB = make('wolf', 'coat', 2);
  const only = make('wolf', 'boots', 0);
  const uids = Gear.spares(s).map((p) => p.uid);
  assert.deepStrictEqual(uids, [lesser]);
  const r = Gear.salvageSpares(s);
  assert.strictEqual(r.n, 1);
  [worn, bestSpare, rareA, rareB, only].forEach((u) => assert.ok(Gear.find(s, u), u));
  assert.strictEqual(Gear.find(s, lesser), null);
  assert.strictEqual(Gear.salvageSpares(s).n, 0, 'nothing is left to offer');
});

test('a full bag makes room from the weakest piece nobody wears, and pays for it', () => {
  const s = E.defaultSave();
  const worn = Gear.add(s, { set: 'wolf', slot: 'blade', rar: 0 });
  Gear.equip(s, 'cen', worn.uid);
  for (let i = 0; i < F.BAG_CAP - 2; i++) Gear.add(s, { set: 'wolf', slot: 'coat', rar: 2 });
  const weak = Gear.add(s, { set: 'wolf', slot: 'boots', rar: 1 });
  assert.strictEqual(s.gear.bag.length, F.BAG_CAP);
  const iron = s.gear.iron;
  const fresh = Gear.add(s, { set: 'wolf', slot: 'charm', rar: 3 });
  assert.strictEqual(s.gear.bag.length, F.BAG_CAP, 'the bag never grows past its limit');
  assert.ok(Gear.find(s, fresh.uid), 'the new piece is kept');
  assert.ok(Gear.find(s, worn.uid), 'the worn one is safe, though it is the weakest of all');
  assert.strictEqual(Gear.find(s, weak.uid), null);
  assert.strictEqual(s.gear.iron, iron + F.RARITIES[1].salvage);
});

// ---- One-tap helpers ----
test('one-tap equip dresses everyone who has joined, and never shares a piece', () => {
  const s = E.defaultSave();
  s.heroes.ruo.joined = true;
  s.progress.stars = 3;
  const rng = seededRng(3);
  for (let i = 0; i < 40; i++) Gear.add(s, Gear.rollDrop(s, rng));
  assert.strictEqual(Gear.autoEquip(s), true);
  const all = [];
  ['cen', 'ruo'].forEach((id) => {
    F.SLOT_ORDER.forEach((k) => { if (s.heroes[id].gear[k]) all.push(s.heroes[id].gear[k]); });
  });
  assert.ok(all.length >= 6);
  assert.strictEqual(new Set(all).size, all.length, 'a piece on two heroes');
  all.forEach((u) => assert.ok(Gear.find(s, u), u));
  F.SLOT_ORDER.forEach((k) => assert.strictEqual(s.heroes.zhuo.gear[k], null, 'nobody dresses before joining'));
  assert.strictEqual(Gear.autoEquip(s), false, 'a second tap changes nothing');
});

test('one-tap equip picks a pre-made full set over slightly better loose pieces', () => {
  const s = E.defaultSave();
  F.SLOT_ORDER.forEach((slot) => Gear.add(s, { set: 'wolf', slot, rar: 0 }));
  s.progress.stars = 1;
  Gear.add(s, { set: 'gate', slot: 'blade', rar: 0 });
  Gear.autoEquip(s);
  assert.strictEqual(Gear.setCounts(s, 'cen').wolf, 4);
});

test('one-tap upgrade stays inside its budget and spends only what is there', () => {
  const s = E.defaultSave();
  const p = Gear.add(s, { set: 'wolf', slot: 'blade', rar: 0 });
  Gear.equip(s, 'cen', p.uid);
  Gear.add(s, { set: 'wolf', slot: 'coat', rar: 0 });
  s.coin = 1e6;
  s.gear.iron = 1e3;
  const r = Gear.autoUpgrade(s, 2000);
  assert.ok(r.n > 0);
  assert.ok(r.spent <= 2000);
  assert.strictEqual(s.coin, 1e6 - r.spent);
  const t = E.defaultSave();
  const q = Gear.add(t, { set: 'wolf', slot: 'blade', rar: 0 });
  Gear.equip(t, 'cen', q.uid);
  t.coin = 500;
  t.gear.iron = 0;
  assert.strictEqual(Gear.autoUpgrade(t).n, 0, 'no iron, no upgrade');
  assert.strictEqual(t.coin, 500);
  assert.strictEqual(s.gear.bag.find((x) => x.slot === 'coat').lv, 0, 'unworn pieces are left alone');
});

test('one-tap upgrade promotes when a piece reaches its cap', () => {
  const s = E.defaultSave();
  const p = Gear.add(s, { set: 'wolf', slot: 'blade', rar: 0 });
  Gear.equip(s, 'cen', p.uid);
  s.coin = 1e12;
  s.gear.iron = 1e6;
  Gear.autoUpgrade(s);
  const top = F.RARITIES.length - 1;
  assert.strictEqual(Gear.find(s, p.uid).rar, top);
  assert.strictEqual(Gear.find(s, p.uid).lv, F.RARITIES[top].cap);
  assert.strictEqual(s.gear.seen.wolf_blade, top, 'and the record of the best seen keeps up');
});

// ---- Saves ----
test('saves from before equipment gain it, and collect what they have already earned', () => {
  const old = E.defaultSave();
  delete old.gear;
  delete old.gacha;
  ['cen', 'ruo', 'zhuo'].forEach((id) => { delete old.heroes[id].gear; });
  old.idle.pack = { coin: 5, xp: 0, dust: 0, items: {}, spirits: {}, herbs: {} };
  delete old.idle.carry.gear;
  clearUpToRaw(old, 'c2h');
  const s = E.upgrade(JSON.parse(JSON.stringify(old)));
  assert.strictEqual(s.gacha.tickets, F.STAR_TICKETS(1) + F.STAR_TICKETS(2), 'a letter gift for each star already lit');
  assert.strictEqual(s.gear.bag.length, 2, 'and the starter pair');
  assert.ok(s.heroes.cen.gear.blade);
  assert.strictEqual(s.idle.pack.coin, 5, 'nothing else moved');
  const twice = E.upgrade(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(twice.gacha.tickets, s.gacha.tickets, 'loading again gives nothing more');
  assert.strictEqual(twice.gear.bag.length, 2);
});

test('gifts for lit stars pay once each, however they are reached', () => {
  const s = E.defaultSave();
  assert.strictEqual(s.gacha.tickets, 0);
  clearUpTo(s, 'c1h');
  assert.strictEqual(s.gacha.tickets, F.STAR_TICKETS(1));
  E.clearNode(s, 'c1h');
  assert.strictEqual(s.gacha.tickets, F.STAR_TICKETS(1), 'replaying a boss pays no second gift');
  clearUpTo(s, 'c2h');
  assert.strictEqual(s.gacha.tickets, F.STAR_TICKETS(1) + F.STAR_TICKETS(2));
});

// ---- The draw ----
function drawSave(tickets, stars) {
  const s = E.defaultSave();
  s.progress.stars = stars === undefined ? 6 : stars;
  s.gacha.tickets = tickets;
  return s;
}

test('a draw spends letters and adds pieces, and is refused without enough letters', () => {
  const s = drawSave(3);
  assert.strictEqual(Gacha.draw(s, 10), null);
  assert.strictEqual(s.gacha.tickets, 3, 'nothing was taken');
  const r = Gacha.draw(s, 1, seededRng(1));
  assert.strictEqual(r.length, 1);
  assert.strictEqual(s.gacha.tickets, 2);
  assert.strictEqual(s.gear.bag.length, 1);
  assert.ok(Gear.find(s, r[0].uid));
  assert.strictEqual(r[0].lv, 0);
  assert.strictEqual(s.gacha.total, 1);
});

test('the published odds are what actually happens', () => {
  const N = 200000;
  const s = drawSave(N);
  s.gear.bag = [];
  const counts = [0, 0, 0, 0];
  const rng = seededRng(99);
  // Draws in small batches and clears the bag, so this measures the odds and not the bag limit.
  for (let i = 0; i < N; i += 100) {
    Gacha.draw(s, 100, rng).forEach((p) => counts[p.rar]++);
    s.gear.bag = [];
  }
  const real = Gacha.effectiveRates();
  F.RARITIES.forEach((r, i) => {
    const seen = counts[i] / N;
    assert.ok(Math.abs(seen - real[i]) < 0.002, `${r.name}: told ${real[i]}, saw ${seen}`);
  });
  assert.ok(Math.abs(real.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'the rates on screen add up to 100%');
});

test('guarantees: bad luck has a hard limit, and it is exactly what the screen says', () => {
  const s = drawSave(F.PITY_TOP * 5);
  const worst = () => 0.999; // Always the lowest rarity on the table.
  let sinceTop = 0, sinceRare = 0, tops = 0;
  for (let i = 0; i < F.PITY_TOP * 5; i++) {
    const [p] = Gacha.draw(s, 1, worst);
    sinceTop++;
    sinceRare++;
    if (p.rar === 3) { assert.strictEqual(sinceTop, F.PITY_TOP); sinceTop = 0; tops++; }
    if (p.rar >= 2) { assert.ok(sinceRare <= F.PITY_RARE, `${sinceRare} without a rare`); sinceRare = 0; }
    s.gear.bag = [];
  }
  assert.strictEqual(tops, 5);
});

test('every ten letters hold a rare piece, even on the worst luck', () => {
  const s = drawSave(10);
  const r = Gacha.draw(s, 10, () => 0.999);
  assert.ok(r.some((p) => p.rar >= 2));
});

test('a lucky top piece resets its guarantee', () => {
  const s = drawSave(2);
  s.gacha.sinceTop = 40;
  s.gacha.sinceRare = 7;
  Gacha.draw(s, 1, () => 0);
  assert.strictEqual(s.gacha.sinceTop, 0);
  assert.strictEqual(s.gacha.sinceRare, 0);
});

test('only open sets can come out, however lucky the draw', () => {
  const s = drawSave(600, 1);
  const seen = new Set();
  const rng = seededRng(7);
  for (let i = 0; i < 600; i += 10) {
    Gacha.draw(s, 10, rng).forEach((p) => seen.add(p.set));
    s.gear.bag = [];
  }
  assert.deepStrictEqual(Array.from(seen).sort(), ['gate', 'wolf']);
});

test('a wish steers half of the rare pieces, and no common ones', () => {
  const s = drawSave(30000);
  assert.strictEqual(Gacha.setWish(s, 'wu'), true);
  const rng = seededRng(8);
  let rare = 0, wished = 0, common = 0, commonWished = 0;
  for (let i = 0; i < 30000; i += 100) {
    Gacha.draw(s, 100, rng).forEach((p) => {
      if (p.rar >= 2) {
        rare++;
        if (p.set === 'wu') wished++;
      } else {
        common++;
        if (p.set === 'wu') commonWished++;
      }
    });
    s.gear.bag = [];
  }
  // Half by wish, plus the other half's fair chance of landing on it anyway.
  const expected = F.WISH_SHARE + (1 - F.WISH_SHARE) / 7;
  assert.ok(Math.abs(wished / rare - expected) < 0.03, `${wished / rare} vs ${expected}`);
  assert.ok(Math.abs(commonWished / common - 1 / 7) < 0.02, `${commonWished / common}`);
});

test('a wish can only name an open set', () => {
  const s = drawSave(0, 0);
  assert.strictEqual(Gacha.setWish(s, 'po'), false);
  assert.strictEqual(s.gacha.wish, null);
  assert.strictEqual(Gacha.setWish(s, 'wolf'), true);
  assert.strictEqual(Gacha.setWish(s, null), true);
  assert.strictEqual(s.gacha.wish, null);
});

test('buying letters is capped per day, charges fairly and resets the next day', () => {
  const s = drawSave(0);
  s.coin = 1e9;
  s.stardust = 1e6;
  const day = 500;
  const price = Gacha.ticketCoinCost(s);
  for (let i = 0; i < F.TICKET_COIN_DAILY; i++) assert.ok(Gacha.buyWithCoin(s, day));
  assert.strictEqual(Gacha.buyWithCoin(s, day), false, 'coin limit');
  for (let i = 0; i < F.TICKET_DUST_DAILY; i++) assert.ok(Gacha.buyWithDust(s, day));
  assert.strictEqual(Gacha.buyWithDust(s, day), false, 'Stardust limit');
  assert.strictEqual(s.gacha.tickets, F.TICKET_COIN_DAILY + F.TICKET_DUST_DAILY);
  assert.strictEqual(s.coin, 1e9 - price * F.TICKET_COIN_DAILY);
  assert.strictEqual(s.stardust, 1e6 - F.TICKET_DUST * F.TICKET_DUST_DAILY);
  assert.ok(Gacha.buyWithCoin(s, day + 1), 'the next day');
  assert.ok(Gacha.buyWithDust(s, day + 1));
  const poor = drawSave(0);
  assert.strictEqual(Gacha.buyWithCoin(poor, day), false);
  assert.strictEqual(Gacha.buyWithDust(poor, day), false);
  assert.strictEqual(poor.gacha.tickets, 0);
  assert.strictEqual(poor.gacha.boughtCoin, 0, 'a refused purchase does not use up the allowance');
});

test('the coin price of a letter follows road income, so it stays meaningful', () => {
  const early = E.defaultSave();
  const late = E.defaultSave();
  clearUpTo(late, 'c5h');
  assert.ok(Gacha.ticketCoinCost(late) > Gacha.ticketCoinCost(early));
  assert.ok(Gacha.ticketCoinCost(late) > 0);
});

test('letters come from playing: daily bonus, the sky stair, wandering and the road', () => {
  const s = E.defaultSave();
  const day = 100;
  ['collect', 'train', 'dispatch', 'garden'].forEach((id) => { Daily.mark(s, id, day); Daily.claim(s, id, day); });
  Daily.claimBonus(s, day);
  assert.strictEqual(s.gacha.tickets, W.DAILY_BONUS.tickets);
  assert.strictEqual(s.steps.total, 0, 'with no real steps');

  const t = E.defaultSave();
  for (let f = 1; f <= 10; f++) Tower.win(t, f);
  assert.strictEqual(t.gacha.tickets, 1 + 3, 'floor 5 and floor 10');
  assert.strictEqual(Tower.reward(3).tickets, 0);
  Tower.win(t, 5);
  assert.strictEqual(t.gacha.tickets, 4, 'a floor pays only the first time');

  const w = E.defaultSave();
  w.wander.pos = W.BOARD.length - 1;
  w.wander.rolls = 1;
  w.wander.regen = T0 + HOUR;
  Wander.roll(w, T0, () => 0.1);
  assert.strictEqual(w.gacha.tickets, Wander.LAP_TICKETS, 'going all the way round');

  const r = E.defaultSave();
  clearUpTo(r, 'c1h');
  const gift = r.gacha.tickets;
  Idle.sync(r, T0);
  r.idle.secs = 0;
  r.blessings.pack = 10;
  for (let h = 1; h <= 24; h++) Idle.sync(r, T0 + h * HOUR);
  const got = Idle.collect(r);
  assert.ok(got.tickets >= 1, 'a slow trickle on the road');
  assert.strictEqual(r.gacha.tickets, gift + got.tickets);
});

test('speed boosts do not hurry the letters along', () => {
  const plain = E.defaultSave();
  const fast = E.defaultSave();
  [plain, fast].forEach((s) => { clearUpTo(s, 'c1h'); Idle.sync(s, T0); });
  fast.idle.hasteSecs = 10 * HOUR / 1000;
  Idle.sync(plain, T0 + 5 * HOUR);
  Idle.sync(fast, T0 + 5 * HOUR);
  assert.ok(fast.idle.pack.coin > plain.idle.pack.coin * 1.5);
  assert.ok(Math.abs(fast.idle.pack.tickets - plain.idle.pack.tickets) < 1e-9);
});

// ---- The rule the whole design rests on, applied to the new systems ----
test('equipment and the draw never read real steps', () => {
  ['js/systems/gear.js', 'js/systems/gacha.js', 'js/data/gear.js'].forEach((f) => {
    assert.ok(!/steps/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), `${f} mentions steps`);
  });
});

test('balance: gear helps, drawing helps a little, and neither is needed to finish', () => {
  const { run, PROFILES } = require('./simulate.js');
  const RUNS = 8;
  const avg = (p) => {
    let t = 0;
    for (let i = 1; i <= RUNS; i++) {
      const r = run(4321 * i, PROFILES[p]);
      assert.ok(r.finished, `${p} did not finish`);
      t += r.days;
    }
    return t / RUNS;
  };
  const draws = avg('noneActive');
  const never = avg('noDraw');
  const ignores = avg('noGear');
  assert.ok(draws <= 25, `the published pace has drifted: ${draws} days`);
  assert.ok(never / draws <= 1.3, `never drawing must stay close to drawing: ${never} vs ${draws}`);
  assert.ok(ignores > never, `equipment should be worth using: ${ignores} vs ${never}`);
  assert.ok(ignores <= 45, `ignoring equipment should still finish in reasonable time, took ${ignores} days`);
  // Walking buys speed. Spending that Stardust on letters must not beat spending it on speed.
  const speed = avg('typical');
  const letters = avg('walkDraw');
  assert.ok(letters >= speed, `letters should not outrun speed boosts: ${letters} vs ${speed}`);
});

test('the save stays small even with a full bag of equipment', () => {
  const s = E.defaultSave();
  s.progress.stars = 6;
  const rng = seededRng(2);
  for (let i = 0; i < F.BAG_CAP * 2; i++) Gear.add(s, Gear.rollDrop(s, rng));
  assert.strictEqual(s.gear.bag.length, F.BAG_CAP);
  const size = JSON.stringify(s.gear).length;
  assert.ok(size < 10 * 1024, `equipment takes ${size} bytes`);
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

// ---- Audio ----
// A stand-in for a phone's audio, harsher than a browser: nothing plays unless the test says so, and events only
// arrive when the test sends them.
function audioPhone() {
  const made = [];
  const phone = { made, option: null, begin: null, end: null };
  global.wx = {
    createInnerAudioContext() {
      const c = { plays: 0, pauses: 0, destroyed: false, on: {}, currentTime: 0, atSrc: null };
      ['onCanplay', 'onPlay', 'onPause', 'onStop', 'onEnded', 'onError', 'onTimeUpdate'].forEach((e) => { c[e] = (h) => { c.on[e] = h; }; });
      c.play = () => { c.plays++; };
      c.pause = () => { c.pauses++; };
      c.destroy = () => { c.destroyed = true; };
      Object.defineProperty(c, 'src', { set(v) { c.path = v; c.atSrc = { autoplay: c.autoplay, loop: c.loop, volume: c.volume }; } });
      made.push(c);
      return c;
    },
    setInnerAudioOption(o) { phone.option = o; },
    onAudioInterruptionBegin(h) { phone.begin = h; },
    onAudioInterruptionEnd(h) { phone.end = h; },
  };
  const key = require.resolve('../js/core/audio.js');
  delete require.cache[key];
  phone.audio = require(key);
  phone.audio.setup();
  phone.audio.configure({ bgm: true, sfx: true, vibrate: true });
  return phone;
}
const audioTest = (name, fn) => test(`music: ${name}`, () => {
  try {
    fn(audioPhone());
  } finally {
    delete global.wx;
  }
});

audioTest('the file is named last, with autoplay, looping and volume already set', ({ audio, made }) => {
  audio.bgm('road');
  assert.strictEqual(made[0].path, 'assets/audio/bgm_road.mp3');
  assert.deepStrictEqual(made[0].atSrc, { autoplay: true, loop: true, volume: 0.45 });
});

audioTest('a phone on mute stays silent, because the game never overrides the mute switch', ({ option }) => {
  assert.strictEqual(option, null);
});

audioTest('asks again when loaded and every second until the phone says it is playing, then stops asking', ({ audio, made }) => {
  audio.bgm('road');
  const c = made[0];
  c.on.onCanplay();
  assert.strictEqual(c.plays, 1, 'asked once the file could play');
  audio.keep();
  assert.strictEqual(c.plays, 2, 'autoplay and that play() were both ignored, so it asks again');
  c.on.onPlay();
  audio.keep();
  audio.keep();
  assert.strictEqual(c.plays, 2, 'a tune that is playing is left alone');
});

audioTest('moving between screens with the same tune does not disturb it', ({ audio, made }) => {
  audio.bgm('road');
  made[0].on.onPlay();
  audio.bgm('road');
  audio.bgm('road');
  assert.strictEqual(made.length, 1);
  assert.strictEqual(made[0].plays, 0);
  assert.strictEqual(made[0].pauses, 0);
});

audioTest('a new tune pauses the old one, and the old one carries on when it returns', ({ audio, made }) => {
  audio.bgm('road');
  made[0].on.onPlay();
  audio.bgm('battle');
  assert.strictEqual(made[0].pauses, 1);
  assert.strictEqual(made[0].destroyed, false);
  made[0].on.onPause();
  made[1].on.onPlay();
  audio.bgm(null);
  assert.strictEqual(made[1].pauses, 1, 'the win and lose jingles play over silence');
  audio.bgm('road');
  assert.strictEqual(made.length, 2, 'no second copy of the road tune');
  assert.strictEqual(made[0].plays, 1);
});

audioTest('a slow tune that starts after the player moved on is stopped at once, so two never play together', ({ audio, made }) => {
  audio.bgm('title');
  audio.bgm('road');
  made[1].on.onPlay();
  const before = made[0].pauses;
  made[0].on.onPlay();
  assert.strictEqual(made[0].pauses, before + 1);
  audio.keep();
  assert.strictEqual(made[0].plays, 0);
  assert.strictEqual(made[1].plays, 0);
});

audioTest('comes back after a call, and does not fight it while it lasts', ({ audio, made, begin, end }) => {
  audio.bgm('road');
  made[0].on.onPlay();
  begin();
  audio.keep();
  assert.strictEqual(made[0].plays, 0, 'nothing can play during the interruption');
  end();
  assert.strictEqual(made[0].plays, 1, 'asked as soon as it ended, although the phone never reported a pause');
});

audioTest('going to the background pauses it, coming back plays it, even if the end of a call was missed', ({ audio, made, begin }) => {
  audio.bgm('road');
  made[0].on.onPlay();
  audio.pause();
  assert.strictEqual(made[0].pauses, 1);
  audio.keep();
  assert.strictEqual(made[0].plays, 0);
  made[0].on.onPlay();
  assert.strictEqual(made[0].pauses, 2, 'a slow start while away is stopped');
  begin();
  audio.resume();
  assert.strictEqual(made[0].plays, 1);
});

audioTest('the music switch is obeyed, including at the very first start', ({ audio, made }) => {
  const off = { bgm: false, sfx: true };
  audio.configure(off);
  audio.bgm('road');
  assert.strictEqual(made[0].atSrc.autoplay, false);
  audio.keep();
  assert.strictEqual(made[0].plays, 0);
  assert.ok(audio.report().startsWith('set0 '), audio.report());
  audio.configure({ bgm: true, sfx: true });
  assert.strictEqual(made[0].plays, 1);
  made[0].on.onPlay();
  audio.configure(off);
  assert.strictEqual(made[0].pauses, 1);
});

audioTest('a tune that ends despite looping starts again', ({ audio, made }) => {
  audio.bgm('road');
  made[0].on.onPlay();
  made[0].on.onEnded();
  audio.keep();
  assert.strictEqual(made[0].plays, 1);
});

audioTest('a failed file is reported and left alone until a screen asks for it again', ({ audio, made }) => {
  audio.bgm('road');
  made[0].on.onError({ errCode: 10003, errMsg: 'file error' });
  audio.keep();
  audio.keep();
  assert.strictEqual(made[0].plays, 0, 'no hammering a file that is not there');
  assert.ok(audio.report().includes('e10003'), audio.report());
  audio.bgm('road');
  assert.strictEqual(made[0].destroyed, true);
  assert.strictEqual(made.length, 2);
  assert.ok(audio.report().includes('e-'), audio.report());
});

audioTest('the report says what is happening, in characters the font is sure to have', ({ audio, made }) => {
  assert.strictEqual(audio.report(), 'bgm none s-');
  audio.bgm('road');
  assert.strictEqual(audio.report(), 'bgm road off t0 file? e- s-');
  made[0].on.onPlay();
  made[0].currentTime = 12.4;
  assert.strictEqual(audio.report(), 'bgm road on t12 file? e- s-');
  global.wx.getFileSystemManager = () => ({ accessSync() { throw new Error('no such file'); } });
  audio.bgm('battle');
  assert.strictEqual(audio.report(), 'bgm battle off t0 file0 e- s-');
  audio.sfx('coin');
  made[made.length - 1].on.onError({ errMsg: 'a very long message that would run off the panel' });
  assert.ok(audio.report().length < 50, audio.report());
  assert.ok(/^[\x20-\x7e]+$/.test(audio.report()));
});

test('every sound is forced into the package, and each file on disk is one the game can name', () => {
  const pc = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json')));
  assert.strictEqual(pc.setting.ignoreUploadUnusedFiles, false, 'audio paths are chosen at run time, so a filter could take them for unused');
  assert.strictEqual(pc.setting.ignoreDevUnusedFiles, false, 'this one defaults to on for preview builds');
  assert.ok(pc.packOptions.include.some((r) => r.type === 'folder' && r.value === 'assets/audio'));
  assert.ok(!pc.packOptions.ignore.some((r) => /audio|assets|mp3/.test(r.value)));
  global.wx = {};
  try {
    const key = require.resolve('../js/core/audio.js');
    delete require.cache[key];
    const { MUSIC, SFX } = require(key);
    const named = Object.values(MUSIC).concat(Object.values(SFX)).sort();
    const onDisk = fs.readdirSync(path.join(ROOT, 'assets/audio')).map((f) => 'assets/audio/' + f).sort();
    assert.deepStrictEqual(named, onDisk);
    // Written whole in the source, where a scan for the files in use can find them.
    const src = fs.readFileSync(key, 'utf8');
    named.forEach((p) => assert.ok(src.includes(`'${p}'`), p));
    gameFiles().forEach((f) => {
      const code = fs.readFileSync(f, 'utf8');
      for (const m of code.matchAll(/audio\.bgm\('(\w+)'\)/g)) assert.ok(MUSIC[m[1]], `${f} asks for tune "${m[1]}"`);
      for (const m of code.matchAll(/audio\.sfx\('(\w+)'\)/g)) assert.ok(SFX[m[1]], `${f} asks for sound "${m[1]}"`);
    });
  } finally {
    delete global.wx;
  }
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

// ---- Screen sizing ----
const Sizing = require('../js/core/sizing.js');
const { Grid } = require('../js/core/paint.js');

test('the canvas matches the real panel, even where Android reports a fractional ratio', () => {
  // Each row is what WeChat reports and the panel it is really on. One pixel off gets the whole picture resampled.
  [
    [393, 873, 2.75, 1080, 2400], // 1080x2400 at 2.75, which multiplies to 1080.75 x 2400.75
    [411, 914, 2.625, 1080, 2400], // 1078.875 x 2399.25
    [411, 914, 3.5, 1440, 3200], // 1438.5 x 3199
    [360, 800, 3, 1080, 2400],
    [390, 844, 3, 1170, 2532], // iPhone: whole ratios are exact, including panels that are not round numbers
    [393, 852, 3, 1179, 2556],
    [375, 667, 2, 750, 1334],
    [445, 989, 2.75, 1224, 2720], // not a multiple of ten, and too far from one to be mistaken for it
  ].forEach(([w, h, pr, physW, physH]) => {
    const f = Sizing.fit(w, h, pr);
    assert.deepStrictEqual([f.physW, f.physH], [physW, physH], `${w}x${h} at ${pr}`);
  });
});

test('every phone gets a whole-number scale that covers the screen with whole blocks', () => {
  // Real phones, as WeChat reports them. A budget 720-wide Android is the narrowest layout there is, at 240.
  [
    [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3], [390, 844, 3], [428, 926, 3],
    [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3],
    [360, 640, 3], [360, 800, 2], [360, 780, 3], [393, 873, 2.75], [412, 915, 2.625], [412, 892, 3.5], [384, 854, 2.8125], [411, 914, 3.5],
  ].forEach(([w, h, pr]) => {
    const f = Sizing.fit(w, h, pr);
    assert.ok(Number.isInteger(f.scale) && f.scale >= 1, `scale ${f.scale}`);
    assert.ok(f.W * f.scale >= f.physW && (f.W - 1) * f.scale < f.physW, `width of ${w}x${h} at ${pr}`);
    assert.ok(f.H * f.scale >= f.physH && (f.H - 1) * f.scale < f.physH, `height of ${w}x${h} at ${pr}`);
    assert.ok(f.W >= 240, `${w}x${h} at ${pr} is only ${f.W} wide`);
  });
});

test('resizing a sprite takes whole source pixels, so it can never invent a colour', () => {
  const g = new Grid(4, 2);
  g.rect(0, 0, 2, 2, 0xff0000);
  g.rect(2, 0, 2, 2, 0x00ff00);
  const big = g.resized(12, 6);
  assert.strictEqual(big.get(5, 3), 0xff0000);
  assert.strictEqual(big.get(6, 3), 0x00ff00);
  assert.deepStrictEqual(Array.from(new Set(Array.from(big.d))).sort(), [0x00ff00, 0xff0000].sort());
  assert.strictEqual(new Grid(3, 3).resized(6, 6).get(2, 2), -1, 'transparency stays transparent');
});

// ---- Showing the frame ----
// Small canvases that really hold pixels, with switches for what a phone might get wrong. The browser suite
// checks the same route on real canvases, for whole screens.
const Present = require('../js/core/present.js');

function fakeCanvases({ noPut = false, noPartialPut = false, staleRead = false } = {}) {
  const log = { asked: [], puts: [], reads: 0, draws: [] };
  const made = [];
  const make = () => {
    const cv = {
      width: 0,
      height: 0,
      px: null,
      firstRead: null,
      pixels() {
        if (!this.px || this.px.length !== this.width * this.height) this.px = new Uint32Array(this.width * this.height);
        return this.px;
      },
      getContext(type) {
        log.asked.push(type);
        if (type !== '2d') return null;
        return {
          createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
          fillRect: (x, y, w, h) => {
            const px = cv.pixels();
            for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px[j * cv.width + i] = cv.colour;
          },
          set fillStyle(rgb) {
            const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgb);
            cv.colour = m ? ((255 << 24) | (Number(m[3]) << 16) | (Number(m[2]) << 8) | Number(m[1])) >>> 0 : 0xff000000;
          },
          getImageData: (x, y, w, h) => {
            log.reads++;
            const px = cv.pixels();
            const copy = new Uint32Array(w * h);
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) copy[j * w + i] = px[(y + j) * cv.width + x + i];
            if (staleRead && cv.firstRead) return { data: new Uint8ClampedArray(cv.firstRead.buffer.slice(0)) };
            if (!cv.firstRead) cv.firstRead = copy;
            return { data: new Uint8ClampedArray(copy.buffer) };
          },
          putImageData: (im, dx, dy, ...dirty) => {
            log.puts.push({ cv, dirty });
            if (noPut || (noPartialPut && dirty.length)) return;
            const [sx = 0, sy = 0, sw = im.width, sh = im.height] = dirty;
            const from = new Uint32Array(im.data.buffer), px = cv.pixels();
            for (let j = sy; j < sy + sh; j++) for (let i = sx; i < sx + sw; i++) px[j * cv.width + i] = from[j * im.width + i];
          },
          // Only the exact-size copy is modelled. Scaled draws are recorded, and only the fallback makes them.
          drawImage: (img, x, y, w, h) => {
            log.draws.push({ cv, img, w, h });
            if (w !== undefined) return;
            const px = cv.pixels(), from = img.pixels();
            for (let i = 0; i < px.length; i++) px[i] = from[i];
          },
        };
      },
    };
    made.push(cv);
    return cv;
  };
  return { log, make, made };
}

function presented(options, fit) {
  const s = fakeCanvases(options);
  const main = s.make();
  main.width = fit.physW;
  main.height = fit.physH;
  const back = s.make();
  back.width = fit.W;
  back.height = fit.H;
  const screen = Present.create(main, back, s.make, fit);
  const c = back.getContext('2d');
  // Fills the buffer with one colour per buffer pixel, and says what the screen must then show.
  const paint = (salt) => {
    for (let y = 0; y < fit.H; y++) {
      for (let x = 0; x < fit.W; x++) {
        c.fillStyle = `rgb(${(x * 7 + salt) % 256},${(y * 5 + salt) % 256},${(x + y) % 256})`;
        c.fillRect(x, y, 1, 1);
      }
    }
  };
  const wrong = () => {
    const screenPx = main.pixels(), backPx = back.pixels();
    let n = 0;
    for (let y = 0; y < fit.physH; y++) {
      for (let x = 0; x < fit.physW; x++) {
        if (screenPx[y * fit.physW + x] !== backPx[Math.floor(y / fit.scale) * fit.W + Math.floor(x / fit.scale)]) n++;
      }
    }
    return n;
  };
  return { ...s, main, back, screen, paint, wrong, c };
}

const FITS = [
  { physW: 12, physH: 8, W: 6, H: 4, scale: 2 }, // Whole blocks.
  { physW: 10, physH: 7, W: 4, H: 3, scale: 3 }, // The screen ends part way through a block on both axes.
  { physW: 7, physH: 5, W: 7, H: 5, scale: 1 },
  { physW: 1170, physH: 2532, W: 293, H: 633, scale: 4 }, // A real phone.
];

test('every screen pixel comes from exactly one buffer pixel, frame after frame, at any fit', () => {
  for (const fit of FITS) {
    const s = presented({}, fit);
    assert.strictEqual(s.screen.mode, 'exact');
    assert.strictEqual(s.screen.why, '');
    for (const salt of [1, 90, 200]) {
      s.paint(salt);
      s.screen.draw();
      assert.strictEqual(s.wrong(), 0, `${fit.physW}x${fit.physH} with salt ${salt}`);
    }
  }
});

test('a frame that changes one row writes only that row, and the rest of the screen stays right', () => {
  const fit = FITS[1];
  const s = presented({}, fit);
  s.paint(1);
  s.screen.draw();
  s.log.puts.length = 0;
  s.c.fillStyle = 'rgb(9,8,7)';
  s.c.fillRect(1, 1, 1, 1);
  s.screen.draw();
  assert.strictEqual(s.log.puts.length, 1);
  assert.deepStrictEqual(s.log.puts[0].dirty, [0, fit.scale, fit.physW, fit.scale]);
  assert.strictEqual(s.wrong(), 0);
});

test('a frame with no change writes nothing, but the screen is still redrawn as it always was', () => {
  const s = presented({}, FITS[0]);
  s.paint(1);
  s.screen.draw();
  s.log.puts.length = 0;
  s.log.draws.length = 0;
  s.screen.draw();
  assert.strictEqual(s.log.puts.length, 0);
  assert.strictEqual(s.log.draws.length, 1);
  assert.strictEqual(s.log.draws[0].cv, s.main);
});

test('nothing is ever scaled on the way to the screen by the exact route', () => {
  const s = presented({}, FITS[1]);
  s.paint(1);
  s.screen.draw();
  s.log.draws.filter((d) => d.cv === s.main).forEach((d) => assert.strictEqual(d.w, undefined));
});

test('WebGL is never asked of any canvas, because a frozen WebGL screen cannot be detected', () => {
  const s = presented({}, FITS[0]);
  assert.ok(s.log.asked.length > 0);
  assert.ok(s.log.asked.every((type) => type === '2d'), s.log.asked.join());
});

test('a phone that gets partial writes wrong still gets exact pixels, by writing whole frames', () => {
  const s = presented({ noPartialPut: true }, FITS[1]);
  assert.strictEqual(s.screen.mode, 'exact');
  assert.strictEqual(s.screen.why, 'full');
  s.paint(1);
  s.screen.draw();
  s.c.fillStyle = 'rgb(9,8,7)';
  s.c.fillRect(1, 1, 1, 1);
  s.screen.draw();
  assert.strictEqual(s.wrong(), 0);
});

test('a phone that cannot write or re-read pixels falls back to scaling on the 2D screen, and says so', () => {
  for (const options of [{ noPut: true }, { staleRead: true }]) {
    const fit = FITS[0];
    const s = presented(options, fit);
    assert.strictEqual(s.screen.mode, 'flag', JSON.stringify(options));
    s.log.draws.length = 0;
    s.screen.draw();
    assert.strictEqual(s.log.draws.length, 1);
    assert.strictEqual(s.log.draws[0].img, s.back);
    assert.strictEqual(s.log.draws[0].w, fit.W * fit.scale);
  }
});

// ---- Skill levels ----
const Skills = require('../js/systems/skills.js');

const skillSave = (lv) => {
  const s = E.defaultSave();
  ['cen', 'ruo', 'zhuo'].forEach((id) => { s.heroes[id].joined = true; s.heroes[id].lv = lv; });
  return s;
};
// Fixed dice, so that any difference between two fights comes from the skill.
const fixedFight = (s, foes) => new Battle({ heroes: P.partyUnits(s), enemies: (foes || ['clay']).map((m, i) => P.enemyUnit(m, 10, i)), stars: 0, items: {}, rng: () => 0.5 });
const hitOf = (ev) => ev.find((e) => e.type === 'hit').amount;

test('every skill starts at level one, and a save from before skill levels loads with its progress', () => {
  assert.deepStrictEqual(E.defaultSave().heroes.cen.skillLv, {});
  const old = skillSave(30);
  old.coin = 777;
  old.progress.stars = 3;
  ['cen', 'ruo', 'zhuo'].forEach((id) => { delete old.heroes[id].skillLv; });
  const up = E.upgrade(JSON.parse(JSON.stringify(old)));
  assert.strictEqual(up.coin, 777);
  assert.strictEqual(up.progress.stars, 3);
  assert.deepStrictEqual(up.heroes.ruo.skillLv, {});
  assert.strictEqual(Skills.levelOf(up, 'ruo', 'mend'), 1);
  assert.ok(Skills.upgrade(Object.assign(up, { coin: 1e6 }), 'cen', 'cut'), 'and the old save can level up');
});

test('tiers begin at levels 4, 7 and 10', () => {
  const tiers = [];
  for (let lv = 1; lv <= G.SKILL_MAX; lv++) tiers.push(G.skillTier(lv));
  assert.deepStrictEqual(tiers, [0, 0, 0, 1, 1, 1, 2, 2, 2, 3]);
  G.SKILL_TIERS.forEach((t, i) => assert.strictEqual(G.skillTier(t.from), i, t.name));
});

test('a level is paid in coins, never Stardust, and each one costs more than the last', () => {
  const s = skillSave(60);
  s.stardust = 12345;
  G.HERO_ORDER.forEach((hero) => G.HEROES[hero].skills.forEach(([id, from]) => {
    let last = 0;
    for (let lv = 1; lv < G.SKILL_MAX; lv++) {
      const cost = G.skillCost(from, lv);
      assert.ok(cost > last, `${id} level ${lv}`);
      last = cost;
      s.coin = cost;
      assert.ok(Skills.upgrade(s, hero, id), `${id} to level ${lv + 1}`);
      assert.strictEqual(s.coin, 0, 'takes exactly the price');
    }
  }));
  assert.strictEqual(s.stardust, 12345, 'Stardust is never touched');
});

test('a level cannot be bought without the coins, before the skill is known, or before the hero has grown', () => {
  const s = skillSave(10);
  assert.strictEqual(Skills.upgrade(s, 'cen', 'cut'), false, 'no coins');
  s.coin = 1e9;
  assert.strictEqual(Skills.upgrade(s, 'cen', 'blaze'), false, 'taught at level 26');
  // Cut is taught at level 1, so a level 10 hero can take it as far as level 5 and no further.
  for (let i = 0; i < 4; i++) assert.ok(Skills.upgrade(s, 'cen', 'cut'), `step ${i}`);
  assert.strictEqual(Skills.levelOf(s, 'cen', 'cut'), 5);
  const st = Skills.status(s, 'cen', 'cut');
  assert.strictEqual(st.grown, false);
  assert.strictEqual(st.need, G.skillNeed(1, 5));
  const before = s.coin;
  assert.strictEqual(Skills.upgrade(s, 'cen', 'cut'), false, 'needs a stronger hero');
  assert.strictEqual(s.coin, before, 'and a refused level costs nothing');
});

test('a skill stops at the level cap', () => {
  const s = skillSave(60);
  s.coin = 1e9;
  for (let i = 0; i < 30; i++) Skills.upgrade(s, 'cen', 'cut');
  assert.strictEqual(Skills.levelOf(s, 'cen', 'cut'), G.SKILL_MAX);
  const st = Skills.status(s, 'cen', 'cut');
  assert.ok(st.max && !st.ok);
  assert.strictEqual(st.tier, 3);
});

test('a higher level hits harder in real combat, by exactly what the screen says', () => {
  const damage = (lv) => {
    const s = skillSave(40);
    s.heroes.cen.skillLv.cut = lv;
    const b = fixedFight(s);
    return hitOf(b.perform(b.heroes[0], { kind: 'skill', id: 'cut', target: b.enemies[0] }));
  };
  const one = damage(1), ten = damage(10);
  assert.ok(Math.abs(ten / one - (1 + G.SKILL_STEP * 9)) < 0.01, `${one} to ${ten}`);
  assert.ok(damage(5) > one && damage(5) < ten);
  assert.strictEqual(Skills.effect('cut', 1), '威力 +0%');
  assert.strictEqual(Skills.effect('cut', 10), `威力 +${Math.round(G.SKILL_STEP * 900)}%`);
});

test('a higher level heals more, revives further and lands its side effects more often', () => {
  const healed = (lv) => {
    const s = skillSave(40);
    s.heroes.ruo.skillLv.mend = lv;
    const b = fixedFight(s);
    const ruo = b.heroes.find((h) => h.id === 'ruo');
    ruo.hp = 1;
    return b.perform(ruo, { kind: 'skill', id: 'mend', target: ruo }).find((e) => e.type === 'heal').amount;
  };
  assert.ok(healed(10) > healed(1) * 1.4, `${healed(1)} to ${healed(10)}`);
  assert.ok(Skills.at('revive', 10).revive > Skills.at('revive', 1).revive);
  assert.strictEqual(Skills.at('flame', 1).chance, G.SKILLS.flame.chance);
  assert.ok(Skills.at('flame', 10).chance > G.SKILLS.flame.chance);
  Object.keys(G.SKILLS).forEach((id) => {
    if (G.SKILLS[id].chance !== undefined) assert.ok(Skills.at(id, 10).chance <= 1, id);
    if (G.SKILLS[id].revive) assert.ok(Skills.at(id, 10).revive <= 1, id);
  });
});

test('skills that only protect last longer with each tier, and the one-turn guard stays one turn', () => {
  assert.strictEqual(Skills.at('bronze', 1).turns, G.SKILLS.bronze.turns);
  assert.strictEqual(Skills.at('bronze', 4).turns, G.SKILLS.bronze.turns + 1);
  assert.strictEqual(Skills.at('bronze', 10).turns, G.SKILLS.bronze.turns + 3);
  const wall = Skills.at('wall', 10).statuses;
  assert.deepStrictEqual(wall.find((x) => x[0] === 'guard'), ['guard', 1]);
  assert.strictEqual(wall.find((x) => x[0] === 'taunt')[1], 5);
  assert.deepStrictEqual(G.SKILLS.wall.statuses.find((x) => x[0] === 'taunt'), ['taunt', 2], 'the base table is left alone');
  assert.strictEqual(Skills.effect('bronze', 4), `持续 ${G.SKILLS.bronze.turns + 1} 回合`);
});

test('every skill states what each level does, and no level ever reads worse than the one before', () => {
  const amount = (text) => Number(text.match(/\d+/)[0]);
  G.HERO_ORDER.forEach((hero) => G.HEROES[hero].skills.forEach(([id]) => {
    for (let lv = 1; lv <= G.SKILL_MAX; lv++) {
      assert.ok(!/NaN|undefined/.test(Skills.effect(id, lv)), `${id} ${lv}: ${Skills.effect(id, lv)}`);
      assert.ok(Skills.effectValue(id, lv).length > 0, id);
      if (lv > 1) assert.ok(amount(Skills.effect(id, lv)) >= amount(Skills.effect(id, lv - 1)), `${id} at ${lv}`);
    }
    assert.ok(amount(Skills.effect(id, G.SKILL_MAX)) > amount(Skills.effect(id, 1)), `${id} must gain something in all`);
  }));
});

test('level bonuses reach the march: road fights and the party rating both use them', () => {
  const s = skillSave(40);
  const low = P.power(s);
  s.heroes.cen.skillLv.cut = 8;
  assert.ok(P.power(s) > low, 'the rating moves, which refreshes the road forecast');
  const u = P.heroUnit(s, 'cen', 0);
  assert.strictEqual(u.sk.cut.lv, 8);
  assert.strictEqual(u.sk.cut.tier, 2);
  assert.strictEqual(u.sk.flame.lv, 1);
  const b = fixedFight(s);
  const ev = b.perform(b.heroes[0], { kind: 'skill', id: 'cut', target: b.enemies[0] });
  const use = ev.find((e) => e.type === 'use');
  assert.strictEqual(use.tier, 2, 'the battle screen is told which tier to play');
  assert.strictEqual(use.lv, 8);
});

test('enemies keep the base skills, and the shared table never changes', () => {
  const before = JSON.stringify(G.SKILLS);
  const s = skillSave(40);
  s.heroes.cen.skillLv.cut = 10;
  const b = fixedFight(s, ['bifang']);
  assert.strictEqual(b.skillOf(b.enemies[0], 'ember'), G.SKILLS.ember);
  b.perform(b.heroes[0], { kind: 'skill', id: 'cut', target: b.enemies[0] });
  assert.strictEqual(JSON.stringify(G.SKILLS), before);
});

test('one tap levels the cheapest skills first, within the budget, and only for heroes who have joined', () => {
  const s = skillSave(40);
  s.heroes.zhuo.joined = false;
  s.coin = 1e9;
  const budget = G.skillCost(1, 1) * 2 + G.skillCost(1, 2);
  const r = Skills.autoUpgrade(s, budget);
  assert.ok(r.n >= 2);
  assert.ok(1e9 - s.coin <= budget, 'stays inside what it was given');
  assert.deepStrictEqual(s.heroes.zhuo.skillLv, {}, 'nothing for someone not in the party');
  // With no budget given it spends down until nothing more can be bought.
  s.coin = 1e9;
  Skills.autoUpgrade(s);
  G.HEROES.cen.skills.forEach(([id]) => assert.strictEqual(Skills.status(s, 'cen', id).grown && !Skills.status(s, 'cen', id).max, false, id));
  assert.strictEqual(Skills.readyCount(s, 'cen'), 0);
});

test('the auto logic in fights picks by trained strength, not by the base table', () => {
  // Against this target, Cut and Flame are equally strong at base, and a tie goes to the first in the list.
  const pick = (flameLv) => {
    const s = skillSave(5);
    s.heroes.cen.skillLv.flame = flameLv;
    const b = fixedFight(s);
    return b.autoAction(b.heroes[0]).id;
  };
  assert.strictEqual(G.SKILLS.cut.power, G.SKILLS.flame.power);
  assert.strictEqual(pick(1), 'cut');
  assert.strictEqual(pick(3), 'flame', 'a trained skill now does more, so it gets used');
});

test('every skill in the game has an animation signature', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/core/skillfx.js'), 'utf8');
  Object.keys(G.SKILLS).forEach((id) => {
    const fx = G.SKILLS[id].fx;
    assert.ok(new RegExp(`\\b${fx}Hit\\(`).test(src), `${id} uses "${fx}", which has no signature`);
  });
  assert.ok(/\bshieldHit\(/.test(src), 'protective skills have their own');
});

// ---- Goals, lanterns and the one-tap station ----
const Quests = require('../js/systems/quests.js');
const Finds = require('../js/systems/finds.js');
const Chores = require('../js/systems/chores.js');

test('goals come one at a time, pay once, and the first is the first fight', () => {
  const s = E.defaultSave();
  let c = Quests.current(s);
  assert.strictEqual(c.index, 0);
  assert.strictEqual(c.done, false);
  assert.strictEqual(Quests.claim(s).n, 0, 'nothing to claim yet');
  assert.strictEqual(s.coin, 0);
  E.clearNode(s, 'c1a');
  c = Quests.current(s);
  assert.ok(c.done);
  const got = Quests.claim(s);
  assert.strictEqual(got.n, 1);
  assert.strictEqual(s.coin, got.coin);
  assert.ok(got.coin > 0);
  assert.strictEqual(Quests.current(s).index, 1);
  assert.strictEqual(Quests.claim(s).n, 0, 'the next goal is not met, so a second tap pays nothing');
  assert.strictEqual(s.coin, got.coin);
});

test('goals count what the player does through the same marks as the daily errands', () => {
  const s = E.defaultSave();
  E.clearNode(s, 'c1a');
  Quests.claim(s);
  assert.strictEqual(Quests.current(s).q.id, 'collect');
  Daily.mark(s, 'collect', TODAY);
  assert.ok(Quests.current(s).done);
  // The count is for good: a new day clears the errand but not the goal's memory of it.
  Daily.ensure(s, TODAY + 1);
  assert.strictEqual(s.quest.count.collect, 1);
});

test('a save from before goals existed catches up in one tap, at the old prices', () => {
  const s = E.defaultSave();
  delete s.quest;
  delete s.finds;
  const up = E.upgrade(JSON.parse(JSON.stringify(s)));
  assert.deepStrictEqual(up.quest, { at: 0, count: {} });
  clearUpToRaw(up, 'c2b');
  strongParty(up, 20, 10);
  up.quest.count = { collect: 5, dispatch: 2, gear: 5, garden: 4, wander: 5 };
  up.relicSeq = 1;
  up.gacha.total = 20;
  up.heroes.cen.skillLv = { cut: 3 };
  const got = Quests.claim(up);
  assert.ok(got.n >= 8, `only ${got.n} goals caught up`);
  // Catching up pays what each goal paid at its own point on the road, not at today's richer rates.
  let expect = 0;
  for (let i = 0; i < got.n; i++) expect += Quests.reward(Quests.QUESTS[i]).coin;
  assert.strictEqual(got.coin, expect);
  assert.ok(!Quests.current(up).done, 'it stops at the first goal not yet met');
});

test('every goal can be met without Stardust or steps, in an order the road allows', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/systems/quests.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/steps|spendDust|stardust/.test(src), 'goals never look at steps or charge Stardust');
  const ids = new Set();
  let lastLv = 0;
  Quests.QUESTS.forEach((q) => {
    assert.ok(!ids.has(q.id), q.id);
    ids.add(q.id);
    assert.ok(q.lv >= lastLv, `${q.id} is out of order`);
    lastLv = q.lv;
    assert.ok(q.need >= 1 && q.mins > 0 && q.text, q.id);
    if (q.open) {
      // A goal never asks for a feature before the road has opened it.
      const opens = NODE_INDEX[W.UNLOCKS[q.open].node].node;
      assert.ok(q.lv >= (opens.lv || 0), `${q.id} comes before ${q.open} opens`);
    }
    Object.keys(q.items || {}).forEach((k) => assert.ok(G.ITEMS[k], k));
    const r = Quests.reward(q);
    assert.ok(r.coin > 0 && r.coin <= G.coinPerMin(q.lv) * 21, `${q.id} pays ${r.coin}`);
  });
  // All of it together is worth less than half a day on the road, so the chain guides and does not carry.
  const mins = Quests.QUESTS.reduce((n, q) => n + q.mins, 0);
  assert.ok(mins < 12 * 60, `${mins} minutes of income in all`);
  // A fresh save reads every goal without error, and none is met by doing nothing.
  const s = E.defaultSave();
  Quests.QUESTS.forEach((q, i) => {
    s.quest.at = i;
    const c = Quests.current(s);
    assert.strictEqual(c.done, false, `${q.id} is met on a new save`);
  });
  s.quest.at = Quests.QUESTS.length;
  assert.strictEqual(Quests.current(s), null);
  assert.strictEqual(Quests.claim(s).n, 0);
});

test('a finished game has met every goal up to the ending', () => {
  const { run, PROFILES } = require('./simulate.js');
  const r = run(77, PROFILES.typical);
  Quests.ensure(r.s);
  // The simulated player does not mark errands, so stand in for the things it certainly did.
  r.s.quest.count = { collect: 99, dispatch: 99, gear: 99, garden: 99, wander: 99 };
  Quests.claim(r.s);
  const c = Quests.current(r.s);
  const at = c ? c.index : Quests.QUESTS.length;
  assert.ok(at >= 20, `the chain stopped at goal ${at}: ${c && c.q.text}`);
});

test('sky lanterns pay into the pack, a fixed number a day, and never Stardust in bulk', () => {
  const s = E.defaultSave();
  const now = NOW * 1000;
  const rng = seeded(5);
  let n = 0, dust = 0;
  for (let i = 0; i < 40; i++) {
    const got = Finds.claim(s, now, rng);
    if (!got) break;
    n++;
    dust += got.dust || 0;
  }
  assert.strictEqual(n, Finds.PER_DAY);
  assert.strictEqual(Finds.left(s, Idle.dayOf(now)), 0);
  assert.ok(s.idle.pack.coin > 0 && s.idle.pack.xp > 0);
  assert.strictEqual(s.coin, 0, 'it waits in the pack like everything else from the road');
  assert.ok(dust <= Finds.PER_DAY * 5);
  // A day of lanterns is worth well under an hour of the road.
  assert.ok(s.idle.pack.coin <= G.coinPerMin(1) * Finds.MINS * Finds.PER_DAY + 1);
  assert.strictEqual(Finds.left(s, Idle.dayOf(now) + 1), Finds.PER_DAY, 'and there are more tomorrow');
  // Iron only once equipment exists.
  assert.strictEqual(Math.floor(s.idle.pack.iron || 0), 0);
});

test('one tap at the station collects everything finished, and sows the picked plots again', () => {
  const s = E.defaultSave();
  clearUpTo(s, 'c1h');
  const now = NOW * 1000;
  assert.strictEqual(Chores.pending(s, now), 0);
  assert.strictEqual(Chores.tidy(s, now).n, 0);
  Garden.plant(s, 0, 'wood', now);
  Garden.plant(s, 1, 'fire', now);
  Dispatch.refill(s, now, seeded(3));
  const job = s.dispatch.board[0];
  assert.ok(Dispatch.send(s, job.id, Dispatch.roster(s)[0].id, now));
  s.spirits = { vine: 2 };
  s.coin = 1e6;
  assert.ok(E.startRefine(s, 'vine', 'vine', now));
  const later = now + 9 * 3600000;
  assert.strictEqual(Chores.pending(s, later), 4);
  const coin = s.coin;
  const r = Chores.tidy(s, later, seeded(4));
  assert.strictEqual(r.n, 4);
  assert.strictEqual(r.crops, 2);
  assert.strictEqual(r.resown, 2);
  assert.strictEqual(r.relics.length, 1);
  assert.ok(s.coin > coin, 'the reply paid');
  assert.ok(s.herbs.wood > 0 && s.herbs.fire > 0);
  assert.strictEqual(s.garden.plots[0].el, 'wood', 'the same crop is growing again');
  assert.ok(s.garden.plots[0].doneAt > later);
  assert.strictEqual(s.relics.length, 1);
  assert.strictEqual(Chores.pending(s, later), 0);
  assert.strictEqual(Chores.tidy(s, later).n, 0, 'a second tap finds nothing');
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
