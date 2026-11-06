// Wangxing Station, the player's home base, painted as a diorama. Every building opens an activity, and
// the garden, disc and decorations in the picture reflect what is really going on.
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
const Dispatch = require('../systems/dispatch.js');
const Garden = require('../systems/garden.js');
const steps = require('../systems/steps.js');
const O = require('./overlays.js');
const nav = require('./nav.js');
const { drawDisc, drawDipper } = require('./title.js');
const { Particles } = require('../core/fx.js');
const { UI } = require('../core/palette.js');

const { W, H } = D;

class Station {
  constructor() {
    this.h = H - nav.height();
    this.L = art.stationLayout(W, this.h);
    this.fx = new Particles();
    this.acc = 0;
  }
  enter() {
    audio.bgm('road');
    store.push();
  }
  update(dt) {
    this.fx.update(dt);
    this.acc += dt;
    if (this.acc > 0.3) {
      this.acc = 0;
      const f = this.L.furnace;
      this.fx.add({ x: f.x + (Math.random() - 0.5) * 8, y: f.y - 30, vx: 3 + Math.random() * 3, vy: -9, life: 2.2, c: Math.random() > 0.3 ? '#6a6088' : '#ec7a4e', s: 2 });
      const a = this.L.altar;
      this.fx.add({ x: a.x + (Math.random() - 0.5) * 18, y: a.y - 22, vx: 0, vy: -10 - Math.random() * 7, life: 1.1, c: Math.random() > 0.5 ? '#f7dd7a' : '#6fb0e0', s: 1 });
    }
  }
  plaque(id, label, x, y, hitBox, o) {
    o = o || {};
    const locked = o.locked;
    const tw = ui.font.width(label) + 10;
    const px = Math.max(2, Math.min(W - tw - 2, Math.round(x - tw / 2)));
    ui.rect(px + 1, y, tw - 2, 15, UI.ink);
    ui.rect(px, y + 1, tw, 13, UI.ink);
    ui.rect(px + 1, y + 1, tw - 2, 13, locked ? '#2a2542' : '#6c3f26');
    ui.rect(px + 1, y + 1, tw - 2, 1, locked ? '#3a3350' : '#c98f55');
    ui.text(label, px + 5, y + 2, locked ? UI.faint : UI.text);
    if (o.badge) ui.dot(px + tw - 5, y - 3);
    ui.hit(id, hitBox[0], hitBox[1], hitBox[2], hitBox[3], o.onTap, { label });
  }
  drawCrops(s, now) {
    const g = this.L.garden;
    const n = Garden.plotCount(s);
    const cell = g.cell;
    for (let i = 0; i < 9; i++) {
      const c = i % 3, r = Math.floor(i / 3);
      const x = g.x + c * cell, y = g.y + r * cell;
      const p = s.garden.plots[i];
      if (i >= n) {
        ui.alpha(0.55);
        ui.rect(x + 2, y + 2, cell - 4, cell - 4, '#14121f');
        ui.alpha(1);
      } else if (p) {
        const st = Garden.stage(p, now);
        ui.img(art.crop(p.el, st), x + 5, y + 3);
        if (st === 2 && Math.floor(game.t * 2 + i) % 3 === 0) ui.rect(x + 18, y + 4, 2, 2, '#f7dd7a');
      }
    }
  }
  draw() {
    const s = store.get();
    const now = clock.now();
    const L = this.L;
    ui.ctx.drawImage(art.hub(W, this.h), 0, 0);
    const lit = E.starsLit(s);
    drawDipper(W * 0.62, D.contentTop + 8, Math.min(W * 0.4, L.gy * 0.5), lit);
    if (s.progress.ending === 'turn' || s.wardrobe.decor.decor_peach) ui.img(art.peach(), L.hall.x - 92, L.hall.y - 62);
    drawDisc(L.altar.x, L.altar.y - 30, 10, game.t, Math.min(7, lit));
    if (s.wardrobe.decor.decor_banner) {
      [L.hall.x - 56, L.hall.x + 56].forEach((x, i) => {
        ui.rect(x, L.hall.y - 62, 1, 58, '#4a2c28');
        const wob = Math.round(Math.sin(game.t * 3 + i));
        ui.rect(x + 1, L.hall.y - 62, 9, 14 + wob, '#c8402f');
        ui.rect(x + 1, L.hall.y - 62, 9, 2, '#f7dd7a');
      });
    }
    if (s.wardrobe.decor.decor_lanterns) {
      for (let i = 0; i < 7; i++) {
        const x = L.hall.x - 48 + i * 16, y = L.hall.y - 42 + (i % 2);
        ui.rect(x, y, 1, 3, '#14121f');
        ui.rect(x - 2, y + 3, 5, 5, Math.floor(game.t * 2 + i) % 4 ? '#c8402f' : '#ec7a4e');
        ui.rect(x - 1, y + 4, 3, 3, '#f7dd7a');
      }
    }
    this.drawCrops(s, now);
    const hero = art.hero('cen', Math.floor(game.t * 1.6) % 2 ? 'idle1' : 'idle0', s.heroes.cen.outfit);
    ui.img(hero, L.hall.x + 28 - hero.w / 2, L.hall.y + 50 - hero.h);
    this.fx.draw();
    ui.header('望星驿', null, s.stardust, s.coin);

    // A star letter drifts over the station once the sky has started writing.
    const lx = Math.round(W * 0.2), ly = D.contentTop + 22;
    if (E.unlocked(s, 'gacha')) ui.img(art.icon('letter'), lx - 8, ly + Math.round(Math.sin(game.t * 1.5) * 2));
    const locked = (f) => !E.unlocked(s, f);
    const lockNote = (f) => () => {
      const u = W_.UNLOCKS[f];
      ui.toast(`${u.name}还没开张,沿着路再走一走`);
    };
    const open = (f, scene) => (locked(f) ? lockNote(f) : () => game.go(scene));
    const a = L.altar, h = L.hall, fu = L.furnace, st = L.stable, g = L.garden, sh = L.shop, m = L.mail;
    this.plaque('st-altar', '步虚台', a.x, a.y - 58, [a.x - 24, a.y - 58, 48, 58], { onTap: () => nav.go('altar') });
    this.plaque('st-wardrobe', '衣橱', h.x - 34, h.y - 15, [h.x - 56, h.y - 70, 60, 70], { onTap: () => game.go('wardrobe') });
    this.plaque('st-letters', '信匣', m.x, m.y - 44, [m.x - 14, m.y - 44, 28, 44], { badge: s.letters.unread > 0, onTap: () => game.go('letters') });
    this.plaque('st-furnace', '星炉', fu.x, fu.y - 56, [fu.x - 34, fu.y - 56, 68, 58], {
      locked: locked('furnace'), badge: !locked('furnace') && s.furnace.jobs.some((j) => j.doneAt <= now), onTap: open('furnace', 'furnace'),
    });
    this.plaque('st-dispatch', '驿传', st.x, st.y - 54, [st.x - 38, st.y - 54, 76, 56], {
      locked: locked('dispatch'), badge: !locked('dispatch') && Dispatch.ready(s, now) > 0, onTap: open('dispatch', 'dispatch'),
    });
    this.plaque('st-garden', '药圃', g.x + g.cell * 1.5, g.y - 16, [g.x - 4, g.y - 16, g.cell * 3 + 8, g.cell * 3 + 18], {
      locked: locked('garden'), badge: !locked('garden') && Garden.ripeCount(s, now) > 0, onTap: open('garden', 'garden'),
    });
    this.plaque('st-shop', '驿铺', sh.x, sh.y - 58, [sh.x - 30, sh.y - 58, 60, 60], { locked: locked('shop'), onTap: open('shop', 'shop') });
    if (E.unlocked(s, 'gacha')) {
      this.plaque('st-gacha', '星笺', lx, ly + 18, [lx - 22, ly - 4, 44, 38], { badge: s.gacha.tickets > 0, onTap: () => game.go('gacha', { from: 'station' }) });
    }
    ui.button('st-settings', 5, this.h - 26, 40, 22, { label: '设置', kind: 'ghost', onTap: () => game.push('settings') });
    nav.draw('station');
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
    ui.text('老驿丞:路上攒的铜钱,花着才踏实。', W / 2, y + 11, UI.peach, { align: 'c' });
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
        label: ui.num(it.price), icon: 'coin', kind: s.coin >= it.price ? 'primary' : 'normal', disabled: s.coin < it.price, tapWhenOff: false, sound: 'coin',
        onTap: () => {
          E.buyItem(s, id);
          store.persist();
        },
      });
      y += rowH;
    });
    ui.header('驿铺', () => game.go('station'), s.stardust, s.coin);
  }
}

