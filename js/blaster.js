// ---- Blaster — THE OVEN RELIGHT edition ----------------------------------------
// Was: Missile Command with an endless nugget-rain off the storm's own spawner.
// Now: NUGGETOWN DEFENSE — a wave-based last stand. Blaster now OWNS its spawner
// (it's in pausesStorm()), so it can escalate: grunts, ARMORED (2 hits), SPLITTERS
// (break in two), and DIVERS that curve into a building — then every 5th wave the
// syndicate rolls out THE BATTER BOMBER, a tanker-airship with a health bar that
// drops payloads. Defend a named Nuggetown skyline (the arcade, the pier, the
// club, the ranch, NPD HQ…); lose the whole block and the run ends (medal by wave).
// Chained kills build a KILLSTREAK multiplier. Down the first Bomber → `nugBlasterHeld`.
//
// Difficulty is an ArcadeKit oath: PATROL / SIEGE / THE BATTER STORM 💥. Still DOM/CSS,
// still banks into storm.caught (perFlyer parity). Multiplayer co-op (blasterMP.js)
// is a totally separate code path and is untouched by this.
//
// NOTE: wrapped in an IIFE so blaster's many helpers (spawnEnemy, nextWave,
// spawnBoss…) don't share the ONE global script scope with the other games —
// knight.js also defines spawnEnemy, and last-loaded-wins would clobber ours.
// Only the seams storm.js / arcade.js / tests need are exported to window.

