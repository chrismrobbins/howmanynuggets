// ---- STORM DRAIN -----------------------------------------------------------------
// "ALL PIPES LEAD TO THE HARBOR."
//
// A one-more-dive vertical descender (mode key: drain), game 14 — the FOURTH
// street game. Entry: the grate in the gutter outside the arcade, the one that
// glows gold after it rains. You're a nug in a brass diving helm, dropping
// through the flooded maintenance drains under Nuggetown. Steer with ← →,
// HOLD space/↑ (or hold the screen) to kick against the sink — kicking burns
// air faster, and air is the whole game. Bubbles top you up, grease and
// sporks knock it out of you, THE CLOGS only leave one way through.
//
// And the lore: Detective Dill keeps saying the pier is where the case lives.
// The pipes disagree. Sink past 400 meters and the water goes still, the walls
// light up gold, and something VERY large passes through the mains heading
// harbor-side. It does not stop. It does not surface. The case is still open —
// it just grew a basement. (Sets localStorage `nugDrainStorm`, read via
// drainSawStorm() — street NPCs react, same contract as nugReelStorm.)
//
// Low-res pixel canvas scaled up (reel/brawl school). Scoring mirrors the other
// games: every meter and every pickup pays perFlyer-scaled points into
// storm.caught; golden nugs are the 10× tier; the passing storm is the jackpot.

const drainWorld = document.getElementById('drainWorld');

const DRAIN_PXM = 8;          // world pixels per meter of depth
const DRAIN_AIR_MAX = 100;
const DRAIN_HIT_AIR = 14;     // air lost to a hazard
const DRAIN_BUBBLE_AIR = 16;  // air gained from a bubble
const DRAIN_GRACE = 2.0;      // seconds of free air at the top of every dive
const DRAIN_STORM_FIRST_M = 400;  // the first pass-through of a run
const DRAIN_STORM_EVERY_M = 750;  // ...and again every this-much deeper
const DRAIN_STORM_MULT = 500;     // jackpot the first time EVER (250 after)

// Sublevel names, one every 150m. Past the list the map just… ends.
const DRAIN_SUBLEVELS = [
  'THE GUTTER LINE', 'THE GREASE TRAP', 'THE COLD MAINS', 'THE ECHO PIPES',
  'THE FORGOTTEN LOCKS', 'THE OUTFALL THROAT', 'UNCHARTED — THE MAP ENDS HERE',
];

// Depth tiers (ArcadeKit oath). burn scales air use, speed scales the sink,
// mult scales pay. THE UNDERTOW opens once the pipes have shown you what
// swims in them — the deep only pulls on those it has already met.
const DRAIN_TIERS = [
  { key: 'gutter',   emoji: '🕳️', name: 'THE GUTTERS',  mult: 1, burn: 0.8,  speed: 0.85, blurb: 'storm water, streetlight from above' },
  { key: 'mains',    emoji: '🌊', name: 'THE MAINS',    mult: 2, burn: 1.0,  speed: 1.0,  blurb: 'the real dark — the pipes talk' },
  { key: 'undertow', emoji: '🌀', name: 'THE UNDERTOW', mult: 3, burn: 1.25, speed: 1.18, blurb: 'the harbor pulls back',
    lockNote: 'meet what lives down there' },
];

// ---- 🏷️ THE DPW SALVAGE TAGS -----------------------------------------------------
// Eight brass tags wired to eight things the pipes swallowed and never gave
// back. Every one sits at a fixed depth — the deep ones are a real ask — and
// once you've cut one loose it stays cut loose (bitmask `nugDrainTags`). They
// are not treasure. They're PAPERWORK, which is worse, and Det. Dill will want
// every last one. All eight = drainSalvageDone(), a canon flag the noticeboard
// outside the arcade reads. (Canon-safe: tags are evidence, never resolution.)
const DRAIN_TAGS = [
  { m: 60,  name: 'TAG 001 · A HALL TOKEN',
    note: 'arcade brass. worn smooth. somebody played a LOT of catch.' },
  { m: 140, name: 'TAG 014 · A BUS TRANSFER',
    note: 'punched 3:04 AM. the last bus is 1:15. so that was not a bus.' },
  { m: 230, name: 'TAG 027 · A TANKER GASKET',
    note: 'rated for slurry. syndicate part number. riding low will do that.' },
  { m: 330, name: 'TAG 038 · A DPW WORK ORDER',
    note: '"MAIN 12 — DO NOT DIVE." signed. countersigned. never actioned.' },
  { m: 440, name: 'TAG 049 · HALF A MANIFEST PAGE',
    note: 'a column of weights, no destination. the other half went in the bay.' },
  { m: 560, name: 'TAG 055 · A CATCH-CABINET KEY',
    note: 'cut for the taped-off cabinet. down here. eleven pipes from the hall.' },
  { m: 700, name: 'TAG 068 · A PRESSURE CHART',
    note: 'the gauge Big Crumb filed about. it redlines, then it flatlines.' },
  { m: 860, name: 'TAG 077 · A HANDWRITTEN NOTE',
    note: '"it likes the pipes better than the bay. leave it a door." unsigned.' },
];

function drainTagMask() {
  try { return +(localStorage.getItem('nugDrainTags') || 0) || 0; } catch (e) { return 0; }
}
function drainHasTag(i) { return (drainTagMask() & (1 << i)) !== 0; }
function drainSaveTag(i) {
  try { localStorage.setItem('nugDrainTags', String(drainTagMask() | (1 << i))); } catch (e) { /* ok */ }
}
function drainTagCount() {
  const m = drainTagMask();
  let n = 0;
  for (let i = 0; i < DRAIN_TAGS.length; i++) if (m & (1 << i)) n++;
  return n;
}
// Every tag pulled out of the mains. Street NPCs + the NPD noticeboard react.
function drainSalvageDone() { return drainTagCount() >= DRAIN_TAGS.length; }

