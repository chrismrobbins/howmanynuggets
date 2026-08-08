// ---- THE UNDERCROFT ---------------------------------------------------------------
// "WHAT THE FORT FORGOT."
//
// Game 15, the FIFTH street game (mode key: croft). Beneath Fort Nugget run the
// old cellars — the UNDERCROFT — where the castle stores what it doesn't want
// to remember. Entry: the slanted cellar doors against the arcade's east wall,
// the ones with warm light leaking through the crack that NOBODY leaves a
// candle behind. A roguelite crawl, and the first game built AROUND the
// pick-1-of-3 deal instead of garnished with it: clear a room, choose a relic
// (ArcadeKit.boonSelect — 16 relics, builds that actually diverge), descend.
// Die and the relics stay down there. That's the loop.
//
// The GRAPHICS are the other half of the brief: a real-time 2D lighting engine
// on the low-res canvas (drain/brawl school). The dark is drawn on an offscreen
// canvas and ERASED by lights — your lantern, the wall torches, butter wisps
// that are their own lamps, ember trails, the votive shrine — then an additive
// pass puts hot cores on the flames and slash arcs. Your light radius is the
// DIFFICULTY dial: TAPER'S OATH is bright, LANTERN OATH is honest, and THE
// DARK BELOW gives you no more light than you can carry.
//
// And the lore: TAG 077 out of the storm drains reads "it likes the pipes
// better than the bay. leave it a door." — unsigned. Four floors down, once a
// run, the stairs land you in a room with a vault door that isn't on any plan
// of the fort, gold light in the seam, water moving behind it, headed
// harbor-side. It does not open. It is not going to open. (Sets localStorage
// `nugCroftDoor`, read via croftFoundDoor() — Dill, the Hood, and the case
// board react; finding it unlocks THE DARK BELOW.)
//
// Scoring mirrors the arcade: foes/rooms/floors pay perFlyer-scaled points into
// storm.caught; golden foes are the 10× tier. No audio (drain school).

const croftWorld = document.getElementById('croftWorld');

const CROFT_HIT_IFRAMES = 1.1;
const CROFT_ROOMS_PER_FLOOR = 3;   // combat rooms; then the stairs (or THE DOOR)
const CROFT_DOOR_FLOOR = 4;        // the stairs on this floor land somewhere else
const CROFT_SEXTON_EVERY = 3;      // every 3rd floor, room 3 is the snuffer's

// ---- Oaths (light IS difficulty) --------------------------------------------------
// mult scales pay, light scales the lantern, dark is the darkness alpha, and
// the rest lean on the foes. THE DARK BELOW must be earned — find THE DOOR.
const CROFT_TIERS = [
  { key: 'taper',   emoji: '🕯️', name: "TAPER'S OATH", mult: 1, light: 1.35, dark: 0.62,
    eSpd: 0.85, eHp: 0, count: 0.8, hearts: 3, blurb: 'a kind flame. the cellars are patient.' },
  { key: 'lantern', emoji: '🏮', name: 'LANTERN OATH', mult: 2, light: 1.0, dark: 0.78,
    eSpd: 1.0, eHp: 1, count: 1.0, hearts: 3, blurb: 'the true crawl. the dark leans in.' },
  { key: 'dark',    emoji: '🌑', name: 'THE DARK BELOW', mult: 3, light: 0.62, dark: 0.92,
    eSpd: 1.15, eHp: 1, count: 1.25, hearts: 2, blurb: 'no more light than you can carry.',
    lockNote: 'find THE DOOR' },
];

// ---- The relics: pick 1 of 3 after EVERY room ------------------------------------
// This is the game. Sixteen relics, dealt via ArcadeKit.boonSelect, ok-gated so
// maxed lines rotate out and builds diverge — a lantern build sees the sentries
// coming, an ember build never stops moving, a greed build dies rich.
const CROFT_BOONS = [
  { key: 'reach',  emoji: '📏', name: 'Reliquary Reach',   desc: 'Slash arc +25%',                  ok: (b) => b.reach < 2,    apply: (b) => { b.reach *= 1.25; } },
  { key: 'swing',  emoji: '🌀', name: 'Quick Litany',      desc: 'Swing 15% faster',                ok: (b) => b.swing > 0.5,  apply: (b) => { b.swing *= 0.85; } },
  { key: 'edge',   emoji: '🗡️', name: 'Consecrated Edge',  desc: 'Slashes deal +1 damage',          ok: (b) => b.dmg < 4,      apply: (b) => { b.dmg++; } },
  { key: 'boots',  emoji: '👟', name: 'Crypt Slippers',    desc: 'Move 15% faster',                 ok: (b) => b.speed < 1.7,  apply: (b) => { b.speed *= 1.15; } },
  { key: 'heart',  emoji: '❤️', name: 'Alms Heart',        desc: '+1 max heart & mend',             ok: (b) => b.maxHearts < 6, apply: (b) => { b.maxHearts++; croft.hearts = b.maxHearts; } },
  { key: 'wick',   emoji: '🕯️', name: 'Whale-Wax Wick',    desc: 'Lantern shines 30% further',      ok: (b) => b.lantern < 2.1, apply: (b) => { b.lantern *= 1.3; } },
  { key: 'ember',  emoji: '🔥', name: 'Ember Edge',        desc: 'Slashes set foes burning',        ok: (b) => !b.ember,       apply: (b) => { b.ember = 1; } },
  { key: 'whirl',  emoji: '🌪️', name: 'The Full Turn',     desc: 'Slashes sweep all the way round', ok: (b) => !b.whirl,       apply: (b) => { b.whirl = 1; } },
  { key: 'riposte', emoji: '⚡', name: 'Riposte Ward',     desc: 'Getting hit blasts the room back', ok: (b) => !b.riposte,    apply: (b) => { b.riposte = 1; } },
  { key: 'crumbs', emoji: '🍞', name: 'Crumb Communion',   desc: 'Foes sometimes drop mending crumbs', ok: (b) => !b.crumbs,   apply: (b) => { b.crumbs = 1; } },
  { key: 'torch',  emoji: '🔆', name: 'Torchbearer',       desc: 'A votive flame orbits you',       ok: (b) => b.torch < 2,    apply: (b) => { b.torch++; } },
  { key: 'greed',  emoji: '💰', name: 'Tithe Collector',   desc: 'Foes pay 30% more',               ok: (b) => b.greed < 1.9,  apply: (b) => { b.greed *= 1.3; } },
  { key: 'plate',  emoji: '🧲', name: 'Collection Plate',  desc: 'Treasure crawls to you',          ok: (b) => !b.magnet,      apply: (b) => { b.magnet = 1; } },
  { key: 'dash',   emoji: '💨', name: "Sexton's Step",     desc: 'SHIFT / double-tap: dash through harm', ok: (b) => !b.dash,  apply: (b) => { b.dash = 1; } },
  { key: 'shell',  emoji: '🛡️', name: 'Brass Reliquary',   desc: 'Shrug off the first hit each room', ok: (b) => !b.shell,     apply: (b) => { b.shell = 1; } },
  { key: 'bell',   emoji: '🔔', name: 'Bell-Toll Blade',   desc: 'Slashes knock foes flying',       ok: (b) => !b.bell,        apply: (b) => { b.bell = 1; } },
];
function croftFreshBuild(cfg) {
  return { reach: 1, swing: 1, dmg: 1, speed: 1, maxHearts: cfg ? cfg.hearts : 3, lantern: 1,
    ember: 0, whirl: 0, riposte: 0, crumbs: 0, torch: 0, greed: 1, magnet: 0, dash: 0, shell: 0, bell: 0, picks: 0 };
}

// ---- The foes ---------------------------------------------------------------------
// The syndicate's batter seeped into the foundations years ago; the cutlery
// down here has gone waxy and old. Wisps are their own light sources — the
// lighting engine is allowed to do the storytelling.
const CROFT_FOES = {
  rat:   { hp: 1, spd: 46, r: 4, worth: 1, pal: ['#8a7a5a', '#c9b98a'] },
  spork: { hp: 2, spd: 26, r: 6, worth: 2, pal: ['#7a8496', '#aeb6c6'], lunge: true },
  knife: { hp: 2, spd: 30, r: 5, worth: 3, pal: ['#9aa4b6', '#e2e8f2'], dash: true, minFloor: 2 },
  wisp:  { hp: 1, spd: 22, r: 5, worth: 3, pal: ['#ffd23a', '#fff3c0'], light: 30, drift: true },
  spoon: { hp: 3, spd: 10, r: 7, worth: 4, pal: ['#8a94a6', '#c6cede'], lob: true, minFloor: 2 },
  whisk: { hp: 4, spd: 34, r: 8, worth: 6, pal: ['#b6bece', '#eef2fa'], spin: true, minFloor: 3 },
};

// Floor dressing cycles as you descend; past the list the names keep counting
// but the stone stops changing — the deep is done redecorating.
const CROFT_FLOORS = [
  { name: 'THE COLD CELLARS', wall: '#4a3b28', floor: '#2e2318', grout: '#1c140c' },
  { name: 'THE BONE WALK',    wall: '#45443c', floor: '#2a2a24', grout: '#17170f' },
  { name: 'THE OLD KITCHENS', wall: '#4e3526', floor: '#30201a', grout: '#190f0a' },
  { name: 'THE FLOOD LINE',   wall: '#31404c', floor: '#1d2830', grout: '#0e161c' },
  { name: 'THE BATTER VEIN',  wall: '#4c4326', floor: '#2c2714', grout: '#17130a' },
];

