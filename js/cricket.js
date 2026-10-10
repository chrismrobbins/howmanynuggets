// ---- 🏏 NUGGET CRICKET (game 20, mode `cricket`) ------------------------------------------------------
// "taking everything we've done for blitz make a game for cricket" — Chris (bat + bowl, arcade-short).
// Everything Nugget Blitz learned, on a cricket ground: the polygon look (js/cricketGL.js), a ladder
// of tiers through ArcadeKit, phone + controller + keyboard controls with context buttons, recorded
// commentary and a soundtrack (js/cricketAudio.js), a cabinet in the hall and its own URL.
//
// THE GAME: a short limited-overs match (2–3 overs a side, 3 wickets) against a nugget nation.
//   • BATTING — the CPU runs in and bowls; you time the shot. Press as the ball arrives: early drags
//     it to the leg side, late pushes it to the off side (and late-late finds the edge). The stick
//     aims (nothing held = straight back past the bowler). GROUND keeps it down, LOFT goes for six
//     (and can be caught), BLOCK keeps your wicket. RUN calls for a run; BLOCK while running sends
//     them back. Out: bowled, caught, LBW, run out.
//   • BOWLING — aim the marker on the pitch (line and length), pick PACE or SPIN to start the run-up,
//     and hit BOWL when the needle is in the middle of the meter. Off-centre sprays it; way off is a
//     wide. Your fielders chase, dive, catch and throw at the stumps on their own.
// Fours and sixes over the rope, the over's balls in a row of dots, a target to chase, a ticker of
// commentary. Rules simplified where an arcade wants it (no stumpings, no byes, no follow-on).

const cricketWorld = document.getElementById('cricketWorld');
// 🍛 Chris's logo (cricket/biryani-logo*.png: the original on cream, a cut-out, a small cut-out)
const CRK_LOGO = new Image(); CRK_LOGO.src = 'cricket/biryani-logo-cut.png?v=1';
const CRK_LOGO_SM = new Image(); CRK_LOGO_SM.src = 'cricket/biryani-logo-sm.png?v=1';
function crkLogoReady(im) { return im.complete && im.naturalWidth > 0; }
// draw the logo centred at (cx, cy), `h` tall (logical px); false if it hasn't loaded yet
function crkDrawLogo(g, cx, cy, h, alpha, small) {
  const im = small && crkLogoReady(CRK_LOGO_SM) ? CRK_LOGO_SM : CRK_LOGO;
  if (!crkLogoReady(im)) return false;
  const w = h * im.naturalWidth / im.naturalHeight;
  g.globalAlpha = alpha == null ? 1 : alpha;
  g.drawImage(im, cx - w / 2, cy - h / 2, w, h);
  g.globalAlpha = 1;
  return true;
}
const CRK_RES = 384;
const CRK_TEAMS = {
  nugs:     { name: 'NUGS', full: 'THE NUGS', city: 'NUGGETOWN', abbr: 'NUG', logo: 'N', c1: '#c8321f', c2: '#ffd23a', trou: '#f2ead8', num: '#ffffff', blurb: 'THE HOME SIDE. GOLDEN BROWN.' },
  samosa:   { name: 'SAMOSA STRIKERS', full: 'THE SAMOSA STRIKERS', city: 'MASALA BAY', abbr: 'SAM', logo: 'S', c1: '#1f5ac8', c2: '#ff9a1a', trou: '#1a3a8a', num: '#ffd23a', blurb: 'CRISPY OUTSIDE. SPICY INSIDE.' },
  tandoori: { name: 'TANDOORI TITANS', full: 'THE TANDOORI TITANS', city: 'CLAY OVEN CITY', abbr: 'TAN', logo: 'T', c1: '#e85a1a', c2: '#ffe08a', trou: '#7a1a0a', num: '#ffffff', blurb: 'HOT FROM THE OVEN.' },
  chips:    { name: 'CHIP FLINGERS', full: 'THE FISH AND CHIP FLINGERS', city: 'FRY-UP ON THAMES', abbr: 'FCF', logo: 'F', c1: '#16307a', c2: '#e8eef8', trou: '#e8eef8', num: '#ffd23a', blurb: 'SALT. VINEGAR. NO MERCY.' },
  vegemite: { name: 'VEGEMITE VANDALS', full: 'THE VEGEMITE VANDALS', city: 'TOAST COAST', abbr: 'VEG', logo: 'V', c1: '#f2c41e', c2: '#1a6a2a', trou: '#f2c41e', num: '#1a6a2a', blurb: 'SPREAD THIN. HIT HARD.' },
  jerk:     { name: 'JERK WING WARRIORS', full: 'THE JERK WING WARRIORS', city: 'SCOTCH BONNET BAY', abbr: 'JWW', logo: 'J', c1: '#7a1a2a', c2: '#ffd23a', trou: '#7a1a2a', num: '#ffd23a', blurb: 'BIG HITS. BIGGER HEAT.' },
  kumara:   { name: 'KUMARA KNIGHTS', full: 'THE KUMARA KNIGHTS', city: 'SWEET SPUD SOUND', abbr: 'KUM', logo: 'K', c1: '#1a1a1e', c2: '#c8ccd4', trou: '#1a1a1e', num: '#ffffff', blurb: 'ALL BLACK. ALL SPUD.' },
  chutney:  { name: 'CHUTNEY CHARGERS', full: 'THE CHUTNEY CHARGERS', city: 'MANGO GROVE', abbr: 'CHU', logo: 'C', c1: '#6a2aa8', c2: '#f2d22a', trou: '#4a1a7a', num: '#f2d22a', blurb: 'SWEET. TANGY. RELENTLESS.' },
};
const CRK_TEAM_ORDER = ['nugs', 'samosa', 'tandoori', 'chips', 'vegemite', 'jerk', 'kumara', 'chutney'];
// eleven per side: batting order top to bottom; the last five bowl (P pace, S spin)
const CRK_NAMES = {
  nugs: ['GOLDEN BROWN', 'TEN PIECE TOM', 'DIPPY DAN', 'SAUCY SAM', 'CRUNCH JUNIOR', 'BATTER UP BOB', 'HONEY MUSTARD', 'DEEP FRY DAVE', 'BREADCRUMB BILL', 'LIL NUGGET', 'NUGGY SMALLS'],
  samosa: ['MASALA MAESTRO', 'CRISPY CONE', 'TAMARIND TOM', 'CUMIN CHARLIE', 'GARAM GARY', 'MINT CHUTNEY MO', 'PASTRY PETE', 'POTATO PETE', 'PEA PODGE', 'CHILLI CHIP', 'SPICE SPIN'],
  tandoori: ['CLAY OVEN CARL', 'SMOKY SID', 'NAAN STOP NEIL', 'CHAR CHARLIE', 'YOGURT YOGI', 'SKEWER STU', 'PAPRIKA PAUL', 'EMBER ED', 'HOT COAL HAL', 'SIZZLE SAM', 'TIKKA TED'],
  chips: ['VINEGAR VIC', 'BATTERED BEN', 'MUSHY PEA MAX', 'SALTY SID', 'CHIPPY CHAS', 'COD ROE RON', 'TARTAR TIM', 'NEWSPAPER NED', 'GRAVY GUS', 'KETCHUP KEV', 'FRYER FRANK'],
  vegemite: ['TOASTY TODD', 'SPREAD SPENCE', 'CRUMPET CRAIG', 'BRISBANE BUN', 'YEAST YATES', 'SCONE STEVE', 'BUTTER BRUCE', 'LAMINGTON LEE', 'PAVLOVA PAT', 'SAUSAGE SIZZLE', 'DAMPER DAZZA'],
  jerk: ['BONNET BRIAN', 'ALLSPICE AL', 'PEPPER PAT', 'PLANTAIN PERCY', 'THYME TONY', 'SMOKE STACK STAN', 'RICE N PEAS RAY', 'LIME LEROY', 'ROTI RUDY', 'MANGO MARV', 'HOT SAUCE HAL'],
  kumara: ['SWEET SPUD SID', 'MASH MATT', 'HANGI HARRY', 'ROAST RICKY', 'PEELER PETE', 'SPUD STUD', 'KIWI KYLE', 'TATER TANE', 'WEDGE WILL', 'HASH HENRY', 'GOLD KUMARA'],
  chutney: ['MANGO MIKE', 'TANGY TOM', 'JAR JAMIE', 'SWEET SID', 'RELISH RAY', 'PICKLE PAT', 'VINEGAR VAL', 'DOLLOP DEV', 'SPOON SAM', 'LID LARRY', 'APRICOT AL'],
};
const CRK_TIERS = [
  { key: 'rookie', name: 'ROOKIE', emoji: '🍟', opp: 'chips', alt: 'kumara', overs: 2, mult: 1, skill: 0.55, blurb: 'vs the FISH AND CHIP FLINGERS. 2 overs a side. gentle.' },
  { key: 'pro', name: 'PRO', emoji: '🥫', opp: 'vegemite', alt: 'jerk', overs: 3, mult: 2, skill: 0.78, blurb: 'vs the VEGEMITE VANDALS. 3 overs. they bowl a heavy ball.' },
  { key: 'worldcup', name: 'WORLD CUP', emoji: '🏆', opp: 'samosa', alt: 'tandoori', overs: 3, mult: 3, skill: 1.0, lockNote: 'win a PRO match', blurb: 'vs the SAMOSA STRIKERS. 3 overs. the final.' },
];
const CRK_WKTS = 3;
// where the nine fielders stand for a right-hander (+x is the off side, the striker at z ≈ −9)
const CRK_FIELD = [
  { pos: 'SLIP', x: 5.5, z: -16.5, catcher: true }, { pos: 'POINT', x: 22, z: -8 }, { pos: 'COVER', x: 25, z: 4 },
  { pos: 'MID-OFF', x: 11, z: 20 }, { pos: 'MID-ON', x: -11, z: 20 }, { pos: 'MIDWICKET', x: -25, z: 3 },
  { pos: 'SQUARE LEG', x: -21, z: -14 }, { pos: 'FINE LEG', x: -27, z: -45 }, { pos: 'LONG-ON', x: -16, z: 50 },
];
const CRK_LEAD = 0.16;       // secs between pressing a shot and the bat arriving (the swing's lead)
const CRK_ZC = -8.0;         // the contact plane, in front of the popping crease

const cricket = {
  on: false, cv: null, g: null, W: 640, H: CRK_RES, ov: 2, F: 600, cy: 190, ui: 1, t: 0,
  phase: 'idle', cfg: null, tierPick: null, teamSel: 0, teams: ['nugs', 'chips'], rosters: [[], []], human: 0,
  inn: 0, bat: 0, sc: null, target: 0, thisOver: [], order: [[], []], striker: null, non: null, bowler: null,
  players: [], stumps: [], bails: [], ball: { on: false }, del: null, shot: null, run: null,
  cam: { x: 0, z: 26, h: 6, yaw: Math.PI, pitch: 0.14, s: 0, c: 1, cyw: -1, syw: 0 }, camMode: 'tv',
  aim: { x: 0.15, z: -4.5, show: false }, meter: null, tossSel: 0, tossWon: false,
  keys: {}, touch: { L: null, roles: {}, T: false }, pad: { on: false }, inputMode: 'kb', mobile: false,
  sfx: { ctx: null, master: null, muted: false }, voice: true, feed: [], banner: null, ticker: null,
  stats: null, earned: 0, paused: false, auto: false, deadT: 0, setT: 0, phaseT: 0, crowdJump: 0, night: false, hit: { cards: [] },
};
function cricketActive() { return storm.mode === 'cricket' && storm.running; }
function cricketProWon() { try { return localStorage.getItem('nugCricketPro') === '1' || localStorage.getItem('nugCricketChamp') === '1'; } catch (e) { return false; } }
function cricketTally() {
  const C = cricket;
  if (!C.sc || C.phase === 'tier' || C.phase === 'teams') return '🏏 pick your opponent…';
  const s = C.sc[C.inn];
  return '🏏 ' + crkTeam(C.bat).abbr + ' ' + s.r + '/' + s.w + ' (' + crkOvers(s.b) + ')' + (C.inn ? ' · need ' + Math.max(0, C.target - s.r) : '') + ' · ' + fmt.format(C.earned);
}
function crkTeam(i) { return CRK_TEAMS[cricket.teams[i]] || CRK_TEAMS.nugs; }
function crkHumanBats() { return cricket.bat === cricket.human; }
function crkOvers(b) { return ((b / 6) | 0) + '.' + (b % 6); }
function crkRnd(a, b) { return a + Math.random() * (b - a); }
function crkPick(a) { return a[(Math.random() * a.length) | 0]; }
function crkGauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 0.5; }   // ≈ N(0,1), cheap

