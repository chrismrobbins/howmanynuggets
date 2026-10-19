// ---- 🚨 NUGGET ALERT ------------------------------------------------------------------------------------
// "The popular early 2000s RTS game, Red Alert 2 … We want to add the game to the mcnugget arcade."
// "but try to get graphics quality to at least RA2 standards" — Chris, 2026-10-19.
//
// Game 21 (mode key: alert). Hidden: only howmanynuggets.com/?play=alert gets you here — no cabinet,
// no mode button, not in the games list. It is NOT Red Alert 2: EA never released RA2's code and it
// isn't freeware, so everything here is ours — the art, the names, the rules — the way Nugget Blitz is
// ours and not NFL Blitz. (Nobody says "Red Alert" or "Command & Conquer" on screen.)
//
// What's in it (stage 1, a skirmish vs the CPU, mouse + keyboard):
//   • a 64×64 battlefield: grass, worn dirt, trees, rocks, and fields of gold SAUCE ORE that regrow
//   • the economy: a FRY YARD builds the base; GREASE PLANTS make power, the SAUCE REFINERY comes
//     with a SAUCE HAULER that harvests ore and drives it home; low power slows everything and
//     switches the radar and the Tesla Fryers off
//   • the RA2 sidebar: credits, the radar, the power bar, four tabs of cameos with the clock wipe,
//     buildings that wait READY until you place them (adjacent to your base), queued units
//   • BOOT CAMP (Nug Troopers, Rocket Nugs) · TANK FRYER (Breaded Tank, Deep Fryer, the Hauler) ·
//     SAUCE RADAR (the minimap) · NUG GUN and TESLA FRYER defenses · sell, repair
//   • A* pathfinding, group moves in formation, attack, attack-move, guard (auto-acquire), stop,
//     control groups, double-click select-all-of-type
//   • a CPU commander: a build order, its own harvesting, an army that gathers and attacks in waves
//     that grow, and defends its base
//   • nuggets: kills, buildings and the win pay perFlyer × the tier's multiplier, like the others
// The renderer is js/alertGL.js, the models js/alertArt.js, the screen js/alertUI.js.
// Globals are all alr* / ALR_* / alert*. Test seam: window.alertDebug.

const alertWorld = document.getElementById('alertWorld');
// the map's size in tiles — per game now (ALR_MAPS), so it's a let; everything reads it live
let ALR_N = 64;
const ALR_DT = 1 / 30;           // the sim's fixed step

// ---- the rules ------------------------------------------------------------------------------------------
// Two armies, the way RA2 split them (researched from its rules.ini + the C&C wiki, 2026-10-19): the NUGGET
// ALLIANCE (side 'A', the Allied role: jets off landing pads, prism beams, the chrono hauler, a tank that hides
// as a tree) and the FRY FEDERATION (side 'F', the Soviet role: Tesla everything, flak, V3 artillery, the
// super-heavy, the airship). `side` missing = both build it. `role` lets a prerequisite name a job ('power',
// 'radar', 'lab') that each side fills with its own building. Costs and power follow RA2; build times run
// ~2.5× faster (an arcade pace). Weapons say what they can hit: `air` (can shoot aircraft), `ground: false`
// (anti-air only), and only heavy kinds (ALR_WALL_KINDS) dent a wall.
const ALR_BLD = {
  hq:       { name: 'FRY YARD', w: 3, h: 3, hp: 1600, cost: 0, power: 0, sight: 11, role: 'hq' },
  power:    { name: 'GREASE PLANT', side: 'A', role: 'power', w: 2, h: 2, hp: 750, cost: 800, power: 200, cat: 'bld', req: [], time: 11, sight: 4, blurb: '+200 power' },
  powerF:   { name: 'FRYER REACTOR', side: 'F', role: 'power', w: 3, h: 2, hp: 750, cost: 600, power: 150, cat: 'bld', req: [], time: 9, sight: 4, blurb: '+150 power' },
  refinery: { name: 'SAUCE REFINERY', w: 3, h: 3, hp: 1000, cost: 2000, power: -50, cat: 'bld', req: ['power'], time: 20, sight: 5, free: true, blurb: 'comes with a hauler' },
  barracks: { name: 'BOOT CAMP', w: 2, h: 2, hp: 650, cost: 500, power: -10, cat: 'bld', req: ['power'], time: 8, sight: 4, makes: 'inf' },
  factory:  { name: 'TANK FRYER', w: 3, h: 3, hp: 1300, cost: 2000, power: -25, cat: 'bld', req: ['refinery', 'barracks'], time: 20, sight: 4, makes: 'veh' },
  radar:    { name: 'SAUCE RADAR', side: 'F', role: 'radar', w: 2, h: 2, hp: 750, cost: 1000, power: -50, cat: 'bld', req: ['refinery'], time: 13, sight: 9, blurb: 'the minimap' },
  airhq:    { name: 'AIR NUG COMMAND', side: 'A', role: 'radar', w: 3, h: 3, hp: 900, cost: 1000, power: -50, cat: 'bld', req: ['refinery'], time: 13, sight: 9, pads: 4, blurb: 'the minimap · 4 jet pads' },
  depot:    { name: 'DIP & FIX', w: 3, h: 3, hp: 900, cost: 800, power: -25, cat: 'bld', req: ['factory'], time: 11, sight: 4, blurb: 'repairs vehicles parked by it' },
  labA:     { name: 'TEST KITCHEN', side: 'A', role: 'lab', w: 3, h: 3, hp: 1000, cost: 2000, power: -100, cat: 'bld', req: ['factory', 'radar'], time: 20, sight: 5, blurb: 'tier 3: prism + mirage' },
  labF:     { name: 'FRY LAB', side: 'F', role: 'lab', w: 3, h: 3, hp: 1000, cost: 2000, power: -100, cat: 'bld', req: ['factory', 'radar'], time: 20, sight: 5, blurb: 'tier 3: Family Size + blimp' },
  bunker:   { name: 'NUG BUNKER', side: 'A', w: 1, h: 1, hp: 500, cost: 500, power: 0, cat: 'def', req: ['barracks'], time: 7, sight: 7, weapon: 'bunker', blurb: 'anti-infantry' },
  sam:      { name: 'SAUCE SAM', side: 'A', w: 1, h: 1, hp: 500, cost: 1000, power: -50, cat: 'def', req: ['barracks'], time: 10, sight: 10, weapon: 'sam', blurb: 'anti-aircraft only' },
  prism:    { name: 'PRISM FRY TOWER', side: 'A', w: 1, h: 1, hp: 600, cost: 1500, power: -75, cat: 'def', req: ['power', 'radar'], time: 12, sight: 9, weapon: 'prismT', blurb: 'towers link their beams · needs power' },
  wallA:    { name: 'NUG WALL', side: 'A', w: 1, h: 1, hp: 300, cost: 100, power: 0, cat: 'def', req: ['barracks'], time: 1.5, sight: 1, wall: true, blurb: 'drag to lay a line' },
  turret:   { name: 'NUG GUN', side: 'F', w: 1, h: 1, hp: 550, cost: 500, power: 0, cat: 'def', req: ['barracks'], time: 7, sight: 7, weapon: 'turret', blurb: 'guns down anything on the ground' },
  flak:     { name: 'FLAK FRYER', side: 'F', w: 1, h: 1, hp: 500, cost: 1000, power: -50, cat: 'def', req: ['barracks'], time: 10, sight: 10, weapon: 'flakD', blurb: 'anti-aircraft only' },
  tesla:    { name: 'TESLA FRYER', side: 'F', w: 1, h: 1, hp: 650, cost: 1500, power: -75, cat: 'def', req: ['power', 'radar'], time: 12, sight: 8, weapon: 'tesla', blurb: 'needs power' },
  // RA2's Spy Satellite Uplink (the Allied one, after the Battle Lab): both armies get it here, after their lab
  spysat:   { name: 'NUG-SAT UPLINK', w: 3, h: 3, hp: 1000, cost: 1500, power: -100, cat: 'def', req: ['lab'], time: 18, sight: 6, blurb: 'reveals the whole map · needs power' },
  grandfryer: { name: 'GRAND FRYER', side: 'A', faction: 'coast', w: 2, h: 2, hp: 1400, cost: 2000, power: -150, cat: 'def', req: ['factory', 'radar'], time: 20, sight: 12, weapon: 'grand', blurb: 'a giant cannon, 14 tiles · needs power' },
  wallF:    { name: 'FRY WALL', side: 'F', w: 1, h: 1, hp: 300, cost: 100, power: 0, cat: 'def', req: ['barracks'], time: 1.5, sight: 1, wall: true, blurb: 'drag to lay a line' },
  // neutral: an engineer takes it (cash on capture, then a trickle)
  derrick:  { name: 'FRY OIL DERRICK', w: 2, h: 2, hp: 800, cost: 1000, power: 0, sight: 3, tech: true, income: 5 },
  // the water maps' bridges (RA2): neutral, crossed by everyone, brought down only by heavy hits (force-fire:
  // ctrl-click), rebuilt by an engineer walking into the repair hut at either end (the huts can't be hurt)
  bridge:   { name: 'BRIDGE', w: 1, h: 1, hp: 2400, cost: 0, power: 0, sight: 0, bridge: true, noCapture: true },
  bhut:     { name: 'BRIDGE REPAIR HUT', w: 1, h: 1, hp: 9999, cost: 0, power: 0, sight: 2, bhut: true },
};
// infantry are cat 'inf', everything from the factory (tanks, jets, the blimp) is cat 'veh', like RA2's tabs
const ALR_UNIT = {
  inf:      { name: 'NUG TROOPER', side: 'A', cost: 200, hp: 125, speed: 1.3, cat: 'inf', time: 4, weapon: 'rifle', armor: 'inf', sight: 5, req: ['barracks'], r: 0.13, deploy: 'rifleD', blurb: 'D: deploy behind sandbags' },
  conscript:{ name: 'TATER CONSCRIPT', side: 'F', cost: 100, hp: 125, speed: 1.3, cat: 'inf', time: 3, weapon: 'rifleC', armor: 'inf', sight: 5, req: ['barracks'], r: 0.13 },
  engineer: { name: 'FRY COOK', cost: 500, hp: 75, speed: 1.2, cat: 'inf', time: 6, armor: 'inf', sight: 4, req: ['barracks'], r: 0.13, engineer: true, blurb: 'captures buildings · fixes yours' },
  dog:      { name: 'CORN DOG', cost: 200, hp: 100, speed: 3.0, cat: 'inf', time: 4, weapon: 'bite', armor: 'inf', sight: 6, req: ['barracks'], r: 0.12, blurb: 'one bite per soldier' },
  jetpack:  { name: 'JETPACK NUG', side: 'A', cost: 600, hp: 110, speed: 2.4, cat: 'inf', time: 7, weapon: 'jetgun', armor: 'air', sight: 6, req: ['barracks', 'radar'], r: 0.15, air: 'hover', alt: 1.0, blurb: 'flies · hits ground and air' },
  zapper:   { name: 'ZAP NUG', side: 'F', cost: 500, hp: 130, speed: 1.1, cat: 'inf', time: 6, weapon: 'zapI', armor: 'inf', sight: 5, req: ['barracks'], r: 0.14, noCrush: true, blurb: 'shocks vehicles · can\'t be squished' },
  rocket:   { name: 'ROCKET NUG', side: 'F', cost: 300, hp: 125, speed: 1.15, cat: 'inf', time: 5, weapon: 'flakI', armor: 'inf', sight: 6, req: ['barracks', 'radar'], r: 0.13, blurb: 'hits ground and air' },
  tank:     { name: 'BREADED TANK', side: 'A', cost: 700, hp: 380, speed: 2.3, cat: 'veh', time: 9, weapon: 'cannon', armor: 'veh', sight: 6, req: ['factory'], turret: true, turn: 3.2, r: 0.36, crush: true },
  ifv:      { name: 'SAUCE IFV', side: 'A', cost: 600, hp: 220, speed: 3.0, cat: 'veh', time: 8, weapon: 'ifv', armor: 'veh', sight: 7, req: ['factory'], turret: true, turn: 4, r: 0.34, crush: true, blurb: 'missiles: ground and air' },
  harv:     { name: 'CHRONO HAULER', side: 'A', cost: 1400, hp: 1000, speed: 1.6, cat: 'veh', time: 14, armor: 'veh', sight: 4, req: ['factory', 'refinery'], harv: true, cap: 700, turn: 2.0, r: 0.4, chrono: true, blurb: 'teleports home when full' },
  prismtank:{ name: 'PRISM FRY', side: 'A', cost: 1200, hp: 200, speed: 2.0, cat: 'veh', time: 13, weapon: 'prismK', armor: 'veh', sight: 8, req: ['factory', 'lab'], turret: true, turn: 3, r: 0.36, crush: true, blurb: 'a beam that jumps between targets' },
  mirage:   { name: 'MIRAGE NUG', side: 'A', cost: 1000, hp: 260, speed: 2.1, cat: 'veh', time: 11, weapon: 'mirage', armor: 'veh', sight: 7, req: ['factory', 'lab'], turret: true, turn: 3, r: 0.36, crush: true, disguise: true, blurb: 'stops, and it\'s a tree' },
  jet:      { name: 'NUG JET', side: 'A', cost: 1200, hp: 150, speed: 7.5, cat: 'veh', time: 12, weapon: 'maverick', armor: 'air', sight: 6, req: ['airhq'], r: 0.4, air: 'jet', alt: 2.6, ammo: 1, blurb: 'one strike, then home to rearm' },
  heavy:    { name: 'DEEP FRYER', side: 'F', cost: 900, hp: 450, speed: 1.9, cat: 'veh', time: 10, weapon: 'heavy', armor: 'veh', sight: 6, req: ['factory'], turret: true, turn: 2.4, r: 0.42, crush: true },
  flaktrack:{ name: 'FLAK TRACK', side: 'F', cost: 500, hp: 180, speed: 2.8, cat: 'veh', time: 7, weapon: 'flakT', armor: 'veh', sight: 7, req: ['factory'], turret: true, turn: 3.5, r: 0.34, crush: true, blurb: 'flak: ground and air' },
  harvF:    { name: 'WAR HAULER', side: 'F', cost: 1400, hp: 1200, speed: 1.4, cat: 'veh', time: 14, weapon: 'mg', armor: 'veh', sight: 5, req: ['factory', 'refinery'], harv: true, cap: 1000, turn: 1.8, r: 0.42, turret: true, blurb: 'bigger load · has a gun' },
  v3:       { name: 'SAUCE V3', side: 'F', cost: 800, hp: 150, speed: 1.6, cat: 'veh', time: 10, weapon: 'v3', armor: 'veh', sight: 6, req: ['factory', 'radar'], turn: 2.5, r: 0.38, blurb: 'long-range rocket artillery' },
  apoc:     { name: 'FAMILY SIZE', side: 'F', cost: 1750, hp: 900, speed: 1.15, cat: 'veh', time: 18, weapon: 'apoc', weapon2: 'apocAA', armor: 'veh', sight: 7, req: ['factory', 'lab'], turret: true, turn: 1.6, r: 0.52, crush: true, heal: 4, blurb: 'twin guns + AA missiles · heals' },
  blimp:    { name: 'GRAVY BLIMP', side: 'F', cost: 2000, hp: 1800, speed: 0.8, cat: 'veh', time: 20, weapon: 'gravy', armor: 'air', sight: 6, req: ['factory', 'lab'], r: 0.9, air: 'blimp', alt: 2.4, turn: 0.7, heal: 3, blurb: 'slow · pours scalding gravy on what\'s under it' },
  // helicopters: two carriers an army (RA2's Night Hawk, and a heavy lifter for a tank). They fly over water,
  // bridges or no bridges; landed, they're on the ground (anything can shoot them); in the air only AA can.
  // the factions' own (D.faction: only that faction can build it)
  sniper:   { name: 'CRUMB SNIPER', side: 'A', faction: 'crown', cost: 600, hp: 100, speed: 1.15, cat: 'inf', time: 7, weapon: 'snipe', armor: 'inf', sight: 9, req: ['barracks', 'radar'], r: 0.13, blurb: 'picks off infantry from far away · useless vs armour' },
  greaser:  { name: 'GREASE GUNNER', side: 'F', faction: 'horde', cost: 600, hp: 150, speed: 1.05, cat: 'inf', time: 7, weapon: 'grease', armor: 'inf', sight: 5, req: ['barracks', 'radar'], r: 0.14, deploy: 'greaseD', noCrush: true, blurb: 'boiling grease · D: dig in, coat the ground around him' },
  bomber:   { name: 'FRY BOMBER', side: 'F', faction: 'cartel', cost: 400, hp: 90, speed: 2.1, cat: 'inf', time: 5, weapon: 'kaboom', armor: 'inf', sight: 5, req: ['barracks'], r: 0.13, blurb: 'runs in and blows up · wrecks tanks, buildings, bridges' },
  teslaspud:{ name: 'TESLA SPUD', side: 'F', faction: 'union', cost: 1200, hp: 420, speed: 1.9, cat: 'veh', time: 13, weapon: 'teslaK', armor: 'veh', sight: 6, req: ['factory', 'radar'], turret: true, turn: 2.6, r: 0.38, crush: true, blurb: 'a Tesla coil on tracks' },
  hawk:     { name: 'NUG HAWK', side: 'A', cost: 900, hp: 220, speed: 3.4, cat: 'veh', time: 10, armor: 'air', sight: 7, req: ['factory', 'radar'], r: 0.42, air: 'heli', alt: 1.7, turn: 2.8, carry: 'inf', cap: 5, blurb: 'carries 5 infantry or dogs · D: unload' },
  lift:     { name: 'SKY FRYER', side: 'A', cost: 1400, hp: 420, speed: 2.5, cat: 'veh', time: 14, armor: 'air', sight: 6, req: ['factory', 'radar'], r: 0.6, air: 'heli', alt: 2.2, turn: 1.8, carry: 'veh', cap: 1, sling: -0.8, blurb: 'lifts a tank on its sling · D: set it down' },
  tater:    { name: 'TATER COPTER', side: 'F', cost: 800, hp: 260, speed: 3.1, cat: 'veh', time: 10, armor: 'air', sight: 7, req: ['factory', 'radar'], r: 0.44, air: 'heli', alt: 1.7, turn: 2.6, carry: 'inf', cap: 6, blurb: 'carries 6 infantry or dogs · D: unload' },
  hog:      { name: 'HOG LIFTER', side: 'F', cost: 1400, hp: 480, speed: 2.3, cat: 'veh', time: 14, armor: 'air', sight: 6, req: ['factory', 'radar'], r: 0.65, air: 'heli', alt: 1.9, turn: 1.6, carry: 'veh', cap: 1, sling: 0.06, blurb: 'clamps a tank between its legs · D: set it down' },
};
const ALR_WALL_KINDS = { shell: 1, rocket: 1, v3: 1, bomb: 1, beam: 1, zap: 1, gravy: 1, kaboom: 1 };
const ALR_WPN = {
  rifle:   { dmg: 15, rof: 0.85, range: 4.6, kind: 'bullet', vs: { inf: 1, veh: 0.22, bld: 0.25 }, sfx: 'rifle' },
  rifleD:  { dmg: 30, rof: 0.8, range: 5.5, kind: 'bullet', vs: { inf: 1, veh: 0.25, bld: 0.3 }, sfx: 'rifle' },
  rifleC:  { dmg: 11, rof: 0.8, range: 4.3, kind: 'bullet', vs: { inf: 1, veh: 0.2, bld: 0.22 }, sfx: 'rifle' },
  bite:    { dmg: 999, rof: 0.9, range: 0.7, kind: 'melee', vs: { inf: 1, veh: 0, bld: 0 }, sfx: 'bark' },
  jetgun:  { dmg: 12, rof: 0.45, range: 4.3, kind: 'bullet', air: true, vs: { inf: 1, veh: 0.35, bld: 0.2, air: 0.8 }, sfx: 'rifle' },
  zapI:    { dmg: 55, rof: 1.25, range: 3.4, kind: 'zap', vs: { inf: 1, veh: 1, bld: 0.5 }, sfx: 'zap' },
  flakI:   { dmg: 22, rof: 0.95, range: 5.2, kind: 'flak', air: true, vs: { inf: 0.9, veh: 0.35, bld: 0.25, air: 1 }, sfx: 'flak' },
  cannon:  { dmg: 46, rof: 1.7, range: 5.2, kind: 'shell', speed: 15, vs: { inf: 0.4, veh: 1, bld: 0.8 }, sfx: 'cannon' },
  ifv:     { dmg: 30, rof: 1.2, range: 6.2, kind: 'rocket', speed: 12, air: true, vs: { inf: 0.5, veh: 0.85, bld: 0.4, air: 1 }, sfx: 'rocket' },
  prismK:  { dmg: 100, rof: 2.6, range: 7.5, kind: 'beam', bounce: 3, vs: { inf: 1, veh: 0.85, bld: 1 }, sfx: 'prism' },
  mirage:  { dmg: 70, rof: 1.8, range: 6.5, kind: 'shell', speed: 16, vs: { inf: 0.6, veh: 1, bld: 0.8 }, sfx: 'cannon' },
  maverick:{ dmg: 120, rof: 0.2, range: 4.5, kind: 'rocket', twin: true, speed: 16, vs: { inf: 0.5, veh: 1, bld: 1 }, sfx: 'rocket' },
  heavy:   { dmg: 42, rof: 1.9, range: 5.6, kind: 'shell', twin: true, speed: 15, vs: { inf: 0.45, veh: 1, bld: 0.85 }, sfx: 'heavy' },
  flakT:   { dmg: 20, rof: 0.7, range: 5.6, kind: 'flak', air: true, vs: { inf: 1, veh: 0.25, bld: 0.2, air: 1 }, sfx: 'flak' },
  mg:      { dmg: 10, rof: 0.4, range: 4.2, kind: 'bullet', vs: { inf: 1, veh: 0.2, bld: 0.1 }, sfx: 'rifle' },
  v3:      { dmg: 170, rof: 5.5, range: 14, min: 3, kind: 'v3', speed: 6, splash: 1.3, vs: { inf: 0.6, veh: 0.75, bld: 1 }, sfx: 'rocket' },
  apoc:    { dmg: 55, rof: 1.9, range: 6, kind: 'shell', twin: true, speed: 15, vs: { inf: 0.5, veh: 1, bld: 0.9 }, sfx: 'heavy' },
  apocAA:  { dmg: 40, rof: 1.6, range: 8, kind: 'rocket', twin: true, speed: 16, air: true, ground: false, vs: { air: 1 }, sfx: 'rocket' },
  bomb:    { dmg: 260, rof: 1.3, range: 0.9, kind: 'bomb', splash: 1.1, vs: { inf: 1, veh: 0.9, bld: 1 }, sfx: 'bomb' },
  // the Gravy Blimp tips its nose and pours (Chris: "dump loads of gravy out as its weapon"): the hit lands
  // like a bomb, then the pool it leaves keeps scalding infantry (gravyPool, per second) until it drains
  gravy:   { dmg: 240, rof: 2.2, range: 1.4, kind: 'gravy', splash: 1.25, vs: { inf: 1.3, veh: 0.8, bld: 0.85 }, sfx: 'pour', gravy: true },
  gravyPool: { dmg: 45, kind: 'gravy', vs: { inf: 1, veh: 0, bld: 0, air: 0 }, gravy: true },
  bunker:  { dmg: 30, rof: 0.5, range: 5.5, kind: 'bullet', vs: { inf: 1, veh: 0.3, bld: 0.2 }, sfx: 'rifle' },
  sam:     { dmg: 75, rof: 1.5, range: 10, kind: 'rocket', twin: true, speed: 17, air: true, ground: false, vs: { air: 1 }, sfx: 'rocket' },
  prismT:  { dmg: 120, rof: 2.8, range: 8, kind: 'beam', relay: true, vs: { inf: 1, veh: 1, bld: 0.7 }, sfx: 'prism', power: true },
  turret:  { dmg: 40, rof: 1.25, range: 6.2, kind: 'shell', twin: true, speed: 17, vs: { inf: 0.8, veh: 0.8, bld: 0.4 }, sfx: 'cannon' },
  flakD:   { dmg: 32, rof: 0.45, range: 9, kind: 'flak', air: true, ground: false, vs: { air: 1 }, sfx: 'flak', power: true },
  tesla:   { dmg: 120, rof: 2.6, range: 6.8, kind: 'zap', vs: { inf: 1.6, veh: 1, bld: 0.6 }, sfx: 'zap', power: true },
  // the factions' own
  snipe:   { dmg: 130, rof: 2.2, range: 9, kind: 'bullet', vs: { inf: 1, veh: 0.04, bld: 0.02 }, sfx: 'rifle' },
  grease:  { dmg: 32, rof: 1.0, range: 3.2, kind: 'grease', splash: 0.8, vs: { inf: 1, veh: 0.3, bld: 0.25 }, sfx: 'pour' },
  greaseD: { dmg: 26, rof: 0.9, range: 3.0, kind: 'grease', splash: 1.7, vs: { inf: 1, veh: 0.2, bld: 0.1 }, sfx: 'pour' },
  kaboom:  { dmg: 420, rof: 1, range: 0.75, kind: 'kaboom', splash: 1.7, vs: { inf: 1, veh: 1, bld: 1.4 }, sfx: 'boomL' },
  teslaK:  { dmg: 70, rof: 1.6, range: 5, kind: 'zap', vs: { inf: 1.3, veh: 1, bld: 0.6 }, sfx: 'zap' },
  grand:   { dmg: 200, rof: 4.2, range: 14, min: 2.5, kind: 'shell', speed: 9, lob: 2.6, splash: 1.0, vs: { inf: 0.7, veh: 1, bld: 1 }, sfx: 'heavy', power: true },
};
// ---- the factions: three to an army (RA2's countries). Each keeps its army's core kit, and adds one thing of its
// own plus a strength and a weakness. mods multiply by class — inf, veh (ground vehicles), air (jets, helicopters),
// bld (buildings), def (defenses): cost, hp, speed, time (build time); sight adds tiles.
const ALR_FACTIONS = {
  republic: { show: 'paraplane', side: 'A', name: 'NUGGET REPUBLIC', emoji: '🦅', special: 'SKY DROP', what: 'six troopers by parachute, anywhere you can see, every 4 minutes',
    plus: 'aircraft −20% cost', minus: 'tanks −10% health', mods: { cost: { air: 0.8 }, hp: { veh: 0.9 } }, power: { kind: 'para', every: 240, first: 150 } },
  crown:    { show: 'sniper', side: 'A', name: 'BREADCRUMB CROWN', emoji: '👑', special: 'CRUMB SNIPER', what: 'picks off infantry from 9 tiles out',
    plus: 'infantry +15% health, see 2 tiles further', minus: 'vehicles +15% cost', mods: { hp: { inf: 1.15 }, sight: { inf: 2 }, cost: { veh: 1.15 } } },
  coast:    { show: 'grandfryer', side: 'A', name: 'GOLDEN COAST', emoji: '🥖', special: 'GRAND FRYER', what: 'a giant cannon that shells anything 14 tiles out',
    plus: 'buildings +25% health, defenses −15% cost', minus: 'every unit −10% speed', mods: { hp: { bld: 1.25, def: 1.25 }, cost: { def: 0.85 }, speed: { inf: 0.9, veh: 0.9, air: 0.9 } } },
  union:    { show: 'teslaspud', side: 'F', name: 'TATER UNION', emoji: '🥔', special: 'TESLA SPUD', what: 'a Tesla coil on tracks',
    plus: 'vehicles +15% health', minus: 'infantry +20% cost', mods: { hp: { veh: 1.15 }, cost: { inf: 1.2 } } },
  horde:    { show: 'greaser', side: 'F', name: 'HASH BROWN HORDE', emoji: '🌶️', special: 'GREASE GUNNER', what: 'sprays boiling grease; dug in, coats the ground around him',
    plus: 'infantry −25% cost, train 25% faster', minus: 'buildings −20% health', mods: { cost: { inf: 0.75 }, time: { inf: 0.75 }, hp: { bld: 0.8, def: 0.8 } } },
  cartel:   { show: 'bomber', side: 'F', name: 'CURLY CARTEL', emoji: '🌀', special: 'FRY BOMBER', what: 'runs in and blows up: wrecks tanks, buildings, bridges',
    plus: 'every unit +15% speed', minus: 'every unit −12% health', mods: { speed: { inf: 1.15, veh: 1.15, air: 1.15 }, hp: { inf: 0.88, veh: 0.88, air: 0.88 } } },
};
const ALR_FACTION_OF = { A: ['republic', 'crown', 'coast'], F: ['union', 'horde', 'cartel'] };
// a definition's class for the mods
function alrModCat(D) { return D.cat === 'inf' ? 'inf' : D.cat === 'veh' ? (D.air && D.air !== 'hover' ? 'air' : 'veh') : D.cat === 'def' ? 'def' : 'bld'; }
function alrMod(owner, D, what) {
  const P = alr.players && alr.players[owner], F = P && P.faction && ALR_FACTIONS[P.faction];
  const m = F && F.mods[what];
  return m && m[alrModCat(D)] != null ? m[alrModCat(D)] : what === 'sight' ? 0 : 1;
}
function alrCost(P, D) { return Math.round((D.cost || 0) * alrMod(P.id, D, 'cost')); }
// the two armies: what you start with, and which hauler a refinery comes with
const ALR_SIDES = {
  A: { name: 'NUGGET ALLIANCE', harv: 'harv', start: [['inf', 3], ['tank', 1]], emoji: '🔷',
       blurb: 'jets, prism beams, a hauler that teleports home, a tank that hides as a tree.' },
  F: { name: 'FRY FEDERATION', harv: 'harvF', start: [['conscript', 4], ['heavy', 1]], emoji: '🔶',
       blurb: 'Tesla coils, flak, V3 rockets, the Family Size super-tank, the Gravy Blimp.' },
};
const ALR_CATS = [
  { key: 'bld', name: 'BUILD', icon: '🏗️' }, { key: 'def', name: 'DEFENSE', icon: '🛡️' },
  { key: 'inf', name: 'INFANTRY', icon: '🪖' }, { key: 'veh', name: 'VEHICLES', icon: '🚜' },
];
const ALR_TIERS = [
  { key: 'rookie', emoji: '🍟', name: 'ROOKIE', mult: 1, cpu: 0.7, firstWave: 330, wave: [4, 6], bonus: 0,
    blurb: 'the FRY FEDERATION is still finding the fryer.' },
  { key: 'pro', emoji: '🌶️', name: 'COMMANDER', mult: 2, cpu: 1.0, firstWave: 240, wave: [6, 9], bonus: 0,
    blurb: 'a real opponent. they will come for your refinery.' },
  { key: 'allout', emoji: '🔥', name: 'ALL-OUT WAR', mult: 3, cpu: 1.3, firstWave: 170, wave: [8, 13], bonus: 3,
    blurb: 'they build faster, they dig deeper, they never stop.', lockNote: 'win as a COMMANDER' },
];
// colors by seat (you're always blue; up to four CPUs); the last is the neutral oil derricks
const ALR_TEAMS = [
  { name: 'NUGGET ALLIANCE', tag: 'BLUE', col: [0.25, 0.52, 0.98], css: '#3f86f8' },
  { name: 'FRY FEDERATION', tag: 'RED', col: [0.92, 0.2, 0.15], css: '#ea3326' },
  { name: 'GREEN', tag: 'GREEN', col: [0.25, 0.78, 0.3], css: '#3cc24a' },
  { name: 'GOLD', tag: 'GOLD', col: [0.98, 0.74, 0.12], css: '#f8bc1e' },
  { name: 'PURPLE', tag: 'PURPLE', col: [0.66, 0.32, 0.95], css: '#a852f2' },
  { name: 'NEUTRAL', tag: 'NEUTRAL', col: [0.62, 0.6, 0.55], css: '#9a968a' },
];

