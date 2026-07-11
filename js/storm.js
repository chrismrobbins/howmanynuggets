// ---- Nugget storm engine (the Nugget Arcade) ---------------------------------
// The user launches the storm from the card's arcade button at any amount.
// It escalates through five categories based on the dollar amount — higher
// tiers mean more nuggets, faster winds, a vortex swirl, and (at Cat 5) a
// trembling card. Each flying nugget is a "flyer" worth a batch of real
// nuggets so even a $10M storm wraps up in roughly a minute.
//
// The storm doubles as an arcade. Three modes, switchable in the HUD:
//   🧺 catch   — click nuggets out of the air (this file)
//   🔫 blaster — nuggets rain down, you shoot them (js/blaster.js)
//   🐤 flappy  — pilot a nugget through nugget towers (js/flappy.js)
// Golden nugs/gates are always worth 10x.

const stormEl     = document.getElementById('nuggetStorm');
const stormHud    = document.getElementById('stormHud');
const stormLabel  = document.getElementById('stormLabel');
const stormTally  = document.getElementById('stormTally');
const stormCaught = document.getElementById('stormCaught');
const stormHint   = document.getElementById('stormHint');
const stormStop   = document.getElementById('stormStop');
const modeSwitch  = document.getElementById('modeSwitch');

// Ordered high → low so the first match wins.
const STORM_CATEGORIES = [
  { min: 8500000, name: 'Cat 5 · The Nuggnado',     emoji: '🌪️', maxOnScreen: 140, spawnPerFrame: 6, speed: 2.1,  vortex: 0.9,  shake: true,  golden: 0.030 },
  { min: 6500000, name: 'Cat 4 · Nugget Hurricane', emoji: '🌊', maxOnScreen: 115, spawnPerFrame: 5, speed: 1.8,  vortex: 0.6,  shake: false, golden: 0.025 },
  { min: 4500000, name: 'Cat 3 · Nugget Cyclone',   emoji: '🌀', maxOnScreen: 95,  spawnPerFrame: 4, speed: 1.5,  vortex: 0.35, shake: false, golden: 0.020 },
  { min: 2500000, name: 'Cat 2 · Nugget Squall',    emoji: '🌧️', maxOnScreen: 75,  spawnPerFrame: 3, speed: 1.25, vortex: 0,    shake: false, golden: 0.015 },
  { min: 0,       name: 'Cat 1 · Nugget Flurry',    emoji: '🌬️', maxOnScreen: 55,  spawnPerFrame: 2, speed: 1.0,  vortex: 0,    shake: false, golden: 0.010 },
];

const GOLDEN_MULTIPLIER = 10;
const POP_SECS = 0.3; // catch/expiry pop animation length
const TTL_SECS = 9;   // recycle swirling nuggets that never drift off screen

const MODE_HINTS = {
  catch:   "click nugs to catch 'em!",
  blaster: 'defend the city! ← → to move · space or click to blast',
  flappy:  'space or click to flap — mind the nugget towers!',
  dunk:    'time it! space or click to dunk each nugget in the sauce',
  sim:     'you are a nugget. sit. watch. accrue wisdom.',
  run:     'space/click to jump (twice = flip!) · hold ↓ to slide',
  knight:  'defend the gate! ← → move · space jump · click/X slash',
  brawl:   'walk right, clean the kitchen! ←→↑↓ move · X/click punch · space dodge',
  ranch:   'raise the flock! 🌾 feed to keep birds alive · 🏭 ship grown hens for nuggets',
};
const MODE_BADGE = { catch: '🧺', blaster: '🎯', flappy: '🐤', dunk: '🥣', sim: '🧘', run: '🏃', knight: '⚔️', brawl: '🥊', ranch: '🐔' };
const MODE_VERB  = { catch: 'caught', blaster: 'blasted', flappy: 'scored', dunk: 'dunked', sim: 'contemplated', run: 'ran', knight: 'vanquished', brawl: 'sauced', ranch: 'harvested' };

// Self-contained minigames run their own entities and pause the storm's own
// falling-nugget spawner + auto-complete (like Flappy). Catch and Blaster both
// use the storm particles, so they are NOT in this set.
function pausesStorm() {
  return storm.mode === 'flappy' || storm.mode === 'dunk' || storm.mode === 'sim' ||
         storm.mode === 'run' || storm.mode === 'knight' || storm.mode === 'brawl' ||
         storm.mode === 'ranch';
}

