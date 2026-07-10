// ---- Nugget Knight ---------------------------------------------------------------
// Hold the castle gate! Sir Nugget — helm, plume, round shield, and an actual
// sword with a swing arc — defends a torchlit courtyard against waves of
// waddling sporks (1 hit, +25) and Big Forks (3 hits, +100). Move with ← →,
// jump with space/↑ (you can hop right over a spork), slash with click/X/Z.
// Three hearts; getting touched costs one with knockback and brief i-frames.
// Lose them all and you're briefly clanked out, then the fight goes on.
// Clearing a wave banks +50 × wave. Second rigged character after Nugget Run —
// this one adds combat: an eased sword arc with a motion trail, enemy hit
// flashes, and death physics that send sporks spinning off the screen.

const knightWorld = document.getElementById('knightWorld');

const K_GROUND = 780;         // courtyard floor, viewBox units
const K_GRAVITY = 3000;
const K_JUMP_V = -950;
const K_WALK = 380;           // px/s
const K_MIN_X = 90, K_MAX_X = 1510;
const SLASH_SECS = 0.26;      // full swing
const SLASH_FROM = -95, SLASH_TO = 100; // degrees, shoulder-relative
const SLASH_REACH = 108;      // horizontal reach of the active arc
const HIT_IFRAMES = 0.85;     // seconds of invincibility after a hit
const KO_SECS = 1.6;
const HEARTS_MAX = 3;
const SPORK_SCORE = 25, FORK_SCORE = 100, WAVE_BONUS = 50;
const SPOON_SCORE = 60, KNIFE_SCORE = 75, WHISK_SCORE = 500;

// Between-wave boons: pick 1 of 3. Character upgrades or castle defenses.
const UPGRADES = [
  { key: 'reach',  emoji: '📏', name: 'Longer Reach',     desc: 'Sword reach +22%',            ok: (s) => s.reach < 2.2,    apply: (s) => { s.reach *= 1.22; } },
  { key: 'swing',  emoji: '🌀', name: 'Quick Swing',      desc: 'Swing 15% faster',            ok: (s) => s.swing > 0.55,   apply: (s) => { s.swing *= 0.85; } },
  { key: 'speed',  emoji: '💨', name: 'Swift Boots',      desc: 'Move 15% faster',             ok: (s) => s.speed < 1.9,    apply: (s) => { s.speed *= 1.15; } },
  { key: 'heart',  emoji: '❤️', name: 'Extra Heart',      desc: '+1 max heart & full heal',    ok: (s) => s.maxHearts < 6,  apply: (s) => { s.maxHearts++; knight.hearts = s.maxHearts; } },
  { key: 'sharp',  emoji: '🗡️', name: 'Sharpened Edge',   desc: 'Slashes deal +1 damage',      ok: (s) => s.dmg < 3,        apply: (s) => { s.dmg++; } },
  { key: 'jump',   emoji: '🦵', name: 'Moon Greaves',     desc: 'Jump 12% higher',             ok: (s) => s.jumpV < 1.5,    apply: (s) => { s.jumpV *= 1.12; } },
  { key: 'torch',  emoji: '🔥', name: 'Vigilant Torches', desc: 'Torches lob embers at foes',  ok: (s) => s.torchLvl < 1,   apply: (s) => { s.torchLvl++; } },
  { key: 'archer', emoji: '🏹', name: 'Hire an Archer',   desc: 'A nugget archer mans the wall', ok: (s) => s.archers < 4,  apply: (s) => { s.archers++; spawnArcher(); } },
  { key: 'shield', emoji: '🛡️', name: 'Bulwark Shield',   desc: 'Block 1 hit per wave',        ok: (s) => s.blockMax < 2,   apply: (s) => { s.blockMax++; knight.blockLeft = s.blockMax; } },
];

const knight = {
  on: false,
  built: false,
  x: 800, dir: 1,
  y: 0, vy: 0,
  keys: { left: false, right: false },
  phase: 0,          // walk-cycle phase
  moving: false,
  slashT: 0,         // counts down from SLASH_SECS while swinging
  slashHits: null,   // enemies already hit by the current swing
  hearts: HEARTS_MAX,
  iT: 0,             // i-frame timer
  ko: 0,             // knockout timer
  wave: 0,
  pending: 0,        // enemies left to spawn this wave
  spawnT: 0,
  breakT: 0,         // pause between waves
  spawnSide: 1,
  enemies: [],       // { el, type, x, hp, speed, waddle, dead, vx, vy, rot }
  stats: null,       // upgrade multipliers, reset per session (see syncKnight)
  blockLeft: 0,      // Bulwark charges remaining this wave
  choosing: false,   // upgrade cards on screen; combat is frozen
  choices: [],
  slashDur: SLASH_SECS,
  embers: [],        // torch projectiles { el, x, y, t, target }
  emberT: 0,
  archers: [],       // wall archers { el, x, shootT }
  arrows: [],        // { el, x0, y0, t, target }
  globs: [],         // spoon sauce lobs { el, shadow, x0, y0, tx, t }
  refs: null,
};

function knightActive() {
  return storm.mode === 'knight' && storm.running;
}

function knightTally() {
  const max = knight.stats ? knight.stats.maxHearts : HEARTS_MAX;
  const hearts = '❤️'.repeat(knight.hearts) + '🖤'.repeat(Math.max(max - knight.hearts, 0));
  const shield = knight.stats && knight.stats.blockMax ? ` · 🛡️${knight.blockLeft}` : '';
  const boss = knight.enemies && knight.enemies.find((e) => e.type === 'whisk' && !e.dead);
  const bossTxt = boss ? ` · 🌀${boss.hp}` : '';
  return `Wave ${Math.max(knight.wave, 1)} · ${hearts}${shield}${bossTxt}`;
}

// ---- Scene ------------------------------------------------------------------------

