// ---- GRAND THEFT NUGGET ------------------------------------------------------------
// "WELCOME TO NUGGETOWN. POPULATION: CRISPY."
//
// A top-down open-world crime game in the GTA 1/2 mold (mode key: gta).
// Sprint 1 (IGNITION): tile city, arcade car physics with a real handbrake,
// headlights, rain, lamps, neon, nug-crate pickups, distance pay.
// Sprint 2 (NUGGETOWN): the full city — five districts with their own roofs,
// neon density, and parks; the HARBOR on the east edge (water, warehouses,
// two drivable piers, and a golden something glowing out in the bay — canon
// says the stolen storm lives here); six landmarks with fixed addresses for
// the mission sprints; a radar minimap; district-crossing toasts. You spawn
// on the curb outside THE NUGGET ARCADE, naturally.
// Sprint 3 (LIVING CITY): the city fights back — lane-following traffic that
// brakes, yields, and HONKs; sidewalk pedestrians that flee or crumb; five
// vehicle classes (BATTER tankers run Little Batter, canon: S.W. Logistics);
// hit points, smoke, explosions with splash, and carjacking on E/X.
// The NPD and the syndicate arrive in later sprints (see GTA_SPRINTS.md).
//
// Rendering is the low-res pixel canvas trick from Battered Brawlers / Fast
// Food: a ~300px-tall backing store scaled up with image-rendering: pixelated.
// The camera is north-up with velocity look-ahead; the car rotates, the city
// doesn't. Scoring mirrors the other games: crates, golden nugs, and distance
// pay perFlyer-scaled $$$ into storm.caught (golden 10x territory).

const gtaWorld = document.getElementById('gtaWorld');

const GTA_TILE = 24;              // world px per tile
const GTA_W = 160, GTA_H = 160;   // all of Nuggetown, tiles
const GTA_DRAG = 0.55;            // /sec, rolling resistance (all classes)

// Vehicle classes. Speeds in world px/sec, grip/drift in lateral-kill /sec,
// hp is what the bodywork takes before the fireball. cruise = traffic speed.
const GTA_CLASSES = {
  compact: { name: 'COMPACT', maxFwd: 210, maxRev: 80, accel: 150, brake: 300, grip: 7.5, drift: 1.5, steer: 3.1, r: 7, hp: 100, cruise: 92, L: 19, Wd: 10,
             cols: ['#c23a3a', '#3a6ac2', '#b08a2a', '#4ab06a', '#9a4ab0'] },
  sedan:   { name: 'SEDAN', maxFwd: 185, maxRev: 70, accel: 115, brake: 280, grip: 8.2, drift: 1.8, steer: 2.55, r: 8, hp: 140, cruise: 80, L: 22, Wd: 11,
             cols: ['#5a6272', '#7a4a32', '#3a505f', '#6b6b52'] },
  sports:  { name: 'SPORTS', maxFwd: 278, maxRev: 90, accel: 225, brake: 340, grip: 9.2, drift: 1.15, steer: 3.55, r: 7, hp: 78, cruise: 118, L: 20, Wd: 10,
             cols: ['#ffe23a', '#ff8a3d', '#3ad4ff', '#ff2fa0'] },
  bus:     { name: 'BUS', maxFwd: 140, maxRev: 50, accel: 60, brake: 200, grip: 9.5, drift: 3.2, steer: 1.7, r: 9, hp: 240, cruise: 60, L: 34, Wd: 12,
             cols: ['#c2a53a'] },
  tanker:  { name: 'BATTER TANKER', maxFwd: 150, maxRev: 55, accel: 65, brake: 220, grip: 9.5, drift: 2.6, steer: 1.6, r: 9, hp: 200, cruise: 66, L: 32, Wd: 12,
             cols: ['#d8d4c8'] },
};

// What drives where (canon: S.W. Logistics tankers haunt Little Batter and
// the Grease District; downtown gets the sports cars). [cls, weight] pairs.
const GTA_TRAFFIC_D = [
  [['compact', 4], ['sedan', 4], ['sports', 3], ['bus', 2]],   // downtown
  [['compact', 3], ['sedan', 3], ['tanker', 4], ['bus', 1]],   // little batter
  [['compact', 3], ['sedan', 2], ['tanker', 5]],               // grease district
  [['compact', 5], ['sedan', 4], ['bus', 1]],                  // suburbs
  [['sedan', 2], ['compact', 2], ['tanker', 4]],               // harbor
];

const GTA_TRAFFIC_CAP = 12;       // moving cars around the camera
const GTA_PED_CAP = 22;
const GTA_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];           // E S W N
const GTA_DIR_A = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const GTA_PED_COLS = ['#e8c07a', '#d8b06a', '#f0cc8a', '#c8a05a', '#e0b870'];

// Tile kinds
const GT_BLDG = 0, GT_ROAD = 1, GT_WALK = 2, GT_GRASS = 3, GT_WATER = 4;

// Districts (ids index every per-district table below)
const GTA_DISTRICTS = ['DOWNTOWN', 'LITTLE BATTER', 'GREASE DISTRICT', 'THE SUBURBS', 'THE HARBOR'];
function gtaDistrictAt(tc, tr) {
  if (tc >= GTA_W - 24) return 4;                 // harbor strip, east
  if (tr < 46) return 1;                          // syndicate turf, north
  if (tr >= 106 && tc < 68) return 2;             // industrial southwest
  if (tc < 54) return 3;                          // sleepy west
  return 0;                                       // downtown core
}

const gta = {
  on: false,
  cv: null, g: null, banner: null,
  W: 0, Hh: 0, scale: 1,
  phase: 'title',        // title | play
  t: 0,
  map: null,             // Uint8Array GTA_W * GTA_H
  vRoad: null, hRoad: null, vDash: null, hDash: null,
  blockCol: null,        // per-block rooftop palette index
  landmarks: {},         // key → {c, r, w, h, name, accent, roof, vLeft}
  lmList: [],            // same rects, indexed by lmGrid value - 1
  lmGrid: null,          // Uint8Array; 0 = plain city, else landmark id + 1
  mini: null,            // offscreen minimap canvas, 1px per tile
  stormSpot: null,       // {x, y} — the glow in the bay. don't ask. (do ask Dill)
  district: 0,
  car: { x: 0, y: 0, a: -Math.PI / 2, vx: 0, vy: 0, cls: 'compact', col: '#c23a3a', hp: 100 },
  cam: { x: 0, y: 0 },
  keys: {},
  handbrake: false,
  pickups: [],           // {c, r, gold, taken, respawn}
  skids: [],             // ring buffer of {x, y, a, life}
  cars: [],              // traffic + parked + wrecks: {x,y,a,dir,v,cls,col,hp,parked,wreck,nd,...}
  peds: [],              // {x, y, a, spd, t, flee, col}
  parts: [],             // particles: {x,y,vx,vy,life,max,type,size}
  decals: [],            // crumbs + scorch marks: {x, y, type, life, seed}
  honks: [],             // {x, y, t} — the sound of Nuggetown
  spawnT: 0,             // traffic/ped spawn throttle
  shake: 0,              // screenshake amplitude (explosions)
  smokeT: 0,             // player-car smoke emitter throttle
  wastedT: 0,            // > 0: the WASTED interlude is playing
  crates: 0,
  dist: 0, distPay: 0,
  toastT: 0, toastMsg: '',
  rain: [],
};

// Where the player physically is (Sprint 4 adds on-foot; until then, the car).
function gtaPlayerPos() { return gta.car; }

function gtaActive() {
  return storm.mode === 'gta' && storm.running;
}

function gtaTally() {
  if (gta.phase === 'title') return '"welcome to nuggetown"';
  const spd = Math.round(Math.hypot(gta.car.vx, gta.car.vy) * 0.6);
  return '📦 ' + gta.crates + ' · ' + spd + ' NPH · ' + GTA_DISTRICTS[gta.district];
}

// ---- city generation (seeded — everyone drives the same Nuggetown) -------------------

