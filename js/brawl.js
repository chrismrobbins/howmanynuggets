// ---- Battered Brawlers ----------------------------------------------------------
// "SEE YOU IN HELL, MOTHER CLUCKERS."
//
// A pixel-art belt-scroller campaign in the Double Dragon mold (formerly Sauce
// Brawl). The syndicate snatched Honey Mustard at closing time, and one or two
// glove-wearing nuggets punch their way across three acts to get her back:
//
//   ACT 1 — THE RESTAURANT   (kitchen → freezer → loading dock → sauce vault)
//                            boss: WASABI THE UNMILD
//   ACT 2 — NUGGETOWN AFTER DARK (grease alley → neon strip → rooftops → penthouse)
//                            boss: DIJON, THE MUSTARD BARON
//   ACT 3 — THE SAUCE WORKS  (factory floor → vat room → packing line → the coop)
//                            boss: THE MOTHER CLUCKER (three phases, no mercy)
//
// Cutscenes between acts (punch advances, dodge skips), a route map before each
// stage, an ending + credits, then the shift loops as OVERTIME (harder, score
// keeps building — the never-reset rule from the arcade applies).
//
// HEAT is the difficulty, picked on a title flow like Knight's oaths:
// 🥛 MILD (1×) · 🌶️ SPICY (1.75×) · 🔥 HELL (3×, sealed until you clear the
// campaign on SPICY — then we'll see you in hell). Heat drives counts, hp,
// windup speed, drop rates and the score multiplier.
//
// Two-player local co-op on one keyboard (P1 WASD + F/G/H, P2 arrows + K/L/;)
// with tag revives; 1P keeps the classic arrows/WASD + X punch + space dodge.
// Combat depth: 3-hit chains, a sauce meter that pays out as a CYCLONE special,
// breakable crates dropping fries/gold/hot sauce/a spatula, and two new cup
// archetypes (Soy the dash ninja, Mayo the guard-up heavy — uppers break guard).
//
// Scoring mirrors the other games: KOs pay perFlyer-scaled points into
// storm.caught (golden cups 10x), times the heat multiplier, plus ambush / act
// / campaign-clear bonuses.

const brawlWorld = document.getElementById('brawlWorld');

const DEPTH_MAX = 30;            // belt depth in world px (0 = back, 30 = front)
const DEPTH_HIT = 7;             // |depth difference| for punches/lunges to connect
const PUNCH_CHAIN = [
  { name: 'jab', dmg: 1, reach: 15, kb: 26, dur: 0.22, active0: 0.05, active1: 0.13 },
  { name: 'jab', dmg: 1, reach: 15, kb: 26, dur: 0.22, active0: 0.05, active1: 0.13 },
  { name: 'upper', dmg: 2, reach: 17, kb: 58, dur: 0.34, active0: 0.08, active1: 0.18 },
];
const CHAIN_WINDOW = 0.5;
const DODGE_DUR = 0.28, DODGE_DIST = 34, DODGE_CD = 0.55;
const SPECIAL_DUR = 0.7, SPECIAL_DMG = 3, METER_MAX = 100;
const MAP_SECS = 2.7; // route-map interlude length (any button skips)
const CREDITS_SECS = 11;

// ---- HEAT (difficulty) -------------------------------------------------------------
// Same philosophy as Knight's oaths: not just stat sliders. Windups shorten,
// crates get stingier, KOs cost more, and HELL is earned, not given.
const BRAWL_HEATS = {
  mild: {
    emoji: '🥛', name: 'MILD', mult: 1,
    flavor: 'training grease. extra hearts, polite cups, generous crates.',
    hearts: 4, cap: 6, koHearts: 2,
    windup: 1.3, count: 0, hpUp: 0, speed: 0.85, dropFries: 0.45, bossHp: 0.8, meterGain: 1.2,
  },
  spicy: {
    emoji: '🌶️', name: 'SPICY', mult: 1.75,
    flavor: 'the true recipe. the cups mean it. clear this to earn HELL.',
    hearts: 3, cap: 5, koHearts: 2,
    windup: 1, count: 1, hpUp: 1, speed: 1.1, dropFries: 0.3, bossHp: 1.2, meterGain: 1,
  },
  hell: {
    emoji: '🔥', name: 'HELL', mult: 3,
    flavor: 'no mercy. no fries. told you we would see you down here.',
    hearts: 2, cap: 3, koHearts: 1,
    windup: 0.72, count: 2, hpUp: 2, speed: 1.32, dropFries: 0.12, bossHp: 1.7, meterGain: 0.8,
  },
};

function brawlBest() {
  try { return JSON.parse(localStorage.getItem('brawlHeatBest') || '{}'); } catch (e) { return {}; }
}
function brawlRecordBest(heat, acts, cleared) {
  const rec = brawlBest();
  const cur = rec[heat] || { acts: 0, clears: 0 };
  cur.acts = Math.max(cur.acts, acts);
  if (cleared) cur.clears = (cur.clears || 0) + 1;
  rec[heat] = cur;
  try { localStorage.setItem('brawlHeatBest', JSON.stringify(rec)); } catch (e) { /* ok */ }
}
function brawlHellUnlocked() {
  return (brawlBest().spicy || {}).clears > 0 || (brawlBest().hell || {}).acts > 0;
}

// ---- roster ------------------------------------------------------------------------

const CUPS = {
  ketchup: { hp: 2, speed: 15, value: 2, range: 13, body: '#d32f2f', dark: '#8e1c1c', lite: '#ff6659' },
  mustard: { hp: 2, speed: 24, value: 2, range: 12, body: '#e6b800', dark: '#9c7c00', lite: '#ffe23a' },
  bbq:     { hp: 4, speed: 10, value: 4, range: 15, body: '#6d3a1e', dark: '#42200e', lite: '#a05c34' },
  buffalo: { hp: 2, speed: 16, value: 3, range: 64, ranged: true, body: '#e8622c', dark: '#9c3a12', lite: '#ff9a66' },
  soy:     { hp: 2, speed: 30, value: 3, range: 52, dasher: true, body: '#33333f', dark: '#191920', lite: '#5c5c78' },
  mayo:    { hp: 7, speed: 8,  value: 5, range: 14, guard: true, body: '#efe9d6', dark: '#b0a888', lite: '#fffdf2' },
};
const GOLD = { body: '#ffd23a', dark: '#b8860b', lite: '#fff3b0' };

// Bosses are enemies with e.boss=true and a kind key into BRAWL_BOSSES.
const BRAWL_BOSSES = {
  wasabi:  { hp: 16, speed: 9,  value: 30, er: 11, banner: '🌶️ WASABI THE UNMILD 🌶️' },
  dijon:   { hp: 24, speed: 12, value: 45, er: 10, banner: '🎩 DIJON, THE MUSTARD BARON 🎩' },
  clucker: { hp: 44, speed: 11, value: 90, er: 14, banner: '🐔 THE MOTHER CLUCKER 🐔' },
};

// ---- the campaign --------------------------------------------------------------------
// Each act pre-renders its own wide strip; ambush kinds scale with heat/shift/2P.
// Crates are punchable scenery that pay out pickups ('rand' rolls at break time).
const BRAWL_ACTS = [
  {
    name: 'THE RESTAURANT', len: 2160, strip: (H, g2) => brawlStripRestaurant(H, g2),
    stages: [
      { name: 'THE KITCHEN', x0: 0, icon: 'pot' },
      { name: 'THE FREEZER', x0: 720, icon: 'flake' },
      { name: 'THE LOADING DOCK', x0: 1440, icon: 'truck' },
      { name: 'THE SAUCE VAULT', x0: 1960, icon: 'vault' },
    ],
    ambushes: [
      { x: 300, kinds: ['ketchup', 'ketchup'] },
      { x: 600, kinds: ['ketchup', 'mustard', 'ketchup'] },
      { x: 1000, kinds: ['mustard', 'bbq', 'ketchup'] },
      { x: 1300, kinds: ['bbq', 'mustard', 'buffalo'] },
      { x: 1620, kinds: ['buffalo', 'ketchup', 'mustard'] },
      { x: 1860, kinds: ['mustard', 'bbq', 'buffalo', 'ketchup'] },
      { x: 2030, kinds: ['wasabi', 'ketchup', 'mustard'] },
    ],
    crates: [
      { x: 210, d: 24, drop: 'fries' }, { x: 480, d: 5, drop: 'rand' },
      { x: 860, d: 21, drop: 'spatula' }, { x: 1180, d: 8, drop: 'rand' },
      { x: 1560, d: 23, drop: 'fries' }, { x: 1770, d: 6, drop: 'hotsauce' },
      { x: 1990, d: 25, drop: 'fries' },
    ],
    wander: ['ketchup', 'mustard', 'bbq', 'buffalo'],
  },
  {
    name: 'NUGGETOWN AFTER DARK', len: 2400, strip: (H, g2) => brawlStripNuggetown(H, g2),
    stages: [
      { name: 'GREASE ALLEY', x0: 0, icon: 'trash' },
      { name: 'THE NEON STRIP', x0: 800, icon: 'neon' },
      { name: 'THE ROOFTOPS', x0: 1600, icon: 'roof' },
      { name: 'MUSTARD PENTHOUSE', x0: 2180, icon: 'crown' },
    ],
    ambushes: [
      { x: 260, kinds: ['soy', 'ketchup'] },
      { x: 560, kinds: ['mustard', 'soy', 'mustard'] },
      { x: 900, kinds: ['mayo', 'ketchup', 'ketchup'] },
      { x: 1180, kinds: ['soy', 'soy', 'buffalo'] },
      { x: 1460, kinds: ['mayo', 'mustard', 'soy'] },
      { x: 1750, kinds: ['bbq', 'bbq', 'soy', 'ketchup'] },
      { x: 1990, kinds: ['mayo', 'buffalo', 'soy', 'mustard'] },
      { x: 2250, kinds: ['dijon', 'mustard', 'mustard'] },
    ],
    crates: [
      { x: 190, d: 6, drop: 'rand' }, { x: 500, d: 23, drop: 'fries' },
      { x: 840, d: 8, drop: 'spatula' }, { x: 1240, d: 22, drop: 'rand' },
      { x: 1540, d: 5, drop: 'hotsauce' }, { x: 1880, d: 24, drop: 'fries' },
      { x: 2100, d: 8, drop: 'rand' },
    ],
    wander: ['ketchup', 'mustard', 'buffalo', 'soy'],
  },
  {
    name: 'THE SAUCE WORKS', len: 2400, strip: (H, g2) => brawlStripSauceWorks(H, g2),
    stages: [
      { name: 'THE FACTORY FLOOR', x0: 0, icon: 'gear' },
      { name: 'THE VAT ROOM', x0: 800, icon: 'vat' },
      { name: 'THE PACKING LINE', x0: 1600, icon: 'box' },
      { name: 'THE COOP', x0: 2180, icon: 'egg' },
    ],
    ambushes: [
      { x: 240, kinds: ['bbq', 'soy', 'ketchup'] },
      { x: 520, kinds: ['mayo', 'soy', 'mustard'] },
      { x: 820, kinds: ['buffalo', 'buffalo', 'soy'] },
      { x: 1100, kinds: ['mayo', 'mayo', 'ketchup'] },
      { x: 1400, kinds: ['soy', 'soy', 'mustard', 'bbq'] },
      { x: 1700, kinds: ['mayo', 'buffalo', 'soy', 'soy'] },
      { x: 1950, kinds: ['bbq', 'mayo', 'mustard', 'soy', 'ketchup'] },
      { x: 2260, kinds: ['clucker', 'soy', 'mayo'] },
    ],
    crates: [
      { x: 200, d: 22, drop: 'fries' }, { x: 460, d: 6, drop: 'rand' },
      { x: 900, d: 24, drop: 'spatula' }, { x: 1260, d: 7, drop: 'fries' },
      { x: 1620, d: 22, drop: 'hotsauce' }, { x: 1900, d: 5, drop: 'rand' },
      { x: 2120, d: 24, drop: 'fries' },
    ],
    wander: ['mustard', 'bbq', 'buffalo', 'soy'],
  },
];

// ---- the story (punch advances a line, dodge/space skips the scene) -----------------
const BRAWL_CUTS = {
  intro: { art: 'diner', lines: [
    [null, 'NUGGETOWN. CLOSING TIME.'],
    ['HONEY', 'walk me home tonight, champ?'],
    ['???', 'BWA-KAWWW!!'],
    [null, 'the door explodes. feathers everywhere.'],
    ['CLUCKER GANG', 'the MOTHER CLUCKER sends her regards.'],
    [null, 'they took Honey Mustard. glove up.'],
  ] },
  act2: { art: 'vault', lines: [
    ['WASABI', '*cough* ...you punch like a side salad.'],
    ['WASABI', 'the Baron has your sweet cup. penthouse. the Neon Strip.'],
    ['NUG', 'then I have some stairs to climb.'],
  ] },
  act3: { art: 'penthouse', lines: [
    ['DIJON', 'impossible! I am ARTISANAL!'],
    ['DIJON', "she's at the Sauce Works... with HER. with the MOTHER CLUCKER."],
    ['DIJON', 'you fool. where do you think all that fresh batter comes from? ask your precious arcade what happened to its storm. AHAHA— *thud*'],
    ['NUG', "tell her I'm battered. not broken."],
  ] },
  finaldoor: { art: 'coop', lines: [
    ['MOTHER CLUCKER', 'welcome to the coop, little nugget.'],
    ['MOTHER CLUCKER', 'that storm everyone in Nuggetown cries about? DELICIOUS. it batters a thousand nuggets an hour downstairs.'],
    ['MOTHER CLUCKER', 'you would make SUCH a fine dipper.'],
    ['NUG', 'SEE YOU IN HELL, MOTHER CLUCKER.'],
  ] },
  ending: { art: 'sunrise', lines: [
    [null, 'the vats drain. the syndicate scatters.'],
    ['HONEY', 'my hero... you look crispy.'],
    ['NUG', 'battered. never broken.'],
    [null, 'the stolen storm was never recovered. somewhere past the docks, the water still swirls…'],
    [null, 'BATTERED BRAWLERS · thanks for playing'],
  ] },
};

// ---- state ---------------------------------------------------------------------------

const brawl = {
  on: false,
  cv: null, g: null, scale: 3, W: 340, Hh: 200, ground: 120,
  bg: null, bgAct: -1,        // the current act, pre-rendered as one wide strip
  banner: null,
  t: 0,
  heat: 'spicy', cfg: BRAWL_HEATS.spicy,
  twoP: false,
  shift: 1,                   // campaign lap (OVERTIME difficulty)
  phase: 'title',             // 'title' | 'heat' | 'cut' | 'map' | 'play' | 'end'
  heatSel: 1,                 // highlighted card on the heat screen
  cut: null,                  // { key, li, ch, next }
  act: 0, stage: 0,
  mapT: 0, endT: 0,
  cam: 0,
  locked: false,              // screen locked during an ambush
  ambushIdx: 0,               // next ambush to trigger
  goT: 0,                     // GO → arrow timer
  wanderAt: 0,                // world x that spawns the next stray grunt
  finalCutDone: false,
  kos: 0,
  enemies: [], blobs: [], fx: [], splats: [], crates: [], drops: [],
  hitstop: 0, shake: 0, crowdHype: 0,
  touch: null,
  players: [],
};

// ---- determinism ---------------------------------------------------------------------
// A harness that cannot put this game in the same place twice cannot measure it,
// and a belt-scroller is nothing BUT random placement: every cup's depth lane,
// speed, waddle phase and golden roll, every wander spawn, every crate drop, and
// the screen shake itself. So every Math.random() in this file goes through
// brawlRand(). Unseeded it IS Math.random (the shipped game is untouched);
// brawlDebug({ seed }) turns it into a mulberry32 and the same run comes back
// frame-for-frame, which is what makes an A/B diff mean anything.
let brawlSeedState = 0;
function brawlSeed(s) {
  brawl.seed = s == null ? null : (s | 0);
  brawlSeedState = brawl.seed || 0;
}
function brawlRand() {
  if (brawl.seed == null) return Math.random();
  brawlSeedState = (brawlSeedState + 0x6d2b79f5) | 0;
  let t = brawlSeedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function brawlAct() { return BRAWL_ACTS[brawl.act]; }
function brawlLen() { return brawlAct().len; }

function brawlActive() {
  return storm.mode === 'brawl' && storm.running;
}

function brawlHeartsStr(p) {
  return '❤️'.repeat(Math.max(p.hearts, 0)) + '🖤'.repeat(Math.max(brawl.cfg.hearts - p.hearts, 0));
}

function brawlTally() {
  if (brawl.phase === 'title' || brawl.phase === 'heat') return '"see you in hell, mother cluckers"';
  if (brawl.phase === 'cut') return '📖 the story so far…';
  if (brawl.phase === 'end') return '🏆 CAMPAIGN CLEAR · ' + brawl.kos + ' KOs';
  const ps = brawl.players.map((p, i) =>
    (brawl.twoP ? 'P' + (i + 1) + ' ' : '') + brawlHeartsStr(p)).join(' · ');
  const boss = brawl.enemies.find((e) => e.boss && !e.dead);
  const bossBar = boss ? ' · ' + (boss.kind === 'clucker' ? '🐔' : boss.kind === 'dijon' ? '🎩' : '🌶️') +
    ' ' + '▮'.repeat(Math.max(1, Math.ceil((boss.hp / boss.maxHp) * 10))) : '';
  return brawl.cfg.emoji + ' Shift ' + brawl.shift + ' · Act ' + (brawl.act + 1) + '/3 · ' + ps + bossBar;
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
  brawl.bg = brawlAct().strip(brawl.Hh, brawl.ground);
  brawl.bgAct = brawl.act;
}

function brawlMakePlayer(idx) {
  return {
    idx, x: 40 + idx * 16, d: 14 + (idx ? 7 : 0), face: 1, st: 'idle', stT: 0,
    keys: { l: false, r: false, u: false, dn: false },
    chain: 0, chainT: 0, hearts: brawl.cfg.hearts, iT: 0,
    dodgeCd: 0, walk: 0, punch: null, ko: false, koT: 0,
    meter: 0, weapon: null, rage: 0, kb: 0,
  };
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
    brawl.session = (brawl.session || 0) + 1; // stale act-transition timers check this
    brawl.touch = null;                       // a finger from last session isn't steering
    brawl.shift = 1;
    brawl.act = 0;
    brawl.kos = 0;
    brawl.twoP = false;
    brawl.finalCutDone = false;
    brawl.phase = 'title';
    try { brawl.heat = localStorage.getItem('brawlHeatLast') || 'spicy'; } catch (e) { /* ok */ }
    if (brawl.heat === 'hell' && !brawlHellUnlocked()) brawl.heat = 'spicy';
    brawl.cfg = BRAWL_HEATS[brawl.heat];
    brawl.heatSel = Object.keys(BRAWL_HEATS).indexOf(brawl.heat);
    brawl.players = [brawlMakePlayer(0)];
    brawl.enemies = []; brawl.blobs = []; brawl.fx = []; brawl.splats = [];
    brawl.crates = []; brawl.drops = [];
    brawlLayout();
  } else {
    brawl.banner && brawl.banner.classList.remove('show');
  }
}

function brawlBanner(text, cls, secs) {
  brawl.banner.textContent = text;
  brawl.banner.className = 'brawl-banner show' + (cls ? ' ' + cls : '');
  void brawl.banner.offsetWidth;
  clearTimeout(brawl.bannerT);
  brawl.bannerT = setTimeout(() => brawl.on && brawl.banner.classList.remove('show'), (secs || 1.4) * 1000);
}

// ---- flow ------------------------------------------------------------------------
// title → heat select → intro cutscene → (map → play …)×acts → ending → OVERTIME

function brawlChooseTitle(twoP) {
  brawl.twoP = !!twoP;
  brawl.phase = 'heat';
  sfxBrawlGo();
}

function brawlMoveHeat(dir) {
  const keys = Object.keys(BRAWL_HEATS);
  brawl.heatSel = (brawl.heatSel + dir + keys.length) % keys.length;
  sfxBrawlHit(false);
}

function brawlConfirmHeat() {
  const keys = Object.keys(BRAWL_HEATS);
  const key = keys[brawl.heatSel];
  if (key === 'hell' && !brawlHellUnlocked()) {
    brawlBanner('🔒 CLEAR SPICY FIRST — THEN WE TALK', 'boss', 1.6);
    return;
  }
  brawl.heat = key;
  brawl.cfg = BRAWL_HEATS[key];
  try { localStorage.setItem('brawlHeatLast', key); } catch (e) { /* ok */ }
  brawl.players = [brawlMakePlayer(0)];
  if (brawl.twoP) brawl.players.push(brawlMakePlayer(1));
  brawl.shift = 1;
  brawl.kos = 0;
  brawl.finalCutDone = false;
  updateStormHud();
  brawlEnterCut('intro', () => brawlStartAct(0));
}

function brawlEnterCut(key, next) {
  brawl.phase = 'cut';
  brawl.cut = { key, li: 0, ch: 0, next };
}

function brawlAdvanceCut() {
  const c = brawl.cut;
  if (!c) return;
  const line = BRAWL_CUTS[c.key].lines[c.li];
  if (c.ch < line[1].length) { c.ch = line[1].length; return; } // finish the typewriter
  c.li++;
  c.ch = 0;
  sfxBrawlHit(false);
  if (c.li >= BRAWL_CUTS[c.key].lines.length) brawlEndCut();
}

function brawlEndCut() {
  const next = brawl.cut && brawl.cut.next;
  brawl.cut = null;
  if (next) next();
}

function brawlStartAct(a) {
  brawl.act = a;
  brawl.cam = 0;
  brawl.locked = false;
  brawl.ambushIdx = 0;
  brawl.goT = 0;
  brawl.wanderAt = 150;
  brawl.enemies = [];
  brawl.blobs = [];
  brawl.fx = [];
  brawl.splats = [];
  brawl.drops = [];
  brawl.crates = BRAWL_ACTS[a].crates.map((c) => ({ ...c, hp: 2, broken: false }));
  brawl.hitstop = 0;
  brawl.shake = 0;
  for (const p of brawl.players) {
    p.x = 40 + p.idx * 16; p.d = 14 + (p.idx ? 7 : 0); p.face = 1;
    p.st = 'idle'; p.stT = 0; p.iT = 1; p.ko = false;
    p.hearts = Math.max(p.hearts, brawl.cfg.hearts); // acts heal you back to base
  }
  if (brawl.bgAct !== a && brawl.cv) { brawl.bg = brawlAct().strip(brawl.Hh, brawl.ground); brawl.bgAct = a; }
  updateStormHud();
  brawlEnterMap(0);
}

// The route map: the nugget(s) walk the dotted path to the next stage node.
function brawlEnterMap(stageIdx) {
  brawl.phase = 'map';
  brawl.stage = stageIdx;
  brawl.mapT = 0;
  brawlBanner(
    (brawl.shift > 1 && brawl.act === 0 && stageIdx === 0 ? '🥊 SHIFT ' + brawl.shift + ' — OVERTIME · ' : '') +
    'ACT ' + (brawl.act + 1) + ' — ' + brawlAct().stages[stageIdx].name,
    stageIdx === brawlAct().stages.length - 1 ? 'boss' : '', MAP_SECS
  );
}

function brawlBeginStage() {
  // the coop door: one last word from the Clucker before the final ambush
  if (brawl.act === 2 && brawl.stage === 3 && !brawl.finalCutDone) {
    brawl.finalCutDone = true;
    brawlEnterCut('finaldoor', () => brawlPlayStage());
    return;
  }
  brawlPlayStage();
}

function brawlPlayStage() {
  brawl.phase = 'play';
  const x0 = Math.max(40, brawlAct().stages[brawl.stage].x0 + 24);
  for (const p of brawl.players) {
    p.x = x0 + p.idx * 14;
    p.d = 14 + (p.idx ? 7 : 0);
    p.face = 1;
    p.iT = Math.max(p.iT, 0.8);
  }
  brawl.cam = Math.max(0, Math.min(brawlLen() - brawl.W, x0 - brawl.W * 0.42));
  brawl.goT = 2.2;
}

function brawlActCleared() {
  const bonus = Math.max(1, Math.round(storm.perFlyer * 40 * (brawl.act + 1) * brawl.shift * brawl.cfg.mult));
  storm.caught += bonus;
  spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.35, 'ACT CLEAR +' + fmt.format(bonus), 'golden');
  updateStormHud();
  brawlRecordBest(brawl.heat, brawl.act + 1, false);
  if (brawl.act < BRAWL_ACTS.length - 1) {
    brawlBanner('🏆 ACT ' + (brawl.act + 1) + ' CLEAR!', '', 2);
    const nextAct = brawl.act + 1;
    const session = brawl.session; // exit + re-enter during the beat = new session, stale timer stands down
    setTimeout(() => {
      if (!brawl.on || brawl.session !== session) return;
      if (brawl.shift > 1) brawlStartAct(nextAct); // OVERTIME skips the story
      else brawlEnterCut(nextAct === 1 ? 'act2' : 'act3', () => brawlStartAct(nextAct));
    }, 1600);
  } else {
    brawlCampaignCleared();
  }
}

function brawlCampaignCleared() {
  const bonus = Math.max(1, Math.round(storm.perFlyer * 180 * brawl.shift * brawl.cfg.mult));
  storm.caught += bonus;
  spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.35, 'CAMPAIGN CLEAR +' + fmt.format(bonus), 'golden');
  updateStormHud();
  const hellWasLocked = !brawlHellUnlocked();
  brawlRecordBest(brawl.heat, 3, true);
  brawlBanner('🏆 CAMPAIGN CLEAR!', '', 2.2);
  sfxBrawlBossDown();
  const session = brawl.session;
  setTimeout(() => {
    if (!brawl.on || brawl.session !== session) return;
    if (brawl.shift > 1) { brawlStartOvertime(); return; } // seen the credits already
    brawlEnterCut('ending', () => {
      brawl.phase = 'end';
      brawl.endT = 0;
      if (hellWasLocked && brawlHellUnlocked())
        brawlBanner('🔥 HELL UNLOCKED — SEE YOU DOWN THERE', 'boss', 3);
    });
  }, 1800);
}

function brawlStartOvertime() {
  brawl.shift++;
  brawlBanner('🌙 OVERTIME — SHIFT ' + brawl.shift, 'boss', 2.4);
  brawlStartAct(0);
}

// ---- enemies ---------------------------------------------------------------------

function brawlShiftUp() { return brawl.shift - 1; }

