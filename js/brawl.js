// ---- Sauce Brawl ---------------------------------------------------------------
// A pixel-art belt-scroller in the Double Dragon mold. You're a nugget with
// boxing gloves working the closing shift: walk RIGHT through the kitchen, the
// walk-in freezer, and the loading dock, brawling through ambushes of angry
// sauce cups until Wasabi the Unmild at the Sauce Vault. The screen locks when
// you're jumped and a GO → arrow sends you onward when it's clear. Clear the
// shift and a harder one starts — the score never resets.
//
// ↑↓ move in depth (the belt), ←→ walk, X/click = 3-hit punch chain,
// space = dodge with i-frames. Hits only connect at matching depth, like the
// classics. All art is generated on a tiny canvas (~340×200) scaled up with
// image-rendering: pixelated; animation quantized to ~10fps.
//
// Scoring mirrors the other games: KOs pay perFlyer-scaled points into
// storm.caught (golden cups 10x), plus ambush-clear and shift bonuses.

const brawlWorld = document.getElementById('brawlWorld');

const BRAWL_HEARTS = 3;
const DEPTH_MAX = 30;            // belt depth in world px (0 = back, 30 = front)
const DEPTH_HIT = 7;             // |depth difference| for punches/lunges to connect
const LEVEL_LEN = 2160;          // world px, three sections of 720
const SECTION_LEN = 720;
const PUNCH_CHAIN = [
  { name: 'jab', dmg: 1, reach: 15, kb: 26, dur: 0.22, active0: 0.05, active1: 0.13 },
  { name: 'jab', dmg: 1, reach: 15, kb: 26, dur: 0.22, active0: 0.05, active1: 0.13 },
  { name: 'upper', dmg: 2, reach: 17, kb: 58, dur: 0.34, active0: 0.08, active1: 0.18 },
];
const CHAIN_WINDOW = 0.5;
const DODGE_DUR = 0.28, DODGE_DIST = 34, DODGE_CD = 0.55;

// The shift is four STAGES with a Mario-style route map between them.
const STAGES = [
  { name: 'THE KITCHEN', x0: 0, icon: 'pot' },
  { name: 'THE FREEZER', x0: 720, icon: 'flake' },
  { name: 'THE LOADING DOCK', x0: 1440, icon: 'truck' },
  { name: 'THE SAUCE VAULT', x0: 1960, icon: 'vault' },
];
const MAP_SECS = 2.7; // route-map interlude length (any button skips)

// Ambush points along the shift. Enemy counts scale with the shift number.
const AMBUSHES = [
  { x: 300, kinds: ['ketchup', 'ketchup'] },
  { x: 600, kinds: ['ketchup', 'mustard', 'ketchup'] },
  { x: 1000, kinds: ['mustard', 'bbq', 'ketchup'] },
  { x: 1300, kinds: ['bbq', 'mustard', 'buffalo'] },
  { x: 1620, kinds: ['buffalo', 'ketchup', 'mustard'] },
  { x: 1860, kinds: ['mustard', 'bbq', 'buffalo'] },
  { x: 2030, kinds: ['boss', 'ketchup', 'mustard'] },
];

const CUPS = {
  ketchup: { hp: 2, speed: 15, value: 2, range: 13, body: '#d32f2f', dark: '#8e1c1c', lite: '#ff6659' },
  mustard: { hp: 2, speed: 24, value: 2, range: 12, body: '#e6b800', dark: '#9c7c00', lite: '#ffe23a' },
  bbq:     { hp: 4, speed: 10, value: 4, range: 15, body: '#6d3a1e', dark: '#42200e', lite: '#a05c34' },
  buffalo: { hp: 2, speed: 16, value: 3, range: 64, ranged: true, body: '#e8622c', dark: '#9c3a12', lite: '#ff9a66' },
};
const GOLD = { body: '#ffd23a', dark: '#b8860b', lite: '#fff3b0' };

const brawl = {
  on: false,
  cv: null, g: null, scale: 3, W: 340, Hh: 200, ground: 120,
  bg: null,                   // the whole level, pre-rendered as one wide strip
  banner: null,
  t: 0,
  shift: 1,                   // which lap of the level (difficulty)
  phase: 'map',               // 'map' (route interlude) | 'play'
  stage: 0,                   // current stage index into STAGES
  mapT: 0,
  cam: 0,
  locked: false,              // screen locked during an ambush
  ambushIdx: 0,               // next ambush to trigger
  goT: 0,                     // GO → arrow timer
  wanderAt: 0,                // world x that spawns the next stray grunt
  enemies: [], blobs: [], fx: [], splats: [],
  hitstop: 0, shake: 0, crowdHype: 0,
  keys: {},
  touch: null,
  p: null,
};

function brawlActive() {
  return storm.mode === 'brawl' && storm.running;
}

function brawlTally() {
  const p = brawl.p;
  const hearts = '❤️'.repeat(Math.max(p ? p.hearts : 0, 0)) +
    '🖤'.repeat(Math.max(BRAWL_HEARTS - (p ? p.hearts : 0), 0));
  const boss = brawl.enemies.find((e) => e.boss && !e.dead);
  return `Shift ${brawl.shift} · Stage ${brawl.stage + 1}/${STAGES.length} · ${hearts}` +
    (boss ? ` · 🌶️ ${'▮'.repeat(Math.ceil(boss.hp / 3))}` : '');
}

// ---- setup -----------------------------------------------------------------------

function brawlLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  brawl.scale = Math.max(2, Math.floor(vh / 200)); // chunky: world is ~200px tall
  brawl.W = Math.ceil(vw / brawl.scale);
  brawl.Hh = Math.ceil(vh / brawl.scale);
  brawl.ground = Math.round(brawl.Hh * 0.62); // wall/floor line — the belt lives below
  brawl.cv.width = brawl.W;
  brawl.cv.height = brawl.Hh;
  brawl.g.imageSmoothingEnabled = false;
  brawl.bg = brawlLevelStrip(brawl.Hh, brawl.ground);
}

function syncBrawl() {
  const active = brawlActive();
  if (active === brawl.on) return;
  brawl.on = active;
  document.body.classList.toggle('brawl-mode', active);
  if (active) {
    if (!brawl.cv) {
      brawl.cv = document.createElement('canvas');
      brawl.g = brawl.cv.getContext('2d');
      brawlWorld.appendChild(brawl.cv);
      brawl.banner = document.createElement('div');
      brawl.banner.className = 'brawl-banner';
      brawlWorld.appendChild(brawl.banner);
    }
    brawl.t = 0;
    brawl.shift = 1;
    brawl.p = {
      x: 40, d: 14, face: 1, st: 'idle', stT: 0,
      chain: 0, chainT: 0, hearts: BRAWL_HEARTS, iT: 0,
      dodgeCd: 0, walk: 0, punch: null, ko: false, koT: 0,
    };
    startShift(1);
    brawlLayout();
  } else {
    brawl.banner && brawl.banner.classList.remove('show');
  }
}

function startShift(n) {
  brawl.shift = n;
  brawl.cam = 0;
  brawl.locked = false;
  brawl.ambushIdx = 0;
  brawl.goT = 0;
  brawl.wanderAt = 150;
  brawl.enemies = [];
  brawl.blobs = [];
  brawl.fx = [];
  brawl.splats = [];
  brawl.hitstop = 0;
  brawl.shake = 0;
  const p = brawl.p;
  p.x = 40; p.d = 14; p.face = 1; p.st = 'idle'; p.iT = 1;
  enterMap(0);
}

