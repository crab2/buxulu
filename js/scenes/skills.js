// Where skills are levelled. A small stage at the top plays the chosen skill for real, using the same
// choreography as the battle screen, and it can show any tier: what you have, and what you are working toward.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const audio = require('../core/audio.js');
const store = require('../systems/store.js');
const G = require('../data/game.js');
const Skills = require('../systems/skills.js');
const Idle = require('../systems/idle.js');
const Daily = require('../systems/daily.js');
const clock = require('../core/clock.js');
const Cast = require('./cast.js');
const { Particles } = require('../core/fx.js');
const { SkillFx } = require('../core/skillfx.js');
const { CHAPTERS } = require('../data/chapters.js');
const { UI } = require('../core/palette.js');

const { W, H } = D;
const ROW_H = 52;
const PAUSE = 1.1; // seconds between showings
const DUMMIES = ['vine', 'xiao'];

class SkillStage {
  constructor(top, h, theme) {
    this.top = top;
    this.h = h;
    this.theme = theme;
    this.fx = new Particles(220);
    this.sk = new SkillFx(this.fx, { x: 0, y: top, w: W, h });
    this.vis = {};
    this.pops = [];
    this.shake = 0;
    this.stop = 0;
    this.dim = 0;
    this.dimTo = 0;
    this.cast = null;
    this.banner = null;
    this.runner = new game.Runner();
    this.hero = null;
    this.foes = [];
  }
  // Shows one skill at one level, over and over, until told otherwise.
  play(heroId, id, lv, outfit) {
    this.runner = new game.Runner();
    this.fx.list.length = 0;
    this.sk.clear();
    this.pops = [];
    this.cast = null;
    this.dimTo = 0;
    this.outfit = outfit;
    const base = this.top + this.h - 12;
    this.hero = { key: 'hero', id: heroId, side: 'hero', alive: true };
    this.foes = DUMMIES.map((m, i) => ({ key: 'foe' + i, side: 'enemy', alive: true, def_: G.MONSTERS[m] }));
    this.vis = {
      hero: { x: W * 0.8, y: base, ox: 0, oy: 0, flash: 0, pose: 'idle', poseT: 0 },
      foe0: { x: W * 0.2, y: base - 8, ox: 0, oy: 0, flash: 0, pose: 'idle', poseT: 0 },
      foe1: { x: W * 0.42, y: base, ox: 0, oy: 0, flash: 0, pose: 'idle', poseT: 0 },
    };
    this.runner.run(this.loop(id, lv));
  }
  *loop(id, lv) {
    const sk = Skills.at(id, lv);
    yield 0.25;
    for (;;) {
      const use = { type: 'use', actor: this.hero, name: sk.name, pose: sk.pose, el: sk.el, fx: sk.fx, id, tier: sk.tier, lv, area: sk.target, charged: false, support: Skills.supportOnly(sk), target: this.targetFor(sk) };
      yield* Cast.use(this, use);
      if (sk.heal || sk.revive) {
        yield* Cast.heal(this, { type: 'heal', target: this.hero, amount: 0 });
      } else if (sk.power) {
        const list = sk.target === 'enemies' ? this.foes : [this.foes[1]];
        const times = sk.target.indexOf('random') === 0 ? Number(sk.target.split(':')[1]) : 1;
        for (let n = 0; n < times; n++) {
          for (const t of list) yield* Cast.hit(this, { type: 'hit', actor: this.hero, target: times > 1 ? this.foes[n % 2] : t, amount: Math.round(100 * sk.power), crit: false, eff: null, el: sk.el, fx: sk.fx });
        }
      }
      this.cast = null;
      this.dimTo = 0;
      yield PAUSE;
    }
  }
  targetFor(sk) {
    if (sk.target === 'enemy') return this.foes[1];
    return this.hero;
  }
  update(dt) {
    this.runner.update(dt);
    this.stop = Math.max(0, this.stop - dt);
    const sdt = this.stop > 0 ? dt * 0.12 : dt;
    this.fx.update(sdt);
    this.sk.update(sdt);
    this.shake = Math.max(0, this.shake - sdt * 26);
    this.dim += (this.dimTo - this.dim) * Math.min(1, dt * 12);
    if (this.dim < 0.01) this.dim = 0;
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
    });
  }
  // ---- What scenes/cast.js needs from a stage ----
  center(u) {
    const v = this.vis[u.key];
    return { x: v.x, y: v.y - Math.min(this.artOf(u).h, 60) * 0.55 };
  }
  feet(u) {
    const v = this.vis[u.key];
    return { x: v.x, y: v.y };
  }
  setPose(u, pose, t) {
    const v = this.vis[u.key];
    v.pose = pose;
    v.poseT = t;
  }
  artOf(u) {
    if (u.side === 'hero') {
      const v = this.vis.hero;
      const pose = v.pose === 'idle' ? (Math.floor(game.t * 1.6) % 2 ? 'idle1' : 'idle0') : v.pose;
      return art.hero(u.id, pose, this.outfit);
    }
    return art.monster(u.def_.art, Math.floor(game.t * 2.2 + (u.key === 'foe1' ? 1 : 0)) % 2);
  }
  foesOf() {
    return this.foes;
  }
  alliesOf() {
    return [this.hero];
  }
  say(text, t) {
    this.banner = { text, t: t || 1 };
  }
  pop(x, y, text, color, k) {
    this.pops.push({ x, y, t: 0, text: String(text), color, k: k || 2 });
  }
  popText(x, y, text, color) {
    this.pops.push({ x, y, t: 0, label: text, color });
  }
  alpha(a) {
    ui.alpha(a);
  }
  image(s, x, y) {
    ui.img(s, x, y);
  }
  draw() {
    const sx = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    const sy = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    ui.setClip(0, this.top, W, this.h);
    ui.ctx.drawImage(art.battleBg(this.theme, W, this.h), sx, this.top + sy);
    if (this.dim) {
      ui.alpha(this.dim);
      ui.rect(0, this.top, W, this.h, '#07061a');
      ui.alpha(1);
    }
    ui.ctx.save();
    ui.ctx.translate(sx, sy);
    this.sk.draw(true);
    this.foes.concat([this.hero]).forEach((u) => {
      const v = this.vis[u.key];
      const a = this.artOf(u);
      const x = v.x + v.ox - a.w / 2, y = v.y - a.h + (u.side === 'hero' ? 3 : 0);
      ui.alpha(0.3);
      ui.rect(v.x - 10, v.y - 1, 20, 3, '#000000');
      ui.alpha(1);
      ui.img(a, x, y);
      if (v.flash > 0 && a.white) {
        ui.alpha(Math.min(1, v.flash * 1.4));
        ui.img(a.white(), x, y);
        ui.alpha(1);
      }
    });
    this.fx.draw();
    this.sk.draw(false);
    ui.ctx.restore();
    this.pops.forEach((p) => {
      ui.alpha(p.t > 0.65 ? Math.max(0, (0.9 - p.t) / 0.25) : 1);
      if (p.label) ui.text(p.label, p.x, p.y, p.color, { align: 'c', outline: true });
      else ui.numberBig(p.text, p.x, p.y, p.color, p.k);
      ui.alpha(1);
    });
    if (this.banner) ui.text(this.banner.text, W / 2, this.top + 4, UI.gold, { align: 'c', outline: true });
    ui.endClip();
  }
}

