// The road: one winding map per region, with nodes for battles, encounters, chests and star gates.
const game = require('../core/game.js');
const ui = require('../core/ui.js');
const D = require('../core/display.js');
const art = require('../core/art.js');
const audio = require('../core/audio.js');
const store = require('../systems/store.js');
const E = require('../systems/economy.js');
const G = require('../data/game.js');
const { CHAPTERS } = require('../data/chapters.js');
const O = require('./overlays.js');
const { Weather } = require('../core/fx.js');
const { UI, C } = require('../core/palette.js');
const { TIPS } = require('../data/story.js');

const { W, H } = D;
const NODE_GAP = 74;
const PANEL_H = 86;
const NODE_INFO = {
  fight: { icon: 'sword', col: C.red2, ring: C.red3, name: '遭遇战' },
  elite: { icon: 'skull', col: C.violet2, ring: C.violet3, name: '强敌' },
  event: { icon: 'event', col: C.blue2, ring: C.blue3, name: '路遇' },
  chest: { icon: 'chest', col: C.ochre2, ring: C.gold, name: '脚力宝箱' },
  boss: { icon: 'star', col: C.ink2, ring: C.gold2, name: '星位' },
};

function layoutNodes(chapter) {
  const n = chapter.nodes.length;
  const mapH = Math.max(H - D.contentTop, 90 + (n - 1) * NODE_GAP + 150);
  const pts = chapter.nodes.map((node, i) => {
    const y = mapH - 130 - i * NODE_GAP;
    const x = W / 2 + Math.sin(i * 1.5 + chapter.id.charCodeAt(1)) * (W * 0.26);
    return { x: Math.round(x), y: Math.round(y), bend: i % 2 ? -14 : 14, node };
  });
  return { pts, mapH };
}

