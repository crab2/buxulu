// Station activities: courier errands, the herb garden and kitchen, the letter box and the wardrobe.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const audio = require('../core/audio.js');
const clock = require('../core/clock.js');
const store = require('../systems/store.js');
const G = require('../data/game.js');
const W_ = require('../data/world.js');
const Idle = require('../systems/idle.js');
const Dispatch = require('../systems/dispatch.js');
const Garden = require('../systems/garden.js');
const Boosts = require('../systems/boosts.js');
const Daily = require('../systems/daily.js');
const Wardrobe = require('../systems/wardrobe.js');
const O = require('./overlays.js');
const { UI } = require('../core/palette.js');
const { CHAPTERS } = require('../data/chapters.js');

const { W, H } = D;

const herbRows = (herbs) => Object.keys(herbs || {}).map((k) => ({ icon: 'herb_' + k, label: W_.CROPS[k].name, value: '×' + herbs[k], valueColor: G.ELEMENTS[k].css }));

class Scroller {
  constructor() {
    this.scroll = 0;
    this.maxScroll = 0;
  }
  onDrag(dx, dy) {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll - dy));
  }
  fit(y, bottom) {
    this.maxScroll = Math.max(0, y + this.scroll - bottom);
    this.scroll = Math.min(this.scroll, this.maxScroll);
  }
}

// ---- Courier errands ----
class DispatchScene extends Scroller {
  enter() {
    const s = store.get();
    Dispatch.refill(s, clock.now());
    store.persist();
    audio.bgm('road');
  }
  claim() {
    const s = store.get();
    const r = Dispatch.claimAll(s, clock.now());
    if (!r.n) return;
    Dispatch.refill(s, clock.now());
    store.persist();
    Idle.nudge(s);
    audio.sfx('coin');
    const rows = [{ icon: 'coin', label: '铜钱', value: '+' + ui.num(r.coin) }, { icon: 'xp', label: '阅历', value: '+' + ui.num(r.xp), valueColor: UI.jade }];
    if (r.dust) rows.push({ icon: 'dust', label: '星砂', value: '+' + r.dust, valueColor: UI.blue });
    herbRows(r.herbs).forEach((x) => rows.push(x));
    Object.keys(r.items).forEach((k) => rows.push({ icon: G.ITEMS[k].icon, label: G.ITEMS[k].name, value: '×' + r.items[k] }));
    r.spirits.forEach((id) => rows.push({ icon: 'spirit', label: G.MONSTERS[id].name + '之灵', value: '×1', valueColor: UI.violet }));
    r.letters.forEach((l) => rows.push({ icon: 'letter', label: '有你的信:' + W_.LETTERS[l].from, color: UI.peach }));
    O.modal({ title: `${r.n} 封信送到了`, rows, buttons: [{ label: '收下', kind: 'primary' }] });
  }
  draw() {
    const s = store.get();
    const now = clock.now();
    ui.img(art.battleBg('loess', W, H), 0, 0);
    ui.alpha(0.6);
    ui.rect(0, 0, W, H, '#07061a');
    ui.alpha(1);
    const top = D.contentTop;
    const bottom = H - D.safeBottom;
    ui.setClip(0, top, W, bottom - top);
    let y = top - Math.round(this.scroll);
    const m = 8, w = W - m * 2;
    const slots = Dispatch.slots(s);
    const ready = Dispatch.ready(s, now);
    ui.text(`在途 ${s.dispatch.active.length} / ${slots}`, m + 2, y + 3, UI.gold, { outline: true });
    ui.text('人不在,信也照送', W - m - 2, y + 3, UI.dim, { align: 'r', outline: true });
    y += 18;
    s.dispatch.active.forEach((a, i) => {
      const c = W_.COURIERS.find((k) => k.id === a.courier);
      const done = a.doneAt <= now;
      ui.panel(m, y, w, 48);
      ui.img(art.courier(c.id, c.head), m + 8, y + 13);
      ui.text(a.title, m + 32, y + 7, UI.text);
      const total = a.mins * 60000;
      ui.bar(m + 32, y + 24, w - 104, 6, done ? 1 : 1 - (a.doneAt - now) / total, done ? '#7fd1a4' : '#e8b33a');
      ui.text(done ? '已送达' : `还要 ${ui.dur((a.doneAt - now) / 1000)}`, m + 32, y + 33, done ? UI.jade : UI.dim);
      if (!done) {
        const cost = Boosts.rushCost(a.doneAt - now);
        ui.button(`rush-${i}`, W - m - 64, y + 10, 56, 28, {
          icon: 'dust', label: ui.num(cost), kind: s.stardust >= cost ? 'jade' : 'normal', disabled: s.stardust < cost, sound: 'star',
          onTap: () => {
            Dispatch.rush(s, i, now);
            store.persist();
          },
        });
      }
      y += 52;
    });
    for (let i = s.dispatch.active.length; i < slots; i++) {
      ui.panel(m, y, w, 28, { fill: '#181527', plain: true });
      ui.text('空闲的驿卒,等着派活', W / 2, y + 8, UI.faint, { align: 'c' });
      y += 32;
    }
    if (ready) {
      ui.button('dispatch-claim', m, y, w, 30, { label: `收下 ${ready} 封回信`, kind: 'primary', sound: null, onTap: () => this.claim() });
      y += 34;
    }
    y += 4;
    ui.text('待送的信', m + 2, y + 3, UI.gold, { outline: true });
    y += 18;
    s.dispatch.board.forEach((job) => {
      ui.panel(m, y, w, 40);
      ui.img(art.icon('letter'), m + 8, y + 12);
      ui.text(job.title, m + 30, y + 7, UI.text);
      ui.text(`${job.label} ${ui.dur(job.mins * 60)} · ${CHAPTERS[job.ci].name}`, m + 30, y + 21, UI.dim);
      ui.text(G.ELEMENTS[job.el].name, W - m - 66, y + 7, G.ELEMENTS[job.el].css, { align: 'r' });
      const full = s.dispatch.active.length >= slots;
      ui.button(`job-${job.id}`, W - m - 60, y + 8, 52, 24, {
        label: '派人', kind: full ? 'normal' : 'primary', disabled: full,
        onTap: () => game.push('courierpick', { job }),
      });
      y += 44;
    });
    if (!s.dispatch.board.length) {
      ui.text('今天的信都送出去了。过一会儿还会有。', W / 2, y + 6, UI.dim, { align: 'c', outline: true });
      y += 24;
    }
    this.fit(y + 8, bottom);
    ui.endClip();
    ui.rect(0, 0, W, top - 1, '#14121f');
    ui.header('驿传', () => game.go('station'), s.stardust, s.coin);
  }
}