function buildKnightScene() {
  if (knight.built) return;
  knight.built = true;

  let stars = '';
  for (let i = 0; i < 40; i++) {
    stars += `<circle cx="${Math.round(Math.random() * 1600)}" cy="${Math.round(Math.random() * 300)}"
      r="${(0.7 + Math.random()).toFixed(1)}" fill="#cdd9f2" opacity="${(0.3 + Math.random() * 0.6).toFixed(2)}"/>`;
  }

  // Cobblestone floor rows, offset like brickwork.
  let cobbles = '';
  for (let row = 0; row < 3; row++) {
    const y = K_GROUND + 8 + row * 38;
    for (let i = -1; i < 15; i++) {
      const x = i * 116 + (row % 2) * 58;
      cobbles += `<rect x="${x}" y="${y}" width="106" height="30" rx="10"
        fill="${row % 2 ? '#3a3f4d' : '#424858'}" opacity="0.9"/>`;
    }
  }

  const torch = (x) => `
    <g transform="translate(${x},470)">
      <rect x="-6" y="0" width="12" height="58" rx="4" fill="#4a3320"/>
      <path d="M-12,6 L12,6 L8,-6 L-8,-6 Z" fill="#2c2c34"/>
      <ellipse cy="-30" rx="90" ry="60" fill="url(#kTorchGlow)"/>
      <g class="k-flame">
        <path d="M0,-8 C12,-20 8,-38 0,-48 C-8,-38 -12,-20 0,-8 Z" fill="#f59e0b"/>
        <path d="M0,-12 C7,-20 5,-30 0,-38 C-5,-30 -7,-20 0,-12 Z" fill="#fde047"/>
      </g>
    </g>`;

  knightWorld.innerHTML = `
  <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" width="100%" height="100%"
       aria-label="Sir Nugget defends a torchlit castle gate from waddling sporks">
    <defs>
      <linearGradient id="kSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#131029"/><stop offset="1" stop-color="#2c2344"/>
      </linearGradient>
      <linearGradient id="kWall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#565d72"/><stop offset="1" stop-color="#3d4356"/>
      </linearGradient>
      <linearGradient id="kFloor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4a5064"/><stop offset="1" stop-color="#343949"/>
      </linearGradient>
      <linearGradient id="kDoor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6b4a2c"/><stop offset="1" stop-color="#4a3220"/>
      </linearGradient>
      <linearGradient id="kBlade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#e8edf5"/><stop offset="1" stop-color="#9aa6ba"/>
      </linearGradient>
      <radialGradient id="kTorchGlow">
        <stop offset="0" stop-color="rgba(245,158,11,0.28)"/>
        <stop offset="1" stop-color="rgba(245,158,11,0)"/>
      </radialGradient>
      <pattern id="kBricks" width="120" height="56" patternUnits="userSpaceOnUse">
        <path d="M0,0 H120 M0,28 H120 M60,0 V28 M0,28 V56 M120,28 V56 M30,28 V56 M90,28 V56"
              stroke="rgba(20,22,32,0.35)" stroke-width="3" fill="none"/>
      </pattern>
    </defs>

    <!-- night sky, moon, distant towers -->
    <rect width="1600" height="900" fill="url(#kSky)"/>
    <g>${stars}</g>
    <circle cx="1310" cy="130" r="42" fill="#dfe8f7" opacity="0.9"/>
    <circle cx="1296" cy="120" r="9" fill="rgba(170,190,220,0.6)"/>
    <path d="M120,420 v-160 l-18,0 l0,-26 l14,0 l0,14 l16,0 l0,-14 l16,0 l0,14 l16,0 l0,-14 l14,0 l0,26 l-18,0 v160 Z"
          fill="#211d38" opacity="0.85"/>
    <path d="M1490,420 v-130 l-16,0 l0,-24 l12,0 l0,12 l14,0 l0,-12 l14,0 l0,12 l14,0 l0,-12 l12,0 l0,24 l-16,0 v130 Z"
          fill="#211d38" opacity="0.85"/>

    <!-- castle wall with crenellations and the gate -->
    <g>
      <path d="M0,780 L0,400 L40,400 L40,360 L110,360 L110,400 L190,400 L190,360 L260,360 L260,400
               L340,400 L340,360 L410,360 L410,400 L490,400 L490,360 L560,360 L560,400 L640,400
               L640,360 L710,360 L710,400 L890,400 L890,360 L960,360 L960,400 L1040,400 L1040,360
               L1110,360 L1110,400 L1190,400 L1190,360 L1260,360 L1260,400 L1340,400 L1340,360
               L1410,360 L1410,400 L1490,400 L1490,360 L1560,360 L1560,400 L1600,400 L1600,780 Z"
            fill="url(#kWall)"/>
      <path d="M0,780 L0,400 L1600,400 L1600,780 Z" fill="url(#kBricks)"/>
      <!-- gate arch + wooden doors -->
      <path d="M660,780 L660,560 Q800,440 940,560 L940,780 Z" fill="#1b1826"/>
      <path d="M676,780 L676,568 Q800,462 924,568 L924,780 Z" fill="url(#kDoor)"/>
      <path d="M800,470 L800,780 M690,600 H910 M690,690 H910" stroke="#2c2015" stroke-width="7" fill="none"/>
      <circle cx="770" cy="650" r="7" fill="#1b1410"/>
      <circle cx="830" cy="650" r="7" fill="#1b1410"/>
      <!-- pennants -->
      <g class="k-pennant" style="transform-origin:600px 430px"><path d="M600,430 h56 l-56,34 Z" fill="#d98324"/></g>
      <g class="k-pennant" style="transform-origin:1000px 430px;animation-delay:.7s"><path d="M1000,430 h-56 l56,34 Z" fill="#d98324"/></g>
      ${torch(560)}
      ${torch(1040)}
    </g>

    <!-- floor -->
    <rect y="${K_GROUND}" width="1600" height="120" fill="url(#kFloor)"/>
    ${cobbles}
    <rect y="${K_GROUND}" width="1600" height="5" fill="#5d6478"/>

    <g id="kEnemies"></g>
    <g id="kFx"></g>

    <!-- SIR NUGGET -->
    <g id="kKnight">
      <ellipse id="kShadow" cx="0" cy="6" rx="44" ry="9" fill="rgba(0,0,0,0.4)"/>
      <g id="kRig">
        <g id="kFootB"><rect x="-14" y="-16" width="32" height="15" rx="7" fill="#7e8a99"/>
          <rect x="-16" y="-5" width="38" height="6" rx="3" fill="#525c6b"/></g>
        <g id="kShieldArm"><circle r="17" fill="#8b93a3"/><circle r="17" fill="none" stroke="#d98324" stroke-width="4"/>
          <circle r="5" fill="#d98324"/></g>
        <g id="kBody">
          <image href="nugget.png" x="-46" y="-98" width="92" height="92"/>
          <!-- helm + plume -->
          <path d="M-34,-72 Q-36,-102 0,-104 Q36,-102 34,-72 L34,-64 Q0,-72 -34,-64 Z" fill="#8b93a3"/>
          <path d="M-34,-72 Q-36,-102 0,-104 Q36,-102 34,-72" fill="none" stroke="#525c6b" stroke-width="3"/>
          <rect x="8" y="-84" width="22" height="6" rx="3" fill="#39404c"/>
          <g id="kPlume"><path d="M-4,-100 C-12,-124 -34,-132 -46,-124 C-34,-116 -26,-106 -22,-96 Z" fill="#c03d2e"/></g>
          <g transform="translate(16,-56)"><g class="run-blink">
            <ellipse cx="-8" cy="0" rx="6.5" ry="8" fill="#fdfdf8"/>
            <ellipse cx="10" cy="0" rx="6.5" ry="8" fill="#fdfdf8"/>
            <circle cx="-5.5" cy="1" r="2.8" fill="#23232b"/>
            <circle cx="12.5" cy="1" r="2.8" fill="#23232b"/>
          </g></g>
        </g>
        <g id="kFootF"><rect x="-14" y="-16" width="32" height="15" rx="7" fill="#98a2b3"/>
          <rect x="-16" y="-5" width="38" height="6" rx="3" fill="#5d6878"/></g>
        <!-- sword arm: pivots at the shoulder -->
        <g id="kSwordArm">
          <path id="kTrail" d="" fill="rgba(255,226,130,0.0)"/>
          <g id="kSword">
            <circle r="10" fill="#f2ece2"/>
            <rect x="8" y="-5" width="14" height="10" rx="3" fill="#6b4a2c"/>
            <rect x="20" y="-13" width="7" height="26" rx="3" fill="#d98324"/>
            <path d="M27,-6 L92,-6 L104,0 L92,6 L27,6 Z" fill="url(#kBlade)"/>
            <rect x="27" y="-1.5" width="66" height="3" fill="rgba(120,132,152,0.6)"/>
          </g>
        </g>
      </g>
    </g>
  </svg>`;

  knight.refs = {
    root: knightWorld.querySelector('#kKnight'),
    rig: knightWorld.querySelector('#kRig'),
    shadow: knightWorld.querySelector('#kShadow'),
    body: knightWorld.querySelector('#kBody'),
    plume: knightWorld.querySelector('#kPlume'),
    footF: knightWorld.querySelector('#kFootF'),
    footB: knightWorld.querySelector('#kFootB'),
    shieldArm: knightWorld.querySelector('#kShieldArm'),
    swordArm: knightWorld.querySelector('#kSwordArm'),
    sword: knightWorld.querySelector('#kSword'),
    trail: knightWorld.querySelector('#kTrail'),
    enemies: knightWorld.querySelector('#kEnemies'),
    fx: knightWorld.querySelector('#kFx'),
  };
}

