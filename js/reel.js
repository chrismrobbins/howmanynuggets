// ---- KEEPING IT REEL ---------------------------------------------------------------
// "THE PIER AT MIDNIGHT."
//
// A one-button fishing game (mode key: reel), named by community vote. You're a
// nug at the end of the Nuggetown pier, after hours, in the rain. HOLD to charge
// a cast (further = deeper = better fish), press ON the bite to hook, then fight:
// hold to reel, release to rest — redline the tension and the line SNAPS.
// Consecutive landings build a combo multiplier, dunk-style.
//
// And the lore: the Hooded Nug was right. Something BIG circles the pier after
// midnight — golden at the edges, almost like weather. Land enough fish and cast
// deep, and you'll find out where the stolen storm from THE CATCH INCIDENT has
// been hiding. (It's a cross-section view, Ridiculous-Fishing style: sky above
// the surface line, the whole water column below, low-res pixel canvas scaled up
// like Battered Brawlers / Fast Food.)
//
// Scoring mirrors the other games: every catch pays perFlyer-scaled points into
// storm.caught. Golden nug-fish are the 10× tier; THE STORM is the jackpot.

const reelWorld = document.getElementById('reelWorld');

const REEL_CAST_CYCLE = 1.15;  // seconds for the power meter to sweep 0→1
const REEL_BITE_WINDOW = 0.5;  // seconds to hook a bite
const REEL_STORM_MULT = 1000;  // the jackpot (perFlyer-scaled, like everything)

// The catch table. zone: how far out the cast must land (0..1 of open water).
// fight: pull = how hard it takes line back, run = how often it panics,
// reel = how fast holding brings it in (px/sec-ish, scaled in stepFight).
// min = deepest depth-tier the species starts appearing at (0 DOCK / 1 OPEN+).
const REEL_FISH = [
  { kind: 'boot',    name: 'OLD BOOT',        mult: 1,   zone: [0.00, 0.55], w: 16, spd: 0,  pull: 2,  run: 0,    reel: 95, tens: 0.24, rare: 0, min: 0 },
  { kind: 'can',     name: 'TIP-LINE CAN',    mult: 3,   zone: [0.00, 0.45], w: 12, spd: 0,  pull: 2,  run: 0,    reel: 95, tens: 0.2,  rare: 0, min: 0 },
  { kind: 'shrimp',  name: 'NUG SHRIMP',      mult: 4,   zone: [0.00, 0.45], w: 12, spd: 30, pull: 6,  run: 0.15, reel: 100, tens: 0.26, rare: 0, min: 0 },
  { kind: 'cod',     name: 'CRUMB COD',       mult: 8,   zone: [0.00, 0.70], w: 20, spd: 26, pull: 10, run: 0.25, reel: 85, tens: 0.34, rare: 0, min: 0 },
  { kind: 'crab',    name: 'SAUCE CRAB',      mult: 12,  zone: [0.10, 0.60], w: 18, spd: 20, pull: 18, run: 0.1,  reel: 80, tens: 0.4,  rare: 0, min: 0 },
  { kind: 'snapper', name: 'SAUCE SNAPPER',   mult: 16,  zone: [0.35, 0.90], w: 24, spd: 34, pull: 16, run: 0.4,  reel: 72, tens: 0.42, rare: 0, min: 0 },
  { kind: 'puffer',  name: 'PUFF POCKET',     mult: 22,  zone: [0.45, 0.95], w: 20, spd: 22, pull: 14, run: 0.3,  reel: 70, tens: 0.6,  rare: 0, min: 1 },
  { kind: 'eel',     name: 'BATTER EEL',      mult: 30,  zone: [0.50, 1.00], w: 34, spd: 40, pull: 22, run: 0.55, reel: 64, tens: 0.5,  rare: 0, min: 1 },
  { kind: 'shark',   name: 'BATTER SHARK',    mult: 45,  zone: [0.60, 1.00], w: 44, spd: 44, pull: 30, run: 0.65, reel: 60, tens: 0.5,  rare: 1, min: 1 },
  { kind: 'golden',  name: 'GOLDEN NUG-FISH', mult: 80,  zone: [0.72, 1.00], w: 18, spd: 52, pull: 28, run: 0.7,  reel: 62, tens: 0.55, rare: 1, min: 1 },
];
const REEL_SPECIES = REEL_FISH.map((f) => f.kind);   // bestiary roster (10)

// Depth tiers (ArcadeKit oath). mult scales pay, tens scales the tension gain,
// storm = landings before the whirlpool circles. THE MIDNIGHT opens once you've
// seen the storm — the deep only shows itself to those who've met it.
const REEL_TIERS = [
  { key: 'dock',     emoji: '🪝', name: 'THE DOCK',     mult: 1, storm: 6, tens: 0.82, blurb: 'calm shallows, forgiving line' },
  { key: 'open',     emoji: '🎣', name: 'OPEN WATER',   mult: 2, storm: 4, tens: 1.0,  blurb: 'the real pier — deeper fish' },
  { key: 'midnight', emoji: '🌙', name: 'THE MIDNIGHT', mult: 3, storm: 3, tens: 1.2,  blurb: 'the deep bites back',
    lockNote: 'land THE STORM once' },
];
function reelMidnightUnlocked() { return reelStormLanded(); }
function reelLogSeen() { try { return new Set(JSON.parse(localStorage.getItem('nugReelLog') || '[]')); } catch (e) { return new Set(); } }
function reelSaveLog(s) { try { localStorage.setItem('nugReelLog', JSON.stringify([...s])); } catch (e) { /* ok */ } }

const reel = {
  on: false,
  cv: null, g: null, banner: null,
  W: 0, Hh: 0, scale: 1,
  t: 0,
  phase: 'title',   // title | idle | cast | fly | wait | fight | land | snap
  holding: false,
  // geometry (recomputed in reelLayout)
  surfaceY: 0, pierEndX: 0, rodX: 0, rodY: 0,
  // cast
  power: 0, castT: 0,
  // the lure/bobber
  lure: { x: 0, y: 0, vx: 0, vy: 0, inWater: false },
  // fish in the water column
  fish: [],           // { spec, x, y, dir, wob, state: swim|seek|nibble|hooked|flee, nibbleT, nibbles }
  biter: null,        // the fish currently ON the hook offer
  biteT: 0,
  // the fight
  hooked: null,       // { spec, dist, tension, runT, calmT, isStorm, stage }
  landT: 0, snapT: 0,
  catches: 0, combo: 0,
  // THE STORM
  stormState: 'hidden', // hidden | circling | fighting | caught
  stormAngle: 0,
  stormCooldown: 0,     // landings still needed before it (re)appears
  burst: [],            // nugget-eruption particles for the finale
  rain: [],
  splashes: [],         // { x, y, r, t }
  keys: {},
  // ---- THE OVEN RELIGHT ----
  cfg: REEL_TIERS[1],   // chosen depth tier
  tierIdx: 1,
  tierPick: null,       // handle to the open tier overlay
  log: null,            // Set of species kinds landed ever (the bestiary)
  best: 0,              // best catches in a session (per tier, via ArcadeKit)
  biggest: 0,           // biggest single payout this session
  newThisRun: 0,        // species logged for the first time this run
};

