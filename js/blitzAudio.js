// ---- 🎸 NUGGET BLITZ: THE SOUND ------------------------------------------------------------------
// "make the music more fun … it just feels kind of empty. Bring the game to
// life." — Chris. The cart's soundtrack was ROCK AND METAL, original tracks
// written per quarter and per event (an upbeat first quarter, a halftime
// theme…), with an announcer who never shut up and a stadium that answered
// every hit. So this file is a small band, a crowd and a booth:
//
//   • THE BAND — a step sequencer (16ths, lookahead-scheduled off the game
//     loop) driving synthesized drums, a distorted power-chord guitar, bass,
//     a lead, organ, clav and brass. Seven original tracks: the menu THEME,
//     one per quarter (Q1 rock, Q2 funk, Q3 rock, Q4 metal), the HALFTIME
//     marching band, and WIN / LOSE. Stems duck by game phase: the full band
//     between plays, drums + bass while the ball is live (the hits need the
//     room), the drums alone and the crowd under the snap count.
//   • STINGERS — touchdown fanfare, CHARGE!, first-down organ, the sack dive,
//     the sad trombone, the fire riff, the kickoff drum roll.
//   • THE CROWD — a breathing bed plus synthesized voices: DE-FENSE! (clap
//     clap) in time with the band, OOOH on a big hit, AWWW, BOOO, the roar.
//   • THE BOOTH — every voice in the game (play-by-play, colour, the QB's
//     cadence, trash talk at the line) is a pre-rendered neural-TTS clip
//     (audio/blitz/vo/, manifest js/blitzVO.js), on two channels with
//     priorities and shelf lives. No browser speech engine anywhere.
//
// Everything rides blitz.sfx.ctx (made on the first gesture in js/blitz.js).
// Every note's last node disconnects itself onended — a full game is tens of
// thousands of notes (Dip Hop learned this the hard way, beatSweepEnvs).