function syncKnight() {
  const active = knightActive();
  if (active === knight.on) return;
  knight.on = active;
  knightWorld.classList.toggle('active', active);
  if (active) {
    buildKnightScene();
    knight.x = 800; knight.dir = 1; knight.y = 0; knight.vy = 0;
    knight.stats = { reach: 1, swing: 1, speed: 1, jumpV: 1, dmg: 1, torchLvl: 0, blockMax: 0, archers: 0, maxHearts: HEARTS_MAX };
    clearArchers();
    knight.hearts = HEARTS_MAX; knight.iT = 0; knight.ko = 0;
    knight.blockLeft = 0;
    knight.slashT = 0; knight.phase = 0;
    knight.wave = 0;
    knight.breakT = 1.2; // brief beat, then wave 1
    knight.choosing = false;
    hideUpgradeUI();
    clearKnightEnemies();
  } else {
    knight.choosing = false;
    hideUpgradeUI();
    clearKnightEnemies();
  }
}

function clearKnightEnemies() {
  knight.enemies.forEach((e) => e.el.remove());
  knight.enemies = [];
  knight.embers.forEach((e) => e.el.remove());
  knight.embers = [];
  knight.arrows.forEach((a) => a.el.remove());
  knight.arrows = [];
  knight.globs.forEach((g) => { g.el.remove(); g.shadow.remove(); });
  knight.globs = [];
}

function clearArchers() {
  knight.archers.forEach((a) => a.el.remove());
  knight.archers = [];
}

// ---- Wall archers (🏹 Hire an Archer) ------------------------------------------

const ARCHER_POSTS = [300, 1300, 470, 1130]; // battlement positions, in hire order

function spawnArcher() {
  const x = ARCHER_POSTS[knight.archers.length % ARCHER_POSTS.length];
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', `translate(${x},400)`);
  g.innerHTML = `
    <image href="nugget.png" x="-19" y="-42" width="38" height="38"/>
    <path d="M-16,-30 Q-17,-43 -1,-44 Q15,-43 14,-30" fill="none" stroke="#8b93a3" stroke-width="6" stroke-linecap="round"/>
    <path d="M16,-36 q16,14 0,30" fill="none" stroke="#6b4a2c" stroke-width="4" stroke-linecap="round"/>
    <line x1="16" y1="-36" x2="16" y2="-6" stroke="#d9d2c2" stroke-width="1.5"/>`;
  knight.refs.enemies.parentNode.insertBefore(g, knight.refs.enemies);
  knight.archers.push({ el: g, x, shootT: 1 + Math.random() * 1.5 });
}

function lobSauce(spoon) {
  const el = document.createElementNS(SVG_NS, 'g');
  el.innerHTML = '<circle r="9" fill="#c8362b"/><circle cx="-2.5" cy="-2.5" r="2.6" fill="rgba(255,255,255,0.35)"/>';
  const shadow = document.createElementNS(SVG_NS, 'ellipse');
  shadow.setAttribute('rx', '20'); shadow.setAttribute('ry', '5');
  shadow.setAttribute('fill', 'rgba(200,54,43,0.5)');
  shadow.setAttribute('opacity', '0');
  knight.refs.fx.appendChild(shadow);
  knight.refs.fx.appendChild(el);
  knight.globs.push({ el, shadow, x0: spoon.x, y0: K_GROUND - 62, tx: knight.x, t: 0 });
}

function shootArrow(archer, target) {
  const el = document.createElementNS(SVG_NS, 'g');
  el.innerHTML = `
    <line x1="-11" y1="0" x2="9" y2="0" stroke="#6b4a2c" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M9,0 l7,3 l0,-6 Z" fill="#aab4c2"/>
    <path d="M-11,0 l-5,4 M-11,0 l-5,-4" stroke="#d9d2c2" stroke-width="2.5"/>`;
  knight.refs.fx.appendChild(el);
  knight.arrows.push({ el, x0: archer.x + 16, y0: 372, t: 0, target });
}

// ---- Waves & enemies ------------------------------------------------------------

function startWave(n) {
  knight.wave = n;
  knight.pending = 3 + Math.ceil(n * 1.4);
  knight.spawnT = 0.4;
  knight.blockLeft = knight.stats.blockMax;
  updateStormHud();
  const [px, py] = knightToScreen(800, 330);
  if (n % 5 === 0) {
    spawnEnemy('whisk');
    spawnPopLabel(px, py, `🌀 Wave ${n} — THE WHISK approaches`, 'big');
  } else {
    spawnPopLabel(px, py, `⚔️ Wave ${n}`, 'big');
  }
}

