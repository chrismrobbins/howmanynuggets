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
  bank: 0, tokens: 3, swirlBanked: false, wedge: null,
  puzzles: 0, solves: 0, betweenT: 0, flashT: 0, flashMsg: '',
  t: 0, confetti: [], bannerT: 0,
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
  if (w === 'BK') {
    fortune.bank = 0;
    fortune.swirlBanked = false;
    fortune.phase = 'idle';
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
  if (jack) {
    fortuneBanner('🌀 THE STORM JACKPOT', 'the wheel knew. the puzzle knew. tell the detective. or don’t.');
    fortuneConfetti(90);
  } else {
    fortuneBanner('✅ SOLVED', '+' + fmt.format(worth) + ' nuggets' + (fortune.tokens > 0 ? ' · ' + fortune.tokens + ' 🎟️ bonus' : ''));
    fortuneConfetti(30);
  }
}

function fortuneBanner(top, sub) {
  if (!fortune.banner) return;
  fortune.banner.innerHTML = '<b>' + top + '</b><span>' + sub + '</span>';
  fortune.banner.classList.add('show');
  fortune.bannerT = 2.4;
}

function fortuneFlash(msg) {
  fortune.flashMsg = msg;
  fortune.flashT = 2.2;
}

function fortuneConfetti(n) {
  for (let i = 0; i < n; i++) {
    fortune.confetti.push({
      x: fortune.W / 2 + (Math.random() - 0.5) * 60,
      y: fortune.Hh * 0.3,
      vx: (Math.random() - 0.5) * 90,
      vy: -30 - Math.random() * 55,
      life: 1.4 + Math.random() * 0.9,
      c: ['#ffd23a', '#26e0ff', '#ff2fa0', '#39ff7a'][i % 4],
    });
  }
}

// ---- the frame ------------------------------------------------------------------------

function stepFortune(dt, w, h) {
  syncFortune();
  if (!fortune.on) return;
  fortune.t += dt;
  if (fortune.cv.width !== Math.ceil(w / fortune.scale)) fortuneLayout();
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
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 95 * dt;
  }

  fortuneDraw();
}

// ---- drawing --------------------------------------------------------------------------