const BLZ_NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function blzHz(name) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m) return 0;
  return 440 * Math.pow(2, (BLZ_NOTE[m[1]] + (+m[2] + 1) * 12 - 69) / 12);
}
function blzMidiHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }
// a chord token → [root midi (bass register), intervals]
function blzChord(tok) {
  const m = /^([A-G][#b]?)(.*)$/.exec(tok || 'E');
  let root = BLZ_NOTE[m[1]] + 40;                  // E2 = 40 … D#3 = 51
  while (root < 40) root += 12; while (root > 51) root -= 12;
  const q = m[2];
  const iv = q === 'm7' ? [0, 3, 7, 10] : q === '7' ? [0, 4, 7, 10] : q === 'm' ? [0, 3, 7] : q === 'maj7' ? [0, 4, 7, 11] : q === '5' || q === '' ? [0, 4, 7] : [0, 4, 7];
  return { root, iv, minor: q.startsWith('m') && q !== 'maj7' };
}

// ---- the drum, guitar and bass patterns (16 steps a bar) ------------------------------------------
// drums: k kick · s snare · g ghost snare · h hat · o open hat · c crash · x clap · t tom · r ride
const BLZ_DRUMS = {
  rock:   { k: 'x.......x.x.....', s: '....x.......x...', h: 'h.h.h.h.h.h.h.h.' },
  rockF:  { k: 'x.......x.x.....', s: '....x.......x.ss', h: 'h.h.h.h.h.h.h...', t: '............t.t.' },
  rock2:  { k: 'x.....x.x.....x.', s: '....x.......x...', h: 'h.h.h.h.h.h.h.o.' },
  rock2F: { k: 'x.....x.x.....x.', s: '....x.......sss.', h: 'h.h.h.h.h.h.....', t: '..........t.t...' },
  funk:   { k: 'x..x..x...x..x..', s: '....x..g.g..x..g', h: 'hhhhhhhhhhhhhhho' },
  funkF:  { k: 'x..x..x...x.....', s: '....x..g.g..ssss', h: 'hhhhhhhhhhhh....' },
  march:  { k: 'x...x...x...x...', s: 'x.gsx.g.x.gsx.ss', h: '' },
  marchF: { k: 'x...x...x...x...', s: 'ssssssssssssx.x.', h: '' },
  metal:  { k: 'xxxxxxxxxxxxxxxx', s: '....x.......x...', h: 'r.r.r.r.r.r.r.r.' },
  metalF: { k: 'xxxxxxxxxxxx....', s: '....x.......ssss', h: 'r.r.r.r.r.r.....', t: '............tttt' },
  half:   { k: 'x.......x.......', s: '........x.......', h: 'h...h...h...h...' },
  brush:  { k: 'x.......x.......', s: '....g.......g...', h: '..h...h...h...h.' },
  snap:   { k: 'x.......x.......', s: '........x.......', h: 'h.h.h.h.h.h.h.h.' },
};
// guitar: X = open accent (rings), x = palm-muted chug, h = hold the chord all bar
const BLZ_GTR = {
  drive: 'X.x.x.X.x.x.X.x.',
  chug16: 'X.xxX.xxX.xxX.xx',
  gallop: 'X.xxx.xxx.xxx.xx',
  stab: 'X..X..X.........',
  open: 'X.......X.......',
  hold: 'h...............',
  none: '',
};
// bass tokens relative to the chord root: R root · O octave · 5 · b3 · 3 · 4 · b7 · ~ hold · . rest
const BLZ_BASS = {
  roots8: 'R.R.R.R.R.R.R.R.',
  roots8o: 'R.R.R.R.R.R.R.O.',
  gallop: 'R.RRR.RRR.RRR.RR',
  slap: 'R.O..R.b3.4.5.Ob75',
  tuba: 'R...5...R...5...',
  walk: 'R~~~5~~~O~~~5~~~',
  hold: 'R~~~~~~~~~~~~~~~',
};
const BLZ_KEYS = {
  clav: '..x...x...x.x.x.',
  organ: 'h...............',
  stabs: '............x.x.',
  none: '',
};

// ---- the songs (all original) -------------------------------------------------------------------
// a bar: ch chord · d drums · g guitar · b bass · k keys · kv keys voice · l lead (16 tokens)
const blzBar = (ch, d, g, b, l, k) => ({ ch, d, g, b, l: l || '', k: k || 'none' });
const BLZ_TRACKS = {
  // the menu anthem: E minor, the hook a nugget could hum
  theme: { name: 'NUGGET BLITZ THEME', bpm: 140, lead: 'gtr', kv: 'organ', bars: [
    blzBar('E5', 'rock', 'drive', 'roots8', 'E5 . G5 . A5 . B5 . ~ . A5 . G5 . E5 .'),
    blzBar('C5', 'rock', 'drive', 'roots8', 'G5 ~ ~ . E5 ~ . . D5 . E5 ~ ~ ~ . .'),
    blzBar('D5', 'rock', 'drive', 'roots8', 'F#5 ~ . . A5 ~ . . D6 ~ . . C6 . B5 .'),
    blzBar('B5', 'rockF', 'stab', 'roots8o', 'B5 ~ ~ ~ A5 . G5 . F#5 ~ ~ ~ . . . .'),
    blzBar('E5', 'rock', 'drive', 'roots8', 'E5 . G5 . A5 . B5 . ~ . D6 . B5 . A5 .'),
    blzBar('C5', 'rock', 'drive', 'roots8', 'G5 ~ ~ . E5 ~ . . G5 . A5 ~ ~ ~ . .'),
    blzBar('D5', 'rock', 'drive', 'roots8', 'F#5 ~ . . A5 ~ . . D6 ~ . . E6 . D6 .'),
    blzBar('B5', 'rockF', 'stab', 'roots8o', 'D#6 ~ ~ ~ ~ ~ ~ ~ B5 ~ ~ ~ ~ ~ . .'),
  ] },
  // Q1: GREASE FIRE — the riff first, then the riff answers itself
  q1: { name: 'GREASE FIRE', bpm: 156, lead: 'gtr', bars: [
    blzBar('A5', 'rock2', 'chug16', 'roots8'), blzBar('A5', 'rock2', 'chug16', 'roots8'),
    blzBar('F5', 'rock2', 'chug16', 'roots8'), blzBar('G5', 'rock2F', 'stab', 'roots8o'),
    blzBar('A5', 'rock2', 'chug16', 'roots8', 'A4 . C5 . D5 . E5 . G5 . E5 . D5 . C5 .'),
    blzBar('A5', 'rock2', 'chug16', 'roots8', 'D5 ~ ~ . C5 . A4 . ~ ~ . . . . . .'),
    blzBar('C5', 'rock2', 'chug16', 'roots8', 'C5 . D5 . E5 . G5 . A5 ~ ~ . G5 . E5 .'),
    blzBar('D5', 'rock2F', 'stab', 'roots8o', 'D5 ~ ~ ~ ~ ~ ~ ~ . . . . . . . .'),
  ] },
  // Q2: SAUCE BOSS STRUT — slap bass, clav, horns, a swing in the hats
  q2: { name: 'SAUCE BOSS STRUT', bpm: 112, swing: 0.12, lead: 'brass', bars: [
    blzBar('Em7', 'funk', 'none', 'slap', '', 'clav'), blzBar('Em7', 'funk', 'none', 'slap', '', 'clav'),
    blzBar('A7', 'funk', 'none', 'slap', '', 'clav'), blzBar('A7', 'funkF', 'none', 'slap', '', 'stabs'),
    blzBar('Em7', 'funk', 'none', 'slap', 'B4 . D5 . E5 . . . G5 . E5 . D5 . B4 .', 'clav'),
    blzBar('Em7', 'funk', 'none', 'slap', 'D5 ~ ~ ~ B4 . A4 . ~ ~ . . . . . .', 'clav'),
    blzBar('C7', 'funk', 'none', 'slap', 'E5 . G5 . A5 . . . C6 . A5 . G5 . E5 .', 'clav'),
    blzBar('B7', 'funkF', 'none', 'slap', 'F#5 ~ ~ ~ D#5 ~ ~ ~ B4 ~ ~ ~ . . . .', 'stabs'),
  ] },
  // HALFTIME AT THE FRYER — the marching band takes the field
  half: { name: 'HALFTIME AT THE FRYER', bpm: 124, lead: 'brass', bars: [
    blzBar('Bb', 'march', 'none', 'tuba', 'Bb4 . D5 . F5 . . . F5 . G5 . F5 . D5 .'),
    blzBar('Eb', 'march', 'none', 'tuba', 'Eb5 ~ ~ . D5 . C5 . Bb4 ~ ~ . . . . .'),
    blzBar('Eb', 'march', 'none', 'tuba', 'G5 . . . F5 . Eb5 . C5 . D5 . Eb5 . F5 .'),
    blzBar('F', 'marchF', 'none', 'tuba', 'F5 ~ ~ ~ ~ ~ . . . . . . . . . .'),
    blzBar('Bb', 'march', 'none', 'tuba', 'Bb4 . D5 . F5 . . . Bb5 . A5 . G5 . F5 .'),
    blzBar('Gm', 'march', 'none', 'tuba', 'G5 ~ ~ . F5 . D5 . G4 ~ ~ . . . . .'),
    blzBar('Eb', 'march', 'none', 'tuba', 'Eb5 . G5 . Bb5 . . . A5 . G5 . F5 . A5 .'),
    blzBar('F', 'marchF', 'none', 'tuba', 'Bb5 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ . . . .'),
  ] },
  // Q3: CRUNCH TIME — D minor, the lead takes the second half
  q3: { name: 'CRUNCH TIME', bpm: 148, lead: 'gtr', bars: [
    blzBar('D5', 'rock2', 'drive', 'roots8'), blzBar('D5', 'rock2', 'drive', 'roots8'),
    blzBar('Bb5', 'rock2', 'drive', 'roots8'), blzBar('C5', 'rock2F', 'stab', 'roots8o'),
    blzBar('D5', 'rock2', 'drive', 'roots8', 'D5 . F5 . G5 . A5 . ~ . C6 . A5 . G5 .'),
    blzBar('D5', 'rock2', 'drive', 'roots8', 'F5 ~ ~ . D5 ~ . . C5 . D5 ~ ~ ~ . .'),
    blzBar('F5', 'rock2', 'drive', 'roots8', 'D5 . F5 . G5 . A5 . ~ . D6 . C6 . A5 .'),
    blzBar('A5', 'rock2F', 'stab', 'roots8o', 'C6 ~ ~ . A5 ~ . . E5 ~ ~ ~ C#5 ~ . .'),
  ] },
  // Q4 / OT: MELTDOWN — double kick, the gallop, the lead wails
  q4: { name: 'MELTDOWN', bpm: 172, lead: 'gtr', bars: [
    blzBar('E5', 'metal', 'gallop', 'gallop'), blzBar('E5', 'metal', 'gallop', 'gallop'),
    blzBar('G5', 'metal', 'gallop', 'gallop'), blzBar('F#5', 'metalF', 'stab', 'roots8o'),
    blzBar('E5', 'metal', 'gallop', 'gallop', 'B5 ~ ~ ~ ~ ~ ~ ~ A5 ~ ~ ~ G5 ~ ~ ~'),
    blzBar('E5', 'metal', 'gallop', 'gallop', 'F#5 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ . . . .'),
    blzBar('C5', 'metal', 'gallop', 'gallop', 'B5 ~ ~ ~ ~ ~ ~ ~ C6 ~ ~ ~ D6 ~ ~ ~'),
    blzBar('D5', 'metalF', 'stab', 'roots8o', 'E6 ~ ~ ~ ~ ~ ~ ~ D6 ~ ~ ~ B5 ~ ~ ~'),
  ] },
  win: { name: 'VICTORY FRIES', bpm: 132, lead: 'brass', bars: [
    blzBar('C', 'rock', 'open', 'roots8', 'G5 . E5 G5 C6 ~ ~ . B5 . A5 . G5 ~ ~ .'),
    blzBar('G', 'rock', 'open', 'roots8', 'D6 ~ ~ . B5 . G5 . A5 ~ ~ . G5 ~ ~ .'),
    blzBar('Am', 'rock', 'open', 'roots8', 'E5 . A5 . C6 ~ ~ . B5 . A5 . E5 ~ ~ .'),
    blzBar('F', 'rockF', 'open', 'roots8o', 'F5 . A5 . C6 . F6 ~ ~ ~ E6 ~ D6 ~ C6 ~'),
  ] },
  lose: { name: 'SOGGY FRIES', bpm: 76, lead: 'organ', kv: 'organ', bars: [
    blzBar('Am', 'brush', 'none', 'walk', 'E5 ~ ~ ~ C5 ~ ~ ~ A4 ~ ~ ~ ~ ~ ~ ~', 'organ'),
    blzBar('Dm', 'brush', 'none', 'walk', 'F5 ~ ~ ~ D5 ~ ~ ~ A4 ~ ~ ~ ~ ~ ~ ~', 'organ'),
    blzBar('Am', 'brush', 'none', 'walk', 'E5 ~ ~ ~ C5 ~ ~ ~ B4 ~ ~ ~ A4 ~ ~ ~', 'organ'),
    blzBar('E7', 'brush', 'none', 'walk', 'G#4 ~ ~ ~ B4 ~ ~ ~ E5 ~ ~ ~ ~ ~ ~ ~', 'organ'),
  ] },
};

// ---- the engine ------------------------------------------------------------------------------------
const blzMus = {
  ok: false, on: true, vol: 0.62, key: '', T: null, pend: null, bar: 0, step: 0, nextT: 0,
  bus: null, comp: null, rev: null, revIn: null, stem: {}, gtrIn: null, leadIn: null, crowdIn: null,
  mix: '', heldLead: null, lastLeadHz: 0, chant: null,
};
const BLZ_STEMS = ['drums', 'bass', 'gtr', 'lead', 'keys'];
// stem levels per game moment
const BLZ_MIXES = {
  full: { drums: 1, bass: 1, gtr: 1, lead: 1, keys: 1 },
  live: { drums: 0.55, bass: 0.6, gtr: 0.22, lead: 0, keys: 0.25 },
  snap: { drums: 0.85, bass: 0.55, gtr: 0, lead: 0, keys: 0 },
  low: { drums: 0.35, bass: 0.35, gtr: 0.2, lead: 0.2, keys: 0.25 },
  off: { drums: 0, bass: 0, gtr: 0, lead: 0, keys: 0 },
};

function blzMusInit() {
  const S = blitz.sfx, ctx = S.ctx;
  if (blzMus.ok || !ctx) return blzMus.ok;
  try {
    const M = blzMus;
    M.bus = ctx.createGain(); M.bus.gain.value = M.on ? M.vol : 0;
    M.comp = ctx.createDynamicsCompressor();
    M.comp.threshold.value = -16; M.comp.knee.value = 8; M.comp.ratio.value = 4; M.comp.attack.value = 0.004; M.comp.release.value = 0.18;
    M.bus.connect(M.comp); M.comp.connect(S.master);
    // a stadium in a box: a synthetic 1.7s stereo tail
    M.rev = ctx.createConvolver();
    const len = Math.round(ctx.sampleRate * 1.7), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < 90 ? i / 90 : 1);
    }
    M.rev.buffer = ir;
    M.revIn = ctx.createGain(); M.revIn.gain.value = 1;
    const revOut = ctx.createGain(); revOut.gain.value = 0.32;
    M.revIn.connect(M.rev); M.rev.connect(revOut); revOut.connect(M.bus);
    for (const k of BLZ_STEMS) { const g = ctx.createGain(); g.gain.value = 0; g.connect(M.bus); M.stem[k] = g; }
    // the guitar rig: soft-clip drive, a cab-ish lowpass, a little room
    const shaper = (amt) => {
      const sh = ctx.createWaveShaper(), n = 1024, c = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = (1 + amt) * x / (1 + amt * Math.abs(x)); }
      sh.curve = c; sh.oversample = '2x';
      return sh;
    };
    M.gtrIn = ctx.createGain();
    const gs = shaper(28), glp = ctx.createBiquadFilter(), ghp = ctx.createBiquadFilter(), gmid = ctx.createBiquadFilter();
    glp.type = 'lowpass'; glp.frequency.value = 3600; glp.Q.value = 0.8;
    ghp.type = 'highpass'; ghp.frequency.value = 85;
    gmid.type = 'peaking'; gmid.frequency.value = 520; gmid.Q.value = 1; gmid.gain.value = -5;
    M.gtrIn.connect(gs); gs.connect(ghp); ghp.connect(gmid); gmid.connect(glp);
    const gout = ctx.createGain(); gout.gain.value = 0.32;
    glp.connect(gout); gout.connect(M.stem.gtr);
    // the stinger rigs: the same drive, straight to the bus, past the stems
    M.stingGtrIn = ctx.createGain();
    const sgs = shaper(28), sglp = ctx.createBiquadFilter(); sglp.type = 'lowpass'; sglp.frequency.value = 3600;
    const sgo = ctx.createGain(); sgo.gain.value = 0.3;
    M.stingGtrIn.connect(sgs); sgs.connect(sglp); sglp.connect(sgo); sgo.connect(M.bus);
    M.stingLeadIn = ctx.createGain();
    const sls = shaper(14), sllp = ctx.createBiquadFilter(); sllp.type = 'lowpass'; sllp.frequency.value = 4800;
    const slo = ctx.createGain(); slo.gain.value = 0.32;
    M.stingLeadIn.connect(sls); sls.connect(sllp); sllp.connect(slo); slo.connect(M.bus);
    const slr = ctx.createGain(); slr.gain.value = 0.35; sllp.connect(slr); slr.connect(M.revIn);
    M.leadIn = ctx.createGain();
    const ls = shaper(14), llp = ctx.createBiquadFilter();
    llp.type = 'lowpass'; llp.frequency.value = 4800;
    M.leadIn.connect(ls); ls.connect(llp);
    const lout = ctx.createGain(); lout.gain.value = 0.3;
    llp.connect(lout); lout.connect(M.stem.lead);
    const lsend = ctx.createGain(); lsend.gain.value = 0.35; llp.connect(lsend); lsend.connect(M.revIn);
    // the crowd's own bus, wet
    M.crowdIn = ctx.createGain(); M.crowdIn.gain.value = 1;
    M.crowdIn.connect(S.master);
    const csend = ctx.createGain(); csend.gain.value = 0.6; M.crowdIn.connect(csend); csend.connect(M.revIn);
    M.ok = true;
  } catch (e) { blzMus.ok = false; }
  return blzMus.ok;
}