function reelActive() {
  return storm.mode === 'reel' && storm.running;
}

// Did any session ever land the storm? Street NPCs react to this (js/arcade.js).
function reelStormLanded() {
  try { return localStorage.getItem('nugReelStorm') === '1'; } catch (e) { return false; }
}

function reelTally() {
  if (reel.phase === 'tier') return '🎣 choose your depth…';
  if (reel.phase === 'fight' && reel.hooked) {
    const pct = Math.round(reel.hooked.tension * 100);
    return (reel.hooked.isStorm ? '🌪️ THE STORM' : '🎣 ' + reel.hooked.spec.name) +
      ' · tension ' + pct + '%';
  }
  const seen = reel.log ? reel.log.size : 0;
  return '🎣 ' + reel.catches + ' landed · 🐟 ' + seen + '/' + REEL_SPECIES.length +
    (reel.combo >= 2 ? ' · 🔥x' + reel.combo : '') +
    (reel.stormState === 'caught' ? ' · 🌪️ FOUND' : '');
}

// ---- setup ---------------------------------------------------------------------------

function reelLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  reel.scale = Math.max(2, Math.floor(vh / 270));
  reel.W = Math.ceil(vw / reel.scale);
  reel.Hh = Math.ceil(vh / reel.scale);
  reel.cv.width = reel.W;
  reel.cv.height = reel.Hh;
  reel.g.imageSmoothingEnabled = false;
  reel.surfaceY = Math.round(reel.Hh * 0.40);
  reel.pierEndX = Math.round(reel.W * 0.22);
  reel.rodX = reel.pierEndX + 8;
  reel.rodY = reel.surfaceY - 34;
  reel.rain = [];
  for (let i = 0; i < 34; i++)
    reel.rain.push({ x: Math.random() * reel.W, y: Math.random() * reel.surfaceY, v: 80 + Math.random() * 50 });
}

// The seabed slopes down away from the pier; deeper water = better fish.
function reelBottomY(x) {
  const t = Math.max(0, Math.min(1, (x - reel.pierEndX) / (reel.W - reel.pierEndX)));
  return reel.surfaceY + (reel.Hh - reel.surfaceY) * (0.32 + 0.6 * t);
}

// 0 (just off the pier) .. 1 (the far deep) — the casting/fish-zone axis.
function reelZoneAt(x) {
  const x0 = reel.pierEndX + 14, x1 = reel.W * 0.92;
  return Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
}

function reelSpawnFish() {
  // Keep a small school distributed across the zones; junk doesn't swim in.
  // Deeper tiers unlock the bigger, rarer, meaner species (spec.min).
  let swimmers = REEL_FISH.filter((s) => s.spd > 0 && (s.min || 0) <= reel.tierIdx);
  if (!swimmers.length) swimmers = REEL_FISH.filter((s) => s.spd > 0);
  const spec = swimmers[(Math.random() * swimmers.length) | 0];
  const zone = spec.zone[0] + Math.random() * (spec.zone[1] - spec.zone[0]);
  const x0 = reel.pierEndX + 14, x1 = reel.W * 0.92;
  const x = x0 + zone * (x1 - x0);
  const bot = reelBottomY(x);
  reel.fish.push({
    spec,
    x,
    y: reel.surfaceY + 12 + Math.random() * (bot - reel.surfaceY - 20),
    dir: Math.random() < 0.5 ? -1 : 1,
    wob: Math.random() * 7,
    state: 'swim',
    nibbleT: 0,
    nibbles: 0,
  });
}

function syncReel() {
  const active = reelActive();
  if (active === reel.on) return;
  reel.on = active;
  document.body.classList.toggle('reel-mode', active);
  if (active) {
    if (!reel.cv) {
      reel.cv = document.createElement('canvas');
      reel.g = reel.cv.getContext('2d');
      reelWorld.appendChild(reel.cv);
      reel.banner = document.createElement('div');
      reel.banner.className = 'reel-banner';
      reelWorld.appendChild(reel.banner);
    }
    reel.log = reelLogSeen();
    reel.phase = 'tier';         // pick a depth before the pier opens
    reel.t = 0;
    reel.holding = false;
    reel.power = 0; reel.castT = 0;
    reel.fish = [];
    reel.biter = null; reel.hooked = null;
    reel.catches = 0; reel.combo = 0;
    reel.biggest = 0; reel.newThisRun = 0;
    reel.stormState = 'hidden'; // re-catchable per session — it always comes back
    reel.stormCooldown = reel.cfg.storm;
    reel.stormAngle = 0;
    reel.burst = [];
    reel.splashes = [];
    reelLayout();
    for (let i = 0; i < 6; i++) reelSpawnFish();
    openReelTier();
  } else {
    if (reel.tierPick) { reel.tierPick.close(); reel.tierPick = null; }
    reel.banner && reel.banner.classList.remove('show');
  }
}

function openReelTier() {
  reel.phase = 'tier';
  const tiers = REEL_TIERS.map((t) => t.key === 'midnight' && !reelMidnightUnlocked() ? { ...t, locked: true } : t);
  reel.tierPick = ArcadeKit.tierSelect({
    storeKey: 'reel',
    title: '🎣 How deep?',
    note: reelMidnightUnlocked() ? 'the midnight deep is open to you · 1 · 2 · 3' : 'HOLD to cast · press on the ❗ · reel, rest the runs',
    tiers,
    onPick: (key, t) => { reel.tierPick = null; reelApplyTier(key, t); },
  });
}

function reelApplyTier(key, t) {
  reel.cfg = t;
  reel.tierIdx = REEL_TIERS.findIndex((x) => x.key === key);
  reel.stormCooldown = t.storm;
  reel.fish = [];
  for (let i = 0; i < 6; i++) reelSpawnFish(); // reschool for the chosen depth
  reelToIdle();
}

function reelBanner(text, cls, secs) {
  reel.banner.textContent = text;
  reel.banner.className = 'reel-banner show' + (cls ? ' ' + cls : '');
  void reel.banner.offsetWidth;
  clearTimeout(reel.bannerT);
  reel.bannerT = setTimeout(() => reel.on && reel.banner.classList.remove('show'), (secs || 1.6) * 1000);
}

// ---- scoring (perFlyer-scaled, dunk-style combo) ---------------------------------------

function reelPay(mult, label, golden) {
  const comboFactor = 1 + Math.min(Math.max(reel.combo - 1, 0), 20) * 0.1; // up to 3×
  const worth = Math.max(1, Math.round(storm.perFlyer * mult * comboFactor * reel.cfg.mult));
  storm.caught += worth;
  if (worth > reel.biggest) reel.biggest = worth;
  if (label) {
    spawnPopLabel(reel.rodX * reel.scale, (reel.surfaceY - 30) * reel.scale,
      label + ' +' + fmt.format(worth), golden ? 'golden' : '');
  }
  updateStormHud();
  return worth;
}

