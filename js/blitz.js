// ---- 💥 NUGGET BLITZ ------------------------------------------------------------------
// "ok we need to make a fun version of NFL Blitz. Try to get as close as
// possible to the original NFL Blitz for N64." — Chris, 2026-10-01
//
// Game 19 (mode key: blitz). Nugmo Bowl is Tecmo: sideways, pixel, four plays.
// This is the OTHER cartridge, the one that rattled the N64 in 1998:
//
//   • SEVEN ON SEVEN, a 3D field seen from BEHIND THE OFFENSE, the camera
//     riding the ball downfield (a real perspective projection on a 2D canvas,
//     drawn low-res and smoothed up the way the N64 smeared everything)
//   • 30 YARDS FOR A FIRST DOWN. Four downs. No refs, no flags, no mercy.
//   • the 3×3 PLAY SELECT, offense and defense, with FLIP. DA BOMB, SLANTS,
//     HAIL MARY, SUICIDE BLITZ, SAFE COVER, the whole card.
//   • TURBO on its own button and its own meter. Turbo + pass = a bullet.
//   • pass to whoever the stick POINTS at; past the line, pass = LATERAL
//   • JUMP to hurdle or high-point, TURBO+JUMP spins, TURBO+PASS stiff-arms,
//     on defense TURBO+JUMP is the dive and contact at turbo is a MONSTER HIT
//   • LATE HITS. The whistle is a suggestion. Shove anyone after the play.
//   • HE'S ON FIRE: three straight catches by one receiver (or three straight
//     stops on defense) and the whole team burns — infinite turbo, flaming
//     ball — until the other side scores.
//   • fumbles stay LIVE, interceptions get returned, laterals can go loose
//   • kickoffs, punts, field goals, the PAT-or-go-for-two choice
//   • the VS SCREEN CODES: tap TURBO / JUMP / PASS to set three digits, then a
//     direction. 2-0-0 → is BIG HEAD. (The full list is in AGENTS.md.)
//   • the CPU rubber-bands, as it did. NO CPU ASSIST (0-1-2 ↓) turns it off.
//
// Lore: none required. It's a weird nugget football game in a weird nugget
// town, and the stands are full. Scoring mirrors the other games: football
// events are perFlyer-scaled into storm.caught (× the tier's mult);
// stopStorm() banks it.

const blitzWorld = document.getElementById('blitzWorld');

const BLZ_WID = 53.3, BLZ_MID = BLZ_WID / 2, BLZ_LEN = 120; // yards; end zones 0..10 and 110..120
const BLZ_FIRST = 30;                // the Blitz first down
const BLZ_QLEN = 75;                 // seconds of LIVE play per quarter (the clock stops between plays)
const BLZ_CAM = { h: 13, back: 17, pitch: 0.5 };
const BLZ_RES = 384;                 // internal canvas height: low-res, smoothed up (the N64 smear)
const BLZ_OFF_POS = ['QB', 'C', 'LG', 'RG', 'WR1', 'WR2', 'RB'];
const BLZ_DEF_POS = ['DE1', 'DT', 'DE2', 'LB', 'CB1', 'CB2', 'S'];
const BLZ_ELIG = { WR1: 1, WR2: 1, RB: 1 };

// ---- teams ------------------------------------------------------------------------------
const BLZ_TEAMS = {
  crunch: { city: 'NUGGETOWN', name: 'CRUNCH', abbr: 'NUG',
    c1: '#d6352a', c2: '#ffd23a', helm: '#d6352a', stripe: '#ffd23a', mask: '#e8e8ee', pants: '#ffd23a', num: '#ffffff', ez: '#9a2018' },
  demons: { city: 'DRIVE-THRU', name: 'DEMONS', abbr: 'DTD',
    c1: '#2b34a8', c2: '#ff4a3a', helm: '#1d2276', stripe: '#ff4a3a', mask: '#c8ccd8', pants: '#c8ccd8', num: '#ffffff', ez: '#1a2070' },
  havoc: { city: 'HOT SAUCE', name: 'HAVOC', abbr: 'HSH',
    c1: '#ff6a00', c2: '#1a1a1a', helm: '#1c1c1c', stripe: '#ff6a00', mask: '#ff6a00', pants: '#1c1c1c', num: '#1a1a1a', ez: '#a83c00' },
  furies: { city: 'DEEP FRYER', name: 'FURIES', abbr: 'DFF',
    c1: '#40125a', c2: '#39ff7a', helm: '#2a0a38', stripe: '#39ff7a', mask: '#39ff7a', pants: '#141414', num: '#39ff7a', ez: '#2c0c3e' },
};
// [speed yd/s, strength, hands]
const BLZ_BASE = {
  QB: [7.0, 0.7, 0.5], C: [6.3, 1.15, 0.2], LG: [6.3, 1.15, 0.2], RG: [6.3, 1.15, 0.2],
  WR1: [8.8, 0.65, 0.85], WR2: [8.7, 0.65, 0.85], RB: [8.5, 1.0, 0.75],
  DE1: [7.6, 1.05, 0.4], DT: [6.8, 1.25, 0.3], DE2: [7.6, 1.05, 0.4],
  LB: [8.0, 1.0, 0.55], CB1: [8.7, 0.75, 0.6], CB2: [8.6, 0.75, 0.6], S: [8.4, 0.9, 0.6],
};
// pos → [name, number, speed?, strength?, hands?]
const BLZ_ROSTER = {
  crunch: {
    QB: ['BRETT FRYVRE', 4, 7.3], RB: ['BARRY SAUCEDERS', 20, 9.1, 1.15, 0.8],
    WR1: ['RANDY MOSS-TARD', 84, 9.3, null, 0.93], WR2: ['TIM BROWN-GRAVY', 81, 9.0, null, 0.88],
    C: ['BISCUIT', 60], LG: ['DRUMSTICK', 62], RG: ['WISHBONE', 63],
    DE1: ['REGGIE WHITE-MEAT', 92, null, 1.25], DT: ['THE WALK-IN', 99, null, 1.35], DE2: ['BRUCE SMITHFRY', 78, 8.0, 1.15],
    LB: ['THE SHREDDER', 55, 8.4, 1.15], CB1: ['PRIME TIME POPCORN', 21, 9.2, null, 0.72], CB2: ['NIGHT TRAIN', 24, 8.9],
    S: ['THE HIT MAN', 36, 8.7, 1.1, 0.65],
  },
  demons: {
    QB: ['HOLD THE PICKLE', 9], RB: ['SPECIAL SAUCE', 32], WR1: ['SUPERSIZE', 80], WR2: ['NUMBER SIX', 86],
    C: ['THE SPEAKER', 61], LG: ['WINDOW ONE', 64], RG: ['WINDOW TWO', 65],
    DE1: ['UPSELL', 91], DT: ['THE FRYER BASKET', 97], DE2: ['RECEIPT', 94],
    LB: ['NIGHT MANAGER', 52], CB1: ['NAPKINS', 23], CB2: ['STRAWS', 27], S: ['THE KETCHUP PUMP', 31],
  },
  havoc: {
    QB: ['SCOVILLE', 7, 7.4], RB: ['GHOST PEPPER', 28, 9.0, 1.15, 0.8], WR1: ['HABANERO', 82, 9.3, null, 0.91], WR2: ['CAYENNE', 88, 9.0, null, 0.88],
    C: ['VINEGAR', 66], LG: ['GARLIC', 67], RG: ['THE BOTTLE', 68],
    DE1: ['RED HOT', 95, 7.9, 1.2], DT: ['THE VAT', 98, null, 1.38], DE2: ['WILD WING', 93, 7.9, 1.15],
    LB: ['MELTDOWN', 54, 8.4, 1.15], CB1: ['SRIRACHA', 25, 9.1, null, 0.7], CB2: ['TABASCO', 29, 8.9], S: ['THE SWEATS', 37, 8.7, 1.08, 0.65],
  },
  furies: {
    QB: ['THE OIL CHANGE', 1, 7.6, 0.8], RB: ['DEEP FRY', 22, 9.3, 1.25, 0.82], WR1: ['SPATTER', 83, 9.5, null, 0.92], WR2: ['SIZZLE', 87, 9.2, null, 0.9],
    C: ['THE HOOD VENT', 70], LG: ['SMOKE', 71], RG: ['GREASE TRAP', 72],
    DE1: ['FLASH POINT', 90, 8.1, 1.25], DT: ['THE BASKET DROP', 96, null, 1.45], DE2: ['THIRD DEGREE', 91, 8.0, 1.2],
    LB: ['THE BURN WARD', 50, 8.5, 1.2], CB1: ['HOT OIL', 20, 9.4, null, 0.75], CB2: ['SPLASH', 26, 9.1], S: ['FIRE DRILL', 33, 8.9, 1.1, 0.7],
  },
};

// ---- the playbooks ---------------------------------------------------------------------
// Routes are waypoints RELATIVE to a player's spot at the snap, in the
// OFFENSE's frame: [dx, dz] where +dx is the offense's RIGHT and +dz is
// downfield. After the last waypoint a receiver keeps running the way he was
// going. FLIP mirrors dx. The cards draw their diagrams from this same data.
const BLZ_FORM = { QB: [0, -4.5], C: [0, -0.9], LG: [-1.8, -1.1], RG: [1.8, -1.1], WR1: [-15, -0.6], WR2: [15, -0.6], RB: [2.2, -5] };
const BLZ_OFF_PLAYS = [
  { key: 'slants', name: 'SLANTS', kind: 'pass', primary: 'WR2',
    routes: { WR1: [[0, 3], [9, 10]], WR2: [[0, 3], [-9, 10]], RB: [[-4, 1.5], [-10, 4]] } },
  { key: 'bomb', name: 'DA BOMB', kind: 'pass', primary: 'WR1',
    routes: { WR1: [[0, 6], [3, 42]], WR2: [[0, 12], [-3, 42]] } },
  { key: 'outs', name: 'QUICK OUTS', kind: 'pass', primary: 'WR2',
    routes: { WR1: [[0, 6], [-7, 6.5]], WR2: [[0, 6], [7, 6.5]], RB: [[0, 1], [0, 13]] } },
  { key: 'spider', name: 'SPIDER LEGS', kind: 'pass', primary: 'WR1',
    routes: { WR1: [[0, 14], [1.5, 11]], WR2: [[0, 14], [-1.5, 11]], RB: [[5, 0], [11, 3]] } },
  { key: 'pick', name: 'MIDDLE PICK', kind: 'pass', primary: 'WR1',
    routes: { WR1: [[0, 5], [28, 9]], WR2: [[0, 9], [-28, 13]], RB: [[0, 1], [0, 18]] } },
  { key: 'hail', name: 'HAIL MARY', kind: 'pass', primary: 'RB', form: { RB: [7, -1] },
    routes: { WR1: [[0, 50]], WR2: [[0, 50]], RB: [[0, 2], [-2, 48]] } },
  { key: 'blast', name: 'HB BLAST', kind: 'run',
    rb: [[0.5, 3], [0.5, 25]], routes: { WR1: [[0, 8]], WR2: [[0, 8]] } },
  { key: 'sweep', name: 'POWER SWEEP', kind: 'run',
    rb: [[6, -1], [12, 3], [14, 25]], routes: { WR1: [[0, 5], [3, 9]], WR2: [[0, 6]] } },
  { key: 'hook', name: 'HOOK N LADDER', kind: 'pass', primary: 'WR1',
    routes: { WR1: [[0, 11], [0.5, 9]], WR2: [[0, 30]], RB: [[-7, 0], [-10, 9]] } },
];
// defense roles in BLZ_DEF_POS order: 'rush' | 'man:WR1' | ['zone', dx, dz] | ['deep', dx, dz] | 'spy'
const BLZ_DEF_PLAYS = [
  { key: 'safe', name: 'SAFE COVER', roles: ['rush', 'rush', 'rush', ['zone', 0, 9], 'man:WR1', 'man:WR2', ['deep', 0, 22]] },
  { key: 'b1', name: '1 MAN BLITZ', roles: ['rush', 'rush', 'rush', 'rush', 'man:WR1', 'man:WR2', 'man:RB'] },
  { key: 'b2', name: '2 MAN BLITZ', roles: ['rush', 'rush', 'rush', 'rush', 'man:WR1', 'man:WR2', 'rush'] },
  { key: 'suicide', name: 'SUICIDE BLITZ', roles: ['rush', 'rush', 'rush', 'rush', 'rush', 'man:WR2', 'rush'] },
  { key: 'zblitz', name: 'ZONE BLITZ', roles: [['zone', -9, 6], 'rush', 'rush', 'rush', ['zone', -14, 12], ['zone', 14, 12], ['deep', 0, 20]] },
  { key: 'near', name: 'NEAR ZONE', roles: ['rush', 'rush', 'rush', ['zone', 0, 5], ['zone', -12, 6], ['zone', 12, 6], ['zone', 0, 11]] },
  { key: 'med', name: 'MEDIUM ZONE', roles: ['rush', 'rush', 'rush', ['zone', 0, 10], ['zone', -13, 13], ['zone', 13, 13], ['deep', 0, 20]] },
  { key: 'deep', name: 'DEEP ZONE', roles: ['rush', 'rush', 'rush', ['zone', 0, 14], ['deep', -14, 24], ['deep', 14, 24], ['deep', 0, 30]] },
  { key: 'goal', name: 'GOAL LINE', roles: ['rush', 'rush', 'rush', 'spy', 'man:WR1', 'man:WR2', ['zone', 0, 3]] },
];

// the ladder (ArcadeKit.tierSelect)
const BLZ_TIERS = [
  { key: 'rookie', emoji: '🍟', name: 'ROOKIE', mult: 1, opp: 'demons', spd: 0.97, str: 0.95, smart: 0.6, hands: 0.95,
    blurb: 'vs the DRIVE-THRU DEMONS. they forgot your sauce.' },
  { key: 'pro', emoji: '🌶️', name: 'PRO', mult: 2, opp: 'havoc', spd: 1.0, str: 1.0, smart: 0.85, hands: 1.0,
    blurb: 'vs the HOT SAUCE HAVOC. it burns twice.' },
  { key: 'allpro', emoji: '🔥', name: 'ALL-BLITZ', mult: 3, opp: 'furies', spd: 1.015, str: 1.04, smart: 1, hands: 1.05,
    blurb: 'vs the DEEP FRYER FURIES. 375 degrees. no refs.', lockNote: 'win a PRO game' },
];

// the VS-screen codes: [turbo, jump, pass] taps, then a direction
const BLZ_CODES = [
  { k: '200R', id: 'big', name: 'BIG HEAD' },
  { k: '040U', id: 'huge', name: 'HUGE HEAD' },
  { k: '514U', id: 'inf', name: 'INFINITE TURBO' },
  { k: '151U', id: 'nopunt', name: 'NO PUNTING' },
  { k: '222R', id: 'night', name: 'NIGHT GAME' },
  { k: '404L', id: 'speed', name: 'POWER-UP SPEED' },
  { k: '250L', id: 'fastpass', name: 'FAST PASSES' },
  { k: '001D', id: 'fgpct', name: 'SHOW FIELD GOAL %' },
  { k: '050R', id: 'bigball', name: 'BIG FOOTBALL' },
  { k: '012D', id: 'noassist', name: 'NO CPU ASSISTANCE' },
  { k: '333L', id: 'fire', name: 'START ON FIRE' },
];

const blitz = {
  on: false, cv: null, g: null, W: 640, H: BLZ_RES, F: 420, cy: 180, ui: 1,
  phase: 'idle', cfg: BLZ_TIERS[0], tierPick: null, t: 0, paused: false, freeze: false, auto: false,
  teams: ['crunch', 'demons'], score: [0, 0], q: 1, clock: BLZ_QLEN, ot: false, openKicker: 0,
  poss: 0, los: 30, ballX: BLZ_MID, firstAt: 60, down: 1, pat2: false,
  players: [], carrier: null, ctl: null, target: null, ball: null, returner: null,
  play: null, dplay: null, flip: false, kind: 'call', pocket: false, thrown: false, playT: 0,
  snapAt: 0, startZ: 0, ezCatch: false, handed: false, kickT: 0, fg: null, punt: null,
  callFor: 'off', callSel: 4, callT: 0, cpuOff: null, cpuDef: null, cpuFlip: false,
  deadT: 0, dead: null, waitT: 0, waitFn: null, banner: null, feed: [], say: '',
  cam: { x: BLZ_MID, z: 14, dir: 1, s: Math.sin(BLZ_CAM.pitch), c: Math.cos(BLZ_CAM.pitch) },
  camFlipT: 0, camFlipDone: false, shakeT: 0, shakeMag: 0, hitStop: 0, flashT: 0,
  turbo: [1, 1], fire: [{ on: false, n: 0, last: null, stops: 0 }, { on: false, n: 0, last: null, stops: 0 }],
  codes: {}, codeIn: [0, 0, 0], codeMsg: null, vsT: 0,
  stats: null, earned: 0, result: null, finalT: 0,
  parts: [], keys: {}, voice: true,
  touch: { on: false, L: null, A: false, B: false, T: false, roles: {} }, pad: { on: false },
  sfx: { ctx: null, master: null, crowd: null, crowdGain: null, muted: false, noise: null },
  hit: { cards: [], extra: [] }, crowdCv: null,
};

function blitzActive() { return storm.mode === 'blitz' && storm.running; }
function blitzProWon() {
  try { return localStorage.getItem('nugBlitzPro') === '1' || blitzChampWon(); } catch (e) { return false; }
}
function blitzChampWon() {
  try { return localStorage.getItem('nugBlitzChamp') === '1'; } catch (e) { return false; }
}
function blitzTally() {
  if (blitz.phase === 'tier' || !blitz.stats) return '💥 pick your opponent…';
  const A = BLZ_TEAMS[blitz.teams[0]], B = BLZ_TEAMS[blitz.teams[1]];
  return '💥 ' + A.abbr + ' ' + blitz.score[0] + ' – ' + blitz.score[1] + ' ' + B.abbr +
    ' · ' + (blitz.ot ? 'OT' : 'Q' + blitz.q) + ' · ' + fmt.format(blitz.earned);
}

// ---- helpers --------------------------------------------------------------------------------
function blzDir(team) { return team === 0 ? 1 : -1; }      // team 0 (you) attacks +z
function blzGoal(team) { return team === 0 ? 110 : 10; }    // the goal line a team attacks
function blzOwnGoal(team) { return team === 0 ? 10 : 110; }
function blzClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function blzRnd(a, b) { return a + Math.random() * (b - a); }
function blzPick(a) { return a[(Math.random() * a.length) | 0]; }
function blzTeam(i) { return BLZ_TEAMS[blitz.teams[i]]; }
function blzHuman(team) { return team === 0 && !blitz.auto; }
function blzDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function blzOnFire(team) { return blitz.fire[team].on; }
// yards from the team's own goal ("OWN 25" / "OPP 40")
function blzYardTxt(z, team) {
  const own = Math.round((z - blzOwnGoal(team)) * blzDir(team));
  if (own >= 100) return 'GOAL';
  return own <= 50 ? 'OWN ' + own : 'OPP ' + (100 - own);
}
function blzOrd(n) { return ['', '1ST', '2ND', '3RD', '4TH'][n] || n + 'TH'; }
function blzPlayersOf(team) { return blitz.players.filter((p) => p.team === team); }
function blzByPos(team, pos) { return blitz.players.find((p) => p.team === team && p.pos === pos); }

// ---- layout & lifecycle ---------------------------------------------------------------------
function blitzLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  blitz.H = BLZ_RES;
  blitz.W = Math.max(240, Math.min(1000, Math.round(vw * BLZ_RES / vh)));
  if (blitz.cv) { blitz.cv.width = blitz.W; blitz.cv.height = blitz.H; }
  // a portrait phone keeps the wideouts in frame by shortening the lens
  blitz.F = Math.min(blitz.H * 0.88, blitz.W * 0.8);
  blitz.cy = blitz.H * 0.42;
  blitz.ui = blitz.W < 420 ? 0.8 : 1;
  blitz.crowdCv = null;
}

