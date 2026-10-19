// ---- 🚨 NUGGET ALERT ------------------------------------------------------------------------------------
// "The popular early 2000s RTS game, Red Alert 2 … We want to add the game to the mcnugget arcade."
// "but try to get graphics quality to at least RA2 standards" — Chris, 2026-10-19.
//
// Game 21 (mode key: alert). Hidden: only howmanynuggets.com/?play=alert gets you here — no cabinet,
// no mode button, not in the games list. It is NOT Red Alert 2: EA never released RA2's code and it
// isn't freeware, so everything here is ours — the art, the names, the rules — the way Nugget Blitz is
// ours and not NFL Blitz. (Nobody says "Red Alert" or "Command & Conquer" on screen.)
//
// What's in it (stage 1, a skirmish vs the CPU, mouse + keyboard):
//   • a 64×64 battlefield: grass, worn dirt, trees, rocks, and fields of gold SAUCE ORE that regrow
//   • the economy: a FRY YARD builds the base; GREASE PLANTS make power, the SAUCE REFINERY comes
//     with a SAUCE HAULER that harvests ore and drives it home; low power slows everything and
//     switches the radar and the Tesla Fryers off
//   • the RA2 sidebar: credits, the radar, the power bar, four tabs of cameos with the clock wipe,
//     buildings that wait READY until you place them (adjacent to your base), queued units
//   • BOOT CAMP (Nug Troopers, Rocket Nugs) · TANK FRYER (Breaded Tank, Deep Fryer, the Hauler) ·
//     SAUCE RADAR (the minimap) · NUG GUN and TESLA FRYER defenses · sell, repair
//   • A* pathfinding, group moves in formation, attack, attack-move, guard (auto-acquire), stop,
//     control groups, double-click select-all-of-type
//   • a CPU commander: a build order, its own harvesting, an army that gathers and attacks in waves
//     that grow, and defends its base
//   • nuggets: kills, buildings and the win pay perFlyer × the tier's multiplier, like the others
// The renderer is js/alertGL.js, the models js/alertArt.js, the screen js/alertUI.js.
// Globals are all alr* / ALR_* / alert*. Test seam: window.alertDebug.

const alertWorld = document.getElementById('alertWorld');
const ALR_N = 64;
const ALR_DT = 1 / 30;           // the sim's fixed step

// ---- the rules ------------------------------------------------------------------------------------------
const ALR_BLD = {
  hq:       { name: 'FRY YARD', w: 3, h: 3, hp: 1600, cost: 0, power: 0, sight: 11 },
  power:    { name: 'GREASE PLANT', w: 2, h: 2, hp: 750, cost: 600, power: 100, cat: 'bld', req: [], time: 9, sight: 4, blurb: '+100 power' },
  refinery: { name: 'SAUCE REFINERY', w: 3, h: 3, hp: 1000, cost: 2000, power: -50, cat: 'bld', req: ['power'], time: 14, sight: 5, free: 'harv', blurb: 'comes with a Sauce Hauler' },
  barracks: { name: 'BOOT CAMP', w: 2, h: 2, hp: 650, cost: 500, power: -20, cat: 'bld', req: ['power'], time: 8, sight: 4, makes: 'inf' },
  factory:  { name: 'TANK FRYER', w: 3, h: 3, hp: 1300, cost: 2000, power: -50, cat: 'bld', req: ['refinery'], time: 16, sight: 4, makes: 'veh' },
  radar:    { name: 'SAUCE RADAR', w: 2, h: 2, hp: 750, cost: 1000, power: -60, cat: 'bld', req: ['factory'], time: 12, sight: 9, blurb: 'the minimap' },
  turret:   { name: 'NUG GUN', w: 1, h: 1, hp: 550, cost: 600, power: -10, cat: 'def', req: ['barracks'], time: 7, sight: 7, weapon: 'turret', blurb: 'guns down anything' },
  tesla:    { name: 'TESLA FRYER', w: 1, h: 1, hp: 650, cost: 1500, power: -75, cat: 'def', req: ['radar'], time: 12, sight: 8, weapon: 'tesla', blurb: 'needs power' },
};
const ALR_UNIT = {
  inf:    { name: 'NUG TROOPER', cost: 200, hp: 125, speed: 1.3, cat: 'inf', time: 4, weapon: 'rifle', armor: 'inf', sight: 5, req: ['barracks'], r: 0.13 },
  rocket: { name: 'ROCKET NUG', cost: 400, hp: 125, speed: 1.15, cat: 'inf', time: 6, weapon: 'rocket', armor: 'inf', sight: 6, req: ['barracks'], r: 0.13 },
  tank:   { name: 'BREADED TANK', cost: 700, hp: 420, speed: 2.3, cat: 'veh', time: 9, weapon: 'cannon', armor: 'veh', sight: 6, req: ['factory'], turret: true, turn: 3.2, r: 0.36 },
  heavy:  { name: 'DEEP FRYER', cost: 1100, hp: 700, speed: 1.65, cat: 'veh', time: 13, weapon: 'heavy', armor: 'veh', sight: 6, req: ['factory', 'radar'], turret: true, turn: 2.2, r: 0.42 },
  harv:   { name: 'SAUCE HAULER', cost: 1400, hp: 1000, speed: 1.6, cat: 'veh', time: 14, armor: 'veh', sight: 4, req: ['factory', 'refinery'], harv: true, cap: 700, turn: 2.0, r: 0.4 },
};
const ALR_WPN = {
  rifle:  { dmg: 15, rof: 0.85, range: 4.6, kind: 'bullet', vs: { inf: 1, veh: 0.22, bld: 0.25 }, sfx: 'rifle' },
  rocket: { dmg: 55, rof: 2.3, range: 5.6, kind: 'rocket', speed: 7.5, vs: { inf: 0.3, veh: 1, bld: 0.65 }, sfx: 'rocket' },
  cannon: { dmg: 46, rof: 1.7, range: 5.2, kind: 'shell', speed: 15, vs: { inf: 0.4, veh: 1, bld: 0.8 }, sfx: 'cannon' },
  heavy:  { dmg: 40, rof: 1.9, range: 5.6, kind: 'shell', twin: true, speed: 15, vs: { inf: 0.45, veh: 1, bld: 0.85 }, sfx: 'heavy' },
  turret: { dmg: 40, rof: 1.25, range: 6.2, kind: 'shell', twin: true, speed: 17, vs: { inf: 0.8, veh: 0.8, bld: 0.4 }, sfx: 'cannon' },
  tesla:  { dmg: 120, rof: 2.6, range: 6.8, kind: 'zap', vs: { inf: 1.6, veh: 1, bld: 0.6 }, sfx: 'zap', power: true },
};
const ALR_CATS = [
  { key: 'bld', name: 'BUILD', icon: '🏗️' }, { key: 'def', name: 'DEFENSE', icon: '🛡️' },
  { key: 'inf', name: 'INFANTRY', icon: '🪖' }, { key: 'veh', name: 'VEHICLES', icon: '🚜' },
];
const ALR_TIERS = [
  { key: 'rookie', emoji: '🍟', name: 'ROOKIE', mult: 1, cpu: 0.7, firstWave: 330, wave: [4, 6], bonus: 0,
    blurb: 'the FRY FEDERATION is still finding the fryer.' },
  { key: 'pro', emoji: '🌶️', name: 'COMMANDER', mult: 2, cpu: 1.0, firstWave: 240, wave: [6, 9], bonus: 0,
    blurb: 'a real opponent. they will come for your refinery.' },
  { key: 'allout', emoji: '🔥', name: 'ALL-OUT WAR', mult: 3, cpu: 1.3, firstWave: 170, wave: [8, 13], bonus: 3,
    blurb: 'they build faster, they dig deeper, they never stop.', lockNote: 'win as a COMMANDER' },
];
const ALR_TEAMS = [
  { name: 'NUGGET ALLIANCE', col: [0.25, 0.52, 0.98], css: '#3f86f8' },
  { name: 'FRY FEDERATION', col: [0.92, 0.2, 0.15], css: '#ea3326' },
];

// ---- the state ------------------------------------------------------------------------------------------
const alr = {
  on: false, phase: 'idle', cfg: ALR_TIERS[0], tierPick: null, paused: false, t: 0, acc: 0, auto: false,
  M: null, ents: [], byId: new Map(), nid: 1, players: [], sel: [], groups: {}, fx: [], shots: [], decor: [],
  cam: { x: 16, z: 48, zoom: 13.5, yaw: Math.PI * 0.25, pitch: 0.58, w: 800, h: 600, dpr: 1 },
  earned: 0, result: null, msgs: [], place: null, mode: '', ui: null, stats: null,
};
function alertActive() { return storm.mode === 'alert' && storm.running; }
function alertTally() {
  if (!alr.players.length || alr.phase !== 'play') return '🚨 NUGGET ALERT';
  const P = alr.players[0];
  return '$' + Math.floor(P.credits) + ' · ' + fmt.format(alr.earned) + ' nugs';
}
function alrRnd(a, b) { return a + Math.random() * (b - a); }
function alrPick(a) { return a[(Math.random() * a.length) | 0]; }
function alrClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function alrTile(x, z) { return (Math.floor(z) * ALR_N + Math.floor(x)); }
function alrIn(x, z) { return x >= 0 && z >= 0 && x < ALR_N && z < ALR_N; }