function blzMusToggle() {
  const M = blzMus;
  M.on = !M.on;
  if (M.bus && blitz.sfx.ctx) M.bus.gain.setTargetAtTime(M.on ? M.vol : 0, blitz.sfx.ctx.currentTime, 0.08);
  return M.on;
}

// queue a song; it starts on the next downbeat (or now, if nothing's playing)
function blzMusPlay(key) {
  const M = blzMus;
  if (!BLZ_TRACKS[key]) return;
  if (!blzMusInit()) return;
  if (M.key === key && !M.pend) return;
  if (M.pend === key) return;
  const ctx = blitz.sfx.ctx;
  if (!M.T) { M.key = key; M.T = BLZ_TRACKS[key]; M.bar = 0; M.step = 0; M.nextT = ctx.currentTime + 0.06; M.first = true; return; }
  M.pend = key;
}
function blzMusMix(name) {
  const M = blzMus;
  if (!M.ok || M.mix === name) return;
  M.mix = name;
  const L = BLZ_MIXES[name] || BLZ_MIXES.full, t = blitz.sfx.ctx.currentTime;
  for (const k of BLZ_STEMS) M.stem[k].gain.setTargetAtTime(L[k], t, name === 'live' ? 0.12 : 0.25);
}
// duck the whole band for a stinger
function blzMusDuck(depth, secs) {
  const M = blzMus;
  if (!M.ok || !M.on) return;
  const t = blitz.sfx.ctx.currentTime, g = M.bus.gain;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(M.vol * depth, t + 0.05);
  g.setValueAtTime(M.vol * depth, t + secs);
  g.linearRampToValueAtTime(M.vol, t + secs + 0.6);
}

