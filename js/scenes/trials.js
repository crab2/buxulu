// The Trials tab: the Sky Stair (hand-played climbing), the Wander board (dice) and the daily errands.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const audio = require('../core/audio.js');
const clock = require('../core/clock.js');
const store = require('../systems/store.js');
const E = require('../systems/economy.js');
const G = require('../data/game.js');
const W_ = require('../data/world.js');
const Idle = require('../systems/idle.js');
const P = require('../systems/party.js');
const Tower = require('../systems/tower.js');
const Wander = require('../systems/wander.js');
const Daily = require('../systems/daily.js');
const Boosts = require('../systems/boosts.js');
const steps = require('../systems/steps.js');
const O = require('./overlays.js');
const nav = require('./nav.js');
const { Particles } = require('../core/fx.js');
const { UI } = require('../core/palette.js');

const { W, H } = D;

function card(id, x, y, w, h, o) {
  ui.panel(x, y, w, h, { fill: o.locked ? '#181527' : UI.panel });
  ui.img(art.icon(o.icon), x + 10, y + 10);
  ui.text(o.title, x + 32, y + 8, o.locked ? UI.faint : UI.gold);
  ui.para(o.text, x + 32, y + 23, w - 44 - (o.action ? 66 : 0), o.locked ? UI.faint : UI.dim, { lh: 13 });
  if (o.action) ui.button(id, x + w - 70, y + Math.round((h - 30) / 2), 60, 30, { label: o.action, kind: o.kind || 'primary', badge: o.badge, onTap: o.onTap });
}