// ---- layout + the mode hook ----------------------------------------------------------------------------
function cricketLayout() {
  const C = cricket, vw = window.innerWidth, vh = window.innerHeight;
  C.H = CRK_RES; C.W = Math.max(240, Math.min(1000, Math.round(vw * CRK_RES / vh)));
  C.ov = 2;
  if (C.cv) { C.cv.width = C.W * C.ov; C.cv.height = C.H * C.ov; }
  C.ui = crkClamp(C.W / 420, 0.55, 1);
  C.cy = C.H * 0.5;
}
function syncCricket() {
  const C = cricket, active = cricketActive();
  if (active === C.on) return;
  C.on = active;
  document.body.classList.toggle('cricket-mode', active);
  if (active) {
    if (!C.cv) {
      C.cv = document.createElement('canvas'); C.g = C.cv.getContext('2d');
      cricketWorld.appendChild(C.cv);
      C.cv.addEventListener('pointerdown', crkPointerDown);
      crkGLInit();
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    C.t = 0; C.earned = 0; C.paused = false; C.keys = {};
    cricketLayout();
    if (crkIsPhone()) crkPadOn();
    if (typeof crkDiscManifest === 'function') crkDiscManifest();
    C.phase = 'splash'; C.phaseT = 0;
  } else {
    if (C.tierPick) { C.tierPick.close(); C.tierPick = null; }
    C.phase = 'idle';
    crkCrowdStop();
    if (typeof crkHush === 'function') crkHush();
    if (C.padEl) { C.padEl.querySelector('.crkp-sheet').hidden = true; C.paused = false; }
  }
}
function crkOpenTier() {
  const C = cricket;
  C.phase = 'tier'; C.sc = null; C.ball.on = false;
  const tiers = CRK_TIERS.map((t) => (t.key === 'worldcup' && !cricketProWon() ? Object.assign({}, t, { locked: true }) : t));
  C.tierPick = ArcadeKit.tierSelect({
    storeKey: 'cricket', title: '🍛 BIRYANI BLITZ — CRICKET EDITION · pick your opponent',
    note: 'bat AND bowl · 3 wickets · tap a card · 1 · 2 · 3 · or stick + A', tiers, mount: cricketWorld,
    onPick: (key, t) => { C.tierPick = null; crkNewMatch(t); },
  });
}
function crkNewMatch(tier) {
  const C = cricket;
  C.cfg = tier;
  C.phase = 'teams'; C.phaseT = 0;
  C.teamSel = Math.max(0, CRK_TEAM_ORDER.indexOf(C.teams[0] || 'nugs'));
}
function crkTeamPick(i) {
  const C = cricket;
  if (i != null) C.teamSel = i;
  const mine = CRK_TEAM_ORDER[C.teamSel], opp = C.cfg.opp === mine ? C.cfg.alt : C.cfg.opp;
  C.teams = [mine, opp];
  C.rosters = [crkRoster(mine), crkRoster(opp)];
  crkSfx('select');
  C.phase = 'toss'; C.phaseT = 0; C.tossSel = 0; C.tossWon = null;
}
function crkRoster(key) {
  const names = CRK_NAMES[key] || CRK_NAMES.nugs;
  return names.map((name, i) => ({
    name, num: [7, 10, 18, 45, 3, 12, 99, 8, 33, 22, 1][i],
    bat: i < 6 ? 0.85 - i * 0.04 : 0.55 - (i - 6) * 0.07,
    bowl: i >= 6 ? (i === 7 || i === 9 ? 'spin' : 'pace') : null,
    bk: i >= 6 ? 0.7 + crkHash(i * 7.7 + key.length) * 0.25 : 0,
    r: 0, b: 0, out: '', wk: 0, rc: 0, bb: 0,
  }));
}
// the toss: call it; the winner picks
function crkToss(call) {
  const C = cricket;
  const coin = Math.random() < 0.5 ? 0 : 1;
  C.tossWon = coin === call;
  C.tossCoin = coin;
  crkSfx('select');
  if (!C.tossWon) { C.cpuChose = Math.random() < 0.5 ? 'bat' : 'bowl'; C.phaseT = 0; C.tossShowT = 0; }
}
function crkChoose(batFirst) {
  const C = cricket;
  C.firstBat = batFirst ? C.human : 1 - C.human;
  crkStartMatch();
}
function crkStartMatch() {
  const C = cricket;
  C.sc = [{ r: 0, w: 0, b: 0, x: 0, fours: 0, sixes: 0 }, { r: 0, w: 0, b: 0, x: 0, fours: 0, sixes: 0 }];
  C.stats = { fours: 0, sixes: 0, wkts: 0, dots: 0, catches: 0, perfect: 0 };
  C.inn = 0; C.bat = C.firstBat; C.target = 0; C.result = null;
  crkBuildPlayers();
  crkStartInnings();
  crkCrowdStart();
}
function crkStartInnings() {
  const C = cricket, R = C.rosters[C.bat];
  R.forEach((r) => { r.r = 0; r.b = 0; r.out = ''; });
  C.order[C.bat] = R.map((_, i) => i);
  C.nextIn = 2;
  C.strikerI = 0; C.nonI = 1;
  C.bowlers = C.rosters[1 - C.bat].map((r, i) => (r.bowl ? i : -1)).filter((i) => i >= 0);
  C.overBowler = 0; C.bowlerI = C.bowlers[0];
  C.thisOver = [];
  crkCast();
  crkBanner(C.inn ? 'TARGET ' + C.target : crkTeam(C.bat).full + ' BAT', '#ffd23a', C.inn ? crkTeam(C.bat).abbr + ' NEED ' + C.target + ' OFF ' + C.cfg.overs * 6 : C.cfg.overs + ' OVERS · ' + CRK_WKTS + ' WICKETS', 2);
  crkSay(C.inn ? crkTeam(C.bat).full + ' NEED ' + C.target + ' TO WIN.' : 'WELCOME TO BIRYANI BLITZ!', 2, C.inn ? 'THE CHASE IS ON!' : null);
  crkNextBall(1.6);
}

// ---- the men on the field -------------------------------------------------------------------------------
function crkMan(team, idx, role, x, z) {
  const R = cricket.rosters[team][idx] || {};
  return { team, idx, role, name: R.name || '', num: R.num || 0, x, z, y: 0, fx: 0, fz: -1, vx: 0, vz: 0, anim: Math.random() * 6, act: '',
    look: null, bat: false, pads: false, helmet: false, keeper: false, seed: Math.random() * 9, downT: 0, dive: 0, homeX: x, homeZ: z, tx: x, tz: z, spd: 7.2 };
}
function crkBuildPlayers() { cricket.players = []; }
// put everybody where the next ball wants them (batting side's two, the fielding side's eleven, two umpires)
function crkCast() {
  const C = cricket, bt = C.bat, fd = 1 - bt;
  C.players = [];
  const st = crkMan(bt, C.order[bt][C.strikerI], 'bat', -0.42, -9.25);
  const nn = crkMan(bt, C.order[bt][C.nonI], 'non', -1.25, 9.4);
  for (const b of [st, nn]) { b.bat = true; b.pads = true; b.helmet = true; }
  st.fx = 1; st.fz = 0; st.act = 'bat';
  nn.fx = 0; nn.fz = -1;
  C.striker = st; C.non = nn;
  const bw = crkMan(fd, C.bowlerI, 'bowl', 0.55, 24);
  C.bowler = bw;
  const kp = crkMan(fd, 4, 'keep', 0.25, -21); kp.keeper = true; kp.helmet = false; kp.pads = true; kp.act = 'keep'; kp.fz = 1;
  C.keeper = kp;
  C.players.push(st, nn, bw, kp);
  // the fielders: the rest of the side, in order
  const used = new Set([C.bowlerI, 4]);
  let k = 0;
  for (let i = 0; i < 11 && k < CRK_FIELD.length; i++) {
    if (used.has(i)) continue;
    const F = CRK_FIELD[k++], f = crkMan(fd, i, 'field', F.x, F.z);
    f.pos = F.pos; f.catcher = !!F.catcher; f.act = 'field';
    C.players.push(f);
  }
  const u1 = crkMan(fd, 0, 'ump', -1.4, 12.2), u2 = crkMan(fd, 0, 'ump', -26, -9);
  u1.name = 'UMPIRE'; u2.name = 'UMPIRE'; u1.act = 'ump'; u2.act = 'ump'; u2.fx = 1; u2.fz = 0;
  C.ump = u1;
  C.players.push(u1, u2);
  C.players.forEach((p, i) => { p.idx = p.role === 'ump' ? 14 : p.idx; p.i = i; });
  crkResetStumps();
}
function crkResetStumps() {
  const C = cricket;
  C.stumps = []; C.bails = [];
  for (const s of [-1, 1]) {
    for (const dx of [-0.114, 0, 0.114]) C.stumps.push({ end: s, x: dx, y: 0, z: s * CRK_STUMPZ, ax: 0, az: 0, vx: 0, vy: 0, vz: 0, wax: 0, waz: 0, fly: false });
    for (const dx of [-0.057, 0.057]) C.bails.push({ end: s, x: dx, y: 0.725, z: s * CRK_STUMPZ, r: 0, vx: 0, vy: 0, vz: 0, wr: 0, fly: false });
  }
}
function crkBreakStumps(end, power) {
  const C = cricket;
  for (const s of C.stumps) if (s.end === end) { s.fly = true; s.vx = crkRnd(-1.5, 1.5) * power; s.vz = -end * crkRnd(2, 5) * power; s.vy = crkRnd(1, 3) * power; s.wax = crkRnd(-6, 6); s.waz = -end * crkRnd(3, 8) * power; }
  for (const b of C.bails) if (b.end === end) { b.fly = true; b.vx = crkRnd(-2, 2); b.vy = crkRnd(3, 5) * power; b.vz = -end * crkRnd(1, 4); b.wr = crkRnd(-15, 15); }
  crkSfx('stumps');
}
function crkStumpsStep(dt) {
  for (const s of cricket.stumps) if (s.fly) {
    s.vy -= 9.8 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.ax += s.wax * dt; s.az += s.waz * dt;
    if (s.y < 0) { s.y = 0; s.vy *= -0.3; s.vx *= 0.6; s.vz *= 0.6; s.wax *= 0.5; s.waz *= 0.5; if (Math.abs(s.az) > 1.4) s.az = Math.sign(s.az) * 1.5; }
  }
  for (const b of cricket.bails) if (b.fly) {
    b.vy -= 9.8 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.r += b.wr * dt;
    if (b.y < 0.01) { b.y = 0.01; b.vy *= -0.3; b.vx *= 0.5; b.vz *= 0.5; b.wr *= 0.5; }
  }
}

// ---- one ball: set → run-up → flight → (contact) → live → dead -----------------------------------------
function crkNextBall(delay) {
  const C = cricket;
  C.phase = 'set'; C.setT = delay || 0.9; C.phaseT = 0;
  C.del = null; C.shot = null; C.run = null; C.meter = null; C.ball = { on: false };
  C.outPending = null; C.boundary = 0; C.runsThisBall = 0; C.extra = 0; C.camMode = 'tv'; C.liveT = 0; C.whip = null; C.lbwT = 0;
  // the striker takes guard, the non-striker backs up, the bowler walks back to his mark
  const st = C.striker, nn = C.non, bw = C.bowler;
  st.x = -0.42; st.z = -9.25; st.fx = 1; st.fz = 0; st.act = 'bat'; st.swing = null; st.vx = st.vz = 0; st.downT = 0;
  nn.x = -1.25; nn.z = 9.4; nn.fx = 0; nn.fz = -1; nn.act = ''; nn.vx = nn.vz = 0;
  const R = C.rosters[1 - C.bat][C.bowlerI], spin = R && R.bowl === 'spin';
  bw.x = 0.55; bw.z = spin ? 15 : 23; bw.fx = 0; bw.fz = -1; bw.act = ''; bw.bowlU = null; bw.vx = bw.vz = 0;
  C.keeper.z = spin ? -11.4 : -21; C.keeper.x = 0.25; C.keeper.act = 'keep'; C.keeper.vx = C.keeper.vz = 0;
  for (const p of C.players) if (p.role === 'field') { p.x = p.homeX; p.z = p.homeZ; p.act = 'field'; p.vx = p.vz = 0; p.dive = 0; p.downT = 0; p.hasBall = false; p.chase = false; }
  for (const p of C.players) p.look = null;
  C.ump.act = 'ump';
  crkResetStumps();
  C.aim.show = !crkHumanBats() && !C.auto;
  if (C.aim.show) { C.aim.x = crkClamp(C.aim.x, -0.8, 1.2); C.aim.z = crkClamp(C.aim.z, -8.6, 2); }
}
// the human (or the CPU) starts the run-up with a delivery type
function crkStartRunup(type) {
  const C = cricket;
  if (C.phase !== 'set' || C.setT > 0) return;
  const bw = C.bowler, R = C.rosters[1 - C.bat][C.bowlerI];
  const spin = type ? type === 'spin' : R.bowl === 'spin';
  C.del = { type: spin ? 'spin' : 'pace' };
  bw.z = spin ? 15 : 23;
  C.phase = 'runup'; C.phaseT = 0;
  C.runupT = spin ? 0.95 : 1.35;
  if (!crkHumanBats() && !C.auto) C.meter = { u: 0, t: 0, done: false };
  crkSfx('select');
}
// the release: where it pitches, how fast, how it moves (human: the aim + the meter; CPU: a plan)
function crkRelease(acc) {
  const C = cricket, d = C.del, bw = C.bowler, R = C.rosters[1 - C.bat][C.bowlerI] || { bk: 0.7 };
  const spin = d.type === 'spin';
  let bx, bz, v, wide = false;
  if (crkHumanBats() || C.auto) {
    // the CPU's plan: mostly off stump, good length; a yorker, a bouncer, now and then a loose one
    const sk = C.auto ? 0.8 : C.cfg.skill;
    const L = Math.random();
    const len = spin ? (L < 0.55 ? crkRnd(-6.2, -3.6) : L < 0.85 ? crkRnd(-7.4, -6) : crkRnd(-3.6, -1.5))
      : (L < 0.12 ? crkRnd(-8.6, -7.8) : L < 0.37 ? crkRnd(-7.2, -5.8) : L < 0.78 ? crkRnd(-5.6, -3.2) : L < 0.95 ? crkRnd(-3, -0.5) : crkRnd(0, 2.5));
    bx = crkRnd(-0.15, 0.45) + crkGauss() * 0.25 * (1.2 - sk);
    bz = len + crkGauss() * 0.4 * (1.2 - sk);
    v = spin ? crkRnd(17.5, 20.5) : crkRnd(24, 28) + R.bk * 3 * sk;
    if (Math.random() < 0.025 * (1.3 - sk)) { bx += crkPick([-1.2, 1.4]); wide = true; }
  } else {
    // you: the marker, sprayed by how far the needle was off centre
    const err = 1 - acc;
    bx = C.aim.x + crkGauss() * err * 0.55; bz = C.aim.z + crkGauss() * err * 1.4;
    v = spin ? 18.5 + acc * 2 : 25 + acc * 4.5;
    if (acc < 0.1) { bx += crkPick([-1.3, 1.5]); wide = true; }
    if (acc > 0.94) { crkFeed('PERFECT RELEASE', '#ffd23a'); C.stats.perfect++; }
  }
  bz = crkClamp(bz, -8.9, 4);
  // release point: the bowling hand, high over the front foot
  const R0 = [bw.x + 0.18, 2.3, 9.7];
  const dx = bx - R0[0], dz = bz - R0[2], dh = Math.hypot(dx, dz), t1 = dh / v;
  const swing = spin ? 0 : crkRnd(-2.4, 2.4);                       // lateral acceleration in the air (pace)
  const turn = spin ? crkRnd(0.9, 2.6) * (Math.random() < 0.6 ? -1 : 1) : crkRnd(-0.4, 0.4);   // off the pitch
  const B = C.ball;
  B.on = true; B.st = 'del'; B.x = R0[0]; B.y = R0[1]; B.z = R0[2];
  B.vx = (dx - swing * t1 * t1 / 2) / t1; B.vz = dz / t1; B.vy = (4.9 * t1 * t1 - R0[1]) / t1; B.ax = swing;
  B.turn = turn; B.bounced = false; B.e = spin ? 0.5 : 0.6; B.bx = bx; B.bz = bz; B.hitBat = false; B.lastTouch = null;
  d.v = v; d.wide = wide; d.kmh = Math.round(v * (spin ? 4.7 : 5.1)); d.bx = bx; d.bz = bz;
  // when it'll reach the contact plane, and where (for timing + the CPU's eye)
  const P = crkPredict(B, CRK_ZC);
  d.tc = C.t + (P ? P.t : 0.7); d.cx = P ? P.x : bx; d.cy = P ? P.y : 0.6;
  const S = crkPredict(B, -CRK_STUMPZ);
  d.hitsStumps = !!S && Math.abs(S.x) < 0.13 && S.y < 0.72;
  C.phase = 'flight'; C.phaseT = 0;
  C.meter = null; C.aim.show = false;
  crkFeed(d.kmh + ' KM/H' + (spin ? ' · SPIN' : ''), '#c8dcff');
  crkSfx('whoosh');
  if (!crkHumanBats() || C.auto) crkCpuShot();
}
// fly a copy of the delivery forward to the plane z = zp
function crkPredict(B, zp) {
  const b = { x: B.x, y: B.y, z: B.z, vx: B.vx, vy: B.vy, vz: B.vz, ax: B.ax, bounced: B.bounced, turn: B.turn, e: B.e };
  const dt = 1 / 240;
  for (let t = 0; t < 2.5; t += dt) {
    crkDelStep(b, dt);
    if (b.z <= zp) return { t, x: b.x, y: b.y };
  }
  return null;
}
function crkDelStep(b, dt) {
  if (!b.bounced) b.vx += b.ax * dt;
  b.vy -= 9.8 * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  if (b.y <= 0.035 && b.vy < 0) {
    b.y = 0.035;
    if (!b.bounced) { b.bounced = true; b.vy = -b.vy * b.e; b.vx += b.turn; b.vz *= 0.92; if (b === cricket.ball) crkSfx('pitch'); }
    else { b.vy = -b.vy * 0.4; b.vz *= 0.8; b.vx *= 0.8; }
  }
}

// ---- the shot ---------------------------------------------------------------------------------------------
// type: 'ground' | 'loft' | 'block'; dir: world direction the batter aims (x, z), or null = straight back
function crkPressShot(type, dir) {
  const C = cricket;
  if (C.phase !== 'flight' && !(C.phase === 'runup' && C.runupT - C.phaseT < 0.2)) return;
  if (C.shot) return;
  C.shot = { type, dir: dir || null, tp: C.t };
  const st = C.striker;
  st.act = 'swing';
  const d = dir ? (dir[0] >= 0 ? 1 : -1) * Math.min(1, Math.abs(dir[0]) * 1.5) : 0;
  st.swing = { u: 0, loft: type === 'loft', dir: d, back: type === 'block' ? false : false, block: type === 'block' };
}
// the CPU's batter: reads length and line, picks a gap, and gets the timing roughly right
function crkCpuShot() {
  const C = cricket, d = C.del;
  const sk = C.auto ? 0.85 : 0.5 + 0.5 * C.cfg.skill;
  const s = C.sc[C.inn], ballsLeft = C.cfg.overs * 6 - s.b;
  const need = C.inn ? (C.target - s.r) / Math.max(1, ballsLeft) : 1.4;           // runs per ball wanted
  const aggr = crkClamp(0.25 + need * 0.35 + (C.auto ? 0 : (C.cfg.skill - 0.6) * 0.3), 0.15, 0.95);
  const len = d.bz;
  let type = 'ground';
  if (len < -7.6) type = Math.random() < 0.6 ? 'block' : 'ground';                // a yorker: dig it out
  else if (len > -2.8) type = Math.random() < aggr * 0.9 ? 'loft' : 'ground';     // short: pull it
  else if (len < -5.6) type = Math.random() < aggr * 0.75 ? 'loft' : 'ground';    // full: drive it
  else type = Math.random() < aggr * 0.35 ? 'loft' : Math.random() < 0.35 - aggr * 0.2 ? 'block' : 'ground';
  if (d.wide) type = Math.random() < 0.7 ? null : type;                           // leave the wide one
  if (!type) return;
  const dir = crkGapDir(type, len);
  // timing: an error with a spread by skill; quick bowling, yorkers and spin's turn make it harder
  const sig = (0.115 - 0.055 * sk) * (d.type === 'pace' ? 1 + (d.v - 24) * 0.03 : 1.1) * (len < -7.6 ? 1.4 : 1);
  let e = crkGauss() * sig - 0.005;
  const misread = (0.075 + (1 - sk) * 0.12) * (d.type === 'spin' ? 1.4 : 1) * (len < -7.6 ? 1.6 : 1);
  if (Math.random() < misread) e = crkPick([-1, 1]) * crkRnd(0.17, 0.3);
  C.cpuShot = { type, dir, at: d.tc - CRK_LEAD + e };
}
// the gap: try a dozen angles in the shot's natural arc, keep the one furthest from any fielder
function crkGapDir(type, len) {
  const C = cricket;
  const arc = len > -2.8 ? [-2.4, 1.2] : len < -5.6 ? [-1.0, 1.1] : [-1.8, 1.6];   // pull/cut wide, drives straight
  let best = null, bs = -1;
  for (let i = 0; i < 12; i++) {
    const a = arc[0] + (arc[1] - arc[0]) * Math.random();
    const dx = Math.sin(a), dz = Math.cos(a);
    let gap = 99;
    for (const p of C.players) {
      if (p.role !== 'field') continue;
      const rx = p.x - C.striker.x, rz = p.z - C.striker.z, along = rx * dx + rz * dz;
      if (along < 0) continue;
      const off = Math.abs(rx * dz - rz * dx);
      gap = Math.min(gap, off / Math.max(1, along * (type === 'loft' ? 0.03 : 0.12)));
    }
    if (gap > bs) { bs = gap; best = [dx, dz]; }
  }
  return best;
}
// the moment of truth: the ball reaches the bat (or doesn't)
function crkResolveShot() {
  const C = cricket, d = C.del, sh = C.shot, B = C.ball, st = C.striker;
  if (!sh) return false;
  const e = sh.tp + CRK_LEAD - d.tc;                 // < 0 early, > 0 late
  const reachX = d.cx - st.x;                         // the ball's line against his stance (+ = off side)
  const inReach = reachX > -0.6 && reachX < 1.75 && d.cy < 1.95;
  const block = sh.type === 'block';
  const W = block ? 0.13 : sh.type === 'loft' ? 0.125 : 0.14;
  const ae = Math.abs(e);
  if (!inReach || ae > W + 0.03) return false;        // missed it
  // the edge: just off the middle, a thick or thin nick
  if (!block && ae > W - 0.045 && Math.random() < 0.72) {
    B.st = 'live'; B.hitBat = true; B.bounced = false; B.lastTouch = st; C.liveT = 0;
    if (e > 0) { const a = crkRnd(0.25, 0.75); const sp = crkRnd(13, 20); B.vx = Math.sin(a) * sp * 0.6; B.vz = -Math.cos(a) * sp; B.vy = crkRnd(0.5, 3.2); crkFeed('EDGED!', '#ffb08a'); }
    else {
      if (d.hitsStumps && Math.random() < 0.35) { crkSfx('edge'); crkBreakStumps(-1, 0.7); B.vz = -2; B.vx *= 0.3; C.edgeBall = true; crkFeed('PLAYED ON!', '#ffb08a'); crkOut('bowled'); return true; }
      const a = crkRnd(-2.4, -1.5); const sp = crkRnd(8, 14); B.vx = Math.sin(a) * sp; B.vz = Math.cos(a) * sp; B.vy = crkRnd(-1, 1.5); crkFeed('INSIDE EDGE', '#ffb08a');
    }
    crkSfx('edge');
    C.edgeBall = true;
    crkGoLive();
    return true;
  }
  const q = crkClamp(1 - ae / W, 0, 1), perfect = ae < 0.028;
  let dx = 0, dz = 1;
  if (sh.dir) { dx = sh.dir[0]; dz = sh.dir[1]; }
  // timing pulls it round: early to leg (−x), late to off (+x); the line nudges it too
  let a = Math.atan2(dx, dz) + crkClamp(e / W, -1, 1) * (block ? 0.3 : 0.75) + reachX * 0.22;
  if (block) {
    const sp = crkRnd(3, 7);
    B.vx = Math.sin(a) * sp; B.vz = Math.cos(a) * sp; B.vy = 0.6;
  } else if (sh.type === 'loft') {
    const pw = 0.55 + 0.45 * q + (perfect ? 0.08 : 0);
    let sp = 19 + 13 * pw, ang = 0.6 - 0.1 * q;
    if (q < 0.45) { ang = crkRnd(0.95, 1.25); sp *= 0.72; }   // skied it
    B.vx = Math.sin(a) * sp * Math.cos(ang); B.vz = Math.cos(a) * sp * Math.cos(ang); B.vy = sp * Math.sin(ang);
  } else {
    const pw = 0.5 + 0.5 * q + (perfect ? 0.08 : 0), sp = 13 + 17 * pw;
    B.vx = Math.sin(a) * sp; B.vz = Math.cos(a) * sp; B.vy = crkRnd(0.8, 2.6) + (d.cy > 1.2 ? 2.5 : 0);
  }
  B.st = 'live'; B.hitBat = true; B.bounced = false; B.lastTouch = st; C.liveT = 0; C.edgeBall = false;
  if (perfect && !block) { crkFeed('PERFECT TIMING!', '#ffd23a'); if (crkHumanBats()) C.stats.perfect++; C.slowT = 0.3; }
  crkSfx(block ? 'block' : 'bat', q);
  crkGoLive();
  return true;
}
function crkGoLive() {
  const C = cricket;
  C.phase = 'live'; C.phaseT = 0; C.camMode = 'follow';
  C.striker.act = 'swing';
  crkFieldPlan();
  crkRunsPlan(true);
}

// ---- the live ball: physics, fielding, running -------------------------------------------------------------
function crkBallStep(B, dt) {
  // in the air: gravity and a little drag; on the grass: bounce, then roll
  if (B.y > 0.04 || B.vy > 0) {
    const sp = Math.hypot(B.vx, B.vy, B.vz), k = 0.0068 * sp;
    B.vx -= B.vx * k * dt; B.vy -= (9.8 + B.vy * k) * dt; B.vz -= B.vz * k * dt;
  }
  B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
  if (B.y <= 0.04) {
    B.y = 0.04;
    if (B.vy < -2.2) { B.vy = -B.vy * 0.36; B.vx *= 0.72; B.vz *= 0.72; if (!B.bounced) { B.bounced = true; crkSfx('pitch'); } }
    else {
      B.vy = 0; B.bounced = true;
      const h = Math.hypot(B.vx, B.vz), dec = 3.6 * dt;
      if (h <= dec) { B.vx = 0; B.vz = 0; } else { B.vx -= B.vx / h * dec; B.vz -= B.vz / h * dec; }
    }
  }
}
// fly the live ball forward; return the first moment each spot is reachable
function crkPath(B, secs) {
  const b = { x: B.x, y: B.y, z: B.z, vx: B.vx, vy: B.vy, vz: B.vz, bounced: B.bounced }, out = [];
  const dt = 1 / 30;
  for (let t = 0; t <= secs; t += dt) { out.push({ t, x: b.x, y: b.y, z: b.z, air: !b.bounced }); crkBallStep(b, dt); if (Math.hypot(b.x, b.z) > CRK_BOUND + 2) { out.push({ t: t + dt, x: b.x, y: b.y, z: b.z, air: !b.bounced, out: true }); break; } }
  return out;
}
// who goes for it: the man who gets to the ball's path first (a catch if it's still in the air)
function crkFieldPlan() {
  const C = cricket, B = C.ball, path = crkPath(B, 6);
  let best = null;
  for (const p of C.players) {
    if (p.role !== 'field' && p.role !== 'keep' && p.role !== 'bowl') continue;
    for (const s of path) {
      if (s.out) break;
      if (s.y > 3.2) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z), need = Math.max(0, d - 1.0) / p.spd + 0.18;
      if (need <= s.t || (s.air && d < 1.8 && s.y < 2.8)) { if (!best || s.t < best.t) best = { p, t: s.t, x: s.x, z: s.z, air: s.air && s.y > 0.3 }; break; }
    }
  }
  for (const p of C.players) p.chase = false;
  if (!best) {
    // nobody gets there before the rope: the nearest man to where it's heading gives chase anyway
    const end = path[path.length - 1];
    let n = null, nd = 1e9;
    for (const p of C.players) if (p.role === 'field') { const d = Math.hypot(end.x - p.x, end.z - p.z); if (d < nd) { nd = d; n = p; } }
    if (n) best = { p: n, t: end.t, x: end.x, z: end.z, air: false };
  }
  if (best) { best.p.chase = true; best.p.tx = best.x; best.p.tz = best.z; C.chaser = best.p; C.chaseAir = best.air; C.chaseT = best.t; }
}
function crkFieldStep(dt) {
  const C = cricket, B = C.ball;
  for (const p of C.players) {
    if (p.role === 'bat' || p.role === 'non' || p.role === 'ump') continue;
    p.look = B.on ? [B.x, B.y, B.z] : null;
    if (p.downT > 0) { p.downT -= dt; p.vx = p.vz = 0; continue; }
    if (p.dive > 0) { p.dive -= dt; p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 0.9; p.vz *= 0.9; if (p.dive <= 0) p.downT = 0.5; continue; }
    if (p.hasBall) { p.vx = p.vz = 0; continue; }
    let tx = p.x, tz = p.z, spd = 0;
    if (p.chase && B.st === 'live') {
      // keep re-aiming at where the ball will be when he can get there
      if (C.phaseT % 0.25 < dt) { const path = crkPath(B, 4); for (const s of path) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d / p.spd + 0.1 <= s.t || s === path[path.length - 1]) { p.tx = s.x; p.tz = s.z; break; } } }
      tx = p.tx; tz = p.tz; spd = p.spd;
    } else if (p.role === 'keep' || p.role === 'bowl') {
      // the keeper and the bowler come to the stumps for the throw
      const end = p.role === 'keep' ? -1 : 1;
      tx = 0.15 * end; tz = end * (CRK_STUMPZ + 0.6); spd = 6;
      if (C.phase !== 'live') spd = 0;
    } else if (B.st === 'live') {
      // the rest edge toward the ball a few steps, then wait
      const dx = B.x - p.homeX, dz = B.z - p.homeZ, d = Math.hypot(dx, dz);
      tx = p.homeX + (d > 1 ? dx / d * Math.min(6, d * 0.2) : 0); tz = p.homeZ + (d > 1 ? dz / d * Math.min(6, d * 0.2) : 0); spd = 3;
    }
    crkMoveTo(p, tx, tz, spd, dt);
    // the catch / the stop
    if (B.st === 'live' && (p.chase || Math.hypot(B.x - p.x, B.z - p.z) < 1.4)) {
      const dh = Math.hypot(B.x - p.x, B.z - p.z);
      if (!B.bounced && B.y < 2.7 && B.y > 0.15 && dh < 1.5 && B.lastTouch !== p) { crkCatchTry(p, dh); continue; }
      if (B.bounced && B.y < 1.0 && dh < 1.1) { crkGather(p); continue; }
      // a dive for one just out of reach
      if (p.chase && dh < 3.2 && dh > 1.3 && B.y < 1.6 && p.dive <= 0 && Math.hypot(B.vx, B.vz) > 6 && Math.random() < 0.06) {
        p.dive = 0.55; p.vx = (B.x - p.x) / dh * 7; p.vz = (B.z - p.z) / dh * 7; p.fx = (B.x - p.x) / dh; p.fz = (B.z - p.z) / dh; p.act = 'dive';
      }
    }
  }
}
function crkMoveTo(p, tx, tz, spd, dt) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d > 0.15 && spd > 0) {
    const s = Math.min(spd, d / Math.max(dt, 1e-3) * 0.5);
    const ux = dx / d, uz = dz / d;
    p.vx += (ux * s - p.vx) * Math.min(1, dt * 7); p.vz += (uz * s - p.vz) * Math.min(1, dt * 7);
    p.fx = ux; p.fz = uz;
  } else { p.vx *= 0.8; p.vz *= 0.8; }
  p.x += p.vx * dt; p.z += p.vz * dt;
  p.anim += Math.hypot(p.vx, p.vz) * dt * 0.75;
  if (p.act === 'dive' && p.dive <= 0) p.act = 'field';
}
function crkCatchTry(p, dh) {
  const C = cricket, B = C.ball;
  const sp = Math.hypot(B.vx, B.vy, B.vz);
  let pc = (p.keeper ? 0.9 : p.catcher ? 0.82 : 0.86) - Math.max(0, sp - 20) * 0.02 - (dh > 0.9 ? 0.18 : 0) - (B.y > 2.2 ? 0.12 : 0);
  if (dh > 0.9) { p.dive = 0.5; p.act = 'dive'; }
  else p.act = 'catch';
  if (C.edgeBall) pc += 0.05;
  if (Math.random() < pc) {
    B.st = 'held'; B.vx = B.vy = B.vz = 0; p.hasBall = true; B.holder = p; B.x = p.x; B.z = p.z; B.y = 1.2;
    crkSfx('catch');
    crkOut('caught', p);
  } else {
    // spilled: it pops off his hands
    B.vx *= -0.2; B.vz *= -0.2; B.vy = crkRnd(1, 3); B.bounced = true; B.lastTouch = p;
    crkFeed('DROPPED!', '#ff9a8a'); crkSay(crkPick(['OH, HE HAS PUT IT DOWN!', 'DROPPED! A LIFELINE!', 'THAT SHOULD HAVE BEEN TAKEN!']), 1);
    crkCrowd('aww');
  }
}
function crkGather(p) {
  const C = cricket, B = C.ball;
  B.st = 'held'; B.vx = B.vy = B.vz = 0; B.holder = p; p.hasBall = true; p.act = 'field';
  // the throw: in 0.35 s, at the end where a batter's in more danger (or the keeper if they're home)
  C.throwT = 0.35;
}
function crkThrowStep(dt) {
  const C = cricket, B = C.ball, p = B.holder;
  if (B.st !== 'held' || !p || C.outPending) return;
  B.x = p.x + p.fx * 0.3; B.z = p.z + p.fz * 0.3; B.y = 1.3;
  if (C.throwT > 0) { C.throwT -= dt; if (C.throwT <= 0.12) { p.act = 'throw'; p.throwU = 1 - C.throwT / 0.12; } return; }
  const R = C.run;
  let end = -1;
  if (R && R.going) end = crkDanger();
  else end = Math.hypot(p.x, p.z + CRK_STUMPZ) < Math.hypot(p.x, p.z - CRK_STUMPZ) ? -1 : 1;
  // the keeper / bowler at the stumps only relays it if there's a run on at the OTHER end
  if (p.role === 'keep' || p.role === 'bowl') { const mine = p.role === 'keep' ? -1 : 1; if (!(R && R.going) || end === mine) return; }
  const tx = 0.1 * end, tz = end * (CRK_STUMPZ + 0.3), ty = 0.75;
  const dx = tx - B.x, dz = tz - B.z, dh = Math.hypot(dx, dz), sp = p.keeper ? 14 : 27, T = Math.max(0.25, dh / sp);
  B.st = 'throw'; B.vx = dx / T; B.vz = dz / T; B.vy = (ty - B.y + 4.9 * T * T) / T; B.throwEnd = end; B.throwT = T; B.throwTo = [tx, tz];
  p.hasBall = false; p.act = 'throw'; p.throwU = 1; B.holder = null;
  crkSfx('throw');
}
// the throw arrives: a direct hit or the gather, and whoever's short of his ground is gone
function crkThrowArrive() {
  const C = cricket, B = C.ball, end = B.throwEnd, R = C.run;
  const short = crkShortOf(end);
  const direct = Math.random() < 0.3;
  if (direct) crkBreakStumps(end, 0.6);
  B.st = 'held'; B.vx = B.vy = B.vz = 0;
  const catcher = end === -1 ? C.keeper : C.bowler;
  B.holder = catcher; catcher.hasBall = true; B.x = 0.1 * end; B.z = end * (CRK_STUMPZ + 0.3); B.y = 0.8;
  if (short && direct) { crkOut('runout', null, short); return; }
  // gathered: he has to whip the bails off — a diving batter can make it in that beat
  if (short) { C.whip = { end, t: 0.32 }; return; }
  // nobody short: the keeper (or bowler) holds it; the batters finish the run they're on
  if (R) R.queued = false;
  if (!R || !R.going) crkBallDead(0.6);
}
// which end is the danger end: the one a running batter is further from
function crkDanger() {
  const C = cricket, R = C.run;
  if (!R || !R.going) return -1;
  // batter A runs toward R.dirA end; compute how far each has left to his crease
  let worst = -1, wd = -1;
  for (const b of [C.striker, C.non]) {
    if (!b.runTo) continue;
    const left = Math.abs(b.z - b.runTo * CRK_CREASE) * (Math.sign(b.runTo * CRK_CREASE - b.z) === b.runTo ? 1 : 0);
    if (left > wd) { wd = left; worst = b.runTo; }
  }
  return worst;
}
function crkShortOf(end) {
  const C = cricket;
  for (const b of [C.striker, C.non]) {
    if (b.runTo !== end) continue;
    const home = end > 0 ? b.z >= CRK_CREASE + 0.05 : b.z <= -CRK_CREASE - 0.05;
    if (!home) return b;
  }
  return null;
}
// ---- running between the wickets ----------------------------------------------------------------------------
function crkRunsPlan(fresh) {
  const C = cricket;
  if (fresh) C.run = { going: false, done: 0, queued: false, want: false };
  if (crkHumanBats() && !C.auto) return;                    // you call them
  // the CPU's batters: go if the fielder won't have it back in time
  const R = C.run, B = C.ball;
  if (!R || R.going || C.boundary || C.outPending) return;
  const t = crkFieldEta();
  if (t > 3.5 - (C.cfg ? C.cfg.skill * 0.15 : 0) + (R.done ? 0.4 : 0)) crkCallRun();
}
// seconds until the ball's back at the stumps (pickup + throw): EVERY fielder's best time to the ball
// on its path, plus the throw to the nearer end (the nearest man, not just the one sent to chase —
// a soft push the bowler picks up is a run-out waiting to happen)
function crkFieldEta() {
  const C = cricket, B = C.ball;
  const toStumps = (x, z) => Math.min(Math.hypot(x, z + CRK_STUMPZ), Math.hypot(x, z - CRK_STUMPZ)) / 27;
  if (B.st === 'held' && B.holder) return Math.max(0, C.throwT || 0) + toStumps(B.holder.x, B.holder.z);
  if (B.st === 'throw') return Math.max(0, B.throwT);
  if (B.st !== 'live') return 0;
  const now = C.t;
  if (C.etaAt && now - C.etaAt < 0.2) return C.etaVal;
  const path = crkPath(B, 4);
  let best = 9;
  for (const p of C.players) {
    if (p.role !== 'field' && p.role !== 'keep' && p.role !== 'bowl') continue;
    for (const st of path) {
      if (st.out) break;
      if (st.y > 2.6) continue;
      // he only has to get within arm's reach of it (a ball that passes 1 m away is stopped)
      const need = Math.max(0, Math.hypot(st.x - p.x, st.z - p.z) - 1.0) / p.spd + 0.15;
      if (need <= st.t) { best = Math.min(best, st.t + 0.35 + toStumps(st.x, st.z)); break; }
    }
  }
  // and the batter's eye: a fielder already near the ball is a fielder about to have it
  for (const p of C.players) {
    if (p.role !== 'field' && p.role !== 'keep' && p.role !== 'bowl') continue;
    const d = Math.hypot(B.x - p.x, B.z - p.z);
    best = Math.min(best, Math.max(0, d - 1.2) / p.spd + 0.45 + toStumps(B.x, B.z) + Math.hypot(B.vx, B.vz) * 0.04);
  }
  C.etaAt = now; C.etaVal = best;
  return best;
}
function crkCallRun() {
  const C = cricket, R = C.run;
  if (!R || C.outPending || C.boundary || C.phase !== 'live') return;
  if (R.going) { R.queued = true; return; }
  R.going = true; R.queued = false;
  // the striker runs to the far end and the non-striker the other way
  for (const b of [C.striker, C.non]) { b.runTo = b.z < 0 ? 1 : -1; b.runFrom = -b.runTo; b.act = ''; b.swing = null; b.look = null; }
  crkSfx('select');
}
function crkSendBack() {
  const C = cricket, R = C.run;
  if (!R || !R.going) return;
  for (const b of [C.striker, C.non]) { const mid = Math.abs(b.z) < 0.5 ? 0 : b.z; if (Math.sign(mid) !== b.runTo) { b.runTo = -b.runTo; } }
  R.back = true; R.queued = false;
}
function crkRunStep(dt) {
  const C = cricket, R = C.run;
  for (const b of [C.striker, C.non]) {
    if (!R || !R.going || !b.runTo) { if (b.act !== 'swing' && b.act !== 'bat') b.act = ''; b.vx *= 0.8; b.vz *= 0.8; b.x += b.vx * dt; b.z += b.vz * dt; continue; }
    const tz = b.runTo * (CRK_CREASE + 0.9), tx = b.runTo > 0 ? -0.9 : 0.6;
    crkMoveTo(b, tx, tz, 7.4, dt);
  }
  if (!R || !R.going) return;
  // both home at the far ends: one run
  const homeA = (b) => (b.runTo > 0 ? b.z >= CRK_CREASE + 0.05 : b.z <= -CRK_CREASE - 0.05);
  if (homeA(C.striker) && homeA(C.non)) {
    if (!R.back) { R.done++; C.runsThisBall = R.done; crkFeed(R.done === 1 ? '1 RUN' : R.done + ' RUNS', '#ffffff'); if (R.done === 2 && Math.random() < 0.6) crkSay(crkPick(['THEY COME BACK FOR TWO!', 'GOOD RUNNING, TWO MORE!']), 0); else if (R.done === 3) crkSay('THREE! EXCELLENT RUNNING BETWEEN THE WICKETS!', 1); }
    R.back = false;
    // they swap: the striker is whoever stands at the batting (−z) end
    if (C.striker.z > 0) { const t = C.striker; C.striker = C.non; C.non = t; C.striker.role = 'bat'; C.non.role = 'non'; }
    R.going = false;
    for (const b of [C.striker, C.non]) b.runTo = 0;
    if (R.queued) { R.queued = false; crkCallRun(); }
    else if (!crkHumanBats() || C.auto) crkRunsPlan(false);
  }
}
// ---- outcomes ---------------------------------------------------------------------------------------------
function crkOut(how, fielder, batter) {
  const C = cricket;
  if (C.outPending) return;
  const who = batter || C.striker;
  C.outPending = { how, who, fielder };
  if (C.stats) C.stats['out_' + how] = (C.stats['out_' + how] || 0) + 1;
  const R = C.rosters[C.bat][who.idx];
  if (R) R.out = how;
  const bw = C.rosters[1 - C.bat][C.bowlerI];
  if (how !== 'runout' && bw) bw.wk++;
  const call = { caught: 'CAUGHT!', bowled: 'BOWLED!', lbw: 'LBW!', runout: 'RUN OUT!' }[how];
  crkBanner(call, '#ff5a3a', who.name, 1.6);
  const lines = {
    caught: ['AND HE IS CAUGHT!', 'STRAIGHT DOWN HIS THROAT!', 'WHAT A CATCH!', 'TAKEN!'],
    bowled: ['BOWLED HIM!', 'CLEAN BOWLED!', 'THE STUMPS ARE A MESS!', 'TIMBER!'],
    lbw: ['THAT IS PLUMB! OUT LBW!', 'THE FINGER GOES UP!'],
    runout: ['RUN OUT! A DIRECT HIT!', 'HE IS SHORT OF HIS GROUND!', 'MIX UP! RUN OUT!'],
  }[how];
  crkSay(crkPick(lines), 2);
  C.ump.act = 'umpOut';
  crkCrowd(crkHumanBats() ? 'aww' : 'roar'); crkSfx('wicket');
  if (!crkHumanBats()) { crkEarn(6, 'WICKET'); C.stats.wkts++; if (how === 'caught') C.stats.catches++; }
  for (const p of C.players) if (p.team !== C.bat && p.role !== 'ump') p.act = 'celeb';
  crkBallDead(1.9);
}
function crkBoundary(six) {
  const C = cricket;
  if (C.boundary || C.outPending) return;
  C.boundary = six ? 6 : 4;
  if (C.stats) C.stats['b' + C.boundary] = (C.stats['b' + C.boundary] || 0) + 1;
  if (C.run) C.run.going = false;
  crkBanner(six ? 'SIX!' : 'FOUR!', six ? '#ff9a1a' : '#3ad0ff', null, 1.4);
  crkSay(crkPick(six ? ['THAT IS HUGE! SIX!', 'INTO THE CROWD!', 'OUT OF THE GROUND!', 'MAXIMUM!'] : ['FOUR! RACES AWAY!', 'CRACKING SHOT! FOUR!', 'SHOT! ALL THE WAY FOR FOUR!', 'BEAUTIFULLY TIMED, FOUR!']), 2);
  crkSfx(six ? 'six' : 'four');
  crkCrowd('roar'); C.crowdJump = 1;
  if (crkHumanBats()) { crkEarn(six ? 8 : 4, six ? 'SIX' : 'FOUR'); C.stats[six ? 'sixes' : 'fours']++; }
  crkBallDead(1.7);
}
function crkBallDead(secs) {
  const C = cricket;
  if (C.phase === 'dead') return;
  C.phase = 'dead'; C.deadT = secs || 1.0; C.phaseT = 0;
}
// the ball's over: score it, rotate strike, next ball / over / innings / match
function crkSettle() {
  const C = cricket, s = C.sc[C.inn], d = C.del || {};
  const wide = !!d.wide && !(C.ball && C.ball.hitBat);
  let runs = C.boundary || C.runsThisBall || 0;
  if (C.boundary && C.run) runs = C.boundary;
  const legal = !wide;
  if (wide) { s.r += 1; s.x++; crkMark('WD'); crkFeed('WIDE · +1', '#c8dcff'); }
  s.r += runs;
  const Rb = C.rosters[C.bat][C.striker.idx];
  if (legal && Rb) { Rb.b++; }
  if (Rb && C.boundary) Rb.r += runs;
  else if (Rb && !C.boundary) Rb.r += runs;
  const bw = C.rosters[1 - C.bat][C.bowlerI];
  if (bw) { bw.rc += runs + (wide ? 1 : 0); if (legal) bw.bb++; }
  if (C.outPending) { s.w++; crkMark('W'); }
  else if (legal) crkMark(C.boundary === 6 ? '6' : C.boundary === 4 ? '4' : runs ? String(runs) : '•');
  if (legal) s.b++;
  if (legal && !runs && !C.outPending && crkHumanBats() === false) C.stats.dots++;
  if (crkHumanBats() && runs && !C.boundary) crkEarn(runs, '');
  // the batter's out: the next man walks in at the end he left
  if (C.outPending) {
    const gone = C.outPending.who;
    if (C.nextIn < 11) {
      const ni = C.order[C.bat][C.nextIn++];
      const nb = crkMan(C.bat, ni, gone === C.striker ? 'bat' : 'non', gone.x, gone.z);
      nb.bat = true; nb.pads = true; nb.helmet = true;
      C.players[C.players.indexOf(gone)] = nb;
      if (gone === C.striker) C.striker = nb; else C.non = nb;
    }
  }
  // the batters crossed on the last run (or the run out happened mid-pitch): the striker's whoever is at −z
  if (C.striker.z > 0 && C.non.z <= 0) { const t = C.striker; C.striker = C.non; C.non = t; }
  if (!C.boundary && !C.outPending && runs % 2 === 1 && C.striker.z < 0 && C.non.z < 0) { /* already swapped by position */ }
  C.striker.role = 'bat'; C.non.role = 'non';
  // innings / match over?
  const ballsDone = s.b >= C.cfg.overs * 6, allOut = s.w >= CRK_WKTS, chased = C.inn === 1 && s.r >= C.target;
  if (ballsDone || allOut || chased) { crkEndInnings(); return; }
  // the over's done: swap ends, new bowler
  if (legal && s.b % 6 === 0) {
    const t = C.striker; C.striker = C.non; C.non = t; C.striker.role = 'bat'; C.non.role = 'non';
    C.overBowler = (C.overBowler + 1) % C.bowlers.length;
    C.bowlerI = C.bowlers[C.overBowler];
    const ov = s.b / 6;
    crkBanner('END OF OVER ' + ov, '#ffffff', crkTeam(C.bat).abbr + ' ' + s.r + '/' + s.w + (C.inn ? ' · NEED ' + (C.target - s.r) + ' OFF ' + (C.cfg.overs * 6 - s.b) : ''), 1.6);
    C.thisOver = [];
    crkCastKeep();
    crkNextBall(1.8);
    return;
  }
  crkNextBall(0.7);
}
// rebuild the field around the same two batters (a new bowler, ends swapped)
function crkCastKeep() {
  const C = cricket, st = C.striker, nn = C.non;
  const sI = st.idx, nI = nn.idx;
  const R = C.order[C.bat];
  C.strikerI = R.indexOf(sI); C.nonI = R.indexOf(nI);
  crkCast();
}
function crkMark(m) { cricket.thisOver.push(m); if (cricket.thisOver.length > 8) cricket.thisOver.shift(); }
function crkEndInnings() {
  const C = cricket, s = C.sc[C.inn];
  if (C.inn === 0) {
    C.target = s.r + 1;
    C.phase = 'break'; C.phaseT = 0;
    crkSay(crkTeam(C.bat).full + ' FINISH ON ' + s.r + '. ' + crkTeam(1 - C.bat).full + ' NEED ' + C.target + '.', 2, 'AND THAT IS THE END OF THE INNINGS!');
    return;
  }
  // the chase is done
  const chased = s.r >= C.target;
  const winner = chased ? C.bat : 1 - C.bat;
  const won = winner === C.human, tie = s.r === C.target - 1;
  C.result = { won: won && !tie, tie, margin: chased ? (CRK_WKTS - s.w) + ' WICKET' + (CRK_WKTS - s.w === 1 ? '' : 'S') : (C.target - 1 - s.r) + ' RUN' + (C.target - 1 - s.r === 1 ? '' : 'S') };
  C.phase = 'final'; C.phaseT = 0;
  if (C.result.won) {
    crkEarn(40, 'WIN');
    crkSay(crkTeam(C.human).full + ' WIN BY ' + C.result.margin + '!', 2, 'WHAT A WIN! WHAT A MATCH!');
    try { if (C.cfg.key === 'pro') localStorage.setItem('nugCricketPro', '1'); if (C.cfg.key === 'worldcup') localStorage.setItem('nugCricketChamp', '1'); } catch (e) { }
    crkCrowd('roar');
  } else if (tie) { crkEarn(15, 'TIE'); crkSay('IT IS A TIE! UNBELIEVABLE!', 2); }
  else crkSay(crkTeam(winner).full + ' WIN BY ' + C.result.margin + '.', 2, 'AND THAT IS THE MATCH. HARD LUCK.');
  try { ArcadeKit.saveBest('cricket', C.cfg.key, C.earned); } catch (e) { }
}
function crkEarn(units, why) {
  const C = cricket;
  if (units <= 0 || !C.cfg) return 0;
  const worth = Math.max(1, Math.round(storm.perFlyer * units * C.cfg.mult));
  storm.caught += worth; C.earned += worth;
  if (why) crkFeed('+' + fmt.format(worth) + ' ' + why, '#ffd23a');
  return worth;
}
function crkFeed(text, color) { const C = cricket; C.feed.push({ text, color: color || '#fff', t: 2.4 }); if (C.feed.length > 3) C.feed.shift(); }
function crkBanner(text, color, sub, T) { cricket.banner = { text, color: color || '#ffd23a', sub: sub || '', t: 0, T: T || 1.4 }; }
// the ticker shows `text`; the commentator says `voice` (a number-free line that has a recording) or the text itself
function crkSay(text, prio, voice) {
  const C = cricket;
  C.ticker = { text, t: 0 };
  if (typeof crkSpeak === 'function') crkSpeak(voice || text, { prio: prio || 1 });
}

