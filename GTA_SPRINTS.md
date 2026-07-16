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
