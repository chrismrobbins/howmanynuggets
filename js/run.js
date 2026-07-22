// ---- Nugget Run -----------------------------------------------------------------
// The arcade's first *animated character*. Sprint the nugget runs along a
// late-night kitchen counter: jump ketchup bottles (space/↑/click), double-jump
// fry-box towers (he does a full flip), and slide under spatula gates (hold ↓).
// The rig is Rayman-style — floating sneakers and glove hands orbit the body on
// a phase-driven run cycle that speeds up with the game, the headband ribbons
// flutter, the eyes blink, dust puffs kick up off his heels, and when he eats
// an obstacle his limbs scatter with physics before reassembling.
// Distance banks 1 wisdom— er, 1 point per meter; golden mini-nugs are +20.

const runWorld = document.getElementById('runWorld');

const RUN_GROUND = 760;        // counter-top surface, viewBox units
const RUN_X = 380;             // where Sprint stands on screen
const RUN_GRAVITY = 3000;      // px/s²
const RUN_JUMP_V = -1150;      // first jump (apex ≈ 210px — clears ketchup with room)
const RUN_JUMP2_V = -1050;     // double jump (combined reach ≈ 390px — clears fries easily)
const RUN_START_SPEED = 340;   // px/s
const RUN_MAX_SPEED = 940;
const RUN_ACCEL = 13;          // px/s per second
const RUN_METER = 50;          // viewBox px per scored meter
const PICKUP_VALUE = 20;
const CRASH_SECS = 1.25;
const BODY_H = 96;             // standing hitbox height
const SLIDE_H = 46;            // sliding hitbox height
const HALF_W = 30;             // hitbox half-width

// Obstacle catalog. `bar` obstacles only block a band above the ground
// (slide under them); solid ones block from the ground up to `h`; `pit` is a
// gap in the counter you FALL into unless you're airborne over it.
const RUN_OBS = {
  ketchup: { w: 52,  h: 130 },
  fries:   { w: 76,  h: 235 },
  gate:    { w: 150, bar: [68, 106] },
  flame:   { w: 60,  h: 150, fire: true },   // grill: jet of flame, jump it
  pit:     { w: 132, pit: true },            // a gap — jump or fall in
};
// legacy alias kept for the debug hook
const RUN_OBSTACLES = [RUN_OBS.ketchup, RUN_OBS.fries, RUN_OBS.gate].map((o, i) =>
  ({ type: ['ketchup', 'fries', 'gate'][i], ...o }));

// ---- THE OVEN RELIGHT additions -------------------------------------------------
// Biomes advance by distance (meters). `obs` = obstacle types that can spawn.
const RUN_BIOMES = [
  { at: 0,    key: 'counter', name: 'The Counter', emoji: '🍟', wall: ['#101f30', '#182c40'], counter: ['#8a5f38', '#66412a'], tint: 'rgba(0,0,0,0)',        obs: ['ketchup', 'fries', 'gate'], speed: 1.0 },
  { at: 500,  key: 'freezer', name: 'The Freezer', emoji: '🧊', wall: ['#0b2233', '#12405a'], counter: ['#7fb6cc', '#4d8aa3'], tint: 'rgba(120,200,240,0.14)', obs: ['ketchup', 'gate', 'pit'],    speed: 1.06 },
  { at: 1100, key: 'grill',   name: 'The Grill',   emoji: '🔥', wall: ['#2a0f0a', '#4a1810'], counter: ['#3a2018', '#241010'], tint: 'rgba(255,90,30,0.14)',  obs: ['flame', 'fries', 'gate'],   speed: 1.13 },
  { at: 1800, key: 'alley',   name: 'The Alley',   emoji: '🌃', wall: ['#0a0f1e', '#141c33'], counter: ['#2a2f3a', '#181c26'], tint: 'rgba(40,30,90,0.18)',   obs: ['ketchup', 'pit', 'gate'],   speed: 1.2 },
  { at: 2600, key: 'pier',    name: 'THE PIER',    emoji: '🌊', wall: ['#05101f', '#0a1f38'], counter: ['#3a2a18', '#241a10'], tint: 'rgba(30,60,110,0.2)',   obs: ['pit', 'gate', 'flame'],     speed: 1.28 },
];
const RUN_PIER_M = 2600; // reaching the pier is the finale

const RUN_TIERS = [
  { key: 'jog',     emoji: '🚶', name: 'JOG',         mult: 1, start: 300, accel: 10, density: 0.85, blurb: 'a gentle lap' },
  { key: 'sprint',  emoji: '🏃', name: 'SPRINT',      mult: 2, start: 340, accel: 13, density: 1.0,  blurb: 'the real run' },
  { key: 'gauntlet', emoji: '💨', name: 'THE GAUNTLET', mult: 3, start: 420, accel: 17, density: 1.25, blurb: 'no brakes, no mercy',
    lockNote: 'reach The Alley on SPRINT' },
];
function runGauntletUnlocked() {
  try { return localStorage.getItem('nugRunGauntlet') === '1'; } catch (e) { return false; }
}
// Read by arcade.js street dialogue (Sprint 6): did they run out onto the pier?
function runReachedPier() {
  try { return localStorage.getItem('nugRunPier') === '1'; } catch (e) { return false; }
}

const RUN_POWERS = [
  { key: 'shield', emoji: '🛡️', label: 'SHIELD', secs: 0 },   // one free crash
  { key: 'magnet', emoji: '🧲', label: 'MAGNET', secs: 7 },
  { key: 'dash',   emoji: '🚀', label: 'ROCKET',  secs: 3 },   // invincible burst
];
const RUN_HEARTS = 3;
const DASH_SECS = 0.5, DASH_COOLDOWN = 2.2; // manual dash

