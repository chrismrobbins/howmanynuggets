// ---- Sauce Dunk — THE OVEN RELIGHT edition ------------------------------------
// Was: one belt, one cup, tap to dunk. Now: THE DINNER RUSH. Color-coded nuggets
// ride the belt toward a row of sauce cups — BBQ, honey mustard, ranch, buffalo —
// and you route each to its MATCHING cup (tap the cup or press its number; SPACE
// auto-serves the most urgent order). Nail the center band for a PERFECT; string
// PERFECTs into FEVER (2×). Don't dunk the 🔥 BURNT ones. Clear a shift's quota to
// move to the next, faster/denser one — up to THE SECRET SAUCE finale, which sets
// `nugDunkSecret` (Gravy Jones has opinions). Golden nuggets are wildcard 10×.
//
// Difficulty is an ArcadeKit oath: PREP / RUSH / THE WEEDS 🌶️. Still DOM/CSS, still
// pauses the storm, still banks into storm.caught (perFlyer parity).

const dunkBelt = document.getElementById('dunkBelt');
const dunkBg = document.getElementById('dunkBg');
const dunkStations = document.getElementById('dunkStations');
const dunkCombo = document.getElementById('dunkCombo');
const dunkQuota = document.getElementById('dunkQuota');

const DUNK_NUG = 54;
const DUNK_SPEED = 158;          // base belt px/sec (scaled by tier + shift)
const SWEET_HALF = 64;           // half-width of a cup's dunkable zone (× tier.perfect)
const PERFECT_HALF = 23;         // half-width of the PERFECT band (× tier.perfect)
const DUNK_POP_SECS = 0.32;
const BELT_FRAC = 0.58;

// Sauces (a cup per sauce). color = fill, rim = lip/ring on matching nuggets.
const SAUCES = [
  { key: 'bbq',     name: 'BBQ',           color: '#8a3b1e', rim: '#d1662f' },
  { key: 'honey',   name: 'Honey Mustard', color: '#c99711', rim: '#f2c94c' },
  { key: 'ranch',   name: 'Ranch',         color: '#e6e3d6', rim: '#ffffff' },
  { key: 'buffalo', name: 'Buffalo',       color: '#c33f18', rim: '#ff7a3c' },
];
const SECRET_SAUCE = { key: 'secret', name: 'SECRET SAUCE', color: '#6d28d9', rim: '#c4a0ff' };
const sauceByKey = (k) => (k === 'secret' ? SECRET_SAUCE : SAUCES.find((s) => s.key === k));

const DUNK_TIERS = [
  { key: 'prep',  emoji: '🍳', name: 'PREP',      mult: 1, speed: 0.8,  maxCups: 1, window: 1.4, burnt: 0.07, blurb: 'one cup, easy pace' },
  { key: 'rush',  emoji: '🔥', name: 'RUSH',      mult: 2, speed: 1.0,  maxCups: 3, window: 1.0, burnt: 0.14, blurb: 'the dinner rush' },
  { key: 'weeds', emoji: '🌶️', name: 'THE WEEDS', mult: 3, speed: 1.28, maxCups: 4, window: 0.72, burnt: 0.2, blurb: 'in the weeds — good luck',
    lockNote: 'clear Shift 3 on RUSH' },
];
const FINALE_SHIFT = 5;
function dunkWeedsUnlocked() {
  try { return localStorage.getItem('nugDunkWeeds') === '1'; } catch (e) { return false; }
}
// Read by arcade.js street dialogue (Sprint 6): did they serve the secret sauce?
function dunkSecretServed() {
  try { return localStorage.getItem('nugDunkSecret') === '1'; } catch (e) { return false; }
}

const dunk = {
  on: false,
  phase: 'idle',       // 'idle' | 'tier' | 'playing' | 'break'
  cfg: DUNK_TIERS[1],
  shift: 1,
  quota: 8,
  served: 0,           // good dunks this shift
  cups: [],            // { el, zoneEl, fillEl, sauce, x }
  nuggets: [],         // { el, img, cx, size, sauce, golden, burnt, dunked, popping, popT, miss, targetCup }
  spawnT: 0,
  elapsed: 0,
  fever: null,
  beltY: 0,
  breakT: 0,
  finaleCleared: false,
  best: 0,
  tierPick: null,
};

