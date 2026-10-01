// ---- 🏈 NUGMO BOWL --------------------------------------------------------------------
// "IMAGINE HOW GOOD BO 'SAUCE' JACKSON WILL BE AS A NUGGET."
//
// Game 18 (mode key: bowl). A friend in the group chat wrote the whole brief in
// two lines: "techmo bowl, but it's nuggets", then "imagine how good Bo 'Sauce'
// Jackson will be as a nugget?", and then, a minute later, "although somehow
// real life player Dante Fowler has to be in there because of his name". So
// this is TECMO BOWL, the franchise and its mechanic, not "a football game":
//
//   • nine on nine, a sideways field that scrolls, the Tecmo squash
//   • FOUR PLAYS: two runs, two passes. The defense picks one of your four
//     too, and if it picks RIGHT the play is blown up before it starts. On
//     defense you guess theirs. That guess IS the game.
//   • passing = cycle receivers with B, throw with A, the ball is a lob
//   • every tackle is a GRAPPLE: mash A to break it. Bo breaks most of them.
//   • diving tackles, kick returns, punts, field goals on a timing meter,
//     two-minute quarters, and the cut-in cinema on every big moment.
//
// Bo "Sauce" Jackson is our #34 and plays like the 1991 cartridge said he did.
// Dante Fowler is our #56, defensive end, and he is the one you control on
// defense by default, because of his name.
//
// Lore (docs/casefile.md): three opponents, a ladder. Win THE PLAYOFFS against
// the Sauce Works Syndicate and THE NUGGET BOWL opens against the HARBOR
// CYCLONES. The Nugget Bowl's attendance is one million and change; the box
// office sold zero tickets. Win it and the game remembers (localStorage
// nugBowlRing, read via bowlRingWon()). Canon-safe: a crowd is a crowd. Nobody
// saw it arrive and nobody saw it leave. The case stays open.
//
// Scoring mirrors the other games: football events are perFlyer-scaled into
// storm.caught (× the tier's mult); stopStorm() banks it.

const bowlWorld = document.getElementById('bowlWorld');

const BOWL_PXX = 7.5, BOWL_PXY = 3.1;    // world px per yard — the Tecmo squash
const BOWL_LEN = 120, BOWL_WID = 53.3;   // yards, end zones included (10..110 is the field)
const BOWL_MID = BOWL_WID / 2;
const BOWL_QLEN = 105;                   // game-clock seconds per quarter (a game ≈ 6-7 real minutes)
const BOWL_RUNOFF = 9;                   // clock that runs between in-bounds plays
const BOWL_OFF_POS = ['QB', 'RB', 'WR1', 'WR2', 'TE', 'OL1', 'OL2', 'OL3', 'OL4'];
const BOWL_DEF_POS = ['DE1', 'DT', 'DE2', 'LB1', 'LB2', 'LB3', 'CB1', 'CB2', 'S'];

// ---- the teams --------------------------------------------------------------------------
const BOWL_TEAMS = {
  tenders: { key: 'tenders', city: 'NUGGETOWN', name: 'TENDERS', abbr: 'NUG',
    c1: '#d23a2a', c2: '#ffd23a', helm: '#c8321f', stripe: '#ffd23a', mask: '#d8dce6', pants: '#f2ecdc', num: '#fff6d8', ez: '#8e1f16' },
  greasers: { key: 'greasers', city: 'GREASE GARAGE', name: 'GREASERS', abbr: 'GRG',
    c1: '#2a2a33', c2: '#ff8a1e', helm: '#24242b', stripe: '#ff8a1e', mask: '#9a9aa4', pants: '#ff8a1e', num: '#ff8a1e', ez: '#1c1c22' },
  batters: { key: 'batters', city: 'SAUCE WORKS', name: 'SYNDICATE', abbr: 'SWK',
    c1: '#5c2b8a', c2: '#f2e0b0', helm: '#4e2276', stripe: '#f2e0b0', mask: '#f2e0b0', pants: '#efe4c4', num: '#f2e0b0', ez: '#3a1658' },
  cyclones: { key: 'cyclones', city: 'HARBOR', name: 'CYCLONES', abbr: 'HBR',
    c1: '#0f7480', c2: '#ffcf3a', helm: '#0b5562', stripe: '#ffcf3a', mask: '#ffcf3a', pants: '#e6f2f0', num: '#ffcf3a', ez: '#08414a' },
};

// position baselines: [speed yd/s, strength, hands]
const BOWL_BASE = {
  QB: [6.4, 0.6, 0.6], RB: [7.8, 1.0, 0.75], WR1: [8.0, 0.6, 0.85], WR2: [7.9, 0.6, 0.85], TE: [7.0, 1.0, 0.78],
  OL1: [5.9, 1.1, 0.2], OL2: [5.9, 1.1, 0.2], OL3: [5.9, 1.1, 0.2], OL4: [5.9, 1.1, 0.2],
  DE1: [7.3, 1.05, 0.4], DT: [6.4, 1.2, 0.3], DE2: [7.3, 1.05, 0.4],
  LB1: [7.2, 1.0, 0.55], LB2: [7.2, 1.0, 0.55], LB3: [7.2, 1.0, 0.55],
  CB1: [8.0, 0.7, 0.62], CB2: [8.0, 0.7, 0.62], S: [7.7, 0.85, 0.6],
};
// named players: pos → [name, number, speed?, strength?, hands?] (nulls keep the baseline)
const BOWL_ROSTER = {
  tenders: {
    QB: ['DAN MARINADE', 13, 6.7, null, null],
    RB: ['BO "SAUCE" JACKSON', 34, 9.3, 1.65, 0.82],
    WR1: ['JERRY FRIED-RICE', 80, 8.7, null, 0.96],
    WR2: ['CRINKLE CUTT', 88, 8.3, null, 0.88],
    TE: ['RANCH ROMANOWSKI', 87, null, 1.1, 0.82],
    OL1: ['BISCUIT', 70], OL2: ['GRAVY', 71], OL3: ['DRUMSTICK', 72], OL4: ['THIGH', 73],
    DE1: ['THE FRYER', 99, null, 1.25, null], DT: ['THE WALK-IN', 92, null, 1.3, null],
    DE2: ['DANTE FOWLER', 56, 8.2, 1.3, 0.55],
    LB1: ['LAWRENCE TATER', 55, 7.6, 1.15, null], LB2: ['DIP SINGLETARY', 50], LB3: ['HASH BROWNE', 58],
    CB1: ['DEION SAUCERS', 21, 8.7, null, 0.75], CB2: ['WING WONG', 24], S: ['RONNIE LOTTA-SAUCE', 42, null, 1.0, 0.7],
  },
  greasers: {
    QB: ['DIPSTICK', 7], RB: ['LUG NUTZ', 22], WR1: ['SPARK PLUGG', 81], WR2: ['GASKET', 84], TE: ['TORQUE', 85],
    OL1: ['AXLE', 60], OL2: ['CHASSIS', 61], OL3: ['DRIVESHAFT', 62], OL4: ['MUFFLER', 63],
    DE1: ['JACK STAND', 90], DT: ['OIL PAN', 94], DE2: ['RADIATOR', 97],
    LB1: ['FAN BELT', 52], LB2: ['CAM SHAFT', 53], LB3: ['TIE ROD', 57],
    CB1: ['FUSE', 23], CB2: ['WIPER', 29], S: ['HUBCAP', 31],
  },
  batters: {
    QB: ['THE ACCOUNTANT', 11, null, null, null], RB: ['KNUCKLES', 28, 8.2, 1.15, null], WR1: ['THE SKIM', 82, 8.4], WR2: ['COLD CALL', 83], TE: ['LAUNDRY', 89],
    OL1: ['MUSCLE', 64], OL2: ['MORE MUSCLE', 65], OL3: ['THE CLEANER', 66], OL4: ['ALIBI', 67],
    DE1: ['SHAKEDOWN', 91, 7.6, 1.15], DT: ['THE VAT', 95, null, 1.35], DE2: ['RESIDUE', 98],
    LB1: ['ENFORCER', 51, 7.5, 1.1], LB2: ['HUSH MONEY', 54], LB3: ['TANKER', 59],
    CB1: ['THE FENCE', 25, 8.3], CB2: ['FALL GUY', 26], S: ['BAGMAN', 33, 7.9],
  },
  cyclones: {
    QB: ['THE CURRENT', 1, 7.2, 0.8, null], RB: ['UNDERTOW', 32, 8.7, 1.35, null], WR1: ['RIP TIDE', 86, 9.0, null, 0.92], WR2: ['GALE', 18, 8.6, null, 0.9], TE: ['BREAKWATER', 49, null, 1.2],
    OL1: ['SEAWALL', 74], OL2: ['PILING', 75], OL3: ['BULKHEAD', 76], OL4: ['JETTY', 77],
    DE1: ['NOR\'EASTER', 93, 7.9, 1.2], DT: ['THE SWELL', 96, null, 1.4], DE2: ['SQUALL', 90, 7.8, 1.15],
    LB1: ['EYE WALL', 45, 7.8, 1.2], LB2: ['FOGHORN', 47], LB3: ['BAROMETER', 48],
    CB1: ['WHITECAP', 20, 8.9, null, 0.75], CB2: ['SPRAY', 27, 8.6], S: ['DEEP WATER', 35, 8.3, 1.0, 0.72],
  },
};

// ---- the playbooks -----------------------------------------------------------------------
// Four plays a team, Tecmo-style: two runs, two passes. Routes are waypoint
// lists RELATIVE to the player's spot at the snap: [downfield yards, lateral
// yards (+ = toward the near sideline, the bottom of the screen)]. After the
// last waypoint a runner just keeps going the way it was going. The playbook
// cards draw their diagrams from this same data, so the picture IS the play.
const BOWL_PLAYBOOK = {
  tenders: [
    { key: 'sweep', name: 'SAUCE SWEEP', run: true, rb: [[-1, 5], [1.5, 11], [30, 13]], lean: 1 },
    { key: 'dive', name: 'DIP DIVE', run: true, rb: [[1.2, -1], [30, -1.5]], lean: 0 },
    { key: 'deep', name: 'DEEP FRY', pass: true, primary: 'WR1',
      routes: { WR1: [[34, 1]], WR2: [[11, 0], [30, -11]], TE: [[5, 0], [7, 8]], RB: [[0, 7], [3, 14]] } },
    { key: 'slant', name: 'CRISPY SLANT', pass: true, primary: 'WR2',
      routes: { WR1: [[4, 0], [14, 9]], WR2: [[4, 0], [14, -9]], TE: [[12, 0]], RB: [[0, -7], [2, -14]] } },
  ],
  greasers: [
    { key: 'oil', name: 'OIL CHANGE', run: true, rb: [[-1, -5], [1.5, -11], [30, -13]], lean: -1 },
    { key: 'jack', name: 'JACK STAND', run: true, rb: [[1.2, 1], [30, 1.5]], lean: 0 },
    { key: 'rod', name: 'HOT ROD', pass: true, primary: 'WR2',
      routes: { WR1: [[12, 0], [12, 7]], WR2: [[32, -1]], TE: [[6, 0], [6, -7]], RB: [[0, 7], [2, 13]] } },
    { key: 'lug', name: 'LUG NUT', pass: true, primary: 'WR1',
      routes: { WR1: [[6, 0], [6, -6]], WR2: [[6, 0], [6, 6]], TE: [[3, 0], [10, 0]], RB: [[0, -7], [2, -12]] } },
  ],
  batters: [
    { key: 'shake', name: 'THE SHAKEDOWN', run: true, rb: [[1.2, 1], [30, 0.5]], lean: 0 },
    { key: 'call', name: 'COLD CALL', run: true, rb: [[-1, 5], [1.5, 11], [30, 12]], lean: 1 },
    { key: 'skim', name: 'THE SKIM', pass: true, primary: 'TE',
      routes: { WR1: [[5, 0], [12, 10]], WR2: [[5, 0], [12, -10]], TE: [[4, 0], [9, -6]], RB: [[0, 7], [2, 13]] } },
    { key: 'laundry', name: 'THE LAUNDRY', pass: true, primary: 'WR1',
      routes: { WR1: [[14, 0], [32, 10]], WR2: [[30, 0]], TE: [[8, 0], [8, 7]], RB: [[0, -7], [3, -13]] } },
  ],
  cyclones: [
    { key: 'undertow', name: 'UNDERTOW', run: true, rb: [[-1, -5], [1.5, -11], [30, -13]], lean: -1 },
    { key: 'rip', name: 'RIP CURRENT', run: true, rb: [[1.2, 1.5], [30, 1]], lean: 0 },
    { key: 'tide', name: 'HIGH TIDE', pass: true, primary: 'WR1',
      routes: { WR1: [[36, 2]], WR2: [[36, -2]], TE: [[10, 0], [16, -8]], RB: [[0, 7], [3, 14]] } },
    { key: 'eddy', name: 'THE EDDY', pass: true, primary: 'WR2',
      routes: { WR1: [[6, 0], [10, 24]], WR2: [[6, 0], [10, -24]], TE: [[14, 0]], RB: [[0, -7], [2, -13]] } },
  ],
};

// the ladder (ArcadeKit.tierSelect): who you play, and how well they read you
const BOWL_TIERS = [
  { key: 'pre', emoji: '🔧', name: 'PRESEASON', mult: 1, opp: 'greasers', read: 0.2, spd: 0.9, str: 0.9,
    blurb: 'vs the GREASE GARAGE GREASERS. they practice in a parking lot.' },
  { key: 'play', emoji: '🏆', name: 'THE PLAYOFFS', mult: 2, opp: 'batters', read: 0.29, spd: 0.96, str: 1.0,
    blurb: 'vs the SAUCE WORKS SYNDICATE. they know your playbook. somebody sold it.' },
  { key: 'bowl', emoji: '🌀', name: 'THE NUGGET BOWL', mult: 3, opp: 'cyclones', read: 0.36, spd: 1.0, str: 1.06,
    blurb: 'vs the HARBOR CYCLONES. attendance: one million and change.', lockNote: 'win THE PLAYOFFS' },
];

const bowl = {
  on: false, cv: null, g: null, W: 480, Hh: 232, scale: 4, fieldTop: 50, hudH: 18,
  phase: 'idle', cfg: BOWL_TIERS[0], tierPick: null, t: 0, paused: false, freeze: false,
  teams: ['tenders', 'greasers'],
  score: [0, 0], q: 1, clock: BOWL_QLEN, poss: 0, los: 35, firstAt: 45, down: 1,
  kickTeam: 0, openKicker: 0, ot: false,
  players: [], carrier: null, ctl: null, target: null, ball: null,
  play: null, cpuPlay: null, guessRight: -1, defGuess: null, callSel: 0, callFor: 'off',
  playT: 0, kind: '', qbThrown: false, handed: false, startX: 0, playStartLos: 35,
  grap: null, deadT: 0, dead: null, cine: null, banner: null, feed: [],
  fg: null, punt: null, stats: null, earned: 0, auto: false,
  camX: 60, camTX: 60, shakeT: 0, shakeMag: 0, hitStopT: 0,
  parts: [], fireworks: [], crowdHype: 0,
  keys: {}, aPress: 0, bPress: 0, touch: { on: false, L: null, A: false, B: false, roles: {} }, pad: { on: false },
  fieldCv: null, crowdCv: null, sprites: new Map(), texts: new Map(),
  sfx: { ctx: null, master: null, crowd: null, crowdGain: null, muted: false },
  hit: { cards: [], extra: [] },
};

function bowlActive() { return storm.mode === 'bowl' && storm.running; }

// Did we ever win THE NUGGET BOWL? Street NPCs react; the case board files it.
function bowlRingWon() {
  try { return localStorage.getItem('nugBowlRing') === '1'; } catch (e) { return false; }
}
function bowlPlayoffsWon() {
  try { return localStorage.getItem('nugBowlPlayoffs') === '1' || bowlRingWon(); } catch (e) { return false; }
}

function bowlTally() {
  if (bowl.phase === 'tier' || !bowl.stats) return '🏈 pick your opponent…';
  const A = BOWL_TEAMS[bowl.teams[0]], B = BOWL_TEAMS[bowl.teams[1]];
  return '🏈 ' + A.abbr + ' ' + bowl.score[0] + ' – ' + bowl.score[1] + ' ' + B.abbr +
    ' · ' + (bowl.ot ? 'OT' : 'Q' + bowl.q) + ' · ' + fmt.format(bowl.earned);
}

// ---- the 5×7 font (Tecmo lettering is a bitmap, so ours is too) --------------------------
const BOWL_FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '!': [4, 4, 4, 4, 4, 0, 4], '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0], '-': [0, 0, 0, 14, 0, 0, 0],
  '\'': [4, 4, 8, 0, 0, 0, 0], '"': [10, 10, 0, 0, 0, 0, 0], '&': [12, 18, 20, 8, 21, 18, 13],
  '#': [10, 10, 31, 10, 31, 10, 10], '/': [1, 1, 2, 4, 8, 16, 16], '?': [14, 17, 1, 2, 4, 0, 4],
  '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '+': [0, 4, 4, 31, 4, 4, 0],
  '%': [24, 25, 2, 4, 8, 19, 3], '>': [8, 4, 2, 1, 2, 4, 8], '<': [2, 4, 8, 16, 8, 4, 2],
  '=': [0, 0, 31, 0, 31, 0, 0], '*': [0, 4, 21, 14, 21, 4, 0], '@': [14, 17, 23, 21, 23, 16, 14],
  '·': [0, 0, 0, 4, 0, 0, 0],
};
// 3×5 digits for the jerseys
const BOWL_DIG = [[7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7], [7, 1, 7, 1, 7], [5, 5, 7, 1, 1],
  [7, 4, 7, 1, 7], [7, 4, 7, 5, 7], [7, 1, 1, 1, 1], [7, 5, 7, 5, 7], [7, 5, 7, 1, 7]];

// A text run rendered once into its own canvas (with a 1px drop shadow) and
// cached — the frame draws dozens of labels and none of them should re-plot.
function bowlTextCv(str, color, shadow) {
  const key = str + '|' + color + '|' + (shadow || '');
  let c = bowl.texts.get(key);
  if (c) return c;
  if (bowl.texts.size > 600) bowl.texts.clear();
  const s = String(str).toUpperCase();
  c = document.createElement('canvas');
  c.width = Math.max(1, s.length * 6); c.height = 8;
  const g = c.getContext('2d');
  const plot = (col, ox, oy) => {
    g.fillStyle = col;
    for (let i = 0; i < s.length; i++) {
      const gl = BOWL_FONT[s[i]] || BOWL_FONT['?'];
      for (let r = 0; r < 7; r++) {
        const row = gl[r];
        if (!row) continue;
        for (let b = 0; b < 5; b++) if (row & (16 >> b)) g.fillRect(i * 6 + b + ox, r + oy, 1, 1);
      }
    }
  };
  if (shadow) plot(shadow, 1, 1);
  plot(color, 0, 0);
  bowl.texts.set(key, c);
  return c;
}
// draw text: align 'l' | 'c' | 'r', integer scale
function bowlText(g, str, x, y, color, opt) {
  opt = opt || {};
  const c = bowlTextCv(str, color, opt.shadow === undefined ? '#000' : opt.shadow);
  const s = opt.scale || 1;
  const w = c.width * s;
  let dx = x;
  if (opt.align === 'c') dx = x - w / 2;
  else if (opt.align === 'r') dx = x - w;
  g.drawImage(c, Math.round(dx), Math.round(y), w, c.height * s);
  return w;
}
function bowlTextW(str, scale) { return String(str).length * 6 * (scale || 1); }

