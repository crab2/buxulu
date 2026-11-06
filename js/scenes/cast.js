// The choreography of a skill being used: who moves, what appears, and how long each beat waits. The
// battle screen and the preview stage on the skills screen both play these, so a preview is the real thing.
//
// A stage provides: vis, fx, sk, center(u), feet(u), setPose(u, pose, t), artOf(u), foesOf(u), alliesOf(u),
// plus the fields shake, stop (hit-stop seconds), dimTo and cast, and the methods say, pop and popText.
const audio = require('../core/audio.js');
const G = require('../data/game.js');

const CAST_COLS = {
  slash: ['#ffffff', '#7cb8d8', '#14283c'],
  fire: ['#f7dd7a', '#ec7a4e', '#3c1410'],
  water: ['#bfe6f2', '#6fb0e0', '#10243c'],
  wood: ['#c8f0d4', '#3f9e7e', '#10302a'],
  earth: ['#f7dd7a', '#c98f55', '#2c1a10'],
  heal: ['#ffffff', '#7fd1a4', '#10302a'],
};

// How long the cut-in of a skill at its peak holds the screen, in seconds.
const CUTIN_DUR = 0.9;

// Which element's look a skill takes. Protective skills are earth by name but read as a shield.
function kindOf(e) {
  if (e.support) return 'shield';
  return e.fx || 'slash';
}

// Heroes earn their tiers. Enemies stay plain, except that the telegraphed blow of a boss looks the part:
// it is the moment the player was warned about.
function tierOf(e) {
  if (e.actor.side === 'hero') return e.tier || 0;
  if (e.charged) return 2;
  return e.actor.boss ? 1 : 0;
}

// A skill that reaches several targets holds its grandest beat for the whole field, not for each of them.
function hitTierOf(e, tier) {
  const single = e.area === 'enemy' || e.area === 'ally' || e.area === 'self' || e.area === 'ko';
  return single ? tier : Math.min(tier, 2);
}

function targetsOf(stage, e) {
  if (e.area === 'self') return [e.actor];
  if (e.area === 'allies') return stage.alliesOf(e.actor);
  if (e.area === 'ally' || e.area === 'ko') return e.target ? [e.target] : [e.actor];
  if (e.area === 'enemy') return e.target && e.target.side !== e.actor.side ? [e.target] : stage.foesOf(e.actor).slice(0, 1);
  return stage.foesOf(e.actor);
}

// A melee caster at a high tier crosses the field in a blink, leaving afterimages behind.
function dash(stage, e) {
  const foes = targetsOf(stage, e).filter((u) => u.side !== e.actor.side);
  if (!foes.length) return;
  const v = stage.vis[e.actor.key];
  const to = stage.vis[foes[0].key];
  const gap = e.actor.side === 'hero' ? 34 : -34;
  const reach = to.x + gap - v.x;
  const sprite = stage.artOf(e.actor);
  const white = sprite.white ? sprite.white() : sprite;
  const y0 = v.y - sprite.h + (e.actor.side === 'hero' ? 3 : 0);
  for (let i = 1; i <= 4; i++) {
    const x = v.x + (reach * i) / 5 - sprite.w / 2;
    stage.sk.add(0.24, (k) => {
      stage.alpha(0.5 * (1 - k));
      stage.image(white, x, y0);
      stage.alpha(1);
    }, { delay: 0.015 * i });
  }
  v.ox = reach;
}

