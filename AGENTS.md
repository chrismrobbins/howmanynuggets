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
  1024²) with its own overflow warning — never add street art to the main
  2048² page.
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
