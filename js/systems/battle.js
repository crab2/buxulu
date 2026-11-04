// Turn-based combat rules, kept apart from rendering. Each method returns events for the scene to animate.
const D = require('../data/game.js');

const ULT_FULL = 100;

class Battle {
  constructor(o) {
    this.heroes = o.heroes;
    this.enemies = o.enemies;
    this.units = this.heroes.concat(this.enemies);
    this.rng = o.rng || Math.random;
    this.stars = o.stars || 0;
    this.ult = 0;
    this.items = o.items || {};
    this.canFlee = !this.enemies.some((e) => e.boss) && o.canFlee !== false;
    this.outcome = null;
    this.sealed = [];
    this.turns = 0;
    this.heroes.forEach((u) => {
      if (u.startShield) u.shield = u.startShield;
    });
  }

  live(side) {
    return (side === 'hero' ? this.heroes : this.enemies).filter((u) => u.alive);
  }

  spd(u) {
    let s = u.spd;
    if (u.statuses.slow) s *= 0.7;
    return Math.max(1, s);
  }

  stat(u, k) {
    let v = u[k];
    if (k === 'atk' && u.statuses.atkUp) v *= 1.25;
    if (k === 'def' && u.statuses.defUp) v *= 1.35;
    if (k === 'def' && u.statuses.weak) v *= 0.7;
    return v;
  }

  // Predicts who acts next, for the turn-order strip.
  peek(n) {
    const sim = this.units.filter((u) => u.alive).map((u) => ({ u, ct: u.ct, s: this.spd(u) }));
    const out = [];
    let guard = 0;
    while (out.length < n && sim.length && guard++ < 500) {
      const ready = sim.filter((x) => x.ct >= 100).sort((a, b) => b.ct - a.ct)[0];
      if (ready) {
        out.push(ready.u);
        ready.ct -= 100;
      } else sim.forEach((x) => { x.ct += x.s; });
    }
    return out;
  }

  // Advances initiative and resolves everything that happens at the start of a turn.
  next() {
    const alive = this.units.filter((u) => u.alive);
    let actor = null;
    let guard = 0;
    while (!actor && guard++ < 2000) {
      actor = alive.filter((u) => u.ct >= 100).sort((a, b) => b.ct - a.ct || (a.side === 'hero' ? -1 : 1))[0] || null;
      if (!actor) alive.forEach((u) => { u.ct += this.spd(u); });
    }
    actor.ct -= 100;
    this.turns++;
    const ev = [{ type: 'turn', actor }];
    let skip = false;
    const st = actor.statuses;
    delete st.guard;
    if (st.burn) this.dot(actor, 0.06, 'burn', ev);
    if (actor.alive && st.poison) this.dot(actor, 0.05, 'poison', ev);
    if (actor.alive && st.regen) this.restore(actor, Math.round(actor.maxHp * 0.08), ev);
    if (actor.alive && actor.mods.regen) this.restore(actor, Math.round(actor.maxHp * actor.mods.regen), ev);
    if (actor.alive && actor.mods.mpRegen && actor.mp < actor.maxMp) {
      actor.mp = Math.min(actor.maxMp, actor.mp + actor.mods.mpRegen);
    }
    if (st.stun) skip = true;
    Object.keys(st).forEach((k) => {
      if (k === 'guard') return;
      st[k]--;
      if (st[k] <= 0) delete st[k];
    });
    if (skip && actor.alive) ev.push({ type: 'stunned', actor });
    if (!actor.alive) skip = true;
    this.check();
    return { actor, skip: skip || !!this.outcome, events: ev };
  }

  dot(u, pct, status, ev) {
    const amount = Math.max(1, Math.round(u.maxHp * pct));
    u.hp = Math.max(0, u.hp - amount);
    ev.push({ type: 'dot', target: u, amount, status });
    if (u.hp <= 0) this.down(u, ev);
  }

  restore(u, amount, ev) {
    const a = Math.min(u.maxHp - u.hp, amount);
    if (a <= 0) return;
    u.hp += a;
    ev.push({ type: 'heal', target: u, amount: a });
  }

  down(u, ev) {
    if (!u.alive) return;
    u.alive = false;
    u.hp = 0;
    u.statuses = {};
    u.charging = null;
    ev.push({ type: 'ko', target: u });
  }