const run = {
  on: false,
  built: false,
  // motion state
  phase: 0,          // run-cycle phase (rad)
  speed: RUN_START_SPEED,
  elapsed: 0,        // seconds this run (drives the speed ramp)
  dist: 0,           // total distance in viewBox px (never resets mid-session)
  banked: 0,         // meters banked into storm.caught
  y: 0,              // height above ground (positive = up)
  vy: 0,
  jumps: 0,          // jumps used since last grounded (max 2)
  flip: 0,           // remaining degrees of double-jump flip
  flipRot: 0,
  sliding: false,
  crashed: false,
  crashT: 0,
  puffT: 0,
  // world entities
  obstacles: [],     // { el, x, def }
  pickups: [],       // { el, x, h, taken }
  puffs: [],         // { el, x, y, t }
  parts: [],         // scattered limbs during a crash { el, x, y, vx, vy, rot, vr }
  nextObstIn: 500,   // px of distance until the next obstacle spawns
  refs: null,
  // ---- OVEN RELIGHT state (run.phase is the RIG cycle — game state is run.stage) ----
  stage: 'idle',     // 'idle' | 'tier' | 'running' | 'over'
  cfg: RUN_TIERS[1],
  hearts: RUN_HEARTS,
  biome: 0,
  inv: 0,            // invulnerability seconds (shield save / dash)
  powerT: { magnet: 0, dash: 0 },
  shield: false,
  dashT: 0, dashCd: 0,
  tokens: [],        // { el, x, h, def, taken }
  speedLines: [],    // { el, x, y, t }
  best: 0,
  scoreBanked: 0,    // score (meters × tier mult) banked into storm.caught
  pierDone: false,
  tierPick: null,
  slLast: 0,
};

function runActive() {
  return storm.mode === 'run' && storm.running;
}

function runTally() {
  if (run.stage === 'tier') return '🏃 choose your pace…';
  const b = RUN_BIOMES[run.biome];
  const hearts = '❤️'.repeat(Math.max(0, run.hearts)) + '🖤'.repeat(Math.max(0, RUN_HEARTS - run.hearts));
  return `${b.emoji} ${b.name} · ${fmt.format(run.banked)}m · ${hearts}`;
}

// ---- Scene ------------------------------------------------------------------------

