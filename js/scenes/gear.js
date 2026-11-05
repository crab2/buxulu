// Equipment screens: the panel on the party tab, one piece up close, choosing and forging for a slot,
// and the bag with its set list.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const audio = require('../core/audio.js');
const clock = require('../core/clock.js');
const store = require('../systems/store.js');
const E = require('../systems/economy.js');
const G = require('../data/game.js');
const F = require('../data/gear.js');
const Gear = require('../systems/gear.js');
const Idle = require('../systems/idle.js');
const Daily = require('../systems/daily.js');
const P = require('../systems/party.js');
const O = require('./overlays.js');
const { UI } = require('../core/palette.js');

const { W, H } = D;

const rarCss = (p) => F.RARITIES[p.rar].css;
const rarName = (p) => F.RARITIES[p.rar].name + '品';

// The party got stronger, so a blocked road is worth trying again.
function changed(s) {
  Idle.nudge(s);
  store.persist();
}

function byStrength(a, b) {
  return b.rar - a.rar || b.lv - a.lv;
}

// ---- Set text, shared by the panel and the detail view ----
function setLines(s, heroId) {
  const n = Gear.setCounts(s, heroId);
  const out = [];
  Object.keys(n).filter((id) => n[id] >= 2).sort((a, b) => n[b] - n[a]).forEach((id) => {
    const set = F.SETS[id];
    out.push({ text: `${set.name} ${n[id]}/4 ${set.two.desc}`, color: UI.gold });
    if (n[id] >= 4) out.push({ text: `${set.four.name}:${set.four.desc}`, color: UI.jade });
    else out.push({ text: `再穿 ${4 - n[id]} 件得「${set.four.name}」`, color: UI.dim });
  });
  if (!out.length) out.push({ text: '同名行装穿够 2 件,就有套装效果', color: UI.dim });
  return out;
}

function linesHeight(lines, w) {
  return lines.reduce((h, l) => h + ui.paraHeight(l.text, w, 13), 0);
}

function drawLines(lines, x, y, w) {
  let yy = y;
  lines.forEach((l) => { yy += ui.para(l.text, x, yy, w, l.color, { lh: 13 }); });
  return yy;
}

// ---- The panel on the party tab ----
function drawPanel(s, heroId, y, m, w) {
  if (!E.unlocked(s, 'gear')) return y;
  const lines = setLines(s, heroId);
  const textH = linesHeight(lines, w - 20);
  const h = 23 + 44 + textH + 8 + 56;
  ui.panel(m, y, w, h);
  ui.text('行装', m + 10, y + 7, UI.gold);
  const iron = ui.num(s.gear.iron);
  ui.text(iron, W - m - 10, y + 7, UI.blue, { align: 'r' });
  ui.img(art.icon('iron'), W - m - 10 - ui.font.width(iron) - 17, y + 4);
  const sw = Math.floor((w - 32) / 4);
  F.SLOT_ORDER.forEach((slot, i) => {
    const uid = s.heroes[heroId].gear[slot];
    const p = uid && Gear.find(s, uid);
    const x = m + 10 + i * (sw + 4), yy = y + 23;
    ui.button('gear-' + slot, x, yy, sw, 40, {
      label: '', kind: p ? 'normal' : 'ghost',
      onTap: () => (p ? game.push('geardetail', { uid: p.uid, hero: heroId }) : game.push('gearpick', { hero: heroId, slot })),
    });
    if (p) {
      ui.img(art.gear(p), x + Math.round(sw / 2) - 8, yy + 4);
      ui.text(`+${p.lv}`, x + sw / 2, yy + 22, rarCss(p), { align: 'c' });
    } else ui.text(F.SLOTS[slot].name, x + sw / 2, yy + 13, UI.faint, { align: 'c' });
  });
  let yy = drawLines(lines, m + 10, y + 67, w - 20) + 4;
  const half = Math.floor((w - 24) / 2);
  ui.button('gear-auto-equip', m + 10, yy, half, 24, {
    label: '全队一键穿戴', kind: 'normal',
    onTap: () => {
      const moved = Gear.autoEquip(s);
      changed(s);
      ui.toast(moved ? '都穿上了最合适的' : '已经是最合适的了', 1.1);
    },
  });
  ui.button('gear-auto-up', m + 14 + half, yy, half, 24, {
    label: '一键强化', kind: 'jade', sound: 'level',
    onTap: () => {
      const r = Gear.autoUpgrade(s);
      if (!r.n) return ui.toast('铜钱或精铁不够了', 1.1);
      Daily.mark(s, 'gear', Idle.dayOf(clock.now()));
      changed(s);
      return ui.toast(`强化了 ${r.n} 次`, 1.1);
    },
  });
  yy += 28;
  const openDraw = E.unlocked(s, 'gacha');
  const bagW = openDraw ? half : w - 20;
  ui.button('gear-bag', m + 10, yy, bagW, 24, {
    icon: 'gear', label: `行囊 ${s.gear.bag.length}`, badge: s.gear.fresh > 0, onTap: () => game.go('gearbag'),
  });
  if (openDraw) {
    ui.button('gear-draw', m + 14 + half, yy, half, 24, {
      icon: 'letter', label: `星笺 ${s.gacha.tickets}`, kind: s.gacha.tickets > 0 ? 'primary' : 'normal', onTap: () => game.go('gacha', { from: 'party' }),
    });
  }
  return y + h + 4;
}

