// blender/tools/brawlpose.js — A BEAT-EM-UP IS JUDGED IN MOTION.
//
//   node blender/tools/brawlpose.js --seq punch --tag b-punch0
//   CROP_PIXEL=1 python blender/tools/crop.py strip b-punch0
//   node blender/tools/brawlpose.js --list
//
// WHY THIS EXISTS, and it is a sharper version of the hall's pose.js argument.
// Every tool in this repo photographs ONE FRAME at a PINNED CLOCK. For a room
// that is a reasonable default. For a fighting game it is the worst possible
// default, because everything this genre is judged on happens in four frames:
// the windup you can read, the frame the fist arrives, the frame the victim
// registers it, and the recovery you can punish. A still of a punch tells you
// where the glove is drawn. It cannot tell you whether the punch LANDS.
//
// The difference from pose.js: that one walks the hall's clock (`H.t = k`) and
// re-renders, which works because the hall's animation is a pure function of
// time. Nothing here is. A punch is a state machine with hitstop, knockback,
// an active window and a chain timer, so the clock has to be walked by RUNNING
// THE GAME — brawlDebug({ steps: 1, stepDt: 1/60 }) calls the real stepBrawl at
// a fixed dt, one frame at a time, with the dice pinned. What comes out is the
// actual sixty-per-second sequence a player sees, and it is reproducible.
//
// It asserts nothing. Looking at the strip IS the test — same contract as
// crop.py, which is the tool that has actually settled arguments in this repo.

const fs = require('fs');
const path = require('path');
const { openBrawl, shotBuffer } = require('./brawlharness');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}

// Each sequence: where to stand it up, then N frames of 1/60 with a fixed dt.
// `n` is chosen from the move's own duration in PUNCH_CHAIN, not by feel — a jab
// is 0.22s, so 16 frames at 1/60 covers windup, active, hitstop and recovery
// with room either side. `every` samples wider cycles without 40 files.
const SEQS = {
  // THE PUNCH. The whole product. Frame 3-4 is the active window, and whatever
  // happens there is what the game feels like.
  punch: {
    what: 'jab into a ketchup cup: windup, active frames, hitstop, recovery',
    act: 0, stage: 0, at: [140, 14], cups: [['ketchup', 153, 14]],
    pre: { pst: 'jab', pstT: 0 }, n: 16, every: 1, box: [100, 84, 120, 76],
  },
  // THE UPPER. Launches the victim (e.launch), so it is the one move whose
  // consequence lasts longer than the animation.
  upper: {
    what: 'upper into a mustard cup: the launch and where it puts them',
    act: 0, stage: 0, at: [138, 14], cups: [['mustard', 152, 14]],
    pre: { pst: 'upper', pstT: 0 }, n: 20, every: 1, box: [100, 80, 120, 80],
  },
  // THE KO. hp 1, so this frame kills: the death spin, the splat, the shake.
  ko: {
    what: 'the frame a cup dies: spin, fade, splat, screen shake',
    act: 2, stage: 2, at: [138, 14], cups: [['soy', 152, 14]], hp1: 1,
    pre: { pst: 'upper', pstT: 0 }, n: 24, every: 2, box: [100, 80, 120, 80],
  },
  // THE WALK. Four frames and a 1px bob, per the source. This is the sequence
  // that shows whether that is enough.
  walk: {
    what: 'the walk cycle, right across a full stride and a half',
    act: 0, stage: 0, at: [60, 14], keys: { r: true },
    n: 30, every: 2, box: [40, 84, 120, 76],
  },
  // THE LANE CHANGE. Depth is the mechanic this game is built on — a punch only
  // connects within DEPTH_HIT of your lane — so walking BACK and FORTH through
  // the belt is the sequence that shows whether depth is readable at all.
  lane: {
    what: 'walking up the belt from front to back: is depth readable?',
    act: 0, stage: 0, at: [150, 29], keys: { u: true }, cups: [['ketchup', 190, 3], ['mustard', 190, 27]],
    n: 40, every: 3, box: [110, 80, 130, 90],
  },
  // TAKING ONE. The blink is on iT, so half these frames are SUPPOSED to be
  // empty; that is worth seeing laid out rather than discovering in a still.
  hurt: {
    what: 'the player taking a hit: flash, knockback, the invuln blink',
    act: 1, stage: 1, at: [150, 14], cups: [['soy', 164, 14]],
    pre: { hurt: 1 }, n: 30, every: 2, box: [110, 80, 120, 80],
  },
  // THE PAN. The whole point of round 3, and it cannot be shot any other way: this
  // walks the camera a long way and samples every fifth of a second, so the strip
  // shows the four planes sliding across each other. On act 2 the top band is the
  // skyline that used to track the kerb at 1:1.
  pan: {
    what: 'the camera travelling: do the four planes move at four rates?',
    act: 1, stage: 1, at: [60, 14], keys: { r: true }, n: 8, every: 12, box: [0, 0, 340, 60],
  },
  panfactory: {
    what: 'the same, in the works — the ceiling pipes are the FOREGROUND plane now',
    act: 2, stage: 0, at: [60, 14], keys: { r: true }, n: 8, every: 12, box: [0, 0, 340, 60],
  },
  // BLOCKED. Mayo holds a guard against frontal jabs, and a blocked hit has to
  // read differently from a landed one or the player cannot tell why the cup is
  // not dying. Same input as `punch`, different cup.
  guard: {
    what: 'a jab into Mayo\'s guard: the block, not the hit',
    act: 1, stage: 2, at: [140, 14], cups: [['mayo', 155, 14]],
    pre: { pst: 'jab', pstT: 0 }, n: 14, every: 1, box: [100, 80, 120, 80],
  },
  // THE BOSS. The Clucker is the biggest rig in the game and the only one with
  // three phases; her peck is where a 38px-tall sprite comes apart if it will.
  clucker: {
    what: 'the Mother Clucker winding up and pecking',
    act: 2, stage: 3, at: [150, 14], cups: [['clucker', 200, 14]],
    n: 60, every: 4, box: [120, 60, 140, 110],
  },
};