const croft = {
  on: false,
  cv: null, g: null,           // main canvas
  lcv: null, lg: null,         // the darkness (lighting) canvas
  base: null, bg: null,        // pre-rendered room base (floor/walls/props/decals)
  banner: null, bannerT: null,
  W: 0, Hh: 0, scale: 1,
  t: 0,
  phase: 'title',              // tier | walk | fade | over
  choosing: false,             // relic cards up; the crawl holds its breath
  boonPick: null,
  seed: 0, rng: null,
  // the delver
  x: 0, y: 0, vx: 0, vy: 0, fx: 1, fy: 0,
  hearts: 3,
  iframes: 0,
  slashT: 0, slashCd: 0, slashA: 0,
  dashT: 0, lastTap: 0,
  shellUsed: false,
  keys: {},
  pointer: null,               // touch/mouse move target {x,y} in canvas px
  touchT: 0,
  // the run
  build: croftFreshBuild(),
  floor: 1, room: 1,
  roomKind: 'combat',          // combat | sexton | stairs | door
  cleared: false,
  doorSeenRun: false,
  foes: [], shots: [], loot: [], parts: [], pods: [],
  torches: [],                 // wall torches in this room (lights)
  pillars: [],
  boonAt: 0,                   // t when the shrine finishes and the cards deal
  clearT: 0,
  fade: null,                  // { t, out, cb } room/floor transitions
  combo: 0, comboT: 0,
  kills: 0, roomsCleared: 0,
  best: 0,
  outT: 0,
  // ---- oath ----
  cfg: CROFT_TIERS[1],
  tierPick: null,
};

function croftActive() { return storm.mode === 'croft' && storm.running; }

// Did any run ever find THE DOOR? Street NPCs + the case board react.
function croftFoundDoor() {
  try { return localStorage.getItem('nugCroftDoor') === '1'; } catch (e) { return false; }
}

function croftTally() {
  if (croft.phase === 'tier') return '🕯️ swear by your light…';
  if (croft.choosing) return '⛧ the reliquary is open…';
  if (croft.phase === 'over') return '💀 the dark kept the relics · B' + croft.floor;
  return '🕯️ B' + croft.floor + ' · room ' + Math.min(croft.room, CROFT_ROOMS_PER_FLOOR) + '/' + CROFT_ROOMS_PER_FLOOR +
    ' · ❤️' + croft.hearts +
    (croft.combo >= 3 ? ' · 🔥x' + croft.combo : '') +
    (croft.doorSeenRun ? ' · 🚪' : '');
}

// ---- setup -----------------------------------------------------------------------

function croftLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const oldW = croft.W, oldH = croft.Hh;
  // chunkier than drain: one room fills the screen, so fewer, fatter pixels
  croft.scale = Math.max(3, Math.floor(vh / 190));
  croft.W = Math.ceil(vw / croft.scale);
  croft.Hh = Math.ceil(vh / croft.scale);
  for (const c of [croft.cv, croft.lcv, croft.base]) {
    if (!c) continue;
    c.width = croft.W;
    c.height = croft.Hh;
  }
  if (croft.g) croft.g.imageSmoothingEnabled = false;
  croft.motes = [];
  for (let i = 0; i < 16; i++)
    croft.motes.push({ x: Math.random() * croft.W, y: Math.random() * croft.Hh, s: 0.3 + Math.random() * 0.7, ph: Math.random() * 7 });
  // a resize mid-crawl re-maps the room so the fight stays fair
  if (oldW && croft.on && croft.phase !== 'tier') {
    const kx = croft.W / oldW, ky = croft.Hh / oldH;
    croft.x *= kx; croft.y *= ky;
    for (const e of croft.foes) { e.x *= kx; e.y *= ky; }
    for (const p of croft.pillars) { p.x *= kx; p.y *= ky; }
    for (const l of croft.loot) { l.x *= kx; l.y *= ky; }
    for (const tc of croft.torches) { tc.x *= kx; tc.y *= ky; }
    croftRenderBase();
  }
}

function syncCroft() {
  const active = croftActive();
  if (active === croft.on) return;
  croft.on = active;
  document.body.classList.toggle('croft-mode', active);
  if (active) {
    if (!croft.cv) {
      croft.cv = document.createElement('canvas');
      croft.g = croft.cv.getContext('2d');
      croft.lcv = document.createElement('canvas');
      croft.lg = croft.lcv.getContext('2d');
      croft.base = document.createElement('canvas');
      croft.bg = croft.base.getContext('2d');
      croftWorld.appendChild(croft.cv);
      croft.banner = document.createElement('div');
      croft.banner.className = 'croft-banner';
      croftWorld.appendChild(croft.banner);
    }
    // the amount input autofocuses on load and eats keys — let go of it
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    croft.t = 0;
    croft.keys = {};
    croft.pointer = null;
    croftLayout();
    openCroftTier();
  } else {
    if (croft.tierPick) { croft.tierPick.close(); croft.tierPick = null; }
    if (croft.boonPick) { croft.boonPick.close(); croft.boonPick = null; }
    croft.choosing = false;
    croft.banner && croft.banner.classList.remove('show');
  }
}

function openCroftTier() {
  croft.phase = 'tier';
  const tiers = CROFT_TIERS.map((t) =>
    t.key === 'dark' && !croftFoundDoor() ? { ...t, locked: true } : t);
  croft.tierPick = ArcadeKit.tierSelect({
    storeKey: 'croft',
    title: '🕯️ Swear by your light',
    note: croftFoundDoor() ? 'the door remembers you · 1 · 2 · 3'
      : 'WASD move · X/click slash · clear the room, choose a relic',
    tiers,
    onPick: (key, t) => { croft.tierPick = null; croftNewRun(t); },
  });
}

function croftNewRun(cfg) {
  croft.cfg = cfg;
  croft.build = croftFreshBuild(cfg);
  croft.hearts = cfg.hearts;
  croft.floor = 1;
  croft.combo = 0; croft.kills = 0; croft.roomsCleared = 0;
  croft.doorSeenRun = false;
  croft.seed = Math.floor(Math.random() * 1e9);
  croftEnterRoom(1, 1);
  croftBanner(cfg.emoji + ' ' + cfg.name, 'go', 1.6);
}

function croftBanner(text, cls, secs) {
  croft.banner.textContent = text;
  croft.banner.className = 'croft-banner show' + (cls ? ' ' + cls : '');
  void croft.banner.offsetWidth;
  clearTimeout(croft.bannerT);
  croft.bannerT = setTimeout(() => croft.on && croft.banner.classList.remove('show'), (secs || 1.6) * 1000);
}

// Small seeded PRNG so a room is the same room if you re-render it (resize).
function croftRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- scoring ----------------------------------------------------------------------

function croftPay(mult, label, golden, atX, atY) {
  const comboFactor = 1 + Math.min(croft.combo, 20) * 0.05; // up to 2×
  const worth = Math.max(1, Math.round(storm.perFlyer * mult * comboFactor * croft.build.greed * croft.cfg.mult));
  storm.caught += worth;
  if (label) {
    spawnPopLabel((atX != null ? atX : croft.x) * croft.scale,
      ((atY != null ? atY : croft.y) - 8) * croft.scale,
      label + ' +' + fmt.format(worth), golden ? 'golden' : '');
  }
  updateStormHud();
  return worth;
}

// ---- rooms ------------------------------------------------------------------------

const CROFT_WALL = 11; // wall thickness in canvas px

function croftPal() { return CROFT_FLOORS[(croft.floor - 1) % CROFT_FLOORS.length]; }

function croftEnterRoom(floor, room) {
  croft.floor = floor;
  croft.room = room;
  croft.phase = 'walk';
  croft.cleared = false;
  croft.shellUsed = false;
  croft.clearT = 0;
  croft.foes = []; croft.shots = []; croft.loot = []; croft.pods = [];
  croft.rng = croftRng(croft.seed + floor * 1000 + room * 7);
  const rng = croft.rng;

  // what kind of room is this?
  if (room > CROFT_ROOMS_PER_FLOOR) {
    croft.roomKind = (floor >= CROFT_DOOR_FLOOR && !croft.doorSeenRun && !croft.doorRoomDone) ? 'door' : 'stairs';
    croft.cleared = true; // nothing to fight past the last arch
  } else if (room === CROFT_ROOMS_PER_FLOOR && floor % CROFT_SEXTON_EVERY === 0) {
    croft.roomKind = 'sexton';
  } else {
    croft.roomKind = 'combat';
  }

  // pillars: 0-4, seeded, kept off the door lanes
  croft.pillars = [];
  const nP = croft.roomKind === 'door' ? 0 : Math.floor(rng() * 3) + (croft.roomKind === 'stairs' ? 0 : 1);
  for (let i = 0; i < nP; i++) {
    croft.pillars.push({
      x: croft.W * (0.26 + rng() * 0.48),
      y: croft.Hh * (0.26 + rng() * 0.42),
      r: 6 + rng() * 3,
    });
  }
  // barrels: breakable, sometimes generous
  if (croft.roomKind === 'combat' || croft.roomKind === 'stairs') {
    const nB = Math.floor(rng() * 3);
    for (let i = 0; i < nB; i++) {
      croft.loot.push({ kind: 'barrel', x: croft.W * (0.16 + rng() * 0.68), y: croft.Hh * (0.2 + rng() * 0.6), r: 5, hp: 1 });
    }
  }
  // wall torches: the room's own light, flickering on independent phases
  croft.torches = [];
  const nT = croft.roomKind === 'door' ? 2 : 2 + Math.floor(rng() * 2);
  for (let i = 0; i < nT; i++) {
    const side = rng();
    croft.torches.push({
      x: side < 0.5 ? croft.W * (0.2 + rng() * 0.6) : (side < 0.75 ? CROFT_WALL + 2 : croft.W - CROFT_WALL - 2),
      y: side < 0.5 ? CROFT_WALL + 2 : croft.Hh * (0.25 + rng() * 0.5),
      ph: rng() * 7,
    });
  }

  // the delver comes in through the west arch
  croft.x = CROFT_WALL + 14;
  croft.y = croft.Hh / 2;
  croft.vx = 0; croft.vy = 0; croft.fx = 1; croft.fy = 0;
  croft.iframes = 0.6;

  // seed the fight: spawn pods glow, telegraph, then pop
  if (croft.roomKind === 'combat' || croft.roomKind === 'sexton') {
    const kinds = Object.keys(CROFT_FOES).filter((k) => (CROFT_FOES[k].minFloor || 1) <= floor);
    let n = Math.round((2 + floor * 1.1 + room * 0.6) * croft.cfg.count);
    n = Math.min(n, 9);
    if (croft.roomKind === 'sexton') n = Math.min(4, Math.max(2, Math.floor(n / 2)));
    for (let i = 0; i < n; i++) {
      const kind = kinds[Math.floor(rng() * kinds.length)];
      croft.pods.push({
        kind,
        x: croft.W * (0.3 + rng() * 0.55),
        y: croft.Hh * (0.18 + rng() * 0.64),
        t: 0.5 + rng() * 1.4, // staggered pops
        golden: Math.random() < storm.cat.golden,
      });
    }
    if (croft.roomKind === 'sexton') {
      croft.pods.push({ kind: 'sexton', x: croft.W * 0.68, y: croft.Hh * 0.5, t: 1.2, golden: false });
      croftBanner('🔔 THE SEXTON WAKES', 'over', 1.8);
    }
  }
  if (croft.roomKind === 'door') {
    croftBanner('…the stairs were not on the plans either.', 'lore', 2.4);
  }

  croftRenderBase();
}