const drain = {
  on: false,
  cv: null, g: null, banner: null, bannerT: null,
  W: 0, Hh: 0, scale: 1,
  t: 0,
  phase: 'title',    // tier | dive | out
  seed: 0,
  // the diver
  x: 0, vx: 0, vy: 0,
  depth: 0,          // world px below the surface
  air: DRAIN_AIR_MAX,
  iframes: 0,
  kicking: false,
  keys: {},
  pointerX: null,    // touch/mouse steer target (canvas px), null = keyboard
  // the shaft
  ents: [],          // { kind, x, d, ... } — d is depth in world px
  nextSpawnD: 0,
  nextClogD: 0,
  trail: [],         // the diver's own bubbles
  motes: [],         // drifting specks that sell the descent
  // THE PASSING
  storm: null,       // { t, dur, paid } while the gold thing is in the pipes
  nextStormM: DRAIN_STORM_FIRST_M,
  sawThisRun: false,
  tagSpawned: [],    // 🏷️ salvage tags already dropped into THIS dive's shaft
  tagsThisRun: 0,
  // milestones + session ledger
  nextSubIdx: 0,
  payFrac: 0,        // fractional meters banked toward the next payout
  combo: 0,
  nugs: 0,
  deepest: 0,        // meters, best this session
  dives: 0,
  outT: 0,
  // ---- oath ----
  cfg: DRAIN_TIERS[1],
  tierIdx: 1,
  tierPick: null,
};

function drainActive() {
  return storm.mode === 'drain' && storm.running;
}

// Did any dive ever meet the thing in the pipes? Street NPCs react (js/arcade.js).
function drainSawStorm() {
  try { return localStorage.getItem('nugDrainStorm') === '1'; } catch (e) { return false; }
}

function drainTally() {
  if (drain.phase === 'tier') return '🕳️ how deep does it go…';
  if (drain.phase === 'out') return '🫧 surfaced · deepest ' + Math.round(drain.deepest) + 'm';
  const m = Math.round(drain.depth / DRAIN_PXM);
  const tags = drainTagCount();
  return '🕳️ ' + m + 'm · 🫧 ' + Math.max(0, Math.round(drain.air)) + '%' +
    (drain.combo >= 2 ? ' · 🔥x' + drain.combo : '') +
    (tags > 0 ? ' · 🏷️ ' + tags + '/' + DRAIN_TAGS.length : '') +
    (drain.sawThisRun ? ' · 🌪️ IT PASSED' : '');
}

// ---- setup ---------------------------------------------------------------------------

function drainLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  drain.scale = Math.max(2, Math.floor(vh / 270));
  drain.W = Math.ceil(vw / drain.scale);
  drain.Hh = Math.ceil(vh / drain.scale);
  drain.cv.width = drain.W;
  drain.cv.height = drain.Hh;
  drain.g.imageSmoothingEnabled = false;
  drain.motes = [];
  for (let i = 0; i < 26; i++)
    drain.motes.push({ x: Math.random() * drain.W, y: Math.random() * drain.Hh, s: 0.3 + Math.random() * 0.8 });
}

function syncDrain() {
  const active = drainActive();
  if (active === drain.on) return;
  drain.on = active;
  document.body.classList.toggle('drain-mode', active);
  if (active) {
    if (!drain.cv) {
      drain.cv = document.createElement('canvas');
      drain.g = drain.cv.getContext('2d');
      drainWorld.appendChild(drain.cv);
      drain.banner = document.createElement('div');
      drain.banner.className = 'drain-banner';
      drainWorld.appendChild(drain.banner);
    }
    // the amount input autofocuses on load and eats space/arrows — let go of it
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    drain.seed = Math.random() * 1000;
    drain.t = 0;
    drain.keys = {};
    drain.pointerX = null;
    drain.combo = 0; drain.nugs = 0; drain.deepest = 0; drain.dives = 0;
    drain.payFrac = 0;
    drainLayout();
    openDrainTier();
  } else {
    if (drain.tierPick) { drain.tierPick.close(); drain.tierPick = null; }
    drain.banner && drain.banner.classList.remove('show');
  }
}

function openDrainTier() {
  drain.phase = 'tier';
  const tiers = DRAIN_TIERS.map((t) =>
    t.key === 'undertow' && !drainSawStorm() ? { ...t, locked: true } : t);
  const tags = drainTagCount();
  drain.tierPick = ArcadeKit.tierSelect({
    storeKey: 'drain',
    title: '🕳️ How deep?',
    note: tags > 0 && !drainSalvageDone()
      ? '🏷️ DPW SALVAGE ' + tags + '/' + DRAIN_TAGS.length + ' — the rest are deeper'
      : (drainSalvageDone() ? '🏷️ every tag pulled · the undertow remembers you · 1 · 2 · 3'
        : (drainSawStorm() ? 'the undertow remembers you · 1 · 2 · 3' : '← → steer · HOLD space/↑ to kick · mind the 🫧')),
    tiers,
    onPick: (key, t) => { drain.tierPick = null; drainApplyTier(key, t); },
  });
}

function drainApplyTier(key, t) {
  drain.cfg = t;
  drain.tierIdx = DRAIN_TIERS.findIndex((x) => x.key === key);
  drainNewDive();
  drainBanner(t.emoji + ' ' + t.name, 'go', 1.4);
}

// Reset the shaft for a fresh drop. The session ledger (nugs/deepest/score)
// survives — one storm session, many dives, reel-style.
function drainNewDive() {
  drain.phase = 'dive';
  drain.t = 0;
  drain.x = drain.W / 2;
  drain.vx = 0; drain.vy = 0;
  drain.depth = 0;
  drain.air = DRAIN_AIR_MAX;
  drain.iframes = 0;
  drain.ents = [];
  drain.trail = [];
  drain.nextSpawnD = drain.Hh * 0.7;
  drain.nextClogD = drain.Hh * 2.2;
  drain.nextSubIdx = 0;
  drain.nextStormM = DRAIN_STORM_FIRST_M;
  drain.storm = null;
  drain.sawThisRun = false;
  drain.tagSpawned = [];
  drain.tagsThisRun = 0;
  drain.combo = 0;
  drain.dives++;
}