const SEQ = arg('seq', 'punch');
const TAG = arg('tag', 'b-' + SEQ);
const OUT = path.join(__dirname, '_shots', TAG);

if (process.argv.includes('--list')) {
  for (const [k, s] of Object.entries(SEQS)) console.log('  ' + k.padEnd(9) + s.what);
  process.exit(0);
}
const S = SEQS[SEQ];
if (!S) throw new Error('unknown --seq ' + SEQ + ' (try --list)');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await openBrawl();

  const state = await page.evaluate(({ s, t }) => {
    brawlDebug({ seed: 1337, heat: 'spicy', freeze: 0, clear: 1, act: s.act, stage: s.stage || 0, t });
    const p = { t, iT: 0, freeze: 0 };
    if (s.cups) {
      p.place = s.cups.map(([kind, dx, d], i) => ({
        kind, x: brawl.cam + dx, d, face: -1, hp: s.hp1 && i === 0 ? 1 : undefined,
      }));
      p.locked = 1;
    }
    if (s.at) p.at = [brawl.cam + s.at[0], s.at[1]];
    if (s.keys) p.keys = s.keys;
    brawlDebug(p);
    if (s.pre) brawlDebug({ ...s.pre, freeze: 1 });
    return brawlDebug({ freeze: 1 });
  }, { s: S, t: 12.5 });

  console.log('\n  ' + SEQ + ' — ' + S.what);
  console.log('  ' + JSON.stringify({ act: state.act, stage: state.stageName, cam: state.cam })
    + '\n  ' + state.players.map((q) => q.st + '@' + q.x + '/' + q.d).join(' ')
    + '  vs  ' + state.enemies.map((e) => e.kind + '@' + e.x + '/' + e.d).join(' ') + '\n');

  const frames = [];
  for (let i = 0; i < S.n; i++) {
    // capture BEFORE stepping, so frame 000 is the state the pose describes
    fs.writeFileSync(path.join(OUT, String(i).padStart(3, '0') + '.png'), await shotBuffer(page));
    const st = await page.evaluate((k) => brawlDebug({ steps: k, stepDt: 1 / 60 }), S.every || 1);
    frames.push(st);
  }

  // The per-frame log is the other half of the strip: it says what the STATE was
  // while the picture says what it looked like. A punch that photographs fine
  // but spent nine frames in 'hurt' is a different bug from one that looks wrong.
  console.log('  frame  player            enemies');
  frames.forEach((f, i) => {
    const p = f.players[0];
    console.log('   ' + String(i).padStart(3, '0') + '   ' + (p.st + '@' + p.stT).padEnd(16)
      + '  ' + f.enemies.map((e) => e.kind + ' ' + e.st + ' hp' + e.hp + (e.dead ? ' DEAD' : '')).join(' · ')
      + (f.counts.fx ? '   fx' + f.counts.fx : '') + (f.counts.splats ? ' splat' + f.counts.splats : ''));
  });

  if (errors.length) console.log('\n  PAGE ERRORS:\n   ' + [...new Set(errors)].slice(0, 8).join('\n   '));
  console.log('\n  ' + path.relative(process.cwd(), OUT) + '  (' + S.n + ' frames, every '
    + (S.every || 1) + '/60s)'
    + '\n  now look at it:  CROP_PIXEL=1 python blender/tools/crop.py strip ' + TAG + ' 8 340'
    + (S.box ? '\n  or zoom one:     python blender/tools/crop.py zoom ' + TAG + '/003.png '
      + S.box.join(' ') + ' 4' : '') + '\n');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
