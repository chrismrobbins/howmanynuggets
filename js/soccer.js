// ---- ⚽ NUGGET SOCCER (game 22, mode `soccer`) -------------------------------------------------------------------
// FIFA, but it's nuggets: 11 v 11 on a real 3D pitch (WebGL, js/soccerGL.js; Blender models in js/soccerMeshData.js
// from blender/soccerrig.py), a broadcast camera, passing / through balls / lobs / shots / tackles, a CPU that plays
// football, a Quick Match and the NUGGET CUP. Mobile: the Blitz pattern (a floating stick, a few big
// context-labelled buttons). Chris, 2026-10-22: 11 v 11 · Quick match + Nugget Cup · the full audio plan.
//
// This file is the GAME: the pitch, the ball's physics, the players, the rules, the CPU, the match flow. It draws
// nothing — js/soccerUI.js renders and takes input, js/soccerAudio.js plays the crowd and the commentary — so a
// whole match runs headless (window.soccerDebug) for the tuning ledger, the way Blitz was tuned.
//
// The arcade contract (wired in storm.js / index.html / arcade.js):
//   soccerActive()          — storm.mode === 'soccer' && storm.running
//   syncSoccer()            — called by setStormMode / stopStorm / every step: opens / closes the game
//   stepSoccer(dt, w, h)    — one frame (the arcade's loop)
//   soccerTally()           — the storm HUD's tally text
//   #soccerWorld            — the game's DOM root (index.html)
// Scoring: storm.caught += worth (perFlyer-scaled, × the tier's mult), stopStorm() submits it.
//
// THE FRAME: metres. x runs the length (goals at x = ±52.5), z the width (touchlines at z = ±34), y is up. The main
// camera sits on the −z side. Team 0 attacks +x in the first half (the ends swap at half time): `p.dir` / `T.dir`.

const soccerWorld = document.getElementById('soccerWorld');

// ---- the pitch (Laws of the Game) ------------------------------------------------------------------------------------
const SOC = { HL: 52.5, HW: 34, GW: 3.66, GH: 2.44, GD: 2.0, BOX: 16.5, BOXW: 20.16, SIX: 5.5, SIXW: 9.16, PEN: 11, CIRCLE: 9.15, R: 0.11, G: 9.81 };

// ---- the clubs (original — no real clubs, players or marks) ---------------------------------------------------------
// k1 shirt · k2 shorts · k3 socks · gk the keeper's kit · r = ratings 0..1 (pace, pass, shot, def, gk)
const SOC_TEAMS = [
  { id: 'rovers',  name: 'FRY VALLEY ROVERS',   short: 'FVR', k1: '#e8b53a', k2: '#1f6b3a', k3: '#e8b53a', gk: '#7a3aa8', r: { pace: 0.74, pass: 0.72, shot: 0.7, def: 0.7, gk: 0.72 }, style: 'balanced' },
  { id: 'sauce',   name: 'SAUCE CITY',          short: 'SCY', k1: '#c8302a', k2: '#f2f2f2', k3: '#c8302a', gk: '#2a2a2a', r: { pace: 0.78, pass: 0.76, shot: 0.78, def: 0.68, gk: 0.7 }, style: 'attack' },
  { id: 'crumb',   name: 'CRUMB ATHLETIC',      short: 'CRA', k1: '#8a5a2e', k2: '#efe2c2', k3: '#8a5a2e', gk: '#2e8a5a', r: { pace: 0.66, pass: 0.7, shot: 0.66, def: 0.8, gk: 0.78 }, style: 'defend' },
  { id: 'dippers', name: 'DIPPERS UNITED',      short: 'DPU', k1: '#2a5bc8', k2: '#f2f2f2', k3: '#2a5bc8', gk: '#e8d23a', r: { pace: 0.76, pass: 0.8, shot: 0.72, def: 0.72, gk: 0.74 }, style: 'possession' },
  { id: 'ranch',   name: 'RANCH WANDERERS',     short: 'RAN', k1: '#f2f2ec', k2: '#7fb8e6', k3: '#f2f2ec', gk: '#e85a2a', r: { pace: 0.7, pass: 0.74, shot: 0.68, def: 0.74, gk: 0.7 }, style: 'balanced' },
  { id: 'hash',    name: 'HASH BROWN ALBION',   short: 'HBA', k1: '#e8742a', k2: '#1c1c1c', k3: '#e8742a', gk: '#3a8ae8', r: { pace: 0.8, pass: 0.66, shot: 0.74, def: 0.66, gk: 0.68 }, style: 'counter' },
  { id: 'curly',   name: 'CURLY FRY CITY',      short: 'CFC', k1: '#6a3aa8', k2: '#f2d23a', k3: '#6a3aa8', gk: '#3ae86a', r: { pace: 0.72, pass: 0.78, shot: 0.8, def: 0.64, gk: 0.66 }, style: 'attack' },
  { id: 'pickle',  name: 'PICKLE PARK RANGERS', short: 'PPR', k1: '#2f9a48', k2: '#f2f2f2', k3: '#2f9a48', gk: '#c83a8a', r: { pace: 0.7, pass: 0.7, shot: 0.68, def: 0.76, gk: 0.76 }, style: 'defend' },
];
// difficulty: the CPU's reaction, decision quality, accuracy, pressing and its keeper (Blitz's rule: speed dominates
// everything, so the tiers lean on smarts and accuracy, not pace)
const SOC_TIERS = [
  { key: 'amateur', name: 'AMATEUR',     mult: 1, react: 0.42, think: 0.55, err: 1.45, press: 0.75, gk: 0.82, stat: 0.94, blurb: 'a Sunday-league CPU: slow to react, loose with the ball' },
  { key: 'pro',     name: 'PROFESSIONAL', mult: 2, react: 0.28, think: 0.38, err: 1.0, press: 1.0, gk: 0.95, stat: 1.0, blurb: 'a proper side: it presses, it passes, it punishes' },
  { key: 'world',   name: 'WORLD CLASS', mult: 3, react: 0.18, think: 0.26, err: 0.72, press: 1.18, gk: 1.06, stat: 1.05, blurb: 'quick, sharp, ruthless in front of goal' },
];
const SOC_HALF_SECS = [120, 180, 300];      // real seconds a half (match minutes run at 45 / that)

// the shape: 4-4-2, in the team's own frame (attacking +x, own goal at x −52.5), kick-off positions
const SOC_SHAPE = [
  { role: 'GK', x: -50.5, z: 0 },
  { role: 'DF', x: -33, z: -24, wide: 1 }, { role: 'DF', x: -37, z: -8 }, { role: 'DF', x: -37, z: 8 }, { role: 'DF', x: -33, z: 24, wide: 1 },
  { role: 'MF', x: -15, z: -23, wide: 1 }, { role: 'MF', x: -18, z: -7 }, { role: 'MF', x: -18, z: 7 }, { role: 'MF', x: -15, z: 23, wide: 1 },
  { role: 'FW', x: -2.5, z: -6 }, { role: 'FW', x: -4, z: 7 },
];
const SOC_FIRST = ['Nugs', 'Crisp', 'Dip', 'Golden', 'Crumbs', 'Tender', 'Saucy', 'Spud', 'Fry', 'Breaded', 'Ranch', 'Curly', 'Hash', 'Pickles', 'Ketch', 'Mayo', 'Bun', 'Wedge', 'Tots', 'Batter', 'Nacho', 'Biscuit'];
const SOC_LAST = ['McCrisp', 'Dunker', 'Fryer', 'Sauceda', 'Goldberg', 'Crunchley', 'Dippington', 'Batterson', 'Brownson', 'Saltini', 'Peppers', 'Mustardo', 'Bunting', 'Ketchum', 'Picklesby', 'Crumbach', 'Frycke', 'Nugent', 'Ranchez', 'Tenders', 'Wedgewood', 'Glaze'];

const soccer = { on: false, phase: 'idle', earned: 0, t: 0 };
let socSeed = 1;
function socRnd() { socSeed = (socSeed * 16807) % 2147483647; return socSeed / 2147483647; }
const socClamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const socHex = (h) => { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };

function soccerActive() { return typeof storm !== 'undefined' && storm.mode === 'soccer' && storm.running; }
function soccerTally() { const M = soccer.m; return M ? `${M.T[0].short} ${M.score[0]}–${M.score[1]} ${M.T[1].short}` : 'kick-off'; }
function syncSoccer() {
  const active = soccerActive();
  if (active === soccer.on) return;
  soccer.on = active;
  document.body.classList.toggle('soccer-mode', active);
  if (typeof socOpen === 'function' && typeof socClose === 'function') { if (active) socOpen(); else socClose(); }
}
function stepSoccer(dt, w, h) {
  syncSoccer();
  if (!soccer.on) return;
  if (typeof socFrame === 'function') socFrame(Math.min(dt, 0.05), w, h);
}

// ---- a match --------------------------------------------------------------------------------------------------------
// opts = { home: team id, away: team id, human: 0 | 1 | -1 (none: CPU v CPU), tier: index, halfSecs, cup: bool }
function socNewMatch(opts) {
  socSeed = (opts.seed || (Date.now() % 2147483646)) + 1;
  const tier = SOC_TIERS[opts.tier == null ? 1 : opts.tier];
  const mk = (id, side) => {
    const D = SOC_TEAMS.find((t) => t.id === id) || SOC_TEAMS[side];
    return { ...D, side, dir: side === 0 ? 1 : -1, c1: socHex(D.k1), c2: socHex(D.k2), c3: socHex(D.k3), cgk: socHex(D.gk), players: [], human: opts.human === side };
  };
  const M = {
    T: [mk(opts.home, 0), mk(opts.away, 1)], tier, cup: !!opts.cup, halfSecs: opts.halfSecs || SOC_HALF_SECS[1],
    half: 1, clock: 0, score: [0, 0], t: 0, phase: 'kickoff', phaseT: 0, players: [], ball: null,
    restart: null, events: [], stats: socStatsNew(), lastTouch: null, lastKick: null, poss: [0, 0], possT: -1,
    human: opts.human == null ? 0 : opts.human, ctl: null, input: { x: 0, z: 0, sprint: false }, msg: null, replay: [], shoot: null,
    cards: [0, 0], subs: [], pens: null, slow: 0, celebrate: null, freeze: 0,
  };
  // the same two colours clash: the away side changes into its keeper's colour scheme (a change strip)
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  if (d(M.T[0].c1, M.T[1].c1) < 0.45) { M.T[1].c1 = M.T[1].c2; M.T[1].c2 = socHex('#1c1c1c'); M.T[1].c3 = M.T[1].c1; M.T[1].change = true; }
  M.ball = { x: 0, y: SOC.R, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, owner: null, rot: 0, rax: [1, 0, 0], inNet: 0, last: null, spd: 0 };
  let n = 0;
  for (const T of M.T) {
    const used = new Set();
    SOC_SHAPE.forEach((s, i) => {
      let nm; do { nm = SOC_FIRST[(socRnd() * SOC_FIRST.length) | 0] + ' ' + SOC_LAST[(socRnd() * SOC_LAST.length) | 0]; } while (used.has(nm)); used.add(nm);
      const r = T.r, v = () => 0.88 + socRnd() * 0.24;
      // the role sets the profile: forwards shoot, defenders tackle, the keeper keeps
      const st = {
        pace: socClamp(r.pace * v() * (s.role === 'FW' || s.wide ? 1.06 : s.role === 'DF' ? 0.97 : 1), 0.4, 1),
        pass: socClamp(r.pass * v() * (s.role === 'MF' ? 1.08 : 1), 0.4, 1),
        shot: socClamp(r.shot * v() * (s.role === 'FW' ? 1.12 : s.role === 'DF' ? 0.8 : 0.95), 0.3, 1),
        def: socClamp(r.def * v() * (s.role === 'DF' ? 1.1 : s.role === 'FW' ? 0.75 : 0.95), 0.3, 1),
        gk: s.role === 'GK' ? socClamp(r.gk * v(), 0.4, 1) : 0.2,
      };
      if (!T.human) for (const k in st) st[k] = socClamp(st[k] * tier.stat, 0.3, 1);
      const p = {
        id: n++, team: T.side, T, i, role: s.role, slot: s, name: nm, num: [1, 2, 5, 6, 3, 7, 8, 4, 11, 9, 10][i], st,
        x: 0, z: 0, vx: 0, vz: 0, face: T.dir > 0 ? Math.PI / 2 : -Math.PI / 2, spd: 0,
        act: null, actT: 0, cool: 0, stun: 0, think: socRnd() * 0.3, target: null, mark: null, run: 0, walk: socRnd() * 6,
        look: 0, hair: (socRnd() * 4) | 0, card: 0, off: false, recv: 0, holdT: 0, gkHold: 0,
      };
      T.players.push(p); M.players.push(p);
    });
  }
  soccer.m = M;
  socKickoffSetup(M, 0);
  return M;
}
function socStatsNew() { return { shots: [0, 0], onT: [0, 0], passes: [0, 0], passOk: [0, 0], fouls: [0, 0], yellows: [0, 0], reds: [0, 0], offsides: [0, 0], corners: [0, 0], throws: [0, 0], gkicks: [0, 0], tackles: [0, 0], saves: [0, 0], possT: [0, 0], stuck: 0 }; }