function gtaHash(c, r) {
  let h = (c * 73856093) ^ (r * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

// Per-district rooftop palettes (index = district id), park odds, neon rarity.
const GTA_ROOFS_D = [
  ['#191627', '#1d1a2e', '#221c2c', '#1a2030'],  // downtown: cold blues
  ['#26201a', '#2a241c', '#241e16', '#2c2218'],  // little batter: warm crust
  ['#241a14', '#2a1c12', '#201812', '#2e2014'],  // grease district: rust
  ['#1a2020', '#1c2426', '#182022', '#202628'],  // suburbs: tired teal
  ['#1a1e26', '#1e222a', '#161a22', '#22262e'],  // harbor: warehouse steel
];
const GTA_PARK_ODDS = [0.05, 0.08, 0.03, 0.34, 0.02];
const GTA_NEON_MOD = [7, 9, 14, 26, 22];         // hash modulus: lower = more neon
const GTA_NEON = ['#ff2fa0', '#39ff7a', '#3ad4ff', '#ffe23a', '#ff8a3d'];

// Landmarks: fixed addresses the mission sprints can rely on. d = district,
// (tc, tr) = preferred tile; placement snaps to the nearest matching block.
const GTA_LANDMARKS = [
  { key: 'arcade',  name: 'THE NUGGET ARCADE', d: 0, tc: 86,  tr: 76,  accent: '#ffe23a', roof: '#252038' },
  { key: 'npd',     name: 'NPD HQ',            d: 0, tc: 106, tr: 58,  accent: '#3ad4ff', roof: '#1a2438' },
  { key: 'general', name: 'NUGGET GENERAL',    d: 0, tc: 70,  tr: 96,  accent: '#ff5252', roof: '#2c1e26' },
  { key: 'noodle',  name: 'NOODLE NUG',        d: 1, tc: 80,  tr: 24,  accent: '#ff2fa0', roof: '#2a1c2e' },
  { key: 'sauce',   name: 'SAUCE WORKS',       d: 2, tc: 30,  tr: 132, accent: '#ff8a3d', roof: '#2e1e12' },
  { key: 'garage',  name: 'GREASE GARAGE',     d: 2, tc: 56,  tr: 116, accent: '#39ff7a', roof: '#1c2a1a' },
];

function gtaBuildCity() {
  let seed = 20260715; // Nuggetown zoning committee, do not touch
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const SHORE = GTA_W - 16;  // the shore road column pair starts here
  const WATER = GTA_W - 11;  // everything east of this is the bay

  // Road lines: pairs of columns/rows, uneven seeded spacing. The last
  // vertical pair is the shore road; roads never enter the water.
  const vr = [2], hr = [2];
  let c = 10 + Math.floor(rnd() * 4);
  while (c < SHORE - 6) { vr.push(c); c += 9 + Math.floor(rnd() * 6); }
  vr.push(SHORE);
  let r = 9 + Math.floor(rnd() * 4);
  while (r < GTA_H - 7) { hr.push(r); r += 8 + Math.floor(rnd() * 5); }
  hr.push(GTA_H - 4);

  gta.vRoad = new Uint8Array(GTA_W);
  gta.hRoad = new Uint8Array(GTA_H);
  gta.vDash = new Uint8Array(GTA_W); // the second column of each pair carries the dash line
  gta.hDash = new Uint8Array(GTA_H);
  for (const v of vr) { gta.vRoad[v] = 1; gta.vRoad[v + 1] = 1; gta.vDash[v + 1] = 1; }
  for (const h of hr) { gta.hRoad[h] = 1; gta.hRoad[h + 1] = 1; gta.hDash[h + 1] = 1; }

  // Park blocks + rooftop colors, keyed by coarse block index; the suburbs
  // are leafy, the grease district is not.
  const BX = Math.ceil(GTA_W / 10), BY = Math.ceil(GTA_H / 9);
  const park = [];
  gta.blockCol = [];
  for (let by = 0; by < BY; by++) {
    for (let bx = 0; bx < BX; bx++) {
      const dd = gtaDistrictAt(bx * 10 + 5, by * 9 + 4);
      park.push(rnd() < GTA_PARK_ODDS[dd]);
      gta.blockCol.push(Math.floor(rnd() * 4));
    }
  }
  const blockAt = (tc, tr) => Math.floor(tc / 10) + Math.floor(tr / 9) * BX;

  const map = new Uint8Array(GTA_W * GTA_H);
  const road = (tc, tr) => (gta.vRoad[tc] || gta.hRoad[tr]) && tc < SHORE + 2;
  for (let tr = 0; tr < GTA_H; tr++) {
    for (let tc = 0; tc < GTA_W; tc++) {
      let k;
      if (tc >= WATER) k = GT_WATER;
      else if (road(tc, tr)) k = GT_ROAD;
      else if (road(tc - 1, tr) || road(tc + 1, tr) || road(tc, tr - 1) || road(tc, tr + 1)) k = GT_WALK;
      else k = park[blockAt(tc, tr)] ? GT_GRASS : GT_BLDG;
      map[tr * GTA_W + tc] = k;
    }
  }

  // Two drivable piers punch through the warehouse strip into the bay.
  const pierRows = hr.filter((h) => h > 52 && h < GTA_H - 20);
  const piers = [pierRows[Math.floor(pierRows.length * 0.28)], pierRows[Math.floor(pierRows.length * 0.72)]];
  for (const pr of piers) {
    for (let tc = SHORE + 2; tc <= GTA_W - 4; tc++) {
      map[pr * GTA_W + tc] = GT_WALK;
      map[(pr + 1) * GTA_W + tc] = GT_WALK;
    }
  }
  gta.map = map;

  // The glow in the bay, just past the north pier's end. THE CATCH INCIDENT
  // canon: the stolen storm is alive down there. Look. Don't touch.
  gta.stormSpot = { x: (GTA_W - 2.5) * GTA_TILE, y: (piers[0] + 4.5) * GTA_TILE };

  // Landmarks: enumerate buildable block interiors, snap each landmark to
  // the nearest block in its district, claim the tiles.
  const blocks = [];
  for (let i = 0; i < vr.length - 1; i++) {
    const c0 = vr[i] + 3, c1 = vr[i + 1] - 2;
    if (c1 - c0 < 2) continue;
    for (let j = 0; j < hr.length - 1; j++) {
      const r0 = hr[j] + 3, r1 = hr[j + 1] - 2;
      if (r1 - r0 < 2) continue;
      blocks.push({ c0, c1, r0, r1, vLeft: vr[i], hTop: hr[j] });
    }
  }
  gta.landmarks = {};
  gta.lmList = [];
  gta.lmGrid = new Uint8Array(GTA_W * GTA_H);
  const used = new Set();
  for (const L of GTA_LANDMARKS) {
    let best = -1, bd = Infinity;
    for (let bi = 0; bi < blocks.length; bi++) {
      if (used.has(bi)) continue;
      const b = blocks[bi];
      const bc = (b.c0 + b.c1) / 2, br = (b.r0 + b.r1) / 2;
      if (gtaDistrictAt(Math.round(bc), Math.round(br)) !== L.d) continue;
      const dd = (bc - L.tc) * (bc - L.tc) + (br - L.tr) * (br - L.tr);
      if (dd < bd) { bd = dd; best = bi; }
    }
    if (best < 0) continue; // seeded layout should always find one; degrade quietly
    used.add(best);
    const b = blocks[best];
    const w = Math.min(b.c1 - b.c0 + 1, 7), h = Math.min(b.r1 - b.r0 + 1, 5);
    const rect = {
      c: b.c0 + Math.floor((b.c1 - b.c0 + 1 - w) / 2),
      r: b.r0 + Math.floor((b.r1 - b.r0 + 1 - h) / 2),
      w, h, vLeft: b.vLeft, hTop: b.hTop,
      key: L.key, name: L.name, accent: L.accent, roof: L.roof,
    };
    gta.lmList.push(rect);
    gta.landmarks[L.key] = rect;
    for (let tr = rect.r; tr < rect.r + h; tr++) {
      for (let tc = rect.c; tc < rect.c + w; tc++) {
        map[tr * GTA_W + tc] = GT_BLDG; // landmarks trump parks
        gta.lmGrid[tr * GTA_W + tc] = gta.lmList.length;
      }
    }
  }

  // Pickups: nug crates on random road tiles, a few golden nugs way out there.
  gta.pickups = [];
  let placed = 0, guard = 0;
  while (placed < 90 && guard++ < 9000) {
    const tc = Math.floor(rnd() * GTA_W), tr = Math.floor(rnd() * GTA_H);
    if (map[tr * GTA_W + tc] !== GT_ROAD) continue;
    gta.pickups.push({ c: tc, r: tr, gold: false, taken: false, respawn: 0 });
    placed++;
  }
  for (let i = 0; i < 10 && guard < 18000; guard++) {
    const tc = Math.floor(rnd() * GTA_W), tr = Math.floor(rnd() * GTA_H);
    if (map[tr * GTA_W + tc] !== GT_ROAD) continue;
    gta.pickups.push({ c: tc, r: tr, gold: true, taken: false, respawn: 0 });
    i++;
  }

  // The minimap is painted once at gen time, 1px per tile; the HUD blits a
  // radar window from it every frame. Never repaint this per frame.
  const mini = document.createElement('canvas');
  mini.width = GTA_W; mini.height = GTA_H;
  const mg = mini.getContext('2d');
  const MINI_BLDG = ['#262238', '#2e2820', '#2c2018', '#243028', '#222836'];
  for (let tr = 0; tr < GTA_H; tr++) {
    for (let tc = 0; tc < GTA_W; tc++) {
      const k = map[tr * GTA_W + tc];
      mg.fillStyle =
        k === GT_WATER ? '#123048' :
        k === GT_ROAD ? '#40404c' :
        k === GT_WALK ? '#2c2c34' :
        k === GT_GRASS ? '#1b3423' :
        MINI_BLDG[gtaDistrictAt(tc, tr)];
      mg.fillRect(tc, tr, 1, 1);
    }
  }
  for (const L of gta.lmList) { mg.fillStyle = L.accent; mg.fillRect(L.c, L.r, L.w, L.h); }
  mg.fillStyle = '#ffd23a';
  mg.fillRect(Math.floor(gta.stormSpot.x / GTA_TILE) - 1, Math.floor(gta.stormSpot.y / GTA_TILE) - 1, 2, 2);
  gta.mini = mini;

  // Spawn on the curb outside THE NUGGET ARCADE, pointed north. Where else?
  const A = gta.landmarks.arcade;
  if (A) {
    gta.car.x = (A.vLeft + 1) * GTA_TILE;
    gta.car.y = (A.r + 2) * GTA_TILE;
  } else {
    gta.car.x = (vr[Math.floor(vr.length / 2)] + 1) * GTA_TILE;
    gta.car.y = (hr[Math.floor(hr.length / 2)] + 1) * GTA_TILE;
  }
  gta.car.a = -Math.PI / 2;
  gta.car.vx = 0; gta.car.vy = 0;
  gta.cam.x = gta.car.x; gta.cam.y = gta.car.y;
  gta.district = gtaDistrictAt(Math.floor(gta.car.x / GTA_TILE), Math.floor(gta.car.y / GTA_TILE));
}

function gtaTile(tc, tr) {
  if (tc < 0 || tr < 0 || tc >= GTA_W || tr >= GTA_H) return GT_BLDG; // city limits are solid
  return gta.map[tr * GTA_W + tc];
}

function gtaSolidAt(x, y) {
  const k = gtaTile(Math.floor(x / GTA_TILE), Math.floor(y / GTA_TILE));
  return k === GT_BLDG || k === GT_WATER; // you cannot boost the bay (yet)
}

// ---- setup ---------------------------------------------------------------------------

function gtaLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  gta.scale = Math.max(2, Math.floor(vh / 300)); // world is ~300px tall
  gta.W = Math.ceil(vw / gta.scale);
  gta.Hh = Math.ceil(vh / gta.scale);
  gta.cv.width = gta.W;
  gta.cv.height = gta.Hh;
  gta.g.imageSmoothingEnabled = false;
  gta.rain = [];
  for (let i = 0; i < 36; i++)
    gta.rain.push({ x: Math.random() * gta.W, y: Math.random() * gta.Hh, v: 100 + Math.random() * 70 });
}

function syncGta() {
  const active = gtaActive();
  if (active === gta.on) return;
  gta.on = active;
  document.body.classList.toggle('gta-mode', active);
  if (active) {
    if (!gta.cv) {
      gta.cv = document.createElement('canvas');
      gta.g = gta.cv.getContext('2d');
      gtaWorld.appendChild(gta.cv);
      gta.banner = document.createElement('div');
      gta.banner.className = 'gta-banner';
      gtaWorld.appendChild(gta.banner);
    }
    gta.phase = 'title';
    gta.t = 0;
    gta.keys = {};
    gta.handbrake = false;
    gta.skids = [];
    gta.cars = [];
    gta.peds = [];
    gta.parts = [];
    gta.decals = [];
    gta.honks = [];
    gta.spawnT = 0;
    gta.shake = 0;
    gta.wastedT = 0;
    gta.car.cls = 'compact';
    gta.car.col = '#c23a3a';
    gta.car.hp = GTA_CLASSES.compact.hp;
    gta.crates = 0;
    gta.dist = 0; gta.distPay = 0;
    gta.toastT = 0;
    gtaBuildCity();
    gtaLayout();
  } else {
    gta.banner && gta.banner.classList.remove('show');
  }
}

function gtaBanner(text, cls, secs) {
  gta.banner.textContent = text;
  gta.banner.className = 'gta-banner show' + (cls ? ' ' + cls : '');
  void gta.banner.offsetWidth;
  clearTimeout(gta.bannerT);
  gta.bannerT = setTimeout(() => gta.on && gta.banner.classList.remove('show'), (secs || 1.4) * 1000);
}

function gtaStart() {
  gta.phase = 'play';
  gta.toastMsg = GTA_DISTRICTS[gta.district] + ' · NUGGETOWN';
  gta.toastT = 3.2;
  gtaBanner('🌃 NUGGETOWN', 'go', 1.8);
}

// ---- scoring (perFlyer-scaled, like every other game) ---------------------------------

function gtaPay(mult, label, sx, sy) {
  const worth = Math.max(1, Math.round(storm.perFlyer * mult));
  storm.caught += worth;
  if (label) spawnPopLabel(sx * gta.scale, sy * gta.scale, label + ' +' + fmt.format(worth), label.includes('✨') ? 'golden' : '');
  updateStormHud();
}

// ---- the living city: traffic ----------------------------------------------------------
// Right-hand traffic on the road pairs from gen: for a vertical pair (v, v+1)
// southbound runs the left column ((v+0.5)*T), northbound the right; for a
// horizontal pair (h, h+1) eastbound runs the bottom row, westbound the top.
// Cars are lane-locked and drive waypoint-to-waypoint between intersection
// centers, deciding straight/left/right at each one. GTA 1 did it; so do we.

function gtaPairStartV(c) { return gta.vRoad[c - 1] ? c - 1 : c; }
function gtaPairStartH(r) { return gta.hRoad[r - 1] ? r - 1 : r; }
function gtaLaneX(v, dir) { return (dir === 1 ? v + 0.5 : v + 1.5) * GTA_TILE; }
function gtaLaneY(h, dir) { return (dir === 0 ? h + 1.5 : h + 0.5) * GTA_TILE; }

// Next intersection center straight ahead, or null if the road runs out first.
function gtaNextDecision(x, y, dir) {
  const T = GTA_TILE, dx = GTA_DIRS[dir][0], dy = GTA_DIRS[dir][1];
  let tc = Math.floor(x / T), tr = Math.floor(y / T);
  for (let i = 0; i < GTA_W; i++) {
    tc += dx; tr += dy;
    if (tc < 0 || tr < 0 || tc >= GTA_W || tr >= GTA_H) return null;
    if (gtaTile(tc, tr) !== GT_ROAD) return null;
    if (gta.vRoad[tc] && gta.hRoad[tr])
      return { x: (gtaPairStartV(tc) + 1) * T, y: (gtaPairStartH(tr) + 1) * T };
  }
  return null;
}

// At an intersection center: pick straight/left/right (weighted straight),
// but only onto legs that lead to ANOTHER intersection — that's what keeps
// traffic off the dead-end stubs at the map edge. No options = U-turn.
function gtaDecide(car) {
  const T = GTA_TILE;
  const v = gtaPairStartV(Math.floor(car.x / T)), h = gtaPairStartH(Math.floor(car.y / T));
  const opts = [];
  for (const dir of [car.dir, (car.dir + 1) % 4, (car.dir + 3) % 4]) {
    const x = (dir % 2 === 0) ? (v + 1) * T : gtaLaneX(v, dir);
    const y = (dir % 2 === 0) ? gtaLaneY(h, dir) : (h + 1) * T;
    const nd = gtaNextDecision(x, y, dir);
    if (nd) opts.push({ dir, x, y, nd, w: dir === car.dir ? 3 : 1 });
  }
  let pick;
  if (opts.length) {
    let tw = 0; for (const o of opts) tw += o.w;
    let roll = Math.random() * tw;
    for (const o of opts) { roll -= o.w; if (roll <= 0) { pick = o; break; } }
    pick = pick || opts[0];
  } else {
    const dir = (car.dir + 2) % 4; // dead end every way: U-turn
    pick = {
      dir,
      x: (dir % 2 === 0) ? (v + 1) * T : gtaLaneX(v, dir),
      y: (dir % 2 === 0) ? gtaLaneY(h, dir) : (h + 1) * T,
      nd: gtaNextDecision((dir % 2 === 0) ? (v + 1) * T : gtaLaneX(v, dir),
                          (dir % 2 === 0) ? gtaLaneY(h, dir) : (h + 1) * T, dir),
    };
  }
  car.dir = pick.dir;
  car.x = pick.x; car.y = pick.y;
  car.a = GTA_DIR_A[pick.dir];
  car.nd = pick.nd;
}

// Anything a driver brakes for at probe point (px, py).
function gtaObstacleAt(px, py, self) {
  if (gtaSolidAt(px, py)) return 'wall';
  const P = gtaPlayerPos();
  if (Math.abs(P.x - px) < 14 && Math.abs(P.y - py) < 14) return 'player';
  for (const o of gta.cars) {
    if (o === self) continue;
    if (Math.abs(o.x - px) < 14 && Math.abs(o.y - py) < 14) return 'car';
  }
  for (const p of gta.peds) {
    if (Math.abs(p.x - px) < 9 && Math.abs(p.y - py) < 9) return 'ped';
  }
  return null;
}

function gtaStepTrafficCar(car, dt) {
  const C = GTA_CLASSES[car.cls];
  const dx = GTA_DIRS[car.dir][0], dy = GTA_DIRS[car.dir][1];

  // Probe ahead: walls, cars, jaywalkers, the player. Brake for all of it.
  // Two probes: a speed-scaled far one (brake in time) and a fixed bumper one
  // (whatever we stopped behind stays seen — that's what makes honking work).
  const look = C.L * 0.5 + 10 + car.v * 0.38;
  const far = gtaObstacleAt(car.x + dx * look, car.y + dy * look, car);
  const near = gtaObstacleAt(car.x + dx * (C.L * 0.5 + 9), car.y + dy * (C.L * 0.5 + 9), car);
  const hit = near || far;
  let target = hit ? 0 : C.cruise;

  // Yield before entering an occupied intersection (Nuggetown drivers are
  // criminals, not monsters).
  if (target > 0 && car.nd) {
    const ddist = dx ? (car.nd.x - car.x) * dx : (car.nd.y - car.y) * dy;
    if (ddist > 6 && ddist < 36) {
      for (const o of gta.cars) {
        if (o === car || o.parked || o.wreck || o.dir % 2 === car.dir % 2) continue;
        if (Math.abs(o.x - car.nd.x) < 22 && Math.abs(o.y - car.nd.y) < 22) { target = 0; break; }
      }
    }
  }

  if (car.v < target) car.v = Math.min(target, car.v + C.accel * 0.8 * dt);
  else car.v = Math.max(target, car.v - C.brake * dt);

  // Blocked at the bumper by the player long enough → HONK.
  if (near === 'player' && car.v < 10) {
    car.blockT = (car.blockT || 0) + dt;
    if (car.blockT > 1.1) { gta.honks.push({ x: car.x, y: car.y, t: 1.1 }); car.blockT = -1.6; }
  } else if (car.blockT > 0) car.blockT = 0;

  // Advance along the lane; landing on the decision point picks the next leg.
  if (!car.nd) { gtaDecide(car); return; }
  const along = dx ? car.x : car.y;
  const dec = dx ? car.nd.x : car.nd.y;
  const sgn = dx + dy;
  const na = along + sgn * car.v * dt;
  if ((na - dec) * sgn >= 0) {
    car.x = car.nd.x; car.y = car.nd.y;
    gtaDecide(car);
  } else if (dx) car.x = na;
  else car.y = na;
}

function gtaPickClass(d) {
  const table = GTA_TRAFFIC_D[d];
  let tw = 0; for (const e of table) tw += e[1];
  let roll = Math.random() * tw;
  for (const e of table) { roll -= e[1]; if (roll <= 0) return e[0]; }
  return 'compact';
}

function gtaSpawnTraffic() {
  const T = GTA_TILE;
  const R = Math.max(gta.W, gta.Hh) * 0.72;
  for (let tries = 0; tries < 12; tries++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = R + Math.random() * 130;
    const x = gta.cam.x + Math.cos(ang) * rad, y = gta.cam.y + Math.sin(ang) * rad;
    const tc = Math.floor(x / T), tr = Math.floor(y / T);
    if (tc < 1 || tr < 1 || tc >= GTA_W - 1 || tr >= GTA_H - 1) continue;
    if (gtaTile(tc, tr) !== GT_ROAD) continue;
    if (gta.vRoad[tc] && gta.hRoad[tr]) continue; // not mid-intersection
    let dir, sx = x, sy = y;
    if (gta.vRoad[tc]) {
      const v = gtaPairStartV(tc);
      dir = (tc === v) ? 1 : 3;
      sx = gtaLaneX(v, dir);
    } else {
      const h = gtaPairStartH(tr);
      dir = (tr === h) ? 2 : 0;
      sy = gtaLaneY(h, dir);
    }
    const nd = gtaNextDecision(sx, sy, dir);
    if (!nd) continue;
    const cls = gtaPickClass(gtaDistrictAt(tc, tr));
    const C = GTA_CLASSES[cls];
    gta.cars.push({
      x: sx, y: sy, a: GTA_DIR_A[dir], dir, v: C.cruise * (0.7 + Math.random() * 0.3),
      cls, col: C.cols[Math.floor(Math.random() * C.cols.length)], hp: C.hp,
      parked: false, wreck: false, nd, blockT: 0, hitT: 0, emberT: 0,
    });
    return;
  }
}

// ---- the living city: pedestrians ------------------------------------------------------

function gtaSpawnPed() {
  const T = GTA_TILE;
  const R = Math.max(gta.W, gta.Hh) * 0.72;
  for (let tries = 0; tries < 10; tries++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = R + Math.random() * 110;
    const x = gta.cam.x + Math.cos(ang) * rad, y = gta.cam.y + Math.sin(ang) * rad;
    const tc = Math.floor(x / T), tr = Math.floor(y / T);
    if (tc < 1 || tr < 1 || tc >= GTA_W - 14 || tr >= GTA_H - 1) continue; // planks are for anglers
    if (gtaTile(tc, tr) !== GT_WALK) continue;
    gta.peds.push({
      x, y, a: Math.floor(Math.random() * 4) * Math.PI / 2,
      spd: 15 + Math.random() * 13, t: Math.random() * 10, flee: 0,
      col: GTA_PED_COLS[Math.floor(Math.random() * GTA_PED_COLS.length)],
    });
    return;
  }
}

function gtaPedTileOk(x, y, fleeing) {
  const tc = Math.floor(x / GTA_TILE), tr = Math.floor(y / GTA_TILE);
  if (tc >= GTA_W - 14) return false;
  const k = gtaTile(tc, tr);
  return k === GT_WALK || k === GT_GRASS || (fleeing && k === GT_ROAD);
}

function gtaStepPed(p, dt) {
  p.t += dt;
  if (p.flee > 0) p.flee -= dt;

  // A fast car bearing down flips the stroll into a sprint, away from it.
  const P = gtaPlayerPos();
  const pv = gta.onFoot ? 0 : Math.hypot(gta.car.vx, gta.car.vy);
  if (pv > 70 && Math.abs(P.x - p.x) < 46 && Math.abs(P.y - p.y) < 46) {
    p.flee = 1.6;
    p.a = Math.atan2(p.y - P.y, p.x - P.x);
  }

  const spd = p.flee > 0 ? 72 : p.spd;
  const ax = p.x + Math.cos(p.a) * 7, ay = p.y + Math.sin(p.a) * 7;
  if (!gtaPedTileOk(ax, ay, p.flee > 0)) {
    // try left, right, back — first one with pavement wins
    for (const turn of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const na = p.a + turn;
      if (gtaPedTileOk(p.x + Math.cos(na) * 7, p.y + Math.sin(na) * 7, p.flee > 0)) { p.a = na; break; }
    }
  } else if (p.flee <= 0 && Math.random() < dt * 0.35) {
    p.a += (Math.random() - 0.5) * 1.3;
  }
  const nx = p.x + Math.cos(p.a) * spd * dt, ny = p.y + Math.sin(p.a) * spd * dt;
  if (gtaPedTileOk(nx, ny, p.flee > 0) && !gtaSolidAt(nx, ny)) { p.x = nx; p.y = ny; }
}

// A ped becomes crumbs. Dark, but they're nuggets; the pigeons win either way.
function gtaCrumb(p, mult, label) {
  const i = gta.peds.indexOf(p);
  if (i < 0) return;
  gta.peds.splice(i, 1);
  gta.decals.push({ x: p.x, y: p.y, type: 'crumb', life: 26, seed: gtaHash(p.x | 0, p.y | 0) });
  if (gta.decals.length > 70) gta.decals.shift();
  gtaSpawnParts(p.x, p.y, 7, 'crumbspray');
  for (const q of gta.peds) { // witnesses scatter
    if (Math.abs(q.x - p.x) < 60 && Math.abs(q.y - p.y) < 60) {
      q.flee = Math.max(q.flee, 2); q.a = Math.atan2(q.y - p.y, q.x - p.x);
    }
  }
  if (mult) gtaPay(mult, label, p.x - (gta.cam.x - gta.W / 2), p.y - (gta.cam.y - gta.Hh / 2));
}

// ---- damage, smoke, and the fireball ---------------------------------------------------

function gtaSpawnParts(x, y, n, type) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = type === 'fire' ? 20 + Math.random() * 55 : 8 + Math.random() * 26;
    const life = type === 'smoke' ? 0.9 + Math.random() * 1.1 : type === 'fire' ? 0.45 + Math.random() * 0.5 : 0.35 + Math.random() * 0.4;
    gta.parts.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life, max: life, type, size: type === 'smoke' ? 2 + Math.random() * 3 : 1 + Math.random() * 2,
    });
  }
  if (gta.parts.length > 220) gta.parts.splice(0, gta.parts.length - 220);
}