// ---- layout & lifecycle ---------------------------------------------------------------------
function bowlLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  // ~232 world px tall, but never narrower than 320 (portrait phones drop to 1×
  // and get tall stands instead of a field squeezed into a letterbox)
  let s = Math.max(1, Math.floor(vh / 232));
  while (s > 1 && vw / s < 320) s--;
  bowl.scale = s;
  // the storm pill is ~52 css px tall at the top centre: the HUD bar grows to
  // clear it at small scales, and its contents hug the bar's bottom edge
  bowl.hudH = Math.max(18, Math.ceil(58 / s));
  bowl.W = Math.ceil(vw / s);
  bowl.Hh = Math.ceil(vh / s);
  if (bowl.cv) { bowl.cv.width = bowl.W; bowl.cv.height = bowl.Hh; }
  const fieldPx = BOWL_WID * BOWL_PXY;
  const free = Math.max(0, bowl.Hh - bowl.hudH - fieldPx);
  const tall = bowl.Hh > bowl.W * 1.1; // portrait: the thumbs need the bottom
  bowl.fieldTop = Math.round(bowl.hudH + free * (tall ? 0.38 : 0.62));
  bowl.crowdCv = null; // the stands are a function of their height
  if (bowl.g) bowl.g.imageSmoothingEnabled = false;
}

function syncBowl() {
  const active = bowlActive();
  if (active === bowl.on) return;
  bowl.on = active;
  document.body.classList.toggle('bowl-mode', active);
  if (active) {
    if (!bowl.cv) {
      bowl.cv = document.createElement('canvas');
      bowl.g = bowl.cv.getContext('2d');
      bowlWorld.appendChild(bowl.cv);
      bowl.cv.addEventListener('pointerdown', bowlPointerDown);
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    bowl.t = 0; bowl.earned = 0; bowl.paused = false;
    bowl.keys = {};
    bowlLayout();
    bowlOpenTier();
  } else {
    if (bowl.tierPick) { bowl.tierPick.close(); bowl.tierPick = null; }
    bowl.phase = 'idle';
    bowlCrowdStop();
  }
}

function bowlOpenTier() {
  bowl.phase = 'tier';
  bowl.stats = null;
  const tiers = BOWL_TIERS.map((t) => t.key === 'bowl' && !bowlPlayoffsWon() ? Object.assign({}, t, { locked: true }) : t);
  bowl.tierPick = ArcadeKit.tierSelect({
    storeKey: 'bowl',
    title: '🏈 NUGMO BOWL — pick your opponent',
    note: '4 plays · they guess one · you guess theirs · mash to break tackles · press 1 · 2 · 3',
    tiers, mount: bowlWorld,
    onPick: (key, t) => { bowl.tierPick = null; bowlNewGame(t); },
  });
}

// ---- audio: a tiny synth, a crowd that breathes --------------------------------------------
function bowlAudio() {
  const S = bowl.sfx;
  if (S.ctx) { if (S.ctx.state === 'suspended') S.ctx.resume(); return; }
  try {
    S.ctx = new (window.AudioContext || window.webkitAudioContext)();
    S.master = S.ctx.createGain(); S.master.gain.value = S.muted ? 0 : 0.32;
    S.master.connect(S.ctx.destination);
    const n = S.ctx.sampleRate * 2, buf = S.ctx.createBuffer(1, n, S.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    S.noise = buf;
  } catch (e) { S.ctx = null; }
}
function bowlCrowdStart() {
  const S = bowl.sfx;
  if (!S.ctx || S.crowd) return;
  const src = S.ctx.createBufferSource(); src.buffer = S.noise; src.loop = true;
  const bp = S.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
  const g = S.ctx.createGain(); g.gain.value = 0.05;
  src.connect(bp); bp.connect(g); g.connect(S.master);
  src.start();
  S.crowd = src; S.crowdGain = g;
}
function bowlCrowdStop() {
  const S = bowl.sfx;
  if (S.crowd) { try { S.crowd.stop(); } catch (e) { } S.crowd = null; S.crowdGain = null; }
}
function bowlRoar(level, secs) {
  const S = bowl.sfx;
  if (!S.crowdGain) return;
  const t = S.ctx.currentTime, g = S.crowdGain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0.05 + level * 0.3, t + 0.15);
  g.linearRampToValueAtTime(0.05, t + 0.15 + (secs || 1.5));
}
function bowlSfx(kind) {
  const S = bowl.sfx, ctx = S.ctx;
  if (!ctx || S.muted) return;
  const t = ctx.currentTime;
  const tone = (type, f0, f1, dur, vol, at) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t + (at || 0));
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (at || 0) + dur);
    g.gain.setValueAtTime(vol, t + (at || 0)); g.gain.exponentialRampToValueAtTime(0.001, t + (at || 0) + dur);
    o.connect(g); g.connect(S.master); o.start(t + (at || 0)); o.stop(t + (at || 0) + dur + 0.02);
  };
  const noise = (freq, q, dur, vol, at, type) => {
    const src = ctx.createBufferSource(); src.buffer = S.noise;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t + (at || 0)); g.gain.exponentialRampToValueAtTime(0.001, t + (at || 0) + dur);
    src.connect(f); f.connect(g); g.connect(S.master); src.start(t + (at || 0), Math.random()); src.stop(t + (at || 0) + dur + 0.02);
  };
  if (kind === 'whistle') { tone('sine', 2900, 0, 0.32, 0.12); tone('sine', 3180, 0, 0.32, 0.08); }
  else if (kind === 'hut') noise(900, 1.2, 0.09, 0.5);
  else if (kind === 'hit') { noise(260, 0.8, 0.2, 0.9, 0, 'lowpass'); tone('sine', 110, 50, 0.16, 0.5); }
  else if (kind === 'catch') tone('square', 880, 1320, 0.06, 0.12);
  else if (kind === 'throw') noise(2400, 2, 0.12, 0.18);
  else if (kind === 'kick') { tone('sine', 150, 55, 0.18, 0.6); noise(500, 1, 0.08, 0.4); }
  else if (kind === 'select') tone('square', 660, 0, 0.05, 0.08);
  else if (kind === 'pick') { tone('square', 523, 0, 0.06, 0.1); tone('square', 784, 0, 0.08, 0.1, 0.06); }
  else if (kind === 'read') { tone('sawtooth', 220, 110, 0.35, 0.12); }
  else if (kind === 'td') {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('square', f, 0, i === 5 ? 0.4 : 0.11, 0.1, i * 0.11));
  } else if (kind === 'good') { tone('square', 784, 0, 0.1, 0.1); tone('square', 1175, 0, 0.3, 0.1, 0.1); }
  else if (kind === 'bad') { tone('square', 330, 0, 0.14, 0.1); tone('square', 220, 0, 0.35, 0.1, 0.14); }
  else if (kind === 'mash') tone('square', 300 + Math.random() * 200, 0, 0.03, 0.05);
  else if (kind === 'horn') { tone('sawtooth', 196, 0, 0.9, 0.14); tone('sawtooth', 247, 0, 0.9, 0.1); }
}

// ---- the game: setup ------------------------------------------------------------------------
function bowlDir(team) { return team === 0 ? 1 : -1; }   // team 0 (you) attacks +x
function bowlGoal(team) { return team === 0 ? 110 : 10; } // the goal line a team attacks
function bowlClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function bowlRnd(a, b) { return a + Math.random() * (b - a); }
function bowlTeam(i) { return BOWL_TEAMS[bowl.teams[i]]; }
function bowlPlays(i) { return BOWL_PLAYBOOK[bowl.teams[i]]; }
function bowlHuman(team) { return team === 0 && !bowl.auto; }

function bowlMakePlayer(team, pos) {
  const tk = bowl.teams[team];
  const base = BOWL_BASE[pos];
  const r = (BOWL_ROSTER[tk] && BOWL_ROSTER[tk][pos]) || [pos, 0];
  const cpu = team === 1;
  const spd = (r[2] != null ? r[2] : base[0]) * (cpu ? bowl.cfg.spd : 1);
  const str = (r[3] != null ? r[3] : base[1]) * (cpu ? bowl.cfg.str : 1);
  return {
    team, pos, name: r[0], num: r[1] || 0, spd, str, hands: r[4] != null ? r[4] : base[2],
    x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, sp: 0, fx: bowlDir(team), anim: Math.random() * 4,
    downT: 0, invT: 0, eng: null, engT: 0, cool: 0, diveT: 0, throwT: 0, celebT: 0,
    route: null, ri: 0, ox: 0, oy: 0, cover: null, role: '', ofs: 0, boost: 1, lag: 0.45,
  };
}

function bowlNewGame(tier) {
  bowl.cfg = tier;
  bowl.teams = ['tenders', tier.opp];
  bowl.score = [0, 0]; bowl.q = 1; bowl.clock = BOWL_QLEN; bowl.ot = false;
  bowl.stats = { yds: 0, tds: 0, sacks: 0, ints: 0, boLong: 0, plays: 0, log: [] };
  bowl.earned = 0; bowl.feed = []; bowl.parts = []; bowl.fireworks = [];
  bowl.fieldCv = null; bowl.crowdCv = null;
  bowl.paused = false; bowl.grap = null; bowl.cine = null; bowl.banner = null;
  bowlAudio(); bowlCrowdStart();
  bowl.openKicker = Math.random() < 0.5 ? 0 : 1;
  const recv = 1 - bowl.openKicker;
  bowlCine('coin', {
    text: recv === 0 ? 'TENDERS RECEIVE' : bowlTeam(1).name + ' RECEIVE',
    sub: bowl.cfg.key === 'bowl' ? 'ATTENDANCE 1,000,000+ · TICKETS SOLD: 0' : bowlTeam(0).city + ' VS ' + bowlTeam(1).city,
    T: 2.4, after: () => bowlSetupKickoff(bowl.openKicker),
  });
}

function bowlFeed(text, color) {
  bowl.feed.push({ text, color: color || '#fff6d8', t: 2.6 });
  if (bowl.feed.length > 3) bowl.feed.shift();
}
function bowlBanner(text, color, sub, T) { bowl.banner = { text, color: color || '#ffd23a', sub: sub || '', t: 0, T: T || 1.3 }; }
function bowlCine(kind, o) {
  bowl.cine = Object.assign({ kind, t: 0, T: 2.4 }, o);
  bowl.phase = 'cine';
}

// Bank arcade nuggets for a football event (perFlyer × the opponent's mult).
function bowlEarn(units, why) {
  if (units <= 0 || !bowl.cfg) return 0;
  const worth = Math.max(1, Math.round(storm.perFlyer * units * bowl.cfg.mult));
  storm.caught += worth;
  bowl.earned += worth;
  if (why) bowlFeed('+' + fmt.format(worth) + ' ' + why, '#ffd23a');
  return worth;
}

// ---- kickoffs ------------------------------------------------------------------------------
function bowlSetupKickoff(k) {
  const r = 1 - k, dk = bowlDir(k);
  bowl.kickTeam = k; bowl.poss = r; bowl.kind = 'kick';
  bowl.players = []; bowl.carrier = null; bowl.grap = null; bowl.qbThrown = false;
  const kickX = k === 0 ? 45 : 75;
  BOWL_DEF_POS.forEach((pos, i) => {
    const p = bowlMakePlayer(k, pos);
    p.x = kickX - dk * (pos === 'S' ? 4 : 1); p.y = 4 + i * 5.7;
    if (pos === 'S') { p.y = BOWL_MID; p.role = 'kicker'; }
    p.role = p.role || 'cover'; p.laneY = p.y;
    bowl.players.push(p);
  });
  // re-space the cover lanes without the kicker
  const cov = bowl.players.filter((p) => p.role === 'cover');
  cov.forEach((p, i) => { p.y = p.laneY = 4 + i * (45.3 / (cov.length - 1)); });
  const retX = r === 0 ? 14 : 106, dr = bowlDir(r);
  BOWL_OFF_POS.forEach((pos, i) => {
    const p = bowlMakePlayer(r, pos);
    if (pos === 'RB') { p.x = retX; p.y = BOWL_MID; p.role = 'ret'; }
    else { p.x = retX + dr * (i % 2 ? 16 : 24); p.y = 7 + (i - 1) * 5.5; p.role = 'wall'; p.ofs = p.y - BOWL_MID; }
    bowl.players.push(p);
  });
  const ret = bowl.players.find((p) => p.role === 'ret');
  const landX = retX + dr * bowlRnd(-1, 4), landY = BOWL_MID + bowlRnd(-7, 7);
  bowl.ball = { st: 'tee', x: kickX, y: BOWL_MID, h: 0, x0: kickX, y0: BOWL_MID, x1: landX, y1: landY, t: 0, T: 2.25, apex: 12, rcv: ret, spin: 0 };
  bowl.ctl = null;
  if (bowlHuman(r)) bowl.ctl = ret;
  if (bowlHuman(k)) bowl.ctl = bowl.players.find((p) => p.pos === 'DE2');
  bowl.camX = kickX; bowl.camTX = kickX;
  bowl.phase = 'snap'; bowl.playT = 0; bowl.snapT = 1.0;
  bowl.guessRight = -1;
  bowl.losAtSnap = kickX;
  bowl.startX = null;
}

// ---- play calling ----------------------------------------------------------------------------
function bowlFGDist() { return Math.abs(bowlGoal(bowl.poss) - bowl.los) + 17; }

function bowlOpenCall() {
  bowl.phase = 'call';
  bowl.callFor = bowl.poss === 0 ? 'off' : 'def';
  bowl.callSel = Math.min(bowl.callSel, 3);
  bowl.cpuPlay = bowl.poss === 1 ? bowlCpuOffCall() : null;
  if (typeof bowl.cpuPlay === 'string') return bowlChoose(0); // they're kicking: nothing to guess
  if (bowl.auto) {
    // the harness plays itself: the human side calls at random
    const n = bowl.poss === 0 && bowl.down === 4 ? bowlCpuOffCallFor(0) : Math.floor(Math.random() * 4);
    bowlChoose(n);
  }
}

// CPU offense: what would a coach call here? returns a play index or 'punt'/'fg'
function bowlCpuOffCallFor(team) {
  const goalDist = Math.abs(bowlGoal(team) - bowl.los);
  const togo = Math.abs(bowl.firstAt - bowl.los);
  const late = bowl.q >= 4 && bowl.clock < 30 && bowl.score[team] < bowl.score[1 - team];
  if (bowl.down === 4 && !late) {
    if (goalDist + 17 <= 47 && togo > 2) return 'fg';
    if (goalDist > 52 || togo > 4) return goalDist + 17 <= 50 ? 'fg' : 'punt';
  }
  const passOdds = togo >= 8 ? 0.68 : togo <= 3 ? 0.32 : 0.5;
  const pass = Math.random() < passOdds;
  return (pass ? 2 : 0) + (Math.random() < 0.5 ? 0 : 1);
}
function bowlCpuOffCall() { return bowlCpuOffCallFor(1); }

// The human (or the harness) picked card n. On offense n is our play (or
// 'punt'/'fg'); on defense it is our GUESS at theirs.
function bowlChoose(n) {
  if (bowl.phase !== 'call') return;
  bowlSfx('pick');
  if (bowl.poss === 0) {
    if (n === 'punt' || n === 4) return bowlPunt(0);
    if (n === 'fg' || n === 5) return bowlStartFG(0);
    bowl.play = bowlPlays(0)[n];
    // the CPU defense guesses: right with the opponent's read rate
    const right = Math.random() < bowl.cfg.read || bowl.forceRead === true;
    bowl.defGuess = right && bowl.forceRead !== false ? n : (n + 1 + Math.floor(Math.random() * 3)) % 4;
    bowl.guessRight = bowl.defGuess === n ? 1 : -1;
  } else {
    const c = bowl.cpuPlay;
    if (c === 'punt') return bowlPunt(1);
    if (c === 'fg') return bowlStartFG(1);
    bowl.play = bowlPlays(1)[c];
    bowl.defGuess = n;
    bowl.guessRight = n === c ? 0 : -1;
  }
  bowlSetupScrimmage();
}

// ---- the scrimmage formation ------------------------------------------------------------------
function bowlSetupScrimmage() {
  const o = bowl.poss, d = 1 - o, dir = bowlDir(o), los = bowl.los, P = bowl.play;
  bowl.kind = P.run ? 'run' : 'pass';
  bowl.players = []; bowl.carrier = null; bowl.grap = null;
  bowl.qbThrown = false; bowl.handed = false; bowl.preThrow = !!P.pass;
  bowl.offAtSnap = o; bowl.losAtSnap = los; bowl.startX = los;
  const OFF = { QB: [-1.5, 0], RB: [-5.5, 0], WR1: [-0.7, -17], WR2: [-0.7, 16], TE: [-0.8, 6],
    OL1: [-0.6, -3.3], OL2: [-0.6, -1.1], OL3: [-0.6, 1.1], OL4: [-0.6, 3.3] };
  const DEF = { DE1: [1.0, -4.8], DT: [1.0, 0], DE2: [1.0, 4.8], LB1: [5, -6.5], LB2: [5, 0], LB3: [5, 6.5],
    CB1: [6, -17], CB2: [6, 16], S: [13, 0] };
  const byPos = {};
  for (const pos of BOWL_OFF_POS) {
    const p = bowlMakePlayer(o, pos);
    p.x = los + dir * OFF[pos][0]; p.y = BOWL_MID + OFF[pos][1];
    p.ox = p.x; p.oy = p.y;
    if (P.pass && P.routes[pos]) p.route = P.routes[pos];
    if (P.run && pos === 'RB') p.route = P.rb;
    p.role = pos.startsWith('OL') ? 'line' : pos === 'QB' ? 'qb' : (P.pass ? 'route' : (pos === 'RB' ? 'back' : 'lead'));
    byPos['o' + pos] = p;
    bowl.players.push(p);
  }
  for (const pos of BOWL_DEF_POS) {
    const p = bowlMakePlayer(d, pos);
    p.x = los + dir * DEF[pos][0]; p.y = BOWL_MID + DEF[pos][1];
    p.ox = p.x; p.oy = p.y;
    p.role = pos.startsWith('D') ? 'rush' : pos.startsWith('LB') ? 'lb' : 'cover';
    byPos['d' + pos] = p;
    bowl.players.push(p);
  }
  // man coverage: corners take the wideouts, the safety the tight end
  byPos.dCB1.cover = byPos.oWR1; byPos.dCB2.cover = byPos.oWR2;
  byPos.dLB3.cover = byPos.oTE; byPos.dLB3.role = 'cover';
  byPos.dLB1.cover = byPos.oRB; byPos.dLB1.role = 'cover'; // the back leaking into the flat is SOMEBODY's job
  byPos.dS.role = 'deep';
  // the read: a defense that guessed right plays every route a step early
  const read = bowl.guessRight === d;
  for (const p of bowl.players) {
    if (p.team !== d) continue;
    p.lag = read ? 0.08 : 0.45;
    if (read) p.boost = 1.12;
  }
  // a busted play: the offense guessed wrong about nothing — but if WE read it
  // on defense, our controlled defender gets the jump
  bowl.carrier = byPos.oQB;
  bowl.ball = { st: 'held', x: byPos.oQB.x, y: byPos.oQB.y, h: 0, spin: 0 };
  bowl.target = P.pass ? byPos['o' + P.primary] : null;
  bowl.ctl = null;
  if (bowlHuman(o)) bowl.ctl = byPos.oQB;
  if (bowlHuman(d)) {
    bowl.ctl = bowl.players.find((p) => p.team === d && p.pos === (bowl.defPick || 'DE2')) || byPos.dDE2;
  }
  if (bowl.ctl && read) bowl.ctl.boost = 1.25;
  bowl.phase = 'snap'; bowl.snapT = 0.85; bowl.playT = 0;
  bowl.camTX = los + dir * 8;
  bowl.qbPanic = read ? 0 : (Math.random() < 0.35 ? 0 : bowlRnd(1.2, 2.2));
  bowl.qbLook = read ? 2.0 : bowlRnd(0.9, 1.4);
  if (read) {
    bowlBanner(d === 0 ? 'YOU READ IT!' : 'THEY READ IT!', d === 0 ? '#39ff7a' : '#ff5a4a', 'they called ' + P.name, 1.1);
    bowlSfx('read');
  }
}

