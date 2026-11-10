// Party management (equipment, training, relics, skills) and the star furnace.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const audio = require('../core/audio.js');
const store = require('../systems/store.js');
const E = require('../systems/economy.js');
const G = require('../data/game.js');
const P = require('../systems/party.js');
const Skills = require('../systems/skills.js');
const O = require('./overlays.js');
const nav = require('./nav.js');
const GearUI = require('./gear.js');
const Idle = require('../systems/idle.js');
const Daily = require('../systems/daily.js');
const Boosts = require('../systems/boosts.js');
const clock = require('../core/clock.js');
const atlas = require('../core/atlas.js');
const { Particles } = require('../core/fx.js');
const { Grid } = require('../core/paint.js');
const { C, UI } = require('../core/palette.js');

const { W, H } = D;
let furnaceArt = null;

function relicIcon(item) {
  const def = G.RELICS[item.type];
  return art.relic(def.shape, def.el, item.rank);
}

class Party {
  constructor(p) {
    this.p = p;
    this.hero = p.hero || 'cen';
    this.scroll = 0;
    this.maxScroll = 0;
    this.fx = new Particles();
    this.bottom = H - nav.height();
  }
  back() {
    game.go('map');
  }
  enter() {
    audio.bgm('road');
  }
  update(dt) {
    this.fx.update(dt);
  }
  onDrag(dx, dy) {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll - dy));
  }
  afterTraining(s) {
    Daily.mark(s, 'train', Idle.dayOf(clock.now()));
    Idle.nudge(s);
    store.persist();
  }
  draw() {
    const s = store.get();
    const h = s.heroes[this.hero];
    const def = G.HEROES[this.hero];
    const st = P.heroStats(s, this.hero);
    ui.rect(0, 0, W, H, '#14121f');
    const top = D.contentTop;
    const m = 8, w = W - m * 2;
    // Hero tabs stay fixed above the scroll area.
    const tw = Math.floor((w - 8) / 3);
    G.HERO_ORDER.forEach((id, i) => {
      const hh = s.heroes[id];
      const x = m + i * (tw + 4);
      if (!hh.joined) {
        ui.button('tab-' + id, x, top, tw, 26, { label: '???', kind: 'off', disabled: true });
        return;
      }
      ui.button('tab-' + id, x, top, tw, 26, { label: G.HEROES[id].name, kind: this.hero === id ? 'primary' : 'normal', onTap: () => { this.hero = id; this.scroll = 0; } });
    });
    const listTop = top + 30;
    ui.setClip(0, listTop, W, this.bottom - listTop);
    let y = listTop - Math.round(this.scroll);
    // Card: the hero as they walk the road, with their numbers.
    ui.panel(m, y, w, 80);
    ui.rect(m + 6, y + 6, 58, 68, '#2a2542');
    const a = art.hero(this.hero, Math.floor(game.t * 1.6) % 2 ? 'idle1' : 'idle0', h.outfit);
    ui.img(a, m + 35 - a.w / 2, y + 74 - a.h);
    const tx = m + 72;
    ui.text(`${def.name}`, tx, y + 8, UI.text);
    ui.text(`Lv ${h.lv}`, tx + 30, y + 8, UI.gold);
    ui.text(G.ELEMENTS[def.el].name, W - m - 10, y + 8, G.ELEMENTS[def.el].css, { align: 'r' });
    ui.text(def.title, tx, y + 22, UI.dim);
    const need = G.xpNeed(h.lv);
    ui.bar(tx, y + 37, W - m - 10 - tx, 5, h.lv >= G.MAX_LEVEL ? 1 : h.xp / need, '#7fd1a4');
    ui.text(`气血 ${ui.num(st.hp)}  灵力 ${st.mp}`, tx, y + 46, UI.text);
    ui.text(`攻 ${st.atk}  防 ${st.def}  速 ${Math.round(st.spd)}`, tx, y + 60, UI.dim);
    y += 84;
    // Skills have their own screen, and sit up here so they are never lost at the bottom of a long list.
    const ready = Skills.readyCount(s, this.hero);
    ui.button('skills-open', m, y, w, 28, {
      icon: 'flame', label: ready ? `术法 · ${ready} 门可以升级` : '术法', kind: ready ? 'jade' : 'normal', badge: ready > 0,
      onTap: () => game.go('skills', { hero: this.hero }, true),
    });
    y += 32;
    y = GearUI.drawPanel(s, this.hero, y, m, w);
    // Training
    ui.panel(m, y, w, 30 * 4 + 56);
    ui.text('修炼', m + 10, y + 7, UI.gold);
    ui.text(`全队战力 ${ui.num(P.power(s))}`, W - m - 10, y + 7, UI.dim, { align: 'r' });
    let ry = y + 23;
    Object.keys(G.TRAIN).forEach((k) => {
      const t = G.TRAIN[k];
      const lv = h.train[k];
      const max = lv >= G.TRAIN_MAX;
      const cost = G.trainCost(lv);
      ui.img(art.icon(t.icon), m + 8, ry + 6);
      ui.text(t.name, m + 28, ry + 2, UI.text);
      ui.text(`${lv} 层 +${Math.round(lv * t.pct * 100)}%`, m + 58, ry + 2, UI.jade);
      ui.bar(m + 28, ry + 17, W - m * 2 - 112, 5, lv / G.TRAIN_MAX, '#e8b33a');
      ui.button(`train-${k}`, W - m - 80, ry + 1, 72, 26, {
        label: max ? '圆满' : ui.num(cost), icon: max ? undefined : 'coin', kind: !max && s.coin >= cost ? 'primary' : 'normal',
        disabled: max || s.coin < cost, sound: 'level',
        onTap: () => {
          E.train(s, this.hero, k);
          this.afterTraining(s);
        },
      });
      ry += 30;
    });
    ui.button('train-auto', m + 8, ry + 2, w - 16, 26, {
      label: '一键修炼(全队)', kind: 'jade', sound: 'level',
      onTap: () => {
        const r = E.autoTrain(s);
        if (!r.n) return ui.toast('铜钱不够了,回路上攒一攒', 1.2);
        this.afterTraining(s);
        return ui.toast(`全队修炼了 ${r.n} 层`, 1.2);
      },
    });
    y += 30 * 4 + 60;
    // Relics
    ui.panel(m, y, w, 62);
    ui.text('法宝', m + 10, y + 7, UI.gold);
    const sw = Math.floor((w - 26) / 2);
    [0, 1].forEach((slot) => {
      const uid = h.relics[slot];
      const item = uid && s.relics.find((r) => r.uid === uid);
      const x = m + 10 + slot * (sw + 6);
      if (item) {
        const rd = G.RELICS[item.type];
        ui.button(`relic-${slot}`, x, y + 23, sw, 32, { label: '', onTap: () => game.push('relicpick', { hero: this.hero, slot }) });
        ui.img(relicIcon(item), x + 5, y + 30);
        ui.text(rd.name, x + 24, y + 32, G.RANKS[item.rank].css);
      } else {
        ui.button(`relic-${slot}`, x, y + 23, sw, 32, { label: s.relics.length ? '+ 佩戴' : '空', kind: 'ghost', onTap: () => game.push('relicpick', { hero: this.hero, slot }) });
      }
    });
    y += 66;
    this.maxScroll = Math.max(0, y + this.scroll - this.bottom);
    this.scroll = Math.min(this.scroll, this.maxScroll);
    ui.endClip();
    ui.rect(0, 0, W, top - 1, '#14121f');
    ui.header('队伍', this.p.from === 'map' ? () => this.back() : null, s.stardust, s.coin);
    this.fx.draw();
    nav.draw('party');
  }
}