function buildRunScene() {
  if (run.built) return;
  run.built = true;

  // Far-layer window stars, fixed at build time.
  let winStars = '';
  for (let i = 0; i < 14; i++) {
    winStars += `<circle cx="${960 + Math.random() * 330}" cy="${170 + Math.random() * 240}"
      r="${(0.8 + Math.random()).toFixed(1)}" fill="#cfe0ff" opacity="${(0.4 + Math.random() * 0.6).toFixed(2)}"/>`;
  }

  runWorld.innerHTML = `
  <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" width="100%" height="100%"
       aria-label="A nugget with sneakers sprinting along a kitchen counter at night">
    <defs>
      <linearGradient id="runWall" x1="0" y1="0" x2="0" y2="1">
        <stop id="runWallA" offset="0" stop-color="#101f30"/><stop id="runWallB" offset="1" stop-color="#182c40"/>
      </linearGradient>
      <linearGradient id="runWinSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0a1526"/><stop offset="1" stop-color="#1e3454"/>
      </linearGradient>
      <linearGradient id="runCounterTop" x1="0" y1="0" x2="0" y2="1">
        <stop id="runCounterA" offset="0" stop-color="#8a5f38"/><stop id="runCounterB" offset="1" stop-color="#66412a"/>
      </linearGradient>
      <linearGradient id="runKetchup" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d24034"/><stop offset="1" stop-color="#9c2318"/>
      </linearGradient>
      <linearGradient id="runCarton" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d8433a"/><stop offset="1" stop-color="#b02c24"/>
      </linearGradient>
      <radialGradient id="runGlow">
        <stop offset="0" stop-color="rgba(255,190,100,0.14)"/>
        <stop offset="1" stop-color="rgba(255,190,100,0)"/>
      </radialGradient>
      <pattern id="runTiles" width="90" height="90" patternUnits="userSpaceOnUse">
        <rect width="90" height="90" fill="none"/>
        <path d="M0,0 H90 M0,0 V90" stroke="rgba(255,255,255,0.035)" stroke-width="2"/>
      </pattern>
    </defs>

    <!-- wall -->
    <rect width="1600" height="${RUN_GROUND}" fill="url(#runWall)"/>
    <rect width="1600" height="${RUN_GROUND}" fill="url(#runTiles)"/>

    <!-- far parallax: window, shelf with jars, hanging pan (tiles every 1600) -->
    <g id="runFar">
      <g id="runFarA">
        <g>
          <rect x="920" y="130" width="410" height="330" rx="14" fill="url(#runWinSky)"
                stroke="#233850" stroke-width="14"/>
          <line x1="1125" y1="140" x2="1125" y2="452" stroke="#233850" stroke-width="10"/>
          <line x1="928" y1="296" x2="1322" y2="296" stroke="#233850" stroke-width="10"/>
          ${winStars}
          <circle cx="1250" cy="210" r="26" fill="#dfe8f7" opacity="0.9"/>
          <circle cx="1240" cy="204" r="6" fill="rgba(170,190,220,0.7)"/>
          <rect x="110" y="270" width="480" height="14" rx="6" fill="#243a54"/>
          <rect x="150" y="200" width="52" height="70" rx="10" fill="#1c2f47"/>
          <rect x="230" y="216" width="44" height="54" rx="9" fill="#1c2f47"/>
          <rect x="300" y="186" width="60" height="84" rx="11" fill="#1c2f47"/>
          <circle cx="700" cy="200" r="52" fill="#152840"/>
          <rect x="694" y="90" width="12" height="70" rx="5" fill="#152840"/>
        </g>
      </g>
    </g>

    <!-- mid parallax: countertop props in silhouette (tiles every 1000) -->
    <g id="runMid"></g>

    <!-- warm under-cabinet light pooling on the counter -->
    <ellipse cx="330" cy="${RUN_GROUND}" rx="330" ry="95" fill="url(#runGlow)"/>
    <ellipse cx="1000" cy="${RUN_GROUND}" rx="380" ry="100" fill="url(#runGlow)"/>
    <ellipse cx="1520" cy="${RUN_GROUND}" rx="280" ry="85" fill="url(#runGlow)"/>

    <!-- counter -->
    <rect y="${RUN_GROUND}" width="1600" height="46" fill="url(#runCounterTop)"/>
    <rect y="${RUN_GROUND}" width="1600" height="4" fill="#a97e50"/>
    <rect y="${RUN_GROUND + 46}" width="1600" height="94" fill="#33241a"/>
    <g id="runGround"></g>

    <!-- world entities -->
    <g id="runObs"></g>
    <g id="runPicks"></g>
    <g id="runTokens"></g>
    <g id="runFxLayer"></g>

    <!-- biome tint wash + rival + speed lines -->
    <rect id="runTint" width="1600" height="900" fill="rgba(0,0,0,0)" pointer-events="none"/>
    <g id="runRival" transform="translate(-560,0)" opacity="0">
      <ellipse cx="0" cy="772" rx="96" ry="18" fill="rgba(0,0,0,0.4)"/>
      <circle cx="0" cy="686" r="94" fill="#3a2a14"/>
      <circle cx="0" cy="686" r="94" fill="none" stroke="#12100a" stroke-width="7"/>
      <circle cx="-30" cy="664" r="15" fill="#ff5a3c"/><circle cx="30" cy="664" r="15" fill="#ff5a3c"/>
      <circle cx="-30" cy="666" r="6" fill="#2a0d05"/><circle cx="30" cy="666" r="6" fill="#2a0d05"/>
      <path d="M-44,712 Q0,684 44,712" fill="none" stroke="#12100a" stroke-width="7" stroke-linecap="round"/>
    </g>
    <g id="runSpeed"></g>

    <!-- SPRINT the nugget -->
    <g id="runner">
      <ellipse id="runShadow" cx="0" cy="8" rx="46" ry="9" fill="rgba(0,0,0,0.35)"/>
      <g id="runAll">
        <g id="runFootB"><rect x="-15" y="-17" width="34" height="15" rx="7" fill="#b13c30"/>
          <rect x="-17" y="-6" width="40" height="7" rx="3.5" fill="#d9d2c2"/></g>
        <g id="runHandB"><circle r="10" fill="#d9d2c2"/></g>
        <g id="runBody">
          <path id="runRibbons" d="" fill="none" stroke="#d84a3a" stroke-width="6" stroke-linecap="round"/>
          <image href="nugget.png" x="-48" y="-100" width="96" height="96"/>
          <path d="M-36,-76 Q0,-93 36,-76" fill="none" stroke="#d84a3a" stroke-width="11" stroke-linecap="round"/>
          <circle cx="34" cy="-78" r="6" fill="#c03d2e"/>
          <g transform="translate(18,-60)"><g class="run-blink">
            <ellipse cx="-9" cy="0" rx="7" ry="8.5" fill="#fdfdf8"/>
            <ellipse cx="11" cy="0" rx="7" ry="8.5" fill="#fdfdf8"/>
            <circle cx="-6.5" cy="1" r="3" fill="#23232b"/>
            <circle cx="13.5" cy="1" r="3" fill="#23232b"/>
            <circle cx="-5.5" cy="-0.5" r="1" fill="#fff"/>
            <circle cx="14.5" cy="-1.5" r="1" fill="#fff"/>
          </g></g>
        </g>
        <g id="runFootF"><rect x="-15" y="-17" width="34" height="15" rx="7" fill="#d84a3a"/>
          <rect x="-17" y="-6" width="40" height="7" rx="3.5" fill="#f2ece2"/></g>
        <g id="runHandF"><circle r="10" fill="#f2ece2"/></g>
      </g>
    </g>
  </svg>`;

  // Mid-layer props: toaster, plant, shakers — dark shapes standing on the counter.
  const mid = runWorld.querySelector('#runMid');
  const midProps = `
    <path d="M150,${RUN_GROUND} v-64 q0,-18 18,-18 h86 q18,0 18,18 v64 Z" fill="#0f2033"/>
    <rect x="176" y="${RUN_GROUND - 92}" width="18" height="12" rx="3" fill="#0f2033"/>
    <rect x="206" y="${RUN_GROUND - 92}" width="18" height="12" rx="3" fill="#0f2033"/>
    <path d="M585,${RUN_GROUND} l10,-52 h48 l10,52 Z" fill="#0d1e30"/>
    <ellipse cx="602" cy="${RUN_GROUND - 78}" rx="24" ry="15" fill="#0d1e30" transform="rotate(-32 602 ${RUN_GROUND - 78})"/>
    <ellipse cx="646" cy="${RUN_GROUND - 82}" rx="24" ry="15" fill="#0d1e30" transform="rotate(24 646 ${RUN_GROUND - 82})"/>
    <ellipse cx="624" cy="${RUN_GROUND - 96}" rx="14" ry="22" fill="#0d1e30"/>
    <path d="M850,${RUN_GROUND} v-40 q0,-14 12,-14 q12,0 12,14 v40 Z" fill="#101f30"/>
    <path d="M886,${RUN_GROUND} v-32 q0,-12 10,-12 q10,0 10,12 v32 Z" fill="#101f30"/>`;
  mid.innerHTML = `<g id="runMidA">${midProps}</g>`;

  // Ground layer: wood-grain strokes + drawer handles (tiles every 400).
  const ground = runWorld.querySelector('#runGround');
  const grain = `
    <rect x="30" y="${RUN_GROUND + 14}" width="120" height="3" rx="1.5" fill="rgba(30,15,5,0.25)"/>
    <rect x="210" y="${RUN_GROUND + 30}" width="90" height="3" rx="1.5" fill="rgba(30,15,5,0.2)"/>
    <rect x="320" y="${RUN_GROUND + 10}" width="60" height="3" rx="1.5" fill="rgba(30,15,5,0.22)"/>
    <rect x="140" y="${RUN_GROUND + 88}" width="120" height="10" rx="5" fill="#241812"/>`;
  ground.innerHTML = `<g id="runGroundA">${grain}</g>`;

  // Second copies for seamless tiling.
  ['runFarA:1600', 'runMidA:1000', 'runGroundA:400'].forEach((spec) => {
    const [id, w] = spec.split(':');
    const a = runWorld.querySelector('#' + id);
    const b = a.cloneNode(true);
    b.removeAttribute('id');
    b.setAttribute('transform', `translate(${w},0)`);
    a.parentNode.appendChild(b);
  });

  run.refs = {
    far: runWorld.querySelector('#runFar'),
    mid: runWorld.querySelector('#runMid'),
    ground: runWorld.querySelector('#runGround'),
    obs: runWorld.querySelector('#runObs'),
    picks: runWorld.querySelector('#runPicks'),
    fx: runWorld.querySelector('#runFxLayer'),
    runner: runWorld.querySelector('#runner'),
    all: runWorld.querySelector('#runAll'),
    shadow: runWorld.querySelector('#runShadow'),
    body: runWorld.querySelector('#runBody'),
    footF: runWorld.querySelector('#runFootF'),
    footB: runWorld.querySelector('#runFootB'),
    handF: runWorld.querySelector('#runHandF'),
    handB: runWorld.querySelector('#runHandB'),
    ribbons: runWorld.querySelector('#runRibbons'),
    tokens: runWorld.querySelector('#runTokens'),
    tint: runWorld.querySelector('#runTint'),
    rival: runWorld.querySelector('#runRival'),
    speed: runWorld.querySelector('#runSpeed'),
    wallA: runWorld.querySelector('#runWallA'),
    wallB: runWorld.querySelector('#runWallB'),
    counterA: runWorld.querySelector('#runCounterA'),
    counterB: runWorld.querySelector('#runCounterB'),
  };
}