class Settings {
  draw() {
    const s = store.get();
    ui.alpha(0.6);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    const w = W - 32, x = 16, rowsH = 28 * 8 + 111;
    const y = Math.round((H - rowsH) / 2);
    ui.panel(x, y, w, rowsH);
    ui.text('设置', W / 2, y + 10, UI.gold, { align: 'c' });
    let cy = y + 30;
    const toggle = (id, label, key, after) => {
      ui.button(id, x + 12, cy, w - 24, 25, {
        label: `${label}:${s.settings[key] ? '开' : '关'}`, kind: s.settings[key] ? 'jade' : 'normal',
        onTap: () => {
          s.settings[key] = !s.settings[key];
          audio.configure(s.settings);
          if (after) after();
          store.persist();
        },
      });
      cy += 28;
    };
    toggle('set-bgm', '音乐', 'bgm');
    toggle('set-sfx', '音效', 'sfx');
    toggle('set-vibe', '震动', 'vibrate');
    toggle('set-smooth', '流畅模式(更耗电)', 'smooth', () => game.applyPower && game.applyPower());
    toggle('set-keepon', '放着看时屏幕常亮', 'keepOn', () => game.applyPower && game.applyPower());
    ui.button('set-privacy', x + 12, cy, w - 24, 25, { label: '隐私保护指引', onTap: () => steps.openPrivacy() });
    cy += 28;
    ui.button('set-werun', x + 12, cy, w - 24, 25, { label: '微信运动授权管理', onTap: () => steps.openSettings() });
    cy += 28;
    ui.button('set-reset', x + 12, cy, w - 24, 25, {
      label: '清除本机存档', kind: 'danger',
      onTap: () => O.modal({
        title: '清除存档?', text: '本机的进度将被清除且无法恢复。已经兑换过的步数不能再次兑换。',
        buttons: [{ label: '取消' }, { label: '清除', kind: 'danger', onTap: () => { store.reset(); audio.configure(store.get().settings); game.stack = []; game.go('title', null, true); } }],
      }),
    });
    cy += 30;
    ui.text('字体:Fusion Pixel Font (OFL 1.1)', W / 2, cy, UI.faint, { align: 'c' });
    // What this phone ended up with, for working out why a screen looks wrong.
    const di = D.info;
    const filter = di.smoothing === null ? '?' : di.smoothing ? 'smooth' : 'nearest';
    ui.text(`${di.mode}${di.why ? ':' + di.why : ''} x${D.scale} ${W}x${H}`, W / 2, cy + 13, UI.faint, { align: 'c' });
    ui.text(`${di.physW}x${di.physH} pr${di.pr} ${filter}`, W / 2, cy + 26, UI.faint, { align: 'c' });
    ui.text(audio.report(), W / 2, cy + 39, UI.faint, { align: 'c' });
    ui.button('set-close', x + 12, y + rowsH - 26, w - 24, 22, { label: '关闭', kind: 'ghost', sound: 'back', onTap: () => game.pop(this) });
  }
}

game.register('station', Station);
game.register('shop', Shop);
game.register('settings', Settings);