function fortuneDraw() {
  const g = fortune.g, W = fortune.W, Hh = fortune.Hh, t = fortune.t;
  g.fillStyle = '#131024';
  g.fillRect(0, 0, W, Hh);
  const grad = g.createRadialGradient(W / 2, Hh * 0.5, 10, W / 2, Hh * 0.5, Hh * 0.85);
  grad.addColorStop(0, '#28204a'); grad.addColorStop(1, '#131024');
  g.fillStyle = grad; g.fillRect(0, 0, W, Hh);

  // ---- the puzzle board, studio-style, top of the frame
  const words = fortune.phrase.split(' ');
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const test = cur ? cur + ' ' + wd : wd;
    if (test.length > 14 && cur) { lines.push(cur); cur = wd; } else cur = test;
  }
  if (cur) lines.push(cur);
  const tw = Math.min(15, Math.floor((W - 20) / 15)), th = tw + 4;
  // start below the storm pill (fortune is MODE_COMPACT_HUD — the card
  // collapses to a slim pill top-centre; the puzzle IS the game, it hides
  // behind nothing)
  const boardY = 26;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((line, li) => {
    const y = boardY + li * (th + 2);
    const x0 = W / 2 - (line.length * (tw + 1)) / 2;
    line.split('').forEach((c, ci) => {
      const x = x0 + ci * (tw + 1);
      if (c === ' ') return;
      const shown = fortune.revealed.has(c);
      g.fillStyle = shown ? '#efeadb' : '#2c2452';
      g.fillRect(x, y, tw, th);
      g.strokeStyle = '#544a86'; g.lineWidth = 1; g.strokeRect(x, y, tw, th);
      if (shown) {
        g.fillStyle = '#1a1430';
        g.font = 'bold ' + (tw - 3) + 'px monospace';
        g.fillText(c, x + tw / 2, y + th / 2 + 1);
      }
    });
  });
  const boardBot = boardY + lines.length * (th + 2) + 4;
  g.font = 'bold 8px monospace';
  g.fillStyle = '#7f88b8';
  g.fillText('— ' + fortune.category + ' —', W / 2, boardBot + 4);

  // ---- THE WHEEL, left half
  const r = Math.min(W * 0.21, (Hh - boardBot - 26) * 0.52);
  const cx = Math.max(r + 12, W * 0.26), cy = boardBot + 18 + r;
  fortune.hit.wheel = { cx, cy, r };
  const n = FORTUNE_WEDGES.length;
  for (let i = 0; i < n; i++) {
    const a0 = fortune.angle + (i / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = fortune.angle + ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const wv = FORTUNE_WEDGES[i];
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, a0, a1); g.closePath();
    g.fillStyle = wv === 'BK' ? '#141018'
      : wv === 'SW' ? '#0c3844'
        : wv === 100 ? '#7a5c14'
          : ['#472a6e', '#6e2a52', '#2a4a6e', '#2a6e4e'][i % 4];
    g.fill();
    g.strokeStyle = '#131024'; g.lineWidth = 1.5; g.stroke();
    // wedge label, standing on the rim
    const am = (a0 + a1) / 2;
    g.save();
    g.translate(cx + Math.cos(am) * r * 0.72, cy + Math.sin(am) * r * 0.72);
    g.rotate(am + Math.PI / 2);
    g.font = 'bold ' + Math.max(7, r * 0.16) + 'px monospace';
    if (wv === 'BK') { g.fillStyle = '#8b8f9c'; g.fillText('💀', 0, 0); }
    else if (wv === 'SW') {
      g.strokeStyle = '#26e0ff'; g.lineWidth = 1.5; g.lineCap = 'round';
      g.beginPath();
      for (let a = 0; a < 4.2; a += 0.25) {
        const rr = 0.8 + a * (r * 0.022);
        const x = Math.cos(a * 1.8) * rr, y = Math.sin(a * 1.8) * rr;
        a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    } else { g.fillStyle = '#f2ecdc'; g.fillText(String(wv), 0, 0); }
    g.restore();
  }
  // hub + pointer
  g.fillStyle = '#d8b23a';
  g.beginPath(); g.arc(cx, cy, r * 0.14, 0, 7); g.fill();
  g.fillStyle = fortune.phase === 'spinning' ? '#ffe9a0' : '#ff2fa0';
  g.beginPath();
  g.moveTo(cx - 5, cy - r - 7); g.lineTo(cx + 5, cy - r - 7); g.lineTo(cx, cy - r + 3);
  g.closePath(); g.fill();

  // power meter while charging
  if (fortune.phase === 'charging') {
    g.fillStyle = '#0c0918';
    g.fillRect(cx - r, cy + r + 6, r * 2, 7);
    g.fillStyle = fortune.power > 0.8 ? '#39ff7a' : '#ffd23a';
    g.fillRect(cx - r + 1, cy + r + 7, (r * 2 - 2) * fortune.power, 5);
  }

  // ---- readout column + letter board, right half
  const rx = cx + r + 14, rw = W - rx - 8;
  g.textAlign = 'left';
  g.font = 'bold 9px monospace';
  g.fillStyle = '#ffd23a';
  g.fillText('BANK  ' + fmt.format(Math.round(fortune.bank * storm.perFlyer * fortune.cfg.mult)), rx, boardBot + 20);
  g.fillStyle = '#bfc6ff';
  g.fillText('TURNS ' + '🎟️'.repeat(Math.max(0, fortune.tokens)), rx, boardBot + 32);
  if (fortune.swirlBanked) {
    g.fillStyle = '#26e0ff';
    g.fillText('🌀 SWIRL BANKED', rx, boardBot + 44);
  }

  // the letter board: A–Z in two rows, tap or type
  const ly = Hh - 42, lw = Math.min(13, Math.floor(rw / 13));
  fortune.hit.letters = { x: rx, y: ly, w: lw, rows: 2, cols: 13 };
  g.textAlign = 'center';
  for (let i = 0; i < 26; i++) {
    const col = i % 13, row = (i / 13) | 0;
    const x = rx + col * (lw + 1), y = ly + row * (lw + 5);
    const ch = FORTUNE_AZ[i];
    const used = fortune.guessed.has(ch);
    const inPz = used && fortune.phrase.includes(ch);
    g.fillStyle = used ? (inPz ? '#1d4232' : '#241c3a') : (FORTUNE_VOWELS.has(ch) ? '#4a3a14' : '#2c2452');
    g.fillRect(x, y, lw, lw + 2);
    g.fillStyle = used ? (inPz ? '#39a06a' : '#4a4468') : '#e6e0cf';
    g.font = 'bold ' + (lw - 4) + 'px monospace';
    g.fillText(ch, x + lw / 2, y + (lw + 2) / 2 + 1);
  }

  // prompt line
  g.font = 'bold 9px monospace';
  g.fillStyle = fortune.phase === 'guess' ? '#39ff7a' : '#bfc6ff';
  const prompt = fortune.phase === 'idle'
    ? 'HOLD space / hold the wheel — release to SPIN'
    : fortune.phase === 'charging' ? 'release to spin!'
      : fortune.phase === 'spinning' ? 'round and round…'
        : fortune.phase === 'guess'
          ? (fortune.wedge === 'SW' ? '🌀 name a letter to BANK THE SWIRL' : 'pick a letter · ' + fortune.wedge + ' apiece · vowels half')
          : '';
  if (prompt) g.fillText(prompt, rx + rw / 2, Hh - 8);
  if (fortune.flashT > 0 && fortune.phase !== 'guess') {
    g.fillStyle = '#7f88b8';
    g.fillText(fortune.flashMsg, rx + rw / 2, boardBot + 58);
  }

  // confetti over everything
  for (const p of fortune.confetti) {
    g.fillStyle = p.c;
    g.globalAlpha = Math.min(1, p.life);
    g.fillRect(p.x, p.y, 2, 3);
  }
  g.globalAlpha = 1;
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
};
