// ---- Flappy Nug — THE OVEN RELIGHT edition -------------------------------------
// Was: bare Flappy Bird, one pipe type, free respawns. Now: a flight across
// Nuggetown's four skies — 🍟 the Fryer → 🧊 the Freezer (gusts) → 🫙 the Sauce
// Caverns (drips + tight gaps) → 🌩️ THE HARBOR STORM (the finale gauntlet). The
// nugget is a real character now (flapping wings, panic eyes, a sauce streak);
// thread gaps closely for a WHOOSH combo, grab power-ups, and a crash ENDS the
// run (bank the distance, take your medal) then instantly restarts. Difficulty
// is an ArcadeKit oath: FLEDGLING / FLYER / STORMCHASER 🌩. Clearing the Storm
// sets `nugFlappyStorm` — the Hooded Nug and Dill hear about it (canon-safe:
// you fly the storm's EDGE; nothing moves, the case stays open).
//
// Still DOM/CSS + the storm rAF loop; still banks into storm.caught (perFlyer
// parity), still pauses the background storm.

const birdEl = document.getElementById('flappyBird');
const flappySky = document.getElementById('flappySky');
const flappyOver = document.getElementById('flappyOver');

const GRAVITY = 1900;          // px/s² downward
const FLAP_VY = -540;          // px/s upward kick per flap
const FLAP_SPEED = 230;        // px/s scroll speed (scaled by tier + biome)
const PIPE_W = 66;             // tower width
const BASE_GAP = 205;          // base gap height (scaled by tier + biome)
const MIN_GAP = 138;           // never tighter than this, whatever the math says
const PIPE_SPACING = 350;      // horizontal distance between towers
const PIPE_MARGIN = 84;        // keep gap centers away from the very top/bottom
const BIRD_SIZE = 52;          // matches the CSS size
const BIRD_R = BIRD_SIZE * 0.33;
const GOLDEN_GATE_CHANCE = 0.06;
const NEARMISS = 30;           // px clearance that still counts as a "clean thread"

// Difficulty oaths (ArcadeKit.tierSelect). gap>1 = wider (easier).
const FLAPPY_TIERS = [
  { key: 'fledgling', emoji: '🐣', name: 'FLEDGLING', mult: 1, gap: 1.16, speed: 0.85, wind: 0.5, blurb: 'wide gaps, gentle air' },
  { key: 'flyer',     emoji: '🐤', name: 'FLYER',     mult: 2, gap: 1.0,  speed: 1.0,  wind: 1.0, blurb: 'the real thing' },
  { key: 'stormchaser', emoji: '🌩️', name: 'STORMCHASER', mult: 3, gap: 0.86, speed: 1.2, wind: 1.5, blurb: 'tight, fast, merciless',
    lockNote: 'reach the Sauce Caverns on FLYER' },
];
function flappyChaserUnlocked() {
  try { return localStorage.getItem('nugFlappyCaverns') === '1'; } catch (e) { return false; }
}
// Read by arcade.js street dialogue (Sprint 6): did they fly the Harbor Storm?
function flappyStormFlown() {
  try { return localStorage.getItem('nugFlappyStorm') === '1'; } catch (e) { return false; }
}

// Biomes, entered at cumulative gate counts. sky = [top, mid, bottom] gradient;
// accent tints the towers. rules: windAmp (px/s vertical gust), windFreq, moving
// (gaps drift), drip (sauce falls), gapMul, speedMul, hue (parallax silhouette).
const FLAPPY_BIOMES = [
  { at: 0,  key: 'fryer',   name: 'The Fryer',        emoji: '🍟',
    sky: ['#3a2410', '#7a4718', '#e08a2e', '#ffcf6b'], accent: '#e8a13a', hue: '#c47a22',
    rules: { windAmp: 0, windFreq: 0, moving: false, drip: false, gapMul: 1.0, speedMul: 1.0 } },
  { at: 8,  key: 'freezer', name: 'The Freezer',      emoji: '🧊',
    sky: ['#08131f', '#123049', '#2f6f8f', '#bfe9f5'], accent: '#7fd4e8', hue: '#3d8fb0',
    rules: { windAmp: 300, windFreq: 1.4, moving: true, drip: false, gapMul: 0.98, speedMul: 1.05 } },
  { at: 16, key: 'caverns', name: 'The Sauce Caverns', emoji: '🫙',
    sky: ['#160610', '#3a0d1f', '#6d1330', '#a8324f'], accent: '#d84a6a', hue: '#7a1b33',
    rules: { windAmp: 0, windFreq: 0, moving: false, drip: true, gapMul: 0.9, speedMul: 1.1 } },
  { at: 24, key: 'storm',   name: 'THE HARBOR STORM', emoji: '🌩️',
    sky: ['#04060f', '#0b1226', '#1a2444', '#3a4f7a'], accent: '#9fb3e0', hue: '#22304f',
    rules: { windAmp: 520, windFreq: 1.9, moving: true, drip: true, gapMul: 0.86, speedMul: 1.22 } },
];
const STORM_CLEAR_GATES = 32; // survive 8 gates into the storm = finale cleared