class CourierPick extends Scroller {
  constructor(p) {
    super();
    this.job = p.job;
  }
  send(c) {
    const s = store.get();
    const now = clock.now();
    if (!Dispatch.send(s, this.job.id, c.id, now)) return;
    Daily.mark(s, 'dispatch', Idle.dayOf(now));
    store.persist();
    audio.sfx('coin');
    game.pop(this);
  }
  draw() {
    const s = store.get();
    ui.alpha(0.65);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    // The panel fits the roster, and scrolls only if the roster outgrows the screen.
    const list = Dispatch.roster(s);
    const room = H - D.contentTop - D.safeBottom - 12;
    const h = Math.min(room, 78 + list.length * 49);
    const x = 8, w = W - 16, y = Math.round((H - h) / 2);
    ui.panel(x, y, w, h);
    ui.text(this.job.title, x + 12, y + 9, UI.gold);
    ui.text(`${G.ELEMENTS[this.job.el].name} · ${ui.dur(this.job.mins * 60)}`, x + w - 12, y + 9, G.ELEMENTS[this.job.el].css, { align: 'r' });
    ui.text('属性相合的驿卒,酬劳 +30%', x + 12, y + 24, UI.dim);
    const listY = y + 40, listH = h - 74;
    ui.setClip(x + 4, listY, w - 8, listH);
    let ry = listY - Math.round(this.scroll);
    list.forEach((c) => {
      const busy = Dispatch.busy(s, c.id);
      const pv = Dispatch.preview(s, this.job, c);
      ui.button('courier-' + c.id, x + 8, ry, w - 16, 46, { label: '', kind: busy ? 'off' : pv.match ? 'jade' : 'normal', disabled: busy, onTap: () => this.send(c) });
      ui.img(art.courier(c.id, c.head), x + 13, ry + 13);
      ui.text(c.name, x + 36, ry + 6, busy ? UI.faint : UI.text);
      ui.text(G.ELEMENTS[c.el].name, x + 40 + ui.font.width(c.name), ry + 6, G.ELEMENTS[c.el].css);
      if (pv.match && !busy) ui.text('相合', x + w - 14, ry + 6, UI.gold, { align: 'r' });
      if (busy) ui.text('在路上', x + w - 14, ry + 6, UI.faint, { align: 'r' });
      ui.text(c.desc, x + 36, ry + 19, busy ? UI.faint : UI.dim);
      ui.text(`${ui.dur(pv.mins * 60)} · 铜钱 ${ui.num(pv.reward.coin)}`, x + 36, ry + 31, busy ? UI.faint : UI.text);
      ry += 49;
    });
    this.fit(ry, listY + listH);
    ui.endClip();
    ui.button('courier-close', x + 8, y + h - 30, w - 16, 24, { label: '再想想', kind: 'ghost', sound: 'back', onTap: () => game.pop(this) });
  }
}