// ---- lifecycle --------------------------------------------------------------------------------------------
function syncAlert() {
  const active = alertActive();
  if (active === alr.on) return;
  alr.on = active;
  document.body.classList.toggle('alert-mode', active);
  if (active) {
    if (!alr.ui) alrUIInit();
    if (!alr.ui.gl) { alrUINoGL(); return; }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    alrLayout();
    alrOpenTier();
  } else {
    if (alr.tierPick) { alr.tierPick.close(); alr.tierPick = null; }
    alr.phase = 'idle'; alr.paused = false;
    alrSfxStop();
    if (alr.ui) alr.ui.root.classList.remove('alr-playing');
  }
}
function alertProWon() { try { return localStorage.getItem('nugAlertPro') === '1'; } catch (e) { return false; } }
function alrOpenTier() {
  alr.phase = 'tier';
  if (alr.ui) alr.ui.root.classList.remove('alr-playing');
  const tiers = ALR_TIERS.map((t) => (t.key === 'allout' && !alertProWon() ? Object.assign({}, t, { locked: true }) : t));
  alr.tierPick = ArcadeKit.tierSelect({
    storeKey: 'alert', title: '🚨 NUGGET ALERT — choose your enemy',
    note: 'skirmish vs the FRY FEDERATION · build · harvest · destroy their base · 1 · 2 · 3',
    tiers, mount: alertWorld,
    onPick: (key, t) => { alr.tierPick = null; alrNewGame(t); },
  });
}

// ---- the map ----------------------------------------------------------------------------------------------
function alrMakeMap(seed) {
  const N = ALR_N;
  let s = seed >>> 0 || 1; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const M = {
    N, seed, block: new Uint8Array(N * N), bld: new Int32Array(N * N), ore: new Float32Array(N * N), oreMax: new Float32Array(N * N),
    dirt: new Float32Array(N * N), trees: [], rocks: [], tracks: [], starts: [[11.5, 52.5], [52.5, 11.5]], oreVer: 0,
  };
  const at = (x, z) => z * N + x;
  const disk = (cx, cz, rad, fn) => {
    for (let z = Math.floor(cz - rad); z <= Math.ceil(cz + rad); z++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d <= rad) fn(x, z, d);
    }
  };
  // the bases: bare earth
  for (const [x, z] of M.starts) disk(x, z, 8.5, (i, j, d) => { M.dirt[at(i, j)] = Math.max(M.dirt[at(i, j)], alrClamp((8.5 - d) / 3, 0, 1)); });
  // the track between them: a bent line through the middle
  const mid = [32 + (r() - 0.5) * 10, 32 + (r() - 0.5) * 10];
  const path = [];
  const seg = (a, b) => { for (let k = 0; k <= 40; k++) { const t = k / 40; path.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } };
  seg(M.starts[0], mid); seg(mid, M.starts[1]);
  M.tracks.push(path);
  const onTrack = new Uint8Array(N * N);
  for (const [px, pz] of path) disk(px, pz, 2.2, (i, j, d) => { onTrack[at(i, j)] = 1; M.dirt[at(i, j)] = Math.max(M.dirt[at(i, j)], alrClamp((2.2 - d) / 1.4, 0, 1) * 0.85); });
  // ore fields: two near each base, two in the middle, mirrored so it's fair
  const fields = [];
  const mir = (p) => [N - p[0], N - p[1]];
  const near = [[22 + r() * 3, 50 + r() * 4], [13 + r() * 4, 40 + r() * 3]];
  const midF = [[mid[0] - 7 + r() * 2, mid[1] + 5 + r() * 2]];
  for (const f of near.concat(midF)) { fields.push(f); fields.push(mir(f)); }
  for (const [fx, fz] of fields) {
    const rad = 2.6 + r() * 1.4;
    disk(fx, fz, rad + 1.2, (i, j, d) => {
      const k = at(i, j);
      M.dirt[k] = Math.max(M.dirt[k], 0.55 * alrClamp((rad + 1.2 - d) / 1.2, 0, 1));
      if (d <= rad && r() < 0.92) { const v = 140 + (1 - d / rad) * 200 + r() * 60; M.ore[k] = Math.max(M.ore[k], v); M.oreMax[k] = M.ore[k]; }
    });
  }
  // trees and rocks: clumps by noise, off the bases, the track and the ore, mirrored too
  const nz = alrNoise(seed + 99);
  const free = (i, j) => {
    const k = at(i, j);
    if (onTrack[k] || M.ore[k] > 0 || M.dirt[k] > 0.15) return false;
    for (const [x, z] of M.starts) if (Math.hypot(i + 0.5 - x, j + 0.5 - z) < 10) return false;
    return true;
  };
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    if (i + j > N - 1) continue;                     // one half; the other half mirrors it
    const v = nz(i * 0.16, j * 0.16);
    const i2 = N - 1 - i, j2 = N - 1 - j;
    if (!free(i, j) || !free(i2, j2)) continue;
    let what = 0;
    if (v > 0.66 && r() < 0.75) what = 1; else if (r() < 0.012) what = 2; else if (r() < 0.01) what = 1;
    if (!what) continue;
    for (const [x, z] of [[i, j], [i2, j2]]) {
      M.block[at(x, z)] = 1;
      const item = { x: x + 0.5 + (r() - 0.5) * 0.3, z: z + 0.5 + (r() - 0.5) * 0.3, v: (r() * 6) | 0, yaw: r() * 6.28, s: 0.85 + r() * 0.35 };
      (what === 1 ? M.trees : M.rocks).push(item);
    }
  }
  // the map's edge
  for (let k = 0; k < N; k++) { M.block[at(k, 0)] = M.block[at(k, N - 1)] = M.block[at(0, k)] = M.block[at(N - 1, k)] = 1; }
  return M;
}

// ---- the game ---------------------------------------------------------------------------------------------
function alrNewGame(tier) {
  alr.cfg = tier;
  alr.ents = []; alr.byId = new Map(); alr.nid = 1; alr.sel = []; alr.groups = {}; alr.fx = []; alr.shots = []; alr.decor = [];
  alr.t = 0; alr.acc = 0; alr.earned = 0; alr.result = null; alr.msgs = []; alr.place = null; alr.mode = '';
  alr.stats = { kills: 0, lost: 0, built: 0, harvested: 0 };
  alr.M = alrMakeMap((Math.random() * 1e9) | 0);
  alr.players = [0, 1].map((i) => ({
    id: i, human: i === 0, team: ALR_TEAMS[i], credits: 5000, make: 0, use: 0, low: false,
    q: { bld: [], def: [], inf: [], veh: [] }, ready: { bld: null, def: null },
    shroud: new Uint8Array(ALR_N * ALR_N), ai: i === 1 ? alrAINew(i) : null, lost: false, underAttack: 0,
  }));
  alrUILoading(true);
  // let the loading card paint before the terrain texture is baked
  setTimeout(() => {
    alrUIBuildWorld();
    for (const P of alr.players) {
      const [sx, sz] = alr.M.starts[P.id];
      alrSpawnBld('hq', P.id, Math.round(sx - 1.5), Math.round(sz - 1.5), true);
      const d = P.id === 0 ? 1 : -1;
      for (let k = 0; k < 3; k++) alrSpawnUnit('inf', P.id, sx + d * (2.6 + k * 0.4), sz - d * (2.4 - k * 0.3));
      alrSpawnUnit('tank', P.id, sx + d * 2.8, sz - d * 0.4);
    }
    alrPower(alr.players[0]); alrPower(alr.players[1]);
    alr.cam.x = alr.M.starts[0][0] + 3; alr.cam.z = alr.M.starts[0][1] - 3;
    alrRevealAll();
    alrUILoading(false);
    alr.phase = 'play';
    alr.ui.root.classList.add('alr-playing');
    alrUISide(true);
    alrSay('BATTLE CONTROL ONLINE', '#9be7ff');
    alrSfx('ready');
  }, 40);
}