function syncRun() {
  const active = runActive();
  if (active === run.on) return;
  run.on = active;
  runWorld.classList.toggle('active', active);
  if (active) {
    buildRunScene();
    runOpenTier();
  } else {
    if (run.tierPick) { run.tierPick.close(); run.tierPick = null; }
    run.stage = 'idle';
    clearRunWorld();
    hideRunOver();
  }
}

function runOpenTier() {
  run.stage = 'tier';
  hideRunOver();
  clearRunWorld();
  const tiers = RUN_TIERS.map((t) => t.key === 'gauntlet' && !runGauntletUnlocked() ? { ...t, locked: true } : t);
  run.tierPick = ArcadeKit.tierSelect({
    storeKey: 'run',
    title: '🏃 Set your pace',
    note: runGauntletUnlocked() ? 'the gauntlet is open · 1 · 2 · 3' : 'press 1 · 2 · 3 or click',
    tiers,
    onPick: (key, t) => { run.tierPick = null; run.cfg = t; runNewRun(); },
  });
}

function runNewRun() {
  run.stage = 'running';
  run.hearts = RUN_HEARTS;
  run.biome = 0;
  run.scoreBanked = 0;
  run.pierDone = false;
  run.inv = 0; run.shield = false;
  run.powerT = { magnet: 0, dash: 0 };
  run.dashT = 0; run.dashCd = 0;
  run.rivalX = -560; run._rivalKick = 0;
  resetRun(true);
  runApplyBiome(0, true);
  hideRunOver();
}

function resetRun(fullSession) {
  run.speed = run.cfg.start;
  run.elapsed = 0;
  run.y = 0; run.vy = 0;
  run.jumps = 0; run.flip = 0; run.flipRot = 0;
  run.sliding = false;
  run.crashed = false; run.crashT = 0;
  run.nextObstIn = 500;
  if (fullSession) { run.dist = 0; run.banked = 0; }
  reattachLimbs();
  clearRunWorld();
}

function clearRunWorld() {
  run.obstacles.forEach((o) => o.el.remove());
  run.pickups.forEach((p) => p.el.remove());
  run.puffs.forEach((p) => p.el.remove());
  (run.tokens || []).forEach((t) => t.el.remove());
  (run.speedLines || []).forEach((s) => s.el.remove());
  run.obstacles = []; run.pickups = []; run.puffs = []; run.parts = [];
  run.tokens = []; run.speedLines = [];
}

// ---- Biomes -------------------------------------------------------------------

function runApplyBiome(i, instant) {
  const b = RUN_BIOMES[i];
  const r = run.refs;
  if (!r) return;
  r.wallA.setAttribute('stop-color', b.wall[0]);
  r.wallB.setAttribute('stop-color', b.wall[1]);
  r.counterA.setAttribute('stop-color', b.counter[0]);
  r.counterB.setAttribute('stop-color', b.counter[1]);
  r.tint.setAttribute('fill', b.tint);
  r.tint.style.transition = instant ? 'none' : '';
  runWorld.style.background = b.wall[1]; // keep the slice-crop letterbox matching
}

function runCheckBiome() {
  let ni = run.biome;
  for (let i = RUN_BIOMES.length - 1; i >= 0; i--) {
    if (run.banked >= RUN_BIOMES[i].at) { ni = i; break; }
  }
  if (ni !== run.biome) {
    run.biome = ni;
    runApplyBiome(ni, false);
    const b = RUN_BIOMES[ni];
    const [px, py] = runToScreen(800, 300);
    spawnPopLabel(px, py, `${b.emoji} ${b.name}`, 'big');
    ArcadeKit.kick(9, 320);
    // reaching The Alley on SPRINT+ unlocks THE GAUNTLET
    if (b.key === 'alley' && run.cfg.key !== 'jog') { try { localStorage.setItem('nugRunGauntlet', '1'); } catch (e) { /* ok */ } }
  }
  // finale: run out onto the pier
  if (!run.pierDone && run.banked >= RUN_PIER_M) {
    run.pierDone = true;
    try { localStorage.setItem('nugRunPier', '1'); } catch (e) { /* ok */ }
    const [px, py] = runToScreen(800, 400);
    spawnPopLabel(px, py, '🌊 YOU MADE THE PIER', 'big');
    ArcadeKit.kick(18, 600);
    ArcadeKit.burst(window.innerWidth / 2, window.innerHeight * 0.45, { n: 34, emoji: '🌊', speed: 400, life: 0.9 });
  }
}

function runToScreen(x, y) {
  const w = window.innerWidth, h = window.innerHeight;
  const s = Math.max(w / 1600, h / 900);
  return [x * s + (w - 1600 * s) / 2, y * s + (h - 900 * s)];
}

// ---- Obstacles & pickups -------------------------------------------------------------

function obstacleSvg(def) {
  const g = document.createElementNS(SVG_NS, 'g');
  if (def.type === 'ketchup') {
    g.innerHTML = `
      <rect x="-24" y="-118" width="48" height="112" rx="14" fill="url(#runKetchup)"/>
      <rect x="-9" y="-136" width="18" height="22" fill="#9c2318"/>
      <rect x="-12" y="-147" width="24" height="13" rx="4" fill="#e8e2d4"/>
      <rect x="-17" y="-96" width="34" height="46" rx="7" fill="#f2ecdd"/>
      <circle cy="-73" r="9" fill="#c8362b"/>`;
  } else if (def.type === 'fries') {
    const carton = (y, s) => `
      <g transform="translate(0,${y}) scale(${s})">
        <path d="M-34,0 L-27,-86 Q-26,-96 -16,-96 L16,-96 Q26,-96 27,-86 L34,0 Z" fill="url(#runCarton)"/>
        <rect x="-13" y="-104" width="8" height="26" rx="4" fill="#f7c948" transform="rotate(-8)"/>
        <rect x="-2" y="-110" width="8" height="30" rx="4" fill="#ffd75e"/>
        <rect x="9" y="-104" width="8" height="26" rx="4" fill="#f7c948" transform="rotate(7)"/>
        <path d="M-30,-40 L30,-40 L27,-70 L-27,-70 Z" fill="#e8b93e" opacity="0.25"/>
      </g>`;
    g.innerHTML = carton(0, 1.1) + carton(-112, 0.95);
  } else if (def.type === 'flame') { // a jet of grill flame — jump it
    g.innerHTML = `
      <ellipse cx="0" cy="-4" rx="30" ry="8" fill="#7a2a0a"/>
      <path d="M0,-2 C-30,-46 -16,-84 0,-150 C16,-84 30,-46 0,-2 Z" fill="#ff7a1a"/>
      <path d="M0,-10 C-16,-48 -9,-72 0,-124 C9,-72 16,-48 0,-10 Z" fill="#ffd23a"/>
      <path d="M0,-18 C-7,-44 -4,-60 0,-92 C4,-60 7,-44 0,-18 Z" fill="#fff2b0"/>`;
  } else if (def.type === 'pit') { // a gap in the counter — jump or fall in
    g.innerHTML = `
      <rect x="-66" y="-4" width="132" height="150" fill="#04060c"/>
      <rect x="-66" y="-6" width="132" height="7" rx="3" fill="#1a1206"/>
      <rect x="-66" y="-6" width="8" height="150" fill="#241812"/>
      <rect x="58" y="-6" width="8" height="150" fill="#241812"/>`;
  } else { // spatula gate
    g.innerHTML = `
      <rect x="-73" y="-104" width="10" height="104" rx="4" fill="#5c6875"/>
      <rect x="63" y="-104" width="10" height="104" rx="4" fill="#5c6875"/>
      <rect x="-78" y="-100" width="60" height="10" rx="5" fill="#8b93a3"/>
      <rect x="-20" y="-104" width="98" height="20" rx="8" fill="#aab4c2"/>
      <rect x="-6" y="-99" width="70" height="3.5" rx="1.75" fill="#7e8a99"/>
      <rect x="-6" y="-92" width="70" height="3.5" rx="1.75" fill="#7e8a99"/>`;
  }
  return g;
}

