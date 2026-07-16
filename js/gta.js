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
// Sprint 4 (ON FOOT): step out of the car (same E/X) and Nuggetown is yours
// at walking pace — sprint stamina, a melee punch on SPACE, health measured
// in breading with re-breading at Noodle Nug carts, pickups on foot, and a
// proper ejection when your ride goes up with you in it.
// Sprint 5 (NPD HEAT): the 🚔 emoji was a promise. Wanted stars 1–5, patrol
// cruisers that lane-follow until you misbehave, free-driving pursuit AI,
// spike-strip roadblocks at 3★, the armored BATTER VAN at 5★, BUSTED (walk
// out of NPD HQ, heat gone), and the Grease Garage Pay 'n' Spray (respray
// takes 3 seconds and costs nothing but your dignity — house rule: the
// meter never goes down).
// Sprint 6 (ARMED & SAUCED): the condiment arsenal — sauce pistol,
// honey-mustard uzi, BBQ flamer (cars catch and burn), dip grenades (or
// drop them out the window behind you). F fires, Q cycles, drive-bys go
// out both windows, AMMU-NUGGET restocks the belt in Little Batter, and
// blowing things up finally PAYS — small, risky $$$, plus all the heat
// you ordered. Getting busted confiscates the lot.
// Sprint 7 (THE SYNDICATE, ACT 1): the phones start ringing. Answer a booth
// on E and S.W. puts you to work — six contracts (deliveries gone wrong, a
// tanker heist, tailing Detective Dill, arson with a one-fryer policy, an
// ambush, and an evidence van outside NPD HQ). Objective chains with markers,
// timers, and fail states; progress persists in localStorage (nugGtaProg).
// Sprint 8 (ACT 2 + THE HARBOR JOB): five more contracts building to the
// north pier at midnight — you hold position at the plank's end and THE
// STORM SURFACES (canon: alive, never freed, never killed; sets
// nugGtaSawStorm) before the NPD raid crashes the party. Plus side gigs
// for freeplay: drive a BUS and NUG-EX clocks you in, drive a CRUISER and
// dispatch feeds you felons, grab a 💀 and it's a rampage.
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
  cruiser: { name: 'NPD CRUISER', maxFwd: 235, maxRev: 80, accel: 175, brake: 320, grip: 8.6, drift: 1.4, steer: 3.2, r: 7, hp: 120, cruise: 88, L: 20, Wd: 10,
             cols: ['#e8ecf4'] },
  van:     { name: 'BATTER VAN', maxFwd: 240, maxRev: 60, accel: 130, brake: 260, grip: 9.8, drift: 2.4, steer: 2.2, r: 9, hp: 400, cruise: 70, L: 26, Wd: 13,
             cols: ['#1c2230'] },
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

// The condiment arsenal. cd = seconds between shots (holding fire refires),
// give = what a pickup/restock loads, col doubles as tracer + pickup color.
const GTA_WEAPONS = [
  { key: 'fist',   name: 'FISTS',             icon: '👊' },
  { key: 'pistol', name: 'SAUCE PISTOL',      icon: '🔫', cd: 0.34, spd: 280, dmg: 15, life: 0.55, spread: 0.04, col: '#ff5252', give: 24 },
  { key: 'uzi',    name: 'HONEY-MUSTARD UZI', icon: '🍯', cd: 0.09, spd: 300, dmg: 6, life: 0.5, spread: 0.16, col: '#ffd23a', give: 80 },
  { key: 'flamer', name: 'BBQ FLAMER',        icon: '🔥', cd: 0.045, spd: 130, dmg: 2, life: 0.42, spread: 0.3, col: '#ff8a3d', give: 110, flame: true },
  { key: 'nade',   name: 'DIP GRENADE',       icon: '🥣', cd: 0.55, col: '#4ab06a', give: 4, lob: true },
];
const GTA_WEAP_BY_KEY = {};
for (const w of GTA_WEAPONS) GTA_WEAP_BY_KEY[w.key] = w;

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
  onFoot: false,
  ped: null,             // the player on foot: {x, y, a, vx, vy, t, flee, col}
  breading: 100,         // health. you are what you're coated in
  stamina: 100,          // sprint fuel (SHIFT)
  punchT: 0, punchAnim: 0,
  hurtI: 0,              // post-hit invulnerability (blasts don't double-dip)
  noodleT: 0,            // > 0: currently re-breading at a cart
  noodleCarts: [],       // {c, r} — steam, broth, second chances
  cartT: 0,              // ambient cart-steam throttle
  heat: 0,               // wanted level, 0..5 continuous; floor() = stars
  bustT: 0,              // seconds a cop has been on top of a slow/on-foot you
  bustedT: 0,            // > 0: the BUSTED interlude is playing
  sprayT: 0,             // > 0: mid-respray at the Grease Garage
  sprayCd: 0,            // respray cooldown (no camping the garage)
  blockCd: 0,            // roadblock spawn throttle
  tiresOut: false,       // spiked: mushy grip until you swap cars or respray
  strips: [],            // spike strips: {x, y, w, h, life}
  ammo: { pistol: 0, uzi: 0, flamer: 0, nade: 0 },
  wsel: 0,               // index into GTA_WEAPONS
  fireCd: 0, fireHeld: false,
  shots: [],             // live rounds: {x, y, vx, vy, life, dmg, col, flame}
  nades: [],             // dip grenades in flight: {x, y, vx, vy, t}
  wtoastT: 0,            // weapon-switch toast timer
  ammuCd: 0,             // AMMU-NUGGET loyalty-program cooldown
  prog: 0,               // contracts completed (persisted: nugGtaProg)
  mission: null,         // the live contract: {def, si, st, time, mk, warn}
  booths: [],            // phone booths: {c, r} — S.W. calls collect
  boothRing: false,      // a booth is ringing this frame
  ringCd: 0,             // quiet period after a dropped contract
  briefT: 0,             // mission brief card timer
  pierRows: [],          // the two pier rows from gen (missions + S8 use these)
  gig: null,             // side gig: {type, count, time, mk, felon?, need?}
  stormRise: 0,          // 0..1 — how far out of the bay the storm has come
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

// Where the player physically is: behind the wheel or out on the pavement.
function gtaPlayerPos() { return gta.onFoot ? gta.ped : gta.car; }

function gtaActive() {
  return storm.mode === 'gta' && storm.running;
}