function firstKnown(s, hero) {
  const row = G.HEROES[hero].skills.find(([id]) => Skills.status(s, hero, id).known);
  return row ? row[0] : G.HEROES[hero].skills[0][0];
}

class SkillsScene {
  constructor(p) {
    const s = store.get();
    this.p = p || {};
    this.hero = this.p.hero && s.heroes[this.p.hero].joined ? this.p.hero : 'cen';
    this.scroll = 0;
    this.maxScroll = 0;
    const tabsY = D.contentTop;
    this.stageTop = tabsY + 30;
    this.stageH = Math.max(112, Math.min(168, Math.round(H * 0.24)));
    this.tiersY = this.stageTop + this.stageH + 3;
    this.listTop = this.tiersY + 26;
    this.autoH = 26;
    this.autoY = H - D.safeBottom - this.autoH - 6;
    const theme = CHAPTERS[Math.min(s.progress.chapter, CHAPTERS.length - 1)].theme;
    this.stage = new SkillStage(this.stageTop, this.stageH, theme);
    this.pick(firstKnown(s, this.hero));
  }
  enter() {
    audio.bgm('road');
  }
  update(dt) {
    this.stage.update(dt);
  }
  onDrag(dx, dy) {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll - dy));
  }
  // Selecting a skill shows it as it is now. The tier row can then show any other.
  pick(id, tier) {
    const s = store.get();
    this.selected = id;
    const lv = Skills.levelOf(s, this.hero, id);
    this.previewTier = tier === undefined ? G.skillTier(lv) : tier;
    const shown = this.previewTier === G.skillTier(lv) ? lv : G.SKILL_TIERS[this.previewTier].from;
    this.stage.play(this.hero, id, shown, s.heroes[this.hero].outfit);
  }
  setHero(id) {
    this.hero = id;
    this.scroll = 0;
    this.pick(firstKnown(store.get(), id));
  }
  afterUpgrade(s, id, before) {
    Daily.mark(s, 'train', Idle.dayOf(clock.now()));
    Idle.nudge(s);
    store.persist();
    const lv = Skills.levelOf(s, this.hero, id);
    const tier = G.skillTier(lv);
    // Reaching a new tier is worth stopping for: the stage plays the new look straight away.
    if (tier !== G.skillTier(before)) {
      audio.sfx('star');
      ui.toast(`${G.SKILLS[id].name} 已至${G.SKILL_TIERS[tier].name},施法大有不同`, 1.6);
    }
    this.pick(id);
  }
  drawRow(s, id, y) {
    const st = Skills.status(s, this.hero, id);
    const sk = G.SKILLS[id];
    const m = 8, x = m + 8, w = W - m * 2;
    const name = st.known ? (sk.el ? G.ELEMENTS[sk.el].css : UI.jade) : UI.faint;
    ui.button('skill-row-' + id, m, y, w, ROW_H - 2, { label: '', kind: this.selected === id ? 'normal' : 'ghost', sound: 'tap', onTap: () => this.pick(id) });
    ui.text(sk.name, x, y + 5, name);
    const nameEnd = x + ui.font.width(sk.name) + 5;
    if (!st.known) {
      ui.text(`Lv ${st.from} 习得`, nameEnd, y + 5, UI.faint);
      ui.text(sk.desc, x, y + 34, UI.faint);
      return;
    }
    const lvText = `Lv ${st.lv}`;
    ui.text(lvText, nameEnd, y + 5, UI.gold);
    ui.text(G.SKILL_TIERS[st.tier].name, nameEnd + ui.font.width(lvText) + 5, y + 5, G.SKILL_TIERS[st.tier].css);
    const now = Skills.effect(id, st.lv);
    ui.text(st.max ? now : `${now} → ${Skills.effectValue(id, st.lv + 1)}`, x, y + 19, UI.jade);
    ui.text(`${sk.desc} · 灵力 ${sk.mp}`, x, y + 34, UI.dim);
    const bw = 72, bx = W - m - bw - 5;
    if (st.max) {
      ui.button('skill-up-' + id, bx, y + 4, bw, 26, { label: '圆满', kind: 'off', disabled: true });
    } else if (!st.grown) {
      ui.button('skill-up-' + id, bx, y + 4, bw, 26, { label: `需 Lv ${st.need}`, kind: 'off', disabled: true });
    } else {
      ui.button('skill-up-' + id, bx, y + 4, bw, 26, {
        icon: 'coin', label: ui.num(st.cost), kind: st.ok ? 'primary' : 'normal', disabled: !st.ok, sound: 'level',
        onTap: () => {
          const before = st.lv;
          if (Skills.upgrade(s, this.hero, id)) this.afterUpgrade(s, id, before);
        },
      });
    }
  }
  drawTiers(s) {
    const m = 8, gap = 3;
    const bw = Math.floor((W - m * 2 - gap * 3) / 4);
    const have = G.skillTier(Skills.levelOf(s, this.hero, this.selected));
    G.SKILL_TIERS.forEach((t, i) => {
      ui.button('skill-tier-' + i, m + i * (bw + gap), this.tiersY, bw, 22, {
        // A tier not reached yet reads faint, unless it is the one being shown.
        label: t.name, kind: i === this.previewTier ? 'jade' : 'ghost', color: i === this.previewTier ? UI.text : i <= have ? t.css : UI.faint,
        onTap: () => this.pick(this.selected, i),
      });
    });
  }
  draw() {
    const s = store.get();
    ui.rect(0, 0, W, H, '#14121f');
    const m = 8, w = W - m * 2;
    const top = D.contentTop;
    const tw = Math.floor((w - 8) / 3);
    G.HERO_ORDER.forEach((id, i) => {
      const x = m + i * (tw + 4);
      if (!s.heroes[id].joined) return ui.button('skills-tab-' + id, x, top, tw, 26, { label: '???', kind: 'off', disabled: true });
      return ui.button('skills-tab-' + id, x, top, tw, 26, { label: G.HEROES[id].name, kind: this.hero === id ? 'primary' : 'normal', onTap: () => this.setHero(id) });
    });
    this.stage.draw();
    this.drawTiers(s);
    // The list scrolls between the tier row and the one-tap button.
    const listH = this.autoY - 4 - this.listTop;
    ui.setClip(0, this.listTop, W, listH);
    let y = this.listTop - Math.round(this.scroll);
    G.HEROES[this.hero].skills.forEach(([id]) => {
      this.drawRow(s, id, y);
      y += ROW_H;
    });
    y = ui.para(`每升一级,威力或治疗 +${Math.round(G.SKILL_STEP * 100)}%。到 Lv 4、7、10 进入新境界,施法会更加华丽。`, m + 4, y + 2, w - 8, UI.faint) + y + 6;
    this.maxScroll = Math.max(0, y + this.scroll - (this.listTop + listH));
    this.scroll = Math.min(this.scroll, this.maxScroll);
    ui.endClip();
    ui.button('skill-auto', m, this.autoY, w, this.autoH, {
      label: '一键升级(全队)', kind: 'jade', sound: 'level',
      onTap: () => {
        const r = Skills.autoUpgrade(s);
        if (!r.n) return ui.toast('现在没有能升的术法', 1.2);
        Daily.mark(s, 'train', Idle.dayOf(clock.now()));
        Idle.nudge(s);
        store.persist();
        this.pick(this.selected);
        return ui.toast(`术法升了 ${r.n} 级`, 1.2);
      },
    });
    ui.rect(0, 0, W, top - 1, '#14121f');
    ui.header('术法', () => game.go('party', { hero: this.hero }, true), s.stardust, s.coin);
  }
}

game.register('skills', SkillsScene);