// ---- punts & field goals -------------------------------------------------------------------------
function bowlPunt(team) {
  const dir = bowlDir(team);
  let land = bowl.los + dir * bowlRnd(38, 47);
  let tb = false;
  if ((team === 0 && land >= 110) || (team === 1 && land <= 10)) { tb = true; land = team === 0 ? 90 : 30; }
  bowl.kind = 'punt';
  bowlFormationStatic(team);
  bowl.ball = { st: 'air', x: bowl.los - dir * 12, y: BOWL_MID, h: 0, x0: bowl.los - dir * 12, y0: BOWL_MID,
    x1: tb ? bowlGoal(team) + dir * 4 : land, y1: BOWL_MID + bowlRnd(-8, 8), t: 0, T: 2.3, apex: 16, spin: 0 };
  bowl.punt = { team, land, tb };
  bowl.phase = 'punt'; bowl.playT = 0;
  bowlSfx('kick');
  bowlFeed((team === 0 ? 'TENDERS' : bowlTeam(1).name) + ' PUNT');
}
function bowlStartFG(team) {
  const dist = bowlFGDist();
  bowl.kind = 'fg';
  bowlFormationStatic(team);
  bowl.fg = { team, dist, m: 0, t: 0, done: false, good: false, win: bowlClamp(0.3 - (dist - 18) * 0.0068, 0.045, 0.3) };
  bowl.phase = 'fg'; bowl.playT = 0;
  bowl.ball = { st: 'set', x: bowl.los - bowlDir(team) * 7, y: BOWL_MID, h: 0, spin: 0 };
  bowl.camTX = bowl.los + bowlDir(team) * 10;
  if (!bowlHuman(team)) {
    // the CPU kicker: odds fall off with distance
    const p = bowlClamp(1.04 - (dist - 20) * 0.021, 0.12, 0.97);
    bowlKickFG(Math.random() < p);
  }
}
function bowlKickFG(good) {
  const F = bowl.fg, dir = bowlDir(F.team);
  if (F.done) return;
  F.done = true; F.good = good;
  const sx = bowl.los - dir * 7;
  const postX = F.team === 0 ? 120 : 0;
  bowl.ball = { st: 'air', x: sx, y: BOWL_MID, h: 0, x0: sx, y0: BOWL_MID, x1: postX, y1: BOWL_MID + (good ? bowlRnd(-1.5, 1.5) : (Math.random() < 0.5 ? -1 : 1) * bowlRnd(4.5, 7)),
    t: 0, T: 1.0 + F.dist / 60, apex: 11, spin: 0 };
  bowlSfx('kick');
}
// set pieces (punt / FG) only need bodies in a line, not the whole engine
function bowlFormationStatic(team) {
  const dir = bowlDir(team);
  bowl.players = []; bowl.carrier = null; bowl.grap = null; bowl.ctl = null;
  BOWL_OFF_POS.forEach((pos, i) => {
    const p = bowlMakePlayer(team, pos);
    p.x = bowl.los - dir * (pos === 'QB' ? 7 : pos === 'RB' ? 12 : 0.6); p.y = BOWL_MID + (i - 4) * 1.6;
    if (pos === 'QB' || pos === 'RB') p.y = BOWL_MID;
    bowl.players.push(p);
  });
  BOWL_DEF_POS.forEach((pos, i) => {
    const p = bowlMakePlayer(1 - team, pos);
    p.x = bowl.los + dir * (i < 6 ? 1 : 9); p.y = BOWL_MID + (i < 6 ? (i - 2.5) * 2.2 : (i - 7) * 12);
    bowl.players.push(p);
  });
}

// ---- the live play ------------------------------------------------------------------------------
function bowlInput() {
  const K = bowl.keys;
  let x = 0, y = 0;
  if (K.ArrowLeft || K.KeyA) x -= 1;
  if (K.ArrowRight || K.KeyD) x += 1;
  if (K.ArrowUp || K.KeyW) y -= 1;
  if (K.ArrowDown || K.KeyS) y += 1;
  const T = bowl.touch;
  if (T.L) { x += T.L.dx; y += T.L.dy; }
  const P = bowl.pad;
  if (P.on) { x += P.lx || 0; y += P.ly || 0; }
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; }
  return { x, y };
}

function bowlSnapNow() {
  bowl.phase = 'live'; bowl.playT = 0;
  // the first few snaps of a session say what the buttons do
  const H = bowl.hints || (bowl.hints = {});
  const c = bowl.ctl;
  if (c && bowl.kind !== 'kick') {
    const k = c.team === bowl.poss ? bowl.kind : 'def';
    if ((H[k] || 0) < 2) {
      H[k] = (H[k] || 0) + 1;
      bowlFeed(k === 'pass' ? 'B: NEXT RECEIVER · A: THROW' : k === 'run' ? 'ARROWS: RUN · MASH A IN A TACKLE' : 'A: DIVE · B: SWITCH TO THE BALL', '#26e0ff');
    }
  }
  bowl.stats && bowl.stats.plays++;
  if (bowl.kind === 'kick') {
    bowl.ball.st = 'air'; bowl.ball.t = 0;
    bowlSfx('kick');
  } else {
    bowlSfx('hut');
  }
}

function bowlThrow(qb, r) {
  // lead the receiver: fly time grows with distance, three refinement passes
  let T = 0.6, tx = r.x, ty = r.y;
  for (let k = 0; k < 3; k++) {
    tx = r.x + r.vx * T; ty = r.y + r.vy * T;
    T = 0.42 + Math.hypot(tx - qb.x, ty - qb.y) / 21;
  }
  const d0 = Math.hypot(tx - qb.x, ty - qb.y), err = 0.35 + d0 * 0.035;
  tx += bowlRnd(-1, 1) * err; ty += bowlRnd(-1, 1) * err;
  ty = bowlClamp(ty, 1, BOWL_WID - 1);
  const d = Math.hypot(tx - qb.x, ty - qb.y);
  bowl.ball = { st: 'air', x: qb.x, y: qb.y, h: 1.6, x0: qb.x, y0: qb.y, x1: tx, y1: ty, t: 0, T, apex: 1.5 + d * 0.11, rcv: r, spin: 0 };
  bowl.carrier = null; bowl.preThrow = false; bowl.qbThrown = true;
  qb.throwT = 0.3;
  bowlSfx('throw');
}

function bowlCatchResolve() {
  const B = bowl.ball, o = bowl.poss;
  let bestR = null, dr = 1e9, bestD = null, dd = 1e9;
  for (const p of bowl.players) {
    if (p.downT > 0) continue;
    const dist = Math.hypot(p.x - B.x1, p.y - B.y1);
    if (p.team === o) {
      if (p.pos.startsWith('OL') || p.pos === 'QB') continue;
      if (dist < dr) { dr = dist; bestR = p; }
    } else if (dist < dd) { dd = dist; bestD = p; }
  }
  const defRead = bowl.guessRight === 1 - o;
  if (bestD && dd < 1.6 && (!bestR || dd < dr - 0.25)) {
    const pInt = 0.16 + 0.3 * bestD.hands + (defRead ? 0.16 : 0);
    if (Math.random() < pInt) return bowlPickOff(bestD);
    bowlWhistle('inc', 'BROKEN UP · ' + bestD.name);
    bowlDust(B.x1, B.y1, 5, '#e8e4d0');
    return;
  }
  if (bestR && dr < 1.9) {
    const contested = bestD && dd < 1.4;
    const air = Math.hypot(B.x1 - B.x0, B.y1 - B.y0);
    const pc = bestR.hands * (contested ? 0.6 : 1) * (defRead && contested ? 0.8 : 1) * bowlClamp(1.08 - air / 55, 0.55, 1);
    if (Math.random() < pc) {
      bowl.carrier = bestR; bowl.ball.st = 'held';
      if (bowlHuman(o)) bowl.ctl = bestR;
      bowlFeed('CAUGHT · ' + bestR.name);
      bowlSfx('catch');
      return;
    }
    // a ball that pops out of a contested catch can land in the wrong hands
    if (contested && Math.random() < 0.16 + (defRead ? 0.2 : 0)) return bowlPickOff(bestD);
  }
  bowlWhistle('inc', 'INCOMPLETE');
}

// PICKED OFF: the play stays live, the other way
function bowlPickOff(d) {
  bowl.carrier = d; bowl.poss = d.team;
  bowl.ball.st = 'held';
  bowl.pick = d; bowl.startX = d.x;
  if (bowlHuman(d.team)) { bowl.ctl = d; bowl.stats.ints++; bowlEarn(25, 'INT'); }
  else if (bowlHuman(1 - d.team)) { bowl.ctl = bowlNearest(1 - d.team, d); }
  bowlBanner('INTERCEPTED!', d.team === 0 ? '#39ff7a' : '#ff5a4a', d.name, 1.2);
  bowlSfx('catch'); bowlRoar(0.8, 1.4);
}

function bowlNearest(team, to) {
  let best = null, bd = 1e9;
  for (const p of bowl.players) {
    if (p.team !== team || p === to) continue;
    const d = Math.hypot(p.x - to.x, p.y - to.y) + (p.downT > 0 ? 6 : 0);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// one AI brain for every body on the field. Sets p.tx/p.ty/p.sp.
function bowlThink(p) {
  const C = bowl.carrier, B = bowl.ball, dirP = bowlDir(p.team);
  p.sp = 1;
  // --- the kickoff, ball in the air
  if (bowl.kind === 'kick' && B.st !== 'held') {
    if (p.team === bowl.kickTeam) {
      const k = bowlClamp(bowl.playT / B.T, 0, 1);
      p.tx = B.x1; p.ty = p.laneY + (B.y1 - p.laneY) * k * 0.8;
      if (p.role === 'kicker') p.sp = 0.6;
    } else if (p.role === 'ret') { p.tx = B.x1; p.ty = B.y1; }
    else { p.tx = B.x1 + dirP * (11 + Math.abs(p.ofs) * 0.12); p.ty = BOWL_MID + p.ofs * 0.9; p.sp = 0.6; }
    return;
  }
  // --- a pass in the air
  if (B.st === 'air' && bowl.kind === 'pass') {
    const dl = Math.hypot(p.x - B.x1, p.y - B.y1);
    if (p === B.rcv) { p.tx = B.x1; p.ty = B.y1; return; }
    if (p.team !== bowl.poss && dl < 11) { p.tx = B.x1; p.ty = B.y1; return; }
    if (p.route) { bowlRouteTarget(p); return; }
    p.tx = B.x1; p.ty = B.y1; p.sp = 0.5;
    return;
  }
  if (!C) { p.tx = p.x; p.ty = p.y; p.sp = 0; return; }
  const sameSide = p.team === C.team;
  // --- before the handoff / before the throw
  if (bowl.kind === 'run' && !bowl.handed) {
    if (p.pos === 'RB' && p.team === bowl.poss) { bowlRouteTarget(p); return; }
  }
  if (bowl.preThrow && C.pos === 'QB') {
    if (sameSide) {
      if (p.role === 'route') { bowlRouteTarget(p); return; }
      if (p.role === 'line') { // the pocket: get between the rusher and the QB
        const r = bowlThreat(p, C, 6);
        if (r) { p.tx = r.x - dirP * 0.6 + (C.x - r.x) * 0.15; p.ty = r.y + (C.y - r.y) * 0.25; }
        else { p.tx = p.ox - dirP * 1.5; p.ty = p.oy; p.sp = 0.5; }
        return;
      }
    } else {
      if (p.role === 'cover' && p.cover) { bowlCoverTarget(p); return; }
      if (p.role === 'deep') { // centre field: stay over the top of whoever's deepest
        const dirO = bowlDir(bowl.poss);
        let deep = null, dx = -1e9;
        for (const q of bowl.players) {
          if (q.team === p.team || q.role !== 'route') continue;
          const dd = (q.x - bowl.losAtSnap) * dirO;
          if (dd > dx) { dx = dd; deep = q; }
        }
        const depth = Math.max(13, dx + 5);
        p.tx = bowl.losAtSnap + dirO * depth; p.ty = deep ? BOWL_MID + (deep.y - BOWL_MID) * 0.7 : BOWL_MID;
        return;
      }
      if (p.role === 'lb') { // zone drop, then jump whatever comes into it
        const zx = bowl.losAtSnap + bowlDir(bowl.poss) * 6, zy = p.oy;
        let threat = null, td = 6.5;
        for (const q of bowl.players) {
          if (q.team === p.team || q.role !== 'route') continue;
          const dz = Math.hypot(q.x - zx, q.y - zy);
          if (dz < td) { td = dz; threat = q; }
        }
        if (threat) { p.tx = threat.x + threat.vx * p.lag; p.ty = threat.y + threat.vy * p.lag; }
        else if (bowl.playT > 2.2) { p.tx = C.x; p.ty = C.y; }
        else { p.tx = zx; p.ty = zy; p.sp = 0.8; }
        return;
      }
      // the rush
      p.tx = C.x; p.ty = C.y;
      return;
    }
  }
  if (sameSide) {
    if (p === C) return;
    if (p.pos === 'QB' && bowl.kind !== 'kick' && p.team === bowl.offAtSnap) { p.tx = p.x; p.ty = p.y; p.sp = 0.3; return; }
    // escort: pick up the nearest free pursuer and get in its way
    const r = bowlThreat(p, C, 14);
    if (r) { p.tx = r.x + (C.x - r.x) * 0.35; p.ty = r.y + (C.y - r.y) * 0.35; return; }
    p.tx = C.x + bowlDir(C.team) * 4; p.ty = C.y + (p.y > C.y ? 3 : -3); p.sp = 0.85;
    return;
  }
  // pursuit: lead the carrier, corners and safeties take a deeper angle
  const dist = Math.hypot(C.x - p.x, C.y - p.y);
  const lead = bowlClamp(dist / Math.max(1, p.spd), 0, 0.8);
  p.tx = C.x + C.vx * lead; p.ty = C.y + C.vy * lead;
  if ((p.pos.startsWith('CB') || p.pos === 'S') && dist > 4) p.tx += bowlDir(C.team) * 2.5;
}

function bowlRouteTarget(p) {
  const r = p.route, dir = bowlDir(p.team);
  if (!r) { p.tx = p.x; p.ty = p.y; return; }
  while (p.ri < r.length) {
    const wx = p.ox + dir * r[p.ri][0], wy = p.oy + r[p.ri][1];
    if (Math.hypot(wx - p.x, wy - p.y) < 0.9) { p.ri++; continue; }
    p.tx = wx; p.ty = wy; return;
  }
  // route run: keep going the way we were going
  const last = r[r.length - 1], prev = r.length > 1 ? r[r.length - 2] : [0, 0];
  let dx = (last[0] - prev[0]) * dir, dy = last[1] - prev[1];
  const m = Math.hypot(dx, dy) || 1;
  p.tx = p.x + (dx / m) * 6; p.ty = p.y + (dy / m) * 6;
}

function bowlCoverTarget(p) {
  const R = p.cover, dirO = bowlDir(bowl.poss);
  // shade a yard and a half downfield of the man, a step behind his feet
  p.tx = R.x + R.vx * p.lag + dirO * 1.4;
  p.ty = R.y + R.vy * p.lag;
}

function bowlThreat(p, C, range) {
  let best = null, bd = range;
  for (const q of bowl.players) {
    if (q.team === p.team || q.downT > 0 || q.eng) continue;
    const dq = Math.hypot(q.x - C.x, q.y - C.y);
    const dp = Math.hypot(q.x - p.x, q.y - p.y);
    const s = dq * 0.6 + dp * 0.4;
    if (s < bd) { bd = s; best = q; }
  }
  return best;
}

// the AI ball carrier: run to daylight
function bowlRunnerAI(C) {
  const dir = bowlDir(C.team);
  if (C.pos === 'QB' && bowl.preThrow) {
    // the pocket: drop to five yards deep, then look for the open man
    const dropX = bowl.losAtSnap - dir * 5;
    C.tx = dropX; C.ty = C.oy; C.sp = 0.7;
    const look = bowl.playT > (bowl.kind === 'pass' ? bowl.qbLook : 99);
    let pressure = 9;
    for (const q of bowl.players) if (q.team !== C.team && q.downT <= 0) pressure = Math.min(pressure, Math.hypot(q.x - C.x, q.y - C.y));
    if (look || pressure < bowl.qbPanic) {
      let best = null, bs = -1e9;
      for (const r of bowl.players) {
        if (r.team !== C.team || r.role !== 'route') continue;
        let open = 9;
        for (const q of bowl.players) if (q.team !== C.team) open = Math.min(open, Math.hypot(q.x - r.x, q.y - r.y));
        const down = (r.x - bowl.losAtSnap) * dir;
        const s = open * 1.6 + down * 0.18 - (r.downT > 0 ? 99 : 0);
        if (s > bs) { bs = s; best = r; }
      }
      const open = best ? Math.min(...bowl.players.filter((q) => q.team !== C.team).map((q) => Math.hypot(q.x - best.x, q.y - best.y))) : 0;
      if (best && (open > 1.8 || bowl.playT > 2.9 || pressure < bowl.qbPanic * 0.7)) bowlThrow(C, best);
    }
    return;
  }
  if (bowl.kind === 'run' && C.pos === 'QB' && !bowl.handed) { C.tx = C.x - dir * 2; C.ty = C.y; C.sp = 0.4; return; }
  if (bowl.kind === 'run' && C.pos === 'RB' && bowl.playT < 1.0 && C.route) { bowlRouteTarget(C); return; }
  // look ahead for tacklers and slide away from them
  let side = 0;
  for (const q of bowl.players) {
    if (q.team === C.team || q.downT > 0) continue;
    const ahead = (q.x - C.x) * dir;
    if (ahead < -1 || ahead > 8) continue;
    const dy = C.y - q.y, d2 = ahead * ahead + dy * dy + 0.5;
    side += (dy >= 0 ? 1 : -1) * 9 / d2;
  }
  if (C.y < 5) side += 2; if (C.y > BOWL_WID - 5) side -= 2;
  C.tx = C.x + dir * 6; C.ty = bowlClamp(C.y + bowlClamp(side, -5, 5), 1.5, BOWL_WID - 1.5); C.sp = 1;
}

function bowlLive(dt) {
  const C0 = bowl.carrier;
  bowl.playT += dt;
  bowl.clock = Math.max(0, bowl.clock - dt);
  const inp = bowlInput();
  // --- the handoff
  if (bowl.kind === 'run' && !bowl.handed && bowl.playT > 0.4) {
    const rb = bowl.players.find((p) => p.team === bowl.poss && p.pos === 'RB');
    bowl.handed = true; bowl.carrier = rb; bowl.ball.st = 'held';
    if (bowlHuman(bowl.poss)) bowl.ctl = rb;
  }
  // --- a QB who crosses the line is a runner now
  if (bowl.preThrow && C0 && C0.pos === 'QB' && (C0.x - bowl.losAtSnap) * bowlDir(C0.team) > 0.3) bowl.preThrow = false;
  const C = bowl.carrier;
  const human = bowl.ctl && !(bowl.kind === 'kick' && bowl.ball.st === 'air' && bowl.ctl.role === 'ret') ? bowl.ctl : null;
  // --- brains
  for (const p of bowl.players) {
    if (p.downT > 0 || p === human) continue;
    if (p === C) bowlRunnerAI(p); else bowlThink(p);
  }
  // --- bodies
  for (const p of bowl.players) {
    if (p.invT > 0) p.invT -= dt;
    if (p.cool > 0) p.cool -= dt;
    if (p.throwT > 0) p.throwT -= dt;
    if (p.downT > 0) { p.downT -= dt; p.vx *= 0.8; p.vy *= 0.8; continue; }
    let wantX, wantY, acc = 9;
    const top = p.spd * p.boost;
    if (p === human) {
      if (p.diveT > 0) {
        p.diveT -= dt; wantX = p.vx; wantY = p.vy; acc = 0;
        if (p.diveT <= 0) { p.downT = 0.55; p.diving = false; }
      } else {
        wantX = inp.x * top; wantY = inp.y * top; acc = 16;
        // the QB drops back on his own for the first beat of a pass play
        if (p.pos === 'QB' && bowl.preThrow && bowl.playT < 0.55) { wantX = -bowlDir(p.team) * top * 0.8; wantY = 0; }
        if (p.pos === 'QB' && bowl.kind === 'run' && !bowl.handed) { wantX = -bowlDir(p.team) * 2; wantY = 0; }
      }
    } else {
      const dx = p.tx - p.x, dy = p.ty - p.y, m = Math.hypot(dx, dy);
      const s = top * p.sp * (m < 0.6 ? m / 0.6 : 1);
      wantX = m > 0.01 ? (dx / m) * s : 0; wantY = m > 0.01 ? (dy / m) * s : 0;
    }
    if (p.eng) { wantX *= 0.14; wantY *= 0.14; }
    if (bowl.grap && (p === C || bowl.grap.defs.includes(p))) { wantX *= 0.12; wantY *= 0.12; }
    if (acc > 0) { const k = Math.min(1, dt * acc); p.vx += (wantX - p.vx) * k; p.vy += (wantY - p.vy) * k; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (Math.abs(p.vx) > 0.4) p.fx = p.vx > 0 ? 1 : -1;
    p.anim += Math.hypot(p.vx, p.vy) * dt * 1.4;
    if (p !== C) p.y = bowlClamp(p.y, -2.5, BOWL_WID + 2.5);
  }
  // --- blocks: bodies that meet the other color get tied up
  bowlBlocks(dt);
  // --- separation (nobody stands inside anybody)
  const ps = bowl.players;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (a.eng === b || (C && ((a === C && b.team !== C.team) || (b === C && a.team !== C.team)))) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0.001 && d < 0.75) {
        const push = (0.75 - d) * 0.5, ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
      }
    }
  }
  // --- the ball
  const B = bowl.ball;
  if (B.st === 'held' && bowl.carrier) { B.x = bowl.carrier.x; B.y = bowl.carrier.y; B.h = 0.9; }
  else if (B.st === 'air') {
    B.t += dt; const s = Math.min(1, B.t / B.T);
    B.x = B.x0 + (B.x1 - B.x0) * s; B.y = B.y0 + (B.y1 - B.y0) * s;
    B.h = 1.4 * (1 - s) + 4 * B.apex * s * (1 - s); B.spin += dt * 20;
    if (s >= 1) {
      if (bowl.kind === 'kick') {
        const R = B.rcv; R.x = B.x1; R.y = B.y1;
        bowl.carrier = R; B.st = 'held';
        bowlSfx('catch');
        bowl.startX = R.x;
      } else bowlCatchResolve();
    }
  }
  if (bowl.phase !== 'live') return;
  const CC = bowl.carrier;
  if (CC) {
    // --- tackles
    bowlTackles(dt, CC);
    if (bowl.phase !== 'live') return;
    // --- touchdown / safety / sideline
    if (CC.team === 0 && CC.x >= 110) return bowlWhistle('td');
    if (CC.team === 1 && CC.x <= 10) return bowlWhistle('td');
    if (CC.y < 0 || CC.y > BOWL_WID) return bowlWhistle('oob');
    if (CC.x < -0.5 || CC.x > 120.5) return bowlWhistle('oob');
  }
  // a pass play nobody ever throws: the QB is just a runner by now anyway
}