  check() {
    if (!this.live('enemy').length) this.outcome = 'win';
    else if (!this.live('hero').length) this.outcome = 'lose';
    return this.outcome;
  }

  mpCost(u, sk) {
    return Math.max(0, Math.round((sk.mp || 0) * (1 - (u.mods.mpCost || 0))));
  }

  canUse(u, id) {
    const sk = D.SKILLS[id];
    if (u.mp < this.mpCost(u, sk)) return false;
    if (sk.target === 'ko') return this.heroes.some((h) => !h.alive);
    return true;
  }

  sealChance(t) {
    if (t.boss) return 0;
    const m = t.def_;
    const lost = 1 - t.hp / t.maxHp;
    return Math.max(0.08, Math.min(0.95, 0.2 + lost * 0.85 - (m.elite ? 0.15 : 0)));
  }

  damage(a, t, power, el, opt) {
    opt = opt || {};
    const k = 30 + 5 * a.lv;
    const mit = this.stat(t, 'def') * (1 - (opt.ignore || 0));
    let atk = this.stat(a, 'atk');
    if (opt.defScale) atk += this.stat(a, 'def') * opt.defScale;
    let d = atk * power * (1 - mit / (mit + k));
    const mult = D.elementMult(el, t.el);
    d *= mult;
    const critRate = 0.06 + (a.mods.crit || 0);
    const crit = this.rng() < critRate;
    if (crit) d *= 1.6 + (a.mods.critDmg || 0);
    d *= 0.92 + this.rng() * 0.16;
    if (opt.skill && a.mods.skillDmg) d *= 1 + a.mods.skillDmg;
    if (t.statuses.guard) d *= 0.5;
    if (t.mods.dmgTaken) d *= 1 - t.mods.dmgTaken;
    return { amount: Math.max(1, Math.round(d)), crit, eff: mult > 1 ? 'weak' : mult < 1 ? 'resist' : null };
  }

  strike(a, t, sk, ev, opt) {
    if (!t.alive) return;
    const r = this.damage(a, t, sk.power, sk.el, Object.assign({ ignore: sk.ignore, defScale: sk.defScale, skill: !!sk.mp }, opt || {}));
    t.hp = Math.max(0, t.hp - r.amount);
    ev.push({ type: 'hit', actor: a, target: t, amount: r.amount, crit: r.crit, eff: r.eff, el: sk.el, fx: sk.fx || 'slash' });
    if (a.side === 'hero') this.ult = Math.min(ULT_FULL, this.ult + 5);
    else this.ult = Math.min(ULT_FULL, this.ult + 3);
    if (a.mods.lifesteal && a.alive) this.restore(a, Math.round(r.amount * a.mods.lifesteal), ev);
    if (t.hp <= 0) this.down(t, ev);
    else {
      if (sk.status && this.rng() < (sk.chance === undefined ? 1 : sk.chance)) this.apply(t, sk.status, sk.turns || 2, ev);
      if (a.mods.burnChance && this.rng() < a.mods.burnChance) this.apply(t, 'burn', 2, ev);
      this.phaseCheck(t, ev);
    }
  }

  apply(t, status, turns, ev) {
    if (!t.alive) return;
    if (t.boss && status === 'stun') {
      if (t.stunGuard) return;
      t.stunGuard = true; // A boss can only be stunned once per fight.
    }
    t.statuses[status] = Math.max(t.statuses[status] || 0, turns);
    ev.push({ type: 'status', target: t, status, turns });
  }

  phaseCheck(t, ev) {
    if (!t.phases || !t.phases.length) return;
    const ratio = t.hp / t.maxHp;
    while (t.phases.length && ratio <= t.phases[0].at) {
      const p = t.phases.shift();
      ev.push({ type: 'phase', target: t, text: p.text });
      if (p.status) this.apply(t, p.status, 99, ev);
    }
  }

  targets(a, sk, chosen) {
    const foes = this.live(a.side === 'hero' ? 'enemy' : 'hero');
    const pals = this.live(a.side);
    switch (sk.target.split(':')[0]) {
      case 'enemy': return [chosen && chosen.alive ? chosen : foes[0]];
      case 'enemies': return foes;
      case 'ally': return [chosen && chosen.alive ? chosen : a];
      case 'allies': return pals;
      case 'self': return [a];
      case 'ko': return [chosen];
      default: return foes;
    }
  }

