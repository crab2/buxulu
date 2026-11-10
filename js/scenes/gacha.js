// Star letters: the draw, and opening the cards. The odds shown here are read from the same table the
// draw uses, so what the player is told can never drift from what happens.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const audio = require('../core/audio.js');
const clock = require('../core/clock.js');
const store = require('../systems/store.js');
const F = require('../data/gear.js');
const Gear = require('../systems/gear.js');
const Gacha = require('../systems/gacha.js');
const Idle = require('../systems/idle.js');
const O = require('./overlays.js');
const { Particles } = require('../core/fx.js');
const { UI } = require('../core/palette.js');
const { CARD_W, CARD_H } = require('../art/icons.js');

const { W, H } = D;

function pctText(v) {
  const n = Math.round(v * 10000) / 100;
  return `${n}%`;
}

function ratesModal() {
  const real = Gacha.effectiveRates();
  const rows = F.RARITIES.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => ({
    label: `${r.name}品`, color: r.css, value: `${pctText(F.DRAW_RATES[i])} · 实得约 ${pctText(real[i])}`, valueColor: UI.text,
  }));
  O.modal({
    title: '概率公示',
    text: `每封星笺开出一件行装,部位随机,套装在已开放的里随机。每 ${F.PITY_RARE} 封内必有玄品以上,每 ${F.PITY_TOP} 封内必有仙品。选了心愿后,玄品和仙品有 ${Math.round(F.WISH_SHARE * 100)}% 来自心愿套装。`,
    rows,
  });
}

function wishModal(s) {
  const open = Gear.openSets(s);
  const buttons = open.map((id) => ({
    label: `${F.SETS[id].name} · ${F.SETS[id].four.name}`, kind: s.gacha.wish === id ? 'jade' : 'normal',
    onTap: () => {
      Gacha.setWish(s, id);
      store.persist();
    },
  }));
  buttons.push({
    label: '不选', kind: s.gacha.wish ? 'normal' : 'jade',
    onTap: () => {
      Gacha.setWish(s, null);
      store.persist();
    },
  });
  O.modal({ title: '心愿', stack: true, buttons });
}

// Height of everything below the letter, so the spare room on tall phones can go to the sky.
const CONTENT_H = 18 + 58 + 30 + 44 + 72 + 44;