function spawnObstacle() {
  const biome = RUN_BIOMES[run.biome];
  const type = biome.obs[Math.floor(Math.random() * biome.obs.length)];
  const def = { type, ...RUN_OBS[type] };
  const el = obstacleSvg(def);
  run.refs.obs.appendChild(el);
  run.obstacles.push({ el, x: 1750, def });
  // Reaction-time-scaled gap, tightened by tier density.
  run.nextObstIn = (run.speed * 0.62 + 230 + Math.random() * 380) / run.cfg.density;
  // Fill the gap: usually a golden arc, sometimes a power token.
  const roll = Math.random();
  if (roll < 0.42) spawnPickupArc(1750 + run.nextObstIn * 0.55);
  else if (roll < 0.56) runSpawnPower(1750 + run.nextObstIn * 0.5);
}

// ---- Power-ups ----------------------------------------------------------------

function runSpawnPower(atX) {
  const def = RUN_POWERS[Math.floor(Math.random() * RUN_POWERS.length)];
  const el = document.createElementNS(SVG_NS, 'text');
  el.setAttribute('font-size', '46');
  el.setAttribute('text-anchor', 'middle');
  el.setAttribute('class', 'run-token');
  el.textContent = def.emoji;
  run.refs.tokens.appendChild(el);
  run.tokens.push({ el, x: atX, h: 120 + Math.random() * 90, def, taken: false });
}

function runGrabPower(def) {
  if (def.key === 'shield') run.shield = true;
  else run.powerT[def.key] = def.secs;
  if (def.key === 'dash') run.inv = Math.max(run.inv, def.secs); // rocket = invincible sprint
  const [px, py] = runToScreen(RUN_X, RUN_GROUND - 130);
  spawnPopLabel(px, py, def.emoji + ' ' + def.label, 'golden');
  ArcadeKit.burst(px, py, { n: 12, emoji: def.emoji, speed: 240 });
}

// ---- Manual dash (F / Shift / touch button) ----
function runDoDash() {
  if (run.stage !== 'running' || run.crashed || run.dashCd > 0) return;
  run.dashT = DASH_SECS;
  run.dashCd = DASH_COOLDOWN;
  run.inv = Math.max(run.inv, DASH_SECS);
  const [px, py] = runToScreen(RUN_X, RUN_GROUND - 60);
  ArcadeKit.burst(px, py, { n: 10, color: '#7fd4ff', speed: 320, life: 0.4 });
}

function spawnPickupArc(atX) {
  const high = Math.random() < 0.3;
  for (let i = 0; i < 4; i++) {
    const el = document.createElementNS(SVG_NS, 'image');
    el.setAttribute('href', 'nugget.png');
    el.setAttribute('width', '30');
    el.setAttribute('height', '30');
    el.setAttribute('class', 'run-gold');
    run.refs.picks.appendChild(el);
    const h = high ? 205 : 70 + Math.sin((i / 3) * Math.PI) * 85;
    run.pickups.push({ el, x: atX + i * 52, h, taken: false });
  }
}

function spawnPuff(x, y, big) {
  const el = document.createElementNS(SVG_NS, 'circle');
  el.setAttribute('fill', 'rgba(216,190,150,0.45)');
  run.refs.fx.appendChild(el);
  run.puffs.push({ el, x, y, t: 0, big: !!big });
}

// ---- Crash: the limbs go flying ------------------------------------------------------

function crashRun() {
  if (run.crashed) return;
  if (run.inv > 0) return;            // invincible (dash / rocket)
  if (run.shield) {                   // one free save
    run.shield = false;
    run.inv = 0.85;
    const [sx0, sy0] = runToScreen(RUN_X, RUN_GROUND - run.y - 70);
    spawnPopLabel(sx0, sy0, '🛡️ saved!', 'golden');
    ArcadeKit.burst(sx0, sy0, { n: 14, color: '#7fd4ff', speed: 300 });
    return;
  }
  run.crashed = true;
  run.crashT = CRASH_SECS;
  run.sliding = false;
  run.hearts--;
  runRivalLunge();
  ArcadeKit.kick(13, 340);
  const [px, py] = [RUN_X, RUN_GROUND - run.y - 60];
  const sx = px * (window.innerWidth / 1600 > window.innerHeight / 900
    ? window.innerWidth / 1600 : window.innerHeight / 900);
  spawnPopLabel(Math.min(sx, window.innerWidth - 80), Math.max(60, py * 0.7), '💥 faceplant');
  // Limbs become physics particles relative to the runner group.
  run.parts = [run.refs.footF, run.refs.footB, run.refs.handF, run.refs.handB].map((el) => ({
    el,
    x: 0, y: -run.y - 30,
    vx: -60 - Math.random() * 220,
    vy: -320 - Math.random() * 380,
    rot: 0,
    vr: (Math.random() - 0.5) * 900,
  }));
}