function gtaExplodeCar(car) {
  if (car.wreck) return;
  car.wreck = true;
  car.hp = 0;
  car.v = 0;
  car.wreckT = gta.t;
  // a BATTER tanker going up is a neighborhood event
  const big = car.cls === 'tanker' ? 1.6 : 1;
  const R = 36 * big;
  gtaSpawnParts(car.x, car.y, Math.round(22 * big), 'fire');
  gtaSpawnParts(car.x, car.y, Math.round(12 * big), 'smoke');
  gta.decals.push({ x: car.x, y: car.y, type: 'scorch', life: 40, seed: gtaHash(car.x | 0, car.y | 0) });
  if (gta.decals.length > 70) gta.decals.shift();
  gta.shake = Math.max(gta.shake, 0.6 * big);
  // splash: peds crumb, nearby cars cook off, the player's ride takes 90
  for (let i = gta.peds.length - 1; i >= 0; i--) {
    const p = gta.peds[i];
    if (Math.abs(p.x - car.x) < R - 4 && Math.abs(p.y - car.y) < R - 4) gtaCrumb(p, 3, '💥');
  }
  for (const o of gta.cars) {
    if (o === car || o.wreck) continue;
    if (Math.abs(o.x - car.x) < R && Math.abs(o.y - car.y) < R) gtaDamageCar(o, 90);
  }
  if (car !== gta.car && !gta.onFoot &&
      Math.abs(gta.car.x - car.x) < R && Math.abs(gta.car.y - car.y) < R) {
    gtaDamagePlayerCar(90);
  }
}