// ---- flow ------------------------------------------------------------------------------

function reelToIdle() {
  reel.phase = 'idle';
  reel.biter = null;
  reel.hooked = null;
  reel.lure.inWater = false;
}

function reelStartCast() {
  reel.phase = 'cast';
  reel.castT = 0;
  reel.power = 0;
}

function reelLaunchCast() {
  reel.phase = 'fly';
  const p = reel.power;
  const x0 = reel.pierEndX + 18, x1 = reel.W * 0.92;
  const targetX = x0 + p * (x1 - x0);
  reel.lure.x = reel.rodX + 4;
  reel.lure.y = reel.rodY;
  reel.lure.vy = -(38 + p * 30);
  // solve the arc's true flight time (rod tip is above the surface) so the
  // lure lands ON targetX instead of sailing past the edge of the world
  const g = 130, drop = reel.surfaceY - reel.rodY;
  const T = (-reel.lure.vy + Math.sqrt(reel.lure.vy * reel.lure.vy + 2 * g * drop)) / g;
  reel.lure.vx = (targetX - reel.lure.x) / T;
  reel.lure.inWater = false;
}

function reelSplash(x, y, big) {
  reel.splashes.push({ x, y, r: big ? 10 : 5, t: 0 });
}

function reelHook() {
  const f = reel.biter;
  reel.biter = null;
  if (!f) return;
  if (f === 'storm') {
    reel.stormState = 'fighting';
    // balance note: sustainable reel duty is fall/(tens+fall) — keep avg reel
    // above avg pull or the jackpot is unwinnable (ask the first playtest)
    reel.hooked = {
      spec: { name: 'THE STORM', mult: REEL_STORM_MULT, pull: 18, run: 0.9, reel: 52, tens: 0.48 },
      dist: reel.W * 0.62 - reel.rodX,
      tension: 0.25,
      runT: 0, calmT: 0.6,
      isStorm: true, stage: 0,
    };
    reelBanner('🌪️ SOMETHING ENORMOUS TAKES THE LINE', 'storm', 2.2);
  } else {
    f.state = 'hooked';
    reel.hooked = {
      spec: f.spec, fish: f,
      dist: Math.max(20, f.x - reel.rodX),
      tension: 0.15,
      runT: 0, calmT: 0.4 + Math.random() * 0.6,
      isStorm: false, stage: 0,
    };
    reelBanner('🎣 HOOKED!', 'go', 0.8);
  }
  reel.phase = 'fight';
}

function reelLand() {
  const h = reel.hooked;
  reel.phase = 'land';
  reel.landT = 0;
  const junk = h.spec.mult <= 3;
  if (!junk) reel.combo += 1; // boots don't feed the fire (but don't kill it either)

  const sx = reel.rodX * reel.scale, sy = (reel.surfaceY - 8) * reel.scale;

  if (h.isStorm) {
    // THE CATCH INCIDENT: partially solved. The storm is ALIVE off the pier.
    reel.stormState = 'caught';
    try { localStorage.setItem('nugReelStorm', '1'); } catch (e) { /* private mode */ }
    reelPay(REEL_STORM_MULT, '🌪️✨', true);
    reelBanner('🌪️ YOU FOUND THE STORM — CALL IT IN! 555-DILL', 'storm', 4.5);
    ArcadeKit.kick(26, 900);
    ArcadeKit.burst(reel.W * 0.8 * reel.scale, reel.surfaceY * reel.scale, { n: 30, emoji: '✨', speed: 460, life: 1.1 });
    // the eruption: a stolen storm's worth of nuggets, briefly airborne
    for (let i = 0; i < 160; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const sp = 60 + Math.random() * 130;
      reel.burst.push({
        x: reel.W * 0.8 + (Math.random() - 0.5) * 30,
        y: reel.surfaceY + 4,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        s: 2 + Math.random() * 3,
        gold: Math.random() < 0.2,
        life: 1.6 + Math.random() * 1.4,
      });
    }
    reelSplash(reel.W * 0.8, reel.surfaceY, true);
  } else {
    const golden = h.spec.kind === 'golden';
    if (h.fish) {
      const i = reel.fish.indexOf(h.fish);
      if (i >= 0) reel.fish.splice(i, 1);
    }
    reelPay(h.spec.mult, (golden ? '✨ ' : '') + reelFishEmoji(h.spec.kind), golden);
    ArcadeKit.kick(Math.min(14, 4 + h.spec.mult * 0.12), 260);
    ArcadeKit.burst(sx, sy, { n: golden ? 16 : 9, color: golden ? '#ffd23a' : (h.spec.kind === 'shark' ? '#9fb0c0' : '#7fd4ff'), speed: 240, life: 0.55 });
    // the bestiary: the first-ever catch of a species is a moment
    if (reel.log && !reel.log.has(h.spec.kind)) {
      reel.log.add(h.spec.kind); reelSaveLog(reel.log); reel.newThisRun++;
      reelBanner('🆕 NEW SPECIES · ' + reelFishEmoji(h.spec.kind) + ' ' + h.spec.name +
        '  (' + reel.log.size + '/' + REEL_SPECIES.length + ')', 'gold', 2.4);
      ArcadeKit.burst(sx, sy, { n: 18, emoji: '⭐', speed: 300, life: 0.9 });
      if (reel.log.size >= REEL_SPECIES.length) reelBanner('🏆 THE PIER HOLDS NO SECRETS FROM YOU — bestiary complete!', 'storm', 4);
    } else if (junk) {
      reelBanner(h.spec.kind === 'boot' ? '🥾 EVIDENCE? …no. it\'s a boot.' : '🥫 TIP-LINE CAN — every bit helps', '', 1.6);
    } else {
      reelBanner(reelFishEmoji(h.spec.kind) + ' ' + h.spec.name + (reel.combo >= 2 ? ' · 🔥x' + reel.combo : ''), golden ? 'gold' : 'go', 1.6);
    }
    reel.catches++;
    ArcadeKit.saveBest('reel', reel.cfg.key, reel.catches);
    if (reel.catches > reel.best) reel.best = reel.catches;
    if (reel.stormState === 'hidden' && !junk) {
      reel.stormCooldown--;
      if (reel.stormCooldown <= 0) {
        reel.stormState = 'circling';
        reelBanner('…the water out deep is starting to SWIRL', 'storm', 2.6);
      }
    }
  }
  reel.hooked = null;
}

function reelSnap() {
  const h = reel.hooked;
  reel.phase = 'snap';
  reel.snapT = 0;
  reel.combo = 0;
  ArcadeKit.kick(16, 380);
  if (h && h.isStorm) {
    reel.stormState = 'hidden';
    reel.stormCooldown = 2; // it sulks, then circles back
    reelBanner('💥 LINE SNAPPED — it\'s still out there…', 'over', 2.4);
  } else {
    if (h && h.fish) {
      if (h.fish.junk) {
        const i = reel.fish.indexOf(h.fish);
        if (i >= 0) reel.fish.splice(i, 1);
      } else h.fish.state = 'flee';
    }
    reelBanner('💥 SNAP! the one that got away', 'over', 1.8);
  }
  reel.hooked = null;
}