const BlasterGame = (() => {
const cannonEl = document.getElementById('blasterCannon');
const blasterBg = document.getElementById('blasterBg');
const cityEl = document.getElementById('cityRow');
const shieldEl = document.getElementById('cityShield');
const powerChip = document.getElementById('powerChip');

const BOLT_SPEED = 980;
const FIRE_COOLDOWN = 0.16;
const RAPID_COOLDOWN = 0.06;
const CANNON_SPEED = 680;
const CANNON_MARGIN = 30;
const CITY_GROUND = 180;         // px of skyline zone at the bottom
const BUILDING_HP = 3;
const POWER_SECS = 8;
const ENEMY_SIZE = 46;

const CITY_NAMES = ['THE ARCADE', 'GREASE GARAGE', 'THE PIER', 'DIP HOP', 'NPD HQ', 'SAUCE WORKS', 'THE RANCH'];

// Enemy archetypes. baseSpeed is px/s of descent (× tier.speed).
const ENEMY = {
  grunt:    { hp: 1, speed: 74,  worth: 1, cls: '' },
  armor:    { hp: 2, speed: 60,  worth: 2, cls: 'e-armor' },
  splitter: { hp: 1, speed: 70,  worth: 2, cls: 'e-split', splits: 2 },
  diver:    { hp: 1, speed: 120, worth: 2, cls: 'e-diver', dives: true },
};

const POWERUPS = [
  { key: 'rapid',    emoji: '⚡', label: 'RAPID FIRE' },
  { key: 'triple',   emoji: '🔱', label: 'TRIPLE SHOT' },
  { key: 'shield',   emoji: '🛡️', label: 'CITY SHIELD' },
  { key: 'smartbomb', emoji: '💣', label: 'SMART BOMB', instant: true },
  { key: 'repair',   emoji: '❤️', label: 'REPAIR', instant: true },
  { key: 'x2',       emoji: '✖️', label: 'DOUBLE SCORE' },
];

const BLASTER_TIERS = [
  { key: 'patrol', emoji: '🚓', name: 'PATROL', mult: 1, speed: 0.85, density: 0.8, armor: 0, blurb: 'a quiet night watch' },
  { key: 'siege',  emoji: '🎯', name: 'SIEGE',  mult: 2, speed: 1.0,  density: 1.0, armor: 0, blurb: 'they came for Nuggetown' },
  { key: 'storm',  emoji: '💥', name: 'THE BATTER STORM', mult: 3, speed: 1.25, density: 1.3, armor: 1, blurb: 'the syndicate empties the sky',
    lockNote: 'reach Wave 5 on SIEGE' },
];
const BOSS_EVERY = 5;
function blasterStormUnlocked() {
  try { return localStorage.getItem('nugBlasterStorm') === '1'; } catch (e) { return false; }
}
// Read by arcade.js street dialogue (Sprint 6): did they hold the line vs the Bomber?
function blasterHeld() {
  try { return localStorage.getItem('nugBlasterHeld') === '1'; } catch (e) { return false; }
}

const blaster = {
  on: false,
  phase: 'idle',        // 'idle' | 'tier' | 'playing' | 'intermission' | 'over'
  cfg: BLASTER_TIERS[1],
  x: window.innerWidth / 2,
  keys: { left: false, right: false },
  firing: false,
  cooldown: 0,
  bolts: [], enemies: [], drops: [],
  city: [],
  boss: null,
  bossBar: null,
  power: null,
  streak: null,         // ArcadeKit fever = killstreak
  wave: 0,
  toSpawn: [],          // queued enemy type strings for the current wave
  spawnT: 0,
  interT: 0,
  nextDropT: 6,
  best: 0,
  muzzleFlashEl: null,
  tierPick: null,
};

function blasterActive() { return storm.mode === 'blaster' && storm.running; }

function blasterTally() {
  if (blaster.phase === 'tier') return '🎯 to your cannon…';
  if (blaster.boss) return `🛢️ THE BATTER BOMBER · ${Math.max(0, Math.ceil(blaster.boss.hp))} hp`;
  const alive = blaster.city.filter((c) => c.hp > 0).length;
  const streak = blaster.streak && blaster.streak.active ? ` · 🔥×${blaster.streak.mult.toFixed(1)}` : '';
  return `🎯 Wave ${blaster.wave} · 🏙️ ${alive}/${blaster.city.length}${streak}`;
}

function clampCannonX(x) { return Math.min(Math.max(x, CANNON_MARGIN), window.innerWidth - CANNON_MARGIN); }
function positionCannon() { cannonEl.style.transform = `translateX(${blaster.x}px)`; }

// ---- Mode plumbing -------------------------------------------------------------

function syncBlaster() {
  const active = blasterActive();
  if (active === blaster.on) return;
  blaster.on = active;
  document.body.classList.toggle('blaster-mode', active);
  blasterBg.classList.toggle('active', active);
  cannonEl.classList.toggle('active', active);
  cityEl.classList.toggle('active', active);
  if (active) {
    ensureBossBar();
    blaster.x = clampCannonX(window.innerWidth / 2);
    positionCannon();
    openBlasterTier();
  } else {
    if (blaster.tierPick) { blaster.tierPick.close(); blaster.tierPick = null; }
    blaster.phase = 'idle';
    blaster.firing = false;
    clearBolts(); clearDrops(); clearEnemies(); clearCity(); killBoss();
    expirePower();
    if (blaster.bossBar) blaster.bossBar.classList.remove('on');
  }
}

function ensureBossBar() {
  if (blaster.bossBar) return;
  const el = document.createElement('div');
  el.className = 'blaster-bossbar';
  el.innerHTML = '<span class="bb-name">🛢️ THE BATTER BOMBER</span><div class="bb-track"><i></i></div>';
  document.body.appendChild(el);
  blaster.bossBar = el;
}

function openBlasterTier() {
  blaster.phase = 'tier';
  clearEnemies(); clearBolts(); clearDrops();
  if (!blaster.city.length) buildCity();
  const tiers = BLASTER_TIERS.map((t) => t.key === 'storm' && !blasterStormUnlocked() ? { ...t, locked: true } : t);
  blaster.tierPick = ArcadeKit.tierSelect({
    storeKey: 'blaster',
    title: '🎯 Defend Nuggetown',
    note: blasterStormUnlocked() ? 'the Batter Storm awaits · 1 · 2 · 3' : 'press 1 · 2 · 3 or click',
    tiers,
    onPick: (key, t) => { blaster.tierPick = null; blaster.cfg = t; startBlaster(); },
  });
}

function startBlaster() {
  blaster.phase = 'playing';
  blaster.wave = 0;
  blaster.streak = ArcadeKit.makeFever({ perLevel: 6, maxLevel: 4, step: 0.4, timeout: 0 });
  expirePower();
  buildCity();
  nextWave();
}

// ---- The city ------------------------------------------------------------------

function buildCity() {
  cityEl.innerHTML = '';
  blaster.city = [];
  const w = window.innerWidth;
  const slot = w / CITY_NAMES.length;
  for (let i = 0; i < CITY_NAMES.length; i++) {
    const bw = slot * (0.52 + Math.random() * 0.28);
    const bx = i * slot + (slot - bw) / 2;
    const bh = 66 + Math.random() * 78;
    const el = document.createElement('div');
    el.className = 'city-building';
    el.style.left = bx + 'px';
    el.style.width = bw + 'px';
    el.style.height = bh + 'px';
    cityEl.appendChild(el);
    blaster.city.push({ el, x: bx, w: bw, h: bh, hp: BUILDING_HP, name: CITY_NAMES[i] });
  }
}
function clearCity() { cityEl.innerHTML = ''; blaster.city = []; }

function damageBuilding(b, x, y) {
  b.hp--;
  b.el.classList.toggle('dmg1', b.hp === 2);
  b.el.classList.toggle('dmg2', b.hp === 1);
  ArcadeKit.kick(8, 260);
  ArcadeKit.burst(x, y, { n: 10, color: '#f59e0b', speed: 260 });
  if (b.hp <= 0) {
    b.el.classList.add('rubble');
    b.el.style.height = '16px';
    b.h = 16;
    spawnPopLabel(x, window.innerHeight - CITY_GROUND, `🏚️ ${b.name} is down!`, '');
  }
  // streak breaks when the city takes a hit
  if (blaster.streak) blaster.streak.miss();
  if (blaster.city.every((c) => c.hp <= 0)) cityDown();
  updateStormHud();
}

function cityDown() {
  if (blaster.phase === 'over') return;
  blaster.phase = 'over';
  ArcadeKit.kick(22, 700);
  if (blaster.wave > blaster.best) blaster.best = blaster.wave;
  ArcadeKit.saveBest('blaster', blaster.cfg.key, blaster.wave);
  killBoss();
  showBlasterOver();
}

// ---- Waves ---------------------------------------------------------------------

function nextWave() {
  blaster.wave++;
  blaster.toSpawn = [];
  killBoss();
  const w = blaster.wave;
  if (w % BOSS_EVERY === 0) {
    spawnBoss(w);
    spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.3, '🛢️ THE BATTER BOMBER', 'big');
    ArcadeKit.kick(14, 400);
  } else {
    const count = Math.round((5 + w * 2) * blaster.cfg.density);
    for (let i = 0; i < count; i++) blaster.toSpawn.push(pickEnemyType(w));
    spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.3, `WAVE ${w}`, 'big');
  }
  // unlock THE BATTER STORM by reaching wave 5 on SIEGE+
  if (w >= BOSS_EVERY && blaster.cfg.key !== 'patrol') { try { localStorage.setItem('nugBlasterStorm', '1'); } catch (e) { /* ok */ } }
  blaster.spawnT = 0.6;
  blaster.phase = 'playing';
  updateStormHud();
}