// The route map: the nugget walks the dotted path to the next stage node.
function enterMap(stageIdx) {
  brawl.phase = 'map';
  brawl.stage = stageIdx;
  brawl.mapT = 0;
  brawlBanner(
    (brawl.shift > 1 && stageIdx === 0 ? `🥊 SHIFT ${brawl.shift} — OVERTIME · ` : '') +
    'STAGE ' + (stageIdx + 1) + ' — ' + STAGES[stageIdx].name,
    stageIdx === STAGES.length - 1 ? 'boss' : '', MAP_SECS
  );
}

function beginStage() {
  brawl.phase = 'play';
  const p = brawl.p;
  p.x = Math.max(40, STAGES[brawl.stage].x0 + 24);
  p.d = 14;
  p.face = 1;
  p.iT = Math.max(p.iT, 0.8);
  brawl.cam = Math.max(0, Math.min(LEVEL_LEN - brawl.W, p.x - brawl.W * 0.42));
  brawl.goT = 2.2;
}

function brawlBanner(text, cls, secs) {
  brawl.banner.textContent = text;
  brawl.banner.className = 'brawl-banner show' + (cls ? ' ' + cls : '');
  void brawl.banner.offsetWidth;
  clearTimeout(brawl.bannerT);
  brawl.bannerT = setTimeout(() => brawl.on && brawl.banner.classList.remove('show'), (secs || 1.4) * 1000);
}

// ---- enemies ---------------------------------------------------------------------

function spawnCup(kind, side, atX) {
  const shiftUp = brawl.shift - 1;
  if (kind === 'boss') {
    brawl.enemies.push({
      boss: true, kind: 'boss',
      x: atX + side * (brawl.W * 0.5 + 20), d: 14,
      hp: 16 + shiftUp * 6, maxHp: 16 + shiftUp * 6, speed: 9 + shiftUp,
      st: 'walk', stT: 0, face: -side, dead: false, golden: false,
      minionsAt: 0.5,
    });
    return;
  }
  const c = CUPS[kind];
  const golden = Math.random() < 0.05;
  brawl.enemies.push({
    kind,
    x: atX + side * (brawl.W * 0.5 + 12 + Math.random() * 26),
    d: 3 + Math.random() * (DEPTH_MAX - 6),
    hp: c.hp + Math.floor(shiftUp / 2),
    speed: c.speed * (0.85 + Math.random() * 0.3) * (1 + shiftUp * 0.12) * (golden ? 1.5 : 1),
    st: 'walk', stT: 0, face: -side, dead: false, golden,
    waddle: Math.random() * 7,
  });
}

function triggerAmbush(amb) {
  brawl.locked = true;
  const center = brawl.cam + brawl.W / 2;
  let side = 1;
  let extra = Math.floor((brawl.shift - 1) / 1); // one more cup per shift
  const kinds = amb.kinds.slice();
  while (extra-- > 0) kinds.push(kinds[extra % kinds.length] === 'boss' ? 'ketchup' : kinds[extra % kinds.length]);
  for (const kind of kinds) {
    spawnCup(kind, side, center);
    side = -side;
  }
  if (kinds.includes('boss')) brawlBanner('🌶️ WASABI THE UNMILD 🌶️', 'boss', 2);
  else brawlBanner('AMBUSH!', 'fight', 0.9);
}

// ---- combat ----------------------------------------------------------------------

function brawlPunch() {
  const p = brawl.p;
  if (!brawlActive() || p.ko) return;
  if (brawl.phase === 'map') { brawl.mapT = MAP_SECS; return; } // skip the interlude
  if (p.st === 'jab' || p.st === 'upper' || p.st === 'hurt' || p.st === 'dodge') return;
  const idx = (brawl.t - p.chainT < CHAIN_WINDOW) ? Math.min(p.chain, PUNCH_CHAIN.length - 1) : 0;
  const move = PUNCH_CHAIN[idx];
  p.punch = { ...move, idx, hit: new Set() };
  p.st = move.name;
  p.stT = 0;
  p.chain = idx + 1 >= PUNCH_CHAIN.length ? 0 : idx + 1;
}

function brawlDodge() {
  const p = brawl.p;
  if (!brawlActive() || p.ko) return;
  if (brawl.phase === 'map') { brawl.mapT = MAP_SECS; return; }
  if (p.dodgeCd > 0 || p.st === 'hurt' || p.st === 'dodge') return;
  p.st = 'dodge';
  p.stT = 0;
  p.dodgeCd = DODGE_CD;
  p.iT = Math.max(p.iT, DODGE_DUR + 0.06);
  brawlFx(p.x - p.face * 8, p.d, 3, 'dust');
}

function koCup(e, byChainIdx) {
  e.dead = true;
  e.st = 'ko';
  e.stT = 0;
  brawl.crowdHype = 1;
  const base = e.boss ? 30 : CUPS[e.kind].value;
  const comboMult = 1 + 0.25 * (byChainIdx || 0);
  let worth = Math.max(1, Math.round(storm.perFlyer * base * comboMult * (1 + (brawl.shift - 1) * 0.5)));
  if (e.golden) worth *= GOLDEN_MULTIPLIER;
  storm.caught += worth;
  const sc = brawl.scale;
  spawnPopLabel((e.x - brawl.cam) * sc, (brawl.ground + e.d - 24) * sc,
    (e.golden ? '✨ ' : '') + (e.boss ? 'BOSS DOWN! +' : '+') + fmt.format(worth),
    e.golden || e.boss ? 'golden' : '');
  brawl.splats.push({ x: e.x, d: e.d, r: 2, max: e.boss ? 16 : 9, color: e.golden ? GOLD.body : (e.boss ? '#39c96a' : CUPS[e.kind].body), t: 0 });
  updateStormHud();
  if (e.boss) {
    brawl.shake = 0.5;
    sfxBrawlBossDown();
  }
}

function hurtPlayer(fromX) {
  const p = brawl.p;
  if (p.iT > 0 || p.ko) return;
  p.hearts--;
  p.iT = 1.1;
  p.st = 'hurt';
  p.stT = 0;
  p.kb = (p.x < fromX ? -1 : 1) * 46;
  brawl.shake = 0.3;
  brawlFx(p.x, p.d, 12, 'spark');
  updateStormHud();
  if (p.hearts <= 0) {
    p.ko = true;
    p.koT = 0;
    brawlBanner('🥴 SAUCED!', 'boss', 1.5);
    for (const e of brawl.enemies)
      if (!e.dead) { e.st = 'hurt'; e.stT = 0; e.kb = (e.x < p.x ? -1 : 1) * 60; }
  }
}

function brawlFx(x, d, h, kind) {
  brawl.fx.push({ x, d, h, kind, t: 0 });
}

// ---- per-frame -------------------------------------------------------------------