function reelFishEmoji(kind) {
  return { boot: '🥾', can: '🥫', shrimp: '🦐', cod: '🐟', crab: '🦀', snapper: '🐠',
    puffer: '🐡', eel: '🐍', shark: '🦈', golden: '✨🐟' }[kind] || '🐟';
}

// ---- update ----------------------------------------------------------------------------

function stepReel(dt, w, h) {
  if (!reel.on) return;
  if (reel.cv.width !== Math.ceil(w / reel.scale) || reel.cv.height !== Math.ceil(h / reel.scale)) reelLayout();
  reel.t += dt;
  reel.stormAngle += dt * 1.8;

  // school upkeep: keep ~6 swimmers, replace ones that fled off-screen
  for (let i = reel.fish.length - 1; i >= 0; i--) {
    const f = reel.fish[i];
    if (f.state === 'flee' && (f.x < reel.pierEndX - 30 || f.x > reel.W + 30)) reel.fish.splice(i, 1);
  }
  while (reel.fish.length < 6) reelSpawnFish();

  if (reel.phase === 'cast') {
    reel.castT += dt;
    const c = (reel.castT % REEL_CAST_CYCLE) / REEL_CAST_CYCLE;
    reel.power = c < 0.5 ? c * 2 : (1 - c) * 2; // ping-pong sweep
  } else if (reel.phase === 'fly') {
    reel.lure.vy += 130 * dt;
    reel.lure.x = Math.min(reel.lure.x + reel.lure.vx * dt, reel.W * 0.94); // never off the map
    reel.lure.y += reel.lure.vy * dt;
    if (reel.lure.y >= reel.surfaceY) {
      reel.lure.y = reel.surfaceY;
      reel.lure.inWater = true;
      reel.phase = 'wait';
      reelSplash(reel.lure.x, reel.surfaceY, false);
      // a deep cast into the active whirlpool wakes THE STORM
      if (reel.stormState === 'circling' && reel.lure.x > reel.W * 0.74) {
        reel.biter = 'storm';
        reel.biteT = REEL_BITE_WINDOW + 0.25; // a beat more mercy for the big one
        reelBanner('❗ THE WHOLE PIER SHAKES', 'storm', 1.2);
      }
    }
  } else if (reel.phase === 'wait') {
    stepReelWait(dt);
  } else if (reel.phase === 'fight') {
    stepReelFight(dt);
  } else if (reel.phase === 'land') {
    reel.landT += dt;
    if (reel.landT > 0.9) reelToIdle();
  } else if (reel.phase === 'snap') {
    reel.snapT += dt;
    if (reel.snapT > 0.9) reelToIdle();
  }

  // ambient fish swimming (all phases — the pier is alive on the title screen too)
  for (const f of reel.fish) {
    f.wob += dt * 3;
    if (f.state === 'swim' || f.state === 'flee') {
      const spd = f.state === 'flee' ? f.spec.spd * 3 : f.spec.spd;
      f.x += f.dir * spd * dt;
      f.y += Math.sin(f.wob) * 6 * dt;
      const bot = reelBottomY(f.x);
      f.y = Math.max(reel.surfaceY + 10, Math.min(bot - 6, f.y));
      if (f.state === 'swim') {
        if (f.x < reel.pierEndX + 16) f.dir = 1;
        if (f.x > reel.W - 10) f.dir = -1;
        // drift back toward home zone
        const z = reelZoneAt(f.x);
        if (z < f.spec.zone[0] - 0.08) f.dir = 1;
        if (z > f.spec.zone[1] + 0.08) f.dir = -1;
      }
    } else if (f.state === 'seek') {
      const dx = reel.lure.x - f.x, dy = (reel.lure.y + 6) - f.y;
      const d = Math.hypot(dx, dy) || 1;
      f.dir = dx > 0 ? 1 : -1;
      f.x += (dx / d) * f.spec.spd * 1.4 * dt;
      f.y += (dy / d) * f.spec.spd * 1.4 * dt;
      if (reel.phase !== 'wait') f.state = 'swim';
    } else if (f.state === 'nibble') {
      f.x = reel.lure.x + f.dir * -f.spec.w * 0.45;
      f.y = reel.lure.y + 6;
      if (reel.phase !== 'wait') f.state = 'swim';
    }
  }

  // splashes + the nugget eruption
  for (let i = reel.splashes.length - 1; i >= 0; i--) {
    const s = reel.splashes[i];
    s.t += dt;
    if (s.t > 0.5) reel.splashes.splice(i, 1);
  }
  for (let i = reel.burst.length - 1; i >= 0; i--) {
    const b = reel.burst[i];
    b.life -= dt;
    if (b.life <= 0) { reel.burst.splice(i, 1); continue; }
    b.vy += 90 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y > reel.surfaceY && b.vy > 0) { reel.burst.splice(i, 1); reelSplash(b.x, reel.surfaceY, false); }
  }

  reelDraw();
}

// The lure is in the water: sink it, let the school find it, run the bite window.
function stepReelWait(dt) {
  const L = reel.lure;
  // the lure hangs a little under the bobber, sinking gently to depth
  const bot = reelBottomY(L.x);
  if (L.y < bot - 10) L.y = Math.min(bot - 10, L.y + 26 * dt);

  if (reel.biter === 'storm') {
    reel.biteT -= dt;
    if (reel.biteT <= 0) {
      reel.biter = null;
      reelBanner('…it dives. cast into the swirl again.', '', 2);
    }
    return;
  }

  // no biter yet: interested fish in range start seeking
  if (!reel.biter) {
    for (const f of reel.fish) {
      if (f.state !== 'swim') continue;
      const z = reelZoneAt(L.x);
      if (z < f.spec.zone[0] || z > f.spec.zone[1]) continue;
      if (Math.hypot(f.x - L.x, f.y - L.y) < 46 && Math.random() < 0.9 * dt * 4) f.state = 'seek';
    }
    // a seeker that reaches the lure starts nibbling
    for (const f of reel.fish) {
      if (f.state === 'seek' && Math.hypot(f.x - L.x, f.y - (L.y + 6)) < 8) {
        f.state = 'nibble';
        f.nibbles = 1 + ((Math.random() * 2) | 0); // teases before the real bite
        f.nibbleT = 0.5 + Math.random() * 0.5;
      }
    }
    // junk: a long-idle lure near the bottom snags a boot/can eventually
    if (L.y > bot - 14 && reelZoneAt(L.x) < 0.55 && Math.random() < dt * 0.06) {
      const junkSpecs = REEL_FISH.filter((s) => s.spd === 0);
      const spec = junkSpecs[(Math.random() * junkSpecs.length) | 0];
      const junkFish = { spec, x: L.x, y: L.y, dir: 1, wob: 0, state: 'hooked', junk: true, nibbleT: 0, nibbles: 0 };
      reel.fish.push(junkFish); // so it draws on the line coming up
      reel.biter = junkFish;
      reel.biteT = REEL_BITE_WINDOW * 2; // junk is patient
    }
    // nibbling fish count down to the true bite
    for (const f of reel.fish) {
      if (f.state !== 'nibble') continue;
      f.nibbleT -= dt;
      if (f.nibbleT <= 0) {
        if (f.nibbles > 0) {
          f.nibbles--;
          f.nibbleT = 0.4 + Math.random() * 0.5;
          reelSplash(L.x, reel.surfaceY, false); // the tease dip
        } else {
          reel.biter = f;
          reel.biteT = REEL_BITE_WINDOW;
          reelSplash(L.x, reel.surfaceY, true);
          break;
        }
      }
    }
  } else {
    reel.biteT -= dt;
    if (reel.biteT <= 0) {
      // missed it — the fish spits the hook and flees (junk just sinks back down)
      if (reel.biter.junk) {
        const i = reel.fish.indexOf(reel.biter);
        if (i >= 0) reel.fish.splice(i, 1);
      } else reel.biter.state = 'flee';
      reel.biter = null;
    }
  }
}

