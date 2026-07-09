// ---- Blaster mode ------------------------------------------------------------
// Missile Command, fry-station edition: nuggets rain from the sky onto a
// defenseless skyline and every landing flattens real estate. Slide the laser
// cannon (mouse or ← →), blast nuggets (click or space) before they hit the
// buildings, and shoot the falling crates for power-ups (⚡ rapid fire,
// 🔱 triple shot, 🛡️ city shield). Three hits levels a building; lose the
// whole block and the city rebuilds after a beat. Golden nugs still pay 10x.

const cannonEl  = document.getElementById('blasterCannon');
const cityEl    = document.getElementById('cityRow');
const shieldEl  = document.getElementById('cityShield');
const powerChip = document.getElementById('powerChip');

const BOLT_SPEED = 950;       // px/sec upward
const FIRE_COOLDOWN = 0.16;   // seconds between shots while the trigger is held
const RAPID_COOLDOWN = 0.06;  // ...unless ⚡ rapid fire is live
const CANNON_SPEED = 650;     // px/sec with arrow keys
const CANNON_MARGIN = 30;     // keep the cannon fully on screen

const CITY_BUILDINGS = 7;
const BUILDING_HP = 3;
const SHIELD_HEIGHT = 170;    // shield line height above the screen bottom
const CITY_REBUILD_SECS = 3;
const POWERUP_DURATION = 8;   // seconds a power-up stays active
const DROP_SPEED = 110;       // px/sec crate fall
const DROP_MIN_GAP = 7;       // seconds between crates
const DROP_MAX_GAP = 13;

const POWERUPS = [
  { key: 'rapid',  emoji: '⚡', label: 'RAPID FIRE' },
  { key: 'triple', emoji: '🔱', label: 'TRIPLE SHOT' },
  { key: 'shield', emoji: '🛡️', label: 'CITY SHIELD' },
];

const blaster = {
  x: window.innerWidth / 2,
  bolts: [],            // { el, x, y, vx }
  keys: { left: false, right: false },
  firing: false,
  cooldown: 0,
  city: [],             // { el, x, w, h, hp }
  rebuildT: 0,          // countdown while the flattened city rebuilds
  drops: [],            // falling power-up crates { el, x, y, def }
  nextDropT: 4,         // first crate shows up quickly so players discover them
  power: null,          // { def, t } — the active power-up
};

function blasterActive() {
  return storm.mode === 'blaster' && storm.running;
}

// Reconcile blaster visuals with the current storm + mode state.
function syncBlaster() {
  const active = blasterActive();
  document.body.classList.toggle('blaster-mode', active);
  cannonEl.classList.toggle('active', active);
  cityEl.classList.toggle('active', active);
  if (active) {
    blaster.x = clampCannonX(blaster.x);
    positionCannon();
    if (!blaster.city.length) buildCity();
  } else {
    blaster.firing = false;
    blaster.rebuildT = 0;
    blaster.nextDropT = 4;
    clearBolts();
    clearDrops();
    clearCity();
    expirePower();
  }
}

function clampCannonX(x) {
  return Math.min(Math.max(x, CANNON_MARGIN), window.innerWidth - CANNON_MARGIN);
}

function positionCannon() {
  cannonEl.style.transform = `translateX(${blaster.x}px)`;
}

function clearBolts() {
  blaster.bolts.forEach((b) => b.el.remove());
  blaster.bolts = [];
}

function clearDrops() {
  blaster.drops.forEach((d) => d.el.remove());
  blaster.drops = [];
}

// ---- The city ----------------------------------------------------------------

function buildCity() {
  cityEl.innerHTML = '';
  blaster.city = [];
  const w = window.innerWidth;
  const slot = w / CITY_BUILDINGS;
  for (let i = 0; i < CITY_BUILDINGS; i++) {
    const bw = slot * (0.5 + Math.random() * 0.3);
    const bx = i * slot + (slot - bw) / 2;
    const bh = 60 + Math.random() * 80;
    const el = document.createElement('div');
    el.className = 'city-building';
    el.style.left = bx + 'px';
    el.style.width = bw + 'px';
    el.style.height = bh + 'px';
    cityEl.appendChild(el);
    blaster.city.push({ el, x: bx, w: bw, h: bh, hp: BUILDING_HP });
  }
}

function clearCity() {
  cityEl.innerHTML = '';
  blaster.city = [];
}

function damageBuilding(b, x, y) {
  b.hp--;
  b.el.classList.toggle('dmg1', b.hp === 2);
  b.el.classList.toggle('dmg2', b.hp === 1);
  if (b.hp <= 0) {
    b.el.classList.add('rubble');
    b.el.style.height = '16px';
    b.h = 16;
  }
  spawnPopLabel(x, y, b.hp > 0 ? '💥' : '🏚️');
  if (blaster.rebuildT <= 0 && blaster.city.every((c) => c.hp <= 0)) {
    blaster.rebuildT = CITY_REBUILD_SECS;
    spawnPopLabel(window.innerWidth / 2, window.innerHeight / 2,
      '🏚️ CITY DOWN — rebuilding…', 'big');
  }
}

// ---- Power-ups -----------------------------------------------------------------

function spawnDrop(w) {
  const def = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
  const el = document.createElement('div');
  el.className = 'power-drop';
  el.textContent = def.emoji;
  const x = 40 + Math.random() * (w - 80);
  el.style.transform = `translate(${x}px, -40px)`;
  document.body.appendChild(el);
  blaster.drops.push({ el, x, y: -40, def });
  blaster.nextDropT = DROP_MIN_GAP + Math.random() * (DROP_MAX_GAP - DROP_MIN_GAP);
}