// ---- One piece, up close ----
class GearDetail {
  constructor(p) {
    this.p = p;
  }
  upgrade(s, piece) {
    const step = Gear.nextStep(piece);
    if (!step) return;
    if (step.kind === 'level') {
      if (!Gear.levelUp(s, piece.uid)) return;
      audio.sfx('level');
    } else {
      if (!Gear.promote(s, piece.uid)) return;
      audio.sfx('star');
      audio.buzz('medium');
      ui.toast(`${Gear.name(piece)}升为${rarName(piece)}`, 1.4);
    }
    Daily.mark(s, 'gear', Idle.dayOf(clock.now()));
    changed(s);
  }
  // Keeps levelling until the money or iron runs out, or the piece needs promoting.
  upgradeAll(s, piece) {
    let n = 0;
    while (Gear.levelUp(s, piece.uid)) n++;
    if (!n) return;
    audio.sfx('level');
    Daily.mark(s, 'gear', Idle.dayOf(clock.now()));
    changed(s);
    ui.toast(`连升 ${n} 级`, 1);
  }
  wear(s, piece, id, owner) {
    if (owner === id) Gear.unequip(s, id, piece.slot);
    else Gear.equip(s, id, piece.uid);
    changed(s);
  }
  draw() {
    const s = store.get();
    const piece = Gear.find(s, this.p.uid);
    if (!piece) {
      game.pop(this);
      return;
    }
    const owner = Gear.owner(s, piece.uid);
    const set = F.SETS[piece.set];
    const x = 10, w = W - 20, inner = w - 24;
    const fourText = `四件 · ${set.four.name}:${set.four.desc}`;
    const textH = 13 + ui.paraHeight(fourText, inner, 13);
    const h = 84 + textH + 6 + 18 + 32 + 30 + 26 + 10;
    const y = Math.max(D.contentTop, Math.round((H - h) / 2));
    ui.alpha(0.65);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    ui.panel(x, y, w, h);
    // Who it is
    ui.rect(x + 11, y + 11, 36, 36, '#2a2542');
    ui.imgScaled(art.gear(piece), x + 13, y + 13, 32, 32);
    ui.text(Gear.name(piece), x + 56, y + 11, rarCss(piece));
    ui.text(`${rarName(piece)} · ${F.SLOTS[piece.slot].name}`, x + 56, y + 26, UI.dim);
    if (owner) ui.text(`${G.HEROES[owner].name}穿着`, x + w - 12, y + 11, UI.jade, { align: 'r' });
    // What it does now, and after the next step
    const cap = Gear.levelCap(piece);
    const step = Gear.nextStep(piece);
    ui.text(`等级 ${piece.lv} / ${cap}`, x + 12, y + 56, UI.text);
    let nextValue = null;
    if (step && step.kind === 'level') nextValue = Gear.value(piece, piece.lv + 1);
    if (step && step.kind === 'promote') nextValue = Gear.value({ slot: piece.slot, rar: piece.rar + 1, lv: piece.lv });
    ui.text(nextValue ? `${Gear.statLine(piece)} → +${Gear.pct(nextValue)}` : Gear.statLine(piece), x + w - 12, y + 56, UI.jade, { align: 'r' });
    ui.bar(x + 12, y + 72, inner, 5, piece.lv / cap, rarCss(piece));
    // Its set
    let ty = y + 84;
    const n = owner ? Gear.setCounts(s, owner)[piece.set] || 0 : 0;
    ui.text(`${set.name} · 两件:${set.two.desc}`, x + 12, ty, n >= 2 ? UI.gold : UI.dim);
    ty += 13;
    ty += ui.para(fourText, x + 12, ty, inner, n >= 4 ? UI.jade : UI.dim, { lh: 13 });
    ty += 6;
    // The next step and its price
    if (step) {
      const c = step.cost;
      const ix = ui.iconNum('coin', ui.num(c.coin), x + 12, ty + 2, s.coin >= c.coin ? UI.gold : UI.red);
      ui.iconNum('iron', c.iron, ix, ty + 2, s.gear.iron >= c.iron ? UI.blue : UI.red);
      const have = `现有精铁 ${ui.num(s.gear.iron)}`;
      ui.text(have, x + w - 12, ty + 2, UI.dim, { align: 'r' });
    } else ui.text('已经是最好的了', x + 12, ty + 2, UI.gold);
    ty += 18;
    const half = Math.floor((inner - 4) / 2);
    const can = step && Gear.afford(s, step.cost);
    ui.button('detail-up', x + 12, ty, half, 28, {
      label: !step ? '圆满' : step.kind === 'level' ? '强化' : `升为${F.RARITIES[piece.rar + 1].name}品`,
      kind: can ? 'primary' : 'normal', disabled: !can, sound: null, onTap: () => this.upgrade(s, piece),
    });
    ui.button('detail-up-all', x + 16 + half, ty, half, 28, {
      label: '连升', kind: can && step.kind === 'level' ? 'jade' : 'normal', disabled: !can || step.kind !== 'level', sound: null,
      onTap: () => this.upgradeAll(s, piece),
    });
    ty += 32;
    // Who wears it
    const ids = P.joined(s);
    const hw = Math.floor((inner - (ids.length - 1) * 4) / ids.length);
    ids.forEach((id, i) => {
      ui.button('detail-wear-' + id, x + 12 + i * (hw + 4), ty, hw, 26, {
        label: owner === id ? `${G.HEROES[id].name} 卸下` : G.HEROES[id].name, kind: owner === id ? 'jade' : 'normal',
        onTap: () => this.wear(s, piece, id, owner),
      });
    });
    ty += 30;
    const third = Math.floor((inner - 8) / 3);
    ui.button('detail-swap', x + 12, ty, third, 26, {
      label: '换一件', disabled: !owner, onTap: () => game.push('gearpick', { hero: owner, slot: piece.slot, closes: this }),
    });
    ui.button('detail-salvage', x + 16 + third, ty, third, 26, {
      label: '分解', kind: 'ghost', disabled: !!owner, onTap: () => this.confirmSalvage(s, piece),
    });
    ui.button('detail-close', x + 20 + third * 2, ty, third, 26, { label: '关闭', kind: 'ghost', sound: 'back', onTap: () => game.pop(this) });
  }
  confirmSalvage(s, piece) {
    const v = Gear.salvageValue(piece);
    O.modal({
      title: `分解${Gear.name(piece)}?`,
      rows: [{ icon: 'iron', label: '精铁', value: '+' + ui.num(v.iron), valueColor: UI.blue }].concat(v.coin ? [{ icon: 'coin', label: '铜钱', value: '+' + ui.num(v.coin) }] : []),
      buttons: [{ label: '取消' }, {
        label: '分解', kind: 'danger', sound: 'coin',
        onTap: () => {
          Gear.salvage(s, piece.uid);
          store.persist();
        },
      }],
    });
  }
}