// The fight: hold = reel (distance down, tension up), release = rest (tension down,
// the fish takes line). Runs make reeling expensive. Redline → snap. Zero → landed.
function stepReelFight(dt) {
  const h = reel.hooked;
  if (!h) { reelToIdle(); return; }
  const s = h.spec;

  // the fish alternates calm and runs
  if (h.runT > 0) h.runT -= dt;
  else {
    h.calmT -= dt;
    if (h.calmT <= 0 && s.run > 0) {
      h.runT = 0.5 + Math.random() * 0.7 + (h.isStorm ? 0.4 : 0);
      h.calmT = 0.8 + Math.random() * (1.6 - s.run);
      if (h.isStorm) reelBanner(['🌊 IT\'S RUNNING', '⚡ GOLDEN AT THE EDGES', '🌪️ IT KNOWS THE WAY HOME'][h.stage % 3], 'storm', 0.9);
    }
  }
  const running = h.runT > 0;

  const tensMul = reel.cfg ? reel.cfg.tens : 1; // depth tier scales the strain
  if (reel.holding) {
    h.dist -= s.reel * (running ? 0.35 : 1) * dt;
    h.tension += (s.tens + (running ? 0.55 : 0)) * tensMul * dt;
  } else {
    h.dist += s.pull * (running ? 2.2 : 1) * dt;
    h.tension -= 0.5 * dt;
  }
  h.tension = Math.max(0, h.tension);

  // storm stages: it surges every third of the way in
  if (h.isStorm) {
    const total = reel.W * 0.62 - reel.rodX;
    const prog = 1 - h.dist / total;
    if (prog > (h.stage + 1) / 3) { h.stage++; h.runT = Math.max(h.runT, 1.1); ArcadeKit.kick(14, 420); }
  }

  // keep the hooked fish sprite on the line
  const fx = reel.rodX + h.dist;
  if (h.fish) {
    h.fish.x = fx;
    h.fish.y = Math.min(reelBottomY(fx) - 8, reel.surfaceY + 14 + h.dist * 0.12);
  }
  reel.lure.x = fx;
  reel.lure.y = h.fish ? h.fish.y - 4 : reel.surfaceY + 10 + Math.sin(reel.t * 7) * 3;

  if (h.tension >= 1) { reelSnap(); return; }
  if (h.dist > reel.W * 1.15 - reel.rodX) { reelSnap(); return; } // spooled!
  if (h.dist <= 14) { reelLand(); return; }
}

// ---- render ----------------------------------------------------------------------------

