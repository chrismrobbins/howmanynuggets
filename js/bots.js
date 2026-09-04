// ---- 🤖 BATTEREDBOTS ----------------------------------------------------------------
// "LAST BOT ROLLING."
//
// Game 17 (mode key: bots). Nugget RC battlebots in the service pit under the
// Grease Garage — Twisted Metal's sauces and specials on BattleBots' clock, on
// a fixed overhead broadcast camera. Josh asked for it, Nathan named the
// league (CLUCKED METAL), Beau voted on the name.
//
// This file is the SHELL and the RENDERER. The rules live in js/botsSim.js
// (one physics, three jobs — read its header). Here:
//   - the first minigame in this arcade rendered on WebGL: a normal-mapped
//     floor, up to 16 point lights (every muzzle flash, spark shower and fire
//     is one), one instanced-style particle batch, a persistent decal layer
//     (crumbs, skids, scorch — by 0:30 the floor tells the story of the round),
//     and the hall's bloom chain on top. WebGL1 is the low tier.
//   - procedural stand-ins for EVERY sprite in blender/BOTS_ART_CONTRACT.md,
//     painted at init from height fields (so they have real normals), used
//     until js/botsArt.js arrives async — and forever if it doesn't.
//   - input (WASD + mouse, twin-stick touch, gamepad), the announcer, the
//     KO cinematics, the HUD, the pick screens, banking into storm.caught.
//
// Prefix rule: everything here is bots* / BOTS_*.

const botsWorld = document.getElementById('botsWorld');

const BOTS_PPU = 4;               // atlas px per game unit (the contract)
const BOTS_W = 640, BOTS_H = 360; // the world (BotsSim.W/H)
const BOTS_BANK_DIV = 100;        // sim points → nuggets: pts/100 × perFlyer × tier
const BOTS_MAX_QUADS = 9000;

// League tiers: the sim's table, decorated for ArcadeKit.tierSelect.
const BOTS_TIERS = BotsSim.TIERS.map((t) => ({ key: t.key, emoji: t.emoji, name: t.name, mult: t.mult, blurb: t.blurb, lockNote: t.lockNote }));
const BOTS_CLASS_CARDS = BotsSim.CLASS_KEYS.map((k) => {
  const C = BotsSim.CLASSES[k];
  return { key: k, emoji: k === 'dicer' ? '🔪' : k === 'tender' ? '🔨' : '🧱', name: C.name, mult: 1, blurb: C.wt.toLowerCase() + ' · ' + C.special + ' — ' + C.blurb };
});
const BOTS_ARENA_CARDS = BotsSim.ARENA_KEYS.map((k) => {
  const A = BotsSim.ARENAS[k];
  return { key: k, emoji: k === 'pit' ? '🛢️' : k === 'fryer' ? '🍟' : '🌊', name: A.name, mult: 1, blurb: A.tag };
});
const BOTS_AI_NAMES = ['JOSH', 'NATHAN', 'CHRIS', 'BIG CRUMB', 'THE HOOD', 'GRAVY J.', 'HENRIETTA', 'DJ DRIP'];

const bots = {
  on: false, glcv: null, gl: null, gl2: false, uicv: null, ug: null, nogl: null,
  W: 1, Hh: 1, dpr: 1, rs: 1,           // device px size, DPR, render scale
  k: 1, cx: 320, cy: 180, zoom: 1,       // world→screen: k px per unit, camera centre
  camT: { x: 320, y: 180, z: 1, t: 0 },  // KO punch-in target
  slow: 1, hitstop: 0,
  tier: 'high', lightsMax: 16, partsMax: 4000, bloom: true, decalW: 1280, decalH: 720,
  m: null, me: 'me', cfg: BotsSim.TIERS[1], cls: 'dicer', arena: 'pit',
  phase: 'idle',                          // idle | tier | class | arena | play | done
  pick: null, boonPick: null, pauseOv: null, paused: false,
  keys: {}, mouse: { x: 0, y: 0, down: false, rdown: false, seen: false },
  touch: { on: false, L: null, R: null, roles: {}, spec: false, nitro: false },
  pad: { on: false, ax: 0, ay: 0, fire: false, spec: false, nitro: false },
  tank: false, lastInput: { dx: 0, dy: 0, ax: 1, ay: 0, ad: 0, fire: false, spec: false, nitro: false, tank: false },
  inputOverride: null,
  acc: 0, t: 0, freeze: false, frames: 0, slowFrames: 0,
  banked: 0, matches: 0,
  fx: { parts: [], lights: [], flashes: [], shake: 0, chroma: 0, flash: 0, crowd: 0, storm: 0 },
  decalQ: [], decalClear: true,
  ann: null, feed: [], countdown: -1,
  art: { ready: false, floorReady: false, R: null, injected: false },
  proc: null, tex: {}, prog: {}, buf: {}, fbo: {}, quadIdx: null, vdata: null,
  batches: { lit: [], glow: [], shadow: [] },
  sfx: { ctx: null, master: null, muted: false },
  results: null, resultsT: 0, lastPhase: '',
  online: false,                          // set by BotsNet: the worker is the authority, we predict + render
};

function botsActive() { return storm.mode === 'bots' && storm.running; }

// Did anyone ever win a match in THE SUMP? (📡 THE LAST PING — exhibit 16)
function botsPingHeard() {
  try { return localStorage.getItem('nugBotsPing') === '1'; } catch (e) { return false; }
}
function botsLeagueWon() {
  try { return localStorage.getItem('nugBotsLeague') === '1'; } catch (e) { return false; }
}

function botsTally() {
  if (bots.phase !== 'play' || !bots.m) return '🤖 pick your league…';
  const m = bots.m, me = BotsSim.botById(m, bots.me);
  const bits = ['round ' + m.roundNum, '⏱ ' + botsClock(m.clock)];
  if (me) bits.push((me.alive ? '🍗 ' + Math.ceil(me.hp) : '💀') + ' · ' + me.roundWins + 'W');
  return bits.join(' · ');
}
function botsClock(s) { s = Math.max(0, s); return Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2); }

// ---- perf tier ----------------------------------------------------------------------
// The hall already judged this machine (THE HOUSE CALL). Read its verdict so a
// laptop that runs the hall low gets a low pit without a second freeze.
function botsPickTier(gl2) {
  let q = 'auto', auto = '';
  try { q = localStorage.getItem('nugHallQuality') || 'auto'; auto = localStorage.getItem('nugHallTierAuto') || ''; } catch (e) { /* private mode */ }
  let tier = q !== 'auto' ? q : (auto || (gl2 ? 'high' : 'low'));
  if (!gl2 && tier === 'high') tier = 'med';
  const cores = navigator.hardwareConcurrency || 4;
  if (tier === 'high' && cores <= 4 && q === 'auto' && !auto) tier = 'med';
  botsApplyTier(tier);
}
function botsApplyTier(tier) {
  bots.tier = tier;
  const T = {
    high: { lights: 16, parts: 4000, bloom: true, rs: 1, dprCap: 2, decal: [1280, 720] },
    med:  { lights: 12, parts: 1500, bloom: true, rs: 1, dprCap: 1.5, decal: [1280, 720] },
    low:  { lights: 8,  parts: 400,  bloom: false, rs: 0.75, dprCap: 1, decal: [640, 360] },
  }[tier] || { lights: 12, parts: 1500, bloom: true, rs: 1, dprCap: 1.5, decal: [1280, 720] };
  bots.lightsMax = Math.min(T.lights, bots.gl2 ? 16 : 8);
  bots.partsMax = T.parts; bots.bloom = T.bloom && !!bots.fbo.scene; bots.rs = T.rs; bots.dprCap = T.dprCap;
  bots.decalW = T.decal[0]; bots.decalH = T.decal[1];
  if (bots.gl) { botsLayout(); botsMakeDecalFbo(); }
}

// ---- procedural art -----------------------------------------------------------------
// Every region in the contract, painted from three canvases: albedo, HEIGHT
// (grey = elevation, used to derive the normal page with a Sobel pass), and the
// PAINT mask. Chunky on purpose and quiet in tone — the lights do the work, the
// Blender pages replace all of it when js/botsArt.js lands.
const BOTS_REGIONS = [
  ['bot_dicer_0', 32, 32], ['bot_dicer_1', 32, 32], ['bot_dicer_2', 32, 32],
  ['bot_tender_0', 32, 32], ['bot_tender_1', 32, 32], ['bot_tender_2', 32, 32],
  ['bot_brick_0', 32, 32], ['bot_brick_1', 32, 32], ['bot_brick_2', 32, 32],
  ['disc_still', 20, 20], ['disc_spin', 20, 20], ['disc_blur', 20, 20], ['flipper_up', 26, 14],
  ['turret_minigun', 16, 16], ['turret_flamer', 16, 16], ['turret_mortar', 16, 16], ['turret_rocket', 16, 16], ['turret_emp', 16, 16],
  ['tire', 8, 8], ['drum', 10, 10], ['lamp', 12, 12], ['blade', 28, 10], ['mallet', 16, 16], ['mallet_arm', 8, 40],
  ['pad', 18, 18], ['pit_hole', 64, 64], ['grate', 64, 64], ['booth', 40, 80], ['driver', 8, 10], ['crowd', 128, 24],
  ['pickup_minigun', 10, 10], ['pickup_flamer', 10, 10], ['pickup_mortar', 10, 10], ['pickup_rocket', 10, 10], ['pickup_emp', 10, 10], ['pickup_nitro', 10, 10],
  ['p_spark', 4, 4], ['p_smoke', 16, 16], ['p_fire_0', 12, 12], ['p_fire_1', 12, 12], ['p_fire_2', 12, 12],
  ['p_crumb_0', 3, 3], ['p_crumb_1', 3, 3], ['p_crumb_2', 3, 3], ['p_crumb_3', 3, 3],
  ['p_plate_0', 6, 4], ['p_plate_1', 6, 4], ['p_plate_2', 6, 4], ['p_oil', 12, 12],
  ['puddle_ranch', 36, 36], ['scorch', 24, 24], ['skid', 6, 3],
  // renderer-only helpers (not in the Blender contract; always procedural)
  ['shadow', 16, 16], ['ring', 20, 20], ['basket', 40, 40], ['glow', 16, 16], ['white', 4, 4], ['rail', 8, 8], ['shot_tracer', 6, 2], ['rocket_body', 8, 4], ['shell', 4, 4],
];

function botsShelfPack(regions, size) {
  const R = {}; let x = 0, y = 0, rowH = 0;
  const pad = 2;
  for (const [name, wu, hu] of regions) {
    const w = wu * BOTS_PPU, h = hu * BOTS_PPU;
    if (x + w + pad > size) { x = 0; y += rowH + pad; rowH = 0; }
    R[name] = [x, y, w, h];
    x += w + pad; rowH = Math.max(rowH, h);
  }
  return R;
}