// ---- the frame ----------------------------------------------------------------------------------------------
function cricketUpdate(dt) {
  const C = cricket;
  C.phaseT += dt;
  for (const f of C.feed) f.t -= dt;
  C.feed = C.feed.filter((f) => f.t > 0);
  if (C.banner) { C.banner.t += dt; if (C.banner.t > C.banner.T) C.banner = null; }
  if (C.ticker) C.ticker.t += dt;
  C.crowdJump = Math.max(0, C.crowdJump - dt * 0.6);
  crkStumpsStep(dt);
  const ph = C.phase;
  if (ph === 'splash') { if (C.phaseT > 2.8) crkOpenTier(); return; }
  if (ph === 'teams' || ph === 'toss' || ph === 'tier' || ph === 'idle') return;
  if (ph === 'break') { if (C.phaseT > 3.2 && (C.auto || C.phaseT > 6)) crkSecondInnings(); return; }
  if (ph === 'final') return;
  // everybody's legs
  for (const p of C.players) {
    if (p.act === 'celeb' && ph === 'set') p.act = p.role === 'field' ? 'field' : '';
  }
  if (ph === 'set') {
    C.setT -= dt;
    for (const p of C.players) p.anim += Math.hypot(p.vx, p.vz) * dt;
    if (C.setT <= 0 && (crkHumanBats() || C.auto) && C.phaseT > 1.0) crkStartRunup(null);
    if (C.aim.show && !C.auto) crkAimStep(dt);
    return;
  }
  if (ph === 'runup') {
    const bw = C.bowler, u = Math.min(1, C.phaseT / C.runupT);
    bw.bowlU = u; bw.act = 'bowl';
    bw.z = (C.del.type === 'spin' ? 15 : 23) - ((C.del.type === 'spin' ? 15 : 23) - 10.2) * Math.min(1, u / 0.85);
    bw.vz = -8; bw.anim += dt * 5.5;
    if (C.meter) { C.meter.t += dt; C.meter.u = Math.sin(C.meter.t * Math.PI * 2 / 1.05); }
    if (C.aim.show) crkAimStep(dt);
    C.striker.look = [bw.x, 2, bw.z];
    if (C.phaseT >= C.runupT) {
      if (C.meter && !C.meter.done) crkRelease(0.35);                // too slow on the button: a loose one
      else if (!C.meter) crkRelease(1);
    }
    return;
  }
  // the bowler follows through
  const bw = C.bowler;
  if (bw.act === 'bowl') { bw.bowlU = Math.min(1, (bw.bowlU || 0.9) + dt * 1.2); bw.z -= dt * 5; if (bw.bowlU >= 1) { bw.act = ''; bw.vz = -3; } }
  const B = C.ball;
  if (ph === 'flight') {
    // the CPU's swing
    if (C.cpuShot && C.t >= C.cpuShot.at && !C.shot) { const s = C.cpuShot; C.cpuShot = null; crkPressShot(s.type, s.dir); C.shot.tp = s.at; }
    const steps = 4, h = dt / steps;
    for (let i = 0; i < steps && C.phase === 'flight'; i++) {
      const z0 = B.z;
      crkDelStep(B, h);
      if (z0 > CRK_ZC && B.z <= CRK_ZC) {
        if (crkResolveShot()) break;
      }
      // past the bat: the pad, the stumps, the keeper
      if (z0 > -9.15 && B.z <= -9.15 && !B.hitBat) {
        // the pads stand in front of middle-and-leg; a ball beating the bat to the stumps hits pad about
        // half the time (an LBW shout), otherwise it's through the gate onto the stumps (bowled, below)
        const onPads = B.x > -0.55 && B.x < 0.2 && B.y < 0.95;
        if (onPads && !C.del.hitsStumps && !C.del.wide) { crkSfx('pad'); B.vz = 1.2; B.vx *= 0.3; B.vy = 0.6; B.hitBat = true; crkBallDead(0.9); break; }
        if (onPads && C.del.hitsStumps && !C.del.wide && Math.random() < 0.5) {
          crkSfx('pad'); B.vz = 1.5; B.vx *= 0.3; B.vy = 0.8;
          crkBanner('HOWZAT?', '#ffd23a', null, 0.8); crkCrowd('appeal');
          const inLine = C.del.bx > -0.15;
          C.lbwT = 0.8; C.lbwOut = inLine && Math.random() < 0.85;
          C.phase = 'live'; B.st = 'dead'; C.camMode = 'tv';
          break;
        }
      }
      if (z0 > -CRK_STUMPZ && B.z <= -CRK_STUMPZ && !B.hitBat) {
        if (Math.abs(B.x) < 0.13 && B.y < 0.72) { crkBreakStumps(-1, 1); B.vz *= 0.3; B.vx += crkRnd(-2, 2); crkOut('bowled'); return; }
      }
      // into the keeper's gloves (wherever he stands: back for pace, up at the stumps for spin), or
      // a slow one that's stopped short of him — and never let a delivery hang
      const kd = Math.hypot(B.x - C.keeper.x, B.z - C.keeper.z);
      if (!B.hitBat && (kd < 1.3 && B.z < -CRK_STUMPZ - 0.3 || B.z < C.keeper.z - 0.5 || C.phaseT > 3.5 || (B.bounced && Math.hypot(B.vx, B.vz) < 1.5 && B.z < -CRK_STUMPZ))) {
        // into the keeper's gloves
        B.st = 'held'; B.holder = C.keeper; B.x = C.keeper.x; B.z = C.keeper.z + 0.5; B.y = 0.9; crkSfx('catch');
        if (!C.shot && !C.del.wide) crkSay(crkPick(['WELL LEFT.', 'NO SHOT OFFERED.', 'BEATEN!', 'OUTSIDE OFF, LEFT ALONE.']), 0);
        else if (C.shot) crkSay(crkPick(['BEATEN! PLAY AND A MISS!', 'SWING AND A MISS!', 'JUST PAST THE OUTSIDE EDGE!']), 1);
        crkBallDead(0.9);
        return;
      }
    }
    if (C.striker.swing) C.striker.swing.u = Math.min(1, (C.t - C.shot.tp) / 0.45);
    C.striker.look = [B.x, B.y, B.z];
    return;
  }
  if (ph === 'live') {
    C.liveT += dt;
    if (C.striker.swing) { C.striker.swing.u = Math.min(1, C.striker.swing.u + dt / 0.45); if (C.striker.swing.u >= 1 && C.liveT > 0.35) { C.striker.swing = null; C.striker.act = ''; } }
    // an LBW appeal waits for the umpire
    if (C.lbwT > 0) {
      C.lbwT -= dt; crkBallStep(B, dt);
      if (C.lbwT <= 0) { if (C.lbwOut) crkOut('lbw'); else { crkFeed('NOT OUT', '#c8dcff'); crkSay(crkPick(['NOT OUT, SAYS THE UMPIRE.', 'MISSING LEG, NOT OUT.']), 1); crkBallDead(0.8); } }
      return;
    }
    if (B.st === 'live') {
      const steps = 3, h = dt / steps;
      for (let i = 0; i < steps; i++) crkBallStep(B, h);
      const r = Math.hypot(B.x, B.z);
      if (r >= CRK_BOUND) { crkBoundary(!B.bounced); return; }
      // a ball that's stopped dead with nobody near: the nearest man walks to it
      if (Math.hypot(B.vx, B.vz) < 0.2 && B.y <= 0.05 && C.chaser && !C.chaser.chase) crkFieldPlan();
    } else if (B.st === 'throw') {
      crkBallStep(B, dt);
      B.throwT -= dt;
      if (B.throwT <= 0 || Math.hypot(B.x - B.throwTo[0], B.z - B.throwTo[1]) < 0.5) crkThrowArrive();
    }
    crkFieldStep(dt);
    crkThrowStep(dt);
    crkRunStep(dt);
    if (C.whip) { C.whip.t -= dt; if (C.whip.t <= 0) { const w = C.whip, sh = crkShortOf(w.end); C.whip = null; crkBreakStumps(w.end, 0.35); if (sh) { crkOut('runout', null, sh); return; } crkFeed('IN HIS GROUND', '#c8dcff'); } }
    if (C.phase !== 'live') return;
    // nothing doing: the ball's back in and nobody's running
    if (B.st === 'held' && !(C.run && C.run.going) && C.liveT > 1.0 && (B.holder && (B.holder.role === 'keep' || B.holder.role === 'bowl' || C.throwT <= 0))) {
      if (B.holder.role === 'field' && C.throwT <= 0 && !(C.run && C.run.going)) { /* will throw in */ }
      else crkBallDead(0.6);
    }
    if (C.liveT > 12) crkBallDead(0.4);                     // the safety valve
    return;
  }
  if (ph === 'dead') {
    C.deadT -= dt;
    crkFieldStep(dt);
    crkRunStep(dt);
    if (B.st === 'live') { crkBallStep(B, dt); if (Math.hypot(B.x, B.z) > CRK_BOUND + 6) { B.vx *= 0.9; B.vz *= 0.9; } }
    if (C.deadT <= 0) crkSettle();
  }
}
function crkSecondInnings() {
  const C = cricket;
  C.inn = 1; C.bat = 1 - C.bat;
  crkStartInnings();
}
// the human's aim marker: the stick walks it (screen right is −x, screen up is down the pitch, −z)
function crkAimStep(dt) {
  const C = cricket, s = crkStick();
  C.aim.x = crkClamp(C.aim.x - s.x * dt * 2.2, -0.9, 1.3);
  C.aim.z = crkClamp(C.aim.z - s.y * dt * 6, -8.7, 2.5);
}
// the camera: the TV shot from behind the bowler; after the hit it rises and chases the ball
function crkCam(dt) {
  const C = cricket, c = C.cam, B = C.ball;
  // the broadcast shot: high behind the bowler on a long lens, so the batter is big and the pitch runs up the screen
  let px = 2.4, py = 14, pz = 84, tx = 0, ty = 1.1, tz = -6.5, F = C.H * 7.2;
  if (C.camMode === 'follow' && B.on && (C.phase === 'live' || C.phase === 'dead')) {
    const bx = B.x, bz = B.z, d = Math.hypot(bx, bz + 8);
    if (d > 6) {
      const ux = bx / Math.max(1, Math.hypot(bx, bz)), uz = bz / Math.max(1, Math.hypot(bx, bz));
      px = -ux * 26 + bx * 0.15; pz = -uz * 26 + bz * 0.15 - 4; py = 12 + Math.min(18, d * 0.2);
      tx = bx; ty = Math.min(B.y, 6) * 0.6; tz = bz; F = C.H * 1.05;
    } else { tx = bx; tz = bz; F = C.H * 1.5; }
  }
  if (C.phase === 'final' || C.phase === 'break') { px = 30; py = 24; pz = 40; tx = 0; ty = 0; tz = 0; F = C.H * 1.0; }
  const k = Math.min(1, dt * (C.camMode === 'follow' ? 2.6 : 4));
  C.camT = C.camT || { px, py, pz, tx, ty, tz, F };
  const T = C.camT;
  for (const [a, v] of [['px', px], ['py', py], ['pz', pz], ['tx', tx], ['ty', ty], ['tz', tz], ['F', F]]) T[a] += (v - T[a]) * k;
  c.x = T.px; c.h = T.py; c.z = T.pz;
  c.yaw = Math.atan2(T.tx - T.px, T.tz - T.pz);
  c.pitch = Math.atan2(T.py - T.ty, Math.hypot(T.tx - T.px, T.tz - T.pz));
  C.F = T.F;
  crkCamTrig(c);
}