function reelDraw() {
  const g = reel.g, W = reel.W, Hh = reel.Hh;
  const SUR = reel.surfaceY;

  // night sky
  const sky = g.createLinearGradient(0, 0, 0, SUR);
  sky.addColorStop(0, '#04030e');
  sky.addColorStop(1, '#131033');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, SUR);
  g.fillStyle = 'rgba(220,230,255,0.5)';
  for (let i = 0; i < 26; i++) g.fillRect((i * 61 + 13) % W, (i * 23) % (SUR - 20), 1, 1);

  // the moon (it's always midnight here)
  const mx = W * 0.78, my = SUR * 0.32, mr = 13;
  g.fillStyle = '#e8ecff';
  g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
  g.fillStyle = '#c9cfe8';
  g.beginPath(); g.arc(mx - 4, my - 3, 3, 0, 7); g.fill();
  g.beginPath(); g.arc(mx + 5, my + 4, 2, 0, 7); g.fill();
  g.fillStyle = 'rgba(232,236,255,0.08)';
  g.beginPath(); g.arc(mx, my, mr * 2.1, 0, 7); g.fill();

  // Nuggetown skyline, far left, with a pink neon smudge (home)
  g.fillStyle = '#0c0a1e';
  for (let i = 0; i < 7; i++) {
    const bw = 12 + (i * 17) % 16, bh = 10 + (i * 29) % 20;
    g.fillRect(i * 16 - 4, SUR - bh, bw, bh);
  }
  g.fillStyle = 'rgba(255,47,160,0.6)';
  g.fillRect(18, SUR - 26, 6, 2);

  // the water column
  const wat = g.createLinearGradient(0, SUR, 0, Hh);
  wat.addColorStop(0, '#0a2438');
  wat.addColorStop(0.5, '#071827');
  wat.addColorStop(1, '#030a12');
  g.fillStyle = wat;
  g.fillRect(0, SUR, W, Hh - SUR);

  // moon reflection shimmer
  g.fillStyle = 'rgba(220,228,255,0.07)';
  for (let i = 0; i < 8; i++) {
    const yy = SUR + 4 + i * 7;
    const ww = 14 - i + Math.sin(reel.t * 2 + i) * 3;
    g.fillRect(mx - ww / 2 + Math.sin(reel.t * 1.3 + i * 2) * 2, yy, ww, 1.5);
  }

  // seabed
  g.fillStyle = '#0d0f14';
  g.beginPath();
  g.moveTo(0, Hh);
  for (let x = 0; x <= W; x += 8) g.lineTo(x, reelBottomY(x) + 4);
  g.lineTo(W, Hh);
  g.closePath(); g.fill();
  // kelp
  g.strokeStyle = 'rgba(20,60,45,0.8)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const kx = reel.pierEndX + 30 + i * (W - reel.pierEndX - 50) / 9;
    const ky = reelBottomY(kx) + 2;
    g.beginPath();
    g.moveTo(kx, ky);
    g.quadraticCurveTo(kx + Math.sin(reel.t * 1.4 + i) * 4, ky - 9, kx + Math.sin(reel.t * 1.4 + i * 1.7) * 6, ky - 16);
    g.stroke();
  }

  // surface line + gentle waves
  g.strokeStyle = 'rgba(120,190,230,0.5)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= W; x += 4)
    g.lineTo(x, SUR + Math.sin(x * 0.11 + reel.t * 2.2) * 1.4);
  g.stroke();

  // THE WHIRLPOOL (when the storm circles): golden spiral out in the deep
  if (reel.stormState === 'circling' || (reel.hooked && reel.hooked.isStorm)) {
    const wx = W * 0.8, wy = SUR + 2;
    for (let i = 0; i < 3; i++) {
      const rr2 = 8 + i * 7;
      g.strokeStyle = i === 2 ? 'rgba(255,210,58,0.55)' : 'rgba(140,200,235,0.35)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(wx, wy, rr2 + Math.sin(reel.stormAngle * 2 + i) * 2, rr2 * 0.28, 0, reel.stormAngle + i * 2.1, reel.stormAngle + i * 2.1 + 4.6);
      g.stroke();
    }
    // the golden shadow beneath
    g.fillStyle = 'rgba(255,190,40,0.10)';
    g.beginPath();
    g.ellipse(wx, wy + 16 + Math.sin(reel.stormAngle) * 3, 26, 9, 0, 0, 7);
    g.fill();
  }

  // fish
  for (const f of reel.fish) reelDrawFish(g, f);

  // the pier itself (cross-section: deck + posts + railing stub)
  reelDrawPier(g, W, Hh);

  // splashes
  g.strokeStyle = 'rgba(190,225,255,0.7)';
  for (const s of reel.splashes) {
    const p = s.t / 0.5;
    g.globalAlpha = 1 - p;
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(s.x, SUR, s.r * (0.4 + p), s.r * 0.25 * (0.4 + p), 0, 0, 7);
    g.stroke();
  }
  g.globalAlpha = 1;

  // the line + bobber/lure
  if (reel.phase === 'fly' || reel.phase === 'wait' || reel.phase === 'fight') {
    g.strokeStyle = 'rgba(220,230,240,0.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(reel.rodX + 5, reel.rodY - 2);
    const sagX = (reel.rodX + 5 + reel.lure.x) / 2;
    const inWater = reel.lure.inWater;
    const bobY = inWater ? SUR + (reel.biter ? 2.5 : Math.sin(reel.t * 3) * 1.2) : reel.lure.y;
    g.quadraticCurveTo(sagX, Math.min(reel.rodY, bobY) + (inWater ? 14 : 4), reel.lure.x, bobY);
    if (inWater) { g.moveTo(reel.lure.x, bobY); g.lineTo(reel.lure.x, reel.lure.y); }
    g.stroke();
    // bobber
    if (inWater) {
      g.fillStyle = '#ff3d3d';
      g.fillRect(reel.lure.x - 1.5, bobY - 3, 3, 3);
      g.fillStyle = '#f4f0e6';
      g.fillRect(reel.lure.x - 1.5, bobY, 3, 2);
    }
    // lure
    g.fillStyle = '#ffd166';
    g.fillRect(reel.lure.x - 1, reel.lure.y, 2, 3);
  }

  // the nugget eruption
  for (const b of reel.burst) {
    g.fillStyle = b.gold ? '#ffd23a' : '#e8a83e';
    g.fillRect(b.x - b.s / 2, b.y - b.s / 2, b.s, b.s);
  }

  // rain over the sky only (it can't rain underwater, Chris)
  g.strokeStyle = 'rgba(160,190,240,0.15)';
  g.lineWidth = 1;
  g.beginPath();
  for (const r of reel.rain) {
    r.y += r.v * 0.016; r.x -= 6 * 0.016;
    if (r.y > SUR) { r.y = -4; r.x = Math.random() * W; }
    g.moveTo(r.x, r.y); g.lineTo(r.x - 1, r.y + 4);
  }
  g.stroke();

  // the angler nug
  reelDrawAngler(g);

  // UI overlays
  if (reel.phase === 'cast') reelDrawPowerBar(g);
  if (reel.phase === 'fight' && reel.hooked) reelDrawTension(g, W);
  if (reel.biter && reel.phase === 'wait') {
    g.font = '900 12px Consolas, monospace';
    g.textAlign = 'center';
    g.fillStyle = Math.floor(reel.t * 8) % 2 ? '#ffe23a' : '#ff3d3d';
    g.fillText('!', reel.lure.x, SUR - 8);
  }
  if (reel.phase === 'title') reelDrawTitle(g, W, Hh);
}

function reelDrawPier(g, W, Hh) {
  const SUR = reel.surfaceY;
  const deckY = SUR - 14;
  // posts
  g.fillStyle = '#241a08';
  for (const px of [4, reel.pierEndX * 0.45, reel.pierEndX - 5]) {
    g.fillRect(px, deckY, 4, reelBottomY(px + 2) - deckY + 4);
    g.fillStyle = '#1a1206';
  }
  // deck
  g.fillStyle = '#42320e';
  g.fillRect(0, deckY, reel.pierEndX + 2, 5);
  g.fillStyle = '#6d5426';
  for (let x = 0; x < reel.pierEndX + 2; x += 7) g.fillRect(x, deckY, 5, 2);
  // railing behind the angler
  g.fillStyle = '#241a08';
  g.fillRect(0, deckY - 12, 2, 12);
  g.fillRect(0, deckY - 12, reel.pierEndX * 0.4, 2);
  // lantern on a post
  const lx = 6;
  g.fillStyle = '#3a4256';
  g.fillRect(lx, deckY - 26, 2, 14);
  g.fillStyle = '#ffb020';
  g.fillRect(lx - 1.5, deckY - 30, 5, 5);
  g.fillStyle = 'rgba(255,176,32,0.12)';
  g.beginPath(); g.arc(lx + 1, deckY - 27, 12, 0, 7); g.fill();
}

function reelDrawAngler(g) {
  const deckY = reel.surfaceY - 14;
  const x = reel.pierEndX - 10;
  const bob = reel.phase === 'fight' && reel.holding ? Math.sin(reel.t * 18) * 0.8 : Math.sin(reel.t * 1.8) * 0.5;
  g.save();
  g.translate(x, deckY + bob);
  // the nug (side profile, slightly hunched, very focused)
  g.fillStyle = '#e8a83e';
  g.fillRect(-6, -16, 12, 14);
  g.fillStyle = '#f7cf7d';
  g.fillRect(-6, -16, 12, 3);
  g.fillStyle = '#a3641c';
  g.fillRect(-6, -4, 12, 2);
  // beanie (fisherman's, obviously)
  g.fillStyle = '#26547c';
  g.fillRect(-7, -20, 14, 5);
  g.fillRect(-5, -22, 10, 2);
  // eye on the water
  g.fillStyle = '#1a0f04';
  g.fillRect(3, -13, 2, 2);
  // legs
  g.fillStyle = '#42320e';
  g.fillRect(-5, -2, 4, 2);
  g.fillRect(2, -2, 4, 2);
  g.restore();
  // the rod (bends with tension)
  const bend = reel.hooked ? reel.hooked.tension * 10 : (reel.phase === 'cast' ? -reel.power * 6 : 0);
  g.strokeStyle = '#8a6a30';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x + 4, deckY - 12);
  g.quadraticCurveTo(x + 14, deckY - 30, reel.rodX + 5 - bend * 0.3, reel.rodY - 2 + bend);
  g.stroke();
}

