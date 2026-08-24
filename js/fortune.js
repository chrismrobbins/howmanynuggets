// ---- 🎡 REEL OF FORTUNE --------------------------------------------------------------
// "THE HOUSE KNOWS THE WORDS."
//
// A friend named it and the name is the brief: WHEEL OF FORTUNE, nugget-sized.
// Game 16 (mode key: fortune) — spin the big wheel, pick a letter, solve the
// phrase. HOLD to wind the wheel up (the power meter sweeps — your release is
// the spin, no RNG anywhere), land a wedge, then guess: a letter that's IN the
// puzzle banks the wedge value per appearance (vowels pay half — this house
// has standards), a letter that isn't costs a turn token. 💀 BANKRUPT wipes
// the round bank. Solve the phrase and the bank pays out, plus a bonus for
// every token you didn't burn.
//
// And the lore, which is the part the detective can't let go of: one wedge
// carries a 🌀 SWIRL nobody at the house will explain, and the PUZZLES ARE
// ALL TRUE — case quotes, salvage-tag texts, rumors. Bank the swirl (land it,
// then guess right) and SOLVE that puzzle, and the machine pays THE STORM
// JACKPOT — and remembers that you saw it (localStorage nugFortuneJack, read
// via fortuneJackpotHit()). Canon-safe: a wheel only carries a shape somebody
// carved into it, and a puzzle only knows words somebody WROTE. Nothing
// moved. The case grew a game show. It stays open.
//
// Scoring mirrors the other games: everything is perFlyer-scaled into
// storm.caught; stopStorm() banks it. Free play, obviously.

const fortuneWorld = document.getElementById('fortuneWorld');

// The wheel. 16 wedges, fixed order — deterministic, and the harness can name
// its landing. 'BK' = bankrupt, 'SW' = the swirl (worth 50 when you convert it).
const FORTUNE_WEDGES = [25, 5, 50, 15, 'BK', 20, 75, 10, 'SW', 30, 10, 40, 'BK', 20, 100, 15];
const FORTUNE_SWIRL_VAL = 50;
const FORTUNE_SOLVE_BONUS = 100;     // × remaining tokens, on a solve
const FORTUNE_JACKPOT_PAY = 1500;    // swirl banked + puzzle solved

// The board. Every phrase is TRUE — pulled from the case file, the tags, the
// rumors and the menu. That's the joke, and it's also Exhibit 16.
const FORTUNE_PUZZLES = [
  ['THE CASE',   'THE STORM IS ALIVE IN THE HARBOR'],
  ['THE CASE',   'LEAVE IT A DOOR'],
  ['THE TOWN',   'NUGGETOWN AFTER DARK'],
  ['RUMORS',     'THE HOUSE ALWAYS WINS'],
  ['THE MENU',   'EXTRA SAUCE NO QUESTIONS'],
  ['THE TOWN',   'THE PIER AT MIDNIGHT'],
  ['THE CASE',   'DO NOT TOUCH THE TAPE'],
  ['THE ARCADE', 'INSERT ABSOLUTELY NO COINS'],
  ['THE CASE',   'THE CASE STAYS OPEN'],
  ['RUMORS',     'ONE MORE DIVE'],
  ['THE TOWN',   'THE REGULARS KNOW SOMETHING'],
  ['RUMORS',     'BATTER IS THICKER THAN WATER'],
  ['RUMORS',     'SOMETHING GOLDEN CIRCLES THE PIER'],
  ['THE ARCADE', 'TWO NUGGETS ENTER ONE LEAVES'],
  ['THE ARCADE', 'THE JUKEBOX KNOWS THE WORDS'],
  ['THE TOWN',   'ASK THE CHICKEN'],
  ['THE CASE',   'IT LIKES THE PIPES BETTER THAN THE BAY'],
  ['RUMORS',     'MIND THE CLOGS'],
  ['THE CASE',   'WHO POURS A FOUNDATION AROUND A DOOR'],
  ['THE MENU',   'CRISPY OUTSIDE TENDER INSIDE'],
  ['THE ARCADE', 'FREE PLAY FOREVER'],
  ['RUMORS',     'SIX FOR SIX SAYS THE HOOD'],
  ['THE CASE',   'DETECTIVE DILL NEVER SLEEPS'],
  ['THE MENU',   'GOLDEN ON THE OUTSIDE'],
];

const FORTUNE_TIERS = [
  { key: 'penny',  emoji: '🪙', name: 'PENNY ANTE', mult: 1, tokens: 4,
    blurb: 'a kind wheel and four turns. warm up.' },
  { key: 'roller', emoji: '📺', name: 'PRIME TIME', mult: 2, tokens: 3,
    blurb: 'the real show. the house watches.' },
  { key: 'rigged', emoji: '🌀', name: 'THE RIGGED WHEEL', mult: 3, tokens: 2,
    blurb: 'you know too much. so does the wheel.', lockNote: 'bank the swirl, solve the board' },
];

const FORTUNE_VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
const FORTUNE_AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const fortune = {
  on: false, cv: null, g: null, banner: null, tierPick: null,
  W: 380, Hh: 210, scale: 3,
  phase: 'idle',           // tier | idle | charging | spinning | guess | between
  cfg: FORTUNE_TIERS[0],
  angle: 0, vel: 0, power: 0, chargeT: 0,
  puzzleIdx: 0, category: '', phrase: '', revealed: new Set(), guessed: new Set(),
  bank: 0, tokens: 3, swirlBanked: false, wedge: null, wedgeIdx: -1,
  puzzles: 0, solves: 0, betweenT: 0, flashT: 0, flashMsg: '',
  t: 0, confetti: [], bannerT: 0,
  // FX stamps (absolute fortune.t at the moment it happened, -9 = long ago)
  flipCh: '', flipT0: -9, revealT0: -9, shakeT0: -9, jackT0: -9, solveT0: -9,
  // cached layers: the static SET and the wheel FACE (rotated at draw time)
  setCv: null, wheelCv: null, wheelR: 0,
  hit: { wheel: null, letters: null }, // canvas hit regions, rebuilt per draw
};

function fortuneActive() { return storm.mode === 'fortune' && storm.running; }

// Did the wheel ever pay THE STORM JACKPOT? Street NPCs react; tier 3 unlocks.
function fortuneJackpotHit() {
  try { return localStorage.getItem('nugFortuneJack') === '1'; } catch (e) { return false; }
}

function fortuneTally() {
  if (fortune.phase === 'tier') return '🎡 pick your show…';
  const bits = ['🎡 board ' + (fortune.puzzles + 1), 'bank ' + fmt.format(Math.round(fortune.bank * storm.perFlyer * fortune.cfg.mult))];
  bits.push('🎟️'.repeat(Math.max(0, fortune.tokens)) || '🎟️×0');
  if (fortune.swirlBanked) bits.push('🌀 BANKED');
  return bits.join(' · ');
}

function fortuneLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  fortune.scale = Math.max(2, Math.floor(vh / 230));
  fortune.W = Math.ceil(vw / fortune.scale);
  fortune.Hh = Math.ceil(vh / fortune.scale);
  if (fortune.cv) { fortune.cv.width = fortune.W; fortune.cv.height = fortune.Hh; }
  fortune.setCv = null;   // the cached set is a function of the frame size
  fortune.wheelCv = null; // and the wheel face of its radius
}

