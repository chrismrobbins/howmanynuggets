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
> **2026-08-24 — 🎡 REEL OF FORTUNE (game 16, mode `fortune`, js/fortune.js):**
> WHEEL OF FORTUNE, nugget-sized — the friend's pun was the GAME SHOW, and
> the first build heard "slot machine" (corrected the same day; if a request
> names a franchise, build the franchise). HOLD to wind the wheel (the power
> meter sweeps — your release IS the spin, deterministic physics, no RNG
> anywhere), land a wedge, pick a letter (type A–Z or tap the board): a hit
> banks the wedge value per occurrence (vowels pay HALF), a miss costs a 🎟️
> turn token, 💀 BANKRUPT (×2 wedges) wipes the round bank. Solve the phrase
> → bank pays out + 100 × remaining tokens. THE PUZZLES ARE ALL TRUE — case
> quotes, tag texts, rumors (FORTUNE_PUZZLES; Dill NOTICES). One wedge is the
> 🌀 SWIRL: land it, bank it with a correct letter, then SOLVE that board =
> THE STORM JACKPOT (1500× perFlyer), sets `nugFortuneJack` /
> `fortuneJackpotHit()` — Hood + Dill react, 16th case-board exhibit (THE
> PAYOUT). Tiers via ArcadeKit.tierSelect (`fortune` store key): PENNY ANTE
> (4 🎟️) / PRIME TIME (3) / 🌀 THE RIGGED WHEEL (2, earned). It is the SIXTH
> walk-up machine and stands INSIDE THE HALL, Brawlers' old west-wall spot
> (x −7.02, z −16.8, freed by THE TWIN THRONES the same day): main atlas is
> FULL at 10 cabinets, so it is an `ArcadeArt.STREET_GAMES` entry with its
> face on the STREET atlas (`fortuneFace` — wheel + mini puzzle board; the
> marquee sub-rect re-draw stays at e 0.4, because 0.62 bloomed the title
> into a slab the day the readable-neon rule was written). Prop + hotspot in
> buildStreet like the crime-scene tape. Test seam: `window.fortuneDebug`
> (state / land(wedge) / guess(ch) / setPuzzle(i) / pickTier — land+guess
> drive the REAL handlers). Puzzle deck advances via localStorage
> `nugFortunePz`, sequential on purpose (a quit mid-board re-deals the same
> board — the wheel remembers). Verified headless: bank math, vowel half-pay,
> token loss, bankrupt, out-of-turns forfeit, solve bonus, jackpot flag +
> RIGGED unlock, banking, hall launch/return, zero atlas overflow.
>
> **2026-08-24 (same day) — 🎪 THE SET DRESSING (fortune graphics pass):** the
> shipped build was flat fills on a void, and the baseline shots caught two
> real layout faults at the 4K world shape (scale = floor(vh/230) → 427×240):
> the charge power meter drew at cy+r+6 ≈ 243 in a 240-tall world — OFFSCREEN
> exactly when the player is told "release to spin!" — and the prompt line
> overprinted the second letter row. The DOM banner at top:16% also landed ON
> the solved phrase. The rebuild: a cached studio SET (curtains, valance,
> beams, glossy stage floor), a real TRILON board (14-col grid with green
> filler tiles + white letter tiles like the actual show, staggered flip
> animation on reveals, category lozenge, solve shimmer), the wheel as a
> 3×-supersampled CACHED FACE rotated with one drawImage (jewel wedge
> palette, radial shading, pegs, stacked rim-inward labels, hand-drawn skull
> + glowing swirl — 10px emoji is mush), static rim with 16 chasing bulbs, a
> flapper that KICKS off pegs (deflection derived from wheel angle — still
> zero RNG), and the charge meter reborn as an arc gauge + bulb-fill ON the
> rim (can't be offscreen, it IS the wheel). Feel: BANKRUPT shakes the studio
> + red flash, solve sweeps a sheen over the tiles, jackpot rolls cyan rings
> out of the wheel, confetti is rotated fluttering paper from corner cannons.
> Banner is a lit sign at 54% now (never over the board) with a `.jack` cyan
> variant; it clears the flash toast (they overlapped). Tokens/skulls are
> DRAWN (emoji at 9px monospace renders as blobs headless). Measured with the
> kit's THIRD harness `blender/tools/fortuneshoot.js` (9 scenes × 2 world
> profiles, reads the canvas buffer, seeds Math.random, uses the new
> `fortuneDebug.set/freeze` seams; celebration scenes re-pin t just after
> their FX stamp or the party is over before the shutter): wheel-region flat
> 56.8 → 8.7, frame flat 46.5 → 29.0, sd 33.3 → 57.0. Live-play check: real
> space-hold spin at 61fps with motion ghosts on. KNOWN GAP: portrait phones
> (world W ≈ 130) were degenerate before the pass and still are — the letter
> tray needs a reflow, not smaller fonts.
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
  live scoreboard, and the BACK WALL is 👑 THE TWIN THRONES (2026-08-24):
  Knight at (-1.75, -18.7) and Battered Brawlers at (1.75, -18.7), both
  deluxe, torches outboard + one shared centre pole. Brawlers' old west-wall
  spot (z=-16.8) is open wall now (the
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
- The geometry payload (~956KB gzipped since THE CAST) is **not** in index.html — `js/hallMesh.js` injects
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

## 🚸 THE PAVEMENT, THE HORIZON AND THE REGULARS (2026-08-09, latest)

Three things, all picked off the previous act's own crops rather than its
numbers.

### The horizon bar was still there, and here is the arithmetic

§13 recorded the solid orange strip between the water and the skyline as *"the
single largest defect in the worst-measuring frame in the build"* and tightened
`skyBase` from `-0.30 .. 0.015` to `-0.055 .. 0.010`. It was still there,
thinner. The numbers, because the next session will need them:

- the sea sits at **y = −0.42** and the eye at 1.62, so at the **70m far clip**
  the water's top edge is at **d.y = −0.029**;
- **the skyline panorama's towers stand on a ground plane at the camera's own
  height**, so their feet land at latitude ≈ 0 (**d.y = −0.006**) even though
  the panorama is mapped from −4°. The bottom ~3.7° of it is empty alpha;
- water to −0.029, city from −0.006, and the sky between them was still ramping
  up to full sodium. ~15px of orange, right across the frame.

So the ramp has to run the **other way from the obvious guess**: still at
GROUND colour where the water ends, reaching full sodium only somewhere ABOVE
the city's feet, where the silhouette covers it anyway. `-0.026 .. 0.042`.
(Ramping it the intuitive way was tried first and made the bar *brighter*.)
`15-pier` `hard` 0.942 → 0.722 and the bar is a haze gradient now.

**The root fix is in `blender/skyline.py`:** render the towers standing on a
plane BELOW the camera so the silhouette fills the panorama's bottom rows.

### A comment is not a measurement

`TUNE.aberration` was `0.0035` with the comment *"~1px at the corners of
1280x760"*. Do the arithmetic: `off = d * r2 * uAberr`, d aspect-corrected, so
at the corner d = (0.84, 0.5), r2 = 0.955, split = 0.0028 of UV = **3.6
pixels**. That is a rainbow on every roofline in the skyline and it reads as a
compression artifact. 0.0011.

### The pavement

THE WET ROAD dressed the road and left the pavement it faces as a grid of clean
grey slabs — the bottom third of every street frame and closer to the camera
than anything else out there. `bollard` (×13 down the kerb — a flat slab has no
depth cue, thirteen objects marching away down one line have nothing but),
`cellarHatch` (×3, matt where everything round it is wet), `paperBox`,
`planter`, `standpipe`.

**Positions are picked against the LIVE hotspot table, not by eye.** Every
`stand` in `H.hotspots` is somewhere a click sends the player, and a planter
dropped on one is a hotspot that can no longer be reached — which does not look
like a bug, it looks like the game ignoring you. Also kept clear: the door
approach (|x| < 2.2 out to z 5), the crossing, and 0.9m round each lamp. The
first newspaper box went at x −1.2 and stood dead centre of the `09-doorway`
crop hiding the crossing; the pavement is 42m long and nothing needs to be in
the one place the player looks first.

### 🧍 The regulars stop being statues

Five characters have stood out there since the street opened with one thing
moving on them: a 6–11mm sine on their own height. That is a breath, and a
breath alone reads as a WAXWORK — the eye catches the stillness long before it
notices the detail in the model.

There is no skeleton and there is not going to be one; each regular is a single
static buffer drawn with one model matrix. **But a model matrix is a rigid
body, and a person standing still is mostly a rigid body doing three things** —
shifting weight foot to foot, rolling a little into the shift, and looking
around when nobody is talking to them. All three fit in the matrix already
there. The shift runs at 0.37× the breath rate and out of phase with it so the
two never line up into a bounce; the roll goes INSIDE the yaw or the body tips
toward a world axis and reads as sliding; and the glance switches off the
moment you talk to them, because being looked at is the one time a person's
head stops wandering.

`motion.js` gains `npc.shift` and `npc.yaw`. Two tool findings came out of it:

- 🚨 **`NuggetArcade._NPCS`, not a bare `NPCS`.** `new Function` bodies run in
  GLOBAL scope and `NPCS` is a const inside arcade.js's IIFE, so the bare name
  throws a ReferenceError *inside the rAF tick* — the sample promise then never
  resolves and playwright reports **"promise was garbage collected"**, which
  looks nothing like the mistake it is.
- **The `no-bob` anti-channel needs a pre-roll.** The idle breath fades over
  the first ~150ms of a walk, so a sample taken from the instant the key goes
  down catches its tail and reports 0.0044 of "head-bob" that is really a
  lungful of air on the way out.

### And the bus stop, finally

One backlit advert on the shelter's back left the other two panels as dark
glass, i.e. two thirds of the thing still the black slab that has made
`10-busstop` the worst tile in the game all night. Glazing with a lit street
behind it is not black. **`10-busstop` 29.63 (session start) → 19.47 near-dead,
dead black 0.74 → 0.04, mean 62.73 → 83.39.**

| | dead | near | blown | mean | chroma | hard | fps |
|---|---|---|---|---|---|---|---|
| THE FLOOR PLAN (20 spots) | 0.38 | 8.83 | 0.01 | 63.65 | 49.85 | 0.782 | 59.2 |
| THE PAVEMENT (20) | 0.38 | 8.42 | 0.01 | 64.80 | 49.35 | 0.777 | 58.8 |

## 🧍 THE CAST — the regulars are articulated (2026-08-12)

Every model in this hall used to be one rigid object drawn with one matrix, and
`blender/tools/motion.js` measured exactly what that cost: **twelve moving
channels in the whole game, and only two attached to a person** (`npc.shift`,
`npc.yaw` — both whole-body transforms). Animation was the one layer of this
picture that had never been touched at all. Full story in `blender/HANDOFF.md`
§17; here is what will bite a future change.

- **A regular is a SET OF PARTS now.** `blender/hallmesh.py` has a `CAST` table
  declaring each character's parts and their pivots; `_articulate()` emits the
  geometry TWICE — the one-piece model unchanged, plus one object per part.
  `js/arcade.js`'s `makeNpc` picks between three tiers, each strictly better than
  the next: **the part set → the one-piece Blender model → the procedural
  blob3/box3 rig**. A part set is used only when EVERY part resolves, and the
  check runs before anything uploads. Half a set would be a headless nugget.
- **The rigs are ANATOMICAL, not one skeleton.** There is no skeleton here and
  adding one would make every character worse: Crumb has no neck (he articulates
  at the shoulders and ankles), Dill tips his HAT, Gravy is a cup and only his lid
  moves, Hood's cowl turns while the robe stays put, and Henrietta — the only
  real neck in the cast — gets the only real head turn plus THE PECK. `POSE` in
  arcade.js is five bespoke functions keyed by id. Keep it that way.
- **The head leads; the body only turns away what the neck cannot reach.** That
  single ordering is most of the effect. A consequence worth knowing: a body-yaw
  motion channel on an articulated character correctly reads DEAD, because an
  idle glance fits inside `headMax` and the body genuinely should not move.
- **Pivots ride in the GEOMETRY** (`extract(pivot=)` → `"v"` in hallMeshData →
  `HallMesh.get(name).pivot`). Do not add a copy to arcade.js. §16's ledger: a
  constant typed in two files is a constant that will disagree with itself.
- **Splitting a model costs baked AO and texture scale unless you pay for both.**
  `_bake_ao` raycasts an object against itself, so sibling parts must be passed
  as `occluders` or the head stops shading the shoulders; `finish()` projects UVs
  against the part's own bbox, so parts must be given the whole character's box
  as `uv_box` or the neck becomes a visible seam.
- **Breathing is a SQUASH, not a rise.** The old vertical `bobAmp` was the
  head-bob mistake one scale down (§16, THE GLIDE) — periodic translation reads
  as floating. `bobAmp` is still in `NPCS` because tiers 2 and 3 have no parts to
  squash and must keep the motion they had.
- **The crane machines' claws move** (`H.claw`): the body bakes into the static
  buffer, the trolley and grab are their own buffers drawn per-instance. Two
  parts and not one because a trolley on a rail must not tilt. Consequence: they
  left the static buffer, so they no longer cast a baked shadow.
- 🚨 **A gesture is only visible while `H.dialog` is set, and every harness call
  to `stand()` clears it.** Dill's brim and notepad, Gravy's lid and Crumb's
  unfolding arm were unphotographable by anything in this repo until
  `pose.js --talk <id>` existed. If you add a gesture, verify it with `--talk`.

**Two new tools and two new seams in `blender/tools/`:**

- **`pose.js`** — walks the clock and shoots the frames; `crop.py strip` lays
  them out in clock order. Everything else in the kit measures ONE FRAME at a
  PINNED CLOCK, which cannot see a rig that breaks at the extremes of its cycle.
  `--look <npcId>` frames a regular off its own hotspot `stand` and height, so no
  camera spot has to be invented; `--talk <npcId>` opens the real dialogue.
- **`no-cast`** in the fallback matrix — hides the part models and leaves the
  one-piece characters (tier 2). **`17-regular` is in `fallbacks.js`'s CHECK list
  now**: the seam degrades the five regulars and none of the three spots it used
  to sample has a regular in it, so it would have diffed at ~0% and reported a
  seam that never fired. `21-hen` is a new `shoot.js` spot, from her own `stand`.

## 🧱 THE VERTICAL PLANE — the walls and the game doors (2026-08-12)

Round 2 of the same session, picked off round 1's numbers. The `hard` column
splits this game in two: every frame whose subject is a WALL or a DOOR ran
0.26-0.42 while the cabinet-and-carpet views ran 1.1-2.2, and `12-club` — DIP
HOP's front door, one of five street entrances a player walks up to — measured
**0.001**. It was two quads. Full story in blender/HANDOFF.md §18.

- **`clubDoor` PROJECTS, it does not recess.** The door sits in the 6m gap
  `buildStreet` leaves in the terrace (bays are skipped from x -9 to -3) with a
  painted wall right behind it, so there is nowhere to put a recess. The
  surround stands proud and the leaf is set 0.30 back INSIDE it. A recess is
  still jambs + a head + a leaf at the back — never a solid box with a door on it.
- 🚨 **A WALL RELIEF MODULE'S YAW STEERS ITS BULK, NOT ITS FRONTAGE.**
  `hall = (bx, bz, -by)`, so a module built with its bulk at blender +Y lands at
  hall -Z under yaw 0 — and the yaw has to point that bulk INTO the room or you
  have built the relief inside the wall. West -PI/2, east +PI/2, back wall PI,
  entrance wall 0. Every one of these was inverted in the first pass. It is
  §10's awning row wearing a different hat.
- 🚨 **v = 0 IS THE TOP OF A REGION.** The sheets are painted into a canvas
  (y down) and `extract()` maps a face's v straight into the region rect, so any
  `set_uv` on something that has to be READ must invert v. And when the text
  comes out wrong: **zoom 2x on a known-good baseline crop before touching an
  axis.** At contact-sheet size, mirrored / upside-down / rotated-180 are
  indistinguishable, and guessing flipped the wrong axis twice in a row. Word
  ORDER tells you about v; letter SHAPE tells you about u.
- **A frame is four rim boxes with a HOLE.** `wallVent` shipped its first build
  as a solid slab with all six louvre blades buried inside the frame box — §14's
  trap, walked into under a comment quoting §14's trap. `preview()` caught it
  before the browser did.
- **Recessing artwork puts it in the dark.** 78mm of shadowbox cost `03-westwall`
  12 points of mean. `extract()` exempts `em > 0.02` from the AO bake, so a small
  emissive lights the art and lifts it out of its own frame's shadow — and the
  posters are backlit boxes now, which is what they are in a real arcade.
- **Keep the ART's aspect, not the panel's.** The club's neon shipped once on a
  0.56m fascia, squashing a 2.2 x 1.1m sign into an unreadable glow bar: the
  round had deleted the identity of the thing it was improving.
- **Judge relief on `sd` and `hard`, never on `mean`.** Mean fell 1.3% while sd
  rose 2.9% and hard rose 10.4%. Relief casts shadow; that is the point.
- `$POSTER` is a sentinel like `$MARQ` and `$BRICK` — one `posterFrame` model
  wears all four poster regions, remapped per instance.
- New warning `arcade: no wall pilasters` is whitelisted in `fallbacks.js`, same
  as `no ceiling ribs`: on `no-mesh` the flat walls ARE the fallback.

## 🧽 THE WEAR — the hall gets dirty, and a lamp that was never wired (2026-08-12)

Round 3. The street got THE GRIME two sessions ago; the hall never did. Full
story in blender/HANDOFF.md §19.

- **The carpet carries a WEAR FIELD in its vertex tint.** `quadV` takes an
  `opts.tints` of four now, and `carpetFloor()` subdivides the floor at ~35cm and
  paints `carpetWear(x, z)` into the corners: a lane down the spine, branches to
  each machine, a standing patch in front of it, dark underneath, untrodden pile
  at the skirting — all derived from `PLACEMENT`. Wear is POSITIONAL and a tiling
  texture cannot hold anything positional (§14's brick stripes). The tint
  multiplies the EMISSIVE too, so worn carpet loses its glow, not just its colour.
- 🚨 **A wear field must be MEAN-PRESERVING.** The first build only subtracted,
  took the floor down ~20% and cost eight points of mean on every hall view — the
  carpet is the main light source for the bottom half of this room. Base is 1.07,
  untrodden edges go UP, and the field averages 1.023. Measure the average before
  you rebuild.
- 🚨 **`LAMP_X` IS THE ONE LIST OF WHERE THE STREETLAMPS ARE.** It used to be two:
  the posts were built in `buildStreet` and the lights were a separate hardcoded
  block in `LIGHTS[]` eight hundred lines away. Adding a fifth lamp to the east
  end built a post with a glow sprite and NO LIGHT, and the two tiles it was
  meant to fix came back pixel-for-pixel identical. **A change that measures as
  exactly nothing is usually not a weak effect — it is two lists that disagree.**
  Wiring it properly took `14-croft` from 7.27 near-dead to 0.72 and `21-hen`
  from 37.8 to 31.4.
- The crane prize boxes are no longer blown: `clawLit` 0.46 → 0.30, `clawLitS`
  0.22 → 0.14. You can see the prizes in the far machine now.

## 🪟 THE PANE — the renderer learns about glass (2026-08-12)

Round 4. "Nothing in this renderer is transparent" is written in the handoff five
times (shop window, jukebox cards, crane prize box, bus shelter, club porthole)
and every one was answered with the same workaround. This is the capability they
were working around. Full story in blender/HANDOFF.md §20.

- **The pane pass is ADDITIVE and that is the design, not a shortcut.** Real
  alpha needs back-to-front sorting and this renderer bakes its geometry into
  static buffers with a fixed draw order. Glass at night is a REFLECTION over
  what is behind it, and addition is order-independent — so there is no sort to
  get wrong. `drawGlass()`: `uGlass = 1`, blend `ONE, ONE`, `depthMask(false)`
  with the depth TEST still on, draw, restore. Write depth and a pane hides
  everything after it; drop the test and a wall stops hiding the pane.
- **It is a branch in FS_LIT2, not a new program.** R, Fresnel, `skyBase`, the
  city panorama and the specular were all already computed there for the wet
  road. Indoors there is no sky, so a pane returns the ambient hemisphere.
- 🚨 **A FLAT PANE DOES NOT READ AS GLASS.** Same `NdotV` at every pixel means a
  constant Fresnel, so the pane lifts uniformly and reads as "the screen got
  brighter". `glassDome()` lays it out 5x5 with the centre 28mm proud, so the
  middle stays clear and the edges rake into reflection. 5 segments and not 3:
  `quadV` gives one normal per quad, so the ramp arrives in bands and three of
  them read as stripes.
- Glazed: the ten cabinet CRTs, both crane machine fronts (the case §16's ledger
  had ruled out), and the two lit shopfront window bands.
- Seam `H.glass = false`; `no-glass` in the fallback matrix. WebGL1 never gets
  it — FS_LIT has no pane branch and is not gaining one.
- **The table is FLAT and that is reported, not hidden.** Panes cover a few
  percent of a frame; a whole-frame average cannot see them. Which is the real
  finding: **this kit measures FRAMES and has never had a way to measure a
  SURFACE.** Three rounds running have now produced changes it cannot see —
  §17 (clock is pinned), §18 (mean moves the wrong way for relief), §20 (area
  too small). A per-region statistic is the obvious next tool.

## ⚓ THE MOORING + 🔬 region.js — measure a surface, not a frame (2026-08-12)

Round 5, closing the loop on the session's own finding: three rounds running had
produced changes this kit could not see. Full story in blender/HANDOFF.md §21.

- **`blender/tools/region.js` measures a BOX, not a frame.** Two tags, one spot,
  four numbers, and it reports that box's own dead/near/blown/mean/sd/chroma/hard
  with the delta. Reads PNGs shoot.js already wrote — no browser, works
  retroactively on every tagged run in `_shots`. Validated on the rounds it was
  built to explain: THE PANE read **+0.25% mean on the frame and +7.5% on the
  CRT**; THE CAST read +0.02% on the frame and **-25% near-dead on Crumb**.
- **`trawler`**, moored off the pier head — `15-pier` had been the worst tile all
  session (32.5 near-dead, the only spot over 1% dead black) and §16 was right
  that its number lies. What it lacked was anything ON the water: scale,
  foreground, motion. She rocks (roll dominant, pitch out of phase, small heave);
  two new motion.js channels watch her.
- 🚨 **THE METRIC CAN OVERSELL, AND THAT IS THE DANGEROUS DIRECTION.** The first
  placement put her 5m off the gate filling half the frame with a blown
  wheelhouse, and the table LOVED it: near 32.5 -> 29.9, mean +6.4, sd +31%. The
  crop said she was a wall. Correctly placed at 15m the frame numbers fall back
  to nothing — while `region.js` on the water she occupies says sd **+81%**,
  chroma **+73%**, near-dead **-21%**, hard **-38%**. Suspect a number that
  agrees with you exactly as hard as one that does not.
- 🚨 **`no-bob` FIRED AND IT WAS A FALSE POSITIVE — DO NOT RAISE THAT THRESHOLD.**
  It runs LAST, and every channel above it holds 'f' down without resetting the
  camera, so by then twenty walks have driven it into the back wall: z -17.85,
  `speed` pinned at 0.62, where the hall treats it as nearly-standing and the
  IDLE BREATH never fades. The channel was measuring that breath decaying (a
  smooth ramp 1.62376 -> 1.62025), not a bob. A fresh camera reads **0.00000**.
  It resets the camera to open floor first now. Raising the threshold would have
  blinded the only guard protecting a behaviour Beau asked for by name.

## 🥊 BRAWLERS ROUND 1 — THE GROUND (2026-08-13)

**Everything above this heading is about the arcade HALL.** This is the first
graphics work anyone has done on a *minigame*, and the first thing it needed was
an instrument, because `blender/tools/` could not photograph BATTERED BRAWLERS at
all: every tool there sits on `hallharness.js`, which calls
`NuggetArcade.enter()` and teleports `_H` around a 3D room. Brawlers is canvas 2D,
340x200, 185 `fillRect` calls, no camera and no renderer to degrade. Only `png.js`
and `crop.py` transferred. See `blender/tools/README.md` and `docs/brawlsession.md`.

**THE SEAM.** `brawlDebug({...})` (js/brawl.js, bottom) — Blaster, Storm Drain and
The Undercroft all had one; this game did not, which is most of why nothing had
ever measured it. Same contract as `croftDebug`: optional fields, fixed order
(seed → rules → place → pose → clock), returns the state it left behind.

- **The dice are pinnable.** Every `Math.random()` in brawl.js goes through
  `brawlRand()`; unseeded it *is* `Math.random`, and `brawlDebug({seed})` makes it
  a mulberry32. A belt-scroller is random placement end to end — depth lane,
  speed, waddle phase, golden roll, wander spawns, crate drops — so without this
  an A/B is comparing different cups.
- **The screen shake is a HASH OF THE CLOCK now, not a die roll** (`brawlJitter`).
  It reads identically while the game runs, and a held frame photographs the same
  twice; with `brawlRand()` in there, every redraw of one frozen frame shook
  somewhere else.
- **`brawlDebug({freeze:1})`** redraws one state forever (`brawlRedraw()`, which
  calls the step functions at dt 0 — they are pure draws at zero).
  **`brawlDebug({steps:n, stepDt:1/60})`** runs the REAL `stepBrawl` at a fixed
  timestep, which is the only honest way to look at a fighting game.
- Shoot `brawl.cv.toDataURL()`, **not** a page screenshot: the world buffer, at
  world resolution, so the storm HUD and the round banner cannot get in the frame
  and no resampling touches a game that is displayed at an integer scale.

**WHAT THE INSTRUMENT FOUND, and none of it is visible in a still frame:**

1. **Nothing in this game cast a shadow**, in a genre whose entire read is who is
   standing where — and `drawables.sort((a,b) => a.d - b.d)` has been sitting in
   `drawBrawl` the whole time, used for draw order only. A punch connects within
   `DEPTH_HIT` of your own lane, so the game's central rule was the one thing you
   could not see.
2. **An uppercut launched a cup's body six pixels into the air and left its FEET
   standing on the belt.** `y -= 6` was applied to the body only. Invisible while
   nothing was grounded; the first thing the new shadow put on screen.
3. **The victim's white flash first appears SIX FRAMES after the hit.** It is
   keyed `Math.floor(e.stT * 30) % 2`, and `e.stT` is 0 on the frame of impact —
   so the most important frame in the game is the one frame with no feedback in
   it. (Round 2's problem, recorded here because the tool found it now.)
4. **The hit spark expands from radius 0**, so at impact all four particles are on
   top of each other: one yellow pixel. Also round 2's problem.
5. A jab freezes the game for five frames (`hitstop = 0.05` at dt 1/60).

**WHAT SHIPPED THIS ROUND — the belt, which was 30% of every pixel in the game
and the least worked surface in it.** `brawlStripFloor` was twelve identical rows
of a 6px checker at one brightness from the wall to the bottom of the screen.

- **`brawlShade(hex, k)`** is the entire lighting model: one multiply, cached.
  This game had none — every surface was authored at full brightness as a literal
  and the three acts were told apart by palette alone.
- **The belt**: perspective (rows taller and cells wider toward the viewer), a
  light ramp per row, ambient occlusion at the wall junction, **light pools every
  210px in the act's own colour**, and grease. 12-coop was the best-looking tile
  in the baseline sheet by a distance and the only thing it had that the other
  eleven did not was one painted light pool on the floor.
- **`brawlShadow()`** — contact shadows for players, cups, all three bosses,
  crates, drops and thrown blobs, drawn inside the existing depth sort. `lift`
  makes the shadow shrink and stay on the floor while the body is airborne, which
  is the only AIRBORNE cue in the game.
- **`brawlLaneK(d)`** — four quantized depth shades on the cast (`nugBody`'s cache
  stays four entries wide per body instead of thirty).
- **THE FRONT ROW.** The crowd was thirteen identical dark-brown blobs bouncing at
  the very bottom edge with a third of each clipped off the canvas; they read as
  debris. Two rewrites failed before the third worked, and the reason is the note
  to keep: **at five pixels a head, a brown nugget on a dark floor is a brown lump
  and no amount of shading fixes it.** A crowd reads as a SILHOUETTE AGAINST
  LIGHT — flat black shapes, a warm haze behind them in the act's colour, a 1px
  rim where the light wraps each head, and a rail to stand behind.

**MEASURED** (`b-base` → `b1-final`, the 16 gameplay scenes; the five UI screens
are untouched and came back byte-identical, which is the control):

| | before | after | |
|---|---|---|---|
| `flat` whole frame | 70.9 | 52.9 | −25% |
| **`flat` belt band** | **79.6** | **40.5** | **−49%** |
| `bandMean` | 45.5 | 47.5 | +4% |
| `hard` | 2.66 | 4.12 | +55% |
| `near` | 26.5 | 32.4 | +23% |
| `chroma` | 44.6 | 41.8 | −6% |

`flat` (adjacent pixel pairs with IDENTICAL luma) is new, and it is the metric
this game needed: 185 `fillRect` calls means large dead-flat areas are its
characteristic failure, and no histogram statistic can see one. It is
`staircase()` pointed the other way — that counts hard edges, this counts the
absence of any edge.

**Two columns moved the "wrong" way and both changes are keeping.** `near` rose
because a light ramp, an AO gradient, contact shadows and a dark rail all add dark
pixels — the frame is not dimmer, `mean` went UP. `chroma` fell because lane
shading darkens saturated colour and shadows are neutral. §17/§18's lesson,
one game over: the crop decides.

**Balance notes, learned by getting them wrong first:**
- The ramp must brighten FORWARD past the original flat value, not just darken
  backward. The first pass ran 0.56..1.16 on colours whose luma was already 30,
  the belt came out dimmer than the checker it replaced, and a contact shadow on a
  luma-17 floor has nothing to be darker than.
- The AO is 11px at 0.30, not 15px at 0.46: the back lane went murky enough to
  lose a cup standing in it, and depth you cannot fight in is not depth.
- Grease must be short, low-contrast and biased toward the front rows. 40px bars
  at 0.14 across the whole belt read as render artifacts — long, straight,
  horizontal and evenly lit is what a *bug* looks like.
- `brawlShadow` builds its lozenge from a half-width profile, one row per entry,
  because it has to be CONTIGUOUS. The first version had a stacking bug that left
  one row empty and it read as a dark bar lying on the floor behind your feet.
- `nugBody`'s cache key now includes `dark`. The front row asks for
  `base === dark` to get a flat silhouette, and without it that request came back
  as whatever body was cached first. (The key had already been fixed once for a
  size collision — see the comment.)

## 🥊 BRAWLERS ROUND 2 — THE FIST (2026-08-13)

Round 1 built the instrument and it reported four defects in the impact frame.
This is those four, plus what fixing them turned up. **The layer is hit feedback**,
and it was picked because `brawlpose.js` could show that a landed punch and
standing still were the same picture — in a beat-em-up, the frame the fist arrives
IS the product.

**1. The hit spark expanded from radius 0.** Four particles at radius `t * 8`, over
a quarter of a second. On the frame of contact all four sat on top of each other,
so the entire feedback for a landed punch was **one yellow pixel**, and by the time
the star was big the hitstop was over and the cup had already been knocked back.
It starts BIG, starts WHITE and collapses now, with a cross-shaped core for the pop
and shards that carry the direction of the blow (`brawlFx(x, d, h, kind, dir, big)`).

**2. Every part of it is KEYLINED, and that is not decoration.** The victim goes
solid white on contact (below), and the first cut of this shipped a beautiful white
star that was **invisible in the one frame it existed for**, because it was
white-on-white. A 1px dark backing makes it read over the flashed cup, over the lit
belt and over a neon wall. Same treatment on the guard clang for the same reason
one step further: the only cup that guards is Mayo, and she is cream.

**3. The victim's white flash arrived SIX FRAMES LATE.** The test was
`e.st === 'hurt' && Math.floor(e.stT * 30) % 2` — and `e.stT` is **zero** on the
frame of the hit, so `floor(0 * 30) % 2` is 0 and the flash reporting a punch first
appeared a tenth of a second after it. Now `(e.stT < 0.05 || …)`: solid for three
frames, then the flicker it always had. **And those three frames are exactly the
hitstop**, because `stT` cannot advance while the game is frozen — so the fix
produces the classic impact freeze (frozen frame + white silhouette) for free.
Patched in all four rigs: `drawCup`, `drawBoss`, `drawDijon`, `drawClucker`.

**4. The player had no hurt flash at all, in either direction.** The enemies have
had one since launch; the thing you are actually watching just started blinking a
sixth of a second later. It gets three frames of ONE CLEAN WHITE SILHOUETTE — the
first attempt left the red headband and the dark pupils on the white body and it
read as a ghost, not as a hit. **A flash frame is a shape.**

**5. WEIGHT.** Every hit in this game froze the screen for exactly 0.05s and shook
it not at all, so a jab, an upper, a spatula swing and a KO all landed the same.
Now: jab 0.045 / upper 0.075 / KO 0.10 / boss KO 0.14 of hitstop, with shake to
match, and `brawlShadow`'s `lift` already makes the upper's launch read.

**6. A lethal blow spawns ONE bigger burst, not two.** `brawlHitEnemies` only
sparks `if (e.hp > 0)`; `koCup` throws its own `big` one. Stacking them put a white
cloud on screen with a cup somewhere inside it.

**7. THE THREE-PHASE PUNCH.** `ext` was one sine hump over `[0, active1]`: the fist
appeared already extended, peaked, returned to neutral and then sat there for a
third of the move. Now `0..active0` pulls BACK 3px (anticipation the eye can read),
`active0..active1` is the throw *and is exactly the hit window*, and `active1..dur`
is a short over-pull into guard. Plus a shoulder-to-fist streak so the throw
carries speed instead of teleporting a red square to arm's length, and the glove
goes **white while its hit is live**, which is the cheapest possible way to say
which fist did it.

**8. A block now moves the blocker.** `blockT` leans Mayo away from the punch. A
block that does not move the blocker reads as the punch having gone through her.

**MEASURED — and the metric that matters here is one the hall treats as a defect.**
`blown` (pixels above luma 247) on the frame of contact:

| scene | before | after |
|---|---|---|
| 13-jab | 0.018% | **0.175%** |
| 14-upper | 0.018% | **0.188%** |
| 15-cyclone | 0.026% | **0.324%** |
| 16-ko | 0.026% | **0.124%** |

In the hall, blown highlights read cheap and the column is a warning. **In a
fighting game, `blown` on the impact frame IS the impact frame**: before this round
a landed punch put about twelve white pixels on a 68,000-pixel screen. The twelve
stage scenes came back numerically identical to `b1-final`, which is the control —
nothing outside combat moved.

## 🥊 BRAWLERS ROUND 3 — THE DISTANCE (2026-08-13)

**The layer: parallax, and it had never existed.** The background was ONE canvas
drawn `drawImage(brawl.bg, -round(cam), 0)` — dead 1:1 with the camera, which is
the one thing a side-scroller must never be. Act 2 had a *distant skyline and a
moon* painted into the same canvas as the kerb, so the moon slid past at walking
pace. `brawl.bg` is `{ back: [...], fore: [...] }` now, four planes:

| | rate | |
|---|---|---|
| far | 0.28 | sky + skyline outdoors, the ceiling and the deep room indoors |
| mid | 0.60 | a nearer tower row, the extract duct, the gantry |
| wall | 1.00 | everything the game already had, unmoved |
| fore | 1.50 | overhead only — heat lamps, street wires, the ceiling pipes |

**THE TWO RULES IT IS BUILT ON, and both were learned by nearly getting them wrong.**

**1. Opening the wall layer means starting its BASE FILL lower, not erasing a band
out of it afterwards.** The wall was opaque from y 0 to the floor, so a far plane
behind it is a far plane nobody will ever see. Each section's base fill (and its
brick loop, and its top-shadow gradient) now starts at `brawlGap(ground)` — about
32px at the default viewport — and **every prop keeps its own y**, so the fridge,
the icicles, the vats, the robot arms and the vault door stand SILHOUETTED against
the distance instead of against more wall. Erasing the band instead would have
decapitated all five. Four things genuinely anchored to y 0 did have to move down
(act 1's bunting, the icicles, the freezer rail and its slabs, act 2's fire
escapes), and each got a coping course / lintel at the cut so it reads as a soffit
rather than as a crop.

**2. The foreground plane stays OVERHEAD.** A near layer at 1.5 is the strongest
depth cue available here and also the fastest way to ruin a fighting game: a
fighter is 20px tall standing at y 100–124, and anything drawn over that is a
frame where you cannot see what hit you. Every fore layer lives in the top 20px.
Act 3's three ceiling pipe runs were already up there **at 1:1**, which is the
flattest possible place to put a straight horizontal line, and simply moved.

**Two things the first pass got wrong, both found in the crop, not the table:**

- **One warm restaurant ceiling ran the length of act 1 and hung red heat lamps
  over the walk-in freezer.** A far layer at rate `r` is displayed at `far-x =
  cam * r`, so a section boundary at world X lands at `X * r` — which means the
  light up there CAN follow the room you are standing in. Act 1's far plane and its
  fore lamps are banded into four now: warm kitchen, cold walk-in, night-blue dock,
  gold vault.
- **The skyline lit one grid cell in three and came back as a wall of yellow
  squares.** One in seven, dimmer, and 2×3 windows instead of 3×4. At this scale a
  distant city is mostly DARK with a few lights in it, and the darkness is the read.

**MEASURED** (`b2-fist` → `b3-final`, 16 gameplay scenes). This round is the first
one whose numbers all move the way you would want without an argument:

| | before | after | |
|---|---|---|---|
| `dead` (pure black) | 0.42 | 0.20 | −52% |
| `near` (luma < 20) | 32.4 | 24.6 | −24% |
| `mean` | 41.5 | 43.7 | +5% |
| `flat` | 52.9 | 51.8 | −2% |

The two frames that had real pure-black regions were the ones looking up at nothing:
`03-dock` 2.67 → 0.71 and `04-vault` 3.29 → 1.00. fps 60.5 unchanged with four
`drawImage` calls per frame instead of one, and all four of 640×480 / 800×400 /
1440×900 / 1920×1080 render clean (the layer widths are computed from `brawl.W`, so
they resize with the world).

**`brawlpose.js --seq pan`** exists because none of this can be shot any other way:
it walks the camera a fifth of a second at a time so the strip shows the planes
sliding across each other. A layer's width is `ceil((LEN - W) * rate) + W` — exactly
as wide as it can ever be drawn, and a layer one pixel short shows the void at the
end of the act.

## 🥊 BRAWLERS ROUND 4 — THE CARDS (2026-08-13)

**This round did not have to be chosen. The table chose it.** After three rounds on
the game, the five screens AROUND the game were the only untouched layer left and
they measured as the worst frames in it by a distance:

| | dead | near | mean |
|---|---|---|---|
| `19-cut-diner` | **94.0%** | 95.6% | 7.9 |
| `21-credits` | **93.0%** | 93.4% | 13.8 |

Ninety-four per cent PURE BLACK on the intro cutscene, which is the first thing a
player ever sees, and ninety-three on the screen you reach by clearing the whole
campaign. They were five small pixel tableaus floating in a `#05060c` void with
letterbox bars over the top.

**This is GTN S2.13's lesson one game over** (`blender/HANDOFF.md` §1). S2.12
re-rendered every sprite in that game in Blender, graded to the measured palette,
shipped, and Beau called it invisible from prod — the harness said +4% contrast.
What moved the needle was structured CONTENT: plazas, alleys, curbs, shadows, light
pools. So nothing here is a palette change. **Every scene gets a SET** — a backdrop
that fills the letterbox window, a floor with a light pool on it, something framing
the near edge, and characters big enough to act:

- **diner** — a window wall on the rainy night city, a pendant over the counter, the
  specials board, stools, and the door lit red from outside one line before it comes
  off its hinges. A booth back crops the near edge.
- **vault** — the door standing open with three shelves of sauce inside it, gold
  spilling out across the floor, Wasabi flat in the puddle.
- **penthouse** — gold stripes, the chandelier, the portrait watching, the rug the
  fall lands on, and the top hat rolled off to one side.
- **coop** — **round 1's crowd lesson, one screen over.** A hundred pixels of black
  chicken against a hot backlight, with a rim on her and one red eye. At this scale
  a silhouette against light reads instantly and nothing else does.
- **sunrise** — a real dawn over the harbour: the sun sitting on the water with a
  glitter path, dock cranes, pier planks, a mooring post cropping the near edge, and
  THE SWIRL still turning out past the docks, because `docs/casefile.md` says the
  case never closes and the last frame of the campaign has to say so.

Shared helpers: `brawlCutFloor()` (the lit floor + pool that did the most for the
belt in round 1) and `brawlCutShadow()` — **a cutscene where the actors float is the
same defect as a fight where they do.** The letterbox bars got a gradient off each
inner edge, because a hard black line across a 200px frame reads as a crop and a
falloff reads as a frame. The credits crawl runs over the ending at 62% dim.

**Two things the first pass got wrong, both found in the crop:**
- **The floor line was at 0.52 of the frame** — where the old tableaus put it — and
  every new set came back with fifty pixels of empty floor between the action and
  the bottom bar. 0.63 puts the cast in the lower third the way a shot is framed.
- **THE SWIRL was three straight horizontal dashes** and read as render scratches.
  Weather is a RING and has to be drawn as one.

**MEASURED** (`b3-final` → `b4-ship`):

| | dead | near | mean | flat |
|---|---|---|---|---|
| `19-cut-diner` | 94.0 → **30.8** | 95.6 → 42.3 | 7.9 → 31.3 | 96.9 → 59.6 |
| `21-credits` | 93.0 → **7.0** | 93.4 → 36.9 | 13.8 → 33.4 | 92.3 → 60.8 |

**Read that remaining 30% honestly: it is the letterbox.** The bars are 14px + 46px
of a 200px frame — 30% of the rows are supposed to be pure black. Inside the picture
window there is essentially none left. The 16 gameplay scenes came back with a
max mean delta of **0.0000**, which is the control.

**The scene table went 21 → 25.** §15's lesson from the hall, verbatim: *a spot table
only measures what it points at.* One cutscene was in the table out of five, and it
happened to be the one that was 94% black — the other four sets had never been
photographed by anything in this repo. Per-scene rows stay comparable across every
tag; the MEAN row is now historical for tags before `b4-cards2`.

**WHAT THIS ROUND DID NOT DO, and it is the obvious next thing.** Three screens are
untouched and still measure badly: `17-title` (near **88.9%**, flat 91.1),
`20-map` (near 77.8, flat 80.5) and `18-heat` (near 75.7, flat 85.1). All three are
type and geometry on a flat field. The title in particular is the second frame of
the game and has no set at all — `brawlCutArt` now has five of them sitting right
there to borrow from.

## 🥊 BRAWLERS ROUND 5 — THE REAL SCREEN (2026-08-13)

**Beau sent prod screenshots back off a 4K panel and they found a hole in the
harness itself. Read this before trusting any number in the four rounds above.**

`brawl.scale = max(2, floor(vh / 200))` and the canvas is sized in WORLD pixels, so
**the viewport does not just change how big this game is — it changes the SHAPE of
the frame.** `brawlharness.js` pinned 1020×600, which gives a 340×200 world at
aspect 1.70, and asserted it on every run. That looked like rigour. Beau's
screenshots came back at aspect **1.76 to 2.11** — a world up to 475×242, twenty-four
per cent more frame width — and every composition decision in rounds 1–4 had been
validated at 1.70 and nowhere else.

This is the kit's own §2 rule arriving from a direction it does not cover. "Only
same-harness deltas mean anything" is about changing the spot table, and *fixing* the
viewport is the obvious way to obey it. For a game whose world size is a function of
the window, one viewport is one aspect ratio.

**`BRAWL_WORLD=std|wide|hd`** now selects a profile (`PROFILES` in
`brawlharness.js`). `std` stays default so every earlier tag remains comparable;
`wide` is Beau's machine. **Anything that is going to be looked at should be looked
at in both.** `BAND()` is a fraction of world height now instead of a flat 60px.

**Two faults it immediately exposed, neither visible at 340×200:**

**1. The cutscene cast was sized in ABSOLUTE PIXELS in a frame sized from the
window.** Twenty pixels of nugget in a 140px picture window is 15% of frame height;
a two-shot puts its actors at 35–40%. And the bigger the display, the *smaller* the
actors got relative to the shot. Fixed with no new art: `brawlActor()` paints each
actor once into an offscreen canvas at native size and `brawlBlit()` draws it at an
**integer** scale that follows the frame — `brawlCutK(Hh)` gives 2× at 340×200 and
3× at Beau's 475×242. Integer and NEAREST, because a fractional resample here would
be the one soft thing in a hard-edged game.

**2. Text below 8px does not survive the upscale.** The diner's specials board was
`700 6px Consolas` and came back from prod as a smear of overlapping glyphs: the
browser lays 6px out with subpixel antialiasing *inside the world buffer*, and the
game then magnifies that by 4 or 5. At scale 3 the smear is three pixels wide and
invisible in the harness. **8px minimum for anything drawn into this canvas.**

**And the title card got a set**, which is what round 4 said was next: it borrows the
diner via `brawlCutArt(g, W, Hh, 'diner', true)` — the new `noCast` flag paints the
SET WITHOUT ITS ACTORS, because the first attempt landed a two-shot straight across
the logo. `brawlMenuBase` no longer opens by filling the canvas, which is why nothing
could ever be put behind a menu screen before. `17-title` near **88.9 → 72.5**, flat
91.1 → 77.7.

**Still untouched:** `18-heat` (near 84.2 at wide, flat 91.2) and `20-map` (near
80.2, flat 81.6) are the two worst frames left, and both are now the *only* screens
with no set behind them.

## 🥊 BRAWLERS ROUND 6 — THE CAST (2026-08-13)

**Beau, from prod, and this is the complaint the prompt's blank was for:** *"the
characters (enemies and the main playable characters) all seem too 8-bit and the
graphics just look terrible."*

He is describing something countable. **Every character in this game was drawn with
TWO fill colours** — a base and a `dark` used for both the outline and the speckles —
with no light direction, and in the cups' case no silhouette either: `drawCup` was six
`fillRect`s and **a cup was a RECTANGLE with a stripe across it.** Two flat tones and
a straight edge is not a style, it is 1985. Rounds 1–5 had lit the room the cast
stands in and never touched the cast.

**`brawlRamp(hex)` → { rim, lite, base, shade, line }.** Five stops from one base
colour, and **the hue shift is the part that matters most: lights go WARM, shadows go
COOL.** A shadow that is only a darker base reads as a dimmed photograph; a shadow
with blue in it reads as light falling on a thing. Applied to:

- **`nugBody`** — a key from up-and-left (the direction the belt is already lit
  from), a 1px keyline instead of the 1.6px band that ate a sixth of the sprite, and
  breading drawn ONE STOP along the ramp in both directions instead of in `dark`.
  Speckles of `dark` on a flat shape read as DIRT; a stop up and a stop down read as
  a crumb with a dimple in it. Every call site inherits it — player, crowd, drops,
  cutscene actors.
- **`drawCup`** — rebuilt row by row: a **taper** (10px at the rim to 6px at the
  base), a keyline, a lit edge and a shaded edge per row, a two-pixel specular, and a
  domed lid with its own ramp. Covers all six grunt archetypes.
- The player's **boots**, **gloves** (three flat pixels was the entire fist in a game
  about punching — it has a knuckle and a keyline now), **headband** (a top light and
  the shadow it throws on the brow) and **eyes** (one catchlight pixel).

**THE FIRST ATTEMPT WAS WORSE THAN WHAT IT REPLACED, and that is the useful part of
this entry.** Three specific overshoots, all obvious in an 11× crop and invisible in
every number:

1. **`rim: 1.42 × base + 26 red` is not a highlight, it is a second colour.** On a
   20px nugget it blew out the whole upper half and the thing looked lit from inside.
   1.2 and +12. **A ramp on a small sprite has to be QUIET** — the shape does the
   work; the tones only have to stop it reading as a silhouette. The rim band also
   has to be a narrow crescent (`lam > 0.80`), not a lit hemisphere (`> 0.60`).
2. **The lid got seven rows of dome over a ten-row body and every enemy in the game
   came back a mushroom.** The head must stay smaller than the body. Five rows, the
   footprint the rig always had.
3. **A 4×4 dark socket around a 2×2 eye is goggles.** At three pixels of eye there is
   no room for a socket.

**MEASURED — and the measurement is the other lesson.** The belt band could barely see
this round: `bandFlat` −1.3%, `bandMean` −1.2% over ten scenes. **That is §19 one level
deeper than region.js was written for** — the band is a 475×72 box and a fighter is
30×30 inside it, so even the "surface" metric averages the change away. Pointed at the
**sprite itself** with `region.js b5-r5 b6-cast 01-kitchen 50 118 30 30`:

| | before | after | |
|---|---|---|---|
| `sd` | 36.85 | 39.18 | **+6.3%** — the ramp, directly |
| `hard` | 9.48 | 9.83 | +3.6% — the keyline |
| `chroma` | 34.33 | 35.28 | +2.8% |
| `blown` | 0.67 | 0.11 | −83% — the old flat white eye highlight |

fps 60.2 unchanged (the ramp is cached per colour, and `nugBody` is still cached per
sprite). Verified at `std` AND `wide`. **If a future round touches a character, point
`region.js` at a 30×30 box around it — the belt band cannot see the cast.**

## 🥊 BRAWLERS ROUND 7 — THE HEAT CARD, THE TWO-SHOT, TWO OF THREE BOSSES (2026-08-13)

Three things Beau named from prod screenshots. **One of the three fixes had to be
binned, and that one is the most useful entry here.**

**1. THE HEAT SCREEN WAS LITERALLY BROKEN.** The flavour text wraps to a *variable*
number of lines from a fixed `y`, and the best-run line was drawn at a **fixed**
`y0 + cardH - 8`. MILD wraps to five lines. They landed on the same row and
overprinted — `best: act 1` straight through `cups, generous crates.` The wrap width
follows the card now, the cards are wider (`min(112, (W-34)/3)`, so three lines not
five), and the best-run line is placed BELOW whatever the wrap produced with a
`min(y0 + cardH - 7, …)` clamp. It also stops being three flat rectangles on a black
field: the vault set behind it, a gradient panel, the heat's own colour as a ribbon
across the head of each card, and the selected card is LIT. **near 75.7 → 52.2, flat
85.1 → 51.6, mean 27.9 → 35.3.**

**2. THE CUTSCENE CAST WAS PIXELATED WORSE THAN THE GAME**, and the diagnosis is
arithmetic. Round 5 made the cast the right SIZE by painting a 22px actor into an
offscreen canvas and blitting it at 3×. The whole canvas is *already* magnified by
`brawl.scale`, so those sprites had pixels three times the size of every other pixel
in the frame — a low-resolution character pasted into a high-resolution shot.
**Scale the GEOMETRY, not the raster.** `brawlCutNug` / `brawlCutCup` build the same
silhouette and the same ramp at r 21–29 and cw 26–33, at the frame's own density, with
a detail unit `u` derived from the sprite so the face stays in proportion.

Two follow-on defects fell straight out of it, and both were latent in `nugBody` from
the day it was written: **its wobble was a fixed ±1.7px**, which is 19% of a radius-9
nugget and 6% of a radius-29 one — so the first big nugget came back a smooth BALL.
The wobble, the crumb cell and the keyline all scale with `r` now, which also makes
every existing call site slightly better. And the diner's **booth back was 200px
tall**, which on a 242-tall world painted a third of the frame near-black between the
set and the letterbox; it is anchored to the bar (`Hh - 46 - 13`) now. Three other
`200`-height fills got the same treatment.

**3. THE BOSSES — and the Clucker is RAMP-ONLY on purpose.** Wasabi was a flat green
rectangle with a white label; he and Dijon now have round 6's ramp, a keyline, a lit
edge, a shaded edge and a rim on the cap/hat. **Keylining the Mother Clucker turned
her head and neck into two floating white boxes and was binned on sight.**

**The rule that came out of it, which is about RIGS and not about her:** Wasabi and
Dijon are single stacked forms, so an outline drawn around each part lands on the
silhouette. She is **eight overlapping rectangles** — body, tail, wing, neck, head,
comb, beak, wattle — and outlining each one draws borders *through the middle of the
character*. **A keyline is not something you can add to a rig that overlaps itself.**
Doing her properly means redrawing the parts so they share edges, which is a round of
its own. She keeps the ramp and a lit top edge, which are safe on overlapping forms
because they do not introduce new boundaries.

**And a metric note:** the boss frame stats did not move (`04-vault` mean 47.2 → 47.2)
and `region.js` on a 34×42 box around Wasabi reported `sd` **down** 3.4% — because the
keyline and the shade replaced pure-white label area with mid-tones, which narrows the
variance inside the box even though the sprite plainly reads better. Round 6 said point
`region.js` at the sprite; round 7 adds that even there, **for a keyline change the crop
is the only judge.** Verified at `std` and `wide`. fps 60. `20-map` is now the last
screen in the game with nothing behind it.

## 🎚 THE HOUSE CALL + 🧹 THE CLEARING (2026-08-24) — performance is a feature now

A friend's machine froze at the arcade door (no walk-in, no bar) and ran the
hall as a slideshow after skip. Root causes: `build()` was one synchronous slab
inside a click handler (3.7s on a FAST machine — atlas paint, geometry decode,
shadow bake), and every quality knob except the MSAA governor was a constant.
Full ledger in **blender/HANDOFF.md §22**. What to know before touching the hall:

- **`build()` is `async` and STAGED** — it yields between stages and drives a
  `HallBoot` job so the boot bar covers the build, not just the downloads. Do
  not add synchronous heavy work to `enter()`; add a stage inside `build()`
  (or a `HallBoot.job` if it's a payload).
- **`perfTier()` decides low/med/high BEFORE building** (renderer string,
  deviceMemory, cores; WebGL1 → low). The tier sets atlas density (low = 1×),
  whether shadows bake at all, the DPR cap, and the starting LADDER rung.
- **THE GOVERNOR walks a 7-rung LADDER** (MSAA 4/2/off → renderScale 0.8 →
  no mirror pass → 0.62 + 8 lights → 8-bit post) and **persists its landing**
  in `nugHallTierAuto`. `NuggetArcade.quality('low'|'med'|'high'|'auto')` is
  the player override. `H.msaaAuto = false` pins the whole ladder (the seam
  name the kit already pins).
- **The mirror pass is skippable now** (`H.mirror === false` → floors draw
  opaque). If you add reflective geometry, it must tolerate the mirror being
  off. New per-frame costs should check `H.rung` before spending.
- **🚨 Every sampler uniform needs a legal binding on every path.** Skipping
  the shadow bake left two `sampler2DShadow`s defaulted to unit 0 next to the
  albedo `sampler2D` and a strict driver refused EVERY lit draw — the room
  rendered as sky and sprites, latent since shadows shipped for any machine
  whose bake failed. `H.texFlatD` (1×1 depth) is the standing fix; follow the
  pattern if you add samplers.
- **🧹 THE CLEARING removed THE FLOOR PLAN's furniture** (air hockey, both
  crane machines + their animated claws and glass, five stools) for
  performance, on Beau's call. Models remain in blender/hallmesh.py if a
  lighter version ever returns. Kit: spots `19-hockey`/`20-cranes` are now
  `19-openfloor`; motion.js dropped its claw channels.
- **Harness note:** `openHall` pins `localStorage.nugHallQuality = 'high'`
  before enter, or every measurement on this SwiftShader box would be shot at
  the LOW tier against tables shot at high. Keep that pin.

## 🤖 BATTEREDBOTS (game 17, mode `bots`) — 2026-09-04, Night 1: THE PIT

Josh asked for "a multiplayer battlebot videogame … nugget rc car version of
twisted metal"; Nathan named the league (CLUCKED METAL); Beau voted on the name.
Design pitch + the 5-night plan: the session artifact "BatteredBots" (see the
memory index). Contract between renderer and Blender: `blender/BOTS_ART_CONTRACT.md`.

**Architecture (read before touching):**
- `js/botsSim.js` — the ENTIRE rulebook, deterministic (seeded rng, no DOM, no
  clock, no Math.random), a classic script assigning `globalThis.BotsSim`. It runs
  as the SP authority, as the worker authority (Night 3), and as the online
  client's predictor. Change a rule HERE, never in bots.js.
- `js/bots.js` — shell + renderer. The first minigame on WebGL: normal-mapped
  floor, up to 16 point lights (8 on WebGL1/low), one sprite stream, a persistent
  decal FBO (crumbs/skids/scorch — cleared per round), the hall's bloom chain.
  Reads the hall's persisted quality verdict (`nugHallQuality`/`nugHallTierAuto`).
- `js/botsArt.js` — GENERATED by `blender/pack_bots.py` from `blender/botsrig.py`
  renders (3 aligned 1024² pages albedo/normal/mask + floor pages). Injected async
  via `HallBoot.inject`; every region has a procedural stand-in in bots.js and the
  game boots without the file. Regen: see the docstring in pack_bots.py; check with
  `node blender/tools/botsart_check.js`.
- Entry: the Grease Garage shutter on the street (x −14.6) — `botsFace` on the
  street atlas, hotspot kind `bots`, launches via `launchGame('bots')`.
- Test seam: `window.botsDebug` (start/pickTier/pickClass/pickArena/step/clock/
  event/freeze/snap/tier). Launch headless via `startStorm(1e6,5000);
  setStormMode('bots')` then keys 2·1·1 through the REAL pick screens.
- Scoring: sim points ÷ 100 × perFlyer × tier mult → `storm.caught` (banked
  incrementally in `botsBank`). Worker cap `bots: 30e6`.
- Pacing knobs (all in botsSim.js): HP 120/160/220, spinner `6+14·spin` at 1.0s
  per target, ram `min(12,(impact−45)·0.04)`, pads stagger `[3,5,9,13,17,21]`,
  clock HAZARDS_AT 150 / PIT_AT 105 / SUDDEN_AT 30.
- **HANDLING (Beau's first prod verdict: "impossible driving"):** GTN's car
  numbers were wrong for a 640-unit room. Now top speed 175/150/130 (cross the
  arena in ~2.9s, was ~1.7), accel UP (320/260/210) so it's snappy not slidey,
  grip 11.5–12.5, steer 5.2/4.6/4.0 with pivot authority 0.85 at rest (180° from
  a stop = 0.7s, was 5s+), and point-steering never auto-reverses — the bot
  turns toward the stick, brakes if fast the wrong way, and only powers up when
  facing within ~70°. Reverse is tank mode (T) only. Measured after: 4-AI rounds
  average 82s backyard / 82s league / 109s fryer, with judges' decisions.

### Night 3 (same day) — 🛰️ CLUCKED METAL ONLINE shipped (`43677ad`)
- `worker/src/games/bots.js` is server-authoritative on the SAME `js/botsSim.js`
  (side-effect import → `globalThis.BotsSim`). Setup happens inside the match
  (`{t:'pick'}` / host `{t:'setup'}`, 12s), AI fills to four, late joiners
  spectate until the next round, leavers become AI. Scores scaled pts/100 ×
  1000 × tier onto the SP leaderboard scale, written by the room.
- `js/botsMP.js` — snapshots + own-bot prediction (`BotsSim.predictBot`) +
  remote easing. `lobby.js` now serves `blaster` AND `bots` (`#openBotsOnline`).
- **Test it without a worker:** `scratchpad/verify_botsmp.js` pattern — load the
  module in-page as an ES module (`/worker/src/games/bots.js`), stub
  `NuggetNet.send/leave/players`, push snapshots through `NuggetNet._handle`.
  That is a full loopback of module + adapter through the real client.
- Fourth harness: `blender/tools/botsshoot.js` (12 named scenes, seeded; shoots
  `botsDebug.snap()`; metrics mean/sd/flat/blown/dark). Look at the crops.
- Lore: Hood rumor six (`botsShutter`/`botsPing`), Dill `botsPing*`, exhibit 16
  📡 THE LAST PING (`nugBotsPing` via a match win in THE SUMP), casefile fact 11.

### Night 5 (same day) — 🍟🌊 THE FRYER & THE SUMP floor pages
`BotsArt.floors` now carries `pit`, `fryer`, `sump` (all 2048×1152; js/botsArt.js
≈ 6.2 MB, injected async). Regen just the floors:
`blender.exe --background --python blender/botsrig.py -- blender/render_bots nosprites floors=fryer,sump`
then `python blender/pack_bots.py` (merges via `_manifest.json`, deletes `raw/`)
and `node blender/tools/botsart_check.js`. Renders go to `render_bots/raw/` first
— if a render "produced nothing", look there before re-running.
