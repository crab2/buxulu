// Scene stack, frame loop, touch input, screen transitions and coroutine-style scripts.
const D = require('./display.js');
const ui = require('./ui.js');
const audio = require('./audio.js');

// Runs generator functions: yield a number to wait seconds, or a function to wait until it is true.
class Runner {
  constructor() {
    this.tasks = [];
  }
  run(gen) {
    const task = { it: gen, wait: 0, until: null, done: false };
    this.tasks.push(task);
    return task;
  }
  update(dt) {
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const t = this.tasks[i];
      let guard = 0;
      while (!t.done && guard++ < 64) {
        if (t.wait > 0) {
          t.wait -= dt;
          break;
        }
        if (t.until) {
          if (!t.until()) break;
          t.until = null;
        }
        const r = t.it.next();
        if (r.done) {
          t.done = true;
          break;
        }
        const v = r.value;
        if (typeof v === 'number') t.wait = v;
        else if (typeof v === 'function') t.until = v;
        else if (v && v.it) t.until = () => v.done;
      }
      if (t.done) this.tasks.splice(i, 1);
    }
  }
}

const game = {
  scenes: {},
  stack: [],
  t: 0,
  timeScale: 1, // Automated tests raise this to fast-forward animations.
  transition: null,
  errors: [],
  onTick: null, // Runs every frame whatever is on screen. The idle march hangs off this.
  lastTouch: 0,

  register(name, cls) {
    this.scenes[name] = cls;
  },
  top() {
    return this.stack[this.stack.length - 1];
  },
  // Replaces the whole stack, with a blind-wipe transition.
  go(name, params, instant) {
    const swap = () => {
      this.stack.forEach((s) => s.leave && s.leave());
      const sc = new this.scenes[name](params || {});
      this.stack = [sc];
      if (sc.enter) sc.enter();
    };
    if (instant) return swap();
    this.transition = { t: 0, dur: 0.22, phase: 'out', swap };
    audio.sfx(null);
  },
  push(name, params) {
    const sc = new this.scenes[name](params || {});
    this.stack.push(sc);
    if (sc.enter) sc.enter();
    return sc;
  },
  pop(sc) {
    const i = sc ? this.stack.indexOf(sc) : this.stack.length - 1;
    if (i < 0) return;
    const [gone] = this.stack.splice(i, 1);
    if (gone.leave) gone.leave();
    const t = this.top();
    if (t && t.resume) t.resume();
  },
};

// ---- Input ----
const touch = { id: null, x: 0, y: 0, sx: 0, sy: 0, moved: false, target: null, lastY: 0, lastX: 0, lastT: 0, vx: 0, vy: 0 };
const DRAG_START = 6;

function point(t) {
  return { x: D.touchX(t.clientX), y: D.touchY(t.clientY) };
}
function hitAt(x, y) {
  const hits = ui.state.hits;
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (x >= h.x && y >= h.y && x < h.x + h.w && y < h.y + h.h) return h;
  }
  return null;
}

wx.onTouchStart((e) => {
  game.lastTouch = Date.now();
  if (touch.id !== null || game.transition) return;
  const t = e.changedTouches[0];
  const p = point(t);
  touch.id = t.identifier;
  Object.assign(touch, { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, lastX: p.x, lastY: p.y, lastT: Date.now(), vx: 0, vy: 0 });
  touch.target = hitAt(p.x, p.y);
  ui.state.pressId = touch.target ? touch.target.id : null;
  const sc = game.top();
  if (sc && sc.onPress) sc.onPress(p.x, p.y);
});

wx.onTouchMove((e) => {
  if (touch.id === null) return;
  const t = Array.from(e.changedTouches).find((c) => c.identifier === touch.id);
  if (!t) return;
  const p = point(t);
  const now = Date.now();
  if (!touch.moved && Math.hypot(p.x - touch.sx, p.y - touch.sy) > DRAG_START) {
    touch.moved = true;
    ui.state.pressId = null;
  }
  if (touch.moved) {
    const sc = game.top();
    if (sc && sc.onDrag) sc.onDrag(p.x - touch.lastX, p.y - touch.lastY);
    const dt = Math.max(1, now - touch.lastT) / 1000;
    touch.vx = (p.x - touch.lastX) / dt;
    touch.vy = (p.y - touch.lastY) / dt;
  }
  touch.lastX = p.x;
  touch.lastY = p.y;
  touch.lastT = now;
});

function release(e, cancelled) {
  const t = e.changedTouches && Array.from(e.changedTouches).find((c) => c.identifier === touch.id);
  if (touch.id === null || (!t && !cancelled)) return;
  const sc = game.top();
  const wasDrag = touch.moved;
  const target = touch.target;
  const p = t ? point(t) : { x: touch.x, y: touch.y };
  touch.id = null;
  ui.state.pressId = null;
  if (cancelled) return;
  if (wasDrag) {
    if (sc && sc.onRelease) sc.onRelease(touch.vx, touch.vy);
    return;
  }
  // Fires inside the touchend callback: wx.openSetting and share calls require a real user gesture.
  if (target && target.onTap) {
    const again = hitAt(p.x, p.y);
    if (again && again.id === target.id) {
      if (target.sound) audio.sfx(target.sound);
      target.onTap();
      return;
    }
  }
  if (!target && sc && sc.onTapAnywhere) sc.onTapAnywhere(p.x, p.y);
}
wx.onTouchEnd((e) => release(e, false));
wx.onTouchCancel((e) => release(e, true));

// ---- Frame loop ----
let last = Date.now();

function drawTransition() {
  const tr = game.transition;
  if (!tr) return;
  const p = Math.min(1, tr.t / tr.dur);
  const a = tr.phase === 'out' ? p : 1 - p;
  const stripes = 12;
  const sh = Math.ceil(D.H / stripes);
  for (let i = 0; i < stripes; i++) {
    ui.rect(0, i * sh, D.W, Math.ceil(sh * a), '#0b0a14');
  }
}

function frame() {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000) * game.timeScale;
  last = now;
  game.t += dt;
  ui.state.t = game.t;
  try {
    const tr = game.transition;
    if (tr) {
      tr.t += dt;
      if (tr.t >= tr.dur) {
        if (tr.phase === 'out') {
          tr.swap();
          tr.phase = 'in';
          tr.t = 0;
        } else game.transition = null;
      }
    }
    if (game.onTick) game.onTick(dt);
    const top = game.top();
    game.stack.forEach((s) => {
      if (s === top || s.alwaysUpdate) s.update && s.update(dt);
    });
    if (ui.state.toastT > 0) ui.state.toastT -= dt;
    ui.state.hits.length = 0;
    if (ui.state.debug) {
      ui.state.boxes.length = 0;
      ui.state.texts.length = 0;
    }
    ui.ctx.fillStyle = '#0b0a14';
    ui.ctx.fillRect(0, 0, D.W, D.H);
    game.stack.forEach((s) => {
      ui.state.enabled = s === top && !game.transition;
      s.draw();
    });
    ui.state.enabled = true;
    ui.drawToast();
    drawTransition();
    D.present();
  } catch (err) {
    // Report once per unique message and keep the loop alive, so one bad frame cannot freeze the game.
    const msg = String((err && err.stack) || err);
    if (game.errors.indexOf(msg) < 0) {
      game.errors.push(msg);
      console.error(msg);
    }
  }
  requestAnimationFrame(frame);
}

game.start = function start() {
  last = Date.now();
  requestAnimationFrame(frame);
};
game.Runner = Runner;
game.hitAt = hitAt;

module.exports = game;