function stepBrawl(dt, w, h) {
  if (!brawl.on) return;
  if (brawl.cv.width !== Math.ceil(w / brawl.scale)) brawlLayout();
  brawl.t += dt;
  const p = brawl.p;

  // route-map interlude between stages
  if (brawl.phase === 'map') {
    brawl.mapT += dt;
    drawMap();
    if (brawl.mapT >= MAP_SECS) beginStage();
    return;
  }

  if (brawl.hitstop > 0) { brawl.hitstop -= dt; drawBrawl(); return; }
  brawl.shake = Math.max(0, brawl.shake - dt);
  brawl.crowdHype = Math.max(0, brawl.crowdHype - dt * 0.8);
  brawl.goT = Math.max(0, brawl.goT - dt);
  p.iT = Math.max(0, p.iT - dt);
  p.dodgeCd = Math.max(0, p.dodgeCd - dt);

  // getting back up after a saucing: half hearts, brief mercy window
  if (p.ko) {
    p.koT += dt;
    if (p.koT > 1.5) {
      p.ko = false;
      p.hearts = Math.ceil(BRAWL_HEARTS / 2);
      p.iT = 1.5;
      updateStormHud();
    }
  }

  // crossing into the next stage's turf → back to the route map
  const nextStage = STAGES[brawl.stage + 1];
  if (nextStage && !brawl.locked && p.x >= nextStage.x0) {
    enterMap(brawl.stage + 1);
    drawMap();
    return;
  }

  // ambush triggers: the screen locks until the wave is down
  const nextAmb = AMBUSHES[brawl.ambushIdx];
  if (!brawl.locked && nextAmb && p.x > nextAmb.x) {
    triggerAmbush(nextAmb);
    brawl.ambushIdx++;
  }
  if (brawl.locked && !brawl.enemies.some((e) => !e.dead)) {
    brawl.locked = false;
    const wasBossWave = brawl.ambushIdx >= AMBUSHES.length;
    if (wasBossWave) {
      const bonus = Math.max(1, Math.round(storm.perFlyer * 60 * brawl.shift));
      storm.caught += bonus;
      spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.35, 'SHIFT CLEAR +' + fmt.format(bonus), 'golden');
      brawlBanner('🏆 SHIFT ' + brawl.shift + ' CLEAR!', '', 2.2);
      updateStormHud();
      setTimeout(() => { if (brawl.on) startShift(brawl.shift + 1); }, 2400);
    } else {
      const bonus = Math.max(1, Math.round(storm.perFlyer * 5 * brawl.shift));
      storm.caught += bonus;
      spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.35, 'CLEAR +' + fmt.format(bonus), '');
      brawl.goT = 3.5;
      sfxBrawlGo();
      updateStormHud();
    }
  }

  // stray grunts wander in between ambushes so the walk stays lively
  if (!brawl.locked && p.x > brawl.wanderAt && brawl.ambushIdx < AMBUSHES.length) {
    brawl.wanderAt = p.x + 170 + Math.random() * 120;
    if (Math.random() < 0.45) spawnCup(pickBrawlCup(), 1, brawl.cam + brawl.W / 2);
  }

  // ---- player
  p.stT += dt;
  const st = p.st;
  if (st === 'jab' || st === 'upper') {
    const m = p.punch;
    if (p.stT >= m.active0 && p.stT <= m.active1) {
      const hx = p.x + p.face * (6 + m.reach * Math.min(1, (p.stT - m.active0) / 0.05));
      for (const e of brawl.enemies) {
        if (e.dead || m.hit.has(e)) continue;
        if (Math.abs(e.d - p.d) > DEPTH_HIT + (e.boss ? 3 : 0)) continue; // must share the belt lane
        const er = e.boss ? 11 : 7;
        if (Math.abs(e.x - hx) < er + 4) {
          m.hit.add(e);
          e.hp -= m.dmg;
          brawl.hitstop = 0.05;
          brawlFx((e.x + hx) / 2, e.d, m.name === 'upper' ? 16 : 11, 'spark');
          sfxBrawlHit(m.name === 'upper');
          if (e.hp <= 0) koCup(e, m.idx);
          else {
            e.st = 'hurt';
            e.stT = 0;
            e.kb = (e.x < p.x ? -1 : 1) * m.kb * (e.boss ? 0.25 : 1); // away from the player
            if (m.name === 'upper' && !e.boss) e.launch = 1;
          }
        }
      }
    }
    if (p.stT >= m.dur) { p.st = 'idle'; p.chainT = brawl.t; p.punch = null; }
  } else if (st === 'dodge') {
    p.x += p.face * (DODGE_DIST / DODGE_DUR) * dt;
    if (p.stT >= DODGE_DUR) p.st = 'idle';
  } else if (st === 'hurt') {
    p.x += (p.kb || 0) * dt * (1 - Math.min(p.stT / 0.3, 1));
    if (p.stT >= 0.3) p.st = 'idle';
  } else if (!p.ko) {
    let mx = 0, md = 0;
    if (brawl.keys.l) mx -= 1;
    if (brawl.keys.r) mx += 1;
    if (brawl.keys.u) md -= 1;
    if (brawl.keys.dn) md += 1;
    if (brawl.touch && brawl.touch.move) { mx = brawl.touch.dx; md = brawl.touch.dd; }
    if (mx || md) {
      p.x += mx * 62 * dt;
      p.d += md * 44 * dt;
      if (mx) p.face = mx;
      p.walk += dt * 10;
      p.st = 'walk';
    } else if (st === 'walk') p.st = 'idle';
  }
  p.d = Math.max(0, Math.min(DEPTH_MAX, p.d));
  // world clamps: locked = fight inside this screen; free = the whole level
  if (brawl.locked) p.x = Math.max(brawl.cam + 10, Math.min(brawl.cam + brawl.W - 10, p.x));
  else p.x = Math.max(10, Math.min(LEVEL_LEN - 14, p.x));

  // camera follows unless the fight has it locked
  if (!brawl.locked) {
    const target = Math.max(0, Math.min(LEVEL_LEN - brawl.W, p.x - brawl.W * 0.42));
    brawl.cam += (target - brawl.cam) * Math.min(1, dt * 6);
  }

  // ---- enemies
  for (let i = brawl.enemies.length - 1; i >= 0; i--) {
    const e = brawl.enemies[i];
    e.stT += dt;
    const c = e.boss ? null : CUPS[e.kind];
    const dx = p.x - e.x, adx = Math.abs(dx);
    const dd = p.d - e.d, add = Math.abs(dd);

    if (e.dead) {
      if (e.stT > 0.6) brawl.enemies.splice(i, 1);
      continue;
    }
    if (e.st === 'hurt') {
      e.x += (e.kb || 0) * dt * (1 - Math.min(e.stT / 0.25, 1));
      if (e.stT >= 0.25) { e.st = 'walk'; e.launch = 0; }
      continue;
    }
    // golden cups flee with the loot
    if (e.golden && e.st === 'walk') {
      e.x -= Math.sign(dx) * e.speed * 1.1 * dt;
      e.face = -Math.sign(dx) || 1;
      if (e.x < brawl.cam - 20 || e.x > brawl.cam + brawl.W + 20) brawl.enemies.splice(i, 1);
      continue;
    }

    // belt AI: line up in depth first, then press in x
    const seekD = () => { if (add > 2) e.d += Math.sign(dd) * Math.min(e.boss ? 26 : 34, e.speed * 1.6) * dt; };

    if (e.boss) {
      if (e.minionsAt && e.hp <= e.maxHp * e.minionsAt) {
        e.minionsAt = 0;
        spawnCup(pickBrawlCup(), 1, brawl.cam + brawl.W / 2);
        spawnCup(pickBrawlCup(), -1, brawl.cam + brawl.W / 2);
      }
      if (e.st === 'walk') {
        e.face = Math.sign(dx) || 1;
        e.x += e.face * e.speed * dt;
        seekD();
        if (adx < 22 && add < DEPTH_HIT + 4) { e.st = 'windup'; e.stT = 0; }
      } else if (e.st === 'windup' && e.stT > 0.55) {
        e.st = 'slam';
        e.stT = 0;
        brawl.shake = 0.35;
        // shockwaves ripple both ways along the boss's lane — sidestep in depth!
        brawl.blobs.push({ x: e.x - 10, d: e.d, vx: -85, y: 0, wave: true, t: 0 });
        brawl.blobs.push({ x: e.x + 10, d: e.d, vx: 85, y: 0, wave: true, t: 0 });
        sfxBrawlSlam();
      } else if (e.st === 'slam' && e.stT > 0.6) {
        e.st = 'walk';
      }
      continue;
    }

    if (c.ranged) {
      if (e.st === 'walk') {
        e.face = Math.sign(dx) || 1;
        seekD();
        if (adx > c.range) e.x += e.face * e.speed * dt;
        else if (add < DEPTH_HIT + 4) { e.st = 'windup'; e.stT = 0; }
      } else if (e.st === 'windup' && e.stT > 0.4) {
        e.st = 'throw';
        e.stT = 0;
        const flight = Math.max(adx / 95, 0.5);
        brawl.blobs.push({
          x: e.x + e.face * 5, d: e.d, y: -12,
          vx: dx / flight, vy: -34 - flight * 42, g: 170, t: 0,
          color: c.body,
        });
      } else if (e.st === 'throw' && e.stT > 0.7) {
        e.st = 'walk';
        if (Math.random() < 0.4) e.x -= e.face * 8;
      }
    } else {
      if (e.st === 'walk') {
        e.face = Math.sign(dx) || 1;
        e.x += e.face * e.speed * dt;
        seekD();
        if (adx < c.range && add < DEPTH_HIT) { e.st = 'windup'; e.stT = 0; }
      } else if (e.st === 'windup' && e.stT > 0.35) {
        e.st = 'lunge';
        e.stT = 0;
      } else if (e.st === 'lunge') {
        e.x += e.face * 90 * dt;
        if (e.stT > 0.18) { e.st = 'recover'; e.stT = 0; }
        if (Math.abs(p.x - e.x) < 9 && Math.abs(p.d - e.d) < DEPTH_HIT) {
          hurtPlayer(e.x);
          e.st = 'recover';
          e.stT = 0;
        }
      } else if (e.st === 'recover' && e.stT > 0.5) {
        e.st = 'walk';
      }
    }
    // stragglers who never engaged despawn once far behind
    if (!brawl.locked && e.x < brawl.cam - 60) brawl.enemies.splice(i, 1);
  }

  // ---- projectiles + shockwaves (each lives at a depth lane)
  for (let i = brawl.blobs.length - 1; i >= 0; i--) {
    const b = brawl.blobs[i];
    b.t += dt;
    b.x += b.vx * dt;
    if (!b.wave) {
      b.vy += b.g * dt;
      b.y += b.vy * dt;
    }
    const gone = b.x < brawl.cam - 20 || b.x > brawl.cam + brawl.W + 20 ||
      (!b.wave && b.y > 2) || (b.wave && b.t > 1.4);
    if (!b.wave && b.y > 0 && b.vy > 0) {
      brawl.splats.push({ x: b.x, d: b.d, r: 1, max: 4, color: b.color, t: 0 });
    }
    if (Math.abs(b.x - p.x) < 6 && Math.abs(b.d - p.d) < DEPTH_HIT &&
      (b.wave ? true : Math.abs(b.y - -8) < 8)) {
      hurtPlayer(b.x);
      brawl.blobs.splice(i, 1);
      continue;
    }
    if (gone) brawl.blobs.splice(i, 1);
  }

  for (let i = brawl.fx.length - 1; i >= 0; i--) {
    brawl.fx[i].t += dt;
    if (brawl.fx[i].t > 0.25) brawl.fx.splice(i, 1);
  }
  for (let i = brawl.splats.length - 1; i >= 0; i--) {
    const s = brawl.splats[i];
    s.t += dt;
    if (s.t > 8) brawl.splats.splice(i, 1);
  }

  drawBrawl();
}