function syncFortune() {
  const active = fortuneActive();
  if (active === fortune.on) return;
  fortune.on = active;
  document.body.classList.toggle('fortune-mode', active);
  if (active) {
    if (!fortune.cv) {
      fortune.cv = document.createElement('canvas');
      fortune.g = fortune.cv.getContext('2d');
      fortuneWorld.appendChild(fortune.cv);
      fortune.banner = document.createElement('div');
      fortune.banner.className = 'fortune-banner';
      fortuneWorld.appendChild(fortune.banner);
      fortune.cv.addEventListener('pointerdown', fortunePointerDown);
      fortune.cv.addEventListener('pointerup', fortunePointerUp);
    }
    // the amount input autofocuses on load and eats keys — let go of it
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    fortune.t = 0; fortune.puzzles = 0; fortune.solves = 0;
    fortune.confetti.length = 0;
    fortuneLayout();
    openFortuneTier();
  } else {
    if (fortune.tierPick) { fortune.tierPick.close(); fortune.tierPick = null; }
    fortune.banner && fortune.banner.classList.remove('show');
  }
}

function openFortuneTier() {
  fortune.phase = 'tier';
  const tiers = FORTUNE_TIERS.map((t) =>
    t.key === 'rigged' && !fortuneJackpotHit() ? { ...t, locked: true } : t);
  fortune.tierPick = ArcadeKit.tierSelect({
    storeKey: 'fortune',
    title: '🎡 Pick your show',
    note: fortuneJackpotHit() ? 'the wheel remembers you · 1 · 2 · 3'
      : 'HOLD to spin · pick a letter · solve the phrase · mind the 💀',
    tiers,
    onPick: (key, t) => { fortune.tierPick = null; fortune.cfg = t; fortuneNewBoard(true); },
  });
}

function fortuneNewBoard(freshRun) {
  // Sequential through the deck from a persisted cursor, so back-to-back
  // sessions don't open on the same phrase — deterministic, never shuffled.
  let start = 0;
  try { start = parseInt(localStorage.getItem('nugFortunePz') || '0', 10) || 0; } catch (e) { }
  const idx = (start + (freshRun ? 0 : 1)) % FORTUNE_PUZZLES.length;
  try { localStorage.setItem('nugFortunePz', String(idx)); } catch (e) { }
  fortuneSetPuzzle(idx);
  if (!freshRun) fortune.puzzles++;
}

function fortuneSetPuzzle(i) {
  const [cat, phrase] = FORTUNE_PUZZLES[((i % FORTUNE_PUZZLES.length) + FORTUNE_PUZZLES.length) % FORTUNE_PUZZLES.length];
  fortune.puzzleIdx = i;
  fortune.category = cat;
  fortune.phrase = phrase;
  fortune.revealed = new Set();
  fortune.guessed = new Set();
  fortune.bank = 0;
  fortune.tokens = fortune.cfg.tokens;
  fortune.swirlBanked = false;
  fortune.wedge = null;
  fortune.wedgeIdx = -1;
  fortune.flipCh = ''; fortune.flipT0 = -9; fortune.revealT0 = -9; fortune.solveT0 = -9;
  fortune.phase = 'idle';
}

// ---- the wheel ------------------------------------------------------------------------

function fortuneStartCharge() {
  if (fortune.phase !== 'idle') return;
  fortune.phase = 'charging';
  fortune.chargeT = 0;
}

function fortuneRelease() {
  if (fortune.phase !== 'charging') return;
  // the meter ping-pongs; your release IS the spin — deterministic, aimable
  const k = fortune.power;
  fortune.vel = 5.5 + k * 13.5;      // rad/s
  fortune.phase = 'spinning';
}