function bowlBlocks(dt) {
  const C = bowl.carrier, poss = bowl.poss;
  for (const a of bowl.players) {
    if (a.team !== poss || a === C || a.downT > 0 || a.eng || a.cool > 0) continue;
    if (a.pos === 'QB' && bowl.kind !== 'kick') continue;
    // receivers run routes on a pass; nobody jams them in this league
    if ((bowl.preThrow || bowl.ball.st === 'air') && a.role === 'route') continue;
    for (const d of bowl.players) {
      if (d.team === poss || d.downT > 0 || d.eng || d.diveT > 0) continue;
      if (Math.hypot(d.x - a.x, d.y - a.y) < 0.95) {
        const read = bowl.guessRight === d.team;
        a.eng = d; d.eng = a;
        d.engT = (0.8 + 1.3 * (a.str / d.str) * bowlRnd(0.7, 1.3)) * (read ? (d.role === 'rush' ? 0.25 : 0.4) : 1) * (bowl.kind === 'kick' ? 0.5 : 1);
        if (d === bowl.ctl) d.engT *= 0.8;
        break;
      }
    }
  }
  for (const d of bowl.players) {
    if (!d.eng || d.team === poss) continue;
    const a = d.eng;
    d.engT -= dt;
    if (d === bowl.ctl && bowl.aPress) d.engT -= 0.14 * bowl.aPress;
    // the blocker squares up in front of his man
    const dirA = bowlDir(a.team);
    a.x += ((d.x - dirA * 0.75) - a.x) * Math.min(1, dt * 10);
    a.y += (d.y - a.y) * Math.min(1, dt * 6);
    a.vx = d.vx; a.vy = d.vy;
    if (d.engT <= 0 || a.downT > 0) { d.eng = null; a.eng = null; a.cool = 0.9; d.cool = 0.3; }
  }
  // a block that drifted apart is no block
  for (const p of bowl.players) if (p.eng && Math.hypot(p.eng.x - p.x, p.eng.y - p.y) > 2.2) { p.eng.eng = null; p.eng = null; }
}

function bowlTackles(dt, C) {
  const G = bowl.grap;
  if (G) {
    // the grapple: every pursuer on him bleeds the meter, every A press fills it
    G.t += dt;
    let pull = 0;
    for (const q of G.defs) pull += q.str;
    G.m -= dt * 0.44 * pull;
    if (bowl.aPress) { G.m += 0.125 * C.str * bowl.aPress; bowlSfx('mash'); }
    for (const q of G.defs) { q.x += ((C.x - bowlDir(q.team) * -0.55) - q.x) * Math.min(1, dt * 8); q.y += (C.y - q.y) * Math.min(1, dt * 8); }
    // more bodies pile in
    for (const q of bowl.players) {
      if (q.team === C.team || q.downT > 0 || q.eng || G.defs.includes(q)) continue;
      if (Math.hypot(q.x - C.x, q.y - C.y) < 0.9) { G.defs.push(q); G.m -= 0.08; }
    }
    if (G.m >= 1) {
      for (const q of G.defs) q.downT = 0.85;
      C.invT = 0.45;
      bowl.grap = null;
      bowlBanner('BROKE FREE!', '#39ff7a', '', 0.8);
      bowlSfx('hit'); bowlRoar(0.5, 1);
      bowl.hitStopT = 0.06;
      bowlDust(C.x, C.y, 6);
      return;
    }
    if (G.m <= 0 || G.t > 2.2) { bowl.grap = null; bowlWhistle('tackle', null, G.defs[0]); }
    return;
  }
  if (C.invT > 0) return;
  for (const q of bowl.players) {
    if (q.team === C.team || q.downT > 0 || q.eng) continue;
    const reach = q.diveT > 0 ? 1.15 : 0.85;
    if (Math.hypot(q.x - C.x, q.y - C.y) > reach) continue;
    const read = bowl.guessRight === q.team ? 0.14 : 0;
    if (C === bowl.ctl) {
      // a human carrier gets the mash-off
      bowl.grap = { defs: [q], m: 0.46 - read, t: 0 };
      bowlSfx('hit');
      bowlDust(C.x, C.y, 3);
      return;
    }
    let pT;
    if (q === bowl.ctl) pT = q.diveT > 0 ? 0.9 - 0.32 * (C.str - 1) : 0.6 + 0.2 * (q.str - C.str);
    else pT = 0.64 + 0.28 * (q.str - C.str) + read;
    if (Math.random() < bowlClamp(pT, 0.22, 0.95)) { bowlWhistle('tackle', null, q); return; }
    q.downT = q === bowl.ctl ? 0.6 : 0.85;
    q.diveT = 0;
    C.invT = 0.3;
    bowlFeed(C.name + ' SHEDS ' + q.name);
    bowlDust(C.x, C.y, 4);
    bowlSfx('hit');
  }
}

