// Square particles for skills and regional weather. Everything is drawn in whole pixels.
const ui = require('./ui.js');
const { W, H } = require('./display.js');

const EL_FX = {
  metal: ['#ffffff', '#d7e6ee', '#7cb8d8'],
  wood: ['#7fd1a4', '#3f9e7e', '#f7c4c8'],
  water: ['#bfe6f2', '#6fb0e0', '#2f6db5'],
  fire: ['#f7dd7a', '#ec7a4e', '#c8402f'],
  earth: ['#f7dd7a', '#c98f55', '#6c3f26'],
  star: ['#ffffff', '#f7dd7a', '#a884c9'],
  heal: ['#ffffff', '#7fd1a4', '#f7dd7a'],
  none: ['#ffffff', '#d9c9a3', '#a79fb8'],
};

class Particles {
  constructor(max) {
    this.list = [];
    this.max = max || 300;
  }
  add(p) {
    this.list.push(p);
    if (this.list.length > this.max) this.list.shift();
  }
  burst(x, y, kind, n, speed) {
    const cols = EL_FX[kind] || EL_FX.none;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random()) * (speed || 60);
      this.add({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 15, g: 90, life: 0.3 + Math.random() * 0.4, max: 0.7,
        c: cols[Math.floor(Math.random() * cols.length)], s: Math.random() > 0.6 ? 2 : 1,
      });
    }
  }
  rise(x, y, kind, n) {
    const cols = EL_FX[kind] || EL_FX.none;
    for (let i = 0; i < n; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 26, y: y + (Math.random() - 0.5) * 18, vx: (Math.random() - 0.5) * 6, vy: -18 - Math.random() * 24, g: 0,
        life: 0.5 + Math.random() * 0.5, max: 1, c: cols[Math.floor(Math.random() * cols.length)], s: Math.random() > 0.7 ? 2 : 1,
      });
    }
  }
  slash(x, y, kind) {
    const cols = EL_FX[kind] || EL_FX.metal;
    for (let i = -12; i <= 12; i++) {
      this.add({ x: x + i, y: y - i, vx: 0, vy: 0, g: 0, life: 0.13 + (12 - Math.abs(i)) * 0.006, max: 0.3, c: cols[Math.abs(i) < 5 ? 0 : 1], s: Math.abs(i) < 7 ? 2 : 1 });
    }
  }
  // Motes drawn in from all around to one point, the moment before a skill goes off.
  gather(x, y, kind, n, radius, life) {
    const cols = EL_FX[kind] || EL_FX.none;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.6 + Math.random() * 0.4);
      const t = life * (0.7 + Math.random() * 0.3);
      this.add({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.8, vx: (-Math.cos(a) * r) / t, vy: (-Math.sin(a) * r * 0.8) / t, g: 0, life: t, max: t, c: cols[i % cols.length], s: i % 4 === 0 ? 2 : 1 });
    }
  }
  // Falling from above across a span: embers, petals, golden light.
  rain(x0, x1, y, kind, n, speed, spread) {
    const cols = EL_FX[kind] || EL_FX.none;
    for (let i = 0; i < n; i++) {
      const v = speed * (0.7 + Math.random() * 0.6);
      this.add({ x: x0 + Math.random() * (x1 - x0), y: y - Math.random() * spread, vx: -6 - Math.random() * 10, vy: v, g: 0, wob: 6, life: 0.5 + Math.random() * 0.5, max: 1, c: cols[i % cols.length], s: i % 3 === 0 ? 2 : 1 });
    }
  }
  beam(x0, y0, x1, y1, kind, n) {
    const cols = EL_FX[kind] || EL_FX.none;
    for (let i = 0; i < n; i++) {
      const s = i / n;
      this.add({ x: x0 + (x1 - x0) * s, y: y0 + (y1 - y0) * s, vx: 0, vy: 0, g: 0, life: 0.05 + s * 0.2, max: 0.25, c: cols[i % cols.length], s: 2 });
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      p.vy += (p.g || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.wob) p.x += Math.sin(p.life * p.wob) * 0.35;
    }
  }
  draw(ox, oy) {
    ox = ox || 0;
    oy = oy || 0;
    for (const p of this.list) {
      ui.rect(p.x + ox, p.y + oy, p.s, p.s, p.c);
    }
  }
}

// Weather that makes each region recognisable: petals, embers, dust, leaves, snow, starlight.
const AMBIENT = {
  spring: { rate: 6, make: () => ({ x: Math.random() * (W + 40), y: -4, vx: -14 - Math.random() * 10, vy: 12 + Math.random() * 10, wob: 4, life: 14, c: Math.random() > 0.4 ? '#f7c4c8' : '#e88aa0', s: Math.random() > 0.7 ? 2 : 1 }) },
  summer: { rate: 10, make: () => ({ x: Math.random() * W, y: H + 2, vx: (Math.random() - 0.5) * 8, vy: -22 - Math.random() * 30, wob: 6, life: 6 + Math.random() * 7, c: Math.random() > 0.5 ? '#ec7a4e' : '#f7dd7a', s: 1 }) },
  loess: { rate: 9, make: () => ({ x: W + 2, y: Math.random() * H, vx: -40 - Math.random() * 30, vy: Math.random() * 4 - 2, wob: 2, life: 9, c: Math.random() > 0.5 ? '#e6c88a' : '#c98f55', s: 1 }) },
  autumn: { rate: 5, make: () => ({ x: Math.random() * (W + 40), y: -4, vx: -18 - Math.random() * 12, vy: 16 + Math.random() * 12, wob: 7, life: 14, c: ['#e8b33a', '#c8402f', '#ec7a4e'][Math.floor(Math.random() * 3)], s: 2 }) },
  winter: { rate: 16, make: () => ({ x: Math.random() * (W + 30), y: -3, vx: -6 - Math.random() * 10, vy: 16 + Math.random() * 22, wob: 3, life: 20, c: '#ffffff', s: Math.random() > 0.75 ? 2 : 1 }) },
  void: { rate: 4, make: () => ({ x: Math.random() * W, y: H * Math.random(), vx: 0, vy: -3 - Math.random() * 5, wob: 2, life: 4 + Math.random() * 4, c: Math.random() > 0.5 ? '#f7dd7a' : '#a884c9', s: 1 }) },
};

class Weather {
  constructor(theme) {
    this.cfg = AMBIENT[theme];
    this.acc = 0;
    this.list = [];
    if (this.cfg) {
      // Fill the sky straight away, so weather doesn't appear to start when the scene opens.
      for (let i = 0; i < this.cfg.rate * 3; i++) {
        const p = this.cfg.make();
        p.y = Math.random() * H;
        if (p.vx < -30) p.x = Math.random() * W;
        this.list.push(p);
      }
    }
  }
  update(dt) {
    if (!this.cfg) return;
    this.acc += dt * this.cfg.rate;
    while (this.acc > 1 && this.list.length < 120) {
      this.acc -= 1;
      this.list.push(this.cfg.make());
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.x += p.vx * dt + (p.wob ? Math.sin(p.life * p.wob) * 0.3 : 0);
      p.y += p.vy * dt;
      if (p.life <= 0 || p.y > H + 4 || p.y < -6 || p.x < -6) this.list.splice(i, 1);
    }
  }
  draw(maxY) {
    for (const p of this.list) {
      if (maxY === undefined || p.y < maxY) ui.rect(p.x, p.y, p.s, p.s, p.c);
    }
  }
}

module.exports = { Particles, Weather, EL_FX };
