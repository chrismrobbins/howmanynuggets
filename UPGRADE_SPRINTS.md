# 🔥 THE OVEN RELIGHT — upgrading the first five games

**"The old batch was undercooked. Back in the fryer, all of you."**

This doc is the shared brain for a deep upgrade of the arcade's **first five
games** — the thin early ones that predate the modern masterpieces. The bar is
explicit: bring each up to the depth and polish of **Nugget Knight** (waves + 3
difficulty oaths + unlockable), **Battered Brawlers** (3-act campaign, HEAT/HELL,
2P), and **Grand Theft Nugget** (open world, seasons). Each sprint is one working
session; whoever picks up the next sprint reads this file first (especially the
SPRINT NOTES at the bottom), does the work, and appends handoff notes.

**Read `AGENTS.md` first and keep its rules sacred** — script load order, the
FULL 2048² atlas (no new cabinet art), touch parity, the Playwright verify
pattern, and the Catch Incident canon (the stolen storm is ALIVE in the harbor;
we never free it, never kill it).

## The five (and why they're on the chopping block)

Nugget Catch is excluded — it's a taped-off crime scene in the hall (THE CATCH
INCIDENT). The five getting the treatment, in the CLAUDE.md layout order:

| Game | File | Now | The gap vs. the modern bar |
|------|------|-----|-----|
| 🔫 Blaster | blaster.js (334) | Missile Command: cannon, 7 buildings, 3 power-ups, endless storm-rain | no waves, no enemy variety, no boss, no difficulty, no stakes |
| 🐤 Flappy | flappy.js (169) | bare Flappy Bird: one pipe type, golden gates, free respawn | no biomes, no obstacles variety, no boss, no fail stakes, no meta |
| 🥣 Dunk | dunk.js (221) | one conveyor, combo + PERFECT band | one sauce, no shifts, no variety, no FEVER, no finale |
| 🧘 Sim | sim.js (639) | day/night zen diorama, aging, wisdom drip, ultra=void | passive & static; one day-cycle, no seasons/weather, no meta |
| 🏃 Run | run.js (611) | Rayman-rig runner, 3 obstacles, jump/flip/slide | one biome, no power-ups, no chase/boss, free respawn, no meta |

Knight is 1,167 lines; Brawl 2,881; GTN 5,786. That's the target energy.

## Doctrine (locked — the same rules every sprint obeys)

- **No build step, static, works from disk.** Classic `<script>` globals, load
  order preserved. Keep each game's existing render tech: **DOM/CSS** for
  Blaster / Flappy / Dunk, **inline SVG** for Sim / Run. Don't rewrite a DOM
  game into canvas — deepen what's there.
- **Scoring stays honest.** Everything banks into `storm.caught`, scaled by
  `storm.perFlyer` for cross-game parity; `stopStorm()` submits via
  `onArcadeScore`. Difficulty multipliers multiply the bank (Knight-style).
- **Difficulty ladder = the OATH/HEAT idiom, reused.** A pre-game overlay with
  a `{key:{emoji,name,mult}}` table, three tiers, the top one **unlockable** by
  a milestone on the middle tier. Sticky pick in `localStorage <game>TierLast`;
  per-tier bests in `<game>TierBest` (JSON map). Score ×`mult`. This is exactly
  what `knight.js` (`OATHS`, `kOathLast/kOathBest`, `nuggmareUnlocked()`) and
  `brawl.js` (`brawlHeatLast/brawlHeatBest`) already do — copy the shape.
  **Sim is the exception** (see its sprint): a zen game gets no combat ladder.
- **Medals + a meta-goal.** Each action game ends a *run* with a 🥉🥈🥇 medal by
  score/distance and a remembered best. Give players a reason to come back.
- **Juice is not optional.** Screen shake, hit-stop, particle bursts, floating
  combo text (`spawnPopLabel` exists), a FEVER/streak state. Proposed shared
  helper `js/arcadeKit.js` (loads after storm.js, before the games) so all five
  feel like one arcade instead of five different decades. See Open Decisions.
- **Touch parity is mandatory** (mobile is a live, recently-patched concern).
  Every new control gets a documented touch scheme before the sprint is "done".