// ---- the state ------------------------------------------------------------------------------------------
const alr = {
  on: false, phase: 'idle', cfg: ALR_TIERS[0], tierPick: null, paused: false, t: 0, acc: 0, auto: false,
  M: null, ents: [], byId: new Map(), nid: 1, players: [], sel: [], groups: {}, fx: [], shots: [], decor: [],
  cam: { x: 16, z: 48, zoom: 13.5, yaw: Math.PI * 0.25, pitch: 0.58, w: 800, h: 600, dpr: 1 },
  earned: 0, result: null, msgs: [], place: null, mode: '', ui: null, stats: null,
};
function alertActive() { return storm.mode === 'alert' && storm.running; }
function alertTally() {
  if (!alr.players.length || alr.phase !== 'play') return '🚨 NUGGET ALERT';
  const P = alr.players[0];
  return '$' + Math.floor(P.credits) + ' · ' + fmt.format(alr.earned) + ' nugs';
}
function alrRnd(a, b) { return a + Math.random() * (b - a); }
function alrPick(a) { return a[(Math.random() * a.length) | 0]; }
function alrClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function alrTile(x, z) { return (Math.floor(z) * ALR_N + Math.floor(x)); }
function alrIn(x, z) { return x >= 0 && z >= 0 && x < ALR_N && z < ALR_N; }

// ---- lifecycle --------------------------------------------------------------------------------------------
function syncAlert() {
  const active = alertActive();
  if (active === alr.on) return;
  alr.on = active;
  document.body.classList.toggle('alert-mode', active);
  if (active) {
    if (!alr.ui) alrUIInit();
    if (!alr.ui.gl) { alrUINoGL(); return; }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    alrLayout();
    alrDiscManifest();     // start downloading the recordings now, before the first click makes a sound
    alrOpenTier();
  } else {
    if (alr.tierPick) { alr.tierPick.close(); alr.tierPick = null; }
    if (alr.ui && alr.ui.setup) alr.ui.setup.hidden = true;
    alr.phase = 'idle'; alr.paused = false;
    alrMusicStop(); alrSfxStop();
    if (alr.ui) alr.ui.root.classList.remove('alr-playing');
  }
}
function alertProWon() { try { return localStorage.getItem('nugAlertPro') === '1'; } catch (e) { return false; } }
// (the old two card pickers — enemy, then army — are now one skirmish screen: alrOpenSetup in alertUI.js)
function alrOpenTier() { alrOpenSetup(); }

