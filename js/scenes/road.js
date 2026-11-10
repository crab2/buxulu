// The main screen. The party walks the road, fights what it meets and fills the pack, with or without
// the player. Nothing on screen decides anything: the fights here only show what the march is doing.
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
const P = require('../systems/party.js');
const Idle = require('../systems/idle.js');
const Boosts = require('../systems/boosts.js');
const Daily = require('../systems/daily.js');
const Gear = require('../systems/gear.js');
const steps = require('../systems/steps.js');
const { CHAPTERS, NODE_INDEX, STAR_NAMES } = require('../data/chapters.js');
const O = require('./overlays.js');
const nav = require('./nav.js');
const Campaign = require('./campaign.js');
const { Weather, Particles } = require('../core/fx.js');
const { SkillFx } = require('../core/skillfx.js');
const Skills = require('../systems/skills.js');
const Quests = require('../systems/quests.js');
const Finds = require('../systems/finds.js');
const { UI } = require('../core/palette.js');
const { TIPS } = require('../data/story.js');

const { W, H } = D;
const PANEL_H = 172;
const WALK_SPEED = 26; // scenery pixels per second at normal pace
const QUIET_AFTER_MS = 30000;
// Where a goal sends the player. Screens reached from a tab go through that tab's own way in.
const QUEST_GO = {
  party: () => nav.go('party'),
  skills: () => game.go('skills', { hero: 'cen' }, true),
  dispatch: () => game.go('dispatch'),
  garden: () => game.go('garden'),
  furnace: () => game.go('furnace'),
  tower: () => game.go('tower'),
  wander: () => game.go('wander'),
  gacha: () => game.go('gacha', { from: 'trials' }),
};
const LANTERN_SPEED = 13;
const NODE_NAME = { fight: '遭遇战', elite: '强敌', event: '路遇', chest: '脚力宝箱', boss: '星位' };

// Tints the scene by the real time of day. The summer region's sun never moves, and the last has no sky.
function dayTint(theme, now) {
  if (theme === 'summer' || theme === 'void') return null;
  const h = new Date(now + 8 * 3600000).getUTCHours() + new Date(now).getUTCMinutes() / 60;
  if (h >= 21 || h < 4.5) return { c: '#5a64b4', a: 0.3 };
  if (h >= 19) return { c: '#8a78c4', a: 0.14 };
  if (h >= 17) return { c: '#f0b080', a: 0.1 };
  if (h < 6.5) return { c: '#b890c8', a: 0.1 };
  return null;
}