const storm = {
  running: false,
  arcade: false,   // user pressed the arcade button; cleared by stopStorm
  mode: 'catch',   // 'catch' | 'blaster' | 'flappy' — sticky across storms
  cat: STORM_CATEGORIES[STORM_CATEGORIES.length - 1],
  total: 0,        // nuggets this storm represents
  perFlyer: 1,     // nuggets each flying image is worth
  launched: 0,     // nuggets that have entered the screen so far
  caught: 0,       // nuggets caught/blasted/scored by the user
  particles: [],   // active flying nuggets
  pool: [],        // recycled <img> elements
  rafId: null,
  last: 0,
  doneTimer: null, // hides the "storm complete" HUD after a beat
};

function stormCategory(dollars) {
  return STORM_CATEGORIES.find((c) => dollars >= c.min);
}

// Pace flyers so any storm finishes in roughly a minute regardless of size.
function computePerFlyer(total, cat) {
  const TARGET_SECS = 75;
  const flyersPerSec = cat.maxOnScreen / 4.5; // steady-state recycle rate
  return Math.max(1, Math.ceil(total / (flyersPerSec * TARGET_SECS)));
}

function setStormMode(mode) {
  storm.mode = mode;
  stormHint.textContent = MODE_HINTS[mode];
  modeSwitch.querySelectorAll('button').forEach((b) =>
    b.classList.toggle('on', b.dataset.mode === mode));
  syncBlaster();
  syncFlappy();
  syncDunk();
  syncSim();
  syncRun();
  syncKnight();
  syncBrawl();
  syncRanch();
  updateStormHud();
}

modeSwitch.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) setStormMode(btn.dataset.mode);
});

function spawnNugget() {
  const w = window.innerWidth, h = window.innerHeight;
  let el = storm.pool.pop();
  if (!el) {
    el = document.createElement('img');
    el.src = 'nugget.png';
    el.alt = '';
    el.draggable = false;
    stormEl.appendChild(el);
  }
  el.style.display = 'block';
  el.style.opacity = '';
  const size = 34 + Math.random() * 34;            // 34–68px
  el.style.width = size + 'px';
  el.style.height = size + 'px';

  const golden = Math.random() < storm.cat.golden;
  el.classList.toggle('golden', golden);

  const speed = (90 + Math.random() * 160) * storm.cat.speed; // px/sec
  let x, y, vx, vy;
  if (storm.mode === 'blaster') {
    // Blaster mode: everything rains from the sky, old-school style.
    x = Math.random() * w;
    y = -size;
    vx = (Math.random() - 0.5) * speed * 0.4;
    vy = (0.6 + Math.random() * 0.4) * speed;
  } else {
    // Start just off a random edge, drift generally across the screen.
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0)      { x = -size;   y = Math.random()*h; vx =  speed; vy = (Math.random()-0.5)*speed; }
    else if (edge === 1) { x = w+size;  y = Math.random()*h; vx = -speed; vy = (Math.random()-0.5)*speed; }
    else if (edge === 2) { x = Math.random()*w; y = -size;   vx = (Math.random()-0.5)*speed; vy =  speed; }
    else                 { x = Math.random()*w; y = h+size;  vx = (Math.random()-0.5)*speed; vy = -speed; }
  }

  storm.particles.push({
    el, x, y, vx, vy, size,
    worth: Math.min(storm.perFlyer, storm.total - storm.launched),
    golden,
    age: 0,
    popping: false,
    popT: 0,
    rot: Math.random()*360,
    vrot: (Math.random()-0.5)*180 * storm.cat.speed,  // deg/sec spin
    sway: 10 + Math.random()*30,                      // floaty sway amplitude
    swaySpeed: 1 + Math.random()*2,                   // rad/sec
    phase: Math.random()*Math.PI*2,
  });
  storm.launched += storm.particles[storm.particles.length - 1].worth;
}

function recycleParticle(i) {
  const p = storm.particles[i];
  p.el.style.display = 'none';
  p.el.style.opacity = '';
  p.el.classList.remove('golden');
  storm.pool.push(p.el);
  storm.particles.splice(i, 1);
}