function pickEnemyType(w) {
  const r = Math.random();
  if (w >= 4 && r < 0.18) return 'diver';
  if (w >= 3 && r < 0.38) return 'splitter';
  if (w >= 2 && r < 0.6) return 'armor';
  return 'grunt';
}

function waveClear() {
  return blaster.phase === 'playing' && !blaster.boss && blaster.toSpawn.length === 0 &&
    blaster.enemies.length === 0;
}

function startIntermission() {
  blaster.phase = 'intermission';
  blaster.interT = 2.0;
  // reward: patch the most-damaged standing building
  const hurt = blaster.city.filter((c) => c.hp > 0 && c.hp < BUILDING_HP).sort((a, b) => a.hp - b.hp)[0];
  if (hurt) { hurt.hp++; hurt.el.classList.toggle('dmg1', hurt.hp === 2); hurt.el.classList.toggle('dmg2', hurt.hp === 1); }
  spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.34, `✅ WAVE ${blaster.wave} CLEARED`, 'big');
}

// ---- Enemies -------------------------------------------------------------------

function makeEnemyEl(type) {
  const el = document.createElement('div');
  el.className = 'blaster-enemy ' + (ENEMY[type].cls || '');
  el.innerHTML = '<img src="nugget.png" alt="" draggable="false"/>';
  document.body.appendChild(el);
  return el;
}