// the scheduler: called every frame; schedules every step inside the lookahead
function blzMusTick() {
  const M = blzMus, S = blitz.sfx, ctx = S.ctx;
  if (!M.ok || !M.T || !ctx || S.muted) return;
  const now = ctx.currentTime;
  if (M.nextT < now - 0.25) M.nextT = now + 0.03;      // we were asleep (a background tab): don't burst
  const look = now + 0.14;
  let guard = 0;
  while (M.nextT < look && guard++ < 64) {
    const T = M.T, sd = 60 / T.bpm / 4;
    if (M.step === 0 && M.pend && M.bar % 2 === 0) {
      M.key = M.pend; M.T = BLZ_TRACKS[M.pend]; M.pend = null; M.bar = 0; M.first = true;
      continue;
    }
    const bar = T.bars[M.bar % T.bars.length];
    let t = M.nextT;
    if (T.swing && M.step % 2 === 1) t += T.swing * sd;
    if (M.on) blzMusStep(T, bar, M.step, t, sd);
    if (M.chant && M.step === 0) blzChantBar(t, sd);
    M.nextT += sd;
    M.step++;
    if (M.step >= 16) { M.step = 0; M.bar++; M.first = false; }
  }
}

function blzMusStep(T, bar, s, t, sd) {
  const M = blzMus;
  const D = BLZ_DRUMS[bar.d] || BLZ_DRUMS.rock;
  const at = (str) => (str && str[s] && str[s] !== '.' ? str[s] : '');
  if (s === 0 && (M.first || M.bar % 4 === 0) && bar.d !== 'brush') blzDrum('crash', t, 0.8);
  const k = at(D.k); if (k) blzDrum('kick', t, bar.d === 'metal' ? (s % 4 === 0 ? 0.9 : 0.55) : 1);
  const sn = at(D.s); if (sn) blzDrum(sn === 'g' ? 'ghost' : 'snare', t, sn === 'g' ? 0.35 : 1);
  const h = at(D.h); if (h) blzDrum(h === 'o' ? 'open' : h === 'r' ? 'ride' : 'hat', t, s % 4 === 0 ? 1 : 0.7);
  const tm = at(D.t); if (tm) blzDrum('tom', t, 0.9, 1 - s / 24);
  const ch = blzChord(bar.ch);
  // guitar
  const g = at(BLZ_GTR[bar.g]);
  if (g) {
    let len = 1;
    if (g === 'h') len = 16; else if (g === 'X') { const str = BLZ_GTR[bar.g]; while (s + len < 16 && str[s + len] === '.') len++; }
    blzPower(t, ch.root + 12, g === 'x' ? sd * 0.9 : sd * len * 0.96, g === 'x' ? 0.75 : 1, g === 'x');
  }
  // bass
  const bs = BLZ_BASS[bar.b] || '';
  const bt = blzBassTok(bs, s);
  if (bt && bt !== '~') {
    let len = 1; const toks = blzBassToks(bs);
    while (s + len < 16 && toks[s + len] === '~') len++;
    const off = { R: 0, O: 12, '5': 7, b3: 3, '3': 4, '4': 5, b7: 10 }[bt];
    if (off != null) blzBass(t, blzMidiHz(ch.root + off), sd * len * 0.92, bar.b === 'slap' ? 'slap' : bar.b === 'tuba' ? 'tuba' : 'pick');
  }
  // keys
  const kp = at(BLZ_KEYS[bar.k]);
  if (kp) {
    const notes = ch.iv.map((iv) => blzMidiHz(ch.root + 24 + iv));
    if (bar.k === 'clav') blzClav(t, notes, sd * 0.8);
    else if (bar.k === 'stabs') blzBrass(t, notes, sd * 1.6, 0.9);
    else if (bar.k === 'organ') blzOrgan(t, notes, sd * 15.5, 0.55);
  }
  // lead
  const lt = bar.l ? bar.l.split(/\s+/) : null;
  if (lt && lt[s] && lt[s] !== '.' && lt[s] !== '~') {
    let len = 1; while (s + len < 16 && lt[s + len] === '~') len++;
    const hz = blzHz(lt[s]);
    if (hz) {
      if (T.lead === 'brass') blzBrass(t, [hz], sd * len * 0.92, 1, true);
      else if (T.lead === 'organ') blzOrgan(t, [hz], sd * len * 0.95, 0.9);
      else blzLead(t, hz, sd * len * 0.95);
    }
  }
}
const blzTokCache = new Map();
function blzBassToks(str) {
  let v = blzTokCache.get(str);
  if (v) return v;
  v = [];
  for (let i = 0; i < str.length;) {
    if (str[i] === 'b' && (str[i + 1] === '3' || str[i + 1] === '7')) { v.push(str.slice(i, i + 2)); i += 2; } else { v.push(str[i]); i++; }
  }
  while (v.length < 16) v.push('.');
  blzTokCache.set(str, v);
  return v;
}
function blzBassTok(str, s) { const v = blzBassToks(str); return v[s] && v[s] !== '.' ? v[s] : ''; }