function reelDrawPowerBar(g) {
  const x = reel.pierEndX + 14, y0 = reel.surfaceY - 58, hgt = 44;
  g.fillStyle = 'rgba(6,10,20,0.75)';
  g.fillRect(x - 2, y0 - 2, 10, hgt + 4);
  const grad = g.createLinearGradient(0, y0 + hgt, 0, y0);
  grad.addColorStop(0, '#39ff7a'); grad.addColorStop(0.6, '#ffe23a'); grad.addColorStop(1, '#ff3d3d');
  g.fillStyle = grad;
  const fh = hgt * reel.power;
  g.fillRect(x, y0 + hgt - fh, 6, fh);
  // deep-zone tick: casts past here can reach the whirlpool
  g.fillStyle = '#9be8ff';
  g.fillRect(x - 2, y0 + hgt * 0.15, 10, 1);
  g.font = '700 8px Consolas, monospace';
  g.textAlign = 'left';
  g.fillStyle = '#9aa3c7';
  g.fillText('DEEP', x + 12, y0 + hgt * 0.15 + 3);
}

function reelDrawTension(g, W) {
  const h = reel.hooked;
  const bw = Math.min(150, W * 0.4), x0 = W / 2 - bw / 2, y0 = 10;
  g.fillStyle = 'rgba(6,10,20,0.75)';
  g.fillRect(x0 - 2, y0 - 2, bw + 4, 12);
  const danger = h.tension > 0.75;
  g.fillStyle = h.tension > 0.9 ? '#ff3d3d' : danger ? '#ff8a3d' : '#39ff7a';
  if (danger && Math.floor(reel.t * 10) % 2) g.fillStyle = '#fff';
  g.fillRect(x0, y0, bw * Math.min(1, h.tension), 8);
  g.strokeStyle = 'rgba(255,255,255,0.3)';
  g.lineWidth = 1;
  g.strokeRect(x0, y0, bw, 8);
  g.font = '700 8px Consolas, monospace';
  g.textAlign = 'center';
  g.fillStyle = '#c9d4f0';
  g.fillText(h.runT > 0 ? 'IT\'S RUNNING — LET IT' : 'REEL', W / 2, y0 + 19);
  g.fillStyle = '#9be8ff';
  g.fillText('~' + Math.max(0, Math.round(h.dist / 6)) + 'm', W / 2 + bw / 2 + 18, y0 + 7);
}

function reelDrawTitle(g, W, Hh) {
  g.fillStyle = 'rgba(3,4,12,0.6)';
  g.fillRect(0, 0, W, Hh);
  g.textAlign = 'center';
  const bob = Math.sin(reel.t * 2) * 2;
  g.font = '900 ' + Math.min(34, W * 0.1) + 'px Impact, "Arial Black", sans-serif';
  g.lineWidth = 4; g.lineJoin = 'round';
  g.strokeStyle = '#03141c';
  g.strokeText('KEEPING IT REEL', W / 2, Hh * 0.32 + bob);
  const tg = g.createLinearGradient(0, Hh * 0.24, 0, Hh * 0.36);
  tg.addColorStop(0, '#d2f4ff'); tg.addColorStop(0.5, '#26e0ff'); tg.addColorStop(1, '#0a5a7a');
  g.fillStyle = tg;
  g.fillText('KEEPING IT REEL', W / 2, Hh * 0.32 + bob);
  g.font = '700 10px Consolas, monospace';
  g.fillStyle = '#9aa3c7';
  g.fillText('the pier at midnight · bring a rod · tell no one', W / 2, Hh * 0.41);
  g.fillStyle = '#eef2ff';
  g.fillText('HOLD space/click — charge the cast · release — let fly', W / 2, Hh * 0.55);
  g.fillText('press ON the ❗ bite · then HOLD to reel, REST the runs', W / 2, Hh * 0.62);
  g.fillStyle = '#ffd166';
  g.fillText('deep casts find better fish. and… other things.', W / 2, Hh * 0.69);
  if (Math.floor(reel.t * 2.2) % 2 === 0) {
    g.font = '900 12px Consolas, monospace';
    g.fillStyle = '#ffe23a';
    g.fillText('PRESS SPACE / TAP — CAST OFF', W / 2, Hh * 0.8);
  }
}

