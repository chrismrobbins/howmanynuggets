// ---- 🎰 REEL OF FORTUNE --------------------------------------------------------------
// "THE HOUSE REMEMBERS."
//
// A one-button skill-stop slot machine (mode key: fortune), named by a friend
// of the arcade and delivered on request. Game 16, the SIXTH walk-up machine
// inside the hall itself — Brawlers' old west-wall spot, under the neon.
//
// It is a SKILL game wearing a slot machine's clothes: the reels are visible
// and honest, and every press stops the NEXT reel where your timing lands it
// (a short, fixed spin-down — aimable, like the pachislo parlors intended).
// Line up three of a kind on the payline. The GOLDEN NUG is wild. Three 💀
// SOGGY FRIES and the house takes your streak. Three wins running lights
// FEVER (double pay, five spins).
//
// And the lore: the reels carry a 🌀 SWIRL nobody at the house will explain.
// Line up all three and the machine pays THE STORM JACKPOT — and remembers
// that you saw it (localStorage nugFortuneJack, read via fortuneJackpotHit()).
// Detective Dill has opinions about this machine's odds. Canon-safe: the
// swirl on the reels is ARTWORK. Probably. Nothing moved. The case stays open.
//
// Scoring mirrors the other games: every payout is perFlyer-scaled into
// storm.caught; stopStorm() banks it. Spins are free — this house deals in
// nuggets, not quarters.

const fortuneWorld = document.getElementById('fortuneWorld');

// The reel strips. FIXED arrays, not shuffled at runtime — the game is
// deterministic given your timing, and the harness can aim at outcomes.
// 20 stops per reel: nug 6 · cup 5 · star 4 · gold 2 · soggy 2 · swirl 1.
const FORTUNE_STRIPS = [
  [0, 1, 0, 2, 5, 1, 0, 3, 2, 1, 0, 4, 2, 1, 0, 3, 4, 2, 0, 1],
  [1, 0, 2, 0, 1, 3, 0, 5, 1, 2, 4, 0, 1, 2, 3, 0, 4, 1, 0, 2],
  [0, 2, 1, 3, 0, 1, 4, 2, 0, 5, 1, 0, 2, 4, 1, 3, 0, 1, 2, 0],
];
// symbol ids: 0 NUG, 1 SAUCE CUP, 2 STAR, 3 GOLDEN NUG (wild), 4 SOGGY, 5 SWIRL
const FORTUNE_PAY3 = [15, 25, 50, 250, 0, 1500];   // three-of-a-kind by symbol
const FORTUNE_PAY2 = 4;                             // any natural pair
const FORTUNE_JACKPOT = 5;                          // the swirl's id
const FORTUNE_SOGGY = 4;

const FORTUNE_TIERS = [
  { key: 'penny',  emoji: '🪙', name: 'PENNY ANTE', mult: 1, speed: 6.5,
    blurb: 'kind reels. warm up your thumb.' },
  { key: 'roller', emoji: '💰', name: 'HIGH ROLLER', mult: 2, speed: 9,
    blurb: 'the house watches. the reels mean it.' },
  { key: 'rigged', emoji: '🌀', name: 'THE RIGGED WHEEL', mult: 3, speed: 12.5,
    blurb: 'you know too much. so do the reels.', lockNote: 'land the storm jackpot' },
];

const fortune = {
  on: false, cv: null, g: null, banner: null, tierPick: null,
  W: 320, Hh: 200, scale: 3,
  phase: 'idle',        // tier | idle | spin | payout
  cfg: FORTUNE_TIERS[0],
  reels: [],            // { pos, v, state: 'spin'|'stopping'|'stopped', target }
  t: 0, spins: 0, streak: 0, feverLeft: 0,
  lastWin: 0, lastLine: null, payoutT: 0, lever: 0,
  confetti: [], bannerT: 0,
  rigNext: null,        // debug: force the next spin's payline [a,b,c]
};

function fortuneActive() { return storm.mode === 'fortune' && storm.running; }

// Did the reels ever line up the storm? Street NPCs react; tier 3 unlocks.
function fortuneJackpotHit() {
  try { return localStorage.getItem('nugFortuneJack') === '1'; } catch (e) { return false; }
}

function fortuneTally() {
  if (fortune.phase === 'tier') return '🎰 choose your stakes…';
  const bits = ['🎰 spin ' + fortune.spins];
  if (fortune.feverLeft > 0) bits.push('🔥 FEVER ×2 (' + fortune.feverLeft + ')');
  else if (fortune.streak > 0) bits.push('streak ' + fortune.streak + '/3');
  if (fortune.lastWin > 0 && fortune.phase === 'payout') bits.push('+' + fmt.format(fortune.lastWin));
  return bits.join(' · ');
}

function fortuneLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  fortune.scale = Math.max(3, Math.floor(vh / 210));
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
      fortune.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); fortunePress(); });
    }
    // the amount input autofocuses on load and eats keys — let go of it
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    fortune.t = 0; fortune.spins = 0; fortune.streak = 0; fortune.feverLeft = 0;
    fortune.lastWin = 0; fortune.confetti.length = 0; fortune.rigNext = null;
    fortuneLayout();
    fortuneResetReels();
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
    title: '🎰 Name your stakes',
    note: fortuneJackpotHit() ? 'the reels remember you · 1 · 2 · 3'
      : 'press to SPIN · press to STOP each reel · three of a kind pays',
    tiers,
    onPick: (key, t) => { fortune.tierPick = null; fortune.cfg = t; fortune.phase = 'idle'; },
  });
}

function fortuneResetReels() {
  fortune.reels = FORTUNE_STRIPS.map((s, i) => ({
    pos: (i * 7) % s.length, v: 0, state: 'stopped', target: 0,
  }));
}

// ---- the one button ---------------------------------------------------------------

function fortunePress() {
  if (!fortuneActive()) return;
  if (fortune.phase === 'idle') {
    fortune.phase = 'spin';
    fortune.spins++;
    fortune.lever = 1;   // pull the arm
    for (const r of fortune.reels) { r.state = 'spin'; r.v = fortune.cfg.speed; }
    return;
  }
  if (fortune.phase === 'spin') {
    // stop the next spinning reel where the timing lands it
    const r = fortune.reels.find((x) => x.state === 'spin');
    if (!r) return;
    const i = fortune.reels.indexOf(r);
    // ~a symbol and a half of honest spin-down, then snap. Aimable.
    let target = Math.ceil(r.pos + r.v * 0.16);
    if (fortune.rigNext) {
      // debug seam: land this reel on the rigged symbol's nearest stop AHEAD
      const want = fortune.rigNext[i], strip = FORTUNE_STRIPS[i];
      for (let k = 0; k < strip.length; k++) {
        const idx = (target + k) % strip.length;
        if (strip[idx] === want) { target = target + k; break; }
      }
    }
    r.state = 'stopping';
    r.target = target;
  }
}

// ---- the spin ----------------------------------------------------------------------

function fortuneLineSym(i) {
  const strip = FORTUNE_STRIPS[i], r = fortune.reels[i];
  return strip[((Math.round(r.pos) % strip.length) + strip.length) % strip.length];
}

function fortuneEvaluate() {
  const line = [fortuneLineSym(0), fortuneLineSym(1), fortuneLineSym(2)];
  fortune.lastLine = line;
  fortune.rigNext = null;

  // three soggy fries: the house takes the streak and pays a lesson
  if (line.every((s) => s === FORTUNE_SOGGY)) {
    fortune.streak = 0; fortune.feverLeft = 0; fortune.lastWin = 0;
    fortuneBanner('💀 THE HOUSE WINS', 'soggy across the line — streak surrendered');
    return;
  }

  // wild logic: golden nugs substitute for anything except the swirl
  const natural = (want) => line.every((s) => s === want);
  let base = 0, name = '';
  if (natural(FORTUNE_JACKPOT)) {
    base = FORTUNE_PAY3[FORTUNE_JACKPOT];
    name = 'jackpot';
  } else {
    for (let sym = 3; sym >= 0; sym--) { // check gold first — it pays best
      if (sym === FORTUNE_SOGGY) continue;
      if (line.every((s) => s === sym || (s === 3 && sym !== FORTUNE_JACKPOT))) {
        base = FORTUNE_PAY3[sym]; name = '3× ' + FORTUNE_SYM_NAMES[sym];
        break;
      }
    }
    if (!base) {
      // a natural pair (wilds count) — small consolation
      for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
        const A = line[a], B = line[b];
        if (A === FORTUNE_SOGGY || B === FORTUNE_SOGGY) continue;
        if (A === B || A === 3 || B === 3) { base = FORTUNE_PAY2; name = 'pair'; a = 3; break; }
      }
    }
  }

  if (base > 0) {
    const fever = fortune.feverLeft > 0 ? 2 : 1;
    const worth = Math.max(1, Math.round(storm.perFlyer * base * fortune.cfg.mult * fever));
    storm.caught += worth;
    fortune.lastWin = worth;
    if (fortune.feverLeft > 0) fortune.feverLeft--;
    else {
      fortune.streak++;
      if (fortune.streak >= 3) {
        fortune.streak = 0; fortune.feverLeft = 5;
        fortuneBanner('🔥 FEVER', 'five spins at DOUBLE pay — the reels run hot');
      }
    }
    if (name === 'jackpot') {
      try { localStorage.setItem('nugFortuneJack', '1'); } catch (e) { /* no storage */ }
      fortuneBanner('🌀 THE STORM JACKPOT', 'the reels remember. tell the detective. or don’t.');
      fortuneConfetti(90);
    } else if (base >= FORTUNE_PAY3[3]) {
      fortuneBanner('🥇 GOLDEN LINE', '+' + fmt.format(worth));
      fortuneConfetti(40);
    }
  } else {
    fortune.lastWin = 0;
    if (fortune.feverLeft > 0) fortune.feverLeft--;
    else fortune.streak = 0;
  }
}

