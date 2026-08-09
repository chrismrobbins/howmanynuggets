# 🎨 BLENDER SESSION HANDOFF — read this before touching art

Written 2026-08-09 after the two-sprint Blender night (GTN S2.12 FRESH
PAINT + S2.13 THE ZONING VARIANCE, commits `ad9ce14`/`aff1b96`). This is
the working knowledge a fresh session needs to do art at full speed.
**The next mission is already chosen: a MASSIVE arcade-hall graphics
upgrade — skip the incremental warm-up, Beau's orders.** Section 5 is your
briefing.

---

## 1. The law (learned the expensive way)

**Palette fidelity ≠ looking good.** S2.12 graded every tile's mean color
to the old procedural palette. Result: downtown luminance stddev moved
23.2 → 24.2 (+4%) — *literally imperceptible*, and Beau said so from prod.
The whole second sprint existed to fix that.

So, in order:
1. **Measure before painting.** Build/reuse the A/B harness (§4) and
   capture baselines FIRST. Know what number you're moving and look at
   real crops, not your imagination.
2. **Go big, then tune down once.** Contrast 1.0 was invisible, 2.0 was
   cracked-concrete wallpaper, 1.5 shipped. Raking key at 58° = wallpaper,
   44° = right. Start at the known-good midpoints, not at timid.
3. **Structured contrast beats noise.** Curbs, shadows, light pools moved
   the look more than any texture grain. Depth cues > detail.
4. **Variety kills wallpaper.** 2 checker variants of a busy tile = visible
   repetition. 4 variants, hash-picked, mostly-plain (`'ccacbccd'[hsh%8]`)
   = a city.
5. **Every sprite call site keeps its procedural fallback.** The page must
   degrade to the old art, never to invisible/black.

## 2. Blender MCP mechanics (this machine)

- Blender 5.2.0 LTS (ARM64), `C:\Program Files\Blender Foundation\Blender
  5.2\blender.exe`. MCP = ahujasid addon, port 9876: Blender must be OPEN
  with N-panel → BlenderMCP → "Connect to Claude" clicked. First call
  should be `get_scene_info` to prove the socket. Headless fallback needs
  no MCP: `blender --background --python <script>`.
- API quirks: engine string reports `BLENDER_EEVEE` but it's EEVEE-Next —
  no `use_gtao`/`use_ssr`, use `scene.eevee.use_raytracing`;
  `Material.shadow_method` is GONE (wrap in try/except);
  `bpy.context.screen` is None right after `wm.open_mainfile`.
- **Persistence trick:** each `execute_blender_code` call is a fresh
  namespace. Exec your helper source into a module registered in
  `sys.modules` once, then `from <mod> import *` in later calls. Keep
  chunks small; build → render → eyeball the PNG (the Read tool renders
  images) before mass production.
- **The half-size bug:** `primitive_cube_add(size=1)` then
  `obj.scale = (sx, sy, sz)` makes scale = DIMENSION. Scaling by `s/2`
  halves everything — the first compact rendered as a sliver with
  wandering wheels.
- Blender writes `.blend1` backups next to every save — gitignored now,
  never commit them.

## 3. The pipeline (all in `blender/`, all checked in)

`nugrig.py` = the factory. Conventions: **1 Blender unit = 1 game pixel**,
subjects face **+Y** (sprite up), materials named `PAINT_*` render white
and become the runtime tint mask. Two rigs: `rig_setup()` (overhead warm
key + cool fill — entities) and `rig_tiles()` (44° raking key — ground
relief). Renders at 8× supersample. `render_all()` → PNGs;
`build_library()` → the 4 .blend files (one collection per asset);
`export_gltf()` → per-collection .glb (the Unreal on-ramp Beau wants
eventually; mind the 1-unit-=-1px scale on import).