function spawnEnemy(type, atX, atY) {
  const def = ENEMY[type];
  const w = window.innerWidth;
  const golden = Math.random() < storm.cat.golden;
  const el = makeEnemyEl(type);
  if (golden) el.classList.add('golden');
  const x = atX != null ? atX : (40 + Math.random() * (w - 80));
  const e = {
    el, type, x, y: atY != null ? atY : -ENEMY_SIZE,
    vx: (Math.random() - 0.5) * 40,
    hp: def.hp + (type === 'armor' ? blaster.cfg.armor : 0),
    worth: def.worth, golden,
    target: null, size: ENEMY_SIZE,
  };
  if (def.dives) e.target = nearestBuildingX(x);
  blaster.enemies.push(e);
  return e;
}

function nearestBuildingX(x) {
  let best = x, bd = Infinity;
  for (const b of blaster.city) {
    if (b.hp <= 0) continue;
    const cx = b.x + b.w / 2, d = Math.abs(cx - x);
    if (d < bd) { bd = d; best = cx; }
  }
  return best;
}

function clearEnemies() { blaster.enemies.forEach((e) => e.el.remove()); blaster.enemies = []; }

function destroyEnemy(i, byBolt) {
  const e = blaster.enemies[i];
  const cx = e.x, cy = e.y;
  let worth = storm.perFlyer * blaster.cfg.mult * e.worth;
  if (byBolt) {
    blaster.streak.hit();
    worth = Math.round(worth * blaster.streak.mult * (blaster.power && blaster.power.def.key === 'x2' ? 2 : 1));
    if (e.golden) worth *= GOLDEN_MULTIPLIER;
    storm.caught += Math.max(1, worth);
    spawnCatchLabel(cx, cy, Math.max(1, worth), e.golden);
    ArcadeKit.burst(cx, cy, { n: e.golden ? 16 : 9, emoji: e.golden ? '✨' : null, color: '#fbbf24', speed: 280 });
    announceStreak();
  }
  if (ENEMY[e.type].splits) { // splitters break into two smaller grunts
    for (let k = 0; k < ENEMY[e.type].splits; k++) {
      const g = spawnEnemy('grunt', cx + (k ? 22 : -22), cy);
      g.vx = (k ? 1 : -1) * 90;
      g.el.classList.add('e-small');
      g.size = 34;
    }
  }
  e.el.remove();
  blaster.enemies.splice(i, 1);
  updateStormHud();
}

let lastStreakLevel = 0;
function announceStreak() {
  const lv = blaster.streak.level;
  if (lv > lastStreakLevel && lv >= 2) {
    const names = { 2: 'KILLING SPREE', 3: 'RAMPAGE', 4: 'NUGGETOWN HERO' };
    spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.24, '🔥 ' + (names[lv] || 'UNSTOPPABLE'), 'big');
  }
  lastStreakLevel = lv;
}

// ---- Boss: THE BATTER BOMBER ---------------------------------------------------