// ---- the mode's step (called by storm.js every frame) --------------------------------------------------------
function stepCricket(dt, w, h) {
  syncCricket();
  const C = cricket;
  if (!C.on) return;
  if (Math.abs(C.cv.width - Math.round(Math.max(240, Math.min(1000, w * CRK_RES / h))) * C.ov) > 4) cricketLayout();
  crkPollPad();
  dt = Math.min(dt, 0.05);
  C.t += dt;
  if (C.slowT > 0) { C.slowT -= dt; dt *= 0.35; }
  if (!C.paused && C.phase !== 'tier') cricketUpdate(dt);
  crkCam(dt);
  if (typeof crkMusicFrame === 'function') crkMusicFrame();
  crkPadFrame();
  crkDraw();
}

// ---- drawing: the world (GL) and the HUD (2D on top) ----------------------------------------------------------
function crkText(g, str, x, y, size, col, align, outline) {
  g.font = '900 italic ' + Math.round(size) + 'px Impact, "Arial Black", sans-serif';
  g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  if (outline !== false) { g.lineWidth = Math.max(2, size * 0.22); g.strokeStyle = '#000'; g.strokeText(str, x, y); }
  g.fillStyle = col || '#fff'; g.fillText(str, x, y);
}
function crkTextC(g, str, x, y, size, col) { crkText(g, str, x, y, size, col, 'center'); }
function crkChrome(g, x, y, w, h, fill) {
  g.fillStyle = fill || 'rgba(6,12,30,0.86)';
  g.beginPath(); g.moveTo(x + 6, y); g.lineTo(x + w, y); g.lineTo(x + w - 6, y + h); g.lineTo(x, y + h); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.stroke();
}
function crkDraw() {
  const C = cricket, g = C.g, W = C.W, H = C.H;
  g.setTransform(C.ov, 0, 0, C.ov, 0, 0);
  g.clearRect(0, 0, W, H);
  C.hit.cards = [];
  const menu = C.phase === 'tier' || C.phase === 'idle' || C.phase === 'teams' || C.phase === 'toss' || C.phase === 'splash';
  if (C.phase === 'splash') { if (C.glCv) C.glCv.style.visibility = 'hidden'; crkDrawSplash(g, W, H); return; }
  if (C.glCv) C.glCv.style.visibility = menu ? 'hidden' : 'visible';
  if (C.phase === 'teams') { crkDrawTeams(g, W, H); return; }
  if (C.phase === 'toss') { crkDrawToss(g, W, H); return; }
  if (menu) return;
  if (!crkGLRender()) { g.fillStyle = '#2a6a28'; g.fillRect(0, 0, W, H); }
  crkDrawHud(g, W, H);
  if (C.phase === 'break') crkDrawBreak(g, W, H);
  if (C.phase === 'final') crkDrawFinal(g, W, H);
  if (C.paused && !C.padEl) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, W, H); crkTextC(g, 'PAUSED', W / 2, H / 2 - 10, 30, '#fff'); crkTextC(g, 'ESC RESUME · Q QUIT', W / 2, H / 2 + 18, 11, '#c8dcff'); }
}
function crkDrawHud(g, W, H) {
  const C = cricket, ui = C.ui, s = C.sc[C.inn], mob = !!C.mobile, menuW = mob ? 58 * H / window.innerHeight : 0;
  // the scorebox: team, runs/wickets, overs; the target under it in the chase
  const bx = 8, by = 6, bw = 150 * ui, bh = (C.inn ? 46 : 34) * ui;
  crkChrome(g, bx, by, bw, bh);
  const T = crkTeam(C.bat);
  g.fillStyle = T.c1; g.fillRect(bx + 4, by + 4, 6 * ui, bh - 8);
  crkText(g, T.abbr, bx + 14 * ui, by + 12 * ui, 13 * ui, '#fff');
  crkText(g, s.r + '/' + s.w, bx + 56 * ui, by + 13 * ui, 18 * ui, '#ffd23a');
  crkText(g, '(' + crkOvers(s.b) + ')', bx + bw - 8 * ui, by + 13 * ui, 11 * ui, '#c8dcff', 'right');
  crkText(g, 'OF ' + C.cfg.overs + ' OVERS', bx + 14 * ui, by + 26 * ui, 8 * ui, '#8a96b8');
  if (C.inn) crkText(g, 'NEED ' + Math.max(0, C.target - s.r) + ' OFF ' + Math.max(0, C.cfg.overs * 6 - s.b), bx + 14 * ui, by + 38 * ui, 10 * ui, '#ffffff');
  if (!mob) crkDrawLogo(g, bx + bw + 26 * ui, by + bh / 2 + 4 * ui, 46 * ui, 1, true);
  // this over: a dot per ball
  const ox = W - 14 - menuW, oy = by + 10 * ui;
  crkText(g, 'THIS OVER', ox, oy, 8 * ui, '#8a96b8', 'right');
  for (let i = 0; i < C.thisOver.length; i++) {
    const m = C.thisOver[C.thisOver.length - 1 - i], x = ox - 8 * ui - i * 15 * ui, y = oy + 14 * ui;
    const col = m === 'W' ? '#e8402a' : m === '6' ? '#ff9a1a' : m === '4' ? '#1a9ae8' : m === 'WD' ? '#5a6478' : '#e8eef8';
    g.fillStyle = col; g.beginPath(); g.arc(x, y, 6.5 * ui, 0, 7); g.fill();
    crkTextC(g, m, x, y + 0.5, (m.length > 1 ? 6 : 8) * ui, m === '•' || /^[0-3]$/.test(m) ? '#1a1a1a' : '#fff');
  }
  // batter + bowler strip, bottom-left (top on a phone, the thumbs own the bottom)
  const st = C.striker, Rb = st && C.rosters[C.bat][st.idx], bwR = C.rosters[1 - C.bat][C.bowlerI];
  if (Rb && bwR && C.phase !== 'final' && C.phase !== 'break') {
    const y0 = mob ? by + bh + 8 * ui : H - 34 * ui, w0 = 170 * ui;
    crkChrome(g, 8, y0, w0, 26 * ui);
    crkText(g, '🏏 ' + Rb.name, 14, y0 + 8 * ui, 9 * ui, '#ffffff', 'left', false);
    crkText(g, Rb.r + ' (' + Rb.b + ')', 8 + w0 - 8, y0 + 8 * ui, 9 * ui, '#ffd23a', 'right', false);
    crkText(g, '⚾ ' + bwR.name + (bwR.bowl === 'spin' ? ' · SPIN' : ' · PACE'), 14, y0 + 19 * ui, 8 * ui, '#c8dcff', 'left', false);
    crkText(g, bwR.wk + '-' + bwR.rc, 8 + w0 - 8, y0 + 19 * ui, 8 * ui, '#c8dcff', 'right', false);
  }
  // the feed, right
  let fy = mob ? by + 44 * ui : H - 60 * ui;
  for (let i = C.feed.length - 1; i >= 0; i--) {
    const f = C.feed[i];
    g.globalAlpha = Math.min(1, f.t * 2);
    crkText(g, f.text, W - 14 - menuW, fy, 10 * ui, f.color, 'right');
    fy += (mob ? 13 : -13) * ui;
  }
  g.globalAlpha = 1;
  // the commentary ticker, bottom centre
  if (C.ticker && C.ticker.t < 4) {
    const a = Math.min(1, (4 - C.ticker.t) * 2);
    g.globalAlpha = a;
    const tw = Math.min(W - 40, C.ticker.text.length * 6.4 * ui + 30);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(W / 2 - tw / 2, (mob ? H * 0.62 : H - 16 * ui) - 8 * ui, tw, 16 * ui);
    crkTextC(g, '🎙 ' + C.ticker.text, W / 2, mob ? H * 0.62 : H - 16 * ui, 9 * ui, '#ffffff');
    g.globalAlpha = 1;
  }
  // prompts: the moment's instructions
  const pad = C.inputMode === 'pad', tch = C.inputMode === 'touch';
  const hy = mob ? H * 0.55 : H * 0.8;
  if (C.phase === 'set' && !crkHumanBats() && C.setT <= 0) {
    crkTextC(g, mob ? 'AIM THE MARKER · TAP PACE OR SPIN' : pad ? 'STICK AIMS · A PACE · B SPIN' : 'ARROWS AIM · J PACE · K SPIN', W / 2, hy, 12 * ui, '#ffffff');
  }
  if (C.phase === 'runup' && C.meter) crkDrawMeter(g, W, H);
  if ((C.phase === 'set' || C.phase === 'runup') && crkHumanBats() && !C.auto)
    crkTextC(g, mob ? 'TAP A SHOT AS THE BALL ARRIVES · STICK AIMS' : pad ? 'A GROUND · B LOFT · X BLOCK — AS IT ARRIVES · STICK AIMS' : 'J GROUND · K LOFT · L BLOCK — AS IT ARRIVES · ARROWS AIM', W / 2, hy, 10 * ui, '#c8dcff');
  if (C.phase === 'live' && crkHumanBats() && !C.auto && C.run && !C.boundary && !C.outPending) {
    const eta = crkFieldEta(), safe = eta > (C.run.going ? 1.8 : 3.4);
    if (((C.t * 3) | 0) % 2 === 0 || C.run.going) crkTextC(g, C.run.going ? (C.run.queued ? 'ANOTHER! ' : 'RUNNING… ') + (mob ? 'BACK TO STOP' : pad ? 'X = BACK' : 'L = BACK') : (mob ? 'RUN!' : pad ? 'Y = RUN!' : 'SPACE = RUN!') + (safe ? '  (SAFE)' : '  (RISKY)'), W / 2, hy, 13 * ui, safe ? '#7aff8a' : '#ffb08a');
  }
  // the banner
  const Bn = C.banner;
  if (Bn) {
    const u = Bn.t / Bn.T, sc = u < 0.12 ? 0.6 + u / 0.12 * 0.4 : 1, a = u > 0.8 ? (1 - u) / 0.2 : 1;
    g.globalAlpha = a;
    g.save(); g.translate(W / 2, H * 0.36); g.scale(sc, sc); g.transform(1, 0, -0.18, 1, 0, 0);
    crkText(g, Bn.text, 0, 0, 44 * ui, Bn.color, 'center');
    g.restore();
    if (Bn.sub) crkTextC(g, Bn.sub, W / 2, H * 0.36 + 30 * ui, 12 * ui, '#ffffff');
    g.globalAlpha = 1;
  }
}
// the release meter: a needle swinging across; the middle is the money
function crkDrawMeter(g, W, H) {
  const C = cricket, ui = C.ui, m = C.meter, w = 180 * ui, h = 14 * ui, x = W / 2 - w / 2, y = C.mobile ? H * 0.62 : H * 0.72;
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, '#e8402a'); gr.addColorStop(0.3, '#f2c41e'); gr.addColorStop(0.5, '#3ae85a'); gr.addColorStop(0.7, '#f2c41e'); gr.addColorStop(1, '#e8402a');
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  const nx = x + w / 2 + m.u * w / 2;
  g.fillStyle = '#ffffff'; g.fillRect(nx - 2, y - 6, 4, h + 12);
  crkTextC(g, C.mobile ? 'TAP BOWL IN THE GREEN' : C.inputMode === 'pad' ? 'A / B IN THE GREEN' : 'SPACE IN THE GREEN', W / 2, y + h + 12 * ui, 10 * ui, '#ffffff');
}
function crkDrawSplash(g, W, H) {
  const C = cricket, t = C.phaseT;
  g.fillStyle = '#fff3d6'; g.fillRect(0, 0, W, H);
  // a slow sunburst behind the pot
  g.save(); g.translate(W / 2, H * 0.44); g.rotate(t * 0.15);
  for (let i = 0; i < 16; i++) { g.rotate(Math.PI / 8); g.fillStyle = i % 2 ? 'rgba(247,160,50,0.10)' : 'rgba(216,48,110,0.06)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, -W * 0.2); g.lineTo(W, W * 0.2); g.fill(); }
  g.restore();
  const pop = t < 0.35 ? 0.6 + t / 0.35 * 0.4 : 1 + Math.sin(t * 3) * 0.015;
  if (!crkDrawLogo(g, W / 2, H * 0.45, Math.min(H * 0.8, W * 0.78) * pop)) crkTextC(g, 'BIRYANI BLITZ!', W / 2, H * 0.45, 40, '#f7a032');
  if (t > 0.8 && ((t * 2) | 0) % 2 === 0) crkTextC(g, C.mobile ? 'TAP TO PLAY' : C.inputMode === 'pad' ? 'PRESS A' : 'PRESS ANY KEY', W / 2, H * 0.93, 12, '#7a1a20');
}
function crkDrawTeams(g, W, H) {
  const C = cricket, t = C.phaseT;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a3a1a'); bg.addColorStop(1, '#02100a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  crkDrawLogo(g, W / 2, H * 0.52, H * 0.9, 0.08);
  crkDrawLogo(g, 40, 30, 54, 1, true);
  g.save(); g.translate(W / 2, 32); g.transform(1, 0, -0.2, 1, 0, 0); crkText(g, 'PICK YOUR SIDE', 0, 0, 24, '#ffe23a', 'center'); g.restore();
  const cols = W < 420 ? 2 : 4, rows = CRK_TEAM_ORDER.length / cols;
  const gw = Math.min(W - 20, 560), cw = (gw - (cols - 1) * 8) / cols, top = 56, ch = Math.min(92, (H - top - 90) / rows - 8), x0 = (W - gw) / 2;
  CRK_TEAM_ORDER.forEach((key, i) => {
    const T = CRK_TEAMS[key], r = (i / cols) | 0, c = i % cols, x = x0 + c * (cw + 8), y = top + r * (ch + 8), sel = i === C.teamSel;
    crkChrome(g, x, y, cw, ch, sel ? crkMix(T.c1, 0.1, '#000000') : 'rgba(6,12,30,0.86)');
    if (sel) { g.strokeStyle = ((t * 4) | 0) % 2 ? '#ffe23a' : '#ffffff'; g.lineWidth = 2.5; g.strokeRect(x - 3, y - 3, cw + 6, ch + 6); }
    // a badge: the team's colours and letter
    const r0 = Math.min(ch * 0.26, cw * 0.2), cx = x + cw / 2, cy = y + ch * 0.38;
    g.fillStyle = T.c2; g.beginPath(); g.arc(cx, cy, r0 + 3, 0, 7); g.fill();
    g.fillStyle = T.c1; g.beginPath(); g.arc(cx, cy, r0, 0, 7); g.fill();
    crkTextC(g, T.logo, cx, cy + 1, r0 * 1.2, T.c2);
    crkText(g, String(i + 1), x + 8, y + 10, 10, '#ffe23a');
    crkTextC(g, T.name, cx, y + ch * 0.8, Math.min(12, cw / T.name.length * 1.7), '#ffffff');
    crkTextC(g, T.city, cx, y + ch * 0.93, Math.min(8, cw / T.city.length * 1.4), crkMix(T.c2, 0.2));
    C.hit.cards.push({ x, y, w: cw, h: ch, n: i });
  });
  const T = CRK_TEAMS[CRK_TEAM_ORDER[C.teamSel]], yb = top + rows * (ch + 8) + 14;
  crkTextC(g, T.full, W / 2, yb, 16, '#ffd23a');
  crkTextC(g, T.blurb, W / 2, yb + 18, 10, '#c8dcff');
  crkTextC(g, C.cfg.name + ' · ' + C.cfg.overs + ' OVERS A SIDE', W / 2, yb + 34, 10, '#ffffff');
  if (((t * 2) | 0) % 2 === 0) crkTextC(g, C.inputMode === 'pad' ? 'STICK + A' : C.mobile || C.inputMode === 'touch' ? 'TAP A SIDE' : 'ARROWS + ENTER (OR CLICK A SIDE)', W / 2, H - 14, 10, '#ffe23a');
}
function crkDrawToss(g, W, H) {
  const C = cricket, t = C.phaseT;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a2a4a'); bg.addColorStop(1, '#02060e');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const A = crkTeam(0), B = crkTeam(1);
  const lg = crkDrawLogo(g, W / 2, 50, 92, 1, true), oy = lg ? 66 : 0;
  crkTextC(g, A.full + '  V  ' + B.full, W / 2, 34 + oy, 13, '#ffffff');
  const btn = (label, x, y, w, h, n, hot) => {
    crkChrome(g, x, y, w, h, hot ? '#c8321f' : 'rgba(20,30,60,0.92)');
    crkTextC(g, label, x + w / 2, y + h / 2 + 1, 15, '#ffffff');
    C.hit.cards.push({ x, y, w, h, n });
  };
  const bw = Math.min(150, W * 0.36), bh = 40, y = H * 0.5;
  if (C.tossWon == null) {
    crkTextC(g, 'THE TOSS — CALL IT', W / 2, y - 26, 14, '#ffffff');
    btn('HEADS', W / 2 - bw - 8, y, bw, bh, 'h', C.tossSel === 0);
    btn('TAILS', W / 2 + 8, y, bw, bh, 't', C.tossSel === 1);
  } else if (C.tossWon) {
    crkTextC(g, 'IT\'S ' + (C.tossCoin ? 'TAILS' : 'HEADS') + ' — YOU WON THE TOSS', W / 2, y - 26, 14, '#ffd23a');
    btn('BAT FIRST', W / 2 - bw - 8, y, bw, bh, 'bat', C.tossSel === 0);
    btn('BOWL FIRST', W / 2 + 8, y, bw, bh, 'bowl', C.tossSel === 1);
  } else {
    crkTextC(g, 'IT\'S ' + (C.tossCoin ? 'TAILS' : 'HEADS') + ' — ' + B.name + ' WIN THE TOSS', W / 2, y - 26, 14, '#ffffff');
    crkTextC(g, 'AND CHOOSE TO ' + (C.cpuChose === 'bat' ? 'BAT' : 'BOWL') + ' FIRST', W / 2, y, 16, '#ffd23a');
    btn('PLAY!', W / 2 - bw / 2, y + 22, bw, bh, 'go', true);
  }
}
function crkDrawBreak(g, W, H) {
  const C = cricket, s = C.sc[0];
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, W, H);
  crkDrawLogo(g, W / 2, H * 0.14, H * 0.22, 1, true);
  crkTextC(g, 'INNINGS BREAK', W / 2, H * 0.3, 26, '#ffd23a');
  crkTextC(g, crkTeam(C.bat).full + '  ' + s.r + '/' + s.w + '  (' + crkOvers(s.b) + ')', W / 2, H * 0.42, 14, '#ffffff');
  crkTextC(g, crkTeam(1 - C.bat).full + ' NEED ' + C.target + ' TO WIN', W / 2, H * 0.52, 16, '#7aff8a');
  if (C.phaseT > 1.5 && ((C.t * 2) | 0) % 2 === 0) crkTextC(g, C.mobile ? 'TAP TO START THE CHASE' : 'SPACE / A TO START THE CHASE', W / 2, H * 0.66, 11, '#c8dcff');
}
function crkDrawFinal(g, W, H) {
  const C = cricket, R = C.result, t = C.phaseT;
  g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(0, 0, W, H);
  crkDrawLogo(g, W - 60, 46, 76, 1, true);
  const head = R.tie ? 'IT\'S A TIE!' : R.won ? 'YOU WIN!' : 'YOU LOSE';
  crkTextC(g, head, W / 2, H * 0.22, 34, R.won ? (((t * 5) | 0) % 2 ? '#ffd23a' : '#ffffff') : R.tie ? '#ffd23a' : '#ff8a7a');
  if (!R.tie) crkTextC(g, (R.won ? crkTeam(C.human) : crkTeam(1 - C.human)).full + ' WIN BY ' + R.margin, W / 2, H * 0.32, 12, '#ffffff');
  for (let i = 0; i < 2; i++) {
    const s = C.sc[i], team = i === 0 ? C.firstBat : 1 - C.firstBat;
    crkTextC(g, crkTeam(team).abbr + '  ' + s.r + '/' + s.w + '  (' + crkOvers(s.b) + ')', W / 2, H * 0.44 + i * 18, 14, team === C.human ? '#ffd23a' : '#ffffff');
  }
  const st = C.stats;
  crkTextC(g, st.fours + ' FOURS · ' + st.sixes + ' SIXES · ' + st.wkts + ' WICKETS · ' + st.perfect + ' PERFECT', W / 2, H * 0.64, 10, '#c8dcff');
  crkTextC(g, '+' + fmt.format(C.earned) + ' NUGGETS', W / 2, H * 0.72, 16, '#ffd23a');
  if (t > 1 && ((t * 2) | 0) % 2 === 0) crkTextC(g, C.mobile ? 'TAP REMATCH' : 'SPACE / A REMATCH · R NEW OPPONENT', W / 2, H * 0.84, 11, '#8a92b0');
}

