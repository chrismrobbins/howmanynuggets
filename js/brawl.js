// ---- Sauce Brawl ---------------------------------------------------------------
// A pixel-art kitchen beat-em-up. You are a nugget with boxing gloves; waves of
// angry sauce cups waddle in from both sides of the counter. Chain punches
// (jab → jab → uppercut), dodge through attacks, survive the Wasabi boss every
// fifth round. All art is generated on a tiny canvas (~480×270) and scaled up
// with image-rendering: pixelated — no sprite files, animation quantized to
// 10fps steps for the chunky arcade feel. Pauses the storm like Knight does.
//
// Scoring mirrors the other games: KOs pay perFlyer-scaled points into
// storm.caught (golden cups 10x), with round-clear and boss bonuses.

const brawlWorld = document.getElementById('brawlWorld');

const BRAWL_GROUND_FRAC = 0.82; // ground line as a fraction of internal height
const BRAWL_HEARTS = 3;
const PUNCH_CHAIN = [
  { name: 'jab', dmg: 1, reach: 15, kb: 26, dur: 0.22, active0: 0.05, active1: 0.13 },
  { name: 'jab', dmg: 1, reach: 15, kb: 26, dur: 0.22, active0: 0.05, active1: 0.13 },
  { name: 'upper', dmg: 2, reach: 17, kb: 58, dur: 0.34, active0: 0.08, active1: 0.18 },
];
const CHAIN_WINDOW = 0.5;   // seconds after a punch ends to continue the chain
const DODGE_DUR = 0.28, DODGE_DIST = 34, DODGE_CD = 0.55;

// Enemy kinds. value scales the KO payout; unlock is the first round they appear.
const CUPS = {
  ketchup: { hp: 2, speed: 15, value: 2, range: 13, unlock: 1, body: '#d32f2f', dark: '#8e1c1c', lite: '#ff6659' },
  mustard: { hp: 2, speed: 24, value: 2, range: 12, unlock: 2, body: '#e6b800', dark: '#9c7c00', lite: '#ffe23a' },
  bbq:     { hp: 4, speed: 10, value: 4, range: 15, unlock: 3, body: '#6d3a1e', dark: '#42200e', lite: '#a05c34' },
  buffalo: { hp: 2, speed: 16, value: 3, range: 64, unlock: 4, ranged: true, body: '#e8622c', dark: '#9c3a12', lite: '#ff9a66' },
};
const GOLD = { body: '#ffd23a', dark: '#b8860b', lite: '#fff3b0' };

const brawl = {
  on: false,
  cv: null, g: null, scale: 3, W: 480, Hh: 270, ground: 220,
  bg: null,                    // pre-rendered kitchen backdrop
  banner: null,
  t: 0,
  round: 0,
  phase: 'banner',             // banner | fight | clear | ko
  phaseT: 0,
  queue: [],                   // kinds waiting to waddle in this round
  spawnT: 0,
  enemies: [], blobs: [], fx: [], splats: [],
  hitstop: 0, shake: 0, crowdHype: 0,
  keys: {},
  touch: null,
  p: null,                     // the player
};

function brawlActive() {
  return storm.mode === 'brawl' && storm.running;
}

function brawlTally() {
  const hearts = '❤️'.repeat(Math.max(brawl.p ? brawl.p.hearts : 0, 0)) +
    '🖤'.repeat(Math.max(BRAWL_HEARTS - (brawl.p ? brawl.p.hearts : 0), 0));
  const boss = brawl.enemies.find((e) => e.boss && !e.dead);
  return `Round ${Math.max(brawl.round, 1)} · ${hearts}` +
    (boss ? ` · 🌶️ ${'▮'.repeat(Math.ceil(boss.hp / 2))}` : '');
}

// ---- setup -----------------------------------------------------------------------

function brawlLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  brawl.scale = Math.max(2, Math.floor(vh / 200)); // chunky: world is ~200px tall
  brawl.W = Math.ceil(vw / brawl.scale);
  brawl.Hh = Math.ceil(vh / brawl.scale);
  brawl.ground = Math.round(brawl.Hh * BRAWL_GROUND_FRAC);
  brawl.cv.width = brawl.W;
  brawl.cv.height = brawl.Hh;
  brawl.g.imageSmoothingEnabled = false;
  brawl.bg = brawlBackdrop(brawl.W, brawl.Hh, brawl.ground);
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
    brawlLayout();
    brawl.t = 0;
    brawl.round = 0;
    brawl.enemies = [];
    brawl.blobs = [];
    brawl.fx = [];
    brawl.splats = [];
    brawl.hitstop = 0;
    brawl.shake = 0;
    brawl.p = {
      x: brawl.W / 2, face: 1, st: 'idle', stT: 0,
      chain: 0, chainT: 0, hearts: BRAWL_HEARTS, iT: 0,
      dodgeCd: 0, walk: 0, punch: null,
    };
    nextBrawlRound();
  } else {
    brawl.banner && brawl.banner.classList.remove('show');
  }
}