class WorldMap {
  constructor(p) {
    const s = store.get();
    this.ci = p.chapter === undefined ? s.progress.chapter : p.chapter;
    this.after = p.after;
    this.setChapter(this.ci, p.focus);
  }
  setChapter(ci, focus) {
    this.ci = ci;
    const ch = CHAPTERS[ci];
    this.ch = ch;
    const { pts, mapH } = layoutNodes(ch);
    this.pts = pts;
    this.mapH = mapH;
    this.bg = art.mapBg(ch.theme, W, mapH, pts, ch.id);
    this.weather = new Weather(ch.theme);
    const s = store.get();
    let idx = pts.findIndex((q) => q.node.type !== 'chest' && !s.progress.cleared[q.node.id]);
    if (idx < 0) idx = pts.length - 1;
    if (focus !== undefined) idx = focus;
    this.selected = -1;
    this.heroAt = idx;
    this.hx = pts[idx].x;
    this.hy = pts[idx].y;
    this.walk = null;
    this.viewH = H - D.contentTop - D.safeBottom;
    this.scroll = this.clampScroll(pts[idx].y - this.viewH * 0.55);
    this.vel = 0;
    this.select(idx, true);
  }
  clampScroll(v) {
    return Math.max(0, Math.min(this.mapH - this.viewH, v));
  }
  enter() {
    audio.bgm('road');
    O.story(this.ch.intro, () => {
      if (this.after) this.after();
    });
  }
  resume() {}
  update(dt) {
    this.weather.update(dt);
    if (this.vel) {
      this.scroll = this.clampScroll(this.scroll + this.vel * dt);
      this.vel *= Math.pow(0.02, dt);
      if (Math.abs(this.vel) < 4) this.vel = 0;
    }
    if (this.walk) {
      const w = this.walk;
      w.t += dt / w.dur;
      const k = Math.min(1, w.t);
      this.hx = w.x0 + (w.x1 - w.x0) * k;
      this.hy = w.y0 + (w.y1 - w.y0) * k;
      if (w.t >= 1) {
        this.walk = null;
        this.heroAt = w.i;
        w.done();
      }
    }
  }
  onDrag(dx, dy) {
    this.scroll = this.clampScroll(this.scroll - dy);
    this.vel = 0;
  }
  onRelease(vx, vy) {
    this.vel = -vy * 0.8;
  }
  select(i, silent) {
    const s = store.get();
    const q = this.pts[i];
    if (!E.nodeUnlocked(s, q.node.id)) {
      if (!silent) ui.toast('要先走过前面的路');
      return;
    }
    this.selected = i;
  }
  walkTo(i, done) {
    const q = this.pts[i];
    const dist = Math.hypot(q.x - this.hx, q.y - this.hy);
    if (dist < 2) return done();
    this.walk = { i, t: 0, dur: Math.min(0.9, dist / 110), x0: this.hx, y0: this.hy, x1: q.x, y1: q.y, done };
  }
  depart() {
    const s = store.get();
    const i = this.selected;
    const q = this.pts[i];
    const node = q.node;
    const totalSteps = s.steps.total;
    if (node.type === 'chest') {
      if (s.progress.cleared[node.id]) return ui.toast('这里已经搜过了');
      if (totalSteps < node.needSteps) {
        O.modal({
          title: '脚力不足',
          text: `这条岔路太险,需要累计行走 ${ui.fmt(node.needSteps)} 步才能攀上去。你现在是 ${ui.fmt(totalSteps)} 步。`,
          buttons: [{ label: '知道了' }, { label: '去步虚台', kind: 'jade', onTap: () => game.go('altar') }],
        });
        return;
      }
      return this.walkTo(i, () => {
        const reward = E.claimChest(s, node.id);
        store.persist();
        this.advanceSelection();
        audio.sfx('win');
        O.modal({ title: '脚力宝箱', text: '你爬上险坡,找到了前人留下的行囊。', rows: O.rewardRows(reward), buttons: [{ label: '收下', kind: 'primary' }] });
      });
    }
    if (node.type === 'boss' && !E.gateOpen(s, node.id)) {
      O.tip('gate', TIPS.gate);
      const can = s.stardust >= node.cost;
      O.modal({
        title: `点亮「${this.ch.star}」星位`,
        text: `星位暗着,挡住了去路。献上星砂点亮它,才能挑战守星之敌。只需点亮一次,战败不用再付。`,
        rows: [{ icon: 'dust', label: '需要', value: ui.fmt(node.cost), valueColor: can ? UI.gold : UI.red }, { icon: 'dust', label: '持有', value: ui.fmt(s.stardust) }],
        buttons: can
          ? [{ label: '再想想' }, { label: '点亮', kind: 'primary', sound: 'gate', onTap: () => { E.lightGate(s, node.id); store.persist(); audio.sfx('gate'); audio.buzz('heavy'); this.startNode(i); } }]
          : [{ label: '知道了' }, { label: '去步虚台', kind: 'jade', onTap: () => game.go('altar') }],
      });
      return;
    }
    this.startNode(i);
  }
  startNode(i) {
    const s = store.get();
    const node = this.pts[i].node;
    this.walkTo(i, () => {
      if (node.type === 'event') {
        O.runEvent(node.key, () => {
          E.clearNode(s, node.id);
          store.persist();
          // After an event fight the map was rebuilt, so update whichever instance is on screen.
          const current = game.stack[0];
          if (current && current.advanceSelection) current.advanceSelection();
        }, (fight, win) => {
          game.go('battle', { fight, chapter: this.ci, focus: i, onWinNode: null, eventWin: true, resume: { key: node.key, node: node.id, win } });
        });
        return;
      }
      O.story(node.before, () => {
        if (node.id === 'c1b') {
          // A Ruo steps in at the start of this fight, then formally joins afterwards.
          E.joinHero(s, 'ruo');
          store.persist();
        }
        if (node.id === 'c6h' && s.progress.cleared.c6h) {
          // The ending can be chosen again without refighting the final boss.
          return game.go('ending', { replayChoice: true });
        }
        game.go('battle', { node, chapter: this.ci, focus: i });
      });
    });
  }
  advanceSelection() {
    const s = store.get();
    const next = this.pts.findIndex((q) => q.node.type !== 'chest' && !s.progress.cleared[q.node.id]);
    if (next >= 0) {
      this.select(next, true);
      this.scroll = this.clampScroll(this.pts[next].y - this.viewH * 0.55);
      this.vel = 0;
    }
  }
  draw() {
    const s = store.get();
    const top = D.contentTop;
    ui.rect(0, 0, W, H, '#0b0a14');
    ui.ctx.drawImage(this.bg, 0, Math.round(top - this.scroll));
    const pts = this.pts;
    const off = top - Math.round(this.scroll);
    ui.state.clip = { x: 0, y: top, w: W, h: H - PANEL_H - D.safeBottom - 4 - top };
    pts.forEach((q, i) => {
      const n = q.node;
      const info = NODE_INFO[n.type];
      const cleared = !!s.progress.cleared[n.id];
      const open = E.nodeUnlocked(s, n.id);
      const y = q.y + off;
      if (y < -40 || y > H + 40) return;
      const sel = this.selected === i;
      if (sel) {
        const r = 15 + Math.round(Math.sin(game.t * 5));
        ui.rect(q.x - r, y - 1, r * 2, 2, '#f7dd7a');
        ui.rect(q.x - 1, y - r, 2, r * 2, '#f7dd7a');
      }
      const med = art.medallion(open ? info.col : C.ink3, cleared ? C.gold : open ? info.ring : C.ink4);
      ui.img(med, q.x - 13, y - 13);
      ui.alpha(open ? 1 : 0.5);
      const icon = !open ? 'lock' : info.icon;
      ui.img(art.icon(icon), q.x - 8, y - 8);
      ui.alpha(1);
      if (cleared) ui.rect(q.x + 7, y + 7, 5, 5, '#7fd1a4');
      if (cleared) ui.rect(q.x + 8, y + 8, 3, 3, '#1f6a5c');
      if (n.type === 'boss') ui.text(this.ch.star, q.x, y + 15, UI.gold, { align: 'c', outline: true });
      if (n.type === 'chest' && !cleared) ui.text(`${n.needSteps >= 10000 ? n.needSteps / 10000 + '万' : n.needSteps / 1000 + '千'}步`, q.x, y + 15, s.steps.total >= n.needSteps ? UI.jade : UI.dim, { align: 'c', outline: true });
      if (!this.walk) ui.hit('node-' + n.id, q.x - 20, y - 20, 40, 40, () => this.select(i), { label: 'node-' + n.id });
    });
    ui.state.clip = null;
    const frame = this.walk ? 'walk' + (Math.floor(game.t * 8) % 4) : Math.floor(game.t * 1.6) % 2 ? 'idle1' : 'idle0';
    const faceRight = this.walk && this.walk.x1 > this.walk.x0;
    const heroArt = faceRight ? art.heroFlip('cen', frame) : art.hero('cen', frame);
    ui.img(heroArt.cv, this.hx - heroArt.w / 2, this.hy + off - heroArt.h + 4 - 12);
    this.weather.draw();
    this.drawPanel(s);
    this.drawHeader(s);
  }
  drawHeader(s) {
    ui.rect(0, 0, W, D.contentTop, '#1d1a2e');
    ui.rect(0, D.contentTop - 1, W, 1, UI.line);
    ui.header('', () => game.go('hub'), s.stardust);
    const y = D.capTop;
    const h = Math.max(20, D.capBottom - D.capTop);
    const canPrev = this.ci > 0, canNext = this.ci < s.progress.chapter;
    const label = this.ch.name;
    ui.text(label, 66, y + (h - ui.font.CELL) / 2, UI.text);
    const sx = 40;
    if (canPrev) ui.button('ch-prev', sx, y, 20, h, { label: '◀'.replace('◀', '<'), kind: 'ghost', onTap: () => this.setChapter(this.ci - 1) });
    if (canNext) ui.button('ch-next', 66 + ui.font.width(label) + 3, y, 20, h, { label: '>', kind: 'ghost', onTap: () => this.setChapter(this.ci + 1) });
  }
  drawPanel(s) {
    const i = this.selected;
    if (i < 0) return;
    const q = this.pts[i];
    const n = q.node;
    const h = PANEL_H;
    const y = H - h - D.safeBottom - 4;
    ui.panel(6, y, W - 12, h);
    const info = NODE_INFO[n.type];
    let title = info.name;
    if (n.type === 'boss') title = `${this.ch.star}星位`;
    if (n.type === 'event') title = '路遇';
    ui.text(title, 16, y + 9, UI.gold);
    if (n.lv) ui.text(`敌方 Lv ${n.lv}`, W - 16, y + 9, n.lv > s.heroes.cen.lv + 2 ? UI.red : UI.dim, { align: 'r' });
    if (n.foes) {
      let x = 16;
      n.foes.forEach((id) => {
        const m = G.MONSTERS[id];
        const label = m.name;
        ui.text(label, x, y + 27, UI.text);
        x += ui.font.width(label) + 2;
        ui.text(G.ELEMENTS[m.el].name, x, y + 27, G.ELEMENTS[m.el].css);
        x += 16;
      });
    } else if (n.type === 'event') {
      ui.text(s.progress.cleared[n.id] ? '你已经走过这里。' : '路上,总会遇到些什么。', 16, y + 27, UI.dim);
    } else if (n.type === 'chest') {
      ui.text(`累计 ${ui.fmt(n.needSteps)} 步可开(现 ${ui.fmt(s.steps.total)})`, 16, y + 27, UI.dim);
    }
    if (n.type === 'boss' && !E.gateOpen(s, n.id)) {
      ui.text(`点亮需 ${ui.fmt(n.cost)} 星砂`, 16, y + 44, s.stardust >= n.cost ? UI.gold : UI.red);
    } else if (s.progress.cleared[n.id] && n.foes) {
      ui.text('可重复挑战,获取经验与妖灵', 16, y + 44, UI.dim);
    } else if (n.type === 'fight' || n.type === 'elite') {
      ui.text('血量低时可用封灵符封印妖灵', 16, y + 44, UI.dim);
    }
    const cleared = !!s.progress.cleared[n.id];
    const label = n.type === 'chest' ? (cleared ? '已开启' : '开启') : n.type === 'event' ? (cleared ? '已走过' : '前往') : n.type === 'boss' && !E.gateOpen(s, n.id) ? '点亮星位' : '出发';
    const off = (n.type === 'chest' || n.type === 'event') && cleared;
    ui.button('map-go', W - 92, y + h - 32, 80, 26, { label, kind: 'primary', disabled: off || !!this.walk, onTap: () => this.depart() });
    ui.button('map-party', 14, y + h - 32, 66, 26, { label: '队伍', kind: 'normal', onTap: () => game.go('party', { from: 'map' }) });
  }
}

game.register('map', WorldMap);