// ---- sound (the synth floor; js/cricketAudio.js adds the recordings + voices) ---------------------------------
function crkAudio() {
  const S = cricket.sfx;
  if (S.ctx) { if (S.ctx.state === 'suspended') S.ctx.resume(); return; }
  try {
    S.ctx = new (window.AudioContext || window.webkitAudioContext)();
    S.master = S.ctx.createGain(); S.master.gain.value = S.muted ? 0 : 0.36; S.master.connect(S.ctx.destination);
    const n = S.ctx.sampleRate * 2, buf = S.ctx.createBuffer(1, n, S.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    S.noise = buf;
  } catch (e) { S.ctx = null; }
}
function crkSfx(kind, q) {
  const S = cricket.sfx, ctx = S.ctx;
  if (!ctx || S.muted) return;
  if (typeof crkDiscShot === 'function' && crkDiscShot(kind, q)) return;
  const t = ctx.currentTime;
  const tone = (type, f0, f1, dur, vol, at) => { const o = ctx.createOscillator(), g = ctx.createGain(), t0 = t + (at || 0); o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur); o.connect(g); g.connect(S.master); o.start(t0); o.stop(t0 + dur + 0.02); };
  const noise = (freq, qq, dur, vol, at, type) => { const src = ctx.createBufferSource(); src.buffer = S.noise; const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = qq; const g = ctx.createGain(), t0 = t + (at || 0); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur); src.connect(f); f.connect(g); g.connect(S.master); src.start(t0, Math.random()); src.stop(t0 + dur + 0.02); };
  if (kind === 'bat') { noise(2400, 1.4, 0.05, 1.0); noise(900, 1, 0.09, 0.6); tone('sine', 520, 300, 0.06, 0.25 + (q || 0) * 0.2); }
  else if (kind === 'block') { noise(1200, 1, 0.05, 0.5); tone('sine', 260, 180, 0.05, 0.2); }
  else if (kind === 'edge') { noise(3600, 2, 0.03, 0.6); tone('triangle', 1400, 900, 0.04, 0.15); }
  else if (kind === 'stumps') { for (let i = 0; i < 4; i++) { noise(1500 + i * 400, 3, 0.08, 0.5, i * 0.03); tone('triangle', 700 + i * 90, 400, 0.08, 0.12, i * 0.03); } }
  else if (kind === 'pad') { noise(300, 0.8, 0.12, 0.8, 0, 'lowpass'); }
  else if (kind === 'catch') { noise(260, 0.7, 0.09, 0.6, 0, 'lowpass'); tone('sine', 200, 120, 0.07, 0.2); }
  else if (kind === 'pitch') { noise(500, 1, 0.05, 0.3, 0, 'lowpass'); }
  else if (kind === 'throw' || kind === 'whoosh') noise(2400, 2, 0.12, 0.18);
  else if (kind === 'select') tone('square', 660, 0, 0.05, 0.08);
  else if (kind === 'four') { [523, 659, 784].forEach((f, i) => tone('square', f, 0, 0.1, 0.07, i * 0.08)); }
  else if (kind === 'six') { [523, 659, 784, 1046].forEach((f, i) => tone('sawtooth', f, 0, i === 3 ? 0.4 : 0.1, 0.07, i * 0.09)); }
}
function crkCrowdStart() {
  const S = cricket.sfx;
  if (!S.ctx || S.crowd) return;
  const src = S.ctx.createBufferSource(); src.buffer = S.noise; src.loop = true;
  const bp = S.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.5;
  const g = S.ctx.createGain(); g.gain.value = 0.05;
  src.connect(bp); bp.connect(g); g.connect(S.master); src.start();
  S.crowd = src; S.crowdGain = g;
}
function crkCrowdStop() { const S = cricket.sfx; if (S.crowd) { try { S.crowd.stop(); } catch (e) { } S.crowd = null; S.crowdGain = null; } }
function crkCrowd(kind) {
  const S = cricket.sfx;
  if (typeof crkDiscShot === 'function' && crkDiscShot('cr-' + kind)) return;
  if (!S.crowdGain) return;
  const t = S.ctx.currentTime, g = S.crowdGain.gain, lvl = kind === 'roar' ? 0.32 : kind === 'appeal' ? 0.22 : 0.14;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(lvl, t + 0.12); g.linearRampToValueAtTime(0.05, t + 1.8);
}