function spawnBoss(wave) {
  const el = document.createElement('div');
  el.className = 'blaster-boss';
  el.innerHTML = '<div class="bo-body">🛢️</div>';
  document.body.appendChild(el);
  const hp = Math.round((26 + wave * 5) * (0.7 + blaster.cfg.mult * 0.3));
  // fly BELOW the top storm-HUD card (which is tallest on the calculator storm),
  // scaling down on short viewports so the barrel is never occluded.
  const y = Math.max(180, window.innerHeight * 0.26);
  blaster.boss = { el, x: window.innerWidth * 0.5, y, vx: 150, hp, maxHp: hp, dropT: 1.4, wave };
  blaster.bossBar.classList.add('on');
  updateBossBar();
}
function updateBossBar() {
  if (!blaster.boss || !blaster.bossBar) return;
  const pct = Math.max(0, blaster.boss.hp / blaster.boss.maxHp);
  blaster.bossBar.querySelector('i').style.width = (pct * 100).toFixed(1) + '%';
}
function killBoss() {
  if (blaster.boss) { blaster.boss.el.remove(); blaster.boss = null; }
  if (blaster.bossBar) blaster.bossBar.classList.remove('on');
}
function bossDefeated() {
  const wave = blaster.boss.wave;
  const cx = blaster.boss.x, cy = blaster.boss.y;
  let worth = Math.round(storm.perFlyer * blaster.cfg.mult * 40 * (blaster.power && blaster.power.def.key === 'x2' ? 2 : 1));
  storm.caught += worth;
  spawnCatchLabel(cx, cy, worth, true);
  ArcadeKit.kick(24, 800);
  ArcadeKit.burst(cx, cy, { n: 46, emoji: '💥', speed: 460, life: 1.0 });
  killBoss();
  // finale: the FIRST Bomber down holds the line for Nuggetown
  if (!blasterHeld()) {
    try { localStorage.setItem('nugBlasterHeld', '1'); } catch (e) { /* ok */ }
    spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.4, '🛢️ BOMBER DOWN — NUGGETOWN HOLDS', 'big');
  } else {
    spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.4, '🛢️ ANOTHER BOMBER DOWN', 'big');
  }
  updateStormHud();
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
  blaster.nextDropT = 9 + Math.random() * 7;
}
function clearDrops() { blaster.drops.forEach((d) => d.el.remove()); blaster.drops = []; }

function activatePower(def, x, y) {
  spawnPopLabel(x, y, def.emoji + ' ' + def.label, 'golden');
  if (def.key === 'smartbomb') { // clear the screen
    ArcadeKit.kick(16, 500);
    for (let i = blaster.enemies.length - 1; i >= 0; i--) destroyEnemy(i, true);
    if (blaster.boss) { blaster.boss.hp -= 12; updateBossBar(); if (blaster.boss.hp <= 0) bossDefeated(); }
    return;
  }
  if (def.key === 'repair') { // heal the skyline
    blaster.city.forEach((b) => { if (b.hp > 0 && b.hp < BUILDING_HP) { b.hp++; b.el.classList.toggle('dmg1', b.hp === 2); b.el.classList.toggle('dmg2', b.hp === 1); b.el.classList.remove('rubble'); } });
    ArcadeKit.burst(x, y, { n: 14, emoji: '❤️', speed: 220 });
    return;
  }
  blaster.power = { def, t: POWER_SECS };
  shieldEl.classList.toggle('active', def.key === 'shield');
  updatePowerChip();
}
function expirePower() { blaster.power = null; shieldEl.classList.remove('active'); updatePowerChip(); }
function updatePowerChip() {
  if (blaster.power) {
    powerChip.textContent = `${blaster.power.def.emoji} ${blaster.power.def.label} · ${Math.ceil(blaster.power.t)}s`;
    powerChip.classList.add('active');
  } else powerChip.classList.remove('active');
}