// ---- instruments -----------------------------------------------------------------------------------
function blzNode(last, until) {
  // disconnect a note's tail once it's spent (a held reference keeps nothing alive)
  setTimeout(() => { try { last.disconnect(); } catch (e) { } }, Math.max(50, (until - blitz.sfx.ctx.currentTime) * 1000 + 120));
}
function blzEnv(t, a, peak, d, to) {
  const ctx = blitz.sfx.ctx, g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0008, t + a + d);
  g.connect(to);
  blzNode(g, t + a + d);
  return g;
}
function blzNoiseSrc(t, dur, rate) {
  const ctx = blitz.sfx.ctx, n = ctx.createBufferSource();
  n.buffer = blitz.sfx.noise; n.playbackRate.value = rate || 1;
  n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.02);
  return n;
}
function blzDrum(kind, t, vel, pitch) {
  const ctx = blitz.sfx.ctx, out = blzMus.stem.drums, v = vel == null ? 1 : vel;
  if (kind === 'kick') {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    o.connect(blzEnv(t, 0.002, 0.95 * v, 0.24, out)); o.start(t); o.stop(t + 0.28);
    const c = blzNoiseSrc(t, 0.02), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    c.connect(f); f.connect(blzEnv(t, 0.001, 0.25 * v, 0.02, out));
  } else if (kind === 'snare' || kind === 'ghost') {
    const n = blzNoiseSrc(t, 0.2), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.6;
    n.connect(f); f.connect(blzEnv(t, 0.001, 0.55 * v, kind === 'ghost' ? 0.06 : 0.17, out));
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    o.connect(blzEnv(t, 0.001, 0.35 * v, 0.08, out)); o.start(t); o.stop(t + 0.1);
    if (kind === 'snare') { const s = ctx.createGain(); s.gain.value = 0.18; f.connect(s); s.connect(blzMus.revIn); blzNode(s, t + 0.3); }
  } else if (kind === 'hat' || kind === 'open' || kind === 'ride') {
    const n = blzNoiseSrc(t, 0.3), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = kind === 'ride' ? 5200 : 7600;
    n.connect(f); f.connect(blzEnv(t, 0.001, (kind === 'ride' ? 0.13 : 0.12) * v, kind === 'open' ? 0.2 : kind === 'ride' ? 0.22 : 0.045, out));
  } else if (kind === 'crash') {
    const n = blzNoiseSrc(t, 1.4), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 4200;
    n.connect(f); f.connect(blzEnv(t, 0.002, 0.22 * v, 1.3, out));
  } else if (kind === 'tom') {
    const o = ctx.createOscillator(); o.type = 'sine';
    const f0 = 150 * (pitch || 1) + 60;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.18);
    o.connect(blzEnv(t, 0.002, 0.6 * v, 0.22, out)); o.start(t); o.stop(t + 0.25);
  } else if (kind === 'clap') {
    for (let i = 0; i < 3; i++) {
      const n = blzNoiseSrc(t + i * 0.011, 0.05), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.2;
      n.connect(f); f.connect(blzEnv(t + i * 0.011, 0.001, 0.4 * v, i === 2 ? 0.12 : 0.02, out));
    }
  }
}
// a power chord: root, fifth, octave — two detuned saws each, into the drive
function blzPower(t, root, dur, vel, mute) {
  const ctx = blitz.sfx.ctx, M = blzMus;
  const env = ctx.createGain(), pre = ctx.createBiquadFilter();
  pre.type = 'lowpass'; pre.frequency.value = mute ? 1100 : 4200;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(0.16 * vel, t + 0.004);
  if (mute) env.gain.exponentialRampToValueAtTime(0.0008, t + Math.max(0.07, dur));
  else { env.gain.setTargetAtTime(0.1 * vel, t + 0.02, 0.15); env.gain.setTargetAtTime(0.0001, t + dur, 0.05); }
  pre.connect(env); env.connect(M.gtrIn);
  const end = t + (mute ? Math.max(0.07, dur) : dur + 0.2);
  for (const iv of [0, 7, 12]) for (const dt of [-7, 7]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.value = blzMidiHz(root + iv); o.detune.value = dt;
    o.connect(pre); o.start(t); o.stop(end + 0.02);
  }
  blzNode(env, end);
}
function blzBass(t, hz, dur, style) {
  const ctx = blitz.sfx.ctx, out = blzMus.stem.bass;
  const o = ctx.createOscillator(); o.type = style === 'tuba' ? 'triangle' : 'sawtooth'; o.frequency.value = hz;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = style === 'slap' ? 6 : 2;
  const f0 = style === 'slap' ? 3200 : style === 'tuba' ? 900 : 1600, f1 = style === 'slap' ? 520 : 420;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + (style === 'slap' ? 0.08 : 0.16));
  o.connect(f);
  const g = blzEnv(t, 0.003, style === 'tuba' ? 0.5 : 0.42, Math.max(0.1, dur), out);
  f.connect(g);
  o.start(t); o.stop(t + dur + 0.2);
  // a sub to hold the floor up on small speakers' behalf
  const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = hz / 2;
  s.connect(blzEnv(t, 0.004, 0.22, Math.max(0.1, dur), out)); s.start(t); s.stop(t + dur + 0.2);
}
function blzLead(t, hz, dur) {
  const ctx = blitz.sfx.ctx, M = blzMus;
  const o = ctx.createOscillator(), o2 = ctx.createOscillator();
  o.type = 'sawtooth'; o2.type = 'square';
  // slide in from the last note (the guitarist's legato)
  const from = M.lastLeadHz && Math.abs(Math.log2(M.lastLeadHz / hz)) < 0.6 ? M.lastLeadHz : hz;
  for (const x of [o, o2]) { x.frequency.setValueAtTime(from, t); x.frequency.exponentialRampToValueAtTime(hz, t + 0.035); }
  o2.detune.value = 6;
  M.lastLeadHz = hz;
  // vibrato on anything held
  if (dur > 0.25) {
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(hz * 0.012, t + 0.3);
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency); lfo.start(t); lfo.stop(t + dur + 0.1);
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.2, t + 0.01);
  env.gain.setTargetAtTime(0.15, t + 0.05, 0.2); env.gain.setTargetAtTime(0.0001, t + dur, 0.04);
  const mix = ctx.createGain(); mix.gain.value = 0.5;
  o.connect(env); o2.connect(mix); mix.connect(env); env.connect(M.leadIn);
  o.start(t); o2.start(t); o.stop(t + dur + 0.25); o2.stop(t + dur + 0.25);
  blzNode(env, t + dur + 0.25);
}
function blzBrass(t, notes, dur, vel, lead) {
  const ctx = blitz.sfx.ctx, M = blzMus, out = lead ? M.stem.lead : M.stem.keys;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.4;
  f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(2600, t + 0.04); f.frequency.setTargetAtTime(1500, t + 0.06, 0.12);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime((lead ? 0.2 : 0.13) * vel, t + 0.025);
  env.gain.setTargetAtTime((lead ? 0.15 : 0.08) * vel, t + 0.05, 0.12); env.gain.setTargetAtTime(0.0001, t + dur, 0.05);
  f.connect(env); env.connect(out);
  const send = ctx.createGain(); send.gain.value = 0.3; env.connect(send); send.connect(M.revIn);
  for (const hz of notes) for (const dt of [-9, 0, 9]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = dt;
    if (lead && dur > 0.3) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(hz * 0.008, t + 0.35);
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.2);
    }
    o.connect(f); o.start(t); o.stop(t + dur + 0.25);
  }
  blzNode(env, t + dur + 0.25); blzNode(send, t + dur + 0.6);
}
function blzClav(t, notes, dur) {
  const ctx = blitz.sfx.ctx, out = blzMus.stem.keys;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
  f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.12);
  f.connect(blzEnv(t, 0.002, 0.16, Math.max(0.09, dur), out));
  for (const hz of notes) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz; o.connect(f); o.start(t); o.stop(t + dur + 0.1); }
}
// the stadium organ: drawbar partials and a Leslie wobble
function blzOrgan(t, notes, dur, vel, out) {
  const ctx = blitz.sfx.ctx, M = blzMus;
  out = out || M.stem.keys;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.11 * (vel || 1), t + 0.012);
  env.gain.setValueAtTime(0.11 * (vel || 1), t + dur); env.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08);
  const trem = ctx.createGain(); trem.gain.value = 0.82;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 6.4; lg.gain.value = 0.18;
  lfo.connect(lg); lg.connect(trem.gain); lfo.start(t); lfo.stop(t + dur + 0.15);
  env.connect(trem); trem.connect(out);
  const send = ctx.createGain(); send.gain.value = 0.55; trem.connect(send); send.connect(M.revIn);
  for (const hz of notes) [[1, 1], [2, 0.6], [3, 0.36], [4, 0.24], [6, 0.12]].forEach(([h, a]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz * h;
    const g = ctx.createGain(); g.gain.value = a / notes.length;
    o.connect(g); g.connect(env); o.start(t); o.stop(t + dur + 0.12);
  });
  blzNode(trem, t + dur + 0.2); blzNode(send, t + dur + 0.6);
}