function pickBrawlCup() {
  const pool = Object.keys(CUPS);
  return pool[(Math.random() * pool.length) | 0];
}

// ---- pixel rendering ---------------------------------------------------------------

// The whole shift as one wide strip: kitchen → freezer → loading dock → vault.
function brawlLevelStrip(Hh, ground) {
  const c = document.createElement('canvas');
  c.width = LEVEL_LEN;
  c.height = Hh;
  const g = c.getContext('2d');

  const wallFor = (sec) => sec === 0 ? ['#17222f', '#121b27'] : sec === 1 ? ['#1c2b36', '#16232d'] : ['#231a16', '#1a1310'];
  for (let sec = 0; sec < 3; sec++) {
    const x0 = sec * SECTION_LEN, [wa, wb] = wallFor(sec);
    g.fillStyle = wa;
    g.fillRect(x0, 0, SECTION_LEN, ground);
    g.fillStyle = wb;
    if (sec === 2) {
      // loading dock: big bricks
      for (let y = 0; y < ground; y += 8)
        for (let x = x0 + ((y / 8) % 2 ? 8 : 0); x < x0 + SECTION_LEN; x += 16)
          g.fillRect(x, y, 15, 7);
    } else {
      for (let y = 0; y < ground; y += 10)
        for (let x = x0 + ((y / 10) % 2 ? 5 : 0); x < x0 + SECTION_LEN; x += 10)
          g.fillRect(x, y, 9, 9);
    }
    // top shadow
    const shade = g.createLinearGradient(0, 0, 0, ground);
    shade.addColorStop(0, 'rgba(0,0,4,0.72)');
    shade.addColorStop(0.6, 'rgba(0,0,4,0.15)');
    shade.addColorStop(1, 'rgba(0,0,4,0)');
    g.fillStyle = shade;
    g.fillRect(x0, 0, SECTION_LEN, ground);
  }

  // ---- section 1: the kitchen (bunting, fridge, stoves, windows, shelves)
  const bunY = Math.max(14, ground - 118);
  g.fillStyle = '#3a2c14';
  g.fillRect(0, bunY, SECTION_LEN, 1);
  const flagCols = ['#d32f2f', '#ffe23a', '#26e0ff', '#ff8a3d'];
  for (let x = 4; x < SECTION_LEN - 8; x += 14) {
    g.fillStyle = flagCols[(x / 14 | 0) % 4];
    g.beginPath();
    g.moveTo(x, bunY + 1); g.lineTo(x + 10, bunY + 1); g.lineTo(x + 5, bunY + 9);
    g.closePath(); g.fill();
  }
  const fridge = (fx) => {
    const fh = 84, fy = ground - 10 - fh;
    g.fillStyle = '#9aa6bc'; g.fillRect(fx, fy, 38, fh);
    g.fillStyle = '#7c88a0'; g.fillRect(fx, fy + 30, 38, 3);
    g.fillRect(fx + 32, fy + 8, 3, 16); g.fillRect(fx + 32, fy + 38, 3, 22);
    g.fillStyle = '#d32f2f'; g.fillRect(fx + 6, fy + 8, 4, 4);
    g.fillStyle = '#f4f0e6'; g.fillRect(fx + 6, fy + 42, 22, 28);
    g.fillStyle = '#d32f2f'; g.fillRect(fx + 9, fy + 46, 16, 4);
    g.fillStyle = '#1a0f08'; g.fillRect(fx + 9, fy + 54, 12, 2); g.fillRect(fx + 9, fy + 59, 16, 2);
  };
  const stove = (sx) => {
    const sy = ground - 10;
    g.fillStyle = '#3a4356'; g.fillRect(sx, sy - 34, 46, 34);
    g.fillStyle = '#20263a'; g.fillRect(sx + 4, sy - 30, 12, 8); g.fillRect(sx + 28, sy - 30, 12, 8);
    g.fillStyle = '#c9d4f0'; g.fillRect(sx + 8, sy - 44, 22, 9);
    g.fillStyle = '#d32f2f'; g.fillRect(sx + 10, sy - 46, 18, 3);
    g.fillStyle = 'rgba(200,210,235,0.35)';
    g.fillRect(sx + 12, sy - 54, 2, 6); g.fillRect(sx + 22, sy - 58, 2, 8);
  };
  const kWindow = (wx) => {
    const winW = 96, winH = 52, wy = ground - 22 - winH;
    g.fillStyle = '#0a0d1c'; g.fillRect(wx, wy, winW, winH);
    g.fillStyle = '#f4ecd4'; g.fillRect(wx + winW - 24, wy + 7, 8, 8);
    g.fillStyle = '#8a93b8';
    for (let i = 0; i < 14; i++) g.fillRect(wx + 5 + ((i * 37) % (winW - 10)), wy + 5 + ((i * 23) % (winH - 10)), 1, 1);
    g.fillStyle = '#131a30';
    for (let i = 0; i < 5; i++) g.fillRect(wx + 4 + i * 18, wy + winH - 10 - ((i * 13) % 14), 12, 24);
    g.fillStyle = '#2a3550';
    g.fillRect(wx - 4, wy - 4, winW + 8, 4); g.fillRect(wx - 4, wy + winH, winW + 8, 4);
    g.fillRect(wx + winW / 2 - 2, wy, 4, winH); g.fillRect(wx - 4, wy, 4, winH); g.fillRect(wx + winW, wy, 4, winH);
  };
  const jarShelf = (shx) => {
    g.fillStyle = '#2a1c10'; g.fillRect(shx, ground - 74, 72, 4);
    ['#d32f2f', '#e6b800', '#6d3a1e', '#e8622c', '#39c96a'].forEach((col, i) => {
      g.fillStyle = '#c9d4f0'; g.fillRect(shx + 4 + i * 13, ground - 88, 9, 14);
      g.fillStyle = col; g.fillRect(shx + 4 + i * 13, ground - 84, 9, 10);
      g.fillStyle = '#42200e'; g.fillRect(shx + 4 + i * 13, ground - 90, 9, 2);
    });
  };
  fridge(36); stove(140); kWindow(230); jarShelf(380); stove(480); kWindow(560); fridge(672);

  // ---- section 2: the walk-in freezer (frost, icicles, hanging nug-slabs)
  {
    const x0 = SECTION_LEN;
    // heavy freezer door at the entrance
    g.fillStyle = '#39465c'; g.fillRect(x0 + 8, ground - 100, 52, 90);
    g.fillStyle = '#232d40'; g.fillRect(x0 + 8, ground - 100, 52, 6);
    g.fillStyle = '#8a93b8'; g.fillRect(x0 + 48, ground - 62, 8, 14);
    g.fillStyle = '#c9d4f0'; g.fillRect(x0 + 14, ground - 92, 40, 3);
    // icicles along the top
    g.fillStyle = '#bfe4f4';
    for (let x = x0 + 4; x < x0 + SECTION_LEN; x += 22) {
      const len = 6 + ((x * 7) % 12);
      g.fillRect(x, 0, 4, len);
      g.fillRect(x + 1, len, 2, 4);
    }
    // frost patches on the wall
    g.fillStyle = 'rgba(190,228,244,0.14)';
    for (let i = 0; i < 26; i++) {
      const fx2 = x0 + 30 + ((i * 173) % (SECTION_LEN - 60));
      const fy2 = 20 + ((i * 97) % (ground - 60));
      g.fillRect(fx2, fy2, 14 + (i % 3) * 8, 8 + (i % 2) * 6);
    }
    // hanging frozen nugget slabs on a rail
    g.fillStyle = '#565f85';
    g.fillRect(x0 + 120, 26, SECTION_LEN - 240, 3);
    for (let i = 0; i < 7; i++) {
      const hx = x0 + 150 + i * 68;
      g.fillStyle = '#8a93b8'; g.fillRect(hx, 29, 2, 12);
      g.fillStyle = '#c8a76a';
      g.fillRect(hx - 8, 41, 18, 26);
      g.fillStyle = '#9db8c9';
      g.fillRect(hx - 8, 41, 18, 5);
      g.fillRect(hx - 8, 60, 4, 7);
    }
    // stacked ice boxes
    for (const [bx, n] of [[x0 + 90, 3], [x0 + 420, 2], [x0 + 600, 3]])
      for (let i = 0; i < n; i++) {
        g.fillStyle = i % 2 ? '#2e3d54' : '#39465c';
        g.fillRect(bx + (i % 2) * 4, ground - 10 - 22 * (i + 1), 44, 22);
        g.fillStyle = '#bfe4f4';
        g.fillRect(bx + (i % 2) * 4 + 4, ground - 10 - 22 * (i + 1) + 4, 12, 3);
      }
  }

  // ---- section 3: the loading dock (roll-up doors, crates, dumpster, vault)
  {
    const x0 = SECTION_LEN * 2;
    // roll-up doors with night sky visible through one open door
    const rollup = (rx, open) => {
      g.fillStyle = '#151011'; g.fillRect(rx, ground - 96, 84, 86);
      if (open) {
        g.fillStyle = '#0a0d1c'; g.fillRect(rx + 4, ground - 92, 76, 82);
        g.fillStyle = '#f4ecd4'; g.fillRect(rx + 58, ground - 84, 8, 8);
        g.fillStyle = '#8a93b8';
        for (let i = 0; i < 10; i++) g.fillRect(rx + 8 + ((i * 29) % 68), ground - 88 + ((i * 17) % 40), 1, 1);
        g.fillStyle = '#131a30';
        for (let i = 0; i < 4; i++) g.fillRect(rx + 8 + i * 18, ground - 44 - ((i * 13) % 18), 14, 34 + ((i * 13) % 18));
        g.fillStyle = '#39465c'; g.fillRect(rx + 4, ground - 96, 76, 8); // half-raised door
      } else {
        g.fillStyle = '#4a4038';
        for (let y = ground - 90; y < ground - 12; y += 8) g.fillRect(rx + 4, y, 76, 6);
      }
      g.fillStyle = '#6a5a48'; g.fillRect(rx - 3, ground - 100, 90, 6);
    };
    rollup(x0 + 40, false);
    rollup(x0 + 200, true);
    rollup(x0 + 360, false);
    // crates + dumpster
    const crate = (cx2, cy2, s) => {
      g.fillStyle = '#6d5426'; g.fillRect(cx2, cy2 - s, s, s);
      g.fillStyle = '#8a6c34';
      g.fillRect(cx2, cy2 - s, s, 3); g.fillRect(cx2, cy2 - 3, s, 3);
      g.fillRect(cx2, cy2 - s, 3, s); g.fillRect(cx2 + s - 3, cy2 - s, 3, s);
      g.fillStyle = '#42320e'; g.fillRect(cx2 + 5, cy2 - s + 6, s - 10, 2);
    };
    crate(x0 + 150, ground - 8, 30); crate(x0 + 158, ground - 38, 24);
    crate(x0 + 330, ground - 8, 34);
    // dumpster stays mid-dock so the vault arena reads clean during the boss
    g.fillStyle = '#2e5236'; g.fillRect(x0 + 128, ground - 48, 70, 40);
    g.fillStyle = '#1c3a24'; g.fillRect(x0 + 128, ground - 54, 74, 8);
    g.fillStyle = '#e8412c'; g.fillRect(x0 + 136, ground - 40, 22, 6);
    // THE SAUCE VAULT: golden-lit door at the very end (the boss arena)
    const vx = LEVEL_LEN - 96;
    g.fillStyle = '#3a3428'; g.fillRect(vx, ground - 108, 86, 98);
    g.fillStyle = '#8a7a4a'; g.fillRect(vx + 8, ground - 100, 70, 84);
    g.fillStyle = '#5c5232'; g.fillRect(vx + 14, ground - 94, 58, 72);
    g.fillStyle = '#ffd23a';
    g.fillRect(vx + 36, ground - 66, 14, 14); // wheel
    g.fillStyle = '#5c5232'; g.fillRect(vx + 40, ground - 62, 6, 6);
    g.fillStyle = '#ffe9a0';
    g.fillRect(vx + 20, ground - 88, 46, 3);
    const glow = g.createRadialGradient(vx + 43, ground - 60, 4, vx + 43, ground - 60, 70);
    glow.addColorStop(0, 'rgba(255,210,58,0.28)');
    glow.addColorStop(1, 'rgba(255,210,58,0)');
    g.fillStyle = glow;
    g.fillRect(vx - 40, ground - 130, 170, 130);
  }

  // backsplash lip + checker floor across the whole shift
  g.fillStyle = '#233242';
  g.fillRect(0, ground - 8, LEVEL_LEN, 8);
  g.fillStyle = '#e8412c';
  g.fillRect(0, ground - 8, LEVEL_LEN, 1);
  for (let y = ground; y < Hh; y += 6) {
    const row = (y - ground) / 6;
    for (let x = (row % 2) * 6 - 6; x < LEVEL_LEN + 6; x += 12) {
      g.fillStyle = '#1b2434'; g.fillRect(x, y, 6, 6);
      g.fillStyle = '#242f44'; g.fillRect(x + 6, y, 6, 6);
    }
  }
  return c;
}