// ---- Garden and kitchen ----
class GardenScene extends Scroller {
  constructor() {
    super();
    this.tab = 'garden';
  }
  enter() {
    audio.bgm('road');
  }
  harvest() {
    const s = store.get();
    const now = clock.now();
    const r = Garden.harvest(s, now);
    if (!r.n) return;
    Daily.mark(s, 'garden', Idle.dayOf(now));
    store.persist();
    audio.sfx('coin');
    ui.toast('收获 ' + Object.keys(r.gained).map((k) => `${W_.CROPS[k].name}×${r.gained[k]}`).join(' '), 1.8);
  }
  tapPlot(i) {
    const s = store.get();
    const now = clock.now();
    if (i >= Garden.plotCount(s)) return ui.toast('这块地还荒着。每走完一片地方,就能多开垦一块。');
    const p = s.garden.plots[i];
    if (!p) return game.push('seedpick', { plot: i });
    if (p.doneAt <= now) return this.harvest();
    return ui.toast(`${W_.CROPS[p.el].name}:还要 ${ui.dur((p.doneAt - now) / 1000)}`, 1.4);
  }
  drawGarden(s, y, now) {
    const m = 8, w = W - m * 2;
    const cell = Math.floor((w - 12) / 3), ch = 58;
    ui.panel(m, y, w, ch * 3 + 14, { fill: '#2a2018' });
    const n = Garden.plotCount(s);
    for (let i = 0; i < 9; i++) {
      const cx = m + 6 + (i % 3) * cell, cy = y + 7 + Math.floor(i / 3) * ch;
      const p = s.garden.plots[i];
      ui.rect(cx + 1, cy + 1, cell - 2, ch - 2, i < n ? '#4a2e22' : '#241c1c');
      if (i < n) {
        ui.rect(cx + 1, cy + 1, cell - 2, 1, '#6a4632');
        for (let k = 6; k < ch - 4; k += 8) ui.rect(cx + 3, cy + k, cell - 6, 1, '#3a2219');
      }
      if (i >= n) ui.img(art.icon('lock'), cx + cell / 2 - 8, cy + ch / 2 - 8);
      else if (p) {
        const st = Garden.stage(p, now);
        ui.imgScaled(art.crop(p.el, st), cx + cell / 2 - 16, cy + 2, 32, 36);
        const bonus = Garden.bonusOf(s, i);
        if (st === 2) ui.text(`×${Garden.yieldOf(s, i)}`, cx + cell - 5, cy + ch - 15, UI.gold, { align: 'r', outline: true });
        else ui.text(ui.dur((p.doneAt - now) / 1000), cx + cell / 2, cy + ch - 15, UI.text, { align: 'c', outline: true });
        if (bonus > 0) ui.rect(cx + 4, cy + 4, 4, 4, '#7fd1a4');
        if (bonus < 0) ui.rect(cx + 4, cy + 4, 4, 4, '#ec7a4e');
      } else ui.text('种', cx + cell / 2, cy + ch / 2 - 6, UI.faint, { align: 'c' });
      ui.hit('plot-' + i, cx, cy, cell, ch, () => this.tapPlot(i), { sound: null });
    }
    y += ch * 3 + 18;
    const ripe = Garden.ripeCount(s, now);
    const bw = Math.floor((w - 8) / 3);
    ui.button('garden-harvest', m, y, bw, 32, { label: ripe ? `收获 ${ripe}` : '收获', kind: ripe ? 'primary' : 'normal', disabled: !ripe, sound: null, onTap: () => this.harvest() });
    const canW = Garden.canWater(s, now);
    const growing = Garden.growingLeft(s, now) > 0;
    ui.button('garden-water', m + bw + 4, y, bw, 32, {
      icon: 'drop', label: canW ? '浇水' : ui.dur((s.garden.water - now) / 1000), kind: canW && growing ? 'jade' : 'normal', disabled: !canW || !growing,
      onTap: () => {
        Garden.water(s, now);
        store.persist();
        ui.toast('都快了半个时辰', 1.2);
      },
    });
    const cost = Garden.rushCost(s, now);
    ui.button('garden-rush', m + (bw + 4) * 2, y, bw, 32, {
      icon: 'dust', label: cost ? ui.num(cost) : '星露', kind: cost && s.stardust >= cost ? 'jade' : 'normal', disabled: !cost || s.stardust < cost, sound: 'star',
      onTap: () => {
        Garden.rush(s, now);
        store.persist();
      },
    });
    y += 38;
    ui.para('相邻作物讲究五行:每个相生的邻居(绿点)收成 +25%,每个相克的邻居(红点)收成 -25%。', m + 2, y, w - 4, UI.text, { outline: true });
    y += 34;
    y = this.drawHerbs(s, y);
    return y;
  }
  drawHerbs(s, y) {
    const m = 8, w = W - m * 2;
    ui.panel(m, y, w, 30);
    const cw = Math.floor((w - 8) / 5);
    W_.CROP_ORDER.forEach((el, i) => {
      ui.img(art.icon('herb_' + el), m + 5 + i * cw, y + 7);
      ui.text(ui.num(s.herbs[el] || 0), m + 22 + i * cw, y + 10, G.ELEMENTS[el].css);
    });
    return y + 34;
  }
  drawKitchen(s, y) {
    const m = 8, w = W - m * 2;
    y = this.drawHerbs(s, y);
    ui.text('灵膳效果持续 8 小时,同时只享用一道', W / 2, y + 2, UI.text, { align: 'c', outline: true });
    y += 18;
    if (s.idle.meal && s.idle.mealSecs > 0) {
      const meal = W_.MEALS[s.idle.meal];
      ui.panel(m, y, w, 36, { fill: '#2a1a28' });
      ui.img(art.icon(meal.icon), m + 8, y + 10);
      ui.text(`正在享用 ${meal.name}:${meal.desc}`, m + 28, y + 5, UI.peach);
      ui.text(`还有 ${ui.dur(s.idle.mealSecs)}`, m + 28, y + 19, UI.dim);
      y += 40;
    }
    Object.keys(W_.RECIPES).forEach((id) => {
      const r = W_.RECIPES[id];
      const can = Garden.canCook(s, id);
      ui.panel(m, y, w, 42);
      ui.img(art.icon(r.icon), m + 8, y + 13);
      ui.text(r.name, m + 28, y + 7, UI.text);
      const desc = r.meal ? W_.MEALS[r.meal].desc : `得 ${Object.values(r.gives)[0]} 份`;
      ui.text(desc, m + 28 + ui.font.width(r.name) + 6, y + 7, r.meal ? UI.peach : UI.dim);
      let hx = m + 28;
      Object.keys(r.herbs).forEach((el) => {
        ui.img(art.icon('herb_' + el), hx, y + 19);
        const lack = (s.herbs[el] || 0) < r.herbs[el];
        ui.text(String(r.herbs[el]), hx + 17, y + 22, lack ? UI.red : UI.text);
        hx += 32;
      });
      ui.button('cook-' + id, W - m - 58, y + 9, 50, 24, {
        label: '烹制', kind: can ? 'primary' : 'normal', disabled: !can, sound: 'level',
        onTap: () => {
          const replacing = r.meal && s.idle.mealSecs > 0;
          const go = () => {
            Garden.cook(s, id);
            store.persist();
            ui.toast(r.meal ? `${r.name}下肚,${W_.MEALS[r.meal].desc}` : `做好了:${r.name}`, 1.4);
          };
          if (replacing) O.modal({ title: '换一道菜?', text: '正在享用的灵膳会被替换。', buttons: [{ label: '算了' }, { label: '换', kind: 'primary', onTap: go }] });
          else go();
        },
      });
      y += 46;
    });
    return y;
  }
  draw() {
    const s = store.get();
    const now = clock.now();
    ui.img(art.battleBg('spring', W, H), 0, 0);
    ui.alpha(0.42);
    ui.rect(0, 0, W, H, '#07061a');
    ui.alpha(1);
    const top = D.contentTop;
    const bottom = H - D.safeBottom;
    const tw = Math.floor((W - 20) / 2);
    ui.button('tab-garden', 8, top, tw, 24, { label: '药圃', kind: this.tab === 'garden' ? 'primary' : 'normal', onTap: () => { this.tab = 'garden'; this.scroll = 0; } });
    ui.button('tab-kitchen', 12 + tw, top, tw, 24, { label: '膳房', kind: this.tab === 'kitchen' ? 'primary' : 'normal', onTap: () => { this.tab = 'kitchen'; this.scroll = 0; } });
    const y0 = top + 28;
    ui.setClip(0, y0, W, bottom - y0);
    let y = y0 - Math.round(this.scroll);
    y = this.tab === 'garden' ? this.drawGarden(s, y, now) : this.drawKitchen(s, y);
    this.fit(y + 6, bottom);
    ui.endClip();
    ui.rect(0, 0, W, top - 1, '#14121f');
    ui.header('药圃', () => game.go('station'), s.stardust, s.coin);
  }
}