function gtaDamageCar(car, amt) {
  if (car.wreck) return;
  car.hp -= amt;
  if (car.hp <= 0) gtaExplodeCar(car);
}

function gtaDamagePlayerCar(amt) {
  if (gta.wastedT > 0) return;
  const car = gta.car;
  car.hp -= amt;
  if (car.hp <= 0) {
    // WASTED first (it gates re-entry), then leave a burning wreck behind
    gtaWasted();
    const wreck = {
      x: car.x, y: car.y, a: car.a, dir: 0, v: 0, cls: car.cls, col: car.col,
      hp: 1, parked: true, wreck: false, nd: null, blockT: 0, hitT: 0, emberT: 0,
    };
    gta.cars.push(wreck);
    gtaExplodeCar(wreck);
  }
}

function gtaWasted() {
  gta.wastedT = 2.4;
  gta.keys = {};
  gta.handbrake = false;
  gtaBanner('🍗 WASTED', 'heat', 2.2);
}

// The arcade house rule: wasted costs time and wheels, never the meter.
function gtaRespawn() {
  const L = gta.landmarks.general || gta.landmarks.arcade;
  gta.car = {
    x: (L.vLeft + 1) * GTA_TILE, y: (L.r + 2) * GTA_TILE, a: -Math.PI / 2,
    vx: 0, vy: 0, cls: 'compact', col: '#c23a3a', hp: GTA_CLASSES.compact.hp,
  };
  gta.cam.x = gta.car.x; gta.cam.y = gta.car.y;
  gtaBanner('🏥 NUGGET GENERAL', 'go', 1.6);
}

// ---- carjacking (E/X): stop next to it, it's yours ------------------------------------

function gtaInteract() {
  if (gta.wastedT > 0) return;
  const car = gta.car;
  if (Math.hypot(car.vx, car.vy) > 55) return; // this isn't an action movie. slow down first
  let best = null, bd = 34 * 34;
  for (const o of gta.cars) {
    if (o.wreck) continue;
    const d2 = (o.x - car.x) * (o.x - car.x) + (o.y - car.y) * (o.y - car.y);
    if (d2 < bd) { bd = d2; best = o; }
  }
  if (!best) return;
  const occupied = !best.parked;
  // your old ride stays at the curb, exactly as you left it
  gta.cars.push({
    x: car.x, y: car.y, a: car.a, dir: 0, v: 0, cls: car.cls, col: car.col, hp: car.hp,
    parked: true, wreck: false, nd: null, blockT: 0, hitT: 0, emberT: 0,
  });
  if (occupied) {
    // the driver bails and remembers none of your face
    gta.peds.push({
      x: best.x + 8, y: best.y + 8, a: Math.atan2(best.y - car.y, best.x - car.x),
      spd: 20, t: 0, flee: 2.4, col: GTA_PED_COLS[Math.floor(Math.random() * GTA_PED_COLS.length)],
    });
    gtaPay(15, '🚗', gta.W / 2, gta.Hh * 0.42);
  }
  gta.car = { x: best.x, y: best.y, a: best.a, vx: 0, vy: 0, cls: best.cls, col: best.col, hp: best.hp };
  gta.cars.splice(gta.cars.indexOf(best), 1);
  gtaBanner('🚗 ' + GTA_CLASSES[best.cls].name + ' BOOSTED', 'go', 1.3);
}