function fortuneWedgeAt(angle) {
  const n = FORTUNE_WEDGES.length;
  // pointer at 12 o'clock; wheel angle rotates the wedges under it
  const a = ((-angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor((a / (Math.PI * 2)) * n) % n;
}

function fortuneLanded(idx) {
  const w = FORTUNE_WEDGES[idx];
  fortune.wedge = w;
  fortune.wedgeIdx = idx;
  if (w === 'BK') {
    fortune.bank = 0;
    fortune.swirlBanked = false;
    fortune.phase = 'idle';
    fortune.shakeT0 = fortune.t;
    fortuneBanner('💀 BANKRUPT', 'the house reclaims the bank — the board stays');
    return;
  }
  fortune.phase = 'guess';
  if (w === 'SW') fortuneFlash('🌀 THE SWIRL — name a letter to bank it');
  else fortuneFlash('pick a letter · ' + w + ' a piece' + (FORTUNE_VOWELS.size ? ' · vowels half' : ''));
}

// ---- guessing -------------------------------------------------------------------------

function fortuneGuess(chRaw) {
  if (fortune.phase !== 'guess') return;
  const ch = String(chRaw || '').toUpperCase();
  if (!/^[A-Z]$/.test(ch) || fortune.guessed.has(ch)) return;
  fortune.guessed.add(ch);

  const count = fortune.phrase.split('').filter((c) => c === ch).length;
  const w = fortune.wedge;
  const val = w === 'SW' ? FORTUNE_SWIRL_VAL : w;

  if (count > 0) {
    fortune.revealed.add(ch);
    fortune.flipCh = ch; fortune.flipT0 = fortune.t; // the tiles FLIP, staggered
    const per = FORTUNE_VOWELS.has(ch) ? Math.ceil(val / 2) : val;
    fortune.bank += per * count;
    if (w === 'SW') {
      fortune.swirlBanked = true;
      fortuneBanner('🌀 SWIRL BANKED', 'solve this board and the storm pays out');
    } else {
      fortuneFlash(ch + ' ×' + count + ' · +' + (per * count) + ' banked');
    }
    // solved?
    const letters = new Set(fortune.phrase.replace(/[^A-Z]/g, '').split(''));
    const done = [...letters].every((c) => fortune.revealed.has(c));
    if (done) { fortuneSolve(); return; }
    fortune.phase = 'idle';
  } else {
    fortune.tokens--;
    if (fortune.tokens <= 0) {
      // the house keeps the board: reveal it, pay nothing, deal the next
      fortune.revealed = new Set(FORTUNE_AZ.split(''));
      fortune.bank = 0;
      fortune.swirlBanked = false;
      fortune.phase = 'between';
      fortune.betweenT = 2.6;
      fortune.revealT0 = fortune.t;
      fortune.shakeT0 = fortune.t;
      fortuneBanner('🎟️ OUT OF TURNS', 'the house keeps the board — read it and weep');
    } else {
      fortune.phase = 'idle';
      fortuneFlash('no ' + ch + ' · 🎟️ ' + fortune.tokens + ' left');
    }
  }
}

function fortuneSolve() {
  const bonus = FORTUNE_SOLVE_BONUS * Math.max(0, fortune.tokens);
  let pay = (fortune.bank + bonus) * fortune.cfg.mult;
  let jack = false;
  if (fortune.swirlBanked) {
    pay += FORTUNE_JACKPOT_PAY * fortune.cfg.mult;
    jack = true;
    try { localStorage.setItem('nugFortuneJack', '1'); } catch (e) { /* no storage */ }
  }
  const worth = Math.max(1, Math.round(storm.perFlyer * pay));
  storm.caught += worth;
  fortune.solves++;
  fortune.phase = 'between';
  fortune.betweenT = jack ? 3.4 : 2.4;
  fortune.solveT0 = fortune.t;
  if (jack) {
    fortune.jackT0 = fortune.t;
    fortuneBanner('🌀 THE STORM JACKPOT', 'the wheel knew. the puzzle knew. tell the detective. or don’t.', 'jack');
    fortuneConfetti(140);
  } else {
    fortuneBanner('✅ SOLVED', '+' + fmt.format(worth) + ' nuggets' + (fortune.tokens > 0 ? ' · ' + fortune.tokens + ' 🎟️ bonus' : ''));
    fortuneConfetti(60);
  }
}

function fortuneBanner(top, sub, kind) {
  if (!fortune.banner) return;
  fortune.banner.innerHTML = '<b>' + top + '</b><span>' + sub + '</span>';
  fortune.banner.classList.toggle('jack', kind === 'jack');
  fortune.banner.classList.add('show');
  fortune.bannerT = 2.4;
  fortune.flashT = 0; // the sign supersedes the toast — they'd overlap
}

function fortuneFlash(msg) {
  fortune.flashMsg = msg;
  fortune.flashT = 2.2;
}

function fortuneConfetti(n) {
  // two cannons in the top corners plus a rain over the board — not one
  // clump. Rotation + flutter is what makes paper read as paper at 2×3px.
  for (let i = 0; i < n; i++) {
    const cannon = i % 3; // 0 = left corner, 1 = right corner, 2 = board rain
    const x = cannon === 0 ? 6 : cannon === 1 ? fortune.W - 6 : fortune.W * (0.25 + Math.random() * 0.5);
    const y = cannon === 2 ? -4 : 10;
    const dir = cannon === 0 ? 1 : cannon === 1 ? -1 : 0;
    fortune.confetti.push({
      x, y,
      vx: dir ? dir * (40 + Math.random() * 95) : (Math.random() - 0.5) * 40,
      vy: cannon === 2 ? 15 + Math.random() * 30 : -10 - Math.random() * 60,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 9,
      flut: 1.5 + Math.random() * 3, ph: Math.random() * 6.28,
      big: i % 5 === 0,
      life: 1.8 + Math.random() * 1.3,
      c: ['#ffd23a', '#26e0ff', '#ff2fa0', '#39ff7a', '#f2ecdc'][i % 5],
    });
  }
}

// ---- the frame ------------------------------------------------------------------------

function stepFortune(dt, w, h) {
  syncFortune();
  if (!fortune.on) return;
  if (fortune.cv.width !== Math.ceil(w / fortune.scale)) fortuneLayout();
  // harness freeze: state holds still, the draw still runs (fortuneDebug.freeze)
  if (fortune.freeze) { fortuneDraw(); return; }
  fortune.t += dt;
  if (fortune.bannerT > 0) {
    fortune.bannerT -= dt;
    if (fortune.bannerT <= 0) fortune.banner.classList.remove('show');
  }
  if (fortune.flashT > 0) fortune.flashT -= dt;

  if (fortune.phase === 'charging') {
    fortune.chargeT += dt;
    const c = (fortune.chargeT / 1.1) % 2;          // 1.1s up, 1.1s down
    fortune.power = c < 1 ? c : 2 - c;
  } else if (fortune.phase === 'spinning') {
    fortune.angle += fortune.vel * dt;
    fortune.vel -= (0.55 + fortune.vel * 0.85) * dt; // friction + drag
    if (fortune.vel <= 0.12) {
      fortune.vel = 0;
      fortuneLanded(fortuneWedgeAt(fortune.angle));
    }
  } else if (fortune.phase === 'between') {
    fortune.betweenT -= dt;
    if (fortune.betweenT <= 0) fortuneNewBoard(false);
  }

  for (let i = fortune.confetti.length - 1; i >= 0; i--) {
    const p = fortune.confetti[i];
    p.life -= dt;
    if (p.life <= 0) { fortune.confetti.splice(i, 1); continue; }
    p.x += (p.vx + Math.sin(fortune.t * p.flut + p.ph) * 16) * dt;
    p.y += p.vy * dt;
    p.vy = Math.min(p.vy + 95 * dt, 75); // paper has a terminal velocity
    p.vx *= 1 - 1.4 * dt;
    p.rot += p.vr * dt;
  }

  fortuneDraw();
}

// ---- drawing --------------------------------------------------------------------------
// The studio. Three cached layers do the heavy lifting: the SET (backdrop,
// curtains, stage floor — rebuilt on resize), the WHEEL FACE (wedges, labels,
// hub — rendered once at 3× and rotated with one drawImage), and everything
// that moves drawn live on top. All lighting is paint: this canvas has no
// shader and doesn't need one at 427×240.

function fortuneShade(hex, k) {
  // k > 0 lightens toward white, k < 0 darkens toward black
  const v = parseInt(hex.slice(1), 16);
  let r = (v >> 16) & 255, gg = (v >> 8) & 255, b = v & 255;
  if (k >= 0) { r += (255 - r) * k; gg += (255 - gg) * k; b += (255 - b) * k; }
  else { r *= 1 + k; gg *= 1 + k; b *= 1 + k; }
  return 'rgb(' + (r | 0) + ',' + (gg | 0) + ',' + (b | 0) + ')';
}

function fortuneRounded(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fortuneHash(n) { // deterministic [0,1) from an integer — set dressing only
  let x = Math.imul(n ^ 61, 0x27d4eb2d);
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12;
  return (x >>> 0) / 4294967296;
}

// One colour per wedge, jewel tones, no two neighbours alike. Specials override.
const FORTUNE_WEDGE_COLORS = [
  '#b03a48', '#3d5ba9', '#2e9e63', '#8a4bb4', '#17121c', '#c9662c', '#27919d', '#c23b7d',
  '#0b3a47', '#6a51c9', '#3c7e4d', '#a83a9b', '#17121c', '#9e4632', '#caa62e', '#456fb0',
];

// ---- the SET: backdrop, curtains, valance, stage floor. Static per frame size.
function fortuneSet() {
  if (fortune.setCv && fortune.setCv.width === fortune.W && fortune.setCv.height === fortune.Hh) return fortune.setCv;
  const W = fortune.W, Hh = fortune.Hh;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d');

  // backdrop — deep studio blue, darker at the edges
  const bg = g.createLinearGradient(0, 0, 0, Hh);
  bg.addColorStop(0, '#221b40'); bg.addColorStop(0.55, '#171230'); bg.addColorStop(1, '#0d0a1e');
  g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  const glow = g.createRadialGradient(W * 0.38, Hh * 0.45, 8, W * 0.38, Hh * 0.45, Hh * 0.9);
  glow.addColorStop(0, 'rgba(90,70,160,0.30)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, Hh);

  // pin spots — two beams from the top corners onto the stage
  g.globalCompositeOperation = 'lighter';
  for (const [sx, tx] of [[W * 0.06, W * 0.30], [W * 0.94, W * 0.62]]) {
    const beam = g.createLinearGradient(sx, 0, tx, Hh);
    beam.addColorStop(0, 'rgba(255,225,160,0.10)'); beam.addColorStop(1, 'rgba(255,225,160,0)');
    g.fillStyle = beam;
    g.beginPath(); g.moveTo(sx - 3, 0); g.lineTo(sx + 3, 0);
    g.lineTo(tx + W * 0.09, Hh); g.lineTo(tx - W * 0.09, Hh); g.closePath(); g.fill();
  }
  g.globalCompositeOperation = 'source-over';

  // stage floor — glossy boards catching the set glow
  const fy = Math.round(Hh * 0.60);
  const fl = g.createLinearGradient(0, fy, 0, Hh);
  fl.addColorStop(0, '#2a2148'); fl.addColorStop(0.12, '#1c1636'); fl.addColorStop(1, '#0a0818');
  g.fillStyle = fl; g.fillRect(0, fy, W, Hh - fy);
  g.fillStyle = 'rgba(255,235,190,0.10)'; g.fillRect(0, fy, W, 1); // footlight kiss on the edge
  for (let i = 0; i < 9; i++) { // plank seams, converging a little
    const yy = fy + 3 + i * ((Hh - fy) / 8);
    g.fillStyle = 'rgba(0,0,0,' + (0.10 + i * 0.015) + ')';
    g.fillRect(0, yy, W, 1);
  }

  // curtains — maroon drapes framing the stage, folds as vertical shading
  const cw = Math.max(10, Math.round(W * 0.032));
  for (const side of [0, 1]) {
    for (let x = 0; x < cw; x++) {
      const k = Math.sin((x / cw) * Math.PI * 3.2 + side * 1.7);
      g.fillStyle = fortuneShade('#5e1f2e', -0.35 + 0.30 * k);
      g.fillRect(side ? W - 1 - x : x, 0, 1, Hh);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(side ? W - cw - 2 : cw, 0, 2, Hh); // shadow the drape throws on the set
  }
  // valance strip across the top, scalloped
  g.fillStyle = '#4a1826'; g.fillRect(0, 0, W, 5);
  g.fillStyle = '#5e1f2e';
  for (let x = 0; x < W; x += 9) { g.beginPath(); g.arc(x + 4.5, 5, 4.5, 0, Math.PI); g.fill(); }
  g.fillStyle = 'rgba(216,178,58,0.5)'; g.fillRect(0, 5, W, 1); // gold trim

  fortune.setCv = cv;
  return cv;
}

// ---- the WHEEL FACE: everything that rotates, rendered once at 3× per radius.
function fortuneWheelFace(r) {
  const R = Math.round(r);
  if (fortune.wheelCv && fortune.wheelR === R) return fortune.wheelCv;
  const SS = 3, C = (R + 2) * SS; // centre; small margin for the peg heads
  const cv = document.createElement('canvas');
  cv.width = cv.height = C * 2;
  const g = cv.getContext('2d');
  g.translate(C, C);
  const n = FORTUNE_WEDGES.length, RW = R * SS;

  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const wv = FORTUNE_WEDGES[i];
    const base = FORTUNE_WEDGE_COLORS[i];
    const grad = g.createRadialGradient(0, 0, RW * 0.14, 0, 0, RW);
    grad.addColorStop(0, fortuneShade(base, 0.22));
    grad.addColorStop(0.72, base);
    grad.addColorStop(1, fortuneShade(base, -0.28));
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, RW, a0, a1); g.closePath();
    g.fillStyle = grad; g.fill();
    g.strokeStyle = 'rgba(10,8,20,0.9)'; g.lineWidth = SS; g.stroke();

    const am = (a0 + a1) / 2;
    if (wv === 'BK') {
      // the house's wedge: dark, with a hand-drawn skull (emoji at 10px is mush)
      g.save(); g.translate(Math.cos(am) * RW * 0.68, Math.sin(am) * RW * 0.68); g.rotate(am + Math.PI / 2);
      const s = RW * 0.11;
      g.fillStyle = '#d8d2e0';
      g.beginPath(); g.arc(0, -s * 0.15, s * 0.62, Math.PI * 0.95, Math.PI * 2.05); g.fill();
      g.fillRect(-s * 0.62, -s * 0.15, s * 1.24, s * 0.42);
      g.fillRect(-s * 0.4, s * 0.27, s * 0.8, s * 0.3); // jaw
      g.fillStyle = '#17121c';
      g.beginPath(); g.arc(-s * 0.26, -s * 0.12, s * 0.17, 0, 7); g.fill();
      g.beginPath(); g.arc(s * 0.26, -s * 0.12, s * 0.17, 0, 7); g.fill();
      g.fillRect(-s * 0.05, s * 0.05, s * 0.12, s * 0.16); // nose
      g.fillRect(-s * 0.28, s * 0.3, s * 0.09, s * 0.24); g.fillRect(-s * 0.03, s * 0.3, s * 0.09, s * 0.24);
      g.fillRect(s * 0.2, s * 0.3, s * 0.09, s * 0.24); // teeth gaps
      g.restore();
    } else if (wv === 'SW') {
      // THE SWIRL — glowing, two-pass
      g.save(); g.translate(Math.cos(am) * RW * 0.62, Math.sin(am) * RW * 0.62); g.rotate(am + Math.PI / 2);
      for (const [wdt, col] of [[SS * 3, 'rgba(38,224,255,0.28)'], [SS * 1.4, '#63ecff']]) {
        g.strokeStyle = col; g.lineWidth = wdt; g.lineCap = 'round';
        g.beginPath();
        for (let a = 0; a < 4.4; a += 0.22) {
          const rr = (0.9 + a * 2.4) * SS;
          const x = Math.cos(a * 1.8) * rr, y = Math.sin(a * 1.8) * rr;
          a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
      }
      g.restore();
    } else {
      if (wv === 100) { // the gold wedge gets rays from the hub
        g.save();
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, RW, a0, a1); g.closePath(); g.clip();
        g.strokeStyle = 'rgba(255,240,190,0.35)'; g.lineWidth = SS * 0.8;
        for (let k = 0; k < 4; k++) {
          const ra = a0 + ((k + 0.5) / 4) * (a1 - a0);
          g.beginPath(); g.moveTo(Math.cos(ra) * RW * 0.2, Math.sin(ra) * RW * 0.2);
          g.lineTo(Math.cos(ra) * RW * 0.96, Math.sin(ra) * RW * 0.96); g.stroke();
        }
        g.restore();
      }
      // the value, stacked along the radius like the real show
      const chars = String(wv).split('');
      const fpx = Math.max(8, Math.round(R * 0.155)) * SS;
      g.font = 'bold ' + fpx + 'px monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      chars.forEach((c, k) => {
        const rr = RW * 0.88 - k * (fpx * 0.92);
        g.save(); g.translate(Math.cos(am) * rr, Math.sin(am) * rr); g.rotate(am + Math.PI / 2);
        g.lineWidth = SS * 1.6; g.strokeStyle = 'rgba(10,8,20,0.85)'; g.strokeText(c, 0, 0);
        g.fillStyle = '#f6f1e2'; g.fillText(c, 0, 0);
        g.restore();
      });
    }
    // peg at the leading boundary, brass with a lit crown
    g.save(); g.translate(Math.cos(a0) * (RW - SS * 1.2), Math.sin(a0) * (RW - SS * 1.2));
    g.fillStyle = '#7a5c1e'; g.beginPath(); g.arc(0, 0, SS * 1.5, 0, 7); g.fill();
    g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(-SS * 0.4, -SS * 0.4, SS * 0.7, 0, 7); g.fill();
    g.restore();
  }

  // hub — brass boss with bolts
  const hubR = RW * 0.17;
  const hub = g.createRadialGradient(-hubR * 0.35, -hubR * 0.35, hubR * 0.1, 0, 0, hubR);
  hub.addColorStop(0, '#ffe9a0'); hub.addColorStop(0.5, '#d8b23a'); hub.addColorStop(1, '#7a5c14');
  g.fillStyle = hub; g.beginPath(); g.arc(0, 0, hubR, 0, 7); g.fill();
  g.strokeStyle = '#4a3a10'; g.lineWidth = SS; g.stroke();
  g.fillStyle = '#5c4610';
  for (let k = 0; k < 6; k++) {
    const ba = (k / 6) * Math.PI * 2;
    g.beginPath(); g.arc(Math.cos(ba) * hubR * 0.62, Math.sin(ba) * hubR * 0.62, SS * 0.9, 0, 7); g.fill();
  }
  g.fillStyle = '#2c2452'; g.beginPath(); g.arc(0, 0, hubR * 0.28, 0, 7); g.fill();

  fortune.wheelCv = cv;
  fortune.wheelR = R;
  return cv;
}

function fortuneDraw() {
  const g = fortune.g, W = fortune.W, Hh = fortune.Hh, t = fortune.t;
  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

  // BANKRUPT shakes the whole studio
  const shakeEl = t - fortune.shakeT0;
  const shaking = shakeEl >= 0 && shakeEl < 0.45;
  g.save();
  if (shaking) {
    const k = 1 - shakeEl / 0.45;
    g.translate((fortuneHash((t * 60) | 0) * 2 - 1) * 3 * k, (fortuneHash((t * 60) | 0 ^ 999) * 2 - 1) * 2 * k);
  }

  g.drawImage(fortuneSet(), 0, 0);

  // twinkles in the dark above the set — cheap, deterministic
  for (let i = 0; i < 12; i++) {
    const a = 0.10 + 0.16 * (0.5 + 0.5 * Math.sin(t * 1.7 + i * 2.3));
    g.fillStyle = 'rgba(230,225,255,' + a.toFixed(3) + ')';
    g.fillRect((fortuneHash(i) * W) | 0, (5 + fortuneHash(i + 57) * Hh * 0.10) | 0, 1, 1);
  }

  // ---- the puzzle board: a real trilon, filler tiles and all
  const words = fortune.phrase.split(' ');
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const test = cur ? cur + ' ' + wd : wd;
    if (test.length > 14 && cur) { lines.push(cur); cur = wd; } else cur = test;
  }
  if (cur) lines.push(cur);
  const cols = 14;
  const tw = Math.min(16, Math.floor((W - 44) / (cols + 1))), th = tw + 4;
  const gridW = cols * (tw + 1) - 1;
  // frY 26: the storm pill (MODE_COMPACT_HUD, DOM) owns the top ~24 world px
  const frX = Math.round(W / 2 - gridW / 2) - 5, frY = 26;
  const frW = gridW + 10, frH = lines.length * (th + 2) + 8;
  // frame: brass on green, the show's own colours
  fortuneRounded(g, frX - 2, frY - 2, frW + 4, frH + 4, 4);
  g.fillStyle = '#d8b23a'; g.fill();
  fortuneRounded(g, frX, frY, frW, frH, 3);
  const frBg = g.createLinearGradient(0, frY, 0, frY + frH);
  frBg.addColorStop(0, '#134233'); frBg.addColorStop(1, '#0b2a20');
  g.fillStyle = frBg; g.fill();
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(frX - 2, frY + frH + 2, frW + 4, 2); // drop shadow

  g.textAlign = 'center'; g.textBaseline = 'middle';
  const flipEl = t - fortune.flipT0, revEl = t - fortune.revealT0;
  lines.forEach((line, li) => {
    const y = frY + 5 + li * (th + 2);
    const pad = Math.floor((cols - line.length) / 2);
    for (let gi = 0; gi < cols; gi++) {
      const x = frX + 5 + gi * (tw + 1);
      const ci = gi - pad;
      const c = ci >= 0 && ci < line.length ? line[ci] : ' ';
      if (c === ' ') { // filler tile — the board's green
        g.fillStyle = '#175243'; g.fillRect(x, y, tw, th);
        g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x, y, tw, 1);
        g.strokeStyle = '#0b2a20'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
        continue;
      }
      const shown = fortune.revealed.has(c);
      // flip: this guess's letters, staggered left to right — or the whole
      // board at once when the house takes it
      let ph = 1;
      if (c === fortune.flipCh && flipEl >= 0) ph = clamp01((flipEl - ci * 0.06) / 0.32);
      else if (revEl >= 0 && revEl < 2 && shown) ph = clamp01((revEl - (li * 4 + ci) * 0.035) / 0.32);
      const sx = shown && ph < 1 ? Math.abs(Math.cos(ph * Math.PI)) : 1;
      const showFace = !shown || ph >= 0.5;
      const cxT = x + tw / 2;
      const wNow = Math.max(1, tw * (shown ? sx : 1));
      // white tile with a gloss; letters are navy, the show's way
      const tile = g.createLinearGradient(0, y, 0, y + th);
      tile.addColorStop(0, '#fbf7ea'); tile.addColorStop(0.55, '#ece5d2'); tile.addColorStop(1, '#cfc6ae');
      g.fillStyle = tile;
      g.fillRect(cxT - wNow / 2, y, wNow, th);
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(cxT - wNow / 2, y, wNow, 1);
      g.strokeStyle = '#9a9078'; g.lineWidth = 1;
      g.strokeRect(cxT - wNow / 2 + 0.5, y + 0.5, wNow - 1, th - 1);
      if (shown && showFace && ph > 0) {
        g.fillStyle = '#1a2340';
        g.font = 'bold ' + (tw - 3) + 'px monospace';
        if (sx > 0.3) g.fillText(c, cxT, y + th / 2 + 1);
      }
      if (shown && ph < 1) { // the flash of the flip
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = 'rgba(120,220,255,' + (0.5 * (1 - ph)).toFixed(3) + ')';
        g.fillRect(cxT - wNow / 2, y, wNow, th);
        g.globalCompositeOperation = 'source-over';
      }
    }
  });
  // solve shimmer — a sheen sweeping the tiles while the payout banner runs
  const solveEl = t - fortune.solveT0;
  if (solveEl >= 0 && solveEl < 3.4) {
    const sxp = frX + ((solveEl * 0.8) % 1.3 - 0.15) * frW;
    g.save();
    fortuneRounded(g, frX, frY, frW, frH, 3); g.clip();
    g.globalCompositeOperation = 'lighter';
    const sh = g.createLinearGradient(sxp - 22, 0, sxp + 22, 0);
    sh.addColorStop(0, 'rgba(255,240,190,0)'); sh.addColorStop(0.5, 'rgba(255,240,190,0.30)'); sh.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = sh; g.fillRect(frX, frY, frW, frH);
    g.restore();
  }
  const boardBot = frY + frH + 6;

  // category lozenge
  g.font = 'bold 8px monospace';
  const catW = g.measureText(fortune.category).width + 18;
  fortuneRounded(g, W / 2 - catW / 2, boardBot - 1, catW, 11, 5);
  g.fillStyle = '#101a30'; g.fill();
  g.strokeStyle = '#d8b23a'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#ffd23a';
  g.fillText(fortune.category, W / 2, boardBot + 5);
  g.fillStyle = '#d8b23a';
  g.beginPath(); g.moveTo(W / 2 - catW / 2 - 6, boardBot + 4.5); g.lineTo(W / 2 - catW / 2 - 1, boardBot + 1.5); g.lineTo(W / 2 - catW / 2 - 1, boardBot + 7.5); g.fill();
  g.beginPath(); g.moveTo(W / 2 + catW / 2 + 6, boardBot + 4.5); g.lineTo(W / 2 + catW / 2 + 1, boardBot + 1.5); g.lineTo(W / 2 + catW / 2 + 1, boardBot + 7.5); g.fill();

  // ---- THE WHEEL, left of stage
  const wheelTop = boardBot + 14;
  const r = Math.min(W * 0.22, (Hh - wheelTop - 12) / 2); // the ticker overdraws the last 2px of tire
  const cx = Math.max(r + 18, W * 0.25), cy = wheelTop + r;
  fortune.hit.wheel = { cx, cy, r };
  const n = FORTUNE_WEDGES.length;
  const spinning = fortune.phase === 'spinning';
  const charging = fortune.phase === 'charging';
  // the wheel winds back a touch while you charge — anticipation is free
  const drawAngle = fortune.angle - (charging ? fortune.power * 0.12 : 0);

  // shadow on the boards
  const sh = g.createRadialGradient(cx, cy + r * 0.94, 1, cx, cy + r * 0.94, r * 0.95);
  sh.addColorStop(0, 'rgba(0,0,0,0.42)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.translate(0, cy + r * 0.94); g.scale(1, 0.18); g.translate(0, -(cy + r * 0.94));
  g.fillStyle = sh; g.fillRect(cx - r, cy + r * 0.94 - r, r * 2, r * 2);
  g.restore();
  // light pool the spot throws around it
  g.globalCompositeOperation = 'lighter';
  const pool = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.5);
  pool.addColorStop(0, 'rgba(255,230,170,0.05)'); pool.addColorStop(1, 'rgba(255,230,170,0)');
  g.fillStyle = pool; g.fillRect(cx - r * 1.5, cy - r * 1.5, r * 3, r * 3);
  g.globalCompositeOperation = 'source-over';

  // outer tire + brass ring, static (the lights live here, not on the face)
  g.fillStyle = '#221b32'; g.beginPath(); g.arc(cx, cy, r + 6, 0, 7); g.fill();
  const brass = g.createLinearGradient(cx, cy - r - 4, cx, cy + r + 4);
  brass.addColorStop(0, '#e8c86a'); brass.addColorStop(0.5, '#a8842c'); brass.addColorStop(1, '#5c4610');
  g.strokeStyle = brass; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r + 1.5, 0, 7); g.stroke();

  // the face — one rotated blit of the 3× cache
  const face = fortuneWheelFace(r);
  g.save(); g.translate(cx, cy); g.rotate(drawAngle);
  if (spinning && fortune.vel > 2.5) { // motion ghosts behind a fast wheel
    g.globalAlpha = 0.18; g.rotate(-fortune.vel * 0.022);
    g.drawImage(face, -r - 2, -r - 2, (r + 2) * 2, (r + 2) * 2);
    g.globalAlpha = 0.10; g.rotate(-fortune.vel * 0.022);
    g.drawImage(face, -r - 2, -r - 2, (r + 2) * 2, (r + 2) * 2);
    g.globalAlpha = 1; g.rotate(fortune.vel * 0.044);
  }
  g.drawImage(face, -r - 2, -r - 2, (r + 2) * 2, (r + 2) * 2);
  g.restore();

  // landed-wedge spotlight while a guess is live
  if (fortune.phase === 'guess' && fortune.wedgeIdx >= 0) {
    const a0 = drawAngle + (fortune.wedgeIdx / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = drawAngle + ((fortune.wedgeIdx + 1) / n) * Math.PI * 2 - Math.PI / 2;
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,235,160,' + (0.45 + 0.3 * Math.sin(t * 6)).toFixed(3) + ')';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r - 1, a0, a1); g.closePath(); g.stroke();
    g.globalCompositeOperation = 'source-over';
  }

  // studio glass glare, upper left — the light that says "object", not "diagram"
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = r * 0.16;
  g.beginPath(); g.arc(cx, cy, r * 0.82, Math.PI * 1.05, Math.PI * 1.55); g.stroke();
  g.globalCompositeOperation = 'source-over';

  // rim bulbs: a slow chase at rest, a power gauge while charging, all-on in flight
  const litCount = charging ? Math.round(fortune.power * 16) : 0;
  for (let i = 0; i < 16; i++) {
    const ba = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const bx = cx + Math.cos(ba) * (r + 4), by = cy + Math.sin(ba) * (r + 4);
    let lit;
    if (charging) lit = i < litCount;
    else if (spinning) lit = true;
    else lit = ((i + ((t * 7) | 0)) % 8) < 2;
    g.fillStyle = lit ? (charging && fortune.power > 0.8 ? '#8dffb1' : '#ffe9a0') : '#3a3152';
    g.beginPath(); g.arc(bx, by, lit ? 1.7 : 1.2, 0, 7); g.fill();
    if (lit) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,230,160,0.25)';
      g.beginPath(); g.arc(bx, by, 3.2, 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
  }
  // charge gauge arc, unmissable, riding the rim
  if (charging) {
    g.strokeStyle = fortune.power > 0.8 ? '#39ff7a' : '#ffd23a';
    g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, r + 4, -Math.PI / 2, -Math.PI / 2 + fortune.power * Math.PI * 2); g.stroke();
    g.lineCap = 'butt';
  }

  // the flapper — kicks off each peg as it passes, settles when the wheel does
  const pegPh = ((-drawAngle * n / (Math.PI * 2)) % 1 + 1) % 1;
  const kick = spinning ? (1 - pegPh) * (1 - pegPh) * 0.55 * Math.min(1, fortune.vel * 0.5) : 0;
  g.save();
  g.translate(cx, cy - r - 7); g.rotate(kick);
  g.fillStyle = '#7a1230'; g.beginPath();
  g.moveTo(-4.5, -3); g.lineTo(4.5, -3); g.lineTo(0.5, 9); g.lineTo(-0.5, 9); g.closePath(); g.fill();
  g.fillStyle = spinning ? '#ffe9a0' : '#ff2fa0'; g.beginPath();
  g.moveTo(-3.5, -3); g.lineTo(3.5, -3); g.lineTo(0, 8); g.closePath(); g.fill();
  g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(0, -3, 2, 0, 7); g.fill();
  g.fillStyle = '#7a5c14'; g.beginPath(); g.arc(0, -3, 0.9, 0, 7); g.fill();
  g.restore();

  // ---- the podium: bank, turns, swirl — a console, not a printout
  const rx = cx + r + 14, rw = W - rx - Math.max(12, Math.round(W * 0.032)) - 4;
  const py = boardBot + 16;
  fortuneRounded(g, rx - 4, py - 8, rw + 8, 46, 4);
  g.fillStyle = 'rgba(10,8,22,0.72)'; g.fill();
  g.strokeStyle = '#3a3158'; g.lineWidth = 1; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(rx - 3, py - 7, rw + 6, 1);

  g.textAlign = 'left';
  g.font = 'bold 8px monospace';
  g.fillStyle = '#c8a24a';
  g.fillText('BANK', rx + 2, py + 1);
  const bankStr = fmt.format(Math.round(fortune.bank * storm.perFlyer * fortune.cfg.mult));
  g.font = 'bold 12px monospace';
  g.fillStyle = '#4a2c08'; g.fillText(bankStr, rx + 35, py + 2);
  g.fillStyle = '#ffd23a'; g.fillText(bankStr, rx + 34, py + 1);

  g.font = 'bold 8px monospace';
  g.fillStyle = '#8f96c2';
  g.fillText('TURNS', rx + 2, py + 15);
  for (let i = 0; i < fortune.cfg.tokens; i++) { // tickets, drawn — spent stubs stay visible
    const txx = rx + 35 + i * 16, tyy = py + 10;
    const on = i < fortune.tokens;
    g.fillStyle = on ? '#e8a33c' : '#241c3a';
    fortuneRounded(g, txx, tyy, 13, 9, 1.5); g.fill();
    if (on) {
      g.fillStyle = '#b97a20'; g.fillRect(txx + 9, tyy, 1, 9);
      g.fillStyle = '#4a2c08'; g.font = 'bold 8px monospace'; g.fillText('N', txx + 2, tyy + 5);
      g.fillStyle = '#1c1631';
      g.beginPath(); g.arc(txx, tyy + 4.5, 2, -Math.PI / 2, Math.PI / 2); g.fill();
      g.beginPath(); g.arc(txx + 13, tyy + 4.5, 2, Math.PI / 2, Math.PI * 1.5); g.fill();
    } else {
      g.strokeStyle = '#3a3158'; g.lineWidth = 1;
      fortuneRounded(g, txx, tyy, 13, 9, 1.5); g.stroke();
    }
  }

  if (fortune.swirlBanked) { // the chip the whole game is about
    const swY = py + 26;
    fortuneRounded(g, rx + 2, swY, 86, 11, 5);
    g.fillStyle = '#07242e'; g.fill();
    g.strokeStyle = 'rgba(38,224,255,' + (0.6 + 0.35 * Math.sin(t * 3)).toFixed(3) + ')';
    g.lineWidth = 1; g.stroke();
    g.strokeStyle = '#63ecff'; g.lineWidth = 1.2; g.lineCap = 'round';
    g.save(); g.translate(rx + 9, swY + 5.5); g.rotate(t * 1.5);
    g.beginPath();
    for (let a = 0; a < 4.2; a += 0.3) {
      const rr = 0.6 + a * 0.75;
      a === 0 ? g.moveTo(Math.cos(a * 1.8) * rr, Math.sin(a * 1.8) * rr) : g.lineTo(Math.cos(a * 1.8) * rr, Math.sin(a * 1.8) * rr);
    }
    g.stroke(); g.restore(); g.lineCap = 'butt';
    g.font = 'bold 8px monospace'; g.fillStyle = '#63ecff';
    g.fillText('SWIRL BANKED', rx + 17, swY + 5.5);
  }

  // flash toast — a chip, not floating text
  if (fortune.flashT > 0 && fortune.phase !== 'guess') {
    g.font = 'bold 8px monospace';
    const fw = g.measureText(fortune.flashMsg).width + 14;
    const fx = rx + rw / 2 - fw / 2, fy2 = py + 42;
    g.globalAlpha = Math.min(1, fortune.flashT * 2);
    fortuneRounded(g, fx, fy2, fw, 12, 5);
    g.fillStyle = 'rgba(12,10,26,0.88)'; g.fill();
    g.strokeStyle = '#4a4468'; g.lineWidth = 1; g.stroke();
    g.textAlign = 'center'; g.fillStyle = '#cfd4f2';
    g.fillText(fortune.flashMsg, rx + rw / 2, fy2 + 6);
    g.globalAlpha = 1;
  }

  // ---- the letter console: A–Z keycaps in a tray, tap or type
  const ly = Hh - 50, lw = Math.min(13, Math.floor(rw / 13));
  fortune.hit.letters = { x: rx, y: ly, w: lw, rows: 2, cols: 13 };
  fortuneRounded(g, rx - 4, ly - 4, 13 * (lw + 1) + 7, (lw + 5) + lw + 2 + 8, 3);
  g.fillStyle = 'rgba(10,8,22,0.72)'; g.fill();
  g.strokeStyle = '#3a3158'; g.lineWidth = 1; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(rx - 3, ly - 3, 13 * (lw + 1) + 5, 1);
  g.textAlign = 'center';
  const guessing = fortune.phase === 'guess';
  for (let i = 0; i < 26; i++) {
    const col = i % 13, row = (i / 13) | 0;
    const x = rx + col * (lw + 1), y = ly + row * (lw + 5);
    const ch = FORTUNE_AZ[i];
    const used = fortune.guessed.has(ch);
    const inPz = used && fortune.phrase.includes(ch);
    const kh = lw + 2;
    if (!used) {
      const vowel = FORTUNE_VOWELS.has(ch);
      const cap = g.createLinearGradient(0, y, 0, y + kh);
      if (vowel) { cap.addColorStop(0, '#6a5420'); cap.addColorStop(1, '#3e3112'); }
      else { cap.addColorStop(0, '#3d3566'); cap.addColorStop(1, '#262046'); }
      g.fillStyle = cap; g.fillRect(x, y, lw, kh);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, lw, 1); g.fillRect(x, y, 1, kh);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + kh - 1, lw, 1); g.fillRect(x + lw - 1, y, 1, kh);
      g.fillStyle = guessing ? '#f2ecdc' : '#b9b3d6';
      g.font = 'bold ' + Math.max(8, lw - 4) + 'px monospace';
      g.fillText(ch, x + lw / 2, y + kh / 2 + 1);
    } else if (inPz) { // a hit stays lit green
      g.fillStyle = '#123526'; g.fillRect(x, y + 1, lw, kh - 1);
      g.strokeStyle = 'rgba(57,255,122,0.5)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 1.5, lw - 1, kh - 2);
      g.fillStyle = '#39ff7a';
      g.font = 'bold ' + Math.max(8, lw - 4) + 'px monospace';
      g.fillText(ch, x + lw / 2, y + kh / 2 + 2);
    } else { // a miss sinks into the console
      g.fillStyle = '#191430'; g.fillRect(x, y + 1, lw, kh - 1);
      g.fillStyle = '#3e3860';
      g.font = 'bold ' + Math.max(8, lw - 4) + 'px monospace';
      g.fillText(ch, x + lw / 2, y + kh / 2 + 2);
    }
  }

  // ---- the ticker: one strip across the bottom of the studio
  g.fillStyle = '#0b0918'; g.fillRect(0, Hh - 12, W, 12);
  g.fillStyle = 'rgba(216,178,58,0.4)'; g.fillRect(0, Hh - 12, W, 1);
  const prompt = fortune.phase === 'idle'
    ? 'HOLD space / hold the wheel — release to SPIN'
    : fortune.phase === 'charging' ? 'release to spin!'
      : fortune.phase === 'spinning' ? 'round and round…'
        : fortune.phase === 'guess'
          ? (fortune.wedge === 'SW' ? '🌀 name a letter to BANK THE SWIRL' : 'pick a letter · ' + fortune.wedge + ' apiece · vowels half')
          : fortune.phase === 'between' ? 'next board…' : '';
  if (prompt) {
    g.font = 'bold 8px monospace'; g.textAlign = 'center';
    const pc = fortune.phase === 'guess' ? '#39ff7a' : fortune.phase === 'charging' ? '#ffd23a' : '#8f96c2';
    g.fillStyle = pc;
    g.fillText(prompt, W / 2, Hh - 6);
    if (fortune.phase === 'idle' || fortune.phase === 'guess') {
      const pa = 0.4 + 0.4 * Math.sin(t * 4);
      g.globalAlpha = pa;
      const pw2 = g.measureText(prompt).width / 2 + 10;
      g.fillText('▸', W / 2 - pw2, Hh - 6); g.fillText('◂', W / 2 + pw2, Hh - 6);
      g.globalAlpha = 1;
    }
  }

  // ---- THE STORM JACKPOT — the machine shows its hand
  const jackEl = t - fortune.jackT0;
  if (jackEl >= 0 && jackEl < 3.4) {
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) { // rings rolling out of the wheel
      const rr = ((jackEl * 0.9 + k * 0.33) % 1) * W * 0.7;
      g.strokeStyle = 'rgba(38,224,255,' + (0.35 * (1 - rr / (W * 0.7))).toFixed(3) + ')';
      g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, Math.max(1, rr), 0, 7); g.stroke();
    }
    for (let k = 0; k < 22; k++) { // the swirl, loose in the studio
      const a = k * 0.55 + jackEl * 2.6;
      const rr = (18 + k * 6) * (1 - jackEl / 4.2);
      g.fillStyle = 'rgba(99,236,255,' + (0.5 - k * 0.02).toFixed(3) + ')';
      g.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.6, 2, 2);
    }
    const jv = g.createRadialGradient(W / 2, Hh / 2, Hh * 0.2, W / 2, Hh / 2, Hh);
    jv.addColorStop(0, 'rgba(0,0,0,0)'); jv.addColorStop(1, 'rgba(38,224,255,' + (0.10 * (1 - jackEl / 3.4)).toFixed(3) + ')');
    g.fillStyle = jv; g.fillRect(0, 0, W, Hh);
    g.globalCompositeOperation = 'source-over';
  }

  // confetti over everything — rotated paper, two sizes
  for (const p of fortune.confetti) {
    g.save();
    g.translate(p.x, p.y); g.rotate(p.rot);
    g.globalAlpha = Math.min(1, p.life);
    g.fillStyle = p.c;
    if (p.big) g.fillRect(-2, -1.5, 4, 3); else g.fillRect(-1, -1.5, 2, 3);
    g.restore();
  }
  g.globalAlpha = 1;

  g.restore(); // shake

  // bankrupt flash: the house lights go red for a beat
  if (shaking) {
    const k = 1 - shakeEl / 0.45;
    const rv = g.createRadialGradient(W / 2, Hh / 2, Hh * 0.25, W / 2, Hh / 2, Hh * 0.9);
    rv.addColorStop(0, 'rgba(0,0,0,0)'); rv.addColorStop(1, 'rgba(200,30,40,' + (0.30 * k).toFixed(3) + ')');
    g.fillStyle = rv; g.fillRect(0, 0, W, Hh);
  }
}