function reelDrawFish(g, f) {
  const s = f.spec, x = f.x, y = f.y, w = s.w, dir = f.dir;
  const hooked = f.state === 'hooked';
  g.save();
  g.translate(x, y);
  if (dir < 0) g.scale(-1, 1);
  const wig = Math.sin(f.wob * 2) * 0.15;
  g.rotate(hooked ? Math.sin(reel.t * 14) * 0.3 : wig);
  if (s.kind === 'boot') {
    g.fillStyle = '#4a3a2a';
    g.fillRect(-w / 2, -6, w * 0.55, 10);        // shaft
    g.fillRect(-w / 2, 2, w, 4);                 // sole-ish foot
    g.fillStyle = '#2e2418';
    g.fillRect(-w / 2, 4, w, 2);                 // sole
    g.fillStyle = '#8a7a5a';
    g.fillRect(-w / 2 + 2, -4, 2, 6);            // laces
    g.restore();
    return;
  } else if (s.kind === 'can') {
    g.fillStyle = '#8a93a8';
    g.fillRect(-w / 2, -5, w, 10);
    g.fillStyle = '#b8c0d0';
    g.fillRect(-w / 2, -5, w, 2);
    g.fillStyle = '#39ff7a';
    g.fillRect(-w / 2 + 2, -2, w - 4, 4);        // faded NPD TIP LINE label
    g.restore();
    return;
  } else if (s.kind === 'shrimp') {
    g.fillStyle = '#ff9a8a';
    g.beginPath(); g.ellipse(0, 0, w / 2, w / 3.2, 0, 0, 7); g.fill();
    g.fillStyle = '#ff9a8a';
    g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2 - 4, -3); g.lineTo(-w / 2 - 4, 3); g.closePath(); g.fill(); // tail fan
    g.strokeStyle = '#c25a30'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(w / 2 - 1, -1); g.lineTo(w / 2 + 3, -4); g.moveTo(w / 2 - 1, 1); g.lineTo(w / 2 + 3, 3); g.stroke(); // antennae
    g.fillStyle = '#1a0a0a'; g.fillRect(w / 2 - 3, -2, 1.5, 1.5);
    g.restore();
    return;
  } else if (s.kind === 'crab') {
    g.strokeStyle = '#a02a1a'; g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { const lx = -w / 3 + i * w / 3; g.beginPath(); g.moveTo(lx, w / 5); g.lineTo(lx - 3, w / 2); g.moveTo(lx, w / 5); g.lineTo(lx + 3, w / 2); g.stroke(); }
    g.fillStyle = '#d23a2a';
    g.beginPath(); g.ellipse(0, 0, w / 2, w / 3, 0, 0, 7); g.fill();
    g.fillStyle = '#f26a4a'; g.fillRect(-w / 2, -1, w, 2);
    g.fillStyle = '#d23a2a'; g.fillRect(w / 2 - 2, -4, 5, 4); g.fillRect(-w / 2 - 3, -4, 5, 4); // claws
    g.fillStyle = '#1a0a0a'; g.fillRect(-3, -3, 1.5, 1.5); g.fillRect(2, -3, 1.5, 1.5);
    g.restore();
    return;
  } else if (s.kind === 'puffer') {
    g.fillStyle = '#c9a84a';
    g.beginPath(); g.arc(0, 0, w / 2.4, 0, 7); g.fill();
    g.strokeStyle = '#8a6a20'; g.lineWidth = 1;
    for (let a = 0; a < 8; a++) { const an = a / 8 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(an) * w / 2.4, Math.sin(an) * w / 2.4); g.lineTo(Math.cos(an) * w / 1.7, Math.sin(an) * w / 1.7); g.stroke(); }
    g.fillStyle = '#e8d88a'; g.beginPath(); g.arc(0, 1, w / 3.5, 0, 7); g.fill();
    g.fillStyle = '#1a0a0a'; g.fillRect(w / 5, -2, 2, 2);
    g.restore();
    return;
  } else if (s.kind === 'shark') {
    g.fillStyle = '#8a93a8';
    g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2 - 8, -6); g.lineTo(-w / 2 - 8, 6); g.closePath(); g.fill(); // tail
    g.beginPath(); g.ellipse(0, 0, w / 2, w / 5, 0, 0, 7); g.fill();
    g.fillStyle = '#aab2c2';
    g.beginPath(); g.ellipse(0, 1.5, w / 2.3, w / 9, 0, 0, 7); g.fill();
    g.fillStyle = '#8a93a8';
    g.beginPath(); g.moveTo(-2, -w / 5); g.lineTo(4, -w / 5 - 7); g.lineTo(8, -w / 5); g.closePath(); g.fill(); // dorsal fin
    g.fillStyle = '#1a0a12'; g.fillRect(w / 2 - 8, -2, 2, 2);
    g.strokeStyle = '#e8ecf4'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(w / 2 - 2, 2); g.lineTo(w / 2 - 8, 3); g.stroke();
    g.restore();
    return;
  } else if (s.kind === 'golden') {
    g.fillStyle = '#ffd23a';
    g.fillRect(-w / 2, -3, w, 6);
    g.fillStyle = '#fff3b0';
    g.fillRect(-w / 2, -3, w, 2);
    g.fillStyle = '#ffd23a';
    g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2 - 5, -4); g.lineTo(-w / 2 - 5, 4); g.closePath(); g.fill();
    if (Math.sin(reel.t * 6 + f.wob) > 0.4) { g.fillStyle = '#fff'; g.fillRect(w / 2 - 2, -5, 2, 2); }
  } else if (s.kind === 'eel') {
    g.strokeStyle = '#5a4a20';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-w / 2, 0);
    g.quadraticCurveTo(-w * 0.15, Math.sin(f.wob * 3) * 4, w * 0.2, 0);
    g.quadraticCurveTo(w * 0.38, -Math.sin(f.wob * 3) * 4, w / 2, 0);
    g.stroke();
    g.fillStyle = '#8a6a30'; // batter-crusted head
    g.fillRect(w / 2 - 4, -3, 5, 6);
  } else {
    const body = s.kind === 'snapper' ? '#c25a30' : '#4a5a6a';
    const belly = s.kind === 'snapper' ? '#e8935a' : '#7a8a9a';
    g.fillStyle = body;
    g.beginPath(); g.ellipse(0, 0, w / 2, w / 4.4, 0, 0, 7); g.fill();
    g.fillStyle = belly;
    g.beginPath(); g.ellipse(0, 1.5, w / 2.4, w / 7, 0, 0, 7); g.fill();
    g.fillStyle = body;
    g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2 - w / 4, -w / 5); g.lineTo(-w / 2 - w / 4, w / 5); g.closePath(); g.fill();
  }
  // eye
  if (s.kind !== 'eel') {
    g.fillStyle = '#0a0a12';
    g.fillRect(f.spec.w / 2 - 5, -2, 2, 2);
  }
  g.restore();
}

// ---- input ------------------------------------------------------------------------------

function reelPress() {
  if (reel.holding) return;
  if (reel.phase === 'tier') return; // the depth-select overlay owns input
  reel.holding = true;
  if (reel.phase === 'idle') { reelStartCast(); return; }
  if (reel.phase === 'wait') {
    if (reel.biter) reelHook();
    else {
      // reel in empty — scatter anything sniffing around and reset
      for (const f of reel.fish) if (f.state !== 'swim') f.state = 'flee';
      reelToIdle();
      reel.holding = false;
    }
  }
  // fight: holding is the whole mechanic; stepReelFight reads reel.holding
}

function reelRelease() {
  if (!reel.holding) return;
  reel.holding = false;
  if (reel.phase === 'cast') reelLaunchCast();
}

window.addEventListener('keydown', (e) => {
  if (!reelActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'Space' || e.code === 'Enter') {
    if (!e.repeat) reelPress();
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (!reel.on) return;
  if (e.code === 'Space' || e.code === 'Enter') reelRelease();
});
window.addEventListener('mousedown', (e) => {
  if (!reelActive()) return;
  if (e.target.closest('.storm-hud') || e.target.closest('.ak-tier')) return;
  reelPress();
});
window.addEventListener('mouseup', () => reel.on && reelRelease());
reelWorld.addEventListener('touchstart', (e) => { if (reel.phase === 'tier') return; reelPress(); e.preventDefault(); }, { passive: false });
window.addEventListener('touchend', () => reel.on && reelRelease());

// Test/debug hook (headless verification): pick a depth, force hooks/lands, storm.
window.reelDebug = function (opts) {
  opts = opts || {};
  if (opts.tier) {
    const t = REEL_TIERS.find((x) => x.key === opts.tier);
    if (t) { if (reel.tierPick) { reel.tierPick.close(); reel.tierPick = null; } reelApplyTier(opts.tier, t); }
  }
  if (opts.hook) {
    const spec = REEL_FISH.find((f) => f.kind === opts.hook);
    if (spec) { reel.hooked = { spec, fish: null, dist: 18, tension: 0.2, runT: 0, calmT: 0.5, isStorm: false, stage: 0 }; reel.phase = 'fight'; }
  }
  if (opts.landStorm) {
    reel.hooked = { spec: { name: 'THE STORM', mult: REEL_STORM_MULT, pull: 18, run: 0.9, reel: 52, tens: 0.48 }, fish: null, dist: 14, tension: 0.2, runT: 0, calmT: 0.5, isStorm: true, stage: 0 };
    reel.phase = 'fight'; reelLand();
  }
  if (opts.land && reel.hooked) reelLand();
  return {
    phase: reel.phase, tier: reel.cfg ? reel.cfg.key : null, tierIdx: reel.tierIdx,
    catches: reel.catches, combo: reel.combo, species: reel.log ? [...reel.log] : [],
    total: REEL_SPECIES.length, best: (ArcadeKit.bests('reel')[reel.cfg ? reel.cfg.key : 'open'] || 0),
    stormLanded: reelStormLanded(), stormState: reel.stormState, biggest: reel.biggest,
  };
};