function gtaTally() {
  if (gta.phase === 'title') return '"welcome to nuggetown"';
  const state = gta.onFoot
    ? '🍞 ' + Math.round(gta.breading) + '%'
    : Math.round(Math.hypot(gta.car.vx, gta.car.vy) * 0.6) + ' NPH';
  const stars = gtaStars();
  return '📦 ' + gta.crates + ' · ' + state +
    (stars > 0 ? ' · 🚔' + '★'.repeat(stars) : '') +
    ' · ' + GTA_DISTRICTS[gta.district];
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
  // appended in Sprint 6 — placement iterates in order, so the first six
  // landmarks land exactly where they always did
  { key: 'ammu',    name: 'AMMU-NUGGET',       d: 1, tc: 96,  tr: 34,  accent: '#c8ccd8', roof: '#2a2622' },
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
  gta.pierRows = piers; // missions reference the piers by row

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

  // Noodle Nug carts (Sprint 4): one on the curb outside the NOODLE NUG
  // mothership, five seeded around town. Standing near one re-breads you.
  // NOTE: appended AFTER all prior rnd() calls — the city layout must not move.
  gta.noodleCarts = [];
  const NL = gta.landmarks.noodle;
  if (NL && map[(NL.r + 1) * GTA_W + NL.vLeft + 2] === GT_WALK) {
    gta.noodleCarts.push({ c: NL.vLeft + 2, r: NL.r + 1 });
  }
  let carts = 0;
  while (carts < 5 && guard++ < 24000) {
    const tc = Math.floor(rnd() * GTA_W), tr = Math.floor(rnd() * GTA_H);
    if (tc >= SHORE || map[tr * GTA_W + tc] !== GT_WALK) continue;
    gta.noodleCarts.push({ c: tc, r: tr });
    carts++;
  }

  // Ammo drops (Sprint 6): condiments left lying around town. Append-only
  // rnd() again — the city must not move.
  const AMMO_KINDS = ['pistol', 'uzi', 'pistol', 'nade', 'uzi', 'flamer'];
  let am = 0;
  while (am < 18 && guard++ < 40000) {
    const tc = Math.floor(rnd() * GTA_W), tr = Math.floor(rnd() * GTA_H);
    const k = map[tr * GTA_W + tc];
    if (tc >= SHORE || (k !== GT_ROAD && k !== GT_WALK)) continue;
    gta.pickups.push({ c: tc, r: tr, gold: false, ammo: AMMO_KINDS[am % 6], taken: false, respawn: 0 });
    am++;
  }

  // Phone booths (Sprint 7): S.W. calls collect. Four planted on landmark
  // curbs, two seeded wherever the copper reaches. Append-only rnd() as ever
  // — the city must not move.
  gta.booths = [];
  for (const key of ['arcade', 'noodle', 'garage', 'npd']) {
    const L = gta.landmarks[key];
    if (!L) continue;
    for (const [bc, br] of [[L.vLeft + 2, L.r + 3], [L.vLeft + 2, L.r], [L.c + 1, L.hTop + 2]]) {
      if (map[br * GTA_W + bc] === GT_WALK &&
          !gta.noodleCarts.some((c2) => c2.c === bc && c2.r === br)) {
        gta.booths.push({ c: bc, r: br });
        break;
      }
    }
  }
  let bs = 0;
  while (bs < 2 && guard++ < 60000) {
    const tc = Math.floor(rnd() * GTA_W), tr = Math.floor(rnd() * GTA_H);
    if (tc >= SHORE || map[tr * GTA_W + tc] !== GT_WALK) continue;
    gta.booths.push({ c: tc, r: tr });
    bs++;
  }

  // Rampage skulls (Sprint 8): two bad ideas lying in the road. Append-only.
  let rp = 0;
  while (rp < 2 && guard++ < 80000) {
    const tc = Math.floor(rnd() * GTA_W), tr = Math.floor(rnd() * GTA_H);
    if (tc >= SHORE || map[tr * GTA_W + tc] !== GT_ROAD) continue;
    gta.pickups.push({ c: tc, r: tr, gold: false, rampage: true, taken: false, respawn: 0 });
    rp++;
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
  mg.fillStyle = '#ff2fa0';
  for (const c of gta.noodleCarts) mg.fillRect(c.c, c.r, 1, 1);
  mg.fillStyle = '#3ad4ff';
  for (const b of gta.booths) mg.fillRect(b.c, b.r, 1, 1);
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
    gta.onFoot = false;
    gta.ped = null;
    gta.breading = 100;
    gta.stamina = 100;
    gta.punchT = 0; gta.punchAnim = 0;
    gta.hurtI = 0; gta.noodleT = 0; gta.cartT = 0;
    gta.heat = 0; gta.bustT = 0; gta.bustedT = 0;
    gta.sprayT = 0; gta.sprayCd = 0; gta.blockCd = 0; gta.copT = 0;
    gta.tiresOut = false;
    gta.strips = [];
    gta.ammo = { pistol: 0, uzi: 0, flamer: 0, nade: 0 };
    gta.wsel = 0; gta.fireCd = 0; gta.fireHeld = false; gta.firePress = false;
    gta.shots = []; gta.nades = [];
    gta.wtoastT = 0; gta.ammuCd = 0;
    gta.mission = null; gta.briefT = 0; gta.ringCd = 0; gta.boothRing = false;
    gta.gig = null; gta.stormRise = 0;
    try { gta.prog = Math.max(0, +(localStorage.getItem('nugGtaProg') || 0) || 0); } catch (e) { gta.prog = 0; }
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
  let target = hit ? 0 : (car.felon ? C.maxFwd * 0.82 : C.cruise); // felons are late

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
    // one car in twelve is NPD on patrol (lane-locked until you're wanted)
    const cop = Math.random() < 0.085;
    const cls = cop ? 'cruiser' : gtaPickClass(gtaDistrictAt(tc, tr));
    const C = GTA_CLASSES[cls];
    gta.cars.push({
      x: sx, y: sy, a: GTA_DIR_A[dir], dir, v: C.cruise * (0.7 + Math.random() * 0.3),
      cls, col: C.cols[Math.floor(Math.random() * C.cols.length)], hp: C.hp,
      cop, chase: false,
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
  if (mult) {
    gtaPay(mult, label, p.x - (gta.cam.x - gta.W / 2), p.y - (gta.cam.y - gta.Hh / 2));
    gtaAddHeat(0.4); // someone always calls 555-DILL
    if (gta.gig && gta.gig.type === 'rampage') gta.gig.count++;
  }
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
  if (car.playerHit) {
    // that one's on you — and combat pays. small, risky, exactly as advertised
    gtaAddHeat(car.cop ? 1.4 : 0.8);
    gtaPay(car.cop ? 30 : 20, '💥',
      car.x - (gta.cam.x - gta.W / 2), car.y - (gta.cam.y - gta.Hh / 2));
  }
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
  if (gta.onFoot && Math.abs(gta.ped.x - car.x) < R && Math.abs(gta.ped.y - car.y) < R) {
    gtaHurtPlayer(70);
  }
}

// Breading damage to the player on foot. hurtI is the mercy window.
function gtaHurtPlayer(amt) {
  if (gta.wastedT > 0 || gta.hurtI > 0) return;
  gta.hurtI = 0.5;
  gta.breading -= amt;
  gta.shake = Math.max(gta.shake, 0.25);
  if (gta.breading <= 0) {
    gta.breading = 0;
    gtaWasted();
  }
}

// Put the player on the pavement at (or near) a point, first spot that fits.
function gtaPlaceOnFoot(x, y) {
  const spots = [[0, 0], [-14, 0], [14, 0], [0, -14], [0, 14], [-14, -14], [14, 14]];
  let px = x, py = y;
  for (const s of spots) {
    if (!gtaSolidAt(x + s[0], y + s[1])) { px = x + s[0]; py = y + s[1]; break; }
  }
  gta.onFoot = true;
  gta.ped = { x: px, y: py, a: -Math.PI / 2, vx: 0, vy: 0, t: 0, flee: 0, col: '#ffcf3a' };
}

function gtaDamageCar(car, amt) {
  if (car.wreck) return;
  car.hp -= amt;
  if (car.hp <= 0) gtaExplodeCar(car);
}

function gtaDamagePlayerCar(amt) {
  if (gta.wastedT > 0 || gta.onFoot) return;
  const car = gta.car;
  car.hp -= amt;
  if (car.hp <= 0) {
    // Thrown clear, singed, standing next to what's left of the ride.
    // Eject BEFORE the fireball (onFoot gates re-entry into this function),
    // take the blast as breading, then a mercy window so the splash pass
    // doesn't double-dip. If the breading doesn't hold: WASTED.
    gtaPlaceOnFoot(car.x + 16, car.y);
    gta.hurtI = 0;
    gtaHurtPlayer(65);
    gta.hurtI = 1.2;
    const wreck = {
      x: car.x, y: car.y, a: car.a, dir: 0, v: 0, cls: car.cls, col: car.col,
      mis: car.mis, misKey: car.misKey,
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
  gtaMissionFail('🍗 WASTED'); // S.W. does not pay hospital bills
  if (gta.gig) gtaGigEnd('💤 GIG DROPPED');
  gtaBanner('🍗 WASTED', 'heat', 2.2);
}

// The arcade house rule: wasted costs time and wheels, never the meter.
// You wake up ON FOOT outside Nugget General; the next ride is your problem.
function gtaRespawn() {
  const L = gta.landmarks.general || gta.landmarks.arcade;
  gtaPlaceOnFoot((L.vLeft + 2.5) * GTA_TILE, (L.r + 2) * GTA_TILE);
  gta.breading = 100;
  gta.stamina = 100;
  gta.hurtI = 1;
  gta.heat = 0; // the NPD doesn't bill hospital beds
  gta.bustT = 0;
  gta.tiresOut = false;
  for (const o of gta.cars) if (o.chase && o.cop) { o.chase = false; o.parked = true; o.v = 0; }
  gta.cam.x = gta.ped.x; gta.cam.y = gta.ped.y;
  gtaBanner('🏥 NUGGET GENERAL', 'go', 1.6);
}

// ---- carjacking + car doors (E/X) ------------------------------------------------------

function gtaNearestCar(x, y, range) {
  let best = null, bd = range * range;
  for (const o of gta.cars) {
    if (o.wreck) continue;
    if (o.mis && o.misKey !== 'cargo') continue; // mission doors are locked
    const d2 = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y);
    if (d2 < bd) { bd = d2; best = o; }
  }
  return best;
}

// Take a car from gta.cars. Occupied ones pay — the driver bails and
// remembers none of your face.
function gtaEnterCar(best, fromX, fromY) {
  if (!best.parked) {
    gta.peds.push({
      x: best.x + 8, y: best.y + 8, a: Math.atan2(best.y - fromY, best.x - fromX),
      spd: 20, t: 0, flee: 2.4, col: GTA_PED_COLS[Math.floor(Math.random() * GTA_PED_COLS.length)],
    });
    gtaPay(15, '🚗', gta.W / 2, gta.Hh * 0.42);
    gtaBanner('🚗 ' + GTA_CLASSES[best.cls].name + ' BOOSTED', 'go', 1.3);
    gtaAddHeat(best.cop ? 1.2 : 0.5); // it's in the game's name
  } else {
    gtaBanner('🚗 ' + GTA_CLASSES[best.cls].name, 'go', 1.1);
  }
  gta.car = { x: best.x, y: best.y, a: best.a, vx: 0, vy: 0, cls: best.cls, col: best.col, hp: best.hp };
  gta.car.cop = best.cop; // driving a jacked cruiser keeps the livery
  gta.car.mis = best.mis; gta.car.misKey = best.misKey; // cargo rides with you
  gta.cars.splice(gta.cars.indexOf(best), 1);
  gta.onFoot = false;
  gta.tiresOut = false; // different car, different tires
  // Sprint 8 side gigs: the vehicle IS the job application
  if (gta.car.cls === 'bus') gtaGigStart('nugex');
  else if (gta.car.cop && gta.car.cls === 'cruiser') gtaGigStart('vigil');
}

// Your ride stays at the curb, exactly as you left it.
function gtaParkPlayerCar() {
  const car = gta.car;
  gta.cars.push({
    x: car.x, y: car.y, a: car.a, dir: 0, v: 0, cls: car.cls, col: car.col, hp: car.hp,
    cop: car.cop, mis: car.mis, misKey: car.misKey,
    parked: true, wreck: false, nd: null, blockT: 0, hitT: 0, emberT: 0,
  });
}

// E/X. On foot: enter what's next to you. Driving: swap into a car in reach,
// or step out if there isn't one. Either way, slow down first.
function gtaInteract() {
  if (gta.wastedT > 0) return;
  if (gta.onFoot) {
    const best = gtaNearestCar(gta.ped.x, gta.ped.y, 26);
    if (best) { gtaEnterCar(best, gta.ped.x, gta.ped.y); return; }
    // no door in reach — a ringing phone beats a shopping trip
    if (gtaTryBooth(gta.ped.x, gta.ped.y, 26)) return;
    // maybe a counter: AMMU-NUGGET's loyalty program
    const A = gta.landmarks.ammu;
    if (A && gta.ammuCd <= 0) {
      const T = GTA_TILE;
      if (gta.ped.x > A.c * T - 40 && gta.ped.x < (A.c + A.w) * T + 40 &&
          gta.ped.y > A.r * T - 40 && gta.ped.y < (A.r + A.h) * T + 40) {
        for (const w of GTA_WEAPONS) {
          if (w.give) gta.ammo[w.key] = Math.max(gta.ammo[w.key], w.give);
        }
        if (gta.wsel === 0) gtaSelectWeapon(1);
        gta.wtoastT = 1.8;
        gta.ammuCd = 45;
        gtaBanner('🔫 AMMU-NUGGET — ON THE HOUSE', 'go', 1.5);
      }
    }
    return;
  }
  const car = gta.car;
  if (Math.hypot(car.vx, car.vy) > 55) return; // this isn't an action movie
  if (Math.hypot(car.vx, car.vy) < 40 && gtaTryBooth(car.x, car.y, 40)) return; // curbside pickup
  const best = gtaNearestCar(car.x, car.y, 34);
  if (best) {
    gtaParkPlayerCar();
    gtaEnterCar(best, car.x, car.y);
  } else if (Math.hypot(car.vx, car.vy) < 40) {
    // step out the driver's side (or wherever fits)
    gtaParkPlayerCar();
    gtaPlaceOnFoot(car.x - Math.sin(car.a) * -13, car.y + Math.cos(car.a) * -13);
  }
}

// Second touch finger on foot: door if there's a door, knuckles otherwise.
function gtaFootAction() {
  if (!gta.onFoot) return;
  if (gtaNearestCar(gta.ped.x, gta.ped.y, 26)) gtaInteract();
  else gtaPunch();
}

// ---- NPD HEAT --------------------------------------------------------------------------
// Someone always calls 555-DILL. Heat is a 0..5 float; whole stars are what
// the HUD shows and what the dispatch logic keys on. Cruisers patrol in the
// normal traffic stream until you're wanted, then break lane-lock and hunt.

function gtaAddHeat(amt) {
  if (gta.bustedT > 0 || gta.wastedT > 0) return;
  gta.heat = Math.min(5, gta.heat + amt);
}

function gtaStars() { return Math.floor(gta.heat); }

// A cruiser (or, at 5★, the syndicate-plated BATTER VAN — the NPD bought
// surplus armor and nobody at city hall asked questions) spawned just
// offscreen, already hunting.
function gtaSpawnChaser(cls) {
  const T = GTA_TILE;
  const R = Math.max(gta.W, gta.Hh) * 0.72;
  for (let tries = 0; tries < 14; tries++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = R + Math.random() * 90;
    const x = gta.cam.x + Math.cos(ang) * rad, y = gta.cam.y + Math.sin(ang) * rad;
    const tc = Math.floor(x / T), tr = Math.floor(y / T);
    if (tc < 1 || tr < 1 || tc >= GTA_W - 1 || tr >= GTA_H - 1) continue;
    if (gtaTile(tc, tr) !== GT_ROAD) continue;
    const C = GTA_CLASSES[cls];
    gta.cars.push({
      x, y, a: Math.atan2(gta.cam.y - y, gta.cam.x - x), dir: 0, v: C.cruise,
      cls, col: C.cols[0], hp: C.hp, cop: true, chase: true,
      parked: false, wreck: false, nd: null, blockT: 0, hitT: 0, emberT: 0,
    });
    return;
  }
}

// Free-driving pursuit: steer at an intercept point, feel for walls with
// probes, box the player in when a bust is on, ram them when it isn't.
function gtaStepChaser(o, dt) {
  const C = GTA_CLASSES[o.cls];
  const P = gtaPlayerPos();
  const dist = Math.hypot(P.x - o.x, P.y - o.y);
  const pSlow = gta.onFoot || Math.hypot(gta.car.vx, gta.car.vy) < 30;

  let want = Math.atan2(P.y + (P.vy || 0) * 0.35 - o.y, P.x + (P.vx || 0) * 0.35 - o.x);
  const probe = (ang, d) => gtaSolidAt(o.x + Math.cos(ang) * d, o.y + Math.sin(ang) * d);
  if (probe(o.a, 26)) {
    if (!probe(o.a + 0.7, 24)) want = o.a + 0.95;
    else if (!probe(o.a - 0.7, 24)) want = o.a - 0.95;
    else want = o.a + Math.PI * 0.5; // dead end: crank it around
  }
  let da = want - o.a;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  o.a += Math.max(-3.4 * dt, Math.min(3.4 * dt, da));

  // Bust posture: pull up next to a slow target instead of flattening it.
  // Syndicate hostiles (Sprint 7) don't do posture — they only know the ram.
  const targetV = (o.cop && pSlow && dist < 46) ? 0
    : C.maxFwd * (o.cop ? 0.7 + 0.055 * gtaStars() : 0.82);
  o.v += (targetV - o.v) * Math.min(1, 2.4 * dt);

  const nx = o.x + Math.cos(o.a) * o.v * dt;
  if (gtaSolidAt(nx + Math.sign(Math.cos(o.a)) * C.r, o.y)) o.v *= 0.4;
  else o.x = nx;
  const ny = o.y + Math.sin(o.a) * o.v * dt;
  if (gtaSolidAt(o.x, ny + Math.sign(Math.sin(o.a)) * C.r)) o.v *= 0.4;
  else o.y = ny;

  // Keep the pack from stacking into one super-cruiser.
  for (const q of gta.cars) {
    if (q === o || !q.chase || q.wreck) continue;
    const dx = o.x - q.x, dy = o.y - q.y;
    const d2 = dx * dx + dy * dy, rr = C.r + GTA_CLASSES[q.cls].r;
    if (d2 > 0 && d2 < rr * rr) {
      const d = Math.sqrt(d2);
      o.x += (dx / d) * (rr - d) * 0.5;
      o.y += (dy / d) * (rr - d) * 0.5;
    }
  }

  // Contact with the player. Driving: a real ram (the van hits like a vault
  // door). On foot: getting clipped hurts; standing still is how you get busted.
  if (!gta.onFoot && gta.wastedT <= 0) {
    const rr = C.r + GTA_CLASSES[gta.car.cls].r;
    if (Math.abs(gta.car.x - o.x) < rr && Math.abs(gta.car.y - o.y) < rr && o.v > 60 && gta.t > o.hitT) {
      o.hitT = gta.t + 0.5;
      const kx = gta.car.x - o.x, ky = gta.car.y - o.y, d = Math.hypot(kx, ky) || 1;
      gta.car.vx += (kx / d) * o.v * 0.5;
      gta.car.vy += (ky / d) * o.v * 0.5;
      gtaDamagePlayerCar(o.v * (o.cls === 'van' ? 0.12 : 0.06));
      gtaSpawnParts((gta.car.x + o.x) / 2, (gta.car.y + o.y) / 2, 4, 'spark');
      gta.shake = Math.max(gta.shake, 0.3);
      o.v *= 0.5;
    }
  } else if (gta.onFoot && o.v > 40) {
    const rr = C.r + 3;
    if (Math.abs(gta.ped.x - o.x) < rr && Math.abs(gta.ped.y - o.y) < rr) {
      const kx = gta.ped.x - o.x, ky = gta.ped.y - o.y, d = Math.hypot(kx, ky) || 1;
      gta.ped.vx += (kx / d) * o.v;
      gta.ped.vy += (ky / d) * o.v;
      gtaHurtPlayer(o.v * 0.2);
      o.v *= 0.5;
    }
  }

  // Pursuit driving is reckless driving.
  if (o.v > 45) {
    const rr = C.r + 3;
    for (let i = gta.peds.length - 1; i >= 0; i--) {
      const p = gta.peds[i];
      if (Math.abs(p.x - o.x) < rr && Math.abs(p.y - o.y) < rr) gtaCrumb(p, 0);
    }
  }
}

function gtaBusted() {
  if (gta.bustedT > 0 || gta.wastedT > 0) return;
  gta.bustedT = 2.4;
  gta.keys = {};
  gta.handbrake = false;
  gtaMissionFail('🚔 BUSTED'); // S.W. does not post bail either
  if (gta.gig) gtaGigEnd('💤 GIG DROPPED');
  if (!gta.onFoot) {
    // the ride gets impounded where it stands; you get the walk of shame
    gtaParkPlayerCar();
    gtaPlaceOnFoot(gta.car.x + 16, gta.car.y);
  }
  gtaBanner('🚔 BUSTED', 'heat', 2.2);
}

// Processed and released out the front of NPD HQ. Heat's gone; so's your car.
function gtaBustedRespawn() {
  const L = gta.landmarks.npd || gta.landmarks.arcade;
  gtaPlaceOnFoot((L.vLeft + 2.5) * GTA_TILE, (L.r + 2) * GTA_TILE);
  gta.stamina = 100;
  gta.hurtI = 1;
  gta.heat = 0;
  gta.bustT = 0;
  gta.tiresOut = false;
  // evidence locker keeps the lot
  gta.ammo = { pistol: 0, uzi: 0, flamer: 0, nade: 0 };
  gta.wsel = 0;
  for (const o of gta.cars) if (o.chase && o.cop) { o.chase = false; o.parked = true; o.v = 0; }
  gta.cam.x = gta.ped.x; gta.cam.y = gta.ped.y;
  gtaBanner('🏛️ NPD HQ — RELEASED', 'go', 1.6);
}

// At 3★ dispatch drops spike-strip roadblocks across the road ahead of you.
// Returns true only when one actually lands (a whiff shouldn't eat the timer).
function gtaSpawnRoadblock() {
  const car = gta.car, T = GTA_TILE;
  const sp = Math.hypot(car.vx, car.vy);
  if (sp < 70) return false;
  const dx = car.vx / sp, dy = car.vy / sp;
  const ax = car.x + dx * 350, ay = car.y + dy * 350;
  const tc = Math.floor(ax / T), tr = Math.floor(ay / T);
  if (tc < 2 || tr < 2 || tc >= GTA_W - 2 || tr >= GTA_H - 2) return false;
  if (gtaTile(tc, tr) !== GT_ROAD) return false;
  let strip, copA, copSpots;
  if (gta.vRoad[tc] && !gta.hRoad[tr] && Math.abs(dy) > 0.7) {
    // vertical road, mostly vertical travel: strip lies across both lanes
    const v = gtaPairStartV(tc);
    strip = { x: v * T, y: tr * T, w: 2 * T, h: 5, life: 26 };
    copA = 0;
    copSpots = [[gtaLaneX(v, 1), tr * T + dy * 30], [gtaLaneX(v, 3), tr * T + dy * 30]];
  } else if (gta.hRoad[tr] && !gta.vRoad[tc] && Math.abs(dx) > 0.7) {
    const h = gtaPairStartH(tr);
    strip = { x: tc * T, y: h * T, w: 5, h: 2 * T, life: 26 };
    copA = Math.PI / 2;
    copSpots = [[tc * T + dx * 30, gtaLaneY(h, 0)], [tc * T + dx * 30, gtaLaneY(h, 2)]];
  } else return false;
  gta.strips.push(strip);
  for (const s of copSpots) {
    gta.cars.push({
      x: s[0], y: s[1], a: copA, dir: 0, v: 0, cls: 'cruiser', col: '#e8ecf4',
      hp: 120, cop: true, chase: false, parked: true, wreck: false,
      nd: null, blockT: 0, hitT: 0, emberT: 0, lightsOn: true,
    });
  }
  return true;
}

// The Grease Garage Pay 'n' Spray: three seconds under the gun-lube mist,
// out clean. Free — Nuggetown scores only go up — but the tab is 30s.
function gtaCheckRespray() {
  if (gta.onFoot || gta.sprayT > 0 || gta.sprayCd > 0) return;
  const G = gta.landmarks.garage;
  if (!G) return;
  const C = GTA_CLASSES[gta.car.cls];
  if (gta.heat <= 0 && gta.car.hp >= C.hp && !gta.tiresOut) return;
  // The zone reaches past the sidewalk to the bounding road even when the
  // garage sits inset in a wide block — pulling up out front counts.
  const T = GTA_TILE;
  const x0 = G.c * T - 64, x1 = (G.c + G.w) * T + 64;
  const y0 = G.r * T - 64, y1 = (G.r + G.h) * T + 64;
  if (gta.car.x < x0 || gta.car.x > x1 || gta.car.y < y0 || gta.car.y > y1) return;
  if (Math.hypot(gta.car.vx, gta.car.vy) > 50) return;
  gta.sprayT = 3;
  gtaBanner('🔧 PAY ’N’ SPRAY', 'go', 1.6);
}

function gtaFinishRespray() {
  gta.heat = 0;
  gta.bustT = 0;
  gta.tiresOut = false;
  gta.car.hp = GTA_CLASSES[gta.car.cls].hp;
  gta.sprayCd = 30;
  // the mist fools the NPD; syndicate hostiles are not paid to be fooled
  for (const o of gta.cars) if (o.chase && o.cop) { o.chase = false; o.parked = true; o.v = 0; }
  gtaBanner('✨ CLEAN SLATE', 'go', 1.4);
}

// ---- ARMED & SAUCED --------------------------------------------------------------------
// Hold F (or SPACE on foot) and the selected condiment does the talking.
// Everything routes through gtaStepFire so foot and drive-by share one path.

function gtaSelectWeapon(i) {
  gta.wsel = i;
  gta.wtoastT = 1.6;
}

function gtaCycleWeapon() {
  for (let k = 1; k <= GTA_WEAPONS.length; k++) {
    const i = (gta.wsel + k) % GTA_WEAPONS.length;
    if (i === 0 || gta.ammo[GTA_WEAPONS[i].key] > 0) { gtaSelectWeapon(i); return; }
  }
}

function gtaFireShot(x, y, a, w) {
  const ang = a + (w.spread || 0.04) * (Math.random() - 0.5) * 2;
  gta.shots.push({
    x, y, vx: Math.cos(ang) * w.spd, vy: Math.sin(ang) * w.spd,
    life: w.life, dmg: w.dmg, col: w.col, flame: !!w.flame,
  });
  if (gta.shots.length > 90) gta.shots.shift();
}

function gtaThrowNade() {
  if (gta.onFoot) {
    const p = gta.ped;
    gta.nades.push({
      x: p.x + Math.cos(p.a) * 6, y: p.y + Math.sin(p.a) * 6,
      vx: Math.cos(p.a) * 150, vy: Math.sin(p.a) * 150, t: 1.1,
    });
  } else {
    // out the window, onto the road behind you. chase-breaker classic.
    const car = gta.car, C = GTA_CLASSES[car.cls];
    gta.nades.push({
      x: car.x - Math.cos(car.a) * (C.L * 0.5 + 6),
      y: car.y - Math.sin(car.a) * (C.L * 0.5 + 6),
      vx: -Math.cos(car.a) * 30, vy: -Math.sin(car.a) * 30, t: 1.1,
    });
  }
}

function gtaStepFire(dt) {
  gta.fireCd -= dt;
  // firePress latches a tap that came and went between frames
  const want = gta.fireHeld || gta.firePress;
  gta.firePress = false;
  if (!want || gta.wastedT > 0 || gta.bustedT > 0 || gta.sprayT > 0) return;
  const w = GTA_WEAPONS[gta.wsel];
  if (!w.cd) { if (gta.onFoot) gtaPunch(); return; } // fists never jam
  if (gta.fireCd > 0 || gta.ammo[w.key] <= 0) return;
  gta.fireCd = w.cd;
  gta.ammo[w.key]--;
  if (w.lob) { gtaThrowNade(); gtaAddHeat(0.02); return; }
  if (gta.onFoot) {
    const p = gta.ped;
    gtaFireShot(p.x + Math.cos(p.a) * 6, p.y + Math.sin(p.a) * 6, p.a, w);
  } else {
    // drive-by: both windows at once. commitment.
    const car = gta.car, half = GTA_CLASSES[car.cls].Wd / 2 + 3;
    for (const side of [-1, 1]) {
      const a = car.a + side * Math.PI / 2;
      gtaFireShot(car.x + Math.cos(a) * half, car.y + Math.sin(a) * half, a, w);
    }
  }
  gtaAddHeat(0.012); // gunfire carries in the rain
}

// The dip pot goes off: same fireball family as the cars, portable.
function gtaNadeBoom(x, y) {
  gtaSpawnParts(x, y, 18, 'fire');
  gtaSpawnParts(x, y, 8, 'smoke');
  gta.decals.push({ x, y, type: 'scorch', life: 30, seed: gtaHash(x | 0, y | 0) });
  if (gta.decals.length > 70) gta.decals.shift();
  gta.shake = Math.max(gta.shake, 0.5);
  for (let i = gta.peds.length - 1; i >= 0; i--) {
    const p = gta.peds[i];
    if (Math.abs(p.x - x) < 28 && Math.abs(p.y - y) < 28) gtaCrumb(p, 3, '💥');
  }
  for (const o of gta.cars) {
    if (o.wreck) continue;
    if (Math.abs(o.x - x) < 30 && Math.abs(o.y - y) < 30) {
      o.playerHit = true;
      gtaDamageCar(o, 80);
    }
  }
  if (!gta.onFoot && Math.abs(gta.car.x - x) < 30 && Math.abs(gta.car.y - y) < 30) gtaDamagePlayerCar(55);
  if (gta.onFoot && Math.abs(gta.ped.x - x) < 28 && Math.abs(gta.ped.y - y) < 28) gtaHurtPlayer(55);
  gtaAddHeat(0.3);
}

// ---- THE SYNDICATE (missions) -----------------------------------------------------------
// Phone booths ring when S.W. has work. Answer on E — on foot or idling at the
// curb — and the contract starts cold: a chain of typed steps driven from
// gtaStepWorld with a gold marker, timers, and ways to blow it. WASTED or
// BUSTED drops the contract; the phone always rings again. Completed jobs
// persist in localStorage (nugGtaProg). Act 2 lands in Sprint 8.

function gtaLmCurb(key) { // the road centerline on a landmark's west curb
  const L = gta.landmarks[key];
  return { x: (L.vLeft + 1) * GTA_TILE, y: (L.r + 1) * GTA_TILE };
}

function gtaShorePoint(row) { // the shore road, level with a pier row
  return { x: (GTA_W - 15) * GTA_TILE, y: (row + 1) * GTA_TILE };
}

// Step kinds: go (reach the marker; needCar = arrive driving that cargo),
// jack (get behind the wheel of the spawned cargo), kill (wreck every
// 'target'), tail (shadow 'dill' — not too close, not too far), escape
// (get the stars to zero). spawn specs run at step start; done() on advance.
const GTA_MISSIONS = [
  {
    key: 'errand', title: 'THE ERRAND',
    brief: '"first job. a package is waiting on the curb at SAUCE WORKS. bring it to the NUGGET GENERAL loading dock. don\'t open it, don\'t weigh it, don\'t ask why a hospital." — S.W.',
    reward: 220,
    steps: [
      { kind: 'go', text: 'PICK UP THE PACKAGE 📦', at: () => gtaLmCurb('sauce'), r: 30,
        done: () => { gtaAddHeat(1.1); gtaBanner('🚨 SOMEBODY SAW THAT', 'heat', 1.4); } },
      { kind: 'go', text: 'DELIVER IT — NUGGET GENERAL 🏥', at: () => gtaLmCurb('general'), r: 30, time: 95 },
    ],
    outro: '"delivered warm. the hospital thing is a tax matter. more work soon." — S.W.',
  },
  {
    key: 'fullfat', title: 'FULL FAT',
    brief: '"one of OUR tankers is parked at the GREASE GARAGE looking decorative. it should be looking profitable. bring it to SAUCE WORKS — with the gallons still inside." — S.W.',
    reward: 280,
    steps: [
      { kind: 'jack', text: 'STEAL THE BATTER TANKER 🛢️',
        spawn: { cls: 'tanker', key: 'cargo', at: () => gtaLmCurb('garage'), dy: -72 },
        done: () => gtaAddHeat(1.6) },
      { kind: 'go', text: 'DELIVER THE TANKER — SAUCE WORKS', at: () => gtaLmCurb('sauce'), r: 34,
        needCar: 'cargo', time: 120, failText: '🛢️ THE BATTER IS EVERYWHERE' },
    ],
    outro: '"gallons received. the garage will bill us. that\'s the joke — they can\'t." — S.W.',
  },
  {
    key: 'dillwatch', title: 'DILL WATCH',
    brief: '"detective dill keeps asking the harbor questions. follow his sedan and learn his route. stay off his mirrors — if he makes you, you were never on this call." — S.W.',
    reward: 300,
    steps: [
      { kind: 'go', text: 'GET EYES ON NPD HQ 🕵️', at: () => gtaLmCurb('npd'), r: 60 },
      { kind: 'tail', text: 'TAIL DILL — NOT TOO CLOSE', dur: 30, track: 'dill',
        spawn: { cls: 'sedan', key: 'dill', at: () => gtaLmCurb('npd'), dy: 130, col: '#46543a', drive: true } },
    ],
    outro: '"…the pier. again. why is it always the pier. noted, and forgotten." — S.W.',
  },
  {
    key: 'crispy', title: 'CRISPY BUSINESS',
    brief: '"a rival outfit parked a FRYER TRUCK in the grease district. nuggetown has a one-fryer policy, and we are the fryer. cook it. the flamer\'s under the seat." — S.W.',
    reward: 330,
    gear: { flamer: 110 },
    steps: [
      { kind: 'kill', text: 'TORCH THE RIVAL FRYER TRUCK 🔥',
        spawn: { cls: 'tanker', key: 'target', at: () => gtaLmCurb('sauce'), dy: -170, col: '#8a4a1c' },
        done: () => gtaAddHeat(2) },
      { kind: 'escape', text: 'LOSE THE HEAT 🚔 (THE GARAGE KNOWS A GUY)' },
    ],
    outro: '"crispy. the one-fryer policy holds. air out the car." — S.W.',
  },
  {
    key: 'dips', title: 'SPECIAL SAUCE',
    brief: '"three crates of small-batch \'dip\'. three customers. the last one has been renegotiating, and deliveries don\'t renegotiate." — S.W.',
    reward: 360,
    steps: [
      { kind: 'go', text: 'COLLECT THE CRATES — AMMU-NUGGET 📦', at: () => gtaLmCurb('ammu'), r: 30 },
      { kind: 'go', text: 'DROP 1 OF 3 — NOODLE NUG', at: () => gtaLmCurb('noodle'), r: 30, time: 85 },
      { kind: 'go', text: 'DROP 2 OF 3 — THE NUGGET ARCADE', at: () => gtaLmCurb('arcade'), r: 30, time: 85 },
      { kind: 'go', text: 'DROP 3 OF 3 — THE HARBOR SHORE ⚓', at: () => gtaShorePoint(gta.pierRows[1]), r: 34, time: 95,
        done: () => gtaBanner('💥 IT\'S A SETUP', 'heat', 1.6) },
      { kind: 'kill', text: 'HANDLE THE RENEGOTIATION 💥',
        spawn: [
          { cls: 'sports', key: 'target', hostile: true, at: () => gtaShorePoint(gta.pierRows[1]), dy: -220, col: '#c23a3a' },
          { cls: 'sports', key: 'target', hostile: true, at: () => gtaShorePoint(gta.pierRows[1]), dy: 220, col: '#c23a3a' },
        ] },
    ],
    outro: '"renegotiation handled. the customer respects the process now. the customer respects everything now." — S.W.',
  },
  {
    key: 'shredder', title: 'THE SHREDDER',
    brief: '"NPD impounded a BATTER VAN full of paperwork that spells our name correctly. it\'s sitting outside NPD HQ. make it a bonfire — dip grenades enclosed." — S.W.',
    reward: 420,
    gear: { nade: 5 },
    steps: [
      { kind: 'kill', text: 'DESTROY THE EVIDENCE VAN 💣',
        spawn: { cls: 'van', key: 'target', at: () => gtaLmCurb('npd'), dy: -60, cop: true },
        done: () => gtaAddHeat(3.4) },
      { kind: 'escape', text: 'LOSE THE HEAT 🚔' },
    ],
    outro: '"paperwork resolved. that closes ACT ONE. stay near a phone — the HARBOR JOB is being priced." — S.W.',
  },
  // ---- ACT 2 (Sprint 8): everything below is prep for the harbor -------------
  {
    key: 'pierpressure', title: 'PIER PRESSURE',
    brief: '"act two. the harbor job needs an empty pier, and NPD parked a checkpoint on the shore road. un-park it. loudly is fine. loudly is expected." — S.W.',
    reward: 480,
    steps: [
      { kind: 'kill', text: 'CLEAR THE NPD CHECKPOINT 💥',
        spawn: [
          { cls: 'cruiser', key: 'target', at: () => gtaShorePoint(gta.pierRows[0]), dy: -60, cop: true, lightsOn: true },
          { cls: 'cruiser', key: 'target', at: () => gtaShorePoint(gta.pierRows[0]), dy: 60, cop: true, lightsOn: true },
        ],
        done: () => gtaAddHeat(2.6) },
      { kind: 'escape', text: 'LOSE THE HEAT 🚔' },
    ],
    outro: '"checkpoint un-parked. the shore road sleeps again. so should you — big week." — S.W.',
  },
  {
    key: 'longlens', title: 'THE LONG LENS',
    brief: '"a camera car with a very long lens has been photographing OUR warehouses. it\'s parked downtown, outside the arcade. bring it to SAUCE WORKS — intact, film inside." — S.W.',
    reward: 520,
    steps: [
      { kind: 'jack', text: 'STEAL THE CAMERA CAR 📷',
        spawn: { cls: 'sedan', key: 'cargo', at: () => gtaLmCurb('arcade'), dy: -120, col: '#22262e' },
        done: () => gtaAddHeat(1.2) },
      { kind: 'go', text: 'DELIVER IT — SAUCE WORKS (INTACT)', at: () => gtaLmCurb('sauce'), r: 34,
        needCar: 'cargo', time: 110, failText: '📷 THE FILM IS DEVELOPING IN A FIREBALL' },
    ],
    outro: '"film recovered. forty photographs of warehouse roofs and one of a seagull. artists." — S.W.',
  },
  {
    key: 'noise', title: 'NOISE COMPLAINT',
    brief: '"thursday we move batter through the suburbs, so tonight every cruiser in nuggetown needs to be looking at YOU instead. make noise. keep it loud. then vanish like a rumor." — S.W.',
    reward: 560,
    steps: [
      { kind: 'wanted', text: 'GET NPD ATTENTION — REACH 3★ 🚔', n: 3 },
      { kind: 'heathold', text: 'KEEP IT LOUD — HOLD 3★', n: 3, dur: 20 },
      { kind: 'escape', text: 'NOW VANISH 🚔 (THE GARAGE KNOWS A GUY)' },
    ],
    outro: '"beautiful racket. NPD filed it as \'weather\'. thursday is a go." — S.W.',
  },
  {
    key: 'ghostshift', title: 'GHOST SHIFT',
    brief: '"our advance scout drives the harbor route tonight. shadow his tanker — if he\'s followed by anyone but you, the job is off and so are you." — S.W.',
    reward: 600,
    steps: [
      { kind: 'go', text: 'MEET THE ROUTE — NOODLE NUG 🛢️', at: () => gtaLmCurb('noodle'), r: 60 },
      { kind: 'tail', text: 'SHADOW THE SCOUT — NOT TOO CLOSE', dur: 26, track: 'scout',
        spawn: { cls: 'tanker', key: 'scout', at: () => gtaLmCurb('noodle'), dy: 130, drive: true } },
    ],
    outro: '"route confirmed clean. the scout never saw you. neither did we. perfect." — S.W.',
  },
  {
    key: 'harborjob', title: 'THE HARBOR JOB',
    brief: '"tonight. the buyers want PROOF the merchandise from the catch incident is still where we left it. drive to the END of the north pier and hold position. whatever you see — that\'s between you, us, and the bay." — S.W.',
    reward: 900,
    steps: [
      { kind: 'go', text: 'GET TO THE NORTH PIER GATE ⚓', at: () => gtaShorePoint(gta.pierRows[0]), r: 36 },
      { kind: 'go', text: 'DRIVE OUT TO THE PIER\'S END 🌊',
        at: () => ({ x: (GTA_W - 4.5) * GTA_TILE, y: (gta.pierRows[0] + 1) * GTA_TILE }), r: 40 },
      { kind: 'watch', text: 'HOLD POSITION — SOMETHING IS SURFACING 🌩️', dur: 8, r: 48,
        at: () => ({ x: (GTA_W - 4.5) * GTA_TILE, y: (gta.pierRows[0] + 1) * GTA_TILE }),
        done: () => {
          // THE CATCH INCIDENT, eyewitness edition. Canon holds: it lives,
          // it stays, nobody frees it, nobody kills it. Case open forever.
          try { localStorage.setItem('nugGtaSawStorm', '1'); } catch (e) { /* private mode */ }
          gtaBanner('🌩️ IT\'S ALIVE', 'go', 2.2);
          gtaAddHeat(5);
          const p = gtaShorePoint(gta.pierRows[0]);
          for (const dy of [-140, -60, 60, 140]) {
            gta.cars.push({
              x: p.x, y: p.y + dy, a: 0, dir: 0, v: 0, cls: 'cruiser', col: '#e8ecf4',
              hp: 120, cop: true, chase: true, parked: false, wreck: false,
              nd: null, blockT: 0, hitT: 0, emberT: 0,
            });
          }
        } },
      { kind: 'escape', text: 'NPD RAID — ESCAPE 🚔🚁' },
    ],
    outro: '"proof received. payment doubled. it\'s alive down there, and it STAYS down there — the case stays open, the bay keeps the secret. pleasure doing crimes with you." — S.W.',
  },
];

// A car that belongs to the contract: despawn-proof, doors mostly locked.
function gtaMisCar(spec) {
  const p = spec.at();
  const C = GTA_CLASSES[spec.cls];
  const o = {
    x: p.x + (spec.dx || 0), y: p.y + (spec.dy || 0), a: -Math.PI / 2, dir: 3, v: 0,
    cls: spec.cls, col: spec.col || C.cols[0], hp: C.hp,
    cop: !!spec.cop, chase: !!spec.hostile, hostile: !!spec.hostile,
    parked: !spec.drive && !spec.hostile, wreck: false, lightsOn: !!spec.lightsOn,
    nd: null, blockT: 0, hitT: 0, emberT: 0,
    mis: true, misKey: spec.key,
  };
  if (spec.drive) {
    // put them in a legal lane so the traffic AI can drive them — Dill is
    // the only driver in Nuggetown who signals
    const v = gtaPairStartV(Math.floor(o.x / GTA_TILE));
    for (const dir of [1, 3]) {
      const x = gtaLaneX(v, dir);
      const nd = gtaNextDecision(x, o.y, dir);
      if (nd) { o.dir = dir; o.x = x; o.a = GTA_DIR_A[dir]; o.nd = nd; o.v = 40; break; }
    }
  }
  gta.cars.push(o);
  return o;
}

function gtaMisFind(key) {
  for (const o of gta.cars) if (o.mis && o.misKey === key && !o.wreck) return o;
  return null;
}

function gtaMissionStepInit() {
  const M = gta.mission;
  const step = M.def.steps[M.si];
  M.st = { t: 0, close: 0, far: 0, hold: 0 };
  M.time = step.time || 0;
  M.warn = null;
  if (step.spawn) for (const s of [].concat(step.spawn)) gtaMisCar(s);
}

function gtaTryBooth(x, y, range) {
  if (!gta.boothRing) return false;
  for (const b of gta.booths) {
    const bx = (b.c + 0.5) * GTA_TILE, by = (b.r + 0.5) * GTA_TILE;
    if (Math.abs(x - bx) < range && Math.abs(y - by) < range) { gtaAnswerBooth(); return true; }
  }
  return false;
}

function gtaAnswerBooth() {
  const def = GTA_MISSIONS[gta.prog];
  if (!def) return;
  gta.mission = { def, si: 0, st: null, time: 0, mk: null, warn: null };
  gta.briefT = 6.5;
  if (def.gear) { // S.W. provides. S.W. deducts it from your end. probably.
    for (const k in def.gear) gta.ammo[k] = Math.max(gta.ammo[k], def.gear[k]);
    if (gta.wsel === 0) gtaCycleWeapon();
  }
  gtaBanner('📞 ' + def.title, 'go', 1.7);
  gtaMissionStepInit();
}

function gtaMissionCleanup(removeLive) {
  for (let i = gta.cars.length - 1; i >= 0; i--) {
    const o = gta.cars[i];
    if (!o.mis) continue;
    o.mis = false;
    o.misKey = null;
    if (o.hostile) { o.hostile = false; o.chase = false; o.parked = true; o.v = 0; }
    if (removeLive && !o.wreck) gta.cars.splice(i, 1);
  }
  gta.car.mis = false; gta.car.misKey = null;
  gta.mission = null;
  gta.briefT = 0;
}

function gtaMissionFail(reason) {
  if (!gta.mission) return;
  gtaMissionCleanup(true);
  gta.ringCd = 5;
  gta.toastMsg = '❌ ' + (reason || 'MISSION FAILED');
  gta.toastT = 3.4;
  if (gta.wastedT <= 0 && gta.bustedT <= 0) gtaBanner('❌ MISSION FAILED', 'heat', 1.8);
}

function gtaMissionComplete() {
  const def = gta.mission.def;
  gtaMissionCleanup(false); // survivors return to civilian life; wrecks stay put
  gta.prog++;
  try { localStorage.setItem('nugGtaProg', String(gta.prog)); } catch (e) { /* private mode */ }
  gtaPay(def.reward, '💰', gta.W / 2, gta.Hh * 0.42);
  gtaBanner('✔ MISSION PASSED', 'go', 2);
  gta.toastMsg = def.outro || '"payment sent. stay near a phone." — S.W.';
  gta.toastT = 4.5;
}

function gtaMissionAdvance() {
  const M = gta.mission;
  const step = M.def.steps[M.si];
  if (step.done) step.done();
  M.si++;
  if (M.si >= M.def.steps.length) gtaMissionComplete();
  else gtaMissionStepInit();
}

function gtaStepMission(dt) {
  const M = gta.mission;
  if (!M) return;
  if (gta.briefT > 0) gta.briefT -= dt;
  const step = M.def.steps[M.si];
  const P = gtaPlayerPos();
  M.st.t += dt;
  M.warn = null;

  // the marker: a fixed address, or wherever the mission car currently is
  if (step.at) M.mk = step.at();
  else {
    const t = gtaMisFind(step.track || 'target');
    M.mk = t ? { x: t.x, y: t.y } : null;
  }

  if (M.time > 0) {
    M.time -= dt;
    if (M.time <= 0) { gtaMissionFail(step.failText || '⏱ OUT OF TIME'); return; }
  }

  if (step.kind === 'go') {
    if (step.needCar) {
      const inIt = !gta.onFoot && gta.car.mis && gta.car.misKey === step.needCar;
      if (!inIt && !gtaMisFind(step.needCar)) { gtaMissionFail(step.failText); return; }
      if (!inIt) { M.warn = 'GET BACK IN THE CARGO'; return; }
    }
    if (Math.abs(P.x - M.mk.x) < step.r && Math.abs(P.y - M.mk.y) < step.r) gtaMissionAdvance();
  } else if (step.kind === 'jack') {
    if (!gta.onFoot && gta.car.mis && gta.car.misKey === 'cargo') { gtaMissionAdvance(); return; }
    if (!gtaMisFind('cargo')) gtaMissionFail(step.failText || '🛢️ THE CARGO IS TOAST');
  } else if (step.kind === 'kill') {
    let alive = false;
    for (const o of gta.cars) if (o.mis && o.misKey === 'target' && !o.wreck) { alive = true; break; }
    if (!alive) gtaMissionAdvance();
  } else if (step.kind === 'tail') {
    const dill = gtaMisFind(step.track || 'dill');
    if (!dill) { gtaMissionFail('🕵️ YOUR MARK IS TOAST. SUBTLE.'); return; }
    const d = Math.hypot(P.x - dill.x, P.y - dill.y);
    if (d < 58) {
      M.st.close += dt; M.st.far = 0;
      M.warn = 'TOO CLOSE';
      if (M.st.close > 2.4) { gtaMissionFail('🕵️ HE MADE YOU'); return; }
    } else if (d > 310) {
      M.st.far += dt; M.st.close = 0;
      M.warn = 'FALLING BEHIND';
      if (M.st.far > 7) { gtaMissionFail('🕵️ YOU LOST HIM'); return; }
    } else { M.st.close = Math.max(0, M.st.close - dt); M.st.far = 0; }
    if (M.st.t >= step.dur) gtaMissionAdvance();
  } else if (step.kind === 'escape') {
    if (gtaStars() === 0) gtaMissionAdvance();
  } else if (step.kind === 'wanted') {
    if (gtaStars() >= step.n) gtaMissionAdvance();
  } else if (step.kind === 'heathold') {
    if (gtaStars() >= step.n) M.st.hold += dt;
    else { M.warn = 'GET BACK TO ' + step.n + '★'; M.st.hold = Math.max(0, M.st.hold - dt); }
    if (M.st.hold >= step.dur) gtaMissionAdvance();
  } else if (step.kind === 'watch') {
    // the harbor job: hold the pier's end while the bay gives up its secret
    const inR = Math.abs(P.x - M.mk.x) < step.r && Math.abs(P.y - M.mk.y) < step.r;
    if (inR) M.st.hold += dt;
    else { M.warn = 'HOLD POSITION AT THE PIER\'S END'; M.st.hold = Math.max(0, M.st.hold - dt * 2); }
    gta.stormRise = Math.min(1, M.st.hold / step.dur);
    if (M.st.hold >= step.dur) gtaMissionAdvance();
  }
}

// ---- SIDE GIGS (Sprint 8) ----------------------------------------------------------------
// Repeatable freeplay work, no phone required: boost a BUS and NUG-EX clocks
// you in, boost a CRUISER and dispatch feeds you felons, grab a 💀 off the
// road and it's a rampage. One job at a time — a gig won't start while S.W.
// is on the line, and the phones stay quiet while a gig runs.

function gtaGigStart(type) {
  if (gta.mission || gta.gig || gta.phase !== 'play') return;
  if (type === 'nugex') {
    gta.gig = { type, count: 0, time: 65, mk: gtaGigDrop(null) };
    gtaBanner('📦 NUG-EX SHIFT — CLOCK IN', 'go', 1.6);
  } else if (type === 'vigil') {
    gta.gig = { type, count: 0, time: 55, mk: null, felon: null };
    gtaBanner('🚨 VIGILANTE — DISPATCH HAS A FELON', 'go', 1.6);
  } else if (type === 'rampage') {
    gta.gig = { type, count: 0, time: 50, mk: null, need: 10 };
    gta.ammo.uzi = Math.max(gta.ammo.uzi, 90); // company uzi
    gtaSelectWeapon(2);
    gtaBanner('💀 RAMPAGE — 10 IN 50 SECONDS', 'heat', 1.8);
  }
}

function gtaGigDrop(not) { // a landmark curb that isn't the one you're at
  const keys = ['arcade', 'npd', 'general', 'noodle', 'sauce', 'garage', 'ammu'];
  let key;
  do { key = keys[Math.floor(Math.random() * keys.length)]; } while (key === not);
  const p = gtaLmCurb(key);
  return { x: p.x, y: p.y, key };
}

// A very fast someone who really needs to be elsewhere. Lane-locked like all
// traffic, just wildly over the limit — cut them off or wreck them.
function gtaGigFelon() {
  const T = GTA_TILE;
  const R = Math.max(gta.W, gta.Hh) * 0.72;
  for (let tries = 0; tries < 20; tries++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = R + 60 + Math.random() * 90;
    const x = gta.cam.x + Math.cos(ang) * rad, y = gta.cam.y + Math.sin(ang) * rad;
    const tc = Math.floor(x / T), tr = Math.floor(y / T);
    if (tc < 1 || tr < 1 || tc >= GTA_W - 1 || tr >= GTA_H - 1) continue;
    if (gtaTile(tc, tr) !== GT_ROAD || (gta.vRoad[tc] && gta.hRoad[tr])) continue;
    let dir, sx = x, sy = y;
    if (gta.vRoad[tc]) { const v = gtaPairStartV(tc); dir = tc === v ? 1 : 3; sx = gtaLaneX(v, dir); }
    else { const h = gtaPairStartH(tr); dir = tr === h ? 2 : 0; sy = gtaLaneY(h, dir); }
    const nd = gtaNextDecision(sx, sy, dir);
    if (!nd) continue;
    const o = {
      x: sx, y: sy, a: GTA_DIR_A[dir], dir, v: 120, cls: 'sports', col: '#ff2fa0',
      hp: GTA_CLASSES.sports.hp, cop: false, chase: false, felon: true, gigCar: true,
      parked: false, wreck: false, nd, blockT: 0, hitT: 0, emberT: 0,
    };
    gta.cars.push(o);
    return o;
  }
  return null;
}

function gtaGigEnd(msg) {
  for (const o of gta.cars) if (o.gigCar) { o.gigCar = false; o.felon = false; }
  gta.gig = null;
  gta.toastMsg = msg;
  gta.toastT = 3.2;
}

function gtaStepGig(dt) {
  const G = gta.gig;
  if (!G) return;
  const P = gtaPlayerPos();
  if (G.type === 'nugex') {
    if (gta.onFoot || gta.car.cls !== 'bus') { gtaGigEnd('📦 SHIFT OVER — ' + G.count + ' DELIVERED'); return; }
    G.time -= dt;
    if (G.time <= 0) { gtaGigEnd('📦 MISSED THE WINDOW — ' + G.count + ' DELIVERED'); return; }
    if (Math.abs(P.x - G.mk.x) < 32 && Math.abs(P.y - G.mk.y) < 32) {
      G.count++;
      gtaPay(40 + G.count * 6, '📦', gta.W / 2, gta.Hh * 0.42);
      G.mk = gtaGigDrop(G.mk.key);
      G.time = Math.max(38, 62 - G.count * 2); // the routes get tighter
    }
  } else if (G.type === 'vigil') {
    if (gta.onFoot || !gta.car.cop) { gtaGigEnd('🚨 OFF DUTY — ' + G.count + ' COLLARED'); return; }
    if (!G.felon) {
      G.felon = gtaGigFelon(); // may whiff on bad ground; retry next frame
      G.mk = null;
      if (G.felon) G.time = 55;
      return;
    }
    G.time -= dt;
    if (G.time <= 0) { gtaGigEnd('🚨 THE FELON GOT AWAY — ' + G.count + ' COLLARED'); return; }
    if (G.felon.wreck) {
      G.count++;
      gtaPay(35 + G.count * 8, '🚨', gta.W / 2, gta.Hh * 0.42);
      gtaBanner('🚨 FELON COLLARED', 'go', 1.1);
      G.felon = null; // dispatch has another
      return;
    }
    G.mk = { x: G.felon.x, y: G.felon.y };
  } else if (G.type === 'rampage') {
    G.time -= dt;
    if (G.count >= G.need) {
      gtaPay(150, '💀', gta.W / 2, gta.Hh * 0.42);
      gtaAddHeat(1.5); // that many crumbs, someone counted
      gtaGigEnd('💀 RAMPAGE COMPLETE');
      return;
    }
    if (G.time <= 0) gtaGigEnd('💀 RAMPAGE OVER — ' + G.count + '/' + G.need);
  }
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
    } else if (gta.bustedT > 0) {
      gta.bustedT -= dt;
      if (gta.bustedT <= 0) gtaBustedRespawn();
    } else if (gta.sprayT > 0) {
      // held still under the mist; a little smoke sells the paint job
      gta.sprayT -= dt;
      gta.car.vx *= Math.exp(-6 * dt);
      gta.car.vy *= Math.exp(-6 * dt);
      if (Math.random() < dt * 14) {
        gtaSpawnParts(gta.car.x + (Math.random() - 0.5) * 16, gta.car.y + (Math.random() - 0.5) * 16, 1, 'smoke');
      }
      if (gta.sprayT <= 0) gtaFinishRespray();
    } else if (gta.onFoot) {
      gtaStepFoot(dt);
      gtaStepFire(dt);
    } else {
      gtaStepPlayerCar(dt);
      gtaStepFire(dt);
    }
    gtaStepWorld(dt);
  }

  gtaDraw();
}

function gtaStepPlayerCar(dt) {
  const car = gta.car;
  const C = GTA_CLASSES[car.cls];
  // Spiked tires: mushy grip, no top end, constant squirrel.
  const tireK = gta.tiresOut ? 0.55 : 1;
  const cos = Math.cos(car.a), sin = Math.sin(car.a);

  // Decompose velocity into forward + lateral components.
  let vf = car.vx * cos + car.vy * sin;
  let vl = -car.vx * sin + car.vy * cos;

  // Throttle / brake / reverse
  const gas = (gta.keys.up ? 1 : 0), rev = (gta.keys.down ? 1 : 0);
  if (gas) vf = Math.min(C.maxFwd * tireK, vf + C.accel * dt);
  if (rev) {
    if (vf > 8) vf = Math.max(0, vf - C.brake * dt);        // rolling: brake first
    else vf = Math.max(-C.maxRev, vf - C.accel * 0.7 * dt); // then back up
  }
  // Handbrake locks the rears: hard forward scrub, loose rear end.
  if (gta.handbrake) vf *= Math.exp(-2.6 * dt);
  vf *= Math.exp(-GTA_DRAG * dt);
  vl *= Math.exp(-(gta.handbrake ? C.drift : C.grip * tireK) * dt);

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
      o.playerHit = true;
      gtaDamageCar(o, dmg);
      gtaDamagePlayerCar(dmg * 0.5);
      gtaAddHeat(o.cop ? 0.35 : 0.08);
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

  // Spike strips do exactly what it says on the NPD requisition form.
  if (!gta.tiresOut && spd > 40) {
    for (const s of gta.strips) {
      if (car.x > s.x - 4 && car.x < s.x + s.w + 4 && car.y > s.y - 4 && car.y < s.y + s.h + 4) {
        gta.tiresOut = true;
        gtaSpawnParts(car.x, car.y, 6, 'spark');
        gta.shake = Math.max(gta.shake, 0.3);
        gtaBanner('💥 SPIKED', 'heat', 1.2);
        break;
      }
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

// The player at walking pace: screen-relative movement (the camera is
// north-up, so up is up), sprint on SHIFT while the stamina holds, punch on
// SPACE, re-breading near noodle carts, and cars hurt now — you're not in one.
function gtaStepFoot(dt) {
  const p = gta.ped;
  const ix = (gta.keys.right ? 1 : 0) - (gta.keys.left ? 1 : 0);
  const iy = (gta.keys.down ? 1 : 0) - (gta.keys.up ? 1 : 0);
  const movin = ix || iy;

  const sprint = gta.keys.shift && gta.stamina > 1 && movin;
  if (sprint) gta.stamina = Math.max(0, gta.stamina - 30 * dt);
  else gta.stamina = Math.min(100, gta.stamina + 16 * dt);
  const spd = sprint ? 98 : 56;

  let tx = 0, ty = 0;
  if (movin) {
    const n = Math.hypot(ix, iy);
    tx = (ix / n) * spd; ty = (iy / n) * spd;
  }
  p.vx += (tx - p.vx) * Math.min(1, 14 * dt);
  p.vy += (ty - p.vy) * Math.min(1, 14 * dt);
  if (movin) {
    p.a = Math.atan2(p.vy, p.vx);
    p.t += dt * (sprint ? 1.1 : 0.4); // feet animate with effort
  }

  // Same axis-separated collision as the car, pedestrian-sized.
  const R = 3.5;
  const nx = p.x + p.vx * dt;
  if (gtaSolidAt(nx + Math.sign(p.vx) * R, p.y - R * 0.6) ||
      gtaSolidAt(nx + Math.sign(p.vx) * R, p.y + R * 0.6)) p.vx = 0;
  else p.x = nx;
  const ny = p.y + p.vy * dt;
  if (gtaSolidAt(p.x - R * 0.6, ny + Math.sign(p.vy) * R) ||
      gtaSolidAt(p.x + R * 0.6, ny + Math.sign(p.vy) * R)) p.vy = 0;
  else p.y = ny;

  if (gta.punchT > 0) gta.punchT -= dt;
  if (gta.punchAnim > 0) gta.punchAnim -= dt;
  if (gta.hurtI > 0) gta.hurtI -= dt;

  // Noodle Nug carts: stand in the steam, get your coating back.
  gta.noodleT = Math.max(0, gta.noodleT - dt);
  for (const c of gta.noodleCarts) {
    const cx = (c.c + 0.5) * GTA_TILE, cy = (c.r + 0.5) * GTA_TILE;
    if (Math.abs(p.x - cx) < 26 && Math.abs(p.y - cy) < 26) {
      if (gta.breading < 100) {
        gta.breading = Math.min(100, gta.breading + 16 * dt);
        gta.noodleT = 0.3;
        if (Math.random() < dt * 4) gtaSpawnParts(cx, cy - 6, 1, 'smoke');
      }
      break;
    }
  }

  // Moving traffic vs. your unarmored self.
  for (const o of gta.cars) {
    if (o.parked || o.wreck || o.v < 30) continue;
    const rr = GTA_CLASSES[o.cls].r + 3;
    if (Math.abs(p.x - o.x) < rr && Math.abs(p.y - o.y) < rr) {
      const kx = p.x - o.x, ky = p.y - o.y, d = Math.hypot(kx, ky) || 1;
      p.vx += (kx / d) * o.v * 1.2;
      p.vy += (ky / d) * o.v * 1.2;
      gtaHurtPlayer(o.v * 0.28);
      o.v *= 0.4;
      break;
    }
  }
}

// SPACE on foot: nuggets first, sheet metal second. Keep punching a parked
// car and you'll learn why the hazard placard exists.
function gtaPunch() {
  if (!gta.onFoot || gta.punchT > 0 || gta.wastedT > 0) return;
  gta.punchT = 0.38;
  gta.punchAnim = 0.16;
  const p = gta.ped;
  const fx = p.x + Math.cos(p.a) * 9, fy = p.y + Math.sin(p.a) * 9;
  for (let i = gta.peds.length - 1; i >= 0; i--) {
    const q = gta.peds[i];
    if (Math.abs(q.x - fx) < 8 && Math.abs(q.y - fy) < 8) {
      gtaCrumb(q, 3, '👊');
      return;
    }
  }
  for (const o of gta.cars) {
    const rr = GTA_CLASSES[o.cls].r + 4;
    if (Math.abs(o.x - fx) < rr && Math.abs(o.y - fy) < rr) {
      o.playerHit = true;
      gtaDamageCar(o, 6);
      gtaAddHeat(o.cop ? 0.3 : 0.05);
      gtaSpawnParts(fx, fy, 2, 'spark');
      return;
    }
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
    for (const o of gta.cars) if (!o.parked && !o.wreck && !o.chase) moving++;
    if (moving < GTA_TRAFFIC_CAP) gtaSpawnTraffic();
    if (gta.peds.length < GTA_PED_CAP) { gtaSpawnPed(); gtaSpawnPed(); }
  }
  const R2 = Math.max(gta.W, gta.Hh) * 0.72 + 330;
  for (let i = gta.cars.length - 1; i >= 0; i--) {
    const o = gta.cars[i];
    if (o.mis || o.gigCar) continue; // mission + gig cars are despawn-proof
    if (Math.abs(o.x - gta.cam.x) > R2 || Math.abs(o.y - gta.cam.y) > R2) gta.cars.splice(i, 1);
  }
  for (let i = gta.peds.length - 1; i >= 0; i--) {
    const p = gta.peds[i];
    if (Math.abs(p.x - gta.cam.x) > R2 || Math.abs(p.y - gta.cam.y) > R2) gta.peds.splice(i, 1);
  }

  for (const o of gta.cars) {
    // BBQ'd: burn down to the fireball unless the timer runs out first
    if (!o.wreck && o.burnT > 0) {
      o.burnT -= dt;
      gtaDamageCar(o, 15 * dt);
      if (!o.wreck && Math.random() < dt * 8) {
        gtaSpawnParts(o.x + (Math.random() - 0.5) * 8, o.y + (Math.random() - 0.5) * 8, 1, 'fire');
      }
    }
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
    if (o.chase) { gtaStepChaser(o, dt); continue; }
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

  // ---- NPD dispatch -------------------------------------------------------
  const stars = gtaStars();
  const busy = gta.wastedT > 0 || gta.bustedT > 0;
  if (stars >= 1 && !busy) {
    // patrols in earshot join the pursuit
    for (const o of gta.cars) {
      if (o.cop && !o.chase && !o.wreck && !o.parked &&
          Math.abs(o.x - P.x) < 330 && Math.abs(o.y - P.y) < 330) o.chase = true;
    }
    // dispatch tops the pack up to strength; 5★ sends the BATTER VAN
    gta.copT = (gta.copT || 0) - dt;
    if (gta.copT <= 0) {
      gta.copT = 1.3;
      let chasers = 0, vans = 0;
      for (const o of gta.cars) if (o.chase && !o.wreck) { chasers++; if (o.cls === 'van') vans++; }
      if (chasers < Math.min(5, stars + 1)) {
        gtaSpawnChaser(stars >= 5 && vans < 2 ? 'van' : 'cruiser');
      }
    }
  }
  // heat decays when they can't see you; below one star the pursuit stands down
  if (gta.heat > 0) {
    let copNear = false;
    for (const o of gta.cars) {
      if (o.cop && !o.wreck && Math.abs(o.x - P.x) < 260 && Math.abs(o.y - P.y) < 260) { copNear = true; break; }
    }
    gta.heat = Math.max(0, gta.heat - (copNear ? 0.012 : 0.07) * dt);
    if (gtaStars() === 0) {
      for (const o of gta.cars) if (o.chase && o.cop) { o.chase = false; o.parked = true; o.v = 0; }
    }
  }
  // the bust: boxed in, slow (or on foot), a cruiser on top of you
  if (stars >= 1 && !busy && gta.sprayT <= 0) {
    const pSlow = gta.onFoot || Math.hypot(gta.car.vx, gta.car.vy) < 30;
    let copOn = false;
    if (pSlow) {
      for (const o of gta.cars) {
        if (o.chase && o.cop && !o.wreck && Math.abs(o.x - P.x) < 30 && Math.abs(o.y - P.y) < 30) { copOn = true; break; }
      }
    }
    if (copOn) {
      gta.bustT += dt;
      if (gta.bustT > 0.9) gtaBusted();
    } else gta.bustT = Math.max(0, gta.bustT - dt * 2);
  }
  // roadblocks ahead of a hot, fast player
  gta.blockCd -= dt;
  if (stars >= 3 && !gta.onFoot && !busy && gta.blockCd <= 0) {
    // a whiff (bad ground ahead) retries fast; a landed block earns the wait
    gta.blockCd = gtaSpawnRoadblock() ? 11 : 0.7;
  }
  for (let i = gta.strips.length - 1; i >= 0; i--) {
    if ((gta.strips[i].life -= dt) <= 0) gta.strips.splice(i, 1);
  }
  gta.sprayCd = Math.max(0, gta.sprayCd - dt);
  gtaCheckRespray();
  // -------------------------------------------------------------------------

  // ---- the syndicate line + side gigs ----------------------------------------
  gta.ringCd = Math.max(0, gta.ringCd - dt);
  gta.boothRing = !gta.mission && !gta.gig && gta.ringCd <= 0 && gta.prog < GTA_MISSIONS.length &&
    gta.wastedT <= 0 && gta.bustedT <= 0;
  gta.stormRise = Math.max(0, gta.stormRise - dt * 0.3); // the bay reclaims (watch re-ups it)
  gtaStepMission(dt);
  gtaStepGig(dt);

  // Live rounds: fly, expire, spark off walls, crumb nuggets, dent sheet metal.
  for (let i = gta.shots.length - 1; i >= 0; i--) {
    const s = gta.shots[i];
    s.life -= dt;
    if (s.life <= 0) { gta.shots.splice(i, 1); continue; }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (gtaSolidAt(s.x, s.y)) {
      if (!s.flame) gtaSpawnParts(s.x, s.y, 1, 'spark');
      gta.shots.splice(i, 1);
      continue;
    }
    let hit = false;
    for (let j = gta.peds.length - 1; j >= 0; j--) {
      const q = gta.peds[j];
      if (Math.abs(q.x - s.x) < 6 && Math.abs(q.y - s.y) < 6) {
        gtaCrumb(q, 3, s.flame ? '🔥' : '💥');
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const o of gta.cars) {
        if (o.wreck) continue;
        const rr = GTA_CLASSES[o.cls].r + 2;
        if (Math.abs(o.x - s.x) < rr && Math.abs(o.y - s.y) < rr) {
          o.playerHit = true;
          if (s.flame) { o.burnT = Math.max(o.burnT || 0, 2.4); gtaDamageCar(o, 2); }
          else { gtaDamageCar(o, s.dmg); gtaSpawnParts(s.x, s.y, 2, 'spark'); }
          hit = true;
          break;
        }
      }
    }
    if (hit) gta.shots.splice(i, 1);
  }

  // Dip grenades: skid to a stop, blink, redecorate.
  for (let i = gta.nades.length - 1; i >= 0; i--) {
    const n = gta.nades[i];
    n.t -= dt;
    n.vx *= Math.exp(-2.6 * dt);
    n.vy *= Math.exp(-2.6 * dt);
    const nx = n.x + n.vx * dt, ny = n.y + n.vy * dt;
    if (gtaSolidAt(nx, ny)) { n.vx *= -0.4; n.vy *= -0.4; }
    else { n.x = nx; n.y = ny; }
    if (n.t <= 0) {
      gta.nades.splice(i, 1);
      gtaNadeBoom(n.x, n.y);
    }
  }

  gta.wtoastT = Math.max(0, gta.wtoastT - dt);
  gta.ammuCd = Math.max(0, gta.ammuCd - dt);

  // A hurting ride smokes; a dying one spits fire. Consider the Grease Garage.
  if (gta.wastedT <= 0 && !gta.onFoot) {
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

  // Noodle carts steam at all hours.
  gta.cartT -= dt;
  if (gta.cartT <= 0) {
    gta.cartT = 0.55;
    for (const c of gta.noodleCarts) {
      const cx = (c.c + 0.5) * GTA_TILE, cy = (c.r + 0.5) * GTA_TILE;
      if (Math.abs(cx - gta.cam.x) < gta.W * 0.7 && Math.abs(cy - gta.cam.y) < gta.Hh * 0.7) {
        gtaSpawnParts(cx + (Math.random() - 0.5) * 6, cy - 6, 1, 'smoke');
      }
    }
  }

  // Pickups: drive (or walk) over a crate, it's yours. That's the law here.
  for (const p of gta.pickups) {
    if (p.taken) {
      if (gta.t > p.respawn) p.taken = false;
      continue;
    }
    const px = (p.c + 0.5) * GTA_TILE, py = (p.r + 0.5) * GTA_TILE;
    if (Math.abs(P.x - px) < 11 && Math.abs(P.y - py) < 11) {
      if (p.rampage && (gta.mission || gta.gig)) continue; // one bad idea at a time
      p.taken = true;
      p.respawn = gta.t + (p.rampage ? 150 : p.ammo ? 40 : 26);
      if (p.rampage) gtaGigStart('rampage');
      else if (p.ammo) {
        const w = GTA_WEAP_BY_KEY[p.ammo];
        gta.ammo[p.ammo] += w.give;
        gta.wtoastT = 1.4;
        if (gta.wsel === 0) gtaSelectWeapon(GTA_WEAPONS.indexOf(w));
        spawnPopLabel(gta.W / 2 * gta.scale, gta.Hh * 0.42 * gta.scale, w.icon + ' +' + w.give, '');
      }
      else if (p.gold) gtaPay(120, '✨', gta.W / 2, gta.Hh * 0.42);
      else { gta.crates++; gtaPay(12, '📦', gta.W / 2, gta.Hh * 0.42); }
    }
  }

  for (const s of gta.skids) s.life -= dt;
  while (gta.skids.length && gta.skids[0].life <= 0) gta.skids.shift();

  // Camera: chase with velocity look-ahead so you see where you're going.
  // On foot the look-ahead is gentler — walking pace, walking nerves.
  const la = gta.onFoot ? 0.6 : 0.42;
  const lookX = P.x + (P.vx || 0) * la, lookY = P.y + (P.vy || 0) * la;
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

  // Spike strips: NPD-issue, stud pattern visible from orbit (that's the point)
  for (const s of gta.strips) {
    const sx = s.x - ox, sy = s.y - oy;
    if (sx > W + 20 || sy > Hh + 20 || sx + s.w < -20 || sy + s.h < -20) continue;
    g.fillStyle = '#20242e';
    g.fillRect(sx, sy, s.w, s.h);
    g.fillStyle = '#c8ccd8';
    if (s.w > s.h) { for (let i = 2; i < s.w - 1; i += 4) g.fillRect(sx + i, sy + 1, 1, 2); }
    else { for (let i = 2; i < s.h - 1; i += 4) g.fillRect(sx + 1, sy + i, 2, 1); }
  }

  // Pickups
  for (const p of gta.pickups) {
    if (p.taken) continue;
    const px = (p.c + 0.5) * T - ox, py = (p.r + 0.5) * T - oy;
    if (px < -20 || px > W + 20 || py < -20 || py > Hh + 20) continue;
    if (p.ammo) {
      // a condiment drop: pulsing diamond in the weapon's color
      const w = GTA_WEAP_BY_KEY[p.ammo];
      const r = 4 + Math.sin(gta.t * 4 + p.c) * 0.8;
      g.save();
      g.translate(px, py);
      g.rotate(Math.PI / 4);
      g.fillStyle = 'rgba(5,5,12,0.6)';
      g.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
      g.fillStyle = w.col;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(-r, -r, r * 2, 2);
      g.restore();
    } else if (p.rampage) {
      // a skull in the road. everyone knows what a skull in the road means.
      g.font = '900 9px Consolas, monospace';
      g.textAlign = 'center';
      g.globalAlpha = 0.7 + 0.3 * Math.sin(gta.t * 6);
      g.fillStyle = '#eef2ff';
      g.fillText('💀', px, py + 3);
      g.globalAlpha = 1;
    } else if (p.gold) {
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

  // Noodle Nug carts: awning, counter glow, and steam that never stops.
  for (const c of gta.noodleCarts) {
    const px = c.c * T - ox, py = c.r * T - oy;
    if (px < -T || px > W + T || py < -T || py > Hh + T) continue;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(px + 3, py + 6, 18, 13);
    g.fillStyle = '#6b4226';
    g.fillRect(px + 4, py + 8, 16, 10);
    g.fillStyle = '#ffd23a';
    g.fillRect(px + 4, py + 8, 16, 2); // counter glow
    for (let i = 0; i < 4; i++) { // striped awning
      g.fillStyle = (i & 1) ? '#ff2fa0' : '#eef2ff';
      g.fillRect(px + 2 + i * 5, py + 3, 5, 4);
    }
    g.fillStyle = '#0c0c12'; // awning poles
    g.fillRect(px + 3, py + 7, 1, 11);
    g.fillRect(px + 20, py + 7, 1, 11);
    // bowl sign, wobbling like it's hot
    if (Math.sin(gta.t * 2.4 + c.c) > -0.4) {
      g.font = '900 7px Consolas, monospace';
      g.textAlign = 'center';
      g.fillStyle = '#ff2fa0';
      g.fillText('NOODLE', px + 12, py + 1);
    }
  }

  // Phone booths: the syndicate calls collect. Ringing ones are hard to miss.
  for (const b of gta.booths) {
    const px = b.c * T - ox, py = b.r * T - oy;
    if (px < -T * 2 || px > W + T || py < -T * 2 || py > Hh + T) continue;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(px + 6, py + 3, 13, 19);
    g.fillStyle = '#123a5e'; // the shell
    g.fillRect(px + 7, py + 4, 11, 17);
    g.fillStyle = '#0a2038';
    g.fillRect(px + 8, py + 9, 9, 11);
    g.globalAlpha = 0.55; // glass
    g.fillStyle = '#7ac8ff';
    g.fillRect(px + 9, py + 10, 7, 8);
    g.globalAlpha = 1;
    g.fillStyle = '#ffe23a'; // lit PHONE sign
    g.fillRect(px + 8, py + 5, 9, 3);
    if (gta.boothRing) {
      const rr2 = (gta.t * 26) % 16;
      g.strokeStyle = 'rgba(255,226,58,' + (0.7 * (1 - rr2 / 16)).toFixed(2) + ')';
      g.lineWidth = 1;
      g.beginPath(); g.arc(px + 12, py + 12, 6 + rr2, 0, Math.PI * 2); g.stroke();
      if (Math.floor(gta.t * 6) % 2 === 0) {
        g.font = '900 8px Consolas, monospace';
        g.textAlign = 'center';
        g.fillStyle = '#ffe23a';
        g.fillText('📞', px + 12, py + 1);
      }
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
    if (gx > -80 && gx < W + 80 && gy > -80 && gy < Hh + 80) {
      const pul = 0.16 + 0.1 * Math.sin(gta.t * 1.7);
      const gr = g.createRadialGradient(gx, gy, 1, gx, gy, 26);
      gr.addColorStop(0, 'rgba(255,210,58,' + pul.toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(255,210,58,0)');
      g.fillStyle = gr;
      g.fillRect(gx - 26, gy - 26, 52, 52);
      // THE HARBOR JOB: the water bulges gold and something with its own
      // weather comes up for air. It looks at you. It goes back under.
      if (gta.stormRise > 0) {
        const k = gta.stormRise;
        const gr2 = g.createRadialGradient(gx, gy, 2, gx, gy, 26 + 40 * k);
        gr2.addColorStop(0, 'rgba(255,220,80,' + (0.4 * k).toFixed(3) + ')');
        gr2.addColorStop(1, 'rgba(255,210,58,0)');
        g.fillStyle = gr2;
        g.fillRect(gx - 70, gy - 70, 140, 140);
        const ry2 = gy - 8 * k;
        g.fillStyle = 'rgba(16,20,38,' + (0.9 * k).toFixed(3) + ')';
        g.beginPath(); g.ellipse(gx, ry2, 15 * k, 9 * k, 0, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 7; i++) { // nuggets, orbiting. of course they orbit.
          const a2 = gta.t * 2.2 + i * (Math.PI * 2 / 7);
          const rr3 = (13 + 5 * Math.sin(gta.t * 3 + i)) * k;
          g.fillStyle = '#ffd23a';
          g.fillRect(gx + Math.cos(a2) * rr3 - 1, ry2 + Math.sin(a2) * rr3 * 0.6 - 1, 3, 3);
        }
        if (k > 0.7 && Math.random() < 0.14) { // it crackles. it's ALIVE.
          g.strokeStyle = 'rgba(255,255,255,0.8)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(gx + (Math.random() - 0.5) * 22, ry2 - 12);
          g.lineTo(gx + (Math.random() - 0.5) * 22, ry2 + 6);
          g.stroke();
        }
      }
    }
  }

  // Mission (or gig) marker: a gold ring on the tarmac, GTA-classic.
  const mkNow = (gta.mission && gta.mission.mk) || (gta.gig && gta.gig.mk);
  if (mkNow) {
    const mx = mkNow.x - ox, my = mkNow.y - oy;
    if (mx > -30 && mx < W + 30 && my > -30 && my < Hh + 30) {
      const r = 10 + Math.sin(gta.t * 3.4) * 2;
      g.strokeStyle = 'rgba(255,210,58,0.85)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,210,58,0.3)';
      g.lineWidth = 1;
      g.beginPath(); g.arc(mx, my, r + 5, 0, Math.PI * 2); g.stroke();
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
  if (gta.phase === 'play' && gta.wastedT <= 0 && !gta.onFoot) {
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

  if (gta.wastedT <= 0) {
    if (gta.onFoot) gtaDrawPed(g, gta.ped.x - ox, gta.ped.y - oy, gta.ped, true);
    else gtaDrawVehicle(g, ox, oy, gta.car, true);
  }

  // Live rounds: flame blobs for the BBQ, tracers for everything else.
  for (const s of gta.shots) {
    const px = s.x - ox, py = s.y - oy;
    if (px < -10 || px > W + 10 || py < -10 || py > Hh + 10) continue;
    if (s.flame) {
      const k = s.life / 0.42;
      g.globalAlpha = Math.min(1, k * 1.3);
      g.fillStyle = k > 0.6 ? '#ffd23a' : k > 0.3 ? '#ff8a3d' : '#c23a1a';
      const r = 2 + (1 - k) * 3;
      g.fillRect(px - r / 2, py - r / 2, r, r);
      g.globalAlpha = 1;
    } else {
      g.strokeStyle = s.col;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px - s.vx * 0.02, py - s.vy * 0.02);
      g.stroke();
    }
  }

  // Dip grenades: little green pots, fuse blinking faster as it shortens.
  for (const n of gta.nades) {
    const px = n.x - ox, py = n.y - oy;
    if (px < -10 || px > W + 10 || py < -10 || py > Hh + 10) continue;
    g.fillStyle = '#2a4a2a';
    g.fillRect(px - 2, py - 2, 4, 4);
    g.fillStyle = '#4ab06a';
    g.fillRect(px - 2, py - 2, 4, 1);
    if (Math.floor(gta.t * (n.t < 0.4 ? 18 : 8)) % 2 === 0) {
      g.fillStyle = '#ff5252';
      g.fillRect(px, py - 3, 1, 1);
    }
  }

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
  // NPD livery: black-and-whites get the black, everyone gets the light bar
  if (v.cop) {
    if (v.cls === 'cruiser') {
      g.fillStyle = '#14161c';
      g.fillRect(-hw + 1, -hl, C.Wd - 2, 4);
      g.fillRect(-hw + 1, hl - 4, C.Wd - 2, 4);
      g.fillStyle = '#3ad4ff'; // door crest
      g.fillRect(-hw + 1, -1, 1, 2); g.fillRect(hw - 2, -1, 1, 2);
    } else if (v.cls === 'van') {
      g.fillStyle = '#ffd23a'; // the gold stripe nobody at city hall asked about
      g.fillRect(-hw + 1, 1, C.Wd - 2, 1);
    }
    const lit = v.chase || v.lightsOn;
    const flash = lit && Math.floor(gta.t * 7 + (v.x | 0)) % 2 === 0;
    g.fillStyle = lit ? (flash ? '#ff4040' : '#5090ff') : '#20242e';
    g.fillRect(-2, -2, 2, 2);
    g.fillStyle = lit ? (flash ? '#5090ff' : '#ff4040') : '#20242e';
    g.fillRect(0, -2, 2, 2);
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
// feet alternating; fleeing nugs put their little arms up. The player is the
// golden one — punches jab forward, taking damage blinks red.
function gtaDrawPed(g, px, py, p, isPlayer) {
  g.save();
  g.translate(px, py);
  g.rotate(p.a + Math.PI / 2);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(-3, -3, 6, 7);
  const step = Math.sin(p.t * (p.flee > 0 ? 22 : 11));
  g.fillStyle = '#3a2a18'; // little shoes
  g.fillRect(-2, -4 + (step > 0 ? -1 : 0), 2, 2);
  g.fillRect(1, -4 + (step > 0 ? 0 : -1), 2, 2);
  g.fillStyle = (isPlayer && gta.hurtI > 0.3 && Math.floor(gta.t * 14) % 2 === 0)
    ? '#ff5252' : p.col;
  g.fillRect(-2, -3, 5, 6); // the nug itself
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(-2, -3, 5, 2); // golden-fried crown
  if (isPlayer && gta.punchAnim > 0) { // the people's fist
    g.fillStyle = '#eef2ff';
    g.fillRect(0, -8, 2, 4);
  }
  if (p.flee > 0) { // arms up, wobbling
    g.fillStyle = p.col;
    g.fillRect(-4, -2 + (step > 0 ? -1 : 0), 2, 2);
    g.fillRect(3, -2 + (step > 0 ? 0 : -1), 2, 2);
  }
  g.restore();
}

function gtaDrawHud(g, W, Hh) {
  if (gta.phase !== 'play') return;
  g.textAlign = 'left';
  g.font = '900 10px Consolas, monospace';
  g.fillStyle = '#39ff7a';
  g.fillText('📦 ' + gta.crates, 6, Hh - 8);
  if (gta.onFoot) {
    g.fillStyle = gta.keys.shift && gta.stamina > 1 ? '#3ad4ff' : '#9aa3c7';
    g.fillText(gta.noodleT > 0 ? '🍜 RE-BREADING' : 'ON FOOT', 6, Hh - 20);
  } else {
    const spd = Math.round(Math.hypot(gta.car.vx, gta.car.vy) * 0.6);
    g.fillStyle = gta.handbrake ? '#ffe23a' : '#9aa3c7';
    g.fillText(spd + ' NPH', 6, Hh - 20);
  }

  // Bars, bottom up: breading always; then bodywork (driving) or stamina (foot).
  const bar = (y, pctV, col) => {
    g.fillStyle = 'rgba(5,5,12,0.7)';
    g.fillRect(6, y, 44, 5);
    g.fillStyle = col;
    g.fillRect(7, y + 1, Math.round(42 * Math.max(0, Math.min(1, pctV))), 3);
  };
  bar(Hh - 36, gta.breading / 100,
    gta.breading > 50 ? '#ffcf6a' : gta.breading > 25 ? '#ffe23a' : '#ff5252');
  g.font = '700 8px Consolas, monospace';
  g.fillStyle = '#9aa3c7';
  g.fillText('🍞', 54, Hh - 30);
  if (gta.onFoot) {
    bar(Hh - 44, gta.stamina / 100, '#3ad4ff');
  } else {
    const C = GTA_CLASSES[gta.car.cls];
    const pct = Math.max(0, gta.car.hp / C.hp);
    bar(Hh - 44, pct, pct > 0.5 ? '#39ff7a' : pct > 0.25 ? '#ffe23a' : '#ff5252');
    g.fillStyle = '#9aa3c7';
    g.fillText(C.name, 54, Hh - 38);
  }

  // The belt: current condiment + rounds remaining.
  const wp = GTA_WEAPONS[gta.wsel];
  g.font = '900 9px Consolas, monospace';
  g.fillStyle = gta.wsel > 0 && gta.ammo[wp.key] === 0 ? '#ff5252' : '#eef2ff';
  g.fillText(wp.icon + ' ' + (gta.wsel === 0 ? wp.name : gta.ammo[wp.key]), 6, Hh - 50);

  // Weapon-switch toast: the whole wheel, selection bracketed.
  if (gta.wtoastT > 0) {
    g.globalAlpha = Math.min(1, gta.wtoastT * 2);
    g.textAlign = 'center';
    g.font = '900 11px Consolas, monospace';
    let row = '';
    for (let i = 0; i < GTA_WEAPONS.length; i++) {
      row += (i === gta.wsel ? '[' + GTA_WEAPONS[i].icon + ']' : ' ' + GTA_WEAPONS[i].icon + ' ');
    }
    g.fillStyle = '#eef2ff';
    g.fillText(row, W / 2, 34);
    g.font = '700 9px Consolas, monospace';
    g.fillStyle = '#ffe23a';
    g.fillText(wp.name + (gta.wsel > 0 ? ' · ' + gta.ammo[wp.key] : ''), W / 2, 46);
    g.globalAlpha = 1;
    g.textAlign = 'left';
  }

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
    // pursuit blips flash on the radar (drawn over the blit, never onto gta.mini)
    for (const o of gta.cars) {
      if (!o.chase || o.wreck) continue;
      const bc = o.x / GTA_TILE, br = o.y / GTA_TILE;
      if (bc < sx || bc > sx + SRC || br < sy || br > sy + SRC) continue;
      g.fillStyle = o.cop ? (Math.floor(gta.t * 7) % 2 === 0 ? '#ff4040' : '#5090ff') : '#ff5252';
      g.fillRect(dx + ((bc - sx) / SRC) * MM - 1, dy + ((br - sy) / SRC) * MM - 1, 2, 2);
    }
    // gold blips: the live marker, or every ringing phone between jobs
    const blip = (bc, br) => {
      if (bc < sx || bc > sx + SRC || br < sy || br > sy + SRC) return;
      g.fillStyle = '#ffd23a';
      g.fillRect(dx + ((bc - sx) / SRC) * MM - 1, dy + ((br - sy) / SRC) * MM - 1, 2, 2);
    };
    const mkR = (gta.mission && gta.mission.mk) || (gta.gig && gta.gig.mk);
    if (mkR) {
      if (Math.floor(gta.t * 5) % 2 === 0) blip(mkR.x / GTA_TILE, mkR.y / GTA_TILE);
    } else if (gta.boothRing && Math.floor(gta.t * 3) % 2 === 0) {
      for (const b of gta.booths) blip(b.c + 0.5, b.r + 0.5);
    }
    g.fillStyle = '#ffffff';
    g.fillRect(dx + ((pc - sx) / SRC) * MM - 1, dy + ((pr - sy) / SRC) * MM - 1, 3, 3);
  }
  // Wanted stars, top-right. They flash while the pursuit is live.
  if (gta.heat > 0) {
    const stars = gtaStars();
    let chasing = false;
    for (const o of gta.cars) if (o.chase && !o.wreck) { chasing = true; break; }
    g.textAlign = 'right';
    g.font = '900 11px Consolas, monospace';
    let sTxt = '';
    for (let i = 0; i < 5; i++) sTxt += i < stars ? '★' : '·';
    g.fillStyle = chasing && Math.floor(gta.t * 4) % 2 === 0 ? '#ff5252'
      : stars > 0 ? '#eef2ff' : 'rgba(158,163,199,0.65)';
    g.fillText(sTxt, W - 6, 15);
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

  // The contract: objective bottom-center, clock above it, warnings flashing.
  if (gta.mission && gta.mission.st) {
    const M = gta.mission, step = M.def.steps[M.si];
    g.textAlign = 'center';
    g.font = '900 9px Consolas, monospace';
    g.fillStyle = '#ffd23a';
    let line = step.text;
    if (step.dur) {
      const held = (step.kind === 'watch' || step.kind === 'heathold') ? M.st.hold : M.st.t;
      line += ' · ' + Math.max(0, Math.ceil(step.dur - held)) + 's';
    }
    g.fillText(line, W / 2, Hh - 8);
    if (M.warn && Math.floor(gta.t * 5) % 2 === 0) {
      g.fillStyle = '#ff5252';
      g.fillText('⚠ ' + M.warn, W / 2, Hh - 20);
    } else if (M.time > 0) {
      g.font = '900 11px Consolas, monospace';
      g.fillStyle = M.time < 12 && Math.floor(gta.t * 4) % 2 === 0 ? '#ff5252' : '#eef2ff';
      g.fillText('⏱ ' + Math.ceil(M.time), W / 2, Hh - 20);
    }
    if (M.mk) gtaEdgeArrow(g, W, Hh, M.mk);
  } else if (gta.gig) {
    // gig line: same slot, different boss
    const G = gta.gig;
    g.textAlign = 'center';
    g.font = '900 9px Consolas, monospace';
    g.fillStyle = '#ffd23a';
    const label = G.type === 'nugex' ? '📦 NUG-EX DROP · ' + G.count + ' DELIVERED'
      : G.type === 'vigil' ? '🚨 STOP THE FELON · ' + G.count + ' COLLARED'
      : '💀 RAMPAGE · ' + G.count + '/' + G.need;
    g.fillText(label, W / 2, Hh - 8);
    g.font = '900 11px Consolas, monospace';
    g.fillStyle = G.time < 10 && Math.floor(gta.t * 4) % 2 === 0 ? '#ff5252' : '#eef2ff';
    g.fillText('⏱ ' + Math.max(0, Math.ceil(G.time)), W / 2, Hh - 20);
    if (G.mk) gtaEdgeArrow(g, W, Hh, G.mk);
  } else if (gta.boothRing) {
    // between jobs: point at the nearest ringing phone
    let bb = null, bd = Infinity;
    for (const b of gta.booths) {
      const bx = (b.c + 0.5) * GTA_TILE, by = (b.r + 0.5) * GTA_TILE;
      const d2 = (bx - gta.cam.x) * (bx - gta.cam.x) + (by - gta.cam.y) * (by - gta.cam.y);
      if (d2 < bd) { bd = d2; bb = { x: bx, y: by }; }
    }
    if (bb && (Math.abs(bb.x - gta.cam.x) > W / 2 - 10 || Math.abs(bb.y - gta.cam.y) > Hh / 2 - 10)) {
      const rx = bb.x - gta.cam.x, ry = bb.y - gta.cam.y;
      const k = Math.min((W / 2 - 16) / Math.max(1, Math.abs(rx)), (Hh / 2 - 16) / Math.max(1, Math.abs(ry)));
      if (Math.floor(gta.t * 3) % 2 === 0) {
        g.textAlign = 'center';
        g.font = '900 9px Consolas, monospace';
        g.fillStyle = '#ffd23a';
        g.fillText('📞', W / 2 + rx * k, Hh / 2 + ry * k + 3);
      }
    }
  }

  // The brief: S.W. talks, you read, the city keeps moving underneath.
  if (gta.briefT > 0 && gta.mission) {
    g.globalAlpha = Math.min(1, gta.briefT / 0.8);
    const bw = Math.min(250, W - 16);
    const lines = gtaWrap(g, gta.mission.def.brief, bw - 16);
    const bh = 24 + lines.length * 10;
    const bx = W / 2 - bw / 2, by = 26;
    g.fillStyle = 'rgba(4,4,12,0.88)';
    g.fillRect(bx, by, bw, bh);
    g.strokeStyle = '#ffd23a';
    g.lineWidth = 1;
    g.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
    g.textAlign = 'center';
    g.font = '900 10px Consolas, monospace';
    g.fillStyle = '#ffd23a';
    g.fillText('📞 ' + gta.mission.def.title, W / 2, by + 13);
    g.font = '700 8px Consolas, monospace';
    g.fillStyle = '#eef2ff';
    for (let i = 0; i < lines.length; i++) g.fillText(lines[i], W / 2, by + 24 + i * 10);
    g.globalAlpha = 1;
  }
}

// A gold arrow pinned to the screen edge, pointing at an offscreen marker.
function gtaEdgeArrow(g, W, Hh, mk) {
  const rx = mk.x - gta.cam.x, ry = mk.y - gta.cam.y;
  if (Math.abs(rx) <= W / 2 - 10 && Math.abs(ry) <= Hh / 2 - 10) return;
  const k = Math.min((W / 2 - 14) / Math.max(1, Math.abs(rx)), (Hh / 2 - 14) / Math.max(1, Math.abs(ry)));
  g.save();
  g.translate(W / 2 + rx * k, Hh / 2 + ry * k);
  g.rotate(Math.atan2(ry, rx));
  g.fillStyle = Math.floor(gta.t * 3) % 2 === 0 ? '#ffd23a' : '#ffe9a0';
  g.beginPath(); g.moveTo(8, 0); g.lineTo(-4, -5); g.lineTo(-4, 5); g.closePath(); g.fill();
  g.restore();
}

// Word-wrap for the brief card (measures in the card's own font).
function gtaWrap(g, text, maxW) {
  g.font = '700 8px Consolas, monospace';
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const next = cur ? cur + ' ' + wd : wd;
    if (g.measureText(next).width > maxW && cur) { lines.push(cur); cur = wd; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
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
  g.fillText('↑↓ drive · ←→ steer · SPACE handbrake/punch', W / 2, Hh * 0.64);
  g.fillText('E in/out of cars · SHIFT sprint · F fire · Q weapons', W / 2, Hh * 0.71);
  g.fillStyle = '#ffd23a';
  g.fillText('📞 answer ringing phones — S.W. has work', W / 2, Hh * 0.78);
  if (Math.floor(gta.t * 2.2) % 2 === 0) {
    g.font = '900 12px Consolas, monospace';
    g.fillStyle = '#ffe23a';
    g.fillText('PRESS SPACE / TAP — BOOST IT', W / 2, Hh * 0.85);
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
  if (code === 'Space') {
    if (gta.onFoot) { gta.fireHeld = true; gta.firePress = true; } // fists punch, the rest fires
    else gta.handbrake = true;
    return true;
  }
  if (code === 'KeyF') { gta.fireHeld = true; gta.firePress = true; return true; }
  if (code === 'KeyQ') { gtaCycleWeapon(); return true; }
  if (code.startsWith('Digit')) {
    const i = +code.slice(5) - 1;
    if (i >= 0 && i < GTA_WEAPONS.length) {
      if (i === 0 || gta.ammo[GTA_WEAPONS[i].key] > 0) gtaSelectWeapon(i);
      return true;
    }
    return false;
  }
  if (code === 'KeyE' || code === 'KeyX') { gtaInteract(); return true; }
  if (code === 'ShiftLeft' || code === 'ShiftRight') { gta.keys.shift = true; return true; }
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
  if (e.code === 'Space') { gta.handbrake = false; gta.fireHeld = false; }
  if (e.code === 'KeyF') gta.fireHeld = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') gta.keys.shift = false;
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
  if (gta.onFoot) {
    // second finger on foot: car door if one's in reach, knuckles otherwise
    if (e.touches.length > 1) gtaFootAction();
  } else {
    gta.handbrake = e.touches.length > 1;
  }
  gtaPointer(e.touches[0].clientX, true);
  e.preventDefault();
}, { passive: false });
gtaWorld.addEventListener('touchmove', (e) => { gtaPointer(e.touches[0].clientX, true); e.preventDefault(); }, { passive: false });
window.addEventListener('touchend', (e) => {
  if (!gta.on) return;
  if (!gta.onFoot) gta.handbrake = e.touches.length > 1;
  if (e.touches.length === 0) gtaPointer(0, false);
});