function syncBlitz() {
  const active = blitzActive();
  if (active === blitz.on) return;
  blitz.on = active;
  document.body.classList.toggle('blitz-mode', active);
  if (active) {
    if (!blitz.cv) {
      blitz.cv = document.createElement('canvas');
      blitz.g = blitz.cv.getContext('2d');
      blitzWorld.appendChild(blitz.cv);
      blitz.cv.addEventListener('pointerdown', blzPointerDown);
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    blitz.t = 0; blitz.earned = 0; blitz.paused = false; blitz.keys = {};
    blitzLayout();
    blzOpenTier();
  } else {
    if (blitz.tierPick) { blitz.tierPick.close(); blitz.tierPick = null; }
    blitz.phase = 'idle';
    blzCrowdStop();
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { }
  }
}

function blzOpenTier() {
  blitz.phase = 'tier';
  blitz.stats = null;
  const tiers = BLZ_TIERS.map((t) => t.key === 'allpro' && !blitzProWon() ? Object.assign({}, t, { locked: true }) : t);
  blitz.tierPick = ArcadeKit.tierSelect({
    storeKey: 'blitz',
    title: '💥 NUGGET BLITZ — pick your opponent',
    note: '7 on 7 · 30 yards for a first · no refs · press 1 · 2 · 3',
    tiers, mount: blitzWorld,
    onPick: (key, t) => { blitz.tierPick = null; blzNewGame(t); },
  });
}

// ---- audio: a little synth, a crowd, and the announcer --------------------------------------
function blzAudio() {
  const S = blitz.sfx;
  if (S.ctx) { if (S.ctx.state === 'suspended') S.ctx.resume(); return; }
  try {
    S.ctx = new (window.AudioContext || window.webkitAudioContext)();
    S.master = S.ctx.createGain(); S.master.gain.value = S.muted ? 0 : 0.34;
    S.master.connect(S.ctx.destination);
    const n = S.ctx.sampleRate * 2, buf = S.ctx.createBuffer(1, n, S.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    S.noise = buf;
  } catch (e) { S.ctx = null; }
}
function blzCrowdStart() {
  const S = blitz.sfx;
  if (!S.ctx || S.crowd) return;
  const src = S.ctx.createBufferSource(); src.buffer = S.noise; src.loop = true;
  const bp = S.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.5;
  const g = S.ctx.createGain(); g.gain.value = 0.06;
  src.connect(bp); bp.connect(g); g.connect(S.master);
  src.start();
  S.crowd = src; S.crowdGain = g;
}
function blzCrowdStop() {
  const S = blitz.sfx;
  if (S.crowd) { try { S.crowd.stop(); } catch (e) { } S.crowd = null; S.crowdGain = null; }
}
function blzRoar(level, secs) {
  const S = blitz.sfx;
  if (!S.crowdGain) return;
  const t = S.ctx.currentTime, g = S.crowdGain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0.06 + level * 0.32, t + 0.12);
  g.linearRampToValueAtTime(0.06, t + 0.12 + (secs || 1.5));
}
function blzSfx(kind) {
  const S = blitz.sfx, ctx = S.ctx;
  if (!ctx || S.muted) return;
  const t = ctx.currentTime;
  const tone = (type, f0, f1, dur, vol, at) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), t0 = t + (at || 0);
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(S.master); o.start(t0); o.stop(t0 + dur + 0.02);
  };
  const noise = (freq, q, dur, vol, at, type) => {
    const src = ctx.createBufferSource(); src.buffer = S.noise;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(), t0 = t + (at || 0);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(S.master); src.start(t0, Math.random()); src.stop(t0 + dur + 0.02);
  };
  if (kind === 'whistle') { tone('sine', 2900, 0, 0.36, 0.12); tone('sine', 3200, 0, 0.36, 0.08); }
  else if (kind === 'hut') { noise(800, 1.2, 0.08, 0.5); noise(800, 1.2, 0.08, 0.5, 0.2); }
  else if (kind === 'hit') { noise(240, 0.8, 0.22, 0.9, 0, 'lowpass'); tone('sine', 120, 45, 0.2, 0.55); }
  else if (kind === 'crunch') {
    noise(180, 0.7, 0.35, 1.0, 0, 'lowpass'); noise(1800, 0.9, 0.12, 0.5); tone('square', 90, 35, 0.3, 0.3);
  }
  else if (kind === 'catch') tone('square', 880, 1320, 0.06, 0.12);
  else if (kind === 'throw') noise(2600, 2, 0.14, 0.2);
  else if (kind === 'kick') { tone('sine', 150, 55, 0.18, 0.6); noise(500, 1, 0.08, 0.4); }
  else if (kind === 'select') tone('square', 660, 0, 0.05, 0.08);
  else if (kind === 'pick') { tone('square', 523, 0, 0.06, 0.1); tone('square', 784, 0, 0.08, 0.1, 0.06); }
  else if (kind === 'code') { [660, 880, 1320].forEach((f, i) => tone('square', f, 0, 0.08, 0.1, i * 0.07)); }
  else if (kind === 'turbo') noise(3200, 1.5, 0.05, 0.05);
  else if (kind === 'fire') { noise(400, 0.5, 0.9, 0.6, 0, 'lowpass'); tone('sawtooth', 110, 440, 0.8, 0.12); }
  else if (kind === 'td') {
    [392, 523, 659, 784, 659, 784].forEach((f, i) => tone('sawtooth', f, 0, i === 5 ? 0.5 : 0.12, 0.08, i * 0.12));
  } else if (kind === 'good') { tone('square', 784, 0, 0.1, 0.1); tone('square', 1175, 0, 0.3, 0.1, 0.1); }
  else if (kind === 'bad') { tone('square', 330, 0, 0.14, 0.1); tone('square', 220, 0, 0.35, 0.1, 0.14); }
  else if (kind === 'horn') { tone('sawtooth', 196, 0, 1.0, 0.14); tone('sawtooth', 247, 0, 1.0, 0.1); }
}
// the announcer: browser speech, throttled, interruptible only by bigger news
function blzSay(text, prio) {
  blitz.say = text;
  if (!blitz.voice || blitz.sfx.muted || blitz.auto) return;
  const S = window.speechSynthesis;
  if (!S) return;
  try {
    if (S.speaking && !prio) return;
    S.cancel();
    const u = new SpeechSynthesisUtterance(text.toLowerCase());
    u.rate = 1.12; u.pitch = 0.75; u.volume = 0.9;
    S.speak(u);
  } catch (e) { }
}
const BLZ_CALLS = {
  td: ['TOUCHDOWN!', 'HE TAKES IT ALL THE WAY!', 'SIX POINTS!'],
  sack: ['SACKED!', 'THE QUARTERBACK GOES DOWN!', 'HE GOT CRUNCHED!'],
  hit: ['MONSTER HIT!', 'OH! DID YOU SEE THAT?', 'HE GOT BREADED!', 'HE WILL FEEL THAT ONE TOMORROW!'],
  late: ['LATE HIT!', 'AFTER THE WHISTLE!', 'NO MERCY!'],
  int: ['INTERCEPTED!', 'PICKED OFF!'],
  fumble: ['FUMBLE!', 'HE COUGHS IT UP!'],
  first: ['FIRST DOWN!', 'MOVE THE CHAINS!'],
  fire: ["HE'S ON FIRE!"],
  dfire: ['THE DEFENSE IS ON FIRE!'],
  good: ["IT'S GOOD!"], nogood: ['NO GOOD!'],
  spin: ['WHAT A MOVE!', 'SPIN CYCLE!'],
  stiff: ['STIFF ARM!', 'GET OFF ME!'],
  hurdle: ['HE JUMPS OVER HIM!'],
  bomb: ['DA BOMB!', 'WAY DOWNFIELD!'],
  pressure: ['THROW THE BALL!', 'GET RID OF IT!'],
};

// ---- the game: setup ------------------------------------------------------------------------
function blzMake(team, pos) {
  const tk = blitz.teams[team];
  const base = BLZ_BASE[pos];
  const r = (BLZ_ROSTER[tk] && BLZ_ROSTER[tk][pos]) || [pos, 0];
  const cpu = team === 1;
  const spd = (r[2] != null ? r[2] : base[0]) * (cpu ? blitz.cfg.spd : 1);
  const str = (r[3] != null ? r[3] : base[1]) * (cpu ? blitz.cfg.str : 1);
  return {
    team, pos, name: r[0], num: r[1] || 0, spd, str, hands: (r[4] != null ? r[4] : base[2]) * (cpu ? blitz.cfg.hands || 1 : 1),
    x: 0, z: 0, y: 0, vx: 0, vz: 0, fx: 0, fz: blzDir(team), wx: 0, wz: 0, wt: false, anim: Math.random() * 6,
    downT: 0, diveT: 0, jumpT: 0, spinT: 0, spinCd: 0, stiffT: 0, stunT: 0, tryCd: 0, celebT: 0, throwT: 0,
    eng: null, shedT: 0, noEngT: 0, role: '', man: null, zx: 0, zz: 0, route: null, ri: 0, ox: 0, oz: 0,
    turbo: 1, turboOn: false, lateCd: 0, block: false, react: 0,
  };
}

function blzNewGame(tier) {
  blitz.cfg = tier;
  blitz.teams = ['crunch', tier.opp];
  blitz.score = [0, 0]; blitz.q = 1; blitz.clock = BLZ_QLEN; blitz.ot = false;
  blitz.stats = { yds: 0, tds: 0, sacks: 0, ints: 0, hits: 0, late: 0, fires: 0, plays: 0, long: 0, log: [], ev: {} };
  blitz.earned = 0; blitz.feed = []; blitz.parts = []; blitz.result = null;
  blitz.paused = false; blitz.banner = null; blitz.dead = null; blitz.carrier = null; blitz.ball = null;
  blitz.fire = [{ on: false, n: 0, last: null, stops: 0 }, { on: false, n: 0, last: null, stops: 0 }];
  blitz.turbo = [1, 1];
  blitz.codes = {}; blitz.codeIn = [0, 0, 0]; blitz.codeMsg = null;
  blitz.players = [];
  blzAudio(); blzCrowdStart();
  blitz.phase = 'vs'; blitz.vsT = 0;
}

// leave the VS screen: codes are locked in, the coin is flipped
function blzStartGame() {
  if (blitz.phase !== 'vs') return;
  if (blitz.codes.fire) { blitz.fire[0].on = true; blitz.fire[0].n = 3; }
  blitz.openKicker = Math.random() < 0.5 ? 0 : 1;
  blzSfx('horn'); blzRoar(0.7, 2);
  const recv = 1 - blitz.openKicker;
  blzBanner(blzTeam(recv).name + ' RECEIVE', '#ffd23a', blzTeam(0).city + ' vs ' + blzTeam(1).city, 1.6);
  blzSetupKickoff(blitz.openKicker, false);
}

// a tally of everything, both teams, for the headless harness (stats.ev)
function blzEv(k) { if (blitz.stats) blitz.stats.ev[k] = (blitz.stats.ev[k] || 0) + 1; }
function blzFeed(text, color) {
  blitz.feed.push({ text, color: color || '#fff6d8', t: 2.6 });
  if (blitz.feed.length > 3) blitz.feed.shift();
}
function blzBanner(text, color, sub, T) { blitz.banner = { text, color: color || '#ffd23a', sub: sub || '', t: 0, T: T || 1.4 }; }
function blzAfter(secs, fn) { blitz.phase = 'wait'; blitz.waitT = secs; blitz.waitFn = fn; }

// Bank arcade nuggets for a football event (perFlyer × the tier's mult).
function blzEarn(units, why) {
  if (units <= 0 || !blitz.cfg) return 0;
  const worth = Math.max(1, Math.round(storm.perFlyer * units * blitz.cfg.mult));
  storm.caught += worth;
  blitz.earned += worth;
  if (why) blzFeed('+' + fmt.format(worth) + ' ' + why, '#ffd23a');
  return worth;
}

function blzClearPlay() {
  blitz.carrier = null; blitz.target = null; blitz.returner = null; blitz.thrown = false; blitz.pocket = false;
  blitz.handed = false; blitz.ezCatch = false; blitz.fg = null; blitz.punt = null; blitz.dead = null;
  blitz.playT = 0; blitz.kickT = 0; blitz.camFlipT = 0;
}

// ---- kickoffs ---------------------------------------------------------------------------------
function blzSetupKickoff(k, free) {
  const r = 1 - k, dk = blzDir(k);
  blzClearPlay();
  blitz.poss = r; blitz.kind = 'kick'; blitz.pat2 = false;
  blitz.players = [];
  const kickZ = blzOwnGoal(k) + dk * (free ? 20 : 30);
  // the kicking team: the defense eleven… seven. Spread across the field.
  BLZ_DEF_POS.forEach((pos, i) => {
    const p = blzMake(k, pos);
    p.x = 5 + i * 7.2; p.z = kickZ - dk * 1;
    p.role = 'cover'; p.zx = p.x;
    if (pos === 'S') { p.role = 'kicker'; p.x = BLZ_MID; p.z = kickZ - dk * 6; }
    blitz.players.push(p);
  });
  // re-lane the six coverers without the kicker's gap
  blzPlayersOf(k).filter((p) => p.role === 'cover').forEach((p, i) => { p.x = 5 + i * 8.6; p.zx = p.x; });
  const rz = blzOwnGoal(r) + blzDir(r) * 5;
  BLZ_OFF_POS.forEach((pos, i) => {
    const p = blzMake(r, pos);
    p.role = 'wall';
    if (pos === 'RB') { p.role = 'returner'; p.x = BLZ_MID; p.z = rz; blitz.returner = p; }
    else if (pos === 'WR1') { p.x = BLZ_MID - 6; p.z = rz + blzDir(r) * 9; }
    else { p.x = 8 + i * 7.4; p.z = kickZ + dk * 14; }
    p.fx = 0; p.fz = blzDir(r);
    blitz.players.push(p);
  });
  blitz.ball = { st: 'tee', x: BLZ_MID, z: kickZ, y: 0.2, kind: 'kick' };
  blitz.los = kickZ;
  blzCamSnap(dk, BLZ_MID, kickZ - dk * 4);
  blitz.ctl = blzHuman(r) ? blitz.returner : blzHuman(k) ? blzByPos(k, 'LB') : null;
  blitz.phase = 'live';
  blitz.kickT = 0;
}

function blzKickTheBall() {
  const B = blitz.ball, k = 1 - blitz.poss, r = blitz.poss;
  const land = blzOwnGoal(r) + blzDir(r) * blzRnd(-4, 9);
  B.st = 'air'; B.kind = 'kick';
  B.x0 = B.x; B.z0 = B.z; B.y0 = 0.3;
  B.tx = blzClamp(BLZ_MID + blzRnd(-9, 9), 6, BLZ_WID - 6); B.tz = land; B.ty = 1.6;
  B.t = 0; B.T = 3.0; B.peak = 19;
  blzSfx('kick');
  // the kicking team's human takes the coverer nearest the landing spot
  if (blzHuman(k)) blitz.ctl = blzNearestTo(k, { x: B.tx, z: B.tz }, (p) => p.role !== 'kicker');
}

// ---- play calling --------------------------------------------------------------------------
function blzFGDist() { return Math.round(Math.abs(blzGoal(blitz.poss) - blitz.los) + 17); }
function blzFGOdds(dist) { return blzClamp(1.04 - Math.max(0, dist - 20) * 0.016, 0.12, 0.98); }

function blzToCall() {
  blzClearPlay();
  blitz.kind = 'call';
  const off = blitz.poss;
  // line both teams up first so the call screen has a field behind it
  blzLineUp(BLZ_OFF_PLAYS[0], BLZ_DEF_PLAYS[0], false);
  blitz.cpuFlip = Math.random() < 0.5;
  if (blzHuman(off)) {
    blitz.callFor = 'off';
    blitz.cpuDef = blzCpuDefCall();
  } else {
    blitz.cpuOff = blzCpuOffCall(off);
    // the CPU going for a kick skips your defensive call (there's no card for "block it")
    if (blitz.cpuOff === 'punt' || blitz.cpuOff === 'fg') {
      blzBanner(blitz.cpuOff === 'punt' ? 'PUNT' : 'FIELD GOAL', '#bfe8ff', blitz.cpuOff === 'fg' ? blzFGDist() + ' YARDS' : '', 1.2);
      blzAfter(0.9, () => blzSpecial(blitz.cpuOff));
      return;
    }
    if (blzHuman(1 - off)) blitz.callFor = 'def';
    else { blzRunCalls(blitz.cpuOff, blzCpuDefCall()); return; }
  }
  blitz.phase = 'call'; blitz.callT = 0; blitz.callSel = 4; blitz.flip = false;
}

function blzCpuOffCall(team) {
  const togo = Math.abs(blitz.firstAt - blitz.los), trail = blitz.score[1 - team] - blitz.score[team];
  const late = blitz.q >= 4 && blitz.clock < 30;
  if (blitz.down === 4 && !blitz.pat2) {
    const fgd = blzFGDist();
    if (fgd <= 52 && !(late && trail > 3)) return 'fg';
    if (!blitz.codes.nopunt && togo > 6 && !(late && trail > 0) && !(blitz.q >= 4 && trail > 8)) return 'punt';
  }
  const passes = [0, 1, 2, 3, 4, 8], runs = [6, 7];
  let pRun = togo < 8 ? 0.45 : togo > 18 ? 0.12 : 0.25;
  if (late && trail > 0) pRun = 0.05;
  if (late && trail > 0 && Math.abs(blzGoal(team) - blitz.los) > 45 && Math.random() < 0.5) return 5; // the Hail Mary
  if (Math.random() < pRun) return blzPick(runs);
  if (togo > 20 && Math.random() < 0.35) return 1;
  return blzPick(passes);
}
function blzCpuDefCall() {
  const togo = Math.abs(blitz.firstAt - blitz.los);
  const toGoal = Math.abs(blzGoal(blitz.poss) - blitz.los);
  if (toGoal < 6 && Math.random() < 0.5) return 8;
  const r = Math.random();
  if (togo > 20) return r < 0.4 ? 7 : r < 0.7 ? 6 : r < 0.85 ? 0 : 3;
  if (r < 0.14) return 3;
  return blzPick([0, 1, 2, 4, 5, 6, 7]);
}

// the human picked (n = card index, or 'punt' / 'fg')
function blzChoose(n) {
  if (blitz.phase !== 'call') return;
  blzSfx('pick');
  if (blitz.callFor === 'off') {
    if (n === 'punt' || n === 'fg') {
      if (n === 'punt' && (blitz.codes.nopunt || blitz.pat2)) return;
      if (n === 'fg' && blitz.pat2) return;
      blzSpecial(n);
      return;
    }
    blzRunCalls(n, blitz.cpuDef);
  } else {
    if (typeof n !== 'number') return;
    blzRunCalls(blitz.cpuOff, n);
  }
}

function blzRunCalls(offN, defN) {
  const human0 = blzHuman(blitz.poss);
  const flip = human0 ? blitz.flip : blitz.cpuFlip;
  blitz.stats.plays++;
  blzLineUp(BLZ_OFF_PLAYS[offN], BLZ_DEF_PLAYS[defN], flip);
  blitz.phase = 'pre';
  blitz.snapAt = blzHuman(blitz.poss) ? 9 : blzRnd(0.9, 1.7);
  blitz.playT = 0;
}

// Put fourteen nuggets on their marks for a scrimmage play.
function blzLineUp(play, dplay, flip) {
  const off = blitz.poss, def = 1 - off, d = blzDir(off), fl = flip ? -1 : 1;
  blitz.play = play; blitz.dplay = dplay; blitz.flip = flip;
  blitz.kind = play.kind;
  blitz.players = [];
  const bx = blitz.ballX, los = blitz.los;
  const X = (dx) => bx + dx * fl * d, Z = (dz) => los + dz * d;
  const form = Object.assign({}, BLZ_FORM, play.form || {});
  for (const pos of BLZ_OFF_POS) {
    const p = blzMake(off, pos);
    const f = form[pos];
    p.x = blzClamp(X(f[0]), 1, BLZ_WID - 1); p.z = Z(f[1]);
    p.fx = 0; p.fz = d;
    const rt = play.routes && play.routes[pos];
    if (rt) p.route = rt.map((w) => [p.x + w[0] * fl * d, p.z + w[1] * d]);
    if (pos === 'RB' && play.kind === 'run') p.route = play.rb.map((w) => [p.x + w[0] * fl * d, p.z + w[1] * d]);
    p.block = !p.route && pos !== 'QB';
    if (pos === 'C' || pos === 'LG' || pos === 'RG') p.block = true;
    // run plays: the wideouts run a few yards and turn into blockers
    if (play.kind === 'run' && (pos === 'WR1' || pos === 'WR2')) p.runBlock = true;
    blitz.players.push(p);
  }
  const offP = (pos) => blzByPos(off, pos);
  const spots = { DE1: [-3.2, 1.2], DT: [0, 1.2], DE2: [3.2, 1.2], LB: [0, 5.5], CB1: [-14.5, 6], CB2: [14.5, 6], S: [0, 14] };
  BLZ_DEF_POS.forEach((pos, i) => {
    const p = blzMake(def, pos);
    const role = dplay.roles[i];
    let sx = spots[pos][0] * fl, sz = spots[pos][1];
    if (pos === 'CB1') sx = (offP('WR1').x - bx) * d; // line up over your man
    if (pos === 'CB2') sx = (offP('WR2').x - bx) * d;
    p.x = blzClamp(bx + sx * d, 1, BLZ_WID - 1); p.z = Z(sz);
    p.fx = 0; p.fz = -d;
    if (role === 'rush') { p.role = 'rush'; if (pos === 'LB' || pos === 'S' || pos.startsWith('CB')) p.z = Z(pos === 'S' ? 6 : 3.5); }
    else if (role === 'spy') p.role = 'spy';
    else if (typeof role === 'string' && role.startsWith('man:')) {
      p.role = 'man'; p.man = offP(role.slice(4));
      if (p.man && !p.man.route && play.kind !== 'run') { p.role = 'zone'; p.zx = bx; p.zz = Z(6); } // nobody to cover
    } else if (Array.isArray(role)) {
      p.role = role[0]; p.zx = blzClamp(bx + role[1] * fl * d, 3, BLZ_WID - 3); p.zz = Z(role[2]);
    }
    blitz.players.push(p);
  });
  // blocking assignments: each lineman takes a rusher, left to right
  const OL = ['LG', 'C', 'RG'].map(offP);
  const rushers = blzPlayersOf(def).filter((p) => p.role === 'rush').sort((a, b) => (a.x - b.x) * d * fl);
  OL.forEach((o, i) => { o.man = rushers[Math.min(i, rushers.length - 1)] || null; });
  blitz.ball = { st: 'held', x: bx, z: los, y: 0.3, kind: '' };
  blitz.carrier = null;
  blzCamSnap(d, bx, los + d * 3);
  // who you drive: QB (pass) or the back (run); on defense, the linebacker
  if (blzHuman(off)) blitz.ctl = play.kind === 'run' ? offP('RB') : offP('QB');
  else if (blzHuman(def)) blitz.ctl = blzByPos(def, 'LB');
  else blitz.ctl = null;
  blitz.target = play.kind === 'pass' ? offP(play.primary) : null;
}

function blzSnap() {
  const off = blitz.poss;
  blitz.phase = 'live';
  blitz.playT = 0; blitz.thrown = false; blitz.handed = false;
  blitz.startZ = blitz.los;
  const qb = blzByPos(off, 'QB');
  blitz.carrier = qb; blitz.ball.st = 'held';
  blitz.pocket = true;
  blitz.qbPatience = blzRnd(0.75, 1.45);
  blitz.saidPress = false;
  blitz.nextRead = 0.85;
  for (const p of blitz.players) {
    p.react = blzRnd(0.05, 0.3);
    // blitzers off the second level read the snap first (and give a human QB a beat)
    if (p.team !== off && p.role === 'rush' && !/^D[ET]/.test(p.pos)) p.react += 0.35;
  }
  blzSfx('hut');
}

// ---- special teams --------------------------------------------------------------------------
function blzSpecial(kind) {
  blzClearPlay();
  const off = blitz.poss, def = 1 - off, d = blzDir(off);
  blitz.kind = kind; blitz.players = [];
  const bx = blitz.ballX, los = blitz.los;
  for (const pos of BLZ_OFF_POS) {
    const p = blzMake(off, pos);
    const f = BLZ_FORM[pos];
    p.x = bx + f[0] * d * (kind === 'punt' && pos.startsWith('WR') ? 1.3 : kind === 'fg' && pos.startsWith('WR') ? 0.25 : 1);
    p.z = los + f[1] * d;
    if (pos === 'QB') { p.z = los - d * (kind === 'punt' ? 13 : 7); p.role = kind === 'punt' ? 'punter' : 'holder'; }
    if (pos === 'RB') { p.z = los - d * (kind === 'punt' ? 6 : 9.5); p.x = bx - (kind === 'fg' ? 2 * d : 0); p.role = kind === 'fg' || kind === 'pat' ? 'kicker' : 'protect'; }
    p.x = blzClamp(p.x, 1, BLZ_WID - 1);
    p.block = !p.role; p.fx = 0; p.fz = d;
    blitz.players.push(p);
  }
  BLZ_DEF_POS.forEach((pos) => {
    const p = blzMake(def, pos);
    const sx = { DE1: -3.2, DT: 0, DE2: 3.2, LB: -1.5, CB1: -16, CB2: 16, S: 0 }[pos];
    p.x = blzClamp(bx + sx * d, 1, BLZ_WID - 1); p.z = los + d * 1.2;
    p.role = 'rush'; p.fx = 0; p.fz = -d;
    if (kind === 'punt') {
      if (pos === 'CB1') { p.role = 'returner'; p.x = BLZ_MID + (bx - BLZ_MID) * 0.4; p.z = blzClamp(los + d * 42, 12, 108); blitz.returner = p; }
      else if (pos === 'S' || pos === 'CB2') { p.role = 'wall'; p.z = los + d * (pos === 'S' ? 28 : 20); }
    }
    blitz.players.push(p);
  });
  blitz.ball = { st: 'held', x: bx, z: los, y: 0.3, kind: '' };
  blzCamSnap(d, bx, los);
  blitz.ctl = null;
  if (kind === 'punt' && blzHuman(def)) blitz.ctl = blitz.returner;
  if (blzHuman(def) && kind !== 'punt') blitz.ctl = blzByPos(def, 'LB');
  blitz.phase = 'live'; blitz.playT = 0; blitz.pocket = false;
  blitz.carrier = null;
  if (kind === 'fg' || kind === 'pat') {
    const dist = kind === 'pat' ? 20 : blzFGDist();
    const odds = kind === 'pat' ? 0.97 : blzFGOdds(dist);
    blitz.fg = { dist, odds, good: Math.random() < odds, kicked: false };
  } else blitz.punt = { kicked: false };
  blzSfx('hut');
}