function spawnCup(kind, side, atX) {
  const shiftUp = brawlShiftUp();
  if (BRAWL_BOSSES[kind]) {
    const b = BRAWL_BOSSES[kind];
    const hp = Math.round((b.hp + shiftUp * 6) * brawl.cfg.bossHp * (brawl.twoP ? 1.4 : 1));
    brawl.enemies.push({
      boss: true, kind,
      x: atX + side * (brawl.W * 0.5 + 20), d: 14,
      hp, maxHp: hp, speed: (b.speed + shiftUp) * brawl.cfg.speed,
      st: 'walk', stT: 0, face: -side, dead: false, golden: false,
      minionsAt: 0.5, phase: 1, cd: 1,
    });
    return;
  }
  const c = CUPS[kind];
  const golden = brawlRand() < 0.05;
  brawl.enemies.push({
    kind,
    x: atX + side * (brawl.W * 0.5 + 12 + brawlRand() * 26),
    d: 3 + brawlRand() * (DEPTH_MAX - 6),
    hp: c.hp + brawl.cfg.hpUp + Math.floor(shiftUp / 2),
    speed: c.speed * (0.85 + brawlRand() * 0.3) * brawl.cfg.speed * (1 + shiftUp * 0.1) * (golden ? 1.5 : 1),
    st: 'walk', stT: 0, face: -side, dead: false, golden,
    guardUp: !!c.guard, blockT: 0,
    waddle: brawlRand() * 7,
  });
}

function triggerAmbush(amb) {
  brawl.locked = true;
  const center = brawl.cam + brawl.W / 2;
  let side = 1;
  let extra = brawl.cfg.count + brawlShiftUp() + (brawl.twoP ? 2 : 0);
  const kinds = amb.kinds.slice();
  const fill = kinds.filter((k) => !BRAWL_BOSSES[k]);
  while (extra-- > 0) kinds.push(fill[extra % fill.length] || 'ketchup');
  for (const kind of kinds) {
    spawnCup(kind, side, center);
    side = -side;
  }
  const boss = kinds.find((k) => BRAWL_BOSSES[k]);
  if (boss) { brawlBanner(BRAWL_BOSSES[boss].banner, 'boss', 2); if (boss === 'clucker') sfxBrawlCluck(); }
  else brawlBanner('AMBUSH!', 'fight', 0.9);
}

function pickBrawlCup() {
  const pool = brawlAct().wander;
  return pool[(brawlRand() * pool.length) | 0];
}

// ---- pickups ---------------------------------------------------------------------

function brawlSpawnDrop(kind, x, d) {
  if (kind === 'rand') {
    const r = brawlRand();
    kind = r < brawl.cfg.dropFries ? 'fries' : r < 0.62 ? 'gold' : r < 0.84 ? 'spatula' : 'hotsauce';
  }
  brawl.drops.push({ kind, x, d, t: 0 });
}

function brawlTakeDrop(p, drop) {
  const sc = brawl.scale;
  const label = (txt, cls) =>
    spawnPopLabel((drop.x - brawl.cam) * sc, (brawl.ground + drop.d - 20) * sc, txt, cls || '');
  if (drop.kind === 'fries') {
    if (p.hearts < brawl.cfg.cap) { p.hearts++; label('🍟 +1'); updateStormHud(); }
    else label('🍟 full!');
  } else if (drop.kind === 'gold') {
    const worth = Math.max(1, Math.round(storm.perFlyer * 15 * brawl.shift * brawl.cfg.mult));
    storm.caught += worth;
    label('✨ +' + fmt.format(worth), 'golden');
    updateStormHud();
  } else if (drop.kind === 'spatula') {
    p.weapon = { uses: 14 };
    label('🍳 SPATULA!');
  } else if (drop.kind === 'hotsauce') {
    p.rage = 8;
    label('🔥 HOT SAUCE!');
  }
  sfxBrawlPickup();
}

// ---- combat ----------------------------------------------------------------------

function brawlPunch(p) {
  if (!brawlActive()) return;
  // menu phases: punch is the confirm button
  if (brawl.phase === 'title') { brawlChooseTitle(false); return; }
  if (brawl.phase === 'heat') { brawlConfirmHeat(); return; }
  if (brawl.phase === 'cut') { brawlAdvanceCut(); return; }
  if (brawl.phase === 'end') { brawl.endT = CREDITS_SECS; return; }
  if (brawl.phase === 'map') { brawl.mapT = MAP_SECS; return; }
  if (!p || p.ko) return;
  if (p.st === 'jab' || p.st === 'upper' || p.st === 'hurt' || p.st === 'dodge' || p.st === 'special') return;
  const idx = (brawl.t - p.chainT < CHAIN_WINDOW) ? Math.min(p.chain, PUNCH_CHAIN.length - 1) : 0;
  const move = { ...PUNCH_CHAIN[idx], idx, hit: new Set() };
  if (p.weapon) { move.reach += 7; move.dmg += 1; move.kb += 12; p.weapon.uses--; }
  if (p.rage > 0) move.dmg *= 2;
  p.punch = move;
  p.st = move.name;
  p.stT = 0;
  p.chain = idx + 1 >= PUNCH_CHAIN.length ? 0 : idx + 1;
  if (p.weapon && p.weapon.uses <= 0) {
    p.weapon = null;
    brawlFx(p.x + p.face * 8, p.d, 12, 'spark');
  }
}

function brawlDodge(p) {
  if (!brawlActive()) return;
  if (brawl.phase === 'cut') { brawlEndCut(); return; } // skip the scene
  if (brawl.phase === 'title' || brawl.phase === 'heat') return;
  if (brawl.phase === 'end') { brawl.endT = CREDITS_SECS; return; }
  if (brawl.phase === 'map') { brawl.mapT = MAP_SECS; return; }
  if (!p || p.ko) return;
  if (p.dodgeCd > 0 || p.st === 'hurt' || p.st === 'dodge' || p.st === 'special') return;
  p.st = 'dodge';
  p.stT = 0;
  p.dodgeCd = DODGE_CD;
  p.iT = Math.max(p.iT, DODGE_DUR + 0.06);
  brawlFx(p.x - p.face * 8, p.d, 3, 'dust');
}

// CYCLONE: full sauce meter → spin with i-frames, wrecking everything nearby.
function brawlSpecial(p) {
  if (!brawlActive() || brawl.phase !== 'play' || !p || p.ko) return;
  if (p.meter < METER_MAX) return;
  if (p.st === 'hurt' || p.st === 'dodge' || p.st === 'special') return;
  p.meter = 0;
  p.st = 'special';
  p.stT = 0;
  p.iT = Math.max(p.iT, SPECIAL_DUR + 0.1);
  p.punch = { dmg: SPECIAL_DMG * (p.rage > 0 ? 2 : 1), hit: new Set() };
  brawl.shake = 0.3;
  sfxBrawlSpecial();
  const sc = brawl.scale;
  spawnPopLabel((p.x - brawl.cam) * sc, (brawl.ground + p.d - 30) * sc, '🌪️ CYCLONE!', 'golden');
}

function koCup(e, byChainIdx) {
  e.dead = true;
  e.st = 'ko';
  e.stT = 0;
  brawl.crowdHype = 1;
  brawl.kos++;
  const base = e.boss ? BRAWL_BOSSES[e.kind].value : CUPS[e.kind].value;
  const comboMult = 1 + 0.25 * (byChainIdx || 0);
  let worth = Math.max(1, Math.round(storm.perFlyer * base * comboMult *
    (1 + brawlShiftUp() * 0.5) * brawl.cfg.mult));
  if (e.golden) worth *= GOLDEN_MULTIPLIER;
  storm.caught += worth;
  const sc = brawl.scale;
  spawnPopLabel((e.x - brawl.cam) * sc, (brawl.ground + e.d - 24) * sc,
    (e.golden ? '✨ ' : '') + (e.boss ? 'BOSS DOWN! +' : '+') + fmt.format(worth),
    e.golden || e.boss ? 'golden' : '');
  brawl.splats.push({
    x: e.x, d: e.d, r: 2, max: e.boss ? 16 : 9,
    color: e.golden ? GOLD.body : (e.boss ? (e.kind === 'dijon' ? '#e6b800' : e.kind === 'clucker' ? '#f4ecd4' : '#39c96a') : CUPS[e.kind].body),
    t: 0,
  });
  updateStormHud();
  brawlFx(e.x, e.d, e.boss ? 20 : 13, 'spark', e.face, 1);
  if (e.boss) {
    brawl.shake = 0.5;
    brawl.hitstop = 0.14;
    sfxBrawlBossDown();
  } else {
    // a KO is the payoff of the whole loop and it used to land softer than a jab
    brawl.hitstop = Math.max(brawl.hitstop, 0.1);
    brawl.shake = Math.max(brawl.shake, 0.2);
  }
  if (!e.boss && brawlRand() < 0.12) {
    brawlSpawnDrop('rand', e.x, e.d); // cups occasionally drop their lunch money
  }
}

function hurtPlayer(p, fromX) {
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
    brawlBanner(brawl.twoP ? '🥴 P' + (p.idx + 1) + ' SAUCED!' : '🥴 SAUCED!', 'boss', 1.5);
    for (const e of brawl.enemies)
      if (!e.dead && !e.boss) { e.st = 'hurt'; e.stT = 0; e.kb = (e.x < p.x ? -1 : 1) * 60; }
  }
}

// `dir` is the facing of whatever caused this, so an impact sprays FORWARD
// instead of symmetrically; `big` is the weight (an upper, a KO, a cyclone).
function brawlFx(x, d, h, kind, dir, big) {
  brawl.fx.push({ x, d, h, kind, dir: dir || 0, big: big || 0, t: 0 });
}

// nearest punchable target for enemy AI (prefers whoever is still standing)
function brawlNearestPlayer(e) {
  let best = null, bd = Infinity;
  for (const p of brawl.players) {
    if (p.ko) continue;
    const d2 = Math.abs(p.x - e.x) + Math.abs(p.d - e.d) * 2;
    if (d2 < bd) { bd = d2; best = p; }
  }
  return best || brawl.players[0];
}

// ---- per-frame -------------------------------------------------------------------

function stepBrawl(dt, w, h) {
  if (!brawl.on) return;
  if (brawl.cv.width !== Math.ceil(w / brawl.scale)) brawlLayout();
  // brawlDebug({freeze:1}): redraw the exact same state forever. The harness sets
  // a pose, then screenshots; without this the rAF loop walks the clock between
  // the two and every "same frame" A/B is really two different frames.
  if (brawl.frozen) { brawlRedraw(); return; }
  brawl.t += dt;

  if (brawl.phase === 'title') { brawlDrawTitle(); return; }
  if (brawl.phase === 'heat') { brawlDrawHeat(); return; }
  if (brawl.phase === 'cut') { brawlStepCut(dt); return; }
  if (brawl.phase === 'end') { brawlStepEnd(dt); return; }

  // route-map interlude between stages
  if (brawl.phase === 'map') {
    brawl.mapT += dt;
    drawMap();
    if (brawl.mapT >= MAP_SECS) brawlBeginStage();
    return;
  }

  if (brawl.hitstop > 0) { brawl.hitstop -= dt; drawBrawl(); return; }
  brawl.shake = Math.max(0, brawl.shake - dt);
  brawl.crowdHype = Math.max(0, brawl.crowdHype - dt * 0.8);
  brawl.goT = Math.max(0, brawl.goT - dt);

  const act = brawlAct();
  const len = act.len;
  const leadX = Math.max(...brawl.players.map((p) => p.x));

  // crossing into the next stage's turf → back to the route map
  const nextStage = act.stages[brawl.stage + 1];
  if (nextStage && !brawl.locked && leadX >= nextStage.x0) {
    brawlEnterMap(brawl.stage + 1);
    drawMap();
    return;
  }

  // ambush triggers: the screen locks until the wave is down
  const nextAmb = act.ambushes[brawl.ambushIdx];
  if (!brawl.locked && nextAmb && leadX > nextAmb.x) {
    triggerAmbush(nextAmb);
    brawl.ambushIdx++;
  }
  if (brawl.locked && !brawl.enemies.some((e) => !e.dead)) {
    brawl.locked = false;
    const wasBossWave = brawl.ambushIdx >= act.ambushes.length;
    if (wasBossWave) {
      brawlActCleared();
    } else {
      const bonus = Math.max(1, Math.round(storm.perFlyer * 5 * brawl.shift * brawl.cfg.mult));
      storm.caught += bonus;
      spawnPopLabel(window.innerWidth / 2, window.innerHeight * 0.35, 'CLEAR +' + fmt.format(bonus), '');
      brawl.goT = 3.5;
      sfxBrawlGo();
      updateStormHud();
    }
  }

  // stray grunts wander in between ambushes so the walk stays lively
  if (!brawl.locked && leadX > brawl.wanderAt && brawl.ambushIdx < act.ambushes.length) {
    brawl.wanderAt = leadX + 170 + brawlRand() * 120;
    if (brawlRand() < 0.45) spawnCup(pickBrawlCup(), 1, brawl.cam + brawl.W / 2);
  }

  for (const p of brawl.players) brawlStepPlayer(p, dt, len);

  // co-op tag revive: stand over your sauced partner to pull them up
  if (brawl.twoP) {
    const [a, b] = brawl.players;
    for (const [down, up] of [[a, b], [b, a]]) {
      if (down.ko && !up.ko && Math.abs(up.x - down.x) < 10 && Math.abs(up.d - down.d) < 6 && down.koT > 0.4) {
        down.ko = false;
        down.hearts = brawl.cfg.koHearts;
        down.iT = 1.5;
        down.st = 'idle';
        const sc = brawl.scale;
        spawnPopLabel((down.x - brawl.cam) * sc, (brawl.ground + down.d - 26) * sc, '🤝 TAG!', 'golden');
        sfxBrawlPickup();
        updateStormHud();
      }
    }
  }

  // camera follows the crew unless the fight has it locked
  if (!brawl.locked) {
    const mid = brawl.players.reduce((s, p) => s + p.x, 0) / brawl.players.length;
    const target = Math.max(0, Math.min(len - brawl.W, mid - brawl.W * 0.42));
    brawl.cam += (target - brawl.cam) * Math.min(1, dt * 6);
  }
  // world clamps: locked = fight inside this screen; 2P can never leave the screen
  for (const p of brawl.players) {
    p.d = Math.max(0, Math.min(DEPTH_MAX, p.d));
    if (brawl.locked || brawl.twoP) p.x = Math.max(brawl.cam + 10, Math.min(brawl.cam + brawl.W - 10, p.x));
    if (!brawl.locked) p.x = Math.max(10, Math.min(len - 14, p.x));
  }

  brawlStepEnemies(dt);
  brawlStepBlobs(dt);
  brawlStepDrops(dt);

  for (let i = brawl.fx.length - 1; i >= 0; i--) {
    brawl.fx[i].t += dt;
    if (brawl.fx[i].t > (brawl.fx[i].kind === 'spark' ? 0.17 : 0.25)) brawl.fx.splice(i, 1);
  }
  for (let i = brawl.splats.length - 1; i >= 0; i--) {
    const s = brawl.splats[i];
    s.t += dt;
    if (s.t > 8) brawl.splats.splice(i, 1);
  }

  drawBrawl();
}

function brawlStepPlayer(p, dt, len) {
  p.iT = Math.max(0, p.iT - dt);
  p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  p.rage = Math.max(0, p.rage - dt);
  p.meter = Math.max(0, p.meter - dt * 1.2); // the sauce settles if you idle

  // getting back up after a saucing: heat decides the hearts, co-op waits longer
  if (p.ko) {
    p.koT += dt;
    if (p.koT > (brawl.twoP ? 2.4 : 1.5)) {
      p.ko = false;
      p.hearts = brawl.cfg.koHearts;
      p.iT = 1.5;
      p.st = 'idle';
      updateStormHud();
    }
    return;
  }

  p.stT += dt;
  const st = p.st;
  if (st === 'jab' || st === 'upper') {
    const m = p.punch;
    if (p.stT >= m.active0 && p.stT <= m.active1) {
      const hx = p.x + p.face * (6 + m.reach * Math.min(1, (p.stT - m.active0) / 0.05));
      brawlHitEnemies(p, m, hx, m.name === 'upper');
      brawlHitCrates(p, hx);
    }
    if (p.stT >= m.dur) { p.st = 'idle'; p.chainT = brawl.t; p.punch = null; }
  } else if (st === 'special') {
    const m = p.punch;
    for (const e of brawl.enemies) {
      if (e.dead || m.hit.has(e)) continue;
      if (Math.abs(e.x - p.x) > 24 || Math.abs(e.d - p.d) > DEPTH_HIT + 4) continue;
      m.hit.add(e);
      e.hp -= m.dmg;
      brawl.hitstop = 0.04;
      if (e.hp > 0) brawlFx((e.x + p.x) / 2, e.d, 14, 'spark', Math.sign(e.x - p.x) || 1, 1);
      sfxBrawlHit(true);
      if (e.hp <= 0) koCup(e, 2);
      else {
        e.st = 'hurt'; e.stT = 0; e.guardUp = false;
        e.kb = (e.x < p.x ? -1 : 1) * 80 * (e.boss ? 0.25 : 1);
        if (!e.boss) e.launch = 1;
      }
    }
    for (const c of brawl.crates)
      if (!c.broken && Math.abs(c.x - p.x) < 22 && Math.abs(c.d - p.d) < DEPTH_HIT + 3) brawlBreakCrate(c);
    if (p.stT >= SPECIAL_DUR) { p.st = 'idle'; p.punch = null; }
  } else if (st === 'dodge') {
    p.x += p.face * (DODGE_DIST / DODGE_DUR) * dt;
    if (p.stT >= DODGE_DUR) p.st = 'idle';
  } else if (st === 'hurt') {
    p.x += (p.kb || 0) * dt * (1 - Math.min(p.stT / 0.3, 1));
    if (p.stT >= 0.3) p.st = 'idle';
  } else {
    let mx = 0, md = 0;
    if (p.keys.l) mx -= 1;
    if (p.keys.r) mx += 1;
    if (p.keys.u) md -= 1;
    if (p.keys.dn) md += 1;
    if (p.idx === 0 && brawl.touch && brawl.touch.move) { mx = brawl.touch.dx; md = brawl.touch.dd; }
    if (mx || md) {
      const spd = p.rage > 0 ? 1.25 : 1;
      p.x += mx * 62 * spd * dt;
      p.d += md * 44 * spd * dt;
      if (mx) p.face = mx;
      p.walk += dt * 10;
      p.st = 'walk';
    } else if (st === 'walk') p.st = 'idle';
  }
}

// shared hit test for jabs/uppers: enemies block, guard, launch, and pay meter
function brawlHitEnemies(p, m, hx, isUpper) {
  for (const e of brawl.enemies) {
    if (e.dead || m.hit.has(e)) continue;
    if (Math.abs(e.d - p.d) > DEPTH_HIT + (e.boss ? 3 : 0)) continue; // must share the belt lane
    const er = e.boss ? BRAWL_BOSSES[e.kind].er : 7;
    if (Math.abs(e.x - hx) >= er + 4) continue;
    m.hit.add(e);
    // Mayo holds a guard against frontal jabs — uppers or back attacks break through
    const frontal = e.face === Math.sign(p.x - e.x);
    if (e.guardUp && frontal && !isUpper && e.st !== 'hurt') {
      e.blockT = 0.25;
      brawl.hitstop = 0.03;
      brawlFx(e.x + e.face * 7, e.d, 10, 'guard', e.face);
      sfxBrawlSlam();
      continue;
    }
    if (e.guardUp && (isUpper || !frontal)) e.guardUp = false; // guard broken for good
    e.hp -= m.dmg;
    p.meter = Math.min(METER_MAX, p.meter + 9 * brawl.cfg.meterGain * (isUpper ? 1.6 : 1));
    // WEIGHT. Every hit in this game froze the screen for exactly 0.05s and shook
    // it not at all, so a jab, an upper and a spatula swing all landed identically.
    brawl.hitstop = isUpper ? 0.075 : 0.045;
    brawl.shake = Math.max(brawl.shake, isUpper ? 0.17 : 0.07);
    // only if it SURVIVES: koCup spawns its own, bigger burst, and the first cut of
    // this stacked the two at the same point and produced a white cloud with a cup
    // somewhere inside it
    if (e.hp > 0) brawlFx((e.x + hx) / 2, e.d, isUpper ? 16 : 11, 'spark', p.face, isUpper ? 1 : 0);
    sfxBrawlHit(isUpper);
    if (e.hp <= 0) koCup(e, m.idx);
    else {
      e.st = 'hurt';
      e.stT = 0;
      e.kb = (e.x < p.x ? -1 : 1) * m.kb * (e.boss ? 0.25 : 1); // away from the player
      if (isUpper && !e.boss) e.launch = 1;
    }
  }
}

function brawlHitCrates(p, hx) {
  for (const c of brawl.crates) {
    if (c.broken || c.hitT === brawl.t) continue;
    if (Math.abs(c.d - p.d) > DEPTH_HIT + 2) continue;
    if (Math.abs(c.x - hx) >= 10) continue;
    c.hitT = brawl.t;
    c.hp--;
    brawlFx(c.x, c.d, 8, 'dust');
    sfxBrawlHit(false);
    if (c.hp <= 0) brawlBreakCrate(c);
  }
}

function brawlBreakCrate(c) {
  if (c.broken) return;
  c.broken = true;
  brawl.splats.push({ x: c.x, d: c.d, r: 2, max: 6, color: '#6d5426', t: 0 });
  brawlFx(c.x, c.d, 10, 'spark');
  brawlSpawnDrop(c.drop, c.x, c.d);
}

function brawlStepEnemies(dt) {
  const wu = brawl.cfg.windup; // heat: bigger = slower telegraphs = kinder
  for (let i = brawl.enemies.length - 1; i >= 0; i--) {
    const e = brawl.enemies[i];
    e.stT += dt;
    e.blockT = Math.max(0, (e.blockT || 0) - dt);
    const p = brawlNearestPlayer(e);
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
      brawlStepBoss(e, p, dt, wu, seekD, dx, adx, add);
      continue;
    }

    if (c.ranged) {
      if (e.st === 'walk') {
        e.face = Math.sign(dx) || 1;
        seekD();
        if (adx > c.range) e.x += e.face * e.speed * dt;
        else if (add < DEPTH_HIT + 4) { e.st = 'windup'; e.stT = 0; }
      } else if (e.st === 'windup' && e.stT > 0.4 * wu) {
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
        if (brawlRand() < 0.4) e.x -= e.face * 8;
      }
    } else if (c.dasher) {
      // soy ninja: hangs back, then blurs across the lane
      if (e.st === 'walk') {
        e.face = Math.sign(dx) || 1;
        seekD();
        if (adx > c.range) e.x += e.face * e.speed * dt;
        else if (add < DEPTH_HIT - 1) { e.st = 'windup'; e.stT = 0; }
        else e.x += e.face * e.speed * 0.4 * dt;
      } else if (e.st === 'windup' && e.stT > 0.32 * wu) {
        e.st = 'dash';
        e.stT = 0;
        e.dashHit = false;
        brawlFx(e.x, e.d, 4, 'dust');
      } else if (e.st === 'dash') {
        e.x += e.face * 175 * dt;
        for (const pl of brawl.players)
          if (!e.dashHit && Math.abs(pl.x - e.x) < 9 && Math.abs(pl.d - e.d) < DEPTH_HIT && !pl.ko && pl.iT <= 0) {
            hurtPlayer(pl, e.x - e.face * 10);
            e.dashHit = true;
          }
        if (e.stT > 0.34) { e.st = 'recover'; e.stT = 0; }
      } else if (e.st === 'recover' && e.stT > 0.85) {
        e.st = 'walk';
      }
    } else {
      if (e.st === 'walk') {
        e.face = Math.sign(dx) || 1;
        e.x += e.face * e.speed * dt;
        seekD();
        if (adx < c.range && add < DEPTH_HIT) { e.st = 'windup'; e.stT = 0; }
      } else if (e.st === 'windup' && e.stT > 0.35 * wu) {
        e.st = 'lunge';
        e.stT = 0;
      } else if (e.st === 'lunge') {
        e.x += e.face * 90 * dt;
        if (e.stT > 0.18) { e.st = 'recover'; e.stT = 0; }
        for (const pl of brawl.players)
          if (Math.abs(pl.x - e.x) < 9 && Math.abs(pl.d - e.d) < DEPTH_HIT && !pl.ko) {
            hurtPlayer(pl, e.x);
            e.st = 'recover';
            e.stT = 0;
            break;
          }
      } else if (e.st === 'recover' && e.stT > 0.5) {
        e.st = 'walk';
      }
    }
    // stragglers who never engaged despawn once far behind
    if (!brawl.locked && e.x < brawl.cam - 60) brawl.enemies.splice(i, 1);
  }
}

