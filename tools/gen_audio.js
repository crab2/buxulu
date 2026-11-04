#!/usr/bin/env node
// Synthesises the soundtrack and sound effects from scratch. All melodies are original, written in
// Chinese pentatonic modes. Output goes to assets/audio as small MP3s.
const fs = require('fs');
const path = require('path');
// lamejs 1.2.1 forgets a few internal imports when loaded under Node, so they are provided as globals.
global.MPEGMode = require('lamejs/src/js/MPEGMode.js');
global.Lame = require('lamejs/src/js/Lame.js');
global.BitStream = require('lamejs/src/js/BitStream.js');
const lamejs = require('lamejs');

const RATE = 22050;
const OUT = path.resolve(__dirname, '../assets/audio');
fs.mkdirSync(OUT, { recursive: true });

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function freq(n) {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  const midi = NOTE[m[1]] + (Number(m[2]) + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function buffer(seconds) {
  return new Float32Array(Math.ceil(seconds * RATE));
}
function mixAt(buf, data, start, gain) {
  const s = Math.round(start * RATE);
  for (let i = 0; i < data.length && s + i < buf.length; i++) buf[s + i] += data[i] * gain;
}

// ---- Instruments ----
// Karplus-Strong plucked string: reads as a guqin or pipa.
function pluck(f, dur, bright) {
  const n = Math.ceil(dur * RATE);
  const out = new Float32Array(n);
  const period = Math.max(2, Math.round(RATE / f));
  const ring = new Float32Array(period);
  let seed = Math.round(f * 991) & 0xffff;
  const rnd = () => {
    seed = (seed * 25173 + 13849) & 0xffff;
    return seed / 32768 - 1;
  };
  for (let i = 0; i < period; i++) ring[i] = rnd();
  const damp = bright === undefined ? 0.994 : bright;
  let p = 0;
  for (let i = 0; i < n; i++) {
    const next = (p + 1) % period;
    const v = ring[p];
    ring[p] = (ring[p] + ring[next]) * 0.5 * damp;
    out[i] = v;
    p = next;
  }
  return out;
}

// Soft pulse with vibrato and a breathy attack: stands in for a bamboo flute.
function flute(f, dur) {
  const n = Math.ceil(dur * RATE);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const vib = 1 + (t > 0.18 ? 0.006 * Math.sin(2 * Math.PI * 5.2 * t) : 0);
    ph += (f * vib) / RATE;
    const x = ph % 1;
    const tri = 4 * Math.abs(x - 0.5) - 1;
    const sq = x < 0.5 ? 1 : -1;
    const env = Math.min(1, t / 0.035) * Math.min(1, (dur - t) / 0.06);
    out[i] = (tri * 0.8 + sq * 0.12) * Math.max(0, env);
  }
  return out;
}

function chip(f, dur, duty) {
  const n = Math.ceil(dur * RATE);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    ph += f / RATE;
    const env = Math.min(1, t / 0.006) * Math.pow(Math.max(0, 1 - t / (dur * 1.05)), 0.5);
    out[i] = (ph % 1 < (duty || 0.5) ? 1 : -1) * env;
  }
  return out;
}

function bass(f, dur) {
  const n = Math.ceil(dur * RATE);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    ph += f / RATE;
    const env = Math.min(1, t / 0.005) * Math.min(1, (dur - t) / 0.02);
    out[i] = (4 * Math.abs((ph % 1) - 0.5) - 1) * Math.max(0, env);
  }
  return out;
}

function kick() {
  const n = Math.ceil(0.14 * RATE);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    ph += (55 + 110 * Math.exp(-t * 34)) / RATE;
    out[i] = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 16);
  }
  return out;
}

function noiseHit(dur, decay, tone) {
  const n = Math.ceil(dur * RATE);
  const out = new Float32Array(n);
  let seed = 12345;
  let last = 0;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const w = seed / 0x40000000 - 1;
    last += (w - last) * (tone || 1);
    out[i] = last * Math.exp((-i / RATE) * decay);
  }
  return out;
}

// ---- Sequencing ----
// "A4:3" means A4 for three eighth notes. "R" is a rest. Bars are separated by "|".
function parse(line) {
  return line.replace(/\|/g, ' ').trim().split(/\s+/).map((t) => {
    const [n, d] = t.split(':');
    return { note: n, len: Number(d) };
  });
}

function playLine(buf, text, eighth, inst, gain) {
  let at = 0;
  for (const ev of parse(text)) {
    if (ev.note !== 'R') mixAt(buf, inst(freq(ev.note), ev.len * eighth), at, gain);
    at += ev.len * eighth;
  }
}

