# 步虚录 (Bùxū Lù)

A pixel-art xianxia RPG for WeChat Mini Games. Real WeChat steps are exchanged for **星砂 (Stardust)**, the currency that powers character training, relic refining and the star gates that open each new region.

- **Story:** the Big Dipper fell from the sky and the seasons stopped turning. A young courier walks across six regions to relight the stars, and each one brings the people he has met closer to losing what they are holding on to. There are two endings.
- **Play:** side-view turn-based battles with a party of three, five-element counters, telegraphed boss attacks, capturing spirits, refining them into 15 kinds of relic, and a Seven-Star Step finisher that gains one strike for each star restored.
- **Length:** about 16 days for a player walking 7,000 steps a day. About 58 days with WeRun off. Both figures come from a simulated bot playing 8 battles a day (`node tests/simulate.js`).

All code, art, story and music are original. Art is drawn in code, and music is synthesised by `tools/gen_audio.js`. The only third-party asset is the font: Fusion Pixel Font, SIL OFL 1.1, licence in `assets/licenses/`.

## Run it

**In a browser, with simulated steps:**

```bash
npm install
npm run preview        # writes dist/preview/index.html, a single self-contained file
```

**In WeChat DevTools:** import this folder as a Mini Game project. The default `appid` is a tourist id, and steps are simulated until you deploy the cloud functions. A red "开发模式" panel on the Step Altar shows when this is happening. Simulated steps are disabled in release builds.

## Go live

Only you can do these steps, because they need your WeChat account.

1. **Register a Mini Game with an enterprise account.** WeChat's [category rules](https://developers.weixin.qq.com/minigame/introduction/guide/type.html) say personal accounts cannot select the 角色类 (role-playing) category, and a turn-based RPG belongs there. Submitting it under a different category risks rejection, because the same page says a category that doesn't match the content is rejected at review.
2. Put your AppID in `project.config.json`.
3. In DevTools, open **云开发**, create an environment and copy its id into `CLOUD_ENV` in `js/config.js`.
4. Right-click `cloudfunctions/stepExchange` and choose **上传并部署:云端安装依赖**. Do the same for `cloudfunctions/cloudSave`.
5. In the cloud database, create the collections `step_ledger` and `saves`, and set both to **仅管理端可读写**. Only the cloud functions should be able to touch them.
6. In the MP admin console, go to **设置 → 基本设置 → 用户隐私保护指引** and declare **微信运动步数**. Without this, `wx.getWeRunData` fails with errno 112, 1025 or 1026 ([guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/privacy.html)).
7. Test on a real phone with real steps. See "What has not been tested" below.
8. Prepare the review documents. Expect to need a software copyright certificate (软著) and a self-review report, and a game licence (版号) if you ever add in-app purchases. These rules change, so confirm them in the MP console. This build has no payments or ads.

## How the step exchange works

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
| Station wage | +100 a day for everyone, so WeRun is never required |

The rules live in `js/systems/ledger.js`. The cloud function runs an identical copy, `cloudfunctions/stepExchange/ledger.js`, and a test fails if they differ. After changing the rules, copy the file across and redeploy.

**What this protects, and what it doesn't.** Step *earning* is server-authoritative: the client can't forge steps, claim them twice, or lose a grant to a dropped connection. *Spending* happens in the local save, because this is a single-player game with nothing to compete over. If you later add PvP, leaderboards or paid items, move balances and spending into cloud functions too. WeChat's step counts themselves can still be inflated by a phone-shaking device; the daily cap limits how much that gains.

Steps update when the player enters the game, not continuously, which is how WeChat provides them. The altar tells players this.

## Project layout

```
game.js, game.json, project.config.json   Mini Game entry and configuration
js/config.js          Cloud environment setting
js/core/              Canvas scaling, bitmap font, sprites, input, scenes, audio, particles
js/art/               All sprites and scenery, drawn in code
js/data/              Skills, monsters, relics, chapters, story script
js/systems/           Rules: battle, economy, ledger, steps client, save
js/scenes/            Screens
cloudfunctions/       stepExchange and cloudSave
assets/audio/         Generated MP3s (1.2 MB)
tools/                Font subsetter, audio generator, web preview bundler and wx stand-in
tests/                Offline tests, balance simulation, browser end-to-end tests
```

The package is about 1.5 MB, against WeChat's 4 MB main package limit. `packOptions` in `project.config.json` keeps `tools/`, `tests/`, `dist/` and `node_modules/` out of the upload.

**Adding text:** the font contains only the characters the game uses. After adding Chinese text, re-run the subsetter with the 12px `zh_hans` BDF from the [Fusion Pixel Font releases](https://github.com/TakWolf/fusion-pixel-font/releases):

```bash
python3 tools/build_font.py path/to/fusion-pixel-12px-proportional-zh_hans.bdf
```

`npm test` fails if a character is missing.

## Tests

```bash
npm test               # step rules, cloud functions against a fake backend, combat, economy, content
npm run e2e            # the real game in headless Chromium, driven by pointer events
node tests/simulate.js # balance report at four activity levels
```

The end-to-end suite needs a Chromium build. It finds one in the Playwright cache, or set `CHROME_BIN`.

## What has not been tested

Everything above ran against a browser stand-in for the WeChat runtime (`tools/wx-shim.js`) and a fake cloud backend. These still need a real run:

- The game on a real WeChat client, on iOS and Android.
- The real WeRun, privacy and cloud calls. The API shapes follow the current official docs, but no live call has been made.
- Audio. The files decode and aren't silent or clipped, but nobody has listened to them yet.
- Frame rate on low-end phones.