const FLAPPY_POWERS = [
  { key: 'shield', emoji: '🛡️', label: 'SHIELD',  secs: 0 },   // until consumed
  { key: 'slow',   emoji: '⏱️', label: 'SLOW-MO', secs: 4.5 },
  { key: 'float',  emoji: '🪶', label: 'FLOAT',   secs: 5.5 },
  { key: 'x2',     emoji: '✨', label: 'DOUBLE',  secs: 6.5 },
];

const flappy = {
  on: false,
  phase: 'idle',     // 'idle' | 'tier' | 'ready' | 'flying' | 'over'
  y: 0, vy: 0,
  dist: 0,           // px travelled this run
  gates: 0,          // gates cleared this run
  biome: 0,          // index into FLAPPY_BIOMES
  cfg: FLAPPY_TIERS[1],
  fever: null,       // ArcadeKit combo
  shield: false,
  powerT: { slow: 0, float: 0, x2: 0 },
  pipes: [],         // { top, bottom, x, center, gap, moveAmp, movePhase, passed, golden, token }
  drips: [],         // { el, x, y, vy }
  tokens: [],        // { el, x, y, def, bob }
  parallax: null,    // { far, near }
  t: 0,              // world clock (secs) for winds/moving
  flashT: 0,         // lightning flash timer
  stormCleared: false,
  best: 0,           // best gates this session (any tier)
  tierPick: null,    // handle to the open tier overlay
};

function flappyActive() {
  return storm.mode === 'flappy' && storm.running;
}

function flappyTally() {
  const b = FLAPPY_BIOMES[flappy.biome];
  const combo = flappy.fever && flappy.fever.active ? ` · 🔥${flappy.fever.mult.toFixed(1)}×` : '';
  if (flappy.phase === 'tier') return '🐣 choose your wings…';
  return `${b.emoji} ${b.name} · ${flappy.gates} gates${combo}`;
}

// ---- Build / teardown ----------------------------------------------------------

function buildBird() {
  if (birdEl.dataset.built) return;
  birdEl.dataset.built = '1';
  birdEl.innerHTML = `
    <svg viewBox="-50 -50 100 100" width="100%" height="100%" aria-hidden="true">
      <g id="fbWingB" class="fb-wing"><path d="M-6,2 Q-40,-6 -46,18 Q-26,16 -4,14 Z" fill="#c9762a"/></g>
      <path id="fbStreak" d="" fill="none" stroke="rgba(255,180,80,0.5)" stroke-width="5" stroke-linecap="round"/>
      <image href="nugget.png" x="-34" y="-34" width="68" height="68"/>
      <g id="fbEyes">
        <ellipse cx="6" cy="-10" rx="11" ry="12" fill="#fdfdf8"/>
        <ellipse cx="22" cy="-9" rx="8" ry="9" fill="#fdfdf8"/>
        <circle id="fbPupilA" cx="8" cy="-9" r="4.2" fill="#22232b"/>
        <circle id="fbPupilB" cx="23" cy="-8" r="3.2" fill="#22232b"/>
      </g>
      <g id="fbWingF" class="fb-wing"><path d="M-2,4 Q-34,0 -40,26 Q-20,22 0,16 Z" fill="#e8933a"/></g>
    </svg>`;
  flappy.bird = {
    wingF: birdEl.querySelector('#fbWingF'),
    wingB: birdEl.querySelector('#fbWingB'),
    eyes: birdEl.querySelector('#fbEyes'),
    pupilA: birdEl.querySelector('#fbPupilA'),
    pupilB: birdEl.querySelector('#fbPupilB'),
    streak: birdEl.querySelector('#fbStreak'),
  };
}