- **Worker caps must be re-checked** (`worker/src/index.js` `GAME_MAX_SCORE`).
  `sim: 2e6` and `run: 2e6` are far too low the moment tiers/bonuses land and
  WILL 400-reject real scores. Bump them in Sprint 0 and re-verify per game.
  Pushing `worker/**` auto-deploys the API.
- **Attract atlas is FULL.** No new cabinet marquees/side-art/panels. If a
  game's attract SCENE should reflect new content, redraw it procedurally from
  existing atlas regions only — watch the "atlas overflow" warning.
- **Every finale feeds the canon.** Each game gets a one-shot `localStorage`
  lore flag (the `nugReelStorm`/`nugBeatEncore` idiom) that street NPCs
  (Dill, the Hooded Nug, the regulars) react to in Sprint 6. The Catch Incident
  is the connective tissue — the storm stays open forever.

## Sprint 0 — FOUNDATIONS (do this first; it unblocks all five)

The plumbing every later sprint leans on, plus the bug Beau flagged.

1. **Seal the Catch leak.** The hall cabinet is correctly taped
   (`startZoom` guard, arcade.js:2062), but the storm's mode-switch still has a
   🧺 button (`index.html:134`), so from *inside any hall-launched game* you can
   tap 🧺 and drop into Catch — that's "you can still enter it." Fix: suppress
   the 🧺 button (and arguably the whole cabinet-hop switch) whenever the storm
   was launched from the hall, while **keeping the calculator storm's own Catch
   intact** (canon: "the calculator's own storm still works as ever"). Needs a
   reliable "launched-from-hall" signal — resolve in this sprint. See Open
   Decisions for the exact scope (button-only vs. whole switch).
2. **`js/arcadeKit.js` (proposed).** Tiny shared toolkit so the five don't
   diverge: `Kit.shake(px,ms)`, `Kit.hitStop(ms)`, `Kit.burst(x,y,opts)` particle
   bursts, `Kit.fever` combo/streak state helper, `Kit.medal(score,cuts)`, and
   `Kit.difficultyOverlay(tiers, onPick)` wrapping the oath/HEAT pattern +
   localStorage best-map. Loads after `storm.js`, before the games.
3. **Worker caps.** Bump `sim` (→10e6), `run` (→20e6), re-open `blaster`
   (→~60e6 to cover a ×3 tier + boss bonuses); leave `flappy`/`dunk` at 40e6 but
   note marathon-with-×3 could brush the ceiling — re-check after their sprints.

## Sprint 1 — 🐤 FLAPPY: from one pipe to a flight through Nuggetown

Thinnest game, biggest visual ROI. Keep DOM pipes; add everything else.

- **The bird becomes a character.** Give it the Rayman treatment Run pioneered:
  flapping wing rig, panic eyes on a dive, a trailing feather or sauce streak.
- **Biomes by distance** (palette + rules swap): 🍟 the Fryer → 🧊 the Freezer
  (gusts push you) → 🫙 the Sauce Caverns (dripping-sauce hazards, stalactites)
  → 🌩️ THE HARBOR STORM (finale gauntlet). Parallax sky per biome.
- **Obstacle variety:** moving towers, rotating spatulas, pulsing gaps, ceiling
  drips, wind fans. Not just static pipes.
- **Pickups/power-ups:** ⭐ shield (eat one hit), 🧲 magnet, ⏱ slow-mo, 🪶 float.
- **Real stakes, still arcadey:** a crash ENDS the run (bank distance → medal),
  then instant restart. Near-miss "WHOOSH" threading bonus feeds a combo.
- **Difficulty ladder:** FLEDGLING / FLYER / **STORMCHASER 🌩** (unlock by
  reaching the Sauce Caverns on FLYER). Gap size, speed, wind ×`mult`.
- **Finale + lore:** survive the Harbor Storm gauntlet → set `nugFlappyStorm`.
  Canon-safe: you fly THROUGH the storm's edge; nothing moves, case still open.
- **Touch:** tap anywhere = flap (unchanged); the pickups are auto-collect.
- Cap: flappy stays 40e6 (re-check with STORMCHASER ×mult).