// ---- the maps ---------------------------------------------------------------------------------------------
// Hand-set layouts, each a fixed seed (so a map is the same map every time) with k-fold rotational symmetry
// about its centre: every start gets the same ground, the same two ore fields, the same track in, the same
// forests. ring: [starts, radius, angle of start 0]. A map plays any number of players up to its starts; fewer
// players take starts spread around the ring.
const ALR_MAPS = [
  { key: 'valley', name: 'FRYER VALLEY', N: 64, seed: 4217, ring: [2, 29, Math.PI * 0.75], trees: 0.66, emoji: '🌄',
    blurb: 'the classic: two bases, one road, ore at every elbow.' },
  { key: 'crossing', name: 'THREE-SAUCE CROSSING', N: 88, seed: 77101, ring: [3, 32, Math.PI * 0.5], trees: 0.64, centre: 1, emoji: '🔺',
    blurb: 'three bases round a rich ore lake. whoever holds the middle eats.' },
  { key: 'square', name: 'NUGGET SQUARE', N: 96, seed: 9091, ring: [4, 46, Math.PI * 0.75], trees: 0.62, centre: 1, emoji: '🟪',
    blurb: 'four corners, an open middle, oil on every side.' },
  { key: 'ridges', name: 'THE GREASE RIDGES', N: 104, seed: 31337, ring: [4, 40, Math.PI * 0.5], trees: 0.7, ridges: true, emoji: '⛰️',
    blurb: 'rock ridges split the map: two passes between every pair of bases.' },
  // water maps (RA2's rivers and islands): water blocks the ground; bridges cross it and can be dropped
  { key: 'river', name: 'THE FRYER RIVER', N: 80, seed: 5150, ring: [2, 30, Math.PI], trees: 0.64, water: 'river', emoji: '🌉',
    blurb: 'a river between you and them. three bridges. drop one, hold one, fix one.' },
  { key: 'isles', name: 'SAUCE ISLES', N: 104, seed: 2468, ring: [4, 36, 0], trees: 0.66, water: 'isles', centre: 1, emoji: '🏝️',
    blurb: 'an island each, ore and oil on the middle one, a long bridge to it. lose the bridge, lose the war.' },
  { key: 'plains', name: 'GRAND FRYER PLAINS', N: 128, seed: 6060, ring: [5, 50, Math.PI * 0.5], trees: 0.63, centre: 2, emoji: '⭐',
    blurb: 'five bases, a sea of grass, a huge contested centre. bring a lot of tanks.' },
];
function alrMapDef(key) { return ALR_MAPS.find((m) => m.key === key) || ALR_MAPS[0]; }
function alrMakeMap(def) {
  const N = def.N, seed = def.seed, [K, R, A0] = def.ring, c = N / 2, TAU = Math.PI * 2;
  let s = seed >>> 0 || 1; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const M = {
    N, seed, key: def.key, block: new Uint8Array(N * N), bld: new Int32Array(N * N), ore: new Float32Array(N * N), oreMax: new Float32Array(N * N), gem: new Uint8Array(N * N),
    dirt: new Float32Array(N * N), trees: [], rocks: [], tracks: [], starts: [], derricks: [], oreVer: 0,
    water: new Uint8Array(N * N), bridges: [], wet: !!def.water,
  };
  const at = (x, z) => z * N + x;
  const inside = (x, z) => x >= 1 && z >= 1 && x < N - 1 && z < N - 1;
  const disk = (cx, cz, rad, fn) => {
    for (let z = Math.floor(cz - rad); z <= Math.ceil(cz + rad); z++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      if (!inside(x, z)) continue;
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d <= rad) fn(x, z, d);
    }
  };
  // rotate a point about the centre by sector i
  const rot = (p, i) => { const a = i * TAU / K, ca = Math.cos(a), sa = Math.sin(a), dx = p[0] - c, dz = p[1] - c; return [c + dx * ca - dz * sa, c + dx * sa + dz * ca]; };
  const each = (p, fn) => { for (let i = 0; i < K; i++) fn(rot(p, i), i); };
  const S0 = [c + Math.cos(A0) * R, c + Math.sin(A0) * R];
  for (let i = 0; i < K; i++) M.starts.push(rot(S0, i));
  // sector 0's local frame: u toward the centre, v across
  const ux = (c - S0[0]) / R, uz = (c - S0[1]) / R, vx = -uz, vz = ux;
  const L = (a, b) => [S0[0] + ux * a + vx * b, S0[1] + uz * a + vz * b];
  const bend = (r() - 0.5) * R * 0.35;
  // the bases: bare earth
  each(S0, ([x, z]) => disk(x, z, 8.5, (i, j, d) => { M.dirt[at(i, j)] = Math.max(M.dirt[at(i, j)], alrClamp((8.5 - d) / 3, 0, 1)); }));
  // the ridges: rock walls on the sector boundaries, broken by two passes (an inner one with oil in it, an outer one with ore)
  const ridge = new Uint8Array(N * N);
  if (def.ridges) {
    const segs = [[0.14, 0.34], [0.47, 0.6], [0.74, 1.6]];      // passes at 0.34–0.47 R (the derrick) and 0.6–0.74 R (the ore)
    for (let i = 0; i < K; i++) {
      const a = A0 + (i + 0.5) * TAU / K;
      for (const [r0, r1] of segs) for (let t = r0 * R; t <= r1 * R; t += 0.45) {
        const x = c + Math.cos(a) * t, z = c + Math.sin(a) * t;
        disk(x, z, 1.1 + 0.5 * Math.sin(t * 0.7), (ii, jj) => { ridge[at(ii, jj)] = 1; });
      }
    }
  }
  // ---- the water --------------------------------------------------------------------------------------------
  // river: a meandering river through the centre on the line between the two bases' halves. sin() is odd, so
  // the river is its own 180° rotation — both bases get the same banks. isles: everything is sea except an
  // island round every base and one in the middle.
  const W = M.water, crossings = [];
  if (def.water === 'river') {
    const ab = A0 + Math.PI / 2, dx = Math.cos(ab), dz = Math.sin(ab), nx = -dz, nz = dx, amp = 4.5, f = 0.11;
    const P = (t) => [c + dx * t + nx * amp * Math.sin(t * f), c + dz * t + nz * amp * Math.sin(t * f)];
    const pts = []; for (let t = -N; t <= N; t += 0.5) pts.push(P(t));
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      let d = 1e9, tt = 0; for (let q = 0; q < pts.length; q++) { const e = Math.hypot(pts[q][0] - x - 0.5, pts[q][1] - z - 0.5); if (e < d) { d = e; tt = q * 0.5 - N; } }
      if (d < 2.3 + 0.6 * Math.cos(tt * 0.21)) W[at(x, z)] = 1;
    }
    for (const t of [0, -0.55 * c, 0.55 * c]) crossings.push(P(t));
  } else if (def.water === 'isles') {
    const nzI = alrNoise(seed + 3);
    const land = (x, z) => {
      let v = Math.max(0, 1 - Math.hypot(x - c, z - c) / 11.5);
      for (const [sx, sz] of M.starts) v = Math.max(v, 1 - Math.hypot(x - sx, z - sz) / 14.5);
      // the shoreline wobble is sampled in sector 0's frame, so every island has the same coast
      const th = Math.atan2(z - c, x - c), i = ((Math.round((th - A0) / (TAU / K)) % K) + K) % K, [qx, qz] = rot([x, z], -i);
      return v > 0 ? v + (nzI(qx * 0.2, qz * 0.2) - 0.5) * 0.18 : -1;     // (the wobble only bends coasts; open sea stays sea)
    };
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (land(x + 0.5, z + 0.5) <= 0.02) W[at(x, z)] = 1;
  }
  // the tracks: from every base into the middle, bent the same way (straight on the isles: the bridge is on it)
  const onTrack = new Uint8Array(N * N);
  const P0 = [S0, L(R * 0.5, def.water === 'isles' ? 0 : bend), [c, c]];
  for (let i = 0; i < K; i++) {
    const path = [];
    for (let q = 0; q < P0.length - 1; q++) { const a = rot(P0[q], i), b = rot(P0[q + 1], i); for (let k = 0; k <= 30; k++) { const t = k / 30; path.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
    M.tracks.push(path);
    for (const [px, pz] of path) disk(px, pz, 2.2, (ii, jj, d) => { onTrack[at(ii, jj)] = 1; ridge[at(ii, jj)] = 0; M.dirt[at(ii, jj)] = Math.max(M.dirt[at(ii, jj)], alrClamp((2.2 - d) / 1.4, 0, 1) * 0.85); });
  }
  // the river's flank bridges get roads too: from each base to both of them (rotated, so both bases reach both)
  if (def.water === 'river') for (const q of crossings.slice(1)) for (let i = 0; i < K; i++) {
    const a = rot(S0, i), b = [q[0] + (a[0] < c ? -3 : 3), q[1]], path = [];
    const m1 = [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.9];
    for (const [u0, u1] of [[a, m1], [m1, b], [b, q]]) for (let k = 0; k <= 24; k++) { const t = k / 24; path.push([u0[0] + (u1[0] - u0[0]) * t, u0[1] + (u1[1] - u0[1]) * t]); }
    M.tracks.push(path);
    for (const [px, pz] of path) disk(px, pz, 1.8, (ii, jj, d) => { if (W[at(ii, jj)]) return; onTrack[at(ii, jj)] = 1; M.dirt[at(ii, jj)] = Math.max(M.dirt[at(ii, jj)], alrClamp((1.8 - d) / 1.2, 0, 1) * 0.8); });
  }
  // the ore: two fields by every base, one between every pair of bases, and a big field in the middle on some maps
  const field = (fx, fz, rad, rich) => disk(fx, fz, rad + 1.2, (i, j, d) => {
    const k = at(i, j);
    M.dirt[k] = Math.max(M.dirt[k], 0.55 * alrClamp((rad + 1.2 - d) / 1.2, 0, 1));
    ridge[k] = 0;
    if (d <= rad && !M.water[k] && alrHash(i, j, seed) < 0.92) { const v = (140 + (1 - d / rad) * 200 + alrHash(j, i, seed) * 60) * (rich || 1); M.ore[k] = Math.max(M.ore[k], v); M.oreMax[k] = M.ore[k]; }
  });
  const nearA = L(9 + r() * 2, 7 + r() * 2), nearB = L(3 + r() * 2, -10 - r() * 2), r1 = 2.9 + r() * 0.8, r2 = 2.6 + r() * 0.8;
  each(nearA, ([x, z]) => field(x, z, r1)); each(nearB, ([x, z]) => field(x, z, r2));
  const mid = [c + Math.cos(A0 + Math.PI / K) * R * 0.63, c + Math.sin(A0 + Math.PI / K) * R * 0.63];
  each(mid, ([x, z]) => field(x, z, 3.4));
  if (def.centre) field(c, c, 3.5 + def.centre * 1.5, 1.3);
  // the oil derricks: one in the pass between every pair of bases, one off every base's road on the big maps
  const derrick = (x, z) => {
    if (M.water[at(alrClamp(Math.round(x), 0, N - 1), alrClamp(Math.round(z), 0, N - 1))]) {     // in the water: walk to the nearest land
      let bd = 1e9, bx = x, bz = z;
      disk(x, z, 9, (i, j, d) => { if (!M.water[at(i, j)] && d < bd && [[-1, -1], [2, 2], [-1, 2], [2, -1]].every(([a, b]) => inside(i + a, j + b) && !M.water[at(i + a, j + b)])) { bd = d; bx = i + 0.5; bz = j + 0.5; } });
      if (bd > 1e8) return;
      x = bx; z = bz;
    }
    const tx = Math.round(x - 1), tz = Math.round(z - 1);
    for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) { const k = at(alrClamp(tx + i, 1, N - 2), alrClamp(tz + j, 1, N - 2)); M.ore[k] = 0; M.oreMax[k] = 0; ridge[k] = 0; M.dirt[k] = Math.max(M.dirt[k], 0.6); }
    M.derricks.push([alrClamp(tx, 2, N - 4), alrClamp(tz, 2, N - 4)]);
  };
  if (def.water === 'isles') each([c + Math.cos(A0 + Math.PI / K) * 5.5, c + Math.sin(A0 + Math.PI / K) * 5.5], ([x, z]) => derrick(x, z));   // the oil is on the middle island
  else each([c + Math.cos(A0 + Math.PI / K) * R * 0.4, c + Math.sin(A0 + Math.PI / K) * R * 0.4], ([x, z]) => derrick(x, z));
  if ((K === 2 || N >= 96) && def.water !== 'isles') each(L(R * 0.62, -6.5), ([x, z]) => derrick(x, z));
  // the gems (RA2's): small fields worth TWICE as much a load, that never grow back — one between every pair of
  // neighbouring bases, closer in than the pass's ore, so a rich prize to race for and fight over, then gone.
  // (oreMax 0: alrOreGrow leaves them; M.gem marks the tile for the harvest pay, the models, the radar.)
  const gemField = (fx, fz, rad) => disk(fx, fz, rad + 1.0, (i, j, d) => {
    const k = at(i, j);
    if (M.water[k] || M.derricks.some(([dx, dz]) => i >= dx - 1 && i <= dx + 2 && j >= dz - 1 && j <= dz + 2)) return;   // (not on a derrick's pad)
    M.dirt[k] = Math.max(M.dirt[k], 0.5 * alrClamp((rad + 1.0 - d) / 1.0, 0, 1));
    ridge[k] = 0;
    if (d <= rad && alrHash(i, j, seed + 7) < 0.93) { M.ore[k] = Math.max(M.ore[k], 180 + (1 - d / rad) * 170 + alrHash(j, i, seed + 7) * 50); M.oreMax[k] = 0; M.gem[k] = 1; }
  });
  // (beside the pass's oil derrick, not under it — its pad clears the ground; on a water map, slide in toward
  // the middle until it's on land)
  { let g = null; const th = A0 + Math.PI / K, ux = Math.cos(th), uz = Math.sin(th), px = -uz, pz = ux;
    const at0 = def.water === 'isles' ? 5.5 : R * 0.4, dry = (q) => [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [1.4, 1.4], [-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4]].every(([a, b2]) => { const x = Math.round(q[0] + a), z = Math.round(q[1] + b2); return inside(x, z) && !M.water[at(x, z)]; });
    // the first spot where the whole field is on dry land: beside the derrick either way, then in, then out
    const ts = []; for (let t = at0; t > 1; t -= 1.2) ts.push(t); for (let t = at0 + 1.2; t < R * 0.75; t += 1.2) ts.push(t);
    for (const t of ts) { for (const sd of [4.5, -4.5]) { const q = [c + ux * t + px * sd, c + uz * t + pz * sd]; if (!g && dry(q)) g = q; } if (g) break; }
    if (g) each(g, ([x, z]) => gemField(x, z, 2.1)); }
  // the ridges go down as rock: two big boulder groups a tile, on stony ground, so a ridge reads as a wall
  for (let k = 0; k < N * N; k++) if (ridge[k] && !onTrack[k]) {
    M.block[k] = 1;
    M.dirt[k] = Math.max(M.dirt[k], 0.45);
    for (let q = 0; q < 2; q++) M.rocks.push({ x: k % N + 0.5 + (alrHash(k, 1 + q * 9, seed) - 0.5) * 0.7, z: ((k / N) | 0) + 0.5 + (alrHash(k, 2 + q * 9, seed) - 0.5) * 0.7, v: (alrHash(k, 3 + q * 9, seed) * 6) | 0, yaw: alrHash(k, 4 + q * 9, seed) * 6.28, s: 1.6 + alrHash(k, 5 + q * 9, seed) * 0.8 });
  }
  // ---- water goes down: blocked for the ground; the bridges open strips across it ------------------------------
  if (def.water) {
    for (let k = 0; k < N * N; k++) if (W[k]) { M.block[k] = 1; M.dirt[k] = 0; M.ore[k] = 0; M.oreMax[k] = 0; }
    // a bridge wherever a road meets water (the isles) or at the river's three crossings: straight along the
    // axis the road runs, two tiles wide, from the last land tile to the next
    const want = [];
    if (def.water === 'river') for (const q of crossings) want.push([q[0], q[1], 'x']);
    else for (const path of M.tracks) for (let q = 1; q < path.length; q++) {
      const [x0, z0] = path[q - 1], [x1, z1] = path[q];
      if (!W[at(Math.floor(x0), Math.floor(z0))] && W[at(Math.floor(x1), Math.floor(z1))]) want.push([x1, z1, Math.abs(x1 - x0) >= Math.abs(z1 - z0) ? 'x' : 'z']);
    }
    for (const [qx, qz, axis] of want) alrMapBridge(M, qx, qz, axis);
  }
  // trees and rocks: clumps by noise, sampled in sector 0 so every sector grows the same forest
  const nz = alrNoise(seed + 99);
  const canon = (x, z) => {
    const th = Math.atan2(z - c, x - c), i = ((Math.round((th - A0) / (TAU / K)) % K) + K) % K;
    return rot([x, z], -i);
  };
  const free = (i, j) => {
    const k = at(i, j);
    if (onTrack[k] || M.block[k] || M.ore[k] > 0 || M.dirt[k] > 0.15 || M.water[k]) return false;
    for (const B of M.bridges) for (const [hx, hz] of B.huts) if (Math.abs(i - hx) <= 1 && Math.abs(j - hz) <= 1) return false;
    for (const [x, z] of M.starts) if (Math.hypot(i + 0.5 - x, j + 0.5 - z) < 10) return false;
    for (const [x, z] of M.derricks) if (Math.hypot(i - x - 1, j - z - 1) < 3) return false;
    return true;
  };
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    if (!free(i, j)) continue;
    const [cx, cz] = canon(i + 0.5, j + 0.5), qx = Math.floor(cx), qz = Math.floor(cz);
    const v = nz(cx * 0.16, cz * 0.16), h = alrHash(qx, qz, seed + 5);
    let what = 0;
    if (v > def.trees && h < 0.75) what = 1; else if (h > 0.988) what = 2; else if (h < 0.01) what = 1;
    if (!what) continue;
    M.block[at(i, j)] = 1;
    const item = { x: i + 0.5 + (alrHash(qx, qz, 7) - 0.5) * 0.3, z: j + 0.5 + (alrHash(qz, qx, 7) - 0.5) * 0.3, v: (alrHash(qx, qz, 11) * 6) | 0, yaw: alrHash(qx, qz, 13) * 6.28, s: 0.85 + alrHash(qx, qz, 17) * 0.35 };
    (what === 1 ? M.trees : M.rocks).push(item);
  }
  // the map's edge
  for (let k = 0; k < N; k++) { M.block[at(k, 0)] = M.block[at(k, N - 1)] = M.block[at(0, k)] = M.block[at(N - 1, k)] = 1; }
  return M;
}
// a bridge across the water at (qx, qz) along 'x' or 'z': walk both ways to land, two tiles wide; a repair hut
// on the bank at each end, beside the road
function alrMapBridge(M, qx, qz, axis) {
  const N = M.N, at = (x, z) => z * N + x, W = M.water;
  const ax = axis === 'x', px = Math.floor(ax ? qz : qx) - 1;          // across: tiles px, px + 1
  const tile = (along, across) => (ax ? at(along, across) : at(across, along));
  let a = Math.floor(ax ? qx : qz);
  const wet = (t) => W[tile(t, px)] || W[tile(t, px + 1)];
  if (!wet(a)) { let k = 0; while (k < 4 && !wet(a + k) && !wet(a - k)) k++; a = wet(a + k) ? a + k : a - k; if (!wet(a)) return; }
  let lo = a, hi = a;
  while (lo > 1 && wet(lo - 1)) lo--;
  while (hi < N - 2 && wet(hi + 1)) hi++;
  if (lo <= 1 || hi >= N - 2 || hi - lo + 1 > 16) return;              // no far bank, or too long
  for (const B of M.bridges) if (B.axis === axis && Math.abs(B.across - px) < 3 && B.lo <= hi && lo <= B.hi) return;   // already one here
  const tiles = [];
  for (let t = lo; t <= hi; t++) for (const q of [px, px + 1]) { const k = tile(t, q); tiles.push(k); M.block[k] = 0; }
  // the banks at the ends: clear and stamped as road
  for (const t of [lo - 1, lo - 2, hi + 1, hi + 2]) for (const q of [px - 1, px, px + 1, px + 2]) { const k = tile(t, q); if (!W[k]) { M.block[k] = 0; M.dirt[k] = Math.max(M.dirt[k], 0.7); M.ore[k] = 0; M.oreMax[k] = 0; } }
  const huts = [];
  for (const [t, side] of [[lo - 2, px - 2], [hi + 2, px + 3]]) { const x = ax ? t : side, z = ax ? side : t; if (x > 1 && z > 1 && x < N - 2 && z < N - 2 && !W[at(x, z)]) huts.push([x, z]); }
  M.bridges.push({ i: M.bridges.length, axis, across: px, lo, hi, tiles, huts, down: false, long: hi - lo + 1 >= 7 });
}
// a stable 0..1 hash of two integers (+ a salt), for placement that has to match across sectors
function alrHash(a, b, salt) { let h = (a * 374761393 + b * 668265263 + (salt | 0) * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

// ---- the game ---------------------------------------------------------------------------------------------
function alrNewGame(tier, side, mapKey, nAI) {
  alr.phase = 'loading';                 // (the old game stops here, not when the new one's ready)
  alr.cfg = tier;
  // `side` is a faction ('crown') or, as before, an army ('A' / 'F': its first faction)
  let faction = ALR_FACTIONS[side] ? side : ALR_FACTIONS[alr.faction] && !side ? alr.faction : null;
  side = faction ? ALR_FACTIONS[faction].side : side || alr.side || 'A';
  if (!faction || ALR_FACTIONS[faction].side !== side) faction = ALR_FACTION_OF[side][0];
  alr.side = side; alr.faction = faction;
  const def = alrMapDef(mapKey || alr.mapKey), K = def.ring[0];
  alr.mapKey = def.key;
  nAI = alrClamp(nAI || alr.nAI || 1, 1, K - 1);
  alr.nAI = nAI;
  ALR_N = def.N;
  alr._pg = alr._pf = alr._pp = alr._pm = alr._pc = null;      // the pathfinder's buffers are sized by the map
  alr.payMul = 1 + 0.25 * (nAI - 1);                           // more rivals, more nuggets per kill
  alr.crates = []; alr.crateT = 40;
  alr.ents = []; alr.byId = new Map(); alr.nid = 1; alr.sel = []; alr.groups = {}; alr.fx = []; alr.shots = []; alr.decor = []; alr.pools = [];
  alr.t = 0; alr.acc = 0; alr.earned = 0; alr.paidTo = 0; alr.battle = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); alr.result = null; alr.msgs = []; alr.place = null; alr.mode = '';
  alr.stats = { kills: 0, lost: 0, built: 0, harvested: 0, crushed: 0, captured: 0 };
  alr.M = alrMakeMap(def);
  // seats: spread round the ring (two on a four-start map sit opposite), turned at random so you don't always start in the same place
  const m = nAI + 1, off = (Math.random() * K) | 0, other = side === 'A' ? 'F' : 'A';
  const slots = [], sides = [side];
  for (let i = 0; i < m; i++) slots.push((Math.floor(i * K / m) + off) % K);
  for (let i = 1; i < m; i++) sides.push(i === 1 ? other : Math.random() < 0.5 ? 'A' : 'F');
  const facs = sides.map((sd, i) => (i === 0 ? faction : ALR_FACTION_OF[sd][(Math.random() * 3) | 0]));
  alr.players = slots.map((st, i) => ({
    id: i, human: i === 0, side: sides[i], faction: facs[i], start: st,
    team: Object.assign({}, ALR_TEAMS[i], { name: ALR_FACTIONS[facs[i]].name + (m > 2 && i > 0 ? ' · ' + ALR_TEAMS[i].tag : '') }),
    power: ALR_FACTIONS[facs[i]].power ? { kind: ALR_FACTIONS[facs[i]].power.kind, t: ALR_FACTIONS[facs[i]].power.first } : null,
    credits: 7500, make: 0, use: 0, low: false,
    q: { bld: [], def: [], inf: [], veh: [] }, ready: { bld: null, def: null },
    shroud: new Uint8Array(ALR_N * ALR_N), ai: i > 0 ? alrAINew(i) : null, lost: false, underAttack: 0,
  }));
  // the last seat: the neutral oil derricks (no army, no turn, never the target of an auto-attack)
  alr.NEU = alr.players.length;
  alr.players.push({ id: alr.NEU, neutral: true, side: '', team: ALR_TEAMS[ALR_TEAMS.length - 1], credits: 0, make: 0, use: 0, low: false, q: { bld: [], def: [], inf: [], veh: [] }, ready: {}, lost: false, underAttack: 0 });
  alrUILoading(true);
  // let the loading card paint before the terrain texture is baked
  setTimeout(() => {
    alrUIBuildWorld();
    for (const P of alr.players) {
      if (P.neutral) continue;
      const [sx, sz] = alr.M.starts[P.start];
      alrSpawnBld('hq', P.id, Math.round(sx - 1.5), Math.round(sz - 1.5), true);
      // the starting army stands between the yard and the middle of the map
      const c = ALR_N / 2, dl = Math.hypot(c - sx, c - sz) || 1, ux = (c - sx) / dl, uz = (c - sz) / dl;
      let n = 0;
      for (const [type, count] of ALR_SIDES[P.side].start) for (let k = 0; k < count; k++, n++) {
        const inf = ALR_UNIT[type].cat === 'inf', a = inf ? 2.8 : 3.6, b = (k - (count - 1) / 2) * (inf ? 0.45 : 1.0) + (inf ? 1.2 : -1.2);
        const u = alrSpawnUnit(type, P.id, sx + ux * a - uz * b, sz + uz * a + ux * b);
        u.yaw = u.tYaw = Math.atan2(ux, uz);
      }
    }
    for (const [tx, tz] of alr.M.derricks) alrSpawnBld('derrick', alr.NEU, tx, tz, true);
    for (const B of alr.M.bridges) { alrSpawnBridge(B); for (const [hx, hz] of B.huts) { const h = alrSpawnBld('bhut', alr.NEU, hx, hz, true); h.bridgeIdx = B.i; } }
    alrPowerAll();
    { const [sx, sz] = alr.M.starts[alr.players[0].start], c = ALR_N / 2; alr.cam.x = sx + (c - sx) * 0.12; alr.cam.z = sz + (c - sz) * 0.12; }
    alrRevealAll();
    alrUILoading(false);
    alr.phase = 'play';
    alr.ui.root.classList.add('alr-playing');
    alrUISide(true);
    alrSay('BATTLE CONTROL ONLINE', '#9be7ff');
    alrSfx('ready');
  }, 40);
}

// ---- entities ---------------------------------------------------------------------------------------------
function alrSpawnBld(type, owner, tx, tz, instant) {
  const D = ALR_BLD[type];
  const e = { id: alr.nid++, kind: 'bld', type, D, owner, tx, tz, w: D.w, h: D.h, x: tx + D.w / 2, z: tz + D.h / 2,
    hp: Math.round(D.hp * alrMod(owner, D, 'hp')), max: Math.round(D.hp * alrMod(owner, D, 'hp')), build: instant ? 1 : 0, cool: 0, tYaw: owner === 0 ? Math.PI * 0.75 : -Math.PI * 0.25, target: null, flash: 0,
    repair: false, sell: 0, anim: Math.random() * 6, door: 0, charge: 0, lastHit: 0 };
  alr.ents.push(e); alr.byId.set(e.id, e);
  for (let j = 0; j < D.h; j++) for (let i = 0; i < D.w; i++) alr.M.bld[(tz + j) * ALR_N + tx + i] = e.id;
  if (owner === 0) alrReveal(alr.players[0], e.x, e.z, D.sight + 1);
  if (D.free && !instant && alr.players[owner].side) {
    // the refinery comes with its side's hauler, rolling out of the dock
    const [dx, dz] = alrDock(e);
    const h = alrSpawnUnit(ALR_SIDES[alr.players[owner].side].harv, owner, dx, dz - 0.4); h.yaw = Math.PI;
    h.order = { type: 'harvest' };
  }
  return e;
}
// the bridge as a target: one neutral entity over its whole span, NOT in M.bld (everyone drives across it)
function alrSpawnBridge(B) {
  const ax = B.axis === 'x', L = B.hi - B.lo + 1;
  const tx = ax ? B.lo : B.across, tz = ax ? B.across : B.lo, w = ax ? L : 2, h = ax ? 2 : L;
  const e = alrSpawnBld('bridge', alr.NEU, tx, tz, true);
  alr.M.bld[tz * ALR_N + tx] = 0;
  const hp = 500 + L * 80;          // one tank ~45 s on a short bridge; a squad ~10-15 s
  Object.assign(e, { w, h, x: tx + w / 2, z: tz + h / 2, hp, max: hp, bridgeIdx: B.i });
  B.ent = e.id;
  return e;
}
// down it goes: the strip is water again, whoever was on it goes in, every route gets re-planned
function alrBridgeDown(t) {
  const M = alr.M, B = M.bridges[t.bridgeIdx];
  B.down = true; B.downT = alr.t; B.ent = null;
  for (const k of B.tiles) M.block[k] = 1;
  for (const q of alr.ents.slice()) if (q.kind === 'unit' && !alrAirborne(q) && q.hp > 0 && B.tiles.includes(alrTile(q.x, q.z))) { q.hp = 0; q.sunk = true; alrKill(q, null); }
  for (const q of alr.ents) if (q.kind === 'unit' && q.path) { q.path = null; q.repathT = 0; }
  if (typeof alrFxBridgeDown === 'function') alrFxBridgeDown(B);
  alrSfx('boomL', t.x, t.z);
  alrSay('BRIDGE DESTROYED', '#ffb07a');
  alrRemove(t, false);
}
function alrBridgeUp(B) {
  const M = alr.M;
  B.down = false;
  for (const k of B.tiles) M.block[k] = 0;
  alrSpawnBridge(B);
  for (const q of alr.ents) if (q.kind === 'unit' && q.path) { q.path = null; q.repathT = 0; }
  alrSay('BRIDGE REPAIRED', '#9bff9b');
}
function alrSpawnUnit(type, owner, x, z) {
  const D = ALR_UNIT[type];
  const e = { id: alr.nid++, kind: 'unit', type, D, owner, x, z, yaw: owner === 0 ? Math.PI * 0.75 : -Math.PI * 0.25, tYaw: 0,
    hp: Math.round(D.hp * alrMod(owner, D, 'hp')), max: Math.round(D.hp * alrMod(owner, D, 'hp')), spd: alrMod(owner, D, 'speed'), sight: D.sight + alrMod(owner, D, 'sight'), path: null, pi: 0, order: null, target: null, cool: Math.random() * 0.5, flash: 0, walk: Math.random() * 6,
    stuck: 0, repathT: 0, acqT: Math.random() * 0.5, cargo: 0, hstate: '', hT: 0, recoil: 0, lastHit: 0, guardX: x, guardZ: z, vx: 0, vz: 0,
    alt: D.air ? (D.air === 'jet' ? 0.12 : D.alt) : 0, xp: 0, rank: 0, ammo: D.ammo || 0, cool2: 0, still: 0, deployed: false };
  if (D.carry) { e.load = []; e.rot = Math.random() * 6; e.dropT = 0; }
  e.tYaw = e.yaw;
  alr.ents.push(e); alr.byId.set(e.id, e);
  return e;
}
// Buildings are drawn turned 180° (ALR_BLD_YAW) so the side the models were built with in front (+z)
// faces the camera: the doors, the bays and the dock all open on the footprint's -z edge.
const ALR_BLD_YAW = Math.PI;
function alrDock(b) { return [b.x - 0.55, b.tz - 0.45]; }      // in front of the refinery's apron
function alrExit(b) { return b.type === 'factory' ? [b.x, b.tz - 0.45] : [b.x + 0.1, b.tz - 0.4]; }
function alrAlive(e) { return e && e.hp > 0 && alr.byId.has(e.id); }
function alrBldsOf(o, type) { return alr.ents.filter((e) => e.kind === 'bld' && e.owner === o && e.build >= 1 && (!type || e.type === type)); }
function alrHas(o, type) { return alr.ents.some((e) => e.kind === 'bld' && e.owner === o && (e.type === type || e.D.role === type) && e.build >= 1 && e.hp > 0); }
// an Air Nug Command's four pads (local ±0.95; the building is drawn turned 180°, so world = center − local)
const ALR_PADS = [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]];
function alrPadPos(b, i) { return [b.x - ALR_PADS[i][0], b.z - ALR_PADS[i][1]]; }
function alrFreePad(o, keepFor) {
  for (const b of alrBldsOf(o, 'airhq')) for (let i = 0; i < 4; i++)
    if (!alr.ents.some((u) => u !== keepFor && u.kind === 'unit' && u.D.air === 'jet' && u.pad && u.pad.b === b.id && u.pad.i === i)) return { b: b.id, i };
  return null;
}