// ---- input ----------------------------------------------------------------------------

function fortunePointerDown(e) {
  if (!fortuneActive() || fortune.phase === 'tier') return;
  e.preventDefault();
  const rect = fortune.cv.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * fortune.W;
  const y = ((e.clientY - rect.top) / rect.height) * fortune.Hh;
  if (fortune.phase === 'guess' && fortune.hit.letters) {
    const L = fortune.hit.letters;
    const col = Math.floor((x - L.x) / (L.w + 1)), row = Math.floor((y - L.y) / (L.w + 5));
    if (col >= 0 && col < 13 && row >= 0 && row < 2) {
      fortuneGuess(FORTUNE_AZ[row * 13 + col]);
      return;
    }
  }
  if (fortune.phase === 'idle') fortuneStartCharge();
}

function fortunePointerUp(e) {
  if (!fortuneActive()) return;
  e.preventDefault();
  fortuneRelease();
}

document.addEventListener('keydown', (e) => {
  if (!fortuneActive() || fortune.phase === 'tier') return;
  if (document.querySelector('.modal-overlay.active')) return;
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (!e.repeat) fortuneStartCharge();
    return;
  }
  if (/^Key[A-Z]$/.test(e.code) && fortune.phase === 'guess') {
    e.preventDefault();
    fortuneGuess(e.code.slice(3));
  }
});
document.addEventListener('keyup', (e) => {
  if (!fortuneActive()) return;
  if (e.code === 'Space' || e.code === 'Enter') fortuneRelease();
});

