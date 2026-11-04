// Sprites share a few large canvases instead of owning one each. Phones charge for every canvas, and
// a shared page also means fewer texture switches while drawing a frame.
const { css } = require('./palette.js');

const PAGE = 512;
const GUTTER = 1;

const pages = [];

function newPage() {
  const cv = wx.createCanvas();
  cv.width = PAGE;
  cv.height = PAGE;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, PAGE, PAGE);
  ctx.imageSmoothingEnabled = false;
  const page = { cv, ctx, x: 0, y: 0, row: 0 };
  pages.push(page);
  return page;
}

// Simple shelf packing. Sprites are added rarely and live for the whole session.
function place(w, h) {
  let page = pages[pages.length - 1] || newPage();
  if (page.x + w > PAGE) {
    page.x = 0;
    page.y += page.row + GUTTER;
    page.row = 0;
  }
  if (page.y + h > PAGE) {
    page = newPage();
  }
  const spot = { page, x: page.x, y: page.y };
  page.x += w + GUTTER;
  page.row = Math.max(page.row, h);
  return spot;
}

// A sprite is a rectangle on a page, trimmed of empty space. w and h stay the size of the original
// frame, so layouts and animation frames still line up. Draw it with ui.img.
function add(grid) {
  let x0 = grid.w, y0 = grid.h, x1 = -1, y1 = -1;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      if (grid.d[y * grid.w + x] === -1) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { cv: null, sx: 0, sy: 0, tw: 0, th: 0, ox: 0, oy: 0, w: grid.w, h: grid.h };
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const { page, x, y } = place(tw, th);
  // Trimmed sprites keep their transparency, so they are always written pixel by pixel.
  for (let yy = 0; yy < th; yy++) {
    let xx = 0;
    while (xx < tw) {
      const c = grid.d[(yy + y0) * grid.w + xx + x0];
      if (c === -1) {
        xx++;
        continue;
      }
      let run = 1;
      while (xx + run < tw && grid.d[(yy + y0) * grid.w + xx + run + x0] === c) run++;
      page.ctx.fillStyle = css(c);
      page.ctx.fillRect(x + xx, y + yy, run, 1);
      xx += run;
    }
  }
  return { cv: page.cv, sx: x, sy: y, tw, th, ox: x0, oy: y0, w: grid.w, h: grid.h };
}

function stats() {
  return { pages: pages.length, pixels: pages.length * PAGE * PAGE };
}

module.exports = { add, stats, PAGE };