// Pre-render the room's bones — floor, walls, arches, props — once per room.
// Decals (crumb splats, scorch) stamp straight onto this canvas so the fight
// leaves a mark without costing a per-frame redraw.
function croftRenderBase() {
  const g = croft.bg, W = croft.W, H = croft.Hh;
  if (!g) return;
  const pal = croftPal();
  const rng = croftRng(croft.seed + croft.floor * 1000 + croft.room * 7 + 3);

  // stone floor: big flags with grout + wear
  g.fillStyle = pal.floor;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = pal.grout;
  g.lineWidth = 1;
  const fs = 22;
  for (let y = 0; y < H + fs; y += fs) {
    for (let x = ((y / fs) % 2) * (fs / 2); x < W + fs; x += fs) {
      const jx = (rng() - 0.5) * 3, jy = (rng() - 0.5) * 3;
      g.strokeRect(x + jx, y + jy, fs, fs);
      if (rng() < 0.16) { // a worn flag
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x + jx + 2, y + jy + 2, fs - 4, fs - 4);
        g.fillStyle = pal.floor;
      }
      if (rng() < 0.1) { // a cracked one
        g.strokeStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.moveTo(x + jx + 4, y + jy + fs - 3);
        g.lineTo(x + jx + fs * 0.5, y + jy + fs * 0.4);
        g.lineTo(x + jx + fs - 3, y + jy + 5);
        g.stroke();
        g.strokeStyle = pal.grout;
      }
    }
  }
  // puddle sheen on the deeper floors
  if ((croft.floor - 1) % CROFT_FLOORS.length === 3) {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(120,180,220,0.08)';
      g.beginPath();
      g.ellipse(W * rng(), H * (0.3 + rng() * 0.5), 14 + rng() * 18, 5 + rng() * 6, 0, 0, 7);
      g.fill();
    }
  }

  // walls: coursed stone border
  g.fillStyle = pal.wall;
  g.fillRect(0, 0, W, CROFT_WALL);
  g.fillRect(0, H - CROFT_WALL, W, CROFT_WALL);
  g.fillRect(0, 0, CROFT_WALL, H);
  g.fillRect(W - CROFT_WALL, 0, CROFT_WALL, H);
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  for (let x = 0; x < W; x += 13) {
    g.strokeRect(x + ((Math.floor(x / 13) % 2) * 6), 0, 13, CROFT_WALL);
    g.strokeRect(x + ((Math.floor(x / 13) % 2) * 6), H - CROFT_WALL, 13, CROFT_WALL);
  }
  for (let y = 0; y < H; y += 13) {
    g.strokeRect(0, y + ((Math.floor(y / 13) % 2) * 6), CROFT_WALL, 13);
    g.strokeRect(W - CROFT_WALL, y + ((Math.floor(y / 13) % 2) * 6), CROFT_WALL, 13);
  }
  // wall shadow lip onto the floor
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(CROFT_WALL, CROFT_WALL, W - CROFT_WALL * 2, 3);
  g.fillRect(CROFT_WALL, CROFT_WALL, 3, H - CROFT_WALL * 2);

  // the arches: west (behind you, dark) and east (the way on)
  croftDrawArch(g, 'W');
  if (croft.roomKind !== 'door') croftDrawArch(g, 'E');

  // bones + rubble, seeded
  for (let i = 0; i < 6; i++) {
    if (rng() < 0.5) continue;
    const bx = W * (0.15 + rng() * 0.7), by = H * (0.18 + rng() * 0.66);
    g.fillStyle = 'rgba(220,214,190,0.5)';
    if (rng() < 0.5) { g.fillRect(bx, by, 5, 1.5); g.fillRect(bx + 1.5, by - 1.5, 1.5, 4); }
    else { g.beginPath(); g.arc(bx, by, 1.8, 0, 7); g.fill(); }
  }

  // pillars: drawn into the base with a floor shadow
  for (const p of croft.pillars) {
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath(); g.ellipse(p.x, p.y + p.r * 0.55, p.r * 1.15, p.r * 0.5, 0, 0, 7); g.fill();
    g.fillStyle = pal.wall;
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.beginPath(); g.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.5, 0, 7); g.fill();
  }

  // stairs down / THE DOOR
  if (croft.roomKind === 'stairs') croftDrawStairs(g);
  if (croft.roomKind === 'door') { croftDrawStairs(g); croftDrawTheDoor(g); }
}

function croftDrawArch(g, side) {
  const W = croft.W, H = croft.Hh, aw = 24;
  const y0 = H / 2 - aw / 2;
  const x = side === 'W' ? 0 : W - CROFT_WALL;
  g.fillStyle = '#050608';
  g.fillRect(x, y0, CROFT_WALL, aw);
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.strokeRect(x, y0, CROFT_WALL, aw);
  // keystone hints
  g.fillStyle = 'rgba(255,255,255,0.09)';
  g.fillRect(x, y0 - 3, CROFT_WALL, 2);
  g.fillRect(x, y0 + aw + 1, CROFT_WALL, 2);
}

function croftDrawStairs(g) {
  const W = croft.W, H = croft.Hh;
  const sx = W * 0.72, sy = H * 0.5 - 14;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(sx - 4, sy - 4, 34, 36);
  for (let i = 0; i < 6; i++) {
    const q = i / 6;
    g.fillStyle = 'rgba(' + Math.round(30 - q * 26) + ',' + Math.round(26 - q * 22) + ',' + Math.round(20 - q * 17) + ',1)';
    g.fillRect(sx + i * 2.4, sy + i * 2.2, 30 - i * 4.8, 5);
  }
  croft.stairs = { x: sx + 13, y: sy + 14, r: 13 };
}

function croftDrawTheDoor(g) {
  const W = croft.W;
  // the vault door that isn't on the plans: north wall, iron, gold in the
  // seam — set OFF-CENTER, because things that are on the plans get centered
  const doorX = W * 0.34;
  const dw = 56, dx = doorX - dw / 2, dh = CROFT_WALL + 20;
  g.fillStyle = '#1a1d26';
  g.fillRect(dx, 0, dw, dh);
  g.strokeStyle = '#0a0c12';
  g.lineWidth = 2;
  g.strokeRect(dx + 1, -2, dw - 2, dh);
  // riveted bands
  g.fillStyle = '#2e3442';
  g.fillRect(dx, dh * 0.3, dw, 3);
  g.fillRect(dx, dh * 0.66, dw, 3);
  g.fillStyle = '#4a5266';
  for (let i = 0; i < 5; i++) {
    g.fillRect(dx + 4 + i * (dw - 10) / 4, dh * 0.3 + 0.5, 2, 2);
    g.fillRect(dx + 4 + i * (dw - 10) / 4, dh * 0.66 + 0.5, 2, 2);
  }
  // the seam (the additive pass makes it breathe)
  g.fillStyle = '#ffd23a';
  g.fillRect(doorX - 1, 2, 2, dh - 4);
  croft.theDoor = { x: doorX, y: dh + 6, r: 22 };
}

// Decals stamp straight onto the pre-rendered base — the fight leaves a mark.
function croftStampDecal(x, y, golden) {
  const g = croft.bg;
  if (!g) return;
  g.fillStyle = golden ? 'rgba(255,210,58,0.30)' : 'rgba(214,182,118,0.22)';
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * 7, d = Math.random() * 5;
    g.beginPath();
    g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1 + Math.random() * 2, 0, 7);
    g.fill();
  }
}

// ---- the relic deal (pick 1 of 3) ---------------------------------------------------