function enemySvg(type) {
  const g = document.createElementNS(SVG_NS, 'g');
  if (type === 'spoon') {
    // Spoon Slinger: solid bowl, leans back to catapult sauce globs.
    g.innerHTML = `
      <g class="k-en-rig">
        <rect x="-4" y="-36" width="8" height="36" rx="3.5" fill="#b8a48e"/>
        <ellipse cx="0" cy="-52" rx="17" ry="20" fill="#cbb79e"/>
        <ellipse cx="-3" cy="-56" rx="9" ry="11" fill="#b8a48e" opacity="0.6"/>
        <ellipse cx="-6" cy="-48" rx="4.5" ry="5.5" fill="#fdfdf8"/>
        <ellipse cx="7" cy="-48" rx="4.5" ry="5.5" fill="#fdfdf8"/>
        <circle cx="-4.5" cy="-47" r="2.2" fill="#23232b"/>
        <circle cx="8.5" cy="-47" r="2.2" fill="#23232b"/>
        <circle class="k-sauce-held" cx="0" cy="-70" r="7" fill="#c8362b" opacity="0"/>
        <path d="M-6,-6 l-5,6 M6,-6 l5,6" stroke="#8a7a66" stroke-width="4" stroke-linecap="round"/>
      </g>`;
  } else if (type === 'knife') {
    // Kitchen Knife: stalks, telegraphs, then lunges blade-first.
    g.innerHTML = `
      <g class="k-en-rig">
        <path d="M-3,-22 L-8,-62 Q-8,-70 0,-70 Q6,-68 5,-60 L4,-22 Z" fill="#c4ccd8"/>
        <path d="M-6,-40 L3,-40" stroke="#9aa6ba" stroke-width="2"/>
        <rect x="-6" y="-24" width="12" height="24" rx="5" fill="#3d2b1c"/>
        <circle cx="-3" cy="-14" r="2" fill="#8a7a66"/>
        <circle cx="3" cy="-14" r="2" fill="#8a7a66"/>
        <ellipse cx="-4" cy="-50" rx="3.8" ry="4.8" fill="#fdfdf8"/>
        <ellipse cx="4" cy="-52" rx="3.8" ry="4.8" fill="#fdfdf8"/>
        <circle cx="-3" cy="-49" r="1.9" fill="#23232b"/>
        <circle cx="5" cy="-51" r="1.9" fill="#23232b"/>
        <path d="M-8,-56 L-1,-54 M8,-58 L2,-55" stroke="#39404c" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M-4,-2 l-4,4 M4,-2 l4,4" stroke="#2c2015" stroke-width="4" stroke-linecap="round"/>
      </g>`;
  } else if (type === 'whisk') {
    // THE WHISK: a mini-boss. Wire balloon, angry brows, spin attacks.
    g.innerHTML = `
      <g class="k-en-rig">
        <rect x="-7" y="-46" width="14" height="46" rx="6" fill="#525c6b"/>
        <g class="k-whisk-wires">
          <ellipse cx="0" cy="-82" rx="30" ry="40" fill="none" stroke="#aab4c2" stroke-width="5"/>
          <ellipse cx="0" cy="-82" rx="18" ry="40" fill="none" stroke="#98a2b3" stroke-width="5"/>
          <ellipse cx="0" cy="-82" rx="6" ry="40" fill="none" stroke="#8b93a3" stroke-width="5"/>
        </g>
        <ellipse cx="-10" cy="-84" rx="6.5" ry="8" fill="#fdfdf8"/>
        <ellipse cx="12" cy="-84" rx="6.5" ry="8" fill="#fdfdf8"/>
        <circle cx="-7.5" cy="-83" r="3.2" fill="#23232b"/>
        <circle cx="14.5" cy="-83" r="3.2" fill="#23232b"/>
        <path d="M-19,-94 L-3,-89 M21,-94 L5,-89" stroke="#2c333f" stroke-width="4" stroke-linecap="round"/>
        <path d="M-9,-4 l-7,8 M9,-4 l7,8" stroke="#39404c" stroke-width="6" stroke-linecap="round"/>
      </g>
      <g class="k-boss-hp">
        <rect x="-34" y="-140" width="68" height="8" rx="4" fill="rgba(10,12,20,0.75)"/>
        <rect class="k-boss-hp-fill" x="-31" y="-138" width="62" height="4" rx="2" fill="#f43f5e"/>
      </g>`;
  } else if (type === 'fork') {
    g.innerHTML = `
      <g class="k-en-rig">
        <rect x="-5" y="-52" width="10" height="52" rx="4" fill="#9aa6ba"/>
        <path d="M-20,-52 L-20,-88 M-7,-52 L-7,-92 M7,-52 L7,-92 M20,-52 L20,-88"
              stroke="#aab4c2" stroke-width="8" stroke-linecap="round" fill="none"/>
        <rect x="-24" y="-58" width="48" height="14" rx="7" fill="#aab4c2"/>
        <ellipse cx="-8" cy="-44" rx="5.5" ry="7" fill="#fdfdf8"/>
        <ellipse cx="8" cy="-44" rx="5.5" ry="7" fill="#fdfdf8"/>
        <circle cx="-6" cy="-43" r="2.6" fill="#23232b"/>
        <circle cx="10" cy="-43" r="2.6" fill="#23232b"/>
        <path d="M-14,-52 L-2,-48 M14,-52 L2,-48" stroke="#39404c" stroke-width="3" stroke-linecap="round"/>
        <path d="M-8,-8 l-6,8 M8,-8 l6,8" stroke="#525c6b" stroke-width="5" stroke-linecap="round"/>
      </g>`;
  } else if (type === 'armored') {
    g.innerHTML = `
      <g class="k-en-rig">
        <rect x="-4" y="-34" width="8" height="34" rx="3.5" fill="#6e7889"/>
        <path d="M0,-56 m-15,10 a15,14 0 1,1 30,0 q0,12 -15,12 q-15,0 -15,-12 Z" fill="#8b93a3"/>
        <path d="M-16,-52 a16,11 0 0 1 32,0 Z" fill="#454e5e"/>
        <path d="M-10,-58 L-10,-66 M0,-60 L0,-69 M10,-58 L10,-66"
              stroke="#8b93a3" stroke-width="5" stroke-linecap="round" fill="none"/>
        <ellipse cx="-6" cy="-44" rx="4.5" ry="5.5" fill="#fdfdf8"/>
        <ellipse cx="7" cy="-44" rx="4.5" ry="5.5" fill="#fdfdf8"/>
        <circle cx="-4.5" cy="-43" r="2.2" fill="#23232b"/>
        <circle cx="8.5" cy="-43" r="2.2" fill="#23232b"/>
        <path d="M-12,-50 L-1,-47 M12,-50 L2,-47" stroke="#2c333f" stroke-width="3" stroke-linecap="round"/>
        <path d="M-6,-6 l-5,6 M6,-6 l5,6" stroke="#525c6b" stroke-width="4" stroke-linecap="round"/>
      </g>`;
  } else {
    g.innerHTML = `
      <g class="k-en-rig">
        <rect x="-4" y="-34" width="8" height="34" rx="3.5" fill="#9aa6ba"/>
        <path d="M0,-56 m-15,10 a15,14 0 1,1 30,0 q0,12 -15,12 q-15,0 -15,-12 Z" fill="#aab4c2"/>
        <path d="M-10,-58 L-10,-66 M0,-60 L0,-69 M10,-58 L10,-66"
              stroke="#aab4c2" stroke-width="5" stroke-linecap="round" fill="none"/>
        <ellipse cx="-6" cy="-46" rx="4.5" ry="5.5" fill="#fdfdf8"/>
        <ellipse cx="7" cy="-46" rx="4.5" ry="5.5" fill="#fdfdf8"/>
        <circle cx="-4.5" cy="-45" r="2.2" fill="#23232b"/>
        <circle cx="8.5" cy="-45" r="2.2" fill="#23232b"/>
        <path d="M-6,-6 l-5,6 M6,-6 l5,6" stroke="#525c6b" stroke-width="4" stroke-linecap="round"/>
      </g>`;
  }
  return g;
}