// ---- input -----------------------------------------------------------------------------------
function blzStick() {
  const K = blitz.keys, T = blitz.touch, P = blitz.pad;
  let x = 0, y = 0;
  if (K.ArrowLeft || K.KeyA) x -= 1;
  if (K.ArrowRight || K.KeyD) x += 1;
  if (K.ArrowUp || K.KeyW) y += 1;
  if (K.ArrowDown || K.KeyS) y -= 1;
  if (T.L) { x += T.L.dx; y -= T.L.dy; }
  if (P.on) { x += P.lx || 0; y -= P.ly || 0; }
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; }
  return { x, y, m: Math.min(1, m) };
}
function blzTurboHeld() {
  const K = blitz.keys;
  return !!(K.ShiftLeft || K.ShiftRight || K.KeyL || blitz.touch.T || (blitz.pad.on && blitz.pad.turbo));
}
// world-space direction of the stick (screen up = downfield for the camera)
function blzStickWorld() {
  const s = blzStick(), d = blitz.cam.dir;
  return { x: s.x * d, z: s.y * d, m: s.m };
}

// PASS button: snap · throw · lateral · switch defender · stiff arm
function blzPressPass() {
  const ph = blitz.phase;
  if (ph === 'vs') { blzCodeTap(2); return; }
  if (ph === 'final') { if (blitz.finalT > 1) blzNewGame(blitz.cfg); return; }
  if (ph === 'call') { blzChoose(blitz.callSel); return; }
  if (ph === 'pat') { blzPatChoose(blitz.callSel === 1 ? 2 : 1); return; }
  const off = blitz.poss;
  if (ph === 'pre') {
    if (blzHuman(off)) blzSnap();
    else if (blzHuman(1 - off)) blzSwitchDefender();
    return;
  }
  if (ph !== 'live') return;
  const C = blitz.carrier, me = blitz.ctl, B = blitz.ball;
  if (!me) return;
  if (!C) {
    // ball in the air: your pass, your receiver — nothing to switch to
    const mine = B && B.from && B.from.team === me.team;
    if (!mine) blzSwitchDefender();
    return;
  }
  if (C.team !== me.team) { blzSwitchDefender(); return; }
  if (C !== me) return;
  const pastLos = (C.z - blitz.los) * blzDir(C.team) > 0.4;
  if (blitz.pocket && C.pos === 'QB' && blitz.kind === 'pass' && !blitz.thrown && !pastLos) {
    const tgt = blitz.target || blzBestTarget(C);
    if (tgt) blzThrow(C, tgt, blzTurboHeld());
    return;
  }
  if (blzTurboHeld()) { blzStiffArm(C); return; }
  blzLateral(C);
}
// JUMP button: hurdle / spin with turbo · on defense high-point or dive with turbo
function blzPressJump() {
  const ph = blitz.phase;
  if (ph === 'vs') { blzCodeTap(1); return; }
  if (ph === 'call' || ph === 'pat') return;
  const me = blitz.ctl;
  if (!me || me.downT > 0 || me.diveT > 0) return;
  if (ph === 'dead' || ph === 'wait') { blzLateHit(me); return; }
  if (ph !== 'live') return;
  const tur = blzTurboHeld();
  if (me === blitz.carrier) {
    if (tur && me.spinCd <= 0) { me.spinT = 0.5; me.spinCd = 1.1; blzSfx('turbo'); return; }
    if (me.jumpT <= 0) { me.jumpT = 0.62; return; }
    return;
  }
  const C = blitz.carrier;
  if (tur && C && C.team !== me.team) { blzDive(me); return; }
  if (me.jumpT <= 0) me.jumpT = 0.62;
}

function blzSwitchDefender() {
  const me = blitz.ctl;
  if (!me) return;
  const B = blitz.ball;
  const tgt = B.st === 'air' ? { x: B.tx, z: B.tz } : (blitz.carrier || B);
  const n = blzNearestTo(me.team, tgt, (p) => p !== me && p.downT <= 0);
  if (n) { blitz.ctl = n; blzSfx('select'); }
}

