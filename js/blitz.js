// ---- 💥 NUGGET BLITZ ------------------------------------------------------------------
// "ok we need to make a fun version of NFL Blitz. Try to get as close as
// possible to the original NFL Blitz for N64." — Chris, 2026-10-01
//
// Game 19 (mode key: blitz). Nugmo Bowl is Tecmo: sideways, pixel, four plays.
// This is the OTHER cartridge, the one that rattled the N64 in 1998:
//
//   • SEVEN ON SEVEN, a 3D field seen from BEHIND THE OFFENSE, the camera
//     riding the ball downfield (a real perspective projection on a 2D canvas,
//     drawn low-res and smoothed up the way the N64 smeared everything)
//   • 30 YARDS FOR A FIRST DOWN. Four downs. No refs, no flags, no mercy.
//   • the 3×3 PLAY SELECT, offense and defense, with FLIP. DA BOMB, SLANTS,
//     HAIL MARY, SUICIDE BLITZ, SAFE COVER, the whole card.
//   • TURBO on its own button and its own meter. Turbo + pass = a bullet.
//   • pass to whoever the stick POINTS at; past the line, pass = LATERAL
//   • JUMP to hurdle or high-point, TURBO+JUMP spins, TURBO+PASS stiff-arms,
//     on defense TURBO+JUMP is the dive and contact at turbo is a MONSTER HIT
//   • LATE HITS. The whistle is a suggestion. Shove anyone after the play.
//   • HE'S ON FIRE: three straight catches by one receiver (or three straight
//     stops on defense) and the whole team burns — infinite turbo, flaming
//     ball — until the other side scores.
//   • fumbles stay LIVE, interceptions get returned, laterals can go loose
//   • kickoffs, punts, field goals, the PAT-or-go-for-two choice
//   • the VS SCREEN CODES: tap TURBO / JUMP / PASS to set three digits, then a
//     direction. 2-0-0 → is BIG HEAD. (The full list is in AGENTS.md.)
//   • the CPU rubber-bands, as it did. NO CPU ASSIST (0-1-2 ↓) turns it off.
//
// Lore: none required. It's a weird nugget football game in a weird nugget
// town, and the stands are full. Scoring mirrors the other games: football
// events are perFlyer-scaled into storm.caught (× the tier's mult);
// stopStorm() banks it.

const blitzWorld = document.getElementById('blitzWorld');

const BLZ_WID = 53.3, BLZ_MID = BLZ_WID / 2, BLZ_LEN = 120; // yards; end zones 0..10 and 110..120
const BLZ_FIRST = 30;                // the Blitz first down
const BLZ_QLEN = 75;                 // seconds of LIVE play per quarter (the clock stops between plays)
const BLZ_CAM = { h: 11, back: 12.5, pitch: 0.56 }; // behind and above the offense, like the cart
const BLZ_RES = 384;                 // internal canvas height: low-res, smoothed up (the N64 smear)
const BLZ_OFF_POS = ['QB', 'C', 'LG', 'RG', 'WR1', 'WR2', 'RB'];
const BLZ_DEF_POS = ['DE1', 'DT', 'DE2', 'LB', 'CB1', 'CB2', 'S'];
const BLZ_ELIG = { WR1: 1, WR2: 1, RB: 1 };

// ---- teams ------------------------------------------------------------------------------
// The Nugget Football Nation: eight franchises, every one of them a side dish.
// You pick yours on the TEAM SELECT screen; the ladder picks who you play
// (`opp`, or `alt` if you picked them). Stat lines were tuned headless: the
// NUGS are the old CRUNCH line, the TOTS/BOSSES/GODS are the three ladder
// rungs, and the other four are pickable flavours of roughly NUGS strength.
// helm/stripe/mask = helmet; c1 jersey, c2 trim; pants, sock; logo = helmet letter.
const BLZ_TEAMS = {
  nugs: { city: 'NUGGETOWN', name: 'NUGS', full: 'THE NUGS', abbr: 'NUG', logo: 'N',
    c1: '#c8321f', c2: '#ffd23a', helm: '#c8321f', stripe: '#ffd23a', mask: '#e8e8ee', pants: '#ffd23a', sock: '#c8321f', num: '#ffffff', ez: '#8e1f16',
    blurb: 'THE HOME TEAM. GOLDEN BROWN.' },
  frygods: { city: 'MOUNT FRYMPUS', name: 'FRY GODS', full: 'THE FRY GODS', abbr: 'FRY', logo: 'F',
    c1: '#f2f0e8', c2: '#e8b020', helm: '#e8b020', stripe: '#ffffff', mask: '#7a5a10', pants: '#e8b020', sock: '#f2f0e8', num: '#c8321f', ez: '#a8780e',
    blurb: 'IMMORTAL. SALTED. UNDEFEATED.' },
  tots: { city: 'SPUD VALLEY', name: 'TATER TOTS', full: 'THE TATER TOTS', abbr: 'TOT', logo: 'T',
    c1: '#7a4a1e', c2: '#ff9a2a', helm: '#ff9a2a', stripe: '#7a4a1e', mask: '#3a2410', pants: '#e8d8b8', sock: '#7a4a1e', num: '#ff9a2a', ez: '#5a3410',
    blurb: 'SMALL. CRISPY. EVERYWHERE.' },
  ranch: { city: 'DIP CITY', name: 'RANCH HANDS', full: 'THE RANCH HANDS', abbr: 'DIP', logo: 'R',
    c1: '#eef2e6', c2: '#3aa04a', helm: '#eef2e6', stripe: '#3aa04a', mask: '#3aa04a', pants: '#3aa04a', sock: '#eef2e6', num: '#2a7a36', ez: '#2a7a36',
    blurb: 'COOL, CREAMY, AND MEAN.' },
  bosses: { city: 'THE BBQ PIT', name: 'SAUCE BOSSES', full: 'THE SAUCE BOSSES', abbr: 'BBQ', logo: 'S',
    c1: '#6a1420', c2: '#ff8a1e', helm: '#1c1c1c', stripe: '#ff8a1e', mask: '#ff8a1e', pants: '#1c1c1c', sock: '#6a1420', num: '#ff8a1e', ez: '#4a0e16',
    blurb: 'SLOW SMOKED. FAST HITTING.' },
  rings: { city: 'LAYERTOWN', name: 'ONION RINGERS', full: 'THE ONION RINGERS', abbr: 'ONI', logo: 'O',
    c1: '#5a2a8a', c2: '#ffd23a', helm: '#5a2a8a', stripe: '#ffd23a', mask: '#ffd23a', pants: '#f2ecdc', sock: '#5a2a8a', num: '#ffd23a', ez: '#3e1a62',
    blurb: 'THEY WILL MAKE YOU CRY.' },
  mustard: { city: 'STING CITY', name: 'HONEY MUSTARDS', full: 'THE HONEY MUSTARDS', abbr: 'HNY', logo: 'H',
    c1: '#ffd23a', c2: '#1c1c1c', helm: '#1c1c1c', stripe: '#ffd23a', mask: '#ffd23a', pants: '#1c1c1c', sock: '#ffd23a', num: '#1c1c1c', ez: '#b8901a',
    blurb: 'SWEET ON THE FIELD. SPICY AFTER.' },
  curly: { city: 'SPIRAL CITY', name: 'CURLY FRIES', full: 'THE CURLY FRIES', abbr: 'CRL', logo: 'C',
    c1: '#14807e', c2: '#ff7a2a', helm: '#14807e', stripe: '#ff7a2a', mask: '#e8e8ee', pants: '#f2ecdc', sock: '#ff7a2a', num: '#ffffff', ez: '#0e5a58',
    blurb: 'NOBODY KNOWS WHICH WAY THEY RUN.' },
};
// what each team shouts at the line: the QB's cadence word, and the trash talk
const BLZ_FLAVOR = {
  nugs: { cad: 'GOLDEN', lines: ['GOLDEN BROWN, BABY!', 'YOU ARE ABOUT TO GET DIPPED!', 'TEN PIECE, NO WAITING!', 'NUGGETOWN, STAND UP!', 'WE PUT THE NUG IN NUGGET!'] },
  frygods: { cad: 'OLYMPUS', lines: ['KNEEL BEFORE THE FRY!', 'SALTED BY THE GODS!', 'BEHOLD, MORTAL!', 'YOU DARE CHALLENGE US?', 'CRINKLE CUT, BABY!'] },
  tots: { cad: 'TOT TOT', lines: ['WE ARE SMALL BUT WE ARE MEAN!', 'BITE SIZE, BIG HITS!', 'TOTS! TOTS! TOTS!', 'YOU ARE TOAST!', 'FAMILY SIZE BEATDOWN!'] },
  ranch: { cad: 'COOL RANCH', lines: ['STAY COOL, KID.', 'WELCOME TO DIP CITY!', 'WE GO WITH EVERYTHING!', 'CREAMY. AND MEAN.', 'YOU ARE DRESSED FOR A LOSS!'] },
  bosses: { cad: 'BIG SMOKE', lines: ['YOU ARE GETTING SAUCED!', 'LOW AND SLOW, BABY!', 'I SMELL BRISKET!', 'WE SMOKE FOOLS!', 'PASS THE SAUCE!'] },
  rings: { cad: 'LAYER', lines: ['PREPARE TO CRY!', 'WE GOT LAYERS!', 'ONION YOU GO!', 'PEEL HIM!', 'TEARS ON THE FIELD!'] },
  mustard: { cad: 'STINGER', lines: ['BUZZ OFF!', 'YOU ARE GONNA GET STUNG!', 'SWEET? NOT TODAY!', 'BEE-LIEVE IT!', 'HONEY, YOU ARE DONE!'] },
  curly: { cad: 'SPIRAL', lines: ['YOU CANNOT CATCH CURLY!', 'TWIST AND SHOUT!', 'WE ARE TOO TWISTY!', 'LOOP DE LOOP!', 'GET SPUN!'] },
};
const BLZ_TRASH = ['YOU ARE GOING DOWN!', 'I SMELL FRIES!', 'COME GET SOME!', 'EXTRA CRISPY!', 'IS THAT ALL YOU GOT?', 'I AM COMING FOR YOU!',
  'NICE HELMET. NOT.', 'YOU ARE SOGGY!', 'BREADED AND READY!', 'OVER HERE, BUTTERFINGERS!', 'NO REFS, NO RULES!', 'YOU ARE ON THE MENU!',
  'HIKE IT, I DARE YOU!', 'YOU ARE GETTING DUNKED!', 'NOBODY BEATS THE BATTER!'];
const BLZ_TAUNTS = ['flex', 'point', 'beckon', 'clap', 'chest', 'dance', 'hop', 'wiggle', 'roar'];
// (every spoken line is pre-recorded — js/blitzVO.js — so the dynamic bits are finite:
// four cadence numbers, each team's own share of the generic trash, a call name per man)
const BLZ_CAD_NUMS = [22, 34, 44, 80];
const BLZ_FIRSTNAMES = new Set(['BRETT', 'BARRY', 'RANDY', 'TIM', 'REGGIE', 'BRUCE']);
function blzCallName(p) {
  const w = String(p.name).split(' ');
  return BLZ_FIRSTNAMES.has(w[0]) && w.length > 1 ? w.slice(1).join(' ') : p.name;
}
function blzTrashPool(teamKey) {
  const i = Math.max(0, BLZ_TEAM_ORDER.indexOf(teamKey));
  return (BLZ_FLAVOR[teamKey] || BLZ_FLAVOR.nugs).lines.concat(BLZ_TRASH.filter((_, j) => (j + i) % 3 === 0));
}
const BLZ_TEAM_ORDER = ['nugs', 'frygods', 'tots', 'ranch', 'bosses', 'rings', 'mustard', 'curly'];
// [speed yd/s, strength, hands]
const BLZ_BASE = {
  QB: [7.0, 0.7, 0.5], C: [6.3, 1.15, 0.2], LG: [6.3, 1.15, 0.2], RG: [6.3, 1.15, 0.2],
  WR1: [8.8, 0.65, 0.85], WR2: [8.7, 0.65, 0.85], RB: [8.5, 1.0, 0.75],
  DE1: [7.6, 1.05, 0.4], DT: [6.8, 1.25, 0.3], DE2: [7.6, 1.05, 0.4],
  LB: [8.0, 1.0, 0.55], CB1: [8.7, 0.75, 0.6], CB2: [8.6, 0.75, 0.6], S: [8.4, 0.9, 0.6],
};
// pos → [name, number, speed?, strength?, hands?]
const BLZ_ROSTER = {
  nugs: {
    QB: ['BRETT FRYVRE', 4, 7.3], RB: ['BARRY SAUCEDERS', 20, 9.1, 1.15, 0.8],
    WR1: ['RANDY MOSS-TARD', 84, 9.3, null, 0.93], WR2: ['TIM BROWN-GRAVY', 81, 9.0, null, 0.88],
    C: ['BISCUIT', 60], LG: ['DRUMSTICK', 62], RG: ['WISHBONE', 63],
    DE1: ['REGGIE WHITE-MEAT', 92, null, 1.25], DT: ['THE WALK-IN', 99, null, 1.35], DE2: ['BRUCE SMITHFRY', 78, 8.0, 1.15],
    LB: ['THE SHREDDER', 55, 8.4, 1.15], CB1: ['PRIME TIME POPCORN', 21, 9.2, null, 0.72], CB2: ['NIGHT TRAIN', 24, 8.9],
    S: ['THE HIT MAN', 36, 8.7, 1.1, 0.65],
  },
  frygods: {
    QB: ['ZEUS', 1, 7.6, 0.8], RB: ['HERMES', 22, 9.3, 1.25, 0.82], WR1: ['APOLLO CRINKLE', 83, 9.5, null, 0.92], WR2: ['ARTEMIS', 87, 9.2, null, 0.9],
    C: ['ATLAS', 70], LG: ['THE COLOSSUS', 71], RG: ['TITAN', 72],
    DE1: ['ARES', 90, 8.1, 1.25], DT: ['HEPHAESTUS', 96, null, 1.45], DE2: ['POSEIDON', 91, 8.0, 1.2],
    LB: ['HADES', 50, 8.5, 1.2], CB1: ['ATHENA', 20, 9.4, null, 0.75], CB2: ['NIKE', 26, 9.1], S: ['THE KRAKEN', 33, 8.9, 1.1, 0.7],
  },
  tots: {
    QB: ['LIL TOT', 9], RB: ['HASH BROWNIE', 32], WR1: ['SMALL FRY', 80], WR2: ['TINY TIM', 86],
    C: ['THE BAG', 61], LG: ['FROZEN', 64], RG: ['FAMILY SIZE', 65],
    DE1: ['THE FREEZER', 91], DT: ['THE BIG TOT', 97], DE2: ['CRISPY', 94],
    LB: ['TOT-AL CHAOS', 52], CB1: ['NUGLET', 23], CB2: ['BITE SIZE', 27], S: ['THE SPATULA', 31],
  },
  ranch: {
    QB: ['HIDDEN VALLEY', 12, 7.2], RB: ['BUTTERMILK', 28, 8.9, 1.2, 0.78], WR1: ['THE DILL', 82, 9.2, null, 0.9], WR2: ['CHIVES', 85, 9.0, null, 0.88],
    C: ['THE TUB', 66], LG: ['COLD CUP', 67], RG: ['DIP STICK', 68],
    DE1: ['DOUBLE DIP', 95, 7.9, 1.2], DT: ['THE GALLON', 98, null, 1.35], DE2: ['DRESSING', 93, 7.9, 1.15],
    LB: ['COOL HAND', 54, 8.4, 1.15], CB1: ['WING DING', 25, 9.1, null, 0.72], CB2: ['CELERY', 29, 8.8], S: ['THE LADLE', 37, 8.7, 1.05, 0.65],
  },
  bosses: {
    QB: ['THE PITMASTER', 7, 7.4], RB: ['BRISKET', 28, 9.0, 1.15, 0.8], WR1: ['SMOKE RING', 82, 9.3, null, 0.91], WR2: ['DRY RUB', 88, 9.0, null, 0.88],
    C: ['THE SMOKER', 66], LG: ['HICKORY', 67], RG: ['MESQUITE', 68],
    DE1: ['BURNT ENDS', 95, 7.9, 1.2], DT: ['THE WHOLE HOG', 98, null, 1.38], DE2: ['RIB TIPS', 93, 7.9, 1.15],
    LB: ['PULLED PORK', 54, 8.4, 1.15], CB1: ['MOLASSES', 25, 9.1, null, 0.7], CB2: ['VINEGAR', 29, 8.9], S: ['THE MOP', 37, 8.7, 1.08, 0.65],
  },
  rings: {
    QB: ['VIDALIA', 3, 7.3], RB: ['THE BLOOMIN\'', 30, 9.2, 1.1, 0.78], WR1: ['SHALLOT', 80, 9.3, null, 0.9], WR2: ['SCALLION', 81, 9.1, null, 0.86],
    C: ['THE PEEL', 62], LG: ['LAYER CAKE', 63], RG: ['RED ONION', 64],
    DE1: ['THE TEARJERKER', 92, 7.9, 1.2], DT: ['BEER BATTER', 97, null, 1.35], DE2: ['SWEET ONION', 94, 7.8, 1.15],
    LB: ['THE CRYING GAME', 51, 8.4, 1.12], CB1: ['RINGLEADER', 22, 9.1, null, 0.72], CB2: ['HULA HOOP', 27, 8.9], S: ['O-RING', 38, 8.6, 1.08, 0.65],
  },
  mustard: {
    QB: ['DIJON', 10, 7.4], RB: ['THE STINGER', 34, 9.1, 1.15, 0.8], WR1: ['QUEEN BEE', 88, 9.2, null, 0.92], WR2: ['YELLOW JACKET', 83, 9.0, null, 0.88],
    C: ['THE HIVE', 65], LG: ['COMB', 66], RG: ['BEESWAX', 67],
    DE1: ['DRONE', 96, 7.9, 1.2], DT: ['THE SQUEEZE BOTTLE', 99, null, 1.38], DE2: ['WORKER BEE', 91, 7.9, 1.15],
    LB: ['THE POLLINATOR', 53, 8.4, 1.15], CB1: ['GRAINY', 24, 9.1, null, 0.72], CB2: ['SPICY BROWN', 21, 8.9], S: ['HONEYCOMB', 35, 8.7, 1.08, 0.65],
  },
  curly: {
    QB: ['THE CORKSCREW', 8, 7.4], RB: ['SPIRALIZER', 26, 9.3, 1.05, 0.8], WR1: ['LOOP DE LOOP', 89, 9.5, null, 0.9], WR2: ['THE SLINKY', 84, 9.2, null, 0.88],
    C: ['THE COIL', 60], LG: ['SPRING', 61], RG: ['HELIX', 62],
    DE1: ['TWISTER', 93, 8.0, 1.15], DT: ['THE PRETZEL', 95, null, 1.3], DE2: ['TORNADO', 90, 8.0, 1.1],
    LB: ['WHIRLPOOL', 56, 8.5, 1.1], CB1: ['ZIG ZAG', 20, 9.3, null, 0.72], CB2: ['SQUIGGLE', 23, 9.0], S: ['THE SPINNER', 39, 8.8, 1.05, 0.65],
  },
};

// ---- the playbooks ---------------------------------------------------------------------
// Routes are waypoints RELATIVE to a player's spot at the snap, in the
// OFFENSE's frame: [dx, dz] where +dx is the offense's RIGHT and +dz is
// downfield. After the last waypoint a receiver keeps running the way he was
// going. FLIP mirrors dx. The cards draw their diagrams from this same data.
const BLZ_FORM = { QB: [0, -1.35], C: [0, -0.7], LG: [-1.8, -0.9], RG: [1.8, -0.9], WR1: [-15, -0.6], WR2: [15, -0.6], RB: [0, -5.4] };
const BLZ_OFF_PLAYS = [
  { key: 'slants', name: 'SLANTS', kind: 'pass', primary: 'WR2',
    routes: { WR1: [[0, 3], [9, 10]], WR2: [[0, 3], [-9, 10]], RB: [[-4, 1.5], [-10, 4]] } },
  { key: 'bomb', name: 'DA BOMB', kind: 'pass', primary: 'WR1',
    routes: { WR1: [[0, 6], [3, 42]], WR2: [[0, 12], [-3, 42]] } },
  { key: 'outs', name: 'QUICK OUTS', kind: 'pass', primary: 'WR2',
    routes: { WR1: [[0, 6], [-7, 6.5]], WR2: [[0, 6], [7, 6.5]], RB: [[0, 1], [0, 13]] } },
  { key: 'spider', name: 'SPIDER LEGS', kind: 'pass', primary: 'WR1',
    routes: { WR1: [[0, 14], [1.5, 11]], WR2: [[0, 14], [-1.5, 11]], RB: [[5, 0], [11, 3]] } },
  { key: 'pick', name: 'MIDDLE PICK', kind: 'pass', primary: 'WR1',
    routes: { WR1: [[0, 5], [28, 9]], WR2: [[0, 9], [-28, 13]], RB: [[0, 1], [0, 18]] } },
  { key: 'hail', name: 'HAIL MARY', kind: 'pass', primary: 'RB', form: { RB: [7, -1] },
    routes: { WR1: [[0, 50]], WR2: [[0, 50]], RB: [[0, 2], [-2, 48]] } },
  { key: 'blast', name: 'HB BLAST', kind: 'run',
    rb: [[0.5, 3], [0.5, 25]], routes: { WR1: [[0, 8]], WR2: [[0, 8]] } },
  { key: 'sweep', name: 'POWER SWEEP', kind: 'run',
    rb: [[6, -1], [12, 3], [14, 25]], routes: { WR1: [[0, 5], [3, 9]], WR2: [[0, 6]] } },
  { key: 'hook', name: 'HOOK N LADDER', kind: 'pass', primary: 'WR1',
    routes: { WR1: [[0, 11], [0.5, 9]], WR2: [[0, 30]], RB: [[-7, 0], [-10, 9]] } },
];
// the special-teams fakes (the cart's 4th-down page). The defense lines up for
// the kick it thinks is coming — a returner 40 deep, everybody else rushing.
const BLZ_FAKE_PUNT = { key: 'fakepunt', name: 'FAKE PUNT', kind: 'pass', primary: 'WR1', fake: 'punt',
  form: { QB: [0, -13], RB: [0, -6], WR1: [-19, -0.6], WR2: [19, -0.6] },
  routes: { WR1: [[0, 14], [2, 40]], WR2: [[0, 8], [-10, 16]], RB: [[5, 1], [10, 9]] } };
const BLZ_FAKE_FG = { key: 'fakefg', name: 'FAKE FIELD GOAL', kind: 'pass', primary: 'RB', fake: 'fg',
  form: { QB: [0, -7], RB: [-2, -9.5], WR1: [-4.5, -0.8], WR2: [4.5, -0.8] },
  routes: { WR1: [[0, 4], [-8, 10]], WR2: [[0, 4], [8, 10]], RB: [[6, 2], [12, 8]] } };
// defense roles in BLZ_DEF_POS order: 'rush' | 'man:WR1' | ['zone', dx, dz] | ['deep', dx, dz] | 'spy'
const BLZ_DEF_PUNT_RET = { key: 'pret', name: 'PUNT RETURN', roles: ['rush', 'rush', 'rush', 'rush', ['deep', 0, 40], 'man:WR2', ['zone', 0, 16]] };
const BLZ_DEF_FG_BLOCK = { key: 'fgblock', name: 'FG BLOCK', roles: ['rush', 'rush', 'rush', 'rush', 'man:WR1', 'man:WR2', 'rush'] };
const BLZ_DEF_PLAYS = [
  { key: 'safe', name: 'SAFE COVER', roles: ['rush', 'rush', 'rush', ['zone', 0, 9], 'man:WR1', 'man:WR2', ['deep', 0, 22]] },
  { key: 'b1', name: '1 MAN BLITZ', roles: ['rush', 'rush', 'rush', 'rush', 'man:WR1', 'man:WR2', 'man:RB'] },
  { key: 'b2', name: '2 MAN BLITZ', roles: ['rush', 'rush', 'rush', 'rush', 'man:WR1', 'man:WR2', 'rush'] },
  { key: 'suicide', name: 'SUICIDE BLITZ', roles: ['rush', 'rush', 'rush', 'rush', 'rush', 'man:WR2', 'rush'] },
  { key: 'zblitz', name: 'ZONE BLITZ', roles: [['zone', -9, 6], 'rush', 'rush', 'rush', ['zone', -14, 12], ['zone', 14, 12], ['deep', 0, 20]] },
  { key: 'near', name: 'NEAR ZONE', roles: ['rush', 'rush', 'rush', ['zone', 0, 5], ['zone', -12, 6], ['zone', 12, 6], ['zone', 0, 11]] },
  { key: 'med', name: 'MEDIUM ZONE', roles: ['rush', 'rush', 'rush', ['zone', 0, 10], ['zone', -13, 13], ['zone', 13, 13], ['deep', 0, 20]] },
  { key: 'deep', name: 'DEEP ZONE', roles: ['rush', 'rush', 'rush', ['zone', 0, 14], ['deep', -14, 24], ['deep', 14, 24], ['deep', 0, 30]] },
  { key: 'goal', name: 'GOAL LINE', roles: ['rush', 'rush', 'rush', 'spy', 'man:WR1', 'man:WR2', ['zone', 0, 3]] },
];

// the ladder (ArcadeKit.tierSelect)
const BLZ_TIERS = [
  { key: 'rookie', emoji: '🍟', name: 'ROOKIE', mult: 1, opp: 'tots', alt: 'curly', spd: 0.97, str: 0.95, smart: 0.6, hands: 0.95,
    blurb: 'vs the TATER TOTS. they\'re very small.' },
  { key: 'pro', emoji: '🌶️', name: 'PRO', mult: 2, opp: 'bosses', alt: 'rings', spd: 1.0, str: 1.0, smart: 0.85, hands: 1.0,
    blurb: 'vs the SAUCE BOSSES. slow smoked, fast hitting.' },
  { key: 'allpro', emoji: '🔥', name: 'ALL-BLITZ', mult: 3, opp: 'frygods', alt: 'mustard', spd: 1.005, str: 1.03, smart: 1, hands: 1.05,
    blurb: 'vs the FRY GODS on MOUNT FRYMPUS. no refs. no mortals.', lockNote: 'win a PRO game' },
];

// the VS-screen codes: [turbo, jump, pass] taps, then a direction
const BLZ_CODES = [
  { k: '200R', id: 'big', name: 'BIG HEAD' },
  { k: '040U', id: 'huge', name: 'HUGE HEAD' },
  { k: '514U', id: 'inf', name: 'INFINITE TURBO' },
  { k: '151U', id: 'nopunt', name: 'NO PUNTING' },
  { k: '222R', id: 'night', name: 'NIGHT GAME' },
  { k: '404L', id: 'speed', name: 'POWER-UP SPEED' },
  { k: '250L', id: 'fastpass', name: 'FAST PASSES' },
  { k: '001D', id: 'fgpct', name: 'SHOW FIELD GOAL %' },
  { k: '050R', id: 'bigball', name: 'BIG FOOTBALL' },
  { k: '012D', id: 'noassist', name: 'NO CPU ASSISTANCE' },
  { k: '333L', id: 'fire', name: 'START ON FIRE' },
];

const blitz = {
  on: false, cv: null, g: null, W: 640, H: BLZ_RES, F: 420, cy: 180, ui: 1,
  phase: 'idle', cfg: BLZ_TIERS[0], tierPick: null, t: 0, paused: false, freeze: false, auto: false,
  teams: ['nugs', 'tots'], teamSel: 0, score: [0, 0], q: 1, clock: BLZ_QLEN, ot: false, openKicker: 0,
  poss: 0, los: 30, ballX: BLZ_MID, firstAt: 60, down: 1, pat2: false,
  players: [], carrier: null, ctl: null, target: null, ball: null, returner: null,
  play: null, dplay: null, flip: false, kind: 'call', pocket: false, thrown: false, playT: 0,
  snapAt: 0, startZ: 0, ezCatch: false, handed: false, kickT: 0, fg: null, punt: null,
  callFor: 'off', callSel: 4, callT: 0, cpuOff: null, cpuDef: null, cpuFlip: false,
  deadT: 0, dead: null, waitT: 0, waitFn: null, banner: null, feed: [], say: '',
  cam: { x: BLZ_MID, z: 14, dir: 1, yaw: 0, h: BLZ_CAM.h, pitch: BLZ_CAM.pitch, back: BLZ_CAM.back,
    s: Math.sin(BLZ_CAM.pitch), c: Math.cos(BLZ_CAM.pitch), cyw: 1, syw: 0 },
  camFlipT: 0, camFlipDone: false, shakeT: 0, shakeMag: 0, hitStop: 0, flashT: 0,
  turbo: [1, 1], fire: [{ on: false, n: 0, last: null, stops: 0 }, { on: false, n: 0, last: null, stops: 0 }],
  codes: {}, codeIn: [0, 0, 0], codeMsg: null, vsT: 0,
  stats: null, earned: 0, result: null, finalT: 0,
  parts: [], keys: {}, voice: true,
  touch: { on: false, L: null, A: false, B: false, T: false, roles: {} }, pad: { on: false },
  sfx: { ctx: null, master: null, crowd: null, crowdGain: null, muted: false, noise: null },
  hit: { cards: [], extra: [], rcv: [] }, crowdCv: null, anims: [], saidShow: false,
  hype: [0, 0], heatSaid: [false, false], bubbles: [], cad: null, tauntNext: 0, tauntsDown: [0, 0], tauntCd: 0, halftime: false, inputMode: '', charge: null, rcv: null,
};

function blitzActive() { return storm.mode === 'blitz' && storm.running; }
function blitzProWon() {
  try { return localStorage.getItem('nugBlitzPro') === '1' || blitzChampWon(); } catch (e) { return false; }
}
function blitzChampWon() {
  try { return localStorage.getItem('nugBlitzChamp') === '1'; } catch (e) { return false; }
}
function blitzTally() {
  if (blitz.phase === 'tier' || !blitz.stats) return '💥 pick your opponent…';
  const A = BLZ_TEAMS[blitz.teams[0]], B = BLZ_TEAMS[blitz.teams[1]];
  return '💥 ' + A.abbr + ' ' + blitz.score[0] + ' – ' + blitz.score[1] + ' ' + B.abbr +
    ' · ' + (blitz.ot ? 'OT' : 'Q' + blitz.q) + ' · ' + fmt.format(blitz.earned);
}

// ---- helpers --------------------------------------------------------------------------------
function blzDir(team) { return team === 0 ? 1 : -1; }      // team 0 (you) attacks +z
function blzGoal(team) { return team === 0 ? 110 : 10; }    // the goal line a team attacks
function blzOwnGoal(team) { return team === 0 ? 10 : 110; }
function blzClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function blzRnd(a, b) { return a + Math.random() * (b - a); }
function blzPick(a) { return a[(Math.random() * a.length) | 0]; }
function blzTeam(i) { return BLZ_TEAMS[blitz.teams[i]]; }
function blzHuman(team) { return team === 0 && !blitz.auto; }
function blzDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function blzOnFire(team) { return blitz.fire[team].on; }
// yards from the team's own goal ("OWN 25" / "OPP 40")
function blzYardTxt(z, team) {
  const own = Math.round((z - blzOwnGoal(team)) * blzDir(team));
  if (own >= 100) return 'GOAL';
  return own <= 50 ? 'OWN ' + own : 'OPP ' + (100 - own);
}
function blzOrd(n) { return ['', '1ST', '2ND', '3RD', '4TH'][n] || n + 'TH'; }
function blzPlayersOf(team) { return blitz.players.filter((p) => p.team === team); }
function blzByPos(team, pos) { return blitz.players.find((p) => p.team === team && p.pos === pos); }

// ---- layout & lifecycle ---------------------------------------------------------------------
function blitzLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  blitz.H = BLZ_RES;
  blitz.W = Math.max(240, Math.min(1000, Math.round(vw * BLZ_RES / vh)));
  blitz.ov = 2;   // the overlay draws at 2× its logical size: crisp HUD text over the smeared world
  if (blitz.cv) { blitz.cv.width = blitz.W * blitz.ov; blitz.cv.height = blitz.H * blitz.ov; }
  // a portrait phone keeps the wideouts in frame by shortening the lens
  blitz.F = Math.min(blitz.H * 0.9, blitz.W * 0.82);
  blitz.cy = blitz.H * 0.38;
  blitz.ui = blzClamp(blitz.W / 400, 0.5, 1);
  blitz.crowdCv = null;
}

function syncBlitz() {
  const active = blitzActive();
  if (active === blitz.on) return;
  blitz.on = active;
  document.body.classList.toggle('blitz-mode', active);
  if (active) {
    if (!blitz.cv) {
      blitz.cv = document.createElement('canvas');
      blitz.g = blitz.cv.getContext('2d');
      blitzWorld.appendChild(blitz.cv);
      blitz.cv.addEventListener('pointerdown', blzPointerDown);
      blzGLInit();
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    blitz.t = 0; blitz.earned = 0; blitz.paused = false; blitz.keys = {};
    blitzLayout();
    blzDiscManifest();     // start downloading the soundtrack now, before the first click makes a sound
    blzOpenTier();
  } else {
    if (blitz.tierPick) { blitz.tierPick.close(); blitz.tierPick = null; }
    blitz.phase = 'idle';
    blzCrowdStop();
    blzBoothHush();
    if (blzMus.ok && blitz.sfx.ctx) { blzMusMix('off'); blzMus.T = null; blzMus.key = ''; blzMus.pend = null; blzChant(false); blzDiscStop(); }
  }
}

function blzOpenTier() {
  blitz.phase = 'tier';
  blitz.stats = null;
  const tiers = BLZ_TIERS.map((t) => t.key === 'allpro' && !blitzProWon() ? Object.assign({}, t, { locked: true }) : t);
  blitz.tierPick = ArcadeKit.tierSelect({
    storeKey: 'blitz',
    title: '💥 NUGGET BLITZ — pick your opponent',
    note: '7 on 7 · 30 yards for a first · no refs · press 1 · 2 · 3',
    tiers, mount: blitzWorld,
    onPick: (key, t) => { blitz.tierPick = null; blzNewGame(t); },
  });
}

// ---- audio: a little synth, a crowd, and the announcer --------------------------------------
function blzAudio() {
  const S = blitz.sfx;
  if (S.ctx) { if (S.ctx.state === 'suspended') S.ctx.resume(); return; }
  try {
    S.ctx = new (window.AudioContext || window.webkitAudioContext)();
    S.master = S.ctx.createGain(); S.master.gain.value = S.muted ? 0 : 0.34;
    S.master.connect(S.ctx.destination);
    const n = S.ctx.sampleRate * 2, buf = S.ctx.createBuffer(1, n, S.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    S.noise = buf;
  } catch (e) { S.ctx = null; }
}
function blzCrowdStart() {
  const S = blitz.sfx;
  if (!S.ctx || S.crowd) return;
  const src = S.ctx.createBufferSource(); src.buffer = S.noise; src.loop = true;
  const bp = S.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.5;
  const g = S.ctx.createGain(); g.gain.value = 0.06;
  const ng = S.ctx.createGain(); ng.gain.value = 1;     // the noise's own level: it bows out when the recorded stands load
  src.connect(bp); bp.connect(ng); ng.connect(g); g.connect(S.master);
  src.start();
  S.crowd = src; S.crowdGain = g; S.crowdNoise = ng; S.bedSrc = null;
}
function blzCrowdStop() {
  const S = blitz.sfx;
  if (S.crowd) { try { S.crowd.stop(); } catch (e) { } S.crowd = null; S.crowdGain = null; }
  if (S.bedSrc) { try { S.bedSrc.stop(); } catch (e) { } S.bedSrc = null; }
}
function blzRoar(level, secs) {
  const S = blitz.sfx;
  if (!S.crowdGain) return;
  const t = S.ctx.currentTime, g = S.crowdGain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0.06 + level * 0.32, t + 0.12);
  g.linearRampToValueAtTime(0.06, t + 0.12 + (secs || 1.5));
}
const BLZ_SX = { crunch: 1.2, hit: 0.9, whistle: 0.5 };   // recorded hit/whistle levels against the synth ones
function blzSfx(kind) {
  const S = blitz.sfx, ctx = S.ctx;
  if (!ctx || S.muted) return;
  const t = ctx.currentTime;
  const tone = (type, f0, f1, dur, vol, at) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), t0 = t + (at || 0);
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(S.master); o.start(t0); o.stop(t0 + dur + 0.02);
  };
  const noise = (freq, q, dur, vol, at, type) => {
    const src = ctx.createBufferSource(); src.buffer = S.noise;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(), t0 = t + (at || 0);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(S.master); src.start(t0, Math.random()); src.stop(t0 + dur + 0.02);
  };
  // the recorded ones (js/blitzAudio.js THE RECORDS), when they've loaded
  if ((kind === 'crunch' || kind === 'hit') && blzDiscShot('sx-hit', S.master, { gain: kind === 'crunch' ? BLZ_SX.crunch : BLZ_SX.hit, vary: 0.08 })) return;
  if (kind === 'whistle' && blzDiscShot('sx-whistle', S.master, { gain: BLZ_SX.whistle })) return;
  if (kind === 'whistle') { tone('sine', 2900, 0, 0.36, 0.12); tone('sine', 3200, 0, 0.36, 0.08); }
  else if (kind === 'hut') { noise(800, 1.2, 0.08, 0.5); noise(800, 1.2, 0.08, 0.5, 0.2); }
  else if (kind === 'hit') { noise(240, 0.8, 0.22, 0.9, 0, 'lowpass'); tone('sine', 120, 45, 0.2, 0.55); }
  else if (kind === 'crunch') {
    noise(180, 0.7, 0.35, 1.0, 0, 'lowpass'); noise(1800, 0.9, 0.12, 0.5); tone('square', 90, 35, 0.3, 0.3);
  }
  else if (kind === 'catch') tone('square', 880, 1320, 0.06, 0.12);
  else if (kind === 'throw') noise(2600, 2, 0.14, 0.2);
  else if (kind === 'kick') { tone('sine', 150, 55, 0.18, 0.6); noise(500, 1, 0.08, 0.4); }
  else if (kind === 'select') tone('square', 660, 0, 0.05, 0.08);
  else if (kind === 'pick') { tone('square', 523, 0, 0.06, 0.1); tone('square', 784, 0, 0.08, 0.1, 0.06); }
  else if (kind === 'code') { [660, 880, 1320].forEach((f, i) => tone('square', f, 0, 0.08, 0.1, i * 0.07)); }
  else if (kind === 'turbo') noise(3200, 1.5, 0.05, 0.05);
  else if (kind === 'fire') { noise(400, 0.5, 0.9, 0.6, 0, 'lowpass'); tone('sawtooth', 110, 440, 0.8, 0.12); }
  else if (kind === 'td') {
    [392, 523, 659, 784, 659, 784].forEach((f, i) => tone('sawtooth', f, 0, i === 5 ? 0.5 : 0.12, 0.08, i * 0.12));
  } else if (kind === 'good') { tone('square', 784, 0, 0.1, 0.1); tone('square', 1175, 0, 0.3, 0.1, 0.1); }
  else if (kind === 'bad') { tone('square', 330, 0, 0.14, 0.1); tone('square', 220, 0, 0.35, 0.1, 0.14); }
  else if (kind === 'horn') { tone('sawtooth', 196, 0, 1.0, 0.14); tone('sawtooth', 247, 0, 1.0, 0.1); }
}
// the announcer: one booth, two seats (js/blitzAudio.js queues every voice)
function blzSay(text, prio) { blzSpeak(text, { who: 'pbp', prio: prio ? 2 : 1 }); }
// the colour man chimes in (not every time — a booth that never shuts up is noise)
function blzColor(pool, chance) {
  if (Math.random() < (chance == null ? 0.5 : chance)) blzSpeak(blzPick(pool), { who: 'color', prio: 0, maxAge: 3.2 });
}
function blzPBP(pool, prio, maxAge) { blzSpeak(blzPick(pool), { who: 'pbp', prio: prio || 1, maxAge: maxAge || 2.2 }); }
const BLZ_CALLS = {
  td: ['TOUCHDOWN!', 'HE TAKES IT ALL THE WAY!', 'SIX POINTS!'],
  sack: ['SACKED!', 'THE QUARTERBACK GOES DOWN!', 'HE GOT CRUNCHED!'],
  hit: ['MONSTER HIT!', 'OH! DID YOU SEE THAT?', 'HE GOT BREADED!', 'HE WILL FEEL THAT ONE TOMORROW!'],
  late: ['LATE HIT!', 'AFTER THE WHISTLE!', 'NO MERCY!'],
  int: ['INTERCEPTED!', 'PICKED OFF!'],
  fumble: ['FUMBLE!', 'HE COUGHS IT UP!'],
  first: ['FIRST DOWN!', 'MOVE THE CHAINS!'],
  fire: ["HE'S ON FIRE!"],
  dfire: ['THE DEFENSE IS ON FIRE!'],
  good: ["IT'S GOOD!"], nogood: ['NO GOOD!'],
  spin: ['WHAT A MOVE!', 'SPIN CYCLE!'],
  stiff: ['STIFF ARM!', 'GET OFF ME!'],
  hurdle: ['HE JUMPS OVER HIM!'],
  bomb: ['DA BOMB!', 'WAY DOWNFIELD!'],
  pressure: ['THROW THE BALL!', 'GET RID OF IT!'],
  heat: ["HE'S HEATING UP!", 'HE IS HEATING UP!', 'GETTING WARM!'],
  dheat: ['THIS DEFENSE IS HEATING UP!', 'THE DEFENSE IS GETTING WARM!'],
};
// the colour man's lines (the second voice in the booth)
const BLZ_COLOR = {
  hit: ['THAT IS GONNA LEAVE A CRUMB!', 'SOMEBODY CHECK ON HIM!', 'HE FELT THAT ONE IN THE BATTER!', 'HE GOT DEEP FRIED!', 'I FELT THAT ONE UP HERE!', 'OH, HIS MOTHER FELT THAT!'],
  late: ['NO FLAGS IN THIS LEAGUE!', 'THE WHISTLE IS JUST A SUGGESTION!', 'THAT ONE WAS PERSONAL!', 'NO MERCY, BABY!'],
  td: ['EXTRA CRISPY!', 'GOLDEN BROWN AND DELICIOUS!', 'ORDER UP!', 'SERVE IT UP!', 'THAT IS A TEN PIECE!'],
  sack: ['HE NEVER SAW IT COMING!', 'THAT QUARTERBACK IS TOAST!', 'WELCOME TO THE N F N!', 'RIGHT IN THE BREADING!'],
  int: ['HE THREW IT RIGHT TO HIM!', 'WHAT WAS HE THINKING?', 'THAT ONE IS GOING ON THE BLOOPER REEL!'],
  drop: ['BUTTERFINGERS!', 'HE HAD IT AND HE DROPPED IT!', 'HANDS OF STONE!', 'TOO GREASY!'],
  grab: ['WHAT A GRAB!', 'HE SNAGGED IT!', 'WHAT HANDS!', 'STICKY FINGERS!'],
  dive: ['HE LAID OUT FOR IT!', 'WHAT A DIVE!', 'FULL EXTENSION!'],
  taunt: ['OH, HE IS TALKING NOW!', 'A LITTLE TRASH TALK AT THE LINE!', 'SOMEBODY IS CONFIDENT!', 'THESE TWO DO NOT LIKE EACH OTHER!', 'OH, THEY ARE JAWING!'],
  showboat: ['LOOK AT HIM SHOWBOAT!', 'HE IS TAUNTING THEM!', 'SOMEBODY STOP THIS MAN!', 'OH, THE DISRESPECT!'],
  stuff: ['STUFFED!', 'NOWHERE TO GO!', 'HE RAN INTO A WALL!', 'NOTHING THERE!'],
  big: ['HE IS LOOSE!', 'LOOK AT HIM GO!', 'BREAKAWAY!', 'SEE YOU LATER!'],
  fire: ['SOMEBODY GET A FIRE EXTINGUISHER!', 'TOO HOT TO HANDLE!', 'THE FRYER IS ON!'],
  oops: ['OOF.', 'THAT IS GONNA MAKE THE BLOOPER REEL.', 'YIKES.'],
};
// the play-by-play's situational calls
const BLZ_PBP = {
  third: ['THIRD DOWN!', 'BIG THIRD DOWN HERE!', 'THIRD DOWN. THIS IS IT.'],
  thirdLong: ['THIRD AND LONG!', 'THIRD AND A MILE!', 'THIRD AND FOREVER!'],
  fourth: ['FOURTH DOWN! THEY ARE GOING FOR IT!', 'FOURTH DOWN. NO PUNTING!', 'GUTS TIME. FOURTH DOWN.'],
  red: ['RED ZONE!', 'KNOCKING ON THE DOOR!', 'THEY CAN SMELL IT!'],
  goal: ['GOAL TO GO!', 'FIRST AND GOAL!'],
  late: ['UNDER A MINUTE TO GO!', 'THE CLOCK IS TICKING!', 'CRUNCH TIME!'],
  incomplete: ['INCOMPLETE!', 'FALLS INCOMPLETE!', 'NO CATCH!'],
  kick: ['HERE IS THE KICK!', 'AND WE ARE UNDERWAY!', 'THE BOOT IS AWAY!'],
  ret: ['A NICE RETURN!', 'HE BRINGS IT BACK!', 'GOOD FIELD POSITION!'],
  pick6: ['PICK SIX!', 'HE IS GONE THE OTHER WAY!'],
};

// ---- the game: setup ------------------------------------------------------------------------
function blzMake(team, pos) {
  const tk = blitz.teams[team];
  const base = BLZ_BASE[pos];
  const r = (BLZ_ROSTER[tk] && BLZ_ROSTER[tk][pos]) || [pos, 0];
  const cpu = team === 1;
  const spd = (r[2] != null ? r[2] : base[0]) * (cpu ? blitz.cfg.spd : 1);
  const str = (r[3] != null ? r[3] : base[1]) * (cpu ? blitz.cfg.str : 1);
  return {
    team, pos, name: r[0], num: r[1] || 0, spd, str, hands: (r[4] != null ? r[4] : base[2]) * (cpu ? blitz.cfg.hands || 1 : 1),
    x: 0, z: 0, y: 0, vx: 0, vz: 0, fx: 0, fz: blzDir(team), wx: 0, wz: 0, wt: false, anim: Math.random() * 6,
    downT: 0, diveT: 0, jumpT: 0, spinT: 0, spinCd: 0, stiffT: 0, stunT: 0, tryCd: 0, celebT: 0, throwT: 0,
    eng: null, shedT: 0, noEngT: 0, role: '', man: null, zx: 0, zz: 0, route: null, ri: 0, ox: 0, oz: 0,
    turbo: 1, turboOn: false, lateCd: 0, block: false, react: 0,
    air: false, vy: 0, flipA: 0, flipV: 0, lieBack: false, catchT: 0, dropOn: null,
  };
}

// TEAM SELECT first (unless it's a rematch), then the VS screen.
function blzMyTeam() {
  try { const k = localStorage.getItem('nugBlitzTeam'); if (BLZ_TEAMS[k]) return k; } catch (e) { }
  return 'nugs';
}
function blzNewGame(tier, rematch) {
  blitz.cfg = tier;
  blitz.players = []; blitz.stats = null;
  blzAudio(); blzCrowdStart();
  if (rematch) { blzBeginMatchup(blitz.teams[0]); return; }
  blitz.phase = 'teams'; blitz.vsT = 0;
  blitz.teamSel = Math.max(0, BLZ_TEAM_ORDER.indexOf(blzMyTeam()));
}
function blzTeamMove(d) {
  if (blitz.phase !== 'teams') return;
  const n = BLZ_TEAM_ORDER.length;
  blitz.teamSel = (blitz.teamSel + d + n) % n;
  blzSfx('select');
}
function blzTeamPick(i) {
  if (blitz.phase !== 'teams') return;
  if (i != null) blitz.teamSel = i;
  const k = BLZ_TEAM_ORDER[blitz.teamSel];
  try { localStorage.setItem('nugBlitzTeam', k); } catch (e) { }
  blzSfx('pick');
  blzSay(BLZ_TEAMS[k].full + '!');
  blzBeginMatchup(k);
}
function blzBeginMatchup(mine) {
  const tier = blitz.cfg;
  blitz.teams = [mine, tier.opp === mine ? tier.alt : tier.opp];
  blitz.score = [0, 0]; blitz.q = 1; blitz.clock = BLZ_QLEN; blitz.ot = false;
  blitz.stats = { yds: 0, tds: 0, sacks: 0, ints: 0, hits: 0, late: 0, fires: 0, plays: 0, long: 0, log: [], ev: {} };
  blitz.earned = 0; blitz.feed = []; blitz.parts = []; blitz.result = null;
  blitz.paused = false; blitz.banner = null; blitz.dead = null; blitz.carrier = null; blitz.ball = null;
  blitz.fire = [{ on: false, n: 0, last: null, stops: 0 }, { on: false, n: 0, last: null, stops: 0 }];
  blitz.turbo = [1, 1];
  blitz.hype = [0, 0]; blitz.heatSaid = [false, false]; blitz.bubbles = []; blitz.halftime = false;
  blitz.codes = {}; blitz.codeIn = [0, 0, 0]; blitz.codeMsg = null;
  blitz.players = [];
  blitz.phase = 'vs'; blitz.vsT = 0;
}

// leave the VS screen: codes are locked in, the coin is flipped
function blzStartGame() {
  if (blitz.phase !== 'vs') return;
  if (blitz.codes.fire) { blitz.fire[0].on = true; blitz.fire[0].n = 3; blitz.hype[0] = 1; }
  blitz.openKicker = Math.random() < 0.5 ? 0 : 1;
  blzSfx('horn'); blzRoar(0.7, 2);
  blzBuildExtras();
  blzVoPrefetch(blitz.teams);
  blitz.rec = []; blitz.playsSinceReplay = 3; blitz.fw = []; blitz.bulbs = []; blitz.wave = null; blitz.waveQ = 0;
  const recv = 1 - blitz.openKicker;
  blzBanner(blzTeam(recv).name + ' RECEIVE', '#ffd23a', blzTeam(0).city + ' vs ' + blzTeam(1).city, 1.6);
  blzSetupKickoff(blitz.openKicker, false);
}

// a tally of everything, both teams, for the headless harness (stats.ev)
function blzEv(k) { if (blitz.stats) blitz.stats.ev[k] = (blitz.stats.ev[k] || 0) + 1; }
function blzFeed(text, color) {
  blitz.feed.push({ text, color: color || '#fff6d8', t: 2.6 });
  if (blitz.feed.length > 3) blitz.feed.shift();
}
function blzBanner(text, color, sub, T) { blitz.banner = { text, color: color || '#ffd23a', sub: sub || '', t: 0, T: T || 1.4 }; }
function blzAfter(secs, fn) { blitz.phase = 'wait'; blitz.waitT = secs; blitz.waitFn = fn; }

// Bank arcade nuggets for a football event (perFlyer × the tier's mult).
function blzEarn(units, why) {
  if (units <= 0 || !blitz.cfg) return 0;
  const worth = Math.max(1, Math.round(storm.perFlyer * units * blitz.cfg.mult));
  storm.caught += worth;
  blitz.earned += worth;
  if (why) blzFeed('+' + fmt.format(worth) + ' ' + why, '#ffd23a');
  return worth;
}

function blzClearPlay() {
  blitz.carrier = null; blitz.target = null; blitz.returner = null; blitz.thrown = false; blitz.pocket = false;
  blitz.handed = false; blitz.ezCatch = false; blitz.fg = null; blitz.punt = null; blitz.dead = null;
  blitz.playT = 0; blitz.kickT = 0; blitz.camFlipT = 0;
  blitz.anims = []; blitz.saidShow = false; blitz.bubbles = []; blitz.cad = null; blitz.countdown = 0; blitz.showHype = 0;
  blitz.rec = []; blitz.replayWant = null; blitz.celebDone = true;
}

// ---- kickoffs ---------------------------------------------------------------------------------
function blzSetupKickoff(k, free) {
  const r = 1 - k, dk = blzDir(k);
  blzClearPlay();
  blitz.poss = r; blitz.kind = 'kick'; blitz.pat2 = false;
  blitz.players = [];
  const kickZ = blzOwnGoal(k) + dk * (free ? 20 : 30);
  // the kicking team: the defense eleven… seven. Spread across the field.
  BLZ_DEF_POS.forEach((pos, i) => {
    const p = blzMake(k, pos);
    p.x = 5 + i * 7.2; p.z = kickZ - dk * 1;
    p.role = 'cover'; p.zx = p.x;
    if (pos === 'S') { p.role = 'kicker'; p.x = BLZ_MID; p.z = kickZ - dk * 6; }
    blitz.players.push(p);
  });
  // re-lane the six coverers without the kicker's gap
  blzPlayersOf(k).filter((p) => p.role === 'cover').forEach((p, i) => { p.x = 5 + i * 8.6; p.zx = p.x; });
  const rz = blzOwnGoal(r) + blzDir(r) * 5;
  BLZ_OFF_POS.forEach((pos, i) => {
    const p = blzMake(r, pos);
    p.role = 'wall';
    if (pos === 'RB') { p.role = 'returner'; p.x = BLZ_MID; p.z = rz; blitz.returner = p; }
    else if (pos === 'WR1') { p.x = BLZ_MID - 6; p.z = rz + blzDir(r) * 9; }
    else { p.x = 8 + i * 7.4; p.z = kickZ + dk * 14; }
    p.fx = 0; p.fz = blzDir(r);
    blitz.players.push(p);
  });
  blitz.ball = { st: 'tee', x: BLZ_MID, z: kickZ, y: 0.2, kind: 'kick' };
  blitz.los = kickZ;
  blzCamSnap(dk, BLZ_MID, kickZ + dk * 8, true);
  blitz.ctl = blzHuman(r) ? blitz.returner : blzHuman(k) ? blzByPos(k, 'LB') : null;
  blitz.phase = 'live';
  blitz.kickT = 0;
  // the human kicker waits for the button: PASS kicks deep, TURBO+PASS goes onside.
  // The CPU goes onside when it's late and it's behind.
  blitz.kickWait = blzHuman(k) && !free;
  blitz.halftime = false;
  blzSting('roll');
  blitz.onside = !blzHuman(k) && !free && blitz.q >= 4 && !blitz.ot && blitz.clock < 40 &&
    blitz.score[k] < blitz.score[r] && blitz.score[r] - blitz.score[k] <= 16;
}

function blzKickTheBall() {
  const B = blitz.ball, k = 1 - blitz.poss, r = blitz.poss;
  if (blitz.onside) {
    // a squib off the turf: ten-odd yards, bouncing, anybody's ball (the kickers after 10)
    const dk = blzDir(k);
    B.st = 'loose'; B.kind = 'onside'; B.looseT = 0; B.oz = B.z;
    B.x = BLZ_MID + blzRnd(-3, 3); B.y = 0.3;
    B.vx = blzRnd(-3, 3); B.vz = dk * blzRnd(10.5, 12.5); B.vy = 4.2;
    B.lastTeam = r;
    blzSfx('kick'); blzRoar(0.9, 2);
    blzBanner('ONSIDE KICK!', '#ff8a3a', '', 1.2);
    blzSay('onside kick!', true);
    for (const p of blitz.players) p.react = blzRnd(0, 0.12);
    if (blzHuman(k)) blitz.ctl = blzNearestTo(k, B, (p) => p.role !== 'kicker');
    if (blzHuman(r)) blitz.ctl = blzNearestTo(r, { x: B.x, z: B.z + dk * 12 });
    return;
  }
  const land = blzOwnGoal(r) + blzDir(r) * blzRnd(-4, 9);
  B.st = 'air'; B.kind = 'kick';
  B.x0 = B.x; B.z0 = B.z; B.y0 = 0.3;
  B.tx = blzClamp(BLZ_MID + blzRnd(-9, 9), 6, BLZ_WID - 6); B.tz = land; B.ty = 1.6;
  B.t = 0; B.T = 3.0; B.peak = 19;
  blzSfx('kick');
  // the kicking team's human takes the coverer nearest the landing spot
  if (blzHuman(k)) blitz.ctl = blzNearestTo(k, { x: B.tx, z: B.tz }, (p) => p.role !== 'kicker');
}

// ---- play calling --------------------------------------------------------------------------
function blzFGDist() { return Math.round(Math.abs(blzGoal(blitz.poss) - blitz.los) + 17); }
function blzFGOdds(dist) { return blzClamp(1.04 - Math.max(0, dist - 20) * 0.016, 0.12, 0.98); }

function blzToCall() {
  blzClearPlay();
  blitz.kind = 'call';
  const off = blitz.poss;
  // line both teams up first so the call screen has a field behind it
  blzLineUp(BLZ_OFF_PLAYS[0], BLZ_DEF_PLAYS[0], false);
  blitz.cpuFlip = Math.random() < 0.5;
  if (blzHuman(off)) {
    blitz.callFor = 'off';
    blitz.cpuDef = blzCpuDefCall();
  } else {
    blitz.cpuOff = blzCpuOffCall(off);
    // the CPU going for a kick skips your defensive call (there's no card for "block it")
    // (a fake shows you the same banner — that's the point of a fake)
    const kk = String(blitz.cpuOff).replace('fake', '');
    if (kk === 'punt' || kk === 'fg') {
      const fake = String(blitz.cpuOff).startsWith('fake');
      blzBanner(kk === 'punt' ? 'PUNT' : 'FIELD GOAL', '#bfe8ff', kk === 'fg' ? blzFGDist() + ' YARDS' : '', 1.2);
      blzAfter(0.9, () => (fake ? blzRunCalls(kk === 'punt' ? BLZ_FAKE_PUNT : BLZ_FAKE_FG, kk === 'punt' ? BLZ_DEF_PUNT_RET : BLZ_DEF_FG_BLOCK) : blzSpecial(kk)));
      return;
    }
    if (blzHuman(1 - off)) blitz.callFor = 'def';
    else { blzRunCalls(blitz.cpuOff, blzCpuDefCall()); return; }
    blzPreCall();
  }
  blitz.phase = 'call'; blitz.callT = 0; blitz.callSel = 4; blitz.flip = false;
  blzPreCall();
}

function blzCpuOffCall(team) {
  const togo = Math.abs(blitz.firstAt - blitz.los), trail = blitz.score[1 - team] - blitz.score[team];
  const late = blitz.q >= 4 && blitz.clock < 30;
  if (blitz.down === 4 && !blitz.pat2) {
    const fgd = blzFGDist();
    if (fgd <= 52 && !(late && trail > 3)) return Math.random() < 0.05 && togo < 10 ? 'fakefg' : 'fg';
    if (!blitz.codes.nopunt && togo > 6 && !(late && trail > 0) && !(blitz.q >= 4 && trail > 8)) return Math.random() < 0.08 && togo < 12 ? 'fakepunt' : 'punt';
  }
  const passes = [0, 1, 2, 3, 4, 8], runs = [6, 7];
  let pRun = togo < 8 ? 0.45 : togo > 18 ? 0.12 : 0.25;
  if (late && trail > 0) pRun = 0.05;
  if (late && trail > 0 && Math.abs(blzGoal(team) - blitz.los) > 45 && Math.random() < 0.5) return 5; // the Hail Mary
  if (Math.random() < pRun) return blzPick(runs);
  if (togo > 20 && Math.random() < 0.35) return 1;
  return blzPick(passes);
}
function blzCpuDefCall() {
  const togo = Math.abs(blitz.firstAt - blitz.los);
  const toGoal = Math.abs(blzGoal(blitz.poss) - blitz.los);
  if (toGoal < 6 && Math.random() < 0.5) return 8;
  const r = Math.random();
  if (togo > 20) return r < 0.4 ? 7 : r < 0.7 ? 6 : r < 0.85 ? 0 : 3;
  if (r < 0.14) return 3;
  return blzPick([0, 1, 2, 4, 5, 6, 7]);
}

// the human picked (n = card index, or 'punt' / 'fg')
function blzChoose(n) {
  if (blitz.phase !== 'call') return;
  blzSfx('pick');
  if (blitz.callFor === 'off') {
    if (n === 'punt' || n === 'fg') {
      if (n === 'punt' && (blitz.codes.nopunt || blitz.pat2)) return;
      if (n === 'fg' && blitz.pat2) return;
      blzSpecial(n);
      return;
    }
    if (n === 'fakepunt' || n === 'fakefg') {
      if (blitz.pat2) return;
      blzRunCalls(n === 'fakepunt' ? BLZ_FAKE_PUNT : BLZ_FAKE_FG, n === 'fakepunt' ? BLZ_DEF_PUNT_RET : BLZ_DEF_FG_BLOCK);
      return;
    }
    blzRunCalls(n, blitz.cpuDef);
  } else {
    if (typeof n !== 'number') return;
    blzRunCalls(blitz.cpuOff, n);
  }
}

function blzRunCalls(offN, defN) {
  const human0 = blzHuman(blitz.poss);
  const flip = human0 ? blitz.flip : blitz.cpuFlip;
  blitz.stats.plays++;
  const op = typeof offN === 'object' ? offN : BLZ_OFF_PLAYS[offN];
  const dp = typeof defN === 'object' ? defN : BLZ_DEF_PLAYS[defN];
  blzLineUp(op, dp, op.fake ? false : flip);
  blitz.phase = 'pre';
  // the CPU takes its time at the line now — long enough for a cadence and some words
  blitz.snapAt = blzHuman(blitz.poss) ? 9 : blzRnd(1.9, 2.9);
  blitz.playT = 0;
  blzPreStart();
}

// Put fourteen nuggets on their marks for a scrimmage play.
function blzLineUp(play, dplay, flip) {
  const off = blitz.poss, def = 1 - off, d = blzDir(off), fl = flip ? -1 : 1;
  blitz.play = play; blitz.dplay = dplay; blitz.flip = flip;
  blitz.kind = play.kind;
  blitz.players = [];
  const bx = blitz.ballX, los = blitz.los;
  const X = (dx) => bx + dx * fl * d, Z = (dz) => los + dz * d;
  const form = Object.assign({}, BLZ_FORM, play.form || {});
  for (const pos of BLZ_OFF_POS) {
    const p = blzMake(off, pos);
    const f = form[pos];
    p.x = blzClamp(X(f[0]), 1, BLZ_WID - 1); p.z = Z(f[1]);
    p.fx = 0; p.fz = d;
    const rt = play.routes && play.routes[pos];
    if (rt) p.route = rt.map((w) => [p.x + w[0] * fl * d, p.z + w[1] * d]);
    if (pos === 'RB' && play.kind === 'run') p.route = play.rb.map((w) => [p.x + w[0] * fl * d, p.z + w[1] * d]);
    p.rs = [p.x, p.z]; p.route0 = p.route; p.hotKind = '';
    p.block = !p.route && pos !== 'QB';
    if (pos === 'C' || pos === 'LG' || pos === 'RG') p.block = true;
    // run plays: the wideouts run a few yards and turn into blockers
    if (play.kind === 'run' && (pos === 'WR1' || pos === 'WR2')) p.runBlock = true;
    blitz.players.push(p);
  }
  const offP = (pos) => blzByPos(off, pos);
  const spots = { DE1: [-3.2, 1.2], DT: [0, 1.2], DE2: [3.2, 1.2], LB: [0, 5.5], CB1: [-14.5, 6], CB2: [14.5, 6], S: [0, 14] };
  BLZ_DEF_POS.forEach((pos, i) => {
    const p = blzMake(def, pos);
    const role = dplay.roles[i];
    let sx = spots[pos][0] * fl, sz = spots[pos][1];
    if (pos === 'CB1') sx = (offP('WR1').x - bx) * d; // line up over your man
    if (pos === 'CB2') sx = (offP('WR2').x - bx) * d;
    p.x = blzClamp(bx + sx * d, 1, BLZ_WID - 1); p.z = Z(sz);
    p.fx = 0; p.fz = -d;
    if (role === 'rush') { p.role = 'rush'; if (pos === 'LB' || pos === 'S' || pos.startsWith('CB')) p.z = Z(pos === 'S' ? 6 : 3.5); }
    else if (role === 'spy') p.role = 'spy';
    else if (typeof role === 'string' && role.startsWith('man:')) {
      p.role = 'man'; p.man = offP(role.slice(4));
      if (p.man && !p.man.route && play.kind !== 'run') { p.role = 'zone'; p.zx = bx; p.zz = Z(6); } // nobody to cover
    } else if (Array.isArray(role)) {
      p.role = role[0]; p.zx = blzClamp(bx + role[1] * fl * d, 3, BLZ_WID - 3); p.zz = Z(role[2]);
      // a punt returner already stands where he'll field it
      if (role[2] > 25) { p.x = p.zx; p.z = blzClamp(p.zz, 2, BLZ_LEN - 2); }
    }
    blitz.players.push(p);
  });
  // blocking assignments: each lineman takes a rusher, left to right
  const OL = ['LG', 'C', 'RG'].map(offP);
  const rushers = blzPlayersOf(def).filter((p) => p.role === 'rush').sort((a, b) => (a.x - b.x) * d * fl);
  OL.forEach((o, i) => { o.man = rushers[Math.min(i, rushers.length - 1)] || null; });
  blitz.ball = { st: 'held', x: bx, z: los, y: 0.3, kind: '' };
  blitz.carrier = null;
  blzAssignButtons(off, bx, d);
  blzCamSnap(d, bx, los + d * 1);
  // who you drive: QB (pass) or the back (run); on defense, the linebacker
  if (blzHuman(off)) blitz.ctl = play.kind === 'run' ? offP('RB') : offP('QB');
  else if (blzHuman(def)) blitz.ctl = blzByPos(def, 'LB');
  else blitz.ctl = null;
  blitz.target = play.kind === 'pass' ? offP(play.primary) : null;
}

// ---- 🎉 THE SIDELINE: benches, the coach, the dip squad, SIR NUGSALOT -----------------------------
// "it just feels kind of empty." A real stadium is full: both benches on their
// feet when their side does something, a coach losing it on the sideline, the
// cheer squad, and the home team's mascot — a giant nugget — running the
// sideline with the play, cartwheeling on touchdowns and faceplanting on theirs.
function blzBuildExtras() {
  const E = [];
  const handheld = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || false;
  if (!handheld) {
    for (const t of [0, 1]) {
      const sx = t === 0 ? -3.6 : BLZ_WID + 3.6, face = t === 0 ? 1 : -1;
      ['QB', 'WR1', 'RB', 'LB', 'CB1', 'S', 'DT', 'WR2'].forEach((ps, i) => {
        const p = blzMake(t, ps);
        p.extra = 'bench'; p.x = sx + (blzHash(i * 3 + t) - 0.5) * 0.5; p.z = 38 + i * 6 + blzHash(i * 7 + t) * 2;
        p.fx = face; p.fz = 0; p.anim = Math.random() * 6;
        E.push(p);
      });
      const c = blzMake(t, 'QB'); c.extra = 'coach'; c.x = sx + face * 0.6; c.z = 57; c.fx = face; c.fz = 0; c.taunt = { kind: 'cross', t: 0, T: 1e9 };
      E.push(c);
      for (let i = 0; i < 3; i++) {
        const q = blzMake(t, 'CB1'); q.extra = 'cheer'; q.x = sx + face * 0.2; q.z = (t === 0 ? 20 : 100) + (i - 1) * 2.4;
        q.fx = face; q.fz = 0; q.num = i * 5 + t; q.taunt = { kind: 'jacks', t: 0, T: 1e9 };
        E.push(q);
      }
    }
    const m = blzMake(0, 'DT'); m.extra = 'mascot'; m.x = -2.9; m.z = 60; m.fx = 0; m.fz = 1; m.mstate = 'walk'; m.mT = 0;
    E.push(m);
  }
  blitz.extras = E;
}
// their side did something: the bench jumps, the other bench sags
function blzCheer(team, secs) {
  for (const e of blitz.extras || []) {
    if (e.extra === 'mascot') continue;
    const mine = e.team === team;
    if (e.extra === 'coach') e.taunt = { kind: mine ? 'pump' : 'palm', t: 0, T: secs || 2.2 };
    else if (e.extra === 'cheer') e.taunt = { kind: mine ? 'hop' : 'jacks', t: 0, T: mine ? secs || 2.2 : 1e9 };
    else e.taunt = { kind: mine ? blzPick(['hop', 'pump', 'flex', 'dance']) : 'slump', t: 0, T: (secs || 2.2) + Math.random() * 0.6 };
  }
  blitz.crowdJump = Math.max(blitz.crowdJump || 0, team === 0 && !blitz.auto ? 1.6 : 0.6);
  // SIR NUGSALOT saves himself for touchdowns
  const M = (blitz.extras || []).find((e) => e.extra === 'mascot');
  if (M && (secs || 0) >= 3) { M.mstate = team === 0 ? 'cartwheel' : 'faceplant'; M.mT = 0; M.taunt = null; }
}
function blzExtrasStep(dt) {
  const E = blitz.extras;
  if (!E || !E.length) return;
  for (const e of E) {
    if (e.taunt && e.taunt.T < 1e8 && (e.taunt.t += dt) > e.taunt.T) {
      e.taunt = e.extra === 'coach' ? { kind: 'cross', t: 0, T: 1e9 } : e.extra === 'cheer' ? { kind: 'jacks', t: 0, T: 1e9 } : null;
    } else if (e.taunt && e.taunt.T >= 1e8) e.taunt.t += dt;
    e.anim += dt * 0.3;
    if (e.extra !== 'mascot') continue;
    // SIR NUGSALOT follows the ball up and down the home sideline
    e.mT += dt;
    if (e.mstate === 'cartwheel') {
      const u = Math.min(1, e.mT / 1.1);
      e.scr = { pitch: 0, roll: u * Math.PI * 2, drop: Math.sin(u * Math.PI) * -0.3, arms: 'spread', legs: 'split' };
      e.z += dt * 3.5;
      if (u >= 1) { e.scr = null; e.mstate = 'dance'; e.mT = 0; e.taunt = { kind: 'dance', t: 0, T: 1.6 }; }
      continue;
    }
    if (e.mstate === 'faceplant') {
      const u = Math.min(1, e.mT / 0.45);
      e.scr = { pitch: 1.5 * u, roll: 0, drop: 0.55 * u, arms: 'spread', legs: null };
      if (e.mT > 1.8) { e.scr = null; e.mstate = 'walk'; e.mT = 0; }
      continue;
    }
    if (e.mstate === 'dance' && e.mT > 1.6) e.mstate = 'walk';
    const focus = blitz.carrier ? blitz.carrier.z : blitz.ball ? blitz.ball.z : blitz.los;
    const tz = blzClamp(focus, 14, 106), dz = tz - e.z;
    const sp = Math.abs(dz) > 1.2 ? Math.min(5.5, Math.abs(dz) * 1.4) : 0;
    e.vz = Math.sign(dz) * sp; e.vx = 0; e.z += e.vz * dt;
    if (sp > 0.6) { e.fx = 0; e.fz = Math.sign(dz); e.anim += sp * dt * 1.5; }
    else { e.fx = 1; e.fz = 0; if (!e.taunt && Math.random() < dt * 0.4) e.taunt = { kind: blzPick(['wiggle', 'beckon', 'dance', 'flex']), t: 0, T: 1.4 }; }
  }
  if (blitz.crowdJump > 0) blitz.crowdJump -= dt * 0.6;
}

// fireworks over the end zone + the flashbulbs + the wave
function blzFireworks(team, endZ) {
  const T = blzTeam(team), cols = [T.c1, T.c2, '#ffffff', '#ffd23a'];
  const fw = blitz.fw || (blitz.fw = []);
  for (let i = 0; i < 7; i++) {
    fw.push({ k: 'rocket', x: blzRnd(4, BLZ_WID - 4), y: 2, z: endZ, vy: blzRnd(20, 27), fuse: blzRnd(0.75, 1.2), t: -i * 0.18, col: blzPick(cols) });
  }
  blzSfx('kick');
}
function blzCrowdFxStep(dt) {
  const fw = blitz.fw;
  if (fw && fw.length) {
    for (const f of fw) {
      f.t += dt;
      if (f.t < 0) continue;
      if (f.k === 'rocket') {
        f.y += f.vy * dt; f.vy -= 6 * dt;
        if (f.t > f.fuse) {
          f.dead = true;
          for (let i = 0; i < 42; i++) {
            const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), sp = blzRnd(6, 11);
            fw.push({ k: 'spark', x: f.x, y: f.y, z: f.z, vx: Math.sin(b) * Math.cos(a) * sp, vy: Math.cos(b) * sp, vz: Math.sin(b) * Math.sin(a) * sp, t: 0, T: blzRnd(1.0, 1.6), col: f.col });
          }
        }
      } else {
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.vy -= 7 * dt; f.vx *= 1 - dt * 0.9; f.vz *= 1 - dt * 0.9;
        if (f.t > f.T) f.dead = true;
      }
    }
    blitz.fw = fw.filter((f) => !f.dead);
  }
  // flashbulbs pop in the stands while something's happening
  if (blitz.flashT > 0) {
    const fl = blitz.bulbs || (blitz.bulbs = []);
    const c = blitz.cam, n = Math.random() < dt * 40 * Math.min(1, blitz.flashT) ? 2 : 0;
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1, u = blzRnd(0.05, 0.95);
      const x = side < 0 ? -4.6 - (0.4 + 16.1 * u) : BLZ_WID + 4.6 + (0.4 + 16.1 * u);
      fl.push({ x, y: 1.6 + 10.8 * u, z: c.z + c.cyw * blzRnd(8, 85) + c.syw * blzRnd(-10, 10), t: 0 });
    }
  }
  if (blitz.bulbs && blitz.bulbs.length) { for (const b of blitz.bulbs) b.t += dt; blitz.bulbs = blitz.bulbs.filter((b) => b.t < 0.14); }
  // the wave: one lap of the stands
  if (blitz.wave) { blitz.wave.z += dt * 24; if (blitz.wave.z > 132) blitz.wave = null; }
}
function blzDrawCrowdFx(g, W, H) {
  if (blitz.bulbs) for (const b of blitz.bulbs) {
    const P = blzProj(b.x, b.y, b.z);
    if (!P) continue;
    const a = 1 - b.t / 0.14, r = Math.max(1.5, Math.min(5, P.k * 0.5));
    g.globalAlpha = a; g.fillStyle = '#ffffff';
    g.fillRect(P.x - r * 1.6, P.y - 0.6, r * 3.2, 1.2); g.fillRect(P.x - 0.6, P.y - r * 1.6, 1.2, r * 3.2);
    g.beginPath(); g.arc(P.x, P.y, r * 0.6, 0, 7); g.fill();
  }
  if (blitz.fw) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const f of blitz.fw) {
      if (f.t < 0) continue;
      const P = blzProj(f.x, f.y, f.z);
      if (!P) continue;
      if (f.k === 'rocket') { g.globalAlpha = 0.9; g.fillStyle = '#fff2c0'; g.beginPath(); g.arc(P.x, P.y, Math.max(2, P.k * 0.4), 0, 7); g.fill(); continue; }
      const a = Math.max(0, 1 - f.t / f.T), r = Math.max(2.2, P.k * 0.55) * (0.6 + a * 0.6);
      g.globalAlpha = a * 0.5; g.fillStyle = f.col; g.beginPath(); g.arc(P.x, P.y, r * 2.2, 0, 7); g.fill();
      g.globalAlpha = a; g.beginPath(); g.arc(P.x, P.y, r, 0, 7); g.fill();
    }
    g.restore();
  }
  g.globalAlpha = 1;
}

// ---- 📺 INSTANT REPLAY + THE CELEBRATIONS ---------------------------------------------------------
// The booth rolls the tape on touchdowns and the biggest hits: the last few
// seconds again, from a low sideline camera, slow through the moment, with the
// TV chrome. Any button skips it. (Recorded at 30 Hz: a shallow copy of every
// field the renderer reads, so a replay frame draws exactly like a live one.)
const BLZ_REC_KEYS = ['x', 'y', 'z', 'fx', 'fz', 'vx', 'vz', 'anim', 'downT', 'diveT', 'jumpT', 'air', 'flipA', 'lieBack', 'celebT', 'celebKind',
  'throwT', 'secureT', 'catchT', 'reachOne', 'turboOn', 'spinT', 'stiffT', 'showboat', 'team', 'pos', 'num', 'name', 'taunt', 'role'];
function blzRec() {
  if (blitz.auto || blitz.noReplay) return;
  const ph = blitz.phase;
  if (ph !== 'live' && ph !== 'dead') return;
  blitz.recOdd = !blitz.recOdd;
  if (blitz.recOdd) return;
  const players = blitz.players;
  const P = players.map((p) => {
    const o = {};
    for (const k of BLZ_REC_KEYS) o[k] = p[k];
    o.eng = !!p.eng; o.scr = p.scr ? Object.assign({}, p.scr) : null; o.reach = p.reach ? p.reach.slice() : null;
    if (p.taunt) o.taunt = Object.assign({}, p.taunt);
    return o;
  });
  const B = blitz.ball ? Object.assign({}, blitz.ball) : null;
  if (B && B.from) B.from = P[players.indexOf(B.from)] || null;
  const rec = blitz.rec || (blitz.rec = []);
  rec.push({ P, ci: players.indexOf(blitz.carrier), B, phase: ph, pocket: blitz.pocket, kind: blitz.kind, t: blitz.t });
  if (rec.length > 240) rec.shift();
}
function blzWantReplay() {
  const W = blitz.replayWant;
  return !!(W && !blitz.auto && !blitz.noReplay && blitz.rec && blitz.rec.length > 30);
}
function blzStartReplay(then) {
  const W = blitz.replayWant, F = blitz.rec.slice();
  blitz.replayWant = null; blitz.playsSinceReplay = 0;
  let mt = F.length - 1, bd = 1e9;
  F.forEach((f, i) => { const d = Math.abs(f.t - W.t); if (d < bd) { bd = d; mt = i; } });
  const i0 = Math.max(0, mt - 90), i1 = Math.min(F.length - 1, mt + (W.why === 'td' ? 50 : 36));
  const at = F[mt], C = at.ci >= 0 ? at.P[at.ci] : null, team = C ? C.team : blitz.poss;
  blitz.replay = { F, i: i0, i0, i1, mt, why: W.why, then, side: blzDir(team) > 0 ? -1 : 1, fx: 0, fz: 0, init: false, T: 0 };
  blitz.phase = 'replay';
  blzSfx('select');
}
function blzReplayStep(dt) {
  const R = blitz.replay;
  R.T += dt;
  const near = Math.abs(R.i - R.mt) < 16;
  R.i += dt * 30 * (near ? 0.38 : 1.0);
  const f = R.F[Math.min(R.i1, Math.floor(R.i))];
  const C = f.ci >= 0 ? f.P[f.ci] : null, B = f.B;
  const tx = C ? C.x : B ? B.x : BLZ_MID, tz = C ? C.z : B ? B.z : blitz.los;
  if (!R.init) { R.fx = tx; R.fz = tz; R.init = true; }
  R.fx += (tx - R.fx) * Math.min(1, dt * 4); R.fz += (tz - R.fz) * Math.min(1, dt * 4);
  if (R.i >= R.i1) blzEndReplay();
}
function blzEndReplay() {
  const R = blitz.replay;
  if (!R) return;
  blitz.replay = null;
  blitz.phase = 'dead';
  if (R.then) R.then();
}
function blzDrawReplay(g, W, H) {
  const R = blitz.replay, f = R.F[Math.min(R.i1, Math.max(0, Math.floor(R.i)))];
  const keep = { players: blitz.players, carrier: blitz.carrier, ball: blitz.ball, phase: blitz.phase, pocket: blitz.pocket, kind: blitz.kind,
    ctl: blitz.ctl, t: blitz.t, parts: blitz.parts, rcv: blitz.rcv, bubbles: blitz.bubbles, cam: Object.assign({}, blitz.cam) };
  blitz.players = f.P; blitz.carrier = f.ci >= 0 ? f.P[f.ci] : null; blitz.ball = f.B;
  blitz.phase = f.phase; blitz.pocket = f.pocket; blitz.kind = f.kind; blitz.ctl = null; blitz.t = f.t;
  blitz.parts = []; blitz.rcv = null; blitz.bubbles = [];
  // a low camera on the sideline, the play running left to right, drifting as it goes
  const c = blitz.cam, u = (R.i - R.i0) / Math.max(1, R.i1 - R.i0);
  c.yaw = R.side * Math.PI / 2 + (u - 0.5) * 0.5 * -R.side; c.h = 3.4; c.pitch = 0.15; c.back = 13; blzCamTrig(c);
  c.x = R.fx - c.syw * c.back; c.z = R.fz - c.cyw * c.back;
  if (blitz.gl && blzGLRender(0, 0)) g.clearRect(0, 0, W, H);
  else blzDrawWorld(g, W, H);
  Object.assign(blitz, { players: keep.players, carrier: keep.carrier, ball: keep.ball, phase: keep.phase, pocket: keep.pocket, kind: keep.kind,
    ctl: keep.ctl, t: keep.t, parts: keep.parts, rcv: keep.rcv, bubbles: keep.bubbles });
  Object.assign(blitz.cam, keep.cam);
  // the TV chrome
  const bar = Math.round(H * 0.08);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, bar); g.fillRect(0, H - bar, W, bar);
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = bar; y < H - bar; y += 3) g.fillRect(0, y, W, 1);
  const near = Math.abs(R.i - R.mt) < 16;
  blzChrome(g, 14, bar + 10, 132, 24, 0, 'rgba(160,20,20,0.9)');
  blzText(g, '● INSTANT REPLAY', 22, bar + 23, 12, ((blitz.t * 2) | 0) % 2 ? '#ffffff' : '#ffd0d0');
  const lab = { td: 'TOUCHDOWN', hit: 'MONSTER HIT', spinebuster: 'SPINEBUSTER', suplex: 'GERMAN SUPLEX', clothesline: 'CLOTHESLINE', spear: 'SPEARED', fling: 'SPUN AND FLUNG' }[R.why] || '';
  if (lab) blzText(g, lab + (near ? '  · SLO-MO' : ''), W - 18, bar + 23, 12, '#ffe23a', 'right');
  blzTextC(g, 'ANY BUTTON TO SKIP', W / 2, H - bar / 2, 9, '#8a92b0');
}

// the scorer's moment: X SPIKE · A DANCE · B BACKFLIP · Y FLEX (the CPU picks its own)
function blzCelebrate(p, kind) {
  if (!p || blitz.celebDone) return;
  blitz.celebDone = true;
  blzEv('celeb');
  const B = blitz.ball;
  if (kind === 'spike') {
    if (B && B.st === 'held' && blitz.carrier === p) {
      B.st = 'spike'; B.x = p.x + p.fx * 0.5; B.z = p.z + p.fz * 0.5; B.y = 1.4; B.vx = p.fx * 2; B.vz = p.fz * 2; B.vy = -19;
    }
    p.throwT = 0.4; blzSfx('hit'); blzFeed('SPIKE!', '#ffe23a');
  } else if (kind === 'dance') {
    p.celebT = 2.6; p.celebKind = ((p.celebKind == null ? -1 : p.celebKind) + 1) % 3; blzFeed('DANCE!', '#ffe23a');
  } else if (kind === 'flip') {
    p.air = true; p.backflip = true; p.vy = 9.5; p.y = 0.05; p.flipA = 0; p.flipV = -Math.PI * 2 / 0.79; p.vx = 0; p.vz = 0; p.downT = 0;
    blzFeed('BACKFLIP!', '#ffe23a');
  } else {
    p.taunt = { kind: blzPick(['flex', 'roar', 'chest']), t: 0, T: 2.2 }; blzFeed('FLEX!', '#ffe23a');
  }
  blzRoar(1, 1.6); blzCrowdSay('yeah');
  if (Math.random() < 0.4) blzSpeak(blzPick(['LOOK AT THIS!', 'OH, HE IS FEELING IT!', 'CELEBRATION TIME!', 'GET A PICTURE OF THIS!']), { who: 'color', prio: 0, maxAge: 2 });
}

// ---- 🗣️ THE LINE: the snap count, the taunts, the trash talk ----------------------------------
// "Add taunting during the hiking. Add flavor there." — Chris. The QB barks his
// cadence (every team has its own word), both sides talk trash in comic
// bubbles with the whole body selling it, TURBO before the snap is YOUR taunt
// (it feeds the HYPE meter — twice a down — and the crowd eats it up), and the
// home crowd chants DE-FENSE when the other side has the ball.
function blzBubble(p, text, o) {
  o = o || {};
  blitz.bubbles = blitz.bubbles.filter((b) => b.p !== p);
  if (blitz.bubbles.length >= 3) blitz.bubbles.shift();
  blitz.bubbles.push({ p, text, t: 0, T: o.T || 1.5, col: o.col || '#ffffff', big: !!o.big });
}
function blzTauntAnim(p, kind, T) { p.taunt = { kind: kind || blzPick(BLZ_TAUNTS), t: 0, T: T || 1.3 }; }
function blzFlavor(team) { return BLZ_FLAVOR[blitz.teams[team]] || BLZ_FLAVOR.nugs; }
function blzTrashLine(team) { return blzPick(blzTrashPool(blitz.teams[team])); }
function blzPreStart() {
  const off = blitz.poss;
  blitz.cad = { word: blzFlavor(off).cad, num: blzPick(BLZ_CAD_NUMS), i: 0, next: 0.3 };
  blitz.tauntNext = blzRnd(0.45, 0.8);
  blitz.tauntsDown = [0, 0];
  blitz.chargeSaid = false; blitz.answer = null;
  blitz.hot = null;
}
function blzTauntHype(team) {
  const human = blzHuman(team);
  if (blitz.tauntsDown[team] >= (human ? 2 : 1)) return;
  blitz.tauntsDown[team]++;
  blzHype(team, human ? 0.035 : 0.01, null, 'taunt');
}
function blzPreStep(dt) {
  const off = blitz.poss, t = blitz.playT, qb = blzByPos(off, 'QB'), C = blitz.cad;
  // the cadence (a fake has a punter back there — he calls it all the same)
  if (C && qb && t >= C.next && blitz.kind !== 'kick') {
    const set = C.i % 3 === 2, line = set ? 'SET!' : C.word + ' ' + C.num + '!';
    blzBubble(qb, line, { T: set ? 0.8 : 0.75, col: '#fff3c0' });
    blzSpeak(line, { who: 'qb', team: off, prio: 1, maxAge: 0.7 });
    C.i++;
    C.next = t + (C.i % 3 === 0 ? 1.5 : 0.65);
  }
  // somebody answers your taunt
  if (blitz.answer && t >= blitz.answer.at) {
    const o = blitz.answer.p; blitz.answer = null;
    if (o && o.downT <= 0) { const ln = blzTrashLine(o.team); blzTauntAnim(o); blzBubble(o, ln, { T: 1.4 }); blzTauntHype(o.team); blzSpeak(ln, { who: 'player', team: o.team, prio: 0, maxAge: 1 }); }
  }
  // trash talk from both sides
  if (t >= blitz.tauntNext) {
    blitz.tauntNext = t + blzRnd(0.55, 1.05);
    const pool = blitz.players.filter((p) => p !== blitz.ctl && p.pos !== 'QB' && p.downT <= 0 && !p.scr && !p.taunt);
    if (pool.length) {
      const p = blzPick(pool);
      if (!/^(C|LG|RG|DE1|DT|DE2)$/.test(p.pos)) blzTauntAnim(p);
      const line = blzTrashLine(p.team);
      blzBubble(p, line, { T: 1.4 });
      if (Math.random() < 0.22) blzSpeak(line, { who: 'player', team: p.team, prio: 0, maxAge: 0.8 });
      if (!blzHuman(p.team)) blzTauntHype(p.team);
      blzEv('trash');
    }
  }
  // the stadium: CHARGE! for the home defense on a big down
  if (!blitz.chargeSaid && blzHuman(1 - off) && blitz.down >= 3 && t > 0.25 && !blitz.auto) { blitz.chargeSaid = true; blzSting('charge'); }
}
// TURBO before the snap: your man taunts
function blzHumanTaunt() {
  const me = blitz.ctl;
  if (!me || blitz.tauntCd > 0 || me.downT > 0 || me.scr) return;
  blitz.tauntCd = 0.75;
  const kind = me.pos === 'QB' && me.team === blitz.poss ? blzPick(['point', 'beckon', 'flex']) : blzPick(BLZ_TAUNTS);
  blzTauntAnim(me, kind, 1.2);
  const line = blzTrashLine(me.team);
  blzBubble(me, line, { T: 1.6, col: '#ffe23a', big: true });
  blzSpeak(line, { who: 'player', team: me.team, prio: 1, maxAge: 1.2 });
  blzRoar(0.45, 0.8);
  blzCrowdSay(Math.random() < 0.5 ? 'yeah' : 'oooh');
  blzTauntHype(me.team);
  blzEv('taunt');
  if (Math.random() < 0.35) blzColor(BLZ_COLOR.taunt, 1);
  // and they talk back
  const opp = blitz.players.filter((p) => p.team !== me.team && p.pos !== 'QB' && !/^(C|LG|RG)$/.test(p.pos));
  if (opp.length && Math.random() < 0.75) blitz.answer = { p: blzPick(opp), at: blitz.playT + 0.55 };
}
// the call screen gets the booth talking about the situation
function blzPreCall() {
  if (blitz.pat2 || blitz.kind === 'kick') return;
  const off = blitz.poss, togo = Math.abs(blitz.firstAt - blitz.los), toGoal = Math.abs(blzGoal(off) - blitz.los);
  if (blitz.q >= 4 && blitz.clock < BLZ_QLEN * 0.5 && !blitz.lateSaid) { blitz.lateSaid = true; blzPBP(BLZ_PBP.late, 1, 5); return; }
  if (blitz.down === 4) { blzPBP(BLZ_PBP.fourth, 1, 5); return; }
  if (blitz.down === 3) { blzPBP(togo > 15 ? BLZ_PBP.thirdLong : BLZ_PBP.third, 0, 5); return; }
  if (blitz.firstAt === blzGoal(off) && blitz.down === 1) { blzPBP(BLZ_PBP.goal, 0, 5); return; }
  if (toGoal < 20 && Math.random() < 0.5) blzPBP(BLZ_PBP.red, 0, 5);
}
// ---- 🏈 PLAY ART + HOT ROUTES (Madden) ---------------------------------------------------------
// Your routes are painted on the turf before the snap, in each receiver's
// button colour. Y (I on a keyboard), his button, then a direction re-routes
// him: ↑ GO · ↓ CURL · toward the ball SLANT · toward the sideline OUT. On a
// touchscreen, tapping a receiver's icon before the snap cycles his route.
const BLZ_HOT = { go: 'GO', curl: 'CURL', slant: 'SLANT', out: 'OUT' };
function blzHotRoute(r, kind) {
  const d = blzDir(r.team), x0 = r.rs ? r.rs[0] : r.x, z0 = r.rs ? r.rs[1] : r.z;
  const mid = Math.sign(blitz.ballX - x0) || 1, side = -mid;
  const P = (dx, dz) => [blzClamp(x0 + dx, 1.5, BLZ_WID - 1.5), z0 + dz * d];
  let pts = null;
  if (kind === 'go') pts = [P(side * 0.6, 6), P(side * 1.2, 46)];
  else if (kind === 'curl') pts = [P(0, 12.5), P(mid * 1.3, 9.8)];
  else if (kind === 'slant') pts = [P(0, 2.5), P(mid * 8, 10), P(mid * 17, 19)];
  else if (kind === 'out') pts = [P(0, 7), P(side * 10, 7.6)];
  if (!pts) { r.route = r.route0; r.hotKind = ''; }
  else { r.route = pts; r.hotKind = BLZ_HOT[kind]; }
  r.ri = 0; r.block = !r.route; r.runBlock = false;
  blzBubble(r, (r.hotKind || 'AS CALLED') + '!', { T: 1.0, col: '#fff3c0' });
  blzSfx('select');
  blzEv('hot');
  blitz.artKey = '';
}
function blzHotDir(dir) {
  const H = blitz.hot;
  if (!H || H.stage !== 'dir' || !H.r) return false;
  const r = H.r;
  if (dir === 'U') blzHotRoute(r, 'go');
  else if (dir === 'D') blzHotRoute(r, 'curl');
  else {
    // screen right is +x when the camera looks down +z
    const scr = (dir === 'R' ? 1 : -1) * blitz.cam.dir, mid = Math.sign(blitz.ballX - (r.rs ? r.rs[0] : r.x)) || 1;
    blzHotRoute(r, scr === mid ? 'slant' : 'out');
  }
  blitz.hot = null;
  return true;
}
const BLZ_HOT_CYCLE = ['go', 'slant', 'out', 'curl', ''];
function blzHotCycle(r) {
  const cur = Object.keys(BLZ_HOT).find((k) => BLZ_HOT[k] === r.hotKind) || '';
  const i = BLZ_HOT_CYCLE.indexOf(cur);
  blzHotRoute(r, BLZ_HOT_CYCLE[(i + 1) % BLZ_HOT_CYCLE.length]);
}
// the ribbons: [{ col, pts }] for whatever the human offense is about to run
function blzRouteArt() {
  const ph = blitz.phase, off = blitz.poss;
  if (!blzHuman(off) || !blitz.rcv || (blitz.kind !== 'pass' && blitz.kind !== 'run')) return null;
  const fresh = ph === 'live' && blitz.pocket && blitz.playT < 0.7;
  if (ph !== 'pre' && !fresh) return null;
  const out = [];
  for (const btn of ['X', 'A', 'B']) {
    const r = blitz.rcv[btn];
    if (!r || !r.route || !r.route.length) continue;
    const pts = [r.rs ? r.rs.slice() : [r.x, r.z]];
    for (const w of r.route) pts.push([w[0], w[1]]);
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], m = Math.hypot(dx, dz) || 1;
    // a curl stops where it stops; everything else keeps going
    if ((dz * blzDir(off)) > -0.5) pts.push([blzClamp(b[0] + dx / m * 5, 0.5, BLZ_WID - 0.5), b[1] + dz / m * 5]);
    out.push({ col: blitz.kind === 'run' && r.pos === 'RB' ? '#ff9a3a' : BLZ_BTN_COL[btn], pts, a: fresh ? 1 - blitz.playT / 0.7 : 1 });
  }
  return out;
}

// is somebody about to hit him (hurdle) or is it open field (showboat)?
function blzThreatAhead(C, r) {
  for (const q of blitz.players) {
    if (q.team === C.team || q.downT > 0) continue;
    const dx = q.x - C.x, dz = q.z - C.z, d = Math.hypot(dx, dz);
    if (d < r && (dx * C.fx + dz * C.fz) / (d || 1) > -0.3) return true;
  }
  return false;
}

// THE RECEIVER BUTTONS (Madden-style): every eligible man gets a button by where
// he lines up — the outside man on the LEFT is X, on the RIGHT is B, whoever is
// in between (the back, the slot) is A. On a keyboard the IJKL cluster is the
// controller's face-button diamond: J = X, K = A, L = B (and I = Y).
const BLZ_HOLD = 0.17;   // hold a receiver button this long and it's a bullet (a quick tap is a lob)
const BLZ_BTN_COL = { A: '#36c23a', B: '#e8402a', X: '#2a78ec', Y: '#f2c41e' };
const BLZ_BTN_KEY = { A: 'K', B: 'L', X: 'J', Y: 'I' };
function blzAssignButtons(off, bx, d) {
  blitz.rcv = {};
  blitz.charge = null;
  const el = blitz.players.filter((q) => q.team === off && BLZ_ELIG[q.pos]);
  el.sort((a, b) => (a.x - b.x) * d);
  for (const q of blitz.players) q.btn = null;
  if (!el.length) return;
  const set = (k, q) => { if (q && !q.btn) { blitz.rcv[k] = q; q.btn = k; } };
  set('X', el[0]); set('B', el[el.length - 1]);
  for (const q of el) set('A', q);
}
function blzBtnLabel(btn) { return blitz.inputMode === 'pad' || blitz.inputMode === 'touch' ? btn : BLZ_BTN_KEY[btn]; }

function blzSnap() {
  const off = blitz.poss;
  blitz.hot = null;
  blitz.playsSinceReplay = (blitz.playsSinceReplay || 0) + 1;
  for (const t of [0, 1]) if (!blzOnFire(t)) blitz.hype[t] = Math.max(0, blitz.hype[t] - 0.055);
  blitz.phase = 'live';
  blitz.playT = 0; blitz.thrown = false; blitz.handed = false;
  blitz.startZ = blitz.los;
  const qb = blzByPos(off, 'QB');
  blitz.carrier = qb; blitz.ball.st = 'held';
  blitz.pocket = true;
  blitz.qbPatience = blzRnd(0.75, 1.45);
  blitz.saidPress = false;
  blitz.nextRead = 0.85;
  for (const p of blitz.players) p.taunt = null;
  blitz.bubbles = blitz.bubbles.filter((b) => b.p === qb);
  if (qb) blzBubble(qb, 'HUT!', { T: 0.6, col: '#fff3c0', big: true });
  blzSpeak('HUT!', { who: 'qb', team: off, prio: 2, maxAge: 0.5 });
  if (blitz.play && blitz.play.fake) {
    blzBanner(blitz.play.name + '!', '#ff8a3a', '', 1.2);
    blzSay(blitz.play.fake === 'punt' ? 'fake punt!' : 'it\'s a fake!', true);
    blzRoar(0.8, 1.5);
  }
  for (const p of blitz.players) {
    p.react = blzRnd(0.05, 0.3);
    // blitzers off the second level read the snap first (and give a human QB a beat)
    if (p.team !== off && p.role === 'rush' && !/^D[ET]/.test(p.pos)) p.react += 0.35;
  }
  blzSfx('hut');
}

// ---- special teams --------------------------------------------------------------------------
function blzSpecial(kind) {
  blzClearPlay();
  const off = blitz.poss, def = 1 - off, d = blzDir(off);
  blitz.kind = kind; blitz.players = [];
  const bx = blitz.ballX, los = blitz.los;
  for (const pos of BLZ_OFF_POS) {
    const p = blzMake(off, pos);
    const f = BLZ_FORM[pos];
    p.x = bx + f[0] * d * (kind === 'punt' && pos.startsWith('WR') ? 1.3 : kind === 'fg' && pos.startsWith('WR') ? 0.25 : 1);
    p.z = los + f[1] * d;
    if (pos === 'QB') { p.z = los - d * (kind === 'punt' ? 13 : 7); p.role = kind === 'punt' ? 'punter' : 'holder'; }
    if (pos === 'RB') { p.z = los - d * (kind === 'punt' ? 6 : 9.5); p.x = bx - (kind === 'fg' ? 2 * d : 0); p.role = kind === 'fg' || kind === 'pat' ? 'kicker' : 'protect'; }
    p.x = blzClamp(p.x, 1, BLZ_WID - 1);
    p.block = !p.role; p.fx = 0; p.fz = d;
    blitz.players.push(p);
  }
  BLZ_DEF_POS.forEach((pos) => {
    const p = blzMake(def, pos);
    const sx = { DE1: -3.2, DT: 0, DE2: 3.2, LB: -1.5, CB1: -16, CB2: 16, S: 0 }[pos];
    p.x = blzClamp(bx + sx * d, 1, BLZ_WID - 1); p.z = los + d * 1.2;
    p.role = 'rush'; p.fx = 0; p.fz = -d;
    if (kind === 'punt') {
      if (pos === 'CB1') { p.role = 'returner'; p.x = BLZ_MID + (bx - BLZ_MID) * 0.4; p.z = blzClamp(los + d * 42, 12, 108); blitz.returner = p; }
      else if (pos === 'S' || pos === 'CB2') { p.role = 'wall'; p.z = los + d * (pos === 'S' ? 28 : 20); }
    }
    blitz.players.push(p);
  });
  blitz.ball = { st: 'held', x: bx, z: los, y: 0.3, kind: '' };
  blzCamSnap(d, bx, los);
  blitz.ctl = null;
  if (kind === 'punt' && blzHuman(def)) blitz.ctl = blitz.returner;
  if (blzHuman(def) && kind !== 'punt') blitz.ctl = blzByPos(def, 'LB');
  blitz.phase = 'live'; blitz.playT = 0; blitz.pocket = false;
  blitz.carrier = null;
  if (kind === 'fg' || kind === 'pat') {
    const dist = kind === 'pat' ? 20 : blzFGDist();
    const odds = kind === 'pat' ? 0.97 : blzFGOdds(dist);
    blitz.fg = { dist, odds, good: Math.random() < odds, kicked: false };
  } else blitz.punt = { kicked: false };
  blzSfx('hut');
}

// ---- input -----------------------------------------------------------------------------------
function blzStick() {
  const K = blitz.keys, T = blitz.touch, P = blitz.pad;
  let x = 0, y = 0;
  if (K.ArrowLeft || K.KeyA) x -= 1;
  if (K.ArrowRight || K.KeyD) x += 1;
  if (K.ArrowUp || K.KeyW) y += 1;
  if (K.ArrowDown || K.KeyS) y -= 1;
  if (T.L) { x += T.L.dx; y -= T.L.dy; }
  if (P.on) { x += P.lx || 0; y -= P.ly || 0; }
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; }
  return { x, y, m: Math.min(1, m) };
}
function blzTurboHeld() {
  const K = blitz.keys;
  return !!(K.ShiftLeft || K.ShiftRight || blitz.touch.T || (blitz.pad.on && blitz.pad.turbo));
}
// world-space direction of the stick (screen up = downfield for the camera)
function blzStickWorld() {
  const s = blzStick(), d = blitz.cam.dir;
  return { x: s.x * d, z: s.y * d, m: s.m };
}

// PASS button: snap · throw · lateral · switch defender · stiff arm
function blzPressPass() {
  const ph = blitz.phase;
  if (ph === 'vs') { blzCodeTap(2); return; }
  if (ph === 'teams') { blzTeamPick(); return; }
  if (ph === 'final') { if (blitz.finalT > 1) blzNewGame(blitz.cfg, true); return; }
  if (ph === 'call') { blzChoose(blitz.callSel); return; }
  if (ph === 'pat') { blzPatChoose(blitz.callSel === 1 ? 2 : 1); return; }
  const off = blitz.poss;
  if (ph === 'pre') {
    if (blzHuman(off)) blzSnap();
    else if (blzHuman(1 - off)) blzSwitchDefender();
    return;
  }
  // after the whistle PASS is a shove (JUMP is the elbow drop)
  if (ph === 'dead' || ph === 'wait') { if (blitz.ctl) blzLateHit(blitz.ctl); return; }
  if (ph !== 'live') return;
  const C = blitz.carrier, me = blitz.ctl, B = blitz.ball;
  // the human kicker's foot
  if (blitz.kind === 'kick' && B && B.st === 'tee' && blitz.kickWait) {
    blitz.onside = blzTurboHeld(); blitz.kickWait = false; blitz.playT = 0;
    return;
  }
  if (!me) return;
  if (!C) {
    // ball in the air: your pass, your receiver — nothing to switch to
    const mine = B && B.from && B.from.team === me.team;
    if (!mine) blzSwitchDefender();
    return;
  }
  if (C.team !== me.team) { blzSwitchDefender(); return; }
  if (C !== me) return;
  const pastLos = (C.z - blitz.los) * blzDir(C.team) > 0.4;
  if (blitz.pocket && C.pos === 'QB' && blitz.kind === 'pass' && !blitz.thrown && !pastLos) {
    const tgt = blitz.target || blzBestTarget(C);
    if (tgt) blzThrow(C, tgt, blzTurboHeld() ? 'bullet' : 'touch');
    return;
  }
  if (blzTurboHeld()) { blzStiffArm(C); return; }
  blzLateral(C);
}
// THE BUTTONS. SP = the action button (SPACE / Enter / LB / the PASS button),
// X A B Y = the face diamond (J K L I / pad X A B Y / tapping a receiver's
// icon). What each one does depends on who you are right now, Madden-style:
//   QB in the pocket   X A B: throw to THAT receiver (tap = lob, hold = bullet)
//                      Y: pump fake · SP: throw to the man you're looking at
//   ball carrier       B: spin · A: stiff arm · X: dive forward · Y: hurdle · SP: lateral
//   your receiver, ball in the air   Y: high-point it · X: lay out for it
//   defense            B / SP: switch player · X: dive tackle · Y: jump / swat · A: the big-hit lunge
//   after the whistle  Y: elbow drop · anything else: shove
function blzBtnDown(btn, src) {
  if (src) blitz.inputMode = src;
  const ph = blitz.phase;
  if (ph === 'replay') { blzEndReplay(); return; }
  if (ph === 'vs') { if (btn === 'SP' || btn === 'A') blzCodeTap(2); else if (btn === 'Y') blzCodeTap(1); return; }
  if (ph === 'teams' || ph === 'call' || ph === 'pat' || ph === 'final') { if (btn === 'SP' || btn === 'A') blzPressPass(); return; }
  if (ph === 'pre') {
    const off = blitz.poss;
    if (blzHuman(off)) {
      const H = blitz.hot, recv = btn === 'X' || btn === 'A' || btn === 'B';
      // touch: tapping a receiver's icon cycles his route
      if ((src === 'touch' || src === 'mouse') && recv && blitz.rcv && blitz.rcv[btn]) { blzHotCycle(blitz.rcv[btn]); return; }
      if (btn === 'Y' && (blitz.kind === 'pass' || blitz.kind === 'run')) { blitz.hot = H ? null : { stage: 'pick' }; blzSfx('select'); return; }
      if (H && H.stage === 'pick' && recv && blitz.rcv && blitz.rcv[btn]) {
        blitz.hot = { stage: 'dir', r: blitz.rcv[btn] }; blzBubble(blitz.rcv[btn], 'WHICH WAY?', { T: 2.5, col: '#fff3c0' }); blzSfx('select'); return;
      }
      if (H) { if (btn === 'SP') { blitz.hot = null; blzSnap(); } return; }
      if (btn === 'SP' || btn === 'A') blzSnap();
    } else if (blzHuman(1 - off) && (btn === 'SP' || btn === 'B')) blzSwitchDefender();
    return;
  }
  if (ph === 'dead' || ph === 'wait') {
    const me = blitz.ctl, D = blitz.dead;
    if (ph === 'dead' && D && D.type === 'td' && D.who && blzHuman(D.who.team) && !blitz.celebDone) {
      const k = { X: 'spike', A: 'dance', B: 'flip', Y: 'flex', SP: 'dance' }[btn];
      if (k) { blzCelebrate(D.who, k); return; }
    }
    if (me) { if (btn === 'Y') blzElbowDrop(me); else blzLateHit(me); }
    return;
  }
  if (ph !== 'live') return;
  const me = blitz.ctl, C = blitz.carrier, B = blitz.ball;
  if (blitz.kind === 'kick' && B && B.st === 'tee' && blitz.kickWait) {
    if (btn === 'SP' || btn === 'A') blzPressPass();
    return;
  }
  if (!me) return;
  if (btn === 'SP') { blzPressPass(); return; }
  const pocketQB = me === C && blitz.pocket && me.pos === 'QB' && blitz.kind === 'pass' && !blitz.thrown;
  if (btn === 'Y') {
    if (pocketQB) { blzPumpFake(me); return; }
    // with the ball in the open field, Y is SHOWBOAT (NFL Street's style button): slower,
    // fumble-prone, and it pours HYPE in; with a man in your face it's still the hurdle
    if (me === C && C.downT <= 0 && !C.air && !blzThreatAhead(C, 4.5)) {
      C.showboatH = !C.showboatH;
      if (C.showboatH) { blzFeed('SHOWBOATING!', '#ffcf8a'); blzRoar(0.6, 1); if (Math.random() < 0.6) blzColor(BLZ_COLOR.showboat, 1); }
      return;
    }
    blzPressJump(); return;
  }
  if (pocketQB) {
    const r = blitz.rcv && blitz.rcv[btn];
    if (!r || r.downT > 0) return;
    if ((C.z - blitz.los) * blzDir(C.team) > 0.4) { blzFeed('PAST THE LINE', '#bfc6ff'); return; }
    blitz.target = r;
    if (blzTurboHeld()) { blzThrow(C, r, 'bullet'); return; }
    blitz.charge = { btn, r, t0: blitz.t };      // released soon = lob; held = bullet
    return;
  }
  if (me === C) {
    if (btn === 'B') { if (me.spinCd <= 0 && me.downT <= 0) { me.spinT = 0.5; me.spinCd = 1.1; blzSfx('turbo'); } }
    else if (btn === 'A') blzStiffArm(me);
    else if (btn === 'X') blzCarrierDive(me);
    return;
  }
  if (!C && B && B.st === 'air' && B.kind === 'pass' && B.from && B.from.team === me.team) {
    if (btn === 'X' && me.diveT <= 0 && me.downT <= 0) blzDiveTo(me, B.tx, B.tz);
    return;
  }
  // defense
  if (btn === 'B') { blzSwitchDefender(); return; }
  if (me.diveT > 0 || me.downT > 0) return;
  if (btn === 'X') { if (C && C.team !== me.team) blzDive(me); else if (B && B.st === 'air') blzDiveTo(me, B.tx, B.tz); return; }
  if (btn === 'A') blzHitStick(me);
}
function blzBtnUp(btn) {
  const ch = blitz.charge;
  if (ch && ch.btn === btn) { blitz.charge = null; blzReleaseThrow(ch, false); }
}
function blzReleaseThrow(ch, held) {
  const C = blitz.carrier;
  if (blitz.phase !== 'live' || !C || C.pos !== 'QB' || !blitz.pocket || blitz.thrown || !ch.r || ch.r.downT > 0) return;
  if ((C.z - blitz.los) * blzDir(C.team) > 0.4) return;
  const t = blitz.t - ch.t0;
  blzThrow(C, ch.r, held ? 'bullet' : t > 0.11 ? 'touch' : 'lob');
}
// the pump: the arm comes through, the coverage bites
function blzPumpFake(qb) {
  if ((qb.pumpCd || 0) > 0) return;
  qb.pumpCd = 0.9; qb.throwT = 0.3;
  blzSfx('throw');
  for (const p of blitz.players) {
    if (p.team === qb.team || p.downT > 0 || p === blitz.ctl) continue;
    if ((p.role === 'zone' || p.role === 'deep' || p.role === 'man') && blzDist(p, qb) < 32 && Math.random() < 0.6) p.react = Math.max(p.react, 0.32);
  }
  blzFeed('PUMP FAKE', '#bfe8ff');
}
// a carrier going to the turf on purpose: two yards of dive, then down where he lands
function blzCarrierDive(p) {
  if (p.diveT > 0 || p.downT > 0 || p.jumpT > 0) return;
  p.diveT = 0.42;
  p.vx = p.fx * p.spd * 1.25; p.vz = p.fz * p.spd * 1.25;
}
// the hit stick: a turbo lunge — make contact inside it and it's a MONSTER HIT
function blzHitStick(p) {
  if ((p.hitCd || 0) > 0) return;
  p.hitCd = 0.9; p.lungeT = 0.3;
  const C = blitz.carrier;
  let dx = p.fx, dz = p.fz;
  if (C && C.team !== p.team && blzDist(p, C) < 6) { const d = blzDist(p, C) || 1; dx = (C.x + C.vx * 0.15 - p.x) / d; dz = (C.z + C.vz * 0.15 - p.z) / d; const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m; }
  p.fx = dx; p.fz = dz; p.vx = dx * p.spd * 1.6; p.vz = dz * p.spd * 1.6;
}

// JUMP button: hurdle / spin with turbo · on defense high-point or dive with turbo
function blzPressJump() {
  const ph = blitz.phase;
  if (ph === 'vs') { blzCodeTap(1); return; }
  if (ph === 'call' || ph === 'pat') return;
  const me = blitz.ctl;
  if (!me || me.downT > 0 || me.diveT > 0) return;
  if (ph === 'dead' || ph === 'wait') { blzElbowDrop(me); return; }
  if (ph !== 'live') return;
  const tur = blzTurboHeld();
  const Bj = blitz.ball;
  // your receiver, ball in the air: TURBO+JUMP lays out for it
  if (Bj && Bj.st === 'air' && Bj.kind === 'pass' && me === blitz.target && tur && me.diveT <= 0) { blzDiveTo(me, Bj.tx, Bj.tz); return; }
  if (me === blitz.carrier) {
    if (tur && me.spinCd <= 0) { me.spinT = 0.5; me.spinCd = 1.1; blzSfx('turbo'); return; }
    if (me.jumpT <= 0) { me.jumpT = 0.62; return; }
    return;
  }
  const C = blitz.carrier;
  if (tur && C && C.team !== me.team) { blzDive(me); return; }
  if (me.jumpT <= 0) me.jumpT = 0.62;
}

function blzSwitchDefender() {
  const me = blitz.ctl;
  if (!me) return;
  const B = blitz.ball;
  const tgt = B.st === 'air' ? { x: B.tx, z: B.tz } : (blitz.carrier || B);
  const n = blzNearestTo(me.team, tgt, (p) => p !== me && p.downT <= 0);
  if (n) { blitz.ctl = n; blzSfx('select'); }
}

function blzNearestTo(team, at, filt) {
  let best = null, bd = 1e9;
  for (const p of blitz.players) {
    if (p.team !== team || (filt && !filt(p))) continue;
    const d = Math.hypot(p.x - at.x, p.z - at.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// The receiver the QB's stick points at (or the best open one for the CPU).
function blzAimTarget(qb) {
  const w = blzStickWorld();
  const recs = blzPlayersOf(qb.team).filter((p) => BLZ_ELIG[p.pos] && p.downT <= 0);
  if (w.m < 0.3) return blitz.target && recs.includes(blitz.target) ? blitz.target : recs[0];
  let best = null, bs = -1e9;
  for (const r of recs) {
    const dx = r.x - qb.x, dz = r.z - qb.z, d = Math.hypot(dx, dz) || 1;
    const cos = (dx * w.x + dz * w.z) / (d * (w.m || 1));
    const sc = cos * 2 - d * 0.01;
    if (sc > bs) { bs = sc; best = r; }
  }
  return best;
}
function blzOpenness(r) {
  let md = 99;
  for (const p of blitz.players) {
    if (p.team === r.team || p.downT > 0) continue;
    md = Math.min(md, Math.hypot(p.x - r.x, p.z - r.z));
  }
  return md;
}
function blzBestTarget(qb) {
  const recs = blzPlayersOf(qb.team).filter((p) => BLZ_ELIG[p.pos] && p.downT <= 0);
  let best = null, bs = -1e9;
  for (const r of recs) {
    const open = blzOpenness(r), gain = (r.z - blitz.los) * blzDir(qb.team);
    const sc = Math.min(open, 7) * 1.0 + blzClamp(gain, -4, 30) * 0.09 - Math.hypot(r.x - qb.x, r.z - qb.z) * 0.02;
    if (sc > bs) { bs = sc; best = r; }
  }
  return best ? { r: best, open: blzOpenness(best) } : null;
}

// ---- the ball ---------------------------------------------------------------------------------
// type: 'lob' (tap — high, soft, over the linebackers), 'touch' (a quick tap,
// or SPACE), 'bullet' (hold, or turbo — fast and flat, threads a window, and
// the one a defender jumps). true/false still mean bullet/lob.
const BLZ_THROW = { lob: { v: 17, p0: 1.0, pk: 0.13, e: 0 }, touch: { v: 21.5, p0: 0.7, pk: 0.085, e: 0.05 }, bullet: { v: 27.5, p0: 0.35, pk: 0.035, e: 0.15 } };
function blzThrow(qb, r, kind) {
  const B = blitz.ball;
  const type = kind === true ? 'bullet' : (kind === false || kind == null) ? 'lob' : kind;
  const TH = BLZ_THROW[type] || BLZ_THROW.lob;
  const bullet = type === 'bullet';
  const fast = blitz.codes.fastpass ? 1.3 : 1;
  const spd = TH.v * fast;
  // lead the receiver: where he'll be when the ball gets there
  let tx = r.x, tz = r.z, T = 0.5;
  for (let i = 0; i < 3; i++) {
    T = Math.max(0.35, Math.hypot(tx - qb.x, tz - qb.z) / spd);
    tx = r.x + r.vx * T; tz = r.z + r.vz * T;
  }
  // ball placement: the stick at release nudges it (lead him to the sideline, back
  // shoulder, over the top); the human's QB only
  if (blzHuman(qb.team)) {
    const w = blzStickWorld();
    if (w.m > 0.3) { const k = type === 'lob' ? 2.0 : type === 'touch' ? 1.6 : 1.1; tx += w.x * k; tz += w.z * k; }
  }
  const dist = Math.hypot(tx - qb.x, tz - qb.z);
  // pressure, distance and throwing on the run spray it; the fire doesn't miss
  let press = 0;
  for (const p of blitz.players) if (p.team !== qb.team && p.downT <= 0 && blzDist(p, qb) < 2.5) press = 1;
  const run = Math.hypot(qb.vx, qb.vz);
  let err = 0.25 + dist * 0.022 + press * 0.8 + TH.e + Math.max(0, run - 2) * 0.06;
  if (blzOnFire(qb.team)) err *= 0.4;
  const a = Math.random() * Math.PI * 2, m = err * Math.sqrt(Math.random());
  tx += Math.cos(a) * m; tz += Math.sin(a) * m;
  B.st = 'air'; B.kind = 'pass';
  B.x0 = qb.x; B.z0 = qb.z; B.y0 = 2.1;
  B.tx = blzClamp(tx, -2, BLZ_WID + 2); B.tz = tz; B.ty = 1.6;
  B.t = 0; B.T = T; B.peak = TH.p0 + dist * TH.pk;
  B.from = qb; B.bullet = bullet; B.lob = type === 'lob'; B.type = type;
  blitz.charge = null;
  blzEv('att' + qb.team);
  blitz.target = r; blitz.thrown = true; blitz.pocket = false; blitz.carrier = null;
  qb.throwT = 0.35;
  blzSfx('throw');
  // you drive the receiver while the ball is up
  if (blzHuman(qb.team)) blitz.ctl = r;
  if (dist > 35) blzSay(blzPick(BLZ_CALLS.bomb));
}

function blzLateral(C) {
  // pitch to the nearest teammate, preferring one level or behind
  const d = blzDir(C.team);
  let best = null, bs = 1e9;
  for (const p of blitz.players) {
    if (p.team !== C.team || p === C || p.downT > 0) continue;
    const ahead = (p.z - C.z) * d;
    const dd = Math.hypot(p.x - C.x, p.z - C.z);
    if (dd > 14) continue;
    const sc = dd + Math.max(0, ahead) * 2.5;
    if (sc < bs) { bs = sc; best = p; }
  }
  if (!best) return;
  const B = blitz.ball;
  const T = Math.max(0.3, blzDist(C, best) / 16);
  B.st = 'air'; B.kind = 'lat';
  B.x0 = C.x; B.z0 = C.z; B.y0 = 1.4;
  B.tx = best.x + best.vx * T; B.tz = best.z + best.vz * T; B.ty = 1.3;
  B.t = 0; B.T = T; B.peak = 0.6; B.from = C;
  blitz.target = best; blitz.carrier = null;
  C.throwT = 0.3;
  blzSfx('throw');
  if (blzHuman(C.team)) blitz.ctl = best;
  blzFeed('LATERAL!', '#bfe8ff');
}

function blzStiffArm(C) {
  if (C.stiffT > 0 || C.spinCd > 0) return;
  C.stiffT = 0.45; C.spinCd = 0.9;
}

function blzDiveTo(p, x, z) {
  const dx = x - p.x, dz = z - p.z, m = Math.hypot(dx, dz) || 1;
  p.diveT = 0.42; p.fx = dx / m; p.fz = dz / m;
  const sp = Math.min(p.spd * 1.55, m / 0.38);
  p.vx = p.fx * sp; p.vz = p.fz * sp;
}
function blzDive(p) {
  p.diveT = 0.42;
  const C = blitz.carrier;
  let dx = p.fx, dz = p.fz;
  if (C) { const d = blzDist(p, C) || 1; dx = (C.x + C.vx * 0.2 - p.x) / d; dz = (C.z + C.vz * 0.2 - p.z) / d; const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m; }
  p.vx = dx * p.spd * 1.5; p.vz = dz * p.spd * 1.5; p.fx = dx; p.fz = dz;
}

function blzFumble(C, by) {
  const B = blitz.ball;
  B.st = 'loose'; B.kind = 'loose';
  B.x = C.x; B.z = C.z; B.y = 1.2;
  const a = Math.random() * Math.PI * 2;
  B.vx = Math.cos(a) * 5 + (by ? by.vx * 0.4 : 0); B.vz = Math.sin(a) * 5 + (by ? by.vz * 0.4 : 0); B.vy = 4;
  B.lastTeam = C.team; B.looseT = 0;
  blzEv('fumble' + blitz.kind);
  blitz.carrier = null; blitz.pocket = false;
  blzBanner('FUMBLE!', '#ff8a3a', '', 1.1);
  blzSay(blzPick(BLZ_CALLS.fumble), true);
  blzRoar(0.9, 1.6);
}

function blzBallUpdate(dt) {
  const B = blitz.ball;
  if (!B) return;
  if (B.st === 'spike') {
    B.vy -= 22 * dt; B.y += B.vy * dt;
    if (B.y < 0.15) { B.y = 0.15; B.vy = Math.abs(B.vy) * 0.7; B.vx *= 0.75; B.vz *= 0.75; if (B.vy > 3) blzSfx('kick'); }
    B.x += B.vx * dt; B.z += B.vz * dt;
    return;
  }
  if (B.st === 'held') {
    const C = blitz.carrier;
    if (C) { B.x = C.x + C.fx * 0.35; B.z = C.z + C.fz * 0.35; B.y = 1.2 + C.y; }
    return;
  }
  if (B.st === 'air') {
    B.t += dt;
    const u = Math.min(1, B.t / B.T);
    B.x = B.x0 + (B.tx - B.x0) * u; B.z = B.z0 + (B.tz - B.z0) * u;
    B.y = B.y0 + (B.ty - B.y0) * u + B.peak * 4 * u * (1 - u);
    if (B.kind === 'fg') { if (u >= 1) blzFGResult(); return; }
    if (B.t >= B.T) {
      if (B.kind === 'pass' || B.kind === 'lat') blzCatchResolve();
      else if (B.kind === 'tip') blzTipResolve();
      else blzKickArrive();
    }
    return;
  }
  if (B.st === 'loose') {
    B.looseT += dt;
    B.vy -= 22 * dt; B.y += B.vy * dt;
    if (B.y < 0.15) { B.y = 0.15; B.vy = Math.abs(B.vy) * 0.45; B.vx *= 0.7; B.vz *= 0.7; if (B.vy < 1) B.vy = 0; }
    B.x += B.vx * dt; B.z += B.vz * dt;
    B.vx *= 1 - dt * 0.8; B.vz *= 1 - dt * 0.8;
    if (B.x < 0 || B.x > BLZ_WID || B.z < 0 || B.z > BLZ_LEN) {
      // out of bounds: the fumbling team keeps it
      blzWhistle('oob', { team: B.lastTeam, z: blzClamp(B.z, 1, BLZ_LEN - 1), x: B.x });
      return;
    }
    // nobody fell on it in eight seconds: the officials (there are none) blow it dead
    if (B.looseT > 8) { blzWhistle('oob', { team: B.lastTeam, z: blzClamp(B.z, 1, BLZ_LEN - 1), x: B.x }); return; }
    if (B.y > 1.6 || B.looseT < 0.25) return;
    for (const p of blitz.players) {
      if (p.downT > 0 || p.scr) continue;     // (a diver can fall on it)
      // an onside kick belongs to the receivers until it has gone ten yards
      if (B.kind === 'onside' && p.team !== B.lastTeam && Math.abs(B.z - B.oz) < 10) continue;
      if (Math.hypot(p.x - B.x, p.z - B.z) < 0.9 && Math.random() < dt * 9) {
        blzGiveBall(p, B.kind === 'loose' && p.team !== B.lastTeam ? 'recover' : 'pickup');
        return;
      }
    }
  }
}

function blzGiveBall(p, how) {
  const B = blitz.ball, prev = B.lastTeam;
  B.st = 'held'; B.kind = '';
  p.secureT = 0.35; p.reach = null;
  // a new carrier far from paydirt arms the breakaway countdown
  blitz.countdown = (blzGoal(p.team) - p.z) * blzDir(p.team) > 34 ? 99 : 0;
  blitz.carrier = p; blitz.pocket = false; blitz.target = null;
  if (blzHuman(p.team)) blitz.ctl = p;
  else if (blitz.ctl && blzHuman(1 - p.team)) blitz.ctl = blzNearestTo(1 - p.team, p, (q) => q.downT <= 0) || blitz.ctl;
  if (how === 'recover' && prev != null && prev !== p.team) {
    blzFeed(blzTeam(p.team).name + ' RECOVER!', '#ffd23a');
    if (blzHuman(p.team)) blzEarn(8, 'FUMBLE RECOVERY');
    blzHype(p.team, 0.15, null, 'recover');
  }
  // a ball caught behind your own goal line can be downed for a touchback
  blitz.ezCatch = (p.z - blzOwnGoal(p.team)) * blzDir(p.team) < 0;
  blzSfx('catch');
}

function blzCatchResolve() {
  const B = blitz.ball, r = blitz.target, from = B.from;
  const team = from ? from.team : blitz.poss;
  if (B.kind === 'lat') {
    if (r && r.downT <= 0 && Math.hypot(r.x - B.x, r.z - B.z) < 2.2 && Math.random() < 0.88) { blzGiveBall(r, 'lat'); return; }
    blzFumble({ x: B.x, z: B.z, team, fx: 0, fz: 0 }, null);
    return;
  }
  const reachO = (p) => 1.55 + (p.jumpT > 0 ? 0.55 : 0) + (p.diveT > 0 ? 0.95 : 0);
  const reachD = (p) => 1.3 + (p.jumpT > 0 ? 0.75 : 0) + (p.diveT > 0 ? 0.6 : 0);
  // the man it was thrown to gets first claim; any eligible teammate can still come down with it
  let off = null, dO = 99, def = null, dD = 99;
  for (const p of blitz.players) {
    if (p.downT > 0) continue;
    const d = Math.hypot(p.x - B.x, p.z - B.z);
    if (p.team === team) { if (BLZ_ELIG[p.pos] && d - (p === r ? 0.35 : 0) < dO) { dO = d - (p === r ? 0.35 : 0); off = p; } }
    else if (d < dD) { dD = d; def = p; }
  }
  if (off) dO = Math.hypot(off.x - B.x, off.z - B.z);
  const oIn = !!off && dO <= reachO(off), dIn = !!def && dD <= reachD(def);
  const done = (txt) => {
    blzFeed(txt, '#bfc6ff'); blzWhistle('inc', {});
    if (txt === 'DROPPED') blzColor(BLZ_COLOR.drop, 0.7); else if (Math.random() < 0.35) blzPBP(BLZ_PBP.incomplete, 0, 1.5);
    if (blzHuman(team)) blzCrowdSay('aww');
  };
  if (!oIn && !dIn) { done('INCOMPLETE'); return; }
  const fire = blzOnFire(team);
  if (dIn && (!oIn || dD + 0.35 < dO)) {
    // the defender got there first: a pick, a tip, or the receiver behind him still hauls it in
    let pInt = (0.08 + def.hands * 0.18) * (B.lob ? 1.25 : B.bullet ? 0.8 : 1) + (def.jumpT > 0 ? 0.08 : 0) + (def === blitz.ctl && blzHuman(def.team) ? 0.1 : 0);
    pInt = fire ? 0 : blzClamp(pInt, 0.04, 0.35);
    const roll = Math.random();
    if (roll < pInt) { blzPick6(def); return; }
    if (oIn && roll < pInt + 0.22) { blzCaught(off); return; }
    if (Math.random() < 0.38) { blzTip(); return; }      // it pops up: anybody's ball
    done(def.jumpT > 0 ? 'SWATTED!' : 'BROKEN UP');
    return;
  }
  // the receiver's ball. In his hands it's a catch; at the fingertips, in traffic, it's a coin.
  const edge = blzClamp((dO - 0.6) / Math.max(0.3, reachO(off) - 0.6), 0, 1);
  const contested = dIn && dD < 1.6;
  let pc = 0.97 - edge * 0.32 - (1 - off.hands) * 0.25;
  if (contested) pc -= 0.22 + (def.jumpT > 0 ? 0.12 : 0) - (off.jumpT > 0 ? 0.08 : 0);
  if (B.bullet && dO < 0.5) pc -= 0.04;         // a little hot
  if (fire) pc += 0.2;
  if (Math.random() < blzClamp(pc, 0.15, 0.99)) { blzCaught(off); return; }
  if (contested && !fire && Math.random() < (0.1 + def.hands * 0.08) * (B.bullet ? 0.8 : 1)) { blzPick6(def); return; }
  if (Math.random() < (contested ? 0.3 : 0.18)) { blzTip(); return; }   // off his hands and up in the air
  done(contested ? 'BROKEN UP' : edge > 0.6 ? 'JUST OUT OF REACH' : 'DROPPED');
}

// THE TIP: off a hand, up in the air, and whoever's under it when it comes down
function blzTip() {
  const B = blitz.ball;
  B.st = 'air'; B.kind = 'tip';
  B.x0 = B.x; B.z0 = B.z; B.y0 = 2.0;
  B.tx = blzClamp(B.x + blzRnd(-2.8, 2.8), 0.5, BLZ_WID - 0.5); B.tz = B.z + blzRnd(-2.8, 2.8); B.ty = 1.4;
  B.t = 0; B.T = 0.72; B.peak = 2.4;
  blzEv('tip');
  blzFeed('TIPPED!', '#ffcf8a');
  if (Math.random() < 0.6) blzSay(blzPick(['it\'s tipped!', 'up for grabs!']));
}
function blzTipResolve() {
  const B = blitz.ball, team = B.from ? B.from.team : blitz.poss;
  let best = null, bd = 1.7;
  for (const p of blitz.players) {
    if (p.downT > 0 || p.scr || (p.team === team && !BLZ_ELIG[p.pos])) continue;
    const d = Math.hypot(p.x - B.x, p.z - B.z) - (p.jumpT > 0 ? 0.5 : 0) - (p.diveT > 0 ? 0.7 : 0);
    if (d < bd) { bd = d; best = p; }
  }
  if (best && Math.random() < 0.62) { if (best.team === team) blzCaught(best); else blzPick6(best); return; }
  blzFeed('INCOMPLETE', '#bfc6ff'); blzWhistle('inc', {});
}
function blzCaught(r) {
  blzEv('comp' + r.team);
  blzGiveBall(r, 'catch');
  const team = r.team, F = blitz.fire[team];
  const same = F.last === r.pos;
  if (same) F.n++; else { F.last = r.pos; F.n = 1; }
  // the same man three times running still sets him alight, like the cart
  blzHype(team, 0.04 + (same ? 0.11 : 0) + (r.diveT > 0 ? 0.06 : 0), r, 'catch');
  blitz.fire[1 - team].stops = 0;
  const B = blitz.ball, far = B && B.x0 != null ? Math.hypot(B.x0 - r.x, B.z0 - r.z) : 0;
  if (r.diveT > 0) blzColor(BLZ_COLOR.dive, 0.7);
  else if (far > 18) { blzColor(BLZ_COLOR.grab, 0.55); if (Math.random() < 0.45) blzSpeak(blzCallName(r) + ' WITH THE CATCH!', { who: 'pbp', prio: 1, maxAge: 1.2 }); }
}
function blzPick6(def) {
  blzEv('int' + def.team);
  blzGiveBall(def, 'int');
  blitz.stats && blzHuman(def.team) && blitz.stats.ints++;
  blzBanner('INTERCEPTED!', '#ff8a3a', '', 1.2);
  blzSay(blzPick(BLZ_CALLS.int), true);
  blzRoar(1, 2);
  if (blzHuman(def.team)) blzEarn(10, 'INTERCEPTION');
  blitz.fire[1 - def.team].n = 0;
  blzHype(def.team, 0.25, null, 'int');
  blzSting('int'); blzColor(BLZ_COLOR.int, 0.6);
  blzCheer(def.team, 2.2);
  blzCrowdSay(blzHuman(def.team) ? 'yeah' : 'aww');
}

// HYPE (NBA Jam's heating-up, NFL Street's style points, Blitz: The League's
// unleash): every big play, hit, stop, taunt and showboat fills it; full = ON
// FIRE. The other side scoring empties it. A fumble while showboating empties it too.
function blzHype(team, amt, who, src) {
  if (!amt || blitz.phase === 'final' || !blitz.stats) return;
  if (blzOnFire(team) && amt > 0) return;
  if (src) { const H = blitz.stats.hy || (blitz.stats.hy = {}); H[src] = (H[src] || 0) + amt; }
  const h0 = blitz.hype[team];
  const h = blitz.hype[team] = blzClamp(h0 + amt, 0, 1);
  if (h < 0.4) blitz.heatSaid[team] = false;
  if (h0 < 0.6 && h >= 0.6 && h < 1 && !blitz.heatSaid[team]) {
    blitz.heatSaid[team] = true;
    const off = who && BLZ_ELIG[who.pos];
    blzPBP(off ? BLZ_CALLS.heat : BLZ_CALLS.dheat, 1);
    blzSting('heat');
    if (blzHuman(team)) blzFeed((off ? who.name.split(' ').slice(-1)[0] + ' IS' : 'D IS') + ' HEATING UP', '#ff9a3a');
  }
  if (h >= 1 && !blzOnFire(team)) blzIgnite(team, who);
}
function blzIgnite(team, who) {
  const F = blitz.fire[team];
  F.on = true; F.plays = 0;
  blitz.hype[team] = 1;
  blzEv('fire' + team);
  blitz.stats && blzHuman(team) && blitz.stats.fires++;
  const off = who && BLZ_ELIG[who.pos];
  blzBanner(off ? "HE'S ON FIRE!" : 'DEFENSE ON FIRE!', '#ff6a1a', off ? who.name : 'UNLIMITED TURBO', 1.8);
  blzSay(off ? BLZ_CALLS.fire[0] : BLZ_CALLS.dfire[0], true);
  blzColor(BLZ_COLOR.fire, 0.6);
  blzSfx('fire'); blzSting('fire'); blzRoar(1, 2.5);
  blitz.flashT = Math.max(blitz.flashT, 1.5);
  if (blzHuman(team)) blzEarn(12, 'ON FIRE');
}
function blzDouse(team) {
  const F = blitz.fire[team];
  if (F.on) blzFeed(blzTeam(team).name + ' COOLED OFF', '#9aa4c8');
  F.on = false; F.n = 0; F.stops = 0; F.last = null;
  blitz.hype[team] = 0; blitz.heatSaid[team] = false;
}

// a kick or punt comes down
function blzKickArrive() {
  const B = blitz.ball, R = blitz.returner;
  const recv = blitz.kind === 'punt' ? 1 - blitz.poss : blitz.poss;
  // a punt that lands past the goal line is a touchback, whoever's under it
  if (blitz.kind === 'punt' && (B.tz - blzOwnGoal(recv)) * blzDir(recv) < 0) {
    blzWhistle('touchback', { team: recv });
    return;
  }
  if (R && R.downT <= 0 && Math.hypot(R.x - B.x, R.z - B.z) < 2.6 && Math.random() < 0.975) {
    blzGiveBall(R, 'return');
    // the CPU kneels a deep one; you can too (just don't move, and the whistle finds you)
    if (blitz.ezCatch && !blzHuman(R.team) && (blzOwnGoal(R.team) - R.z) * blzDir(R.team) > 4) blzWhistle('touchback', { team: R.team });
    return;
  }
  // muffed / nobody home: it bounces, and anybody can have it
  B.st = 'loose'; B.kind = 'muff'; B.looseT = 0;
  B.x = B.tx; B.z = B.tz; B.y = 1; B.vx = blzRnd(-2, 2); B.vz = blzDir(1 - recv) * blzRnd(2, 5); B.vy = 3;
  B.lastTeam = recv;
  blzFeed('MUFFED!', '#ff8a3a');
  blzEv('muff'); if (blitz.stats) (blitz.stats.muffs = blitz.stats.muffs || []).push([blitz.kind, R ? +Math.hypot(R.x - B.x, R.z - B.z).toFixed(1) : -1, R ? R.downT.toFixed(1) : '', R ? R.pos + R.team : '']);
}

// ---- the AI ------------------------------------------------------------------------------------
function blzSeek(p, tx, tz, mag) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 0.2) { p.wx = 0; p.wz = 0; return d; }
  const m = Math.min(1, d / 1.0) * (mag == null ? 1 : mag);
  p.wx = dx / d * m; p.wz = dz / d * m;
  return d;
}

function blzThink(p, dt) {
  p.wt = false;
  if (p.downT > 0 || p.diveT > 0) return;
  if (p.react > 0) { p.react -= dt; p.wx = 0; p.wz = 0; return; }
  const B = blitz.ball, C = blitz.carrier, ph = blitz.phase;
  if (ph === 'dead' || ph === 'wait') {
    p.wx *= 0.9; p.wz *= 0.9;
    const Dt = blitz.dead;
    if (Dt && Dt.type === 'td' && Dt.who && p.team === Dt.team && p !== Dt.who && ph === 'dead') {
      const d = blzDist(p, Dt.who);
      if (d > 1.7) { blzSeek(p, Dt.who.x, Dt.who.z, 1); p.wt = true; }
      else if (!p.bumped) { p.bumped = true; p.jumpT = 0.62; p.celebT = 1.2; if (Dt.who.jumpT <= 0 && !Dt.who.air) Dt.who.jumpT = 0.62; }
      return;
    }
    // the CPU knows the whistle is just a noise
    // (one per whistle, and not every whistle — it's a spice, not the meal)
    const D = blitz.dead;
    if (D && !D.cpuLate && D.type !== 'td' && !blzHuman(p.team) && p.lateCd <= 0) {
      const v = D.who;
      if (v && v.team !== p.team && blzDist(p, v) < 3.2 && !v.scr) {
        if (D.lateRoll == null) {
          D.lateRoll = Math.random() < 0.28;
          // most of the CPU's late hits come off the top rope
          const r = Math.random();
          D.lateKind = r < 0.4 ? 'elbow' : r < 0.72 ? 'legdrop' : r < 0.88 ? 'stomp' : 'shove';
        }
        if (D.lateRoll) {
          blzSeek(p, v.x, v.z, 1);
          const dd = blzDist(p, v), top = D.lateKind === 'elbow' || D.lateKind === 'legdrop';
          if (top && v.downT > 0 && dd < 2.8 && dd > 0.9 && p.lateCd <= 0) {
            D.cpuLate = true; p.lateCd = 1.3;
            const M = blzStartMove(D.lateKind, p, v, null); M.a0 = -Math.max(0.6, dd);
            v.downT = Math.max(v.downT, M.T + 0.8);
          } else if (!top && dd < 1.2) { D.cpuLate = true; blzLateHit(p); }
        }
      }
    }
    return;
  }
  if (ph === 'pre') { p.wx = 0; p.wz = 0; return; }
  if (blitz.kind === 'kick' && B.st === 'tee') { blzKickoffAI(p, dt); return; }
  if (B.st === 'loose') { blzLooseAI(p); return; }
  if (p === C) {
    if (blitz.pocket && p.pos === 'QB') blzQBAI(p, dt);
    else blzRunnerAI(p, dt);
    return;
  }
  if (B.st === 'air' && B.kind === 'tip') {
    // everybody near it goes up for it
    const dd = Math.hypot(p.x - B.tx, p.z - B.tz), team = B.from ? B.from.team : blitz.poss;
    if (dd < 7 && (p.team !== team || BLZ_ELIG[p.pos])) {
      blzSeek(p, B.tx, B.tz, 1); p.wt = true;
      if (dd < 2.4 && B.T - B.t < 0.3 && p.jumpT <= 0 && Math.random() < 0.3) p.jumpT = 0.62;
    } else { p.wx *= 0.6; p.wz *= 0.6; }
    return;
  }
  if (B.st === 'air' && B.kind === 'pass') { blzPassAirAI(p, dt); return; }
  if (B.st === 'air' && (B.kind === 'kick' || B.kind === 'punt')) { blzKickAirAI(p, dt); return; }
  if (blitz.kind === 'fg' || blitz.kind === 'pat' || (blitz.kind === 'punt' && !C)) { blzSpecialAI(p, dt); return; }
  if (blitz.pocket && C) { blzRoleAI(p, dt, C); return; }
  if (C) { blzPursuitAI(p, dt, C); return; }
  // lateral in the air etc.
  if (B.st === 'air') {
    if (p.team !== (B.from ? B.from.team : blitz.poss)) blzSeek(p, B.tx, B.tz, 1);
    else if (p === blitz.target) blzSeek(p, B.tx, B.tz, 1);
    p.wt = true;
  }
}

function blzQBAI(qb, dt) {
  const d = blzDir(qb.team), t = blitz.playT;
  const run = blitz.kind === 'run';
  if (run) {
    const rb = blzByPos(qb.team, 'RB');
    if (rb) blzSeek(qb, rb.x, rb.z, 0.8);
    return;
  }
  // drop, then hang in the pocket, sliding away from the nearest rusher
  const dropZ = blitz.los - d * 7.5;
  let nr = null, nd = 99;
  for (const p of blitz.players) if (p.team !== qb.team && p.downT <= 0) { const dd = blzDist(p, qb); if (dd < nd) { nd = dd; nr = p; } }
  if ((qb.z - dropZ) * d > 0.5) blzSeek(qb, qb.x, dropZ, 1);
  else if (nr && nd < 4.5) {
    const ax = qb.x - nr.x, az = qb.z - nr.z, m = Math.hypot(ax, az) || 1;
    qb.wx = ax / m * 0.9; qb.wz = (az / m) * 0.5; qb.wt = nd < 2.5;
  } else { qb.wx = 0; qb.wz = 0; }
  if (qb.team === 0 && blzHuman(0)) return; // (never: the human QB isn't on AI)
  if (t < blitz.nextRead) return;
  blitz.nextRead = t + 0.22;
  const best = blzBestTarget(qb);
  if (!best) return;
  const pat = blitz.qbPatience * (0.85 + 0.3 * (blitz.cfg.smart || 1) * (qb.team === 1 ? 1 : 0.8));
  const pressure = nd < 2.2;
  if (t > 3.6 * pat && !blitz.saidPress) { blitz.saidPress = true; blzSay(blzPick(BLZ_CALLS.pressure)); }
  if (best.open > 3.2 || (pressure && best.open > 1.6 && t > 0.9) || t > 4.2 * pat) {
    if (best.open < 0.9 && t < 5.5 * pat && !pressure) return;
    const bd = blzDist(qb, best.r);
    blzThrow(qb, best.r, best.open < 3 && bd < 22 ? 'bullet' : bd > 26 ? 'lob' : 'touch');
  }
}

function blzRunnerAI(p, dt) {
  const d = blzDir(p.team);
  let wx = 0, wz = d * 1.0;
  let near = 99;
  for (const q of blitz.players) {
    if (q.team === p.team || q.downT > 0) continue;
    const dx = p.x - q.x, dz = p.z - q.z, dd = Math.hypot(dx, dz);
    if (dd > 8) continue;
    near = Math.min(near, dd);
    // threats in front matter most; steer laterally away
    const ahead = (q.z - p.z) * d;
    const w = (ahead > -1 ? 1.4 : 0.5) / Math.max(0.6, dd * dd) * 4;
    wx += (dx / (dd || 1)) * w;
    wz += (dz / (dd || 1)) * w * 0.35;
  }
  if (p.x < 4) wx += (4 - p.x) * 0.4;
  if (p.x > BLZ_WID - 4) wx -= (p.x - (BLZ_WID - 4)) * 0.4;
  if (wz * d < 0.25) wz = d * 0.25; // never run backwards for long
  const m = Math.hypot(wx, wz) || 1;
  p.wx = wx / m; p.wz = wz / m;
  p.wt = near < 7 || p.turbo > 0.6;
  // moves
  if (near < 1.8 && p.spinCd <= 0 && Math.random() < dt * 3) {
    if (Math.random() < 0.5) { p.spinT = 0.5; p.spinCd = 1.2; } else { p.stiffT = 0.45; p.spinCd = 1.0; }
  }
  for (const q of blitz.players) {
    if (q.team !== p.team && q.diveT > 0 && blzDist(p, q) < 2.6 && p.jumpT <= 0 && Math.random() < 0.5) p.jumpT = 0.62;
  }
}

function blzRoleAI(p, dt, C) {
  const off = blitz.poss, d = blzDir(off);
  const qb = C;
  if (p.team === off) {
    if (p.runBlock && blitz.playT > 0.9) p.block = true;
    if (p.block) {
      if (p.eng) return;
      // pass pro: get between your man (or the nearest free rusher) and the ball
      let m = p.man;
      if (!m || m.eng || m.downT > 0) m = blzThreatTo(p, qb);
      if (m) {
        const tx = m.x + (qb.x - m.x) * 0.25, tz = m.z + (qb.z - m.z) * 0.25;
        blzSeek(p, tx, tz, 0.95);
      } else { p.wx = 0; p.wz = 0; }
      return;
    }
    if (p.route) {
      blzRunRoute(p);
      return;
    }
    p.wx = 0; p.wz = 0;
    return;
  }
  // defense
  const role = p.role;
  if (role === 'rush') {
    if (p.eng) return;
    blzSeek(p, qb.x + qb.vx * 0.3, qb.z + qb.vz * 0.3, 1);
    p.wt = blzDist(p, qb) < 9;
    if (blzDist(p, qb) < 2.6 && !blzHuman(p.team) && Math.random() < dt * 2) blzDive(p);
    return;
  }
  if (role === 'man' && p.man) {
    const r = p.man;
    // trail a step behind and a step deep; turbo to keep up
    const lag = 0.2 * (blitz.cfg.smart || 1);
    const tx = r.x + r.vx * lag, tz = r.z + r.vz * lag + d * 1.1;
    blzSeek(p, tx, tz, 1);
    p.wt = blzDist(p, r) > 2.2;
    return;
  }
  if (role === 'spy') {
    blzSeek(p, qb.x, blitz.los + d * 4, 1);
    if (Math.abs(qb.z - blitz.los) < 2 || (qb.z - blitz.los) * d > 0) blzSeek(p, qb.x, qb.z, 1);
    return;
  }
  if (role === 'zone' || role === 'deep') {
    // sit in the zone; shade to whoever wanders into it
    let tx = p.zx, tz = p.zz, best = null, bd = role === 'deep' ? 11 : 8;
    for (const r of blzPlayersOf(off)) {
      if (!BLZ_ELIG[r.pos]) continue;
      const dd = Math.hypot(r.x - p.zx, r.z - p.zz);
      if (dd < bd) { bd = dd; best = r; }
    }
    if (best) {
      tx = p.zx + (best.x - p.zx) * 0.7; tz = p.zz + (best.z - p.zz) * 0.7;
      if (role === 'deep') tz = blitz.los + d * Math.max((tz - blitz.los) * d, (best.z - blitz.los) * d + 2.5);
    }
    blzSeek(p, tx, tz, 1);
    p.wt = role === 'deep' && best && (best.z - p.z) * d > -2;
  }
}

function blzThreatTo(o, qb) {
  let best = null, bd = 9;
  for (const p of blitz.players) {
    if (p.team === o.team || p.eng || p.downT > 0) continue;
    const d = blzDist(p, qb);
    if (d < bd && blzDist(p, o) < 7) { bd = d; best = p; }
  }
  return best;
}

function blzRunRoute(p) {
  if (!p.route) return;
  if (p.ri < p.route.length) {
    const w = p.route[p.ri];
    const d = blzSeek(p, w[0], w[1], 1);
    if (d < 0.9) {
      p.ox = p.wx; p.oz = p.wz;
      p.ri++;
    }
    // stay in the field
    if (p.x < 1.5 && p.wx < 0) p.wx = 0;
    if (p.x > BLZ_WID - 1.5 && p.wx > 0) p.wx = 0;
  } else {
    const m = Math.hypot(p.ox, p.oz) || 1;
    p.wx = p.ox / m; p.wz = p.oz / m;
    if (p.x < 2 || p.x > BLZ_WID - 2) { p.wx = 0; p.wz = blzDir(p.team); }
    // a curl or hook settles where it ended
    const last = p.route[p.route.length - 1], prev = p.route[p.route.length - 2];
    if (prev && (last[1] - prev[1]) * blzDir(p.team) < 0) { p.wx = 0; p.wz = 0; }
  }
}

function blzPassAirAI(p, dt) {
  const B = blitz.ball, team = B.from ? B.from.team : blitz.poss;
  if (p.team === team) {
    if (p === blitz.target) {
      blzSeek(p, B.tx, B.tz, 1); p.wt = true;
      const left = B.T - B.t, dl = Math.hypot(p.x - B.tx, p.z - B.tz);
      if (left < 0.4) p.catchT = 0.3;
      // just out of reach and arriving: lay out
      if (left < 0.3 && dl > 1.35 && dl < 3.0 && p.diveT <= 0 && p.jumpT <= 0 && Math.random() < 0.55) blzDiveTo(p, B.tx, B.tz);
    }
    else if (p.route) blzRunRoute(p);
    else if (p.eng) return;
    else { p.wx *= 0.5; p.wz *= 0.5; }
    return;
  }
  if (p.eng) return;
  // defenders break on the ball once they read it
  const dl = Math.hypot(p.x - B.tx, p.z - B.tz);
  if (B.t < 0.18 + (p.team === 1 ? (1 - (blitz.cfg.smart || 1)) * 0.25 : 0)) { blzRoleAI(p, dt, B.from || p); return; }
  if (dl < 22 || p.role === 'man' || p.role === 'deep') {
    const timeLeft = B.T - B.t, u = B.t / B.T;
    // nobody knows where it's coming down: early in the flight you stay on the
    // man it's going to (or your own man); the last part of it, you go get the ball
    const r = blitz.target, mine = p.role === 'man' && p.man ? p.man : r;
    if (u < 0.55 && mine && dl > 2.5) blzSeek(p, mine.x + mine.vx * 0.25, mine.z + mine.vz * 0.25, 1);
    else blzSeek(p, B.tx, B.tz, 1);
    p.wt = true;
    if (!blzHuman(p.team) && dl < 2.2 && timeLeft < 0.35 && p.jumpT <= 0 && Math.random() < 0.5) p.jumpT = 0.62;
  } else if (B.from) blzSeek(p, B.from.x, B.from.z, 0.4);
}

function blzKickoffAI(p, dt) {
  // the kicker approaches the tee; everyone else waits on their marks
  if (p.role === 'kicker' && !blitz.kickWait) {
    const B = blitz.ball;
    blzSeek(p, B.x, B.z - blzDir(p.team) * 0.5, 0.75);
  } else { p.wx = 0; p.wz = 0; }
}

function blzKickAirAI(p, dt) {
  const B = blitz.ball, recv = blitz.kind === 'punt' ? 1 - blitz.poss : blitz.poss;
  if (p === blitz.returner) { blzSeek(p, B.tx, B.tz, 1); p.wt = true; return; }
  if (p.team === recv) {
    if (p.eng) return;
    // set up a wall in front of the landing spot
    const k = blzNearestTo(1 - recv, { x: B.tx, z: B.tz }, (q) => !q.eng && q.downT <= 0 && q !== blitz.returner);
    if (k) blzSeek(p, k.x + (B.tx - k.x) * 0.35, k.z + (B.tz - k.z) * 0.35, 0.9);
    p.block = true;
    return;
  }
  if (p.role === 'kicker' || p.role === 'punter') { blzSeek(p, B.tx, B.tz, 0.5); return; }
  // coverage: sprint down your lane, converge late
  const lane = p.zx || p.x;
  const tz = B.tz, u = Math.min(1, B.t / B.T);
  blzSeek(p, lane + (B.tx - lane) * (0.3 + u * 0.6), tz, 1);
  p.wt = true;
}

function blzSpecialAI(p, dt) {
  const off = blitz.poss, d = blzDir(off);
  if (p.team === off) {
    if (p.block && !p.eng) { const m = blzThreatTo(p, blitz.ball); if (m) blzSeek(p, m.x, m.z, 0.8); else { p.wx = 0; p.wz = 0; } }
    else if (p.role === 'kicker' && blitz.fg && !blitz.fg.kicked && blitz.playT > 0.55) blzSeek(p, blitz.ballX, blitz.los - d * 7, 0.6);
    else if (blitz.kind === 'punt' && p.pos.startsWith('WR') && blitz.playT > 0.4) { blzSeek(p, p.x, p.z + d * 20, 1); p.wt = true; }
    else { p.wx = 0; p.wz = 0; }
    return;
  }
  if (p.role === 'returner' || p.role === 'wall') { p.wx = 0; p.wz = 0; return; }
  if (p.eng) return;
  const B = blitz.ball;
  blzSeek(p, B.x, B.z, 1); p.wt = true;
}

function blzPursuitAI(p, dt, C) {
  if (p.team === C.team) {
    // escort: pick off the nearest chaser between the ball and the goal
    if (p.eng) return;
    const d = blzDir(C.team);
    let best = null, bs = 1e9;
    for (const q of blitz.players) {
      if (q.team === p.team || q.downT > 0 || q.eng) continue;
      const dc = blzDist(q, C);
      if (dc > 14) continue;
      const sc = dc + blzDist(q, p) * 0.7 - Math.max(0, (q.z - C.z) * d) * 0.4;
      if (sc < bs) { bs = sc; best = q; }
    }
    p.block = true;
    if (best) blzSeek(p, best.x + (C.x - best.x) * 0.3, best.z + (C.z - best.z) * 0.3, 1);
    else blzSeek(p, C.x + (p.x > C.x ? 4 : -4), C.z + d * 6, 0.9);
    p.wt = blzDist(p, C) < 12;
    return;
  }
  if (p.eng) return;
  // take the angle: the first point on his line you can get to in time
  // (each pursuer a touch different, so they don't all arrive as one lump)
  const dist = blzDist(p, C);
  const mySp = p.spd * (p.turbo > 0.1 || blzOnFire(p.team) ? 1.3 : 1) * (0.9 + 0.1 * (blitz.cfg.smart || 1));
  let lead = 0;
  for (let t = 0; t <= 2.6; t += 0.1) {
    lead = t;
    if (Math.hypot(C.x + C.vx * t - p.x, C.z + C.vz * t - p.z) <= mySp * t + 0.6) break;
  }
  const lane = ((BLZ_DEF_POS.indexOf(p.pos) + BLZ_OFF_POS.indexOf(p.pos) + 3) % 5 - 2) * Math.min(1.2, dist * 0.08);
  blzSeek(p, C.x + C.vx * lead + lane, C.z + C.vz * lead, 1);
  p.wt = dist < 16;
  if (!blzHuman(p.team) && dist < 2.3 && dist > 1.0 && C.y < 0.3 && Math.random() < dt * 2.2 * (blitz.cfg.smart || 1)) blzDive(p);
}

function blzLooseAI(p) {
  const B = blitz.ball;
  const d = Math.hypot(p.x - B.x, p.z - B.z);
  // everyone close dives in; from far away, your team's two nearest still go
  let rank = 0;
  for (const q of blitz.players) if (q.team === p.team && q !== p && Math.hypot(q.x - B.x, q.z - B.z) < d) rank++;
  if (d < 16 || rank < 2) { blzSeek(p, B.x + B.vx * 0.3, B.z + B.vz * 0.3, 1); p.wt = true; }
  else { p.wx *= 0.5; p.wz *= 0.5; }
  // a fumble on the turf: somebody always dives for it
  if (d < 2.6 && d > 0.7 && B.y < 1 && p.diveT <= 0 && !blzHuman(p.team) && Math.random() < 0.06) blzDiveTo(p, B.x + B.vx * 0.15, B.z + B.vz * 0.15);
}

// ---- the human --------------------------------------------------------------------------------
function blzHumanControl(p, dt) {
  const w = blzStickWorld();
  p.wx = w.x; p.wz = w.z; p.wt = blzTurboHeld();
  const ph = blitz.phase;
  if (ph === 'pre') {
    // defenders can creep around before the snap (but stay onside); the offense holds still
    if (p.team === blitz.poss) { p.wx = 0; p.wz = 0; p.wt = false; return; }
    const d = blzDir(blitz.poss);
    if ((p.z - blitz.los) * d < 1 && p.wz * d < 0) p.wz = 0;
    return;
  }
  // the QB's eyes follow the stick
  if (p === blitz.carrier && blitz.pocket && p.pos === 'QB') {
    blitz.target = blitz.charge ? blitz.charge.r : (blzAimTarget(p) || blitz.target);
  }
  // a receiver you aren't steering homes on the ball (assist)
  const B = blitz.ball;
  if (B.st === 'air' && B.kind === 'pass' && p === blitz.target) {
    if (w.m < 0.2) blzSeek(p, B.tx, B.tz, 1);
    if (B.T - B.t < 0.4) p.catchT = 0.3;
  }
  // the QB under center takes the snap and his first steps back no matter what
  // (pushing UP at the snap used to run him through his own center and lose the
  // pass); after that the drop continues unless you steer him
  if (p === blitz.carrier && blitz.pocket && p.pos === 'QB' && blitz.kind === 'pass' && (blitz.playT < 0.6 || (blitz.playT < 0.95 && w.m < 0.2))) {
    const d = blzDir(p.team), dz = blitz.los - d * 6.2;
    if ((p.z - dz) * d > 0.3) { const sx = blitz.playT < 0.6 ? p.wx * 0.6 : 0; blzSeek(p, p.x + sx, dz, 1); }
  }
  // the returner fields it himself (as in the original) — you get him after the catch
  if ((B.st === 'air' || B.st === 'tee' || (blitz.kind === 'punt' && !blitz.carrier && B.st === 'held')) && p === blitz.returner) {
    if (B.st === 'air') blzSeek(p, B.tx, B.tz, 1); else { p.wx = 0; p.wz = 0; }
    p.wt = B.st === 'air';
  }
  // a run play: the back rides his path until he has the ball, unless you steer
  if (blitz.kind === 'run' && blitz.pocket && p.pos === 'RB' && w.m < 0.2) blzRunRoute(p);
}

// ---- physics ------------------------------------------------------------------------------------
function blzMove(p, dt) {
  if (p.tryCd > 0) p.tryCd -= dt;
  if (p.lateCd > 0) p.lateCd -= dt;
  if (p.noEngT > 0) p.noEngT -= dt;
  if (p.spinCd > 0) p.spinCd -= dt;
  if (p.celebT > 0) p.celebT -= dt;
  if (p.throwT > 0) p.throwT -= dt;
  if (p.catchT > 0) p.catchT -= dt;
  if (p.pumpCd > 0) p.pumpCd -= dt;
  if (p.secureT > 0) p.secureT -= dt;
  if (p.hitCd > 0) p.hitCd -= dt;
  if (p.lungeT > 0 && p.downT <= 0 && !p.air) {
    // the hit-stick lunge: committed, straight, at turbo
    p.lungeT -= dt; p.turboOn = true;
    p.x += p.vx * dt; p.z += p.vz * dt;
    if (p.lungeT <= 0) p.stunT = Math.max(p.stunT, 0.25);   // a whiff costs you a beat
    return;
  }
  if (p.air) {
    // launched: ballistic and tumbling until the turf catches him
    p.vy -= 24 * dt; p.y += p.vy * dt; p.flipA += p.flipV * dt;
    p.x += p.vx * dt; p.z += p.vz * dt;
    if (p.y <= 0) {
      p.y = 0; p.air = false; p.vx *= 0.3; p.vz *= 0.3;
      if (p.backflip) { p.backflip = false; p.flipA = 0; p.downT = 0; p.celebT = Math.max(p.celebT, 0.9); blzRoar(0.8, 1); }
      else { p.downT = Math.max(p.downT, 1.05); blzBurst(p.x, p.z, 0.2, 8, '#d8c8a0'); blzSfx('hit'); }
    }
    return;
  }
  if (p.downT > 0) {
    p.downT -= dt;
    p.vx *= Math.max(0, 1 - dt * 5); p.vz *= Math.max(0, 1 - dt * 5);
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.y = Math.max(0, p.y - dt * 4);
    if (p.downT <= 0) p.lieBack = false;
    return;
  }
  if (p.diveT > 0) {
    p.diveT -= dt;
    p.x += p.vx * dt; p.z += p.vz * dt;
    if (p.diveT <= 0) { p.downT = 0.75; p.vx *= 0.3; p.vz *= 0.3; }
    return;
  }
  const human = p === blitz.ctl && blzHuman(p.team);
  let sp = p.spd;
  // turbo: the human spends the team meter; the CPU spends its own legs
  const fire = blzOnFire(p.team) || (blitz.codes.inf && p.team === 0);
  const moving = Math.hypot(p.wx, p.wz) > 0.2;
  let tOn = false;
  if (p.wt && moving) {
    if (human) { if (fire || blitz.turbo[0] > 0.02) { tOn = true; if (!fire) blitz.turbo[0] = Math.max(0, blitz.turbo[0] - dt * (blitz.codes.inf ? 0 : 0.36)); } }
    else if (fire || p.turbo > 0.05) { tOn = true; if (!fire) p.turbo = Math.max(0, p.turbo - dt * 0.4); }
  }
  if (!tOn) { if (human) blitz.turbo[0] = Math.min(1, blitz.turbo[0] + dt * 0.22); else p.turbo = Math.min(1, p.turbo + dt * 0.25); }
  p.turboOn = tOn;
  if (tOn) sp *= 1.36;
  if (fire) sp *= 1.06;
  if (blitz.codes.speed) sp *= 1.1;
  if (p.eng) sp *= 0.12;
  if (p.stunT > 0) { p.stunT -= dt; sp *= 0.45; }
  if (p.spinT > 0) { p.spinT -= dt; sp *= 0.85; }
  if (p.stiffT > 0) p.stiffT -= dt;
  if (p === blitz.carrier) sp *= p.showboat ? 0.88 : 0.95;
  if (blitz.phase === 'dead' || blitz.phase === 'wait') sp *= human ? 0.8 : 0.4;
  // the rubber band (Blitz always had one): the CPU finds a gear when it's losing
  if (!blitz.codes.noassist && p.team === 1 && !blitz.auto) {
    const diff = blitz.score[0] - blitz.score[1];
    if (diff >= 10) sp *= 1.04; else if (diff <= -14) sp *= 0.97;
  }
  const tvx = p.wx * sp, tvz = p.wz * sp;
  const a = Math.min(1, (p.jumpT > 0 ? 1.5 : 9) * dt);
  p.vx += (tvx - p.vx) * a; p.vz += (tvz - p.vz) * a;
  p.x += p.vx * dt; p.z += p.vz * dt;
  const v = Math.hypot(p.vx, p.vz);
  // where he looks: a QB in the pocket at his receiver, a zone defender squared
  // up to the QB (backpedaling), everybody else where he's running
  let tfx = 0, tfz = 0;
  const Cc = blitz.carrier;
  if (p === Cc && blitz.pocket && p.pos === 'QB' && blitz.kind === 'pass') {
    const t = blitz.target;
    if (t) { tfx = t.x - p.x; tfz = t.z - p.z; } else { tfx = 0; tfz = blzDir(p.team); }
  } else if (blitz.pocket && Cc && p.team !== Cc.team && (p.role === 'zone' || p.role === 'deep' || p.role === 'spy') && v < 7.5) {
    tfx = Cc.x - p.x; tfz = Cc.z - p.z;
  } else if (v > 0.6) { tfx = p.vx; tfz = p.vz; }
  const tm = Math.hypot(tfx, tfz);
  if (tm > 0.01 && blitz.phase !== 'pre') {
    const kf = Math.min(1, dt * 12);
    p.fx += (tfx / tm - p.fx) * kf; p.fz += (tfz / tm - p.fz) * kf;
    const m = Math.hypot(p.fx, p.fz) || 1; p.fx /= m; p.fz /= m;
  }
  // backpedaling runs the legs the other way
  const back = v > 0.6 && (p.vx * p.fx + p.vz * p.fz) < -0.3 * v;
  p.anim += (back ? -1 : 1) * v * dt * 1.5;
  if (p.jumpT > 0) {
    p.jumpT -= dt;
    const u = 1 - p.jumpT / 0.62;
    p.y = p.jumpT > 0 ? Math.sin(Math.PI * u) * 1.25 : 0;
    if (p.jumpT <= 0 && p.dropOn) blzElbowLand(p);
  } else p.y = 0;
  // the stands are not in play (for anyone but the ball carrier, who just goes out)
  if (p !== blitz.carrier) { p.x = blzClamp(p.x, -3, BLZ_WID + 3); p.z = blzClamp(p.z, -2, BLZ_LEN + 2); }
}

// ---- blocking -----------------------------------------------------------------------------------
function blzBlocks(dt) {
  const C = blitz.carrier;
  for (const p of blitz.players) {
    if (!p.eng) continue;
    const q = p.eng;
    if (q.eng !== p || q.downT > 0 || p.downT > 0 || q === C || p === C) { p.eng = null; if (q.eng === p) q.eng = null; continue; }
    // the pair leans toward the rusher's goal; the rusher works to shed
    if (p.engBlk) continue; // process each pair once, from the side being blocked
    const defSide = p, blk = q;
    let rate = 1;
    if (defSide === blitz.ctl && blzHuman(defSide.team) && blzTurboHeld()) rate = 2.6;
    if (blzOnFire(defSide.team)) rate *= 1.8;
    defSide.shedT -= dt * rate;
    const want = Math.hypot(defSide.wx, defSide.wz);
    const push = 1.2 * Math.min(1, want + 0.3) * (defSide.str / Math.max(0.5, blk.str));
    const ux = defSide.wx / (want || 1), uz = defSide.wz / (want || 1);
    defSide.x += ux * push * dt; defSide.z += uz * push * dt;
    const dx = blk.x - defSide.x, dz = blk.z - defSide.z, dd = Math.hypot(dx, dz) || 1;
    blk.x = defSide.x + dx / dd * 0.95; blk.z = defSide.z + dz / dd * 0.95;
    blk.vx = defSide.vx = ux * push; blk.vz = defSide.vz = uz * push;
    if (defSide.shedT <= 0) {
      defSide.eng = null; blk.eng = null;
      blk.noEngT = 1.3; blk.stunT = 0.35;
      // a shed can leave the blocker on the turf
      if (Math.random() < 0.25) blk.downT = 0.8;
    }
  }
  // new engagements
  for (const o of blitz.players) {
    if (!o.block || o.eng || o.noEngT > 0 || o.downT > 0 || o.scr || o === C) continue;
    for (const q of blitz.players) {
      if (q.team === o.team || q.eng || q.downT > 0 || q.diveT > 0 || q.scr || q === C) continue;
      if (Math.hypot(q.x - o.x, q.z - o.z) > 1.15) continue;
      // in coverage before the throw, receivers aren't blocked
      if (blitz.pocket && blitz.kind === 'pass' && (q.role === 'man' || q.role === 'zone' || q.role === 'deep')) continue;
      o.eng = q; q.eng = o; o.engBlk = true; q.engBlk = false;
      const lineman = q.pos === 'DE1' || q.pos === 'DT' || q.pos === 'DE2';
      let base = blitz.pocket ? (lineman ? 1.62 : 0.7) : (blitz.kind === 'kick' || blitz.kind === 'punt' ? 0.65 : 0.8);
      base *= blzClamp(o.str / q.str, 0.6, 1.6) * blzRnd(0.75, 1.25);
      q.shedT = base;
      break;
    }
  }
}

// ---- tackling ------------------------------------------------------------------------------------
function blzTackles(dt) {
  const C = blitz.carrier;
  if (!C || C.downT > 0) return;
  for (const q of blitz.players) {
    if (q.team === C.team || q.downT > 0 || q.tryCd > 0) continue;
    const d = Math.hypot(q.x - C.x, q.z - C.z);
    const reach = q.diveT > 0 ? 1.45 : q.eng ? 0.75 : 1.0;
    if (d > reach) continue;
    q.tryCd = 0.45;
    // a hurdle clears a dive
    if (C.y > 0.55 && q.diveT > 0) { blzFeed('HURDLED!', '#bfe8ff'); blzSay(blzPick(BLZ_CALLS.hurdle)); continue; }
    if (C.stiffT > 0 && q.diveT <= 0 && Math.random() < 0.7) {
      q.downT = 1.0; q.vx = C.fx * 4; q.vz = C.fz * 4;
      blzFeed('STIFF ARM!', '#bfe8ff'); blzSfx('hit');
      if (Math.random() < 0.4) blzSay(blzPick(BLZ_CALLS.stiff));
      continue;
    }
    // a MONSTER HIT is a turbo collision that's actually closing on him
    const close = d > 0.01 ? ((q.vx - C.vx) * (C.x - q.x) + (q.vz - C.vz) * (C.z - q.z)) / d : 0;
    const big = q.turboOn && close > 7.6;
    let p = 0.6 + (q.str - C.str) * 0.38;
    if (q.diveT > 0) p = 0.84;
    if (big) p = 0.9;
    if (q.eng) p *= 0.5;
    if (C.spinT > 0) p *= 0.18;
    if (blzOnFire(C.team)) p *= 0.75;
    if (blzOnFire(q.team)) p = Math.min(0.97, p * 1.2);
    // the band: a leading CPU ballcarrier gets a little slipperier the other way
    if (!blitz.codes.noassist && !blitz.auto) {
      const diff = blitz.score[0] - blitz.score[1];
      if (C.team === 1 && diff >= 10) p *= 0.9;
      if (C.team === 0 && diff <= -14) p *= 0.92;
    }
    if (Math.random() < blzClamp(p, 0.06, 0.97)) { blzTackle(C, q, big); return; }
    // broken tackle
    q.stunT = 0.6;
    if (Math.random() < 0.5) q.downT = 0.6;
    C.stunT = 0.3;
    blzFeed(C.spinT > 0 ? 'SPIN MOVE!' : 'BROKEN TACKLE!', '#bfe8ff');
    if (C.spinT > 0 && Math.random() < 0.4) blzSay(blzPick(BLZ_CALLS.spin));
  }
}

function blzTackle(C, q, big) {
  if (big) blzEv('big');
  const d = blzDir(C.team);
  const qs = Math.hypot(q.vx, q.vz) || 1;
  const sack = C.pos === 'QB' && blitz.kind === 'pass' && !blitz.thrown && blitz.pocket;
  const behind = (C.z - blitz.los) * d < 0;
  C.downT = 1.4;
  // hit from the front, he goes down on his back; from behind, on his face
  C.lieBack = (q.vx * C.fx + q.vz * C.fz) / qs < 0;
  // fumbles happen on big hits (and the occasional blindside) — and they stay live.
  // Showboating quadruples it (and a showboat fumble costs you every bit of hype).
  const fumP = (big ? (sack ? 0.07 : 0.035) : 0.006) * (C.showboat ? 4 : 1);
  const fumble = Math.random() < fumP && !blzOnFire(C.team);
  if (fumble && C.showboat) { blitz.hype[C.team] = 0; blzFeed('SHOWBOATED IT AWAY!', '#ff8a3a'); blzColor(BLZ_COLOR.oops, 1); }
  const kind = fumble ? 'launch' : blzPickMove(C, q, big, sack && behind);
  if (kind === 'launch') {
    // MONSTER HIT: airborne, flipping, landing wherever physics says
    const fly = big ? 7.5 : 4;
    C.vx = q.vx / qs * fly; C.vz = q.vz / qs * fly;
    C.air = true; C.vy = blzRnd(7, 9.5); C.y = 0.1;
    C.flipA = 0; C.flipV = (C.lieBack ? -1 : 1) * blzRnd(7, 11);
    blitz.shakeT = 0.32; blitz.shakeMag = 6; blitz.hitStop = 0.09;
    blzSfx('crunch'); blzRoar(0.9, 1.4);
    blzBurst(C.x, C.z, 1.4, 14, '#fff6a8');
    if (blitz.stats && blzHuman(q.team)) { blitz.stats.hits++; blzEarn(2, 'MONSTER HIT'); }
    if (Math.random() < 0.5) blzSay(blzPick(BLZ_CALLS.hit));
    blzColor(BLZ_COLOR.hit, 0.5); blzCrowdSay('oooh');
    blzHype(q.team, 0.06, null, 'launch');
    blitz.flashT = Math.max(blitz.flashT, 1.2);
    blitz.slowT = 0.32;              // the hit cam: a beat of slow motion
    if (blitz.playsSinceReplay >= 2 && Math.random() < 0.5) blitz.replayWant = { why: 'hit', t: blitz.t };
    if (q.diveT <= 0) q.stunT = 0.3;
  } else {
    // a wrestling move: both men come off the sim and the move runs the show
    const frame = kind === 'suplex' || kind === 'trip' ? [C.fx, C.fz] : null;
    blzStartMove(kind, q, C, frame);
  }
  // the dogpile: anybody close dives on top
  for (const o of blitz.players) {
    if (o.team === C.team || o === q || o.scr || o.downT > 0 || o.diveT > 0 || o.eng || o === blitz.ctl) continue;
    const dd = blzDist(o, C);
    if (dd > 1.0 && dd < 3.2 && Math.random() < 0.45) blzDiveTo(o, C.x, C.z);
  }
  if (fumble) { C.downT = 1.2; blzFumble(C, q); return; }
  blzWhistle('tackle', { who: C, by: q, sack: sack && behind, big });
}

// ---- 🤼 THE MOVES ------------------------------------------------------------------------------
// "the tackling is not as brutal or goofy as it was in NFL Blitz" — Chris. The
// cart's tackles were pro wrestling: its lead artist was a wrestling fan who did
// the suplexes himself in the mocap suit. The most common was a defender grabbing
// the carrier, SPINNING him around and FLINGING him to the turf (sometimes for
// extra yards); there was a German suplex, a SPINEBUSTER where he lifts you by the
// facemask and SHAKES you before slamming you spine-first, a neckbreaker, and after
// the whistle elbow drops, leg drops and stomps on whoever was down.
//
// Each move here is a scripted two-man timeline. Both players come off physics
// and AI (p.scr is set), get placed and posed every frame in the move's own frame
// (origin at the contact, D = the direction of the hit, R = its right), and are
// handed back on the turf at the end. The whistle already blew at contact; the
// dead-ball pause stretches to fit the move. blzPose reads p.scr for the pitch /
// roll / drop of the whole body and named arm + leg presets.

const BLZ_MOVES = {
  fling:       { T: 1.3,  hit: 0.88, banner: '', feed: 'SPUN AND FLUNG!', say: ['he spun him around!', 'and he throws him down!'] },
  suplex:      { T: 1.25, hit: 0.7,  banner: 'GERMAN SUPLEX!', say: ['german suplex!', 'oh, the suplex!'] },
  spinebuster: { T: 1.45, hit: 0.8,  banner: 'SPINEBUSTER!', say: ['spinebuster!', 'he picked him up by the face mask!'] },
  neckbreaker: { T: 1.0,  hit: 0.6,  banner: 'NECKBREAKER!', say: ['neckbreaker!'] },
  clothesline: { T: 1.1,  hit: 0.74, banner: 'CLOTHESLINE!', say: ['clothesline!', 'he took his head off!'] },
  spear:       { T: 0.95, hit: 0.32, banner: 'SPEARED!', say: ['speared!', 'monster hit!'] },
  trip:        { T: 0.85, hit: 0.56, banner: '', feed: 'FACEPLANT!', say: [] },
  wrap:        { T: 0.8,  hit: 0.62, banner: '', feed: '', say: [] },
  elbow:       { T: 0.8,  hit: 0.86, banner: 'ELBOW DROP!', say: ['from the top rope!', 'elbow drop!'] },
  legdrop:     { T: 0.85, hit: 0.86, banner: 'LEG DROP!', say: ['leg drop!', 'brother!'] },
  stomp:       { T: 0.55, hit: 0.62, banner: '', feed: 'STOMP!', say: [] },
};
const blzSeg = (u, a, b) => blzClamp((u - a) / (b - a), 0, 1);
const blzEase = (k) => k * k * (3 - 2 * k);

// start move `kind`: a = the one doing it, v = the one it's done to
function blzStartMove(kind, a, v, frameDir) {
  const D = BLZ_MOVES[kind];
  let dx = frameDir ? frameDir[0] : v.x - a.x, dz = frameDir ? frameDir[1] : v.z - a.z;
  const m = Math.hypot(dx, dz);
  if (m < 1e-3) { dx = a.fx; dz = a.fz; } else { dx /= m; dz /= m; }
  const M = {
    kind, t: 0, T: D.T, hit: D.hit, a, v, hitDone: false, ended: false,
    ox: v.x, oz: v.z, dx, dz, rx: dz, rz: -dx,
    ax: a.x, az: a.z, side: Math.random() < 0.5 ? -1 : 1,
    // the victim's facing, expressed in the move's frame
    vfa: v.fx * dx + v.fz * dz, vfs: v.fx * dz - v.fz * dx,
    spd: Math.max(5, Math.hypot(a.vx, a.vz)),
    a0: -Math.max(0.6, m || 1),       // (where the late-hit man jumps from, along D)
  };
  for (const p of [a, v]) { p.eng = null; p.diveT = 0; p.jumpT = 0; p.air = false; p.dropOn = null; p.lungeT = 0; }
  a.scr = { pitch: 0 }; v.scr = { pitch: 0 };
  blzEv('mv_' + kind);
  blitz.anims.push(M);
  if (blitz.phase === 'dead') blitz.deadT = Math.max(blitz.deadT, M.T + 0.5);
  return M;
}
// put a player in the move's frame: along D, along R, height, facing (in frame), and the body
function blzPut(M, p, al, sd, y, fal, fsd, pitch, roll, drop, arms, legs) {
  p.x = M.ox + M.dx * al + M.rx * sd; p.z = M.oz + M.dz * al + M.rz * sd;
  p.y = Math.max(0, y);
  const fx = M.dx * fal + M.rx * fsd, fz = M.dz * fal + M.rz * fsd, fm = Math.hypot(fx, fz) || 1;
  p.fx = fx / fm; p.fz = fz / fm;
  p.vx = 0; p.vz = 0;
  p.scr = { pitch: pitch || 0, roll: roll || 0, drop: drop || 0, arms: arms || null, legs: legs || null };
}
// lying where he fell, for the late-hit victims
function blzLie(M, p) { p.scr = { pitch: p.lieBack ? -1.5 : 1.5, roll: 0, drop: 0.72, arms: 'spread', legs: null }; p.vx = p.vz = 0; }

const BLZ_MOVE_FN = {
  // grab, spin him around one and a quarter times, and let go
  fling(M, u) {
    const a = M.a, v = M.v, sp = M.side;
    if (u < 0.14) {
      const k = blzSeg(u, 0, 0.14);
      blzPut(M, a, -1.0 + 0.3 * k, 0, 0, 1, 0, 0.1, 0, 0, 'grab', null);
      blzPut(M, v, 0, 0, 0, M.vfa, M.vfs, 0, 0, 0, 'flail', 'split');
      return;
    }
    const k = blzSeg(u, 0.14, 0.6), th0 = Math.PI, th = th0 + blzEase(k) * Math.PI * 2.5 * sp;
    const ca = Math.cos(th), sa = Math.sin(th), R = 1.15;
    if (u < 0.6) {
      blzPut(M, a, -0.7 + 0.7 * k, 0, 0, -ca, -sa, 0.05, 0, 0.05, 'grab', 'split');           // the hub, facing his man
      blzPut(M, v, -0.7 + 0.7 * k - ca * R, -sa * R, 0.25 + Math.sin(k * Math.PI) * 0.45, -sa * sp, ca * sp, 0, -1.15 * sp * k, 0, 'flail', 'split');
      M.rel = [-ca * R, -sa * R, -sa * sp, ca * sp];
      return;
    }
    // released along the tangent: tumbling through the air, then the turf
    const r = M.rel, f = blzSeg(u, 0.6, 0.88), dist = 3.4;
    const al = r[0] + r[2] * dist * f, sd = r[1] + r[3] * dist * f;
    if (u < 0.88) {
      blzPut(M, a, 0, 0, 0, -r[0], -r[1], 0, Math.sin(M.t * 13) * 0.18, 0, 'spread', null);    // dizzy
      blzPut(M, v, al, sd, 0.5 + Math.sin(f * Math.PI) * 1.1, r[2], r[3], f * Math.PI * 1.6, -1.15 * sp * (1 - f), 0.2 * f, 'flail', 'kick');
    } else {
      const g = blzSeg(u, 0.88, 1);
      blzPut(M, a, 0, 0, 0, -r[0], -r[1], 0, Math.sin(M.t * 13) * 0.12 * (1 - g), 0, 'flex', null);
      blzPut(M, v, r[0] + r[2] * dist, r[1] + r[3] * dist, Math.sin(g * Math.PI) * 0.25, r[2], r[3], 1.6 * Math.PI + (1.5 - 1.6 * Math.PI) * blzEase(g), 0, 0.72, 'spread', null);
    }
  },
  // from behind: lift, arch, and drop him on his head over your shoulders
  suplex(M, u) {
    const a = M.a, v = M.v;
    if (u < 0.2) {
      const k = blzSeg(u, 0, 0.2);
      blzPut(M, a, -1.0 + 0.4 * k, 0, 0, 1, 0, 0.15 * k, 0, 0.05 * k, 'grab', null);
      blzPut(M, v, 0, 0, 0, 1, 0, 0, 0, 0, 'flail', 'split');
    } else if (u < 0.55) {
      const k = blzEase(blzSeg(u, 0.2, 0.55));
      blzPut(M, a, -0.6, 0, 0, 1, 0, -0.85 * k, 0, 0.15 * k, 'lift', null);
      blzPut(M, v, -0.6 * k, 0, 1.0 * k, 1, 0, -1.7 * k, 0, 0, 'flail', 'kick');
    } else if (u < 0.7) {
      const k = blzSeg(u, 0.55, 0.7);
      blzPut(M, a, -0.6, 0, 0, 1, 0, -0.85 - 0.65 * k, 0, 0.15 + 0.5 * k, 'lift', null);
      blzPut(M, v, -0.6 - 0.9 * k, 0, 1.0 - 0.95 * k, 1, 0, -1.7 - 1.35 * k, 0, 0, 'flail', 'kick');
    } else {
      const k = blzEase(blzSeg(u, 0.7, 1));
      blzPut(M, a, -0.6, 0, 0, 1, 0, -1.5, 0, 0.65, 'spread', 'kick');
      blzPut(M, v, -1.5 - 0.25 * k, 0, 0.05 + Math.sin(k * Math.PI) * 0.2, 1, 0, -3.05 - 1.65 * k, 0, 0.72 * k, 'spread', 'kick');
    }
  },
  // face to face: up by the facemask, a good long SHAKE, and down on his spine
  spinebuster(M, u) {
    const a = M.a, v = M.v;
    if (u < 0.15) {
      const k = blzSeg(u, 0, 0.15);
      blzPut(M, a, -1.05 + 0.3 * k, 0, 0, 1, 0, 0, 0, 0, 'grab', null);
      blzPut(M, v, 0, 0, 0, -1, 0, 0, 0, 0, 'flail', 'split');
    } else if (u < 0.4) {
      const k = blzEase(blzSeg(u, 0.15, 0.4));
      blzPut(M, a, -0.75, 0, 0, 1, 0, -0.2 * k, 0, 0.05 * k, 'lift', null);
      blzPut(M, v, -0.1 * k, 0, 0.95 * k, -1, 0, 0.1 * k, 0, 0, 'flail', 'split');
    } else if (u < 0.64) {
      // the shake (the cart's own word for it)
      const t = M.t;
      blzPut(M, a, -0.75, Math.sin(t * 31) * 0.05, 0, 1, 0, -0.2, Math.sin(t * 29) * 0.12, 0.05, 'lift', null);
      blzPut(M, v, -0.1, Math.sin(t * 38) * 0.16, 0.95 + Math.sin(t * 50) * 0.09, -1, 0, 0.1, Math.sin(t * 33) * 0.4, 0, 'flail', 'split');
    } else if (u < 0.8) {
      const k = blzSeg(u, 0.64, 0.8);
      blzPut(M, a, -0.75 + 0.4 * k, 0, 0, 1, 0, -0.2 + 1.45 * k, 0, 0.05 + 0.4 * k, 'grab', null);
      blzPut(M, v, -0.1 + 0.25 * k, 0, 0.95 * (1 - k), -1, 0, 0.1 - 1.65 * k, 0, 0.72 * k, 'flail', 'kick');
    } else {
      const k = blzSeg(u, 0.8, 1);
      blzPut(M, a, -0.35, 0, 0, 1, 0, 1.25 + 0.25 * k, 0, 0.45 + 0.27 * k, 'grab', 'split');
      blzPut(M, v, 0.15, 0, Math.sin(k * Math.PI) * 0.15, -1, 0, -1.55, 0, 0.72, 'spread', null);
    }
  },
  // an arm round the neck from the side, and both of you fall backwards
  neckbreaker(M, u) {
    const a = M.a, v = M.v, sd = M.side * 0.45;
    if (u < 0.25) {
      const k = blzSeg(u, 0, 0.25);
      blzPut(M, a, -0.8 + 0.6 * k, sd, 0, M.vfa, M.vfs, 0, 0, 0, 'grab', null);
      blzPut(M, v, 0, 0, 0, M.vfa, M.vfs, 0, 0, 0, 'flail', null);
    } else {
      const k = blzEase(blzSeg(u, 0.25, 0.6));
      blzPut(M, a, -0.2 - 0.3 * k, sd, 0, M.vfa, M.vfs, -1.5 * k, 0, 0.72 * k, 'grab', 'kick');
      blzPut(M, v, -0.45 * k, sd * 0.25 * k, Math.sin(k * Math.PI) * 0.2, M.vfa, M.vfs, -1.55 * k, -0.2 * M.side * k, 0.72 * k, 'flail', 'kick');
    }
  },
  // at a dead sprint, arm out: his legs keep going, his head doesn't
  clothesline(M, u) {
    const a = M.a, v = M.v, run = M.spd * M.T;
    a.anim += 0.3;
    if (u < 0.22) {
      const k = u / 0.22;
      blzPut(M, a, -1.6 + 1.6 * k, 0.35, 0, 1, 0, 0.25, 0, 0, 'clothes', 'run');
      blzPut(M, v, 0, 0, 0, M.vfa, M.vfs, 0, 0, 0, null, 'run');
      return;
    }
    const k = blzSeg(u, 0.22, 0.74), g = blzSeg(u, 0.74, 1);
    blzPut(M, a, run * 0.55 * blzSeg(u, 0.22, 1), 0.35, 0, 1, 0, 0.2 * (1 - g), 0, 0, g > 0.5 ? 'flex' : 'clothes', g > 0.3 ? null : 'run');
    if (u < 0.74) blzPut(M, v, 0.9 * k, 0, Math.sin(k * Math.PI) * 1.0, -1, 0, -2.6 * blzEase(k), 0, 0, 'flail', 'kick');
    else blzPut(M, v, 0.9, 0, Math.sin(g * Math.PI) * 0.18, -1, 0, -2.6 + 1.05 * blzEase(g), 0, 0.72 * g, 'spread', 'kick');
  },
  // a horizontal launch through his chest; you both keep going
  spear(M, u) {
    const a = M.a, v = M.v, e = blzEase(u);
    blzPut(M, a, -1.1 + 3.0 * e, 0, 0.4 * (1 - u), 1, 0, 1.3 + 0.2 * u, 0, 0.45 + 0.27 * u, 'grab', 'split');
    blzPut(M, v, 2.7 * e, 0, Math.sin(blzSeg(u, 0, 0.7) * Math.PI) * 0.55, -1, 0, -1.55 * blzEase(blzSeg(u, 0.1, 0.7)), 0, 0.72 * blzSeg(u, 0.4, 1), 'flail', 'kick');
  },
  // a dive at the ankles from behind: he goes face first
  trip(M, u) {
    const a = M.a, v = M.v;
    const k = blzEase(blzSeg(u, 0, 0.5));
    blzPut(M, a, -1.6 + 1.0 * k, 0, 0.15, 1, 0, 1.45, 0, 0.7, 'grab', 'split');
    const f = blzEase(blzSeg(u, 0.12, 0.56));
    blzPut(M, v, 1.7 * blzEase(u), 0, 0, 1, 0, 1.6 * f, 0, 0.72 * f, f < 0.8 ? 'spread' : 'flail', 'split');
  },
  // the plain wrap-up: arms round him, both of you down the way he was going
  wrap(M, u) {
    const a = M.a, v = M.v, e = blzEase(blzSeg(u, 0.1, 0.62));
    const fwd = M.vfa > 0 ? 1 : -1;   // hit from behind: face first; from the front: on his back
    blzPut(M, a, -0.55 + 0.85 * e, 0, 0, 1, 0, 1.35 * e, 0, 0.62 * e, 'grab', null);
    blzPut(M, v, 0.85 * e, 0, Math.sin(e * Math.PI) * 0.12, M.vfa, M.vfs, 1.52 * e * fwd, 0, 0.72 * e, 'flail', 'split');
  },
  // after the whistle: off the ground and down elbow-first on whoever's lying there
  elbow(M, u) {
    const a = M.a, v = M.v, k = blzEase(u);
    const al = M.a0 * (1 - k);
    blzPut(M, a, al, 0, Math.sin(u * Math.PI) * 1.5, 1, 0, 1.3 * blzSeg(u, 0.4, 0.9), 0, 0.55 * blzSeg(u, 0.75, 1), 'elbow', 'tuck');
    blzLie(M, v);
  },
  legdrop(M, u) {
    const a = M.a, v = M.v, k = blzEase(u);
    blzPut(M, a, M.a0 * (1 - k), 0.15, Math.sin(u * Math.PI) * 1.4, 0, 1, -1.15 * blzSeg(u, 0.35, 0.9), 0, 0.6 * blzSeg(u, 0.75, 1), 'spread', 'sit');
    blzLie(M, v);
  },
  stomp(M, u) {
    const a = M.a, v = M.v;
    blzPut(M, a, -0.7, 0.2, 0, 1, 0, 0.15, 0, 0, 'spread', u < 0.6 ? 'stomp' : null);
    blzLie(M, v);
  },
};

function blzMovesStep(dt) {
  if (!blitz.anims.length) return;
  for (const M of blitz.anims) {
    if (M.ended) continue;
    M.t += dt;
    const u = Math.min(1, M.t / M.T);
    BLZ_MOVE_FN[M.kind](M, u);
    if (!M.hitDone && u >= M.hit) { M.hitDone = true; blzMoveImpact(M); }
    if (u >= 1) blzEndMove(M);
  }
  blitz.anims = blitz.anims.filter((M) => !M.ended);
}
function blzMoveImpact(M) {
  const D = BLZ_MOVES[M.kind], v = M.v;
  const late = M.kind === 'elbow' || M.kind === 'legdrop' || M.kind === 'stomp';
  const big = !!D.banner;
  blitz.shakeT = big ? 0.35 : 0.2; blitz.shakeMag = big ? 7 : 4;
  if (big) blitz.hitStop = 0.06;
  blzSfx(big || late ? 'crunch' : 'hit');
  blzRoar(big ? 1 : 0.6, big ? 1.8 : 1);
  blzBurst(v.x, v.z, 0.4, big ? 16 : 9, '#e8dcc0');
  // the turf answers: a ring of dust where he lands
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    blitz.parts.push({ x: v.x, z: v.z, y: 0.15, vx: Math.cos(a) * 3.5, vz: Math.sin(a) * 3.5, vy: 0.8, t: 0, T: 0.5, c: '#c8b890', k: 'spark' });
  }
  if (D.banner && (!M.quiet)) blzBanner(D.banner, late ? '#ff5a3a' : '#ff8a3a', late ? 'NO FLAG' : '', 1.0);
  else if (D.feed) blzFeed(D.feed, '#ffcf8a');
  if (D.say.length && Math.random() < 0.7) blzSay(blzPick(D.say), big);
  if (late) blzColor(BLZ_COLOR.late, 0.45); else if (big) blzColor(BLZ_COLOR.hit, 0.5);
  if (big || late) blzCrowdSay('oooh');
  if (big && Math.random() < 0.5) blzSting('big');
  if (big && !late) { blzCheer(M.a.team, 1.6); if (blitz.playsSinceReplay >= 2 && Math.random() < 0.55 && /spinebuster|suplex|clothesline|spear|fling/.test(M.kind)) blitz.replayWant = { why: M.kind, t: blitz.t }; }
  blzHype(M.a.team, late ? 0.03 : big ? 0.05 : 0, null, 'move');
  if (big) blitz.flashT = Math.max(blitz.flashT, 1.2);
  if (v.scr && late) { v.y = 0.2; }
  if (late && blitz.stats && blzHuman(M.a.team)) { blitz.stats.late++; blzEarn(M.kind === 'stomp' ? 1 : 2, M.kind === 'stomp' ? 'STOMP' : D.banner.replace('!', '')); }
  if (!late && big && blitz.stats && blzHuman(M.a.team)) { blitz.stats.hits++; blzEarn(2, D.banner.replace('!', '')); }
}
function blzEndMove(M) {
  M.ended = true;
  for (const p of [M.a, M.v]) {
    const sc = p.scr;
    p.scr = null; p.y = 0;
    if (!sc) continue;
    // whatever angle he finished at decides face up or face down
    let pn = sc.pitch % (Math.PI * 2);
    if (pn > Math.PI) pn -= Math.PI * 2; if (pn < -Math.PI) pn += Math.PI * 2;
    const lying = sc.drop > 0.35 || Math.abs(pn) > 0.9;
    if (lying) { p.lieBack = pn < 0; p.downT = Math.max(p.downT, p === M.v ? 1.0 : 0.65); }
    else { p.downT = 0; if (p === M.a && Math.random() < 0.55) p.celebT = 0.9; }  // stand over him and flex
  }
  // the cart's quirk: a fling that lands him further on gets him the yards
  const Dd = blitz.dead;
  if (M.kind === 'fling' && Dd && Dd.who === M.v && Dd.type === 'tackle' && Dd.team != null) {
    const d = blzDir(Dd.team), lim = blzGoal(Dd.team) - d * 0.6;
    if ((M.v.z - Dd.z) * d > 0 && M.v.x > 0 && M.v.x < BLZ_WID) { Dd.z = (M.v.z - lim) * d > 0 ? lim : M.v.z; Dd.x = M.v.x; blzFeed('+ THE FLING YARDS', '#bfe8ff'); }
  }
}

// choose a tackle for the moment: angle, speed, dive, sack
function blzPickMove(C, q, big, sack) {
  const qs = Math.hypot(q.vx, q.vz) || 1;
  const along = (q.vx * C.fx + q.vz * C.fz) / qs;      // > 0: hit from behind
  const behind = along > 0.3, front = along < -0.3;
  const w = (pairs) => { let s = 0; for (const [, x] of pairs) s += x; let r = Math.random() * s; for (const [k, x] of pairs) { if ((r -= x) <= 0) return k; } return pairs[0][0]; };
  if (q.diveT > 0) return behind ? w([['trip', 4], ['spear', 1], ['wrap', 2]]) : w([['spear', 3], ['wrap', 3], ['trip', 2]]);
  if (big) return front ? w([['launch', 3], ['clothesline', 3], ['spear', 2], ['spinebuster', 1]]) : w([['launch', 4], ['spear', 2], ['fling', 2], ['suplex', 1]]);
  if (sack) return behind ? w([['suplex', 4], ['fling', 3], ['neckbreaker', 2], ['wrap', 1]]) : w([['spinebuster', 4], ['fling', 3], ['neckbreaker', 2], ['wrap', 1]]);
  if (behind) return w([['fling', 4], ['wrap', 3], ['suplex', 2.5], ['trip', 1.5], ['neckbreaker', 1]]);
  return w([['fling', 4], ['wrap', 3], ['spinebuster', 2], ['neckbreaker', 1.5], ['clothesline', 1.5]]);
}

// THE ELBOW DROP: jump on whoever's on the turf. Lands, or it doesn't.
function blzElbowDrop(me) {
  if (me.lateCd > 0 || me.downT > 0 || me.jumpT > 0 || me.scr) return;
  let v = null, bd = 3.4;
  for (const p of blitz.players) {
    if (p.team === me.team || p.scr) continue;
    const d = blzDist(p, me) - (p.downT > 0 ? 0.9 : 0);
    if (d < bd) { bd = d; v = p; }
  }
  me.lateCd = 1.3;
  // somebody on the turf: off the top rope — the elbow, or (turbo, or the coin) the leg drop
  if (v && v.downT > 0) {
    const M = blzStartMove(blzTurboHeld() && blzHuman(me.team) || Math.random() < 0.4 ? 'legdrop' : 'elbow', me, v, null);
    M.a0 = -Math.max(0.6, blzDist(me, v));
    v.downT = Math.max(v.downT, M.T + 0.8);
    return;
  }
  me.jumpT = 0.62;
  if (!v) return;
  me.dropOn = v;
  const dx = v.x - me.x, dz = v.z - me.z, m = Math.hypot(dx, dz) || 1, sp = Math.min(6.5, m / 0.55);
  me.vx = dx / m * sp; me.vz = dz / m * sp; me.fx = dx / m; me.fz = dz / m;
}
function blzElbowLand(me) {
  const v = me.dropOn; me.dropOn = null;
  if (!v || blzDist(v, me) > 2) return;
  v.downT = Math.max(v.downT, 1.5); v.lieBack = true; v.vx = 0; v.vz = 0;
  me.downT = 0.8; me.lieBack = false; me.vx = 0; me.vz = 0;
  me.x = v.x + (me.x - v.x) * 0.3; me.z = v.z + (me.z - v.z) * 0.3;
  blitz.shakeT = 0.3; blitz.shakeMag = 6;
  blzSfx('crunch'); blzRoar(1, 1.6);
  blzBurst(v.x, v.z, 0.6, 14, '#fff0a0');
  blzBanner('ELBOW DROP!', '#ff5a3a', 'NO FLAG', 1.0);
  blzSay(blzPick(['from the top rope!', 'elbow drop!', 'oh, the elbow!']));
  if (blitz.stats && blzHuman(me.team)) { blitz.stats.late++; blzEarn(2, 'ELBOW DROP'); }
}

// LATE HITS: anyone, anytime after the whistle, no flag ever thrown
function blzLateHit(me) {
  if (me.lateCd > 0 || me.downT > 0 || me.scr) return;
  let v = null, bd = 2.2;
  for (const p of blitz.players) {
    if (p.team === me.team || p === me || p.scr) continue;
    const d = blzDist(p, me);
    if (d < bd) { bd = d; v = p; }
  }
  me.lateCd = 1.2;
  if (!v) { if (blzHuman(me.team)) me.jumpT = 0.62; return; }
  // he's already down: put a boot in him (the cart let you kick them when they were down)
  if (v.downT > 0) { const M = blzStartMove('stomp', me, v, null); v.downT = Math.max(v.downT, M.T + 0.8); return; }
  const dx = v.x - me.x, dz = v.z - me.z, m = Math.hypot(dx, dz) || 1;
  v.downT = Math.max(v.downT, 1.3); v.vx = dx / m * 6; v.vz = dz / m * 6; v.y = 0.6;
  me.vx = dx / m * 4; me.vz = dz / m * 4;
  blitz.shakeT = 0.22; blitz.shakeMag = 4;
  blzSfx('crunch'); blzRoar(0.8, 1.2);
  blzBurst(v.x, v.z, 1.2, 10, '#ffb0a0');
  blzBanner('LATE HIT!', '#ff5a3a', 'NO FLAG', 0.9);
  blzSay(blzPick(BLZ_CALLS.late));
  blzColor(BLZ_COLOR.late, 0.4); blzCrowdSay('oooh');
  blzHype(me.team, 0.02, null, 'late');
  if (blitz.stats && blzHuman(me.team)) { blitz.stats.late++; blzEarn(1, 'LATE HIT'); }
}

// ---- the whistle --------------------------------------------------------------------------------
function blzWhistle(type, info) {
  if (blitz.phase !== 'live') return;
  blitz.phase = 'dead';
  blitz.deadT = type === 'td' ? 2.6 : type === 'inc' ? 1.2 : 1.7;
  blitz.dead = Object.assign({ type }, info);
  // a wrestling move in progress gets to finish before the next snap
  for (const M of blitz.anims) blitz.deadT = Math.max(blitz.deadT, M.T - M.t + 0.5);
  if (type !== 'td') blzSfx('whistle');
  const Bd = blitz.ball;
  if (Bd && (Bd.st === 'air' || Bd.st === 'loose')) { Bd.st = 'dead'; Bd.y = Math.min(Bd.y, 0.2); }
  if (type === 'inc') blitz.fire[blitz.poss].n = 0;
  const C = info.who || blitz.carrier;
  if (type === 'tackle' || type === 'oob') {
    const team = type === 'oob' && info.team != null ? info.team : C.team;
    blitz.dead.team = team;
    blitz.dead.z = info.z != null ? info.z : C.z;
    blitz.dead.x = info.x != null ? info.x : C.x;
    // a ball carrier down in his own end zone
    const inOwnEZ = (blitz.dead.z - blzOwnGoal(team)) * blzDir(team) <= 0;
    if (inOwnEZ) {
      if (blitz.ezCatch) blitz.dead.type = 'touchback';
      else blitz.dead.type = 'safety';
    }
    if (info.sack && blitz.dead.type === 'tackle') {
      blzEv('sack' + (1 - team));
      blzBanner('SACK!', '#ff8a3a', '', 1.1);
      blzSay(blzPick(BLZ_CALLS.sack), true);
      blzRoar(0.8, 1.4);
      const dteam = 1 - team;
      if (blzHuman(dteam)) { blitz.stats.sacks++; blzEarn(4, 'SACK'); }
      blzDefStop(dteam, 0.2);
      blzSting('sack'); blzColor(BLZ_COLOR.sack, 0.6);
      blzCheer(dteam, 2);
      if (!blzHuman(dteam)) blzCrowdSay('aww'); else blzCrowdSay('yeah');
    }
  }
  // a tackle for loss counts as a stop too
  if (type === 'tackle' && !info.sack && C && C.team === blitz.poss && (blitz.dead.z - blitz.los) * blzDir(C.team) < 0 && blitz.kind === 'run') { blzDefStop(1 - C.team, 0.08); blzColor(BLZ_COLOR.stuff, 0.5); }
}
function blzDefStop(team, amt) {
  const F = blitz.fire[team];
  F.stops++;
  blzHype(team, amt == null ? 0.2 : amt, null, 'stop');
  blitz.fire[1 - team].n = 0;
}

function blzTouchdown(C) {
  const team = C.team;
  blzWhistle('td', { team, who: C });
  C.celebT = 3;
  blzSfx('td'); blzRoar(1, 3);
  blzConfetti(C.x, C.z, team);
  if (blitz.pat2) { blzBanner('2 POINTS!', '#ffd23a', C.name, 1.6); blzSay('two points!', true); return; }
  blitz.score[team] += 6;
  blzBanner('TOUCHDOWN!', '#ffd23a', C.name, 2.2);
  blzSay(blzPick(BLZ_CALLS.td), true);
  blzColor(C.showboat ? BLZ_COLOR.showboat : BLZ_COLOR.td, 0.75);
  blzSting('td');
  blzCrowdSay(blzHuman(team) ? 'roar' : 'boo');
  blitz.flashT = 3.5;
  blzHype(team, 0.1 + (C.showboat ? 0.2 : 0), C, 'td');
  blzCheer(team, 3);
  blzFireworks(team, team === 0 ? BLZ_LEN + 9 : -9);
  if (team === 0 && !blitz.auto && blitz.waveQ !== blitz.q && Math.random() < 0.6) { blitz.waveQ = blitz.q; blitz.wave = { z: -8 }; }
  // the replay booth wants this one, and the scorer gets to celebrate
  blitz.replayWant = { why: 'td', t: blitz.t };
  blitz.celebDone = false;
  blitz.celebAt = blzHuman(team) ? 0 : blitz.t + 0.4;
  if (blitz.stats && C.showboat) blzEv('sbtd');
  const gain = Math.round((C.z - blitz.startZ) * blzDir(team));
  blitz.stats.log.push([team, blitz.kind, gain, Math.round(blitz.startZ), blitz.ball && blitz.ball.lastTeam != null ? 'L' + blitz.ball.lastTeam : '']);
  if (blzHuman(team)) { blitz.stats.tds++; blzEarn(25, 'TOUCHDOWN'); if (gain > blitz.stats.long) blitz.stats.long = gain; }
  // the other side's fire goes out when you score on them
  blzDouse(1 - team);
}

// After the dead-ball pause: spot it, count the down, decide what's next.
function blzAfterDead() {
  const D = blitz.dead || { type: 'inc' };
  const off = blitz.poss, d = blzDir(off);
  const fireTick = () => {
    for (const t of [0, 1]) { const F = blitz.fire[t]; if (F.on && ++F.plays > 7) { blzDouse(t); blitz.hype[t] = 0.2; } }
  };
  fireTick();
  if (D.type === 'td') {
    // (a defensive return on a two-point try is worth two to the defense, as it should be)
    if (blitz.pat2) { blitz.score[D.team] += 2; if (blzHuman(D.team)) blzEarn(8, '2-POINT'); blitz.pat2 = false; blzNext({ kick: off }); return; }
    blzToPat(D.team);
    return;
  }
  if (blitz.pat2) { blitz.pat2 = false; blzFeed('NO GOOD', '#bfc6ff'); blzNext({ kick: off }); return; }
  if (D.type === 'fgGood') {
    if (D.pat) { blitz.score[off] += 1; if (blzHuman(off)) blzEarn(3, 'EXTRA POINT'); }
    else { blitz.score[off] += 3; if (blzHuman(off)) blzEarn(10, 'FIELD GOAL'); blzDouse(1 - off); }
    blzNext({ kick: off });
    return;
  }
  if (D.type === 'fgMiss') {
    if (D.pat) { blzNext({ kick: off }); return; }
    // the other side takes over at the spot of the kick (or their 20)
    const np = 1 - off, spot = blitz.los - d * 7;
    const own20 = blzOwnGoal(np) + blzDir(np) * 20;
    blzChange(np, (spot - own20) * blzDir(np) > 0 ? spot : own20);
    blzNext({ call: true });
    return;
  }
  if (D.type === 'safety') {
    const scorer = 1 - D.team;
    blitz.score[scorer] += 2;
    blzBanner('SAFETY!', '#ff8a3a', '', 1.4); blzSay('safety!', true); blzRoar(0.9, 1.6);
    if (blzHuman(scorer)) blzEarn(10, 'SAFETY');
    blzNext({ free: D.team });
    return;
  }
  if (D.type === 'touchback') {
    const t = D.team;
    blzChange(t, blzOwnGoal(t) + blzDir(t) * 20);
    blzFeed('TOUCHBACK', '#bfc6ff');
    blzNext({ call: true });
    return;
  }
  if (D.type === 'inc') {
    if (blitz.kind === 'punt' || blitz.kind === 'kick') { blzNext({ call: true }); return; }
    blzNextDown(blitz.los);
    return;
  }
  // tackle / oob: who has it, and where
  const team = D.team != null ? D.team : off;
  const spot = blzClamp(D.z, 10.5, 109.5);
  blitz.ballX = blzClamp(D.x != null ? D.x : blitz.ballX, 19.5, BLZ_WID - 19.5);
  if (blitz.kind === 'kick' || blitz.kind === 'punt' || team !== off) {
    // a return or a turnover: new set of downs for whoever's holding it
    if (team !== off && blitz.kind !== 'kick' && blitz.kind !== 'punt') {
      blzFeed('TURNOVER', '#ff8a3a');
    }
    blzChange(team, spot);
    blzNext({ call: true });
    return;
  }
  const gain = Math.round((spot - blitz.los) * d);
  if (blzHuman(off)) {
    blitz.stats.yds += gain;
    if (gain > blitz.stats.long) blitz.stats.long = gain;
    if (gain >= 25) blzEarn(4, gain + ' YD PLAY');
  }
  // the call: big gains get a number, losses get a wince, the rest mostly get the crowd
  if (gain >= 15) { blzSpeak(blzPick(gain >= 30 ? ['WHAT A HUGE GAIN!', 'HE IS GOING TO RUN ALL DAY!', 'THAT IS A MONSTER GAIN!'] : ['BIG GAIN!', 'A HUGE CHUNK OF YARDAGE!', 'HE IS EATING UP YARDS!', 'WHAT A PICKUP!']), { who: 'pbp', prio: 1, maxAge: 2 }); blzHype(off, 0.06, D.who, 'gain'); blzCheer(off, 1.6); blitz.flashT = Math.max(blitz.flashT, 1); }
  else if (gain <= -2) blzSpeak(blzPick(['LOSING YARDAGE!', 'HE GOES BACKWARDS!', 'DROPPED FOR A LOSS!']), { who: 'pbp', prio: 1, maxAge: 2 });
  blzNextDown(spot);
}

function blzNextDown(spot) {
  const off = blitz.poss, d = blzDir(off);
  if ((spot - blitz.firstAt) * d >= 0) {
    blitz.los = spot; blitz.down = 1;
    blitz.firstAt = blzFirstAt(off, spot);
    blzBanner('FIRST DOWN', '#ffd23a', '', 1.0);
    if (Math.random() < 0.7) blzSay(blzPick(BLZ_CALLS.first));
    if (blzHuman(off)) { blzEarn(2, ''); blzSting('first'); blzCrowdSay('clap'); }
    blzHype(off, 0.04, null, 'first');
    blzHype(1 - off, -0.06, null, 'oppfirst');
    blitz.fire[1 - off].stops = 0;
    blzNext({ call: true });
    return;
  }
  blitz.los = spot;
  blitz.down++;
  if (blitz.down > 4) {
    blzBanner('TURNOVER ON DOWNS', '#ff8a3a', '', 1.3);
    blzDefStop(1 - off, 0.15);
    if (!blzHuman(off)) { blzSting('trombone'); blzColor(BLZ_COLOR.oops, 0.6); }
    blzChange(1 - off, spot);
  }
  blzNext({ call: true });
}

function blzFirstAt(team, spot) {
  const d = blzDir(team), f = spot + d * BLZ_FIRST, g = blzGoal(team);
  return (f - g) * d >= 0 ? g : f;
}
function blzChange(team, spot) {
  blitz.poss = team; blitz.los = spot; blitz.down = 1;
  blitz.firstAt = blzFirstAt(team, spot);
}

// Next step, but quarters end between plays.
function blzNext(what) {
  blitz.pending = what;
  blzAfter(blitz.deadT > 0 ? 0.05 : 0.2, () => blzRunPending());
}
function blzRunPending() {
  const what = blitz.pending || { call: true };
  blitz.pending = null;
  if (blitz.ot && blitz.score[0] !== blitz.score[1]) { blzFinal(); return; }
  if (blitz.clock <= 0) { blzEndQuarter(what); return; }
  if (what.kick != null) { blzSetupKickoff(what.kick, false); return; }
  if (what.free != null) { blzSetupKickoff(what.free, true); return; }
  blzToCall();
}

function blzEndQuarter(what) {
  const q = blitz.q;
  blzSfx('horn');
  if (q === 2) {
    blzBanner('HALFTIME', '#bfe8ff', blzTeam(0).abbr + ' ' + blitz.score[0] + '  ' + blzTeam(1).abbr + ' ' + blitz.score[1], 3.6);
    blitz.q = 3; blitz.clock = BLZ_QLEN;
    blitz.halftime = true;            // the marching band gets the field for a few bars
    blzSpeak(blzPick(['THAT IS HALFTIME!', 'HALFTIME HERE AT THE FRYER!']), { who: 'pbp', prio: 1 });
    blzAfter(3.8, () => blzSetupKickoff(1 - blitz.openKicker, false));
    return;
  }
  if (q >= 4) {
    if (blitz.score[0] === blitz.score[1] && !blitz.ot) {
      blitz.ot = true; blitz.q = 5; blitz.clock = Math.round(BLZ_QLEN * 0.8);
      blzBanner('OVERTIME', '#ffd23a', 'SUDDEN DEATH', 2);
      blzAfter(1.8, () => blzSetupKickoff(Math.random() < 0.5 ? 0 : 1, false));
      return;
    }
    blzFinal();
    return;
  }
  blzBanner('END OF ' + blzOrd(q) + ' QUARTER', '#bfe8ff', '', 1.4);
  blitz.q = q + 1; blitz.clock = BLZ_QLEN;
  blzAfter(1.4, () => {
    if (what.kick != null) blzSetupKickoff(what.kick, false);
    else if (what.free != null) blzSetupKickoff(what.free, true);
    else blzToCall();
  });
}

// ---- PAT ------------------------------------------------------------------------------------
function blzToPat(team) {
  // overtime is sudden death: the touchdown ends it
  if (blitz.ot) { blzFinal(); return; }
  blitz.poss = team;
  blitz.los = blzGoal(team) - blzDir(team) * 3; blitz.ballX = BLZ_MID; blitz.down = 1;
  blitz.firstAt = blzGoal(team);
  if (blzHuman(team)) { blitz.phase = 'pat'; blitz.callSel = 0; blitz.callT = 0; return; }
  // the CPU goes for two when the math says so
  const lead = blitz.score[team] - blitz.score[1 - team];
  const two = blitz.q >= 4 && [-1, -5, 1, -2, -10].includes(lead) && Math.random() < 0.8;
  blzPatChoose(two ? 2 : 1);
}
function blzPatChoose(n) {
  const team = blitz.poss;
  if (n === 2) {
    blitz.pat2 = true;
    blzBanner('GO FOR TWO', '#ffd23a', '', 1.0);
    blzAfter(0.6, () => blzToCall());
  } else {
    blzSpecial('pat');
  }
}

// ---- field goals -----------------------------------------------------------------------------
function blzKickFG() {
  const F = blitz.fg, off = blitz.poss, d = blzDir(off);
  F.kicked = true;
  const B = blitz.ball;
  const postZ = blzGoal(off) + d * 10;
  const miss = F.good ? 0 : (Math.random() < 0.5 ? -1 : 1);
  const short = !F.good && F.dist > 48 && Math.random() < 0.5;
  B.st = 'air'; B.kind = 'fg';
  B.x0 = blitz.ballX; B.z0 = blitz.los - d * 7; B.y0 = 0.3;
  B.tx = BLZ_MID + (miss ? miss * blzRnd(3.8, 6.5) : blzRnd(-2.4, 2.4)); B.tz = short ? postZ - d * 3 : postZ;
  B.ty = short ? 2.2 : blzRnd(5, 8);
  const dist = Math.abs(B.tz - B.z0);
  B.t = 0; B.T = dist / 21; B.peak = 3 + dist * 0.12;
  blzSfx('kick');
}
function blzFGResult() {
  const F = blitz.fg;
  if (!F || F.done) return;
  F.done = true;
  if (F.good) { blzBanner("IT'S GOOD!", '#ffd23a', '', 1.2); blzSay(BLZ_CALLS.good[0], true); blzSfx('good'); blzRoar(0.8, 1.5); }
  else {
    blzBanner('NO GOOD!', '#ff8a7a', '', 1.2); blzSay(BLZ_CALLS.nogood[0], true); blzSfx('bad');
    if (!blzHuman(blitz.poss)) { blzSting('trombone'); blzColor(BLZ_COLOR.oops, 0.6); } else blzCrowdSay('aww');
  }
  blitz.phase = 'live';
  blzWhistle(F.good ? 'fgGood' : 'fgMiss', { pat: blitz.kind === 'pat' });
  blitz.deadT = 1.4;
}

// ---- the main update ---------------------------------------------------------------------------
function blitzUpdate(dt) {
  blitz.t += dt;
  if (blitz.tauntCd > 0) blitz.tauntCd -= dt;
  for (const p of blitz.players) if (p.taunt && (p.taunt.t += dt) > p.taunt.T) p.taunt = null;
  if (blitz.phase !== 'replay') { blzExtrasStep(dt); blzCrowdFxStep(dt); }
  for (const b of blitz.bubbles) b.t += dt;
  if (blitz.bubbles.length) blitz.bubbles = blitz.bubbles.filter((b) => b.t < b.T);
  if (blitz.hitStop > 0) { blitz.hitStop -= dt; return; }
  if (blitz.shakeT > 0) blitz.shakeT -= dt;
  if (blitz.flashT > 0) blitz.flashT -= dt;
  if (blitz.banner) { blitz.banner.t += dt; if (blitz.banner.t > blitz.banner.T) blitz.banner = null; }
  for (const f of blitz.feed) f.t -= dt;
  blitz.feed = blitz.feed.filter((f) => f.t > 0);
  blzParts(dt);
  const ph = blitz.phase;
  if (ph === 'replay') { blzReplayStep(dt); return; }
  if (ph === 'teams') { blitz.vsT += dt; return; }
  if (ph === 'vs') { blitz.vsT += dt; if (blitz.codeMsg) { blitz.codeMsg.t -= dt; if (blitz.codeMsg.t <= 0) blitz.codeMsg = null; } return; }
  if (ph === 'final') { blitz.finalT += dt; blzSim(dt); return; }
  if (ph === 'call' || ph === 'pat') {
    blitz.callT += dt;
    // the play clock: Blitz picks for you if you dawdle
    if (ph === 'call' && blitz.callT > 15) blzChoose(blitz.callSel);
    blzCam(dt);
    return;
  }
  if (ph === 'wait') {
    blitz.waitT -= dt;
    blzSim(dt);
    if (blitz.waitT <= 0) { const fn = blitz.waitFn; blitz.waitFn = null; if (fn) fn(); }
    return;
  }
  if (ph === 'pre') {
    blitz.playT += dt;
    blzPreStep(dt);
    blzSim(dt);
    if (blitz.playT >= blitz.snapAt) blzSnap();
    return;
  }
  if (ph === 'dead') {
    blitz.deadT -= dt;
    if (blitz.celebAt && !blitz.celebDone && blitz.t >= blitz.celebAt && blitz.dead && blitz.dead.who) {
      blitz.celebAt = 0; blzCelebrate(blitz.dead.who, blzPick(['spike', 'dance', 'flip', 'flex']));
    }
    blzSim(dt);
    if (blitz.deadT <= 0) { if (blzWantReplay()) blzStartReplay(blzAfterDead); else blzAfterDead(); }
    return;
  }
  if (ph === 'live') blzLive(dt);
}

// players + camera, without rules
function blzSim(dt) {
  blzReachUpdate();
  for (const p of blitz.players) {
    if (p.scr) continue;              // a wrestling move has him
    if (p === blitz.ctl && blzHuman(p.team) && blitz.phase !== 'final') blzHumanControl(p, dt);
    else blzThink(p, dt);
  }
  for (const p of blitz.players) if (!p.scr) blzMove(p, dt);
  blzMovesStep(dt);
  blzSeparate(dt);
  blzBallUpdate(dt);
  blzCam(dt);
  blzRec();
}

function blzLive(dt) {
  blitz.playT += dt;
  const scrimmage = blitz.kind === 'pass' || blitz.kind === 'run';
  const B = blitz.ball;
  // (the clock doesn't start until the ball is kicked)
  if (blitz.clock > 0 && !(blitz.kind === 'kick' && B && B.st === 'tee')) { blitz.clock -= dt; if (blitz.clock < 0) blitz.clock = 0; }
  // kickoff run-up
  if (blitz.kind === 'kick' && B.st === 'tee') {
    const kicker = blitz.players.find((p) => p.role === 'kicker');
    if (blitz.kickWait) { blitz.playT = 0; if ((blitz.kickT += dt) > 4) blitz.kickWait = false; }
    else if (kicker && (Math.hypot(kicker.x - B.x, kicker.z - B.z) < 1.1 || blitz.playT > 2.2)) {
      blzKickTheBall();
      // coverage releases
      for (const p of blitz.players) p.react = p.team === blitz.poss ? 0 : blzRnd(0, 0.15);
    }
  }
  // punts and kicks from scrimmage
  if (blitz.kind === 'punt' && blitz.punt && !blitz.punt.kicked) {
    const pu = blzByPos(blitz.poss, 'QB');
    if (blitz.playT > 0.4) { B.x = pu.x; B.z = pu.z; B.y = 1; }
    if (blitz.playT > 1.1) {
      blitz.punt.kicked = true;
      const d = blzDir(blitz.poss), dist = blzRnd(36, 47);
      B.st = 'air'; B.kind = 'punt';
      B.x0 = pu.x; B.z0 = pu.z; B.y0 = 1;
      B.tx = blzClamp(BLZ_MID + blzRnd(-12, 12), 5, BLZ_WID - 5); B.tz = blzClamp(pu.z + d * dist, 2, BLZ_LEN - 2); B.ty = 1.6;
      B.t = 0; B.T = 3.0; B.peak = 17;
      blzSfx('kick');
      if (blzHuman(blitz.poss)) blitz.ctl = blzByPos(blitz.poss, 'WR1');
    }
  }
  if ((blitz.kind === 'fg' || blitz.kind === 'pat') && blitz.fg && !blitz.fg.kicked) {
    const d = blzDir(blitz.poss);
    if (blitz.playT > 0.35) { B.x = blitz.ballX; B.z = blitz.los - d * 7; B.y = 0.3; }
    if (blitz.playT > 1.0) blzKickFG();
  }
  blzSim(dt);
  if (blitz.phase !== 'live') return;
  const C = blitz.carrier;
  // run play: the handoff
  if (scrimmage && blitz.kind === 'run' && blitz.pocket && C && C.pos === 'QB') {
    const rb = blzByPos(blitz.poss, 'RB');
    if (rb && (blzDist(rb, C) < 1.6 || blitz.playT > 0.95)) {
      blitz.carrier = rb; blitz.pocket = false; blitz.handed = true;
      if (blzHuman(rb.team)) blitz.ctl = rb;
    }
  }
  // a held receiver button: wind up, and at the threshold it's a bullet
  if (blitz.charge) {
    const ch = blitz.charge;
    if (!blitz.pocket || !C || C.pos !== 'QB' || blitz.thrown) blitz.charge = null;
    else { C.throwT = 0.34; if (blitz.t - ch.t0 >= BLZ_HOLD) { blitz.charge = null; blzReleaseThrow(ch, true); } }
  }
  // a QB who crosses the line is a runner now
  if (C && blitz.pocket && C.pos === 'QB' && (C.z - blitz.los) * blzDir(C.team) > 0.5) blitz.pocket = false;
  blzBlocks(dt);
  blzTackles(dt);
  if (blitz.phase !== 'live') return;
  // a carrier on the turf without a tackle (a diving catch, a stumble) is down there
  const Cd = blitz.carrier;
  if (Cd && (Cd.downT > 0 || (Cd.diveT > 0 && Cd.diveT < 0.05)) && !Cd.air) { blzWhistle('tackle', { who: Cd }); return; }
  const C2 = blitz.carrier;
  // free inside the twenty with nobody near: he starts DANCING (the cart did this)
  if (C2 && C2.downT <= 0 && !(blitz.pocket && C2.pos === 'QB')) {
    const g = (blzGoal(C2.team) - C2.z) * blzDir(C2.team);
    let near = 99;
    for (const q of blitz.players) if (q.team !== C2.team && q.downT <= 0) near = Math.min(near, blzDist(q, C2));
    // yours showboats when YOU say so (Y in the open field); theirs does it on their own
    const mine = blzHuman(C2.team) && C2 === blitz.ctl;
    const sb = mine ? !!C2.showboatH : g > 0 && g < 20 && near > 7;
    if (sb && !C2.showboat && !blitz.saidShow) { blitz.saidShow = true; blzEv('showboat'); if (!mine) { blzFeed('SHOWBOATING!', '#ffcf8a'); if (Math.random() < 0.7) blzSay(blzPick(['look at him showboat!', 'he\'s dancing in!'])); } }
    C2.showboat = sb;
    if (sb && blitz.showHype < 0.35) { const a = Math.min(0.35 - blitz.showHype, 0.16 * dt); blitz.showHype += a; blzHype(C2.team, a, C2, 'showboat'); }
    // the countdown call on a breakaway: the thirty… the twenty… the ten…
    if (blitz.countdown && g > 0) {
      const mark = g <= 10 ? 10 : g <= 20 ? 20 : g <= 30 ? 30 : 99;
      if (mark < blitz.countdown && near > 4) { blzSpeak({ 30: 'THE THIRTY!', 20: 'THE TWENTY!', 10: 'THE TEN!' }[mark], { who: 'pbp', prio: 1, maxAge: 0.6 }); }
      if (mark < blitz.countdown) blitz.countdown = mark;
    }
  }
  if (C2 && C2.downT <= 0) {
    const d = blzDir(C2.team);
    if ((C2.z - blzGoal(C2.team)) * d >= 0) { blzTouchdown(C2); return; }
    if (C2.x < 0 || C2.x > BLZ_WID) { blzWhistle('oob', { who: C2, z: C2.z, x: C2.x }); return; }
    // a returner who stands in his end zone kneels it
    if (blitz.ezCatch && blzHuman(C2.team) && C2 === blitz.ctl && Math.hypot(C2.vx, C2.vz) < 0.4 && blitz.playT > 4.5 &&
      (C2.z - blzOwnGoal(C2.team)) * d < 0) { blzWhistle('touchback', { team: C2.team }); return; }
  }
}

// keep nuggets from standing inside each other
function blzSeparate(dt) {
  const P = blitz.players;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    if (a.downT > 0 || a.scr) continue;
    for (let j = i + 1; j < P.length; j++) {
      const b = P[j];
      if (b.downT > 0 || b.scr || a.eng === b) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d > 0.75 || d < 1e-4) continue;
      const push = (0.75 - d) * 0.5;
      a.x -= dx / d * push; a.z -= dz / d * push;
      b.x += dx / d * push; b.z += dz / d * push;
    }
  }
}

function blzCamTrig(c) {
  c.s = Math.sin(c.pitch); c.c = Math.cos(c.pitch); c.cyw = Math.cos(c.yaw); c.syw = Math.sin(c.yaw);
}
// the kickoff shot: high on the side, looking across the coverage (the cart's opener)
const BLZ_KICKCAM = { yaw: 0.62, back: 24, h: 13, pitch: 0.46 };
function blzCamSnap(dir, fx, fz, kick) {
  const c = blitz.cam;
  c.dir = dir;
  const K = kick && blitz.gl ? BLZ_KICKCAM : null;
  c.yaw = (dir > 0 ? 0 : Math.PI) + (K ? K.yaw * dir : 0);
  c.h = K ? K.h : BLZ_CAM.h; c.pitch = K ? K.pitch : BLZ_CAM.pitch; c.back = K ? K.back : BLZ_CAM.back;
  blzCamTrig(c);
  c.x = BLZ_MID + (fx - BLZ_MID) * 0.72 - c.syw * c.back; c.z = fz - c.cyw * c.back;
  blitz.camFlipT = 0;
}
function blzCam(dt) {
  const c = blitz.cam, B = blitz.ball, C = blitz.carrier, ph = blitz.phase;
  let fx = BLZ_MID, fz = blitz.los;
  if (ph === 'call' || ph === 'pre' || ph === 'pat') { fx = blitz.ballX; fz = blitz.los + c.dir * 1; }
  else if (C) { fx = C.x; fz = C.z + c.dir * 1; }
  else if (B) {
    fx = B.x; fz = B.z;
    if (B.st === 'air' && (B.kind === 'kick' || B.kind === 'punt')) fz = B.z + (B.tz - B.z) * 0.35;
  }
  // a carrier running at the camera: swing around behind him. With polygons
  // the camera really swings (the yaw lerps below); the canvas renderer can
  // only look down ±z, so it does the white wipe instead.
  if (C && ph === 'live' && blzDir(C.team) !== c.dir && blitz.camFlipT <= 0 && C.downT <= 0) {
    if ((C.flipWait = (C.flipWait || 0) + dt) > 0.25) {
      if (blitz.gl) { c.dir = -c.dir; for (const p of blitz.players) p.flipWait = 0; }
      else { blitz.camFlipT = 0.34; blitz.camFlipDone = false; }
    }
  }
  if (blitz.camFlipT > 0) {
    blitz.camFlipT -= dt;
    if (!blitz.camFlipDone && blitz.camFlipT < 0.17) {
      blitz.camFlipDone = true;
      c.dir = -c.dir;
      c.yaw = c.dir > 0 ? 0 : Math.PI; blzCamTrig(c);
      c.z = fz - c.cyw * c.back;
      c.x = BLZ_MID + (fx - BLZ_MID) * 0.7 - c.syw * c.back;
      for (const p of blitz.players) p.flipWait = 0;
    }
  }
  // where the lens wants to be: behind the team the camera follows, or the kickoff shot
  let yawT = c.dir > 0 ? 0 : Math.PI, backT = BLZ_CAM.back, hT = BLZ_CAM.h, pitchT = BLZ_CAM.pitch;
  if (ph === 'pre') { const u = Math.min(1, blitz.playT / 3); backT -= u * 1.4; hT -= u * 0.6; }
  const kickCam = blitz.gl && blitz.kind === 'kick' && B && (B.st === 'tee' || (B.st === 'air' && B.kind === 'kick'));
  if (kickCam) { yawT += BLZ_KICKCAM.yaw * c.dir; backT = BLZ_KICKCAM.back; hT = BLZ_KICKCAM.h; pitchT = BLZ_KICKCAM.pitch; }
  if (blitz.gl) {
    let dy = yawT - c.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const kr = Math.min(1, dt * 3.4);
    c.yaw += dy * kr; c.back += (backT - c.back) * kr; c.h += (hT - c.h) * kr; c.pitch += (pitchT - c.pitch) * kr;
  } else { c.yaw = yawT; c.back = backT; c.h = hT; c.pitch = pitchT; }
  blzCamTrig(c);
  const fxc = BLZ_MID + (fx - BLZ_MID) * 0.72;
  const tz = fz - c.cyw * c.back, tx = fxc - c.syw * c.back;
  const k = Math.min(1, dt * (ph === 'live' ? 5 : 3));
  c.z += (tz - c.z) * k; c.x += (tx - c.x) * Math.min(1, dt * (kickCam ? 4 : 3));
}

// ---- particles ---------------------------------------------------------------------------------
function blzBurst(x, z, y, n, col) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = blzRnd(2, 6);
    blitz.parts.push({ x, z, y, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: blzRnd(2, 6), t: 0, T: blzRnd(0.35, 0.7), c: col, k: 'spark' });
  }
}
function blzConfetti(x, z, team) {
  const T = blzTeam(team);
  for (let i = 0; i < 40; i++) {
    blitz.parts.push({ x: x + blzRnd(-3, 3), z: z + blzRnd(-3, 3), y: blzRnd(3, 6), vx: blzRnd(-2, 2), vz: blzRnd(-2, 2), vy: blzRnd(2, 6),
      t: 0, T: blzRnd(1.2, 2.2), c: blzPick([T.c1, T.c2, '#ffffff']), k: 'conf' });
  }
}
function blzParts(dt) {
  // flames off anyone on a burning team who's moving, and off the ball
  for (const t of [0, 1]) {
    if (!blzOnFire(t)) continue;
    for (const p of blitz.players) {
      if (p.team !== t || Math.random() > dt * (p === blitz.carrier ? 30 : 6)) continue;
      blitz.parts.push({ x: p.x + blzRnd(-0.4, 0.4), z: p.z + blzRnd(-0.4, 0.4), y: blzRnd(0.3, 1.6), vx: -p.vx * 0.2, vz: -p.vz * 0.2, vy: blzRnd(1.5, 3),
        t: 0, T: blzRnd(0.3, 0.55), c: '#ff8a1e', k: 'fire' });
    }
  }
  const B = blitz.ball;
  if (B && B.st === 'air' && B.kind === 'pass' && B.from && blzOnFire(B.from.team)) {
    for (let i = 0; i < 2; i++) blitz.parts.push({ x: B.x, z: B.z, y: B.y, vx: 0, vz: 0, vy: 1, t: 0, T: 0.35, c: '#ffb020', k: 'fire' });
  }
  for (const q of blitz.parts) {
    q.t += dt;
    q.x += q.vx * dt; q.z += q.vz * dt; q.y += q.vy * dt;
    if (q.k === 'spark') q.vy -= 14 * dt;
    else if (q.k === 'conf') { q.vy -= 4 * dt; q.vx *= 0.98; }
  }
  blitz.parts = blitz.parts.filter((q) => q.t < q.T && q.y > -0.2);
  if (blitz.parts.length > 500) blitz.parts.splice(0, blitz.parts.length - 500);
}

function blzFinal() {
  const s = blitz.score, won = s[0] > s[1], tie = s[0] === s[1];
  blitz.phase = 'final'; blitz.finalT = 0;
  blzSfx('horn');
  if (won) {
    blzEarn(120 + Math.min(35, s[0] - s[1]) * 4, 'WIN');
    if (blitz.cfg.key === 'pro') { try { localStorage.setItem('nugBlitzPro', '1'); } catch (e) { } }
    if (blitz.cfg.key === 'allpro') { try { localStorage.setItem('nugBlitzChamp', '1'); } catch (e) { } }
    blzRoar(1, 3); blzSfx('td');
    for (const p of blitz.players) if (p.team === 0) p.celebT = 6;
    blzSay('WHAT A GAME! ' + blzTeam(0).full + ' WIN IT!', true);
  } else if (tie) { blzEarn(40, 'TIE'); blzSay('a tie. nobody is happy.', true); }
  else { blzSfx('bad'); blzSay(blzTeam(1).full + ' WIN IT.', true); }
  try { ArcadeKit.saveBest('blitz', blitz.cfg.key, blitz.earned); } catch (e) { }
  blitz.result = { won, tie, unlock: won && blitz.cfg.key === 'pro', champ: won && blitz.cfg.key === 'allpro' };
}

function stepBlitz(dt, w, h) {
  syncBlitz();
  if (!blitz.on) return;
  if (Math.abs(blitz.cv.width - Math.round(Math.max(240, Math.min(1000, w * BLZ_RES / h)))) > 2) blitzLayout();
  blzPollPad();
  dt = Math.min(dt, 0.05);
  // the hit cam: a beat of slow motion on the biggest collisions
  if (blitz.slowT > 0) { blitz.slowT -= dt; dt *= 0.32; }
  if (!blitz.freeze && !blitz.paused && blitz.phase !== 'tier') blitzUpdate(dt);
  blzMusicFrame();
  blzDraw();
}
// which song, which stems, and the chant
function blzMusicFrame() {
  if (!blitz.sfx.ctx) return;
  const ph = blitz.phase;
  let want = 'theme';
  if (ph === 'final') want = blitz.result && blitz.result.won ? 'win' : blitz.result && blitz.result.tie ? 'theme' : 'lose';
  else if (ph !== 'teams' && ph !== 'vs' && ph !== 'tier' && ph !== 'idle' && blitz.stats) {
    want = blitz.halftime ? 'half' : blitz.q >= 4 ? 'q4' : blitz.q === 3 ? 'q3' : blitz.q === 2 ? 'q2' : 'q1';
  }
  blzMusPlay(want);
  blzMusMix(blitz.paused ? 'low' : ph === 'live' ? 'live' : ph === 'pre' ? 'snap' : ph === 'replay' ? 'low' : 'full');
  blzChant(!blitz.auto && !blitz.paused && blitz.stats && blzHuman(1 - blitz.poss) && (ph === 'pre' || ph === 'call') && blitz.kind !== 'kick');
  blzMusTick();
  blzBoothTick();
  // the recorded stands take over from the noise bed once they've loaded
  const S = blitz.sfx;
  if (S.crowd && !S.bedSrc && S.crowdGain && (S.bedSrc = blzDiscBed(S.crowdGain))) S.crowdNoise.gain.setTargetAtTime(0, S.ctx.currentTime, 0.8);
}

// ---- the VS screen codes ------------------------------------------------------------------------
function blzCodeTap(i) {
  if (blitz.phase !== 'vs') return;
  blitz.codeIn[i] = (blitz.codeIn[i] + 1) % 6;
  blzSfx('select');
}
function blzCodeDir(dirKey) {
  if (blitz.phase !== 'vs') return;
  const k = blitz.codeIn.join('') + dirKey;
  const code = BLZ_CODES.find((c) => c.k === k);
  if (code) {
    blitz.codes[code.id] = true;
    blitz.codeMsg = { text: code.name, t: 2, ok: true };
    blzSfx('code');
    blzSay(code.name + '!');
  } else if (blitz.codeIn.some((n) => n > 0)) {
    blitz.codeMsg = { text: 'NO CODE', t: 1, ok: false };
  }
  blitz.codeIn = [0, 0, 0];
}

// ==== drawing ===================================================================================
// A real perspective camera, behind the offense, pitched down at the ball.
// Everything is projected per frame onto a ~384-px-tall canvas that CSS
// smooths up to the window: chunky but soft, like the N64 did it.

// The camera can yaw now (the kickoff shot, the swing behind a returner):
// right = (cos yaw, −sin yaw), forward = (sin yaw, cos yaw) in x/z. yaw 0
// looks down +z; yaw π is the old dir −1. blzGLMatrix is this, as a matrix.
function blzProj(X, Y, Z) {
  const c = blitz.cam;
  const wx = X - c.x, wz = Z - c.z;
  const dx = wx * c.cyw - wz * c.syw, dy = Y - c.h, dz = wx * c.syw + wz * c.cyw;
  const zc = -dy * c.s + dz * c.c;
  if (zc < 0.5) return null;
  const yc = dy * c.c + dz * c.s;
  const k = blitz.F / zc;
  return { x: blitz.W / 2 + dx * k, y: blitz.cy - yc * k, k, zc };
}
// world z range that's in front of the lens, by camera distance
function blzZAt(dz) { return blitz.cam.z + dz * blitz.cam.dir; }
function blzClipZ(z0, z1, near) {
  const c = blitz.cam, d = c.dir;
  let a = (z0 - c.z) * d, b = (z1 - c.z) * d;
  if (a > b) { const t = a; a = b; b = t; }
  const lo = near == null ? 3 : near, hi = 175;
  if (b < lo || a > hi) return null;
  a = Math.max(a, lo); b = Math.min(b, hi);
  return [blzZAt(a), blzZAt(b)];
}
function blzPoly(g, pts, col) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath(); g.fill();
}
// a flat quad on the ground (or at height y), clipped to the lens
function blzGround(g, x0, x1, z0, z1, col, y) {
  const cl = blzClipZ(z0, z1);
  if (!cl) return;
  y = y || 0;
  const a = blzProj(x0, y, cl[0]), b = blzProj(x1, y, cl[0]), cc = blzProj(x1, y, cl[1]), dd = blzProj(x0, y, cl[1]);
  if (!a || !b || !cc || !dd) return;
  blzPoly(g, [a, b, cc, dd], col);
}
function blzMix(hex, k, to) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(hex), b = p(to || '#ffffff');
  return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',') + ')';
}
function blzHash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

function blzDraw() {
  const g = blitz.g, W = blitz.W, H = blitz.H, ov = blitz.ov || 1;
  if (!g) return;
  g.setTransform(ov, 0, 0, ov, 0, 0);
  const ph = blitz.phase;
  const menu = ph === 'tier' || ph === 'idle' || ph === 'vs' || ph === 'teams';
  if (blitz.glCv) blitz.glCv.style.visibility = menu || !blitz.gl ? 'hidden' : 'visible';
  if (ph === 'tier' || ph === 'idle') { blzDrawIdle(g, W, H); return; }
  if (ph === 'vs') { blzDrawVS(g, W, H); return; }
  if (ph === 'teams') { blzDrawTeams(g, W, H); return; }
  if (ph === 'replay' && blitz.replay) { blzDrawReplay(g, W, H); return; }
  let sx = 0, sy = 0;
  if (blitz.shakeT > 0) { sx = (Math.random() - 0.5) * blitz.shakeMag; sy = (Math.random() - 0.5) * blitz.shakeMag; }
  if (blitz.gl && blzGLRender(sx, sy)) {
    g.clearRect(0, 0, W, H);
    g.setTransform(ov, 0, 0, ov, sx * ov, sy * ov);
    blzDrawOverlay3D(g, W, H);
  } else {
    g.setTransform(ov, 0, 0, ov, sx * ov, sy * ov);
    blzDrawWorld(g, W, H);
  }
  g.setTransform(ov, 0, 0, ov, 0, 0);
  if (blitz.camFlipT > 0) {
    const u = 1 - Math.abs(blitz.camFlipT - 0.17) / 0.17;
    g.fillStyle = 'rgba(255,255,255,' + (u * 0.9).toFixed(3) + ')';
    g.fillRect(0, 0, W, H);
  }
  blzDrawBubbles(g, W, H);
  blzDrawHud(g, W, H);
  // a banner left over from the last whistle sits UNDER the menus, not on them
  const callMenu = ph === 'call' || ph === 'pat';
  if (callMenu) blzDrawBanner(g, W, H);
  if (ph === 'call') blzDrawCall(g, W, H);
  if (ph === 'pat') blzDrawPat(g, W, H);
  if (!callMenu) blzDrawBanner(g, W, H);
  if (ph === 'final') blzDrawFinal(g, W, H);
  // your kicker waits for the button
  if (ph === 'live' && blitz.kind === 'kick' && blitz.kickWait && ((blitz.t * 2) | 0) % 2 === 0) {
    const k = blitz.inputMode === 'pad' ? 'A' : blitz.inputMode === 'touch' ? 'PASS' : 'SPACE';
    blzTextC(g, k + ' = KICK OFF   ·   TURBO + ' + k + ' = ONSIDE KICK', W / 2, H * 0.78, 12 * blitz.ui, '#ffffff');
  }
  blzDrawTouch(g, W, H);
  if (blitz.paused) {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, W, H);
    blzTextC(g, 'PAUSED', W / 2, H / 2 - 10, 30, '#ffd23a');
    blzTextC(g, 'ESC RESUME · Q QUIT · M SOUND · V ANNOUNCER', W / 2, H / 2 + 18, 10, '#bfc6ff');
  }
}

// text: bold italic with a hard black outline — the Blitz look
function blzText(g, str, x, y, size, col, align, outline) {
  g.font = '900 italic ' + Math.round(size) + 'px Impact, "Arial Black", "Helvetica Neue", sans-serif';
  g.textAlign = align || 'left'; g.textBaseline = 'middle';
  if (outline !== false) { g.lineWidth = Math.max(2, size * 0.18); g.strokeStyle = '#000'; g.lineJoin = 'round'; g.strokeText(str, x, y); }
  g.fillStyle = col; g.fillText(str, x, y);
}
function blzTextC(g, str, x, y, size, col) { blzText(g, str, x, y, size, col, 'center'); }

function blzDrawIdle(g, W, H) {
  g.fillStyle = '#05060c'; g.fillRect(0, 0, W, H);
  blzTextC(g, 'NUGGET BLITZ', W / 2, H * 0.3, 40, '#ffd23a');
}

// ---- textures ---------------------------------------------------------------------------------
// The N64 look is TEXTURE: grainy turf with the lines and the big sideways
// numbers painted into it, a crowd that's a wall of noisy pixels, ad boards.
// So the field is ONE canvas (world yards × BLZ_TEX.ppy), built once per
// matchup, and drawn onto the ground in perspective as a grid of affine
// triangles (blzTri) — thin rows near the lens so the lines stay straight.
const BLZ_TEX = { ppy: 8, x0: -12, z0: -12, w: BLZ_WID + 24, l: BLZ_LEN + 24 };
const BLZ_ADS = [
  ['HOWMANYNUGGETS.COM', '#ffd23a', '#7a1010'], ['NUGGET BLITZ', '#d6352a', '#ffffff'], ['DRINK SAUCE', '#102a5a', '#26e0ff'],
  ['GREASE GARAGE', '#1a1a22', '#ff8a1e'], ['NOODLE NUG', '#5a1010', '#ffd23a'], ['DIP HOP NIGHTLY', '#2a0f3a', '#ff2fa0'],
  ['NO REFS', '#f2f2f2', '#d6352a'], ['FRYER OIL CO.', '#1a3a1a', '#9aff6a'],
];

function blzCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// grain: every pixel nudged a little, the way a 64×64 N64 texture looked blown up
function blzGrain(g, w, h, amt, seed) {
  const id = g.getImageData(0, 0, w, h), d = id.data;
  let s = seed || 1;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const n = ((s / 2147483647) - 0.5) * amt;
    d[i] += n; d[i + 1] += n * 1.15; d[i + 2] += n * 0.6;
  }
  g.putImageData(id, 0, 0);
}

function blzBuildField() {
  const key = blitz.teams.join('|') + (blitz.codes.night ? 'n' : '');
  if (blitz.fieldTex && blitz.fieldKey === key) return blitz.fieldTex;
  blitz.fieldTex = blzPaintField(BLZ_TEX.ppy); blitz.fieldKey = key;
  return blitz.fieldTex;
}
// the whole field at P px a yard (8 for the canvas renderer, 14 for the polygons)
function blzPaintField(P) {
  const W = Math.round(BLZ_TEX.w * P), L = Math.round(BLZ_TEX.l * P);
  const c = blzCanvas(W, L), g = c.getContext('2d');
  const X = (x) => (x - BLZ_TEX.x0) * P, Z = (z) => (z - BLZ_TEX.z0) * P;
  const night = !!blitz.codes.night;
  // the sideline turf, then the field in five-yard bands
  g.fillStyle = night ? '#1c4420' : '#2c6a2a'; g.fillRect(0, 0, W, L);
  for (let z = 10; z < 110; z += 5) {
    g.fillStyle = ((z / 5) | 0) % 2 ? (night ? '#25602a' : '#3a8a34') : (night ? '#2a6a2e' : '#42953b');
    g.fillRect(X(0), Z(z), BLZ_WID * P, 5 * P);
  }
  // end zones: whoever DEFENDS it, team color + diagonal pinstripes + the name
  const ez = (z0, team, flipY) => {
    const T = blzTeam(team);
    g.fillStyle = T.ez; g.fillRect(X(0), Z(z0), BLZ_WID * P, 10 * P);
    g.save(); g.beginPath(); g.rect(X(0), Z(z0), BLZ_WID * P, 10 * P); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = P * 0.8;
    for (let x = -10; x < BLZ_WID + 10; x += 2.4) { g.beginPath(); g.moveTo(X(x), Z(z0)); g.lineTo(X(x + 10), Z(z0 + 10)); g.stroke(); }
    g.restore();
    g.save();
    g.translate(X(BLZ_MID), Z(z0 + 5));
    // the end zone at the far end of each camera reads upright for that camera
    if (flipY) g.scale(1, -1); else g.scale(-1, 1);
    g.font = '900 italic ' + Math.round(P * 6.5) + 'px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(T.name).width, maxW = (BLZ_WID - 6) * P;
    if (tw > maxW) g.scale(maxW / tw, 1);
    g.lineWidth = P * 0.7; g.strokeStyle = blzMix(T.c2, 0.0); g.strokeText(T.name, 0, 0);
    g.fillStyle = '#ffffff'; g.fillText(T.name, 0, 0);
    g.restore();
  };
  ez(0, 0, false);
  ez(110, 1, true);
  const wl = night ? '#d8deea' : '#f4f4ee';
  g.fillStyle = wl;
  // border, goal lines, yard lines
  g.fillRect(X(-0.6), Z(0), 0.6 * P, 120 * P); g.fillRect(X(BLZ_WID), Z(0), 0.6 * P, 120 * P);
  g.fillRect(X(-0.6), Z(-0.6), (BLZ_WID + 1.2) * P, 0.6 * P); g.fillRect(X(-0.6), Z(120), (BLZ_WID + 1.2) * P, 0.6 * P);
  for (let z = 10; z <= 110; z += 5) g.fillRect(X(0), Z(z) - P * (z === 10 || z === 110 ? 0.3 : 0.14), BLZ_WID * P, P * (z === 10 || z === 110 ? 0.6 : 0.28));
  // hash marks + sideline ticks every yard
  for (let z = 11; z < 110; z++) {
    if (z % 5 === 0) continue;
    for (const hx of [0.4, 23.1, 29.5, BLZ_WID - 1.2]) g.fillRect(X(hx), Z(z) - P * 0.08, 0.8 * P, P * 0.16);
  }
  // the big numbers, lying on their sides, tops toward the sideline, + arrows
  g.font = '900 ' + Math.round(P * 2.6) + 'px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let z = 20; z <= 100; z += 10) {
    const n = String(z <= 60 ? z - 10 : 110 - z);
    for (const side of [-1, 1]) {
      const x = side < 0 ? 10.5 : BLZ_WID - 10.5;
      g.save(); g.translate(X(x), Z(z)); g.rotate(side < 0 ? Math.PI / 2 : -Math.PI / 2);
      g.fillStyle = wl;
      g.fillText(n[0], -P * 1.25, 0); if (n[1]) g.fillText(n[1], P * 1.25, 0);
      // arrow toward the nearer goal (the 50 has none)
      if (z !== 60) {
        const a = (z < 60 ? -1 : 1) * (side < 0 ? 1 : -1);
        g.beginPath(); g.moveTo(a * P * 3.4, -P * 0.9); g.lineTo(a * P * 2.7, -P * 1.3); g.lineTo(a * P * 2.7, -P * 0.5); g.fill();
      }
      g.restore();
    }
  }
  // midfield: the league shield (a nugget on it, naturally)
  g.save(); g.translate(X(BLZ_MID), Z(60)); g.scale(1, -1);
  const s = P * 2.6;
  const shield = () => { g.beginPath(); g.moveTo(-s, -s * 0.9); g.lineTo(s, -s * 0.9); g.lineTo(s, s * 0.2); g.quadraticCurveTo(s * 0.9, s * 0.9, 0, s * 1.2); g.quadraticCurveTo(-s * 0.9, s * 0.9, -s, s * 0.2); g.closePath(); };
  g.fillStyle = '#ffffff'; shield(); g.fill();
  g.lineWidth = P * 0.35; g.strokeStyle = '#1d3a9a'; shield(); g.stroke();
  g.fillStyle = '#1d3a9a'; g.fillRect(-s, -s * 0.9, s * 2, s * 0.55);
  for (let i = 0; i < 5; i++) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(-s * 0.7 + i * s * 0.35, -s * 0.62, P * 0.18, 0, 7); g.fill(); }
  g.fillStyle = '#d99a3c'; g.beginPath(); g.ellipse(0, s * 0.35, s * 0.55, s * 0.4, 0.2, 0, 7); g.fill();
  g.font = '900 italic ' + Math.round(P * 1.5) + 'px Impact, sans-serif';
  g.fillStyle = '#c8321f'; g.fillText('NFN', 0, s * 0.33);
  g.restore();
  blzGrain(g, W, L, night ? 16 : 22, 7);
  return c;
}

// the crowd: a wall of noisy colored pixels with aisles, and an upper-deck band
function blzBuildCrowd() {
  if (blitz.crowdTex && blitz.crowdKey === blitz.teams.join('|')) return blitz.crowdTex;
  const w = 192, h = 128, c = blzCanvas(w, h), g = c.getContext('2d');
  const A = blzTeam(0), B = blzTeam(1);
  const pal = [A.c1, A.c2, B.c1, '#6a2a22', '#8a3a2a', '#a8584a', '#d8c8b8', '#3a2a2a', '#c87a5a', '#e8e0d0', '#4a3a5a'];
  g.fillStyle = '#3a2a2e'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const r = blzHash(x * 7.13 + y * 13.7);
    g.fillStyle = pal[(r * pal.length) | 0];
    g.fillRect(x, y, 2, 2);
  }
  // aisle stairs every quarter
  for (let ax = 0; ax < w; ax += 48) {
    g.fillStyle = '#9a8a80'; g.fillRect(ax + 20, 0, 6, h);
    g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 0; y < h; y += 4) g.fillRect(ax + 20, y, 6, 1);
  }
  // row shading: each tier a touch darker at its back
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
  // the walkway between decks
  g.fillStyle = '#d8c8b0'; g.fillRect(0, h * 0.62, w, 4);
  g.fillStyle = '#1a1a22'; for (let ax = 8; ax < w; ax += 48) g.fillRect(ax, h * 0.64, 18, 7);
  blzGrain(g, w, h, 18, 3);
  blitz.crowdTex = c; blitz.crowdKey = blitz.teams.join('|');
  return c;
}
function blzBuildAds() {
  if (blitz.adTex) return blitz.adTex;
  const segW = 160, h = 24, c = blzCanvas(segW * BLZ_ADS.length, h), g = c.getContext('2d');
  BLZ_ADS.forEach((ad, i) => {
    const x = i * segW;
    g.fillStyle = '#1a3a8a'; g.fillRect(x, 0, segW, h);
    g.fillStyle = ad[1]; g.fillRect(x + 6, 3, segW - 12, h - 6);
    g.font = '900 italic 14px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = ad[2]; g.fillText(ad[0], x + segW / 2, h / 2 + 1, segW - 20);
  });
  g.fillStyle = '#c8d0e8'; g.fillRect(0, 0, c.width, 2);
  blitz.adTex = c;
  return c;
}

// one textured triangle: the affine map from texture (u,v) to the screen
function blzTri(g, img, s0, s1, s2, d0, d1, d2) {
  const du1 = s1[0] - s0[0], dv1 = s1[1] - s0[1], du2 = s2[0] - s0[0], dv2 = s2[1] - s0[1];
  const det = du1 * dv2 - du2 * dv1;
  if (Math.abs(det) < 1e-6) return;
  const dx1 = d1.x - d0.x, dy1 = d1.y - d0.y, dx2 = d2.x - d0.x, dy2 = d2.y - d0.y;
  const a = (dx1 * dv2 - dx2 * dv1) / det, b = (dy1 * dv2 - dy2 * dv1) / det;
  const c = (dx2 * du1 - dx1 * du2) / det, d = (dy2 * du1 - dy1 * du2) / det;
  const e = d0.x - a * s0[0] - c * s0[1], f = d0.y - b * s0[0] - d * s0[1];
  // fatten the clip a hair so the seams don't show
  const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
  g.save();
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const p = i === 0 ? d0 : i === 1 ? d1 : d2;
    const ex = p.x - cx, ey = p.y - cy, m = Math.hypot(ex, ey) || 1;
    if (i === 0) g.moveTo(p.x + ex / m * 0.7, p.y + ey / m * 0.7); else g.lineTo(p.x + ex / m * 0.7, p.y + ey / m * 0.7);
  }
  g.closePath(); g.clip();
  g.transform(a, b, c, d, e, f);
  const u0 = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0]) - 1)), v0 = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1]) - 1));
  const u1 = Math.min(img.width, Math.ceil(Math.max(s0[0], s1[0], s2[0]) + 1)), v1 = Math.min(img.height, Math.ceil(Math.max(s0[1], s1[1], s2[1]) + 1));
  if (u1 > u0 && v1 > v0) g.drawImage(img, u0, v0, u1 - u0, v1 - v0, u0, v0, u1 - u0, v1 - v0);
  g.restore();
}
// a textured quad from four world points and their texture coords
function blzTexQuad(g, img, pts, uv) {
  const q = pts.map((p) => blzProj(p[0], p[1], p[2]));
  if (!q[0] || !q[1] || !q[2] || !q[3]) return;
  const W = blitz.W, H = blitz.H;
  if (Math.max(q[0].x, q[1].x, q[2].x, q[3].x) < -2 || Math.min(q[0].x, q[1].x, q[2].x, q[3].x) > W + 2) return;
  if (Math.max(q[0].y, q[1].y, q[2].y, q[3].y) < -2 || Math.min(q[0].y, q[1].y, q[2].y, q[3].y) > H + 2) return;
  blzTri(g, img, uv[0], uv[1], uv[2], q[0], q[1], q[2]);
  blzTri(g, img, uv[0], uv[2], uv[3], q[0], q[2], q[3]);
}

function blzDrawField(g) {
  const tex = blzBuildField(), P = BLZ_TEX.ppy, c = blitz.cam;
  const x0 = BLZ_TEX.x0, x1 = BLZ_TEX.x0 + BLZ_TEX.w, zLo = BLZ_TEX.z0, zHi = BLZ_TEX.z0 + BLZ_TEX.l;
  const cols = 8, cw = (x1 - x0) / cols;
  // rows marched outward from the lens: thin near (straight lines), fat far (cheap)
  let dz = 3;
  while (dz < 170) {
    const step = blzClamp(dz * 0.11, 2, 12);
    let za = blzZAt(dz), zb = blzZAt(dz + step);
    if (za > zb) { const t = za; za = zb; zb = t; }
    dz += step;
    if (zb < zLo || za > zHi) continue;
    za = Math.max(za, zLo); zb = Math.min(zb, zHi);
    for (let i = 0; i < cols; i++) {
      const xa = x0 + i * cw, xb = xa + cw;
      const U = (x) => (x - x0) * P, V = (z) => (z - zLo) * P;
      blzTexQuad(g, tex, [[xa, 0, za], [xb, 0, za], [xb, 0, zb], [xa, 0, zb]],
        [[U(xa), V(za)], [U(xb), V(za)], [U(xb), V(zb)], [U(xa), V(zb)]]);
    }
  }
}

// the bowl: ad wall, raked lower deck, the walkway, upper deck, the blue facade
function blzDrawStands(g, night) {
  const crowd = blzBuildCrowd(), ads = blzBuildAds(), c = blitz.cam;
  const CW = crowd.width, CH = crowd.height, AW = ads.width, AH = ads.height;
  const seg = 8;                                   // yards of stand per textured strip
  const zs = [];
  for (let z = -40; z < BLZ_LEN + 40; z += seg) zs.push(z);
  zs.sort((a, b) => (b - c.z) * c.dir - (a - c.z) * c.dir); // far first
  const XW = 4.5;                                 // the wall stands 4.5 yds off the sideline
  const rakeOut = 26, rakeUp = 19;
  for (const side of [-1, 1]) {
    const xIn = side < 0 ? -XW : BLZ_WID + XW, xOut = side < 0 ? -XW - rakeOut : BLZ_WID + XW + rakeOut;
    for (const z of zs) {
      const cl = blzClipZ(z, z + seg, 4);
      if (!cl) continue;
      const za = Math.min(cl[0], cl[1]), zb = Math.max(cl[0], cl[1]);
      const ua = (((za % 24) + 24) % 24) / 24 * CW, ub = ua + (zb - za) / 24 * CW;
      if (ub > CW + 0.5) continue; // (a strip never straddles the tile seam: 24 is a multiple of 8)
      // the crowd, bottom row at the wall top, raked back and up
      blzTexQuad(g, crowd, [[xIn, 1.6, za], [xIn, 1.6, zb], [xOut, rakeUp, zb], [xOut, rakeUp, za]],
        [[ua, CH], [ub, CH], [ub, 0], [ua, 0]]);
      // the upper-deck facade: the blue band with the white pinstripe
      const fa = blzProj(xOut, rakeUp, za), fb = blzProj(xOut, rakeUp, zb), fc = blzProj(xOut, rakeUp + 3.5, zb), fd = blzProj(xOut, rakeUp + 3.5, za);
      if (fa && fb && fc && fd) {
        blzPoly(g, [fa, fb, fc, fd], night ? '#122a6a' : '#2a4aa8');
        const ga = blzProj(xOut, rakeUp + 2.6, za), gb = blzProj(xOut, rakeUp + 2.6, zb);
        if (ga && gb) { g.strokeStyle = '#c8d4f0'; g.lineWidth = Math.max(1, ga.k * 0.15); g.beginPath(); g.moveTo(ga.x, ga.y); g.lineTo(gb.x, gb.y); g.stroke(); }
        const ra = blzProj(xOut - side * 6, rakeUp + 8, za), rb = blzProj(xOut - side * 6, rakeUp + 8, zb);
        if (ra && rb) blzPoly(g, [fd, fc, rb, ra], night ? '#08080e' : '#1a1a24');
      }
      // the padded wall with the ads on it
      const aa = (((za % 64) + 64) % 64) / 64 * AW, ab = aa + (zb - za) / 64 * AW;
      if (ab <= AW + 0.5) blzTexQuad(g, ads, [[xIn, 0, za], [xIn, 0, zb], [xIn, 1.6, zb], [xIn, 1.6, za]], [[aa, AH], [ab, AH], [ab, 0], [aa, 0]]);
      // the wall's top rail
      const r0 = blzProj(xIn, 1.6, za), r1 = blzProj(xIn, 1.6, zb);
      if (r0 && r1) { g.strokeStyle = '#d8dce8'; g.lineWidth = Math.max(1, r0.k * 0.12); g.beginPath(); g.moveTo(r0.x, r0.y); g.lineTo(r1.x, r1.y); g.stroke(); }
    }
  }
  // the end stands behind each goal (only the far one is ever in frame)
  for (const ezw of [-XW - 2, BLZ_LEN + XW + 2]) {
    const dzw = (ezw - c.z) * c.dir;
    if (dzw < 6) continue;
    const out = ezw + (ezw < 0 ? -rakeOut : rakeOut);
    for (let x = -40; x < BLZ_WID + 40; x += seg) {
      const ua = (((x % 24) + 24) % 24) / 24 * CW, ub = ua + seg / 24 * CW;
      blzTexQuad(g, crowd, [[x, 1.6, ezw], [x + seg, 1.6, ezw], [x + seg, rakeUp, out], [x, rakeUp, out]], [[ua, CH], [ub, CH], [ub, 0], [ua, 0]]);
      const aa = (((x % 64) + 64) % 64) / 64 * AW, ab = aa + seg / 64 * AW;
      blzTexQuad(g, ads, [[x, 0, ezw], [x + seg, 0, ezw], [x + seg, 1.6, ezw], [x, 1.6, ezw]], [[aa, AH], [ab, AH], [ab, 0], [aa, 0]]);
    }
  }
}

// orange sideline markers, the down box style of the cart
function blzDrawPylons(g, items) {
  for (let z = 10; z <= 110; z += 10) {
    for (const x of [-1.6, BLZ_WID + 1.6]) {
      const P = blzProj(x, 0, z);
      if (!P || P.k < 1.2) continue;
      items.push({ zc: P.zc, k: 'y', x, z, P, n: z === 10 || z === 110 ? '' : String(z <= 60 ? z - 10 : 110 - z) });
    }
  }
}
function blzDrawPylon(g, it) {
  const { x, z } = it, hw = 0.45, h = 0.75;
  const a = blzProj(x - hw, 0, z), b = blzProj(x + hw, 0, z), cc = blzProj(x + hw, h, z), d = blzProj(x - hw, h, z);
  if (!a || !b || !cc || !d) return;
  const dir = blitz.cam.dir;
  const t0 = blzProj(x - hw, h, z + dir * 0.4), t1 = blzProj(x + hw, h, z + dir * 0.4);
  if (t0 && t1) blzPoly(g, [d, cc, t1, t0], '#ff9a4a');
  blzPoly(g, [a, b, cc, d], '#e8561a');
  if (it.n && it.P.k > 7) {
    const m = blzProj(x, h * 0.5, z);
    g.font = '900 ' + Math.round(m.k * 0.45) + 'px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.fillText(it.n, m.x, m.y);
  }
}

function blzDrawWorld(g, W, H) {
  const night = !!blitz.codes.night;
  // sky (what little of it the camera sees over the far stands)
  const sky = g.createLinearGradient(0, 0, 0, H * 0.4);
  sky.addColorStop(0, night ? '#02030a' : '#5a86d0'); sky.addColorStop(1, night ? '#0a0f26' : '#b8d2f0');
  g.fillStyle = sky; g.fillRect(-10, -10, W + 20, H + 20);
  blzGround(g, -60, BLZ_WID + 60, -60, BLZ_LEN + 60, night ? '#173a1a' : '#2a6428');
  // a narrow lens sees turf closer than the textured rows start: paint under them
  const nearY = blzProj(blitz.cam.x, 0, blzZAt(3.2));
  if (nearY && nearY.y < H) { g.fillStyle = night ? '#25602a' : '#3c8c36'; g.fillRect(-10, nearY.y - 2, W + 20, H - nearY.y + 12); }
  blzDrawField(g);
  blzDrawStands(g, night);
  // the scrimmage line and the line to gain, laid on the turf
  const ph = blitz.phase;
  if (ph === 'call' || ph === 'pre' || (ph === 'live' && blitz.pocket)) {
    blzGround(g, 0, BLZ_WID, blitz.los - 0.2, blitz.los + 0.2, 'rgba(70,130,255,0.85)', 0.01);
    if (blitz.kind !== 'kick' && blitz.firstAt !== blzGoal(blitz.poss)) blzGround(g, 0, BLZ_WID, blitz.firstAt - 0.2, blitz.firstAt + 0.2, 'rgba(255,225,40,0.9)', 0.01);
  }
  blzDrawCrowdFx(g, W, H);
  // the play art (the canvas renderer's version: lines on the turf)
  const art = blzRouteArt();
  if (art) for (const a of art) {
    g.globalAlpha = 0.8 * a.a; g.strokeStyle = a.col; g.lineCap = 'round'; g.lineJoin = 'round';
    let first = true, k = 2;
    g.beginPath();
    for (const q of a.pts) { const P = blzProj(q[0], 0.02, q[1]); if (!P) { first = true; continue; } k = Math.max(1.5, P.k * 0.45); if (first) g.moveTo(P.x, P.y); else g.lineTo(P.x, P.y); first = false; }
    g.lineWidth = k; g.stroke(); g.globalAlpha = 1;
  }
  // back to front: posts, pylons, people, ball, sparks
  const items = [];
  for (const p of blitz.players) {
    const P = blzProj(p.x, 0, p.z);
    if (P) items.push({ zc: P.zc, k: 'p', p, P });
  }
  const B = blitz.ball;
  if (B && !(B.st === 'held' && blitz.carrier)) { const P = blzProj(B.x, 0, B.z); if (P) items.push({ zc: P.zc - 0.05, k: 'b', P }); }
  for (const q of blitz.parts) { const P = blzProj(q.x, q.y, q.z); if (P) items.push({ zc: P.zc, k: 'q', q, P }); }
  for (const gz of [0, 120]) { const P = blzProj(BLZ_MID, 0, gz); if (P) items.push({ zc: P.zc + 0.5, k: 'g', z: gz }); }
  blzDrawPylons(g, items);
  items.sort((a, b) => b.zc - a.zc);
  for (const it of items) if (it.k === 'p') blzShadow(g, it.p, it.P);
  for (const it of items) {
    if (it.k === 'p') blzDrawPlayer(g, it.p, it.P);
    else if (it.k === 'b') blzDrawBall(g, B, it.P);
    else if (it.k === 'q') blzDrawPart(g, it.q, it.P);
    else if (it.k === 'g') blzDrawPosts(g, it.z);
    else if (it.k === 'y') blzDrawPylon(g, it);
  }
  // the human's marker: blue arrow with the 1, and the name in yellow
  const me = blitz.ctl;
  if (me && blzHuman(me.team) && ph !== 'final') blzDrawMarker(g, me);
  // the receiver icons
  blzDrawRcvIcons(g, W, H);
  if (night) {
    const v = g.createRadialGradient(W / 2, H * 0.6, H * 0.2, W / 2, H * 0.6, H * 0.9);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,10,0.55)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
}

function blzDrawPosts(g, z) {
  const P0 = blzProj(BLZ_MID, 0, z);
  if (!P0) return;
  const w = Math.max(1.5, P0.k * 0.2);
  g.strokeStyle = '#ffd23a'; g.lineWidth = w; g.lineCap = 'round';
  const line = (a, b) => { const A = blzProj(a[0], a[1], a[2]), B = blzProj(b[0], b[1], b[2]); if (!A || !B) return; g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke(); };
  const back = z === 0 ? -1.2 : 1.2;
  line([BLZ_MID, 0, z + back], [BLZ_MID, 3.3, z + back]);
  line([BLZ_MID, 3.3, z + back], [BLZ_MID, 3.3, z]);
  line([BLZ_MID - 3.1, 3.3, z], [BLZ_MID + 3.1, 3.3, z]);
  line([BLZ_MID - 3.1, 3.3, z], [BLZ_MID - 3.1, 11, z]);
  line([BLZ_MID + 3.1, 3.3, z], [BLZ_MID + 3.1, 11, z]);
}

function blzShadow(g, p, P) {
  const lying = p.downT > 0 || p.diveT > 0;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(P.x, P.y, P.k * BLZ_BS * (lying ? 1.1 : 0.62) / (1 + p.y * 0.3), P.k * BLZ_BS * 0.26, 0, 0, Math.PI * 2);
  g.fill();
}

// ---- the players: a skeleton, posed, projected, drawn back to front ------------------------------
// Each nugget is ~2 yds of joints in its own frame (a = right, b = up, c =
// forward), run through a pose (run cycle, stance, throw, carry, block, dive,
// down, jump, celebrate), pitched for dives and pile-ups, then every joint goes
// through blzProj. Limbs are thick round-capped strokes with a dark outline
// pass, sorted by depth — so the camera sees a real figure from any angle:
// a numbered back running away from you, a facemask coming at you.
// the cart drew its players big (≈2.7 yds tall); so do we. Physics is unchanged.
const BLZ_BS = 1.4;
const BLZ_CRUST = '#d99a3c', BLZ_CRUST_D = '#a8691f', BLZ_CRUST_L = '#f0c068';

// two-bone arm IK (shoulder → elbow → hand), elbows bending out and down
function blzIK(S, T, sg) {
  const L1 = 0.3, L2 = 0.27;
  const d = [T[0] - S[0], T[1] - S[1], T[2] - S[2]];
  let dl = Math.hypot(d[0], d[1], d[2]) || 1e-3;
  const u = [d[0] / dl, d[1] / dl, d[2] / dl];
  dl = blzClamp(dl, 0.1, L1 + L2 - 0.005);
  const ca = blzClamp((L1 * L1 + dl * dl - L2 * L2) / (2 * L1 * dl), -1, 1), sa = Math.sqrt(1 - ca * ca);
  let P = [sg * 0.7, -0.7, -0.1];
  const pd = P[0] * u[0] + P[1] * u[1] + P[2] * u[2];
  P = blzN([P[0] - pd * u[0], P[1] - pd * u[1], P[2] - pd * u[2]]);
  return [
    [S[0] + u[0] * L1 * ca + P[0] * L1 * sa, S[1] + u[1] * L1 * ca + P[1] * L1 * sa, S[2] + u[2] * L1 * ca + P[2] * L1 * sa],
    [S[0] + u[0] * dl, S[1] + u[1] * dl, S[2] + u[2] * dl],
  ];
}
// who's reaching for the ball, and where (blzPose turns it into arm IK — no more
// arms up in the air: both hands go to the ball, a defender gets one hand on it)
function blzReachUpdate() {
  for (const p of blitz.players) { p.reach = null; p.reachOne = false; }
  const B = blitz.ball;
  if (!B || B.st !== 'air') return;
  const left = B.T - B.t;
  const at = (p) => (Math.hypot(p.x - B.x, p.z - B.z) < 2.6 ? [B.x, B.y, B.z] : [B.tx, B.ty + 0.25, B.tz]);
  if (B.kind === 'pass' || B.kind === 'tip' || B.kind === 'lat') {
    const team = B.from ? B.from.team : blitz.poss;
    for (const p of blitz.players) {
      if (p.downT > 0 || p.scr) continue;
      const dl = Math.hypot(p.x - B.tx, p.z - B.tz);
      if (p === blitz.target && left < 0.55) p.reach = at(p);
      else if (B.kind === 'tip' && dl < 2.6 && left < 0.45) p.reach = at(p);
      else if (p.team !== team && dl < 2.4 && left < 0.4) { p.reach = at(p); p.reachOne = true; }
    }
  } else if ((B.kind === 'kick' || B.kind === 'punt') && blitz.returner && left < 1.0) {
    const R = blitz.returner;
    if (R.downT <= 0 && !R.scr && Math.hypot(R.x - B.tx, R.z - B.tz) < 3) R.reach = [B.x, B.y, B.z];
  }
}

function blzPose(p) {
  const C = blitz.carrier, ph = p.anim * 2.1, t = blitz.t;
  const S = p.scr;   // a wrestling move is posing him
  const sp = Math.hypot(p.vx, p.vz), moving = S ? S.legs === 'run' : sp > 0.8 && p.downT <= 0 && !p.air;
  const J = {};
  const pre = blitz.phase === 'pre' || blitz.phase === 'call';
  const lineman = /^(C|LG|RG|DE1|DT|DE2)$/.test(p.pos);
  const scrim = blitz.kind === 'pass' || blitz.kind === 'run';
  // the spine: pelvis height and how far forward the trunk leans
  let pel = 1.0, tilt = 0.08, sway = 0, stance = '';
  if (pre && !moving && scrim && !S && !p.extra) {
    if (lineman) { stance = '3pt'; pel = 0.6; tilt = 1.05; }
    else if (p.pos === 'QB' && p.team === blitz.poss && !(blitz.play && blitz.play.fake)) { stance = 'uc'; pel = 0.82; tilt = 0.55; }
    else { stance = 'ready'; pel = 0.88; tilt = 0.32; }
  } else if (moving) tilt = p.turboOn || S ? 0.46 : p.showboat && p === C ? -0.08 : 0.26;
  if (p.eng && !S) { pel = 0.84; tilt = 0.75; }
  if (moving) pel += Math.abs(Math.sin(ph)) * 0.06 - 0.03;
  else if (!stance && p.downT <= 0) pel += Math.sin(t * 2.2 + p.num) * 0.008;      // breathing
  const celeb = p.celebT > 0 ? (p.celebKind != null ? p.celebKind : p.num % 3) : -1;
  if (celeb === 2) { sway = Math.sin(t * 9) * 0.12; pel = 0.95 + Math.abs(Math.sin(t * 9)) * 0.05; }
  // TAUNTS at the line (the whole body sells it; linemen in a stance just yell)
  const tk = !S && p.taunt && stance !== '3pt' ? p.taunt.kind : '';
  if (tk) {
    stance = '';
    if (tk === 'hop') pel = 1.0 + Math.abs(Math.sin(t * 9)) * 0.17;
    else if (tk === 'wiggle') { sway = Math.sin(t * 10) * 0.13; pel = 0.92; tilt = 0.05; }
    else if (tk === 'dance') { sway = Math.sin(t * 4.5) * 0.11; pel = 0.94 + Math.abs(Math.sin(t * 9)) * 0.05; tilt = 0.02; }
    else if (tk === 'roar') { tilt = 0.5 + Math.sin(t * 22) * 0.03; pel = 0.86; }
    else if (tk === 'chest') { tilt = -0.08; }
    else if (tk === 'slump') { tilt = 0.6; pel = 0.92; }
    else if (tk === 'jacks') { pel = 1.0 + Math.abs(Math.sin(t * 7.5 + p.num)) * 0.14; tilt = 0.02; }
    else { pel = 1.0; tilt = 0.06; }
  }
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const spine = (d) => [sway, pel + d * ct, d * st];
  J.pel = [sway, pel, 0];
  J.neck = spine(0.7);
  const ht = tilt * 0.45;                                // the head stays more upright than the trunk
  J.head = [sway, J.neck[1] + 0.21 * Math.cos(ht), J.neck[2] + 0.21 * Math.sin(ht)];
  const shc = spine(0.6);
  const jumpT = p.jumpT > 0;
  for (const sg of [-1, 1]) {
    const phs = ph + (sg > 0 ? Math.PI : 0);
    let th = 0.06, bend = 0.12;
    if (moving) { th = Math.sin(phs) * (p.turboOn ? 0.95 : 0.78); bend = 0.3 + Math.max(0, -Math.cos(phs)) * 1.25; }
    if (stance === '3pt') { th = sg < 0 ? 1.0 : 0.45; bend = 1.75; }
    else if (stance === 'uc' || stance === 'ready') { th = 0.34; bend = 0.68; }
    if (p.eng) { th = sg < 0 ? 0.65 : -0.15; bend = 0.75; }
    if (jumpT) { th = sg < 0 ? 0.8 : 0.35; bend = 1.4; }
    if (celeb === 1) { th = 0.15; bend = 0.3; }
    if (tk === 'hop') { th = 0.55; bend = 1.05; }
    else if (tk === 'wiggle') { th = Math.sin(t * 10 + (sg > 0 ? 0 : Math.PI)) * 0.22; bend = 0.32; }
    else if (tk === 'dance') { const u = Math.max(0, Math.sin(t * 9 + (sg > 0 ? 0 : Math.PI))); th = u * 0.95; bend = u * 1.2; }
    else if (tk === 'roar') { th = sg < 0 ? 0.45 : -0.1; bend = 0.5; }
    // the high-step into the end zone
    if (!S && moving && p.showboat && p === C) { th = 0.25 + Math.sin(phs) * 1.15; bend = th > 0.4 ? th * 0.9 + 0.45 : 0.2; }
    if (S && S.legs && S.legs !== 'run') {
      if (S.legs === 'kick') { th = 1.25; bend = 0.25; }
      else if (S.legs === 'split') { th = sg < 0 ? 0.9 : -0.55; bend = 0.35; }
      else if (S.legs === 'tuck') { th = 1.4; bend = 2.1; }
      else if (S.legs === 'sit') { th = 1.5; bend = 0.05; }
      else if (S.legs === 'stomp') { th = sg > 0 ? 1.15 : 0.05; bend = sg > 0 ? 1.7 : 0.1; }
    }
    const hx = sg * (0.15 + (tk === 'jacks' ? 0.13 * Math.abs(Math.sin(t * 7.5 + p.num)) : 0)) + sway;
    const hip = [hx, pel, 0];
    const knee = [hx + sg * 0.02, pel - 0.47 * Math.cos(th), 0.47 * Math.sin(th)];
    const foot = [hx + sg * 0.02, knee[1] - 0.47 * Math.cos(th - bend), knee[2] + 0.47 * Math.sin(th - bend)];
    const toe = [foot[0], foot[1] - 0.02, foot[2] + 0.2];
    J['hip' + sg] = hip; J['knee' + sg] = knee; J['foot' + sg] = foot; J['toe' + sg] = toe;
    const sh = [sg * 0.36 + sway, shc[1], shc[2]];
    // the arm pump: upper arm swings against the legs, forearm bent forward
    const al = moving ? -Math.sin(phs) * (p.turboOn ? 1.1 : 0.85) : 0.15;
    const ab = moving ? 1.35 : 0.35;
    let el = [sh[0] + sg * 0.07, sh[1] - 0.3 * Math.cos(al), sh[2] + 0.3 * Math.sin(al)];
    let hd = [el[0] - sg * 0.02, el[1] - 0.27 * Math.cos(al + ab), el[2] + 0.27 * Math.sin(al + ab)];
    // set a pose by offsets from the shoulder (x is OUTWARD)
    const at = (ex, ey, ez, qx, qy, qz) => { el = [sh[0] + sg * ex, sh[1] + ey, sh[2] + ez]; hd = [sh[0] + sg * qx, sh[1] + qy, sh[2] + qz]; };
    if (stance === '3pt') { if (sg > 0) { el = [sh[0] + 0.05, sh[1] - 0.28, sh[2] + 0.1]; hd = [sh[0] - 0.02, 0.06, sh[2] + 0.22]; } else at(0.08, -0.2, 0.08, -0.02, -0.3, 0.24); }
    else if (stance === 'uc') at(-0.06, -0.2, 0.2, -0.3, -0.3, 0.38);         // hands under the center
    else if (stance === 'ready') at(0.1, -0.24, 0.12, 0.02, -0.34, 0.3);
    if (p.eng) at(0.04, -0.1, 0.3, -0.12, -0.05, 0.58);
    if (p.diveT > 0) at(0.0, 0.05, 0.3, -0.12, 0.1, 0.6);
    if ((jumpT || p.catchT > 0) && !p.reach) at(-0.02, 0.28, 0.12, -0.16, 0.55, 0.28);
    if (celeb === 0 && sg > 0) { if (Math.sin(t * 6) > 0) at(0.05, 0.3, 0, 0.0, 0.62, 0.05); else at(0.08, -0.05, 0.25, 0.05, -0.32, 0.45); }
    if (celeb === 1) at(0.16, 0.02, 0, 0.1, 0.32, 0.02);                      // the flex
    if (celeb === 2) { const u = Math.sin(t * 9 + (sg > 0 ? 0 : Math.PI)); at(0.12, u > 0 ? 0.28 : -0.2, 0.05, 0.08, u > 0 ? 0.6 : -0.42, 0.12); }
    if (sg > 0 && p.throwT > 0) { if (p.throwT > 0.18) at(0.1, 0.22, -0.18, 0.0, 0.5, -0.32); else at(0.06, 0.05, 0.25, -0.06, -0.15, 0.55); }
    if (sg > 0 && p === C && !(blitz.pocket && p.pos === 'QB') && p.downT <= 0 && !p.air) at(-0.04, -0.3, 0.02, -0.2, -0.16, 0.24);
    if (sg < 0 && p.stiffT > 0) at(0.0, 0.0, 0.32, -0.02, 0.02, 0.6);
    if (tk) {
      const w = t * 7;
      if (tk === 'flex') at(0.16, 0.02, 0, 0.1, 0.32, 0.02);
      else if (tk === 'point') { if (sg > 0) at(0.02, 0.1, 0.3, -0.02, 0.2, 0.6); else at(0.14, -0.22, -0.04, 0.02, -0.12, 0.12); }
      else if (tk === 'beckon') { if (sg > 0) { const u = Math.sin(w * 1.3); at(0.04, 0.0, 0.32, -0.02, 0.06 + u * 0.16, 0.45 - u * 0.12); } else at(0.14, -0.22, -0.04, 0.02, -0.12, 0.12); }
      else if (tk === 'clap') { const u = (Math.sin(w * 1.6) + 1) / 2; at(0.06, -0.1, 0.22, -0.2 + u * 0.22, -0.02, 0.4); }
      else if (tk === 'chest') { const u = Math.sin(w * 1.4 + (sg > 0 ? 0 : Math.PI)) > 0; at(0.08, -0.12, 0.2, u ? -0.32 : -0.1, -0.02, u ? 0.14 : 0.32); }
      else if (tk === 'dance') { const u = Math.sin(t * 9 + (sg > 0 ? 0 : Math.PI)); at(0.12, u > 0 ? 0.26 : -0.18, 0.05, 0.1, u > 0 ? 0.58 : -0.4, 0.14); }
      else if (tk === 'hop') at(0.1, 0.26, 0.04, 0.02, 0.58, 0.08);
      else if (tk === 'wiggle') at(0.28, 0.02, 0.02, 0.56, 0.04 + Math.sin(t * 10) * 0.08, 0.02);
      else if (tk === 'roar') at(0.3, 0.06, 0.12, 0.56, 0.18, 0.18);
      else if (tk === 'cross') at(0.06, -0.24, 0.18, -0.36, -0.1, 0.22);
      else if (tk === 'slump') at(0.04, -0.3, 0.06, 0.04, -0.56, 0.16);
      else if (tk === 'palm') { if (sg > 0) at(0.02, 0.06, 0.24, -0.16, 0.34, 0.26); else at(0.14, -0.22, -0.04, 0.02, -0.12, 0.12); }
      else if (tk === 'pump') { if (sg > 0) { const u = Math.sin(t * 9) > 0; at(0.08, u ? 0.3 : 0.1, 0.05, 0.05, u ? 0.6 : 0.28, 0.08); } else at(0.14, -0.22, -0.04, 0.02, -0.12, 0.12); }
      else if (tk === 'jacks') { const u = Math.abs(Math.sin(t * 7.5 + p.num)); at(0.2 + u * 0.08, -0.2 + u * 0.48, 0.02, 0.24 + u * 0.12, -0.48 + u * 1.05, 0.04); }
    }
    // just caught it: both hands on the ball at his chest, then the tuck
    if (!S && p.secureT > 0 && p === C) at(-0.04, -0.28, 0.12, -0.3, -0.14, 0.3);
    if (!S && moving && p.showboat && p === C && sg > 0) at(0.05, 0.3, 0.05, 0.0, 0.62, 0.12);   // ball up, showing it to the crowd
    if (S && S.arms) {
      const A = S.arms;
      if (A === 'grab') at(-0.02, -0.12, 0.28, -0.26, -0.08, 0.52);
      else if (A === 'lift') at(0.08, 0.32, 0.1, -0.14, 0.62, 0.16);
      else if (A === 'clothes') { if (sg > 0) at(0.32, 0, 0, 0.62, 0.02, 0.05); else at(0.05, -0.25, 0.1, 0.02, -0.4, 0.25); }
      else if (A === 'spread') at(0.3, 0.02, 0, 0.58, 0.05, 0.02);
      else if (A === 'flex') at(0.16, 0.02, 0, 0.1, 0.32, 0.02);
      else if (A === 'elbow') { if (sg > 0) at(0.15, -0.28, 0.12, 0.05, 0, 0.05); else at(0.3, 0.1, 0, 0.55, 0.2, 0); }
      else if (A === 'flail') {
        const fa = t * 16 + (sg > 0 ? 0 : Math.PI) + p.num;
        el = [sh[0] + sg * 0.2, sh[1] + 0.24 * Math.cos(fa), sh[2] + 0.24 * Math.sin(fa)];
        hd = [sh[0] + sg * 0.36, sh[1] + 0.52 * Math.cos(fa), sh[2] + 0.52 * Math.sin(fa)];
      }
    }
    J['sh' + sg] = sh; J['el' + sg] = el; J['hd' + sg] = hd;
  }
  // reaching for the ball: both hands to it (one, for a defender's swat)
  if (p.reach && !S) {
    const rx = p.fz, rz = -p.fx, k = BLZ_BS;
    const dx = p.reach[0] - p.x, dz = p.reach[2] - p.z;
    const tA = (dx * rx + dz * rz) / k, tC = (dx * p.fx + dz * p.fz) / k, tB = (p.reach[1] - p.y) / k;
    for (const sg of p.reachOne ? [1] : [-1, 1]) {
      const ik = blzIK(J['sh' + sg], [tA + (p.reachOne ? 0 : sg * 0.09), Math.max(tB, 0.2), Math.max(tC, -0.25)], sg);
      J['el' + sg] = ik[0]; J['hd' + sg] = ik[1];
    }
  }
  // dives, pile-ups, launches and getting up pitch the whole figure about the hips
  let pitch = 0, drop = 0, roll = 0;
  if (S) { pitch = S.pitch || 0; drop = S.drop || 0; roll = S.roll || 0; }
  else if (p.air) { pitch = p.flipA || 0; drop = 0.3; }
  else if (p.diveT > 0) { pitch = 1.25; drop = 0.45; }
  else if (p.downT > 0) {
    pitch = p.lieBack ? -1.5 : 1.5; drop = 0.72;
    if (p.downT < 0.4) { const f = p.downT / 0.4; pitch *= f; drop *= f; }
  }
  J.fwd = [0, 0, 1]; J.up = [0, 1, 0];
  if (pitch || drop) {
    const cs = Math.cos(pitch), sn = Math.sin(pitch), py = pel;
    for (const k in J) {
      if (k === 'fwd' || k === 'up') continue;
      const v = J[k], b = v[1] - py, cz = v[2];
      J[k] = [v[0], py + b * cs - cz * sn - drop, b * sn + cz * cs];
    }
    J.fwd = [0, -sn, cs]; J.up = [0, cs, sn];
  }
  // and a roll about the spine (spun-and-flung men lean out like a hammer throw)
  if (roll) {
    const cr = Math.cos(roll), sr = Math.sin(roll), cx = sway, cy = pel - drop;
    for (const k in J) {
      if (k === 'fwd' || k === 'up') continue;
      const v = J[k], x = v[0] - cx, y = v[1] - cy;
      J[k] = [cx + x * cr - y * sr, cy + x * sr + y * cr, v[2]];
    }
    const rot = (v) => [v[0] * cr - v[1] * sr, v[0] * sr + v[1] * cr, v[2]];
    J.fwd = rot(J.fwd); J.up = rot(J.up);
  }
  return J;
}

function blzDrawPlayer(g, p, P) {
  if (P.k < 0.8) return;
  const T = blzTeam(p.team), cam = blitz.cam;
  const J = blzPose(p);
  const fx = p.fx, fz = p.fz, rx = fz, rz = -fx;
  const yb = p.y;
  const W = (v) => blzProj(p.x + (rx * v[0] + fx * v[2]) * BLZ_BS, v[1] * BLZ_BS + yb, p.z + (rz * v[0] + fz * v[2]) * BLZ_BS);
  const S = {};
  for (const k in J) { if (k === 'fwd' || k === 'up') continue; S[k] = W(J[k]); if (!S[k]) return; }
  const k = P.k * BLZ_BS, hs = blitz.codes.huge ? 2.6 : blitz.codes.big ? 1.8 : 1;
  const els = [];
  const seg = (a, b, w, col) => els.push({ t: 'l', a: S[a], b: S[b], w: w * k, col, z: (S[a].zc + S[b].zc) / 2 });
  // legs: pants, socks (team stripe), cleats
  for (const sg of [-1, 1]) {
    seg('hip' + sg, 'knee' + sg, 0.24, T.pants);
    seg('knee' + sg, 'foot' + sg, 0.17, T.sock);
    seg('foot' + sg, 'toe' + sg, 0.14, '#121216');
  }
  // torso: a jersey trapezoid from the pads to the belt
  const tz = (S.sh1.zc + S['sh-1'].zc + S['hip-1'].zc + S.hip1.zc) / 4;
  els.push({ t: 'torso', z: tz });
  // arms: sleeves, breaded forearms, hands
  for (const sg of [-1, 1]) {
    seg('sh' + sg, 'el' + sg, 0.19, T.c1);
    seg('el' + sg, 'hd' + sg, 0.15, BLZ_CRUST);
    els.push({ t: 'c', a: S['hd' + sg], r: 0.09 * k, col: BLZ_CRUST_L, z: S['hd' + sg].zc - 0.01 });
  }
  els.push({ t: 'head', z: S.head.zc - 0.02 });
  els.sort((a, b) => b.z - a.z);
  // facing relative to the camera: +1 running away (we see the back), -1 at us
  const vd = fz * cam.dir;
  // the human's ring on the turf: Blitz blue, three dots
  if (p === blitz.ctl && blzHuman(p.team)) {
    g.fillStyle = 'rgba(30,80,255,0.75)';
    g.beginPath(); g.ellipse(P.x, P.y, k * 0.95, k * 0.36, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(10,30,140,0.9)';
    g.beginPath(); g.ellipse(P.x, P.y, k * 0.6, k * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(90,150,255,0.9)';
    for (const ox of [-0.45, 0, 0.45]) { g.beginPath(); g.ellipse(P.x + ox * k, P.y, k * 0.13, k * 0.06, 0, 0, Math.PI * 2); g.fill(); }
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const e of els) {
    if (e.t === 'l') {
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = e.w + Math.max(1, k * 0.05);
      g.beginPath(); g.moveTo(e.a.x, e.a.y); g.lineTo(e.b.x, e.b.y); g.stroke();
      g.strokeStyle = e.col; g.lineWidth = e.w;
      g.beginPath(); g.moveTo(e.a.x, e.a.y); g.lineTo(e.b.x, e.b.y); g.stroke();
    } else if (e.t === 'c') {
      g.fillStyle = e.col; g.beginPath(); g.arc(e.a.x, e.a.y, Math.max(0.8, e.r), 0, Math.PI * 2); g.fill();
    } else if (e.t === 'torso') blzTorso(g, p, T, S, k, vd);
    else if (e.t === 'head') blzHead(g, p, T, S, k * hs, vd);
  }
  // the ball, tucked in the carry arm
  if (p === blitz.carrier && blitz.ball && blitz.ball.st === 'held' && p.downT <= 0) {
    const h = S.hd1;
    blzBallSprite(g, h.x, h.y, k, 0.6);
  }
  // on fire: flames licking off the shoulders
  if (blzOnFire(p.team) && (p === blitz.carrier || p === blitz.ctl)) {
    g.globalAlpha = 0.55 + 0.25 * Math.sin(blitz.t * 22);
    const m = S.neck, gr = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, k * 1.3);
    gr.addColorStop(0, 'rgba(255,220,90,0.9)'); gr.addColorStop(0.5, 'rgba(255,110,20,0.6)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(m.x, m.y + k * 0.2, k * 1.0, k * 1.4, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
}

function blzTorso(g, p, T, S, k, vd) {
  const a = S['sh-1'], b = S.sh1, c = S.hip1, d = S['hip-1'];
  // pad width in screen space (the trapezoid flares at the shoulders)
  const flare = (u, v, f) => ({ x: u.x + (u.x - v.x) * f, y: u.y + (u.y - v.y) * f });
  const A = flare(a, b, 0.18), Bq = flare(b, a, 0.18);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(Bq.x, Bq.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath();
  g.lineWidth = Math.max(1.5, k * 0.1); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.stroke();
  const gr = g.createLinearGradient(A.x, A.y, d.x, d.y);
  gr.addColorStop(0, blzMix(T.c1, 0.22)); gr.addColorStop(1, blzMix(T.c1, 0.25, '#000000'));
  g.fillStyle = gr; g.fill();
  // the shoulder pads: one fat bar across the top, trim-colored stripe
  g.lineCap = 'round';
  g.strokeStyle = blzMix(T.c1, 0.12); g.lineWidth = k * 0.3;
  g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(Bq.x, Bq.y); g.stroke();
  g.strokeStyle = T.c2; g.lineWidth = Math.max(1, k * 0.06);
  const m1 = flare(a, b, 0.05), m2 = flare(b, a, 0.05);
  g.beginPath(); g.moveTo(m1.x, m1.y + k * 0.08); g.lineTo(m2.x, m2.y + k * 0.08); g.stroke();
  // the belt
  g.strokeStyle = blzMix(T.pants, 0.3, '#000000'); g.lineWidth = Math.max(1, k * 0.07);
  g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(c.x, c.y); g.stroke();
  // the number, front or back, squashed by how square-on we see it
  const sq = Math.abs(vd);
  if (sq > 0.3 && p.num && k > 4 && p.downT <= 0 && p.diveT <= 0) {
    const cx = (A.x + Bq.x + c.x + d.x) / 4, cy = (A.y + Bq.y + c.y + d.y) / 4;
    g.save(); g.translate(cx, cy - k * 0.04); g.scale(sq, 1);
    g.font = '900 ' + Math.round(k * 0.5) + 'px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = Math.max(1.5, k * 0.08); g.strokeStyle = T.c2 === T.num ? '#000' : T.c2; g.strokeText(String(p.num), 0, 0);
    g.fillStyle = T.num; g.fillText(String(p.num), 0, 0);
    g.restore();
  }
}

function blzHead(g, p, T, S, k, vd) {
  const h = S.head, r = k * 0.23;
  const nk = S.neck;
  g.strokeStyle = BLZ_CRUST_D; g.lineWidth = k * 0.14; g.lineCap = 'round';
  g.beginPath(); g.moveTo(nk.x, nk.y); g.lineTo(h.x, h.y + r * 0.5); g.stroke();
  // the shell
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(h.x, h.y, r + Math.max(0.8, k * 0.03), 0, Math.PI * 2); g.fill();
  const gr = g.createRadialGradient(h.x - r * 0.4, h.y - r * 0.45, r * 0.1, h.x, h.y, r * 1.05);
  gr.addColorStop(0, blzMix(T.helm, 0.55)); gr.addColorStop(0.55, T.helm); gr.addColorStop(1, blzMix(T.helm, 0.4, '#000000'));
  g.fillStyle = gr; g.beginPath(); g.arc(h.x, h.y, r, 0, Math.PI * 2); g.fill();
  // which way is the face, on screen?
  const f = blzProj(p.x + p.fx * 0.5, 1.9, p.z + p.fz * 0.5), o = blzProj(p.x, 1.9, p.z);
  let sx = 1;
  if (f && o) sx = f.x >= o.x ? 1 : -1;
  const side = Math.abs(vd) < 0.55;
  // the stripe over the crown
  g.save(); g.beginPath(); g.arc(h.x, h.y, r, 0, Math.PI * 2); g.clip();
  g.fillStyle = T.stripe;
  if (side) g.fillRect(h.x - r, h.y - r * 0.95, r * 2, r * 0.26);
  else g.fillRect(h.x - r * 0.14, h.y - r, r * 0.28, r * (vd > 0 ? 2 : 0.9));
  g.restore();
  if (vd < -0.3) {
    // at us: a breaded face behind the bars
    g.fillStyle = BLZ_CRUST; g.beginPath(); g.ellipse(h.x, h.y + r * 0.25, r * 0.62, r * 0.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff8e8'; g.fillRect(h.x - r * 0.42, h.y, r * 0.28, r * 0.26); g.fillRect(h.x + r * 0.14, h.y, r * 0.28, r * 0.26);
    g.fillStyle = '#141418'; g.fillRect(h.x - r * 0.34, h.y + r * 0.07, r * 0.14, r * 0.16); g.fillRect(h.x + r * 0.22, h.y + r * 0.07, r * 0.14, r * 0.16);
    g.strokeStyle = T.mask; g.lineWidth = Math.max(1, r * 0.16);
    g.beginPath(); g.moveTo(h.x - r * 0.68, h.y + r * 0.42); g.lineTo(h.x + r * 0.68, h.y + r * 0.42); g.stroke();
    g.beginPath(); g.moveTo(h.x - r * 0.52, h.y + r * 0.7); g.lineTo(h.x + r * 0.52, h.y + r * 0.7); g.stroke();
    g.beginPath(); g.moveTo(h.x, h.y + r * 0.3); g.lineTo(h.x, h.y + r * 0.85); g.stroke();
  } else if (side) {
    // profile: the cage out front, the logo on the shell
    const fx0 = h.x + sx * r * 0.7;
    g.fillStyle = BLZ_CRUST; g.beginPath(); g.ellipse(h.x + sx * r * 0.45, h.y + r * 0.2, r * 0.32, r * 0.45, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#141418'; g.fillRect(h.x + sx * r * 0.45 - r * 0.07, h.y - r * 0.05, r * 0.14, r * 0.16);
    g.strokeStyle = T.mask; g.lineWidth = Math.max(1, r * 0.16);
    g.beginPath(); g.moveTo(fx0, h.y - r * 0.1); g.lineTo(fx0 + sx * r * 0.22, h.y + r * 0.5); g.lineTo(h.x + sx * r * 0.3, h.y + r * 0.75); g.stroke();
    g.beginPath(); g.moveTo(h.x + sx * r * 0.3, h.y + r * 0.32); g.lineTo(fx0 + sx * r * 0.18, h.y + r * 0.32); g.stroke();
    if (r > 3) {
      const lx = h.x - sx * r * 0.2, ly = h.y - r * 0.05;
      g.fillStyle = T.c2; g.beginPath(); g.arc(lx, ly, r * 0.36, 0, Math.PI * 2); g.fill();
      g.font = '900 ' + Math.round(r * 0.55) + 'px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = T.helm === T.c2 ? '#ffffff' : T.helm; g.fillText(T.logo, lx, ly + r * 0.03);
    }
  } else if (r > 3) {
    // the back of the helmet: the team letter on the bumper
    g.font = '900 ' + Math.round(r * 0.5) + 'px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = T.stripe; g.fillText(T.logo, h.x, h.y + r * 0.62);
  }
}

// the blue arrow with the 1 and the yellow name label, Blitz style
function blzDrawMarker(g, p) {
  const P = blzProj(p.x, 1.4 + p.y, p.z), F = blzProj(p.x, 0, p.z);
  if (!P || !F) return;
  const k = Math.max(9, P.k), x = P.x - k * 1.25, y = P.y;
  g.fillStyle = '#1f4fe8'; g.strokeStyle = '#c8dcff'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x - k * 0.2, y - k * 0.32); g.lineTo(x + k * 0.55, y); g.lineTo(x - k * 0.2, y + k * 0.32); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#0a1a7a'; g.beginPath(); g.arc(x - k * 0.25, y, k * 0.32, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#c8dcff'; g.stroke();
  g.font = '900 ' + Math.round(k * 0.45) + 'px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffffff'; g.fillText('1', x - k * 0.25, y + 1);
  // (not over your QB while the receiver icons are up — the back's icon lives there)
  const icons = blitz.kind === 'pass' && p.pos === 'QB' && p.team === blitz.poss && (blitz.phase === 'pre' || (blitz.pocket && !blitz.thrown));
  if (!icons && (blitz.phase === 'pre' || blitz.phase === 'live' || blitz.phase === 'dead')) {
    const last = p.name.split(' ').slice(-1)[0];
    blzText(g, p.num + ' - ' + last, F.x, F.y + Math.max(8, F.k * 0.7), Math.max(9, Math.min(15, F.k * 0.5)), '#ffe23a', 'center');
  }
}

function blzBallSprite(g, x, y, k, rot) {
  const big = blitz.codes.bigball ? 2.4 : 1;
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath(); g.ellipse(0, 0, Math.max(2.4, k * 0.3 * big), Math.max(1.6, k * 0.19 * big), 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#7a3a14';
  g.beginPath(); g.ellipse(0, 0, Math.max(2, k * 0.27 * big), Math.max(1.3, k * 0.16 * big), 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#a85a2a'; g.beginPath(); g.ellipse(-k * 0.05 * big, -k * 0.05 * big, k * 0.12 * big, k * 0.05 * big, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f2ecdc'; g.fillRect(-k * 0.1 * big, -k * 0.015 * big, k * 0.2 * big, Math.max(0.6, k * 0.035 * big));
  g.restore();
}
function blzDrawBall(g, B, P) {
  const H = blzProj(B.x, B.y, B.z);
  if (!H) return;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(P.x, P.y, P.k * 0.3, P.k * 0.1, 0, 0, Math.PI * 2); g.fill();
  const fire = B.st === 'air' && B.kind === 'pass' && B.from && blzOnFire(B.from.team);
  if (fire) { g.fillStyle = 'rgba(255,120,20,0.6)'; g.beginPath(); g.arc(H.x, H.y, H.k * 0.6, 0, Math.PI * 2); g.fill(); }
  blzBallSprite(g, H.x, H.y, H.k, B.st === 'air' ? blitz.t * 14 : 0.4);
}

function blzDrawPart(g, q, P) {
  const a = 1 - q.t / q.T;
  if (q.k === 'fire') {
    const r = Math.max(1.5, Math.min(7, P.k * 0.2 * (0.5 + a)));
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.max(0, a) * 0.85;
    g.fillStyle = a > 0.6 ? '#ffe08a' : a > 0.3 ? '#ff8a1e' : '#c83a10';
    g.beginPath(); g.arc(P.x, P.y, r, 0, Math.PI * 2); g.fill();
    g.restore();
    return;
  }
  g.globalAlpha = Math.max(0, a);
  g.fillStyle = q.k === 'fire' ? (a > 0.6 ? '#ffe08a' : a > 0.3 ? '#ff8a1e' : '#c83a10') : q.c;
  const s = Math.max(1, P.k * (q.k === 'fire' ? 0.35 * (0.5 + a) : q.k === 'conf' ? 0.18 : 0.14));
  g.fillRect(P.x - s / 2, P.y - s / 2, s, s);
  g.globalAlpha = 1;
}

// ==== 🎮 THE POLYGON PASS ===========================================================================
// Chris, after the canvas version: "make the graphics look much more true to my
// N64 screen shots". The cart's look is POLYGONS — segmented players lit per
// vertex (Gouraud), a mipmapped turf texture, raked stands — rendered small and
// smeared up the screen. So the world is WebGL now: one tiny shader, no
// libraries. The 2D canvas rides on top for the HUD, menus, labels and sparks,
// and because blzGLMatrix IS blzProj written as a matrix, a label drawn at
// blzProj(p) lands on the polygon p. No WebGL → blitz.gl stays null and the
// canvas renderer above draws everything, exactly as before.
//
// Players are built the way N64 players were: rigid parts (torso, pads,
// pelvis, helmet + cage, sleeves, breaded forearms, striped thighs, socks,
// cleats), each placed by a bone from blzPose — no skinning, no seams worth
// worrying about at 600 lines tall. Jersey numbers are real decals: one atlas
// cell per player, front and back. ~16 draws a player, ~230 a frame.

const BLZ_GL_VS = [
  'attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute vec2 aUV;',
  'uniform mat4 uVP; uniform mat4 uM; uniform vec3 uLight; uniform float uAmb; uniform float uLit;',
  'uniform vec3 uTint; uniform vec4 uUVX;',
  'varying vec3 vCol; varying vec2 vUV; varying float vFog; varying vec3 vW;',
  'void main() {',
  '  vec4 wp = uM * vec4(aPos, 1.0);',
  '  vW = wp.xyz;',
  '  vec3 n = normalize((uM * vec4(aNor, 0.0)).xyz);',
  '  float d = max(dot(n, uLight), 0.0);',
  '  float sky = 0.12 * max(n.y, 0.0);',
  '  float l = mix(1.0, uAmb + (1.0 - uAmb) * d + sky, uLit);',
  '  vCol = aCol * uTint * l;',
  '  vUV = aUV * uUVX.xy + uUVX.zw;',
  '  gl_Position = uVP * wp;',
  '  vFog = clamp((gl_Position.w - 60.0) / 180.0, 0.0, 0.55);',
  '}'].join('\n');
const BLZ_GL_FS = [
  'precision mediump float;',
  'uniform sampler2D uTex; uniform float uUseTex; uniform vec3 uFog; uniform float uAlpha; uniform vec4 uWave;',
  'varying vec3 vCol; varying vec2 vUV; varying float vFog; varying vec3 vW;',
  'void main() {',
  '  vec4 t = vec4(1.0);',
  '  if (uUseTex > 0.5) t = texture2D(uTex, vUV);',
  '  if (t.a * uAlpha < 0.01) discard;',
  '  vec3 base = vCol * t.rgb;',
  // the wave: a band of standing, brighter fans sweeping down the stands
  '  if (uWave.w > 0.5) { float k = clamp(1.0 - abs(vW.z - uWave.x) / uWave.y, 0.0, 1.0); base *= 1.0 + uWave.z * k * k; }',
  '  vec3 c = mix(base, uFog, vFog);',
  '  gl_FragColor = vec4(c, t.a * uAlpha);',
  '}'].join('\n');

const BLZ_UV1 = [1, 1, 0, 0];

function blzGLInit() {
  if (blitz.glTried) return !!blitz.gl;
  blitz.glTried = true;
  if (blitz.noGL) return false;               // (a test seam: force the canvas renderer)
  const cv = document.createElement('canvas');
  let gl = null;
  const attrs = { alpha: false, antialias: true, depth: true, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  try { gl = cv.getContext('webgl', attrs) || cv.getContext('experimental-webgl', attrs); } catch (e) { gl = null; }
  if (!gl) return false;
  const P = blzGLProgram(gl, BLZ_GL_VS, BLZ_GL_FS);
  if (!P) return false;
  blitz.gl = gl; blitz.glCv = cv;
  blitz.glr = {
    P, key: '', ids: 0, last: null, pool: [], pi: 0, draws: [], tex: {}, team: [null, null], sh: null, s: null,
    aniso: gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic'),
    vp: new Float32Array(16), I: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  };
  for (const k of ['aPos', 'aNor', 'aCol', 'aUV']) if (P.a[k] >= 0) gl.enableVertexAttribArray(P.a[k]);
  cv.className = 'blz-gl';
  blitzWorld.insertBefore(cv, blitz.cv || null);
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); blitz.gl = null; blitz.glr = null; });
  cv.addEventListener('webglcontextrestored', () => { cv.remove(); blitz.glCv = null; blitz.glTried = false; blzGLInit(); });
  blzGLShared();
  return true;
}

function blzGLProgram(gl, vs, fs) {
  const mk = (type, src) => {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn('blitz shader:', gl.getShaderInfoLog(sh)); return null; }
    return sh;
  };
  const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('blitz link:', gl.getProgramInfoLog(p)); return null; }
  const P = { p, a: {}, u: {} };
  for (const k of ['aPos', 'aNor', 'aCol', 'aUV']) P.a[k] = gl.getAttribLocation(p, k);
  for (const k of ['uVP', 'uM', 'uLight', 'uAmb', 'uLit', 'uTint', 'uUVX', 'uTex', 'uUseTex', 'uFog', 'uAlpha', 'uWave']) P.u[k] = gl.getUniformLocation(p, k);
  return P;
}

// ---- mesh building ----------------------------------------------------------------------------------
function blzRGB(hex) { return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]; }
function blzK(c, k) { return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; }
function blzN(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function blzCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
// a bone frame: Y along the bone, Z = `ref` squared off against it (falls back to `alt`)
function blzFrame(Y, ref, alt) {
  let d = ref[0] * Y[0] + ref[1] * Y[1] + ref[2] * Y[2];
  let Z = [ref[0] - d * Y[0], ref[1] - d * Y[1], ref[2] - d * Y[2]];
  if (Math.hypot(Z[0], Z[1], Z[2]) < 0.25) {
    d = alt[0] * Y[0] + alt[1] * Y[1] + alt[2] * Y[2];
    Z = [alt[0] - d * Y[0], alt[1] - d * Y[1], alt[2] - d * Y[2]];
  }
  Z = blzN(Z);
  return [blzCross(Y, Z), Y, Z];
}
function blzMesh() { return { v: [], i: [], n: 0 }; }
function blzV(m, x, y, z, nx, ny, nz, c, u, v) { m.v.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], u || 0, v || 0); return m.n++; }
function blzQ(m, a, b, c, d) { m.i.push(a, b, c, a, c, d); }
// a quad from four points with an explicit normal and per-corner uv
function blzMQuad(m, p, n, c, uv) {
  const k = [0, 1, 2, 3].map((i) => blzV(m, p[i][0], p[i][1], p[i][2], n[0], n[1], n[2], Array.isArray(c[0]) ? c[i] : c, uv ? uv[i][0] : 0, uv ? uv[i][1] : 0));
  blzQ(m, k[0], k[1], k[2], k[3]);
}
// an axis-aligned box; faceUV (optional) maps a face index to [u0, v0, u1, v1]
// faces: 0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z. Text faces read from outside.
function blzMBox(m, cx, cy, cz, hx, hy, hz, col, faceUV) {
  const F = [
    [[1, 0, 0], [[1, 1, -1], [1, 1, 1], [1, -1, 1], [1, -1, -1]]],
    [[-1, 0, 0], [[-1, 1, 1], [-1, 1, -1], [-1, -1, -1], [-1, -1, 1]]],
    [[0, 1, 0], [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]],
    [[0, -1, 0], [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]]],
    [[0, 0, 1], [[1, 1, 1], [-1, 1, 1], [-1, -1, 1], [1, -1, 1]]],
    [[0, 0, -1], [[-1, 1, -1], [1, 1, -1], [1, -1, -1], [-1, -1, -1]]],
  ];
  F.forEach(([n, cs], fi) => {
    const r = faceUV && faceUV[fi];
    const uv = r ? [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]] : null;
    blzMQuad(m, cs.map((s) => [cx + s[0] * hx, cy + s[1] * hy, cz + s[2] * hz]), n, Array.isArray(col[0]) ? col[fi] : col, uv);
  });
}
// a limb: elliptical rings up +Y from 0 to L. `rings` are fractions (repeat a
// value for a hard color edge); colFn(ringIndex, angle) gives the color.
function blzMTube(m, L, r0, r1, seg, rings, colFn, cap1) {
  const base = m.n, slope = ((r0[0] + r0[1]) - (r1[0] + r1[1])) * 0.5 / L;
  rings.forEach((t, ri) => {
    const rx = r0[0] + (r1[0] - r0[0]) * t, rz = r0[1] + (r1[1] - r0[1]) * t;
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
      const n = blzN([sa / rx, slope, ca / rz]);
      blzV(m, sa * rx, t * L, ca * rz, n[0], n[1], n[2], colFn(ri, a, t), s / seg, t);
    }
  });
  for (let r = 0; r < rings.length - 1; r++) for (let s = 0; s < seg; s++) {
    const a = base + r * (seg + 1) + s;
    blzQ(m, a, a + 1, a + seg + 2, a + seg + 1);
  }
  if (cap1) {
    const top = base + (rings.length - 1) * (seg + 1);
    const c = blzV(m, 0, L, 0, 0, 1, 0, colFn(rings.length - 1, 0, 1));
    for (let s = 0; s < seg; s++) m.i.push(top + s, top + s + 1, c);
  }
}
// an ellipsoid; u = longitude (0 = front +z, 0.25 = +x), v = latitude (0 = top)
function blzMEllip(m, cx, cy, cz, rx, ry, rz, lat, lon, colFn) {
  const base = m.n;
  for (let i = 0; i <= lat; i++) {
    const th = i / lat * Math.PI, sy = Math.cos(th), sr = Math.sin(th);
    for (let j = 0; j <= lon; j++) {
      const ph = j / lon * Math.PI * 2, ux = Math.sin(ph) * sr, uz = Math.cos(ph) * sr;
      const n = blzN([ux / rx, sy / ry, uz / rz]);
      blzV(m, cx + ux * rx, cy + sy * ry, cz + uz * rz, n[0], n[1], n[2], colFn ? colFn(ux, sy, uz) : [1, 1, 1], j / lon, i / lat);
    }
  }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    const a = base + i * (lon + 1) + j;
    blzQ(m, a, a + 1, a + lon + 2, a + lon + 1);
  }
}
// the torso: a rounded-box trunk, flared at the chest, two halves so the
// front and back each carry the jersey number the right way round
function blzMTorso(m, wide) {
  const R = [[0, 0.2, 0.14], [0.2, 0.23, 0.155], [0.42, 0.28, 0.172], [0.56, 0.3, 0.175], [0.67, 0.22, 0.13]];
  const seg = 8, se = (c) => Math.sign(c) * Math.pow(Math.abs(c), 0.7);
  for (const half of [1, -1]) {
    const base = m.n;
    for (const [y, rx0, rz] of R) {
      const rx = rx0 * wide;
      for (let s = 0; s <= seg; s++) {
        const a = -Math.PI / 2 + s / seg * Math.PI, xa = Math.sin(a), za = Math.cos(a) * half;
        const x = se(xa) * rx, z = se(za) * rz;
        const n = blzN([xa / rx, 0.04, za / rz]);
        // facing the chest the viewer's right is −x; from behind it is +x
        const u = 0.5 + (half > 0 ? -x : x) / (2 * 0.66 * wide), v = (0.7 - y) / 0.7;
        blzV(m, x, y, z, n[0], n[1], n[2], [1, 1, 1], u, v);
      }
    }
    for (let r = 0; r < R.length - 1; r++) for (let s = 0; s < seg; s++) {
      const a = base + r * (seg + 1) + s;
      blzQ(m, a, a + 1, a + seg + 2, a + seg + 1);
    }
    const top = base + (R.length - 1) * (seg + 1), c = blzV(m, 0, 0.71, 0, 0, 1, 0, [1, 1, 1], 0.5, 0.02);
    for (let s = 0; s < seg; s++) m.i.push(top + s, top + s + 1, c);
  }
}

function blzGLUpload(m) {
  const gl = blitz.gl;
  if (m.n > 65535) console.warn('blitz mesh too big', m.n);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.v), gl.STATIC_DRAW);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.i), gl.STATIC_DRAW);
  blitz.glr.last = null;
  return { vb, ib, n: m.i.length, id: ++blitz.glr.ids };
}
function blzGLFree(o) {
  const gl = blitz.gl;
  if (!o) return;
  for (const k in o) { const v = o[k]; if (v && v.vb) { gl.deleteBuffer(v.vb); gl.deleteBuffer(v.ib); } }
}
function blzGLTex(src, repeat) {
  const gl = blitz.gl, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  const pot = (n) => (n & (n - 1)) === 0, mip = pot(src.width) && pot(src.height);
  const wrap = repeat && mip ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat === 'u' ? gl.CLAMP_TO_EDGE : wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
  else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  const an = blitz.glr.aniso;
  if (an && mip) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return t;
}
function blzPot(src, w, h) { const c = blzCanvas(w, h); c.getContext('2d').drawImage(src, 0, 0, w, h); return c; }

// ---- textures ---------------------------------------------------------------------------------------
function blzPaintJerseys() {
  // one 128px cell per player: team × all fourteen positions (offense then defense);
  // cell 14 of each team's row is a blank jersey (the coach, the dip squad)
  const c = blzCanvas(1024, 512), g = c.getContext('2d');
  const all = BLZ_OFF_POS.concat(BLZ_DEF_POS).concat(['blank']);
  for (let t = 0; t < 2; t++) {
    const T = blzTeam(t), R = BLZ_ROSTER[blitz.teams[t]] || {};
    all.forEach((pos, i) => {
      const idx = t * 16 + i, x = (idx % 8) * 128, y = ((idx / 8) | 0) * 128;
      g.fillStyle = T.c1; g.fillRect(x, y, 128, 128);
      // mesh weave
      g.fillStyle = 'rgba(0,0,0,0.06)';
      for (let k = 0; k < 128; k += 4) g.fillRect(x, y + k, 128, 1);
      // collar trim + the sleeve-line stripes
      g.fillStyle = T.c2; g.fillRect(x, y, 128, 9);
      g.fillStyle = blzMix(T.c1, 0.25, '#000000'); g.fillRect(x, y + 9, 128, 3);
      const num = String((R[pos] && R[pos][1]) || '');
      if (!num) return;
      // sized so the number sits on the back with jersey showing all round it
      g.font = '900 46px Impact, "Arial Black", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 6; g.strokeStyle = T.c2 === T.num ? '#000000' : T.c2; g.strokeText(num, x + 64, y + 58);
      g.fillStyle = T.num; g.fillText(num, x + 64, y + 58);
    });
  }
  return c;
}
function blzPaintHelmet(T) {
  const w = 256, h = 128, c = blzCanvas(w, h), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, blzMix(T.helm, 0.45)); gr.addColorStop(0.45, T.helm); gr.addColorStop(1, blzMix(T.helm, 0.5, '#000000'));
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // the stripe, front to back over the crown (meridians u = 0 and u = ½)
  g.fillStyle = T.stripe;
  g.fillRect(0, 0, 7, h * 0.47); g.fillRect(w - 7, 0, 7, h * 0.47); g.fillRect(w / 2 - 7, 0, 14, h * 0.5);
  // the logo on each side
  for (const u of [0.25, 0.75]) {
    const x = u * w, y = h * 0.4;
    g.fillStyle = '#000'; g.beginPath(); g.ellipse(x, y, 19, 17, 0, 0, 7); g.fill();
    g.fillStyle = T.c2; g.beginPath(); g.ellipse(x, y, 16, 14, 0, 0, 7); g.fill();
    g.font = '900 italic 22px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = T.helm === T.c2 ? '#ffffff' : T.helm; g.fillText(T.logo, x, y + 1);
    g.fillStyle = '#141414'; g.beginPath(); g.arc(x + (u < 0.5 ? -24 : 24) * 0, h * 0.6, 3, 0, 7); g.fill(); // ear hole
  }
  // the face opening: a breaded face looking out (it wraps the u = 0 seam)
  for (const ox of [0, w]) {
    g.fillStyle = '#2a1a0a'; g.beginPath(); g.ellipse(ox, h * 0.62, 34, 22, 0, 0, 7); g.fill();
    g.fillStyle = BLZ_CRUST; g.beginPath(); g.ellipse(ox, h * 0.62, 30, 19, 0, 0, 7); g.fill();
    g.fillStyle = BLZ_CRUST_D;
    for (let i = 0; i < 9; i++) g.fillRect(ox - 24 + blzHash(i * 7.7) * 48, h * 0.52 + blzHash(i * 3.1) * 18, 3, 2);
    for (const ex of [-11, 11]) {
      g.fillStyle = '#fff8e8'; g.fillRect(ox + ex - 5, h * 0.56, 10, 8);
      g.fillStyle = '#141418'; g.fillRect(ox + ex - 2, h * 0.58, 5, 5);
    }
  }
  g.fillStyle = '#121212'; g.fillRect(0, h * 0.86, w, h * 0.14);
  // a gloss streak
  const gl = g.createRadialGradient(w * 0.88, h * 0.18, 0, w * 0.88, h * 0.18, 26);
  gl.addColorStop(0, 'rgba(255,255,255,0.65)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.fillRect(0, 0, w, h);
  return c;
}
function blzPaintNugFace(big) {
  // a breaded face, equirect (the face sits on the u = 0 seam, wrapped like the helmets)
  const w = 256, h = 128, c = blzCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = BLZ_CRUST; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = blzHash(i * 3.3) > 0.5 ? BLZ_CRUST_D : BLZ_CRUST_L;
    const r = 1 + blzHash(i * 7.1) * 3;
    g.beginPath(); g.arc(blzHash(i * 1.7) * w, blzHash(i * 5.3) * h, r, 0, 7); g.fill();
  }
  for (const ox of [0, w]) {
    const ey = h * (big ? 0.38 : 0.45), es = big ? 13 : 8;
    for (const ex of [-1, 1]) {
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(ox + ex * es * 1.4, ey, es, es * 1.2, 0, 0, 7); g.fill();
      g.fillStyle = '#141418'; g.beginPath(); g.arc(ox + ex * es * 1.4 + ex * 2, ey + 2, es * 0.5, 0, 7); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ox + ex * es * 1.4 + ex * 2 - 2, ey - 1, es * 0.16, 0, 7); g.fill();
      g.strokeStyle = '#5a3008'; g.lineWidth = big ? 5 : 3;
      g.beginPath(); g.moveTo(ox + ex * es * 0.6, ey - es * 1.5); g.lineTo(ox + ex * es * 2.2, ey - es * 1.9); g.stroke();
    }
    // the grin
    g.fillStyle = '#5a1a0a';
    g.beginPath(); g.ellipse(ox, h * (big ? 0.62 : 0.66), big ? 22 : 12, big ? 13 : 7, 0, 0, Math.PI); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(ox - (big ? 16 : 9), h * (big ? 0.62 : 0.66), big ? 32 : 18, big ? 4 : 3);
    g.fillStyle = 'rgba(255,90,90,0.35)';
    for (const ex of [-1, 1]) { g.beginPath(); g.arc(ox + ex * (big ? 30 : 17), h * (big ? 0.56 : 0.6), big ? 8 : 5, 0, 7); g.fill(); }
  }
  return c;
}
function blzPaintCrowdGL() {
  const w = 256, h = 256, c = blzCanvas(w, h), g = c.getContext('2d');
  const A = blzTeam(0), B = blzTeam(1);
  const pal = [A.c1, A.c1, A.c2, B.c1, B.c1, B.c2, '#7a2a22', '#9a4a3a', '#c8a890', '#e8e0d0', '#3a2a2a', '#5a4a6a', '#d8b878', '#b05a3a', '#2a3a6a'];
  g.fillStyle = '#43262a'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) {
    g.fillStyle = '#6a3a36'; g.fillRect(0, y + 6, w, 2);           // the seat-row step
    for (let x = 0; x < w; x += 4) {
      if ((x % 64) >= 26 && (x % 64) < 36) continue;               // the aisle
      const r = blzHash(x * 3.7 + y * 11.3 + 0.5);
      if (r < 0.05) continue;                                       // an empty seat
      const shirt = pal[(blzHash(x * 1.9 + y * 7.1) * pal.length) | 0];
      g.fillStyle = shirt; g.fillRect(x, y + 3, 4, 4);
      g.fillStyle = r < 0.62 ? BLZ_CRUST : r < 0.8 ? BLZ_CRUST_D : r < 0.9 ? '#e8d8b0' : shirt; // nugget heads
      g.fillRect(x + 1, y + (r > 0.5 ? 0 : 1), 2, 3);
    }
  }
  for (let ax = 26; ax < w; ax += 64) {
    g.fillStyle = '#a49a90'; g.fillRect(ax, 0, 10, h);
    g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < h; y += 4) g.fillRect(ax, y, 10, 1);
    g.fillStyle = '#d8d0c8'; g.fillRect(ax, 0, 1, h); g.fillRect(ax + 9, 0, 1, h);
  }
  blzGrain(g, w, h, 16, 5);
  return c;
}
function blzPaintAdsGL() {
  const c = blzCanvas(1024, 64), g = c.getContext('2d'), n = BLZ_ADS.length, sw = 1024 / n;
  BLZ_ADS.forEach((ad, i) => {
    const x = i * sw;
    g.fillStyle = '#16307a'; g.fillRect(x, 0, sw, 64);
    g.fillStyle = ad[1]; g.fillRect(x + 6, 8, sw - 12, 46);
    g.font = '900 italic 22px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = ad[2]; g.fillText(ad[0], x + sw / 2, 32, sw - 18);
  });
  g.fillStyle = '#d8e0f0'; g.fillRect(0, 0, 1024, 4);
  g.fillStyle = '#0a1430'; g.fillRect(0, 60, 1024, 4);
  return c;
}
function blzPaintSuites() {
  const c = blzCanvas(128, 32), g = c.getContext('2d');
  g.fillStyle = '#2a4aa8'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#c8d4f0'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 29, 128, 3);
  for (let x = 2; x < 128; x += 16) {
    g.fillStyle = '#0a1636'; g.fillRect(x, 8, 13, 16);
    g.fillStyle = blzHash(x) > 0.5 ? '#f0d890' : '#5a78c8'; g.fillRect(x + 2, 10, 9, 6);
  }
  return c;
}
function blzPaintMarkers() {
  const c = blzCanvas(512, 64), g = c.getContext('2d');
  const labels = ['10', '20', '30', '40', '50', 'G', '', ''];
  labels.forEach((t, i) => {
    const x = i * 64;
    g.fillStyle = '#ff7a1a'; g.fillRect(x, 0, 64, 64);
    g.fillStyle = '#ffb06a'; g.fillRect(x, 0, 64, 6);
    g.fillStyle = '#c84a0a'; g.fillRect(x, 58, 64, 6);
    if (!t) return;
    g.font = '900 34px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.fillText(t, x + 32, 34);
  });
  return c;
}
function blzPaintBlob() {
  const c = blzCanvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function blzPaintRing() {
  const c = blzCanvas(128, 128), g = c.getContext('2d');
  g.fillStyle = 'rgba(16,40,170,0.55)'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.lineWidth = 12; g.strokeStyle = 'rgba(40,100,255,0.95)'; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke();
  g.lineWidth = 3; g.strokeStyle = 'rgba(190,220,255,0.95)'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.stroke();
  g.fillStyle = 'rgba(150,200,255,0.95)';
  for (const a of [0, 2.09, 4.19]) { g.beginPath(); g.arc(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30, 9, 0, 7); g.fill(); }
  return c;
}

// ---- shared meshes (color-independent) + per-team meshes ---------------------------------------
const BLZ_SKIN = () => blzRGB(BLZ_CRUST);
function blzSkinAt(seed) {
  const r = blzHash(seed), base = BLZ_SKIN();
  return r < 0.14 ? blzK(base, 0.72) : blzK(base, 0.9 + r * 0.24);
}
function blzGLShared() {
  const G = blitz.glr, sh = {};
  let m = blzMesh();
  blzMTube(m, 0.21, [0.075, 0.07], [0.07, 0.065], 8, [0, 1], (ri, a) => blzSkinAt(a * 7 + ri));
  sh.neck = blzGLUpload(m);
  m = blzMesh();
  blzMTube(m, 0.27, [0.068, 0.064], [0.056, 0.052], 8, [0, 0.82, 0.82, 1], (ri, a) => (ri >= 2 ? [0.95, 0.95, 0.92] : blzSkinAt(a * 13 + ri * 3)));
  blzMEllip(m, 0, 0.31, 0.01, 0.058, 0.072, 0.045, 5, 8, (x, y, z) => blzSkinAt(x * 31 + y * 17 + z * 11));
  sh.fore = blzGLUpload(m);
  m = blzMesh();
  blzMBox(m, 0, 0.09, -0.012, 0.062, 0.13, 0.048, [0.07, 0.07, 0.08]);
  blzMBox(m, 0, 0.12, 0.03, 0.05, 0.06, 0.004, [0.9, 0.9, 0.92]);   // the swoosh-ish stripe on top
  sh.cleat = blzGLUpload(m);
  m = blzMesh();
  blzMEllip(m, 0, 0, 0.01, 0.205, 0.2, 0.225, 9, 14, null);
  sh.helmet = blzGLUpload(m);
  m = blzMesh();
  blzMEllip(m, 0, 0, 0, 0.15, 0.25, 0.15, 7, 10, (x, y, z) => (z > 0.86 && Math.abs(y) < 0.36 ? [0.95, 0.93, 0.88] : Math.abs(Math.abs(y) - 0.62) < 0.05 ? [0.9, 0.88, 0.84] : [0.46, 0.22, 0.08]));
  sh.ball = blzGLUpload(m);
  m = blzMesh();
  blzMQuad(m, [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]], [0, 1, 0], [1, 1, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  sh.decal = blzGLUpload(m);
  m = blzMesh();
  blzMQuad(m, [[0, 0, -0.5], [1, 0, -0.5], [1, 0, 0.5], [0, 0, 0.5]], [0, 1, 0], [1, 1, 1]);
  sh.line = blzGLUpload(m);
  // a bare nugget head, a pom-pom, a ball cap and the mascot's whole body
  m = blzMesh(); blzMEllip(m, 0, 0, 0.01, 0.17, 0.19, 0.18, 8, 12, null); sh.head = blzGLUpload(m);
  m = blzMesh(); blzMEllip(m, 0, 0, 0, 0.14, 0.14, 0.14, 5, 8, (x, y, z) => [0.92 + 0.08 * Math.sin(x * 9 + y * 7), 0.92 + 0.08 * Math.cos(z * 11), 0.95]); sh.pom = blzGLUpload(m);
  m = blzMesh();
  blzMEllip(m, 0, 0.06, 0, 0.18, 0.11, 0.19, 5, 10, null);
  blzMBox(m, 0, 0.03, 0.2, 0.15, 0.012, 0.09, [0.85, 0.85, 0.85]);
  sh.cap = blzGLUpload(m);
  m = blzMesh(); blzMEllip(m, 0, 0, 0.02, 0.5, 0.62, 0.42, 10, 16, null); sh.mbody = blzGLUpload(m);
  G.sh = sh;
  G.tex.blob = blzGLTex(blzPaintBlob());
  G.tex.face = blzGLTex(blzPaintNugFace(false));
  G.tex.mface = blzGLTex(blzPaintNugFace(true));
  G.tex.ring = blzGLTex(blzPaintRing());
}
function blzGLTeamMeshes(t) {
  const T = blzTeam(t), c1 = blzRGB(T.c1), c2 = blzRGB(T.c2), pants = blzRGB(T.pants), sock = blzRGB(T.sock), mask = blzRGB(T.mask);
  const O = {};
  for (const [k, wide] of [['', 1], ['W', 1.12]]) {
    let m = blzMesh(); blzMTorso(m, wide); O['torso' + k] = blzGLUpload(m);
    m = blzMesh();
    blzMEllip(m, 0, 0.6, -0.01, 0.43 * wide, 0.13, 0.235, 6, 12, (x, y) => (Math.abs(x) > 0.8 ? c2 : blzK(c1, 1.08 + y * 0.1)));
    O['pads' + k] = blzGLUpload(m);
    m = blzMesh();
    blzMEllip(m, 0, -0.02, 0, 0.205 * wide, 0.15, 0.15, 6, 10, (x, y) => (y > 0.55 ? blzK(pants, 0.5) : pants)); // the seat, belted
    O['pelvis' + k] = blzGLUpload(m);
  }
  let m = blzMesh();
  blzMTube(m, 0.47, [0.12, 0.115], [0.09, 0.088], 12, [0, 0.9, 0.9, 1], (ri, a) => (ri >= 2 ? blzK(pants, 0.85) : Math.abs(Math.sin(a)) > 0.95 ? c2 : pants));
  O.thigh = blzGLUpload(m);
  m = blzMesh();
  blzMTube(m, 0.47, [0.085, 0.082], [0.058, 0.056], 10, [0, 0.1, 0.1, 0.2, 0.2, 0.86, 0.86, 1],
    (ri, a) => (ri === 2 || ri === 3 ? [0.94, 0.94, 0.94] : ri >= 6 ? [0.9, 0.9, 0.9] : sock));
  O.shin = blzGLUpload(m);
  m = blzMesh();
  blzMTube(m, 0.3, [0.09, 0.085], [0.072, 0.068], 10, [0, 0.4, 0.4, 0.5, 0.5, 1],
    (ri, a, tt) => (ri <= 1 ? c1 : ri <= 3 ? c2 : blzSkinAt(a * 9 + tt * 40)));
  O.upper = blzGLUpload(m);
  // the cage: bars in front of the face, struts to the shell
  m = blzMesh();
  for (const [y, hw] of [[-0.03, 0.115], [-0.09, 0.1], [-0.145, 0.07]]) blzMBox(m, 0, y, 0.228, hw, 0.011, 0.012, mask);
  blzMBox(m, 0, -0.09, 0.236, 0.011, 0.06, 0.011, mask);
  for (const sx of [-1, 1]) blzMBox(m, sx * 0.135, -0.075, 0.175, 0.012, 0.06, 0.05, mask);
  O.mask = blzGLUpload(m);
  return O;
}

// ---- the stadium (static, rebuilt per matchup) --------------------------------------------------
function blzGLScene() {
  const S = {}, night = !!blitz.codes.night;
  const quadXZ = (m, x0, x1, z0, z1, y, c, uv) => blzMQuad(m, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0], c, uv);
  let m = blzMesh();
  quadXZ(m, -90, BLZ_WID + 90, -90, BLZ_LEN + 90, -0.05, blzRGB(night ? '#173a1a' : '#2a6428'));
  S.turf = blzGLUpload(m);
  m = blzMesh();
  const fx0 = BLZ_TEX.x0, fx1 = fx0 + BLZ_TEX.w, fz0 = BLZ_TEX.z0, fz1 = fz0 + BLZ_TEX.l;
  quadXZ(m, fx0, fx1, fz0, fz1, 0, [1, 1, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  S.field = blzGLUpload(m);
  // the bowl: a padded ad wall, the lower deck, a band of suites, the upper deck, the roof fascia
  const WX = 4.6, Z0 = -5, Z1 = BLZ_LEN + 5;
  const walls = blzMesh(), crowd = blzMesh(), suites = blzMesh(), props = blzMesh();
  const L1 = [0.4, 1.6, 16.5, 12.4], L2 = [17.3, 15.6, 31, 27.6];        // deck [inset, y] → [outset, y]
  const white = [1, 1, 1], dark = blzRGB(night ? '#08080e' : '#1a1a26'), rail = blzRGB('#d8dce8');
  // the four sides as one recipe: a frame (origin, along-axis, out-axis, length)
  const sides = [
    { o: [-WX, Z0], a: [0, 1], out: [-1, 0], len: Z1 - Z0, t0: Z0 },
    { o: [BLZ_WID + WX, Z1], a: [0, -1], out: [1, 0], len: Z1 - Z0, t0: -Z1 },
    { o: [BLZ_WID + WX, Z0], a: [-1, 0], out: [0, -1], len: BLZ_WID + 2 * WX, t0: -(BLZ_WID + WX) },
    { o: [-WX, Z1], a: [1, 0], out: [0, 1], len: BLZ_WID + 2 * WX, t0: -WX },
  ];
  const P = (sd, along, out, y) => [sd.o[0] + sd.a[0] * along + sd.out[0] * out, y, sd.o[1] + sd.a[1] * along + sd.out[1] * out];
  for (const sd of sides) {
    const n = [-sd.out[0], 0, -sd.out[1]];   // facing the field
    const u0 = sd.t0 / 64, u1 = (sd.t0 + sd.len) / 64;
    blzMQuad(walls, [P(sd, 0, 0, 1.6), P(sd, sd.len, 0, 1.6), P(sd, sd.len, 0, 0), P(sd, 0, 0, 0)], n, white, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    blzMQuad(props, [P(sd, 0, 0, 1.6), P(sd, sd.len, 0, 1.6), P(sd, sd.len, 0.35, 1.6), P(sd, 0, 0.35, 1.6)], [0, 1, 0], rail);
    const cu0 = sd.t0 / 24, cu1 = (sd.t0 + sd.len) / 24;
    for (const D of [L1, L2]) {
      blzMQuad(crowd, [P(sd, 0, D[0], D[1]), P(sd, sd.len, D[0], D[1]), P(sd, sd.len, D[2], D[3]), P(sd, 0, D[2], D[3])], [0, 1, 0], white,
        [[cu0, 1], [cu1, 1], [cu1, 0], [cu0, 0]]);
    }
    // the suites between the decks, the facade lip under them, the fascia on top
    const su0 = sd.t0 / 8, su1 = (sd.t0 + sd.len) / 8;
    blzMQuad(suites, [P(sd, 0, 16.6, 15.6), P(sd, sd.len, 16.6, 15.6), P(sd, sd.len, 16.6, 12.4), P(sd, 0, 16.6, 12.4)], n, white,
      [[su0, 0], [su1, 0], [su1, 1], [su0, 1]]);
    blzMQuad(props, [P(sd, 0, 16.5, 12.4), P(sd, sd.len, 16.5, 12.4), P(sd, sd.len, 17.3, 12.4), P(sd, 0, 17.3, 12.4)], [0, 1, 0], blzRGB('#c8ccd8'));
    blzMQuad(props, [P(sd, 0, 31, 31), P(sd, sd.len, 31, 31), P(sd, sd.len, 31, 27.6), P(sd, 0, 31, 27.6)], n, dark);
    blzMQuad(props, [P(sd, 0, 31, 31), P(sd, sd.len, 31, 31), P(sd, sd.len, 24, 33), P(sd, 0, 24, 33)], [0, -1, 0], blzK(dark, 0.7));
    // light rigs along the roof
    for (let a = 8; a < sd.len - 4; a += 22) blzMBox(props, ...P(sd, a, 30.5, 32.2), 1.4, 0.6, 1.4, blzRGB(night ? '#fff6c8' : '#e8e8f0'));
  }
  // corners: the decks meet in a wedge so there's no hole to the sky
  const corners = [[-WX, Z0, -1, -1], [BLZ_WID + WX, Z0, 1, -1], [BLZ_WID + WX, Z1, 1, 1], [-WX, Z1, -1, 1]];
  for (const [cx, cz, sx, sz] of corners) {
    for (const D of [L1, L2]) {
      blzMQuad(crowd, [[cx + sx * D[0], D[1], cz + sz * D[0]], [cx + sx * D[2], D[3], cz], [cx + sx * D[2], D[3], cz + sz * D[2]], [cx, D[3], cz + sz * D[2]]], [0, 1, 0], white,
        [[0, 1], [0.6, 0], [1.2, 0], [1.8, 0]]);
    }
  }
  S.walls = blzGLUpload(walls); S.crowd = blzGLUpload(crowd); S.suites = blzGLUpload(suites);
  // goalposts (yellow), pylons (orange) — lit props
  const gold = blzRGB('#f2d22a'), orng = blzRGB('#ff7a1a');
  for (const [z, out] of [[0, -1], [BLZ_LEN, 1]]) {
    const zb = z + out * 1.2;
    blzMBox(props, BLZ_MID, 1.65, zb, 0.13, 1.65, 0.13, gold);
    blzMBox(props, BLZ_MID, 3.3, (z + zb) / 2, 0.11, 0.11, 0.62, gold);
    blzMBox(props, BLZ_MID, 3.3, z, 3.1, 0.1, 0.1, gold);
    for (const sx of [-1, 1]) blzMBox(props, BLZ_MID + sx * 3.1, 7.15, z, 0.085, 3.85, 0.085, gold);
    blzMBox(props, BLZ_MID, 0.9, zb, 0.2, 0.9, 0.2, blzRGB('#2a4aa8'));           // the post pad
    for (const ez of [z, z + out * -10]) for (const x of [0, BLZ_WID]) blzMBox(props, x, 0.45, ez, 0.17, 0.45, 0.17, orng);
  }
  S.props = blzGLUpload(props);
  // the down markers along both sidelines, numbers facing the field
  const mk = blzMesh(), cell = (i) => [i / 8 + 0.004, 0.04, (i + 1) / 8 - 0.004, 0.96], blank = cell(6);
  for (let z = 10; z <= 110; z += 10) {
    const n = z === 10 || z === 110 ? 5 : ((z <= 60 ? z - 10 : 110 - z) / 10) - 1;
    for (const x of [-2.5, BLZ_WID + 2.5]) {
      const fuv = [blank, blank, blank, blank, blank, blank];
      if (x < 0) fuv[0] = cell(n); else fuv[1] = cell(n);
      blzMBox(mk, x, 0.48, z, 0.36, 0.48, 0.62, [1, 1, 1], fuv);
    }
  }
  S.markers = blzGLUpload(mk);
  return S;
}

function blzGLBuild(key) {
  const G = blitz.glr, gl = blitz.gl;
  blzGLFree(G.s); blzGLFree(G.team[0]); blzGLFree(G.team[1]);
  for (const k of ['field', 'crowd', 'ads', 'suites', 'markers', 'num', 'helm0', 'helm1']) if (G.tex[k]) { gl.deleteTexture(G.tex[k]); G.tex[k] = null; }
  G.s = blzGLScene();
  G.team = [blzGLTeamMeshes(0), blzGLTeamMeshes(1)];
  G.tex.field = blzGLTex(blzPot(blzPaintField(14), 1024, 2048));
  G.tex.crowd = blzGLTex(blzPaintCrowdGL(), 'u');
  G.tex.ads = blzGLTex(blzPaintAdsGL(), 'u');
  G.tex.suites = blzGLTex(blzPaintSuites(), 'u');
  G.tex.markers = blzGLTex(blzPaintMarkers());
  G.tex.num = blzGLTex(blzPaintJerseys());
  G.tex.helm0 = blzGLTex(blzPaintHelmet(blzTeam(0)));
  G.tex.helm1 = blzGLTex(blzPaintHelmet(blzTeam(1)));
  G.key = key;
}

function blzGLArtMesh(art) {
  const m = blzMesh(), y = 0.025;
  for (const a of art) {
    const col = blzRGB(a.col), pts = a.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1, nx = -dz / L * 0.24, nz = dx / L * 0.24;
      blzMQuad(m, [[x0 - nx, y, z0 - nz], [x1 - nx, y, z1 - nz], [x1 + nx, y, z1 + nz], [x0 + nx, y, z0 + nz]], [0, 1, 0], col);
      if (i === pts.length - 2) {
        // the arrowhead
        const ux = dx / L, uz = dz / L, h = 1.3, w = 0.75;
        const tip = [x1 + ux * h, y, z1 + uz * h], l = [x1 - uz * w, y, z1 + ux * w], r = [x1 + uz * w, y, z1 - ux * w];
        const a0 = blzV(m, l[0], l[1], l[2], 0, 1, 0, col), a1 = blzV(m, r[0], r[1], r[2], 0, 1, 0, col), a2 = blzV(m, tip[0], tip[1], tip[2], 0, 1, 0, col);
        m.i.push(a0, a1, a2);
      }
    }
  }
  return blzGLUpload(m);
}
// the camera, as a clip-space matrix: blzProj line for line
function blzGLMatrix(sx, sy) {
  const c = blitz.cam, W = blitz.W, H = blitz.H, F = blitz.F, m = blitz.glr.vp;
  const cw = c.cyw, sw = c.syw, s = c.s, cc = c.c;
  const dxR = [cw, 0, -sw, -(c.x * cw - c.z * sw)];
  const dzR = [sw, 0, cw, -(c.x * sw + c.z * cw)];
  const dyR = [0, 1, 0, -c.h];
  const zc = [0, 0, 0, 0], yc = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) { zc[i] = -s * dyR[i] + cc * dzR[i]; yc[i] = cc * dyR[i] + s * dzR[i]; }
  const n = 0.5, f = 700, a = (f + n) / (f - n), b = -2 * f * n / (f - n);
  const A = 1 - 2 * blitz.cy / H;
  for (let i = 0; i < 4; i++) {
    m[i * 4] = (2 * F / W) * dxR[i] + (2 * sx / W) * zc[i];
    m[i * 4 + 1] = (2 * F / H) * yc[i] + (A - 2 * sy / H) * zc[i];
    m[i * 4 + 2] = a * zc[i] + (i === 3 ? b : 0);
    m[i * 4 + 3] = zc[i];
  }
  return m;
}

function blzGLSize() {
  const cv = blitz.glCv, vw = window.innerWidth, vh = window.innerHeight, dpr = window.devicePixelRatio || 1;
  // small on purpose: the N64 smear is the CSS upscale of a ~600-line frame
  const h = Math.max(240, Math.round(Math.min(vh * dpr, 620))), w = Math.max(240, Math.round(h * vw / vh));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
}

function blzGLBind(mesh) {
  const G = blitz.glr;
  if (G.last === mesh) return;
  const gl = blitz.gl, A = G.P.a;
  G.last = mesh;
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
  gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, 44, 0);
  if (A.aNor >= 0) gl.vertexAttribPointer(A.aNor, 3, gl.FLOAT, false, 44, 12);
  if (A.aCol >= 0) gl.vertexAttribPointer(A.aCol, 3, gl.FLOAT, false, 44, 24);
  if (A.aUV >= 0) gl.vertexAttribPointer(A.aUV, 2, gl.FLOAT, false, 44, 36);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
}
// one draw: mesh, model matrix, texture (or null), and a few knobs
function blzGLDraw1(mesh, M, tex, o) {
  const gl = blitz.gl, U = blitz.glr.P.u;
  blzGLBind(mesh);
  gl.uniformMatrix4fv(U.uM, false, M);
  gl.uniform1f(U.uLit, o && o.lit === 0 ? 0 : 1);
  const t = (o && o.tint) || null;
  gl.uniform3f(U.uTint, t ? t[0] : 1, t ? t[1] : 1, t ? t[2] : 1);
  const uv = (o && o.uvx) || BLZ_UV1;
  gl.uniform4f(U.uUVX, uv[0], uv[1], uv[2], uv[3]);
  gl.uniform1f(U.uAlpha, o && o.alpha != null ? o.alpha : 1);
  const wv = o && o.wave;
  gl.uniform4f(U.uWave, wv ? wv[0] : 0, wv ? wv[1] : 1, wv ? wv[2] : 0, wv ? 1 : 0);
  if (tex) { gl.uniform1f(U.uUseTex, 1); gl.bindTexture(gl.TEXTURE_2D, tex); }
  else gl.uniform1f(U.uUseTex, 0);
  gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
}
function blzGLMat() {
  const G = blitz.glr;
  let m = G.pool[G.pi];
  if (!m) m = G.pool[G.pi] = new Float32Array(16);
  G.pi++;
  return m;
}
function blzGLBasis(O, X, Y, Z, sx, sy, sz) {
  const m = blzGLMat();
  m[0] = X[0] * sx; m[1] = X[1] * sx; m[2] = X[2] * sx; m[3] = 0;
  m[4] = Y[0] * sy; m[5] = Y[1] * sy; m[6] = Y[2] * sy; m[7] = 0;
  m[8] = Z[0] * sz; m[9] = Z[1] * sz; m[10] = Z[2] * sz; m[11] = 0;
  m[12] = O[0]; m[13] = O[1]; m[14] = O[2]; m[15] = 1;
  return m;
}

// every part of one player, as {mesh, m, tex, uvx} draws
function blzGLPlayer(p, out) {
  const G = blitz.glr, TM = G.team[p.team];
  const J = blzPose(p);
  const big = /^(C|LG|RG|DE1|DT|DE2)$/.test(p.pos), slim = /^(WR1|WR2|CB1|CB2|QB)$/.test(p.pos);
  const sz = BLZ_BS * (big ? 1.07 : slim ? 0.96 : 1);
  let fx = p.fx, fz = p.fz;
  if (p.spinT > 0) {
    const a = (1 - p.spinT / 0.5) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const nx = fx * c - fz * s; fz = fx * s + fz * c; fx = nx;
  }
  const rx = fz, rz = -fx;
  const Wp = (v) => [p.x + (rx * v[0] + fx * v[2]) * sz, p.y + v[1] * sz, p.z + (rz * v[0] + fz * v[2]) * sz];
  const Dv = (v) => blzN([rx * v[0] + fx * v[2], v[1], rz * v[0] + fz * v[2]]);
  const fwd = Dv(J.fwd), up = Dv(J.up);
  const P = {};
  for (const k in J) if (k !== 'fwd' && k !== 'up') P[k] = Wp(J[k]);
  const put = (mesh, O, F, s, sy, tex, uvx, tint) => out.push({ mesh, m: blzGLBasis(O, F[0], F[1], F[2], s, sy, s), tex: tex || null, uvx: uvx || null, tint: tint || null });
  const bone = (a, b, mesh, L0, ref, alt) => {
    const A = P[a], B = P[b];
    const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], len = Math.hypot(d[0], d[1], d[2]) || 1e-3;
    const Y = [d[0] / len, d[1] / len, d[2] / len];
    put(mesh, A, blzFrame(Y, ref, alt), sz, len / L0);
  };
  const tF = blzFrame(blzN([P.neck[0] - P.pel[0], P.neck[1] - P.pel[1], P.neck[2] - P.pel[2]]), fwd, up);
  if (p.extra === 'mascot') {
    // SIR NUGSALOT: one enormous nugget with a face, little arms and legs
    const mid = [(P.pel[0] + P.neck[0]) / 2, (P.pel[1] + P.neck[1]) / 2, (P.pel[2] + P.neck[2]) / 2];
    put(G.sh.mbody, mid, tF, sz * 1.25, sz * 1.25, G.tex.mface);
    for (const sg of [-1, 1]) {
      bone('sh' + sg, 'el' + sg, G.sh.fore, 0.27, fwd, up);
      bone('el' + sg, 'hd' + sg, G.sh.fore, 0.27, fwd, up);
      bone('hip' + sg, 'knee' + sg, G.sh.fore, 0.27, fwd, up);
      bone('knee' + sg, 'foot' + sg, G.sh.fore, 0.27, fwd, up);
      bone('foot' + sg, 'toe' + sg, G.sh.cleat, 0.2, up, fwd);
    }
    return;
  }
  const bare = p.extra === 'cheer' || p.extra === 'coach';
  const idx = p.team * 16 + (bare ? 14 : BLZ_OFF_POS.indexOf(p.pos) >= 0 ? BLZ_OFF_POS.indexOf(p.pos) : 7 + BLZ_DEF_POS.indexOf(p.pos));
  const cell = G.cells[idx] || (G.cells[idx] = [1 / 8, 1 / 4, (idx % 8) / 8, ((idx / 8) | 0) / 4]);
  put(big ? TM.torsoW : TM.torso, P.pel, tF, sz, sz, G.tex.num, cell);
  put(big ? TM.padsW : TM.pads, P.pel, tF, sz, sz);
  put(big ? TM.pelvisW : TM.pelvis, P.pel, tF, sz, sz);
  bone('neck', 'head', G.sh.neck, 0.21, fwd, up);
  const hF = blzFrame(blzN([P.head[0] - P.neck[0], P.head[1] - P.neck[1], P.head[2] - P.neck[2]]), fwd, up);
  const hs = sz * (blitz.codes.huge ? 2.6 : blitz.codes.big ? 1.8 : 1);
  if (bare) {
    put(G.sh.head, P.head, hF, hs, hs, G.tex.face);
    if (p.extra === 'coach') put(G.sh.cap, [P.head[0] + hF[1][0] * 0.1 * hs, P.head[1] + hF[1][1] * 0.1 * hs, P.head[2] + hF[1][2] * 0.1 * hs], hF, hs, hs, null, null, blzRGB(blzTeam(p.team).helm));
    if (p.extra === 'cheer') {
      const T = blzTeam(p.team), c2 = blzRGB(T.c2), c1 = blzRGB(T.c1);
      for (const sg of [-1, 1]) put(G.sh.pom, P['hd' + sg], hF, sz * (1 + 0.12 * Math.sin(blitz.t * 20 + sg)), sz, null, null, sg > 0 ? c2 : c1);
    }
  } else {
    put(G.sh.helmet, P.head, hF, hs, hs, p.team ? G.tex.helm1 : G.tex.helm0);
    put(TM.mask, P.head, hF, hs, hs);
  }
  for (const sg of [-1, 1]) {
    bone('sh' + sg, 'el' + sg, TM.upper, 0.3, fwd, up);
    bone('el' + sg, 'hd' + sg, G.sh.fore, 0.27, fwd, up);
    bone('hip' + sg, 'knee' + sg, TM.thigh, 0.47, fwd, up);
    bone('knee' + sg, 'foot' + sg, TM.shin, 0.47, fwd, up);
    bone('foot' + sg, 'toe' + sg, G.sh.cleat, 0.2, up, fwd);
  }
  // the ball, tucked in his arm
  if (p === blitz.carrier && blitz.ball && blitz.ball.st === 'held') {
    const H = P.hd1, Y = blzN([fwd[0] * 0.8 + up[0] * 0.55, fwd[1] * 0.8 + up[1] * 0.55, fwd[2] * 0.8 + up[2] * 0.55]);
    const bs = blitz.codes.bigball ? 2.4 : 1;
    put(G.sh.ball, H, blzFrame(Y, up, fwd), bs, bs);
  }
}

function blzGLRender(sx, sy) {
  const gl = blitz.gl, G = blitz.glr;
  if (!gl || !G) return false;
  blzGLSize();
  const key = blitz.teams.join('|') + (blitz.codes.night ? 'n' : '');
  if (G.key !== key) blzGLBuild(key);
  if (!G.cells) G.cells = [];
  const night = !!blitz.codes.night, U = G.P.u;
  const fog = night ? [0.03, 0.04, 0.09] : [0.66, 0.76, 0.9];
  gl.viewport(0, 0, blitz.glCv.width, blitz.glCv.height);
  gl.clearColor(fog[0], fog[1], fog[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
  gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.useProgram(G.P.p);
  gl.activeTexture(gl.TEXTURE0); gl.uniform1i(U.uTex, 0);
  gl.uniformMatrix4fv(U.uVP, false, blzGLMatrix(sx, sy));
  // the sun rides with the camera so the cart's look (lit backs, readable fronts) holds both ways
  const d = blitz.cam.dir, L = blzN([-0.45 * d, 0.82, -0.36 * d]);
  gl.uniform3f(U.uLight, L[0], L[1], L[2]);
  gl.uniform1f(U.uAmb, night ? 0.4 : 0.5);
  gl.uniform3f(U.uFog, fog[0], fog[1], fog[2]);
  G.last = null; G.pi = 0;
  const I = G.I, S = G.s;
  // the stadium
  blzGLDraw1(S.turf, I, null, { lit: 0 });
  blzGLDraw1(S.field, I, G.tex.field, { lit: 0 });
  const bounce = Math.sin(blitz.t * 15) * 0.0045 * Math.min(1, blitz.crowdJump || 0);
  const W8 = blitz.wave ? [blitz.wave.z, 7, 0.6] : null;
  blzGLDraw1(S.crowd, I, G.tex.crowd, { lit: 0, tint: night ? [0.62, 0.62, 0.7] : null, uvx: [1, 1, 0, bounce], wave: W8 });
  blzGLDraw1(S.walls, I, G.tex.ads, { lit: 0 });
  blzGLDraw1(S.suites, I, G.tex.suites, { lit: 0 });
  blzGLDraw1(S.props, I, null, {});
  blzGLDraw1(S.markers, I, G.tex.markers, {});
  // painted-on lines: the line of scrimmage and the line to gain
  const ph = blitz.phase;
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -4);
  if (ph === 'call' || ph === 'pre' || (ph === 'live' && blitz.pocket)) {
    blzGLDraw1(G.sh.line, blzGLBasis([0, 0.01, blitz.los], [BLZ_WID, 0, 0], [0, 1, 0], [0, 0, 0.42], 1, 1, 1), null, { lit: 0, tint: [0.25, 0.5, 1] });
    if (blitz.kind !== 'kick' && blitz.firstAt !== blzGoal(blitz.poss))
      blzGLDraw1(G.sh.line, blzGLBasis([0, 0.01, blitz.firstAt], [BLZ_WID, 0, 0], [0, 1, 0], [0, 0, 0.42], 1, 1, 1), null, { lit: 0, tint: [1, 0.86, 0.15] });
  }
  // the play art: your routes on the turf before the snap
  const art = blzRouteArt();
  if (art && art.length) {
    const key = art.map((a) => a.col + a.pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(';')).join('|');
    if (G.artKey !== key) { if (G.artMesh) blzGLFree({ m: G.artMesh }); G.artMesh = blzGLArtMesh(art); G.artKey = key; }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    blzGLDraw1(G.artMesh, I, null, { lit: 0, alpha: 0.82 * art[0].a });
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  // blob shadows + the human's ring (blended, no depth writes)
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  for (const p of blitz.players) {
    const lying = p.downT > 0 || p.diveT > 0 || (p.scr && p.scr.drop > 0.35);
    const s = BLZ_BS * (lying ? 1.0 : 0.62) / (1 + p.y * 0.25), l = lying ? 1.7 : 1;
    blzGLDraw1(G.sh.decal, blzGLBasis([p.x, 0.02, p.z], [p.fz, 0, -p.fx], [0, 1, 0], [p.fx, 0, p.fz], s, 1, s * l), G.tex.blob, { lit: 0 });
  }
  const B = blitz.ball;
  if (B && !(B.st === 'held' && blitz.carrier)) blzGLDraw1(G.sh.decal, blzGLBasis([B.x, 0.02, B.z], [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.32, 1, 0.32), G.tex.blob, { lit: 0 });
  const me = blitz.ctl;
  if (me && blzHuman(me.team) && ph !== 'final') {
    const pulse = 1 + Math.sin(blitz.t * 7) * 0.05, s = BLZ_BS * 0.95 * pulse;
    blzGLDraw1(G.sh.decal, blzGLBasis([me.x, 0.03, me.z], [1, 0, 0], [0, 1, 0], [0, 0, 1], s, 1, s), G.tex.ring, { lit: 0 });
  }
  gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.POLYGON_OFFSET_FILL);
  // the players, grouped by mesh so each buffer binds once
  const out = G.draws; out.length = 0;
  for (const p of blitz.players) blzGLPlayer(p, out);
  // the sideline: only what's near enough to read
  if (blitz.extras && blitz.phase !== 'replay') {
    const c = blitz.cam;
    for (const e of blitz.extras) {
      const dz = (e.z - c.z) * c.cyw + (e.x - c.x) * c.syw;
      if (dz < 2 || dz > 95) continue;
      blzGLPlayer(e, out);
    }
  }
  out.sort((a, b) => a.mesh.id - b.mesh.id);
  for (const dr of out) blzGLDraw1(dr.mesh, dr.m, dr.tex, dr.uvx || dr.tint ? { uvx: dr.uvx, tint: dr.tint } : null);
  // the ball, when nobody has it
  if (B && !(B.st === 'held' && blitz.carrier)) {
    let Y = [0, 0, 1], spin = 0;
    if (B.st === 'air') {
      const u = Math.min(1, B.t / B.T);
      Y = blzN([(B.tx - B.x0) / B.T, (B.ty - B.y0) / B.T + B.peak * 4 * (1 - 2 * u) / B.T, (B.tz - B.z0) / B.T]);
      spin = blitz.t * 24;
      if (B.kind !== 'pass' && B.kind !== 'lat') { Y = blzN([Math.sin(blitz.t * 9), Math.cos(blitz.t * 9), 0.3]); spin = 0; } // kicks tumble end over end
    } else if (B.st === 'tee') Y = [0, 1, 0];
    else Y = blzN([Math.cos(B.x * 1.3 + (B.st === 'loose' ? blitz.t * 10 : 0)), 0.15, Math.sin(B.x * 1.3 + (B.st === 'loose' ? blitz.t * 10 : 0))]);
    const F = blzFrame(Y, [0, 1, 0], [1, 0, 0]), c = Math.cos(spin), s = Math.sin(spin);
    const X2 = [F[0][0] * c + F[2][0] * s, F[0][1] * c + F[2][1] * s, F[0][2] * c + F[2][2] * s];
    const Z2 = [F[2][0] * c - F[0][0] * s, F[2][1] * c - F[0][1] * s, F[2][2] * c - F[0][2] * s];
    const bs = blitz.codes.bigball ? 2.4 : 1;
    const y = B.st === 'tee' ? 0.3 : Math.max(B.y, 0.15);
    blzGLDraw1(G.sh.ball, blzGLBasis([B.x, y, B.z], X2, Y, Z2, bs, bs, bs), null, {});
  }
  return true;
}

// The receiver icons: a colored button over every eligible man's head (the
// letter is the key you'd press: J K L on a keyboard, X A B on a pad or touch).
// Off-screen receivers pin to the edge with a pointer. The man you're looking
// at (SPACE throws to him) gets a white ring; a held button fills its rim.
function blzDrawRcvIcons(g, W, H) {
  blitz.hit.rcv = [];
  const ph = blitz.phase, C = blitz.carrier, off = blitz.poss;
  if (!blitz.rcv || !blzHuman(off) || blitz.kind !== 'pass') return;
  if (!(ph === 'pre' || (ph === 'live' && blitz.pocket && C && C.pos === 'QB' && !blitz.thrown))) return;
  const rad = Math.max(8, 10 * blitz.ui);
  for (const btn of ['X', 'A', 'B']) {
    const r = blitz.rcv[btn];
    if (!r || r.downT > 0) continue;
    const P = blzProj(r.x, 3.55 * (BLZ_BS / 1.4) + r.y, r.z);
    if (!P) continue;
    let x = P.x, y = P.y - rad * 0.4, pin = 0;
    if (x < rad + 6) { x = rad + 6; pin = -1; } else if (x > W - rad - 6) { x = W - rad - 6; pin = 1; }
    // (on a portrait phone the score boxes sit lower: keep the icons under them)
    y = blzClamp(y, H > W * 1.2 ? H * 0.33 : rad + 52, H - rad - 40);
    const col = BLZ_BTN_COL[btn];
    if (pin) {
      g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x + pin * (rad + 7), y); g.lineTo(x + pin * (rad - 1), y - 6); g.lineTo(x + pin * (rad - 1), y + 6); g.closePath(); g.fill(); g.stroke();
    }
    g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, rad + 2, 0, Math.PI * 2); g.fill();
    const gr = g.createRadialGradient(x - rad * 0.35, y - rad * 0.4, 1, x, y, rad);
    gr.addColorStop(0, blzMix(col, 0.55)); gr.addColorStop(0.6, col); gr.addColorStop(1, blzMix(col, 0.4, '#000000'));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    g.font = '900 ' + Math.round(rad * 1.3) + 'px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.fillText(blzBtnLabel(btn), x, y + 1);
    if (blitz.target === r) { g.strokeStyle = 'rgba(255,255,255,' + (0.6 + 0.4 * Math.sin(blitz.t * 10)).toFixed(2) + ')'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, rad + 4, 0, Math.PI * 2); g.stroke(); }
    const ch = blitz.charge;
    if (ch && ch.btn === btn) {
      const u = Math.min(1, (blitz.t - ch.t0) / BLZ_HOLD);
      g.strokeStyle = u >= 1 ? '#ff5a3a' : '#ffffff'; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, rad + 5, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2); g.stroke();
    }
    blitz.hit.rcv.push({ x, y, r: rad + 8, btn });
  }
}

// the bits the polygons don't draw: sparks, the "1" arrow + name, the receiver icons, the fire glow
function blzDrawOverlay3D(g, W, H) {
  blzDrawCrowdFx(g, W, H);
  const items = [];
  for (const q of blitz.parts) { const P = blzProj(q.x, q.y, q.z); if (P) items.push({ P, q }); }
  items.sort((a, b) => b.P.zc - a.P.zc);
  for (const it of items) blzDrawPart(g, it.q, it.P);
  // on fire: a glow off the burning carrier / your man
  for (const p of blitz.players) {
    if (!blzOnFire(p.team) || !(p === blitz.carrier || p === blitz.ctl)) continue;
    const P = blzProj(p.x, 1.6 + p.y, p.z);
    if (!P) continue;
    const r = P.k * 1.8;
    g.save(); g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.45 + 0.2 * Math.sin(blitz.t * 22);
    const gr = g.createRadialGradient(P.x, P.y, 0, P.x, P.y, r);
    gr.addColorStop(0, 'rgba(255,200,80,0.8)'); gr.addColorStop(0.5, 'rgba(255,100,20,0.45)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(P.x, P.y, r * 0.8, r * 1.2, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  const ph = blitz.phase, me = blitz.ctl;
  if (me && blzHuman(me.team) && ph !== 'final') blzDrawMarker(g, me);
  blzDrawRcvIcons(g, W, H);
  if (blitz.codes.night) {
    const v = g.createRadialGradient(W / 2, H * 0.6, H * 0.2, W / 2, H * 0.6, H * 0.9);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,10,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
}

// ---- HUD: the cart's chrome ----------------------------------------------------------------------
function blzClockTxt() {
  // the cart's quarters read 2:00; ours are BLZ_QLEN seconds of live play, shown at that scale
  const s = Math.ceil(blitz.clock * 120 / BLZ_QLEN), m = (s / 60) | 0;
  return m + ':' + String(s % 60).padStart(2, '0');
}
// a beveled box with a blue-steel rim (slant > 0 leans it like the TURBO bar)
function blzChrome(g, x, y, w, h, slant, fill) {
  const c = Math.min(7, h * 0.32), s = slant || 0;
  const path = () => {
    g.beginPath();
    g.moveTo(x + c + s, y); g.lineTo(x + w - c + s, y); g.lineTo(x + w + s * 0.5, y + c); g.lineTo(x + w, y + h - c);
    g.lineTo(x + w - c - s * 0.2, y + h); g.lineTo(x + c - s, y + h); g.lineTo(x - s * 0.5, y + h - c); g.lineTo(x + s * 0.2, y + c);
    g.closePath();
  };
  path();
  g.fillStyle = fill || 'rgba(6,12,30,0.86)'; g.fill();
  g.lineJoin = 'round';
  g.lineWidth = 4; g.strokeStyle = '#0a1024'; g.stroke();
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#e8f2ff'); gr.addColorStop(0.45, '#7aa8e8'); gr.addColorStop(1, '#2a4a9a');
  g.lineWidth = 1.8; g.strokeStyle = gr; g.stroke();
  return path;
}

function blzDrawHud(g, W, H) {
  const ui = blitz.ui, portrait = H > W * 1.2;
  // the scorebox: clock + quarter on the left, the two teams on the right
  const top = portrait ? Math.round(H * 0.17) : 6;
  const bx = 8, by = top, bw = 124 * ui, bh = 36 * ui;
  blzChrome(g, bx, by, bw, bh);
  blzText(g, blzClockTxt(), bx + 8 * ui, by + bh * 0.3, 15 * ui, blitz.clock < 10 ? '#ff7a6a' : '#ffffff');
  blzText(g, blitz.ot ? 'OT' : blzOrd(blitz.q), bx + 8 * ui, by + bh * 0.74, 13 * ui, '#ffffff');
  for (let i = 0; i < 2; i++) {
    const T = blzTeam(i), y = by + bh * (i ? 0.74 : 0.3);
    const col = i === 0 ? '#ffe23a' : '#ffffff';
    blzText(g, T.abbr, bx + 62 * ui, y, 13 * ui, col);
    blzText(g, String(blitz.score[i]), bx + bw - 8 * ui, y, 14 * ui, col, 'right');
    if (i === blitz.poss && blitz.kind !== 'kick') { g.fillStyle = '#a85a2a'; g.beginPath(); g.ellipse(bx + 55 * ui, y, 3.4 * ui, 2 * ui, 0.4, 0, 7); g.fill(); }
    if (blzOnFire(i)) blzText(g, '🔥', bx + bw + 8, y, 10 * ui, '#fff', 'center', false);
    // their HYPE, a thin flame under the name
    const hv = blitz.hype[i] || 0, hx = bx + 62 * ui, hwid = bw - 70 * ui, hy = y + 6 * ui;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(hx, hy, hwid, 2.2 * ui);
    if (hv > 0) { g.fillStyle = blzOnFire(i) ? (((blitz.t * 10) | 0) % 2 ? '#ffd23a' : '#ff5a1a') : hv >= 0.6 ? '#ff8a1e' : '#c8641e'; g.fillRect(hx, hy, hwid * hv, 2.2 * ui); }
  }
  const ph = blitz.phase;
  // TURBO, bottom left: the bar IS the meter
  if (ph !== 'final' && ph !== 'call') {
    const tw = 150 * ui, th = 20 * ui, tx = 14, ty = H - th - 8;
    const fire = blzOnFire(0) || blitz.codes.inf;
    const path = blzChrome(g, tx, ty, tw, th, 6, 'rgba(6,12,30,0.86)');
    const v = fire ? 1 : blitz.turbo[0];
    g.save(); path(); g.clip();
    const fg = g.createLinearGradient(0, ty, 0, ty + th);
    if (fire) { const f = ((blitz.t * 10) | 0) % 2; fg.addColorStop(0, f ? '#ffd23a' : '#ff8a1e'); fg.addColorStop(1, f ? '#c84a0a' : '#a82a0a'); }
    else { fg.addColorStop(0, '#6aa0ff'); fg.addColorStop(0.5, '#2a5ae8'); fg.addColorStop(1, '#122a8a'); }
    g.fillStyle = fg; g.fillRect(tx - 10, ty, (tw + 20) * v, th);
    g.restore();
    g.save(); g.translate(tx + tw / 2, ty + th / 2 + 1); g.transform(1, 0, -0.25, 1, 0, 0);
    blzText(g, 'TURBO', 0, 0, 15 * ui, '#e8eeff', 'center');
    g.restore();
    // HYPE: big plays, hits, taunts and showboating fill it; full = ON FIRE
    const hw = tw * 0.82, hh = 11 * ui, hx = tx + 6, hy = ty - hh - 5;
    const hv = blitz.hype[0] || 0, burning = blzOnFire(0);
    const hp = blzChrome(g, hx, hy, hw, hh, 4, 'rgba(6,12,30,0.86)');
    g.save(); hp(); g.clip();
    if (hv > 0) {
      const hg = g.createLinearGradient(hx, 0, hx + hw, 0);
      hg.addColorStop(0, '#a8240a'); hg.addColorStop(0.6, '#ff6a1a'); hg.addColorStop(1, '#ffd23a');
      g.fillStyle = hg; g.fillRect(hx - 6, hy, (hw + 12) * (burning ? 1 : hv), hh);
      if (hv >= 0.6 || burning) {
        // the meter itself flickers once you're heating up
        for (let i = 0; i < 6; i++) { const fxp = hx + (i + 0.5) / 6 * hw * (burning ? 1 : hv); g.fillStyle = 'rgba(255,230,120,' + (0.25 + 0.25 * Math.sin(blitz.t * 18 + i * 2)).toFixed(2) + ')'; g.beginPath(); g.ellipse(fxp, hy + hh * 0.3, 3 * ui, hh * 0.45, 0, 0, 7); g.fill(); }
      }
    }
    g.restore();
    blzText(g, burning ? 'ON FIRE!' : hv >= 0.6 ? 'HEATING UP' : 'HYPE', hx + hw / 2, hy + hh / 2 + 1, 9 * ui, burning ? '#fff2a8' : '#ffd8b0', 'center');
  }
  // down & distance, bottom right (where the cart says PRESS START)
  if (ph !== 'final') {
    let dd = '', sub = '';
    if (blitz.kind === 'kick') dd = 'KICKOFF';
    else if (blitz.pat2) dd = '2-PT TRY';
    else {
      const goal = blitz.firstAt === blzGoal(blitz.poss);
      dd = blzOrd(blitz.down) + ' & ' + (goal ? 'GOAL' : Math.max(1, Math.round(Math.abs(blitz.firstAt - blitz.los))));
      sub = blzYardTxt(blitz.los, blitz.poss);
    }
    const tw = 132 * ui, th = 20 * ui, tx = W - tw - 14, ty = H - th - 8;
    blzChrome(g, tx, ty, tw, th, 6);
    g.save(); g.translate(tx + tw / 2, ty + th / 2 + 1); g.transform(1, 0, -0.2, 1, 0, 0);
    blzText(g, dd, 0, 0, 14 * ui, '#ffffff', 'center');
    g.restore();
    if (sub) blzText(g, sub, tx + tw - 4, ty - 8, 10 * ui, '#c8dcff', 'right');
  }
  // the feed, right side above the box
  let fy = H - 48 * ui;
  for (let i = blitz.feed.length - 1; i >= 0; i--) {
    const f = blitz.feed[i];
    g.globalAlpha = Math.min(1, f.t * 2);
    blzText(g, f.text, W - 14, fy, 10 * ui, f.color, 'right');
    fy -= 13 * ui;
  }
  g.globalAlpha = 1;
  const pad = blitz.inputMode === 'pad', tch = blitz.inputMode === 'touch';
  const TAUNT = pad ? 'RT' : tch ? 'TURBO' : 'SHIFT';
  // (on a portrait phone the touch buttons own the bottom: the hints ride higher)
  const hy1 = portrait ? H * 0.66 : H * 0.78, hy2 = portrait ? H * 0.7 : H * 0.83;
  if (ph === 'pre' && blzHuman(blitz.poss)) {
    if (blitz.hot) {
      blzTextC(g, blitz.hot.stage === 'pick' ? 'HOT ROUTE: PICK A RECEIVER (' + (pad ? 'X · A · B' : 'J · K · L') + ')' : 'HOT ROUTE: ↑ GO · ↓ CURL · TO THE MIDDLE SLANT · TO THE SIDELINE OUT', W / 2, hy1, 11 * ui, '#ffe23a');
      blzTextC(g, (pad ? 'Y' : 'I') + ' AGAIN TO CANCEL', W / 2, hy2, 9 * ui, '#c8dcff');
    } else {
      if (((blitz.t * 2) | 0) % 2 === 0) blzTextC(g, pad ? 'A TO HIKE' : tch ? 'PASS TO HIKE' : 'SPACE TO HIKE', W / 2, hy1, 14 * ui, '#ffffff');
      const hr = blitz.kind === 'pass' && !tch ? ' · ' + (pad ? 'Y' : 'I') + ' HOT ROUTE' : '';
      blzTextC(g, TAUNT + ' TAUNT' + hr + (blitz.kind === 'pass' ? ' · ' + (tch ? 'TAP AN ICON: ROUTE / THROW' : (pad ? 'X A B' : 'J K L') + ' THROW: TAP = LOB, HOLD = BULLET') : ''), W / 2, hy2, 9 * ui, '#c8dcff');
    }
  }
  if (ph === 'pre' && blzHuman(1 - blitz.poss))
    blzTextC(g, (pad ? 'B' : tch ? 'PASS' : 'SPACE / L') + ' SWITCH DEFENDER · ' + TAUNT + ' TAUNT', W / 2, hy2, 10 * ui, '#c8dcff');
  // your ball carrier in the open: offer the showboat
  const C = blitz.carrier;
  if (ph === 'live' && C && C === blitz.ctl && blzHuman(C.team) && !blitz.pocket && !C.showboat && !blzThreatAhead(C, 7) && ((blitz.t * 3) | 0) % 2 === 0)
    blzTextC(g, (pad ? 'Y' : tch ? 'JUMP' : 'I') + ' = SHOWBOAT (RISKY!)', W / 2, H * 0.86, 10 * ui, '#ffcf8a');
  if (ph === 'dead' && blitz.dead && blitz.dead.type === 'td' && blitz.dead.who && blzHuman(blitz.dead.who.team) && !blitz.celebDone)
    blzTextC(g, 'CELEBRATE: ' + (pad ? 'X SPIKE · A DANCE · B BACKFLIP · Y FLEX' : tch ? 'TAP PASS / JUMP' : 'J SPIKE · K DANCE · L BACKFLIP · I FLEX'), W / 2, H * 0.84, 10 * ui, '#ffe23a');
}

// the trash talk: comic bubbles over their helmets
function blzDrawBubbles(g, W, H) {
  const placed = [];
  const order = blitz.bubbles.slice().sort((a, b) => (b.p.z - a.p.z) * blitz.cam.dir);
  for (const b of order) {
    const p = b.p, P = blzProj(p.x, p.y + 3.25, p.z);
    if (!P) continue;
    const u = b.t / b.T, pop = b.t < 0.12 ? 0.6 + b.t / 0.12 * 0.4 : 1, a = u > 0.82 ? (1 - u) / 0.18 : 1;
    const size = blzClamp(P.k * (b.big ? 0.62 : 0.5), 8, b.big ? 15 : 12) * pop * blitz.ui;
    g.font = '900 italic ' + Math.round(size) + 'px Impact, "Arial Black", sans-serif';
    const tw = g.measureText(b.text).width, pw = tw + size * 0.9, ph2 = size * 1.5;
    let x = blzClamp(P.x, pw / 2 + 4, W - pw / 2 - 4), y = Math.max(ph2 + 4, P.y - ph2 * 0.6);
    // nudge up past anything already drawn there
    for (let k = 0; k < 4; k++) {
      const hit = placed.find((q) => Math.abs(q.x - x) < (q.w + pw) / 2 && Math.abs(q.y - y) < (q.h + ph2) / 2 + 2);
      if (!hit) break;
      y = hit.y - (hit.h + ph2) / 2 - 3;
    }
    placed.push({ x, y, w: pw, h: ph2 });
    g.save(); g.globalAlpha = Math.max(0, a);
    g.fillStyle = b.col; g.strokeStyle = '#111'; g.lineWidth = 2;
    const r = ph2 * 0.42, x0 = x - pw / 2, y0 = y - ph2 / 2;
    g.beginPath();
    g.moveTo(x0 + r, y0); g.lineTo(x0 + pw - r, y0); g.quadraticCurveTo(x0 + pw, y0, x0 + pw, y0 + r);
    g.lineTo(x0 + pw, y0 + ph2 - r); g.quadraticCurveTo(x0 + pw, y0 + ph2, x0 + pw - r, y0 + ph2);
    const tx = blzClamp(P.x, x0 + r + 4, x0 + pw - r - 4);
    g.lineTo(tx + 5, y0 + ph2); g.lineTo(tx, y0 + ph2 + 7); g.lineTo(tx - 3, y0 + ph2);
    g.lineTo(x0 + r, y0 + ph2); g.quadraticCurveTo(x0, y0 + ph2, x0, y0 + ph2 - r);
    g.lineTo(x0, y0 + r); g.quadraticCurveTo(x0, y0, x0 + r, y0);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#141414'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.text, x, y + 1);
    g.restore();
  }
}

// ---- TEAM SELECT -----------------------------------------------------------------------------------
// a big helmet in profile, for the select screen and the VS screen
function blzHelmetIcon(g, T, x, y, r, facing) {
  const s = facing || 1;
  g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, r + 3, 0, Math.PI * 2); g.fill();
  const gr = g.createRadialGradient(x - r * 0.4 * s, y - r * 0.45, r * 0.1, x, y, r * 1.05);
  gr.addColorStop(0, blzMix(T.helm, 0.6)); gr.addColorStop(0.55, T.helm); gr.addColorStop(1, blzMix(T.helm, 0.45, '#000000'));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
  g.fillStyle = T.stripe; g.fillRect(x - r, y - r * 0.92, r * 2, r * 0.22);
  g.fillStyle = '#0a0a10'; g.fillRect(x + s * r * 0.55 - (s < 0 ? r * 0.5 : 0), y + r * 0.05, r * 0.5, r * 0.6);
  g.restore();
  g.strokeStyle = T.mask; g.lineWidth = Math.max(2, r * 0.12); g.lineCap = 'round';
  const fx0 = x + s * r * 0.75;
  g.beginPath(); g.moveTo(fx0, y - r * 0.05); g.lineTo(fx0 + s * r * 0.3, y + r * 0.5); g.lineTo(x + s * r * 0.35, y + r * 0.85); g.stroke();
  g.beginPath(); g.moveTo(x + s * r * 0.3, y + r * 0.35); g.lineTo(fx0 + s * r * 0.25, y + r * 0.35); g.stroke();
  g.beginPath(); g.moveTo(x + s * r * 0.3, y + r * 0.62); g.lineTo(fx0 + s * r * 0.15, y + r * 0.62); g.stroke();
  const lx = x - s * r * 0.15, ly = y - r * 0.05;
  g.fillStyle = T.c2; g.beginPath(); g.arc(lx, ly, r * 0.38, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
  g.font = '900 italic ' + Math.round(r * 0.58) + 'px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = T.helm === T.c2 ? '#ffffff' : T.helm; g.fillText(T.logo, lx, ly + r * 0.03);
}

function blzDrawTeams(g, W, H) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a1a4a'); bg.addColorStop(1, '#02040e');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(80,130,255,0.12)'; g.lineWidth = 1;
  for (let x = -H; x < W; x += 16) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H, 0); g.stroke(); }
  const t = blitz.vsT;
  g.save(); g.translate(W / 2, 34); g.transform(1, 0, -0.2, 1, 0, 0);
  blzText(g, 'SELECT YOUR TEAM', 0, 0, 24, '#ffe23a', 'center');
  g.restore();
  const cols = W < 420 ? 2 : 4, rows = BLZ_TEAM_ORDER.length / cols;
  const gw = Math.min(W - 20, 560), cw = (gw - (cols - 1) * 8) / cols;
  const top = 58, ch = Math.min(96, (H - top - 92) / rows - 8);
  const x0 = (W - gw) / 2;
  blitz.hit.cards = [];
  BLZ_TEAM_ORDER.forEach((key, i) => {
    const T = BLZ_TEAMS[key], r = (i / cols) | 0, c = i % cols;
    const x = x0 + c * (cw + 8), y = top + r * (ch + 8);
    const sel = i === blitz.teamSel;
    const fill = sel ? blzMix(T.c1, 0.1, '#000000') : 'rgba(6,12,30,0.86)';
    blzChrome(g, x, y, cw, ch, 0, fill);
    if (sel) { g.strokeStyle = ((t * 4) | 0) % 2 ? '#ffe23a' : '#ffffff'; g.lineWidth = 2.5; g.strokeRect(x - 3, y - 3, cw + 6, ch + 6); }
    blzHelmetIcon(g, T, x + cw / 2, y + ch * 0.4, Math.min(ch * 0.27, cw * 0.22), 1);
    blzText(g, String(i + 1), x + 8, y + 10, 10, '#ffe23a');
    blzText(g, T.name, x + cw / 2, y + ch * 0.8, Math.min(13, cw / T.name.length * 1.7), '#ffffff', 'center');
    blzText(g, T.city, x + cw / 2, y + ch * 0.93, Math.min(8, cw / T.city.length * 1.4), blzMix(T.c2, 0.2), 'center');
    blitz.hit.cards.push({ x, y, w: cw, h: ch, n: i });
  });
  const T = BLZ_TEAMS[BLZ_TEAM_ORDER[blitz.teamSel]];
  const tier = blitz.cfg, opp = BLZ_TEAMS[tier.opp === BLZ_TEAM_ORDER[blitz.teamSel] ? tier.alt : tier.opp];
  const yb = top + rows * (ch + 8) + 10;
  blzText(g, T.full, W / 2, yb + 4, 18, blzMix(T.c2, 0.15), 'center');
  blzText(g, T.blurb, W / 2, yb + 24, 10, '#c8dcff', 'center');
  blzText(g, tier.name + ' · VS ' + opp.full, W / 2, yb + 42, 11, '#ffffff', 'center');
  if (((t * 2) | 0) % 2 === 0) blzText(g, 'ARROWS + PASS / ENTER (OR TAP A TEAM)', W / 2, H - 14, 10, '#ffe23a', 'center');
}

function blzDrawBanner(g, W, H) {
  const b = blitz.banner;
  if (!b) return;
  const u = b.t / b.T;
  const zoom = u < 0.12 ? 2.2 - u / 0.12 * 1.2 : 1;
  const a = u > 0.85 ? (1 - u) / 0.15 : 1;
  const size = Math.min(54, W / Math.max(6, b.text.length) * 1.4) * zoom;
  g.save();
  g.globalAlpha = Math.max(0, a);
  g.translate(W / 2, H * 0.36);
  g.transform(1, 0, -0.18, 1, 0, 0);
  g.font = '900 italic ' + Math.round(size) + 'px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = size * 0.16; g.strokeStyle = '#000'; g.lineJoin = 'round';
  g.strokeText(b.text, 0, 0);
  const gr = g.createLinearGradient(0, -size / 2, 0, size / 2);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, b.color); gr.addColorStop(1, blzMix(b.color.length === 7 ? b.color : '#ffd23a', 0.45, '#000000'));
  g.fillStyle = gr; g.fillText(b.text, 0, 0);
  if (b.sub) {
    g.font = '900 italic ' + Math.round(13 * blitz.ui) + 'px Impact, "Arial Black", sans-serif';
    g.lineWidth = 3; g.strokeText(b.sub, 0, size * 0.62);
    g.fillStyle = '#ffffff'; g.fillText(b.sub, 0, size * 0.62);
  }
  g.restore();
}

// ---- the play-select screen ---------------------------------------------------------------------
function blzDrawCall(g, W, H) {
  const off = blitz.callFor === 'off';
  const plays = off ? BLZ_OFF_PLAYS : BLZ_DEF_PLAYS;
  g.fillStyle = 'rgba(2,4,14,0.5)'; g.fillRect(0, 0, W, H);
  const gw = Math.min(W - 16, 540), cw = (gw - 12) / 3, top = Math.max(58, H * 0.19);
  const ch = Math.min(80, (H - top - (off ? 72 : 40)) / 3 - 6);
  const x0 = (W - gw) / 2;
  g.save(); g.translate(W / 2, top - 22); g.transform(1, 0, -0.2, 1, 0, 0);
  blzText(g, off ? 'SELECT OFFENSIVE PLAY' : 'SELECT DEFENSIVE PLAY', 0, 0, 18 * blitz.ui, off ? '#ffe23a' : '#7ad0ff', 'center');
  g.restore();
  const T = 15 - blitz.callT;
  blzText(g, String(Math.max(0, Math.ceil(T))), x0 + gw, top - 22, 15, T < 4 ? '#ff6a5a' : '#ffffff', 'right');
  blitz.hit.cards = []; blitz.hit.extra = [];
  plays.forEach((pl, i) => {
    const r = (i / 3) | 0, cI = i % 3;
    const x = x0 + cI * (cw + 6), y = top + r * (ch + 6);
    const sel = i === blitz.callSel;
    blzChrome(g, x, y, cw, ch, 0, sel ? (off ? 'rgba(90,60,10,0.92)' : 'rgba(10,60,96,0.92)') : 'rgba(6,12,30,0.88)');
    if (sel) { g.strokeStyle = ((blitz.t * 4) | 0) % 2 ? '#ffe23a' : '#ffffff'; g.lineWidth = 2; g.strokeRect(x - 2, y - 2, cw + 4, ch + 4); }
    blzText(g, String(i + 1), x + 7, y + 10, 10, '#ffe23a');
    blzText(g, pl.name, x + cw / 2, y + ch - 10, Math.min(12, cw / pl.name.length * 1.5), '#ffffff', 'center');
    blzDrawDiagram(g, pl, off, x + 6, y + 17, cw - 12, ch - 32);
    blitz.hit.cards.push({ x, y, w: cw, h: ch, n: i });
  });
  // special teams (offense only): FLIP, PUNT, FIELD GOAL — and the two fakes
  let ey = top + 3 * (ch + 6) + 2;
  if (off) {
    const rows = [[{ t: (blitz.flip ? '◀ FLIPPED' : 'FLIP ▶') + ' [F]', n: 'flip' }], []];
    if (!blitz.pat2 && !blitz.codes.nopunt) rows[0].push({ t: 'PUNT [P]', n: 'punt' });
    if (!blitz.pat2) {
      const dist = blzFGDist();
      rows[0].push({ t: 'FIELD GOAL ' + dist + (blitz.codes.fgpct ? ' (' + Math.round(blzFGOdds(dist) * 100) + '%)' : '') + ' [G]', n: 'fg' });
      rows[1].push({ t: 'FAKE PUNT [U]', n: 'fakepunt' }, { t: 'FAKE FIELD GOAL [H]', n: 'fakefg' });
    }
    for (const items of rows) {
      if (!items.length) continue;
      const iw = (gw - (items.length - 1) * 6) / items.length;
      items.forEach((it, i) => {
        const x = x0 + i * (iw + 6);
        blzChrome(g, x, ey, iw, 18, 0, it.n.startsWith('fake') ? 'rgba(70,16,10,0.88)' : 'rgba(6,12,30,0.88)');
        blzText(g, it.t, x + iw / 2, ey + 10, 10, it.n === 'flip' && blitz.flip ? '#ffe23a' : '#ffffff', 'center');
        blitz.hit.extra.push({ x, y: ey, w: iw, h: 18, n: it.n });
      });
      ey += 22;
    }
  }
  blzTextC(g, '1-9 / ARROWS + PASS · ' + blzOrd(blitz.down) + ' & ' + (blitz.firstAt === blzGoal(blitz.poss) ? 'GOAL' : Math.max(1, Math.round(Math.abs(blitz.firstAt - blitz.los)))) + ' · ' + blzYardTxt(blitz.los, blitz.poss), W / 2, ey + 8, 9, '#c8dcff');
}

// a little chalkboard: the play's routes from its own data
function blzDrawDiagram(g, pl, off, x, y, w, h) {
  g.fillStyle = 'rgba(30,70,30,0.55)'; g.fillRect(x, y, w, h);
  const los = y + h * 0.78, cx = x + w / 2;
  const sxk = w / 40, szk = h * 0.72 / 32;
  const fl = blitz.flip && off ? -1 : 1;
  g.fillStyle = 'rgba(80,140,255,0.8)'; g.fillRect(x, los, w, 1);
  if (off) {
    const form = Object.assign({}, BLZ_FORM, pl.form || {});
    for (const pos of BLZ_OFF_POS) {
      const f = form[pos], px = cx + f[0] * sxk * fl, pz = los - f[1] * szk * 0.6;
      const rt = pos === 'RB' && pl.kind === 'run' ? pl.rb : pl.routes && pl.routes[pos];
      if (rt) {
        g.strokeStyle = pos === pl.primary ? '#ffd23a' : pl.kind === 'run' && pos === 'RB' ? '#ff8a5a' : '#ffffff';
        g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(px, pz);
        for (const wp of rt) g.lineTo(px + wp[0] * sxk * fl, Math.max(y + 1, pz - wp[1] * szk));
        g.stroke();
      }
      g.fillStyle = pos === 'QB' ? '#ffd23a' : '#ffffff';
      g.fillRect(px - 1.5, pz - 1.5, 3, 3);
    }
  } else {
    pl.roles.forEach((role, i) => {
      const base = [[-4, 1], [0, 1], [4, 1], [0, 5], [-14, 6], [14, 6], [0, 13]][i];
      const px = cx + base[0] * sxk, pz = los - base[1] * szk;
      g.lineWidth = 1.2;
      if (role === 'rush') { g.strokeStyle = '#ff6a5a'; g.beginPath(); g.moveTo(px, pz); g.lineTo(cx, los + 6); g.stroke(); }
      else if (Array.isArray(role)) {
        g.strokeStyle = role[0] === 'deep' ? '#7ad0ff' : '#9affa0';
        g.beginPath(); g.ellipse(cx + role[1] * sxk, Math.max(y + 4, los - role[2] * szk), 6, 3.5, 0, 0, 7); g.stroke();
      } else if (role === 'spy') { g.strokeStyle = '#ffd23a'; g.strokeRect(px - 3, pz - 3, 6, 6); }
      else { g.strokeStyle = '#ffffff'; g.beginPath(); g.moveTo(px, pz); g.lineTo(px, pz - 8); g.stroke(); }
      g.fillStyle = '#ff4a3a'; g.fillRect(px - 1.5, pz - 1.5, 3, 3);
    });
  }
}

function blzDrawPat(g, W, H) {
  g.fillStyle = 'rgba(2,4,14,0.55)'; g.fillRect(0, 0, W, H);
  blzTextC(g, 'EXTRA POINT', W / 2, H * 0.3, 22, '#ffd23a');
  const bw = Math.min(170, W * 0.4), bh = 46, y = H * 0.4;
  blitz.hit.cards = [];
  [['1  KICK IT', '1 POINT'], ['2  GO FOR TWO', '2 POINTS']].forEach((t, i) => {
    const x = W / 2 + (i ? 6 : -6 - bw);
    const sel = blitz.callSel === i;
    g.fillStyle = sel ? '#5a3a08' : 'rgba(8,10,24,0.9)'; g.fillRect(x, y, bw, bh);
    g.strokeStyle = sel ? '#ffd23a' : '#7a5a20'; g.lineWidth = 2; g.strokeRect(x, y, bw, bh);
    blzTextC(g, t[0], x + bw / 2, y + 16, 15, '#ffffff');
    blzTextC(g, t[1], x + bw / 2, y + 33, 10, '#bfc6ff');
    blitz.hit.cards.push({ x, y, w: bw, h: bh, n: i });
  });
}

// ---- the VS screen ---------------------------------------------------------------------------
function blzDrawVS(g, W, H) {
  const A = blzTeam(0), B = blzTeam(1);
  const t = blitz.vsT;
  g.fillStyle = A.c1; g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.58, 0); g.lineTo(W * 0.42, H); g.lineTo(0, H); g.fill();
  g.fillStyle = B.c1; g.beginPath(); g.moveTo(W * 0.58, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(W * 0.42, H); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H);
  const slide = Math.min(1, t * 3);
  const sz = Math.min(36, W / 14);
  blzText(g, A.city, W * 0.25 - (1 - slide) * W * 0.4, H * 0.22, sz * 0.5, A.c2, 'center');
  blzText(g, A.name, W * 0.25 - (1 - slide) * W * 0.4, H * 0.22 + sz * 0.7, sz, '#ffffff', 'center');
  blzText(g, B.city, W * 0.75 + (1 - slide) * W * 0.4, H * 0.22, sz * 0.5, B.c2, 'center');
  blzText(g, B.name, W * 0.75 + (1 - slide) * W * 0.4, H * 0.22 + sz * 0.7, sz, '#ffffff', 'center');
  blzTextC(g, 'VS', W / 2, H * 0.3, sz * 1.4 * (t < 0.4 ? 1 + (0.4 - t) * 3 : 1), '#ffd23a');
  const hr = Math.min(H * 0.1, W * 0.07);
  blzHelmetIcon(g, A, W * 0.25 - (1 - slide) * W * 0.4, H * 0.22 + sz * 0.7 + hr * 1.6, hr, 1);
  blzHelmetIcon(g, B, W * 0.75 + (1 - slide) * W * 0.4, H * 0.22 + sz * 0.7 + hr * 1.6, hr, -1);
  blzTextC(g, blitz.cfg.name + ' · ×' + blitz.cfg.mult, W / 2, H * 0.45, 12, '#ffffff');
  // the three code boxes
  const labels = ['TURBO', 'JUMP', 'PASS'];
  const bw = 46, gap = 12, x0 = W / 2 - (bw * 3 + gap * 2) / 2, y = H * 0.56;
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (bw + gap);
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(x, y, bw, 40);
    g.strokeStyle = '#ffd23a'; g.lineWidth = 2; g.strokeRect(x, y, bw, 40);
    blzTextC(g, String(blitz.codeIn[i]), x + bw / 2, y + 22, 22, '#ffffff');
    blzTextC(g, labels[i], x + bw / 2, y + 50, 9, '#bfc6ff');
  }
  if (blitz.codeMsg) blzTextC(g, blitz.codeMsg.text + (blitz.codeMsg.ok ? '!' : ''), W / 2, y - 14, 16, blitz.codeMsg.ok ? '#39ff7a' : '#ff8a7a');
  const on = BLZ_CODES.filter((c) => blitz.codes[c.id]).map((c) => c.name);
  if (on.length) blzTextC(g, on.join(' · '), W / 2, y + 66, 9, '#39ff7a');
  blzTextC(g, 'TAP TURBO · JUMP · PASS' + (blitz.inputMode === 'pad' ? ' (RT · Y · A)' : blitz.inputMode === 'touch' ? '' : ' (SHIFT · I · SPACE)') + ', THEN PUSH A DIRECTION', W / 2, H * 0.86, 9, '#ffffff');
  if (((t * 2) | 0) % 2 === 0) blzTextC(g, 'PRESS ENTER (OR TAP HERE) TO KICK OFF', W / 2, H * 0.93, 13, '#ffd23a');
  blitz.hit.cards = [{ x: 0, y: H * 0.86, w: W, h: H * 0.14, n: 'go' }];
}

function blzDrawFinal(g, W, H) {
  const R = blitz.result || {}, t = blitz.finalT, st = blitz.stats;
  g.fillStyle = 'rgba(2,3,10,0.82)'; g.fillRect(0, 0, W, H);
  let y = H * 0.18;
  blzTextC(g, 'FINAL', W / 2, y, 24, '#bfe8ff'); y += 32;
  blzTextC(g, blzTeam(0).name + '  ' + blitz.score[0] + '  -  ' + blitz.score[1] + '  ' + blzTeam(1).name, W / 2, y, Math.min(22, W / 22), '#ffffff'); y += 30;
  const head = R.champ ? 'ALL-BLITZ CHAMPIONS!' : R.won ? blzTeam(0).name + ' WIN!' : R.tie ? 'A TIE. NOBODY SLEEPS.' : blzTeam(1).name + ' WIN';
  blzTextC(g, head, W / 2, y, 20, R.won ? (((t * 5) | 0) % 2 ? '#ffd23a' : '#ffffff') : '#ff8a7a'); y += 28;
  blzTextC(g, st.yds + ' YDS · ' + st.tds + ' TD · ' + st.sacks + ' SACKS · ' + st.ints + ' INT', W / 2, y, 11, '#bfc6ff'); y += 16;
  blzTextC(g, st.hits + ' MONSTER HITS · ' + st.late + ' LATE HITS · ' + st.fires + 'x ON FIRE · LONG ' + st.long, W / 2, y, 11, '#bfc6ff'); y += 20;
  blzTextC(g, '+' + fmt.format(blitz.earned) + ' NUGGETS', W / 2, y, 16, '#ffd23a'); y += 24;
  if (R.unlock) { blzTextC(g, 'ALL-BLITZ IS OPEN. THE FRYER IS WAITING.', W / 2, y, 11, '#26e0ff'); y += 18; }
  if (t > 1 && ((t * 2) | 0) % 2 === 0) blzTextC(g, 'PASS / SPACE REMATCH · R NEW OPPONENT', W / 2, y + 6, 11, '#8a92b0');
}

function blzDrawTouch(g, W, H) {
  const T = blitz.touch;
  if (!T.on) return;
  const s = BLZ_RES / window.innerHeight;
  g.globalAlpha = 0.45;
  if (T.L) {
    const x0 = T.L.x0 * s, y0 = T.L.y0 * s;
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x0, y0, 30, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x0 + T.L.dx * 22, y0 + T.L.dy * 22, 11, 0, 7); g.fill();
  }
  for (const b of blzTouchBtns()) {
    const on = T[b.k];
    g.fillStyle = on ? '#ffd23a' : b.c;
    g.beginPath(); g.arc(b.x * s, b.y * s, b.r * s, 0, 7); g.fill();
    g.globalAlpha = 0.9;
    blzTextC(g, b.label, b.x * s, b.y * s, 10, '#ffffff');
    g.globalAlpha = 0.45;
  }
  g.globalAlpha = 1;
}

// ---- input wiring ---------------------------------------------------------------------------
function blzTouchBtns() {
  const vw = window.innerWidth, vh = window.innerHeight;
  return [
    { k: 'A', label: 'PASS', x: vw - 62, y: vh - 70, r: 34, c: '#c8321f' },
    { k: 'B', label: 'JUMP', x: vw - 140, y: vh - 46, r: 28, c: '#1f6fc8' },
    { k: 'T', label: 'TURBO', x: vw - 70, y: vh - 156, r: 30, c: '#c8a01f' },
  ];
}
function blzMenuOpen() { return !!document.querySelector('.ak-tier') || !!document.querySelector('.modal-overlay.active'); }

function blzCallKey(code) {
  const ph = blitz.phase;
  if (ph === 'pat') {
    if (code === 'Digit1' || code === 'Numpad1') { blzPatChoose(1); return true; }
    if (code === 'Digit2' || code === 'Numpad2') { blzPatChoose(2); return true; }
    if (/Arrow(Left|Right)|Key[AD]/.test(code)) { blitz.callSel ^= 1; blzSfx('select'); return true; }
    return false;
  }
  if (ph !== 'call') return false;
  const m = /^(Digit|Numpad)([1-9])$/.exec(code);
  if (m) { blitz.callSel = +m[2] - 1; blzChoose(+m[2] - 1); return true; }
  if (blitz.callFor === 'off') {
    if (code === 'KeyF') { blitz.flip = !blitz.flip; blzSfx('select'); return true; }
    if (code === 'KeyP') { blzChoose('punt'); return true; }
    if (code === 'KeyG') { blzChoose('fg'); return true; }
    if (code === 'KeyU') { blzChoose('fakepunt'); return true; }
    if (code === 'KeyH') { blzChoose('fakefg'); return true; }
  }
  const s = blitz.callSel;
  if (code === 'ArrowLeft' || code === 'KeyA') { blitz.callSel = (s + 8) % 9; blzSfx('select'); return true; }
  if (code === 'ArrowRight' || code === 'KeyD') { blitz.callSel = (s + 1) % 9; blzSfx('select'); return true; }
  if (code === 'ArrowUp' || code === 'KeyW') { blitz.callSel = (s + 6) % 9; blzSfx('select'); return true; }
  if (code === 'ArrowDown' || code === 'KeyS') { blitz.callSel = (s + 3) % 9; blzSfx('select'); return true; }
  return false;
}

window.addEventListener('keydown', (e) => {
  if (!blitzActive()) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (blitz.phase === 'tier' || blzMenuOpen()) return;
  blzAudio();
  const claimed = /^(Key[WASDIJKLMNQRFPGVUH]|Arrow(Up|Down|Left|Right)|Space|Enter|ShiftLeft|ShiftRight|Escape|Digit[1-9]|Numpad[1-9])$/.test(e.code);
  if (claimed) e.preventDefault();
  if (e.code === 'Escape') { if (!e.repeat && blitz.phase !== 'final' && blitz.phase !== 'vs' && blitz.phase !== 'teams') blitz.paused = !blitz.paused; return; }
  if (e.code === 'KeyM' && !e.repeat) {
    const S = blitz.sfx; S.muted = !S.muted;
    if (S.master) S.master.gain.value = S.muted ? 0 : 0.34;
    if (S.muted) blzBoothHush();
    blzFeed(S.muted ? 'SOUND OFF' : 'SOUND ON', '#6a7290');
    return;
  }
  if (e.code === 'KeyV' && !e.repeat) {
    blitz.voice = !blitz.voice;
    if (!blitz.voice) blzBoothHush();
    blzFeed(blitz.voice ? 'ANNOUNCER ON' : 'ANNOUNCER OFF', '#6a7290');
    return;
  }
  if (blitz.paused) {
    if (e.code === 'KeyQ') { blitz.paused = false; if (typeof stopStorm === 'function') stopStorm(); }
    return;
  }
  if (blitz.phase === 'final' && e.code === 'KeyR' && !e.repeat) { blzOpenTier(); return; }
  if (blitz.phase === 'teams') {
    if (e.repeat) return;
    const mv = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1, ArrowUp: -4, KeyW: -4, ArrowDown: 4, KeyS: 4 }[e.code];
    if (mv) { blzTeamMove(mv); return; }
    const m = /^(Digit|Numpad)([1-8])$/.exec(e.code);
    if (m) { blzTeamPick(+m[2] - 1); return; }
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyK') blzTeamPick();
    return;
  }
  if (blitz.phase === 'vs') {
    if (e.repeat) return;
    if (e.code === 'Enter') { blzStartGame(); return; }
    const dk = { ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R' }[e.code];
    if (dk) { blzCodeDir(dk); return; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { blzCodeTap(0); return; }
    if (e.code === 'KeyI') { blzCodeTap(1); return; }
    if (e.code === 'Space') { blzCodeTap(2); return; }
    return;
  }
  blitz.keys[e.code] = true;
  if (e.repeat) return;
  blitz.inputMode = 'kb';
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && blitz.phase === 'pre') { blzHumanTaunt(); return; }
  if (e.code === 'KeyN') { const on = blzMusToggle(); blzFeed(on ? 'MUSIC ON' : 'MUSIC OFF', '#6a7290'); return; }
  if (blzCallKey(e.code)) return;
  if (blitz.phase === 'pre' && blitz.hot && blitz.hot.stage === 'dir') {
    const dk = { ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R' }[e.code];
    if (dk && blzHotDir(dk)) return;
  }
  const b = BLZ_KEYBTN[e.code];
  if (b) blzBtnDown(b, 'kb');
});
const BLZ_KEYBTN = { Space: 'SP', Enter: 'SP', KeyJ: 'X', KeyK: 'A', KeyL: 'B', KeyI: 'Y' };
window.addEventListener('keyup', (e) => {
  if (blitz.keys[e.code]) blitz.keys[e.code] = false;
  const b = BLZ_KEYBTN[e.code];
  if (b && blitzActive()) blzBtnUp(b);
});
window.addEventListener('blur', () => { blitz.keys = {}; });
window.addEventListener('resize', () => { if (blitz.on) blitzLayout(); });

function blzWorldXY(cx, cy) { const s = BLZ_RES / window.innerHeight; return { x: cx * s, y: cy * s }; }
function blzTapUI(x, y) {
  const ph = blitz.phase;
  for (const c of blitz.hit.cards) if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) {
    if (ph === 'vs' && c.n === 'go') { blzStartGame(); return true; }
    if (ph === 'teams') { blzTeamPick(c.n); return true; }
    if (ph === 'pat') { blzPatChoose(c.n === 1 ? 2 : 1); return true; }
    if (ph === 'call') { blitz.callSel = c.n; blzChoose(c.n); return true; }
  }
  if (ph === 'call') for (const c of blitz.hit.extra) if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) {
    if (c.n === 'flip') { blitz.flip = !blitz.flip; blzSfx('select'); } else blzChoose(c.n);
    return true;
  }
  return false;
}

function blzPointerDown(e) {
  if (!blitzActive() || blitz.phase === 'tier' || e.pointerType === 'touch') return;
  e.preventDefault();
  blzAudio();
  blitz.touch.on = false;
  if (blitz.paused) { blitz.paused = false; return; }
  const p = blzWorldXY(e.clientX, e.clientY);
  if (blzTapUI(p.x, p.y)) return;
  if (blitz.phase === 'vs' || blitz.phase === 'teams') return;
  const ic = blzIconAt(p.x, p.y);
  if (ic) { blitz.mouseBtn = ic; blzBtnDown(ic, 'mouse'); return; }
  if (blitz.phase === 'replay') { blzEndReplay(); return; }
  if (e.button === 2) blzBtnDown('Y', 'kb'); else blzBtnDown('SP', 'kb');
}
function blzIconAt(x, y) {
  for (const h of blitz.hit.rcv || []) if (Math.hypot(x - h.x, y - h.y) <= h.r) return h.btn;
  return null;
}
window.addEventListener('pointerup', () => { if (blitz.mouseBtn) { const b = blitz.mouseBtn; blitz.mouseBtn = null; blzBtnUp(b); } });

blitzWorld.addEventListener('contextmenu', (e) => { if (blitzActive()) e.preventDefault(); });
blitzWorld.addEventListener('touchstart', (e) => {
  if (!blitzActive() || blitz.phase === 'tier') return;
  if (e.target.closest('.storm-hud, .ak-tier, .modal-overlay')) return;
  blzAudio();
  const T = blitz.touch; T.on = true;
  blitz.inputMode = 'touch';
  for (const t of e.changedTouches) {
    const x = t.clientX, y = t.clientY;
    if (blitz.paused) { blitz.paused = false; continue; }
    if (blitz.phase === 'replay') { blzEndReplay(); continue; }
    const wp = blzWorldXY(x, y);
    if ((blitz.phase === 'call' || blitz.phase === 'pat' || blitz.phase === 'teams') && blzTapUI(wp.x, wp.y)) continue;
    if (blitz.phase === 'teams') continue;
    // a receiver's icon is his button: tap = lob, hold = bullet
    const ic = blitz.phase === 'live' || blitz.phase === 'pre' ? blzIconAt(wp.x, wp.y) : null;
    if (ic) { T.roles[t.identifier] = 'R' + ic; blzBtnDown(ic, 'touch'); continue; }
    let hit = null;
    for (const b of blzTouchBtns()) if (Math.hypot(x - b.x, y - b.y) <= b.r + 10) { hit = b; break; }
    if (hit) {
      T.roles[t.identifier] = hit.k; T[hit.k] = true;
      if (blitz.phase === 'vs') blzCodeTap(hit.k === 'T' ? 0 : hit.k === 'B' ? 1 : 2);
      else if (hit.k === 'T' && blitz.phase === 'pre') blzHumanTaunt();
      else if (hit.k === 'A') blzBtnDown('SP', 'touch'); else if (hit.k === 'B') blzBtnDown('Y', 'touch');
      continue;
    }
    if (blitz.phase === 'vs' && blzTapUI(wp.x, wp.y)) continue;
    if (blitz.phase === 'final') { blzPressPass(); continue; }
    if (x < window.innerWidth * 0.55 && !T.L) { T.L = { id: t.identifier, x0: x, y0: y, dx: 0, dy: 0 }; T.roles[t.identifier] = 'L'; }
  }
  e.preventDefault();
}, { passive: false });
blitzWorld.addEventListener('touchmove', (e) => {
  if (!blitzActive()) return;
  const T = blitz.touch;
  for (const t of e.changedTouches) {
    if (T.roles[t.identifier] !== 'L' || !T.L) continue;
    T.L.dx = blzClamp((t.clientX - T.L.x0) / 40, -1, 1); T.L.dy = blzClamp((t.clientY - T.L.y0) / 40, -1, 1);
  }
  e.preventDefault();
}, { passive: false });
const blzTouchEnd = (e) => {
  const T = blitz.touch;
  for (const t of e.changedTouches) {
    const role = T.roles[t.identifier]; delete T.roles[t.identifier];
    if (role === 'L') {
      // on the VS screen the stick is the code direction
      if (blitz.phase === 'vs' && T.L) {
        const dx = T.L.dx, dy = T.L.dy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 0.5) blzCodeDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'));
      }
      T.L = null;
    } else if (role && role[0] === 'R' && role.length === 2) blzBtnUp(role[1]);
    else if (role) T[role] = false;
  }
};
window.addEventListener('touchend', blzTouchEnd); window.addEventListener('touchcancel', blzTouchEnd);

function blzPollPad() {
  const P = blitz.pad;
  if (!navigator.getGamepads) return;
  let gp = null;
  try { for (const g of navigator.getGamepads()) if (g && g.connected) { gp = g; break; } } catch (e) { return; }
  if (!gp) { P.on = false; return; }
  const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
  const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
  P.lx = dz(gp.axes[0] || 0) + (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0);
  P.ly = dz(gp.axes[1] || 0) + (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
  const a = btn(0), b = btn(1), x = btn(2), y = btn(3), lb = btn(4), tu = btn(5) || btn(6) || btn(7), st = btn(9);
  if (P.lx || P.ly || a || b || x || y || lb || tu) { P.on = true; blitz.inputMode = 'pad'; }
  P.turbo = tu;
  const nav = Math.abs(P.lx) > 0.6 ? (P.lx > 0 ? 'R' : 'L') : Math.abs(P.ly) > 0.6 ? (P.ly > 0 ? 'D' : 'U') : '';
  if (nav && nav !== P._nav) {
    if (blitz.phase === 'vs') blzCodeDir(nav);
    else if (blitz.phase === 'teams') blzTeamMove({ R: 1, L: -1, U: -4, D: 4 }[nav]);
    else if (blitz.phase === 'call') blzCallKey({ R: 'ArrowRight', L: 'ArrowLeft', U: 'ArrowUp', D: 'ArrowDown' }[nav]);
    else if (blitz.phase === 'pat' && (nav === 'L' || nav === 'R')) blitz.callSel ^= 1;
    else if (blitz.phase === 'pre' && blitz.hot && blitz.hot.stage === 'dir') blzHotDir(nav);
  }
  P._nav = nav;
  const edge = (now, was, k) => { if (now && !was) blzBtnDown(k, 'pad'); else if (!now && was) blzBtnUp(k); };
  edge(a, P._a, 'A'); edge(b, P._b, 'B'); edge(x, P._x, 'X'); edge(y, P._y, 'Y'); edge(lb, P._lb, 'SP');
  if (tu && !P._t && blitz.phase === 'vs') blzCodeTap(0);
  if (tu && !P._t && blitz.phase === 'pre') blzHumanTaunt();
  if (st && !P._st) { if (blitz.phase === 'teams') blzTeamPick(); else if (blitz.phase === 'vs') blzStartGame(); else if (blitz.phase !== 'final') blitz.paused = !blitz.paused; }
  P._a = a; P._b = b; P._x = x; P._y = y; P._lb = lb; P._t = tu; P._st = st;
}

// ---- test seam ---------------------------------------------------------------------------------
// The harness drives the REAL handlers: pickTier deals a game, start() leaves
// the VS screen, auto(true) lets the AI play our side too, and step(secs)
// runs the sim at a fixed 60Hz without drawing — whole games, headless.
window.blitzDebug = {
  state: () => ({
    phase: blitz.phase, score: blitz.score.slice(), q: blitz.q, clock: Math.round(blitz.clock), ot: blitz.ot,
    poss: blitz.poss, los: Math.round(blitz.los * 10) / 10, down: blitz.down, firstAt: Math.round(blitz.firstAt * 10) / 10,
    kind: blitz.kind, play: blitz.play && blitz.play.key, earned: blitz.earned, tier: blitz.cfg && blitz.cfg.key,
    ctl: blitz.ctl && blitz.ctl.pos, fire: blitz.fire.map((f) => f.on), codes: Object.keys(blitz.codes),
    carrier: blitz.carrier && { pos: blitz.carrier.pos, team: blitz.carrier.team, x: +blitz.carrier.x.toFixed(1), z: +blitz.carrier.z.toFixed(1) },
    ball: blitz.ball && blitz.ball.st, stats: blitz.stats && Object.assign({}, blitz.stats), result: blitz.result,
  }),
  pickTier: (i) => {
    if (blitz.tierPick) { blitz.tierPick.close(); blitz.tierPick = null; }
    blzNewGame(BLZ_TIERS[i] || BLZ_TIERS[0]);
    blzTeamPick(BLZ_TEAM_ORDER.indexOf('nugs'));
  },
  pickTeam: (k) => { blitz.phase = 'teams'; blzTeamPick(BLZ_TEAM_ORDER.indexOf(k)); },
  start: () => blzStartGame(),
  code: (taps, dir) => { blitz.codeIn = taps.slice(); blzCodeDir(dir); },
  auto: (v) => { blitz.auto = v !== false; },
  choose: (n) => blzChoose(n),
  pressPass: () => blzPressPass(), pressJump: () => blzPressJump(),
  btnDown: (b) => blzBtnDown(b), btnUp: (b) => blzBtnUp(b),
  move: (kind, a, v) => blzStartMove(kind, a, v, kind === 'suplex' || kind === 'trip' ? [v.fx, v.fz] : null), rcv: () => Object.fromEntries(Object.entries(blitz.rcv || {}).map(([k, p]) => [k, p.pos])),
  step: (secs, hz) => {
    const dt = 1 / (hz || 60), n = Math.round(secs / dt);
    for (let i = 0; i < n; i++) {
      if (blitz.phase === 'tier' || blitz.phase === 'final') break;
      // in auto mode the call screen picks for both sides
      if (blitz.phase === 'call' && blitz.auto) {
        if (blitz.callFor === 'off') { const c = blzCpuOffCall(blitz.poss); blzChoose(c === 'punt' || c === 'fg' ? c : c); }
        else blzChoose(blzCpuDefCall());
        continue;
      }
      if (blitz.phase === 'pat' && blitz.auto) { blzPatChoose(1); continue; }
      blitzUpdate(dt);
    }
    return window.blitzDebug.state();
  },
  setKeys: (o) => { blitz.keys = Object.assign({}, o || {}); },
  players: () => blitz.players.map((p) => ({ team: p.team, pos: p.pos, x: +p.x.toFixed(1), z: +p.z.toFixed(1), down: p.downT > 0, eng: !!p.eng, role: p.role })),
  set: (o) => Object.assign(blitz, o),
  freeze: (v) => { blitz.freeze = v !== false; },
  draw: () => blzDraw(),
};