class RelicPick {
  constructor(p) {
    this.p = p;
    this.scroll = 0;
    this.maxScroll = 0;
  }
  onDrag(dx, dy) {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll - dy));
  }
  draw() {
    const s = store.get();
    ui.alpha(0.65);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    const x = 10, w = W - 20, y = D.contentTop + 6, h = H - y - D.safeBottom - 10;
    ui.panel(x, y, w, h);
    ui.text('选择法宝', W / 2, y + 9, UI.gold, { align: 'c' });
    const listY = y + 26, listH = h - 62;
    ui.setClip(x + 4, listY, w - 8, listH);
    let ry = listY - Math.round(this.scroll);
    if (!s.relics.length) {
      ui.para('行囊里还没有法宝。把封印到的两只妖灵放进星炉,就能炼出法宝。', x + 14, ry + 10, w - 28, UI.dim);
    }
    const rh = 38;
    s.relics.forEach((item) => {
      const def = G.RELICS[item.type];
      const owner = E.relicOwner(s, item.uid);
      ui.button('pick-' + item.uid, x + 8, ry, w - 16, rh - 2, {
        label: '',
        onTap: () => {
          E.equipRelic(s, this.p.hero, this.p.slot, item.uid);
          store.persist();
          game.pop(this);
        },
      });
      ui.img(relicIcon(item), x + 13, ry + 10);
      ui.text(def.name, x + 34, ry + 5, G.RANKS[item.rank].css);
      ui.text(G.RANKS[item.rank].name, x + 36 + ui.font.width(def.name), ry + 5, UI.dim);
      if (owner) ui.text(G.HEROES[owner].name, x + w - 14, ry + 5, UI.jade, { align: 'r' });
      else {
        ui.button('melt-' + item.uid, x + w - 48, ry + 6, 36, 24, {
          label: '熔', kind: 'ghost', sound: 'coin',
          onTap: () => {
            const v = E.meltRelic(s, item.uid);
            store.persist();
            ui.toast(`熔成了 ${ui.num(v)} 铜钱`, 1);
          },
        });
      }
      ui.text(G.relicDesc(item.type, item.rank), x + 34, ry + 20, UI.dim);
      ry += rh;
    });
    this.maxScroll = Math.max(0, ry + this.scroll - (listY + listH));
    ui.endClip();
    const by = y + h - 32;
    const half = Math.floor((w - 24) / 2);
    ui.button('pick-none', x + 8, by, half, 26, {
      label: '卸下',
      onTap: () => {
        E.unequipRelic(s, this.p.hero, this.p.slot);
        store.persist();
        game.pop(this);
      },
    });
    ui.button('pick-close', x + 16 + half, by, half, 26, { label: '关闭', kind: 'ghost', sound: 'back', onTap: () => game.pop(this) });
  }
}