class RoadView {
  // The animated scene on its own, shared with the title screen.
  constructor(sceneH, theme) {
    this.sceneH = sceneH;
    this.gy = sceneH - Math.round(Math.min(sceneH * 0.27, 92));
    this.fy = this.gy + Math.round((sceneH - this.gy) * 0.56);
    this.theme = theme;
    this.x = 0;
    // This scene runs for hours at a time, so it keeps its particle count modest.
    this.fx = new Particles(110);
    this.sk = new SkillFx(this.fx, { x: 0, y: 0, w: W, h: sceneH });
    this.weather = new Weather(theme);
    this.foes = [];
    this.pops = [];
    this.coins = [];
    this.state = 'walk';
    this.timer = 2.5;
    this.turn = 0;
    this.hit = 0;
    this.shake = 0;
    this.heroes = [];
    this.pool = [];
    this.pace = 1;
    this.pulse = 0;
    this.packX = 24;
    this.packY = sceneH + 20;
  }
  setParty(s) {
    const ids = P.joined(s);
    const slots = [[0.56, 2], [0.73, -5], [0.9, 3]];
    this.heroes = ids.map((id, i) => {
      const st = P.heroStats(s, id);
      const old = this.heroes.find((h) => h.id === id);
      return { id, x: W * slots[i][0], dy: slots[i][1], ox: old ? old.ox : 0, pose: old ? old.pose : null, poseT: 0, flash: 0, atk: st.atk, tier: Skills.bestTier(s, id), outfit: s.heroes[id].outfit, phase: i * 1.7 };
    });
    this.pet = s.wardrobe.pet ? W_.COSMETICS[s.wardrobe.pet].pet : null;
  }
  spawn(lv) {
    const n = 1 + Math.floor(Math.random() * Math.min(3, this.heroes.length));
    this.foes = [];
    for (let i = 0; i < n; i++) {
      const id = this.pool[Math.floor(Math.random() * this.pool.length)];
      const m = G.MONSTERS[id];
      this.foes.push({ id, m, x: -40 - i * 46, dy: [0, 8, -8][i], hits: 2 + Math.floor(Math.random() * 3), max: 0, ox: 0, flash: 0, seed: Math.random() * 6, lv });
      this.foes[i].max = this.foes[i].hits;
    }
    this.state = 'closing';
  }
  update(dt, lv) {
    const speed = WALK_SPEED * this.pace;
    this.fx.update(dt);
    this.sk.update(dt);
    this.weather.update(dt);
    this.shake = Math.max(0, this.shake - dt * 22);
    this.pulse = Math.max(0, this.pulse - dt * 2.4);
    this.heroes.forEach((h) => {
      h.ox *= Math.pow(0.001, dt);
      h.flash = Math.max(0, h.flash - dt * 5);
      if (h.poseT > 0) {
        h.poseT -= dt;
        if (h.poseT <= 0) h.pose = null;
      }
    });
    this.foes.forEach((f) => {
      f.ox *= Math.pow(0.001, dt);
      f.flash = Math.max(0, f.flash - dt * 5);
    });
    this.pops.forEach((p) => {
      p.t += dt;
      p.y -= dt * (p.t < 0.2 ? 40 : 8);
    });
    this.pops = this.pops.filter((p) => p.t < 0.7);
    this.coins.forEach((c) => {
      c.t += dt;
      const k = Math.min(1, c.t / c.dur);
      c.x = c.x0 + (this.packX - c.x0) * k * k;
      c.y = c.y0 + (this.packY - c.y0) * k * k - Math.sin(k * Math.PI) * 26;
    });
    if (this.coins.some((c) => c.t >= c.dur)) this.pulse = 1;
    this.coins = this.coins.filter((c) => c.t < c.dur);
    if (this.state === 'walk' || this.state === 'closing') {
      // The party faces left, the way a handscroll unrolls, so the world slides past to the right.
      this.x += speed * dt;
      if (this.pace > 1.2 && Math.random() < dt * 22) {
        const h = this.heroes[Math.floor(Math.random() * this.heroes.length)];
        if (h) this.fx.add({ x: h.x + 8, y: this.fy + h.dy - 1, vx: 30, vy: -8 - Math.random() * 8, life: 0.45, c: '#d9c9a3', s: Math.random() > 0.6 ? 2 : 1 });
      }
    }
    if (this.state === 'walk') {
      this.timer -= dt * Math.min(2, this.pace);
      if (this.timer <= 0 && this.pool.length && this.heroes.length) this.spawn(lv);
    } else if (this.state === 'closing') {
      this.foes.forEach((f) => { f.x += speed * dt; });
      if (this.foes[0].x >= W * 0.32) {
        this.state = 'fight';
        this.hit = 0.15;
      }
    } else if (this.state === 'fight') {
      this.hit -= dt * this.pace;
      if (this.hit <= 0) {
        this.hit = 0.48;
        this.exchange();
      }
    }
  }
  // Fight noises are for someone who is watching. A phone left on a desk should stay quiet.
  sound(name) {
    if (Date.now() - game.lastTouch < QUIET_AFTER_MS && Math.random() < 0.6) audio.sfx(name);
  }
  // A little shower of sparkles over the party when the pack is emptied.
  burstAt(x, y) {
    this.fx.burst(x, y, 'star', 28, 90);
  }
  exchange() {
    const live = this.foes.filter((f) => f.hits > 0);
    if (!live.length) {
      this.state = 'walk';
      this.foes = [];
      this.timer = 3 + Math.random() * 3.5;
      return;
    }
    // Now and then a foe gets a blow in, so the party is visibly doing something.
    if (Math.random() < 0.18) {
      const f = live[0];
      const h = this.heroes[Math.floor(Math.random() * this.heroes.length)];
      f.ox = 14;
      h.flash = 1;
      h.pose = 'hurt';
      h.poseT = 0.22;
      h.ox = 5;
      this.pops.push({ x: h.x, y: this.fy + h.dy - 42, t: 0, text: String(Math.max(1, Math.round(h.atk * 0.25 * (0.8 + Math.random() * 0.4)))), color: '#ec7a4e', k: 1 });
      this.sound('hit');
      return;
    }
    const h = this.heroes[this.turn++ % this.heroes.length];
    const t = live[Math.floor(Math.random() * live.length)];
    const center = { x: t.x + t.ox, y: this.fy + t.dy - 22 };
    const crit = Math.random() < 0.15;
    t.flash = 1;
    t.ox = -5;
    t.hits -= crit ? 2 : 1;
    // Blows on the road show how far each hero has come. They stop short of the top tier's full display,
    // because this scene plays for hours, usually with nobody watching.
    const from = { x: h.x - 6, y: this.fy + h.dy - 26 };
    const ground = this.fy + t.dy;
    const tier = Math.min(2, h.tier || 0);
    if (h.id === 'ruo') {
      h.pose = 'cast';
      this.sk.impact('wood', tier, from, center, ground);
    } else if (h.id === 'zhuo') {
      h.pose = 'atk';
      h.ox = -12;
      this.sk.impact('earth', tier, from, center, ground);
      this.shake = crit ? 5 : 3;
    } else {
      h.pose = crit ? 'thrust' : 'atk';
      h.ox = -18;
      this.sk.impact('slash', tier, from, center, ground, 'metal');
    }
    h.poseT = 0.26;
    this.sound(crit ? 'crit' : 'hit');
    this.pops.push({ x: center.x, y: center.y - 14, t: 0, text: String(Math.round(h.atk * (crit ? 2.2 : 1.2) * (0.85 + Math.random() * 0.3))), color: crit ? '#f7dd7a' : '#ffffff', k: crit ? 2 : 1 });
    if (t.hits <= 0) {
      this.fx.burst(center.x, center.y, t.m.el, 20, 80);
      this.sound('ko');
      for (let i = 0; i < 4; i++) {
        this.coins.push({ t: -i * 0.05 + 0.05, dur: 0.6 + i * 0.05, x0: center.x + (Math.random() - 0.5) * 14, y0: center.y, x: center.x, y: center.y, icon: i === 3 ? 'xp' : 'coin' });
      }
    }
  }
  draw(now) {
    const sx = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    const r = art.road(this.theme, W, this.sceneH, this.gy);
    ui.setClip(0, 0, W, this.sceneH);
    ui.ctx.drawImage(r.sky, 0, 0);
    r.layers.forEach((l) => ui.tileX(l.cv, -this.x * l.speed, l.y));
    ui.tileX(r.ground.cv, -this.x + sx, r.ground.y);
    const tint = dayTint(this.theme, now);
    if (tint) ui.tint(tint.c, this.sceneH, tint.a);
    const t = game.t;
    const units = [];
    this.heroes.forEach((h) => units.push({ y: this.fy + h.dy, h }));
    this.foes.forEach((f) => { if (f.hits > 0) units.push({ y: this.fy + f.dy, f }); });
    units.sort((a, b) => a.y - b.y);
    const walking = this.state === 'walk' || this.state === 'closing';
    const fps = 9 * Math.min(2, this.pace);
    units.forEach((u) => {
      if (u.h) {
        const h = u.h;
        const pose = h.pose || (walking ? 'walk' + (Math.floor(t * fps + h.phase) % 6) : Math.floor(t * 1.6 + h.phase) % 2 ? 'idle1' : 'idle0');
        const a = art.hero(h.id, pose, h.outfit);
        const x = Math.round(h.x + h.ox - a.w / 2 + sx), y = u.y - a.h + 3;
        ui.alpha(0.28);
        ui.rect(h.x - 10, u.y - 1, 20, 3, '#000000');
        ui.alpha(1);
        ui.img(a, x, y);
        if (h.flash > 0) {
          ui.alpha(Math.min(1, h.flash * 1.3));
          ui.img(a.white(), x, y);
          ui.alpha(1);
        }
      } else {
        const f = u.f;
        const a = art.monster(f.m.art, Math.floor(t * 2.2 + f.seed) % 2);
        const x = Math.round(f.x + f.ox - a.w / 2 + sx), y = u.y - a.h + 2;
        ui.alpha(0.28);
        ui.rect(f.x - a.w * 0.34, u.y - 1, a.w * 0.68, 3, '#000000');
        ui.alpha(1);
        ui.img(a, x, y);
        if (f.flash > 0) {
          ui.alpha(Math.min(1, f.flash * 1.3));
          ui.img(a.white(), x, y);
          ui.alpha(1);
        }
        ui.bar(f.x - 13, u.y + 2, 26, 4, Math.max(0, f.hits) / f.max, '#d8503c');
      }
    });
    if (this.pet && this.heroes.length) {
      const a = art.pet(this.pet, walking ? Math.floor(t * 6) % 2 : 0);
      ui.img(a, Math.round(this.heroes[0].x - 28 + sx), this.fy + 6 - a.h);
    }
    this.fx.draw(sx, 0);
    this.sk.draw(false);
    ui.tileX(r.fore.cv, -this.x * r.fore.speed, r.fore.y);
    this.weather.draw(this.sceneH);
    this.pops.forEach((p) => {
      ui.alpha(p.t > 0.5 ? Math.max(0, (0.7 - p.t) / 0.2) : 1);
      ui.numberBig(p.text, p.x, p.y, p.color, p.k);
      ui.alpha(1);
    });
    ui.endClip();
    this.coins.forEach((c) => { if (c.t > 0) ui.img(art.icon(c.icon), c.x - 8, c.y - 8); });
  }
}