function finalize(buf, peakTarget) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const k = (peakTarget || 0.9) / (peak || 1);
  const fade = Math.min(buf.length, Math.floor(RATE * 0.01));
  for (let i = 0; i < buf.length; i++) buf[i] *= k;
  for (let i = 0; i < fade; i++) {
    buf[i] *= i / fade;
    buf[buf.length - 1 - i] *= i / fade;
  }
  return buf;
}

function encode(buf, name, kbps) {
  const enc = new lamejs.Mp3Encoder(1, RATE, kbps);
  const pcm = new Int16Array(buf.length);
  let bad = 0;
  for (let i = 0; i < buf.length; i++) {
    if (!Number.isFinite(buf[i])) bad++;
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round((buf[i] || 0) * 32767)));
  }
  const chunks = [];
  const BLOCK = 1152;
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const c = enc.encodeBuffer(pcm.subarray(i, i + BLOCK));
    if (c.length) chunks.push(Buffer.from(c));
  }
  const end = enc.flush();
  if (end.length) chunks.push(Buffer.from(end));
  const file = Buffer.concat(chunks);
  fs.writeFileSync(path.join(OUT, name + '.mp3'), file);
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  return { name, seconds: +(buf.length / RATE).toFixed(2), kb: +(file.length / 1024).toFixed(1), rms: +rms.toFixed(3), bad };
}

const CHORD = {
  A: ['A2', 'E3', 'A3', 'C4'], G: ['G2', 'D3', 'G3', 'B3'], C: ['C3', 'G3', 'C4', 'E4'], D: ['D3', 'A3', 'D4', 'F4'],
  E: ['E2', 'B2', 'E3', 'G3'], F: ['F2', 'C3', 'F3', 'A3'],
};

function song(name, o) {
  const eighth = 60 / o.bpm / 2;
  const total = o.bars * 8 * eighth;
  const buf = buffer(total + 0.02);
  playLine(buf, o.lead, eighth, o.leadInst, o.leadGain);
  if (o.counter) playLine(buf, o.counter, eighth, o.counterInst || pluck, o.counterGain || 0.3);
  o.chords.forEach((c, bar) => {
    const t0 = bar * 8 * eighth;
    const ch = CHORD[c];
    o.accompany(buf, ch, t0, eighth, bar);
  });
  return encode(finalize(buf), 'bgm_' + name, o.kbps || 48);
}

const report = [];

report.push(song('title', {
  bpm: 72, bars: 16, leadInst: flute, leadGain: 0.42,
  lead: `A4:3 C5:1 D5:4 | E5:3 G5:1 E5:2 D5:2 | C5:3 D5:1 A4:4 | G4:2 A4:2 C5:2 A4:2 |
         A4:3 C5:1 D5:4 | E5:2 G5:2 A5:4 | G5:2 E5:2 D5:2 C5:2 | A4:8 |
         E5:3 D5:1 C5:2 D5:2 | E5:4 G5:4 | A5:3 G5:1 E5:2 D5:2 | E5:8 |
         D5:3 E5:1 G5:2 E5:2 | D5:2 C5:2 A4:4 | C5:3 D5:1 C5:2 G4:2 | A4:8`,
  chords: ['A', 'G', 'C', 'A', 'A', 'C', 'G', 'A', 'C', 'C', 'D', 'A', 'G', 'A', 'C', 'A'],
  accompany(buf, ch, t0, e) {
    [[0, 0], [2, 1], [4, 2], [6, 3]].forEach(([beat, i]) => mixAt(buf, pluck(freq(ch[i]), e * 5, 0.996), t0 + beat * e, i === 0 ? 0.55 : 0.34));
  },
}));

report.push(song('road', {
  bpm: 96, bars: 16, leadInst: flute, leadGain: 0.36,
  lead: `C5:2 D5:2 E5:2 G5:2 | A5:3 G5:1 E5:4 | D5:2 E5:2 G5:2 E5:2 | D5:4 C5:4 |
         E5:2 G5:2 A5:2 C6:2 | A5:3 G5:1 E5:4 | G5:2 E5:2 D5:2 E5:2 | C5:8 |
         A4:2 C5:2 D5:2 C5:2 | A4:2 G4:2 A4:4 | C5:2 D5:2 E5:2 G5:2 | E5:4 D5:4 |
         E5:2 D5:2 C5:2 D5:2 | E5:2 G5:2 A5:4 | G5:2 E5:2 D5:2 C5:2 | C5:8`,
  chords: ['C', 'C', 'G', 'C', 'C', 'A', 'G', 'C', 'A', 'A', 'C', 'G', 'C', 'A', 'G', 'C'],
  accompany(buf, ch, t0, e) {
    // A steady footfall: bass on the beat, a soft hand drum in between.
    [0, 2, 4, 6].forEach((b, i) => {
      mixAt(buf, pluck(freq(ch[i % 2 === 0 ? 0 : 1]), e * 2.5, 0.992), t0 + b * e, 0.5);
      mixAt(buf, noiseHit(0.06, 60, 0.4), t0 + (b + 1) * e, 0.1);
    });
    mixAt(buf, pluck(freq(ch[2]), e * 3, 0.994), t0 + 1 * e, 0.22);
    mixAt(buf, pluck(freq(ch[3]), e * 3, 0.994), t0 + 5 * e, 0.22);
  },
}));