class GachaScene {
  constructor(p) {
    this.p = p || {};
    this.fx = new Particles(60);
    this.letterY = 0;
    this.letterH = 32;
  }
  enter() {
    audio.bgm('road');
  }
  update(dt) {
    this.fx.update(dt);
    if (Math.random() < dt * 6) {
      this.fx.add({ x: W / 2 + (Math.random() - 0.5) * 70, y: this.letterY + this.letterH - 6, vx: 0, vy: -8 - Math.random() * 10, life: 1.6, c: Math.random() > 0.5 ? '#f7dd7a' : '#a884c9', s: 1 });
    }
  }
  back() {
    game.go(this.p.from || 'trials');
  }
  open(n) {
    const s = store.get();
    const results = Gacha.draw(s, n);
    if (!results) return;
    // Saved before anything is shown, so closing the game mid-reveal neither loses nor rerolls a card.
    store.persist();
    game.push('cardreveal', { results, n, again: () => this.open(n) });
  }
  draw() {
    const s = store.get();
    const g = s.gacha;
    const day = Idle.dayOf(clock.now());
    Gacha.ensureDay(s, day);
    ui.backdrop('void', 0.62);
    const m = 8, w = W - m * 2;
    let y = D.contentTop;
    // The letter hangs in the night sky. Taller phones give it more room, and bring the buttons down to the thumb.
    const room = Math.max(0, H - D.safeBottom - y - CONTENT_H);
    const k = room >= 90 ? 2 : 1;
    this.letterH = 32 * k;
    const sky = Math.min(room * 0.7, 140) + this.letterH + 6;
    this.letterY = y + Math.round((sky - this.letterH) / 2) + Math.round(Math.sin(game.t * 1.4) * 2);
    this.fx.draw();
    ui.imgScaled(art.letterBig(), W / 2 - 22 * k, this.letterY, 44 * k, this.letterH);
    y += sky;
    ui.text(`现有星笺 ${g.tickets} 封`, W / 2, y, g.tickets ? UI.gold : UI.dim, { align: 'c', outline: true });
    y += 18;
    // How close the guarantees are.
    ui.panel(m, y, w, 54);
    const toTop = F.PITY_TOP - g.sinceTop, toRare = F.PITY_RARE - g.sinceRare;
    ui.text(`再拆 ${toTop} 封内必出仙品`, m + 10, y + 7, F.RARITIES[3].css);
    ui.bar(m + 10, y + 21, w - 20, 4, g.sinceTop / F.PITY_TOP, '#e8b33a');
    ui.text(`再拆 ${toRare} 封内必出玄品以上`, m + 10, y + 29, F.RARITIES[2].css);
    ui.bar(m + 10, y + 43, w - 20, 4, g.sinceRare / F.PITY_RARE, '#a884c9');
    y += 58;
    const half = Math.floor((w - 4) / 2);
    ui.button('gacha-wish', m, y, half, 26, {
      label: `心愿:${g.wish ? F.SETS[g.wish].name : '未选'}`, kind: g.wish ? 'jade' : 'normal', onTap: () => wishModal(s),
    });
    ui.button('gacha-rates', m + half + 4, y, half, 26, { label: '概率公示', onTap: () => ratesModal() });
    y += 30;
    ui.button('gacha-one', m, y, half, 40, {
      label: '拆一封', sub: '1 封星笺', kind: g.tickets >= 1 ? 'primary' : 'normal', disabled: g.tickets < 1, sound: null, subColor: g.tickets >= 1 ? '#3a2a14' : UI.faint,
      onTap: () => this.open(1),
    });
    ui.button('gacha-ten', m + half + 4, y, half, 40, {
      label: '拆十封', sub: '10 封星笺', kind: g.tickets >= 10 ? 'primary' : 'normal', disabled: g.tickets < 10, sound: null, subColor: g.tickets >= 10 ? '#3a2a14' : UI.faint,
      onTap: () => this.open(10),
    });
    y += 44;
    // Buying more. Capped per day, and never needed.
    ui.panel(m, y, w, 68);
    ui.text('多要几封', m + 10, y + 7, UI.gold);
    ui.text('每日限量', W - m - 10, y + 7, UI.dim, { align: 'r' });
    const cost = Gacha.ticketCoinCost(s);
    const coinLeft = F.TICKET_COIN_DAILY - g.boughtCoin, dustLeft = F.TICKET_DUST_DAILY - g.boughtDust;
    const canCoin = coinLeft > 0 && s.coin >= cost, canDust = dustLeft > 0 && s.stardust >= F.TICKET_DUST;
    const bw = Math.floor((w - 24) / 2);
    ui.button('gacha-buy-coin', m + 10, y + 23, bw, 38, {
      icon: 'coin', label: ui.num(cost), sub: `今日 ${g.boughtCoin}/${F.TICKET_COIN_DAILY}`, kind: canCoin ? 'normal' : 'off', disabled: !canCoin, sound: 'coin',
      onTap: () => {
        if (Gacha.buyWithCoin(s, day)) store.persist();
      },
    });
    ui.button('gacha-buy-dust', m + 14 + bw, y + 23, bw, 38, {
      icon: 'dust', label: String(F.TICKET_DUST), sub: `今日 ${g.boughtDust}/${F.TICKET_DUST_DAILY}`, kind: canDust ? 'normal' : 'off', disabled: !canDust, sound: 'star',
      onTap: () => {
        if (Gacha.buyWithDust(s, day)) store.persist();
      },
    });
    y += 72;
    ui.para('日课大礼、登天阶、云游一圈和点亮星位都会送星笺。不拆信也走得完全程:路上会捡到行装,铜钱和精铁能把任何一件升到仙品。', m + 2, y, w - 4, UI.text, { outline: true, lh: 13 });
    ui.header('星笺', () => this.back(), s.stardust, s.coin);
  }
}

// ---- Opening the cards ----
const FLIP_RATE = 3.6; // Card turns per second.
const STEP = 0.14; // Pause between one card and the next.
const RARE_PAUSE = 0.28; // Extra beat after something good, so it gets its moment.