// Everything between choosing a skill and it landing.
function* use(stage, e) {
  const v = stage.vis[e.actor.key];
  const tier = tierOf(e);
  const kind = kindOf(e);
  // A flurry of strikes should feel like one quick motion, so each blow holds for less time.
  const rapid = !!e.area && e.area.indexOf('random') === 0;
  stage.cast = { actor: e.actor, tier, hitTier: hitTierOf(e, tier), kind, id: e.id, rapid };
  const dir = e.actor.side === 'hero' ? -1 : 1;
  const melee = e.pose === 'atk' || e.pose === 'thrust';
  if (e.pose === 'atk' && e.actor.side === 'hero') {
    stage.setPose(e.actor, 'windup', 0.14 + tier * 0.1);
    yield 0.11;
  }
  if (!e.basic) {
    const at = stage.center(e.actor), feet = stage.feet(e.actor);
    const look = kind === 'shield' ? 'earth' : kind === 'slash' ? (e.el || 'metal') : kind;
    const peak = tier >= 3 && e.actor.side === 'hero';
    if (tier >= 2) stage.dimTo = peak ? 0.72 : 0.45;
    const life = stage.sk.gather(tier, at, feet, look);
    if (peak) {
      const cols = CAST_COLS[kind] || CAST_COLS.earth;
      stage.sk.cutin({ hero: e.actor.id, name: e.name, tierName: G.SKILL_TIERS[3].name, cols, dark: cols[2], dur: CUTIN_DUR });
      audio.sfx('gate');
      audio.buzz('medium');
      stage.shake = 6;
      yield CUTIN_DUR;
      audio.sfx('star');
    } else {
      if (tier >= 2) audio.sfx('charge');
      else if (kind === 'heal' || kind === 'shield' || e.pose === 'cast') audio.sfx('magic');
      if (e.name) stage.say(e.name, 0.8);
      yield life;
    }
    if (peak && kind !== 'shield') {
      stage.sk.onHeavy = (amount) => { stage.shake = Math.max(stage.shake, amount); };
      stage.sk.finale(kind, targetsOf(stage, e).map((u) => stage.center(u)));
    }
  }
  if (tier >= 3 && kind === 'earth' && !e.basic) yield 0.28; // The rock has to land before the blow reads.
  if (e.pose) stage.setPose(e.actor, e.pose, 0.5);
  v.ox = dir * (melee ? 16 : 6);
  if (melee && tier >= 2 && kind !== 'shield') dash(stage, e);
  if (e.actor.side === 'enemy') {
    v.ox = dir * 14;
    stage.setPose(e.actor, 'atk', 0.3);
  }
  if (kind === 'shield' && !e.basic) yield* shield(stage, e);
  else yield e.basic ? 0.14 : 0.1;
}

// Protective skills strike nobody, so their signature plays on those they protect.
function* shield(stage, e) {
  const tier = stage.cast.tier;
  let hold = 0;
  targetsOf(stage, e).forEach((u) => {
    const r = stage.sk.impact('shield', tier, stage.center(e.actor), stage.center(u), stage.feet(u).y);
    hold = Math.max(hold, r.hold);
  });
  audio.sfx('magic');
  stage.shake = 2 + tier * 2;
  yield hold;
}

// One blow landing on one target.
function* hit(stage, e) {
  const c = stage.cast && stage.cast.actor === e.actor ? stage.cast : null;
  // Outside a skill this is a counterattack, which stays plain, or a strike of the Seven-Star Step.
  const tier = c ? c.hitTier : e.fx === 'star' ? 1 : 0;
  const v = stage.vis[e.target.key];
  const to = stage.center(e.target);
  const from = stage.center(e.actor);
  const beat = stage.sk.impact(e.fx || 'slash', tier, from, to, stage.feet(e.target).y, e.el);
  if (beat.travel) yield beat.travel;
  v.flash = 1;
  v.ox = e.target.side === 'hero' ? 7 + tier * 2 : -7 - tier * 2;
  stage.setPose(e.target, 'hurt', 0.3);
  stage.shake = Math.max(stage.shake, (e.crit ? 9 : 4) + tier * 2);
  if (tier >= 2) stage.stop = 0.04 + tier * 0.02;
  audio.sfx(e.crit || tier >= 2 ? 'crit' : 'hit');
  audio.buzz(e.crit || tier >= 2 ? 'medium' : 'light');
  stage.pop(to.x, to.y - 16, e.amount, e.crit ? '#f7dd7a' : '#ffffff', e.crit ? (tier >= 3 ? 4 : 3) : tier >= 2 ? 3 : 2);
  if (e.eff === 'weak') stage.popText(to.x, to.y - 34, '克制', '#ec7a4e');
  if (e.eff === 'resist') stage.popText(to.x, to.y - 34, '抵抗', '#a79fb8');
  if (e.crit) stage.popText(to.x, to.y - 46, '暴击', '#f7dd7a');
  yield c && c.rapid ? beat.hold * 0.6 : beat.hold;
}

// A healing skill lands the way a blow does, with the same growth through the tiers. Slower healing, such
// as a relic's or a regeneration tick's, keeps the plain sparkle.
function* heal(stage, e) {
  const to = stage.center(e.target);
  const c = stage.cast && stage.cast.kind === 'heal' ? stage.cast : null;
  let hold = 0.14;
  if (c) hold = stage.sk.impact('heal', c.hitTier, to, to, stage.feet(e.target).y).hold;
  else stage.fx.rise(to.x, to.y, 'heal', 12);
  if (e.amount > 0) stage.pop(to.x, to.y - 12, '+' + e.amount, '#7fd1a4', c && c.hitTier >= 2 ? 3 : 2);
  audio.sfx('heal');
  yield hold;
}

module.exports = { use, hit, heal };
