// Puts the finished low-resolution frame on the screen as square pixels.
//
// imageSmoothingEnabled = false is only a request, and a runtime is free to filter anyway. Desktop Chromium
// honours it, which is why the game looks sharp in WeChat DevTools. So the frame is enlarged here in code and
// written with putImageData, which never filters, into an off-screen canvas of the screen's exact size. That
// canvas is then drawn to the screen at 1:1. Nothing is scaled at that point, so there is nothing to filter.
//
// The on-screen canvas stays 2D on purpose. A WebGL screen stayed on its first frame on a real phone, sharp and
// with no errors, while the game ran on behind it (`webgl f108 e0`). Nothing in code can see that happen, so it
// can't be tested for or recovered from, and a canvas can't go back to 2D once it has WebGL. drawImage on a 2D
// screen is what the game had always done on that phone, with the picture moving.

// Most frames change only some rows, so only those are enlarged, and a row that is unchanged costs one compare.
function sameRow(now, last, at, width) {
  for (let x = 0; x < width; x++) if (now[at + x] !== last[at + x]) return false;
  return true;
}

// Pixel art comes in long runs of one colour, and filling a run beats writing each pixel on a phone without a
// JIT. The width may end part way through a block, because the buffer can be slightly wider than the screen.
function enlargeRow(now, y, dst, { physW, physH, W, scale }) {
  const start = y * scale * physW, end = start + physW, at = y * W;
  let x = 0;
  while (x < W) {
    const colour = now[at + x];
    let next = x + 1;
    while (next < W && now[at + next] === colour) next++;
    dst.fill(colour, start + x * scale, Math.min(end, start + next * scale));
    x = next;
  }
  const lines = Math.min(scale, physH - y * scale);
  for (let line = 1; line < lines; line++) dst.copyWithin(start + line * physW, start, end);
}

// partial: write only the rows that changed, using the longer form of putImageData.
function exactScreen(ctx, back, make, fit, partial) {
  const { physW, physH, W, H, scale } = fit;
  const big = make();
  big.width = physW;
  big.height = physH;
  const bigCtx = big.getContext('2d');
  const out = bigCtx.createImageData(physW, physH);
  const dst = new Uint32Array(out.data.buffer, out.data.byteOffset, physW * physH);
  const source = back.getContext('2d');
  let last = null;
  return () => {
    const { data } = source.getImageData(0, 0, W, H);
    const now = new Uint32Array(data.buffer, data.byteOffset, W * H);
    let top = -1, bottom = -1;
    for (let y = 0; y < H; y++) {
      if (last && sameRow(now, last, y * W, W)) continue;
      enlargeRow(now, y, dst, fit);
      if (top < 0) top = y;
      bottom = y;
    }
    last = now;
    if (top >= 0) {
      const from = top * scale;
      if (partial) bigCtx.putImageData(out, 0, 0, 0, from, physW, Math.min(physH, (bottom + 1) * scale) - from);
      else bigCtx.putImageData(out, 0, 0);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(big, 0, 0);
  };
}

// The fallback, and how the game has always drawn: whether this stays sharp is up to the runtime.
function flagScreen(ctx, back, W, H, scale) {
  return () => {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(back, 0, 0, W * scale, H * scale);
  };
}

const PROBE = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [32, 32, 32], [192, 128, 64], [10, 200, 90], [220, 30, 160], [64, 64, 200]];
// The screen ends part way through a block on both axes, as a real one can.
const PROBE_FIT = { physW: 5, physH: 5, W: 3, H: 3, scale: 2 };

// Runs the real route on spare canvases and reads the result back, exact to the pixel. There are two frames,
// because the game redraws one canvas every frame and a first frame proves nothing about the next. The second
// changes only the middle row, the case where a partial write has to leave the other rows alone.
function worksExactly(make, partial) {
  const spares = [];
  const spare = () => {
    const c = make();
    spares.push(c);
    return c;
  };
  try {
    const { physW, physH, W, H, scale } = PROBE_FIT;
    const src = spare();
    src.width = W;
    src.height = H;
    const dst = spare();
    dst.width = physW;
    dst.height = physH;
    const paint = src.getContext('2d'), read = dst.getContext('2d');
    const show = exactScreen(read, src, spare, PROBE_FIT, partial);
    const second = PROBE.map((rgb, i) => (i >= W && i < W * 2 ? PROBE[(i + 4) % PROBE.length] : rgb));
    for (const frame of [PROBE, second]) {
      frame.forEach((rgb, i) => {
        paint.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        paint.fillRect(i % W, Math.floor(i / W), 1, 1);
      });
      show();
      const px = read.getImageData(0, 0, physW, physH).data;
      for (let y = 0; y < physH; y++) {
        for (let x = 0; x < physW; x++) {
          const want = frame[Math.floor(y / scale) * W + Math.floor(x / scale)];
          const at = (y * physW + x) * 4;
          for (let k = 0; k < 3; k++) if (Math.abs(px[at + k] - want[k]) > 2) return false;
        }
      }
    }
    return true;
  } catch (e) {
    return false;
  } finally {
    spares.forEach((c) => {
      c.width = 1;
      c.height = 1;
    });
  }
}

// Asks the 2D canvas for square pixels and checks whether it listened. Only used to report what a device
// does, so a phone that looks wrong can be told apart from one that merely looks different.
function smoothingIgnored(make) {
  let src = null, dst = null;
  try {
    src = make();
    src.width = 2;
    src.height = 1;
    const a = src.getContext('2d');
    a.fillStyle = '#000000';
    a.fillRect(0, 0, 1, 1);
    a.fillStyle = '#ffffff';
    a.fillRect(1, 0, 1, 1);
    dst = make();
    dst.width = 16;
    dst.height = 1;
    const b = dst.getContext('2d');
    b.imageSmoothingEnabled = false;
    b.drawImage(src, 0, 0, 16, 1);
    const d = b.getImageData(0, 0, 16, 1).data;
    for (let i = 0; i < 16; i++) if (d[i * 4] > 8 && d[i * 4] < 247) return true;
    return false;
  } catch (e) {
    return null;
  } finally {
    [src, dst].forEach((c) => {
      if (!c) return;
      c.width = 1;
      c.height = 1;
    });
  }
}

function create(main, back, make, fit) {
  const { W, H, scale } = fit;
  const ctx = main.getContext('2d');
  const smoothing = smoothingIgnored(make);
  // Writing only the changed rows is the cheap way. If this phone gets that wrong, whole frames are still exact.
  const partial = [true, false].find((p) => worksExactly(make, p));
  if (partial !== undefined) {
    try {
      return { mode: 'exact', why: partial ? '' : 'full', smoothing, draw: exactScreen(ctx, back, make, fit, partial) };
    } catch (e) {
      // The second full-size canvas could not be had. The fallback below needs none.
    }
  }
  return { mode: 'flag', why: '', smoothing, draw: flagScreen(ctx, back, W, H, scale) };
}

module.exports = { create };
