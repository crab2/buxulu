// A tiny pixel canvas used to author every sprite in code, so the package ships no image files.
const { C, css, mix, lit, drk } = require('./palette.js');

// Colours that carry detail rather than form: eyes, teeth, sparkles. Shading leaves them alone.
const FLAT = new Set([C.ink, C.ink2, C.white, C.gold2]);

// putImageData is far quicker than thousands of fillRects, but transparent pixels written that way are
// reported to differ on some iOS devices. So it is only used for fully opaque bakes, and only after
// this probe has confirmed that the device reads back exactly what was written.
let imageDataOk = null;
function probeImageData(ctx) {
  if (imageDataOk !== null) return imageDataOk;
  try {
    const im = ctx.createImageData(1, 1);
    im.data[0] = 11; im.data[1] = 22; im.data[2] = 33; im.data[3] = 255;
    ctx.putImageData(im, 0, 0);
    const r = ctx.getImageData(0, 0, 1, 1).data;
    imageDataOk = r[0] === 11 && r[1] === 22 && r[2] === 33 && r[3] === 255;
    ctx.clearRect(0, 0, 1, 1);
  } catch (e) {
    imageDataOk = false;
  }
  return imageDataOk;
}

class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Int32Array(w * h).fill(-1);
    this.wrap = false; // Parallax layers repeat, so anything drawn over the edge comes back on the other side.
  }
  set(x, y, c) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.wrap) x = ((x % this.w) + this.w) % this.w;
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c;
    return this;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.d[y * this.w + x];
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }
  ell(cx, cy, rx, ry, c) {
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / (rx + 0.3), dy = (y - cy) / (ry + 0.3);
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
    return this;
  }
  poly(pts, c) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const xs = [];
      const sy = y + 0.5;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
          xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) this.set(x, y, c);
      }
    }
    return this;
  }
  line(x0, y0, x1, y1, c, t) {
    t = t || 1;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      if (t === 1) this.set(Math.round(x), Math.round(y), c);
      else this.rect(Math.round(x - (t - 1) / 2), Math.round(y - (t - 1) / 2), t, t, c);
    }
    return this;
  }
  // Curved limb: quadratic bezier with thickness tapering from t0 to t1.
  curve(x0, y0, cx, cy, x1, y1, c, t0, t1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) + Math.hypot(cx - x0, cy - y0));
    for (let i = 0; i <= n; i++) {
      const s = i / n, u = 1 - s;
      const x = u * u * x0 + 2 * u * s * cx + s * s * x1;
      const y = u * u * y0 + 2 * u * s * cy + s * s * y1;
      const r = (t0 + (t1 - t0) * s) / 2;
      if (r <= 0.6) this.set(Math.round(x), Math.round(y), c);
      else this.ell(x, y, r, r, c);
    }
    return this;
  }
  // Mirror the left half onto the right half, for symmetric creatures.
  mirror() {
    const w = this.w;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < w >> 1; x++) this.d[y * w + (w - 1 - x)] = this.d[y * w + x];
    }
    return this;
  }
  flip() {
    const g = new Grid(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) g.d[y * this.w + (this.w - 1 - x)] = this.d[y * this.w + x];
    }
    return g;
  }
  rot90() {
    const g = new Grid(this.h, this.w);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) g.d[x * g.w + (this.h - 1 - y)] = this.d[y * this.w + x];
    }
    return g;
  }
  stamp(o, dx, dy) {
    for (let y = 0; y < o.h; y++) {
      for (let x = 0; x < o.w; x++) {
        const c = o.d[y * o.w + x];
        if (c !== -1) this.set(x + dx, y + dy, c);
      }
    }
    return this;
  }
  // Rim light from the upper left, core shadow on the lower right.
  rim(hi, lo) {
    hi = hi === undefined ? 0.28 : hi;
    lo = lo === undefined ? 0.32 : lo;
    const src = this.d.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : src[y * this.w + x]);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = at(x, y);
        if (c === -1) continue;
        if (at(x, y - 1) === -1 || at(x - 1, y) === -1) this.d[y * this.w + x] = lit(c, hi);
        else if (at(x, y + 1) === -1 || at(x + 1, y) === -1) this.d[y * this.w + x] = drk(c, lo);
      }
    }
    return this;
  }
  // Soft vertical shading: darken everything from row y0 down to the bottom.
  sink(y0, amt) {
    for (let y = Math.max(0, y0); y < this.h; y++) {
      const t = (amt * (y - y0)) / Math.max(1, this.h - y0);
      for (let x = 0; x < this.w; x++) {
        const c = this.d[y * this.w + x];
        if (c !== -1) this.d[y * this.w + x] = drk(c, t);
      }
    }
    return this;
  }
  outline(c) {
    c = c === undefined ? C.ink : c;
    const src = this.d.slice();
    const on = (x, y) => x >= 0 && y >= 0 && x < this.w && y < this.h && src[y * this.w + x] !== -1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x] !== -1) continue;
        if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) this.d[y * this.w + x] = c;
      }
    }
    return this;
  }
  silhouette(c) {
    const g = new Grid(this.w, this.h);
    for (let i = 0; i < this.d.length; i++) if (this.d[i] !== -1) g.d[i] = c;
    return g;
  }
  recolor(map) {
    const g = new Grid(this.w, this.h);
    for (let i = 0; i < this.d.length; i++) {
      const c = this.d[i];
      g.d[i] = c !== -1 && map[c] !== undefined ? map[c] : c;
    }
    return g;
  }
  // Ordered dither between two colours inside a rectangle, where t(x, y) returns 0..1.
  dither(x, y, w, h, a, b, t) {
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const v = t(i, j);
        const th = (B[((j + y) & 3) * 4 + ((i + x) & 3)] + 0.5) / 16;
        this.set(x + i, y + j, v > th ? b : a);
      }
    }
    return this;
  }
  // Form shading for a finished figure. A distance field from the silhouette acts as a height map, and
  // light from the upper left picks one of four bands per pixel, leaning warm in light and indigo in
  // shadow. One pass gives every sprite the same volume and light direction.
  volume(o) {
    o = o || {};
    const w = this.w, h = this.h;
    const cap = o.cap || Math.max(3, Math.min(11, Math.round(Math.min(w, h) / 9)));
    const hi = o.hi === undefined ? 0.26 : o.hi;
    const lo = o.lo === undefined ? 0.34 : o.lo;
    const keep = o.keep || FLAT;
    const src = this.d;
    const dist = new Float32Array(w * h);
    for (let i = 0; i < dist.length; i++) dist[i] = src[i] === -1 ? 0 : 1e6;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : dist[y * w + x]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (dist[i]) dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.41, at(x + 1, y - 1) + 1.41);
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (dist[i]) dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.41, at(x - 1, y + 1) + 1.41);
      }
    }
    const height = (x, y) => {
      const v = Math.min(at(x, y), cap) / cap;
      return Math.sqrt(1 - (1 - v) * (1 - v));
    };
    const out = src.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const c = src[i];
        if (c === -1 || keep.has(c)) continue;
        const l = (height(x + 1, y) - height(x - 1, y)) * 0.62 + (height(x, y + 1) - height(x, y - 1)) * 0.78;
        if (l > 0.42) out[i] = lit(c, hi);
        else if (l > 0.16) out[i] = lit(c, hi * 0.42);
        else if (l < -0.42) out[i] = drk(c, lo);
        else if (l < -0.16) out[i] = drk(c, lo * 0.5);
      }
    }
    this.d = out;
    return this;
  }
  // Outline tinted by whatever it touches, which sits on a scene more softly than flat black.
  outlineTint(t, ink) {
    t = t === undefined ? 0.8 : t;
    ink = ink === undefined ? C.ink : ink;
    const src = this.d.slice();
    const w = this.w, h = this.h;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : src[y * w + x]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (src[y * w + x] !== -1) continue;
        const n = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].find((c) => c !== -1);
        if (n !== undefined) this.d[y * w + x] = mix(n, ink, t);
      }
    }
    return this;
  }
  // The upper body sinks by one pixel while the feet stay put, for a cheap breathing frame.
  squash(pivot) {
    const g = new Grid(this.w, this.h);
    g.d = this.d.slice();
    for (let y = pivot; y >= 0; y--) {
      for (let x = 0; x < this.w; x++) g.d[y * this.w + x] = y > 0 ? this.d[(y - 1) * this.w + x] : -1;
    }
    return g;
  }
  // A copy at another size, taking the nearest source pixel, so no new colours can appear.
  resized(w, h) {
    const g = new Grid(w, h);
    for (let y = 0; y < h; y++) {
      const sy = Math.floor(((y + 0.5) * this.h) / h);
      for (let x = 0; x < w; x++) g.d[y * w + x] = this.d[sy * this.w + Math.floor(((x + 0.5) * this.w) / w)];
    }
    return g;
  }
  opaque() {
    for (let i = 0; i < this.d.length; i++) if (this.d[i] === -1) return false;
    return true;
  }
  // Writes the grid to a 2D context. Solid scenery takes the fast path where the device allows it.
  paint(ctx, dx, dy) {
    dx = dx || 0;
    dy = dy || 0;
    if (this.opaque() && probeImageData(ctx)) {
      const im = ctx.createImageData(this.w, this.h);
      const px = im.data;
      for (let i = 0, p = 0; i < this.d.length; i++, p += 4) {
        const c = this.d[i];
        px[p] = (c >> 16) & 255;
        px[p + 1] = (c >> 8) & 255;
        px[p + 2] = c & 255;
        px[p + 3] = 255;
      }
      ctx.putImageData(im, dx, dy);
      return;
    }
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const c = this.d[y * this.w + x];
        if (c === -1) {
          x++;
          continue;
        }
        let run = 1;
        while (x + run < this.w && this.d[y * this.w + x + run] === c) run++;
        ctx.fillStyle = css(c);
        ctx.fillRect(dx + x, dy + y, run, 1);
        x += run;
      }
    }
  }
  toCanvas() {
    const cv = wx.createCanvas();
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, this.w, this.h);
    this.paint(ctx, 0, 0);
    return cv;
  }
}