// A tiny deterministic noise so the stand-ins paint the same every boot.
function botsHash(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function botsRR(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
const botsGrey = (v) => { const c = Math.round(Math.max(0, Math.min(1, v)) * 255); return 'rgb(' + c + ',' + c + ',' + c + ')'; };

// The chassis: a nugget on wheels, nose up (−y). w/h are the cell in units.
function botsPaintChassis(a, h, mk, cls, state, w, hh) {
  const C = BotsSim.CLASSES[cls];
  const L = C.L, Wd = C.Wd, cx = w / 2, cy = hh / 2;
  const rnd = botsHash(cls.length * 977 + state * 31);
  const x0 = cx - Wd / 2, y0 = cy - L / 2;
  // wheels (four, proud of the body) — gone on the wreck
  if (state < 2) {
    for (const [wx, wy] of [[x0 - 1.6, y0 + 3], [x0 + Wd - 1.4, y0 + 3], [x0 - 1.6, y0 + L - 8], [x0 + Wd - 1.4, y0 + L - 8]]) {
      a.fillStyle = '#15171b'; botsRR(a, wx, wy, 3, 5, 1); a.fill();
      a.fillStyle = '#2c3138'; a.fillRect(wx + 1, wy + 1, 1, 3);
      h.fillStyle = botsGrey(0.42); botsRR(h, wx, wy, 3, 5, 1); h.fill();
    }
  }
  // body: batter
  const burnt = state === 2;
  a.fillStyle = burnt ? '#2a2420' : '#c98f3a';
  botsRR(a, x0, y0, Wd, L, cls === 'brick' ? 2.5 : 4); a.fill();
  if (cls === 'dicer' || cls === 'brick') { // wedge nose
    a.fillStyle = burnt ? '#1f1b18' : (cls === 'brick' ? '#8a939c' : '#b07a2a');
    a.beginPath(); a.moveTo(x0 + 1, y0 + 5); a.lineTo(cx, y0 - 1); a.lineTo(x0 + Wd - 1, y0 + 5); a.closePath(); a.fill();
  }
  // breading speckle
  for (let i = 0; i < (burnt ? 30 : 90); i++) {
    const px = x0 + 1 + rnd() * (Wd - 2), py = y0 + 3 + rnd() * (L - 6);
    a.fillStyle = burnt ? (rnd() < 0.5 ? '#3a2f28' : '#151210') : (rnd() < 0.5 ? '#e0a94a' : '#a86f22');
    a.fillRect(px, py, 0.8, 0.8);
  }
  // height: body dome
  const dome = h.createRadialGradient(cx, cy, 1, cx, cy, L * 0.6);
  dome.addColorStop(0, botsGrey(burnt ? 0.58 : 0.8)); dome.addColorStop(1, botsGrey(burnt ? 0.5 : 0.55));
  h.fillStyle = dome; botsRR(h, x0, y0, Wd, L, 4); h.fill();
  // the PAINT panel on top (the sauce) — a lighter grey the tint multiplies
  if (state < 2) {
    const pw = Wd * 0.58, ph = L * 0.42, px = cx - pw / 2, py = cy - ph / 2 + 1;
    a.fillStyle = '#cfd2d6'; botsRR(a, px, py, pw, ph, 1.5); a.fill();
    a.fillStyle = '#eef0f2'; botsRR(a, px + 0.6, py + 0.6, pw - 1.2, ph * 0.35, 1); a.fill(); // sheen
    mk.fillStyle = '#fff'; botsRR(mk, px, py, pw, ph, 1.5); mk.fill();
    h.fillStyle = botsGrey(0.86); botsRR(h, px, py, pw, ph, 1.5); h.fill();
    if (state === 1) { // a chunk of paint gone, dents
      mk.fillStyle = '#000'; mk.beginPath(); mk.arc(px + pw * 0.75, py + ph * 0.7, ph * 0.32, 0, 7); mk.fill();
      a.fillStyle = '#6b6f75'; a.beginPath(); a.arc(px + pw * 0.75, py + ph * 0.7, ph * 0.32, 0, 7); a.fill();
      for (let i = 0; i < 3; i++) { const dx = x0 + 2 + rnd() * (Wd - 4), dy = y0 + 4 + rnd() * (L - 8); h.fillStyle = botsGrey(0.5); h.beginPath(); h.arc(dx, dy, 1.4, 0, 7); h.fill(); a.fillStyle = '#7a5a25'; a.beginPath(); a.arc(dx, dy, 1.2, 0, 7); a.fill(); }
    }
  }
  // class hardware
  if (cls === 'tender') { // flipper plate across the nose
    a.fillStyle = burnt ? '#3a3d42' : '#9aa2ab'; a.fillRect(x0 + 0.5, y0 + 0.5, Wd - 1, 4);
    a.fillStyle = '#5b636c'; a.fillRect(x0 + 0.5, y0 + 4.2, Wd - 1, 0.8);
    h.fillStyle = botsGrey(0.9); h.fillRect(x0 + 0.5, y0 + 0.5, Wd - 1, 4);
    for (let i = 0; i < 4; i++) { a.fillStyle = '#2b3037'; a.fillRect(x0 + 1.5 + i * (Wd - 3) / 3, y0 + 2, 0.9, 0.9); }
  }
  if (cls === 'brick') { // bolted armor plates down the flanks
    for (const sx of [x0 + 0.8, x0 + Wd - 3.3]) {
      a.fillStyle = burnt ? '#33373c' : '#7d868f'; a.fillRect(sx, y0 + 7, 2.5, L - 11);
      h.fillStyle = botsGrey(0.9); h.fillRect(sx, y0 + 7, 2.5, L - 11);
      for (let i = 0; i < 4; i++) { a.fillStyle = '#23272c'; a.fillRect(sx + 0.8, y0 + 8.5 + i * (L - 14) / 3, 0.9, 0.9); }
    }
  }
  if (cls === 'dicer') { // the disc hub on the nose
    a.fillStyle = '#4a5058'; a.beginPath(); a.arc(cx, y0 + 1.5, 1.6, 0, 7); a.fill();
  }
  // eyes — it is still a nugget, and this town's nuggets have eyes
  if (!burnt) {
    a.fillStyle = '#fff'; a.fillRect(cx - 3, y0 + 7, 2, 2); a.fillRect(cx + 1, y0 + 7, 2, 2);
    a.fillStyle = '#111'; a.fillRect(cx - 2.2, y0 + 7.6, 1, 1); a.fillRect(cx + 1.8, y0 + 7.6, 1, 1);
  } else {
    a.fillStyle = '#111'; a.fillRect(cx - 3, y0 + 7, 2, 2); a.fillRect(cx + 1, y0 + 7, 2, 2);
  }
}

function botsPaintDisc(a, h, kind, w) {
  const c = w / 2, r = w / 2 - 1;
  a.fillStyle = kind === 'blur' ? '#6b7480' : '#8e979f';
  a.beginPath(); a.arc(c, c, r * 0.92, 0, 7); a.fill();
  if (kind === 'still') {
    a.fillStyle = '#cfd5db';
    for (let i = 0; i < 6; i++) { const t = i / 6 * Math.PI * 2; a.beginPath(); a.moveTo(c + Math.cos(t) * r * 0.6, c + Math.sin(t) * r * 0.6); a.lineTo(c + Math.cos(t + 0.35) * r, c + Math.sin(t + 0.35) * r); a.lineTo(c + Math.cos(t + 0.7) * r * 0.75, c + Math.sin(t + 0.7) * r * 0.75); a.closePath(); a.fill(); }
  } else if (kind === 'spin') {
    a.strokeStyle = 'rgba(220,228,236,0.7)'; a.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; a.beginPath(); a.arc(c, c, r * 0.85, t, t + 0.3); a.stroke(); }
  } else {
    a.strokeStyle = '#e6ecf2'; a.lineWidth = 1.4; a.beginPath(); a.arc(c, c, r * 0.9, 0, 7); a.stroke();
  }
  a.fillStyle = '#23272c'; a.beginPath(); a.arc(c, c, r * 0.18, 0, 7); a.fill();
  const g = h.createRadialGradient(c, c, 0, c, c, r); g.addColorStop(0, botsGrey(0.8)); g.addColorStop(0.9, botsGrey(0.72)); g.addColorStop(1, botsGrey(0.5));
  h.fillStyle = g; h.beginPath(); h.arc(c, c, r, 0, 7); h.fill();
}

// A sauce bottle seen from above, nose up: cap at the top, label band.
function botsPaintBottle(a, h, mk, key, w, hh, turret) {
  const W = BotsSim.WEAPONS[key];
  const col = 'rgb(' + W.col.map((v) => Math.round(v * 200)).join(',') + ')';
  const cx = w / 2;
  if (turret) { // mount plate
    a.fillStyle = '#4a5058'; a.beginPath(); a.arc(cx, hh / 2, w * 0.42, 0, 7); a.fill();
    h.fillStyle = botsGrey(0.78); h.beginPath(); h.arc(cx, hh / 2, w * 0.42, 0, 7); h.fill();
  }
  const bw = w * 0.42, bh = hh * 0.7, bx = cx - bw / 2, by = hh * 0.12;
  a.fillStyle = col; botsRR(a, bx, by + bh * 0.2, bw, bh * 0.8, bw * 0.3); a.fill();
  a.fillStyle = '#e9e4d8'; a.fillRect(bx + 0.6, by + bh * 0.5, bw - 1.2, bh * 0.22); // label
  a.fillStyle = '#23272c'; botsRR(a, cx - bw * 0.28, by, bw * 0.56, bh * 0.24, 0.6); a.fill(); // cap / nozzle
  if (key === 'rocket') { a.fillStyle = '#ffd98a'; a.beginPath(); a.moveTo(cx, by - 1.5); a.lineTo(cx - 1.2, by + 1); a.lineTo(cx + 1.2, by + 1); a.closePath(); a.fill(); }
  if (key === 'nitro') { a.fillStyle = '#ff3b3b'; a.fillRect(bx + 0.5, by + bh * 0.28, bw - 1, bh * 0.15); }
  h.fillStyle = botsGrey(0.9); botsRR(h, bx, by, bw, bh, bw * 0.3); h.fill();
}

function botsPaintRegion(name, a, h, mk, wu, hu) {
  const rnd = botsHash(name.length * 131 + name.charCodeAt(0) * 7 + (name.charCodeAt(name.length - 1) || 1));
  const cx = wu / 2, cy = hu / 2;
  let mt;
  if ((mt = /^bot_(\w+)_(\d)$/.exec(name))) return botsPaintChassis(a, h, mk, mt[1], +mt[2], wu, hu);
  if ((mt = /^disc_(\w+)$/.exec(name))) return botsPaintDisc(a, h, mt[1], wu);
  if ((mt = /^turret_(\w+)$/.exec(name))) return botsPaintBottle(a, h, mk, mt[1], wu, hu, true);
  if ((mt = /^pickup_(\w+)$/.exec(name))) return botsPaintBottle(a, h, mk, mt[1], wu, hu, false);
  switch (name) {
    case 'flipper_up':
      a.fillStyle = '#9aa2ab'; a.fillRect(0.5, 1, wu - 1, hu - 4); a.fillStyle = '#5b636c'; a.fillRect(0.5, hu - 3, wu - 1, 2);
      h.fillStyle = botsGrey(0.95); h.fillRect(0.5, 1, wu - 1, hu - 4); break;
    case 'tire': {
      a.fillStyle = '#15171b'; a.beginPath(); a.arc(cx, cy, wu * 0.46, 0, 7); a.fill();
      a.strokeStyle = '#2a2e34'; a.lineWidth = 0.7; a.beginPath(); a.arc(cx, cy, wu * 0.3, 0, 7); a.stroke();
      for (let i = 0; i < 8; i++) { const t = i / 8 * 7; a.fillStyle = '#0c0d10'; a.fillRect(cx + Math.cos(t) * wu * 0.4 - 0.4, cy + Math.sin(t) * wu * 0.4 - 0.4, 0.8, 0.8); }
      const g = h.createRadialGradient(cx, cy, wu * 0.2, cx, cy, wu * 0.48); g.addColorStop(0, botsGrey(0.6)); g.addColorStop(0.5, botsGrey(0.85)); g.addColorStop(1, botsGrey(0.5));
      h.fillStyle = g; h.beginPath(); h.arc(cx, cy, wu * 0.48, 0, 7); h.fill(); break; }
    case 'drum': {
      a.fillStyle = '#4b5d3a'; a.beginPath(); a.arc(cx, cy, wu * 0.46, 0, 7); a.fill();
      a.strokeStyle = '#2e3b24'; a.lineWidth = 0.6; a.beginPath(); a.arc(cx, cy, wu * 0.3, 0, 7); a.stroke();
      a.fillStyle = '#1a1a1a'; a.beginPath(); a.arc(cx + 2, cy - 1.5, 0.9, 0, 7); a.fill();
      h.fillStyle = botsGrey(0.95); h.beginPath(); h.arc(cx, cy, wu * 0.46, 0, 7); h.fill(); break; }
    case 'lamp': {
      a.fillStyle = '#2b3037'; a.beginPath(); a.arc(cx, cy, wu * 0.44, 0, 7); a.fill();
      a.fillStyle = '#4a5058'; a.beginPath(); a.arc(cx, cy, wu * 0.36, 0, 7); a.fill();
      a.fillStyle = '#d8d2c4'; a.beginPath(); a.arc(cx, cy, wu * 0.18, 0, 7); a.fill(); // the lamp face (unlit — it is a fixture seen from above)
      a.fillStyle = '#15171b'; a.fillRect(cx - 0.6, 0, 1.2, cy); // the clamp arm
      h.fillStyle = botsGrey(0.9); h.beginPath(); h.arc(cx, cy, wu * 0.44, 0, 7); h.fill(); break; }
    case 'blade': {
      a.fillStyle = '#b9c2cb'; a.fillRect(1, hu * 0.45, wu - 2, hu * 0.5);
      a.fillStyle = '#e6ecf2';
      for (let x = 1.5; x < wu - 2; x += 2.4) { a.beginPath(); a.moveTo(x, hu * 0.45); a.lineTo(x + 1.2, 0.6); a.lineTo(x + 2.4, hu * 0.45); a.closePath(); a.fill(); }
      a.fillStyle = '#3a434d'; a.fillRect(1, hu * 0.8, wu - 2, hu * 0.15);
      h.fillStyle = botsGrey(0.9); h.fillRect(1, 0.6, wu - 2, hu - 1); break; }
    case 'mallet': {
      a.fillStyle = '#3a3f47'; botsRR(a, 1, 1, wu - 2, hu - 2, 2); a.fill();
      a.fillStyle = '#6b7480'; botsRR(a, 3, 3, wu - 6, hu - 6, 1.5); a.fill();
      for (const [px, py] of [[3.5, 3.5], [wu - 4.5, 3.5], [3.5, hu - 4.5], [wu - 4.5, hu - 4.5]]) { a.fillStyle = '#15171b'; a.beginPath(); a.arc(px, py, 0.8, 0, 7); a.fill(); }
      const g = h.createRadialGradient(cx, cy, 1, cx, cy, wu * 0.7); g.addColorStop(0, botsGrey(1)); g.addColorStop(1, botsGrey(0.6));
      h.fillStyle = g; botsRR(h, 1, 1, wu - 2, hu - 2, 2); h.fill(); break; }
    case 'mallet_arm':
      a.fillStyle = '#4a5058'; a.fillRect(wu * 0.25, 0, wu * 0.5, hu); a.fillStyle = '#2b3037'; a.fillRect(wu * 0.42, 0, wu * 0.16, hu);
      h.fillStyle = botsGrey(0.85); h.fillRect(wu * 0.25, 0, wu * 0.5, hu); break;
    case 'pad': {
      a.fillStyle = '#4a5058'; botsRR(a, 1, 1, wu - 2, hu - 2, 1.5); a.fill();
      a.fillStyle = '#5c6570'; botsRR(a, 2.5, 2.5, wu - 5, hu - 5, 1); a.fill();
      for (const [px, py] of [[2.2, 2.2], [wu - 2.2, 2.2], [2.2, hu - 2.2], [wu - 2.2, hu - 2.2]]) { a.fillStyle = '#1f2328'; a.beginPath(); a.arc(px, py, 0.7, 0, 7); a.fill(); h.fillStyle = botsGrey(0.95); h.beginPath(); h.arc(px, py, 0.7, 0, 7); h.fill(); }
      h.fillStyle = botsGrey(0.62); botsRR(h, 1, 1, wu - 2, hu - 2, 1.5); h.fill(); break; }
    case 'pit_hole': {
      const g = a.createRadialGradient(cx, cy, wu * 0.2, cx, cy, wu * 0.42); g.addColorStop(0, '#02030a'); g.addColorStop(0.8, '#060810'); g.addColorStop(1, '#1a2028');
      a.fillStyle = g; a.beginPath(); a.arc(cx, cy, wu * 0.42, 0, 7); a.fill();
      a.strokeStyle = '#2e3a44'; a.lineWidth = 1; a.beginPath(); a.arc(cx, cy, wu * 0.41, 0, 7); a.stroke();
      const hg = h.createRadialGradient(cx, cy, wu * 0.3, cx, cy, wu * 0.42); hg.addColorStop(0, botsGrey(0.05)); hg.addColorStop(1, botsGrey(0.5));
      h.fillStyle = hg; h.beginPath(); h.arc(cx, cy, wu * 0.42, 0, 7); h.fill(); break; }
    case 'grate': {
      a.fillStyle = '#2a2f36'; a.beginPath(); a.arc(cx, cy, wu * 0.41, 0, 7); a.fill();
      a.save(); a.beginPath(); a.arc(cx, cy, wu * 0.39, 0, 7); a.clip();
      for (let y = cy - wu * 0.4; y < cy + wu * 0.4; y += 4) { a.fillStyle = '#0b0d10'; a.fillRect(cx - wu * 0.4, y + 1.2, wu * 0.8, 1.6); a.fillStyle = '#4a525c'; a.fillRect(cx - wu * 0.4, y, wu * 0.8, 0.6); }
      a.restore();
      a.strokeStyle = '#5a636e'; a.lineWidth = 1.2; a.beginPath(); a.arc(cx, cy, wu * 0.41, 0, 7); a.stroke();
      h.fillStyle = botsGrey(0.55); h.beginPath(); h.arc(cx, cy, wu * 0.41, 0, 7); h.fill();
      for (let y = cy - wu * 0.4; y < cy + wu * 0.4; y += 4) { h.fillStyle = botsGrey(0.3); h.fillRect(cx - wu * 0.38, y + 1.2, wu * 0.76, 1.6); } break; }
    case 'booth': {
      a.fillStyle = '#1f2328'; botsRR(a, 1, 1, wu - 2, hu - 2, 3); a.fill();
      a.fillStyle = '#2f4a5c'; botsRR(a, 3, 3, wu - 6, hu - 6, 2); a.fill(); // glass roof
      a.fillStyle = 'rgba(180,210,230,0.25)'; a.fillRect(5, 5, wu * 0.3, hu - 10);
      a.fillStyle = '#c98f3a'; a.beginPath(); a.arc(cx - 6, cy, 3.2, 0, 7); a.fill(); a.beginPath(); a.arc(cx + 6, cy, 3.2, 0, 7); a.fill(); // two announcers
      h.fillStyle = botsGrey(0.9); botsRR(h, 1, 1, wu - 2, hu - 2, 3); h.fill(); break; }
    case 'driver':
      a.fillStyle = '#c98f3a'; a.beginPath(); a.arc(cx, cy + 1, 3.2, 0, 7); a.fill();
      a.fillStyle = '#cfd2d6'; a.fillRect(cx - 1.5, cy - 1.5, 3, 2); mk.fillStyle = '#fff'; mk.fillRect(cx - 1.5, cy - 1.5, 3, 2);
      a.fillStyle = '#15171b'; a.fillRect(cx - 1.2, cy - 4, 2.4, 1.6); a.fillStyle = '#c9c9c9'; a.fillRect(cx + 1.4, cy - 7, 0.4, 3);
      h.fillStyle = botsGrey(0.9); h.beginPath(); h.arc(cx, cy + 1, 3.2, 0, 7); h.fill(); break;
    case 'crowd':
      for (let i = 0; i < 34; i++) {
        const x = 2 + rnd() * (wu - 4), y = 4 + rnd() * (hu - 8), r = 2.2 + rnd() * 1.4;
        a.fillStyle = rnd() < 0.85 ? (rnd() < 0.5 ? '#a8742a' : '#c48f3d') : '#d9d2c6';
        a.beginPath(); a.arc(x, y, r, 0, 7); a.fill();
        h.fillStyle = botsGrey(0.7 + rnd() * 0.25); h.beginPath(); h.arc(x, y, r, 0, 7); h.fill();
      } break;
    case 'p_spark': case 'glow': {
      const g = a.createRadialGradient(cx, cy, 0, cx, cy, wu / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,240,200,0.8)'); g.addColorStop(1, 'rgba(255,200,120,0)');
      a.fillStyle = g; a.fillRect(0, 0, wu, hu); break; }
    case 'p_smoke': {
      for (let i = 0; i < 5; i++) { const x = cx + (rnd() - 0.5) * wu * 0.5, y = cy + (rnd() - 0.5) * hu * 0.5, r = wu * (0.22 + rnd() * 0.16); const g = a.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(200,200,205,0.55)'); g.addColorStop(1, 'rgba(160,160,168,0)'); a.fillStyle = g; a.fillRect(0, 0, wu, hu); }
      break; }
    case 'p_fire_0': case 'p_fire_1': case 'p_fire_2': {
      const f = +name.slice(-1);
      const g = a.createRadialGradient(cx, cy + 1 - f, 0, cx, cy, wu * 0.48); g.addColorStop(0, 'rgba(255,250,210,1)'); g.addColorStop(0.3, 'rgba(255,170,60,0.95)'); g.addColorStop(0.7, 'rgba(230,70,20,0.6)'); g.addColorStop(1, 'rgba(120,20,10,0)');
      a.fillStyle = g; a.beginPath(); a.moveTo(cx, 0.5 + f); a.quadraticCurveTo(wu, cy, cx + 1, hu - 0.5); a.quadraticCurveTo(0, cy, cx, 0.5 + f); a.fill(); break; }
    case 'p_crumb_0': case 'p_crumb_1': case 'p_crumb_2': case 'p_crumb_3':
      a.fillStyle = ['#d9a24a', '#b07a2a', '#e6b661', '#8f5f1e'][+name.slice(-1)]; a.beginPath(); a.moveTo(0.4, 0.8); a.lineTo(wu - 0.5, 0.3); a.lineTo(wu - 0.3, hu - 0.6); a.lineTo(0.8, hu - 0.3); a.closePath(); a.fill();
      h.fillStyle = botsGrey(0.75); h.fillRect(0.3, 0.3, wu - 0.6, hu - 0.6); break;
    case 'p_plate_0': case 'p_plate_1': case 'p_plate_2':
      a.fillStyle = ['#7d868f', '#5b636c', '#9aa2ab'][+name.slice(-1)]; a.fillRect(0.3, 0.3, wu - 0.6, hu - 0.6); a.fillStyle = '#23272c'; a.fillRect(1, 1, 0.8, 0.8); a.fillRect(wu - 1.8, hu - 1.8, 0.8, 0.8);
      h.fillStyle = botsGrey(0.9); h.fillRect(0.3, 0.3, wu - 0.6, hu - 0.6); break;
    case 'p_oil': {
      const g = a.createRadialGradient(cx, cy, 0, cx, cy, wu * 0.48); g.addColorStop(0, 'rgba(10,10,14,0.85)'); g.addColorStop(0.7, 'rgba(14,14,20,0.6)'); g.addColorStop(1, 'rgba(14,14,20,0)');
      a.fillStyle = g; a.beginPath(); for (let i = 0; i < 9; i++) { const t = i / 9 * 7, r = wu * (0.3 + rnd() * 0.18); i ? a.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r) : a.moveTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r); } a.closePath(); a.fill(); break; }
    case 'puddle_ranch': {
      const g = a.createRadialGradient(cx, cy, wu * 0.1, cx, cy, wu * 0.48); g.addColorStop(0, 'rgba(240,244,246,0.92)'); g.addColorStop(0.75, 'rgba(228,234,238,0.8)'); g.addColorStop(1, 'rgba(220,226,232,0)');
      a.fillStyle = g; a.beginPath(); for (let i = 0; i < 12; i++) { const t = i / 12 * 7, r = wu * (0.38 + rnd() * 0.1); i ? a.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r) : a.moveTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r); } a.closePath(); a.fill();
      a.fillStyle = 'rgba(255,255,255,0.35)'; a.beginPath(); a.arc(cx - wu * 0.12, cy - wu * 0.14, wu * 0.08, 0, 7); a.fill(); break; }
    case 'scorch': {
      const g = a.createRadialGradient(cx, cy, 0, cx, cy, wu * 0.48); g.addColorStop(0, 'rgba(8,6,6,0.85)'); g.addColorStop(0.5, 'rgba(20,14,10,0.6)'); g.addColorStop(1, 'rgba(30,20,12,0)');
      a.fillStyle = g; a.fillRect(0, 0, wu, hu); break; }
    case 'skid':
      a.fillStyle = 'rgba(12,12,14,0.55)'; botsRR(a, 0.2, 0.3, wu - 0.4, hu - 0.6, 0.6); a.fill(); break;
    case 'shadow': {
      const g = a.createRadialGradient(cx, cy, 0, cx, cy, wu * 0.5); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.6, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      a.fillStyle = g; a.fillRect(0, 0, wu, hu); break; }
    case 'ring':
      a.strokeStyle = '#d8d8d8'; a.lineWidth = 1.4; a.beginPath(); a.arc(cx, cy, wu * 0.42, 0, 7); a.stroke();
      mk.strokeStyle = '#fff'; mk.lineWidth = 1.4; mk.beginPath(); mk.arc(cx, cy, wu * 0.42, 0, 7); mk.stroke(); break;
    case 'basket': {
      a.fillStyle = '#5b636c'; a.beginPath(); a.arc(cx, cy, wu * 0.46, 0, 7); a.fill();
      a.save(); a.beginPath(); a.arc(cx, cy, wu * 0.42, 0, 7); a.clip();
      a.strokeStyle = '#2b3037'; a.lineWidth = 0.6;
      for (let i = -wu; i < wu; i += 2.4) { a.beginPath(); a.moveTo(i, 0); a.lineTo(i + wu, wu); a.stroke(); a.beginPath(); a.moveTo(i + wu, 0); a.lineTo(i, wu); a.stroke(); }
      a.restore();
      a.fillStyle = '#23272c'; a.fillRect(cx - 1.2, 0, 2.4, hu * 0.2);
      h.fillStyle = botsGrey(0.9); h.beginPath(); h.arc(cx, cy, wu * 0.46, 0, 7); h.fill(); break; }
    case 'white': a.fillStyle = '#fff'; a.fillRect(0, 0, wu, hu); mk.fillStyle = '#fff'; mk.fillRect(0, 0, wu, hu); break;
    case 'rail': a.fillStyle = 'rgba(210,230,245,0.9)'; a.fillRect(0, hu * 0.4, wu, hu * 0.2); break;
    case 'shot_tracer': { const g = a.createLinearGradient(0, 0, wu, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)'); a.fillStyle = g; a.fillRect(0, 0, wu, hu); break; }
    case 'rocket_body': a.fillStyle = '#cfd2d6'; botsRR(a, 0, 0.5, wu * 0.8, hu - 1, 1); a.fill(); a.fillStyle = '#e63b2e'; a.fillRect(wu * 0.7, 0.5, wu * 0.3, hu - 1); a.fillStyle = '#9aa2ab'; a.fillRect(0, 0, 1.5, hu); break;
    case 'shell': a.fillStyle = '#e9ecef'; a.beginPath(); a.arc(cx, cy, wu * 0.4, 0, 7); a.fill(); break;
  }
}