// ---- entities ---------------------------------------------------------------------------------------------
function alrSpawnBld(type, owner, tx, tz, instant) {
  const D = ALR_BLD[type];
  const e = { id: alr.nid++, kind: 'bld', type, D, owner, tx, tz, w: D.w, h: D.h, x: tx + D.w / 2, z: tz + D.h / 2,
    hp: D.hp, max: D.hp, build: instant ? 1 : 0, cool: 0, tYaw: owner === 0 ? Math.PI * 0.75 : -Math.PI * 0.25, target: null, flash: 0,
    repair: false, sell: 0, anim: Math.random() * 6, door: 0, charge: 0, lastHit: 0 };
  alr.ents.push(e); alr.byId.set(e.id, e);
  for (let j = 0; j < D.h; j++) for (let i = 0; i < D.w; i++) alr.M.bld[(tz + j) * ALR_N + tx + i] = e.id;
  if (owner === 0) alrReveal(alr.players[0], e.x, e.z, D.sight + 1);
  if (D.free && !instant) {
    // the refinery comes with a hauler, rolling out of the dock
    const [dx, dz] = alrDock(e);
    const h = alrSpawnUnit(D.free, owner, dx, dz - 0.4); h.yaw = Math.PI;
    h.order = { type: 'harvest' };
  }
  return e;
}
function alrSpawnUnit(type, owner, x, z) {
  const D = ALR_UNIT[type];
  const e = { id: alr.nid++, kind: 'unit', type, D, owner, x, z, yaw: owner === 0 ? Math.PI * 0.75 : -Math.PI * 0.25, tYaw: 0,
    hp: D.hp, max: D.hp, path: null, pi: 0, order: null, target: null, cool: Math.random() * 0.5, flash: 0, walk: Math.random() * 6,
    stuck: 0, repathT: 0, acqT: Math.random() * 0.5, cargo: 0, hstate: '', hT: 0, recoil: 0, lastHit: 0, guardX: x, guardZ: z, vx: 0, vz: 0 };
  e.tYaw = e.yaw;
  alr.ents.push(e); alr.byId.set(e.id, e);
  return e;
}
// Buildings are drawn turned 180° (ALR_BLD_YAW) so the side the models were built with in front (+z)
// faces the camera: the doors, the bays and the dock all open on the footprint's -z edge.
const ALR_BLD_YAW = Math.PI;
function alrDock(b) { return [b.x - 0.55, b.tz - 0.45]; }      // in front of the refinery's apron
function alrExit(b) { return b.type === 'factory' ? [b.x, b.tz - 0.45] : [b.x + 0.1, b.tz - 0.4]; }
function alrAlive(e) { return e && e.hp > 0 && alr.byId.has(e.id); }
function alrBldsOf(o, type) { return alr.ents.filter((e) => e.kind === 'bld' && e.owner === o && e.build >= 1 && (!type || e.type === type)); }
function alrHas(o, type) { return alr.ents.some((e) => e.kind === 'bld' && e.owner === o && e.type === type && e.build >= 1 && e.hp > 0); }

// distance from a point to an entity's body (a building's footprint edge)
function alrDistTo(x, z, e) {
  if (e.kind === 'bld') {
    const dx = Math.max(e.tx - x, 0, x - (e.tx + e.w)), dz = Math.max(e.tz - z, 0, z - (e.tz + e.h));
    return Math.hypot(dx, dz);
  }
  return Math.hypot(e.x - x, e.z - z);
}

// ---- power and money --------------------------------------------------------------------------------------
function alrPower(P) {
  let mk = 0, use = 0;
  for (const e of alr.ents) if (e.kind === 'bld' && e.owner === P.id && e.build >= 1 && e.hp > 0) {
    const pw = e.D.power || 0;
    if (pw > 0) mk += pw * (0.5 + 0.5 * e.hp / e.max); else use -= pw;
  }
  P.make = Math.round(mk); P.use = use;
  const was = P.low;
  P.low = use > mk;
  if (P.human && P.low && !was) { alrSay('LOW POWER', '#ffb43a'); alrSfx('alarm'); }
}
function alrEarn(units, why) {
  if (units <= 0 || !alr.cfg) return 0;
  const worth = Math.max(1, Math.round(storm.perFlyer * units * alr.cfg.mult));
  storm.caught += worth; alr.earned += worth;
  if (why) alrFloat('+' + fmt.format(worth) + ' ' + why);
  return worth;
}

// ---- production --------------------------------------------------------------------------------------------
function alrCanBuild(P, type) {
  const D = ALR_BLD[type] || ALR_UNIT[type];
  if (!D || !D.cat) return false;
  if (!alrHas(P.id, 'hq') && (D.cat === 'bld' || D.cat === 'def')) return false;
  if (D.cat === 'inf' && !alrHas(P.id, 'barracks')) return false;
  if (D.cat === 'veh' && !alrHas(P.id, 'factory')) return false;
  return (D.req || []).every((r) => alrHas(P.id, r));
}
function alrQueue(P, type) {
  const D = ALR_BLD[type] || ALR_UNIT[type];
  if (!alrCanBuild(P, type)) return false;
  const q = P.q[D.cat];
  if (D.cat === 'bld' || D.cat === 'def') {
    if (P.ready[D.cat]) return false;
    if (q.length) {
      // clicking the one that's building again: un-hold it
      if (q[0].type === type && q[0].hold) { q[0].hold = false; return true; }
      return false;
    }
  } else if (q.length >= 12) return false;
  q.push({ type, spent: 0, hold: false });
  if (P.human) { alrSfx('click'); if (D.cat === 'bld' || D.cat === 'def') alrSay('BUILDING', '#cfe8ff'); else if (q.length === 1) alrSay('TRAINING', '#cfe8ff'); }
  return true;
}
// right-click a cameo: hold the one in progress, a second time cancels it (money back)
function alrUnqueue(P, type) {
  const D = ALR_BLD[type] || ALR_UNIT[type], cat = D.cat, q = P.q[cat];
  if ((cat === 'bld' || cat === 'def') && P.ready[cat] === type) { P.ready[cat] = null; P.credits += D.cost; if (alr.place && alr.place.type === type) alr.place = null; alrSfx('click'); return; }
  let i = -1; for (let k = q.length - 1; k >= 0; k--) if (q[k].type === type) { i = k; break; }
  if (i < 0) return;
  const it = q[i];
  if (i === 0 && !it.hold && it.spent > 0) { it.hold = true; if (P.human) alrSay('ON HOLD', '#ffd27a'); alrSfx('click'); return; }
  P.credits += it.spent; q.splice(i, 1);
  if (P.human) { alrSay('CANCELED', '#ffd27a'); alrSfx('click'); }
}
function alrProduce(P, dt) {
  for (const cat of ['bld', 'def', 'inf', 'veh']) {
    const q = P.q[cat];
    if (!q.length) continue;
    const it = q[0];
    if (it.hold) continue;
    const D = ALR_BLD[it.type] || ALR_UNIT[it.type];
    if (!alrCanBuild(P, it.type)) continue;
    // more factories, faster; low power, half speed; the CPU's tier sets its pace
    const nf = cat === 'inf' ? alrBldsOf(P.id, 'barracks').length : cat === 'veh' ? alrBldsOf(P.id, 'factory').length : 1;
    let rate = D.cost / D.time * (1 + 0.4 * Math.max(0, nf - 1)) * (P.low ? 0.5 : 1);
    if (!P.human || alr.auto) rate *= P.id === 1 ? alr.cfg.cpu : 1;
    let pay = Math.min(rate * dt, D.cost - it.spent, P.credits);
    if (pay <= 0 && it.spent < D.cost) { if (P.human && !P.broke) { P.broke = true; alrSay('INSUFFICIENT FUNDS', '#ff8a7a'); alrSfx('error'); } continue; }
    P.broke = false;
    it.spent += pay; P.credits -= pay;
    if (it.spent >= D.cost - 0.01) {
      q.shift();
      if (cat === 'bld' || cat === 'def') {
        P.ready[cat] = it.type;
        if (P.human) { alrSay('CONSTRUCTION COMPLETE', '#9bff9b'); alrSfx('ready'); }
      } else alrDeliver(P, it.type);
    }
  }
}
// a unit comes out of its door and drives to the rally point
function alrDeliver(P, type) {
  const D = ALR_UNIT[type];
  const from = alrBldsOf(P.id, D.cat === 'inf' ? 'barracks' : 'factory');
  if (!from.length) return;
  const b = from[alr.t % from.length | 0];
  const [x, z] = alrExit(b);
  const u = alrSpawnUnit(type, P.id, x, z);
  u.yaw = u.tYaw = Math.PI;
  if (b.type === 'factory') b.door = 1.6;
  if (D.harv) u.order = { type: 'harvest' };
  else {
    const rx = b.rally ? b.rally[0] : x + (P.id === 0 ? 1.5 : -1.5) + alrRnd(-1, 1), rz = b.rally ? b.rally[1] : z - 1.6 + alrRnd(-0.6, 0.6);
    alrOrderMove(u, rx, rz, false);
  }
  if (P.human) { alrSay('UNIT READY', '#9bff9b'); alrSfx('ready'); }
}
// placement: on the map, on free ground, near your own base (2 tiles from any of your buildings)
function alrCanPlace(P, type, tx, tz) {
  const D = ALR_BLD[type], M = alr.M;
  if (tx < 1 || tz < 1 || tx + D.w > ALR_N - 1 || tz + D.h > ALR_N - 1) return false;
  for (let j = 0; j < D.h; j++) for (let i = 0; i < D.w; i++) {
    const k = (tz + j) * ALR_N + tx + i;
    if (M.block[k] || M.bld[k] || M.ore[k] > 0) return false;
    if (P.human && !P.shroud[k]) return false;
  }
  // nobody standing there
  for (const e of alr.ents) if (e.kind === 'unit' && e.x > tx - 0.2 && e.x < tx + D.w + 0.2 && e.z > tz - 0.2 && e.z < tz + D.h + 0.2) return false;
  let near = false;
  for (const e of alr.ents) if (e.kind === 'bld' && e.owner === P.id && e.hp > 0) {
    const gx = Math.max(e.tx - (tx + D.w), tx - (e.tx + e.w), 0), gz = Math.max(e.tz - (tz + D.h), tz - (e.tz + e.h), 0);
    if (Math.max(gx, gz) <= 2) { near = true; break; }
  }
  return near;
}
function alrPlace(P, type, tx, tz) {
  const cat = ALR_BLD[type].cat;
  if (P.ready[cat] !== type || !alrCanPlace(P, type, tx, tz)) return false;
  P.ready[cat] = null;
  const b = alrSpawnBld(type, P.id, tx, tz, false);
  alrRepathAround(b);
  if (P.human) { alrSfx('place'); alr.stats.built++; }
  return true;
}
// anybody whose path crosses the new footprint finds a new one
function alrRepathAround(b) { for (const e of alr.ents) if (e.kind === 'unit' && e.path) e.repathT = 0; }
function alrSell(e) {
  if (e.kind !== 'bld' || e.sell || e.type === 'hq' && alrBldsOf(e.owner).length > 1 && false) return;
  e.sell = 1;
  alr.players[e.owner].credits += Math.round((e.D.cost || 1500) * 0.5 * e.hp / e.max);
  if (e.owner === 0) { alrSfx('sell'); alrSay('BUILDING SOLD', '#ffe08a'); }
}