// ---- Shooting ------------------------------------------------------------------

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
  ArcadeKit.burst(blaster.x, y, { n: 3, color: '#fde047', speed: 120, life: 0.2, size: 4, gravity: 0 });
  blaster.cooldown = (blaster.power && blaster.power.def.key === 'rapid') ? RAPID_COOLDOWN : FIRE_COOLDOWN;
}
function clearBolts() { blaster.bolts.forEach((b) => b.el.remove()); blaster.bolts = []; }

// ---- Per-frame -----------------------------------------------------------------

function stepBlaster(dt, w, h) {
  if (blaster.phase === 'tier') return;

  // cannon movement (always responsive)
  const dir = (blaster.keys.right ? 1 : 0) - (blaster.keys.left ? 1 : 0);
  if (dir) { blaster.x = clampCannonX(blaster.x + dir * CANNON_SPEED * dt); positionCannon(); }

  if (blaster.phase === 'over') { stepBolts(dt, w, h); return; }

  if (blaster.phase === 'intermission') {
    blaster.interT -= dt;
    stepBolts(dt, w, h);
    if (blaster.interT <= 0) nextWave();
    return;
  }

  // power timer
  if (blaster.power) { blaster.power.t -= dt; if (blaster.power.t <= 0) expirePower(); else updatePowerChip(); }
  if (blaster.streak) blaster.streak.tick();

  // crates
  blaster.nextDropT -= dt;
  if (blaster.nextDropT <= 0) spawnDrop(w);
  for (let i = blaster.drops.length - 1; i >= 0; i--) {
    const d = blaster.drops[i];
    d.y += 118 * dt;
    d.el.style.transform = `translate(${d.x}px, ${d.y}px)`;
    if (d.y > h - 8) { d.el.remove(); blaster.drops.splice(i, 1); }
  }

  // firing
  blaster.cooldown -= dt;
  if (blaster.firing && blaster.cooldown <= 0) fireBolt();

  // spawn queued enemies
  if (blaster.toSpawn.length) {
    blaster.spawnT -= dt;
    if (blaster.spawnT <= 0) {
      spawnEnemy(blaster.toSpawn.shift());
      blaster.spawnT = (0.9 - Math.min(blaster.wave * 0.03, 0.5)) / blaster.cfg.speed * (0.7 + Math.random() * 0.6);
    }
  }

  stepBolts(dt, w, h);
  stepEnemies(dt, w, h);
  stepBoss(dt, w, h);

  if (waveClear()) startIntermission();
}

function stepBolts(dt, w, h) {
  for (let i = blaster.bolts.length - 1; i >= 0; i--) {
    const b = blaster.bolts[i];
    b.y -= BOLT_SPEED * dt; b.x += b.vx * dt;
    if (b.y < -30 || b.x < -30 || b.x > w + 30) { b.el.remove(); blaster.bolts.splice(i, 1); continue; }
    b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;

    // crate?
    const di = blaster.drops.findIndex((d) => Math.abs(d.x - b.x) < 26 && Math.abs(d.y - b.y) < 26);
    if (di !== -1) { activatePower(blaster.drops[di].def, b.x, b.y); blaster.drops[di].el.remove(); blaster.drops.splice(di, 1); b.el.remove(); blaster.bolts.splice(i, 1); continue; }

    // boss?
    if (blaster.boss && Math.abs(b.x - blaster.boss.x) < 60 && Math.abs(b.y - blaster.boss.y) < 34) {
      blaster.boss.hp -= 1; updateBossBar();
      ArcadeKit.burst(b.x, b.y, { n: 4, color: '#fb7185', speed: 180, life: 0.3, size: 5 });
      b.el.remove(); blaster.bolts.splice(i, 1);
      if (blaster.boss.hp <= 0) bossDefeated();
      continue;
    }

    // enemy?
    let hit = -1;
    for (let k = 0; k < blaster.enemies.length; k++) {
      const e = blaster.enemies[k], r = e.size / 2;
      if (Math.abs(e.x - b.x) < r + 6 && Math.abs(e.y - b.y) < r + 8) { hit = k; break; }
    }
    if (hit !== -1) {
      const e = blaster.enemies[hit];
      e.hp -= 1;
      if (e.hp <= 0) destroyEnemy(hit, true);
      else { e.el.classList.add('hurt'); setTimeout(() => e.el && e.el.classList.remove('hurt'), 90); ArcadeKit.burst(b.x, b.y, { n: 3, color: '#cbd5e1', speed: 150, life: 0.25, size: 4 }); }
      b.el.remove(); blaster.bolts.splice(i, 1);
    }
  }
}