function blzNearestTo(team, at, filt) {
  let best = null, bd = 1e9;
  for (const p of blitz.players) {
    if (p.team !== team || (filt && !filt(p))) continue;
    const d = Math.hypot(p.x - at.x, p.z - at.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// The receiver the QB's stick points at (or the best open one for the CPU).
function blzAimTarget(qb) {
  const w = blzStickWorld();
  const recs = blzPlayersOf(qb.team).filter((p) => BLZ_ELIG[p.pos] && p.downT <= 0);
  if (w.m < 0.3) return blitz.target && recs.includes(blitz.target) ? blitz.target : recs[0];
  let best = null, bs = -1e9;
  for (const r of recs) {
    const dx = r.x - qb.x, dz = r.z - qb.z, d = Math.hypot(dx, dz) || 1;
    const cos = (dx * w.x + dz * w.z) / (d * (w.m || 1));
    const sc = cos * 2 - d * 0.01;
    if (sc > bs) { bs = sc; best = r; }
  }
  return best;
}
function blzOpenness(r) {
  let md = 99;
  for (const p of blitz.players) {
    if (p.team === r.team || p.downT > 0) continue;
    md = Math.min(md, Math.hypot(p.x - r.x, p.z - r.z));
  }
  return md;
}
function blzBestTarget(qb) {
  const recs = blzPlayersOf(qb.team).filter((p) => BLZ_ELIG[p.pos] && p.downT <= 0);
  let best = null, bs = -1e9;
  for (const r of recs) {
    const open = blzOpenness(r), gain = (r.z - blitz.los) * blzDir(qb.team);
    const sc = Math.min(open, 7) * 1.0 + blzClamp(gain, -4, 30) * 0.09 - Math.hypot(r.x - qb.x, r.z - qb.z) * 0.02;
    if (sc > bs) { bs = sc; best = r; }
  }
  return best ? { r: best, open: blzOpenness(best) } : null;
}

// ---- the ball ---------------------------------------------------------------------------------
function blzThrow(qb, r, bullet) {
  const B = blitz.ball;
  const fast = blitz.codes.fastpass ? 1.3 : 1;
  const spd = (bullet ? 27 : 18) * fast;
  // lead the receiver: where he'll be when the ball gets there
  let tx = r.x, tz = r.z, T = 0.5;
  for (let i = 0; i < 3; i++) {
    T = Math.max(0.35, Math.hypot(tx - qb.x, tz - qb.z) / spd);
    tx = r.x + r.vx * T; tz = r.z + r.vz * T;
  }
  const dist = Math.hypot(tx - qb.x, tz - qb.z);
  // pressure + distance spray the throw; the fire doesn't miss
  let press = 0;
  for (const p of blitz.players) if (p.team !== qb.team && p.downT <= 0 && blzDist(p, qb) < 2.5) press = 1;
  let err = 0.3 + dist * 0.028 + press * 0.9 + (bullet ? 0.25 : 0);
  if (blzOnFire(qb.team)) err *= 0.4;
  const a = Math.random() * Math.PI * 2, m = err * Math.sqrt(Math.random());
  tx += Math.cos(a) * m; tz += Math.sin(a) * m;
  B.st = 'air'; B.kind = 'pass';
  B.x0 = qb.x; B.z0 = qb.z; B.y0 = 2.1;
  B.tx = blzClamp(tx, -2, BLZ_WID + 2); B.tz = tz; B.ty = 1.6;
  B.t = 0; B.T = T; B.peak = bullet ? 0.4 + dist * 0.04 : 1 + dist * 0.13;
  B.from = qb; B.bullet = bullet;
  blzEv('att' + qb.team);
  blitz.target = r; blitz.thrown = true; blitz.pocket = false; blitz.carrier = null;
  qb.throwT = 0.35;
  blzSfx('throw');
  // you drive the receiver while the ball is up
  if (blzHuman(qb.team)) blitz.ctl = r;
  if (dist > 35) blzSay(blzPick(BLZ_CALLS.bomb));
}

function blzLateral(C) {
  // pitch to the nearest teammate, preferring one level or behind
  const d = blzDir(C.team);
  let best = null, bs = 1e9;
  for (const p of blitz.players) {
    if (p.team !== C.team || p === C || p.downT > 0) continue;
    const ahead = (p.z - C.z) * d;
    const dd = Math.hypot(p.x - C.x, p.z - C.z);
    if (dd > 14) continue;
    const sc = dd + Math.max(0, ahead) * 2.5;
    if (sc < bs) { bs = sc; best = p; }
  }
  if (!best) return;
  const B = blitz.ball;
  const T = Math.max(0.3, blzDist(C, best) / 16);
  B.st = 'air'; B.kind = 'lat';
  B.x0 = C.x; B.z0 = C.z; B.y0 = 1.4;
  B.tx = best.x + best.vx * T; B.tz = best.z + best.vz * T; B.ty = 1.3;
  B.t = 0; B.T = T; B.peak = 0.6; B.from = C;
  blitz.target = best; blitz.carrier = null;
  C.throwT = 0.3;
  blzSfx('throw');
  if (blzHuman(C.team)) blitz.ctl = best;
  blzFeed('LATERAL!', '#bfe8ff');
}

function blzStiffArm(C) {
  if (C.stiffT > 0 || C.spinCd > 0) return;
  C.stiffT = 0.45; C.spinCd = 0.9;
}

function blzDive(p) {
  p.diveT = 0.42;
  const C = blitz.carrier;
  let dx = p.fx, dz = p.fz;
  if (C) { const d = blzDist(p, C) || 1; dx = (C.x + C.vx * 0.2 - p.x) / d; dz = (C.z + C.vz * 0.2 - p.z) / d; const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m; }
  p.vx = dx * p.spd * 1.5; p.vz = dz * p.spd * 1.5; p.fx = dx; p.fz = dz;
}

function blzFumble(C, by) {
  const B = blitz.ball;
  B.st = 'loose'; B.kind = 'loose';
  B.x = C.x; B.z = C.z; B.y = 1.2;
  const a = Math.random() * Math.PI * 2;
  B.vx = Math.cos(a) * 5 + (by ? by.vx * 0.4 : 0); B.vz = Math.sin(a) * 5 + (by ? by.vz * 0.4 : 0); B.vy = 4;
  B.lastTeam = C.team; B.looseT = 0;
  blzEv('fumble' + blitz.kind);
  blitz.carrier = null; blitz.pocket = false;
  blzBanner('FUMBLE!', '#ff8a3a', '', 1.1);
  blzSay(blzPick(BLZ_CALLS.fumble), true);
  blzRoar(0.9, 1.6);
}

function blzBallUpdate(dt) {
  const B = blitz.ball;
  if (!B) return;
  if (B.st === 'held') {
    const C = blitz.carrier;
    if (C) { B.x = C.x + C.fx * 0.35; B.z = C.z + C.fz * 0.35; B.y = 1.2 + C.y; }
    return;
  }
  if (B.st === 'air') {
    B.t += dt;
    const u = Math.min(1, B.t / B.T);
    B.x = B.x0 + (B.tx - B.x0) * u; B.z = B.z0 + (B.tz - B.z0) * u;
    B.y = B.y0 + (B.ty - B.y0) * u + B.peak * 4 * u * (1 - u);
    if (B.kind === 'fg') { if (u >= 1) blzFGResult(); return; }
    if (B.t >= B.T) {
      if (B.kind === 'pass' || B.kind === 'lat') blzCatchResolve();
      else blzKickArrive();
    }
    return;
  }
  if (B.st === 'loose') {
    B.looseT += dt;
    B.vy -= 22 * dt; B.y += B.vy * dt;
    if (B.y < 0.15) { B.y = 0.15; B.vy = Math.abs(B.vy) * 0.45; B.vx *= 0.7; B.vz *= 0.7; if (B.vy < 1) B.vy = 0; }
    B.x += B.vx * dt; B.z += B.vz * dt;
    B.vx *= 1 - dt * 0.8; B.vz *= 1 - dt * 0.8;
    if (B.x < 0 || B.x > BLZ_WID || B.z < 0 || B.z > BLZ_LEN) {
      // out of bounds: the fumbling team keeps it
      blzWhistle('oob', { team: B.lastTeam, z: blzClamp(B.z, 1, BLZ_LEN - 1), x: B.x });
      return;
    }
    // nobody fell on it in eight seconds: the officials (there are none) blow it dead
    if (B.looseT > 8) { blzWhistle('oob', { team: B.lastTeam, z: blzClamp(B.z, 1, BLZ_LEN - 1), x: B.x }); return; }
    if (B.y > 1.6 || B.looseT < 0.25) return;
    for (const p of blitz.players) {
      if (p.downT > 0 || p.diveT > 0) continue;
      if (Math.hypot(p.x - B.x, p.z - B.z) < 0.9 && Math.random() < dt * 9) {
        blzGiveBall(p, B.kind === 'loose' && p.team !== B.lastTeam ? 'recover' : 'pickup');
        return;
      }
    }
  }
}

function blzGiveBall(p, how) {
  const B = blitz.ball, prev = B.lastTeam;
  B.st = 'held'; B.kind = '';
  blitz.carrier = p; blitz.pocket = false; blitz.target = null;
  if (blzHuman(p.team)) blitz.ctl = p;
  else if (blitz.ctl && blzHuman(1 - p.team)) blitz.ctl = blzNearestTo(1 - p.team, p, (q) => q.downT <= 0) || blitz.ctl;
  if (how === 'recover' && prev != null && prev !== p.team) {
    blzFeed(blzTeam(p.team).name + ' RECOVER!', '#ffd23a');
    if (blzHuman(p.team)) blzEarn(8, 'FUMBLE RECOVERY');
  }
  // a ball caught behind your own goal line can be downed for a touchback
  blitz.ezCatch = (p.z - blzOwnGoal(p.team)) * blzDir(p.team) < 0;
  blzSfx('catch');
}

function blzCatchResolve() {
  const B = blitz.ball, r = blitz.target, from = B.from;
  const team = from ? from.team : blitz.poss;
  if (B.kind === 'lat') {
    if (r && r.downT <= 0 && Math.hypot(r.x - B.x, r.z - B.z) < 2.2 && Math.random() < 0.88) { blzGiveBall(r, 'lat'); return; }
    blzFumble({ x: B.x, z: B.z, team, fx: 0, fz: 0 }, null);
    return;
  }
  // who's under it?
  let off = null, dO = 99, def = null, dD = 99;
  for (const p of blitz.players) {
    if (p.downT > 0) continue;
    const d = Math.hypot(p.x - B.x, p.z - B.z);
    if (p.team === team) { if (BLZ_ELIG[p.pos] && d < dO) { dO = d; off = p; } }
    else if (d < dD) { dD = d; def = p; }
  }
  const reach = (p) => 1.7 + (p.jumpT > 0 ? 0.8 : 0) + (p.diveT > 0 ? 0.5 : 0);
  if (off && dO > reach(off)) off = null;
  if (def && dD > reach(def)) def = null;
  const done = (txt) => { blzFeed(txt, '#bfc6ff'); blzWhistle('inc', {}); };
  if (!off && !def) { done('INCOMPLETE'); return; }
  const qD = def ? def.hands * 0.75 * (1 - dD / 2.6) + (def.jumpT > 0 ? 0.25 : 0) + (blzHuman(def.team) && def === blitz.ctl ? 0.08 : 0) : 0;
  const qR = off ? off.hands * (1 - dO / 3.2) + (off.jumpT > 0 ? 0.15 : 0) + (blzOnFire(team) ? 0.25 : 0) : 0;
  if (def && (!off || dD < dO - 0.4)) {
    // the defender has the better spot
    if (Math.random() < blzClamp(qD * 0.3, 0.03, 0.3)) { blzPick6(def); return; }
    if (off && Math.random() < qR * 0.45) { blzCaught(off); return; }
    blzFeed(def.jumpT > 0 ? 'SWATTED!' : 'BROKEN UP', '#bfc6ff');
    blzWhistle('inc', {});
    return;
  }
  // the receiver's ball, maybe contested
  const contested = def && Math.hypot(def.x - off.x, def.z - off.z) < 1.5;
  let pc = contested ? qR * 0.82 - qD * 0.25 : 0.12 + qR * 0.86;
  if (B.bullet && dO < 0.8) pc += 0.06;
  if (Math.random() < blzClamp(pc, 0.15, 0.97)) { blzCaught(off); return; }
  if (contested && Math.random() < qD * 0.09) { blzPick6(def); return; }
  done(contested ? 'BROKEN UP' : 'DROPPED');
}

function blzCaught(r) {
  blzEv('comp' + r.team);
  blzGiveBall(r, 'catch');
  const team = r.team, F = blitz.fire[team];
  if (F.last === r.pos) F.n++; else { F.last = r.pos; F.n = 1; }
  if (!F.on && F.n >= 3) blzIgnite(team, r);
  blitz.fire[1 - team].stops = 0;
}
function blzPick6(def) {
  blzEv('int' + def.team);
  blzGiveBall(def, 'int');
  blitz.stats && blzHuman(def.team) && blitz.stats.ints++;
  blzBanner('INTERCEPTED!', '#ff8a3a', '', 1.2);
  blzSay(blzPick(BLZ_CALLS.int), true);
  blzRoar(1, 2);
  if (blzHuman(def.team)) blzEarn(10, 'INTERCEPTION');
  blitz.fire[1 - def.team].n = 0;
}

function blzIgnite(team, who) {
  const F = blitz.fire[team];
  F.on = true; F.plays = 0;
  blitz.stats && blzHuman(team) && blitz.stats.fires++;
  const off = who && BLZ_ELIG[who.pos];
  blzBanner(off ? "HE'S ON FIRE!" : 'DEFENSE ON FIRE!', '#ff6a1a', off ? who.name : 'UNLIMITED TURBO', 1.8);
  blzSay(off ? BLZ_CALLS.fire[0] : BLZ_CALLS.dfire[0], true);
  blzSfx('fire'); blzRoar(1, 2.5);
  if (blzHuman(team)) blzEarn(12, 'ON FIRE');
}
function blzDouse(team) {
  const F = blitz.fire[team];
  if (F.on) blzFeed(blzTeam(team).name + ' COOLED OFF', '#9aa4c8');
  F.on = false; F.n = 0; F.stops = 0; F.last = null;
}

// a kick or punt comes down
function blzKickArrive() {
  const B = blitz.ball, R = blitz.returner;
  const recv = blitz.kind === 'punt' ? 1 - blitz.poss : blitz.poss;
  // a punt that lands past the goal line is a touchback, whoever's under it
  if (blitz.kind === 'punt' && (B.tz - blzOwnGoal(recv)) * blzDir(recv) < 0) {
    blzWhistle('touchback', { team: recv });
    return;
  }
  if (R && R.downT <= 0 && Math.hypot(R.x - B.x, R.z - B.z) < 2.6 && Math.random() < 0.975) {
    blzGiveBall(R, 'return');
    // the CPU kneels a deep one; you can too (just don't move, and the whistle finds you)
    if (blitz.ezCatch && !blzHuman(R.team) && (blzOwnGoal(R.team) - R.z) * blzDir(R.team) > 4) blzWhistle('touchback', { team: R.team });
    return;
  }
  // muffed / nobody home: it bounces, and anybody can have it
  B.st = 'loose'; B.kind = 'muff'; B.looseT = 0;
  B.x = B.tx; B.z = B.tz; B.y = 1; B.vx = blzRnd(-2, 2); B.vz = blzDir(1 - recv) * blzRnd(2, 5); B.vy = 3;
  B.lastTeam = recv;
  blzFeed('MUFFED!', '#ff8a3a');
  blzEv('muff'); if (blitz.stats) (blitz.stats.muffs = blitz.stats.muffs || []).push([blitz.kind, R ? +Math.hypot(R.x - B.x, R.z - B.z).toFixed(1) : -1, R ? R.downT.toFixed(1) : '', R ? R.pos + R.team : '']);
}

// ---- the AI ------------------------------------------------------------------------------------
function blzSeek(p, tx, tz, mag) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 0.2) { p.wx = 0; p.wz = 0; return d; }
  const m = Math.min(1, d / 1.0) * (mag == null ? 1 : mag);
  p.wx = dx / d * m; p.wz = dz / d * m;
  return d;
}

function blzThink(p, dt) {
  p.wt = false;
  if (p.downT > 0 || p.diveT > 0) return;
  if (p.react > 0) { p.react -= dt; p.wx = 0; p.wz = 0; return; }
  const B = blitz.ball, C = blitz.carrier, ph = blitz.phase;
  if (ph === 'dead' || ph === 'wait') {
    p.wx *= 0.9; p.wz *= 0.9;
    // the CPU knows the whistle is just a noise
    // (one per whistle, and not every whistle — it's a spice, not the meal)
    const D = blitz.dead;
    if (D && !D.cpuLate && D.type !== 'td' && !blzHuman(p.team) && p.lateCd <= 0) {
      const v = D.who;
      if (v && v.team !== p.team && blzDist(p, v) < 3) {
        if (D.lateRoll == null) D.lateRoll = Math.random() < 0.3;
        if (D.lateRoll) { blzSeek(p, v.x, v.z, 1); if (blzDist(p, v) < 1.2) { D.cpuLate = true; blzLateHit(p); } }
      }
    }
    return;
  }
  if (ph === 'pre') { p.wx = 0; p.wz = 0; return; }
  if (blitz.kind === 'kick' && B.st === 'tee') { blzKickoffAI(p, dt); return; }
  if (B.st === 'loose') { blzLooseAI(p); return; }
  if (p === C) {
    if (blitz.pocket && p.pos === 'QB') blzQBAI(p, dt);
    else blzRunnerAI(p, dt);
    return;
  }
  if (B.st === 'air' && B.kind === 'pass') { blzPassAirAI(p, dt); return; }
  if (B.st === 'air' && (B.kind === 'kick' || B.kind === 'punt')) { blzKickAirAI(p, dt); return; }
  if (blitz.kind === 'fg' || blitz.kind === 'pat' || (blitz.kind === 'punt' && !C)) { blzSpecialAI(p, dt); return; }
  if (blitz.pocket && C) { blzRoleAI(p, dt, C); return; }
  if (C) { blzPursuitAI(p, dt, C); return; }
  // lateral in the air etc.
  if (B.st === 'air') {
    if (p.team !== (B.from ? B.from.team : blitz.poss)) blzSeek(p, B.tx, B.tz, 1);
    else if (p === blitz.target) blzSeek(p, B.tx, B.tz, 1);
    p.wt = true;
  }
}

function blzQBAI(qb, dt) {
  const d = blzDir(qb.team), t = blitz.playT;
  const run = blitz.kind === 'run';
  if (run) {
    const rb = blzByPos(qb.team, 'RB');
    if (rb) blzSeek(qb, rb.x, rb.z, 0.8);
    return;
  }
  // drop, then hang in the pocket, sliding away from the nearest rusher
  const dropZ = blitz.los - d * 7.5;
  let nr = null, nd = 99;
  for (const p of blitz.players) if (p.team !== qb.team && p.downT <= 0) { const dd = blzDist(p, qb); if (dd < nd) { nd = dd; nr = p; } }
  if ((qb.z - dropZ) * d > 0.5) blzSeek(qb, qb.x, dropZ, 1);
  else if (nr && nd < 4.5) {
    const ax = qb.x - nr.x, az = qb.z - nr.z, m = Math.hypot(ax, az) || 1;
    qb.wx = ax / m * 0.9; qb.wz = (az / m) * 0.5; qb.wt = nd < 2.5;
  } else { qb.wx = 0; qb.wz = 0; }
  if (qb.team === 0 && blzHuman(0)) return; // (never: the human QB isn't on AI)
  if (t < blitz.nextRead) return;
  blitz.nextRead = t + 0.22;
  const best = blzBestTarget(qb);
  if (!best) return;
  const pat = blitz.qbPatience * (0.85 + 0.3 * (blitz.cfg.smart || 1) * (qb.team === 1 ? 1 : 0.8));
  const pressure = nd < 2.2;
  if (t > 3.6 * pat && !blitz.saidPress) { blitz.saidPress = true; blzSay(blzPick(BLZ_CALLS.pressure)); }
  if (best.open > 3.2 || (pressure && best.open > 1.6 && t > 0.9) || t > 4.2 * pat) {
    if (best.open < 0.9 && t < 5.5 * pat && !pressure) return;
    blzThrow(qb, best.r, best.open < 3 && blzDist(qb, best.r) < 22);
  }
}

function blzRunnerAI(p, dt) {
  const d = blzDir(p.team);
  let wx = 0, wz = d * 1.0;
  let near = 99;
  for (const q of blitz.players) {
    if (q.team === p.team || q.downT > 0) continue;
    const dx = p.x - q.x, dz = p.z - q.z, dd = Math.hypot(dx, dz);
    if (dd > 8) continue;
    near = Math.min(near, dd);
    // threats in front matter most; steer laterally away
    const ahead = (q.z - p.z) * d;
    const w = (ahead > -1 ? 1.4 : 0.5) / Math.max(0.6, dd * dd) * 4;
    wx += (dx / (dd || 1)) * w;
    wz += (dz / (dd || 1)) * w * 0.35;
  }
  if (p.x < 4) wx += (4 - p.x) * 0.4;
  if (p.x > BLZ_WID - 4) wx -= (p.x - (BLZ_WID - 4)) * 0.4;
  if (wz * d < 0.25) wz = d * 0.25; // never run backwards for long
  const m = Math.hypot(wx, wz) || 1;
  p.wx = wx / m; p.wz = wz / m;
  p.wt = near < 7 || p.turbo > 0.6;
  // moves
  if (near < 1.8 && p.spinCd <= 0 && Math.random() < dt * 3) {
    if (Math.random() < 0.5) { p.spinT = 0.5; p.spinCd = 1.2; } else { p.stiffT = 0.45; p.spinCd = 1.0; }
  }
  for (const q of blitz.players) {
    if (q.team !== p.team && q.diveT > 0 && blzDist(p, q) < 2.6 && p.jumpT <= 0 && Math.random() < 0.5) p.jumpT = 0.62;
  }
}

function blzRoleAI(p, dt, C) {
  const off = blitz.poss, d = blzDir(off);
  const qb = C;
  if (p.team === off) {
    if (p.runBlock && blitz.playT > 0.9) p.block = true;
    if (p.block) {
      if (p.eng) return;
      // pass pro: get between your man (or the nearest free rusher) and the ball
      let m = p.man;
      if (!m || m.eng || m.downT > 0) m = blzThreatTo(p, qb);
      if (m) {
        const tx = m.x + (qb.x - m.x) * 0.25, tz = m.z + (qb.z - m.z) * 0.25;
        blzSeek(p, tx, tz, 0.95);
      } else { p.wx = 0; p.wz = 0; }
      return;
    }
    if (p.route) {
      blzRunRoute(p);
      return;
    }
    p.wx = 0; p.wz = 0;
    return;
  }
  // defense
  const role = p.role;
  if (role === 'rush') {
    if (p.eng) return;
    blzSeek(p, qb.x + qb.vx * 0.3, qb.z + qb.vz * 0.3, 1);
    p.wt = blzDist(p, qb) < 9;
    if (blzDist(p, qb) < 2.6 && !blzHuman(p.team) && Math.random() < dt * 2) blzDive(p);
    return;
  }
  if (role === 'man' && p.man) {
    const r = p.man;
    // trail a step behind and a step deep; turbo to keep up
    const lag = 0.2 * (blitz.cfg.smart || 1);
    const tx = r.x + r.vx * lag, tz = r.z + r.vz * lag + d * 1.1;
    blzSeek(p, tx, tz, 1);
    p.wt = blzDist(p, r) > 2.2;
    return;
  }
  if (role === 'spy') {
    blzSeek(p, qb.x, blitz.los + d * 4, 1);
    if (Math.abs(qb.z - blitz.los) < 2 || (qb.z - blitz.los) * d > 0) blzSeek(p, qb.x, qb.z, 1);
    return;
  }
  if (role === 'zone' || role === 'deep') {
    // sit in the zone; shade to whoever wanders into it
    let tx = p.zx, tz = p.zz, best = null, bd = role === 'deep' ? 11 : 8;
    for (const r of blzPlayersOf(off)) {
      if (!BLZ_ELIG[r.pos]) continue;
      const dd = Math.hypot(r.x - p.zx, r.z - p.zz);
      if (dd < bd) { bd = dd; best = r; }
    }
    if (best) {
      tx = p.zx + (best.x - p.zx) * 0.7; tz = p.zz + (best.z - p.zz) * 0.7;
      if (role === 'deep') tz = blitz.los + d * Math.max((tz - blitz.los) * d, (best.z - blitz.los) * d + 2.5);
    }
    blzSeek(p, tx, tz, 1);
    p.wt = role === 'deep' && best && (best.z - p.z) * d > -2;
  }
}

function blzThreatTo(o, qb) {
  let best = null, bd = 9;
  for (const p of blitz.players) {
    if (p.team === o.team || p.eng || p.downT > 0) continue;
    const d = blzDist(p, qb);
    if (d < bd && blzDist(p, o) < 7) { bd = d; best = p; }
  }
  return best;
}

function blzRunRoute(p) {
  if (!p.route) return;
  if (p.ri < p.route.length) {
    const w = p.route[p.ri];
    const d = blzSeek(p, w[0], w[1], 1);
    if (d < 0.9) {
      p.ox = p.wx; p.oz = p.wz;
      p.ri++;
    }
    // stay in the field
    if (p.x < 1.5 && p.wx < 0) p.wx = 0;
    if (p.x > BLZ_WID - 1.5 && p.wx > 0) p.wx = 0;
  } else {
    const m = Math.hypot(p.ox, p.oz) || 1;
    p.wx = p.ox / m; p.wz = p.oz / m;
    if (p.x < 2 || p.x > BLZ_WID - 2) { p.wx = 0; p.wz = blzDir(p.team); }
    // a curl or hook settles where it ended
    const last = p.route[p.route.length - 1], prev = p.route[p.route.length - 2];
    if (prev && (last[1] - prev[1]) * blzDir(p.team) < 0) { p.wx = 0; p.wz = 0; }
  }
}

function blzPassAirAI(p, dt) {
  const B = blitz.ball, team = B.from ? B.from.team : blitz.poss;
  if (p.team === team) {
    if (p === blitz.target) { blzSeek(p, B.tx, B.tz, 1); p.wt = true; }
    else if (p.route) blzRunRoute(p);
    else if (p.eng) return;
    else { p.wx *= 0.5; p.wz *= 0.5; }
    return;
  }
  if (p.eng) return;
  // defenders break on the ball once they read it
  const dl = Math.hypot(p.x - B.tx, p.z - B.tz);
  if (B.t < 0.18 + (p.team === 1 ? (1 - (blitz.cfg.smart || 1)) * 0.25 : 0)) { blzRoleAI(p, dt, B.from || p); return; }
  if (dl < 22 || p.role === 'man' || p.role === 'deep') {
    const timeLeft = B.T - B.t;
    // a jump at the ball if you're there in time
    blzSeek(p, B.tx, B.tz, 1);
    p.wt = true;
    if (!blzHuman(p.team) && dl < 2.2 && timeLeft < 0.35 && p.jumpT <= 0 && Math.random() < 0.5) p.jumpT = 0.62;
  } else if (B.from) blzSeek(p, B.from.x, B.from.z, 0.4);
}

function blzKickoffAI(p, dt) {
  // the kicker approaches the tee; everyone else waits on their marks
  if (p.role === 'kicker') {
    const B = blitz.ball;
    blzSeek(p, B.x, B.z - blzDir(p.team) * 0.5, 0.75);
  } else { p.wx = 0; p.wz = 0; }
}

function blzKickAirAI(p, dt) {
  const B = blitz.ball, recv = blitz.kind === 'punt' ? 1 - blitz.poss : blitz.poss;
  if (p === blitz.returner) { blzSeek(p, B.tx, B.tz, 1); p.wt = true; return; }
  if (p.team === recv) {
    if (p.eng) return;
    // set up a wall in front of the landing spot
    const k = blzNearestTo(1 - recv, { x: B.tx, z: B.tz }, (q) => !q.eng && q.downT <= 0 && q !== blitz.returner);
    if (k) blzSeek(p, k.x + (B.tx - k.x) * 0.35, k.z + (B.tz - k.z) * 0.35, 0.9);
    p.block = true;
    return;
  }
  if (p.role === 'kicker' || p.role === 'punter') { blzSeek(p, B.tx, B.tz, 0.5); return; }
  // coverage: sprint down your lane, converge late
  const lane = p.zx || p.x;
  const tz = B.tz, u = Math.min(1, B.t / B.T);
  blzSeek(p, lane + (B.tx - lane) * (0.3 + u * 0.6), tz, 1);
  p.wt = true;
}

function blzSpecialAI(p, dt) {
  const off = blitz.poss, d = blzDir(off);
  if (p.team === off) {
    if (p.block && !p.eng) { const m = blzThreatTo(p, blitz.ball); if (m) blzSeek(p, m.x, m.z, 0.8); else { p.wx = 0; p.wz = 0; } }
    else if (p.role === 'kicker' && blitz.fg && !blitz.fg.kicked && blitz.playT > 0.55) blzSeek(p, blitz.ballX, blitz.los - d * 7, 0.6);
    else if (blitz.kind === 'punt' && p.pos.startsWith('WR') && blitz.playT > 0.4) { blzSeek(p, p.x, p.z + d * 20, 1); p.wt = true; }
    else { p.wx = 0; p.wz = 0; }
    return;
  }
  if (p.role === 'returner' || p.role === 'wall') { p.wx = 0; p.wz = 0; return; }
  if (p.eng) return;
  const B = blitz.ball;
  blzSeek(p, B.x, B.z, 1); p.wt = true;
}

function blzPursuitAI(p, dt, C) {
  if (p.team === C.team) {
    // escort: pick off the nearest chaser between the ball and the goal
    if (p.eng) return;
    const d = blzDir(C.team);
    let best = null, bs = 1e9;
    for (const q of blitz.players) {
      if (q.team === p.team || q.downT > 0 || q.eng) continue;
      const dc = blzDist(q, C);
      if (dc > 14) continue;
      const sc = dc + blzDist(q, p) * 0.7 - Math.max(0, (q.z - C.z) * d) * 0.4;
      if (sc < bs) { bs = sc; best = q; }
    }
    p.block = true;
    if (best) blzSeek(p, best.x + (C.x - best.x) * 0.3, best.z + (C.z - best.z) * 0.3, 1);
    else blzSeek(p, C.x + (p.x > C.x ? 4 : -4), C.z + d * 6, 0.9);
    p.wt = blzDist(p, C) < 12;
    return;
  }
  if (p.eng) return;
  // take the angle: the first point on his line you can get to in time
  // (each pursuer a touch different, so they don't all arrive as one lump)
  const dist = blzDist(p, C);
  const mySp = p.spd * (p.turbo > 0.1 || blzOnFire(p.team) ? 1.3 : 1) * (0.9 + 0.1 * (blitz.cfg.smart || 1));
  let lead = 0;
  for (let t = 0; t <= 2.6; t += 0.1) {
    lead = t;
    if (Math.hypot(C.x + C.vx * t - p.x, C.z + C.vz * t - p.z) <= mySp * t + 0.6) break;
  }
  const lane = ((BLZ_DEF_POS.indexOf(p.pos) + BLZ_OFF_POS.indexOf(p.pos) + 3) % 5 - 2) * Math.min(1.2, dist * 0.08);
  blzSeek(p, C.x + C.vx * lead + lane, C.z + C.vz * lead, 1);
  p.wt = dist < 16;
  if (!blzHuman(p.team) && dist < 2.3 && dist > 1.0 && C.y < 0.3 && Math.random() < dt * 2.2 * (blitz.cfg.smart || 1)) blzDive(p);
}

function blzLooseAI(p) {
  const B = blitz.ball;
  const d = Math.hypot(p.x - B.x, p.z - B.z);
  // everyone close dives in; from far away, your team's two nearest still go
  let rank = 0;
  for (const q of blitz.players) if (q.team === p.team && q !== p && Math.hypot(q.x - B.x, q.z - B.z) < d) rank++;
  if (d < 16 || rank < 2) { blzSeek(p, B.x + B.vx * 0.3, B.z + B.vz * 0.3, 1); p.wt = true; }
  else { p.wx *= 0.5; p.wz *= 0.5; }
}

// ---- the human --------------------------------------------------------------------------------
function blzHumanControl(p, dt) {
  const w = blzStickWorld();
  p.wx = w.x; p.wz = w.z; p.wt = blzTurboHeld();
  const ph = blitz.phase;
  if (ph === 'pre') {
    // defenders can creep around before the snap (but stay onside); the offense holds still
    if (p.team === blitz.poss) { p.wx = 0; p.wz = 0; p.wt = false; return; }
    const d = blzDir(blitz.poss);
    if ((p.z - blitz.los) * d < 1 && p.wz * d < 0) p.wz = 0;
    return;
  }
  // the QB's eyes follow the stick
  if (p === blitz.carrier && blitz.pocket && p.pos === 'QB') {
    blitz.target = blzAimTarget(p) || blitz.target;
  }
  // a receiver you aren't steering homes on the ball (assist)
  const B = blitz.ball;
  if (B.st === 'air' && B.kind === 'pass' && p === blitz.target && w.m < 0.2) blzSeek(p, B.tx, B.tz, 1);
  // the returner fields it himself (as in the original) — you get him after the catch
  if ((B.st === 'air' || B.st === 'tee' || (blitz.kind === 'punt' && !blitz.carrier && B.st === 'held')) && p === blitz.returner) {
    if (B.st === 'air') blzSeek(p, B.tx, B.tz, 1); else { p.wx = 0; p.wz = 0; }
    p.wt = B.st === 'air';
  }
  // a run play: the back rides his path until he has the ball, unless you steer
  if (blitz.kind === 'run' && blitz.pocket && p.pos === 'RB' && w.m < 0.2) blzRunRoute(p);
}

// ---- physics ------------------------------------------------------------------------------------
function blzMove(p, dt) {
  if (p.tryCd > 0) p.tryCd -= dt;
  if (p.lateCd > 0) p.lateCd -= dt;
  if (p.noEngT > 0) p.noEngT -= dt;
  if (p.spinCd > 0) p.spinCd -= dt;
  if (p.celebT > 0) p.celebT -= dt;
  if (p.throwT > 0) p.throwT -= dt;
  if (p.downT > 0) {
    p.downT -= dt;
    p.vx *= Math.max(0, 1 - dt * 5); p.vz *= Math.max(0, 1 - dt * 5);
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.y = Math.max(0, p.y - dt * 4);
    return;
  }
  if (p.diveT > 0) {
    p.diveT -= dt;
    p.x += p.vx * dt; p.z += p.vz * dt;
    if (p.diveT <= 0) { p.downT = 0.75; p.vx *= 0.3; p.vz *= 0.3; }
    return;
  }
  const human = p === blitz.ctl && blzHuman(p.team);
  let sp = p.spd;
  // turbo: the human spends the team meter; the CPU spends its own legs
  const fire = blzOnFire(p.team) || (blitz.codes.inf && p.team === 0);
  const moving = Math.hypot(p.wx, p.wz) > 0.2;
  let tOn = false;
  if (p.wt && moving) {
    if (human) { if (fire || blitz.turbo[0] > 0.02) { tOn = true; if (!fire) blitz.turbo[0] = Math.max(0, blitz.turbo[0] - dt * (blitz.codes.inf ? 0 : 0.36)); } }
    else if (fire || p.turbo > 0.05) { tOn = true; if (!fire) p.turbo = Math.max(0, p.turbo - dt * 0.4); }
  }
  if (!tOn) { if (human) blitz.turbo[0] = Math.min(1, blitz.turbo[0] + dt * 0.22); else p.turbo = Math.min(1, p.turbo + dt * 0.25); }
  p.turboOn = tOn;
  if (tOn) sp *= 1.36;
  if (fire) sp *= 1.06;
  if (blitz.codes.speed) sp *= 1.1;
  if (p.eng) sp *= 0.12;
  if (p.stunT > 0) { p.stunT -= dt; sp *= 0.45; }
  if (p.spinT > 0) { p.spinT -= dt; sp *= 0.85; }
  if (p.stiffT > 0) p.stiffT -= dt;
  if (p === blitz.carrier) sp *= 0.95;
  if (blitz.phase === 'dead' || blitz.phase === 'wait') sp *= human ? 0.8 : 0.4;
  // the rubber band (Blitz always had one): the CPU finds a gear when it's losing
  if (!blitz.codes.noassist && p.team === 1 && !blitz.auto) {
    const diff = blitz.score[0] - blitz.score[1];
    if (diff >= 10) sp *= 1.04; else if (diff <= -14) sp *= 0.97;
  }
  const tvx = p.wx * sp, tvz = p.wz * sp;
  const a = Math.min(1, (p.jumpT > 0 ? 1.5 : 9) * dt);
  p.vx += (tvx - p.vx) * a; p.vz += (tvz - p.vz) * a;
  p.x += p.vx * dt; p.z += p.vz * dt;
  const v = Math.hypot(p.vx, p.vz);
  if (v > 0.6) { p.fx += (p.vx / v - p.fx) * Math.min(1, dt * 12); p.fz += (p.vz / v - p.fz) * Math.min(1, dt * 12); const m = Math.hypot(p.fx, p.fz) || 1; p.fx /= m; p.fz /= m; }
  p.anim += v * dt * 1.5;
  if (p.jumpT > 0) {
    p.jumpT -= dt;
    const u = 1 - p.jumpT / 0.62;
    p.y = p.jumpT > 0 ? Math.sin(Math.PI * u) * 1.25 : 0;
  } else p.y = 0;
  // the stands are not in play (for anyone but the ball carrier, who just goes out)
  if (p !== blitz.carrier) { p.x = blzClamp(p.x, -3, BLZ_WID + 3); p.z = blzClamp(p.z, -2, BLZ_LEN + 2); }
}

// ---- blocking -----------------------------------------------------------------------------------
function blzBlocks(dt) {
  const C = blitz.carrier;
  for (const p of blitz.players) {
    if (!p.eng) continue;
    const q = p.eng;
    if (q.eng !== p || q.downT > 0 || p.downT > 0 || q === C || p === C) { p.eng = null; if (q.eng === p) q.eng = null; continue; }
    // the pair leans toward the rusher's goal; the rusher works to shed
    if (p.engBlk) continue; // process each pair once, from the side being blocked
    const defSide = p, blk = q;
    let rate = 1;
    if (defSide === blitz.ctl && blzHuman(defSide.team) && blzTurboHeld()) rate = 2.6;
    if (blzOnFire(defSide.team)) rate *= 1.8;
    defSide.shedT -= dt * rate;
    const want = Math.hypot(defSide.wx, defSide.wz);
    const push = 1.2 * Math.min(1, want + 0.3) * (defSide.str / Math.max(0.5, blk.str));
    const ux = defSide.wx / (want || 1), uz = defSide.wz / (want || 1);
    defSide.x += ux * push * dt; defSide.z += uz * push * dt;
    const dx = blk.x - defSide.x, dz = blk.z - defSide.z, dd = Math.hypot(dx, dz) || 1;
    blk.x = defSide.x + dx / dd * 0.95; blk.z = defSide.z + dz / dd * 0.95;
    blk.vx = defSide.vx = ux * push; blk.vz = defSide.vz = uz * push;
    if (defSide.shedT <= 0) {
      defSide.eng = null; blk.eng = null;
      blk.noEngT = 1.3; blk.stunT = 0.35;
      // a shed can leave the blocker on the turf
      if (Math.random() < 0.25) blk.downT = 0.8;
    }
  }
  // new engagements
  for (const o of blitz.players) {
    if (!o.block || o.eng || o.noEngT > 0 || o.downT > 0 || o === C) continue;
    for (const q of blitz.players) {
      if (q.team === o.team || q.eng || q.downT > 0 || q.diveT > 0 || q === C) continue;
      if (Math.hypot(q.x - o.x, q.z - o.z) > 1.15) continue;
      // in coverage before the throw, receivers aren't blocked
      if (blitz.pocket && blitz.kind === 'pass' && (q.role === 'man' || q.role === 'zone' || q.role === 'deep')) continue;
      o.eng = q; q.eng = o; o.engBlk = true; q.engBlk = false;
      const lineman = q.pos === 'DE1' || q.pos === 'DT' || q.pos === 'DE2';
      let base = blitz.pocket ? (lineman ? 1.45 : 0.7) : (blitz.kind === 'kick' || blitz.kind === 'punt' ? 0.65 : 0.8);
      base *= blzClamp(o.str / q.str, 0.6, 1.6) * blzRnd(0.75, 1.25);
      q.shedT = base;
      break;
    }
  }
}

// ---- tackling ------------------------------------------------------------------------------------
function blzTackles(dt) {
  const C = blitz.carrier;
  if (!C || C.downT > 0) return;
  for (const q of blitz.players) {
    if (q.team === C.team || q.downT > 0 || q.tryCd > 0) continue;
    const d = Math.hypot(q.x - C.x, q.z - C.z);
    const reach = q.diveT > 0 ? 1.45 : q.eng ? 0.75 : 1.0;
    if (d > reach) continue;
    q.tryCd = 0.45;
    // a hurdle clears a dive
    if (C.y > 0.55 && q.diveT > 0) { blzFeed('HURDLED!', '#bfe8ff'); blzSay(blzPick(BLZ_CALLS.hurdle)); continue; }
    if (C.stiffT > 0 && q.diveT <= 0 && Math.random() < 0.7) {
      q.downT = 1.0; q.vx = C.fx * 4; q.vz = C.fz * 4;
      blzFeed('STIFF ARM!', '#bfe8ff'); blzSfx('hit');
      if (Math.random() < 0.4) blzSay(blzPick(BLZ_CALLS.stiff));
      continue;
    }
    // a MONSTER HIT is a turbo collision that's actually closing on him
    const close = d > 0.01 ? ((q.vx - C.vx) * (C.x - q.x) + (q.vz - C.vz) * (C.z - q.z)) / d : 0;
    const big = q.turboOn && close > 7.6;
    let p = 0.6 + (q.str - C.str) * 0.38;
    if (q.diveT > 0) p = 0.84;
    if (big) p = 0.9;
    if (q.eng) p *= 0.5;
    if (C.spinT > 0) p *= 0.18;
    if (blzOnFire(C.team)) p *= 0.75;
    if (blzOnFire(q.team)) p = Math.min(0.97, p * 1.2);
    // the band: a leading CPU ballcarrier gets a little slipperier the other way
    if (!blitz.codes.noassist && !blitz.auto) {
      const diff = blitz.score[0] - blitz.score[1];
      if (C.team === 1 && diff >= 10) p *= 0.9;
      if (C.team === 0 && diff <= -14) p *= 0.92;
    }
    if (Math.random() < blzClamp(p, 0.06, 0.97)) { blzTackle(C, q, big); return; }
    // broken tackle
    q.stunT = 0.6;
    if (Math.random() < 0.5) q.downT = 0.6;
    C.stunT = 0.3;
    blzFeed(C.spinT > 0 ? 'SPIN MOVE!' : 'BROKEN TACKLE!', '#bfe8ff');
    if (C.spinT > 0 && Math.random() < 0.4) blzSay(blzPick(BLZ_CALLS.spin));
  }
}

function blzTackle(C, q, big) {
  if (big) blzEv('big');
  const d = blzDir(C.team);
  C.downT = 1.4;
  // a big hit sends him flying
  const fly = big ? 7 : 2.5;
  const qs = Math.hypot(q.vx, q.vz) || 1;
  C.vx = q.vx / qs * fly; C.vz = q.vz / qs * fly;
  if (big) {
    C.y = 0.8;
    blitz.shakeT = 0.32; blitz.shakeMag = 6; blitz.hitStop = 0.09;
    blzSfx('crunch'); blzRoar(0.9, 1.4);
    blzBurst(C.x, C.z, 1.4, 14, '#fff6a8');
    if (blitz.stats && blzHuman(q.team)) { blitz.stats.hits++; blzEarn(2, 'MONSTER HIT'); }
    if (Math.random() < 0.5) blzSay(blzPick(BLZ_CALLS.hit));
  } else blzSfx('hit');
  if (q.diveT <= 0 && !big) { q.downT = 0.7; q.vx *= 0.3; q.vz *= 0.3; }
  // fumbles happen on big hits (and the occasional blindside)
  const fumP = big ? (C.pos === 'QB' && blitz.pocket ? 0.07 : 0.035) : 0.006;
  if (Math.random() < fumP && !(blzOnFire(C.team))) {
    C.downT = 1.2;
    blzFumble(C, q);
    return;
  }
  // sack?
  const behind = (C.z - blitz.los) * d < 0;
  const sack = C.pos === 'QB' && blitz.kind === 'pass' && !blitz.thrown && blitz.pocket;
  blzWhistle('tackle', { who: C, by: q, sack: sack && behind, big });
}

// LATE HITS: anyone, anytime after the whistle, no flag ever thrown
function blzLateHit(me) {
  if (me.lateCd > 0 || me.downT > 0) return;
  let v = null, bd = 2.2;
  for (const p of blitz.players) {
    if (p.team === me.team || p === me) continue;
    const d = blzDist(p, me);
    if (d < bd) { bd = d; v = p; }
  }
  me.lateCd = 1.2;
  if (!v) { if (blzHuman(me.team)) me.jumpT = 0.62; return; }
  const dx = v.x - me.x, dz = v.z - me.z, m = Math.hypot(dx, dz) || 1;
  v.downT = Math.max(v.downT, 1.3); v.vx = dx / m * 6; v.vz = dz / m * 6; v.y = 0.6;
  me.vx = dx / m * 4; me.vz = dz / m * 4;
  blitz.shakeT = 0.22; blitz.shakeMag = 4;
  blzSfx('crunch'); blzRoar(0.8, 1.2);
  blzBurst(v.x, v.z, 1.2, 10, '#ffb0a0');
  blzBanner('LATE HIT!', '#ff5a3a', 'NO FLAG', 0.9);
  blzSay(blzPick(BLZ_CALLS.late));
  if (blitz.stats && blzHuman(me.team)) { blitz.stats.late++; blzEarn(1, 'LATE HIT'); }
}

// ---- the whistle --------------------------------------------------------------------------------
function blzWhistle(type, info) {
  if (blitz.phase !== 'live') return;
  blitz.phase = 'dead';
  blitz.deadT = type === 'td' ? 2.6 : type === 'inc' ? 1.2 : 1.7;
  blitz.dead = Object.assign({ type }, info);
  if (type !== 'td') blzSfx('whistle');
  const Bd = blitz.ball;
  if (Bd && (Bd.st === 'air' || Bd.st === 'loose')) { Bd.st = 'dead'; Bd.y = Math.min(Bd.y, 0.2); }
  if (type === 'inc') blitz.fire[blitz.poss].n = 0;
  const C = info.who || blitz.carrier;
  if (type === 'tackle' || type === 'oob') {
    const team = type === 'oob' && info.team != null ? info.team : C.team;
    blitz.dead.team = team;
    blitz.dead.z = info.z != null ? info.z : C.z;
    blitz.dead.x = info.x != null ? info.x : C.x;
    // a ball carrier down in his own end zone
    const inOwnEZ = (blitz.dead.z - blzOwnGoal(team)) * blzDir(team) <= 0;
    if (inOwnEZ) {
      if (blitz.ezCatch) blitz.dead.type = 'touchback';
      else blitz.dead.type = 'safety';
    }
    if (info.sack && blitz.dead.type === 'tackle') {
      blzEv('sack' + (1 - team));
      blzBanner('SACK!', '#ff8a3a', '', 1.1);
      blzSay(blzPick(BLZ_CALLS.sack), true);
      blzRoar(0.8, 1.4);
      const dteam = 1 - team;
      if (blzHuman(dteam)) { blitz.stats.sacks++; blzEarn(4, 'SACK'); }
      blzDefStop(dteam);
    }
  }
  // a tackle for loss counts as a stop too
  if (type === 'tackle' && !info.sack && C && C.team === blitz.poss && (blitz.dead.z - blitz.los) * blzDir(C.team) < 0 && blitz.kind === 'run') blzDefStop(1 - C.team);
}
function blzDefStop(team) {
  const F = blitz.fire[team];
  F.stops++;
  if (!F.on && F.stops >= 3) blzIgnite(team, null);
  blitz.fire[1 - team].n = 0;
}

function blzTouchdown(C) {
  const team = C.team;
  blzWhistle('td', { team, who: C });
  C.celebT = 3;
  blzSfx('td'); blzRoar(1, 3);
  blzConfetti(C.x, C.z, team);
  if (blitz.pat2) { blzBanner('2 POINTS!', '#ffd23a', C.name, 1.6); blzSay('two points!', true); return; }
  blitz.score[team] += 6;
  blzBanner('TOUCHDOWN!', '#ffd23a', C.name, 2.2);
  blzSay(blzPick(BLZ_CALLS.td), true);
  const gain = Math.round((C.z - blitz.startZ) * blzDir(team));
  blitz.stats.log.push([team, blitz.kind, gain, Math.round(blitz.startZ), blitz.ball && blitz.ball.lastTeam != null ? 'L' + blitz.ball.lastTeam : '']);
  if (blzHuman(team)) { blitz.stats.tds++; blzEarn(25, 'TOUCHDOWN'); if (gain > blitz.stats.long) blitz.stats.long = gain; }
  // the other side's fire goes out when you score on them
  blzDouse(1 - team);
}

// After the dead-ball pause: spot it, count the down, decide what's next.
function blzAfterDead() {
  const D = blitz.dead || { type: 'inc' };
  const off = blitz.poss, d = blzDir(off);
  const fireTick = () => {
    for (const t of [0, 1]) { const F = blitz.fire[t]; if (F.on && ++F.plays > 9) blzDouse(t); }
  };
  fireTick();
  if (D.type === 'td') {
    // (a defensive return on a two-point try is worth two to the defense, as it should be)
    if (blitz.pat2) { blitz.score[D.team] += 2; if (blzHuman(D.team)) blzEarn(8, '2-POINT'); blitz.pat2 = false; blzNext({ kick: off }); return; }
    blzToPat(D.team);
    return;
  }
  if (blitz.pat2) { blitz.pat2 = false; blzFeed('NO GOOD', '#bfc6ff'); blzNext({ kick: off }); return; }
  if (D.type === 'fgGood') {
    if (D.pat) { blitz.score[off] += 1; if (blzHuman(off)) blzEarn(3, 'EXTRA POINT'); }
    else { blitz.score[off] += 3; if (blzHuman(off)) blzEarn(10, 'FIELD GOAL'); blzDouse(1 - off); }
    blzNext({ kick: off });
    return;
  }
  if (D.type === 'fgMiss') {
    if (D.pat) { blzNext({ kick: off }); return; }
    // the other side takes over at the spot of the kick (or their 20)
    const np = 1 - off, spot = blitz.los - d * 7;
    const own20 = blzOwnGoal(np) + blzDir(np) * 20;
    blzChange(np, (spot - own20) * blzDir(np) > 0 ? spot : own20);
    blzNext({ call: true });
    return;
  }
  if (D.type === 'safety') {
    const scorer = 1 - D.team;
    blitz.score[scorer] += 2;
    blzBanner('SAFETY!', '#ff8a3a', '', 1.4); blzSay('safety!', true); blzRoar(0.9, 1.6);
    if (blzHuman(scorer)) blzEarn(10, 'SAFETY');
    blzNext({ free: D.team });
    return;
  }
  if (D.type === 'touchback') {
    const t = D.team;
    blzChange(t, blzOwnGoal(t) + blzDir(t) * 20);
    blzFeed('TOUCHBACK', '#bfc6ff');
    blzNext({ call: true });
    return;
  }
  if (D.type === 'inc') {
    if (blitz.kind === 'punt' || blitz.kind === 'kick') { blzNext({ call: true }); return; }
    blzNextDown(blitz.los);
    return;
  }
  // tackle / oob: who has it, and where
  const team = D.team != null ? D.team : off;
  const spot = blzClamp(D.z, 10.5, 109.5);
  blitz.ballX = blzClamp(D.x != null ? D.x : blitz.ballX, 19.5, BLZ_WID - 19.5);
  if (blitz.kind === 'kick' || blitz.kind === 'punt' || team !== off) {
    // a return or a turnover: new set of downs for whoever's holding it
    if (team !== off && blitz.kind !== 'kick' && blitz.kind !== 'punt') {
      blzFeed('TURNOVER', '#ff8a3a');
    }
    blzChange(team, spot);
    blzNext({ call: true });
    return;
  }
  const gain = Math.round((spot - blitz.los) * d);
  if (blzHuman(off)) {
    blitz.stats.yds += gain;
    if (gain > blitz.stats.long) blitz.stats.long = gain;
    if (gain >= 25) blzEarn(4, gain + ' YD PLAY');
  }
  blzNextDown(spot);
}

function blzNextDown(spot) {
  const off = blitz.poss, d = blzDir(off);
  if ((spot - blitz.firstAt) * d >= 0) {
    blitz.los = spot; blitz.down = 1;
    blitz.firstAt = blzFirstAt(off, spot);
    blzBanner('FIRST DOWN', '#ffd23a', '', 1.0);
    if (Math.random() < 0.7) blzSay(blzPick(BLZ_CALLS.first));
    if (blzHuman(off)) blzEarn(2, '');
    blitz.fire[1 - off].stops = 0;
    blzNext({ call: true });
    return;
  }
  blitz.los = spot;
  blitz.down++;
  if (blitz.down > 4) {
    blzBanner('TURNOVER ON DOWNS', '#ff8a3a', '', 1.3);
    blzDefStop(1 - off);
    blzChange(1 - off, spot);
  }
  blzNext({ call: true });
}

function blzFirstAt(team, spot) {
  const d = blzDir(team), f = spot + d * BLZ_FIRST, g = blzGoal(team);
  return (f - g) * d >= 0 ? g : f;
}
function blzChange(team, spot) {
  blitz.poss = team; blitz.los = spot; blitz.down = 1;
  blitz.firstAt = blzFirstAt(team, spot);
}

// Next step, but quarters end between plays.
function blzNext(what) {
  blitz.pending = what;
  blzAfter(blitz.deadT > 0 ? 0.05 : 0.2, () => blzRunPending());
}
function blzRunPending() {
  const what = blitz.pending || { call: true };
  blitz.pending = null;
  if (blitz.ot && blitz.score[0] !== blitz.score[1]) { blzFinal(); return; }
  if (blitz.clock <= 0) { blzEndQuarter(what); return; }
  if (what.kick != null) { blzSetupKickoff(what.kick, false); return; }
  if (what.free != null) { blzSetupKickoff(what.free, true); return; }
  blzToCall();
}

function blzEndQuarter(what) {
  const q = blitz.q;
  blzSfx('horn');
  if (q === 2) {
    blzBanner('HALFTIME', '#bfe8ff', blzTeam(0).abbr + ' ' + blitz.score[0] + '  ' + blzTeam(1).abbr + ' ' + blitz.score[1], 2);
    blitz.q = 3; blitz.clock = BLZ_QLEN;
    blzAfter(1.8, () => blzSetupKickoff(1 - blitz.openKicker, false));
    return;
  }
  if (q >= 4) {
    if (blitz.score[0] === blitz.score[1] && !blitz.ot) {
      blitz.ot = true; blitz.q = 5; blitz.clock = Math.round(BLZ_QLEN * 0.8);
      blzBanner('OVERTIME', '#ffd23a', 'SUDDEN DEATH', 2);
      blzAfter(1.8, () => blzSetupKickoff(Math.random() < 0.5 ? 0 : 1, false));
      return;
    }
    blzFinal();
    return;
  }
  blzBanner('END OF ' + blzOrd(q) + ' QUARTER', '#bfe8ff', '', 1.4);
  blitz.q = q + 1; blitz.clock = BLZ_QLEN;
  blzAfter(1.4, () => {
    if (what.kick != null) blzSetupKickoff(what.kick, false);
    else if (what.free != null) blzSetupKickoff(what.free, true);
    else blzToCall();
  });
}

// ---- PAT ------------------------------------------------------------------------------------
function blzToPat(team) {
  // overtime is sudden death: the touchdown ends it
  if (blitz.ot) { blzFinal(); return; }
  blitz.poss = team;
  blitz.los = blzGoal(team) - blzDir(team) * 3; blitz.ballX = BLZ_MID; blitz.down = 1;
  blitz.firstAt = blzGoal(team);
  if (blzHuman(team)) { blitz.phase = 'pat'; blitz.callSel = 0; blitz.callT = 0; return; }
  // the CPU goes for two when the math says so
  const lead = blitz.score[team] - blitz.score[1 - team];
  const two = blitz.q >= 4 && [-1, -5, 1, -2, -10].includes(lead) && Math.random() < 0.8;
  blzPatChoose(two ? 2 : 1);
}
function blzPatChoose(n) {
  const team = blitz.poss;
  if (n === 2) {
    blitz.pat2 = true;
    blzBanner('GO FOR TWO', '#ffd23a', '', 1.0);
    blzAfter(0.6, () => blzToCall());
  } else {
    blzSpecial('pat');
  }
}

// ---- field goals -----------------------------------------------------------------------------
function blzKickFG() {
  const F = blitz.fg, off = blitz.poss, d = blzDir(off);
  F.kicked = true;
  const B = blitz.ball;
  const postZ = blzGoal(off) + d * 10;
  const miss = F.good ? 0 : (Math.random() < 0.5 ? -1 : 1);
  const short = !F.good && F.dist > 48 && Math.random() < 0.5;
  B.st = 'air'; B.kind = 'fg';
  B.x0 = blitz.ballX; B.z0 = blitz.los - d * 7; B.y0 = 0.3;
  B.tx = BLZ_MID + (miss ? miss * blzRnd(3.8, 6.5) : blzRnd(-2.4, 2.4)); B.tz = short ? postZ - d * 3 : postZ;
  B.ty = short ? 2.2 : blzRnd(5, 8);
  const dist = Math.abs(B.tz - B.z0);
  B.t = 0; B.T = dist / 21; B.peak = 3 + dist * 0.12;
  blzSfx('kick');
}
function blzFGResult() {
  const F = blitz.fg;
  if (!F || F.done) return;
  F.done = true;
  if (F.good) { blzBanner("IT'S GOOD!", '#ffd23a', '', 1.2); blzSay(BLZ_CALLS.good[0], true); blzSfx('good'); blzRoar(0.8, 1.5); }
  else { blzBanner('NO GOOD!', '#ff8a7a', '', 1.2); blzSay(BLZ_CALLS.nogood[0], true); blzSfx('bad'); }
  blitz.phase = 'live';
  blzWhistle(F.good ? 'fgGood' : 'fgMiss', { pat: blitz.kind === 'pat' });
  blitz.deadT = 1.4;
}

// ---- the main update ---------------------------------------------------------------------------
function blitzUpdate(dt) {
  blitz.t += dt;
  if (blitz.hitStop > 0) { blitz.hitStop -= dt; return; }
  if (blitz.shakeT > 0) blitz.shakeT -= dt;
  if (blitz.flashT > 0) blitz.flashT -= dt;
  if (blitz.banner) { blitz.banner.t += dt; if (blitz.banner.t > blitz.banner.T) blitz.banner = null; }
  for (const f of blitz.feed) f.t -= dt;
  blitz.feed = blitz.feed.filter((f) => f.t > 0);
  blzParts(dt);
  const ph = blitz.phase;
  if (ph === 'vs') { blitz.vsT += dt; if (blitz.codeMsg) { blitz.codeMsg.t -= dt; if (blitz.codeMsg.t <= 0) blitz.codeMsg = null; } return; }
  if (ph === 'final') { blitz.finalT += dt; blzSim(dt); return; }
  if (ph === 'call' || ph === 'pat') {
    blitz.callT += dt;
    // the play clock: Blitz picks for you if you dawdle
    if (ph === 'call' && blitz.callT > 15) blzChoose(blitz.callSel);
    blzCam(dt);
    return;
  }
  if (ph === 'wait') {
    blitz.waitT -= dt;
    blzSim(dt);
    if (blitz.waitT <= 0) { const fn = blitz.waitFn; blitz.waitFn = null; if (fn) fn(); }
    return;
  }
  if (ph === 'pre') {
    blitz.playT += dt;
    blzSim(dt);
    if (blitz.playT >= blitz.snapAt) blzSnap();
    return;
  }
  if (ph === 'dead') {
    blitz.deadT -= dt;
    blzSim(dt);
    if (blitz.deadT <= 0) blzAfterDead();
    return;
  }
  if (ph === 'live') blzLive(dt);
}

// players + camera, without rules
function blzSim(dt) {
  for (const p of blitz.players) {
    if (p === blitz.ctl && blzHuman(p.team) && blitz.phase !== 'final') blzHumanControl(p, dt);
    else blzThink(p, dt);
  }
  for (const p of blitz.players) blzMove(p, dt);
  blzSeparate(dt);
  blzBallUpdate(dt);
  blzCam(dt);
}

function blzLive(dt) {
  blitz.playT += dt;
  const scrimmage = blitz.kind === 'pass' || blitz.kind === 'run';
  if (blitz.clock > 0) { blitz.clock -= dt; if (blitz.clock < 0) blitz.clock = 0; }
  // kickoff run-up
  const B = blitz.ball;
  if (blitz.kind === 'kick' && B.st === 'tee') {
    const kicker = blitz.players.find((p) => p.role === 'kicker');
    if (kicker && (Math.hypot(kicker.x - B.x, kicker.z - B.z) < 1.1 || blitz.playT > 2.2)) {
      blzKickTheBall();
      // coverage releases
      for (const p of blitz.players) p.react = p.team === blitz.poss ? 0 : blzRnd(0, 0.15);
    }
  }
  // punts and kicks from scrimmage
  if (blitz.kind === 'punt' && blitz.punt && !blitz.punt.kicked) {
    const pu = blzByPos(blitz.poss, 'QB');
    if (blitz.playT > 0.4) { B.x = pu.x; B.z = pu.z; B.y = 1; }
    if (blitz.playT > 1.1) {
      blitz.punt.kicked = true;
      const d = blzDir(blitz.poss), dist = blzRnd(36, 47);
      B.st = 'air'; B.kind = 'punt';
      B.x0 = pu.x; B.z0 = pu.z; B.y0 = 1;
      B.tx = blzClamp(BLZ_MID + blzRnd(-12, 12), 5, BLZ_WID - 5); B.tz = blzClamp(pu.z + d * dist, 2, BLZ_LEN - 2); B.ty = 1.6;
      B.t = 0; B.T = 3.0; B.peak = 17;
      blzSfx('kick');
      if (blzHuman(blitz.poss)) blitz.ctl = blzByPos(blitz.poss, 'WR1');
    }
  }
  if ((blitz.kind === 'fg' || blitz.kind === 'pat') && blitz.fg && !blitz.fg.kicked) {
    const d = blzDir(blitz.poss);
    if (blitz.playT > 0.35) { B.x = blitz.ballX; B.z = blitz.los - d * 7; B.y = 0.3; }
    if (blitz.playT > 1.0) blzKickFG();
  }
  blzSim(dt);
  if (blitz.phase !== 'live') return;
  const C = blitz.carrier;
  // run play: the handoff
  if (scrimmage && blitz.kind === 'run' && blitz.pocket && C && C.pos === 'QB') {
    const rb = blzByPos(blitz.poss, 'RB');
    if (rb && (blzDist(rb, C) < 1.6 || blitz.playT > 0.95)) {
      blitz.carrier = rb; blitz.pocket = false; blitz.handed = true;
      if (blzHuman(rb.team)) blitz.ctl = rb;
    }
  }
  // a QB who crosses the line is a runner now
  if (C && blitz.pocket && C.pos === 'QB' && (C.z - blitz.los) * blzDir(C.team) > 0.5) blitz.pocket = false;
  blzBlocks(dt);
  blzTackles(dt);
  if (blitz.phase !== 'live') return;
  const C2 = blitz.carrier;
  if (C2 && C2.downT <= 0) {
    const d = blzDir(C2.team);
    if ((C2.z - blzGoal(C2.team)) * d >= 0) { blzTouchdown(C2); return; }
    if (C2.x < 0 || C2.x > BLZ_WID) { blzWhistle('oob', { who: C2, z: C2.z, x: C2.x }); return; }
    // a returner who stands in his end zone kneels it
    if (blitz.ezCatch && blzHuman(C2.team) && C2 === blitz.ctl && Math.hypot(C2.vx, C2.vz) < 0.4 && blitz.playT > 4.5 &&
      (C2.z - blzOwnGoal(C2.team)) * d < 0) { blzWhistle('touchback', { team: C2.team }); return; }
  }
}

// keep nuggets from standing inside each other
function blzSeparate(dt) {
  const P = blitz.players;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    if (a.downT > 0) continue;
    for (let j = i + 1; j < P.length; j++) {
      const b = P[j];
      if (b.downT > 0 || a.eng === b) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d > 0.75 || d < 1e-4) continue;
      const push = (0.75 - d) * 0.5;
      a.x -= dx / d * push; a.z -= dz / d * push;
      b.x += dx / d * push; b.z += dz / d * push;
    }
  }
}

