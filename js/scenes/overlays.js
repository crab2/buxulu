// Scenes that sit on top of others: story dialogue, message boxes, the privacy prompt, event choices.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const store = require('../systems/store.js');
const E = require('../systems/economy.js');
const { UI } = require('../core/palette.js');
const { STORY, EVENTS } = require('../data/story.js');
const steps = require('../systems/steps.js');

const { W, H } = D;
const CHARS_PER_SEC = 34;

const NAMES = { cen: '岑行', ruo: '阿箬', zhuo: '守拙', pei: '裴玄度', old: '老驿丞' };

class Dialog {
  constructor(p) {
    this.lines = p.lines || STORY[p.key] || [];
    this.onDone = p.onDone;
    this.onLine = p.onLine;
    this.i = 0;
    this.shown = 0;
    this.alwaysUpdate = false;
    this.fade = 0;
    if (this.onLine) this.onLine(0);
  }
  textOf(i) {
    const total = store.get().steps.total;
    return this.lines[i][1].replace('{steps}', ui.fmt(total));
  }
  update(dt) {
    this.fade = Math.min(1, this.fade + dt * 5);
    if (this.i < this.lines.length) this.shown += dt * CHARS_PER_SEC;
  }
  advance() {
    const len = Array.from(this.textOf(this.i)).length;
    if (this.shown < len) {
      this.shown = len;
      return;
    }
    this.i++;
    this.shown = 0;
    if (this.i >= this.lines.length) return this.finish();
    if (this.onLine) this.onLine(this.i);
  }
  finish() {
    game.pop(this);
    if (this.onDone) this.onDone();
  }
  draw() {
    if (this.i >= this.lines.length) return;
    const [who, ] = this.lines[this.i];
    const full = this.textOf(this.i);
    const shown = Array.from(full).slice(0, Math.floor(this.shown)).join('');
    const pad = 12;
    const boxH = 98;
    const y = H - boxH - D.safeBottom - 8;
    ui.alpha(0.32 * this.fade);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    const portrait = who && who[0] !== '@' ? who : null;
    if (portrait) {
      ui.panel(8, y - 58, 60, 62, { fill: '#2a2542' });
      ui.img(art.portrait(portrait), 14, y - 54);
    }
    ui.panel(6, y, W - 12, boxH, { fill: '#1d1a2e' });
    const name = who ? (who[0] === '@' ? who.slice(1) : NAMES[who]) : '';
    if (name) {
      const nx = portrait ? 74 : 12;
      const nw = ui.font.width(name) + 14;
      ui.panel(nx, y - 11, nw, 20, { fill: '#8e2a25', line: '#ec7a4e', plain: true });
      ui.text(name, nx + 7, y - 7, UI.text);
    }
    ui.para(shown, 6 + pad, y + 15, W - 12 - pad * 2, who ? UI.text : '#d9c9a3');
    const done = Math.floor(this.shown) >= Array.from(full).length;
    if (done && Math.floor(game.t * 2.4) % 2 === 0) ui.text('▼', W - 26, y + boxH - 18, UI.gold);
    ui.hit('dialog-next', 0, 0, W, H, () => this.advance(), { sound: done ? 'tap' : null, label: 'dialog-next' });
    if (!this.noSkip) {
      ui.button('dialog-skip', W - 50, y - 26, 44, 20, { label: '跳过', kind: 'ghost', sound: 'back', onTap: () => this.finish() });
    }
  }
}

class Modal {
  constructor(p) {
    this.p = p;
    this.t = 0;
  }
  update(dt) {
    this.t = Math.min(1, this.t + dt * 7);
  }
  close(cb) {
    game.pop(this);
    if (cb) cb();
  }
  draw() {
    const p = this.p;
    const w = Math.min(W - 24, 280);
    const inner = w - 28;
    const textH = p.text ? ui.paraHeight(p.text, inner) : 0;
    const rows = p.rows || [];
    const rowH = rows.length * 18;
    const btns = p.buttons || [{ label: '好', kind: 'primary' }];
    const btnRows = p.stack ? btns.length : 1;
    const h = 40 + textH + (rows.length ? rowH + 6 : 0) + (p.icon ? 24 : 0) + btnRows * 32 + 12;
    const x = Math.round((W - w) / 2);
    const y = Math.round((H - h) / 2 + (1 - this.t) * 10);
    ui.alpha(0.55 * this.t);
    ui.rect(0, 0, W, H, '#000000');
    ui.alpha(1);
    ui.panel(x, y, w, h);
    let cy = y + 11;
    if (p.title) {
      ui.text(p.title, W / 2, cy, p.titleColor || UI.gold, { align: 'c' });
      cy += 19;
    }
    if (p.icon) {
      ui.img(p.icon, W / 2 - 8, cy);
      cy += 22;
    }
    if (p.text) {
      ui.para(p.text, x + 14, cy, inner, UI.text);
      cy += textH + 2;
    }
    rows.forEach((r) => {
      if (r.icon) ui.img(art.icon(r.icon), x + 14, cy - 1);
      ui.text(r.label, x + (r.icon ? 34 : 14), cy + 1, r.color || UI.text);
      if (r.value !== undefined) ui.text(r.value, x + w - 14, cy + 1, r.valueColor || UI.gold, { align: 'r' });
      cy += 18;
    });
    if (rows.length) cy += 4;
    const by = y + h - 12 - btnRows * 32 + 4;
    if (p.stack) {
      btns.forEach((b, i) => {
        ui.button('modal-' + i, x + 14, by + i * 32, w - 28, 28, Object.assign({}, b, { onTap: () => this.close(b.onTap) }));
      });
    } else {
      const gap = 8;
      const bw = Math.floor((w - 28 - gap * (btns.length - 1)) / btns.length);
      btns.forEach((b, i) => {
        ui.button('modal-' + i, x + 14 + i * (bw + gap), by, bw, 28, Object.assign({}, b, { onTap: () => this.close(b.onTap) }));
      });
    }
  }
}

