const { heroGrid, PORTRAITS } = require('../js/art/heroes.js');
const { DRAW, monsterGrid } = require('../js/art/monsters.js');
const { battleBg, hubScene, mapBg } = require('../js/art/scenery.js');
const { ICONS } = require('../js/art/icons.js');

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
  ['cen', 'ruo', 'zhuo'].forEach((id) => ['idle0', 'atk', 'thrust', 'cast', 'hurt', 'walk0', 'ko'].forEach((p) => show(heroGrid(id, p), 3, id + ' ' + p)));
  Object.keys(PORTRAITS).forEach((k) => show(PORTRAITS[k](), 4, k));
  Object.keys(ICONS).forEach((k) => show(ICONS[k](), 3, k));
}
if (which === 'all' || which === 'monsters') {
  Object.keys(DRAW).filter((k) => DRAW[k]({}).w < 70).forEach((k) => show(monsterGrid(k), 3, k));
}
if (which === 'all' || which === 'bosses') {
  Object.keys(DRAW).filter((k) => DRAW[k]({}).w >= 70).forEach((k) => show(monsterGrid(k), 2, k));
}
if (which === 'all' || which === 'bgs') {
  ['spring', 'summer', 'loess', 'autumn', 'winter', 'void'].forEach((t) => show(battleBg(t, 200, 240), 2, t));
  show(hubScene(270, 240, 3), 2, 'hub');
  const path = [{ x: 60, y: 260, bend: 18 }, { x: 150, y: 190, bend: -22 }, { x: 80, y: 120, bend: 20 }, { x: 150, y: 50 }];
  ['spring', 'summer', 'winter', 'void'].forEach((t) => show(mapBg(t, 200, 290, path), 1, 'map ' + t));
}
window.__DONE__ = true;
