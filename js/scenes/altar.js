// The Step Altar: where real steps become Stardust, and where Stardust becomes a smoother journey.
// Everything here is an enhancement. A player who never opens this tab can still finish the game.
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
const Boosts = require('../systems/boosts.js');
const Daily = require('../systems/daily.js');
const steps = require('../systems/steps.js');
const O = require('./overlays.js');
const nav = require('./nav.js');
const { drawDisc, reasonText } = require('./title.js');
const { Particles } = require('../core/fx.js');
const { UI } = require('../core/palette.js');
const R = steps.RULES;

const { W, H } = D;

class Altar {
  constructor() {
    this.fx = new Particles();
    this.flying = [];
    this.pulse = 0;
    this.scroll = 0;
    this.maxScroll = 0;
    this.bottom = H - nav.height();
  }
  enter() {
    audio.bgm('road');
    if (store.get().steps.lastView) steps.refresh().then((fresh) => this.celebrate(fresh, true));
  }
  update(dt) {
    this.fx.update(dt);
    this.pulse = Math.max(0, this.pulse - dt * 2);
    this.flying.forEach((f) => {
      f.t += dt;
      const p = Math.min(1, Math.max(0, f.t) / 0.6);
      f.x = f.x0 + (f.x1 - f.x0) * p;
      f.y = f.y0 + (f.y1 - f.y0) * p * p;
    });
    this.flying = this.flying.filter((f) => f.t < 0.6);
  }
  doExchange() {
    if (this.busy) return;
    this.busy = true;
    steps.exchange().then((fresh) => {
      this.busy = false;
      if (steps.state.status !== steps.S.READY) {
        O.modal({ title: '未能兑换', text: reasonText(steps.state.status) });
        return;
      }
      store.persist();
      this.celebrate(fresh, false);
    });
  }
  celebrate(fresh, quiet) {
    if (!fresh.length) return;
    const dust = fresh.reduce((a, g) => a + (g.dust || 0), 0);
    const items = {};
    const rows = [];
    const notes = [];
    fresh.forEach((g) => {
      Object.keys(g.items || {}).forEach((k) => { items[k] = (items[k] || 0) + g.items[k]; });
      (g.notes || []).forEach((n) => notes.push(n));
    });
    const today = notes.find((n) => n.kind === 'today');
    const back = notes.find((n) => n.kind === 'backfill');
    if (today) rows.push({ label: `今日 ${ui.fmt(today.steps)} 步`, value: `+${ui.fmt(today.dust)}` });
    if (back) rows.push({ label: `前几日 ${ui.fmt(back.steps)} 步`, value: `+${ui.fmt(back.dust)}` });
    notes.filter((n) => n.kind === 'daily').forEach((n) => rows.push({ label: `今日达成 ${ui.fmt(n.steps)} 步`, value: n.dust ? `+${n.dust}` : '奖励', valueColor: UI.jade }));
    notes.filter((n) => n.kind === 'streak').forEach((n) => rows.push({ label: `连行 ${n.days} 日`, value: `+${n.dust}`, valueColor: UI.jade }));
    notes.filter((n) => n.kind === 'life').forEach((n) => rows.push({ label: `路碑 · ${n.title}`, value: `+${ui.fmt(n.dust)}`, valueColor: UI.peach }));
    Object.keys(items).forEach((k) => rows.push({ icon: G.ITEMS[k].icon, label: G.ITEMS[k].name, value: '×' + items[k] }));
    if (today || back) rows.push({ icon: 'boot', label: '队伍跟着多走了几里', value: '神行', valueColor: UI.jade });
    audio.sfx('coin');
    audio.buzz('medium');
    this.pulse = 1;
    const cy = this.discY || H * 0.25;
    for (let i = 0; i < 24; i++) {
      this.flying.push({ t: -i * 0.03, x0: W / 2 + (Math.random() - 0.5) * 40, y0: cy + (Math.random() - 0.5) * 40, x1: D.capLeft - 16, y1: D.capTop + 8, x: W / 2, y: cy });
    }
    this.fx.burst(W / 2, cy, 'star', 40, 90);
    if (!quiet || dust > 0) O.modal({ title: `获得 ${ui.fmt(dust)} 星砂`, icon: art.icon('dust'), rows, buttons: [{ label: '收下', kind: 'primary' }] });
  }
  connectPanel(y) {
    const S = steps.S;
    const st = steps.state.status;
    const m = 8, w = W - m * 2;
    if (st === S.WORKING) {
      ui.panel(m, y, w, 44);
      ui.text('星盘感应中…', W / 2, y + 16, UI.text, { align: 'c' });
      return y + 48;
    }
    const msg = reasonText(st);
    const h = ui.paraHeight(msg, w - 24) + 52;
    ui.panel(m, y, w, h);
    ui.para(msg, m + 12, y + 10, w - 24, UI.text);
    const btnY = y + h - 34;
    if (st === S.SCOPE_DENIED) {
      ui.button('altar-settings', m + 12, btnY, w - 24, 26, {
        label: '打开设置授权', kind: 'jade',
        onTap: () => steps.openSettings().then((ok) => { if (ok) steps.refresh().then((f) => this.celebrate(f, true)); }),
      });
    } else {
      ui.button('altar-retry', m + 12, btnY, w - 24, 26, { label: '开启微信运动', kind: 'jade', onTap: () => steps.refresh().then((f) => this.celebrate(f, true)) });
    }
    return y + h + 4;
  }
  onDrag(dx, dy) {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll - dy));
  }
  drawStride(y, view, m, w) {
    const today = view.today;
    ui.panel(m, y, w, 66);
    ui.text('今日神行', m + 10, y + 7, UI.gold);
    const bonus = W_.STRIDE.reduce((b, t) => (today.steps >= t.steps ? t.bonus : b), 0);
    ui.text(bonus ? `行军与收益 +${Math.round(bonus * 100)}%` : '走得越多,今天路上越快', W - m - 10, y + 7, bonus ? UI.jade : UI.dim, { align: 'r' });
    const n = R.DAILY_MILESTONES.length;
    const seg = Math.floor((w - 20) / n);
    R.DAILY_MILESTONES.forEach((ms, i) => {
      const x = m + 10 + i * seg;
      const claimed = view.claimedMiles.indexOf(ms.steps) >= 0;
      const reached = today.steps >= ms.steps;
      ui.alpha(reached ? 1 : 0.4);
      ui.img(art.icon(claimed ? 'star' : 'chest'), x + seg / 2 - 8, y + 22);
      ui.alpha(1);
      const lbl = ms.steps >= 10000 ? ms.steps / 10000 + '万' : ms.steps / 1000 + '千';
      ui.text(lbl, x + seg / 2 - 12, y + 42, reached ? UI.text : UI.faint);
      ui.text(`+${Math.round(W_.STRIDE[i].bonus * 100)}%`, x + seg / 2 + 12, y + 42, reached ? UI.jade : UI.faint, { align: 'r' });
    });
    return y + 70;
  }
  drawUses(y, s, m, w) {
    const now = clock.now();
    ui.panel(m, y, w, 108);
    ui.text('星砂妙用', m + 10, y + 7, UI.gold);
    ui.text('都是锦上添花,不用也不耽误', W - m - 10, y + 7, UI.dim, { align: 'r' });
    const row = (id, b, yy, extra, onTap) => {
      ui.img(art.icon(b.icon), m + 8, yy + 3);
      ui.text(b.name, m + 28, yy, UI.text);
      ui.text(extra, m + 28, yy + 12, UI.dim);
      const can = s.stardust >= b.cost;
      ui.button(id, W - m - 68, yy, 60, 24, { label: String(b.cost), icon: 'dust', kind: can ? 'jade' : 'normal', disabled: !can, sound: 'star', onTap });
    };
    row('use-haste', W_.BOOSTS.haste, y + 22, s.idle.hasteSecs > 0 ? `翻倍中,还有 ${ui.dur(s.idle.hasteSecs)}` : '30 分钟内路上收益翻倍', () => {
      if (!Boosts.buyHaste(s)) return ui.toast('御风已经攒满了');
      store.persist();
      return null;
    });
    row('use-jump', W_.BOOSTS.jump, y + 49, '立刻获得 1 小时路上收益', () => {
      Boosts.useJump(s, now);
      store.persist();
      ui.toast('一步千里。收益已放进行囊。');
    });
    row('use-dice', W_.BOOSTS.dice, y + 76, `多掷一次云游,现有 ${s.wander.rolls} 次`, () => {
      Boosts.buyRoll(s);
      store.persist();
    });
    return y + 112;
  }
  drawBlessings(y, s, m, w) {
    ui.panel(m, y, w, 112);
    ui.text('星命', m + 10, y + 7, UI.gold);
    ui.text('永久生效', W - m - 10, y + 7, UI.dim, { align: 'r' });
    Object.keys(W_.BLESSINGS).forEach((id, i) => {
      const b = W_.BLESSINGS[id];
      const yy = y + 22 + i * 29;
      const tier = s.blessings[id];
      const cost = Boosts.blessingCost(id, tier);
      const max = tier >= b.max;
      ui.img(art.icon(b.icon), m + 8, yy + 3);
      ui.text(b.name, m + 28, yy, UI.text);
      ui.text(`${tier}/${b.max}`, m + 60, yy, UI.jade);
      ui.text(b.desc, m + 28, yy + 13, UI.dim);
      ui.button('bless-' + id, W - m - 68, yy, 60, 24, {
        label: max ? '圆满' : ui.num(cost), icon: max ? undefined : 'dust', kind: !max && s.stardust >= cost ? 'jade' : 'normal', disabled: max || s.stardust < cost, sound: 'level',
        onTap: () => {
          Boosts.buyBlessing(s, id);
          store.persist();
        },
      });
    });
    return y + 116;
  }
  draw() {
    const s = store.get();
    ui.img(art.battleBg('void', W, H), 0, 0);
    const top = D.contentTop;
    ui.setClip(0, top, W, this.bottom - top);
    let y = top - Math.round(this.scroll);
    const view = steps.view();
    const today = view && view.today;
    const r = 46;
    const cy = y + r + 6;
    this.discY = cy;
    if (this.pulse > 0) {
      ui.alpha(this.pulse * 0.4);
      ui.rect(0, cy - r - 8, W, r * 2 + 16, '#f7dd7a');
      ui.alpha(1);
    }
    drawDisc(W / 2, cy, r, game.t + (this.busy ? game.t * 3 : 0), s.progress.stars, this.busy);
    const shown = today ? today.steps : 0;
    ui.text('今日', W / 2, cy - 25, UI.dim, { align: 'c' });
    ui.numberBig(String(shown), W / 2, cy - 11, today ? '#f7dd7a' : '#5a5070', String(shown).length > 5 ? 2 : 3);
    ui.text('步', W / 2, cy + 13, UI.dim, { align: 'c' });
    y = cy + r + 8;
    const m = 8, w = W - m * 2;
    if (steps.state.status !== steps.S.READY && (!view || steps.state.status !== steps.S.WORKING)) {
      y = this.connectPanel(y);
    }
    if (view) {
      const dust = today.dust + view.backfill.dust;
      ui.button('altar-exchange', m, y, w, 40, {
        label: view.canExchange ? (dust ? `兑换 +${ui.fmt(dust)} 星砂` : '领取今日奖励') : '今日已全部兑换',
        sub: `${R.RATE} 步 = 1 星砂 · 已换 ${ui.fmt(today.exchanged)} / ${ui.fmt(today.cap)} 步`,
        kind: view.canExchange ? 'primary' : 'normal', disabled: !view.canExchange || this.busy,
        subColor: view.canExchange ? '#3a2a14' : UI.faint, onTap: () => this.doExchange(), sound: null,
      });
      y += 44;
      if (view.backfill.steps >= R.BACKFILL_RATE) {
        ui.text(`含前 ${R.BACKFILL_DAYS} 日未兑 ${ui.fmt(view.backfill.steps)} 步(半价补领)`, W / 2, y, UI.dim, { align: 'c', outline: true });
        y += 15;
      }
      if (today.capped) {
        ui.text('今日已超过可兑换上限,走得很棒,也记得休息', W / 2, y, UI.jade, { align: 'c', outline: true });
        y += 15;
      }
      y = this.drawStride(y, view, m, w);
    }
    y = this.drawUses(y, s, m, w);
    y = this.drawBlessings(y, s, m, w);
    if (view) {
      // Last seven days
      ui.panel(m, y, w, 76);
      ui.text('近七日', m + 10, y + 7, UI.gold);
      const maxS = Math.max(6000, ...view.history.map((d) => d.steps));
      const chartH = 34;
      const bw = Math.floor((w - 24) / 7);
      view.history.forEach((d, i) => {
        const bh = Math.max(1, Math.round((d.steps / maxS) * chartH));
        const x = m + 12 + i * bw;
        const base = y + 24 + chartH;
        ui.rect(x + 2, base - chartH, bw - 4, chartH, '#241f33');
        ui.rect(x + 2, base - bh, bw - 4, bh, i === 6 ? '#e8b33a' : '#3f9e7e');
        ui.rect(x + 2, base - bh, bw - 4, 1, i === 6 ? '#f7dd7a' : '#7fd1a4');
      });
      ui.text('昨', m + 12 + 5 * bw + bw / 2, y + 59, UI.dim, { align: 'c' });
      ui.text('今', m + 12 + 6 * bw + bw / 2, y + 59, UI.gold, { align: 'c' });
      y += 80;
      // Lifetime road
      ui.panel(m, y, w, 62);
      const km = Math.round(view.total * 0.0007 * 2);
      ui.text(`累计 ${ui.fmt(view.total)} 步 约 ${ui.fmt(km)} 里`, m + 10, y + 8, UI.text);
      if (view.streak) ui.text(`连行 ${view.streak} 日`, W - m - 10, y + 8, UI.jade, { align: 'r' });
      if (view.nextLife) {
        const prev = view.life ? R.LIFETIME_MILESTONES[view.life - 1].steps : 0;
        ui.bar(m + 10, y + 27, w - 20, 7, (view.total - prev) / (view.nextLife.steps - prev), '#a884c9');
        ui.text(`下一路碑「${view.nextLife.title}」 ${ui.fmt(view.nextLife.steps)} 步`, m + 10, y + 40, UI.dim);
      } else ui.text('天下路碑,你都走过了', m + 10, y + 30, UI.gold);
      y += 66;
    }
    // Station wage, for everyone.
    const day = Idle.dayOf(clock.now());
    const claimed = s.flags.stipendDay === day;
    const wage = E.stipendAmount(s);
    ui.button('altar-stipend', m, y, w, 28, {
      label: claimed ? '今日俸禄已领' : `领取驿站俸禄 +${wage}`, kind: claimed ? 'normal' : 'jade', disabled: claimed,
      onTap: () => {
        E.claimStipend(s, day);
        Daily.ensure(s, day);
        store.persist();
        audio.sfx('coin');
        ui.toast(`老驿丞:拿好,别乱花。 +${wage} 星砂`);
      },
    });
    y += 32;
    if (steps.state.mock) {
      ui.panel(m, y, w, 76, { fill: '#2a1a28', line: '#8e2a25' });
      ui.text('开发模式 · 发布版不会出现', m + 10, y + 7, UI.red);
      ui.button('altar-mock', m + 8, y + 24, Math.floor((w - 22) / 2), 24, { label: '+2000 步', kind: 'danger', onTap: () => steps.mockAddSteps(2000) });
      ui.button('altar-skip', m + 14 + Math.floor((w - 22) / 2), y + 24, Math.floor((w - 22) / 2), 24, {
        label: '时间快进 1 小时', kind: 'danger',
        onTap: () => { clock.skip(3600000); Idle.sync(s, clock.now()); store.persist(); },
      });
      ui.text('模拟步数和时间,用来试玩', m + 10, y + 53, UI.faint);
      y += 80;
    }
    ui.para('步数由微信在你进入游戏时更新。如果数字没变,退出游戏再进来看看。', m + 2, y + 2, w - 4, UI.dim, { outline: true });
    y += 40;
    this.maxScroll = Math.max(0, y + this.scroll - this.bottom);
    this.scroll = Math.min(this.scroll, this.maxScroll);
    ui.endClip();
    ui.header('步虚台', null, s.stardust, s.coin);
    this.flying.forEach((f) => {
      if (f.t >= 0) ui.img(art.icon('dust'), f.x - 8, f.y - 8);
    });
    this.fx.draw();
    nav.draw('altar');
  }
}

game.register('altar', Altar);