function croftOfferBoon() {
  const pool = CROFT_BOONS.filter((u) => u.ok(croft.build));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const deal = pool.slice(0, 3);
  if (!deal.length) return; // a completed build walks on
  croft.choosing = true;
  croft.boonPick = ArcadeKit.boonSelect({
    title: '⛧ THE RELIQUARY — B' + croft.floor,
    note: 'take ONE relic · the dark waits · 1 · 2 · 3',
    boons: deal,
    onPick: (i, u) => {
      croft.boonPick = null;
      u.apply(croft.build);
      croft.build.picks++;
      croft.choosing = false;
      croftBanner(u.emoji + ' ' + u.name, 'go', 1.5);
      ArcadeKit.burst(croft.x * croft.scale, croft.y * croft.scale, { n: 14, color: '#ffd23a', speed: 240 });
    },
  });
}

// ---- combat -------------------------------------------------------------------------

function croftPodPop(pod) {
  if (pod.kind === 'sexton') {
    croft.foes.push({
      kind: 'sexton', x: pod.x, y: pod.y, vx: 0, vy: 0,
      hp: 16 + croft.floor * 4 + croft.cfg.eHp * 6, maxHp: 16 + croft.floor * 4 + croft.cfg.eHp * 6,
      r: 13, worth: 30, golden: false, burn: 0, hurtT: 0,
      slamT: 3.2, slamWarn: 0, ph: Math.random() * 7,
    });
    return;
  }
  const def = CROFT_FOES[pod.kind];
  croft.foes.push({
    kind: pod.kind, x: pod.x, y: pod.y, vx: 0, vy: 0,
    hp: def.hp + croft.cfg.eHp * (def.hp > 1 ? 1 : 0),
    r: def.r, worth: def.worth, golden: pod.golden,
    burn: 0, hurtT: 0, lungeT: 1 + Math.random() * 2, dashT: 0,
    ph: Math.random() * 7, hitCd: 0,
  });
}

function croftSlash() {
  if (croft.slashCd > 0 || croft.choosing || croft.phase !== 'walk') return;
  const b = croft.build;
  croft.slashCd = 0.38 * b.swing;
  croft.slashT = 0.16;
  croft.slashA = Math.atan2(croft.fy, croft.fx);
  const reach = 16 * b.reach;
  const arcHalf = b.whirl ? Math.PI : 1.15;
  ArcadeKit.kick(2, 90);
  let hitSomething = false;
  for (let i = croft.foes.length - 1; i >= 0; i--) {
    const e = croft.foes[i];
    const dx = e.x - croft.x, dy = e.y - croft.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + e.r) continue;
    let da = Math.atan2(dy, dx) - croft.slashA;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) > arcHalf) continue;
    hitSomething = true;
    e.hp -= b.dmg;
    e.hurtT = 0.12;
    if (b.ember && !e.burnImmune) e.burn = 2.2;
    const kb = b.bell ? 130 : 46;
    if (e.kind !== 'sexton') { e.vx += (dx / (d || 1)) * kb; e.vy += (dy / (d || 1)) * kb; }
    croftSpark(e.x, e.y, e.golden ? '#ffd23a' : '#ffcf7a', 4);
    if (e.hp <= 0) croftKillFoe(i);
  }
  // barrels break with dignity
  for (let i = croft.loot.length - 1; i >= 0; i--) {
    const l = croft.loot[i];
    if (l.kind !== 'barrel') continue;
    const d = Math.hypot(l.x - croft.x, l.y - croft.y);
    if (d > reach + l.r) continue;
    croft.loot.splice(i, 1);
    croftSpark(l.x, l.y, '#a8874a', 7);
    croftStampDecal(l.x, l.y, false);
    if (Math.random() < 0.45) croft.loot.push({ kind: 'crumb', x: l.x, y: l.y, r: 2.5, heal: Math.random() < 0.3 });
    else croftPay(3, '🛢️', false, l.x, l.y);
  }
  if (hitSomething) ArcadeKit.hitStop(45);
}

function croftKillFoe(i) {
  const e = croft.foes[i];
  croft.combo++;
  croft.comboT = 2.5;
  croft.kills++;
  let mult = e.worth;
  if (e.golden) mult *= GOLDEN_MULTIPLIER;
  croftPay(mult, e.kind === 'sexton' ? '🔔' : (e.golden ? '✨' : null), e.golden, e.x, e.y);
  croftSpark(e.x, e.y, e.golden ? '#ffd23a' : '#e8c890', e.kind === 'sexton' ? 22 : 9);
  croftStampDecal(e.x, e.y, e.golden);
  if (croft.build.crumbs && Math.random() < 0.22) {
    croft.loot.push({ kind: 'crumb', x: e.x, y: e.y, r: 2.5, heal: Math.random() < 0.4 });
  }
  if (e.kind === 'sexton') {
    ArcadeKit.kick(16, 500);
    croftBanner('🔔 THE SEXTON RESTS', 'go', 2);
  }
  croft.foes.splice(i, 1);
}

function croftHeroHit(fromX, fromY) {
  if (croft.iframes > 0 || croft.dashT > 0 || croft.phase !== 'walk' || croft.choosing) return;
  const b = croft.build;
  if (b.shell && !croft.shellUsed) {
    croft.shellUsed = true;
    croftSpark(croft.x, croft.y, '#c8d4ff', 12);
    spawnPopLabel(croft.x * croft.scale, (croft.y - 8) * croft.scale, '🛡️', '');
    croft.iframes = 0.7;
    return;
  }
  croft.hearts--;
  croft.iframes = CROFT_HIT_IFRAMES;
  croft.combo = 0;
  ArcadeKit.kick(9, 300);
  ArcadeKit.hitStop(80);
  croftSpark(croft.x, croft.y, '#ff6a5a', 10);
  if (b.riposte) {
    for (const e of croft.foes) {
      const dx = e.x - croft.x, dy = e.y - croft.y, d = Math.hypot(dx, dy) || 1;
      if (d < 42 && e.kind !== 'sexton') { e.vx += (dx / d) * 240; e.vy += (dy / d) * 240; e.hp -= 1; e.hurtT = 0.12; }
    }
    for (let i = croft.foes.length - 1; i >= 0; i--) if (croft.foes[i].hp <= 0) croftKillFoe(i);
    croftSpark(croft.x, croft.y, '#ffe86a', 16);
  }
  if (croft.hearts <= 0) {
    croft.phase = 'over';
    croft.outT = 0;
    const fl = croft.floor;
    if (fl > croft.best) croft.best = fl;
    ArcadeKit.saveBest('croft', croft.cfg.key, fl);
    const md = ArcadeKit.medal(fl, [3, 6, 9]);
    croftBanner('💀 THE DARK KEEPS THE RELICS — B' + fl +
      (md.emoji ? ' · ' + md.emoji + ' ' + md.label : ''), 'over', 3.4);
  }
}

function croftSpark(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 7, s = 20 + Math.random() * 50;
    croft.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.3 + Math.random() * 0.35, c: color, r: 1 + Math.random() * 1.5 });
  }
}

// ---- per-frame ----------------------------------------------------------------------

