// The final choice on the Polestar Terrace, the two endings, and credits with the player's own steps.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const audio = require('../core/audio.js');
const store = require('../systems/store.js');
const O = require('./overlays.js');
const { Weather, Particles } = require('../core/fx.js');
const { UI } = require('../core/palette.js');

const { W, H } = D;

const TURN_BG = ['void', 'void', 'spring', 'winter', 'winter', 'winter', 'spring', 'spring', 'spring', 'void', 'void', 'void', 'void', 'void', 'void', 'hub', 'hub', 'hub'];
const HOLD_BG = ['void', 'void', 'void', 'void', 'spring', 'spring', 'void', 'void'];

class Ending {
  constructor(p) {
    this.p = p;
    this.theme = 'void';
    this.weather = new Weather('void');
    this.fx = new Particles();
    this.credits = null;
    this.t = 0;
    this.petals = 0;
  }
  enter() {
    audio.bgm('ending');
    if (this.p.replayChoice) this.askChoice();
    else O.story('final', () => this.askChoice(), true);
  }
  askChoice() {
    O.modal({
      title: '斗柄在你手中',
      text: '转动它,四时重新流转,所有的等待都会有结果。松开手,阿箬还在,一切都停在此刻。',
      stack: true,
      buttons: [
        { label: '转动斗柄', kind: 'primary', onTap: () => this.play('turn') },
        { label: '松开手', kind: 'normal', onTap: () => this.play('hold') },
      ],
    });
  }
  setBg(name) {
    if (name !== this.theme) {
      this.theme = name;
      this.weather = new Weather(name === 'hub' ? 'spring' : name);
    }
  }
  play(kind) {
    const s = store.get();
    const first = !s.progress.ending;
    s.progress.ending = s.progress.ending === 'turn' ? 'turn' : kind;
    if (kind === 'turn') s.progress.stars = 6;
    store.persist();
    this.kind = kind;
    const bgs = kind === 'turn' ? TURN_BG : HOLD_BG;
    audio.sfx(kind === 'turn' ? 'star' : 'gate');
    O.story(kind === 'turn' ? 'end_turn' : 'end_hold', null, true);
    const dlg = game.top();
    dlg.onLine = (i) => {
      this.setBg(bgs[Math.min(i, bgs.length - 1)]);
      this.petals = kind === 'turn' && i >= 6 && i <= 8 ? 1 : 0;
    };
    dlg.onLine(0);
    dlg.onDone = () => {
      this.credits = { t: 0, first };
      audio.sfx('win');
    };
  }
  update(dt) {
    this.t += dt;
    this.weather.update(dt);
    this.fx.update(dt);
    if (this.petals && Math.random() < dt * 30) {
      this.fx.add({ x: W * 0.3 + Math.random() * W * 0.5, y: H * 0.3 + Math.random() * H * 0.3, vx: -14 - Math.random() * 16, vy: 14 + Math.random() * 18, wob: 4, life: 2.6, c: Math.random() > 0.4 ? '#f7c4c8' : '#e88aa0', s: 2 });
    }
    if (this.credits) this.credits.t += dt;
  }
  draw() {
    if (this.theme === 'hub') {
      ui.img(art.hub(W, H), 0, 0);
      ui.img(art.peach(), W / 2 + 10, H - 34 - 66);
    } else ui.img(art.battleBg(this.theme, W, H), 0, 0);
    this.weather.draw();
    this.fx.draw();
    if (!this.credits) return;
    const s = store.get();
    const c = this.credits;
    const a = Math.min(1, c.t / 1.2);
    ui.alpha(a * 0.72);
    ui.rect(0, 0, W, H, '#07061a');
    ui.alpha(a);
    const turned = this.kind === 'turn';
    let y = Math.round(H * 0.22);
    ui.text(turned ? '—— 全书终 ——' : '—— 另一种结局 ——', W / 2, y, UI.gold, { align: 'c' });
    y += 34;
    ui.text('这一路,你一共走了', W / 2, y, UI.text, { align: 'c' });
    y += 18;
    ui.numberBig(String(s.steps.total), W / 2, y, '#f7dd7a', 3);
    y += 34;
    ui.text('步', W / 2, y, UI.dim, { align: 'c' });
    y += 28;
    const line = turned
      ? '每一步都是真的。谢谢你,一步一步走到了这里。'
      : '你随时可以回到北辰台,再选一次。斗柄还在那里。';
    y += ui.para(line, 26, y, W - 52, UI.text, { align: undefined });
    y += 14;
    ui.text('《步虚录》', W / 2, y, UI.dim, { align: 'c' });
    ui.alpha(1);
    if (c.t > 1.5) {
      ui.button('ending-done', 36, H - D.safeBottom - 54, W - 72, 30, { label: '回到望星驿', kind: 'primary', onTap: () => game.go('hub') });
    }
  }
}

game.register('ending', Ending);