// ---- input ----------------------------------------------------------------------------------------------------
function crkStick() {
  const K = cricket.keys, T = cricket.touch, P = cricket.pad;
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
// the shot's aim: screen right is −x, screen up is behind him (−z); nothing held = straight back (+z)
function crkShotDir() {
  const s = crkStick();
  if (s.m < 0.3) return null;
  return [-s.x, -s.y];
}
// the four actions, whatever device: A (ground / pace), B (loft / spin), X (block / back), Y (run / bowl)
function crkAct(btn) {
  const C = cricket, ph = C.phase;
  crkAudio();
  if (ph === 'splash') { if (C.phaseT > 0.4) crkOpenTier(); return; }
  if (ph === 'teams') { if (btn === 'A' || btn === 'Y') crkTeamPick(); return; }
  if (ph === 'toss') { crkTossPress(C.tossSel); return; }
  if (ph === 'break') { if (C.phaseT > 1.2) crkSecondInnings(); return; }
  if (ph === 'final') { if (C.phaseT > 1) crkNewMatch(C.cfg); return; }
  if (C.paused) return;
  if (crkHumanBats()) {
    if (ph === 'flight' || ph === 'runup') { if (btn === 'A') crkPressShot('ground', crkShotDir()); else if (btn === 'B') crkPressShot('loft', crkShotDir()); else if (btn === 'X') crkPressShot('block', crkShotDir()); return; }
    if (ph === 'live') { if (btn === 'Y' || btn === 'A') crkCallRun(); else if (btn === 'X') crkSendBack(); return; }
  } else {
    if (ph === 'set') { if (btn === 'A') crkStartRunup('pace'); else if (btn === 'B') crkStartRunup('spin'); else if (btn === 'Y') crkStartRunup(null); return; }
    if (ph === 'runup' && C.meter && !C.meter.done) { C.meter.done = true; const acc = 1 - Math.abs(C.meter.u); C.relAcc = acc; crkRelease(acc); return; }
  }
}
function crkTossPress(n) {
  const C = cricket;
  if (C.tossWon == null) { crkToss(n === 'h' || n === 0 ? 0 : 1); return; }
  if (C.tossWon) { crkChoose(n === 'bat' || n === 0); return; }
  crkChoose(C.cpuChose === 'bowl');
}
function crkMenuOpen() { return !!cricketWorld.querySelector('.ak-tier') || !!document.querySelector('.modal-overlay.active'); }
window.addEventListener('keydown', (e) => {
  if (!cricketActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  const C = cricket;
  if (C.phase === 'tier' || crkMenuOpen()) return;
  crkAudio();
  if (C.phase === 'splash') { if (!e.repeat && C.phaseT > 0.4) crkOpenTier(); e.preventDefault(); return; }
  if (/^(Key[WASDJKLQRMNV]|Arrow(Up|Down|Left|Right)|Space|Enter|Escape|Digit[1-8])$/.test(e.code)) e.preventDefault();
  if (e.code === 'Escape') { if (!e.repeat && C.phase !== 'final' && C.phase !== 'teams' && C.phase !== 'toss') C.paused = !C.paused; return; }
  if (e.code === 'KeyM' && !e.repeat) { const S = C.sfx; S.muted = !S.muted; if (S.master) S.master.gain.value = S.muted ? 0 : 0.36; if (S.muted && typeof crkHush === 'function') crkHush(); crkFeed(S.muted ? 'SOUND OFF' : 'SOUND ON', '#6a7290'); return; }
  if (e.code === 'KeyV' && !e.repeat) { C.voice = !C.voice; if (!C.voice && typeof crkHush === 'function') crkHush(); crkFeed(C.voice ? 'COMMENTARY ON' : 'COMMENTARY OFF', '#6a7290'); return; }
  if (e.code === 'KeyN' && !e.repeat && typeof crkMusToggle === 'function') { crkFeed(crkMusToggle() ? 'MUSIC ON' : 'MUSIC OFF', '#6a7290'); return; }
  if (C.paused) { if (e.code === 'KeyQ') { C.paused = false; if (typeof stopStorm === 'function') stopStorm(); } return; }
  C.keys[e.code] = true;
  if (e.repeat) return;
  C.inputMode = 'kb';
  if (C.phase === 'final' && e.code === 'KeyR') { crkOpenTier(); return; }
  if (C.phase === 'teams') {
    const mv = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1, ArrowUp: -4, KeyW: -4, ArrowDown: 4, KeyS: 4 }[e.code];
    if (mv) { C.teamSel = (C.teamSel + mv + 8) % 8; crkSfx('select'); return; }
    const m = /^Digit([1-8])$/.exec(e.code); if (m) { crkTeamPick(+m[1] - 1); return; }
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') crkTeamPick();
    return;
  }
  if (C.phase === 'toss') {
    if (/Arrow(Left|Right)|Key[AD]/.test(e.code)) { C.tossSel ^= 1; crkSfx('select'); return; }
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') crkTossPress(C.tossSel);
    return;
  }
  const b = { KeyJ: 'A', KeyK: 'B', KeyL: 'X', Space: 'Y', Enter: 'Y' }[e.code];
  if (b) { if (b === 'Y' && C.phase === 'runup') crkAct('A'); else crkAct(b); }
});
window.addEventListener('keyup', (e) => { if (cricket.keys[e.code]) cricket.keys[e.code] = false; });
window.addEventListener('blur', () => { cricket.keys = {}; });
window.addEventListener('resize', () => { if (cricket.on) cricketLayout(); });
function crkWorldXY(cx, cy) { return { x: cx / window.innerWidth * cricket.W, y: cy / window.innerHeight * cricket.H }; }
function crkTapUI(x, y) {
  const C = cricket;
  if (C.phase === 'splash') { if (C.phaseT > 0.4) crkOpenTier(); return true; }
  for (const c of C.hit.cards) if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) {
    if (C.phase === 'teams') { crkTeamPick(c.n); return true; }
    if (C.phase === 'toss') { crkTossPress(c.n); return true; }
  }
  if (C.phase === 'break' || C.phase === 'final') { crkAct('A'); return true; }
  return false;
}
function crkPointerDown(e) {
  const C = cricket;
  if (!cricketActive() || C.phase === 'tier' || e.pointerType === 'touch') return;
  e.preventDefault();
  if (C.phase === 'splash') { crkAudio(); if (C.phaseT > 0.4) crkOpenTier(); return; }
  crkAudio();
  if (C.paused) { C.paused = false; return; }
  const p = crkWorldXY(e.clientX, e.clientY);
  if (crkTapUI(p.x, p.y)) return;
  crkAct(e.button === 2 ? 'B' : C.phase === 'live' ? 'Y' : crkHumanBats() ? 'A' : C.phase === 'set' ? 'Y' : 'A');
}
cricketWorld.addEventListener('contextmenu', (e) => { if (cricketActive()) e.preventDefault(); });
cricketWorld.addEventListener('touchstart', (e) => {
  const C = cricket;
  if (!cricketActive() || C.phase === 'tier') return;
  if (e.target.closest('.storm-hud, .ak-tier, .modal-overlay')) return;
  crkAudio(); crkPadOn();
  C.inputMode = 'touch';
  const T = C.touch;
  for (const t of e.changedTouches) {
    const x = t.clientX, y = t.clientY, wp = crkWorldXY(x, y);
    if (C.paused) continue;
    if (crkTapUI(wp.x, wp.y)) continue;
    if (x < window.innerWidth * 0.45 && !T.L) { T.L = { id: t.identifier, x0: x, y0: y, dx: 0, dy: 0 }; T.roles[t.identifier] = 'L'; }
  }
  e.preventDefault();
}, { passive: false });
cricketWorld.addEventListener('touchmove', (e) => {
  const T = cricket.touch;
  for (const t of e.changedTouches) {
    if (T.roles[t.identifier] !== 'L' || !T.L) continue;
    const rx = (t.clientX - T.L.x0) / 54, ry = (t.clientY - T.L.y0) / 54, m = Math.hypot(rx, ry), k = m < 0.12 ? 0 : m > 1 ? 1 / m : 1;
    T.L.dx = rx * k; T.L.dy = ry * k;
  }
  e.preventDefault();
}, { passive: false });
window.addEventListener('touchend', (e) => { const T = cricket.touch; for (const t of e.changedTouches) { if (T.roles[t.identifier] === 'L') T.L = null; delete T.roles[t.identifier]; } });
window.addEventListener('touchcancel', (e) => { const T = cricket.touch; for (const t of e.changedTouches) { if (T.roles[t.identifier] === 'L') T.L = null; delete T.roles[t.identifier]; } });