// distance from a point to an entity's body (a building's footprint edge)
function alrDistTo(x, z, e) {
  if (e.kind === 'bld') {
    const dx = Math.max(e.tx - x, 0, x - (e.tx + e.w)), dz = Math.max(e.tz - z, 0, z - (e.tz + e.h));
    return Math.hypot(dx, dz);
  }
  return Math.hypot(e.x - x, e.z - z);
}

// ---- power and money --------------------------------------------------------------------------------------
function alrPower(P) {
  let mk = 0, use = 0;
  for (const e of alr.ents) if (e.kind === 'bld' && e.owner === P.id && e.build >= 1 && e.hp > 0) {
    const pw = e.D.power || 0;
    if (pw > 0) mk += pw * (0.5 + 0.5 * e.hp / e.max); else use -= pw;
  }
  P.make = Math.round(mk); P.use = use;
  const was = P.low;
  P.low = use > mk;
  if (P.human && P.low && !was) { alrSay('LOW POWER', '#ffb43a'); alrSfx('alarm'); }
  if (P.human) {
    const radar = alrHas(P.id, 'radar') && !P.low;
    if (P.radarWas != null && radar !== P.radarWas && alr.phase === 'play') alrSay(radar ? 'RADAR ONLINE' : 'RADAR OFFLINE', '#9be7ff');
    P.radarWas = radar;
    // the uplink: built and powered, the whole map comes out of the shroud — for good, as RA2's did
    if (!P.satUp && alrHas(P.id, 'spysat') && !P.low && alr.phase === 'play') { P.satUp = true; P.shroud.fill(255); alr.shroudDirty = true; alrSay('SATELLITE ONLINE · MAP REVEALED', '#9be7ff'); alrSfx('build'); }
  }
}
function alrPowerAll() { for (const P of alr.players) if (!P.neutral) alrPower(P); }
function alrEarn(units, why) {
  if (units <= 0 || !alr.cfg) return 0;
  const worth = Math.max(1, Math.round(storm.perFlyer * units * alr.cfg.mult * (alr.payMul || 1)));
  // a battle pays each nugget once: load an earlier save and the stretch you replay pays nothing until you're
  // past the most this battle ever earned (alr.paidTo, kept per battle in this browser — see alertSave.js)
  const before = alr.earned;
  alr.earned += worth;
  storm.caught += Math.max(0, alr.earned - Math.max(before, alr.paidTo || 0));
  if (alr.earned > (alr.paidTo || 0)) { alr.paidTo = alr.earned; if (typeof alrPaidNote === 'function') alrPaidNote(); }
  if (why) alrFloat('+' + fmt.format(worth) + ' ' + why);
  return worth;
}

// ---- production --------------------------------------------------------------------------------------------
function alrCanBuild(P, type) {
  const D = ALR_BLD[type] || ALR_UNIT[type];
  if (!D || !D.cat || !P.side) return false;
  if (D.side && D.side !== P.side) return false;            // the other army's
  if (D.faction && D.faction !== P.faction) return false;   // another faction's own
  if (!alrHas(P.id, 'hq') && (D.cat === 'bld' || D.cat === 'def')) return false;
  if (D.cat === 'inf' && !alrHas(P.id, 'barracks')) return false;
  if (D.air === 'jet') { if (!alrHas(P.id, 'airhq')) return false; }      // jets come off the pads, four to a command
  else if (D.cat === 'veh' && !alrHas(P.id, 'factory')) return false;
  if (D.air === 'jet') {
    const jets = alr.ents.filter((u) => u.kind === 'unit' && u.owner === P.id && u.D.air === 'jet').length + P.q.veh.filter((q) => ALR_UNIT[q.type].air === 'jet').length;
    if (jets >= 4 * alrBldsOf(P.id, 'airhq').length) return false;
  }
  return (D.req || []).every((r) => alrHas(P.id, r));
}
function alrQueue(P, type) {
  const D = ALR_BLD[type] || ALR_UNIT[type];
  if (!alrCanBuild(P, type)) return false;
  const q = P.q[D.cat];
  if (D.cat === 'bld' || D.cat === 'def') {
    if (P.ready[D.cat]) return false;
    if (q.length) {
      // clicking the one that's building again: un-hold it
      if (q[0].type === type && q[0].hold) { q[0].hold = false; return true; }
      return false;
    }
  } else if (q.length >= 29) return false;          // (RA2's MaximumQueuedObjects)
  q.push({ type, spent: 0, hold: false });
  if (P.human) { alrSfx('click'); if (D.cat === 'bld' || D.cat === 'def') alrSay('BUILDING', '#cfe8ff'); else if (q.length === 1) alrSay('TRAINING', '#cfe8ff'); }
  return true;
}
// right-click a cameo: hold the one in progress, a second time cancels it (money back)
function alrUnqueue(P, type) {
  const D = ALR_BLD[type] || ALR_UNIT[type], cat = D.cat, q = P.q[cat];
  if ((cat === 'bld' || cat === 'def') && P.ready[cat] === type) { P.ready[cat] = null; P.credits += alrCost(P, D); if (alr.place && alr.place.type === type) alr.place = null; alrSfx('click'); return; }
  let i = -1; for (let k = q.length - 1; k >= 0; k--) if (q[k].type === type) { i = k; break; }
  if (i < 0) return;
  const it = q[i];
  if (i === 0 && !it.hold && it.spent > 0) { it.hold = true; if (P.human) alrSay('ON HOLD', '#ffd27a'); alrSfx('click'); return; }
  P.credits += it.spent; q.splice(i, 1);
  if (P.human) { alrSay('CANCELED', '#ffd27a'); alrSfx('click'); }
}
function alrProduce(P, dt) {
  for (const cat of ['bld', 'def', 'inf', 'veh']) {
    const q = P.q[cat];
    if (!q.length) continue;
    const it = q[0];
    if (it.hold) continue;
    const D = ALR_BLD[it.type] || ALR_UNIT[it.type];
    if (!alrCanBuild(P, it.type)) continue;
    // more factories, faster; low power, half speed; the CPU's tier sets its pace
    const nf = cat === 'inf' ? alrBldsOf(P.id, 'barracks').length : cat === 'veh' ? alrBldsOf(P.id, 'factory').length : 1;
    // (RA2: each extra factory of the kind multiplies the build time by 0.8)
    const cost = alrCost(P, D);
    let rate = cost / (D.time * alrMod(P.id, D, 'time')) / Math.pow(0.8, Math.max(0, nf - 1)) * (P.low ? 0.5 : 1);
    if (!P.human) rate *= alr.cfg.cpu;
    let pay = Math.min(rate * dt, cost - it.spent, P.credits);
    if (pay <= 0 && it.spent < cost) { if (P.human && !P.broke) { P.broke = true; alrSay('INSUFFICIENT FUNDS', '#ff8a7a'); alrSfx('error'); } continue; }
    P.broke = false;
    it.spent += pay; P.credits -= pay;
    if (it.spent >= cost - 0.01) {
      q.shift();
      if (cat === 'bld' || cat === 'def') {
        P.ready[cat] = it.type;
        if (P.human) { alrSay('CONSTRUCTION COMPLETE', '#9bff9b'); alrSfx('ready'); }
      } else alrDeliver(P, it.type);
    }
  }
}
// a unit comes out of its door and drives to the rally point
function alrDeliver(P, type) {
  const D = ALR_UNIT[type];
  if (D.air === 'jet') {
    // a jet appears on a free pad, parked and armed
    const pad = alrFreePad(P.id);
    if (!pad) { P.credits += alrCost(P, D); return; }
    const b = alr.byId.get(pad.b), [px, pz] = alrPadPos(b, pad.i);
    const u = alrSpawnUnit(type, P.id, px, pz);
    u.pad = pad; u.jet = 'pad'; u.yaw = Math.PI; u.ammo = D.ammo;
    if (P.human) { alrSay('UNIT READY', '#9bff9b'); alrSfx('ready'); }
    return;
  }
  const from = alrBldsOf(P.id, D.cat === 'inf' ? 'barracks' : 'factory');
  if (!from.length) return;
  const b = from[alr.t % from.length | 0];
  const [x, z] = alrExit(b);
  const u = alrSpawnUnit(type, P.id, x, z);
  u.yaw = u.tYaw = Math.PI;
  if (b.type === 'factory') b.door = 1.6;
  if (D.harv) u.order = { type: 'harvest' };
  else if (D.engineer && !P.human) u.order = null;        // the CPU sends its own cooks
  else {
    const rx = b.rally ? b.rally[0] : x + (P.id === 0 ? 1.5 : -1.5) + alrRnd(-1, 1), rz = b.rally ? b.rally[1] : z - 1.6 + alrRnd(-0.6, 0.6);
    alrOrderMove(u, rx, rz, false);
  }
  if (P.human) { alrSay('UNIT READY', '#9bff9b'); alrSfx('ready'); }
}
// placement: on the map, on free ground, near your own base (2 tiles from any of your buildings; a wall up to 6)
function alrCanPlace(P, type, tx, tz) {
  const D = ALR_BLD[type], M = alr.M;
  if (tx < 1 || tz < 1 || tx + D.w > ALR_N - 1 || tz + D.h > ALR_N - 1) return false;
  for (let j = 0; j < D.h; j++) for (let i = 0; i < D.w; i++) {
    const k = (tz + j) * ALR_N + tx + i;
    if (M.block[k] || M.bld[k] || M.ore[k] > 0 || (M.water && M.water[k])) return false;
    if (P.human && !P.shroud[k]) return false;
  }
  // nobody standing there
  for (const e of alr.ents) if (e.kind === 'unit' && e.x > tx - 0.2 && e.x < tx + D.w + 0.2 && e.z > tz - 0.2 && e.z < tz + D.h + 0.2) return false;
  let near = false;
  const reach = D.wall ? 6 : 2;
  for (const e of alr.ents) if (e.kind === 'bld' && e.owner === P.id && e.hp > 0 && !e.D.tech) {
    const gx = Math.max(e.tx - (tx + D.w), tx - (e.tx + e.w), 0), gz = Math.max(e.tz - (tz + D.h), tz - (e.tz + e.h), 0);
    if (Math.max(gx, gz) <= reach) { near = true; break; }
  }
  return near;
}
// a line of wall: the first segment is the one you built; each one after it is $100 more, paid now
function alrPlaceWalls(P, type, tiles) {
  if (P.ready.def !== type) return 0;
  let n = 0;
  for (const [tx, tz] of tiles) {
    if (!alrCanPlace(P, type, tx, tz)) continue;
    if (n > 0) { if (P.credits < ALR_BLD[type].cost) break; P.credits -= ALR_BLD[type].cost; }
    alrSpawnBld(type, P.id, tx, tz, false); n++;
  }
  if (n) { P.ready.def = null; alrRepathAround(); if (P.human) { alrSfx('place'); alr.stats.built += n; } }
  return n;
}
function alrPlace(P, type, tx, tz) {
  const cat = ALR_BLD[type].cat;
  if (P.ready[cat] !== type || !alrCanPlace(P, type, tx, tz)) return false;
  P.ready[cat] = null;
  const b = alrSpawnBld(type, P.id, tx, tz, false);
  alrRepathAround(b);
  if (P.human) { alrSfx('place'); alr.stats.built++; }
  return true;
}
// anybody whose path crosses the new footprint finds a new one
function alrRepathAround(b) { for (const e of alr.ents) if (e.kind === 'unit' && e.path) e.repathT = 0; }
function alrSell(e) {
  if (e.kind !== 'bld' || e.sell || e.D.tech) return;        // a captured derrick can't be sold (RA2's rule)
  e.sell = 1;
  alr.players[e.owner].credits += Math.round((e.D.cost ? alrCost(alr.players[e.owner], e.D) : 1500) * 0.5 * e.hp / e.max);
  if (e.owner === 0) { alrSfx('sell'); alrSay('BUILDING SOLD', '#ffe08a'); }
}

// ---- pathfinding: A* on the tile grid, 8 directions, no cutting corners ------------------------------------
function alrPassable(k, self) {
  const M = alr.M;
  if (M.block[k]) return false;
  const b = M.bld[k];
  if (b && (!self || !self.dockFor || self.dockFor !== b)) return false;
  return true;
}
function alrPath(sx, sz, gx, gz, self) {
  const N = ALR_N, M = alr.M;
  let s = alrTile(sx, sz), g = alrTile(alrClamp(gx, 0, N - 1), alrClamp(gz, 0, N - 1));
  // a click in the water / off the map / on a building: go to the nearest ground you can stand on — and END
  // there (the last waypoint used to be the click itself, out in the river: the unit walked on the spot forever)
  const g0 = g;
  if (!alrPassable(g, self)) g = alrNearestFree(g, self);
  if (g < 0) return null;
  if (g !== g0) { gx = g % N + 0.5; gz = ((g / N) | 0) + 0.5; }
  if (s === g) return [[gx, gz]];
  const G = alr._pg || (alr._pg = new Float32Array(N * N)), F = alr._pf || (alr._pf = new Float32Array(N * N));
  const from = alr._pp || (alr._pp = new Int32Array(N * N)), mark = alr._pm || (alr._pm = new Uint32Array(N * N));
  alr._pgen = (alr._pgen || 0) + 1;
  const gen = alr._pgen;
  const gxi = g % N, gzi = (g / N) | 0;
  const h = (k) => { const dx = Math.abs(k % N - gxi), dz = Math.abs(((k / N) | 0) - gzi); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const heap = [];
  const push = (k) => { heap.push(k); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (F[heap[p]] <= F[k]) break; heap[i] = heap[p]; i = p; } heap[i] = k; };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { let i = 0; const n = heap.length; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && F[heap[c + 1]] < F[heap[c]]) c++; if (F[heap[c]] >= F[last]) break; heap[i] = heap[c]; i = c; } heap[i] = last; }
    return top;
  };
  mark[s] = gen; G[s] = 0; F[s] = h(s); from[s] = -1; push(s);
  const closed = alr._pc || (alr._pc = new Uint32Array(N * N));
  let best = s, bestH = h(s), n = 0;
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length && n++ < 5000) {
    const k = pop();
    if (closed[k] === gen) continue;
    closed[k] = gen;
    if (k === g) { best = k; break; }
    const kx = k % N, kz = (k / N) | 0;
    const hk = h(k); if (hk < bestH) { bestH = hk; best = k; }
    for (const [dx, dz, c] of DIRS) {
      const nx = kx + dx, nzz = kz + dz;
      if (nx < 0 || nzz < 0 || nx >= N || nzz >= N) continue;
      const nk = nzz * N + nx;
      if (!alrPassable(nk, self)) continue;
      if (dx && dz && (!alrPassable(kz * N + nx, self) || !alrPassable(nzz * N + kx, self))) continue;
      const ng = G[k] + c;
      if (mark[nk] === gen && ng >= G[nk]) continue;
      mark[nk] = gen; G[nk] = ng; F[nk] = ng + h(nk) * 1.001; from[nk] = k; push(nk);
    }
  }
  // walk back, then drop the waypoints that are on a straight line
  const out = [];
  for (let k = best; k !== -1 && k !== s; k = from[k]) out.push([k % N + 0.5, ((k / N) | 0) + 0.5]);
  out.reverse();
  if (best === g && out.length) out[out.length - 1] = [alrClamp(gx, 0.5, N - 0.5), alrClamp(gz, 0.5, N - 0.5)];
  const smooth = [];
  for (let i = 0; i < out.length; i++) {
    if (i > 0 && i < out.length - 1) {
      const a = out[i - 1], b = out[i], c = out[i + 1];
      if (Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) < 0.01) continue;
    }
    smooth.push(out[i]);
  }
  return smooth.length ? smooth : null;
}
function alrNearestFree(k, self) {
  const N = ALR_N, x0 = k % N, z0 = (k / N) | 0;
  for (let r = 1; r < 12; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const x = x0 + dx, z = z0 + dz;
    if (x < 0 || z < 0 || x >= N || z >= N) continue;
    const kk = z * N + x;
    if (alrPassable(kk, self)) return kk;
  }
  return -1;
}

// ---- orders --------------------------------------------------------------------------------------------------
function alrOrderMove(u, x, z, attackMove) {
  u.deployed = false;                                       // a move order packs up the sandbags
  u.order = { type: 'move', x, z, am: !!attackMove };
  u.target = null; u.pi = 0; u.stuck = 0;
  u.path = u.D.air === 'jet' ? null : u.D.air ? [[x, z]] : alrPath(u.x, u.z, x, z, u);   // aircraft fly straight there
  if (u.D.carry) u.parked = false;
  if (u.D.harv) { u.hstate = ''; }
}
function alrOrderAttack(u, t) {
  if (u.D.engineer) { if (alrCanCapture(u, t)) { u.order = { type: 'capture', t: t.id }; u.path = null; } return; }
  if (!u.D.weapon) { alrOrderMove(u, t.x, t.z, false); return; }
  if (!alrCanHit(ALR_WPN[u.D.weapon], t) && !(u.D.weapon2 && alrCanHit(ALR_WPN[u.D.weapon2], t))) return;
  u.order = { type: 'attack', t: t.id }; u.target = t; u.path = null; u.repathT = 0;
}
// a hauler, sent home NOW to unload what it has (even a part load) — then back to work. The Chrono Hauler blinks.
function alrHarvHome(u, b) {
  if (!u.D.harv) return;
  u.order = { type: 'harvest' }; u.path = null; u.stallT = 0;
  u.homeB = b ? b.id : null;
  if (u.hstate !== 'unload') u.hstate = 'home';
}
// D: dig in (the Nug Trooper's sandbags) / pack up · a carrier unloads · a hauler goes home to unload
function alrDeploy(u) { if (u.D.harv) { alrHarvHome(u); return; } if (u.D.carry) { alrOrderUnload(u); return; } if (!u.D.deploy) return; u.deployed = !u.deployed; u.order = null; u.path = null; u.target = null; u.guardX = u.x; u.guardZ = u.z; }
// a group move: the units keep their spacing around the click (a little formation)
function alrGroupMove(units, x, z, am) {
  if (!units.length) return;
  let cx = 0, cz = 0; for (const u of units) { cx += u.x; cz += u.z; } cx /= units.length; cz /= units.length;
  const spread = Math.hypot(...units.map((u) => 0)) || 0; void spread;
  const n = units.length, cols = Math.ceil(Math.sqrt(n));
  // face the formation along the move
  const ang = Math.atan2(x - cx, z - cz), ca = Math.cos(ang), sa = Math.sin(ang);
  const sorted = units.slice().sort((a, b) => (a.D.cat === 'veh') - (b.D.cat === 'veh'));
  sorted.forEach((u, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const gap = u.D.cat === 'veh' ? 1.0 : 0.6;
    const lx = (col - (cols - 1) / 2) * gap, lz = -row * gap;
    alrOrderMove(u, x + lx * ca + lz * sa, z - lx * sa + lz * ca, am);
  });
}