const ENEMY_HP    = { spork: 1, armored: 2, fork: 3, spoon: 2, knife: 1, whisk: 0 /* set per wave */ };
const ENEMY_SPEED = { spork: 92, armored: 75, fork: 66, spoon: 70, knife: 52, whisk: 34 };

function rollEnemyType(wave) {
  const r = Math.random();
  let acc = 0;
  if (wave >= 2 && r < (acc += Math.min(0.15 * (wave - 1), 0.32))) return 'fork';
  if (wave >= 3 && r < (acc += 0.18)) return 'spoon';
  if (wave >= 5 && r < (acc += 0.15)) return 'knife';
  if (wave >= 4 && r < (acc += 0.22)) return 'armored';
  return 'spork';
}

function spawnEnemy(forceType) {
  const type = forceType || rollEnemyType(knight.wave);
  const el = enemySvg(type);
  knight.refs.enemies.appendChild(el);
  knight.spawnSide = -knight.spawnSide;
  const maxHp = type === 'whisk' ? 10 + knight.wave : ENEMY_HP[type];
  knight.enemies.push({
    el, type,
    x: knight.spawnSide === 1 ? 1660 : -60,
    hp: maxHp, maxHp,
    speed: ENEMY_SPEED[type] + Math.random() * 45 + knight.wave * (type === 'whisk' ? 2 : 9),
    waddle: Math.random() * Math.PI * 2,
    flashT: 0,
    state: 'approach', stateT: 0,
    atkT: type === 'spoon' ? 1.4 : type === 'knife' ? 1.6 : 4,
    dashDir: 1,
    dead: false, vx: 0, vy: 0, rot: 0, y: 0,
  });
}

function knightToScreen(x, y) {
  const w = window.innerWidth, h = window.innerHeight;
  const s = Math.max(w / 1600, h / 900);
  return [x * s + (w - 1600 * s) / 2, y * s + (h - 900 * s)];
}

function killEnemy(e) {
  e.dead = true;
  e.vx = (e.x < knight.x ? -1 : 1) * (250 + Math.random() * 180);
  e.vy = -(320 + Math.random() * 260);
  const score = { spork: SPORK_SCORE, armored: 40, fork: FORK_SCORE, spoon: SPOON_SCORE, knife: KNIFE_SCORE, whisk: WHISK_SCORE }[e.type];
  storm.caught += score;
  const [px, py] = knightToScreen(e.x, K_GROUND - 70);
  spawnPopLabel(px, py, '+' + score, e.type === 'fork' || e.type === 'whisk' ? 'golden' : '');
  updateStormHud();
}

// ---- Combat -----------------------------------------------------------------------

function knightSlash() {
  if (!knightActive() || knight.ko > 0 || knight.slashT > 0 || knight.choosing) return;
  knight.slashDur = SLASH_SECS * knight.stats.swing;
  knight.slashT = knight.slashDur;
  knight.slashHits = new Set();
}

function hurtKnight(fromX, source) {
  if (knight.iT > 0 || knight.ko > 0) return;
  if (knight.blockLeft > 0) {
    knight.blockLeft--;
    knight.iT = 0.7;
    const [bx, by] = knightToScreen(knight.x, K_GROUND - 130);
    spawnPopLabel(bx, by, '🛡️ blocked!');
    updateStormHud();
    return;
  }
  knight.hearts--;
  knight.iT = HIT_IFRAMES;
  knight.x += (knight.x < fromX ? -1 : 1) * 70;
  knight.x = Math.min(Math.max(knight.x, K_MIN_X), K_MAX_X);
  knight.refs.rig.classList.remove('k-hurt');
  void knight.refs.rig.getBoundingClientRect(); // restart the flash animation
  knight.refs.rig.classList.add('k-hurt');
  if (knight.hearts <= 0) {
    knight.ko = KO_SECS;
    const [px, py] = knightToScreen(knight.x, K_GROUND - 140);
    spawnPopLabel(px, py, '💫 clanked out!', 'big');
  }
  updateStormHud();
}

// ---- Upgrade cards ------------------------------------------------------------------

let kUpOverlay = null;

function ensureUpgradeUI() {
  if (kUpOverlay) return;
  kUpOverlay = document.createElement('div');
  kUpOverlay.className = 'k-upgrade';
  kUpOverlay.innerHTML = '<div class="k-up-title">⚔️ Choose thy boon</div><div class="k-up-cards"></div>';
  document.body.appendChild(kUpOverlay);
  kUpOverlay.addEventListener('mousedown', (e) => e.stopPropagation()); // no slashing through the menu
  kUpOverlay.querySelector('.k-up-cards').addEventListener('click', (e) => {
    const card = e.target.closest('button');
    if (card) pickUpgrade(Number(card.dataset.idx));
  });
}

