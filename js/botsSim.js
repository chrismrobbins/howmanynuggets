// ---- 🤖 BATTEREDBOTS — the shared simulation ---------------------------------------
// "LAST BOT ROLLING."
//
// ONE physics, THREE jobs. This file is the whole rulebook for BatteredBots
// (game 17, mode `bots`): chassis, ram physics, specials, the six sauces, the
// twelve pit-stop boons, the arena hazards, the AI drivers, and the round /
// match flow. It runs in three places without changing a line:
//
//   1. single-player, in the browser, as the authority (js/bots.js)
//   2. on the Cloudflare worker, in the GameRoom Durable Object, as the online
//      authority (worker/src/games/bots.js side-effect-imports this file)
//   3. in the browser again, online, predicting your own bot between server
//      snapshots (js/botsMP.js)
//
// The rules that make that work:
//   - NO DOM, NO clock, NO Math.random. Every random number comes from m.rng()
//     (a seeded mulberry32), so the same inputs make the same round anywhere,
//     which is also what makes the graphics harness's frames reproducible.
//   - It is a classic script (no import/export) that assigns globalThis.BotsSim.
//     The browser loads it with a <script> tag; the worker bundle imports it for
//     its side effect and reads globalThis.BotsSim.
//   - Everything the renderer needs to SHOW (sparks, hits, KOs, flips, pickups)
//     is pushed to m.events during a step and drained by the caller. The sim
//     never draws and never plays a sound.
//
// Coordinates: the world is 640×360 units, +x right, +y DOWN (screen space),
// headings in radians with 0 = +x. Bots are circles for collision (C.r) and
// nose-up sprites rotated by heading + π/2 for drawing (GTN convention).
//
// Prefix rule: this file owns exactly one global, BotsSim.
(function (global) {
  'use strict';

  const W = 640, H = 360;
  const TAU = Math.PI * 2;
  const ROUND_SECS = 180;
  const HAZARDS_AT = 150;   // clock (seconds remaining) when the arena arms (0:30 in)
  const PIT_AT = 105;       // the drain opens (1:15 in)
  const SUDDEN_AT = 30;     // batter rot / the flood
  const DROP_SECS = 1.6;    // the crane drop before the buzzer
  const OVER_SECS = 3.2;    // KO / judges card
  const PITSTOP_SECS = 12;  // boon pick window
  const DRAG = 0.55;        // rolling resistance, /sec (GTN's number)
  const MAX_SHOTS = 160;
  const MAX_DEBRIS = 30;

  // ---- the roster ----------------------------------------------------------------
  // Speeds in units/sec, grip/drift in lateral-kill /sec, armor = fraction of
  // damage shrugged off, mass weights the push-out in collisions, turret is the
  // aim slew rate in rad/s. Numbers descend from GTA_CLASSES (js/gta.js) —
  // already tuned, already right — with mass as the one new term.
  const CLASSES = {
    dicer:  { key: 'dicer',  name: 'THE DICER',      wt: 'LIGHTWEIGHT · SPINNER',  maxFwd: 175, maxRev: 70, accel: 320, brake: 420, grip: 11.5, drift: 2.2, steer: 5.2, r: 11, L: 24, Wd: 14, hp: 120, armor: 0.00, mass: 1.0, turret: 3.8,
              special: 'SPIN-UP', blurb: 'hold to spin the disc. fast, fragile, terrifying.' },
    tender: { key: 'tender', name: 'THE TENDERIZER', wt: 'MIDDLEWEIGHT · FLIPPER', maxFwd: 150, maxRev: 60,  accel: 260, brake: 380, grip: 12.0, drift: 2.6, steer: 4.6, r: 12, L: 26, Wd: 16, hp: 160, armor: 0.10, mass: 1.4, turret: 3.2,
              special: 'FLIP',    blurb: 'tap to flip whatever is in front of you. aim it at the pit.' },
    brick:  { key: 'brick',  name: 'THE BRICK',      wt: 'HEAVYWEIGHT · WEDGE',    maxFwd: 130, maxRev: 50,  accel: 210, brake: 340, grip: 12.5, drift: 3.0, steer: 4.0, r: 13, L: 28, Wd: 18, hp: 220, armor: 0.25, mass: 2.0, turret: 2.6,
              special: 'SHOVE',   blurb: 'tap to charge. the wall does the damage.' },
  };
  const CLASS_KEYS = ['dicer', 'tender', 'brick'];

  // Team sauces — the PAINT tint. Index = seat.
  const TEAMS = [
    { key: 'bbq',     name: 'BBQ',           hex: '#e63b2e' },
    { key: 'mustard', name: 'HONEY MUSTARD', hex: '#f2b134' },
    { key: 'ranch',   name: 'RANCH',         hex: '#e8ecf0' },
    { key: 'buffalo', name: 'BUFFALO',       hex: '#ff7a1f' },
    { key: 'wasabi',  name: 'WASABI',        hex: '#7ac142' },
    { key: 'grape',   name: 'GRAPE',         hex: '#8a4de8' },
  ];

  // The condiment arsenal. No default gun: your special is what you always
  // have; everything else is on a pad. `ammo` is shots (flamer: ticks).
  const WEAPONS = {
    minigun: { key: 'minigun', name: 'HONEY-MUSTARD MINIGUN', icon: '🍯', cd: 0.08,  spd: 420, dmg: 3,  life: 0.6,  spread: 0.14, ammo: 40, col: [1, 0.82, 0.23] },
    flamer:  { key: 'flamer',  name: 'BBQ FLAMER',            icon: '🔥', cd: 0.045, spd: 190, dmg: 1,  life: 0.42, spread: 0.28, ammo: 60, col: [1, 0.54, 0.24], flame: true },
    mortar:  { key: 'mortar',  name: 'DIP MORTAR',            icon: '🥣', cd: 0.7,   spd: 0,   dmg: 24, life: 0,    spread: 0,    ammo: 4,  col: [0.87, 0.9, 0.92], lob: true, splash: 36, range: 220, flight: 0.8, puddle: 20 },
    rocket:  { key: 'rocket',  name: 'BUFFALO ROCKET',        icon: '🌶️', cd: 0.5,   spd: 260, dmg: 32, life: 2.5,  spread: 0,    ammo: 2,  col: [1, 0.35, 0.18], homing: 2.4, knock: 200, splash: 30 },
    emp:     { key: 'emp',     name: 'SWEET & SOUR EMP',      icon: '🍋', cd: 1.0,   spd: 0,   dmg: 0,  life: 0,    spread: 0,    ammo: 1,  col: [0.75, 1, 0.35], burst: 90, stun: 3.0 },
    nitro:   { key: 'nitro',   name: 'CHILI NITRO',           icon: '⚡', cd: 0,     spd: 0,   dmg: 0,  life: 0,    spread: 0,    ammo: 2,  col: [1, 0.3, 0.3], boost: true },
  };
  const WEAPON_KEYS = ['minigun', 'flamer', 'mortar', 'rocket', 'emp', 'nitro'];

  // 🔧 PIT STOP — pick one of three between rounds; stacks for the match.
  const BOONS = [
    { key: 'doubledip',   emoji: '🛡️', name: 'DOUBLE DIP',     desc: 'one more dip in the batter: −12% damage taken' },
    { key: 'flywheel',    emoji: '🌀', name: 'FLYWHEEL',       desc: 'your special charges 40% faster' },
    { key: 'magwheels',   emoji: '🧲', name: 'MAGWHEELS',      desc: "can't be shoved. can't be flipped." },
    { key: 'chililines',  emoji: '⚡', name: 'CHILI LINES',    desc: 'a nitro charge every 15 seconds' },
    { key: 'saucelock',   emoji: '🎯', name: 'SAUCE LOCK',     desc: 'rockets home harder, puddles grow' },
    { key: 'bigclip',     emoji: '🔋', name: 'BIG CLIP',       desc: 'pickups load +50% ammo' },
    { key: 'crumbcoat',   emoji: '🩹', name: 'CRUMB COAT',     desc: 'regrow 1 batter/s after 4 s unhit' },
    { key: 'loosebolts',  emoji: '🔩', name: 'LOOSE BOLTS',    desc: 'plates you shed cut anyone who rolls over them' },
    { key: 'ghostpepper', emoji: '👻', name: 'GHOST PEPPER',   desc: '0.3 s untouchable after any hit over 20' },
    { key: 'retardant',   emoji: '🧯', name: 'FIRE RETARDANT', desc: "can't burn. +50% flamer fuel. you love fire now." },
    { key: 'lowcenter',   emoji: '🏋️', name: 'LOW CENTER',     desc: '+30% mass, −10% top speed' },
    { key: 'telemetry',   emoji: '📡', name: 'TELEMETRY',      desc: 'see enemy batter and pad timers' },
  ];

  // League tiers (the arcade's standard pick screen). ai = driver level,
  // haz = hazard clock multiplier (lower = faster), mult = score multiplier.
  const TIERS = [
    { key: 'backyard', emoji: '🥉', name: 'BACKYARD LEAGUE',   mult: 1, ai: 0, haz: 1.25, blurb: 'lawn chairs and a garden hose. the bots are shy.' },
    { key: 'league',   emoji: '🥈', name: 'CLUCKED METAL',     mult: 2, ai: 1, haz: 1.0,  blurb: 'the invitational. the crowd is here. so are the hazards.' },
    { key: 'fryer',    emoji: '🥇', name: 'THE FRYER CIRCUIT', mult: 3, ai: 2, haz: 0.75, blurb: 'the hazards run hot and the drivers run mean.', lockNote: 'win a CLUCKED METAL match' },
  ];

  // ---- the arenas ----------------------------------------------------------------
  // All three share the wall box (the pit apron fills the margins). Geometry
  // here is the contract the floor pages are painted against — see
  // blender/BOTS_ART_CONTRACT.md before moving anything.
  const BOX = [52, 48, 588, 312];   // playable interior: x0 y0 x1 y1
  const STARTS = [[90, 80], [90, 280], [550, 80], [550, 280], [320, 62], [320, 298]];
  const PADS = [[180, 110], [460, 110], [180, 250], [460, 250], [320, 100], [320, 260]];
  const LAMPS = [[130, 75], [510, 75], [130, 285], [510, 285]];
  const ARENAS = {
    pit: {
      key: 'pit', name: 'THE GARAGE PIT', tag: 'under the Grease Garage',
      box: BOX, starts: STARTS, pads: PADS, lamps: LAMPS,
      pit: { x: 320, y: 180, r: 26 },
      slicers: [{ x: 200, side: 0 }, { x: 440, side: 0 }, { x: 200, side: 1 }, { x: 440, side: 1 }], // side 0 = top wall
      mallet: { px: 52, py: 180, hx: 84, hy: 180, r: 22 },
      baskets: null, slicks: null, water: false,
    },
    fryer: {
      key: 'fryer', name: 'THE FRYER', tag: 'between the vats',
      box: BOX, starts: STARTS, pads: PADS, lamps: LAMPS,
      pit: null, slicers: null, mallet: null,
      baskets: [{ x: 200, y: 180, r: 34 }, { x: 440, y: 180, r: 34 }, { x: 320, y: 300, r: 30 }],
      slicks: [{ x: 320, y: 180, r: 28, vx: 22, vy: 9 }, { x: 140, y: 100, r: 22, vx: -14, vy: 17 }, { x: 500, y: 260, r: 22, vx: 12, vy: -15 }],
      water: false,
    },
    sump: {
      key: 'sump', name: 'THE SUMP', tag: 'where the mains meet',
      box: BOX, starts: STARTS, pads: PADS, lamps: LAMPS,
      pit: { x: 320, y: 180, r: 26 },
      slicers: [{ x: 200, side: 0 }, { x: 440, side: 1 }],
      mallet: null, baskets: null, slicks: null,
      water: true,
    },
  };
  const ARENA_KEYS = ['pit', 'fryer', 'sump'];

  // ---- rng --------------------------------------------------------------------------
  function mulberry(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---- match construction -------------------------------------------------------
  // cfg: { arena, tier (key), seed, players: [{ id, name, cls, ai (false | 0..2) }] }
  function createMatch(cfg) {
    const tier = TIERS.find((t) => t.key === cfg.tier) || TIERS[1];
    const m = {
      arena: ARENAS[cfg.arena] ? cfg.arena : 'pit',
      tier: tier.key, mult: tier.mult, aiLevel: tier.ai, hazK: tier.haz,
      seed: (cfg.seed >>> 0) || 1, rng: null,
      t: 0, roundNum: 0, roundsToWin: cfg.roundsToWin || 2,
      phase: 'idle', phaseT: 0, clock: ROUND_SECS,
      bots: [], shots: [], pads: [], puddles: [], debris: [],
      hz: { slicers: [], mallet: { t: 0, struck: false }, pit: 0, baskets: [], slicks: [], water: 0, stormT: 0 },
      pitstop: null, winner: null, roundWinner: null, judges: false,
      events: [],
      nextId: 1,
    };
    m.rng = mulberry(m.seed);
    (cfg.players || []).slice(0, 6).forEach((p, i) => addBot(m, p, i));
    return m;
  }

  function addBot(m, p, seat) {
    const cls = CLASSES[p.cls] ? p.cls : CLASS_KEYS[seat % 3];
    const C = CLASSES[cls];
    const bot = {
      id: p.id != null ? p.id : 'b' + (m.nextId++),
      name: (p.name || C.name).slice(0, 14),
      cls, team: seat % TEAMS.length, seat,
      ai: p.ai === false || p.ai == null ? false : (p.ai === true ? m.aiLevel : p.ai),
      x: 0, y: 0, a: -Math.PI / 2, vx: 0, vy: 0, turret: -Math.PI / 2,
      hp: C.hp, hpMax: C.hp, alive: true, wreck: false, gone: false,
      air: 0, airT: 0, z: 0, flippedBy: null,
      spin: 0, spec: 0, specHeld: false, shove: 0, flipT: 0, squash: 0,
      stun: 0, burn: 0, burnBy: null, iframes: 0,
      nitro: 0, boostT: 0, nitroRegen: 0,
      weapon: null, cd: 0,
      boons: [], mods: {},
      score: 0, kos: 0, dmg: 0, roundDmg: 0, roundWins: 0,
      lastHitBy: null, lastHitT: -99, hitCd: {}, hazCd: 0, wallCd: 0, shovedBy: null, shovedT: 0,
      backing: false, spectating: !!p.spectating,
      ai_: { t: 0, jit: 0, tgt: null, wander: 0 },
    };
    m.bots.push(bot);
    return bot;
  }

  // Everyone rebuilds between rounds; boons persist, damage does not.
  function resetBot(m, bot, i) {
    const C = CLASSES[bot.cls];
    const A = ARENAS[m.arena];
    const s = A.starts[i % A.starts.length];
    bot.x = s[0]; bot.y = s[1];
    bot.a = Math.atan2(180 - bot.y, 320 - bot.x); // face the drain
    bot.turret = bot.a;
    bot.vx = bot.vy = 0;
    bot.hpMax = C.hp;
    bot.hp = bot.hpMax;
    bot.alive = true; bot.wreck = false; bot.gone = false;
    bot.air = 0; bot.airT = 0; bot.z = 0; bot.flippedBy = null;
    bot.spin = 0; bot.spec = 0; bot.specHeld = false; bot.shove = 0; bot.flipT = 0; bot.squash = 0;
    bot.stun = 0; bot.burn = 0; bot.burnBy = null; bot.iframes = 0;
    bot.boostT = 0;
    bot.weapon = null; bot.cd = 0;
    bot.roundDmg = 0;
    bot.lastHitBy = null; bot.lastHitT = -99; bot.hitCd = {}; bot.hazCd = 0; bot.wallCd = 0; bot.shovedBy = null; bot.shovedT = 0;
    bot.backing = false;
    bot.ai_ = { t: 0, jit: 0, tgt: null, wander: m.rng() * TAU };
    recomputeMods(bot);
  }

  function recomputeMods(bot) {
    const C = CLASSES[bot.cls];
    const has = (k) => bot.boons.indexOf(k) >= 0;
    bot.mods = {
      armor: clamp(C.armor + (has('doubledip') ? 0.12 : 0), 0, 0.6),
      special: has('flywheel') ? 1.4 : 1,
      mag: has('magwheels'),
      chili: has('chililines'),
      lock: has('saucelock'),
      clip: has('bigclip') ? 1.5 : 1,
      regen: has('crumbcoat'),
      bolts: has('loosebolts'),
      ghost: has('ghostpepper'),
      retardant: has('retardant'),
      mass: C.mass * (has('lowcenter') ? 1.3 : 1),
      speed: has('lowcenter') ? 0.9 : 1,
      telemetry: has('telemetry'),
    };
  }

  function startRound(m) {
    const A = ARENAS[m.arena];
    m.roundNum++;
    m.phase = 'drop'; m.phaseT = 0; m.clock = ROUND_SECS;
    m.shots.length = 0; m.puddles.length = 0; m.debris.length = 0;
    m.roundWinner = null; m.judges = false; m.pitstop = null;
    m.bots.forEach((b, i) => { if (!b.spectating) resetBot(m, b, i); else { b.alive = false; b.gone = true; } });
    // pads: two live at the buzzer, the rest stagger in
    const stagger = [3, 5, 9, 13, 17, 21];
    m.pads = A.pads.map((p, i) => ({ x: p[0], y: p[1], w: null, t: stagger[i] || 0, rot: i }));
    m.hz.slicers = (A.slicers || []).map((s, i) => ({ x: s.x, side: s.side, ph: i * 1.1, up: 0 }));
    m.hz.mallet = { t: 0, struck: false, arm: 0 };
    m.hz.pit = 0;
    m.hz.baskets = (A.baskets || []).map((b, i) => ({ x: b.x, y: b.y, r: b.r, ph: i * 2.0, st: 0, shadow: 0 }));
    m.hz.slicks = (A.slicks || []).map((s) => ({ x: s.x, y: s.y, r: s.r, vx: s.vx, vy: s.vy }));
    m.hz.water = 0; m.hz.stormT = 0;
    ev(m, { k: 'round', n: m.roundNum, arena: m.arena });
    m.bots.forEach((b) => { if (!b.spectating) ev(m, { k: 'drop', id: b.id, x: b.x, y: b.y }); });
  }

  function ev(m, e) { if (m.events.length < 400) m.events.push(e); }

  // ---- the step ---------------------------------------------------------------------
  // inputs: { [botId]: { dx, dy, ax, ay, ad, fire, spec, nitro, tank } }
  //   dx,dy  drive vector (−1..1); tank=true reads dy as throttle, dx as steer
  //   ax,ay  aim unit vector; ad = aim distance (mortar range)
  function step(m, inputs, dt) {
    dt = clamp(dt || 1 / 60, 0.001, 0.05);
    m.t += dt;
    inputs = inputs || {};

    if (m.phase === 'idle' || m.phase === 'done') return;

    if (m.phase === 'drop') {
      m.phaseT += dt;
      if (m.phaseT >= DROP_SECS) { m.phase = 'fight'; m.phaseT = 0; ev(m, { k: 'go' }); }
      return;
    }
    if (m.phase === 'over') {
      m.phaseT += dt;
      // wrecks still slide to a stop; particles in the client want that
      for (const b of m.bots) if (!b.alive && !b.gone) { b.vx *= Math.exp(-4 * dt); b.vy *= Math.exp(-4 * dt); b.x += b.vx * dt; b.y += b.vy * dt; }
      if (m.phaseT >= OVER_SECS) endRoundToNext(m);
      return;
    }
    if (m.phase === 'pitstop') {
      m.pitstop.t += dt;
      const need = m.bots.filter((b) => !b.spectating);
      const all = need.every((b) => m.pitstop.picked[b.id]);
      if (all || m.pitstop.t >= PITSTOP_SECS) {
        for (const b of need) if (!m.pitstop.picked[b.id]) pickBoon(m, b.id, m.pitstop.deals[b.id][0]);
        startRound(m);
      }
      return;
    }

    // ---- fight ----
    m.clock -= dt;
    stepHazardClock(m, dt);

    for (const b of m.bots) {
      if (!b.alive) continue;
      const inp = b.ai !== false ? aiInput(m, b, dt) : (inputs[b.id] || NULL_INPUT);
      stepBot(m, b, inp, dt);
    }
    stepShots(m, dt);
    collideBots(m, dt);
    stepHazards(m, dt);
    stepPads(m, dt);
    stepPuddles(m, dt);
    stepDebris(m, dt);
    for (const b of m.bots) if (b.alive) stepStatus(m, b, dt);

    // end of round?
    const alive = m.bots.filter((b) => b.alive);
    if (alive.length <= 1 || m.clock <= 0) {
      m.clock = Math.max(0, m.clock);
      let winner = null;
      if (alive.length === 1) winner = alive[0];
      else {
        // judges' decision: most damage dealt this round; tie → most batter left
        const pool = m.bots.filter((b) => !b.spectating);
        pool.sort((p, q) => (q.roundDmg - p.roundDmg) || (q.hp - p.hp) || (p.seat - q.seat));
        winner = pool[0] || null;
        m.judges = alive.length > 1;
      }
      m.roundWinner = winner ? winner.id : null;
      if (winner) { winner.roundWins++; winner.score += 2000; }
      for (const b of alive) if (b !== winner) b.score += 300;
      m.phase = 'over'; m.phaseT = 0;
      ev(m, { k: 'roundover', winner: m.roundWinner, judges: m.judges, ko: alive.length <= 1 });
    }
  }
  const NULL_INPUT = { dx: 0, dy: 0, ax: 1, ay: 0, ad: 0, fire: false, spec: false, nitro: false };

  function endRoundToNext(m) {
    const champ = m.bots.find((b) => b.roundWins >= m.roundsToWin);
    if (champ) {
      champ.score += 5000;
      m.winner = champ.id;
      m.phase = 'done'; m.phaseT = 0;
      ev(m, { k: 'matchover', winner: champ.id, arena: m.arena });
      return;
    }
    // 🔧 PIT STOP
    m.phase = 'pitstop'; m.phaseT = 0;
    m.pitstop = { t: 0, deals: {}, picked: {} };
    for (const b of m.bots) {
      if (b.spectating) continue;
      const pool = BOONS.map((x) => x.key).filter((k) => b.boons.indexOf(k) < 0);
      const deal = [];
      while (deal.length < 3 && pool.length) deal.push(pool.splice(Math.floor(m.rng() * pool.length), 1)[0]);
      m.pitstop.deals[b.id] = deal;
      if (b.ai !== false) pickBoon(m, b.id, deal[Math.floor(m.rng() * deal.length)]);
    }
    ev(m, { k: 'pitstop' });
  }

  function pickBoon(m, botId, key) {
    if (!m.pitstop || m.pitstop.picked[botId]) return false;
    const deal = m.pitstop.deals[botId];
    if (!deal || deal.indexOf(key) < 0) return false;
    const b = m.bots.find((x) => x.id === botId);
    if (!b) return false;
    b.boons.push(key);
    recomputeMods(b);
    if (key === 'chililines') b.nitro = Math.min(4, b.nitro + 1);
    m.pitstop.picked[botId] = key;
    ev(m, { k: 'boon', id: botId, key });
    return true;
  }

  // ---- bot physics (the GTN car, with mass and a pivot) ----------------------------
  function stepBot(m, b, inp, dt) {
    const C = CLASSES[b.cls];
    const A = ARENAS[m.arena];
    const cos = Math.cos(b.a), sin = Math.sin(b.a);
    let vf = b.vx * cos + b.vy * sin;
    let vl = -b.vx * sin + b.vy * cos;

    // airborne: no control, less drag, no walls-of-bots; you land where physics says
    if (b.air > 0) {
      b.air -= dt;
      const p = 1 - b.air / b.airT;
      b.z = Math.sin(Math.PI * clamp(p, 0, 1)) * 18;
      b.vx *= Math.exp(-0.2 * dt); b.vy *= Math.exp(-0.2 * dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.a += 2.2 * dt; // tumbling
      wallsSoft(m, b);
      if (b.air <= 0) {
        b.air = 0; b.z = 0;
        ev(m, { k: 'land', id: b.id, x: b.x, y: b.y });
        damage(m, b, 12, b.flippedBy, 'flip', b.x, b.y);
        if (b.alive && A.pit && m.hz.pit >= 0.6 && Math.hypot(b.x - A.pit.x, b.y - A.pit.y) < A.pit.r) pitFall(m, b);
      }
      return;
    }

    // input → gas / rev / steer (two schemes, one physics)
    let gas = 0, rev = 0, steer = 0;
    const stunned = b.stun > 0;
    if (inp.tank) {
      gas = clamp(-inp.dy, 0, 1); rev = clamp(inp.dy, 0, 1); steer = clamp(inp.dx, -1, 1);
      b.backing = false;
    } else {
      const mag = Math.hypot(inp.dx || 0, inp.dy || 0);
      if (mag > 0.25) {
        // hold where you want to GO. The bot always TURNS toward it (an arena is
        // too small for GTN's back-out-and-come-around), brakes if it is going
        // fast the wrong way, and only puts power down once roughly facing it.
        const want = Math.atan2(inp.dy, inp.dx);
        const da = wrap(want - b.a);
        const off = Math.abs(da);
        steer = clamp(da * 3.0, -1, 1);
        if (off > 2.0 && vf > 40) rev = 1;
        else if (off < 1.25) gas = clamp(mag, 0, 1) * (off < 0.6 ? 1 : 0.55);
        b.backing = false;
      } else b.backing = false;
    }

    // speed budget: spin bleeds it, nitro pours it on, water drags on it
    const boost = b.boostT > 0 ? 1.6 : 1;
    const spinK = b.cls === 'dicer' ? (1 - 0.25 * b.spin) : 1;
    const waterK = 1 - 0.35 * m.hz.water;
    const maxF = C.maxFwd * b.mods.speed * spinK * boost * waterK;
    const acc = C.accel * boost * waterK * (inPuddle(m, b) ? 0.5 : 1);
    if (gas) vf = Math.min(maxF, vf + acc * gas * dt);
    if (rev) {
      if (vf > 8) vf = Math.max(0, vf - C.brake * dt);
      else vf = Math.max(-C.maxRev, vf - acc * 0.7 * dt);
    }
    // shove: a 0.6 s charge, forward, unstoppable
    if (b.shove > 0) { b.shove -= dt; vf = Math.max(vf, maxF * 1.15); }
    vf *= Math.exp(-DRAG * dt);
    const gripK = (inPuddle(m, b) ? 0.15 : 1) * (1 - 0.4 * m.hz.water);
    vl *= Math.exp(-C.grip * gripK * dt);

    // steering: speed-scaled like a car, but a tracked bot can pivot
    const sf = Math.sign(vf || 1) * Math.max(0.85, Math.min(1, Math.abs(vf) / 60));
    b.a += steer * C.steer * sf * dt;

    const c2 = Math.cos(b.a), s2 = Math.sin(b.a);
    b.vx = c2 * vf - s2 * vl;
    b.vy = s2 * vf + c2 * vl;
    if (Math.abs(vl) > 26 && m.rng() < dt * 30) ev(m, { k: 'skid', x: b.x - c2 * 6, y: b.y - s2 * 6, a: b.a });

    // move + walls (axis separated, GTN-honest)
    moveWithWalls(m, b, dt);

    // turret slews toward the aim
    if (inp.ax || inp.ay) {
      const want = Math.atan2(inp.ay, inp.ax);
      const da = wrap(want - b.turret);
      const rate = C.turret * (b.ai !== false ? 0.7 : 1.6);
      b.turret += clamp(da, -rate * dt, rate * dt);
    }

    // ---- special ----
    const specEdge = !!inp.spec && !b.specHeld;
    b.specHeld = !!inp.spec;
    if (b.spec > 0) b.spec -= dt;
    if (b.cls === 'dicer') {
      if (inp.spec && !stunned) b.spin = Math.min(1, b.spin + dt / 1.8 * b.mods.special);
      else b.spin = Math.max(0, b.spin - dt * (0.25 + 0.6 * m.hz.water));
      if (stunned) b.spin = 0;
    } else if (b.cls === 'tender') {
      if (b.flipT > 0) b.flipT -= dt;
      if (specEdge && b.spec <= 0 && !stunned) {
        b.spec = 2.5 / b.mods.special;
        b.flipT = 0.25;
        let hit = false;
        for (const o of m.bots) {
          if (o === b || !o.alive || o.air > 0) continue;
          const d = Math.hypot(o.x - b.x, o.y - b.y);
          if (d > C.r + CLASSES[o.cls].r + 12) continue;
          const ang = Math.abs(wrap(Math.atan2(o.y - b.y, o.x - b.x) - b.a));
          if (ang > 0.75) continue;
          if (o.mods.mag) { ev(m, { k: 'clank', x: o.x, y: o.y }); continue; }
          if (o.shove > 0) continue; // a charging brick does not leave the ground
          o.air = 0.9; o.airT = 0.9; o.flippedBy = b;
          o.vx += c2 * 90; o.vy += s2 * 90;
          o.spin *= 0.3;
          hit = true;
          ev(m, { k: 'flip', id: o.id, by: b.id, x: o.x, y: o.y });
        }
        b.vx -= c2 * 30; b.vy -= s2 * 30;
        if (!hit) ev(m, { k: 'whiff', x: b.x + c2 * 14, y: b.y + s2 * 14 });
      }
    } else if (b.cls === 'brick') {
      if (specEdge && b.spec <= 0 && !stunned) {
        b.spec = 3.0 / b.mods.special;
        b.shove = 0.6 * b.mods.special;
        b.vx += c2 * 140; b.vy += s2 * 140;
        ev(m, { k: 'shove', id: b.id, x: b.x, y: b.y });
      }
    }

    // ---- nitro ----
    if (b.boostT > 0) {
      b.boostT -= dt;
      if (m.rng() < dt * 22) ev(m, { k: 'fire', x: b.x - c2 * (C.L * 0.5 + 2), y: b.y - s2 * (C.L * 0.5 + 2) });
    } else if (inp.nitro && b.nitro > 0 && !stunned) {
      b.nitro--; b.boostT = 1.2;
      ev(m, { k: 'boost', id: b.id, x: b.x, y: b.y });
    }

    // ---- fire ----
    if (b.cd > 0) b.cd -= dt;
    if (inp.fire && b.weapon && b.weapon.ammo > 0 && b.cd <= 0 && !stunned) fireWeapon(m, b, inp);
  }

  function inPuddle(m, b) {
    for (const p of m.puddles) if (Math.hypot(b.x - p.x, b.y - p.y) < p.r) return true;
    for (const s of m.hz.slicks) if (Math.hypot(b.x - s.x, b.y - s.y) < s.r) return true;
    return false;
  }

  function moveWithWalls(m, b, dt) {
    const C = CLASSES[b.cls];
    const box = ARENAS[m.arena].box;
    if (b.wallCd > 0) b.wallCd -= dt;
    const nx = b.x + b.vx * dt;
    if (nx - C.r < box[0] || nx + C.r > box[2]) {
      const impact = Math.abs(b.vx);
      b.x = nx - C.r < box[0] ? box[0] + C.r : box[2] - C.r;
      b.vx *= -0.22;
      wallHit(m, b, impact, b.x + (nx < 320 ? -C.r : C.r), b.y);
    } else b.x = nx;
    const ny = b.y + b.vy * dt;
    if (ny - C.r < box[1] || ny + C.r > box[3]) {
      const impact = Math.abs(b.vy);
      b.y = ny - C.r < box[1] ? box[1] + C.r : box[3] - C.r;
      b.vy *= -0.22;
      wallHit(m, b, impact, b.x, b.y + (ny < 180 ? -C.r : C.r));
    } else b.y = ny;
  }
  function wallsSoft(m, b) {
    const C = CLASSES[b.cls];
    const box = ARENAS[m.arena].box;
    if (b.x - C.r < box[0]) { b.x = box[0] + C.r; b.vx = Math.abs(b.vx) * 0.5; }
    if (b.x + C.r > box[2]) { b.x = box[2] - C.r; b.vx = -Math.abs(b.vx) * 0.5; }
    if (b.y - C.r < box[1]) { b.y = box[1] + C.r; b.vy = Math.abs(b.vy) * 0.5; }
    if (b.y + C.r > box[3]) { b.y = box[3] - C.r; b.vy = -Math.abs(b.vy) * 0.5; }
  }
  function wallHit(m, b, impact, x, y) {
    if (impact < 45 || b.wallCd > 0) return;
    b.wallCd = 0.25;
    ev(m, { k: 'wall', x, y, impact });
    // shoved into the wall: the shover gets the credit and the victim the bill
    if (b.shovedBy && b.shovedT > 0) {
      damage(m, b, Math.min(28, Math.max(4, (impact - 45) * 0.1)), b.shovedBy, 'shove', x, y);
    } else if (impact > 110) {
      damage(m, b, Math.min(14, (impact - 110) * 0.1), null, 'wall', x, y);
    }
  }

  // ---- weapons -------------------------------------------------------------------------
  function fireWeapon(m, b, inp) {
    const w = WEAPONS[b.weapon.key];
    const ta = b.turret;
    const mx = b.x + Math.cos(ta) * 14, my = b.y + Math.sin(ta) * 14;
    b.cd = w.cd;
    if (w.burst) {
      b.weapon.ammo--;
      ev(m, { k: 'emp', x: b.x, y: b.y, r: w.burst, id: b.id });
      for (const o of m.bots) {
        if (o === b || !o.alive) continue;
        if (Math.hypot(o.x - b.x, o.y - b.y) > w.burst) continue;
        o.stun = Math.max(o.stun, w.stun); o.spin = 0; o.shove = 0;
        ev(m, { k: 'stunned', id: o.id, x: o.x, y: o.y });
      }
      if (b.weapon.ammo <= 0) b.weapon = null;
      return;
    }
    if (w.lob) {
      b.weapon.ammo--;
      const range = clamp(inp.ad || w.range, 60, w.range);
      const tx = clamp(b.x + Math.cos(ta) * range, ARENAS[m.arena].box[0], ARENAS[m.arena].box[2]);
      const ty = clamp(b.y + Math.sin(ta) * range, ARENAS[m.arena].box[1], ARENAS[m.arena].box[3]);
      pushShot(m, { x: mx, y: my, vx: 0, vy: 0, a: ta, w: 'mortar', owner: b.id, life: w.flight, x0: mx, y0: my, tx, ty, T: w.flight, t: 0 });
      ev(m, { k: 'shot', x: mx, y: my, a: ta, w: 'mortar', id: b.id });
      if (b.weapon.ammo <= 0) b.weapon = null;
      return;
    }
    b.weapon.ammo--;
    const spread = (m.rng() - 0.5) * 2 * w.spread;
    const a = ta + spread;
    const spd = w.spd * (w.flame ? 0.8 + 0.4 * m.rng() : 1);
    pushShot(m, { x: mx, y: my, vx: Math.cos(a) * spd + b.vx * 0.3, vy: Math.sin(a) * spd + b.vy * 0.3, a, w: w.key, owner: b.id, life: w.life, target: null });
    ev(m, { k: 'shot', x: mx, y: my, a, w: w.key, id: b.id });
    if (b.weapon.ammo <= 0) { ev(m, { k: 'empty', id: b.id }); b.weapon = null; }
  }
  function pushShot(m, s) { if (m.shots.length < MAX_SHOTS) m.shots.push(s); }

  function stepShots(m, dt) {
    const A = ARENAS[m.arena];
    const box = A.box;
    for (let i = m.shots.length - 1; i >= 0; i--) {
      const s = m.shots[i];
      const w = WEAPONS[s.w];
      const owner = m.bots.find((b) => b.id === s.owner);
      if (w.lob) {
        s.t += dt;
        const p = clamp(s.t / s.T, 0, 1);
        s.x = lerp(s.x0, s.tx, p); s.y = lerp(s.y0, s.ty, p);
        s.z = Math.sin(Math.PI * p) * 40;
        if (p >= 1) {
          splash(m, s.x, s.y, w.splash, w.dmg, owner, 'mortar');
          const pr = w.puddle * (owner && owner.mods.lock ? 1.4 : 1);
          m.puddles.push({ x: s.x, y: s.y, r: pr, t: 8 });
          ev(m, { k: 'splash', x: s.x, y: s.y, w: 'mortar', r: pr });
          m.shots.splice(i, 1);
        }
        continue;
      }
      if (w.homing) {
        // pick / keep a target in the front cone, then turn toward it
        if (!s.target || !s.target.alive) {
          let best = null, bd = 1e9;
          for (const o of m.bots) {
            if (!o.alive || o.id === s.owner) continue;
            const d = Math.hypot(o.x - s.x, o.y - s.y);
            const ang = Math.abs(wrap(Math.atan2(o.y - s.y, o.x - s.x) - s.a));
            if (ang < 1.1 && d < bd) { bd = d; best = o; }
          }
          s.target = best;
        }
        if (s.target) {
          const want = Math.atan2(s.target.y - s.y, s.target.x - s.x);
          const rate = w.homing * (owner && owner.mods.lock ? 1.5 : 1);
          s.a += clamp(wrap(want - s.a), -rate * dt, rate * dt);
          s.vx = Math.cos(s.a) * w.spd; s.vy = Math.sin(s.a) * w.spd;
        }
        if (m.rng() < dt * 40) ev(m, { k: 'trail', x: s.x, y: s.y, w: 'rocket' });
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) { m.shots.splice(i, 1); continue; }
      if (s.x < box[0] || s.x > box[2] || s.y < box[1] || s.y > box[3]) {
        if (w.splash) splash(m, clamp(s.x, box[0], box[2]), clamp(s.y, box[1], box[3]), w.splash, w.dmg, owner, 'rocket');
        else if (!w.flame) ev(m, { k: 'spark', x: clamp(s.x, box[0], box[2]), y: clamp(s.y, box[1], box[3]), n: 3 });
        m.shots.splice(i, 1); continue;
      }
      let hit = null;
      for (const o of m.bots) {
        if (!o.alive || o.id === s.owner || o.air > 0) continue;
        if (Math.hypot(o.x - s.x, o.y - s.y) < CLASSES[o.cls].r + 2) { hit = o; break; }
      }
      if (hit) {
        if (w.splash) {
          splash(m, s.x, s.y, w.splash, w.dmg, owner, 'rocket');
          const nx = s.vx / (Math.hypot(s.vx, s.vy) || 1), ny = s.vy / (Math.hypot(s.vx, s.vy) || 1);
          if (!hit.mods.mag) { hit.vx += nx * w.knock / hit.mods.mass; hit.vy += ny * w.knock / hit.mods.mass; }
        } else {
          damage(m, hit, w.dmg, owner, s.w, s.x, s.y);
          if (w.flame && !hit.mods.retardant) { hit.burn = Math.max(hit.burn, 3); hit.burnBy = owner; }
        }
        m.shots.splice(i, 1);
      }
    }
  }

  function splash(m, x, y, r, dmg, by, cause) {
    ev(m, { k: 'boom', x, y, r, w: cause });
    for (const o of m.bots) {
      if (!o.alive) continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d > r + CLASSES[o.cls].r) continue;
      const k = clamp(1 - (d - CLASSES[o.cls].r) / r, 0.35, 1);
      damage(m, o, dmg * k, by, cause, o.x, o.y);
    }
  }

  // ---- damage & death -----------------------------------------------------------------
  function damage(m, v, amount, by, cause, x, y) {
    if (!v.alive || amount <= 0) return 0;
    if (v.iframes > 0 && cause !== 'rot' && cause !== 'flood') return 0;
    if (by === v) by = null;
    const raw = cause === 'rot' || cause === 'flood' || cause === 'pit' ? amount : amount * (1 - v.mods.armor);
    v.hp -= raw;
    v.lastHitT = m.t;
    if (by) { v.lastHitBy = by.id; by.dmg += raw; by.roundDmg += raw; by.score += raw; }
    if (v.mods.ghost && raw >= 20) v.iframes = 0.3;
    if (v.mods.bolts && raw >= 10 && m.debris.length < MAX_DEBRIS) m.debris.push({ x: v.x + (m.rng() - 0.5) * 16, y: v.y + (m.rng() - 0.5) * 16, owner: v.id, t: 40, a: m.rng() * TAU });
    ev(m, { k: 'hit', id: v.id, by: by ? by.id : null, x, y, dmg: raw, cause, hp: v.hp / v.hpMax });
    if (v.hp <= 0) ko(m, v, by, cause);
    return raw;
  }

  function ko(m, v, by, cause) {
    v.hp = 0; v.alive = false; v.wreck = true;
    v.spin = 0; v.shove = 0; v.burn = 0; v.stun = 0;
    if (by) { by.kos++; by.score += 1000 + (cause === 'pit' || cause === 'hazard' || cause === 'shove' ? 500 : 0); }
    ev(m, { k: 'ko', id: v.id, by: by ? by.id : null, x: v.x, y: v.y, cause });
  }

  function pitFall(m, v) {
    const by = v.lastHitBy && m.t - v.lastHitT < 4 ? m.bots.find((b) => b.id === v.lastHitBy) : null;
    ev(m, { k: 'pit', id: v.id, x: v.x, y: v.y });
    ko(m, v, by, 'pit');
    v.gone = true; // down the drain. the pipes have it now.
  }

  // ---- bot vs bot -------------------------------------------------------------------------
  function collideBots(m, dt) {
    const bs = m.bots;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (a.gone || a.air > 0) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (b.gone || b.air > 0) continue;
        const ra = CLASSES[a.cls].r, rb = CLASSES[b.cls].r;
        const rr = ra + rb;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d, ny = dy / d;
        const ma = a.alive ? a.mods.mass * (a.shove > 0 ? 1.6 : 1) : 3;
        const mb = b.alive ? b.mods.mass * (b.shove > 0 ? 1.6 : 1) : 3;
        const tot = ma + mb;
        const pen = rr - d;
        a.x -= nx * pen * (mb / tot); a.y -= ny * pen * (mb / tot);
        b.x += nx * pen * (ma / tot); b.y += ny * pen * (ma / tot);
        // relative normal velocity (closing speed)
        const rvx = a.vx - b.vx, rvy = a.vy - b.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn > 0) {
          // elastic-ish exchange weighted by mass, GTN's 1.25 bounce
          const imp = vn * 1.25;
          a.vx -= nx * imp * (mb / tot); a.vy -= ny * imp * (mb / tot);
          b.vx += nx * imp * (ma / tot); b.vy += ny * imp * (ma / tot);
        }
        const impact = Math.max(0, vn);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        if (!a.alive || !b.alive) { if (impact > 60) ev(m, { k: 'spark', x: cx, y: cy, n: 3 }); continue; }
        // ram damage: lighter bot takes the bigger share
        if (impact > 60 && !(a.hitCd[b.id] > m.t)) {
          a.hitCd[b.id] = b.hitCd[a.id] = m.t + 0.4;
          const dmg = Math.min(12, (impact - 45) * 0.04);
          damage(m, a, dmg * 2 * (mb / tot), b, 'ram', cx, cy);
          damage(m, b, dmg * 2 * (ma / tot), a, 'ram', cx, cy);
          ev(m, { k: 'spark', x: cx, y: cy, n: 5 + Math.floor(impact / 40) });
        }
        // the spinner: energy stored in the disc comes out on contact
        spinnerHit(m, a, b, nx, ny, cx, cy);
        spinnerHit(m, b, a, -nx, -ny, cx, cy);
        // the shove: whatever the brick hits goes where the brick was going
        shoveHit(m, a, b, nx, ny);
        shoveHit(m, b, a, -nx, -ny);
      }
    }
  }

  function spinnerHit(m, a, v, nx, ny, cx, cy) {
    if (a.cls !== 'dicer' || a.spin < 0.2) return;
    if (a.hitCd['s' + v.id] > m.t) return;
    a.hitCd['s' + v.id] = m.t + 1.0;
    // the disc is on the NOSE: the contact has to be in front of the dicer
    const ang = Math.abs(wrap(Math.atan2(ny, nx) - a.a));
    if (ang > 1.0) return;
    // a wedge gets under it: hitting the brick's front face costs the dicer
    let self = 0;
    if (v.cls === 'brick') {
      const face = Math.abs(wrap(Math.atan2(-ny, -nx) - v.a));
      if (face < 0.7) self = 0.6;
    }
    const dmg = 6 + 14 * a.spin;
    const throwK = 120 * a.spin;
    if (!v.mods.mag) { v.vx += nx * throwK / v.mods.mass; v.vy += ny * throwK / v.mods.mass; }
    a.vx -= nx * 80 * a.spin; a.vy -= ny * 80 * a.spin;
    if (self > 0) {
      damage(m, a, dmg * self, null, 'wedge', cx, cy);
      damage(m, v, dmg * 0.3, a, 'spinner', cx, cy);
      a.spin *= 0.2;
      ev(m, { k: 'spark', x: cx, y: cy, n: 14, big: true });
    } else {
      damage(m, v, dmg, a, 'spinner', cx, cy);
      a.spin *= 0.4;
      ev(m, { k: 'spark', x: cx, y: cy, n: 18, big: true });
    }
    ev(m, { k: 'spinhit', x: cx, y: cy, id: v.id });
  }

  function shoveHit(m, a, v, nx, ny) {
    if (a.shove <= 0 || v.mods.mag) return;
    if (a.hitCd['h' + v.id] > m.t) return;
    a.hitCd['h' + v.id] = m.t + 0.4;
    v.vx += nx * 260 / v.mods.mass; v.vy += ny * 260 / v.mods.mass;
    v.shovedBy = a; v.shovedT = 0.6;
    ev(m, { k: 'shoved', id: v.id, by: a.id, x: v.x, y: v.y });
  }

  // ---- hazards ------------------------------------------------------------------------------
  function stepHazardClock(m, dt) {
    const A = ARENAS[m.arena];
    if (A.pit && m.clock <= PIT_AT && m.hz.pit < 1) {
      if (m.hz.pit === 0) ev(m, { k: 'pitopen' });
      m.hz.pit = Math.min(1, m.hz.pit + dt / 1.5);
    }
    if (A.water) {
      // 1:00 → 0:30 knee-deep, 0:30 → 0:00 flooded; the storm passes at 0:10
      const target = m.clock > PIT_AT ? 0 : m.clock > SUDDEN_AT ? (PIT_AT - m.clock) / (PIT_AT - SUDDEN_AT) * 0.5 : 0.5 + (SUDDEN_AT - m.clock) / SUDDEN_AT * 0.5;
      m.hz.water = clamp(Math.max(m.hz.water, target), 0, 1);
      if (m.clock <= 10 && m.hz.stormT === 0) { m.hz.stormT = 0.001; ev(m, { k: 'storm' }); }
      if (m.hz.stormT > 0) m.hz.stormT += dt;
    }
    if (m.clock <= HAZARDS_AT && !m.hz.armed) { m.hz.armed = true; ev(m, { k: 'armed' }); }
    if (m.clock <= SUDDEN_AT && !m.hz.sudden) { m.hz.sudden = true; ev(m, { k: 'sudden', flood: !!A.water }); }
    if (m.clock > HAZARDS_AT) m.hz.armed = false;
    if (m.clock > SUDDEN_AT) m.hz.sudden = false;
  }

  function stepHazards(m, dt) {
    const A = ARENAS[m.arena];
    const armed = m.clock <= HAZARDS_AT;
    const box = A.box;
    // slicers: pop out of the wall on a cycle
    for (const s of m.hz.slicers) {
      const period = 4.0 * m.hazK;
      s.ph += dt;
      const cyc = s.ph % period;
      const wasUp = s.up;
      s.up = armed ? (cyc < 0.25 ? cyc / 0.25 : cyc < 1.1 ? 1 : cyc < 1.4 ? (1.4 - cyc) / 0.3 : 0) : 0;
      if (s.up === 1 && wasUp < 1) ev(m, { k: 'slice', x: s.x, y: s.side ? box[3] : box[1] });
      if (s.up < 0.5) continue;
      const y0 = s.side ? box[3] - 22 * s.up : box[1], y1 = s.side ? box[3] : box[1] + 22 * s.up;
      for (const b of m.bots) {
        if (!b.alive || b.air > 0 || b.hazCd > 0) continue;
        const r = CLASSES[b.cls].r;
        if (b.x + r < s.x - 26 || b.x - r > s.x + 26 || b.y + r < y0 || b.y - r > y1) continue;
        b.hazCd = 0.5;
        b.vy += s.side ? -150 : 150;
        damage(m, b, 10, hazardCredit(m, b), 'hazard', b.x, s.side ? box[3] : box[1]);
        ev(m, { k: 'spark', x: b.x, y: s.side ? box[3] : box[1], n: 10, big: true });
      }
    }
    // the mallet: a telegraph, then a strike
    if (A.mallet && armed) {
      const M = m.hz.mallet, period = 5.0 * m.hazK;
      M.t += dt;
      const cyc = M.t % period;
      M.arm = cyc < 0.6 ? cyc / 0.6 : cyc < 0.7 ? 1 : cyc < 1.5 ? 1 - (cyc - 0.7) / 0.8 : 0; // 0 rest, 1 raised, then down
      M.down = cyc >= 0.6 && cyc < 1.4;
      if (cyc >= 0.6 && !M.struck) {
        M.struck = true;
        ev(m, { k: 'slam', x: A.mallet.hx, y: A.mallet.hy, r: A.mallet.r });
        for (const b of m.bots) {
          if (!b.alive || b.air > 0) continue;
          if (Math.hypot(b.x - A.mallet.hx, b.y - A.mallet.hy) > A.mallet.r + CLASSES[b.cls].r * 0.5) continue;
          b.vx = 0; b.vy = 0; b.squash = 0.35; b.spin = 0;
          damage(m, b, 22, hazardCredit(m, b), 'hazard', b.x, b.y);
        }
      }
      if (cyc < 0.6) M.struck = false;
    }
    // THE PIT
    if (A.pit && m.hz.pit >= 0.6) {
      for (const b of m.bots) {
        if (b.gone || b.air > 0) continue;
        const d = Math.hypot(b.x - A.pit.x, b.y - A.pit.y);
        if (b.alive) {
          if (d < A.pit.r - 4) pitFall(m, b);
          else if (d < A.pit.r + 10) { // the rim pulls
            const k = (A.pit.r + 10 - d) / 14 * 60 * dt;
            b.vx += (A.pit.x - b.x) / d * k; b.vy += (A.pit.y - b.y) / d * k;
          }
        } else if (d < A.pit.r) { b.gone = true; ev(m, { k: 'sink', id: b.id, x: b.x, y: b.y }); }
      }
    }
    // fry baskets: shadow grows, then the dunk
    for (const k of m.hz.baskets) {
      const period = 6.0 * m.hazK;
      k.ph += dt;
      const cyc = k.ph % period;
      k.shadow = armed ? (cyc < 1.2 ? cyc / 1.2 : cyc < 1.8 ? 1 : cyc < 2.4 ? 1 - (cyc - 1.8) / 0.6 : 0) : 0;
      k.down = armed && cyc >= 1.2 && cyc < 1.8;
      if (armed && cyc >= 1.2 && k.st !== 1) {
        k.st = 1;
        ev(m, { k: 'dunk', x: k.x, y: k.y, r: k.r });
        for (const b of m.bots) {
          if (!b.alive || b.air > 0) continue;
          if (Math.hypot(b.x - k.x, b.y - k.y) > k.r + CLASSES[b.cls].r * 0.5) continue;
          damage(m, b, 22, hazardCredit(m, b), 'hazard', b.x, b.y);
          if (b.alive && !b.mods.retardant) { b.burn = Math.max(b.burn, 3); b.burnBy = null; }
        }
      }
      if (cyc < 1.2) k.st = 0;
    }
    // grease slicks drift and bounce
    for (const s of m.hz.slicks) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < box[0] + s.r || s.x > box[2] - s.r) { s.vx *= -1; s.x = clamp(s.x, box[0] + s.r, box[2] - s.r); }
      if (s.y < box[1] + s.r || s.y > box[3] - s.r) { s.vy *= -1; s.y = clamp(s.y, box[1] + s.r, box[3] - s.r); }
    }
    // sudden death: batter rot, or the flood
    if (m.clock <= SUDDEN_AT) {
      const rate = A.water ? 3 * clamp((m.hz.water - 0.5) * 2, 0, 1) : 2;
      for (const b of m.bots) if (b.alive) damage(m, b, rate * dt, lastHitter(m, b, 6), A.water ? 'flood' : 'rot', b.x, b.y);
    }
  }
  function lastHitter(m, b, within) {
    if (!b.lastHitBy || m.t - b.lastHitT > within) return null;
    const o = m.bots.find((x) => x.id === b.lastHitBy);
    return o && o !== b ? o : null;
  }
  function hazardCredit(m, b) { return lastHitter(m, b, 3); }

  // ---- pads, puddles, debris, status --------------------------------------------------
  function stepPads(m, dt) {
    for (const p of m.pads) {
      if (!p.w) {
        p.t -= dt;
        if (p.t <= 0) { p.w = WEAPON_KEYS[(p.rot++) % WEAPON_KEYS.length]; ev(m, { k: 'padup', x: p.x, y: p.y, w: p.w }); }
        continue;
      }
      for (const b of m.bots) {
        if (!b.alive || b.air > 0) continue;
        if (Math.hypot(b.x - p.x, b.y - p.y) > 14) continue;
        const w = WEAPONS[p.w];
        if (w.boost) b.nitro = Math.min(4, b.nitro + w.ammo);
        else {
          let ammo = Math.round(w.ammo * b.mods.clip * (w.flame && b.mods.retardant ? 1.5 : 1));
          if (b.weapon && b.weapon.key === p.w) b.weapon.ammo += ammo;
          else b.weapon = { key: p.w, ammo };
        }
        ev(m, { k: 'pickup', id: b.id, x: p.x, y: p.y, w: p.w });
        p.w = null; p.t = 16 * m.hazK;
        break;
      }
    }
  }
  function stepPuddles(m, dt) {
    for (let i = m.puddles.length - 1; i >= 0; i--) { m.puddles[i].t -= dt; if (m.puddles[i].t <= 0) m.puddles.splice(i, 1); }
  }
  function stepDebris(m, dt) {
    for (let i = m.debris.length - 1; i >= 0; i--) {
      const d = m.debris[i];
      d.t -= dt;
      if (d.t <= 0) { m.debris.splice(i, 1); continue; }
      for (const b of m.bots) {
        if (!b.alive || b.air > 0 || b.id === d.owner) continue;
        if (Math.hypot(b.x - d.x, b.y - d.y) > CLASSES[b.cls].r) continue;
        const owner = m.bots.find((x) => x.id === d.owner);
        damage(m, b, 6, owner || null, 'bolts', d.x, d.y);
        ev(m, { k: 'spark', x: d.x, y: d.y, n: 4 });
        m.debris.splice(i, 1);
        break;
      }
    }
  }
  function stepStatus(m, b, dt) {
    if (b.stun > 0) b.stun -= dt;
    if (b.iframes > 0) b.iframes -= dt;
    if (b.squash > 0) b.squash -= dt;
    if (b.shovedT > 0) { b.shovedT -= dt; if (b.shovedT <= 0) b.shovedBy = null; }
    if (b.burn > 0) {
      b.burn -= dt;
      damage(m, b, 3 * dt, b.burnBy && b.burnBy.alive !== undefined ? b.burnBy : null, 'burn', b.x, b.y);
      if (m.rng() < dt * 18) ev(m, { k: 'fire', x: b.x + (m.rng() - 0.5) * 10, y: b.y + (m.rng() - 0.5) * 10 });
    }
    if (b.mods.regen && b.alive && m.t - b.lastHitT > 4 && b.hp < b.hpMax) b.hp = Math.min(b.hpMax, b.hp + 1 * dt);
    if (b.mods.chili) { b.nitroRegen += dt; if (b.nitroRegen >= 15) { b.nitroRegen = 0; if (b.nitro < 4) { b.nitro++; ev(m, { k: 'nitroup', id: b.id }); } } }
  }

  // ---- AI drivers ---------------------------------------------------------------------------
  // level 0 timid, 1 the league, 2 mean. Same shape as GTN's chasers: pick a
  // target, steer toward where it will be, avoid what kills you, fire when lined
  // up, press the special when it will land. Reaction is a per-bot clock so a
  // hard driver is not a psychic one.
  function aiInput(m, b, dt) {
    const A = ARENAS[m.arena];
    const S = b.ai_;
    const lvl = b.ai;
    const C = CLASSES[b.cls];
    S.t += dt;
    const react = [0.45, 0.22, 0.09][lvl];
    if (S.t >= react) {
      S.t = 0;
      S.jit = (m.rng() - 0.5) * [0.5, 0.2, 0.06][lvl];
      // nearest living enemy
      let best = null, bd = 1e9;
      for (const o of m.bots) {
        if (o === b || !o.alive) continue;
        const d = Math.hypot(o.x - b.x, o.y - b.y);
        if (d < bd) { bd = d; best = o; }
      }
      S.tgt = best;
      // want a weapon? (unless the fight is on top of us)
      S.pad = null;
      if ((!b.weapon || b.weapon.ammo <= 0) && (!best || bd > 70)) {
        let pb = null, pd = 1e9;
        for (const p of m.pads) {
          if (!p.w) continue;
          const d = Math.hypot(p.x - b.x, p.y - b.y);
          if (d < pd && d < 260) { pd = d; pb = p; }
        }
        S.pad = pb;
      }
    }
    const out = { dx: 0, dy: 0, ax: Math.cos(b.turret), ay: Math.sin(b.turret), ad: 0, fire: false, spec: false, nitro: false };
    const tgt = S.tgt;
    let gx, gy;
    if (S.pad) { gx = S.pad.x; gy = S.pad.y; }
    else if (tgt) {
      // lead the target a little; the brick/tender want to line up behind-ish
      gx = tgt.x + tgt.vx * 0.25; gy = tgt.y + tgt.vy * 0.25;
      // if the pit is open, try to be on the far side so pushes go INTO it
      if (A.pit && m.hz.pit > 0.6 && b.cls !== 'dicer') {
        const px = A.pit.x, py = A.pit.y;
        const vx = tgt.x - px, vy = tgt.y - py, vl = Math.hypot(vx, vy) || 1;
        gx = tgt.x + vx / vl * 30; gy = tgt.y + vy / vl * 30;
      }
    } else {
      S.wander += dt * 0.6;
      gx = 320 + Math.cos(S.wander) * 180; gy = 180 + Math.sin(S.wander) * 90;
    }
    let dx = gx - b.x, dy = gy - b.y;
    let dist = Math.hypot(dx, dy) || 1;
    dx /= dist; dy /= dist;
    // avoid the open pit
    if (A.pit && m.hz.pit > 0.3) {
      const ex = b.x - A.pit.x, ey = b.y - A.pit.y, ed = Math.hypot(ex, ey) || 1;
      if (ed < A.pit.r + 42) { const k = (A.pit.r + 42 - ed) / 42 * 1.6; dx += ex / ed * k; dy += ey / ed * k; }
    }
    // avoid live slicers and the mallet
    if (m.clock <= HAZARDS_AT) {
      for (const s of m.hz.slicers) {
        const wy = s.side ? A.box[3] : A.box[1];
        if (Math.abs(b.x - s.x) < 40 && Math.abs(b.y - wy) < 40) { dy += s.side ? -1.2 : 1.2; }
      }
      if (A.mallet) {
        const md = Math.hypot(b.x - A.mallet.hx, b.y - A.mallet.hy);
        if (md < A.mallet.r + 28 && m.hz.mallet.arm > 0.2) { dx += (b.x - A.mallet.hx) / (md || 1) * 1.5; dy += (b.y - A.mallet.hy) / (md || 1) * 1.5; }
      }
      for (const k of m.hz.baskets) {
        const kd = Math.hypot(b.x - k.x, b.y - k.y);
        if (kd < k.r + 20 && k.shadow > 0.3) { dx += (b.x - k.x) / (kd || 1) * 1.5; dy += (b.y - k.y) / (kd || 1) * 1.5; }
      }
    }
    const mag = Math.hypot(dx, dy) || 1;
    const speedCap = [0.75, 0.95, 1][lvl];
    // spacing: the dicer wants contact only when spun up; others close in
    let go = 1, strafe = 0;
    if (tgt && !S.pad) {
      const td = Math.hypot(tgt.x - b.x, tgt.y - b.y);
      if (b.cls === 'dicer' && b.spin < 0.6 && td < 90) go = td < 50 ? -0.6 : 0.2; // back off and wind up
      // the flipper and the wedge CIRCLE while their special recharges — a real
      // fight has a shape; four bots in a permanent pile-up does not
      if (b.cls !== 'dicer' && b.spec > 0.4 && td < 110) { go = td < 55 ? -0.3 : 0.35; strafe = (b.seat % 2 ? 1 : -1) * 0.9; }
    }
    const ddx = dx / mag, ddy = dy / mag;
    out.dx = (ddx * go - ddy * strafe) * speedCap; out.dy = (ddy * go + ddx * strafe) * speedCap;
    if (tgt) {
      const td = Math.hypot(tgt.x - b.x, tgt.y - b.y);
      // aim with lead + jitter
      const w = b.weapon ? WEAPONS[b.weapon.key] : null;
      const lead = w && w.spd ? td / w.spd : 0;
      const tx = tgt.x + tgt.vx * lead, ty = tgt.y + tgt.vy * lead;
      const aa = Math.atan2(ty - b.y, tx - b.x) + S.jit;
      out.ax = Math.cos(aa); out.ay = Math.sin(aa); out.ad = td;
      if (w && b.weapon.ammo > 0) {
        const off = Math.abs(wrap(aa - b.turret));
        const range = w.flame ? 80 : w.lob ? 220 : w.burst ? 70 : 270;
        const minR = w.lob ? 70 : 0;
        out.fire = off < 0.3 && td < range && td > minR;
      }
      // specials
      const facing = Math.abs(wrap(Math.atan2(tgt.y - b.y, tgt.x - b.x) - b.a));
      if (b.cls === 'dicer') out.spec = td < 140 || b.spin > 0.5;
      else if (b.cls === 'tender') out.spec = td < C.r + CLASSES[tgt.cls].r + 10 && facing < 0.6 && b.spec <= 0;
      else out.spec = td < 90 && td > 30 && facing < 0.35 && b.spec <= 0;
      out.nitro = b.nitro > 0 && td > 220 && facing < 0.4;
    }
    return out;
  }

  // ---- snapshots (online) -------------------------------------------------------------------
  // Compact, JSON-friendly. The worker sends one every tick; clients apply it
  // and then re-predict their own bot from the unacked inputs.
  const BOT_FIELDS = ['x', 'y', 'a', 'vx', 'vy', 'turret', 'hp', 'hpMax', 'alive', 'wreck', 'gone', 'air', 'airT', 'z', 'spin', 'spec', 'shove', 'flipT', 'squash', 'stun', 'burn', 'iframes', 'nitro', 'boostT', 'cd', 'score', 'kos', 'dmg', 'roundDmg', 'roundWins', 'backing', 'spectating'];
  function snapshot(m) {
    return {
      t: +m.t.toFixed(3), ph: m.phase, pt: +m.phaseT.toFixed(3), ck: +m.clock.toFixed(2), rn: m.roundNum,
      ar: m.arena, tier: m.tier, win: m.winner, rw: m.roundWinner, jd: m.judges,
      bots: m.bots.map((b) => {
        const o = { id: b.id, name: b.name, cls: b.cls, team: b.team, seat: b.seat, ai: b.ai, boons: b.boons.slice(), w: b.weapon ? [b.weapon.key, b.weapon.ammo] : null, lhb: b.lastHitBy, lht: +b.lastHitT.toFixed(2) };
        for (const f of BOT_FIELDS) { const v = b[f]; o[f] = typeof v === 'number' ? +v.toFixed(3) : v; }
        return o;
      }),
      shots: m.shots.map((s) => ({ x: +s.x.toFixed(1), y: +s.y.toFixed(1), vx: +s.vx.toFixed(1), vy: +s.vy.toFixed(1), a: +s.a.toFixed(3), w: s.w, o: s.owner, l: +s.life.toFixed(2), x0: s.x0, y0: s.y0, tx: s.tx, ty: s.ty, T: s.T, tt: s.t, z: s.z, tg: s.target ? s.target.id : null })),
      pads: m.pads.map((p) => [p.w, +p.t.toFixed(2), p.rot]),
      pud: m.puddles.map((p) => [+p.x.toFixed(1), +p.y.toFixed(1), p.r, +p.t.toFixed(2)]),
      deb: m.debris.map((d) => [+d.x.toFixed(1), +d.y.toFixed(1), d.owner, +d.t.toFixed(1), +d.a.toFixed(2)]),
      hz: { sl: m.hz.slicers.map((s) => [s.x, s.side, +s.ph.toFixed(3), +s.up.toFixed(2)]), ma: m.hz.mallet ? [+m.hz.mallet.t.toFixed(3), m.hz.mallet.struck ? 1 : 0, +(m.hz.mallet.arm || 0).toFixed(2), m.hz.mallet.down ? 1 : 0] : null, pit: +m.hz.pit.toFixed(2), bk: m.hz.baskets.map((k) => [k.x, k.y, k.r, +k.ph.toFixed(3), k.st, +k.shadow.toFixed(2), k.down ? 1 : 0]), sk: m.hz.slicks.map((s) => [+s.x.toFixed(1), +s.y.toFixed(1), s.r, s.vx, s.vy]), wa: +m.hz.water.toFixed(3), st: +m.hz.stormT.toFixed(2), armed: !!m.hz.armed, sudden: !!m.hz.sudden },
      ps: m.pitstop ? { t: +m.pitstop.t.toFixed(2), deals: m.pitstop.deals, picked: m.pitstop.picked } : null,
    };
  }
  function applySnapshot(m, s) {
    m.t = s.t; m.phase = s.ph; m.phaseT = s.pt; m.clock = s.ck; m.roundNum = s.rn;
    m.arena = s.ar; m.winner = s.win; m.roundWinner = s.rw; m.judges = s.jd;
    if (s.tier) { const t = TIERS.find((x) => x.key === s.tier); if (t) { m.tier = t.key; m.mult = t.mult; m.aiLevel = t.ai; m.hazK = t.haz; } }
    // bots: match by id, create any we have not seen (late joiners), drop leavers
    const seen = new Set();
    for (const sb of s.bots) {
      seen.add(sb.id);
      let b = m.bots.find((x) => x.id === sb.id);
      if (!b) b = addBot(m, { id: sb.id, name: sb.name, cls: sb.cls, ai: sb.ai }, sb.seat);
      b.name = sb.name; b.cls = sb.cls; b.team = sb.team; b.seat = sb.seat; b.ai = sb.ai;
      b.boons = sb.boons.slice(); recomputeMods(b);
      b.weapon = sb.w ? { key: sb.w[0], ammo: sb.w[1] } : null;
      b.lastHitBy = sb.lhb; b.lastHitT = sb.lht;
      for (const f of BOT_FIELDS) b[f] = sb[f];
    }
    for (let i = m.bots.length - 1; i >= 0; i--) if (!seen.has(m.bots[i].id)) m.bots.splice(i, 1);
    m.bots.sort((p, q) => p.seat - q.seat);
    m.shots = s.shots.map((z) => ({ x: z.x, y: z.y, vx: z.vx, vy: z.vy, a: z.a, w: z.w, owner: z.o, life: z.l, x0: z.x0, y0: z.y0, tx: z.tx, ty: z.ty, T: z.T, t: z.tt, z: z.z, target: z.tg ? m.bots.find((b) => b.id === z.tg) || null : null }));
    m.pads = s.pads.map((p, i) => ({ x: PADS[i][0], y: PADS[i][1], w: p[0], t: p[1], rot: p[2] }));
    m.puddles = s.pud.map((p) => ({ x: p[0], y: p[1], r: p[2], t: p[3] }));
    m.debris = s.deb.map((d) => ({ x: d[0], y: d[1], owner: d[2], t: d[3], a: d[4] }));
    m.hz.slicers = s.hz.sl.map((z) => ({ x: z[0], side: z[1], ph: z[2], up: z[3] }));
    m.hz.mallet = s.hz.ma ? { t: s.hz.ma[0], struck: !!s.hz.ma[1], arm: s.hz.ma[2], down: !!s.hz.ma[3] } : { t: 0, struck: false, arm: 0 };
    m.hz.pit = s.hz.pit;
    m.hz.baskets = s.hz.bk.map((k) => ({ x: k[0], y: k[1], r: k[2], ph: k[3], st: k[4], shadow: k[5], down: !!k[6] }));
    m.hz.slicks = s.hz.sk.map((z) => ({ x: z[0], y: z[1], r: z[2], vx: z[3], vy: z[4] }));
    m.hz.water = s.hz.wa; m.hz.stormT = s.hz.st; m.hz.armed = s.hz.armed; m.hz.sudden = s.hz.sudden;
    m.pitstop = s.ps ? { t: s.ps.t, deals: s.ps.deals, picked: s.ps.picked } : null;
  }

  // Prediction helper for the online client: advance ONE bot's motion only
  // (no shots, no hazards, no other bots) — enough to hide the round trip.
  function predictBot(m, bot, inp, dt) {
    if (!bot.alive || m.phase !== 'fight') return;
    const savedEv = m.events; m.events = [];
    stepBot(m, bot, inp, dt);
    m.events = savedEv;
  }

  // ---- helpers for callers ----------------------------------------------------------
  function drainEvents(m) { const e = m.events; m.events = []; return e; }
  function botById(m, id) { return m.bots.find((b) => b.id === id) || null; }
  function standings(m) {
    return m.bots.filter((b) => !b.spectating).slice().sort((p, q) => (q.roundWins - p.roundWins) || (q.score - p.score) || (p.seat - q.seat));
  }

  global.BotsSim = {
    W, H, ROUND_SECS, HAZARDS_AT, PIT_AT, SUDDEN_AT, DROP_SECS, OVER_SECS, PITSTOP_SECS,
    CLASSES, CLASS_KEYS, TEAMS, WEAPONS, WEAPON_KEYS, BOONS, TIERS, ARENAS, ARENA_KEYS,
    createMatch, addBot, startRound, step, pickBoon, snapshot, applySnapshot, predictBot,
    drainEvents, botById, standings, mulberry, wrap, clamp,
  };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
