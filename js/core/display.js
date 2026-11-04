// The game draws to a low-resolution buffer, then scales it up by a whole number so every art
// pixel stays square on any phone. Width and height vary a little between devices, so layouts are
// written relative to W, H and the safe-area insets below.
const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const pr = info.pixelRatio || 1;

const main = wx.createCanvas();
const physW = Math.round(info.windowWidth * pr);
const physH = Math.round(info.windowHeight * pr);
main.width = physW;
main.height = physH;

const TARGET_W = 270;
const MIN_H = 470;
const scale = Math.max(1, Math.min(Math.round(physW / TARGET_W), Math.floor(physH / MIN_H)));
const W = Math.ceil(physW / scale);
const H = Math.ceil(physH / scale);

const back = wx.createCanvas();
back.width = W;
back.height = H;
const ctx = back.getContext('2d');
const mainCtx = main.getContext('2d');
ctx.imageSmoothingEnabled = false;
mainCtx.imageSmoothingEnabled = false;

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

function present() {
  mainCtx.imageSmoothingEnabled = false;
  mainCtx.drawImage(back, 0, 0, W * scale, H * scale);
}

module.exports = {
  W, H, scale, ctx, back, present, safeTop, safeBottom, capTop, capBottom, capLeft, contentTop: capBottom + 4,
  touchX: (css) => toLogical(css), touchY: (css) => toLogical(css),
};