// ---- pathfinding: A* on the tile grid, 8 directions, no cutting corners ------------------------------------
function alrPassable(k, self) {
  const M = alr.M;
  if (M.block[k]) return false;
  const b = M.bld[k];
  if (b && (!self || !self.dockFor || self.dockFor !== b)) return false;
  return true;
}
function alrPath(sx, sz, gx, gz, self) {
  const N = ALR_N, M = alr.M;
  let s = alrTile(sx, sz), g = alrTile(alrClamp(gx, 0, N - 1), alrClamp(gz, 0, N - 1));
  if (!alrPassable(g, self)) g = alrNearestFree(g, self);
  if (g < 0) return null;
  if (s === g) return [[gx, gz]];
  const G = alr._pg || (alr._pg = new Float32Array(N * N)), F = alr._pf || (alr._pf = new Float32Array(N * N));
  const from = alr._pp || (alr._pp = new Int32Array(N * N)), mark = alr._pm || (alr._pm = new Uint32Array(N * N));
  alr._pgen = (alr._pgen || 0) + 1;
  const gen = alr._pgen;
  const gxi = g % N, gzi = (g / N) | 0;
  const h = (k) => { const dx = Math.abs(k % N - gxi), dz = Math.abs(((k / N) | 0) - gzi); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const heap = [];
  const push = (k) => { heap.push(k); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (F[heap[p]] <= F[k]) break; heap[i] = heap[p]; i = p; } heap[i] = k; };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { let i = 0; const n = heap.length; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && F[heap[c + 1]] < F[heap[c]]) c++; if (F[heap[c]] >= F[last]) break; heap[i] = heap[c]; i = c; } heap[i] = last; }
    return top;
  };
  mark[s] = gen; G[s] = 0; F[s] = h(s); from[s] = -1; push(s);
  const closed = alr._pc || (alr._pc = new Uint32Array(N * N));
  let best = s, bestH = h(s), n = 0;
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length && n++ < 5000) {
    const k = pop();
    if (closed[k] === gen) continue;
    closed[k] = gen;
    if (k === g) { best = k; break; }
    const kx = k % N, kz = (k / N) | 0;
    const hk = h(k); if (hk < bestH) { bestH = hk; best = k; }
    for (const [dx, dz, c] of DIRS) {
      const nx = kx + dx, nzz = kz + dz;
      if (nx < 0 || nzz < 0 || nx >= N || nzz >= N) continue;
      const nk = nzz * N + nx;
      if (!alrPassable(nk, self)) continue;
      if (dx && dz && (!alrPassable(kz * N + nx, self) || !alrPassable(nzz * N + kx, self))) continue;
      const ng = G[k] + c;
      if (mark[nk] === gen && ng >= G[nk]) continue;
      mark[nk] = gen; G[nk] = ng; F[nk] = ng + h(nk) * 1.001; from[nk] = k; push(nk);
    }
  }
  // walk back, then drop the waypoints that are on a straight line
  const out = [];
  for (let k = best; k !== -1 && k !== s; k = from[k]) out.push([k % N + 0.5, ((k / N) | 0) + 0.5]);
  out.reverse();
  if (best === g && out.length) out[out.length - 1] = [alrClamp(gx, 0.5, N - 0.5), alrClamp(gz, 0.5, N - 0.5)];
  const smooth = [];
  for (let i = 0; i < out.length; i++) {
    if (i > 0 && i < out.length - 1) {
      const a = out[i - 1], b = out[i], c = out[i + 1];
      if (Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) < 0.01) continue;
    }
    smooth.push(out[i]);
  }
  return smooth.length ? smooth : null;
}
function alrNearestFree(k, self) {
  const N = ALR_N, x0 = k % N, z0 = (k / N) | 0;
  for (let r = 1; r < 12; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const x = x0 + dx, z = z0 + dz;
    if (x < 0 || z < 0 || x >= N || z >= N) continue;
    const kk = z * N + x;
    if (alrPassable(kk, self)) return kk;
  }
  return -1;
}

// ---- orders --------------------------------------------------------------------------------------------------
function alrOrderMove(u, x, z, attackMove) {
  u.order = { type: 'move', x, z, am: !!attackMove };
  u.target = null; u.path = alrPath(u.x, u.z, x, z, u); u.pi = 0; u.stuck = 0;
  if (u.D.harv) { u.hstate = ''; }
}
function alrOrderAttack(u, t) {
  if (!u.D.weapon) { alrOrderMove(u, t.x, t.z, false); return; }
  u.order = { type: 'attack', t: t.id }; u.target = t; u.path = null; u.repathT = 0;
}
// a group move: the units keep their spacing around the click (a little formation)
function alrGroupMove(units, x, z, am) {
  if (!units.length) return;
  let cx = 0, cz = 0; for (const u of units) { cx += u.x; cz += u.z; } cx /= units.length; cz /= units.length;
  const spread = Math.hypot(...units.map((u) => 0)) || 0; void spread;
  const n = units.length, cols = Math.ceil(Math.sqrt(n));
  // face the formation along the move
  const ang = Math.atan2(x - cx, z - cz), ca = Math.cos(ang), sa = Math.sin(ang);
  const sorted = units.slice().sort((a, b) => (a.D.cat === 'veh') - (b.D.cat === 'veh'));
  sorted.forEach((u, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const gap = u.D.cat === 'veh' ? 1.0 : 0.6;
    const lx = (col - (cols - 1) / 2) * gap, lz = -row * gap;
    alrOrderMove(u, x + lx * ca + lz * sa, z - lx * sa + lz * ca, am);
  });
}

// ---- the sim -------------------------------------------------------------------------------------------------
function alrSim(dt) {
  alr.t += dt;
  for (const P of alr.players) {
    if (P.lost) continue;
    alrProduce(P, dt);
    if (P.ai) alrAIStep(P, dt);
    else if (alr.auto && P.id === 0) { P.ai = P.ai || alrAINew(0); alrAIStep(P, dt); }
    if (P.underAttack > 0) P.underAttack -= dt;
  }
  if (((alr.t * 4) | 0) !== (((alr.t - dt) * 4) | 0)) { alrPower(alr.players[0]); alrPower(alr.players[1]); alrRevealAll(); }
  for (const e of alr.ents.slice()) {
    if (!alr.byId.has(e.id)) continue;
    if (e.kind === 'unit') alrUnitStep(e, dt); else alrBldStep(e, dt);
  }
  alrSeparate(dt);
  alrShotsStep(dt);
  alrOreGrow(dt);
  alrCheckEnd();
}