function buildParallax() {
  if (flappy.parallax) return;
  flappySky.innerHTML = '<div class="fp-far"></div><div class="fp-near"></div><div class="fp-flash"></div>';
  flappy.parallax = {
    far: flappySky.querySelector('.fp-far'),
    near: flappySky.querySelector('.fp-near'),
    flash: flappySky.querySelector('.fp-flash'),
  };
}

function applyBiome(i, instant) {
  const b = FLAPPY_BIOMES[i];
  flappySky.style.background =
    `linear-gradient(180deg, ${b.sky[0]} 0%, ${b.sky[1]} 38%, ${b.sky[2]} 74%, ${b.sky[3]} 100%)`;
  document.body.style.setProperty('--fpipe', b.accent);
  document.body.style.setProperty('--fhue', b.hue);
  if (instant) flappySky.style.transition = 'none';
  else flappySky.style.transition = 'background 1.1s ease';
  if (instant) requestAnimationFrame(() => { flappySky.style.transition = 'background 1.1s ease'; });
}

function syncFlappy() {
  const active = flappyActive();
  if (active === flappy.on) return;
  flappy.on = active;
  document.body.classList.toggle('flappy-mode', active);
  birdEl.classList.toggle('active', active);
  flappySky.classList.toggle('active', active);
  if (active) {
    buildBird();
    buildParallax();
    openTierSelect();
  } else {
    if (flappy.tierPick) { flappy.tierPick.close(); flappy.tierPick = null; }
    flappy.phase = 'idle';
    clearPipes();
    clearDrips();
    clearTokens();
    flappyOver.classList.remove('on');
  }
}

function openTierSelect() {
  flappy.phase = 'tier';
  flappyOver.classList.remove('on');
  clearPipes(); clearDrips(); clearTokens();
  const tiers = FLAPPY_TIERS.map((t) => t.key === 'stormchaser' && !flappyChaserUnlocked()
    ? { ...t, locked: true } : t);
  flappy.tierPick = ArcadeKit.tierSelect({
    storeKey: 'flappy',
    title: '🐤 Choose your wings',
    note: flappyChaserUnlocked() ? 'the storm is open to you · 1 · 2 · 3' : 'press 1 · 2 · 3 or click',
    tiers,
    onPick: (key, t) => { flappy.tierPick = null; flappy.cfg = t; newRun(true); },
  });
}

function newRun(first) {
  flappy.phase = 'ready';
  flappy.y = window.innerHeight * 0.42;
  flappy.vy = 0;
  flappy.dist = 0;
  flappy.gates = 0;
  flappy.biome = 0;
  flappy.t = 0;
  flappy.flashT = 0;
  flappy.shield = false;
  flappy.invT = 0;
  flappy.stormCleared = false;
  flappy.powerT = { slow: 0, float: 0, x2: 0 };
  flappy.fever = ArcadeKit.makeFever({ perLevel: 4, maxLevel: 3, step: 0.5, timeout: 0 });
  clearPipes(); clearDrips(); clearTokens();
  applyBiome(0, true);
  flappyOver.classList.remove('on');
  birdEl.style.opacity = '';
  drawBird();
  updateStormHud();
}

function birdX() { return Math.round(window.innerWidth * 0.28); }

function drawBird() {
  const b = flappy.bird;
  const tilt = Math.max(-28, Math.min(72, flappy.vy * 0.06));
  birdEl.style.transform = `translate(${birdX()}px, ${flappy.y}px) rotate(${tilt}deg)`;
  if (!b) return;
  // wings sweep down right after a flap, ease back up; panic eyes on a dive.
  const wf = flappy._flapT || 0;
  const sweep = Math.max(0, wf) * 60;         // degrees
  b.wingF.setAttribute('transform', `rotate(${(20 - sweep).toFixed(0)})`);
  b.wingB.setAttribute('transform', `rotate(${(10 - sweep * 0.7).toFixed(0)})`);
  const panic = Math.max(0, Math.min(1, flappy.vy / 500));
  b.pupilA.setAttribute('cy', (-9 + panic * 5).toFixed(1));
  b.pupilB.setAttribute('cy', (-8 + panic * 5).toFixed(1));
  b.eyes.setAttribute('transform', panic > 0.6 ? 'scale(1.12)' : 'scale(1)');
}

