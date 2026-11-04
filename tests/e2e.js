#!/usr/bin/env node
// End-to-end checks in headless Chromium, using real pointer events on the running game.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { launch } = require('./lib/browser.js');
const { Driver } = require('./lib/driver.js');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'dist/preview/index.html');
const SHOTS = process.env.E2E_SHOTS || '';

const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(true);
    console.log(`  ok    ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    results.push(false);
    console.log(`  FAIL  ${name}\n        ${String(e.stack || e).split('\n').slice(0, 4).join('\n        ')}`);
  }
}

async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, deviceScaleFactor: opts.dpr || 3 });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(URL + (opts.query || ''));
  await page.waitForFunction(() => window.__BUXU__ && window.__BUXU__.game.top());
  await page.evaluate((k) => { window.__BUXU__.game.timeScale = k; }, opts.speed || 1);
  const d = new Driver(page);
  d.problems = problems;
  d.ctx = ctx;
  d.assertClean = async () => {
    const r = await d.errors();
    assert.deepStrictEqual(r.errors, [], 'runtime errors');
    assert.deepStrictEqual(r.missing, [], 'missing glyphs');
    assert.deepStrictEqual(problems, [], 'browser errors');
  };
  return d;
}

async function shot(d, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await d.page.waitForTimeout(250);
  await d.page.screenshot({ path: path.join(SHOTS, name + '.png') });
}

async function introToHub(d) {
  await d.tap('title-start');
  await d.waitScene('Dialog');
  await d.skipDialogue();
  await d.waitScene('Reveal');
}

async function finishReveal(d) {
  await d.skipDialogue();
  await d.waitScene('Modal');
  await d.tap('modal-0');
  await d.waitScene('Hub');
}

(async () => {
  execFileSync('node', [path.join(ROOT, 'tools/bundle.js'), 'game.js', 'dist/preview'], { cwd: ROOT, stdio: 'ignore' });
  const browser = await launch();

  await check('first launch: real steps become currency through the opening', async () => {
    const d = await open(browser, { speed: 3 });
    await introToHub(d);
    await d.tap('reveal-connect');
    await d.waitFor('reveal-go');
    const s = await d.state();
    assert.ok(s.stardust > 0, 'exchange paid out');
    assert.ok(s.steps.total > 0, 'steps recorded');
    await d.tap('reveal-go');
    await finishReveal(d);
    const s2 = await d.state();
    assert.strictEqual(s2.stardust, s.stardust + 300, 'welcome gift added');
    assert.strictEqual(s2.flags.intro, true);
    const calls = await d.page.evaluate(() => window.__wxMock.calls);
    ['requirePrivacyAuthorize', 'authorize', 'login', 'getWeRunData'].forEach((c) => assert.ok(calls.includes(c), c));
    assert.ok(calls.indexOf('requirePrivacyAuthorize') < calls.indexOf('authorize'), 'privacy comes before authorisation');
    assert.ok(calls.indexOf('login') < calls.indexOf('getWeRunData'), 'WeChat requires login first');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('altar: walking more pays more, and the same steps never pay twice', async () => {
    const d = await open(browser, { speed: 3 });
    await introToHub(d);
    await d.tap('reveal-connect');
    await d.waitFor('reveal-go');
    await d.tap('reveal-go');
    await finishReveal(d);
    await d.tap('hub-altar');
    await d.waitScene('Altar');
    await d.waitFor('altar-mock');
    const d0 = (await d.state()).stardust;
    assert.strictEqual(await d.has('altar-exchange'), false, 'nothing to exchange yet');
    await d.tap('altar-mock');
    await d.waitFor('altar-exchange');
    await d.tap('altar-exchange');
    await d.waitScene('Modal');
    const d1 = (await d.state()).stardust;
    assert.ok(d1 - d0 >= 200, `2000 steps should give at least 200, got ${d1 - d0}`);
    await d.tap('modal-0');
    await d.page.waitForTimeout(120);
    const canAgain = await d.has('altar-exchange');
    assert.strictEqual(canAgain, false, 'button disabled after everything is exchanged');
    assert.strictEqual((await d.state()).stardust, d1);
    await d.page.reload();
    await d.page.waitForFunction(() => window.__BUXU__ && window.__BUXU__.game.top());
    await d.page.waitForTimeout(200);
    assert.strictEqual((await d.state()).stardust, d1, 'reload keeps the balance');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('stipend: claimable once a day, also with WeRun off', async () => {
    const d = await open(browser, { speed: 3 });
    await introToHub(d);
    await d.tap('reveal-skip');
    await finishReveal(d);
    assert.strictEqual((await d.state()).stardust, 300);
    await d.tap('hub-altar');
    await d.waitScene('Altar');
    const calls = await d.page.evaluate(() => window.__wxMock.calls);
    assert.ok(!calls.includes('authorize'), 'opening the altar must not trigger a permission prompt');
    await d.tap('altar-stipend');
    assert.strictEqual((await d.state()).stardust, 400);
    await d.page.waitForTimeout(100);
    assert.strictEqual(await d.has('altar-stipend'), false);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('privacy: refusing keeps the game playable and accepting then works', async () => {
    const d = await open(browser, { speed: 3, query: '?privacy=ask' });
    await introToHub(d);
    await d.tap('reveal-connect');
    await d.waitScene('Modal');
    const ids = await d.ids();
    assert.ok(ids.includes('modal-1'), 'link to the privacy guide is offered');
    await shot(d, 'privacy');
    await d.tap('modal-1');
    await d.waitScene('Modal');
    const calls = await d.page.evaluate(() => window.__wxMock.calls);
    assert.ok(calls.includes('openPrivacyContract'));
    await d.tap('modal-2');
    await d.waitFor('reveal-skip2');
    assert.ok(!(await d.page.evaluate(() => window.__wxMock.calls)).includes('authorize'), 'no authorisation after refusal');
    await d.tap('reveal-retry');
    await d.waitScene('Modal');
    await d.tap('modal-0');
    await d.waitFor('reveal-go');
    assert.ok((await d.state()).stardust > 0);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('WeRun denied: game continues and the settings page can recover it', async () => {
    const d = await open(browser, { speed: 3, query: '?werun=denied' });
    await introToHub(d);
    await d.tap('reveal-connect');
    await d.waitFor('reveal-skip2');
    await d.tap('reveal-skip2');
    await finishReveal(d);
    assert.strictEqual((await d.state()).stardust, 300);
    await d.tap('hub-altar');
    await d.waitScene('Altar');
    await d.page.evaluate(() => window.__BUXU__.steps.refresh());
    await d.waitFor('altar-settings');
    await shot(d, 'altar-denied');
    await d.tap('altar-settings');
    await d.waitFor('altar-exchange');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('battle by hand: attack, skills, items, seal, guard and win', async () => {
    const d = await open(browser, { speed: 4 });
    await d.page.evaluate(() => {
      const B = window.__BUXU__, s = B.store.get();
      s.flags.intro = true;
      s.flags.tips = { battle: 1, charge: 1, gate: 1 };
      s.flags.seen = { c1_intro: 1, c1_first_step: 1, c1_ruo: 1 };
      s.stardust = 1000;
      s.heroes.cen.lv = 8;
      s.heroes.ruo.joined = true;
      s.heroes.ruo.lv = 8;
      s.progress.cleared.c1a = true;
      s.items = { pill: 3, ether: 3, incense: 1, seal: 20 };
      B.store.persist();
      B.game.go('map', { chapter: 0, focus: 1 }, true);
    });
    await d.waitScene('WorldMap');
    await d.tap('map-go');
    await d.waitFor('cmd-attack', 15000);
    const nextMenu = () => d.waitFor('cmd-attack', 15000);
    // Enemies are made sturdy so every command gets exercised before the fight can end.
    await d.page.evaluate(() => { window.__BUXU__.game.top().b.enemies.forEach((e) => { e.maxHp = 99999; e.hp = 99999; }); });
    const pickTarget = async () => {
      await d.page.waitForTimeout(120);
      const t = (await d.ids()).find((i) => i.startsWith('target-'));
      if (t) await d.tap(t);
      return t;
    };
    await d.tap('cmd-guard');
    await nextMenu();
    await d.tap('cmd-skill');
    await d.waitFor('cmd-back');
    await d.tap('cmd-back');
    await d.tap('cmd-item');
    await d.tap('item-pill');
    assert.ok(await pickTarget(), 'a healing item asks for a target');
    await nextMenu();
    await d.tap('cmd-attack');
    assert.ok(await pickTarget(), 'an attack asks for a target while two enemies stand');
    await nextMenu();
    const hp = await d.page.evaluate(() => window.__BUXU__.game.top().b.enemies.reduce((a, e) => a + e.hp, 0));
    assert.ok(hp < 99999 * 2, 'the attack dealt damage');
    // With the dice fixed in the player's favour, every talisman lands.
    await d.page.evaluate(() => { window.__BUXU__.game.top().b.rng = () => 0.01; });
    // A time limit, not a poll count: slow frames must not end the loop before the fight does.
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline && !(await d.has('win-continue'))) {
      const scene = await d.scene();
      if (scene === 'Modal') { await d.tap('modal-0'); continue; }
      if (scene === 'BattleScene' && (await d.has('cmd-seal'))) {
        await d.tap('cmd-seal');
        await pickTarget();
      }
      await d.page.waitForTimeout(60);
    }
    await d.waitFor('win-continue', 20000);
    await shot(d, 'victory');
    const s = await d.state();
    assert.ok(Object.keys(s.spirits).length > 0, 'captured a spirit');
    assert.ok(s.progress.cleared.c1b, 'node recorded as cleared');
    await d.tap('win-continue');
    await d.page.waitForTimeout(300);
    await d.skipDialogue();
    await d.waitScene('WorldMap');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('losing is safe: retry works and the paid star gate stays open', async () => {
    const d = await open(browser, { speed: 4 });
    await d.page.evaluate(() => {
      const B = window.__BUXU__, s = B.store.get();
      s.flags.intro = true;
      s.flags.tips = { battle: 1, charge: 1, gate: 1 };
      s.stardust = 600;
      s.settings.auto = true;
      s.settings.speed = 3;
      s.items = { pill: 0, ether: 0, incense: 0, seal: 0 };
      'abcdefg'.split('').forEach((l) => { s.progress.cleared['c1' + l] = true; });
      s.flags.seen = { c1_intro: 1, c1_boss: 1 };
      B.store.persist();
      B.game.go('map', { chapter: 0 }, true);
    });
    await d.waitScene('WorldMap');
    await d.tap('map-go');
    await d.waitScene('Modal');
    await shot(d, 'gate');
    await d.tap('modal-1');
    await d.page.waitForTimeout(200);
    assert.strictEqual((await d.state()).stardust, 100, 'gate cost charged');
    await d.waitFor('lose-retry', 60000);
    await shot(d, 'defeat');
    await d.tap('lose-altar');
    await d.waitScene('Altar');
    await d.page.waitForTimeout(100);
    await d.tap('back');
    await d.waitScene('Hub');
    await d.tap('hub-map');
    await d.waitScene('WorldMap');
    await d.tap('map-go');
    await d.waitScene('BattleScene', 8000);
    assert.strictEqual((await d.state()).stardust, 100, 'no second charge');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('chest: locked by real steps, opens once enough have been walked', async () => {
    const d = await open(browser, { speed: 3 });
    await d.page.evaluate(() => {
      const B = window.__BUXU__, s = B.store.get();
      s.flags.intro = true;
      s.flags.seen = { c1_intro: 1 };
      ['a', 'b', 'c', 'd'].forEach((l) => { s.progress.cleared['c1' + l] = true; });
      s.steps.total = 100;
      B.store.persist();
      B.game.go('map', { chapter: 0 }, true);
    });
    await d.waitScene('WorldMap');
    await d.tap('node-c1e');
    await d.tap('map-go');
    await d.waitScene('Modal');
    assert.ok(!(await d.state()).progress.cleared.c1e);
    await d.tap('modal-0');
    await d.page.evaluate(() => { const B = window.__BUXU__; B.store.get().steps.total = 5000; });
    await d.tap('map-go');
    await d.waitScene('Modal', 8000);
    assert.ok((await d.state()).progress.cleared.c1e);
    assert.strictEqual((await d.state()).stardust, 100);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('furnace and party UI: refine a relic, equip it, train with it', async () => {
    const d = await open(browser, { speed: 4 });
    await d.page.evaluate(() => {
      const B = window.__BUXU__, s = B.store.get();
      s.flags.intro = true;
      s.stardust = 2000;
      s.spirits = { vine: 2, wisp: 1 };
      B.store.persist();
      B.game.go('hub', null, true);
    });
    await d.waitScene('Hub');
    await d.tap('hub-furnace');
    await d.waitScene('Furnace');
    await d.tap('spirit-vine');
    await d.tap('spirit-wisp');
    await d.tap('furnace-go');
    await d.waitScene('Modal', 8000);
    const s = await d.state();
    assert.strictEqual(s.relics.length, 1);
    assert.strictEqual(s.relics[0].type, 'fire_wood');
    assert.strictEqual(s.stardust, 2000 - 150);
    await d.tap('modal-1');
    await d.waitScene('Party');
    const atk0 = (await d.state()).heroes.cen.train.atk;
    await d.tap('train-atk');
    assert.strictEqual((await d.state()).heroes.cen.train.atk, atk0 + 1);
    await d.tap('relic-0');
    await d.waitScene('RelicPick');
    await d.tap('pick-' + s.relics[0].uid);
    await d.waitScene('Party');
    assert.strictEqual((await d.state()).heroes.cen.relics[0], s.relics[0].uid);
    await d.tap('back');
    await d.waitScene('Hub');
    await d.tap('hub-shop');
    await d.waitScene('Shop');
    const p0 = (await d.state()).items.pill;
    await d.tap('buy-pill');
    assert.strictEqual((await d.state()).items.pill, p0 + 1);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('full campaign through the UI: every chapter, then both endings', async () => {
    const d = await open(browser, { speed: 10 });
    await d.page.evaluate(() => {
      const B = window.__BUXU__, s = B.store.get();
      s.flags.intro = true;
      s.flags.tips = { battle: 1, charge: 1, seal: 1, gate: 1 };
      s.stardust = 60000;
      s.steps.total = 500000;
      s.settings.auto = true;
      s.settings.speed = 3;
      s.items = { pill: 30, ether: 30, incense: 10, seal: 0 };
      ['cen', 'ruo', 'zhuo'].forEach((id) => { s.heroes[id].lv = 30; s.heroes[id].train = { hp: 15, atk: 15, def: 15, spd: 6 }; });
      B.store.persist();
      B.game.go('map', { chapter: 0 }, true);
    });
    const seen = new Set();
    const t0 = Date.now();
    let steps = 0;
    while (Date.now() - t0 < 480000 && steps++ < 6000) {
      const scene = await d.scene();
      seen.add(scene);
      const ids = await d.ids();
      if (await d.page.evaluate(() => !!window.__BUXU__.game.transition)) { await d.page.waitForTimeout(30); continue; }
      if (ids.includes('ending-done')) break;
      if (scene === 'Dialog') { await d.tap('dialog-skip'); continue; }
      if (scene === 'Modal') {
        // Take the option that keeps moving forward, using each event's first choice.
        const pick = ids.includes('modal-1') && !ids.includes('modal-2') && (await d.page.evaluate(() => /点亮/.test(window.__BUXU__.game.top().p.title || ''))) ? 'modal-1' : 'modal-0';
        await d.tap(pick);
        continue;
      }
      if (scene === 'WorldMap') {
        const info = await d.page.evaluate(() => {
          const m = window.__BUXU__.game.top();
          // A dialog may have opened on top of the map since the scene was read.
          if (!m.pts) return null;
          const st = window.__BUXU__.store.get();
          const next = m.pts.find((q) => !st.progress.cleared[q.node.id]);
          return { ch: m.ch.id, node: next && next.node.id, sel: m.pts[m.selected] && m.pts[m.selected].node.id, walking: !!m.walk };
        });
        if (!info) continue;
        if (!info.node) throw new Error(`nothing left to do on ${info.ch}, but the game did not advance`);
        if (info.walking) { await d.page.waitForTimeout(30); continue; }
        if (info.sel !== info.node) { await d.tap('node-' + info.node); continue; }
        await d.tap('map-go');
        await d.page.waitForTimeout(100);
        continue;
      }
      if (scene === 'BattleScene') {
        if (ids.includes('win-continue')) { await d.tap('win-continue'); continue; }
        if (ids.includes('lose-retry')) { await d.tap('lose-retry'); continue; }
        await d.page.waitForTimeout(40);
        continue;
      }
      await d.page.waitForTimeout(30);
    }
    if (!(await d.has('ending-done'))) throw new Error(`did not reach the ending; at ${await d.scene()}, hits ${(await d.ids()).join(',')}`);
    await shot(d, 'credits');
    const s = await d.state();
    assert.strictEqual(s.progress.stars, 6, 'six stars lit by turning the handle');
    assert.strictEqual(s.progress.ending, 'turn');
    assert.ok(s.heroes.ruo.joined && s.heroes.zhuo.joined, 'party complete');
    CHAPTERS_NODE_CHECK(s);
    await d.tap('ending-done');
    await d.waitScene('Hub');
    await shot(d, 'hub-after-ending');
    // The other ending stays available from the final node.
    await d.tap('hub-map');
    await d.waitScene('WorldMap');
    await d.tap('node-c6h');
    await d.tap('map-go');
    await d.waitScene('Modal', 8000);
    await d.tap('modal-1');
    await d.page.waitForTimeout(200);
    await d.skipDialogue();
    await d.waitFor('ending-done', 8000);
    assert.strictEqual((await d.state()).progress.ending, 'turn', 'the true ending is remembered');
    await d.assertClean();
    await d.ctx.close();
  });

  const SIZES = [
    ['small-16x9', { width: 360, height: 640 }, 3],
    ['iphone-se', { width: 320, height: 568 }, 2],
    ['tall-20x9', { width: 412, height: 915 }, 2.625],
    ['ipad', { width: 768, height: 1024 }, 2],
  ];
  for (const [name, viewport, dpr] of SIZES) {
    await check(`layout at ${name}: nothing overflows and every button is reachable`, async () => {
      const d = await open(browser, { viewport, dpr, speed: 4, query: `?dpr=${dpr}&fill=1` });
      await d.page.evaluate(() => {
        const B = window.__BUXU__, s = B.store.get();
        s.flags.intro = true;
        s.flags.tips = { battle: 1, charge: 1, seal: 1, gate: 1 };
        s.flags.seen = { c1_intro: 1, c1_first_step: 1, c1_ruo: 1 };
        s.stardust = 3000;
        s.heroes.ruo.joined = true;
        s.heroes.zhuo.joined = true;
        s.spirits = { vine: 1, wisp: 1 };
        B.store.persist();
        B.game.go('hub', null, true);
      });
      const onScreen = async (where) => {
        const r = await d.page.evaluate(() => {
          const B = window.__BUXU__;
          return { W: B.ui.W, H: B.ui.H, bad: B.ui.state.hits.filter((h) => h.id !== 'dialog-next' && (h.x < -1 || h.y < -1 || h.x + h.w > B.ui.W + 1 || h.y + h.h > B.ui.H + 1)).map((h) => h.id) };
        });
        assert.strictEqual(r.bad.join(','), '', `${where}: offscreen controls at ${r.W}x${r.H}: ${r.bad.join(',')}`);
      };
      await d.waitScene('Hub');
      await d.page.waitForTimeout(150);
      await onScreen('hub');
      await shot(d, `${name}-hub`);
      await d.tap('hub-altar');
      await d.waitScene('Altar');
      await d.page.waitForTimeout(250);
      await onScreen('altar');
      await shot(d, `${name}-altar`);
      await d.tap('back');
      await d.waitScene('Hub');
      await d.tap('hub-party');
      await d.waitScene('Party');
      await d.page.waitForTimeout(150);
      await onScreen('party');
      await shot(d, `${name}-party`);
      await d.tap('back');
      await d.waitScene('Hub');
      await d.tap('hub-furnace');
      await d.waitScene('Furnace');
      await d.page.waitForTimeout(150);
      await onScreen('furnace');
      await d.tap('back');
      await d.waitScene('Hub');
      await d.tap('hub-map');
      await d.waitScene('WorldMap');
      await d.page.waitForTimeout(150);
      await onScreen('map');
      await d.tap('map-go');
      await d.waitFor('cmd-attack', 15000);
      await onScreen('battle');
      await shot(d, `${name}-battle`);
      await d.tap('cmd-skill');
      await d.page.waitForTimeout(100);
      await onScreen('skills');
      await d.assertClean();
      await d.ctx.close();
    });
  }

  await check('every audio file decodes and is not silent', async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(URL);
    const info = await page.evaluate(async () => {
      const out = [];
      const ac = new OfflineAudioContext(1, 22050, 22050);
      for (const [k, uri] of Object.entries(window.__AUDIO__)) {
        const bin = Uint8Array.from(atob(uri.split(',')[1]), (c) => c.charCodeAt(0));
        const buf = await ac.decodeAudioData(bin.buffer);
        const d = buf.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < d.length; i += 3) peak = Math.max(peak, Math.abs(d[i]));
        out.push({ k, dur: buf.duration, peak });
      }
      return out;
    });
    assert.strictEqual(info.length, 21);
    info.forEach((a) => {
      assert.ok(a.peak > 0.05, `${a.k} silent`);
      assert.ok(a.peak <= 1.2, `${a.k} clipping at ${a.peak}`);
      assert.ok(a.dur > 0.03, `${a.k} too short`);
    });
    await ctx.close();
  });

  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

function CHAPTERS_NODE_CHECK(s) {
  const { CHAPTERS } = require('../js/data/chapters.js');
  CHAPTERS.forEach((c) => c.nodes.forEach((n) => {
    assert.ok(s.progress.cleared[n.id], `node ${n.id} never cleared`);
  }));
}
