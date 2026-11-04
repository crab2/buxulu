// Background music and sound effects through WeChat's InnerAudioContext.
const SFX = ['tap', 'back', 'coin', 'hit', 'crit', 'magic', 'heal', 'seal', 'ko', 'level', 'star', 'gate', 'win', 'lose', 'furnace', 'charge'];

const pool = {};
let music = null;
let musicName = null;
let settings = { bgm: true, sfx: true, vibrate: true };

function resolve(path) {
  const map = typeof GameGlobal !== 'undefined' && GameGlobal.__AUDIO__;
  return map ? map[path] : path;
}

function make(path, loop, volume) {
  const src = resolve(path);
  if (!src || !wx.createInnerAudioContext) return null;
  const a = wx.createInnerAudioContext();
  a.src = src;
  a.loop = !!loop;
  a.volume = volume;
  // Audio is decoration: a failed file must never interrupt the game.
  if (a.onError) a.onError(() => {});
  return a;
}

function sfx(name) {
  if (!settings.sfx || SFX.indexOf(name) < 0) return;
  let a = pool[name];
  if (a === undefined) {
    a = make(`assets/audio/${name}.mp3`, false, 0.7);
    pool[name] = a;
  }
  if (!a) return;
  try {
    if (a.seek) a.seek(0);
    a.play();
  } catch (e) {
    /* ignored on purpose */
  }
}

function bgm(name) {
  if (musicName === name && music) {
    if (settings.bgm && music.paused !== false) music.play();
    return;
  }
  stopBgm();
  musicName = name;
  if (!name) return;
  music = make(`assets/audio/bgm_${name}.mp3`, true, 0.45);
  if (music && settings.bgm) music.play();
}

function stopBgm() {
  if (music) {
    try {
      music.stop();
      if (music.destroy) music.destroy();
    } catch (e) {
      /* ignored on purpose */
    }
  }
  music = null;
}

function configure(s) {
  settings = s;
  if (music) {
    if (s.bgm) music.play();
    else music.pause();
  } else if (s.bgm && musicName) {
    const name = musicName;
    musicName = null;
    bgm(name);
  }
}

function pause() {
  if (music) music.pause();
}

function resume() {
  if (music && settings.bgm) music.play();
}

function buzz(type) {
  if (settings.vibrate && wx.vibrateShort) wx.vibrateShort({ type: type || 'light' });
}

module.exports = { sfx, bgm, configure, pause, resume, buzz };