// ---- update ---------------------------------------------------------------------------

function stepGta(dt, w, h) {
  if (!gta.on) return;
  if (gta.cv.width !== Math.ceil(w / gta.scale) || gta.cv.height !== Math.ceil(h / gta.scale)) gtaLayout();
  gta.t += dt;

  if (gta.phase === 'play') {
    if (gta.wastedT > 0) {
      gta.wastedT -= dt;
      if (gta.wastedT <= 0) gtaRespawn();
    } else {
      gtaStepPlayerCar(dt);
    }
    gtaStepWorld(dt);
  }

  gtaDraw();
}

function gtaStepPlayerCar(dt) {
  const car = gta.car;
  const C = GTA_CLASSES[car.cls];
  const cos = Math.cos(car.a), sin = Math.sin(car.a);

  // Decompose velocity into forward + lateral components.
  let vf = car.vx * cos + car.vy * sin;
  let vl = -car.vx * sin + car.vy * cos;

  // Throttle / brake / reverse
  const gas = (gta.keys.up ? 1 : 0), rev = (gta.keys.down ? 1 : 0);
  if (gas) vf = Math.min(C.maxFwd, vf + C.accel * dt);
  if (rev) {
    if (vf > 8) vf = Math.max(0, vf - C.brake * dt);        // rolling: brake first
    else vf = Math.max(-C.maxRev, vf - C.accel * 0.7 * dt); // then back up
  }
  // Handbrake locks the rears: hard forward scrub, loose rear end.
  if (gta.handbrake) vf *= Math.exp(-2.6 * dt);
  vf *= Math.exp(-GTA_DRAG * dt);
  vl *= Math.exp(-(gta.handbrake ? C.drift : C.grip) * dt);

  // Steering scales with speed (no curb-parked pirouettes), flips in reverse.
  const steer = (gta.keys.left ? -1 : 0) + (gta.keys.right ? 1 : 0);
  const sf = Math.max(-1, Math.min(1, vf / 90));
  car.a += steer * C.steer * sf * dt;

  // Recompose with the new heading — this is what makes the tail come around.
  const c2 = Math.cos(car.a), s2 = Math.sin(car.a);
  car.vx = c2 * vf - s2 * vl;
  car.vy = s2 * vf + c2 * vl;

  // Skid marks while the rear is stepping out.
  if (Math.abs(vl) > 26 || (gta.handbrake && Math.abs(vf) > 40)) {
    gta.skids.push({ x: car.x - c2 * 6, y: car.y - s2 * 6, a: car.a, life: 4 });
    if (gta.skids.length > 220) gta.skids.shift();
  }

  // Axis-separated movement vs building tiles: cheap, stable, arcade-honest.
  // Hitting a wall hard enough dents the breading off the bodywork.
  const nx = car.x + car.vx * dt;
  if (gtaSolidAt(nx + Math.sign(car.vx) * C.r, car.y - C.r * 0.6) ||
      gtaSolidAt(nx + Math.sign(car.vx) * C.r, car.y + C.r * 0.6)) {
    const impact = Math.abs(car.vx);
    car.vx *= -0.22; // crunch
    if (impact > 110) {
      gtaDamagePlayerCar((impact - 110) * 0.14);
      gtaSpawnParts(car.x + Math.sign(nx - car.x) * C.r, car.y, 4, 'spark');
      gta.shake = Math.max(gta.shake, 0.2);
    }
  } else car.x = nx;
  const ny = car.y + car.vy * dt;
  if (gtaSolidAt(car.x - C.r * 0.6, ny + Math.sign(car.vy) * C.r) ||
      gtaSolidAt(car.x + C.r * 0.6, ny + Math.sign(car.vy) * C.r)) {
    const impact = Math.abs(car.vy);
    car.vy *= -0.22;
    if (impact > 110) {
      gtaDamagePlayerCar((impact - 110) * 0.14);
      gtaSpawnParts(car.x, car.y + Math.sign(ny - car.y) * C.r, 4, 'spark');
      gta.shake = Math.max(gta.shake, 0.2);
    }
  } else car.y = ny;
  if (gta.wastedT > 0) return; // the wall won

  // Ram traffic: push out along the contact normal, trade paint for hp.
  for (const o of gta.cars) {
    const rr = C.r + GTA_CLASSES[o.cls].r;
    const ddx = car.x - o.x, ddy = car.y - o.y;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1, nxn = ddx / d, nyn = ddy / d;
    car.x = o.x + nxn * rr;
    car.y = o.y + nyn * rr;
    const vn = car.vx * nxn + car.vy * nyn;
    const impact = Math.max(0, -vn);
    if (vn < 0) { car.vx -= vn * nxn * 1.25; car.vy -= vn * nyn * 1.25; }
    if (impact > 60 && gta.t > o.hitT) {
      o.hitT = gta.t + 0.3;
      const dmg = (impact - 45) * 0.22;
      gtaDamageCar(o, dmg);
      gtaDamagePlayerCar(dmg * 0.5);
      gtaSpawnParts((car.x + o.x) / 2, (car.y + o.y) / 2, 5, 'spark');
      if (!o.wreck) o.v = Math.max(0, o.v - impact * 0.6);
      gta.shake = Math.max(gta.shake, 0.25);
      if (gta.wastedT > 0) return;
    }
  }

  // Pedestrians: fast contact crumbs them, slow contact just ruins their day.
  const spd = Math.hypot(car.vx, car.vy);
  for (let i = gta.peds.length - 1; i >= 0; i--) {
    const p = gta.peds[i];
    if (Math.abs(p.x - car.x) > C.r + 4 || Math.abs(p.y - car.y) > C.r + 4) continue;
    if (spd > 55) gtaCrumb(p, 5, '🍞');
    else if (spd > 6) {
      p.flee = 2;
      p.a = Math.atan2(p.y - car.y, p.x - car.x);
      p.x += Math.cos(p.a) * 6; p.y += Math.sin(p.a) * 6;
    }
  }

  // Distance pays the meter (crime does pay, slightly, per block).
  const moved = spd * dt;
  gta.dist += moved;
  gta.distPay += moved;
  if (gta.distPay >= 44) {
    const chunks = Math.floor(gta.distPay / 44);
    gta.distPay -= chunks * 44;
    storm.caught += Math.max(1, Math.round(storm.perFlyer * 2)) * chunks;
  }
}