function furnaceSprite() {
  if (furnaceArt) return furnaceArt;
  const g = new Grid(72, 64);
  g.rect(14, 52, 6, 10, C.bronze2);
  g.rect(52, 52, 6, 10, C.bronze2);
  g.rect(33, 54, 6, 8, C.bronze2);
  g.ell(36, 36, 27, 21, C.bronze);
  g.ell(30, 30, 16, 12, C.bronze3);
  g.ell(36, 42, 22, 12, C.bronze);
  g.rect(8, 14, 56, 6, C.bronze3);
  g.rect(12, 20, 48, 4, C.bronze2);
  g.rect(6, 22, 6, 12, C.bronze2);
  g.rect(60, 22, 6, 12, C.bronze2);
  g.ell(36, 42, 11, 8, C.ink2);
  g.ell(36, 43, 8, 6, C.red2);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 6.28;
    g.set(36 + Math.cos(a) * 19, 37 + Math.sin(a) * 11, C.gold);
  }
  furnaceArt = atlas.add(g.volume({ cap: 7, hi: 0.22, lo: 0.32 }).outlineTint(0.85));
  return furnaceArt;
}

class Furnace {
  constructor() {
    this.tab = 'refine';
    this.a = null;
    this.b = null;
    this.fx = new Particles();
    this.scroll = 0;
    this.maxScroll = 0;
    this.heat = 0;
    this.runner = new game.Runner();
  }
  enter() {
    audio.bgm('road');
  }
  update(dt) {
    this.runner.update(dt);
    this.fx.update(dt);
    if (Math.random() < dt * (this.heat > 0 ? 80 : 8)) {
      const c = this.heat > 0 ? 'fire' : 'star';
      this.fx.rise(W / 2, this.fy + 20, c, 1);
    }
    this.heat = Math.max(0, this.heat - dt);
  }
  onDrag(dx, dy) {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll - dy));
  }
  toggle(id) {
    const s = store.get();
    const have = s.spirits[id] || 0;
    if (this.a === id && this.b === id) this.b = null;
    else if (this.a === id && have > 1 && !this.b) this.b = id;
    else if (this.a === id) { this.a = this.b; this.b = null; }
    else if (this.b === id) this.b = null;
    else if (!this.a) this.a = id;
    else if (!this.b) this.b = id;
    else this.b = id;
  }
  doRefine() {
    const s = store.get();
    const now = clock.now();
    const job = E.startRefine(s, this.a, this.b, now);
    if (!job) return;
    this.a = null;
    this.b = null;
    this.heat = 1.4;
    store.persist();
    audio.sfx('furnace');
    audio.buzz('medium');
  }
  // Takes out everything that has finished, and shows off the first new thing.
  collect() {
    const s = store.get();
    const done = E.collectRefined(s, clock.now());
    if (!done.length) return;
    store.persist();
    audio.sfx('star');
    this.fx.burst(W / 2, this.fy + 20, 'star', 60, 130);
    const item = done[0];
    const def = G.RELICS[item.type];
    O.modal({
      title: `炼成 ${G.RANKS[item.rank].name}品法宝${done.length > 1 ? ` 等 ${done.length} 件` : ''}`, titleColor: G.RANKS[item.rank].css, icon: relicIcon(item),
      text: `${def.name}:${G.relicDesc(item.type, item.rank)}`,
      buttons: [{ label: '收入行囊', kind: 'primary' }, { label: '去佩戴', kind: 'jade', onTap: () => game.go('party') }],
    });
  }
  drawJobs(s, y) {
    const now = clock.now();
    const m = 8, w = W - m * 2;
    ui.panel(m, y, w, 34);
    const jobs = s.furnace.jobs;
    if (!jobs.length) {
      ui.text(`炉中空闲 · 可同时炼 ${E.FURNACE_SLOTS} 件 · 人不在也会炼`, W / 2, y + 11, UI.dim, { align: 'c' });
      return y + 38;
    }
    const ready = jobs.filter((j) => j.doneAt <= now).length;
    const next = jobs.filter((j) => j.doneAt > now).sort((a, b) => a.doneAt - b.doneAt)[0];
    if (next) {
      const left = next.doneAt - now;
      const total = G.RANKS[next.rank].mins * 60000;
      ui.text(`还要 ${ui.dur(left / 1000)}`, m + 10, y + 6, UI.text);
      ui.bar(m + 10, y + 21, w - 100, 5, 1 - left / total, '#ec7a4e');
      const cost = Boosts.rushCost(left);
      ui.button('furnace-rush', W - m - 76, y + 5, 70, 24, {
        icon: 'dust', label: ui.num(cost), kind: s.stardust >= cost ? 'jade' : 'normal', disabled: s.stardust < cost || !!ready, sound: 'star',
        onTap: () => {
          if (!E.spendDust(s, cost)) return;
          next.doneAt = now;
          store.persist();
        },
      });
    }
    if (ready) {
      ui.button('furnace-open', next ? m + 6 : m + 8, next ? y + 4 : y + 5, next ? w - 94 : w - 16, 26, { label: `开炉取宝 ${ready} 件`, kind: 'primary', sound: null, onTap: () => this.collect() });
    }
    return y + 38;
  }
  drawRefine(s, y) {
    const m = 8, w = W - m * 2;
    this.fy = y + 2;
    ui.img(furnaceSprite(), W / 2 - 36, y);
    this.fx.draw();
    const slot = (x, id) => {
      ui.panel(x, y + 16, 66, 34, { fill: '#2a2542' });
      if (id) {
        const mo = G.MONSTERS[id];
        ui.text(mo.name, x + 33, y + 22, UI.text, { align: 'c' });
        ui.text(G.ELEMENTS[mo.el].name, x + 33, y + 34, G.ELEMENTS[mo.el].css, { align: 'c' });
      } else ui.text('放入妖灵', x + 33, y + 27, UI.faint, { align: 'c' });
    };
    slot(m, this.a);
    slot(W - m - 66, this.b);
    y += 66;
    y = this.drawJobs(s, y);
    let previewH = 0;
    if (this.a && this.b) {
      const pv = E.previewRefine(this.a, this.b);
      const known = s.codex.recipes[pv.type] !== undefined;
      previewH = 62;
      ui.panel(m, y, w, previewH);
      ui.img(art.relic(pv.def.shape, pv.def.el, pv.rank), m + 10, y + 11);
      ui.text(known ? pv.def.name : `未知的${pv.family}法宝`, m + 32, y + 8, G.RANKS[pv.rank].css);
      ui.text(`${G.RANKS[pv.rank].name}品 · ${pv.family} · ${ui.dur(pv.mins * 60)}`, m + 32, y + 23, UI.dim);
      ui.text(known ? G.relicDesc(pv.type, pv.rank) : '炼成之后才知道功效', m + 10, y + 42, UI.text);
      const can = s.coin >= pv.cost && s.furnace.jobs.length < E.FURNACE_SLOTS;
      ui.button('furnace-go', W - m - 82, y + 7, 74, 30, { icon: 'coin', label: ui.num(pv.cost), kind: can ? 'primary' : 'normal', disabled: !can, sound: null, onTap: () => this.doRefine() });
      y += previewH + 4;
    } else {
      ui.text('选两只妖灵,同气、相生、相克各有所长', W / 2, y + 2, UI.dim, { align: 'c' });
      y += 18;
    }
    const keys = Object.keys(s.spirits).filter((k) => s.spirits[k] > 0);
    ui.setClip(0, y, W, H - y);
    let ry = y - Math.round(this.scroll);
    if (!keys.length) {
      ui.panel(m, ry, w, 74);
      ui.para('还没有妖灵。队伍赶路时偶尔会收到。亲自打时,敌人血量越低,封灵符越容易成功。', m + 12, ry + 10, w - 24, UI.dim);
      ry += 78;
    }
    const cw = Math.floor((w - 4) / 2);
    keys.forEach((k, i) => {
      const mo = G.MONSTERS[k];
      const x = m + (i % 2) * (cw + 4);
      const yy = ry + Math.floor(i / 2) * 32;
      const used = (this.a === k ? 1 : 0) + (this.b === k ? 1 : 0);
      ui.button('spirit-' + k, x, yy, cw, 29, { label: '', kind: used ? 'jade' : 'normal', onTap: () => this.toggle(k) });
      ui.text(mo.name, x + 7, yy + 8, UI.text);
      ui.text(G.ELEMENTS[mo.el].name, x + 9 + ui.font.width(mo.name), yy + 8, G.ELEMENTS[mo.el].css);
      ui.text(`×${s.spirits[k] - used}`, x + cw - 7, yy + 8, UI.gold, { align: 'r' });
    });
    ry += Math.ceil(keys.length / 2) * 32;
    this.maxScroll = Math.max(0, ry + this.scroll - (H - D.safeBottom));
    ui.endClip();
  }
  drawCodex(s, y) {
    const m = 8, w = W - m * 2;
    ui.setClip(0, y, W, H - y);
    let ry = y - Math.round(this.scroll);
    const found = Object.keys(s.codex.recipes).length;
    ui.text(`已发现 ${found} / 15 种法宝`, W / 2, ry + 2, UI.gold, { align: 'c' });
    ry += 18;
    Object.keys(G.RELICS).forEach((type) => {
      const def = G.RELICS[type];
      const best = s.codex.recipes[type];
      const known = best !== undefined;
      const pair = type.split('_').map((e) => G.ELEMENTS[e].name).join(' + ');
      ui.panel(m, ry, w, 38, { fill: known ? UI.panel : '#181527', plain: true });
      if (known) ui.img(art.relic(def.shape, def.el, best), m + 9, ry + 11);
      else ui.text('?', m + 17, ry + 13, UI.faint, { align: 'c' });
      ui.text(known ? def.name : '未知法宝', m + 30, ry + 6, known ? G.RANKS[best].css : UI.faint);
      ui.text(pair, W - m - 8, ry + 6, UI.dim, { align: 'r' });
      ui.text(known ? G.relicDesc(type, best) : '———', m + 30, ry + 20, known ? UI.dim : UI.faint);
      ry += 40;
    });
    this.maxScroll = Math.max(0, ry + this.scroll - (H - D.safeBottom));
    ui.endClip();
  }
  draw() {
    const s = store.get();
    ui.backdrop('summer', 0.6);
    const top = D.contentTop;
    const tw = Math.floor((W - 20) / 2);
    ui.button('tab-refine', 8, top, tw, 24, { label: '炼制', kind: this.tab === 'refine' ? 'primary' : 'normal', onTap: () => { this.tab = 'refine'; this.scroll = 0; } });
    ui.button('tab-codex', 12 + tw, top, tw, 24, { label: '图鉴', kind: this.tab === 'codex' ? 'primary' : 'normal', onTap: () => { this.tab = 'codex'; this.scroll = 0; } });
    const y = top + 28;
    if (this.tab === 'refine') this.drawRefine(s, y);
    else this.drawCodex(s, y);
    ui.rect(0, 0, W, top - 1, '#14121f');
    ui.header('星炉', () => game.go('station'), s.stardust, s.coin);
  }
}

game.register('party', Party);
game.register('relicpick', RelicPick);
game.register('furnace', Furnace);