// Height field → normal page (Sobel). +X right, +Y image-up, +Z out, packed
// n*0.5+0.5 with the albedo's alpha, exactly like the Blender pass so the
// shader never knows which one it got.
function botsHeightToNormal(hcv, acv, strength) {
  const w = hcv.width, h = hcv.height;
  const hd = hcv.getContext('2d').getImageData(0, 0, w, h).data;
  const ad = acv.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const og = out.getContext('2d');
  const img = og.createImageData(w, h); const o = img.data;
  const H = (x, y) => { x = x < 0 ? 0 : x >= w ? w - 1 : x; y = y < 0 ? 0 : y >= h ? h - 1 : y; return hd[(y * w + x) * 4] / 255; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = ad[i + 3];
      if (a === 0) { o[i] = 128; o[i + 1] = 128; o[i + 2] = 255; o[i + 3] = 0; continue; }
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * strength, ny = dy * strength, nz = 1; // image-up is −y in canvas → flip dy
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      o[i] = Math.round((nx * 0.5 + 0.5) * 255); o[i + 1] = Math.round((ny * 0.5 + 0.5) * 255); o[i + 2] = Math.round((nz * 0.5 + 0.5) * 255); o[i + 3] = a;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

function botsMakeProceduralAtlas() {
  const size = 1024;
  const R = botsShelfPack(BOTS_REGIONS, size);
  const mk = (fill) => { const c = document.createElement('canvas'); c.width = size; c.height = size; const g = c.getContext('2d'); if (fill) { g.fillStyle = fill; g.fillRect(0, 0, size, size); } return c; };
  const acv = mk(null), hcv = mk('#808080'), mcv = mk(null);
  const a = acv.getContext('2d'), h = hcv.getContext('2d'), m = mcv.getContext('2d');
  // the height canvas starts mid-grey everywhere; regions paint their relief over it
  for (const [name, wu, hu] of BOTS_REGIONS) {
    const r = R[name];
    for (const g of [a, h, m]) { g.save(); g.beginPath(); g.rect(r[0], r[1], r[2], r[3]); g.clip(); g.translate(r[0], r[1]); g.scale(BOTS_PPU, BOTS_PPU); }
    // height needs an opaque base under the sprite only where the albedo paints —
    // paint it flat-grey first, the Sobel masks by albedo alpha afterwards
    h.fillStyle = '#808080'; h.fillRect(0, 0, wu, hu);
    botsPaintRegion(name, a, h, m, wu, hu);
    for (const g of [a, h, m]) g.restore();
  }
  const ncv = botsHeightToNormal(hcv, acv, 1.6);
  return { R, W: size, H: size, albedo: acv, normal: ncv, mask: mcv };
}

// The arena floor pages, procedural: concrete, joints, tire ring, the drain,
// pads, slots, stains — the same geometry the contract gives Blender. 1024×576
// (1.6 px/unit) is plenty for a stand-in the lights are going to carry.
function botsMakeProceduralFloor(arena) {
  const A = BotsSim.ARENAS[arena] || BotsSim.ARENAS.pit;
  const W = 1024, Hh = 576, s = W / BOTS_W;
  const acv = document.createElement('canvas'); acv.width = W; acv.height = Hh;
  const hcv = document.createElement('canvas'); hcv.width = W; hcv.height = Hh;
  const rcv = document.createElement('canvas'); rcv.width = W; rcv.height = Hh;
  const a = acv.getContext('2d'), h = hcv.getContext('2d'), r = rcv.getContext('2d');
  for (const g of [a, h, r]) g.scale(s, s);
  const rnd = botsHash(arena === 'pit' ? 17 : arena === 'fryer' ? 23 : 29);
  const box = A.box;
  const isFry = arena === 'fryer', isSump = arena === 'sump';
  // apron (outside the wall): dark concrete / wet
  a.fillStyle = isSump ? '#10151a' : '#191b1f'; a.fillRect(0, 0, BOTS_W, BOTS_H);
  h.fillStyle = '#7a7a7a'; h.fillRect(0, 0, BOTS_W, BOTS_H);
  r.fillStyle = botsGrey(isSump ? 0.3 : 0.85); r.fillRect(0, 0, BOTS_W, BOTS_H);
  // stands: rows of seats top and bottom
  for (const [y0, y1] of [[8, 36], [324, 352]]) {
    a.fillStyle = '#23262b'; a.fillRect(40, y0, 560, y1 - y0);
    for (let y = y0 + 4; y < y1 - 3; y += 7) { a.fillStyle = '#2f333a'; a.fillRect(44, y, 552, 3); h.fillStyle = '#9a9a9a'; h.fillRect(44, y, 552, 3); }
  }
  // announcer booth footprint (left) + driver rail (right)
  a.fillStyle = '#1f2328'; a.fillRect(2, 100, 36, 160); a.fillStyle = '#2b3440'; a.fillRect(602, 60, 36, 240);
  // the floor inside the wall
  const fx0 = box[0] - 12, fy0 = box[1] - 12, fx1 = box[2] + 12, fy1 = box[3] + 12;
  a.fillStyle = isFry ? '#6d737a' : isSump ? '#2b3238' : '#3a3d42'; a.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  r.fillStyle = botsGrey(isFry ? 0.3 : isSump ? 0.4 : 0.8); r.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  // concrete tone variation + speckle
  for (let i = 0; i < 2600; i++) {
    const x = fx0 + rnd() * (fx1 - fx0), y = fy0 + rnd() * (fy1 - fy0);
    a.fillStyle = isFry ? (rnd() < 0.5 ? '#767c84' : '#646a72') : (rnd() < 0.5 ? '#404449' : '#33363b');
    a.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // expansion joints on a 64-unit grid (V-grooves in the height)
  a.strokeStyle = isFry ? '#4a5058' : '#25272b'; a.lineWidth = 1.2; h.strokeStyle = '#4d4d4d'; h.lineWidth = 1.6;
  for (let x = 64; x < BOTS_W; x += 64) { if (x > fx0 && x < fx1) { a.beginPath(); a.moveTo(x, fy0); a.lineTo(x, fy1); a.stroke(); h.beginPath(); h.moveTo(x, fy0); h.lineTo(x, fy1); h.stroke(); } }
  for (let y = 56; y < BOTS_H; y += 64) { if (y > fy0 && y < fy1) { a.beginPath(); a.moveTo(fx0, y); a.lineTo(fx1, y); a.stroke(); h.beginPath(); h.moveTo(fx0, y); h.lineTo(fx1, y); h.stroke(); } }
  // oil stains (glossy in rough), tire marks
  for (let i = 0; i < (isFry ? 6 : 14); i++) {
    const x = box[0] + 20 + rnd() * (box[2] - box[0] - 40), y = box[1] + 20 + rnd() * (box[3] - box[1] - 40), rr = 8 + rnd() * 22;
    const g = a.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, isFry ? 'rgba(120,110,70,0.45)' : 'rgba(8,8,12,0.7)'); g.addColorStop(1, 'rgba(8,8,12,0)');
    a.fillStyle = g; a.beginPath(); a.arc(x, y, rr, 0, 7); a.fill();
    const rg = r.createRadialGradient(x, y, 0, x, y, rr); rg.addColorStop(0, botsGrey(0.12)); rg.addColorStop(1, botsGrey(0.8));
    r.fillStyle = rg; r.beginPath(); r.arc(x, y, rr, 0, 7); r.fill();
  }
  for (let i = 0; i < 26; i++) {
    const x = box[0] + rnd() * (box[2] - box[0]), y = box[1] + rnd() * (box[3] - box[1]), ang = rnd() * 7, len = 20 + rnd() * 60;
    a.strokeStyle = 'rgba(10,10,12,0.28)'; a.lineWidth = 2.2; a.beginPath(); a.moveTo(x, y); a.quadraticCurveTo(x + Math.cos(ang + 0.4) * len * 0.5, y + Math.sin(ang + 0.4) * len * 0.5, x + Math.cos(ang) * len, y + Math.sin(ang) * len); a.stroke();
  }
  // the faded wordmark around the drain
  a.save(); a.translate(320, 180); a.globalAlpha = 0.22; a.fillStyle = '#f0b03a'; a.textAlign = 'center';
  a.font = '900 22px Impact, Haettenschweiler, sans-serif';
  a.fillText('CLUCKED METAL', 0, -44); a.font = '900 11px Impact, Haettenschweiler, sans-serif'; a.fillText('GREASE GARAGE INVITATIONAL', 0, 56);
  a.restore();
  // hazard stripe on the inner wall face + the tire ring (rounded bumps)
  for (let x = fx0; x < fx1; x += 8) { a.fillStyle = (x / 8) % 2 ? '#c98a1e' : '#151515'; a.fillRect(x, fy0 + 10, 8, 2); a.fillRect(x, fy1 - 12, 8, 2); }
  for (let y = fy0; y < fy1; y += 8) { a.fillStyle = (y / 8) % 2 ? '#c98a1e' : '#151515'; a.fillRect(fx0 + 10, y, 2, 8); a.fillRect(fx1 - 12, y, 2, 8); }
  const tire = (x, y) => {
    a.fillStyle = '#15171b'; a.beginPath(); a.arc(x, y, 3.8, 0, 7); a.fill(); a.strokeStyle = '#2a2e34'; a.lineWidth = 0.6; a.beginPath(); a.arc(x, y, 2.4, 0, 7); a.stroke();
    const g = h.createRadialGradient(x, y, 1.2, x, y, 4); g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.5, '#d8d8d8'); g.addColorStop(1, '#707070'); h.fillStyle = g; h.beginPath(); h.arc(x, y, 4, 0, 7); h.fill();
    r.fillStyle = botsGrey(0.7); r.beginPath(); r.arc(x, y, 4, 0, 7); r.fill();
  };
  for (let x = fx0 + 4; x < fx1; x += 8) { tire(x, fy0 + 5); tire(x, fy1 - 5); }
  for (let y = fy0 + 12; y < fy1 - 8; y += 8) { tire(fx0 + 5, y); tire(fx1 - 5, y); }
  // polycarbonate rail on the outer face
  a.fillStyle = 'rgba(190,215,235,0.55)'; a.fillRect(fx0 - 1.5, fy0 - 1.5, fx1 - fx0 + 3, 1.5); a.fillRect(fx0 - 1.5, fy1, fx1 - fx0 + 3, 1.5); a.fillRect(fx0 - 1.5, fy0, 1.5, fy1 - fy0); a.fillRect(fx1, fy0, 1.5, fy1 - fy0);
  r.fillStyle = botsGrey(0.1); r.fillRect(fx0 - 1.5, fy0 - 1.5, fx1 - fx0 + 3, 1.5); r.fillRect(fx0 - 1.5, fy1, fx1 - fx0 + 3, 1.5);
  // start pads: hex outlines in worn yellow
  for (const [px, py] of A.starts) {
    a.strokeStyle = 'rgba(240,176,58,0.5)'; a.lineWidth = 1.6; a.beginPath();
    for (let i = 0; i < 6; i++) { const t = i / 6 * 7 + 0.5; i ? a.lineTo(px + Math.cos(t) * 12, py + Math.sin(t) * 12) : a.moveTo(px + Math.cos(t) * 12, py + Math.sin(t) * 12); }
    a.closePath(); a.stroke();
  }
  // weapon pad plates (the sprite pass draws the plate + ring; here just a worn square)
  for (const [px, py] of A.pads) { a.fillStyle = 'rgba(0,0,0,0.25)'; a.fillRect(px - 11, py - 11, 22, 22); }
  // slicer slots in the wall
  for (const sl of (A.slicers || [])) { const y = sl.side ? box[3] : box[1] - 6; a.fillStyle = '#0a0b0d'; a.fillRect(sl.x - 26, y, 52, 6); h.fillStyle = '#3a3a3a'; h.fillRect(sl.x - 26, y, 52, 6); }
  // mallet landing ring
  if (A.mallet) { a.strokeStyle = 'rgba(230,59,46,0.45)'; a.lineWidth = 1.5; a.beginPath(); a.arc(A.mallet.hx, A.mallet.hy, A.mallet.r, 0, 7); a.stroke(); a.fillStyle = '#4a5058'; a.fillRect(box[0] - 12, A.mallet.py - 10, 12, 20); }
  // the drain grate (closed) — the sprite pass slides it open
  if (A.pit) {
    const g = a.createRadialGradient(A.pit.x, A.pit.y, A.pit.r * 0.8, A.pit.x, A.pit.y, A.pit.r * 1.9); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    a.fillStyle = g; a.beginPath(); a.arc(A.pit.x, A.pit.y, A.pit.r * 1.9, 0, 7); a.fill();
    r.fillStyle = botsGrey(0.35); r.beginPath(); r.arc(A.pit.x, A.pit.y, A.pit.r * 1.6, 0, 7); r.fill();
  }
  // the fryer: vats along the top and bottom walls + baskets' landing rings
  if (isFry) {
    for (const k of A.baskets) { a.strokeStyle = 'rgba(255,140,40,0.35)'; a.lineWidth = 2; a.beginPath(); a.arc(k.x, k.y, k.r, 0, 7); a.stroke(); }
    for (let x = fx0 + 20; x < fx1 - 20; x += 60) { a.fillStyle = '#2a2d31'; a.fillRect(x, 10, 46, 24); a.fillStyle = '#d97a1e'; a.fillRect(x + 3, 13, 40, 18); a.fillStyle = '#2a2d31'; a.fillRect(x, 326, 46, 24); a.fillStyle = '#d97a1e'; a.fillRect(x + 3, 329, 40, 18); }
  }
  // the sump: pipe mouths in the walls, waterline stains
  if (isSump) {
    for (const [px, py] of [[fx0 + 6, 120], [fx0 + 6, 240], [fx1 - 6, 120], [fx1 - 6, 240], [200, fy0 + 6], [440, fy1 - 6]]) { a.fillStyle = '#05070a'; a.beginPath(); a.arc(px, py, 9, 0, 7); a.fill(); a.strokeStyle = '#3a4a56'; a.lineWidth = 2; a.beginPath(); a.arc(px, py, 9, 0, 7); a.stroke(); }
    a.fillStyle = 'rgba(60,90,110,0.18)'; a.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
  }
  const ncv = botsHeightToNormal(hcv, (() => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, Hh); return c; })(), 2.2);
  return { w: W, h: Hh, albedo: acv, normal: ncv, rough: rcv };
}

// ---- WebGL: the renderer -------------------------------------------------------------
// One lighting model shared by the floor and the sprites (GLSL string below),
// one sprite program for everything that is a quad (bots, props, particles,
// decal stamps), one floor program, and the post chain. WebGL2 gets 16 lights,
// WebGL1 8 — the loop bound is a #define so GLSL ES 1.0 stays constant-bounded.
function botsShaderLighting(N) {
  return `
uniform int uNumLights;
uniform vec4 uLightPos[${N}];
uniform vec3 uLightCol[${N}];
uniform vec3 uAmbient;
vec3 botsShade(vec3 albedo, vec3 n, vec2 p, float rough, float z) {
  vec3 c = albedo * uAmbient;
  for (int i = 0; i < ${N}; i++) {
    if (i >= uNumLights) break;
    vec4 lp = uLightPos[i];
    vec3 L = vec3(lp.xy - p, lp.z - z);
    float d = length(L);
    float att = clamp(1.0 - d / lp.w, 0.0, 1.0);
    att *= att;
    if (att <= 0.0) continue;
    vec3 Ln = L / d;
    float diff = max(dot(n, Ln), 0.0);
    vec3 Hv = normalize(Ln + vec3(0.0, 0.0, 1.0));
    float sp = pow(max(dot(n, Hv), 0.0), mix(48.0, 6.0, rough)) * (1.0 - rough) * 0.7;
    c += uLightCol[i] * att * (albedo * diff + vec3(sp));
  }
  return c;
}`;
}

const BOTS_VS_FLOOR = `
attribute vec2 aPos; attribute vec2 aUV;
uniform vec4 uView;
varying vec2 vUV; varying vec2 vP;
void main() { vUV = aUV; vP = aPos; gl_Position = vec4(aPos.x * uView.x + uView.z, aPos.y * uView.y + uView.w, 0.0, 1.0); }`;

function botsFsFloor(N) {
  return `precision mediump float;
varying vec2 vUV; varying vec2 vP;
uniform sampler2D uAlbedo, uNormal, uRough, uDecal;
uniform float uWater, uTime, uStorm;
${botsShaderLighting(N)}
void main() {
  vec3 alb = texture2D(uAlbedo, vUV).rgb;
  vec4 dec = texture2D(uDecal, vUV);
  alb = mix(alb, dec.rgb, dec.a);
  vec3 nm = texture2D(uNormal, vUV).xyz * 2.0 - 1.0;
  vec3 n = normalize(vec3(nm.x, -nm.y, nm.z));
  float rough = texture2D(uRough, vUV).r;
  // the flood: the floor goes glossy and blue-black, ripples steal the normal
  if (uWater > 0.001) {
    float w = clamp(uWater, 0.0, 1.0);
    vec2 rp = vP * 0.11 + vec2(uTime * 0.7, uTime * 0.4);
    vec3 rip = normalize(vec3(sin(rp.x * 3.1 + sin(rp.y * 2.3)) * 0.18 * w, cos(rp.y * 2.7 + rp.x) * 0.18 * w, 1.0));
    n = normalize(mix(n, rip, w * 0.85));
    alb = mix(alb, alb * vec3(0.35, 0.5, 0.65), w * 0.8);
    rough = mix(rough, 0.08, w);
  }
  vec3 c = botsShade(alb, n, vP, rough, 0.0);
  // the storm passes under the grating: gold from below, two seconds, nobody hurt
  if (uStorm > 0.0) {
    float d = length(vP - vec2(320.0, 180.0));
    c += vec3(1.0, 0.78, 0.3) * uStorm * (0.35 + 0.25 * sin(d * 0.08 - uTime * 6.0)) * clamp(1.0 - d / 380.0, 0.0, 1.0);
  }
  gl_FragColor = vec4(c, 1.0);
}`;
}

// Sprites: aPos world, aUV atlas, aTint (rgb = PAINT tint, a = alpha),
// aExt = (rotation, lit 0/1, z height, maskOn 0/1).
const BOTS_VS_SPRITE = `
attribute vec2 aPos; attribute vec2 aUV; attribute vec4 aTint; attribute vec4 aExt;
uniform vec4 uView;
varying vec2 vUV; varying vec4 vTint; varying vec4 vExt; varying vec2 vP;
void main() { vUV = aUV; vTint = aTint; vExt = aExt; vP = aPos; gl_Position = vec4(aPos.x * uView.x + uView.z, aPos.y * uView.y + uView.w, 0.0, 1.0); }`;

function botsFsSprite(N) {
  return `precision mediump float;
varying vec2 vUV; varying vec4 vTint; varying vec4 vExt; varying vec2 vP;
uniform sampler2D uAlbedo, uNormal, uMask;
${botsShaderLighting(N)}
void main() {
  vec4 alb = texture2D(uAlbedo, vUV);           // premultiplied
  if (alb.a <= 0.002) discard;
  float mk = texture2D(uMask, vUV).r * vExt.w;
  // the PAINT: the render is near-white there; multiply by the sauce
  alb.rgb = mix(alb.rgb, alb.rgb * vTint.rgb * 1.15, mk);
  vec3 c;
  if (vExt.y > 0.5) {
    vec3 nm = texture2D(uNormal, vUV).xyz * 2.0 - 1.0;
    float cs = cos(vExt.x), sn = sin(vExt.x);
    // image-up is local −y; rotate into world (y down)
    vec3 n = normalize(vec3(nm.x * cs + nm.y * sn, nm.x * sn - nm.y * cs, nm.z));
    c = botsShade(alb.rgb, n, vP, 0.55, vExt.z);
  } else {
    c = alb.rgb * vTint.rgb;
  }
  gl_FragColor = vec4(c * vTint.a, alb.a * vTint.a);
}`;
}