function showUpgrades() {
  ensureUpgradeUI();
  const pool = UPGRADES.filter((u) => u.ok(knight.stats));
  // Shuffle and deal three (fewer if the build is nearly maxed).
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  knight.choices = pool.slice(0, 3);
  if (!knight.choices.length) { // fully maxed build — straight to the next wave
    knight.breakT = 2.2;
    return;
  }
  knight.choosing = true;
  kUpOverlay.querySelector('.k-up-cards').innerHTML = knight.choices.map((u, i) =>
    `<button type="button" data-idx="${i}">
      <span class="k-up-emoji">${u.emoji}</span>
      <span class="k-up-name">${u.name}</span>
      <span class="k-up-desc">${u.desc}</span>
      <span class="k-up-key">${i + 1}</span>
    </button>`).join('');
  kUpOverlay.classList.add('active');
}

function pickUpgrade(i) {
  const u = knight.choices[i];
  if (!u || !knight.choosing) return;
  u.apply(knight.stats);
  knight.choosing = false;
  hideUpgradeUI();
  const [px, py] = knightToScreen(knight.x, K_GROUND - 150);
  spawnPopLabel(px, py, `${u.emoji} ${u.name}!`, 'golden');
  knight.breakT = 1.4;
  updateStormHud();
}

function hideUpgradeUI() {
  if (kUpOverlay) kUpOverlay.classList.remove('active');
}

// ---- Input ------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (!knightActive()) return;
  if (knight.choosing && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
    pickUpgrade(Number(e.code.slice(-1)) - 1);
    e.preventDefault();
    return;
  }
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA')       { knight.keys.left = true;  e.preventDefault(); }
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') { knight.keys.right = true; e.preventDefault(); }
  else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    if (knight.y <= 0 && knight.ko <= 0 && !knight.choosing) knight.vy = K_JUMP_V * knight.stats.jumpV;
    e.preventDefault();
  } else if (e.code === 'KeyX' || e.code === 'KeyZ') {
    knightSlash();
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA')       knight.keys.left = false;
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') knight.keys.right = false;
});

window.addEventListener('mousedown', (e) => {
  if (!knightActive()) return;
  if (e.target.closest('.storm-hud')) return;
  knightSlash();
});

// ---- The step -----------------------------------------------------------------------