function dunkActive() { return storm.mode === 'dunk' && storm.running; }

function dunkTally() {
  if (dunk.phase === 'tier') return '🍳 clock in…';
  const f = dunk.fever && dunk.fever.active ? ` · 🔥FEVER ${dunk.fever.mult.toFixed(1)}×` : '';
  const finale = dunk.cfg && dunk.shift >= FINALE_SHIFT ? '🟣 SECRET SAUCE' : `Shift ${dunk.shift}`;
  return `🥣 ${finale} · ${dunk.served}/${dunk.quota}${f}`;
}

// ---- Layout --------------------------------------------------------------------

function stationX(i, n, w) {
  if (n <= 1) return Math.round(w * 0.62);
  return Math.round(w * (0.40 + 0.46 * (i / (n - 1))));
}

function layoutDunk(w, h) {
  dunk.beltY = Math.round(h * BELT_FRAC);
  dunkBelt.style.top = (dunk.beltY + DUNK_NUG * 0.5) + 'px';
  const n = dunk.cups.length;
  dunk.cups.forEach((c, i) => {
    c.x = stationX(i, n, w);
    c.el.style.left = (c.x - 46) + 'px';
    c.el.style.top = (dunk.beltY - 10) + 'px';
    c.zoneEl.style.left = (c.x - SWEET_HALF * dunk.cfg.window) + 'px';
    c.zoneEl.style.top = (dunk.beltY - DUNK_NUG * 0.5 - 8) + 'px';
    c.zoneEl.style.width = (SWEET_HALF * dunk.cfg.window * 2) + 'px';
    c.zoneEl.style.height = (DUNK_NUG + 16) + 'px';
  });
}

// ---- Stations ------------------------------------------------------------------

function buildStations(sauces) {
  clearStations();
  sauces.forEach((s, i) => {
    const zoneEl = document.createElement('div');
    zoneEl.className = 'dunk-zone active';
    zoneEl.innerHTML = '<span class="perfect"></span>';
    zoneEl.style.setProperty('--zw', (PERFECT_HALF * dunk.cfg.window * 2) + 'px');
    dunkStations.appendChild(zoneEl);

    const el = document.createElement('div');
    el.className = 'dunk-cup active';
    el.dataset.i = String(i);
    el.style.setProperty('--sauce', s.color);
    el.style.setProperty('--rim', s.rim);
    el.innerHTML =
      `<span class="dc-key">${i + 1}</span>` +
      `<span class="dc-sauce"></span>` +
      `<span class="dc-label">${s.name}</span>`;
    dunkStations.appendChild(el);
    dunk.cups.push({ el, zoneEl, sauce: s, x: 0 });
  });
  layoutDunk(window.innerWidth, window.innerHeight);
}

function clearStations() {
  dunk.cups.forEach((c) => { c.el.remove(); c.zoneEl.remove(); });
  dunk.cups = [];
}

function cupsForShift() {
  // grow cups with the shift, capped by tier; the finale swaps in the secret cup.
  if (dunk.shift >= FINALE_SHIFT && dunk.cfg.maxCups > 1) {
    const base = SAUCES.slice(0, Math.min(3, dunk.cfg.maxCups - 1));
    return [...base, SECRET_SAUCE];
  }
  const n = Math.min(dunk.cfg.maxCups, 1 + Math.floor((dunk.shift - 1) / 1.5));
  return SAUCES.slice(0, Math.max(1, n));
}

// ---- Mode plumbing -------------------------------------------------------------

function syncDunk() {
  const active = dunkActive();
  if (active === dunk.on) return;
  dunk.on = active;
  document.body.classList.toggle('dunk-mode', active);
  dunkBg.classList.toggle('active', active);
  dunkBelt.classList.toggle('active', active);
  if (active) {
    openDunkTier();
  } else {
    if (dunk.tierPick) { dunk.tierPick.close(); dunk.tierPick = null; }
    dunk.phase = 'idle';
    clearNuggets();
    clearStations();
    dunkCombo.classList.remove('active');
    dunkQuota.classList.remove('active');
  }
}

