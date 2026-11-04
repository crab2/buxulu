# 步虚录 (Bùxū Lù)

A pixel-art xianxia **idle game** for WeChat Mini Games. A young courier and his companions walk across six regions to relight the fallen Big Dipper. They walk whether you are watching or not: the party marches, fights and fills its pack while the game is closed, and you come back to collect, upgrade and decide what happens next.

Real WeChat steps are the game's signature resource, and they are entirely optional. Walking makes the journey quicker, comfier and better dressed. Not walking costs nothing that matters: every chapter, activity and ending can be reached with WeRun switched off.

All code, art, story and music are original. Art is drawn in code, and music is synthesised by `tools/gen_audio.js`. The only third-party asset is the font: Fusion Pixel Font, SIL OFL 1.1, licence in `assets/licenses/`.

## What there is to do

| Activity | What you do | Keeps running while away? |
|---|---|---|
| **行路 The Road** | The main idle loop. The party walks, fights and earns coins, experience, spirits and herbs into a pack. Collect it, train, repeat. | Yes, up to the pack's capacity (10 to 26 hours) |
| **星位 Boss fights** | Bosses, story fights and road events wait for you. Play them by hand with guard timing and element counters, or switch to auto. | The party waits, and keeps earning |
| **驿传 Courier errands** | Match hired couriers to letters by element and trait, and pick errand lengths to suit when you will be back. Replies bring coins, herbs, spirits and letters from people you met. | Yes |
| **药圃 Herb garden** | A 3×3 plot where neighbours matter: generating elements raise a crop's yield and overcoming ones lower it. | Yes |
| **膳房 Kitchen** | Cook herbs into supplies, or into an 8-hour meal that boosts coins, experience, marching or spirit finds. | The meal keeps working |
| **星炉 Star furnace** | Refine two captured spirits into one of 15 relics in 3 ranks. Combinations are discovered by trying them. | Yes |
| **登天阶 Sky Stair** | An endless climb of battles with a reward on each first clear. It is the main way to earn Stardust without walking. | No |
| **云游 Wander** | A dice walk around a 24-stop board with a prize at every stop. Free rolls return with time, and steps add more. | Rolls refill |
| **日课 Daily errands** | A short checklist that pays Stardust for playing. | Resets daily |
| **衣橱 Wardrobe** | Outfits, companions that walk with the party, and station decorations. Looks only. | — |

Features open gradually along the road, so the first session is just the march and a couple of fights. After the story ends, the road keeps looping with stronger enemies.

## Run it

**In a browser, with simulated steps and time:**

```bash
npm install
npm run preview        # writes dist/preview/index.html, a single self-contained file
```

On the 步虚 tab, the red development panel has **+2000 步** and **时间快进 1 小时** buttons. They never appear in a release build.

**In WeChat DevTools:** import this folder as a Mini Game project. The default `appid` is a tourist id, and steps are simulated until you deploy the cloud functions.

## How steps work: an enhancement, never a requirement

The design rests on one rule: **coins and experience, which come from time on the road, pay for all progress. Stardust, which comes mostly from walking, only buys enhancements.**

| What walking gives you | Without walking |
|---|---|
| 10 steps = 1 Stardust (last 7 days at half rate) | The same Stardust from the daily wage, daily errands, first clears, the Sky Stair and a slow trickle on the road |
| **御风符** doubles road income for 30 minutes (60 Stardust) | The party walks at full normal speed |
| **缩地符** gives an hour of road income at once (120 Stardust) | Time gives the same income, just later |
| **今日神行**: +5% to +20% march and income today, at 3k to 15k steps | Normal speed. Nobody drops below the baseline |
| **星命**: permanent pack size, march speed and income upgrades | The same upgrades, bought more slowly |
| Real steps carry the party forward, and every 2,000 adds a dice roll | Free rolls return every 4 hours |
| Footpower opens optional chests sooner | Time on the road builds footpower too |
| A few lifetime-step companions and decorations | Everything else in the wardrobe, and purely cosmetic |

No road node, gate, story beat or activity costs Stardust or checks real steps, and `npm test` fails if one starts to.

### Pace, from the balance simulation

`node tests/simulate.js` plays the whole game with simulated players, using the real rules, real simulated battles and the real step ledger. Average of 8 runs, in days to finish the story:

| Player | Days |
|---|---|
| No WeRun, opens once a day | 40 |
| No WeRun, only collects and trains | 32 |
| **No WeRun, plays the activities** | **19** |
| Walks 4,000 steps a day | 16 |
| **Walks 7,000 steps a day** | **15** |
| Walks 12,000 steps a day | 14 |
| Walks 20,000 steps a day | 12 |

