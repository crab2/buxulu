// Two small screens that give coming back, and staying a while, something to add up to: the seven-day
// sign-in sheet, and 见闻录, the record of every creature the party has driven off.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const audio = require('../core/audio.js');
const clock = require('../core/clock.js');
const store = require('../systems/store.js');
const G = require('../data/game.js');
const Idle = require('../systems/idle.js');
const SignIn = require('../systems/signin.js');
const Lore = require('../systems/lore.js');
const { UI } = require('../core/palette.js');

const { W, H } = D;

// What a gift holds, as icons with a figure under each.
function parts(r) {
  const out = [];
  if (r.coin) out.push({ icon: 'coin', text: ui.num(r.coin), color: UI.gold });
  if (r.dust) out.push({ icon: 'dust', text: String(r.dust), color: UI.blue });
  if (r.tickets) out.push({ icon: 'letter', text: '×' + r.tickets, color: UI.gold });
  Object.keys(r.items || {}).forEach((k) => out.push({ icon: G.ITEMS[k].icon, text: '×' + r.items[k], color: UI.text }));
  return out;
}

function words(r) {
  const out = [];
  if (r.coin) out.push(`铜钱 +${ui.num(r.coin)}`);
  if (r.dust) out.push(`星砂 +${r.dust}`);
  if (r.tickets) out.push(`星笺 +${r.tickets}`);
  Object.keys(r.items || {}).forEach((k) => out.push(`${G.ITEMS[k].name} ×${r.items[k]}`));
  return out.join(' ');
}

class SignInScene {
  constructor(p) {
    this.p = p || {};
    this.t = 0;
    this.pop = 0;
  }
  update(dt) {
    this.t = Math.min(1, this.t + dt * 7);
    this.pop = Math.max(0, this.pop - dt * 3);
  }
  claim() {
    const s = store.get();
    const got = SignIn.claim(s, Idle.dayOf(clock.now()));
    if (!got) return;
    Idle.nudge(s);
    store.persist();
    audio.sfx(got.slot === SignIn.DAYS.length - 1 ? 'level' : 'star');
    audio.buzz('light');
    this.pop = 1;
    ui.toast(`第 ${got.slot + 1} 天:${words(got)}`, 1.8);
    if (this.p.onClaim) this.p.onClaim();
  }
  draw() {
    const s = store.get();
    const st = SignIn.ensure(s);
    const fresh = SignIn.ready(s, Idle.dayOf(clock.now()));
    const next = SignIn.slot(s);
    // Just after the seventh gift the round has turned over, and the sheet still shows it as taken.
    const taken = !fresh && next === 0 && st.n > 0 ? SignIn.DAYS.length : next;
    const w = Math.min(W - 16, 284);
    const gap = 4;
    const cw = Math.floor((w - 20 - gap * 3) / 4), ch = 56;
    const h = 62 + ch * 2 + gap + 46;
    const x = Math.round((W - w) / 2);
    const y = Math.round((H - h) / 2 + (1 - this.t) * 10);
    ui.alpha(0.55 * this.t);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    ui.panel(x, y, w, h);
    ui.text('七日签到', W / 2, y + 11, UI.gold, { align: 'c' });
    ui.text('不必连着来,哪天来都接着领', W / 2, y + 30, UI.dim, { align: 'c' });
    const gx = x + 10, gy = y + 50;
    SignIn.DAYS.forEach((_, i) => {
      const last = i === SignIn.DAYS.length - 1;
      const cx = gx + (i < 4 ? i : i - 4) * (cw + gap);
      const cy = gy + (i < 4 ? 0 : ch + gap);
      const cellW = last ? cw * 2 + gap : cw;
      const done = i < taken;
      const today = fresh && i === next;
      const lift = today ? Math.round(Math.sin(game.t * 4) * 1) : done && i === taken - 1 ? -Math.round(this.pop * 3) : 0;
      ui.panel(cx, cy + lift, cellW, ch, { fill: today ? '#3a2a14' : done ? '#181527' : last ? '#2a1a28' : '#241f33', line: today ? '#f7dd7a' : last && !done ? '#ec7a4e' : UI.line, plain: true });
      ui.text(`第${i + 1}天`, cx + cellW / 2, cy + 5 + lift, done ? UI.faint : today ? UI.gold : UI.dim, { align: 'c' });
      const list = parts(SignIn.reward(s, i));
      const colW = (cellW - 6) / list.length;
      list.forEach((p, k) => {
        const px = cx + 3 + colW * (k + 0.5);
        if (done) ui.alpha(0.35);
        ui.img(art.icon(p.icon), Math.round(px - 8), cy + 20 + lift);
        ui.alpha(1);
        ui.text(p.text, px, cy + 39 + lift, done ? UI.faint : p.color, { align: 'c' });
      });
      if (done) {
        // A tick in jade over what has been taken.
        const tx = cx + cellW - 13, ty = cy + 6 + lift;
        ui.rect(tx, ty + 3, 2, 2, '#7fd1a4');
        ui.rect(tx + 2, ty + 5, 2, 2, '#7fd1a4');
        ui.rect(tx + 4, ty + 3, 2, 2, '#7fd1a4');
        ui.rect(tx + 6, ty + 1, 2, 2, '#7fd1a4');
      }
    });
    const by = y + h - 40;
    const bw = Math.floor((w - 28) / 2);
    ui.button('signin-claim', x + 10, by, bw, 28, {
      label: fresh ? '领取' : '明天再来', kind: fresh ? 'primary' : 'normal', disabled: !fresh, badge: fresh, sound: null, onTap: () => this.claim(),
    });
    ui.button('signin-close', x + w - 10 - bw, by, bw, 28, { label: '关闭', kind: 'ghost', sound: 'back', onTap: () => game.pop(this) });
  }
}