function reattachLimbs() {
  const r = run.refs;
  if (!r) return;
  [r.footF, r.footB, r.handF, r.handB, r.body, r.all].forEach((el) =>
    el.setAttribute('transform', ''));
}

// ---- The rival: a batter-boulder that looms closer with each lost heart ----
function runRivalLunge() { run._rivalKick = 0.5; } // brief surge on a crash
function runUpdateRival(dt) {
  const r = run.refs; if (!r || !r.rival) return;
  const idx = 3 - Math.max(0, Math.min(3, run.hearts));
  let tx = [-560, -360, -180, 210][idx];
  if (run._rivalKick > 0) { run._rivalKick -= dt; tx += 40; } // lunge
  if (run.rivalX == null) run.rivalX = -560;
  run.rivalX += (tx - run.rivalX) * Math.min(1, dt * 4);
  r.rival.setAttribute('transform', `translate(${run.rivalX.toFixed(0)},0)`);
  r.rival.setAttribute('opacity', ([0, 0.55, 0.85, 1][idx]).toFixed(2));
}

// ---- Game over ----
function runGameOver() {
  run.stage = 'over';
  if (run.banked > run.best) run.best = run.banked;
  ArcadeKit.saveBest('run', run.cfg.key, run.banked);
  ArcadeKit.kick(20, 700);
  run.rivalX = 210; // the boulder catches up
  runShowOver();
}
function runShowOver() {
  const m = run.pierDone ? { emoji: '🌊', label: 'REACHED THE PIER' } : ArcadeKit.medal(run.banked, [500, 1100, 2600]);
  const best = ArcadeKit.bests('run')[run.cfg.key] || run.banked;
  let o = document.getElementById('runOver');
  if (!o) { o = document.createElement('div'); o.id = 'runOver'; o.className = 'run-over'; document.body.appendChild(o); }
  o.innerHTML =
    `<div class="ro-card">
       <div class="ro-medal">${m.emoji || '💥'}</div>
       <div class="ro-title">${m.label || 'WIPED OUT'}</div>
       <div class="ro-stat">${fmt.format(run.banked)} m · ${RUN_BIOMES[run.biome].emoji} ${RUN_BIOMES[run.biome].name}</div>
       <div class="ro-best">best (${run.cfg.name}) · ${fmt.format(best)}m</div>
       <div class="ro-go">jump to run again · switch to quit</div>
     </div>`;
  o.classList.add('on');
}
function hideRunOver() { const o = document.getElementById('runOver'); if (o) o.classList.remove('on'); }
function runRestart() { hideRunOver(); runNewRun(); }

// ---- Input -----------------------------------------------------------------------------

function runJump() {
  if (!runActive() || run.crashed) return;
  if (run.jumps >= 2) return;
  run.sliding = false;
  run.vy = run.jumps === 0 ? RUN_JUMP_V : RUN_JUMP2_V;
  if (run.jumps === 1) run.flip = 360; // the crowd-pleaser
  run.jumps++;
}

window.addEventListener('mousedown', (e) => {
  if (!runActive()) return;
  if (e.target.closest('.storm-hud') || e.target.closest('.ak-tier')) return;
  if (run.stage === 'over') { runRestart(); return; }
  runJump();
});

window.addEventListener('keydown', (e) => {
  if (!runActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'Space' || e.code === 'ArrowUp') { if (run.stage === 'over') runRestart(); else runJump(); e.preventDefault(); }
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    if (!run.crashed && run.y <= 0) run.sliding = true;
    e.preventDefault();
  } else if (e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { runDoDash(); e.preventDefault(); }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowDown' || e.code === 'KeyS') run.sliding = false;
});

// Touch: tap = jump (as ever); touch-and-HOLD the bottom strip of the screen
// (the floor, basically) = slide until you let go. preventDefault swallows
// the synthetic mousedown so a floor-hold doesn't also jump.
window.addEventListener('touchstart', (e) => {
  if (!runActive()) return;
  if (e.target.closest('.storm-hud') || e.target.closest('.ak-tier')) return;
  const t = e.changedTouches[0];
  if (run.stage === 'over') { runRestart(); e.preventDefault(); return; }
  if (t.clientY > window.innerHeight * 0.72) {
    if (!run.crashed && run.y <= 0) { run.sliding = true; run.slideTouch = t.identifier; }
  } else {
    // double-tap (upper screen) = dash; single = jump
    const now = performance.now();
    if (run._lastTap && now - run._lastTap < 280) { runDoDash(); run._lastTap = 0; }
    else { runJump(); run._lastTap = now; }
  }
  e.preventDefault();
}, { passive: false });
const runSlideEnd = (e) => {
  if (run.slideTouch == null) return;
  for (const t of e.changedTouches) {
    if (t.identifier === run.slideTouch) { run.sliding = false; run.slideTouch = null; }
  }
};
window.addEventListener('touchend', runSlideEnd);
window.addEventListener('touchcancel', runSlideEnd);

// ---- The step --------------------------------------------------------------------------

