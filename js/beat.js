// ---- DIP HOP -----------------------------------------------------------------------
// "WHEN THE BEAT DROPS, DROP WITH IT."
//
// The Hooded Nug's last rumor, paid in full: a cup with turntables — DJ DRIP —
// runs SAUCE SESSIONS in a basement across the street from the hall. This is a
// four-lane rhythm game (mode key: beat): nuggets ride the highway down toward
// four sauce cups; dunk each one ON the beat with D F J K (or arrows, or taps).
// PERFECT dips build HYPE; full HYPE goes FEVER (2× pay, the room loses it).
//
// The music is synthesized live (WebAudio, same school as GTN's radio) from
// 16-step patterns — and the note chart is generated from the SAME patterns
// with a seeded RNG, so what you hear is literally what you play. A set is
// three tracks; play the set well and DJ DRIP drops THE STORM REMIX — he was
// on the pier one midnight with a field recorder, and the harbor... rumbled.
// (Canon-safe: the storm stays in the harbor. He only sampled it.)
//
// Scoring mirrors the other games: hits pay perFlyer-scaled into storm.caught.

const beatWorld = document.getElementById('beatWorld');

const BEAT_APPROACH = 1.45;  // seconds a note takes to fall to the cups
const BEAT_PERFECT = 0.075;  // |offset| for a PERFECT dip
const BEAT_GOOD = 0.15;      // |offset| for a plain dip (also the miss line)
const BEAT_FEVER_SECS = 8;
const BEAT_KEYS = {
  KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3,
  ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3,
  Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3,
};

// The four house sauces (lane fill / rim highlight).
const BEAT_SAUCE = [
  { name: 'ketchup', c: '#ff4136', hi: '#ff8a7a' },
  { name: 'mustard', c: '#ffd23a', hi: '#fff3b0' },
  { name: 'bbq',     c: '#9c4a1e', hi: '#d4783a' },
  { name: 'ranch',   c: '#e8e2d2', hi: '#ffffff' },
];

// The set list. Patterns are 16-step strings ('.' = rest). Bass/lead use scale
// degree DIGITS into `scale` (semitones above root). Everything — audio AND
// chart — is generated from these, so the notes always land on the music.
const BEAT_TRACKS = [
  {
    id: 'glaze', name: 'HONEY GLAZE', sub: 'side A · warm it up',
    bpm: 96, bars: 12, root: 110, scale: [0, 3, 5, 7, 10],
    kick:  'x.....x...x.....',
    snare: '....x.......x...',
    hat:   'x.x.x.x.x.x.x.x.',
    bass:  '0.....0...2...1.',
    lead:  '..2...3...4..2..',
    density: 0.6,
    pal: { bg: '#140a1e', wall: '#241238', beam1: '#ff2fa0', beam2: '#ffd23a', led: ['#ff2fa0', '#ffd23a', '#7c4dff'] },
  },
  {
    id: 'ranchhand', name: 'RANCH HAND', sub: 'side B · four to the floor',
    bpm: 114, bars: 14, root: 98, scale: [0, 3, 5, 7, 10],
    kick:  'x...x...x...x...',
    snare: '....x.......x...',
    hat:   '..x...x...x...x.',
    bass:  '0.0...2.2...3.1.',
    lead:  '..4...2...3...4.',
    density: 0.72,
    pal: { bg: '#081a16', wall: '#0e2c26', beam1: '#26e0ff', beam2: '#39ff7a', led: ['#26e0ff', '#39ff7a', '#ffd23a'] },
  },
  {
    id: 'ghost', name: 'GHOST PEPPER', sub: 'side C · do not touch the rail',
    bpm: 130, bars: 16, root: 123, scale: [0, 3, 5, 6, 7, 10],
    kick:  'x...x...x..xx...',
    snare: '....x.......x..x',
    hat:   'x.xxx.xxx.xxx.xx',
    bass:  '0..0..0.3..3..2.',
    lead:  '..5.4...2..5.4..',
    density: 0.85,
    pal: { bg: '#1c060a', wall: '#320a12', beam1: '#ff4136', beam2: '#7c4dff', led: ['#ff4136', '#ff8a3d', '#7c4dff'] },
  },
];
// The earned encore. He held the recorder over the rail. It rumbled BACK.
const BEAT_ENCORE = {
  id: 'stormrmx', name: 'THE STORM REMIX', sub: 'encore · sampled at the pier, midnight',
  bpm: 122, bars: 12, root: 104, scale: [0, 3, 5, 7, 10],
  kick:  'x...x...x...x...',
  snare: '....x...x...x...',
  hat:   'x.x.x.x.x.x.xxx.',
  bass:  '0...0...4...3.2.',
  lead:  '..2.4...5...4.2.',
  density: 0.8, encore: true,
  pal: { bg: '#0a0a1c', wall: '#141232', beam1: '#ffd23a', beam2: '#26e0ff', led: ['#ffd23a', '#26e0ff', '#7c4dff'] },
};

const beat = {
  on: false,
  cv: null, g: null, banner: null,
  W: 0, Hh: 0, scale: 1,
  t: 0,
  phase: 'title',   // title | countin | play | interlude | results
  intensity: 0,     // set loops: +bpm, +density each run-back
  trackIdx: 0,
  track: null,      // active generated track {spec, bpm, dur, events, notes, spb}
  songT: 0,
  ctx: null, master: null, noiseBuf: null, ctxT0: 0, schedIdx: 0,
  // judging
  hits: 0, misses: 0, judged: 0, judgeSum: 0, // judgeSum: perfect=1, good=0.6
  combo: 0, maxCombo: 0,
  hype: 0, feverT: 0,
  setRatings: [],   // per-track {name, acc, rating}
  encoreEarned: false, encoreUp: false, // encoreUp: the encore is the active track
  interT: 0, card: null, // interlude card {title, lines[]}
  // toys
  fx: [],           // floating judgments {x,y,t,txt,c}
  splash: [],       // sauce droplets {x,y,vx,vy,t,c}
  cupDip: [0, 0, 0, 0],
  laneFlash: [0, 0, 0, 0],
  rngState: 1,
  // mobile + BRING YOUR OWN BEAT
  isTouch: false,
  byob: null,       // the 🎵 YOUR MUSIC file-picker label (DOM)
  analyzing: false,
  src: null,        // AudioBufferSourceNode for a custom track
  lastCustom: false,
};

function beatActive() {
  return storm.mode === 'beat' && storm.running;
}

// Did any session ever reach THE STORM REMIX? Street NPCs react (js/arcade.js).
function beatEncoreDone() {
  try { return localStorage.getItem('nugBeatEncore') === '1'; } catch (e) { return false; }
}

function beatTally() {
  if (beat.phase === 'title') return '"when the beat drops, drop with it"';
  return '🎧 ' + beat.hits + ' dips' +
    (beat.combo >= 4 ? ' · x' + beat.combo : '') +
    (beat.feverT > 0 ? ' · 🔥FEVER' : '') +
    (beat.encoreUp ? ' · 🌩️ REMIX' : '');
}