function drainBanner(text, cls, secs) {
  drain.banner.textContent = text;
  drain.banner.className = 'drain-banner show' + (cls ? ' ' + cls : '');
  void drain.banner.offsetWidth;
  clearTimeout(drain.bannerT);
  drain.bannerT = setTimeout(() => drain.on && drain.banner.classList.remove('show'), (secs || 1.6) * 1000);
}

// ---- scoring (perFlyer-scaled, reel-style combo) ---------------------------------------

function drainPay(mult, label, golden) {
  const comboFactor = 1 + Math.min(Math.max(drain.combo - 1, 0), 20) * 0.1; // up to 3×
  const worth = Math.max(1, Math.round(storm.perFlyer * mult * comboFactor * drain.cfg.mult));
  storm.caught += worth;
  if (label) {
    spawnPopLabel(drain.x * drain.scale, (drain.Hh * 0.3) * drain.scale,
      label + ' +' + fmt.format(worth), golden ? 'golden' : '');
  }
  updateStormHud();
  return worth;
}

// Depth pays quietly, a meter at a time — no confetti for gravity.
function drainPayDepth(meters) {
  drain.payFrac += meters;
  const whole = Math.floor(drain.payFrac);
  if (whole < 1) return;
  drain.payFrac -= whole;
  storm.caught += Math.max(1, Math.round(storm.perFlyer * whole * drain.cfg.mult));
}

// ---- the shaft -----------------------------------------------------------------------

// The drain walls wander and breathe with depth. Everything below asks these
// two functions where the water is; the diver, spawns, and draw all agree.
function drainWallL(d) {
  const t = d * 0.004 + drain.seed;
  const c = drain.W / 2 + Math.sin(t) * drain.W * 0.13 + Math.sin(t * 0.37 + 2.1) * drain.W * 0.05;
  const half = drainHalf(d);
  return c - half;
}
function drainWallR(d) {
  const t = d * 0.004 + drain.seed;
  const c = drain.W / 2 + Math.sin(t) * drain.W * 0.13 + Math.sin(t * 0.37 + 2.1) * drain.W * 0.05;
  return c + drainHalf(d);
}
function drainHalf(d) {
  const breathe = Math.sin(d * 0.0021 + drain.seed * 1.7) * drain.W * 0.08;
  const squeeze = Math.min(d / (DRAIN_PXM * 900), 1) * drain.W * 0.06; // the deep narrows
  return Math.max(drain.W * 0.16, drain.W * 0.30 + breathe - squeeze);
}

// One entity every 55–110 px of depth, weighted by how deep the shaft has
// gotten. Clogs run on their own, slower clock.
function drainSpawnAhead() {
  const horizon = drain.depth + drain.Hh * 1.6;
  while (drain.nextSpawnD < horizon) {
    const d = drain.nextSpawnD;
    const meters = d / DRAIN_PXM;
    const L = drainWallL(d) + 8, R = drainWallR(d) - 8;
    const x = L + Math.random() * Math.max(1, R - L);
    const roll = Math.random();
    if (roll < 0.30) {
      drain.ents.push({ kind: 'nug', x, d, bob: Math.random() * 7 });
    } else if (roll < 0.34) {
      drain.ents.push({ kind: 'golden', x, d, bob: Math.random() * 7 });
    } else if (roll < 0.54) {
      drain.ents.push({ kind: 'bubble', x, d, wob: Math.random() * 7, r: 4 + Math.random() * 3 });
    } else if (roll < 0.70) {
      drain.ents.push({ kind: 'grease', x, d, wob: Math.random() * 7, r: 9 + Math.random() * 5 });
    } else if (roll < 0.82) {
      drain.ents.push({ kind: 'spork', x, d, rot: Math.random() * 7, vr: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2), dx: (Math.random() - 0.5) * 18 });
    } else if (roll < 0.92 && meters > 120) {
      // batter eel: swims across the shaft, sine-riding
      const dir = Math.random() < 0.5 ? 1 : -1;
      drain.ents.push({ kind: 'eel', x: dir === 1 ? L - 30 : R + 30, d, dir, spd: 26 + Math.random() * 18, amp: 6 + Math.random() * 8, ph: Math.random() * 7 });
    } else if (meters > 80) {
      // fry jet: a wall pipe that blasts a current across the shaft on a cycle
      const side = Math.random() < 0.5 ? 'L' : 'R';
      drain.ents.push({ kind: 'jet', side, d, cyc: 2.0 + Math.random() * 1.4, ph: Math.random() * 3, reach: 0.42 + Math.random() * 0.18 });
    } else {
      drain.ents.push({ kind: 'nug', x, d, bob: Math.random() * 7 });
    }
    const meterSquish = Math.min(meters / 700, 1) * 22;
    drain.nextSpawnD += 55 + Math.random() * (110 - meterSquish) - meterSquish;
  }
  // 🏷️ salvage tags sit at FIXED depths — the pipes filed them there, and the
  // pipes do not reshuffle. One per dive per tag, and only ones you still owe.
  for (let ti = 0; ti < DRAIN_TAGS.length; ti++) {
    if (drain.tagSpawned[ti] || drainHasTag(ti)) continue;
    const td = DRAIN_TAGS[ti].m * DRAIN_PXM;
    if (td > horizon || td < drain.depth) continue;
    drain.tagSpawned[ti] = true;
    const L = drainWallL(td) + 12, R = drainWallR(td) - 12;
    drain.ents.push({ kind: 'tag', idx: ti, x: (L + R) / 2 + (Math.random() - 0.5) * (R - L) * 0.5, d: td, bob: Math.random() * 7 });
  }
  while (drain.nextClogD < horizon) {
    const d = drain.nextClogD;
    const L = drainWallL(d), R = drainWallR(d);
    const gw = Math.max(26, 40 - (d / DRAIN_PXM) * 0.012);
    const gx = L + 14 + Math.random() * Math.max(1, (R - L) - 28 - gw);
    drain.ents.push({ kind: 'clog', d, gx, gw, crossed: false, junk: Math.floor(Math.random() * 4) });
    drain.nextClogD += 420 + Math.random() * 260;
  }
}