`pack_atlas.py` = stage 2 (plain Python, Pillow + numpy):
premultiplied-LANCZOS ÷8 (never resize straight alpha — halos), grades
ground tiles to `TILE_TARGETS` mean colors **then contrast-expands by
`TILE_CONTRAST`** (the §1 midpoints), masks → white alpha stencils,
shelf-packs, writes `js/gtaArt.js` with the atlas as a **base64 data URI**
— data URIs never taint canvas (GTN photo mode's `toDataURL` survives,
even from file://), there's no build step, and `nugget.png` stays the
repo's only binary art asset.

Runtime seam (`js/gtaArt.js`): `GtaArt.on()`, `.draw(g, name, cx, cy)`,
`.tinted(body, color)` (paint-mask multiply, cached per color — safe for
quantized palettes, NEVER feed it continuously-varying color strings),
`.tintedAll(name, color)` (whole-sprite tint: roof gravel per district,
the cop cap per outfit).

## 4. The verification kit

- Serve: `python -m http.server 8787` **from the repo root** (watch the
  cwd — one session served the wrong directory and "nothing loaded").
- Drive: Playwright headless Chromium, flags
  `--use-gl=angle --enable-unsafe-swiftshader`. Blur the autofocused
  amount input; launch games via `startStorm(1e6, 5000)` +
  `setStormMode('<mode>')`; `const` globals are NOT on window — use bare
  identifiers in evaluate.
- **A/B harness pattern** (rebuild in scratchpad, ~80 lines; recipe also
  in GTA_SPRINTS S2.13): fixed camera spots, art ON vs OFF (`GtaArt.on =
  () => false` gives the byte-identical old renderer), weather pinned,
  screenshot both, composite side-by-side + 2× NEAREST crops + per-shot
  luminance mean/stddev. Claim "better" only with numbers AND crops.
- Hall-specific: `NuggetArcade._H` exposes `cam.x/z/yaw/pitch` for
  deterministic teleports; capture `pageerror` AND console warnings (the
  atlas-overflow guard is a **warning**); screenshot and actually look.
- Budget: 61fps was the bar before and after; hold it.

## 5. 🕹 NEXT MISSION: the arcade hall (a MASSIVE upgrade, not a nudge)

The hall (`js/arcade.js`, ~hand-rolled WebGL) draws everything from TWO
procedural canvas atlases built at hall-init by `js/arcade-art.js`:

- **Main atlas: 2048×2048, FULL at 10 cabinets.** Every game adds marquee
  512×128, side art 200×300, control panel 224×112. Overflowed regions
  render BLACK with only a console warning.
- **Street atlas: 1024×2048** (grew for game 15; both axes must stay
  power-of-two — the hall calls generateMipmaps). Street art NEVER goes
  on the main page.
- **The architecture that matters:** regions are allocated at runtime by a
  shelf packer — `alloc(name, w, h, painter)` where `painter(ctx, x, y)`
  draws procedurally into the canvas. There are no fixed coordinates.
  **Therefore: don't fight the packer — swap the painters.** Render
  Blender art into a sprite sheet (data URI, same as GtaArt), and have
  painters blit their region from it (procedural code as fallback,
  per the law). Two timing options: (a) decode the Image at script load —
  it's ready long before the user clicks the arcade button; (b) re-upload
  the atlas texture on decode — the live scoreboard already re-uploads via
  `texImage2D` (arcade.js ~line 3260), so the pattern exists.
- `makeAtlas()` is consumed once at `enter()` (arcade.js ~line 2267).
- **Geometry gotchas if you add/replace quads:** per-wall winding rules
  documented in `buildScene` (`wallX`/`wallZ` comments) — wrong winding =
  built-but-invisible. Check `PLACEMENT` + `H.hotspots` before placing
  anything. Glow sprites (`'hazard'`, `'thump'`, `'swirl'`, `'votive'`,
  `'party'`, `'candle'`, `'juke'`) do all the blinking — static emissive
  quads can't.
- **What "massive" plausibly means here** (scope for a full night, decide
  with fresh recon): Blender-render the entire texture population — grimy
  carpet, ceiling tiles, wall panels, cabinet wood grain + metal + CRT
  bezels with baked AO, marquee art per game, the street's brick/shopfronts
  /asphalt — with real baked lighting so the hall stops being flat fills;
  plus prop geometry where it pays (a real fountain taught us props read
  hard). The atlas pages are size-locked by the packer only — a BIGGER
  main page (4096²) or a second page is allowed if the packer + every
  `alloc` caller keeps up, but that's real packer work (documented since
  the 12th-cabinet note in AGENTS.md).
- Hall verification: enter via the arcade button (storm first), teleport
  with `_H`, screenshot every zone: entrance, both cabinet walls, deluxe
  Knight wall, scoreboard, street (all five games' entries, NPCs, pier).
  A/B the same spots art-ON vs art-OFF. Watch for atlas-overflow warnings
  — they mean a region silently went black.

## 6. Working with Beau (operating notes)

- High autonomy: recon → plan → execute → verify → present evidence. He
  reviews on prod ("promote and I'll review there" was this night's
  standing order — reconfirm it each session before pushing, per repo law:
  pushing main deploys the live site).
- He wants the .blend sources committed and upgradeable, and eventually
  exported to Unreal — keep `build_library()` in sync with whatever you
  render (the factory script is the source of truth, not the .blends).
- Lore-forward commit messages, sprint notes appended to GTA_SPRINTS.md
  (or the relevant doc), AGENTS.md status entry, memory updated. The
  repo's docs culture is load-bearing — the next agent is only as good as
  your handoff. Hi. That's you now.