class SeedPick extends Scroller {
  constructor(p) {
    super();
    this.plot = p.plot;
  }
  plant(el) {
    const s = store.get();
    Garden.plant(s, this.plot, el, clock.now());
    store.persist();
    audio.sfx('tap');
    game.pop(this);
  }
  // The yield this seed would have, given what is already planted around it.
  preview(s, el) {
    const had = s.garden.plots[this.plot];
    s.garden.plots[this.plot] = { el, doneAt: 0, at: 0 };
    const y = Garden.yieldOf(s, this.plot);
    const b = Garden.bonusOf(s, this.plot);
    s.garden.plots[this.plot] = had || null;
    return { y, b };
  }
  draw() {
    const s = store.get();
    ui.alpha(0.65);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    const rows = W_.CROP_ORDER.length;
    const w = W - 24, h = rows * 44 + 66, x = 12, y = Math.round((H - h) / 2);
    ui.panel(x, y, w, h);
    ui.text('种点什么', W / 2, y + 9, UI.gold, { align: 'c' });
    let ry = y + 28;
    W_.CROP_ORDER.forEach((el) => {
      const c = W_.CROPS[el];
      const pv = this.preview(s, el);
      ui.button('seed-' + el, x + 8, ry, w - 16, 40, { label: '', kind: pv.b > 0 ? 'jade' : 'normal', onTap: () => this.plant(el) });
      ui.img(art.icon('herb_' + el), x + 14, ry + 11);
      ui.text(c.name, x + 36, ry + 6, UI.text);
      ui.text(G.ELEMENTS[el].name, x + 40 + ui.font.width(c.name), ry + 6, G.ELEMENTS[el].css);
      ui.text(ui.dur(c.mins * 60), x + 36, ry + 20, UI.dim);
      const tag = pv.b > 0 ? '邻居相生' : pv.b < 0 ? '邻居相克' : '';
      if (tag) ui.text(tag, x + w - 14, ry + 6, pv.b > 0 ? UI.gold : UI.red, { align: 'r' });
      ui.text(`可收 ${pv.y}`, x + w - 14, ry + 20, UI.text, { align: 'r' });
      ry += 44;
    });
    ui.button('seed-close', x + 8, y + h - 30, w - 16, 24, { label: '再想想', kind: 'ghost', sound: 'back', onTap: () => game.pop(this) });
  }
}