const BOTS_VS_POST = `attribute vec2 aPos; varying vec2 vUV; void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const BOTS_FS_BRIGHT = `precision mediump float; varying vec2 vUV; uniform sampler2D uTex;
void main() { vec3 c = texture2D(uTex, vUV).rgb; float l = dot(c, vec3(0.299, 0.587, 0.114)); gl_FragColor = vec4(c * smoothstep(0.62, 0.9, l), 1.0); }`;
const BOTS_FS_BLUR = `precision mediump float; varying vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir;
void main() { vec3 c = texture2D(uTex, vUV).rgb * 0.227;
  c += (texture2D(uTex, vUV + uDir * 1.385).rgb + texture2D(uTex, vUV - uDir * 1.385).rgb) * 0.316;
  c += (texture2D(uTex, vUV + uDir * 3.231).rgb + texture2D(uTex, vUV - uDir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(c, 1.0); }`;
const BOTS_FS_COMPOSITE = `precision mediump float; varying vec2 vUV; uniform sampler2D uScene, uBloom; uniform float uBloomK, uChroma, uFlash, uVig;
void main() {
  vec2 d = (vUV - 0.5) * uChroma;
  vec3 c = vec3(texture2D(uScene, vUV + d).r, texture2D(uScene, vUV).g, texture2D(uScene, vUV - d).b);
  vec3 b = texture2D(uBloom, vUV).rgb;
  c += b * uBloomK;
  float v = 1.0 - uVig * dot(vUV - 0.5, vUV - 0.5) * 2.2;
  c *= v;
  c = mix(c, vec3(1.0), uFlash);
  gl_FragColor = vec4(c, 1.0);
}`;

function botsCompile(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('bots shader:', gl.getShaderInfoLog(s)); gl.deleteShader(s); return null; }
    return s;
  };
  const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('bots link:', gl.getProgramInfoLog(p)); return null; }
  const P = { p, a: {}, u: {} };
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) { const info = gl.getActiveAttrib(p, i); P.a[info.name] = gl.getAttribLocation(p, info.name); }
  const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < nu; i++) { const info = gl.getActiveUniform(p, i); const nm = info.name.replace(/\[0\]$/, ''); P.u[nm] = gl.getUniformLocation(p, info.name); }
  return P;
}

function botsTexture(gl, src, opts) {
  opts = opts || {};
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!opts.premul);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, opts.w || 1, opts.h || 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.nearest ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.nearest ? gl.NEAREST : gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  return t;
}

function botsFbo(gl, w, h) {
  const tex = botsTexture(gl, null, { w, h });
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); return null; }
  return { fb, tex, w, h };
}

function botsInitGL() {
  const cv = bots.glcv;
  const attrs = { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  let gl = null, gl2 = false;
  try { gl = cv.getContext('webgl2', attrs); gl2 = !!gl; } catch (e) { gl = null; }
  if (!gl) { try { gl = cv.getContext('webgl', attrs) || cv.getContext('experimental-webgl', attrs); } catch (e) { gl = null; } }
  if (!gl) return false;
  bots.gl = gl; bots.gl2 = gl2;
  const N = gl2 ? 16 : 8;
  bots.prog.floor = botsCompile(gl, BOTS_VS_FLOOR, botsFsFloor(N));
  bots.prog.sprite = botsCompile(gl, BOTS_VS_SPRITE, botsFsSprite(N));
  bots.prog.bright = botsCompile(gl, BOTS_VS_POST, BOTS_FS_BRIGHT);
  bots.prog.blur = botsCompile(gl, BOTS_VS_POST, BOTS_FS_BLUR);
  bots.prog.comp = botsCompile(gl, BOTS_VS_POST, BOTS_FS_COMPOSITE);
  if (!bots.prog.floor || !bots.prog.sprite || !bots.prog.comp) return false;
  bots.N = N;
  // buffers: a fullscreen quad, the floor quad, the dynamic sprite stream + quad indices
  bots.buf.post = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bots.buf.post);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  bots.buf.floor = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bots.buf.floor);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 0, BOTS_W, 0, 1, 0, 0, BOTS_H, 0, 1, BOTS_W, BOTS_H, 1, 1]), gl.STATIC_DRAW);
  bots.buf.sprite = gl.createBuffer();
  bots.vdata = new Float32Array(BOTS_MAX_QUADS * 4 * 12);
  const idx = new Uint16Array(Math.min(BOTS_MAX_QUADS, 16000) * 6);
  for (let q = 0, v = 0; q < idx.length / 6; q++, v += 4) { idx[q * 6] = v; idx[q * 6 + 1] = v + 1; idx[q * 6 + 2] = v + 2; idx[q * 6 + 3] = v; idx[q * 6 + 4] = v + 2; idx[q * 6 + 5] = v + 3; }
  bots.buf.idx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bots.buf.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  bots.maxQuads = idx.length / 6;
  // the procedural pages go up first; Blender's replace them when they land
  bots.proc = botsMakeProceduralAtlas();
  botsUploadAtlas(bots.proc);
  botsUploadFloor(botsMakeProceduralFloor(bots.arena), bots.arena, false);
  bots.tex.black = botsTexture(gl, null, { w: 1, h: 1 });
  return true;
}

function botsUploadAtlas(atlas) {
  const gl = bots.gl;
  for (const k of ['albedo', 'normal', 'mask']) { if (bots.tex[k]) gl.deleteTexture(bots.tex[k]); }
  bots.tex.albedo = botsTexture(gl, atlas.albedo, { premul: true });
  bots.tex.normal = botsTexture(gl, atlas.normal, {});
  bots.tex.mask = botsTexture(gl, atlas.mask, {});
  bots.art.R = atlas.R; bots.art.W = atlas.W; bots.art.H = atlas.H;
}
function botsUploadFloor(fl, arena, fromArt) {
  const gl = bots.gl;
  for (const k of ['fAlbedo', 'fNormal', 'fRough']) { if (bots.tex[k]) gl.deleteTexture(bots.tex[k]); }
  bots.tex.fAlbedo = botsTexture(gl, fl.albedo, {});
  bots.tex.fNormal = botsTexture(gl, fl.normal, {});
  bots.tex.fRough = botsTexture(gl, fl.rough, {});
  bots.art.floorArena = arena; bots.art.floorReady = !!fromArt;
}

function botsMakeDecalFbo() {
  const gl = bots.gl; if (!gl) return;
  if (bots.fbo.decal) { gl.deleteFramebuffer(bots.fbo.decal.fb); gl.deleteTexture(bots.fbo.decal.tex); }
  bots.fbo.decal = botsFbo(gl, bots.decalW, bots.decalH);
  bots.decalClear = true;
}

function botsLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  bots.dpr = Math.min(window.devicePixelRatio || 1, bots.dprCap || 2);
  bots.W = Math.max(2, Math.round(vw * bots.dpr * bots.rs));
  bots.Hh = Math.max(2, Math.round(vh * bots.dpr * bots.rs));
  if (bots.glcv && (bots.glcv.width !== bots.W || bots.glcv.height !== bots.Hh)) {
    bots.glcv.width = bots.W; bots.glcv.height = bots.Hh;
    const gl = bots.gl;
    if (gl) {
      for (const k of ['scene', 'bloomA', 'bloomB']) if (bots.fbo[k]) { gl.deleteFramebuffer(bots.fbo[k].fb); gl.deleteTexture(bots.fbo[k].tex); bots.fbo[k] = null; }
      bots.fbo.scene = botsFbo(gl, bots.W, bots.Hh);
      const bw = Math.max(2, Math.round(bots.W / 4)), bh = Math.max(2, Math.round(bots.Hh / 4));
      bots.fbo.bloomA = botsFbo(gl, bw, bh); bots.fbo.bloomB = botsFbo(gl, bw, bh);
      if (!bots.fbo.scene || !bots.fbo.bloomA || !bots.fbo.bloomB) { bots.fbo.scene = null; }
    }
  }
  if (bots.uicv) { bots.uicv.width = Math.round(vw * bots.dpr); bots.uicv.height = Math.round(vh * bots.dpr); }
  bots.k = Math.min(bots.W / BOTS_W, bots.Hh / BOTS_H);
}

// world → screen (device px of the GL canvas) and back
function botsToScreen(x, y) {
  const k = bots.k * bots.zoom;
  const sh = botsShake();
  return [(x - bots.cx) * k + bots.W / 2 + sh[0], (y - bots.cy) * k + bots.Hh / 2 + sh[1]];
}
function botsToWorld(sx, sy) { // sx, sy in CSS px
  const k = bots.k * bots.zoom / (bots.dpr * bots.rs);
  return [(sx - window.innerWidth / 2) / k + bots.cx, (sy - window.innerHeight / 2) / k + bots.cy];
}
function botsShake() {
  if (typeof ArcadeKit === 'undefined') return [0, 0];
  const s = ArcadeKit.shakeXY();
  return [s.x * bots.dpr * bots.rs, s.y * bots.dpr * bots.rs];
}
function botsViewUniform(P) {
  const gl = bots.gl;
  const k = bots.k * bots.zoom, sh = botsShake();
  const ox = -bots.cx * k + bots.W / 2 + sh[0], oy = -bots.cy * k + bots.Hh / 2 + sh[1];
  gl.uniform4f(P.u.uView, k * 2 / bots.W, -k * 2 / bots.Hh, ox * 2 / bots.W - 1, 1 - oy * 2 / bots.Hh);
}

// ---- the sprite stream ------------------------------------------------------------------
// push(list, name, x, y, rot, scale, tint, alpha, lit, z, mask). Quads are
// pushed into per-blend lists and flushed in order: shadows (multiply-ish
// alpha), lit sprites, then additive glow. Rotation is the DRAW rotation
// (heading + π/2 for nose-up sprites); the shader rotates the normal to match.
function botsPush(list, name, x, y, rot, sx, sy, tint, alpha, lit, z, mask, uvSub) {
  const R = bots.art.R[name] || bots.proc.R[name];
  if (!R) return;
  const W = bots.art.W || 1024, Hh = bots.art.H || 1024;
  let u0 = R[0] / W, v0 = R[1] / Hh, u1 = (R[0] + R[2]) / W, v1 = (R[1] + R[3]) / Hh;
  if (uvSub) { const du = u1 - u0, dv = v1 - v0; u1 = u0 + du * uvSub[2]; v1 = v0 + dv * uvSub[3]; u0 += du * uvSub[0]; v0 += dv * uvSub[1]; }
  const hw = (R[2] / BOTS_PPU) * 0.5 * sx * (uvSub ? uvSub[2] : 1), hh = (R[3] / BOTS_PPU) * 0.5 * sy * (uvSub ? uvSub[3] : 1);
  const c = Math.cos(rot), s = Math.sin(rot);
  list.push({ x, y, c, s, hw, hh, u0, v0, u1, v1, r: tint[0], g: tint[1], b: tint[2], a: alpha == null ? 1 : alpha, rot, lit: lit ? 1 : 0, z: z || 0, mk: mask ? 1 : 0 });
}

function botsFlush(list, additive) {
  const gl = bots.gl, P = bots.prog.sprite;
  if (!list.length) return;
  const vd = bots.vdata;
  let n = Math.min(list.length, bots.maxQuads);
  let o = 0;
  for (let i = 0; i < n; i++) {
    const q = list[i];
    const corners = [[-q.hw, -q.hh, q.u0, q.v0], [q.hw, -q.hh, q.u1, q.v0], [q.hw, q.hh, q.u1, q.v1], [-q.hw, q.hh, q.u0, q.v1]];
    for (const [lx, ly, u, v] of corners) {
      vd[o++] = q.x + lx * q.c - ly * q.s; vd[o++] = q.y + lx * q.s + ly * q.c;
      vd[o++] = u; vd[o++] = v;
      vd[o++] = q.r; vd[o++] = q.g; vd[o++] = q.b; vd[o++] = q.a;
      vd[o++] = q.rot; vd[o++] = q.lit; vd[o++] = q.z; vd[o++] = q.mk;
    }
  }
  gl.useProgram(P.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, bots.buf.sprite);
  gl.bufferData(gl.ARRAY_BUFFER, vd.subarray(0, o), gl.DYNAMIC_DRAW);
  const stride = 12 * 4;
  gl.enableVertexAttribArray(P.a.aPos); gl.vertexAttribPointer(P.a.aPos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(P.a.aUV); gl.vertexAttribPointer(P.a.aUV, 2, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(P.a.aTint); gl.vertexAttribPointer(P.a.aTint, 4, gl.FLOAT, false, stride, 16);
  gl.enableVertexAttribArray(P.a.aExt); gl.vertexAttribPointer(P.a.aExt, 4, gl.FLOAT, false, stride, 32);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bots.buf.idx);
  if (additive) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_SHORT, 0);
  list.length = 0;
}

function botsBindSpriteProgram(lights) {
  const gl = bots.gl, P = bots.prog.sprite;
  gl.useProgram(P.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bots.tex.albedo); gl.uniform1i(P.u.uAlbedo, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bots.tex.normal); gl.uniform1i(P.u.uNormal, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, bots.tex.mask); gl.uniform1i(P.u.uMask, 2);
  botsViewUniform(P);
  botsLightUniforms(P, lights);
}

// ---- lights -----------------------------------------------------------------------------------
// Fixtures first (the four clamp lamps, one flickering), then the frame's
// transient lights (muzzle flashes, sparks, fire, booms, nitro, headlights in
// the flood), nearest-brightest kept up to the tier's cap — the hall's rule.
function botsBuildLights() {
  const m = bots.m; const A = BotsSim.ARENAS[bots.arena];
  const out = [];
  const flood = m ? m.hz.water : 0;
  const dim = 1 - 0.85 * Math.max(0, flood - 0.5) * 2;
  A.lamps.forEach((L, i) => {
    let f = 1;
    if (i === 1) f = 0.78 + 0.22 * (Math.sin(bots.t * 13) > 0.6 ? 1 : (Math.sin(bots.t * 7.3) * 0.5 + 0.5)); // the one that flickers
    const warm = bots.arena === 'fryer' ? [0.85, 0.95, 1.0] : [1.0, 0.86, 0.62];
    out.push({ x: L[0], y: L[1], h: 62, r: 300, c: warm.map((v) => v * 0.95 * f * dim), w: 10 });
  });
  for (const f of bots.fx.flashes) {
    const k = f.t / f.T; // 1 → 0
    out.push({ x: f.x, y: f.y, h: f.h || 10, r: f.r * (0.6 + 0.4 * k), c: f.c.map((v) => v * f.i * k), w: 5 * f.i * k });
  }
  if (m) {
    for (const b of m.bots) {
      if (!b.alive) continue;
      if (b.burn > 0) out.push({ x: b.x, y: b.y, h: 8, r: 90, c: [1.0, 0.5, 0.15].map((v) => v * (0.8 + 0.2 * Math.sin(bots.t * 27 + b.seat))), w: 3 });
      if (b.boostT > 0) out.push({ x: b.x - Math.cos(b.a) * 16, y: b.y - Math.sin(b.a) * 16, h: 6, r: 70, c: [1.0, 0.35, 0.2], w: 2.5 });
      if (flood > 0.5) out.push({ x: b.x + Math.cos(b.a) * 18, y: b.y + Math.sin(b.a) * 18, h: 6, r: 110, c: [0.9, 0.9, 0.75].map((v) => v * (flood - 0.5) * 2), w: 4 });
      if (b.cls === 'dicer' && b.spin > 0.6) out.push({ x: b.x + Math.cos(b.a) * 16, y: b.y + Math.sin(b.a) * 16, h: 4, r: 40, c: [0.7, 0.8, 1.0].map((v) => v * (b.spin - 0.6) * 1.2), w: 1 });
    }
    for (const s of m.shots) {
      const Wp = BotsSim.WEAPONS[s.w];
      if (Wp.flame) out.push({ x: s.x, y: s.y, h: 5, r: 50, c: [1.0, 0.55, 0.2].map((v) => v * 0.7), w: 1.5 });
      else if (s.w === 'rocket') out.push({ x: s.x, y: s.y, h: 6, r: 60, c: [1.0, 0.4, 0.15], w: 2 });
      else if (s.w === 'minigun') out.push({ x: s.x, y: s.y, h: 4, r: 26, c: [1.0, 0.85, 0.3].map((v) => v * 0.5), w: 0.5 });
    }
  }
  out.sort((p, q) => q.w - p.w);
  return out.slice(0, bots.lightsMax);
}
function botsLightUniforms(P, lights) {
  const gl = bots.gl, N = bots.N;
  const pos = new Float32Array(N * 4), col = new Float32Array(N * 3);
  for (let i = 0; i < Math.min(N, lights.length); i++) { const L = lights[i]; pos[i * 4] = L.x; pos[i * 4 + 1] = L.y; pos[i * 4 + 2] = L.h; pos[i * 4 + 3] = L.r; col[i * 3] = L.c[0]; col[i * 3 + 1] = L.c[1]; col[i * 3 + 2] = L.c[2]; }
  gl.uniform1i(P.u.uNumLights, Math.min(N, lights.length));
  gl.uniform4fv(P.u.uLightPos, pos); gl.uniform3fv(P.u.uLightCol, col);
  const m = bots.m; const flood = m ? m.hz.water : 0;
  const amb = bots.arena === 'fryer' ? [0.22, 0.24, 0.27] : bots.arena === 'sump' ? [0.12, 0.15, 0.19] : [0.17, 0.18, 0.21];
  const dim = 1 - 0.9 * Math.max(0, flood - 0.5) * 2;
  gl.uniform3f(P.u.uAmbient, amb[0] * dim + 0.02, amb[1] * dim + 0.02, amb[2] * dim + 0.03);
}

// ---- particles + decals ---------------------------------------------------------------------
// One array of plain objects. kind decides the sprite and the blend; particles
// that "land" (crumbs, plates) stamp themselves into the decal layer and leave.
function botsSpawn(kind, x, y, n, opts) {
  const P = bots.fx.parts; opts = opts || {};
  if (P.length > bots.partsMax) return;
  const rnd = Math.random;
  for (let i = 0; i < n; i++) {
    const ang = opts.a != null ? opts.a + (rnd() - 0.5) * (opts.spread || 0.6) : rnd() * Math.PI * 2;
    const spd = (opts.spd || 60) * (0.4 + rnd() * 0.9);
    const p = { kind, x, y, z: opts.z || 0, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, vz: opts.vz != null ? opts.vz * (0.5 + rnd()) : 0, life: 1, T: (opts.life || 0.6) * (0.6 + rnd() * 0.8), s: opts.s || 1, rot: rnd() * 7, vr: (rnd() - 0.5) * 8, v: Math.floor(rnd() * 4), col: opts.col || null };
    p.T0 = p.T;
    P.push(p);
  }
}
function botsStepParts(dt) {
  const P = bots.fx.parts; const box = BotsSim.ARENAS[bots.arena].box;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.T -= dt;
    if (p.T <= 0) { P.splice(i, 1); continue; }
    p.life = p.T / p.T0;
    if (p.kind === 'spark' || p.kind === 'crumb' || p.kind === 'plate' || p.kind === 'shell') {
      p.vz -= 260 * dt; p.z += p.vz * dt;
      if (p.z <= 0) {
        p.z = 0; p.vz = -p.vz * 0.35; p.vx *= 0.6; p.vy *= 0.6;
        if (Math.abs(p.vz) < 20) {
          // landed: crumbs and plates stay on the floor for the round
          if (p.kind === 'crumb') bots.decalQ.push({ name: 'p_crumb_' + p.v, x: p.x, y: p.y, rot: p.rot, s: p.s, a: 0.95 });
          if (p.kind === 'plate') bots.decalQ.push({ name: 'p_plate_' + (p.v % 3), x: p.x, y: p.y, rot: p.rot, s: p.s, a: 1 });
          if (p.kind === 'shell') bots.decalQ.push({ name: 'shell', x: p.x, y: p.y, rot: 0, s: 0.6, a: 0.8 });
          if (p.kind !== 'spark') { P.splice(i, 1); continue; }
          p.vx = p.vy = 0;
        }
      }
      p.vx *= Math.exp(-1.2 * dt); p.vy *= Math.exp(-1.2 * dt);
    } else if (p.kind === 'smoke') { p.vx *= Math.exp(-1.5 * dt); p.vy *= Math.exp(-1.5 * dt); p.vy -= 12 * dt; p.s += dt * 1.6; }
    else if (p.kind === 'fire') { p.vy -= 30 * dt; p.vx *= Math.exp(-2 * dt); p.s *= Math.exp(-0.6 * dt); }
    else if (p.kind === 'splash') { p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt); }
    else if (p.kind === 'ring') { p.s += dt * (p.col ? 3.2 : 2.4); }
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.kind !== 'smoke' && p.kind !== 'ring' && (p.x < box[0] || p.x > box[2] || p.y < box[1] || p.y > box[3])) { p.x = Math.max(box[0], Math.min(box[2], p.x)); p.y = Math.max(box[1], Math.min(box[3], p.y)); p.vx *= -0.4; p.vy *= -0.4; }
  }
  for (let i = bots.fx.flashes.length - 1; i >= 0; i--) { const f = bots.fx.flashes[i]; f.t -= dt; if (f.t <= 0) bots.fx.flashes.splice(i, 1); }
}
function botsFlash(x, y, c, r, i, T, h) { if (bots.fx.flashes.length < 40) bots.fx.flashes.push({ x, y, c, r, i, T, t: T, h }); }

function botsDrawParts(lit, glow) {
  for (const p of bots.fx.parts) {
    const a = p.life;
    switch (p.kind) {
      case 'spark': botsPush(glow, 'p_spark', p.x, p.y - p.z * 0.5, 0, p.s * (0.7 + a), p.s * (0.7 + a), p.col || [1, 0.85, 0.5], a, false, 0, false); break;
      case 'crumb': botsPush(lit, 'p_crumb_' + p.v, p.x, p.y - p.z * 0.6, p.rot, p.s, p.s, [1, 1, 1], 1, true, p.z, false); break;
      case 'plate': botsPush(lit, 'p_plate_' + (p.v % 3), p.x, p.y - p.z * 0.6, p.rot, p.s, p.s, [1, 1, 1], 1, true, p.z, false); break;
      case 'shell': botsPush(lit, 'shell', p.x, p.y - p.z * 0.6, 0, 0.5, 0.5, [1, 1, 1], 1, true, p.z, false); break;
      case 'smoke': botsPush(lit, 'p_smoke', p.x, p.y, p.rot, p.s, p.s, p.col || [0.55, 0.55, 0.6], a * 0.7, false, 0, false); break;
      case 'fire': botsPush(glow, 'p_fire_' + (Math.floor((1 - a) * 3) % 3), p.x, p.y, p.rot * 0.2, p.s, p.s * (0.8 + 0.6 * (1 - a)), p.col || [1, 0.8, 0.6], a, false, 0, false); break;
      case 'splash': botsPush(lit, 'shell', p.x, p.y, 0, p.s, p.s, p.col || [0.9, 0.93, 0.95], a, false, 0, false); break;
      case 'ring': botsPush(glow, 'ring', p.x, p.y, 0, p.s, p.s, p.col || [1, 0.9, 0.6], a * 0.9, false, 0, true); break;
      case 'ghost': botsPush(glow, 'glow', p.x, p.y, 0, p.s, p.s, p.col || [1, 1, 1], a * 0.6, false, 0, false); break;
    }
  }
}

// Stamp queued decals into the persistent floor layer (world space → decal uv).
function botsStampDecals() {
  const gl = bots.gl, D = bots.fbo.decal;
  if (!D) { bots.decalQ.length = 0; return; }
  if (!bots.decalClear && !bots.decalQ.length) return;
  gl.bindFramebuffer(gl.FRAMEBUFFER, D.fb);
  gl.viewport(0, 0, D.w, D.h);
  if (bots.decalClear) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); bots.decalClear = false; }
  if (bots.decalQ.length) {
    const P = bots.prog.sprite;
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bots.tex.albedo); gl.uniform1i(P.u.uAlbedo, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bots.tex.normal); gl.uniform1i(P.u.uNormal, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, bots.tex.mask); gl.uniform1i(P.u.uMask, 2);
    // decal space: world (0..640, 0..360) → clip, y NOT flipped (texture row 0 = world top when sampled with v = y/360)
    gl.uniform4f(P.u.uView, 2 / BOTS_W, 2 / BOTS_H, -1, -1);
    gl.uniform1i(P.u.uNumLights, 0); gl.uniform3f(P.u.uAmbient, 1, 1, 1);
    const list = [];
    for (const d of bots.decalQ) botsPush(list, d.name, d.x, d.y, d.rot, d.s, d.s, d.tint || [1, 1, 1], d.a, false, 0, false);
    bots.decalQ.length = 0;
    gl.enable(gl.BLEND);
    botsFlush(list, false);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// ---- audio ------------------------------------------------------------------------------------
// WebAudio synth, nothing sampled. Created on the first real input so browsers
// don't sulk. Every sound is short; the crowd is filtered noise that swells.
function botsAudio() {
  const S = bots.sfx;
  if (S.ctx) return S.ctx;
  try {
    S.ctx = new (window.AudioContext || window.webkitAudioContext)();
    S.master = S.ctx.createGain(); S.master.gain.value = 0.55; S.master.connect(S.ctx.destination);
    const len = S.ctx.sampleRate * 1.2; const buf = S.ctx.createBuffer(1, len, S.ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    S.noise = buf;
  } catch (e) { S.ctx = null; }
  return S.ctx;
}
function botsSfx(kind, o) {
  const S = bots.sfx; const ctx = S.ctx; if (!ctx || S.muted) return;
  o = o || {};
  const t = ctx.currentTime;
  const gain = (v, T, shape) => { const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + T); g.connect(S.master); return g; };
  const tone = (type, f0, f1, v, T) => { const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + T); osc.connect(gain(v, T)); osc.start(t); osc.stop(t + T + 0.02); };
  const noise = (v, T, f, q, type) => { const src = ctx.createBufferSource(); src.buffer = S.noise; const flt = ctx.createBiquadFilter(); flt.type = type || 'bandpass'; flt.frequency.value = f; flt.Q.value = q || 1; src.connect(flt); flt.connect(gain(v, T)); src.start(t); src.stop(t + T + 0.02); };
  switch (kind) {
    case 'minigun': tone('square', 900, 300, 0.05, 0.05); noise(0.05, 0.05, 3000, 0.8); break;
    case 'flamer': noise(0.03, 0.09, 900, 0.5, 'lowpass'); break;
    case 'mortar': tone('sine', 220, 90, 0.12, 0.25); noise(0.06, 0.15, 500, 0.7); break;
    case 'rocket': noise(0.12, 0.5, 1200, 0.6); tone('sawtooth', 200, 700, 0.06, 0.4); break;
    case 'emp': tone('sine', 1400, 60, 0.18, 0.6); tone('triangle', 60, 1400, 0.1, 0.5); break;
    case 'spark': noise(0.09, 0.08, 4200, 2); tone('triangle', 2400, 1200, 0.03, 0.06); break;
    case 'bigspark': noise(0.18, 0.22, 3200, 1.2); tone('square', 380, 90, 0.12, 0.18); break;
    case 'wall': noise(0.12, 0.12, 400, 0.8, 'lowpass'); tone('sine', 120, 50, 0.16, 0.16); break;
    case 'boom': noise(0.32, 0.55, 220, 0.5, 'lowpass'); tone('sine', 90, 30, 0.35, 0.5); break;
    case 'ko': noise(0.35, 0.9, 300, 0.5, 'lowpass'); tone('sawtooth', 160, 25, 0.25, 0.7); botsSfx('crowd', { v: 0.25 }); break;
    case 'pit': tone('sine', 400, 40, 0.2, 0.9); noise(0.15, 0.7, 600, 0.6, 'lowpass'); break;
    case 'flip': noise(0.14, 0.18, 1800, 0.7); tone('sine', 300, 900, 0.08, 0.15); break;
    case 'shove': noise(0.1, 0.25, 250, 0.6, 'lowpass'); tone('sawtooth', 70, 140, 0.1, 0.3); break;
    case 'slam': noise(0.3, 0.3, 180, 0.6, 'lowpass'); tone('sine', 70, 28, 0.35, 0.35); break;
    case 'slice': noise(0.1, 0.12, 2500, 1.5); tone('square', 1500, 500, 0.04, 0.1); break;
    case 'pickup': tone('sine', 660, 990, 0.1, 0.12); tone('sine', 990, 1320, 0.08, 0.16); break;
    case 'boost': noise(0.1, 0.4, 1600, 0.5, 'highpass'); tone('sawtooth', 120, 420, 0.08, 0.35); break;
    case 'beep': tone('square', o.f || 660, o.f || 660, 0.1, 0.09); break;
    case 'horn': tone('sawtooth', 330, 320, 0.22, 0.6); tone('sawtooth', 415, 405, 0.18, 0.6); break;
    case 'crowd': { const v = o.v || 0.18; const src = ctx.createBufferSource(); src.buffer = S.noise; src.loop = true; const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 700; flt.Q.value = 0.4; const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); src.connect(flt); flt.connect(g); g.connect(S.master); src.start(t); src.stop(t + 1.7); break; }
    case 'stun': tone('square', 200, 180, 0.06, 0.4); break;
    case 'land': noise(0.16, 0.14, 500, 0.7, 'lowpass'); break;
    case 'splash': noise(0.12, 0.3, 900, 0.5, 'lowpass'); break;
    case 'storm': tone('sine', 40, 55, 0.3, 2.4); noise(0.08, 2.2, 160, 0.4, 'lowpass'); break;
  }
}

// ---- events → effects ---------------------------------------------------------------------------
// The sim says WHAT happened; this decides how it looks and sounds. Every
// sim event is a plain object with k = kind and a position where it matters.
function botsTeam(bot) { const T = BotsSim.TEAMS[bot ? bot.team : 0]; const h = T.hex; return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]; }
function botsName(id) { const b = bots.m && BotsSim.botById(bots.m, id); return b ? b.name : '?'; }
function botsIsMe(id) { return id === bots.me; }

function botsHandleEvents(evs) {
  const m = bots.m; if (!m) return;
  for (const e of evs) {
    switch (e.k) {
      case 'shot': {
        const Wp = BotsSim.WEAPONS[e.w];
        botsFlash(e.x, e.y, Wp.col, e.w === 'rocket' ? 90 : e.w === 'mortar' ? 40 : 55, e.w === 'minigun' ? 0.9 : 1.3, 0.08, 10);
        if (e.w === 'minigun') { botsSpawn('shell', e.x, e.y, 1, { spd: 40, vz: 90, life: 1.2 }); if (Math.random() < 0.5) botsSfx('minigun'); }
        else if (e.w === 'flamer') { if (Math.random() < 0.25) botsSfx('flamer'); }
        else botsSfx(e.w);
        if (e.w === 'rocket' || e.w === 'mortar') botsSpawn('smoke', e.x, e.y, 3, { spd: 20, life: 0.7, s: 0.5 });
        break; }
      case 'trail': botsSpawn('smoke', e.x, e.y, 1, { spd: 8, life: 0.6, s: 0.35, col: [0.5, 0.5, 0.55] }); botsSpawn('fire', e.x, e.y, 1, { spd: 10, life: 0.2, s: 0.4 }); break;
      case 'hit': {
        if (e.cause === 'rot' || e.cause === 'flood' || e.cause === 'burn') break;
        const v = BotsSim.botById(m, e.id);
        const n = Math.min(14, 1 + Math.round(e.dmg / 3));
        botsSpawn('crumb', e.x, e.y, n, { spd: 70, vz: 110, life: 2.2, s: 1 });
        if (e.dmg >= 8) botsSpawn('spark', e.x, e.y, Math.round(e.dmg / 3), { spd: 120, vz: 120, life: 0.35, s: 0.7 });
        if (e.dmg >= 18 && v) { botsSpawn('plate', e.x, e.y, 1 + Math.floor(e.dmg / 25), { spd: 90, vz: 150, life: 3, s: 1 }); botsFlash(e.x, e.y, [1, 0.8, 0.5], 70, 1.2, 0.15, 8); }
        if (botsIsMe(e.id) && e.dmg >= 12) { bots.fx.chroma = Math.min(0.02, 0.006 + e.dmg * 0.0004); if (typeof ArcadeKit !== 'undefined') ArcadeKit.kick(Math.min(10, 2 + e.dmg * 0.25), 220); }
        if (e.cause === 'minigun' && Math.random() < 0.3) botsSfx('spark');
        break; }
      case 'spark': botsSpawn('spark', e.x, e.y, e.n || 4, { spd: e.big ? 190 : 110, vz: e.big ? 170 : 90, life: e.big ? 0.5 : 0.3, s: e.big ? 0.9 : 0.6 }); if (e.big) { botsFlash(e.x, e.y, [1, 0.9, 0.6], 110, 1.8, 0.2, 8); botsSfx('bigspark'); if (typeof ArcadeKit !== 'undefined') ArcadeKit.kick(4, 180); } else if (Math.random() < 0.4) botsSfx('spark'); break;
      case 'spinhit': botsSpawn('spark', e.x, e.y, 18, { spd: 260, vz: 200, life: 0.6, s: 1 }); botsSpawn('smoke', e.x, e.y, 2, { spd: 30, life: 0.8, s: 0.6 }); if (typeof ArcadeKit !== 'undefined') { ArcadeKit.kick(7, 220); ArcadeKit.hitStop(50); } break;
      case 'wall': if (e.impact > 45) { botsSpawn('spark', e.x, e.y, Math.round(e.impact / 25), { spd: 90, vz: 90, life: 0.3, s: 0.6 }); botsSfx('wall'); botsDecal('skid', e.x, e.y, 0, 1.2, 0.5); } break;
      case 'skid': botsDecal('skid', e.x, e.y, e.a, 1, 0.55); break;
      case 'boom': botsSpawn('spark', e.x, e.y, 22, { spd: 220, vz: 180, life: 0.6, s: 1 }); botsSpawn('smoke', e.x, e.y, 8, { spd: 50, life: 1.4, s: 1 }); botsSpawn('fire', e.x, e.y, 10, { spd: 60, life: 0.45, s: 1.2 }); botsSpawn('ring', e.x, e.y, 1, { spd: 0, life: 0.35, s: 1 }); botsFlash(e.x, e.y, [1, 0.7, 0.35], 200, 3.2, 0.4, 12); botsDecal('scorch', e.x, e.y, Math.random() * 7, e.w === 'mortar' ? 1.2 : 1.6, 0.85); botsSfx('boom'); if (typeof ArcadeKit !== 'undefined') ArcadeKit.kick(9, 300); break;
      case 'splash': botsSpawn('splash', e.x, e.y, 14, { spd: 90, life: 0.5, s: 0.9 }); botsSfx('splash'); break;
      case 'emp': botsSpawn('ring', e.x, e.y, 1, { spd: 0, life: 0.6, s: 1.5, col: [0.75, 1, 0.35] }); botsFlash(e.x, e.y, [0.7, 1, 0.3], 240, 3.5, 0.5, 14); botsSfx('emp'); break;
      case 'stunned': botsSfx('stun'); break;
      case 'flip': botsSfx('flip'); botsSpawn('smoke', e.x, e.y, 3, { spd: 40, life: 0.5, s: 0.6, col: [0.7, 0.7, 0.75] }); botsFeed(botsName(e.by) + ' flipped ' + botsName(e.id)); break;
      case 'whiff': botsSfx('flip'); botsSpawn('smoke', e.x, e.y, 2, { spd: 30, life: 0.4, s: 0.5 }); break;
      case 'land': botsSfx('land'); botsSpawn('crumb', e.x, e.y, 8, { spd: 80, vz: 90, life: 2, s: 1 }); botsSpawn('smoke', e.x, e.y, 3, { spd: 30, life: 0.6, s: 0.6 }); if (typeof ArcadeKit !== 'undefined') ArcadeKit.kick(5, 200); break;
      case 'shove': botsSfx('shove'); botsSpawn('smoke', e.x, e.y, 4, { spd: 40, life: 0.6, s: 0.6 }); break;
      case 'shoved': botsSpawn('spark', e.x, e.y, 6, { spd: 120, vz: 100, life: 0.3, s: 0.7 }); break;
      case 'clank': botsSfx('spark'); botsSpawn('spark', e.x, e.y, 5, { spd: 100, vz: 80, life: 0.3, s: 0.6 }); break;
      case 'slice': botsSfx('slice'); break;
      case 'slam': botsSfx('slam'); botsSpawn('smoke', e.x, e.y, 6, { spd: 60, life: 0.7, s: 0.8 }); botsSpawn('crumb', e.x, e.y, 6, { spd: 100, vz: 120, life: 2, s: 1 }); botsFlash(e.x, e.y, [1, 0.9, 0.8], 120, 1.5, 0.15, 10); if (typeof ArcadeKit !== 'undefined') ArcadeKit.kick(8, 260); break;
      case 'dunk': botsSfx('boom'); botsSpawn('fire', e.x, e.y, 16, { spd: 80, life: 0.5, s: 1.3 }); botsSpawn('smoke', e.x, e.y, 8, { spd: 50, life: 1.2, s: 1 }); botsSpawn('splash', e.x, e.y, 12, { spd: 100, life: 0.5, s: 0.8, col: [1, 0.7, 0.3] }); botsFlash(e.x, e.y, [1, 0.6, 0.2], 180, 3, 0.5, 12); botsDecal('scorch', e.x, e.y, 0, 2.4, 0.5); break;
      case 'fire': botsSpawn('fire', e.x, e.y, 1, { spd: 14, life: 0.35, s: 0.8 }); if (Math.random() < 0.3) botsSpawn('smoke', e.x, e.y, 1, { spd: 10, life: 0.9, s: 0.4, col: [0.3, 0.3, 0.32] }); break;
      case 'boost': botsSfx('boost'); botsFlash(e.x, e.y, [1, 0.4, 0.2], 90, 1.5, 0.3, 8); break;
      case 'pickup': { botsSfx('pickup'); const Wp = BotsSim.WEAPONS[e.w]; botsSpawn('ring', e.x, e.y, 1, { spd: 0, life: 0.4, s: 0.8, col: Wp.col }); botsSpawn('spark', e.x, e.y, 8, { spd: 60, vz: 120, life: 0.5, s: 0.6, col: Wp.col }); if (botsIsMe(e.id)) botsFeed(Wp.icon + ' ' + Wp.name); break; }
      case 'padup': botsSpawn('ring', e.x, e.y, 1, { spd: 0, life: 0.5, s: 0.6, col: BotsSim.WEAPONS[e.w].col }); break;
      case 'ko': {
        const v = BotsSim.botById(m, e.id);
        botsSfx(e.cause === 'pit' ? 'pit' : 'ko');
        if (e.cause !== 'pit') {
          botsSpawn('spark', e.x, e.y, 40, { spd: 260, vz: 240, life: 0.8, s: 1.1 });
          botsSpawn('plate', e.x, e.y, 7, { spd: 140, vz: 220, life: 3, s: 1.1 });
          botsSpawn('crumb', e.x, e.y, 24, { spd: 160, vz: 200, life: 2.6, s: 1 });
          botsSpawn('smoke', e.x, e.y, 14, { spd: 60, life: 2.2, s: 1.3, col: [0.25, 0.25, 0.28] });
          botsSpawn('fire', e.x, e.y, 14, { spd: 70, life: 0.6, s: 1.4 });
          botsFlash(e.x, e.y, [1, 0.75, 0.4], 260, 4, 0.6, 14);
          botsDecal('scorch', e.x, e.y, Math.random() * 7, 2.2, 0.9); botsDecal('p_oil', e.x, e.y, Math.random() * 7, 2.6, 0.9);
        }
        bots.fx.crowd = 1.2;
        // the camera goes to the wreck, time thickens, the room shakes
        bots.camT = { x: e.x, y: e.y, z: 1.55, t: 0.75 }; bots.slow = 0.3; bots.hitstop = 0.09;
        if (typeof ArcadeKit !== 'undefined') ArcadeKit.kick(14, 420);
        const by = e.by ? botsName(e.by) : null;
        botsFeed(e.cause === 'pit' ? (botsName(e.id) + ' went DOWN THE DRAIN' + (by ? ' (' + by + ')' : '')) : e.cause === 'hazard' ? (botsName(e.id) + ' met the arena' + (by ? ' · ' + by : '')) : (by ? by + ' KO\'d ' + botsName(e.id) : botsName(e.id) + ' is OUT'));
        if (botsIsMe(e.id)) bots.fx.chroma = 0.03;
        if (v && v.cls === 'dicer' && e.cause !== 'pit') botsSpawn('spark', e.x, e.y, 20, { spd: 300, vz: 200, life: 1, s: 1 });
        break; }
      case 'pit': botsSpawn('splash', e.x, e.y, 10, { spd: 70, life: 0.6, s: 0.8, col: [0.5, 0.65, 0.8] }); botsSpawn('smoke', e.x, e.y, 4, { spd: 20, life: 1, s: 0.8, col: [0.4, 0.5, 0.6] }); break;
      case 'sink': botsSpawn('splash', e.x, e.y, 8, { spd: 60, life: 0.6, s: 0.7, col: [0.5, 0.65, 0.8] }); break;
      case 'go': botsAnnounce('BATTER UP!', BotsSim.ARENAS[bots.arena].name, 1.4, 'go'); botsSfx('horn'); bots.fx.crowd = 1; break;
      case 'armed': botsAnnounce('HAZARDS LIVE', 'mind the walls', 1.6, 'warn'); botsSfx('beep', { f: 440 }); break;
      case 'pitopen': botsAnnounce('THE PIT IS OPEN', 'anything that goes in is out', 1.8, 'warn'); botsSfx('beep', { f: 330 }); botsSpawn('smoke', 320, 180, 10, { spd: 40, life: 1.6, s: 1.2, col: [0.3, 0.38, 0.45] }); break;
      case 'sudden': botsAnnounce(e.flood ? 'THE FLOOD' : 'SUDDEN DEATH', e.flood ? 'the mains are coming up' : 'batter rots · nobody hides', 1.8, 'hot'); botsSfx('beep', { f: 220 }); break;
      case 'storm': bots.fx.storm = 2.4; botsSfx('storm'); break;
      case 'roundover': {
        const w = e.winner ? BotsSim.botById(m, e.winner) : null;
        botsAnnounce(e.judges ? 'JUDGES\' DECISION' : 'ROUND ' + m.roundNum, w ? w.name + (w.id === bots.me ? ' — THAT\'S YOU' : '') : 'nobody', BotsSim.OVER_SECS - 0.2, e.judges ? 'warn' : 'go');
        bots.fx.crowd = 1.5; botsSfx('crowd', { v: 0.3 });
        break; }
      case 'pitstop': break; // the boon overlay is opened by the flow code
      case 'boon': if (botsIsMe(e.id)) botsFeed('🔧 ' + (BotsSim.BOONS.find((b) => b.key === e.key) || {}).name); break;
      case 'matchover': { const w = BotsSim.botById(m, e.winner); bots.results = { winner: w, at: bots.t }; botsAnnounce(w && w.id === bots.me ? 'YOU WIN THE MATCH' : (w ? w.name + ' TAKES IT' : 'NO CONTEST'), 'CLUCKED METAL · ' + BotsSim.ARENAS[bots.arena].name, 4, 'go'); botsSfx('horn'); bots.fx.crowd = 2; break; }
      case 'round': bots.decalClear = true; bots.fx.parts.length = 0; bots.feed.length = 0; bots.countdown = 3; break;
      case 'drop': break;
      case 'empty': if (botsIsMe(e.id)) botsFeed('empty — find a pad'); break;
      case 'nitroup': if (botsIsMe(e.id)) botsFeed('⚡ nitro charged'); break;
    }
  }
}
function botsDecal(name, x, y, rot, s, a) { if (bots.decalQ.length < 400) bots.decalQ.push({ name, x, y, rot, s, a }); }
function botsAnnounce(text, sub, T, kind) { bots.ann = { text, sub, T, t: T, kind }; }
function botsFeed(line) { bots.feed.unshift({ t: 4.5, line }); if (bots.feed.length > 5) bots.feed.length = 5; }

// ---- the frame ----------------------------------------------------------------------------------
function botsRender() {
  const gl = bots.gl; if (!gl) return;
  const m = bots.m;
  const A = BotsSim.ARENAS[bots.arena];
  botsStampDecals();
  const lights = botsBuildLights();
  const target = bots.bloom && bots.fbo.scene ? bots.fbo.scene : null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
  gl.viewport(0, 0, bots.W, bots.Hh);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  gl.clearColor(0.02, 0.022, 0.028, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);

  // 1. the floor (lit, normal-mapped, decals folded in)
  {
    const P = bots.prog.floor;
    gl.useProgram(P.p);
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bots.tex.fAlbedo); gl.uniform1i(P.u.uAlbedo, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bots.tex.fNormal); gl.uniform1i(P.u.uNormal, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, bots.tex.fRough); gl.uniform1i(P.u.uRough, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, bots.fbo.decal ? bots.fbo.decal.tex : bots.tex.black); gl.uniform1i(P.u.uDecal, 3);
    gl.uniform1f(P.u.uWater, m ? m.hz.water : 0);
    gl.uniform1f(P.u.uTime, bots.t);
    gl.uniform1f(P.u.uStorm, bots.fx.storm > 0 ? Math.sin(Math.min(1, bots.fx.storm / 2.4) * Math.PI) : 0);
    botsViewUniform(P);
    botsLightUniforms(P, lights);
    gl.bindBuffer(gl.ARRAY_BUFFER, bots.buf.floor);
    gl.enableVertexAttribArray(P.a.aPos); gl.vertexAttribPointer(P.a.aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(P.a.aUV); gl.vertexAttribPointer(P.a.aUV, 2, gl.FLOAT, false, 16, 8);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // 2. sprites
  botsBindSpriteProgram(lights);
  const lit = bots.batches.lit, glow = bots.batches.glow, sh = bots.batches.shadow;
  const t = bots.t;
  const box = A.box;

  // dressing: the tire ring (only while the floor is the stand-in — the Blender page paints its own)
  if (!bots.art.floorReady) {
    const fx0 = box[0] - 12, fy0 = box[1] - 12, fx1 = box[2] + 12, fy1 = box[3] + 12;
    for (let x = fx0 + 4; x < fx1; x += 8) { botsPush(lit, 'tire', x, fy0 + 5, (x * 0.37) % 6.28, 1, 1, [1, 1, 1], 1, true, 6, false); botsPush(lit, 'tire', x, fy1 - 5, (x * 0.53) % 6.28, 1, 1, [1, 1, 1], 1, true, 6, false); }
    for (let y = fy0 + 12; y < fy1 - 8; y += 8) { botsPush(lit, 'tire', fx0 + 5, y, (y * 0.41) % 6.28, 1, 1, [1, 1, 1], 1, true, 6, false); botsPush(lit, 'tire', fx1 - 5, y, (y * 0.29) % 6.28, 1, 1, [1, 1, 1], 1, true, 6, false); }
    // oil drums in the apron corners, the announcer booth, the drivers' rail
    for (const [dx, dy] of [[20, 20], [620, 20], [20, 340], [620, 340]]) botsPush(lit, 'drum', dx, dy, dx * 0.1, 1, 1, [1, 1, 1], 1, true, 8, false);
    botsPush(lit, 'booth', 20, 180, 0, 1, 1, [1, 1, 1], 1, true, 10, false);
  }
  // the crowd: two rows top and bottom, a jump on a KO
  {
    const jump = bots.fx.crowd > 0 ? Math.sin(Math.min(1, bots.fx.crowd) * Math.PI) * 0.25 : 0;
    for (let x = 104; x < 600; x += 128) {
      botsPush(lit, 'crowd', x, 22 - jump * 6, 0, 1, 1 + jump, [1, 1, 1], 1, true, 4, false);
      botsPush(lit, 'crowd', x + 64, 338 + jump * 6, Math.PI, 1, 1 + jump, [1, 1, 1], 1, true, 4, false);
    }
    // the polycarbonate rail catches the lights: a thin additive line around the wall
    const fx0 = box[0] - 13, fy0 = box[1] - 13, fx1 = box[2] + 13, fy1 = box[3] + 13;
    for (let x = fx0; x < fx1; x += 8) { botsPush(glow, 'rail', x + 4, fy0, 0, 1, 0.6, [0.35, 0.5, 0.65], 0.35, false, 0, false); botsPush(glow, 'rail', x + 4, fy1, 0, 1, 0.6, [0.35, 0.5, 0.65], 0.35, false, 0, false); }
    for (let y = fy0; y < fy1; y += 8) { botsPush(glow, 'rail', fx0, y + 4, Math.PI / 2, 1, 0.6, [0.35, 0.5, 0.65], 0.35, false, 0, false); botsPush(glow, 'rail', fx1, y + 4, Math.PI / 2, 1, 0.6, [0.35, 0.5, 0.65], 0.35, false, 0, false); }
  }
  if (m) {
    // drivers at the rail, one per bot, in team paint
    m.bots.forEach((b, i) => { if (!b.spectating) botsPush(lit, 'driver', 622, 100 + i * 32, -Math.PI / 2, 1, 1, botsTeam(b), b.alive ? 1 : 0.5, true, 6, true); });

    // hazards
    for (const s of m.hz.slicers) {
      if (s.up <= 0) continue;
      const wy = s.side ? box[3] : box[1];
      const y = s.side ? wy - 11 * s.up : wy + 11 * s.up;
      botsPush(sh, 'shadow', s.x, y + 3, 0, 3.6, 1.2, [0, 0, 0], 0.5 * s.up, false, 0, false);
      botsPush(lit, 'blade', s.x, y, s.side ? Math.PI : 0, 1, 1, [1, 1, 1], 1, true, 3, false);
    }
    if (A.mallet) {
      const M = m.hz.mallet, armed = m.clock <= BotsSim.HAZARDS_AT;
      const lift = armed ? (M.arm || 0) : 0;
      const hx = A.mallet.hx, hy = A.mallet.hy;
      botsPush(sh, 'shadow', hx + lift * 6, hy + lift * 10, 0, 3.2 + lift, 3.2 + lift, [0, 0, 0], 0.45, false, 0, false);
      botsPush(lit, 'mallet_arm', (A.mallet.px + hx) / 2, hy - lift * 6, Math.PI / 2, 1, 1 + lift * 0.3, [1, 1, 1], 1, true, 6 + lift * 20, false);
      botsPush(lit, 'mallet', hx, hy - lift * 14, 0, 1 + lift * 0.35, 1 + lift * 0.35, [1, 1, 1], 1, true, 6 + lift * 30, false);
    }
    if (A.pit) {
      const o = m.hz.pit;
      if (o > 0) botsPush(lit, 'pit_hole', A.pit.x, A.pit.y, 0, 1, 1, [1, 1, 1], Math.min(1, o * 1.5), true, -6, false);
      botsPush(lit, 'grate', A.pit.x - o * 46, A.pit.y, 0, 1, 1, [1, 1, 1], 1, true, 0.5, false);
      if (o > 0.6 && bots.arena === 'sump') for (let i = 0; i < 3; i++) botsPush(glow, 'glow', A.pit.x + Math.sin(t * 1.3 + i * 2) * 8, A.pit.y + Math.cos(t * 0.9 + i) * 5, 0, 1.6, 1.6, [0.9, 0.7, 0.3], 0.06 + 0.03 * Math.sin(t * 5 + i), false, 0, false);
    }
    for (const k of m.hz.baskets) {
      if (k.shadow > 0) botsPush(sh, 'shadow', k.x, k.y, 0, k.r / 8 * k.shadow, k.r / 8 * k.shadow, [0, 0, 0], 0.55 * k.shadow, false, 0, false);
      const dz = k.down ? 0 : 90 - 80 * k.shadow;
      if (k.shadow > 0.05 || k.down) botsPush(lit, 'basket', k.x, k.y - dz * 0.4, t * 0.3, 0.9 + 0.1 * k.shadow, 0.9 + 0.1 * k.shadow, [1, 1, 1], 1, true, dz, false);
    }
    for (const s of m.hz.slicks) botsPush(lit, 'p_oil', s.x, s.y, t * 0.1, s.r / 5, s.r / 5, [1, 1, 1], 0.9, false, 0, false);

    // pads + pickups
    for (const p of m.pads) {
      botsPush(lit, 'pad', p.x, p.y, 0, 1, 1, [1, 1, 1], 1, true, 0.5, false);
      if (p.w) {
        const Wp = BotsSim.WEAPONS[p.w];
        const bob = Math.sin(t * 3 + p.x) * 1.5;
        botsPush(glow, 'ring', p.x, p.y, t * 0.8, 1.15 + 0.08 * Math.sin(t * 4), 1.15 + 0.08 * Math.sin(t * 4), Wp.col, 0.75, false, 0, true);
        botsPush(sh, 'shadow', p.x, p.y + 4, 0, 0.9, 0.5, [0, 0, 0], 0.4, false, 0, false);
        botsPush(lit, 'pickup_' + p.w, p.x, p.y - 4 + bob, Math.sin(t * 1.5 + p.y) * 0.25, 1, 1, [1, 1, 1], 1, true, 6 + bob, false);
        botsPush(glow, 'glow', p.x, p.y - 4 + bob, 0, 1.3, 1.3, Wp.col, 0.18, false, 0, false);
      } else {
        // the pad's empty: a faint ring counting down
        botsPush(glow, 'ring', p.x, p.y, 0, 0.9, 0.9, [0.4, 0.45, 0.5], 0.18, false, 0, true);
      }
    }
    // puddles, debris
    for (const p of m.puddles) botsPush(lit, 'puddle_ranch', p.x, p.y, 0, p.r / 18, p.r / 18, [1, 1, 1], Math.min(1, p.t / 1.5), true, 0, false);
    for (const d of m.debris) botsPush(lit, 'p_plate_' + (Math.abs(Math.round(d.a * 10)) % 3), d.x, d.y, d.a, 1, 1, [1, 1, 1], 1, true, 0.5, false);

    // the bots, wrecks first, then the living, then anything airborne
    const order = m.bots.filter((b) => !b.gone && !b.spectating).sort((p, q) => (p.alive - q.alive) || (p.z - q.z));
    for (const b of order) botsDrawBot(b, lit, glow, sh, t);

    // shots
    for (const s of m.shots) {
      const Wp = BotsSim.WEAPONS[s.w];
      if (Wp.lob) { botsPush(sh, 'shadow', s.x, s.y, 0, 0.5, 0.5, [0, 0, 0], 0.4, false, 0, false); botsPush(lit, 'shell', s.x, s.y - (s.z || 0) * 0.6, 0, 1.4, 1.4, [1, 1, 1], 1, true, s.z || 0, false); }
      else if (s.w === 'rocket') { botsPush(lit, 'rocket_body', s.x, s.y, s.a, 1, 1, [1, 1, 1], 1, true, 6, false); botsPush(glow, 'glow', s.x - Math.cos(s.a) * 4, s.y - Math.sin(s.a) * 4, 0, 1.1, 1.1, [1, 0.5, 0.2], 0.7, false, 0, false); }
      else if (Wp.flame) { const k = s.life / Wp.life; botsPush(glow, 'p_fire_' + (Math.floor(t * 20 + s.x) % 3), s.x, s.y, s.a + Math.PI / 2, 0.9 + (1 - k) * 1.4, 0.9 + (1 - k) * 1.4, [1, 0.85, 0.6], k * 0.9, false, 0, false); }
      else botsPush(glow, 'shot_tracer', s.x, s.y, s.a, 1.6, 1.4, Wp.col, 0.95, false, 0, false);
    }
    // the drop: bots come down on the crane before the buzzer
    if (m.phase === 'drop') {
      for (const b of m.bots) { if (b.spectating) continue; const k = Math.min(1, m.phaseT / (BotsSim.DROP_SECS * 0.8)); const z = (1 - k) * (1 - k) * 90; botsPush(glow, 'rail', b.x, b.y - z * 0.6 - 60, Math.PI / 2, 1, (60 + z * 0.6) / 4, [0.3, 0.32, 0.36], 0.6, false, 0, false); }
    }
  }
  // particles
  botsDrawParts(lit, glow);
  // the lamps hang over everything
  A.lamps.forEach((L, i) => { botsPush(sh, 'shadow', L[0] + 6, L[1] + 14, 0, 1.6, 1.0, [0, 0, 0], 0.25, false, 0, false); botsPush(lit, 'lamp', L[0], L[1], i * 1.3, 1, 1, [1, 1, 1], 1, true, 62, false); botsPush(glow, 'glow', L[0], L[1], 0, 1.4, 1.4, [1, 0.9, 0.7], (i === 1 ? 0.22 + 0.1 * Math.sin(t * 13) : 0.32) * (m && m.hz.water > 0.5 ? 1 - (m.hz.water - 0.5) * 2 : 1), false, 0, false); });
  // the storm under the grating: a gold bloom from below
  if (bots.fx.storm > 0) { const k = Math.sin(Math.min(1, bots.fx.storm / 2.4) * Math.PI); for (let i = 0; i < 6; i++) botsPush(glow, 'glow', 320 + Math.cos(t * 0.8 + i) * 60 * k, 180 + Math.sin(t * 1.1 + i * 1.3) * 30 * k, 0, 6 + i, 6 + i, [1, 0.8, 0.35], 0.08 * k, false, 0, false); }

  botsFlush(sh, false);
  botsFlush(lit, false);
  botsFlush(glow, true);

  // 3. post: bloom + composite (or a straight blit on the low tier)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (target) botsPost(target);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

function botsDrawBot(b, lit, glow, sh, t) {
  const C = BotsSim.CLASSES[b.cls];
  const rot = b.a + Math.PI / 2;
  const team = botsTeam(b);
  const state = !b.alive ? 2 : b.hp > b.hpMax * 0.6 ? 0 : b.hp > b.hpMax * 0.25 ? 1 : 1;
  const z = b.z || 0;
  const scale = 1 + z / 60;
  const sq = b.squash > 0 ? 1 - 0.3 * Math.sin(Math.min(1, b.squash / 0.35) * Math.PI) : 1;
  const stunFlick = b.stun > 0 && Math.sin(t * 30) > 0;
  // shadow (the airborne one drifts and shrinks)
  botsPush(sh, 'shadow', b.x + z * 0.35, b.y + z * 0.5 + 3, 0, (C.L / 12) * (1 - z / 120), (C.Wd / 12 + 0.3) * (1 - z / 120), [0, 0, 0], b.alive ? 0.55 : 0.35, false, 0, false);
  const dy = -z * 0.6;
  // chassis
  botsPush(lit, 'bot_' + b.cls + '_' + state, b.x, b.y + dy, rot, scale, scale * sq, stunFlick ? [0.6, 0.9, 1.4] : team, 1, true, z + 3, true);
  if (!b.alive) {
    // a wreck smoulders
    if (Math.random() < 0.08) botsSpawn('smoke', b.x + (Math.random() - 0.5) * 8, b.y + (Math.random() - 0.5) * 8, 1, { spd: 6, life: 1.4, s: 0.5, col: [0.2, 0.2, 0.22] });
    return;
  }
  // the dicer's disc on the nose
  if (b.cls === 'dicer') {
    const nx = b.x + Math.cos(b.a) * (C.L / 2 + 5), ny = b.y + dy + Math.sin(b.a) * (C.L / 2 + 5);
    const frame = b.spin < 0.12 ? 'disc_still' : b.spin < 0.65 ? 'disc_spin' : 'disc_blur';
    b._discRot = (b._discRot || 0) + b.spin * 28 / 60;
    botsPush(lit, frame, nx, ny, b._discRot, scale, scale, [1, 1, 1], 1, true, z + 4, false);
    if (b.spin > 0.5) botsPush(glow, 'ring', nx, ny, 0, 1.15 * scale, 1.15 * scale, [0.7, 0.85, 1], (b.spin - 0.5) * 0.9, false, 0, true);
  }
  // the tenderizer's flipper plate
  if (b.cls === 'tender' && b.flipT > 0) {
    const k = Math.sin(Math.min(1, b.flipT / 0.25) * Math.PI);
    botsPush(lit, 'flipper_up', b.x + Math.cos(b.a) * (C.L / 2 - 2 + k * 6), b.y + dy + Math.sin(b.a) * (C.L / 2 - 2 + k * 6), rot, scale, scale * (1 + k * 0.6), [1, 1, 1], 1, true, z + 6 + k * 10, false);
  }
  // the brick's shove: a dust wake
  if (b.cls === 'brick' && b.shove > 0 && Math.random() < 0.6) botsSpawn('smoke', b.x - Math.cos(b.a) * 12, b.y - Math.sin(b.a) * 12, 1, { spd: 20, life: 0.5, s: 0.6, col: [0.6, 0.55, 0.5] });
  // turret
  if (b.weapon) botsPush(lit, 'turret_' + b.weapon.key, b.x, b.y + dy, b.turret + Math.PI / 2, scale, scale, [1, 1, 1], 1, true, z + 7, false);
  // nitro flame
  if (b.boostT > 0) botsPush(glow, 'p_fire_' + (Math.floor(t * 24) % 3), b.x - Math.cos(b.a) * (C.L / 2 + 4), b.y + dy - Math.sin(b.a) * (C.L / 2 + 4), b.a - Math.PI / 2, 1.2, 1.8, [1, 0.7, 0.5], 0.9, false, 0, false);
  // untouchable (ghost pepper) — a white shimmer
  if (b.iframes > 0) botsPush(glow, 'glow', b.x, b.y + dy, 0, 2.2 * scale, 2.2 * scale, [1, 1, 1], 0.35 + 0.2 * Math.sin(t * 40), false, 0, false);
  // stun sparks
  if (b.stun > 0 && Math.random() < 0.3) botsSpawn('spark', b.x + (Math.random() - 0.5) * 12, b.y + (Math.random() - 0.5) * 12, 1, { spd: 30, vz: 60, life: 0.25, s: 0.5, col: [0.75, 1, 0.4] });
  // it's YOU: a soft team ring under your own bot so you never lose yourself
  if (b.id === bots.me) botsPush(glow, 'ring', b.x, b.y + 2, 0, 1.6, 1.6, team, 0.28 + 0.1 * Math.sin(t * 3), false, 0, true);
}

function botsPost(scene) {
  const gl = bots.gl;
  const quad = (P) => { gl.bindBuffer(gl.ARRAY_BUFFER, bots.buf.post); gl.enableVertexAttribArray(P.a.aPos); gl.vertexAttribPointer(P.a.aPos, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
  gl.disable(gl.BLEND);
  const A = bots.fbo.bloomA, B = bots.fbo.bloomB;
  // bright pass → A
  gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb); gl.viewport(0, 0, A.w, A.h);
  gl.useProgram(bots.prog.bright.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.tex); gl.uniform1i(bots.prog.bright.u.uTex, 0); quad(bots.prog.bright);
  // blur H → B, blur V → A (twice for a softer halo)
  const Pb = bots.prog.blur; gl.useProgram(Pb.p); gl.uniform1i(Pb.u.uTex, 0);
  for (let i = 0; i < 2; i++) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, B.fb); gl.bindTexture(gl.TEXTURE_2D, A.tex); gl.uniform2f(Pb.u.uDir, 1 / A.w, 0); quad(Pb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb); gl.bindTexture(gl.TEXTURE_2D, B.tex); gl.uniform2f(Pb.u.uDir, 0, 1 / A.h); quad(Pb);
  }
  // composite to the screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, bots.W, bots.Hh);
  const Pc = bots.prog.comp; gl.useProgram(Pc.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.tex); gl.uniform1i(Pc.u.uScene, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, A.tex); gl.uniform1i(Pc.u.uBloom, 1);
  gl.uniform1f(Pc.u.uBloomK, 0.9);
  gl.uniform1f(Pc.u.uChroma, bots.fx.chroma);
  gl.uniform1f(Pc.u.uFlash, bots.fx.flash);
  gl.uniform1f(Pc.u.uVig, 0.55);
  quad(Pc);
  gl.enable(gl.BLEND);
}

// ---- the HUD (2D overlay canvas, device DPR, crisp) --------------------------------------------
const BOTS_FONT = '"Barlow Condensed", "Arial Narrow", Impact, "Segoe UI", sans-serif';
const BOTS_MONO = 'Consolas, "IBM Plex Mono", monospace';

function botsUiPos(x, y) { // world → UI canvas px
  const k = bots.k * bots.zoom / bots.rs; // UI canvas is at full DPR, GL at rs
  const sh = botsShake();
  return [(x - bots.cx) * k + bots.uicv.width / 2 + sh[0] / bots.rs, (y - bots.cy) * k + bots.uicv.height / 2 + sh[1] / bots.rs];
}

function botsDrawUI(dt) {
  const g = bots.ug; if (!g) return;
  const W = bots.uicv.width, Hh = bots.uicv.height, d = bots.dpr;
  g.clearRect(0, 0, W, Hh);
  const m = bots.m;
  const uk = bots.k * bots.zoom / bots.rs; // ui px per unit
  if (m && bots.phase === 'play') {
    // name tags + batter bars over every bot
    for (const b of m.bots) {
      if (b.gone || b.spectating) continue;
      const [sx, sy] = botsUiPos(b.x, b.y - (b.z || 0) * 0.6);
      const C = BotsSim.CLASSES[b.cls];
      const w = Math.max(26, C.L * uk * 1.1), h = Math.max(3, 3.5 * d);
      const y = sy - (C.L / 2 + 10) * uk;
      const me = b.id === bots.me;
      const tele = me || (BotsSim.botById(m, bots.me) || {}).mods?.telemetry || !b.alive;
      g.font = `700 ${Math.round(Math.max(10, 5 * uk))}px ${BOTS_FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(b.name, sx + 1, y - h - 1 + 1);
      g.fillStyle = me ? '#f0b03a' : b.alive ? '#ece7dc' : '#6b7480'; g.fillText(b.name + (b.roundWins ? ' ' + '●'.repeat(b.roundWins) : ''), sx, y - h - 1);
      if (b.alive && (tele || me)) {
        const k = Math.max(0, b.hp / b.hpMax);
        g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(sx - w / 2 - 1, y - 1, w + 2, h + 2);
        g.fillStyle = k > 0.6 ? '#f0b03a' : k > 0.25 ? '#ff7a1f' : '#e63b2e'; g.fillRect(sx - w / 2, y, w * k, h);
        if (b.stun > 0) { g.fillStyle = '#c8ff5a'; g.font = `700 ${Math.round(Math.max(9, 4 * uk))}px ${BOTS_MONO}`; g.fillText('JAMMED', sx, y - h - 12 * d); }
        else if (b.burn > 0) { g.fillStyle = '#ff8a3d'; g.font = `700 ${Math.round(Math.max(9, 4 * uk))}px ${BOTS_MONO}`; g.fillText('BURNING', sx, y - h - 12 * d); }
      }
    }
    // the clock, top centre (BattleBots big)
    const fight = m.phase === 'fight' || m.phase === 'drop';
    if (fight || m.phase === 'over') {
      const hot = m.clock <= BotsSim.SUDDEN_AT;
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.font = `800 ${Math.round(34 * d)}px ${BOTS_FONT}`;
      const cs = botsClock(m.clock);
      // sits UNDER the storm HUD's compact pill (top centre, ~50 CSS px), never behind it
      const cy0 = 58 * d;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(W / 2 - 62 * d, cy0 - 2 * d, 124 * d, 46 * d);
      g.fillStyle = hot ? '#ff5a2e' : m.clock <= BotsSim.HAZARDS_AT ? '#f0b03a' : '#ece7dc';
      if (hot && Math.sin(bots.t * 8) > 0) g.fillStyle = '#ffd0c0';
      g.fillText(cs, W / 2, cy0);
      g.font = `600 ${Math.round(10 * d)}px ${BOTS_MONO}`; g.fillStyle = '#9aa2ab';
      g.fillText('ROUND ' + m.roundNum + ' · ' + BotsSim.ARENAS[bots.arena].name, W / 2, cy0 + 32 * d);
    }
    // my panel, bottom left: chassis, batter, weapon + ammo, nitro pips, special charge
    const me = BotsSim.botById(m, bots.me);
    if (me) {
      const px = 14 * d, py = Hh - 14 * d;
      const C = BotsSim.CLASSES[me.cls];
      g.textAlign = 'left'; g.textBaseline = 'bottom';
      g.fillStyle = 'rgba(8,9,12,0.7)'; g.fillRect(px - 6 * d, py - 64 * d, 230 * d, 70 * d);
      g.fillStyle = '#f0b03a'; g.font = `800 ${Math.round(16 * d)}px ${BOTS_FONT}`; g.fillText(C.name, px, py - 44 * d);
      // batter bar
      g.fillStyle = '#23272c'; g.fillRect(px, py - 40 * d, 200 * d, 8 * d);
      const k = Math.max(0, me.hp / me.hpMax);
      g.fillStyle = k > 0.6 ? '#f0b03a' : k > 0.25 ? '#ff7a1f' : '#e63b2e'; g.fillRect(px, py - 40 * d, 200 * d * k, 8 * d);
      g.fillStyle = '#ece7dc'; g.font = `600 ${Math.round(10 * d)}px ${BOTS_MONO}`; g.fillText('BATTER ' + Math.ceil(me.hp) + ' / ' + me.hpMax, px, py - 42 * d);
      // special
      const specK = me.cls === 'dicer' ? me.spin : 1 - Math.max(0, me.spec) / (me.cls === 'tender' ? 2.5 : 3.0);
      g.fillStyle = '#23272c'; g.fillRect(px, py - 26 * d, 120 * d, 5 * d);
      g.fillStyle = me.stun > 0 ? '#c8ff5a' : '#7ac8ff'; g.fillRect(px, py - 26 * d, 120 * d * Math.max(0, Math.min(1, specK)), 5 * d);
      g.fillStyle = '#9aa2ab'; g.font = `600 ${Math.round(9 * d)}px ${BOTS_MONO}`; g.fillText(C.special + (me.stun > 0 ? ' · JAMMED' : ''), px, py - 28 * d);
      // weapon
      g.textAlign = 'left'; g.font = `700 ${Math.round(13 * d)}px ${BOTS_FONT}`;
      if (me.weapon) { const Wp = BotsSim.WEAPONS[me.weapon.key]; g.fillStyle = '#ece7dc'; g.fillText(Wp.icon + ' ' + Wp.name + '  ' + me.weapon.ammo, px, py - 8 * d); }
      else { g.fillStyle = '#6b7480'; g.fillText('NO SAUCE — grab a pad', px, py - 8 * d); }
      // nitro pips
      for (let i = 0; i < 4; i++) { g.fillStyle = i < me.nitro ? '#ff5a2e' : '#2b323a'; g.fillRect(px + 130 * d + i * 12 * d, py - 26 * d, 9 * d, 5 * d); }
      g.fillStyle = '#9aa2ab'; g.font = `600 ${Math.round(9 * d)}px ${BOTS_MONO}`; g.fillText('NITRO', px + 130 * d, py - 28 * d);
      if (!me.alive && m.phase === 'fight') { g.textAlign = 'center'; g.fillStyle = '#e63b2e'; g.font = `800 ${Math.round(22 * d)}px ${BOTS_FONT}`; g.fillText('OUT — watch the round play out', W / 2, Hh - 30 * d); }
    }
    // standings, top right
    {
      const st = BotsSim.standings(m);
      g.textAlign = 'right'; g.textBaseline = 'top';
      let y = 10 * d;
      g.fillStyle = 'rgba(8,9,12,0.55)'; g.fillRect(W - 190 * d, 6 * d, 184 * d, (st.length * 15 + 6) * d);
      for (const b of st) {
        const T = BotsSim.TEAMS[b.team];
        g.fillStyle = T.hex; g.fillRect(W - 186 * d, y + 3 * d, 6 * d, 9 * d);
        g.fillStyle = b.id === bots.me ? '#f0b03a' : b.alive ? '#ece7dc' : '#6b7480';
        g.font = `700 ${Math.round(12 * d)}px ${BOTS_FONT}`;
        g.fillText(b.name + '  ' + '●'.repeat(b.roundWins) + '○'.repeat(Math.max(0, m.roundsToWin - b.roundWins)) + '  ' + Math.round(b.score), W - 12 * d, y);
        y += 15 * d;
      }
    }
    // the feed, bottom right
    g.textAlign = 'right'; g.textBaseline = 'bottom';
    let fy = Hh - 14 * d;
    for (const f of bots.feed) { f.t -= dt; if (f.t <= 0) continue; g.globalAlpha = Math.min(1, f.t); g.fillStyle = '#ece7dc'; g.font = `600 ${Math.round(12 * d)}px ${BOTS_FONT}`; g.fillText(f.line, W - 14 * d, fy); fy -= 16 * d; }
    g.globalAlpha = 1;
    bots.feed = bots.feed.filter((f) => f.t > 0);
    // countdown during the drop
    if (m.phase === 'drop') {
      const left = BotsSim.DROP_SECS - m.phaseT;
      const n = Math.ceil(left / (BotsSim.DROP_SECS / 3));
      if (n !== bots.countdown && n >= 1) { bots.countdown = n; botsSfx('beep', { f: 520 }); }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `800 ${Math.round(110 * d)}px ${BOTS_FONT}`;
      const frac = (left % (BotsSim.DROP_SECS / 3)) / (BotsSim.DROP_SECS / 3);
      g.fillStyle = 'rgba(240,176,58,' + (0.5 + 0.5 * frac) + ')';
      g.fillText(String(Math.max(1, n)), W / 2, Hh * 0.42);
    }
    // touch controls
    if (bots.touch.on) botsDrawTouch(g, W, Hh, d);
  }
  // announcer card
  if (bots.ann) {
    const a = bots.ann; a.t -= dt;
    if (a.t <= 0) bots.ann = null;
    else {
      const k = Math.min(1, (a.T - a.t) * 6), out = Math.min(1, a.t * 4);
      const al = Math.min(k, out);
      g.globalAlpha = al;
      const cy = Hh * 0.3;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `800 ${Math.round(56 * d)}px ${BOTS_FONT}`;
      const tw = g.measureText(a.text).width + 60 * d;
      g.fillStyle = 'rgba(8,9,12,0.78)'; g.fillRect(W / 2 - tw / 2, cy - 44 * d, tw, 88 * d);
      g.fillStyle = a.kind === 'hot' ? '#ff5a2e' : a.kind === 'warn' ? '#f0b03a' : '#f0b03a'; g.fillRect(W / 2 - tw / 2, cy - 44 * d, tw, 4 * d);
      g.fillStyle = a.kind === 'hot' ? '#ff5a2e' : '#ece7dc'; g.fillText(a.text, W / 2, cy - 10 * d);
      g.font = `600 ${Math.round(14 * d)}px ${BOTS_MONO}`; g.fillStyle = '#9aa2ab'; g.fillText(a.sub || '', W / 2, cy + 26 * d);
      g.globalAlpha = 1;
    }
  }
  // results card
  if (bots.phase === 'done' && m) botsDrawResults(g, W, Hh, d, m);
  if (bots.paused) {
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, W, Hh);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f0b03a'; g.font = `800 ${Math.round(48 * d)}px ${BOTS_FONT}`; g.fillText('PAUSED', W / 2, Hh * 0.42);
    g.fillStyle = '#ece7dc'; g.font = `600 ${Math.round(14 * d)}px ${BOTS_MONO}`; g.fillText('ESC resume · T steering: ' + (bots.tank ? 'TANK (W/S throttle, A/D turn)' : 'POINT (hold where you want to go)') + ' · Q quit to the garage', W / 2, Hh * 0.42 + 44 * d);
  }
  // arena-fit letterbox bars stay black on the UI layer so nothing bleeds outside the world
  const k = bots.k * bots.zoom / bots.rs;
  const wx0 = W / 2 - (bots.cx) * k, wx1 = wx0 + BOTS_W * k, wy0 = Hh / 2 - bots.cy * k, wy1 = wy0 + BOTS_H * k;
  g.fillStyle = '#07080a';
  if (wx0 > 0) { g.fillRect(0, 0, wx0, Hh); } if (wx1 < W) { g.fillRect(wx1, 0, W - wx1, Hh); }
  if (wy0 > 0) { g.fillRect(0, 0, W, wy0); } if (wy1 < Hh) { g.fillRect(0, wy1, W, Hh - wy1); }
}