function blzCamSnap(dir, fx, fz) {
  const c = blitz.cam;
  c.dir = dir; c.z = fz - dir * BLZ_CAM.back; c.x = BLZ_MID + (fx - BLZ_MID) * 0.72;
  blitz.camFlipT = 0;
}
function blzCam(dt) {
  const c = blitz.cam, B = blitz.ball, C = blitz.carrier, ph = blitz.phase;
  let fx = BLZ_MID, fz = blitz.los;
  if (ph === 'call' || ph === 'pre' || ph === 'pat') { fx = blitz.ballX; fz = blitz.los + c.dir * 3; }
  else if (C) { fx = C.x; fz = C.z + c.dir * 2; }
  else if (B) {
    fx = B.x; fz = B.z;
    if (B.st === 'air' && (B.kind === 'kick' || B.kind === 'punt')) fz = B.z + (B.tz - B.z) * 0.35;
  }
  // a carrier running at the camera: swing around behind him (the Blitz wipe)
  if (C && ph === 'live' && blzDir(C.team) !== c.dir && blitz.camFlipT <= 0 && C.downT <= 0) {
    if ((C.flipWait = (C.flipWait || 0) + dt) > 0.25) { blitz.camFlipT = 0.34; blitz.camFlipDone = false; }
  }
  if (blitz.camFlipT > 0) {
    blitz.camFlipT -= dt;
    if (!blitz.camFlipDone && blitz.camFlipT < 0.17) {
      blitz.camFlipDone = true;
      c.dir = -c.dir;
      c.z = fz - c.dir * BLZ_CAM.back;
      c.x = BLZ_MID + (fx - BLZ_MID) * 0.7;
      for (const p of blitz.players) p.flipWait = 0;
    }
  }
  const tz = fz - c.dir * BLZ_CAM.back, tx = BLZ_MID + (fx - BLZ_MID) * 0.72;
  const k = Math.min(1, dt * (ph === 'live' ? 5 : 3));
  c.z += (tz - c.z) * k; c.x += (tx - c.x) * Math.min(1, dt * 3);
}