function stepKnight(dt, w, h) {
  const r = knight.refs;

  // Upgrade cards on screen: the courtyard holds its breath.
  if (knight.choosing) {
    const idle = Math.sin(performance.now() / 600) * 2;
    r.body.setAttribute('transform', `translate(0,${(-4 + idle).toFixed(1)})`);
    r.plume.setAttribute('transform', `rotate(${(Math.sin(performance.now() / 400) * 4).toFixed(1)})`);
    return;
  }

  // Timers
  if (knight.iT > 0) knight.iT -= dt;
  if (knight.ko > 0) {
    knight.ko -= dt;
    if (knight.ko <= 0) {
      // Getting clanked out stings now: you rise with half your hearts.
      knight.hearts = Math.ceil(knight.stats.maxHearts / 2);
      knight.iT = 1.4;
      updateStormHud();
    }
  }

  // Wave flow
  if (knight.breakT > 0) {
    knight.breakT -= dt;
    if (knight.breakT <= 0) startWave(knight.wave + 1);
  } else if (knight.pending > 0) {
    knight.spawnT -= dt;
    if (knight.spawnT <= 0) {
      spawnEnemy();
      knight.pending--;
      knight.spawnT = Math.max(0.26, 0.6 - knight.wave * 0.035) + Math.random() * 0.6;
    }
  } else if (!knight.enemies.some((e) => !e.dead)) {
    // wave cleared → bank the bonus, then offer a boon
    const bonus = WAVE_BONUS * knight.wave;
    storm.caught += bonus;
    const [px, py] = knightToScreen(800, 300);
    spawnPopLabel(px, py, `🏰 Wave ${knight.wave} cleared +${bonus}`, 'golden');
    updateStormHud();
    showUpgrades();
  }

  // Movement (disabled while KO'd)
  knight.moving = false;
  if (knight.ko <= 0) {
    const dir = (knight.keys.right ? 1 : 0) - (knight.keys.left ? 1 : 0);
    if (dir) {
      knight.dir = dir;
      knight.x = Math.min(Math.max(knight.x + dir * K_WALK * knight.stats.speed * dt, K_MIN_X), K_MAX_X);
      knight.moving = true;
      knight.phase += dt * 13;
    }
  }
  if (knight.y > 0 || knight.vy !== 0) {
    knight.vy += K_GRAVITY * dt;
    knight.y -= knight.vy * dt;
    if (knight.y <= 0) { knight.y = 0; knight.vy = 0; }
  }

  // Slash
  let swordAngle = 38 + (knight.moving ? Math.sin(knight.phase) * 7 : Math.sin(performance.now() / 500) * 3);
  let trailOpacity = 0;
  if (knight.slashT > 0) {
    knight.slashT -= dt;
    const q = Math.min(1 - knight.slashT / knight.slashDur, 1);
    const eased = Math.pow(q, 0.75);
    swordAngle = SLASH_FROM + (SLASH_TO - SLASH_FROM) * eased;
    trailOpacity = q > 0.08 && q < 0.8 ? 0.4 * (1 - q) : 0;
    // Active hit window
    if (q > 0.15 && q < 0.75 && knight.y < 70) {
      for (const e of knight.enemies) {
        if (e.dead || knight.slashHits.has(e)) continue;
        const rel = (e.x - knight.x) * knight.dir;
        if (rel > -6 && rel < SLASH_REACH * knight.stats.reach) {
          knight.slashHits.add(e);
          e.hp -= knight.stats.dmg;
          if (e.hp <= 0) killEnemy(e);
          else {
            e.flashT = 0.18;
            e.x += knight.dir * 34; // knock the fork back a step
          }
        }
      }
    }
  }

  // Vigilant Torches: lob embers at the nearest threats
  if (knight.stats.torchLvl > 0) {
    knight.emberT -= dt;
    const alive = knight.enemies.filter((e) => !e.dead);
    if (knight.emberT <= 0 && alive.length) {
      knight.emberT = 5.5 / knight.stats.torchLvl;
      const target = alive[Math.floor(Math.random() * alive.length)];
      const fromX = Math.abs(target.x - 560) < Math.abs(target.x - 1040) ? 560 : 1040;
      const el = document.createElementNS(SVG_NS, 'circle');
      el.setAttribute('r', '7');
      el.setAttribute('fill', '#fbbf24');
      el.setAttribute('style', 'filter: drop-shadow(0 0 7px rgba(245,158,11,0.9))');
      knight.refs.fx.appendChild(el);
      knight.embers.push({ el, x0: fromX, y0: 420, x: fromX, y: 420, t: 0, target });
    }
  }
  // Sauce globs arc toward where the knight was standing
  for (let i = knight.globs.length - 1; i >= 0; i--) {
    const g = knight.globs[i];
    g.t += dt / 1.0;
    const q4 = Math.min(g.t, 1);
    const gx = g.x0 + (g.tx - g.x0) * q4;
    const gy = g.y0 + (K_GROUND - 12 - g.y0) * q4 - Math.sin(q4 * Math.PI) * 250;
    g.el.setAttribute('transform', `translate(${gx.toFixed(1)},${gy.toFixed(1)})`);
    g.shadow.setAttribute('transform', `translate(${g.tx},${K_GROUND - 4}) scale(${(0.4 + q4).toFixed(2)})`);
    g.shadow.setAttribute('opacity', (0.5 * q4).toFixed(2));
    if (q4 >= 1) {
      if (Math.abs(g.tx - knight.x) < 38 && knight.y < 46) hurtKnight(g.tx, 'sauce');
      // splat
      g.el.innerHTML = '<ellipse rx="16" ry="5" fill="#c8362b" opacity="0.8"/>';
      const el = g.el, sh = g.shadow;
      setTimeout(() => { el.remove(); sh.remove(); }, 500);
      knight.globs.splice(i, 1);
    }
  }

  // Wall archers loose arrows at whatever's waddling
  if (knight.archers.length) {
    const alive = knight.enemies.filter((e) => !e.dead);
    for (const a of knight.archers) {
      a.shootT -= dt;
      if (a.shootT <= 0 && alive.length) {
        a.shootT = 2.4 + Math.random() * 1.2;
        shootArrow(a, alive[Math.floor(Math.random() * alive.length)]);
      }
    }
  }
  for (let i = knight.arrows.length - 1; i >= 0; i--) {
    const ar = knight.arrows[i];
    ar.t += dt / 0.38;
    const q3 = Math.min(ar.t, 1);
    const tx = ar.target.x, ty = K_GROUND - 34;
    const ax = ar.x0 + (tx - ar.x0) * q3;
    const ay = ar.y0 + (ty - ar.y0) * q3 + Math.sin(q3 * Math.PI) * -30;
    const ang = Math.atan2(ty - ar.y0, tx - ar.x0) * 180 / Math.PI;
    ar.el.setAttribute('transform', `translate(${ax.toFixed(1)},${ay.toFixed(1)}) rotate(${ang.toFixed(0)})`);
    if (q3 >= 1) {
      if (!ar.target.dead) {
        ar.target.hp--;
        if (ar.target.hp <= 0) killEnemy(ar.target);
        else ar.target.flashT = 0.18;
      }
      ar.el.remove();
      knight.arrows.splice(i, 1);
    }
  }

  for (let i = knight.embers.length - 1; i >= 0; i--) {
    const em = knight.embers[i];
    em.t += dt / 0.6;
    const tx = em.target.x, ty = K_GROUND - 30;
    const q2 = Math.min(em.t, 1);
    em.x = em.x0 + (tx - em.x0) * q2;
    em.y = em.y0 + (ty - em.y0) * q2 - Math.sin(q2 * Math.PI) * 120; // arcing lob
    em.el.setAttribute('cx', em.x.toFixed(1));
    em.el.setAttribute('cy', em.y.toFixed(1));
    if (q2 >= 1) {
      if (!em.target.dead) {
        em.target.hp--;
        if (em.target.hp <= 0) killEnemy(em.target);
        else {
          em.target.flashT = 0.18;
        }
      }
      em.el.remove();
      knight.embers.splice(i, 1);
    }
  }

  // Enemies
  for (let i = knight.enemies.length - 1; i >= 0; i--) {
    const e = knight.enemies[i];
    if (e.dead) {
      e.vy += K_GRAVITY * 0.7 * dt;
      e.x += e.vx * dt;
      e.y = (e.y || 0) + e.vy * dt;
      e.rot += 620 * dt * (e.vx > 0 ? 1 : -1);
      e.el.setAttribute('transform',
        `translate(${e.x.toFixed(1)},${(K_GROUND + e.y).toFixed(1)}) rotate(${e.rot.toFixed(0)})`);
      if (e.y > 300 || e.x < -150 || e.x > 1750) {
        e.el.remove();
        knight.enemies.splice(i, 1);
      }
      continue;
    }
    if (e.flashT > 0) e.flashT -= dt;
    e.el.classList.toggle('k-en-flash', e.flashT > 0);
    const toward = Math.sign(knight.x - e.x) || 1;
    // KO'd knight gets a moment's mercy — the horde mills about instead of piling on.
    const advance = knight.ko > 0 ? 0.25 : 1;
    const dist = Math.abs(e.x - knight.x);
    e.waddle += dt * (e.type === 'fork' || e.type === 'whisk' ? 5 : 8);
    let hop = Math.abs(Math.sin(e.waddle)) * (e.type === 'fork' ? 4 : e.type === 'whisk' ? 3 : 6);
    let tilt = Math.sin(e.waddle) * (e.type === 'fork' ? 6 : e.type === 'whisk' ? 4 : 10);

    if (e.type === 'spoon') {
      // Advance to lob range, then catapult sauce on a timer.
      if (dist > 380) e.x += toward * e.speed * advance * dt;
      else {
        e.atkT -= dt * advance;
        const held = e.el.querySelector('.k-sauce-held');
        if (e.atkT < 0.5) { tilt = -14 * toward; if (held) held.setAttribute('opacity', '1'); } // wind-up telegraph
        else if (held) held.setAttribute('opacity', '0');
        if (e.atkT <= 0) {
          e.atkT = 2.6 + Math.random() * 1.2;
          lobSauce(e);
        }
      }
    } else if (e.type === 'knife') {
      e.stateT -= dt;
      if (e.state === 'approach') {
        e.x += toward * e.speed * advance * dt;
        e.atkT -= dt * advance;
        if (e.atkT <= 0 && dist < 520 && dist > 120) { e.state = 'windup'; e.stateT = 0.55; e.dashDir = toward; }
      } else if (e.state === 'windup') {
        tilt = -22 * e.dashDir + Math.sin(e.waddle * 4) * 4; // lean back, quiver
        e.el.classList.toggle('k-en-flash', Math.floor(e.stateT * 12) % 2 === 0);
        if (e.stateT <= 0) { e.state = 'dash'; e.stateT = 0.5; }
      } else if (e.state === 'dash') {
        e.x += e.dashDir * 700 * dt;
        tilt = 64 * e.dashDir; // blade-first lunge
        hop = 2;
        if (e.stateT <= 0) { e.state = 'approach'; e.atkT = 1.8 + Math.random(); }
      }
    } else if (e.type === 'whisk') {
      e.atkT -= dt;
      if (e.state === 'spin') {
        e.stateT -= dt;
        e.rot += 900 * dt;
        tilt = e.rot % 360; // the whole whisk whirls
        hop = 4;
        // Wind gust shoves the knight away.
        if (dist < 440 && knight.ko <= 0) {
          knight.x = Math.min(Math.max(knight.x + toward * -240 * dt, K_MIN_X), K_MAX_X);
        }
        if (e.stateT <= 0) { e.state = 'approach'; e.rot = 0; }
      } else {
        e.x += toward * e.speed * advance * dt;
        if (e.atkT <= 0) {
          e.state = 'spin'; e.stateT = 1.3; e.atkT = 6;
          const [gx, gy] = knightToScreen(e.x, K_GROUND - 170);
          spawnPopLabel(gx, gy, '🌀');
        }
      }
      // Boss hp bar
      const fill = e.el.querySelector('.k-boss-hp-fill');
      if (fill) fill.setAttribute('width', String(Math.max(0, 62 * e.hp / e.maxHp)));
    } else {
      e.x += toward * e.speed * advance * dt;
    }

    e.el.setAttribute('transform',
      `translate(${e.x.toFixed(1)},${(K_GROUND - hop).toFixed(1)}) rotate(${tilt.toFixed(1)}) scale(${toward},1)`);
    // Contact damage (jump over them to avoid it)
    const reach = e.type === 'fork' ? 46 : e.type === 'whisk' ? 58 : e.type === 'knife' && e.state === 'dash' ? 44 : 38;
    if (dist < reach && knight.y < (e.type === 'whisk' ? 90 : 44)) {
      hurtKnight(e.x, e.type);
    }
  }

  // ---- Pose the rig ------------------------------------------------------------
  r.root.setAttribute('transform', `translate(${knight.x.toFixed(1)},${(K_GROUND - knight.y).toFixed(1)})`);
  r.shadow.setAttribute('transform', `translate(0,${knight.y.toFixed(1)})`);
  r.shadow.setAttribute('opacity', String(Math.max(0.15, 0.4 - knight.y * 0.001)));

  if (knight.ko > 0) {
    const q = 1 - knight.ko / KO_SECS;
    r.rig.setAttribute('transform', `scale(${knight.dir},1) rotate(${(-74 + Math.sin(q * 18) * 4).toFixed(1)}) translate(0,-6)`);
  } else {
    r.rig.setAttribute('transform', `scale(${knight.dir},1)`);
  }
  r.rig.setAttribute('opacity', knight.iT > 0 && Math.floor(knight.iT * 10) % 2 ? '0.45' : '1');

  const ph = knight.phase;
  if (knight.y > 0) {
    r.body.setAttribute('transform', 'translate(0,-6) rotate(-8)');
    r.footF.setAttribute('transform', 'translate(18,-34) rotate(20)');
    r.footB.setAttribute('transform', 'translate(-14,-26) rotate(-14)');
  } else if (knight.moving) {
    const bob = -6 - Math.abs(Math.sin(ph)) * 6;
    r.body.setAttribute('transform', `translate(2,${bob.toFixed(1)}) rotate(${(5 + Math.sin(ph * 2) * 2).toFixed(1)})`);
    const foot = (a) => {
      const fx = Math.cos(a) * 28 + 2;
      const fy = -Math.max(0, Math.sin(a)) * 24 - 2;
      return `translate(${fx.toFixed(1)},${fy.toFixed(1)}) rotate(${(Math.cos(a) * 18).toFixed(0)})`;
    };
    r.footF.setAttribute('transform', foot(ph));
    r.footB.setAttribute('transform', foot(ph + Math.PI));
  } else {
    const idle = Math.sin(performance.now() / 600) * 2;
    r.body.setAttribute('transform', `translate(0,${(-4 + idle).toFixed(1)})`);
    r.footF.setAttribute('transform', 'translate(16,-2)');
    r.footB.setAttribute('transform', 'translate(-16,-2)');
  }
  r.plume.setAttribute('transform', `rotate(${(Math.sin(performance.now() / 400) * 4).toFixed(1)})`);
  r.shieldArm.setAttribute('transform', `translate(-30,${(-48 + Math.sin(ph) * 3).toFixed(1)})`);

  // Sword arm pivots at the shoulder (26,-58 in rig space).
  r.swordArm.setAttribute('transform', `translate(26,-58) rotate(${swordAngle.toFixed(1)})`);
  if (trailOpacity > 0) {
    // A wedge sweeping behind the blade.
    const a0 = (swordAngle - 55) * Math.PI / 180;
    const a1 = swordAngle * Math.PI / 180;
    const R = 100 * knight.stats.reach;
    r.trail.setAttribute('d',
      `M0,0 L${(Math.cos(a0) * R).toFixed(1)},${(Math.sin(a0) * R).toFixed(1)} ` +
      `A${R},${R} 0 0 1 ${(Math.cos(a1) * R).toFixed(1)},${(Math.sin(a1) * R).toFixed(1)} Z`);
    r.trail.setAttribute('fill', `rgba(255,226,130,${trailOpacity.toFixed(2)})`);
  } else {
    r.trail.setAttribute('fill', 'rgba(255,226,130,0)');
  }
}