// ---- Pipes / hazards / tokens ---------------------------------------------------

function clearPipes() { flappy.pipes.forEach((p) => { p.top.remove(); p.bottom.remove(); }); flappy.pipes = []; }
function clearDrips() { flappy.drips.forEach((d) => d.el.remove()); flappy.drips = []; }
function clearTokens() { flappy.tokens.forEach((t) => t.el.remove()); flappy.tokens = []; }

function makePipeEl(golden, which) {
  const el = document.createElement('div');
  // cap the gap-facing end: the top tower caps at its bottom, vice-versa.
  const cap = which === 'top' ? ' cap-bottom' : ' cap-top';
  el.className = 'flappy-pipe' + cap + (golden ? ' golden' : '');
  document.body.appendChild(el);
  return el;
}

function curGap() {
  const b = FLAPPY_BIOMES[flappy.biome];
  return Math.max(MIN_GAP, BASE_GAP * flappy.cfg.gap * b.rules.gapMul);
}
function curSpeed() {
  const b = FLAPPY_BIOMES[flappy.biome];
  return FLAP_SPEED * flappy.cfg.speed * b.rules.speedMul;
}

function spawnPipe(w, h) {
  const gap = curGap();
  const b = FLAPPY_BIOMES[flappy.biome];
  const lo = PIPE_MARGIN + gap / 2, hi = h - PIPE_MARGIN - gap / 2;
  const center = lo + Math.random() * Math.max(hi - lo, 1);
  const golden = Math.random() < GOLDEN_GATE_CHANCE;
  const x = w + PIPE_W;
  const moveAmp = b.rules.moving ? (36 + Math.random() * 54) : 0;
  const top = makePipeEl(golden, 'top'), bottom = makePipeEl(golden, 'bottom');
  const p = { top, bottom, x, center, gap, moveAmp, movePhase: Math.random() * Math.PI * 2,
    passed: false, golden, token: null };
  flappy.pipes.push(p);
  positionPipe(p, h);
  // occasionally tuck a power-up into the gap (never on golden gates)
  if (!golden && flappy.gates >= 3 && Math.random() < 0.24) {
    const pool = FLAPPY_POWERS.filter((d) => d.key !== 'shield' || !flappy.shield);
    spawnToken(pool[Math.floor(Math.random() * pool.length)], x, center);
  }
}

function pipeCenter(p) {
  return p.center + (p.moveAmp ? Math.sin(flappy.t * 1.5 + p.movePhase) * p.moveAmp : 0);
}

function positionPipe(p, h) {
  const c = pipeCenter(p);
  const topH = Math.max(0, c - p.gap / 2);
  const botY = c + p.gap / 2;
  p.top.style.transform = `translate(${p.x}px, 0px)`;
  p.top.style.height = topH + 'px';
  p.bottom.style.transform = `translate(${p.x}px, ${botY}px)`;
  p.bottom.style.height = Math.max(0, h - botY) + 'px';
}

function spawnToken(def, x, center) {
  const el = document.createElement('div');
  el.className = 'flappy-token';
  el.textContent = def.emoji;
  document.body.appendChild(el);
  flappy.tokens.push({ el, x: x + PIPE_SPACING * 0.5, y: center, def, bob: Math.random() * 6 });
}

function spawnDrip(w) {
  const el = document.createElement('div');
  el.className = 'flappy-drip';
  document.body.appendChild(el);
  flappy.drips.push({ el, x: birdX() + 120 + Math.random() * (w - birdX() - 160), y: -20, vy: 220 + Math.random() * 160 });
}

// ---- Power-ups ------------------------------------------------------------------

