// Title screen, opening story, and the moment the star disc first reads the player's real steps.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const audio = require('../core/audio.js');
const store = require('../systems/store.js');
const E = require('../systems/economy.js');
const steps = require('../systems/steps.js');
const O = require('./overlays.js');
const { Weather, Particles } = require('../core/fx.js');
const { UI, css, C } = require('../core/palette.js');
const { dipperPoints } = require('../art/scenery.js');
const { RoadView } = require('./road.js');
const Idle = require('../systems/idle.js');
const { CHAPTERS } = require('../data/chapters.js');
const clock = require('../core/clock.js');
const config = require('../config.js');

const { W, H } = D;
const WELCOME_DUST = 300;
const WELCOME_COIN = 2000;

function drawLogo(cx, y, k) {
  const str = '步虚录';
  const adv = ui.font.width(str) * k;
  const x = Math.round(cx - adv / 2);
  const f = ui.font;
  [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]].forEach((o) => f.drawBig(ui.ctx, str, x + o[0], y + o[1] + 3, '#0b0a14', k));
  [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach((o) => f.drawBig(ui.ctx, str, x + o[0], y + o[1], '#8e2a25', k));
  f.drawBig(ui.ctx, str, x, y, '#f7dd7a', k);
  // A band across the lower half of the letters reads as old gilding.
  ui.setClip(x, y + Math.round(f.CELL * k * 0.55), adv, f.CELL * k);
  f.drawBig(ui.ctx, str, x, y, '#e8b33a', k);
  ui.endClip();
}

class Title {
  constructor() {
    this.t = 0;
    this.fall = [];
    this.next = 0.2;
    this.fx = new Particles();
    // The party is already on the road behind the logo. It is an idle game, after all.
    const s = store.get();
    const ci = Idle.currentChapterIndex(s);
    this.view = new RoadView(H, CHAPTERS[ci].theme);
    this.view.setParty(s);
    this.view.pool = [];
  }
  enter() {
    audio.bgm('title');
  }
  update(dt) {
    this.t += dt;
    this.view.update(dt, 1);
    this.fx.update(dt);
    this.next -= dt;
    if (this.next <= 0) {
      this.next = 0.8 + Math.random() * 1.6;
      this.fall.push({ x: W * (0.2 + Math.random() * 1.0), y: -6, vx: -70 - Math.random() * 40, vy: 110 + Math.random() * 50 });
    }
    this.fall.forEach((s) => {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      for (let i = 0; i < 2; i++) this.fx.add({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.45, c: Math.random() > 0.4 ? '#f7dd7a' : '#ffffff', s: 1 });
    });
    this.fall = this.fall.filter((s) => s.y < H * 0.75);
  }
  start() {
    const s = store.get();
    audio.sfx('star');
    game.go(s.flags.intro ? 'road' : 'intro');
  }
  draw() {
    this.view.draw(clock.now());
    const pts = dipperPoints(W * 0.62, D.contentTop + 22, W * 0.5);
    pts.forEach((q, i) => {
      if (i) {
        ui.alpha(0.5);
        const a = pts[i - 1];
        const n = Math.max(Math.abs(q[0] - a[0]), Math.abs(q[1] - a[1]));
        for (let k = 0; k < n; k += 2) ui.rect(a[0] + ((q[0] - a[0]) * k) / n, a[1] + ((q[1] - a[1]) * k) / n, 1, 1, '#a884c9');
        ui.alpha(1);
      }
      const on = Math.sin(this.t * 2 + i) > -0.2;
      ui.rect(q[0] - 1, q[1] - 1, 3, 3, on ? '#f7dd7a' : '#a8741f');
      if (on) ui.rect(q[0], q[1], 1, 1, '#ffffff');
    });
    this.fx.draw();
    const logoY = Math.round(H * 0.24);
    drawLogo(W / 2, logoY + Math.round(Math.sin(this.t * 1.2) * 2), 3);
    ui.text('足下千里 · 气通北斗', W / 2, logoY + 50, '#f2e9d0', { align: 'c', outline: true });
    ui.text('人在哪里,路都替你走着', W / 2, logoY + 66, '#d9c9a3', { align: 'c', outline: true });
    if (Math.floor(this.t * 1.6) % 2 === 0) ui.text('轻触开始', W / 2, H * 0.47, UI.text, { align: 'c', outline: true });
    ui.text('v' + config.VERSION, W - 6, H - D.safeBottom - 15, UI.text, { align: 'r', outline: true });
    ui.hit('title-start', 0, 0, W, H, () => this.start(), { label: 'title-start', sound: null });
  }
}

// Opening: the prologue, then the first read of the player's steps.
const INTRO_BG = ['void', 'void', 'spring', 'hub', 'hub', 'hub', 'hub', 'hub', 'hub', 'hub'];