// ---- helicopters: the carriers ---------------------------------------------------------------------------------
// Select infantry (or a vehicle) and click your carrier: it lands where it is, they walk / drive to it and board
// (out of the world, into its hold). Select the carrier and press D, or click it: it lands and they come out
// around it. A troop carrier takes infantry and dogs (not jetpacks: they fly); a lifter takes one ground vehicle.
// The Sky Fryer hangs it on a sling under the belly; the Hog Lifter clamps it between its legs.
function alrCanCarry(h, u) {
  if (!h || !h.D.carry || u === h || u.kind !== 'unit' || h.owner !== u.owner || u.D.air) return false;
  return h.D.carry === 'inf' ? u.D.cat === 'inf' : u.D.cat === 'veh';
}
// spaces left, counting those already on their way in
function alrRoom(h, but) { return h.D.cap - h.load.length - alr.ents.filter((q) => q !== but && q.order && q.order.type === 'board' && q.order.t === h.id).length; }
function alrOrderBoard(u, h) {
  if (!alrCanCarry(h, u) || !alrAlive(h) || alrRoom(h, u) <= 0) return false;
  u.deployed = false; u.order = { type: 'board', t: h.id }; u.target = null; u.path = null; u.repathT = 0;
  if (h.order && h.order.type === 'move') { h.order = null; h.path = null; }   // it waits for them
  return true;
}
function alrOrderUnload(h) {
  if (!h.D.carry || !h.load.length) return;
  if (!alrLandOk(h.x, h.z, h)) { if (h.owner === 0) { alrSay('CANNOT UNLOAD HERE', '#ff8a7a'); alrSfx('error'); } return; }
  h.order = { type: 'unload' }; h.path = null; h.dropT = 0.3;
}
// the height it sits at on the ground (a sling lifter hovers so the tank under it touches down)
function alrLandAlt(h) { return h.D.sling < 0 ? -h.D.sling + 0.04 : 0; }
// somewhere a carrier can come down: dry ground, no building, nothing blocking
function alrLandOk(x, z, h) {
  if (!alrIn(x, z)) return false;
  const k = alrTile(x, z), M = alr.M;
  return !M.block[k] && !M.bld[k] && !(M.water && M.water[k]);
}
function alrHeliStep(u, dt) {
  const D = u.D, la = alrLandAlt(u);
  let land = false, moving = false;
  // someone's coming aboard but it can't come down here (trees, a building, the river): hop to clear ground
  if (!u.order && u.wantLand > alr.t && !alrLandOk(u.x, u.z, u)) {
    const k = alrNearestFree(alrTile(u.x, u.z), null);
    if (k >= 0) u.order = { type: 'move', x: (k % ALR_N) + 0.5, z: Math.floor(k / ALR_N) + 0.5, am: false };
  }
  const o = u.order;
  if (o && o.type === 'unload') land = true;
  else if (!o && (u.wantLand > alr.t || u.parked) && alrLandOk(u.x, u.z, u)) land = true;   // someone's boarding / it was left down
  const want = land ? la : D.alt;
  u.alt += alrClamp(want - u.alt, -1.3 * dt, 1.3 * dt);
  u.rot = (u.rot || 0) + dt * (u.alt > la + 0.2 || !land ? 30 : 12);
  if (o && o.type === 'move') {
    if (u.alt > D.alt * 0.6) { if (!u.path) u.path = [[o.x, o.z]]; moving = alrFollow(u, dt); }
    else { u.vx = u.vz = 0; }
    if (!u.path || Math.hypot(u.x - o.x, u.z - o.z) < 0.35) { u.order = null; u.path = null; u.guardX = u.x; u.guardZ = u.z; }
  } else { u.vx = u.vz = 0; }
  if (o && o.type === 'unload' && u.alt <= la + 0.03) {
    if ((u.dropT -= dt) <= 0) { u.dropT = 0.22; const p = u.load.shift(); if (p) alrDisembark(p, u, u.load.length); }
    if (!u.load.length) { u.order = null; u.parked = true; if (u.owner === 0) alrSfx('click'); }
  }
  u.moving = moving;
}
function alrBoardStep(u, dt) {
  const h = alr.byId.get(u.order.t);
  if (!alrAlive(h) || !alrCanCarry(h, u) || h.load.length >= h.D.cap) { u.order = null; u.path = null; u.moving = false; return; }
  h.wantLand = alr.t + 0.6;                                   // keep it on the ground while they come
  const d = Math.hypot(h.x - u.x, h.z - u.z), down = h.alt <= alrLandAlt(h) + 0.06 && !h.order;
  if (down && d < (u.D.cat === 'veh' ? 0.8 : 0.65)) { alrBoard(u, h); return; }
  if (!down && d < 0.9) { u.moving = false; u.vx = u.vz = 0; return; }   // there: wait for it to touch down
  if (!u.path || (u.repathT -= dt) <= 0) { u.repathT = 0.8; u.path = alrPath(u.x, u.z, h.x, h.z, u); u.pi = 0; }
  u.moving = alrFollow(u, dt);
  if (u.moving) u.walk += dt * u.D.speed * 7;
}
function alrBoard(u, h) {
  alrRemove(u, false);
  u.order = null; u.path = null; u.target = null; u.moving = false; u.vx = u.vz = 0; u.deployed = false;
  h.load.push(u);
  if (h.owner === 0) alrSfx('click');
}
// out of the hold: around the carrier, on the nearest free ground (a vehicle straight down under a lifter)
function alrDisembark(p, h, i) {
  let x = h.x, z = h.z;
  if (p.D.cat !== 'veh') { const a = h.yaw + Math.PI + (i - 2) * 0.7, r = 0.55 + (i % 2) * 0.2; x = h.x + Math.sin(a) * r; z = h.z + Math.cos(a) * r; }
  let k = alrTile(x, z);
  if (!alrIn(x, z) || !alrPassable(k, p) || (alr.M.water && alr.M.water[k])) { k = alrNearestFree(alrTile(h.x, h.z), p); if (k < 0) { h.load.unshift(p); return; } x = (k % ALR_N) + 0.5; z = Math.floor(k / ALR_N) + 0.5; }
  p.x = x; p.z = z; p.yaw = h.yaw; p.tYaw = h.yaw; p.guardX = x; p.guardZ = z; p.order = null; p.path = null; p.target = null;
  alr.ents.push(p); alr.byId.set(p.id, p);
}

// ---- the Nugget Republic's SKY DROP (RA2's American paratroopers): a cargo plane crosses from the map's edge and
// six troopers come down by parachute where you clicked. Every 4 minutes (the first at 2:30).
function alrPowerReady(P) { return !!(P && P.power && P.power.t <= 0 && !P.lost); }
function alrSkyDrop(P, x, z) {
  if (!alrPowerReady(P) || !alrIn(x, z)) return false;
  const F = ALR_FACTIONS[P.faction];
  P.power.t = (F && F.power ? F.power.every : 240);
  // in from the nearest edge of the map to this player's yard, over the drop, and out the other side
  const st = alr.M.starts[P.start] || [x, z], dx = x - st[0], dz = z - st[1], L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L, far = ALR_N * 0.75;
  alr.drops = alr.drops || [];
  alr.drops.push({ owner: P.id, x: x - ux * far, z: z - uz * far, tx: x, tz: z, ux, uz, speed: 7, n: 6, dropped: 0, t: 0 });
  if (P.human) { alrSay('SKY DROP INBOUND', '#9be7ff'); alrSfx('click'); }
  return true;
}
function alrDropsStep(dt) {
  if (!alr.drops || !alr.drops.length) return;
  for (const d of alr.drops) {
    d.t += dt; d.x += d.ux * d.speed * dt; d.z += d.uz * d.speed * dt;
    const along = (d.x - d.tx) * d.ux + (d.z - d.tz) * d.uz;     // < 0 before the drop point, > 0 after
    // over the point: out they go, one every 0.15 s, a little spread
    if (along > -0.6 && d.dropped < d.n && (d.next = (d.next || 0) - dt) <= 0) {
      d.next = 0.15;
      const P = alr.players[d.owner], type = P.side === 'F' ? 'conscript' : 'inf';
      const k = d.dropped++, a = k * 2.4, r = 0.4 + (k % 3) * 0.3;
      let px = d.x + Math.cos(a) * r, pz = d.z + Math.sin(a) * r;
      if (!alrIn(px, pz) || !alrPassable(alrTile(px, pz))) { const kk = alrNearestFree(alrTile(alrClamp(d.tx, 1, ALR_N - 2), alrClamp(d.tz, 1, ALR_N - 2)), null); if (kk < 0) continue; px = kk % ALR_N + 0.5; pz = Math.floor(kk / ALR_N) + 0.5; }
      const u = alrSpawnUnit(type, d.owner, px, pz);
      u.alt = 3.0; u.chute = true; u.yaw = u.tYaw = Math.atan2(d.ux, d.uz);
    }
    if (along > ALR_N) d.done = true;
  }
  alr.drops = alr.drops.filter((d) => !d.done);
}

// ---- the sim -------------------------------------------------------------------------------------------------
function alrSim(dt) {
  alr.t += dt;
  alrDropsStep(dt);
  for (const P of alr.players) {
    if (P.lost || P.neutral) continue;
    if (P.power && P.power.t > 0) { P.power.t -= dt; if (P.power.t <= 0 && P.human) { alrSay('SKY DROP READY', '#9bff9b'); alrSfx('ready'); } }
    alrProduce(P, dt);
    if (P.ai) alrAIStep(P, dt);
    else if (alr.auto && P.id === 0) { P.ai = P.ai || alrAINew(0); alrAIStep(P, dt); }
    if (P.underAttack > 0) P.underAttack -= dt;
  }
  if (((alr.t * 4) | 0) !== (((alr.t - dt) * 4) | 0)) { alrPowerAll(); alrRevealAll(); }
  for (const e of alr.ents.slice()) {
    if (!alr.byId.has(e.id)) continue;
    if (e.kind === 'unit') alrUnitStep(e, dt); else alrBldStep(e, dt);
  }
  alrCrush();
  alrSeparate(dt);
  alrShotsStep(dt);
  alrOreGrow(dt);
  alrCrates(dt);
  alrCheckEnd();
}

// ---- weapons vs targets ------------------------------------------------------------------------------------
// the weapon a unit fights with right now (a deployed trooper fights from behind his sandbags)
function alrW(u) { const k = u.deployed && u.D.deploy ? u.D.deploy : u.D.weapon; return k ? ALR_WPN[k] : null; }
function alrAirborne(t) { return t.kind === 'unit' && !!t.D.air && t.alt > 0.5; }
function alrArmor(t) { return t.kind === 'bld' ? 'bld' : alrAirborne(t) ? 'air' : t.D.armor === 'air' ? 'veh' : t.D.armor; }
// can this weapon hurt that? (most guns can't shoot up; flak and SAMs can't shoot down; only heavy hits dent a wall)
function alrCanHit(W, t) {
  if (!W || !t) return false;
  const air = alrAirborne(t);
  if (air ? !W.air : W.ground === false) return false;
  const v = W.vs[alrArmor(t)];
  if (v === 0 || (air && v == null)) return false;
  if (t.kind === 'bld' && (t.D.wall || t.D.bridge) && !ALR_WALL_KINDS[W.kind]) return false;
  if (t.kind === 'bld' && t.D.bhut) return false;
  return true;
}
// rank: 0 rookie · 1 veteran · 2 elite (RA2: promoted after kills worth 3× your own price, and again)
const ALR_RANK = [{ dmg: 1, rof: 1, armor: 1, speed: 1 }, { dmg: 1.1, rof: 0.8, armor: 0.75, speed: 1.1 }, { dmg: 1.25, rof: 0.65, armor: 0.6, speed: 1.2 }];
function alrPromote(u, n) {
  const was = u.rank;
  u.rank = Math.min(2, u.rank + (n || 1));
  if (u.rank > was) { alrFxSpark(u.x, 0.5 + (u.alt || 0), u.z, 8); if (u.owner === 0) { alrSay('UNIT PROMOTED', '#9bff9b'); alrFloatAt(u.x, u.z, u.rank === 2 ? 'ELITE!' : 'VETERAN!', '#ffd23a'); } }
}

function alrUnitStep(u, dt) {
  if (u.flash > 0) u.flash -= dt;
  if (u.cool > 0) u.cool -= dt;
  if (u.cool2 > 0) u.cool2 -= dt;
  if (u.recoil > 0) u.recoil -= dt * 4;
  if (u.leap > 0) u.leap -= dt;
  const D = u.D;
  // self-repair (the Family Size, the blimp) and the elite's own healing
  if ((D.heal || u.rank === 2) && u.hp < u.max) u.hp = Math.min(u.max, u.hp + ((D.heal || 0) + (u.rank === 2 ? u.max * 0.008 : 0)) * dt);
  if (D.air === 'jet') { alrJetStep(u, dt); return; }
  if (D.air === 'heli') { alrHeliStep(u, dt); return; }
  if (u.chute) { u.alt -= dt * 1.1; u.walk = 0; if (u.alt <= 0) { u.alt = 0; u.chute = false; u.guardX = u.x; u.guardZ = u.z; } return; }
  if (u.order && u.order.type === 'board') { alrBoardStep(u, dt); return; }
  if (D.air) u.alt += (D.alt - u.alt) * Math.min(1, dt * 2);
  if (D.engineer) { alrEngineerStep(u, dt); return; }
  const o = u.order, W = alrW(u);
  // targets: keep the one we're told to kill; otherwise look around (guard)
  if (o && o.type === 'attack') {
    const t = alr.byId.get(o.t);
    if (!alrAlive(t) || !alrCanHit(W, t)) { u.order = null; u.target = null; }
    else u.target = t;
  } else if (W && (!o || o.am || o.type === 'harvest' || (D.turret && o.type === 'move') || u.deployed)) {
    if ((u.acqT -= dt) <= 0) {
      u.acqT = 0.35 + Math.random() * 0.2;
      if (!alrAlive(u.target) || !alrCanHit(W, u.target) || alrDistTo(u.x, u.z, u.target) > W.range + 0.6) u.target = alrAcquire(u, W.range + (o || u.deployed ? 0.3 : 1.5), W);
    }
  } else if (!W) u.target = null;
  if (u.target && !alrAlive(u.target)) u.target = null;
  // the second weapon (the Family Size's anti-air missiles) looks after itself
  if (D.weapon2) {
    const W2 = ALR_WPN[D.weapon2];
    if (!alrAlive(u.target2) || !alrCanHit(W2, u.target2) || alrDistTo(u.x, u.z, u.target2) > W2.range) { if ((u.acq2 = (u.acq2 || 0) - dt) <= 0) { u.acq2 = 0.4; u.target2 = alrAcquire(u, W2.range, W2); } }
    if (u.target2 && u.cool2 <= 0) { u.cool2 = W2.rof * ALR_RANK[u.rank].rof; alrFire(u, u.target2, W2); }
  }
  // harvesting has its own little brain (the War Hauler shoots while it works)
  if (D.harv) {
    alrHarvStep(u, dt);
    if (W && u.target && alrDistTo(u.x, u.z, u.target) <= W.range) alrAim(u, u.target, dt, W, true);
    else if (D.turret) alrTurretTo(u, u.yaw, dt);
    return;
  }
  // dug in: shoot from the sandbags, don't move
  if (u.deployed) {
    u.path = null; u.moving = false;
    if (u.target && alrDistTo(u.x, u.z, u.target) <= W.range) alrAim(u, u.target, dt, W);
    return;
  }
  const t = u.target;
  let moving = false;
  if (t && W) {
    const d = alrDistTo(u.x, u.z, t);
    const chase = (o && o.type === 'attack') || (!o && Math.hypot(u.x - u.guardX, u.z - u.guardZ) < 6) || (o && o.am);
    if (d <= W.range) {
      // in range: an attack-move pauses to shoot; a plain move keeps rolling (a turret shoots on the move)
      if (!(o && o.type === 'move' && !o.am)) { u.path = null; }
      alrAim(u, t, dt, W);
    } else if (chase && !(o && o.type === 'move' && !o.am)) {
      if ((u.repathT -= dt) <= 0) { u.repathT = 0.8 + Math.random() * 0.4; u.path = D.air ? [[t.x, t.z]] : alrPath(u.x, u.z, t.x, t.z, u); u.pi = 0; }
      moving = alrFollow(u, dt);
      if (D.turret) alrTurretTo(u, Math.atan2(t.x - u.x, t.z - u.z), dt);
    } else if (!o) { u.target = null; }
    if (o && o.type === 'move' && u.D.turret && d <= W.range) alrAim(u, t, dt, W, true);
  }
  if (o && o.type === 'move' && !(t && o.am && alrDistTo(u.x, u.z, t) <= (W ? W.range : 0))) {
    if (!u.path || (u.repathT -= dt) <= 0 && u.stuck > 0.8) { u.path = D.air ? [[o.x, o.z]] : alrPath(u.x, u.z, o.x, o.z, u); u.pi = 0; u.repathT = 1; u.stuck = 0; }
    moving = alrFollow(u, dt);
    if (!u.path || Math.hypot(u.x - o.x, u.z - o.z) < (D.cat === 'inf' ? 0.25 : 0.4)) { u.order = null; u.path = null; u.guardX = u.x; u.guardZ = u.z; }
  }
  if (!o && !t && Math.hypot(u.x - u.guardX, u.z - u.guardZ) > 0.6) {
    // wandered off chasing something: go back to where you were left
    if (!u.path) { u.path = D.air ? [[u.guardX, u.guardZ]] : alrPath(u.x, u.z, u.guardX, u.guardZ, u); u.pi = 0; }
    moving = alrFollow(u, dt);
    if (!u.path) u.guardX = u.x, u.guardZ = u.z;
  }
  if (D.turret && !t) alrTurretTo(u, u.yaw, dt);
  u.moving = moving;
  if (moving) u.walk += dt * D.speed * 7;
  // the Mirage: parked long enough, it's a tree
  if (D.disguise) u.still = moving || u.cool > W.rof * 0.5 ? 0 : u.still + dt;
}
// follow the path; vehicles turn before they drive, infantry pivot on the spot, aircraft ignore the ground
function alrFollow(u, dt) {
  if (!u.path || u.pi >= u.path.length) { u.path = null; u.vx = u.vz = 0; return false; }
  const [wx, wz] = u.path[u.pi];
  const dx = wx - u.x, dz = wz - u.z, d = Math.hypot(dx, dz);
  const last = u.pi === u.path.length - 1, air = !!u.D.air;
  if (d < (last ? 0.08 : 0.32)) { u.pi++; if (u.pi >= u.path.length) { u.path = null; u.vx = u.vz = 0; return false; } return true; }
  const want = Math.atan2(dx, dz);
  let da = want - u.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
  const turn = u.D.turn || 9;
  u.yaw += alrClamp(da, -turn * dt, turn * dt);
  const align = u.D.cat === 'inf' ? 1 : Math.max(0, Math.cos(da));
  let sp = u.D.speed * (u.spd || 1) * ALR_RANK[u.rank].speed * align * (u.D.cat === 'veh' && Math.abs(da) > 0.9 ? 0.15 : 1);
  if (last) sp = Math.min(sp, d * 4);
  const nx = u.x + Math.sin(u.yaw) * sp * dt, nz = u.z + Math.cos(u.yaw) * sp * dt;
  const k = alrTile(nx, nz);
  if (air ? (nx > 0.5 && nz > 0.5 && nx < ALR_N - 0.5 && nz < ALR_N - 0.5) : (alrIn(nx, nz) && alrPassable(k, u))) { u.vx = (nx - u.x) / dt; u.vz = (nz - u.z) / dt; u.x = nx; u.z = nz; u.stuck = Math.max(0, u.stuck - dt); }
  else {
    // blocked: stand still (no walking on the spot), re-plan once; still blocked after that, give up
    u.stuck += dt * 2; u.vx = u.vz = 0; u.blocked = (u.blocked || 0) + dt;
    if (u.blocked > 2.5) { u.path = null; u.blocked = 0; return false; }
    if (u.stuck > 1 && !air) { u.path = alrPath(u.x, u.z, u.path[u.path.length - 1][0], u.path[u.path.length - 1][1], u); u.pi = 0; u.stuck = 0; }
    return false;
  }
  u.blocked = 0;
  return true;
}
function alrTurretTo(u, ang, dt) {
  let da = ang - u.tYaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
  u.tYaw += alrClamp(da, -4.5 * dt, 4.5 * dt);
  return Math.abs(da) < 0.12;
}
function alrAim(u, t, dt, W, keepMoving) {
  const ang = Math.atan2(t.x - u.x, t.z - u.z);
  let ok;
  if (u.D.air === 'blimp') ok = true;                        // a bomb falls straight down: no aiming
  else if (u.D.turret) ok = alrTurretTo(u, ang, dt);
  else {
    let da = ang - u.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    if (!keepMoving) u.yaw += alrClamp(da, -9 * dt, 9 * dt);
    ok = Math.abs(da) < 0.25;
    u.vx = u.vz = 0;
  }
  if (ok && u.cool <= 0) { u.cool = W.rof * ALR_RANK[u.rank || 0].rof * alrRnd(0.92, 1.08); alrFire(u, t, W); }
}
function alrAcquire(u, range, W) {
  let best = null, bd = 1e9;
  for (const e of alr.ents) {
    if (e.owner === u.owner || e.owner === alr.NEU || e.hp <= 0 || e.sell) continue;
    if (e.kind === 'bld' && e.D.wall) continue;                 // nobody shoots at walls on their own
    if (W && !alrCanHit(W, e)) continue;
    if (u.owner === 0 && !alr.players[0].shroud[alrTile(e.x, e.z)]) continue;
    const d = alrDistTo(u.x, u.z, e);
    if (d > range || (W && W.min && d < W.min)) continue;
    if (e.D.disguise && e.still > 1.2 && d > 1.5) continue;     // that's just a tree
    // shoot what shoots back first, buildings last
    const pr = d + (e.kind === 'bld' ? (e.D.weapon ? 1 : 6) : 0) + (e.D.harv ? 2 : 0);
    if (pr < bd) { bd = pr; best = e; }
  }
  return best;
}

