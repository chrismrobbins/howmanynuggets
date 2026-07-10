// ---- Sauce Dunk --------------------------------------------------------------
// A timing game: nuggets ride a conveyor belt toward a sauce cup. Tap SPACE (or
// click) to dunk the nugget that's in the sweet spot just before the cup. Hit
// the green PERFECT band for double points; consecutive dunks build a combo
// multiplier. Let a nugget reach the cup un-dunked (or whiff on empty air) and
// the combo resets. Golden nuggets still pay 10x. Like Flappy, this mode pauses
// the background storm so the belt is the whole show.

const dunkBelt  = document.getElementById('dunkBelt');
const dunkZone  = document.getElementById('dunkZone');
const dunkCup   = document.getElementById('dunkCup');
const dunkCombo = document.getElementById('dunkCombo');

const DUNK_NUG_SIZE   = 54;
const BELT_FRAC       = 0.60;   // belt height as a fraction of the viewport
const CUP_FROM_RIGHT  = 130;    // cup center, px from the right edge
const DUNK_OFFSET     = 96;     // sweet-spot center sits this far left of the cup
const SWEET_HALF      = 68;     // half-width of the dunkable ("ok") zone
const PERFECT_HALF    = 24;     // half-width of the center PERFECT band
const BASE_SPEED      = 150;    // belt speed px/sec (scaled by category + ramp)
const SPAWN_MAX       = 1.5;    // seconds between nuggets early on
const SPAWN_MIN       = 0.8;    // ...tightening as the round goes on
const DUNK_POP_SECS        = 0.3;

const dunk = {
  on: false,
  nuggets: [],   // { el, cx, size, golden, bob, dunked, popping, popT, miss }
  spawnT: 0,
  elapsed: 0,
  combo: 0,
  beltY: 0,
  cupX: 0,
  dunkX: 0,
};

function dunkActive() {
  return storm.mode === 'dunk' && storm.running;
}

// Position the belt / cup / zone / combo pill for the current viewport.
function layoutDunk(w, h) {
  const beltY = Math.round(h * BELT_FRAC);
  dunk.beltY = beltY;
  dunk.cupX  = w - CUP_FROM_RIGHT;
  dunk.dunkX = dunk.cupX - DUNK_OFFSET;

  dunkBelt.style.top = (beltY + DUNK_NUG_SIZE * 0.5) + 'px';

  dunkCup.style.left = (dunk.cupX - 45) + 'px';
  dunkCup.style.top  = (beltY - 24) + 'px';

  dunkZone.style.left   = (dunk.dunkX - SWEET_HALF) + 'px';
  dunkZone.style.top    = (beltY - DUNK_NUG_SIZE * 0.5 - 6) + 'px';
  dunkZone.style.width  = (SWEET_HALF * 2) + 'px';
  dunkZone.style.height = (DUNK_NUG_SIZE + 12) + 'px';

  dunkCombo.style.left = dunk.cupX + 'px';
  dunkCombo.style.top  = (beltY - 92) + 'px';
}

function syncDunk() {
  const active = dunkActive();
  if (active === dunk.on) return;
  dunk.on = active;
  document.body.classList.toggle('dunk-mode', active);
  dunkBelt.classList.toggle('active', active);
  dunkZone.classList.toggle('active', active);
  dunkCup.classList.toggle('active', active);
  if (active) {
    dunk.elapsed = 0;
    dunk.combo = 0;
    dunk.spawnT = 0.3;
    updateCombo();
    layoutDunk(window.innerWidth, window.innerHeight);
  } else {
    clearDunkNuggets();
    dunkCombo.classList.remove('active');
  }
}

function clearDunkNuggets() {
  dunk.nuggets.forEach((n) => n.el.remove());
  dunk.nuggets = [];
}

function spawnDunkNugget() {
  const el = document.createElement('img');
  el.className = 'dunk-nug';
  el.src = 'nugget.png';
  el.alt = '';
  el.draggable = false;
  const golden = Math.random() < storm.cat.golden;
  if (golden) el.classList.add('golden');
  document.body.appendChild(el);
  dunk.nuggets.push({
    el, cx: -DUNK_NUG_SIZE / 2, size: DUNK_NUG_SIZE, golden,
    bob: Math.random() * Math.PI * 2, dunked: false, popping: false, popT: 0, miss: false,
  });
  // Nuggets arrive faster as the round wears on.
  const t = Math.min(dunk.elapsed / 45, 1);
  const gap = (SPAWN_MAX - (SPAWN_MAX - SPAWN_MIN) * t) * (0.8 + Math.random() * 0.4);
  dunk.spawnT = gap / storm.cat.speed;
}