The turn-based version this replaced took about 16 days with steps and about 58 without, a 3.6× gap. The gap between a no-WeRun player and a typical walker is now about 1.3×, and how much you play matters more than how far you walk.

These are simulated players on auto. Real players will differ, especially in hand-played boss fights, where guarding against telegraphed attacks beats the auto logic.

### The step exchange itself

The server rules are unchanged from the earlier version, so an existing deployment needs no cloud function update.

```
wx.requirePrivacyAuthorize → wx.authorize(scope.werun) → wx.login → wx.getWeRunData → cloudID
        │
        ▼
cloud function stepExchange
   cloud.getOpenData(cloudID)     WeChat itself says what the steps are
   check watermark.appid and age
   transaction on step_ledger     pays only for steps not yet paid
        │
        ▼
grant { id, dust, items }  stays pending until the client confirms it reached the save
```

| Rule | Value |
|---|---|
| Rate today | 10 steps = 1 Stardust |
| Missed days | Last 7 days, at half rate (20 steps = 1) |
| Daily cap | 30,000 steps earn currency (it also discourages overdoing it) |
| Daily markers | 3k, 6k, 10k and 15k steps give bonus items |
| Streak | Every 7 consecutive days with 3,000+ steps: +300 |
| Lifetime markers | 10k to 5M steps, each with a reward |

The rules live in `js/systems/ledger.js`. The cloud function runs an identical copy, `cloudfunctions/stepExchange/ledger.js`, and a test fails if they differ.

**What this protects, and what it doesn't.** Step *earning* is server-authoritative: the client can't forge steps, claim them twice, or lose a grant to a dropped connection. *Spending* and offline earnings happen in the local save using the device clock, because this is a single-player game with nothing to compete over. Winding the clock forward can fill the pack early, but only up to its capacity each time. A clock moved backwards earns nothing and loses nothing. If you later add PvP, leaderboards or paid items, move balances, spending and time into cloud functions too.

## How the idle march works

`js/systems/idle.js` holds all the rules and is pure logic: time is passed in, so there is no background process, and a week offline costs the same to compute as a second online.

- `sync(save, now)` turns elapsed time into progress, stopping at the pack's capacity. It splits the span wherever a rate could change or the party arrives somewhere.
- Plain fights on the road are decided by real simulated battles using the same combat code as the battle screen. A loss blocks the road and retries every 10 minutes, or straight away once the party gets stronger.
- The party never skips story. It waits at story beats, events and bosses, and income keeps flowing while it waits, so stopping never wastes time.
- Earnings go into the pack, and experience applies when the pack is collected. Coming back and collecting is what lets a blocked party move on.
- The fights on the road screen are a picture of the march, not its cause. Nothing depends on the screen being on.

## Art: drawn in code, on a budget

There are no image files. Every sprite and backdrop is authored in code and baked at runtime, which keeps the package small. What changed is how that art is drawn and held in memory.

**Better art**
- Heroes rebuilt on a limb skeleton with a 6-frame walk, attack anticipation, and hair and ribbons that react to movement.
- A shared shading pass (`Grid.volume`) gives every sprite the same light direction and hue-shifted shadows, plus outlines tinted by what they touch.
- Each region is now a parallax scene of clouds, far range, middle ground, near props, ground and foreground, with seamless looping noise. Battles use the same layers, so a fight happens where the party was just walking.
- The station is a diorama whose garden, disc and decorations show your real state. The road tints with the real time of day.
- Portraits redrawn, the tiger and the ram rebuilt, new icons, and new interface chrome.

**Lighter on the phone** (measured across a tour of every screen and region by `npm run e2e`):

| | Turn-based version | Now |
|---|---|---|
| Canvases | 90 | 31 |
| Canvas memory | 28.3 MB | 11.3 MB |
| `fillRect` calls per frame, worst screen | 1,498 | 212 |
| `drawImage` calls per frame, worst screen | 306 | 245 |
| Package size | 1.47 MB | 1.66 MB |

There is far more art on screen than before, and the package grew by only about 0.2 MB, since all of it is code.

How:
- **Glyph cache.** The font used to bake one 546×546 canvas per text colour, which was 19 MB on its own. Glyphs now share two small pages, and an outlined glyph is one draw rather than five.
- **Sprite atlas.** Sprites share 512×512 pages and are trimmed of empty space. Mirrored poses flip at draw time, and white hit-flash copies are only baked if they are ever needed.
- **Scenery pool.** Backgrounds are baked on demand into a pool with a 7 MB budget, oldest evicted first. `wx.onMemoryWarning` drops them all, and they repaint as needed.
- **Faster baking.** Fully opaque scenery is written with `putImageData` after a device self-test. Anything with transparency uses plain `fillRect` runs, because transparent pixels written with `putImageData` are reported to differ on some iOS devices.
- **Battery.** The game runs at 30 fps, drops to 15 when nobody has touched the screen for 45 seconds, and goes quiet in idle fights. The settings screen has a 60 fps option and a keep-screen-on option.

