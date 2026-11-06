// Screen maths with no canvas in sight, so `npm test` can check it for any phone.
const TARGET_W = 270;
const MIN_H = 470;

// The canvas has to match the panel exactly. A buffer one pixel too wide gets resampled by the phone's
// compositor, which softens the whole picture. iPhones report whole-number ratios, so the sum is exact.
// Android reports whole CSS pixels with a fractional ratio: a 1080-wide panel at 2.75 comes back as 393,
// and 393 x 2.75 is 1080.75. Rounding a CSS pixel moves the product by at most half a CSS pixel, and real
// panels are nearly always a multiple of ten, so that multiple wins whenever it is within reach.
function panelPixels(css, pr) {
  const exact = css * pr;
  if (Number.isInteger(pr)) return exact;
  const tens = Math.round(exact / 10) * 10;
  return Math.abs(exact - tens) <= pr / 2 ? tens : Math.round(exact);
}

// The game draws to a low-resolution buffer and scales it by a whole number, so art pixels stay square.
function fit(windowWidth, windowHeight, pr) {
  const physW = panelPixels(windowWidth, pr);
  const physH = panelPixels(windowHeight, pr);
  const scale = Math.max(1, Math.min(Math.round(physW / TARGET_W), Math.floor(physH / MIN_H)));
  return { physW, physH, scale, W: Math.ceil(physW / scale), H: Math.ceil(physH / scale) };
}

module.exports = { fit, panelPixels, TARGET_W, MIN_H };