// ---- Letters ----
class Letters extends Scroller {
  enter() {
    const s = store.get();
    s.letters.unread = 0;
    store.persist();
    audio.bgm('road');
  }
  draw() {
    const s = store.get();
    ui.img(art.battleBg('autumn', W, H), 0, 0);
    ui.alpha(0.6);
    ui.rect(0, 0, W, H, '#07061a');
    ui.alpha(1);
    const top = D.contentTop, bottom = H - D.safeBottom;
    ui.setClip(0, top, W, bottom - top);
    let y = top - Math.round(this.scroll);
    const m = 8, w = W - m * 2;
    if (!s.letters.got.length) {
      ui.panel(m, y, w, 70);
      ui.para('信匣还是空的。派驿卒多跑几趟,他们回来时常常带着别人的信。', m + 12, y + 12, w - 24, UI.dim);
      y += 74;
    }
    s.letters.got.slice().reverse().forEach((k) => {
      const l = W_.LETTERS[k];
      const h = ui.paraHeight(l.text, w - 24) + 32;
      ui.panel(m, y, w, h, { fill: '#2a2230' });
      ui.img(art.icon('letter'), m + 8, y + 7);
      ui.text(l.from, m + 28, y + 9, UI.gold);
      ui.para(l.text, m + 12, y + 26, w - 24, UI.text);
      y += h + 4;
    });
    const left = W_.LETTERS.length - s.letters.got.length;
    if (left > 0) {
      ui.text(`还有 ${left} 封信在路上`, W / 2, y + 4, UI.dim, { align: 'c', outline: true });
      y += 20;
    }
    this.fit(y + 6, bottom);
    ui.endClip();
    ui.rect(0, 0, W, top - 1, '#14121f');
    ui.header('信匣', () => game.go('station'), s.stardust, s.coin);
  }
}