// ---- the route map (between stages, Super Mario Bros. style) ----------------------

function drawMapIcon(g, icon, x, y) {
  if (icon === 'pot') {
    px(g, x - 7, y - 4, 14, 8, '#c9d4f0');
    px(g, x - 8, y - 5, 16, 2, '#8a93b8');
    px(g, x - 5, y - 7, 10, 3, '#d32f2f');
    px(g, x - 9, y - 2, 2, 3, '#8a93b8');
    px(g, x + 7, y - 2, 2, 3, '#8a93b8');
  } else if (icon === 'flake') {
    px(g, x - 1, y - 8, 2, 16, '#bfe4f4');
    px(g, x - 8, y - 1, 16, 2, '#bfe4f4');
    px(g, x - 5, y - 5, 2, 2, '#bfe4f4');
    px(g, x + 3, y - 5, 2, 2, '#bfe4f4');
    px(g, x - 5, y + 3, 2, 2, '#bfe4f4');
    px(g, x + 3, y + 3, 2, 2, '#bfe4f4');
  } else if (icon === 'truck') {
    px(g, x - 8, y - 5, 11, 8, '#8a93b8');
    px(g, x + 3, y - 2, 6, 5, '#4a5170');
    px(g, x + 4, y - 1, 3, 2, '#0a0d1c');
    px(g, x - 5, y + 3, 3, 3, '#1a0f08');
    px(g, x + 3, y + 3, 3, 3, '#1a0f08');
  } else { // vault
    px(g, x - 7, y - 7, 14, 14, '#8a7a4a');
    px(g, x - 5, y - 5, 10, 10, '#5c5232');
    px(g, x - 2, y - 2, 4, 4, '#ffd23a');
  }
}