function botsDrawResults(g, W, Hh, d, m) {
  const st = BotsSim.standings(m);
  const me = BotsSim.botById(m, bots.me);
  g.fillStyle = 'rgba(8,9,12,0.82)'; g.fillRect(W / 2 - 220 * d, Hh * 0.5 - 40 * d, 440 * d, (90 + st.length * 26) * d);
  g.fillStyle = '#f0b03a'; g.fillRect(W / 2 - 220 * d, Hh * 0.5 - 40 * d, 440 * d, 4 * d);
  g.textAlign = 'center'; g.textBaseline = 'top';
  g.fillStyle = '#ece7dc'; g.font = `800 ${Math.round(28 * d)}px ${BOTS_FONT}`; g.fillText('FINAL · ' + BotsSim.ARENAS[bots.arena].name, W / 2, Hh * 0.5 - 30 * d);
  let y = Hh * 0.5 + 8 * d;
  st.forEach((b, i) => {
    g.textAlign = 'left'; g.font = `700 ${Math.round(16 * d)}px ${BOTS_FONT}`;
    g.fillStyle = b.id === bots.me ? '#f0b03a' : '#ece7dc';
    g.fillText((i + 1) + '.  ' + b.name + (b.id === m.winner ? '  🏆' : ''), W / 2 - 200 * d, y);
    g.textAlign = 'right'; g.font = `600 ${Math.round(12 * d)}px ${BOTS_MONO}`; g.fillStyle = '#9aa2ab';
    g.fillText(b.roundWins + 'W · ' + b.kos + ' KO · ' + Math.round(b.dmg) + ' dmg · ' + Math.round(b.score) + ' pts', W / 2 + 200 * d, y + 3 * d);
    y += 26 * d;
  });
  g.textAlign = 'center'; g.fillStyle = '#9aa2ab'; g.font = `600 ${Math.round(12 * d)}px ${BOTS_MONO}`;
  g.fillText(bots.online ? 'scores filed by the room · back to the lobby for a rematch in a moment' : (me ? 'banked ' + fmt.format(Math.round(me.score / BOTS_BANK_DIV * storm.perFlyer * bots.cfg.mult)) + ' nugs · ' : '') + 'SPACE rematch · R new league · Q garage', W / 2, y + 8 * d);
}

