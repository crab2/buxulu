// Wangxing Station (the home screen), the Step Altar, the shop and settings.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const audio = require('../core/audio.js');
const store = require('../systems/store.js');
const E = require('../systems/economy.js');
const G = require('../data/game.js');
const { CHAPTERS, STAR_NAMES } = require('../data/chapters.js');
const steps = require('../systems/steps.js');
const O = require('./overlays.js');
const { drawDisc, reasonText } = require('./title.js');
const { dipperPoints } = require('../art/scenery.js');
const { Particles } = require('../core/fx.js');
const { UI } = require('../core/palette.js');
const R = steps.RULES;

const { W, H } = D;

function todayKey() {
  return R.dayKey(Math.floor(Date.now() / 1000));
}

function stepLabel(status) {
  const S = steps.S;
  if (status === S.WORKING) return '星盘感应中…';
  if (status === S.READY) return '';
  return '未连接';
}

function drawDipper(cx, cy, size, stars) {
  const pts = dipperPoints(cx, cy, size);
  pts.forEach((q, i) => {
    if (!i) return;
    const a = pts[i - 1];
    const lit = i < stars;
    const n = Math.max(Math.abs(q[0] - a[0]), Math.abs(q[1] - a[1]));
    for (let k = 0; k <= n; k += lit ? 1 : 3) ui.rect(a[0] + ((q[0] - a[0]) * k) / n, a[1] + ((q[1] - a[1]) * k) / n, 1, 1, lit ? '#a8741f' : '#3a3350');
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

class Hub {
  constructor() {
    // The controls need a fixed height, and the sky scene fills the rest of the screen.
    this.sceneH = Math.max(Math.round(H * 0.34), H - D.safeBottom - 192);
    this.fx = new Particles();
    this.acc = 0;
  }
  enter() {
    audio.bgm('title');
    if (steps.state.status !== steps.S.WORKING && store.get().steps.lastView) steps.refresh();
    store.push();
  }
  resume() {
    store.push();
  }
  update(dt) {
    this.fx.update(dt);
    this.acc += dt;
    if (this.acc > 0.25) {
      this.acc = 0;
      // Chimney smoke and sparks from the altar.
      this.fx.add({ x: W / 2 - 50, y: this.sceneH - 52, vx: 2 + Math.random() * 3, vy: -8, life: 2.4, c: '#5a5070', s: 2 });
      this.fx.add({ x: W / 2 + 62 + (Math.random() - 0.5) * 16, y: this.sceneH - 54, vx: 0, vy: -12 - Math.random() * 8, life: 1.2, c: Math.random() > 0.5 ? '#f7dd7a' : '#6fb0e0', s: 1 });
    }
  }
  draw() {
    const s = store.get();
    const sceneH = this.sceneH;
    ui.ctx.drawImage(art.hub(W, sceneH + 20), 0, -20 + 0);
    const lit = E.starsLit(s);
    drawDipper(W * 0.62, D.contentTop + 4, Math.min(W * 0.42, sceneH * 0.5), lit);
    // Planted beside the station with its roots on the ground, clear of the hero and the flagpole.
    if (s.progress.ending === 'turn') ui.img(art.peach(), W / 2 - 122, sceneH - 96);
    // The star disc on the altar turns all the time.
    drawDisc(W / 2 + 62, sceneH - 72 + 28 - 8, 10, game.t, 0);
    this.fx.draw();
    const bob = Math.round(Math.sin(game.t * 2) * 0.6);
    ui.img(art.hero('cen', Math.floor(game.t * 1.6) % 2 ? 'idle1' : 'idle0').cv, W / 2 + 20, sceneH - 56 + bob * 0);
    ui.header('望星驿', null, s.stardust);

    let y = sceneH - 6;
    y = stepCard(this, s, y);
    const m = 8, bw = W - m * 2;
    const ch = CHAPTERS[s.progress.chapter];
    ui.button('hub-map', m, y, bw, 44, {
      label: s.progress.ending === 'turn' ? '行路 · 故地重游' : `行路 · ${ch.dir}方${ch.name}`,
      sub: lit >= 7 ? '七星归位 · 四时流转' : `第 ${s.progress.chapter + 1} 程 · 下一颗星:${STAR_NAMES[Math.min(s.progress.stars, 6)]}`,
      subColor: '#3a2a14', kind: 'primary', onTap: () => game.go('map'),
    });
    y += 48;
    const cols = [
      { id: 'hub-party', label: '队伍', icon: 'sword', go: 'party' },
      { id: 'hub-furnace', label: '星炉', icon: 'furnace', go: 'furnace' },
      { id: 'hub-shop', label: '驿铺', icon: 'shop', go: 'shop' },
    ];
    const gap = 5;
    const cw = Math.floor((bw - gap * 2) / 3);
    const rowH = 52;
    cols.forEach((c, i) => {
      const hasSpirits = c.id === 'hub-furnace' && Object.keys(s.spirits).reduce((a, k) => a + s.spirits[k], 0) >= 2;
      ui.button(c.id, m + i * (cw + gap), y, cw, rowH, { label: c.label, icon: c.icon, badge: hasSpirits, onTap: () => game.go(c.go) });
    });
    y += rowH + 4;
    ui.button('hub-settings', W - m - 62, y, 62, 24, { label: '设置', kind: 'ghost', onTap: () => game.push('settings') });
    ui.text(`已亮 ${lit} / 7 星`, m + 2, y + 6, UI.dim);
  }
}

function stepCard(scene, s, y) {
  const m = 8, w = W - m * 2, h = 56;
  ui.panel(m, y, w, h);
  const view = steps.view();
  const go = () => game.go('altar');
  if (view) {
    ui.img(art.icon('boot'), m + 8, y + 8);
    ui.text('今日步数', m + 28, y + 6, UI.dim);
    ui.numberBig(String(view.today.steps), m + 28 + String(view.today.steps).length * 6, y + 21, '#f7dd7a', 3);
    const available = view.today.dust + view.backfill.dust;
    ui.button('hub-altar', W - m - 96, y + 9, 90, 38, {
      label: view.canExchange ? '去兑换' : '步虚台',
      sub: view.canExchange ? `+${ui.fmt(available)} 星砂` : '继续走走',
      kind: view.canExchange ? 'jade' : 'normal', badge: view.canExchange,
      subColor: view.canExchange ? '#bfe6d0' : UI.dim, onTap: go,
    });
  } else {
    ui.img(art.icon('boot'), m + 8, y + 8);
    ui.text('步虚台', m + 28, y + 8, UI.gold);
    ui.text('走路兑换星砂', m + 28, y + 26, UI.dim);
    ui.button('hub-altar', W - m - 96, y + 9, 90, 38, { label: '开启', sub: stepLabel(steps.state.status), kind: 'jade', badge: true, onTap: go });
  }
  return y + h + 4;
}

class Altar {
  constructor() {
    this.fx = new Particles();
    this.flying = [];
    this.pulse = 0;
    this.scroll = 0;
    this.maxScroll = 0;
  }
  enter() {
    audio.bgm('title');
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
    audio.sfx('coin');
    audio.buzz('medium');
    this.pulse = 1;
    const cy = this.discY || H * 0.25;
    for (let i = 0; i < 24; i++) {
      this.flying.push({ t: -i * 0.03, x0: W / 2 + (Math.random() - 0.5) * 40, y0: cy + (Math.random() - 0.5) * 40, x1: D.capLeft - 40, y1: D.capTop + 8, x: W / 2, y: cy });
    }
    this.fx.burst(W / 2, cy, 'star', 40, 90);
    if (!quiet || dust > 0) O.modal({ title: `获得 ${ui.fmt(dust)} 星砂`, icon: art.icon('dust'), rows, buttons: [{ label: '收下', kind: 'primary' }] });
  }
  connectPanel(y) {
    const S = steps.S;
    const st = steps.state.status;
    const m = 10, w = W - m * 2;
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
  draw() {
    const s = store.get();
    ui.img(art.battleBg('void', W, H), 0, 0);
    const top = D.contentTop;
    ui.setClip(0, top, W, H - top);
    let y = top - Math.round(this.scroll);
    const view = steps.view();
    const today = view && view.today;
    const r = 54;
    const cy = y + r + 6;
    this.discY = cy;
    if (this.pulse > 0) {
      ui.alpha(this.pulse * 0.4);
      ui.rect(0, cy - r - 8, W, r * 2 + 16, '#f7dd7a');
      ui.alpha(1);
    }
    drawDisc(W / 2, cy, r + Math.round(this.pulse * 3), game.t + (this.busy ? game.t * 3 : 0), s.progress.stars, this.busy);
    const shown = today ? today.steps : 0;
    ui.text('今日', W / 2, cy - 27, UI.dim, { align: 'c' });
    ui.numberBig(String(shown), W / 2, cy - 11, today ? '#f7dd7a' : '#5a5070', String(shown).length > 5 ? 2 : 3);
    ui.text('步', W / 2, cy + 15, UI.dim, { align: 'c' });
    y = cy + r + 8;
    const m = 10, w = W - m * 2;
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
      // Daily milestone track
      ui.panel(m, y, w, 58);
      ui.text('今日路标', m + 10, y + 7, UI.gold);
      const n = R.DAILY_MILESTONES.length;
      const seg = Math.floor((w - 20) / n);
      R.DAILY_MILESTONES.forEach((ms, i) => {
        const x = m + 10 + i * seg;
        const claimed = view.claimedMiles.indexOf(ms.steps) >= 0;
        const reached = today.steps >= ms.steps;
        ui.alpha(reached ? 1 : 0.4);
        ui.img(art.icon(claimed ? 'star' : 'chest'), x + seg / 2 - 8, y + 21);
        ui.alpha(1);
        const lbl = ms.steps >= 10000 ? ms.steps / 10000 + '万' : ms.steps / 1000 + '千';
        ui.text(lbl, x + seg / 2, y + 40, reached ? UI.text : UI.faint, { align: 'c' });
      });
      y += 62;
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
      ['六', '五', '四', '三', '二', '昨', '今'].forEach((t, i) => ui.text(t === '今' || t === '昨' ? t : ' ', m + 12 + i * bw + bw / 2, y + 59, i === 6 ? UI.gold : UI.dim, { align: 'c' }));
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
    // Station wage: guarantees steady progress even without WeRun.
    const day = todayKey();
    const claimed = s.flags.stipendDay === day;
    ui.button('altar-stipend', m, y, w, 28, {
      label: claimed ? '今日俸禄已领' : `领取驿站俸禄 +${E.STIPEND}`, kind: claimed ? 'normal' : 'jade', disabled: claimed,
      onTap: () => {
        E.claimStipend(s, day);
        store.persist();
        audio.sfx('coin');
        ui.toast(`老驿丞:拿好,别乱花。 +${E.STIPEND} 星砂`);
      },
    });
    y += 32;
    if (steps.state.mock) {
      ui.panel(m, y, w, 44, { fill: '#2a1a28', line: '#8e2a25' });
      ui.text('开发模式 · 模拟步数', m + 10, y + 7, UI.red);
      ui.button('altar-mock', W - m - 88, y + 8, 80, 28, { label: '+2000 步', kind: 'danger', onTap: () => steps.mockAddSteps(2000) });
      ui.text('发布版不会出现', m + 10, y + 24, UI.faint);
      y += 48;
    }
    ui.para('步数由微信在你进入游戏时更新。如果数字没变,退出游戏再进来看看。', m + 2, y + 2, w - 4, UI.dim, { outline: true });
    y += 40;
    this.maxScroll = Math.max(0, y + this.scroll - (H - D.safeBottom));
    ui.endClip();
    ui.header('步虚台', () => game.go('hub'), s.stardust);
    this.flying.forEach((f) => {
      if (f.t >= 0) ui.img(art.icon('dust'), f.x - 8, f.y - 8);
    });
    this.fx.draw();
  }
}

class Shop {
  draw() {
    const s = store.get();
    ui.img(art.battleBg('loess', W, H), 0, 0);
    ui.alpha(0.5);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    let y = D.contentTop + 2;
    ui.panel(8, y, W - 16, 34, { fill: '#2a1a28' });
    ui.text('老驿丞:走路换来的星砂,花着才踏实。', W / 2, y + 11, UI.peach, { align: 'c' });
    y += 40;
    const rowH = 56;
    G.SHOP_LIST.forEach((id) => {
      const it = G.ITEMS[id];
      ui.panel(8, y, W - 16, rowH - 4);
      ui.img(art.icon(it.icon), 16, y + 10);
      ui.text(it.name, 38, y + 8, UI.text);
      ui.text(`持有 ${s.items[id] || 0}`, 38 + ui.font.width(it.name) + 8, y + 8, UI.dim);
      ui.para(it.desc, 38, y + 25, W - 138, UI.dim, { lh: 12 });
      ui.button('buy-' + id, W - 82, y + 10, 68, 32, {
        label: String(it.price), icon: 'dust', kind: s.stardust >= it.price ? 'primary' : 'normal', disabled: s.stardust < it.price, tapWhenOff: false, sound: 'coin',
        onTap: () => {
          E.buyItem(s, id);
          store.persist();
        },
      });
      y += rowH;
    });
    if (s.stardust < 30) {
      ui.button('shop-altar', 8, y + 2, W - 16, 30, { label: '星砂不够了?去步虚台兑换', kind: 'jade', onTap: () => game.go('altar') });
    }
    ui.header('驿铺', () => game.go('hub'), s.stardust);
  }
}

class Settings {
  draw() {
    const s = store.get();
    ui.alpha(0.6);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    const w = W - 32, x = 16, rowsH = 28 * 6 + 72;
    const y = Math.round((H - rowsH) / 2);
    ui.panel(x, y, w, rowsH);
    ui.text('设置', W / 2, y + 10, UI.gold, { align: 'c' });
    let cy = y + 30;
    const toggle = (id, label, key) => {
      ui.button(id, x + 12, cy, w - 24, 25, {
        label: `${label}:${s.settings[key] ? '开' : '关'}`, kind: s.settings[key] ? 'jade' : 'normal',
        onTap: () => {
          s.settings[key] = !s.settings[key];
          audio.configure(s.settings);
          store.persist();
        },
      });
      cy += 28;
    };
    toggle('set-bgm', '音乐', 'bgm');
    toggle('set-sfx', '音效', 'sfx');
    toggle('set-vibe', '震动', 'vibrate');
    ui.button('set-privacy', x + 12, cy, w - 24, 25, { label: '隐私保护指引', onTap: () => steps.openPrivacy() });
    cy += 28;
    ui.button('set-werun', x + 12, cy, w - 24, 25, { label: '微信运动授权管理', onTap: () => steps.openSettings() });
    cy += 28;
    ui.button('set-reset', x + 12, cy, w - 24, 25, {
      label: '清除本机存档', kind: 'danger',
      onTap: () => O.modal({
        title: '清除存档?', text: '本机的进度和星砂将被清除且无法恢复。已经兑换过的步数不能再次兑换。',
        buttons: [{ label: '取消' }, { label: '清除', kind: 'danger', onTap: () => { store.reset(); game.stack = []; game.go('title', null, true); } }],
      }),
    });
    cy += 30;
    ui.text('字体:Fusion Pixel Font (OFL 1.1)', W / 2, cy, UI.faint, { align: 'c' });
    ui.button('set-close', x + 12, y + rowsH - 26 + 0, w - 24, 22, { label: '关闭', kind: 'ghost', sound: 'back', onTap: () => game.pop(this) });
  }
}

game.register('hub', Hub);
game.register('altar', Altar);
game.register('shop', Shop);
game.register('settings', Settings);