function stepCroft(dt, w, h) {
  if (!croft.on) return;
  dt *= ArcadeKit.refreshTimeScale();
  croft.t += dt;
  if (croft.phase === 'tier') { croftDraw(); return; }
  if (croft.choosing) { croftDraw(); return; } // the reliquary is open; hold everything

  if (croft.fade) {
    croft.fade.t += dt;
    if (croft.fade.out && croft.fade.t >= 0.26) { croft.fade.out = false; croft.fade.t = 0; croft.fade.cb(); }
    else if (!croft.fade.out && croft.fade.t >= 0.26) croft.fade = null;
    croftDraw();
    return;
  }

  if (croft.phase === 'over') {
    croft.outT += dt;
    croftDraw();
    return;
  }

  const b = croft.build;

  // ---- move ----
  let mx = 0, my = 0;
  if (croft.keys.left) mx -= 1;
  if (croft.keys.right) mx += 1;
  if (croft.keys.up) my -= 1;
  if (croft.keys.down) my += 1;
  if (croft.pointer) {
    const dxp = croft.pointer.x - croft.x, dyp = croft.pointer.y - croft.y;
    const dp = Math.hypot(dxp, dyp);
    if (dp > 6) { mx = dxp / dp; my = dyp / dp; }
  }
  const ml = Math.hypot(mx, my);
  if (ml > 0) {
    mx /= ml; my /= ml;
    croft.fx = mx; croft.fy = my;
  }
  const spd = 62 * b.speed * (croft.dashT > 0 ? 3.1 : 1);
  croft.vx += (mx * spd - croft.vx) * Math.min(1, 14 * dt);
  croft.vy += (my * spd - croft.vy) * Math.min(1, 14 * dt);
  croft.x += croft.vx * dt;
  croft.y += croft.vy * dt;
  croft.dashT = Math.max(0, croft.dashT - dt);

  // room bounds + pillars
  const lo = CROFT_WALL + 5;
  croft.x = Math.max(lo, Math.min(croft.W - lo, croft.x));
  croft.y = Math.max(lo, Math.min(croft.Hh - lo, croft.y));
  for (const p of croft.pillars) {
    const dx = croft.x - p.x, dy = croft.y - p.y, d = Math.hypot(dx, dy);
    if (d < p.r + 4 && d > 0) { croft.x = p.x + (dx / d) * (p.r + 4); croft.y = p.y + (dy / d) * (p.r + 4); }
  }

  croft.iframes = Math.max(0, croft.iframes - dt);
  croft.slashCd = Math.max(0, croft.slashCd - dt);
  croft.slashT = Math.max(0, croft.slashT - dt);
  croft.comboT -= dt;
  if (croft.comboT <= 0) croft.combo = 0;

  // ---- pods pop ----
  for (let i = croft.pods.length - 1; i >= 0; i--) {
    const pod = croft.pods[i];
    pod.t -= dt;
    if (pod.t <= 0) {
      croftPodPop(pod);
      croftSpark(pod.x, pod.y, '#e8d9a0', 6);
      croft.pods.splice(i, 1);
    }
  }

  // ---- foes ----
  for (let i = croft.foes.length - 1; i >= 0; i--) {
    const e = croft.foes[i];
    const def = CROFT_FOES[e.kind];
    const dx = croft.x - e.x, dy = croft.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.hurtT = Math.max(0, e.hurtT - dt);
    e.hitCd = Math.max(0, (e.hitCd || 0) - dt);

    // burning
    if (e.burn > 0) {
      e.burn -= dt;
      e.burnTick = (e.burnTick || 0) - dt;
      if (e.burnTick <= 0) {
        e.burnTick = 0.6;
        e.hp -= 1;
        croftSpark(e.x, e.y, '#ff9a3a', 3);
        if (e.hp <= 0) { croftKillFoe(i); continue; }
      }
    }

    if (e.kind === 'sexton') {
      // slow pursuit; periodic slam with a telegraph ring; snuffs your light up close
      e.x += (dx / d) * 13 * croft.cfg.eSpd * dt;
      e.y += (dy / d) * 13 * croft.cfg.eSpd * dt;
      e.slamT -= dt;
      if (e.slamT <= 0 && e.slamWarn <= 0 && d < 60) e.slamWarn = 0.8;
      if (e.slamWarn > 0) {
        e.slamWarn -= dt;
        if (e.slamWarn <= 0) {
          e.slamT = 3.2;
          croftSpark(e.x, e.y, '#c8b8ff', 18);
          ArcadeKit.kick(10, 300);
          if (Math.hypot(croft.x - e.x, croft.y - e.y) < 34) croftHeroHit(e.x, e.y);
        }
      }
      if (d < e.r + 5) croftHeroHit(e.x, e.y);
      continue;
    }

    let sp = def.spd * croft.cfg.eSpd;
    if (def.drift) {
      // wisps wander, glowing; they only half-remember they're hostile
      e.x += (Math.sin(croft.t * 0.9 + e.ph) * 18 + (dx / d) * sp * 0.5) * dt;
      e.y += (Math.cos(croft.t * 0.7 + e.ph) * 18 + (dy / d) * sp * 0.5) * dt;
    } else if (def.dash) {
      e.dashT -= dt;
      if (e.dashT <= 0) {
        if (e.dashing) { e.dashing = false; e.dashT = 1.2 + Math.random(); }
        else if (d < 80) { e.dashing = true; e.dashT = 0.5; e.ddx = dx / d; e.ddy = dy / d; }
        else e.dashT = 0.4;
      }
      if (e.dashing) { e.x += e.ddx * sp * 4.2 * dt; e.y += e.ddy * sp * 4.2 * dt; }
      else { e.x += (dx / d) * sp * 0.5 * dt; e.y += (dy / d) * sp * 0.5 * dt; }
    } else if (def.lob) {
      // sentries keep their distance and lob batter globs with a little lead
      if (d < 55) { e.x -= (dx / d) * sp * dt; e.y -= (dy / d) * sp * dt; }
      e.lungeT -= dt;
      if (e.lungeT <= 0) {
        e.lungeT = 2.4 + Math.random() * 1.2;
        const tt = d / 60;
        const ax = croft.x + croft.vx * tt * 0.5, ay = croft.y + croft.vy * tt * 0.5;
        const aa = Math.atan2(ay - e.y, ax - e.x);
        croft.shots.push({ x: e.x, y: e.y, vx: Math.cos(aa) * 58, vy: Math.sin(aa) * 58, t: 0 });
      }
    } else if (def.lunge) {
      e.lungeT -= dt;
      if (e.lungeT <= 0 && d < 46) { e.vx += (dx / d) * 150; e.vy += (dy / d) * 150; e.lungeT = 1.6 + Math.random(); }
      e.x += (dx / d) * sp * dt;
      e.y += (dy / d) * sp * dt;
    } else if (def.spin) {
      // whisks orbit in, spiralling
      const oa = Math.atan2(-dy, -dx) + 1.2;
      e.x += (Math.cos(oa) * sp + (dx / d) * sp * 0.6) * dt;
      e.y += (Math.sin(oa) * sp + (dy / d) * sp * 0.6) * dt;
    } else {
      e.x += (dx / d) * sp * dt;
      e.y += (dy / d) * sp * dt;
    }
    // knockback decay
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.vx *= Math.max(0, 1 - 8 * dt);
    e.vy *= Math.max(0, 1 - 8 * dt);
    // stay in the room
    e.x = Math.max(lo, Math.min(croft.W - lo, e.x));
    e.y = Math.max(lo, Math.min(croft.Hh - lo, e.y));

    // orbiting votive flames burn what they touch
    if (b.torch) {
      for (let k = 0; k < b.torch; k++) {
        const oa = croft.t * 2.2 + k * Math.PI;
        const ox = croft.x + Math.cos(oa) * 20, oy = croft.y + Math.sin(oa) * 20;
        if (e.hitCd <= 0 && Math.hypot(e.x - ox, e.y - oy) < e.r + 4) {
          e.hp -= 1; e.hurtT = 0.12; e.hitCd = 0.5;
          croftSpark(ox, oy, '#ffb03a', 4);
          if (e.hp <= 0) { croftKillFoe(i); break; }
        }
      }
      if (!croft.foes[i] || croft.foes[i] !== e) continue;
    }

    // contact
    if (d < e.r + 5) croftHeroHit(e.x, e.y);
  }

  // ---- shots ----
  for (let i = croft.shots.length - 1; i >= 0; i--) {
    const s = croft.shots[i];
    s.t += dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.x < CROFT_WALL || s.x > croft.W - CROFT_WALL || s.y < CROFT_WALL || s.y > croft.Hh - CROFT_WALL || s.t > 4) {
      croft.shots.splice(i, 1);
      continue;
    }
    if (Math.hypot(s.x - croft.x, s.y - croft.y) < 7) {
      croft.shots.splice(i, 1);
      croftHeroHit(s.x, s.y);
    }
  }

  // ---- loot ----
  for (let i = croft.loot.length - 1; i >= 0; i--) {
    const l = croft.loot[i];
    if (l.kind !== 'crumb') continue;
    if (b.magnet) {
      const dx = croft.x - l.x, dy = croft.y - l.y, d = Math.hypot(dx, dy) || 1;
      if (d < 60) { l.x += (dx / d) * 70 * dt; l.y += (dy / d) * 70 * dt; }
    }
    if (Math.hypot(l.x - croft.x, l.y - croft.y) < 8) {
      croft.loot.splice(i, 1);
      if (l.heal && croft.hearts < b.maxHearts) {
        croft.hearts++;
        spawnPopLabel(croft.x * croft.scale, (croft.y - 8) * croft.scale, '❤️', 'golden');
      } else {
        croftPay(2, '🍞', false);
      }
    }
  }

  // ---- particles ----
  for (let i = croft.parts.length - 1; i >= 0; i--) {
    const p = croft.parts[i];
    p.t += dt;
    if (p.t >= p.life) { croft.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
  }

  // ---- room clear → the reliquary ----
  if (!croft.cleared && (croft.roomKind === 'combat' || croft.roomKind === 'sexton') &&
      croft.foes.length === 0 && croft.pods.length === 0) {
    croft.cleared = true;
    croft.clearT = croft.t;
    croft.roomsCleared++;
    croftPay(croft.roomKind === 'sexton' ? 40 : 10, '⛧', croft.roomKind === 'sexton');
    croftBanner('⛧ ROOM CLEARED', 'go', 1.2);
  }
  if (croft.cleared && croft.clearT && croft.t - croft.clearT > 0.85 &&
      (croft.roomKind === 'combat' || croft.roomKind === 'sexton')) {
    croft.clearT = 0;
    croftOfferBoon();
  }

  // ---- the way on ----
  if (croft.cleared && !croft.clearT) {
    // east arch
    if (croft.roomKind !== 'door' && croft.x > croft.W - CROFT_WALL - 7 &&
        Math.abs(croft.y - croft.Hh / 2) < 13) {
      croftFadeTo(() => croftEnterRoom(croft.floor, croft.room + 1));
    }
    // the stairs down
    if ((croft.roomKind === 'stairs' || croft.roomKind === 'door') && croft.stairs &&
        Math.hypot(croft.x - croft.stairs.x, croft.y - croft.stairs.y) < croft.stairs.r) {
      const nf = croft.floor + 1;
      croftPay(24, '⬇️', false);
      if (croft.roomKind === 'door') croft.doorRoomDone = true;
      croftFadeTo(() => {
        croftEnterRoom(nf, 1);
        const pal = CROFT_FLOORS[(nf - 1) % CROFT_FLOORS.length];
        croftBanner('▼ B' + nf + ' — ' + pal.name, '', 2);
      });
    }
  }

  // THE DOOR — walk up to it once
  if (croft.roomKind === 'door' && croft.theDoor && !croft.doorSeenRun &&
      Math.hypot(croft.x - croft.theDoor.x, croft.y - croft.theDoor.y) < croft.theDoor.r) {
    croft.doorSeenRun = true;
    const first = !croftFoundDoor();
    try { localStorage.setItem('nugCroftDoor', '1'); } catch (e) { /* ok */ }
    croftPay(first ? 200 : 60, '🚪✨', true);
    croftBanner(first
      ? '🚪 THE DOOR THAT ISN\'T ON THE PLANS — "leave it a door." you found it.'
      : '🚪 still shut. still listening. water on the other side, moving.', 'lore', first ? 4.4 : 3);
    ArcadeKit.kick(6, 400);
    ArcadeKit.burst(window.innerWidth / 2, window.innerHeight * 0.4, { n: 22, emoji: '✨', size: 16, speed: 300 });
  }

  croftDraw();
}