function openDunkTier() {
  dunk.phase = 'tier';
  clearNuggets();
  clearStations();
  dunkQuota.classList.remove('active');
  const tiers = DUNK_TIERS.map((t) => t.key === 'weeds' && !dunkWeedsUnlocked() ? { ...t, locked: true } : t);
  dunk.tierPick = ArcadeKit.tierSelect({
    storeKey: 'dunk',
    title: '🥣 Pick your station',
    note: dunkWeedsUnlocked() ? 'you have survived THE WEEDS · 1 · 2 · 3' : 'press 1 · 2 · 3 or click',
    tiers,
    onPick: (key, t) => { dunk.tierPick = null; dunk.cfg = t; startShifts(); },
  });
}

function startShifts() {
  dunk.phase = 'playing';
  dunk.shift = 1;
  dunk.served = 0;
  dunk.quota = shiftQuota(1);
  dunk.elapsed = 0;
  dunk.spawnT = 0.5;
  dunk.finaleCleared = false;
  dunk.fever = ArcadeKit.makeFever({ perLevel: 4, maxLevel: 3, step: 0.5, timeout: 0 });
  buildStations(cupsForShift());
  dunkQuota.classList.add('active');
  updateQuotaBar();
  updateCombo();
  updateStormHud();
}

function shiftQuota(s) { return 7 + s * 2; }

// ---- Nuggets -------------------------------------------------------------------

function clearNuggets() { dunk.nuggets.forEach((n) => n.el.remove()); dunk.nuggets = []; }

function spawnNugget() {
  const burnt = Math.random() < dunk.cfg.burnt;
  const golden = !burnt && Math.random() < storm.cat.golden;
  // pick a target among the current cups (golden = wildcard, burnt = none)
  let sauce = null;
  if (!burnt && !golden) sauce = dunk.cups[Math.floor(Math.random() * dunk.cups.length)].sauce;

  const el = document.createElement('div');
  el.className = 'dunk-nug' + (golden ? ' golden' : '') + (burnt ? ' burnt' : '');
  if (sauce) el.style.setProperty('--rim', sauce.rim);
  el.innerHTML = `<img src="nugget.png" alt="" draggable="false"/>` +
    (burnt ? '<span class="dn-flag">🔥</span>' : golden ? '<span class="dn-flag">✨</span>' :
      `<span class="dn-flag dot" style="background:${sauce.rim}"></span>`);
  document.body.appendChild(el);
  dunk.nuggets.push({
    el, cx: -DUNK_NUG, size: DUNK_NUG, sauce, golden, burnt,
    dunked: false, popping: false, popT: 0, miss: false, bob: Math.random() * Math.PI * 2,
  });

  const ramp = Math.min(dunk.elapsed / 40, 1);
  const gap = (1.5 - 0.7 * ramp) * (0.75 + Math.random() * 0.5);
  dunk.spawnT = gap / (dunk.cfg.speed * (1 + (dunk.shift - 1) * 0.06));
}

function beltSpeed() {
  return DUNK_SPEED * dunk.cfg.speed * (1 + Math.min(dunk.elapsed / 55, 1) * 0.5) * (1 + (dunk.shift - 1) * 0.05);
}

// ---- Dunking -------------------------------------------------------------------

function nuggetInZone(cup) {
  const half = SWEET_HALF * dunk.cfg.window;
  let best = null, bestD = Infinity;
  for (const n of dunk.nuggets) {
    if (n.dunked || n.popping) continue;
    const d = Math.abs(n.cx - cup.x);
    if (d <= half && d < bestD) { best = n; bestD = d; }
  }
  return best ? { n: best, d: bestD } : null;
}

function doDunkAt(cupIndex) {
  if (dunk.phase !== 'playing') return;
  const cup = dunk.cups[cupIndex];
  if (!cup) return;
  const found = nuggetInZone(cup);
  if (!found) { breakCombo('whiff'); return; }
  resolveDunk(found.n, cup, found.d);
}