function activatePower(def, x, y) {
  blaster.power = { def, t: POWERUP_DURATION };
  shieldEl.classList.toggle('active', def.key === 'shield');
  spawnPopLabel(x, y, def.emoji + ' ' + def.label, 'golden');
  updatePowerChip();
}

function expirePower() {
  blaster.power = null;
  shieldEl.classList.remove('active');
  updatePowerChip();
}

function updatePowerChip() {
  if (blaster.power) {
    powerChip.textContent =
      `${blaster.power.def.emoji} ${blaster.power.def.label} · ${Math.ceil(blaster.power.t)}s`;
    powerChip.classList.add('active');
  } else {
    powerChip.classList.remove('active');
  }
}

// ---- Shooting -------------------------------------------------------------------

function fireBolt() {
  const spread = blaster.power && blaster.power.def.key === 'triple' ? [-150, 0, 150] : [0];
  const y = cannonEl.getBoundingClientRect().top - 12;
  for (const vx of spread) {
    const el = document.createElement('div');
    el.className = 'blaster-bolt';
    el.style.transform = `translate(${blaster.x}px, ${y}px)`;
    document.body.appendChild(el);
    blaster.bolts.push({ el, x: blaster.x, y, vx });
  }
  blaster.cooldown =
    blaster.power && blaster.power.def.key === 'rapid' ? RAPID_COOLDOWN : FIRE_COOLDOWN;
}

// Called from the storm's rAF loop each frame while blaster mode is active.
function stepBlaster(dt, w, h) {
  const dir = (blaster.keys.right ? 1 : 0) - (blaster.keys.left ? 1 : 0);
  if (dir) {
    blaster.x = clampCannonX(blaster.x + dir * CANNON_SPEED * dt);
    positionCannon();
  }

  if (blaster.power) {
    blaster.power.t -= dt;
    if (blaster.power.t <= 0) expirePower();
    else updatePowerChip();
  }

  if (blaster.rebuildT > 0) {
    blaster.rebuildT -= dt;
    if (blaster.rebuildT <= 0) buildCity();
  }

  blaster.nextDropT -= dt;
  if (blaster.nextDropT <= 0) spawnDrop(w);
  for (let i = blaster.drops.length - 1; i >= 0; i--) {
    const d = blaster.drops[i];
    d.y += DROP_SPEED * dt;
    d.el.style.transform = `translate(${d.x}px, ${d.y}px)`;
    if (d.y > h - 10) {
      d.el.remove();
      blaster.drops.splice(i, 1);
    }
  }

  blaster.cooldown -= dt;
  if (blaster.firing && blaster.cooldown <= 0) fireBolt();

  for (let i = blaster.bolts.length - 1; i >= 0; i--) {
    const b = blaster.bolts[i];
    b.y -= BOLT_SPEED * dt;
    b.x += b.vx * dt;
    if (b.y < -30 || b.x < -30 || b.x > w + 30) {
      b.el.remove();
      blaster.bolts.splice(i, 1);
      continue;
    }
    b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;

    // Crates first — a rescue beats points.
    const di = blaster.drops.findIndex(
      (d) => Math.abs(d.x - b.x) < 26 && Math.abs(d.y - b.y) < 26);
    if (di !== -1) {
      activatePower(blaster.drops[di].def, b.x, b.y);
      blaster.drops[di].el.remove();
      blaster.drops.splice(di, 1);
      b.el.remove();
      blaster.bolts.splice(i, 1);
      continue;
    }

    const hit = storm.particles.find((p) => {
      if (p.popping) return false;
      const r = p.size / 2;
      return Math.abs(p.x + r - b.x) < r + 8 && Math.abs(p.y + r - b.y) < r + 10;
    });
    if (hit) {
      catchParticle(hit, b.x, b.y);
      b.el.remove();
      blaster.bolts.splice(i, 1);
    }
  }

  // Nuggets that reach the skyline do damage (or fizzle on the shield).
  const shieldOn = blaster.power && blaster.power.def.key === 'shield';
  const shieldY = h - SHIELD_HEIGHT;
  for (const p of storm.particles) {
    if (p.popping) continue;
    const px = p.x + p.size / 2;
    const py = p.y + p.size;
    if (shieldOn && py >= shieldY) {
      p.popping = true;
      p.popT = 0;
      spawnPopLabel(px, shieldY, '🛡️');
      continue;
    }
    if (blaster.rebuildT > 0) continue; // nothing left to hit while rebuilding
    const bldg = blaster.city.find(
      (c) => c.hp > 0 && px >= c.x && px <= c.x + c.w && py >= h - c.h);
    if (bldg) {
      p.popping = true;
      p.popT = 0;
      damageBuilding(bldg, px, py);
    }
  }
}

window.addEventListener('mousemove', (e) => {
  if (!blasterActive()) return;
  blaster.x = clampCannonX(e.clientX);
  positionCannon();
});

window.addEventListener('mousedown', (e) => {
  if (!blasterActive()) return;
  if (e.target.closest('.storm-hud')) return; // HUD buttons shouldn't fire the laser
  blaster.firing = true;
  if (blaster.cooldown <= 0) fireBolt();
});

window.addEventListener('mouseup', () => {
  blaster.firing = false;
});

window.addEventListener('keydown', (e) => {
  if (!blasterActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return; // don't hijack typing
  if (e.code === 'ArrowLeft')       { blaster.keys.left = true;  e.preventDefault(); }
  else if (e.code === 'ArrowRight') { blaster.keys.right = true; e.preventDefault(); }
  else if (e.code === 'Space') {
    blaster.firing = true;
    if (blaster.cooldown <= 0) fireBolt();
    e.preventDefault(); // keep the page from scrolling
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft')       blaster.keys.left = false;
  else if (e.code === 'ArrowRight') blaster.keys.right = false;
  else if (e.code === 'Space')      blaster.firing = false;
});