// ---- Wardrobe ----
class WardrobeScene extends Scroller {
  enter() {
    audio.bgm('road');
  }
  action(s, id, c) {
    if (Wardrobe.owned(s, id)) {
      Wardrobe.toggle(s, id);
      store.persist();
      return;
    }
    if (c.cost && Wardrobe.buy(s, id)) {
      Wardrobe.toggle(s, id);
      store.persist();
      audio.sfx('star');
    }
  }
  drawRow(s, id, c, y, m, w) {
    const have = Wardrobe.owned(s, id);
    const worn = have && Wardrobe.worn(s, id);
    ui.panel(m, y, w, 60, { fill: worn ? '#22303a' : UI.panel });
    if (c.kind === 'outfit') {
      const a = art.hero(c.hero, Math.floor(game.t * 1.6) % 2 ? 'idle1' : 'idle0', id);
      ui.img(a, m + 24 - a.w / 2, y + 60 - a.h);
    } else if (c.kind === 'pet') ui.img(art.pet(c.pet, Math.floor(game.t * 3) % 2), m + 10, y + 22);
    else ui.img(art.icon(c.icon), m + 16, y + 22);
    const tx = m + 46;
    ui.text(c.name, tx, y + 10, have ? UI.text : UI.dim);
    const kindName = c.kind === 'outfit' ? `${G.HEROES[c.hero].name}的衣裳` : c.kind === 'pet' ? '路上的伙伴' : '驿站的装点';
    ui.text(kindName, tx, y + 24, UI.dim);
    let need = '';
    if (!have && c.steps) need = `累计走满 ${ui.fmt(c.steps)} 步`;
    if (!have && c.laps) need = `云游走满 ${c.laps} 圈`;
    if (need) ui.text(need, tx, y + 38, UI.faint);
    if (have) {
      ui.button('wear-' + id, W - m - 60, y + 17, 52, 26, { label: worn ? '脱下' : '换上', kind: worn ? 'normal' : 'jade', onTap: () => this.action(s, id, c) });
    } else if (c.cost) {
      ui.button('wear-' + id, W - m - 66, y + 17, 58, 26, { label: ui.num(c.cost), icon: 'dust', kind: s.stardust >= c.cost ? 'primary' : 'normal', disabled: s.stardust < c.cost, onTap: () => this.action(s, id, c) });
    }
  }
  draw() {
    const s = store.get();
    ui.rect(0, 0, W, H, '#14121f');
    const top = D.contentTop, bottom = H - D.safeBottom;
    ui.setClip(0, top, W, bottom - top);
    let y = top - Math.round(this.scroll);
    const m = 8, w = W - m * 2;
    ui.para('这里的东西只管好看,不影响强弱。', m + 2, y + 2, w - 4, UI.dim);
    y += 20;
    Object.keys(W_.COSMETICS).forEach((id) => {
      const c = W_.COSMETICS[id];
      if (c.kind === 'outfit' && !s.heroes[c.hero].joined) return;
      this.drawRow(s, id, c, y, m, w);
      y += 64;
    });
    this.fit(y + 6, bottom);
    ui.endClip();
    ui.rect(0, 0, W, top - 1, '#14121f');
    ui.header('衣橱', () => game.go('station'), s.stardust, s.coin);
  }
}

game.register('dispatch', DispatchScene);
game.register('courierpick', CourierPick);
game.register('garden', GardenScene);
game.register('seedpick', SeedPick);
game.register('letters', Letters);
game.register('wardrobe', WardrobeScene);