// ---- the dive ------------------------------------------------------------------------

function drainHit(label) {
  if (drain.iframes > 0 || drain.storm) return; // the passing stills the water
  drain.iframes = 1.15;
  drain.combo = 0;
  drain.air = Math.max(0, drain.air - DRAIN_HIT_AIR);
  ArcadeKit.kick(7, 240);
  ArcadeKit.hitStop(70);
  if (label) {
    spawnPopLabel(drain.x * drain.scale, (drain.Hh * 0.3) * drain.scale, label, '');
  }
}

function stepDrain(dt, w, h) {
  if (!drain.on) return;
  dt *= ArcadeKit.refreshTimeScale();
  drain.t += dt;
  if (drain.phase === 'tier') { drainDraw(); return; }

  if (drain.phase === 'out') {
    drain.outT += dt;
    drainDraw();
    return;
  }

  const cfg = drain.cfg;
  const stormCalm = drain.storm ? 0.35 : 1;

  // ---- steering ----
  const accel = 420;
  let dir = 0;
  if (drain.keys.left) dir -= 1;
  if (drain.keys.right) dir += 1;
  if (drain.pointerX != null) {
    const dxp = drain.pointerX - drain.x;
    if (Math.abs(dxp) > 4) dir = Math.sign(dxp) * Math.min(1, Math.abs(dxp) / 30);
  }
  drain.vx += dir * accel * dt;
  drain.vx *= Math.max(0, 1 - 4.2 * dt);           // water drag
  drain.vx = Math.max(-130, Math.min(130, drain.vx));

  // ---- the sink ----
  const meters = drain.depth / DRAIN_PXM;
  const sinkBase = (34 + Math.min(meters * 0.03, 26)) * cfg.speed * stormCalm;
  const target = drain.kicking ? -40 * stormCalm : sinkBase;
  drain.vy += (target - drain.vy) * 3.4 * dt;
  drain.depth = Math.max(0, drain.depth + drain.vy * dt);
  drain.x += drain.vx * dt;

  // walls shepherd, they don't bite
  const L = drainWallL(drain.depth) + 6, R = drainWallR(drain.depth) - 6;
  if (drain.x < L) { drain.x = L; drain.vx = Math.abs(drain.vx) * 0.25; }
  if (drain.x > R) { drain.x = R; drain.vx = -Math.abs(drain.vx) * 0.25; }

  // ---- air ----
  if (drain.t > DRAIN_GRACE) {
    const burn = 3.0 * cfg.burn * (drain.kicking ? 1.5 : 1) * stormCalm;
    drain.air -= burn * dt;
  }
  drain.iframes = Math.max(0, drain.iframes - dt);

  const newM = drain.depth / DRAIN_PXM;
  if (drain.vy > 0) drainPayDepth((drain.vy * dt) / DRAIN_PXM);
  if (newM > drain.deepest) drain.deepest = newM;

  // ---- sublevels ----
  const subDepth = (drain.nextSubIdx + 1) * 150;
  if (newM >= subDepth) {
    const name = DRAIN_SUBLEVELS[Math.min(drain.nextSubIdx, DRAIN_SUBLEVELS.length - 1)];
    drainBanner('▼ ' + subDepth + 'm — ' + name, '', 1.8);
    drain.nextSubIdx++;
  }

  // ---- THE PASSING ----
  if (!drain.storm && newM >= drain.nextStormM) {
    drain.storm = { t: 0, dur: 9, paid: false };
    drain.nextStormM += DRAIN_STORM_EVERY_M;
    drainBanner('…the water just went still.', 'storm', 2.2);
  }
  if (drain.storm) {
    drain.storm.t += dt;
    if (!drain.storm.paid && drain.storm.t > 2.4) {
      drain.storm.paid = true;
      const first = !drainSawStorm();
      try { localStorage.setItem('nugDrainStorm', '1'); } catch (e) { /* ok */ }
      drain.sawThisRun = true;
      drainPay(first ? DRAIN_STORM_MULT : DRAIN_STORM_MULT / 2, '🌪️✨', true);
      drainBanner(first
        ? '🌪️ SOMETHING GOLD IS PASSING THROUGH THE PIPES'
        : '🌪️ it remembers this stretch of pipe', 'storm', 2.6);
      ArcadeKit.burst(window.innerWidth / 2, window.innerHeight * 0.45,
        { n: 26, emoji: '✨', size: 18, speed: 340 });
    }
    if (drain.storm.t >= drain.storm.dur) drain.storm = null;
  }

  // ---- entities ----
  drainSpawnAhead();
  const cullAbove = drain.depth - drain.Hh;
  for (let i = drain.ents.length - 1; i >= 0; i--) {
    const e = drain.ents[i];
    if (e.kind === 'bubble') {
      e.d -= 26 * dt;                       // bubbles do what bubbles do
      e.x += Math.sin(drain.t * 3 + e.wob) * 8 * dt;
    } else if (e.kind === 'spork') {
      e.rot += e.vr * dt;
      e.x += e.dx * dt;
    } else if (e.kind === 'eel') {
      e.x += e.dir * e.spd * dt;
      if ((e.dir === 1 && e.x > drain.W + 40) || (e.dir === -1 && e.x < -40)) { drain.ents.splice(i, 1); continue; }
    }
    if (e.d < cullAbove && e.kind !== 'bubble') { drain.ents.splice(i, 1); continue; }
    if (e.d < drain.depth - drain.Hh * 1.2) { drain.ents.splice(i, 1); continue; }

    // collisions (diver is ~7px round; screen y of an entity = e.d - camTop)
    const dy = e.d - drain.depth;
    if (e.kind === 'clog') {
      if (!e.crossed && drain.depth + drain.vy * dt >= e.d && drain.depth < e.d + 4) {
        e.crossed = true;
        if (drain.x > e.gx && drain.x < e.gx + e.gw) {
          drain.combo++;
          drainPay(12, '🕳️ THREADED', false);
        } else {
          drainHit('💥 THE CLOG');
        }
      }
      continue;
    }
    const dx = e.x - drain.x;
    const rr2 = Math.hypot(dx, dy);
    if (e.kind === 'nug' && rr2 < 11) {
      drain.combo++; drain.nugs++;
      drainPay(6, '🍗', false);
      drain.ents.splice(i, 1);
    } else if (e.kind === 'golden' && rr2 < 12) {
      drain.combo++; drain.nugs++;
      drainPay(60, '✨🍗', true);
      ArcadeKit.burst(drain.x * drain.scale, drain.Hh * 0.32 * drain.scale, { n: 14, color: '#ffd23a', size: 7 });
      drain.ents.splice(i, 1);
    } else if (e.kind === 'tag' && rr2 < 15) {
      // a tag is a milestone, so the hitbox is forgiving and the pay is loud
      const T = DRAIN_TAGS[e.idx];
      drain.combo++;
      drainSaveTag(e.idx);
      drain.tagsThisRun++;
      drainPay(140, '🏷️', true);
      ArcadeKit.burst(drain.x * drain.scale, drain.Hh * 0.32 * drain.scale, { n: 16, color: '#c8a04a', size: 6 });
      drainBanner('🏷️ ' + T.name + ' — ' + T.note, 'tag', 3.4);
      if (drainSalvageDone()) {
        drainBanner('🗂️ ALL EIGHT TAGS — the DPW never filed one of these. call 555-DILL.', 'storm', 4.2);
        ArcadeKit.burst(window.innerWidth / 2, window.innerHeight * 0.45, { n: 24, emoji: '🏷️', size: 18, speed: 320 });
      }
      drain.ents.splice(i, 1);
    } else if (e.kind === 'bubble' && rr2 < 12) {
      drain.air = Math.min(DRAIN_AIR_MAX, drain.air + DRAIN_BUBBLE_AIR);
      drainPay(2, '🫧', false);
      drain.ents.splice(i, 1);
    } else if (e.kind === 'grease' && rr2 < e.r + 5) {
      drainHit('🟤 GREASED');
    } else if (e.kind === 'spork' && rr2 < 12) {
      drainHit('🍴 FORKED');
    } else if (e.kind === 'eel' && Math.abs(dy + Math.sin(e.x * 0.08 + e.ph) * e.amp) < 8 && Math.abs(dx) < 16) {
      drainHit('⚡ BATTERED');
    } else if (e.kind === 'jet') {
      // the current shoves you while the pipe is blowing
      const on = ((drain.t + e.ph) % e.cyc) < e.cyc * 0.42;
      if (on && Math.abs(dy) < 11) {
        const Lw = drainWallL(e.d), Rw = drainWallR(e.d);
        const reachPx = (Rw - Lw) * e.reach;
        const inBand = e.side === 'L' ? (drain.x > Lw && drain.x < Lw + reachPx)
                                      : (drain.x < Rw && drain.x > Rw - reachPx);
        if (inBand) drain.vx += (e.side === 'L' ? 1 : -1) * 300 * dt;
      }
    }
  }

  // the diver's own bubble trail
  if (Math.random() < dt * 8) {
    drain.trail.push({ x: drain.x + (Math.random() - 0.5) * 6, d: drain.depth - 4, r: 1 + Math.random() * 2, t: 0 });
  }
  for (let i = drain.trail.length - 1; i >= 0; i--) {
    const b = drain.trail[i];
    b.t += dt;
    b.d -= 34 * dt;
    if (b.t > 2.4) drain.trail.splice(i, 1);
  }

  // ---- out of air ----
  if (drain.air <= 0) {
    drain.phase = 'out';
    drain.outT = 0;
    const m = Math.round(newM);
    const md = ArcadeKit.medal(m, [150, 350, 650]);
    ArcadeKit.saveBest('drain', drain.cfg.key, m);
    drainBanner('🫧 OUT OF AIR — ' + m + 'm' + (md.emoji ? ' · ' + md.emoji + ' ' + md.label : '') +
      (drain.tagsThisRun ? ' · 🏷️ ' + drain.tagsThisRun + ' salvaged' : ''), 'over', 3.2);
    ArcadeKit.kick(10, 380);
  }

  drainDraw();
}

