# Notes for coding agents (and humans) working on this repo

Two developers (Beau and Chris) both work here with AI assistance, often on
the same day. **Pull before starting work**, and read this before touching
the arcade hall or adding a game — these are the constraints that have
already bitten someone.

## Adding a new game (the full checklist)

1. `js/<game>.js` + `css/<game>.css`, script/link tags in `index.html`
   (script order matters: games load after `storm.js`, before `arcade-art.js`).
2. `js/storm.js`: `MODE_HINTS` / `MODE_BADGE` / `MODE_VERB`, a `sync<Game>()`
   call in `setStormMode` **and** `stopStorm`, a `step<Game>` branch in
   `stepStorm`, a tally branch in `updateStormHud`, and add the mode to
   `pausesStorm()` if the game owns the whole screen.
3. `index.html`: HUD mode button, score tile, leaderboard tab.
4. `js/account.js`: `setScores`, `GAME_LABEL`, and the score-element map.
5. `worker/src/index.js`: the `GAMES` set, a `GAME_MAX_SCORE` plausibility
   cap, and the zero-map in `scoresForUser`. Pushing `worker/**` auto-deploys.
6. Arcade hall: an entry in `ArcadeArt.GAMES` (palette + attract scene in
   `js/arcade-art.js`) and `PLACEMENT` in `js/arcade.js`. Read the hall
   gotchas below first.
7. Score through `storm.caught += ...` (scaled by `storm.perFlyer` for
   parity with the other games) and let `stopStorm()` submit it.

## Arcade hall gotchas (js/arcade.js + js/arcade-art.js)

- **Texture atlas budget.** All hall art packs into ONE 2048×2048 canvas
  with a naive shelf packer. Every game adds a marquee (512×128), side art
  (216×324), and control panel (224×112). It is nearly full at 9 games —
  watch the DevTools console for `ArcadeArt atlas overflow at <name>`
  warnings; overflowed regions render BLACK (this shipped once: a 9th game
  silently blacked out the light tubes, neon strips, and five control
  panels). If you overflow, shrink region sizes in `makeAtlas` or rework
  the packer — don't ignore the warning.
- **Quad winding.** New geometry must follow the per-wall winding rules
  documented in `buildScene` (see `wallX`/`wallZ` comments) or it will be
  back-face culled — "built but invisible" bugs (a cabinet was once placed
  facing into the wall, and a scoreboard was once wound backwards).
- **Placement collisions.** Check `PLACEMENT`, `H.hotspots`, and prop
  positions before placing anything: the east wall z=-14.2..-17.4 is the
  live scoreboard, west wall z=-16.8 is Sauce Brawl (spawns under a drape
  until revealed — localStorage `nugBrawlRevealed`), the entrance zone has
  a vending machine / change machine / velvet ropes.
- **Walk-up interactables** live in `H.hotspots` (label + AABB + `act()`).
  Cabinets get prompts automatically from `H.cabinets`.

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