function grabPower(def) {
  if (def.key === 'shield') flappy.shield = true;
  else flappy.powerT[def.key] = def.secs;
  ArcadeKit.burst(birdX() + BIRD_SIZE / 2, flappy.y + BIRD_SIZE / 2, { n: 14, emoji: def.emoji, speed: 260, life: 0.7 });
  spawnPopLabel(birdX() + BIRD_SIZE / 2, flappy.y - 6, def.emoji + ' ' + def.label, 'golden');
}

// ---- Crash / run end ------------------------------------------------------------

function crashBird() {
  if (flappy.phase !== 'flying') return;
  if (flappy.invT > 0) return; // grace window after a shield save
  if (flappy.shield) { // shrug it off once, with a moment of mercy so you fly clear
    flappy.shield = false;
    flappy.invT = 0.9;
    ArcadeKit.kick(9, 240);
    ArcadeKit.burst(birdX() + BIRD_SIZE / 2, flappy.y + BIRD_SIZE / 2, { n: 18, color: '#7fd4ff', speed: 320 });
    spawnPopLabel(birdX() + BIRD_SIZE / 2, flappy.y, '🛡️ saved!', 'golden');
    flappy.vy = FLAP_VY * 0.8;
    return;
  }
  flappy.phase = 'over';
  flappy.fever.reset();
  ArcadeKit.kick(16, 420);
  ArcadeKit.burst(birdX() + BIRD_SIZE / 2, flappy.y + BIRD_SIZE / 2, { n: 26, emoji: '💥', speed: 360, life: 0.8 });
  birdEl.style.opacity = '0.35';
  if (flappy.gates > flappy.best) flappy.best = flappy.gates;
  ArcadeKit.saveBest('flappy', flappy.cfg.key, flappy.gates);
  showGameOver();
}

function showGameOver() {
  const cuts = [8, 16, 24];
  let m = ArcadeKit.medal(flappy.gates, cuts);
  if (flappy.stormCleared) m = { emoji: '🌩️', label: 'STORM FLOWN' };
  const best = ArcadeKit.bests('flappy')[flappy.cfg.key] || flappy.gates;
  flappyOver.innerHTML =
    `<div class="fo-card">
       <div class="fo-medal">${m.emoji || '🐤'}</div>
       <div class="fo-title">${m.label || 'DOWN YOU GO'}</div>
       <div class="fo-stat">${flappy.gates} gates · ${FLAPPY_BIOMES[flappy.biome].emoji} ${FLAPPY_BIOMES[flappy.biome].name}</div>
       <div class="fo-best">best (${flappy.cfg.name}) · ${best}</div>
       <div class="fo-go">flap to fly again · Esc/switch to quit</div>
     </div>`;
  flappyOver.classList.add('on');
}

// ---- Input ----------------------------------------------------------------------

function flap() {
  if (!flappyActive()) return;
  if (flappy.phase === 'tier') return;
  if (flappy.phase === 'over') { newRun(false); return; }
  if (flappy.phase === 'ready') flappy.phase = 'flying';
  if (flappy.phase !== 'flying') return;
  flappy.vy = FLAP_VY;
  flappy._flapT = 1; // drives the wing sweep, decays in step
  ArcadeKit.burst(birdX() - 6, flappy.y + BIRD_SIZE * 0.7, { n: 3, color: 'rgba(255,210,140,0.9)', speed: 120, life: 0.35, gravity: 120, size: 5 });
}

// ---- Per-frame ------------------------------------------------------------------