// Any press while surfaced starts the next dive.
function drainPress() {
  if (drain.phase === 'out' && drain.outT > 1.1) {
    drainNewDive();
    drainBanner('▼ DIVE ' + drain.dives, 'go', 1.1);
  } else {
    drain.kicking = true;
  }
}
function drainRelease() { drain.kicking = false; }

// ---- drawing ---------------------------------------------------------------------------

function drainDraw() {
  const g = drain.g, W = drain.W, H = drain.Hh;
  if (!g) return;
  const camTop = drain.depth - H * 0.30;   // diver rides 30% down the screen
  const meters = drain.depth / DRAIN_PXM;
  const deep = Math.min(meters / 600, 1);  // 0 surface → 1 abyss
  const sh = ArcadeKit.shakeXY();
  g.save();
  g.translate(Math.round(sh.x / drain.scale), Math.round(sh.y / drain.scale));

  // water column: teal gutter-light giving way to the abyss
  const grad = g.createLinearGradient(0, 0, 0, H);
  const st = drain.storm ? Math.sin(Math.min(drain.storm.t / 2, 1) * Math.PI) : 0;
  grad.addColorStop(0, drainMix('#0c3a44', '#050a12', deep, st));
  grad.addColorStop(1, drainMix('#07222e', '#03050a', deep, st));
  g.fillStyle = grad;
  g.fillRect(-2, -2, W + 4, H + 4);

  // streetlight god-rays, gone by 150m
  const rays = Math.max(0, 1 - meters / 150);
  if (rays > 0) {
    g.fillStyle = 'rgba(180,230,220,' + (0.05 * rays) + ')';
    for (let i = 0; i < 3; i++) {
      const rx = W * (0.3 + i * 0.22) + Math.sin(drain.t * 0.4 + i) * 6;
      g.beginPath();
      g.moveTo(rx - 4, -2); g.lineTo(rx + 10, -2);
      g.lineTo(rx + 26, H); g.lineTo(rx - 20, H);
      g.fill();
    }
  }

  // far wall: old brick arches drifting by at half speed (parallax)
  g.fillStyle = 'rgba(20,32,40,0.5)';
  const archH = 90;
  for (let ad = Math.floor(camTop * 0.5 / archH) * archH; ad < camTop * 0.5 + H + archH; ad += archH) {
    const ay = ad - camTop * 0.5;
    g.fillRect(0, ay, W, 3);
    g.beginPath();
    g.arc(W * 0.5 + Math.sin(ad * 0.01 + drain.seed) * W * 0.1, ay + archH * 0.55, archH * 0.42, Math.PI, 0);
    g.strokeStyle = 'rgba(26,42,52,0.6)';
    g.lineWidth = 4;
    g.stroke();
  }

  // THE PASSING: it swims behind the shaft, gold, endless, unbothered
  if (drain.storm) {
    const sT = drain.storm.t / drain.storm.dur;
    const sx = W * (1.25 - sT * 1.5);
    const sy = H * 0.45 + Math.sin(drain.storm.t * 1.3) * 6;
    g.save();
    g.globalAlpha = Math.sin(Math.min(sT * 1.15, 1) * Math.PI) * 0.85;
    // body: a long swirl of gold arcs
    for (let i = 0; i < 5; i++) {
      g.strokeStyle = i % 2 ? '#ffd23a' : '#ffb020';
      g.lineWidth = 7 - i;
      g.beginPath();
      g.arc(sx + i * 26, sy + Math.sin(drain.storm.t * 2 + i) * 4, 16 + i * 5,
        drain.storm.t * 1.5 + i, drain.storm.t * 1.5 + i + 4.2);
      g.stroke();
    }
    g.globalAlpha *= 0.35;
    g.fillStyle = '#ffd23a';
    g.beginPath(); g.arc(sx, sy, 44, 0, 7); g.fill();
    g.restore();
    // and the whole column catches the light
    g.fillStyle = 'rgba(255,200,60,' + (0.10 * st) + ')';
    g.fillRect(-2, -2, W + 4, H + 4);
  }

  // shaft walls, slime, and the odd wall pipe
  g.fillStyle = '#101b22';
  const step = 6;
  for (let y = -step; y < H + step; y += step) {
    const d = camTop + y;
    const L = drainWallL(d), R = drainWallR(d);
    g.fillRect(-2, y, L + 2, step + 1);
    g.fillRect(R, y, W - R + 2, step + 1);
  }
  g.fillStyle = 'rgba(57,255,122,0.10)'; // the slime line
  for (let y = -step; y < H + step; y += step) {
    const d = camTop + y;
    g.fillRect(drainWallL(d), y, 2, step + 1);
    g.fillRect(drainWallR(d) - 2, y, 2, step + 1);
  }
  // brick courses on the walls
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1;
  for (let bd = Math.floor(camTop / 22) * 22; bd < camTop + H + 22; bd += 22) {
    const y = bd - camTop;
    g.beginPath(); g.moveTo(0, y); g.lineTo(drainWallL(bd), y); g.stroke();
    g.beginPath(); g.moveTo(drainWallR(bd), y); g.lineTo(W, y); g.stroke();
  }

  // depth markers stencilled on the wall every 50m
  g.fillStyle = 'rgba(180,220,200,0.28)';
  g.font = '700 7px Consolas, monospace';
  g.textAlign = 'left';
  for (let mm = Math.ceil(camTop / DRAIN_PXM / 50) * 50; mm * DRAIN_PXM < camTop + H; mm += 50) {
    if (mm <= 0) continue;
    const y = mm * DRAIN_PXM - camTop;
    g.fillText(mm + 'm', drainWallL(mm * DRAIN_PXM) + 4, y - 2);
    g.fillRect(drainWallL(mm * DRAIN_PXM), y, 8, 1);
  }

  // motes drifting up — cheap speed lines
  g.fillStyle = 'rgba(150,200,190,0.25)';
  for (const mo of drain.motes) {
    mo.y -= (drain.vy * 0.8 + 8) * mo.s * 0.016;
    if (mo.y < -4) { mo.y = H + 4; mo.x = Math.random() * W; }
    if (mo.y > H + 6) { mo.y = -4; mo.x = Math.random() * W; }
    g.fillRect(mo.x, mo.y, 1, 1 + mo.s);
  }

  // ---- entities ----
  for (const e of drain.ents) {
    const y = e.d - camTop;
    if (y < -60 || y > H + 60) continue;
    if (e.kind === 'clog') {
      drainDrawClog(g, e, y, W);
    } else if (e.kind === 'nug' || e.kind === 'golden') {
      const bobY = y + Math.sin(drain.t * 2 + e.bob) * 1.5;
      if (e.kind === 'golden') {
        g.fillStyle = 'rgba(255,210,58,' + (0.25 + Math.sin(drain.t * 5) * 0.12) + ')';
        g.beginPath(); g.arc(e.x, bobY, 9, 0, 7); g.fill();
      }
      g.fillStyle = e.kind === 'golden' ? '#ffd23a' : '#e8a020';
      g.beginPath(); g.arc(e.x, bobY, 4.5, 0, 7); g.fill();
      g.fillStyle = e.kind === 'golden' ? '#fff3c0' : '#ffd166';
      g.fillRect(e.x - 2, bobY - 2, 2, 1); g.fillRect(e.x + 1, bobY + 1, 1, 1);
    } else if (e.kind === 'tag') {
      // brass rectangle on a bit of wire, turning slowly in the current
      const bobY = y + Math.sin(drain.t * 1.6 + e.bob) * 2;
      const sw = Math.abs(Math.cos(drain.t * 1.1 + e.bob));  // it turns edge-on and back
      g.fillStyle = 'rgba(200,160,74,' + (0.18 + Math.sin(drain.t * 4) * 0.08) + ')';
      g.beginPath(); g.arc(e.x, bobY, 12, 0, 7); g.fill();
      g.strokeStyle = '#8a7a5a';
      g.lineWidth = 1;
      g.beginPath(); g.arc(e.x, bobY - 6, 2.5, 0, 7); g.stroke();   // the wire loop
      g.fillStyle = '#c8a04a';
      g.fillRect(e.x - 3.5 * sw - 0.5, bobY - 4, 7 * sw + 1, 9);
      g.fillStyle = '#f0d9a0';
      if (sw > 0.5) { g.fillRect(e.x - 2, bobY - 2, 4, 1); g.fillRect(e.x - 2, bobY + 1, 3, 1); }
    } else if (e.kind === 'bubble') {
      g.strokeStyle = 'rgba(190,240,255,0.85)';
      g.lineWidth = 1;
      g.beginPath(); g.arc(e.x, y, e.r, 0, 7); g.stroke();
      g.fillStyle = 'rgba(190,240,255,0.25)';
      g.beginPath(); g.arc(e.x, y, e.r, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(e.x - e.r * 0.4, y - e.r * 0.5, 1.5, 1.5);
    } else if (e.kind === 'grease') {
      const wob = Math.sin(drain.t * 2.4 + e.wob);
      g.fillStyle = '#5a3a10';
      g.beginPath();
      g.ellipse(e.x, y, e.r + wob, e.r - wob, 0, 0, 7);
      g.fill();
      g.fillStyle = 'rgba(255,176,32,0.25)';
      g.beginPath(); g.ellipse(e.x - e.r * 0.25, y - e.r * 0.3, e.r * 0.35, e.r * 0.22, 0, 0, 7); g.fill();
    } else if (e.kind === 'spork') {
      g.save();
      g.translate(e.x, y);
      g.rotate(e.rot);
      g.fillStyle = '#a8b2c4';
      g.fillRect(-1.5, -10, 3, 16);       // handle
      g.fillRect(-5, -12, 10, 4);         // the bowl
      g.fillRect(-5, -14, 2, 3); g.fillRect(-1, -14, 2, 3); g.fillRect(3, -14, 2, 3); // tines
      g.restore();
    } else if (e.kind === 'eel') {
      g.strokeStyle = '#d8c46a';
      g.lineWidth = 4;
      g.beginPath();
      for (let s = 0; s < 22; s += 2) {
        const ex = e.x - e.dir * s;
        const ey = y + Math.sin((e.x - s) * 0.08 + e.ph) * e.amp;
        s === 0 ? g.moveTo(ex, ey) : g.lineTo(ex, ey);
      }
      g.stroke();
      g.fillStyle = '#0a0a12';
      const hy = y + Math.sin(e.x * 0.08 + e.ph) * e.amp;
      g.fillRect(e.x + e.dir * 2 - 1, hy - 2, 2, 2); // the eye
    } else if (e.kind === 'jet') {
      const Lw = drainWallL(e.d), Rw = drainWallR(e.d);
      const jx = e.side === 'L' ? Lw : Rw;
      const dir2 = e.side === 'L' ? 1 : -1;
      g.fillStyle = '#2a3644';
      g.fillRect(jx - (dir2 === 1 ? 0 : 8), y - 5, 8, 10); // the pipe stub
      const on = ((drain.t + e.ph) % e.cyc) < e.cyc * 0.42;
      if (on) {
        const reachPx = (Rw - Lw) * e.reach;
        g.fillStyle = 'rgba(255,220,150,0.22)';
        for (let s = 0; s < reachPx; s += 7) {
          const jy = y + Math.sin(drain.t * 14 + s) * 2;
          g.fillRect(jx + dir2 * s, jy - 2.5, 5, 5);
        }
      }
    }
  }

  // diver bubble trail
  g.strokeStyle = 'rgba(190,240,255,0.5)';
  g.lineWidth = 1;
  for (const b of drain.trail) {
    const y = b.d - camTop;
    g.beginPath(); g.arc(b.x, y, b.r, 0, 7); g.stroke();
  }

  // ---- the diver ----
  if (drain.phase !== 'out') {
    const dy2 = H * 0.30;
    const blink = drain.iframes > 0 && Math.floor(drain.t * 12) % 2 === 0;
    if (!blink) {
      const lean = Math.max(-0.4, Math.min(0.4, drain.vx / 220));
      g.save();
      g.translate(drain.x, dy2);
      g.rotate(lean);
      // headlamp cone first, from the helm, pointing down-current
      const lamp = g.createRadialGradient(0, 8, 2, 0, 26, 34);
      lamp.addColorStop(0, 'rgba(255,240,190,' + (0.24 + deep * 0.18) + ')');
      lamp.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = lamp;
      g.beginPath(); g.moveTo(-3, 4); g.lineTo(-14, 40); g.lineTo(14, 40); g.lineTo(3, 4); g.fill();
      // flippers, kicking when kicking
      const kick = Math.sin(drain.t * (drain.kicking ? 16 : 5)) * (drain.kicking ? 3 : 1.2);
      g.fillStyle = '#26e0ff';
      g.fillRect(-7, -8 + kick, 4, 3);
      g.fillRect(3, -8 - kick, 4, 3);
      // the nug
      g.fillStyle = '#e8a020';
      g.beginPath(); g.ellipse(0, 0, 6.5, 7.5, 0, 0, 7); g.fill();
      g.fillStyle = '#ffd166';
      g.fillRect(-3, -2, 2, 1); g.fillRect(1, 2, 1, 1);
      // the brass helm
      g.strokeStyle = '#c8a04a';
      g.lineWidth = 2;
      g.beginPath(); g.arc(0, 2, 8, Math.PI * 0.9, Math.PI * 0.1); g.stroke();
      g.fillStyle = 'rgba(200,240,255,0.9)';
      g.beginPath(); g.arc(0, 3, 3.4, 0, 7); g.fill();  // porthole
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(-1.5, 1.5, 1.5, 1.5);                  // porthole glint
      g.restore();
    }
  }

  // ---- HUD (in-canvas, pixel style) ----
  g.textAlign = 'left';
  g.font = '900 10px Consolas, monospace';
  g.fillStyle = '#bfe8dc';
  g.fillText(Math.round(meters) + 'm', 6, 12);
  if (drain.deepest > 0 && drain.dives > 1) {
    g.font = '700 7px Consolas, monospace';
    g.fillStyle = 'rgba(191,232,220,0.55)';
    g.fillText('best ' + Math.round(drain.deepest) + 'm', 6, 21);
  }
  // air bar
  const abW = Math.min(70, W * 0.3);
  const airQ = Math.max(0, drain.air) / DRAIN_AIR_MAX;
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(W - abW - 8, 6, abW, 7);
  g.fillStyle = airQ > 0.25 ? '#26e0ff' : (Math.floor(drain.t * 6) % 2 ? '#ff5252' : '#ff9a52');
  g.fillRect(W - abW - 7, 7, (abW - 2) * airQ, 5);
  g.font = '900 8px Consolas, monospace';
  g.fillStyle = '#bfe8dc';
  g.textAlign = 'right';
  g.fillText('🫧', W - abW - 11, 13);
  if (drain.combo >= 2) {
    g.textAlign = 'right';
    g.fillStyle = '#ffd23a';
    g.font = '900 9px Consolas, monospace';
    g.fillText('🔥x' + drain.combo, W - 8, 24);
  }

  // low-air vignette + out-of-air blackout
  if (drain.air < 30 && drain.phase === 'dive') {
    const q = 1 - drain.air / 30;
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(40,0,0,0)');
    vg.addColorStop(1, 'rgba(40,0,0,' + (0.5 * q * (0.8 + Math.sin(drain.t * 5) * 0.2)) + ')');
    g.fillStyle = vg;
    g.fillRect(-2, -2, W + 4, H + 4);
  }
  if (drain.phase === 'out') {
    g.fillStyle = 'rgba(2,4,8,' + Math.min(drain.outT * 1.4, 0.82) + ')';
    g.fillRect(-2, -2, W + 4, H + 4);
    if (drain.outT > 1.1) {
      g.textAlign = 'center';
      g.font = '900 9px Consolas, monospace';
      g.fillStyle = 0.5 + 0.5 * Math.sin(drain.t * 3) > 0.5 ? '#bfe8dc' : 'rgba(191,232,220,0.4)';
      g.fillText('press to dive again', W / 2, H * 0.62);
    }
  }
  g.restore();
}

function drainDrawClog(g, e, y, W) {
  const th = 13;
  g.fillStyle = '#3a2c14';
  g.fillRect(-2, y - th / 2, e.gx + 2, th);
  g.fillRect(e.gx + e.gw, y - th / 2, W - (e.gx + e.gw) + 2, th);
  // junk silhouettes packed into the clog, so it reads as garbage not geometry
  g.fillStyle = '#241a08';
  for (let x = 4; x < W - 6; x += 11) {
    if (x > e.gx - 8 && x < e.gx + e.gw + 2) continue;
    const j = (x * 7 + e.junk * 13) % 4;
    if (j === 0) g.fillRect(x, y - 5, 7, 4);
    else if (j === 1) { g.beginPath(); g.arc(x + 3, y + 2, 3.5, 0, 7); g.fill(); }
    else if (j === 2) g.fillRect(x + 1, y - 2, 3, 6);
    else g.fillRect(x, y + 1, 8, 3);
  }
  // the gap's edges glint — that's your way through
  g.fillStyle = 'rgba(57,255,122,0.5)';
  g.fillRect(e.gx - 1, y - th / 2, 2, th);
  g.fillRect(e.gx + e.gw - 1, y - th / 2, 2, th);
}

// Poor man's color lerp for the depth/storm tinting (hex in, rgb() out).
function drainMix(a, b, q, gold) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * q));
  if (gold) { m[0] = Math.min(255, m[0] + 70 * gold); m[1] = Math.min(255, m[1] + 50 * gold); }
  return 'rgb(' + m[0] + ',' + m[1] + ',' + m[2] + ')';
}