// ---- particles ---------------------------------------------------------------------------------
function blzBurst(x, z, y, n, col) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = blzRnd(2, 6);
    blitz.parts.push({ x, z, y, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: blzRnd(2, 6), t: 0, T: blzRnd(0.35, 0.7), c: col, k: 'spark' });
  }
}
function blzConfetti(x, z, team) {
  const T = blzTeam(team);
  for (let i = 0; i < 40; i++) {
    blitz.parts.push({ x: x + blzRnd(-3, 3), z: z + blzRnd(-3, 3), y: blzRnd(3, 6), vx: blzRnd(-2, 2), vz: blzRnd(-2, 2), vy: blzRnd(2, 6),
      t: 0, T: blzRnd(1.2, 2.2), c: blzPick([T.c1, T.c2, '#ffffff']), k: 'conf' });
  }
}
function blzParts(dt) {
  // flames off anyone on a burning team who's moving, and off the ball
  for (const t of [0, 1]) {
    if (!blzOnFire(t)) continue;
    for (const p of blitz.players) {
      if (p.team !== t || Math.random() > dt * (p === blitz.carrier ? 30 : 6)) continue;
      blitz.parts.push({ x: p.x + blzRnd(-0.4, 0.4), z: p.z + blzRnd(-0.4, 0.4), y: blzRnd(0.3, 1.6), vx: -p.vx * 0.2, vz: -p.vz * 0.2, vy: blzRnd(1.5, 3),
        t: 0, T: blzRnd(0.3, 0.55), c: '#ff8a1e', k: 'fire' });
    }
  }
  const B = blitz.ball;
  if (B && B.st === 'air' && B.kind === 'pass' && B.from && blzOnFire(B.from.team)) {
    for (let i = 0; i < 2; i++) blitz.parts.push({ x: B.x, z: B.z, y: B.y, vx: 0, vz: 0, vy: 1, t: 0, T: 0.35, c: '#ffb020', k: 'fire' });
  }
  for (const q of blitz.parts) {
    q.t += dt;
    q.x += q.vx * dt; q.z += q.vz * dt; q.y += q.vy * dt;
    if (q.k === 'spark') q.vy -= 14 * dt;
    else if (q.k === 'conf') { q.vy -= 4 * dt; q.vx *= 0.98; }
  }
  blitz.parts = blitz.parts.filter((q) => q.t < q.T && q.y > -0.2);
  if (blitz.parts.length > 500) blitz.parts.splice(0, blitz.parts.length - 500);
}

function blzFinal() {
  const s = blitz.score, won = s[0] > s[1], tie = s[0] === s[1];
  blitz.phase = 'final'; blitz.finalT = 0;
  blzSfx('horn');
  if (won) {
    blzEarn(120 + Math.min(35, s[0] - s[1]) * 4, 'WIN');
    if (blitz.cfg.key === 'pro') { try { localStorage.setItem('nugBlitzPro', '1'); } catch (e) { } }
    if (blitz.cfg.key === 'allpro') { try { localStorage.setItem('nugBlitzChamp', '1'); } catch (e) { } }
    blzRoar(1, 3); blzSfx('td');
    for (const p of blitz.players) if (p.team === 0) p.celebT = 6;
    blzSay('what a game! the crunch win it!', true);
  } else if (tie) { blzEarn(40, 'TIE'); blzSay('a tie. nobody is happy.', true); }
  else { blzSfx('bad'); blzSay('the ' + blzTeam(1).name.toLowerCase() + ' win it.', true); }
  try { ArcadeKit.saveBest('blitz', blitz.cfg.key, blitz.earned); } catch (e) { }
  blitz.result = { won, tie, unlock: won && blitz.cfg.key === 'pro', champ: won && blitz.cfg.key === 'allpro' };
}

function stepBlitz(dt, w, h) {
  syncBlitz();
  if (!blitz.on) return;
  if (Math.abs(blitz.cv.width - Math.round(Math.max(240, Math.min(1000, w * BLZ_RES / h)))) > 2) blitzLayout();
  blzPollPad();
  dt = Math.min(dt, 0.05);
  if (!blitz.freeze && !blitz.paused && blitz.phase !== 'tier') blitzUpdate(dt);
  blzDraw();
}

// ---- the VS screen codes ------------------------------------------------------------------------
function blzCodeTap(i) {
  if (blitz.phase !== 'vs') return;
  blitz.codeIn[i] = (blitz.codeIn[i] + 1) % 6;
  blzSfx('select');
}
function blzCodeDir(dirKey) {
  if (blitz.phase !== 'vs') return;
  const k = blitz.codeIn.join('') + dirKey;
  const code = BLZ_CODES.find((c) => c.k === k);
  if (code) {
    blitz.codes[code.id] = true;
    blitz.codeMsg = { text: code.name, t: 2, ok: true };
    blzSfx('code');
    blzSay(code.name.toLowerCase());
  } else if (blitz.codeIn.some((n) => n > 0)) {
    blitz.codeMsg = { text: 'NO CODE', t: 1, ok: false };
  }
  blitz.codeIn = [0, 0, 0];
}

// ==== drawing ===================================================================================
// A real perspective camera, behind the offense, pitched down at the ball.
// Everything is projected per frame onto a ~384-px-tall canvas that CSS
// smooths up to the window: chunky but soft, like the N64 did it.

function blzProj(X, Y, Z) {
  const c = blitz.cam, d = c.dir;
  const dx = (X - c.x) * d, dy = Y - BLZ_CAM.h, dz = (Z - c.z) * d;
  const zc = -dy * c.s + dz * c.c;
  if (zc < 0.5) return null;
  const yc = dy * c.c + dz * c.s;
  const k = blitz.F / zc;
  return { x: blitz.W / 2 + dx * k, y: blitz.cy - yc * k, k, zc };
}
// world z range that's in front of the lens, by camera distance
function blzZAt(dz) { return blitz.cam.z + dz * blitz.cam.dir; }
function blzClipZ(z0, z1, near) {
  const c = blitz.cam, d = c.dir;
  let a = (z0 - c.z) * d, b = (z1 - c.z) * d;
  if (a > b) { const t = a; a = b; b = t; }
  const lo = near == null ? 3 : near, hi = 175;
  if (b < lo || a > hi) return null;
  a = Math.max(a, lo); b = Math.min(b, hi);
  return [blzZAt(a), blzZAt(b)];
}
function blzPoly(g, pts, col) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath(); g.fill();
}
// a flat quad on the ground (or at height y), clipped to the lens
function blzGround(g, x0, x1, z0, z1, col, y) {
  const cl = blzClipZ(z0, z1);
  if (!cl) return;
  y = y || 0;
  const a = blzProj(x0, y, cl[0]), b = blzProj(x1, y, cl[0]), cc = blzProj(x1, y, cl[1]), dd = blzProj(x0, y, cl[1]);
  if (!a || !b || !cc || !dd) return;
  blzPoly(g, [a, b, cc, dd], col);
}
function blzMix(hex, k, to) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(hex), b = p(to || '#ffffff');
  return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',') + ')';
}
function blzHash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

function blzDraw() {
  const g = blitz.g, W = blitz.W, H = blitz.H;
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const ph = blitz.phase;
  if (ph === 'tier' || ph === 'idle') { blzDrawIdle(g, W, H); return; }
  if (ph === 'vs') { blzDrawVS(g, W, H); return; }
  let sx = 0, sy = 0;
  if (blitz.shakeT > 0) { sx = (Math.random() - 0.5) * blitz.shakeMag; sy = (Math.random() - 0.5) * blitz.shakeMag; }
  g.setTransform(1, 0, 0, 1, sx, sy);
  blzDrawWorld(g, W, H);
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (blitz.camFlipT > 0) {
    const u = 1 - Math.abs(blitz.camFlipT - 0.17) / 0.17;
    g.fillStyle = 'rgba(255,255,255,' + (u * 0.9).toFixed(3) + ')';
    g.fillRect(0, 0, W, H);
  }
  blzDrawHud(g, W, H);
  // a banner left over from the last whistle sits UNDER the menus, not on them
  const menu = ph === 'call' || ph === 'pat';
  if (menu) blzDrawBanner(g, W, H);
  if (ph === 'call') blzDrawCall(g, W, H);
  if (ph === 'pat') blzDrawPat(g, W, H);
  if (!menu) blzDrawBanner(g, W, H);
  if (ph === 'final') blzDrawFinal(g, W, H);
  blzDrawTouch(g, W, H);
  if (blitz.paused) {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, W, H);
    blzTextC(g, 'PAUSED', W / 2, H / 2 - 10, 30, '#ffd23a');
    blzTextC(g, 'ESC RESUME · Q QUIT · M SOUND · V ANNOUNCER', W / 2, H / 2 + 18, 10, '#bfc6ff');
  }
}

// text: bold italic with a hard black outline — the Blitz look
function blzText(g, str, x, y, size, col, align, outline) {
  g.font = '900 italic ' + Math.round(size) + 'px Impact, "Arial Black", "Helvetica Neue", sans-serif';
  g.textAlign = align || 'left'; g.textBaseline = 'middle';
  if (outline !== false) { g.lineWidth = Math.max(2, size * 0.18); g.strokeStyle = '#000'; g.lineJoin = 'round'; g.strokeText(str, x, y); }
  g.fillStyle = col; g.fillText(str, x, y);
}
function blzTextC(g, str, x, y, size, col) { blzText(g, str, x, y, size, col, 'center'); }

function blzDrawIdle(g, W, H) {
  g.fillStyle = '#05060c'; g.fillRect(0, 0, W, H);
  blzTextC(g, 'NUGGET BLITZ', W / 2, H * 0.3, 40, '#ffd23a');
}

function blzDrawWorld(g, W, H) {
  const night = !!blitz.codes.night;
  // sky (what little of it the camera sees over the far stands)
  const sky = g.createLinearGradient(0, 0, 0, H * 0.4);
  sky.addColorStop(0, night ? '#02030a' : '#3b6fc4'); sky.addColorStop(1, night ? '#0a0f26' : '#a9c8ef');
  g.fillStyle = sky; g.fillRect(-10, -10, W + 20, H + 20);
  blzDrawStands(g, night);
  // the ground around the field
  blzGround(g, -14, BLZ_WID + 14, -14, BLZ_LEN + 14, night ? '#173a1a' : '#2d6a2e');
  // grass stripes, 5 yards each
  for (let z = 10; z < 110; z += 5) blzGround(g, 0, BLZ_WID, z, z + 5, ((z / 5) | 0) % 2 ? (night ? '#25602a' : '#3c8a37') : (night ? '#2b6c30' : '#45983f'));
  // end zones in the home colors of whoever defends them
  const ez0 = blzTeam(0).ez, ez1 = blzTeam(1).ez;
  blzGround(g, 0, BLZ_WID, 0, 10, ez0);
  blzGround(g, 0, BLZ_WID, 110, 120, ez1);
  blzGroundText(g, blzTeam(0).name, BLZ_MID, 5, 6, '#ffffff', 0.9);
  blzGroundText(g, blzTeam(1).name, BLZ_MID, 115, 6, '#ffffff', 0.9);
  // yard lines, sidelines, goal lines
  const wl = night ? 'rgba(235,240,255,0.85)' : 'rgba(250,250,250,0.92)';
  for (let z = 10; z <= 110; z += 5) blzGround(g, 0, BLZ_WID, z - (z % 10 === 0 ? 0.14 : 0.1), z + (z % 10 === 0 ? 0.14 : 0.1), wl);
  blzGround(g, -0.45, 0, 0, 120, wl); blzGround(g, BLZ_WID, BLZ_WID + 0.45, 0, 120, wl);
  blzGround(g, 0, BLZ_WID, -0.3, 0, wl); blzGround(g, 0, BLZ_WID, 120, 120.3, wl);
  // hash marks
  const cz0 = blitz.cam.z;
  for (let z = 11; z < 110; z++) {
    if (z % 5 === 0) continue;
    if (Math.abs(z - cz0) > 90) continue;
    blzGround(g, 22.9, 23.9, z - 0.07, z + 0.07, wl); blzGround(g, 29.4, 30.4, z - 0.07, z + 0.07, wl);
    blzGround(g, 0.4, 1.2, z - 0.07, z + 0.07, wl); blzGround(g, BLZ_WID - 1.2, BLZ_WID - 0.4, z - 0.07, z + 0.07, wl);
  }
  // the numbers
  for (let z = 20; z <= 100; z += 10) {
    const n = z <= 60 ? z - 10 : 110 - z;
    blzGroundText(g, String(n), 8, z, 3.2, wl, 1);
    blzGroundText(g, String(n), BLZ_WID - 8, z, 3.2, wl, 1);
  }
  // the scrimmage line and the line to gain
  const ph = blitz.phase;
  if (ph === 'call' || ph === 'pre' || (ph === 'live' && blitz.pocket)) {
    blzGround(g, 0, BLZ_WID, blitz.los - 0.22, blitz.los + 0.22, 'rgba(60,120,255,0.85)');
    if (blitz.kind !== 'kick' && blitz.firstAt !== blzGoal(blitz.poss)) blzGround(g, 0, BLZ_WID, blitz.firstAt - 0.22, blitz.firstAt + 0.22, 'rgba(255,220,40,0.9)');
  }
  // what's left of the world, back to front: the far goalpost, people, the ball, sparks
  const items = [];
  for (const p of blitz.players) {
    const P = blzProj(p.x, 0, p.z);
    if (P) items.push({ zc: P.zc, k: 'p', p, P });
  }
  const B = blitz.ball;
  if (B && !(B.st === 'held' && blitz.carrier)) { const P = blzProj(B.x, 0, B.z); if (P) items.push({ zc: P.zc - 0.05, k: 'b', P }); }
  for (const q of blitz.parts) { const P = blzProj(q.x, q.y, q.z); if (P) items.push({ zc: P.zc, k: 'q', q, P }); }
  for (const gz of [0, 120]) { const P = blzProj(BLZ_MID, 0, gz); if (P) items.push({ zc: P.zc + 0.5, k: 'g', z: gz }); }
  items.sort((a, b) => b.zc - a.zc);
  // shadows first, so nobody stands on somebody's shadow
  for (const it of items) if (it.k === 'p') blzShadow(g, it.p, it.P);
  for (const it of items) {
    if (it.k === 'p') blzDrawPlayer(g, it.p, it.P);
    else if (it.k === 'b') blzDrawBall(g, B, it.P);
    else if (it.k === 'q') blzDrawPart(g, it.q, it.P);
    else if (it.k === 'g') blzDrawPosts(g, it.z);
  }
  if (B && B.st === 'held' && blitz.carrier) {
    const C = blitz.carrier, P = blzProj(B.x, 0, B.z);
    if (P && !(C.downT > 0)) blzDrawBall(g, B, P);
  }
  // receiver marker: the yellow chevron over the man you're throwing to
  if (ph === 'live' && blitz.pocket && blitz.kind === 'pass' && blitz.carrier && blzHuman(blitz.carrier.team) && blitz.target) {
    const r = blitz.target, P = blzProj(r.x, 3.1 + 0.25 * Math.sin(blitz.t * 10), r.z);
    if (P) {
      const s = Math.max(4, P.k * 0.5);
      g.fillStyle = '#ffd23a'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(P.x - s, P.y - s); g.lineTo(P.x + s, P.y - s); g.lineTo(P.x, P.y + s * 0.6); g.closePath(); g.fill(); g.stroke();
    }
  }
  if (night) {
    const v = g.createRadialGradient(W / 2, H * 0.6, H * 0.2, W / 2, H * 0.6, H * 0.9);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,10,0.55)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
}

// text painted flat on the turf, squashed by the perspective
function blzGroundText(g, str, x, z, sizeYd, col, aspect) {
  const P = blzProj(x, 0, z), Q = blzProj(x, 0, z + blitz.cam.dir);
  if (!P || !Q) return;
  const kv = Math.abs(Q.y - P.y);
  if (P.k < 1.2) return;
  g.save();
  g.translate(P.x, P.y);
  g.scale(P.k * (aspect || 1) / 10, kv / 10);
  g.font = '900 ' + Math.round(sizeYd * 10) + 'px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = col; g.fillText(str, 0, 0);
  g.restore();
}

function blzDrawStands(g, night) {
  const c = blitz.cam;
  const base = night ? '#141826' : '#3a4256', wall = night ? '#0d1a2e' : '#1b3a6a';
  // side stands, far to near: a raked bank of seats along each sideline
  const z0 = blzZAt(176), z1 = blzZAt(3);
  const step = 6;
  const zs = [];
  for (let z = Math.floor(Math.min(z0, z1) / step) * step; z < Math.max(z0, z1); z += step) zs.push(z);
  zs.sort((a, b) => (b - c.z) * c.dir - (a - c.z) * c.dir);
  for (const side of [-1, 1]) {
    const xIn = side < 0 ? -6 : BLZ_WID + 6, xOut = side < 0 ? -30 : BLZ_WID + 30;
    for (const z of zs) {
      const cl = blzClipZ(z, z + step, 4);
      if (!cl) continue;
      const a = blzProj(xIn, 0.9, cl[0]), b = blzProj(xOut, 16, cl[0]), cc = blzProj(xOut, 16, cl[1]), d = blzProj(xIn, 0.9, cl[1]);
      if (!a || !b || !cc || !d) continue;
      blzPoly(g, [a, b, cc, d], base);
      // the crowd: rows of nugget heads in team colors and confetti shirts
      for (let row = 0; row < 7; row++) {
        const u = (row + 0.5) / 7;
        const x = xIn + (xOut - xIn) * u, y = 0.9 + 15.1 * u;
        for (let s = 0; s < 4; s++) {
          const zz = cl[0] + (cl[1] - cl[0]) * ((s + 0.5) / 4);
          const P = blzProj(x, y, zz);
          if (!P) continue;
          const h = blzHash(Math.round(zz * 3) * 31 + row * 7 + side * 3);
          const sz = Math.max(1, P.k * 1.1);
          const bounce = (blitz.sfx.crowdGain ? 0 : 0) + (h > 0.5 ? Math.sin(blitz.t * 8 + h * 20) * sz * 0.15 : 0);
          g.fillStyle = h < 0.3 ? blzTeam(0).c1 : h < 0.45 ? blzTeam(0).c2 : h < 0.6 ? blzTeam(1).c1 : h < 0.8 ? '#d99a3c' : '#e8e0d0';
          g.fillRect(P.x - sz * 0.5, P.y - sz + bounce, sz, sz);
        }
      }
      // the padded wall at the front of the stands, with the ads
      const w0 = blzProj(xIn + side * 0.1, 0, cl[0]), w1 = blzProj(xIn + side * 0.1, 0, cl[1]), w2 = blzProj(xIn + side * 0.1, 1.6, cl[1]), w3 = blzProj(xIn + side * 0.1, 1.6, cl[0]);
      if (w0 && w1 && w2 && w3) {
        const ad = BLZ_ADS[((Math.round(z / step) % BLZ_ADS.length) + BLZ_ADS.length) % BLZ_ADS.length];
        blzPoly(g, [w0, w1, w2, w3], ad[1]);
        const m = blzProj(xIn + side * 0.1, 0.8, (cl[0] + cl[1]) / 2);
        if (m && m.k > 3) {
          g.save(); g.translate(m.x, m.y);
          const wpx = Math.abs(w1.x - w0.x);
          g.font = '900 italic ' + Math.max(4, Math.round(m.k * 1.0)) + 'px Impact, sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ad[2];
          const tw = g.measureText(ad[0]).width;
          if (tw > 0) g.scale(Math.min(1, wpx * 0.9 / tw), 1);
          g.fillText(ad[0], 0, 0); g.restore();
        }
      }
    }
  }
  // the end stands behind each goal (only the far one is ever in frame)
  for (const ez of [-12, BLZ_LEN + 12]) {
    const dz = (ez - c.z) * c.dir;
    if (dz < 4) continue;
    const out = ez + (ez < 0 ? -18 : 18);
    const a = blzProj(-30, 0.9, ez), b = blzProj(BLZ_WID + 30, 0.9, ez), cc = blzProj(BLZ_WID + 30, 16, out), d = blzProj(-30, 16, out);
    if (!a || !b || !cc || !d) continue;
    blzPoly(g, [a, b, cc, d], base);
    for (let row = 0; row < 7; row++) {
      const u = (row + 0.5) / 7, y = 0.9 + 15.1 * u, zz = ez + (out - ez) * u;
      for (let s = 0; s < 22; s++) {
        const x = -28 + (BLZ_WID + 56) * (s + 0.5) / 22;
        const P = blzProj(x, y, zz);
        if (!P) continue;
        const h = blzHash(s * 13 + row * 7 + ez);
        const sz = Math.max(1, P.k * 1.1);
        g.fillStyle = h < 0.3 ? blzTeam(0).c1 : h < 0.45 ? blzTeam(0).c2 : h < 0.6 ? blzTeam(1).c1 : h < 0.8 ? '#d99a3c' : '#e8e0d0';
        g.fillRect(P.x - sz * 0.5, P.y - sz, sz, sz);
      }
    }
    const w0 = blzProj(-14, 0, ez + (ez < 0 ? 0.5 : -0.5)), w1 = blzProj(BLZ_WID + 14, 0, ez + (ez < 0 ? 0.5 : -0.5));
    const w2 = blzProj(BLZ_WID + 14, 1.6, ez + (ez < 0 ? 0.5 : -0.5)), w3 = blzProj(-14, 1.6, ez + (ez < 0 ? 0.5 : -0.5));
    if (w0 && w1 && w2 && w3) blzPoly(g, [w0, w1, w2, w3], wall);
  }
  // light towers (night): four bright clusters
  if (night) {
    for (const [x, z] of [[-20, 20], [BLZ_WID + 20, 20], [-20, 100], [BLZ_WID + 20, 100]]) {
      const P = blzProj(x, 26, z);
      if (!P) continue;
      const r = Math.max(3, P.k * 3);
      const gl = g.createRadialGradient(P.x, P.y, 0, P.x, P.y, r * 3);
      gl.addColorStop(0, 'rgba(255,255,230,0.95)'); gl.addColorStop(0.3, 'rgba(255,250,200,0.35)'); gl.addColorStop(1, 'rgba(255,250,200,0)');
      g.fillStyle = gl; g.fillRect(P.x - r * 3, P.y - r * 3, r * 6, r * 6);
    }
  }
}
const BLZ_ADS = [
  ['HOWMANYNUGGETS.COM', '#ffd23a', '#7a1010'], ['GREASE GARAGE', '#1a1a22', '#ff8a1e'], ['DRINK SAUCE', '#102a5a', '#26e0ff'],
  ['NOODLE NUG', '#5a1010', '#ffd23a'], ['DIP HOP NIGHTLY', '#2a0f3a', '#ff2fa0'], ['NO REFS', '#f2f2f2', '#d6352a'],
];