// A nugget got caught (clicked) or blasted (shot) — score it and pop it.
function catchParticle(p, labelX, labelY) {
  const worth = p.golden ? p.worth * GOLDEN_MULTIPLIER : p.worth;
  storm.caught += worth;
  p.popping = true;
  p.popT = 0;
  spawnCatchLabel(labelX, labelY, worth, p.golden);
  updateStormHud();
}

function updateStormHud() {
  if (storm.mode === 'sim') {
    // The simulator has no storm to tally — show the nugget's life instead.
    stormLabel.textContent = '🧘 Nugget Simulator';
    stormTally.textContent = simTally();
  } else if (storm.mode === 'run') {
    stormLabel.textContent = '🏃 Nugget Run';
    stormTally.textContent = runTally();
  } else if (storm.mode === 'knight') {
    stormLabel.textContent = '🗡️ Nugget Knight';
    stormTally.textContent = knightTally();
  } else if (storm.mode === 'brawl') {
    stormLabel.textContent = '🥊 Sauce Brawl';
    stormTally.textContent = brawlTally();
  } else if (storm.mode === 'ranch') {
    stormLabel.textContent = '🐔 Nugget Ranch';
    stormTally.textContent = ranchTally();
  } else {
    const shown = Math.min(storm.launched, storm.total);
    stormLabel.textContent = storm.cat.emoji + ' ' + storm.cat.name;
    stormTally.innerHTML = fmt.format(shown) +
      ' <span class="total">/ ' + fmt.format(storm.total) + ' nugs</span>';
  }
  stormCaught.textContent = MODE_BADGE[storm.mode] + ' ' + fmt.format(storm.caught);
}