// ---- stingers ----------------------------------------------------------------------------------------
function blzSting(kind) {
  const S = blitz.sfx, ctx = S.ctx;
  if (!ctx || S.muted || !blzMusInit() || !blzMus.on) return;   // (music off = stingers off; the crowd stays)
  const M = blzMus, t = ctx.currentTime + 0.02;
  const out = M.bus;
  const seq = (notes, step, fn) => notes.forEach((n, i) => { if (n) fn(t + i * step, blzHz(n), i); });
  if (kind === 'td') {
    // a fanfare over a drum fill: da-da-da DAAAA
    blzMusDuck(0.25, 2.1);
    seq(['C5', 'E5', 'G5', 'C6'], 0.13, (tt, hz, i) => blzBrassTo(tt, [hz, hz * 1.5], i === 3 ? 1.2 : 0.11, out));
    seq(['', '', '', 'E6'], 0.13, (tt, hz) => blzBrassTo(tt, [hz], 1.2, out));
    for (let i = 0; i < 4; i++) blzDrumTo('tom', t + i * 0.13, out, 1 - i * 0.12);
    blzDrumTo('crash', t + 0.39, out);
  } else if (kind === 'charge') {
    // the stadium call (an old bugle call, the crowd shouts the last note)
    blzMusDuck(0.3, 1.6);
    seq(['G4', 'C5', 'E5', 'G5', '', 'E5', 'G5'], 0.14, (tt, hz, i) => blzOrgan(tt, [hz], i === 6 ? 0.55 : 0.11, 1.4, out));
    blzVox(t + 0.98, 0.7, [720, 760], [1150, 1250], 1.1, 190);
  } else if (kind === 'first') {
    seq(['C5', 'E5', 'G5', 'C6'], 0.075, (tt, hz, i) => blzOrgan(tt, [hz], i === 3 ? 0.3 : 0.06, 1.1, out));
  } else if (kind === 'sack') {
    blzMusDuck(0.4, 0.9);
    blzMusDive(t, out);
    blzDrumTo('crash', t + 0.02, out);
  } else if (kind === 'trombone') {
    // wah wah wah waaah — when THEY blow it
    blzMusDuck(0.35, 1.8);
    ['G3', 'F#3', 'F3', 'E3'].forEach((n, i) => blzTrombone(t + i * 0.36, blzHz(n), i === 3 ? 0.9 : 0.3, out));
  } else if (kind === 'fire') {
    blzMusDuck(0.45, 1.2);
    blzLeadTo(t, blzHz('E5'), 0.25, blzHz('G5'), out);
    blzLeadTo(t + 0.3, blzHz('A5'), 0.8, blzHz('B5'), out);
  } else if (kind === 'heat') {
    seq(['E5', 'G5', 'E5', 'G5', 'E5', 'G5'], 0.055, (tt, hz) => blzOrgan(tt, [hz], 0.045, 1, out));
  } else if (kind === 'roll') {
    // the kickoff: a snare roll that builds into the boot
    for (let i = 0; i < 16; i++) blzDrumTo('snare', t + i * 0.06, out, 0.25 + i / 16 * 0.75);
    blzDrumTo('crash', t + 0.98, out);
  } else if (kind === 'int') {
    blzMusDuck(0.35, 1.0);
    seq(['E4', 'C4'], 0.22, (tt, hz, i) => blzOrgan(tt, [hz, hz * 1.19], i ? 0.5 : 0.18, 1.2, out));
  } else if (kind === 'big') {
    blzDrumTo('crash', t, out, 0.9);
    blzOrgan(t, [blzHz('D4'), blzHz('F4'), blzHz('Ab4')], 0.55, 1, out);    // dun-dunnn
  }
}
// the same instruments, routed past the stems (so a stinger sounds during a quiet mix)
function blzBrassTo(t, notes, dur, out) { const M = blzMus, keep = M.stem.keys; M.stem.keys = out; blzBrass(t, notes, dur, 1.4); M.stem.keys = keep; }
function blzDrumTo(kind, t, out, v) { const M = blzMus, keep = M.stem.drums; M.stem.drums = out; blzDrum(kind, t, v == null ? 1 : v); M.stem.drums = keep; }
function blzLeadTo(t, hz, dur, bendTo, out) {
  const ctx = blitz.sfx.ctx, M = blzMus;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(hz, t);
  if (bendTo) o.frequency.linearRampToValueAtTime(bendTo, t + Math.min(0.18, dur * 0.4));
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime((bendTo || hz) * 0.015, t + dur * 0.6);
  lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.1);
  const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.26, t + 0.01); env.gain.setTargetAtTime(0.0001, t + dur, 0.06);
  o.connect(env); env.connect(M.stingLeadIn);
  o.start(t); o.stop(t + dur + 0.3); blzNode(env, t + dur + 0.3);
}
function blzMusDive(t, out) {
  // the guitarist slides down the neck
  const ctx = blitz.sfx.ctx, M = blzMus;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.7);
  const env = ctx.createGain(); env.gain.setValueAtTime(0.22, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  o.connect(env); env.connect(M.stingGtrIn); o.start(t); o.stop(t + 0.85); blzNode(env, t + 0.85);
}
function blzTrombone(t, hz, dur, out) {
  const ctx = blitz.sfx.ctx;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(hz * 1.02, t); o.frequency.linearRampToValueAtTime(hz, t + 0.06);
  if (dur > 0.5) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5; lg.gain.value = hz * 0.03; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.1); }
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
  f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1300, t + 0.08); f.frequency.linearRampToValueAtTime(600, t + dur);
  const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.3, t + 0.04); env.gain.setTargetAtTime(0.0001, t + dur, 0.06);
  o.connect(f); f.connect(env); env.connect(out); o.start(t); o.stop(t + dur + 0.3); blzNode(env, t + dur + 0.3);
}