const ROW_H = 66;

class LoreScene {
  constructor() {
    this.scroll = 0;
    this.maxScroll = 0;
  }
  enter() {
    audio.bgm('road');
  }
  onDrag(dx, dy) {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll - dy));
  }
  got(r, name) {
    if (!r.n) return;
    const s = store.get();
    Idle.nudge(s);
    store.persist();
    audio.sfx('star');
    audio.buzz('light');
    ui.toast(`${name}:见闻 +${r.n} 星砂 +${r.dust}`, 1.6);
  }
  row(s, id, x, y, w) {
    const e = Lore.entry(s, id);
    const full = e.got >= e.need.length;
    ui.panel(x, y, w, ROW_H - 4, { fill: e.known ? UI.panel : '#181527' });
    // The creature itself, small enough to sit in the margin. One never met is only a question.
    const bx = x + 7, by = y + 8, box = 40;
    ui.rect(bx, by, box, box, UI.ink);
    ui.rect(bx + 1, by + 1, box - 2, box - 2, e.known ? '#2a2542' : '#14121f');
    const tx = x + 55;
    if (!e.known) {
      ui.text('?', bx + box / 2, by + 14, UI.faint, { align: 'c' });
      ui.text('还没遇见', tx, y + 8, UI.faint);
      ui.text('沿着路再走一走,总会碰上。', tx, y + 24, UI.faint);
      return;
    }
    // One still pose each: thirty creatures breathing at once would bake twice the sprites for no gain.
    const a = art.monster(e.def.art, 0);
    const k = Math.min(1, (box - 4) / a.w, (box - 4) / a.h);
    const aw = Math.round(a.w * k), ah = Math.round(a.h * k);
    if (y + ROW_H > 0 && y < H) {
      if (k < 1) ui.imgScaled(a, bx + Math.round((box - aw) / 2), by + box - 2 - ah, aw, ah);
      else ui.img(a, bx + Math.round((box - a.w) / 2), by + box - 2 - a.h);
    }
    ui.text(e.def.name, tx, y + 7, e.def.el ? G.ELEMENTS[e.def.el].css : UI.text);
    if (e.def.boss || e.def.elite) ui.text(e.def.boss ? '星位' : '强敌', tx + ui.font.width(e.def.name) + 6, y + 7, e.def.boss ? UI.red : UI.violet);
    // Three marks: written down, reached and waiting, or still ahead.
    for (let i = 0; i < e.need.length; i++) {
      const px = tx + i * 9;
      const wait = i >= e.got && i < e.reached;
      ui.rect(px, y + 24, 7, 7, UI.ink);
      ui.rect(px + 1, y + 25, 5, 5, i < e.got ? '#f7dd7a' : wait ? (Math.floor(game.t * 3) % 2 ? '#7fd1a4' : '#fff2c8') : '#3a3350');
    }
    const goal = e.next || e.need[e.need.length - 1];
    ui.text(full ? `击退 ${ui.num(e.kills)}` : `击退 ${ui.num(e.kills)}/${ui.num(goal)}`, tx + 31, y + 22, full ? UI.gold : UI.dim);
    if (e.note) ui.para(e.note, tx, y + 36, w - 62, UI.peach, { lh: 13 });
    else ui.text('记下第一笔,就知道它的来历。', tx, y + 36, UI.faint);
    if (e.ready > 0) {
      ui.button('lore-' + id, x + w - 58, y + 5, 52, 26, {
        label: '记下', kind: 'primary', badge: true, sound: null, onTap: () => this.got(Lore.claim(s, id), e.def.name),
      });
    }
  }
  draw() {
    const s = store.get();
    ui.backdrop('spring', 0.62);
    const m = 8, w = W - m * 2;
    const top = D.contentTop;
    // What it all comes to, fixed above the list.
    const pts = Lore.points(s);
    const ready = Lore.ready(s);
    ui.panel(m, top, w, 46);
    ui.img(art.icon('lore'), m + 9, top + 7);
    ui.text(`见闻 ${pts} / ${Lore.TOTAL}`, m + 31, top + 8, UI.gold);
    ui.text(`路上铜钱与阅历 +${Lore.percent(s)}%`, m + 10, top + 26, pts ? UI.jade : UI.dim);
    if (ready > 0) {
      ui.button('lore-all', W - m - 80, top + 6, 72, 26, {
        label: `全部记下 ${ready}`, kind: 'primary', badge: true, sound: null, onTap: () => this.got(Lore.claimAll(s), '见闻录'),
      });
    }
    const listTop = top + 50;
    const bottom = H - D.safeBottom;
    ui.setClip(0, listTop, W, bottom - listTop);
    let y = listTop - Math.round(this.scroll);
    Lore.REGIONS.forEach((r) => {
      if (!r.ids.length) return;
      ui.text(r.name, m + 4, y + 5, UI.gold, { outline: true });
      const tw = ui.font.width(r.name);
      ui.rect(m + 10 + tw, y + 11, w - 14 - tw, 1, UI.line);
      y += 22;
      r.ids.forEach((id) => {
        this.row(s, id, m, y, w);
        y += ROW_H;
      });
      y += 4;
    });
    this.maxScroll = Math.max(0, y + 6 + this.scroll - bottom);
    this.scroll = Math.min(this.scroll, this.maxScroll);
    ui.endClip();
    ui.header('见闻录', () => game.go('trials'), s.stardust, s.coin);
  }
}

game.register('signin', SignInScene);
game.register('lore', LoreScene);

module.exports = { SignInScene, LoreScene };