// the controller: A ground/pace · B loft/spin · X block/back · Y or a bumper run/bowl · START pause
function crkPollPad() {
  const C = cricket, P = C.pad;
  if (!navigator.getGamepads) return;
  let gp = null;
  try { for (const g of navigator.getGamepads()) if (g && g.connected) { gp = g; break; } } catch (e) { return; }
  if (!gp) { P.on = false; return; }
  const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
  const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
  P.lx = dz(gp.axes[0] || 0) + (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0);
  P.ly = dz(gp.axes[1] || 0) + (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
  const a = btn(0), b = btn(1), x = btn(2), y = btn(3) || btn(4) || btn(5) || btn(7), st = btn(9);
  if (P.lx || P.ly || a || b || x || y) { P.on = true; C.inputMode = 'pad'; }
  const nav = Math.abs(P.lx) > 0.6 ? (P.lx > 0 ? 'R' : 'L') : Math.abs(P.ly) > 0.6 ? (P.ly > 0 ? 'D' : 'U') : '';
  if (nav && nav !== P._nav) {
    if (C.phase === 'tier') crkTierPadMove(nav);
    else if (C.phase === 'teams') { C.teamSel = (C.teamSel + { R: 1, L: -1, U: -4, D: 4 }[nav] + 8) % 8; crkSfx('select'); }
    else if (C.phase === 'toss' && (nav === 'L' || nav === 'R')) { C.tossSel ^= 1; crkSfx('select'); }
  }
  P._nav = nav;
  if (C.phase === 'splash') { if (((a && !P._a) || (st && !P._st)) && C.phaseT > 0.4) crkOpenTier(); }
  else if (C.phase === 'tier') { if ((a && !P._a) || (st && !P._st)) crkTierPadPick(); }
  else {
    if (a && !P._a) crkAct(C.phase === 'runup' && C.meter ? 'A' : 'A');
    if (b && !P._b) crkAct(C.phase === 'runup' && C.meter ? 'A' : 'B');
    if (x && !P._x) crkAct('X');
    if (y && !P._y) crkAct(C.phase === 'runup' && C.meter ? 'A' : 'Y');
    if (st && !P._st && C.phase !== 'final' && C.phase !== 'teams' && C.phase !== 'toss') C.paused = !C.paused;
  }
  P._a = a; P._b = b; P._x = x; P._y = y; P._st = st;
}
function crkTierCards() { return Array.from(cricketWorld.querySelectorAll('.ak-tier-card:not(.ak-locked)')); }
function crkTierPadMove(nav) {
  const cs = crkTierCards();
  if (!cs.length) return;
  let i = cs.findIndex((c) => c.classList.contains('crk-padsel'));
  if (i < 0) i = Math.max(0, cs.findIndex((c) => c.classList.contains('ak-last')));
  else i = (i + (nav === 'L' || nav === 'U' ? cs.length - 1 : 1)) % cs.length;
  cs.forEach((c, j) => c.classList.toggle('crk-padsel', j === i));
}
function crkTierPadPick() { const cs = crkTierCards(); const c = cs.find((c) => c.classList.contains('crk-padsel')) || cs.find((c) => c.classList.contains('ak-last')) || cs[0]; if (c) c.click(); }

// ---- 📱 the phone pad: a floating stick and the moment's buttons (Blitz's pad, cricket's actions) -------------
function crkIsPhone() { try { return matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints || 0) > 0; } catch (e) { return false; } }
function crkPadOn() {
  const C = cricket;
  if (C.mobile) return;
  C.mobile = true; C.inputMode = 'touch';
  document.body.classList.add('crk-touch');
  const el = document.createElement('div');
  el.className = 'crkp';
  el.innerHTML = '<div class="crkp-stick"><div class="crkp-knob"></div></div>' +
    ['P0', 'P1', 'P2', 'P3'].map((k) => '<button type="button" class="crkp-b" data-slot="' + k + '" hidden><span class="crkp-l"></span></button>').join('') +
    '<button type="button" class="crkp-menu" aria-label="Pause">❚❚</button>' +
    '<div class="crkp-sheet" hidden><div class="crkp-card"><div class="crkp-kick">BIRYANI BLITZ · CRICKET EDITION</div><div class="crkp-h">PAUSED</div>' +
    '<button type="button" data-m="resume" class="crkp-go">RESUME</button><button type="button" data-m="music"></button><button type="button" data-m="sound"></button><button type="button" data-m="voice"></button>' +
    '<button type="button" data-m="quit" class="crkp-quit">QUIT TO THE ARCADE</button></div></div>';
  cricketWorld.appendChild(el);
  C.padEl = el; C.padBtns = {}; C.padHeld = {};
  el.querySelectorAll('.crkp-b').forEach((b) => { C.padBtns[b.dataset.slot] = { el: b, key: '' }; });
  el.addEventListener('touchstart', (e) => {
    const b = e.target.closest('.crkp-b, .crkp-menu, .crkp-sheet button');
    if (!b) { if (e.target.closest('.crkp-sheet')) { e.preventDefault(); e.stopPropagation(); } return; }
    e.preventDefault(); e.stopPropagation();
    crkAudio();
    if (b.classList.contains('crkp-menu')) { crkPadMenu(true); return; }
    if (b.dataset.m) { crkPadMenuAct(b.dataset.m); return; }
    const it = C.padSpec && C.padSpec[b.dataset.slot];
    if (!it) return;
    b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 120);
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (err) { }
    it.down();
  }, { passive: false });
  el.addEventListener('click', (e) => { const b = e.target.closest('.crkp-menu, .crkp-sheet button'); if (!b) return; if (b.classList.contains('crkp-menu')) crkPadMenu(true); else crkPadMenuAct(b.dataset.m); });
  crkPadMenuLabels();
}
function crkPadMenu(open) { const C = cricket; C.padEl.querySelector('.crkp-sheet').hidden = !open; C.paused = !!open; crkPadMenuLabels(); }
function crkPadMenuLabels() {
  const C = cricket, q = (m) => C.padEl.querySelector('[data-m="' + m + '"]');
  q('music').textContent = 'MUSIC: ' + (typeof crkMus !== 'undefined' && !crkMus.on ? 'OFF' : 'ON');
  q('sound').textContent = 'SOUND: ' + (C.sfx.muted ? 'OFF' : 'ON');
  q('voice').textContent = 'COMMENTARY: ' + (C.voice ? 'ON' : 'OFF');
}
function crkPadMenuAct(m) {
  const C = cricket, S = C.sfx;
  if (m === 'resume') crkPadMenu(false);
  else if (m === 'music' && typeof crkMusToggle === 'function') crkMusToggle();
  else if (m === 'sound') { S.muted = !S.muted; if (S.master) S.master.gain.value = S.muted ? 0 : 0.36; if (S.muted && typeof crkHush === 'function') crkHush(); }
  else if (m === 'voice') { C.voice = !C.voice; if (!C.voice && typeof crkHush === 'function') crkHush(); }
  else if (m === 'quit') { crkPadMenu(false); if (typeof stopStorm === 'function') stopStorm(); return; }
  crkPadMenuLabels();
}
function crkPadSpec() {
  const C = cricket, S = {}, ph = C.phase;
  if (C.paused || ph === 'tier' || ph === 'idle' || ph === 'teams' || ph === 'toss') return S;
  const f = (label, col, fn) => ({ label, col, down: fn });
  if (ph === 'break') { S.P0 = f('CHASE!', '#2a9a3a', () => crkAct('A')); return S; }
  if (ph === 'final') { if (C.phaseT > 1) { S.P0 = f('REMATCH', '#2a9a3a', () => crkAct('A')); S.P1 = f('NEW TEAM', '#5a6478', () => crkOpenTier()); } return S; }
  if (crkHumanBats()) {
    if (ph === 'live' && C.run && !C.boundary && !C.outPending) { S.P0 = f(C.run.going ? 'AGAIN!' : 'RUN', '#2a9a3a', () => crkAct('Y')); if (C.run.going) S.P1 = f('BACK', '#5a6478', () => crkAct('X')); return S; }
    if (ph === 'set' || ph === 'runup' || ph === 'flight') { S.P0 = f('DRIVE', '#c8321f', () => crkAct('A')); S.P1 = f('BLOCK', '#5a6478', () => crkAct('X')); S.P2 = f('LOFT', '#c8961f', () => crkAct('B')); }
    return S;
  }
  if (ph === 'set' && C.setT <= 0) { S.P0 = f('PACE', '#c8321f', () => crkAct('A')); S.P2 = f('SPIN', '#6a2aa8', () => crkAct('B')); }
  if (ph === 'runup' && C.meter && !C.meter.done) S.P0 = f('BOWL!', '#2a9a3a', () => crkAct('A'));
  return S;
}
function crkPadFrame() {
  const C = cricket;
  if (!C.mobile || !C.padEl) return;
  const spec = crkPadSpec();
  C.padSpec = spec;
  for (const k in C.padBtns) {
    const B = C.padBtns[k], it = spec[k], key = it ? it.label + it.col : '';
    if (key === B.key) continue;
    B.key = key; B.el.hidden = !it;
    if (it) { B.el.querySelector('.crkp-l').textContent = it.label; B.el.style.setProperty('--c', it.col); }
  }
  const st = C.padEl.querySelector('.crkp-stick'), kn = st.firstChild, L = C.touch.L;
  const showStick = !(C.phase === 'teams' || C.phase === 'toss' || C.phase === 'tier' || C.phase === 'final' || C.phase === 'break' || C.paused);
  st.hidden = !showStick;
  if (L) { st.classList.add('live'); st.style.left = L.x0 + 'px'; st.style.top = L.y0 + 'px'; st.style.bottom = 'auto'; kn.style.transform = 'translate(' + (L.dx * 54) + 'px,' + (L.dy * 54) + 'px)'; }
  else if (st.classList.contains('live')) { st.classList.remove('live'); st.style.left = ''; st.style.top = ''; st.style.bottom = ''; kn.style.transform = ''; }
  C.padEl.querySelector('.crkp-menu').hidden = C.phase === 'tier' || C.phase === 'idle';
}