function croftFadeTo(cb) {
  croft.fade = { t: 0, out: true, cb };
}

// Any press while dead starts a fresh run on the same oath.
function croftPress() {
  if (croft.phase === 'over' && croft.outT > 1.2) {
    croft.doorRoomDone = false;
    croftNewRun(croft.cfg);
  }
}

// ---- drawing ------------------------------------------------------------------------

function croftDraw() {
  const g = croft.g, W = croft.W, H = croft.Hh;
  if (!g) return;
  const b = croft.build;
  const sh = ArcadeKit.shakeXY();
  g.save();
  g.translate(Math.round(sh.x / croft.scale), Math.round(sh.y / croft.scale));

  // the room's bones
  if (croft.base) g.drawImage(croft.base, 0, 0);
  else { g.fillStyle = '#0a0a10'; g.fillRect(0, 0, W, H); }

  // spawn pods: batter bubbles telegraphing the fight
  for (const pod of croft.pods) {
    const q = Math.max(0, Math.min(1, 1 - pod.t / 1.4));
    g.fillStyle = 'rgba(230,210,140,' + (0.15 + q * 0.25) + ')';
    g.beginPath(); g.arc(pod.x, pod.y, 3 + q * 4, 0, 7); g.fill();
    g.strokeStyle = 'rgba(230,210,140,' + (0.3 + q * 0.4) + ')';
    g.beginPath(); g.arc(pod.x, pod.y, 5 + q * 4 + Math.sin(croft.t * 9) * 0.7, 0, 7); g.stroke();
  }

  // loot
  for (const l of croft.loot) {
    if (l.kind === 'barrel') {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(l.x, l.y + 4, 5.5, 2.2, 0, 0, 7); g.fill();
      g.fillStyle = '#6d5426';
      g.fillRect(l.x - 4.5, l.y - 5, 9, 10);
      g.fillStyle = '#42320e';
      g.fillRect(l.x - 5, l.y - 3, 10, 1.5);
      g.fillRect(l.x - 5, l.y + 1.5, 10, 1.5);
    } else {
      const bob = Math.sin(croft.t * 3 + l.x) * 1;
      g.fillStyle = l.heal ? '#ff8a9a' : '#ffd166';
      g.beginPath(); g.arc(l.x, l.y + bob, l.r, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(l.x - 0.8, l.y + bob - 0.8, 1, 1);
    }
  }

  // shots (batter globs)
  for (const s of croft.shots) {
    g.fillStyle = '#e8d9a0';
    g.beginPath(); g.arc(s.x, s.y, 2.6, 0, 7); g.fill();
    g.fillStyle = 'rgba(232,217,160,0.35)';
    g.beginPath(); g.arc(s.x - s.vx * 0.02, s.y - s.vy * 0.02, 2, 0, 7); g.fill();
  }

  // foes (sorted by y so they overlap like they're standing on the floor)
  const sorted = croft.foes.slice().sort((a, c) => a.y - c.y);
  for (const e of sorted) croftDrawFoe(g, e);

  // the delver
  if (croft.phase !== 'over') croftDrawHero(g);

  // particles
  for (const p of croft.parts) {
    const q = 1 - p.t / p.life;
    g.fillStyle = p.c;
    g.globalAlpha = q;
    g.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    g.globalAlpha = 1;
  }

  // ---- THE DARK (the lighting pass) ----
  croftDrawLighting(g, W, H);

  // ---- additive hot cores ----
  croftDrawGlow(g, W, H);

  // HUD
  croftDrawHud(g, W, H);

  // fades + death veil
  if (croft.fade) {
    const q = croft.fade.out ? croft.fade.t / 0.26 : 1 - croft.fade.t / 0.26;
    g.fillStyle = 'rgba(2,2,6,' + Math.min(1, q) + ')';
    g.fillRect(-2, -2, W + 4, H + 4);
  }
  if (croft.phase === 'over') {
    g.fillStyle = 'rgba(2,2,6,' + Math.min(croft.outT * 1.2, 0.8) + ')';
    g.fillRect(-2, -2, W + 4, H + 4);
    if (croft.outT > 1.2) {
      g.textAlign = 'center';
      g.font = '900 9px Consolas, monospace';
      g.fillStyle = 0.5 + 0.5 * Math.sin(croft.t * 3) > 0.5 ? '#e8d9b0' : 'rgba(232,217,176,0.4)';
      g.fillText('press to delve again', W / 2, H * 0.62);
    }
  }
  g.restore();
}

function croftDrawFoe(g, e) {
  const flash = e.hurtT > 0;
  const bob = Math.sin(croft.t * 4 + e.ph) * 1;
  // floor shadow
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath(); g.ellipse(e.x, e.y + e.r * 0.8, e.r * 0.9, e.r * 0.35, 0, 0, 7); g.fill();

  if (e.kind === 'sexton') {
    // THE SEXTON: a great bell-shaped snuffer on a stalk, robed in old wax
    g.fillStyle = flash ? '#ffffff' : '#3a3448';
    g.beginPath(); g.ellipse(e.x, e.y + bob, e.r, e.r * 1.15, 0, 0, 7); g.fill();
    g.fillStyle = flash ? '#ffffff' : '#4a4460';
    g.beginPath(); g.arc(e.x, e.y - e.r * 0.9 + bob, e.r * 0.55, Math.PI, 0); g.fill();
    g.fillStyle = '#8a84a0';
    g.fillRect(e.x - 1, e.y - e.r * 1.6 + bob, 2, e.r * 0.7); // the handle
    // wax drips
    g.fillStyle = '#c8bea0';
    g.fillRect(e.x - e.r * 0.6, e.y + bob, 2, 4);
    g.fillRect(e.x + e.r * 0.4, e.y + bob + 2, 2, 3);
    // the slam telegraph
    if (e.slamWarn > 0) {
      const q = 1 - e.slamWarn / 0.8;
      g.strokeStyle = 'rgba(200,180,255,' + (0.3 + q * 0.5) + ')';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(e.x, e.y, 34 * q + 4, 0, 7); g.stroke();
    }
    // health bar
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(e.x - 12, e.y - e.r * 1.9, 24, 3);
    g.fillStyle = '#c8b8ff';
    g.fillRect(e.x - 11, e.y - e.r * 1.9 + 0.5, 22 * Math.max(0, e.hp / e.maxHp), 2);
    return;
  }

  const def = CROFT_FOES[e.kind];
  const c0 = e.golden ? '#ffd23a' : (flash ? '#ffffff' : def.pal[0]);
  const c1 = e.golden ? '#fff3c0' : (flash ? '#ffffff' : def.pal[1]);
  if (e.kind === 'rat') {
    g.fillStyle = c0;
    g.beginPath(); g.ellipse(e.x, e.y + bob, 4.5, 3, Math.atan2(croft.y - e.y, croft.x - e.x), 0, 7); g.fill();
    g.fillStyle = c1;
    g.fillRect(e.x - 1, e.y + bob - 1, 1.5, 1.5); // an eye-glint of intent
    g.strokeStyle = c0;
    g.beginPath(); g.moveTo(e.x, e.y + bob); g.lineTo(e.x - Math.cos(croft.t * 8) * 5, e.y + bob + 2); g.stroke(); // tail
  } else if (e.kind === 'spork') {
    g.fillStyle = c0;
    g.fillRect(e.x - 1.5, e.y - 7 + bob, 3, 12);         // handle
    g.fillStyle = c1;
    g.beginPath(); g.arc(e.x, e.y - 6 + bob, 4, Math.PI, 0); g.fill(); // the bowl
    g.fillRect(e.x - 4, e.y - 8 + bob, 1.6, 3); g.fillRect(e.x - 0.8, e.y - 9 + bob, 1.6, 4); g.fillRect(e.x + 2.4, e.y - 8 + bob, 1.6, 3);
    g.fillStyle = '#5a4426'; // rust
    g.fillRect(e.x - 1, e.y + bob, 2, 2);
  } else if (e.kind === 'knife') {
    const a = e.dashing ? Math.atan2(e.ddy, e.ddx) : Math.atan2(croft.y - e.y, croft.x - e.x);
    g.save();
    g.translate(e.x, e.y + bob);
    g.rotate(a + Math.PI / 2);
    g.fillStyle = c1;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(3, 2); g.lineTo(-3, 2); g.fill(); // blade
    g.fillStyle = '#42320e';
    g.fillRect(-2, 2, 4, 5); // waxy grip
    g.restore();
    if (e.dashing) { g.fillStyle = 'rgba(226,232,242,0.25)'; g.fillRect(e.x - e.ddx * 8 - 1, e.y - e.ddy * 8 - 1, 2, 2); }
  } else if (e.kind === 'wisp') {
    // drawn mostly by the glow pass; here just the seed
    g.fillStyle = c1;
    g.beginPath(); g.arc(e.x, e.y + bob, 2.2, 0, 7); g.fill();
  } else if (e.kind === 'spoon') {
    g.fillStyle = c0;
    g.fillRect(e.x - 1.5, e.y - 5 + bob, 3, 11);
    g.fillStyle = c1;
    g.beginPath(); g.ellipse(e.x, e.y - 6 + bob, 4.2, 5, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(232,217,160,0.8)'; // a scoop of batter, ready
    g.beginPath(); g.arc(e.x, e.y - 6 + bob, 2, 0, 7); g.fill();
  } else if (e.kind === 'whisk') {
    const spin = croft.t * 9 + e.ph;
    g.strokeStyle = c1;
    g.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.ellipse(e.x, e.y - 2 + bob, 4 * Math.abs(Math.cos(spin + k)), 7, 0, 0, 7);
      g.stroke();
    }
    g.fillStyle = c0;
    g.fillRect(e.x - 1.5, e.y + 4 + bob, 3, 5);
  }
  if (e.burn > 0) {
    g.fillStyle = 'rgba(255,154,58,' + (0.5 + Math.sin(croft.t * 12) * 0.3) + ')';
    g.fillRect(e.x - 1 + Math.sin(croft.t * 14) * 1.5, e.y - e.r - 3 + bob, 2, 3);
  }
}

function croftDrawHero(g) {
  const blink = croft.iframes > 0 && Math.floor(croft.t * 12) % 2 === 0;
  if (blink) return;
  const x = croft.x, y = croft.y;
  const moving = Math.hypot(croft.vx, croft.vy) > 8;
  const step = moving ? Math.sin(croft.t * 11) * 1.4 : 0;
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath(); g.ellipse(x, y + 6, 5.5, 2.2, 0, 0, 7); g.fill();
  // feet
  g.fillStyle = '#8a5c20';
  g.fillRect(x - 3.5, y + 3 + step, 3, 2.5);
  g.fillRect(x + 0.5, y + 3 - step, 3, 2.5);
  // the nug in a tabard
  g.fillStyle = '#e8a020';
  g.beginPath(); g.ellipse(x, y - 1, 5.5, 6.5, 0, 0, 7); g.fill();
  g.fillStyle = '#7c3aed'; // the fort's colors, faded to crypt-purple
  g.fillRect(x - 4, y - 3, 8, 6);
  g.fillStyle = '#ffd166';
  g.fillRect(x - 0.8, y - 3, 1.6, 6); // tabard stripe
  // brass helm
  g.strokeStyle = '#c8a04a';
  g.lineWidth = 1.6;
  g.beginPath(); g.arc(x, y - 4.5, 4, Math.PI * 0.95, Math.PI * 0.05); g.stroke();
  g.fillStyle = '#fff3c0';
  g.fillRect(x - 2 + croft.fx * 1.4, y - 5.5 + croft.fy * 1.2, 1.4, 1.4); // eyes toward facing
  g.fillRect(x + 0.8 + croft.fx * 1.4, y - 5.5 + croft.fy * 1.2, 1.4, 1.4);
  // the lantern, held toward facing (the light source lives here)
  const lx = x + croft.fx * 6, ly = y + croft.fy * 6 - 1;
  g.strokeStyle = '#8a7a5a';
  g.beginPath(); g.moveTo(x + croft.fx * 3, y - 1); g.lineTo(lx, ly - 2); g.stroke();
  g.fillStyle = '#3a3020';
  g.fillRect(lx - 1.5, ly - 2, 3, 4);
  g.fillStyle = '#ffd23a';
  g.fillRect(lx - 0.8, ly - 1, 1.6, 2);
  // orbiting votive flames (torchbearer)
  for (let k = 0; k < croft.build.torch; k++) {
    const oa = croft.t * 2.2 + k * Math.PI;
    const ox = x + Math.cos(oa) * 20, oy = y + Math.sin(oa) * 20;
    g.fillStyle = '#ffb03a';
    g.fillRect(ox - 1, oy - 2 + Math.sin(croft.t * 10 + k) * 0.6, 2, 3);
  }
  // the slash: a bright sweep in facing direction
  if (croft.slashT > 0) {
    const q = croft.slashT / 0.16;
    const reach = 16 * croft.build.reach;
    const arcHalf = croft.build.whirl ? Math.PI : 1.15;
    g.strokeStyle = croft.build.ember ? 'rgba(255,154,58,' + (0.7 * q) + ')' : 'rgba(240,240,255,' + (0.7 * q) + ')';
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(x, y, reach - 2, croft.slashA - arcHalf * (1 - q * 0.4), croft.slashA + arcHalf * (1 - q * 0.4));
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,' + (0.9 * q) + ')';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x, y, reach - 2, croft.slashA - arcHalf * 0.5, croft.slashA + arcHalf * 0.5);
    g.stroke();
  }
  // dash streak
  if (croft.dashT > 0) {
    g.fillStyle = 'rgba(200,220,255,0.3)';
    g.fillRect(x - croft.fx * 8 - 2, y - croft.fy * 8 - 2, 4, 4);
  }
}

