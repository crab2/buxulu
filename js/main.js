// Boot sequence. Requiring core/display.js first creates the on-screen canvas, as WeChat expects.
require('./core/display.js');
const game = require('./core/game.js');
const audio = require('./core/audio.js');
const store = require('./systems/store.js');
const steps = require('./systems/steps.js');
const O = require('./scenes/overlays.js');
require('./scenes/title.js');
require('./scenes/hub.js');
require('./scenes/map.js');
require('./scenes/battle.js');
require('./scenes/party.js');
require('./scenes/ending.js');

store.load();
audio.configure(store.get().settings);
steps.init();
steps.onPrivacyNeeded(O.privacyPrompt);

// WeChat's standard share menu. Sharing is never rewarded, because induced sharing is against platform rules.
if (wx.showShareMenu) wx.showShareMenu({ withShareTicket: false });
if (wx.onShareAppMessage) {
  wx.onShareAppMessage(() => ({ title: '把每天走的路,带进一个仙侠世界 ——《步虚录》' }));
}

// Steps are refreshed by WeChat when the player re-enters, which makes this the moment to read them.
if (wx.onShow) {
  wx.onShow(() => {
    audio.resume();
    if (store.get().steps.lastView) steps.refresh();
  });
}
if (wx.onHide) {
  wx.onHide(() => {
    audio.pause();
    store.push(true);
  });
}
if (wx.getUpdateManager) {
  const um = wx.getUpdateManager();
  um.onUpdateReady(() => um.applyUpdate());
}

game.go('title', null, true);
game.start();
store.pull().then((replaced) => {
  if (replaced) audio.configure(store.get().settings);
});

if (typeof GameGlobal !== 'undefined' && GameGlobal.__PREVIEW__) {
  GameGlobal.__BUXU__ = { game, store, steps, ui: require('./core/ui.js'), font: require('./core/font.js') };
}