// SPACE: serve the most urgent nugget that's correctly parked in its own cup.
function doAutoServe() {
  if (dunk.phase !== 'playing') return;
  const half = SWEET_HALF * dunk.cfg.window;
  let best = null, bestCup = null, bestUrgency = -Infinity;
  for (const cup of dunk.cups) {
    for (const n of dunk.nuggets) {
      if (n.dunked || n.popping || n.burnt) continue;
      const matches = n.golden || (n.sauce && n.sauce.key === cup.sauce.key);
      if (!matches) continue;
      const d = Math.abs(n.cx - cup.x);
      if (d > half) continue;
      const urgency = n.cx; // furthest-right = most urgent (about to fall off)
      if (urgency > bestUrgency) { bestUrgency = urgency; best = n; bestCup = cup; }
    }
  }
  if (!best) { breakCombo('whiff'); return; }
  resolveDunk(best, bestCup, Math.abs(best.cx - bestCup.x));
}

function resolveDunk(n, cup, dist) {
  if (n.burnt) { // never dunk the burnt ones
    n.dunked = true; n.popping = true; n.popT = 0; n.miss = true;
    spawnPopLabel(n.cx, dunk.beltY - 30, '🔥 TOO BURNT!', '');
    ArcadeKit.kick(7, 220);
    breakCombo('burnt');
    return;
  }
  const matches = n.golden || (n.sauce && n.sauce.key === cup.sauce.key);
  if (!matches) { // right timing, wrong sauce
    spawnPopLabel(n.cx, dunk.beltY - 30, '✗ WRONG SAUCE', '');
    ArcadeKit.kick(5, 180);
    breakCombo('wrong');
    return;
  }
  const perfect = dist <= PERFECT_HALF * dunk.cfg.window;
  dunk.fever.hit(perfect ? 2 : 1);
  let worth = Math.round(storm.perFlyer * dunk.cfg.mult * (perfect ? 2 : 1) * dunk.fever.mult);
  if (n.golden) worth *= GOLDEN_MULTIPLIER;
  worth = Math.max(1, worth);
  storm.caught += worth;

  n.dunked = true; n.popping = true; n.popT = 0; n.targetCup = cup;
  const col = cup.sauce.rim;
  const tag = (n.golden ? '✨ ' : '') + (perfect ? 'PERFECT +' : '+') + fmt.format(worth);
  spawnPopLabel(n.cx, dunk.beltY - 34, tag, n.golden || perfect ? 'golden' : '');
  splashCup(cup);
  ArcadeKit.burst(cup.x, dunk.beltY, { n: perfect ? 12 : 7, color: col, speed: 240, life: 0.5, size: 7 });
  if (perfect) ArcadeKit.kick(4, 120);

  dunk.served++;
  updateQuotaBar();
  updateCombo();
  updateStormHud();
  if (dunk.served >= dunk.quota) completeShift();
}

function breakCombo(kind) {
  if (dunk.fever.level > 0 || dunk.fever.streak > 0) { dunk.fever.miss(); updateCombo(); }
}

function splashCup(cup) {
  cup.el.classList.remove('splash'); void cup.el.offsetWidth; cup.el.classList.add('splash');
}

function updateCombo() {
  if (dunk.fever && dunk.fever.active) {
    dunkCombo.textContent = (dunk.fever.level >= dunk.fever.maxLevel ? '🔥 FEVER ×' : '🔥 ×') + dunk.fever.mult.toFixed(1);
    dunkCombo.classList.add('active');
    dunkCombo.classList.toggle('fever', dunk.fever.level >= dunk.fever.maxLevel);
    dunkCombo.classList.remove('pulse'); void dunkCombo.offsetWidth; dunkCombo.classList.add('pulse');
    document.body.classList.toggle('dunk-fever', dunk.fever.level >= dunk.fever.maxLevel);
  } else {
    dunkCombo.classList.remove('active', 'fever');
    document.body.classList.remove('dunk-fever');
  }
}

