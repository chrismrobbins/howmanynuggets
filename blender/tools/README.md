# 🔬 blender/tools — the verification kit

**These are checked in on purpose.** Three consecutive art sessions built this
same kit in a session scratchpad, shipped, lost it, and rebuilt it from prose
descriptions in `blender/HANDOFF.md`. It ships nothing — no file in `index.html`
references anything here — and it is the only reason any claim in the handoff's
measured tables means something. It lives in the repo now.

## Setup

```bash
python -m http.server 8787            # FROM THE REPO ROOT. Watch the cwd.
npm i playwright                      # anywhere; then point PW_PATH at it
export PW_PATH=/path/to/node_modules  # (or install playwright next to the repo)
```

## The tools

| | what it answers |
|---|---|
| `shoot.js` | *Did the picture get better, and by how much?* Eighteen fixed spots, pinned clock, canvas-only screenshots, and a dead/near-dead/blown/mean/sd/chroma/**hard** table. |
| `crop.py` | *What actually changed?* `sheet` (one page, all spots), `ab` (two runs side by side), `zoom` (NEAREST crop), `probe` (the literal pixel value), `tunesheet`. |
| `tune.js` | *What should this number be?* Sweeps `NuggetArcade._TUNE` between frames in ONE browser session instead of edit-reload-measure. |
| `fallbacks.js` | *Does it still draw a room when things fail?* The whole degrade matrix — no HDR, no PBR, no shadows, no sky, no art, no maps, no mesh, WebGL1. |
| `probe.js` | *Where is anything?* Dumps hotspots, cabinets, NPCs and camera state from the running hall. |
| `pose.js` | *Does the rig hold up through its CYCLE?* Walks the clock at one spot and shoots the frames. `--look <npc>` frames a regular off its own hotspot; `--talk <npc>` opens the real dialogue. |
| `png.js` | PNG decode + stats + frame diff in node stdlib. No image dependency by design. |

### 🥊 …and the BRAWLERS kit (a second harness, on purpose)

Everything above drives the arcade HALL: it teleports `NuggetArcade._H` around a
3D room, its spots are world coordinates with a yaw, and its seams are WebGL
flags. **None of it works on a minigame canvas.** BATTERED BRAWLERS is 2900 lines
of canvas 2D pixel art whose entire world is 340x200, with no camera to aim and
no renderer to degrade — so it gets its own rig. `png.js` and `crop.py` are the
only two files both kits share, because they take PNG bytes and know nothing
about either game.

| | what it answers |
|---|---|
| `brawlharness.js` | The rig. Pins the dice (`brawlDebug({seed})` → mulberry32), freezes the clock, and reads the CANVAS BUFFER at world resolution instead of screenshotting the page. |
| `brawlshoot.js` | *Did the picture get better?* 21 scenes — twelve stages, four combat situations, five screens — with the hall's columns plus **BAND** (the belt band alone) and **flat** (adjacent pixel pairs that are IDENTICAL). |
| `brawlpose.js` | *Does it read in MOTION?* `--seq punch\|upper\|ko\|walk\|lane\|hurt\|clucker` steps the REAL `stepBrawl` at a fixed 1/60 and dumps the frames, with a per-frame state log beside them. |

```bash
node blender/tools/brawlshoot.js --tag b-base
CROP_PIXEL=1 python blender/tools/crop.py sheet b-base
CROP_PIXEL=1 python blender/tools/crop.py ab b-base b1-ground

node blender/tools/brawlpose.js --seq punch --tag b1-punch
CROP_PIXEL=1 python blender/tools/crop.py strip b1-punch 8 340
```

**`BRAWL_WORLD=std|wide|hd`** picks a WORLD PROFILE, and it exists because the first
version of this harness pinned one viewport and asserted it. `brawl.scale = max(2,
floor(vh / 200))` with a canvas sized in WORLD pixels means the viewport changes the
SHAPE of the frame, not just its size: 1020x600 is a 340x200 world at aspect 1.70, and
Beau's 4K panel produces up to 475x242 at aspect 2.11. Four rounds of composition were
validated at 1.70 and nowhere else, and what that hid was a cutscene cast sized in
absolute pixels (so it shrank relative to the shot as the display grew) and 6px text
that smears when the game magnifies it by 5. **8px minimum in this canvas.** `std` is
the default so old tags stay comparable; look at anything that matters in both.

**`CROP_PIXEL=1`** switches every resize in `crop.py` to NEAREST at an integer
scale and never downscales below 1:1. Brawl tags start with `b-`/`b<n>-`, and
`brawlshoot.js` refuses to write into a tag that already holds hall shots — the
first run of it wrote 21 kitchen walls into `baseline` and the contact sheet came
back half arcade.

**A brawl-specific lesson, and it is 3c with the volume up.** Four things this
round found are invisible to *any* single frame, at *any* pinned clock:
the hit spark expands from radius 0, so at the moment of impact it is one yellow
pixel; the victim's white flash is keyed off `floor(stT*30)%2`, so it first
appears SIX FRAMES after the hit it is reporting; a jab freezes the game for five
frames of hitstop; and an uppercut used to launch a cup's body six pixels into
the air and leave its FEET standing on the belt. A beat-em-up is judged in
motion, and `brawlpose.js` is the only tool in this repo that can see it.

```bash
node blender/tools/shoot.js --tag baseline
#   ... make a change ...
node blender/tools/shoot.js --tag act1
python blender/tools/crop.py sheet act1
python blender/tools/crop.py ab baseline act1
node blender/tools/fallbacks.js

node blender/tools/tune.js --grid emisGain=2.2,2.8,3.4 bloomAmt=0.28,0.46
python blender/tools/crop.py tunesheet 01-entrance
```

Output goes to `blender/tools/_shots/<tag>/` (gitignored).

## Four things this kit learned the hard way

**1. Do not invent camera spots.** Hand-picked coordinates land inside walls,
and the hall's collision solver quietly walks the camera back — so a run
photographs a brick facade while the table claims to be measuring the street.
The first spot table here did exactly that and reported 48% dead black; it was
a wall. Every spot in `hallharness.js` is either a hotspot's own `stand` or an
aisle the game itself lays out, and each aims via `face()` at a real object's
coordinates rather than at a guessed heading.

**2. Only same-harness deltas mean anything.** The absolute numbers are not
comparable across revisions of the spot table. When you change `SPOTS`, every
earlier table in the handoff becomes historical.

**3b. Every statistic here was a HISTOGRAM, and that is a blind spot with a
shape.** dead / near / blown / mean / sd / chroma all describe the distribution
of colour in a frame; none of them can see how that colour is ARRANGED. The
hall rendered with no antialiasing whatsoever for three sessions and every
table in the handoff reported a clean sweep, because a staircase and a smooth
ramp have the same histogram. `png.staircase()` — the `hard` column — is the
first arrangement metric in the kit, and the class of bug it catches (aliasing,
texture shimmer, a mip chain going to mush, a normal map swimming) is exactly
the class that makes a frame look free-to-play. Read it as a same-frame A/B,
never as an absolute: real detail is hard edges too.

**3c. Every tool here measured ONE FRAME at a PINNED CLOCK, which is the same
blind spot as 3b one axis over.** A histogram cannot see how colour is ARRANGED;
a pinned clock cannot see TIME. A rig fails at the EXTREMES of its cycle and the
middle of a cycle is exactly where nothing goes wrong — `shoot.js` photographs
Henrietta at t=12.5, reports a clean frame, and would never know that the peck at
t=11.8 had torn her head off her neck. `pose.js` walks the clock and
`crop.py strip` lays the frames out in clock order. It asserts nothing: looking
at the strip IS the test.

And the corollary that cost the most to find: **a pose you cannot get the harness
INTO is a pose that will regress unnoticed.** Every gesture in the cast — Dill's
brim and notepad, Gravy's lid, Crumb's unfolding arm — is gated on
`H.dialog.npc`, and `stand()` sets `H.dialog = null` on every single call. Half of
THE CAST was unphotographable by anything in this repo, in any mode, until
`pose.js --talk` existed.

**3. A fallback that renders an identical frame is not a passing test.** It is
a seam that never fired. `fallbacks.js` diffs every degraded path against the
shipped one and fails on <0.5% change. It caught three dead seams the first
time it ran — all three had been reported "ok" by the summary statistics.

**4. `typeof X !== 'undefined'`, never `window.X`.** `HallArt`, `HallMaps` and
`GtaArt` are top-level `const`s in classic scripts, so they are not properties
of `window`. A `window.HallArt && (HallArt.on = ...)` guard short-circuits to
undefined and silently does nothing.

## The chrome, and what stays in frame

The storm layer and the hall's own hint/skip/mute chrome are DOM *on top of*
the canvas — they cover the thing under test and cost enough to make an fps
reading meaningless (a run once measured 25fps that was really 61). The
harness hides them inline, because a stylesheet loses to the rules that toggle
them. `.hall-vignette` deliberately **stays**: it is part of the picture the
player sees, so a measurement without it measures a different room.