function brawlStepBoss(e, p, dt, wu, seekD, dx, adx, add) {
  e.cd = Math.max(0, (e.cd || 0) - dt);

  if (e.minionsAt && e.hp <= e.maxHp * e.minionsAt) {
    e.minionsAt = 0;
    spawnCup(pickBrawlCup(), 1, brawl.cam + brawl.W / 2);
    spawnCup(pickBrawlCup(), -1, brawl.cam + brawl.W / 2);
  }

  if (e.kind === 'wasabi') {
    if (e.st === 'walk') {
      e.face = Math.sign(dx) || 1;
      e.x += e.face * e.speed * dt;
      seekD();
      if (adx < 22 && add < DEPTH_HIT + 4) { e.st = 'windup'; e.stT = 0; }
    } else if (e.st === 'windup' && e.stT > 0.55 * wu) {
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
    return;
  }

  if (e.kind === 'dijon') {
    // the Baron: cane swipes up close, artisanal mustard rain from afar
    if (e.st === 'walk') {
      e.face = Math.sign(dx) || 1;
      e.x += e.face * e.speed * dt;
      seekD();
      if (e.cd <= 0) {
        if (adx < 26 && add < DEPTH_HIT + 3) { e.st = 'caneWind'; e.stT = 0; }
        else if (adx > 55) { e.st = 'rainWind'; e.stT = 0; }
      }
    } else if (e.st === 'caneWind' && e.stT > 0.4 * wu) {
      e.st = 'swipe';
      e.stT = 0;
    } else if (e.st === 'swipe') {
      e.x += e.face * 130 * dt;
      for (const pl of brawl.players)
        if (Math.abs(pl.x - e.x) < 12 && Math.abs(pl.d - e.d) < DEPTH_HIT && !pl.ko) hurtPlayer(pl, e.x);
      if (e.stT > 0.22) { e.st = 'walk'; e.cd = 1.1 * wu; }
    } else if (e.st === 'rainWind' && e.stT > 0.5 * wu) {
      e.st = 'rain';
      e.stT = 0;
      for (const off of [-6, 0, 6]) {
        const tx = p.x + off * 2, td = Math.max(2, Math.min(DEPTH_MAX - 2, p.d + off));
        const flight = Math.max(Math.abs(tx - e.x) / 95, 0.55);
        brawl.blobs.push({
          x: e.x + e.face * 6, d: td, y: -14,
          vx: (tx - e.x) / flight, vy: -40 - flight * 40, g: 170, t: 0,
          color: '#e6b800',
        });
      }
      sfxBrawlSlam();
    } else if (e.st === 'rain' && e.stT > 0.6) {
      e.st = 'walk';
      e.cd = 1.3 * wu;
    }
    return;
  }

  // THE MOTHER CLUCKER: three phases. Struts, pecks, lobs eggs; then feather
  // flurries; then an enraged stomp that shakes the whole coop.
  const frac = e.hp / e.maxHp;
  const newPhase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  if (newPhase !== e.phase) {
    e.phase = newPhase;
    sfxBrawlCluck();
    brawl.shake = 0.4;
    brawlBanner(newPhase === 2 ? '🐔 CLUCK AROUND AND FIND OUT' : '🐔 THE CLUCKER ENRAGES!', 'boss', 1.6);
    spawnCup(pickBrawlCup(), 1, brawl.cam + brawl.W / 2);
    if (newPhase === 3) spawnCup(pickBrawlCup(), -1, brawl.cam + brawl.W / 2);
  }
  const rage = e.phase === 3 ? 1.35 : 1;
  if (e.st === 'walk') {
    e.face = Math.sign(dx) || 1;
    e.x += e.face * e.speed * rage * dt;
    seekD();
    if (e.cd <= 0) {
      if (adx < 30 && add < DEPTH_HIT + 4) { e.st = 'peckWind'; e.stT = 0; }
      else if (e.phase >= 2 && adx < 90 && brawlRand() < 0.5) { e.st = 'flapWind'; e.stT = 0; }
      else if (e.phase === 3 && brawlRand() < 0.4) { e.st = 'stompWind'; e.stT = 0; }
      else if (adx > 50) { e.st = 'eggWind'; e.stT = 0; }
    }
  } else if (e.st === 'peckWind' && e.stT > 0.45 * wu / rage) {
    e.st = 'peck';
    e.stT = 0;
  } else if (e.st === 'peck') {
    e.x += e.face * 160 * dt;
    for (const pl of brawl.players)
      if (Math.abs(pl.x - e.x) < 14 && Math.abs(pl.d - e.d) < DEPTH_HIT + 1 && !pl.ko) hurtPlayer(pl, e.x);
    if (e.stT > 0.26) { e.st = 'walk'; e.cd = 1 * wu / rage; }
  } else if (e.st === 'eggWind' && e.stT > 0.45 * wu / rage) {
    e.st = 'egg';
    e.stT = 0;
    for (const pl of brawl.players) {
      if (pl.ko) continue;
      const flight = Math.max(Math.abs(pl.x - e.x) / 95, 0.55);
      brawl.blobs.push({
        x: e.x + e.face * 8, d: pl.d, y: -20,
        vx: (pl.x - e.x) / flight, vy: -44 - flight * 42, g: 175, t: 0,
        color: '#f4ecd4',
      });
    }
    sfxBrawlCluck();
  } else if (e.st === 'egg' && e.stT > 0.55) {
    e.st = 'walk';
    e.cd = 1.2 * wu / rage;
  } else if (e.st === 'flapWind' && e.stT > 0.55 * wu / rage) {
    e.st = 'flap';
    e.stT = 0;
    // feather flurry: flat quills whip out both ways across nearby lanes
    for (const [vx, doff] of [[-115, -4], [-70, 3], [70, -3], [115, 4]])
      brawl.blobs.push({
        x: e.x, d: Math.max(1, Math.min(DEPTH_MAX - 1, e.d + doff)),
        y: -8, vx, vy: 0, g: 0, t: 0, feather: true, color: '#f4ecd4',
      });
    sfxBrawlSlam();
  } else if (e.st === 'flap' && e.stT > 0.5) {
    e.st = 'walk';
    e.cd = 1.2 * wu / rage;
  } else if (e.st === 'stompWind' && e.stT > 0.6 * wu / rage) {
    e.st = 'stomp';
    e.stT = 0;
    brawl.shake = 0.45;
    brawl.blobs.push({ x: e.x - 12, d: e.d, vx: -95, y: 0, wave: true, t: 0 });
    brawl.blobs.push({ x: e.x + 12, d: e.d, vx: 95, y: 0, wave: true, t: 0 });
    sfxBrawlSlam();
  } else if (e.st === 'stomp' && e.stT > 0.55) {
    e.st = 'walk';
    e.cd = 1.1 * wu / rage;
  }
}

// ---- projectiles + shockwaves (each lives at a depth lane) -------------------------
function brawlStepBlobs(dt) {
  for (let i = brawl.blobs.length - 1; i >= 0; i--) {
    const b = brawl.blobs[i];
    b.t += dt;
    b.x += b.vx * dt;
    if (!b.wave && !b.feather) {
      b.vy += b.g * dt;
      b.y += b.vy * dt;
    }
    const gone = b.x < brawl.cam - 20 || b.x > brawl.cam + brawl.W + 20 ||
      (!b.wave && !b.feather && b.y > 2) || (b.wave && b.t > 1.4) || (b.feather && b.t > 2.2);
    if (!b.wave && !b.feather && b.y > 0 && b.vy > 0) {
      brawl.splats.push({ x: b.x, d: b.d, r: 1, max: 4, color: b.color, t: 0 });
    }
    let hit = false;
    for (const p of brawl.players) {
      if (p.ko || p.iT > 0) continue;
      if (Math.abs(b.x - p.x) < 6 && Math.abs(b.d - p.d) < DEPTH_HIT &&
        (b.wave || b.feather ? true : Math.abs(b.y - -8) < 8)) {
        hurtPlayer(p, b.x);
        hit = true;
        break;
      }
    }
    if (hit) { brawl.blobs.splice(i, 1); continue; }
    if (gone) brawl.blobs.splice(i, 1);
  }
}

function brawlStepDrops(dt) {
  for (let i = brawl.drops.length - 1; i >= 0; i--) {
    const drop = brawl.drops[i];
    drop.t += dt;
    let taken = false;
    for (const p of brawl.players) {
      if (p.ko) continue;
      if (Math.abs(p.x - drop.x) < 9 && Math.abs(p.d - drop.d) < 6) {
        brawlTakeDrop(p, drop);
        taken = true;
        break;
      }
    }
    if (taken) brawl.drops.splice(i, 1);
  }
}

// ---- PARALLAX -------------------------------------------------------------------------
// The background was ONE canvas drawn at `drawImage(brawl.bg, -round(cam), 0)`. Dead
// 1:1 with the camera, which is the one thing a side-scroller must never be: a
// belt-scroller's entire sense of space comes from layers moving at different rates,
// and this game had exactly one layer for three acts.
//
// Four planes now. `back` draws before the cast, `fore` after it:
//
//   far  0.28   the deep distance — sky and skyline outdoors, ceiling indoors
//   mid  0.60   the middle — a nearer row of towers, ducts, tanks
//   wall 1.00   everything the game already had, at the rate it already had
//   fore 1.50   overhead only, and never below y=20 (see below)
//
// TWO RULES THIS IS BUILT ON.
//
// 1. THE WALL LAYER HAD TO OPEN UP, and clearing a band out of it afterwards is
//    wrong. The wall was opaque from y 0 to the floor, so a far layer behind it is
//    a far layer nobody will ever see. What opens it is starting each section's BASE
//    FILL at `brawlGap(ground)` instead of at zero and leaving every prop exactly
//    where it is — so the fridge, the vats, the robot arms and the vault door now
//    stand SILHOUETTED against the sky instead of against more wall. Erasing the
//    band instead would have decapitated all four of them.
//
// 2. THE FOREGROUND STAYS OVERHEAD. A near layer scrolling at 1.5 is the strongest
//    depth cue available here and also the fastest way to ruin a fighting game: a
//    fighter is 20px tall standing at y 100-124, and anything drawn over that is a
//    frame where you cannot see what hit you. Every fore layer here lives in the top
//    20 pixels. Act 3's ceiling pipes were already up there at 1:1 and simply moved.
const BRAWL_RATES = { far: 0.28, mid: 0.6, fore: 1.5 };

function brawlLayer(rate, LEN, Hh) {
  const c = document.createElement('canvas');
  // A layer at rate r is only ever drawn between 0 and (LEN - W) * r, so this is
  // exactly as wide as it needs to be — no more, and never less (a layer one pixel
  // short shows the void at the end of the act).
  c.width = Math.ceil((LEN - brawl.W) * rate) + brawl.W;
  c.height = Hh;
  const g = c.getContext('2d');
  return { c, g, rate, w: c.width };
}

function brawlGap(ground) { return Math.max(20, Math.round(ground * 0.26)); }

// A row of towers, bottom-anchored, in whatever space the caller hands over. Used by
// every act — outdoors it is the skyline, indoors it is the deep end of the room.
function brawlSkylineRow(g, w, baseY, opts) {
  const o = opts || {};
  const step = o.step || 46;
  for (let i = 0, x = -12; x < w + 20; i++, x += step + ((i * 29) % 18)) {
    const bw = (o.bw || 34) + ((i * 37) % 22);
    const bh = (o.bh || 40) + ((i * 53) % (o.bhVar || 44));
    g.fillStyle = o.body;
    g.fillRect(x, baseY - bh, bw, bh + 6);
    if (o.cap && i % 3 === 0) { g.fillStyle = o.cap; g.fillRect(x + bw / 2 - 1, baseY - bh - 7, 2, 7); }
    // lit windows: a grid with holes in it, which is what a tower at night is
    // ONE IN SEVEN, not one in three. The first pass lit a third of every grid cell
    // and a distant city came back as a wall of yellow squares — at this scale a
    // skyline is mostly DARK with a few lights in it, and the darkness is the read.
    g.fillStyle = o.lit;
    for (let r = 0; r * 10 < bh - 12; r++) {
      for (let q = 0; q * 9 < bw - 8; q++) {
        if ((q * 7 + r * 13 + i * 11) % 7) continue;
        g.fillRect(x + 4 + q * 9, baseY - bh + 6 + r * 10, 2, 3);
      }
    }
  }
}

// ---- pixel rendering: the act strips ------------------------------------------------

// ACT 1's distance is INDOORS, which is the interesting case: what recedes in a
// restaurant is the ceiling and the room behind the pass. Warm, hazy, low contrast —
// the far plane of an interior is dim, not dark.
function brawlBackRestaurant(LEN, Hh, ground) {
  const GAP = brawlGap(ground);
  const far = brawlLayer(BRAWL_RATES.far, LEN, Hh);
  const mid = brawlLayer(BRAWL_RATES.mid, LEN, Hh);
  const fore = brawlLayer(BRAWL_RATES.fore, LEN, Hh);
  {
    const g = far.g, w = far.w;
    // FOUR SECTIONS, FOUR CEILINGS. The first pass ran one warm restaurant ceiling
    // the length of the act and hung heat lamps over the walk-in freezer, which
    // reads as a continuity error rather than as distance. A far layer at rate r is
    // shown at far-x = cam * r, so a section boundary at world X lands at X * r —
    // the light up there can follow the room you are actually standing in.
    const R = BRAWL_RATES.far;
    const BANDS = [
      [0, '#241a12', '#120c0a', 'rgba(255,214,140,', '#8a6a24'],          // the kitchen
      [720 * R, '#101c26', '#0a1218', 'rgba(190,228,244,', '#5d7b8c'],    // the walk-in
      [1440 * R, '#0b1020', '#070a14', 'rgba(150,175,230,', '#39465c'],   // the dock, open to the night
      [1960 * R, '#241c08', '#120e04', 'rgba(255,210,58,', '#8a7a3a'],    // the vault
    ];
    for (let b = 0; b < BANDS.length; b++) {
      const [bx, top, bot, glow, lamp] = BANDS[b];
      const bw2 = (b + 1 < BANDS.length ? BANDS[b + 1][0] : w) - bx + 2;
      const deep = g.createLinearGradient(0, 0, 0, GAP + 14);
      deep.addColorStop(0, top);
      deep.addColorStop(1, bot);
      g.fillStyle = deep;
      g.fillRect(bx, 0, bw2, GAP + 14);
      // the room keeps going: booth backs and racks, deep and small
      g.save();
      g.beginPath(); g.rect(bx, 0, bw2, GAP + 14); g.clip();
      brawlSkylineRow(g, w, GAP + 12, { body: brawlShade(bot, 1.9), lit: lamp, step: 38, bw: 26, bh: 10, bhVar: 12 });
      g.restore();
      for (let x = bx + 14; x < bx + bw2; x += 78) {
        g.fillStyle = '#3a2c14'; g.fillRect(x, 0, 1, 8);
        g.fillStyle = lamp; g.fillRect(x - 3, 8, 7, 3);
        const gl = g.createRadialGradient(x, 11, 1, x, 11, 22);
        gl.addColorStop(0, glow + '0.34)');
        gl.addColorStop(1, glow + '0)');
        g.fillStyle = gl;
        g.fillRect(x - 22, 0, 44, 34);
      }
    }
  }
  {
    const g = mid.g, w = mid.w;
    // an extract duct running the room, with its hangers
    g.fillStyle = '#2e2620';
    g.fillRect(0, GAP - 9, w, 9);
    g.fillStyle = '#3d332a';
    g.fillRect(0, GAP - 9, w, 2);
    for (let x = 10; x < w; x += 34) {
      g.fillStyle = '#241d18';
      g.fillRect(x, GAP - 9, 3, 9);
      g.fillRect(x + 12, 0, 2, GAP - 9);
    }
    // a hanging rack of pans, because a kitchen ceiling is never empty
    for (let x = 46; x < w; x += 132) {
      g.fillStyle = '#4a4038'; g.fillRect(x, GAP - 14, 52, 2);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#5d5347' : '#6e6353';
        g.fillRect(x + 5 + i * 13, GAP - 12, 8, 7);
        g.fillStyle = '#3a332c';
        g.fillRect(x + 12 + i * 13, GAP - 11, 5, 1);
      }
    }
  }
  {
    const g = fore.g, w = fore.w;
    // Heat lamps, close enough to be cropped by the frame — and they follow the same
    // four rooms the far ceiling does, via this layer's own rate. A red heat lamp
    // hanging over the walk-in freezer is exactly the continuity error the banded
    // far layer was written to avoid, one plane nearer.
    const FR = BRAWL_RATES.fore;
    const TUBE = ['#e8622c', '#bfe4f4', '#8a93b8', '#ffd23a'];
    const HALO = ['rgba(232,98,44,', 'rgba(190,228,244,', 'rgba(150,175,230,', 'rgba(255,210,58,'];
    const bandAt = (x) => x < 720 * FR ? 0 : x < 1440 * FR ? 1 : x < 1960 * FR ? 2 : 3;
    for (let x = 30; x < w; x += 116) {
      const bi = bandAt(x);
      g.fillStyle = '#1a120c'; g.fillRect(x + 7, 0, 3, 7);
      g.fillStyle = '#241811'; g.fillRect(x - 9, 6, 34, 6);
      g.fillStyle = TUBE[bi]; g.fillRect(x - 6, 12, 28, 2);
      const gl = g.createRadialGradient(x + 8, 14, 2, x + 8, 14, 26);
      gl.addColorStop(0, HALO[bi] + '0.3)');
      gl.addColorStop(1, HALO[bi] + '0)');
      g.fillStyle = gl;
      g.fillRect(x - 20, 4, 56, 20);
    }
  }
  return [far, mid, fore];
}

// ACT 2 is the one that was plainly wrong: a distant skyline painted into the same
// strip as the kerb, tracking the camera at 1:1. Sky, stars, moon and two rows of
// towers all live behind the block now.
function brawlBackNuggetown(LEN, Hh, ground) {
  const GAP = brawlGap(ground);
  const far = brawlLayer(BRAWL_RATES.far, LEN, Hh);
  const mid = brawlLayer(BRAWL_RATES.mid, LEN, Hh);
  const fore = brawlLayer(BRAWL_RATES.fore, LEN, Hh);
  {
    const g = far.g, w = far.w;
    const sky = g.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, '#05070f');
    sky.addColorStop(0.55, '#0b1122');
    sky.addColorStop(1, '#1d2135');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, ground);
    g.fillStyle = '#8a93b8';
    for (let i = 0; i < 150; i++) g.fillRect((i * 173) % w, (i * 61) % Math.max(GAP + 8, 20), 1, 1);
    // the moon, and it belongs out here: at 1:1 it used to slide past at walking pace
    const mx = Math.round(w * 0.62);
    g.fillStyle = '#f4ecd4';
    g.beginPath(); g.arc(mx, 20, 13, 0, 7); g.fill();
    g.fillStyle = '#0b1122';
    g.beginPath(); g.arc(mx + 6, 17, 11, 0, 7); g.fill();
    const mg = g.createRadialGradient(mx, 20, 8, mx, 20, 44);
    mg.addColorStop(0, 'rgba(200,214,255,0.16)');
    mg.addColorStop(1, 'rgba(200,214,255,0)');
    g.fillStyle = mg;
    g.fillRect(mx - 44, 0, 88, 64);
    brawlSkylineRow(g, w, GAP + 10, { body: '#0c1120', lit: '#26324c', step: 40, bw: 30, bh: 26, bhVar: 34 });
  }
  {
    const g = mid.g, w = mid.w;
    brawlSkylineRow(g, w, GAP + 7, {
      body: '#141a2c', lit: '#8a6c30', cap: '#ff5252', step: 52, bw: 36, bh: 30, bhVar: 40,
    });
    // a water tower on the skyline, the one silhouette that says CITY on sight
    for (let x = Math.round(w * 0.3); x < w; x += Math.round(w * 0.47)) {
      g.fillStyle = '#141a2c';
      g.fillRect(x, GAP - 22, 20, 12);
      g.fillRect(x + 2, GAP - 26, 16, 5);
      g.fillRect(x + 3, GAP - 10, 2, 12);
      g.fillRect(x + 15, GAP - 10, 2, 12);
    }
  }
  {
    const g = fore.g, w = fore.w;
    // slack wires strung across the street, and they read best CROPPED
    g.fillStyle = '#0a0c14';
    for (let x = 0; x < w; x += 3) {
      const sag = Math.round(Math.sin(x * 0.012) * 4 + 6);
      g.fillRect(x, sag, 3, 1);
      if ((x / 3) % 37 === 0) g.fillRect(x, sag, 1, 5);
    }
    for (let x = 40; x < w; x += 190) {
      g.fillStyle = '#0a0c14';
      g.fillRect(x, 0, 4, 17);
      g.fillRect(x - 7, 4, 18, 3);
    }
  }
  return [far, mid, fore];
}

// ACT 3's distance is the rest of the plant: gantries and tank tops in a green haze.
function brawlBackSauceWorks(LEN, Hh, ground) {
  const GAP = brawlGap(ground);
  const far = brawlLayer(BRAWL_RATES.far, LEN, Hh);
  const mid = brawlLayer(BRAWL_RATES.mid, LEN, Hh);
  const fore = brawlLayer(BRAWL_RATES.fore, LEN, Hh);
  {
    const g = far.g, w = far.w;
    const deep = g.createLinearGradient(0, 0, 0, GAP + 16);
    deep.addColorStop(0, '#0a1412');
    deep.addColorStop(1, '#152220');
    g.fillStyle = deep;
    g.fillRect(0, 0, w, GAP + 16);
    brawlSkylineRow(g, w, GAP + 14, { body: '#101c1c', lit: '#3f6a52', step: 34, bw: 22, bh: 14, bhVar: 16 });
    // worklights strung down the far bays
    for (let x = 18; x < w; x += 54) {
      g.fillStyle = '#c4ffd0'; g.fillRect(x, 6, 2, 2);
      const gl = g.createRadialGradient(x + 1, 7, 1, x + 1, 7, 15);
      gl.addColorStop(0, 'rgba(196,255,208,0.24)');
      gl.addColorStop(1, 'rgba(196,255,208,0)');
      g.fillStyle = gl;
      g.fillRect(x - 15, 0, 32, 24);
    }
  }
  {
    const g = mid.g, w = mid.w;
    // a gantry: two rails, a deck and its legs
    g.fillStyle = '#1b2730';
    g.fillRect(0, GAP - 12, w, 5);
    g.fillStyle = '#26343f';
    g.fillRect(0, GAP - 12, w, 1);
    for (let x = 0; x < w; x += 11) {
      g.fillStyle = '#141d24';
      g.fillRect(x, GAP - 7, 2, 7);
      g.fillRect(x + 5, GAP - 20, 1, 8);
    }
    // tank tops rising behind it
    for (let x = 30; x < w; x += 148) {
      g.fillStyle = '#1e2b34';
      g.fillRect(x, GAP - 30, 46, 18);
      g.fillStyle = '#27363f';
      g.fillRect(x + 3, GAP - 34, 40, 5);
      g.fillStyle = '#4a6a52';
      g.fillRect(x + 8, GAP - 27, 10, 3);
    }
  }
  {
    const g = fore.g, w = fore.w;
    // THE PIPES, moved off the wall layer. They were drawn at 1:1 across the whole
    // ceiling, which is the one place a 1:1 background is most obviously flat.
    for (const [py, col, h] of [[2, '#2b3a4c', 6], [10, '#22303f', 5], [17, '#334458', 4]]) {
      g.fillStyle = col;
      g.fillRect(0, py, w, h);
      g.fillStyle = brawlShade(col, 1.35);
      g.fillRect(0, py, w, 1);
      g.fillStyle = brawlShade(col, 0.55);
      for (let x = 22; x < w; x += 64) g.fillRect(x, py - 1, 5, h + 2);
    }
    // a chain hoist hanging off them
    for (let x = 90; x < w; x += 320) {
      g.fillStyle = '#1a222c';
      for (let y = 21; y < 34; y += 3) g.fillRect(x, y, 2, 2);
      g.fillRect(x - 3, 34, 8, 5);
    }
  }
  return [far, mid, fore];
}