// the event stream: the UI and the audio read it (soccerUI / soccerAudio), the tests count it
// (a data `kind` — the kick's, the restart's — is kept as `what`: it used to overwrite the event's own kind)
function socEvent(M, kind, data) { const e = Object.assign({}, data || {}, { kind, t: M.t, what: data && data.kind, n: (M.evN = (M.evN || 0) + 1) }); M.events.push(e); if (M.events.length > 200) M.events.shift(); if (soccer.onEvent) soccer.onEvent(e); return e; }

// a team's frame: tx = x * dir (attacking +tx)
const socTX = (T, x) => x * T.dir;
function socOpp(M, T) { return M.T[1 - T.side]; }

// ---- kick-off ---------------------------------------------------------------------------------------------------------
function socKickoffSetup(M, team) {
  const B = M.ball;
  Object.assign(B, { x: 0, y: SOC.R, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, owner: null, inNet: 0 });
  for (const p of M.players) {
    const s = p.slot, T = p.T;
    let x = s.x, z = s.z;
    if (s.role === 'FW') { x = team === p.team ? -0.6 - (s.z > 0 ? 0 : 1.6) : -10; z = team === p.team ? (s.z > 0 ? 0.6 : -0.6) : s.z * 1.2; }
    if (team !== p.team) x = Math.min(x, -SOC.CIRCLE - 1);
    p.x = x * T.dir; p.z = z * T.dir;
    p.vx = p.vz = 0; p.act = null; p.stun = 0; p.cool = 0; p.off = false; p.face = T.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  M.restart = { kind: 'kickoff', team, x: 0, z: 0, t: 0, taker: null };
  M.phase = 'restart'; M.phaseT = 0;
  const taker = M.T[team].players.filter((p) => p.role === 'FW').sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
  M.restart.taker = taker; taker.x = -0.35 * M.T[team].dir; taker.z = 0;
  if (M.T[team].human) M.ctl = taker;
  B.owner = taker;
  M.lastTouch = taker;
}

// ---- the ball ----------------------------------------------------------------------------------------------------------
// air drag ~ k v² (a football: Cd·ρ·A / 2m ≈ 0.013 /m), Magnus curl from sidespin, bounce 0.62, rolling friction on
// grass. A shot at 28 m/s reaches the goal from 20 m in ~0.8 s, a 15 m/s pass rolls ~25 m in ~2.3 s.
const SOC_DRAG = 0.012, SOC_ROLL = 1.1, SOC_ROLL2 = 0.012, SOC_BOUNCE = 0.6, SOC_BFRIC = 0.8;
// (rolling: decel = ROLL + ROLL2·v² — ~1.4 m/s² for a slow ball, ~3.8 at 15 m/s; the research's turf numbers plus a
// little extra so passes don't roll for ever. It was 1.9 + 0.02·v² = 6.4 at 15 m/s: passes died and were cut out)
function socBallStep(M, dt) {
  const B = M.ball;
  if (B.owner) return;
  const v = Math.hypot(B.vx, B.vy, B.vz);
  B.spd = v;
  if (B.y > SOC.R + 0.01 || B.vy > 0.01) {
    // in the air: gravity, drag, curl
    const k = SOC_DRAG * v;
    B.vx -= B.vx * k * dt; B.vy -= B.vy * k * dt + SOC.G * dt; B.vz -= B.vz * k * dt;
    if (B.spin) { const h = Math.hypot(B.vx, B.vz) || 1; B.vx += (-B.vz / h) * B.spin * dt * h * 0.06; B.vz += (B.vx / h) * B.spin * dt * h * 0.06; B.spin *= Math.pow(0.6, dt); }
  } else {
    // rolling: friction toward rest (plus a little drag)
    const h = Math.hypot(B.vx, B.vz);
    if (h > 0) { const nh = Math.max(0, h - (SOC_ROLL + SOC_ROLL2 * h * h) * dt); B.vx *= nh / h; B.vz *= nh / h; }
    if (B.spin) { const hh = Math.hypot(B.vx, B.vz) || 1; B.vx += (-B.vz / hh) * B.spin * dt * hh * 0.02; B.vz += (B.vx / hh) * B.spin * dt * hh * 0.02; B.spin *= Math.pow(0.3, dt); }
    B.vy = 0; B.y = SOC.R;
  }
  const px = B.x, pz = B.z, py = B.y;
  B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
  if (B.y < SOC.R) {
    B.y = SOC.R;
    if (B.vy < -1.2) { B.vy = -B.vy * SOC_BOUNCE; B.vx *= SOC_BFRIC; B.vz *= SOC_BFRIC; if (B.vy > 2) socEvent(M, 'bounce', { v: B.vy }); }
    else B.vy = 0;
  }
  // the rolling ball turns (the UI spins the model about this axis)
  const hv = Math.hypot(B.vx, B.vz);
  if (hv > 0.01) { B.rot += hv * dt / SOC.R; B.rax = [B.vz / hv, 0, -B.vx / hv]; }
  socGoalFrame(M, px, py, pz);
}
// the woodwork and the net: posts and the bar bounce the ball back; inside the goal the net stops it
function socGoalFrame(M, px, py, pz) {
  const B = M.ball, HL = SOC.HL;
  for (const gx of [-HL, HL]) {
    const s = Math.sign(gx);
    // posts (vertical cylinders at z = ±GW, x = gx) and the bar (y = GH)
    for (const pzP of [-SOC.GW, SOC.GW]) {
      const dx = B.x - gx, dz = B.z - pzP, d = Math.hypot(dx, dz);
      if (d < SOC.R + 0.06 && B.y < SOC.GH + 0.06) {
        const nx = dx / (d || 1), nz = dz / (d || 1), vn = B.vx * nx + B.vz * nz;
        if (vn < 0) { B.vx -= 1.7 * vn * nx; B.vz -= 1.7 * vn * nz; B.x = gx + nx * (SOC.R + 0.07); B.z = pzP + nz * (SOC.R + 0.07); socEvent(M, 'post', { v: -vn }); }
      }
    }
    if (Math.abs(B.z) < SOC.GW && Math.abs(B.x - gx) < SOC.R + 0.06) {
      const dy = B.y - SOC.GH;
      if (Math.abs(dy) < SOC.R + 0.06) {
        const dx = B.x - gx, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d, vn = B.vx * nx + B.vy * ny;
        if (vn < 0) { B.vx -= 1.7 * vn * nx; B.vy -= 1.7 * vn * ny; socEvent(M, 'post', { v: -vn, bar: true }); }
      }
    }
    // inside the goal: the net (back at GD, sides at ±GW, roof at GH) soaks the ball up
    const inX = (B.x - gx) * s;
    if (inX > 0 && inX < SOC.GD + 0.5 && Math.abs(B.z) < SOC.GW + 0.2 && B.y < SOC.GH + 0.2) {
      if (inX > SOC.GD - SOC.R) { B.x = gx + s * (SOC.GD - SOC.R); B.vx *= -0.15; B.vz *= 0.4; B.vy *= 0.4; B.inNet = 1; }
      if (Math.abs(B.z) > SOC.GW - SOC.R && (pz * B.z > 0) && Math.abs(pz) <= SOC.GW) { B.z = Math.sign(B.z) * (SOC.GW - SOC.R); B.vz *= -0.2; B.vx *= 0.5; B.inNet = 1; }
      if (B.y > SOC.GH - SOC.R && py <= SOC.GH) { B.y = SOC.GH - SOC.R; B.vy *= -0.2; B.inNet = 1; }
    }
  }
}
// where the ball will be in t seconds (a quick integration of the same physics, no collisions)
function socBallAt(M, t, step) {
  const B = M.ball;
  if (B.owner) return [B.x, B.y, B.z];
  let x = B.x, y = B.y, z = B.z, vx = B.vx, vy = B.vy, vz = B.vz;
  const h = step || 0.05;
  for (let s = 0; s < t; s += h) {
    const v = Math.hypot(vx, vy, vz);
    if (y > SOC.R + 0.01 || vy > 0.01) { const k = SOC_DRAG * v; vx -= vx * k * h; vy -= vy * k * h + SOC.G * h; vz -= vz * k * h; }
    else { const hh = Math.hypot(vx, vz); if (hh > 0) { const nh = Math.max(0, hh - (SOC_ROLL + SOC_ROLL2 * hh * hh) * h); vx *= nh / hh; vz *= nh / hh; } vy = 0; y = SOC.R; }
    x += vx * h; y += vy * h; z += vz * h;
    if (y < SOC.R) { y = SOC.R; if (vy < -1.2) { vy = -vy * SOC_BOUNCE; vx *= SOC_BFRIC; vz *= SOC_BFRIC; } else vy = 0; }
  }
  return [x, y, z];
}
// a kick: launch the ball from the kicker's foot at speed v toward (tx, tz), loft = initial vertical speed
function socKickBall(M, p, vx, vy, vz, spin, kind) {
  const B = M.ball;
  B.owner = null; B.vx = vx; B.vy = vy; B.vz = vz; B.spin = spin || 0; B.inNet = 0;
  B.y = Math.max(SOC.R, B.y);
  M.lastTouch = p; M.lastKick = { p, kind, t: M.t, x: B.x, z: B.z };
  p.cool = kind === 'shot' ? 0.5 : 0.32;
  socEvent(M, 'kick', { p, kind, v: Math.hypot(vx, vy, vz) });
}
// a ground pass that arrives at distance d with speed ~va: v0 = √(va² + 2·a·d) (the roll's deceleration)
// (exact for decel c0 + c1·v²: d = ln((c0 + c1·v0²) / (c0 + c1·va²)) / (2·c1))
function socPassSpeed(d, va) { const c0 = SOC_ROLL, c1 = SOC_ROLL2; return Math.min(30, Math.sqrt(((c0 + c1 * va * va) * Math.exp(2 * c1 * d) - c0) / c1)); }

// ---- the players' bodies -------------------------------------------------------------------------------------------
// jog ~5.6 m/s, sprint ~8.4 m/s × pace; 0.86 with the ball; accel ~8 m/s² (top speed in ~1 s)
function socMaxSpeed(p, sprint) {
  const base = (sprint ? 6.4 : 4.4) + p.st.pace * (sprint ? 2.4 : 1.3);
  return base * (soccer.m && soccer.m.ball.owner === p ? 0.88 : 1) * (p.role === 'GK' ? 0.9 : 1) * (p.stun > 0 ? 0.3 : 1);
}
function socSteer(p, tx, tz, sprint, dt, arrive) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  const vmax = socMaxSpeed(p, sprint);
  let wantx = 0, wantz = 0;
  if (d > 0.05) { const sp = Math.min(vmax, arrive ? d * 2.2 : vmax); wantx = dx / d * sp; wantz = dz / d * sp; }
  socMove(p, wantx, wantz, dt);
}
function socMove(p, wantx, wantz, dt) {
  const acc = (soccer.m && soccer.m.ball.owner === p ? 7 : 9) * dt;
  const ddx = wantx - p.vx, ddz = wantz - p.vz, dd = Math.hypot(ddx, ddz);
  if (dd > acc) { p.vx += ddx / dd * acc; p.vz += ddz / dd * acc; } else { p.vx = wantx; p.vz = wantz; }
  p.x += p.vx * dt; p.z += p.vz * dt;
  p.spd = Math.hypot(p.vx, p.vz);
  if (p.spd > 0.3) { let da = Math.atan2(p.vx, p.vz) - p.face; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; p.face += socClamp(da, -10 * dt, 10 * dt); }
  p.walk += p.spd * dt * 1.55;
  // the pitch's edge (with the run-off): nobody runs into the stands
  p.x = socClamp(p.x, -SOC.HL - 4, SOC.HL + 4); p.z = socClamp(p.z, -SOC.HW - 3.5, SOC.HW + 3.5);
}
function socFaceTo(p, x, z, dt, rate) { let da = Math.atan2(x - p.x, z - p.z) - p.face; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; p.face += socClamp(da, -(rate || 12) * dt, (rate || 12) * dt); }