function brawlBanner(text, cls) {
  brawl.banner.textContent = text;
  brawl.banner.className = 'brawl-banner show' + (cls ? ' ' + cls : '');
  void brawl.banner.offsetWidth;
}

function nextBrawlRound() {
  brawl.round++;
  brawl.phase = 'banner';
  brawl.phaseT = 0;
  const r = brawl.round;
  brawl.queue = [];
  if (r % 5 === 0) {
    brawl.queue.push('boss');
    for (let i = 0; i < 2 + Math.floor(r / 5); i++) brawl.queue.push(pickCup(r));
    brawlBanner('🌶️ WASABI THE UNMILD 🌶️', 'boss');
  } else {
    for (let i = 0; i < 2 + r; i++) brawl.queue.push(pickCup(r));
    brawlBanner('ROUND ' + r);
  }
  brawl.spawnT = 0.6;
}

function pickCup(round) {
  const pool = Object.keys(CUPS).filter((k) => CUPS[k].unlock <= round);
  return pool[(Math.random() * pool.length) | 0];
}

function spawnCup(kind) {
  const side = Math.random() < 0.5 ? -1 : 1;
  if (kind === 'boss') {
    const tier = Math.floor(brawl.round / 5);
    brawl.enemies.push({
      boss: true, kind: 'boss', x: brawl.W / 2 + side * brawl.W * 0.4,
      hp: 14 + tier * 5, maxHp: 14 + tier * 5, speed: 9,
      st: 'walk', stT: 0, face: -side, dead: false, golden: false,
      minionsAt: 0.5, // spawn backup at half hp, once
    });
    return;
  }
  const c = CUPS[kind];
  const golden = Math.random() < 0.05;
  brawl.enemies.push({
    kind, x: brawl.W / 2 + side * (brawl.W * 0.5 + 10 + Math.random() * 30),
    hp: c.hp, speed: c.speed * (0.85 + Math.random() * 0.3) * (golden ? 1.5 : 1),
    st: 'walk', stT: 0, face: -side, dead: false, golden,
    waddle: Math.random() * 7,
  });
}

// ---- combat ----------------------------------------------------------------------

function brawlPunch() {
  const p = brawl.p;
  if (!brawlActive() || brawl.phase === 'ko') return;
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
  if (!brawlActive() || brawl.phase === 'ko') return;
  if (p.dodgeCd > 0 || p.st === 'hurt' || p.st === 'dodge') return;
  p.st = 'dodge';
  p.stT = 0;
  p.dodgeCd = DODGE_CD;
  p.iT = Math.max(p.iT, DODGE_DUR + 0.06);
  brawlFx(p.x - p.face * 8, brawl.ground - 3, 'dust');
}

function koCup(e, byChainIdx) {
  e.dead = true;
  e.st = 'ko';
  e.stT = 0;
  brawl.crowdHype = 1;
  const base = e.boss ? 30 : CUPS[e.kind].value;
  const comboMult = 1 + 0.25 * (byChainIdx || 0);
  let worth = Math.max(1, Math.round(storm.perFlyer * base * comboMult));
  if (e.golden) worth *= GOLDEN_MULTIPLIER;
  storm.caught += worth;
  const sc = brawl.scale;
  spawnPopLabel(e.x * sc, (brawl.ground - 26) * sc,
    (e.golden ? '✨ ' : '') + (e.boss ? 'BOSS DOWN! +' : '+') + fmt.format(worth),
    e.golden || e.boss ? 'golden' : '');
  brawl.splats.push({ x: e.x, r: 2, max: e.boss ? 16 : 9, color: e.golden ? GOLD.body : (e.boss ? '#39c96a' : CUPS[e.kind].body), t: 0 });
  updateStormHud();

  if (e.boss) {
    brawl.shake = 0.5;
    sfxBrawlBossDown && sfxBrawlBossDown();
  }
}