class Trials {
  constructor() {
    this.scroll = 0;
    this.maxScroll = 0;
    this.bottom = H - nav.height();
  }
  enter() {
    audio.bgm('road');
  }
  onDrag(dx, dy) {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll - dy));
  }
  claim(id, day) {
    const s = store.get();
    const n = Daily.claim(s, id, day);
    if (n) {
      store.persist();
      audio.sfx('coin');
    }
  }
  draw() {
    const s = store.get();
    const now = clock.now();
    const day = Idle.dayOf(now);
    ui.img(art.battleBg('autumn', W, H), 0, 0);
    ui.alpha(0.58);
    ui.rect(0, 0, W, H, '#07061a');
    ui.alpha(1);
    const top = D.contentTop;
    ui.setClip(0, top, W, this.bottom - top);
    let y = top - Math.round(this.scroll);
    const m = 8, w = W - m * 2;
    const towerOpen = E.unlocked(s, 'tower');
    card('trial-tower', m, y, w, 62, {
      icon: 'tower', title: '登天阶', locked: !towerOpen,
      text: towerOpen ? `一级级往上打,首次过关得星砂。最高第 ${s.tower.best} 阶。` : '点亮第一颗星之后开放。',
      action: towerOpen ? '去登' : null, onTap: () => game.go('tower'),
    });
    y += 66;
    const wanderOpen = E.unlocked(s, 'wander');
    if (wanderOpen) Wander.regen(s, now);
    card('trial-wander', m, y, w, 62, {
      icon: 'dice', title: '云游', locked: !wanderOpen,
      text: wanderOpen ? `掷骰子走一圈。现有 ${s.wander.rolls} 次,已走 ${s.wander.laps} 圈。` : '走到炎陵之后开放。',
      action: wanderOpen ? '去走' : null, badge: wanderOpen && s.wander.rolls > 0, onTap: () => game.go('wander'),
    });
    y += 66;
    const gachaOpen = E.unlocked(s, 'gacha');
    card('trial-gacha', m, y, w, 62, {
      icon: 'letter', title: '星笺', locked: !gachaOpen,
      text: gachaOpen ? `拆开天上寄来的信,里面是行装。现有 ${s.gacha.tickets} 封。` : '点亮第一颗星之后开放。',
      action: gachaOpen ? '去拆' : null, badge: gachaOpen && s.gacha.tickets > 0, onTap: () => game.go('gacha', { from: 'trials' }),
    });
    y += 66;
    // Daily errands
    const d = Daily.ensure(s, day);
    const rows = W_.DAILY_TASKS.length;
    const h = 28 + rows * 25 + 62;
    ui.panel(m, y, w, h);
    ui.img(art.icon('quest'), m + 8, y + 6);
    ui.text('日课', m + 28, y + 9, UI.gold);
    const claimedN = Daily.claimedCount(s, day);
    ui.text(`${Math.min(claimedN, W_.DAILY_BONUS.need)} / ${W_.DAILY_BONUS.need} 项得大礼`, W - m - 10, y + 9, UI.dim, { align: 'r' });
    let ry = y + 28;
    W_.DAILY_TASKS.forEach((t) => {
      const done = d.done[t.id], got = d.claimed[t.id];
      ui.text(t.name, m + 12, ry + 5, got ? UI.faint : done ? UI.text : UI.dim);
      ui.button('daily-' + t.id, W - m - 66, ry, 58, 22, {
        icon: got ? undefined : 'dust', label: got ? '已领' : String(t.dust), kind: done && !got ? 'primary' : 'normal', disabled: !done || got, sound: null,
        onTap: () => this.claim(t.id, day),
      });
      ry += 25;
    });
    const canB = Daily.bonusReady(s, day);
    ui.button('daily-bonus', m + 8, ry + 2, w - 16, 24, {
      label: d.bonus ? '今日大礼已领' : `日课大礼 +${W_.DAILY_BONUS.dust} 星砂 +${W_.DAILY_BONUS.tickets} 星笺`, kind: canB ? 'jade' : 'normal', disabled: !canB, sound: null,
      onTap: () => {
        Daily.claimBonus(s, day);
        store.persist();
        audio.sfx('star');
      },
    });
    ry += 28;
    // Walking is a separate extra. It never counts toward the bonus above.
    const walkOk = Daily.walkReady(s, day);
    const view = steps.view();
    const walked = view && view.today && view.today.day === day ? view.today.steps : 0;
    ui.button('daily-walk', m + 8, ry + 2, w - 16, 24, {
      label: d.walk ? '今日走路奖励已领' : `额外:走满 ${ui.fmt(W_.DAILY_WALK.steps)} 步 +${W_.DAILY_WALK.dust} 星砂(${ui.fmt(walked)})`,
      kind: walkOk ? 'jade' : 'ghost', disabled: !walkOk, sound: null,
      onTap: () => {
        Daily.claimWalk(s, day);
        store.persist();
        audio.sfx('star');
      },
    });
    y += h + 4;
    this.maxScroll = Math.max(0, y + 6 + this.scroll - this.bottom);
    this.scroll = Math.min(this.scroll, this.maxScroll);
    ui.endClip();
    ui.header('历练', null, s.stardust, s.coin);
    nav.draw('trials');
  }
}

