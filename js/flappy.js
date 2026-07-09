// ---- Flappy Nug ----------------------------------------------------------------
// Flappy Bird, but everything is nuggets: switch the HUD to 🐤 and pilot a
// nugget through scrolling towers of stacked nuggets. Space, ↑, or click to
// flap. Each gate cleared banks one flyer's worth of nugs; rare golden gates
// pay 10x. Crashing just respawns you — this is a fry station, not a roguelike.
// While you're flying, the storm's launch counter pauses; the sky is yours.

const birdEl = document.getElementById('flappyBird');

const GRAVITY = 1900;          // px/s² downward
const FLAP_VY = -540;          // px/s upward kick per flap
const PIPE_SPEED = 230;        // px/s scroll speed
const PIPE_W = 58;             // tower width
const PIPE_GAP = 195;          // gap height
const PIPE_SPACING = 340;      // horizontal distance between towers
const PIPE_MARGIN = 90;        // keep gaps away from the very top/bottom
const BIRD_SIZE = 44;          // matches the CSS size
const RESPAWN_SECS = 1.0;
const GOLDEN_GATE_CHANCE = 0.08;

const flappy = {
  on: false,     // tracked so sync only resets on actual transitions
  y: 0,
  vy: 0,
  dead: false,
  respawnT: 0,
  pipes: [],     // { top, bottom, x, gapY, passed, golden }
};

function flappyActive() {
  return storm.mode === 'flappy' && storm.running;
}

// Reconcile flappy visuals with the current storm + mode state.
function syncFlappy() {
  const active = flappyActive();
  if (active === flappy.on) return;
  flappy.on = active;
  document.body.classList.toggle('flappy-mode', active);
  birdEl.classList.toggle('active', active);
  if (active) resetBird();
  else clearPipes();
}

function birdX() {
  return Math.round(window.innerWidth * 0.28);
}

function resetBird() {
  flappy.y = window.innerHeight * 0.4;
  flappy.vy = 0;
  flappy.dead = false;
  birdEl.style.opacity = '';
  drawBird();
}

function drawBird() {
  // Nose up on a flap, nose-dive as you fall.
  const tilt = Math.max(-25, Math.min(70, flappy.vy * 0.06));
  birdEl.style.transform = `translate(${birdX()}px, ${flappy.y}px) rotate(${tilt}deg)`;
}

function flap() {
  if (!flappyActive() || flappy.dead) return;
  flappy.vy = FLAP_VY;
}

function clearPipes() {
  flappy.pipes.forEach((p) => { p.top.remove(); p.bottom.remove(); });
  flappy.pipes = [];
}

function makePipeEl(golden, top, height) {
  const el = document.createElement('div');
  el.className = 'flappy-pipe' + (golden ? ' golden' : '');
  el.style.top = top + 'px';
  el.style.height = height + 'px';
  document.body.appendChild(el);
  return el;
}

function spawnPipe(w, h) {
  const gapY = PIPE_MARGIN + Math.random() * Math.max(h - PIPE_GAP - PIPE_MARGIN * 2, 1);
  const golden = Math.random() < GOLDEN_GATE_CHANCE;
  const x = w + PIPE_W;
  const top = makePipeEl(golden, 0, gapY);
  const bottom = makePipeEl(golden, gapY + PIPE_GAP, h - gapY - PIPE_GAP);
  top.style.transform = `translateX(${x}px)`;
  bottom.style.transform = `translateX(${x}px)`;
  flappy.pipes.push({ top, bottom, x, gapY, passed: false, golden });
}

function crashBird() {
  if (flappy.dead) return;
  flappy.dead = true;
  flappy.respawnT = RESPAWN_SECS;
  birdEl.style.opacity = '0.25';
  const boom = document.createElement('div');
  boom.className = 'catch-pop';
  boom.textContent = '💥';
  boom.style.left = (birdX() + BIRD_SIZE / 2) + 'px';
  boom.style.top = (flappy.y + BIRD_SIZE / 2) + 'px';
  document.body.appendChild(boom);
  boom.addEventListener('animationend', () => boom.remove());
  clearPipes();
}

// Called from the storm's rAF loop each frame while flappy mode is active.
function stepFlappy(dt, w, h) {
  if (flappy.dead) {
    flappy.respawnT -= dt;
    if (flappy.respawnT <= 0) resetBird();
    return;
  }

  flappy.vy += GRAVITY * dt;
  flappy.y += flappy.vy * dt;
  drawBird();

  const last = flappy.pipes[flappy.pipes.length - 1];
  if (!last || last.x < w - PIPE_SPACING) spawnPipe(w, h);

  const bx = birdX() + BIRD_SIZE / 2;
  const by = flappy.y + BIRD_SIZE / 2;
  const r = BIRD_SIZE * 0.38; // forgiving hitbox — the nugget is lumpy

  for (let i = flappy.pipes.length - 1; i >= 0; i--) {
    const p = flappy.pipes[i];
    p.x -= PIPE_SPEED * dt;
    p.top.style.transform = `translateX(${p.x}px)`;
    p.bottom.style.transform = `translateX(${p.x}px)`;

    if (p.x + PIPE_W < -20) {
      p.top.remove();
      p.bottom.remove();
      flappy.pipes.splice(i, 1);
      continue;
    }

    if (!p.passed && p.x + PIPE_W < bx - r) {
      p.passed = true;
      const worth = storm.perFlyer * (p.golden ? GOLDEN_MULTIPLIER : 1);
      storm.caught += worth;
      spawnCatchLabel(bx, p.gapY + PIPE_GAP / 2, worth, p.golden);
      updateStormHud();
    }

    if (bx + r > p.x && bx - r < p.x + PIPE_W) {
      if (by - r < p.gapY || by + r > p.gapY + PIPE_GAP) crashBird();
    }
  }

  if (flappy.y > h - BIRD_SIZE || flappy.y < -60) crashBird();
}

window.addEventListener('mousedown', (e) => {
  if (!flappyActive()) return;
  if (e.target.closest('.storm-hud')) return;
  flap();
});

window.addEventListener('keydown', (e) => {
  if (!flappyActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return; // don't hijack typing
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    flap();
    e.preventDefault(); // keep the page from scrolling
  }
});
