# Notes for coding agents (and humans) working on this repo

Two developers (Beau and Chris) both work here with AI assistance, often on
the same day. **Pull before starting work**, and read this before touching
the arcade hall or adding a game — these are the constraints that have
already bitten someone.

> **Status:** 🚔 GRAND THEFT NUGGET (mode `gta`, js/gta.js) — SEASON 1
> COMPLETE: all 10 sprints shipped 2026-07-15/16 (city, traffic, on-foot,
> NPD heat, weapons, the 11-contract syndicate campaign incl. THE HARBOR
> JOB, side gigs, the street door, audio/touch/pause-map polish). Build
> log + per-sprint handoff notes live in `GTA_SPRINTS.md`. Post-season
> patches (2026-07-16): **10.5 FRESH COAT** (ped/vehicle render rigs
> rebuilt, carjack bail-out scene, GPS arrow + objective plates,
> crosswalks), **10.6 POINT STEERING** (hold-where-you-want-to-GO is the
> default scheme; T toggles classic), **10.7 THE THIRD DIMENSION** (2.5D
> building extrusion — read the draw-order gotchas in the 10.7 notes
> before touching gtaDraw), **10.8 OPEN DOORS** (enterable interiors: the
> 🍗 CHICKEN STRIP CLUB, the NOODLE NUG diner, the AMMU-NUGGET shop —
> char-map rooms at GTA_INT_ORIGIN; see the 10.8 notes for the door/
> landmark-snap rules). GTA_SPRINTS.md also holds the **SEASON 2 —
> NUGGETOWN NIGHTS plan (10 sprints)**: garage + REP, mods, street races,
> the case board, Dill's chain, procedural contracts, weather, photo mode,
> and free-roam online on the worker gameRoom pattern.
> **2026-07-17:** game 13 shipped — 🎧 **DIP HOP** (mode `beat`, js/beat.js),
> the rhythm cup rumor paid off; third STREET game (club door on the far
> wall). Nugget Run's backwards feet fixed the same day (run cycle now
> orbits with −ph; see the comment in js/run.js).
> **S2.9 (FREE-ROAM ONLINE PT 1) SHIPPED EARLY, OUT OF ORDER** (js/gtaMP.js +
> worker/src/games/gta.js — a pure state-relay, NOT server-authoritative; see
> the S2.9 note at the bottom of GTA_SPRINTS.md before touching MP).
> **S2.1 (WHEELS OF YOUR OWN) SHIPPED 2026-07-17**: REP currency
> (`nugGtaRep`/`gtaPayRep`/`gtaRep()`), the 3-slot garage
> (`nugGtaGarage`, E to store/retrieve at the Grease Garage, L = plate
> press, active car survives reloads) + 📍 map waypoints & online player
> tags (click the pause map; `GtaNet.remoteList()`) — see the S2.1 sprint
> note. S2.2–8 + S2.10 remain. It's a STREET
> game (no cabinet): entry = the double-parked compact near the bus stop.
> Campaign flags other code can read: `gtaProgress()` (0-11 contracts done)
> and `gtaSawStorm()` (localStorage `nugGtaProg` / `nugGtaSawStorm`).
> **2026-08-02 — night shift:** game 14 shipped — 🕳️ **STORM DRAIN** (mode
> `drain`, js/drain.js), the FOURTH street game: a one-more-dive descender
> through the flooded mains (air management + THE CLOGS; THE PASSING below
> 400m sets `nugDrainStorm` / `drainSawStorm()` — Hood's slate reopened
> four-for-four, Dill's case "grew a basement"). Entry = the glowing gutter
> grate + DPW barricade by the far curb (textures `drainGrate`/`drainSign`
> on the STREET atlas; gold `'swirl'` glows under the slats). Canon ledger
> now lives in `docs/casefile.md` — keep it current. Same night, a bug
> sweep landed: **`spawnNugget` was declared in BOTH storm.js and dunk.js**
> (dunk's clobbered the storm spawner — catch mode froze on frame 1; dunk's
> is now `dunkSpawnNugget`, knight's bare `spawnEnemy` renamed
> `knightSpawnEnemy` for the same reason — SERIOUSLY, prefix your globals);
> `setStormMode` now BANKS the outgoing game's score before switching
> (leaderboards used to credit the whole session to the final mode) and the
> worker rate-limits per (user, game) to match; the $-to-nugget floor is
> float-dust-safe (`$16.47 ÷ $5.49-region` = 18, not 17); offline page load
> no longer signs you out (only a real 401 clears the token); flappy touch
> no longer double-flaps; blaster's game-over card clears on exit; MP fixes
> (blaster results snapshot so co-op scores actually persist, net.js single
> socket, gtaMP left/gaveup game filter, lobby Start gates on 2+ all-ready).
> Google-sign-in-adjacent findings left for Chris (see the night report):
> account linking by email, JWKS rotation refetch, login rate limiting,
> bootstrap-admin name now reserved at register.
> **2026-08-03 — 🎂 FOUNDER'S DAY:** the street now celebrates every August
> 3rd (`nugFoundersDay()` in js/util.js; force with localStorage
> `nugFoundersDayForce` = '1'/'0' for testing). One night a year: a banner
> strung between the two lamps nearest the doors (double-faced — the arcade
> face is marquee territory, a banner hid behind it once), balloon clusters
> on those lamps, chase bulbs (glow kind `'party'`), and THE FOUNDER'S CAKE
> hotspot by the doors — one candle (glow kind `'candle'`, flickers, goes
> dark once wished), blow-out = confetti (H.sparks now take per-spark color
> `c`) + `nugFoundersWish` = the year, so it re-lights annually. All five
> NPCs have `founders` branches; the jukebox gets a 5th stop that night only
> ("ONE CANDLE" — `jukeTrackCount()` gates it); the calculator wears a
> ribbon (app.js/styles.css). Street-atlas regions `foundersBanner`/
> `cakeSide` + party swatches are allocated YEAR-ROUND so packing never
> shifts with the calendar — only geometry is date-gated (in buildStreet).
> Same day, the last night-shift stragglers were fixed: beat.js now sweeps
> its spent envelope gains (`beatSweepEnvs` — they used to pile up on master
> all set long), blaster re-maps the skyline hitboxes on window resize, and
> kart rain falls on dt instead of a hardcoded 0.016.
> **2026-08-04 — 🏙️ GTN SEASON 2, THE SINGLE-PLAYER SEASON (S2.2–S2.8 in one
> night):** the MOD SHOP (B while idling a garage car in the lot — REP buys
> engine/grip/armor tiers, 🌶 chili nitro on SHIFT, the paint booth + pearl
> flip-flop; mods live on the garage SLOT, `gtaHpMax()` raises the bodywork
> ceiling); STREET RACES (six checkered pads + the 🏆 GOLDEN NUG GP once all
> six are won — flat gate-counter model, `spr` = point-to-point; rivals are
> `raceAI` cars with `mis:true` so doors lock; wins in `nugGtaRaces`, GP paint
> unlock in `nugGtaGpWin`); THE CASE BOARD (12 evidence pickups seeded
> APPEND-ONLY per district, bitmask `nugGtaEvidence`, C on the pause map =
> the corkboard tab); DILL'S CHAIN (4 missions via the same engine — defs
> carry `chain:'dill'`, booths ring CYAN when the board is full, progress
> `nugGtaDill`, the books burn, the case stays OPEN); NUGGETOWN STORIES
> (post-campaign procedural contracts, `chain:'story'`, 5 templates × daily
> date-seed, REP-gated tiers — the phones never go quiet again); NIGHT
> WEATHER (drizzle/downpour/fog/clear crossfade in `gta.wx` — downpour cuts
> grip via `gtaWxGrip()`, fog halves NPD sight + speeds heat decay, clear
> nights double golden pickups; radio DJs call the changes); PHOTO MODE
> (P = frozen free-cam, Z integer zoom via `gta.scale`, X filters, C exports
> a 3× PNG) + PAPARAZZI gigs (📸 pickups; P snaps the mark inside 90px,
> crowding under 42px spooks them). ENGINE NOTES: `gtaMissionComplete`
> branches on `def.chain`; the `watch` step only drives `stormRise` when the
> def sets `rise:true` (the harbor job does); new E-priority while driving is
> race pad FIRST, then booth/garage/jack. Dill + Hood street dialogue react
> (`gtaEvidence()/gtaDillDone()/gtaRacesWon()/gtaGpWon()`). S2.10 (online
> activities) remains, on Chris's MP stack.
> **2026-08-06 — night shift #1 of 7 (7 features, verified 47/47):** the street
> grew a **🗂️ N.P.D. CASE BOARD** (`openLocker()` in js/arcade.js, `css/locker.css`,
> street-atlas region `npdBoard`) — a glass case on two legs at x −6.5..−4.9,
> z 1.15, between the hydrant and Det. Dill. E opens a 14-exhibit overlay built
> from the SAME cross-game flag readers the NPCs use; FILED/OPEN, and every OPEN
> one names the game that produces it. It rides `.modal-overlay.active` so
> `modalOpen()` makes the hall stand down, and it handles its own ESC (one ESC
> closes the board, it does NOT also leave the hall). **Canon-safe: a full board
> still reads OPEN. FOREVER.** — filing all 14 resolves nothing, by design.
> Two NEW canon flags feed it: **`nugDrainTags`** (`drainTagCount()` /
> `drainSalvageDone()` — 🏷️ eight DPW SALVAGE TAGS wired into Storm Drain at
> FIXED depths 60/140/230/330/440/560/700/860m, bitmask-persistent, one dive
> per tag) and **`nugReelManifest`** (`reelManifestFound()` — 🍾 an 11th
> Keeping It Reel species, a corked bottle snagged only off the DEEP bottom;
> the reel junk-snag table now respects `spec.zone`/`spec.min` instead of
> picking any spd-0 spec in the shallows). Dill has `board`/`salvage`/`manifest`
> branches; the Hood reviews the board as a competing rumor format.
> Cross-cutting: **⭐ THE HOUSE SPECIAL** (js/storm.js) — one date-seeded game
> per night pays ×1.5 and builds a night-to-night streak (`nugDaily`, force the
> calendar with `nugDailyForce`='YYYY-MM-DD'). **All banking now goes through
> `nugStormBank(mode, amount)`** — the single path from `storm.caught` to
> `onArcadeScore`, called by both `setStormMode` and `stopStorm`; put any future
> score modifier THERE or it can be dodged by quitting the other way.
> Also: 🌩 **THE BATTER SQUALL**, a fifth GTN weather state (grip 0.70 — worse
> than the downpour — plus `gtaWxBlind()` = fog + squall×0.62, which is now what
> NPD sight/heat-decay/headlights read instead of bare `gtaWxFog()`); 🎧 DIP HOP
> **side D "THE NIGHT SHIFT"** (138bpm, 2AM — note the lead digits ARE the lanes
> in `beatGenTrack`, so a track with no `1` in its lead line can leave a whole
> cup empty); and a fourth jukebox loop, also THE NIGHT SHIFT (`jukeTrackCount()`
> is 5 now, 6 on Founder's Day — the seasonal single stays LAST in the array so
> the everyday count is a prefix).
> **2026-08-08 — THE ARMORY OPENS:** the knight's pick-1-of-3 boon deal is now a
> SHARED kit primitive — `ArcadeKit.boonSelect(cfg)` (js/arcadeKit.js; it reuses
> the `.ak-tier` chrome ON PURPOSE so every game's existing input guards already
> treat it as menu-not-gameplay — zero new CSS; callers filter/shuffle their own
> pool and freeze their own sim). Two games drafted it: 🔫 Blaster's 📦
> **REQUISITION DROPS** (`BLASTER_BOONS` — 9 permanent run upgrades dealt between
> waves; `cfg.boonEvery` paces them by tier, PATROL 1 / SIEGE 2 / BATTER STORM 3
> — the oath idiom: the hard tiers starve your build as the sky fills) and 🕳️
> STORM DRAIN's 🧰 **DPW SUPPLY CACHES** (`DRAIN_GEAR` — 9 gear picks at every
> 150m sublevel line; gear resets EVERY DIVE so each dive is a fresh build; the
> dive freezes while the cards are up via `drain.choosing`, air included).
> Knight keeps its own k-upgrade UI — untouched. New test seams: `blasterDebug`
> grew `boon`/`showBoons`/`clearWave` + a stats snapshot, and `window.drainDebug`
> is NEW (tier/depth/air/gear/offerGear/pickGear — depth teleports keep the spawn
> clocks and sublevel counter in step so a jump doesn't back-spawn a screenful).
> Verified 29/29 headless (natural triggers, pacing, freeze, per-dive reset).
> **2026-08-08 (later the same night) — 🕯️ THE UNDERCROFT (game 15, mode
> `croft`, js/croft.js):** the FIFTH street game, and the first built AROUND
> the pick-1-of-3 deal — a roguelite crawl under Fort Nugget: single-screen
> rooms, clear one → ⛧ THE RELIQUARY deals 3 of 16 relics (boonSelect), then
> descend; relics die with the run. Three oaths where LIGHT is the difficulty
> (TAPER / LANTERN / 🌑 THE DARK BELOW, earned); every 3rd floor 🔔 THE SEXTON
> (he SNUFFS your lantern up close + carries his own dark). The graphics
> flagship: a real-time 2D lighting engine on the low-res canvas — darkness is
> an offscreen canvas ERASED by radial lights (held lantern, wall torches,
> wisp foes that are their own lamps, embers, THE DOOR's seam), plus an
> additive hot-core pass; light radii scale with ROOM height, not pixels.
> Rooms pre-render to a base canvas; kills stamp decals into it. CANON: the
> B4+ stairs land once a run at 🚪 THE DOOR THAT ISN'T ON THE PLANS
> (`nugCroftDoor` / `croftFoundDoor()` — TAG 077's "leave it a door" finally
> parses; Dill + Hood react, 15th case-board exhibit; the door NEVER opens).
> Street entry: slanted cellar doors + KEEP SHUT board in the corner EAST of
> the noodle shop (x 18.7–20.3 — the shopfront spans 12.1–17.1, don't put
> things in its window), glow kind `'votive'`. ⚠️ the STREET ATLAS grew to
> **1024×2048** (croftDoor/croftSign overflowed the old 1024² page — cakeSide
> went black; both axes must stay power-of-two, the hall generateMipmaps).
> `croft` is in MODE_COMPACT_HUD (in-canvas HUD; the vault door lives where
> the full storm card used to sit). Test seam: `window.croftDebug`
> (tier/clearRoom/boon/showBoons/pickBoon/floor/room/warp/hearts/hit —
> `hit` clears i-frames first, a sexton-adjacent test flake taught us why).
> Verified 25/25 headless ×3.
> **2026-08-09 — 💡 THE LIGHTS GO ON (the Reopening's second half):** Beau
> reviewed THE GRAND REOPENING on prod and was right on both counts — the
> facade sign was blown out, and the upgrade read "meh" because it was the
> wrong layer. **The hall now has a real post chain** (js/arcade.js): the
> scene renders to an FBO, a bright pass (>0.74 luma, soft knee) extracts the
> hot pixels, two separable blurs at quarter res widen them, and a composite
> adds the halo at 0.92 with a small saturation push so glows stay COLORED.
> Falls back to direct rendering if the FBO won't complete. Neon, CRTs, the
> carpet confetti and the marquees finally throw light instead of being
> bright rectangles. Also: the double-parked compact's nose/tail/roof/glass
> were flat `sw_carRed`/`sw_black` swatches — now `carNose`/`carRoof`/
> `carGlass` (grille, headlight pods, bumper scuff, rain beading, a reflected
> streetlamp), and the across-the-road block got its night back (facades
> darkened ~3x, lit windows do the talking). **THE EMISSIVE RULES** (full
> story in blender/HANDOFF.md §5c): 176 is the hard ceiling for any texel on
> an `{e:1}` quad (the shader multiplies by 1.45 — that is what turned
> "NUGGET" into a white slab); NEVER mean-grade an emissive region (the
> palette targets were measured before bloom existed); never bake a glow now
> that bloom is real. Verified: 60fps, zero new console messages, fallback
> path intact, facade back to baseline luminance while still blooming.
> **2026-08-08 (the Blender night, pt. 3) — 🏟 THE GRAND REOPENING:** the
> ENTIRE arcade hall + street + the five NPC regulars are Blender-rendered
> now. `blender/hallrig.py` (32 parametric texture builders — padded walls,
> cosmic carpet w/ emissive confetti, drop ceiling, raked brick, cabinet
> fronts w/ real coin doors, CRT bezels, 3D joystick control decks, backlit
> marquee acrylic, neon tube signage w/ 3D text + gold nug, the three
> shopfront dioramas, across-the-road block, road/pier/water, and the NPC
> skins: crumb breading, hood twill, waxed GRAVY cup, shingled feathers,
> warty dill) -> `blender/pack_hall.py` (grades to the measured procedural
> palette in `blender/hall_targets.json`, tints 10 marquee + 10 panel
> variants, bakes neon glow, packs ONE 337KB JPEG data URI) ->
> `js/hallArt.js` (loads before arcade-art.js). Every painter in
> arcade-art.js blits its region via `hallBlit()` and keeps its procedural
> rig as fallback — the hall degrades to the old paint, never to black.
> Identity text (marquee titles, shop neon, stickers, NUGCO badge) still
> draws at RUNTIME on top, so it stays crisp and the text positions are a
> contract with the Blender builds (see blender/HANDOFF.md §5b for the
> gotchas: NON-SQUARE street atlas math, measure-with-HallArt-OFF,
> emission-clips-hue, grade highlight protection). enter() re-bakes the
> atlases once if the sheet decodes late. Verified headless A/B on all 18
> zones: 60fps held, zero new console messages, art-OFF byte-parity with
> baseline (worst mean delta 1.36), palette means on target, cabinet-wall
> contrast +30% structured. Editable source: `blender/hall_textures.blend`
> (one scene per texture).
> **2026-08-08 (the Blender night) — 🎨 FRESH PAINT (GTN S2.12):** every GTN
> sprite is now a real 3D model — built parametrically in Blender
> (`blender/nugrig.py`), rendered top-down at 8× like DMA did for GTA 1,
> graded to the exact night palette, and shipped as ONE 22.7KB atlas
> embedded as a data URI in `js/gtaArt.js` (loads before gta.js;
> **nugget.png is still the only binary art asset**, and photo mode's
> toDataURL stays untainted). Fleet/wrecks/tint-masks, 6 citizen poses +
> the NPD cap, ground tiles (manholes!), cart/booth/crate/goldnug/trees.
> Livery, damage, lane paint, neon, weather stay procedural ON TOP. Every
> call site falls back to its old fillRect rig if the atlas fails — the
> city degrades to rectangles, never to invisible. The .blend sources +
> regen recipe live in `blender/` (README has the Unreal export path).
> Verified headless: 61fps, zero pageerrors. Sprint note: GTA_SPRINTS S2.12.
> **Same night, pt. 2 — 🏙 THE ZONING VARIANCE (GTN S2.13):** Beau reviewed
> S2.12 on prod and correctly called it invisible (A/B harness: +4% contrast
> — palette fidelity ≠ looking good). The fix, measured this time (+8–15%
> STRUCTURED contrast, verified by side-by-side crops): plazas w/ fountains
> + benches at four landmarks, park paths/ponds, alleys w/ dumpsters, vacant
> rubble lots w/ stripped wrecks — all APPEND-ONLY in gtaBuildCity (zero
> rnd(), pure gtaHash, after every existing claim: the city did not move);
> plus the procedural depth pass (curbs/gutters, building shadows on
> pavement, lamp pools, puddles), tiles v3 under a 44° raking rig with four
> hash-picked road variants (2.0 contrast = wallpaper, 1.5 = right), 4
> furniture roofs, and GTA_RISE 0.055→0.075. New state: `gta.deco` +
> `gta.decor`. Sprint note S2.13 has the tuning gotchas + the assess.js
> recipe — measure before calling anything prettier.
> **2026-07-21 — THE OVEN RELIGHT:** the first five games got deep upgrades
> (build log in `UPGRADE_SPRINTS.md`). 🐤 Flappy (biomes + finale), 🥣 Dunk
> (multi-sauce shifts), 🔫 Blaster (wave defense + Batter Bomber boss; now
> IIFE-wrapped + in `pausesStorm()`), 🏃 Run (biomes + rival + dash), 🧘 Sim
> (seasons + Sights + ENLIGHTENMENT; stays zen). Shared toolkit **`js/arcadeKit.js`**
> (`ArcadeKit`/`AK`: shake/hitStop/burst/makeFever/medal/tierSelect + difficulty
> localStorage) loads after storm.js, before the games. Each game now has its own
> CSS file (`css/flappy|dunk|blaster.css`; run/sim extended). New lore flags read
> by street NPCs (Dill's "case file"): `flappyStormFlown()` `dunkSecretServed()`
> `blasterHeld()` `runReachedPier()` `simSawStorm()`. Difficulty picks/bests live in
> `<game>TierLast`/`Best`. **Catch leak sealed:** `body.hall-open #modeSwitch{display:none}`
> hides the cabinet-hop switch in-hall (calculator storm keeps it). LESSON: game
> files share ONE global scope — prefix helpers or IIFE-wrap (Blaster's `spawnEnemy`
> clobbered Knight's; Flappy's `BASE_SPEED` clobbered Dunk's).

## Adding a new game (the full checklist)

1. `js/<game>.js` + `css/<game>.css`, script/link tags in `index.html`
   (script order matters: games load after `storm.js`, before `arcade-art.js`).
2. `js/storm.js`: `MODE_HINTS` / `MODE_BADGE` / `MODE_VERB`, a `sync<Game>()`
   call in `setStormMode` **and** `stopStorm`, a `step<Game>` branch in
   `stepStorm`, a tally branch in `updateStormHud`, and add the mode to
   `pausesStorm()` if the game owns the whole screen. If the game draws its
   own rich in-game HUD (like GTN), also add it to `MODE_COMPACT_HUD` — the
   storm card collapses to a translucent pill (hover / tap the badge expands).
3. `index.html`: HUD mode button, score tile, leaderboard tab.
4. `js/account.js`: `setScores`, `GAME_LABEL`, and the score-element map.
5. `worker/src/index.js`: the `GAMES` set, a `GAME_MAX_SCORE` plausibility
   cap, and the zero-map in `scoresForUser`. Pushing `worker/**` auto-deploys.
6. Arcade hall: an entry in `ArcadeArt.GAMES` (palette + attract scene in
   `js/arcade-art.js`) and `PLACEMENT` in `js/arcade.js` — **but the main
   atlas is FULL at 10 cabinets**, so new games go in `ArcadeArt.STREET_GAMES`
   with a street/world entry point instead (see the pier pattern below).
   Read the hall gotchas below first.
7. Score through `storm.caught += ...` (scaled by `storm.perFlyer` for
   parity with the other games) and let `stopStorm()` submit it.

## Arcade hall gotchas (js/arcade.js + js/arcade-art.js)

- **Texture atlas budget.** All hall art packs into ONE 2048×2048 canvas
  with a naive shelf packer. Every game in `ArcadeArt.GAMES` adds a marquee
  (512×128), side art (200×300), and control panel (224×112). It is FULL at
  10 cabinets (FAST FOOD took the last slot) — that's why game 11 (KEEPING IT
  REEL) is a **street game**: it lives in `ArcadeArt.STREET_GAMES` instead,
  gets NO cabinet/marquee/panel, and its world art goes on the street atlas.
  A 12th CABINET still requires packer work or a second page. Watch the
  DevTools console for `ArcadeArt atlas overflow at <name>` warnings;
  overflowed regions render BLACK (this shipped once: a 9th game silently
  blacked out the light tubes, neon strips, and five control panels).
- **Street games (the pier pattern).** `ArcadeArt.STREET_GAMES` entries cycle
  on the hall scoreboard and fetch leaderboards like cabinet games, but their
  entry point is a street hotspot (the pier's rod stand calls `launchGame`
  directly and sets `H.lastSpot` so `resumeHall` returns the player to the
  hotspot instead of a cabinet — `startZoom` clears it). The pier geometry is
  its own Builder buffer (`bufsStreet.pier`) drawn ONLY in the world pass:
  putting the water plane in the mirrored-reflection pass makes a second sea
  hover over the street. Pier walkable corridor is in `posValid`
  (x 21.05..33.0, z 9.5..12.3, through the gap in the east cap wall).
  Game 12 (GRAND THEFT NUGGET) follows the same pattern: a double-parked
  compact in the road (x −10.6..−8.2, z 8.75..9.95, near the bus stop) is
  the hotspot; its flank texture is `gtaCarSide` on the STREET atlas, and
  its hazards blink via glow kind `'hazard'` in the sprite pass (static
  emissive quads can't blink — the glows do it).
- **Quad winding.** New geometry must follow the per-wall winding rules
  documented in `buildScene` (see `wallX`/`wallZ` comments) or it will be
  back-face culled — "built but invisible" bugs (a cabinet was once placed
  facing into the wall, and a scoreboard was once wound backwards).
- **Placement collisions.** Check `PLACEMENT`, `H.hotspots`, and prop
  positions before placing anything: the east wall z=-14.2..-17.4 is the
  live scoreboard, west wall z=-16.8 is Battered Brawlers (the old
  poke-the-drape reveal gate was removed — mode key stays `brawl`), the
  entrance zone has a vending machine / change machine / velvet ropes.
  West wall front (-7.02, -2.2) is FAST FOOD (mode `kart`, the 10th
  cabinet) — the hall is now symmetric and effectively full.
- **Nugget Catch is a CRIME SCENE** (the Catch Incident: the storm was
  stolen — see the lore in street dialogue + the Brawlers campaign).
  Its cabinet stays but is taped off and unplayable (`startZoom` guard +
  prompt special-case in arcade.js); don't "fix" it back to playable.
- **Hall controls are FPS-style now.** Clicking the canvas requests pointer
  lock (mouse-look; a click plays whatever the crosshair dot is on); WASD
  walks and the ARROW KEYS look (they no longer alias WASD). The first ESC
  releases the lock, the second exits the hall — `H.plockT` guards the
  keydown handler so one ESC can't do both. Pointer lock is released
  whenever a dialog/modal needs the cursor and on game launch/exit.
- **Walk-up interactables** live in `H.hotspots` (label + AABB + `act()`).
  Cabinets get prompts automatically from `H.cabinets`.
- **The JUKEBOX** (entrance zone, x −4.8, left of the change machine):
  three synthesized loops + OFF, cycled on interact, remembered in
  localStorage `nugJukebox` (default OFF — opt-in ambience). Music is
  scheduled just-in-time from `stepJuke()` inside `stepAudio` (beat.js
  school), so it stops when a game launches (frame() stops) and respects
  the hall mute. Its cabinet is built ONLY from existing atlas regions
  (uv.dark + sw_ swatches — the main page is FULL, no new allocs); the
  lights are glow kind `'juke'`, pulsing via `jukeBeatLevel()`.
- **The street** (outside the doors, z > 0) is a real place: shops, lamps,
  a bus-stop exit hotspot, and FIVE NPCs with branching dialogue (`NPCS` +
  `openDialog` in arcade.js — nodes() rebuilds per chat so lines can react
  to progress flags like `H.nugFound`/`brawlBest()`). NPCs are real 3D
  geometry now (blob3/box3/tube3 helpers in buildStreet, one buffer each,
  idle bob + they turn to face the player mid-dialog via `n.curYaw`).
  Street textures come from a SECOND atlas (`ArcadeArt.makeStreetAtlas`,
  1024×2048 since game 15 — keep both axes power-of-two, the hall
  generateMipmaps it) with its own overflow warning — never add street art
  to the main 2048² page.
  While `H.dialog` is set, movement/prompt/tap input is owned by the
  dialogue panel; ESC closes the dialog before it can exit the hall.
  The walkable street is x ∈ (−21.1, 21.1), z ∈ (0.1, 13.5) in `posValid`,
  plus the PIER corridor east of the gate (see the pier pattern above).
  The GREASE GARAGE (x −17.1..−12.1) is OPEN (FAST FOOD), and the PIER GATE
  (east cap wall, z 9.0..12.8) is OPEN (KEEPING IT REEL, mode `reel`).
  Game 13 (DIP HOP, mode `beat`, the rhythm game) is the THIRD street game:
  a basement club door on the FAR wall (z=13.9, x −6.7..−5.3, faces −z —
  busSign winding) with a neon sign and glow kind `'thump'` (a bass-pulse
  alpha curve in the sprite pass, ~123bpm — hazard's sibling). Its hotspot
  launches `beat`; textures `beatDoor`/`beatSign` live on the STREET atlas.
  With it, the Hooded Nug is THREE-FOR-THREE (garage, pier, basement) — his
  rumor slate is CLOSED; he's "in R&D" for new ones. Playing the set well
  earns THE STORM REMIX encore, which sets localStorage `nugBeatEncore`
  (read via `beatEncoreDone()` in js/beat.js) — Hood + Dill react; Gravy
  Jones has a `drip` branch (DJ DRIP is his estranged nephew). Canon-safe:
  DJ DRIP only SAMPLED the harbor storm from the pier; nothing moved.
  Landing THE STORM in Keeping It Reel sets localStorage `nugReelStorm`
  (read via `reelStormLanded()` in js/reel.js) — the Hooded Nug and Detective
  Dill both have dialogue branches keyed on it. CANON UPDATE: the stolen
  storm from THE CATCH INCIDENT is ALIVE in the harbor off the pier (the
  syndicate dumped it); the case is "open forever", not closed — future
  games can still pull on this thread.
  DIP HOP itself (js/beat.js): audio + note chart are generated from the
  SAME seeded 16-step patterns (`beatGenTrack`), so gameplay always matches
  the music; the WebAudio clock drives `beat.songT` when running, dt when
  not. It's in `MODE_COMPACT_HUD` (the storm card would sit exactly on the
  DJ booth). Verification gotcha: the page autofocuses the amount INPUT, so
  synthetic Space/keys get eaten by the input guard — blur() first.

## Verifying changes (the pattern that works)

Serve statically (`python -m http.server 8787`) and drive headless Chromium
(Playwright, flags `--use-gl=angle --enable-unsafe-swiftshader`). The hall
exposes `NuggetArcade._H` (camera/state) so tests can teleport
deterministically. Capture `pageerror` AND console warnings (the atlas
guard is a warning, not an error). Screenshot and actually look at it.
Games can be launched directly via `setStormMode('<mode>')` while a storm
runs — use `setStormMode`, not a bare `storm.mode = ...` (which skips the
sync hooks).

## Deploys

Pushing `main` auto-deploys the site (GitHub Pages) and, when `worker/**`
changed, the API worker. Verify with `gh run list` / `gh run watch`.
The worker only allows the production origin — leaderboard fetches from
localhost fail CORS by design (the hall scoreboard shows its OFFLINE state).

## 🧊 Blender GEOMETRY (js/hallMesh.js + js/hallMeshData.js)

The hall can display real Blender meshes now, not just Blender *textures*.
`Builder.model(name, uvMap, xf)` in js/arcade.js appends a model's triangles
into whatever buffer is being built, resolving each vertex's uv against the
LIVE atlas rect for its region (the street atlas is shelf-packed at runtime,
so models store region-relative uv and never fixed atlas coordinates).

Rules if you touch it:

- **Every call site keeps its procedural box rig** in an `if (!Model)` branch.
  `HallMesh.on = () => false` in a harness gives the byte-identical old hall.
- The geometry payload is **not** in index.html — `js/hallMesh.js` injects
  `js/hallMeshData.js` async after first paint, and `enter()` waits on
  `HallMesh.whenReady()` if you click the arcade button before it lands.
- Vertex `tint` carries **baked ambient occlusion**. If you write a new call
  site, multiply, don't overwrite.
- `Builder.upload` uses 32-bit indices above 65535 vertices — the hall's
  static buffer is ~58k now, so do not assume Uint16.
- Adding/regenerating a model: edit `blender/hallmesh.py`, run
  `hallmesh.build_all(); hallmesh.export_all()` in Blender, then
  `python blender/pack_mesh.py`. Full conventions and the four traps that
  cost real debugging time are in **blender/HANDOFF.md §7**.

## 🔌 THE POWER PLANT — the hall's material renderer (2026-08-09)

The hall spent a year rendering `albedo × eight Lambert lights` and that, not
the textures, was why it read as a free game. A WebGL2 context now gets normal
mapping, roughness, metalness and GGX specular; **WebGL1 keeps the exact shader
that shipped**, because nothing in this repo is ever allowed to degrade to worse
than what it replaced.

Things to know before you touch it:

- **The ORM map's BLUE channel is a per-region opt-in dial.** At 0 the shader
  collapses to the old equation exactly. Everything unmapped is 0. That is how
  a region-by-region migration is possible at all — see `PBR_OFF` and
  `ROUGH_FIX` in `blender/pack_maps.py`, and `MAP_DEFAULTS` in arcade-art.js.
- **The albedo is FLAT BASE COLOUR now** (THE RELIGHT, 2026-08-09). `hallrig`
  used to bake a 44° key into every texture; `_flatten()` kills the lamps and
  renders under a uniform dome instead, so what ships is base colour × ambient
  occlusion. Regenerate with `render_flat --res 2` and pack from
  `blender/render_hall/flat`. The old lit set is still on disk to A/B against.
- **`makeAtlas()` returns `{canvas, uv, nrm, orm}`.** The material pages are
  painted by the SAME `alloc()` sequence — never write a second packer, and
  never reorder allocs on one page only.
- **No tangent attribute.** The TBN comes from screen-space derivatives, so it
  works on Blender meshes and hand-built quads alike. Adding a vertex attribute
  would mean touching every `Builder.quad()` call site in `buildScene`.
- **Lights are one world list** (`LIGHTS`, ~30 fixtures); the renderer uploads
  the nearest `MAX_LIGHTS` each frame. Add a fixture by pushing to the list —
  do NOT resurrect the old index-keyed street/pier override tables.
- **The ground past the doors is WET in the fragment shader** (`uWet`), keyed on
  normal.y, world.y and world.z. If you add ground geometry outside, it becomes
  wet automatically; if you add an indoor floor at z > 0.6 it will too, so check.
- **Regenerate:** `blender --background --python hallrig.py -- render_maps --res 2`
  then `python blender/pack_maps.py`. Colour is
  `... -- render_flat --res 2` then `python blender/pack_hall.py blender/render_hall/flat`.

**Packers never regenerate their loaders.** `pack_mesh.py` used to write
`js/hallMesh.js` and silently reverted the boot-ledger wiring the first time
anyone repacked geometry. `pack_hall.py`, `pack_mesh.py` and `pack_maps.py` all
emit only their `*Data.js` half now; the loaders are hand-maintained code with a
fallback contract.

**The boot screen** (`js/hallBoot.js` + `.hall-booting`) is where all payload
waiting happens. Anything heavy you add should `HallBoot.job(...)` before it
loads and `HallBoot.inject(...)` to fetch, so the bar stays honest — and it must
NOT go in index.html. The converter is the product; it paints first, always.


## 🌃 THE FOUR MOVEMENTS — sky, relight, ceiling, shadows (2026-08-09, late)

Nearly two-fifths of every frame used to be *nothing* — not dark, absent. Four
changes took dead black from 18.1% to 1.0% and near-dead from 55.4% to 14.1%
with the blown fraction going DOWN to zero. Read `blender/HANDOFF.md` §12 for
the full ledger; the parts that will bite a future change:

- **There is a SKY** (`GLSL_SKY` in arcade.js): a fullscreen quad pinned to the
  far plane, plus a procedural cloud deck, moon and compass-bearing skyline.
  One GLSL chunk written in the subset both ES 1.00 and ES 3.00 accept, so the
  dome, the fog and the WebGL1 shader all read the SAME palette (`SKY`). Change
  the palette and the whole night changes together. `H.sky = false` collapses
  the ambient AND the fog back to the shipped equation — that is the A/B seam.
- **Fog outdoors is aerial perspective**, not a constant. Use `skyFog()` and
  NOT `skyBase()` for it: at eye level a street ray does not travel through
  open sky, and using the dome's own colour paints the far wall orange.
- **Ambient is a hemisphere, and indoors its poles are INVERTED.** In the hall
  the bright environment is the carpet and the dark one is the ceiling, so a
  downward-facing surface collects `uAmbDown`. The ceiling was the blackest
  plane in the building because nothing was pointed at it.
- **The composite has a SHOULDER.** Highlights roll off instead of clipping.
  Before adding brightness anywhere, remember the sum lands in an 8-bit buffer:
  a texture capped at 178/255 still went flat white once bloom landed on it.
- **The atlas is 2× and it is ONE knob** (`AS` in arcade-art.js). `alloc()`
  scales the context and hands painters their ORIGINAL dimensions, so every
  hard-coded pixel offset in that file still lands. Gated on
  `MAX_TEXTURE_SIZE >= 4096`; a GPU that can't take it gets 1× and not a
  broken hall.
- **Emissive geometry lights the room** via `installEmissiveLights()`, derived
  from `PLACEMENT` — add a cabinet and it lights itself. A long fixture needs a
  RUN of point lights; one in the middle of a 6m tube lights a disc.
- **The ceiling is real geometry** (`ceilBeam` / `ceilLight` / `ceilDuct` /
  `hangSign` / `vestibule`, all MAIN atlas). Each is a 1m module stretched by
  its call site — the `trimBase` pattern. The flat ceiling plane stays as the
  coffer pan and as the fallback.
- **Shadows are BAKED ONCE at boot**, two overhead maps (hall + street) off the
  static buffers, and a light is occluded in proportion to how far above the
  surface it sits. The hall's map is shot from y=3.9, *under* its own ceiling —
  a world-space top-down map finds the ceiling first and shadows the whole
  room. WebGL2 only; `H.shadows = false` is the seam. Nothing dynamic casts.

## 🎞 THE LONG NIGHT — HDR, the lens, the skyline, the wet street, motion (2026-08-09)

Five acts on top of THE FOUR MOVEMENTS, all on prod. What will bite you:

- **The scene target is HALF-FLOAT now** (`RGBA16F` + `EXT_color_buffer_half_float`,
  WebGL2 only). This is the change everything else sits on. It used to be
  `RGBA8`, which meant the lit shader's brightest possible emissive —
  `tex.rgb * 1.45` — **saturated at 1.0 on the way in**, so a dim panel at 0.72
  and a neon tube at full tilt reached the bloom pass as the same pixel. Every
  frame measured `blown 0.00%` and three sessions read that as a win. It was the
  symptom. Probe the extension AND check the attachment: a driver can advertise
  it and still refuse. `H.hdr = false` is the seam; without it the 8-bit chain
  and `shoulder()` run verbatim.
- **`EMIS_GAIN` is 2.2 and it is not a brightness knob, it is a RANGE knob.**
  Swept against the two surfaces in this building with reading on them (the
  entrance marquee, the scoreboard). At 4.0 the neon looks great and "NUGGET
  ARCADE" is an illegible glowing bar — §12's marquee lesson from the opposite
  direction.
- **The bloom threshold does two jobs.** Obviously it picks what blooms. Less
  obviously, a wide blur of everything above it is the only thing lifting the
  dim end of this picture: set to a principled 1.0 ("brighter than white"), the
  street lost its haze and the drain wall went from 0.3% black to 30% black.
  It sits at 0.80, *under* where lit surfaces land.
- **The tonemap is Khronos PBR Neutral, minus its black-offset term.** ACES
  rotates highlight hues hard enough to undo two sessions of palette work. The
  reference curve's black offset cost `dead 0.63% -> 8.45%` in one run; without
  it everything below the compression point is bit-identical to what shipped.
- **The vignette is in the SHADER, before the tonemap.** `.hall-vignette` is an
  empty element now — it keeps the fade and the flash. If you put a gradient
  back on it the corners get darkened twice.
- **Grain is seeded per FRAME, not off `H.t`.** The harness pins the clock, and
  grain that freezes with the clock is a fixed pattern.
- **Rack focus is released in the frame loop, not in `stepZoom`.** Coming back
  out of a game lands in `'return'`, so releasing it inside the zoom step
  strands the hall permanently soft at the edges.
- **🚶 THERE IS NO HEAD-BOB, AND PUTTING ONE BACK IS A REGRESSION.** The hall
  shipped a full gait (31mm rise at 2× the step rate, 26mm lateral sway at 1×,
  a degree of roll) and Beau's verdict from prod was *"walking back and forth
  is not a fun feeling to see and should be removed."* Movement is a VELOCITY
  now — `glide()` ramps `H.vel` in over ~90ms and out over ~130ms, a blocked
  axis loses its momentum, and the only camera effect left is a 0.028 FOV
  widen keyed to real speed. Nothing periodic touches the camera while you
  move. `blender/tools/motion.js` has a `no-bob` anti-channel that FAILS if
  `H.cam.y` sweeps more than 4mm while walking; it exists because "movement
  feels weightless, add bob" is the reflex fix and this project already made
  it once. The right fix is momentum, not oscillation.
- **The skyline is a DATA panorama, not a picture** (`js/hallSky.js` +
  `blender/skyline.py`). R = haze, G = lit-window mask, B = surface shade,
  A = silhouette; the shader still mixes `SKY`. **Do not bake colour into it** —
  the whole point is that retuning the palette retunes the city. `WRAP_S` is
  `REPEAT` (u is a bearing), no mipmaps (a mip chain on an alpha silhouette
  bleeds sky into every roofline), and the V lookup is `1.0 - v` because
  nothing here sets `UNPACK_FLIP_Y_WEBGL`. The az→u mapping is **measured** by
  `skyline.py calibrate()`, not guessed.
- **`GLSL_CITY` is shared between an ES 1.00 and an ES 3.00 shader** via
  `#define texture2D texture` in FS_LIT2. It is deliberately NOT in FS_LIT —
  WebGL1 has no city and a sampler it never reads is a unit spent on nothing.
- **Puddles are a DIFFUSE effect first.** Built as a specular change they moved
  the picture 12%, because the road's ORM already opts fully into the material
  shader and `max(pbr, wet)` erased the rest. Water darkens what it sits on;
  that is what draws the shape. The mask uses a sharp `smoothstep`, not a ramp —
  `skyFbm` piles its output near the middle, so a linear remap gave a field
  whose average value was 0.09 and whose effect was correctly invisible.
  `uPuddle` is clamped **before** it multiplies anything.
- **One ceiling tube (the z = -9 run) is a `'fail'` light** that stutters every
  ~5s. Fixed position on purpose. `H.failLevel` is a harness seam.
- **Steam and splashes step unconditionally but DRAW only when `cam.z > -1.5`.**
  Neither belongs inside the hall.
- **THE COLOUR EXPERIMENT THAT MEASURED AS NOTHING — do not re-run it.** The
  hall photographs as one lavender wash. It is not the light balance: a 3×3
  sweep of cabinet-light against ambient moved chroma by less than one point,
  and raising the cabinet lights made the room brighter and slightly LESS
  colourful. The hue lives in the ALBEDO (S2.12's palette + THE RELIGHT's
  reflectances). `TUNE.cabLight` / `TUNE.ambDown` exist, both default 1.0.

**The verification kit is CHECKED IN at `blender/tools/`** — see its README.
`shoot.js` (16 spots, darkness + chroma), `crop.py` (sheet/ab/zoom/probe/
tunesheet), `tune.js` (sweep `NuggetArcade._TUNE` between frames), `motion.js`
(does anything actually move), `fallbacks.js` (the whole degrade matrix),
`probe.js`, `png.js`. Three sessions built this in a scratchpad and lost it.
Two rules it enforces that nothing else can: **a fallback that renders an
identical frame is a seam that never fired**, and **spots come from the game's
own hotspot `stand` values**, never from imagination.

## 🧱 THE GRIME — the street's walls (2026-08-09, latest)

- **🚨 `H.uintIndex` WAS WRONG AND IT NEARLY COST THE HALL.**
  `OES_element_index_uint` is a WebGL**1** extension; on WebGL2 32-bit indices
  are core and `getExtension` returns null. So it read false on every WebGL2
  context and `Builder.upload` fell back to `Uint16`, where an overflow does
  not error — it **WRAPS**. It never fired because nothing had crossed 65535.
  Two fire escapes took the street to 67765 and the block across the road
  rendered as a black smear (69% dead). **The hall's own static buffer is at
  64960 of 65535.** `upload()` warns from 62000 up now; if you see that
  warning, you are near the cliff.
- **`facadeBay` wears `$BRICK` sentinels**, remapped per bay by the call site in
  `buildStreet` — the §7 cabinet trick applied to a terrace. Runs of 3–5 bays,
  derived from the index so the street does not re-shuffle itself every reload.
  A missing remap makes `Builder.model()` bail to the flat painted wall behind,
  which is what the street looked like before — not a hole.
- **`brick2` is painted RENDER, not a second brick.** Two bricks side by side
  are still two bricks; the first attempt read as a chessboard. If you add a
  third wall, make it a third MATERIAL.
- **All brick wear must TILE.** The picks are functions of `(col mod 4, row mod
  8)`. A building's wear is a vertical story and a vertical gradient in a tile
  that repeats 2.2× up a wall is a set of stripes — the vertical story is told
  by geometry (sills, fire escapes, AC units) instead. And keep conspicuous
  features rare: this texture repeats every 1.4m, so 1-in-16 is a polka dot.
- **`mapmat()` has a `stain` channel** — mixes base colour toward a stain by the
  same wrapped map that drives the bump. That is where the soot comes from, and
  it works on anything that has been outside.
- **`pack_hall.py` reads `render_hall/FLAT`**, not the lit set. Pass it
  explicitly (`python blender/pack_hall.py blender/render_hall/flat`). Packing
  from the lit set silently re-grades the entire hall; the way to check is to
  repack and diff a region you did NOT touch.
- **`blender --background --python blender/hallmesh.py -- build_all` does
  NOTHING.** That file has no `__main__` block, so the command succeeds and
  exits. Drive it with a script that calls `build_all()` / `export_all()` and
  prints the per-model vertex counts — §12's "verify by reading a vertex range
  out of the JSON, not by trusting the call", one layer up.
- **The rig shoots a top-down ortho**, so anything whose top sits below a
  panel's face is INSIDE that panel and renders as nothing. Detail meant to
  read as recessed has to sit a hair PROUD with a wide bevel; the raking key
  does the rest. Same reason a "stain" plane standing proud renders BRIGHTER
  than the wall it is dirtying.
- **Thin ironwork gets `bevel=0.0`.** Everything else here is bevelled because
  a hard edge on a big flat surface reads as cardboard, but 20mm bar seen from
  eight metres does not need it — and the bevel tripled the fire escape to 6576
  verts against a buffer with 575 to spare.

## 🔁 FOUR ROUNDS — harbour, shadows, jukebox, vending (2026-08-09, latest)

- **🚨 A CAPABILITY PROBE THAT RUNS AFTER THE THING IT GATES IS NOT A PROBE.**
  `H.uintIndex` was fixed once (it tested a WebGL1-only extension) and left at
  the END of `build()` — seventy lines after `buildScene()` uploads every
  buffer. Still undefined where it is read. It only measured as fixed because
  nothing had crossed 65535 yet; the jukebox took the hall to 69863 and the
  room rendered as diagonal shards. It lives next to `hdrCap` at context
  creation now. **Worth auditing the others.**
- **The sea has its OWN shader path** (`sea`, gated on `vWorld.y` below the
  waterline). Before that it satisfied every wet-street test and was getting
  asphalt ripple and puddles. Do not merge them: a road is a rough surface with
  a film on it and smears; open water is smooth with SHAPE and stays sharp.
  The harbour plane deliberately runs past the far clip so fog closes it into
  the horizon, and `skyBase`'s ground→sky transition is TIGHT (-0.055..0.010)
  because a wide one paints bright sky below the horizon line.
- **Contact shadows ride the SPRITE pass with `ZERO / ONE_MINUS_SRC_COLOR`**,
  not the lit pass. Neutralise `uGlowGain` for that draw or a shadow that
  should be 1.0 comes out 1.7× darker. The lit-path version drew correctly and
  produced no pixels at any size; do not retry it.
- **Nothing in the model pass is transparent.** A "glass" box is an opaque box.
  Backlight the panel behind and stand the detail proud of it.
- **A flat panel inside a carcass must be a CLOSED SOLID** (§7 trap 2): an open
  shell has no inside, `_orient()` guesses from the part centre, guesses wrong,
  and the hall culls it. The vending machine's face rendered as a hole.
- **Do not re-map a region that carries baked text** (§5b): `vending`'s header,
  side and bin labels sit at fixed places in its rect. Its model wears the
  WHOLE region and the geometry goes around it.
- **A spot table only measures what it points at.** Sixteen spots aimed at
  walls, cabinets, roads and sky are why five characters had no contact shadow
  for four sessions without any number moving. `17-regular` and `18-vending`
  exist now. If you add something a player goes TO, add a spot that looks AT it.

## ✂️ THE EDGE — the hall had no antialiasing at all (2026-08-09)

`H.canvas.getContext('webgl2', { antialias: true })` has been in this file
since the hall shipped, and it has done **nothing** since THE FLOAT BUFFER:
that flag only multisamples the **default** framebuffer, and every pixel of
this room is drawn into an offscreen `RGBA16F` attachment instead. Three
sessions of lighting, geometry and material work went onto a frame whose every
silhouette was a hard staircase.

- **`postSetup` builds a MULTISAMPLED renderbuffer** (`msTarget`) and the frame
  binds *that*; `postDraw` resolves it into the single-sample texture with
  `blitFramebuffer` before the bloom pyramid runs. Resolving after the pyramid
  would bloom the aliased frame, which is the same class of mistake as
  tonemapping twice.
- **A multisample resolve blit must be `NEAREST`.** `LINEAR` is an INVALID
  OPERATION on a multisampled read buffer, and the failure is a silently black
  frame, not an exception.
- **Ask the driver about the FORMAT, not `MAX_SAMPLES`.** `RGBA16F` is
  colour-renderable only via `EXT_color_buffer_*` and multisample support for
  it is a separate question:
  `getInternalformatParameter(RENDERBUFFER, RGBA16F, SAMPLES)` returns the
  supported counts descending. `MAX_SAMPLES` says 8 on machines that will not
  give you 8 of *this*. Anything under 2× is treated as no MSAA.
- The MSAA depth buffer is `DEPTH_COMPONENT24`, not the 16 the resolve target
  used. The hall is full of decal quads sitting 3cm off a wall.
- Seam: `H.msaa = false` → the aliased frame, verbatim. In `fallbacks.js` as
  `no-msaa`, and it changes 6–91% of pixels depending on the spot.
- **Anisotropy was pinned at 4 with no reason recorded**; it asks the driver
  for its ceiling now. This is a floor game — carpet, road and sidewalk are the
  biggest things on screen and all are seen at a grazing angle.

**The lesson worth more than the fix: every statistic in the kit was blind to
this.** dead / near / blown / mean / sd / chroma are all *histogram* statistics
— they describe the distribution of colour in a frame and cannot see how that
colour is ARRANGED. So can a spot table full of aliased edges report a clean
sweep? It did, all night, for three sessions. `png.staircase()` (the `hard`
column in `shoot.js`) is the first arrangement metric in the kit: the
percentage of adjacent pixel pairs whose luma differs by more than 34. MSAA
moved it −10.1% overall and −30% on the street spots. Read it as a same-frame
A/B only — real detail is hard edges too, so a change that adds a neon tube
raises it honestly.

## 🏪 THE GROUND FLOOR — the block across the road gets doors (2026-08-09)

Fourteen bays of `facadeBay` stood on one brick panel each, 1.46m tall, running
42 metres without a single opening in it. It is in every street view in the
game and it was the last thing out there still reading as a backdrop.

Three units in `blender/hallmesh.py` — `shopShut` (roller shutter down, real
corrugation), `shopOpen` (stall riser, display window, goods in silhouette) and
`shopDoor` (a recessed porch with a panelled leaf and a bracket lamp) — dealt
per bay from a stable hash, plus `shopBlade` projecting over the pavement.

**Four things this cost time on, in the order they bit:**

1. **A recess is jambs + a head + a leaf at the back. It is NOT a solid box
   with the door inside it.** Both the porch and the shop door shipped as one
   "void" box in the first pass, so the box WAS the door and every detail was
   buried in it. The `preview()` render caught it before the browser did —
   which is the §8 loop working exactly as written.
2. **NOTHING IN THIS RENDERER IS TRANSPARENT** (§15 ledger, verbatim, and it
   was walked into again). A `shopGlass` pane in front of an emissive interior
   is an opaque black box in front of a light nobody will ever see. The LIT
   PLANE IS THE WINDOW; the joinery stands in front of it and the goods stand
   on it.
3. **Modelled beautifully and left unlit is still murk.** The first pass wore
   the terrace's own dark tints (0.5–0.7) and every piece of joinery was there
   and none of it was READABLE. The streetlamps stand on the curb at z 6.9 and
   this wall is at 13.9 — seven metres of road between the band and the nearest
   fixture. Tints went to 1.05–1.35 AND every unit got a light of its own.
4. **Fourteen amber fascias in a row is a 42-metre light fitting, not a parade
   of shops.** `$SIGN` is a sentinel like `$BRICK`; the call site deals a
   colour per unit.

**THE HEIGHT DECISION, which is the one worth re-reading.** The first build put
the whole storey inside facadeBay's existing 0..1.46 blank band. Every piece of
it was modelled and NONE of it read: at 9.7m from the arcade door that band is
90 pixels of a 760-pixel frame and a 1.13m door in it is a hatch. So the
masonry is lifted `TERR_Y = 0.56` and the storey is 2.02.

Not the 2.6m a real ground floor wants, and here is the constraint: **the
arcade door sees that wall across ~60° of vertical FOV, so every metre of
terrace eats roughly 66 pixels of the sky above it — and the sky above it is
THE SKYLINE, 156 modelled towers and a whole session's work.** A full-height
storey swallows it from the most-used vantage in the game. 0.56 was picked by
measuring what survived. If you raise it again, shoot `09-doorway` and
`16-skyward` and look at the crops.

- 🚨 **The ground floor is GATED ON `H.uintIndex`.** It adds ~24k vertices to a
  street buffer already at 59209, which puts it past the 65535 a Uint16 index
  can address — and an overflow does not error, it WRAPS (§14, §15, twice
  already). WebGL1 without the extension gets the brick band that shipped,
  which is a wall, not a hole.
- **Measure where the CAMERA is before deciding where a light goes.** The bus
  shelter's lit panels went on its ENDS first — correct for a route map, and
  the crop came back with the same black slab, because from the stop's own
  hotspot you are looking at the shelter's BACK. The backlit advert is on the
  back panel now and `10-busstop` finally moved.

| | dead | near | blown | mean | chroma | hard | fps |
|---|---|---|---|---|---|---|---|
| THE EDGE (18 spots) | 0.50 | 11.39 | 0.01 | 58.24 | 50.33 | 0.621 | 59.9 |
| THE GROUND FLOOR (18) | 0.42 | 10.05 | 0.00 | 60.71 | 49.92 | 0.650 | 55.7* |

`09-doorway` 13.50 → 10.26 near-dead, `13-drain` 25.14 → 17.65, `11-gta` 13.70
→ 11.04, `16-skyward` 19.70 → 15.21, and **`10-busstop` 29.63 → 26.29 with dead
black 0.74 → 0.32** — the tile §15 recorded as "has not moved all night".

\* the fps number is 13-drain dragging the mean: re-sampled three times a spot
it reads 58.9–60.1 at `02-aisle` and `09-doorway` and 51–59 at `13-drain`,
which is a close-up on the new geometry. Worth a look if a later act needs
budget back.

## 💧 THE WET ROAD — the biggest surface in the street was not in the mirror
   pass at all (2026-08-09)

The hall's reflections are a MIRROR PASS, not screen-space: the world is drawn
once flipped under y=0, and then a translucent floor plane is drawn over it so
the reflection ghosts through. `bufs.floor` is that plane and it has always
carried the hall's carpet **and the exterior sidewalk**.

The road was never in it. It was built into the opaque street set and drawn in
the WORLD pass — after the mirror, on top of it, hiding it. So the single
biggest object in every street view, the one THE WET STREET spent a whole act
giving an anisotropic ripple and a sharpened specular, was reflecting the sky
and the city and **nothing that was standing on it**.

- It cannot simply move into `bufs.floor`: that buffer is drawn with the MAIN
  atlas bound and `road` lives on the street sheet. The street gets its own
  floor buffer (`bufsStreet.floor`, `STF` in `buildStreet`) drawn in the same
  slot with its own texture.
- Road alpha **0.74** against the carpet's 0.87, and the mirrored street draws
  at **0.52** against the hall's 0.33. Wet asphalt under sodium is the most
  reflective thing in this game; carpet is carpet.
- **Do not put the road's own buffer in the mirror pass.** A road reflected in
  itself is a second road under the first one.
- Road dressing follows the same split: painted marks (crossing, stop line,
  asphalt repairs) go in `STF` because wet paint is the shiniest thing out
  there, and the ironwork (`manhole`, `gully`) goes in the OPAQUE set because a
  manhole is the one thing on a wet road that stays matt — and a dry patch in a
  mirror is what makes the mirror read.

**THE MEASUREMENT LESSON, and it is the important half.** Over eighteen spots
this act moved near-dead 10.05 → 10.13 and mean 60.71 → 61.10. Flat. The
picture is not flat — the road carries the shopfronts' colour down its whole
length now — but **near-dead punishes a reflective surface for reflecting a
night sky, which is the correct thing for it to do.** Same family as §13's
`blown 0.00%`: the number was not measuring what it was being read as. Look at
`09-doorway` before and after and then decide.

## ⚖️ THE GOVERNOR — the hall picks its own sample count (2026-08-09)

4× MSAA is close to free on a discrete GPU and brutal on a software rasteriser:
measured on ANGLE/SwiftShader here at **60.2fps flat with it off and 57–60 with
dips at 4×**. The honest answer to "how much antialiasing" is not a constant.

`governor(dt)` walks `H.msaaWant` down 4 → 2 → off when a two-second window
misses 48fps. Three rules keep it from being worse than the problem:

- **It only ever walks DOWN.** A governor that climbs back up oscillates at the
  boundary forever, which the player sees as the picture changing while they
  stand still.
- **It ignores the first ~3 seconds** (180 frames). Shader compile, the shadow
  bake and the async payloads all land there and none of them is the steady
  cost.
- **It measures a window, not a frame.** One long frame is a GC, not a verdict.

`postSetup` keys its cache on the requested count, so flipping `H.msaaWant` is
the entire mechanism — the targets rebuild on the next frame by themselves.

🚨 **`openHall` pins `H.msaaAuto = false` unconditionally, and any new tool must
keep doing so.** This box renders through SwiftShader and WILL trip the
governor; unpinned, an eighteen-spot run photographs the first six spots at 4×
and the rest at 2× and then reports the difference as a change. Exactly the
same class of bug as an unpinned clock. Seam name: `msaaauto`.

## 🎱 THE FLOOR PLAN — the hall had ten cabinets and an empty room (2026-08-09)

Fifteen metres by twenty, ten cabinets pushed against the walls, and twelve by
eighteen of empty carpet between them. Every other act this session was the
STREET; the hall is where the games are.

Four Blender models, all from MAIN-atlas regions because that sheet is FULL:
`airHockey`, `claw` (×2), `changeMachine` (the last procedural box in the room)
and `stool` (×5).

- **The air hockey table was chosen for its LIGHT before its shape.** Every
  other emissive in this room is at eye level or above — marquees, CRTs, neon
  trim, ceiling tubes — so the floor only ever got spill. A big pale lit plane
  at waist height in the middle is how an arcade actually glows, and it is why
  `08-ceiling` moved 17.72 → 8.29 near-dead without anything on the ceiling
  changing.
- 🚨 **Gated on `H.uintIndex`**, same as the shopfronts. The hall's static
  buffer was at 69863 and these take it to **85044**; the street is at 93959.
  Both are on `bytes: 4` — read off the live buffers, not assumed.
- **Kept out of the central aisle (|x| < 2) deliberately.** Click-to-walk
  drives straight at its target with no pathfinding, so the run from the door
  to the deluxe cabinet at (0, −18.7) has to stay clear or it wedges.
- Two new spots, `19-hockey` and `20-cranes`. **Third time this rule has paid:**
  the existing table aimed at walls, cabinets, roads and sky, and could not have
  photographed the middle of this room even in principle.

**Three tuning findings, all the same shape — a thing that is dark in a dark
room is not "moody", it is missing:**

1. `furnBody` at the cabinets' own 0.92 came back as **black slabs cut out of
   the carpet**. `cabFront` is a dark region and that carpet is the brightest
   thing in the room. 1.30. A machine has to out-read the floor it stands on.
2. The crane's prize box shipped with a dark `clawGlass` pane across the FRONT
   and the lit panel at the back — i.e. a crane machine seen through black
   card, because **nothing in this renderer is transparent**. That is the third
   time this session (shop window, jukebox before it, now this). *If you want
   to see INTO something, do not build the thing you would be seeing through.*
   Corner posts and a lit interior read as glass; the eye supplies the pane.
3. Then the flanks were lit **equally** with the back and it became a paper
   lantern — an even slab with no depth and no prizes visible. `clawLitS` at
   0.22 against the back's 0.46: a box you look into needs its far wall to be
   the brightest thing in it.

| | dead | near | blown | mean | chroma | hard | fps |
|---|---|---|---|---|---|---|---|
| THE WET ROAD (18 spots) | 0.42 | 10.13 | 0.00 | 61.10 | 49.93 | 0.655 | 60.4 |
| THE FLOOR PLAN (20) | 0.38 | 8.83 | 0.01 | 63.65 | 49.85 | 0.782 | 59.2 |

Spot-level, which is the comparable half: `02-aisle` 11.19 → 7.70 near-dead,
`08-ceiling` 17.72 → 8.29, `04-eastwall` mean 80.63 → 91.68, `07-jukebox` 4.94
→ 3.89, `18-vending` mean 71.17 → 79.97.

**On fps, honestly:** re-sampled five times a spot, this box reads **60.2 flat
with `--off msaa`** and 44–60 with 4× MSAA on. That is a software rasteriser
(ANGLE/SwiftShader), where multisampling is priced completely differently from
a real GPU. THE GOVERNOR exists for exactly this and would step such a machine
down to 2× and then off; the harness pins it, so these tables are always the
4× picture.