// ---- the whole match, one fixed step --------------------------------------------------------------------------------------
const SOC_DT = 1 / 60;
function socStep(M, dt) {
  M.t += dt;
  if (M.freeze > 0) { M.freeze -= dt; return; }
  if (M.phase === 'over' || M.phase === 'halftime' || M.phase === 'pens' && M.pens && M.pens.done) { M.phaseT += dt; return; }
  if (M.phase === 'pens') { socPensStep(M, dt); return; }
  M.phaseT += dt;
  // the clock runs in play and through restarts (football's clock never stops), not through a celebration
  if (M.phase === 'play' || M.phase === 'restart') {
    M.clock += dt * 45 / M.halfSecs * 60;      // match seconds
    const end = M.half * 45 * 60;
    if (M.clock >= end && (M.phase === 'play' && !socDangerous(M) || M.clock >= end + 25)) { socHalfEnd(M); return; }
  }
  if (M.phase === 'goal') { socCelebrate(M, dt); return; }
  const B = M.ball;
  // possession time (for the stats)
  const own = B.owner ? B.owner.team : M.lastTouch ? M.lastTouch.team : -1;
  if (own >= 0) M.stats.possT[own] += dt;
  for (const p of M.players) { if (p.cool > 0) p.cool -= dt; if (p.stun > 0) p.stun -= dt; if (p.recv > 0) p.recv -= dt; }
  if (M.phase === 'restart') socRestartStep(M, dt);
  else socPlayStep(M, dt);
  socBallStep(M, dt);
  if (B.owner) socCarry(M, B.owner, dt);
  else socTouch(M, dt);
  if (M.phase === 'play') socLaws(M);
  socSeparate(M);
  // the replay buffer: the last ~7 s at 30 Hz
  if (((M.t * 30) | 0) !== (((M.t - dt) * 30) | 0)) socRecord(M);
}
// "don't blow for half time with the ball in the box"
function socDangerous(M) { const B = M.ball; return Math.abs(B.x) > SOC.HL - SOC.BOX - 4 && Math.abs(B.z) < SOC.BOXW + 6; }
function socRecord(M) {
  const B = M.ball;
  M.replay.push({ t: M.t, b: [B.x, B.y, B.z, B.rot, B.rax[0], B.rax[2]], p: M.players.map((p) => [p.x, p.z, p.face, p.spd, p.walk, p.act ? p.act.kind : 0, p.act ? p.actT : 0, p.act && p.act.side || 0, p.act && p.act.dz || 0, p.act && p.act.dy || 0]) });
  if (M.replay.length > 230) M.replay.shift();
}

// ---- in play ------------------------------------------------------------------------------------------------------------
function socPlayStep(M, dt) {
  const B = M.ball;
  // whose ball is it, for the AI: the team in possession, or chasing a loose ball
  const owner = B.owner;
  const att = owner ? owner.T : M.lastTouch ? M.lastTouch.T : M.T[0];
  M.att = owner ? owner.team : -1;
  // the chasers on a loose ball: each team's best two by time to the ball's path
  if (!owner) socChasers(M);
  for (const p of M.players) {
    if (p.act) { socAct(M, p, dt); continue; }
    if (p.stun > 0) { socMove(p, p.vx * 0.9, p.vz * 0.9, dt); continue; }
    if (M.ctl === p && p.T.human) { socHumanStep(M, p, dt); continue; }
    socAI(M, p, dt, att);
  }
}

// ---- the carrier: the ball at his feet, touched ahead as he runs ------------------------------------------------------------
function socCarry(M, p, dt) {
  const B = M.ball, f = p.face;
  const lead = 0.5 + Math.min(0.9, p.spd * 0.09);
  const tx = p.x + Math.sin(f) * lead, tz = p.z + Math.cos(f) * lead;
  // a dribble: the ball's pulled toward the lead spot with a little touch rhythm
  const k = Math.min(1, dt * (14 + p.spd));
  const touch = Math.sin(p.walk * 2) * 0.06 * Math.min(1, p.spd / 5);
  B.x += (tx - B.x) * k; B.z += (tz - B.z) * k + touch * dt * 0;
  B.y = SOC.R;
  const dx = B.x - (B.px == null ? B.x : B.px), dz = B.z - (B.pz == null ? B.z : B.pz), hv = Math.hypot(dx, dz) / dt;
  if (hv > 0.01) { B.rot += hv * dt / SOC.R; B.rax = [dz / (hv * dt), 0, -dx / (hv * dt)]; }
  B.px = B.x; B.pz = B.z;
  B.vx = p.vx; B.vz = p.vz; B.vy = 0;
  p.holdT += dt;
  M.lastTouch = p;
}
// a loose ball meets a player: control it, head it, or it goes past / deflects
function socTouch(M, dt) {
  const B = M.ball;
  B.px = B.x; B.pz = B.z;
  const v = Math.hypot(B.vx, B.vy, B.vz);
  let best = null, bd = 1e9;
  for (const p of M.players) {
    if (p.cool > 0 || p.stun > 0 || (p.act && p.act.kind !== 'tackle' && p.act.kind !== 'dive')) continue;
    if (M.restart && M.phase === 'restart') continue;
    const reach = p.role === 'GK' && socInBox(p.T, B.x, B.z, true) ? 1.25 : 0.95;
    const dx = B.x - p.x, dz = B.z - p.z, d = Math.hypot(dx, dz);
    if (d > reach || B.y > (p.role === 'GK' && socInBox(p.T, B.x, B.z, true) ? 2.6 : 1.85)) continue;
    // the kicker can't take his own pass back straight away (cool covers it); the keeper gets priority in his box
    const score = d - (p.role === 'GK' ? 0.3 : 0) - (p.recv > 0 ? 0.4 : 0);
    if (score < bd) { bd = score; best = p; }
  }
  if (!best) return;
  const p = best;
  // a ball that's just been struck is past the man next to the passer before he can react — he can only get a lucky
  // block in; and cutting out a fast ball is a skill, not a given (without this a pass was "lost" 0.02 s after it
  // was played, to whoever stood at the passer's feet, and possession ping-ponged)
  const LK = M.lastKick;
  if (LK && LK.p.team !== p.team && p.role !== 'GK') {
    const age = M.t - LK.t, near = Math.hypot(p.x - LK.x, p.z - LK.z) < 2.6;
    if (age < 0.28 && near) { if (socRnd() > (v > 12 ? 0.1 : 0.22)) { p.cool = 0.3; return; } }
    else if (v > 13 && socRnd() > 0.5 + p.st.def * 0.25) { p.cool = 0.25; return; }
  }
  // a header: the ball's up at head height
  if (B.y > 1.25 && p.role !== 'GK') { socHeader(M, p); return; }
  // the keeper in his box: catch (or parry a rocket)
  if (p.role === 'GK' && socInBox(p.T, B.x, B.z, true)) {
    const catchP = v < 18 ? 0.96 : socClamp(0.85 - (v - 18) * 0.04, 0.3, 0.9) * (p.st.gk + 0.2);
    if (M.lastTouch && M.lastTouch.team === p.team && M.lastKick && M.lastKick.p.team === p.team && M.lastKick.kind !== 'header') {
      // a back pass: he can't pick it up — he plays it with his feet
    } else if (socRnd() < catchP) {
      socGain(M, p); p.gkHold = 1.2 + socRnd() * 1.6; socEvent(M, 'catch', { p }); if (M.lastKick && M.lastKick.kind === 'shot' && M.lastKick.p.team !== p.team && M.t - M.lastKick.t < 3) { M.stats.saves[p.team]++; M.stats.onT[1 - p.team]++; socEvent(M, 'save', { p, great: v > 22 }); } return;
    } else {
      // a parry: pushed away, wide of the goal
      const sx = -p.T.dir, sz = Math.sign(B.z || socRnd() - 0.5);
      B.vx = sx * -1 * (2 + socRnd() * 4) * -1 + p.T.dir * (3 + socRnd() * 4); B.vz = sz * (5 + socRnd() * 6); B.vy = 2 + socRnd() * 3;
      M.lastTouch = p; p.cool = 0.6;
      if (M.lastKick && M.lastKick.kind === 'shot' && M.lastKick.p.team !== p.team) { M.stats.saves[p.team]++; M.stats.onT[1 - p.team]++; socEvent(M, 'save', { p, great: true, parry: true }); }
      return;
    }
  }
  // first touch: a hard ball is harder to kill — sometimes it bounces off
  const hard = socClamp((v - 9) / 18, 0, 1);
  if (v > 9 && socRnd() < hard * 0.55 * (1.15 - p.st.pass * 0.5)) {
    const nx = (B.x - p.x), nz = (B.z - p.z), nl = Math.hypot(nx, nz) || 1;
    B.vx = B.vx * 0.35 + nx / nl * 3; B.vz = B.vz * 0.35 + nz / nl * 3; B.vy = Math.abs(B.vy) * 0.3;
    M.lastTouch = p; p.cool = 0.25; socEvent(M, 'touch', { p, bad: true });
    return;
  }
  socGain(M, p);
}
function socGain(M, p) {
  const B = M.ball, prev = M.lastTouch;
  B.owner = p; B.vx = B.vy = B.vz = 0; B.spin = 0; B.y = SOC.R;
  p.holdT = 0;
  // the offside: received from a team-mate's pass while flagged
  if (p.off && M.lastKick && M.lastKick.p.team === p.team && M.lastKick.p !== p && (M.lastKick.kind === 'pass' || M.lastKick.kind === 'through' || M.lastKick.kind === 'lob' || M.lastKick.kind === 'cross' || M.lastKick.kind === 'header')) {
    for (const q of M.players) q.off = false;
    M.stats.offsides[p.team]++;
    socEvent(M, 'offside', { p });
    socSetRestart(M, 'free', 1 - p.team, p.x, p.z);
    return;
  }
  for (const q of M.players) q.off = false;
  // a completed pass?
  if (M.lastKick && M.lastKick.p !== p && ['pass', 'through', 'lob', 'cross'].includes(M.lastKick.kind) && !M.lastKick.done) {
    M.lastKick.done = true;
    if (M.lastKick.p.team === p.team) M.stats.passOk[p.team]++;
    else socEvent(M, 'intercept', { p });
  }
  if (prev && prev.team !== p.team) socEvent(M, 'turnover', { p, from: prev });
  M.lastTouch = p;
  // the controlled player follows the ball for a human side
  if (p.T.human) M.ctl = p;
}
function socHeader(M, p) {
  const B = M.ball, T = p.T, O = socOpp(M, T);
  const gx = SOC.HL * T.dir;
  // in the box attacking: head for goal; otherwise head it clear / on
  const toGoal = Math.hypot(gx - B.x, B.z) < 18;
  let tx, tz, v, vy;
  if (toGoal) { tx = gx; tz = socClamp((socRnd() - 0.5) * 6, -3.2, 3.2); v = 11 + p.st.shot * 6; vy = (socRnd() - 0.55) * 3; M.stats.shots[p.team]++; }
  else { const mate = socBestMate(M, p, 1.2); if (mate) { tx = mate.x; tz = mate.z; } else { tx = B.x + T.dir * 15; tz = B.z * 0.7; } v = 9 + socRnd() * 4; vy = 3 + socRnd() * 2; }
  const dx = tx - B.x, dz = tz - B.z, d = Math.hypot(dx, dz) || 1;
  p.act = { kind: 'header', t: 0.45 }; p.actT = 0;
  socKickBall(M, p, dx / d * v, vy, dz / d * v, 0, toGoal ? 'header' : 'pass');
  if (toGoal) { M.lastKick.kind = 'shot'; M.lastKick.header = true; M.lastKick.target = [tx, 1, tz]; }
  void O;
}
function socInBox(T, x, z, own) {
  // own = the box this team DEFENDS (its keeper's)
  const gx = own ? -SOC.HL * T.dir : SOC.HL * T.dir;
  return Math.abs(x - gx) < SOC.BOX && Math.abs(z) < SOC.BOXW;
}