  perform(a, action) {
    const ev = [];
    a.guarding = false;
    switch (action.kind) {
      case 'attack': this.doSkill(a, { name: '攻击', el: a.el, power: 1, target: 'enemy', fx: 'slash', pose: 'atk' }, action.target, ev); break;
      case 'skill': this.doSkill(a, D.SKILLS[action.id], action.target, ev, action.id); break;
      case 'guard':
        a.statuses.guard = 1;
        a.mp = Math.min(a.maxMp, a.mp + Math.max(2, Math.round(a.maxMp * 0.12)));
        ev.push({ type: 'guard', actor: a });
        break;
      case 'item': this.doItem(a, action.id, action.target, ev); break;
      case 'seal': this.doSeal(a, action.target, ev); break;
      case 'ult': this.doUlt(a, ev); break;
      case 'flee': {
        const ok = this.canFlee && this.rng() < 0.75;
        ev.push({ type: 'flee', actor: a, ok });
        if (ok) this.outcome = 'fled';
        break;
      }
      default:
    }
    this.check();
    return ev;
  }

  doSkill(a, sk, chosen, ev, id) {
    a.mp = Math.max(0, a.mp - this.mpCost(a, sk));
    ev.push({ type: 'use', actor: a, name: sk.name, pose: sk.pose, el: sk.el, fx: sk.fx, id, target: chosen, basic: !sk.mp && a.side === 'hero' });
    if (sk.power) {
      if (sk.target.indexOf('random') === 0) {
        const n = Number(sk.target.split(':')[1]);
        for (let i = 0; i < n; i++) {
          const pool = this.live(a.side === 'hero' ? 'enemy' : 'hero');
          if (!pool.length) break;
          this.strike(a, pool[Math.floor(this.rng() * pool.length)], sk, ev);
        }
      } else this.targets(a, sk, chosen).forEach((t) => this.strike(a, t, sk, ev));
    }
    if (sk.heal) {
      this.targets(a, sk, chosen).forEach((t) => {
        const amt = Math.round(this.stat(a, 'atk') * sk.heal * (1 + (a.mods.healPct || 0)));
        const before = ev.length;
        this.restore(t, amt, ev);
        if (ev.length === before) ev.push({ type: 'heal', target: t, amount: 0 });
        if (sk.status) this.apply(t, sk.status, sk.turns, ev);
      });
    } else if (sk.status && !sk.power) {
      this.targets(a, sk, chosen).forEach((t) => this.apply(t, sk.status, sk.turns, ev));
    }
    if (sk.statuses) sk.statuses.forEach((s) => this.apply(a, s[0], s[1], ev));
    if (sk.revive && chosen && !chosen.alive) this.raise(chosen, sk.revive, ev);
  }

  raise(t, pct, ev) {
    t.alive = true;
    t.hp = Math.round(t.maxHp * pct);
    t.ct = 40;
    ev.push({ type: 'revive', target: t, amount: t.hp });
  }

  doItem(a, id, target, ev) {
    if (!this.items[id]) return;
    this.items[id]--;
    const it = D.ITEMS[id];
    ev.push({ type: 'useItem', actor: a, name: it.name, id, target });
    if (it.use === 'heal') this.restore(target, Math.round(target.maxHp * 0.4), ev);
    if (it.use === 'mp') {
      const gain = Math.round(target.maxMp * 0.5);
      target.mp = Math.min(target.maxMp, target.mp + gain);
      ev.push({ type: 'mp', target, amount: gain });
    }
    if (it.use === 'revive' && !target.alive) this.raise(target, 0.5, ev);
  }

  doSeal(a, t, ev) {
    if (!this.items.seal) return;
    this.items.seal--;
    const ok = !!t && t.alive && this.rng() < this.sealChance(t);
    ev.push({ type: 'seal', actor: a, target: t, ok });
    if (ok) {
      t.alive = false;
      t.sealedAway = true;
      t.statuses = {};
      this.sealed.push(t.id);
    }
  }

  ultReady() {
    return this.stars >= 1 && this.ult >= ULT_FULL;
  }

  // Seven-Star Step: one strike per restored star, from whoever triggers it.
  doUlt(a, ev) {
    if (!this.ultReady()) return;
    this.ult = 0;
    ev.push({ type: 'ultStart', actor: a, stars: this.stars });
    const sk = { name: '七星步', power: 0.8, fx: 'star' };
    for (let i = 0; i < this.stars; i++) {
      const pool = this.live('enemy');
      if (!pool.length) break;
      const t = pool[Math.floor(this.rng() * pool.length)];
      ev.push({ type: 'ultStar', index: i });
      this.strike(a, t, sk, ev);
    }
    this.ult = 0;
    ev.push({ type: 'ultEnd' });
  }