// touch: two sticks and two buttons, drawn where the thumbs are
function botsTouchBtns() {
  const W = window.innerWidth, Hh = window.innerHeight;
  return [
    { k: 'spec', label: 'SPECIAL', x: W - 60, y: Hh - 150, r: 30 },
    { k: 'nitro', label: 'NITRO', x: W - 130, y: Hh - 110, r: 24 },
  ];
}
function botsDrawTouch(g, W, Hh, d) {
  const T = bots.touch;
  const stick = (s, col) => {
    if (!s) return;
    g.strokeStyle = 'rgba(236,231,220,0.35)'; g.lineWidth = 2 * d; g.beginPath(); g.arc(s.x0 * d, s.y0 * d, 44 * d, 0, 7); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc((s.x0 + s.dx * 34) * d, (s.y0 + s.dy * 34) * d, 18 * d, 0, 7); g.fill();
  };
  stick(T.L, 'rgba(236,231,220,0.55)'); stick(T.R, 'rgba(240,176,58,0.6)');
  for (const b of botsTouchBtns()) {
    const on = T[b.k];
    g.fillStyle = on ? 'rgba(240,176,58,0.7)' : 'rgba(8,9,12,0.55)'; g.beginPath(); g.arc(b.x * d, b.y * d, b.r * d, 0, 7); g.fill();
    g.strokeStyle = 'rgba(236,231,220,0.4)'; g.lineWidth = 1.5 * d; g.beginPath(); g.arc(b.x * d, b.y * d, b.r * d, 0, 7); g.stroke();
    g.fillStyle = '#ece7dc'; g.font = `800 ${Math.round(11 * d)}px ${BOTS_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.label, b.x * d, b.y * d);
  }
  if (!T.L && !T.R) { g.fillStyle = 'rgba(236,231,220,0.35)'; g.font = `600 ${Math.round(12 * d)}px ${BOTS_MONO}`; g.textAlign = 'center'; g.fillText('left thumb drives · right thumb aims and fires', W / 2, Hh - 24 * d); }
}

// ---- input ------------------------------------------------------------------------------------------
// Keyboard + mouse, twin-stick touch, gamepad. Everything funnels into ONE sim
// input per frame: drive vector, aim vector (+ distance for the mortar), and
// the three buttons. Whichever device moved last owns the aim.
function botsMenuOpen() { return !!(bots.pick || bots.boonPick || document.querySelector('.modal-overlay.active')); }

function botsGatherInput() {
  if (bots.inputOverride) return bots.inputOverride;
  const K = bots.keys, m = bots.m, me = m && BotsSim.botById(m, bots.me);
  const inp = { dx: 0, dy: 0, ax: bots.lastInput.ax, ay: bots.lastInput.ay, ad: bots.lastInput.ad, fire: false, spec: false, nitro: false, tank: bots.tank };
  // drive
  const ix = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
  const iy = (K.KeyS || K.ArrowDown ? 1 : 0) - (K.KeyW || K.ArrowUp ? 1 : 0);
  if (ix || iy) { const l = Math.hypot(ix, iy); inp.dx = ix / l; inp.dy = iy / l; if (bots.tank) { inp.dx = ix; inp.dy = iy; } }
  // gamepad
  botsPollGamepad();
  const P = bots.pad;
  if (P.on) {
    if (Math.hypot(P.lx, P.ly) > 0.2) { inp.dx = P.lx; inp.dy = P.ly; }
    if (Math.hypot(P.ax, P.ay) > 0.3) { const l = Math.hypot(P.ax, P.ay); inp.ax = P.ax / l; inp.ay = P.ay / l; inp.ad = 60 + l * 160; }
    if (P.fire) inp.fire = true; if (P.spec) inp.spec = true; if (P.nitro) inp.nitro = true;
  }
  // touch
  const T = bots.touch;
  if (T.on) {
    if (T.L && Math.hypot(T.L.dx, T.L.dy) > 0.15) { inp.dx = T.L.dx; inp.dy = T.L.dy; }
    if (T.R) { const l = Math.hypot(T.R.dx, T.R.dy); if (l > 0.25) { inp.ax = T.R.dx / l; inp.ay = T.R.dy / l; inp.ad = 60 + l * 160; inp.fire = l > 0.45; } }
    if (T.spec) inp.spec = true; if (T.nitro) inp.nitro = true;
  }
  // mouse aims when it has moved and nothing analog owns the aim
  if (bots.mouse.seen && me && !(P.on && Math.hypot(P.ax, P.ay) > 0.3) && !T.R) {
    const [wx, wy] = botsToWorld(bots.mouse.x, bots.mouse.y);
    const dx = wx - me.x, dy = wy - me.y, l = Math.hypot(dx, dy);
    if (l > 2) { inp.ax = dx / l; inp.ay = dy / l; inp.ad = l; }
  }
  if (bots.mouse.down || K.KeyF || K.KeyJ) inp.fire = true;
  if (bots.mouse.rdown || K.Space || K.KeyK) inp.spec = true;
  if (K.ShiftLeft || K.ShiftRight || K.KeyL) inp.nitro = true;
  bots.lastInput = inp;
  return inp;
}

function botsPollGamepad() {
  const P = bots.pad;
  if (!navigator.getGamepads) return;
  let gp = null;
  try { const all = navigator.getGamepads(); for (const g of all) if (g && g.connected) { gp = g; break; } } catch (e) { return; }
  if (!gp) { P.on = false; return; }
  const dz = (v) => (Math.abs(v) < 0.14 ? 0 : v);
  P.lx = dz(gp.axes[0] || 0); P.ly = dz(gp.axes[1] || 0); P.ax = dz(gp.axes[2] || 0); P.ay = dz(gp.axes[3] || 0);
  const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
  P.fire = btn(7) || btn(5); P.spec = btn(6) || btn(4) || btn(2); P.nitro = btn(0) || btn(1);
  const any = P.lx || P.ly || P.ax || P.ay || P.fire || P.spec || P.nitro;
  if (any) P.on = true;
  // menu / results shortcuts
  if (bots.phase === 'done' && btn(0) && !P._a) botsRematch(); P._a = btn(0);
  if (btn(9) && !P._start) botsTogglePause(); P._start = btn(9);
}

window.addEventListener('keydown', (e) => {
  if (!botsActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (botsMenuOpen() && e.code !== 'Escape') return;
  botsAudio();
  bots.keys[e.code] = true;
  const claimed = /^(Key[WASDFJKLQRT]|Arrow(Up|Down|Left|Right)|Space|ShiftLeft|ShiftRight|Escape)$/.test(e.code);
  if (claimed) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Escape') { if (bots.phase === 'play') botsTogglePause(); return; }
  if (e.code === 'KeyT') { bots.tank = !bots.tank; try { localStorage.setItem('nugBotsSteer', bots.tank ? 'tank' : 'point'); } catch (err) { } botsFeed('steering: ' + (bots.tank ? 'TANK' : 'POINT')); return; }
  if (e.code === 'KeyQ' && (bots.paused || bots.phase === 'done')) { botsQuit(); return; }
  if (bots.phase === 'done') { if (e.code === 'Space') botsRematch(); else if (e.code === 'KeyR') botsOpenTier(); }
});
window.addEventListener('keyup', (e) => { if (bots.keys[e.code]) bots.keys[e.code] = false; });
window.addEventListener('blur', () => { bots.keys = {}; bots.mouse.down = bots.mouse.rdown = false; });

botsWorld.addEventListener('mousemove', (e) => { bots.mouse.x = e.clientX; bots.mouse.y = e.clientY; bots.mouse.seen = true; });
botsWorld.addEventListener('mousedown', (e) => {
  if (!botsActive()) return;
  if (e.target.closest('.storm-hud, .ak-tier, .modal-overlay')) return;
  botsAudio();
  if (bots.phase === 'done') { if (e.button === 0) botsRematch(); return; }
  if (e.button === 0) bots.mouse.down = true; else if (e.button === 2) bots.mouse.rdown = true;
  e.preventDefault();
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) bots.mouse.down = false; else if (e.button === 2) bots.mouse.rdown = false; });
botsWorld.addEventListener('contextmenu', (e) => { if (botsActive()) e.preventDefault(); });

// touch: left half anchors the drive stick, right half the aim stick; two
// buttons live above the right thumb. Tracked by identifier so thumbs behave.
botsWorld.addEventListener('touchstart', (e) => {
  if (!botsActive()) return;
  if (e.target.closest('.storm-hud, .ak-tier, .modal-overlay')) return;
  botsAudio();
  const T = bots.touch; T.on = true;
  if (bots.phase === 'done') { botsRematch(); e.preventDefault(); return; }
  for (const t of e.changedTouches) {
    const x = t.clientX, y = t.clientY;
    let hit = null;
    for (const b of botsTouchBtns()) if (Math.hypot(x - b.x, y - b.y) <= b.r + 8) { hit = b; break; }
    if (hit) { T.roles[t.identifier] = hit.k; T[hit.k] = true; continue; }
    if (x < window.innerWidth * 0.5 && !T.L) { T.L = { id: t.identifier, x0: x, y0: y, dx: 0, dy: 0 }; T.roles[t.identifier] = 'L'; }
    else if (x >= window.innerWidth * 0.5 && !T.R) { T.R = { id: t.identifier, x0: x, y0: y, dx: 0, dy: 0 }; T.roles[t.identifier] = 'R'; }
  }
  e.preventDefault();
}, { passive: false });
botsWorld.addEventListener('touchmove', (e) => {
  if (!botsActive()) return;
  const T = bots.touch;
  for (const t of e.changedTouches) {
    const role = T.roles[t.identifier];
    const s = role === 'L' ? T.L : role === 'R' ? T.R : null;
    if (!s) continue;
    s.dx = Math.max(-1, Math.min(1, (t.clientX - s.x0) / 40)); s.dy = Math.max(-1, Math.min(1, (t.clientY - s.y0) / 40));
  }
  e.preventDefault();
}, { passive: false });
const botsTouchEnd = (e) => {
  const T = bots.touch;
  for (const t of e.changedTouches) {
    const role = T.roles[t.identifier]; delete T.roles[t.identifier];
    if (role === 'L') T.L = null; else if (role === 'R') T.R = null; else if (role) T[role] = false;
  }
};
window.addEventListener('touchend', botsTouchEnd); window.addEventListener('touchcancel', botsTouchEnd);

function botsTogglePause() {
  if (bots.phase !== 'play') return;
  bots.paused = !bots.paused;
  botsSfx('beep', { f: bots.paused ? 300 : 500 });
}
function botsQuit() {
  bots.paused = false;
  if (typeof stopStorm === 'function') stopStorm();
}

// ---- match flow ------------------------------------------------------------------------------------
function botsOpenTier() {
  botsClosePicks();
  bots.phase = 'tier'; bots.m = null; bots.results = null; bots.paused = false;
  const tiers = BOTS_TIERS.map((t) => Object.assign({}, t, { locked: t.key === 'fryer' && !botsLeagueWon() }));
  bots.pick = ArcadeKit.tierSelect({
    storeKey: 'bots', tiers, title: '🤖 CLUCKED METAL — pick your league', note: 'press 1 · 2 · 3 or click · three-minute rounds · best of three', mount: botsWorld,
    onPick: (key) => { bots.pick = null; bots.cfg = BotsSim.TIERS.find((t) => t.key === key) || BotsSim.TIERS[1]; botsOpenClass(); },
  });
}
function botsOpenClass() {
  bots.phase = 'class';
  bots.pick = ArcadeKit.tierSelect({
    storeKey: 'botsClass', tiers: BOTS_CLASS_CARDS, title: '🔧 pick your chassis', note: 'SPACE (or right-click) is your special · everything else is on a pad', mount: botsWorld,
    onPick: (key) => { bots.pick = null; bots.cls = key; botsOpenArena(); },
  });
}
function botsOpenArena() {
  bots.phase = 'arena';
  bots.pick = ArcadeKit.tierSelect({
    storeKey: 'botsArena', tiers: BOTS_ARENA_CARDS, title: '🛢️ pick the floor', note: 'hazards arm at 2:30 · the pit opens at 1:45 · sudden death at 0:30', mount: botsWorld,
    onPick: (key) => { bots.pick = null; botsStartMatch(key); },
  });
}
function botsClosePicks() {
  if (bots.pick) { bots.pick.close(); bots.pick = null; }
  if (bots.boonPick) { bots.boonPick.close(); bots.boonPick = null; }
}

function botsStartMatch(arena) {
  bots.arena = arena || bots.arena;
  if (bots.art.floorArena !== bots.arena) botsLoadFloor(bots.arena);
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  const names = BOTS_AI_NAMES.slice().sort(() => Math.random() - 0.5);
  const classes = BotsSim.CLASS_KEYS.filter((k) => k !== bots.cls).concat([bots.cls]);
  const players = [{ id: bots.me, name: 'YOU', cls: bots.cls, ai: false }];
  for (let i = 0; i < 3; i++) players.push({ id: 'ai' + i, name: names[i], cls: classes[i % classes.length], ai: bots.cfg.ai });
  bots.m = BotsSim.createMatch({ arena: bots.arena, tier: bots.cfg.key, seed, players });
  BotsSim.startRound(bots.m);
  bots.phase = 'play'; bots.banked = 0; bots.acc = 0; bots.results = null; bots.paused = false;
  bots.cx = 320; bots.cy = 180; bots.zoom = 1; bots.slow = 1; bots.camT = null;
  bots.fx.parts.length = 0; bots.fx.flashes.length = 0; bots.feed.length = 0; bots.decalClear = true;
  bots.matches++;
  botsHandleEvents(BotsSim.drainEvents(bots.m));
}
function botsRematch() { if (bots.phase !== 'done' || bots.online) return; botsStartMatch(bots.arena); }

// 🔧 PIT STOP — the sim dealt three; we show the arcade's crowd-favourite screen
function botsMaybePitstop() {
  const m = bots.m;
  if (m.phase !== 'pitstop') { if (bots.boonPick) { bots.boonPick.close(); bots.boonPick = null; } return; }
  if (bots.boonPick || m.pitstop.picked[bots.me]) return;
  const deal = m.pitstop.deals[bots.me]; if (!deal) return;
  const cards = deal.map((k) => BotsSim.BOONS.find((b) => b.key === k)).filter(Boolean);
  bots.boonPick = ArcadeKit.boonSelect({
    title: '🔧 PIT STOP — pick one', note: 'it stacks for the match · the others are picking too', boons: cards, mount: botsWorld,
    onPick: (idx) => { bots.boonPick = null; if (bots.online && window.BotsNet) BotsNet.pickBoon(deal[idx]); else BotsSim.pickBoon(m, bots.me, deal[idx]); botsSfx('pickup'); },
  });
}

function botsBank() {
  if (bots.online) return; // the room writes online scores to D1 itself
  const me = bots.m && BotsSim.botById(bots.m, bots.me);
  if (!me) return;
  if (me.score > bots.banked) {
    const gain = Math.round((me.score - bots.banked) / BOTS_BANK_DIV * storm.perFlyer * bots.cfg.mult);
    if (gain > 0) storm.caught += gain;
    bots.banked = me.score;
  }
}
function botsMatchDone() {
  const m = bots.m; if (!m || bots.phase === 'done') return;
  bots.phase = 'done';
  const me = BotsSim.botById(m, bots.me);
  if (me && m.winner === bots.me) {
    try {
      if (bots.cfg.key !== 'backyard') localStorage.setItem('nugBotsLeague', '1');
      if (bots.arena === 'sump') localStorage.setItem('nugBotsPing', '1'); // 📡 THE LAST PING
      ArcadeKit.saveBest('bots', bots.cfg.key, Math.round(me.score));
    } catch (e) { /* private mode */ }
  }
}

// ---- the step (called by storm.js every frame) --------------------------------------------------------
function stepBots(dt) {
  if (!bots.on || !bots.gl) return;
  if (bots.glcv.width !== Math.round(window.innerWidth * bots.dpr * bots.rs) || bots.glcv.height !== Math.round(window.innerHeight * bots.dpr * bots.rs)) botsLayout();
  dt = Math.min(0.05, Math.max(0.001, dt || 1 / 60));
  bots.frames++;
  // a soft governor: a long run of slow frames drops a tier for the session
  if (dt > 0.033) { if (++bots.slowFrames > 90 && bots.tier !== 'low') { botsApplyTier(bots.tier === 'high' ? 'med' : 'low'); bots.slowFrames = 0; } } else bots.slowFrames = Math.max(0, bots.slowFrames - 2);
  if (typeof ArcadeKit !== 'undefined') ArcadeKit.refreshTimeScale();
  const m = bots.m;
  if (bots.online && window.BotsNet) {
    // the worker is the authority: send inputs, apply snapshots, predict ourselves
    BotsNet.onStep(dt, botsGatherInput());
    if (bots.m && bots.phase === 'play') botsMaybePitstop();
  } else if (m && bots.phase === 'play' && !bots.paused && !bots.freeze) {
    // time thickens on a KO, then eases back
    if (bots.hitstop > 0) bots.hitstop -= dt;
    else bots.slow += (1 - bots.slow) * Math.min(1, dt * 2.2);
    const simDt = dt * bots.slow * (bots.hitstop > 0 ? 0 : 1);
    bots.acc += simDt;
    const inp = botsGatherInput();
    let n = 0;
    while (bots.acc >= 1 / 60 && n < 4) {
      BotsSim.step(m, { [bots.me]: inp }, 1 / 60);
      bots.acc -= 1 / 60; n++;
    }
    if (n === 4) bots.acc = 0;
    botsHandleEvents(BotsSim.drainEvents(m));
    botsBank();
    botsMaybePitstop();
    if (m.phase === 'done') botsMatchDone();
  }
  // camera: the KO punch-in, then home
  if (bots.camT) {
    bots.camT.t -= dt;
    const T = bots.camT;
    bots.cx += (T.x - bots.cx) * Math.min(1, dt * 6); bots.cy += (T.y - bots.cy) * Math.min(1, dt * 6); bots.zoom += (T.z - bots.zoom) * Math.min(1, dt * 5);
    if (T.t <= 0) bots.camT = null;
  } else {
    bots.cx += (320 - bots.cx) * Math.min(1, dt * 3); bots.cy += (180 - bots.cy) * Math.min(1, dt * 3); bots.zoom += (1 - bots.zoom) * Math.min(1, dt * 3);
  }
  // keep the zoomed view inside the world
  const hw = BOTS_W / 2 / bots.zoom, hh = BOTS_H / 2 / bots.zoom;
  bots.cx = Math.max(hw, Math.min(BOTS_W - hw, bots.cx)); bots.cy = Math.max(hh, Math.min(BOTS_H - hh, bots.cy));
  bots.t += dt;
  bots.fx.chroma *= Math.exp(-6 * dt); bots.fx.flash *= Math.exp(-8 * dt);
  if (bots.fx.crowd > 0) bots.fx.crowd -= dt; if (bots.fx.storm > 0) bots.fx.storm -= dt;
  botsStepParts(dt * (bots.paused ? 0 : 1));
  botsRender();
  botsDrawUI(dt);
}

// ---- lifecycle -----------------------------------------------------------------------------------------
function syncBots() {
  const active = botsActive();
  if (active === bots.on) return;
  bots.on = active;
  document.body.classList.toggle('bots-mode', active);
  if (active) {
    if (!bots.glcv) {
      bots.glcv = document.createElement('canvas'); bots.glcv.className = 'bots-gl';
      bots.uicv = document.createElement('canvas'); bots.uicv.className = 'bots-ui';
      botsWorld.appendChild(bots.glcv); botsWorld.appendChild(bots.uicv);
      bots.ug = bots.uicv.getContext('2d');
      try { bots.tank = localStorage.getItem('nugBotsSteer') === 'tank'; } catch (e) { }
      if (!botsInitGL()) {
        bots.gl = null;
        bots.nogl = document.createElement('div'); bots.nogl.className = 'bots-nogl';
        bots.nogl.innerHTML = '<b>THE PIT NEEDS WEBGL</b>this arena is lit in real time and your browser could not open a WebGL context. try another browser, or turn hardware acceleration on. (the storm HUD\'s Stop button takes you back.)';
        botsWorld.appendChild(bots.nogl);
      } else {
        botsPickTier(bots.gl2);
        botsMakeDecalFbo();
        botsLoadArt();
      }
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    botsLayout();
    bots.t = 0; bots.frames = 0;
    if (bots.gl) {
      if (window.BotsNet && BotsNet.active()) { bots.online = true; BotsNet.onEnter(); }
      else { bots.online = false; botsOpenTier(); }
    }
  } else {
    botsClosePicks();
    bots.paused = false; bots.phase = 'idle'; bots.m = null; bots.results = null;
    bots.keys = {}; bots.mouse.down = bots.mouse.rdown = false;
    if (window.BotsNet && BotsNet.onGameExit) BotsNet.onGameExit();
    bots.online = false;
  }
}

// ---- the Blender pages (async, off the critical path) ----------------------------------------------------
function botsLoadArt() {
  if (bots.art.injected) { if (window.BotsArt) botsApplyArt(); return; }
  bots.art.injected = true;
  const go = () => { if (window.BotsArt) botsApplyArt(); };
  if (window.BotsArt) return go();
  if (typeof HallBoot !== 'undefined' && HallBoot.inject) HallBoot.inject('botsArt.js', go, 60000);
  else { const s = document.createElement('script'); s.src = 'js/botsArt.js'; s.async = true; s.onload = go; document.head.appendChild(s); }
}
function botsImg(src) { return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }
function botsApplyArt() {
  const A = window.BotsArt; if (!A || !bots.gl) return;
  Promise.all([botsImg(A.albedo), botsImg(A.normal), botsImg(A.mask)]).then(([al, no, mk]) => {
    if (!al || !no || !mk || !bots.gl) return;
    // any region the pack left out keeps its procedural stand-in: merge, never replace
    const R = Object.assign({}, A.R);
    const merged = { R, W: A.W || al.width, H: A.H || al.height, albedo: al, normal: no, mask: mk };
    // regions only the renderer knows (shadow, ring, glow…) live on the procedural page —
    // draw them into spare rows of a combined canvas so one atlas serves both
    const cv = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); return c; };
    const ca = cv(al), cn = cv(no), cm = cv(mk);
    let y = A.usedH != null ? A.usedH : botsAtlasBottom(R), x = 0, rowH = 0;
    for (const [name, wu, hu] of BOTS_REGIONS) {
      if (R[name]) continue;
      const w = wu * BOTS_PPU, h = hu * BOTS_PPU;
      if (x + w > ca.width) { x = 0; y += rowH + 2; rowH = 0; }
      if (y + h > ca.height) break;
      const src = bots.proc.R[name];
      ca.getContext('2d').drawImage(bots.proc.albedo, src[0], src[1], src[2], src[3], x, y, w, h);
      cn.getContext('2d').drawImage(bots.proc.normal, src[0], src[1], src[2], src[3], x, y, w, h);
      cm.getContext('2d').drawImage(bots.proc.mask, src[0], src[1], src[2], src[3], x, y, w, h);
      R[name] = [x, y, w, h]; x += w + 2; rowH = Math.max(rowH, h);
    }
    merged.albedo = ca; merged.normal = cn; merged.mask = cm;
    botsUploadAtlas(merged);
    bots.art.ready = true;
  });
  botsLoadFloor(bots.arena);
}
function botsAtlasBottom(R) { let b = 0; for (const k in R) b = Math.max(b, R[k][1] + R[k][3]); return b + 2; }
function botsLoadFloor(arena) {
  const A = window.BotsArt;
  const fl = A && A.floors && A.floors[arena];
  if (!fl) { botsUploadFloor(botsMakeProceduralFloor(arena), arena, false); return; }
  botsUploadFloor(botsMakeProceduralFloor(arena), arena, false); // instant, then swap
  Promise.all([botsImg(fl.albedo), botsImg(fl.normal), botsImg(fl.rough)]).then(([al, no, ro]) => {
    if (!al || !no || !ro || !bots.gl || bots.arena !== arena) return;
    botsUploadFloor({ albedo: al, normal: no, rough: ro }, arena, true);
  });
}

// ---- test seam -------------------------------------------------------------------------------------------
// The harness (blender/tools/botsshoot.js) drives the REAL handlers: pick the
// league/chassis/arena by key, step the sim by frames, freeze the clock, inject
// events for FX scenes, and shoot the GL canvas (rendered on demand).
window.botsDebug = {
  state: () => ({ phase: bots.phase, tier: bots.cfg.key, cls: bots.cls, arena: bots.arena, gl2: bots.gl2, qtier: bots.tier, art: bots.art.ready, floorArt: bots.art.floorReady, matchPhase: bots.m ? bots.m.phase : null, clock: bots.m ? bots.m.clock : null, round: bots.m ? bots.m.roundNum : null, banked: bots.banked, parts: bots.fx.parts.length, frames: bots.frames }),
  match: () => bots.m,
  pickTier: (k) => { if (bots.pick) { bots.pick.close(); bots.pick = null; } bots.cfg = BotsSim.TIERS.find((t) => t.key === k) || BotsSim.TIERS[1]; botsOpenClass(); },
  pickClass: (k) => { if (bots.pick) { bots.pick.close(); bots.pick = null; } bots.cls = BotsSim.CLASSES[k] ? k : 'dicer'; botsOpenArena(); },
  pickArena: (k) => { if (bots.pick) { bots.pick.close(); bots.pick = null; } botsStartMatch(BotsSim.ARENAS[k] ? k : 'pit'); },
  start: (tier, cls, arena) => { botsClosePicks(); bots.cfg = BotsSim.TIERS.find((t) => t.key === tier) || bots.cfg; bots.cls = cls || bots.cls; botsStartMatch(arena || bots.arena); },
  step: (n, inp) => { if (!bots.m) return; for (let i = 0; i < (n || 1); i++) BotsSim.step(bots.m, { [bots.me]: inp || bots.lastInput }, 1 / 60); botsHandleEvents(BotsSim.drainEvents(bots.m)); botsBank(); botsMaybePitstop(); },
  freeze: (v) => { bots.freeze = v !== false; },
  set: (o) => Object.assign(bots, o),
  input: (o) => { bots.inputOverride = o || null; },
  event: (e) => botsHandleEvents([e]),
  pickBoon: (i) => { if (bots.boonPick) bots.boonPick.choose(i); },
  clock: (s) => { if (bots.m) bots.m.clock = s; },
  render: () => { botsRender(); botsDrawUI(0); },
  snap: () => { botsRender(); return bots.glcv.toDataURL('image/png'); },
  tier: (t) => botsApplyTier(t),
  lights: () => botsBuildLights().length,
};