function alrUnitStep(u, dt) {
  if (u.flash > 0) u.flash -= dt;
  if (u.cool > 0) u.cool -= dt;
  if (u.recoil > 0) u.recoil -= dt * 4;
  const D = u.D, o = u.order;
  // targets: keep the one we're told to kill; otherwise look around (guard)
  if (o && o.type === 'attack') {
    const t = alr.byId.get(o.t);
    if (!alrAlive(t)) { u.order = null; u.target = null; }
    else u.target = t;
  } else if (D.weapon && (!o || o.am || o.type === 'guard' || (u.D.turret && o.type === 'move'))) {
    if ((u.acqT -= dt) <= 0) {
      u.acqT = 0.35 + Math.random() * 0.2;
      if (!alrAlive(u.target) || alrDistTo(u.x, u.z, u.target) > ALR_WPN[D.weapon].range + 0.6) u.target = alrAcquire(u, ALR_WPN[D.weapon].range + (o ? 0.3 : 1.5));
    }
  } else if (!o || o.type !== 'attack') { if (!D.weapon) u.target = null; }
  if (u.target && !alrAlive(u.target)) u.target = null;
  // harvesting has its own little brain
  if (D.harv) { alrHarvStep(u, dt); return; }
  const W = D.weapon && ALR_WPN[D.weapon];
  const t = u.target;
  let moving = false;
  if (t && W) {
    const d = alrDistTo(u.x, u.z, t);
    const chase = (o && o.type === 'attack') || (!o && Math.hypot(u.x - u.guardX, u.z - u.guardZ) < 6) || (o && o.am);
    if (d <= W.range) {
      // in range: an attack-move pauses to shoot; a plain move keeps rolling (a turret shoots on the move)
      if (!(o && o.type === 'move' && !o.am)) { u.path = null; }
      alrAim(u, t, dt, W);
    } else if (chase && !(o && o.type === 'move' && !o.am)) {
      if ((u.repathT -= dt) <= 0) { u.repathT = 0.8 + Math.random() * 0.4; u.path = alrPath(u.x, u.z, t.x, t.z, u); u.pi = 0; }
      moving = alrFollow(u, dt);
      if (D.turret) alrTurretTo(u, Math.atan2(t.x - u.x, t.z - u.z), dt);
    } else if (!o) { u.target = null; }
    if (o && o.type === 'move' && u.D.turret && d <= W.range) alrAim(u, t, dt, W, true);
  }
  if (o && o.type === 'move' && !(t && o.am && alrDistTo(u.x, u.z, t) <= (W ? W.range : 0))) {
    if (!u.path || (u.repathT -= dt) <= 0 && u.stuck > 0.8) { u.path = alrPath(u.x, u.z, o.x, o.z, u); u.pi = 0; u.repathT = 1; u.stuck = 0; }
    moving = alrFollow(u, dt);
    if (!u.path || Math.hypot(u.x - o.x, u.z - o.z) < (D.cat === 'inf' ? 0.25 : 0.4)) { u.order = null; u.path = null; u.guardX = u.x; u.guardZ = u.z; }
  }
  if (!o && !t && Math.hypot(u.x - u.guardX, u.z - u.guardZ) > 0.6) {
    // wandered off chasing something: go back to where you were left
    if (!u.path) { u.path = alrPath(u.x, u.z, u.guardX, u.guardZ, u); u.pi = 0; }
    moving = alrFollow(u, dt);
    if (!u.path) u.guardX = u.x, u.guardZ = u.z;
  }
  if (D.turret && !t && !moving) alrTurretTo(u, u.yaw, dt);
  if (D.turret && !t && moving) alrTurretTo(u, u.yaw, dt);
  u.moving = moving;
  if (moving) u.walk += dt * D.speed * 7;
}
// follow the path; vehicles turn before they drive, infantry pivot on the spot
function alrFollow(u, dt) {
  if (!u.path || u.pi >= u.path.length) { u.path = null; u.vx = u.vz = 0; return false; }
  const [wx, wz] = u.path[u.pi];
  const dx = wx - u.x, dz = wz - u.z, d = Math.hypot(dx, dz);
  const last = u.pi === u.path.length - 1;
  if (d < (last ? 0.08 : 0.32)) { u.pi++; if (u.pi >= u.path.length) { u.path = null; u.vx = u.vz = 0; return false; } return true; }
  const want = Math.atan2(dx, dz);
  let da = want - u.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
  const turn = u.D.turn || 9;
  u.yaw += alrClamp(da, -turn * dt, turn * dt);
  const align = u.D.cat === 'inf' ? 1 : Math.max(0, Math.cos(da));
  let sp = u.D.speed * align * (u.D.cat === 'veh' && Math.abs(da) > 0.9 ? 0.15 : 1);
  if (last) sp = Math.min(sp, d * 4);
  const nx = u.x + Math.sin(u.yaw) * sp * dt, nz = u.z + Math.cos(u.yaw) * sp * dt;
  const k = alrTile(nx, nz);
  if (alrIn(nx, nz) && alrPassable(k, u)) { u.vx = (nx - u.x) / dt; u.vz = (nz - u.z) / dt; u.x = nx; u.z = nz; u.stuck = Math.max(0, u.stuck - dt); }
  else { u.stuck += dt * 2; u.vx = u.vz = 0; if (u.stuck > 1) { u.path = alrPath(u.x, u.z, u.path[u.path.length - 1][0], u.path[u.path.length - 1][1], u); u.pi = 0; u.stuck = 0; } }
  return true;
}
function alrTurretTo(u, ang, dt) {
  let da = ang - u.tYaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
  u.tYaw += alrClamp(da, -4.5 * dt, 4.5 * dt);
  return Math.abs(da) < 0.12;
}
function alrAim(u, t, dt, W, keepMoving) {
  const ang = Math.atan2(t.x - u.x, t.z - u.z);
  let ok;
  if (u.D.turret) ok = alrTurretTo(u, ang, dt);
  else {
    let da = ang - u.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    if (!keepMoving) u.yaw += alrClamp(da, -9 * dt, 9 * dt);
    ok = Math.abs(da) < 0.25;
    u.vx = u.vz = 0;
  }
  if (ok && u.cool <= 0) { u.cool = W.rof * alrRnd(0.92, 1.08); alrFire(u, t, W); }
}
function alrAcquire(u, range) {
  let best = null, bd = 1e9;
  for (const e of alr.ents) {
    if (e.owner === u.owner || e.hp <= 0 || e.sell) continue;
    if (u.owner === 0 && !alr.players[0].shroud[alrTile(e.x, e.z)]) continue;
    const d = alrDistTo(u.x, u.z, e);
    if (d > range) continue;
    // shoot what shoots back first, buildings last
    const pr = d + (e.kind === 'bld' ? (e.D.weapon ? 1 : 6) : 0) + (e.D.harv ? 2 : 0);
    if (pr < bd) { bd = pr; best = e; }
  }
  return best;
}

// soft separation: units don't stack (infantry can share a tile, vehicles can't)
function alrSeparate(dt) {
  const U = alr.ents.filter((e) => e.kind === 'unit');
  for (let i = 0; i < U.length; i++) for (let j = i + 1; j < U.length; j++) {
    const a = U[i], b = U[j], dx = b.x - a.x, dz = b.z - a.z, rr = a.D.r + b.D.r;
    if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
    const d = Math.hypot(dx, dz) || 0.01;
    if (d >= rr) continue;
    const push = (rr - d) * 0.5 * Math.min(1, dt * 8), nx = dx / d * push, nz = dz / d * push;
    const ma = a.moving ? 1 : 0.5, mb = b.moving ? 1 : 0.5;
    const ka = alrTile(a.x - nx * ma, a.z - nz * ma), kb = alrTile(b.x + nx * mb, b.z + nz * mb);
    if (alrPassable(ka, a)) { a.x -= nx * ma; a.z -= nz * ma; }
    if (alrPassable(kb, b)) { b.x += nx * mb; b.z += nz * mb; }
  }
}