// ---- the Nug Jet ---------------------------------------------------------------------------------------------
// The Harrier's job: parked on a pad, armed. Sent at a target it climbs out, makes ONE pass (two missiles) and
// flies home to land and rearm. It can't hover: told to go somewhere it goes, then comes back. With its command
// gone and no free pad anywhere, it goes down.
function alrJetStep(u, dt) {
  const D = u.D, W = ALR_WPN[D.weapon];
  let pad = u.pad && alr.byId.get(u.pad.b);
  if (u.pad && (!pad || pad.owner !== u.owner)) { u.pad = null; pad = null; }
  if (u.jet === 'pad') {
    if (!pad) { u.jet = 'home'; return; }
    const [px, pz] = alrPadPos(pad, u.pad.i);
    u.x = px; u.z = pz; u.alt = Math.max(0.12, u.alt - dt * 1.5); u.moving = false; u.bank = 0;
    if (u.ammo < D.ammo && (u.reload = (u.reload || 0) + dt) > 5) { u.ammo = D.ammo; u.reload = 0; }
    if (u.hp < u.max) u.hp = Math.min(u.max, u.hp + 15 * dt);      // the pad crew patches it up
    if (u.order && u.ammo > 0) { u.jet = 'out'; alrSfx('jet', u.x, u.z); }
    return;
  }
  u.alt += ((u.jet === 'land' ? 0.12 : D.alt) - u.alt) * Math.min(1, dt * 1.8);
  let gx = u.x + Math.sin(u.yaw) * 3, gz = u.z + Math.cos(u.yaw) * 3;
  const o = u.order;
  if (u.jet === 'out') {
    const t = o && o.type === 'attack' ? alr.byId.get(o.t) : null;
    if (o && o.type === 'attack' && !alrAlive(t)) { u.order = null; u.jet = 'home'; }
    else if (t) {
      gx = t.x; gz = t.z;
      const d = Math.hypot(t.x - u.x, t.z - u.z);
      let da = Math.atan2(t.x - u.x, t.z - u.z) - u.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (d < W.range && Math.abs(da) < 0.35 && u.ammo > 0) { alrFire(u, t, W); u.ammo = 0; u.order = null; u.jet = 'home'; }
    } else if (o && o.type === 'move') { gx = o.x; gz = o.z; if (Math.hypot(gx - u.x, gz - u.z) < 1) { u.order = null; u.jet = 'home'; } }
    else u.jet = 'home';
  }
  if (u.jet === 'home' || u.jet === 'land') {
    if (!pad) { const p = alrFreePad(u.owner, u); if (p) { u.pad = p; pad = alr.byId.get(p.b); } }
    if (!pad) { if ((u.lostT = (u.lostT || 0) + dt) > 5) { alrKill(u, null); return; } }
    else {
      [gx, gz] = alrPadPos(pad, u.pad.i);
      const d = Math.hypot(gx - u.x, gz - u.z);
      u.jet = d < 2.6 ? 'land' : 'home';
      if (d < 0.3) { u.jet = 'pad'; u.yaw = Math.PI; return; }
      if (u.order && u.ammo > 0) u.jet = 'out';
    }
  }
  // always flying forward, banking into the turn
  let da = Math.atan2(gx - u.x, gz - u.z) - u.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
  const near = Math.hypot(gx - u.x, gz - u.z), turn = u.jet === 'land' ? 4 : 2.6;
  u.yaw += alrClamp(da, -turn * dt, turn * dt);
  u.bank = (u.bank || 0) + (alrClamp(da * 1.2, -0.9, 0.9) - (u.bank || 0)) * Math.min(1, dt * 4);
  let sp = D.speed;
  if (u.jet === 'land') sp = alrClamp(near * 2.4 * Math.max(0.2, Math.cos(da)), 0.4, D.speed);
  u.x = alrClamp(u.x + Math.sin(u.yaw) * sp * dt, 0.5, ALR_N - 0.5); u.z = alrClamp(u.z + Math.cos(u.yaw) * sp * dt, 0.5, ALR_N - 0.5);
  u.moving = true;
}

// ---- the Fry Cook (engineer) ----------------------------------------------------------------------------------
// Walk into an enemy (or neutral) building and it's yours; into one of yours and it's repaired. Defenses and
// walls can't be taken (RA2's rule). The cook is spent either way.
function alrCanCapture(u, t) {
  if (!t || t.kind !== 'bld' || t.hp <= 0 || t.build < 1) return false;
  if (t.D.bhut) { const B = alr.M.bridges[t.bridgeIdx]; return !!(B && B.down); }   // into the hut: fix the bridge
  if (t.D.bridge) return false;
  if (t.owner === u.owner) return t.hp < t.max - 1;
  return !(t.D.cat === 'def' || t.D.wall || t.D.noCapture);
}
function alrEngineerStep(u, dt) {
  const o = u.order;
  u.moving = false;
  if (o && o.type === 'capture') {
    const t = alr.byId.get(o.t);
    if (!alrCanCapture(u, t)) { u.order = null; return; }
    if (alrDistTo(u.x, u.z, t) < 0.6) { alrCapture(u, t); return; }
    if (!u.path || (u.repathT -= dt) <= 0) { u.repathT = 1.5; u.path = alrPath(u.x, u.z, t.x, t.z, u); u.pi = 0; }
    u.moving = alrFollow(u, dt);
  } else if (o && o.type === 'move') {
    if (!u.path) { u.path = alrPath(u.x, u.z, o.x, o.z, u); u.pi = 0; }
    u.moving = alrFollow(u, dt);
    if (!u.path) u.order = null;
  }
  if (u.moving) u.walk += dt * u.D.speed * 7;
}
function alrCapture(u, t) {
  if (t.D.bhut) { const B = alr.M.bridges[t.bridgeIdx]; alrFxSpark(t.x, 0.6, t.z, 14); alrSfx('place', t.x, t.z); if (B && B.down) alrBridgeUp(B); alrRemove(u, false); return; }
  const was = t.owner;
  alrFxSpark(t.x, 0.6, t.z, 14);
  if (t.owner === u.owner) { t.hp = t.max; t.flash = 0.3; if (u.owner === 0) alrSay('BUILDING REPAIRED', '#9bff9b'); }
  else {
    t.owner = u.owner; t.repair = false; t.sell = 0; t.target = null; t.flash = 0.4;
    alr.sel = alr.sel.filter((s) => s !== t);
    if (t.D.tech) alr.players[u.owner].credits += t.D.cost;        // a derrick pays on the spot, then keeps paying
    if (u.owner === 0) { alr.stats.captured++; alrSay('BUILDING CAPTURED', '#9bff9b'); alrEarn(t.D.tech ? 6 : 10, ''); }
    if (was === 0) alrSay('OUR BUILDING HAS BEEN CAPTURED', '#ff6a5a');
    alrPowerAll();
  }
  alrSfx('place', t.x, t.z);
  alrRemove(u, false);
}

// ---- crates ---------------------------------------------------------------------------------------------------
// One shows up somewhere every minute or so (three at most); whoever drives over it gets money, a promotion,
// a heal, the map, or a free tank. (RA2's crates, the useful ones.)
function alrCrates(dt) {
  if ((alr.crateT -= dt) <= 0) {
    alr.crateT = 45 + Math.random() * 30;
    if (alr.crates.length < 3) for (let k = 0; k < 40; k++) {
      const x = 2 + Math.random() * (ALR_N - 4), z = 2 + Math.random() * (ALR_N - 4), q = alrTile(x, z);
      if (!alrPassable(q) || alr.M.ore[q] > 0 || alr.M.starts.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 10)) continue;
      alr.crates.push({ x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5, t: 0 });
      break;
    }
  }
  for (const c of alr.crates) c.t += dt;
  for (const c of alr.crates.slice()) {
    const u = alr.ents.find((e) => e.kind === 'unit' && e.owner !== alr.NEU && e.D.air !== 'jet' && !(e.D.air && e.alt > 1.2) && Math.hypot(e.x - c.x, e.z - c.z) < 0.5);
    if (u) alrCrate(u, c);
  }
}
function alrCrate(u, c) {
  alr.crates.splice(alr.crates.indexOf(c), 1);
  const P = alr.players[u.owner], r = Math.random();
  let msg;
  if (r < 0.4) { const v = 1000 + ((Math.random() * 10) | 0) * 100; P.credits += v; msg = '+$' + v; }
  else if (r < 0.6) { for (const e of alr.ents) if (e.kind === 'unit' && e.owner === u.owner && Math.hypot(e.x - c.x, e.z - c.z) < 3) alrPromote(e); msg = 'PROMOTION'; }
  else if (r < 0.75) { for (const e of alr.ents) if (e.owner === u.owner && e.kind === 'unit') e.hp = e.max; msg = 'FULL REPAIR'; }
  else if (r < 0.87 && P.human) { P.shroud.fill(255); alr.shroudDirty = true; msg = 'MAP REVEALED'; }
  else { alrSpawnUnit(P.side === 'F' ? 'heavy' : 'tank', u.owner, c.x, c.z); msg = 'FREE TANK'; }
  for (let k = 0; k < 3; k++) alrFxSpark(c.x, 0.3, c.z, 6);
  if (P.human) { alrFloatAt(c.x, c.z, msg, '#ffd23a'); alrSfx('cash', c.x, c.z); }
}

// THE SQUISH: a moving tank runs over the enemy soldiers it drives through (Chris: "make it so tanks will
// squish enemy infantry (but not your own)"). Your own soldiers get shoved aside by alrSeparate instead.
// (A Zap Nug's armor and a Jetpack Nug in the air are out of reach.)
function alrCrush() {
  for (const v of alr.ents) {
    if (v.kind !== 'unit' || !v.D.crush || !v.moving || v.hp <= 0) continue;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), half = v.D.r * 1.15, wide = v.D.r * 0.8;
    for (const s of alr.ents) {
      if (s.kind !== 'unit' || s.owner === v.owner || s.D.cat !== 'inf' || s.hp <= 0 || s.D.noCrush || s.D.air || s.owner === alr.NEU) continue;
      const dx = s.x - v.x, dz = s.z - v.z;
      if (Math.abs(dx) > 1 || Math.abs(dz) > 1) continue;
      // inside the hull's footprint (along the treads, not just a circle)
      const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
      if (Math.abs(along) > half || Math.abs(side) > wide) continue;
      s.crushed = true;
      alrKill(s, v);
      if (v.owner === 0) { alr.stats.crushed = (alr.stats.crushed || 0) + 1; alrFloatAt(s.x, s.z, 'SQUISHED!', '#ffd23a'); }
    }
  }
}

// soft separation: units don't stack (infantry can share a tile, vehicles can't; aircraft pass over everything)
function alrSeparate(dt) {
  const U = alr.ents.filter((e) => e.kind === 'unit' && !e.D.air && !e.deployed);
  // a tile grid, so each unit only looks at its neighbours (five armies on the big maps made every-pair too slow)
  const grid = new Map();
  for (const u of U) { const k = Math.floor(u.x) * 4096 + Math.floor(u.z); let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(u); }
  const pairs = [];
  for (const a of U) {
    const gx = Math.floor(a.x), gz = Math.floor(a.z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = grid.get((gx + dx) * 4096 + gz + dz); if (!c) continue;
      for (const b of c) if (b.id > a.id) pairs.push(a, b);
    }
  }
  for (let q = 0; q < pairs.length; q += 2) {
    const a = pairs[q], b = pairs[q + 1], dx = b.x - a.x, dz = b.z - a.z, rr = a.D.r + b.D.r;
    if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
    if (a.owner !== b.owner && ((a.D.crush && b.D.cat === 'inf' && !b.D.noCrush) || (b.D.crush && a.D.cat === 'inf' && !a.D.noCrush))) continue;
    const d = Math.hypot(dx, dz) || 0.01;
    if (d >= rr) continue;
    const push = (rr - d) * 0.5 * Math.min(1, dt * 8), nx = dx / d * push, nz = dz / d * push;
    const ma = a.moving ? 1 : 0.5, mb = b.moving ? 1 : 0.5;
    const ka = alrTile(a.x - nx * ma, a.z - nz * ma), kb = alrTile(b.x + nx * mb, b.z + nz * mb);
    if (alrPassable(ka, a)) { a.x -= nx * ma; a.z -= nz * ma; }
    if (alrPassable(kb, b)) { b.x += nx * mb; b.z += nz * mb; }
  }
}

// ---- the hauler: find ore, scoop it, bring it home, unload ----------------------------------------------------
function alrHarvStep(u, dt) {
  const M = alr.M, D = u.D, o = u.order;
  u.drum = (u.drum || 0) + dt * (u.hstate === 'dig' ? 9 : 0);
  if (o && o.type === 'move') {
    alrFollow(u, dt);
    if (!u.path) { u.order = null; }
    u.moving = !!u.path;
    return;
  }
  if (!o) u.order = { type: 'harvest' };
  const home = () => {
    // (sent to a particular refinery: that one, while it stands)
    const pick = u.homeB && alr.byId.get(u.homeB);
    if (pick && pick.owner === u.owner && pick.hp > 0 && pick.build >= 1) return pick;
    let best = null, bd = 1e9;
    for (const b of alrBldsOf(u.owner, 'refinery')) { const [dx, dz] = alrDock(b); const d = Math.hypot(dx - u.x, dz - u.z); if (d < bd) { bd = d; best = b; } }
    return best;
  };
  if (u.cargo >= D.cap - 1 && u.hstate !== 'home' && u.hstate !== 'unload') { u.hstate = 'home'; u.path = null; }
  if (!u.hstate) u.hstate = 'seek';
  // the stall watchdog: two haulers heading for neighbouring ore tiles shove each other (separation) and
  // neither ever reaches its tile centre — they sat nose to nose in 'seek' forever. Progress is measured,
  // not assumed: 1.5 s without moving while driving = dig where you are if it's ore, else pick elsewhere.
  if (u.hstate === 'seek' || u.hstate === 'home') {
    if (u.stallX == null || Math.hypot(u.x - u.stallX, u.z - u.stallZ) > 0.12) { u.stallX = u.x; u.stallZ = u.z; u.stallT = 0; }
    else u.stallT = (u.stallT || 0) + dt;
  } else u.stallT = 0;
  if (u.hstate === 'seek') {
    const here = alrTile(u.x, u.z);
    // ore is per tile: once on ore at the end of the route (or stalled on ore), dig — don't chase the centre
    if (M.ore[here] > 20 && (!u.path || u.path.length - (u.pi || 0) <= 1 || u.stallT > 1.5)) { u.path = null; u.oreTile = here; u.hstate = 'dig'; u.hT = 0; u.stallT = 0; return; }
    if (u.stallT > 1.5) { u.oreAt = null; u.path = null; u.stallT = 0; u.avoid = u.oreTile; }
    if (!u.path) {
      const k = alrFindOre(u.x, u.z, u.oreAt, null, u);
      if (k < 0) { if (u.cargo > 0) { u.hstate = 'home'; return; } u.moving = false; return; }
      u.oreTile = k; u.path = alrPath(u.x, u.z, k % ALR_N + 0.5, ((k / ALR_N) | 0) + 0.5, u); u.pi = 0;
      if (!u.path) { u.oreAt = null; u.moving = false; return; }
    }
    u.moving = alrFollow(u, dt);
    if (!u.path) { u.hstate = 'dig'; u.hT = 0; }
  } else if (u.hstate === 'dig') {
    u.moving = false;
    const k = alrTile(u.x, u.z);
    if (M.ore[k] <= 0) { const n = alrFindOre(u.x, u.z, null, 2.5, u); if (n < 0) { u.hstate = u.cargo > 0 ? 'home' : 'seek'; u.oreAt = null; return; } u.oreTile = n; u.path = alrPath(u.x, u.z, n % ALR_N + 0.5, ((n / ALR_N) | 0) + 0.5, u); u.pi = 0; u.hstate = 'seek'; return; }
    const gm = M.gem && M.gem[k] ? 2 : 1;                     // gems: twice the money a scoop
    const take = Math.min(M.ore[k], 110 * dt, (D.cap - u.cargo) / gm);
    M.ore[k] -= take; u.cargo += take * gm; M.oreVer++;
    if (gm > 1) u.gems = true;
    u.oreAt = [u.x, u.z];
    if ((u.hT += dt) > 0.25) { u.hT = 0; alrFxDust(u.x + Math.sin(u.yaw) * 0.45, u.z + Math.cos(u.yaw) * 0.45, true); }
    if (u.cargo >= D.cap - 1) { u.hstate = 'home'; u.path = null; }
  } else if (u.hstate === 'home') {
    const b = home();
    if (!b) { u.moving = false; return; }
    const [dx, dz] = alrDock(b);
    // the Chrono Hauler doesn't drive home: it blinks there
    if (u.D.chrono && Math.hypot(u.x - dx, u.z - dz) > 1) {
      alrFxChrono(u.x, u.z); u.x = dx; u.z = dz; u.path = null; alrFxChrono(dx, dz); alrSfx('chrono', dx, dz);
      u.hstate = 'unload'; u.hT = 0; u.dockB = b.id; return;
    }
    // one at a time at the dock: wait your turn nearby instead of shoving the one that's unloading
    if (Math.hypot(u.x - dx, u.z - dz) < 1.6 && alr.ents.some((e) => e !== u && e.D.harv && e.hstate === 'unload' && e.dockB === b.id)) { u.moving = false; u.stallT = 0; return; }
    if (!u.path || u.stallT > 1.5) { u.path = alrPath(u.x, u.z, dx, dz, u); u.pi = 0; u.stallT = 0; }
    u.moving = alrFollow(u, dt);
    if (Math.hypot(u.x - dx, u.z - dz) < 0.35) { u.hstate = 'unload'; u.hT = 0; u.path = null; u.dockB = b.id; }
    else if (!u.path) u.path = alrPath(u.x, u.z, dx, dz, u);
  } else if (u.hstate === 'unload') {
    u.moving = false;
    // back it in square to the bay
    let da = Math.PI - u.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    u.yaw += alrClamp(da, -2 * dt, 2 * dt);
    const pay = Math.min(u.cargo, 420 * dt);
    u.cargo -= pay;
    const P = alr.players[u.owner];
    P.credits += pay;
    if (P.human) { alr.stats.harvested += pay; P.cashFx = (P.cashFx || 0) + pay; }
    if (u.cargo <= 0.5) { u.cargo = 0; u.gems = false; u.hstate = 'seek'; u.path = null; if (P.human && P.cashFx > 0) { alrFloatAt(u.x, u.z, '+$' + Math.round(P.cashFx), '#ffd23a'); P.cashFx = 0; alrSfx('cash'); } }
  }
}
function alrFindOre(x, z, near, maxR, self) {
  const M = alr.M, N = ALR_N;
  let best = -1, bd = 1e9;
  const cx = near ? near[0] : x, cz = near ? near[1] : z;
  // the other haulers, gathered ONCE (the per-tile check below used to walk every unit on the map: on the
  // 128² map with five armies that was ~8 million checks a search)
  const hv = alr.ents.filter((e) => e.D.harv && e !== self && !(!self && Math.hypot(e.x - x, e.z - z) <= 0.1));
  for (let k = 0; k < N * N; k++) {
    if (M.ore[k] <= 20) continue;
    const d = Math.hypot(k % N + 0.5 - cx, ((k / N) | 0) + 0.5 - cz);
    if (maxR && d > maxR) continue;
    // take the near ones, and keep clear of the other haulers: a hauler is most of a tile wide, so a tile
    // NEXT to another hauler's target (or to where it sits) is as jammed as the same tile
    let pen = 0;
    const kx = k % N + 0.5, kz = ((k / N) | 0) + 0.5;
    for (const e of hv) {
      if (e.oreTile != null && Math.hypot((e.oreTile % N) + 0.5 - kx, ((e.oreTile / N) | 0) + 0.5 - kz) < 1.5) pen += 3;
      if (Math.hypot(e.x - kx, e.z - kz) < 1.1) pen += 2;
    }
    if (self && self.avoid === k) pen += 4;
    const dd = M.gem && M.gem[k] ? d * 0.5 : d;             // a gem tile pays double: worth twice the drive
    if (dd + pen < bd) { bd = dd + pen; best = k; }
  }
  return best;
}
// ore grows back slowly, toward what the field started with
function alrOreGrow(dt) {
  const M = alr.M;
  if (((alr.t * 0.5) | 0) === (((alr.t - dt) * 0.5) | 0)) return;
  for (let k = 0; k < M.ore.length; k++) if (M.oreMax[k] > 0 && M.ore[k] < M.oreMax[k]) { M.ore[k] = Math.min(M.oreMax[k], M.ore[k] + 6); }
  M.oreVer++;
}