function drawMap() {
  const g = brawl.g, W = brawl.W, Hh = brawl.Hh;
  // blueprint-paper backdrop
  g.fillStyle = '#0a1120';
  g.fillRect(0, 0, W, Hh);
  g.fillStyle = 'rgba(80,110,170,0.09)';
  for (let x = 0; x < W; x += 12) g.fillRect(x, 0, 1, Hh);
  for (let y = 0; y < Hh; y += 12) g.fillRect(0, y, W, 1);
  // header
  g.fillStyle = '#ffe23a';
  g.font = '900 10px monospace';
  g.textAlign = 'center';
  g.fillText('NUGGETOWN · NIGHT SHIFT ' + brawl.shift, W / 2, 18);

  // gently wavy dotted route with a node per stage
  const nx = (i) => Math.round(W * (0.14 + (0.72 * i) / (STAGES.length - 1)));
  const ny = (i) => Math.round(Hh * (0.52 + (i % 2 ? -0.09 : 0.07)));
  g.fillStyle = '#39465c';
  for (let i = 0; i < STAGES.length - 1; i++) {
    const x0 = nx(i), y0 = ny(i), x1 = nx(i + 1), y1 = ny(i + 1);
    for (let t = 0.12; t < 1; t += 0.11)
      px(g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 3, 3, '#39465c');
  }
  for (let i = 0; i < STAGES.length; i++) {
    const x = nx(i), y = ny(i);
    const current = i === brawl.stage, done = i < brawl.stage;
    // node plate
    px(g, x - 12, y - 12, 24, 24, done ? '#16281c' : '#141b2c');
    g.strokeStyle = current && Math.floor(brawl.t * 3) % 2 ? '#ffe23a' : done ? '#39c96a' : '#39465c';
    g.lineWidth = 2;
    g.strokeRect(x - 12.5, y - 12.5, 25, 25);
    drawMapIcon(g, STAGES[i].icon, x, y);
    if (done) { // cleared: a little victory flag
      px(g, x + 8, y - 20, 1, 10, '#8a93b8');
      px(g, x + 9, y - 20, 7, 4, '#39c96a');
    }
  }
  // the nugget walks the dots to the current node
  const from = Math.max(brawl.stage - 1, 0);
  const t = brawl.stage === 0 ? 1 : Math.min(brawl.mapT / (MAP_SECS * 0.75), 1);
  const wx = nx(from) + (nx(brawl.stage) - nx(from)) * t;
  const wy = ny(from) + (ny(brawl.stage) - ny(from)) * t - 16;
  const hop = Math.abs(Math.sin(brawl.t * 9)) * 2;
  g.drawImage(nugBody(6, 4, '#e8a83e', '#8a5a1d'), Math.round(wx) - 8, Math.round(wy) - 6 - hop);
  px(g, wx - 5, wy - 4 - hop, 10, 2, '#d32f2f'); // headband
  px(g, wx - 3, wy + 9 - hop, 2, 2, '#8a5a1d');
  px(g, wx + 1, wy + 9 - hop, 2, 2, '#8a5a1d');
  // footer hint
  if (Math.floor(brawl.t * 2) % 2) {
    g.fillStyle = '#9be8ff';
    g.font = '700 8px monospace';
    g.fillText('PUNCH TO SKIP', W / 2, Hh - 10);
  }
}

// One lumpy pixel nugget body, deterministic per seed. Cached per (seed, r).
const nugBodyCache = {};
function nugBody(r, seed, base, dark) {
  const key = r + seed + base;
  if (nugBodyCache[key]) return nugBodyCache[key];
  const size = r * 2 + 3;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  for (let py = 0; py < size; py++)
    for (let px2 = 0; px2 < size; px2++) {
      const ang = Math.atan2(py - cy, px2 - cx);
      const wob = Math.sin(ang * 3 + seed) * 1.1 + Math.cos(ang * 5 + seed * 2) * 0.6;
      const d = Math.hypot((px2 - cx) / 1.12, (py - cy) / 0.95);
      if (d < r + wob) {
        const edge = d > r + wob - 1.6;
        const speck = ((px2 * 3 + py * 7 + seed) % 13) === 0;
        g.fillStyle = edge ? dark : speck ? dark : base;
        g.fillRect(px2, py, 1, 1);
      }
    }
  nugBodyCache[key] = c;
  return c;
}

function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

// Everything below draws in SCREEN space: worldX - cam, ground + depth.
function entY(d) { return brawl.ground + 4 + d; }