// ---- the hauler: find ore, scoop it, bring it home, unload ----------------------------------------------------
function alrHarvStep(u, dt) {
  const M = alr.M, D = u.D, o = u.order;
  u.drum = (u.drum || 0) + dt * (u.hstate === 'dig' ? 9 : 0);
  if (o && o.type === 'move') {
    alrFollow(u, dt);
    if (!u.path) { u.order = null; }
    u.moving = !!u.path;
    return;
  }
  if (!o) u.order = { type: 'harvest' };
  const home = () => {
    let best = null, bd = 1e9;
    for (const b of alrBldsOf(u.owner, 'refinery')) { const [dx, dz] = alrDock(b); const d = Math.hypot(dx - u.x, dz - u.z); if (d < bd) { bd = d; best = b; } }
    return best;
  };
  if (u.cargo >= D.cap - 1 && u.hstate !== 'home' && u.hstate !== 'unload') { u.hstate = 'home'; u.path = null; }
  if (!u.hstate) u.hstate = 'seek';
  if (u.hstate === 'seek') {
    if (!u.path) {
      const k = alrFindOre(u.x, u.z, u.oreAt);
      if (k < 0) { if (u.cargo > 0) { u.hstate = 'home'; return; } u.moving = false; return; }
      u.oreTile = k; u.path = alrPath(u.x, u.z, k % ALR_N + 0.5, ((k / ALR_N) | 0) + 0.5, u); u.pi = 0;
      if (!u.path) { u.oreAt = null; u.moving = false; return; }
    }
    u.moving = alrFollow(u, dt);
    if (!u.path) { u.hstate = 'dig'; u.hT = 0; }
  } else if (u.hstate === 'dig') {
    u.moving = false;
    const k = alrTile(u.x, u.z);
    if (M.ore[k] <= 0) { const n = alrFindOre(u.x, u.z, null, 2.5); if (n < 0) { u.hstate = u.cargo > 0 ? 'home' : 'seek'; u.oreAt = null; return; } u.path = alrPath(u.x, u.z, n % ALR_N + 0.5, ((n / ALR_N) | 0) + 0.5, u); u.pi = 0; u.hstate = 'seek'; return; }
    const take = Math.min(M.ore[k], 110 * dt, D.cap - u.cargo);
    M.ore[k] -= take; u.cargo += take; M.oreVer++;
    u.oreAt = [u.x, u.z];
    if ((u.hT += dt) > 0.25) { u.hT = 0; alrFxDust(u.x + Math.sin(u.yaw) * 0.45, u.z + Math.cos(u.yaw) * 0.45, true); }
    if (u.cargo >= D.cap - 1) { u.hstate = 'home'; u.path = null; }
  } else if (u.hstate === 'home') {
    const b = home();
    if (!b) { u.moving = false; return; }
    const [dx, dz] = alrDock(b);
    if (!u.path) { u.path = alrPath(u.x, u.z, dx, dz, u); u.pi = 0; }
    u.moving = alrFollow(u, dt);
    if (Math.hypot(u.x - dx, u.z - dz) < 0.35) { u.hstate = 'unload'; u.hT = 0; u.path = null; u.dockB = b.id; }
    else if (!u.path) u.path = alrPath(u.x, u.z, dx, dz, u);
  } else if (u.hstate === 'unload') {
    u.moving = false;
    // back it in square to the bay
    let da = Math.PI - u.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    u.yaw += alrClamp(da, -2 * dt, 2 * dt);
    const pay = Math.min(u.cargo, 420 * dt);
    u.cargo -= pay;
    const P = alr.players[u.owner];
    P.credits += pay;
    if (P.human) { alr.stats.harvested += pay; P.cashFx = (P.cashFx || 0) + pay; }
    if (u.cargo <= 0.5) { u.cargo = 0; u.hstate = 'seek'; u.path = null; if (P.human && P.cashFx > 0) { alrFloatAt(u.x, u.z, '+$' + Math.round(P.cashFx), '#ffd23a'); P.cashFx = 0; alrSfx('cash'); } }
  }
}
function alrFindOre(x, z, near, maxR) {
  const M = alr.M, N = ALR_N;
  let best = -1, bd = 1e9;
  const cx = near ? near[0] : x, cz = near ? near[1] : z;
  for (let k = 0; k < N * N; k++) {
    if (M.ore[k] <= 20) continue;
    const d = Math.hypot(k % N + 0.5 - cx, ((k / N) | 0) + 0.5 - cz);
    if (maxR && d > maxR) continue;
    // take the near ones, and not the tile another hauler is sitting on
    let pen = 0;
    for (const e of alr.ents) if (e.D.harv && e.oreTile === k && Math.hypot(e.x - x, e.z - z) > 0.1) pen += 3;
    if (d + pen < bd) { bd = d + pen; best = k; }
  }
  return best;
}
// ore grows back slowly, toward what the field started with
function alrOreGrow(dt) {
  const M = alr.M;
  if (((alr.t * 0.5) | 0) === (((alr.t - dt) * 0.5) | 0)) return;
  for (let k = 0; k < M.ore.length; k++) if (M.oreMax[k] > 0 && M.ore[k] < M.oreMax[k]) { M.ore[k] = Math.min(M.oreMax[k], M.ore[k] + 6); }
  M.oreVer++;
}

// ---- buildings ------------------------------------------------------------------------------------------------
function alrBldStep(b, dt) {
  const P = alr.players[b.owner];
  if (b.flash > 0) b.flash -= dt;
  b.anim += dt;
  if (b.build < 1) { b.build = Math.min(1, b.build + dt / 1.6); if (b.build >= 1) { alrPower(P); if (b.D.free && b.owner === 0) {} } return; }
  if (b.sell) {
    b.sell += dt / 1.0;
    if (b.sell >= 2) { alrRemove(b, true); alrPower(P); }
    return;
  }
  if (b.door > 0) b.door -= dt;
  if (b.repair && b.hp < b.max) {
    const cost = (b.D.cost || 1500) / b.max * 0.25 * 40 * dt;
    if (P.credits >= cost) { P.credits -= cost; b.hp = Math.min(b.max, b.hp + 40 * dt); if (Math.random() < dt * 6) alrFxSpark(b.x + alrRnd(-0.5, 0.5), 0.6, b.z + alrRnd(-0.5, 0.5)); }
    if (b.hp >= b.max) b.repair = false;
  }
  const W = b.D.weapon && ALR_WPN[b.D.weapon];
  if (!W) return;
  if (b.cool > 0) b.cool -= dt;
  if (W.power && P.low) { b.target = null; return; }
  if (!alrAlive(b.target) || alrDistTo(b.x, b.z, b.target) > W.range) {
    if ((b.acq = (b.acq || 0) - dt) <= 0) { b.acq = 0.3; b.target = alrAcquire({ x: b.x, z: b.z, owner: b.owner }, W.range); }
  }
  const t = b.target;
  if (!t) { if (b.type === 'tesla') b.charge = Math.max(0, b.charge - dt); return; }
  const ang = Math.atan2(t.x - b.x, t.z - b.z);
  let ok = true;
  if (b.type === 'turret') { let da = ang - b.tYaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; b.tYaw += alrClamp(da, -3.5 * dt, 3.5 * dt); ok = Math.abs(da) < 0.1; }
  if (b.type === 'tesla') { b.charge = Math.min(1, b.charge + dt * 1.4); ok = b.charge >= 1; }
  if (ok && b.cool <= 0) { b.cool = W.rof; if (b.type === 'tesla') b.charge = 0.2; alrFire(b, t, W); }
}