// ---- Sky Stair ----
class TowerScene {
  constructor() {
    this.fx = new Particles();
    this.forecast = null;
    this.key = '';
  }
  enter() {
    audio.bgm('road');
  }
  update(dt) {
    this.fx.update(dt);
    if (Math.random() < dt * 5) this.fx.add({ x: Math.random() * W, y: H * 0.55, vx: 0, vy: -10 - Math.random() * 12, life: 2.4, c: Math.random() > 0.5 ? '#f7dd7a' : '#a884c9', s: 1 });
  }
  fight() {
    const s = store.get();
    const floor = s.tower.best + 1;
    const spec = Tower.floorSpec(floor);
    const now = clock.now();
    Daily.mark(s, 'tower', Idle.dayOf(now));
    store.persist();
    game.go('battle', { fight: { lv: spec.lv, foes: spec.foes }, chapter: spec.ci, tower: floor, from: 'tower' });
  }
  draw() {
    const s = store.get();
    ui.img(art.battleBg('void', W, H), 0, 0);
    const floor = s.tower.best + 1;
    const spec = Tower.floorSpec(floor);
    // The stair rising into the sky: lit steps are done, the bright one is next.
    const baseY = Math.round(H * 0.56);
    const stepH = 9;
    for (let i = 5; i >= -3; i--) {
      const yy = baseY - i * stepH * 2.2;
      const sw = Math.max(36, W * 0.6 - i * 16);
      const col = i === 0 ? '#c2902e' : i < 0 ? '#4a4276' : '#2c2552';
      ui.rect(W / 2 - sw / 2, yy, sw, stepH, col);
      ui.rect(W / 2 - sw / 2, yy, sw, 1, i === 0 ? '#f7dd7a' : i < 0 ? '#6a60a0' : '#3a3366');
      ui.rect(W / 2 - sw / 2, yy + stepH, sw, 2, '#14101f');
      const n = floor + i;
      if (n > 0 && i !== 0) ui.text(String(n), W / 2 - sw / 2 + 4, yy - 1, i < 0 ? UI.dim : UI.faint);
    }
    this.fx.draw();
    // Who stands on the next step
    const n = spec.foes.length;
    spec.foes.forEach((id, i) => {
      const a = art.monster(G.MONSTERS[id].art, Math.floor(game.t * 2) % 2);
      const scale = a.h > 80 ? 0.7 : 1;
      const x = W / 2 + (i - (n - 1) / 2) * (n > 2 ? 46 : 60);
      ui.imgScaled(a, x - (a.w * scale) / 2, baseY + 2 - a.h * scale, a.w * scale, a.h * scale);
    });
    const top = D.contentTop;
    ui.panel(8, top, W - 16, 34);
    ui.text(`第 ${floor} 阶`, 18, top + 6, UI.gold);
    ui.text(`敌方 Lv ${spec.lv}`, W - 18, top + 6, UI.dim, { align: 'r' });
    ui.text(spec.foes.map((id) => G.MONSTERS[id].name).join(' '), 18, top + 19, UI.text);
    const px = 8, pw = W - 16, ph = 118;
    const py = H - D.safeBottom - ph - 8;
    ui.panel(px, py, pw, ph);
    const key = floor + ':' + Math.round(P.power(s));
    if (key !== this.key) {
      this.key = key;
      this.forecast = Idle.forecastLabel(Idle.estimate(s, { foes: spec.foes, lv: spec.lv }, 6));
    }
    ui.text('首次登上可得', px + 10, py + 8, UI.gold);
    ui.text(this.forecast.text, px + pw - 10, py + 8, this.forecast.color, { align: 'r' });
    const r = Tower.reward(floor);
    let x = px + 10;
    x = ui.iconNum('dust', r.dust, x, py + 28, UI.blue);
    x = ui.iconNum('coin', ui.num(r.coin), x, py + 28, UI.gold);
    x = ui.iconNum('xp', ui.num(r.xp), x, py + 28, UI.jade);
    if (r.items.incense) x = ui.iconNum('incense', r.items.incense, x, py + 28);
    if (r.spirits.length) x = ui.iconNum('spirit', r.spirits.length, x, py + 28, UI.violet);
    if (r.tickets) ui.iconNum('letter', r.tickets, x, py + 28, UI.gold);
    ui.text(`驿站俸禄随天阶增长,现为每日 ${E.stipendAmount(s)} 星砂`, px + 10, py + 48, UI.dim);
    const auto = s.settings.auto;
    ui.button('tower-auto', px + 10, py + ph - 42, 76, 32, {
      label: auto ? '自动:开' : '自动:关', kind: auto ? 'jade' : 'normal',
      onTap: () => {
        s.settings.auto = !s.settings.auto;
        store.persist();
      },
    });
    ui.button('tower-fight', px + 92, py + ph - 42, pw - 102, 32, { label: '挑战', kind: 'danger', onTap: () => this.fight() });
    ui.header('', () => nav.go('trials'), s.stardust, s.coin);
  }
}