// ---- buildings ------------------------------------------------------------------------------------------------
function alrBldStep(b, dt) {
  const P = alr.players[b.owner];
  if (b.flash > 0) b.flash -= dt;
  b.anim += dt;
  if (b.build < 1) { b.build = Math.min(1, b.build + dt / (b.D.wall ? 0.5 : 1.6)); if (b.build >= 1 && b.owner !== alr.NEU) alrPower(P); return; }
  if (b.sell) {
    b.sell += dt / 1.0;
    if (b.sell >= 2) { alrRemove(b, true); alrPower(P); }
    return;
  }
  if (b.door > 0) b.door -= dt;
  if (b.owner === alr.NEU) return;                              // a neutral derrick just stands there
  if (b.D.income) P.credits += b.D.income * dt;                  // a captured derrick pumps money
  if (b.repair && b.hp < b.max) {
    // RA2: repairing costs a share of the price spread over the hit points
    const cost = (b.D.cost || 1500) / b.max * 0.25 * 40 * dt;
    if (P.credits >= cost) { P.credits -= cost; b.hp = Math.min(b.max, b.hp + 40 * dt); if (Math.random() < dt * 6) alrFxSpark(b.x + alrRnd(-0.5, 0.5), 0.6, b.z + alrRnd(-0.5, 0.5)); }
    if (b.hp >= b.max) b.repair = false;
  }
  // the Dip & Fix: vehicles parked beside it get fixed (for money)
  if (b.type === 'depot') for (const u of alr.ents) {
    if (u.kind !== 'unit' || u.owner !== b.owner || u.D.cat !== 'veh' || u.D.air || u.moving || u.hp >= u.max) continue;
    if (alrDistTo(u.x, u.z, b) > 1.2) continue;
    const c = u.D.cost / u.max * 0.15 * 50 * dt;
    if (P.credits < c) continue;
    P.credits -= c; u.hp = Math.min(u.max, u.hp + 50 * dt);
    if (Math.random() < dt * 8) alrFxSpark(u.x, 0.4, u.z, 2);
  }
  const W = b.D.weapon && ALR_WPN[b.D.weapon];
  if (!W) return;
  if (b.cool > 0) b.cool -= dt;
  if (W.power && P.low) { b.target = null; return; }
  if (!alrAlive(b.target) || !alrCanHit(W, b.target) || alrDistTo(b.x, b.z, b.target) > W.range) {
    if ((b.acq = (b.acq || 0) - dt) <= 0) { b.acq = 0.3; b.target = alrAcquire({ x: b.x, z: b.z, owner: b.owner }, W.range, W); }
  }
  const t = b.target;
  if (!t) { if (b.type === 'tesla') b.charge = Math.max(0, b.charge - dt); return; }
  const ang = Math.atan2(t.x - b.x, t.z - b.z);
  let ok = true;
  if (ALR_HEADS[b.type]) { let da = ang - b.tYaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; b.tYaw += alrClamp(da, -3.5 * dt, 3.5 * dt); ok = Math.abs(da) < 0.12; }
  if (b.type === 'tesla' || b.type === 'prism') { b.charge = Math.min(1, b.charge + dt * 1.4); ok = b.charge >= 1; }
  if (ok && b.cool <= 0) { b.cool = W.rof; if (b.type === 'tesla' || b.type === 'prism') b.charge = 0.2; alrFire(b, t, W); }
}
// defenses whose head turns to aim (the rest fire from where they stand)
const ALR_HEADS = { turret: 1, sam: 1, flak: 1, bunker: 1 };

// ---- weapons ---------------------------------------------------------------------------------------------------
// where the shot leaves from: [forward, height] off the turret (or the body) for each unit; the buildings by type
const ALR_MUZ = { tank: [0.55, 0.4], heavy: [0.62, 0.47], ifv: [0.3, 0.42], prismtank: [0.18, 0.66], mirage: [0.5, 0.42], flaktrack: [0.32, 0.52],
  harvF: [0.3, 0.66], apoc: [0.78, 0.6], v3: [0.45, 0.6], inf: [0.27, 0.25], conscript: [0.27, 0.25], rocket: [0.25, 0.36], zapper: [0.2, 0.28], dog: [0.25, 0.12], jetpack: [0.22, 0.25] };
function alrMuzzle(e, side) {
  const s = side || 0;
  if (e.kind === 'bld') {
    if (e.type === 'tesla') return [e.x, 1.35, e.z];   // (a symmetric model: the 180° turn doesn't move it)
    if (e.type === 'prism') return [e.x, 1.55, e.z];
    const c = Math.cos(e.tYaw), sn = Math.sin(e.tYaw), L = e.type === 'sam' || e.type === 'flak' ? 0.3 : e.type === 'bunker' ? 0.35 : 0.6;
    return [e.x + sn * L + c * 0.08 * s, e.type === 'bunker' ? 0.22 : 0.48, e.z + c * L - sn * 0.08 * s];
  }
  if (e.D.air === 'jet') { const c = Math.cos(e.yaw), sn = Math.sin(e.yaw); return [e.x + c * 0.28 * s + sn * 0.1, e.alt - 0.08, e.z - sn * 0.28 * s + c * 0.1]; }   // under the wings
  if (e.D.air === 'blimp') { const c = Math.cos(e.yaw), sn = Math.sin(e.yaw); return [e.x + sn * 1.0, e.alt + 0.12, e.z + c * 1.0]; }   // the gravy-boat's spout
  const yaw = e.D.turret ? e.tYaw : e.yaw, c = Math.cos(yaw), sn = Math.sin(yaw), [L, H] = ALR_MUZ[e.type] || [0.3, 0.3];
  return [e.x + sn * L + c * 0.055 * s, H + (e.alt || 0), e.z + c * L - sn * 0.055 * s];
}
function alrAimPoint(t) {
  if (t.kind === 'bld') return [alrClamp(t.x, t.tx + 0.3, t.tx + t.w - 0.3), t.D.wall ? 0.25 : 0.5, alrClamp(t.z, t.tz + 0.3, t.tz + t.h - 0.3)];
  return [t.x, (t.alt || 0) + (t.D.cat === 'inf' ? 0.22 : 0.3), t.z];
}
function alrFire(e, t, W) {
  if (e.kind === 'unit') e.still = 0;
  // the prism towers around this one lend it their light (RA2: each relaying tower +50%, here up to 4)
  let mul = 1;
  if (W.relay) {
    let n = 0;
    for (const b of alr.ents) {
      if (n >= 4 || b === e || b.kind !== 'bld' || b.type !== e.type || b.owner !== e.owner || b.build < 1 || b.cool > 0 || Math.hypot(b.x - e.x, b.z - e.z) > 6) continue;
      b.cool = W.rof; b.charge = 0.2; mul += 0.5; n++;
      alrFxPrism([b.x, 1.55, b.z], [e.x, 1.55, e.z], 0.55);
    }
  }
  const shots = W.twin ? [-1, 1] : [0];
  shots.forEach((s, i) => {
    const m = alrMuzzle(e, s), a = alrAimPoint(t);
    a[0] += alrRnd(-0.12, 0.12); a[2] += alrRnd(-0.12, 0.12);
    const go = () => {
      if (!alr.byId.has(e.id)) return;
      if (W.kind === 'bullet') { alrHit(t, W, e, mul); alrFxTracer(m, a); alrFxMuzzle(m, 0.18); }
      else if (W.kind === 'melee') { e.leap = 0.3; alrHit(t, W, e, mul); }
      else if (W.kind === 'zap') { alrHit(t, W, e, mul); alrFxZap(m, a); }
      else if (W.kind === 'grease') {
        // boiling grease: a spray at the target, and everyone of theirs standing in it gets a coat
        alrHit(t, W, e, mul);
        for (const q of alr.ents.slice()) if (q !== t && q.owner !== e.owner && q.owner !== alr.NEU && q.hp > 0 && !alrAirborne(q) && alrDistTo(t.x, t.z, q) < W.splash) alrHit(q, W, e, 0.6 * mul);
        if (typeof alrFxGrease === 'function') alrFxGrease(m, a, W.splash);
      } else if (W.kind === 'kaboom') {
        // the Fry Bomber: there's no second shot
        const bx = e.x, bz = e.z;
        alrHit(t, W, e, mul);
        for (const q of alr.ents.slice()) if (q !== t && q !== e && q.owner !== e.owner && q.owner !== alr.NEU && q.hp > 0 && !alrAirborne(q) && alrDistTo(bx, bz, q) < W.splash) alrHit(q, W, e, 0.6 * mul);
        alrFxBoom(bx, 0.3, bz, 1.6);
        if (alr.byId.has(e.id)) { e.hp = 0; alrKill(e, null); }
      }
      else if (W.kind === 'flak') { alrHit(t, W, e, mul); alrFxTracer(m, a); alrFxFlak(a); alrFxMuzzle(m, 0.25); }
      else if (W.kind === 'beam') {
        alrHit(t, W, e, mul); alrFxPrism(m, a, 1 + (mul - 1) * 0.4);
        // the Prism Fry's beam jumps to whoever is standing near (half strength each jump)
        if (W.bounce) {
          let cur = t; const hit = [t];
          for (let k = 0; k < W.bounce; k++) {
            let nb = null, nd = 2.2;
            for (const q of alr.ents) if (q.owner !== e.owner && q.owner !== alr.NEU && !hit.includes(q) && q.hp > 0 && alrCanHit(W, q) && !(q.kind === 'bld' && q.D.wall)) { const d = Math.hypot(q.x - cur.x, q.z - cur.z); if (d < nd) { nd = d; nb = q; } }
            if (!nb) break;
            alrFxPrism(alrAimPoint(cur), alrAimPoint(nb), 0.6); alrHit(nb, W, e, 0.5); hit.push(nb); cur = nb;
          }
        }
      } else {
        const L = Math.hypot(a[0] - m[0], a[2] - m[2]);
        const drop = W.kind === 'bomb' || W.kind === 'gravy';
        const T = drop ? 0.45 + m[1] * 0.12 : L / W.speed;
        alr.shots.push({ kind: W.kind, x: m[0], y: m[1], z: m[2], a: m.slice(), b: drop ? [t.x, 0.05, t.z] : a, t: 0, T, tid: t.id, W, from: e.id, owner: e.owner, mul });
        if (W.kind === 'gravy') { e.pourAt = alr.t; e.pourTo = [t.x, t.z]; e.pourT = T + 1.0; }   // the stream the UI draws
        if (!drop) alrFxMuzzle(m, W.kind === 'rocket' || W.kind === 'v3' ? 0.25 : 0.4);
      }
      alrSfx(W.sfx, e.x, e.z);
    };
    if (i === 0) go(); else alr.later = (alr.later || []).concat([{ t: alr.t + 0.12, fn: go }]);
  });
  e.recoil = 1;
}
function alrShotsStep(dt) {
  if (alr.later) { const now = alr.t, due = alr.later.filter((l) => l.t <= now); alr.later = alr.later.filter((l) => l.t > now); for (const l of due) l.fn(); }
  for (const s of alr.shots) {
    s.t += dt;
    const u = Math.min(1, s.t / s.T);
    // a rocket lofts a little, a V3 goes way up and comes down on it, a bomb just falls
    const arc = s.W && s.W.lob ? Math.sin(u * Math.PI) * s.W.lob : s.kind === 'v3' ? Math.sin(u * Math.PI) * 3.2 : s.kind === 'rocket' ? Math.sin(u * Math.PI) * 0.35 : s.kind === 'bomb' ? 0 : Math.sin(u * Math.PI) * 0.12;
    const uu = s.kind === 'bomb' || s.kind === 'gravy' ? u * u : u;
    s.px = s.x; s.py = s.y; s.pz = s.z;
    s.x = s.a[0] + (s.b[0] - s.a[0]) * uu; s.z = s.a[2] + (s.b[2] - s.a[2]) * uu; s.y = s.a[1] + (s.b[1] - s.a[1]) * uu + arc;
    if ((s.kind === 'rocket' || s.kind === 'v3') && Math.random() < dt * (s.kind === 'v3' ? 70 : 40)) alrFxSmoke(s.x, s.y, s.z, s.kind === 'v3' ? 0.3 : 0.18, s.kind === 'v3' ? 1.6 : 0.9);
    if (u >= 1) {
      s.done = true;
      const t = alr.byId.get(s.tid), from = alr.byId.get(s.from) || { owner: s.owner, id: s.from };
      if (alrAlive(t) && alrDistTo(s.x, s.z, t) < 0.8 + (s.W.splash ? 0.4 : 0)) alrHit(t, s.W, from, s.mul);
      // splash: everything else of theirs near the blast takes half
      if (s.W.splash) for (const q of alr.ents.slice()) if (q !== t && q.owner !== s.owner && q.owner !== alr.NEU && q.hp > 0 && !alrAirborne(q) && alrDistTo(s.x, s.z, q) < s.W.splash) alrHit(q, s.W, from, 0.5 * s.mul);
      if (s.kind === 'gravy') alrGravyLand(s.x, s.z, s.owner, s.from);
      else if (s.kind === 'v3' || s.kind === 'bomb' || (s.W && s.W.lob)) alrFxBoom(s.x, 0.2, s.z, s.kind === 'bomb' ? 1.1 : 0.9);
      else if (alrAirborne(t || {})) alrFxFlak([s.x, s.y, s.z]);
      else alrFxBlast(s.x, s.y, s.z, s.kind === 'rocket' ? 0.55 : 0.45);
    }
  }
  alr.shots = alr.shots.filter((s) => !s.done);
  alrPoolsStep(dt);
}
// ---- the gravy: a pool where the pour lands, spreading, scalding enemy infantry in it, then draining ----------
function alrGravyLand(x, z, owner, fromId) {
  alr.pools = alr.pools || [];
  const near = alr.pools.find((p) => Math.hypot(p.x - x, p.z - z) < 0.55);
  if (near) { near.t = Math.min(near.t, 0.6); near.T = Math.max(near.T, 11); near.big = Math.min(1.5, (near.big || 1) + 0.15); }
  else alr.pools.push({ x, z, t: 0, T: 11, owner, from: fromId, yaw: Math.random() * 6.28, big: 0.9 + Math.random() * 0.2 });
  if (typeof alrFxGravy === 'function') alrFxGravy(x, z);
  alrSfx('splat', x, z);
}
function alrPoolR(p) { return 0.85 * (p.big || 1) * Math.min(1, p.t / 0.6) * Math.min(1, Math.max(0, (p.T - p.t) / 3)); }
function alrPoolsStep(dt) {
  if (!alr.pools || !alr.pools.length) return;
  for (const p of alr.pools) {
    p.t += dt;
    const r = alrPoolR(p);
    if (r < 0.15) continue;
    const from = alr.byId.get(p.from) || { owner: p.owner, id: p.from };
    for (const q of alr.ents.slice()) if (q.kind === 'unit' && q.D.cat === 'inf' && q.owner !== p.owner && q.owner !== alr.NEU && q.hp > 0 && !alrAirborne(q) && Math.hypot(q.x - p.x, q.z - p.z) < r) { q.inGravy = 0.3; alrHit(q, ALR_WPN.gravyPool, from, dt); }
  }
  alr.pools = alr.pools.filter((p) => p.t < p.T);
}
function alrHit(t, W, from, mul) {
  if (!alrAlive(t)) return;
  if (t.kind === 'bld' && (t.D.wall || t.D.bridge) && !ALR_WALL_KINDS[W.kind]) return;
  if (t.kind === 'bld' && t.D.bhut) return;
  const armor = alrArmor(t), v = W.vs[armor] == null ? (armor === 'air' ? 0 : 1) : W.vs[armor];
  const fr = from && from.kind === 'unit' ? ALR_RANK[from.rank || 0].dmg : 1, tr = t.kind === 'unit' ? ALR_RANK[t.rank || 0].armor : 1;
  t.hp -= W.dmg * v * (mul || 1) * fr * tr;
  t.flash = 0.08; t.lastHit = alr.t;
  if (t.owner === alr.NEU) { if (t.hp <= 0) alrKill(t, from); return; }
  // force-fire on your own (Ctrl+click): it hurts, but no alarm, no hitting back
  if (from && from.owner === t.owner) { if (t.hp <= 0) alrKill(t, from, W); return; }
  const P = alr.players[t.owner];
  if (P.underAttack <= 0 && t.owner === 0) { alrSay(t.kind === 'bld' ? 'OUR BASE IS UNDER ATTACK' : t.D.harv ? 'HARVESTER UNDER ATTACK' : 'UNIT UNDER ATTACK', '#ff6a5a'); alrSfx('alarm'); alr.lastAlarm = [t.x, t.z]; }
  alrMusicFight(t.x, t.z);
  P.underAttack = 8; P.attackedAt = [t.x, t.z]; P.attacker = from && from.id;
  // hit back: an idle unit that's shot at goes for the shooter (if it can reach it)
  const sh = from && from.id && alr.byId.get(from.id);
  if (t.kind === 'unit' && t.D.weapon && !t.order && alrAlive(sh) && alrCanHit(alrW(t), sh)) t.target = sh;
  if (t.hp <= 0) alrKill(t, from, W);
}
function alrKill(t, from, W) {
  const killer = from ? from.owner : -1;
  // experience: the killer banks what the victim cost
  const k = from && from.id && alr.byId.get(from.id);
  if (k && k.kind === 'unit' && k.owner !== t.owner) {
    k.xp = (k.xp || 0) + (t.D.cost || 500);
    const need = 3 * Math.max(300, k.D.cost);
    if (k.rank < 2 && k.xp >= need * (k.rank + 1)) alrPromote(k);
  }
  if (t.kind === 'bld' && t.D.bridge) { alrBridgeDown(t); return; }
  if (t.kind === 'unit') {
    // scalded by the gravy: a scream (three takes), and the nugget goes under in a gravy splat
    const gravied = t.D.cat === 'inf' && W && W.gravy;
    if (gravied) { alrSfx('scream' + (1 + ((Math.random() * 3) | 0)), t.x, t.z); if (typeof alrFxGravyDeath === 'function') alrFxGravyDeath(t.x, t.z); }
    else if (t.D.cat === 'inf') { alrFxCrumbs(t.x, t.z); if (t.crushed) alrFxSquish(t.x, t.z); }
    else { alrFxBoom(t.x, 0.3 + (t.alt || 0), t.z, t.type === 'blimp' ? 2.4 : 1); if (!t.D.air && !t.sunk) alr.decor.push({ kind: 'wreck', type: t.type, D: t.D, cargo: 0, x: t.x, z: t.z, yaw: t.yaw, tYaw: t.tYaw, t: 0, T: 9, owner: t.owner, alt: 0, rank: 0 }); }
    // a blimp coming down lands on whoever is under it
    if (t.type === 'blimp') for (const q of alr.ents.slice()) if (q !== t && q.hp > 0 && !alrAirborne(q) && alrDistTo(t.x, t.z, q) < 1.3) alrHit(q, ALR_WPN.bomb, from, 0.6);
    if (!gravied) alrSfx(t.D.cat === 'inf' ? 'squish' : 'boomL', t.x, t.z);
    if (killer === 0 && t.owner !== 0 && t.owner !== alr.NEU) { alr.stats.kills++; alrEarn(t.D.cat === 'inf' ? 2 : t.D.air ? 8 : 5, ''); }
    if (t.owner === 0) { alr.stats.lost++; alrSay('UNIT LOST', '#ff8a7a'); }
    if (t.load && t.load.length) { if (t.owner === 0) alr.stats.lost += t.load.length; t.load = []; }   // (RA2: nobody gets out of a downed transport)
  } else {
    alrFxBoom(t.x, 0.4, t.z, t.D.wall ? 0.6 : 1.6 + t.w * 0.25);
    if (!t.D.wall) { alr.decor.push({ kind: 'chain', x: t.x, z: t.z, w: t.w, h: t.h, t: 0, T: 1.4 }); alr.decor.push({ kind: 'rubble', x: t.x, z: t.z, w: t.w, h: t.h, t: 0, T: 1e9 }); }
    alrSfx('boomL', t.x, t.z);
    if (killer === 0 && t.owner === 1 && !t.D.wall) { alrEarn(12, t.D.name + ' DESTROYED'); alrEva('ENEMY BUILDING DESTROYED'); }
    if (t.owner === 0 && !t.D.wall) alrSay('BUILDING LOST', '#ff6a5a');
  }
  alrRemove(t, false);
  if (t.owner !== alr.NEU) alrPower(alr.players[t.owner]);
}
function alrRemove(e, sold) {
  alr.byId.delete(e.id);
  const i = alr.ents.indexOf(e); if (i >= 0) alr.ents.splice(i, 1);
  if (e.kind === 'bld') {
    for (let j = 0; j < e.h; j++) for (let k = 0; k < e.w; k++) { const q = (e.tz + j) * ALR_N + e.tx + k; if (alr.M.bld[q] === e.id) alr.M.bld[q] = 0; }
    // a sold building pops out its crew: the side's basic soldier
    if (sold && !e.D.wall && e.owner !== alr.NEU) { const P = alr.players[e.owner]; for (let k = 0; k < 3; k++) alrSpawnUnit(P.side === 'F' ? 'conscript' : 'inf', e.owner, e.x + alrRnd(-0.5, 0.5), e.tz - 0.35); }
  }
  alr.sel = alr.sel.filter((s) => s !== e);
  for (const g of Object.keys(alr.groups)) alr.groups[g] = alr.groups[g].filter((id) => id !== e.id);
}

