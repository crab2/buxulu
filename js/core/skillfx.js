// What a skill looks like going off. Each element has its own signature, and each tier adds to it:
//   tier 0 (初学)  a clean hit in the element's own shape
//   tier 1 (小成)  a second beat: a shockwave, a ripple, a crossing cut
//   tier 2 (大成)  the skill reaches out of the sky or the ground: swords, pillars, spikes, vines
//   tier 3 (圆满)  all of that over the whole field, after a cut-in with the hero's portrait
// Everything is whole-pixel rectangles and the odd sprite, so it stays in the art style and costs little.
const ui = require('./ui.js');
const art = require('./art.js');
const { EL_FX } = require('./fx.js');

const TAU = Math.PI * 2;
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
// Whether block i of a shape still shows. Shapes break up as they end instead of fading, which suits the
// pixel art and draws less at the same time.
const shows = (i, k) => (k > 0.82 ? i % 4 === 0 : k > 0.6 ? i % 2 === 0 : true);

class SkillFx {
  constructor(particles, bounds) {
    this.list = [];
    this.parts = particles;
    this.bounds = bounds;
  }
  clear() {
    this.list.length = 0;
  }
  add(dur, draw, o) {
    const e = { t: -((o && o.delay) || 0), dur, draw, under: !!(o && o.under), tick: o && o.tick, land: o && o.land, landAt: (o && o.landAt) || 0 };
    this.list.push(e);
    return e;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      if (e.t < 0) continue;
      const k = clamp01(e.t / e.dur);
      if (e.tick) e.tick(k, dt);
      if (e.land && k >= e.landAt) {
        const f = e.land;
        e.land = null;
        f();
      }
      if (e.t >= e.dur) this.list.splice(i, 1);
    }
  }
  draw(under) {
    for (const e of this.list) {
      if (e.t >= 0 && e.under === under) e.draw(clamp01(e.t / e.dur));
    }
  }

  // ---- Shapes ----
  ring(x, y, r0, r1, c, dur, o) {
    o = o || {};
    const sq = o.squash || 1, s = o.size || 1;
    return this.add(dur, (k) => {
      const r = r0 + (r1 - r0) * easeOut(k);
      const n = Math.max(10, Math.min(40, Math.round(r * 1.3)));
      for (let i = 0; i < n; i++) {
        if (!shows(i, k)) continue;
        const a = (i / n) * TAU;
        ui.rect(x + Math.cos(a) * r, y + Math.sin(a) * r * sq, s, s, c);
      }
    }, o);
  }
  // A blade's path: it sweeps along an arc and is thickest in the middle, then the tail catches up.
  crescent(x, y, r, from, to, cols, dur, o) {
    o = o || {};
    const thick = o.thick || 3;
    const n = Math.max(8, Math.round((Math.abs(to - from) * r) / 2));
    return this.add(dur, (k) => {
      const head = Math.min(1, k / 0.35);
      const tail = k < 0.4 ? 0 : (k - 0.4) / 0.6;
      for (let i = 0; i <= n; i++) {
        const p = i / n;
        if (p > head || p < tail) continue;
        const a = from + (to - from) * p;
        const w = 1 + Math.round(thick * Math.sin(Math.PI * p));
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        // The dark edge keeps the blade readable against a target flashing white from the same hit.
        ui.rect(px - w / 2 - 1, py - w / 2 + 1, w + 1, w, cols[2] || cols[1]);
        ui.rect(px - w / 2, py - w / 2, w, w, cols[1]);
        ui.rect(px - w / 2, py - w / 2, Math.max(1, w - 1), 1, cols[0]);
      }
    }, o);
  }
  // A beam from the sky to the ground: quick to open, slower to close, with a bright core.
  pillar(x, y0, y1, w, cols, dur, o) {
    return this.add(dur, (k) => {
      const open = k < 0.2 ? k / 0.2 : Math.pow(1 - (k - 0.2) / 0.8, 0.6);
      const ww = Math.max(1, Math.round(w * open + Math.sin(k * 40)));
      ui.alpha(0.55);
      ui.rect(x - ww, y0, ww * 2, y1 - y0, cols[2]);
      ui.alpha(0.9);
      ui.rect(x - Math.ceil(ww / 2), y0, Math.ceil(ww / 2) * 2, y1 - y0, cols[1]);
      ui.alpha(1);
      ui.rect(x - Math.ceil(ww / 5), y0, Math.ceil(ww / 5) * 2 || 1, y1 - y0, cols[0]);
    }, o);
  }
  // A tongue of flame: stacked rows that flicker and narrow toward the top.
  flame(x, base, h, w, dur, o) {
    const cols = EL_FX.fire;
    const seed = Math.random() * 10;
    return this.add(dur, (k) => {
      const hh = h * (k < 0.25 ? k / 0.25 : 1 - Math.max(0, k - 0.6) / 0.4);
      const rows = Math.max(1, Math.round(hh / 4));
      for (let i = 0; i < rows; i++) {
        const p = i / rows;
        const ww = Math.max(2, w * (1 - p * 0.85) + Math.sin(seed + k * 34 + i * 1.7) * 2);
        const dx = Math.sin(seed + k * 22 + i) * 2 * p;
        ui.rect(x + dx - ww / 2, base - (i + 1) * 4, ww, 4, p < 0.55 ? cols[1] : cols[2]);
        ui.rect(x + dx - ww / 4, base - (i + 1) * 4, ww / 2, 4, p < 0.45 ? cols[0] : cols[1]);
      }
    }, o);
  }
  // A shard of rock thrown up from the ground, lit down one side.
  spike(x, base, h, w, dur, o) {
    const cols = (o && o.cols) || ['#f2e2b0', '#c98f55', '#6c3f26'];
    return this.add(dur, (k) => {
      const grow = k < 0.2 ? easeOut(k / 0.2) : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      const hh = h * grow;
      const rows = Math.max(1, Math.round(hh / 3));
      for (let i = 0; i < rows; i++) {
        const ww = Math.max(1, w * (1 - i / rows));
        const y = base - (i + 1) * 3;
        ui.rect(x - ww / 2, y, ww, 3, cols[2]);
        ui.rect(x - ww / 2, y, Math.max(1, ww / 2), 3, cols[1]);
        if (i % 2 === 0) ui.rect(x - ww / 2, y, 1, 3, cols[0]);
      }
    }, o);
  }
  // A spirit sword dropping point first and sticking in the ground.
  sword(x, top, base, cols, dur, o) {
    return this.add(dur, (k) => {
      const fall = Math.min(1, k / 0.32);
      const tip = top + (base - top) * fall * fall;
      if (k > 0.8 && Math.floor(k * 40) % 2) return;
      if (fall < 1) ui.rect(x, tip - 34, 1, 18, cols[2]);
      ui.rect(x, tip - 2, 1, 2, cols[0]);
      ui.rect(x - 1, tip - 16, 3, 14, cols[1]);
      ui.rect(x, tip - 16, 1, 14, cols[0]);
      ui.rect(x - 3, tip - 18, 7, 2, cols[2]);
      ui.rect(x - 1, tip - 23, 3, 5, '#6c3f26');
    }, Object.assign({ landAt: 0.32 }, o));
  }
  // A vine rising and curling to a point, with leaves on alternate joints. It pulls back when done.
  vine(x0, y0, x1, y1, dur, o) {
    o = o || {};
    const cols = EL_FX.wood;
    const curl = o.curl === undefined ? 12 : o.curl;
    const n = 12;
    return this.add(dur, (k) => {
      const grow = k < 0.3 ? easeOut(k / 0.3) : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      const upto = Math.round(n * grow);
      for (let i = 0; i <= upto; i++) {
        const p = i / n;
        const px = x0 + (x1 - x0) * p + Math.sin(p * Math.PI * 2 + k * 3) * curl * (1 - p * 0.4);
        const py = y0 + (y1 - y0) * p;
        const s = i < 8 ? 3 : 2;
        ui.rect(px - s / 2, py - s / 2, s, s, cols[1]);
        ui.rect(px - s / 2, py - s / 2, 1, 1, cols[0]);
        if (i % 3 === 1) ui.rect(px + (i % 2 ? 2 : -4), py - 1, 3, 2, cols[0]);
      }
    }, o);
  }
  // A flower opening outward, ring by ring.
  bloom(x, y, r, cols, dur, o) {
    const petals = 8;
    return this.add(dur, (k) => {
      const open = easeOut(Math.min(1, k / 0.45));
      [[1, 0, cols[0]], [0.62, 0.4, cols[1]]].forEach((layer) => {
        const rr = r * layer[0] * open;
        for (let i = 0; i < petals; i++) {
          if (!shows(i, k)) continue;
          const a = (i / petals) * TAU + layer[1] + k * 0.8;
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.75;
          ui.rect(px - 3, py - 2, 6, 4, layer[2]);
          ui.rect(px - 2, py - 3, 4, 6, layer[2]);
        }
      });
      ui.rect(x - 2, y - 2, 5, 5, '#f7dd7a');
    }, o);
  }
  // A surge of water rolling across the whole field: a steep curling front with foam along its top, and a
  // long low swell dragging behind it.
  wave(dur, o) {
    const b = this.bounds;
    const cols = EL_FX.water;
    const length = 120, col = 3;
    const peak = Math.min(b.h * 0.62, 92);
    const base = b.y + b.h;
    const count = Math.round(length / col);
    return this.add(dur, (k) => {
      const front = b.x + b.w + 30 - (b.w + length + 60) * k;
      for (let i = 0; i < count; i++) {
        const p = i / count;
        const shape = p < 0.16 ? Math.sin((p / 0.16) * Math.PI * 0.5) : Math.exp(-(p - 0.16) * 3.2);
        const hh = peak * shape * (0.92 + Math.sin(k * 26 + i * 0.5) * 0.08);
        if (hh < 2) continue;
        const x = Math.round(front + i * col);
        const y = base - hh;
        ui.alpha(0.72);
        ui.rect(x, y, col, hh, cols[2]);
        ui.alpha(0.9);
        ui.rect(x, y, col, Math.min(hh, 6 + hh * 0.22), cols[1]);
        ui.alpha(1);
        ui.rect(x, y, col, 2, cols[0]);
        // Foam breaking off the crest.
        if (p < 0.34 && (i + Math.floor(k * 30)) % 3 === 0) ui.rect(x, y - 2 - (i % 4), 2, 2, '#ffffff');
      }
    }, o);
  }
  // A great rock dropping from the sky. It lands with whatever `land` does.
  boulder(x, top, base, r, dur, o) {
    const cols = ['#f2e2b0', '#c98f55', '#6c3f26'];
    return this.add(dur, (k) => {
      const fall = Math.min(1, k / 0.55);
      if (k >= 0.55 && Math.floor(k * 40) % 2) return;
      const y = top + (base - r - top) * fall * fall;
      if (fall < 1) {
        ui.rect(x - r * 0.5, y - r - 16, 2, 14, cols[0]);
        ui.rect(x + r * 0.4, y - r - 22, 2, 18, cols[0]);
      }
      ui.rect(x - r, y - r * 0.6, r * 2, r * 1.2, cols[2]);
      ui.rect(x - r * 0.6, y - r, r * 1.2, r * 2, cols[2]);
      ui.rect(x - r * 0.85, y - r * 0.55, r * 1.2, r * 1.0, cols[1]);
      ui.rect(x - r * 0.55, y - r * 0.9, r * 0.9, r * 1.3, cols[1]);
      ui.rect(x - r * 0.45, y - r * 0.75, r * 0.5, 2, cols[0]);
      ui.rect(x - r * 0.75, y - r * 0.35, 2, r * 0.45, cols[0]);
    }, Object.assign({ landAt: 0.55 }, o));
  }
  // Rays bursting out of a point, each a short run of blocks moving outward.
  rays(x, y, n, len, c, dur, o) {
    return this.add(dur, (k) => {
      const d = len * easeOut(k);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.2;
        for (let j = 0; j < 3; j++) {
          if (!shows(j, k)) continue;
          const r = d - j * 5;
          if (r > 0) ui.rect(x + Math.cos(a) * r, y + Math.sin(a) * r, 2, 2, c);
        }
      }
    }, o);
  }
  // A long thin glint in a cross, the highlight on anything sharp.
  glint(x, y, len, c, dur, o) {
    return this.add(dur, (k) => {
      const l = Math.round(len * (1 - k));
      ui.rect(x - l, y, l * 2 + 1, 1, c);
      ui.rect(x, y - l, 1, l * 2 + 1, c);
    }, o);
  }
  // A jagged split running along the ground.
  crack(x, y, len, dir, dur, o) {
    const steps = [];
    let py = 0;
    for (let i = 0; i < Math.round(len / 4); i++) {
      py += (Math.random() - 0.5) * 3;
      steps.push(py);
    }
    return this.add(dur, (k) => {
      const upto = Math.round(steps.length * Math.min(1, k / 0.25));
      for (let i = 0; i < upto; i++) {
        if (!shows(i, k)) continue;
        ui.rect(x + dir * i * 4, y + steps[i], 4, 1, '#241a10');
        if (i % 3 === 0) ui.rect(x + dir * i * 4, y + steps[i] + 1, 2, 1, '#f7dd7a');
      }
    }, o);
  }
  // A glowing circle on the ground around the caster, its two rings turning opposite ways.
  sigil(x, y, r, c, c2, dur, o) {
    return this.add(dur, (k) => {
      const grow = easeOut(Math.min(1, k / 0.25));
      const out = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
      const rr = r * grow * out;
      if (rr < 2) return;
      const n = Math.max(10, Math.round(rr * 1.1));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + k * 2.4;
        if (i % 4 !== 3) ui.rect(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.38, 2, 1, c);
      }
      const inner = rr * 0.66;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU - k * 3.4;
        ui.rect(x + Math.cos(a) * inner - 1, y + Math.sin(a) * inner * 0.38, 3, 1, c2);
      }
    }, Object.assign({ under: true }, o));
  }
  // Qi rising off someone: short streaks that climb from the feet and thin out, behind the figure.
  aura(x, feet, spread, h, cols, dur, o) {
    const n = 12;
    const seeds = [];
    for (let i = 0; i < n; i++) seeds.push({ dx: (i / (n - 1) - 0.5) * spread * 2, at: Math.random(), len: 5 + Math.random() * 9, v: 0.9 + Math.random() * 0.8, c: cols[i % 3 === 0 ? 0 : 1] });
    return this.add(dur, (k) => {
      const swell = Math.min(1, k / 0.2) * Math.min(1, (1 - k) / 0.2);
      for (const s of seeds) {
        const p = (s.at + k * s.v * 2.2) % 1;
        const width = 1 - Math.abs(s.dx) / (spread * 1.05);
        const y = feet - 2 - p * h * (0.4 + width * 0.6);
        const len = s.len * (1 - p) * swell;
        if (len >= 1) ui.rect(x + s.dx * (1 - p * 0.4), y - len, 1 + (s.len > 10 ? 1 : 0), len, s.c);
      }
    }, Object.assign({ under: true }, o));
  }
  // A dome of stone and light closing over someone.
  dome(x, base, r, cols, dur, o) {
    return this.add(dur, (k) => {
      const open = easeOut(Math.min(1, k / 0.3));
      const rr = r * open;
      const n = Math.max(8, Math.round(rr * 1.4));
      for (let i = 0; i <= n; i++) {
        if (!shows(i, k)) continue;
        const a = Math.PI + (i / n) * Math.PI;
        const s = i % 3 === 0 ? 3 : 2;
        ui.rect(x + Math.cos(a) * rr - s / 2, base + Math.sin(a) * rr * 1.1 - s / 2, s, s, i % 2 ? cols[0] : cols[1]);
      }
      ui.rect(x - rr, base, rr * 2, 1, cols[1]);
    }, o);
  }
  // A colour washing over the whole field for an instant.
  flash(c, peak, dur, o) {
    const b = this.bounds;
    return this.add(dur, (k) => {
      ui.alpha(peak * (1 - k));
      ui.rect(b.x, b.y, b.w, b.h, c);
      ui.alpha(1);
    }, o);
  }
  // A travelling shot: a bright head with sparks shed behind it. Returns how long it takes to arrive.
  bolt(from, to, kind, dur, size) {
    const cols = EL_FX[kind] || EL_FX.none;
    let x = from.x, y = from.y;
    this.add(dur, (k) => {
      ui.rect(x - size, y - size, size * 2 + 1, size * 2 + 1, cols[1]);
      ui.rect(x - size + 1, y - size + 1, size * 2 - 1, size * 2 - 1, cols[0]);
    }, {
      tick: (k) => {
        const e = k * k * (3 - 2 * k);
        x = from.x + (to.x - from.x) * e;
        y = from.y + (to.y - from.y) * e - Math.sin(k * Math.PI) * 10;
        if (this.parts) {
          this.parts.add({ x: x + (Math.random() - 0.5) * size * 2, y: y + (Math.random() - 0.5) * size * 2, vx: 0, vy: 0, g: 0, life: 0.16 + size * 0.03, max: 0.3, c: cols[1 + Math.floor(Math.random() * 2)], s: size > 1 ? 2 : 1 });
        }
      },
    });
    return dur;
  }

  // ---- Signatures ----
  // Plays one skill landing on one target. Returns when it reaches them and how long to hold afterwards.
  impact(kind, tier, from, to, ground, el) {
    const fn = this[kind + 'Hit'] || this.starHit;
    return fn.call(this, tier, from, to, ground, el);
  }
  slashHit(tier, from, to, ground, el) {
    const cols = EL_FX[el] || EL_FX.metal;
    const blade = [cols[0], cols[1], cols[2]];
    const p = this.parts;
    this.crescent(to.x, to.y, 23 + tier * 2, -2.6, 0.6, blade, 0.26, { thick: 4 + tier });
    if (p) p.burst(to.x, to.y, el || 'metal', 6 + tier * 5, 60 + tier * 16);
    if (tier >= 1) {
      this.crescent(to.x, to.y, 23 + tier * 2, 2.6, -0.6, blade, 0.26, { thick: 4 + tier, delay: 0.05 });
      this.ring(to.x, to.y, 4, 20 + tier * 4, cols[0], 0.26, { delay: 0.04 });
    }
    if (tier >= 2) {
      this.glint(to.x, to.y, 26, '#ffffff', 0.2);
      const spots = tier >= 3 ? [-24, -12, 0, 12, 24] : [-14, 0, 14];
      spots.forEach((dx, i) => {
        this.sword(to.x + dx, this.bounds.y - 10, ground - (i % 2) * 4, ['#ffffff', '#d7e6ee', '#7cb8d8'], 0.5, {
          delay: i * 0.04,
          land: () => { if (p) p.burst(to.x + dx, ground, 'metal', 5, 40); },
        });
      });
    }
    if (tier >= 3) {
      this.ring(to.x, to.y, 8, 48, '#ffffff', 0.34, { size: 2, delay: 0.06 });
      this.pillar(to.x, this.bounds.y, this.bounds.y + this.bounds.h, 7, ['#ffffff', '#d7e6ee', '#7cb8d8'], 0.28, { delay: 0.05 });
    }
    return { travel: 0, hold: 0.2 + tier * 0.06 };
  }
  fireHit(tier, from, to, ground) {
    const cols = EL_FX.fire;
    const p = this.parts;
    const travel = this.bolt(from, to, 'fire', 0.14 + tier * 0.015, 1 + Math.min(tier, 2));
    const opts = { delay: travel };
    this.add(0.01, () => {}, Object.assign({}, opts, { land: () => { if (p) p.burst(to.x, to.y, 'fire', 10 + tier * 6, 70 + tier * 15); } }));
    this.ring(to.x, to.y, 3, 14 + tier * 6, cols[0], 0.24, opts);
    if (tier >= 1) {
      this.ring(to.x, ground, 6, 22 + tier * 8, cols[1], 0.32, { delay: travel, squash: 0.38, size: 2 });
      this.flame(to.x, ground + 2, 22 + tier * 8, 12, 0.34, opts);
    }
    if (tier >= 2) {
      this.flame(to.x - 13, ground + 3, 30, 9, 0.4, { delay: travel + 0.03 });
      this.flame(to.x + 13, ground + 3, 30, 9, 0.4, { delay: travel + 0.06 });
      this.pillar(to.x, this.bounds.y, ground + 2, 8, cols, 0.32, opts);
    }
    if (tier >= 3) {
      [-28, 28].forEach((dx, i) => this.flame(to.x + dx, ground + 4, 46, 13, 0.46, { delay: travel + 0.08 + i * 0.04 }));
      this.flash(cols[1], 0.4, 0.2, opts);
    }
    return { travel, hold: 0.18 + tier * 0.07 };
  }
  waterHit(tier, from, to, ground) {
    const cols = EL_FX.water;
    const p = this.parts;
    const travel = this.bolt(from, to, 'water', 0.15, 1 + Math.min(tier, 2));
    const opts = { delay: travel };
    this.add(0.01, () => {}, Object.assign({}, opts, { land: () => { if (p) p.burst(to.x, to.y, 'water', 10 + tier * 6, 60 + tier * 16); } }));
    this.ring(to.x, to.y, 3, 13 + tier * 5, cols[0], 0.24, opts);
    if (tier >= 1) {
      this.ring(to.x, ground, 5, 22 + tier * 6, cols[1], 0.36, { delay: travel, squash: 0.36 });
      this.ring(to.x, ground, 3, 15 + tier * 6, cols[0], 0.36, { delay: travel + 0.08, squash: 0.36 });
    }
    if (tier >= 2) {
      this.pillar(to.x, ground - 54 - tier * 10, ground + 2, 8 + tier, cols, 0.36, opts);
      this.add(0.01, () => {}, Object.assign({}, opts, { land: () => { if (p) p.rain(to.x - 18, to.x + 18, to.y - 34, 'water', 12, 90, 12); } }));
    }
    if (tier >= 3) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        this.spike(to.x + Math.cos(a) * 20, ground + Math.sin(a) * 5, 26, 8, 0.46, { delay: travel + i * 0.03, cols: ['#ffffff', '#bfe6f2', '#6fb0e0'] });
      }
      this.flash(cols[0], 0.32, 0.18, opts);
    }
    return { travel, hold: 0.18 + tier * 0.07 };
  }
  woodHit(tier, from, to, ground) {
    const cols = EL_FX.wood;
    const p = this.parts;
    this.vine(to.x - 8, ground, to.x + 3, to.y - 8, 0.34 + tier * 0.03, {});
    if (p) p.burst(to.x, to.y, 'wood', 7 + tier * 5, 50 + tier * 14);
    if (tier >= 1) {
      this.vine(to.x + 12, ground + 1, to.x - 4, to.y - 14, 0.36, { curl: -12, delay: 0.04 });
      this.ring(to.x, ground, 4, 18 + tier * 6, cols[0], 0.28, { squash: 0.38 });
    }
    if (tier >= 2) {
      this.vine(to.x - 22, ground + 2, to.x - 6, to.y - 18, 0.4, { curl: 8, delay: 0.07 });
      this.vine(to.x + 24, ground + 2, to.x + 6, to.y - 20, 0.4, { curl: -8, delay: 0.1 });
      this.bloom(to.x, to.y, 12, ['#f7c4c8', '#e88aa0'], 0.36, { delay: 0.05 });
    }
    if (tier >= 3) {
      this.bloom(to.x, to.y, 28, ['#f7c4c8', '#e88aa0'], 0.54, { delay: 0.08 });
      if (p) p.rain(to.x - 36, to.x + 36, to.y - 30, 'wood', 16, 60, 18);
      this.flash(cols[0], 0.26, 0.16);
    }
    return { travel: 0.06, hold: 0.18 + tier * 0.07 };
  }
  earthHit(tier, from, to, ground) {
    const p = this.parts;
    if (p) p.burst(to.x, ground - 4, 'earth', 8 + tier * 6, 60 + tier * 16);
    this.spike(to.x, ground + 2, 18 + tier * 5, 10, 0.3 + tier * 0.04, {});
    this.crack(to.x, ground + 1, 18 + tier * 8, -1, 0.34);
    if (tier >= 1) {
      this.spike(to.x - 13, ground + 3, 14 + tier * 4, 8, 0.3, { delay: 0.04 });
      this.spike(to.x + 13, ground + 3, 14 + tier * 4, 8, 0.3, { delay: 0.07 });
      this.crack(to.x, ground + 2, 16 + tier * 8, 1, 0.34);
    }
    if (tier >= 2) {
      this.ring(to.x, ground, 8, 34 + tier * 5, '#c98f55', 0.3, { squash: 0.38, size: 2 });
      this.spike(to.x - 26, ground + 4, 22, 9, 0.34, { delay: 0.1 });
      this.spike(to.x + 26, ground + 4, 22, 9, 0.34, { delay: 0.12 });
    }
    if (tier >= 3) {
      this.ring(to.x, ground, 10, 56, '#f7dd7a', 0.36, { squash: 0.38, size: 2, delay: 0.06 });
      this.spike(to.x, ground + 3, 46, 16, 0.42, { delay: 0.05 });
      this.flash('#6c3f26', 0.34, 0.18);
    }
    return { travel: 0.04, hold: 0.2 + tier * 0.08 };
  }
  healHit(tier, from, to, ground) {
    const cols = EL_FX.heal;
    const p = this.parts;
    this.ring(to.x, ground, 4, 15 + tier * 4, cols[1], 0.36, { squash: 0.38 });
    if (p) p.rise(to.x, to.y, 'heal', 12 + tier * 6);
    if (tier >= 1) {
      [[-12, 0], [12, -10], [0, -20]].forEach((o, i) => this.plus(to.x + o[0], to.y + o[1], cols[1], 0.5, { delay: i * 0.05 }));
    }
    if (tier >= 2) {
      this.pillar(to.x, this.bounds.y, ground + 2, 8 + tier, ['#ffffff', '#c8f0d4', '#7fd1a4'], 0.46);
      this.bloom(to.x, ground - 2, 11, ['#ffffff', '#7fd1a4'], 0.5);
    }
    if (tier >= 3) {
      this.bloom(to.x, ground - 2, 22, ['#f7dd7a', '#ffffff'], 0.6, { delay: 0.04 });
      if (p) p.rain(to.x - 24, to.x + 24, to.y - 34, 'heal', 12, 50, 16);
    }
    return { travel: 0, hold: 0.14 + tier * 0.06 };
  }
  // Protection closing over one ally.
  shieldHit(tier, from, to, ground) {
    const cols = ['#f7dd7a', '#c98f55', '#6c3f26'];
    const p = this.parts;
    this.dome(to.x, ground, 18 + tier * 3, cols, 0.48 + tier * 0.06);
    if (p) p.rise(to.x, to.y, 'earth', 8 + tier * 3);
    if (tier >= 1) {
      this.ring(to.x, ground, 6, 22 + tier * 4, cols[0], 0.34, { squash: 0.38 });
      [-20, 20].forEach((dx, i) => this.spike(to.x + dx, ground + 2, 18, 9, 0.44, { delay: i * 0.05 }));
    }
    if (tier >= 2) {
      this.dome(to.x, ground, 28 + tier * 3, ['#ffffff', '#f7dd7a'], 0.52, { delay: 0.06 });
      this.pillar(to.x, this.bounds.y, ground + 2, 6, ['#ffffff', '#f7dd7a', '#c98f55'], 0.36);
    }
    return { travel: 0, hold: 0.16 + tier * 0.05 };
  }
  starHit(tier, from, to, ground) {
    const p = this.parts;
    if (p) p.burst(to.x, to.y, 'star', 14 + tier * 8, 90 + tier * 15);
    this.glint(to.x, to.y, 16 + tier * 8, '#ffffff', 0.22);
    if (tier >= 1) this.ring(to.x, to.y, 4, 20 + tier * 8, '#a884c9', 0.3);
    if (tier >= 2) this.pillar(to.x, this.bounds.y, ground + 2, 8, ['#ffffff', '#f7dd7a', '#a884c9'], 0.34);
    return { travel: 0, hold: 0.2 + tier * 0.06 };
  }
  plus(x, y, c, dur, o) {
    return this.add(dur, (k) => {
      const yy = y - k * 20;
      if (k > 0.8 && Math.floor(k * 30) % 2) return;
      ui.rect(x - 3, yy - 1, 7, 3, c);
      ui.rect(x - 1, yy - 3, 3, 7, c);
    }, o);
  }

  // ---- Casting ----
  // The hero gathering power, before anything is thrown. Grows with the tier.
  gather(tier, at, feet, kind) {
    const cols = EL_FX[kind] || EL_FX.none;
    const p = this.parts;
    const life = [0.14, 0.26, 0.4, 0.62][tier];
    if (p) p.gather(at.x, at.y, kind, [8, 14, 22, 32][tier], [20, 26, 34, 46][tier], life);
    if (tier >= 1) this.sigil(feet.x, feet.y, 16 + tier * 7, cols[1], cols[0], life + 0.28);
    if (tier >= 2) {
      this.sigil(feet.x, feet.y, 12 + tier * 4, cols[0], cols[2], life + 0.2, { delay: 0.05 });
      this.aura(feet.x, feet.y, 16 + tier * 4, 40 + tier * 12, cols, life + 0.26);
    }
    if (tier >= 3) this.ring(feet.x, feet.y, 8, 54, cols[0], life, { squash: 0.38, size: 2 });
    return life;
  }
  // A band across the field with the hero's portrait and the skill's name, for a skill at its peak.
  cutin(o) {
    const b = this.bounds;
    const dur = o.dur;
    const bh = Math.min(50, Math.max(40, Math.round(b.h * 0.26)));
    const by = b.y + Math.round((b.h - bh) * 0.4);
    const lines = [];
    for (let i = 0; i < 10; i++) lines.push({ y: by + 2 + Math.random() * (bh - 4), x: Math.random() * b.w, w: 18 + Math.random() * 40, v: 420 + Math.random() * 380, c: o.cols[i % 2] });
    const label = art.bigLabel(o.name, o.cols[0], 2);
    const tierLabel = art.bigLabel(o.tierName, o.cols[0], 1);
    const portrait = art.portrait(o.hero);
    const nameX = b.x + Math.round(b.w * 0.08);
    const portraitX = b.x + b.w - portrait.w - Math.round(b.w * 0.04);
    return this.add(dur, (k) => {
      const t = k * dur;
      // Black bars close in from above and below.
      const bar = Math.round(Math.min(1, k / 0.12) * Math.min(1, (1 - k) / 0.1) * 14);
      if (bar > 0) {
        ui.rect(b.x, b.y, b.w, bar, '#07061a');
        ui.rect(b.x, b.y + b.h - bar, b.w, bar, '#07061a');
        ui.rect(b.x, b.y + bar, b.w, 1, o.cols[0]);
        ui.rect(b.x, b.y + b.h - bar - 1, b.w, 1, o.cols[0]);
      }
      // The band slams in from the right and leaves to the left.
      const enter = easeOut(Math.min(1, k / 0.14));
      const leave = k > 0.86 ? (k - 0.86) / 0.14 : 0;
      const dx = Math.round((1 - enter) * b.w - leave * leave * b.w);
      ui.rect(b.x + dx, by, b.w, bh, o.dark);
      lines.forEach((l) => {
        const lx = b.x + (((l.x - t * l.v) % (b.w + l.w)) + b.w + l.w) % (b.w + l.w) - l.w + dx;
        ui.rect(lx, l.y, l.w, 1, l.c);
      });
      ui.rect(b.x + dx, by, b.w, 2, o.cols[0]);
      ui.rect(b.x + dx, by + bh - 2, b.w, 2, o.cols[0]);
      ui.img(portrait, portraitX + dx, by + bh - portrait.h - 2 + Math.min(0, Math.round(Math.sin(k * 30) * 1)));
      ui.img(label, nameX + dx, by + Math.round((bh - label.h) / 2) + 4);
      ui.img(tierLabel, nameX + dx + 1, by + 4);
      // A white hit on the frame when the band lands.
      if (k < 0.24) {
        ui.alpha((0.24 - k) / 0.24 * 0.75);
        ui.rect(b.x + dx, by, b.w, bh, '#ffffff');
        ui.alpha(1);
      }
    });
  }
  // The field-wide flourish a skill at its peak plays once per cast, on top of each target's own hit.
  finale(kind, targets) {
    const b = this.bounds;
    const p = this.parts;
    const first = targets[0];
    if (kind === 'slash') {
      this.flash('#ffffff', 0.5, 0.16);
      targets.forEach((t, i) => this.crescent(t.x, t.y, 34, -2.7, 0.7, ['#ffffff', '#d7e6ee', '#7cb8d8'], 0.3, { thick: 6, delay: i * 0.03 }));
      this.add(0.26, (k) => {
        const y = b.y + b.h * 0.55;
        ui.rect(b.x, y - 1, b.w * Math.min(1, k * 4), 2, '#ffffff');
      });
    } else if (kind === 'fire') {
      this.flash('#ec7a4e', 0.36, 0.3);
      if (p) p.rain(b.x, b.x + b.w, b.y, 'fire', 40, 150, 40);
    } else if (kind === 'water') {
      this.wave(0.62);
    } else if (kind === 'wood') {
      if (p) p.rain(b.x, b.x + b.w, b.y, 'wood', 36, 110, 40);
      targets.forEach((t) => this.bloom(t.x, t.y, 34, ['#f7c4c8', '#e88aa0'], 0.62));
    } else if (kind === 'earth') {
      if (first) {
        const ground = first.y + 26;
        this.boulder(first.x, b.y - 30, ground, 18, 0.5, {
          land: () => {
            this.flash('#f7dd7a', 0.42, 0.2);
            this.ring(first.x, ground, 10, 70, '#f2e2b0', 0.42, { squash: 0.38, size: 2 });
            this.crack(first.x, ground + 1, Math.min(130, first.x - b.x), -1, 0.7);
            this.crack(first.x, ground + 3, Math.min(130, b.x + b.w - first.x), 1, 0.7);
            if (p) p.burst(first.x, ground - 4, 'earth', 34, 150);
            if (this.onHeavy) this.onHeavy(14);
          },
        });
      }
    } else if (kind === 'heal') {
      if (p) p.rain(b.x, b.x + b.w, b.y, 'heal', 34, 80, 40);
      this.flash('#f7dd7a', 0.22, 0.34);
    }
  }
}

module.exports = { SkillFx };