// ---- Choosing and forging for one slot ----
class GearPick {
  constructor(p) {
    this.p = p;
    this.scroll = 0;
    this.maxScroll = 0;
    store.get().gear.fresh = 0;
  }
  onDrag(dx, dy) {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll - dy));
  }
  finish() {
    game.pop(this);
    if (this.p.closes) game.pop(this.p.closes);
  }
  draw() {
    const s = store.get();
    const { hero, slot } = this.p;
    ui.alpha(0.65);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    const x = 10, w = W - 20, y = D.contentTop + 6, h = H - y - D.safeBottom - 10;
    ui.panel(x, y, w, h);
    ui.text(`${G.HEROES[hero].name} · ${F.SLOTS[slot].name}`, W / 2, y + 9, UI.gold, { align: 'c' });
    const listY = y + 26, listH = h - 62;
    ui.setClip(x + 4, listY, w - 8, listH);
    let ry = listY - Math.round(this.scroll);
    const mine = s.gear.bag.filter((p) => p.slot === slot).sort(byStrength);
    if (!mine.length) {
      ry += ui.para('还没有这个部位的行装。路上会捡到,也可以在下面铸一件。', x + 14, ry + 6, w - 28, UI.dim) + 12;
    }
    const rh = 38;
    mine.forEach((p) => {
      const owner = Gear.owner(s, p.uid);
      ui.button('pick-' + p.uid, x + 8, ry, w - 16, rh - 2, {
        label: '', kind: owner === hero ? 'jade' : 'normal',
        onTap: () => {
          Gear.equip(s, hero, p.uid);
          changed(s);
          this.finish();
        },
      });
      ui.img(art.gear(p), x + 13, ry + 10);
      ui.text(`${Gear.name(p)} +${p.lv}`, x + 34, ry + 5, rarCss(p));
      ui.text(Gear.statLine(p), x + 34, ry + 20, UI.dim);
      if (owner) ui.text(G.HEROES[owner].name, x + w - 14, ry + 5, UI.jade, { align: 'r' });
      else ui.text(rarName(p), x + w - 14, ry + 5, rarCss(p), { align: 'r' });
      ry += rh;
    });
    // The forge: any open set, any slot, so completing a set never comes down to luck.
    ry += 4;
    ui.text('铸造一件凡品,之后可一路升到仙品', x + 12, ry, UI.dim);
    ry += 15;
    Gear.openSets(s).forEach((id) => {
      const spec = { set: id, slot, rar: 0 };
      const can = Gear.afford(s, F.FORGE);
      ui.img(art.gear(spec), x + 13, ry + 6);
      ui.text(Gear.name(spec), x + 34, ry + 3, F.RARITIES[0].css);
      ui.text(`两件:${F.SETS[id].two.desc}`, x + 34, ry + 17, UI.dim);
      ui.button('forge-' + id, x + w - 88, ry, 74, 32, {
        icon: 'iron', label: String(F.FORGE.iron), sub: ui.num(F.FORGE.coin), kind: can ? 'normal' : 'off', disabled: !can, sound: 'coin',
        onTap: () => {
          const made = Gear.forge(s, id, slot);
          if (!made) return;
          store.persist();
          ui.toast(`铸成${Gear.name(made)}`, 1);
        },
      });
      ry += 36;
    });
    this.maxScroll = Math.max(0, ry + this.scroll - (listY + listH));
    ui.endClip();
    const by = y + h - 32;
    const half = Math.floor((w - 24) / 2);
    ui.button('pick-none', x + 8, by, half, 26, {
      label: '卸下',
      onTap: () => {
        Gear.unequip(s, hero, slot);
        changed(s);
        this.finish();
      },
    });
    ui.button('pick-close', x + 16 + half, by, half, 26, { label: '关闭', kind: 'ghost', sound: 'back', onTap: () => game.pop(this) });
  }
}