// player actions: A and B mean different things depending on who has the ball
function bowlPressA() {
  bowlAudio();
  if (bowl.phase === 'call') { bowlChoose(bowl.callSel); return; }
  if (bowl.phase === 'cine') { if (bowl.cine.t > 0.6) bowlEndCine(); return; }
  if (bowl.phase === 'final') { bowlNewGame(bowl.cfg); return; }
  if (bowl.phase === 'fg' && bowl.fg && !bowl.fg.done && bowlHuman(bowl.fg.team)) {
    const err = Math.abs(bowl.fg.m - 0.5);
    bowlKickFG(err < bowl.fg.win);
    return;
  }
  if (bowl.phase === 'snap' && bowl.snapT > 0.25) { bowl.snapT = 0.2; return; }
  if (bowl.phase !== 'live') return;
  bowl.aPress++;
  const c = bowl.ctl;
  if (!c) return;
  if (c === bowl.carrier && c.pos === 'QB' && bowl.preThrow && bowl.target && bowl.playT > 0.3) {
    bowlThrow(c, bowl.target);
    return;
  }
  if (c.team !== bowl.poss && !c.eng && c.diveT <= 0 && c.downT <= 0) {
    // the diving tackle: commit, fly, and pray
    const C = bowl.carrier || { x: bowl.ball.x1, y: bowl.ball.y1 };
    let dx = c.vx, dy = c.vy;
    if (Math.hypot(dx, dy) < 1) { dx = C.x - c.x; dy = C.y - c.y; }
    const m = Math.hypot(dx, dy) || 1;
    c.vx = (dx / m) * (c.spd * 1.45); c.vy = (dy / m) * (c.spd * 1.45);
    c.diveT = 0.28; c.diving = true;
  }
}
function bowlPressB() {
  bowlAudio();
  if (bowl.phase === 'call') {
    if (bowl.poss === 1) { // on defense, B picks the man you'll play
      const order = ['DE2', 'DE1', 'DT', 'LB1', 'LB2', 'LB3', 'CB1', 'CB2', 'S'];
      bowl.defPick = order[(order.indexOf(bowl.defPick || 'DE2') + 1) % order.length];
    } else bowl.callSel = (bowl.callSel + 1) % 4;
    bowlSfx('select');
    return;
  }
  const c = bowl.ctl;
  if (!c) return;
  if (bowl.phase === 'live' && c === bowl.carrier && c.pos === 'QB' && bowl.preThrow) {
    // cycle the receivers
    const rs = bowl.players.filter((p) => p.team === c.team && p.role === 'route');
    const i = rs.indexOf(bowl.target);
    bowl.target = rs[(i + 1) % rs.length];
    bowlSfx('select');
    return;
  }
  if (c.team !== bowl.poss && (bowl.phase === 'live' || bowl.phase === 'snap')) {
    // switch to the defender nearest the ball
    const ref = bowl.carrier || { x: bowl.ball.x, y: bowl.ball.y };
    let best = c, bd = 1e9;
    for (const p of bowl.players) {
      if (p.team !== c.team || p.downT > 0) continue;
      const d = Math.hypot(p.x - ref.x, p.y - ref.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (bowl.phase === 'snap') {
      // pre-snap B cycles the front seven, Fowler first
      const order = ['DE2', 'DE1', 'DT', 'LB1', 'LB2', 'LB3', 'CB1', 'CB2', 'S'];
      const i = order.indexOf(c.pos);
      const next = bowl.players.find((p) => p.team === c.team && p.pos === order[(i + 1) % order.length]);
      if (next) { best = next; bowl.defPick = next.pos; }
    }
    c.boost = 1; best.boost = bowl.guessRight === c.team ? 1.25 : 1;
    bowl.ctl = best;
    bowlSfx('select');
  }
}

// ---- dead balls ----------------------------------------------------------------------------------
function bowlWhistle(type, msg, by) {
  if (bowl.phase !== 'live') return;
  const C = bowl.carrier;
  bowl.phase = 'dead'; bowl.deadT = type === 'td' ? 0.5 : 1.25;
  bowl.grap = null;
  bowl.dead = { type, msg, by, spot: C ? C.x : bowl.losAtSnap, who: C };
  if (type === 'tackle' && C) {
    C.downT = 9; if (by) by.downT = 9;
    bowlSfx('hit'); bowlDust(C.x, C.y, 7);
    bowl.shakeT = 0.18; bowl.shakeMag = 1.5;
    // a sack: the QB, behind the line, before he let go
    if (C.pos === 'QB' && bowl.kind === 'pass' && !bowl.qbThrown && C.team === bowl.offAtSnap &&
      (C.x - bowl.losAtSnap) * bowlDir(C.team) < 0) {
      bowl.dead.sack = true;
    }
  }
  if (type !== 'td') bowlSfx('whistle');
}

function bowlAfterDead() {
  const D = bowl.dead, C = D.who;
  const kickRet = bowl.kind === 'kick';
  const o = bowl.poss, dir = bowlDir(o);
  bowl.dead = null;
  if (D.type === 'td') return bowlTouchdown(C);
  // safety: a carrier dropped behind his own goal line (not on a return)
  let spot = D.spot;
  if (!kickRet && C && ((o === 0 && spot < 10) || (o === 1 && spot > 110))) {
    bowl.score[1 - o] += 2;
    bowlRoar(0.7, 1.2);
    return bowlCine('safety', { text: 'SAFETY!', sub: '2 POINTS · ' + bowlTeam(1 - o).name, who: D.by, T: 2.2,
      after: () => bowlCheckClock(() => bowlSetupKickoff(o)) });
  }
  if (kickRet) {
    if ((o === 0 && spot < 10) || (o === 1 && spot > 110)) spot = o === 0 ? 35 : 85; // touchback
    spot = bowlClamp(spot, 10.5, 109.5);
    bowl.los = spot; bowl.down = 1; bowl.firstAt = bowlClamp(spot + dir * 10, 10, 110);
    if (bowl.startX != null && C) {
      const ret = Math.round(Math.abs(spot - bowl.startX));
      bowlFeed('RETURN ' + ret + ' YDS · ' + C.name);
    }
    bowl.clock = Math.max(0, bowl.clock - 4);
    return bowlCheckClock(bowlOpenCall);
  }
  // possession changed mid-play (an interception return)
  if (o !== bowl.offAtSnap) {
    spot = bowlClamp(spot, 10.5, 109.5);
    bowl.los = spot; bowl.down = 1; bowl.firstAt = bowlClamp(spot + dir * 10, 10, 110);
    const pk = bowl.pick;
    return bowlCine('int', { text: 'INTERCEPTION!', sub: pk ? pk.name : '', who: pk, T: 2.3,
      after: () => bowlCheckClock(bowlOpenCall) });
  }
  if (D.type === 'inc') { spot = bowl.losAtSnap; bowlFeed(D.msg || 'INCOMPLETE', '#bfc6ff'); }
  spot = bowlClamp(spot, 10.5, 109.5);
  const gained = Math.round((spot - bowl.losAtSnap) * dir);
  if (D.type !== 'inc') {
    const nm = C ? C.name : '';
    bowlFeed(nm + (gained >= 0 ? ' +' : ' ') + gained + ' YDS', gained >= 0 ? '#fff6d8' : '#ff9a8a');
  }
  if (o === 0 && gained > 0) { bowl.stats.yds += gained; bowlEarn(gained * 0.3); }
  bowl.los = spot;
  const made = (spot - bowl.firstAt) * dir >= -0.01;
  let cineSack = null;
  if (D.sack) {
    if (D.by && D.by.team === 0) { bowl.stats.sacks++; bowlEarn(12, 'SACK'); }
    cineSack = { text: 'SACK!', sub: D.by ? D.by.name : '', who: D.by, victim: C, T: 1.9 };
  }
  if (made) {
    bowl.down = 1; bowl.firstAt = bowlClamp(spot + dir * 10, 10, 110);
    bowlBanner('FIRST DOWN', '#ffd23a', '', 1.0);
    if (o === 0) bowlEarn(4);
    bowlRoar(o === 0 ? 0.35 : 0.2, 0.8);
  } else {
    bowl.down++;
    if (bowl.down > 4) {
      bowl.poss = 1 - o; bowl.down = 1; bowl.firstAt = bowlClamp(spot + bowlDir(bowl.poss) * 10, 10, 110);
      bowlBanner('TURNOVER ON DOWNS', o === 0 ? '#ff5a4a' : '#39ff7a', '', 1.4);
      if (o === 1) bowlEarn(10, 'STOP');
    }
  }
  if (D.type === 'tackle' && !made) bowl.clock = Math.max(0, bowl.clock - BOWL_RUNOFF);
  else if (D.type === 'tackle') bowl.clock = Math.max(0, bowl.clock - BOWL_RUNOFF * 0.6);
  const next = () => bowlCheckClock(bowlOpenCall);
  if (cineSack) { cineSack.after = next; return bowlCine('sack', cineSack); }
  next();
}

function bowlTouchdown(C) {
  const team = C.team;
  bowl.score[team] += 6;
  const yds = bowl.startX != null ? Math.round(Math.abs(C.x - bowl.startX)) : 0;
  bowl.stats.log.push([team, bowl.kind === 'kick' ? 'ret' : bowl.offAtSnap !== team ? 'int' : bowl.kind, yds, C.pos]);
  let sub = C.name + (yds > 1 ? ' · ' + yds + ' YD ' + (bowl.kind === 'pass' && C.role === 'route' ? 'CATCH' : 'RUN') : '');
  let kind = 'td', text = 'TOUCHDOWN!';
  if (team === 0) {
    bowl.stats.tds++;
    bowlEarn(40, 'TD');
    if (C.pos === 'RB' && bowl.teams[0] === 'tenders' && yds >= 70) {
      kind = 'bo'; text = 'BO KNOWS NUGGETS';
      bowl.stats.boLong = Math.max(bowl.stats.boLong, yds);
      bowlEarn(80, 'BO KNOWS');
    }
  }
  bowlSfx('td'); bowlRoar(1, 2.6);
  bowlFireworks(team);
  bowl.crowdHype = 2.5;
  C.celebT = 3;
  bowlCine(kind, { text, sub, who: C, T: 2.8, after: () => {
    // the point after: Tecmo kickers do not miss much
    const good = Math.random() < 0.96;
    if (good) bowl.score[team] += 1;
    bowlFeed('EXTRA POINT ' + (good ? 'GOOD' : 'NO GOOD'), good ? '#39ff7a' : '#ff5a4a');
    if (bowl.ot) return bowlFinal();
    bowlCheckClock(() => bowlSetupKickoff(team));
  } });
}

function bowlCheckClock(next) {
  if (bowl.clock > 0) return next();
  // the quarter is over
  if (bowl.ot) return bowlFinal();
  if (bowl.q >= 4) {
    if (bowl.score[0] === bowl.score[1]) {
      bowl.ot = true; bowl.q = 5; bowl.clock = BOWL_QLEN;
      bowlSfx('horn');
      return bowlCine('quarter', { text: 'OVERTIME', sub: 'NEXT SCORE WINS', T: 2.2, after: () => bowlSetupKickoff(bowl.openKicker) });
    }
    return bowlFinal();
  }
  bowl.q++; bowl.clock = BOWL_QLEN;
  bowlSfx('horn');
  if (bowl.q === 3) {
    const sub = bowl.cfg.key === 'bowl' ? 'ATTENDANCE 1,000,000+ · NOBODY LEFT FOR SNACKS' : 'THE BAND PLAYS. THE FRYERS RUN.';
    return bowlCine('quarter', { text: 'HALFTIME', sub, T: 2.6, after: () => bowlSetupKickoff(1 - bowl.openKicker) });
  }
  bowlCine('quarter', { text: 'END OF Q' + (bowl.q - 1), sub: bowlTeam(0).abbr + ' ' + bowl.score[0] + ' · ' + bowlTeam(1).abbr + ' ' + bowl.score[1], T: 1.8, after: next });
}

function bowlFinal() {
  const s = bowl.score, won = s[0] > s[1], tie = s[0] === s[1];
  bowl.phase = 'final'; bowl.finalT = 0;
  if (won) {
    bowlEarn(120 + Math.min(28, s[0] - s[1]) * 4, 'WIN');
    if (bowl.cfg.key === 'play') { try { localStorage.setItem('nugBowlPlayoffs', '1'); } catch (e) { } }
    if (bowl.cfg.key === 'bowl') { try { localStorage.setItem('nugBowlRing', '1'); } catch (e) { } }
    bowlFireworks(0); bowlFireworks(0);
    bowlSfx('td'); bowlRoar(1, 3);
  } else if (tie) bowlEarn(50, 'TIE');
  else bowlSfx('bad');
  try { ArcadeKit.saveBest('bowl', bowl.cfg.key, bowl.earned); } catch (e) { }
  bowl.result = { won, tie, ring: won && bowl.cfg.key === 'bowl', unlock: won && bowl.cfg.key === 'play' };
}

function bowlEndCine() {
  const c = bowl.cine;
  bowl.cine = null;
  if (c && c.after) c.after();
}

// ---- FX --------------------------------------------------------------------------------------
function bowlDust(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    bowl.parts.push({ x, y, h: 0.3, vx: bowlRnd(-3, 3), vy: bowlRnd(-2, 2), vh: bowlRnd(1, 4), life: bowlRnd(0.35, 0.7), c: col || (i % 2 ? '#7fb24a' : '#d8c890') });
  }
}
function bowlFireworks(team) {
  const T = bowlTeam(team);
  for (let k = 0; k < 3; k++) {
    bowl.fireworks.push({ x: bowlRnd(0.15, 0.85), y: bowlRnd(0.05, 0.3), t: -k * 0.35 - Math.random() * 0.2, c: [T.c1, T.c2, '#fff6d8'][k % 3] });
  }
}

// ---- the frame ----------------------------------------------------------------------------------
function bowlUpdate(dt) {
  bowl.t += dt;
  if (bowl.banner) { bowl.banner.t += dt; if (bowl.banner.t > bowl.banner.T) bowl.banner = null; }
  for (let i = bowl.feed.length - 1; i >= 0; i--) { bowl.feed[i].t -= dt; if (bowl.feed[i].t <= 0) bowl.feed.splice(i, 1); }
  if (bowl.shakeT > 0) bowl.shakeT -= dt;
  bowl.crowdHype = Math.max(0, bowl.crowdHype - dt);
  for (let i = bowl.parts.length - 1; i >= 0; i--) {
    const p = bowl.parts[i];
    p.life -= dt; if (p.life <= 0) { bowl.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.h += p.vh * dt; p.vh -= 14 * dt; if (p.h < 0) { p.h = 0; p.vh *= -0.3; }
  }
  for (let i = bowl.fireworks.length - 1; i >= 0; i--) { bowl.fireworks[i].t += dt; if (bowl.fireworks[i].t > 1.6) bowl.fireworks.splice(i, 1); }
  for (const p of bowl.players) if (p.celebT > 0) p.celebT -= dt;
  const ph = bowl.phase;
  if (ph === 'cine') {
    bowl.cine.t += dt;
    if (bowl.cine.t >= bowl.cine.T) bowlEndCine();
  } else if (ph === 'snap') {
    bowl.snapT -= dt;
    // let the controlled defender shuffle pre-snap (stays on his side)
    if (bowl.snapT <= 0) bowlSnapNow();
  } else if (ph === 'live') {
    if (bowl.hitStopT > 0) { bowl.hitStopT -= dt; }
    else bowlLive(dt);
  } else if (ph === 'dead') {
    bowl.deadT -= dt;
    // bodies coast to a stop
    for (const p of bowl.players) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.88; p.vy *= 0.88; if (p.downT > 0 && p.downT < 9) p.downT -= dt; }
    if (bowl.ball.st === 'held' && bowl.carrier) { bowl.ball.x = bowl.carrier.x; bowl.ball.y = bowl.carrier.y; }
    if (bowl.deadT <= 0) bowlAfterDead();
  } else if (ph === 'punt' || ph === 'fg') {
    bowl.playT += dt;
    const B = bowl.ball;
    if (ph === 'fg' && bowl.fg && !bowl.fg.done) {
      bowl.fg.t += dt;
      bowl.fg.m = 0.5 + 0.5 * Math.sin(bowl.fg.t * 3.6);
      if (bowl.fg.t > 6) bowlKickFG(false); // froze up
    } else if (B.st === 'air') {
      B.t += dt; const s = Math.min(1, B.t / B.T);
      B.x = B.x0 + (B.x1 - B.x0) * s; B.y = B.y0 + (B.y1 - B.y0) * s;
      B.h = 4 * B.apex * s * (1 - s) + (ph === 'fg' ? s * 6 : 0); B.spin += dt * 12;
      if (s >= 1) { B.st = 'dead'; bowl.setT = 0.6; }
    } else if (B.st === 'dead') {
      bowl.setT -= dt;
      if (bowl.setT <= 0) {
        if (ph === 'punt') {
          const P = bowl.punt;
          bowl.poss = 1 - P.team; bowl.los = P.land; bowl.down = 1;
          bowl.firstAt = bowlClamp(P.land + bowlDir(bowl.poss) * 10, 10, 110);
          bowlFeed(P.tb ? 'TOUCHBACK' : 'FAIR CATCH AT THE ' + bowlYardLine(P.land));
          bowl.clock = Math.max(0, bowl.clock - 6);
          bowl.phase = 'between';
          bowlCheckClock(bowlOpenCall);
        } else {
          const F = bowl.fg, k = F.team;
          bowl.fg = null;
          if (F.good) {
            bowl.score[k] += 3;
            if (k === 0) bowlEarn(20, 'FG');
            bowlRoar(0.6, 1.2); bowlSfx('good');
            bowlCine('fg', { text: 'IT\'S GOOD!', sub: F.dist + ' YD FIELD GOAL', T: 1.8,
              after: () => (bowl.ot ? bowlFinal() : bowlCheckClock(() => bowlSetupKickoff(k))) });
          } else {
            bowlSfx('bad');
            bowl.poss = 1 - k; bowl.los = bowlClamp(bowl.los - bowlDir(k) * 7, 10.5, 109.5); bowl.down = 1;
            bowl.firstAt = bowlClamp(bowl.los + bowlDir(bowl.poss) * 10, 10, 110);
            bowlCine('fg', { text: 'NO GOOD', sub: F.dist + ' YDS · WIDE', T: 1.6, bad: true, after: () => bowlCheckClock(bowlOpenCall) });
          }
        }
      }
    }
  } else if (ph === 'final') {
    bowl.finalT += dt;
    if (bowl.result && bowl.result.won && bowl.fireworks.length < 4 && Math.random() < dt * 1.5) bowlFireworks(0);
  }
  bowl.aPress = 0; bowl.bPress = 0;
  // camera: follow the ball, lead where it's going
  const B = bowl.ball;
  if (B && (ph === 'live' || ph === 'dead' || ph === 'punt' || ph === 'fg')) {
    const C = bowl.carrier;
    bowl.camTX = B.x + (C ? C.vx * 0.5 : (B.st === 'air' ? (B.x1 - B.x) * 0.3 : 0));
  } else if (ph === 'call') bowl.camTX = bowl.los + bowlDir(bowl.poss) * 8;
  const halfVis = bowl.W / BOWL_PXX / 2;
  const tx = halfVis * 2 >= 128 ? 60 : bowlClamp(bowl.camTX, halfVis - 4, 124 - halfVis);
  bowl.camX += (tx - bowl.camX) * Math.min(1, dt * 4);
}

function bowlYardLine(x) {
  const y = Math.round(x <= 60 ? x - 10 : 110 - x);
  return y <= 0 ? 'GOAL' : String(y);
}

function stepBowl(dt, w, h) {
  syncBowl();
  if (!bowl.on) return;
  if (bowl.cv.width !== Math.ceil(w / bowl.scale)) bowlLayout();
  bowlPollPad();
  dt = Math.min(dt, 0.05);
  if (!bowl.freeze && !bowl.paused && bowl.phase !== 'tier') bowlUpdate(dt);
  bowlDraw();
}

// ---- drawing ----------------------------------------------------------------------------------
// Everything is paint on a low-res canvas, scaled up nearest-neighbour. Three
// cached layers carry the weight: the FIELD (grass, stripes, numbers, end
// zones, light pools — built once per matchup), the STANDS (a crowd of
// nuggets, rebuilt on resize) and the SPRITES (every nugget pose, painted once
// per team/pose/frame/facing/number). The frame itself is blits.

function bowlHash(n) { // deterministic [0,1) — set dressing only
  let x = (n | 0) * 374761393; x = (x ^ (x >>> 13)) * 1274126177; x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967296;
}
function bowlMix(hex, k, to) {
  const h = hex.replace('#', ''), t = (to || '#ffffff').replace('#', '');
  const c = (s, i) => parseInt(s.slice(i, i + 2), 16);
  const r = Math.round(c(h, 0) + (c(t, 0) - c(h, 0)) * k), gg = Math.round(c(h, 2) + (c(t, 2) - c(h, 2)) * k), b = Math.round(c(h, 4) + (c(t, 4) - c(h, 4)) * k);
  return 'rgb(' + r + ',' + gg + ',' + b + ')';
}
function bowlSX(x) { return Math.round(bowl.W / 2 + (x - bowl.camX) * BOWL_PXX); }
function bowlSY(y) { return Math.round(bowl.fieldTop + y * BOWL_PXY); }

// ---- the field -----------------------------------------------------------------------------
function bowlBuildField() {
  const W = Math.ceil((BOWL_LEN + 8) * BOWL_PXX), H = Math.ceil((BOWL_WID + 6) * BOWL_PXY);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const fx = (x) => Math.round((x + 4) * BOWL_PXX), fy = (y) => Math.round((y + 3) * BOWL_PXY);
  // the apron
  g.fillStyle = '#24502a'; g.fillRect(0, 0, W, H);
  // mow stripes, five yards a band
  for (let x = 10; x < 110; x += 5) {
    g.fillStyle = ((x / 5) | 0) % 2 ? '#3c8a3a' : '#46993f';
    g.fillRect(fx(x), fy(0), fx(x + 5) - fx(x), fy(BOWL_WID) - fy(0));
  }
  // end zones: the team colour, a diagonal weave
  const ez = [[0, bowlTeam(0)], [110, bowlTeam(1)]];
  for (const [x0, T] of ez) {
    g.fillStyle = T.ez; g.fillRect(fx(x0), fy(0), fx(x0 + 10) - fx(x0), fy(BOWL_WID) - fy(0));
    g.fillStyle = bowlMix(T.ez, 0.1);
    for (let k = -200; k < 200; k += 9) {
      g.beginPath();
      g.moveTo(fx(x0) + k, fy(0)); g.lineTo(fx(x0) + k + 6, fy(0)); g.lineTo(fx(x0) + k + 6 + 70, fy(BOWL_WID)); g.lineTo(fx(x0) + k + 70, fy(BOWL_WID));
      g.closePath(); g.save(); g.beginPath(); g.rect(fx(x0), fy(0), fx(x0 + 10) - fx(x0), fy(BOWL_WID) - fy(0)); g.clip();
      g.globalAlpha = 0.5; g.fill(); g.restore();
    }
  }
  // grass grain: per-pixel hash noise, so it reads as turf not paint
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, n = bowlHash(x * 7919 + y * 104729);
    const k = n < 0.08 ? -16 : n > 0.93 ? 12 : (n - 0.5) * 10;
    d[i] = bowlClamp(d[i] + k, 0, 255); d[i + 1] = bowlClamp(d[i + 1] + k * 1.2, 0, 255); d[i + 2] = bowlClamp(d[i + 2] + k * 0.6, 0, 255);
  }
  g.putImageData(img, 0, 0);
  // chalk
  const chalk = 'rgba(244,244,236,0.92)';
  g.fillStyle = chalk;
  g.fillRect(fx(0), fy(0) - 1, fx(120) - fx(0), 2);           // far sideline
  g.fillRect(fx(0), fy(BOWL_WID) - 1, fx(120) - fx(0), 2);    // near sideline
  g.fillRect(fx(0) - 1, fy(0), 2, fy(BOWL_WID) - fy(0));       // end lines
  g.fillRect(fx(120) - 1, fy(0), 2, fy(BOWL_WID) - fy(0));
  for (let x = 10; x <= 110; x += 5) {
    const w2 = x === 10 || x === 110 ? 2 : 1;
    g.globalAlpha = x % 10 === 0 ? 0.95 : 0.7;
    g.fillRect(fx(x) - (w2 > 1 ? 1 : 0), fy(0), w2, fy(BOWL_WID) - fy(0));
  }
  g.globalAlpha = 0.75;
  for (let x = 11; x < 110; x++) {
    if (x % 5 === 0) continue;
    for (const hy of [0.7, 23.6, 29.7, BOWL_WID - 1.4]) g.fillRect(fx(x), fy(hy), 1, 2);
  }
  g.globalAlpha = 1;
  // the numbers, split by their line like the real thing
  for (let x = 20; x <= 100; x += 10) {
    const n = String(x <= 60 ? x - 10 : 110 - x);
    for (const ny of [6.5, BOWL_WID - 10.5]) {
      const tc = bowlTextCv(n, 'rgba(244,244,236,0.85)', '');
      const tw = tc.width * 2, th = Math.round(tc.height * 1.6);
      g.drawImage(tc, fx(x) - tw / 2 - (n.length > 1 ? 1 : 0), fy(ny), tw + (n.length > 1 ? 2 : 0), th);
      // the arrow toward the near goal
      if (x !== 60) {
        const ax = x < 60 ? fx(x) - tw / 2 - 5 : fx(x) + tw / 2 + 3;
        const s = x < 60 ? -1 : 1;
        g.fillStyle = 'rgba(244,244,236,0.8)';
        g.beginPath(); g.moveTo(ax + (s < 0 ? 0 : 2), fy(ny) + th / 2 - 2); g.lineTo(ax + (s < 0 ? 0 : 2), fy(ny) + th / 2 + 2); g.lineTo(ax + (s < 0 ? -2 : 4), fy(ny) + th / 2); g.fill();
      }
    }
  }
  // midfield: the nugget
  const mx = fx(60), my = fy(BOWL_MID);
  g.fillStyle = 'rgba(20,40,20,0.35)'; g.beginPath(); g.ellipse(mx + 1, my + 2, 27, 15, 0, 0, 7); g.fill();
  g.fillStyle = '#c8862e'; g.beginPath(); g.ellipse(mx, my, 26, 14, -0.08, 0, 7); g.fill();
  g.fillStyle = '#e2a446'; g.beginPath(); g.ellipse(mx - 2, my - 2, 22, 11, -0.08, 0, 7); g.fill();
  for (let i = 0; i < 60; i++) {
    const a = bowlHash(i * 31) * 6.28, r = Math.sqrt(bowlHash(i * 17 + 3));
    g.fillStyle = i % 3 ? '#b8762a' : '#f6cc72';
    g.fillRect(Math.round(mx + Math.cos(a) * r * 22), Math.round(my + Math.sin(a) * r * 11), 1, 1);
  }
  bowlText(g, 'NUGMO', mx, my - 4, '#c8321f', { align: 'c', shadow: '#5a1a10' });
  // end zone names, stood on end
  for (const [x0, T] of ez) {
    const tc = bowlTextCv(T.name, bowlMix(T.c2, 0.15), '#000');
    g.save();
    g.translate(fx(x0 + 5), fy(BOWL_MID));
    g.rotate(x0 === 0 ? -Math.PI / 2 : Math.PI / 2);
    g.globalAlpha = 0.9;
    const sw = Math.min(150, tc.width * 3), sh = Math.round(tc.height * 3);
    g.drawImage(tc, -sw / 2, -sh / 2, sw, sh);
    g.restore();
  }
  // pylons
  g.fillStyle = '#ff7a1a';
  for (const x of [0, 10, 110, 120]) for (const y of [0, BOWL_WID]) g.fillRect(fx(x) - 1, fy(y) - 2, 3, 3);
  // the bench zone on the near side, dashed yellow
  g.fillStyle = 'rgba(255,210,58,0.6)';
  for (let x = 30; x < 90; x += 1.2) g.fillRect(fx(x), fy(BOWL_WID + 1.8), 4, 1);
  // stadium light pools: four banks, so the grass has hot spots and falloff
  g.globalCompositeOperation = 'soft-light';
  for (const lx of [22, 50, 70, 98]) {
    const rg = g.createRadialGradient(fx(lx), fy(BOWL_MID - 6), 4, fx(lx), fy(BOWL_MID - 6), 150);
    rg.addColorStop(0, 'rgba(255,250,220,0.55)'); rg.addColorStop(1, 'rgba(255,250,220,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  }
  g.globalCompositeOperation = 'source-over';
  // far side a touch darker (it's farther from the lights' throw)
  const vg = g.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, 'rgba(0,10,20,0.22)'); vg.addColorStop(0.5, 'rgba(0,10,20,0)'); vg.addColorStop(1, 'rgba(0,10,20,0.12)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  bowl.fieldCv = c;
}

// ---- the stands --------------------------------------------------------------------------------
const BOWL_ADS = ['GREASE GARAGE', 'NOODLE NUG', 'DRINK SAUCE', 'HOWMANYNUGGETS.COM', 'DIP HOP NIGHTLY',
  'NPD: SEE SOMETHING', 'AMMU-NUGGET', 'SAUCE WORKS', 'PIER TOURS', 'CHANGE MACHINE'];
const BOWL_AD_COL = [['#1a1a22', '#ff8a1e'], ['#5a1010', '#ffd23a'], ['#102a5a', '#26e0ff'], ['#2a0f3a', '#ff2fa0'],
  ['#0a3a1a', '#39ff7a'], ['#22252e', '#f4f0e6'], ['#3a2a0a', '#ffb020'], ['#3a1658', '#f2e0b0']];

function bowlBuildCrowd() {
  const standsH = Math.max(10, bowl.fieldTop - Math.round(3 * BOWL_PXY) - 8 - bowl.hudH);
  const W = Math.ceil((BOWL_LEN + 8) * BOWL_PXX * 0.85 + bowl.W + 40);
  const c = document.createElement('canvas'); c.width = W; c.height = standsH;
  const g = c.getContext('2d');
  // deck concrete, darker up top
  const bg = g.createLinearGradient(0, 0, 0, standsH);
  bg.addColorStop(0, '#0b0d18'); bg.addColorStop(1, '#1d2232');
  g.fillStyle = bg; g.fillRect(0, 0, W, standsH);
  const home = bowlTeam(0), away = bowlTeam(1);
  const shirts = [home.c1, home.c1, home.c2, home.c1, away.c1, away.c2, '#e8ecf0', '#3a5aa8', home.c1, '#f2ecdc'];
  const crusts = ['#d99a3c', '#c88a30', '#e6ac4e', '#b87a28', '#f0bc5c'];
  const gold = bowl.cfg && bowl.cfg.key === 'bowl';
  for (let row = 0, y = standsH - 4; y > -3; row++, y -= 4) {
    const fade = Math.min(0.75, row * 0.07);
    for (let x = (row % 2) * 2; x < W; x += 4) {
      const n = bowlHash(x * 131 + row * 977);
      if ((x % 64) < 4) continue;            // the stairs
      if (n < 0.06) continue;                // an empty seat
      g.fillStyle = shirts[(n * 997 | 0) % shirts.length];
      g.fillRect(x, y + 2, 3, 2);
      g.fillStyle = crusts[(n * 131 | 0) % crusts.length];
      g.fillRect(x, y, 3, 2);
      if (gold && n > 0.82) { g.fillStyle = '#ffe58a'; g.fillRect(x, y, 1, 1); } // golden at the edges
      if (fade > 0) { g.fillStyle = 'rgba(8,10,20,' + fade.toFixed(2) + ')'; g.fillRect(x, y, 3, 4); }
    }
  }
  // stair aisles + the rail in front of the first row
  g.fillStyle = 'rgba(120,128,150,0.35)';
  for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 3, standsH);
  g.fillStyle = '#5a6278'; g.fillRect(0, standsH - 1, W, 1);
  bowl.crowdCv = c;
  // the ad boards: one strip, scrolls with the field
  const bw = Math.ceil((BOWL_LEN + 8) * BOWL_PXX);
  const wc = document.createElement('canvas'); wc.width = bw; wc.height = 8;
  const wg = wc.getContext('2d');
  wg.fillStyle = '#0c0e16'; wg.fillRect(0, 0, bw, 8);
  let x = 2, i = 0;
  while (x < bw) {
    const txt = BOWL_ADS[i % BOWL_ADS.length], col = BOWL_AD_COL[i % BOWL_AD_COL.length];
    const w = txt.length * 6 + 12;
    wg.fillStyle = col[0]; wg.fillRect(x, 0, w, 8);
    wg.fillStyle = col[1]; wg.fillRect(x, 0, w, 1);
    bowlText(wg, txt, x + 6, 1, col[1], { shadow: '' });
    x += w + 2; i++;
  }
  bowl.adCv = wc;
}

// ---- the sprites --------------------------------------------------------------------------------
// One painter, every pose. 20×24 cells, feet at (10, 22), facing RIGHT —
// the cache flips for the left. A nugget in shoulder pads: crust body with
// crumb grain, jersey + number, helmet with stripe and facemask, stubby legs.
function bowlPaintNug(g, T, pose, f) {
  const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const crust = '#d99a3c', crustD = '#a8691f', crustL = '#f3c66a', leg = '#9a5a1e', legFar = '#7a4414', cleat = '#16161c';
  const run = pose === 'run';
  const bob = run && (f === 1 || f === 3) ? -1 : 0;
  const low = pose === 'stance' ? 2 : pose === 'block' ? 1 : 0;
  const lean = pose === 'stance' || pose === 'block' ? 1 : 0;
  // legs: far leg darker, near leg in front
  let farX = 8, nearX = 11, farY = 0, nearY = 0;
  if (run) { const sw = [3, 0, -3, 0][f]; nearX = 9 + sw; farX = 10 - sw; nearY = f === 0 ? -1 : 0; farY = f === 2 ? -1 : 0; }
  if (pose === 'stance') { farX = 6; nearX = 12; }
  if (pose === 'block') { farX = 6; nearX = 11; }
  P(farX, 17 + farY, 2, 5, legFar); P(farX, 22 + farY, 3, 1, cleat);
  // pants
  P(6 + lean, 14 + bob + low, 8, 4, T.pants); P(6 + lean, 17 + bob + low, 8, 1, bowlMix(T.pants, 0.3, '#000000'));
  P(nearX, 17 + nearY, 2, 5, leg); P(nearX, 22 + nearY, 3, 1, cleat);
  // the nugget body: a lumpy ellipse with crumb grain
  const cx = 10 + lean, cy = 11 + bob + low;
  for (let y = -6; y <= 5; y++) for (let x = -6; x <= 6; x++) {
    const lump = (bowlHash((x + 9) * 13 + (y + 9) * 7) - 0.5) * 0.18;
    if ((x * x) / 36 + (y * y) / 30 > 1 + lump) continue;
    let col = crust;
    if (x + y < -5) col = crustL; else if (x + y > 4) col = crustD;
    if (bowlHash((x + 20) * 31 + (y + 20) * 17) > 0.86) col = crustD;
    P(cx + x, cy + y, 1, 1, col);
  }
  // jersey over the torso (shoulder pads make it wider up top)
  for (let y = -2; y <= 3; y++) for (let x = -6; x <= 6; x++) {
    const rx = y <= -1 ? 6.6 : 5.6;
    if ((x * x) / (rx * rx) + (y * y) / 30 > 1) continue;
    P(cx + x, cy + y, 1, 1, x > 3 ? bowlMix(T.c1, 0.25, '#000000') : x < -3 ? bowlMix(T.c1, 0.12) : T.c1);
  }
  P(cx - 6, cy - 1, 1, 2, T.c2); P(cx + 6, cy - 1, 1, 2, T.c2);   // sleeve stripes
  // arms
  if (pose === 'celeb') { P(cx - 6, cy - 9, 2, 5, crust); P(cx + 5, cy - 9, 2, 5, crust); }
  else if (pose === 'throw') { P(cx - 4, cy - 9, 2, 5, crust); P(cx - 5, cy - 10, 3, 2, crustL); }
  else if (pose === 'stance') { P(cx + 3, cy + 2, 2, 8 - low, crust); }
  else if (pose === 'block') { P(cx + 5, cy - 2, 3, 2, crust); P(cx + 5, cy + 1, 3, 2, crustD); }
  else if (run) { const ax = [3, 1, -2, 1][f]; P(cx + ax, cy + 1, 2, 3, crustL); }
  else { P(cx + 2, cy + 1, 2, 3, crust); }
  // the helmet
  const hx = 11 + lean * 2, hy = 4 + bob + low;
  for (let y = -3; y <= 3; y++) for (let x = -4; x <= 4; x++) {
    if ((x * x) / 18 + (y * y) / 11 > 1) continue;
    let col = T.helm;
    if (y <= -2 && x < 2) col = bowlMix(T.helm, 0.35);
    if (x >= 3 || y >= 2) col = bowlMix(T.helm, 0.3, '#000000');
    P(hx + x, hy + y, 1, 1, col);
  }
  P(hx - 3, hy - 3, 6, 1, T.stripe);                    // the stripe along the crown
  P(hx + 3, hy - 1, 2, 1, T.mask); P(hx + 4, hy - 1, 1, 4, T.mask); P(hx + 3, hy + 2, 2, 1, T.mask); // facemask
  P(hx + 2, hy, 1, 1, '#fff6e0'); P(hx + 3, hy, 1, 1, '#141418'); // an eye, through the bars
  P(hx - 1, hy, 1, 1, bowlMix(T.helm, 0.55, '#000000'));          // ear hole
}

function bowlSprite(tk, pose, f, facing, num) {
  const key = tk + pose + f + facing + num;
  let c = bowl.sprites.get(key);
  if (c) return c;
  const T = BOWL_TEAMS[tk];
  const base = document.createElement('canvas'); base.width = 20; base.height = 24;
  const bg = base.getContext('2d');
  const paintPose = pose === 'down' || pose === 'dive' ? 'stand' : pose;
  bowlPaintNug(bg, T, paintPose, f);
  c = document.createElement('canvas');
  const g = c.getContext('2d');
  if (pose === 'down' || pose === 'dive') {
    c.width = 26; c.height = 24;
    g.save();
    g.translate(13, pose === 'down' ? 18 : 15);
    g.rotate(pose === 'down' ? (facing > 0 ? -Math.PI / 2 : Math.PI / 2) : (facing > 0 ? 1.2 : -1.2));
    if (facing < 0) g.scale(-1, 1);
    g.drawImage(base, -10, -18);
    g.restore();
  } else {
    c.width = 20; c.height = 24;
    if (facing < 0) { g.translate(20, 0); g.scale(-1, 1); }
    g.drawImage(base, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // the number, on the jersey, never mirrored
    if (num) {
      const s = String(num), dx0 = facing > 0 ? 6 : 8;
      const low = pose === 'stance' ? 2 : pose === 'block' ? 1 : 0, bob = pose === 'run' && (f === 1 || f === 3) ? -1 : 0;
      for (let k = 0; k < s.length && k < 2; k++) {
        const gl = BOWL_DIG[+s[k]];
        g.fillStyle = T.num;
        for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) if (gl[r] & (4 >> b)) g.fillRect(dx0 + k * 4 + b - (s.length === 1 ? -2 : 0), 9 + r + bob + low, 1, 1);
      }
    }
  }
  bowl.sprites.set(key, c);
  return c;
}

function bowlPoseOf(p) {
  if (p.downT > 0) return ['down', 0];
  if (p.diveT > 0) return ['dive', 0];
  if (p.celebT > 0) return [((bowl.t * 4) | 0) % 2 ? 'celeb' : 'stand', 0];
  if (p.throwT > 0) return ['throw', 0];
  if (p.eng) return ['block', 0];
  const sp = Math.hypot(p.vx, p.vy);
  if ((bowl.phase === 'snap' || bowl.phase === 'call') && (p.pos.startsWith('OL') || p.pos.startsWith('D') && p.pos !== 'DT' ? true : p.pos === 'DT')) {
    if (bowl.kind === 'run' || bowl.kind === 'pass') return ['stance', 0];
  }
  if (sp > 0.6) return ['run', (p.anim | 0) % 4];
  return ['stand', 0];
}

// ---- the frame --------------------------------------------------------------------------------
function bowlDraw() {
  const g = bowl.g, W = bowl.W, H = bowl.Hh;
  if (!g) return;
  g.imageSmoothingEnabled = false;
  if (bowl.phase === 'tier' || !bowl.stats) { bowlDrawIdle(g, W, H); return; }
  if (!bowl.fieldCv) bowlBuildField();
  if (!bowl.crowdCv) bowlBuildCrowd();
  g.save();
  if (bowl.shakeT > 0 && !ArcadeKit.reduceMotion) g.translate(Math.round(bowlRnd(-1, 1) * bowl.shakeMag), Math.round(bowlRnd(-1, 1) * bowl.shakeMag));
  // night sky
  const sky = g.createLinearGradient(0, 0, 0, bowl.fieldTop);
  sky.addColorStop(0, '#05060e'); sky.addColorStop(1, '#141a2c');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  bowlDrawStands(g, W, H);
  // the field
  const ox = bowlSX(-4), oy = bowlSY(-3);
  g.drawImage(bowl.fieldCv, ox, oy);
  // the near wall and whatever's below it
  const nearY = oy + bowl.fieldCv.height;
  g.fillStyle = '#0e1220'; g.fillRect(0, nearY, W, H - nearY);
  g.drawImage(bowl.adCv, ox - 37, nearY + 1);
  if (H - nearY > 30) bowlDrawNearStands(g, W, H, nearY + 10);
  // lines of the moment: scrimmage (blue) and the line to gain (yellow)
  const scrim = bowl.phase === 'call' || bowl.phase === 'snap' || bowl.phase === 'live' || bowl.phase === 'dead';
  if (scrim && bowl.kind !== 'kick') {
    const top = bowlSY(0), bot = bowlSY(BOWL_WID);
    g.fillStyle = 'rgba(80,150,255,0.8)'; g.fillRect(bowlSX(bowl.losAtSnap != null && bowl.phase !== 'call' ? bowl.losAtSnap : bowl.los), top, 1, bot - top);
    if (Math.abs(bowl.firstAt - bowlGoal(bowl.offAtSnap != null ? bowl.offAtSnap : bowl.poss)) > 0.5) {
      g.fillStyle = 'rgba(255,214,40,0.85)'; g.fillRect(bowlSX(bowl.firstAt), top, 1, bot - top);
    }
    // the chain gang's down marker on the near side
    const dmx = bowlSX(bowl.phase === 'call' ? bowl.los : bowl.losAtSnap);
    g.fillStyle = '#ff7a1a'; g.fillRect(dmx, bot + 3, 1, 7); g.fillRect(dmx - 2, bot + 2, 5, 3);
    bowlText(g, String(bowl.down), dmx, bot + 2, '#fff', { align: 'c', shadow: '' });
  }
  // shadows first, then bodies sorted by depth
  const ps = bowl.players.slice().sort((a, b) => a.y - b.y);
  g.fillStyle = 'rgba(0,0,0,0.32)';
  for (const p of ps) { const sx = bowlSX(p.x), sy = bowlSY(p.y); if (sx < -20 || sx > W + 20) continue; g.fillRect(sx - 5, sy, 10, 2); g.fillRect(sx - 4, sy - 1, 8, 1); }
  const B = bowl.ball;
  if (B && B.st === 'air') { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(bowlSX(B.x) - 1, bowlSY(B.y), 3, 1); }
  // goal posts stand behind/in front by depth like everything else
  const drawPosts = (x) => {
    const sx = bowlSX(x); if (sx < -10 || sx > W + 10) return;
    const sy0 = bowlSY(BOWL_MID - 3.1), sy1 = bowlSY(BOWL_MID + 3.1), sb = bowlSY(BOWL_MID);
    g.fillStyle = '#9aa0ae'; g.fillRect(sx, sb - 18, 1, 18);
    g.fillStyle = '#ffd23a';
    g.fillRect(sx, sy0 - 18, 1, sy1 - sy0); // crossbar (the squash makes it a stroke)
    g.fillRect(sx - 1, sy0 - 44, 2, 26); g.fillRect(sx - 1, sy1 - 44, 2, 26);
    g.fillStyle = '#c8a022'; g.fillRect(sx + 1, sy0 - 44, 1, 26); g.fillRect(sx + 1, sy1 - 44, 1, 26);
    g.fillStyle = '#ff2fa0'; g.fillRect(sx - 1, sy0 - 46, 2, 2); g.fillRect(sx - 1, sy1 - 46, 2, 2);
  };
  let postsDrawn = false;
  for (const p of ps) {
    if (!postsDrawn && p.y > BOWL_MID) { drawPosts(0); drawPosts(120); postsDrawn = true; }
    bowlDrawPlayer(g, p);
  }
  if (!postsDrawn) { drawPosts(0); drawPosts(120); }
  // dust and turf
  for (const q of bowl.parts) {
    g.globalAlpha = Math.min(1, q.life * 2);
    g.fillStyle = q.c; g.fillRect(bowlSX(q.x), bowlSY(q.y) - Math.round(q.h * 5), 1, 1);
  }
  g.globalAlpha = 1;
  // the ball in flight (drawn last: it is above everyone)
  if (B && (B.st === 'air' || B.st === 'tee' || B.st === 'set' || (B.st === 'dead' && bowl.phase !== 'live'))) {
    const bx = bowlSX(B.x), by = bowlSY(B.y) - Math.round((B.h || 0) * 5.5) - (B.st === 'tee' || B.st === 'set' ? 1 : 3);
    if ((B.h || 0) > 3) { g.save(); g.translate(bx, by); g.scale(2, 2); bowlDrawBall(g, 0, 0, B.spin || 0); g.restore(); }
    else bowlDrawBall(g, bx, by, B.spin || 0);
  }
  bowlDrawMarkers(g);
  g.restore();
  // lights: a soft vignette so the field glows
  bowlDrawVignette(g, W, H);
  bowlDrawHud(g, W, H);
  if (bowl.phase !== 'cine' && bowl.phase !== 'final') bowlDrawFeed(g, W, H);
  if (bowl.phase === 'call') bowlDrawCall(g, W, H);
  if (bowl.phase === 'fg' && bowl.fg && !bowl.fg.done && bowlHuman(bowl.fg.team)) bowlDrawFGMeter(g, W, H);
  if (bowl.phase === 'cine' && bowl.cine) bowlDrawCine(g, W, H);
  if (bowl.phase === 'final') bowlDrawFinal(g, W, H);
  bowlDrawFireworks(g, W, H);
  if (bowl.paused) {
    g.fillStyle = 'rgba(4,6,14,0.7)'; g.fillRect(0, 0, W, H);
    bowlText(g, 'TIME OUT', W / 2, H / 2 - 14, '#ffd23a', { align: 'c', scale: 2 });
    bowlText(g, 'ESC RESUME · Q QUIT', W / 2, H / 2 + 6, '#bfc6ff', { align: 'c' });
  }
  bowlDrawTouch(g, W, H);
}

function bowlDrawIdle(g, W, H) {
  g.fillStyle = '#0a0d18'; g.fillRect(0, 0, W, H);
  const t = bowl.t;
  for (let i = 0; i < 40; i++) {
    const x = (bowlHash(i * 7) * W + t * 6 * (i % 3 + 1)) % W, y = bowlHash(i * 13) * H;
    g.fillStyle = 'rgba(255,210,58,' + (0.1 + 0.15 * bowlHash(i)).toFixed(2) + ')'; g.fillRect(x | 0, y | 0, 1, 1);
  }
  bowlText(g, 'NUGMO BOWL', W / 2, H * 0.14, '#ffd23a', { align: 'c', scale: 3, shadow: '#7a1a10' });
}

function bowlDrawStands(g, W, H) {
  const C = bowl.crowdCv, top = bowl.hudH, adY = bowl.fieldTop - Math.round(3 * BOWL_PXY) - 8;
  const off = Math.round((bowl.camX + 4) * BOWL_PXX * 0.85 - W / 2 + 20);
  const hype = bowl.crowdHype > 0 ? Math.min(2, bowl.crowdHype) : 0;
  const ch = C.height, y0 = adY - ch;
  // the crowd: columns bob with the hype (the wave, when it's loud)
  if (hype > 0 && !ArcadeKit.reduceMotion) {
    for (let x = 0; x < W; x += 8) {
      const dy = Math.round(Math.max(0, Math.sin(bowl.t * 9 - x * 0.05)) * hype * 1.5);
      g.drawImage(C, off + x, 0, 8, ch, x, y0 - dy, 8, ch);
    }
  } else g.drawImage(C, off, 0, W, ch, 0, y0, W, ch);
  // flash bulbs
  for (let i = 0; i < 6 + hype * 12; i++) {
    if (Math.random() > 0.35) continue;
    g.fillStyle = '#fffbe8'; g.fillRect((Math.random() * W) | 0, y0 + ((Math.random() * ch) | 0), 1, 1);
  }
  // the light banks along the roof line, haloed
  if (y0 > top + 2 || true) {
    for (const lx of [22, 50, 70, 98]) {
      const sx = Math.round(W / 2 + ((lx + 4) * BOWL_PXX * 0.85 - (bowl.camX + 4) * BOWL_PXX * 0.85));
      if (sx < -40 || sx > W + 40) continue;
      const ly = Math.max(top + 3, y0 + 2);
      g.globalCompositeOperation = 'lighter';
      const rg = g.createRadialGradient(sx, ly, 1, sx, ly, 26);
      rg.addColorStop(0, 'rgba(255,248,220,0.55)'); rg.addColorStop(1, 'rgba(255,248,220,0)');
      g.fillStyle = rg; g.fillRect(sx - 26, ly - 26, 52, 52);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#2a2e3c'; g.fillRect(sx - 9, ly - 3, 18, 6);
      g.fillStyle = '#fffbe8';
      for (let k = 0; k < 4; k++) { g.fillRect(sx - 8 + k * 4, ly - 2, 3, 2); g.fillRect(sx - 8 + k * 4, ly + 1, 3, 1); }
    }
  }
  // the ad wall + the track
  g.drawImage(bowl.adCv, bowlSX(-4), adY);
  g.fillStyle = '#1a3a20'; g.fillRect(0, adY + 8, W, bowlSY(-3) - adY - 8);
}

function bowlDrawNearStands(g, W, H, y0) {
  // portrait screens and tall windows: the near stands, nearer = bigger, darker
  const C = bowl.crowdCv, rows = Math.min(H - y0, C.height * 2);
  const off = Math.round((bowl.camX + 4) * BOWL_PXX * 1.15 - W / 2);
  g.save();
  g.translate(0, y0 + rows);
  g.scale(1, -1);
  g.globalAlpha = 0.55;
  g.drawImage(C, Math.max(0, off % (C.width - W)), 0, W / 1.5, C.height, 0, 0, W, rows);
  g.restore();
  g.globalAlpha = 1;
}

function bowlDrawBall(g, x, y, spin) {
  const side = Math.floor(spin) % 2 === 0;
  g.fillStyle = '#3a1e0a';
  if (side) { g.fillRect(x - 2, y - 1, 5, 3); g.fillStyle = '#8a4a1e'; g.fillRect(x - 1, y - 1, 3, 2); g.fillStyle = '#fff'; g.fillRect(x, y - 1, 1, 1); }
  else { g.fillRect(x - 1, y - 2, 3, 4); g.fillStyle = '#8a4a1e'; g.fillRect(x, y - 1, 1, 2); }
}

function bowlDrawPlayer(g, p) {
  const sx = bowlSX(p.x), sy = bowlSY(p.y);
  if (sx < -20 || sx > bowl.W + 20) return;
  const [pose, f] = bowlPoseOf(p);
  const tk = bowl.teams[p.team];
  const c = bowlSprite(tk, pose, f, p.fx, p.num);
  const ox = pose === 'down' || pose === 'dive' ? 13 : 10;
  g.drawImage(c, sx - ox, sy - 22);
  // the ball, tucked
  if (p === bowl.carrier && bowl.ball && bowl.ball.st === 'held' && pose !== 'down') {
    bowlDrawBall(g, sx + p.fx * 3, sy - 10, 0);
  }
}

function bowlDrawMarkers(g) {
  const t = bowl.t;
  const c = bowl.ctl;
  if (c && (bowl.phase === 'live' || bowl.phase === 'snap')) {
    const sx = bowlSX(c.x), sy = bowlSY(c.y);
    const bob = Math.round(Math.sin(t * 8) * 1);
    const col = c.team === 0 ? '#ffd23a' : '#fff';
    g.fillStyle = '#000'; g.fillRect(sx - 3, sy - 31 + bob, 7, 2); g.fillRect(sx - 2, sy - 29 + bob, 5, 1); g.fillRect(sx - 1, sy - 28 + bob, 3, 1);
    g.fillStyle = col; g.fillRect(sx - 2, sy - 31 + bob, 5, 1); g.fillRect(sx - 1, sy - 30 + bob, 3, 1); g.fillRect(sx, sy - 29 + bob, 1, 1);
    g.strokeStyle = 'rgba(255,210,58,0.6)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(sx + 0.5, sy + 0.5, 7, 2.5, 0, 0, 7); g.stroke();
  }
  // the pass target
  if (bowl.phase === 'live' && bowl.preThrow && bowl.target && bowlHuman(bowl.poss)) {
    const r = bowl.target, sx = bowlSX(r.x), sy = bowlSY(r.y);
    const k = ((t * 6) | 0) % 2, col = k ? '#26e0ff' : '#ffffff';
    const x0 = sx - 9, x1 = sx + 9, y0 = sy - 26, y1 = sy + 3;
    g.fillStyle = '#000';
    for (const [x, y, w, h] of [[x0, y0, 4, 2], [x1 - 3, y0, 4, 2], [x0, y0, 2, 4], [x1 - 1, y0, 2, 4], [x0, y1 - 1, 4, 2], [x1 - 3, y1 - 1, 4, 2], [x0, y1 - 3, 2, 4], [x1 - 1, y1 - 3, 2, 4]]) g.fillRect(x + 1, y + 1, w, h);
    g.fillStyle = col;
    for (const [x, y, w, h] of [[x0, y0, 4, 2], [x1 - 3, y0, 4, 2], [x0, y0, 2, 4], [x1 - 1, y0, 2, 4], [x0, y1 - 1, 4, 2], [x1 - 3, y1 - 1, 4, 2], [x0, y1 - 3, 2, 4], [x1 - 1, y1 - 3, 2, 4]]) g.fillRect(x, y, w, h);
    bowlText(g, 'B', x1 + 3, y0 - 2, col);
  }
  // the grapple meter
  const G = bowl.grap;
  if (G && bowl.carrier) {
    const sx = bowlSX(bowl.carrier.x), sy = bowlSY(bowl.carrier.y) - 36;
    g.fillStyle = '#000'; g.fillRect(sx - 13, sy - 1, 26, 5);
    g.fillStyle = '#5a1010'; g.fillRect(sx - 12, sy, 24, 3);
    g.fillStyle = G.m > 0.66 ? '#39ff7a' : G.m > 0.33 ? '#ffd23a' : '#ff5a4a';
    g.fillRect(sx - 12, sy, Math.round(24 * bowlClamp(G.m, 0, 1)), 3);
    if (((t * 8) | 0) % 2) bowlText(g, 'MASH A!', sx, sy - 9, '#fff', { align: 'c' });
  }
}

let bowlVig = null;
function bowlDrawVignette(g, W, H) {
  if (!bowlVig || bowlVig.width !== W || bowlVig.height !== H) {
    bowlVig = document.createElement('canvas'); bowlVig.width = W; bowlVig.height = H;
    const v = bowlVig.getContext('2d');
    const rg = v.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.75);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,8,0.5)');
    v.fillStyle = rg; v.fillRect(0, 0, W, H);
  }
  g.drawImage(bowlVig, 0, 0);
}