// ---- the shroud ------------------------------------------------------------------------------------------------
function alrReveal(P, x, z, r) {
  const N = ALR_N, S = P.shroud;
  for (let j = Math.max(0, Math.floor(z - r - 1)); j <= Math.min(N - 1, Math.ceil(z + r + 1)); j++)
    for (let i = Math.max(0, Math.floor(x - r - 1)); i <= Math.min(N - 1, Math.ceil(x + r + 1)); i++) {
      const d = Math.hypot(i + 0.5 - x, j + 0.5 - z), v = alrClamp((r + 0.8 - d) * 200, 0, 255) | 0;
      const k = j * N + i;
      if (v > S[k]) { S[k] = v; alr.shroudDirty = true; }
    }
}
function alrRevealAll() { const P = alr.players[0]; for (const e of alr.ents) if (e.owner === 0) alrReveal(P, e.x, e.z, e.sight || e.D.sight || 5); }

// ---- the end --------------------------------------------------------------------------------------------------
function alrCheckEnd() {
  if (alr.result) return;
  for (const P of alr.players) {
    if (P.neutral || P.lost) continue;
    // beaten: no building left that counts (walls and derricks don't) and nothing left that can shoot
    const alive = alr.ents.some((e) => e.owner === P.id && (e.kind === 'bld' ? !e.D.wall && !e.D.tech : !!e.D.weapon));
    if (!alive) {
      P.lost = true;
      // what's left of theirs (walls, the odd hauler) goes quiet; a rival is announced as gone
      if (P.id !== 0) { alrSay(P.team.name + ' DEFEATED', '#9bff9b'); alrSfx('ready'); }
    }
  }
  // free-for-all: you win when every CPU is gone, you lose when you are
  const you = alr.players[0], rivals = alr.players.filter((P) => !P.neutral && P.id !== 0);
  if (you.lost || rivals.every((P) => P.lost)) {
    const won = !you.lost;
    alr.result = { won, t: alr.t };
    if (won) {
      alrEarn(200 * (1 + 0.5 * (rivals.length - 1)), 'VICTORY');
      if (alr.cfg.key === 'pro') { try { localStorage.setItem('nugAlertPro', '1'); } catch (e) { } }
      if (alr.cfg.key === 'allout') { try { localStorage.setItem('nugAlertChamp', '1'); } catch (e) { } }
    }
    try { ArcadeKit.saveBest('alert', alr.cfg.key, alr.earned); } catch (e) { }
    alr.phase = 'over';
    alrSfx(won ? 'win' : 'lose');
    alrSay(won ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED', won ? '#9bff9b' : '#ff6a5a');
    alrUIEnd();
  }
}

// ---- the CPU commander --------------------------------------------------------------------------------------------
// A build order per army (an RA2 opener, then tech, then more of everything), defenses toward the enemy (anti-air
// once they fly), haulers per refinery, a weighted mix of each army's units, cooks sent at the oil derricks, jet
// strikes on haulers and power, an army that gathers and goes in waves that grow, and a recall when its base is hit.
const ALR_AI_ORDER = {
  A: ['power', 'refinery', 'barracks', 'power', 'factory', 'airhq', 'refinery', 'power', 'depot', 'labA', 'power', 'factory', 'power', 'barracks', 'power', 'power'],
  F: ['powerF', 'refinery', 'barracks', 'powerF', 'factory', 'radar', 'refinery', 'powerF', 'depot', 'labF', 'powerF', 'factory', 'powerF', 'barracks', 'powerF', 'powerF'],
};
const ALR_AI_DEF = { A: { ground: ['bunker', 'prism'], air: 'sam' }, F: { ground: ['turret', 'tesla'], air: 'flak' } };
// (the factions' own are in the lists too: alrAIPick skips what this CPU's faction can't build)
const ALR_AI_INF = { A: [['inf', 6], ['dog', 1], ['jetpack', 2], ['sniper', 2]], F: [['conscript', 5], ['zapper', 2], ['rocket', 2], ['dog', 1], ['greaser', 3], ['bomber', 2]] };
const ALR_AI_VEH = { A: [['tank', 5], ['ifv', 2], ['prismtank', 3], ['mirage', 2]], F: [['heavy', 5], ['flaktrack', 2], ['v3', 2], ['apoc', 3], ['teslaspud', 4]] };
function alrAINew(id) { return { step: 0, think: 0, waveT: null, wave: 0, rally: null, army: [], lastAttack: -999, jetT: 70 }; }
// a weighted pick of what it can build right now (anti-air counts triple once the enemy flies)
function alrAIPick(P, list, enemyAir) {
  const ok = list.filter(([t]) => alrCanBuild(P, t));
  if (!ok.length) return null;
  const w = ok.map(([t, n]) => n * (enemyAir && (ALR_WPN[ALR_UNIT[t].weapon] || {}).air ? 3 : 1));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ok.length; i++) { r -= w[i]; if (r <= 0) return ok[i][0]; }
  return ok[0][0];
}
// free-for-all: who this CPU is fighting — the nearest rival still standing, looked at again every couple of
// minutes (or the moment that rival falls), so the map doesn't all pile onto one player
function alrAIEnemy(P, hq) {
  const A = P.ai, cur = A.enemy != null && alr.players[A.enemy];
  if (cur && !cur.lost && alr.t < (A.enemyT || 0)) return A.enemy;
  let best = null, bd = 1e9;
  for (const Q of alr.players) {
    if (Q === P || Q.neutral || Q.lost) continue;
    const q = alrBldsOf(Q.id, 'hq')[0] || alr.ents.find((e) => e.owner === Q.id && e.kind === 'bld');
    const [qx, qz] = q ? [q.x, q.z] : alr.M.starts[Q.start];
    const d = Math.hypot(qx - hq.x, qz - hq.z) * (0.85 + Math.random() * 0.3);
    if (d < bd) { bd = d; best = Q.id; }
  }
  if (best !== A.enemy) A.rally = null;
  A.enemy = best; A.enemyT = alr.t + 120 + Math.random() * 60;
  return best;
}
function alrRival(o) { const P = alr.players[o]; return P && !P.neutral; }
function alrAIStep(P, dt) {
  const A = P.ai;
  if ((A.think -= dt) > 0) return;
  A.think = 0.5;
  const me = P.id, cfg = alr.cfg, side = P.side;
  if (A.waveT == null) A.waveT = cfg.firstWave * (0.9 + Math.random() * 0.25);
  if (cfg.bonus) P.credits += cfg.bonus * 0.5 * 4;
  const hq = alrBldsOf(me, 'hq')[0];
  if (!hq) return;
  const enemy = alrAIEnemy(P, hq);
  if (enemy == null) return;
  const enemyAir = alr.ents.some((e) => e.owner !== me && alrRival(e.owner) && (e.kind === 'unit' ? !!e.D.air : e.type === 'airhq'));
  // the gems: with two haulers or more, one of them works the nearest gem field while it lasts
  if ((A.gemT = (A.gemT || 0) - 0.5) <= 0) {
    A.gemT = 25;
    const hv = alr.ents.filter((e) => e.owner === me && e.D.harv && !e.D.air);
    const onGems = hv.some((e) => e.oreAt && alr.M.gem[alrTile(e.oreAt[0], e.oreAt[1])]);
    if (hv.length >= 2 && !onGems && alr.M.gem) {
      let gk = -1, gd = 40;
      for (let k = 0; k < alr.M.gem.length; k++) if (alr.M.gem[k] && alr.M.ore[k] > 20) { const d = Math.hypot(k % ALR_N + 0.5 - hq.x, ((k / ALR_N) | 0) + 0.5 - hq.z); if (d < gd) { gd = d; gk = k; } }
      if (gk >= 0) { const u = hv.sort((a, b) => a.cargo - b.cargo)[0]; u.oreAt = [gk % ALR_N + 0.5, ((gk / ALR_N) | 0) + 0.5]; if (u.hstate === 'seek' || u.hstate === 'dig') { u.hstate = 'seek'; u.path = null; } }
    }
  }
  // the Sky Drop: onto trouble at home, else onto the rival's outskirts (short of its yard: defenses)
  if (alrPowerReady(P)) {
    if (P.underAttack > 0 && P.attackedAt) alrSkyDrop(P, P.attackedAt[0], P.attackedAt[1]);
    else { const eq = alrBldsOf(enemy, 'hq')[0]; if (eq) { const dx = hq.x - eq.x, dz = hq.z - eq.z, L = Math.hypot(dx, dz) || 1; alrSkyDrop(P, eq.x + dx / L * 9, eq.z + dz / L * 9); } }
  }
  // 1) the build order (it skips what it can't build yet, and rebuilds what it lost)
  if (!P.q.bld.length && !P.ready.bld) {
    const have = {}; for (const e of alr.ents) if (e.kind === 'bld' && e.owner === me) have[e.type] = (have[e.type] || 0) + 1;
    const want = {}; let next = null;
    for (const t of ALR_AI_ORDER[side]) {
      want[t] = (want[t] || 0) + 1;
      if ((have[t] || 0) < want[t]) { next = t; break; }
    }
    const pw = side === 'F' ? 'powerF' : 'power';
    if (P.low && next !== pw) next = pw;
    if (next && alrCanBuild(P, next) && P.credits > ALR_BLD[next].cost * 0.3) alrQueue(P, next);
  }
  if (!P.q.def.length && !P.ready.def) {
    const defs = alr.ents.filter((e) => e.kind === 'bld' && e.owner === me && e.D.cat === 'def' && !e.D.wall);
    const aa = defs.filter((e) => e.type === ALR_AI_DEF[side].air).length;
    const goal = Math.min(7, 1 + Math.floor(alr.t / 110));
    if (defs.length < goal && P.credits > 900) {
      let t;
      if (alrCanBuild(P, 'grandfryer') && defs.filter((e) => e.type === 'grandfryer').length < 1 + Math.floor(alr.t / 420) && defs.length >= 1) t = 'grandfryer';   // the Golden Coast's big guns
      else if (enemyAir && aa < 2 + Math.floor(defs.length / 3)) t = ALR_AI_DEF[side].air;
      else { const g = ALR_AI_DEF[side].ground; t = alrCanBuild(P, g[1]) && defs.length % 2 ? g[1] : g[0]; }
      if (alrCanBuild(P, t)) alrQueue(P, t);
    }
  }
  for (const cat of ['bld', 'def']) if (P.ready[cat]) { const spot = alrAISpot(P, P.ready[cat], hq); if (spot) alrPlace(P, P.ready[cat], spot[0], spot[1]); else if (Math.random() < 0.05) alrUnqueue(P, P.ready[cat]); }
  // 2) the factories: haulers first, a cook for every derrick still neutral, then the mix
  const mine = alr.ents.filter((e) => e.kind === 'unit' && e.owner === me);
  const hv = ALR_SIDES[side].harv;
  const harvs = mine.filter((e) => e.D.harv).length, refs = alrBldsOf(me, 'refinery').length;
  const queued = (q, t) => q.filter((x) => x.type === t).length;
  if (alrCanBuild(P, hv) && harvs + queued(P.q.veh, hv) < Math.min(refs * 1.5 + 0.5, 4) && P.credits > 800) alrQueue(P, hv);
  // (a downed bridge's repair hut counts as a job for a cook, like a neutral derrick)
  const neutral = alr.ents.filter((e) => e.kind === 'bld' && e.owner === alr.NEU && (e.D.tech || (e.D.bhut && alr.M.bridges[e.bridgeIdx] && alr.M.bridges[e.bridgeIdx].down)));
  const cooks = mine.filter((e) => e.D.engineer).length + queued(P.q.inf, 'engineer');
  if (neutral.length && cooks < Math.min(2, neutral.length) && alrCanBuild(P, 'engineer') && P.credits > 700) alrQueue(P, 'engineer');
  // (production pays as it goes, so the queues just stay topped up; nothing has to be saved for first)
  if (P.q.inf.length < 2) { const t = alrAIPick(P, ALR_AI_INF[side], enemyAir); if (t) alrQueue(P, t); }
  if (P.q.veh.filter((q) => !ALR_UNIT[q.type].harv).length < 2) {
    let t = alrAIPick(P, ALR_AI_VEH[side], enemyAir);
    if (side === 'A' && alrCanBuild(P, 'jet') && Math.random() < 0.35) t = 'jet';
    if (side === 'F' && alrCanBuild(P, 'blimp') && mine.filter((e) => e.type === 'blimp').length + queued(P.q.veh, 'blimp') < 2 && Math.random() < 0.25) t = 'blimp';
    if (t) alrQueue(P, t);
  }
  // 3) cooks go for the nearest neutral derrick
  for (const u of mine) if (u.D.engineer && !u.order) {
    let best = null, bd = 1e9;
    for (const b of neutral) { const d = Math.hypot(b.x - u.x, b.z - u.z) + alr.ents.filter((c) => c.D.engineer && c.owner === me && c.order && c.order.t === b.id).length * 30; if (d < bd) { bd = d; best = b; } }
    if (best) alrOrderAttack(u, best);
  }
  // 4) jet strikes: every minute or so, the armed ones go for a hauler, a power plant or a factory
  if ((A.jetT -= 0.5) <= 0) {
    A.jetT = 45 + Math.random() * 30;
    const jets = mine.filter((u) => u.D.air === 'jet' && u.jet === 'pad' && u.ammo > 0);
    if (jets.length >= 2) {
      const tg = alr.ents.filter((e) => e.owner === enemy && (e.D.harv || e.D.role === 'power' || e.type === 'factory' || e.type === 'refinery'));
      const t = tg.length ? alrPick(tg) : null;
      if (t) for (const j of jets) alrOrderAttack(j, t);
    }
  }
  // 5) the army
  const army = mine.filter((e) => e.D.weapon && !e.D.harv && e.D.air !== 'jet');
  if (!A.rally) { const [ex, ez] = alr.M.starts[alr.players[enemy].start], d = Math.hypot(ex - hq.x, ez - hq.z) || 1; A.rally = [hq.x + (ex - hq.x) / d * 7, hq.z + (ez - hq.z) / d * 7]; }
  // defend: the base is hit — everybody home
  if (P.underAttack > 0 && P.attackedAt && Math.hypot(P.attackedAt[0] - hq.x, P.attackedAt[1] - hq.z) < 14) {
    for (const u of army) if (!u.order || u.order.type !== 'attack' || Math.random() < 0.1) { if (Math.hypot(u.x - hq.x, u.z - hq.z) < 22) alrOrderMove(u, P.attackedAt[0] + alrRnd(-1, 1), P.attackedAt[1] + alrRnd(-1, 1), true); }
    return;
  }
  A.waveT -= 0.5;
  const size = Math.round(alrRnd(cfg.wave[0], cfg.wave[1]) + A.wave * 2);
  const home = army.filter((u) => !u.order || (u.order.type === 'move' && !u.order.am));
  if (A.waveT <= 0 && home.length >= Math.min(size, 6 + A.wave * 2)) {
    // go: at the nearest thing they own (the refinery if it's in reach)
    let tgt = null, bd = 1e9;
    for (const e of alr.ents) if (e.owner === enemy && e.kind === 'bld' && !e.D.wall) { const d = Math.hypot(e.x - A.rally[0], e.z - A.rally[1]) - (e.type === 'refinery' ? 6 : 0); if (d < bd) { bd = d; tgt = e; } }
    if (!tgt) tgt = alr.ents.find((e) => e.owner === enemy);
    if (tgt) { alrGroupMove(home, tgt.x, tgt.z, true); A.wave++; A.waveT = 70 + Math.random() * 40; A.lastAttack = alr.t; }
  } else {
    // idle soldiers stand at the rally point
    for (const u of army) if (!u.order && !u.target && Math.hypot(u.x - A.rally[0], u.z - A.rally[1]) > 4) alrOrderMove(u, A.rally[0] + alrRnd(-2, 2), A.rally[1] + alrRnd(-2, 2), false);
  }
  // an attack that arrived and found nothing: keep pushing to the next building
  for (const u of army) if (u.order && u.order.am && !u.path && !u.target) {
    let tgt = null, bd = 1e9;
    for (const e of alr.ents) if (e.owner === enemy && e.kind === 'bld' && !e.D.wall) { const d = Math.hypot(e.x - u.x, e.z - u.z); if (d < bd) { bd = d; tgt = e; } }
    if (tgt) alrOrderMove(u, tgt.x, tgt.z, true);
  }
}
// where to put a building: a spiral out from the yard, a gap of one tile kept clear, defenses toward the enemy
function alrAISpot(P, type, hq) {
  // (defenses face the nearest rival's start)
  let enemy = null, ed = 1e9;
  for (const Q of alr.players) if (Q !== P && !Q.neutral && !Q.lost) { const st = alr.M.starts[Q.start], d = Math.hypot(st[0] - hq.x, st[1] - hq.z); if (d < ed) { ed = d; enemy = st; } }
  enemy = enemy || [ALR_N / 2, ALR_N / 2];
  const D = ALR_BLD[type];
  const def = D.cat === 'def';
  let best = null, bs = 1e9;
  for (let r = 2; r < 13; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const tx = hq.tx + dx, tz = hq.tz + dz;
    if (!alrCanPlace(P, type, tx, tz)) continue;
    // keep a lane: no other building touching (except defenses)
    let touch = false;
    if (!def) for (let j = -1; j <= D.h && !touch; j++) for (let i = -1; i <= D.w; i++) { const x = tx + i, z = tz + j; if (alrIn(x, z) && alr.M.bld[z * ALR_N + x]) { touch = true; break; } }
    if (touch) continue;
    const cx = tx + D.w / 2, cz = tz + D.h / 2;
    let sc = Math.hypot(cx - hq.x, cz - hq.z);
    if (def) sc = Math.hypot(cx - enemy[0], cz - enemy[1]) + Math.abs(Math.hypot(cx - hq.x, cz - hq.z) - 7) * 2;
    sc += Math.random() * 1.5;
    if (sc < bs) { bs = sc; best = [tx, tz]; }
  }
  return best;
}

// ---- the frame --------------------------------------------------------------------------------------------------
function stepAlert(dt, w, h) {
  syncAlert();
  if (!alr.on || !alr.ui || !alr.ui.gl) return;
  alrMusicStep();
  dt = Math.min(dt, 0.1);
  if (alr.phase === 'play' && !alr.paused) {
    alrUIInput(dt);
    alr.acc += dt * (alr.speed || 1);
    let n = 0;
    while (alr.acc >= ALR_DT && n++ < 6) { alr.acc -= ALR_DT; alrSim(ALR_DT); }
    alrFxStep(dt);
  }
  if (alr.phase === 'play' || alr.phase === 'over') alrUIRender(dt);
}

// ---- test seam -----------------------------------------------------------------------------------------------------
// start(i) deals a game on tier i, auto(true) hands your side to a second commander, step(secs) runs
// the sim at 30 Hz headless (no drawing) — whole games in seconds.
window.alertDebug = {
  state: () => ({
    phase: alr.phase, t: Math.round(alr.t), result: alr.result, earned: alr.earned,
    players: alr.players.map((P) => ({ credits: Math.round(P.credits), make: P.make, use: P.use, low: P.low, lost: P.lost,
      blds: alr.ents.filter((e) => e.kind === 'bld' && e.owner === P.id).map((e) => e.type),
      units: alr.ents.filter((e) => e.kind === 'unit' && e.owner === P.id).map((e) => e.type) })),
    stats: alr.stats,
  }),
  start: (i, side, map, nAI) => { if (alr.tierPick) { alr.tierPick.close(); alr.tierPick = null; } if (alr.ui && alr.ui.setup) alr.ui.setup.hidden = true; alrNewGame(ALR_TIERS[i || 0], side || 'A', map || 'valley', nAI || 1); },
  auto: (v) => { alr.auto = v !== false; },
  step: (secs) => { const n = Math.round(secs / ALR_DT); for (let k = 0; k < n && alr.phase === 'play'; k++) alrSim(ALR_DT); return window.alertDebug.state(); },
  queue: (t) => alrQueue(alr.players[0], t), place: (t, x, z) => alrPlace(alr.players[0], t, x, z),
  cam: (o) => Object.assign(alr.cam, o || {}), render: () => alrUIRender(0),
};