const FORTUNE_SYM_NAMES = ['nug', 'sauce', 'star', 'gold', 'soggy', 'swirl'];

function fortuneBanner(top, sub) {
  if (!fortune.banner) return;
  fortune.banner.innerHTML = '<b>' + top + '</b><span>' + sub + '</span>';
  fortune.banner.classList.add('show');
  fortune.bannerT = 2.4;
}

function fortuneConfetti(n) {
  for (let i = 0; i < n; i++) {
    fortune.confetti.push({
      x: fortune.W / 2 + (Math.random() - 0.5) * 40,
      y: fortune.Hh * 0.35,
      vx: (Math.random() - 0.5) * 90,
      vy: -30 - Math.random() * 55,
      life: 1.4 + Math.random() * 0.9,
      c: ['#ffd23a', '#26e0ff', '#ff2fa0', '#39ff7a'][i % 4],
    });
  }
}

function stepFortune(dt, w, h) {
  syncFortune();
  if (!fortune.on) return;
  fortune.t += dt;
  if (fortune.cv.width !== Math.ceil(w / fortune.scale)) fortuneLayout();
  fortune.lever = Math.max(0, fortune.lever - dt * 2.4);
  if (fortune.bannerT > 0) {
    fortune.bannerT -= dt;
    if (fortune.bannerT <= 0) fortune.banner.classList.remove('show');
  }

  // reels
  if (fortune.phase === 'spin') {
    let allStopped = true;
    for (const r of fortune.reels) {
      if (r.state === 'spin') { r.pos += r.v * dt; allStopped = false; }
      else if (r.state === 'stopping') {
        // glide onto the target — fast while far, easing to a stop, capped so
        // it can never overshoot. No random anywhere: your timing IS the spin.
        const d = r.target - r.pos;
        r.pos += Math.min(d, (1.6 + d * 7) * dt);
        if (r.target - r.pos <= 0.015) { r.pos = r.target; r.state = 'stopped'; }
        else allStopped = false;
      }
    }
    if (allStopped) {
      fortune.phase = 'payout';
      fortune.payoutT = 0.9;
      fortuneEvaluate();
    }
  } else if (fortune.phase === 'payout') {
    fortune.payoutT -= dt;
    if (fortune.payoutT <= 0) fortune.phase = 'idle';
  }

  // confetti
  for (let i = fortune.confetti.length - 1; i >= 0; i--) {
    const p = fortune.confetti[i];
    p.life -= dt;
    if (p.life <= 0) { fortune.confetti.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 95 * dt;
  }

  fortuneDraw();
}

// ---- drawing ------------------------------------------------------------------------

function fortuneSymbol(g, sym, cx, cy, s, dim) {
  g.save();
  g.translate(cx, cy);
  g.globalAlpha = dim ? 0.45 : 1;
  if (sym === 0) {          // nug: golden blob
    g.fillStyle = '#e8a83a';
    g.beginPath(); g.ellipse(0, 0, s * 0.42, s * 0.34, 0.3, 0, 7); g.fill();
    g.fillStyle = '#f7ce6b';
    g.beginPath(); g.ellipse(-s * 0.1, -s * 0.08, s * 0.16, s * 0.11, 0.3, 0, 7); g.fill();
  } else if (sym === 1) {   // sauce cup
    g.fillStyle = '#d8dbe6';
    g.beginPath(); g.moveTo(-s * 0.3, -s * 0.22); g.lineTo(s * 0.3, -s * 0.22);
    g.lineTo(s * 0.22, s * 0.34); g.lineTo(-s * 0.22, s * 0.34); g.closePath(); g.fill();
    g.fillStyle = '#d8323c';
    g.fillRect(-s * 0.26, -s * 0.3, s * 0.52, s * 0.14);
  } else if (sym === 2) {   // star
    g.fillStyle = '#ffe23a';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? s * 0.18 : s * 0.42, a = -Math.PI / 2 + (i * Math.PI) / 5;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  } else if (sym === 3) {   // golden nug (wild): bigger, ringed
    g.strokeStyle = '#fff3c0'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, s * 0.46, 0, 7); g.stroke();
    g.fillStyle = '#ffd23a';
    g.beginPath(); g.ellipse(0, 0, s * 0.36, s * 0.3, -0.25, 0, 7); g.fill();
    g.fillStyle = '#fff3c0';
    g.beginPath(); g.ellipse(-s * 0.09, -s * 0.07, s * 0.13, s * 0.09, -0.25, 0, 7); g.fill();
  } else if (sym === 4) {   // soggy fry: grey, drooped
    g.strokeStyle = '#8b8f9c'; g.lineWidth = Math.max(2, s * 0.16); g.lineCap = 'round';
    g.beginPath(); g.moveTo(-s * 0.3, -s * 0.25);
    g.quadraticCurveTo(s * 0.05, -s * 0.05, s * 0.1, s * 0.35); g.stroke();
    g.beginPath(); g.moveTo(-s * 0.05, -s * 0.3);
    g.quadraticCurveTo(s * 0.25, -s * 0.1, s * 0.28, s * 0.3); g.stroke();
  } else if (sym === 5) {   // THE SWIRL
    g.strokeStyle = '#26e0ff'; g.lineWidth = Math.max(2, s * 0.12); g.lineCap = 'round';
    g.beginPath();
    for (let a = 0; a < 4.6; a += 0.18) {
      const rr = s * 0.09 + a * s * 0.075;
      const x = Math.cos(a + fortune.t * 1.6) * rr, y = Math.sin(a + fortune.t * 1.6) * rr;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = '#ffd23a';
    g.beginPath(); g.arc(0, 0, s * 0.08, 0, 7); g.fill();
  }
  g.restore();
}

function fortuneDraw() {
  const g = fortune.g, W = fortune.W, Hh = fortune.Hh, t = fortune.t;
  // the room: deep casino violet, a pool of light on the machine
  g.fillStyle = '#131024';
  g.fillRect(0, 0, W, Hh);
  const grad = g.createRadialGradient(W / 2, Hh * 0.42, 10, W / 2, Hh * 0.42, Hh * 0.75);
  grad.addColorStop(0, '#2a2247'); grad.addColorStop(1, '#131024');
  g.fillStyle = grad; g.fillRect(0, 0, W, Hh);

  // machine face
  const mw = Math.min(W * 0.72, 250), mh = Math.min(Hh * 0.86, 176);
  const mx = (W - mw) / 2, my = (Hh - mh) / 2 + 4;
  g.fillStyle = '#1d1833'; g.fillRect(mx - 6, my - 6, mw + 12, mh + 12);
  g.strokeStyle = '#544a86'; g.lineWidth = 2; g.strokeRect(mx - 6, my - 6, mw + 12, mh + 12);

  // marquee: title + chase bulbs
  g.fillStyle = '#0d0a1c'; g.fillRect(mx, my, mw, 26);
  g.font = 'bold 13px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = fortune.feverLeft > 0 ? '#ff2fa0' : '#ffd23a';
  g.fillText('REEL OF FORTUNE', mx + mw / 2, my + 13);
  for (let i = 0; i < 12; i++) {
    const on = (Math.floor(t * 6) + i) % 3 === 0;
    g.fillStyle = on ? '#ffe9a0' : '#4b3f76';
    g.fillRect(mx + 6 + (i * (mw - 12)) / 11 - 1, my + 23, 3, 3);
  }

  // the reel box: three windows, three rows visible, payline in the middle
  const bw = mw - 24, bx = mx + 12, by = my + 34, bh = mh - 76;
  const rw = Math.floor(bw / 3) - 6, sym = Math.min(rw * 0.8, bh / 3.1);
  g.fillStyle = '#0a0817'; g.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
  for (let i = 0; i < 3; i++) {
    const wx = bx + i * (rw + 8), strip = FORTUNE_STRIPS[i], r = fortune.reels[i];
    g.save();
    g.beginPath(); g.rect(wx, by, rw, bh); g.clip();
    g.fillStyle = '#efeadb'; g.fillRect(wx, by, rw, bh);
    // paper shading top/bottom so the drum reads as a drum
    const sh = g.createLinearGradient(0, by, 0, by + bh);
    sh.addColorStop(0, 'rgba(30,20,60,0.55)'); sh.addColorStop(0.28, 'rgba(30,20,60,0)');
    sh.addColorStop(0.72, 'rgba(30,20,60,0)'); sh.addColorStop(1, 'rgba(30,20,60,0.55)');
    const frac = r.pos - Math.round(r.pos);
    for (let row = -2; row <= 2; row++) {
      const idx = ((Math.round(r.pos) + row) % strip.length + strip.length) % strip.length;
      const cy = by + bh / 2 - (row + (Math.round(r.pos) - r.pos)) * (bh / 2.6);
      fortuneSymbol(g, strip[idx], wx + rw / 2, cy, sym, row !== 0 || Math.abs(frac) > 0.25);
    }
    g.fillStyle = sh; g.fillRect(wx, by, rw, bh);
    g.restore();
    g.strokeStyle = r.state === 'spin' ? '#26e0ff' : '#544a86';
    g.lineWidth = 2; g.strokeRect(wx, by, rw, bh);
  }
  // payline arrows
  const py = by + bh / 2;
  g.fillStyle = fortune.phase === 'payout' && fortune.lastWin > 0 ? '#39ff7a' : '#ff2fa0';
  g.beginPath(); g.moveTo(bx - 10, py - 5); g.lineTo(bx - 3, py); g.lineTo(bx - 10, py + 5); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(bx + bw + 10, py - 5); g.lineTo(bx + bw + 3, py); g.lineTo(bx + bw + 10, py + 5); g.closePath(); g.fill();

  // the lever, riding its pull
  const lx = mx + mw + 9, lyTop = my + 40 + fortune.lever * 34, lyBase = my + 86;
  g.strokeStyle = '#8b8f9c'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(lx, lyBase); g.lineTo(lx, lyTop); g.stroke();
  g.fillStyle = '#d8323c';
  g.beginPath(); g.arc(lx, lyTop - 4, 5, 0, 7); g.fill();
  g.fillStyle = '#2a2247'; g.fillRect(lx - 4, lyBase, 8, 8);

  // readout: streak lamps + prompt + last win
  const ry = by + bh + 12;
  for (let i = 0; i < 3; i++) {
    g.fillStyle = (fortune.feverLeft > 0 || i < fortune.streak) ? '#ff9d2f' : '#3a3160';
    g.beginPath(); g.arc(mx + 16 + i * 12, ry, 4, 0, 7); g.fill();
  }
  g.font = 'bold 9px monospace'; g.textAlign = 'center';
  g.fillStyle = '#bfc6ff';
  const prompt = fortune.phase === 'idle'
    ? (fortune.feverLeft > 0 ? '🔥 FEVER · press to SPIN (×2 pay)' : 'press to SPIN')
    : fortune.phase === 'spin' ? 'press to STOP reel ' + (fortune.reels.filter((r) => r.state !== 'spin').length + 1)
      : fortune.lastWin > 0 ? '+' + fmt.format(fortune.lastWin) + ' nuggets' : 'the house nods. again?';
  g.fillText(prompt, mx + mw / 2, ry + 1);
  g.fillStyle = '#7f88b8';
  g.fillText('3× 🥇 pays big · 🌀🌀🌀 is the STORY · 💀💀💀 is the house', mx + mw / 2, ry + 13);

  // confetti over everything
  for (const p of fortune.confetti) {
    g.fillStyle = p.c;
    g.globalAlpha = Math.min(1, p.life);
    g.fillRect(p.x, p.y, 2, 3);
  }
  g.globalAlpha = 1;
}

// ---- input ---------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (!fortuneActive() || fortune.phase === 'tier') return;
  if (document.querySelector('.modal-overlay.active')) return;
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE' || e.code === 'KeyX') {
    e.preventDefault();
    fortunePress();
  }
});

// ---- test seam -------------------------------------------------------------------------
// The harness can't aim a millisecond press, so rig() pins the NEXT spin's
// payline; everything else (payout math, fever, banking) runs the real path.
window.fortuneDebug = {
  state: () => ({
    phase: fortune.phase, spins: fortune.spins, streak: fortune.streak,
    fever: fortune.feverLeft, lastWin: fortune.lastWin, line: fortune.lastLine,
    tier: fortune.cfg.key,
  }),
  press: () => fortunePress(),
  rig: (a, b, c) => { fortune.rigNext = [a, b, c]; },
  pickTier: (i) => {
    if (fortune.tierPick) { fortune.tierPick.close(); fortune.tierPick = null; }
    fortune.cfg = FORTUNE_TIERS[i] || FORTUNE_TIERS[0];
    fortune.phase = 'idle';
  },
};