report.push(song('battle', {
  bpm: 140, bars: 16, leadInst: (f, d) => chip(f, d, 0.33), leadGain: 0.24,
  lead: `D5:1 F5:1 G5:1 A5:1 G5:2 F5:2 | D5:2 C5:2 D5:4 | A4:1 C5:1 D5:1 F5:1 G5:2 A5:2 | G5:2 F5:2 D5:4 |
         A5:2 C6:2 A5:1 G5:1 F5:2 | G5:2 A5:2 G5:2 F5:2 | D5:1 F5:1 G5:1 A5:1 C6:2 A5:2 | D6:8 |
         C6:2 A5:2 G5:2 A5:2 | C6:2 D6:2 C6:4 | A5:2 G5:2 F5:2 G5:2 | A5:4 R:4 |
         D5:1 D5:1 F5:2 G5:1 G5:1 A5:2 | C6:2 A5:2 G5:2 F5:2 | D5:2 F5:2 G5:2 F5:2 | D5:8`,
  chords: ['D', 'D', 'F', 'D', 'F', 'G', 'D', 'D', 'A', 'A', 'F', 'A', 'D', 'F', 'D', 'D'],
  accompany(buf, ch, t0, e) {
    for (let i = 0; i < 8; i++) {
      const low = freq(ch[0]) / (ch[0].endsWith('3') ? 2 : 1);
      mixAt(buf, bass(i % 2 ? low * 2 : low, e * 0.85), t0 + i * e, 0.3);
      mixAt(buf, noiseHit(0.035, 110, 1), t0 + i * e, 0.05);
    }
    [0, 4].forEach((b) => mixAt(buf, kick(), t0 + b * e, 0.6));
    [2, 6].forEach((b) => mixAt(buf, noiseHit(0.12, 30, 0.7), t0 + b * e, 0.22));
    mixAt(buf, pluck(freq(ch[2]), e * 3, 0.99), t0 + 1 * e, 0.2);
    mixAt(buf, pluck(freq(ch[3]), e * 3, 0.99), t0 + 5 * e, 0.2);
  },
}));

report.push(song('boss', {
  bpm: 156, bars: 16, leadInst: (f, d) => chip(f, d, 0.25), leadGain: 0.24,
  lead: `E4:2 G4:2 A4:2 B4:2 | D5:3 B4:1 A4:4 | E4:2 G4:2 A4:2 G4:2 | E4:8 |
         B4:2 D5:2 E5:2 D5:2 | G5:3 E5:1 D5:4 | B4:2 A4:2 G4:2 A4:2 | B4:8 |
         E5:1 E5:1 G5:2 E5:1 E5:1 A5:2 | G5:2 E5:2 D5:4 | E5:1 E5:1 G5:2 A5:2 B5:2 | A5:4 G5:4 |
         E5:2 D5:2 B4:2 A4:2 | G4:2 A4:2 B4:4 | D5:2 B4:2 A4:2 G4:2 | E4:8`,
  counter: `R:8 | R:8 | R:8 | B3:2 G3:2 E3:4 | R:8 | R:8 | R:8 | E4:2 D4:2 B3:4 | R:8 | R:8 | R:8 | R:8 | R:8 | R:8 | R:8 | B3:2 G3:2 E3:4`,
  counterInst: (f, d) => chip(f, d, 0.5), counterGain: 0.16,
  chords: ['E', 'G', 'E', 'E', 'G', 'E', 'A', 'E', 'E', 'G', 'E', 'A', 'E', 'G', 'A', 'E'],
  accompany(buf, ch, t0, e) {
    for (let i = 0; i < 8; i++) {
      const low = freq(ch[0]);
      const f = low < 70 ? low * 2 : low;
      mixAt(buf, bass(i === 3 || i === 6 ? f * 1.5 : f, e * 0.9), t0 + i * e, 0.34);
      mixAt(buf, noiseHit(0.03, 120, 1), t0 + i * e, 0.05);
    }
    [0, 3, 4].forEach((b) => mixAt(buf, kick(), t0 + b * e, 0.62));
    [2, 6].forEach((b) => mixAt(buf, noiseHit(0.14, 26, 0.8), t0 + b * e, 0.26));
  },
}));