// ---- test seam -------------------------------------------------------------------------
// The harness can't time a physics spin, so land() names the wedge and runs
// the REAL landing handler; guess() runs the real guess path; setPuzzle()
// deals a named board. Everything else — banking, tokens, jackpot — is live.
window.fortuneDebug = {
  state: () => ({
    phase: fortune.phase, puzzle: fortune.phrase, category: fortune.category,
    bank: fortune.bank, tokens: fortune.tokens, swirl: fortune.swirlBanked,
    solves: fortune.solves, puzzles: fortune.puzzles, tier: fortune.cfg.key,
    revealed: [...fortune.revealed].join(''),
  }),
  land: (i) => fortuneLanded(((i % FORTUNE_WEDGES.length) + FORTUNE_WEDGES.length) % FORTUNE_WEDGES.length),
  guess: (ch) => fortuneGuess(ch),
  setPuzzle: (i) => fortuneSetPuzzle(i),
  wedges: () => FORTUNE_WEDGES.slice(),
  pickTier: (i) => {
    if (fortune.tierPick) { fortune.tierPick.close(); fortune.tierPick = null; }
    fortune.cfg = FORTUNE_TIERS[i] || FORTUNE_TIERS[0];
    fortuneNewBoard(true);
  },
  // harness seams (blender/tools/fortuneshoot.js): pin a state, keep drawing
  set: (o) => Object.assign(fortune, o),
  freeze: (v) => { fortune.freeze = v !== false; },
};