// Everything that lives around the player: spawns, traffic, peds, particles,
// pickups, the camera. Runs even through the WASTED interlude.
function gtaStepWorld(dt) {
  const P = gtaPlayerPos();

  // Spawn/despawn in a ring just past the screen edge. The city is 3840px
  // square — only the block around the camera is ever alive.
  gta.spawnT -= dt;
  if (gta.spawnT <= 0) {
    gta.spawnT = 0.35;
    let moving = 0;
    for (const o of gta.cars) if (!o.parked && !o.wreck) moving++;
    if (moving < GTA_TRAFFIC_CAP) gtaSpawnTraffic();
    if (gta.peds.length < GTA_PED_CAP) { gtaSpawnPed(); gtaSpawnPed(); }
  }
  const R2 = Math.max(gta.W, gta.Hh) * 0.72 + 330;
  for (let i = gta.cars.length - 1; i >= 0; i--) {
    const o = gta.cars[i];
    if (Math.abs(o.x - gta.cam.x) > R2 || Math.abs(o.y - gta.cam.y) > R2) gta.cars.splice(i, 1);
  }
  for (let i = gta.peds.length - 1; i >= 0; i--) {
    const p = gta.peds[i];
    if (Math.abs(p.x - gta.cam.x) > R2 || Math.abs(p.y - gta.cam.y) > R2) gta.peds.splice(i, 1);
  }

  for (const o of gta.cars) {
    if (o.wreck) {
      // fresh wrecks burn for a bit
      if (gta.t - o.wreckT < 6) {
        o.emberT -= dt;
        if (o.emberT <= 0) {
          o.emberT = 0.12;
          gtaSpawnParts(o.x + (Math.random() - 0.5) * 8, o.y + (Math.random() - 0.5) * 8, 1,
            Math.random() < 0.45 ? 'fire' : 'smoke');
        }
      }
      continue;
    }
    if (o.parked) continue;
    gtaStepTrafficCar(o, dt);
    // drivers brake for peds, but a panicked nug can still dive under a bus
    if (o.v > 45) {
      const rr = GTA_CLASSES[o.cls].r + 3;
      for (let i = gta.peds.length - 1; i >= 0; i--) {
        const p = gta.peds[i];
        if (Math.abs(p.x - o.x) < rr && Math.abs(p.y - o.y) < rr) gtaCrumb(p, 0);
      }
    }
  }

  for (const p of gta.peds) gtaStepPed(p, dt);

  // A hurting ride smokes; a dying one spits fire. Consider the Grease Garage.
  if (gta.wastedT <= 0) {
    const C = GTA_CLASSES[gta.car.cls];
    if (gta.car.hp < C.hp * 0.4) {
      gta.smokeT -= dt;
      if (gta.smokeT <= 0) {
        gta.smokeT = 0.07;
        const hx = gta.car.x + Math.cos(gta.car.a) * C.L * 0.32;
        const hy = gta.car.y + Math.sin(gta.car.a) * C.L * 0.32;
        gtaSpawnParts(hx, hy, 1, gta.car.hp < C.hp * 0.18 ? 'fire' : 'smoke');
      }
    }
  }

  // Particles drift; smoke leans with the rain wind.
  for (let i = gta.parts.length - 1; i >= 0; i--) {
    const p = gta.parts[i];
    p.life -= dt;
    if (p.life <= 0) { gta.parts.splice(i, 1); continue; }
    if (p.type === 'smoke') p.vx -= 4 * dt;
    p.vx *= Math.exp(-1.4 * dt); p.vy *= Math.exp(-1.4 * dt);
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (let i = gta.decals.length - 1; i >= 0; i--) {
    if ((gta.decals[i].life -= dt) <= 0) gta.decals.splice(i, 1);
  }
  for (let i = gta.honks.length - 1; i >= 0; i--) {
    if ((gta.honks[i].t -= dt) <= 0) gta.honks.splice(i, 1);
  }
  gta.shake = Math.max(0, gta.shake - dt * 1.6);

  // Pickups: drive (or walk) over a crate, it's yours. That's the law here.
  for (const p of gta.pickups) {
    if (p.taken) {
      if (gta.t > p.respawn) p.taken = false;
      continue;
    }
    const px = (p.c + 0.5) * GTA_TILE, py = (p.r + 0.5) * GTA_TILE;
    if (Math.abs(P.x - px) < 11 && Math.abs(P.y - py) < 11) {
      p.taken = true;
      p.respawn = gta.t + 26;
      if (p.gold) gtaPay(120, '✨', gta.W / 2, gta.Hh * 0.42);
      else { gta.crates++; gtaPay(12, '📦', gta.W / 2, gta.Hh * 0.42); }
    }
  }

  for (const s of gta.skids) s.life -= dt;
  while (gta.skids.length && gta.skids[0].life <= 0) gta.skids.shift();

  // Camera: chase with velocity look-ahead so you see where you're going.
  const lvx = (P === gta.car) ? gta.car.vx : 0, lvy = (P === gta.car) ? gta.car.vy : 0;
  const lookX = P.x + lvx * 0.42, lookY = P.y + lvy * 0.42;
  gta.cam.x += (lookX - gta.cam.x) * Math.min(1, 4.2 * dt);
  gta.cam.y += (lookY - gta.cam.y) * Math.min(1, 4.2 * dt);

  // Crossing into a new district gets you the name card.
  const dNow = gtaDistrictAt(Math.floor(P.x / GTA_TILE), Math.floor(P.y / GTA_TILE));
  if (dNow !== gta.district) {
    gta.district = dNow;
    gta.toastMsg = GTA_DISTRICTS[dNow];
    gta.toastT = 2.6;
  }

  if (gta.toastT > 0) gta.toastT -= dt;
}

// ---- render ---------------------------------------------------------------------------

function gtaDraw() {
  const g = gta.g, W = gta.W, Hh = gta.Hh, T = GTA_TILE;
  let ox = Math.round(gta.cam.x - W / 2), oy = Math.round(gta.cam.y - Hh / 2);
  if (gta.shake > 0) {
    ox += Math.round((Math.random() - 0.5) * gta.shake * 8);
    oy += Math.round((Math.random() - 0.5) * gta.shake * 8);
  }

  // City tiles, only what's on screen.
  const c0 = Math.floor(ox / T) - 1, c1 = Math.floor((ox + W) / T) + 1;
  const r0 = Math.floor(oy / T) - 1, r1 = Math.floor((oy + Hh) / T) + 1;
  for (let tr = r0; tr <= r1; tr++) {
    for (let tc = c0; tc <= c1; tc++) {
      const x = tc * T - ox, y = tr * T - oy;
      const k = gtaTile(tc, tr);
      const hsh = gtaHash(tc, tr);
      if (k === GT_ROAD) {
        g.fillStyle = ((tc + tr) & 1) ? '#232330' : '#26262e';
        g.fillRect(x, y, T, T);
        // wet-night sheen streak
        if (hsh % 9 === 0) { g.fillStyle = 'rgba(120,160,220,0.05)'; g.fillRect(x, y + 4, T, 6); }
        // lane dashes down the middle of each 2-wide road (not at crossings)
        const crossing = gta.vRoad[tc] && gta.hRoad[tr];
        if (!crossing) {
          g.fillStyle = '#8a8a3a';
          if (gta.vDash[tc] && gta.vRoad[tc] && (tr & 1) === 0) g.fillRect(x, y + 3, 2, T - 10);
          if (gta.hDash[tr] && gta.hRoad[tr] && (tc & 1) === 0) g.fillRect(x + 3, y, T - 10, 2);
        }
      } else if (k === GT_WALK) {
        if (tc >= GTA_W - 14) {
          // harbor boardwalk + piers: planks over the bay
          g.fillStyle = ((tc + tr) & 1) ? '#3a2c1c' : '#342818';
          g.fillRect(x, y, T, T);
          g.fillStyle = 'rgba(0,0,0,0.3)';
          for (let py = 0; py < T; py += 6) g.fillRect(x, y + py, T, 1);
        } else {
          g.fillStyle = ((tc + tr) & 1) ? '#33333e' : '#303039';
          g.fillRect(x, y, T, T);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(x, y, T, 1); g.fillRect(x, y, 1, T); // pavement seams
        }
      } else if (k === GT_WATER) {
        g.fillStyle = ((tc + tr) & 1) ? '#0d2438' : '#0b2032';
        g.fillRect(x, y, T, T);
        // drifting glints — the bay is never quite still
        if ((hsh + Math.floor(gta.t * 2.5)) % 9 === 0) {
          g.fillStyle = 'rgba(140,190,240,0.10)';
          g.fillRect(x + (hsh % 12), y + ((hsh >> 4) % 18), 10, 2);
        }
        // foam where the water meets anything that isn't water
        g.fillStyle = 'rgba(200,230,255,0.12)';
        if (gtaTile(tc - 1, tr) !== GT_WATER) g.fillRect(x, y, 2, T);
        if (gtaTile(tc, tr - 1) !== GT_WATER) g.fillRect(x, y, T, 2);
        if (gtaTile(tc, tr + 1) !== GT_WATER) g.fillRect(x, y + T - 2, T, 2);
      } else if (k === GT_GRASS) {
        g.fillStyle = ((tc + tr) & 1) ? '#122016' : '#101c14';
        g.fillRect(x, y, T, T);
        if (hsh % 5 === 0) { // a tree at night is just a rounder shadow
          g.fillStyle = '#0a140d';
          g.beginPath(); g.arc(x + T / 2, y + T / 2, 8, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#0f1a11';
          g.beginPath(); g.arc(x + T / 2 - 2, y + T / 2 - 2, 5, 0, Math.PI * 2); g.fill();
        }
      } else {
        // rooftops — this is a top-down city, buildings are lids
        const dd = gtaDistrictAt(tc, tr);
        const inB = tc >= 0 && tr >= 0 && tc < GTA_W && tr < GTA_H;
        const lm = inB ? gta.lmGrid[tr * GTA_W + tc] : 0;
        const BX = Math.ceil(GTA_W / 10);
        const bi = inB ? gta.blockCol[Math.floor(tc / 10) + Math.floor(tr / 9) * BX] : 0;
        g.fillStyle = lm ? gta.lmList[lm - 1].roof : GTA_ROOFS_D[dd][bi % 4];
        g.fillRect(x, y, T, T);
        // roof edge light where the roof meets a walkable tile (streetlight spill)
        g.fillStyle = 'rgba(255,255,255,0.05)';
        if (gtaTile(tc, tr - 1) !== GT_BLDG) g.fillRect(x, y, T, 2);
        if (gtaTile(tc - 1, tr) !== GT_BLDG) g.fillRect(x, y, 2, T);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        if (gtaTile(tc, tr + 1) !== GT_BLDG) g.fillRect(x, y + T - 2, T, 2);
        if (gtaTile(tc + 1, tr) !== GT_BLDG) g.fillRect(x + T - 2, y, 2, T);
        if (!lm && hsh % 7 === 0) { // AC unit / vent
          g.fillStyle = 'rgba(255,255,255,0.06)';
          g.fillRect(x + 5 + (hsh % 8), y + 6 + (hsh % 6), 6, 5);
        }
        // street-facing neon: a strip of color bleeding onto the sidewalk.
        // Density is a district thing — downtown hums, the suburbs sleep.
        if (!lm && hsh % GTA_NEON_MOD[dd] === 0) {
          const neon = GTA_NEON[hsh % GTA_NEON.length];
          g.fillStyle = neon;
          if (gtaTile(tc, tr + 1) === GT_WALK) {
            g.fillRect(x + 4, y + T - 2, T - 8, 2);
            g.globalAlpha = 0.14; g.fillRect(x + 2, y + T, T - 4, 7); g.globalAlpha = 1;
          } else if (gtaTile(tc, tr - 1) === GT_WALK) {
            g.fillRect(x + 4, y, T - 8, 2);
            g.globalAlpha = 0.14; g.fillRect(x + 2, y - 7, T - 4, 7); g.globalAlpha = 1;
          }
        }
      }
      // street lamps pool light on intersections
      if (k === GT_ROAD && gta.vRoad[tc] && gta.hRoad[tr] && hsh % 4 === 0) {
        const lg = g.createRadialGradient(x + T / 2, y + T / 2, 2, x + T / 2, y + T / 2, T * 1.1);
        lg.addColorStop(0, 'rgba(255,220,140,0.13)');
        lg.addColorStop(1, 'rgba(255,220,140,0)');
        g.fillStyle = lg;
        g.fillRect(x - T, y - T, T * 3, T * 3);
      }
    }
  }

  // Decals under everything: crumbs where peds were, scorch where cars were.
  for (const d of gta.decals) {
    const dx = d.x - ox, dy = d.y - oy;
    if (dx < -30 || dx > W + 30 || dy < -30 || dy > Hh + 30) continue;
    g.globalAlpha = Math.min(1, d.life / 8);
    if (d.type === 'crumb') {
      g.fillStyle = '#b08a4a';
      for (let i = 0; i < 8; i++) {
        const h = gtaHash(d.seed + i, i);
        g.fillRect(dx - 5 + (h % 11), dy - 4 + ((h >> 3) % 9), 1 + (h % 2), 1);
      }
      g.fillStyle = '#8a6a34';
      g.fillRect(dx - 1, dy - 1, 3, 2);
    } else { // scorch
      g.fillStyle = 'rgba(30,22,14,0.5)';
      g.beginPath(); g.arc(dx, dy, 14, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(10,8,8,0.75)';
      g.beginPath(); g.arc(dx, dy, 11, 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;

  // Skid marks under everything that moves.
  g.fillStyle = 'rgba(8,8,12,0.5)';
  for (const s of gta.skids) {
    if (s.life <= 0) continue;
    g.globalAlpha = Math.min(0.5, s.life / 6);
    const px = s.x - ox, py = s.y - oy;
    const wx = Math.cos(s.a + Math.PI / 2) * 3, wy = Math.sin(s.a + Math.PI / 2) * 3;
    g.fillRect(px + wx - 1, py + wy - 1, 2, 2);
    g.fillRect(px - wx - 1, py - wy - 1, 2, 2);
  }
  g.globalAlpha = 1;

  // Pickups
  for (const p of gta.pickups) {
    if (p.taken) continue;
    const px = (p.c + 0.5) * T - ox, py = (p.r + 0.5) * T - oy;
    if (px < -20 || px > W + 20 || py < -20 || py > Hh + 20) continue;
    if (p.gold) {
      const r = 4 + Math.sin(gta.t * 5) * 0.7;
      const grad = g.createRadialGradient(px - 1, py - 1, 1, px, py, r + 3);
      grad.addColorStop(0, '#fff3b0'); grad.addColorStop(0.6, '#ffd23a'); grad.addColorStop(1, 'rgba(198,138,18,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(px, py, r + 3, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#6b4a26';
      g.fillRect(px - 5, py - 5, 10, 10);
      g.fillStyle = '#8a6236';
      g.fillRect(px - 5, py - 5, 10, 2);
      g.fillStyle = '#3f2b15';
      g.fillRect(px - 1, py - 5, 2, 10);
      g.fillRect(px - 5, py - 1, 10, 2);
    }
  }

  // Landmark plates: accent border + name painted on the roof, beacon blink.
  for (const L of gta.lmList) {
    const lx = L.c * T - ox, ly = L.r * T - oy, lw = L.w * T, lh = L.h * T;
    if (lx > W || ly > Hh || lx + lw < 0 || ly + lh < 0) continue;
    g.strokeStyle = L.accent;
    g.lineWidth = 1;
    g.strokeRect(lx + 1.5, ly + 1.5, lw - 3, lh - 3);
    g.globalAlpha = 0.9;
    g.fillStyle = L.accent;
    g.font = '900 9px Consolas, monospace';
    g.textAlign = 'center';
    g.fillText(L.name, lx + lw / 2, ly + lh / 2 + 3, lw - 8);
    g.globalAlpha = 1;
    if (Math.sin(gta.t * 3 + L.c) > 0.2) g.fillRect(lx + lw / 2 - 1, ly + 4, 2, 2);
  }

  // The glow in the bay. Case open forever.
  if (gta.stormSpot) {
    const gx = gta.stormSpot.x - ox, gy = gta.stormSpot.y - oy;
    if (gx > -40 && gx < W + 40 && gy > -40 && gy < Hh + 40) {
      const pul = 0.16 + 0.1 * Math.sin(gta.t * 1.7);
      const gr = g.createRadialGradient(gx, gy, 1, gx, gy, 26);
      gr.addColorStop(0, 'rgba(255,210,58,' + pul.toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(255,210,58,0)');
      g.fillStyle = gr;
      g.fillRect(gx - 26, gy - 26, 52, 52);
    }
  }

  // Traffic, wrecks, and the citizens of Nuggetown.
  for (const o of gta.cars) {
    const px = o.x - ox, py = o.y - oy;
    if (px < -40 || px > W + 40 || py < -40 || py > Hh + 40) continue;
    // moving traffic runs headlights too (drawn first, under every body)
    if (!o.parked && !o.wreck) gtaDrawBeams(g, o.x - ox, o.y - oy, o.a, 24, 0.05);
  }
  // Headlights before the car so the beams sit under the body.
  if (gta.phase === 'play' && gta.wastedT <= 0) {
    gtaDrawBeams(g, gta.car.x - ox, gta.car.y - oy, gta.car.a, 34, 0.10);
  }
  for (const o of gta.cars) {
    const px = o.x - ox, py = o.y - oy;
    if (px < -40 || px > W + 40 || py < -40 || py > Hh + 40) continue;
    gtaDrawVehicle(g, ox, oy, o, false);
  }
  for (const p of gta.peds) {
    const px = p.x - ox, py = p.y - oy;
    if (px < -12 || px > W + 12 || py < -12 || py > Hh + 12) continue;
    gtaDrawPed(g, px, py, p);
  }

  if (gta.wastedT <= 0) gtaDrawVehicle(g, ox, oy, gta.car, true);

  // Particles over the bodies: smoke, fire, sparks, crumbspray.
  for (const p of gta.parts) {
    const px = p.x - ox, py = p.y - oy;
    if (px < -10 || px > W + 10 || py < -10 || py > Hh + 10) continue;
    const k = p.life / p.max;
    if (p.type === 'smoke') {
      g.globalAlpha = 0.28 * k;
      g.fillStyle = '#9aa0ad';
      const s = p.size + (1 - k) * 3;
      g.fillRect(px - s / 2, py - s / 2, s, s);
    } else if (p.type === 'fire') {
      g.globalAlpha = Math.min(1, k * 1.4);
      g.fillStyle = k > 0.6 ? '#fff3b0' : k > 0.3 ? '#ff9a3d' : '#c23a1a';
      g.fillRect(px - p.size, py - p.size, p.size * 2, p.size * 2);
    } else if (p.type === 'spark') {
      g.globalAlpha = k;
      g.fillStyle = '#ffe9a0';
      g.fillRect(px, py, 1, 1);
    } else { // crumbspray
      g.globalAlpha = k;
      g.fillStyle = '#c89a5a';
      g.fillRect(px, py, 1, 1);
    }
  }
  g.globalAlpha = 1;

  // HONK!
  for (const hk of gta.honks) {
    const px = hk.x - ox, py = hk.y - oy;
    if (px < -30 || px > W + 30 || py < -30 || py > Hh + 30) continue;
    g.globalAlpha = Math.min(1, hk.t * 2);
    g.textAlign = 'center';
    g.font = '900 8px Consolas, monospace';
    g.fillStyle = '#ffe23a';
    g.fillText('HONK!', px, py - 12 - (1.1 - hk.t) * 8);
  }
  g.globalAlpha = 1;

  // Rain, screen space, always slanting the same way — Nuggetown weather.
  g.strokeStyle = 'rgba(160,190,240,0.15)';
  g.lineWidth = 1;
  g.beginPath();
  for (const r of gta.rain) {
    r.y += r.v * 0.016; r.x -= 9 * 0.016;
    if (r.y > Hh) { r.y = -5; r.x = Math.random() * W; }
    g.moveTo(r.x, r.y); g.lineTo(r.x - 1.5, r.y + 6);
  }
  g.stroke();

  gtaDrawHud(g, W, Hh);
  if (gta.phase === 'title') gtaDrawTitle(g, W, Hh);
  if (gta.wastedT > 0) {
    g.globalAlpha = Math.min(0.6, (2.4 - gta.wastedT) * 1.1);
    g.fillStyle = '#040408';
    g.fillRect(0, 0, W, Hh);
    g.globalAlpha = 1;
  }
}

// Headlight cones for any vehicle, drawn nose-first from world heading a.
function gtaDrawBeams(g, cx, cy, a, reach, alpha) {
  const c2 = Math.cos(a), s2 = Math.sin(a);
  g.fillStyle = 'rgba(255,240,190,' + alpha + ')';
  for (const side of [-1, 1]) {
    const hx = cx + c2 * 8 + -s2 * side * 3, hy = cy + s2 * 8 + c2 * side * 3;
    g.beginPath();
    g.moveTo(hx, hy);
    g.lineTo(hx + c2 * reach - s2 * (side * 3 + 9), hy + s2 * reach + c2 * (side * 3 + 9));
    g.lineTo(hx + c2 * reach - s2 * (side * 3 - 9), hy + s2 * reach + c2 * (side * 3 - 9));
    g.closePath(); g.fill();
  }
}

// Any vehicle in Nuggetown, drawn nose-up and rotated to heading. Class sets
// the footprint; buses get window strips, tankers get the BATTER barrel.
function gtaDrawVehicle(g, ox, oy, v, isPlayer) {
  const C = GTA_CLASSES[v.cls];
  const hw = C.Wd / 2, hl = C.L / 2;
  const body = v.wreck ? '#16161c' : v.col;
  g.save();
  g.translate(v.x - ox, v.y - oy);
  g.rotate(v.a + Math.PI / 2);
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(-hw - 1, -hl - 1, C.Wd + 2, C.L + 3);
  // wheels (long classes get a middle axle)
  g.fillStyle = '#0c0c12';
  g.fillRect(-hw - 1, -hl + 1, 2, 4); g.fillRect(hw - 1, -hl + 1, 2, 4);
  g.fillRect(-hw - 1, hl - 5, 2, 4); g.fillRect(hw - 1, hl - 5, 2, 4);
  if (C.L > 26) { g.fillRect(-hw - 1, -2, 2, 4); g.fillRect(hw - 1, -2, 2, 4); }
  // body
  g.fillStyle = body;
  g.fillRect(-hw + 1, -hl, C.Wd - 2, C.L);
  if (!v.wreck) {
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(-hw + 1, -hl, C.Wd - 2, 3); // hood shine
  }
  if (v.wreck) {
    // burnt out: cracked shell, no glass, no lights
    g.fillStyle = '#2a2018';
    g.fillRect(-hw + 2, -hl + 3, C.Wd - 4, 2);
    g.fillRect(-hw + 2, hl - 6, C.Wd - 4, 2);
    g.restore();
    return;
  }
  if (v.cls === 'bus') {
    // window strip down each flank
    g.fillStyle = '#101522';
    for (let wy = -hl + 5; wy < hl - 6; wy += 5) {
      g.fillRect(-hw + 1, wy, 2, 3);
      g.fillRect(hw - 3, wy, 2, 3);
    }
    g.fillRect(-hw + 2, -hl + 1, C.Wd - 4, 3); // windshield
  } else if (v.cls === 'tanker') {
    // cab up front, batter barrel behind (canon: S.W. Logistics)
    g.fillStyle = '#101522';
    g.fillRect(-hw + 2, -hl + 4, C.Wd - 4, 3);
    g.fillStyle = '#c8c4b8';
    g.fillRect(-hw + 2, -hl + 9, C.Wd - 4, C.L - 11);
    g.fillStyle = '#a8a498';
    g.fillRect(-hw + 2, -hl + 12, C.Wd - 4, 2);
    g.fillRect(-hw + 2, hl - 8, C.Wd - 4, 2);
    g.fillStyle = '#7a3a1a';
    g.fillRect(-1, -2, 2, 2); // hazard placard: flammable when provoked
  } else {
    // windshield + roof + rear glass
    g.fillStyle = '#101522';
    g.fillRect(-hw + 2, -hl + 5, C.Wd - 4, 3);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(-hw + 2, -hl + 8, C.Wd - 4, C.L - 13);
    g.fillStyle = '#101522';
    g.fillRect(-hw + 2, hl - 5, C.Wd - 4, 2);
    if (v.cls === 'sports') { // go-faster stripe, because of course
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-1, -hl, 2, C.L);
    }
  }
  // headlights
  g.fillStyle = '#ffe9a0';
  g.fillRect(-hw + 2, -hl, 2, 1); g.fillRect(hw - 4, -hl, 2, 1);
  // taillights (the player's glow under braking/handbrake)
  g.fillStyle = (isPlayer && (gta.keys.down || gta.handbrake)) ? '#ff5252' : '#7a1d1d';
  g.fillRect(-hw + 2, hl - 1, 2, 1); g.fillRect(hw - 4, hl - 1, 2, 1);
  g.restore();
}

// A nugget about town: 5px of breading with places to be. Rotated to heading,
// feet alternating; fleeing nugs put their little arms up.
function gtaDrawPed(g, px, py, p) {
  g.save();
  g.translate(px, py);
  g.rotate(p.a + Math.PI / 2);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(-3, -3, 6, 7);
  const step = Math.sin(p.t * (p.flee > 0 ? 22 : 11));
  g.fillStyle = '#3a2a18'; // little shoes
  g.fillRect(-2, -4 + (step > 0 ? -1 : 0), 2, 2);
  g.fillRect(1, -4 + (step > 0 ? 0 : -1), 2, 2);
  g.fillStyle = p.col;
  g.fillRect(-2, -3, 5, 6); // the nug itself
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(-2, -3, 5, 2); // golden-fried crown
  if (p.flee > 0) { // arms up, wobbling
    g.fillStyle = p.col;
    g.fillRect(-4, -2 + (step > 0 ? -1 : 0), 2, 2);
    g.fillRect(3, -2 + (step > 0 ? 0 : -1), 2, 2);
  }
  g.restore();
}

function gtaDrawHud(g, W, Hh) {
  if (gta.phase !== 'play') return;
  const spd = Math.round(Math.hypot(gta.car.vx, gta.car.vy) * 0.6);
  g.textAlign = 'left';
  g.font = '900 10px Consolas, monospace';
  g.fillStyle = '#39ff7a';
  g.fillText('📦 ' + gta.crates, 6, Hh - 8);
  g.fillStyle = gta.handbrake ? '#ffe23a' : '#9aa3c7';
  g.fillText(spd + ' NPH', 6, Hh - 20);

  // Bodywork bar: how much crunch is left in the current ride.
  const C = GTA_CLASSES[gta.car.cls];
  const pct = Math.max(0, gta.car.hp / C.hp);
  g.fillStyle = 'rgba(5,5,12,0.7)';
  g.fillRect(6, Hh - 36, 44, 5);
  g.fillStyle = pct > 0.5 ? '#39ff7a' : pct > 0.25 ? '#ffe23a' : '#ff5252';
  g.fillRect(7, Hh - 35, Math.round(42 * pct), 3);
  g.font = '700 8px Consolas, monospace';
  g.fillStyle = '#9aa3c7';
  g.fillText(C.name, 54, Hh - 31);

  // Radar: an 80-tile window from the gen-time minimap, north-up, you = dot.
  if (gta.mini) {
    const MM = 52, SRC = 80;
    const pc = gta.car.x / GTA_TILE, pr = gta.car.y / GTA_TILE;
    const sx = Math.max(0, Math.min(GTA_W - SRC, pc - SRC / 2));
    const sy = Math.max(0, Math.min(GTA_H - SRC, pr - SRC / 2));
    const dx = W - MM - 5, dy = Hh - MM - 5;
    g.fillStyle = '#05050c';
    g.fillRect(dx - 2, dy - 2, MM + 4, MM + 4);
    g.globalAlpha = 0.85;
    g.drawImage(gta.mini, sx, sy, SRC, SRC, dx, dy, MM, MM);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(238,242,255,0.45)';
    g.lineWidth = 1;
    g.strokeRect(dx - 0.5, dy - 0.5, MM + 1, MM + 1);
    g.fillStyle = '#ffffff';
    g.fillRect(dx + ((pc - sx) / SRC) * MM - 1, dy + ((pr - sy) / SRC) * MM - 1, 3, 3);
  }
  // district toast
  if (gta.toastT > 0) {
    g.globalAlpha = Math.min(1, gta.toastT);
    g.textAlign = 'center';
    g.font = '900 12px Consolas, monospace';
    g.fillStyle = '#eef2ff';
    g.fillText(gta.toastMsg, W / 2, 18);
    g.globalAlpha = 1;
  }
}

function gtaDrawTitle(g, W, Hh) {
  g.fillStyle = 'rgba(4,4,12,0.66)';
  g.fillRect(0, 0, W, Hh);
  // GTA-style logo card: white plate, black frame, stacked type
  const pw = Math.min(190, W * 0.6), ph = 64;
  const px = W / 2 - pw / 2, py = Hh * 0.22;
  g.fillStyle = '#0a0a12';
  g.fillRect(px - 3, py - 3, pw + 6, ph + 6);
  g.fillStyle = '#eef2ff';
  g.fillRect(px, py, pw, ph);
  g.textAlign = 'center';
  g.fillStyle = '#0a0a12';
  g.font = 'italic 900 13px Georgia, "Times New Roman", serif';
  g.fillText('GRAND THEFT', W / 2, py + 20);
  g.font = 'italic 900 30px Georgia, "Times New Roman", serif';
  g.fillText('NUGGET', W / 2, py + 50);
  g.font = '700 10px Consolas, monospace';
  g.fillStyle = '#9aa3c7';
  g.fillText('welcome to nuggetown. population: crispy.', W / 2, Hh * 0.56);
  g.fillStyle = '#eef2ff';
  g.fillText('↑↓ drive · ←→ steer · SPACE handbrake · E jack a car', W / 2, Hh * 0.64);
  if (Math.floor(gta.t * 2.2) % 2 === 0) {
    g.font = '900 12px Consolas, monospace';
    g.fillStyle = '#ffe23a';
    g.fillText('PRESS SPACE / TAP — BOOST IT', W / 2, Hh * 0.78);
  }
}

// ---- input -----------------------------------------------------------------------------

function gtaPress(code) {
  if (gta.phase === 'title' &&
    (code === 'Space' || code === 'Enter' || code === 'KeyX' ||
     code === 'ArrowUp' || code === 'KeyW')) {
    gtaStart();
    return true;
  }
  if (gta.phase !== 'play') return false;
  if (code === 'ArrowUp' || code === 'KeyW') { gta.keys.up = true; return true; }
  if (code === 'ArrowDown' || code === 'KeyS') { gta.keys.down = true; return true; }
  if (code === 'ArrowLeft' || code === 'KeyA') { gta.keys.left = true; return true; }
  if (code === 'ArrowRight' || code === 'KeyD') { gta.keys.right = true; return true; }
  if (code === 'Space') { gta.handbrake = true; return true; }
  if (code === 'KeyE' || code === 'KeyX') { gtaInteract(); return true; }
  return false;
}

window.addEventListener('keydown', (e) => {
  if (!gtaActive()) return;
  if (gtaPress(e.code)) e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  if (!gta.on) return;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') gta.keys.up = false;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') gta.keys.down = false;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') gta.keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') gta.keys.right = false;
  if (e.code === 'Space') gta.handbrake = false;
});

// touch / mouse: hold to drive, left/right thirds steer, second finger = handbrake
function gtaPointer(x, down) {
  if (!gtaActive()) return;
  if (!down) { gta.keys.up = false; gta.keys.left = false; gta.keys.right = false; return; }
  if (gta.phase !== 'play') { gtaPress('Space'); return; }
  gta.keys.up = true;
  const t = x / window.innerWidth;
  gta.keys.left = t < 0.38;
  gta.keys.right = t > 0.62;
}
gtaWorld.addEventListener('mousedown', (e) => gtaPointer(e.clientX, true));
window.addEventListener('mouseup', () => gta.on && gtaPointer(0, false));
gtaWorld.addEventListener('touchstart', (e) => {
  gta.handbrake = e.touches.length > 1;
  gtaPointer(e.touches[0].clientX, true);
  e.preventDefault();
}, { passive: false });
gtaWorld.addEventListener('touchmove', (e) => { gtaPointer(e.touches[0].clientX, true); e.preventDefault(); }, { passive: false });
window.addEventListener('touchend', (e) => {
  if (!gta.on) return;
  gta.handbrake = e.touches.length > 1;
  if (e.touches.length === 0) gtaPointer(0, false);
});