// ---- weapons ---------------------------------------------------------------------------------------------------
// where the shot leaves from (a muzzle, the coil's top)
function alrMuzzle(e, side) {
  if (e.kind === 'bld') {
    if (e.type === 'tesla') return [e.x, 1.35, e.z];   // (a symmetric model: the 180° turn doesn't move it)
    const s = side || 0, c = Math.cos(e.tYaw), sn = Math.sin(e.tYaw);
    return [e.x + sn * 0.6 + c * 0.05 * s, 0.48, e.z + c * 0.6 - sn * 0.05 * s];
  }
  if (e.D.turret) { const L = e.type === 'heavy' ? 0.62 : 0.55, s = side || 0, c = Math.cos(e.tYaw), sn = Math.sin(e.tYaw); return [e.x + sn * L + c * 0.055 * s, e.type === 'heavy' ? 0.47 : 0.4, e.z + c * L - sn * 0.055 * s]; }
  const c = Math.cos(e.yaw), sn = Math.sin(e.yaw);
  return e.type === 'rocket' ? [e.x + sn * 0.25 + c * 0.07, 0.36, e.z + c * 0.25 - sn * 0.07] : [e.x + sn * 0.27, 0.25, e.z + c * 0.27];
}
function alrAimPoint(t) { return t.kind === 'bld' ? [alrClamp(t.x, t.tx + 0.3, t.tx + t.w - 0.3), 0.5, alrClamp(t.z, t.tz + 0.3, t.tz + t.h - 0.3)] : [t.x, t.D.cat === 'inf' ? 0.22 : 0.3, t.z]; }
function alrFire(e, t, W) {
  const shots = W.twin ? [-1, 1] : [0];
  shots.forEach((s, i) => {
    const m = alrMuzzle(e, s), a = alrAimPoint(t);
    a[0] += alrRnd(-0.12, 0.12); a[2] += alrRnd(-0.12, 0.12);
    const go = () => {
      if (!alr.byId.has(e.id)) return;
      if (W.kind === 'bullet') { alrHit(t, W, e); alrFxTracer(m, a); alrFxMuzzle(m, 0.18); }
      else if (W.kind === 'zap') { alrHit(t, W, e); alrFxZap(m, a); }
      else {
        const L = Math.hypot(a[0] - m[0], a[2] - m[2]);
        alr.shots.push({ kind: W.kind, x: m[0], y: m[1], z: m[2], a: m.slice(), b: a, t: 0, T: L / W.speed, tid: t.id, W, from: e.id, owner: e.owner });
        alrFxMuzzle(m, W.kind === 'rocket' ? 0.25 : 0.4);
      }
      alrSfx(W.sfx, e.x, e.z);
    };
    if (i === 0) go(); else alr.later = (alr.later || []).concat([{ t: alr.t + 0.12, fn: go }]);
  });
  if (e.kind === 'unit') e.recoil = 1;
  if (e.kind === 'bld') e.recoil = 1;
}
function alrShotsStep(dt) {
  if (alr.later) { const now = alr.t, due = alr.later.filter((l) => l.t <= now); alr.later = alr.later.filter((l) => l.t > now); for (const l of due) l.fn(); }
  for (const s of alr.shots) {
    s.t += dt;
    const u = Math.min(1, s.t / s.T);
    const arc = s.kind === 'rocket' ? Math.sin(u * Math.PI) * 0.35 : Math.sin(u * Math.PI) * 0.12;
    s.x = s.a[0] + (s.b[0] - s.a[0]) * u; s.z = s.a[2] + (s.b[2] - s.a[2]) * u; s.y = s.a[1] + (s.b[1] - s.a[1]) * u + arc;
    if (s.kind === 'rocket' && Math.random() < dt * 40) alrFxSmoke(s.x, s.y, s.z, 0.18, 0.9);
    if (u >= 1) {
      s.done = true;
      const t = alr.byId.get(s.tid);
      if (alrAlive(t) && alrDistTo(s.x, s.z, t) < 0.8) alrHit(t, s.W, alr.byId.get(s.from) || { owner: s.owner, id: s.from });
      alrFxBlast(s.x, s.y, s.z, s.kind === 'rocket' ? 0.55 : 0.45);
    }
  }
  alr.shots = alr.shots.filter((s) => !s.done);
}
function alrHit(t, W, from) {
  if (!alrAlive(t)) return;
  const armor = t.kind === 'bld' ? 'bld' : t.D.armor;
  t.hp -= W.dmg * (W.vs[armor] == null ? 1 : W.vs[armor]);
  t.flash = 0.08; t.lastHit = alr.t;
  const P = alr.players[t.owner];
  if (P.underAttack <= 0 && t.owner === 0) { alrSay(t.kind === 'bld' ? 'OUR BASE IS UNDER ATTACK' : 'UNIT UNDER ATTACK', '#ff6a5a'); alrSfx('alarm'); alr.lastAlarm = [t.x, t.z]; }
  P.underAttack = 8; P.attackedAt = [t.x, t.z]; P.attacker = from && from.id;
  // hit back: an idle unit that's shot at goes for the shooter
  if (t.kind === 'unit' && t.D.weapon && !t.order && from && from.id && alrAlive(alr.byId.get(from.id))) t.target = alr.byId.get(from.id);
  if (t.hp <= 0) alrKill(t, from);
}
function alrKill(t, from) {
  const killer = from ? from.owner : -1;
  if (t.kind === 'unit') {
    if (t.D.cat === 'inf') alrFxCrumbs(t.x, t.z); else { alrFxBoom(t.x, 0.3, t.z, 1); alr.decor.push({ kind: 'wreck', type: t.type, D: t.D, cargo: 0, x: t.x, z: t.z, yaw: t.yaw, tYaw: t.tYaw, t: 0, T: 9, owner: t.owner }); }
    alrSfx(t.D.cat === 'inf' ? 'squish' : 'boomL', t.x, t.z);
    if (killer === 0 && t.owner === 1) { alr.stats.kills++; alrEarn(t.D.cat === 'inf' ? 2 : 5, ''); }
    if (t.owner === 0) alr.stats.lost++;
  } else {
    alrFxBoom(t.x, 0.4, t.z, 1.6 + t.w * 0.25);
    alr.decor.push({ kind: 'chain', x: t.x, z: t.z, w: t.w, h: t.h, t: 0, T: 1.4 });
    alr.decor.push({ kind: 'rubble', x: t.x, z: t.z, w: t.w, h: t.h, t: 0, T: 1e9 });
    alrSfx('boomL', t.x, t.z);
    if (killer === 0 && t.owner === 1) alrEarn(12, t.D.name + ' DESTROYED');
    if (t.owner === 0) alrSay('BUILDING LOST', '#ff6a5a');
  }
  alrRemove(t, false);
  alrPower(alr.players[t.owner]);
}
function alrRemove(e, sold) {
  alr.byId.delete(e.id);
  const i = alr.ents.indexOf(e); if (i >= 0) alr.ents.splice(i, 1);
  if (e.kind === 'bld') {
    for (let j = 0; j < e.h; j++) for (let k = 0; k < e.w; k++) { const q = (e.tz + j) * ALR_N + e.tx + k; if (alr.M.bld[q] === e.id) alr.M.bld[q] = 0; }
    if (sold) { for (let k = 0; k < 3; k++) alrSpawnUnit('inf', e.owner, e.x + alrRnd(-0.5, 0.5), e.tz - 0.35); }
  }
  alr.sel = alr.sel.filter((s) => s !== e);
  for (const g of Object.keys(alr.groups)) alr.groups[g] = alr.groups[g].filter((id) => id !== e.id);
}

// ---- the shroud ------------------------------------------------------------------------------------------------
function alrReveal(P, x, z, r) {
  const N = ALR_N, S = P.shroud;
  for (let j = Math.max(0, Math.floor(z - r - 1)); j <= Math.min(N - 1, Math.ceil(z + r + 1)); j++)
    for (let i = Math.max(0, Math.floor(x - r - 1)); i <= Math.min(N - 1, Math.ceil(x + r + 1)); i++) {
      const d = Math.hypot(i + 0.5 - x, j + 0.5 - z), v = alrClamp((r + 0.8 - d) * 200, 0, 255) | 0;
      const k = j * N + i;
      if (v > S[k]) { S[k] = v; alr.shroudDirty = true; }
    }
}
function alrRevealAll() { const P = alr.players[0]; for (const e of alr.ents) if (e.owner === 0) alrReveal(P, e.x, e.z, e.D.sight || 5); }

// ---- the end --------------------------------------------------------------------------------------------------
function alrCheckEnd() {
  if (alr.result) return;
  for (const P of alr.players) {
    const alive = alr.ents.some((e) => e.owner === P.id && (e.kind === 'bld' || e.D.weapon));
    if (!alive) P.lost = true;
  }
  if (alr.players[1].lost || alr.players[0].lost) {
    const won = alr.players[1].lost && !alr.players[0].lost;
    alr.result = { won, t: alr.t };
    if (won) {
      alrEarn(200, 'VICTORY');
      if (alr.cfg.key === 'pro') { try { localStorage.setItem('nugAlertPro', '1'); } catch (e) { } }
      if (alr.cfg.key === 'allout') { try { localStorage.setItem('nugAlertChamp', '1'); } catch (e) { } }
    }
    try { ArcadeKit.saveBest('alert', alr.cfg.key, alr.earned); } catch (e) { }
    alr.phase = 'over';
    alrSfx(won ? 'win' : 'lose');
    alrUIEnd();
  }
}