function bowlDrawFireworks(g, W, H) {
  if (!bowl.fireworks.length) return;
  g.globalCompositeOperation = 'lighter';
  for (const f of bowl.fireworks) {
    if (f.t < 0) continue;
    const cx = f.x * W, cy = f.y * H + bowl.hudH, r = f.t * 34, a = Math.max(0, 1 - f.t / 1.6);
    g.fillStyle = f.c; g.globalAlpha = a;
    for (let k = 0; k < 16; k++) {
      const an = (k / 16) * 6.283 + f.x * 9;
      g.fillRect(Math.round(cx + Math.cos(an) * r), Math.round(cy + Math.sin(an) * r + f.t * f.t * 8), 1, 1);
      g.fillRect(Math.round(cx + Math.cos(an) * r * 0.7), Math.round(cy + Math.sin(an) * r * 0.7 + f.t * f.t * 6), 1, 1);
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

function bowlDownText() {
  const o = bowl.poss, n = ['1ST', '2ND', '3RD', '4TH'][Math.min(3, bowl.down - 1)];
  const goal = bowlGoal(o);
  const togo = Math.abs(bowl.firstAt - bowl.los);
  const amt = Math.abs(goal - bowl.firstAt) < 0.5 ? 'GOAL' : String(Math.max(1, Math.round(togo)));
  const own = (o === 0 && bowl.los < 60) || (o === 1 && bowl.los > 60);
  const yl = bowlYardLine(bowl.los);
  const side = yl === '50' ? '' : (own ? bowlTeam(o).abbr + ' ' : bowlTeam(1 - o).abbr + ' ');
  return n + ' & ' + amt + ' · BALL ON ' + side + yl;
}

function bowlDrawHud(g, W, H) {
  const h = bowl.hudH, y = h - 16;
  g.fillStyle = '#05060c'; g.fillRect(0, 0, W, h);
  g.fillStyle = '#2a3048'; g.fillRect(0, h - 1, W, 1);
  const A = bowlTeam(0), Bt = bowlTeam(1);
  const clock = Math.ceil(bowl.clock), mm = Math.floor(clock / 60), ss = String(clock % 60).padStart(2, '0');
  const has = (bowl.phase === 'live' || bowl.phase === 'call' || bowl.phase === 'snap' || bowl.phase === 'dead') ? bowl.poss : -1;
  // team plates at the two edges (the storm pill owns the middle of this bar)
  const plate = (x0, T, score, ball) => {
    const w = 40;
    g.fillStyle = '#000'; g.fillRect(x0 - 1, y + 1, w + 2, 12);
    g.fillStyle = T.c1; g.fillRect(x0, y + 2, w, 9);
    g.fillStyle = T.c2; g.fillRect(x0, y + 11, w, 1);
    bowlText(g, T.abbr, x0 + 3, y + 3, '#fff');
    bowlText(g, String(score), x0 + w - 3, y + 3, '#fff', { align: 'r' });
    if (ball) bowlDrawBall(g, x0 + w + 5, y + 7, 0);
  };
  plate(3, A, bowl.score[0], has === 0);
  plate(W - 43, Bt, bowl.score[1], false);
  if (has === 1) bowlDrawBall(g, W - 49, y + 7, 0);
  // the game clock sits beside the away plate
  const qtxt = (bowl.ot ? 'OT' : 'Q' + bowl.q) + ' ' + mm + ':' + ss;
  const hot = bowl.clock < 20 && bowl.phase === 'live' && ((bowl.t * 4) | 0) % 2;
  g.fillStyle = '#000'; g.fillRect(W - 58 - bowlTextW(qtxt), y + 1, bowlTextW(qtxt) + 6, 12);
  bowlText(g, qtxt, W - 55, y + 3, hot ? '#ff5a4a' : '#ffd23a', { align: 'r' });
  // down & distance: a chyron tucked under the bar, left side
  if (bowl.kind !== 'kick' && (bowl.phase === 'call' || bowl.phase === 'snap' || bowl.phase === 'live' || bowl.phase === 'dead')) {
    const dt = bowlDownText(), w = bowlTextW(dt) + 8;
    g.fillStyle = 'rgba(4,6,14,0.82)'; g.fillRect(3, h + 1, w, 10);
    g.fillStyle = bowlTeam(bowl.poss).c1; g.fillRect(3, h + 1, 2, 10);
    bowlText(g, dt, 8, h + 2, '#e8ecf0', { shadow: '' });
  }
}

function bowlDrawFeed(g, W, H) {
  const bot = bowlSY(BOWL_WID) - 12;
  if (bowl.phase !== 'call') bowl.feed.forEach((f, i) => {
    g.globalAlpha = Math.min(1, f.t * 2);
    const y = bot - (bowl.feed.length - 1 - i) * 10, w = bowlTextW(f.text) + 8;
    g.fillStyle = 'rgba(4,6,14,0.62)'; g.fillRect(Math.round(W / 2 - w / 2), y - 2, w, 10);
    bowlText(g, f.text, W / 2, y, f.color, { align: 'c' });
  });
  g.globalAlpha = 1;
  const b = bowl.banner;
  if (b && bowl.phase !== 'call') {
    const k = Math.min(1, b.t * 6), y = bowl.fieldTop + 18;
    const sc = W > 360 ? 2 : 1;
    g.globalAlpha = Math.min(1, (b.T - b.t) * 4);
    const tw = bowlTextW(b.text, sc) + 14;
    g.fillStyle = 'rgba(4,6,14,0.75)'; g.fillRect(Math.round(W / 2 - (tw / 2) * k), y - 3, Math.round(tw * k), 9 * sc + 6 + (b.sub ? 9 : 0));
    if (k >= 1) {
      bowlText(g, b.text, W / 2, y, b.color, { align: 'c', scale: sc });
      if (b.sub) bowlText(g, b.sub, W / 2, y + 8 * sc + 1, '#bfc6ff', { align: 'c' });
    }
    g.globalAlpha = 1;
  }
}

// ---- the playbook ------------------------------------------------------------------------------
function bowlDrawCall(g, W, H) {
  g.fillStyle = 'rgba(4,6,16,0.84)'; g.fillRect(0, bowl.hudH, W, H - bowl.hudH);
  const off = bowl.poss === 0;
  const plays = bowlPlays(off ? 0 : 1);
  const cw = Math.min(196, Math.floor((W - 24) / 2)), chh = Math.min(66, Math.floor((H - bowl.hudH - 74) / 2));
  const gx = Math.round(W / 2 - cw - 4), gy = Math.round(Math.max(bowl.hudH + 26, H / 2 - chh - 18));
  const T = bowlTeam(off ? 0 : 1);
  const title = off ? 'TENDERS OFFENSE' : 'DEFENSE · GUESS THEIR PLAY';
  bowlText(g, title, W / 2, gy - (W > 360 ? 27 : 20), off ? '#ffd23a' : '#26e0ff', { align: 'c', scale: W > 360 ? 2 : 1 });
  bowlText(g, bowlDownText(), W / 2, gy - 9, '#bfc6ff', { align: 'c' });
  bowl.hit.cards = []; bowl.hit.extra = [];
  plays.forEach((pl, i) => {
    const x = gx + (i % 2) * (cw + 8), y = gy + ((i / 2) | 0) * (chh + 8);
    const sel = bowl.callSel === i;
    g.fillStyle = sel ? '#1c2a48' : '#0f1628'; g.fillRect(x, y, cw, chh);
    g.fillStyle = sel ? (((bowl.t * 5) | 0) % 2 ? '#ffd23a' : '#fff6d8') : '#2a3a5a';
    g.fillRect(x, y, cw, 1); g.fillRect(x, y + chh - 1, cw, 1); g.fillRect(x, y, 1, chh); g.fillRect(x + cw - 1, y, 1, chh);
    g.fillStyle = pl.run ? '#c8321f' : '#1f6fc8'; g.fillRect(x + 3, y + 3, 9, 9);
    bowlText(g, String(i + 1), x + 5, y + 4, '#fff', { shadow: '' });
    bowlText(g, pl.name, x + 16, y + 4, sel ? '#ffd23a' : '#e8ecf0');
    bowlText(g, pl.run ? 'RUN' : 'PASS', x + cw - 4, y + 4, pl.run ? '#ff8a7a' : '#7ab8ff', { align: 'r', shadow: '' });
    bowlDrawDiagram(g, pl, x + 4, y + 15, cw - 8, chh - 19, T);
    bowl.hit.cards.push({ x, y, w: cw, h: chh, n: i });
  });
  let fy = gy + 2 * (chh + 8);
  if (off && bowl.down === 4) {
    const fgd = bowlFGDist();
    const opts = [['5 PUNT', 'punt', true], ['6 FIELD GOAL ' + fgd + ' YDS', 'fg', fgd <= 62]];
    let x = W / 2 - (bowlTextW(opts[0][0]) + bowlTextW(opts[1][0]) + 36) / 2;
    for (const [txt, n, ok] of opts) {
      const w = bowlTextW(txt) + 12;
      g.fillStyle = ok ? '#2a1a08' : '#141414'; g.fillRect(x, fy, w, 12);
      g.fillStyle = ok ? '#ffb020' : '#444'; g.fillRect(x, fy, w, 1); g.fillRect(x, fy + 11, w, 1);
      bowlText(g, txt, x + 6, fy + 3, ok ? '#ffd23a' : '#666');
      if (ok) bowl.hit.extra.push({ x, y: fy, w, h: 12, n });
      x += w + 12;
    }
    fy += 16;
  }
  if (!off) {
    const pos = bowl.defPick || 'DE2', r = BOWL_ROSTER.tenders[pos];
    const who = 'B · YOU PLAY #' + r[1] + ' ' + r[0] + ' (' + pos.replace(/\d$/, '') + ')';
    bowlText(g, who, W / 2, fy + 1, '#ffd23a', { align: 'c' });
    fy += 11;
  }
  const hint = off ? '1-4 OR TAP · ARROWS + A · THE DEFENSE IS GUESSING TOO' : 'PICK THE ONE THEY\'LL RUN · GUESS RIGHT AND IT\'S BLOWN UP';
  if (fy + 4 < H) bowlText(g, hint, W / 2, fy + 2, '#6a7290', { align: 'c', shadow: '' });
}

function bowlDrawDiagram(g, pl, x, y, w, h, T) {
  g.fillStyle = '#183a1c'; g.fillRect(x, y, w, h);
  g.fillStyle = '#21492a';
  for (let k = 0; k < w; k += 10) g.fillRect(x + k, y, 1, h);
  // downfield -7..+36 → width, lateral -20..20 → height
  const mx = (dx) => Math.round(x + ((dx + 7) / 43) * w), my = (dy) => Math.round(y + h / 2 + (dy / 40) * h * 0.92);
  g.fillStyle = 'rgba(80,150,255,0.8)'; g.fillRect(mx(0), y, 1, h);
  const spots = { QB: [-1.5, 0], RB: [-5.5, 0], WR1: [-0.7, -17], WR2: [-0.7, 16], TE: [-0.8, 6],
    OL1: [-0.6, -3.3], OL2: [-0.6, -1.1], OL3: [-0.6, 1.1], OL4: [-0.6, 3.3] };
  const path = (pos, pts, col) => {
    const s = spots[pos];
    g.strokeStyle = col; g.lineWidth = 1;
    g.beginPath(); g.moveTo(mx(s[0]) + 0.5, my(s[1]) + 0.5);
    let lx = s[0], ly = s[1], px = lx, py = ly;
    for (const [dx, dy] of pts) { px = lx; py = ly; lx = s[0] + Math.min(dx, 34); ly = s[1] + dy; g.lineTo(mx(lx) + 0.5, my(ly) + 0.5); }
    g.stroke();
    // arrowhead
    const ang = Math.atan2(my(ly) - my(py), mx(lx) - mx(px));
    g.fillStyle = col;
    g.beginPath(); g.moveTo(mx(lx) + Math.cos(ang) * 2, my(ly) + Math.sin(ang) * 2);
    g.lineTo(mx(lx) + Math.cos(ang + 2.4) * 3, my(ly) + Math.sin(ang + 2.4) * 3);
    g.lineTo(mx(lx) + Math.cos(ang - 2.4) * 3, my(ly) + Math.sin(ang - 2.4) * 3); g.fill();
  };
  if (pl.run) path('RB', pl.rb.map(([a, b]) => [Math.min(a, 14), b]), '#ff6a4a');
  else for (const pos in pl.routes) path(pos, pl.routes[pos], pos === pl.primary ? '#ffd23a' : '#e8e4c0');
  for (const pos in spots) {
    const s = spots[pos];
    g.fillStyle = '#000'; g.fillRect(mx(s[0]) - 1, my(s[1]) - 1, 3, 3);
    g.fillStyle = pos === 'RB' && pl.run ? '#ffd23a' : T.c2; g.fillRect(mx(s[0]) - 1, my(s[1]) - 1, 2, 2);
  }
}

function bowlDrawFGMeter(g, W, H) {
  const F = bowl.fg, w = 90, x = Math.round(W / 2 - w / 2), y = Math.round(bowlSY(BOWL_WID) - 24);
  g.fillStyle = 'rgba(4,6,14,0.85)'; g.fillRect(x - 6, y - 12, w + 12, 26);
  bowlText(g, 'A TO KICK · ' + F.dist + ' YDS', W / 2, y - 9, '#ffd23a', { align: 'c' });
  g.fillStyle = '#3a1010'; g.fillRect(x, y, w, 6);
  g.fillStyle = '#1f8a3a'; const ww = Math.max(2, Math.round(F.win * 2 * w)); g.fillRect(Math.round(x + w / 2 - ww / 2), y, ww, 6);
  g.fillStyle = '#fff'; g.fillRect(Math.round(x + F.m * w), y - 2, 1, 10);
}

// ---- the cinema: Tecmo's cut-ins -----------------------------------------------------------------
function bowlDrawCine(g, W, H) {
  const c = bowl.cine, t = c.t;
  const k = Math.min(1, t * 5);
  g.fillStyle = 'rgba(2,3,8,' + (0.55 * k).toFixed(2) + ')'; g.fillRect(0, bowl.hudH, W, H - bowl.hudH);
  const bw = Math.min(W - 16, 360), bh = Math.min(H - bowl.hudH - 16, 150);
  const bx = Math.round(W / 2 - bw / 2), by = Math.round(bowl.hudH + (H - bowl.hudH) / 2 - bh / 2);
  const ih = Math.round(bh * k);
  const iy = by + Math.round((bh - ih) / 2);
  // the frame
  g.fillStyle = '#ffd23a'; g.fillRect(bx - 2, iy - 2, bw + 4, ih + 4);
  g.fillStyle = '#fff6d8'; g.fillRect(bx - 1, iy - 1, bw + 2, ih + 2);
  g.fillStyle = '#0b0f1e'; g.fillRect(bx, iy, bw, ih);
  if (k < 1) return;
  g.save();
  g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
  // backdrop: the stands, zoomed, and a strip of turf
  if (bowl.crowdCv) {
    const C = bowl.crowdCv;
    g.drawImage(C, (t * 30) % Math.max(1, C.width - bw / 2), 0, bw / 2, C.height, bx, by, bw, Math.round(bh * 0.6));
    g.fillStyle = 'rgba(11,15,30,0.35)'; g.fillRect(bx, by, bw, Math.round(bh * 0.6));
  }
  const turfY = by + Math.round(bh * 0.6);
  g.fillStyle = '#3c8a3a'; g.fillRect(bx, turfY, bw, bh - Math.round(bh * 0.6));
  g.fillStyle = '#46993f';
  for (let i = 0; i < bw; i += 24) g.fillRect(bx + i + ((t * 60) | 0) % 24, turfY, 12, bh);
  g.fillStyle = 'rgba(244,244,236,0.8)'; g.fillRect(bx, turfY + 3, bw, 1);
  const who = c.who, tk = who ? bowl.teams[who.team] : 'tenders';
  const S = Math.max(2, Math.min(5, Math.floor(bh / 34)));
  const feetY = by + bh - 10;
  const big = (pose, f, facing, x, num) => {
    const sp = bowlSprite(tk, pose, f, facing, num);
    g.drawImage(sp, Math.round(x - (sp.width * S) / 2), feetY - 22 * S, sp.width * S, sp.height * S);
  };
  const kind = c.kind;
  if (kind === 'td' || kind === 'bo') {
    const frame = ((t * 5) | 0) % 2;
    big(frame ? 'celeb' : 'stand', 0, 1, bx + bw * 0.27, who && who.num);
    // the spike: the ball bounces
    const bt = (t * 2.2) % 1, bxp = bx + bw * 0.27 + 14 * S, byp = feetY - 6 - Math.abs(Math.sin(bt * Math.PI)) * 22 * (1 - t / c.T);
    g.save(); g.translate(Math.round(bxp), Math.round(byp)); g.scale(S / 1.5, S / 1.5); bowlDrawBall(g, 0, 0, t * 6); g.restore();
    bowlCineFire(g, bx, by, bw, bh, t);
  } else if (kind === 'sack') {
    const vic = c.victim, x = bx + bw * 0.3 + Math.min(1, t * 2.5) * bw * 0.12;
    const tkV = vic ? bowl.teams[vic.team] : 'greasers';
    const spV = bowlSprite(tkV, t > 0.4 ? 'down' : 'throw', 0, vic ? vic.fx : -1, vic && vic.num);
    g.drawImage(spV, Math.round(bx + bw * 0.5 - (spV.width * S) / 2), feetY - 22 * S, spV.width * S, spV.height * S);
    big(t > 0.4 ? 'celeb' : 'dive', 0, 1, x, who && who.num);
    if (t > 0.35 && t < 0.8) bowlCineBurst(g, bx + bw * 0.46, feetY - 12 * S, t);
  } else if (kind === 'int') {
    big(((t * 4) | 0) % 2 ? 'celeb' : 'run', ((t * 8) | 0) % 4, 1, bx + bw * 0.3 + Math.sin(t * 2) * 10, who && who.num);
  } else if (kind === 'fg') {
    const px = bx + bw * 0.7;
    g.fillStyle = '#ffd23a';
    g.fillRect(px - 20, feetY - 50, 40, 3); g.fillRect(px - 20, feetY - 110, 3, 63); g.fillRect(px + 17, feetY - 110, 3, 63); g.fillRect(px - 2, feetY - 50, 4, 50);
    const s = Math.min(1, t / 0.9);
    const ex = c.bad ? px + 34 : px;
    const bxp = bx + bw * 0.15 + (ex - bx - bw * 0.15) * s, byp = feetY - 8 - Math.sin(s * Math.PI * 0.85) * 90;
    g.save(); g.translate(Math.round(bxp), Math.round(byp)); g.scale(2, 2); bowlDrawBall(g, 0, 0, t * 10); g.restore();
    if (!c.bad && s >= 1) bowlCineFire(g, bx, by, bw, bh, t);
  } else if (kind === 'coin') {
    const cx = bx + bw / 2, cy = by + bh * 0.66 - Math.sin(Math.min(1, t / 1.3) * Math.PI) * 26;
    const wv = Math.abs(Math.cos(t * 14)) * 12 + 1;
    g.fillStyle = '#a8761a'; g.beginPath(); g.ellipse(cx, cy, wv + 1, 13, 0, 0, 7); g.fill();
    g.fillStyle = '#ffd23a'; g.beginPath(); g.ellipse(cx, cy, wv, 12, 0, 0, 7); g.fill();
    // the captains: Bo and theirs, square to each other
    const sp0 = bowlSprite('tenders', 'stand', 0, 1, 34), sp1 = bowlSprite(bowl.teams[1], 'stand', 0, -1, BOWL_ROSTER[bowl.teams[1]].RB[1]);
    g.drawImage(sp0, Math.round(bx + bw * 0.2 - 10 * S), feetY - 22 * S, 20 * S, 24 * S);
    g.drawImage(sp1, Math.round(bx + bw * 0.8 - 10 * S), feetY - 22 * S, 20 * S, 24 * S);
  } else if (kind === 'safety' && who) {
    big('celeb', 0, 1, bx + bw * 0.3, who.num);
  }
  // the words
  const sc = bw >= 300 ? 3 : 2;
  const col = kind === 'bo' ? ['#ffd23a', '#ff2fa0', '#26e0ff', '#39ff7a'][((t * 8) | 0) % 4]
    : kind === 'td' ? (((t * 6) | 0) % 2 ? '#ffd23a' : '#fff6d8')
      : c.bad ? '#ff5a4a' : kind === 'sack' ? '#ff8a1e' : kind === 'int' ? '#26e0ff' : '#ffd23a';
  const tx = kind === 'coin' || kind === 'quarter' || kind === 'safety' && !who ? bx + bw / 2 : bx + bw * 0.66;
  const align = 'c';
  const words = c.text || '';
  const wsc = bowlTextW(words, sc) > bw * 0.62 && tx !== bx + bw / 2 ? sc - 1 : sc;
  bowlText(g, words, tx, by + 14, col, { align, scale: wsc, shadow: '#000' });
  if (c.sub) {
    const subs = String(c.sub);
    const maxc = Math.floor((tx === bx + bw / 2 ? bw - 12 : bw * 0.62) / 6);
    const l1 = subs.length > maxc ? subs.slice(0, subs.lastIndexOf(' ', maxc) > 0 ? subs.lastIndexOf(' ', maxc) : maxc) : subs;
    const l2 = subs.length > l1.length ? subs.slice(l1.length).trim() : '';
    bowlText(g, l1, tx, by + 16 + 8 * wsc, '#e8ecf0', { align });
    if (l2) bowlText(g, l2, tx, by + 25 + 8 * wsc, '#e8ecf0', { align });
  }
  if (t > 0.6 && ((t * 3) | 0) % 2) bowlText(g, 'A >', bx + bw - 6, by + bh - 10, '#6a7290', { align: 'r', shadow: '' });
  g.restore();
}
function bowlCineFire(g, bx, by, bw, bh, t) {
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    const ft = (t * 0.9 + k * 0.33) % 1, cx = bx + bw * (0.55 + 0.15 * k), cy = by + bh * (0.2 + 0.08 * k), r = ft * 34;
    g.fillStyle = ['#ffd23a', '#ff2fa0', '#26e0ff'][k]; g.globalAlpha = 1 - ft;
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r + ft * ft * 10), 2, 2); }
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
function bowlCineBurst(g, x, y, t) {
  g.fillStyle = '#fff6d8';
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * 6.283, r = 6 + (t - 0.35) * 70;
    g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.7), 2, 2);
  }
  g.fillStyle = '#ffd23a'; g.fillRect(Math.round(x - 5), Math.round(y - 1), 10, 3); g.fillRect(Math.round(x - 1), Math.round(y - 5), 3, 10);
}