// Test/debug hook for the smoke harness.
window.knightDebug = function (opts) {
  opts = opts || {};
  if (opts.wave !== undefined) { knight.breakT = 0; startWave(opts.wave); knight.pending = 0; }
  if (opts.spawn) {
    for (let i = 0; i < (opts.n || 1); i++) {
      spawnEnemy(opts.spawn);
      const e = knight.enemies[knight.enemies.length - 1];
      e.x = opts.at !== undefined ? opts.at + i * 90 : 1100 + i * 90;
      if (opts.state) { e.state = opts.state; e.stateT = opts.stateT || 0.5; e.dashDir = -1; }
      if (opts.atkT !== undefined) e.atkT = opts.atkT;
    }
  }
  if (opts.x !== undefined) knight.x = opts.x;
  if (opts.dir !== undefined) knight.dir = opts.dir;
  if (opts.phase !== undefined) { knight.phase = opts.phase; knight.keys.right = true; }
  if (opts.y !== undefined) { knight.y = opts.y; knight.vy = 0; }
  if (opts.slash) { knightSlash(); knight.slashT = SLASH_SECS * (1 - (opts.slashQ || 0.4)); }
  if (opts.ko) { knight.hearts = 1; hurtKnight(knight.x + 10); }
  if (opts.upgrade) {
    const u = UPGRADES.find((x) => x.key === opts.upgrade);
    if (u) u.apply(knight.stats);
  }
  if (opts.showCards) { knight.pending = 0; clearKnightEnemies(); showUpgrades(); }
  stepKnight(opts.dt || 0.016, window.innerWidth, window.innerHeight);
  knight.keys.right = false;
};