function updateQuotaBar() {
  const pct = Math.max(0, Math.min(1, dunk.served / dunk.quota));
  dunkQuota.style.setProperty('--p', (pct * 100).toFixed(1) + '%');
  dunkQuota.dataset.label = (dunk.shift >= FINALE_SHIFT ? '🟣 SECRET ORDER ' : 'SHIFT ' + dunk.shift + ' ') +
    dunk.served + '/' + dunk.quota;
}

// ---- Shift flow ----------------------------------------------------------------

function completeShift() {
  const cleared = dunk.shift;
  ArcadeKit.saveBest('dunk', dunk.cfg.key, cleared);
  if (cleared > dunk.best) dunk.best = cleared;
  // unlock THE WEEDS by clearing shift 3 on RUSH+
  if (cleared >= 3 && dunk.cfg.key !== 'prep') { try { localStorage.setItem('nugDunkWeeds', '1'); } catch (e) { /* ok */ } }
  // the finale
  if (dunk.shift >= FINALE_SHIFT && !dunk.finaleCleared) {
    dunk.finaleCleared = true;
    try { localStorage.setItem('nugDunkSecret', '1'); } catch (e) { /* ok */ }
    spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.4, '🟣 THE SECRET SAUCE IS YOURS', 'big');
    ArcadeKit.kick(16, 500);
    ArcadeKit.burst(window.innerWidth / 2, window.innerHeight * 0.42, { n: 34, color: '#c4a0ff', speed: 420, life: 0.9 });
  } else {
    spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.4, `✅ SHIFT ${cleared} DONE — nice hustle!`, 'big');
    ArcadeKit.kick(9, 300);
  }
  dunk.phase = 'break';
  dunk.breakT = 1.6;
}

function nextShift() {
  dunk.shift++;
  dunk.served = 0;
  dunk.quota = shiftQuota(dunk.shift);
  dunk.elapsed = 0;
  dunk.spawnT = 0.6;
  buildStations(cupsForShift());
  updateQuotaBar();
  updateCombo();
  dunk.phase = 'playing';
  spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.34,
    dunk.shift >= FINALE_SHIFT ? '🟣 THE SECRET SAUCE' : `SHIFT ${dunk.shift}`, 'big');
}

// ---- Per-frame -----------------------------------------------------------------

function stepDunk(dt, w, h) {
  if (dunk.phase === 'tier') return;
  layoutDunk(w, h);

  if (dunk.phase === 'break') {
    dunk.breakT -= dt;
    stepNuggets(dt, w, h, true); // let in-flight orders resolve, no new spawns
    if (dunk.breakT <= 0) nextShift();
    return;
  }

  dunk.elapsed += dt;
  dunk.spawnT -= dt;
  if (dunk.spawnT <= 0) spawnNugget();
  stepNuggets(dt, w, h, false);

  // ready-glow on zones holding a matching nugget
  for (const cup of dunk.cups) {
    const f = nuggetInZone(cup);
    const ready = f && !f.n.burnt && (f.n.golden || (f.n.sauce && f.n.sauce.key === cup.sauce.key));
    cup.zoneEl.classList.toggle('ready', !!ready);
  }
}