function stepEnemies(dt, w, h) {
  const shieldOn = blaster.power && blaster.power.def.key === 'shield';
  const shieldY = h - CITY_GROUND + 12;
  const groundY = h - CITY_GROUND;
  for (let i = blaster.enemies.length - 1; i >= 0; i--) {
    const e = blaster.enemies[i];
    const def = ENEMY[e.type];
    let vy = def.speed * blaster.cfg.speed;
    if (def.dives && e.target != null) { e.vx += Math.sign(e.target - e.x) * 60 * dt; e.vx = Math.max(-160, Math.min(160, e.vx)); }
    e.x += e.vx * dt;
    e.y += vy * dt;
    if (e.x < 20 || e.x > w - 20) e.vx *= -1;
    e.el.style.transform = `translate(${e.x - e.size / 2}px, ${e.y - e.size / 2}px)`;

    if (shieldOn && e.y >= shieldY) { spawnPopLabel(e.x, shieldY, '🛡️'); e.el.remove(); blaster.enemies.splice(i, 1); continue; }

    if (e.y >= groundY) {
      // hit a building at this x (gaps are harmless)
      const b = blaster.city.find((c) => c.hp > 0 && e.x >= c.x && e.x <= c.x + c.w);
      if (b) damageBuilding(b, e.x, groundY);
      e.el.remove(); blaster.enemies.splice(i, 1);
      if (blaster.phase === 'over') return;
    }
  }
}

function stepBoss(dt, w, h) {
  const boss = blaster.boss;
  if (!boss) return;
  boss.x += boss.vx * dt;
  if (boss.x < 90 || boss.x > w - 90) boss.vx *= -1;
  boss.el.style.transform = `translate(${boss.x - 54}px, ${boss.y - 34}px)`;
  boss.dropT -= dt;
  if (boss.dropT <= 0) {
    // drop a payload: a diver toward the city, plus the odd grunt escort
    const e = spawnEnemy(Math.random() < 0.5 ? 'diver' : 'grunt', boss.x, boss.y + 30);
    e.vx = (Math.random() - 0.5) * 80;
    boss.dropT = Math.max(0.7, 1.8 - blaster.wave * 0.04) / blaster.cfg.speed;
  }
}

// ---- Game over -----------------------------------------------------------------

function showBlasterOver() {
  const m = ArcadeKit.medal(blaster.wave, [3, 6, 10]);
  const best = ArcadeKit.bests('blaster')[blaster.cfg.key] || blaster.wave;
  let over = document.getElementById('blasterOver');
  if (!over) { over = document.createElement('div'); over.id = 'blasterOver'; over.className = 'blaster-over'; document.body.appendChild(over); }
  over.innerHTML =
    `<div class="bo-card">
       <div class="bo-medal">${m.emoji || '🏚️'}</div>
       <div class="bo-title">${blaster.wave <= 1 ? 'NUGGETOWN HAS FALLEN' : (m.label || 'CITY DOWN')}</div>
       <div class="bo-stat">held ${blaster.wave} wave${blaster.wave === 1 ? '' : 's'}</div>
       <div class="bo-best">best (${blaster.cfg.name}) · ${best}</div>
       <div class="bo-go">fire to defend again · switch to quit</div>
     </div>`;
  over.classList.add('on');
}
function hideBlasterOver() { const o = document.getElementById('blasterOver'); if (o) o.classList.remove('on'); }