// ---- actions: kicks (wind-up → strike), tackles, slides, dives, headers, throws -------------------------------------------
function socAct(M, p, dt) {
  const A = p.act;
  p.actT += dt;
  const B = M.ball;
  if (A.kind === 'kick') {
    // the wind-up: run onto it, then strike
    if (B.owner === p) socFaceTo(p, A.tx, A.tz, dt, 9);
    socMove(p, p.vx * 0.86, p.vz * 0.86, dt);
    if (p.actT >= A.wind && !A.done) {
      A.done = true;
      if (B.owner === p) A.go();
    }
    if (p.actT >= A.wind + 0.28) p.act = null;
    return;
  }
  if (A.kind === 'tackle') {
    // a standing tackle: a lunge at the ball, resolved at the moment of contact
    const tgt = B.owner;
    socMove(p, Math.sin(p.face) * 3.5, Math.cos(p.face) * 3.5, dt);
    if (!A.done && p.actT > 0.16) {
      A.done = true;
      const d = Math.hypot(B.x - p.x, B.z - p.z);
      if (tgt && tgt.team !== p.team && d < 1.35) {
        // from behind = a foul risk; the dribbler's ball skill against the tackler's
        const behind = Math.cos(tgt.face - Math.atan2(p.x - tgt.x, p.z - tgt.z)) < -0.3;
        const pWin = socClamp(0.42 + (p.st.def - tgt.st.pass * 0.85) * 0.9 + (tgt.spd > 6.5 ? -0.08 : 0.06), 0.12, 0.82);
        M.stats.tackles[p.team]++;
        if (behind && socRnd() < 0.45) { socFoul(M, p, tgt, false); }
        else if (socRnd() < pWin) {
          socEvent(M, 'tackle', { p, from: tgt });
          tgt.stun = 0.45;
          if (socRnd() < 0.55) socGain(M, p);
          else { B.owner = null; const a = p.face + (socRnd() - 0.5) * 1.6; B.vx = Math.sin(a) * (3 + socRnd() * 4); B.vz = Math.cos(a) * (3 + socRnd() * 4); M.lastTouch = p; p.cool = 0.3; }
        } else { p.stun = 0.5; }
      } else if (!tgt && d < 1.2 && B.y < 0.7) { /* a loose ball: just take it */ }
      else p.stun = 0.25;
    }
    if (p.actT > 0.42) p.act = null;
    return;
  }
  if (A.kind === 'slide') {
    // a slide: 0.65 s along the ground; the ball first = clean, the man first = a foul (and maybe a card)
    const sp = Math.max(0, 8.5 - p.actT * 11);
    p.vx = Math.sin(p.face) * sp; p.vz = Math.cos(p.face) * sp;
    p.x += p.vx * dt; p.z += p.vz * dt; p.spd = sp;
    if (!A.hit && p.actT > 0.08) {
      const fx = p.x + Math.sin(p.face) * 0.7, fz = p.z + Math.cos(p.face) * 0.7;
      const db = Math.hypot(B.x - fx, B.z - fz);
      const tgt = B.owner && B.owner.team !== p.team ? B.owner : null;
      if (db < 0.85 && B.y < 0.6 && (!B.owner || tgt)) {
        A.hit = true; M.stats.tackles[p.team]++;
        // clean — but late / from behind still catches the man sometimes
        const behind = tgt && Math.cos(tgt.face - Math.atan2(p.x - tgt.x, p.z - tgt.z)) < -0.4;
        if (tgt && behind && socRnd() < 0.5) socFoul(M, p, tgt, true);
        else {
          if (tgt) { tgt.stun = 0.7; tgt.act = { kind: 'fall', t: 0.9 }; tgt.actT = 0; socEvent(M, 'tackle', { p, from: tgt, slide: true }); }
          B.owner = null; const a = p.face + (socRnd() - 0.5) * 0.9; const v = 5 + socRnd() * 6; B.vx = Math.sin(a) * v; B.vz = Math.cos(a) * v; B.vy = socRnd() * 1.5; M.lastTouch = p;
        }
      } else if (tgt && Math.hypot(tgt.x - fx, tgt.z - fz) < 0.75) { A.hit = true; socFoul(M, p, tgt, true); }
    }
    if (p.actT > 0.65) { p.act = null; p.stun = 0.35; }
    return;
  }
  if (A.kind === 'dive') {
    // the keeper's dive: sideways along the line toward the ball's crossing point, then on the floor
    const k = Math.min(1, p.actT / A.dur);
    p.x = A.x0 + (A.x1 - A.x0) * Math.sin(k * Math.PI / 2); p.z = A.z0 + (A.z1 - A.z0) * Math.sin(k * Math.PI / 2);
    p.vx = p.vz = 0;
    if (!A.done && B.owner == null) {
      const reach = 0.95, hy = A.y1 * Math.sin(Math.min(1, p.actT / (A.dur * 0.8)) * Math.PI / 2);
      const hx = p.x, hz = p.z;
      if (Math.hypot(B.x - hx, B.z - hz) < reach && Math.abs(B.y - (0.4 + hy)) < 1.0) {
        A.done = true;
        const v = Math.hypot(B.vx, B.vy, B.vz);
        const save = socClamp(0.55 + p.st.gk * 0.5 * M.tier.gk * (p.T.human ? 1 : 1) - (v - 20) * 0.02 - Math.abs(A.z1 - A.z0) * 0.04, 0.15, 0.95);
        if (socRnd() < save) {
          if (v < 17 && socRnd() < 0.6) { socGain(M, p); p.gkHold = 1.4; socEvent(M, 'catch', { p }); }
          else { B.vx = -B.vx * 0.25 + p.T.dir * 2; B.vz = Math.sign(B.z - p.z || 1) * (4 + socRnd() * 5); B.vy = 1.5 + socRnd() * 3; M.lastTouch = p; p.cool = 0.5; }
          M.stats.saves[p.team]++; M.stats.onT[1 - p.team]++;
          socEvent(M, 'save', { p, great: Math.abs(A.z1 - A.z0) > 2.2 || v > 24 });
        } else socEvent(M, 'fingertip', { p });
      }
    }
    if (p.actT > A.dur + 0.75) { p.act = null; p.stun = 0.2; }
    return;
  }
  if (A.kind === 'header' || A.kind === 'fall' || A.kind === 'celebrate' || A.kind === 'throw') {
    socMove(p, p.vx * 0.9, p.vz * 0.9, dt);
    if (p.actT > A.t) p.act = null;
    return;
  }
  p.act = null;
}
// queue a kick with a wind-up; `go` launches the ball (called only if he still has it)
function socStartKick(M, p, kind, tx, tz, go, wind) {
  p.act = { kind: 'kick', sub: kind, tx, tz, go, wind: wind == null ? (kind === 'shot' ? 0.2 : kind === 'lob' || kind === 'cross' ? 0.16 : 0.1) : wind, side: socRnd() < 0.2 ? -1 : 1 };
  p.actT = 0;
}

// ---- passing, shooting, the through ball ---------------------------------------------------------------------------------
// a pass to a player (or a spot), ground or lofted; err widens with pressure and poor passing
function socPassTo(M, p, tx, tz, kind, rcv) {
  const B = M.ball, T = p.T;
  const err = (kind === 'through' ? 1.25 : 1) * (1.35 - p.st.pass) * (T.human ? 0.85 : M.tier.err) * (1 + socPressure(M, p) * 0.6);
  const d0 = Math.hypot(tx - B.x, tz - B.z);
  // lead a moving receiver: where he'll be when it gets there
  if (rcv && kind !== 'through') { const tt = d0 / 15; tx += rcv.vx * tt * 0.85; tz += rcv.vz * tt * 0.85; }
  tx += (socRnd() - 0.5) * err * (0.6 + d0 * 0.05); tz += (socRnd() - 0.5) * err * (0.6 + d0 * 0.05);
  tx = socClamp(tx, -SOC.HL + 0.5, SOC.HL - 0.5); tz = socClamp(tz, -SOC.HW + 0.5, SOC.HW - 0.5);
  const dx = tx - B.x, dz = tz - B.z, d = Math.hypot(dx, dz) || 1;
  socStartKick(M, p, kind, tx, tz, () => {
    // the offside flags are set at the moment of the pass
    socFlagOffside(M, p);
    if (kind === 'lob' || kind === 'cross') {
      // a lofted ball: time of flight from the distance, the vertical speed to land it there
      const tf = 0.75 + d * 0.035, vh = d / tf * 1.12, vy = SOC.G * tf / 2 * 0.98;
      socKickBall(M, p, dx / d * vh, vy, dz / d * vh, (socRnd() - 0.5) * 2, kind);
    } else {
      const v = kind === 'through' ? socPassSpeed(d, 7.5) : socPassSpeed(d, d > 25 ? 8 : 6.5);
      socKickBall(M, p, dx / d * v, d > 30 ? 1.2 : 0.2, dz / d * v, 0, kind);
    }
    M.stats.passes[T.side]++;
    if (rcv) { rcv.recv = 2.5; M.lastKick.to = rcv; }
  });
}
// a shot at (aimZ, aimY) on the goal mouth, power 0..1
function socShoot(M, p, power, aimZ, aimY) {
  const B = M.ball, T = p.T, gx = SOC.HL * T.dir;
  const pr = socPressure(M, p);
  const d = Math.hypot(gx - B.x, B.z);
  // accuracy: skill, power (a blast is wilder), pressure, distance, the CPU's tier
  const acc = (1.2 - p.st.shot) * (0.55 + power * 0.9) * (1 + pr * 0.7) * (0.7 + d * 0.025) * (T.human ? 0.9 : M.tier.err);
  let z = aimZ + (socRnd() - 0.5) * acc * 2.4, y = aimY + (socRnd() - 0.35) * acc * 1.6 + Math.max(0, power - 0.82) * 2.2;
  y = Math.max(0.15, y);
  const v = 16 + power * 15 + p.st.shot * 3;
  socStartKick(M, p, 'shot', gx, z, () => {
    const dx = gx - B.x, dz = z - B.z, dd = Math.hypot(dx, dz) || 1;
    const tf = dd / (v * 0.93);
    // the vertical speed to arrive at height y (gravity over the flight)
    const vy = (y - B.y) / tf + 0.5 * SOC.G * tf;
    socKickBall(M, p, dx / dd * v, vy, dz / dd * v, (socRnd() - 0.5) * 3 * (1 - p.st.shot * 0.5), 'shot');
    M.lastKick.target = [gx, y, z];
    M.stats.shots[T.side]++;
    socEvent(M, 'shot', { p, power, d });
  });
}
function socPressure(M, p) { let pr = 0; for (const q of M.players) if (q.team !== p.team) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < 3) pr += (3 - d) / 3; } return Math.min(1.5, pr); }
// offside: at the pass, every team-mate beyond the ball AND the second-last defender in the opponents' half is flagged
function socFlagOffside(M, p) {
  const T = p.T, O = socOpp(M, T), B = M.ball;
  const xs = O.players.map((q) => socTX(T, q.x)).sort((a, b) => b - a);
  const line = Math.max(xs[1], socTX(T, B.x), 0);
  for (const q of T.players) q.off = q !== p && socTX(T, q.x) > line + 0.25;
}
// the team-mate a pass in direction `dir` (an angle) would find, or the best one overall (dir null)
function socBestMate(M, p, minD, dir) {
  let best = null, bv = -1e9;
  for (const q of p.T.players) {
    if (q === p || q.role === 'GK' && dir == null) continue;
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d < (minD || 3) || d > 55) continue;
    let v;
    if (dir != null) {
      const a = Math.atan2(dx, dz); let da = a - dir; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > 0.9) continue;
      v = Math.cos(da) * 3 - d * 0.035 - socLaneRisk(M, p, q.x, q.z) * 1.2;
    } else v = socPassValue(M, p, q, q.x, q.z);
    if (v > bv) { bv = v; best = q; }
  }
  return best;
}
// does the runner get to (x, z) clearly before every defender? (a through ball into space nobody else reaches first)
function socWinsRace(M, r, x, z) {
  const tr = Math.hypot(x - r.x, z - r.z) / socMaxSpeed(r, true);
  for (const q of M.players) if (q.team !== r.team) { const tq = Math.hypot(x - q.x, z - q.z) / socMaxSpeed(q, true) + 0.25; if (tq < tr + 0.35) return false; }
  return true;
}
// can an opponent cut out a pass from the ball to (tx, tz)? 0 safe … 1 cut out
function socLaneRisk(M, p, tx, tz) {
  const B = M.ball, dx = tx - B.x, dz = tz - B.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, v = socPassSpeed(L, 6.5);
  let risk = 0;
  for (const q of M.players) {
    if (q.team === p.team) continue;
    const ox = q.x - B.x, oz = q.z - B.z, s = ox * ux + oz * uz;
    if (s < 0.5 || s > L + 1) continue;
    const lat = Math.abs(ox * uz - oz * ux);
    const tBall = s / (v * 0.85), tOpp = (Math.max(0, lat - 0.9)) / 6.5 + 0.22;
    if (tOpp < tBall) risk = Math.max(risk, socClamp((tBall - tOpp) * 1.6 + 0.35, 0, 1));
  }
  return risk;
}
function socPassValue(M, p, q, tx, tz) {
  const T = p.T, prog = socTX(T, tx) - socTX(T, p.x);
  let open = 8; for (const o of M.players) if (o.team !== p.team) { const d = Math.hypot(o.x - tx, o.z - tz); if (d < open) open = d; }
  const fin = socTX(T, tx) > SOC.HL - 30 ? 1.2 : 0;
  const d = Math.hypot(tx - p.x, tz - p.z);
  return prog * 0.07 + open * 0.16 + fin - socLaneRisk(M, p, tx, tz) * 2.6 - d * 0.012 - (q && q.off ? 3 : 0) - (q && q.role === 'GK' ? 1.2 : 0);
}
// the shot's quality from here (an xG-ish number): the mouth's visible angle, the distance, what's in the way
function socShotQ(M, p) {
  const T = p.T, gx = SOC.HL * T.dir, B = M.ball;
  const a1 = Math.atan2(-SOC.GW - B.z, gx - B.x), a2 = Math.atan2(SOC.GW - B.z, gx - B.x);
  let ang = Math.abs(a2 - a1); if (ang > Math.PI) ang = Math.PI * 2 - ang;
  const d = Math.hypot(gx - B.x, B.z);
  let block = 0;
  for (const q of M.players) if (q.team !== p.team) {
    const ox = q.x - B.x, oz = q.z - B.z, L = d || 1, ux = (gx - B.x) / L, uz = -B.z / L, s = ox * ux + oz * uz;
    if (s > 0.5 && s < d && Math.abs(ox * uz - oz * ux) < 0.9 + s * 0.04) block += q.role === 'GK' ? 0.12 : 0.32;
  }
  return ang * 1.1 * Math.exp(-d / 21) * Math.max(0.15, 1 - block);
}