report.push(song('ending', {
  bpm: 60, bars: 12, leadInst: (f, d) => pluck(f, Math.max(d, 1.4), 0.997), leadGain: 0.55,
  lead: `A4:3 C5:1 D5:4 | E5:6 D5:2 | C5:3 A4:1 G4:4 | A4:8 |
         C5:3 D5:1 E5:4 | G5:3 E5:1 D5:4 | E5:2 D5:2 C5:2 A4:2 | G4:8 |
         A4:3 C5:1 D5:4 | E5:3 G5:1 A5:4 | G5:2 E5:2 D5:2 C5:2 | A4:8`,
  chords: ['A', 'A', 'C', 'A', 'C', 'G', 'A', 'G', 'A', 'C', 'G', 'A'],
  accompany(buf, ch, t0, e) {
    mixAt(buf, flute(freq(ch[1]), e * 8), t0, 0.1);
    mixAt(buf, pluck(freq(ch[0]), e * 7, 0.997), t0, 0.32);
  },
}));

// ---- Sound effects ----
function sweep(dur, f0, f1, shape, gain) {
  const n = Math.ceil(dur * RATE);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    ph += (f0 + (f1 - f0) * t) / RATE;
    const x = ph % 1;
    const v = shape === 'sq' ? (x < 0.5 ? 1 : -1) : shape === 'tri' ? 4 * Math.abs(x - 0.5) - 1 : Math.sin(2 * Math.PI * x);
    out[i] = v * (gain || 1) * Math.pow(1 - t, 1.3) * Math.min(1, i / 40);
  }
  return out;
}
function seq(notes, step, inst) {
  const buf = buffer(notes.length * step + 0.5);
  notes.forEach((n, i) => mixAt(buf, inst(freq(n)), i * step, 0.6));
  return buf;
}
function layer(...parts) {
  const len = Math.max(...parts.map((p) => p.length));
  const b = new Float32Array(len);
  parts.forEach((p) => mixAt(b, p, 0, 1));
  return b;
}

const fxTone = (d) => (f) => sweep(d, f, f, 'tri');
const SFX = {
  tap: sweep(0.05, 880, 660, 'tri'),
  back: sweep(0.07, 520, 330, 'tri'),
  coin: seq(['E5', 'A5', 'C6', 'E6', 'A6'], 0.05, fxTone(0.14)),
  hit: layer(noiseHit(0.12, 34, 0.7), sweep(0.1, 200, 70, 'sq', 0.5)),
  crit: layer(noiseHit(0.22, 18, 0.9), sweep(0.2, 500, 60, 'sq', 0.6)),
  magic: seq(['A4', 'D5', 'G5', 'C6'], 0.04, fxTone(0.16)),
  heal: seq(['C5', 'E5', 'G5', 'C6'], 0.07, fxTone(0.22)),
  seal: layer(sweep(0.3, 300, 1400, 'tri', 0.7), noiseHit(0.25, 16, 0.3)),
  ko: layer(sweep(0.4, 300, 40, 'sq', 0.5), noiseHit(0.3, 12, 0.4)),
  level: seq(['G4', 'C5', 'E5', 'G5', 'C6'], 0.08, fxTone(0.2)),
  star: seq(['A5', 'E6', 'A6'], 0.09, (f) => pluck(f, 0.7, 0.997)),
  gate: layer(sweep(0.9, 70, 45, 'tri', 1), noiseHit(0.8, 5, 0.1), pluck(freq('A3'), 0.9, 0.998)),
  win: seq(['C5', 'E5', 'G5', 'C6', 'G5', 'C6'], 0.1, (f) => pluck(f, 0.5, 0.996)),
  lose: seq(['E4', 'D4', 'C4', 'A3'], 0.2, (f) => pluck(f, 0.7, 0.996)),
  furnace: layer(noiseHit(1.2, 2.5, 0.08), sweep(1.2, 60, 200, 'tri', 0.5)),
  charge: layer(sweep(0.8, 90, 500, 'sq', 0.25), noiseHit(0.8, 3, 0.2)),
};
Object.keys(SFX).forEach((k) => report.push(encode(finalize(Float32Array.from(SFX[k]), 0.85), k, 40)));

let total = 0;
report.forEach((r) => {
  total += r.kb;
  const flag = r.bad ? '  BAD SAMPLES' : r.rms < 0.005 ? '  SILENT?' : '';
  console.log(`${r.name.padEnd(12)} ${String(r.seconds).padStart(6)}s ${String(r.kb).padStart(7)}KB rms ${r.rms}${flag}`);
});
console.log(`total ${(total / 1024).toFixed(2)} MB`);