class Intro {
  constructor() {
    this.line = 0;
    this.t = 0;
    this.weather = new Weather('void');
    this.fx = new Particles();
  }
  enter() {
    audio.bgm('title');
    game.push('dialog', {
      key: 'prologue',
      onLine: (i) => {
        this.line = i;
        if (i === 1) audio.sfx('gate');
      },
      onDone: () => game.go('reveal'),
    });
  }
  update(dt) {
    this.t += dt;
    this.weather.update(dt);
    this.fx.update(dt);
    if (this.line === 1 && Math.random() < dt * 8) {
      const x = W * 0.3 + Math.random() * W * 0.7;
      for (let k = 0; k < 16; k++) this.fx.add({ x: x - k * 2, y: 20 + k * 6 + Math.random() * 90, vx: -40, vy: 90, life: 0.6, c: k % 2 ? '#f7dd7a' : '#ffffff', s: 1 });
    }
  }
  draw() {
    const kind = INTRO_BG[Math.min(this.line, INTRO_BG.length - 1)];
    if (this.line === 2) {
      // The stuck seasons, one after another.
      const seq = ['spring', 'summer', 'winter'];
      ui.img(art.battleBg(seq[Math.floor(this.t * 0.7) % 3], W, H), 0, 0);
    } else if (kind === 'hub') ui.ctx.drawImage(art.hub(W, H), 0, 0);
    else ui.img(art.battleBg(kind, W, H), 0, 0);
    this.fx.draw();
  }
  resume() {}
}

// The hook of the whole game: the opening reads last week's real walking and turns it into currency.
class Reveal {
  constructor() {
    this.phase = 'ask'; // ask -> reading -> show | denied
    this.t = 0;
    this.spin = 0;
    this.count = 0;
    this.total = 0;
    this.dust = 0;
    this.fx = new Particles();
    this.message = '';
    this.finished = false;
  }
  enter() {
    audio.bgm('title');
  }
  update(dt) {
    this.t += dt;
    this.spin += dt * (this.phase === 'reading' ? 4 : 0.6);
    this.fx.update(dt);
    if (this.phase === 'show' && this.count < this.total) {
      this.count = Math.min(this.total, this.count + Math.max(1, this.total * dt * 0.7));
      if (Math.random() < dt * 30) this.fx.rise(W / 2, H * 0.33, 'star', 1);
    }
  }
  connect() {
    this.phase = 'reading';
    const stepsBefore = store.get().steps.total;
    steps.exchange().then((grants) => {
      if (steps.state.status === steps.S.READY) {
        const s = store.get();
        this.total = s.steps.total - stepsBefore + (steps.state.view ? steps.state.view.today.available : 0);
        this.dust = grants.reduce((a, g) => a + (g.dust || 0), 0);
        this.grants = grants;
        this.phase = 'show';
        audio.sfx('star');
      } else {
        this.message = reasonText(steps.state.status);
        this.phase = 'denied';
      }
    });
  }
  depart(skipped) {
    if (this.finished) return;
    this.finished = true;
    this.phase = 'done';
    const s = store.get();
    s.flags.intro = true;
    E.addDust(s, WELCOME_DUST);
    E.addCoin(s, WELCOME_COIN);
    s.idle.last = clock.now();
    store.persist();
    audio.sfx('coin');
    O.story(skipped ? 'no_steps' : 'blessing', () => {
      O.modal({
        title: '老驿丞的盘缠',
        text: '路上用。省着点花。',
        rows: O.rewardRows({ coin: WELCOME_COIN, dust: WELCOME_DUST }),
        buttons: [{ label: '启程', kind: 'primary', onTap: () => game.go('road') }],
      });
    });
  }
  draw() {
    ui.ctx.drawImage(art.hub(W, H), 0, 0);
    ui.alpha(0.55);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    const cy = Math.round(H * 0.27);
    drawDisc(W / 2, cy, 46, this.spin, 7, this.phase === 'reading');
    this.fx.draw();
    const px = 14, pw = W - 28, py = Math.round(H * 0.46);
    if (this.phase === 'ask') {
      ui.panel(px, py, pw, 160);
      ui.para('星盘想读一读你的脚印。', px + 14, py + 14, pw - 28, UI.gold);
      ui.para(`每走 10 步可兑换 1 星砂,能让路上走得更快、更舒坦。过去七天的路也能折半领取。`, px + 14, py + 34, pw - 28, UI.text);
      ui.para('不开启也不耽误故事和进度。', px + 14, py + 86, pw - 28, UI.dim);
      ui.button('reveal-connect', px + 14, py + 108, pw - 28, 28, { label: '让星盘读取步数', kind: 'primary', onTap: () => this.connect() });
      ui.button('reveal-skip', px + 14, py + 138 - 2, pw - 28, 20, { label: '以后再说', kind: 'ghost', sound: 'back', onTap: () => this.depart(true) });
    } else if (this.phase === 'reading') {
      ui.panel(px, py, pw, 50);
      ui.text('星盘正在读取你的脚印…', W / 2, py + 19, UI.text, { align: 'c' });
    } else if (this.phase === 'show') {
      ui.panel(px, py, pw, 160);
      ui.text('这些日子,你一共走了', W / 2, py + 14, UI.text, { align: 'c' });
      ui.numberBig(ui.fmt(Math.floor(this.count)).replace(/,/g, ''), W / 2, py + 32, '#f7dd7a', 3);
      ui.text('步', W / 2, py + 62, UI.dim, { align: 'c' });
      ui.text(`星盘已为你兑换 ${ui.fmt(this.dust)} 星砂`, W / 2, py + 82, UI.gold, { align: 'c' });
      ui.text('明天走的路,明天还能再来换', W / 2, py + 100, UI.dim, { align: 'c' });
      ui.button('reveal-go', px + 14, py + 122, pw - 28, 28, { label: '继续', kind: 'primary', onTap: () => this.depart(false) });
    } else if (this.phase === 'denied') {
      ui.panel(px, py, pw, 132);
      const h = ui.para(this.message, px + 14, py + 14, pw - 28, UI.text);
      ui.button('reveal-retry', px + 14, py + 22 + h, pw - 28, 26, { label: '再试一次', kind: 'normal', onTap: () => this.connect() });
      ui.button('reveal-skip2', px + 14, py + 52 + h, pw - 28, 26, { label: '先上路', kind: 'primary', onTap: () => this.depart(true) });
    }
  }
}