// ---- the CPU ---------------------------------------------------------------------------------------------------------------
// every player: in possession — the carrier decides (pass / through / dribble / shoot), the rest take up the shape pushed
// up, the forwards run in behind (onside); out of it — the nearest presses, the next covers, the rest hold the shape and
// mark goal-side; a loose ball — each side's best two chase where it can be reached. The keeper keeps.
function socAI(M, p, dt, att) {
  const B = M.ball, T = p.T, tier = M.tier;
  if (p.role === 'GK') { socKeeper(M, p, dt); return; }
  // the carrier
  if (B.owner === p) { socCarrierAI(M, p, dt); return; }
  // a loose ball: the chasers
  if (!B.owner && p.chase) {
    const [ix, iz] = p.chase;
    socSteer(p, ix, iz, true, dt, false);
    return;
  }
  const inPos = B.owner && B.owner.team === p.team;
  const [hx, hz] = socHome(M, p, inPos);
  // out of possession: press / cover / mark
  if (B.owner && !inPos) {
    const carrier = B.owner;
    const rank = socPressRank(M, p, carrier);
    const goal = [-SOC.HL * T.dir, 0];
    if (rank === 0 || (rank === 1 && socRnd() < 0.0)) {
      // the first defender: close him down, goal-side, and tackle when he's there
      const gdx = goal[0] - carrier.x, gdz = goal[1] - carrier.z, gl = Math.hypot(gdx, gdz) || 1;
      const sx = carrier.x + gdx / gl * 1.1 + carrier.vx * 0.25, sz = carrier.z + gdz / gl * 1.1 + carrier.vz * 0.25;
      const d = Math.hypot(carrier.x - p.x, carrier.z - p.z);
      socSteer(p, sx, sz, d > 4 && tier.press >= 0.9 || d > 9, dt, d < 2);
      socFaceTo(p, carrier.x, carrier.z, dt, 8);
      if (d < 1.45 && p.cool <= 0 && !p.act && (p.think -= dt) <= 0) {
        p.think = tier.react + socRnd() * 0.25;
        const urge = 0.32 * tier.press + (socInBox(T, carrier.x, carrier.z, true) ? -0.12 : 0) + (socTX(T, carrier.x) < -25 ? 0.12 : 0);
        if (socRnd() < urge) { p.act = { kind: socRnd() < 0.12 && !socInBox(T, carrier.x, carrier.z, true) ? 'slide' : 'tackle' }; p.actT = 0; p.cool = 0.9; }
      }
      return;
    }
    if (rank === 1) {
      // the cover: between the carrier and goal, a few metres off
      const gdx = goal[0] - carrier.x, gdz = goal[1] - carrier.z, gl = Math.hypot(gdx, gdz) || 1;
      socSteer(p, carrier.x + gdx / gl * 6, carrier.z + gdz / gl * 6, false, dt, true);
      return;
    }
    // mark: the nearest attacker to my home spot, goal-side of him
    let mk = null, md = 9;
    for (const q of socOpp(M, T).players) { if (q.role === 'GK' || q === carrier) continue; const d = Math.hypot(q.x - hx, q.z - hz); if (d < md) { md = d; mk = q; } }
    if (mk && p.role !== 'FW') {
      const gdx = goal[0] - mk.x, gdz = goal[1] - mk.z, gl = Math.hypot(gdx, gdz) || 1;
      const mx = mk.x + gdx / gl * 1.6, mz = mk.z + gdz / gl * 1.6;
      socSteer(p, (mx * 0.65 + hx * 0.35), (mz * 0.65 + hz * 0.35), false, dt, true);
    } else socSteer(p, hx, hz, false, dt, true);
    return;
  }
  // in possession: the shape, plus runs
  let tx = hx, tz = hz, sprint = false;
  if (inPos) {
    const carrier = B.owner;
    // a forward runs in behind when the carrier's set to play it (onside: level with the second-last defender)
    if ((p.role === 'FW' || p.slot.wide && p.role === 'MF') && (p.run -= dt) <= 0) {
      p.run = 1.2 + socRnd() * 1.6;
      p.runTo = socRnd() < 0.45 && socTX(T, carrier.x) > -20 ? 'behind' : null;
    }
    if (p.runTo === 'behind') {
      const O = socOpp(M, T), xs = O.players.map((q) => socTX(T, q.x)).sort((a, b) => b - a), line = xs[1];
      const want = Math.min(line + 6, SOC.HL - 8);
      // hold the line until the pass, then go
      const lx = M.lastKick && M.lastKick.to === p && M.t - M.lastKick.t < 2 ? want : Math.min(line - 0.4, want);
      tx = lx * T.dir; tz = hz * 0.8;
      sprint = true;
    }
    // get open: step away from the nearest marker
    let nm = null, nd = 4;
    for (const q of socOpp(M, T).players) { const d = Math.hypot(q.x - tx, q.z - tz); if (d < nd) { nd = d; nm = q; } }
    if (nm) { tx += (tx - nm.x) / (nd || 1) * (4 - nd) * 0.8; tz += (tz - nm.z) / (nd || 1) * (4 - nd) * 0.8; }
    // the receiver of a pass in flight moves to meet it
    if (M.lastKick && M.lastKick.to === p && !B.owner) { const [bx, , bz] = socBallAt(M, 0.6); tx = bx; tz = bz; sprint = true; }
  }
  socSteer(p, tx, tz, sprint, dt, !sprint);
  if (B.owner && p.spd < 1) socFaceTo(p, B.x, B.z, dt, 5);
}
// the shape: the slot, squeezed and slid toward the ball, pushed up in possession, dropped off out of it
function socHome(M, p, inPos) {
  const T = p.T, B = M.ball, s = p.slot;
  const bx = socTX(T, B.x), bz = B.z * T.dir;
  const sty = T.style === 'attack' ? 3 : T.style === 'defend' ? -3 : T.style === 'counter' ? -2 : 0;
  let x = s.x * 0.55 + bx * 0.48 + (inPos ? 11 + sty : -3 + sty * 0.5);
  if (p.role === 'DF') x = socClamp(x, -46, Math.min(18, bx + 4));
  if (p.role === 'MF') x = socClamp(x, -40, 38);
  if (p.role === 'FW') x = socClamp(x, -20, 46);
  // forwards stay onside in the shape
  if (p.role === 'FW' || p.role === 'MF') { const O = socOpp(M, T), xs = O.players.map((q) => socTX(T, q.x)).sort((a, b) => b - a); x = Math.min(x, Math.max(xs[1], bx) - 0.5); }
  let z = s.z * (inPos ? 1.02 : 0.78) + bz * (inPos ? 0.22 : 0.34);
  z = socClamp(z, -SOC.HW + 2, SOC.HW - 2);
  return [x * T.dir, z * T.dir];
}
// who presses: the defending side's players ranked by time to the carrier (0 = first defender)
function socPressRank(M, p, carrier) {
  const T = p.T;
  if (!T._press || T._pressT !== M.t) {
    T._pressT = M.t;
    T._press = T.players.filter((q) => q.role !== 'GK' && !q.act).map((q) => ({ q, d: Math.hypot(q.x - carrier.x, q.z - carrier.z) })).sort((a, b) => a.d - b.d).map((o) => o.q);
  }
  const k = T._press.indexOf(p);
  // a human side's controlled player is its own presser: the CPU team-mates cover instead
  if (T.human && M.ctl && T._press.indexOf(M.ctl) === 0) return k === 0 ? 1 : k;
  return k;
}
// the loose ball: each team's two best by time-to-intercept along the ball's predicted path
function socChasers(M) {
  for (const p of M.players) p.chase = null;
  for (const T of M.T) {
    const cands = [];
    for (const p of T.players) {
      if (p.role === 'GK' || p.act || p.stun > 0) continue;
      if (T.human && M.ctl === p) continue;
      let best = null;
      for (let t = 0.15; t < 3.2; t += 0.15) {
        const [bx, by, bz] = socBallAt(M, t, 0.05);
        const run = Math.hypot(bx - p.x, bz - p.z) / socMaxSpeed(p, true) + 0.15;
        if (run <= t && by < 2) { best = { t, x: bx, z: bz }; break; }
      }
      if (!best) { const [bx, , bz] = socBallAt(M, 3.2); best = { t: 3.2 + Math.hypot(bx - p.x, bz - p.z) / 8, x: bx, z: bz }; }
      cands.push({ p, ...best });
    }
    cands.sort((a, b) => a.t - b.t);
    cands.slice(0, T.human ? 1 : 2).forEach((c) => { c.p.chase = [c.x, c.z]; });
  }
}
// the man on the ball (CPU): weigh a shot, the passes (lane risk vs. what they gain), a through ball, a dribble
function socCarrierAI(M, p, dt) {
  const T = p.T, B = M.ball, tier = M.tier, gx = SOC.HL * T.dir;
  if (p.gkHold > 0) { p.gkHold -= dt; return; }
  const pr = socPressure(M, p);
  // dribble direction: toward goal, bent away from the nearest opponent ahead
  let dx = gx - p.x, dz = -p.z * 0.35, dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  for (const q of socOpp(M, T).players) {
    const ox = q.x - p.x, oz = q.z - p.z, d = Math.hypot(ox, oz);
    if (d < 6 && (ox * dx + oz * dz) > 0) { const w = (6 - d) / 6; dx -= ox / d * w * 0.9; dz -= oz / d * w * 0.9; }
  }
  dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  // stay on the pitch
  if (Math.abs(p.z) > SOC.HW - 3) dz -= Math.sign(p.z) * 0.6;
  socMove(p, dx * socMaxSpeed(p, pr < 0.5), dz * socMaxSpeed(p, pr < 0.5), dt);
  if ((p.think -= dt) > 0) return;
  p.think = tier.think * (0.7 + socRnd() * 0.6) * (T.human ? 0.8 : 1);
  if (p.holdT < 0.25) return;      // a first touch before the next decision
  // the options
  const q = socShotQ(M, p), dG = Math.hypot(gx - p.x, p.z);
  const shootV = dG < 30 ? q * 12 - (dG > 24 ? 0.8 : 0) : -9;
  let best = { v: 0.45 + (pr < 0.4 ? 0.5 : -0.8) + (dG < 30 ? 0.2 : 0), kind: 'dribble' };
  if (shootV > best.v) best = { v: shootV, kind: 'shoot' };
  for (const r of T.players) {
    if (r === p) continue;
    const v = socPassValue(M, p, r, r.x, r.z) - (r.role === 'GK' ? 0.5 : 0) + (pr > 0.6 ? 0.6 : 0);
    if (v > best.v) best = { v, kind: 'pass', r };
    // a through ball: into the space ahead of a runner
    if ((r.role === 'FW' || r.slot.wide) && r.runTo === 'behind') {
      const sx = r.x + T.dir * 8 + r.vx * 0.4, sz = r.z * 0.92 + r.vz * 0.4;
      if (Math.abs(socTX(T, sx)) < SOC.HL - 4 && socWinsRace(M, r, sx, sz) && socLaneRisk(M, p, sx, sz) < 0.35) { const tv = socPassValue(M, p, null, sx, sz) + 0.2; if (tv > best.v) best = { v: tv, kind: 'through', r, x: sx, z: sz }; }
    }
  }
  // a cross from wide in the final third
  if (Math.abs(p.z) > 18 && socTX(T, p.x) > SOC.HL - 22) {
    const tgt = T.players.filter((r) => r !== p && socInBox(socOpp(M, T), r.x, r.z, true)).sort((a, b) => Math.abs(a.z) - Math.abs(b.z))[0];
    if (tgt) best.v < 1.4 && (best = { v: 1.4, kind: 'cross', r: tgt });
  }
  // the CPU's judgment: a little noise, more at lower tiers
  if (!T.human && socRnd() < (tier.err - 0.7) * 0.25) best = { kind: 'dribble' };
  if (best.kind === 'shoot') {
    const corner = (socRnd() < 0.5 ? -1 : 1) * (SOC.GW - 0.5 - socRnd() * 1.2);
    socShoot(M, p, 0.55 + socRnd() * 0.35, corner, 0.3 + socRnd() * 1.4);
  } else if (best.kind === 'pass') socPassTo(M, p, best.r.x, best.r.z, Math.hypot(best.r.x - p.x, best.r.z - p.z) > 32 ? 'lob' : 'pass', best.r);
  else if (best.kind === 'through') socPassTo(M, p, best.x, best.z, 'through', best.r);
  else if (best.kind === 'cross') socPassTo(M, p, best.r.x + T.dir * 1, best.r.z, 'cross', best.r);
}
// the keeper: on the line between the ball and the goal's centre, off it as the ball comes; dive at a shot he can reach;
// come off it for a ball over the top he'll get to first; sweep up in his box
function socKeeper(M, p, dt) {
  const T = p.T, B = M.ball, gx = -SOC.HL * T.dir;
  if (B.owner === p) { socKeeperBall(M, p, dt); return; }
  const bdx = B.x - gx, bdz = B.z, bd = Math.hypot(bdx, bdz) || 1;
  // a shot coming: where does it cross the line?
  if (!B.owner && M.lastKick && M.lastKick.p.team !== p.team && (M.lastKick.kind === 'shot') && Math.sign(B.vx) === -T.dir && Math.abs(B.vx) > 4 && !p.act) {
    const tx = (gx - B.x) / B.vx;
    if (tx > 0 && tx < 1.6) {
      const [cx, cy, cz] = socBallAt(M, tx, 0.02);
      void cx;
      const reactT = M.tier ? (T.human ? 0.22 : 0.3 - 0.12 * M.tier.gk) : 0.22;
      if (M.t - M.lastKick.t > reactT && Math.abs(cz) < SOC.GW + 0.8 && cy < SOC.GH + 0.6) {
        const dz = cz - p.z, reach = 3.3 * (0.75 + p.st.gk * 0.35);
        if (Math.abs(dz) > 0.6 || cy > 1.8) {
          const z1 = p.z + socClamp(dz, -reach, reach);
          p.act = { kind: 'dive', dur: Math.max(0.32, Math.min(0.55, tx)), x0: p.x, z0: p.z, x1: p.x + T.dir * 0.3, z1, y1: socClamp(cy - 0.4, 0, 1.6), dz: Math.sign(dz) };
          p.actT = 0;
          socEvent(M, 'dive', { p });
          return;
        }
      }
    }
  }
  // sweep: a loose ball in the box that he gets to first
  if (!B.owner && socInBox(T, B.x, B.z, true) && Math.hypot(B.x - p.x, B.z - p.z) < 11) {
    const opp = socOpp(M, T).players.reduce((m, q) => Math.min(m, Math.hypot(q.x - B.x, q.z - B.z)), 99);
    if (Math.hypot(B.x - p.x, B.z - p.z) < opp * 1.1) { socSteer(p, B.x, B.z, true, dt, false); return; }
  }
  // the angle: off the line by how near the ball is
  const off = socClamp(1 + (40 - bd) * 0.12, 1, 6);
  const tx = gx + bdx / bd * off, tz = socClamp(bdz / bd * off, -SOC.GW + 0.4, SOC.GW - 0.4);
  socSteer(p, tx, tz, bd < 22, dt, true);
  socFaceTo(p, B.x, B.z, dt, 8);
}
function socKeeperBall(M, p, dt, force) {
  const T = p.T;
  if (p.gkHold > 0) { p.gkHold -= dt; p.vx *= 0.8; p.vz *= 0.8; return; }
  if (T.human && M.ctl === p && !force) return;     // the human distributes (pass/lob)
  // roll it to a free defender, or kick it long
  const mate = socBestMate(M, p, 8);
  if (mate && socRnd() < 0.65) socPassTo(M, p, mate.x, mate.z, Math.hypot(mate.x - p.x, mate.z - p.z) > 30 ? 'lob' : 'pass', mate);
  else { const fw = T.players.filter((q) => q.role === 'FW' || q.role === 'MF').sort((a, b) => socTX(T, b.x) - socTX(T, a.x))[0]; socPassTo(M, p, fw.x, fw.z, 'lob', fw); }
}