function stepStorm(ts) {
  if (!storm.running) return;
  if (!storm.last) storm.last = ts;
  const dt = Math.min((ts - storm.last) / 1000, 0.05); // clamp after tab switches
  storm.last = ts;
  const w = window.innerWidth, h = window.innerHeight, margin = 120;
  const cat = storm.cat;

  // Flappy and Dunk pause the launch counter — those modes own the screen.
  if (storm.launched < storm.total && !pausesStorm()) {
    const room = cat.maxOnScreen - storm.particles.length;
    const toSpawn = Math.min(room, cat.spawnPerFrame);
    for (let i = 0; i < toSpawn && storm.launched < storm.total; i++) spawnNugget();
  }

  const cx = w / 2, cy = h / 2;
  for (let i = storm.particles.length - 1; i >= 0; i--) {
    const p = storm.particles[i];

    // Caught/blasted (or expired) nuggets pop: scale up and fade, then recycle.
    if (p.popping) {
      p.popT += dt;
      const t = Math.min(p.popT / POP_SECS, 1);
      p.el.style.opacity = String(1 - t);
      p.el.style.transform =
        `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg) scale(${1 + t * 1.2})`;
      if (t >= 1) recycleParticle(i);
      continue;
    }

    p.age += dt;
    p.phase += p.swaySpeed * dt;
    p.x += (p.vx + Math.cos(p.phase) * p.sway) * dt;
    p.y += (p.vy + Math.sin(p.phase) * p.sway) * dt;

    // Higher categories swirl everything around the screen center
    // (catch mode only — the minigames need predictable motion).
    if (cat.vortex > 0 && storm.mode === 'catch') {
      const dx = p.x - cx, dy = p.y - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const swirl = cat.vortex * 220;
      p.x += (-dy / dist) * swirl * dt;
      p.y += (dx / dist) * swirl * dt;
    }

    p.rot += p.vrot * dt;
    p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`;

    if (p.x < -margin || p.x > w + margin || p.y < -margin || p.y > h + margin) {
      recycleParticle(i);
    } else if (p.age > TTL_SECS) {
      // Vortex riders can orbit forever — poof them so the storm keeps flowing.
      p.popping = true;
      p.popT = 0;
    }
  }

  if (storm.mode === 'blaster') stepBlaster(dt, w, h);
  else if (storm.mode === 'flappy') stepFlappy(dt, w, h);
  else if (storm.mode === 'dunk') stepDunk(dt, w, h);
  else if (storm.mode === 'sim') stepSim(dt, w, h);
  else if (storm.mode === 'run') stepRun(dt, w, h);
  else if (storm.mode === 'knight') stepKnight(dt, w, h);
  else if (storm.mode === 'brawl') stepBrawl(dt, w, h);
  else if (storm.mode === 'ranch') stepRanch(dt, w, h);

  updateStormHud();

  if (storm.launched >= storm.total && storm.particles.length === 0 && !pausesStorm()) {
    stopStorm(true);
    return;
  }
  storm.rafId = requestAnimationFrame(stepStorm);
}

// Little text that floats up and fades from a point on screen.
function spawnPopLabel(x, y, text, cls = '') {
  const label = document.createElement('div');
  label.className = ('catch-pop ' + cls).trim();
  label.textContent = text;
  label.style.left = x + 'px';
  label.style.top = y + 'px';
  document.body.appendChild(label);
  label.addEventListener('animationend', () => label.remove());
}

// "+1,234" for a scored nugget.
function spawnCatchLabel(x, y, worth, golden) {
  spawnPopLabel(x, y, (golden ? '✨ +' : '+') + fmt.format(worth), golden ? 'golden' : '');
}

stormEl.addEventListener('click', (e) => {
  if (storm.mode !== 'catch') return; // minigames score their own way
  const el = e.target.closest('img');
  if (!el) return;
  const p = storm.particles.find((q) => q.el === el && !q.popping);
  if (!p) return;
  catchParticle(p, e.clientX, e.clientY);
});

function startStorm(total, dollars) {
  const cat = stormCategory(dollars);
  storm.total = total;
  if (storm.running) {
    // Live edits mid-storm: re-tier the winds and re-pace what's left.
    storm.cat = cat;
    document.body.classList.toggle('storm-shake', cat.shake);
    storm.perFlyer = computePerFlyer(Math.max(storm.total - storm.launched, 1), cat);
    updateStormHud();
    return;
  }
  clearTimeout(storm.doneTimer);
  storm.cat = cat;
  storm.running = true;
  storm.launched = 0;
  storm.caught = 0;
  storm.last = 0;
  storm.perFlyer = computePerFlyer(total, cat);
  document.body.classList.toggle('storm-shake', cat.shake);
  document.body.classList.add('storm-active');
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges(); // drop any selection made before the game began
  stormEl.classList.add('active');
  stormHud.classList.remove('done');
  stormHud.classList.add('active');
  setStormMode(storm.mode); // refresh hint/switch, wake the active minigame
  updateArcadeBtn();
  storm.rafId = requestAnimationFrame(stepStorm);
}

function stopStorm(completed = false) {
  storm.arcade = false;
  updateArcadeBtn();
  if (!storm.running && storm.particles.length === 0 && storm.pool.length === 0) return;
  storm.running = false;

  // Report this session's score for high-score tracking. No-op when signed out
  // or when the API isn't reachable (see js/account.js → onArcadeScore).
  if (storm.caught > 0 && typeof window.onArcadeScore === 'function') {
    window.onArcadeScore(storm.mode, storm.caught);
  }

  if (storm.rafId) cancelAnimationFrame(storm.rafId);
  storm.rafId = null;
  storm.particles.forEach((p) => p.el.remove());
  storm.pool.forEach((el) => el.remove());
  storm.particles = [];
  storm.pool = [];
  document.body.classList.remove('storm-shake');
  document.body.classList.remove('storm-active');
  stormEl.classList.remove('active');
  syncBlaster();
  syncFlappy();
  syncDunk();
  syncSim();
  syncRun();
  syncKnight();
  syncBrawl();
  syncRanch();
  if (completed) {
    // Leave a short victory-lap summary in the HUD, then tuck it away.
    stormLabel.textContent = '✅ Storm complete';
    stormTally.innerHTML = fmt.format(storm.total) + ' <span class="total">nugs flew by</span>';
    stormCaught.textContent = MODE_BADGE[storm.mode] + ' ' + MODE_VERB[storm.mode] + ' ' + fmt.format(storm.caught);
    stormHud.classList.add('done');
    clearTimeout(storm.doneTimer);
    storm.doneTimer = setTimeout(() => stormHud.classList.remove('active', 'done'), 5000);
  } else {
    stormHud.classList.remove('active', 'done');
  }

  // Games launched from the 3D hall return there instead of to the page
  // (see js/arcade.js). No-op when the hall isn't up.
  if (typeof window.onStormExit === 'function') window.onStormExit(completed);
}

stormStop.addEventListener('click', () => stopStorm());