// ---- Wander board ----
const COLS = 6, ROWS = 8;

// The stops run clockwise around the edge of the grid.
function boardCell(i) {
  if (i < COLS) return [i, 0];
  i -= COLS;
  if (i < ROWS - 1) return [COLS - 1, i + 1];
  i -= ROWS - 1;
  if (i < COLS - 1) return [COLS - 2 - i, ROWS - 1];
  i -= COLS - 1;
  return [0, ROWS - 2 - i];
}

class WanderScene {
  constructor() {
    this.runner = new game.Runner();
    this.fx = new Particles();
    this.busy = false;
    this.pos = store.get().wander.pos;
    this.die = 1;
    this.hop = 0;
    this.line = '';
  }
  enter() {
    audio.bgm('road');
    const s = store.get();
    Wander.regen(s, clock.now());
    this.pos = s.wander.pos;
  }
  update(dt) {
    this.runner.update(dt);
    this.fx.update(dt);
    this.hop = Math.max(0, this.hop - dt * 6);
  }
  roll() {
    if (this.busy) return;
    const s = store.get();
    const now = clock.now();
    const r = Wander.roll(s, now);
    if (!r) return;
    Daily.mark(s, 'wander', Idle.dayOf(now));
    store.persist();
    this.busy = true;
    audio.sfx('tap');
    const self = this;
    this.runner.run((function* play() {
      for (let i = 0; i < 8; i++) {
        self.die = 1 + Math.floor(Math.random() * 6);
        yield 0.06;
      }
      self.die = r.die;
      yield 0.2;
      let at = r.from;
      for (let i = 0; i < r.die; i++) {
        at = (at + 1) % W_.BOARD.length;
        self.pos = at;
        self.hop = 1;
        audio.sfx('tap');
        yield 0.17;
      }
      if (r.forked) {
        ui.toast('抄了条近路!', 0.8);
        yield 0.3;
        self.pos = r.to;
        self.hop = 1;
        yield 0.2;
      }
      self.busy = false;
      self.reveal(r);
    })());
  }
  reveal(r) {
    const T = W_.TILES[r.tile];
    const rows = [];
    if (r.coin) rows.push({ icon: 'coin', label: '铜钱', value: '+' + ui.num(r.coin) });
    if (r.xp) rows.push({ icon: 'xp', label: '阅历', value: '+' + ui.num(r.xp), valueColor: UI.jade });
    if (r.dust) rows.push({ icon: 'dust', label: '星砂', value: '+' + r.dust, valueColor: UI.blue });
    Object.keys(r.herbs || {}).forEach((k) => rows.push({ icon: 'herb_' + k, label: W_.CROPS[k].name, value: '×' + r.herbs[k], valueColor: G.ELEMENTS[k].css }));
    Object.keys(r.items || {}).forEach((k) => rows.push({ icon: G.ITEMS[k].icon, label: G.ITEMS[k].name, value: '×' + r.items[k] }));
    (r.spirits || []).forEach((id) => rows.push({ icon: 'spirit', label: G.MONSTERS[id].name + '之灵', value: '×1', valueColor: UI.violet }));
    if (r.haste) rows.push({ icon: 'wing', label: '御风', value: ui.dur(r.haste), valueColor: UI.jade });
    if (r.rolls) rows.push({ icon: 'dice', label: '多掷一次', value: '+' + r.rolls });
    if (r.lapped) rows.push({ icon: 'star', label: '走完一圈', value: `+${Wander.LAP_DUST} 星砂`, valueColor: UI.gold });
    if (r.lapped) rows.push({ icon: 'letter', label: '路上收到星笺', value: `×${Wander.LAP_TICKETS}`, valueColor: UI.gold });
    audio.sfx(r.lapped ? 'star' : 'coin');
    this.line = r.line;
    O.modal({ title: T.name, text: T.desc + '。', rows, buttons: [{ label: '继续', kind: 'primary' }] });
  }
  draw() {
    const s = store.get();
    const now = clock.now();
    ui.img(art.battleBg('spring', W, H), 0, 0);
    ui.alpha(0.3);
    ui.rect(0, 0, W, H, '#07061a');
    ui.alpha(1);
    const top = D.contentTop + 2;
    const size = Math.floor(Math.min((W - 10) / COLS, (H - top - D.safeBottom - 6) / ROWS));
    const bx = Math.round((W - size * COLS) / 2), by = top;
    W_.BOARD.forEach((t, i) => {
      const [c, r] = boardCell(i);
      const x = bx + c * size, y = by + r * size;
      const T = W_.TILES[t];
      ui.rect(x + 1, y + 1, size - 2, size - 2, UI.ink);
      ui.rect(x + 2, y + 2, size - 4, size - 4, i === 0 ? '#6c3f26' : '#2a2542');
      ui.rect(x + 2, y + 2, size - 4, 1, i === 0 ? '#c98f55' : '#4a4268');
      ui.img(art.icon(T.icon), x + Math.round(size / 2) - 8, y + 4);
      ui.text(T.name, x + size / 2, y + size - ui.font.CELL - 3, UI.dim, { align: 'c' });
    });
    // The courier, hopping between stops.
    const [pc, pr] = boardCell(this.pos);
    const hy = Math.round(Math.sin(this.hop * Math.PI) * 8);
    const tx = bx + pc * size + Math.round(size / 2) - 8, ty = by + pr * size + 4 - hy;
    ui.rect(tx - 1, ty - 1, 18, 18, '#f7dd7a');
    ui.img(art.portraitSmall('cen'), tx, ty);
    this.fx.draw();
    // The middle of the board: dice, rolls and the button.
    const inX = bx + size + 4, inY = by + size + 4, inW = size * (COLS - 2) - 8, inH = size * (ROWS - 2) - 8;
    ui.panel(inX, inY, inW, inH);
    const cx = inX + inW / 2;
    const dieY = inY + 10;
    ui.rect(cx - 15, dieY, 30, 30, UI.ink);
    ui.rect(cx - 14, dieY + 1, 28, 28, '#f2e9d0');
    ui.numberBig(String(this.die), cx + 1, dieY + 8, this.die === 1 || this.die === 4 ? '#c8402f' : '#241f33', 2);
    Wander.regen(s, now);
    ui.text(`可掷 ${s.wander.rolls} 次`, cx, dieY + 36, s.wander.rolls ? UI.gold : UI.dim, { align: 'c' });
    const left = (s.wander.regen - now) / 1000;
    ui.text(s.wander.rolls < Wander.FREE_CAP ? `${ui.dur(left)}后多一次` : `已走 ${s.wander.laps} 圈`, cx, dieY + 50, UI.dim, { align: 'c' });
    let ly = dieY + 66;
    if (s.wander.bonus) {
      ui.text('下一格翻倍', cx, ly, UI.peach, { align: 'c' });
      ly += 15;
    }
    ui.para(this.line || '每走 2,000 步,多掷一次。', inX + 10, ly, inW - 20, this.line ? UI.dim : UI.jade, { lh: 13 });
    const bw = inW - 16;
    const by2 = inY + inH - 60;
    ui.button('wander-roll', inX + 8, by2, bw, 28, { label: this.busy ? '在路上…' : '掷骰子', kind: 'primary', disabled: this.busy || !s.wander.rolls, sound: null, onTap: () => this.roll() });
    const b = W_.BOOSTS.dice;
    ui.button('wander-buy', inX + 8, by2 + 31, bw, 22, {
      icon: 'dust', label: `${b.cost} 多掷一次`, kind: 'ghost', disabled: s.stardust < b.cost || this.busy,
      onTap: () => {
        Boosts.buyRoll(s);
        store.persist();
      },
    });
    ui.header('', () => nav.go('trials'), s.stardust, s.coin);
  }
}

game.register('trials', Trials);
game.register('tower', TowerScene);
game.register('wander', WanderScene);