function hurtPlayer(fromX) {
  const p = brawl.p;
  if (p.iT > 0 || brawl.phase === 'ko') return;
  p.hearts--;
  p.iT = 1.1;
  p.st = 'hurt';
  p.stT = 0;
  p.kb = (p.x < fromX ? -1 : 1) * 46;
  brawl.shake = 0.3;
  brawlFx(p.x, brawl.ground - 12, 'spark');
  updateStormHud();
  if (p.hearts <= 0) {
    brawl.phase = 'ko';
    brawl.phaseT = 0;
    brawlBanner('🥴 SAUCED!', 'boss');
    // everyone backs off to let you up
    for (const e of brawl.enemies)
      if (!e.dead) { e.st = 'hurt'; e.stT = 0; e.kb = (e.x < p.x ? -1 : 1) * 60; }
  }
}

function brawlFx(x, y, kind) {
  brawl.fx.push({ x, y, kind, t: 0 });
}

// ---- per-frame -------------------------------------------------------------------

function stepBrawl(dt, w, h) {
  if (!brawl.on) return;
  if (brawl.cv.width !== Math.ceil(w / brawl.scale)) brawlLayout();
  brawl.t += dt;
  const p = brawl.p;

  if (brawl.hitstop > 0) { brawl.hitstop -= dt; drawBrawl(); return; }
  brawl.shake = Math.max(0, brawl.shake - dt);
  brawl.crowdHype = Math.max(0, brawl.crowdHype - dt * 0.8);
  p.iT = Math.max(0, p.iT - dt);
  p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  brawl.phaseT += dt;

  // phases
  if (brawl.phase === 'banner' && brawl.phaseT > 1.1) {
    brawl.phase = 'fight';
    brawlBanner('FIGHT!', 'fight');
    setTimeout(() => brawl.on && brawl.phase === 'fight' && brawl.banner.classList.remove('show'), 600);
  } else if (brawl.phase === 'ko' && brawl.phaseT > 1.5) {
    brawl.phase = 'fight';
    p.hearts = Math.ceil(BRAWL_HEARTS / 2);
    p.iT = 1.5;
    brawl.banner.classList.remove('show');
    updateStormHud();
  } else if (brawl.phase === 'clear' && brawl.phaseT > 1.3) {
    nextBrawlRound();
  }

  // spawns
  if (brawl.phase === 'fight' && brawl.queue.length) {
    brawl.spawnT -= dt;
    const aliveCap = 3 + Math.min(brawl.round, 3);
    if (brawl.spawnT <= 0 && brawl.enemies.filter((e) => !e.dead).length < aliveCap) {
      spawnCup(brawl.queue.shift());
      brawl.spawnT = 1.1 + Math.random() * 0.5;
    }
  }

  // round clear
  if (brawl.phase === 'fight' && !brawl.queue.length && !brawl.enemies.some((e) => !e.dead)) {
    brawl.phase = 'clear';
    brawl.phaseT = 0;
    const bonus = Math.max(1, Math.round(storm.perFlyer * 3 * brawl.round));
    storm.caught += bonus;
    spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.35, 'ROUND CLEAR +' + fmt.format(bonus), 'golden');
    brawlBanner('ROUND ' + brawl.round + ' CLEAR!');
    updateStormHud();
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
        const er = e.boss ? 11 : 7;
        if (Math.abs(e.x - hx) < er + 4) {
          m.hit.add(e);
          e.hp -= m.dmg;
          brawl.hitstop = 0.05;
          brawlFx((e.x + hx) / 2, brawl.ground - (m.name === 'upper' ? 16 : 11), 'spark');
          sfxBrawlHit && sfxBrawlHit(m.name === 'upper');
          if (e.hp <= 0) koCup(e, m.idx);
          else {
            e.st = 'hurt';
            e.stT = 0;
            // knocked AWAY from the player
            e.kb = (e.x < p.x ? -1 : 1) * m.kb * (e.boss ? 0.25 : 1);
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
  } else {
    let mv = 0;
    if (brawl.keys.l) mv -= 1;
    if (brawl.keys.r) mv += 1;
    if (brawl.touch && brawl.touch.move) mv = brawl.touch.dir;
    if (mv && brawl.phase !== 'ko') {
      p.x += mv * 62 * dt;
      p.face = mv;
      p.walk += dt * 10;
      p.st = 'walk';
    } else if (st === 'walk') p.st = 'idle';
  }
  p.x = Math.max(12, Math.min(brawl.W - 12, p.x));

  // ---- enemies
  for (let i = brawl.enemies.length - 1; i >= 0; i--) {
    const e = brawl.enemies[i];
    e.stT += dt;
    const c = e.boss ? null : CUPS[e.kind];
    const dx = p.x - e.x, adx = Math.abs(dx);

    if (e.dead) {
      if (e.stT > 0.6) brawl.enemies.splice(i, 1);
      continue;
    }
    if (e.st === 'hurt') {
      e.x += (e.kb || 0) * dt * (1 - Math.min(e.stT / 0.25, 1));
      if (e.stT >= 0.25) { e.st = 'walk'; e.launch = 0; }
      continue;
    }

    // golden cups are cowards: they flee with the loot
    if (e.golden && e.st === 'walk') {
      e.x -= Math.sign(dx) * e.speed * 1.1 * dt;
      e.face = -Math.sign(dx) || 1;
      if (e.x < -14 || e.x > brawl.W + 14) brawl.enemies.splice(i, 1);
      continue;
    }

    if (e.boss) {
      // spawn backup once at half health
      if (e.minionsAt && e.hp <= e.maxHp * e.minionsAt) {
        e.minionsAt = 0;
        spawnCup(pickCup(brawl.round));
        spawnCup(pickCup(brawl.round));
      }
      if (e.st === 'walk') {
        e.face = Math.sign(dx) || 1;
        e.x += e.face * e.speed * dt;
        if (adx < 20) { e.st = 'windup'; e.stT = 0; }
      } else if (e.st === 'windup' && e.stT > 0.55) {
        e.st = 'slam';
        e.stT = 0;
        brawl.shake = 0.35;
        // shockwaves ripple out both ways along the counter
        brawl.blobs.push({ x: e.x - 10, vx: -85, vy: 0, y: brawl.ground - 2, wave: true, t: 0 });
        brawl.blobs.push({ x: e.x + 10, vx: 85, vy: 0, y: brawl.ground - 2, wave: true, t: 0 });
        sfxBrawlSlam && sfxBrawlSlam();
      } else if (e.st === 'slam' && e.stT > 0.6) {
        e.st = 'walk';
      }
      continue;
    }

    if (c.ranged) {
      if (e.st === 'walk') {
        e.face = Math.sign(dx) || 1;
        if (adx > c.range) e.x += e.face * e.speed * dt;
        else { e.st = 'windup'; e.stT = 0; }
      } else if (e.st === 'windup' && e.stT > 0.4) {
        e.st = 'throw';
        e.stT = 0;
        const flight = Math.max(adx / 95, 0.5);
        brawl.blobs.push({
          x: e.x + e.face * 5, y: brawl.ground - 12,
          vx: dx / flight, vy: -34 - flight * 42, g: 170, t: 0,
          color: c.body,
        });
      } else if (e.st === 'throw' && e.stT > 0.7) {
        e.st = 'walk';
        if (Math.random() < 0.4) e.x -= e.face * 8; // shuffle back
      }
    } else {
      if (e.st === 'walk') {
        e.face = Math.sign(dx) || 1;
        e.x += e.face * e.speed * dt;
        if (adx < c.range) { e.st = 'windup'; e.stT = 0; }
      } else if (e.st === 'windup' && e.stT > 0.35) {
        e.st = 'lunge';
        e.stT = 0;
      } else if (e.st === 'lunge') {
        e.x += e.face * 90 * dt;
        if (e.stT > 0.18) { e.st = 'recover'; e.stT = 0; }
        if (Math.abs(p.x - e.x) < 9) { hurtPlayer(e.x); e.st = 'recover'; e.stT = 0; }
      } else if (e.st === 'recover' && e.stT > 0.5) {
        e.st = 'walk';
      }
    }
  }

  // ---- projectiles + shockwaves
  for (let i = brawl.blobs.length - 1; i >= 0; i--) {
    const b = brawl.blobs[i];
    b.t += dt;
    b.x += b.vx * dt;
    if (!b.wave) {
      b.vy += b.g * dt;
      b.y += b.vy * dt;
    }
    const gone = b.x < -10 || b.x > brawl.W + 10 || (!b.wave && b.y > brawl.ground + 2) || (b.wave && b.t > 1.4);
    if (!b.wave && b.y > brawl.ground - 2 && b.vy > 0) {
      brawl.splats.push({ x: b.x, r: 1, max: 4, color: b.color, t: 0 });
    }
    if (Math.abs(b.x - p.x) < 6 && (b.wave ? true : Math.abs(b.y - (brawl.ground - 8)) < 8)) {
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
    if (s.t > 6) brawl.splats.splice(i, 1);
  }

  drawBrawl();
}

// ---- pixel rendering ---------------------------------------------------------------

// Kitchen backdrop, pre-rendered once per resize: tiled wall, night window,
// shelf of sauce jars, and the checkered counter floor.
function brawlBackdrop(W, Hh, ground) {
  const c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  // wall tiles, fading to shadow up top so the arena feels lit from below
  g.fillStyle = '#17222f';
  g.fillRect(0, 0, W, ground);
  g.fillStyle = '#121b27';
  for (let y = 0; y < ground; y += 10)
    for (let x = (y / 10) % 2 ? 5 : 0; x < W; x += 10)
      g.fillRect(x, y, 9, 9);
  const shade = g.createLinearGradient(0, 0, 0, ground);
  shade.addColorStop(0, 'rgba(0,0,4,0.72)');
  shade.addColorStop(0.6, 'rgba(0,0,4,0.15)');
  shade.addColorStop(1, 'rgba(0,0,4,0)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, ground);

  // fight-night bunting strung across the upper wall
  const bunY = Math.max(14, ground - 118);
  g.fillStyle = '#3a2c14';
  g.fillRect(0, bunY, W, 1);
  const flagCols = ['#d32f2f', '#ffe23a', '#26e0ff', '#ff8a3d'];
  for (let x = 4; x < W; x += 14) {
    g.fillStyle = flagCols[(x / 14 | 0) % 4];
    g.beginPath();
    g.moveTo(x, bunY + 1); g.lineTo(x + 10, bunY + 1); g.lineTo(x + 5, bunY + 9);
    g.closePath(); g.fill();
  }

  // big night window, bottom sitting just above the counter
  const winW = Math.min(110, W * 0.3), winH = 56;
  const wx = Math.round(W * 0.58), wy = ground - 22 - winH;
  g.fillStyle = '#0a0d1c';
  g.fillRect(wx, wy, winW, winH);
  g.fillStyle = '#f4ecd4';
  g.fillRect(wx + winW - 26, wy + 8, 9, 9); // moon
  g.fillStyle = '#8a93b8';
  for (let i = 0; i < 16; i++)
    g.fillRect(wx + 5 + ((i * 37) % (winW - 10)), wy + 5 + ((i * 23) % (winH - 10)), 1, 1);
  // city rooftops through the glass
  g.fillStyle = '#131a30';
  for (let i = 0; i < 6; i++) {
    const bw = 12 + (i * 7) % 10, bh = 10 + (i * 13) % 16;
    g.fillRect(wx + 4 + i * (winW / 6), wy + winH - bh, bw, bh);
  }
  g.fillStyle = '#2a3550';
  g.fillRect(wx - 4, wy - 4, winW + 8, 4);
  g.fillRect(wx - 4, wy + winH, winW + 8, 4);
  g.fillRect(wx + winW / 2 - 2, wy, 4, winH);
  g.fillRect(wx - 4, wy, 4, winH);
  g.fillRect(wx + winW, wy, 4, winH);

  // the fridge (left corner) with magnets and a title-fight poster
  const fx = Math.round(W * 0.05), fh = 84, fy = ground - 10 - fh, fw = 38;
  g.fillStyle = '#9aa6bc';
  g.fillRect(fx, fy, fw, fh);
  g.fillStyle = '#7c88a0';
  g.fillRect(fx, fy + 30, fw, 3);
  g.fillRect(fx + fw - 6, fy + 8, 3, 16);
  g.fillRect(fx + fw - 6, fy + 38, 3, 22);
  g.fillStyle = '#d32f2f'; g.fillRect(fx + 6, fy + 8, 4, 4);
  g.fillStyle = '#ffe23a'; g.fillRect(fx + 14, fy + 14, 4, 4);
  g.fillStyle = '#f4f0e6'; g.fillRect(fx + 6, fy + 42, 22, 28); // poster
  g.fillStyle = '#d32f2f'; g.fillRect(fx + 9, fy + 46, 16, 4);
  g.fillStyle = '#1a0f08'; g.fillRect(fx + 9, fy + 54, 12, 2);
  g.fillRect(fx + 9, fy + 59, 16, 2);
  g.fillRect(fx + 9, fy + 64, 9, 2);

  // stove with a bubbling pot, between fridge and window
  const sx2 = Math.round(W * 0.3), sy2 = ground - 10;
  g.fillStyle = '#3a4356';
  g.fillRect(sx2, sy2 - 34, 46, 34);
  g.fillStyle = '#20263a';
  g.fillRect(sx2 + 4, sy2 - 30, 12, 8);
  g.fillRect(sx2 + 28, sy2 - 30, 12, 8);
  g.fillStyle = '#161a2c';
  g.fillRect(sx2, sy2 - 36, 46, 4);
  g.fillStyle = '#c9d4f0';
  g.fillRect(sx2 + 8, sy2 - 44, 22, 9);   // pot
  g.fillStyle = '#d32f2f';
  g.fillRect(sx2 + 10, sy2 - 46, 18, 3);  // sauce bubbling over
  g.fillStyle = 'rgba(200,210,235,0.35)'; // steam
  g.fillRect(sx2 + 12, sy2 - 54, 2, 6);
  g.fillRect(sx2 + 22, sy2 - 58, 2, 8);

  // shelf of sauce jars (right end) + hanging pans
  const shx = W - Math.min(86, W * 0.2);
  g.fillStyle = '#2a1c10';
  g.fillRect(shx, ground - 74, 72, 4);
  const jars = ['#d32f2f', '#e6b800', '#6d3a1e', '#e8622c', '#39c96a'];
  jars.forEach((col, i) => {
    g.fillStyle = '#c9d4f0';
    g.fillRect(shx + 4 + i * 13, ground - 88, 9, 14);
    g.fillStyle = col;
    g.fillRect(shx + 4 + i * 13, ground - 84, 9, 10);
    g.fillStyle = '#42200e';
    g.fillRect(shx + 4 + i * 13, ground - 90, 9, 2);
  });
  for (const [px2, pr] of [[shx - 26, 7], [shx - 44, 9]]) {
    g.fillStyle = '#20263a';
    g.fillRect(px2, ground - 96, 1, 12);
    g.fillStyle = '#565f85';
    g.fillRect(px2 - pr, ground - 84, pr * 2, 3);
    g.fillRect(px2 - pr, ground - 81, 3, 6);
  }

  // backsplash + counter lip
  g.fillStyle = '#233242';
  g.fillRect(0, ground - 8, W, 8);
  g.fillStyle = '#e8412c';
  g.fillRect(0, ground - 8, W, 1);
  // checkered floor
  for (let y = ground; y < Hh; y += 6) {
    const row = (y - ground) / 6;
    for (let x = (row % 2) * 6 - 6; x < W + 6; x += 12) {
      g.fillStyle = '#1b2434';
      g.fillRect(x, y, 6, 6);
      g.fillStyle = '#242f44';
      g.fillRect(x + 6, y, 6, 6);
    }
  }
  return c;
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
    for (let px = 0; px < size; px++) {
      const ang = Math.atan2(py - cy, px - cx);
      const wob = Math.sin(ang * 3 + seed) * 1.1 + Math.cos(ang * 5 + seed * 2) * 0.6;
      const d = Math.hypot((px - cx) / 1.12, (py - cy) / 0.95);
      if (d < r + wob) {
        const edge = d > r + wob - 1.6;
        const speck = ((px * 3 + py * 7 + seed) % 13) === 0;
        g.fillStyle = edge ? dark : speck ? dark : base;
        g.fillRect(px, py, 1, 1);
      }
    }
  nugBodyCache[key] = c;
  return c;
}

function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

// The star: a nugget in a red headband with boxing gloves.
function drawPlayer(g) {
  const p = brawl.p;
  if (p.iT > 0 && brawl.phase !== 'ko' && Math.floor(brawl.t * 16) % 2) return; // i-frame flicker
  const step = Math.floor(p.walk) % 4;
  const bob = p.st === 'walk' ? (step % 2) : Math.floor(brawl.t * 2.5) % 2;
  const x = Math.round(p.x), y = brawl.ground - 10 - bob;
  const f = p.face;

  // dodge: lean into a blur streak
  if (p.st === 'dodge') {
    g.globalAlpha = 0.35;
    g.drawImage(nugBody(7, 4, '#e8a83e', '#8a5a1d'), x - 9 - f * 6, y - 8);
    g.globalAlpha = 1;
  }
  // feet
  px(g, x - 4 + (p.st === 'walk' ? (step < 2 ? -1 : 1) : 0), brawl.ground - 2, 3, 2, '#8a5a1d');
  px(g, x + 2 + (p.st === 'walk' ? (step < 2 ? 1 : -1) : 0), brawl.ground - 2, 3, 2, '#8a5a1d');
  // body
  g.drawImage(nugBody(7, 4, '#e8a83e', '#8a5a1d'), x - 9, y - 8);
  // headband
  px(g, x - 6, y - 6, 12, 2, '#d32f2f');
  px(g, x - 8 - (f < 0 ? -15 : 0), y - 5, 3, 1, '#d32f2f'); // trailing tail
  // eyes + determined brows
  px(g, x + f * 2, y - 3, 2, 2, '#fff');
  px(g, x + f * 5, y - 3, 2, 2, '#fff');
  px(g, x + f * 2 + (f > 0 ? 1 : 0), y - 2, 1, 1, '#1a0f08');
  px(g, x + f * 5 + (f > 0 ? 1 : 0), y - 2, 1, 1, '#1a0f08');
  px(g, x + f * 2 - 1, y - 5, 3, 1, '#42200e');
  px(g, x + f * 4, y - 5, 3, 1, '#42200e');

  // gloves
  const glove = (gx, gy, big) => {
    px(g, gx - 1, gy - 1, big ? 4 : 3, big ? 4 : 3, '#d32f2f');
    px(g, gx - 1, gy + (big ? 3 : 2), big ? 4 : 3, 1, '#f4f0e6');
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
    // guard up, bouncing with the idle
    glove(x + f * 5, y + (bob ? 0 : 1), false);
    glove(x + f * 2, y + 2 + (bob ? 1 : 0), false);
  }
}

// An angry sauce cup: cream cup, colored sauce dome with a scowl, stubby feet.
function drawCup(g, e) {
  const pal = e.golden ? GOLD : CUPS[e.kind];
  const step = Math.floor(brawl.t * 8 + (e.waddle || 0)) % 2;
  const x = Math.round(e.x);
  let y = brawl.ground - 12;
  if (e.launch) y -= 6;
  if (e.dead) {
    // tip over and squash into the splat
    const t = Math.min(e.stT / 0.5, 1);
    g.save();
    g.translate(x, brawl.ground - 4);
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
  // feet
  px(g, x - 4 + (step ? -1 : 0), brawl.ground - 2, 3, 2, pal.dark);
  px(g, x + 1 + (step ? 1 : 0), brawl.ground - 2, 3, 2, pal.dark);
  // cup
  px(g, x - 5 + lean, y, 10, 10, flash ? '#fff' : '#f4f0e6');
  px(g, x - 5 + lean, y + 3, 10, 2, flash ? '#fff' : pal.body); // label stripe
  px(g, x - 6 + lean, y, 12, 1, flash ? '#fff' : '#c9cfe0');    // rim
  // sauce dome
  px(g, x - 4 + lean, y - 4, 8, 4, flash ? '#fff' : pal.body);
  px(g, x - 3 + lean, y - 5, 6, 1, flash ? '#fff' : pal.body);
  px(g, x - 3 + lean, y - 5, 2, 1, flash ? '#fff' : pal.lite);
  // angry face on the dome
  if (!flash) {
    px(g, x - 2 + lean + (e.face > 0 ? 1 : 0), y - 3, 1, 1, '#1a0f08');
    px(g, x + 1 + lean + (e.face > 0 ? 1 : 0), y - 3, 1, 1, '#1a0f08');
    px(g, x - 3 + lean, y - 4, 2, 1, '#1a0f08');
    px(g, x + 1 + lean, y - 4, 2, 1, '#1a0f08');
  }
  if (e.st === 'windup') px(g, x + e.face * 7, y - 6, 2, 2, '#ffe23a'); // "!" tell
}

// Wasabi the Unmild: a hulking squeeze bottle.
function drawBoss(g, e) {
  const x = Math.round(e.x);
  const slamRise = e.st === 'windup' ? -Math.sin(Math.min(e.stT / 0.55, 1) * Math.PI) * 8 :
    e.st === 'slam' && e.stT < 0.15 ? 3 : 0;
  const y = brawl.ground - 30 + slamRise;
  const step = Math.floor(brawl.t * 6) % 2;
  const flash = e.st === 'hurt' && Math.floor(e.stT * 30) % 2;
  const body = flash ? '#fff' : '#2e9e53';
  const dark = flash ? '#fff' : '#1c6434';
  px(g, x - 5 + (step ? -1 : 0), brawl.ground - 3, 4, 3, dark);
  px(g, x + 2 + (step ? 1 : 0), brawl.ground - 3, 4, 3, dark);
  px(g, x - 8, y + 6, 16, 22, body);          // bottle body
  px(g, x - 8, y + 6, 3, 22, flash ? '#fff' : '#39c96a'); // highlight
  px(g, x - 6, y + 12, 12, 9, flash ? '#fff' : '#f4f0e6'); // label
  px(g, x - 4, y + 15, 8, 1, dark);
  px(g, x - 4, y + 18, 6, 1, dark);
  px(g, x - 5, y + 2, 10, 4, dark);           // shoulder taper
  px(g, x - 2, y - 3, 4, 5, flash ? '#fff' : '#ffe23a'); // cap
  // furious little eyes
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
  g.drawImage(brawl.bg, 0, 0);

  // sauce splats live on the floor until they fade
  for (const s of brawl.splats) {
    const r = Math.min(s.r + s.t * 18, s.max);
    g.globalAlpha = Math.max(0.15, 0.6 - s.t * 0.1);
    px(g, s.x - r, brawl.ground - 1, r * 2, 2, s.color);
    px(g, s.x - r * 0.6, brawl.ground - 2, r * 1.2, 1, s.color);
    g.globalAlpha = 1;
  }

  // entities sorted left-to-right isn't needed on one plane; enemies then player
  for (const e of brawl.enemies) (e.boss ? drawBoss : drawCup)(g, e);
  drawPlayer(g);

  // projectiles + shockwaves
  for (const b of brawl.blobs) {
    if (b.wave) {
      const hgt = 3 + Math.floor((Math.sin(b.t * 20) + 1) * 1.5);
      px(g, b.x - 2, brawl.ground - hgt, 4, hgt, '#39c96a');
      px(g, b.x - 1, brawl.ground - hgt - 1, 2, 1, '#a5f0c0');
    } else {
      px(g, b.x - 1, b.y - 1, 3, 3, b.color);
      px(g, b.x - b.vx * 0.02, b.y - b.vy * 0.02, 1, 1, b.color);
    }
  }

  // hit sparks + dodge dust
  for (const f of brawl.fx) {
    const t = f.t / 0.25;
    if (f.kind === 'spark') {
      g.fillStyle = t < 0.5 ? '#fff' : '#ffe23a';
      for (let i = 0; i < 4; i++) {
        const a = i * 1.57 + 0.4;
        px(g, f.x + Math.cos(a) * t * 8, f.y + Math.sin(a) * t * 8, 2, 2, g.fillStyle);
      }
    } else {
      g.globalAlpha = 1 - t;
      px(g, f.x - 2, f.y, 5, 2, '#8a93b8');
      g.globalAlpha = 1;
    }
  }

  // the crowd of nugget spectators along the bottom edge
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
  if (e.code === 'KeyX' || e.code === 'KeyZ') { brawlPunch(); e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'ArrowDown') { brawlDodge(); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') brawl.keys.l = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') brawl.keys.r = false;
});
window.addEventListener('mousedown', (e) => {
  if (!brawlActive()) return;
  if (e.target.closest('.storm-hud')) return;
  brawlPunch();
});

// Touch: tap punches; hold and the nugget walks toward your finger; swipe down dodges.
window.addEventListener('touchstart', (e) => {
  if (!brawlActive()) return;
  if (e.target.closest('.storm-hud')) return;
  const t = e.touches[0];
  brawl.touch = { x0: t.clientX, y0: t.clientY, t0: performance.now(), move: false, dir: 1 };
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!brawlActive() || !brawl.touch) return;
  const t = e.touches[0];
  if (t.clientY - brawl.touch.y0 > 46) { brawlDodge(); brawl.touch = null; return; }
  if (performance.now() - brawl.touch.t0 > 140 || Math.abs(t.clientX - brawl.touch.x0) > 24) {
    brawl.touch.move = true;
    brawl.touch.dir = t.clientX / brawl.scale > brawl.p.x ? 1 : -1;
  }
}, { passive: true });
window.addEventListener('touchend', () => {
  if (!brawlActive() || !brawl.touch) return;
  if (!brawl.touch.move && performance.now() - brawl.touch.t0 < 220) brawlPunch();
  brawl.touch = null;
});

window.addEventListener('resize', () => { if (brawl.on) brawlLayout(); });

// ---- tiny synth stingers (defined here so brawl works even without the hall) ------
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