// ---- setup -----------------------------------------------------------------------------

function beatLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  beat.scale = Math.max(2, Math.floor(vh / 270));
  beat.W = Math.ceil(vw / beat.scale);
  beat.Hh = Math.ceil(vh / beat.scale);
  beat.cv.width = beat.W;
  beat.cv.height = beat.Hh;
  beat.g.imageSmoothingEnabled = false;
}

function syncBeat() {
  const active = beatActive();
  if (active === beat.on) return;
  beat.on = active;
  document.body.classList.toggle('beat-mode', active);
  if (active) {
    if (!beat.cv) {
      beat.cv = document.createElement('canvas');
      beat.g = beat.cv.getContext('2d');
      beatWorld.appendChild(beat.cv);
      beat.banner = document.createElement('div');
      beat.banner.className = 'beat-banner';
      beatWorld.appendChild(beat.banner);
      // BRING YOUR OWN BEAT: feed DJ DRIP a track off your device; he charts
      // it live (onset detection + BPM estimate in beatAnalyze). No accounts,
      // no cloud, works on phones — the file never leaves the browser.
      beat.byob = document.createElement('label');
      beat.byob.className = 'beat-byob';
      beat.byob.textContent = '🎵 PLAY YOUR MUSIC';
      const fi = document.createElement('input');
      fi.type = 'file';
      fi.accept = 'audio/*';
      fi.addEventListener('change', () => {
        if (fi.files && fi.files[0]) beatLoadFile(fi.files[0]);
        fi.value = '';
      });
      beat.byob.appendChild(fi);
      beatWorld.appendChild(beat.byob);
    }
    beat.phase = 'title';
    beat.t = 0;
    beat.intensity = 0;
    beat.trackIdx = 0;
    beat.track = null;
    beat.hits = 0; beat.misses = 0; beat.judged = 0; beat.judgeSum = 0;
    beat.combo = 0; beat.maxCombo = 0;
    beat.hype = 0; beat.feverT = 0;
    beat.setRatings = [];
    beat.encoreEarned = false; beat.encoreUp = false;
    beat.fx = []; beat.splash = [];
    beat.cupDip = [0, 0, 0, 0];
    beat.laneFlash = [0, 0, 0, 0];
    beatLayout();
  } else {
    beat.banner && beat.banner.classList.remove('show');
    beat.byob && beat.byob.classList.remove('show');
    if (beat.src) { try { beat.src.stop(); } catch (e) { /* already done */ } beat.src = null; }
    // orphan any scheduled audio: old nodes hang on the old master, which we
    // drop here — resuming later gets a fresh silent-to-start graph
    if (beat.master) { try { beat.master.disconnect(); } catch (e) { /* fine */ } beat.master = null; }
    if (beat.ctx && beat.ctx.state === 'running') beat.ctx.suspend();
  }
}

function beatBanner(text, cls, secs) {
  beat.banner.textContent = text;
  beat.banner.className = 'beat-banner show' + (cls ? ' ' + cls : '');
  void beat.banner.offsetWidth;
  clearTimeout(beat.bannerT);
  beat.bannerT = setTimeout(() => beat.on && beat.banner.classList.remove('show'), (secs || 1.6) * 1000);
}

// ---- audio (tiny live synth; the chart below plays THESE exact events) -----------------