function blzDrawPosts(g, z) {
  const P0 = blzProj(BLZ_MID, 0, z);
  if (!P0) return;
  const w = Math.max(1.5, P0.k * 0.2);
  g.strokeStyle = '#ffd23a'; g.lineWidth = w; g.lineCap = 'round';
  const line = (a, b) => { const A = blzProj(a[0], a[1], a[2]), B = blzProj(b[0], b[1], b[2]); if (!A || !B) return; g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke(); };
  const back = z === 0 ? -1.2 : 1.2;
  line([BLZ_MID, 0, z + back], [BLZ_MID, 3.3, z + back]);
  line([BLZ_MID, 3.3, z + back], [BLZ_MID, 3.3, z]);
  line([BLZ_MID - 3.1, 3.3, z], [BLZ_MID + 3.1, 3.3, z]);
  line([BLZ_MID - 3.1, 3.3, z], [BLZ_MID - 3.1, 11, z]);
  line([BLZ_MID + 3.1, 3.3, z], [BLZ_MID + 3.1, 11, z]);
}

function blzShadow(g, p, P) {
  const lying = p.downT > 0 || p.diveT > 0;
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.beginPath();
  g.ellipse(P.x, P.y, P.k * (lying ? 1.2 : 0.75) / (1 + p.y * 0.3), P.k * 0.25, 0, 0, Math.PI * 2);
  g.fill();
}

// A nugget in pads, drawn from whatever angle the camera's at.
function blzDrawPlayer(g, p, P) {
  const T = blzTeam(p.team), k = P.k, c = blitz.cam;
  if (k < 0.8) return;
  const crust = '#d99a3c', crustD = '#a8691f', crustL = '#f3c66a';
  // facing in view space: +vz = away from the camera
  const vx = p.fx * c.dir, vz = p.fz * c.dir;
  const view = vz > 0.45 ? 'back' : vz < -0.45 ? 'front' : 'side';
  const sideSign = vx >= 0 ? 1 : -1;
  const hs = blitz.codes.huge ? 3 : blitz.codes.big ? 1.9 : 1;
  const human = p === blitz.ctl && blzHuman(p.team);
  const X = P.x, Y = P.y - p.y * k;
  // the human's ring on the turf
  if (human) {
    g.strokeStyle = blitz.t % 0.5 < 0.25 ? '#ffd23a' : '#ffffff'; g.lineWidth = Math.max(1.2, k * 0.12);
    g.beginPath(); g.ellipse(P.x, P.y, k * 1.0, k * 0.34, 0, 0, Math.PI * 2); g.stroke();
  }
  if (p.downT > 0 || p.diveT > 0) {
    const tilt = p.diveT > 0 ? 0.25 : 0;
    const bx = X, by = Y - k * (0.42 + tilt * 0.6);
    const dir = (vx >= 0 ? 1 : -1);
    g.save(); g.translate(bx, by); g.rotate(dir * (p.diveT > 0 ? 1.15 : 1.45));
    blzBody(g, T, k, view === 'front' ? 'front' : 'back', 0, 0, crust, crustD, crustL, p, 0);
    g.restore();
    return;
  }
  const run = Math.hypot(p.vx, p.vz) > 0.8;
  const ph = run ? Math.sin(p.anim * 2.2) : 0;
  const stance = blitz.phase === 'pre' && (p.pos === 'C' || p.pos === 'LG' || p.pos === 'RG' || p.pos === 'DE1' || p.pos === 'DT' || p.pos === 'DE2');
  const crouch = stance ? 0.25 : p.eng ? 0.12 : 0;
  // legs
  const legW = k * 0.24, legH = k * (0.62 - crouch * 0.6);
  g.fillStyle = T.pants;
  const lx = view === 'side' ? [-0.12, 0.12] : [-0.24, 0.24];
  for (let i = 0; i < 2; i++) {
    const sw = (i ? ph : -ph) * 0.18;
    const ox = view === 'side' ? sideSign * sw * 1.6 : 0;
    const oy = view === 'side' ? 0 : sw * 0.6;
    g.fillStyle = i ? T.pants : blzMix(T.pants, 0.25, '#000000');
    g.fillRect(X + (lx[i] + ox) * k - legW / 2, Y - legH + oy * k, legW, legH * 0.62);
    g.fillStyle = '#9a5a1e';
    g.fillRect(X + (lx[i] + ox) * k - legW / 2.4, Y - legH * 0.4 + oy * k, legW * 0.8, legH * 0.38);
    g.fillStyle = '#121216';
    g.fillRect(X + (lx[i] + ox) * k - legW / 2, Y - k * 0.08 + oy * k, legW * 1.15, k * 0.1);
  }
  const by = Y - k * (1.05 - crouch);
  const spin = p.spinT > 0 ? p.spinT * 25 : 0;
  g.save(); g.translate(X, by);
  if (spin) g.scale(Math.cos(spin), 1);
  const lean = p.turboOn ? 0.18 : 0;
  if (view === 'side') g.rotate(sideSign * lean);
  blzBody(g, T, k, view, sideSign, ph, crust, crustD, crustL, p, crouch);
  g.restore();
  // helmet
  const hr = k * 0.38 * hs;
  const hy = by - k * 0.72 - (hs - 1) * k * 0.3;
  blzHelmet(g, T, X + (view === 'side' ? sideSign * k * 0.06 : 0), hy, hr, view, sideSign);
  // on fire: a halo of flame
  if (blzOnFire(p.team) && (p === blitz.carrier || human)) {
    g.globalAlpha = 0.5 + 0.3 * Math.sin(blitz.t * 20);
    g.fillStyle = '#ff6a1a';
    g.beginPath(); g.ellipse(X, by - k * 0.2, k * 0.9, k * 1.3, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  if (p.celebT > 0 && ((blitz.t * 6) | 0) % 2) {
    g.fillStyle = crust;
    g.fillRect(X - k * 0.7, by - k * 1.3, k * 0.18, k * 0.6); g.fillRect(X + k * 0.52, by - k * 1.3, k * 0.18, k * 0.6);
  }
}

function blzBody(g, T, k, view, sideSign, ph, crust, crustD, crustL, p, crouch) {
  const rx = k * 0.64, ry = k * 0.74;
  // arms behind
  g.fillStyle = crustD;
  const armSw = ph * 0.25 * k;
  if (view !== 'side') {
    if (p.throwT > 0) { g.fillRect(rx * 0.7, -ry * 1.4, k * 0.2, k * 0.7); }
    else { g.fillRect(-rx - k * 0.12, -ry * 0.2 + armSw, k * 0.22, k * 0.55); g.fillRect(rx - k * 0.1, -ry * 0.2 - armSw, k * 0.22, k * 0.55); }
  }
  // the nugget
  g.fillStyle = crust;
  g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
  // crumb grain (a few lumps, stable per player)
  const seed = (p.num || 1) * 7 + p.team * 3;
  g.fillStyle = crustL;
  for (let i = 0; i < 4; i++) { const a = blzHash(seed + i) * 6.28, r = 0.55 * blzHash(seed + i + 9); g.fillRect(Math.cos(a) * rx * r, Math.sin(a) * ry * r - ry * 0.4, k * 0.1, k * 0.1); }
  // jersey band over the shoulders and chest
  g.save();
  g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.clip();
  g.fillStyle = T.c1; g.fillRect(-rx * 1.1, -ry * 0.95, rx * 2.2, ry * 1.25);
  g.fillStyle = blzMix(T.c1, 0.3, '#000000'); g.fillRect(view === 'side' ? -sideSign * rx * 0.2 - rx * 0.5 : rx * 0.45, -ry * 0.95, rx * 0.7, ry * 1.25);
  g.fillStyle = T.c2; g.fillRect(-rx * 1.1, -ry * 0.05, rx * 2.2, ry * 0.12);
  g.restore();
  // shoulder pads
  g.fillStyle = blzMix(T.c1, 0.15);
  if (view !== 'side') {
    g.beginPath(); g.ellipse(-rx * 0.62, -ry * 0.72, rx * 0.42, ry * 0.22, -0.3, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(rx * 0.62, -ry * 0.72, rx * 0.42, ry * 0.22, 0.3, 0, Math.PI * 2); g.fill();
  } else {
    g.beginPath(); g.ellipse(0, -ry * 0.72, rx * 0.6, ry * 0.24, 0, 0, Math.PI * 2); g.fill();
  }
  // the number
  if (view !== 'side' && p.num && k > 5) {
    g.font = '900 ' + Math.round(k * 0.62) + 'px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = T.num; g.fillText(String(p.num), 0, -ry * 0.38);
  }
  // arms in front
  g.fillStyle = crust;
  if (view === 'side') {
    if (p.stiffT > 0) g.fillRect(sideSign > 0 ? rx * 0.6 : -rx * 0.6 - k * 0.7, -ry * 0.55, k * 0.7, k * 0.2);
    else g.fillRect(sideSign * rx * 0.1 - k * 0.11 + armSw * sideSign, -ry * 0.3, k * 0.22, k * 0.55);
  } else if (p.stiffT > 0) g.fillRect(rx * 0.5, -ry * 0.6, k * 0.6, k * 0.2);
}

function blzHelmet(g, T, x, y, r, view, sideSign) {
  g.fillStyle = T.helm;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = blzMix(T.helm, 0.35);
  g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, Math.PI * 2); g.fill();
  g.fillStyle = T.stripe;
  if (view === 'side') g.fillRect(x - r * 0.95, y - r * 0.82, r * 1.7, r * 0.22);
  else g.fillRect(x - r * 0.13, y - r, r * 0.26, r * (view === 'back' ? 1.7 : 0.8));
  g.strokeStyle = T.mask; g.lineWidth = Math.max(1, r * 0.16);
  if (view === 'front') {
    // eyes behind the bars — nuggets have eyes
    g.fillStyle = '#fff8e8';
    g.fillRect(x - r * 0.45, y - r * 0.1, r * 0.3, r * 0.3); g.fillRect(x + r * 0.15, y - r * 0.1, r * 0.3, r * 0.3);
    g.fillStyle = '#141418';
    g.fillRect(x - r * 0.38, y - r * 0.02, r * 0.16, r * 0.18); g.fillRect(x + r * 0.22, y - r * 0.02, r * 0.16, r * 0.18);
    g.beginPath(); g.moveTo(x - r * 0.7, y + r * 0.35); g.lineTo(x + r * 0.7, y + r * 0.35); g.stroke();
    g.beginPath(); g.moveTo(x - r * 0.55, y + r * 0.62); g.lineTo(x + r * 0.55, y + r * 0.62); g.stroke();
    g.beginPath(); g.moveTo(x, y + r * 0.2); g.lineTo(x, y + r * 0.75); g.stroke();
  } else if (view === 'side') {
    const fx = x + sideSign * r * 0.75;
    g.fillStyle = '#fff8e8'; g.fillRect(x + sideSign * r * 0.32 - r * 0.12, y - r * 0.1, r * 0.24, r * 0.28);
    g.beginPath(); g.moveTo(fx, y - r * 0.15); g.lineTo(fx + sideSign * r * 0.18, y + r * 0.55); g.lineTo(x + sideSign * r * 0.25, y + r * 0.7); g.stroke();
    g.beginPath(); g.moveTo(x + sideSign * r * 0.3, y + r * 0.3); g.lineTo(fx + sideSign * r * 0.12, y + r * 0.3); g.stroke();
  }
}

function blzDrawBall(g, B, P) {
  const k = P.k, big = blitz.codes.bigball ? 2.4 : 1;
  const H = blzProj(B.x, B.y, B.z);
  if (!H) return;
  // shadow on the turf
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(P.x, P.y, k * 0.3 * big, k * 0.1 * big, 0, 0, Math.PI * 2); g.fill();
  const fire = B.st === 'air' && B.kind === 'pass' && B.from && blzOnFire(B.from.team);
  if (fire) {
    g.fillStyle = 'rgba(255,120,20,0.6)';
    g.beginPath(); g.arc(H.x, H.y, k * 0.55 * big, 0, Math.PI * 2); g.fill();
  }
  g.save(); g.translate(H.x, H.y); g.rotate(B.st === 'air' ? blitz.t * 14 : 0.4);
  g.fillStyle = '#7a3a14';
  g.beginPath(); g.ellipse(0, 0, Math.max(2, k * 0.36 * big), Math.max(1.3, k * 0.22 * big), 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f2ecdc'; g.fillRect(-k * 0.12 * big, -k * 0.02 * big, k * 0.24 * big, Math.max(0.6, k * 0.04 * big));
  g.restore();
}

function blzDrawPart(g, q, P) {
  const a = 1 - q.t / q.T;
  g.globalAlpha = Math.max(0, a);
  g.fillStyle = q.k === 'fire' ? (a > 0.6 ? '#ffe08a' : a > 0.3 ? '#ff8a1e' : '#c83a10') : q.c;
  const s = Math.max(1, P.k * (q.k === 'fire' ? 0.35 * (0.5 + a) : q.k === 'conf' ? 0.18 : 0.14));
  g.fillRect(P.x - s / 2, P.y - s / 2, s, s);
  g.globalAlpha = 1;
}

// ---- HUD ----------------------------------------------------------------------------------------
function blzClockTxt() {
  const s = Math.ceil(blitz.clock), m = (s / 60) | 0;
  return m + ':' + String(s % 60).padStart(2, '0');
}
function blzDrawHud(g, W, H) {
  const ui = blitz.ui;
  // the score box, top left (on a portrait phone the storm pill wraps to
  // several lines up there, so the boxes drop below it)
  const top = H > W * 1.2 ? Math.round(H * 0.17) : 6;
  const x0 = 6, y0 = top, bw = 128 * ui, bh = 15 * ui;
  for (let i = 0; i < 2; i++) {
    const T = blzTeam(i), y = y0 + i * (bh + 1);
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x0, y, bw, bh);
    g.fillStyle = T.c1; g.fillRect(x0, y, 5 * ui, bh);
    blzText(g, T.abbr, x0 + 9 * ui, y + bh / 2 + 1, 12 * ui, '#ffffff');
    blzText(g, String(blitz.score[i]), x0 + bw - 6, y + bh / 2 + 1, 13 * ui, i === blitz.poss && blitz.kind !== 'kick' ? '#ffd23a' : '#ffffff', 'right');
    if (i === blitz.poss && blitz.kind !== 'kick') { g.fillStyle = '#7a3a14'; g.beginPath(); g.ellipse(x0 + bw - 34 * ui, y + bh / 2, 4 * ui, 2.4 * ui, 0.3, 0, 7); g.fill(); }
    if (blzOnFire(i)) blzText(g, '🔥', x0 + bw - 50 * ui, y + bh / 2 + 1, 10 * ui, '#fff', 'center', false);
  }
  const qy = y0 + 2 * (bh + 1);
  g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x0, qy, bw, bh);
  blzText(g, blitz.ot ? 'OT' : blzOrd(blitz.q), x0 + 6, qy + bh / 2 + 1, 11 * ui, '#bfe8ff');
  blzText(g, blzClockTxt(), x0 + bw - 6, qy + bh / 2 + 1, 12 * ui, blitz.clock < 10 ? '#ff6a5a' : '#ffffff', 'right');
  // down & distance, top right
  if (blitz.kind !== 'kick' && blitz.phase !== 'final') {
    const goal = blitz.firstAt === blzGoal(blitz.poss);
    const togo = Math.max(1, Math.round(Math.abs(blitz.firstAt - blitz.los)));
    const dd = blitz.pat2 ? '2-PT TRY' : blzOrd(blitz.down) + ' & ' + (goal ? 'GOAL' : togo);
    const tw = 112 * ui;
    const ty = H > W * 1.2 ? y0 + 3 * (bh + 1) + 4 : 6, tx = H > W * 1.2 ? x0 + tw : W - 6;
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(tx - tw, ty, tw, bh * 2 + 1);
    blzText(g, dd, tx - 6, ty + bh / 2 + 1, 13 * ui, '#ffd23a', 'right');
    blzText(g, blzYardTxt(blitz.los, blitz.poss), tx - 6, ty + bh * 1.5 + 2, 10 * ui, '#ffffff', 'right');
  }
  // turbo meter (yours), bottom left
  const me = blitz.ctl;
  if (blitz.phase !== 'final' && blitz.phase !== 'call') {
    const tx = 8, ty = H - 22 * ui, tw = 110 * ui, th = 8 * ui;
    const fire = blzOnFire(0) || blitz.codes.inf;
    blzText(g, 'TURBO', tx, ty - 7 * ui, 9 * ui, fire ? '#ff8a1e' : '#bfe8ff');
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(tx, ty, tw, th);
    const v = fire ? 1 : blitz.turbo[0];
    const segs = 12;
    for (let i = 0; i < segs; i++) {
      if (i / segs >= v) break;
      g.fillStyle = fire ? (((blitz.t * 10 + i) | 0) % 2 ? '#ff6a1a' : '#ffd23a') : i < 4 ? '#e8412c' : i < 8 ? '#ffb020' : '#ffe23a';
      g.fillRect(tx + 1 + i * (tw - 2) / segs, ty + 1, (tw - 2) / segs - 1, th - 2);
    }
    if (me && blzHuman(me.team)) blzText(g, '#' + me.num + ' ' + me.name, tx, ty + th + 7 * ui, 8 * ui, '#ffffff');
  }
  // the feed, bottom centre-right
  let fy = H - 14;
  for (let i = blitz.feed.length - 1; i >= 0; i--) {
    const f = blitz.feed[i];
    g.globalAlpha = Math.min(1, f.t * 2);
    blzText(g, f.text, W - 10, fy, 10 * ui, f.color, 'right');
    fy -= 13 * ui;
  }
  g.globalAlpha = 1;
  // pre-snap prompt
  if (blitz.phase === 'pre' && blzHuman(blitz.poss) && ((blitz.t * 2) | 0) % 2 === 0)
    blzTextC(g, 'PRESS PASS TO HIKE', W / 2, H * 0.84, 14 * ui, '#ffffff');
  if (blitz.phase === 'pre' && blzHuman(1 - blitz.poss))
    blzTextC(g, 'PASS = SWITCH DEFENDER', W / 2, H * 0.88, 10 * ui, '#bfe8ff');
}

function blzDrawBanner(g, W, H) {
  const b = blitz.banner;
  if (!b) return;
  const u = b.t / b.T;
  const zoom = u < 0.12 ? 2.2 - u / 0.12 * 1.2 : 1;
  const a = u > 0.85 ? (1 - u) / 0.15 : 1;
  const size = Math.min(54, W / Math.max(6, b.text.length) * 1.4) * zoom;
  g.save();
  g.globalAlpha = Math.max(0, a);
  g.translate(W / 2, H * 0.36);
  g.transform(1, 0, -0.18, 1, 0, 0);
  g.font = '900 italic ' + Math.round(size) + 'px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = size * 0.16; g.strokeStyle = '#000'; g.lineJoin = 'round';
  g.strokeText(b.text, 0, 0);
  const gr = g.createLinearGradient(0, -size / 2, 0, size / 2);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, b.color); gr.addColorStop(1, blzMix(b.color.length === 7 ? b.color : '#ffd23a', 0.45, '#000000'));
  g.fillStyle = gr; g.fillText(b.text, 0, 0);
  if (b.sub) {
    g.font = '900 italic ' + Math.round(13 * blitz.ui) + 'px Impact, "Arial Black", sans-serif';
    g.lineWidth = 3; g.strokeText(b.sub, 0, size * 0.62);
    g.fillStyle = '#ffffff'; g.fillText(b.sub, 0, size * 0.62);
  }
  g.restore();
}

// ---- the play-select screen ---------------------------------------------------------------------
function blzDrawCall(g, W, H) {
  const off = blitz.callFor === 'off';
  const plays = off ? BLZ_OFF_PLAYS : BLZ_DEF_PLAYS;
  g.fillStyle = 'rgba(2,4,14,0.55)'; g.fillRect(0, 0, W, H);
  const gw = Math.min(W - 16, 520), cw = (gw - 8) / 3, top = Math.max(58, H * 0.2);
  const ch = Math.min(78, (H - top - 50) / 3 - 4);
  const x0 = (W - gw) / 2;
  blzTextC(g, off ? 'SELECT OFFENSIVE PLAY' : 'SELECT DEFENSIVE PLAY', W / 2, top - 22, 18 * blitz.ui, off ? '#ffd23a' : '#7ad0ff');
  const T = 15 - blitz.callT;
  blzText(g, String(Math.max(0, Math.ceil(T))), x0 + gw, top - 22, 14, T < 4 ? '#ff6a5a' : '#ffffff', 'right');
  blitz.hit.cards = []; blitz.hit.extra = [];
  plays.forEach((pl, i) => {
    const r = (i / 3) | 0, cI = i % 3;
    const x = x0 + cI * (cw + 4), y = top + r * (ch + 4);
    const sel = i === blitz.callSel;
    g.fillStyle = sel ? (off ? '#5a3a08' : '#0a3a5a') : 'rgba(8,10,24,0.9)';
    g.fillRect(x, y, cw, ch);
    g.strokeStyle = sel ? '#ffd23a' : off ? '#7a5a20' : '#2a5a8a'; g.lineWidth = sel ? 2 : 1;
    g.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
    blzText(g, String(i + 1), x + 5, y + 9, 10, '#ffd23a');
    blzText(g, pl.name, x + cw / 2, y + ch - 9, Math.min(12, cw / pl.name.length * 1.5), '#ffffff', 'center');
    blzDrawDiagram(g, pl, off, x + 4, y + 16, cw - 8, ch - 30);
    blitz.hit.cards.push({ x, y, w: cw, h: ch, n: i });
  });
  // the special-teams row (offense only)
  const ey = top + 3 * (ch + 4) + 4;
  if (off) {
    const items = [];
    items.push({ t: (blitz.flip ? '◀ FLIPPED' : 'FLIP ▶') + ' [F]', n: 'flip' });
    if (!blitz.pat2 && !blitz.codes.nopunt) items.push({ t: 'PUNT [P]', n: 'punt' });
    if (!blitz.pat2) {
      const dist = blzFGDist();
      items.push({ t: 'FIELD GOAL ' + dist + (blitz.codes.fgpct ? ' (' + Math.round(blzFGOdds(dist) * 100) + '%)' : '') + ' [G]', n: 'fg' });
    }
    const iw = (gw - (items.length - 1) * 4) / items.length;
    items.forEach((it, i) => {
      const x = x0 + i * (iw + 4);
      g.fillStyle = 'rgba(8,10,24,0.9)'; g.fillRect(x, ey, iw, 18);
      g.strokeStyle = '#7a5a20'; g.lineWidth = 1; g.strokeRect(x + 0.5, ey + 0.5, iw - 1, 17);
      blzText(g, it.t, x + iw / 2, ey + 10, 10, it.n === 'flip' && blitz.flip ? '#ffd23a' : '#ffffff', 'center');
      blitz.hit.extra.push({ x, y: ey, w: iw, h: 18, n: it.n });
    });
  }
  blzTextC(g, '1-9 / ARROWS + PASS · ' + blzOrd(blitz.down) + ' & ' + (blitz.firstAt === blzGoal(blitz.poss) ? 'GOAL' : Math.max(1, Math.round(Math.abs(blitz.firstAt - blitz.los)))) + ' · ' + blzYardTxt(blitz.los, blitz.poss), W / 2, ey + (off ? 30 : 8), 9, '#bfc6ff');
}

