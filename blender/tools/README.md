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
| `png.js` | PNG decode + stats + frame diff in node stdlib. No image dependency by design. |

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