function beatCtx() {
  if (!beat.ctx) {
    try {
      beat.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { beat.ctx = null; }
  }
  if (beat.ctx && beat.ctx.state === 'suspended') beat.ctx.resume();
  if (beat.ctx && !beat.master) {
    beat.master = beat.ctx.createGain();
    beat.master.gain.value = 0.42;
    beat.master.connect(beat.ctx.destination);
  }
  return beat.ctx;
}

function beatNoise() {
  if (beat.noiseBuf) return beat.noiseBuf;
  const c = beat.ctx, len = c.sampleRate * 1.4;
  beat.noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = beat.noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return beat.noiseBuf;
}

function beatEnvGain(t, peak, decay) {
  const g = beat.ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  g.connect(beat.master);
  return g;
}

function beatKick(t) {
  const o = beat.ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  o.connect(beatEnvGain(t, 0.9, 0.18));
  o.start(t); o.stop(t + 0.2);
}

function beatSnare(t) {
  const n = beat.ctx.createBufferSource();
  n.buffer = beatNoise();
  const f = beat.ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 1700;
  n.connect(f); f.connect(beatEnvGain(t, 0.5, 0.16));
  n.start(t); n.stop(t + 0.18);
  const o = beat.ctx.createOscillator();
  o.type = 'triangle'; o.frequency.value = 190;
  o.connect(beatEnvGain(t, 0.3, 0.07));
  o.start(t); o.stop(t + 0.08);
}

function beatHat(t, open) {
  const n = beat.ctx.createBufferSource();
  n.buffer = beatNoise();
  const f = beat.ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 7200;
  n.connect(f); f.connect(beatEnvGain(t, open ? 0.22 : 0.16, open ? 0.14 : 0.045));
  n.start(t); n.stop(t + (open ? 0.16 : 0.06));
}

function beatBassNote(t, freq, dur) {
  const o = beat.ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = freq;
  const f = beat.ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 620;
  o.connect(f); f.connect(beatEnvGain(t, 0.34, Math.max(0.16, dur)));
  o.start(t); o.stop(t + dur + 0.05);
}

function beatLeadNote(t, freq) {
  const o = beat.ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = freq;
  const f = beat.ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 2400;
  o.connect(f); f.connect(beatEnvGain(t, 0.13, 0.2));
  o.start(t); o.stop(t + 0.22);
}

// FEVER hits a minor-triad stab; the encore rolls thunder under the drop.
function beatStab(t, root) {
  for (const semi of [0, 3, 7]) {
    const o = beat.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = root * 2 * Math.pow(2, semi / 12);
    o.connect(beatEnvGain(t, 0.1, 0.34));
    o.start(t); o.stop(t + 0.36);
  }
}

function beatThunder(t) {
  const n = beat.ctx.createBufferSource();
  n.buffer = beatNoise();
  n.playbackRate.value = 0.35;
  const f = beat.ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 210;
  n.connect(f); f.connect(beatEnvGain(t, 0.55, 1.3));
  n.start(t); n.stop(t + 1.4);
}

// ---- track generation (audio events + note chart from the same seeded roll) ------------

function beatRand() {
  // LCG — deterministic per track so the chart IS the music, every time
  beat.rngState = (beat.rngState * 1664525 + 1013904223) >>> 0;
  return beat.rngState / 4294967296;
}

function beatGenTrack(spec, intensity) {
  beat.rngState = 0xB417 + spec.bpm * 7 + intensity * 131;
  const bpm = spec.bpm + intensity * 6;
  const spb = 60 / bpm;         // seconds per beat
  const sps = spb / 4;          // seconds per 16th step
  const density = Math.min(0.97, spec.density + intensity * 0.05);
  const countin = 4 * spb;      // one bar of "DROP IN 4·3·2·1"
  const events = [];            // audio: {t, kind, freq?, dur?}
  const notes = [];             // gameplay: {t, lane, golden, state}
  const on = (pat, s) => pat[s] !== '.';
  const deg = (pat, s) => spec.scale[+pat[s] % spec.scale.length] || 0;

  for (let beatN = -4; beatN < 0; beatN++)
    events.push({ t: (beatN + 4) * spb - countin, kind: 'tick' });

  for (let b = 0; b < spec.bars; b++) {
    const fill = b % 4 === 3; // every 4th bar leans in
    for (let s = 0; s < 16; s++) {
      const t = b * 16 * sps + s * sps;
      if (on(spec.kick, s)) events.push({ t, kind: 'kick' });
      if (on(spec.snare, s) || (fill && s === 15)) events.push({ t, kind: 'snare' });
      if (on(spec.hat, s)) events.push({ t, kind: 'hat', open: s % 4 === 2 && spec.hat[s] === 'x' && spec.id === 'ranchhand' });
      if (on(spec.bass, s))
        events.push({ t, kind: 'bass', freq: spec.root * Math.pow(2, deg(spec.bass, s) / 12), dur: sps * 2.2 });
      if (on(spec.lead, s)) {
        const up = fill ? 12 : 0; // fills take the melody up the octave
        events.push({ t, kind: 'lead', freq: spec.root * 4 * Math.pow(2, (deg(spec.lead, s) + up) / 12) });
      }
      if (spec.encore && s === 0 && b % 4 === 0) events.push({ t, kind: 'thunder' });

      // the chart: playable events are the music's own accents, thinned by
      // density — never two notes on one step, never a gap under 2 steps
      const accent = on(spec.lead, s) ? 1 : on(spec.snare, s) ? 0.9 : on(spec.kick, s) ? 0.8 : on(spec.bass, s) ? 0.55 : 0;
      if (accent > 0 && beatRand() < accent * density) {
        const last = notes[notes.length - 1];
        if (!last || t - last.t > sps * 1.9) {
          let lane;
          if (on(spec.lead, s)) lane = +spec.lead[s] % 4;
          else if (on(spec.snare, s)) lane = 1 + ((b + s) % 2);
          else if (on(spec.kick, s)) lane = (b % 2) * 3; // outside lanes
          else lane = +spec.bass[s] % 4;
          const golden = spec.encore ? (s === 0 && b % 2 === 1) : (b % 4 === 3 && s === 14);
          notes.push({ t, lane, golden, state: 'wait' });
        }
      }
    }
  }
  const dur = spec.bars * 16 * sps + spb * 2; // a two-beat tail to breathe
  return { spec, bpm, spb, countin, events, notes, dur };
}

// ---- BRING YOUR OWN BEAT (analysis happens right here, in the browser) ------------------

async function beatLoadFile(file) {
  const c = beatCtx();
  if (!c) { beatBanner('🔇 NO AUDIO CONTEXT — NO DICE', 'over', 2); return; }
  if (beat.analyzing) return;
  beat.analyzing = true;
  beatBanner('🎧 DJ DRIP IS LISTENING…', 'go', 3);
  try {
    const buf = await c.decodeAudioData(await file.arrayBuffer());
    const tr = beatAnalyzeBuffer(buf, file.name);
    beat.analyzing = false;
    if (!tr || tr.notes.length < 12) {
      beatBanner('🎵 COULDN\'T FIND THE BEAT IN THAT ONE', 'over', 2.4);
      return;
    }
    beatStartCustom(tr);
  } catch (e) {
    beat.analyzing = false;
    beatBanner('🎵 COULDN\'T READ THAT FILE', 'over', 2.2);
  }
}

// Onset detection + tempo estimate, the classic recipe: per-hop energy (plus
// a one-pole low band, because kicks live down there), positive flux, an
// autocorrelation over 60–180 BPM, then local-max onsets snapped to the beat
// grid. Lanes split by how bassy each hit is. Whole pass runs in ~100ms.
function beatAnalyzeBuffer(buf, name) {
  const sr = buf.sampleRate, hop = 512;
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  const n = Math.floor(ch0.length / hop);
  if (n < 200) return null; // shorter than ~2.5s isn't a song, it's a ringtone
  const eng = new Float32Array(n), low = new Float32Array(n);
  const k = Math.exp(-2 * Math.PI * 180 / sr);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    let e = 0, l = 0;
    const o = i * hop;
    for (let j = 0; j < hop; j++) {
      const s = ch1 ? (ch0[o + j] + ch1[o + j]) * 0.5 : ch0[o + j];
      lp = lp * k + s * (1 - k);
      e += s * s;
      l += lp * lp;
    }
    eng[i] = e;
    low[i] = l;
  }
  const flux = new Float32Array(n);
  for (let i = 1; i < n; i++)
    flux[i] = Math.max(0, eng[i] - eng[i - 1]) + 2 * Math.max(0, low[i] - low[i - 1]);

  const fps = sr / hop;
  const corr = (lag) => {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += flux[i] * flux[i + lag];
    return s;
  };
  let bestLag = Math.round(fps * 0.5), bestScore = -1;
  for (let lag = Math.round(fps * 60 / 180); lag <= Math.round(fps * 60 / 60); lag++) {
    const s = corr(lag) * Math.sqrt(lag); // mild bias against double-time hearings
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  // octave fold: if half the lag correlates nearly as well, the song is
  // actually double-time — prefer the danceable hearing (90–180 over 45–90)
  const halfLag = Math.round(bestLag / 2);
  if ((60 * fps) / bestLag < 95 && halfLag >= Math.round(fps * 60 / 180) &&
      corr(halfLag) >= 0.55 * corr(bestLag)) {
    bestLag = halfLag;
  }
  const bpm = Math.max(60, Math.min(180, Math.round((60 * fps) / bestLag)));
  let bestOff = 0, bestP = -1;
  for (let off = 0; off < bestLag; off += 2) {
    let s = 0;
    for (let i = off; i < n; i += bestLag) s += flux[i];
    if (s > bestP) { bestP = s; bestOff = off; }
  }

  const half = bestLag / 2;
  const notes = [];
  const winR = Math.round(fps * 0.5);
  let lastT = -1;
  for (let i = 2; i < n - 2; i++) {
    if (flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
    let mean = 0, cnt = 0;
    for (let j = Math.max(0, i - winR); j < Math.min(n, i + winR); j++) { mean += flux[j]; cnt++; }
    mean /= cnt;
    if (flux[i] < mean * 1.9) continue;
    let fi = i;
    const gridPos = Math.round((i - bestOff) / half) * half + bestOff;
    if (Math.abs(gridPos - i) < half * 0.28) fi = gridPos; // snap the near-misses
    const t = fi / fps;
    if (t - lastT < 0.18) continue; // keep it thumb-playable
    lastT = t;
    const bassy = low[i] > eng[i] * 0.45;
    notes.push({
      t,
      lane: bassy ? notes.length % 2 : 2 + (notes.length % 2),
      golden: notes.length % 16 === 15,
      state: 'wait',
    });
  }

  const spb = 60 / bpm;
  const countin = 4 * spb;
  const events = [];
  for (let beatN = -4; beatN < 0; beatN++) events.push({ t: beatN * spb, kind: 'tick' });
  const pal = BEAT_TRACKS[(name || '').length % BEAT_TRACKS.length].pal;
  const title = (name || 'YOUR TRACK').replace(/\.[^.]+$/, '').toUpperCase().slice(0, 18);
  return {
    spec: {
      name: title, sub: 'your crate · charted live', custom: true,
      bpm, bars: Math.max(1, Math.ceil(buf.duration / (spb * 4))), pal,
    },
    bpm, spb, countin, events, notes,
    dur: buf.duration + 0.5,
    buffer: buf,
  };
}

function beatStartCustom(tr) {
  beat.track = tr;
  beat.encoreUp = false;
  beat.lastCustom = true;
  beat.songT = -tr.countin;
  beat.schedIdx = 0;
  beat.phase = 'countin';
  beat.trackHits = 0; beat.trackJudged = 0; beat.trackSum = 0;
  beat.card = null;
  beat.fx = []; beat.splash = [];
  const c = beatCtx();
  beat.ctxT0 = c.currentTime + 0.1 - beat.songT;
  // the record drops at song-time zero, sample-accurate on the same clock
  if (beat.src) { try { beat.src.stop(); } catch (e) { /* fine */ } }
  beat.src = c.createBufferSource();
  beat.src.buffer = tr.buffer;
  beat.src.connect(beat.master);
  beat.src.start(beat.ctxT0);
  beatBanner('🎵 NOW SPINNING: ' + tr.spec.name + ' · ' + tr.bpm + ' BPM', 'gold', 2.6);
}

// ---- flow ------------------------------------------------------------------------------

function beatStartTrack(spec) {
  if (beat.src) { try { beat.src.stop(); } catch (e) { /* fine */ } beat.src = null; }
  beat.lastCustom = false;
  beat.track = beatGenTrack(spec, beat.intensity);
  beat.encoreUp = !!spec.encore;
  beat.songT = -beat.track.countin;
  beat.schedIdx = 0;
  beat.phase = 'countin';
  beat.trackHits = 0; beat.trackJudged = 0; beat.trackSum = 0;
  beat.card = null;
  beat.fx = []; beat.splash = [];
  const c = beatCtx();
  if (c) beat.ctxT0 = c.currentTime + 0.08 - beat.songT;
  beatBanner((spec.encore ? '🌩️ ' : '🎵 ') + 'NOW SPINNING: ' + spec.name, spec.encore ? 'storm' : 'go', 2.2);
}

function beatRating(acc) {
  return acc >= 0.95 ? '💿 PLATINUM RECORD' :
    acc >= 0.85 ? '🏆 GOLD RECORD' :
    acc >= 0.7 ? '📀 SIDE A MATERIAL' :
    acc >= 0.5 ? '📼 DEMO TAPE' : '🎤 OPEN MIC NIGHT';
}

function beatEndTrack() {
  const tr = beat.track;
  const acc = beat.trackJudged > 0 ? beat.trackSum / beat.trackJudged : 0;

  if (tr.spec.custom) {
    // your record, your results — then back to the crate
    if (beat.src) { try { beat.src.stop(); } catch (e) { /* faded out */ } beat.src = null; }
    beat.phase = 'results';
    beat.card = {
      title: '🎵 ' + tr.spec.name,
      lines: [beatRating(acc), Math.round(acc * 100) + '% on the sauce · max combo x' + beat.maxCombo,
        'DJ DRIP: "…where did you FIND this?"'],
    };
    return;
  }

  beat.setRatings.push({ name: tr.spec.name, acc, rating: beatRating(acc) });

  if (tr.spec.encore) {
    try { localStorage.setItem('nugBeatEncore', '1'); } catch (e) { /* private mode */ }
    beat.encoreUp = false;
    beatShowResults('🌩️ HE REALLY DID SAMPLE IT', ['the bassline was the HARBOR.', 'the case remains open. the club remains packed.']);
    beatBanner('🌩️ THE STORM REMIX — CALL IT IN? nah. DANCE.', 'storm', 4);
    return;
  }
  if (beat.trackIdx < BEAT_TRACKS.length - 1) {
    beat.trackIdx++;
    beat.phase = 'interlude';
    beat.interT = 2.6;
    beat.card = { title: tr.spec.name, lines: [beatRating(acc), Math.round(acc * 100) + '% on the sauce'] };
  } else {
    // the set's over — did the room earn the encore?
    const setAcc = beat.setRatings.reduce((a, r) => a + r.acc, 0) / beat.setRatings.length;
    if (setAcc >= 0.66) {
      beat.encoreEarned = true;
      beat.phase = 'interlude';
      beat.interT = 3.2;
      beat.card = { title: 'SET COMPLETE', lines: ['the crowd will not leave.', "DJ DRIP: 'ok. ONE more. I've been saving it.'"] };
      beatBanner('🎧 E N C O R E', 'gold', 2.4);
    } else {
      beatShowResults('SET COMPLETE', ['tighter dips unlock the one he keeps in the crate.']);
    }
  }
}

function beatShowResults(title, extraLines) {
  beat.phase = 'results';
  const lines = beat.setRatings.map((r) => r.name + ' — ' + Math.round(r.acc * 100) + '%');
  lines.push('max combo x' + beat.maxCombo);
  beat.card = { title, lines: lines.concat(extraLines || []) };
}

function beatAdvanceFromCard() {
  if (beat.phase === 'interlude') return; // interludes auto-advance
  if (beat.phase === 'results') {
    if (beat.lastCustom) {
      // custom tracks return to the title — the crate is right there
      beat.lastCustom = false;
      beat.card = null;
      beat.phase = 'title';
      return;
    }
    // run it back: same set, hotter — intensity nudges BPM and density
    beat.intensity++;
    beat.trackIdx = 0;
    beat.setRatings = [];
    beatBanner('🔁 RUN IT BACK · SET ' + (beat.intensity + 1), 'go', 1.6);
    beatStartTrack(BEAT_TRACKS[0]);
  }
}

// ---- scoring ---------------------------------------------------------------------------

function beatComboFactor() {
  return 1 + Math.min(beat.combo, 40) * 0.05; // up to 3×
}

function beatPay(mult, x, y, golden) {
  const fever = beat.feverT > 0 ? 2 : 1;
  const worth = Math.max(1, Math.round(storm.perFlyer * mult * beatComboFactor() * fever));
  storm.caught += worth;
  spawnPopLabel(x * beat.scale, y * beat.scale, (golden ? '✨ +' : '+') + fmt.format(worth), golden ? 'golden' : '');
  updateStormHud();
}

function beatJudge(note, off) {
  const perfect = Math.abs(off) <= BEAT_PERFECT;
  note.state = 'hit';
  beat.hits++; beat.trackHits++;
  beat.judged++; beat.trackJudged++;
  beat.judgeSum += perfect ? 1 : 0.6;
  beat.trackSum += perfect ? 1 : 0.6;
  beat.combo++;
  beat.maxCombo = Math.max(beat.maxCombo, beat.combo);
  beat.hype = Math.min(1, beat.hype + (perfect ? 0.035 : 0.016));
  const lx = beatLaneX(note.lane) + beatLaneW() / 2;
  const ry = beatRecepY();
  beat.cupDip[note.lane] = 0.14;
  beat.laneFlash[note.lane] = 0.22;
  beat.fx.push({ x: lx, y: ry - 16, t: 0, txt: perfect ? 'SAUCED!' : 'dipped', c: perfect ? '#39ff7a' : '#ffd23a' });
  for (let i = 0; i < (perfect ? 9 : 5); i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const sp = 26 + Math.random() * 40;
    beat.splash.push({ x: lx, y: ry - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.5, c: BEAT_SAUCE[note.lane].c });
  }
  beatPay((perfect ? 3 : 1) * (note.golden ? 5 : 1) * (beat.encoreUp ? 2 : 1), lx, ry - 10, note.golden);
  if (beat.hype >= 1 && beat.feverT <= 0) {
    beat.feverT = BEAT_FEVER_SECS;
    beat.hype = 0;
    if (beat.ctx && beat.master) beatStab(beat.ctx.currentTime + 0.02, beat.track.spec.root);
    beatBanner('🔥 F E V E R 🔥', 'fever', 1.4);
  }
}

function beatMissNote(note) {
  note.state = 'miss';
  beat.misses++;
  beat.judged++; beat.trackJudged++;
  beat.combo = 0;
  beat.hype = Math.max(0, beat.hype - 0.12);
  beat.fx.push({ x: beatLaneX(note.lane) + beatLaneW() / 2, y: beatRecepY() - 16, t: 0, txt: 'DRY', c: '#ff5252' });
}

function beatHitLane(lane) {
  if (beat.phase !== 'play' && beat.phase !== 'countin') return;
  beat.cupDip[lane] = Math.max(beat.cupDip[lane], 0.1);
  let bestNote = null, bestOff = Infinity;
  for (const n of beat.track.notes) {
    if (n.state !== 'wait' || n.lane !== lane) continue;
    const off = n.t - beat.songT;
    if (off > BEAT_GOOD) break; // notes are time-sorted; the rest are future
    if (Math.abs(off) <= BEAT_GOOD && Math.abs(off) < Math.abs(bestOff)) { bestNote = n; bestOff = off; }
  }
  if (bestNote) beatJudge(bestNote, bestOff);
}

// ---- geometry helpers --------------------------------------------------------------------
// Everything derives from W/Hh so portrait phones get a lane highway that
// fits (narrower lanes, cups above the touch pads) instead of a desktop
// layout hanging off both edges.

function beatLaneW() {
  return beat.W < 210 ? Math.max(15, Math.floor(beat.W * 0.16)) : 24;
}
function beatHwX0() { return Math.round(beat.W / 2 - beatLaneW() * 2); }
function beatLaneX(l) { return beatHwX0() + l * beatLaneW(); }
function beatRecepY() { return beat.Hh - (beat.isTouch ? 46 : 34); }

// ---- update ----------------------------------------------------------------------------

function stepBeat(dt, w, h) {
  if (!beat.on) return;
  if (beat.cv.width !== Math.ceil(w / beat.scale) || beat.cv.height !== Math.ceil(h / beat.scale)) beatLayout();
  beat.t += dt;
  if (beat.byob) beat.byob.classList.toggle('show', beat.phase === 'title' && !beat.analyzing);
  if (beat.feverT > 0) beat.feverT -= dt;
  for (let l = 0; l < 4; l++) {
    beat.cupDip[l] = Math.max(0, beat.cupDip[l] - dt);
    beat.laneFlash[l] = Math.max(0, beat.laneFlash[l] - dt);
  }

  if (beat.phase === 'countin' || beat.phase === 'play') {
    // the audio clock is the truth when we have one; dt keeps time when we don't
    if (beat.ctx && beat.ctx.state === 'running') beat.songT = beat.ctx.currentTime - beat.ctxT0;
    else beat.songT += dt;

    // schedule imminent audio (small lookahead so pause/exit never strands much)
    const tr = beat.track;
    if (beat.ctx && beat.master) {
      const horizon = beat.songT + 0.14;
      while (beat.schedIdx < tr.events.length && tr.events[beat.schedIdx].t <= horizon) {
        const ev = tr.events[beat.schedIdx++];
        const at = Math.max(beat.ctx.currentTime + 0.005, beat.ctxT0 + ev.t);
        if (ev.kind === 'kick') beatKick(at);
        else if (ev.kind === 'snare') beatSnare(at);
        else if (ev.kind === 'hat' || ev.kind === 'tick') beatHat(at, ev.open);
        else if (ev.kind === 'bass') beatBassNote(at, ev.freq, ev.dur);
        else if (ev.kind === 'lead') beatLeadNote(at, ev.freq);
        else if (ev.kind === 'thunder') beatThunder(at);
      }
    } else {
      while (beat.schedIdx < tr.events.length && tr.events[beat.schedIdx].t <= beat.songT) beat.schedIdx++;
    }

    if (beat.phase === 'countin' && beat.songT >= 0) beat.phase = 'play';
    // notes past the good window without a press are DRY
    for (const n of tr.notes) {
      if (n.state === 'wait' && n.t - beat.songT < -BEAT_GOOD) beatMissNote(n);
      if (n.t - beat.songT > BEAT_APPROACH) break;
    }
    if (beat.songT >= tr.dur) beatEndTrack();
  } else if (beat.phase === 'interlude') {
    beat.interT -= dt;
    if (beat.interT <= 0) {
      beat.card = null;
      if (beat.encoreEarned) { beat.encoreEarned = false; beatStartTrack(BEAT_ENCORE); }
      else beatStartTrack(BEAT_TRACKS[beat.trackIdx]);
    }
  }

  // toys
  for (let i = beat.fx.length - 1; i >= 0; i--) {
    const f = beat.fx[i];
    f.t += dt; f.y -= 14 * dt;
    if (f.t > 0.5) beat.fx.splice(i, 1);
  }
  for (let i = beat.splash.length - 1; i >= 0; i--) {
    const s = beat.splash[i];
    s.t -= dt;
    if (s.t <= 0) { beat.splash.splice(i, 1); continue; }
    s.vy += 130 * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
  }

  beatDraw();
}

// ---- render ----------------------------------------------------------------------------

// One shared groove clock: 0..1 through the current beat (fake 100bpm on title).
function beatPhaseNow() {
  const spb = beat.track ? beat.track.spb : 0.6;
  return ((beat.songT || beat.t) / spb % 1 + 1) % 1;
}

function beatDraw() {
  const g = beat.g, W = beat.W, Hh = beat.Hh;
  const pal = (beat.track ? beat.track.spec : BEAT_TRACKS[0]).pal;
  const ph = beatPhaseNow();
  const pulse = Math.pow(1 - ph, 2.2);           // kick thump decay
  const fever = beat.feverT > 0;
  const playing = beat.phase === 'countin' || beat.phase === 'play';

  // room
  g.fillStyle = pal.bg;
  g.fillRect(0, 0, W, Hh);

  // LED wall: big soft tiles cycling the palette, breathing on the beat
  const tile = 22;
  const barIdx = beat.track ? Math.floor(Math.max(0, beat.songT) / (beat.track.spb * 4)) : Math.floor(beat.t / 2.4);
  for (let ty = 0; ty * tile < Hh * 0.62; ty++) {
    for (let tx = 0; tx * tile < W; tx++) {
      const c = pal.led[(tx + ty + barIdx) % pal.led.length];
      const a = (0.05 + 0.1 * pulse + (fever ? 0.1 : 0)) * ((tx * 7 + ty * 13) % 3 === 0 ? 1.6 : 1);
      g.fillStyle = c;
      g.globalAlpha = Math.min(0.32, a);
      g.fillRect(tx * tile + 1, ty * tile + 1, tile - 2, tile - 2);
    }
  }
  g.globalAlpha = 1;

  // sweeping beams from the booth (light/pattern/motion — the low-res holy trinity)
  for (let i = 0; i < 3; i++) {
    const ang = Math.PI / 2 + Math.sin(beat.t * (0.5 + i * 0.23) + i * 2.1) * 0.85;
    const bx = W / 2 + (i - 1) * 26;
    g.fillStyle = i === 1 ? pal.beam2 : pal.beam1;
    g.globalAlpha = 0.06 + 0.1 * pulse + (fever ? 0.08 : 0);
    g.beginPath();
    g.moveTo(bx, 34);
    g.lineTo(bx + Math.cos(ang) * Hh * 1.5 - 26, 34 + Math.sin(ang) * Hh * 1.5);
    g.lineTo(bx + Math.cos(ang) * Hh * 1.5 + 26, 34 + Math.sin(ang) * Hh * 1.5);
    g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
  if (fever && ph < 0.08) { // strobe hit right on the downbeat
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(0, 0, W, Hh);
  }

  beatDrawBooth(g, W, pal, ph, pulse);
  beatDrawSpeakers(g, W, Hh, pulse);
  beatDrawCrowd(g, W, Hh, ph, fever);

  // dance floor strip under the crowd
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(0, Hh - 12, W, 12);
  for (let tx = 0; tx * 12 < W; tx++) {
    g.fillStyle = pal.led[(tx + barIdx) % pal.led.length];
    g.globalAlpha = 0.14 + 0.2 * pulse * ((tx + barIdx) % 2);
    g.fillRect(tx * 12 + 1, Hh - 11, 10, 10);
  }
  g.globalAlpha = 1;

  if (playing || beat.phase === 'title') beatDrawHighway(g, W, Hh, pal, fever);
  if (beat.isTouch && playing) beatDrawPads(g, W, Hh);

  // splash + judgments
  for (const s of beat.splash) {
    g.fillStyle = s.c;
    g.globalAlpha = Math.min(1, s.t * 3);
    g.fillRect(s.x - 1, s.y - 1, 2, 2);
  }
  g.globalAlpha = 1;
  g.font = '900 9px Consolas, monospace';
  g.textAlign = 'center';
  for (const f of beat.fx) {
    g.globalAlpha = 1 - f.t * 2 * 0.9;
    g.fillStyle = f.c;
    g.fillText(f.txt, f.x, f.y);
  }
  g.globalAlpha = 1;

  if (playing) beatDrawHud(g, W, Hh, pal);
  if (beat.phase === 'countin' && beat.track) {
    const n = Math.ceil(-beat.songT / beat.track.spb);
    if (n > 0) {
      g.font = '900 30px Impact, "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.globalAlpha = 0.85;
      g.fillText(String(n), W / 2, Hh * 0.35);
      g.globalAlpha = 1;
    }
  }
  if (beat.card) beatDrawCard(g, W, Hh, pal);
  if (beat.phase === 'title') beatDrawTitle(g, W, Hh);
}

function beatDrawBooth(g, W, pal, ph, pulse) {
  const cx = W / 2, deckY = 44;
  // riser + table
  g.fillStyle = '#0a0812';
  g.fillRect(cx - 44, deckY, 88, 12);
  g.fillStyle = '#1a1626';
  g.fillRect(cx - 40, deckY - 8, 80, 9);
  // twin turntables (the rumor made flesh) — platters spin, always
  for (const dx of [-22, 22]) {
    g.fillStyle = '#2a2438';
    g.fillRect(cx + dx - 11, deckY - 7, 22, 7);
    g.fillStyle = '#0a0a12';
    g.beginPath(); g.arc(cx + dx, deckY - 3.5, 7, 0, 7); g.fill();
    g.strokeStyle = pal.beam1;
    g.lineWidth = 1;
    const a = beat.t * 5 + dx;
    g.beginPath(); g.moveTo(cx + dx, deckY - 3.5); g.lineTo(cx + dx + Math.cos(a) * 6, deckY - 3.5 + Math.sin(a) * 2.4); g.stroke();
  }
  // DJ DRIP: a cup. headphones. living his best midnight. (head-nod = the beat)
  const nod = pulse * 2.5;
  const scratch = Math.pow(1 - ((ph + 0.5) % 1), 3); // reaches on the backbeat
  g.fillStyle = '#f4f0e6';
  g.fillRect(cx - 7, deckY - 26 + nod, 14, 20);
  g.fillStyle = '#d8d0ba';
  g.fillRect(cx - 7, deckY - 26 + nod, 14, 3); // lid, slightly ajar
  g.fillStyle = '#0a0a12';
  g.fillRect(cx - 4, deckY - 20 + nod, 2, 3); // eyes down, locked in
  g.fillRect(cx + 2, deckY - 20 + nod, 2, 3);
  // headphones
  g.strokeStyle = '#ff2fa0';
  g.lineWidth = 2;
  g.beginPath(); g.arc(cx, deckY - 22 + nod, 8.5, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.fillStyle = '#ff2fa0';
  g.fillRect(cx - 10, deckY - 24 + nod, 3, 6);
  g.fillRect(cx + 7, deckY - 24 + nod, 3, 6);
  // the scratching arm
  g.strokeStyle = '#f4f0e6';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx + 6, deckY - 12 + nod);
  g.lineTo(cx + 16 + scratch * 6, deckY - 5);
  g.stroke();
  // booth sign
  g.font = '900 8px Consolas, monospace';
  g.textAlign = 'center';
  g.fillStyle = pal.beam1;
  g.fillText('DJ DRIP', cx, deckY + 9);
}

function beatDrawSpeakers(g, W, Hh, pulse) {
  if (W < 210) return; // portrait: the speakers are behind you, trust me
  for (const sx of [16, W - 50]) {
    g.fillStyle = '#0e0c16';
    g.fillRect(sx, Hh - 100, 34, 88);
    g.strokeStyle = '#242030';
    g.lineWidth = 1;
    g.strokeRect(sx + 1, Hh - 99, 32, 86);
    for (const [cy, r] of [[Hh - 76, 11], [Hh - 40, 14]]) {
      g.fillStyle = '#050508';
      g.beginPath(); g.arc(sx + 17, cy, r + pulse * 1.6, 0, 7); g.fill();
      g.strokeStyle = '#3a3448';
      g.beginPath(); g.arc(sx + 17, cy, (r + pulse * 1.6) * 0.55, 0, 7); g.stroke();
    }
  }
}

function beatDrawCrowd(g, W, Hh, ph, fever) {
  // nuggets in the dark: two rows either side of the highway, bobbing on beat
  const x0 = beatHwX0(), x1 = x0 + beatLaneW() * 4;
  if (x0 < 26) return; // portrait: the crowd is BEHIND the camera, packed in
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const px = side === -1 ? 8 + (i * 13) % Math.max(12, x0 - 22) : x1 + 10 + (i * 17) % Math.max(12, W - x1 - 24);
    const row = i % 3;
    const py = Hh - 14 - row * 9;
    const bop = fever
      ? Math.abs(Math.sin((beat.t * 6 + i))) * 6
      : Math.sin(ph * Math.PI * 2 + i * 1.3) * 2;
    g.fillStyle = row === 0 ? '#31281c' : row === 1 ? '#241c12' : '#18120a';
    g.fillRect(px - 5, py - 12 - bop, 10, 12);
    g.fillRect(px - 6, py - 14 - bop, 12, 3);
    if (fever) { // hands up
      g.fillRect(px - 8, py - 18 - bop, 2, 5);
      g.fillRect(px + 6, py - 18 - bop, 2, 5);
    }
  }
}

function beatDrawHighway(g, W, Hh, pal, fever) {
  const x0 = beatHwX0(), lw = beatLaneW(), ry = beatRecepY();
  // backing
  g.fillStyle = 'rgba(4,3,10,0.72)';
  g.fillRect(x0 - 3, 0, lw * 4 + 6, Hh);
  for (let l = 0; l <= 4; l++) {
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(x0 + l * lw, 0, 1, Hh);
  }
  // lane flashes
  for (let l = 0; l < 4; l++) {
    if (beat.laneFlash[l] > 0) {
      g.fillStyle = BEAT_SAUCE[l].c;
      g.globalAlpha = beat.laneFlash[l] * 1.4;
      g.fillRect(x0 + l * lw + 1, 0, lw - 2, ry);
      g.globalAlpha = 1;
    }
  }
  // hit line
  g.fillStyle = fever ? '#fff' : 'rgba(255,255,255,0.5)';
  g.fillRect(x0 - 3, ry - 1, lw * 4 + 6, 1);

  // notes: nuggets on their way down to the sauce
  if (beat.track) {
    const speed = (ry + 24) / BEAT_APPROACH;
    for (const n of beat.track.notes) {
      const dtN = n.t - beat.songT;
      if (dtN > BEAT_APPROACH) break;
      if (n.state === 'hit') continue;
      const y = ry - dtN * speed;
      if (y < -10 || y > Hh + 10) continue;
      const cx = x0 + n.lane * lw + lw / 2;
      if (n.state === 'miss') g.globalAlpha = 0.35;
      g.fillStyle = n.golden ? '#ffd23a' : '#e8a83e';
      g.fillRect(cx - 5, y - 4, 10, 8);
      g.fillStyle = n.golden ? '#fff3b0' : '#f7cf7d';
      g.fillRect(cx - 5, y - 4, 10, 2);
      if (n.golden) {
        g.fillStyle = '#fff';
        g.fillRect(cx - 1, y - 6, 2, 2);
      }
      g.globalAlpha = 1;
    }
  }

  // the cups (receptors), squashing when they take a dunk
  for (let l = 0; l < 4; l++) {
    const cx = x0 + l * lw + lw / 2;
    const dip = beat.cupDip[l] * 30; // 0..~4px of squash
    const s = BEAT_SAUCE[l];
    g.fillStyle = '#f4f0e6';
    g.fillRect(cx - 8, ry + 2 + dip * 0.4, 16, 14 - dip * 0.4);
    g.fillStyle = s.c;
    g.fillRect(cx - 7, ry + 3 + dip * 0.4, 14, 4);
    g.fillStyle = s.hi;
    g.fillRect(cx - 7, ry + 3 + dip * 0.4, 14, 1);
    // key hint on the cup
    g.font = '700 7px Consolas, monospace';
    g.textAlign = 'center';
    g.fillStyle = '#241c12';
    g.fillText('DFJK'[l], cx, ry + 14);
  }
}

// Four full-width tap pads along the bottom — thumbs are the drumsticks.
// (Input has always been screen-quarters; the pads just make it VISIBLE.)
function beatDrawPads(g, W, Hh) {
  const padH = 26;
  for (let l = 0; l < 4; l++) {
    const x0 = (W / 4) * l;
    g.fillStyle = BEAT_SAUCE[l].c;
    g.globalAlpha = 0.09 + Math.min(0.6, beat.laneFlash[l] * 3);
    g.fillRect(x0 + 1, Hh - padH, W / 4 - 2, padH);
    g.globalAlpha = 0.4;
    g.fillRect(x0 + 1, Hh - padH, W / 4 - 2, 2);
  }
  g.globalAlpha = 1;
}

function beatDrawHud(g, W, Hh, pal) {
  const tr = beat.track;
  g.font = '700 8px Consolas, monospace';
  g.textAlign = 'left';
  g.fillStyle = '#9aa3c7';
  const bar = Math.max(0, Math.floor(beat.songT / (tr.spb * 4))) + 1;
  g.fillText((beat.encoreUp ? '🌩 ' : '') + tr.spec.name + ' · bar ' + Math.min(bar, tr.spec.bars) + '/' + tr.spec.bars +
    (beat.intensity > 0 ? ' · set ' + (beat.intensity + 1) : ''), 6, 12, W * 0.66);
  const acc = beat.trackJudged > 0 ? Math.round(beat.trackSum / beat.trackJudged * 100) : 100;
  g.textAlign = 'right';
  g.fillText(acc + '%', W - 6, 12);

  // combo
  if (beat.combo >= 4) {
    g.font = '900 14px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillStyle = beat.feverT > 0 ? '#ff8a3d' : '#ffd23a';
    g.fillText('x' + beat.combo, W / 2, beatRecepY() + 32);
  }

  // HYPE meter, right of the highway
  const hx = beatHwX0() + beatLaneW() * 4 + 8, hy0 = Hh * 0.3, hgt = Hh * 0.42;
  g.fillStyle = 'rgba(6,10,20,0.75)';
  g.fillRect(hx - 2, hy0 - 2, 9, hgt + 4);
  const lvl = beat.feverT > 0 ? beat.feverT / BEAT_FEVER_SECS : beat.hype;
  const grad = g.createLinearGradient(0, hy0 + hgt, 0, hy0);
  grad.addColorStop(0, pal.beam1); grad.addColorStop(1, beat.feverT > 0 ? '#fff' : pal.beam2);
  g.fillStyle = grad;
  g.fillRect(hx, hy0 + hgt * (1 - lvl), 5, hgt * lvl);
  g.font = '700 7px Consolas, monospace';
  g.textAlign = 'center';
  g.fillStyle = beat.feverT > 0 ? '#ff8a3d' : '#9aa3c7';
  g.fillText(beat.feverT > 0 ? 'FVR' : 'HYPE', hx + 3, hy0 - 6);
}

function beatDrawCard(g, W, Hh, pal) {
  const cw = Math.min(230, W * 0.82), ch = 30 + beat.card.lines.length * 12;
  const x0 = W / 2 - cw / 2, y0 = Hh * 0.34 - ch / 2;
  g.fillStyle = 'rgba(4,3,12,0.88)';
  g.fillRect(x0, y0, cw, ch);
  g.strokeStyle = pal.beam1;
  g.lineWidth = 1;
  g.strokeRect(x0 + 2, y0 + 2, cw - 4, ch - 4);
  g.textAlign = 'center';
  g.font = '900 12px Impact, "Arial Black", sans-serif';
  g.fillStyle = '#fff';
  g.fillText(beat.card.title, W / 2, y0 + 15);
  g.font = '700 8px Consolas, monospace';
  g.fillStyle = '#c9d4f0';
  beat.card.lines.forEach((ln, i) => g.fillText(ln, W / 2, y0 + 28 + i * 12));
  if (beat.phase === 'results' && Math.floor(beat.t * 2.2) % 2 === 0) {
    g.fillStyle = '#ffe23a';
    g.font = '900 9px Consolas, monospace';
    g.fillText('PRESS SPACE / TAP — RUN IT BACK', W / 2, y0 + ch + 12);
  }
}

function beatDrawTitle(g, W, Hh) {
  g.fillStyle = 'rgba(3,2,10,0.55)';
  g.fillRect(0, 0, W, Hh);
  g.textAlign = 'center';
  const bob = Math.sin(beat.t * 2) * 2;
  g.font = '900 ' + Math.min(38, W * 0.12) + 'px Impact, "Arial Black", sans-serif';
  g.lineWidth = 4; g.lineJoin = 'round';
  g.strokeStyle = '#1c0418';
  g.strokeText('DIP HOP', W / 2, Hh * 0.3 + bob);
  const tg = g.createLinearGradient(0, Hh * 0.2, 0, Hh * 0.34);
  tg.addColorStop(0, '#ffd2ee'); tg.addColorStop(0.5, '#ff2fa0'); tg.addColorStop(1, '#7c4dff');
  g.fillStyle = tg;
  g.fillText('DIP HOP', W / 2, Hh * 0.3 + bob);
  g.font = '700 10px Consolas, monospace';
  g.fillStyle = '#9aa3c7';
  g.fillText('sauce sessions · nightly · DJ DRIP behind the decks', W / 2, Hh * 0.39, W - 12);
  g.fillStyle = '#eef2ff';
  g.fillText(beat.isTouch
    ? 'TAP THE FOUR LANES — dunk the nuggets ON the beat'
    : 'D F J K (or ← ↓ ↑ →) — dunk the nuggets ON the beat', W / 2, Hh * 0.52, W - 12);
  g.fillText('PERFECT dips build HYPE · full HYPE goes FEVER (2×)', W / 2, Hh * 0.59, W - 12);
  g.fillStyle = '#ffd166';
  g.fillText('play the whole set clean. he keeps one in the crate.', W / 2, Hh * 0.66, W - 12);
  g.fillStyle = '#ff9ed4';
  g.fillText('or hand him YOUR track — he charts anything ↓', W / 2, Hh * 0.72, W - 12);
  if (Math.floor(beat.t * 2.2) % 2 === 0) {
    g.font = '900 12px Consolas, monospace';
    g.fillStyle = '#ffe23a';
    g.fillText(beat.isTouch ? 'TAP — DROP IN' : 'PRESS SPACE / TAP — DROP IN', W / 2, Hh * 0.8, W - 12);
  }
}

// ---- input ------------------------------------------------------------------------------

function beatStartPressed() {
  beatCtx(); // user gesture: wake the audio before anything is scheduled
  if (beat.phase === 'title') {
    beat.trackIdx = 0;
    beat.setRatings = [];
    beatStartTrack(BEAT_TRACKS[0]);
  } else if (beat.phase === 'results') beatAdvanceFromCard();
}

window.addEventListener('keydown', (e) => {
  if (!beatActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'Space' || e.code === 'Enter') {
    if (!e.repeat) beatStartPressed();
    e.preventDefault();
    return;
  }
  const lane = BEAT_KEYS[e.code];
  if (lane !== undefined) {
    if (!e.repeat) { beatCtx(); beatHitLane(lane); }
    e.preventDefault();
  }
});

// Pointer play: the screen is four tall lanes — tap/click anywhere in a quarter.
function beatPointer(clientX) {
  if (beat.phase === 'title' || beat.phase === 'results') { beatStartPressed(); return; }
  beatCtx();
  beatHitLane(Math.max(0, Math.min(3, Math.floor(clientX / window.innerWidth * 4))));
}

window.addEventListener('mousedown', (e) => {
  if (!beatActive()) return;
  if (e.target.closest('.storm-hud') || e.target.closest('.beat-byob')) return;
  beatPointer(e.clientX);
});
beatWorld.addEventListener('touchstart', (e) => {
  beat.isTouch = true;
  if (e.target.closest && e.target.closest('.beat-byob')) return; // the file picker owns this tap
  for (const t of e.changedTouches) beatPointer(t.clientX);
  e.preventDefault();
}, { passive: false });