// ACT 1 — kitchen → freezer → loading dock → vault (the original shift).
function brawlStripRestaurant(Hh, ground) {
  const LEN = 2160, SEC = 720;
  const c = document.createElement('canvas');
  c.width = LEN;
  c.height = Hh;
  const g = c.getContext('2d');

  // GAP: the wall starts BELOW this and the deep layers show above it. Every prop
  // keeps its own y, so the tall ones now stand against the distance.
  const GAP = brawlGap(ground);
  const wallFor = (sec) => sec === 0 ? ['#17222f', '#121b27'] : sec === 1 ? ['#1c2b36', '#16232d'] : ['#231a16', '#1a1310'];
  for (let sec = 0; sec < 3; sec++) {
    const x0 = sec * SEC, [wa, wb] = wallFor(sec);
    g.fillStyle = wa;
    g.fillRect(x0, GAP, SEC, ground - GAP);
    g.fillStyle = wb;
    if (sec === 2) {
      // loading dock: big bricks
      for (let y = GAP; y < ground; y += 8)
        for (let x = x0 + (((y - GAP) / 8) % 2 ? 8 : 0); x < x0 + SEC; x += 16)
          g.fillRect(x, y, 15, 7);
    } else {
      for (let y = GAP; y < ground; y += 10)
        for (let x = x0 + (((y - GAP) / 10) % 2 ? 5 : 0); x < x0 + SEC; x += 10)
          g.fillRect(x, y, 9, 9);
    }
    // top shadow, and a lintel so the cut reads as a soffit and not as a crop
    const shade = g.createLinearGradient(0, GAP, 0, ground);
    shade.addColorStop(0, 'rgba(0,0,4,0.72)');
    shade.addColorStop(0.6, 'rgba(0,0,4,0.15)');
    shade.addColorStop(1, 'rgba(0,0,4,0)');
    g.fillStyle = shade;
    g.fillRect(x0, GAP, SEC, ground - GAP);
    g.fillStyle = brawlShade(wa, 1.7);
    g.fillRect(x0, GAP, SEC, 1);
    g.fillStyle = brawlShade(wa, 0.5);
    g.fillRect(x0, GAP + 1, SEC, 2);
  }

  // ---- section 1: the kitchen (bunting, fridge, stoves, windows, shelves)
  const bunY = Math.max(GAP + 7, ground - 118);
  g.fillStyle = '#3a2c14';
  g.fillRect(0, bunY, SEC, 1);
  const flagCols = ['#d32f2f', '#ffe23a', '#26e0ff', '#ff8a3d'];
  for (let x = 4; x < SEC - 8; x += 14) {
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
    const x0 = SEC;
    // heavy freezer door at the entrance
    g.fillStyle = '#39465c'; g.fillRect(x0 + 8, ground - 100, 52, 90);
    g.fillStyle = '#232d40'; g.fillRect(x0 + 8, ground - 100, 52, 6);
    g.fillStyle = '#8a93b8'; g.fillRect(x0 + 48, ground - 62, 8, 14);
    g.fillStyle = '#c9d4f0'; g.fillRect(x0 + 14, ground - 92, 40, 3);
    // icicles along the top
    g.fillStyle = '#bfe4f4';
    for (let x = x0 + 4; x < x0 + SEC; x += 22) {
      const len = 6 + ((x * 7) % 12);
      g.fillRect(x, GAP + 3, 4, len);
      g.fillRect(x + 1, GAP + 3 + len, 2, 4);
    }
    // frost patches on the wall
    g.fillStyle = 'rgba(190,228,244,0.14)';
    for (let i = 0; i < 26; i++) {
      const fx2 = x0 + 30 + ((i * 173) % (SEC - 60));
      const fy2 = GAP + 6 + ((i * 97) % Math.max(20, ground - GAP - 46));
      g.fillRect(fx2, fy2, 14 + (i % 3) * 8, 8 + (i % 2) * 6);
    }
    // hanging frozen nugget slabs on a rail
    const railY = GAP + 6;
    g.fillStyle = '#565f85';
    g.fillRect(x0 + 120, railY, SEC - 240, 3);
    for (let i = 0; i < 7; i++) {
      const hx = x0 + 150 + i * 68;
      g.fillStyle = '#8a93b8'; g.fillRect(hx, railY + 3, 2, 12);
      g.fillStyle = '#c8a76a';
      g.fillRect(hx - 8, railY + 15, 18, 26);
      g.fillStyle = '#9db8c9';
      g.fillRect(hx - 8, railY + 15, 18, 5);
      g.fillRect(hx - 8, railY + 34, 4, 7);
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
    const x0 = SEC * 2;
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
    const vx = LEN - 96;
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

  // warm kitchen fluorescents through to the dock's sodium
  brawlStripFloor(g, LEN, Hh, ground, '#1b2434', '#242f44', '#e8412c', 'rgba(255,238,196,0.15)');
  const [far, mid, fore] = brawlBackRestaurant(LEN, Hh, ground);
  return { back: [far, mid, { c, rate: 1 }], fore: [fore] };
}

// THE BELT. Shared by all three acts (the colours set the mood), and until this
// round it was twelve identical rows of a 6px checker from the wall to the bottom
// of the screen — the same pattern at the same brightness at every depth, which
// is wallpaper laid flat, not a floor. It is also THIRTY PER CENT OF EVERY PIXEL
// IN THIS GAME, so it was the largest single surface here and the least worked.
//
// Four things going on now, all of them the floor telling you where you are:
//
//   PERSPECTIVE  rows get taller and cells get wider toward the viewer, so the
//                belt recedes instead of tiling.
//   THE RAMP     each row is lit by its distance. The back of the belt sits in
//                the wall's shadow; the front catches the room.
//   THE POOLS    overhead light, every 210px. 12-coop was the best-looking tile
//                in the baseline sheet by a distance, and the only thing it had
//                that the other eleven did not was one light pool on the floor.
//   WEAR         grease and scuffs, because a kitchen floor at closing time is
//                not a clean gradient either.
function brawlStripFloor(g, LEN, Hh, ground, a, b, lip, pool) {
  // the wall/floor junction: skirting, the lip, then the shadow the wall throws
  g.fillStyle = brawlShade(b, 0.62);
  g.fillRect(0, ground - 8, LEN, 8);
  g.fillStyle = lip;
  g.fillRect(0, ground - 8, LEN, 1);
  g.fillStyle = brawlShade(lip, 0.45);
  g.fillRect(0, ground - 7, LEN, 1);

  let y = ground, r = 0;
  while (y < Hh) {
    const rh = 4 + Math.floor(r * 0.55);
    const cw = 7 + Math.floor(r * 1.15);
    // The ramp brightens FORWARD past the original flat value, it does not just
    // darken backward: the first pass ran 0.56..1.16 on colours whose luma was
    // already 30, the whole belt came out dimmer than the checker it replaced,
    // and a contact shadow on a luma-17 floor has nothing to be darker than.
    const k = 0.72 + Math.min(1, (y - ground) / (Hh - ground)) * 0.62;
    const ca = brawlShade(a, k), cb = brawlShade(b, k);
    const off = (r % 2) * cw;
    for (let x = -cw + off; x < LEN + cw; x += cw * 2) {
      g.fillStyle = ca; g.fillRect(x, y, cw, rh);
      g.fillStyle = cb; g.fillRect(x + cw, y, cw, rh);
    }
    y += rh;
    r++;
  }

  // ambient occlusion where the belt meets the wall. Kept SHALLOW on purpose:
  // the first pass ran 15px at 0.46 and the back lane went murky enough to lose
  // a cup standing in it, and depth you cannot fight in is not depth.
  const ao = g.createLinearGradient(0, ground, 0, ground + 11);
  ao.addColorStop(0, 'rgba(0,0,4,0.30)');
  ao.addColorStop(1, 'rgba(0,0,4,0)');
  g.fillStyle = ao;
  g.fillRect(0, ground, LEN, 11);

  // the light pools, offset so no two acts pool in the same place
  for (let lx = 90 + (ground % 40); lx < LEN + 100; lx += 210) {
    const gl = g.createRadialGradient(lx, ground + 15, 3, lx, ground + 15, 104);
    gl.addColorStop(0, pool || 'rgba(255,244,214,0.13)');
    gl.addColorStop(0.55, (pool || 'rgba(255,244,214,0.13)').replace(/[\d.]+\)$/, '0.045)'));
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gl;
    g.fillRect(lx - 106, ground - 6, 212, Hh - ground + 6);
  }

  // Grease and scuffs. The first pass drew 40px bars at 0.14 across the whole
  // belt and they read as render artifacts rather than as a floor nobody mopped
  // — long, straight, horizontal and evenly lit is what a bug looks like. Short,
  // low-contrast, and biased toward the FRONT rows (where a real floor is closer
  // to camera and its wear is bigger) reads as grease.
  const beltH = Math.max(10, Hh - ground);
  for (let i = 0; i < LEN / 16; i++) {
    const wx = (i * 173) % LEN;
    const t = ((i * 97) % 100) / 100;
    const wy = ground + 6 + Math.round(t * t * (beltH - 16));
    g.globalAlpha = 0.05 + ((i * 37) % 5) * 0.011;
    g.fillStyle = i % 6 === 0 ? '#f4ecd4' : '#000';
    g.fillRect(wx, wy, 4 + (i % 4) * 4 + Math.round(t * 7), 1 + (i % 3 === 0 ? 1 : 0));
    g.globalAlpha = 1;
  }
}

// ACT 2 — grease alley → neon strip → rooftops → mustard penthouse.
function brawlStripNuggetown(Hh, ground) {
  const LEN = 2400, SEC = 800;
  const c = document.createElement('canvas');
  c.width = LEN;
  c.height = Hh;
  const g = c.getContext('2d');

  // The sky, the 160 stars, the moon and the distant skyline used to be painted RIGHT
  // HERE, into the same canvas as the kerb, and scrolled with it at 1:1. They are all
  // on the far plane now (brawlBackNuggetown) — which is the whole point of the round,
  // because a moon that slides past at walking pace is the single most 1:1 thing a
  // side-scroller can put on screen.
  const GAP = brawlGap(ground);

  // ---- section 1: grease alley (brick, dumpster, fire escapes, graffiti)
  {
    g.fillStyle = '#1c1216'; g.fillRect(0, GAP, SEC, ground - GAP);
    g.fillStyle = '#140d10';
    for (let y = GAP; y < ground; y += 8)
      for (let x = (((y - GAP) / 8) % 2 ? 8 : 0); x < SEC; x += 16) g.fillRect(x, y, 15, 7);
    // a coping course, so the top of the alley wall is a roofline
    g.fillStyle = '#2a1c22'; g.fillRect(0, GAP, SEC, 3);
    g.fillStyle = '#0e0a0c'; g.fillRect(0, GAP + 3, SEC, 2);
    // fire escapes
    for (const fx of [90, 420, 660]) {
      g.fillStyle = '#2a3040';
      for (let i = 0; i < 3; i++) {
        const fy = GAP + 12 + i * 32;
        g.fillRect(fx, fy, 64, 3);
        g.fillRect(fx + 6, fy - 14, 2, 14); g.fillRect(fx + 56, fy - 14, 2, 14);
        for (let z = 0; z < 8; z++) g.fillRect(fx + 4 + z * 8, fy - 10, 1, 10);
        g.fillRect(fx + 30, fy + 3, 2, 18); // ladder rail down
        g.fillRect(fx + 40, fy + 3, 2, 18);
        for (let z = 0; z < 3; z++) g.fillRect(fx + 30, fy + 6 + z * 5, 12, 1);
      }
    }
    // graffiti: the syndicate was here
    g.save();
    g.translate(240, ground - 58);
    g.rotate(-0.06);
    g.font = '900 20px Consolas, monospace';
    g.fillStyle = '#ff2fa0';
    g.fillText('CLUCK OFF', 0, 0);
    g.font = '900 11px Consolas, monospace';
    g.fillStyle = '#26e0ff';
    g.fillText('~ the gang', 34, 14);
    g.restore();
    // dumpster + trash bags
    g.fillStyle = '#28402e'; g.fillRect(520, ground - 44, 66, 36);
    g.fillStyle = '#183020'; g.fillRect(518, ground - 50, 72, 8);
    g.fillStyle = '#e8412c'; g.fillRect(528, ground - 36, 20, 5);
    g.fillStyle = '#20242e';
    for (const [bx, r] of [[600, 9], [614, 7], [340, 8]]) {
      g.beginPath(); g.arc(bx, ground - 10 - r, r, 0, 7); g.fill();
    }
    // steam vent + back door with a lamp
    g.fillStyle = '#3a3f52'; g.fillRect(760, ground - 86, 34, 76);
    g.fillStyle = '#23283a'; g.fillRect(766, ground - 80, 22, 64);
    g.fillStyle = '#ffd23a'; g.fillRect(775, ground - 96, 6, 5);
    const lampGlow = g.createRadialGradient(778, ground - 92, 2, 778, ground - 92, 40);
    lampGlow.addColorStop(0, 'rgba(255,210,58,0.3)');
    lampGlow.addColorStop(1, 'rgba(255,210,58,0)');
    g.fillStyle = lampGlow;
    g.fillRect(738, ground - 132, 80, 130);
    g.fillStyle = 'rgba(200,210,235,0.2)';
    g.fillRect(140, ground - 40, 3, 30); g.fillRect(146, ground - 52, 2, 42);
  }

  // ---- section 2: the neon strip (storefronts, signs, an all-night fry bar)
  {
    const x0 = SEC;
    g.fillStyle = '#171522'; g.fillRect(x0, GAP, SEC, ground - GAP);
    g.fillStyle = '#100e18';
    for (let y = GAP; y < ground; y += 10)
      for (let x = x0 + (((y - GAP) / 10) % 2 ? 5 : 0); x < x0 + SEC; x += 10) g.fillRect(x, y, 9, 9);
    g.fillStyle = '#241f33'; g.fillRect(x0, GAP, SEC, 3);
    g.fillStyle = '#0d0b14'; g.fillRect(x0, GAP + 3, SEC, 2);
    const shopfront = (sx, w2, awning) => {
      g.fillStyle = '#0a0d1c'; g.fillRect(sx, ground - 64, w2, 54);
      g.fillStyle = '#ffe9a0';
      for (let i = 0; i < Math.floor(w2 / 22); i++) g.fillRect(sx + 6 + i * 22, ground - 56, 12, 18);
      g.fillStyle = awning;
      for (let i = 0; i < Math.floor(w2 / 12); i++) g.fillRect(sx + i * 12, ground - 70, 10, 8);
    };
    const neonSign = (sx, sy, text, col) => {
      g.font = '900 13px Consolas, monospace';
      const w2 = g.measureText(text).width + 12;
      g.fillStyle = '#05050c'; g.fillRect(sx - 4, sy - 13, w2, 20);
      g.strokeStyle = col; g.lineWidth = 1;
      g.strokeRect(sx - 3.5, sy - 12.5, w2 - 1, 19);
      g.fillStyle = col;
      g.fillText(text, sx + 2, sy + 2);
      const glow = g.createRadialGradient(sx + w2 / 2, sy, 3, sx + w2 / 2, sy, 46);
      glow.addColorStop(0, col === '#ff2fa0' ? 'rgba(255,47,160,0.22)' : col === '#26e0ff' ? 'rgba(38,224,255,0.22)' : 'rgba(255,226,58,0.22)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow;
      g.fillRect(sx - 46, sy - 46, w2 + 92, 92);
    };
    shopfront(x0 + 30, 150, '#d32f2f');
    neonSign(x0 + 52, ground - 96, 'NUG NOODLE', '#ff2fa0');
    shopfront(x0 + 240, 130, '#26547c');
    neonSign(x0 + 258, ground - 100, 'SAUCE BAR', '#26e0ff');
    shopfront(x0 + 430, 160, '#e6b800');
    neonSign(x0 + 452, ground - 92, 'FRY 24H', '#ffe23a');
    shopfront(x0 + 650, 120, '#39c96a');
    neonSign(x0 + 660, ground - 104, 'DIP CITY', '#ff2fa0');
    // lamppost + hydrant
    g.fillStyle = '#2a3040'; g.fillRect(x0 + 214, ground - 92, 4, 82);
    g.fillStyle = '#ffe9a0'; g.fillRect(x0 + 208, ground - 98, 16, 6);
    g.fillStyle = '#d32f2f';
    g.fillRect(x0 + 610, ground - 24, 12, 14);
    g.fillRect(x0 + 613, ground - 29, 6, 5);
  }

  // ---- section 3: the rooftops (parapet, AC units, antennae, skyline)
  {
    const x0 = SEC * 2;
    // The rooftop section's own skyline is GONE from this layer — it is the far and
    // mid planes now, and on a roof that is the difference between a painted backdrop
    // and standing above a city. What stays here is the roof you fight on.
    //
    // the roof you fight on: parapet wall along the bottom of the wall zone
    g.fillStyle = '#231f2c'; g.fillRect(x0, ground - 34, SEC, 24);
    g.fillStyle = '#2e2938';
    for (let x = x0; x < x0 + SEC; x += 14) g.fillRect(x, ground - 38, 12, 5);
    // AC units + vents + antenna
    for (const ax of [x0 + 90, x0 + 350, x0 + 620]) {
      g.fillStyle = '#39465c'; g.fillRect(ax, ground - 62, 44, 30);
      g.fillStyle = '#232d40'; g.fillRect(ax + 4, ground - 58, 24, 22);
      g.fillStyle = '#8a93b8';
      for (let z = 0; z < 5; z++) g.fillRect(ax + 6, ground - 55 + z * 4, 20, 1);
      g.fillStyle = '#565f85'; g.fillRect(ax + 32, ground - 58, 8, 22);
    }
    g.fillStyle = '#565f85';
    g.fillRect(x0 + 500, ground - 110, 3, 78);
    g.fillRect(x0 + 480, ground - 92, 43, 2);
    g.fillRect(x0 + 488, ground - 76, 27, 2);
    g.fillStyle = '#ff5252'; g.fillRect(x0 + 499, ground - 114, 5, 4);
    // pigeon... nuggets?
    g.fillStyle = '#8a93b8';
    g.fillRect(x0 + 130, ground - 66, 5, 4); g.fillRect(x0 + 139, ground - 65, 4, 3);
  }

  // ---- finale: the mustard penthouse (gold stripes, chandelier, the portrait)
  {
    const x0 = 2180;
    const w2 = LEN - x0;
    g.fillStyle = '#3a2f14'; g.fillRect(x0, 0, w2, ground);
    g.fillStyle = '#4a3c1a';
    for (let x = x0; x < LEN; x += 24) g.fillRect(x, 0, 12, ground);
    // chandelier
    g.fillStyle = '#ffd23a';
    g.fillRect(x0 + w2 / 2 - 1, 0, 2, 18);
    g.fillRect(x0 + w2 / 2 - 22, 18, 44, 3);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = '#ffe9a0';
      g.fillRect(x0 + w2 / 2 - 20 + i * 10, 21, 3, 6);
    }
    const chGlow = g.createRadialGradient(x0 + w2 / 2, 24, 4, x0 + w2 / 2, 24, 60);
    chGlow.addColorStop(0, 'rgba(255,233,160,0.3)');
    chGlow.addColorStop(1, 'rgba(255,233,160,0)');
    g.fillStyle = chGlow;
    g.fillRect(x0 + w2 / 2 - 60, 0, 120, 90);
    // the portrait: Dijon, oil on canvas, insufferable
    const px2 = x0 + 40;
    g.fillStyle = '#8a7a4a'; g.fillRect(px2 - 5, ground - 116, 74, 90);
    g.fillStyle = '#1a1408'; g.fillRect(px2, ground - 111, 64, 80);
    g.fillStyle = '#f4f0e6'; g.fillRect(px2 + 20, ground - 86, 24, 30);
    g.fillStyle = '#e6b800'; g.fillRect(px2 + 20, ground - 92, 24, 10);
    g.fillStyle = '#131313'; g.fillRect(px2 + 16, ground - 102, 32, 12); // top hat
    g.fillRect(px2 + 24, ground - 108, 16, 8);
    g.fillStyle = '#1a0f08';
    g.fillRect(px2 + 26, ground - 80, 3, 3); g.fillRect(px2 + 36, ground - 80, 3, 3);
    g.strokeStyle = '#ffd23a'; g.lineWidth = 1;
    g.strokeRect(px2 + 34.5, ground - 81.5, 7, 7); // monocle
    // velvet rope into the arena
    g.fillStyle = '#8a1c3a';
    g.fillRect(x0 + 130, ground - 40, 4, 30); g.fillRect(x0 + 190, ground - 40, 4, 30);
    g.fillStyle = '#c92f5c'; g.fillRect(x0 + 132, ground - 38, 60, 3);
  }

  // street sodium off the neon strip
  brawlStripFloor(g, LEN, Hh, ground, '#191921', '#22222c', '#e6b800', 'rgba(255,190,96,0.15)');
  // penthouse floor: red carpet with gold trim over the asphalt
  g.fillStyle = '#5c1020'; g.fillRect(2180, ground, LEN - 2180, Hh - ground);
  g.fillStyle = '#7a1830';
  for (let y = ground; y < Hh; y += 6)
    for (let x = 2180 + (((y - ground) / 6) % 2) * 6; x < LEN; x += 12) g.fillRect(x, y, 6, 6);
  g.fillStyle = '#ffd23a'; g.fillRect(2180, ground, 3, Hh - ground);
  const [far, mid, fore] = brawlBackNuggetown(LEN, Hh, ground);
  return { back: [far, mid, { c, rate: 1 }], fore: [fore] };
}

// ACT 3 — factory floor → vat room → packing line → the coop.
function brawlStripSauceWorks(Hh, ground) {
  const LEN = 2400, SEC = 800;
  const c = document.createElement('canvas');
  c.width = LEN;
  c.height = Hh;
  const g = c.getContext('2d');

  // industrial base wall. The coop paints its own full-height wall at 2180, so the
  // plant's wall stops there and the deep bays show above it everywhere else.
  const GAP = brawlGap(ground);
  g.fillStyle = '#1a2026'; g.fillRect(0, GAP, 2180, ground - GAP);
  g.fillStyle = '#131920';
  for (let y = GAP; y < ground; y += 12)
    for (let x = (((y - GAP) / 12) % 2 ? 10 : 0); x < 2180; x += 20) g.fillRect(x, y, 19, 11);
  const shade = g.createLinearGradient(0, GAP, 0, ground);
  shade.addColorStop(0, 'rgba(0,0,4,0.7)');
  shade.addColorStop(0.6, 'rgba(0,0,4,0.12)');
  shade.addColorStop(1, 'rgba(0,0,4,0)');
  g.fillStyle = shade;
  g.fillRect(0, GAP, 2180, ground - GAP);
  // a steel channel capping the wall
  g.fillStyle = '#2b3844'; g.fillRect(0, GAP, 2180, 3);
  g.fillStyle = '#0d1216'; g.fillRect(0, GAP + 3, 2180, 2);
  // The three ceiling pipe runs used to be HERE, at 1:1, which is the flattest place
  // in the frame to put a straight horizontal line. They are the foreground plane now.

  // ---- section 1: the factory floor (machines, gauges, hazard stripes)
  {
    // stencil on the wall
    g.font = '900 26px Consolas, monospace';
    g.fillStyle = 'rgba(255,226,58,0.16)';
    g.fillText('SAUCE WORKS', 60, 70);
    g.font = '900 12px Consolas, monospace';
    g.fillText('DIVISION OF MOTHER CLUCKER LLC', 62, 88);
    const machine = (mx, w2, h2) => {
      g.fillStyle = '#2e3d54'; g.fillRect(mx, ground - 10 - h2, w2, h2);
      g.fillStyle = '#232d40'; g.fillRect(mx + 4, ground - 6 - h2, w2 - 8, 10);
      g.fillStyle = '#39c96a'; g.fillRect(mx + 8, ground - 2 - h2, 4, 3);
      g.fillStyle = '#ff5252'; g.fillRect(mx + 16, ground - 2 - h2, 4, 3);
      // gauge
      g.fillStyle = '#c9d4f0';
      g.beginPath(); g.arc(mx + w2 / 2, ground - h2 + 18, 8, 0, 7); g.fill();
      g.strokeStyle = '#d32f2f'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(mx + w2 / 2, ground - h2 + 18); g.lineTo(mx + w2 / 2 + 5, ground - h2 + 13); g.stroke();
    };
    machine(60, 90, 70); machine(260, 70, 56); machine(500, 110, 78); machine(700, 60, 50);
    // hazard stripe band along the base
    for (let x = 0; x < SEC; x += 16) {
      g.fillStyle = (x / 16) % 2 ? '#ffe23a' : '#131313';
      g.fillRect(x, ground - 14, 16, 4);
    }
  }

  // ---- section 2: the vat room (three great vats, bubbling)
  {
    const x0 = SEC;
    const vat = (vx, col, lite, label) => {
      g.fillStyle = '#39465c'; g.fillRect(vx, ground - 118, 120, 108);
      g.fillStyle = '#2e3d54'; g.fillRect(vx + 6, ground - 112, 108, 96);
      g.fillStyle = col; g.fillRect(vx + 12, ground - 100, 96, 78);
      // bubbles
      g.fillStyle = lite;
      for (let i = 0; i < 14; i++)
        g.fillRect(vx + 16 + ((i * 29) % 88), ground - 96 + ((i * 17) % 68), 3, 3);
      // rim + feed pipe
      g.fillStyle = '#565f85'; g.fillRect(vx - 2, ground - 122, 124, 6);
      g.fillRect(vx + 54, GAP + 4, 10, ground - 126 - GAP);
      g.font = '900 10px Consolas, monospace';
      g.fillStyle = '#0a0d14';
      g.fillText(label, vx + 14, ground - 104);
      const glow = g.createRadialGradient(vx + 60, ground - 60, 8, vx + 60, ground - 60, 80);
      glow.addColorStop(0, 'rgba(255,255,255,0.05)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow;
      g.fillRect(vx - 20, ground - 140, 160, 140);
    };
    vat(x0 + 40, '#a81f1f', '#ff6659', 'KETCHUP');
    vat(x0 + 300, '#b89400', '#ffe23a', 'MUSTARD');
    vat(x0 + 560, '#54301a', '#a05c34', 'BBQ');
    // catwalk rail in front of the vats
    g.fillStyle = '#565f85';
    g.fillRect(x0, ground - 42, SEC, 3);
    for (let x = x0 + 10; x < x0 + SEC; x += 40) g.fillRect(x, ground - 42, 2, 32);
  }

  // ---- section 3: the packing line (conveyor, boxes, robot arms)
  {
    const x0 = SEC * 2;
    // conveyor across the section
    g.fillStyle = '#232d40'; g.fillRect(x0, ground - 58, 580, 10);
    g.fillStyle = '#131a28'; g.fillRect(x0, ground - 48, 580, 4);
    g.fillStyle = '#565f85';
    for (let x = x0 + 8; x < x0 + 580; x += 24) g.fillRect(x, ground - 56, 3, 6);
    for (let x = x0 + 20; x < x0 + 560; x += 60) {
      g.fillStyle = '#8a6c34'; g.fillRect(x, ground - 76, 26, 18);
      g.fillStyle = '#42320e';
      g.font = '900 8px Consolas, monospace';
      g.fillText('NUGS', x + 3, ground - 64);
    }
    // legs under the belt
    g.fillStyle = '#2e3d54';
    for (let x = x0 + 30; x < x0 + 580; x += 110) g.fillRect(x, ground - 48, 6, 38);
    // robot arms watching the line
    for (const ax of [x0 + 150, x0 + 420]) {
      g.fillStyle = '#39465c';
      g.fillRect(ax, ground - 120, 10, 44);
      g.fillRect(ax - 16, ground - 128, 42, 10);
      g.fillStyle = '#ff5252'; g.fillRect(ax + 24, ground - 126, 5, 5);
      g.fillStyle = '#565f85'; g.fillRect(ax - 20, ground - 124, 6, 26);
    }
    // stacked pallets
    g.fillStyle = '#6d5426';
    g.fillRect(x0 + 620, ground - 26, 60, 16);
    g.fillRect(x0 + 626, ground - 42, 48, 16);
    g.fillStyle = '#42320e';
    g.fillRect(x0 + 620, ground - 18, 60, 2); g.fillRect(x0 + 626, ground - 34, 48, 2);
  }

  // ---- finale: THE COOP (straw, the throne nest, a hanging cage)
  {
    const x0 = 2180;
    const w2 = LEN - x0;
    g.fillStyle = '#2c2210'; g.fillRect(x0, 0, w2, ground);
    // straw texture
    g.fillStyle = '#4a3a14';
    for (let i = 0; i < 120; i++)
      g.fillRect(x0 + ((i * 37) % w2), ((i * 53) % ground), 6, 1);
    g.fillStyle = '#8a6c1a';
    for (let i = 0; i < 60; i++)
      g.fillRect(x0 + ((i * 61) % w2), ((i * 91) % ground), 4, 1);
    // the banner
    g.fillStyle = '#8a1c10'; g.fillRect(x0 + 30, 14, w2 - 60, 26);
    g.fillStyle = '#5c1008';
    for (let x = x0 + 30; x < LEN - 30; x += 12) g.fillRect(x, 38, 8, 5);
    g.font = '900 13px Consolas, monospace';
    g.fillStyle = '#ffe23a';
    g.fillText('MOTHER CLUCKER', x0 + 48, 32);
    // the throne nest with a giant golden egg
    const nx = x0 + w2 / 2;
    g.fillStyle = '#6d5426';
    g.beginPath(); g.ellipse(nx, ground - 24, 62, 18, 0, 0, 7); g.fill();
    g.fillStyle = '#8a6c34';
    g.beginPath(); g.ellipse(nx, ground - 30, 54, 14, 0, 0, 7); g.fill();
    g.fillStyle = '#ffd23a';
    g.beginPath(); g.ellipse(nx, ground - 52, 20, 26, 0, 0, 7); g.fill();
    g.fillStyle = '#fff3b0';
    g.beginPath(); g.ellipse(nx - 6, ground - 60, 6, 9, 0, 0, 7); g.fill();
    const eggGlow = g.createRadialGradient(nx, ground - 52, 6, nx, ground - 52, 70);
    eggGlow.addColorStop(0, 'rgba(255,210,58,0.3)');
    eggGlow.addColorStop(1, 'rgba(255,210,58,0)');
    g.fillStyle = eggGlow;
    g.fillRect(nx - 70, ground - 122, 140, 122);
    // the hanging cage — Honey is HERE (story payoff in the background)
    const cx2 = x0 + 42;
    g.fillStyle = '#565f85';
    g.fillRect(cx2 + 13, 40, 2, 14);
    g.fillRect(cx2, 54, 28, 2);
    for (let i = 0; i < 5; i++) g.fillRect(cx2 + i * 6, 54, 2, 30);
    g.fillRect(cx2, 84, 28, 2);
    // honey mustard cup, bow and all
    g.fillStyle = '#f4f0e6'; g.fillRect(cx2 + 8, 68, 12, 12);
    g.fillStyle = '#e8a020'; g.fillRect(cx2 + 8, 71, 12, 3);
    g.fillStyle = '#ff2fa0';
    g.fillRect(cx2 + 10, 64, 3, 3); g.fillRect(cx2 + 15, 64, 3, 3); g.fillRect(cx2 + 13, 65, 2, 2);
    g.fillStyle = '#1a0f08';
    g.fillRect(cx2 + 11, 73, 2, 2); g.fillRect(cx2 + 16, 73, 2, 2);
    // scattered feathers
    g.fillStyle = '#f4ecd4';
    for (let i = 0; i < 8; i++)
      g.fillRect(x0 + 20 + ((i * 47) % (w2 - 40)), ground - 16 - ((i * 23) % 30), 5, 2);
  }

  // the works runs on cold green worklights
  brawlStripFloor(g, LEN, Hh, ground, '#20242c', '#2a2f3a', '#ffe23a', 'rgba(196,255,208,0.13)');
  // metal plate rivets
  g.fillStyle = '#39465c';
  for (let x = 24; x < 2180; x += 48) { g.fillRect(x, ground + 8, 2, 2); g.fillRect(x, Hh - 8, 2, 2); }
  // coop floor: straw over the plating
  g.fillStyle = '#3a2c10'; g.fillRect(2180, ground, LEN - 2180, Hh - ground);
  g.fillStyle = '#5c4a1a';
  for (let i = 0; i < 90; i++)
    g.fillRect(2180 + ((i * 41) % (LEN - 2180)), ground + ((i * 29) % (Hh - ground)), 5, 1);
  const [far, mid, fore] = brawlBackSauceWorks(LEN, Hh, ground);
  return { back: [far, mid, { c, rate: 1 }], fore: [fore] };
}

// ---- shared pixel helpers ----------------------------------------------------------

// One lumpy pixel nugget body, deterministic per seed. Cached per (seed, r).
const nugBodyCache = {};
function nugBody(r, seed, base, dark) {
  // r+seed ADDED collided (8,4)≡(6,6): wrong-size sprite from cache. `dark` is in
  // the key too now — the front row asks for base===dark to get a flat silhouette,
  // and without it that request came back as whatever body was cached first.
  const key = r + '|' + seed + '|' + base + '|' + dark;
  if (nugBodyCache[key]) return nugBodyCache[key];
  const size = r * 2 + 3;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  // base === dark is the FLAT request: the front row wants a silhouette, and a
  // silhouette with a lighting model on it is not a silhouette.
  const flat = base === dark;
  const R = brawlRamp(base);
  const TONES = [R.rim, R.lite, R.base, R.shade];
  for (let py = 0; py < size; py++)
    for (let px2 = 0; px2 < size; px2++) {
      const ang = Math.atan2(py - cy, px2 - cx);
      const wob = Math.sin(ang * 3 + seed) * 1.1 + Math.cos(ang * 5 + seed * 2) * 0.6;
      const d = Math.hypot((px2 - cx) / 1.12, (py - cy) / 0.95);
      if (d >= r + wob) continue;
      if (flat) {
        g.fillStyle = base;
      } else if (d > r + wob - 1.15) {
        // ONE pixel of keyline, not the 1.6 that used to eat a sixth of the sprite
        g.fillStyle = R.line;
      } else {
        // a key from up and to the left, which is the light the belt already has
        const nx = (px2 - cx) / (r || 1), ny = (py - cy) / (r || 1);
        const lam = -(nx * 0.62 + ny * 0.78);
        // a NARROW crescent of rim, not a lit hemisphere
        let t = lam > 0.80 ? 0 : lam > 0.28 ? 1 : lam > -0.45 ? 2 : 3;
        // the breading. It used to be `dark` specks, which read as DIRT on a flat
        // shape; one stop down the same ramp reads as a crumb with a dimple in it.
        if (((px2 * 3 + py * 7 + seed) % 11) === 0) t = Math.min(3, t + 1);
        else if (((px2 * 5 + py * 3 + seed * 2) % 17) === 0) t = Math.max(0, t - 1);
        g.fillStyle = TONES[t];
      }
      g.fillRect(px2, py, 1, 1);
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

// ---- light, such as it is ------------------------------------------------------------
// This game had no lighting model of any kind: every surface was authored at full
// brightness as a colour literal, and the three acts were told apart by palette
// alone. This multiply IS the lighting rig. Cached because a 200px-tall frame
// calls it a few hundred times and the inputs are a handful of literals.
const brawlShadeCache = {};
function brawlShade(hex, k) {
  const key = hex + '|' + k;
  const hit = brawlShadeCache[key];
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  const v = '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  brawlShadeCache[key] = v;
  return v;
}

// ---- THE RAMP -------------------------------------------------------------------------
// Beau, from prod: *"the characters (enemies and the main playable characters) all seem
// too 8-bit and the graphics just look terrible."* He is describing something specific
// and countable. Every character in this game was drawn with TWO fill colours — a base
// and a `dark` used for both the edge and the speckles — with no light direction, no
// outline, and in the cups' case no silhouette either: a cup was a RECTANGLE with a
// stripe across it. Two flat tones and a straight edge is not a style, it is 1985.
//
// What separates an 8-bit sprite from a 16-bit one, at the same resolution, is almost
// entirely this: a RAMP of tones lit from one direction, a dark keyline holding the
// shape, and a silhouette that is not a box. So one base colour now yields five stops,
// and the hue shift is the part that matters most — lights go WARM, shadows go COOL.
// A shadow that is only a darker version of the base reads as a dimmed photograph;
// a shadow with blue in it reads as light falling on a thing.
const brawlRampCache = {};
function brawlRamp(hex) {
  const hit = brawlRampCache[hex];
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mk = (k, dr, dg, db) => '#' + ((1 << 24)
    + (Math.max(0, Math.min(255, Math.round(r * k + dr))) << 16)
    + (Math.max(0, Math.min(255, Math.round(g * k + dg))) << 8)
    + Math.max(0, Math.min(255, Math.round(b * k + db)))).toString(16).slice(1);
  // These numbers went out too strong once and it is worth recording where the
  // ceiling is: rim 1.42 with +26 red made a 20px nugget look lit from the inside,
  // and the first crop of it was plainly worse than the two flat tones it replaced.
  // A ramp on a small sprite has to be QUIET — the shape does the work, and the
  // tones only have to stop it reading as a silhouette.
  const v = {
    rim: mk(1.2, 12, 8, 0),
    lite: mk(1.08, 5, 3, 0),
    base: hex,
    shade: mk(0.74, 0, 0, 7),
    line: mk(0.34, 2, 0, 8),
  };
  brawlRampCache[hex] = v;
  return v;
}

// THE LANE. The belt is 30 world px deep and a fighter is 20 px tall, so depth
// was carried entirely by y position — and 10px of y on a 200px screen reads as
// "standing further up the wall", not "standing further away". A punch only
// connects within DEPTH_HIT of your own lane, which made the game's central rule
// the one thing you could not see. Four quantized steps, not thirty, so
// nugBody's per-colour cache stays four entries wide instead of thirty.
const BRAWL_LANES = [0.80, 0.88, 0.95, 1.02];
function brawlLaneK(d) {
  return BRAWL_LANES[Math.max(0, Math.min(3, Math.floor(d / 7.6)))];
}

// THE CONTACT SHADOW. Not one thing in this game cast one, in a genre whose
// whole read is who is standing where — and the depth sort to hang it off has
// been sitting in drawBrawl the entire time, used for draw order only.
//
// `lift` is how far off the belt the body is drawn (the upper's launch, a boss's
// slam hop): the shadow stays on the floor and shrinks, which is the only cue in
// the game that says AIRBORNE.
const BRAWL_SHADOW = '#05070d';
function brawlShadow(g, x, d, w, lift, alpha) {
  const y = entY(d);
  const k = 1 - Math.min(0.5, (lift || 0) * 0.075);
  const ww = Math.max(3, Math.round(w * k));
  // A lozenge built from a half-width profile, one row per entry. It has to be
  // CONTIGUOUS: the first version was assembled from three rects with a stacking
  // bug that left row y+1 empty, and a shadow with a gap in it does not read as a
  // shadow — it reads as a dark bar lying on the floor behind your feet.
  const prof = ww > 18 ? [3, 1, 0, 1, 3] : [2, 0, 1, 3];
  g.globalAlpha = (alpha == null ? 0.62 : alpha) * (0.55 + k * 0.45);
  for (let i = 0; i < prof.length; i++) {
    px(g, x - ww / 2 + prof[i], y - 2 + i, ww - prof[i] * 2, 1, BRAWL_SHADOW);
  }
  g.globalAlpha = 1;
}

const BRAWL_P_COLORS = [
  { band: '#d32f2f', glove: '#d32f2f', trim: '#f4f0e6' },
  { band: '#2f6ad3', glove: '#2f6ad3', trim: '#f4f0e6' },
];

// ---- title / heat / cutscene / credits ----------------------------------------------

// The frame furniture only. It used to open by filling the whole canvas, which is why
// nothing could ever be put BEHIND a menu screen.
function brawlMenuBase(g, W, Hh, opaque) {
  if (opaque !== false) {
    g.fillStyle = '#0a0d18';
    g.fillRect(0, 0, W, Hh);
  }
  // marquee chase lights around the frame
  for (let x = 4; x < W - 4; x += 10) {
    const on = Math.floor(brawl.t * 6 + x / 10) % 3 === 0;
    px(g, x, 4, 3, 3, on ? '#ffe23a' : '#3a2c14');
    px(g, x, Hh - 7, 3, 3, on ? '#ffe23a' : '#3a2c14');
  }
}

function brawlDrawTitle() {
  const g = brawl.g, W = brawl.W, Hh = brawl.Hh;
  // THE TITLE CARD had no set at all — 88.9% of it was under luma 20 and 91% of its
  // adjacent pixel pairs were identical, on the second frame of the game. It gets the
  // diner behind it, held down far enough that the logo still owns the frame. Same
  // trick as the credits, and it costs no new art: round 4 built five sets and this
  // screen is standing next to them.
  brawlCutArt(g, W, Hh, 'diner', true);
  g.fillStyle = 'rgba(8,10,22,0.72)';
  g.fillRect(0, 0, W, Hh);
  brawlMenuBase(g, W, Hh, false);
  const cx = W / 2;
  // sauce splat behind the logo
  g.fillStyle = '#5c1008';
  g.beginPath();
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = 34 * (0.75 + 0.25 * Math.sin(a * 5 + 1.3));
    const sx = cx + Math.cos(a) * r * 2.1, sy = Hh * 0.32 + Math.sin(a) * r * 0.62;
    if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
  }
  g.fill();
  // the logo
  const bounce = Math.abs(Math.sin(brawl.t * 2.2)) * 2;
  g.textAlign = 'center';
  g.font = '900 26px Consolas, monospace';
  g.fillStyle = '#3a0808';
  g.fillText('BATTERED', cx + 2, Hh * 0.26 + 2 - bounce);
  g.fillText('BRAWLERS', cx + 2, Hh * 0.4 + 2 - bounce);
  g.fillStyle = '#ff5252';
  g.fillText('BATTERED', cx, Hh * 0.26 - bounce);
  g.fillText('BRAWLERS', cx, Hh * 0.4 - bounce);
  // the tagline
  if (Math.floor(brawl.t * 1.6) % 3 !== 0) {
    g.font = '900 8px Consolas, monospace';
    g.fillStyle = '#ffe23a';
    g.fillText('"SEE YOU IN HELL, MOTHER CLUCKERS"', cx, Hh * 0.49);
  }
  // the two brawlers, squaring up
  const gy = Hh * 0.72;
  const step = Math.floor(brawl.t * 2.5) % 2;
  g.drawImage(nugBody(8, 4, '#e8a83e', '#8a5a1d'), cx - 52, gy - 18 - step);
  px(g, cx - 50, gy - 14 - step, 14, 2, '#d32f2f');
  px(g, cx - 34, gy - 8 - step, 4, 4, '#d32f2f');
  g.drawImage(nugBody(8, 6, '#e8a83e', '#8a5a1d'), cx + 34, gy - 18 - (1 - step));
  px(g, cx + 36, gy - 14 - (1 - step), 14, 2, '#2f6ad3');
  px(g, cx + 30, gy - 8 - (1 - step), 4, 4, '#2f6ad3');
  // menu
  g.font = '900 10px Consolas, monospace';
  if (Math.floor(brawl.t * 2) % 2) {
    g.fillStyle = '#9be8ff';
    g.fillText('PUNCH / CLICK — 1 PLAYER', cx, Hh * 0.82);
  }
  g.fillStyle = '#8a93b8';
  g.fillText('PRESS [2] — 2 PLAYERS · ONE KEYBOARD', cx, Hh * 0.89);
  g.font = '700 8px Consolas, monospace';
  g.fillStyle = '#565f85';
  g.fillText('FREE PLAY · NO QUARTERS NEEDED', cx, Hh * 0.955);
}

function brawlDrawHeat() {
  const g = brawl.g, W = brawl.W, Hh = brawl.Hh;
  brawlMenuBase(g, W, Hh);
  const cx = W / 2;
  g.textAlign = 'center';
  g.font = '900 13px Consolas, monospace';
  g.fillStyle = '#ffe23a';
  g.fillText('CHOOSE YOUR HEAT', cx, 24);
  g.font = '700 8px Consolas, monospace';
  g.fillStyle = '#8a93b8';
  g.fillText(brawl.twoP ? '2P CO-OP · TAG YOUR PARTNER UP WHEN SAUCED' : '1 PLAYER', cx, 36);

  const keys = Object.keys(BRAWL_HEATS);
  const best = brawlBest();
  const cardW = Math.min(92, (W - 40) / 3), cardH = Hh * 0.44;
  const y0 = Hh * 0.24;
  keys.forEach((key, i) => {
    const o = BRAWL_HEATS[key];
    const locked = key === 'hell' && !brawlHellUnlocked();
    const x0 = cx + (i - 1) * (cardW + 10) - cardW / 2;
    const sel = i === brawl.heatSel;
    px(g, x0, y0, cardW, cardH, sel ? '#141b2c' : '#0d1220');
    g.strokeStyle = sel && Math.floor(brawl.t * 3) % 2 ? '#ffe23a' : locked ? '#39465c' : '#565f85';
    g.lineWidth = 2;
    g.strokeRect(x0 + 0.5, y0 + 0.5, cardW - 1, cardH - 1);
    g.font = '900 16px Consolas, monospace';
    g.fillStyle = '#fff';
    g.fillText(locked ? '🔒' : o.emoji, x0 + cardW / 2, y0 + 22);
    g.font = '900 11px Consolas, monospace';
    g.fillStyle = locked ? '#565f85' : key === 'hell' ? '#ff5252' : '#e8ecf4';
    g.fillText(o.name, x0 + cardW / 2, y0 + 38);
    g.font = '700 8px Consolas, monospace';
    g.fillStyle = locked ? '#39465c' : '#ffe23a';
    g.fillText(locked ? 'SEALED' : '×' + o.mult + ' SCORE', x0 + cardW / 2, y0 + 50);
    // flavor, wrapped by hand
    g.fillStyle = locked ? '#39465c' : '#8a93b8';
    const words = (locked ? 'clear the campaign on SPICY. then we will see you in hell.' : o.flavor).split(' ');
    let line = '', ly = y0 + 62;
    for (const wd of words) {
      if ((line + ' ' + wd).length > 14) { g.fillText(line, x0 + cardW / 2, ly); ly += 9; line = wd; }
      else line = line ? line + ' ' + wd : wd;
    }
    if (line) g.fillText(line, x0 + cardW / 2, ly);
    const b = best[key];
    if (b && !locked) {
      g.fillStyle = '#39c96a';
      g.fillText(b.clears ? 'CLEARED ×' + b.clears : 'best: act ' + b.acts, x0 + cardW / 2, y0 + cardH - 8);
    }
  });

  g.font = '700 8px Consolas, monospace';
  g.fillStyle = '#9be8ff';
  g.fillText('←→ or 1·2·3 to choose · PUNCH to start', cx, Hh * 0.78);
  g.fillStyle = '#565f85';
  if (brawl.twoP) {
    g.fillText('P1: WASD move · F punch · G dodge · H special', cx, Hh * 0.86);
    g.fillText('P2: ARROWS move · K punch · L dodge · ; special', cx, Hh * 0.92);
  } else {
    g.fillText('ARROWS/WASD move · X punch · SPACE dodge · C special', cx, Hh * 0.86);
    g.fillText('fill the sauce meter with hits, then unleash the CYCLONE', cx, Hh * 0.92);
  }
}

// ---- THE CARDS ------------------------------------------------------------------------
// The five screens around the game — title, heat select, cutscene, route map, credits —
// were the only layer nobody had touched, and by round 3 they measured as the worst
// frames in it by a distance: the INTRO CUTSCENE, which is the first thing a player
// ever sees, was 94% PURE BLACK and 95% under luma 20. The credits were 93%. They were
// five little pixel tableaus floating in a void with letterbox bars over the top.
//
// This is GTN S2.13's lesson applied one game over (blender/HANDOFF.md §1): S2.12
// re-rendered every sprite in that game in Blender, graded to the measured palette, and
// Beau called it invisible from prod at +4% contrast. What moved the needle was
// structured CONTENT — plazas, alleys, curbs, shadows, light pools. So none of what
// follows is a palette change. Every scene gets a SET: a backdrop that fills the
// letterbox window, a floor with a light pool on it, something framing the edges, and
// characters big enough to act.
//
// The letterbox window is y 14 .. Hh-46 and that is the whole canvas these get. The
// floor line sits at 0.52 of the frame so there is room under it for the pool.

// CUTSCENE ACTORS, DRAWN AT NATIVE SIZE AND BLITTED AT AN INTEGER SCALE.
//
// Beau sent prod screenshots back off a 4K panel and the cast in every cutscene was a
// twenty-pixel blob in a hundred-and-eighty-pixel frame. Two separate faults, and the
// harness could not see either one:
//
//   1. The cast was too small for a cutscene at ANY size. Twenty pixels in the 140px
//      picture window is 15% of frame height; a two-shot puts its actors at 35-40%.
//   2. The cast was sized in ABSOLUTE PIXELS while the frame is sized from the window
//      — `brawl.scale = max(2, floor(vh / 200))` — so the bigger the display, the
//      smaller the actors got relative to the shot. The harness ran one viewport.
//
// This fixes both without one new pixel of art: paint the actor once into an offscreen
// canvas at native size, then blit it at an integer scale that follows the frame. 2x on
// a 340x200 world, 3x on Beau's 475x242. Integer and NEAREST, so it stays crisp — a
// fractional resample here would be the one soft thing in a hard-edged game.
const brawlActorCache = {};
function brawlActor(key, w, h, paint) {
  const hit = brawlActorCache[key];
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const gg = cv.getContext('2d');
  gg.imageSmoothingEnabled = false;
  paint(gg);
  brawlActorCache[key] = cv;
  return cv;
}

// The scale a cutscene actor gets, from the height of the picture window itself.
function brawlCutK(Hh) { return Math.max(2, Math.round((Hh - 60) / 70)); }

// Blit centred on x with the FEET on footY, which is how every other draw call in
// this file is anchored.
function brawlBlit(g, cv, x, footY, k) {
  g.drawImage(cv, 0, 0, cv.width, cv.height,
    Math.round(x - (cv.width * k) / 2), Math.round(footY - cv.height * k),
    cv.width * k, cv.height * k);
}

// The hero and Honey Mustard, at native size, once.
function brawlActorNug(seed, band) {
  return brawlActor('nug' + seed + band, 22, 23, (gg) => {
    gg.drawImage(nugBody(9, seed, '#e8a83e', '#8a5a1d'), 1, 2);
    px(gg, 4, 6, 15, 3, band);
    px(gg, 2, 7, 3, 1, band);
    px(gg, 8, 13, 3, 3, '#fff'); px(gg, 14, 13, 3, 3, '#fff');
    px(gg, 9, 14, 2, 2, '#1a0f08'); px(gg, 15, 14, 2, 2, '#1a0f08');
    px(gg, 8, 10, 4, 1, '#42200e'); px(gg, 14, 10, 4, 1, '#42200e');
    px(gg, 9, 18, 5, 2, '#8a5a1d'); px(gg, 15, 18, 4, 2, '#8a5a1d');
    px(gg, 5, 20, 5, 3, '#8a5a1d'); px(gg, 13, 20, 5, 3, '#8a5a1d');
  });
}

function brawlActorHoney(dim) {
  return brawlActor('honey' + (dim ? 'd' : ''), 20, 23, (gg) => {
    const body = dim ? '#d8cfb8' : '#f4f0e6';
    px(gg, 2, 6, 17, 15, body);
    px(gg, 1, 5, 19, 2, dim ? '#b8ad94' : '#c9cfe0');
    px(gg, 2, 11, 17, 4, dim ? '#c98a1a' : '#e8a020');
    px(gg, 4, 21, 6, 2, '#8a7a5a'); px(gg, 11, 21, 6, 2, '#8a7a5a');
    px(gg, 5, 1, 5, 5, '#ff2fa0'); px(gg, 12, 1, 5, 5, '#ff2fa0');
    px(gg, 9, 3, 4, 3, '#ff2fa0');
    px(gg, 5, 16, 2, 2, '#1a0f08'); px(gg, 13, 16, 2, 2, '#1a0f08');
  });
}

// A lit floor and the wedge of light standing on it — the one move that did the most
// for the belt in round 1, reused because it is what turns a backdrop into a room.
function brawlCutFloor(g, W, gy, floorCol, poolCol, lipCol) {
  px(g, 0, gy, W, 4, lipCol);
  px(g, 0, gy + 4, W, 200, floorCol);
  const pool = g.createRadialGradient(W / 2, gy + 2, 4, W / 2, gy + 2, W * 0.42);
  pool.addColorStop(0, poolCol + '0.3)');
  pool.addColorStop(0.5, poolCol + '0.1)');
  pool.addColorStop(1, poolCol + '0)');
  g.fillStyle = pool;
  g.fillRect(0, gy - 40, W, 120);
}

// Every character on a card gets the contact shadow the cast got in round 1. A
// cutscene where the actors float is the same defect as a fight where they do.
function brawlCutShadow(g, x, gy, w, alpha) {
  g.globalAlpha = alpha == null ? 0.5 : alpha;
  px(g, x - w / 2 + 2, gy - 2, w - 4, 1, '#05070d');
  px(g, x - w / 2, gy - 1, w, 2, '#05070d');
  px(g, x - w / 2 + 2, gy + 1, w - 4, 1, '#05070d');
  g.globalAlpha = 1;
}

// `noCast` paints the SET without its actors, which is what a menu backdrop wants:
// the title card borrowed the diner and the two-shot landed straight across the logo.
function brawlCutArt(g, W, Hh, art, noCast) {
  // The floor line was at 0.52 of the frame, which is where the old tableaus put it,
  // and every one of the new sets came back with fifty pixels of empty floor between
  // the action and the bottom bar. At 0.63 the cast stands in the lower third the way
  // a shot is actually framed, and the wall gets the room it needs above them.
  const cx = W / 2, gy = Math.round(Hh * 0.63);
  const top = 14, bot = Hh - 46;

  if (art === 'diner') {
    // NUGGETOWN, CLOSING TIME. A diner: window wall on the night city, a pendant over
    // the counter, stools, the specials board, and the door that is about to explode.
    const wall = g.createLinearGradient(0, top, 0, gy);
    wall.addColorStop(0, '#14202c');
    wall.addColorStop(1, '#1d2c3a');
    g.fillStyle = wall;
    g.fillRect(0, top, W, gy - top);
    // the window wall, and the city through it
    const wy = gy - 76, wh = 40;
    px(g, 10, wy - 4, W - 20, wh + 8, '#0a0f1e');
    brawlSkylineRow(g, W - 24, wy + wh - 4, { body: '#101828', lit: '#8a6c30', step: 30, bw: 22, bh: 16, bhVar: 20 });
    px(g, 0, wy - 4, 12, wh + 8, '#26374a');
    px(g, W - 12, wy - 4, 12, wh + 8, '#26374a');
    for (let x = 40; x < W - 20; x += 58) px(g, x, wy - 4, 3, wh + 8, '#26374a');
    px(g, 10, wy - 6, W - 20, 3, '#33465c');
    px(g, 10, wy + wh + 3, W - 20, 3, '#1a2634');
    // rain on the glass, because the storm is the whole story
    g.globalAlpha = 0.3;
    for (let i = 0; i < 40; i++) px(g, 14 + ((i * 173) % (W - 28)), wy + ((i * 61) % wh), 1, 3, '#9be8ff');
    g.globalAlpha = 1;
    // the pendant over the counter
    px(g, cx - 1, top, 2, 12, '#3a2c14');
    px(g, cx - 9, gy - 96, 18, 5, '#8a6a24');
    px(g, cx - 6, gy - 91, 12, 2, '#ffe9a0');
    brawlCutFloor(g, W, gy, '#1b2434', 'rgba(255,226,170,', '#e8412c');
    // the counter, with a lip that catches the pendant
    px(g, 8, gy - 38, W - 16, 12, '#3a2c14');
    px(g, 8, gy - 40, W - 16, 3, '#5c4a1e');
    px(g, 8, gy - 37, W - 16, 1, '#8a6a34');
    px(g, 8, gy - 26, W - 16, 3, '#241a0a');
    for (let x = 26; x < W - 20; x += 46) {
      px(g, x, gy - 22, 3, 8, '#2a3040');
      px(g, x - 5, gy - 25, 13, 3, '#8a1c3a');
    }
    // the specials board
    px(g, 14, gy - 60, 56, 34, '#241a0a');
    px(g, 17, gy - 57, 50, 28, '#12241a');
    // 8px, not 6. At 6px the browser lays this out with subpixel antialiasing INSIDE
    // the world buffer and the game then magnifies that by 4 or 5 — Beau's screenshots
    // came back with "6 PC ..1.99" as a smear of overlapping glyphs. Nothing below 8px
    // survives an integer upscale, and the harness could not see it because at scale 3
    // the smear is only three pixels wide.
    g.font = '900 8px Consolas, monospace';
    g.textAlign = 'left';
    g.fillStyle = '#a5f0c0';
    g.fillText('6PC 1.99', 22, gy - 46);
    g.fillText('12PC 3.49', 22, gy - 37);
    px(g, 22, gy - 33, 33, 1, '#3f7a55');
    // THE CAST, at K times the size the rig draws them in game
    const K = brawlCutK(Hh);
    if (!noCast) {
      brawlCutShadow(g, cx - 15 * K, gy, 11 * K);
      brawlBlit(g, brawlActorNug(4, '#d32f2f'), cx - 15 * K, gy, K);
      brawlCutShadow(g, cx + 13 * K, gy, 10 * K);
      brawlBlit(g, brawlActorHoney(false), cx + 13 * K, gy, K);
    }
    // a booth back across the near edge, out of focus and cropped — the cheapest
    // foreground plane there is, and it stops the floor running to the bar
    px(g, 0, gy + 16, W, 200, '#150f0a');
    px(g, 0, gy + 16, W, 3, '#2e2114');
    px(g, 0, gy + 16, W, 1, '#4a3620');
    for (let x = 12; x < W; x += 62) px(g, x, gy + 19, 34, 4, '#241a10');
    // and the door, lit from outside, one line before it comes off its hinges
    px(g, W - 54, gy - 74, 46, 64, '#101822');
    px(g, W - 50, gy - 70, 38, 56, '#1b2a38');
    px(g, W - 46, gy - 66, 30, 26, '#0a0f1e');
    px(g, W - 54, gy - 76, 46, 3, '#33465c');
    const dg = g.createRadialGradient(W - 31, gy - 52, 4, W - 31, gy - 52, 44);
    dg.addColorStop(0, 'rgba(255,82,82,0.22)');
    dg.addColorStop(1, 'rgba(255,82,82,0)');
    g.fillStyle = dg;
    g.fillRect(W - 76, gy - 96, 76, 92);
  } else if (art === 'vault') {
    // WASABI, DOWN. The vault stands open and the gold is the light source.
    g.fillStyle = '#231a16';
    g.fillRect(0, top, W, gy - top);
    g.fillStyle = '#1a1310';
    for (let y = top; y < gy; y += 8) for (let x = ((y / 8) % 2 ? 8 : 0); x < W; x += 16) g.fillRect(x, y, 15, 7);
    // the door, big, and the room behind it
    const vx = cx - 46;
    px(g, vx - 8, gy - 96, 100, 88, '#3a3428');
    px(g, vx, gy - 88, 84, 78, '#5c5232');
    px(g, vx + 4, gy - 84, 40, 74, '#120e06');
    px(g, vx + 46, gy - 84, 34, 70, '#8a7a4a');
    px(g, vx + 50, gy - 80, 26, 62, '#5c5232');
    px(g, vx + 58, gy - 56, 12, 12, '#ffd23a');
    px(g, vx + 62, gy - 52, 4, 4, '#5c5232');
    // shelves of sauce inside, the reason anyone is here
    for (let r = 0; r < 3; r++) {
      px(g, vx + 6, gy - 74 + r * 22, 36, 3, '#2a1c10');
      for (let i = 0; i < 4; i++) {
        const cols = ['#d32f2f', '#e6b800', '#6d3a1e', '#e8622c'];
        px(g, vx + 8 + i * 9, gy - 84 + r * 22, 7, 10, cols[(i + r) % 4]);
        px(g, vx + 8 + i * 9, gy - 85 + r * 22, 7, 2, '#f4ecd4');
      }
    }
    brawlCutFloor(g, W, gy, '#241a12', 'rgba(255,210,58,', '#8a7a4a');
    const spill = g.createLinearGradient(vx + 4, 0, vx + 44, 0);
    spill.addColorStop(0, 'rgba(255,210,58,0.16)');
    spill.addColorStop(1, 'rgba(255,210,58,0)');
    g.fillStyle = spill;
    g.fillRect(vx + 4, gy - 84, 60, gy);
    // wasabi, flattened, with his sauce going everywhere
    g.globalAlpha = 0.45;
    px(g, 24, gy + 2, 74, 3, '#39c96a');
    px(g, 34, gy + 5, 50, 2, '#39c96a');
    g.globalAlpha = 1;
    brawlCutShadow(g, 60, gy, 40, 0.4);
    px(g, 34, gy - 10, 52, 10, '#2e9e53');
    px(g, 34, gy - 12, 52, 3, '#39c96a');
    px(g, 46, gy - 16, 18, 5, '#ffe23a');
    px(g, 40, gy - 8, 4, 4, '#0a2814'); px(g, 52, gy - 8, 4, 4, '#0a2814');
    px(g, 76, gy - 20, 12, 10, '#f4f0e6');
    px(g, 78, gy - 22, 8, 3, '#c9cfe0');
  } else if (art === 'penthouse') {
    // DIJON, DOWN. Gold stripes, the chandelier, and the portrait watching it happen.
    g.fillStyle = '#3a2f14';
    g.fillRect(0, top, W, gy - top);
    g.fillStyle = '#4a3c1a';
    for (let x = 0; x < W; x += 24) g.fillRect(x, top, 12, gy - top);
    px(g, 0, gy - 30, W, 5, '#6b5722');
    px(g, 0, gy - 26, W, 2, '#2a2110');
    // chandelier
    px(g, cx - 1, top, 2, 14, '#ffd23a');
    px(g, cx - 26, top + 14, 52, 3, '#ffd23a');
    for (let i = 0; i < 6; i++) {
      px(g, cx - 24 + i * 10, top + 17, 4, 8, '#ffe9a0');
      px(g, cx - 24 + i * 10, top + 25, 4, 3, '#ffd23a');
    }
    const chg = g.createRadialGradient(cx, top + 22, 6, cx, top + 22, 86);
    chg.addColorStop(0, 'rgba(255,233,160,0.3)');
    chg.addColorStop(1, 'rgba(255,233,160,0)');
    g.fillStyle = chg;
    g.fillRect(cx - 90, top, 180, 120);
    // the portrait
    const pxx = 20;
    px(g, pxx - 6, gy - 92, 84, 74, '#8a7a4a');
    px(g, pxx, gy - 86, 72, 62, '#1a1408');
    px(g, pxx + 22, gy - 62, 28, 38, '#f4f0e6');
    px(g, pxx + 22, gy - 70, 28, 12, '#e6b800');
    px(g, pxx + 17, gy - 82, 38, 14, '#131313');
    px(g, pxx + 26, gy - 90, 20, 10, '#131313');
    px(g, pxx + 29, gy - 66, 4, 4, '#1a0f08'); px(g, pxx + 41, gy - 66, 4, 4, '#1a0f08');
    g.strokeStyle = '#ffd23a'; g.lineWidth = 1;
    g.strokeRect(pxx + 39.5, gy - 68.5, 9, 9);
    brawlCutFloor(g, W, gy, '#2a2110', 'rgba(255,233,160,', '#8a1c3a');
    // the rug, so the fall lands on something
    px(g, cx - 60, gy + 6, 140, 12, '#5c1420');
    px(g, cx - 54, gy + 9, 128, 6, '#8a1c3a');
    // dijon, face down, hat rolled away
    brawlCutShadow(g, cx + 6, gy + 4, 44, 0.42);
    px(g, cx - 18, gy - 8, 48, 10, '#f4f0e6');
    px(g, cx - 18, gy - 11, 48, 4, '#e6b800');
    px(g, cx - 12, gy - 14, 14, 4, '#8a1c3a');
    px(g, cx + 34, gy - 2, 8, 4, '#131313');
    px(g, cx + 44, gy - 10, 20, 9, '#131313');
    px(g, cx + 49, gy - 15, 10, 6, '#131313');
    px(g, cx + 44, gy - 11, 20, 2, '#8a1c3a');
    px(g, cx + 66, gy - 6, 5, 5, '#ffd23a');
  } else if (art === 'coop') {
    // THE MOTHER CLUCKER. Round 1's crowd lesson, one screen over: a silhouette
    // against light reads instantly, and nothing else at this scale does. She is a
    // flat black shape with a rim on her and the whole room is behind her.
    const hot = g.createRadialGradient(cx, gy - 46, 8, cx, gy - 46, W * 0.55);
    g.fillStyle = '#0d0a06';
    g.fillRect(0, top, W, gy - top);
    hot.addColorStop(0, 'rgba(255,168,54,0.55)');
    hot.addColorStop(0.45, 'rgba(200,84,31,0.22)');
    hot.addColorStop(1, 'rgba(120,40,14,0)');
    g.fillStyle = hot;
    g.fillRect(0, top, W, gy - top + 40);
    // rafters and hanging chains against the glow
    px(g, 0, top, W, 5, '#0a0704');
    for (let x = 12; x < W; x += 44) {
      px(g, x, top + 5, 3, 16, '#0a0704');
      for (let y = top + 21; y < top + 34; y += 4) px(g, x + 1, y, 2, 2, '#0a0704');
    }
    brawlCutFloor(g, W, gy, '#2c2210', 'rgba(255,168,54,', '#4a3a14');
    // straw
    g.fillStyle = '#4a3a14';
    for (let i = 0; i < 70; i++) g.fillRect((i * 37) % W, gy + 3 + ((i * 53) % 34), 6, 1);
    // HER: 100px of black chicken
    const SIL = '#0a0705';
    brawlCutShadow(g, cx, gy, 74, 0.55);
    px(g, cx - 36, gy - 54, 72, 50, SIL);
    px(g, cx - 36, gy - 12, 72, 8, SIL);
    px(g, cx - 52, gy - 44, 18, 26, SIL);
    px(g, cx - 60, gy - 38, 12, 18, SIL);
    px(g, cx + 18, gy - 78, 22, 30, SIL);
    px(g, cx + 14, gy - 92, 34, 20, SIL);
    px(g, cx + 20, gy - 100, 8, 9, SIL);
    px(g, cx + 30, gy - 102, 8, 11, SIL);
    px(g, cx + 40, gy - 100, 7, 9, SIL);
    px(g, cx + 46, gy - 86, 16, 6, SIL);
    px(g, cx + 40, gy - 78, 8, 11, SIL);
    px(g, cx - 14, gy - 4, 8, 12, SIL); px(g, cx + 8, gy - 4, 8, 12, SIL);
    // the rim, which is the whole trick
    px(g, cx + 14, gy - 93, 34, 2, '#ffa836');
    px(g, cx + 20, gy - 101, 27, 1, '#ffd23a');
    px(g, cx + 36, gy - 76, 2, 22, '#c9541f');
    px(g, cx + 32, gy - 54, 6, 44, '#8a3a10');
    // and the EYE
    px(g, cx + 26, gy - 86, 5, 4, '#ff2020');
    px(g, cx + 27, gy - 85, 2, 2, '#ffe23a');
    // the cage, with Honey in it, off to one side
    const cgx = 30;
    px(g, cgx + 15, top + 4, 2, 22, '#565f85');
    px(g, cgx, top + 26, 34, 3, '#565f85');
    for (let i = 0; i < 6; i++) px(g, cgx + i * 6, top + 26, 2, 38, '#565f85');
    px(g, cgx, top + 62, 34, 3, '#565f85');
    px(g, cgx + 10, top + 40, 14, 18, '#f4f0e6');
    px(g, cgx + 10, top + 45, 14, 4, '#e8a020');
    px(g, cgx + 12, top + 35, 4, 4, '#ff2fa0'); px(g, cgx + 18, top + 35, 4, 4, '#ff2fa0');
    px(g, cgx + 13, top + 50, 2, 2, '#1a0f08'); px(g, cgx + 20, top + 50, 2, 2, '#1a0f08');
    // feathers on the way down
    g.fillStyle = '#f4ecd4';
    for (let i = 0; i < 12; i++) g.fillRect(20 + ((i * 97) % (W - 40)), top + 20 + ((i * 61) % 90), 5, 2);
  } else if (art === 'sunrise') {
    // THE ENDING. A real dawn over the harbour, and the storm still turning in it —
    // docs/casefile.md says the case never closes, so the last frame has to say so.
    const sky = g.createLinearGradient(0, top, 0, gy);
    sky.addColorStop(0, '#1d2450');
    sky.addColorStop(0.45, '#8a4a3a');
    sky.addColorStop(0.8, '#e08a3a');
    sky.addColorStop(1, '#ffd27a');
    g.fillStyle = sky;
    g.fillRect(0, top, W, gy - top);
    // the sun, sitting on the water
    const sy = gy - 26;
    g.fillStyle = '#fff3c0';
    g.beginPath(); g.arc(cx + 60, sy, 17, 0, 7); g.fill();
    const sg = g.createRadialGradient(cx + 60, sy, 10, cx + 60, sy, 70);
    sg.addColorStop(0, 'rgba(255,243,192,0.4)');
    sg.addColorStop(1, 'rgba(255,243,192,0)');
    g.fillStyle = sg;
    g.fillRect(cx - 20, sy - 70, 160, 140);
    // the city, and the cranes at the docks
    brawlSkylineRow(g, W, gy - 30, { body: '#3a2a3a', lit: '#ffb45a', step: 34, bw: 24, bh: 20, bhVar: 26 });
    for (const kx of [26, 74]) {
      px(g, kx, gy - 66, 3, 36, '#2a1e2a');
      px(g, kx - 14, gy - 66, 34, 3, '#2a1e2a');
      px(g, kx + 16, gy - 63, 2, 12, '#2a1e2a');
    }
    // the water, with the sun in it
    px(g, 0, gy - 30, W, 30, '#6a3a4a');
    for (let y = gy - 28; y < gy; y += 3) {
      g.globalAlpha = 0.5 - (gy - y) * 0.012;
      px(g, 0, y, W, 1, '#c96a4a');
      g.globalAlpha = 1;
    }
    for (let i = 0; i < 26; i++) {
      const wy2 = gy - 28 + ((i * 7) % 27);
      px(g, cx + 52 + ((i * 31) % 22) - 10, wy2, 12 - (i % 5), 1, '#ffdf9a');
    }
    // THE SWIRL. The stolen storm, still turning past the docks — docs/casefile.md
    // says the case never closes, so the last frame of the campaign has to say so.
    // Three straight dashes was the first attempt and it read as render scratches:
    // weather is a RING, and a ring needs to be drawn as one.
    const swx = 52, swy = gy - 16;
    for (let i = 0; i < 3; i++) {
      const rx = 5 + i * 6, ry = 1.6 + i * 1.7;
      g.globalAlpha = 0.46 - i * 0.11;
      g.strokeStyle = i ? '#6ab4d6' : '#9be8ff';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(swx, swy, rx, ry, 0, 0.5 + i * 0.7, 5.4 + i * 0.7);
      g.stroke();
      g.globalAlpha = 1;
    }
    px(g, swx - 1, swy - 1, 2, 2, '#dff2ff');
    // the pier they are standing on
    brawlCutFloor(g, W, gy, '#3a2c1c', 'rgba(255,210,122,', '#6b4a28');
    for (let x = 0; x < W; x += 18) px(g, x, gy + 4, 16, 200, '#33261a');
    for (let x = 0; x < W; x += 18) px(g, x, gy + 4, 16, 1, '#4a3826');
    // the near mooring post, cropped by the frame
    px(g, 8, gy + 6, 14, 200, '#2a1f14');
    px(g, 6, gy + 4, 18, 4, '#3d2c1c');
    px(g, 6, gy + 4, 18, 1, '#6b5236');
    // the two of them, backlit, at cutscene scale
    const K = brawlCutK(Hh);
    const hx0 = brawl.twoP ? cx - 24 * K : cx - 15 * K;
    brawlCutShadow(g, hx0, gy, 11 * K);
    brawlBlit(g, brawlActorNug(4, '#a8231b'), hx0, gy, K);
    px(g, hx0 + 9 * K, gy - 21 * K, 3, 18 * K, '#ffd27a');
    if (brawl.twoP) {
      brawlCutShadow(g, cx - 7 * K, gy, 11 * K);
      brawlBlit(g, brawlActorNug(6, '#25549e'), cx - 7 * K, gy, K);
      px(g, cx + 2 * K, gy - 21 * K, 3, 18 * K, '#ffd27a');
    }
    brawlCutShadow(g, cx + 13 * K, gy, 10 * K);
    brawlBlit(g, brawlActorHoney(true), cx + 13 * K, gy, K);
    px(g, cx + 22 * K, gy - 20 * K, 3, 17 * K, '#ffe9a0');
  }
  g.textAlign = 'center';
}

function brawlStepCut(dt) {
  const g = brawl.g, W = brawl.W, Hh = brawl.Hh;
  const c = brawl.cut;
  if (!c) { brawl.phase = 'play'; return; }
  const scene = BRAWL_CUTS[c.key];
  const line = scene.lines[c.li];
  c.ch = Math.min(line[1].length, c.ch + dt * 42);

  g.fillStyle = '#05060c';
  g.fillRect(0, 0, W, Hh);
  brawlCutArt(g, W, Hh, scene.art);
  // Letterbox bars, with a gradient off the inner edge of each. A hard black line
  // across a 200px frame reads as a crop; a falloff reads as a frame.
  px(g, 0, 0, W, 14, '#000');
  px(g, 0, Hh - 46, W, 46, '#000');
  const lb = g.createLinearGradient(0, 14, 0, 26);
  lb.addColorStop(0, 'rgba(0,0,0,0.72)');
  lb.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lb;
  g.fillRect(0, 14, W, 12);
  const lb2 = g.createLinearGradient(0, Hh - 60, 0, Hh - 46);
  lb2.addColorStop(0, 'rgba(0,0,0,0)');
  lb2.addColorStop(1, 'rgba(0,0,0,0.8)');
  g.fillStyle = lb2;
  g.fillRect(0, Hh - 60, W, 14);
  // text box
  g.textAlign = 'left';
  const tx = Math.max(14, W * 0.12);
  if (line[0]) {
    g.font = '900 9px Consolas, monospace';
    g.fillStyle = line[0] === 'NUG' ? '#e8a83e' : line[0] === 'HONEY' ? '#ff2fa0' : '#ffe23a';
    g.fillText(line[0] + ':', tx, Hh - 32);
  }
  g.font = '700 9px Consolas, monospace';
  g.fillStyle = line[0] ? '#e8ecf4' : '#8a93b8';
  g.fillText(line[1].slice(0, Math.floor(c.ch)), tx, Hh - 20);
  if (c.ch >= line[1].length && Math.floor(brawl.t * 2.5) % 2) {
    g.textAlign = 'right';
    g.fillStyle = '#9be8ff';
    g.font = '700 8px Consolas, monospace';
    g.fillText('PUNCH ▸ · DODGE SKIPS', W - 10, Hh - 6);
  }
}

const BRAWL_CREDITS = [
  ['BATTERED BRAWLERS', '#ff5252'],
  ['"see you in hell, mother cluckers"', '#ffe23a'],
  ['', ''],
  ['FISTS .............. YOU', '#e8ecf4'],
  ['ALSO FISTS ......... PLAYER 2', '#e8ecf4'],
  ['HONEY MUSTARD ...... HERSELF', '#ff2fa0'],
  ['WASABI THE UNMILD .. HIMSELF', '#39c96a'],
  ['DIJON .............. A GIANT HAM', '#e6b800'],
  ['THE MOTHER CLUCKER . NO COMMENT', '#f4ecd4'],
  ['SAUCE WRANGLING .... THE KITCHEN', '#8a93b8'],
  ['', ''],
  ['filmed on location in NUGGETOWN', '#8a93b8'],
  ['no cups were permanently harmed', '#8a93b8'],
  ['', ''],
  ['OVERTIME SHIFT STARTS SOON…', '#ffe23a'],
];

function brawlStepEnd(dt) {
  const g = brawl.g, W = brawl.W, Hh = brawl.Hh;
  brawl.endT += dt;
  g.fillStyle = '#05060c';
  g.fillRect(0, 0, W, Hh);
  // The crawl used to run over PURE BLACK — 93% of the frame, on the screen a player
  // reaches by clearing the whole campaign. It runs over the ending now, held down
  // far enough that white 9px text still reads over it.
  brawlCutArt(g, W, Hh, 'sunrise');
  g.fillStyle = 'rgba(5,6,12,0.62)';
  g.fillRect(0, 0, W, Hh);
  g.textAlign = 'center';
  g.font = '900 14px Consolas, monospace';
  g.fillStyle = '#ffe23a';
  g.fillText('🏆 CAMPAIGN CLEAR 🏆', W / 2, 26);
  g.font = '700 9px Consolas, monospace';
  g.fillStyle = '#8a93b8';
  g.fillText(brawl.cfg.emoji + ' ' + brawl.cfg.name + ' · ' + brawl.kos + ' KOs · shift ' + brawl.shift, W / 2, 40);
  // the crawl
  const y0 = Hh - (brawl.endT / CREDITS_SECS) * (Hh + BRAWL_CREDITS.length * 12 - 60);
  g.font = '700 9px Consolas, monospace';
  BRAWL_CREDITS.forEach(([txt, col], i) => {
    const y = y0 + i * 12;
    if (y > 48 && y < Hh - 4 && txt) {
      g.fillStyle = col;
      g.fillText(txt, W / 2, y);
    }
  });
  if (brawl.endT >= CREDITS_SECS) brawlStartOvertime();
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
  } else if (icon === 'vault') {
    px(g, x - 7, y - 7, 14, 14, '#8a7a4a');
    px(g, x - 5, y - 5, 10, 10, '#5c5232');
    px(g, x - 2, y - 2, 4, 4, '#ffd23a');
  } else if (icon === 'trash') {
    px(g, x - 5, y - 4, 10, 10, '#2e5236');
    px(g, x - 6, y - 6, 12, 3, '#1c3a24');
    px(g, x - 2, y - 9, 4, 3, '#1c3a24');
  } else if (icon === 'neon') {
    px(g, x - 8, y - 6, 16, 12, '#05050c');
    g.strokeStyle = '#ff2fa0'; g.lineWidth = 1;
    g.strokeRect(x - 6.5, y - 4.5, 13, 9);
    px(g, x - 3, y - 2, 6, 4, '#26e0ff');
  } else if (icon === 'roof') {
    px(g, x - 8, y + 1, 16, 5, '#231f2c');
    px(g, x - 1, y - 8, 2, 9, '#565f85');
    px(g, x - 5, y - 5, 10, 1, '#565f85');
    px(g, x - 1, y - 9, 3, 2, '#ff5252');
  } else if (icon === 'crown') {
    px(g, x - 7, y, 14, 5, '#ffd23a');
    px(g, x - 7, y - 6, 3, 6, '#ffd23a');
    px(g, x - 1, y - 8, 3, 8, '#ffd23a');
    px(g, x + 5, y - 6, 3, 6, '#ffd23a');
  } else if (icon === 'gear') {
    px(g, x - 5, y - 5, 10, 10, '#8a93b8');
    px(g, x - 2, y - 8, 4, 3, '#8a93b8'); px(g, x - 2, y + 5, 4, 3, '#8a93b8');
    px(g, x - 8, y - 2, 3, 4, '#8a93b8'); px(g, x + 5, y - 2, 3, 4, '#8a93b8');
    px(g, x - 2, y - 2, 4, 4, '#131920');
  } else if (icon === 'vat') {
    px(g, x - 6, y - 5, 12, 11, '#39465c');
    px(g, x - 4, y - 3, 8, 7, '#a81f1f');
    px(g, x - 7, y - 7, 14, 3, '#565f85');
  } else if (icon === 'box') {
    px(g, x - 6, y - 5, 12, 11, '#8a6c34');
    px(g, x - 6, y - 1, 12, 2, '#42320e');
    px(g, x - 1, y - 5, 2, 11, '#42320e');
  } else { // egg
    px(g, x - 4, y - 6, 8, 4, '#ffd23a');
    px(g, x - 5, y - 3, 10, 6, '#ffd23a');
    px(g, x - 3, y + 3, 6, 3, '#ffd23a');
    px(g, x - 3, y - 5, 3, 3, '#fff3b0');
  }
}

function drawMap() {
  const g = brawl.g, W = brawl.W, Hh = brawl.Hh;
  const act = brawlAct();
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
  g.fillText('ACT ' + (brawl.act + 1) + ' — ' + act.name, W / 2, 18);
  g.font = '700 8px monospace';
  g.fillStyle = '#8a93b8';
  g.fillText('NIGHT SHIFT ' + brawl.shift + ' · ' + brawl.cfg.emoji + ' ' + brawl.cfg.name +
    (brawl.twoP ? ' · 2P' : ''), W / 2, 30);
  // act pips
  for (let i = 0; i < BRAWL_ACTS.length; i++) {
    const col = i < brawl.act ? '#39c96a' : i === brawl.act ? '#ffe23a' : '#39465c';
    px(g, W / 2 - 18 + i * 14, 36, 8, 3, col);
  }

  // gently wavy dotted route with a node per stage
  const N = act.stages.length;
  const nx = (i) => Math.round(W * (0.14 + (0.72 * i) / (N - 1)));
  const ny = (i) => Math.round(Hh * (0.55 + (i % 2 ? -0.09 : 0.07)));
  g.fillStyle = '#39465c';
  for (let i = 0; i < N - 1; i++) {
    const x0 = nx(i), y0 = ny(i), x1 = nx(i + 1), y1 = ny(i + 1);
    for (let t = 0.12; t < 1; t += 0.11)
      px(g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 3, 3, '#39465c');
  }
  for (let i = 0; i < N; i++) {
    const x = nx(i), y = ny(i);
    const current = i === brawl.stage, done = i < brawl.stage;
    // node plate
    px(g, x - 12, y - 12, 24, 24, done ? '#16281c' : '#141b2c');
    g.strokeStyle = current && Math.floor(brawl.t * 3) % 2 ? '#ffe23a' : done ? '#39c96a' : '#39465c';
    g.lineWidth = 2;
    g.strokeRect(x - 12.5, y - 12.5, 25, 25);
    drawMapIcon(g, act.stages[i].icon, x, y);
    if (done) { // cleared: a little victory flag
      px(g, x + 8, y - 20, 1, 10, '#8a93b8');
      px(g, x + 9, y - 20, 7, 4, '#39c96a');
    }
  }
  // the nugget(s) walk the dots to the current node
  const from = Math.max(brawl.stage - 1, 0);
  const t = brawl.stage === 0 ? 1 : Math.min(brawl.mapT / (MAP_SECS * 0.75), 1);
  const wx = nx(from) + (nx(brawl.stage) - nx(from)) * t;
  const wy = ny(from) + (ny(brawl.stage) - ny(from)) * t - 16;
  const hop = Math.abs(Math.sin(brawl.t * 9)) * 2;
  g.drawImage(nugBody(6, 4, '#e8a83e', '#8a5a1d'), Math.round(wx) - 8, Math.round(wy) - 6 - hop);
  px(g, wx - 5, wy - 4 - hop, 10, 2, '#d32f2f'); // headband
  px(g, wx - 3, wy + 9 - hop, 2, 2, '#8a5a1d');
  px(g, wx + 1, wy + 9 - hop, 2, 2, '#8a5a1d');
  if (brawl.twoP) {
    const hop2 = Math.abs(Math.sin(brawl.t * 9 + 1.4)) * 2;
    g.drawImage(nugBody(6, 6, '#e8a83e', '#8a5a1d'), Math.round(wx) - 22, Math.round(wy) - 6 - hop2);
    px(g, wx - 19, wy - 4 - hop2, 10, 2, '#2f6ad3');
  }
  // footer hint
  if (Math.floor(brawl.t * 2) % 2) {
    g.fillStyle = '#9be8ff';
    g.font = '700 8px monospace';
    g.fillText('PUNCH TO SKIP', W / 2, Hh - 10);
  }
}

// ---- entities -------------------------------------------------------------------

function drawPlayer(g, p) {
  const col = BRAWL_P_COLORS[p.idx];
  const step = Math.floor(p.walk) % 4;
  const bob = p.st === 'walk' ? (step % 2) : Math.floor(brawl.t * 2.5) % 2;
  const x = Math.round(p.x - brawl.cam), gy = entY(p.d);
  // The shadow is drawn BEFORE the invuln blink and does not blink with it: the
  // one frame in two where drawPlayer used to return early was a frame with no
  // player on screen at all, and losing your own character for half a second
  // after every hit is worse than the flicker was ever worth.
  brawlShadow(g, x, p.d, p.ko ? 18 : p.st === 'dodge' ? 11 : 14, 0, p.ko ? 0.44 : 0.62);
  if (p.iT > 0 && !p.ko && Math.floor(brawl.t * 16) % 2) return;
  const y = gy - 10 - bob;
  const f = p.face;
  const lk = brawlLaneK(p.d);
  // Taking one had no flash of any kind — the enemies have had one since launch
  // and the player, the thing you are actually watching, just started blinking a
  // sixth of a second later. Three frames of solid white on the frame it lands.
  const hurtFlash = p.st === 'hurt' && p.stT < 0.055;
  const body = hurtFlash ? '#fff'
    : brawlShade(p.rage > 0 && Math.floor(brawl.t * 10) % 3 === 0 ? '#f0722e' : '#e8a83e', lk);

  if (p.ko) {
    // face-down in the sauce, stars optional
    g.save();
    g.translate(x, gy - 4);
    g.rotate(f * 1.5);
    g.drawImage(nugBody(7, 4 + p.idx * 2, body, hurtFlash ? '#fff' : brawlShade('#8a5a1d', lk)), -9, -8);
    g.restore();
    if (brawl.twoP && Math.floor(brawl.t * 2) % 2) {
      g.font = '700 7px monospace';
      g.textAlign = 'center';
      g.fillStyle = '#9be8ff';
      g.fillText('TAG!', x, gy - 18);
    }
    return;
  }
  if (hurtFlash) {
    // ONE CLEAN WHITE SILHOUETTE. A white body still wearing its red headband and
    // its dark pupils reads as a ghost, not as a hit — a flash frame is a SHAPE.
    g.drawImage(nugBody(7, 4 + p.idx * 2, '#fff', '#fff'), x - 9, y - 8);
    px(g, x - 5, gy - 2, 4, 2, '#fff');
    px(g, x + 2, gy - 2, 4, 2, '#fff');
    return;
  }
  if (p.st === 'special') {
    // the CYCLONE: a blurred spin with sauce trailing off the gloves
    const ang = p.stT * 26;
    g.save();
    g.translate(x, y - 2);
    g.rotate(ang % (Math.PI * 2));
    g.drawImage(nugBody(7, 4 + p.idx * 2, body, hurtFlash ? '#fff' : brawlShade('#8a5a1d', lk)), -9, -8);
    g.restore();
    for (let i = 0; i < 3; i++) {
      const a = ang + i * 2.1;
      px(g, x + Math.cos(a) * 13 - 1, y - 2 + Math.sin(a) * 6, 3, 3, col.glove);
    }
    px(g, x - 4 + (step ? -1 : 1), gy - 2, 3, 2, brawlShade('#8a5a1d', lk));
    px(g, x + 2 + (step ? 1 : -1), gy - 2, 3, 2, brawlShade('#8a5a1d', lk));
    return;
  }
  if (p.st === 'dodge') {
    g.globalAlpha = 0.35;
    g.drawImage(nugBody(7, 4 + p.idx * 2, body, hurtFlash ? '#fff' : brawlShade('#8a5a1d', lk)), x - 9 - f * 6, y - 8);
    g.globalAlpha = 1;
  }
  const BR = brawlRamp(brawlShade('#8a5a1d', lk));
  const boot = (bx) => {
    px(g, bx - 1, gy - 3, 5, 3, BR.line);
    px(g, bx, gy - 3, 3, 2, BR.base);
    px(g, bx, gy - 3, 2, 1, BR.lite);
  };
  boot(x - 4 + (p.st === 'walk' ? (step < 2 ? -1 : 1) : 0));
  boot(x + 2 + (p.st === 'walk' ? (step < 2 ? 1 : -1) : 0));
  g.drawImage(nugBody(7, 4 + p.idx * 2, body, hurtFlash ? '#fff' : brawlShade('#8a5a1d', lk)), x - 9, y - 8);
  // the headband, with a top light and a shadow it casts on the brow
  const HR = brawlRamp(col.band);
  px(g, x - 7, y - 7, 14, 3, HR.line);
  px(g, x - 6, y - 7, 12, 2, HR.base);
  px(g, x - 6, y - 7, 12, 1, HR.lite);
  px(g, x - 5, y - 7, 4, 1, HR.rim);
  px(g, x - 8 - (f < 0 ? -15 : 0), y - 6, 4, 2, HR.line);
  px(g, x - 8 - (f < 0 ? -15 : 0), y - 6, 3, 1, HR.base);
  // eyes: the 2x2 whites the rig always had, plus ONE catchlight pixel. The first
  // cut of this wrapped each eye in a 4x4 dark socket and the nugget came back
  // wearing goggles — at three pixels of eye there is no room for a socket.
  px(g, x + f * 2, y - 3, 2, 2, '#f4f4fa');
  px(g, x + f * 5, y - 3, 2, 2, '#f4f4fa');
  px(g, x + f * 2 + (f > 0 ? 1 : 0), y - 2, 1, 1, '#1a0f08');
  px(g, x + f * 5 + (f > 0 ? 1 : 0), y - 2, 1, 1, '#1a0f08');
  px(g, x + f * 2 + (f > 0 ? 0 : 1), y - 3, 1, 1, '#fff');
  px(g, x + f * 2 - 1, y - 5, 3, 1, '#42200e');
  px(g, x + f * 4, y - 5, 3, 1, '#42200e');

  // `hot` = this glove is in its active frames. A glove that goes white on contact
  // is the cheapest possible way to say WHICH FIST did it.
  // A GLOVE WITH A KNUCKLE IN IT. Three flat pixels of one colour was the whole
  // fist in a game about punching.
  const GR = brawlRamp(col.glove);
  const glove = (gx, gy2, big, hot) => {
    const w = big ? 5 : 4, h = big ? 5 : 4;
    px(g, gx - 2, gy2 - 2, w, h, hot ? '#ffe9a0' : GR.line);
    px(g, gx - 1, gy2 - 1, w - 2, h - 2, hot ? '#fff' : GR.base);
    px(g, gx - 1, gy2 - 1, 1, 1, hot ? '#fff' : GR.rim);
    px(g, gx + w - 4, gy2 + h - 4, 1, 1, hot ? '#ffe23a' : GR.shade);
    px(g, gx - 2, gy2 + h - 3, w, 1, hot ? '#ffe23a' : col.trim);
  };
  if (p.st === 'jab' || p.st === 'upper') {
    const m = p.punch;
    // ANTICIPATION, THROW, RECOVERY. This was one sine hump over [0, active1]:
    // the fist appeared already extended, peaked, returned to neutral and then sat
    // there for a third of the move. Nothing in it said a punch was COMING and
    // nothing said it was over, which is why a still of a punch in this game and a
    // still of standing still were the same picture.
    //   0 .. active0   the fist pulls BACK (3px, and the eye reads it)
    //   active0 .. active1  the throw — and this is exactly the hit window
    //   active1 .. dur  a short over-pull back into guard
    const ext = p.stT < m.active0
      ? -3.2 * (p.stT / m.active0)
      : p.stT < m.active1
        ? Math.sin(((p.stT - m.active0) / (m.active1 - m.active0)) * Math.PI) * m.reach
        : -2.4 * (1 - Math.min(1, (p.stT - m.active1) / Math.max(0.01, m.dur - m.active1)));
    const live = p.stT >= m.active0 && p.stT <= m.active1;
    if (p.weapon) {
      // the spatula leads the swing
      px(g, x + f * (4 + ext * 0.8), y - 1 - (p.st === 'upper' ? ext * 0.5 : 0), f * 7, 2, '#8a93b8');
      px(g, x + f * (10 + ext * 0.8), y - 3 - (p.st === 'upper' ? ext * 0.5 : 0), f * 4, 6, '#c9d4f0');
    }
    // the streak: shoulder to fist, so the throw carries speed rather than
    // teleporting a red square to arm's length for four frames
    if (ext > 3) {
      const gx0 = x + f * 3, gx1 = x + f * (4 + ext * (p.st === 'upper' ? 0.7 : 1));
      px(g, Math.min(gx0, gx1), y - (p.st === 'upper' ? 1 : 0), Math.abs(gx1 - gx0), 1,
        brawlShade(col.glove, 0.72));
    }
    if (p.st === 'upper') {
      glove(x + f * (4 + ext * 0.7), y - 2 - ext * 0.55, true, live);
      glove(x - f * 3, y + 1, false);
    } else {
      glove(x + f * (5 + ext), y - 1, true, live);
      glove(x - f * 2, y + 2, false);
    }
  } else if (p.st === 'hurt') {
    glove(x - f * 5, y + 2, false);
    glove(x - f * 2, y + 3, false);
  } else {
    if (p.weapon) px(g, x + f * 6, y + 1, f * 6, 2, '#8a93b8');
    glove(x + f * 5, y + (bob ? 0 : 1), false);
    glove(x + f * 2, y + 2 + (bob ? 1 : 0), false);
  }
}

function drawCup(g, e) {
  const pal = e.golden ? GOLD : CUPS[e.kind];
  const step = Math.floor(brawl.t * 8 + (e.waddle || 0)) % 2;
  const x = Math.round(e.x - brawl.cam), gy = entY(e.d);
  // The launch lift, in ONE place. It used to be applied to `y` only, so an
  // upper sent the cup's body six pixels into the air and left its FEET standing
  // on the belt — invisible while nothing in this game was grounded, and the
  // first thing the new contact shadow put on screen.
  const lift = e.launch ? 6 : 0;
  let y = gy - 12 - lift;
  const big = e.kind === 'mayo';
  if (big) y -= 3;
  // the lane the cup is standing in, applied to everything except the hurt flash
  // (a flash is light, not paint) and the eyes (1px of ink either reads or does not)
  const lk = brawlLaneK(e.d);
  const cream = brawlShade('#f4f0e6', lk), rim = brawlShade('#c9cfe0', lk);
  const pb = brawlShade(pal.body, lk), pd = brawlShade(pal.dark, lk), pl = brawlShade(pal.lite, lk);
  if (e.dead) {
    const t = Math.min(e.stT / 0.5, 1);
    brawlShadow(g, x, e.d, 11 + t * 5, 0, 0.4 * (1 - t));
    g.save();
    g.translate(x, gy - 4);
    g.rotate(e.face * t * 1.5);
    g.globalAlpha = 1 - t * 0.8;
    px(g, -5, -8 + t * 6, 10, 8 - t * 5, cream);
    px(g, -5, -11 + t * 8, 10, 3, pb);
    g.restore();
    g.globalAlpha = 1;
    return;
  }
  // launched cups leave the floor; the shadow stays on it and shrinks
  brawlShadow(g, x, e.d, big ? 15 : 12, lift);
  // blockT pushes her BACK: a block that does not move the blocker reads as the
  // punch having passed straight through her
  const lean = e.blockT > 0 ? -e.face * 3
    : e.st === 'windup' ? -e.face * 2
      : (e.st === 'lunge' || e.st === 'dash' || e.st === 'slam') ? e.face * 3 : 0;
  // THE IMPACT FLASH, and the `e.stT < 0.05` is the whole point. This test used to
  // be `floor(e.stT * 30) % 2` alone — and e.stT is ZERO on the frame of the hit,
  // so the flash reporting a punch first appeared SIX FRAMES after it, by which
  // time the hitstop was over and the cup was already flying. Solid white for the
  // first three frames (which is exactly the hitstop, since stT cannot advance
  // while the game is frozen), then the flicker it always had.
  const flash = e.st === 'hurt' && (e.stT < 0.05 || Math.floor(e.stT * 30) % 2);
  const w2 = big ? 13 : 10, hw = w2 / 2;
  // soy ninjas blur when dashing
  if (e.kind === 'soy' && e.st === 'dash') {
    g.globalAlpha = 0.4;
    px(g, x - hw - e.face * 8, y, w2, big ? 13 : 10, pd);
    g.globalAlpha = 1;
  }
  // THE CUP. It was six fillRects: a rectangle, a stripe, a rim, a rectangle for the
  // lid, and two highlight pixels. A straight-sided box is why these read as 8-bit
  // regardless of what colour they were painted — a cup TAPERS, and the taper plus a
  // keyline plus one light direction is the entire difference.
  const CR = brawlRamp(flash ? '#fff' : brawlShade('#f4f0e6', lk));
  const SR = brawlRamp(flash ? '#fff' : brawlShade(pal.body, lk));
  const bh = big ? 13 : 10;
  const lx = x + lean;
  // feet, with a toe and a shadow side
  const ftl = x - 4 + (step ? -1 : 0), ftr = x + 1 + (step ? 1 : 0);
  px(g, ftl, gy - 2 - lift, 4, 2, SR.line);
  px(g, ftl, gy - 2 - lift, 3, 1, SR.shade);
  px(g, ftr, gy - 2 - lift, 4, 2, SR.line);
  px(g, ftr, gy - 2 - lift, 3, 1, SR.shade);
  // the body: one row at a time, tapering, keylined, lit from up-left
  for (let row = 0; row < bh; row++) {
    const rw = w2 - Math.round((row / (bh - 1)) * (big ? 5 : 4));
    const rx = Math.round(lx - rw / 2);
    const ry = y + row;
    const band = row >= 3 && row <= (big ? 5 : 4);
    const P = band ? SR : CR;
    px(g, rx, ry, rw, 1, P.line);
    if (row < bh - 1) {
      px(g, rx + 1, ry, rw - 2, 1, P.base);
      px(g, rx + 1, ry, 1, 1, P.lite);
      px(g, rx + rw - 2, ry, 1, 1, P.shade);
    }
  }
  // the specular down the lit side — two pixels, and they do more than the taper
  px(g, Math.round(lx - w2 / 2) + 1, y + 1, 1, 2, CR.rim);
  // THE LID, which is also the head — and it has to stay SMALLER THAN THE BODY. The
  // first cut gave it seven rows of dome over a ten-row body and every enemy in the
  // game came back a mushroom with googly eyes on it. Five rows, the same footprint
  // the rig always had, with the ramp and the keyline the flat version lacked.
  const lw = w2 + 2, lrx = Math.round(lx - lw / 2);
  px(g, lrx, y - 1, lw, 1, SR.line);
  px(g, lrx + 1, y - 1, lw - 2, 1, SR.lite);
  px(g, lrx + 1, y - 5, lw - 2, 4, SR.line);
  px(g, lrx + 2, y - 5, lw - 4, 4, SR.base);
  px(g, lrx + 2, y - 4, 1, 3, SR.lite);
  px(g, lrx + lw - 4, y - 4, 1, 3, SR.shade);
  px(g, lrx + 3, y - 6, lw - 6, 1, SR.line);
  px(g, lrx + 4, y - 6, lw - 8, 1, SR.base);
  if (!flash) {
    if (e.kind === 'soy') {
      // masked: one narrow visor instead of eyes
      px(g, x - 3 + lean, y - 4, 7, 2, '#0a0a10');
      px(g, x - 2 + lean + (e.face > 0 ? 2 : 0), y - 4, 2, 2, '#ff5252');
      px(g, x - 2 + lean + (e.face > 0 ? 2 : 0), y - 4, 2, 1, '#ff9a9a');
    } else {
      const ex = x + lean + (e.face > 0 ? 1 : 0);
      px(g, ex - 2, y - 4, 2, 2, '#f4f4fa');
      px(g, ex + 1, y - 4, 2, 2, '#f4f4fa');
      px(g, ex - 2 + (e.face > 0 ? 1 : 0), y - 3, 1, 1, '#1a0f08');
      px(g, ex + 1 + (e.face > 0 ? 1 : 0), y - 3, 1, 1, '#1a0f08');
      px(g, x - 3 + lean, y - 5, 2, 1, SR.line);
      px(g, x + 1 + lean, y - 5, 2, 1, SR.line);
    }
  }
  // mayo's guard: a little lid held up like a shield
  if (e.guardUp && !flash) {
    const sx = x + e.face * (hw + 2);
    px(g, sx - 1, y - 3, 4, 11, CR.line);
    px(g, sx - 1 + (e.face > 0 ? 0 : 1), y - 2, 2, 9, e.blockT > 0 ? '#fff' : CR.base);
    px(g, sx - 1 + (e.face > 0 ? 0 : 1), y - 2, 2, 2, e.blockT > 0 ? '#fff' : CR.rim);
  }
  if (e.st === 'windup') {
    px(g, x + e.face * (hw + 3), y - 7, 3, 3, '#1a1408');
    px(g, x + e.face * (hw + 3), y - 7, 2, 2, '#ffe23a');
  }
}

function drawBoss(g, e) {
  const x = Math.round(e.x - brawl.cam), gy = entY(e.d);
  const slamRise = e.st === 'windup' ? -Math.sin(Math.min(e.stT / 0.55, 1) * Math.PI) * 8 :
    e.st === 'slam' && e.stT < 0.15 ? 3 : 0;
  const y = gy - 30 + slamRise;
  brawlShadow(g, x, e.d, 18, slamRise < 0 ? -slamRise : 0);
  const step = Math.floor(brawl.t * 6) % 2;
  const flash = e.st === 'hurt' && (e.stT < 0.05 || Math.floor(e.stT * 30) % 2);
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

function drawDijon(g, e) {
  const x = Math.round(e.x - brawl.cam), gy = entY(e.d);
  const step = Math.floor(brawl.t * 7) % 2;
  const flash = e.st === 'hurt' && (e.stT < 0.05 || Math.floor(e.stT * 30) % 2);
  const lean = e.st === 'caneWind' ? -e.face * 3 : e.st === 'swipe' ? e.face * 4 : 0;
  const y = gy - 26;
  brawlShadow(g, x, e.d, 17);
  const body = flash ? '#fff' : '#e6b800';
  const dark = flash ? '#fff' : '#9c7c00';
  px(g, x - 5 + (step ? -1 : 0), gy - 3, 4, 3, dark);
  px(g, x + 2 + (step ? 1 : 0), gy - 3, 4, 3, dark);
  // the cup, tall and tailored
  px(g, x - 7 + lean, y + 4, 14, 20, flash ? '#fff' : '#f4f0e6');
  px(g, x - 7 + lean, y + 8, 14, 3, body);
  px(g, x - 8 + lean, y + 4, 16, 1, flash ? '#fff' : '#c9cfe0');
  // cravat
  px(g, x - 2 + lean, y + 12, 4, 5, flash ? '#fff' : '#8a1c3a');
  // head band + top hat
  px(g, x - 6 + lean, y - 2, 12, 6, body);
  px(g, x - 8 + lean, y - 6, 16, 4, flash ? '#fff' : '#131313');
  px(g, x - 5 + lean, y - 14, 10, 9, flash ? '#fff' : '#131313');
  px(g, x - 5 + lean, y - 7, 10, 1, flash ? '#fff' : '#8a1c3a');
  if (!flash) {
    px(g, x - 3 + lean + (e.face > 0 ? 1 : 0), y, 2, 2, '#1a0f08');
    px(g, x + 2 + lean + (e.face > 0 ? 1 : 0), y, 2, 2, '#1a0f08');
    // monocle over the lead eye
    g.strokeStyle = '#ffd23a'; g.lineWidth = 1;
    g.strokeRect(x + (e.face > 0 ? 1.5 : -3.5) + lean, y - 0.5, 4, 4);
    px(g, x + (e.face > 0 ? 4 : -4) + lean, y + 4, 1, 4, '#ffd23a');
  }
  // the cane
  const caneExt = e.st === 'swipe' ? 8 : 0;
  px(g, x + e.face * (8 + caneExt) + lean, y + 6, e.face * 2, 14, flash ? '#fff' : '#42320e');
  px(g, x + e.face * (8 + caneExt) + lean - 1, y + 4, 4, 3, flash ? '#fff' : '#ffd23a');
  if (e.st === 'caneWind' || e.st === 'rainWind') px(g, x + e.face * 10, y - 8, 2, 2, '#ffe23a');
}

function drawClucker(g, e) {
  const x = Math.round(e.x - brawl.cam), gy = entY(e.d);
  const step = Math.floor(brawl.t * (e.phase === 3 ? 10 : 6)) % 2;
  const flash = e.st === 'hurt' && (e.stT < 0.05 || Math.floor(e.stT * 30) % 2);
  const lunge = e.st === 'peck' ? e.face * 6 : e.st === 'peckWind' ? -e.face * 3 : 0;
  const y = gy - 38;
  brawlShadow(g, x, e.d, e.st === 'flap' || e.st === 'flapWind' ? 22 : 28,
    e.st === 'flap' ? 7 : 0, 0.5);
  const body = flash ? '#fff' : '#f4ecd4';
  const dark = flash ? '#fff' : '#c9c0a8';
  const mad = e.phase === 3;
  // scaly legs
  px(g, x - 6 + (step ? -2 : 0), gy - 8, 3, 8, flash ? '#fff' : '#c9541f');
  px(g, x + 4 + (step ? 2 : 0), gy - 8, 3, 8, flash ? '#fff' : '#c9541f');
  px(g, x - 8 + (step ? -2 : 0), gy - 1, 6, 2, flash ? '#fff' : '#c9541f');
  px(g, x + 3 + (step ? 2 : 0), gy - 1, 6, 2, flash ? '#fff' : '#c9541f');
  // the great body
  px(g, x - 13 + lunge, y + 10, 26, 20, body);
  px(g, x - 13 + lunge, y + 24, 26, 6, dark);
  // tail feathers
  px(g, x - e.face * 16 + lunge, y + 6, 4, 12, body);
  px(g, x - e.face * 19 + lunge, y + 9, 4, 9, dark);
  // wing (flaps in phase 2+)
  const wingUp = e.st === 'flapWind' || e.st === 'flap' ? -6 - step * 3 : step;
  px(g, x - 6 + lunge, y + 12 + wingUp, 14, 8, dark);
  // neck + head
  px(g, x + e.face * 8 + lunge, y - 2, 8, 14, body);
  px(g, x + e.face * 7 + lunge, y - 8, 11, 9, body);
  // comb
  px(g, x + e.face * 9 + lunge, y - 12, 3, 4, flash ? '#fff' : '#d32f2f');
  px(g, x + e.face * 12 + lunge, y - 13, 3, 5, flash ? '#fff' : '#d32f2f');
  px(g, x + e.face * 15 + lunge, y - 12, 2, 4, flash ? '#fff' : '#d32f2f');
  // beak + wattle
  px(g, x + e.face * (16 + (e.st === 'peck' ? 4 : 0)) + lunge, y - 5, e.face * 5, 3, flash ? '#fff' : '#e8a020');
  px(g, x + e.face * 14 + lunge, y - 1, 3, 4, flash ? '#fff' : '#d32f2f');
  // the EYE — red when enraged
  if (!flash) {
    px(g, x + e.face * 11 + lunge, y - 6, 3, 3, mad ? '#ff2020' : '#1a0f08');
    if (mad && Math.floor(brawl.t * 8) % 2) px(g, x + e.face * 11 + lunge, y - 6, 3, 3, '#ffe23a');
    // permanent scowl
    px(g, x + e.face * 10 + lunge, y - 8, 5, 1, '#8a1c10');
  }
  if (e.st === 'eggWind' || e.st === 'flapWind' || e.st === 'stompWind')
    px(g, x + e.face * 18, y - 14, 3, 3, '#ffe23a');
}

function drawCrate(g, c) {
  const x = Math.round(c.x - brawl.cam), gy = entY(c.d);
  const s = 14;
  const rock = c.hp === 1 ? Math.round(Math.sin(brawl.t * 20) * 1) : 0;
  brawlShadow(g, x + rock, c.d, 15, 0, 0.42);
  px(g, x - s / 2 + rock, gy - s, s, s, '#6d5426');
  px(g, x - s / 2 + rock, gy - s, s, 2, '#8a6c34');
  px(g, x - s / 2 + rock, gy - 2, s, 2, '#8a6c34');
  px(g, x - s / 2 + rock, gy - s, 2, s, '#8a6c34');
  px(g, x + s / 2 - 2 + rock, gy - s, 2, s, '#8a6c34');
  px(g, x - 2 + rock, gy - s + 4, 4, 4, '#42320e'); // the stencil
}

function drawDrop(g, drop) {
  const x = Math.round(drop.x - brawl.cam), gy = entY(drop.d);
  const bob = Math.round(Math.sin(drop.t * 3 + drop.x) * 1.5);
  const y = gy - 8 + bob;
  brawlShadow(g, x, drop.d, 8, 6 + bob, 0.38);
  if (drop.kind === 'fries') {
    px(g, x - 4, y - 2, 8, 6, '#d32f2f');
    px(g, x - 3, y - 6, 2, 4, '#ffe23a');
    px(g, x - 0, y - 7, 2, 5, '#ffe23a');
    px(g, x + 2, y - 6, 2, 4, '#ffe23a');
  } else if (drop.kind === 'gold') {
    g.drawImage(nugBody(5, 3, GOLD.body, GOLD.dark), x - 6, y - 8);
    if (Math.floor(brawl.t * 6) % 2) px(g, x + 3, y - 8, 2, 2, '#fff');
  } else if (drop.kind === 'spatula') {
    px(g, x - 6, y, 9, 2, '#8a93b8');
    px(g, x + 3, y - 3, 5, 7, '#c9d4f0');
  } else { // hotsauce
    px(g, x - 2, y - 6, 5, 9, '#d32f2f');
    px(g, x - 1, y - 8, 3, 2, '#42200e');
    px(g, x - 1, y - 3, 3, 3, '#ffe23a');
  }
}

// per-player sauce meter + weapon/rage pips in the canvas corners
function drawBrawlHud(g, W, Hh) {
  brawl.players.forEach((p, i) => {
    const right = i === 1;
    const x0 = right ? W - 46 : 8, y0 = Hh - 16;
    g.font = '900 7px monospace';
    g.textAlign = 'left';
    g.fillStyle = BRAWL_P_COLORS[i].band;
    g.fillText('P' + (i + 1), x0, y0 - 2);
    px(g, x0 + 12, y0 - 8, 26, 6, '#0a0d18');
    const fill = Math.round(24 * (p.meter / METER_MAX));
    const full = p.meter >= METER_MAX;
    px(g, x0 + 13, y0 - 7, fill, 4, full && Math.floor(brawl.t * 6) % 2 ? '#fff' : full ? '#ffe23a' : '#e8622c');
    if (full) {
      g.fillStyle = '#ffe23a';
      g.fillText('CYCLONE!', x0 + 12, y0 + 7);
    }
    if (p.weapon) {
      px(g, x0 + 12, y0 + 2, 6, 1, '#8a93b8');
      g.fillStyle = '#c9d4f0';
      g.fillText('×' + p.weapon.uses, x0 + 20, y0 + 7);
    }
    if (p.rage > 0) {
      g.fillStyle = '#ff5252';
      g.fillText('🔥' + Math.ceil(p.rage), x0 + (p.weapon ? 34 : 12), y0 + 7);
    }
  });
}

// Per-frame jitter as a HASH OF THE CLOCK, not a die roll. Reads identically to
// random while the game runs, and a frozen frame photographs the same twice —
// with brawlRand() here, every redraw of one held frame shook somewhere else.
function brawlJitter(k) {
  const s = Math.sin(brawl.t * 1237.13 + k * 91.7) * 43758.5453;
  return (s - Math.floor(s)) - 0.5;
}

function drawBrawl() {
  const g = brawl.g, W = brawl.W, Hh = brawl.Hh;
  const shx = brawl.shake > 0 ? Math.round(brawlJitter(1) * 4 * brawl.shake * 3) : 0;
  const shy = brawl.shake > 0 ? Math.round(brawlJitter(2) * 3 * brawl.shake * 3) : 0;
  g.save();
  g.translate(shx, shy);
  for (const L of brawl.bg.back) g.drawImage(L.c, -Math.round(brawl.cam * L.rate), 0);

  // splats stain the belt where they landed
  for (const s of brawl.splats) {
    const r = Math.min(s.r + s.t * 18, s.max);
    const sx = s.x - brawl.cam, sy = entY(s.d);
    g.globalAlpha = Math.max(0.15, 0.6 - s.t * 0.1);
    px(g, sx - r, sy - 1, r * 2, 2, s.color);
    px(g, sx - r * 0.6, sy - 2, r * 1.2, 1, s.color);
    g.globalAlpha = 1;
  }

  // painter's order down the belt: farther (small d) first, players among them
  const drawables = brawl.enemies.map((e) => ({
    d: e.d,
    f: () => (e.boss ? (e.kind === 'dijon' ? drawDijon : e.kind === 'clucker' ? drawClucker : drawBoss) : drawCup)(brawl.g, e),
  }));
  for (const c of brawl.crates)
    if (!c.broken) drawables.push({ d: c.d, f: () => drawCrate(brawl.g, c) });
  for (const drop of brawl.drops)
    drawables.push({ d: drop.d, f: () => drawDrop(brawl.g, drop) });
  for (const p of brawl.players)
    drawables.push({ d: p.d, f: () => drawPlayer(brawl.g, p) });
  drawables.sort((a, b) => a.d - b.d);
  for (const item of drawables) item.f();

  for (const b of brawl.blobs) {
    const bx = b.x - brawl.cam, by = entY(b.d);
    // a thrown blob arcs (b.y is negative going up) — its shadow is the only
    // thing that says which lane it is going to land in
    if (!b.wave && !b.feather) brawlShadow(g, bx, b.d, 5, -b.y, 0.34);
    if (b.wave) {
      const hgt = 3 + Math.floor((Math.sin(b.t * 20) + 1) * 1.5);
      px(g, bx - 2, by - hgt, 4, hgt, '#39c96a');
      px(g, bx - 1, by - hgt - 1, 2, 1, '#a5f0c0');
    } else if (b.feather) {
      px(g, bx - 3, by - 9, 6, 2, '#f4ecd4');
      px(g, bx - Math.sign(b.vx) * 3, by - 9, 2, 2, '#c9c0a8');
    } else {
      px(g, bx - 1, by + b.y - 1, 3, 3, b.color);
      px(g, bx - b.vx * 0.02, by + b.y - b.vy * 0.02, 1, 1, b.color);
    }
  }

  for (const f of brawl.fx) {
    const life = f.kind === 'spark' ? 0.17 : 0.25;
    const t = Math.min(1, f.t / life);
    const fx2 = f.x - brawl.cam, fy2 = entY(f.d) - f.h;
    if (f.kind === 'spark') {
      // THE IMPACT FRAME, and it was the worst frame in the game. Four particles
      // at radius `t * 8` means that on the frame of contact — the one frame this
      // whole genre is judged on — all four sat on top of each other and the
      // entire feedback for a landed punch was ONE YELLOW PIXEL. It expanded from
      // nothing over a quarter of a second, by which time the hitstop was over,
      // the victim had been knocked back and the moment had passed.
      //
      // So it starts BIG, starts WHITE, and collapses. The cross-shaped core is
      // the pop; the shards carry the direction of the blow.
      // EVERY PART OF IT IS KEYLINED. The victim goes solid white on the frame of
      // contact (see drawCup), and a white star on a white silhouette is nothing at
      // all — the first version of this landed a beautiful spark that was invisible
      // in exactly the frame it existed for. A dark backing one pixel proud reads
      // over the white cup, over the lit belt and over a neon wall.
      const r = (f.big ? 9 : 7) * (0.5 + (1 - t) * 0.85);
      const col = t < 0.3 ? '#fff' : t < 0.65 ? '#ffe23a' : '#e8622c';
      if (t < 0.4) {
        const cw = f.big ? 9 : 6;
        px(g, fx2 - cw / 2 - 1, fy2 - 2, cw + 2, 5, '#20130a');
        px(g, fx2 - 2, fy2 - cw / 2 - 1, 5, cw + 2, '#20130a');
        px(g, fx2 - cw / 2, fy2 - 1, cw, 3, '#fff');
        px(g, fx2 - 1, fy2 - cw / 2, 3, cw, '#fff');
      }
      const n = f.big ? 6 : 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.5;
        const len = r * (0.72 + ((i * 37) % 5) * 0.13) * (1 + Math.cos(a) * f.dir * 0.45);
        const sx2 = fx2 + Math.cos(a) * len, sy2 = fy2 + Math.sin(a) * len * 0.75;
        px(g, sx2 - 1, sy2 - 1, 3, 3, '#20130a');
        px(g, sx2, sy2, 2, 2, col);
      }
    } else if (f.kind === 'guard') {
      // a blocked hit has to read DIFFERENTLY from a landed one, or the player
      // cannot tell that Mayo just ate the jab. Cold, flat, and it rings outward.
      // keylined for the same reason the spark is, and here it is not optional:
      // the ONLY cup that guards is Mayo, who is cream-coloured, so a pale blue
      // ring on her lid was a pale blue ring on a pale blue ring.
      const r = 4 + t * 7;
      const gc = t < 0.4 ? '#dff2ff' : '#8ab6d6';
      for (let i = 0; i < 4; i++) {
        const a = -0.95 + i * 0.62;
        const sx3 = fx2 + Math.cos(a) * r * f.dir, sy3 = fy2 + Math.sin(a) * r * 0.8;
        px(g, sx3 - 1, sy3 - 1, 4, 4, '#0d1a26');
        px(g, sx3, sy3, 2, 2, gc);
      }
      px(g, fx2 - 1, fy2 - 4, 2, 9, '#0d1a26');
      if (t < 0.45) px(g, fx2 - 1 + f.dir, fy2 - 3, 2, 7, gc);
    } else {
      g.globalAlpha = 1 - t;
      px(g, fx2 - 2, fy2, 5, 2, '#8a93b8');
      px(g, fx2 - 4 + t * 6, fy2 - 1 - t * 3, 2, 2, '#6f7893');
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

  // THE FRONT ROW (screen-space — the crowd follows the fight). Thirteen
  // identical dark-brown blobs used to bounce at the very bottom edge with a
  // third of each one clipped off the canvas, which read as debris on the floor
  // rather than as people. What turns a row of lumps into a crowd is something
  // for them to stand BEHIND: heads and shoulders over a rail, three shades of
  // nugget, five heights, and a fist up when the hype is on.
  // Two attempts at this failed before the third worked, and the reason is worth
  // writing down: at five pixels a head, a brown nugget on a dark floor is a
  // brown lump and no amount of shading fixes it. A crowd reads when it is a
  // SILHOUETTE AGAINST LIGHT — flat black shapes, a warm haze behind them, and a
  // one-pixel rim where the light wraps the top of each head. That is also why
  // every arcade cabinet ever built put its audience in front of the marquee.
  const hype = brawl.crowdHype;
  const railY = Hh - 14;
  const GLOW = ['rgba(255,214,140,', 'rgba(255,152,72,', 'rgba(168,255,198,'][brawl.act] || 'rgba(255,214,140,';
  const hazeTop = railY - 21;
  const hz = g.createLinearGradient(0, hazeTop, 0, railY + 2);
  hz.addColorStop(0, GLOW + '0)');
  hz.addColorStop(1, GLOW + (0.17 + hype * 0.13) + ')');
  g.fillStyle = hz;
  g.fillRect(0, hazeTop, W, railY + 2 - hazeTop);

  const SIL = '#0a0b11';
  const rim = GLOW + '0.65)';
  for (let i = 0; i < Math.ceil(W / 19) + 1; i++) {
    const cx = i * 19 + ((i * 11) % 8);
    const tall = (i * 13) % 5;
    const bounce = (Math.floor(brawl.t * (4 + hype * 6) + i) % 2) * (1 + Math.round(hype * 2));
    const cy = railY - 9 - tall - bounce;
    px(g, cx - 1, cy + 6, 12, 10, SIL);              // shoulders, down into the rail
    g.drawImage(nugBody(5, i % 7, SIL, SIL), cx, cy);
    px(g, cx + 2, cy, 6, 1, rim);                    // the light wrapping the head
    if (hype > 0.3 && (i % 2) === (Math.floor(brawl.t * 3) % 2)) {
      const fx3 = cx + (i % 2 ? -2 : 9);
      px(g, fx3, cy - 5, 3, 7, SIL);                 // a fist up
      px(g, fx3, cy - 6, 3, 1, rim);
    }
  }
  // the rail: mesh, a top bar that catches the room, and a post every 46px
  px(g, 0, railY, W, Hh - railY, '#0e1119');
  for (let x = 0; x < W; x += 4) px(g, x, railY + 3, 2, Hh - railY - 3, '#151a26');
  px(g, 0, railY, W, 2, '#2f3849');
  px(g, 0, railY, W, 1, '#556484');
  for (let x = 6; x < W; x += 46) px(g, x, railY, 2, Hh - railY, '#252d3c');

  // the foreground plane, over the cast — and only ever overhead, see BRAWL_RATES
  for (const L of brawl.bg.fore) g.drawImage(L.c, -Math.round(brawl.cam * L.rate), 0);

  drawBrawlHud(g, W, Hh);
  g.restore();
}

// ---- input ------------------------------------------------------------------------
// 1P: arrows/WASD move · X or Z punch · SPACE dodge · C or V special.
// 2P: P1 = WASD + F/G/H, P2 = ARROWS + K/L/; (one keyboard, two brawlers).

function brawlP(i) { return brawl.players[i] || null; }

window.addEventListener('keydown', (e) => {
  if (!brawlActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  const ph = brawl.phase;

  if (ph === 'title') {
    if (e.code === 'Digit2' || e.code === 'Numpad2') { brawlChooseTitle(true); e.preventDefault(); return; }
    if (['KeyX', 'KeyZ', 'Enter', 'Space', 'KeyF', 'KeyK', 'Digit1'].includes(e.code)) {
      brawlChooseTitle(false); e.preventDefault();
    }
    return;
  }
  if (ph === 'heat') {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { brawlMoveHeat(-1); e.preventDefault(); return; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { brawlMoveHeat(1); e.preventDefault(); return; }
    if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
      brawl.heatSel = Number(e.code.slice(-1)) - 1;
      brawlConfirmHeat();
      e.preventDefault();
      return;
    }
    if (['KeyX', 'KeyZ', 'Enter', 'KeyF', 'KeyK'].includes(e.code)) { brawlConfirmHeat(); e.preventDefault(); }
    return;
  }
  if (ph === 'cut') {
    if (['KeyX', 'KeyZ', 'Enter', 'KeyF', 'KeyK'].includes(e.code)) { brawlAdvanceCut(); e.preventDefault(); }
    if (['Space', 'KeyG', 'KeyL'].includes(e.code)) { brawlEndCut(); e.preventDefault(); }
    return;
  }
  if (ph === 'end') {
    if (['KeyX', 'KeyZ', 'Enter', 'Space', 'KeyF', 'KeyK'].includes(e.code)) { brawl.endT = CREDITS_SECS; e.preventDefault(); }
    return;
  }

  const p1 = brawlP(0), p2 = brawlP(1);
  if (brawl.twoP) {
    // P1 on WASD
    if (e.code === 'KeyA') { p1.keys.l = true; e.preventDefault(); }
    if (e.code === 'KeyD') { p1.keys.r = true; e.preventDefault(); }
    if (e.code === 'KeyW') { p1.keys.u = true; e.preventDefault(); }
    if (e.code === 'KeyS') { p1.keys.dn = true; e.preventDefault(); }
    if (e.code === 'KeyF' || e.code === 'KeyX') { brawlPunch(p1); e.preventDefault(); }
    if (e.code === 'KeyG') { brawlDodge(p1); e.preventDefault(); }
    if (e.code === 'KeyH') { brawlSpecial(p1); e.preventDefault(); }
    // P2 on the arrows
    if (p2) {
      if (e.code === 'ArrowLeft') { p2.keys.l = true; e.preventDefault(); }
      if (e.code === 'ArrowRight') { p2.keys.r = true; e.preventDefault(); }
      if (e.code === 'ArrowUp') { p2.keys.u = true; e.preventDefault(); }
      if (e.code === 'ArrowDown') { p2.keys.dn = true; e.preventDefault(); }
      if (e.code === 'KeyK') { brawlPunch(p2); e.preventDefault(); }
      if (e.code === 'KeyL') { brawlDodge(p2); e.preventDefault(); }
      if (e.code === 'Semicolon') { brawlSpecial(p2); e.preventDefault(); }
    }
  } else {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { p1.keys.l = true; e.preventDefault(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { p1.keys.r = true; e.preventDefault(); }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { p1.keys.u = true; e.preventDefault(); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { p1.keys.dn = true; e.preventDefault(); }
    if (e.code === 'KeyX' || e.code === 'KeyZ') { brawlPunch(p1); e.preventDefault(); }
    if (e.code === 'Space') { brawlDodge(p1); e.preventDefault(); }
    if (e.code === 'KeyC' || e.code === 'KeyV') { brawlSpecial(p1); e.preventDefault(); }
  }
});
window.addEventListener('keyup', (e) => {
  const p1 = brawlP(0), p2 = brawlP(1);
  if (!p1) return;
  if (brawl.twoP) {
    if (e.code === 'KeyA') p1.keys.l = false;
    if (e.code === 'KeyD') p1.keys.r = false;
    if (e.code === 'KeyW') p1.keys.u = false;
    if (e.code === 'KeyS') p1.keys.dn = false;
    if (p2) {
      if (e.code === 'ArrowLeft') p2.keys.l = false;
      if (e.code === 'ArrowRight') p2.keys.r = false;
      if (e.code === 'ArrowUp') p2.keys.u = false;
      if (e.code === 'ArrowDown') p2.keys.dn = false;
    }
  } else {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') p1.keys.l = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') p1.keys.r = false;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') p1.keys.u = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') p1.keys.dn = false;
  }
});

// mouse: click = punch (and menu confirm); on the heat screen the side thirds browse
window.addEventListener('mousedown', (e) => {
  if (!brawlActive()) return;
  if (e.target.closest('.storm-hud')) return;
  if (brawl.phase === 'heat') {
    const third = e.clientX / window.innerWidth;
    if (third < 0.33) brawlMoveHeat(-1);
    else if (third > 0.67) brawlMoveHeat(1);
    else brawlConfirmHeat();
    return;
  }
  brawlPunch(brawlP(0));
});

// Touch: tap punches (P1); hold and drag and the nugget follows your finger across
// the belt (x AND depth); two-finger tap dodges. Menus: side thirds browse heat.
window.addEventListener('touchstart', (e) => {
  if (!brawlActive()) return;
  if (e.target.closest('.storm-hud')) return;
  if (brawl.phase === 'heat') {
    const third = e.touches[0].clientX / window.innerWidth;
    if (third < 0.33) brawlMoveHeat(-1);
    else if (third > 0.67) brawlMoveHeat(1);
    else brawlConfirmHeat();
    return;
  }
  if (brawl.phase !== 'play') { brawlPunch(brawlP(0)); return; }
  if (e.touches.length === 2) { brawlDodge(brawlP(0)); brawl.touch = null; return; }
  const t = e.touches[0];
  brawl.touch = { x0: t.clientX, y0: t.clientY, t0: performance.now(), move: false, dx: 0, dd: 0 };
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!brawlActive() || !brawl.touch) return;
  const t = e.touches[0];
  if (performance.now() - brawl.touch.t0 > 140 ||
    Math.abs(t.clientX - brawl.touch.x0) > 24 || Math.abs(t.clientY - brawl.touch.y0) > 24) {
    brawl.touch.move = true;
    const p1 = brawlP(0);
    const sx = t.clientX / brawl.scale + brawl.cam;
    const sy = (t.clientY / brawl.scale) - brawl.ground - 4;
    brawl.touch.dx = Math.abs(sx - p1.x) > 6 ? Math.sign(sx - p1.x) : 0;
    brawl.touch.dd = Math.abs(sy - p1.d) > 4 ? Math.sign(sy - p1.d) : 0;
  }
}, { passive: true });
window.addEventListener('touchend', () => {
  if (!brawlActive() || !brawl.touch) return;
  const p1 = brawlP(0);
  const held = performance.now() - brawl.touch.t0;
  if (!brawl.touch.move) {
    // long-press without moving = special, quick tap = punch
    if (held > 450 && p1 && p1.meter >= METER_MAX) brawlSpecial(p1);
    else if (held < 220) brawlPunch(p1);
  }
  brawl.touch = null;
});
// The OS can cancel a gesture (notification shade, palm rejection) — without
// this the frozen touch kept steering P1 until the next real tap.
window.addEventListener('touchcancel', () => { brawl.touch = null; });

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
function sfxBrawlSpecial() {
  [220, 330, 440, 660, 880].forEach((f, i) => brawlTone(f, i * 0.05, 0.12, 0.05, 'sawtooth'));
}
function sfxBrawlPickup() {
  brawlTone(660, 0, 0.07, 0.05, 'square');
  brawlTone(990, 0.08, 0.1, 0.05, 'square');
}
function sfxBrawlCluck() {
  // bwa-KAWW
  brawlTone(740, 0, 0.09, 0.07, 'square');
  brawlTone(520, 0.1, 0.2, 0.08, 'square');
  brawlTone(392, 0.18, 0.24, 0.06, 'sawtooth');
}

// ---- the test seam ------------------------------------------------------------------
// Blaster, Storm Drain and The Undercroft all expose one; this game did not, and
// that is why nothing in blender/tools/ had ever photographed it. Same contract as
// croftDebug: every field is optional, order is fixed (seed → rules → place →
// pose → clock), and it always returns the state it left behind.
//
//   brawlDebug({ seed: 7, heat: 'spicy', act: 1, stage: 1, freeze: 1 })
//   brawlDebug({ clear: 1, place: [{ kind:'mayo', x: 260, d: 16, face: -1 }] })
//   brawlDebug({ pst: 'upper', pstT: 0.09 })        // mid-punch, active frames
//   brawlDebug({ freeze: 0, steps: 6, stepDt: 1/60 })  // fixed-timestep sim
function brawlRedraw() {
  const ph = brawl.phase;
  // dt 0 makes the step functions pure draws — they advance nothing at zero.
  if (ph === 'title') return brawlDrawTitle();
  if (ph === 'heat') return brawlDrawHeat();
  if (ph === 'cut') return brawlStepCut(0);
  if (ph === 'end') return brawlStepEnd(0);
  if (ph === 'map') return drawMap();
  return drawBrawl();
}

window.brawlDebug = function (opts) {
  opts = opts || {};
  if (!brawl.on) return { error: 'brawl is not running — startStorm() then setStormMode("brawl")' };
  if (opts.seed !== undefined) brawlSeed(opts.seed);
  if (opts.heat && BRAWL_HEATS[opts.heat]) {
    brawl.heat = opts.heat;
    brawl.cfg = BRAWL_HEATS[opts.heat];
  }
  if (opts.shift != null) brawl.shift = opts.shift;
  if (opts.twoP != null) {
    brawl.twoP = !!opts.twoP;
    brawl.players = brawl.twoP ? [brawlMakePlayer(0), brawlMakePlayer(1)] : [brawlMakePlayer(0)];
  }
  if (!brawl.players.length) brawl.players = [brawlMakePlayer(0)];

  // Jump straight into a stage — no title, no heat card, no cutscene. The ambush
  // cursor is advanced past everything behind us, or the jump immediately fires
  // act 1's first wave in the middle of the vat room.
  if (opts.act != null || opts.stage != null) {
    const a = opts.act != null ? opts.act : brawl.act;
    brawlStartAct(a);
    brawl.stage = Math.max(0, Math.min(BRAWL_ACTS[a].stages.length - 1, opts.stage != null ? opts.stage : 0));
    const x0 = BRAWL_ACTS[a].stages[brawl.stage].x0;
    brawl.ambushIdx = BRAWL_ACTS[a].ambushes.filter((am) => am.x < x0).length;
    brawlPlayStage();
    brawl.goT = 0;
    brawl.banner && brawl.banner.classList.remove('show');
    clearTimeout(brawl.bannerT);
  }
  if (opts.phase) {
    brawl.phase = opts.phase;
    if (opts.phase === 'cut') brawl.cut = { key: opts.cut || 'intro', li: opts.li || 0, ch: 1e4, next: null };
    if (opts.phase === 'end') brawl.endT = opts.endT != null ? opts.endT : 2.2;
    if (opts.phase === 'map') brawl.mapT = opts.mapT != null ? opts.mapT : 1.2;
  }
  if (opts.heatSel != null) brawl.heatSel = opts.heatSel;

  if (opts.clear) {
    brawl.enemies = []; brawl.blobs = []; brawl.fx = [];
    brawl.splats = []; brawl.drops = [];
    brawl.locked = false; brawl.hitstop = 0; brawl.shake = 0;
  }
  // Exact placement. spawnCup() rolls depth, speed and a golden chance, which is
  // right for the game and useless for a table: two runs must photograph the same
  // cup in the same lane.
  if (opts.place) {
    for (const s of opts.place) {
      spawnCup(s.kind, 1, 0);
      const e = brawl.enemies[brawl.enemies.length - 1];
      if (s.x != null) e.x = s.x;
      if (s.d != null) e.d = s.d;
      if (s.face != null) e.face = s.face;
      if (s.hp != null) e.hp = s.hp;
      if (s.st) { e.st = s.st; e.stT = s.stT || 0; }
      if (s.golden != null) e.golden = !!s.golden;
      if (s.bossPhase != null) e.phase = s.bossPhase;
      if (s.launch != null) e.launch = s.launch;
    }
  }
  if (opts.locked != null) brawl.locked = !!opts.locked;
  if (opts.drop) brawlSpawnDrop(opts.drop[0], opts.drop[1], opts.drop[2]);

  const p = brawl.players[0];
  if (opts.at) { p.x = opts.at[0]; p.d = opts.at[1]; }
  if (opts.at2 && brawl.players[1]) { brawl.players[1].x = opts.at2[0]; brawl.players[1].d = opts.at2[1]; }
  if (opts.face != null) p.face = opts.face;
  if (opts.hearts != null) p.hearts = opts.hearts;
  if (opts.meter != null) p.meter = opts.meter;
  if (opts.rage != null) p.rage = opts.rage;
  if (opts.weapon != null) p.weapon = opts.weapon ? { uses: opts.weapon } : null;
  if (opts.walk != null) p.walk = opts.walk;
  // iT is the post-hit blink, and it makes drawPlayer() return early on half the
  // frames. A pose shot with it live is a coin flip on whether there is a player
  // in the picture at all.
  if (opts.iT != null) p.iT = opts.iT;
  if (opts.pst) {
    p.st = opts.pst;
    p.stT = opts.pstT || 0;
    p.punch = null;
    if (opts.pst === 'jab' || opts.pst === 'upper') {
      const mv = PUNCH_CHAIN[opts.pst === 'upper' ? 2 : 0];
      p.punch = { ...mv, idx: opts.pst === 'upper' ? 2 : 0, hit: new Set() };
    } else if (opts.pst === 'special') {
      p.punch = { dmg: SPECIAL_DMG, hit: new Set() };
    }
    if (opts.pst === 'ko') { p.ko = true; p.koT = opts.pstT || 0.6; p.st = 'idle'; }
  }
  if (opts.cam != null) brawl.cam = opts.cam;
  if (opts.crowdHype != null) brawl.crowdHype = opts.crowdHype;
  if (opts.t != null) brawl.t = opts.t;
  // Held input, so `steps` can walk a real walk cycle instead of teleporting a
  // pose. { l, r, u, dn } — the same object the keyboard handler writes.
  if (opts.keys) Object.assign(p.keys, opts.keys);
  if (opts.hurt) hurtPlayer(p, p.x + p.face * 12);

  // Fixed-timestep advance: the only honest way to look at a fighting game. Runs
  // the REAL step function, so hitstop, knockback and the AI all behave, but the
  // clock is ours instead of the display's.
  if (opts.steps) {
    const dt = opts.stepDt || 1 / 60;
    const was = brawl.frozen;
    brawl.frozen = false;
    for (let i = 0; i < opts.steps; i++) stepBrawl(dt, window.innerWidth, window.innerHeight);
    brawl.frozen = was;
  }
  if (opts.freeze != null) brawl.frozen = !!opts.freeze;
  if (brawl.frozen) brawlRedraw();

  return {
    phase: brawl.phase, frozen: !!brawl.frozen, seed: brawl.seed,
    heat: brawl.heat, shift: brawl.shift, twoP: brawl.twoP,
    act: brawl.act, stage: brawl.stage, stageName: brawlAct().stages[brawl.stage].name,
    t: +brawl.t.toFixed(3), cam: Math.round(brawl.cam), len: brawlLen(),
    locked: brawl.locked, ambushIdx: brawl.ambushIdx, kos: brawl.kos,
    W: brawl.W, Hh: brawl.Hh, scale: brawl.scale, ground: brawl.ground,
    players: brawl.players.map((q) => ({
      x: Math.round(q.x), d: Math.round(q.d), st: q.st, stT: +q.stT.toFixed(3),
      face: q.face, hearts: q.hearts, ko: q.ko, meter: Math.round(q.meter),
    })),
    enemies: brawl.enemies.map((e) => ({
      kind: e.kind, x: Math.round(e.x), d: Math.round(e.d), st: e.st,
      hp: e.hp, dead: e.dead, boss: !!e.boss, golden: !!e.golden,
    })),
    counts: {
      enemies: brawl.enemies.length, blobs: brawl.blobs.length, fx: brawl.fx.length,
      splats: brawl.splats.length, drops: brawl.drops.length,
      crates: brawl.crates.filter((c) => !c.broken).length,
    },
  };
};
