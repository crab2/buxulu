// Background music and sound effects through WeChat's InnerAudioContext.
// Paths are written out in full, not built from a name, so anything scanning the code for the files it uses can see them.
const MUSIC = {
  title: 'assets/audio/bgm_title.mp3',
  road: 'assets/audio/bgm_road.mp3',
  battle: 'assets/audio/bgm_battle.mp3',
  boss: 'assets/audio/bgm_boss.mp3',
  ending: 'assets/audio/bgm_ending.mp3',
};
const SFX = {
  tap: 'assets/audio/tap.mp3',
  back: 'assets/audio/back.mp3',
  coin: 'assets/audio/coin.mp3',
  hit: 'assets/audio/hit.mp3',
  crit: 'assets/audio/crit.mp3',
  magic: 'assets/audio/magic.mp3',
  heal: 'assets/audio/heal.mp3',
  seal: 'assets/audio/seal.mp3',
  ko: 'assets/audio/ko.mp3',
  level: 'assets/audio/level.mp3',
  star: 'assets/audio/star.mp3',
  gate: 'assets/audio/gate.mp3',
  win: 'assets/audio/win.mp3',
  lose: 'assets/audio/lose.mp3',
  furnace: 'assets/audio/furnace.mp3',
  charge: 'assets/audio/charge.mp3',
};

const pool = {};
const tracks = {}; // One context per tune for the whole session: a tune pauses when another takes over, and carries on when it returns.
let wanted = null; // The tune the current screen asked for.
let hidden = false;
let interrupted = false;
let sfxError = null;
let settings = { bgm: true, sfx: true, vibrate: true };

function resolve(path) {
  const map = typeof GameGlobal !== 'undefined' && GameGlobal.__AUDIO__;
  return map ? map[path] : path;
}

// Audio is decoration: nothing it does may interrupt the game.
function safe(fn) {
  try {
    fn();
  } catch (e) {
    /* ignored on purpose */
  }
}

const errorCode = (res) => String((res && (res.errCode || res.errMsg)) || 'x').slice(0, 16);
const musicOn = () => !!settings.bgm && !hidden && !interrupted;
const current = () => (wanted && tracks[wanted]) || null;

function sfx(name) {
  if (!settings.sfx || !SFX[name]) return;
  let a = pool[name];
  if (a === undefined) {
    const src = resolve(SFX[name]);
    a = src && wx.createInnerAudioContext ? wx.createInnerAudioContext() : null;
    if (a) {
      a.src = src;
      a.volume = 0.7;
      if (a.onError) a.onError((res) => { sfxError = errorCode(res); });
    }
    pool[name] = a;
  }
  if (!a) return;
  safe(() => {
    if (a.seek) a.seek(0);
    a.play();
  });
}

function openTrack(name) {
  const src = MUSIC[name] && resolve(MUSIC[name]);
  if (!src || !wx.createInnerAudioContext) return null;
  const a = wx.createInnerAudioContext();
  const t = { name, a, playing: false, error: null, file: null };
  const listen = (event, h) => { if (a[event]) a[event](h); };
  // The first start comes from autoplay, set before src as in WeChat's own example, because a phone may ignore a
  // play() made before the file has loaded. onCanplay asks again in case it ignored autoplay too.
  a.loop = true;
  a.volume = 0.45;
  a.autoplay = musicOn();
  listen('onPlay', () => {
    t.playing = true;
    // A slow load can finish after the player has moved on or left the game.
    if (current() !== t || !musicOn()) {
      t.playing = false;
      safe(() => a.pause());
    }
  });
  const stopped = () => { t.playing = false; };
  listen('onPause', stopped);
  listen('onStop', stopped);
  listen('onEnded', stopped);
  listen('onCanplay', () => keep());
  listen('onTimeUpdate', () => {}); // Some versions only keep currentTime up to date while this is being listened to.
  listen('onError', (res) => {
    t.playing = false;
    t.error = errorCode(res);
  });
  a.src = src;
  return t;
}

// Starts the music if it should be playing and isn't. Costs nothing, so it runs every second and on every touch.
// That is what brings the music back from anything that stopped it, whether or not the phone said so: a play() it
// ignored, a loop that ended, or a phone that only accepts play() during a touch.
function keep() {
  const t = current();
  if (t && musicOn() && !t.playing && t.error === null) safe(() => t.a.play());
}

function halt() {
  const t = current();
  if (!t) return;
  t.playing = false;
  safe(() => t.a.pause());
}

function bgm(name) {
  if (name !== wanted) {
    halt();
    wanted = name;
  }
  if (!name) return;
  const t = tracks[name];
  // A tune that failed gets a fresh start each time a screen asks for it, and is otherwise left alone.
  if (t && t.error !== null) safe(() => t.a.destroy());
  if (!t || t.error !== null) tracks[name] = openTrack(name);
  else keep();
}

function configure(s) {
  settings = s;
  if (musicOn()) keep();
  else halt();
}

function pause() {
  hidden = true;
  halt();
}

function resume() {
  hidden = false;
  interrupted = false; // Should the end of an interruption have happened while the game was away.
  const t = current();
  if (t) t.playing = false; // The system may have stopped it without saying so.
  keep();
}

function interrupt(on) {
  interrupted = on;
  const t = current();
  if (t) t.playing = false; // Everything is paused now, and it only plays again if asked after the interruption ends.
  if (!on) keep();
}

// Called once at launch, before anything plays. The iOS mute switch keeps its default of silencing the game, on
// purpose: a player on mute expects no sound, so setInnerAudioOption is not used to play through it.
function setup() {
  if (wx.onAudioInterruptionBegin) wx.onAudioInterruptionBegin(() => interrupt(true));
  if (wx.onAudioInterruptionEnd) wx.onAudioInterruptionEnd(() => interrupt(false));
}

function inPackage(path) {
  if (!wx.getFileSystemManager) return '?';
  try {
    wx.getFileSystemManager().accessSync(path);
    return 1;
  } catch (e) {
    return 0;
  }
}

// One line saying what the music is doing, because a phone has no console: bgm road on t12 file1 e- s-
// on or off, seconds played, whether the file is in the package, then the last music and sound effect errors.
function report() {
  const set = settings.bgm ? '' : 'set0 ';
  const s = `s${sfxError === null ? '-' : sfxError}`;
  if (!wanted) return `${set}bgm none ${s}`;
  const t = current();
  if (!t) return `${set}bgm ${wanted} noctx ${s}`;
  if (t.file === null) t.file = inPackage(MUSIC[t.name]);
  const state = interrupted ? 'int' : t.playing ? 'on' : 'off';
  return `${set}bgm ${t.name} ${state} t${Math.round(t.a.currentTime || 0)} file${t.file} e${t.error === null ? '-' : t.error} ${s}`;
}

function buzz(type) {
  if (settings.vibrate && wx.vibrateShort) wx.vibrateShort({ type: type || 'light' });
}

module.exports = { MUSIC, SFX, sfx, bgm, keep, configure, pause, resume, setup, report, buzz };
