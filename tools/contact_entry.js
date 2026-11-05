const { heroGrid, PORTRAITS } = require('../js/art/heroes.js');
const { DRAW, monsterGrid } = require('../js/art/monsters.js');
const { battleBg, mapBg } = require('../js/art/scenery.js');
const { hubScene } = require('../js/art/station.js');
const { ICONS, gearIcon, cardFront, cardBack, letterBig } = require('../js/art/icons.js');
const F = require('../js/data/gear.js');

const out = window.document.getElementById('out');
function show(grid, scale, label) {
  const cv = grid.toCanvas();
  const box = window.document.createElement('div');
  box.style.cssText = 'display:inline-block;margin:4px;vertical-align:bottom;text-align:center;font:10px sans-serif;color:#fff';
  cv.style.cssText = `width:${grid.w * scale}px;height:${grid.h * scale}px;image-rendering:pixelated;display:block`;
  box.appendChild(cv);
  box.appendChild(window.document.createTextNode(label));
  out.appendChild(box);
}
const which = window.__SHEET__;
if (which === 'all' || which === 'heroes') {
  ['cen', 'ruo', 'zhuo'].forEach((id) => ['idle0', 'walk0', 'walk1', 'walk2', 'walk3', 'walk4', 'walk5', 'windup', 'atk', 'thrust', 'cast', 'hurt', 'ko'].forEach((p) => show(heroGrid(id, p), 2, id + ' ' + p)));
  Object.keys(PORTRAITS).forEach((k) => show(PORTRAITS[k](), 4, k));
  Object.keys(ICONS).forEach((k) => show(ICONS[k](), 3, k));
}
if (which === 'all' || which === 'gear') {
  F.SET_ORDER.forEach((id) => F.SLOT_ORDER.forEach((slot, i) => show(gearIcon(slot, F.SETS[id], i), 4, F.SETS[id].name + slot)));
  [0, 1, 2, 3].forEach((r) => show(cardFront(r), 3, 'card ' + r));
  show(cardBack(), 3, 'back');
  show(letterBig(), 3, 'letter');
  ['gear', 'iron', 'letter'].forEach((k) => show(ICONS[k](), 4, k));
}
if (which === 'all' || which === 'monsters') {
  Object.keys(DRAW).filter((k) => DRAW[k]({}).w < 70).forEach((k) => show(monsterGrid(k), 3, k));
}
if (which === 'all' || which === 'bosses') {
  Object.keys(DRAW).filter((k) => DRAW[k]({}).w >= 70).forEach((k) => show(monsterGrid(k), 2, k));
}
if (which === 'all' || which === 'bgs') {
  ['spring', 'summer', 'loess', 'autumn', 'winter', 'void'].forEach((t) => show(battleBg(t, 200, 240), 2, t));
  show(hubScene(270, 420), 2, 'hub');
  const path = [{ x: 60, y: 260, bend: 18 }, { x: 150, y: 190, bend: -22 }, { x: 80, y: 120, bend: 20 }, { x: 150, y: 50 }];
  ['spring', 'summer', 'winter', 'void'].forEach((t) => show(mapBg(t, 200, 290, path), 1, 'map ' + t));
}
window.__DONE__ = true;