// ---- The bag, and the list of sets ----
class GearBag {
  constructor() {
    this.tab = 'bag';
    this.scroll = 0;
    this.maxScroll = 0;
    store.get().gear.fresh = 0;
  }
  enter() {
    audio.bgm('road');
  }
  onDrag(dx, dy) {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll - dy));
  }
  // Only ever offers pieces that cannot be missed, and says what they come to first.
  salvageAll(s) {
    const list = Gear.spares(s);
    if (!list.length) return ui.toast('没有多余的行装', 1.1);
    const total = list.reduce((a, p) => {
      const v = Gear.salvageValue(p);
      return { iron: a.iron + v.iron, coin: a.coin + v.coin };
    }, { iron: 0, coin: 0 });
    return O.modal({
      title: `分解 ${list.length} 件多余行装?`,
      text: '只分解灵品及以下的重复品。穿着的和每款最好的一件都不会动。',
      rows: [{ icon: 'iron', label: '精铁', value: '+' + ui.num(total.iron), valueColor: UI.blue }].concat(total.coin ? [{ icon: 'coin', label: '铜钱', value: '+' + ui.num(total.coin) }] : []),
      buttons: [{ label: '取消' }, {
        label: '分解', kind: 'primary', sound: 'coin',
        onTap: () => {
          Gear.salvageSpares(s);
          store.persist();
        },
      }],
    });
  }
  drawBag(s, y) {
    const m = 8, w = W - m * 2;
    ui.panel(m, y, w, 34);
    ui.text(`行囊 ${s.gear.bag.length} / ${F.BAG_CAP}`, m + 10, y + 11, UI.text);
    ui.button('bag-salvage', W - m - 82, y + 5, 74, 24, { label: '一键分解', kind: 'normal', onTap: () => this.salvageAll(s) });
    const top = y + 38;
    ui.setClip(0, top, W, H - top);
    let ry = top - Math.round(this.scroll);
    if (!s.gear.bag.length) {
      ui.para('行囊空空。队伍赶路时会捡到行装,星笺里也有。', m + 6, ry + 8, w - 12, UI.dim);
      ry += 40;
    }
    s.gear.bag.slice().sort(byStrength).forEach((p) => {
      const owner = Gear.owner(s, p.uid);
      ui.button('bag-' + p.uid, m, ry, w, 32, { label: '', kind: owner ? 'jade' : 'normal', onTap: () => game.push('geardetail', { uid: p.uid }) });
      ui.img(art.gear(p), m + 7, ry + 7);
      ui.text(`${Gear.name(p)} +${p.lv}`, m + 28, ry + 9, rarCss(p));
      ui.text(owner ? G.HEROES[owner].name : Gear.statLine(p), W - m - 8, ry + 9, owner ? UI.text : UI.dim, { align: 'r' });
      ry += 34;
    });
    this.maxScroll = Math.max(0, ry + this.scroll - (H - D.safeBottom));
    ui.endClip();
  }
  drawSets(s, y) {
    const m = 8, w = W - m * 2, inner = w - 20;
    ui.setClip(0, y, W, H - y);
    let ry = y - Math.round(this.scroll);
    const open = Gear.openSets(s);
    F.SET_ORDER.forEach((id, i) => {
      const set = F.SETS[id];
      const isOpen = open.indexOf(id) >= 0;
      const four = `四件 · ${set.four.name}:${set.four.desc}`;
      const h = 43 + ui.paraHeight(four, inner, 13) + 6;
      ui.panel(m, ry, w, h, { fill: isOpen ? UI.panel : '#181527', plain: true });
      ui.text(set.name, m + 10, ry + 7, isOpen ? UI.gold : UI.faint);
      ui.text(isOpen ? set.star : `点亮第 ${i} 颗星后开放`, W - m - 10, ry + 7, UI.dim, { align: 'r' });
      F.SLOT_ORDER.forEach((slot, k) => {
        const have = s.gear.bag.filter((p) => p.set === id && p.slot === slot).sort(byStrength)[0];
        ui.alpha(have ? 1 : 0.25);
        ui.img(art.gear(have || { set: id, slot, rar: 0 }), m + 10 + k * 20, ry + 23);
        ui.alpha(1);
      });
      const tx = m + 10;
      ui.text(`两件:${set.two.desc}`, tx + 88, ry + 26, isOpen ? UI.text : UI.faint);
      ui.para(four, tx, ry + 43, inner, isOpen ? UI.jade : UI.faint, { lh: 13 });
      ry += h + 4;
    });
    this.maxScroll = Math.max(0, ry + this.scroll - (H - D.safeBottom));
    ui.endClip();
  }
  draw() {
    const s = store.get();
    ui.rect(0, 0, W, H, '#14121f');
    const top = D.contentTop;
    const tw = Math.floor((W - 20) / 2);
    ui.button('tab-bag', 8, top, tw, 24, { label: '行囊', kind: this.tab === 'bag' ? 'primary' : 'normal', onTap: () => { this.tab = 'bag'; this.scroll = 0; } });
    ui.button('tab-sets', 12 + tw, top, tw, 24, { label: '套装', kind: this.tab === 'sets' ? 'primary' : 'normal', onTap: () => { this.tab = 'sets'; this.scroll = 0; } });
    const y = top + 28;
    if (this.tab === 'bag') this.drawBag(s, y);
    else this.drawSets(s, y);
    ui.rect(0, 0, W, top - 1, '#14121f');
    ui.header('行装', () => game.go('party'), s.stardust, s.coin);
  }
}

game.register('geardetail', GearDetail);
game.register('gearpick', GearPick);
game.register('gearbag', GearBag);

module.exports = { drawPanel };