function bowlDrawFinal(g, W, H) {
  const R = bowl.result || {}, t = bowl.finalT;
  g.fillStyle = 'rgba(2,3,8,0.86)'; g.fillRect(0, bowl.hudH, W, H - bowl.hudH);
  const cx = W / 2;
  let y = bowl.hudH + Math.max(8, (H - bowl.hudH) / 2 - 92);
  bowlText(g, 'FINAL', cx, y, '#bfc6ff', { align: 'c', scale: 2 }); y += 20;
  const A = bowlTeam(0), Bt = bowlTeam(1);
  bowlText(g, A.name + '  ' + bowl.score[0] + '  -  ' + bowl.score[1] + '  ' + Bt.name, cx, y, '#fff6d8', { align: 'c', scale: W > 380 ? 2 : 1 }); y += 22;
  const head = R.ring ? 'NUGGET BOWL CHAMPIONS' : R.won ? 'TENDERS WIN!' : R.tie ? 'A TIE. NOBODY SLEEPS.' : Bt.name + ' WIN';
  const hc = R.won ? (((t * 5) | 0) % 2 ? '#ffd23a' : '#fff6d8') : '#ff8a7a';
  bowlText(g, head, cx, y, hc, { align: 'c', scale: W > 300 ? 2 : 1 }); y += 22;
  const st = bowl.stats;
  bowlText(g, st.yds + ' YDS · ' + st.tds + ' TD · ' + st.sacks + ' SACKS · ' + st.ints + ' INT', cx, y, '#bfc6ff', { align: 'c' }); y += 12;
  bowlText(g, '+' + fmt.format(bowl.earned) + ' NUGGETS', cx, y, '#ffd23a', { align: 'c' }); y += 16;
  if (R.ring) {
    bowlText(g, 'ATTENDANCE 1,000,000+ · TICKETS SOLD: 0', cx, y, '#26e0ff', { align: 'c' }); y += 9;
    bowlText(g, 'THE STANDS WERE EMPTY BY THE FINAL WHISTLE. EVERY SEAT WET.', cx, y, '#26e0ff', { align: 'c' }); y += 14;
  } else if (R.unlock) {
    bowlText(g, 'THE NUGGET BOWL IS OPEN.', cx, y, '#26e0ff', { align: 'c' }); y += 14;
  } else if (st.boLong >= 70) {
    bowlText(g, 'BO KNOWS NUGGETS · ' + st.boLong + ' YDS', cx, y, '#ffd23a', { align: 'c' }); y += 14;
  }
  if (t > 1 && ((t * 2) | 0) % 2 === 0) bowlText(g, 'A / SPACE REMATCH · R NEW OPPONENT', cx, y + 4, '#6a7290', { align: 'c', shadow: '' });
}