// ---- the crowd ---------------------------------------------------------------------------------------
// A crowd shout: a dozen throats (detuned saws around `pitch`) plus breath,
// through two vowel formants that can glide (f1/f2 are [start, end]).
function blzVox(t, dur, f1, f2, gain, pitch) {
  const S = blitz.sfx, ctx = S.ctx, M = blzMus;
  if (!ctx || S.muted || !blzMusInit()) return;
  const sum = ctx.createGain(); sum.gain.value = 1;
  for (let i = 0; i < 10; i++) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const p = pitch * (0.78 + Math.random() * 0.55);
    o.frequency.setValueAtTime(p, t); o.frequency.linearRampToValueAtTime(p * (0.92 + Math.random() * 0.12), t + dur);
    const g = ctx.createGain(); g.gain.value = 0.06;
    o.connect(g); g.connect(sum); o.start(t + Math.random() * 0.05); o.stop(t + dur + 0.2);
  }
  const n = blzNoiseSrc(t, dur + 0.1), ng = ctx.createGain(); ng.gain.value = 0.5; n.connect(ng); ng.connect(sum);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(gain * 0.5, t + 0.06);
  env.gain.setTargetAtTime(gain * 0.38, t + 0.1, dur * 0.4); env.gain.setTargetAtTime(0.0001, t + dur, 0.09);
  for (const [fa, fb, q, a] of [[f1[0], f1[1], 5, 1], [f2[0], f2[1], 7, 0.55]]) {
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(fa, t); f.frequency.linearRampToValueAtTime(fb, t + dur);
    const g = ctx.createGain(); g.gain.value = a * 2.2;
    sum.connect(f); f.connect(g); g.connect(env);
  }
  env.connect(M.crowdIn);
  blzNode(env, t + dur + 0.4);
}
function blzCrowdSay(kind) {
  const ctx = blitz.sfx.ctx;
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  if (kind === 'oooh') blzVox(t, 1.0, [340, 300], [820, 700], 1.0, 200);
  else if (kind === 'aww') blzVox(t, 1.0, [720, 620], [1150, 1000], 0.9, 210);
  else if (kind === 'boo') blzVox(t, 1.5, [330, 320], [720, 680], 1.0, 120);
  else if (kind === 'yeah') { blzVox(t, 0.9, [560, 760], [1900, 1250], 1.1, 230); }
  else if (kind === 'clap') { for (let i = 0; i < 3; i++) blzCrowdClap(t + i * 0.24); }
}
function blzCrowdClap(t) {
  const ctx = blitz.sfx.ctx, M = blzMus;
  // a stand full of hands: a smear of claps around the beat
  for (let i = 0; i < 6; i++) {
    const tt = t + (Math.random() - 0.5) * 0.03;
    const n = blzNoiseSrc(tt, 0.06), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 900; f.Q.value = 1.1;
    n.connect(f); f.connect(blzEnv(tt, 0.001, 0.12, 0.05, M.crowdIn));
  }
}
// DE-FENSE (clap clap), locked to the band's bar
function blzChant(on) { blzMus.chant = on ? (blzMus.chant || { n: 0 }) : null; }
function blzChantBar(t, sd) {
  const C = blzMus.chant;
  C.n++;
  if (C.n % 2 === 1) return;      // every other bar, so it breathes
  const beat = sd * 4;
  blzVox(t, beat * 0.8, [290, 300], [2250, 2300], 0.95, 215);              // DEE
  blzVox(t + beat, beat * 0.9, [560, 520], [1820, 1750], 0.95, 200);       // FENSE
  const ctx = blitz.sfx.ctx, M = blzMus;
  const s = blzNoiseSrc(t + beat * 1.75, 0.14), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 4800;
  s.connect(f); f.connect(blzEnv(t + beat * 1.75, 0.01, 0.12, 0.12, M.crowdIn));
  blzCrowdClap(t + beat * 2); blzCrowdClap(t + beat * 3);
}

