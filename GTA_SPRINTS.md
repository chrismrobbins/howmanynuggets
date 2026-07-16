# 🚔 GRAND THEFT NUGGET — the 10-sprint build

**"Welcome to Nuggetown. Population: crispy."**

This doc is the shared brain for a 10-sprint build of GRAND THEFT NUGGET
(mode key: `gta`) — a top-down open-world crime game in the GTA 1/2 mold,
set in Nuggetown: the SAME city as the street outside the arcade, but all
of it. Each sprint is one working session; whoever picks up the next sprint
reads this file first (especially SPRINT NOTES at the bottom), does the
work, and appends their own handoff notes. Keep AGENTS.md rules sacred:
**game 12 is a STREET game** (main atlas is FULL) — its entry point is a
parked car on the street, not a cabinet.

## The pitch

You're a nobody nug who boosts a car outside the arcade and works your way
into the Batter Syndicate — the outfit behind THE CATCH INCIDENT. Drive
anything, outrun the NPD, run jobs from phone booths, and end up on the
harbor job where you SEE the stolen storm alive in the water (canon: the
case stays open forever — we never free it, never kill it).

Canon hooks already in the repo we build on:
- THE CATCH INCIDENT: storm stolen by the syndicate, dumped off the pier,
  ALIVE in the harbor (`nugReelStorm` localStorage flag from Keeping It Reel).
- NPD + tip line (`555-DILL`) and BATTER tankers / "S.W. Logistics" from
  Fast Food's billboards. S.W. Holdings ("BATTER FUTURES UP 300%") = the
  syndicate's money side. Use these everywhere.
- Detective Dill investigates; the Hooded Nug spreads rumors (his last
  unresolved seed is the rhythm cup — do NOT resolve it here; GTN gets its
  own street rumor when we do Sprint 9 dialogue).

## Tech decisions (locked)

- **Top-down 2D canvas**, GTA 1/2 style, north-up camera with velocity
  look-ahead. Low-res pixel backing store scaled up with
  `image-rendering: pixelated` (~300px tall), same trick as brawl/kart.
- **Tile-based city**, seeded deterministic gen (same Nuggetown for
  everyone; missions need fixed addresses). Tile = 24 world px.
- Everything in `js/gta.js` + `css/gta.css`, classic script-tag globals,
  loaded after `storm.js`, before `arcade-art.js`. No build step. Prefix
  globals `gta*` / `GTA_*`.
- Scoring = **$$$** paid into `storm.caught`, perFlyer-scaled like every
  other game (`gtaPay(mult, …)`). Verb: "boosted". Badge: 🚗.
- Arcade house rule: score NEVER resets. Busted/wasted cost time and
  weapons, not money.
- `pausesStorm()` lists `gta` (owns the whole screen).

## The 10 sprints

1. **IGNITION** — mode fully wired end to end (storm.js, HUD button, score
   tile, lb tab, account.js, worker GAMES + cap). Car physics: throttle /
   reverse / speed-scaled steering / SPACE handbrake drift. Starter
   district grid with building collision, night rendering (headlights,
   lamps, rain, neon), nug-crate + golden pickups, distance trickle pay,
   title screen. Drivable and scoring on day one.
2. **NUGGETOWN** — full city map, seeded: districts (Downtown, Harbor +
   pier, Grease District, Little Batter, the Suburbs), arterial + side
   roads, parks, landmarks (the arcade itself, Grease Garage, Sauce Works,
   NPD HQ), minimap, district-name toasts, day/night is always night but
   add neon variety + harbor water edge.
3. **LIVING CITY** — traffic AI (lane follow, stop at intersections,
   honk/avoid), pedestrians on sidewalks (walk, flee, splat = crumbs),
   carjacking: stop next to a car, press E/X to swap into it. Vehicle
   classes (compact, sedan, sports, BATTER tanker, bus) with per-class
   handling + damage/smoke/explosion.
4. **ON FOOT** — exit/enter cars (same key), walk mode with its own
   collision (sidewalks/alleys), melee punch, pickups on foot, health =
   breading (regen at Noodle Nug stands), sprint stamina.
5. **NPD HEAT** — wanted stars 1–5: patrol cruisers → pursuit AI → spike
   strips/roadblocks → the BATTER VAN (armored) at 5★. Busted (pulled from
   car, lose weapons) / Wasted (respawn at Nugget General). Pay 'n' Spray
   at the Grease Garage clears heat for $$$. Heat decays when hidden.
6. **ARMED & SAUCED** — weapons wheel: fists, sauce pistol, honey-mustard
   uzi, BBQ flamer, dip grenades. Drive-bys (fire sideways from cars),
   ammo pickups + weapon shops (AmmuNugget), combat pays small, risky $$$.
7. **THE SYNDICATE, ACT 1** — mission engine: phone booths ring, marker →
   objective chain → timer / fail / retry, reward $$$. 6–8 missions
   (deliveries gone wrong, tanker heist, tailing Dill, torching a rival
   fryer). Save mission progress in localStorage (`nugGtaProg`).
8. **ACT 2 + THE HARBOR JOB** — 5–6 missions ending at the harbor: the
   syndicate wants proof the storm is still down there; you see it surface
   (set `nugGtaSawStorm`), NPD raid, escape. Case stays open. Side gigs:
   Nug-Ex delivery (taxi), Vigilante, Rampages. Post-campaign freeplay.
9. **THE STREET DOOR** — `ArcadeArt.STREET_GAMES` entry (scoreboard +
   leaderboard cycle), street-atlas art ONLY (main 2048² atlas is FULL),
   parked car hotspot on the street (double-parked, hazards blinking, near
   the bus stop) that calls `launchGame('gta')` + sets `H.lastSpot`; NPC
   dialogue reactions (Dill on your rap sheet, Hood's new rumor, reactions
   keyed on `nugGtaProg`/`nugGtaSawStorm`). Update AGENTS.md.
10. **SHIP IT** — WebAudio: engine pitch, sirens, radio stations (procedural
    chiptune loops + DJ stings), screenshake/particle pass, touch controls
    done right (virtual stick), pause map, balance + perf pass (offscreen
    culling audit), Playwright drive-through screenshots, docs + memory,
    deploy, announce in the README if we're feeling fancy.

Stretch/parking lot: garages that save cars, multiplayer free-roam
(worker `gameRoom` pattern), photo mode, a Dill "case board" collectible.

## Working agreement

- Pull before starting. Verify per AGENTS.md (static serve + headless
  Chromium, `--use-gl=angle --enable-unsafe-swiftshader`, watch pageerror
  AND console warnings, screenshot and LOOK at it).
- Launch directly for testing: run a storm, then `setStormMode('gta')`.
- One commit per sprint minimum, message style follows repo history
  (lore-forward one-liners).
- End every sprint by appending SPRINT NOTES below: what shipped, what's
  wired where, gotchas hit, and what the next sprint should watch for.

---

# SPRINT NOTES (append-only, newest last)

## Sprint 1 — IGNITION (2026-07-15, Beau's Claude)

**Shipped:** GTN is fully wired and drivable. `js/gta.js` + `css/gta.css`,
all storm.js hooks (hint/badge 🚗/verb "boosted", sync/step/tally,
`pausesStorm`), HUD mode button 🚔, score tile + lb tab ("🚔 GTN",
element `myGta`), account.js maps, worker `GAMES` + `gta: 40e6` cap +
zero-map. Verified headless (title → drive → handbrake drift → clean stop,
zero pageerrors/warnings, screenshots eyeballed).