function reasonText(status) {
  const S = steps.S;
  switch (status) {
    case S.IDLE: return '开启微信运动后,每走 10 步可兑换 1 星砂,过去七天的路也能折半领取。不开启也不耽误进度。';
    case S.PRIVACY_DENIED: return '你还没有同意隐私保护指引,星盘读不到步数。进度不受影响,以后可以在这里重新开启。';
    case S.SCOPE_DENIED: return '你还没有授权读取微信运动。进度不受影响,以后可以在这里重新开启。';
    case S.NO_WERUN: return '读取失败。请先在微信里搜索“微信运动”并开启,然后再回来试试。';
    case S.NOT_DEPLOYED: return '这个版本还没有接入步数服务,暂时无法兑换。';
    default: return '网络开了个小差,星盘没能读到步数。已经走过的路不会丢,稍后再试就好。';
  }
}

// The star disc: a turning bronze ring set with seven stars. The rings are one baked image, so only
// the parts that move cost anything per frame.
function drawDisc(cx, cy, r, spin, lit, busy) {
  const base = art.disc(r);
  ui.img(base, Math.round(cx) - (r + 3), Math.round(cy) - (r + 3));
  for (let i = 0; i < 28; i += 2) {
    const a = (i / 28) * Math.PI * 2 + spin * 0.4;
    const big = i % 4 === 0;
    ui.rect(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3), big ? 2 : 1, big ? 2 : 1, big ? '#e8b33a' : '#a8741f');
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - spin * 0.25 - Math.PI / 2;
    const x = cx + Math.cos(a) * (r - 11), y = cy + Math.sin(a) * (r - 11);
    const on = i < lit;
    ui.rect(x - 1, y - 1, 3, 3, on ? '#f7dd7a' : '#3a3350');
    if (on) {
      ui.rect(x - 2, y, 5, 1, busy ? '#ffffff' : '#e8b33a');
      ui.rect(x, y - 2, 1, 5, busy ? '#ffffff' : '#e8b33a');
    }
  }
}

function drawDipper(cx, cy, size, stars) {
  const pts = dipperPoints(cx, cy, size);
  pts.forEach((q, i) => {
    if (!i) return;
    const a = pts[i - 1];
    const lit = i < stars;
    const n = Math.max(Math.abs(q[0] - a[0]), Math.abs(q[1] - a[1]));
    for (let k = 0; k <= n; k += lit ? 2 : 4) ui.rect(a[0] + ((q[0] - a[0]) * k) / n, a[1] + ((q[1] - a[1]) * k) / n, 1, 1, lit ? '#a8741f' : '#3a3350');
  });
  pts.forEach((q, i) => {
    if (i < stars) {
      const tw = Math.sin(game.t * 3 + i * 1.7) > 0.6;
      ui.rect(q[0] - 1, q[1] - 1, 3, 3, '#f7dd7a');
      ui.rect(q[0] - 2, q[1], 5, 1, tw ? '#ffffff' : '#e8b33a');
      ui.rect(q[0], q[1] - 2, 1, 5, tw ? '#ffffff' : '#e8b33a');
    } else {
      ui.rect(q[0], q[1], 2, 2, '#6f6786');
    }
  });
}

game.register('title', Title);
game.register('intro', Intro);
game.register('reveal', Reveal);

module.exports = { drawDisc, drawDipper, reasonText, css, C };