// The dark is a canvas: fill it with the floor's night, then ERASE the lights.
function croftLightsList() {
  const L = [];
  const b = croft.build;
  const R = croft.Hh; // light radii scale with the ROOM, not with pixels
  const flick = 1 + 0.035 * Math.sin(croft.t * 11) + 0.02 * Math.sin(croft.t * 23);
  // the lantern rides slightly ahead of the delver, in the held-lamp's hand
  if (croft.phase !== 'over') {
    L.push({ x: croft.x + croft.fx * 5, y: croft.y + croft.fy * 5,
      r: R * 0.40 * b.lantern * croft.cfg.light * flick * croftSextonSnuff(), i: 1 });
  }
  for (const tc of croft.torches) {
    L.push({ x: tc.x, y: tc.y, r: R * 0.17 * (0.9 + 0.15 * Math.sin(croft.t * 9 + tc.ph)), i: 0.85 });
  }
  for (const e of croft.foes) {
    if (e.kind === 'wisp') L.push({ x: e.x, y: e.y, r: R * 0.15, i: 0.8 });
    if (e.golden) L.push({ x: e.x, y: e.y, r: R * 0.08, i: 0.5 });
    if (e.burn > 0) L.push({ x: e.x, y: e.y, r: R * 0.07, i: 0.5 });
  }
  for (const pod of croft.pods) L.push({ x: pod.x, y: pod.y, r: R * 0.05, i: 0.4 });
  for (const s of croft.shots) L.push({ x: s.x, y: s.y, r: R * 0.04, i: 0.35 });
  for (const l of croft.loot) if (l.kind === 'crumb') L.push({ x: l.x, y: l.y, r: R * 0.05, i: 0.4 });
  for (let k = 0; k < b.torch; k++) {
    const oa = croft.t * 2.2 + k * Math.PI;
    L.push({ x: croft.x + Math.cos(oa) * 20, y: croft.y + Math.sin(oa) * 20, r: R * 0.09, i: 0.7 });
  }
  if (croft.slashT > 0) {
    L.push({ x: croft.x + croft.fx * 10, y: croft.y + croft.fy * 10, r: R * 0.14 * (croft.slashT / 0.16), i: 0.6 });
  }
  if (croft.roomKind === 'door' && croft.theDoor) {
    L.push({ x: croft.theDoor.x, y: CROFT_WALL, r: R * 0.19 + Math.sin(croft.t * 1.4) * 3, i: 0.75 });
  }
  if (croft.roomKind === 'stairs' && croft.stairs) {
    L.push({ x: croft.stairs.x, y: croft.stairs.y, r: R * 0.08, i: 0.35 });
  }
  return L;
}

// THE SEXTON snuffs: your lantern shrinks near him. The dark is his.
function croftSextonSnuff() {
  let q = 1;
  for (const e of croft.foes) {
    if (e.kind !== 'sexton') continue;
    const d = Math.hypot(croft.x - e.x, croft.y - e.y);
    if (d < 55) q = Math.min(q, 0.55 + 0.45 * (d / 55));
  }
  return q;
}

function croftDrawLighting(g, W, H) {
  const lg = croft.lg;
  if (!lg) return;
  const depthDark = Math.min(0.05, (croft.floor - 1) * 0.006);
  lg.globalCompositeOperation = 'source-over';
  lg.fillStyle = 'rgba(3,4,12,' + Math.min(0.97, croft.cfg.dark + depthDark) + ')';
  lg.clearRect(0, 0, W, H);
  lg.fillRect(0, 0, W, H);
  lg.globalCompositeOperation = 'destination-out';
  for (const l of croftLightsList()) {
    const grad = lg.createRadialGradient(l.x, l.y, 1, l.x, l.y, Math.max(2, l.r));
    grad.addColorStop(0, 'rgba(0,0,0,' + l.i + ')');
    grad.addColorStop(0.55, 'rgba(0,0,0,' + l.i * 0.55 + ')');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    lg.fillStyle = grad;
    lg.beginPath(); lg.arc(l.x, l.y, l.r, 0, 7); lg.fill();
  }
  g.drawImage(croft.lcv, 0, 0);

  // THE SEXTON eats light: he carries his own patch of dark over the lit floor
  for (const e of croft.foes) {
    if (e.kind !== 'sexton') continue;
    const aura = g.createRadialGradient(e.x, e.y, 2, e.x, e.y, H * 0.16);
    aura.addColorStop(0, 'rgba(8,6,18,0.55)');
    aura.addColorStop(1, 'rgba(8,6,18,0)');
    g.fillStyle = aura;
    g.beginPath(); g.arc(e.x, e.y, H * 0.16, 0, 7); g.fill();
  }
}

