// Side-view turn-based battle: animates events from systems/battle.js and collects player commands.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const audio = require('../core/audio.js');
const store = require('../systems/store.js');
const E = require('../systems/economy.js');
const G = require('../data/game.js');
const P = require('../systems/party.js');
const { Battle, ULT_FULL } = require('../systems/battle.js');
const { CHAPTERS } = require('../data/chapters.js');
const O = require('./overlays.js');
const { Particles, Weather } = require('../core/fx.js');
const { TIPS } = require('../data/story.js');
const { UI } = require('../core/palette.js');
const { dipperPoints } = require('../art/scenery.js');
const Idle = require('../systems/idle.js');
const Tower = require('../systems/tower.js');
const clock = require('../core/clock.js');

const { W, H } = D;
const PANEL_H = 176;
const STATUS_KEYS = Object.keys(G.STATUS);

class BattleScene {
  constructor(p) {
    const s = store.get();
    this.p = p;
    this.node = p.node || null;
    this.ci = p.chapter;
    this.chapter = CHAPTERS[p.chapter];
    const spec = p.fight || p.node;
    this.panelH = PANEL_H + D.safeBottom;
    this.fieldH = H - this.panelH;
    const heroes = P.partyUnits(s);
    const enemies = spec.foes.map((id, i) => P.enemyUnit(id, spec.lv, i));
    this.b = new Battle({ heroes, enemies, stars: s.progress.stars, items: s.items });
    this.all = enemies;
    this.isBoss = enemies.some((e) => e.boss);
    this.vis = {};
    this.layout(heroes, enemies);
    this.fx = new Particles();
    this.weather = new Weather(this.chapter.theme);
    this.runner = new game.Runner();
    this.pops = [];
    this.banner = null;
    this.mode = 'wait'; // wait | menu | skills | items | target | result
    this.log = '';
    this.shake = 0;
    this.dim = 0;
    this.ultVis = null;
    this.actor = null;
    this.pending = null;
    this.result = null;
  }
  enter() {
    audio.bgm(this.isBoss ? 'boss' : 'battle');
    this.runner.run(this.flow());
  }
  layout(heroes, enemies) {
    const f = this.fieldH;
    const hs = { 1: [[0.8, 0.8]], 2: [[0.74, 0.72], [0.88, 0.88]], 3: [[0.72, 0.68], [0.89, 0.8], [0.72, 0.93]] }[heroes.length];
    heroes.forEach((u, i) => {
      this.vis[u.key] = { x: W * hs[i][0], y: f * hs[i][1], ox: 0, oy: 0, flash: 0, a: 1, pose: 'idle', poseT: 0 };
    });
    const es = { 1: [[0.3, this.isBossCheck(enemies) ? 0.9 : 0.8]], 2: [[0.2, 0.68], [0.38, 0.87]], 3: [[0.17, 0.64], [0.42, 0.75], [0.17, 0.89]] }[enemies.length];
    enemies.forEach((u, i) => {
      this.vis[u.key] = { x: W * es[i][0], y: f * es[i][1], ox: 0, oy: 0, flash: 0, a: 1, pose: 'idle', poseT: 0, seed: i };
    });
  }
  isBossCheck(e) {
    return e.some((u) => u.boss);
  }
  update(dt) {
    const speed = store.get().settings.speed;
    const sdt = dt * (this.mode === 'menu' || this.mode === 'skills' || this.mode === 'items' || this.mode === 'target' ? 1 : speed);
    this.runner.update(sdt);
    this.fx.update(sdt);
    this.weather.update(dt);
    this.shake = Math.max(0, this.shake - sdt * 26);
    this.pops.forEach((p) => {
      p.t += sdt;
      p.y -= sdt * (p.t < 0.25 ? 50 : 12);
    });
    this.pops = this.pops.filter((p) => p.t < 0.9);
    if (this.banner) {
      this.banner.t -= sdt;
      if (this.banner.t <= 0) this.banner = null;
    }
    Object.keys(this.vis).forEach((k) => {
      const v = this.vis[k];
      v.flash = Math.max(0, v.flash - sdt * 5);
      if (v.poseT > 0) {
        v.poseT -= sdt;
        if (v.poseT <= 0) v.pose = 'idle';
      }
      v.ox *= Math.pow(0.0015, sdt);
      v.oy *= Math.pow(0.0015, sdt);
    });
  }
  say(text, t) {
    this.banner = { text, t: t || 1 };
  }
  // ---- Main sequence ----
  *flow() {
    yield 0.25;
    const s = store.get();
    if (this.node && this.node.id === 'c1a') O.tip('battle', TIPS.battle);
    yield () => game.top() === this;
    while (!this.b.outcome) {
      const turn = this.b.next();
      this.actor = turn.actor;
      yield* this.play(turn.events);
      if (this.b.outcome) break;
      if (turn.skip) continue;
      let events;
      if (turn.actor.side === 'enemy') {
        yield 0.2;
        events = this.b.performEnemy(turn.actor, this.b.enemyAction(turn.actor));
      } else {
        let action;
        if (s.settings.auto) {
          this.mode = 'wait';
          yield 0.08;
          action = this.b.autoAction(turn.actor);
        } else {
          this.pending = null;
          this.mode = 'menu';
          yield () => this.pending || store.get().settings.auto;
          action = this.pending || this.b.autoAction(turn.actor);
          this.mode = 'wait';
        }
        events = this.b.perform(turn.actor, action);
      }
      yield* this.play(events);
    }
    yield 0.3;
    yield* this.finish();
  }
  *play(events) {
    for (const e of events) yield* this.playOne(e);
  }
  *playOne(e) {
    switch (e.type) {
      case 'turn':
        this.log = '';
        break;
      case 'use': {
        const v = this.vis[e.actor.key];
        this.log = `${e.actor.name} · ${e.name}`;
        if (e.pose === 'atk' && e.actor.side === 'hero') {
          this.setPose(e.actor, 'windup', 0.14);
          yield 0.11;
        }
        if (e.pose) this.setPose(e.actor, e.pose, 0.5);
        const dir = e.actor.side === 'hero' ? -1 : 1;
        v.ox = dir * (e.pose === 'atk' || e.pose === 'thrust' ? 16 : 6);
        if (e.fx === 'heal' || e.pose === 'cast') audio.sfx('magic');
        if (!e.basic) this.say(e.name, 0.7);
        if (e.actor.side === 'enemy') {
          v.ox = dir * 14;
          this.setPose(e.actor, 'atk', 0.3);
        }
        yield 0.2;
        break;
      }
      case 'hit': {
        const v = this.vis[e.target.key];
        const p = this.center(e.target);
        const fx = e.fx || 'slash';
        if (fx === 'slash') this.fx.slash(p.x, p.y, e.el || 'metal');
        else if (fx === 'star') this.fx.burst(p.x, p.y, 'star', 26, 100);
        else {
          const from = this.center(e.actor);
          this.fx.beam(from.x, from.y, p.x, p.y, fx, 20);
          this.fx.burst(p.x, p.y, fx, 22, 80);
        }
        v.flash = 1;
        v.ox = e.target.side === 'hero' ? 7 : -7;
        this.setPose(e.target, 'hurt', 0.3);
        this.shake = e.crit ? 9 : 4;
        audio.sfx(e.crit ? 'crit' : 'hit');
        audio.buzz(e.crit ? 'medium' : 'light');
        this.pop(p.x, p.y - 16, e.amount, e.crit ? '#f7dd7a' : '#ffffff', e.crit ? 3 : 2);
        if (e.eff === 'weak') this.popText(p.x, p.y - 34, '克制', '#ec7a4e');
        if (e.eff === 'resist') this.popText(p.x, p.y - 34, '抵抗', '#a79fb8');
        if (e.crit) this.popText(p.x, p.y - 46, '暴击', '#f7dd7a');
        yield 0.2;
        break;
      }
      case 'dot': {
        const p = this.center(e.target);
        this.pop(p.x, p.y - 12, e.amount, e.status === 'burn' ? '#ec7a4e' : '#7fd1a4', 2);
        this.fx.rise(p.x, p.y, e.status === 'burn' ? 'fire' : 'wood', 8);
        yield 0.2;
        break;
      }
      case 'heal': {
        const p = this.center(e.target);
        if (e.amount > 0) this.pop(p.x, p.y - 12, '+' + e.amount, '#7fd1a4', 2);
        this.fx.rise(p.x, p.y, 'heal', 12);
        audio.sfx('heal');
        yield 0.14;
        break;
      }
      case 'mp': {
        const p = this.center(e.target);
        this.pop(p.x, p.y - 12, '+' + e.amount, '#6fb0e0', 2);
        this.fx.rise(p.x, p.y, 'water', 10);
        audio.sfx('heal');
        yield 0.15;
        break;
      }
      case 'status': {
        const p = this.center(e.target);
        const st = G.STATUS[e.status];
        this.popText(p.x, p.y - 24, st.name, st.css);
        yield 0.05;
        break;
      }
      case 'guard': {
        const p = this.center(e.actor);
        this.popText(p.x, p.y - 22, '防御', '#d9c9a3');
        this.fx.burst(p.x, p.y, 'earth', 8, 30);
        audio.sfx('tap');
        yield 0.2;
        break;
      }
      case 'stunned': {
        const p = this.center(e.actor);
        this.popText(p.x, p.y - 22, '眩晕中', '#f7dd7a');
        yield 0.4;
        break;
      }
      case 'charge': {
        this.say(e.text, 1.3);
        const p = this.center(e.actor);
        this.fx.rise(p.x, p.y, 'star', 26);
        this.vis[e.actor.key].flash = 1;
        audio.sfx('charge');
        audio.buzz('medium');
        this.log = e.text;
        yield 1;
        if (O.tip('charge', TIPS.charge)) yield () => game.top() === this;
        break;
      }
      case 'phase': {
        this.say(e.text, 1.4);
        this.shake = 8;
        audio.sfx('gate');
        const p = this.center(e.target);
        this.fx.burst(p.x, p.y, e.target.el, 40, 110);
        yield 1;
        break;
      }
      case 'ko': {
        const v = this.vis[e.target.key];
        const p = this.center(e.target);
        this.fx.burst(p.x, p.y, e.target.side === 'enemy' ? e.target.el : 'none', 26, 80);
        audio.sfx('ko');
        v.flash = 1;
        v.ko = 0.01;
        yield 0.25;
        break;
      }
      case 'revive': {
        const v = this.vis[e.target.key];
        v.ko = 0;
        v.a = 1;
        const p = this.center(e.target);
        this.fx.rise(p.x, p.y, 'heal', 30);
        this.pop(p.x, p.y - 12, '+' + e.amount, '#7fd1a4', 2);
        audio.sfx('level');
        yield 0.3;
        break;
      }
      case 'useItem': {
        this.log = `${e.actor.name} 使用 ${e.name}`;
        this.setPose(e.actor, 'cast', 0.3);
        yield 0.2;
        break;
      }
      case 'seal': {
        const v = this.vis[e.target.key];
        const from = this.center(e.actor), to = this.center(e.target);
        this.setPose(e.actor, 'cast', 0.45);
        this.log = `${e.actor.name} 掷出封灵符`;
        this.fx.beam(from.x, from.y, to.x, to.y, 'star', 26);
        audio.sfx('seal');
        yield 0.3;
        if (e.ok) {
          v.sealing = 1;
          this.fx.burst(to.x, to.y, 'star', 30, 60);
          this.say(`封印了 ${e.target.name}!`, 1);
          audio.sfx('star');
          yield 0.5;
          v.a = 0;
        } else {
          v.ox = 8;
          this.fx.burst(to.x, to.y, 'none', 12, 50);
          this.popText(to.x, to.y - 20, '挣脱了', '#a79fb8');
          yield 0.4;
        }
        break;
      }
      case 'flee': {
        this.say(e.ok ? '撤退成功' : '撤退失败', 0.7);
        yield 0.5;
        break;
      }
      case 'ultStart':
        this.ultVis = { stars: e.stars, lit: 0, t: 0 };
        this.dim = 0.65;
        this.say('七 星 步', 1.1);
        audio.sfx('gate');
        yield 0.6;
        break;
      case 'ultStar':
        this.ultVis.lit = e.index + 1;
        audio.sfx('star');
        yield 0.12;
        break;
      case 'ultEnd':
        yield 0.25;
        this.ultVis = null;
        this.dim = 0;
        break;
      default:
    }
  }
  setPose(u, pose, t) {
    const v = this.vis[u.key];
    v.pose = pose;
    v.poseT = t;
  }
  center(u) {
    const v = this.vis[u.key];
    const h = this.artOf(u).h;
    return { x: v.x, y: v.y - Math.min(h, 80) * 0.55 };
  }
  pop(x, y, text, color, k) {
    this.pops.push({ x, y, t: 0, text: String(text), color, k: k || 2 });
  }
  popText(x, y, text, color) {
    this.pops.push({ x, y, t: 0, label: text, color });
  }
  artOf(u, pose) {
    if (u.side === 'hero') {
      const v = this.vis[u.key];
      const pf = pose || (v.pose === 'idle' ? (Math.floor(game.t * 1.6 + u.key.charCodeAt(0)) % 2 ? 'idle1' : 'idle0') : v.pose);
      const outfit = store.get().heroes[u.id] && store.get().heroes[u.id].outfit;
      return art.hero(u.id, u.alive ? pf : 'ko', outfit);
    }
    return art.monster(u.def_.art, u.alive && !this.b.outcome ? Math.floor(game.t * 2.2 + (this.vis[u.key].seed || 0)) % 2 : 0);
  }
  // ---- Battle end ----
  *finish() {
    const s = store.get();
    const b = this.b;
    if (b.outcome === 'fled') {
      store.persist();
      this.goBack();
      return;
    }
    if (b.outcome === 'lose') {
      audio.bgm(null);
      audio.sfx('lose');
      store.persist();
      this.result = { lose: true };
      this.mode = 'result';
      return;
    }
    audio.bgm(null);
    audio.sfx('win');
    const nodeId = this.node && this.node.id;
    let rw;
    if (this.p.tower) {
      const t = Tower.win(s, this.p.tower);
      rw = t ? { xp: t.reward.xp, coin: t.reward.coin, dust: t.reward.dust, drops: t.reward.items, ups: t.ups } : { xp: 0, coin: 0, dust: 0, drops: {}, ups: [] };
    } else rw = E.battleRewards(s, this.all, nodeId, Idle.dayOf(clock.now()));
    if (b.sealed.length) {
      E.addSpirits(s, b.sealed);
      O.tip('seal', TIPS.seal);
    }
    let lit = false;
    if (this.node) lit = E.clearNode(s, nodeId).litStar;
    if (s.idle.blocked) Idle.nudge(s);
    store.persist();
    if (rw.ups.length) audio.sfx('level');
    this.result = { rw, lit, sealed: b.sealed };
    this.mode = 'result';
  }
  // Back to wherever the fight was started from.
  goBack() {
    const from = this.p.from;
    if (from === 'tower') return game.go('tower');
    if (from === 'map') return game.go('map', { chapter: this.ci, focus: this.p.focus });
    return game.go('road');
  }
  leaveWin() {
    const s = store.get();
    const node = this.node;
    if (this.p.resume) {
      return game.go(this.p.from === 'map' ? 'map' : 'road', this.p.from === 'map' ? { chapter: this.ci, focus: this.p.focus, after: this.p.resume.win } : { after: this.p.resume.win });
    }
    if (this.p.tower) return this.goBack();
    const back = () => {
      if (node.id === 'c1h') {
        E.joinHero(s, 'zhuo');
        store.persist();
      }
      if (node.after === 'final') return game.go('ending');
      const moved = s.progress.chapter > this.ci && this.result.lit;
      if (moved && this.p.from === 'map') return game.go('map', { chapter: s.progress.chapter });
      return this.goBack();
    };
    if (node.after && node.after !== 'final') return O.story(node.after, back);
    return back();
  }
  // ---- Input ----
  choose(action) {
    this.pending = action;
    this.mode = 'wait';
    this.targetFor = null;
  }
  needTarget(kind, data, list) {
    const live = list.filter((u) => (kind.target === 'ko' ? !u.alive : u.alive));
    if (!live.length) return ui.toast('没有可选的目标');
    if (live.length === 1) return this.choose(Object.assign({}, data, { target: live[0] }));
    this.targetFor = { data, list: live, seal: data.kind === 'seal' };
    this.mode = 'target';
  }
  pickSkill(id) {
    const sk = G.SKILLS[id];
    const a = this.actor;
    const data = { kind: 'skill', id };
    if (sk.target === 'enemy') return this.needTarget(sk, data, this.b.enemies);
    if (sk.target === 'ally') return this.needTarget(sk, data, this.b.heroes);
    if (sk.target === 'ko') return this.needTarget(sk, data, this.b.heroes);
    this.choose(Object.assign(data, { target: a }));
  }
  pickItem(id) {
    const it = G.ITEMS[id];
    this.needTarget(it, { kind: 'item', id }, this.b.heroes);
  }
  // ---- Rendering ----
  drawUnit(u) {
    const v = this.vis[u.key];
    if (v.a <= 0) return;
    if (u.side === 'enemy' && v.ko > 0) {
      v.ko += 0.04;
      if (v.ko > 1) return;
    }
    const a = this.artOf(u);
    const x = Math.round(v.x + v.ox - a.w / 2);
    const y = Math.round(v.y + v.oy - a.h) + (u.side === 'hero' ? 3 : 0);
    ui.alpha(0.3);
    const sw = Math.round(Math.min(a.w, 90) * 0.7);
    ui.rect(v.x - sw / 2, v.y - 2, sw, 3, '#000000');
    ui.rect(v.x - sw / 2 + 3, v.y - 3, sw - 6, 5, '#000000');
    ui.alpha(1);
    if (u.side === 'enemy' && v.ko > 0) ui.alpha(Math.max(0, 1 - v.ko));
    if (v.sealing) {
      v.sealing = Math.max(0.05, v.sealing - 0.03);
      const k = v.sealing;
      ui.alpha(k);
      ui.imgScaled(a, v.x - (a.w * k) / 2, v.y - a.h * k, a.w * k, a.h * k);
      ui.alpha(1);
      return;
    }
    ui.img(a, x, y);
    if (v.flash > 0) {
      ui.alpha(Math.min(1, v.flash * 1.4));
      ui.img(a.white(), x, y);
      ui.alpha(1);
    }
    ui.alpha(1);
    const st = u.statuses;
    if (u.alive) {
      if (st.burn && Math.random() < 0.2) this.fx.rise(v.x, v.y - a.h * 0.4, 'fire', 1);
      if (st.poison && Math.random() < 0.15) this.fx.rise(v.x, v.y - a.h * 0.4, 'wood', 1);
      if (u.charging && Math.random() < 0.5) this.fx.rise(v.x, v.y - a.h * 0.5, 'star', 1);
    }
    if (u.side === 'enemy' && u.alive && !u.boss) {
      const bw = 40;
      const bx = Math.round(v.x - bw / 2), by = Math.round(v.y + 3);
      ui.bar(bx, by, bw, 5, u.hp / u.maxHp, u.hp / u.maxHp < 0.3 ? '#ec7a4e' : '#d8503c');
      ui.text(u.name, v.x, by + 6, UI.text, { align: 'c', outline: true });
      ui.text(G.ELEMENTS[u.el].name, bx + bw + 3, by - 4, G.ELEMENTS[u.el].css, { outline: true });
      if (u.elite) ui.rect(bx - 4, by, 3, 5, '#a884c9');
    }
    if (this.actor === u && u.side === 'hero' && (this.mode === 'menu' || this.mode === 'skills' || this.mode === 'items')) {
      const ay = v.y - a.h - 6 + Math.round(Math.sin(game.t * 6) * 2);
      ui.rect(v.x - 3, ay, 7, 2, '#f7dd7a');
      ui.rect(v.x - 2, ay + 2, 5, 1, '#f7dd7a');
      ui.rect(v.x - 1, ay + 3, 3, 1, '#f7dd7a');
      ui.rect(v.x, ay + 4, 1, 1, '#f7dd7a');
    }
  }
  drawTargets() {
    const tf = this.targetFor;
    tf.list.forEach((u) => {
      const v = this.vis[u.key];
      const a = this.artOf(u);
      const w = Math.max(44, Math.min(a.w, 110));
      const h = Math.max(46, Math.min(a.h, 110));
      const ay = v.y - a.h - 8 + Math.round(Math.sin(game.t * 7) * 2);
      ui.rect(v.x - 4, ay, 9, 3, '#ec7a4e');
      ui.rect(v.x - 2, ay + 3, 5, 2, '#ec7a4e');
      ui.rect(v.x - 1, ay + 5, 3, 1, '#ec7a4e');
      if (tf.seal) ui.text(`${Math.round(this.b.sealChance(u) * 100)}%`, v.x, ay - 13, u.boss ? UI.faint : UI.gold, { align: 'c', outline: true });
      ui.hit('target-' + u.key, v.x - w / 2, v.y - h, w, h + 6, () => this.choose(Object.assign({}, tf.data, { target: u })), { label: 'target-' + u.key });
    });
  }
  drawTurnStrip() {
    const list = this.b.peek(6);
    let x = 6;
    const y = D.capTop + Math.floor((Math.max(20, D.capBottom - D.capTop) - 16) / 2);
    const maxX = D.capLeft - 22;
    list.forEach((u, i) => {
      if (x > maxX) return;
      ui.rect(x, y, 16, 16, i === 0 ? '#f7dd7a' : UI.ink);
      if (u.side === 'hero') ui.img(art.portraitSmall(u.id), x + 0, y + 0);
      else {
        ui.rect(x + 1, y + 1, 14, 14, '#2a2542');
        ui.text(u.name[0], x + 8, y + 2, G.ELEMENTS[u.el].css, { align: 'c' });
      }
      if (i === 0) {
        ui.rect(x, y, 16, 1, '#f7dd7a');
        ui.rect(x, y + 15, 16, 1, '#f7dd7a');
        ui.rect(x, y, 1, 16, '#f7dd7a');
        ui.rect(x + 15, y, 1, 16, '#f7dd7a');
      }
      x += 18;
    });
  }
  drawBossBar() {
    const boss = this.all.find((u) => u.boss && u.alive);
    if (!boss) return;
    const y = D.contentTop;
    ui.rect(6, y, W - 12, 20, 'rgba(0,0,0,0)');
    ui.text(boss.name, 8, y, UI.text, { outline: true });
    ui.text(G.ELEMENTS[boss.el].name, 12 + ui.font.width(boss.name), y, G.ELEMENTS[boss.el].css, { outline: true });
    ui.bar(6, y + 14, W - 12, 7, boss.hp / boss.maxHp, '#c8402f');
    if (boss.charging) ui.text('蓄力中', W - 8, y, UI.red, { align: 'r', outline: true });
  }
  drawParty() {
    const y0 = this.fieldH + 5;
    const rowH = 19;
    const x0 = 8;
    this.b.heroes.forEach((u, i) => {
      const y = y0 + i * rowH;
      const active = this.actor === u && u.alive;
      if (active) ui.rect(4, y - 1, W - 8, rowH - 1, '#332c4a');
      const small = art.portraitSmall(u.id);
      ui.alpha(u.alive ? 1 : 0.4);
      ui.img(small, x0, y);
      ui.alpha(1);
      const hx = x0 + 19, hw = Math.round((W - x0 * 2 - 19) * 0.48), mw = Math.round((W - x0 * 2 - 19) * 0.2);
      const r = u.hp / u.maxHp;
      ui.bar(hx, y + 2, hw, 12, r, r < 0.3 ? '#ec7a4e' : UI.hp);
      ui.text(`${u.hp}`, hx + hw - 3, y + 2, UI.text, { align: 'r', outline: true });
      ui.text(u.name, hx + 3, y + 2, UI.text, { outline: true });
      const mx = hx + hw + 3;
      ui.bar(mx, y + 2, mw, 12, u.maxMp ? u.mp / u.maxMp : 0, UI.mp);
      ui.text(`${u.mp}`, mx + mw - 3, y + 2, UI.text, { align: 'r', outline: true });
      let sx = mx + mw + 3;
      STATUS_KEYS.forEach((k) => {
        if (!u.statuses[k] || sx > W - 8) return;
        ui.rect(sx, y + 3, 5, 10, G.STATUS[k].css);
        sx += 6;
      });
    });
  }
  drawCommands() {
    const m = 6;
    const w = W - m * 2;
    const bottom = H - D.safeBottom - 4;
    // Anchored to the bottom, so the buttons stay under the thumb however tall the phone is.
    const y0 = bottom - 24 - 3 - 33 - 3 - 33 - 2;
    const s = store.get();
    const a = this.actor;
    const cols = 3, gap = 3;
    const bw = Math.floor((w - gap * (cols - 1)) / cols);
    const bh = 33;
    const row2Y = y0 + bh + gap;
    if (this.mode === 'menu') {
      const stuff = [
        { id: 'cmd-attack', label: '攻击', kind: 'danger', onTap: () => this.needTarget({ target: 'enemy' }, { kind: 'attack' }, this.b.enemies) },
        { id: 'cmd-skill', label: '术法', kind: 'normal', onTap: () => { this.mode = 'skills'; } },
        {
          id: 'cmd-ult', label: this.b.stars ? '七星步' : '未觉醒', kind: this.b.ultReady() ? 'primary' : 'normal', disabled: !this.b.ultReady(),
          onTap: () => this.choose({ kind: 'ult' }),
        },
        { id: 'cmd-item', label: '物品', kind: 'normal', onTap: () => { this.mode = 'items'; } },
        {
          id: 'cmd-seal', label: `封灵 ${s.items.seal || 0}`, kind: 'normal', disabled: !s.items.seal || this.isBoss,
          onTap: () => this.needTarget({ target: 'enemy' }, { kind: 'seal' }, this.b.enemies),
        },
        { id: 'cmd-guard', label: '防御', kind: 'normal', onTap: () => this.choose({ kind: 'guard' }) },
      ];
      stuff.forEach((b, i) => {
        const x = m + (i % 3) * (bw + gap);
        const y = i < 3 ? y0 : row2Y;
        ui.button(b.id, x, y, bw, bh, b);
        if (b.id === 'cmd-ult' && this.b.stars && !this.b.ultReady()) ui.bar(x + 4, y + bh - 6, bw - 8, 3, this.b.ult / ULT_FULL, UI.ult);
      });
    } else if (this.mode === 'skills') {
      const skills = a.skills;
      const sw = Math.floor((w - gap) / 2);
      skills.forEach((id, i) => {
        const sk = G.SKILLS[id];
        const cost = this.b.mpCost(a, sk);
        const ok = this.b.canUse(a, id);
        const x = m + (i % 2) * (sw + gap);
        const y = y0 + Math.floor(i / 2) * 26;
        ui.button('skill-' + id, x, y, sw, 24, { kind: ok ? 'normal' : 'off', disabled: !ok, onTap: () => this.pickSkill(id), label: '' });
        ui.text(sk.name, x + 6, y + 6, ok ? (sk.el ? G.ELEMENTS[sk.el].css : UI.jade) : UI.faint);
        ui.text(String(cost), x + sw - 6, y + 6, ok ? UI.blue : UI.faint, { align: 'r' });
      });
      ui.button('cmd-back', m + w - 62, bottom - 24, 62, 24, { label: '返回', kind: 'ghost', sound: 'back', onTap: () => { this.mode = 'menu'; } });
      return;
    } else if (this.mode === 'items') {
      const list = ['pill', 'ether', 'incense'];
      list.forEach((id, i) => {
        const it = G.ITEMS[id];
        const n = s.items[id] || 0;
        const iw = Math.floor((w - gap * 2) / 3);
        const x = m + i * (iw + gap);
        ui.button('item-' + id, x, y0, iw, 34, { icon: it.icon, label: `×${n}`, disabled: !n, onTap: () => this.pickItem(id) });
      });
      ui.text('回春丹 聚气散 还魂香', W / 2, y0 + 38, UI.dim, { align: 'c' });
      ui.button('cmd-back', m + w - 62, bottom - 24, 62, 24, { label: '返回', kind: 'ghost', sound: 'back', onTap: () => { this.mode = 'menu'; } });
      return;
    } else if (this.mode === 'target') {
      ui.text(this.targetFor.seal ? '选择要封印的妖灵(显示成功率)' : '点选目标', W / 2, y0 + 10, UI.gold, { align: 'c' });
      ui.button('cmd-back', m + w - 62, bottom - 24, 62, 24, { label: '返回', kind: 'ghost', sound: 'back', onTap: () => { this.mode = 'menu'; this.targetFor = null; } });
      return;
    } else if (this.mode === 'wait') {
      ui.text(this.log, W / 2, y0 + 16, UI.text, { align: 'c' });
      if (this.b.stars) {
        ui.text('七星步', m + 2, y0 + 38, UI.gold);
        ui.bar(m + 44, y0 + 40, w - 50, 7, this.b.ult / ULT_FULL, UI.ult);
      }
    }
    // Controls that stay available throughout the fight.
    const cy = bottom - 24;
    const cw = Math.floor((w - gap * 2) / 3);
    ui.button('cmd-auto', m, cy, cw, 24, {
      label: s.settings.auto ? '自动:开' : '自动:关', kind: s.settings.auto ? 'jade' : 'ghost',
      onTap: () => {
        s.settings.auto = !s.settings.auto;
        store.persist();
      },
    });
    ui.button('cmd-speed', m + cw + gap, cy, cw, 24, {
      label: `速度 ×${s.settings.speed}`, kind: s.settings.speed > 1 ? 'jade' : 'ghost',
      onTap: () => {
        s.settings.speed = s.settings.speed === 1 ? 2 : s.settings.speed === 2 ? 3 : 1;
        store.persist();
      },
    });
    if (this.mode === 'menu') {
      ui.button('cmd-flee', m + (cw + gap) * 2, cy, cw, 24, {
        label: '撤退', kind: 'ghost', disabled: !this.b.canFlee, onTap: () => this.choose({ kind: 'flee' }),
      });
    }
  }
  drawResult() {
    const r = this.result;
    ui.alpha(0.6);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    const w = W - 30, x = 15;
    if (r.lose) {
      const h = 150;
      const y = Math.round((H - h) / 2);
      ui.panel(x, y, w, h, { line: '#8e2a25' });
      ui.text('败退', W / 2, y + 14, UI.red, { align: 'c' });
      ui.para(TIPS.lost, x + 14, y + 34, w - 28, UI.text);
      ui.button('lose-retry', x + 14, y + h - 66, w - 28, 26, { label: '再战一次', kind: 'danger', onTap: () => game.go('battle', this.p) });
      const half = Math.floor((w - 32) / 2);
      ui.button('lose-back', x + 14, y + h - 36, half, 26, { label: '回到路上', onTap: () => this.goBack() });
      ui.button('lose-train', x + 18 + half, y + h - 36, half, 26, { label: '去修炼', kind: 'jade', onTap: () => game.go('party') });
      return;
    }
    const rows = [];
    if (r.rw.xp) rows.push({ label: '阅历', value: `+${ui.fmt(r.rw.xp)}`, c: UI.jade });
    if (r.rw.coin) rows.push({ label: '铜钱', value: `+${ui.fmt(r.rw.coin)}`, c: UI.gold });
    if (r.rw.dust) rows.push({ label: '星砂', value: `+${ui.fmt(r.rw.dust)}`, c: UI.blue });
    Object.keys(r.rw.drops).forEach((k) => rows.push({ label: G.ITEMS[k].name, value: `×${r.rw.drops[k]}`, c: UI.text }));
    r.sealed.forEach((id) => rows.push({ label: `${G.MONSTERS[id].name}之灵`, value: '已封印', c: UI.violet }));
    r.rw.ups.forEach((u) => rows.push({ label: `${G.HEROES[u.id].name} 升级`, value: `Lv ${u.lv}`, c: UI.peach }));
    const h = 66 + rows.length * 17 + 8;
    const y = Math.round((H - h) / 2);
    ui.panel(x, y, w, h);
    ui.text(this.isBoss ? '星位守敌,已被击败' : '胜利', W / 2, y + 12, UI.gold, { align: 'c' });
    rows.forEach((row, i) => {
      ui.text(row.label, x + 16, y + 33 + i * 17, UI.text);
      ui.text(row.value, x + w - 16, y + 33 + i * 17, row.c, { align: 'r' });
    });
    ui.button('win-continue', x + 14, y + h - 34, w - 28, 26, { label: '继续', kind: 'primary', onTap: () => this.leaveWin() });
  }
  draw() {
    const shakeX = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    const shakeY = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    ui.setClip(0, 0, W, this.fieldH);
    ui.ctx.drawImage(art.battleBg(this.chapter.theme, W, this.fieldH), shakeX, shakeY);
    ui.state.clip = null;
    this.weather.draw(this.fieldH);
    if (this.dim) {
      ui.alpha(this.dim);
      ui.rect(0, 0, W, this.fieldH, '#07061a');
      ui.alpha(1);
    }
    const units = this.b.units.slice().sort((a, b) => this.vis[a.key].y - this.vis[b.key].y);
    ui.ctx.save();
    ui.ctx.translate(shakeX, shakeY);
    units.forEach((u) => this.drawUnit(u));
    this.fx.draw();
    ui.ctx.restore();
    if (this.ultVis) {
      const pts = dipperPoints(W * 0.62, this.fieldH * 0.18, W * 0.5);
      pts.forEach((q, i) => {
        if (i >= this.ultVis.stars) {
          ui.rect(q[0], q[1], 1, 1, '#5a5070');
          return;
        }
        const on = i < this.ultVis.lit;
        ui.rect(q[0] - 1, q[1] - 1, 3, 3, on ? '#f7dd7a' : '#5a5070');
        if (on) {
          ui.rect(q[0] - 4, q[1], 9, 1, '#ffffff');
          ui.rect(q[0], q[1] - 4, 1, 9, '#ffffff');
        }
        if (i && on) {
          const a = pts[i - 1];
          const n = Math.max(Math.abs(q[0] - a[0]), Math.abs(q[1] - a[1]));
          for (let k = 0; k < n; k++) ui.rect(a[0] + ((q[0] - a[0]) * k) / n, a[1] + ((q[1] - a[1]) * k) / n, 1, 1, '#f7dd7a');
        }
      });
    }
    this.pops.forEach((p) => {
      const a = p.t > 0.65 ? Math.max(0, (0.9 - p.t) / 0.25) : 1;
      ui.alpha(a);
      if (p.label) ui.text(p.label, p.x, p.y, p.color, { align: 'c', outline: true });
      else ui.numberBig(p.text, p.x, p.y, p.color, p.k);
      ui.alpha(1);
    });
    if (this.banner) {
      const tw = ui.font.width(this.banner.text);
      const y = D.contentTop + (this.isBoss ? 28 : 4);
      ui.alpha(Math.min(1, this.banner.t * 5));
      ui.rect(W / 2 - tw / 2 - 12, y, tw + 24, 18, '#14121f');
      ui.rect(W / 2 - tw / 2 - 12, y + 1, 2, 16, '#e8b33a');
      ui.rect(W / 2 + tw / 2 + 10, y + 1, 2, 16, '#e8b33a');
      ui.text(this.banner.text, W / 2, y + 3, UI.gold, { align: 'c' });
      ui.alpha(1);
    }
    ui.endClip();
    this.drawTurnStrip();
    if (this.isBoss) this.drawBossBar();
    ui.rect(0, this.fieldH, W, H - this.fieldH, UI.panel);
    ui.rect(0, this.fieldH, W, 2, UI.line);
    this.drawParty();
    this.drawCommands();
    if (this.mode === 'target') this.drawTargets();
    if (this.mode === 'result') this.drawResult();
  }
}

game.register('battle', BattleScene);