The e2e suite fails if a screen goes over budget, or if text collides with a button or runs off the screen at any of four phone sizes.

## Go live

Only you can do these steps, because they need your WeChat account.

1. **Register a Mini Game with an enterprise account.** WeChat's [category rules](https://developers.weixin.qq.com/minigame/introduction/guide/type.html) say personal accounts cannot select the 角色类 (role-playing) category, and a role-playing idle game belongs there. Submitting it under a different category risks rejection, because the same page says a category that doesn't match the content is rejected at review.
2. Put your AppID in `project.config.json`.
3. In DevTools, open **云开发**, create an environment and copy its id into `CLOUD_ENV` in `js/config.js`.
4. Right-click `cloudfunctions/stepExchange` and choose **上传并部署:云端安装依赖**. Do the same for `cloudfunctions/cloudSave`.
5. In the cloud database, create the collections `step_ledger` and `saves`, and set both to **仅管理端可读写**. Only the cloud functions should be able to touch them.
6. In the MP admin console, go to **设置 → 基本设置 → 用户隐私保护指引** and declare **微信运动步数**. Without this, `wx.getWeRunData` fails with errno 112, 1025 or 1026 ([guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/privacy.html)).
7. Test on a real phone with real steps. See "What has not been tested" below.
8. Prepare the review documents. Expect to need a software copyright certificate (软著) and a self-review report, and a game licence (版号) if you ever add in-app purchases. These rules change, so confirm them in the MP console. This build has no payments or ads.

## Project layout

```
game.js, game.json, project.config.json   Mini Game entry and configuration
js/config.js          Cloud environment setting
js/core/              Canvas scaling, atlas, glyph cache, scenery pool, input, scenes, audio, particles
js/art/               All sprites and scenery, drawn in code
js/data/              Skills, monsters, relics, chapters, story script, activity content (world.js)
js/systems/           Rules: idle march, battle, economy, boosts, dispatch, garden, tower, wander, daily,
                      wardrobe, ledger, steps client, save
js/scenes/            Screens
cloudfunctions/       stepExchange and cloudSave
assets/audio/         Generated MP3s (1.2 MB)
tools/                Font subsetter, audio generator, web preview bundler and wx stand-in
tests/                Offline tests, balance simulation, browser end-to-end tests
```

The package is about 1.7 MB, against WeChat's 4 MB main package limit. `packOptions` in `project.config.json` keeps `tools/`, `tests/`, `dist/` and `node_modules/` out of the upload.

Saves from the turn-based version upgrade automatically. Progress and Stardust carry over, and training tiers double, because each tier is now half as strong.

**Adding text:** the font contains only the characters the game uses. After adding Chinese text, re-run the subsetter with the 12px `zh_hans` BDF from the [Fusion Pixel Font releases](https://github.com/TakWolf/fusion-pixel-font/releases):

```bash
python3 tools/build_font.py path/to/fusion-pixel-12px-proportional-zh_hans.bdf
```

`npm test` fails if a character is missing.

## Tests

```bash
npm test               # step rules, cloud functions, the march, every activity, combat, content
npm run e2e            # the real game in headless Chromium, driven by pointer events
node tests/simulate.js # balance report across seven kinds of player
```

The end-to-end suite needs a Chromium build. It finds one in the Playwright cache, or set `CHROME_BIN`.

## What has not been tested

Everything above ran against a browser stand-in for the WeChat runtime (`tools/wx-shim.js`) and a fake cloud backend. These still need a real run:

- The game on a real WeChat client, on iOS and Android, including time away with the game truly closed.
- The real WeRun, privacy and cloud calls. The API shapes follow the official docs, but no live call has been made.
- `putImageData`, `multiply` blending, `wx.setPreferredFramesPerSecond`, `wx.setKeepScreenOn` and `wx.onMemoryWarning` on real devices. Each has a feature check or fallback, so a gap should mean a plainer or slower result rather than a crash.
- Audio. The files decode and aren't silent or clipped, but nobody has listened to them yet.
- Frame rate and heat on low-end phones. The draw-call and memory figures above are measured in a browser, not on a phone.
- Real players. The pacing comes from simulated players, so the numbers will need tuning once people actually play.