class CardReveal {
  constructor(p) {
    this.p = p;
    this.t = 0;
    this.fx = new Particles(160);
    let at = 0.15;
    this.cards = p.results.map((r) => {
      const c = { r, at, f: 0, shown: false };
      at += STEP + (r.rar >= 2 ? RARE_PAUSE : 0);
      return c;
    });
    // The summary starts on the best thing found.
    this.sel = this.cards.reduce((best, c, i) => (c.r.rar > this.cards[best].r.rar ? i : best), 0);
  }
  get done() {
    return this.cards.every((c) => c.f >= 1);
  }
  update(dt) {
    this.t += dt;
    this.fx.update(dt);
    this.cards.forEach((c, i) => {
      if (this.t < c.at) return;
      c.f = Math.min(1, c.f + dt * FLIP_RATE);
      if (c.f >= 0.5 && !c.shown) {
        c.shown = true;
        this.landed(c, i);
      }
    });
  }
  landed(c, i) {
    const { x, y } = this.spot(i);
    if (c.r.rar === 3) {
      this.fx.burst(x + CARD_W / 2, y + CARD_H / 2, 'star', 50, 130);
      audio.sfx('gate');
      audio.buzz('medium');
    } else if (c.r.rar === 2) {
      this.fx.burst(x + CARD_W / 2, y + CARD_H / 2, 'star', 22, 80);
      audio.sfx('star');
    } else audio.sfx('tap');
  }
  skip() {
    this.cards.forEach((c) => { if (c.at > this.t) c.at = this.t; });
  }
  // Five to a row, so a ten-pull makes a neat block and a single card sits in the middle.
  spot(i) {
    const n = this.cards.length;
    const perRow = Math.min(5, n);
    const rows = Math.ceil(n / perRow);
    // Budget phones are only 240 wide, where five cards and the usual gap would run off both edges.
    const gapX = perRow > 1 ? Math.max(0, Math.min(4, Math.floor((W - 4 - perRow * CARD_W) / (perRow - 1)))) : 0;
    const gapY = 6;
    const totalW = perRow * CARD_W + (perRow - 1) * gapX;
    const totalH = rows * CARD_H + (rows - 1) * gapY;
    const top = Math.max(D.contentTop + 22, Math.round(H * 0.42 - totalH / 2));
    return { x: Math.round((W - totalW) / 2) + (i % perRow) * (CARD_W + gapX), y: top + Math.floor(i / perRow) * (CARD_H + gapY), bottom: top + totalH };
  }
  drawCard(c, i) {
    const { x, y } = this.spot(i);
    const p = c.r;
    const turn = Math.abs(1 - 2 * c.f);
    const cw = Math.max(1, Math.round(CARD_W * turn));
    const cx = x + CARD_W / 2;
    if (c.f < 0.5) {
      ui.imgScaled(art.cardBack(), cx - cw / 2, y, cw, CARD_H);
      return;
    }
    // A pulse behind the good ones, once they have turned over.
    if (p.rar >= 2 && c.f >= 1) {
      ui.alpha(0.22 + 0.14 * Math.sin(game.t * 4 + i));
      ui.rect(x - 2, y - 2, CARD_W + 4, CARD_H + 4, F.RARITIES[p.rar].css);
      ui.alpha(1);
    }
    ui.imgScaled(art.cardFront(p.rar), cx - cw / 2, y, cw, CARD_H);
    const iw = Math.max(1, Math.round(32 * turn));
    ui.imgScaled(art.gear(p), cx - iw / 2, y + 11, iw, 32);
    if (c.f < 1) return;
    ui.text(F.RARITIES[p.rar].name, x + 5, y + 2, F.RARITIES[p.rar].css);
    if (p.isNew) ui.text('新', x + CARD_W - 5, y + 2, UI.peach, { align: 'r' });
    ui.text(Gear.name(p), cx, y + 48, UI.text, { align: 'c' });
    if (i === this.sel && this.cards.length > 1) {
      ui.rect(x, y + CARD_H + 1, CARD_W, 2, UI.gold);
    }
    if (this.done) ui.hit('card-' + i, x, y, CARD_W, CARD_H, () => { this.sel = i; }, { sound: 'tap' });
  }
  draw() {
    ui.alpha(0.9);
    ui.rect(0, 0, W, H, '#07061a');
    ui.alpha(1);
    const s = store.get();
    if (!this.done) ui.hit('open-skip', 0, 0, W, H, () => this.skip(), { sound: null });
    ui.text(this.done ? '星笺开启' : '拆信中,点一下全部翻开', W / 2, D.contentTop + 2, UI.gold, { align: 'c', outline: true });
    this.cards.forEach((c, i) => this.drawCard(c, i));
    this.fx.draw();
    if (!this.done) return;
    const bottom = this.spot(0).bottom;
    const m = 8, w = W - m * 2;
    const py = bottom + 8;
    const p = this.cards[this.sel].r;
    const set = F.SETS[p.set];
    const four = `四件 · ${set.four.name}:${set.four.desc}`;
    const textH = ui.paraHeight(four, w - 20, 13);
    const ph = 34 + textH + 7;
    ui.panel(m, py, w, ph);
    ui.text(`${Gear.name(p)} · ${F.RARITIES[p.rar].name}品`, m + 10, py + 7, F.RARITIES[p.rar].css);
    ui.text(Gear.statLine(p), W - m - 10, py + 7, UI.jade, { align: 'r' });
    ui.text(`两件:${set.two.desc}`, m + 10, py + 21, UI.text);
    ui.para(four, m + 10, py + 34, w - 20, UI.dim, { lh: 13 });
    const by = py + ph + 6;
    const third = Math.floor((w - 8) / 3);
    const n = this.p.n;
    const canAgain = s.gacha.tickets >= n;
    ui.button('open-again', m, by, third, 28, {
      label: n === 1 ? '再拆一封' : '再拆十封', kind: canAgain ? 'primary' : 'normal', disabled: !canAgain, sound: null,
      onTap: () => {
        game.pop(this);
        this.p.again();
      },
    });
    ui.button('open-wear', m + third + 4, by, third, 28, { label: '去穿戴', kind: 'jade', onTap: () => game.go('party') });
    ui.button('open-close', m + (third + 4) * 2, by, third, 28, { label: '收下', kind: 'normal', sound: 'back', onTap: () => game.pop(this) });
  }
}

game.register('gacha', GachaScene);
game.register('cardreveal', CardReveal);