function drawPlayer(g) {
  const p = brawl.p;
  if (p.iT > 0 && !p.ko && Math.floor(brawl.t * 16) % 2) return;
  const step = Math.floor(p.walk) % 4;
  const bob = p.st === 'walk' ? (step % 2) : Math.floor(brawl.t * 2.5) % 2;
  const x = Math.round(p.x - brawl.cam), gy = entY(p.d);
  const y = gy - 10 - bob;
  const f = p.face;

  if (p.ko) {
    // face-down in the sauce, stars optional
    g.save();
    g.translate(x, gy - 4);
    g.rotate(f * 1.5);
    g.drawImage(nugBody(7, 4, '#e8a83e', '#8a5a1d'), -9, -8);
    g.restore();
    return;
  }
  if (p.st === 'dodge') {
    g.globalAlpha = 0.35;
    g.drawImage(nugBody(7, 4, '#e8a83e', '#8a5a1d'), x - 9 - f * 6, y - 8);
    g.globalAlpha = 1;
  }
  px(g, x - 4 + (p.st === 'walk' ? (step < 2 ? -1 : 1) : 0), gy - 2, 3, 2, '#8a5a1d');
  px(g, x + 2 + (p.st === 'walk' ? (step < 2 ? 1 : -1) : 0), gy - 2, 3, 2, '#8a5a1d');
  g.drawImage(nugBody(7, 4, '#e8a83e', '#8a5a1d'), x - 9, y - 8);
  px(g, x - 6, y - 6, 12, 2, '#d32f2f');
  px(g, x - 8 - (f < 0 ? -15 : 0), y - 5, 3, 1, '#d32f2f');
  px(g, x + f * 2, y - 3, 2, 2, '#fff');
  px(g, x + f * 5, y - 3, 2, 2, '#fff');
  px(g, x + f * 2 + (f > 0 ? 1 : 0), y - 2, 1, 1, '#1a0f08');
  px(g, x + f * 5 + (f > 0 ? 1 : 0), y - 2, 1, 1, '#1a0f08');
  px(g, x + f * 2 - 1, y - 5, 3, 1, '#42200e');
  px(g, x + f * 4, y - 5, 3, 1, '#42200e');

  const glove = (gx, gy2, big) => {
    px(g, gx - 1, gy2 - 1, big ? 4 : 3, big ? 4 : 3, '#d32f2f');
    px(g, gx - 1, gy2 + (big ? 3 : 2), big ? 4 : 3, 1, '#f4f0e6');
  };
  if (p.st === 'jab' || p.st === 'upper') {
    const m = p.punch;
    const ext = Math.sin(Math.min(p.stT / m.active1, 1) * Math.PI) * m.reach;
    if (p.st === 'upper') {
      glove(x + f * (4 + ext * 0.7), y - 2 - ext * 0.55, true);
      glove(x - f * 3, y + 1, false);
    } else {
      glove(x + f * (5 + ext), y - 1, true);
      glove(x - f * 2, y + 2, false);
    }
  } else if (p.st === 'hurt') {
    glove(x - f * 5, y + 2, false);
    glove(x - f * 2, y + 3, false);
  } else {
    glove(x + f * 5, y + (bob ? 0 : 1), false);
    glove(x + f * 2, y + 2 + (bob ? 1 : 0), false);
  }
}

function drawCup(g, e) {
  const pal = e.golden ? GOLD : CUPS[e.kind];
  const step = Math.floor(brawl.t * 8 + (e.waddle || 0)) % 2;
  const x = Math.round(e.x - brawl.cam), gy = entY(e.d);
  let y = gy - 12;
  if (e.launch) y -= 6;
  if (e.dead) {
    const t = Math.min(e.stT / 0.5, 1);
    g.save();
    g.translate(x, gy - 4);
    g.rotate(e.face * t * 1.5);
    g.globalAlpha = 1 - t * 0.8;
    px(g, -5, -8 + t * 6, 10, 8 - t * 5, '#f4f0e6');
    px(g, -5, -11 + t * 8, 10, 3, pal.body);
    g.restore();
    g.globalAlpha = 1;
    return;
  }
  const lean = e.st === 'windup' ? -e.face * 2 : e.st === 'lunge' || e.st === 'slam' ? e.face * 3 : 0;
  const flash = e.st === 'hurt' && Math.floor(e.stT * 30) % 2;
  px(g, x - 4 + (step ? -1 : 0), gy - 2, 3, 2, pal.dark);
  px(g, x + 1 + (step ? 1 : 0), gy - 2, 3, 2, pal.dark);
  px(g, x - 5 + lean, y, 10, 10, flash ? '#fff' : '#f4f0e6');
  px(g, x - 5 + lean, y + 3, 10, 2, flash ? '#fff' : pal.body);
  px(g, x - 6 + lean, y, 12, 1, flash ? '#fff' : '#c9cfe0');
  px(g, x - 4 + lean, y - 4, 8, 4, flash ? '#fff' : pal.body);
  px(g, x - 3 + lean, y - 5, 6, 1, flash ? '#fff' : pal.body);
  px(g, x - 3 + lean, y - 5, 2, 1, flash ? '#fff' : pal.lite);
  if (!flash) {
    px(g, x - 2 + lean + (e.face > 0 ? 1 : 0), y - 3, 1, 1, '#1a0f08');
    px(g, x + 1 + lean + (e.face > 0 ? 1 : 0), y - 3, 1, 1, '#1a0f08');
    px(g, x - 3 + lean, y - 4, 2, 1, '#1a0f08');
    px(g, x + 1 + lean, y - 4, 2, 1, '#1a0f08');
  }
  if (e.st === 'windup') px(g, x + e.face * 7, y - 6, 2, 2, '#ffe23a');
}

function drawBoss(g, e) {
  const x = Math.round(e.x - brawl.cam), gy = entY(e.d);
  const slamRise = e.st === 'windup' ? -Math.sin(Math.min(e.stT / 0.55, 1) * Math.PI) * 8 :
    e.st === 'slam' && e.stT < 0.15 ? 3 : 0;
  const y = gy - 30 + slamRise;
  const step = Math.floor(brawl.t * 6) % 2;
  const flash = e.st === 'hurt' && Math.floor(e.stT * 30) % 2;
  const body = flash ? '#fff' : '#2e9e53';
  const dark = flash ? '#fff' : '#1c6434';
  px(g, x - 5 + (step ? -1 : 0), gy - 3, 4, 3, dark);
  px(g, x + 2 + (step ? 1 : 0), gy - 3, 4, 3, dark);
  px(g, x - 8, y + 6, 16, 22, body);
  px(g, x - 8, y + 6, 3, 22, flash ? '#fff' : '#39c96a');
  px(g, x - 6, y + 12, 12, 9, flash ? '#fff' : '#f4f0e6');
  px(g, x - 4, y + 15, 8, 1, dark);
  px(g, x - 4, y + 18, 6, 1, dark);
  px(g, x - 5, y + 2, 10, 4, dark);
  px(g, x - 2, y - 3, 4, 5, flash ? '#fff' : '#ffe23a');
  if (!flash) {
    px(g, x - 4 + (e.face > 0 ? 1 : 0), y + 8, 2, 2, '#1a0f08');
    px(g, x + 2 + (e.face > 0 ? 1 : 0), y + 8, 2, 2, '#1a0f08');
    px(g, x - 5, y + 7, 3, 1, '#0a2814');
    px(g, x + 2, y + 7, 3, 1, '#0a2814');
  }
}