// Deterministic noise so baked art looks the same every launch.
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + (seed || 0) * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise1(x, seed) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, 0, seed) * (1 - u) + hash(i + 1, 0, seed) * u;
}
function fbm1(x, seed, oct) {
  let a = 0.5, s = 0, n = 0, fq = 1;
  for (let i = 0; i < (oct || 3); i++) {
    s += a * noise1(x * fq, seed + i * 17);
    n += a;
    a *= 0.5;
    fq *= 2.1;
  }
  return s / n;
}

// Noise that repeats exactly once across a tile, so parallax layers join up without a seam. t runs 0..1.
function noiseLoop(t, cycles, seed) {
  const x = t * cycles;
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = ((i % cycles) + cycles) % cycles, b = (a + 1) % cycles;
  return hash(a, 0, seed) * (1 - u) + hash(b, 0, seed) * u;
}
function fbmLoop(t, cycles, seed, oct) {
  let a = 0.5, s = 0, n = 0, c = cycles;
  for (let i = 0; i < (oct || 3); i++) {
    s += a * noiseLoop(t, c, seed + i * 17);
    n += a;
    a *= 0.5;
    c *= 2;
  }
  return s / n;
}

module.exports = { Grid, hash, noise1, fbm1, noiseLoop, fbmLoop };