  // ---- Decision making ----
  enemyAction(u) {
    if (u.charging) {
      const id = u.charging;
      u.charging = null;
      return { kind: 'skill', id, target: this.pickHero(u) };
    }
    let id;
    if (u.pattern) {
      id = u.pattern[u.patternI % u.pattern.length];
      u.patternI++;
    } else {
      id = u.skills[Math.floor(this.rng() * u.skills.length)];
    }
    const sk = D.SKILLS[id];
    if (sk.charge) {
      u.charging = id;
      return { kind: 'charge', id };
    }
    return { kind: 'skill', id, target: this.pickHero(u) };
  }

  performEnemy(u, action) {
    if (action.kind === 'charge') {
      return [{ type: 'charge', actor: u, text: u.name + ':' + D.SKILLS[action.id].charge, id: action.id }];
    }
    return this.perform(u, action);
  }

  pickHero(u) {
    const pool = this.live('hero');
    const taunt = pool.find((h) => h.statuses.taunt);
    if (taunt && this.rng() < 0.75) return taunt;
    let best = pool[0], score = -1;
    pool.forEach((h) => {
      const s = (1.2 - h.hp / h.maxHp) * 0.5 + this.rng();
      if (s > score) { score = s; best = h; }
    });
    return best;
  }

  // The same logic drives the in-game Auto button and the balance simulation.
  autoAction(u) {
    const foes = this.live('enemy');
    const pals = this.live('hero');
    const can = (id) => u.skills.indexOf(id) >= 0 && this.canUse(u, id);
    const dead = this.heroes.filter((h) => !h.alive);
    const threat = foes.some((f) => f.charging);
    if (this.ultReady()) return { kind: 'ult' };
    if (dead.length && can('revive')) return { kind: 'skill', id: 'revive', target: dead[0] };
    if (dead.length && this.items.incense > 0) return { kind: 'item', id: 'incense', target: dead[0] };
    const hurt = pals.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    const low = hurt[0];
    const lowN = pals.filter((p) => p.hp / p.maxHp < 0.62).length;
    if (can('rain') && lowN >= 2) return { kind: 'skill', id: 'rain' };
    if (can('mend') && low.hp / low.maxHp < 0.55) return { kind: 'skill', id: 'mend', target: low };
    if (low.hp / low.maxHp < 0.35 && this.items.pill > 0 && !u.skills.includes('mend')) return { kind: 'item', id: 'pill', target: low };
    if (threat && can('wall')) return { kind: 'skill', id: 'wall' };
    if (threat && can('bronze') && !pals.every((p) => p.statuses.defUp)) return { kind: 'skill', id: 'bronze' };
    if (u.mp < 4 && u.maxMp >= 4 && this.items.ether > 0 && u.skills.includes('mend')) return { kind: 'item', id: 'ether', target: u };
    // Pick the skill with the most expected damage against the sturdiest reachable targets.
    const target = foes.slice().sort((a, b) => a.hp - b.hp)[0];
    let best = { kind: 'attack', target }, bestScore = D.elementMult(u.el, target.el);
    u.skills.forEach((id) => {
      const sk = D.SKILLS[id];
      if (!sk.power || !this.canUse(u, id)) return;
      let score;
      if (sk.target === 'enemies') {
        score = foes.reduce((s, f) => s + sk.power * D.elementMult(sk.el, f.el), 0);
      } else if (sk.target.indexOf('random') === 0) {
        score = sk.power * Number(sk.target.split(':')[1]) * 0.85;
      } else {
        const tt = foes.slice().sort((a, b) => D.elementMult(sk.el, b.el) - D.elementMult(sk.el, a.el) || a.hp - b.hp)[0];
        score = sk.power * D.elementMult(sk.el, tt.el);
        if (score > bestScore) { bestScore = score; best = { kind: 'skill', id, target: tt }; }
        return;
      }
      if (score > bestScore) { bestScore = score; best = { kind: 'skill', id, target }; }
    });
    return best;
  }
}

module.exports = { Battle, ULT_FULL };