// ---- the human ------------------------------------------------------------------------------------------------------------
// M.input = { x, z (the stick in world axes, −1..1), sprint, pass, shoot, through, lob, switch, tackle, slide, press, hold }
// (the UI writes it; button presses are edge flags it sets and the sim clears)
function socHumanStep(M, p, dt) {
  const I = M.input, B = M.ball, T = p.T;
  const sx = I.x || 0, sz = I.z || 0, sl = Math.hypot(sx, sz);
  if (B.owner === p && p.role === 'GK' && p.gkHold > 0) p.gkHold = 0;
  // a keeper with the ball who's left standing: after 5 s he plays it himself (FIFA forces it too)
  if (B.owner === p && p.role === 'GK' && p.holdT > 5 && !p.act) { socKeeperBall(M, Object.assign(p, {}), dt, true); }
  // the stick moves him; with the ball he dribbles
  const vmax = socMaxSpeed(p, I.sprint);
  if (sl > 0.12) socMove(p, sx / Math.max(1, sl) * vmax, sz / Math.max(1, sl) * vmax, dt);
  else socMove(p, 0, 0, dt);
  const dir = sl > 0.2 ? Math.atan2(sx, sz) : p.face;
  if (B.owner === p) {
    // the shot: held to charge (the power bar), released to strike
    if (I.shootHeld) { M.shoot = M.shoot || { t: 0 }; M.shoot.t = Math.min(1.1, M.shoot.t + dt); }
    if (I.shootUp && M.shoot) {
      const power = socClamp(M.shoot.t / 0.9, 0.15, 1.05);
      // aim with the stick: across = toward a post, up/down = a little height
      const gdir = T.dir, aimZ = socClamp((sl > 0.2 ? -sz * gdir * 0 + (sz) : 0) * 2.6 + (socRnd() - 0.5) * 0.3, -SOC.GW + 0.35, SOC.GW - 0.35);
      socShoot(M, p, power, aimZ, 0.25 + power * 0.9);
      M.shoot = null;
    }
    if (I.pass) socHumanPass(M, p, dir, 'pass');
    else if (I.through) socHumanPass(M, p, dir, 'through');
    else if (I.lob) socHumanPass(M, p, dir, 'lob');
  } else {
    M.shoot = null;
    // defending
    if (B.owner && B.owner.team !== p.team) {
      const d = Math.hypot(B.x - p.x, B.z - p.z);
      if (I.tackle && !p.act && p.cool <= 0) { socFaceTo(p, B.x, B.z, 1, 99); p.act = { kind: 'tackle' }; p.actT = 0; p.cool = 0.7; }
      if (I.slide && !p.act && p.cool <= 0) { p.face = d < 6 ? Math.atan2(B.x - p.x, B.z - p.z) : dir; p.act = { kind: 'slide' }; p.actT = 0; p.cool = 1.1; }
      // hold tackle = contain: jockey goal-side of the carrier
      if (I.tackleHeld && d < 6 && sl < 0.3) { const g = -SOC.HL * T.dir, gl = Math.hypot(g - B.x, B.z) || 1; socSteer(p, B.x + (g - B.x) / gl * 1.3, B.z - B.z / gl * 1.3, false, dt, true); socFaceTo(p, B.x, B.z, dt, 12); }
    } else if (!B.owner && Math.hypot(B.x - p.x, B.z - p.z) < 2.2 && B.y < 0.9) {
      // a loose ball right there: a first-time pass / shot
      if (I.pass) socHumanPass(M, p, dir, 'pass', true);
      if (I.shootUp) { M.shoot = null; }
    }
    if (I.switch) socSwitch(M, T);
  }
  // auto-switch when the ball is far from him and a team-mate is clearly nearer (FIFA's "auto" switching)
  if (!B.owner || B.owner.team !== p.team) {
    if ((M.autoSw = (M.autoSw || 0) - dt) <= 0 && sl < 0.15) { M.autoSw = 0.6; const n = socNearest(M, T); if (n && n !== p && Math.hypot(n.x - B.x, n.z - B.z) + 6 < Math.hypot(p.x - B.x, p.z - B.z)) M.ctl = n; }
  }
  I.pass = I.through = I.lob = I.shootUp = I.switch = I.tackle = I.slide = false;
}
// assisted passing: the team-mate nearest the stick's direction; power from the distance
function socHumanPass(M, p, dir, kind, firstTime) {
  const r = socBestMate(M, p, 2.5, dir) || socBestMate(M, p, 2.5, null);
  const B = M.ball;
  if (firstTime && !B.owner) { const bv = M.ball; bv.owner = p; }
  if (!r) { const tx = p.x + Math.sin(dir) * 20, tz = p.z + Math.cos(dir) * 20; socPassTo(M, p, tx, tz, kind === 'lob' ? 'lob' : 'pass', null); return; }
  if (kind === 'through') { const T = p.T, lead = 8 + socClamp(socTX(T, r.vx) * 0.8, 0, 6); socPassTo(M, p, r.x + T.dir * lead + r.vx * 0.3, r.z + r.vz * 0.6, 'through', r); }
  else if (kind === 'lob') socPassTo(M, p, r.x, r.z, Math.abs(r.z) < 14 && socInBox(socOpp(M, p.T), r.x, r.z, true) ? 'cross' : 'lob', r);
  else socPassTo(M, p, r.x, r.z, 'pass', r);
}
function socNearest(M, T) { let b = null, bd = 1e9; for (const q of T.players) { if (q.role === 'GK' && !socInBox(T, M.ball.x, M.ball.z, true)) continue; const d = Math.hypot(q.x - M.ball.x, q.z - M.ball.z); if (d < bd) { bd = d; b = q; } } return b; }
// switch: the next player nearest the ball that isn't the current one
function socSwitch(M, T) {
  const B = M.ball, cur = M.ctl;
  const list = T.players.filter((q) => q !== cur && q.role !== 'GK').sort((a, b) => Math.hypot(a.x - B.x, a.z - B.z) - Math.hypot(b.x - B.x, b.z - B.z));
  if (list[0]) { M.ctl = list[0]; socEvent(M, 'switch', { p: list[0] }); }
}