function updateCombo() {
  if (dunk.combo >= 2) {
    dunkCombo.textContent = '🔥 x' + dunk.combo;
    dunkCombo.classList.add('active');
    dunkCombo.classList.remove('pulse');
    void dunkCombo.offsetWidth; // restart the pulse animation
    dunkCombo.classList.add('pulse');
  } else {
    dunkCombo.classList.remove('active');
  }
}

function splashCup() {
  dunkCup.classList.remove('splash');
  void dunkCup.offsetWidth;
  dunkCup.classList.add('splash');
}

// SPACE / click: dunk the nugget nearest the sweet-spot center.
function doDunk() {
  if (!dunkActive()) return;
  let best = null, bestDist = Infinity;
  for (const n of dunk.nuggets) {
    if (n.dunked || n.popping) continue;
    const d = Math.abs(n.cx - dunk.dunkX);
    if (d <= SWEET_HALF && d < bestDist) { best = n; bestDist = d; }
  }

  if (!best) { // whiffed on empty air — combo broken
    if (dunk.combo) { dunk.combo = 0; updateCombo(); }
    return;
  }

  const perfect = bestDist <= PERFECT_HALF;
  dunk.combo += 1;
  const comboFactor = 1 + Math.min(dunk.combo - 1, 20) * 0.1; // up to 3x at combo 21
  let worth = Math.max(1, Math.round(storm.perFlyer * (perfect ? 2 : 1) * comboFactor));
  if (best.golden) worth *= GOLDEN_MULTIPLIER;

  storm.caught += worth;
  best.dunked = true;
  best.popping = true;
  best.popT = 0;

  const tag = (best.golden ? '✨ ' : '') + (perfect ? 'PERFECT +' : '+') + fmt.format(worth);
  spawnPopLabel(best.cx, dunk.beltY - 32, tag, best.golden || perfect ? 'golden' : '');
  splashCup();
  updateCombo();
  updateStormHud();
}

// Called from the storm's rAF loop each frame while dunk mode is active.
function stepDunk(dt, w, h) {
  dunk.elapsed += dt;
  layoutDunk(w, h);
  const speed = BASE_SPEED * storm.cat.speed * (1 + Math.min(dunk.elapsed / 60, 1));

  dunk.spawnT -= dt;
  if (dunk.spawnT <= 0) spawnDunkNugget();

  for (let i = dunk.nuggets.length - 1; i >= 0; i--) {
    const n = dunk.nuggets[i];
    const half = n.size / 2;

    if (n.popping) {
      n.popT += dt;
      const t = Math.min(n.popT / DUNK_POP_SECS, 1);
      if (n.miss) {
        // slide past the cup and fade
        n.el.style.opacity = String(1 - t);
        n.el.style.transform =
          `translate(${n.cx - half}px, ${dunk.beltY - half + t * 70}px) rotate(${t * 90}deg)`;
      } else {
        // dunk: shrink into the sauce cup
        const fromX = n.cx - half;
        const toX = dunk.cupX - half;
        const x = fromX + (toX - fromX) * t;
        n.el.style.opacity = String(1 - t * 0.9);
        n.el.style.transform = `translate(${x}px, ${dunk.beltY - half + t * 12}px) scale(${1 - t * 0.6})`;
      }
      if (t >= 1) { n.el.remove(); dunk.nuggets.splice(i, 1); }
      continue;
    }

    n.cx += speed * dt;
    n.bob += dt * 3;
    const bob = Math.sin(n.bob) * 4;
    n.el.style.transform =
      `translate(${n.cx - half}px, ${dunk.beltY - half + bob}px) rotate(${Math.sin(n.bob) * 8}deg)`;

    // Reached the cup un-dunked → miss, combo resets.
    if (n.cx > dunk.cupX) {
      n.popping = true;
      n.miss = true;
      n.popT = 0;
      if (dunk.combo) { dunk.combo = 0; updateCombo(); }
    }
  }
}

window.addEventListener('mousedown', (e) => {
  if (!dunkActive()) return;
  if (e.target.closest('.storm-hud')) return; // HUD buttons aren't the belt
  doDunk();
});

window.addEventListener('keydown', (e) => {
  if (!dunkActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return; // don't hijack typing
  if (e.code === 'Space' || e.code === 'ArrowDown') {
    doDunk();
    e.preventDefault(); // keep the page from scrolling
  }
});

// Drop the splash class once its animation finishes so it can retrigger.
dunkCup.addEventListener('animationend', () => dunkCup.classList.remove('splash'));