function stepFlappy(dt, w, h) {
  if (flappy.phase === 'tier') return;

  // idle bob while waiting for the first flap
  if (flappy.phase === 'ready') {
    flappy.y = h * 0.42 + Math.sin(performance.now() / 300) * 10;
    if (flappy._flapT) flappy._flapT = Math.max(0, flappy._flapT - dt * 4);
    drawBird();
    return;
  }
  if (flappy.phase === 'over') {
    // gentle drift-down of the dead bird
    flappy.vy += GRAVITY * 0.4 * dt;
    flappy.y = Math.min(h - BIRD_SIZE, flappy.y + flappy.vy * dt);
    drawBird();
    return;
  }

  const b = FLAPPY_BIOMES[flappy.biome];
  flappy.t += dt;
  if (flappy._flapT) flappy._flapT = Math.max(0, flappy._flapT - dt * 4);
  if (flappy.invT > 0) {
    flappy.invT -= dt;
    birdEl.style.opacity = (Math.floor(flappy.t * 20) % 2) ? '0.4' : '1';
    if (flappy.invT <= 0) birdEl.style.opacity = '';
  }

  const slow = flappy.powerT.slow > 0 ? 0.5 : 1;
  const grav = GRAVITY * (flappy.powerT.float > 0 ? 0.5 : 1);
  for (const k of ['slow', 'float', 'x2']) if (flappy.powerT[k] > 0) flappy.powerT[k] -= dt;

  // physics + wind
  flappy.vy += grav * dt;
  if (b.rules.windAmp) flappy.vy += b.rules.windAmp * Math.sin(flappy.t * b.rules.windFreq) * flappy.cfg.wind * dt;
  flappy.y += flappy.vy * dt * slow;
  drawBird();

  const speed = curSpeed() * slow;
  flappy.dist += speed * dt;

  // storm lightning
  if (b.key === 'storm') {
    flappy.flashT -= dt;
    if (flappy.flashT <= 0) {
      flappy.flashT = 2 + Math.random() * 3;
      if (flappy.parallax) {
        flappy.parallax.flash.classList.remove('zap'); void flappy.parallax.flash.offsetWidth;
        flappy.parallax.flash.classList.add('zap');
      }
      flappy.vy += (Math.random() - 0.5) * 300; // a buffeting gust with the strike
    }
  }

  // parallax scroll
  if (flappy.parallax) {
    flappy.parallax.far.style.transform = `translateX(${(-(flappy.dist * 0.12) % 400).toFixed(1)}px)`;
    flappy.parallax.near.style.transform = `translateX(${(-(flappy.dist * 0.32) % 300).toFixed(1)}px)`;
  }

  // spawn pipes
  const last = flappy.pipes[flappy.pipes.length - 1];
  if (!last || last.x < w - PIPE_SPACING) spawnPipe(w, h);

  // drips
  if (b.rules.drip) {
    flappy._dripT = (flappy._dripT || 1.2) - dt;
    if (flappy._dripT <= 0) { spawnDrip(w); flappy._dripT = 0.9 + Math.random() * 1.1; }
  }

  const bx = birdX() + BIRD_SIZE / 2;
  const by = flappy.y + BIRD_SIZE / 2;

  // pipes: move, score, collide
  for (let i = flappy.pipes.length - 1; i >= 0; i--) {
    const p = flappy.pipes[i];
    p.x -= speed * dt;
    positionPipe(p, h);

    if (p.x + PIPE_W < -30) { p.top.remove(); p.bottom.remove(); flappy.pipes.splice(i, 1); continue; }

    const c = pipeCenter(p);
    if (!p.passed && p.x + PIPE_W < bx - BIRD_R) {
      p.passed = true;
      flappy.gates++;
      // clean-thread near-miss bonus
      const clearance = Math.min(Math.abs(by - (c - p.gap / 2)), Math.abs(by - (c + p.gap / 2)));
      const clean = clearance < NEARMISS;
      flappy.fever.hit(clean ? 2 : 1);
      let worth = storm.perFlyer * flappy.cfg.mult * (p.golden ? GOLDEN_MULTIPLIER : 1);
      worth = Math.round(worth * flappy.fever.mult * (flappy.powerT.x2 > 0 ? 2 : 1));
      storm.caught += worth;
      const tag = (p.golden ? '✨ ' : '') + (clean ? 'WHOOSH +' : '+') + fmt.format(worth);
      spawnPopLabel(bx + 30, c, tag, p.golden || clean ? 'golden' : '');
      if (clean) ArcadeKit.burst(bx + 20, by, { n: 6, color: '#fde047', speed: 200, life: 0.5, size: 6 });
      checkBiome(h);
      updateStormHud();
    }

    // collision (only the near pipe matters)
    if (bx + BIRD_R > p.x && bx - BIRD_R < p.x + PIPE_W) {
      if (by - BIRD_R < c - p.gap / 2 || by + BIRD_R > c + p.gap / 2) { crashBird(); if (flappy.phase === 'over') return; }
    }
  }

  // tokens
  for (let i = flappy.tokens.length - 1; i >= 0; i--) {
    const t = flappy.tokens[i];
    t.x -= speed * dt;
    t.bob += dt * 4;
    t.el.style.transform = `translate(${t.x}px, ${(t.y + Math.sin(t.bob) * 6).toFixed(1)}px)`;
    if (t.x < -50) { t.el.remove(); flappy.tokens.splice(i, 1); continue; }
    if (Math.abs(t.x - bx) < 30 && Math.abs((t.y) - by) < 34) {
      grabPower(t.def); t.el.remove(); flappy.tokens.splice(i, 1);
    }
  }

  // drips
  for (let i = flappy.drips.length - 1; i >= 0; i--) {
    const d = flappy.drips[i];
    d.y += d.vy * dt;
    d.x -= speed * 0.15 * dt;
    d.el.style.transform = `translate(${d.x}px, ${d.y}px)`;
    if (d.y > h + 20) { d.el.remove(); flappy.drips.splice(i, 1); continue; }
    if (Math.abs(d.x - bx) < 16 && Math.abs(d.y - by) < 20) { crashBird(); if (flappy.phase === 'over') return; }
  }

  // floor / ceiling
  if (flappy.y > h - BIRD_SIZE || flappy.y < -50) { crashBird(); return; }
}