// ---- the laws: out of play, goals, fouls --------------------------------------------------------------------------------
function socLaws(M) {
  const B = M.ball;
  if (B.owner) {
    // dribbled over the line (not a taker winding up on it)
    if ((Math.abs(B.z) > SOC.HW + 0.6 || Math.abs(B.x) > SOC.HL + 0.6) && !(B.owner.act && B.owner.act.kind === 'kick')) { B.owner = null; }
    else return;
  }
  // a goal: the whole ball over the line, between the posts, under the bar
  for (const s of [1, -1]) {
    if (B.x * s > SOC.HL + SOC.R && Math.abs(B.z) < SOC.GW && B.y < SOC.GH) { socGoal(M, s > 0 ? M.T.find((T) => T.dir > 0).side : M.T.find((T) => T.dir < 0).side); return; }
  }
  // out over a touchline: a throw to the side that didn't touch it last
  if (Math.abs(B.z) > SOC.HW + SOC.R) {
    const team = M.lastTouch ? 1 - M.lastTouch.team : 0;
    M.stats.throws[team]++;
    socSetRestart(M, 'throw', team, socClamp(B.x, -SOC.HL + 1, SOC.HL - 1), Math.sign(B.z) * SOC.HW);
    socEvent(M, 'out', { kind: 'throw', team });
    return;
  }
  // out over a goal line (not a goal): a corner or a goal kick
  if (Math.abs(B.x) > SOC.HL + SOC.R) {
    const end = Math.sign(B.x), defT = M.T.find((T) => -SOC.HL * T.dir * end > 0);   // the team defending this end
    const lt = M.lastTouch ? M.lastTouch.team : 0;
    if (lt === defT.side) { const att = 1 - defT.side; M.stats.corners[att]++; socSetRestart(M, 'corner', att, end * SOC.HL, Math.sign(B.z || 1) * SOC.HW); socEvent(M, 'corner', { team: att }); }
    else { M.stats.gkicks[defT.side]++; socSetRestart(M, 'goalkick', defT.side, end * (SOC.HL - SOC.SIX), Math.sign(B.z || 1) * 5.5); socEvent(M, 'goalkick', { team: defT.side }); }
    // (a shot that missed)
    if (M.lastKick && M.lastKick.kind === 'shot' && M.t - M.lastKick.t < 4 && M.lastKick.p.T.dir * end > 0) socEvent(M, 'miss', { p: M.lastKick.p });
  }
}
function socFoul(M, by, on, slide) {
  M.stats.fouls[by.team]++;
  on.stun = 0.8; on.act = { kind: 'fall', t: 1.0 }; on.actT = 0;
  const T = on.T;
  // a card: a slide from behind, a professional foul (a clear run on goal)
  const clear = socTX(T, on.x) > SOC.HL - 30 && Math.abs(on.z) < 20;
  let card = 0;
  if (slide && socRnd() < 0.32) card = 1;
  if (clear && slide && socRnd() < 0.18) card = 2;
  if (card === 1 && by.card === 1) card = 2;
  if (card) {
    by.card = card === 2 ? 2 : by.card + 1;
    if (by.card >= 2) { M.stats.reds[by.team]++; socEvent(M, 'red', { p: by }); by.sentOff = true; }
    else { M.stats.yellows[by.team]++; socEvent(M, 'yellow', { p: by }); }
  }
  socEvent(M, 'foul', { by, on });
  const box = socInBox(on.T, on.x, on.z, false);
  if (box) socSetRestart(M, 'penalty', on.team, SOC.HL * T.dir - (SOC.PEN) * T.dir, 0);
  else socSetRestart(M, 'free', on.team, on.x, on.z);
  if (box) socEvent(M, 'penalty', { team: on.team });
  // a red card: the player leaves the pitch (he walks off; the shape plays a man short)
  if (by.sentOff) { const i = M.players.indexOf(by); if (i >= 0) { M.players.splice(i, 1); by.T.players.splice(by.T.players.indexOf(by), 1); if (M.ctl === by) M.ctl = null; } }
}
function socGoal(M, team) {
  const T = M.T[team];
  M.score[team]++;
  if (M.lastKick && M.lastKick.kind === 'shot' && M.lastKick.p.team === team) M.stats.onT[team]++;
  const lk = M.lastKick, scorer = M.lastTouch;
  const own = scorer && scorer.team !== team;
  const kind = own ? 'own' : lk && lk.header ? 'header' : lk && lk.pen ? 'pen' : lk && lk.kind === 'shot' && Math.hypot(lk.x - SOC.HL * T.dir, lk.z) > 24 ? 'great' : 'goal';
  const late = M.half === 2 && M.clock > 85 * 60, eq = M.score[0] === M.score[1];
  socEvent(M, 'goal', { team, p: scorer, own, kind, late, eq, score: M.score.slice() });
  M.phase = 'goal'; M.phaseT = 0;
  M.celebrate = { team, p: own ? null : scorer, t: 0 };
  M.ball.owner = null;
  if (soccer.onGoal) soccer.onGoal(team, scorer);
}
function socCelebrate(M, dt) {
  const C = M.celebrate, B = M.ball;
  socBallStep(M, dt);
  // the scorer runs off to a corner flag, team-mates chase him; the other side trudges back
  for (const p of M.players) {
    if (p.act && p.act.kind === 'dive') { socAct(M, p, dt); continue; }
    if (C.p && p === C.p) { const cx = SOC.HL * p.T.dir * 0.85, cz = (p.z > 0 ? 1 : -1) * (SOC.HW - 2); socSteer(p, cx, cz, true, dt, true); if (Math.hypot(cx - p.x, cz - p.z) < 2 && !p.act) { p.act = { kind: 'celebrate', t: 2.5, style: (socRnd() * 3) | 0 }; p.actT = 0; } }
    else if (C.p && p.team === C.team) socSteer(p, C.p.x - Math.sin(p.id) * 2, C.p.z - Math.cos(p.id) * 2, true, dt, true);
    else socSteer(p, p.x * 0.95, p.z, false, dt, true);
    if (p.act && p.act.kind === 'celebrate') { p.actT += dt; if (p.actT > p.act.t) p.act = null; }
  }
  void B;
  if (M.phaseT > (soccer.headless ? 1 : 6.5)) {
    if (soccer.onReplay && !C.replayed && !soccer.headless) { C.replayed = true; soccer.onReplay(M); return; }
    socKickoffSetup(M, 1 - C.team);
    M.celebrate = null;
  }
}
function socHalfEnd(M) {
  if (M.half === 1) {
    socEvent(M, 'halftime', { score: M.score.slice() });
    M.phase = 'halftime'; M.phaseT = 0;
  } else {
    // full time — a cup tie that's level goes to penalties
    if (M.cup && M.score[0] === M.score[1]) { socEvent(M, 'fulltime', { score: M.score.slice(), pens: true }); socPensStart(M); return; }
    M.phase = 'over'; M.phaseT = 0;
    socEvent(M, 'fulltime', { score: M.score.slice() });
  }
}
// the second half: swap ends, the other side kicks off
function socSecondHalf(M) {
  M.half = 2; M.clock = 45 * 60;
  for (const T of M.T) T.dir = -T.dir;
  socKickoffSetup(M, 1);
  socEvent(M, 'secondhalf', {});
}

// ---- restarts (throws, corners, goal kicks, free kicks, penalties) ----------------------------------------------------------
function socSetRestart(M, kind, team, x, z) {
  const B = M.ball;
  B.owner = null; B.vx = B.vy = B.vz = 0; B.spin = 0;
  M.restart = { kind, team, x, z, t: 0, taker: null };
  M.phase = 'restart'; M.phaseT = 0;
  for (const p of M.players) { p.act = p.act && (p.act.kind === 'fall') ? p.act : null; p.chase = null; p.off = false; }
}
function socRestartStep(M, dt) {
  const R = M.restart, B = M.ball, T = M.T[R.team], O = socOpp(M, T);
  R.t += dt;
  if (R.kind === 'kickoff') {
    // everyone stands in their half; the taker's on the ball; a whistle and he plays it back
    for (const p of M.players) if (p !== R.taker) { p.vx *= 0.8; p.vz *= 0.8; }
    B.x = 0; B.z = 0; B.y = SOC.R; B.owner = R.taker;
    const ready = R.t > (soccer.headless ? 0.3 : 1.6);
    if (M.input.pass || M.input.shootUp) R.want = true;      // (pressed before the whistle: kept, played on it)
    if (ready && !R.whistled) { R.whistled = true; socEvent(M, 'whistle', { kind: 'kickoff' }); }
    if (ready && (!T.human || M.ctl !== R.taker || R.want || M.input.pass || M.input.shootUp || R.t > 6)) {
      M.phase = 'play'; M.restart = null;
      const mate = T.players.filter((q) => q !== R.taker && q.role !== 'GK').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
      if (T.human) M.ctl = R.taker;
      socPassTo(M, R.taker, mate.x, mate.z, 'pass', mate);
      M.input.pass = M.input.shootUp = false;
    }
    return;
  }
  // the taker: the nearest suitable player walks to the ball
  if (!R.taker) {
    let cand = T.players.filter((q) => (R.kind === 'goalkick' ? q.role === 'GK' : q.role !== 'GK'));
    if (R.kind === 'penalty') cand = T.players.filter((q) => q.role === 'FW').concat(cand);
    R.taker = cand.sort((a, b) => (R.kind === 'penalty' ? (b.st.shot - a.st.shot) : Math.hypot(a.x - R.x, a.z - R.z) - Math.hypot(b.x - R.x, b.z - R.z)))[0];
    if (T.human) M.ctl = R.taker;
  }
  const tk = R.taker;
  // the ball sits on the spot
  B.x = R.x; B.z = R.z; B.y = R.kind === 'throw' ? 1.9 : SOC.R; B.vx = B.vy = B.vz = 0; B.owner = null;
  // the taker's spot: behind the ball, facing the play
  const gx = SOC.HL * T.dir;
  let fx = R.kind === 'throw' ? 0 : gx, fz = 0;
  if (R.kind === 'goalkick') { fx = 0; fz = R.z * 2; }
  const ax = fx - R.x, az = fz - R.z, al = Math.hypot(ax, az) || 1;
  const sx = R.x - ax / al * (R.kind === 'throw' ? 0.5 : 0.9), sz = R.z - az / al * (R.kind === 'throw' ? 0.5 : 0.9);
  socSteer(tk, sx, sz, Math.hypot(sx - tk.x, sz - tk.z) > 6, dt, true);
  socFaceTo(tk, R.x + ax / al, R.z + az / al, dt, 8);
  // everyone else: the shape for this restart
  for (const p of M.players) {
    if (p === tk || p.act) { if (p.act && p !== tk) socAct(M, p, dt); continue; }
    let [hx, hz] = socHome(M, p, p.team === R.team);
    if (p.role === 'GK') { socKeeper(M, p, dt); continue; }
    if (R.kind === 'corner') {
      // attackers into the box, defenders mark them; two attackers stay back
      const inBox = (q) => { const g = SOC.HL * T.dir; return [g - T.dir * (6 + (q.i % 4) * 2.5), (q.i % 3 - 1) * 4 + (q.i % 2) * 1.5]; };
      if (p.team === R.team && p.role !== 'DF') [hx, hz] = inBox(p);
      else if (p.team !== R.team) { const g = SOC.HL * T.dir; [hx, hz] = [g - T.dir * (3 + (p.i % 4) * 2.2), ((p.i % 4) - 1.5) * 3.2]; }
    }
    if (R.kind === 'penalty') {
      // everyone outside the box and the arc
      const g = SOC.HL * T.dir;
      hx = g - T.dir * (SOC.BOX + 2 + (p.i % 3) * 1.5); hz = ((p.i % 6) - 2.5) * 5;
    }
    // the other side stands off 9.15 m (free kicks, corners) / 2 m (throws)
    if (p.team !== R.team && R.kind !== 'penalty') {
      const keep = R.kind === 'throw' ? 2 : SOC.CIRCLE, dx = hx - R.x, dz = hz - R.z, d = Math.hypot(dx, dz);
      if (d < keep) { hx = R.x + dx / (d || 1) * keep; hz = R.z + dz / (d || 1) * keep; }
    }
    socSteer(p, hx, hz, false, dt, true);
  }
  // ready: the taker's there and it's been a moment
  const there = Math.hypot(tk.x - sx, tk.z - sz) < 0.7;
  const wait = soccer.headless ? 0.6 : R.kind === 'penalty' ? 2.6 : R.kind === 'throw' ? 1.0 : 1.6;
  if (!there || R.t < wait) return;
  tk.face = Math.atan2(ax, az); tk.vx = tk.vz = 0;
  if (!R.whistled && (R.kind === 'penalty' || R.kind === 'free')) { R.whistled = true; socEvent(M, 'whistle', { kind: R.kind }); }
  // the human takes his own (pass / shoot), with a timeout
  if (T.human && M.ctl === tk) {
    const I = M.input;
    B.owner = tk; tk.holdT = 1;
    const sx2 = I.x || 0, sz2 = I.z || 0, dir = Math.hypot(sx2, sz2) > 0.2 ? Math.atan2(sx2, sz2) : tk.face;
    let go = false;
    if (R.kind === 'penalty') { if (I.shootUp) { const z = socClamp(sz2 * 2.8, -SOC.GW + 0.4, SOC.GW - 0.4); M.phase = 'play'; M.restart = null; socShoot(M, tk, socClamp((M.shoot ? M.shoot.t : 0.5) / 0.9, 0.3, 1), z, 0.5 + Math.abs(sx2) * 0.8); M.lastKick = M.lastKick || {}; go = true; } }
    else if (I.pass || I.through || I.lob) { M.phase = 'play'; M.restart = null; socHumanPass(M, tk, dir, I.pass ? 'pass' : I.through ? 'through' : 'lob'); go = true; }
    else if (I.shootUp && (R.kind === 'free')) { M.phase = 'play'; M.restart = null; socShoot(M, tk, socClamp((M.shoot ? M.shoot.t : 0.6) / 0.9, 0.3, 1), socClamp(sz2 * 2.8, -3, 3), 1.2); go = true; }
    if (I.shootHeld) { M.shoot = M.shoot || { t: 0 }; M.shoot.t = Math.min(1.1, M.shoot.t + dt); }
    I.pass = I.through = I.lob = I.shootUp = false;
    if (!go && R.t < wait + 12) { B.owner = null; return; }
    if (!go) { M.phase = 'play'; M.restart = null; socCarrierAI(M, tk, 1); }
    socAfterRestart(M, R);
    return;
  }
  // the CPU takes it
  M.phase = 'play'; M.restart = null;
  B.owner = tk; tk.holdT = 1; tk.think = 0;
  if (R.kind === 'penalty') {
    const z = (socRnd() < 0.5 ? -1 : 1) * (1.2 + socRnd() * 1.9);
    socShoot(M, tk, 0.62 + socRnd() * 0.28, z, 0.3 + socRnd() * 1.2);
  } else if (R.kind === 'free' && Math.hypot(gx - R.x, R.z) < 28 && socShotQ(M, tk) > 0.06) {
    socShoot(M, tk, 0.7 + socRnd() * 0.2, (socRnd() < 0.5 ? -1 : 1) * (SOC.GW - 0.7), 1.6 + socRnd() * 0.6);
  } else if (R.kind === 'corner') {
    const tgts = T.players.filter((q) => socInBox(O, q.x, q.z, true));
    const r = tgts[(socRnd() * tgts.length) | 0];
    if (r) socPassTo(M, tk, r.x, r.z, 'cross', r); else socCarrierAI(M, tk, 1);
  } else if (R.kind === 'goalkick') {
    const fw = T.players.filter((q) => q.role !== 'GK').sort((a, b) => socTX(T, b.x) - socTX(T, a.x))[(socRnd() * 4) | 0];
    socPassTo(M, tk, fw.x, fw.z, 'lob', fw);
  } else {
    tk.holdT = 1; tk.think = 0;
    const r = socBestMate(M, tk, 4);
    if (r) socPassTo(M, tk, r.x, r.z, R.kind === 'throw' ? 'pass' : (Math.hypot(r.x - tk.x, r.z - tk.z) > 30 ? 'lob' : 'pass'), r);
  }
  socAfterRestart(M, R);
}
function socAfterRestart(M, R) {
  if (M.lastKick && R.kind === 'penalty') M.lastKick.pen = true;
  if (M.lastKick && R.kind === 'throw') { M.lastKick.kind = 'pass'; const k = M.lastKick; k.throw = true; if (R.taker) { R.taker.act = { kind: 'throw', t: 0.5 }; R.taker.actT = 0; } }
  socEvent(M, 'restarted', { kind: R.kind, team: R.team });
}

