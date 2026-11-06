// Boot sequence. Requiring core/display.js first creates the on-screen canvas, as WeChat expects.
const D = require('./core/display.js');
const game = require('./core/game.js');
const audio = require('./core/audio.js');
const art = require('./core/art.js');
const clock = require('./core/clock.js');
const store = require('./systems/store.js');
const steps = require('./systems/steps.js');
const Idle = require('./systems/idle.js');
const W = require('./data/world.js');
const O = require('./scenes/overlays.js');
require('./scenes/title.js');
require('./scenes/road.js');
require('./scenes/station.js');
require('./scenes/altar.js');
require('./scenes/activities.js');
require('./scenes/trials.js');
require('./scenes/map.js');
require('./scenes/battle.js');
require('./scenes/party.js');
require('./scenes/skills.js');
require('./scenes/gear.js');
require('./scenes/gacha.js');
require('./scenes/ending.js');

store.load();
audio.setup();
audio.configure(store.get().settings);
wx.onTouchEnd(() => audio.keep());
steps.init();
steps.onPrivacyNeeded(O.privacyPrompt);

// Outfits are looked up by name when a hero is drawn.
const outfits = {};
Object.keys(W.COSMETICS).forEach((id) => { if (W.COSMETICS[id].pal) outfits[id] = W.COSMETICS[id].pal; });
art.setOutfits(outfits);

// An idle game gets left running, so it is careful with the battery. It runs at 30 frames a second, and
// drops to 15 once nobody has touched the screen for a while. The player can opt out in settings.
const IDLE_AFTER_MS = 45000;
let currentFps = 0;
function setFps(n) {
  if (n !== currentFps) {
    currentFps = n;
    D.setFps(n);
  }
}
game.applyPower = () => {
  const s = store.get().settings;
  setFps(s.smooth ? 60 : 30);
  if (wx.setKeepScreenOn) wx.setKeepScreenOn({ keepScreenOn: !!s.keepOn });
};
game.applyPower();
game.lastTouch = Date.now();

// The march runs off the wall clock, once a second whatever is on screen.
let tick = 0, saveTick = 0;
function syncIdle() {
  const s = store.get();
  return Idle.sync(s, clock.now());
}
game.onTick = (dt) => {
  tick += dt / game.timeScale;
  saveTick += dt / game.timeScale;
  if (tick >= 1) {
    tick = 0;
    syncIdle();
    audio.keep();
    if (!store.get().settings.smooth) setFps(Date.now() - game.lastTouch > IDLE_AFTER_MS ? 15 : 30);
  }
  if (saveTick >= 20) {
    saveTick = 0;
    store.persist();
  }
};

// Time away becomes progress the moment the player is back, and the road screen reports on it.
function welcomeBack() {
  const s = store.get();
  if (!s.flags.intro) {
    s.idle.last = clock.now();
    return;
  }
  const clearedBefore = Object.keys(s.progress.cleared).length;
  const away = (clock.now() - s.idle.last) / 1000;
  const secs = syncIdle();
  if (away >= 300 && secs > 0) {
    game.away = { secs: away, full: s.idle.secs >= Idle.capSecs(s), cleared: Object.keys(s.progress.cleared).length - clearedBefore };
  }
  store.persist();
}
welcomeBack();

// WeChat's standard share menu. Sharing is never rewarded, because induced sharing is against platform rules.
if (wx.showShareMenu) wx.showShareMenu({ withShareTicket: false });
if (wx.onShareAppMessage) {
  wx.onShareAppMessage(() => ({ title: '人不在,路也替你走着 ——《步虚录》', imageUrl: D.shareImage() }));
}

// Steps are refreshed by WeChat when the player re-enters, which makes this the moment to read them.
if (wx.onShow) {
  wx.onShow(() => {
    audio.resume();
    game.lastTouch = Date.now();
    game.applyPower();
    welcomeBack();
    const top = game.top();
    if (top && top.afterStory) top.afterStory();
    if (store.get().steps.lastView) steps.refresh();
  });
}
if (wx.onHide) {
  wx.onHide(() => {
    audio.pause();
    syncIdle();
    store.persist();
    store.push(true);
  });
}
// Under memory pressure, drop every baked background. They will be repainted as they are needed.
if (wx.onMemoryWarning) wx.onMemoryWarning(() => art.purge());
if (wx.getUpdateManager) {
  const um = wx.getUpdateManager();
  um.onUpdateReady(() => um.applyUpdate());
}

game.go('title', null, true);
game.start();

// A frozen picture looks the same whatever froze it, and a phone has neither a console nor a way to reach the
// settings screen behind it. So a build that isn't released says once, in a native message that doesn't depend
// on the canvas, how the frame is shown, how many frames have run, how many different errors they hit and how
// many milliseconds a frame takes to reach the screen. A second message then says what the music is doing.
if (wx.showToast && !steps.isRelease()) {
  setTimeout(() => {
    const how = D.info.mode + (D.info.why ? ':' + D.info.why : '');
    const ms = Math.round(game.presentMs / Math.max(1, game.frames));
    wx.showToast({ title: `${how} f${game.frames} e${game.errors.length} p${ms}`, icon: 'none', duration: 4000 });
  }, 4000);
  setTimeout(() => wx.showToast({ title: audio.report(), icon: 'none', duration: 4000 }), 8500);
}
store.pull().then((replaced) => {
  if (replaced) audio.configure(store.get().settings);
});

if (typeof GameGlobal !== 'undefined' && GameGlobal.__PREVIEW__) {
  GameGlobal.__BUXU__ = {
    game, store, steps, clock, audio, idle: Idle, art, display: D, chapters: require('./data/chapters.js'), ui: require('./core/ui.js'), font: require('./core/font.js'),
    party: require('./systems/party.js'), skills: require('./systems/skills.js'), gear: require('./systems/gear.js'), gacha: require('./systems/gacha.js'), gearData: require('./data/gear.js'),
  };
}