// ---- input -----------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (!drain.on || drain.phase === 'tier') return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { drain.keys.left = true; e.preventDefault(); }
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') { drain.keys.right = true; e.preventDefault(); }
  else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { drainPress(); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (!drain.on) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') drain.keys.left = false;
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') drain.keys.right = false;
  else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') drainRelease();
});
window.addEventListener('mousedown', (e) => {
  if (!drain.on || drain.phase === 'tier') return;
  if (e.target.closest('.storm-hud, .ak-tier, .modal-overlay')) return;
  drain.pointerX = e.clientX / drain.scale;
  drainPress();
});
window.addEventListener('mousemove', (e) => {
  if (!drain.on || drain.pointerX == null) return;
  drain.pointerX = e.clientX / drain.scale;
});
window.addEventListener('mouseup', () => {
  if (!drain.on) return;
  drain.pointerX = null;
  drainRelease();
});
drainWorld.addEventListener('touchstart', (e) => {
  if (drain.phase === 'tier') return;
  drain.pointerX = e.touches[0].clientX / drain.scale;
  drainPress();
  e.preventDefault();
}, { passive: false });
drainWorld.addEventListener('touchmove', (e) => {
  if (!drain.on || !e.touches.length) return;
  drain.pointerX = e.touches[0].clientX / drain.scale;
  e.preventDefault();
}, { passive: false });
window.addEventListener('touchend', () => {
  if (!drain.on) return;
  drain.pointerX = null;
  drainRelease();
});
window.addEventListener('resize', () => { if (drain.on) drainLayout(); });