// ---- test seam -------------------------------------------------------------------------------------------------
window.cricketDebug = {
  state: () => { const C = cricket; return { phase: C.phase, inn: C.inn, bat: C.bat, sc: C.sc && C.sc.map((s) => Object.assign({}, s)), target: C.target, result: C.result, earned: C.earned, stats: C.stats && Object.assign({}, C.stats) }; },
  pickTier: (i) => { const C = cricket; if (C.tierPick) { C.tierPick.close(); C.tierPick = null; } crkNewMatch(CRK_TIERS[i] || CRK_TIERS[0]); crkTeamPick(0); },
  toss: (batFirst) => { const C = cricket; C.firstBat = batFirst ? C.human : 1 - C.human; crkStartMatch(); },
  auto: (v) => { cricket.auto = v !== false; },
  step: (secs, hz) => {
    const C = cricket, dt = 1 / (hz || 60), n = Math.round(secs / dt);
    for (let i = 0; i < n; i++) {
      if (C.phase === 'final' || C.phase === 'tier') break;
      C.t += dt;
      cricketUpdate(dt);
    }
    return window.cricketDebug.state();
  },
  act: (b) => crkAct(b), shot: (type, dir) => crkPressShot(type, dir), set: (o) => Object.assign(cricket, o), draw: () => crkDraw(),
};