// a little chalkboard: the play's routes from its own data
function blzDrawDiagram(g, pl, off, x, y, w, h) {
  g.fillStyle = 'rgba(30,70,30,0.55)'; g.fillRect(x, y, w, h);
  const los = y + h * 0.78, cx = x + w / 2;
  const sxk = w / 40, szk = h * 0.72 / 32;
  const fl = blitz.flip && off ? -1 : 1;
  g.fillStyle = 'rgba(80,140,255,0.8)'; g.fillRect(x, los, w, 1);
  if (off) {
    const form = Object.assign({}, BLZ_FORM, pl.form || {});
    for (const pos of BLZ_OFF_POS) {
      const f = form[pos], px = cx + f[0] * sxk * fl, pz = los - f[1] * szk * 0.6;
      const rt = pos === 'RB' && pl.kind === 'run' ? pl.rb : pl.routes && pl.routes[pos];
      if (rt) {
        g.strokeStyle = pos === pl.primary ? '#ffd23a' : pl.kind === 'run' && pos === 'RB' ? '#ff8a5a' : '#ffffff';
        g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(px, pz);
        for (const wp of rt) g.lineTo(px + wp[0] * sxk * fl, Math.max(y + 1, pz - wp[1] * szk));
        g.stroke();
      }
      g.fillStyle = pos === 'QB' ? '#ffd23a' : '#ffffff';
      g.fillRect(px - 1.5, pz - 1.5, 3, 3);
    }
  } else {
    pl.roles.forEach((role, i) => {
      const base = [[-4, 1], [0, 1], [4, 1], [0, 5], [-14, 6], [14, 6], [0, 13]][i];
      const px = cx + base[0] * sxk, pz = los - base[1] * szk;
      g.lineWidth = 1.2;
      if (role === 'rush') { g.strokeStyle = '#ff6a5a'; g.beginPath(); g.moveTo(px, pz); g.lineTo(cx, los + 6); g.stroke(); }
      else if (Array.isArray(role)) {
        g.strokeStyle = role[0] === 'deep' ? '#7ad0ff' : '#9affa0';
        g.beginPath(); g.ellipse(cx + role[1] * sxk, Math.max(y + 4, los - role[2] * szk), 6, 3.5, 0, 0, 7); g.stroke();
      } else if (role === 'spy') { g.strokeStyle = '#ffd23a'; g.strokeRect(px - 3, pz - 3, 6, 6); }
      else { g.strokeStyle = '#ffffff'; g.beginPath(); g.moveTo(px, pz); g.lineTo(px, pz - 8); g.stroke(); }
      g.fillStyle = '#ff4a3a'; g.fillRect(px - 1.5, pz - 1.5, 3, 3);
    });
  }
}

function blzDrawPat(g, W, H) {
  g.fillStyle = 'rgba(2,4,14,0.55)'; g.fillRect(0, 0, W, H);
  blzTextC(g, 'EXTRA POINT', W / 2, H * 0.3, 22, '#ffd23a');
  const bw = Math.min(170, W * 0.4), bh = 46, y = H * 0.4;
  blitz.hit.cards = [];
  [['1  KICK IT', '1 POINT'], ['2  GO FOR TWO', '2 POINTS']].forEach((t, i) => {
    const x = W / 2 + (i ? 6 : -6 - bw);
    const sel = blitz.callSel === i;
    g.fillStyle = sel ? '#5a3a08' : 'rgba(8,10,24,0.9)'; g.fillRect(x, y, bw, bh);
    g.strokeStyle = sel ? '#ffd23a' : '#7a5a20'; g.lineWidth = 2; g.strokeRect(x, y, bw, bh);
    blzTextC(g, t[0], x + bw / 2, y + 16, 15, '#ffffff');
    blzTextC(g, t[1], x + bw / 2, y + 33, 10, '#bfc6ff');
    blitz.hit.cards.push({ x, y, w: bw, h: bh, n: i });
  });
}

// ---- the VS screen ---------------------------------------------------------------------------
function blzDrawVS(g, W, H) {
  const A = blzTeam(0), B = blzTeam(1);
  const t = blitz.vsT;
  g.fillStyle = A.c1; g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.58, 0); g.lineTo(W * 0.42, H); g.lineTo(0, H); g.fill();
  g.fillStyle = B.c1; g.beginPath(); g.moveTo(W * 0.58, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(W * 0.42, H); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H);
  const slide = Math.min(1, t * 3);
  const sz = Math.min(36, W / 14);
  blzText(g, A.city, W * 0.25 - (1 - slide) * W * 0.4, H * 0.22, sz * 0.5, A.c2, 'center');
  blzText(g, A.name, W * 0.25 - (1 - slide) * W * 0.4, H * 0.22 + sz * 0.7, sz, '#ffffff', 'center');
  blzText(g, B.city, W * 0.75 + (1 - slide) * W * 0.4, H * 0.22, sz * 0.5, B.c2, 'center');
  blzText(g, B.name, W * 0.75 + (1 - slide) * W * 0.4, H * 0.22 + sz * 0.7, sz, '#ffffff', 'center');
  blzTextC(g, 'VS', W / 2, H * 0.3, sz * 1.4 * (t < 0.4 ? 1 + (0.4 - t) * 3 : 1), '#ffd23a');
  blzTextC(g, blitz.cfg.name + ' · ×' + blitz.cfg.mult, W / 2, H * 0.45, 12, '#ffffff');
  // the three code boxes
  const labels = ['TURBO', 'JUMP', 'PASS'];
  const bw = 46, gap = 12, x0 = W / 2 - (bw * 3 + gap * 2) / 2, y = H * 0.56;
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (bw + gap);
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(x, y, bw, 40);
    g.strokeStyle = '#ffd23a'; g.lineWidth = 2; g.strokeRect(x, y, bw, 40);
    blzTextC(g, String(blitz.codeIn[i]), x + bw / 2, y + 22, 22, '#ffffff');
    blzTextC(g, labels[i], x + bw / 2, y + 50, 9, '#bfc6ff');
  }
  if (blitz.codeMsg) blzTextC(g, blitz.codeMsg.text + (blitz.codeMsg.ok ? '!' : ''), W / 2, y - 14, 16, blitz.codeMsg.ok ? '#39ff7a' : '#ff8a7a');
  const on = BLZ_CODES.filter((c) => blitz.codes[c.id]).map((c) => c.name);
  if (on.length) blzTextC(g, on.join(' · '), W / 2, y + 66, 9, '#39ff7a');
  blzTextC(g, 'TAP TURBO · JUMP · PASS, THEN PUSH A DIRECTION', W / 2, H * 0.86, 9, '#ffffff');
  if (((t * 2) | 0) % 2 === 0) blzTextC(g, 'PRESS ENTER (OR TAP HERE) TO KICK OFF', W / 2, H * 0.93, 13, '#ffd23a');
  blitz.hit.cards = [{ x: 0, y: H * 0.86, w: W, h: H * 0.14, n: 'go' }];
}

function blzDrawFinal(g, W, H) {
  const R = blitz.result || {}, t = blitz.finalT, st = blitz.stats;
  g.fillStyle = 'rgba(2,3,10,0.82)'; g.fillRect(0, 0, W, H);
  let y = H * 0.18;
  blzTextC(g, 'FINAL', W / 2, y, 24, '#bfe8ff'); y += 32;
  blzTextC(g, blzTeam(0).name + '  ' + blitz.score[0] + '  -  ' + blitz.score[1] + '  ' + blzTeam(1).name, W / 2, y, Math.min(22, W / 22), '#ffffff'); y += 30;
  const head = R.champ ? 'ALL-BLITZ CHAMPIONS!' : R.won ? 'CRUNCH WIN!' : R.tie ? 'A TIE. NOBODY SLEEPS.' : blzTeam(1).name + ' WIN';
  blzTextC(g, head, W / 2, y, 20, R.won ? (((t * 5) | 0) % 2 ? '#ffd23a' : '#ffffff') : '#ff8a7a'); y += 28;
  blzTextC(g, st.yds + ' YDS · ' + st.tds + ' TD · ' + st.sacks + ' SACKS · ' + st.ints + ' INT', W / 2, y, 11, '#bfc6ff'); y += 16;
  blzTextC(g, st.hits + ' MONSTER HITS · ' + st.late + ' LATE HITS · ' + st.fires + 'x ON FIRE · LONG ' + st.long, W / 2, y, 11, '#bfc6ff'); y += 20;
  blzTextC(g, '+' + fmt.format(blitz.earned) + ' NUGGETS', W / 2, y, 16, '#ffd23a'); y += 24;
  if (R.unlock) { blzTextC(g, 'ALL-BLITZ IS OPEN. THE FRYER IS WAITING.', W / 2, y, 11, '#26e0ff'); y += 18; }
  if (t > 1 && ((t * 2) | 0) % 2 === 0) blzTextC(g, 'PASS / SPACE REMATCH · R NEW OPPONENT', W / 2, y + 6, 11, '#8a92b0');
}

function blzDrawTouch(g, W, H) {
  const T = blitz.touch;
  if (!T.on) return;
  const s = BLZ_RES / window.innerHeight;
  g.globalAlpha = 0.45;
  if (T.L) {
    const x0 = T.L.x0 * s, y0 = T.L.y0 * s;
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x0, y0, 30, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x0 + T.L.dx * 22, y0 + T.L.dy * 22, 11, 0, 7); g.fill();
  }
  for (const b of blzTouchBtns()) {
    const on = T[b.k];
    g.fillStyle = on ? '#ffd23a' : b.c;
    g.beginPath(); g.arc(b.x * s, b.y * s, b.r * s, 0, 7); g.fill();
    g.globalAlpha = 0.9;
    blzTextC(g, b.label, b.x * s, b.y * s, 10, '#ffffff');
    g.globalAlpha = 0.45;
  }
  g.globalAlpha = 1;
}

// ---- input wiring ---------------------------------------------------------------------------
function blzTouchBtns() {
  const vw = window.innerWidth, vh = window.innerHeight;
  return [
    { k: 'A', label: 'PASS', x: vw - 62, y: vh - 70, r: 34, c: '#c8321f' },
    { k: 'B', label: 'JUMP', x: vw - 140, y: vh - 46, r: 28, c: '#1f6fc8' },
    { k: 'T', label: 'TURBO', x: vw - 70, y: vh - 156, r: 30, c: '#c8a01f' },
  ];
}
function blzMenuOpen() { return !!document.querySelector('.ak-tier') || !!document.querySelector('.modal-overlay.active'); }

function blzCallKey(code) {
  const ph = blitz.phase;
  if (ph === 'pat') {
    if (code === 'Digit1' || code === 'Numpad1') { blzPatChoose(1); return true; }
    if (code === 'Digit2' || code === 'Numpad2') { blzPatChoose(2); return true; }
    if (/Arrow(Left|Right)|Key[AD]/.test(code)) { blitz.callSel ^= 1; blzSfx('select'); return true; }
    return false;
  }
  if (ph !== 'call') return false;
  const m = /^(Digit|Numpad)([1-9])$/.exec(code);
  if (m) { blitz.callSel = +m[2] - 1; blzChoose(+m[2] - 1); return true; }
  if (blitz.callFor === 'off') {
    if (code === 'KeyF') { blitz.flip = !blitz.flip; blzSfx('select'); return true; }
    if (code === 'KeyP') { blzChoose('punt'); return true; }
    if (code === 'KeyG') { blzChoose('fg'); return true; }
  }
  const s = blitz.callSel;
  if (code === 'ArrowLeft' || code === 'KeyA') { blitz.callSel = (s + 8) % 9; blzSfx('select'); return true; }
  if (code === 'ArrowRight' || code === 'KeyD') { blitz.callSel = (s + 1) % 9; blzSfx('select'); return true; }
  if (code === 'ArrowUp' || code === 'KeyW') { blitz.callSel = (s + 6) % 9; blzSfx('select'); return true; }
  if (code === 'ArrowDown' || code === 'KeyS') { blitz.callSel = (s + 3) % 9; blzSfx('select'); return true; }
  return false;
}

window.addEventListener('keydown', (e) => {
  if (!blitzActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (blitz.phase === 'tier' || blzMenuOpen()) return;
  blzAudio();
  const claimed = /^(Key[WASDJKLMQRFPGV]|Arrow(Up|Down|Left|Right)|Space|Enter|ShiftLeft|ShiftRight|Escape|Digit[1-9]|Numpad[1-9])$/.test(e.code);
  if (claimed) e.preventDefault();
  if (e.code === 'Escape') { if (!e.repeat && blitz.phase !== 'final' && blitz.phase !== 'vs') blitz.paused = !blitz.paused; return; }
  if (e.code === 'KeyM' && !e.repeat) {
    const S = blitz.sfx; S.muted = !S.muted;
    if (S.master) S.master.gain.value = S.muted ? 0 : 0.34;
    if (S.muted && window.speechSynthesis) window.speechSynthesis.cancel();
    blzFeed(S.muted ? 'SOUND OFF' : 'SOUND ON', '#6a7290');
    return;
  }
  if (e.code === 'KeyV' && !e.repeat) {
    blitz.voice = !blitz.voice;
    if (!blitz.voice && window.speechSynthesis) window.speechSynthesis.cancel();
    blzFeed(blitz.voice ? 'ANNOUNCER ON' : 'ANNOUNCER OFF', '#6a7290');
    return;
  }
  if (blitz.paused) {
    if (e.code === 'KeyQ') { blitz.paused = false; if (typeof stopStorm === 'function') stopStorm(); }
    return;
  }
  if (blitz.phase === 'final' && e.code === 'KeyR' && !e.repeat) { blzOpenTier(); return; }
  if (blitz.phase === 'vs') {
    if (e.repeat) return;
    if (e.code === 'Enter') { blzStartGame(); return; }
    const dk = { ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R' }[e.code];
    if (dk) { blzCodeDir(dk); return; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyL') { blzCodeTap(0); return; }
    if (e.code === 'KeyK') { blzCodeTap(1); return; }
    if (e.code === 'Space' || e.code === 'KeyJ') { blzCodeTap(2); return; }
    return;
  }
  blitz.keys[e.code] = true;
  if (e.repeat) return;
  if (blzCallKey(e.code)) return;
  if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'Enter') blzPressPass();
  else if (e.code === 'KeyK') blzPressJump();
});
window.addEventListener('keyup', (e) => { if (blitz.keys[e.code]) blitz.keys[e.code] = false; });
window.addEventListener('blur', () => { blitz.keys = {}; });
window.addEventListener('resize', () => { if (blitz.on) blitzLayout(); });

function blzWorldXY(cx, cy) { const s = BLZ_RES / window.innerHeight; return { x: cx * s, y: cy * s }; }
function blzTapUI(x, y) {
  const ph = blitz.phase;
  for (const c of blitz.hit.cards) if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) {
    if (ph === 'vs' && c.n === 'go') { blzStartGame(); return true; }
    if (ph === 'pat') { blzPatChoose(c.n === 1 ? 2 : 1); return true; }
    if (ph === 'call') { blitz.callSel = c.n; blzChoose(c.n); return true; }
  }
  if (ph === 'call') for (const c of blitz.hit.extra) if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) {
    if (c.n === 'flip') { blitz.flip = !blitz.flip; blzSfx('select'); } else blzChoose(c.n);
    return true;
  }
  return false;
}

function blzPointerDown(e) {
  if (!blitzActive() || blitz.phase === 'tier' || e.pointerType === 'touch') return;
  e.preventDefault();
  blzAudio();
  blitz.touch.on = false;
  if (blitz.paused) { blitz.paused = false; return; }
  const p = blzWorldXY(e.clientX, e.clientY);
  if (blzTapUI(p.x, p.y)) return;
  if (blitz.phase === 'vs') return;
  if (e.button === 2) blzPressJump(); else blzPressPass();
}

blitzWorld.addEventListener('contextmenu', (e) => { if (blitzActive()) e.preventDefault(); });
blitzWorld.addEventListener('touchstart', (e) => {
  if (!blitzActive() || blitz.phase === 'tier') return;
  if (e.target.closest('.storm-hud, .ak-tier, .modal-overlay')) return;
  blzAudio();
  const T = blitz.touch; T.on = true;
  for (const t of e.changedTouches) {
    const x = t.clientX, y = t.clientY;
    if (blitz.paused) { blitz.paused = false; continue; }
    const wp = blzWorldXY(x, y);
    if ((blitz.phase === 'call' || blitz.phase === 'pat') && blzTapUI(wp.x, wp.y)) continue;
    let hit = null;
    for (const b of blzTouchBtns()) if (Math.hypot(x - b.x, y - b.y) <= b.r + 10) { hit = b; break; }
    if (hit) {
      T.roles[t.identifier] = hit.k; T[hit.k] = true;
      if (blitz.phase === 'vs') blzCodeTap(hit.k === 'T' ? 0 : hit.k === 'B' ? 1 : 2);
      else if (hit.k === 'A') blzPressPass(); else if (hit.k === 'B') blzPressJump();
      continue;
    }
    if (blitz.phase === 'vs' && blzTapUI(wp.x, wp.y)) continue;
    if (blitz.phase === 'final') { blzPressPass(); continue; }
    if (x < window.innerWidth * 0.55 && !T.L) { T.L = { id: t.identifier, x0: x, y0: y, dx: 0, dy: 0 }; T.roles[t.identifier] = 'L'; }
  }
  e.preventDefault();
}, { passive: false });
blitzWorld.addEventListener('touchmove', (e) => {
  if (!blitzActive()) return;
  const T = blitz.touch;
  for (const t of e.changedTouches) {
    if (T.roles[t.identifier] !== 'L' || !T.L) continue;
    T.L.dx = blzClamp((t.clientX - T.L.x0) / 40, -1, 1); T.L.dy = blzClamp((t.clientY - T.L.y0) / 40, -1, 1);
  }
  e.preventDefault();
}, { passive: false });
const blzTouchEnd = (e) => {
  const T = blitz.touch;
  for (const t of e.changedTouches) {
    const role = T.roles[t.identifier]; delete T.roles[t.identifier];
    if (role === 'L') {
      // on the VS screen the stick is the code direction
      if (blitz.phase === 'vs' && T.L) {
        const dx = T.L.dx, dy = T.L.dy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 0.5) blzCodeDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'));
      }
      T.L = null;
    } else if (role) T[role] = false;
  }
};
window.addEventListener('touchend', blzTouchEnd); window.addEventListener('touchcancel', blzTouchEnd);

function blzPollPad() {
  const P = blitz.pad;
  if (!navigator.getGamepads) return;
  let gp = null;
  try { for (const g of navigator.getGamepads()) if (g && g.connected) { gp = g; break; } } catch (e) { return; }
  if (!gp) { P.on = false; return; }
  const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
  const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
  P.lx = dz(gp.axes[0] || 0) + (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0);
  P.ly = dz(gp.axes[1] || 0) + (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
  const a = btn(0), b = btn(1), tu = btn(2) || btn(5) || btn(7), st = btn(9);
  if (P.lx || P.ly || a || b || tu) P.on = true;
  P.turbo = tu;
  const nav = Math.abs(P.lx) > 0.6 ? (P.lx > 0 ? 'R' : 'L') : Math.abs(P.ly) > 0.6 ? (P.ly > 0 ? 'D' : 'U') : '';
  if (nav && nav !== P._nav) {
    if (blitz.phase === 'vs') blzCodeDir(nav);
    else if (blitz.phase === 'call') blzCallKey({ R: 'ArrowRight', L: 'ArrowLeft', U: 'ArrowUp', D: 'ArrowDown' }[nav]);
    else if (blitz.phase === 'pat' && (nav === 'L' || nav === 'R')) blitz.callSel ^= 1;
  }
  P._nav = nav;
  if (a && !P._a) blzPressPass();
  if (b && !P._b) blzPressJump();
  if (tu && !P._t && blitz.phase === 'vs') blzCodeTap(0);
  if (st && !P._st) { if (blitz.phase === 'vs') blzStartGame(); else if (blitz.phase !== 'final') blitz.paused = !blitz.paused; }
  P._a = a; P._b = b; P._t = tu; P._st = st;
}

// ---- test seam ---------------------------------------------------------------------------------
// The harness drives the REAL handlers: pickTier deals a game, start() leaves
// the VS screen, auto(true) lets the AI play our side too, and step(secs)
// runs the sim at a fixed 60Hz without drawing — whole games, headless.
window.blitzDebug = {
  state: () => ({
    phase: blitz.phase, score: blitz.score.slice(), q: blitz.q, clock: Math.round(blitz.clock), ot: blitz.ot,
    poss: blitz.poss, los: Math.round(blitz.los * 10) / 10, down: blitz.down, firstAt: Math.round(blitz.firstAt * 10) / 10,
    kind: blitz.kind, play: blitz.play && blitz.play.key, earned: blitz.earned, tier: blitz.cfg && blitz.cfg.key,
    ctl: blitz.ctl && blitz.ctl.pos, fire: blitz.fire.map((f) => f.on), codes: Object.keys(blitz.codes),
    carrier: blitz.carrier && { pos: blitz.carrier.pos, team: blitz.carrier.team, x: +blitz.carrier.x.toFixed(1), z: +blitz.carrier.z.toFixed(1) },
    ball: blitz.ball && blitz.ball.st, stats: blitz.stats && Object.assign({}, blitz.stats), result: blitz.result,
  }),
  pickTier: (i) => {
    if (blitz.tierPick) { blitz.tierPick.close(); blitz.tierPick = null; }
    blzNewGame(BLZ_TIERS[i] || BLZ_TIERS[0]);
  },
  start: () => blzStartGame(),
  code: (taps, dir) => { blitz.codeIn = taps.slice(); blzCodeDir(dir); },
  auto: (v) => { blitz.auto = v !== false; },
  choose: (n) => blzChoose(n),
  pressPass: () => blzPressPass(), pressJump: () => blzPressJump(),
  step: (secs, hz) => {
    const dt = 1 / (hz || 60), n = Math.round(secs / dt);
    for (let i = 0; i < n; i++) {
      if (blitz.phase === 'tier' || blitz.phase === 'final') break;
      // in auto mode the call screen picks for both sides
      if (blitz.phase === 'call' && blitz.auto) {
        if (blitz.callFor === 'off') { const c = blzCpuOffCall(blitz.poss); blzChoose(c === 'punt' || c === 'fg' ? c : c); }
        else blzChoose(blzCpuDefCall());
        continue;
      }
      if (blitz.phase === 'pat' && blitz.auto) { blzPatChoose(1); continue; }
      blitzUpdate(dt);
    }
    return window.blitzDebug.state();
  },
  setKeys: (o) => { blitz.keys = Object.assign({}, o || {}); },
  players: () => blitz.players.map((p) => ({ team: p.team, pos: p.pos, x: +p.x.toFixed(1), z: +p.z.toFixed(1), down: p.downT > 0, eng: !!p.eng, role: p.role })),
  set: (o) => Object.assign(blitz, o),
  freeze: (v) => { blitz.freeze = v !== false; },
  draw: () => blzDraw(),
};