class Road {
  constructor(p) {
    this.after = p && p.after;
    this.barH = nav.height();
    this.sceneH = H - this.barH - PANEL_H;
    const s = store.get();
    this.view = null;
    this.ci = -1;
    this.syncView(s);
    this.banner = null;
    this.bannerQ = [];
    this.forecast = null;
    this.forecastKey = '';
    this.lantern = null;
    this.lanternIn = 8 + Math.random() * 6;
  }
  syncView(s) {
    const ci = Idle.currentChapterIndex(s);
    if (ci !== this.ci) {
      this.ci = ci;
      this.ch = CHAPTERS[ci];
      const old = this.view;
      this.view = new RoadView(this.sceneH, this.ch.theme);
      if (old) this.view.x = old.x;
    }
    this.view.setParty(s);
    this.view.pool = Idle.poolFor(ci);
    this.view.packX = 24;
    this.view.packY = this.sceneH + 51;
  }
  enter() {
    const s = store.get();
    audio.bgm('road');
    store.push();
    if (s.steps.lastView && steps.state.status !== steps.S.WORKING) steps.refresh();
    // A road event's fight finishes here: its reward and the road beyond it come next.
    if (this.after) {
      const after = this.after;
      this.after = null;
      after();
      return;
    }
    this.afterStory();
  }
  resume() {
    this.syncView(store.get());
    this.afterStory();
  }
  // Chapter openers and first-time tips wait until nothing else is on screen.
  afterStory() {
    const s = store.get();
    if (game.top() !== this) return;
    if (!Idle.lapping(s) && !s.flags.seen[this.ch.intro] && this.ch.intro) {
      O.story(this.ch.intro, () => this.afterStory());
      return;
    }
    if (this.showAway()) return;
    if (O.tip('road', TIPS.road)) return;
    if (s.heroes.ruo.joined && E.unlocked(s, 'dispatch') && O.tip('station', TIPS.station)) return;
    if (E.unlocked(s, 'garden') && O.tip('trials', TIPS.trials)) return;
    if (E.unlocked(s, 'gear') && O.tip('gear', TIPS.gear)) return;
    if (E.unlocked(s, 'gacha') && O.tip('gacha', TIPS.gacha)) return;
  }
  // What happened while the player was away.
  showAway() {
    const a = game.away;
    if (!a) return false;
    game.away = null;
    const s = store.get();
    const p = s.idle.pack;
    const rows = [{ icon: 'clock', label: '离开了', value: ui.dur(a.secs), valueColor: UI.text }];
    if (a.cleared) rows.push({ icon: 'sword', label: '路上通过', value: `${a.cleared} 站`, valueColor: UI.jade });
    rows.push({ icon: 'coin', label: '铜钱', value: '+' + ui.num(p.coin) });
    rows.push({ icon: 'xp', label: '阅历', value: '+' + ui.num(p.xp), valueColor: UI.jade });
    const spirits = Object.keys(p.spirits).reduce((n, k) => n + p.spirits[k], 0);
    if (spirits) rows.push({ icon: 'spirit', label: '妖灵', value: '×' + spirits, valueColor: UI.violet });
    if ((p.gear || []).length) rows.push({ icon: 'gear', label: '行装', value: '×' + p.gear.length, valueColor: UI.peach });
    if (p.iron >= 1) rows.push({ icon: 'iron', label: '精铁', value: '+' + Math.floor(p.iron), valueColor: UI.blue });
    if (p.tickets >= 1) rows.push({ icon: 'letter', label: '星笺', value: '+' + Math.floor(p.tickets), valueColor: UI.gold });
    O.modal({
      title: a.full ? '行囊装满了' : '你回来了',
      rows,
      buttons: [{ label: '收进行囊', kind: 'primary', sound: 'coin', onTap: () => this.collect() }],
    });
    return true;
  }
  update(dt) {
    const s = store.get();
    const now = clock.now();
    const r = Idle.rates(s, now);
    // Real steps can carry the party a long way at once. Show it as a burst of speed.
    if (this.lastLi !== undefined && s.idle.li - this.lastLi >= 0.5) {
      this.dash = 3.5;
      this.bannerQ.push('神行!走过的路,都算数');
    }
    this.lastLi = s.idle.li;
    this.dash = Math.max(0, (this.dash || 0) - dt);
    this.view.pace = (this.dash > 0 ? 3 : 1) * r.haste * (1 + (r.m.march - 1) * 0.5);
    this.view.update(dt, r.lv);
    // Chapter may have moved on while the march ran.
    if (Idle.currentChapterIndex(s) !== this.ci) this.syncView(s);
    if (s.idle.log.length) {
      s.idle.log.splice(0).forEach((e) => {
        if (e.kind === 'clear') this.bannerQ.push('通过 ' + NODE_NAME[NODE_INDEX[e.node].node.type]);
        if (e.kind === 'chest') this.bannerQ.push('拾得脚力宝箱');
        if (e.kind === 'block') this.bannerQ.push('前路受阻');
        if (e.kind === 'lap') this.bannerQ.push(`第 ${e.lap + 1} 周 · 故地重游`);
      });
    }
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    if (!this.banner && this.bannerQ.length) this.banner = { text: this.bannerQ.shift(), t: 1.6 };
    this.updateLantern(s, dt, now);
  }
  // A sky lantern drifts across now and then, for whoever happens to be watching.
  updateLantern(s, dt, now) {
    const l = this.lantern;
    if (l) {
      l.t += dt;
      l.x -= LANTERN_SPEED * dt;
      l.y -= 2.5 * dt;
      if (Math.random() < dt * 5) this.view.fx.add({ x: l.x + (Math.random() - 0.5) * 6, y: l.y + 10, vx: 0, vy: 7, life: 0.7, c: Math.random() > 0.5 ? '#f7dd7a' : '#ec7a4e', s: 1 });
      if (l.x < -20) this.lantern = null;
      return;
    }
    this.lanternIn -= dt;
    if (this.lanternIn > 0) return;
    this.lanternIn = 50 + Math.random() * 40;
    if (!s.flags.intro || Finds.left(s, Idle.dayOf(now)) <= 0) return;
    const top = D.contentTop + 58;
    this.lantern = { x: W + 12, y: top + Math.random() * Math.max(10, this.sceneH * 0.42 - top), t: 0 };
  }
  catchLantern() {
    const s = store.get();
    const l = this.lantern;
    if (!l) return;
    this.lantern = null;
    const got = Finds.claim(s, clock.now());
    if (!got) return;
    store.persist();
    audio.sfx('star');
    audio.buzz('light');
    const v = this.view;
    v.fx.burst(l.x, l.y, 'fire', 22, 70);
    const icon = { coin: 'coin', herb: 'sprout', iron: 'iron', dust: 'dust' }[got.kind];
    for (let i = 0; i < 5; i++) v.coins.push({ t: -i * 0.05, dur: 0.7 + i * 0.05, x0: l.x + (Math.random() - 0.5) * 12, y0: l.y, x: l.x, y: l.y, icon: got.kind === 'coin' && i === 4 ? 'xp' : icon });
    let what;
    if (got.kind === 'coin') what = `铜钱 +${ui.num(got.coin)} 阅历 +${ui.num(got.xp)}`;
    else if (got.kind === 'herb') what = Object.keys(got.herbs).map((k) => `${W_.CROPS[k].name} ×${got.herbs[k]}`).join(' ');
    else if (got.kind === 'iron') what = `精铁 +${got.iron}`;
    else what = `星砂 +${got.dust}`;
    this.bannerQ.unshift('拾得天灯 · ' + what);
    this.banner = null;
  }
  drawLantern() {
    const l = this.lantern;
    if (!l) return;
    const a = art.icon('skylamp');
    const x = Math.round(l.x - a.w / 2), y = Math.round(l.y - a.h / 2 + Math.sin(l.t * 2.2) * 2);
    // A soft glow that breathes, so it reads as a light and catches the eye against any sky.
    const glow = 0.1 + 0.05 * Math.sin(l.t * 5);
    ui.alpha(glow);
    ui.rect(x - 5, y - 3, a.w + 10, a.h + 6, '#f7dd7a');
    ui.rect(x - 2, y - 6, a.w + 4, a.h + 12, '#f7dd7a');
    ui.alpha(1);
    ui.img(a, x, y);
    ui.hit('road-lantern', x - 12, y - 10, a.w + 24, a.h + 20, () => this.catchLantern(), { sound: null });
  }
  // The goal in hand: claim it, or be shown what it pays and taken to where it gets done.
  questTap(c) {
    const s = store.get();
    if (c.done) {
      const got = Quests.claim(s);
      Idle.nudge(s);
      store.persist();
      audio.sfx('coin');
      audio.buzz('light');
      this.view.burstAt(W / 2, this.sceneH - 30);
      const parts = [`铜钱 +${ui.num(got.coin)}`];
      if (got.dust) parts.push(`星砂 +${got.dust}`);
      if (got.tickets) parts.push(`星笺 +${got.tickets}`);
      Object.keys(got.items).forEach((k) => parts.push(`${G.ITEMS[k].name} ×${got.items[k]}`));
      ui.toast(`${got.n > 1 ? `路引连过 ${got.n} 条` : '路引'}:${parts.join(' ')}`, 1.8);
      return;
    }
    const r = c.reward;
    const rows = [{ icon: 'quest', label: '进度', value: `${c.have} / ${c.need}`, valueColor: UI.text }, { icon: 'coin', label: '铜钱', value: '+' + ui.num(r.coin) }];
    if (r.dust) rows.push({ icon: 'dust', label: '星砂', value: '+' + r.dust, valueColor: UI.blue });
    if (r.tickets) rows.push({ icon: 'letter', label: '星笺', value: '+' + r.tickets, valueColor: UI.gold });
    Object.keys(r.items).forEach((k) => rows.push({ icon: G.ITEMS[k].icon, label: G.ITEMS[k].name, value: '×' + r.items[k] }));
    const go = QUEST_GO[c.q.go];
    const buttons = [{ label: '知道了', kind: 'ghost', sound: 'back' }];
    if (go && !c.locked) buttons.push({ label: '前往', kind: 'primary', onTap: go });
    O.modal({
      title: `路引 ${c.index + 1} / ${c.total}`,
      text: c.q.text + (c.locked ? '。这一处还没开张,沿着路再走一走。' : go ? '。' : '。队伍正朝那里走,到了会等你。'),
      rows, buttons,
    });
  }
  // A travel pass is a slip of paper, so this one strip is drawn as paper among the lacquer panels.
  drawQuest(s, y) {
    const c = Quests.current(s);
    const m = 5, w = W - m * 2, h = 23;
    const done = !!c && c.done;
    ui.rect(m + 1, y, w - 2, h, UI.ink);
    ui.rect(m, y + 1, w, h - 2, UI.ink);
    ui.rect(m + 1, y + 1, w - 2, h - 2, done ? '#f2e9d0' : '#d9c9a3');
    ui.rect(m + 1, y + 1, w - 2, 1, '#fff8e4');
    ui.rect(m + 1, y + h - 3, w - 2, 2, '#a8956f');
    // The red seal every pass carries.
    ui.rect(m + 5, y + 4, 15, 15, '#8e2a25');
    ui.rect(m + 6, y + 5, 13, 13, '#c8402f');
    ui.rect(m + 8, y + 7, 9, 1, '#f2e9d0');
    ui.rect(m + 8, y + 11, 9, 1, '#f2e9d0');
    ui.rect(m + 8, y + 15, 9, 1, '#f2e9d0');
    ui.rect(m + 12, y + 7, 1, 9, '#f2e9d0');
    if (!c) {
      ui.text('路引已尽,往后的路自己走', m + 26, y + 5, '#6c3f26');
      return;
    }
    ui.text(c.q.text, m + 26, y + 5, '#241a10');
    if (done) {
      ui.button('road-quest', W - m - 50, y + 2, 46, h - 4, { label: '领取', kind: 'primary', badge: true, sound: null, onTap: () => this.questTap(c) });
      return;
    }
    const prog = c.need > 1 ? `${ui.num(c.have)}/${ui.num(c.need)}` : '';
    ui.text('>', W - m - 8, y + 5, '#8e2a25', { align: 'r' });
    if (prog) ui.text(prog, W - m - 18, y + 5, '#6c3f26', { align: 'r' });
    ui.hit('road-quest', m, y, w, h, () => this.questTap(c), { label: 'road-quest' });
  }
  // The region's road as a row of stops, with the party's place along it.
  drawRoute(s, y, st) {
    if (Idle.lapping(s) || st.kind === 'ending' || !st.node) return;
    const nodes = this.ch.nodes.filter((n) => n.type !== 'chest');
    const x0 = 12, x1 = W - 12;
    const step = (x1 - x0) / (nodes.length - 1);
    const at = nodes.indexOf(st.node);
    ui.rect(x0, y + 3, x1 - x0, 3, UI.ink);
    ui.rect(x0, y + 4, x1 - x0, 1, '#4a4268');
    const px = at <= 0 ? x0 + step * 0 * st.progress : x0 + step * (at - 1 + st.progress);
    if (px > x0) ui.rect(x0, y + 4, Math.round(px - x0), 1, '#e8b33a');
    nodes.forEach((n, i) => {
      const x = Math.round(x0 + step * i);
      const done = !!s.progress.cleared[n.id];
      const big = n.type === 'boss';
      const r = big ? 4 : 3;
      const here = i === at;
      const blink = here && Math.floor(game.t * 2.5) % 2 === 0;
      const fill = done ? '#e8b33a' : here ? (blink ? '#fff2c8' : n.type === 'boss' ? '#ec7a4e' : '#7fd1a4') : big ? '#8e2a25' : n.type === 'elite' ? '#6b4a94' : n.type === 'event' ? '#2f6db5' : '#3a3350';
      ui.rect(x - r, y + 4 - r, r * 2 + 1, r * 2 + 1, UI.ink);
      ui.rect(x - r + 1, y + 5 - r, r * 2 - 1, r * 2 - 1, fill);
      if (done) ui.rect(x - r + 1, y + 5 - r, r * 2 - 1, 1, '#f7dd7a');
    });
    // The party itself, as a small marker riding the line.
    const mx = Math.round(Math.max(x0, px));
    ui.rect(mx - 2, y - 5, 5, 5, UI.ink);
    ui.rect(mx - 1, y - 4, 3, 3, '#f2e9d0');
    ui.rect(mx, y, 1, 2, UI.ink);
  }
  collect() {
    const s = store.get();
    const day = Idle.dayOf(clock.now());
    const got = Idle.collect(s);
    Daily.mark(s, 'collect', day);
    store.persist();
    audio.sfx('coin');
    audio.buzz('light');
    const v = this.view;
    v.pulse = 1;
    this.view.burstAt(W / 2, this.sceneH - 40);
    if (got.ups.length) {
      audio.sfx('level');
      const u = got.ups[0];
      ui.toast(`${G.HEROES[u.id].name}升到了 ${u.lv} 级${got.ups.length > 1 ? ',全队都变强了' : ''}`);
    } else if (got.gear.length) {
      const best = got.gear.reduce((a, g) => (g.rar > a.rar ? g : a));
      ui.toast(`拾得行装 ${got.gear.length} 件,最好的是${Gear.name(best)}`, 1.6);
    } else ui.toast(`铜钱 +${ui.num(got.coin)}  阅历 +${ui.num(got.xp)}`, 1.2);
    v.setParty(s);
  }
  // The forecast only needs recomputing when the party or the target changes.
  forecastFor(s, node) {
    if (!node || !node.foes) return null;
    const key = node.id + ':' + Math.round(P.power(s));
    if (key !== this.forecastKey) {
      this.forecastKey = key;
      this.forecast = Idle.forecastLabel(Idle.estimate(s, node, 6));
    }
    return this.forecast;
  }
  boostSheet() {
    const s = store.get();
    const b = W_.BOOSTS;
    const now = clock.now();
    O.modal({
      title: '加快脚步',
      text: `御风让收益翻倍,缩地立得收益。星砂主要靠走路换来,也能从日课和天阶攒到。不用这些,队伍也一样在走。`,
      rows: [
        { icon: 'dust', label: '持有星砂', value: ui.fmt(s.stardust), valueColor: UI.blue },
        { icon: 'wing', label: '御风还有', value: ui.dur(s.idle.hasteSecs), valueColor: UI.jade },
      ],
      stack: true,
      buttons: [
        { label: `御风 30 分钟 · ${b.haste.cost} 星砂`, kind: s.stardust >= b.haste.cost ? 'jade' : 'normal', onTap: () => {
          if (!Boosts.buyHaste(s)) return ui.toast(s.stardust < b.haste.cost ? '星砂不够' : '御风已经攒满了');
          store.persist();
          audio.sfx('star');
          return this.boostSheet();
        } },
        { label: `缩地 1 小时 · ${b.jump.cost} 星砂`, kind: s.stardust >= b.jump.cost ? 'jade' : 'normal', onTap: () => {
          if (!Boosts.useJump(s, now)) return ui.toast('星砂不够');
          store.persist();
          audio.sfx('gate');
          return this.boostSheet();
        } },
        { label: '去步虚台', kind: 'normal', onTap: () => nav.go('altar') },
        { label: '关闭', kind: 'ghost', sound: 'back' },
      ],
    });
  }
  act(st) {
    const s = store.get();
    if (st.kind === 'ending') return game.go('ending', { replayChoice: true });
    return Campaign.enter(st.node.id, {
      from: 'road',
      back: () => {
        // A fight inside an event replaces the scene, so reach whichever road is on screen now.
        const t = game.stack[0];
        if (t && t.resume) t.resume();
      },
    });
  }
  drawTop(s, st, now) {
    ui.header(this.ch.name, null, s.stardust, s.coin);
    const y = D.contentTop;
    // Stars lit so far, then what the party is worth.
    const lit = E.starsLit(s);
    for (let i = 0; i < 7; i++) {
      const on = i < lit;
      const x = 9 + i * 8;
      ui.rect(x, y + 3, 5, 5, UI.ink);
      ui.rect(x + 1, y + 4, 3, 3, on ? '#f7dd7a' : '#3a3350');
    }
    const power = ui.num(P.power(s));
    ui.img(art.icon('power'), W - ui.font.width(power) - 24, y - 3);
    ui.text(power, W - 6, y, UI.gold, { align: 'r', outline: true });
    if (lit < 7 && !Idle.campaignDone(s)) ui.text(`下一颗:${STAR_NAMES[Math.min(s.progress.stars, 6)]}`, 68, y, UI.text, { outline: true });
    this.drawRoute(s, y + 22, st);
    // What is helping the party along right now: a meal, and today's walking.
    const r = Idle.multipliers(s, now);
    const hours = (secs) => (secs >= 3600 ? Math.ceil(secs / 3600) + '时' : Math.ceil(secs / 60) + '分');
    let bx = 8;
    const by = y + 36;
    if (r.meal) {
      ui.img(art.icon(r.meal.icon), bx, by - 3);
      const left = hours(s.idle.mealSecs);
      ui.text(left, bx + 17, by, UI.peach, { outline: true });
      bx += 23 + ui.font.width(left);
    }
    if (r.stride > 0) {
      ui.img(art.icon('boot'), bx, by - 3);
      ui.text(`+${Math.round(r.stride * 100)}%`, bx + 17, by, UI.jade, { outline: true });
    }
  }
  drawPack(s, y, now) {
    const m = 5, w = W - m * 2, h = 50;
    ui.panel(m, y, w, h);
    const cap = Idle.capSecs(s);
    const fill = Math.min(1, s.idle.secs / cap);
    const pulse = this.view.pulse;
    ui.img(art.icon('bag'), m + 9, y + 9 - Math.round(pulse * 2));
    ui.bar(m + 8, y + 29, 19, 5, fill, fill >= 1 ? '#ec7a4e' : '#e8b33a');
    const tx = m + 33;
    const label = fill >= 1 ? '行囊满了' : '行囊';
    ui.text(label, tx, y + 7, fill >= 1 ? UI.red : UI.gold);
    ui.text(fill >= 1 ? `${Math.round(cap / 3600)}时` : `${ui.dur(s.idle.secs)} / ${Math.round(cap / 3600)}时`, tx + ui.font.width(label) + 8, y + 7, UI.dim);
    let x = ui.iconNum('coin', ui.num(s.idle.pack.coin), tx, y + 28, UI.gold);
    x = ui.iconNum('xp', ui.num(s.idle.pack.xp), x, y + 28, UI.jade);
    const spirits = Object.keys(s.idle.pack.spirits).reduce((n, k) => n + s.idle.pack.spirits[k], 0);
    if (spirits) x = ui.iconNum('spirit', spirits, x, y + 28, UI.violet);
    const finds = (s.idle.pack.gear || []).length;
    if (finds && x + 28 < W - m - 62) ui.iconNum('gear', finds, x, y + 28, UI.peach);
    const empty = Idle.packEmpty(s);
    ui.button('road-collect', W - m - 62, y + 7, 56, h - 14, {
      label: '收取', kind: empty ? 'normal' : 'primary', disabled: empty, badge: fill >= 0.5, sound: null, onTap: () => this.collect(),
    });
  }
  drawNode(s, y, st) {
    const m = 5, w = W - m * 2, h = 50;
    ui.panel(m, y, w, h);
    const node = st.node;
    let title, sub, subColor = UI.dim;
    const btn = { label: '', kind: 'primary', show: false };
    const foeNames = node.foes ? node.foes.map((id) => G.MONSTERS[id].name).join(' ') : '';
    if (st.kind === 'ending') {
      title = '北辰台';
      sub = '斗柄还在等你。';
      btn.show = true;
      btn.label = '上台';
    } else if (st.kind === 'lap') {
      title = `第 ${st.lap + 1} 周 · 故地重游`;
      sub = `${foeNames} Lv ${st.lv}`;
    } else if (st.kind === 'hold') {
      title = node.type === 'boss' ? `${this.ch.star}星位` : node.type === 'event' ? '路遇' : '前方有事';
      sub = node.foes ? `${foeNames} Lv ${st.lv}` : '路上,总会遇到些什么。';
      btn.show = true;
      btn.label = node.type === 'boss' ? '挑战' : '前往';
      btn.kind = node.type === 'boss' ? 'danger' : 'primary';
      btn.badge = true;
    } else if (st.kind === 'blocked') {
      title = '前路受阻';
      sub = `${foeNames}太强 · ${ui.dur(st.retry)}后再试`;
      subColor = UI.red;
      btn.show = true;
      btn.label = '亲自打';
      btn.kind = 'normal';
    } else {
      title = `前往 ${NODE_NAME[node.type]}`;
      sub = node.foes ? `${foeNames} Lv ${st.lv}` : '路上,总会遇到些什么。';
    }
    ui.text(title, m + 9, y + 6, UI.gold);
    const fc = st.kind !== 'lap' ? this.forecastFor(s, node) : null;
    if (fc) ui.text(fc.text, m + 13 + ui.font.width(title), y + 6, fc.color);
    ui.text(sub, m + 9, y + 20, subColor);
    if (st.kind === 'march' || st.kind === 'lap') {
      ui.bar(m + 9, y + 36, w - (btn.show ? 88 : 20), 5, st.progress, '#7fd1a4');
    } else if (st.kind === 'hold') {
      ui.bar(m + 9, y + 36, w - 88, 5, 1, '#f7dd7a');
    }
    if (btn.show) {
      ui.button('road-act', W - m - 62, y + 7, 56, h - 14, { label: btn.label, kind: btn.kind, badge: btn.badge, onTap: () => this.act(st) });
    } else if (st.li) {
      const r = Idle.readout(s, clock.now());
      const left = Math.max(0, st.li - st.li * st.progress) / Math.max(0.01, r.march) * 60;
      ui.text(`约 ${ui.dur(left)}`, W - m - 9, y + 6, UI.dim, { align: 'r' });
    }
  }
  drawStrip(s, y, now) {
    const m = 5;
    const h = 28;
    const haste = s.idle.hasteSecs;
    ui.button('road-boost', m, y, 90, h, {
      icon: 'wing', label: haste > 0 ? ui.dur(haste) : '加快脚步', kind: haste > 0 ? 'jade' : 'normal', alignLeft: true, onTap: () => this.boostSheet(),
    });
    // What a minute on the road is worth right now, with every bonus counted.
    const rate = Idle.readout(s, now);
    const boosted = rate.m.coin > 1.001 || haste > 0;
    // A narrow phone with large numbers keeps the coins, then the experience, then the unit, as room allows.
    const edge = W - m - 60;
    const cw = 17 + ui.font.width(ui.num(rate.coin)) + 5, xw = 17 + ui.font.width(ui.num(rate.xp)) + 2, uw = ui.font.width('/分');
    let x = m + 95;
    ui.iconNum('coin', ui.num(rate.coin), x, y + 8, boosted ? UI.gold : UI.dim);
    x += cw;
    if (x + xw <= edge) {
      ui.iconNum('xp', ui.num(rate.xp), x, y + 8, boosted ? UI.jade : UI.dim);
      x += xw;
    }
    if (x + uw <= edge) ui.text('/分', x, y + 8, UI.faint);
    ui.button('road-map', W - m - 56, y, 56, h, { label: '路程图', kind: 'normal', onTap: () => game.go('map') });
  }
  draw() {
    const s = store.get();
    const now = clock.now();
    this.view.draw(now);
    const st = Idle.status(s);
    this.drawLantern();
    this.drawTop(s, st, now);
    if (this.banner) {
      const tw = ui.font.width(this.banner.text);
      const y = this.sceneH - 26;
      ui.alpha(Math.min(1, this.banner.t * 4));
      ui.rect(W / 2 - tw / 2 - 12, y, tw + 24, 18, '#14121f');
      ui.rect(W / 2 - tw / 2 - 12, y + 1, 2, 16, '#e8b33a');
      ui.rect(W / 2 + tw / 2 + 10, y + 1, 2, 16, '#e8b33a');
      ui.text(this.banner.text, W / 2, y + 3, UI.gold, { align: 'c' });
      ui.alpha(1);
    }
    const y0 = this.sceneH;
    ui.rect(0, y0, W, H - y0, '#14121f');
    ui.rect(0, y0, W, 2, UI.line);
    this.drawQuest(s, y0 + 4);
    this.drawPack(s, y0 + 29, now);
    this.drawNode(s, y0 + 82, st);
    this.drawStrip(s, y0 + 136, now);
    nav.draw('road');
  }
}

game.register('road', Road);

module.exports = { RoadView, dayTint };