function bowlDrawTouch(g, W, H) {
  const T = bowl.touch;
  if (!T.on) return;
  const s = bowl.scale;
  g.globalAlpha = 0.5;
  if (T.L) {
    const x0 = T.L.x0 / s, y0 = T.L.y0 / s;
    g.strokeStyle = '#fff'; g.beginPath(); g.arc(x0, y0, 16, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x0 + T.L.dx * 12, y0 + T.L.dy * 12, 6, 0, 7); g.fill();
  }
  for (const b of bowlTouchBtns()) {
    g.fillStyle = b.k === 'A' ? (T.A ? '#ffd23a' : '#c8321f') : (T.B ? '#ffd23a' : '#1f6fc8');
    g.beginPath(); g.arc(b.x / s, b.y / s, b.r / s, 0, 7); g.fill();
    g.globalAlpha = 0.9;
    bowlText(g, b.k, b.x / s, b.y / s - 3, '#fff', { align: 'c', shadow: '' });
    g.globalAlpha = 0.5;
  }
  g.globalAlpha = 1;
}

// ---- input -----------------------------------------------------------------------------------
function bowlTouchBtns() {
  const vw = window.innerWidth, vh = window.innerHeight;
  return [{ k: 'A', x: vw - 58, y: vh - 66, r: 32 }, { k: 'B', x: vw - 128, y: vh - 40, r: 24 }];
}
function bowlMenuOpen() { return !!document.querySelector('.ak-tier') || !!document.querySelector('.modal-overlay.active'); }

function bowlCallKey(code) {
  if (bowl.phase !== 'call') return false;
  const idx = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[code];
  if (idx != null) { bowlChoose(idx); return true; }
  if (bowl.poss === 0 && bowl.down === 4) {
    if (code === 'Digit5' || code === 'Numpad5') { bowlChoose('punt'); return true; }
    if ((code === 'Digit6' || code === 'Numpad6') && bowlFGDist() <= 62) { bowlChoose('fg'); return true; }
  }
  const s = bowl.callSel;
  if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD') { bowl.callSel = s ^ 1; bowlSfx('select'); return true; }
  if (code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowDown' || code === 'KeyS') { bowl.callSel = s ^ 2; bowlSfx('select'); return true; }
  return false;
}

window.addEventListener('keydown', (e) => {
  if (!bowlActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (bowl.phase === 'tier' || bowlMenuOpen()) return;
  bowlAudio();
  const claimed = /^(Key[WASDJKMQR]|Arrow(Up|Down|Left|Right)|Space|Enter|ShiftLeft|ShiftRight|Escape|Digit[1-6]|Numpad[1-6])$/.test(e.code);
  if (claimed) e.preventDefault();
  if (e.code === 'Escape') {
    if (!e.repeat && bowl.phase !== 'final') bowl.paused = !bowl.paused;
    return;
  }
  if (e.code === 'KeyM' && !e.repeat) {
    const S = bowl.sfx; S.muted = !S.muted;
    if (S.master) S.master.gain.value = S.muted ? 0 : 0.32;
    bowlFeed(S.muted ? 'SOUND OFF' : 'SOUND ON', '#6a7290');
    return;
  }
  if (bowl.paused) {
    if (e.code === 'KeyQ') { bowl.paused = false; if (typeof stopStorm === 'function') stopStorm(); }
    return;
  }
  if (bowl.phase === 'final') {
    if (e.code === 'KeyR' && !e.repeat) { bowlOpenTier(); return; }
  }
  bowl.keys[e.code] = true;
  if (e.repeat) return;
  if (bowlCallKey(e.code)) return;
  if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'Enter') bowlPressA();
  else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') bowlPressB();
});
window.addEventListener('keyup', (e) => { if (bowl.keys[e.code]) bowl.keys[e.code] = false; });
window.addEventListener('blur', () => { bowl.keys = {}; });
window.addEventListener('resize', () => { if (bowl.on) { bowlLayout(); bowlVig = null; } });

function bowlWorldXY(cx, cy) { return { x: cx / bowl.scale, y: cy / bowl.scale }; }
function bowlTapCall(x, y) {
  for (const c of bowl.hit.cards) if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) {
    bowl.callSel = c.n; bowlChoose(c.n);
    return true;
  }
  for (const c of bowl.hit.extra) if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) { bowlChoose(c.n); return true; }
  return false;
}

function bowlPointerDown(e) {
  if (!bowlActive() || bowl.phase === 'tier' || e.pointerType === 'touch') return;
  e.preventDefault();
  bowlAudio();
  bowl.touch.on = false;
  if (bowl.paused) { bowl.paused = false; return; }
  const p = bowlWorldXY(e.clientX, e.clientY);
  if (bowl.phase === 'call') { bowlTapCall(p.x, p.y); return; }
  if (e.button === 2) bowlPressB(); else bowlPressA();
}

bowlWorld.addEventListener('contextmenu', (e) => { if (bowlActive()) e.preventDefault(); });
bowlWorld.addEventListener('touchstart', (e) => {
  if (!bowlActive() || bowl.phase === 'tier') return;
  if (e.target.closest('.storm-hud, .ak-tier, .modal-overlay')) return;
  bowlAudio();
  const T = bowl.touch; T.on = true;
  for (const t of e.changedTouches) {
    const x = t.clientX, y = t.clientY;
    if (bowl.paused) { bowl.paused = false; continue; }
    if (bowl.phase === 'call') { const p = bowlWorldXY(x, y); bowlTapCall(p.x, p.y); continue; }
    if (bowl.phase === 'cine' || bowl.phase === 'final' || (bowl.phase === 'fg' && bowl.fg && !bowl.fg.done)) { bowlPressA(); continue; }
    let hit = null;
    for (const b of bowlTouchBtns()) if (Math.hypot(x - b.x, y - b.y) <= b.r + 10) { hit = b; break; }
    if (hit) { T.roles[t.identifier] = hit.k; T[hit.k] = true; if (hit.k === 'A') bowlPressA(); else bowlPressB(); continue; }
    if (x < window.innerWidth * 0.6 && !T.L) { T.L = { id: t.identifier, x0: x, y0: y, dx: 0, dy: 0 }; T.roles[t.identifier] = 'L'; }
    else { bowlPressA(); }
  }
  e.preventDefault();
}, { passive: false });
bowlWorld.addEventListener('touchmove', (e) => {
  if (!bowlActive()) return;
  const T = bowl.touch;
  for (const t of e.changedTouches) {
    if (T.roles[t.identifier] !== 'L' || !T.L) continue;
    T.L.dx = bowlClamp((t.clientX - T.L.x0) / 36, -1, 1); T.L.dy = bowlClamp((t.clientY - T.L.y0) / 36, -1, 1);
  }
  e.preventDefault();
}, { passive: false });
const bowlTouchEnd = (e) => {
  const T = bowl.touch;
  for (const t of e.changedTouches) {
    const role = T.roles[t.identifier]; delete T.roles[t.identifier];
    if (role === 'L') T.L = null; else if (role) T[role] = false;
  }
};
window.addEventListener('touchend', bowlTouchEnd); window.addEventListener('touchcancel', bowlTouchEnd);

function bowlPollPad() {
  const P = bowl.pad;
  if (!navigator.getGamepads) return;
  let gp = null;
  try { for (const g of navigator.getGamepads()) if (g && g.connected) { gp = g; break; } } catch (e) { return; }
  if (!gp) { P.on = false; return; }
  const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
  const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
  P.lx = dz(gp.axes[0] || 0) + (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0);
  P.ly = dz(gp.axes[1] || 0) + (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
  const a = btn(0), b = btn(1) || btn(2), st = btn(9);
  if (P.lx || P.ly || a || b) P.on = true;
  if (bowl.phase === 'call' && P.on) {
    const nav = Math.abs(P.lx) > 0.5 ? 'x' : Math.abs(P.ly) > 0.5 ? 'y' : '';
    if (nav && nav !== P._nav) { bowl.callSel ^= nav === 'x' ? 1 : 2; bowlSfx('select'); }
    P._nav = nav;
  }
  if (a && !P._a) bowlPressA();
  if (b && !P._b) bowlPressB();
  if (st && !P._st && bowl.phase !== 'final') bowl.paused = !bowl.paused;
  P._a = a; P._b = b; P._st = st;
}

// ---- test seam ---------------------------------------------------------------------------------
// The harness drives the REAL handlers: pickTier deals a game, choose() calls a
// play, auto(true) lets the AI play our side too, and step(secs) runs the sim
// at a fixed 60Hz without drawing, so a whole game can be simulated headless.
window.bowlDebug = {
  state: () => ({
    phase: bowl.phase, score: bowl.score.slice(), q: bowl.q, clock: Math.round(bowl.clock), ot: bowl.ot,
    poss: bowl.poss, los: Math.round(bowl.los * 10) / 10, down: bowl.down, firstAt: Math.round(bowl.firstAt * 10) / 10,
    kind: bowl.kind, play: bowl.play && bowl.play.key, guessRight: bowl.guessRight, earned: bowl.earned,
    tier: bowl.cfg && bowl.cfg.key, cine: bowl.cine && bowl.cine.kind, ctl: bowl.ctl && bowl.ctl.pos,
    carrier: bowl.carrier && { pos: bowl.carrier.pos, team: bowl.carrier.team, x: Math.round(bowl.carrier.x * 10) / 10, y: Math.round(bowl.carrier.y * 10) / 10 },
    ball: bowl.ball && bowl.ball.st, stats: bowl.stats && Object.assign({}, bowl.stats), result: bowl.result || null,
  }),
  pickTier: (i) => {
    if (bowl.tierPick) { bowl.tierPick.close(); bowl.tierPick = null; }
    bowlNewGame(BOWL_TIERS[i] || BOWL_TIERS[0]);
  },
  auto: (v) => { bowl.auto = v !== false; },
  choose: (n) => bowlChoose(n),
  pressA: () => bowlPressA(), pressB: () => bowlPressB(),
  forceRead: (v) => { bowl.forceRead = v; },
  skipCine: () => { if (bowl.phase === 'cine') bowlEndCine(); },
  step: (secs, hz) => {
    const dt = 1 / (hz || 60), n = Math.round(secs / dt);
    for (let i = 0; i < n; i++) { if (bowl.phase === 'tier' || bowl.phase === 'final') break; bowlUpdate(dt); }
    return window.bowlDebug.state();
  },
  setKeys: (o) => { bowl.keys = Object.assign({}, o || {}); },
  players: () => bowl.players.map((p) => ({ team: p.team, pos: p.pos, x: +p.x.toFixed(1), y: +p.y.toFixed(1), down: p.downT > 0, eng: !!p.eng })),
  // harness seams: pin a state, keep drawing
  set: (o) => Object.assign(bowl, o),
  freeze: (v) => { bowl.freeze = v !== false; },
  draw: () => bowlDraw(),
};