function restartBlaster() {
  hideBlasterOver();
  clearEnemies(); clearBolts(); clearDrops();
  buildCity();
  lastStreakLevel = 0;
  startBlaster();
}

// ---- Input ---------------------------------------------------------------------

window.addEventListener('mousemove', (e) => { if (!blasterActive() || blaster.phase === 'tier') return; blaster.x = clampCannonX(e.clientX); positionCannon(); });
window.addEventListener('mousedown', (e) => {
  if (!blasterActive() || blaster.phase === 'tier') return;
  if (e.target.closest('.storm-hud') || e.target.closest('.ak-tier')) return;
  if (blaster.phase === 'over') { restartBlaster(); return; }
  blaster.firing = true; if (blaster.cooldown <= 0) fireBolt();
});
window.addEventListener('mouseup', () => { blaster.firing = false; });
window.addEventListener('touchstart', (e) => {
  if (!blasterActive() || blaster.phase === 'tier') return;
  if (e.target.closest('.storm-hud') || e.target.closest('.ak-tier')) return;
  if (blaster.phase === 'over') { restartBlaster(); e.preventDefault(); return; }
  blaster.x = clampCannonX(e.touches[0].clientX); positionCannon();
  blaster.firing = true; if (blaster.cooldown <= 0) fireBolt();
  e.preventDefault();
}, { passive: false });
window.addEventListener('touchmove', (e) => { if (!blasterActive() || blaster.phase === 'tier') return; blaster.x = clampCannonX(e.touches[0].clientX); positionCannon(); e.preventDefault(); }, { passive: false });
window.addEventListener('touchend', (e) => { if (e.touches.length === 0) blaster.firing = false; });
window.addEventListener('keydown', (e) => {
  if (!blasterActive() || blaster.phase === 'tier') return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'ArrowLeft') { blaster.keys.left = true; e.preventDefault(); }
  else if (e.code === 'ArrowRight') { blaster.keys.right = true; e.preventDefault(); }
  else if (e.code === 'Space') {
    if (blaster.phase === 'over') { restartBlaster(); e.preventDefault(); return; }
    blaster.firing = true; if (blaster.cooldown <= 0) fireBolt(); e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft') blaster.keys.left = false;
  else if (e.code === 'ArrowRight') blaster.keys.right = false;
  else if (e.code === 'Space') blaster.firing = false;
});

// Test/debug hook.
window.blasterDebug = function (opts) {
  opts = opts || {};
  if (opts.tier) blaster.cfg = BLASTER_TIERS.find((t) => t.key === opts.tier) || blaster.cfg;
  if (opts.pick && blaster.tierPick) { blaster.tierPick.close(); blaster.tierPick = null; startBlaster(); }
  if (opts.wave != null) { blaster.wave = opts.wave - 1; nextWave(); }
  if (opts.spawn) spawnEnemy(opts.spawn, opts.at, 40);
  if (opts.killAll) { for (let i = blaster.enemies.length - 1; i >= 0; i--) destroyEnemy(i, true); }
  if (opts.bossHit && blaster.boss) { blaster.boss.hp -= (opts.bossHit === true ? 999 : opts.bossHit); updateBossBar(); if (blaster.boss.hp <= 0) bossDefeated(); }
  if (opts.cityDown) { blaster.city.forEach((b) => { b.hp = 0; b.el.classList.add('rubble'); }); cityDown(); }
  return { phase: blaster.phase, wave: blaster.wave, enemies: blaster.enemies.length,
    boss: blaster.boss ? blaster.boss.hp : null, city: blaster.city.filter((c) => c.hp > 0).length,
    streak: blaster.streak ? blaster.streak.level : 0, held: blasterHeld() };
};

// ---- exports: only the seams storm.js / arcade.js / tests reach for --------------
window.syncBlaster = syncBlaster;
window.stepBlaster = stepBlaster;
window.blasterTally = blasterTally;
window.blasterActive = blasterActive;
window.blasterHeld = blasterHeld;
window.blaster = blaster;
return null;
})();