// Hot cores: additive warmth on flames, wisps, the seam of THE DOOR.
function croftDrawGlow(g, W, H) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  const warm = (x, y, r, cr, cg, cb, a) => {
    const grad = g.createRadialGradient(x, y, 0.5, x, y, r);
    grad.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a + ')');
    grad.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  };
  // torch flames: a licking core + drawn flame
  for (const tc of croft.torches) {
    const f = Math.sin(croft.t * 10 + tc.ph);
    g.fillStyle = '#5a4426';
    g.fillRect(tc.x - 1, tc.y, 2, 4); // the bracket (drawn here so it sits over the dark)
    g.fillStyle = '#ffb03a';
    g.fillRect(tc.x - 1.2, tc.y - 3 + f * 0.6, 2.4, 3.4);
    g.fillStyle = '#fff3c0';
    g.fillRect(tc.x - 0.5, tc.y - 1.6 + f * 0.4, 1, 1.6);
    warm(tc.x, tc.y - 1, 9, 255, 176, 58, 0.16);
  }
  if (croft.phase !== 'over') {
    warm(croft.x + croft.fx * 6, croft.y + croft.fy * 6, 8, 255, 210, 90, 0.14); // lantern core
  }
  for (const e of croft.foes) {
    if (e.kind === 'wisp') warm(e.x, e.y, 10, 255, 220, 90, 0.22);
    if (e.golden) warm(e.x, e.y, 8, 255, 210, 58, 0.14);
    if (e.burn > 0) warm(e.x, e.y, 7, 255, 140, 40, 0.16);
  }
  for (let k = 0; k < croft.build.torch; k++) {
    const oa = croft.t * 2.2 + k * Math.PI;
    warm(croft.x + Math.cos(oa) * 20, croft.y + Math.sin(oa) * 20, 7, 255, 176, 58, 0.18);
  }
  if (croft.roomKind === 'door' && croft.theDoor) {
    const breathe = 0.14 + 0.08 * Math.sin(croft.t * 1.4);
    warm(croft.theDoor.x, CROFT_WALL + 2, H * 0.14, 255, 210, 58, breathe);
  }
  // dust drifting through the lantern light — visible only where it's lit
  if (croft.motes && croft.phase !== 'over') {
    const lr = H * 0.4 * croft.build.lantern * croft.cfg.light;
    for (const mo of croft.motes) {
      mo.y -= mo.s * 3 * 0.016;
      mo.x += Math.sin(croft.t * 0.6 + mo.ph) * 0.05;
      if (mo.y < -2) { mo.y = H + 2; mo.x = Math.random() * W; }
      const d = Math.hypot(mo.x - croft.x, mo.y - croft.y);
      if (d > lr) continue;
      g.fillStyle = 'rgba(255,235,190,' + (0.35 * (1 - d / lr)) + ')';
      g.fillRect(mo.x, mo.y, 1, 1);
    }
  }
  g.restore();
}

function croftDrawHud(g, W, H) {
  // hearts
  for (let i = 0; i < croft.build.maxHearts; i++) {
    const hx = 8 + i * 9, hy = 8;
    g.fillStyle = i < croft.hearts ? '#ff5a6a' : 'rgba(120,60,70,0.4)';
    g.fillRect(hx, hy, 3, 3); g.fillRect(hx + 4, hy, 3, 3);
    g.fillRect(hx, hy + 2, 7, 3);
    g.fillRect(hx + 1, hy + 5, 5, 2);
    g.fillRect(hx + 2.5, hy + 7, 2, 1);
    if (i < croft.hearts) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(hx + 1, hy + 1, 1.5, 1.5); }
  }
  // floor plate — bottom center, where the storm HUD can't sit on it
  g.textAlign = 'center';
  g.font = '900 8px Consolas, monospace';
  g.fillStyle = 'rgba(232,217,176,0.75)';
  const pal = croftPal();
  g.fillText('B' + croft.floor + ' · ' + pal.name +
    (croft.roomKind === 'stairs' || croft.roomKind === 'door' ? '' : ' · ' + Math.min(croft.room, CROFT_ROOMS_PER_FLOOR) + '/' + CROFT_ROOMS_PER_FLOOR),
    W / 2, H - 4);
  // combo
  if (croft.combo >= 3) {
    g.textAlign = 'right';
    g.fillStyle = '#ffd23a';
    g.font = '900 9px Consolas, monospace';
    g.fillText('🔥x' + croft.combo, W - 8, 12);
  }
  // relic count, quietly
  if (croft.build.picks > 0) {
    g.textAlign = 'left';
    g.font = '700 7px Consolas, monospace';
    g.fillStyle = 'rgba(200,180,120,0.55)';
    g.fillText('⛧ ' + croft.build.picks, 8, H - 6);
  }
}

// ---- input --------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (!croft.on || croft.phase === 'tier' || croft.choosing) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { croft.keys.left = true; e.preventDefault(); }
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') { croft.keys.right = true; e.preventDefault(); }
  else if (e.code === 'ArrowUp' || e.code === 'KeyW') { croft.keys.up = true; e.preventDefault(); }
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') { croft.keys.down = true; e.preventDefault(); }
  else if (e.code === 'KeyX' || e.code === 'KeyZ' || e.code === 'Space') {
    if (croft.phase === 'over') { croftPress(); e.preventDefault(); return; }
    croftSlash(); e.preventDefault();
  } else if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && croft.build.dash && croft.dashT <= 0) {
    croft.dashT = 0.16; croft.iframes = Math.max(croft.iframes, 0.3);
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') croft.keys.left = false;
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') croft.keys.right = false;
  else if (e.code === 'ArrowUp' || e.code === 'KeyW') croft.keys.up = false;
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') croft.keys.down = false;
});
window.addEventListener('mousedown', (e) => {
  if (!croft.on || croft.phase === 'tier' || croft.choosing) return;
  if (e.target.closest('.storm-hud, .ak-tier, .modal-overlay')) return;
  if (croft.phase === 'over') { croftPress(); return; }
  // face the click, then slash it
  const cx = e.clientX / croft.scale, cy = e.clientY / croft.scale;
  const dx = cx - croft.x, dy = cy - croft.y, d = Math.hypot(dx, dy);
  if (d > 1) { croft.fx = dx / d; croft.fy = dy / d; }
  croftSlash();
});
croftWorld.addEventListener('touchstart', (e) => {
  if (croft.phase === 'tier' || croft.choosing) return;
  if (croft.phase === 'over') { croftPress(); e.preventDefault(); return; }
  croft.touchT = croft.t;
  const t = e.touches[0];
  croft.pointer = { x: t.clientX / croft.scale, y: t.clientY / croft.scale };
  // double-tap dashes (with the relic)
  if (croft.build.dash && croft.t - croft.lastTap < 0.3 && croft.dashT <= 0) {
    croft.dashT = 0.16; croft.iframes = Math.max(croft.iframes, 0.3);
  }
  croft.lastTap = croft.t;
  e.preventDefault();
}, { passive: false });
croftWorld.addEventListener('touchmove', (e) => {
  if (!croft.on || !e.touches.length) return;
  const t = e.touches[0];
  croft.pointer = { x: t.clientX / croft.scale, y: t.clientY / croft.scale };
  e.preventDefault();
}, { passive: false });
window.addEventListener('touchend', () => {
  if (!croft.on) return;
  // a quick tap (no drag) is a slash
  if (croft.pointer && croft.t - croft.touchT < 0.18) croftSlash();
  croft.pointer = null;
});
window.addEventListener('resize', () => { if (croft.on) croftLayout(); });

// ---- test/debug hook (blasterDebug school) -------------------------------------------

window.croftDebug = function (opts) {
  opts = opts || {};
  if (opts.tier) {
    const t = CROFT_TIERS.find((x) => x.key === opts.tier);
    if (t) {
      if (croft.tierPick) { croft.tierPick.close(); croft.tierPick = null; }
      croftNewRun(t);
    }
  }
  if (opts.clearRoom) {
    croft.pods = [];
    for (let i = croft.foes.length - 1; i >= 0; i--) croftKillFoe(i);
  }
  if (opts.boon) { const u = CROFT_BOONS.find((x) => x.key === opts.boon); if (u && u.ok(croft.build)) { u.apply(croft.build); croft.build.picks++; } }
  if (opts.showBoons) croftOfferBoon();
  if (opts.pickBoon != null && croft.boonPick) croft.boonPick.choose(opts.pickBoon);
  if (opts.room != null || opts.floor != null) {
    croftEnterRoom(opts.floor != null ? opts.floor : croft.floor,
      opts.room != null ? opts.room : 1);
  }
  if (opts.hearts != null) croft.hearts = opts.hearts;
  if (opts.hit) { croft.iframes = 0; croft.dashT = 0; croftHeroHit(croft.x + 5, croft.y); }
  if (opts.warp) { croft.x = opts.warp[0]; croft.y = opts.warp[1]; }
  return { phase: croft.phase, choosing: croft.choosing, floor: croft.floor, room: croft.room,
    kind: croft.roomKind, cleared: croft.cleared, hearts: croft.hearts,
    foes: croft.foes.length, pods: croft.pods.length,
    build: { ...croft.build }, combo: croft.combo, kills: croft.kills,
    door: croftFoundDoor(), doorSeenRun: croft.doorSeenRun,
    stairs: croft.stairs ? [Math.round(croft.stairs.x), Math.round(croft.stairs.y)] : null,
    theDoor: croft.theDoor ? [Math.round(croft.theDoor.x), Math.round(croft.theDoor.y)] : null,
    at: [Math.round(croft.x), Math.round(croft.y)] };
};