function stepRun(dt, w, h) {
  const r = run.refs;
  if (run.stage === 'tier') return;

  // timers tick even mid-crash so i-frames / cooldowns keep counting
  if (run.inv > 0) run.inv -= dt;
  if (run.dashCd > 0) run.dashCd -= dt;
  if (run.dashT > 0) run.dashT -= dt;
  if (run.powerT.magnet > 0) run.powerT.magnet -= dt;
  if (run.powerT.dash > 0) run.powerT.dash -= dt;
  runUpdateRival(dt);

  if (run.stage === 'over') return; // frozen; the boulder looms, medal card up

  // Crash sequence: world freezes, limbs tumble, then reassemble and resume.
  if (run.crashed) {
    run.crashT -= dt;
    for (const p of run.parts) {
      p.vy += RUN_GRAVITY * 0.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > -14) { p.y = -14; p.vy *= -0.45; p.vx *= 0.7; }
      p.rot += p.vr * dt;
      p.el.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) rotate(${p.rot.toFixed(0)})`);
    }
    // The body spins where it fell.
    const bt = 1 - run.crashT / CRASH_SECS;
    r.body.setAttribute('transform',
      `translate(${(-bt * 50).toFixed(1)},${(-30 + Math.sin(bt * Math.PI) * -70).toFixed(1)}) rotate(${(bt * 340).toFixed(0)})`);
    r.runner.setAttribute('transform', `translate(${RUN_X},${RUN_GROUND})`);
    if (run.crashT <= 0) {
      reattachLimbs();
      run.crashed = false; run.crashT = 0;
      if (run.hearts <= 0) runGameOver();     // out of hearts → the run is over
      else resetRun(false);                   // keep banked distance; ramp restarts
    }
    return;
  }

  // Speed ramp (per-tier) × biome pace, with a dash burst
  run.elapsed += dt;
  const dashing = run.dashT > 0 || run.powerT.dash > 0;
  run.speed = Math.min(run.cfg.start + run.elapsed * run.cfg.accel, RUN_MAX_SPEED)
    * RUN_BIOMES[run.biome].speed * (dashing ? 1.6 : 1);
  run.dist += run.speed * dt;
  const meters = Math.floor(run.dist / RUN_METER);
  if (meters > run.banked) {
    storm.caught += (meters - run.banked) * run.cfg.mult;
    run.banked = meters;
    runCheckBiome();
  }

  // Vertical physics
  if (run.y > 0 || run.vy !== 0) {
    run.vy += RUN_GRAVITY * dt;
    run.y -= run.vy * dt;
    if (run.y <= 0) {
      run.y = 0; run.vy = 0;
      if (run.jumps > 0) { // landing puffs
        for (let i = 0; i < 5; i++) spawnPuff(RUN_X - 10 + Math.random() * 30, RUN_GROUND - 4, true);
      }
      run.jumps = 0; run.flip = 0; run.flipRot = 0;
    }
  }
  if (run.flip > 0) {
    const spin = 900 * dt;
    run.flipRot = (run.flipRot + spin) % 361;
    run.flip -= spin;
    if (run.flip <= 0) { run.flip = 0; run.flipRot = 0; }
  }

  // Parallax
  r.far.setAttribute('transform', `translate(${(-(run.dist * 0.18) % 1600).toFixed(1)},0)`);
  r.mid.setAttribute('transform', `translate(${(-(run.dist * 0.5) % 1000).toFixed(1)},0)`);
  r.ground.setAttribute('transform', `translate(${(-(run.dist) % 400).toFixed(1)},0)`);

  // Obstacles
  run.nextObstIn -= run.speed * dt;
  if (run.nextObstIn <= 0) spawnObstacle();
  const airborne = run.y > 0;
  const boxTop = run.y + (run.sliding && !airborne ? SLIDE_H : BODY_H);
  for (let i = run.obstacles.length - 1; i >= 0; i--) {
    const o = run.obstacles[i];
    o.x -= run.speed * dt;
    o.el.setAttribute('transform', `translate(${o.x.toFixed(1)},${RUN_GROUND})`);
    if (o.x < -200) { o.el.remove(); run.obstacles.splice(i, 1); continue; }
    const halfW = o.def.w / 2;
    if (Math.abs(o.x - RUN_X) < halfW + HALF_W) {
      if (o.def.pit) {
        if (run.y <= 2) crashRun(); // grounded over the gap → you fall in
      } else if (o.def.bar) {
        const [lo, hi] = o.def.bar;
        if (boxTop > lo && run.y < hi) crashRun();
      } else if (run.y < o.def.h) {
        crashRun();
      }
      if (run.crashed) return;
    }
  }

  // Pickups (🧲 magnet widens the grab + tugs them in)
  const magnet = run.powerT.magnet > 0;
  for (let i = run.pickups.length - 1; i >= 0; i--) {
    const p = run.pickups[i];
    p.x -= run.speed * dt;
    if (magnet && Math.abs(p.x - RUN_X) < 270) { p.x += (RUN_X - p.x) * Math.min(1, dt * 6); p.h += ((run.y + 44) - p.h) * Math.min(1, dt * 6); }
    const bobY = RUN_GROUND - p.h + Math.sin(run.elapsed * 4 + i) * 5;
    p.el.setAttribute('x', (p.x - 15).toFixed(1));
    p.el.setAttribute('y', (bobY - 15).toFixed(1));
    if (p.x < -60) { p.el.remove(); run.pickups.splice(i, 1); continue; }
    const grab = magnet ? 48 : 40;
    if (!p.taken && Math.abs(p.x - RUN_X) < grab && p.h > run.y - 18 && p.h < run.y + BODY_H + 18) {
      p.taken = true;
      const val = PICKUP_VALUE * run.cfg.mult;
      storm.caught += val;
      const s = Math.max(w / 1600, h / 900);
      spawnPopLabel(p.x * s + (w - 1600 * s) / 2, bobY * s + (h - 900 * s), '+' + val, 'golden');
      p.el.remove();
      run.pickups.splice(i, 1);
    }
  }

  // Power tokens (🛡️ 🧲 🚀)
  for (let i = run.tokens.length - 1; i >= 0; i--) {
    const t = run.tokens[i];
    t.x -= run.speed * dt;
    const ty = RUN_GROUND - t.h + Math.sin(run.elapsed * 3 + i) * 6;
    t.el.setAttribute('x', t.x.toFixed(1));
    t.el.setAttribute('y', ty.toFixed(1));
    if (t.x < -70) { t.el.remove(); run.tokens.splice(i, 1); continue; }
    if (!t.taken && Math.abs(t.x - RUN_X) < 48 && t.h > run.y - 26 && t.h < run.y + BODY_H + 26) {
      t.taken = true; runGrabPower(t.def); t.el.remove(); run.tokens.splice(i, 1);
    }
  }

  // Speed lines at high velocity / dash
  run.slLast -= dt;
  if ((run.speed > 640 || dashing) && run.slLast <= 0) {
    const yy = 120 + Math.random() * 560;
    const el = document.createElementNS(SVG_NS, 'rect');
    el.setAttribute('x', 1650); el.setAttribute('y', yy.toFixed(0));
    el.setAttribute('width', (60 + Math.random() * 130).toFixed(0)); el.setAttribute('height', 3);
    el.setAttribute('fill', dashing ? 'rgba(127,212,255,0.5)' : 'rgba(255,255,255,0.32)');
    r.speed.appendChild(el);
    run.speedLines.push({ el, x: 1650, t: 0 });
    run.slLast = 0.045;
  }
  for (let i = run.speedLines.length - 1; i >= 0; i--) {
    const s = run.speedLines[i];
    s.x -= run.speed * 2.4 * dt; s.t += dt;
    s.el.setAttribute('x', s.x.toFixed(0));
    s.el.setAttribute('opacity', Math.max(0, 1 - s.t * 2.6).toFixed(2));
    if (s.x < -220 || s.t > 0.5) { s.el.remove(); run.speedLines.splice(i, 1); }
  }

  // Dust puffs
  run.puffT -= dt;
  if (run.puffT <= 0 && !airborne && !run.sliding) {
    spawnPuff(RUN_X - 24, RUN_GROUND - 5);
    run.puffT = 0.18;
  }
  if (run.sliding && !airborne && Math.random() < 0.5) spawnPuff(RUN_X + 26, RUN_GROUND - 5);
  for (let i = run.puffs.length - 1; i >= 0; i--) {
    const p = run.puffs[i];
    p.t += dt;
    const life = p.big ? 0.5 : 0.38;
    const q = p.t / life;
    p.el.setAttribute('cx', (p.x - run.speed * p.t * 0.4).toFixed(1));
    p.el.setAttribute('cy', p.y - q * 10);
    p.el.setAttribute('r', ((p.big ? 6 : 4) + q * (p.big ? 14 : 8)).toFixed(1));
    p.el.setAttribute('opacity', String(Math.max(0, 0.45 * (1 - q))));
    if (q >= 1) { p.el.remove(); run.puffs.splice(i, 1); }
  }

  // ---- Pose the rig -------------------------------------------------------------
  run.phase += dt * (run.speed / 26);
  const ph = run.phase;
  r.runner.setAttribute('transform', `translate(${RUN_X},${(RUN_GROUND - run.y).toFixed(1)})`);
  r.shadow.setAttribute('rx', String(46 - Math.min(run.y * 0.09, 24)));
  r.shadow.setAttribute('opacity', String(Math.max(0.12, 0.35 - run.y * 0.001)));
  r.shadow.setAttribute('transform', `translate(0,${run.y.toFixed(1)})`); // shadow stays on the ground

  if (airborne) {
    const tuck = run.flipRot ? ` rotate(${run.flipRot.toFixed(0)})` : ' rotate(-12)';
    r.all.setAttribute('transform', `translate(0,-6)${tuck}`);
    r.body.setAttribute('transform', 'translate(0,-4)');
    r.footF.setAttribute('transform', 'translate(20,-40) rotate(24)');
    r.footB.setAttribute('transform', 'translate(-16,-30) rotate(-18)');
    r.handF.setAttribute('transform', 'translate(30,-76)');
    r.handB.setAttribute('transform', 'translate(-32,-70)');
  } else if (run.sliding) {
    r.all.setAttribute('transform', '');
    r.body.setAttribute('transform', 'translate(-8,-34) rotate(-52)');
    r.footF.setAttribute('transform', 'translate(40,-4) rotate(8)');
    r.footB.setAttribute('transform', 'translate(20,-2) rotate(-6)');
    r.handF.setAttribute('transform', 'translate(-20,-16)');
    r.handB.setAttribute('transform', 'translate(-34,-10)');
  } else {
    // The run cycle: feet orbit like a wheel, hands pump opposite, body bobs.
    // The wheel turns with -ph: planted foot sweeps front→back (pushing the
    // ground AWAY), recovery swings back→front through the air. +ph plays the
    // same frames in reverse order — a very committed moonwalk (shoutout Joe).
    r.all.setAttribute('transform', '');
    const cyc = -ph;
    const bob = -8 - Math.abs(Math.sin(cyc)) * 8;
    const lean = 9 + Math.sin(cyc * 2) * 2;
    r.body.setAttribute('transform', `translate(3,${bob.toFixed(1)}) rotate(${lean.toFixed(1)})`);
    const foot = (a) => {
      const fx = Math.cos(a) * 34 + 2;
      const fy = -Math.max(0, Math.sin(a)) * 30 - 2;
      const fr = Math.cos(a) * 22;
      return `translate(${fx.toFixed(1)},${fy.toFixed(1)}) rotate(${fr.toFixed(0)})`;
    };
    r.footF.setAttribute('transform', foot(cyc));
    r.footB.setAttribute('transform', foot(cyc + Math.PI));
    const hand = (a, side) =>
      `translate(${(-Math.cos(a) * 22 + side * 8).toFixed(1)},${(-52 - Math.max(0, -Math.sin(a)) * 8 + bob * 0.4).toFixed(1)})`;
    r.handF.setAttribute('transform', hand(cyc, 1));
    r.handB.setAttribute('transform', hand(cyc + Math.PI, -1));
  }

  // Headband ribbons flutter behind (they trail left since he runs right).
  const rp = ph * 1.7;
  r.ribbons.setAttribute('d',
    `M-30,-80 q-12,${(-4 + Math.sin(rp) * 5).toFixed(1)} -24,${(2 + Math.sin(rp) * 8).toFixed(1)}` +
    ` M-30,-77 q-10,${(4 + Math.cos(rp * 1.3) * 5).toFixed(1)} -21,${(9 + Math.cos(rp * 1.3) * 7).toFixed(1)}`);
}

// Test/debug hook: force a pose or fast-forward, used by the smoke harness.
window.runDebug = function (opts) {
  opts = opts || {};
  if (opts.tier) run.cfg = RUN_TIERS.find((t) => t.key === opts.tier) || run.cfg;
  if (opts.pick && run.tierPick) { run.tierPick.close(); run.tierPick = null; runNewRun(); }
  if (opts.banked != null) { run.banked = opts.banked; run.dist = opts.banked * RUN_METER; runCheckBiome(); }
  if (opts.hearts != null) run.hearts = opts.hearts;
  if (opts.dash) runDoDash();
  if (opts.phase !== undefined) run.phase = opts.phase;
  if (opts.y !== undefined) { run.y = opts.y; run.vy = 0; }
  if (opts.jumps !== undefined) run.jumps = opts.jumps;
  if (opts.flipRot !== undefined) { run.flipRot = opts.flipRot; run.flip = opts.flipRot ? 100 : 0; }
  if (opts.slide !== undefined) run.sliding = opts.slide;
  if (opts.spawn) {
    const def = { type: opts.spawn, ...RUN_OBS[opts.spawn] };
    const el = obstacleSvg(def);
    run.refs.obs.appendChild(el);
    el.setAttribute('transform', `translate(${opts.at || 800},${RUN_GROUND})`);
    run.obstacles.push({ el, x: opts.at || 800, def });
  }
  if (opts.pickups) spawnPickupArc(opts.at || 900);
  if (opts.power) runSpawnPower(opts.at || 900);
  if (opts.forceCrash) { run.inv = 0; run.shield = false; crashRun(); }
  else if (opts.crash) crashRun();
  if (opts.step !== false) stepRun(opts.dt || 0.016, window.innerWidth, window.innerHeight);
  return { stage: run.stage, hearts: run.hearts, biome: RUN_BIOMES[run.biome].key,
    banked: run.banked, pier: run.pierDone, shield: run.shield, inv: +(run.inv > 0) };
};
