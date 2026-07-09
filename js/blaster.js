// ---- Blaster mode ------------------------------------------------------------
// Old-school shooting-gallery minigame layered on top of the storm: switch the
// HUD to 🔫 and the nuggets rain from the sky while you slide a laser cannon
// along the bottom (mouse or ← → keys) and blast them (click or space) for the
// same tally as catching. Golden nugs are still worth 10x.

const cannonEl = document.getElementById('blasterCannon');

const BOLT_SPEED = 950;     // px/sec upward
const FIRE_COOLDOWN = 0.16; // seconds between shots while the trigger is held
const CANNON_SPEED = 650;   // px/sec with arrow keys
const CANNON_MARGIN = 30;   // keep the cannon fully on screen

const blaster = {
  x: window.innerWidth / 2,
  bolts: [],                // { el, x, y }
  keys: { left: false, right: false },
  firing: false,
  cooldown: 0,
};

function blasterActive() {
  return storm.mode === 'blaster' && storm.running;
}

// Reconcile blaster visuals with the current storm + mode state.
function syncBlaster() {
  const active = blasterActive();
  document.body.classList.toggle('blaster-mode', active);
  cannonEl.classList.toggle('active', active);
  if (active) {
    blaster.x = clampCannonX(blaster.x);
    positionCannon();
  } else {
    blaster.firing = false;
    clearBolts();
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

function fireBolt() {
  const el = document.createElement('div');
  el.className = 'blaster-bolt';
  const y = cannonEl.getBoundingClientRect().top - 12;
  el.style.transform = `translate(${blaster.x}px, ${y}px)`;
  document.body.appendChild(el);
  blaster.bolts.push({ el, x: blaster.x, y });
  blaster.cooldown = FIRE_COOLDOWN;
}

// Called from the storm's rAF loop each frame while blaster mode is active.
function stepBlaster(dt, w, h) {
  const dir = (blaster.keys.right ? 1 : 0) - (blaster.keys.left ? 1 : 0);
  if (dir) {
    blaster.x = clampCannonX(blaster.x + dir * CANNON_SPEED * dt);
    positionCannon();
  }

  blaster.cooldown -= dt;
  if (blaster.firing && blaster.cooldown <= 0) fireBolt();

  for (let i = blaster.bolts.length - 1; i >= 0; i--) {
    const b = blaster.bolts[i];
    b.y -= BOLT_SPEED * dt;
    if (b.y < -30) {
      b.el.remove();
      blaster.bolts.splice(i, 1);
      continue;
    }
    b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;

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