function drawBrawl() {
  const g = brawl.g, W = brawl.W, Hh = brawl.Hh;
  const shx = brawl.shake > 0 ? Math.round((Math.random() - 0.5) * 4 * brawl.shake * 3) : 0;
  const shy = brawl.shake > 0 ? Math.round((Math.random() - 0.5) * 3 * brawl.shake * 3) : 0;
  g.save();
  g.translate(shx, shy);
  g.drawImage(brawl.bg, -Math.round(brawl.cam), 0);

  // splats stain the belt where they landed
  for (const s of brawl.splats) {
    const r = Math.min(s.r + s.t * 18, s.max);
    const sx = s.x - brawl.cam, sy = entY(s.d);
    g.globalAlpha = Math.max(0.15, 0.6 - s.t * 0.1);
    px(g, sx - r, sy - 1, r * 2, 2, s.color);
    px(g, sx - r * 0.6, sy - 2, r * 1.2, 1, s.color);
    g.globalAlpha = 1;
  }

  // painter's order down the belt: farther (small d) first, player among them
  const drawables = brawl.enemies.map((e) => ({ d: e.d, f: () => (e.boss ? drawBoss : drawCup)(brawl.g, e) }));
  drawables.push({ d: brawl.p.d, f: () => drawPlayer(brawl.g) });
  drawables.sort((a, b) => a.d - b.d);
  for (const item of drawables) item.f();

  for (const b of brawl.blobs) {
    const bx = b.x - brawl.cam, by = entY(b.d);
    if (b.wave) {
      const hgt = 3 + Math.floor((Math.sin(b.t * 20) + 1) * 1.5);
      px(g, bx - 2, by - hgt, 4, hgt, '#39c96a');
      px(g, bx - 1, by - hgt - 1, 2, 1, '#a5f0c0');
    } else {
      px(g, bx - 1, by + b.y - 1, 3, 3, b.color);
      px(g, bx - b.vx * 0.02, by + b.y - b.vy * 0.02, 1, 1, b.color);
    }
  }

  for (const f of brawl.fx) {
    const t = f.t / 0.25;
    const fx2 = f.x - brawl.cam, fy2 = entY(f.d) - f.h;
    if (f.kind === 'spark') {
      g.fillStyle = t < 0.5 ? '#fff' : '#ffe23a';
      for (let i = 0; i < 4; i++) {
        const a = i * 1.57 + 0.4;
        px(g, fx2 + Math.cos(a) * t * 8, fy2 + Math.sin(a) * t * 8, 2, 2, g.fillStyle);
      }
    } else {
      g.globalAlpha = 1 - t;
      px(g, fx2 - 2, fy2, 5, 2, '#8a93b8');
      g.globalAlpha = 1;
    }
  }

  // GO → arrow: cleared the ambush, onward through the shift
  if (brawl.goT > 0 && Math.floor(brawl.t * 3) % 2) {
    const ax = W - 26, ay = brawl.ground - 26;
    g.fillStyle = '#ffe23a';
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      g.moveTo(ax + i * 10, ay - 8);
      g.lineTo(ax + 8 + i * 10, ay);
      g.lineTo(ax + i * 10, ay + 8);
      g.lineTo(ax + 3 + i * 10, ay);
      g.closePath();
      g.fill();
    }
  }

  // the crowd of nugget spectators (screen-space — they follow the fight)
  const hype = brawl.crowdHype;
  for (let i = 0; i < Math.ceil(W / 26); i++) {
    const cx = i * 26 + ((i * 7) % 9);
    const bounce = (Math.floor(brawl.t * (4 + hype * 6) + i) % 2) * (1 + Math.round(hype * 2));
    g.globalAlpha = 0.85;
    g.drawImage(nugBody(6, i % 7, '#3a2c14', '#241a0a'), cx, Hh - 12 - bounce);
    g.globalAlpha = 1;
  }
  g.restore();
}

// ---- input ------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (!brawlActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { brawl.keys.l = true; e.preventDefault(); }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { brawl.keys.r = true; e.preventDefault(); }
  if (e.code === 'ArrowUp' || e.code === 'KeyW') { brawl.keys.u = true; e.preventDefault(); }
  if (e.code === 'ArrowDown' || e.code === 'KeyS') { brawl.keys.dn = true; e.preventDefault(); }
  if (e.code === 'KeyX' || e.code === 'KeyZ') { brawlPunch(); e.preventDefault(); }
  if (e.code === 'Space') { brawlDodge(); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') brawl.keys.l = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') brawl.keys.r = false;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') brawl.keys.u = false;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') brawl.keys.dn = false;
});
window.addEventListener('mousedown', (e) => {
  if (!brawlActive()) return;
  if (e.target.closest('.storm-hud')) return;
  brawlPunch();
});

// Touch: tap punches; hold and drag and the nugget follows your finger across
// the belt (x AND depth); quick flick down-then-release still dodges.
window.addEventListener('touchstart', (e) => {
  if (!brawlActive()) return;
  if (e.target.closest('.storm-hud')) return;
  if (e.touches.length === 2) { brawlDodge(); brawl.touch = null; return; }
  const t = e.touches[0];
  brawl.touch = { x0: t.clientX, y0: t.clientY, t0: performance.now(), move: false, dx: 0, dd: 0 };
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!brawlActive() || !brawl.touch) return;
  const t = e.touches[0];
  if (performance.now() - brawl.touch.t0 > 140 ||
    Math.abs(t.clientX - brawl.touch.x0) > 24 || Math.abs(t.clientY - brawl.touch.y0) > 24) {
    brawl.touch.move = true;
    const sx = t.clientX / brawl.scale + brawl.cam;
    const sy = (t.clientY / brawl.scale) - brawl.ground - 4;
    brawl.touch.dx = Math.abs(sx - brawl.p.x) > 6 ? Math.sign(sx - brawl.p.x) : 0;
    brawl.touch.dd = Math.abs(sy - brawl.p.d) > 4 ? Math.sign(sy - brawl.p.d) : 0;
  }
}, { passive: true });
window.addEventListener('touchend', () => {
  if (!brawlActive() || !brawl.touch) return;
  if (!brawl.touch.move && performance.now() - brawl.touch.t0 < 220) brawlPunch();
  brawl.touch = null;
});

window.addEventListener('resize', () => { if (brawl.on) brawlLayout(); });

// ---- tiny synth stingers (self-contained so brawl works without the hall) ---------
function brawlTone(freq, t0, dur, gain, type) {
  try {
    if (!window.__brawlAC) window.__brawlAC = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = window.__brawlAC;
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(gain, ctx.currentTime + t0);
    gn.gain.exponentialRampToValueAtTime(0.0004, ctx.currentTime + t0 + dur);
    o.connect(gn).connect(ctx.destination);
    o.start(ctx.currentTime + t0);
    o.stop(ctx.currentTime + t0 + dur + 0.02);
  } catch (e) { /* no audio — fine */ }
}
function sfxBrawlHit(big) {
  brawlTone(big ? 220 : 330, 0, 0.07, 0.05, 'square');
  brawlTone(big ? 110 : 165, 0, 0.09, 0.05, 'sawtooth');
}
function sfxBrawlSlam() {
  brawlTone(62, 0, 0.25, 0.12, 'sine');
  brawlTone(49, 0.06, 0.3, 0.08, 'sine');
}
function sfxBrawlBossDown() {
  [523, 659, 784, 1047].forEach((f, i) => brawlTone(f, i * 0.09, 0.22, 0.06, 'square'));
}
function sfxBrawlGo() {
  brawlTone(659, 0, 0.1, 0.05, 'square');
  brawlTone(880, 0.11, 0.16, 0.05, 'square');
}
