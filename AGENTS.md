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