// ---- 🎙️ THE BOOTH, VOICED -----------------------------------------------------------------------
// "the voices are far too robotic … make them more human like" — Chris. The
// browser's speech engine IS the robot (and pitching it made it worse), so no
// line is synthesized in the browser any more: every one of them was rendered
// offline by Kokoro (an open neural TTS model) and ships as a small MP3 in
// audio/blitz/vo/ (manifest: js/blitzVO.js, key = voice scope | normalized
// text). The booth — play-by-play + colour — is ONE channel that never talks
// over itself; the field — the QB's cadence, the trash talk — is a second,
// quieter channel that ducks under the booth. Both run through a PA chain
// (presence EQ, compression, the stadium's slapback and reverb), and the band
// ducks under the booth. A line with no clip is simply not said.
const blzVoice = {
  bytes: new Map(), bufs: new Map(), lru: [], loading: new Map(),
  ch: { booth: null, field: null }, q: { booth: [], field: [] }, bus: null, fieldBus: null, miss: new Set(),
};
const BLZ_VO_BASE = 'audio/blitz/vo/';
function blzVoNorm(t) { return String(t).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function blzVoKey(text, o) {
  const who = o.who || 'pbp';
  if (who === 'pbp' || who === 'color') return who + '|' + blzVoNorm(text);
  const tk = o.team == null ? '' : (blitz.teams[o.team] || '');
  return who + ':' + tk + '|' + blzVoNorm(text);
}
function blzVoBuses() {
  const S = blitz.sfx, ctx = S.ctx;
  if (blzVoice.bus || !ctx) return !!blzVoice.bus;
  blzMusInit();
  // the booth: a broadcast voice in a stadium — cleaned up, pushed forward, a little slapback
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 95;
  const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3200; pres.Q.value = 0.9; pres.gain.value = 3.5;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -22; comp.ratio.value = 3.2; comp.attack.value = 0.003; comp.release.value = 0.12;
  const out = ctx.createGain(); out.gain.value = 1.4;
  hp.connect(pres); pres.connect(comp); comp.connect(out); out.connect(S.master);
  const slap = ctx.createDelay(0.5); slap.delayTime.value = 0.115;
  const slapG = ctx.createGain(); slapG.gain.value = 0.13;
  const slapLp = ctx.createBiquadFilter(); slapLp.type = 'lowpass'; slapLp.frequency.value = 2600;
  comp.connect(slap); slap.connect(slapLp); slapLp.connect(slapG); slapG.connect(S.master);
  const rev = ctx.createGain(); rev.gain.value = 0.16; comp.connect(rev); if (blzMus.revIn) rev.connect(blzMus.revIn);
  blzVoice.bus = hp;
  // the field: players shouting at the line — further away, more stadium, never on top of the booth
  const fhp = ctx.createBiquadFilter(); fhp.type = 'highpass'; fhp.frequency.value = 140;
  const flp = ctx.createBiquadFilter(); flp.type = 'lowpass'; flp.frequency.value = 7000;
  const fcomp = ctx.createDynamicsCompressor(); fcomp.threshold.value = -20; fcomp.ratio.value = 2.5;
  const fg = ctx.createGain(); fg.gain.value = 0.5;
  fhp.connect(flp); flp.connect(fcomp); fcomp.connect(fg); fg.connect(S.master);
  const frev = ctx.createGain(); frev.gain.value = 0.34; fcomp.connect(frev); if (blzMus.revIn) frev.connect(blzMus.revIn);
  blzVoice.fieldIn = fhp; blzVoice.fieldBus = fg;
  return true;
}
function blzVoFetch(file) {
  const V = blzVoice;
  if (V.bytes.has(file)) return Promise.resolve(V.bytes.get(file));
  if (V.loading.has(file)) return V.loading.get(file);
  const pr = fetch(BLZ_VO_BASE + file).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => { V.loading.delete(file); if (ab) V.bytes.set(file, ab); return ab; })
    .catch(() => { V.loading.delete(file); return null; });
  V.loading.set(file, pr);
  return pr;
}
function blzVoBuffer(file) {
  const V = blzVoice, ctx = blitz.sfx.ctx;
  if (V.bufs.has(file)) { V.lru.splice(V.lru.indexOf(file), 1); V.lru.push(file); return Promise.resolve(V.bufs.get(file)); }
  return blzVoFetch(file).then((ab) => {
    if (!ab || !ctx) return null;
    // (decodeAudioData detaches its input: decode a copy, keep the MP3)
    return new Promise((res) => ctx.decodeAudioData(ab.slice(0), res, () => res(null)));
  }).then((buf) => {
    if (!buf) return null;
    V.bufs.set(file, buf); V.lru.push(file);
    while (V.lru.length > 64) V.bufs.delete(V.lru.shift());   // a phone keeps ~16MB of voice, not the whole booth
    return buf;
  });
}
// warm the cache: the lines every game needs, and both teams' voices
function blzVoPrefetch(teams) {
  if (typeof BLZ_VO === 'undefined') return;
  const want = [];
  for (const k in BLZ_VO) {
    const scope = k.slice(0, k.indexOf('|'));
    if (scope === 'pbp' || scope === 'color' || teams.some((t) => scope.endsWith(':' + t))) want.push(BLZ_VO[k][0]);
  }
  let i = 0;
  const next = () => { if (i < want.length) blzVoFetch(want[i++]).then(next); };
  for (let n = 0; n < 4; n++) next();
}
// text, { who: 'pbp' | 'color' | 'qb' | 'player', team (index, for the field voices), prio (0 chatter … 3 the play of the game), maxAge (secs it's still news) }
function blzSpeak(text, o) {
  o = o || {};
  blitz.say = text;
  if (!blitz.voice || blitz.sfx.muted || blitz.auto || !blitz.sfx.ctx || typeof BLZ_VO === 'undefined') return;
  const key = blzVoKey(text, o), ent = BLZ_VO[key];
  if (!ent) { blzVoice.miss.add(key); return; }
  if (!blzVoBuses()) return;
  const chan = o.who === 'qb' || o.who === 'player' ? 'field' : 'booth';
  const item = { key, file: ent[0], dur: ent[1], prio: o.prio || 0, born: performance.now(), maxAge: (o.maxAge || 2.2) * 1000, chan };
  const cur = blzVoice.ch[chan];
  if (!cur) { blzVoStart(item); return; }
  if (item.prio > cur.prio + 1 || (item.prio >= 3 && cur.prio < 3)) { blzVoStop(chan); blzVoice.q[chan].length = 0; blzVoStart(item); return; }
  const Q = blzVoice.q[chan];
  Q.push(item);
  Q.sort((a, b) => b.prio - a.prio || b.born - a.born);
  if (Q.length > 2) Q.length = 2;
}
function blzVoStart(item) {
  const V = blzVoice, chan = item.chan;
  V.ch[chan] = item;
  item.pending = true;
  blzVoBuffer(item.file).then((buf) => {
    if (V.ch[chan] !== item) return;              // it was cut off while it loaded
    const ctx = blitz.sfx.ctx;
    if (!buf || !ctx || performance.now() - item.born > item.maxAge + 400) { V.ch[chan] = null; blzVoNext(chan); return; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    // a touch of variety so a repeated line isn't a carbon copy
    src.playbackRate.value = chan === 'booth' ? 1 : 0.97 + Math.random() * 0.06;
    src.connect(chan === 'booth' ? V.bus : V.fieldIn);
    item.src = src; item.pending = false;
    item.until = performance.now() + buf.duration * 1000 / src.playbackRate.value + 150;
    src.onended = () => { if (V.ch[chan] === item) { V.ch[chan] = null; if (chan === 'booth') blzVoFieldLevel(1); blzVoNext(chan); } };
    src.start();
    if (chan === 'booth') { blzMusDuck(0.55, buf.duration); blzVoFieldLevel(0.35); }
  });
}
function blzVoFieldLevel(k) {
  const V = blzVoice, ctx = blitz.sfx.ctx;
  if (V.fieldBus && ctx) V.fieldBus.gain.setTargetAtTime(0.5 * k, ctx.currentTime, 0.06);
}
function blzVoStop(chan) {
  const it = blzVoice.ch[chan];
  blzVoice.ch[chan] = null;
  if (it && it.src) { try { it.src.onended = null; it.src.stop(); } catch (e) { } }
}
function blzVoNext(chan) {
  const Q = blzVoice.q[chan], now = performance.now();
  while (Q.length) {
    const it = Q.shift();
    if (now - it.born < it.maxAge) { blzVoStart(it); return; }
  }
}
function blzBoothTick() {
  // the safety valve: an onended that never came can't wedge a channel
  const now = performance.now();
  for (const chan of ['booth', 'field']) {
    const it = blzVoice.ch[chan];
    if (it && !it.pending && it.until && now > it.until + 800) { blzVoice.ch[chan] = null; if (chan === 'booth') blzVoFieldLevel(1); blzVoNext(chan); }
    if (it && it.pending && now - it.born > 6000) { blzVoice.ch[chan] = null; blzVoNext(chan); }
  }
}
function blzBoothHush() {
  for (const chan of ['booth', 'field']) { blzVoice.q[chan].length = 0; blzVoStop(chan); }
  blzVoFieldLevel(1);
}
