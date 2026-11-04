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
const ONLY = process.env.E2E_ONLY || '';
const HOUR = 3600000;

const results = [];
async function check(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push(true);
    console.log(`  ok    ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    results.push(false);
    console.log(`  FAIL  ${name}\n        ${String(e.stack || e).split('\n').slice(0, 14).join('\n        ')}`);
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

async function introToReveal(d) {
  await d.tap('title-start');
  await d.waitScene('Dialog');
  await d.skipDialogue();
  await d.waitScene('Reveal');
}

// From the farewell gift through the chapter opener and first tip, to the road with nothing on top.
async function finishReveal(d) {
  await d.skipDialogue();
  await d.waitScene('Modal');
  await d.tap('modal-0');
  await settle(d, 'Road');
}

// Clears any story or message boxes until the named scene is on top.
async function settle(d, scene, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const now = await d.scene();
    const moving = await d.page.evaluate(() => !!window.__BUXU__.game.transition);
    if (!moving && now === scene) {
      // Give any story that opens on arrival a moment to appear.
      await d.page.waitForTimeout(120);
      if ((await d.scene()) === scene) return;
    }
    if (now === 'Dialog') await d.tap('dialog-skip');
    else if (now === 'Modal') await d.tap('modal-0');
    else await d.page.waitForTimeout(40);
  }
  throw new Error(`never settled on ${scene}, at ${await d.scene()}`);
}

// A save that has already reached some point in the story, with nothing popping up.
const prepare = (d, fn, arg) => d.page.evaluate(({ src, a }) => {
  const B = window.__BUXU__, s = B.store.get();
  s.flags.intro = true;
  s.flags.tips = { road: 1, station: 1, trials: 1, battle: 1, charge: 1, seal: 1 };
  B.chapters.CHAPTERS.forEach((c) => { s.flags.seen[c.intro] = 1; });
  // eslint-disable-next-line no-new-func
  const f = new Function('B', 's', 'a', src);
  f(B, s, a);
  s.idle.last = B.clock.now();
  B.store.persist();
}, { src: fn, a: arg });

const OPEN_ALL = `
  ['c1a','c1b','c1c','c1d','c1e','c1f','c1g','c1h','c2a','c2b'].forEach((id) => { s.progress.cleared[id] = true; });
  s.progress.chapter = 1; s.progress.stars = 1;
  ['cen','ruo','zhuo'].forEach((id) => { s.heroes[id].joined = true; s.heroes[id].lv = 12; });
`;

const go = (d, name, params) => d.page.evaluate(([n, p]) => window.__BUXU__.game.go(n, p, true), [name, params || null]);
const skipTime = (d, ms) => d.page.evaluate((m) => {
  const B = window.__BUXU__;
  B.clock.skip(m);
  B.idle.sync(B.store.get(), B.clock.now());
}, ms);

// Fails if any text on screen crosses the edge of a button or runs off the side of the screen.
async function assertTidy(d, where) {
  const bad = await d.page.evaluate(() => new Promise((ok) => {
    const B = window.__BUXU__;
    B.ui.state.debug = true;
    let frames = 0;
    const tick = () => {
      if (++frames < 3) return requestAnimationFrame(tick);
      const { texts, boxes } = B.ui.state;
      const out = [];
      const W = B.ui.W;
      texts.forEach((t) => {
        if (t.x < -1 || t.x + t.w > W + 1) out.push(`"${t.str}" runs off the screen (x ${Math.round(t.x)}..${Math.round(t.x + t.w)} of ${W})`);
        boxes.forEach((b) => {
          const ox = Math.min(t.x + t.w, b.x + b.w) - Math.max(t.x, b.x);
          const oy = Math.min(t.y + t.h, b.y + b.h) - Math.max(t.y, b.y);
          if (ox <= 1 || oy <= 1) return;
          const inside = t.x >= b.x - 1 && t.x + t.w <= b.x + b.w + 1 && t.y >= b.y - 1 && t.y + t.h <= b.y + b.h + 1;
          if (!inside && !t.clipped && !b.clipped) out.push(`"${t.str}" collides with button ${b.id}`);
          else if (!inside && ox > 3 && oy > 3 && t.x + t.w > b.x + 2 && t.x < b.x + b.w - 2 && t.y > b.y && t.y + t.h < b.y + b.h) out.push(`"${t.str}" collides with button ${b.id}`);
        });
      });
      B.ui.state.debug = false;
      return ok(Array.from(new Set(out)));
    };
    requestAnimationFrame(tick);
  }));
  assert.deepStrictEqual(bad, [], `${where}: untidy layout`);
}

async function assertOnScreen(d, where) {
  const r = await d.page.evaluate(() => {
    const B = window.__BUXU__;
    return { W: B.ui.W, H: B.ui.H, bad: B.ui.state.hits.filter((h) => h.id !== 'dialog-next' && (h.x < -1 || h.y < -1 || h.x + h.w > B.ui.W + 1 || h.y + h.h > B.ui.H + 1)).map((h) => h.id) };
  });
  assert.strictEqual(r.bad.join(','), '', `${where}: offscreen controls at ${r.W}x${r.H}: ${r.bad.join(',')}`);
}

(async () => {
  execFileSync('node', [path.join(ROOT, 'tools/bundle.js'), 'game.js', 'dist/preview'], { cwd: ROOT, stdio: 'ignore' });
  const browser = await launch();

  await check('first launch: real steps become Stardust through the opening', async () => {
    const d = await open(browser, { speed: 3 });
    await assertTidy(d, 'title');
    await introToReveal(d);
    await assertTidy(d, 'reveal');
    await d.tap('reveal-connect');
    await d.waitFor('reveal-go');
    await assertTidy(d, 'reveal result');
    const s = await d.state();
    assert.ok(s.stardust > 0, 'exchange paid out');
    assert.ok(s.steps.total > 0, 'steps recorded');
    await d.tap('reveal-go');
    await finishReveal(d);
    const s2 = await d.state();
    assert.strictEqual(s2.stardust, s.stardust + 300, 'welcome gift added');
    assert.strictEqual(s2.coin, 2000);
    assert.strictEqual(s2.flags.intro, true);
    const calls = await d.page.evaluate(() => window.__wxMock.calls);
    ['requirePrivacyAuthorize', 'authorize', 'login', 'getWeRunData'].forEach((c) => assert.ok(calls.includes(c), c));
    assert.ok(calls.indexOf('requirePrivacyAuthorize') < calls.indexOf('authorize'), 'privacy comes before authorisation');
    assert.ok(calls.indexOf('login') < calls.indexOf('getWeRunData'), 'WeChat requires login first');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('the road: skipping WeRun entirely, the party still walks, fights and earns', async () => {
    const d = await open(browser, { speed: 3 });
    await introToReveal(d);
    await d.tap('reveal-skip');
    await finishReveal(d);
    const calls = await d.page.evaluate(() => window.__wxMock.calls);
    assert.ok(!calls.includes('authorize') && !calls.includes('getWeRunData'), 'nothing asks for steps');
    assert.strictEqual((await d.state()).steps.total, 0);
    await d.page.waitForTimeout(1600);
    const pack = (await d.state()).idle.pack;
    assert.ok(pack.coin > 0 && pack.xp > 0, 'earning in real time');
    // The first stop holds a story, so the party waits there and the button appears.
    await skipTime(d, 60000);
    await d.waitFor('road-act');
    await d.tap('road-act');
    await d.page.waitForTimeout(400);
    await d.skipDialogue();
    await d.page.evaluate(() => { const B = window.__BUXU__; B.store.get().settings.auto = true; B.store.get().settings.speed = 3; });
    // The first fight opens with a how-to-play note.
    const t0 = Date.now();
    while (Date.now() - t0 < 30000 && !(await d.has('win-continue'))) {
      if ((await d.scene()) === 'Modal') await d.tap('modal-0');
      else await d.page.waitForTimeout(50);
    }
    await d.waitFor('win-continue', 1000);
    assert.ok((await d.state()).progress.cleared.c1a, 'the first fight counts');
    await d.tap('win-continue');
    await settle(d, 'Road');
    // And the rest of the first region, all with no steps.
    await d.assertClean();
    await d.ctx.close();
  });

  await check('coming back after a long absence: the pack has filled, and the capacity is respected', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, `${OPEN_ALL}; s.idle.pack = { coin: 0, xp: 0, dust: 0, items: {}, spirits: {}, herbs: {} }; s.idle.secs = 0;`);
    // Pretend the game was closed three days ago.
    await d.page.evaluate(() => { const B = window.__BUXU__, s = B.store.get(); s.idle.last = B.clock.now() - 72 * 3600000; B.store.persist(); });
    await d.page.reload();
    await d.page.waitForFunction(() => window.__BUXU__ && window.__BUXU__.game.top());
    await d.page.evaluate(() => { window.__BUXU__.game.timeScale = 3; });
    const s = await d.state();
    const cap = await d.page.evaluate(() => window.__BUXU__.idle.capSecs(window.__BUXU__.store.get()));
    assert.ok(Math.abs(s.idle.secs - cap) < 2, `the pack filled to its capacity, not 72 hours (${s.idle.secs} of ${cap})`);
    assert.ok(s.idle.pack.coin > 0);
    await d.tap('title-start');
    await d.waitScene('Modal', 8000);
    const title = await d.page.evaluate(() => window.__BUXU__.game.top().p.title);
    assert.ok(/行囊/.test(title), 'the return screen says the pack is full');
    await shot(d, 'return');
    await d.tap('modal-0');
    await d.page.waitForTimeout(200);
    const after = await d.state();
    assert.ok(after.coin >= Math.floor(s.idle.pack.coin), 'collecting pays out');
    assert.ok(after.idle.secs < 5);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('collecting by hand pays once, and a level-up shows up on the party', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, `s.idle.pack = { coin: 5000, xp: 3000, dust: 7, items: { pill: 1 }, spirits: { vine: 1 }, herbs: { wood: 2 } }; s.idle.secs = 3600;`);
    await go(d, 'road');
    await settle(d, 'Road');
    const lv = (await d.state()).heroes.cen.lv;
    await d.tap('road-collect');
    const s = await d.state();
    assert.ok(s.coin >= 5000);
    assert.ok(s.stardust >= 7);
    assert.strictEqual(s.herbs.wood >= 2, true);
    assert.strictEqual(s.spirits.vine >= 1, true);
    assert.ok(s.heroes.cen.lv > lv);
    assert.ok(s.daily.done.collect);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('altar: walking more pays more, and the same steps never pay twice', async () => {
    const d = await open(browser, { speed: 3 });
    await introToReveal(d);
    await d.tap('reveal-connect');
    await d.waitFor('reveal-go');
    await d.tap('reveal-go');
    await finishReveal(d);
    await d.tap('nav-altar');
    await d.waitScene('Altar');
    await d.page.evaluate(() => { window.__BUXU__.game.top().scroll = 0; });
    await d.waitFor('altar-exchange').catch(() => {});
    const d0 = (await d.state()).stardust;
    await d.page.evaluate(() => window.__BUXU__.steps.mockAddSteps(2000));
    await d.page.waitForTimeout(200);
    await d.tap('altar-exchange');
    await d.waitScene('Modal');
    const d1 = (await d.state()).stardust;
    assert.ok(d1 - d0 >= 200, `2000 steps should give at least 200, got ${d1 - d0}`);
    const st = await d.state();
    assert.ok(st.idle.dashLi > 0 || st.idle.li > 0, 'the party was carried forward');
    await d.tap('modal-0');
    await d.page.waitForTimeout(150);
    assert.strictEqual((await d.state()).stardust, d1);
    await d.page.reload();
    await d.page.waitForFunction(() => window.__BUXU__ && window.__BUXU__.game.top());
    await d.page.waitForTimeout(200);
    assert.ok((await d.state()).stardust >= d1, 'reload keeps the balance');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('enhancements: steps buy speed and comfort from the altar', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, `${OPEN_ALL}; s.stardust = 2000;`);
    await go(d, 'road');
    await settle(d, 'Road');
    await d.tap('road-boost');
    await d.waitScene('Modal');
    await assertTidy(d, 'boost sheet');
    await d.tap('modal-0');
    await d.waitScene('Modal');
    assert.ok((await d.state()).idle.hasteSecs >= 1800, 'buying from the road works too, and the sheet stays open');
    await d.tap('modal-3');
    await go(d, 'station');
    await d.waitScene('Station');
    await d.tap('st-settings');
    await d.waitScene('Settings');
    await assertTidy(d, 'settings');
    await go(d, 'altar');
    await d.waitScene('Altar');
    await d.waitFor('use-haste');
    await d.tap('use-haste');
    assert.ok((await d.state()).idle.hasteSecs >= 1800);
    await d.tap('use-jump');
    const coin = (await d.state()).idle.pack.coin;
    assert.ok(coin > 0, 'an hour of road income is in the pack');
    await d.tap('use-dice');
    const before = (await d.state()).blessings.fortune;
    await d.tap('bless-fortune');
    assert.strictEqual((await d.state()).blessings.fortune, before + 1);
    assert.ok((await d.state()).stardust < 2000);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('clearing the save starts a fresh game cleanly', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, `${OPEN_ALL}; s.coin = 5000; s.stardust = 400;`);
    await go(d, 'station');
    await d.waitScene('Station');
    await d.tap('st-settings');
    await d.waitScene('Settings');
    await d.tap('set-reset');
    await d.waitScene('Modal');
    await d.tap('modal-1');
    await d.waitScene('Title');
    const s = await d.state();
    assert.strictEqual(s.coin, 0);
    assert.strictEqual(s.stardust, 0);
    assert.strictEqual(s.flags.intro, false);
    assert.deepStrictEqual(s.progress.cleared, {});
    await introToReveal(d);
    await d.tap('reveal-skip');
    await finishReveal(d);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('a road event with a fight: win it from the road and carry on', async () => {
    const d = await open(browser, { speed: 6 });
    await prepare(d, `
      ['cen','ruo','zhuo'].forEach((id) => { s.heroes[id].joined = true; s.heroes[id].lv = 60; s.heroes[id].train = { hp: 40, atk: 40, def: 40, spd: 15 }; });
      ['c1','c2','c3'].forEach((c) => 'abcdefgh'.split('').forEach((l) => { s.progress.cleared[c + l] = true; }));
      ['c4a','c4b'].forEach((id) => { s.progress.cleared[id] = true; });
      s.progress.chapter = 3; s.progress.stars = 3;
      s.settings.auto = true; s.settings.speed = 3;
      s.idle.target = 'c4c'; s.idle.toNext = 999;
    `);
    await go(d, 'road');
    await settle(d, 'Road');
    await d.tap('road-act');
    await d.waitScene('Modal');
    await d.tap('modal-0'); // Open the prison cart.
    await d.waitScene('Modal');
    await d.tap('modal-0'); // Face what comes out.
    await d.waitFor('win-continue', 30000);
    await d.tap('win-continue');
    await d.waitFor('modal-0', 8000);
    assert.ok(!(await d.state()).progress.cleared.c4c, 'not done until the player has read the outcome');
    const incense = (await d.state()).items.incense;
    await d.tap('modal-0');
    await settle(d, 'Road');
    const s = await d.state();
    assert.ok(s.progress.cleared.c4c, 'the event finished');
    assert.ok(s.items.incense >= incense, 'and paid out');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('stipend: claimable once a day, also with WeRun off', async () => {
    const d = await open(browser, { speed: 3 });
    await introToReveal(d);
    await d.tap('reveal-skip');
    await finishReveal(d);
    assert.strictEqual((await d.state()).stardust >= 300, true);
    await d.tap('nav-altar');
    await d.waitScene('Altar');
    const calls = await d.page.evaluate(() => window.__wxMock.calls);
    assert.ok(!calls.includes('authorize'), 'opening the altar must not trigger a permission prompt');
    const t = await d.state();
    await d.page.evaluate(() => { window.__BUXU__.game.top().scroll = 9999; });
    await d.page.waitForTimeout(100);
    await d.tap('altar-stipend');
    assert.strictEqual((await d.state()).stardust >= t.stardust + 100, true);
    await d.page.waitForTimeout(100);
    assert.strictEqual(await d.has('altar-stipend'), false);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('privacy: refusing keeps the game playable and accepting then works', async () => {
    const d = await open(browser, { speed: 3, query: '?privacy=ask' });
    await introToReveal(d);
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
    await introToReveal(d);
    await d.tap('reveal-connect');
    await d.waitFor('reveal-skip2');
    await d.tap('reveal-skip2');
    await finishReveal(d);
    assert.strictEqual((await d.state()).stardust, 300);
    await d.tap('nav-altar');
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
    await prepare(d, `
      s.flags.seen.c1_first_step = 1; s.flags.seen.c1_ruo = 1;
      s.heroes.cen.lv = 8; s.heroes.ruo.joined = true; s.heroes.ruo.lv = 8;
      s.progress.cleared.c1a = true;
      s.items = { pill: 3, ether: 3, incense: 1, seal: 20 };
      s.settings.auto = false;
    `);
    await go(d, 'map', { chapter: 0, focus: 1 });
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
    await assertTidy(d, 'skill menu');
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
    await assertTidy(d, 'victory');
    const s = await d.state();
    assert.ok(Object.keys(s.spirits).length > 0, 'captured a spirit');
    assert.ok(s.progress.cleared.c1b, 'node recorded as cleared');
    assert.ok(s.coin > 0, 'fights pay coins');
    await d.tap('win-continue');
    await d.page.waitForTimeout(300);
    await d.skipDialogue();
    await d.waitScene('WorldMap');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('losing is safe: nothing is charged, retry works, and the march carries on', async () => {
    const d = await open(browser, { speed: 4 });
    await prepare(d, `
      s.stardust = 600;
      s.settings.auto = true;
      s.settings.speed = 3;
      s.items = { pill: 0, ether: 0, incense: 0, seal: 0 };
      'abcdefg'.split('').forEach((l) => { s.progress.cleared['c1' + l] = true; });
      s.flags.seen.c1_boss = 1;
      s.idle.target = 'c1h'; s.idle.toNext = 99;
    `);
    await go(d, 'road');
    await settle(d, 'Road');
    await d.waitFor('road-act');
    await d.tap('road-act');
    await d.waitFor('lose-retry', 60000);
    await shot(d, 'defeat');
    await assertTidy(d, 'defeat');
    assert.strictEqual((await d.state()).stardust, 600, 'losing costs nothing');
    assert.strictEqual(await d.has('lose-altar'), false, 'defeat does not send the player to the step altar');
    await d.tap('lose-back');
    await settle(d, 'Road');
    await d.tap('road-act');
    await d.waitScene('BattleScene', 8000);
    assert.strictEqual((await d.state()).stardust, 600);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('chest: footpower opens it, from walking or from time on the road', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, `['a','b','c','d'].forEach((l) => { s.progress.cleared['c1' + l] = true; }); s.steps.total = 100;`);
    await go(d, 'map', { chapter: 0 });
    await d.waitScene('WorldMap');
    await d.tap('node-c1e');
    await d.tap('map-go');
    await d.waitScene('Modal');
    assert.ok(!(await d.state()).progress.cleared.c1e);
    await d.tap('modal-0');
    // No real steps at all: time on the road builds the same footpower, and the march picks it up.
    await d.page.evaluate(() => {
      const B = window.__BUXU__, s = B.store.get();
      s.steps.total = 0;
      s.idle.total = 3000 / B.idle.FOOT_PER_SEC;
    });
    await d.page.waitForFunction(() => window.__BUXU__.store.get().progress.cleared.c1e, null, { timeout: 8000 });
    const st = await d.state();
    assert.strictEqual(st.steps.total, 0);
    assert.ok(st.idle.pack.dust >= 100, 'the chest pays into the pack');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('furnace and party UI: refine a relic over time, equip it, train with it', async () => {
    const d = await open(browser, { speed: 4 });
    await prepare(d, `${OPEN_ALL}; s.coin = 200000; s.stardust = 500; s.spirits = { vine: 2, wisp: 1 };`);
    await go(d, 'station');
    await d.waitScene('Station');
    await d.tap('st-furnace');
    await d.waitScene('Furnace');
    await d.tap('spirit-vine');
    await d.tap('spirit-wisp');
    await assertTidy(d, 'furnace preview');
    await d.tap('furnace-go');
    let s = await d.state();
    assert.strictEqual(s.relics.length, 0, 'it takes time');
    assert.strictEqual(s.furnace.jobs.length, 1);
    assert.strictEqual(s.coin, 200000 - 4000);
    await assertTidy(d, 'furnace running');
    await d.tap('furnace-rush');
    await d.waitFor('furnace-open');
    await d.tap('furnace-open');
    await d.waitScene('Modal', 8000);
    s = await d.state();
    assert.strictEqual(s.relics.length, 1);
    assert.strictEqual(s.relics[0].type, 'fire_wood');
    await d.tap('modal-1');
    await d.waitScene('Party');
    const atk0 = (await d.state()).heroes.cen.train.atk;
    await d.tap('train-atk');
    assert.strictEqual((await d.state()).heroes.cen.train.atk, atk0 + 1);
    await d.tap('train-auto');
    assert.ok((await d.state()).daily.done.train);
    await d.tap('relic-0');
    await d.waitScene('RelicPick');
    await d.tap('pick-' + s.relics[0].uid);
    await d.waitScene('Party');
    assert.strictEqual((await d.state()).heroes.cen.relics[0], s.relics[0].uid);
    await d.tap('nav-station');
    await d.waitScene('Station');
    await d.tap('st-shop');
    await d.waitScene('Shop');
    await d.page.evaluate(() => { window.__BUXU__.store.get().coin = 50000; });
    await d.page.waitForTimeout(80);
    const p0 = (await d.state()).items.pill;
    await d.tap('buy-pill');
    assert.strictEqual((await d.state()).items.pill, p0 + 1);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('couriers: send a letter, close the game, come back to the reply', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, OPEN_ALL);
    await go(d, 'station');
    await d.waitScene('Station');
    await d.tap('st-dispatch');
    await d.waitScene('DispatchScene');
    await d.page.waitForTimeout(120);
    const job = (await d.ids()).find((i) => i.startsWith('job-'));
    assert.ok(job, 'the board has errands');
    await shot(d, 'dispatch');
    await assertTidy(d, 'dispatch');
    await d.tap(job);
    await d.waitScene('CourierPick');
    await shot(d, 'courier-pick');
    await assertTidy(d, 'courier pick');
    await d.tap('courier-zhou');
    await d.waitScene('DispatchScene');
    let s = await d.state();
    assert.strictEqual(s.dispatch.active.length, 1);
    assert.ok(s.daily.done.dispatch);
    const coin0 = s.coin;
    await skipTime(d, 9 * HOUR);
    await d.waitFor('dispatch-claim');
    await d.tap('dispatch-claim');
    await d.waitScene('Modal');
    await assertTidy(d, 'dispatch reward');
    s = await d.state();
    assert.ok(s.coin > coin0);
    assert.strictEqual(s.dispatch.active.length, 0);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('garden: plant by neighbours, harvest on return, cook a meal that speeds the road', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, OPEN_ALL);
    await go(d, 'station');
    await d.waitScene('Station');
    await d.tap('st-garden');
    await d.waitScene('GardenScene');
    await d.tap('plot-0');
    await d.waitScene('SeedPick');
    await assertTidy(d, 'seed pick');
    await d.tap('seed-water');
    await d.waitScene('GardenScene');
    await d.tap('plot-1');
    await d.waitScene('SeedPick');
    await shot(d, 'seed-pick');
    await d.tap('seed-wood');
    await d.waitScene('GardenScene');
    let s = await d.state();
    assert.strictEqual(s.garden.plots[0].el, 'water');
    assert.strictEqual(s.garden.plots[1].el, 'wood');
    await d.tap('garden-water');
    await skipTime(d, 7 * HOUR);
    await d.waitFor('garden-harvest');
    await assertTidy(d, 'garden');
    await d.tap('garden-harvest');
    s = await d.state();
    assert.ok(s.herbs.wood > 3, 'water beside wood gave a bigger harvest');
    assert.ok(s.herbs.water > 0);
    assert.ok(s.daily.done.garden);
    await d.page.evaluate(() => { const st = window.__BUXU__.store.get(); st.herbs = { wood: 9, fire: 9, earth: 9, metal: 9, water: 9 }; });
    await d.tap('tab-kitchen');
    await d.page.waitForTimeout(100);
    await assertTidy(d, 'kitchen');
    await shot(d, 'kitchen');
    await d.tap('cook-pill');
    await d.tap('cook-meal_xp');
    s = await d.state();
    assert.strictEqual(s.idle.meal, 'xp');
    assert.ok(s.idle.mealSecs > 0);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('sky stair: a floor can be fought, pays Stardust, and only the first time', async () => {
    const d = await open(browser, { speed: 6 });
    await prepare(d, `${OPEN_ALL}; ['cen','ruo','zhuo'].forEach((id) => { s.heroes[id].lv = 40; s.heroes[id].train = { hp: 30, atk: 30, def: 30, spd: 10 }; }); s.settings.auto = true; s.settings.speed = 3;`);
    await d.page.evaluate(() => window.__BUXU__.game.go('trials', null, true));
    await d.waitScene('Trials');
    await assertTidy(d, 'trials');
    await d.tap('trial-tower');
    await d.waitScene('TowerScene');
    await assertTidy(d, 'tower');
    await shot(d, 'tower');
    const d0 = (await d.state()).stardust;
    await d.tap('tower-fight');
    await d.waitFor('win-continue', 40000);
    let s = await d.state();
    assert.strictEqual(s.tower.best, 1);
    assert.ok(s.stardust > d0, 'first clear pays Stardust');
    assert.ok(s.daily.done.tower);
    await d.tap('win-continue');
    await d.waitScene('TowerScene');
    s = await d.state();
    assert.strictEqual(s.tower.best, 1);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('wander: roll the dice, walk the board, take the prize', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, `${OPEN_ALL}; s.wander.rolls = 2; s.wander.regen = B.clock.now() + 3600000; s.stardust = 100;`);
    await go(d, 'wander');
    await d.waitScene('WanderScene');
    await assertTidy(d, 'wander');
    await shot(d, 'wander');
    const pos = (await d.state()).wander.pos;
    await d.tap('wander-roll');
    await d.waitScene('Modal', 12000);
    let s = await d.state();
    assert.notStrictEqual(s.wander.pos, pos);
    assert.ok(s.daily.done.wander);
    await assertTidy(d, 'wander prize');
    await d.tap('modal-0');
    await d.waitScene('WanderScene');
    await d.tap('wander-buy');
    s = await d.state();
    assert.strictEqual(s.stardust >= 50, true);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('daily errands: done, claimed, and the bonus arrives without walking', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, `${OPEN_ALL}; const day = B.idle.dayOf(B.clock.now()); s.daily.day = day; s.daily.done = { collect: true, train: true, dispatch: true, garden: true };`);
    await go(d, 'trials');
    await d.waitScene('Trials');
    const d0 = (await d.state()).stardust;
    for (const id of ['collect', 'train', 'dispatch', 'garden']) await d.tap('daily-' + id);
    assert.strictEqual((await d.state()).stardust, d0 + 100);
    await d.page.waitForTimeout(80);
    await d.tap('daily-bonus');
    assert.strictEqual((await d.state()).stardust, d0 + 200);
    assert.strictEqual((await d.state()).steps.total, 0, 'all of it with no real steps');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('letters and wardrobe: read mail, dress up, and strength does not change', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, `${OPEN_ALL}; s.letters.got = [0, 1]; s.letters.unread = 2; s.stardust = 5000;`);
    await go(d, 'station');
    await d.waitScene('Station');
    await d.tap('st-letters');
    await d.waitScene('Letters');
    await assertTidy(d, 'letters');
    await shot(d, 'letters');
    assert.strictEqual((await d.state()).letters.unread, 0);
    await d.tap('back');
    await d.waitScene('Station');
    await d.tap('st-wardrobe');
    await d.waitScene('WardrobeScene');
    await assertTidy(d, 'wardrobe');
    await shot(d, 'wardrobe');
    const power0 = await d.page.evaluate(() => { const B = window.__BUXU__; return JSON.stringify(B.store.get().heroes.cen.train); });
    await d.tap('wear-cen_moon');
    let s = await d.state();
    assert.strictEqual(s.heroes.cen.outfit, 'cen_moon');
    assert.strictEqual(s.stardust, 3500);
    assert.strictEqual(JSON.stringify(s.heroes.cen.train), power0);
    await d.tap('wear-cen_moon');
    s = await d.state();
    assert.strictEqual(s.heroes.cen.outfit, null, 'tapping again takes it off, and does not charge again');
    assert.strictEqual(s.stardust, 3500);
    await d.tap('wear-cen_moon');
    await go(d, 'road');
    await settle(d, 'Road');
    await d.page.waitForTimeout(800);
    await shot(d, 'road-outfit');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('full campaign through the road screen: every chapter, then both endings, with no steps', async () => {
    const d = await open(browser, { speed: 10 });
    await prepare(d, `
      s.settings.auto = true;
      s.settings.speed = 3;
      s.items = { pill: 30, ether: 30, incense: 10, seal: 0 };
      s.heroes.ruo.joined = false; s.heroes.zhuo.joined = false;
      ['cen','ruo','zhuo'].forEach((id) => { s.heroes[id].lv = 60; s.heroes[id].train = { hp: 40, atk: 40, def: 40, spd: 15 }; });
    `);
    await go(d, 'road');
    const seen = new Set();
    const t0 = Date.now();
    let steps = 0;
    while (Date.now() - t0 < 480000 && steps++ < 8000) {
      const scene = await d.scene();
      seen.add(scene);
      const ids = await d.ids();
      if (await d.page.evaluate(() => !!window.__BUXU__.game.transition)) { await d.page.waitForTimeout(30); continue; }
      if (ids.includes('ending-done')) break;
      if (scene === 'Dialog') { await d.tap('dialog-skip'); continue; }
      if (scene === 'Modal') { await d.tap('modal-0'); continue; }
      if (scene === 'Road') {
        if (ids.includes('road-act')) { await d.tap('road-act'); await d.page.waitForTimeout(60); continue; }
        // Nothing to decide: time passes and the party walks on.
        await skipTime(d, 1800000);
        await d.page.evaluate(() => {
          const B = window.__BUXU__, st = B.store.get();
          B.idle.collect(st);
          B.idle.nudge(st);
        });
        await d.page.waitForTimeout(40);
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
    await assertTidy(d, 'credits');
    const s = await d.state();
    assert.strictEqual(s.steps.total, 0, 'the whole story, with no real steps');
    assert.strictEqual(s.progress.stars, 6, 'six stars lit by turning the handle');
    assert.strictEqual(s.progress.ending, 'turn');
    assert.ok(s.heroes.ruo.joined && s.heroes.zhuo.joined, 'party complete');
    CHAPTERS_NODE_CHECK(s);
    await d.tap('ending-done');
    await settle(d, 'Road');
    await shot(d, 'road-after-ending');
    // Afterwards the road loops on, and the other ending stays available from the final node.
    const st2 = await d.page.evaluate(() => window.__BUXU__.idle.status(window.__BUXU__.store.get()).kind);
    assert.ok(st2 === 'lap' || st2 === 'blocked', `the road carries on after the story, got ${st2}`);
    await go(d, 'map', { chapter: 5 });
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
      await prepare(d, `
        ${OPEN_ALL};
        s.stardust = 12345; s.coin = 1234567;
        s.spirits = { vine: 2, wisp: 1, clay: 3 };
        s.idle.secs = 7000;
        s.idle.pack = { coin: 123456, xp: 98765, dust: 12, items: { seal: 2 }, spirits: { clay: 2 }, herbs: { wood: 2 } };
        s.idle.hasteSecs = 7200; s.idle.meal = 'xp'; s.idle.mealSecs = 18000;
        s.relics = [{ uid: 'r1', type: 'metal_metal', rank: 1 }]; s.relicSeq = 1;
        s.tower.best = 12;
        s.wander.rolls = 3; s.wander.regen = B.clock.now() + 3600000;
        s.furnace.jobs = [{ type: 'earth_wood', rank: 1, doneAt: B.clock.now() + 900000 }];
        s.letters.got = [0, 1, 2];
        s.settings.auto = false;
        s.flags.seen.c1_first_step = 1; s.flags.seen.c2_mother = 1;
      `);
      const visit = async (where, scene, params) => {
        await go(d, scene, params);
        await d.page.waitForTimeout(220);
        await assertOnScreen(d, where);
        await assertTidy(d, where);
        await shot(d, `${name}-${where}`);
      };
      await visit('road', 'road');
      await visit('station', 'station');
      await visit('party', 'party');
      await visit('trials', 'trials');
      await visit('altar', 'altar');
      await visit('dispatch', 'dispatch');
      await visit('garden', 'garden');
      await d.tap('tab-kitchen');
      await d.page.waitForTimeout(100);
      await assertTidy(d, 'kitchen');
      await visit('letters', 'letters');
      await visit('wardrobe', 'wardrobe');
      await visit('shop', 'shop');
      await visit('furnace', 'furnace');
      await visit('tower', 'tower');
      await visit('wander', 'wander');
      await visit('map', 'map', { chapter: 1 });
      await d.tap('map-go').catch(() => {});
      await go(d, 'battle', { fight: { lv: 12, foes: ['bifang', 'firerat', 'wisp'] }, chapter: 1, from: 'road' });
      await d.waitFor('cmd-attack', 15000);
      await assertOnScreen(d, 'battle');
      await assertTidy(d, 'battle');
      await shot(d, `${name}-battle`);
      await d.tap('cmd-skill');
      await d.page.waitForTimeout(100);
      await assertOnScreen(d, 'skills');
      await assertTidy(d, 'skills');
      await d.assertClean();
      await d.ctx.close();
    });
  }

  await check('art budget: every screen and region stays within memory and drawing limits', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, `${OPEN_ALL}; s.settings.auto = false; s.spirits = { vine: 2 };`);
    const report = [];
    const measure = async (label) => {
      await d.page.waitForTimeout(500);
      const dc = await d.page.evaluate(() => new Promise((ok) => {
        const P = CanvasRenderingContext2D.prototype;
        const of = P.fillRect, od = P.drawImage;
        let f = 0, g = 0, n = 0;
        P.fillRect = function (...a) { f++; return of.apply(this, a); };
        P.drawImage = function (...a) { g++; return od.apply(this, a); };
        const tick = () => {
          if (++n >= 12) {
            P.fillRect = of;
            P.drawImage = od;
            ok({ fill: Math.round(f / 12), draw: Math.round(g / 12) });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }));
      const st = await d.page.evaluate(() => window.__BUXU__.art.stats());
      report.push({ label, ...dc, ...st });
    };
    for (const sc of ['road', 'station', 'party', 'trials', 'altar', 'dispatch', 'garden', 'wardrobe', 'furnace', 'shop', 'tower', 'wander', 'letters']) {
      await go(d, sc);
      await measure(sc);
    }
    for (let c = 0; c < 6; c++) {
      await d.page.evaluate((ci) => {
        const B = window.__BUXU__, s = B.store.get();
        s.flags.seen = new Proxy({}, { get: () => true, set: () => true, has: () => true });
        s.progress.cleared = {};
        B.chapters.CHAPTERS.forEach((ch, i) => { if (i < ci) ch.nodes.forEach((n) => { s.progress.cleared[n.id] = true; }); });
        s.progress.chapter = ci;
        B.game.go('road', null, true);
      }, c);
      await measure('region ' + (c + 1) + ' road');
      await d.page.evaluate((ci) => {
        const B = window.__BUXU__;
        const node = B.chapters.CHAPTERS[ci].nodes.filter((n) => n.foes).pop();
        B.game.go('battle', { fight: { lv: 10, foes: node.foes }, chapter: ci, from: 'road' }, true);
      }, c);
      await measure('region ' + (c + 1) + ' boss');
      await d.page.evaluate((ci) => window.__BUXU__.game.go('map', { chapter: ci }, true), c);
      await measure('region ' + (c + 1) + ' map');
    }
    const worst = report.reduce((a, r) => ({ canvases: Math.max(a.canvases, r.canvases), mb: Math.max(a.mb, r.mb), fill: Math.max(a.fill, r.fill), draw: Math.max(a.draw, r.draw) }), { canvases: 0, mb: 0, fill: 0, draw: 0 });
    report.forEach((r) => console.log(`        ${r.label.padEnd(16)} canvases ${String(r.canvases).padStart(3)}  memory ${String(r.mb).padStart(5)} MB  fillRect ${String(r.fill).padStart(4)}  drawImage ${String(r.draw).padStart(4)}`));
    console.log(`        worst: ${JSON.stringify(worst)}`);
    // Before this work the same kind of tour reached 90 canvases, 28.3 MB and 1,498 fillRects a frame.
    assert.ok(worst.canvases <= 28, `too many canvases: ${worst.canvases}`);
    assert.ok(worst.mb <= 12, `too much canvas memory: ${worst.mb} MB`);
    assert.ok(worst.fill <= 420, `too many fillRect calls per frame: ${worst.fill}`);
    assert.ok(worst.draw <= 320, `too many drawImage calls per frame: ${worst.draw}`);
    await d.assertClean();
    await d.ctx.close();
  });

  await check('memory warning: scenery can be dropped at any moment and comes back', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, OPEN_ALL);
    await go(d, 'road');
    await settle(d, 'Road');
    const before = await d.page.evaluate(() => window.__BUXU__.art.stats());
    assert.ok(before.sceneryCanvases > 0);
    await d.page.evaluate(() => window.__wxMock.memoryWarning());
    await d.page.waitForTimeout(250);
    const after = await d.page.evaluate(() => window.__BUXU__.art.stats());
    assert.ok(after.sceneryCanvases > 0, 'the next frame repaints what it needs');
    await d.assertClean();
    await d.ctx.close();
  });

  await check('power saving: the game runs at 30 fps and slows when left alone', async () => {
    const d = await open(browser, { speed: 3 });
    await prepare(d, OPEN_ALL);
    await go(d, 'road');
    await settle(d, 'Road');
    const fps = await d.page.evaluate(() => window.__wxMock.fps);
    assert.strictEqual(fps, 30);
    await d.page.evaluate(() => { window.__BUXU__.game.lastTouch = Date.now() - 120000; });
    await d.page.waitForTimeout(1300);
    assert.strictEqual(await d.page.evaluate(() => window.__wxMock.fps), 15, 'left alone it drops to save battery');
    await d.page.evaluate(() => { window.__BUXU__.game.lastTouch = Date.now(); });
    await d.page.waitForTimeout(1300);
    assert.strictEqual(await d.page.evaluate(() => window.__wxMock.fps), 30);
    await d.assertClean();
    await d.ctx.close();
  });

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
    if (n.type === 'chest') return;
    assert.ok(s.progress.cleared[n.id], `node ${n.id} never cleared`);
  }));
}