**What exists in js/gta.js:**
- Seeded city gen (`gtaBuildCity`, seed 20260715): 96×96 tiles, road
  line pairs (`gta.vRoad`/`hRoad` Uint8Arrays; `vDash`/`hDash` mark the
  second column/row of each pair — that's where center dashes draw),
  sidewalk ring, park blocks (~11%), per-block rooftop palette. Tile kinds:
  `GT_BLDG`(solid)/`GT_ROAD`/`GT_WALK`/`GT_GRASS` — only buildings + map
  edge collide; sidewalks/grass are drivable (it's that kind of town).
- Car physics: velocity decomposed to forward/lateral each frame;
  handbrake swaps lateral grip 7.5→1.5 /sec and scrubs forward — that's
  the whole drift model, and it feels right. Steering scales with
  vf/90 (clamped ±1) so reverse steers correctly. Axis-separated collision
  with `-0.22` bounce. Constants at top of file, tuned at scale vh/300.
- Camera: lerp to `car pos + vel*0.42` look-ahead.
- Rendering: tile pass with per-tile `gtaHash(c,r)` for deterministic
  variety (neon %11, roof vents %7, trees %5, lamp pools at intersections
  %4), skid ring buffer (220 cap), pickups, headlight cones under the car
  body, screen-space rain, in-canvas HUD (NPH + crates + district toast),
  GTA-style white-plate title card.
- Scoring: `gtaPay(mult, …)` perFlyer-scaled; crates 12×, golden 120×,
  distance trickle 2× per 44px (kart-parity vibes). Crates respawn 26s.
- Input: WASD/arrows + SPACE handbrake; touch = hold-to-gas, thirds steer,
  second finger handbrake (crude — sprint 10 does virtual stick).

**Gotchas for Sprint 2 (NUGGETOWN):**
- `GTA_W/GTA_H` and the district system don't exist yet — `gtaTally` and
  the toast hardcode 'DOWNTOWN'. City growth = bump constants, add a
  district lookup (suggest per-block district ids assigned in
  `gtaBuildCity`), name toasts on district crossing.
- Harbor wants a new tile kind (GT_WATER, solid-to-cars); put the pier +
  harbor on the EAST edge to match the street/pier canon in arcade.js.
- Landmarks need fixed addresses for missions later — export them as
  `gta.landmarks = {arcade: {c,r}, garage: …}` from gen.
- Minimap: draw once to an offscreen canvas at gen time (1px/tile), blit
  + player dot per frame. Don't per-frame the whole map.
- The tile draw loop is fine at 96×96 but re-fills every visible tile per
  frame; if the city gets big AND slow, pre-render static tiles to an
  offscreen chunk cache. Measure first.
- Verify harness: scratchpad playwright works with cached chromium-1228
  (`npm i playwright` in scratchpad, browsers already in
  %LOCALAPPDATA%/ms-playwright). Launch via
  `startStorm(1000000, 1000); setStormMode('gta')`.

**Not done on purpose:** traffic/peds (S3), on-foot (S4), NPD (S5 — the
🚔 emoji is a promise), weapons (S6), missions (S7-8), street-door entry +
`ArcadeArt.STREET_GAMES` (S9 — until then GTN is reachable from the HUD
mode row and lb/score UI only, NOT from the 3D hall), audio/touch polish
(S10).

## Sprint 2 — NUGGETOWN (2026-07-15, Beau's Claude)

**Shipped:** the full city. 160×160 tiles, five districts
(`GTA_DISTRICTS` + `gtaDistrictAt(tc,tr)` — pure function of coords, no
storage), the HARBOR on the east edge (bay water `GT_WATER` = solid,
animated glints + shoreline foam, warehouse strip, TWO drivable piers
that dead-end over the water), six landmarks with fixed addresses, a
gen-time minimap with a radar-window HUD blit, district-crossing name
toasts, and you now spawn on the curb outside THE NUGGET ARCADE. Verified
headless: gen sanity JSON + five screenshots eyeballed (spawn/arcade,
harbor pier + storm glow, Sauce Works, suburbs, Little Batter), zero
errors/warnings.

**How the new pieces work (for S3+):**
- Districts drive gen AND render: `GTA_ROOFS_D[district]` palettes,
  `GTA_PARK_ODDS`, `GTA_NEON_MOD` (hash modulus; downtown hums at %7,
  suburbs sleep at %26). District of any tile = `gtaDistrictAt` — cheap,
  call it anywhere. Player's current district: `gta.district` (updated on
  crossing in stepGta, drives the toast + tally).
- **Landmarks:** `gta.landmarks` = `{arcade, npd, general, noodle, sauce,
  garage}` → `{c, r, w, h, vLeft, hTop, name, accent, roof}`. `vLeft`/`hTop`
  are the road pair bounding the block — `(vLeft+1)*24` is a road
  centerline, that's how spawn-at-arcade works; use the same trick for
  mission markers. `gta.lmGrid` (Uint8Array, value = lmList index + 1)
  claims tiles; landmark tiles skip neon/vents and use their own roof
  color. Labels + accent borders + blink beacons draw in an overlay pass
  in gtaDraw.
- **Harbor geometry:** shore road pair at cols 144-145, sidewalk 146,
  warehouses 147-148, water ≥ 149. Piers = 2-tile-tall GT_WALK strips at
  two seeded hr rows (cols 146..156); WALK at `tc >= 146` renders as
  planks. `gta.stormSpot` = the golden glow in the bay off the NORTH
  pier's end (drawn in the overlay pass, marked on the minimap). S8's
  harbor job should use the north pier + stormSpot.
- **Minimap:** `gta.mini` painted ONCE in gtaBuildCity (1px/tile,
  landmarks as accent rects, storm spot gold). HUD blits an 80-tile
  window → 52px bottom-right with player dot. If you add moving blips
  (cops, missions), draw them as dots AFTER the blit in gtaDrawHud — do
  NOT repaint gta.mini per frame.
- Speed/crates HUD moved to bottom-LEFT (minimap owns bottom-right).

**Gotchas hit:**
- Roads must stop at the shore (`road()` checks `tc < SHORE + 2`) or
  hRoad rows pave across the bay.
- Landmark rects force their tiles to GT_BLDG (parks would otherwise eat
  a landmark block in the suburbs).
- fillText with the maxWidth arg is how landmark names fit their roofs at
  9px — don't hand-wrap.

**S3 (LIVING CITY) pointers:** traffic wants lane centers — for a vertical
road pair (v, v+1), southbound lane center x = (v+0.5)*24, northbound =
(v+1.5)*24 (right-hand traffic); intersections are `vRoad[c] && hRoad[r]`.
Spawn/despawn traffic in a ring around the camera (the map is 3840px
square now — do NOT simulate all of it). Peds walk GT_WALK tiles; keep
them off the pier planks or give them fishing rods. Carjack key: E/X
(check kartPress-style key routing). Vehicle classes can reuse the
per-class constants pattern (top speed / accel / grip per kind). The
BATTER tankers belong in Little Batter + Grease District (canon:
S.W. Logistics).

## Sprint 3 — LIVING CITY (2026-07-15, Beau's Claude)

**Shipped:** Nuggetown is inhabited. Five vehicle classes (`GTA_CLASSES`:
compact/sedan/sports/bus/BATTER tanker — per-class speed/grip/steer/size/hp,
district-weighted spawn tables in `GTA_TRAFFIC_D`, tankers haunt Little
Batter + Grease per canon), lane-locked right-hand traffic with intersection
decisions, braking, yielding, and HONK! bubbles; sidewalk peds (5px nug
citizens) that stroll, flee fast cars, and crumb; carjacking on E/X (swap
into any car within 34px when slow — occupied cars pay 15× and the driver
bails as a fleeing ped, your old ride parks where you left it); hp/damage
everywhere (wall crunches > 110 px/s, rams, punches later), smoke → fire →
explosion with splash (tankers go 1.6× and chain), scorch + crumb decals,
screenshake, and a WASTED interlude that respawns a fresh compact at
NUGGET GENERAL (house rule: the meter never resets). Verified headless:
lane-discipline assert, carjack/wasted/respawn/honk probes, five
screenshots eyeballed, zero pageerrors/warnings.

**How it works (for S4+):**
- Player physics now reads `GTA_CLASSES[gta.car.cls]`; `gta.car` carries
  `cls/col/hp`. `gtaPlayerPos()` is THE player-position accessor (pickups,
  camera, district, traffic probes all use it) — S4 points it at the
  on-foot avatar when `gta.onFoot` is set (the flag is already referenced,
  always-falsy until then).
- Traffic cars live in `gta.cars` (`{x,y,a,dir,v,cls,col,hp,parked,wreck,
  nd,...}`), driving waypoint-to-waypoint between intersection centers
  (`gtaDecide` picks straight/left/right, only onto legs that reach another
  intersection — that's the dead-end-stub guard; no options = U-turn).
  TWO probes brake them: speed-scaled far + fixed bumper (the bumper probe
  is what makes honking stable — a single scaled probe oscillates on/off a
  standing blocker and resets `blockT`).
- `gtaExplodeCar` handles splash/chain; **player death path**: only ever
  call `gtaDamagePlayerCar` — it fires `gtaWasted()` BEFORE pushing/
  exploding the leftover wreck, because splash re-hits the player and the
  `wastedT` gate is the recursion guard.
- Spawn/despawn ring: `gtaSpawnTraffic`/`gtaSpawnPed` every 0.35s to caps
  (12 moving / 22 peds), despawn beyond ~R+330. Never simulate the map.
- Decals (crumbs/scorch) + parts (smoke/fire/spark/crumbspray) are capped
  ring-ish buffers (70 / 220) stepped in `gtaStepWorld`.

**Gotchas hit:**
- Honk needed the bumper probe (above) — everything else worked first try.
- `gta.cars` gets pushed to mid-iteration when the player wrecks (the
  leftover wreck) — for..of handles it, but bail out of collision loops
  once `gta.wastedT > 0` or you'll shove the ghost around.

**S4 (ON FOOT) pointers:** E with no car in range should become exit-car
(gtaInteract already early-outs for range). Walk collision can reuse
`gtaSolidAt` at radius ~3.5. Peds already have the render rig
(`gtaDrawPed`) — the player avatar can share it with a distinct color.
Noodle stands: the `noodle` landmark exists; carts can be seeded AFTER
existing gen rnd() calls (append-only, or the whole city reshuffles).
`gtaCrumb(p, mult, label)` is the kill path for punches too.

## Sprint 4 — ON FOOT (2026-07-15, Beau's Claude)

**Shipped:** you can leave the car. E/X now does all door work (on foot:
enter within 26px; driving: swap within 34px, else step out kerbside if
slow); walk mode with its own axis-separated collision (r 3.5), SHIFT
sprint on a stamina bar (drain 30/s, regen 16/s), SPACE punch (nuggets
crumb + pay 3×, cars dent 6hp — punch a tanker long enough, learn things);
health = breading (100), hurt by traffic hits, blasts, and splash, with a
`hurtI` mercy window; SIX Noodle Nug carts (one seeded on the curb outside
the NOODLE NUG landmark, five around town, pink dots on the minimap) regen
16/s standing near them, steam included; pickups work on foot
(`gtaPlayerPos` did the heavy lifting); car explosion now EJECTS you singed
(-65 breading) instead of insta-wasting; WASTED (breading 0) respawns ON
FOOT outside Nugget General, meter untouched. HUD: breading bar always,
stamina bar on foot, bodywork bar driving, 🍜 RE-BREADING indicator; tally
shows 🍞% on foot. Verified headless: exit/walk/sprint/punch/noodle/enter/
eject/wasted probes + S3 regression (lane discipline holds), screenshots
eyeballed, zero pageerrors/warnings.

**How it works (for S5+):**
- `gta.onFoot` + `gta.ped` (player avatar, shares the `gtaDrawPed` rig —
  golden `#ffcf3a`, red hurt-blink, white fist while `punchAnim > 0`).
  `gtaPlayerPos()` returns car or ped; ~everything downstream (camera,
  pickups, districts, traffic probes/honks) never noticed the change.
- Death paths: cars die ONLY via `gtaDamagePlayerCar` (ejects → breading),
  flesh dies ONLY via `gtaHurtPlayer` (mercy-window gated). NPD busts in S5
  should be a THIRD path (no explosion, no breading hit — weapons instead).
- `gtaRespawn` is on-foot-only now. `gta.car` is STALE while onFoot — the
  smoke emitter and HUD are guarded; keep new code reading it behind
  `!gta.onFoot` (or via gtaPlayerPos).
- Noodle carts: `gta.noodleCarts` `{c,r}`, seeded APPEND-ONLY after the
  pickup rnd() calls (city layout unchanged — checked the arcade spawn).
- Touch on foot is crude-but-works: hold = walk north, thirds steer,
  second finger = door-or-punch (`gtaFootAction`). S10 virtual stick fixes.

**Gotchas hit:**
- The stale-`gta.car` smoke emitter was the only real bite (a fire fountain
  at your old wreck while walking away) — hence the guards note above.
- Ejection order matters: place on foot FIRST (onFoot gates re-entry into
  gtaDamagePlayerCar), hurt with `hurtI = 0`, then `hurtI = 1.2` so the
  wreck's own splash pass can't double-dip.

**S5 (NPD HEAT) pointers:** wanted level wants a `gta.heat` float + star
HUD (top-right is free). Patrol cruisers can be a 6th class in GTA_CLASSES
(cop livery in gtaDrawVehicle) spawned via the normal traffic ring while
heat 0 (they lane-follow until you misbehave — hooks: gtaCrumb (witnessed),
ram damage, punches). Pursuit = break lane-lock: give cruisers a `chase`
flag and steer-at-player physics like the player car's. Busted: cruiser
adjacent + player slow/on-foot → banner + respawn at NPD HQ (landmark
exists) — no explosion path. Pay 'n' Spray: `garage` landmark, drive into
its block with $$$ to clear heat + repair (storm.caught -= is FORBIDDEN by
the house rule — charge nothing or pay in time, e.g. a 3s respray pause).
Heat decay when unseen: reuse the spawn-ring distance check.

## Sprint 5 — NPD HEAT (2026-07-15, Beau's Claude)

**Shipped:** the 🚔 emoji pays off. `gta.heat` 0..5 float (floor = stars;
top-right HUD flashes during live pursuit, radar shows red/blue chaser
blips, tally gains 🚔★★★). Crimes feed `gtaAddHeat`: splats 0.4, punch-kill
0.4, occupied carjack 0.5 (cop car 1.2!), rams 0.08, player-caused
explosions 0.8 — cop versions roughly quadruple. Two new classes: NPD
CRUISER (fast black-and-white, ~8.5% of the traffic stream patrols
lane-locked with lights off) and the 5★ armored BATTER VAN (400hp, rams
like a vault door — surplus syndicate armor, nobody at city hall asked).
Pursuit AI (`gtaStepChaser`): steer-at-intercept + wall probes, boxes a
slow/on-foot player for the bust instead of squashing, rams a moving one,
splats peds en route. Pack strength = stars+1 (cap 5), topped up by
dispatch every 1.3s, patrols within 330px convert. BUSTED: cruiser on top
of slow/on-foot you for 0.9s → interlude → released ON FOOT at NPD HQ,
heat cleared, ride impounded-in-place (parked where you left it). 3★+
roadblocks: spike strips + two lit parked cruisers 350px ahead of a fast
player; strips pop tires (`gta.tiresOut`: 0.55× top speed/grip until you
swap cars or respray). Pay 'n' Spray at the Grease Garage: pull up slow
within ~64px of the rect while hot/dinged/spiked → 3s mist → heat 0, full
hp, new tires, 30s cooldown, free (house rule). Heat decays 0.07/s hidden
(0.012/s seen); under 1★ the pack stands down and parks. Hospital also
clears heat. Verified headless: heat/pursuit/roadblock/spray/busted/decay
probes all green, zero errors, screenshots eyeballed (the roadblock shot
is chef's kiss — strip laid, cruisers lit, three stars flashing).

**How it works (for S6+):**
- `o.cop` (livery + heat multipliers) and `o.chase` (free-drive AI) are
  orthogonal: patrol = cop && !chase (lane physics), pursuit = chase
  (gtaStepChaser), roadblock props = cop && parked && lightsOn.
- `o.playerHit` marks cars the player damaged — `gtaExplodeCar` reads it
  for heat attribution. **S6: pay combat $$$ from the same flag** (cop
  explosions should pay more but heat more).
- Interlude ladder in stepGta: wasted > busted > spray > foot/car. All
  three gates (`wastedT/bustedT/sprayT`) block heat gain, busts, and
  roadblocks (`busy` in the dispatch block).
- Busted path parks the ride BEFORE gtaPlaceOnFoot (impound-in-place) and
  is the third death path (no explosion, no breading loss). S6: zero the
  ammo belt here.
- Jacked cruisers keep `cop: true` on gta.car (livery persists, static
  light bar) — cops are not fooled.
- `gtaSpawnRoadblock` returns success; a whiff retries in 0.7s (setting
  the full 11s cooldown on a whiff made roadblocks basically never land).
- Respray zone is rect+64px because landmarks sit inset in their blocks —
  34px never reached the curb.

**S6 (ARMED & SAUCED) pointers:** weapons table wants
[fist, sauce pistol, honey-mustard uzi, BBQ flamer, dip grenade] with
per-weapon cd/speed/dmg/ammo; `gta.shots` as a capped array stepped in
gtaStepWorld (solid tile → spark, ped → gtaCrumb(3), car → damage +
playerHit). Fire on F (both modes; Space stays punch-or-fire on foot),
Q/1-5 to switch. Drive-bys fire perpendicular from both windows. Flamer
sets `o.burnT` (damage over time → eventual explosion). Grenades: lobbed
projectile, 1.1s fuse, reuse the explosion splash pattern. AmmuNugget can
be a SEVENTH landmark appended to GTA_LANDMARKS (placement iterates in
order with a used-set — appending doesn't move the existing six; no rnd()
involved) — restock on E with a cooldown, free (house rule). Ammo pickups:
append-only rnd() gen like the noodle carts. Busted must zero all ammo.

## Sprint 6 — ARMED & SAUCED (2026-07-15, Beau's Claude)

**Shipped:** the condiment arsenal. `GTA_WEAPONS` = fists / SAUCE PISTOL /
HONEY-MUSTARD UZI / BBQ FLAMER / DIP GRENADE with per-weapon
cd/speed/dmg/spread/color/give. F fires in both modes (SPACE stays
punch-or-fire on foot, handbrake in cars), Q cycles loaded weapons, 1-5
direct-select. One firing path (`gtaStepFire`): on foot shoots where you
face; in a car it's a DRIVE-BY out BOTH windows per trigger pull (one
ammo, two tracers — commitment); grenades on foot lob 150px, from a car
they drop out the window BEHIND you (chase-breaker). Shots are a capped
array: sparks off walls, crumbs nuggets (3× pay), dents cars +
`playerHit`; flamer instead stacks `o.burnT` — burning cars take 15/s and
cook off to the standard fireball. `gtaNadeBoom` = the portable fireball
(crumbs at 28px, 80 dmg at 30px, hurts you too — respect the dip).
Combat PAYS via `playerHit` at explosion time: 20× civilians, 30× cop
cars (heat 0.8/1.4 respectively) — small, risky, as ordered. AMMU-NUGGET
is the SEVENTH landmark (Little Batter, canon: syndicate turf sells the
hardware) — E at the counter refills the whole belt free, 45s loyalty
cooldown. 18 ammo drops seeded around town (pulsing diamonds in weapon
colors, 40s respawn; grabbing one from fists auto-equips). BUSTED now
confiscates everything (evidence locker). HUD: belt line (icon + rounds,
red at 0) above the bars, weapon-wheel toast on switch, ammo grants pop
labels. Storm hint + title card updated for the new controls. Verified
headless: restock/pistol-kill/uzi-wreck-pays/burn/boom/drive-by/
confiscation probes green, zero errors, screenshots eyeballed (both-window
tracers visible).

**How it works (for S7+):**
- All fire routes through `gtaStepFire(dt)` called after the player step
  in BOTH modes — mission code should never fire weapons directly.
- `gta.firePress` latches taps: keydown+keyup inside one frame (fast tap,
  automation) still fires exactly once. Don't remove it — Playwright's
  keyboard.press() is a zero-length tap and it WILL bite the S10 tests.
- `o.playerHit` now does double duty (heat attribution + combat pay).
  Mission targets can reuse it: set it before scripted explosions to pay.
- `o.burnT` on any non-wreck car = damage over time; set it from scripted
  arson (the S7 "torch a rival fryer" mission wants exactly this).
- AmmuNugget restock is inside gtaInteract's foot branch AFTER the car
  check — E prefers a door if one's within 26px.
- Touch still fires nothing (second finger = door/punch only) — S10.

**Gotchas hit:**
- First verify run placed test targets 40px into the AmmuNugget WALL and
  read `gta.cars[length-1]` while traffic kept spawning — every "failure"
  was the test, not the game. Tag test entities and shoot on open road.
- keyboard.press('F') = zero-length tap = no fire before firePress existed
  (see above).

**S7 (THE SYNDICATE, ACT 1) pointers:** mission engine wants a phone-booth
entity set (seed booths append-only like carts/ammo), a ring animation +
answer-on-E, then an objective chain state machine (`gta.mission` =
{id, step, timer, marker}) driven from gtaStepWorld with a marker
arrow/blip. Reward via gtaPay (big mults are fine — perFlyer scales), fail
= banner + retry from the booth, save progress in localStorage
`nugGtaProg` (mission ids done). Lore hooks ready: S.W. tankers + BATTER
VAN + AmmuNugget are all syndicate-adjacent; Dill tail mission can use the
chaser AI with chase pointed at an NPC car instead of the player. The
harbor job itself is S8 — leave `gta.stormSpot` untouched until then.

## Sprint 7 — THE SYNDICATE, ACT 1 (2026-07-16, Beau's Claude)

**Shipped:** the phones ring. Six phone booths (four on landmark curbs +
two seeded, append-only rnd as ever; cyan on the minimap, 📞 gold blips +
edge pointer while ringing), answer on E — on foot within 26px or idling
in a car within 40px — and S.W. starts you on a six-contract chain
(`GTA_MISSIONS`): THE ERRAND (delivery gone loud), FULL FAT (tanker
heist), DILL WATCH (tail mission), CRISPY BUSINESS (fryer-truck arson +
escape), SPECIAL SAUCE (3 drops into a 2-hostile ambush), THE SHREDDER
(evidence BATTER VAN outside NPD HQ + escape). Progress persists in
`nugGtaProg` (count of missions done). Verified headless: all six
contracts driven end to end + timer-expiry and WASTED fail paths + an S6
weapons regression, zero pageerrors/warnings, screenshots eyeballed.

**How the engine works (for S8):**
- `gta.mission` = `{def, si, st, time, mk, warn}`; `gtaStepMission(dt)` runs
  from gtaStepWorld. Step kinds: `go` (reach `at()` within `r`; optional
  `needCar` = arrive driving that cargo), `jack` (drive the spawned
  `cargo`), `kill` (wreck every `target`), `tail` (`dill`: <58px for 2.4s
  or >310px for 7s fails; `dur` secs to pass), `escape` (stars → 0).
  Steps: `spawn` specs (single or array) run at step init, `done()` fires
  on advance, `time` is a per-step fail timer, `text` is the HUD line.
- **Adding Act 2 = pushing more defs onto GTA_MISSIONS** — the chain,
  booths, ringing, and persistence all key off `gta.prog` vs length.
  New step kinds go in gtaStepMission's else-if ladder.
- `gtaLmCurb(key)` → road centerline at a landmark; `gtaShorePoint(row)` →
  shore road; `gta.pierRows` = the two pier rows (S8's harbor job wants
  `gta.pierRows[0]`, the north pier, + `gta.stormSpot`).
- Mission cars: `gtaMisCar(spec)` (`mis: true`, `misKey`), despawn-proof,
  doors locked except `cargo` (gtaNearestCar filter). `spec.drive` snaps
  to a legal lane for traffic AI (Dill); `spec.hostile` = syndicate
  chaser — reuses gtaStepChaser with every cop-only branch (bust posture,
  standdowns, spray/hospital forgiveness) guarded on `o.cop`.
- mis/misKey ride along through gtaEnterCar/gtaParkPlayerCar/the
  gtaDamagePlayerCar wreck copy — that's how "deliver the tanker" survives
  the player stepping out and how cargo-death fails are detected
  (`gtaMisFind` returns only non-wrecks).
- Fail path: `gtaMissionFail(reason)` — called by timers, tail busts,
  cargo loss, AND gtaWasted/gtaBusted (before their banners; it skips its
  own banner during interludes). Cleanup removes live mission cars,
  untags wrecks, sets `ringCd` 5s. Complete: `gtaMissionComplete` pays
  `def.reward` via gtaPay, saves prog, shows `def.outro` as a toast.
- HUD: objective bottom-center + ⏱/⚠ line above it, gold marker ring in
  world, edge arrow when offscreen, brief card (`gta.briefT`, gtaWrap)
  top-center for 6.5s after answering.

**Gotchas hit:** none new — the S6 firePress latch and the append-only
rnd() discipline both paid off. Remember hostiles are `chase && !cop`:
any future "pursuit stands down" code needs the `o.cop` guard or it
pardons the syndicate too.

**S8 (ACT 2 + THE HARBOR JOB) pointers:** push 5-6 defs onto GTA_MISSIONS
ending at the north pier: drive out over the planks (piers are GT_WALK —
drivable), a `go` at the pier end near `gta.stormSpot`, a scripted
surface moment (new step kind, e.g. `watch`: hold position N secs while
the glow rises — draw via a mission-owned flag in gtaDraw), set
`nugGtaSawStorm` in localStorage, then an NPD raid (spawn chasers +
heat) and an `escape`. Case stays open: the storm submerges again,
nobody frees or kills it. Side gigs (Nug-Ex/Vigilante/Rampage) can be
lightweight repeatable non-chain missions started from world objects
(e.g. E in a bus/tanker/cruiser when idle) rather than booths.

## Sprint 8 — ACT 2 + THE HARBOR JOB (2026-07-16, Beau's Claude)

**Shipped:** the campaign is complete — 11 contracts. Act 2 (defs 7-11
appended to GTA_MISSIONS): PIER PRESSURE (clear a lit NPD checkpoint on
the shore road), THE LONG LENS (camera-car heist, deliver intact),
NOISE COMPLAINT (new step kinds: `wanted` reach N★, `heathold` keep N★
for dur), GHOST SHIFT (tail generalized via `step.track` — shadow a
syndicate scout tanker), and THE HARBOR JOB: drive to the north pier's
end, `watch` step holds you there while `gta.stormRise` 0→1 and THE
STORM SURFACES (dark ellipse + 7 orbiting golden nuggets + lightning
crackle at the stormSpot, drawn in the stormSpot block of gtaDraw),
`nugGtaSawStorm='1'` lands in localStorage, then heat 5 + a four-cruiser
raid spawns on the shore and it's one long `escape` home. Case stays
open: rise decays 0.3/s in stepWorld the moment the watch ends — it
goes back under, nobody frees it, nobody kills it. Campaign outro says
so in as many words. Plus SIDE GIGS for freeplay: boost a BUS →
📦 NUG-EX timed delivery chain (pay grows, windows shrink), boost a
CRUISER → 🚨 VIGILANTE (lane-locked felons at 0.82×maxFwd via `o.felon`
in gtaStepTrafficCar; wreck to collar, chain continues), grab a 💀 off
the road (2 seeded, append-only, 150s respawn) → RAMPAGE (10 crumbs in
50s on a company uzi; player-attributed gtaCrumb calls count). Verified
headless: all five Act-2 contracts end to end (storm rise probed at
0.93, raid live, submergence checked), all three gigs start/pay/chain,
zero pageerrors/warnings, screenshots eyeballed (the surfacing shot is
the whole sprint).

**How it works (for S9/S10):**
- Gigs: `gta.gig` = `{type, count, time, mk, felon?, need?}`, stepped by
  `gtaStepGig` right after gtaStepMission. One job at a time: gigs won't
  start during a mission, booths don't ring during a gig
  (`gta.boothRing` gate). Ending is always `gtaGigEnd(msg)` — neutral
  toast, no fail banner; wasted/busted drop the gig quietly. Gig entry
  points: gtaEnterCar tail (bus/cruiser) + the rampage branch in the
  pickups loop. `o.gigCar` joins `o.mis` in the despawn guard.
- HUD marker plumbing is shared: world ring + radar gold blip + edge
  arrow all read `gta.mission?.mk || gta.gig?.mk` (arrow via the
  `gtaEdgeArrow` helper). The objective line has a gig branch.
- `gta.stormRise` is the only storm-surface state; anything (S9 street
  dialogue, future missions) can read `nugGtaSawStorm` from localStorage
  — same pattern as reel's `nugReelStorm`.
- Campaign-complete freeplay = phones quiet (`prog >= GTA_MISSIONS.length`),
  gigs forever.

**Gotchas hit:** none — the S7 engine took all five defs and three new
step kinds without a fight. Watch out: `gtaGigFelon` can whiff on bad
ground (returns null); gtaStepGig retries next frame, so never assume
`G.felon` is set.

**S9 (THE STREET DOOR) pointers:** everything the arcade street needs is
ready — mode `gta` is fully wired, and the two campaign flags are
`nugGtaProg` (0..11, count of contracts done) and `nugGtaSawStorm`
('1' after the harbor job). Suggested read helpers to add in gta.js:
`gtaProgress()` / `gtaSawStorm()` (try/catch localStorage like
reelStormLanded). Street door per AGENTS.md: `ArcadeArt.STREET_GAMES`
entry {mode:'gta', …}, street-atlas art ONLY (main page is FULL), a
double-parked car with blinking hazards near the bus stop
(H.hotspots + `H.lastSpot` so Stop returns you to the car), and NPC
dialogue branches keyed on the two flags (Dill has a rap sheet with
your name on it; the Hooded Nug gets a new rumor). Update AGENTS.md.

## Sprint 9 — THE STREET DOOR (2026-07-16, Beau's Claude)

**Shipped:** GTN is reachable from the world. `ArcadeArt.STREET_GAMES`
gets the `gta` entry (scoreboard cycle + leaderboard fetch come free),
and a red compact sits DOUBLE-PARKED in the street road (x −10.6..−8.2,
z 8.75..9.95, by the bus stop) — painted flanks (`gtaCarSide`, STREET
atlas only; `sw_carRed` added to the solid palette), dark glass cabin,
dim amber hazard quads whose BLINK comes from three glow sprites with
the new glow kind `'hazard'` (static geometry can't blink; the sprite
pass can — see the render() glow branch). Walk-up hotspot
"🚔 GRAND THEFT NUGGET — BOOST IT" launches via the pier pattern
(`H.lastCab = null`, `H.lastSpot` stand/look at the kerb, `launchGame('gta')`)
and Stop returns you to the kerb, not a cabinet. gta.js exports
`gtaProgress()` / `gtaSawStorm()` (try/catch localStorage reads).
NPC reactions: Detective Dill grows a rap-sheet branch (three tiers:
clean-ish / act-1 done / drove-out-saw-it — the last one is his best
material), the Hooded Nug gets the "that's not parking, that's an
INVITATION" rumor with boosted/legend tiers. The rhythm-cup seed is
UNTOUCHED (still the Hood's last unresolved rumor). Street-entry toast
now mentions the hazards. AGENTS.md updated (in-flight note + street
game pattern para). Verified headless: registry, hall entry, hotspot
launch → storm.arcade path → gta.on, stop → kerb return at ±0.3,
Dill/Hood node trees probed at both flag tiers, no atlas overflow,
zero pageerrors (the 24 warnings are the documented localhost-CORS
leaderboard blocks). Screenshot of the car eyeballed — windings correct
from the curb side.

**Gotchas hit:** none — the wallZ/wallX winding comments and the pier
checklist made this mechanical. Remember the car's propBox blocks
walking through it; the hotspot stand is on the sidewalk (z 7.1).

**S10 (SHIP IT) pointers:** what remains from the plan: WebAudio
(engine pitch from car speed, sirens while `o.chase && o.cop` cars are
near, radio = procedural chiptune loops + DJ stings — brawl/kart have
WebAudio patterns to crib), touch controls done right (virtual stick
replacing the thirds scheme; fire/weapon buttons), pause map (full
`gta.mini` blown up on a key, M or Esc-adjacent), screenshake/particle
polish pass, balance pass (mission rewards vs. crate economy),
offscreen-culling audit (measure first — 160×160 tile loop is fine so
far), Playwright drive-through screenshots, README/CLAUDE.md docs,
memory update, push + `gh run watch` the deploys. gta.css is still
only 45 lines — the pause map may want a couple of classes.

## Sprint 10 — SHIP IT (2026-07-16, Beau's Claude) — 🏁 THE BUILD IS COMPLETE

**Shipped:** Nuggetown has a soundtrack and the build is done. WebAudio
(`gtaAud` + `gtaACtx`, context created on the title keypress so autoplay
policy is satisfied; every entry point try/catch'd): ENGINE = two detuned
oscillators through a lowpass, pitch/gain ride the speedo, ducked on foot
and in interludes; SIREN = one shared triangle wail, gain follows the
nearest lit cruiser (520px falloff); RADIO = a deterministic chiptune
step-sequencer (gtaHash seeds the tune — same station, same song) with
three stations on R (NUG FM 101.5 / BATTER WAVE / HEIST RADIO), car-only,
DJ sting + toast on tune, persisted in `nugGtaRadio`. One-shot SFX wired
everywhere: per-weapon shots, distance-attenuated explosions + honks,
wall/ram crunches, pickups (golden gets the extra note), phone rings you
can hear (2.6s throttle within 240px), mission passed/failed jingles,
busted/wasted stings, the Pay 'n' Spray hiss. TOUCH grew up: floating
virtual stick on the left 60% (rim = sprint), button cluster right
(🔥 fire hold / 🛑-👊 handbrake-punch / E / Q) + radio/map buttons
top-left, all tracked per-touch-identifier; the old thirds scheme is
gone (mouse drive kept for desktop). M opens the PAUSE MAP: whole city,
landmark names in accent colors, blinking you + gold marker, sim frozen
(gta.t still ticks so the map blinks; input swallowed except M/R).
`gtaAudioStop()` runs from syncGta on exit so nothing hums over the
calculator. Verified headless: engine pitch probed at speed (46→124Hz),
radio scheduling + persistence, siren swell with a chaser planted 80px
away, map freeze probed (position unchanged under held W), synthetic
TouchEvents drove the stick + fired the fire button, THE ERRAND passed
as a full regression, 61fps under swiftshader, zero pageerrors. Docs:
README announcement bullet + file rows, CLAUDE.md layout row + street
paragraph, AGENTS.md was updated in S9.

**Perf/balance notes:** measured 61fps headless with all layers on — the
naive tile loop and capped ring buffers are fine; the chunk-cache idea
from S1 stays unneeded. Economy left as tuned (crates 12× / golden 120× /
missions 220-900× — the campaign is the payday, as intended).

**What DIDN'T ship (parking lot):** garages that save cars, multiplayer
free-roam, photo mode, the Dill case-board collectible, DJ voice lines
(stings only). The rhythm cup remains the Hood's last unresolved rumor.

**GTN is done: 10 sprints, 12 games in the building, one storm still at
large. Case open forever. 🚔🍗**

## Sprint 10.5 — FRESH COAT (2026-07-16, Beau's Claude) — season-1 patch

Beau played season 1 and filed three complaints: the people are "just
squares", missions don't tell you where to go, and carjacking is a silent
teleport. All three fixed, plus a general graphics pass. Not an S2 sprint —
S2.1 (WHEELS OF YOUR OWN) is still next.

**Shipped:**
- **Ped rig rework** (`gtaDrawPed`): shadow ellipse, alternating feet,
  arms that swing opposite the stride (fleeing pumps both up), an outfit
  jacket (shoulders ellipse, `GTA_PED_OUTFITS`, ~1 in 5 wears a cap),
  breading head with fried-crown highlight. New ped fields: `outfit`,
  `hat`, `daze`. A dazed ped (`daze > 0`) draws SPRAWLED on the tarmac
  (limbs out, blinking stars) and doesn't step until the timer runs out.
  Player = golden head + black jacket (`outfit` set in gtaPlaceOnFoot).
- **Vehicle rework** (`gtaDrawVehicle` + `GTA_BODY_CUT`): dark shell
  (outline + bumpers) under class-tapered paint (sports get the long nose),
  hood highlight / darker roof / glass reflections via `gtaShade(hex, k)`
  (cached — safe per-frame), damage states (crumpled fenders > 40%,
  spider-cracked glass > 70%), improved wrecks (gutted interior), cop
  light bar with a real chassis and a red/blue GLOW thrown on the road
  when lit, brake-light glow on the tarmac while braking.
- **Carjacking is a scene now** (`gtaEnterCar`): the driver spawns at the
  door AWAY from the thief (falls back to the near door against a wall),
  lands with `daze: 0.85` + `flee: 3.4`, yells via the honk-bubble system
  (`gta.honks` entries take an optional `txt`; `GTA_JACK_YELLS`, cops yell
  'HEY— FREEZE!'), with `sfxGtaYelp(cop)` + `sfxGtaDoor()` (door thunk also
  plays on enter/exit).
- **Mission clarity**: bottom objective PLATE (dark backing + gold border)
  with step counter (`2/4`), live distance in m, and the step clock;
  `gtaGpsArrow` — GTA1-style gold arrow orbiting the player pointing at
  the live marker with a distance tag (hidden < 60px; the ground ring +
  new pulsing light-beam column take over); "— OBJECTIVE —" center-screen
  flash for 3s on every step change (`gta.stepFlashT`, set in
  gtaMissionStepInit, drawn at Hh*0.42 — 0.3 hides behind the storm HUD
  card); and when idle with phones ringing the plate reads "📞 A PHONE IS
  RINGING — ANSWER IT (E)" with the same arrows — new players now always
  have a live objective. Gig HUD got the same plate + arrow treatment.
- **Crosswalks**: zebra stripes on every road tile flanking an
  intersection (drawn instead of lane dashes on those tiles).

**Verified headless** (1400×920, swiftshader): carjack probe (swap, bail
ped daze 0.85 → fleeing at 1.5s, yell txt), THE ERRAND end-to-end with the
new HUD live (prog saved), NUG-EX gig branch, ped-lineup + cop-glow +
damage-state screenshots eyeballed, zero pageerrors/warnings.

**Gotchas for the next sprint:**
- A ringing booth within 40px WINS the E press over carjack/exit — test
  probes must teleport to open road or set `gta.ringCd = 999` first (bit
  me twice this sprint).
- `gtaShade` requires `#rrggbb` input — ped/vehicle cols are all hex; keep
  it that way or the cache returns 'rgb(NaN…)'.
- Anything drawn at canvas-y < ~0.35·Hh top-center sits behind the storm
  HUD DOM card at common window sizes (the S7 brief card already lives
  with this; the objective flash was moved to 0.42 because of it).

## Sprint 10.6 — POINT STEERING (2026-07-16, Beau's Claude) — controls patch

Beau's second playtest note: rotational steering is "a mind melt" — when
you're driving west, ← feels like it should mean "go south-er", not
"rotate". Fixed with a second steering scheme, now the DEFAULT.

**Shipped:** `gta.steerMode` — `'point'` (default) vs `'classic'`, toggled
on **T** (toast announces, persisted in `nugGtaSteer`). Physics untouched;
only the input INTERPRETATION branches at the top of `gtaStepPlayerCar`:
- **POINT**: hold the direction you want to GO (screen-relative, matching
  on-foot movement). Desired heading comes from the touch stick (analog)
  → arrows/WASD (8-way) → held mouse cursor (the car chases it), in that
  priority. Steer = clamped angle error × 2.5, gas while |error| < 2.6.
- **Opposite direction** = brake while fast, then a BACK-OUT: `gta.backing`
  (hysteresis: enters > 2.6 rad off + vf < 25, exits < 1.9) reverses with
  the steer sign flipped (sf < 0 flips it back) so the tail aims at the
  target and the nose comes around — natural three-point turns. Holding
  exactly opposite = clean straight reverse.
- **CLASSIC** = the old ↑ gas / ←→ rotate mapping, byte-for-byte.
- Mouse in point mode: hold LMB and the car steers toward the cursor
  (`gta.mouse`, mousemove tracked while held); on foot / classic keeps
  the old thirds scheme. Title card + storm.js MODE_HINT updated (only
  non-gta.js change).

**Verified headless:** facing north + hold ← → heading lands on west and
x falls; hold ↓ → backs out south still facing north (`backing` true);
moving north fast + hold ↓→ → brakes then swings to a southeast heading
(screenshot shows the skid arc); T toggles + persists both ways; classic
rotation regression probed (0.45s hold → CCW as ever). Zero pageerrors.

**Gotcha:** in point mode the touch stick ALSO sets the 8-way key flags
(kept for classic) — the analog branch reads the stick first so they never
conflict, but don't "simplify" one away without checking the other scheme.

## Sprint 10.7 — THE THIRD DIMENSION (2026-07-16, Beau's Claude) — graphics 2

Beau asked for another noticeable graphics round. This is the big one:
Nuggetown goes 2.5D — GTA 1's signature box-building projection, hand-rolled.

**Shipped:**
- **Building extrusion** (`GTA_RISE = 0.055`, `gtaBldgH`, `gtaRoofCol`,
  `gtaWall`, `gtaDrawBuildings`): rooftops drift AWAY from screen center
  (RISE px per world px per story) while footprints stay put; the walls in
  between are quads with a window grid (one row per story, ~1 in 4 lit
  warm — `gtaHash`, stable per frame) and the neon signs that used to be
  painted flat now hang on the wall faces (with a puddle of the color
  spilled on the pavement). Heights are a pure hash of the coarse
  10×9 block (NO rnd() — the city must not move): downtown 2-3 stories,
  batter/grease 1-2, suburbs + harbor warehouses 1, landmarks a uniform 2
  (checked FIRST in gtaBldgH so a landmark never splits heights).
- **Draw order rules** (the part that will bite you if reordered): ground
  pass now paints building tiles as dark FOUNDATION only; the extrusion
  pass runs AFTER every street-level entity (cars/peds/shots/particles)
  and inside it: lamp posts → ALL walls → roofs ascending by height
  (tall overhangs short). Walls draw only when camera-facing (offset sign)
  AND the neighbor across the edge is shorter — coarse-block height seams
  inside a road-bounded cluster render as legit split-level steps.
  Landmark name plates moved AFTER the extrusion pass, translated by their
  rect-center parallax offset so they ride the elevated roof.
- **Lamp posts** at the hash%4 intersections that always had light pools:
  pole line + warm head drifting at 1.15 stories.
- **Trees** grew trunks; canopies drift at 0.8 story over their ground
  shadow.
- **Headlight beams** are two layers now (wide soft spread + hot core) —
  same gtaDrawBeams signature, callers untouched.
- **Night vignette**: radial gradient cached per layout (`gta.vign`),
  drawn after rain, before the HUD.

**Verified headless:** 60-61fps at 1400×920 swiftshader with the full
skyline (same as the flat city — the extra ~4 tile scans and quad fills
are noise), THE ERRAND end-to-end + NUG-EX gig regression green, district
screenshots eyeballed (downtown towers, batter neon walls, suburbs low),
zero pageerrors/warnings.

**Gotchas:**
- Parallax anchor is `ox + W/2` (the SHAKEN screen center), not gta.cam —
  keeps walls glued to their footprints during screenshake.
- Roof quads of same-height neighbors share per-corner offsets and tile
  seamlessly — parapet/edge strokes only draw on EXPOSED edges (neighbor
  shorter), or you get grid lines across every building mass.
- Anything ground-level near a tall building's far side is now correctly
  covered by the overhang (booths, carts, even the player) — that's the
  point; GPS/edge arrows carry the wayfinding.
- Old flat-city building details (roof-edge streetlight spill, vents,
  neon) were REMOVED from the ground pass — vents live in the roof pass,
  neon on walls. Don't re-add them at ground level.

---

# 🏙️ SEASON 2 — NUGGETOWN NIGHTS (the next 10 sprints, NOT STARTED)

Season 1 shipped the game. Season 2 makes Nuggetown a place you LIVE.
Same working agreement as season 1 (pull first, verify per AGENTS.md,
one lore-forward commit per sprint, append SPRINT NOTES). Read the
season 1 notes above before touching anything — especially the append-only
rnd() rule in gtaBuildCity and the S7 mission-engine handoff.

**House rules that constrain every design below:**
- `storm.caught` ONLY GOES UP. Anything purchasable is paid for with the
  new REP currency (S2.1), never the meter.
- The storm is ALIVE in the harbor and STAYS there. Any Dill/syndicate
  arc ends with the case still open. Never free it, never kill it.
- The 🎧 rhythm cup is the Hooded Nug's seed for a FUTURE GAME — do not
  resolve it inside GTN.
- GTN stays a street game; no main-atlas art, no build step, globals
  prefixed gta*/GTA_*.

## The sprints

1. **WHEELS OF YOUR OWN** — the Grease Garage becomes YOUR garage: three
   persistent car slots (localStorage `nugGtaGarage`: cls/col/plate/mods),
   store/retrieve on E at the garage, custom plate text, and your active
   garage car survives page reloads. Introduce **REP** (`nugGtaRep`,
   HUD chip next to the belt): missions, gigs, and stunts now pay REP
   alongside $$$ — REP is spendable, the meter is not.
2. **THE MOD SHOP** — spend REP at the garage: engine tune (maxFwd/accel
   tiers), grip compound, armor plating (hp), the paint booth (full
   palette + pearl flip-flop), and a chili-nitro button (SHIFT while
   driving — kart-lore crossover, the garage sponsors both). Mods persist
   per slot; modded cop cars keep drawing heat.
3. **STREET RACES** — six seeded events (three circuits, three
   point-to-point sprints) with start markers around the districts:
   3 rival AI racers on free-drive AI with rubber-banding, countdown,
   checkpoint arrows, results card, $$$ + REP payouts, and a ladder
   (win all six → the GOLDEN NUG GP + a unique paint).
4. **THE CASE BOARD** — twelve evidence collectibles hidden city-wide
   (batter samples, S.W. manifests, a waterlogged cassette…), each with
   a flavor line; a CASE BOARD tab on the pause map tracking finds with
   red string. Dill's street dialogue reacts to your count. All twelve →
   S2.5 unlocks. Flag: `nugGtaEvidence` (bitmask).
5. **DILL'S CHAIN** — four missions working FOR the detective (both
   sides against the middle): a stakeout (watch step reuse), an evidence
   run under a timer, a tail on a syndicate accountant, and a sting that
   goes loud. Ends with the syndicate's books burned, Dill's best line,
   and the case — say it with me — STILL OPEN. Flag: `nugGtaDill`.
6. **NUGGETOWN STORIES** — the phones never go quiet again: a procedural
   contract generator (templates: deliver / steal / wreck / tail /
   escort × seeded pickup/dropoff/target parts, three REP-gated tiers
   with scaling rewards). Post-campaign booths ring with STORIES jobs;
   a daily seed varies the slate.
7. **NIGHT WEATHER** — it is always night, but not always the SAME
   night: drifting weather states (drizzle → downpour → fog bank → the
   rare CLEAR night). Downpour = slick grip; fog = cop sight halved,
   heat decays faster, headlight cones matter; clear nights make neon
   pop and golden pickups pay double. Radio DJ stings call the weather.
8. **PHOTO MODE + PAPARAZZI** — P freezes the world into a free camera
   (pan/zoom, three filters, PNG export via toDataURL). Then sell it:
   paparazzi gigs — photograph a moving target from inside 90px without
   spooking them (tail rules inverted), REP pay, three marks a night.
9. **FREE-ROAM ONLINE, PT 1** — the big one: a `gta` room on the worker
   gameRoom pattern (coordinate with Chris — net.js/lobby.js/gameRoom.js
   are his stack): shared Nuggetown instance, other players' cars
   rendered with plates + honks relayed, join from the lobby. Sync MVP
   only: positions, headings, car class/color. No PvP damage yet.
10. **FREE-ROAM ONLINE, PT 2 + SHIP IT AGAIN** — multiplayer activities:
    impromptu races (honk at a player near a race marker to challenge),
    NPD TAG (one player wanted, others are the heat), leaderboard for
    online minutes survived at 5★. Then the season wrap: balance pass,
    verify suite over everything, docs (README/AGENTS/CLAUDE), memory,
    deploy, and a README announcement with attitude.

Stretch / season 3 parking lot: interiors (the arcade IN the game — GTN
inside GTN), a train, seasons of STORIES contracts, the Dill case-board
feeding a city-wide finale event, gamepad support.

**Open design questions for sprint 1 (decide, note it, move on):**
- REP display name: REP vs STREET CRED vs CRUST. (Beau gets final say —
  ask if he's around, default REP.)
- Does the garage save COP cars? (Lean yes — jacked cruiser in slot 3 is
  funny — but livery keeps its heat rules.)
- Mods on mission-cargo cars: locked (cargo is cargo).

---

# SEASON 2 SPRINT NOTES (append-only, newest last)

## S2.9 — FREE-ROAM ONLINE, PT 1 (shipped OUT OF ORDER, ahead of S2.1–8)

Chris pulled this one forward: multiplayer before the garage/REP/races
sprints. It stands alone fine — no dependency on S2.1–8 flags.

**What shipped:** shared free-roam Nuggetown on the existing worker gameRoom
pattern (Chris's net.js/lobby.js/gameRoom.js stack). Other players show as
ghost cars/peds with a floating name tag; the horn (H) relays.

**Architecture (important for whoever does S2.10):** GTN is NOT
server-authoritative like Blaster — the city is far too big/stateful, and every
client already runs its own. So `worker/src/games/gta.js` is a pure STATE
RELAY: it stores each player's last transform (x,y,heading,onFoot,carClass,color)
and rebroadcasts them at 20Hz. Clients keep simulating their own traffic/peds/
missions locally and only draw OTHER players from the relay snapshot, reusing
gta.js's own `gtaDrawVehicle`/`gtaDrawPed`. Positions interpolate ~100ms behind.
Consequences: no shared traffic, no PvP damage, no server scoring, and the match
never ends (`isOver()` false, `results()` empty → nothing hits D1). This is the
right seam for S2.10 activities (races/TAG): add message types to the relay +
client, don't try to make the server authoritative over the world.

**Client seam:** single-player is untouched. All MP logic lives in `js/gtaMP.js`
(loads after net.js, like blasterMP.js) behind `window.GtaNet`. gta.js only gains
THREE guarded hook calls (no-ops in SP): `GtaNet.onStep` (broadcast, end of
stepGta), `GtaNet.drawRemotes` (in gtaDraw, under the local player), and
`GtaNet.onGameExit` (leave the room when syncGta deactivates). Entry is the
"🚗 Play GTA online" button on the main page → a tiny host/join modal
(`#gtaMpModal`). INSTANT free-roam: the client auto-readies on connect so a solo
host auto-starts immediately and later joiners fold in via the framework's
existing `onPlayerJoin` mid-match path. In-game overlay shows the shareable code
+ player count. `lobby.js` now guards its handlers by `net.game` so Blaster's
ready-up lobby doesn't hijack a GTA session (they share the NuggetNet singleton).

**Worker:** `gta` added to `MULTIPLAYER_GAMES` (index.js) and `GAME_MODULES`
(registry.js). No wrangler.toml/schema change — reuses the GameRoom DO + the
matches tables it never writes to. maxPlayers 8.

**Verified:** relay unit test; two raw-WS clients through `wrangler dev`
(transform + honk relay); two headless-Chrome pages joining the same city
(each sees the other, overlay → 👥 2, zero exceptions); SP regression (GTA
launches with `GtaNet.active()` false, no errors).

**Still open for S2.10:** plates are the player's display NAME for now (the
garage's custom-plate string is S2.1 — wire it into the `xf`/snapshot `n` field
once it exists). No spectator/quick-match. No online leaderboard yet (that's the
"minutes survived at 5★" board in S2.10).

**Post-merge fix (Beau's Claude, same day):** the MP pill was invisible in-game
— `.gta-mp-hud` sat at z-index 60 while `#gtaWorld` is 9990, so the canvas
covered it. Now 9995 (above the game, below the storm HUD chrome at 9998+).
Anything overlaid during GTN needs z-index > 9990 — same trap as the pill.

## Sprint 10.8 — OPEN DOORS (2026-07-16, Beau's Claude) — interiors

Beau's session finale ask: enterable buildings, headlined by the fan-favorite
"chicken strip club". Delivered: an interior system + three venues. The club
is exactly what it sounds like — chicken strips dancing on poles. Breading only.

**Shipped:**
- **Interior engine**: `GTA_INTERIORS` are hand-authored char-map rooms
  (legend at the top of the section) parked at `GTA_INT_ORIGIN` (-9000,-9000)
  — far outside the city grid so NO outdoor system can coincide with indoor
  coords. While `gta.interior` is set: `gtaSolidAt` answers from the room map
  (player collision routes automatically), `gtaStepWorld` is SKIPPED entirely
  (traffic/cops/missions/timers freeze — hiding indoors pauses the chase),
  `gtaStepInterior` runs the room (heat drains 0.15/s — every door is a
  hideout), `gtaDrawInterior` replaces gtaDraw, weapons don't fire indoors,
  M is disabled. MP: `GtaNet.onStep` still broadcasts, so your ghost jumps
  to -9000 and simply vanishes for other players ("went inside").
- **Doors**: `gta.doors` built at the END of gtaBuildCity by deterministic
  perimeter scan (ZERO rnd() calls). Door-bearing landmarks (strip/noodle/
  ammu) are snapped flush with their block's SOUTH sidewalk at placement
  (`rect.r = b.r1 - h + 1` — deterministic shift, city otherwise unchanged)
  because centered landmark rects are surrounded by filler GT_BLDG and never
  touch pavement (the bug that ate the first door gen). Rendering: a lit
  doorway + accent sign drawn on the wall face in `gtaWall` (new `face`
  param, door replaces that wall's neon) + an always-visible pavement mat
  glow with blinking OPEN in the world pass. White door dots on the minimap.
  E-priority on foot: car > ringing booth > door > ammu counter.
- **🍗 CHICKEN STRIP CLUB** (NEW 8th landmark, Little Batter, appended to
  GTA_LANDMARKS — placement is append-only-safe, first seven unmoved):
  three dancing strips on poles (sway/orbit/bob, sparkle, spotlight sweep,
  disco ball + floor spots), seated patrons, bar (re-breads 25/s), DJ, VIP
  corner with a hooded regular (ONE toast per visit: "even rumors take a
  night off" — a wink, NOT a rhythm-cup resolution), bouncer at the door.
  E at the stage = MAKE IT RAIN 🍞 (6s cd): crumb spray, dancers speed up
  (`gta.tipHype`), the house comps you via gtaPay (meter only goes up).
- **🍜 NOODLE NUG diner**: counter + broth pots (steam), cook, booth
  patrons; counter re-breads 25/s.
- **🔫 AMMU-NUGGET shop floor**: weapon wall, clerk, shot-up range target;
  E at the counter = the SAME restock/45s `ammuCd` as the outdoor zone.
- **Interior music**: `GTA_INT_MUSIC` — the sequencer in gtaStepAudio plays
  the venue's station regardless of radio dial/on-foot (club funk 112bpm,
  diner muzak 84; the ammu clerk prefers quiet).

**Verified headless:** door gen (3 south-face doors), club enter → tip pays
w/ cd+hype → hood cameo toast → heat 3→drains → bar re-breads 40→80 → exit
returns to the pavement; diner regen 30→68; ammu restock (24/80 rounds, 45s
cd); world resumes cleanly outside (spawns, pause map); 61fps; zero
pageerrors/warnings. Screenshots eyeballed (the stage shot is the sprint).

**Gotchas:**
- `gtaHash` returns uint32 but `h >> 5` is a SIGNED shift — negative modulo
  indexed `GTA_PED_OUTFITS[-k]` = undefined → gtaShade crashed the rAF loop
  (frozen sim, stale probes). Use `>>>` everywhere you shift a hash.
- Interior toasts/centered rooms must respect the storm-HUD-card zone
  (canvas top-center y < ~0.35·Hh): toast draws at 0.3·Hh, small rooms bias
  14px low.
- Landmark rects DON'T touch sidewalks by default — anything else that
  wants a street-facing feature needs the same flush-snap treatment.

## Sprint 10.9 — HOUSE LIGHTS (2026-07-16, Beau's Claude) — HUD + interior graphics

Beau's two-line ask: the storm banner is overbearing on GTN, and the 10.8
interiors deserve a graphics round. Both landed.

**Compact storm HUD (storm.js/storm.css, engine-level):** new
`MODE_COMPACT_HUD` set — games in it (just `gta` for now) collapse the storm
card to a slim translucent pill (55% opacity, tighter padding, hint + mode
switch hidden). Hover restores everything; touch taps the game badge
(`stormLabel` click toggles `.expanded` — same CSS state as `:hover`). The
`done` victory card overrides back to full opacity. The GTN `MODE_HINTS`
string lost its "welcome to Nuggetown —" preamble (the title screen owns the
tutorial). `#simSubSwitch` stays hidden by its own id rule — specificity
beats the compact hover-reveal, don't "fix" that.

**Interior graphics round (gta.js, draw-only — zero sim changes):**
- **Structure, all rooms:** room-facing wall tiles (any wall whose south
  neighbor isn't `#`) get a per-venue face via `gtaDrawIntWallFace` — club:
  padded velvet + tuft studs + pulsing neon skirting; diner: wood slats +
  calligraphy banners; ammu: riveted steel + hazard stripes. Walls catch a
  ceiling-light top edge, floors get hash-scuffs, contact shadows under
  north walls, and `gtaIntPool()` is the shared radial light-pool helper
  (fade to SAME rgb at alpha 0 — transparent black leaves gray fringes).
- **Club:** marquee bulbs chase the runway edge, lacquer sheen sweeps the
  stage, faceted mirror ball on a hang wire throws 4 rotating beams, flickery
  CHICKEN STRIP neon on the back wall, back-bar bottle shelf (wall tiles east
  of `B`), drinks/candles on tables, tufted VIP couches + stanchion rope,
  patrons on stools (`pts.stools`, new in gtaIntPts), DJ EQ bars, dancer rig
  v2 (two-tone pole w/ travelling glint, base plate, crumb texture,
  hype-scaled motion-blur ghost).
- **Diner:** menu board (one item 86'd), drawn steam wisps + simmer-bubble
  pots w/ ladles, bowls + chopsticks on the counter, two swaying rows of
  paper lanterns with warm pools (drawn ABOVE the cast — they hang), cook
  stirs forever (headband).
- **Ammu:** display cases v2 (velvet pedestal, per-case colored merch,
  price tag, animated glass glare), painted range lane (dashed borders,
  firing line, RANGE stencil, spent brass), register, ammo boxes on the
  glass, cracked concrete, two rows of fluorescent tubes with cool pools —
  one ballast flickers, cold wash over the whole room.

**Verified headless (puppeteer-core + system Chrome, file://):** HUD at
rest = 442×38 pill @ 0.55 opacity w/ hint+switch hidden; hover and
tap-badge both restore; all three rooms screenshotted (incl. stage-tip hype
state); 61fps indoors; zero pageerrors. Screenshots eyeballed.

**Gotcha:** `gta.ped` is null until the player actually exits the car —
probes that force `gtaEnterInterior()` must build a ped first (copy the
gtaExitCar shape).

## Sprint 10.9.1 — TRY HARDER (2026-07-16, Beau's Claude) — interiors, for real

Beau's verdict on 10.9's interior pass: "that is NOT upgraded graphics."
He was right — at the ~300px pixel canvas (4×+ upscale), 1px props and
0.05-alpha pools vanish; what remained was a giant flat checkerboard.
Round two changes the SYSTEMS, not the trim:

- **Darkness pass** (`gtaIntDarkness`): the room floods with per-venue
  ambient gloom (club 0.62 purple-black, diner 0.52 warm, ammu 0.5 cool)
  on a cached offscreen canvas, then every light source cuts a
  destination-out radial hole — stage wash, pole spots, LED-floor washes,
  candles, lanterns, fluorescents, the neon sign, the exit mat, dim house
  lights over the seating, and ALWAYS one around the player. This one pass
  is most of the perceived upgrade: rooms are now lit, not painted.
  Fixture positions are computed once into arrays (lanterns/tubes) so the
  holes and the post-darkness sprites can't drift apart.
- **Real floors, zero checkerboard**: club = staggered dark hardwood
  (seams/grain/knots/butt joints) + a 12px-cell LED dance floor cycling
  GTA_NEON (rows 4-5 cols 5-16, hash-hot cells) + gold-edged red carpet
  from door to floor (cols 11-12); diner = warm planks + greasy white
  kitchen tile behind the counter (row 1) + red aisle runner (cols 8-9);
  ammu = concrete slabs w/ expansion joints, oil stains, cracks + painted
  safety walkway (cols 7-8). Zone coords are hand-tuned to the char maps —
  if a room layout changes, update them.
- **Depth**: perimeter walls extrude a 5px cap strip OUTWARD (GTA1-style
  thickness, lit rim); the stage gets a slatted skirt face + drop shadow
  with the marquee bulb row moved to its foot; spotlight cones
  (`gtaIntCone`) pour onto each dancer; PA speaker stacks (pulsing
  woofers) hang over the stage corners; smoke haze drifts over the club
  floor; the diner got an exhaust hood over the pot line; ammu got an
  exposed duct run above its fluorescents.
- **Life** (`gta.intPeds`, spawned on enter / cleared on exit): full
  WALKING peds indoors reusing gtaDrawPed — club: 3 dancers holding LED
  cells (bob speed scales with tipHype), a barkeep pacing the bar, 4
  wanderers; diner: aisle-running waiter + 2 wanderers; ammu: a browsing
  customer + wanderer. Tiny brains in gtaStepInterior (wander/pace/dance,
  gtaIntSolid collision, pauses); decorative only — no player collision,
  no MP relay.

**Verified headless:** same probe — 61fps indoors, zero pageerrors, rooms
re-screenshotted and compared against Beau's complaint shot.

**Lesson for future graphics rounds:** at this backing resolution the
levers that read on screen are LIGHT (darkness + holes), pattern frequency
(6-12px, not 1-2px), silhouettes, and MOTION (walking peds). Single-pixel
detailing is invisible — don't bother.