// ---- the penalty shootout (a cup tie level after 90) --------------------------------------------------------------------------
function socPensStart(M) {
  M.phase = 'pens'; M.phaseT = 0;
  M.pens = { n: [0, 0], g: [0, 0], turn: 0, kick: null, t: 0, done: false, log: [[], []], end: SOC.HL };
  socEvent(M, 'shootout', {});
}
function socPensStep(M, dt) {
  const P = M.pens, B = M.ball;
  P.t += dt;
  const shoot = M.T[P.turn], keep = M.T[1 - P.turn];
  const gk = keep.players.find((q) => q.role === 'GK') || keep.players[0];
  // set up a kick
  if (!P.kick) {
    const takers = shoot.players.filter((q) => q.role !== 'GK').sort((a, b) => b.st.shot - a.st.shot);
    const tk = takers[P.n[P.turn] % takers.length];
    P.kick = { tk, t: 0, shot: false };
    const g = P.end, dirIn = 1;
    void dirIn;
    Object.assign(B, { x: g - SOC.PEN, z: 0, y: SOC.R, vx: 0, vy: 0, vz: 0, owner: null, inNet: 0 });
    for (const p of M.players) { p.act = null; p.stun = 0; if (p !== tk && p !== gk) { p.x = (p.team === 0 ? -1 : 1) * 2 + ((p.i % 5) - 2) * 1.2; p.z = -2 - (p.team === 0 ? 0 : 2) - (p.i % 2); } }
    tk.x = B.x - 1.8; tk.z = 0; tk.face = Math.PI / 2;
    gk.x = g - 0.1; gk.z = 0; gk.face = -Math.PI / 2;
    // the shootout is at the +x end for both sides: the shooter's side attacks +x
    shoot.dirSave = shoot.dir; keep.dirSave = keep.dir; shoot.dir = 1; keep.dir = -1;
    M.lastKick = null;
    if (shoot.human) M.ctl = tk; else if (keep.human) M.ctl = gk;
    return;
  }
  const K = P.kick, tk = K.tk;
  K.t += dt;
  for (const p of M.players) if (p.act) socAct(M, p, dt);
  socBallStep(M, dt);
  if (!B.owner) socTouch(M, dt);
  if (B.owner === tk) socCarry(M, tk, dt);
  if (!K.shot && K.t > (soccer.headless ? 0.3 : 1.8)) {
    const I = M.input;
    let go = false, z = 0, y = 0.6, pw = 0.75;
    if (shoot.human && M.ctl === tk) {
      if (I.shootHeld) { M.shoot = M.shoot || { t: 0 }; M.shoot.t = Math.min(1.1, M.shoot.t + dt); }
      if (I.shootUp) { go = true; z = socClamp((I.z || 0) * 2.9, -SOC.GW + 0.3, SOC.GW - 0.3); y = 0.4 + Math.abs(I.x || 0) * 1.4; pw = socClamp((M.shoot ? M.shoot.t : 0.5) / 0.9, 0.3, 1.05); M.shoot = null; }
      I.shootUp = false;
      if (K.t > 12) go = true;
    } else { go = true; z = (socRnd() < 0.5 ? -1 : 1) * (0.9 + socRnd() * 2.3); y = 0.3 + socRnd() * 1.3; pw = 0.6 + socRnd() * 0.32; }
    if (go) {
      K.shot = true; B.owner = tk; tk.holdT = 1;
      socShoot(M, tk, pw, z, y);
      tk.act.wind = 0.25;
      // the keeper guesses (the human keeper dives with the stick at the kick)
      const guess = keep.human && M.ctl === gk ? Math.sign(I.z || 0) : (socRnd() < 0.15 ? 0 : socRnd() < 0.5 ? -1 : 1);
      K.guess = guess;
    }
    return;
  }
  if (K.shot && !K.dived && M.lastKick && M.lastKick.kind === 'shot' && !B.owner) {
    K.dived = true;
    if (K.guess) { gk.act = { kind: 'dive', dur: 0.42, x0: gk.x, z0: gk.z, x1: gk.x - 0.3, z1: gk.z + K.guess * 2.6, y1: 0.6, dz: K.guess }; gk.actT = 0; }
  }
  // the result: in the net, or saved / wide / over
  if (K.shot && !K.res) {
    if (B.x > P.end + SOC.R && Math.abs(B.z) < SOC.GW && B.y < SOC.GH) K.res = 'goal';
    else if (B.x > P.end + 1 || Math.abs(B.z) > SOC.GW + 6 || (M.lastKick && M.t - M.lastKick.t > 2.2 && Math.hypot(B.vx, B.vz) < 3) || B.owner === gk) K.res = 'miss';
    if (K.res) {
      P.n[P.turn]++; if (K.res === 'goal') P.g[P.turn]++;
      P.log[P.turn].push(K.res === 'goal');
      socEvent(M, K.res === 'goal' ? 'pen_goal' : 'pen_miss', { team: P.turn, p: tk, n: P.n.slice(), g: P.g.slice() });
      K.endT = P.t;
    }
  }
  if (K.res && P.t - K.endT > (soccer.headless ? 0.2 : 2.2)) {
    shoot.dir = shoot.dirSave; keep.dir = keep.dirSave;
    // decided? (best of five, then sudden death)
    const [a, b] = P.n, [ga, gb] = P.g;
    let win = -1;
    if (a <= 5 && b <= 5) { if (ga > gb + (5 - b)) win = 0; else if (gb > ga + (5 - a)) win = 1; }
    if (a >= 5 && b >= 5 && a === b && ga !== gb) win = ga > gb ? 0 : 1;
    if (win >= 0) { P.done = true; P.win = win; M.phase = 'over'; M.phaseT = 0; socEvent(M, 'fulltime', { score: M.score.slice(), pens: P.g.slice(), win }); }
    else { P.turn = 1 - P.turn; P.kick = null; }
  }
}

// ---- keeping them apart (no one stands inside anyone) ---------------------------------------------------------------------------
function socSeparate(M) {
  const P = M.players, n = P.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const A = P[a], Bq = P[b];
    if (A.act && A.act.kind === 'slide' || Bq.act && Bq.act.kind === 'slide') continue;
    const dx = Bq.x - A.x, dz = Bq.z - A.z, d2 = dx * dx + dz * dz;
    if (d2 > 0.49 || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), push = (0.7 - d) * 0.5, nx = dx / d * push, nz = dz / d * push;
    A.x -= nx; A.z -= nz; Bq.x += nx; Bq.z += nz;
  }
}

// ---- the result: what a match paid --------------------------------------------------------------------------------------------
// a goal for the human side pays, a win pays more, a clean sheet a little (× the tier's mult, perFlyer-scaled)
function socPay(M, units, why) {
  if (typeof storm === 'undefined' || !storm.running || M.human < 0) return 0;
  const worth = Math.max(1, Math.round((storm.perFlyer || 1) * units * M.tier.mult));
  storm.caught += worth; soccer.earned += worth;
  if (soccer.onPay) soccer.onPay(worth, why);
  return worth;
}

// ---- the test seam: whole matches headless (soccerDebug.match({ … }) → the stats) -----------------------------------------------
window.soccerDebug = {
  match(opts) {
    const was = soccer.headless; soccer.headless = true;
    const M = socNewMatch(Object.assign({ home: 'rovers', away: 'sauce', human: -1, tier: 1, halfSecs: 120 }, opts || {}));
    let steps = 0, lastBall = [0, 0], still = 0;
    while (M.phase !== 'over' && steps < 60 * 60 * 30) {
      socStep(M, SOC_DT); steps++;
      if (M.phase === 'halftime' && M.phaseT > 0.1) socSecondHalf(M);
      // stuck watch: the ball not moving in open play for 12 s
      const B = M.ball;
      if (M.phase === 'play' && Math.hypot(B.x - lastBall[0], B.z - lastBall[1]) < 0.05) { still += SOC_DT; if (still > 12) { M.stats.stuck++; still = 0; socSetRestart(M, 'free', B.owner ? B.owner.team : 0, B.x, B.z); } } else still = 0;
      lastBall = [B.x, B.z];
    }
    soccer.headless = was;
    const tot = M.stats.possT[0] + M.stats.possT[1] || 1;
    return { score: M.score, pens: M.pens && M.pens.g, stats: M.stats, poss: Math.round(M.stats.possT[0] / tot * 100), secs: Math.round(steps / 60), events: M.events.length };
  },
  get m() { return soccer.m; },
  new(opts) { return socNewMatch(opts); },
  step(secs) { const M = soccer.m; const n = Math.round(secs / SOC_DT); for (let k = 0; k < n && M.phase !== 'over'; k++) { socStep(M, SOC_DT); if (M.phase === 'halftime' && M.phaseT > 0.1 && soccer.headless) socSecondHalf(M); } return M; },
};
