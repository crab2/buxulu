// The game draws to a low-resolution buffer, then scales it up by a whole number so every art
// pixel stays square on any phone. Width and height vary a little between devices, so layouts are
// written relative to W, H and the safe-area insets below.
const sizing = require('./sizing.js');
const presenter = require('./present.js');

const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const pr = info.pixelRatio || 1;

const main = wx.createCanvas();
const fit = sizing.fit(info.windowWidth, info.windowHeight, pr);
const { physW, physH, scale, W, H } = fit;
main.width = physW;
main.height = physH;

const back = wx.createCanvas();
back.width = W;
back.height = H;
const ctx = back.getContext('2d');
ctx.imageSmoothingEnabled = false;

const screen = presenter.create(main, back, () => wx.createCanvas(), fit);

const toLogical = (css) => (css * pr) / scale;

const safe = info.safeArea || { top: info.statusBarHeight || 0, bottom: info.windowHeight };
const safeTop = Math.round(toLogical(safe.top || 0));
const safeBottom = Math.max(0, H - Math.round(toLogical(safe.bottom || info.windowHeight)));

// WeChat's capsule menu sits at the top right of every mini-game. The header row lines up with it
// and stops short of it, so nothing tappable ever hides underneath.
let cap = null;
try {
  cap = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
} catch (e) {
  cap = null;
}
const capTop = cap && cap.height ? Math.round(toLogical(cap.top)) : safeTop + 4;
const capBottom = cap && cap.height ? Math.round(toLogical(cap.bottom)) : safeTop + 24;
const capLeft = cap && cap.height ? Math.round(toLogical(cap.left)) : W - 70;

// Thirty frames a second is plenty for this art and much kinder to a phone left running on a desk.
function setFps(fps) {
  if (wx.setPreferredFramesPerSecond) wx.setPreferredFramesPerSecond(fps);
}

// Share cards default to a screenshot of the game, which a WebGL screen may not be able to give. The back
// buffer is an ordinary canvas that always can. Returns nothing if the runtime cannot, and WeChat then
// falls back to its own screenshot.
function shareImage() {
  try {
    const height = Math.min(H, Math.round(W * 0.8));
    return back.toTempFilePathSync({ x: 0, y: 0, width: W, height, destWidth: W * 2, destHeight: height * 2 });
  } catch (e) {
    return undefined;
  }
}

module.exports = {
  W, H, scale, ctx, back, setFps, safeTop, safeBottom, capTop, capBottom, capLeft, contentTop: capBottom + 4,
  touchX: (css) => toLogical(css), touchY: (css) => toLogical(css),
  present: () => screen.draw(),
  shareImage,
  // What this device actually ended up with. The settings screen shows it, so a phone that looks wrong
  // can be diagnosed without a debugger.
  info: { mode: screen.mode, why: screen.why, smoothing: screen.smoothing, pr, physW, physH, bufW: screen.bufW, bufH: screen.bufH },
};