## Sprint 2 — 🥣 DUNK: from one cup to the dinner rush

- **Multi-sauce stations:** BBQ / honey mustard / ranch / buffalo cups. Nuggets
  are color-coded; route each to its matching cup (a light DDR/lane decision on
  top of the timing) — or a single-cup "classic" lane on the easiest tier.
- **Shift structure:** "the dinner rush" — escalating shifts with a quota to
  advance (Brawl-act cadence). Between shifts: a quick tip/upgrade beat.
- **Hazards & reads:** burnt nuggets (DON'T dunk — penalty), double-dip
  fake-outs, speed bursts, order tickets ("3 BBQ in a row" bonus).
- **FEVER:** a PERFECT streak lights FEVER (2× band, screen pulse, announcer) —
  the beat.js HYPE→FEVER shape.
- **Difficulty ladder:** PREP / RUSH / **THE WEEDS 🔥** (unlock by clearing shift
  N on RUSH). Belt speed, spawn density, PERFECT-window ×`mult`.
- **Finale + lore:** the last shift is the SECRET SAUCE vat (a nod to the
  syndicate's "batter"); clearing it sets `nugDunkSecret` (optional lore hook).
- **Juice:** per-cup color splash, combo fire, cup fill meters.
- **Touch:** tap a lane / tap-to-dunk with lane buttons on multi-cup tiers.
- Cap: dunk stays 40e6 (re-check).

## Sprint 3 — 🔫 BLASTER: from endless rain to a wave-based city defense

Biggest architectural change: today Blaster piggybacks the storm's generic
particle spawner (it is NOT in `pausesStorm()`). To control waves and enemy
types it must **own its spawner** → add `blaster` to `pausesStorm()` and drive
enemies itself (like GTN/Knight). Score still banks to `storm.caught`.

- **Waves + intermissions:** escalating themed assaults with a shop/repair beat
  between them (Knight's wave/break cadence).
- **Enemy variety:** plain nuggets, armored (2 hits), splitters (break in two),
  dive-bombers (curve at a building), MIRV crates.
- **Boss:** THE BATTER BOMBER — a syndicate tanker-airship (ties to Brawlers'
  Mother Clucker + the Catch Incident batter) with a health bar and payload
  patterns. Recurring mini-boss, one finale boss.
- **Power-up depth:** keep ⚡🔱🛡️; add 💣 smart-bomb (clear screen), ❤️ repair a
  building, ⏱ slow-mo, ✖️2 score. Chained kills build a killstreak multiplier.
- **The city is Nuggetown:** name the buildings (the arcade, the pier, the club,
  the ranch, NPD HQ). Real skyline, real stakes — losing the block ends the wave
  run with a medal, then rebuild.
- **Difficulty ladder:** PATROL / SIEGE / **THE BATTER STORM 💥** (unlock by
  reaching wave N on SIEGE). Enemy speed/density/HP ×`mult`.
- **Finale + lore:** down the Batter Bomber → set `nugBlasterHeld` ("held the
  line over Nuggetown"). Dill/Hood react.
- **Touch:** finger = cannon (drag aim, hold fire) — already good; add a
  smart-bomb button.
- Cap: blaster 20e6 → ~60e6 (Sprint 0).
- **Also consider** `MODE_COMPACT_HUD` for Blaster now that it draws a rich HUD.

## Sprint 4 — 🏃 RUN: from one counter to a cross-town gauntlet

The rig is already gorgeous (keep it). Add world, variety, and a chase.

- **Biomes by distance:** the kitchen counter → 🧊 the freezer (slippery
  physics) → 🔥 the grill (fire hazards, heat shimmer) → 🌃 the alley/street
  (Nuggetown at night) → 🌊 THE PIER (finale, harbor). Palette + obstacles swap.
- **Obstacle variety:** current 3 + moving cans, swinging ladles, real pits
  (fall = crash), flying hazards (slide OR jump), grease slicks, conveyors.
- **A rival chase:** a rolling batter-boulder / spork-on-wheels gains on you
  when you crash or dawdle — fail-forward tension; boss chase at biome ends.
- **Power-ups:** 🚀 rocket dash (invincible sprint), 🧲 magnet, ⭐ shield,
  ⏱ slow-mo, a mini-nug companion.
- **Real stakes:** crash costs a heart (or ends the run → medal), instant
  restart; pits are true fail. Keep the crash-limb-physics gag.
- **Difficulty ladder:** JOG / SPRINT / **THE GAUNTLET 💨** (unlock by reaching
  the alley on SPRINT). Start speed/accel/density ×`mult`.
- **Finale + lore:** reach the pier and run out over the harbor → set
  `nugRunPier`. Canon-safe (you run the boards, you don't touch the water).
- **Juice:** speed lines, motion blur at top speed, dash trails, biome-swap
  flourish, magnet arcs.
- **Touch:** tap=jump, hold-floor=slide (keep); add a dash button.
- Cap: run 2e6 → 20e6 (Sprint 0).

## Sprint 5 — 🧘 SIM: from a nice diorama to a living world worth sitting in

**Deliberately NOT an action game.** No combat ladder. The depth is *breadth of
world* and a gentle incremental spine — an idle game you WANT to leave running.

- **Seasons:** the diorama cycles spring → summer → autumn → winter (palette,
  foliage, snow/blossoms), each with its own ambient events.
- **Weather events:** rain, snow, fog, a rainbow after rain, the aurora at
  night, a comet — rare, beautiful, each awards wisdom.
- **Rare life & sights:** a fox trots by, a hot-air balloon, a message in a
  bottle, a wandering monk-nug who drops a koan, a (very rare) UFO. Each is a
  collectible **"Sight Seen"** in a small journal.
- **The incremental spine:** wisdom thresholds unlock life-stage glow-ups and
  journal entries; seeing all Sights → **ENLIGHTENMENT** (a golden-aura
  end-state, remembered). That's the meta-goal — no death, just becoming.
- **The void, redeemed:** in Ultra mode you still accrue wisdom ("nuggets can't
  see, but they can FEEL") and rare "sounds in the dark."
- **Lore, done quietly:** the perfect witness. A rare night event — the harbor
  storm flickering on the horizon — sets `nugSimStorm` ("the old nugget saw
  something"), which Dill's investigation can reference. Understated, on-brand.
- **Optional gentle interaction:** click the nugget to meditate (a breathing
  micro-loop that nudges the wisdom rate). Optional — the game still plays
  itself.
- **Touch:** tap events / tap-to-meditate; otherwise it just runs.
- Cap: sim 2e6 → 10e6 (Sprint 0).

## Sprint 6 — CANON + POLISH + SHIP

- **Wire the lore flags into the street.** New Dill / Hooded Nug / regular
  dialogue branches in arcade.js reacting to `nugFlappyStorm`, `nugBlasterHeld`,
  `nugDunkSecret`, `nugRunPier`, `nugSimStorm`. Keep canon: storm never freed.
- **Consistency pass:** all five share the Kit's juice, difficulty overlay feel,
  medal styling, and HUD grammar. `MODE_HINTS` updated for any changed controls.
- **Mobile pass** on all five (real-device ergonomics — the live concern).
- **Attract refresh** (optional, atlas-safe) if a game's cabinet screen should
  show its new self.
- **Full verify + deploy:** Playwright headless per AGENTS.md for each game,
  bump/confirm worker caps, push, `gh run watch`.

## Sequencing

Plan-doc-first (this), then deep, **weakest → strongest for fastest visible
wins**: Sprint 0 → Flappy → Dunk → Blaster → Run → Sim → Canon/Polish. One game
shipped and verified per sprint; Beau steers between sprints. Order is flexible —
say the word to reprioritize (e.g., Blaster first if the boss is the exciting
part).

## Decisions (LOCKED by Beau, 2026-07-21)

1. **Catch-leak scope → hide the WHOLE cabinet-hop mode-switch when in the
   hall.** The plain calculator storm keeps its Catch + full switch.
2. **Shared `arcadeKit.js` → YES** (keep it thin).
3. **Renames → builder's call, per game as we go.** Mode KEYS stay fixed
   regardless (`blaster`/`flappy`/`dunk`/`sim`/`run`).
4. **Sim → stays ZEN** (breadth + enlightenment; no fail states).

## SPRINT NOTES (handoff log — append newest at the bottom)

### Sprint 0 — FOUNDATIONS ✅ (2026-07-21)

Shipped the plumbing all five upgrades lean on. 19/19 headless checks pass.

**Catch leak — SEALED.** One CSS rule: `body.hall-open #modeSwitch { display:none }`
(css/storm.css, in the mode-switch section). The hall sets `hall-open` on the
body in `enter()` (arcade.js:2026) and keeps it for the whole session, incl.
while a launched game runs — so the cabinet-hop switch is gone in-hall and you
can no longer drop into taped-off Catch from another game's HUD. The plain
calculator storm (WebGL fallback / no hall) never gets `.hall-open`, so it keeps
its full switch AND its Catch, per lore. The `#id` selector (1,1,1) intentionally
outranks `.storm-hud.compact:hover .mode-switch` (0,4,0) — verified.

**`js/arcadeKit.js` + `css/arcadeKit.css` — NEW shared toolkit** (global
`ArcadeKit`, alias `AK`; loaded after storm.js, before the games). API the game
sprints should reach for:
- `AK.kick(mag,ms)` + `AK.shakeXY()` → fold the returned `{x,y}` into your root
  transform each frame (render-agnostic screen shake; no element ownership).
- `AK.hitStop(ms)` + `AK.refreshTimeScale()` / `AK.timeScale` → multiply your
  per-frame `dt` by it for freeze-frame on big hits (opt-in; call refresh once/frame).
- `AK.burst(clientX,clientY,{n,emoji|color,size,speed,life,gravity})` → particle pop.
- `AK.makeFever({perLevel,maxLevel,step,timeout})` → `.hit()/.miss()/.tick()`,
  `.level/.active/.mult/.streak` (the beat.js HYPE→FEVER shape, generalized).
- `AK.medal(score,[bronze,silver,gold])` → `{tier,emoji,label}`.
- Difficulty ladder (the knight/brawl oath/HEAT idiom): `AK.tierSelect({storeKey,
  tiers:[{key,emoji,name,mult,blurb,locked?,lockNote?}], title, note, onPick})`
  renders the pre-game overlay, handles 1/2/3/4 + click, skips locked tiers,
  remembers the pick (`<storeKey>Last`); plus `AK.bests/saveBest/lastTier`
  (`<storeKey>Best` JSON map). All localStorage is private-mode-safe.
- Respects `prefers-reduced-motion` (shake/hitStop no-op, burst thinned).

**Worker caps raised** (worker/src/index.js, deploys on next `worker/**` push —
NOT pushed yet): blaster 20e6→60e6, sim 2e6→10e6, run 2e6→20e6. flappy/dunk stay
40e6 (re-check after their tier ×mult lands). Parses clean (`node --check`).

**Verify harness:** `scratchpad/verify-sprint0.cjs` — self-serves the repo via
Node http, requires Playwright from the npx cache
(`…/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright`), launches Chromium
with `--use-gl=angle --enable-unsafe-swiftshader`. Reuse this shape per game:
capture `pageerror` + console warnings, drive via `setStormMode('<mode>')` and
the `*Debug` hooks, screenshot, actually look. Deferred (low-risk, existing
code): the real hall-entry flow that sets `hall-open` — will be exercised for
real when the game sprints launch in-hall.

**Next: Sprint 1 — 🐤 FLAPPY.** Kit's ready; use `tierSelect` for FLEDGLING/
FLYER/STORMCHASER, `makeFever` for the near-miss combo, `burst`+`kick` for juice.

### Sprint 1 — 🐤 FLAPPY ✅ (2026-07-21)

Rewrote js/flappy.js (169→~560 lines) + NEW css/flappy.css (old block pulled from
storm.css). 22/22 headless checks + screenshots eyeballed (Fryer / Storm / medal).

- **Biomes** (`FLAPPY_BIOMES`, advance by cumulative gate count): 🍟 Fryer → 🧊
  Freezer (vertical wind gusts + moving gaps) → 🫙 Sauce Caverns (falling sauce
  drips + tight gaps) → 🌩️ THE HARBOR STORM (fast, buffeting, lightning flashes).
  Sky is a JS-set gradient on `#flappySky` (transitions 1.1s); two parallax
  silhouette layers ride `--fhue`; towers tint via `--fpipe` + background-blend.
- **Character rig:** `#flappyBird` is now a `<div>` holding an injected SVG —
  flapping wings (sweep driven by `_flapT`), panic eyes that widen/drop on a
  dive, a sauce streak. (index.html bird `<img>`→`<div>`.)
- **Power-ups** (tokens in gaps): 🛡️ shield (one save + 0.9s i-frames), ⏱️ slow-mo,
  🪶 float, ✨ double. **Combo:** `AK.makeFever` — threading a gap within 30px is a
  WHOOSH (2 hits + burst); mult scales gate score.
- **Difficulty:** `AK.tierSelect` storeKey `flappy` — FLEDGLING/FLYER/**STORMCHASER 🌩**
  (locked until you reach the Caverns on FLYER+ → `nugFlappyCaverns`).
- **Stakes:** a crash ENDS the run → medal card (`AK.medal` cuts [8,16,24] gates,
  special 🌩️ STORM FLOWN); flap to instantly restart; per-tier best saved.
- **Finale/lore:** surviving to gate 32 sets **`nugFlappyStorm`** (reader
  `flappyStormFlown()`) for Sprint 6 street dialogue. Canon-safe (storm's edge only).
- storm.js: `flappyTally()` branch in `updateStormHud` + richer `MODE_HINTS.flappy`.
- **GOTCHA (fixed, worth remembering):** new top-level `const`s in a game file
  share the ONE global scope — `const BASE_SPEED` collided with dunk.js's
  `BASE_SPEED`, and since flappy loads first, DUNK silently failed to define
  `syncDunk` (redeclaration error) → `setStormMode` threw. Renamed to `FLAP_SPEED`.
  **Prefix or scope new game globals**; grep for collisions before shipping.

### Sprint 2 — 🥣 DUNK ✅ (2026-07-21)

Rewrote js/dunk.js (221→~430 lines) + NEW css/dunk.css (old block pulled from
storm.css). 22/22 headless + screenshots eyeballed (RUSH shift 1 & shift 3 FEVER).

- **Multi-sauce routing:** dynamic cup stations (BBQ / honey mustard / ranch /
  buffalo) built per shift; color-coded nuggets carry a target-sauce flag; route
  each to its MATCHING cup. Tap a cup (or press its number 1-4); SPACE auto-serves
  the most-urgent correctly-parked order; a belt tap elsewhere = auto-serve.
  Golden = wildcard 10×. 🔥 BURNT nuggets must NOT be dunked (penalty + combo break).
- **Dinner rush:** shift structure with a quota bar; clear the quota → SHIFT DONE
  banner → next shift ramps cups (up to tier cap) + speed. `#dunkStations` holds
  the cups, `#dunkQuota` the progress bar (both new in index.html; old single
  `#dunkZone`/`#dunkCup` removed).
- **FEVER:** `AK.makeFever` on dunks (PERFECT = 2 hits); ≥maxLevel lights the FEVER
  pill + `body.dunk-fever`. Per-cup splash + `AK.burst` in the sauce color.
- **Difficulty:** `AK.tierSelect` storeKey `dunk` — PREP / RUSH / **THE WEEDS 🌶️**
  (locked until you clear Shift 3 on RUSH → `nugDunkWeeds`). Scales speed, max
  cups, PERFECT window, burnt frequency.
- **Finale/lore:** Shift 5 swaps in the 🟣 SECRET SAUCE cup; clearing it sets
  **`nugDunkSecret`** (reader `dunkSecretServed()`) — Gravy Jones / Dill hook for
  Sprint 6. (Canon-safe: it's a sauce, not the storm.)
- storm.js: `dunkTally()` branch + new `MODE_HINTS.dunk`.
- Layout note: quota bar + FEVER pill live at the BOTTOM center (top-center
  collides with the storm HUD card).

### Sprint 3 — 🔫 BLASTER ✅ (2026-07-21)

Rewrote js/blaster.js (334→~560 lines, now IIFE-wrapped) + NEW css/blaster.css
(old block pulled from storm.css). 23/23 headless + screenshots (wave, boss).

- **Owns its spawner now:** added `blaster` to `pausesStorm()` — it no longer
  rides the storm's generic particle rain, so it can run real WAVES.
- **Enemy variety:** grunt / ARMORED (2 hp, metal ring) / SPLITTER (breaks into 2)
  / DIVER (curves into a building). Golden = 10×. Waves escalate; every 5th is a
  boss wave.
- **Boss — THE BATTER BOMBER:** hp bar (bottom-center, clear of the HUD), flies +
  drops payloads. Downing the FIRST one sets **`nugBlasterHeld`** (reader
  `blasterHeld()`) for Sprint 6. Ties to the syndicate/Catch Incident.
- **Deeper power-ups:** ⚡🔱🛡️ + 💣 smart-bomb (clear screen), ❤️ repair, ✖️ double.
  **Killstreak** via `AK.makeFever` (breaks when the city takes a hit) with
  KILLING SPREE / RAMPAGE / NUGGETOWN HERO callouts.
- **Named skyline:** THE ARCADE / GREASE GARAGE / THE PIER / DIP HOP / NPD HQ /
  SAUCE WORKS / THE RANCH; buildings announce their fall; lose them all → run
  over (medal by wave, `AK.medal` cuts [3,6,10]); intermission repairs one.
- **Difficulty:** `AK.tierSelect` storeKey `blaster` — PATROL / SIEGE / **THE
  BATTER STORM 💥** (locked until wave 5 on SIEGE → `nugBlasterStorm`).
- storm.js: `blasterTally()` branch + new `MODE_HINTS.blaster`. Worker cap already
  bumped to 60e6 in Sprint 0.
- **GOTCHA (fixed):** blaster's helper `spawnEnemy` collided with knight.js's
  `spawnEnemy` (functions silently clobber on redeclare — knight loads later, so
  it won ). Wrapped the whole file in an IIFE exporting only
  syncBlaster/stepBlaster/blasterTally/blasterHeld/blaster/blasterDebug. **Prefer
  IIFE isolation for any game file with generic helper names.**
- **MP untouched:** blasterMP.js is a separate code path (confirmed) — co-op still
  works; only single-player changed.

### Sprint 4 — 🏃 RUN ✅ (2026-07-21)

Extended js/run.js (611→~930 lines) via SURGICAL edits (the Rayman rig + crash
physics + pose math preserved verbatim) + expanded css/run.css. 28/28 headless +
screenshots (counter + grill biomes; rig intact).

- **Biomes** (`RUN_BIOMES`, by meters): 🍟 The Counter → 🧊 The Freezer → 🔥 The
  Grill → 🌃 The Alley → 🌊 THE PIER. Recolor via the wall/counter gradient stops
  (added ids) + a `#runTint` wash + `#runWorld` letterbox bg; each biome sets its
  obstacle mix and pace.
- **New hazards:** 🔥 flame jet (grill) and PIT (a gap you fall into unless
  airborne) — added to `obstacleSvg` + collision. Biome-weighted spawns.
- **Stakes:** ❤️❤️❤️ hearts; a crash costs one; at 0 the run ends (medal by
  meters, `AK.medal` cuts [500,1100,2600], special 🌊). Instant restart on jump.
  **THE RIVAL** — a batter-boulder (`#runRival`) that looms closer with each lost
  heart and catches you at 0.
- **Power-ups** (tokens): 🛡️ shield (one save + i-frames), 🧲 magnet (pulls/collects
  golden nugs), 🚀 rocket (invincible burst). **Manual dash**: F/Shift or double-tap
  (touch) → short i-frame burst + speed, on a cooldown. Speed lines at high velocity.
- **Difficulty:** `AK.tierSelect` storeKey `run` — JOG / SPRINT / **THE GAUNTLET 💨**
  (locked until you reach The Alley on SPRINT+ → `nugRunGauntlet`); scales start
  speed, accel, obstacle density, score mult.
- **Finale/lore:** running out onto the pier (2600m) sets **`nugRunPier`** (reader
  `runReachedPier()`) for Sprint 6. Canon-safe (you run the boards, not the water).
- storm.js: richer `runTally()` (biome · meters · hearts) + new `MODE_HINTS.run`.
  Worker cap already bumped to 20e6 in Sprint 0.
- **Naming note:** `run.phase` is the RIG cycle angle — the new state machine uses
  `run.stage`. New helpers all `run`/`RUN_`-prefixed (no collisions; flat globals ok).

### Sprint 5 — 🧘 SIM ✅ (2026-07-21)

Extended js/sim.js (639→~900 lines) + css/sim.css. Stayed ZEN — no tiers, no
fail. 21/21 headless + screenshots (autumn-rain, aurora-night, ENLIGHTENED).

- **Seasons** (`SEASONS`, every 2 in-sim days): 🌸 Spring → ☀️ Summer → 🍂 Autumn →
  ❄️ Winter. Canopy recolors via a CSS filter on `#simCanopy`; the leaf system is
  recolored per season (blossom / green / autumn leaf / snow); season banner on change.
- **Weather** (CSS overlays over the SVG): 🌧️ rain, 🌫️ fog, 🌌 aurora (night) —
  episodic. Rain can yield a 🌈 rainbow in daylight.
- **Rare Sights + journal:** 🦊 fox, 🎈 balloon, 🧘 monk (drops a KOAN), ☄️ comet,
  🌌 aurora, 🌈 rainbow, 🛸 UFO, and 🌩️ the harbor storm on the horizon. First-time
  sightings fill `nugSimSights`; seeing **all 8 → 🕉️ ENLIGHTENMENT** (golden aura,
  `nugSimZen`). The incremental spine, zen-style.
- **Lore:** the storm sighting sets **`nugSimStorm`** (reader `simSawStorm()`) — an
  understated witness for Dill. Also reachable in the void as a rumble.
- **Meditation:** tap the nugget → 4× wisdom for a few seconds + a calm burst
  (pointer-events re-enabled under the none-world). **The void** now has "sounds in
  the dark" events + wisdom, so Ultra isn't dead time.
- storm.js: richer `simTally()` (season · day · phase · sights) + new `MODE_HINTS.sim`.
  Worker cap already bumped to 10e6 in Sprint 0.

### Sprint 6 — CANON + POLISH + VERIFY ✅ (2026-07-21) — SHIP pending Beau's OK

- **Canon wired:** Detective Dill gets a new **"THE CRISPY IRREGULAR"** case-file
  branch (arcade.js) reacting to all five finales — `blasterHeld()` (the Batter
  Bomber), `flappyStormFlown()` (flew the storm's edge), `runReachedPier()` (ran
  to the pier), `dunkSecretServed()` (the secret sauce = evidence), `simSawStorm()`
  (the bench witness). Each ties back to the syndicate / Sauce Works / harbor
  storm; the case stays open forever. (Options appear only once you've earned them.)
- **Final combined verification:** 11/11 — every game's globals + all 5 lore
  readers present; rapid mode-switching across all games survives; no pageerrors;
  no atlas warnings. **The Sprint 0 Catch seal confirmed in the REAL hall flow**
  (enter() → body.hall-open → `#modeSwitch` computes to `display:none`), plus the
  hall builds + renders under swiftshader (screenshot).
- **Per-game verification totals:** Flappy 22/22 · Dunk 22/22 · Blaster 23/23 ·
  Run 28/28 · Sim 21/21 · Foundations 19/19 · Final 11/11 = **146 checks green.**
- **Consistency:** all five reuse `ArcadeKit` (difficulty overlay, FEVER/streak,
  medals, burst, kick) and touch schemes, so they read as one arcade.

## SHIP CHECKLIST (nothing pushed yet — all local, uncommitted)

- [ ] `git pull` first (Chris shares this repo — pull before shipping).
- [ ] Commit on a branch (we're on `main`); push as `beauATc2c`.
- [ ] Pushing `main` auto-deploys GitHub Pages; **`worker/**` changed** (score
      caps), so the Deploy Worker action fires too — `gh run watch` both.
- [ ] Sanity-check the live site + a quick play of each upgraded cabinet.