function checkBiome(h) {
  // advance biome by cumulative gate count
  let ni = flappy.biome;
  for (let i = FLAPPY_BIOMES.length - 1; i >= 0; i--) {
    if (flappy.gates >= FLAPPY_BIOMES[i].at) { ni = i; break; }
  }
  if (ni !== flappy.biome) {
    flappy.biome = ni;
    applyBiome(ni, false);
    const b = FLAPPY_BIOMES[ni];
    spawnPopLabel(window.innerWidth / 2, h * 0.3, `${b.emoji} ${b.name}`, 'big');
    ArcadeKit.kick(10, 300);
    // reaching the Caverns on FLYER+ unlocks STORMCHASER
    if (b.key === 'caverns' && flappy.cfg.key !== 'fledgling') {
      try { localStorage.setItem('nugFlappyCaverns', '1'); } catch (e) { /* ok */ }
    }
  }
  // finale: survive deep into the storm
  if (!flappy.stormCleared && flappy.gates >= STORM_CLEAR_GATES) {
    flappy.stormCleared = true;
    try { localStorage.setItem('nugFlappyStorm', '1'); } catch (e) { /* ok */ }
    spawnPopLabel(window.innerWidth / 2, h * 0.42, '🌩️ YOU FLEW THE STORM', 'big');
    ArcadeKit.kick(20, 600);
    ArcadeKit.burst(window.innerWidth / 2, h * 0.42, { n: 40, emoji: '⚡', speed: 460, life: 1.0 });
  }
}

// ---- Wiring ---------------------------------------------------------------------

window.addEventListener('mousedown', (e) => {
  if (!flappyActive()) return;
  if (e.target.closest('.storm-hud') || e.target.closest('.ak-tier')) return;
  flap();
});
window.addEventListener('keydown', (e) => {
  if (!flappyActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'Space' || e.code === 'ArrowUp') { flap(); e.preventDefault(); }
});
window.addEventListener('touchstart', (e) => {
  if (!flappyActive()) return;
  if (e.target.closest('.storm-hud') || e.target.closest('.ak-tier')) return;
  flap();
}, { passive: true });

// Test/debug hook for the smoke harness.
window.flappyDebug = function (opts) {
  opts = opts || {};
  if (opts.tier) { flappy.cfg = FLAPPY_TIERS.find((t) => t.key === opts.tier) || flappy.cfg; }
  if (opts.pick && flappy.tierPick) { flappy.tierPick.close(); flappy.tierPick = null; newRun(true); }
  if (opts.gates != null) { flappy.gates = opts.gates; checkBiome(window.innerHeight); }
  if (opts.flap) flap();
  if (opts.crash) { flappy.phase = 'flying'; flappy.shield = false; crashBird(); }
  return { phase: flappy.phase, gates: flappy.gates, biome: FLAPPY_BIOMES[flappy.biome].key,
    shield: flappy.shield, storm: flappy.stormCleared };
};