function stepNuggets(dt, w, h, breakMode) {
  const speed = beltSpeed();
  const lastX = dunk.cups.length ? dunk.cups[dunk.cups.length - 1].x : w * 0.7;
  for (let i = dunk.nuggets.length - 1; i >= 0; i--) {
    const n = dunk.nuggets[i];
    const half = n.size / 2;
    if (n.popping) {
      n.popT += dt;
      const t = Math.min(n.popT / DUNK_POP_SECS, 1);
      if (n.miss) {
        n.el.style.opacity = String(1 - t);
        n.el.style.transform = `translate(${n.cx - half}px, ${dunk.beltY - half + t * 70}px) rotate(${t * 80}deg)`;
      } else {
        const toX = (n.targetCup ? n.targetCup.x : n.cx) - half;
        const x = (n.cx - half) + (toX - (n.cx - half)) * t;
        n.el.style.opacity = String(1 - t * 0.9);
        n.el.style.transform = `translate(${x}px, ${dunk.beltY - half + t * 14}px) scale(${1 - t * 0.6})`;
      }
      if (t >= 1) { n.el.remove(); dunk.nuggets.splice(i, 1); }
      continue;
    }
    n.cx += speed * dt;
    n.bob += dt * 3;
    n.el.style.transform =
      `translate(${n.cx - half}px, ${dunk.beltY - half + Math.sin(n.bob) * 4}px) rotate(${Math.sin(n.bob) * 7}deg)`;

    // fell off the end un-dunked
    if (n.cx > lastX + SWEET_HALF + 40) {
      n.popping = true; n.miss = true; n.popT = 0;
      if (!n.burnt) breakCombo('miss'); // letting a real order go breaks the combo; burnt is fine to skip
    }
  }
}

// ---- Input ---------------------------------------------------------------------

function dunkKeyIndex(code) {
  const m = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
  return code in m ? m[code] : -1;
}
window.addEventListener('keydown', (e) => {
  if (!dunkActive() || dunk.phase !== 'playing') return;
  if (e.target && e.target.tagName === 'INPUT') return;
  const idx = dunkKeyIndex(e.code);
  if (idx >= 0 && idx < dunk.cups.length) { doDunkAt(idx); e.preventDefault(); }
  else if (e.code === 'Space' || e.code === 'ArrowDown') { doAutoServe(); e.preventDefault(); }
});
// tap/click a cup to serve it (great on touch — big targets)
function cupHit(e) {
  if (!dunkActive() || dunk.phase !== 'playing') return;
  const cup = e.target.closest('.dunk-cup');
  if (cup) { doDunkAt(+cup.dataset.i); if (e.cancelable) e.preventDefault(); }
}
dunkStations.addEventListener('mousedown', cupHit);
dunkStations.addEventListener('touchstart', cupHit, { passive: false });
// a tap anywhere else on the belt = auto-serve (one-button friendly)
window.addEventListener('mousedown', (e) => {
  if (!dunkActive() || dunk.phase !== 'playing') return;
  if (e.target.closest('.storm-hud') || e.target.closest('.ak-tier') || e.target.closest('.dunk-cup')) return;
  doAutoServe();
});

// Test/debug hook.
window.dunkDebug = function (opts) {
  opts = opts || {};
  if (opts.tier) dunk.cfg = DUNK_TIERS.find((t) => t.key === opts.tier) || dunk.cfg;
  if (opts.pick && dunk.tierPick) { dunk.tierPick.close(); dunk.tierPick = null; startShifts(); }
  if (opts.shift != null) { dunk.shift = opts.shift; dunk.served = 0; dunk.quota = shiftQuota(opts.shift); buildStations(cupsForShift()); updateQuotaBar(); }
  if (opts.fill != null) { dunk.served = Math.min(dunk.quota, opts.fill); updateQuotaBar(); }
  if (opts.forceServe && dunk.cups.length) {
    // park a matching nugget dead-center in cup 0's zone and serve it (deterministic)
    const cup = dunk.cups[0];
    const el = document.createElement('div');
    el.className = 'dunk-nug';
    el.innerHTML = `<img src="nugget.png" alt=""/><span class="dn-flag dot" style="background:${cup.sauce.rim}"></span>`;
    document.body.appendChild(el);
    dunk.nuggets.push({ el, cx: cup.x, size: DUNK_NUG, sauce: cup.sauce, golden: false, burnt: false,
      dunked: false, popping: false, popT: 0, miss: false, bob: 0 });
    doDunkAt(0);
  }
  if (opts.complete) { dunk.served = dunk.quota; completeShift(); }
  if (opts.serve) doAutoServe();
  return { phase: dunk.phase, shift: dunk.shift, served: dunk.served, quota: dunk.quota,
    cups: dunk.cups.map((c) => c.sauce.key), finale: dunk.finaleCleared, fever: dunk.fever ? dunk.fever.level : 0 };
};
