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
    ['NUG', "tell her I'm battered. not broken."],
  ] },
  finaldoor: { art: 'coop', lines: [
    ['MOTHER CLUCKER', 'welcome to the coop, little nugget.'],
    ['MOTHER CLUCKER', 'you would make SUCH a fine dipper.'],
    ['NUG', 'SEE YOU IN HELL, MOTHER CLUCKER.'],
  ] },
  ending: { art: 'sunrise', lines: [
    [null, 'the vats drain. the syndicate scatters.'],
    ['HONEY', 'my hero... you look crispy.'],
    ['NUG', 'battered. never broken.'],
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
    setTimeout(() => {
      if (!brawl.on) return;
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
  setTimeout(() => {
    if (!brawl.on) return;
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
  const golden = Math.random() < 0.05;
  brawl.enemies.push({
    kind,
    x: atX + side * (brawl.W * 0.5 + 12 + Math.random() * 26),
    d: 3 + Math.random() * (DEPTH_MAX - 6),
    hp: c.hp + brawl.cfg.hpUp + Math.floor(shiftUp / 2),
    speed: c.speed * (0.85 + Math.random() * 0.3) * brawl.cfg.speed * (1 + shiftUp * 0.1) * (golden ? 1.5 : 1),
    st: 'walk', stT: 0, face: -side, dead: false, golden,
    guardUp: !!c.guard, blockT: 0,
    waddle: Math.random() * 7,
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
  return pool[(Math.random() * pool.length) | 0];
}

// ---- pickups ---------------------------------------------------------------------

function brawlSpawnDrop(kind, x, d) {
  if (kind === 'rand') {
    const r = Math.random();
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
  if (e.boss) {
    brawl.shake = 0.5;
    sfxBrawlBossDown();
  } else if (Math.random() < 0.12) {
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

function brawlFx(x, d, h, kind) {
  brawl.fx.push({ x, d, h, kind, t: 0 });
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
    brawl.wanderAt = leadX + 170 + Math.random() * 120;
    if (Math.random() < 0.45) spawnCup(pickBrawlCup(), 1, brawl.cam + brawl.W / 2);
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
    if (brawl.fx[i].t > 0.25) brawl.fx.splice(i, 1);
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
      brawlFx((e.x + p.x) / 2, e.d, 14, 'spark');
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
      brawlFx((e.x + hx) / 2, e.d, 10, 'dust');
      sfxBrawlSlam();
      continue;
    }
    if (e.guardUp && (isUpper || !frontal)) e.guardUp = false; // guard broken for good
    e.hp -= m.dmg;
    p.meter = Math.min(METER_MAX, p.meter + 9 * brawl.cfg.meterGain * (isUpper ? 1.6 : 1));
    brawl.hitstop = 0.05;
    brawlFx((e.x + hx) / 2, e.d, isUpper ? 16 : 11, 'spark');
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
        if (Math.random() < 0.4) e.x -= e.face * 8;
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
      else if (e.phase >= 2 && adx < 90 && Math.random() < 0.5) { e.st = 'flapWind'; e.stT = 0; }
      else if (e.phase === 3 && Math.random() < 0.4) { e.st = 'stompWind'; e.stT = 0; }
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

// ---- pixel rendering: the act strips ------------------------------------------------

// ACT 1 — kitchen → freezer → loading dock → vault (the original shift).
function brawlStripRestaurant(Hh, ground) {
  const LEN = 2160, SEC = 720;
  const c = document.createElement('canvas');
  c.width = LEN;
  c.height = Hh;
  const g = c.getContext('2d');

  const wallFor = (sec) => sec === 0 ? ['#17222f', '#121b27'] : sec === 1 ? ['#1c2b36', '#16232d'] : ['#231a16', '#1a1310'];
  for (let sec = 0; sec < 3; sec++) {
    const x0 = sec * SEC, [wa, wb] = wallFor(sec);
    g.fillStyle = wa;
    g.fillRect(x0, 0, SEC, ground);
    g.fillStyle = wb;
    if (sec === 2) {
      // loading dock: big bricks
      for (let y = 0; y < ground; y += 8)
        for (let x = x0 + ((y / 8) % 2 ? 8 : 0); x < x0 + SEC; x += 16)
          g.fillRect(x, y, 15, 7);
    } else {
      for (let y = 0; y < ground; y += 10)
        for (let x = x0 + ((y / 10) % 2 ? 5 : 0); x < x0 + SEC; x += 10)
          g.fillRect(x, y, 9, 9);
    }
    // top shadow
    const shade = g.createLinearGradient(0, 0, 0, ground);
    shade.addColorStop(0, 'rgba(0,0,4,0.72)');
    shade.addColorStop(0.6, 'rgba(0,0,4,0.15)');
    shade.addColorStop(1, 'rgba(0,0,4,0)');
    g.fillStyle = shade;
    g.fillRect(x0, 0, SEC, ground);
  }

  // ---- section 1: the kitchen (bunting, fridge, stoves, windows, shelves)
  const bunY = Math.max(14, ground - 118);
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
      g.fillRect(x, 0, 4, len);
      g.fillRect(x + 1, len, 2, 4);
    }
    // frost patches on the wall
    g.fillStyle = 'rgba(190,228,244,0.14)';
    for (let i = 0; i < 26; i++) {
      const fx2 = x0 + 30 + ((i * 173) % (SEC - 60));
      const fy2 = 20 + ((i * 97) % (ground - 60));
      g.fillRect(fx2, fy2, 14 + (i % 3) * 8, 8 + (i % 2) * 6);
    }
    // hanging frozen nugget slabs on a rail
    g.fillStyle = '#565f85';
    g.fillRect(x0 + 120, 26, SEC - 240, 3);
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

  brawlStripFloor(g, LEN, Hh, ground, '#1b2434', '#242f44', '#e8412c');
  return c;
}

// checker/backsplash floor shared by the acts (colors set the mood per act)
function brawlStripFloor(g, LEN, Hh, ground, a, b, lip) {
  g.fillStyle = '#233242';
  g.fillRect(0, ground - 8, LEN, 8);
  g.fillStyle = lip;
  g.fillRect(0, ground - 8, LEN, 1);
  for (let y = ground; y < Hh; y += 6) {
    const row = (y - ground) / 6;
    for (let x = (row % 2) * 6 - 6; x < LEN + 6; x += 12) {
      g.fillStyle = a; g.fillRect(x, y, 6, 6);
      g.fillStyle = b; g.fillRect(x + 6, y, 6, 6);
    }
  }
}

// ACT 2 — grease alley → neon strip → rooftops → mustard penthouse.
function brawlStripNuggetown(Hh, ground) {
  const LEN = 2400, SEC = 800;
  const c = document.createElement('canvas');
  c.width = LEN;
  c.height = Hh;
  const g = c.getContext('2d');

  // night sky base across the whole act — buildings paint over it
  const sky = g.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, '#060916');
  sky.addColorStop(1, '#131a30');
  g.fillStyle = sky;
  g.fillRect(0, 0, LEN, ground);
  g.fillStyle = '#8a93b8';
  for (let i = 0; i < 160; i++) g.fillRect((i * 173) % LEN, (i * 61) % Math.max(ground - 40, 20), 1, 1);
  g.fillStyle = '#f4ecd4';
  g.beginPath(); g.arc(SEC * 2 + 320, 28, 14, 0, 7); g.fill();
  g.fillStyle = '#131a30';
  g.beginPath(); g.arc(SEC * 2 + 326, 25, 12, 0, 7); g.fill();

  // ---- section 1: grease alley (brick, dumpster, fire escapes, graffiti)
  {
    g.fillStyle = '#1c1216'; g.fillRect(0, 0, SEC, ground);
    g.fillStyle = '#140d10';
    for (let y = 0; y < ground; y += 8)
      for (let x = ((y / 8) % 2 ? 8 : 0); x < SEC; x += 16) g.fillRect(x, y, 15, 7);
    // fire escapes
    for (const fx of [90, 420, 660]) {
      g.fillStyle = '#2a3040';
      for (let i = 0; i < 3; i++) {
        const fy = 18 + i * 32;
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
    g.fillStyle = '#171522'; g.fillRect(x0, 0, SEC, ground);
    g.fillStyle = '#100e18';
    for (let y = 0; y < ground; y += 10)
      for (let x = x0 + ((y / 10) % 2 ? 5 : 0); x < x0 + SEC; x += 10) g.fillRect(x, y, 9, 9);
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
    // distant skyline against the sky
    g.fillStyle = '#0d1220';
    for (let i = 0; i < 12; i++) {
      const bw = 40 + ((i * 37) % 50), bh = 40 + ((i * 53) % 70);
      const bx = x0 + i * 68;
      g.fillRect(bx, ground - 60 - bh, bw, bh + 20);
      g.fillStyle = '#39465c';
      for (let z = 0; z < 8; z++)
        if ((z * 7 + i * 13) % 3 === 0) g.fillRect(bx + 4 + (z % 4) * 9, ground - 50 - bh + Math.floor(z / 4) * 14, 4, 6);
      g.fillStyle = '#0d1220';
    }
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

  brawlStripFloor(g, LEN, Hh, ground, '#191921', '#22222c', '#e6b800');
  // penthouse floor: red carpet with gold trim over the asphalt
  g.fillStyle = '#5c1020'; g.fillRect(2180, ground, LEN - 2180, Hh - ground);
  g.fillStyle = '#7a1830';
  for (let y = ground; y < Hh; y += 6)
    for (let x = 2180 + (((y - ground) / 6) % 2) * 6; x < LEN; x += 12) g.fillRect(x, y, 6, 6);
  g.fillStyle = '#ffd23a'; g.fillRect(2180, ground, 3, Hh - ground);
  return c;
}

// ACT 3 — factory floor → vat room → packing line → the coop.
function brawlStripSauceWorks(Hh, ground) {
  const LEN = 2400, SEC = 800;
  const c = document.createElement('canvas');
  c.width = LEN;
  c.height = Hh;
  const g = c.getContext('2d');

  // industrial base wall
  g.fillStyle = '#1a2026'; g.fillRect(0, 0, LEN, ground);
  g.fillStyle = '#131920';
  for (let y = 0; y < ground; y += 12)
    for (let x = ((y / 12) % 2 ? 10 : 0); x < LEN; x += 20) g.fillRect(x, y, 19, 11);
  const shade = g.createLinearGradient(0, 0, 0, ground);
  shade.addColorStop(0, 'rgba(0,0,4,0.7)');
  shade.addColorStop(0.6, 'rgba(0,0,4,0.12)');
  shade.addColorStop(1, 'rgba(0,0,4,0)');
  g.fillStyle = shade;
  g.fillRect(0, 0, LEN, ground);

  // pipes run the whole ceiling
  for (const [py, col] of [[10, '#39465c'], [20, '#2e3d54'], [30, '#39465c']]) {
    g.fillStyle = col; g.fillRect(0, py, LEN, 6);
    g.fillStyle = '#565f85';
    for (let x = 30; x < LEN; x += 90) g.fillRect(x, py - 1, 6, 8);
  }

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
      g.fillRect(vx + 54, 34, 10, ground - 156);
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
    g.fillStyle = '#8a1c10'; g.fillRect(x0 + 30, 12, w2 - 60, 26);
    g.fillStyle = '#5c1008';
    for (let x = x0 + 30; x < LEN - 30; x += 12) g.fillRect(x, 36, 8, 5);
    g.font = '900 13px Consolas, monospace';
    g.fillStyle = '#ffe23a';
    g.fillText('MOTHER CLUCKER', x0 + 48, 30);
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

  brawlStripFloor(g, LEN, Hh, ground, '#20242c', '#2a2f3a', '#ffe23a');
  // metal plate rivets
  g.fillStyle = '#39465c';
  for (let x = 24; x < 2180; x += 48) { g.fillRect(x, ground + 8, 2, 2); g.fillRect(x, Hh - 8, 2, 2); }
  // coop floor: straw over the plating
  g.fillStyle = '#3a2c10'; g.fillRect(2180, ground, LEN - 2180, Hh - ground);
  g.fillStyle = '#5c4a1a';
  for (let i = 0; i < 90; i++)
    g.fillRect(2180 + ((i * 41) % (LEN - 2180)), ground + ((i * 29) % (Hh - ground)), 5, 1);
  return c;
}

// ---- shared pixel helpers ----------------------------------------------------------

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

const BRAWL_P_COLORS = [
  { band: '#d32f2f', glove: '#d32f2f', trim: '#f4f0e6' },
  { band: '#2f6ad3', glove: '#2f6ad3', trim: '#f4f0e6' },
];

// ---- title / heat / cutscene / credits ----------------------------------------------

function brawlMenuBase(g, W, Hh) {
  g.fillStyle = '#0a0d18';
  g.fillRect(0, 0, W, Hh);
  // marquee chase lights around the frame
  for (let x = 4; x < W - 4; x += 10) {
    const on = Math.floor(brawl.t * 6 + x / 10) % 3 === 0;
    px(g, x, 4, 3, 3, on ? '#ffe23a' : '#3a2c14');
    px(g, x, Hh - 7, 3, 3, on ? '#ffe23a' : '#3a2c14');
  }
}

function brawlDrawTitle() {
  const g = brawl.g, W = brawl.W, Hh = brawl.Hh;
  brawlMenuBase(g, W, Hh);
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

// small pixel tableaus behind the story text
function brawlCutArt(g, W, Hh, art) {
  const cx = W / 2, gy = Hh * 0.52;
  if (art === 'diner') {
    px(g, cx - 70, gy - 10, 140, 8, '#3a2c14');       // the counter
    px(g, cx - 70, gy - 2, 140, 3, '#241a0a');
    g.drawImage(nugBody(7, 4, '#e8a83e', '#8a5a1d'), cx - 40, gy - 34);
    px(g, cx - 37, gy - 30, 12, 2, '#d32f2f');
    // honey, bow and all
    px(g, cx + 14, gy - 26, 12, 14, '#f4f0e6');
    px(g, cx + 14, gy - 22, 12, 3, '#e8a020');
    px(g, cx + 16, gy - 30, 3, 3, '#ff2fa0'); px(g, cx + 21, gy - 30, 3, 3, '#ff2fa0');
    px(g, cx + 17, gy - 20, 2, 2, '#1a0f08'); px(g, cx + 22, gy - 20, 2, 2, '#1a0f08');
    // moonlit window
    px(g, cx - 20, gy - 66, 40, 26, '#0a0d1c');
    px(g, cx - 6, gy - 60, 8, 8, '#f4ecd4');
  } else if (art === 'vault') {
    px(g, cx - 30, gy - 64, 60, 54, '#8a7a4a');
    px(g, cx - 22, gy - 56, 44, 40, '#5c5232');
    px(g, cx - 6, gy - 42, 12, 12, '#ffd23a');
    // wasabi, flattened
    px(g, cx - 40, gy - 8, 24, 6, '#2e9e53');
    px(g, cx - 36, gy - 12, 8, 4, '#ffe23a');
  } else if (art === 'penthouse') {
    px(g, cx - 50, gy - 60, 100, 4, '#ffd23a');
    // dijon face-down, hat rolled away
    px(g, cx - 16, gy - 10, 26, 8, '#f4f0e6');
    px(g, cx - 16, gy - 12, 26, 3, '#e6b800');
    px(g, cx + 22, gy - 12, 14, 8, '#131313');
    px(g, cx + 26, gy - 16, 8, 4, '#131313');
  } else if (art === 'coop') {
    // the clucker looms in silhouette
    px(g, cx - 26, gy - 66, 52, 46, '#1a0f08');
    px(g, cx - 12, gy - 78, 24, 16, '#1a0f08');
    px(g, cx - 4, gy - 84, 10, 8, '#8a1c10');
    px(g, cx + 12, gy - 74, 8, 4, '#c9541f');
    px(g, cx + 2, gy - 74, 4, 4, '#ff5252');
    // the cage
    px(g, cx + 44, gy - 60, 20, 2, '#565f85');
    for (let i = 0; i < 4; i++) px(g, cx + 44 + i * 6, gy - 60, 2, 22, '#565f85');
    px(g, cx + 48, gy - 48, 10, 10, '#f4f0e6');
    px(g, cx + 50, gy - 52, 3, 3, '#ff2fa0');
  } else if (art === 'sunrise') {
    const sun = g.createLinearGradient(0, gy - 80, 0, gy);
    sun.addColorStop(0, '#2a3550');
    sun.addColorStop(1, '#c9541f');
    g.fillStyle = sun;
    g.fillRect(cx - 90, gy - 80, 180, 76);
    px(g, cx - 20, gy - 26, 40, 10, '#e8a020');
    g.drawImage(nugBody(7, 4, '#e8a83e', '#8a5a1d'), cx - 34, gy - 32);
    px(g, cx - 31, gy - 28, 12, 2, '#d32f2f');
    if (brawl.twoP) {
      g.drawImage(nugBody(7, 6, '#e8a83e', '#8a5a1d'), cx - 56, gy - 30);
      px(g, cx - 53, gy - 26, 12, 2, '#2f6ad3');
    }
    px(g, cx + 18, gy - 28, 12, 14, '#f4f0e6');
    px(g, cx + 18, gy - 24, 12, 3, '#e8a020');
    px(g, cx + 20, gy - 32, 3, 3, '#ff2fa0'); px(g, cx + 25, gy - 32, 3, 3, '#ff2fa0');
  }
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
  // letterbox bars
  px(g, 0, 0, W, 14, '#000');
  px(g, 0, Hh - 46, W, 46, '#000');
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
  if (p.iT > 0 && !p.ko && Math.floor(brawl.t * 16) % 2) return;
  const step = Math.floor(p.walk) % 4;
  const bob = p.st === 'walk' ? (step % 2) : Math.floor(brawl.t * 2.5) % 2;
  const x = Math.round(p.x - brawl.cam), gy = entY(p.d);
  const y = gy - 10 - bob;
  const f = p.face;
  const body = p.rage > 0 && Math.floor(brawl.t * 10) % 3 === 0 ? '#f0722e' : '#e8a83e';

  if (p.ko) {
    // face-down in the sauce, stars optional
    g.save();
    g.translate(x, gy - 4);
    g.rotate(f * 1.5);
    g.drawImage(nugBody(7, 4 + p.idx * 2, body, '#8a5a1d'), -9, -8);
    g.restore();
    if (brawl.twoP && Math.floor(brawl.t * 2) % 2) {
      g.font = '700 7px monospace';
      g.textAlign = 'center';
      g.fillStyle = '#9be8ff';
      g.fillText('TAG!', x, gy - 18);
    }
    return;
  }
  if (p.st === 'special') {
    // the CYCLONE: a blurred spin with sauce trailing off the gloves
    const ang = p.stT * 26;
    g.save();
    g.translate(x, y - 2);
    g.rotate(ang % (Math.PI * 2));
    g.drawImage(nugBody(7, 4 + p.idx * 2, body, '#8a5a1d'), -9, -8);
    g.restore();
    for (let i = 0; i < 3; i++) {
      const a = ang + i * 2.1;
      px(g, x + Math.cos(a) * 13 - 1, y - 2 + Math.sin(a) * 6, 3, 3, col.glove);
    }
    px(g, x - 4 + (step ? -1 : 1), gy - 2, 3, 2, '#8a5a1d');
    px(g, x + 2 + (step ? 1 : -1), gy - 2, 3, 2, '#8a5a1d');
    return;
  }
  if (p.st === 'dodge') {
    g.globalAlpha = 0.35;
    g.drawImage(nugBody(7, 4 + p.idx * 2, body, '#8a5a1d'), x - 9 - f * 6, y - 8);
    g.globalAlpha = 1;
  }
  px(g, x - 4 + (p.st === 'walk' ? (step < 2 ? -1 : 1) : 0), gy - 2, 3, 2, '#8a5a1d');
  px(g, x + 2 + (p.st === 'walk' ? (step < 2 ? 1 : -1) : 0), gy - 2, 3, 2, '#8a5a1d');
  g.drawImage(nugBody(7, 4 + p.idx * 2, body, '#8a5a1d'), x - 9, y - 8);
  px(g, x - 6, y - 6, 12, 2, col.band);
  px(g, x - 8 - (f < 0 ? -15 : 0), y - 5, 3, 1, col.band);
  px(g, x + f * 2, y - 3, 2, 2, '#fff');
  px(g, x + f * 5, y - 3, 2, 2, '#fff');
  px(g, x + f * 2 + (f > 0 ? 1 : 0), y - 2, 1, 1, '#1a0f08');
  px(g, x + f * 5 + (f > 0 ? 1 : 0), y - 2, 1, 1, '#1a0f08');
  px(g, x + f * 2 - 1, y - 5, 3, 1, '#42200e');
  px(g, x + f * 4, y - 5, 3, 1, '#42200e');

  const glove = (gx, gy2, big) => {
    px(g, gx - 1, gy2 - 1, big ? 4 : 3, big ? 4 : 3, col.glove);
    px(g, gx - 1, gy2 + (big ? 3 : 2), big ? 4 : 3, 1, col.trim);
  };
  if (p.st === 'jab' || p.st === 'upper') {
    const m = p.punch;
    const ext = Math.sin(Math.min(p.stT / m.active1, 1) * Math.PI) * m.reach;
    if (p.weapon) {
      // the spatula leads the swing
      px(g, x + f * (4 + ext * 0.8), y - 1 - (p.st === 'upper' ? ext * 0.5 : 0), f * 7, 2, '#8a93b8');
      px(g, x + f * (10 + ext * 0.8), y - 3 - (p.st === 'upper' ? ext * 0.5 : 0), f * 4, 6, '#c9d4f0');
    }
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
    if (p.weapon) px(g, x + f * 6, y + 1, f * 6, 2, '#8a93b8');
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
  const big = e.kind === 'mayo';
  if (big) y -= 3;
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
  const lean = e.st === 'windup' ? -e.face * 2 : (e.st === 'lunge' || e.st === 'dash' || e.st === 'slam') ? e.face * 3 : 0;
  const flash = e.st === 'hurt' && Math.floor(e.stT * 30) % 2;
  const w2 = big ? 13 : 10, hw = w2 / 2;
  // soy ninjas blur when dashing
  if (e.kind === 'soy' && e.st === 'dash') {
    g.globalAlpha = 0.4;
    px(g, x - hw - e.face * 8, y, w2, big ? 13 : 10, pal.dark);
    g.globalAlpha = 1;
  }
  px(g, x - 4 + (step ? -1 : 0), gy - 2, 3, 2, pal.dark);
  px(g, x + 1 + (step ? 1 : 0), gy - 2, 3, 2, pal.dark);
  px(g, x - hw + lean, y, w2, big ? 13 : 10, flash ? '#fff' : '#f4f0e6');
  px(g, x - hw + lean, y + 3, w2, 2, flash ? '#fff' : pal.body);
  px(g, x - hw - 1 + lean, y, w2 + 2, 1, flash ? '#fff' : '#c9cfe0');
  px(g, x - hw + 1 + lean, y - 4, w2 - 2, 4, flash ? '#fff' : pal.body);
  px(g, x - hw + 2 + lean, y - 5, w2 - 4, 1, flash ? '#fff' : pal.body);
  px(g, x - hw + 2 + lean, y - 5, 2, 1, flash ? '#fff' : pal.lite);
  if (!flash) {
    if (e.kind === 'soy') {
      // masked: one narrow visor instead of eyes
      px(g, x - 3 + lean, y - 4, 7, 2, '#0a0a10');
      px(g, x - 2 + lean + (e.face > 0 ? 2 : 0), y - 4, 2, 2, '#ff5252');
    } else {
      px(g, x - 2 + lean + (e.face > 0 ? 1 : 0), y - 3, 1, 1, '#1a0f08');
      px(g, x + 1 + lean + (e.face > 0 ? 1 : 0), y - 3, 1, 1, '#1a0f08');
      px(g, x - 3 + lean, y - 4, 2, 1, '#1a0f08');
      px(g, x + 1 + lean, y - 4, 2, 1, '#1a0f08');
    }
  }
  // mayo's guard: a little lid held up like a shield
  if (e.guardUp && !flash) {
    const sx = x + e.face * (hw + 2);
    px(g, sx - 1, y - 2, 3, 9, e.blockT > 0 ? '#fff' : '#c9cfe0');
    px(g, sx - 1, y - 2, 3, 2, '#8a93b8');
  }
  if (e.st === 'windup') px(g, x + e.face * (hw + 2), y - 6, 2, 2, '#ffe23a');
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

function drawDijon(g, e) {
  const x = Math.round(e.x - brawl.cam), gy = entY(e.d);
  const step = Math.floor(brawl.t * 7) % 2;
  const flash = e.st === 'hurt' && Math.floor(e.stT * 30) % 2;
  const lean = e.st === 'caneWind' ? -e.face * 3 : e.st === 'swipe' ? e.face * 4 : 0;
  const y = gy - 26;
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
  const flash = e.st === 'hurt' && Math.floor(e.stT * 30) % 2;
  const lunge = e.st === 'peck' ? e.face * 6 : e.st === 'peckWind' ? -e.face * 3 : 0;
  const y = gy - 38;
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