function modal(p) {
  return game.push('modal', p);
}

// Story helper. Only the first visit plays a beat, so repeated battles stay fast.
function story(key, onDone, replay) {
  const s = store.get();
  if (!key || !STORY[key] || (s.flags.seen[key] && !replay)) {
    if (onDone) onDone();
    return;
  }
  s.flags.seen[key] = true;
  store.persist();
  game.push('dialog', { key, onDone });
}

function tip(key, text) {
  const s = store.get();
  if (s.flags.tips[key]) return false;
  s.flags.tips[key] = true;
  store.persist();
  modal({ title: '驿卒手记', text });
  return true;
}

// WeChat asks for a privacy prompt the first time personal data is requested. Its wording must link
// to the official guide through wx.openPrivacyContract, and refusing must not stop the game.
function privacyPrompt(resolve) {
  resolve({ event: 'exposureAuthorization' });
  modal({
    title: '用户隐私保护提示',
    text: '《步虚录》需要读取你的微信运动步数,用来兑换游戏内的星砂。步数只用于此项功能。你可以拒绝,拒绝后游戏进度不受任何影响。',
    stack: true,
    buttons: [
      { label: '同意并继续', kind: 'primary', onTap: () => resolve({ event: 'agree' }) },
      { label: '查看《隐私保护指引》', kind: 'ghost', onTap: () => { steps.openPrivacy(); privacyPrompt(resolve); } },
      { label: '暂不同意', kind: 'normal', onTap: () => resolve({ event: 'disagree' }) },
    ],
  });
}

function rewardRows(r) {
  const D_ = require('../data/game.js');
  const rows = [];
  if (r.coin) rows.push({ icon: 'coin', label: '铜钱', value: '+' + ui.fmt(r.coin) });
  if (r.dust) rows.push({ icon: 'dust', label: '星砂', value: '+' + ui.fmt(r.dust) });
  Object.keys(r.items || {}).forEach((k) => {
    rows.push({ icon: D_.ITEMS[k].icon, label: D_.ITEMS[k].name, value: '×' + r.items[k] });
  });
  if (r.spirit) rows.push({ icon: 'furnace', label: D_.MONSTERS[r.spirit].name + '之灵', value: '×1' });
  return rows;
}

// A choice encounter on the road. Each option may grant rewards or lead into a fight.
function runEvent(key, onDone, startFight) {
  const ev = EVENTS[key];
  const s = store.get();
  const grant = (c) => {
    if (c.dust) E.addDust(s, c.dust);
    if (c.items) E.addItems(s, c.items);
    if (c.spirit) E.addSpirits(s, [c.spirit]);
    store.persist();
  };
  modal({
    title: ev.title,
    text: ev.text,
    stack: true,
    buttons: ev.choices.map((c) => ({
      label: c.label,
      kind: 'normal',
      onTap: () => {
        if (c.fight) {
          modal({
            title: ev.title, text: c.text,
            buttons: [{
              label: '迎战', kind: 'danger',
              onTap: () => startFight(c.fight, () => {
                grant(c);
                modal({ title: ev.title, text: c.after, rows: rewardRows(c), buttons: [{ label: '继续上路', kind: 'primary', onTap: onDone }] });
              }),
            }],
          });
          return;
        }
        grant(c);
        ui.audio.sfx('coin');
        modal({ title: ev.title, text: c.text, rows: rewardRows(c), buttons: [{ label: '继续上路', kind: 'primary', onTap: onDone }] });
      },
    })),
  });
}

game.register('dialog', Dialog);
game.register('modal', Modal);

module.exports = { modal, story, tip, privacyPrompt, rewardRows, runEvent };