// ---- the CPU commander --------------------------------------------------------------------------------------------
// A build order, a placement search around its yard, harvesters per refinery, an army that gathers and
// goes in waves that grow, and a recall when its base is hit.
const ALR_AI_ORDER = ['power', 'refinery', 'barracks', 'power', 'factory', 'turret', 'refinery', 'power', 'radar', 'turret', 'tesla', 'power', 'barracks', 'factory', 'tesla', 'power', 'turret', 'tesla'];
function alrAINew(id) { return { step: 0, think: 0, waveT: null, wave: 0, rally: null, army: [], lastAttack: -999 }; }
function alrAIStep(P, dt) {
  const A = P.ai;
  if ((A.think -= dt) > 0) return;
  A.think = 0.5;
  const me = P.id, cfg = alr.cfg, enemy = 1 - me;
  if (A.waveT == null) A.waveT = me === 1 ? cfg.firstWave : 200;
  if (cfg.bonus && me === 1) P.credits += cfg.bonus * 0.5 * 4;
  const hq = alrBldsOf(me, 'hq')[0];
  if (!hq) return;
  // 1) the build order (it skips what it can't build yet, and rebuilds what it lost)
  if (!P.q.bld.length && !P.ready.bld) {
    const have = {}; for (const e of alr.ents) if (e.kind === 'bld' && e.owner === me) have[e.type] = (have[e.type] || 0) + 1;
    const want = {}; let next = null;
    for (const t of ALR_AI_ORDER) {
      want[t] = (want[t] || 0) + 1;
      if ((have[t] || 0) < want[t] && ALR_BLD[t].cat === 'bld') { next = t; break; }
    }
    if (P.low && next !== 'power') next = 'power';
    if (next && alrCanBuild(P, next) && P.credits > ALR_BLD[next].cost * 0.3) alrQueue(P, next);
  }
  if (!P.q.def.length && !P.ready.def) {
    const nt = alr.ents.filter((e) => e.kind === 'bld' && e.owner === me && e.D.cat === 'def').length;
    const goal = Math.min(6, 1 + Math.floor(alr.t / 120));
    if (nt < goal && P.credits > 900) { const t = alrCanBuild(P, 'tesla') && nt % 2 ? 'tesla' : 'turret'; if (alrCanBuild(P, t)) alrQueue(P, t); }
  }
  for (const cat of ['bld', 'def']) if (P.ready[cat]) { const spot = alrAISpot(P, P.ready[cat], hq); if (spot) alrPlace(P, P.ready[cat], spot[0], spot[1]); else if (Math.random() < 0.05) alrUnqueue(P, P.ready[cat]); }
  // 2) the factories: haulers first, then a mix
  const mine = alr.ents.filter((e) => e.kind === 'unit' && e.owner === me);
  const harvs = mine.filter((e) => e.D.harv).length, refs = alrBldsOf(me, 'refinery').length;
  const queued = (t) => P.q.veh.filter((q) => q.type === t).length;
  if (alrCanBuild(P, 'harv') && harvs + queued('harv') < Math.min(refs * 1.5 + 0.5, 4) && P.credits > 800) alrQueue(P, 'harv');
  if (P.q.inf.length < 2 && alrCanBuild(P, 'inf') && P.credits > 500) alrQueue(P, Math.random() < 0.35 ? 'rocket' : 'inf');
  if (P.q.veh.length < 2 && alrCanBuild(P, 'tank') && P.credits > 1200) alrQueue(P, alrCanBuild(P, 'heavy') && Math.random() < 0.45 ? 'heavy' : 'tank');
  // 3) the army
  const army = mine.filter((e) => e.D.weapon);
  if (!A.rally) { const [ex, ez] = alr.M.starts[enemy], d = Math.hypot(ex - hq.x, ez - hq.z); A.rally = [hq.x + (ex - hq.x) / d * 7, hq.z + (ez - hq.z) / d * 7]; }
  // defend: the base is hit — everybody home
  if (P.underAttack > 0 && P.attackedAt && Math.hypot(P.attackedAt[0] - hq.x, P.attackedAt[1] - hq.z) < 14) {
    for (const u of army) if (!u.order || u.order.type !== 'attack' || Math.random() < 0.1) { if (Math.hypot(u.x - hq.x, u.z - hq.z) < 22) alrOrderMove(u, P.attackedAt[0] + alrRnd(-1, 1), P.attackedAt[1] + alrRnd(-1, 1), true); }
    return;
  }
  A.waveT -= 0.5;
  const size = Math.round(alrRnd(cfg.wave[0], cfg.wave[1]) + A.wave * 2);
  const home = army.filter((u) => !u.order || (u.order.type === 'move' && !u.order.am));
  if (A.waveT <= 0 && home.length >= Math.min(size, 6 + A.wave * 2)) {
    // go: at the nearest thing they own (the refinery if it's in reach)
    let tgt = null, bd = 1e9;
    for (const e of alr.ents) if (e.owner === enemy && e.kind === 'bld') { const d = Math.hypot(e.x - A.rally[0], e.z - A.rally[1]) - (e.type === 'refinery' ? 6 : 0); if (d < bd) { bd = d; tgt = e; } }
    if (!tgt) tgt = alr.ents.find((e) => e.owner === enemy);
    if (tgt) { alrGroupMove(home, tgt.x, tgt.z, true); A.wave++; A.waveT = 70 + Math.random() * 40; A.lastAttack = alr.t; }
  } else {
    // idle soldiers stand at the rally point
    for (const u of army) if (!u.order && !u.target && Math.hypot(u.x - A.rally[0], u.z - A.rally[1]) > 4) alrOrderMove(u, A.rally[0] + alrRnd(-2, 2), A.rally[1] + alrRnd(-2, 2), false);
  }
  // an attack that arrived and found nothing: keep pushing to the next building
  for (const u of army) if (u.order && u.order.am && !u.path && !u.target) {
    let tgt = null, bd = 1e9;
    for (const e of alr.ents) if (e.owner === enemy && e.kind === 'bld') { const d = Math.hypot(e.x - u.x, e.z - u.z); if (d < bd) { bd = d; tgt = e; } }
    if (tgt) alrOrderMove(u, tgt.x, tgt.z, true);
  }
}
// where to put a building: a spiral out from the yard, a gap of one tile kept clear, defenses toward the enemy
function alrAISpot(P, type, hq) {
  const D = ALR_BLD[type], enemy = alr.M.starts[1 - P.id];
  const def = D.cat === 'def';
  let best = null, bs = 1e9;
  for (let r = 2; r < 13; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const tx = hq.tx + dx, tz = hq.tz + dz;
    if (!alrCanPlace(P, type, tx, tz)) continue;
    // keep a lane: no other building touching (except defenses)
    let touch = false;
    if (!def) for (let j = -1; j <= D.h && !touch; j++) for (let i = -1; i <= D.w; i++) { const x = tx + i, z = tz + j; if (alrIn(x, z) && alr.M.bld[z * ALR_N + x]) { touch = true; break; } }
    if (touch) continue;
    const cx = tx + D.w / 2, cz = tz + D.h / 2;
    let sc = Math.hypot(cx - hq.x, cz - hq.z);
    if (def) sc = Math.hypot(cx - enemy[0], cz - enemy[1]) + Math.abs(Math.hypot(cx - hq.x, cz - hq.z) - 7) * 2;
    sc += Math.random() * 1.5;
    if (sc < bs) { bs = sc; best = [tx, tz]; }
  }
  return best;
}

// ---- the frame --------------------------------------------------------------------------------------------------
function stepAlert(dt, w, h) {
  syncAlert();
  if (!alr.on || !alr.ui || !alr.ui.gl) return;
  dt = Math.min(dt, 0.1);
  if (alr.phase === 'play' && !alr.paused) {
    alrUIInput(dt);
    alr.acc += dt * (alr.speed || 1);
    let n = 0;
    while (alr.acc >= ALR_DT && n++ < 6) { alr.acc -= ALR_DT; alrSim(ALR_DT); }
    alrFxStep(dt);
  }
  if (alr.phase === 'play' || alr.phase === 'over') alrUIRender(dt);
}

// ---- test seam -----------------------------------------------------------------------------------------------------
// start(i) deals a game on tier i, auto(true) hands your side to a second commander, step(secs) runs
// the sim at 30 Hz headless (no drawing) — whole games in seconds.
window.alertDebug = {
  state: () => ({
    phase: alr.phase, t: Math.round(alr.t), result: alr.result, earned: alr.earned,
    players: alr.players.map((P) => ({ credits: Math.round(P.credits), make: P.make, use: P.use, low: P.low, lost: P.lost,
      blds: alr.ents.filter((e) => e.kind === 'bld' && e.owner === P.id).map((e) => e.type),
      units: alr.ents.filter((e) => e.kind === 'unit' && e.owner === P.id).map((e) => e.type) })),
    stats: alr.stats,
  }),
  start: (i) => { if (alr.tierPick) { alr.tierPick.close(); alr.tierPick = null; } alrNewGame(ALR_TIERS[i || 0]); },
  auto: (v) => { alr.auto = v !== false; },
  step: (secs) => { const n = Math.round(secs / ALR_DT); for (let k = 0; k < n && alr.phase === 'play'; k++) alrSim(ALR_DT); return window.alertDebug.state(); },
  queue: (t) => alrQueue(alr.players[0], t), place: (t, x, z) => alrPlace(alr.players[0], t, x, z),
  cam: (o) => Object.assign(alr.cam, o || {}), render: () => alrUIRender(0),
};
