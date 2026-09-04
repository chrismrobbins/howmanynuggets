# 🎨 BLENDER SESSION HANDOFF — read this before touching art

Written 2026-08-09 after the two-sprint Blender night (GTN S2.12 FRESH
PAINT + S2.13 THE ZONING VARIANCE, commits `ad9ce14`/`aff1b96`). This is
the working knowledge a fresh session needs to do art at full speed.
**UPDATE 2026-08-08: the Section-5 mission SHIPPED — THE GRAND REOPENING.**
The whole hall + street + the five regulars are Blender-rendered now
(`hallrig.py` -> `pack_hall.py` -> `js/hallArt.js`, 50 regions, one 337KB
JPEG data URI). Read §5b for what that added to the law before painting
anything new.
**UPDATE 2026-08-09: the hall has real Blender GEOMETRY now, not just Blender
paint** (`hallmesh.py` -> `pack_mesh.py` -> `js/hallMeshData.js`). Read §0 for
what Beau actually means by "upgrade", then §7 for the pipeline.

---

## 0. WHAT BEAU MEANS BY "UPGRADE" — read this before you plan anything

Every art session so far has mis-scoped its first attempt in the same
direction, and every time Beau has had to say so from prod. Writing his own
words down so the next session starts where this one finished:

> *"most of the arcade feels like it wasn't built in blender and like a real
> life video game that people would pay for. all of this seems like a free
> game and I'd love to improve on all the things."*
>
> *"This is something I want to show family and friends and be proud of it."*

That is the bar. Not "make the thing in the screenshot better". **When Beau
sends a screenshot, it is an EXAMPLE, not the scope.** He sent a photo of the
double-parked car; the actual job was the whole arcade. Read the ask as
"bring this to a level worth showing people" and scope accordingly.

Corollaries that have each been learned the hard way:

- **Find the layer nobody has touched.** S2.12 re-graded textures that were
  already fine (invisible). 0b0eac0 re-skinned surfaces in a room that had no
  bloom (the real fix was the bloom). This session's boxes were still boxes
  after two nights of texture work. Before planning, ask: *which layer of this
  picture has never been upgraded?* — palette, lighting, geometry, or motion.
- **Go wide, not deep.** Asked to choose a slice, he picked *"Both, hall
  first, no stopping"* and *"go big, add loading"* over any budgeted option.
  Given a choice between polishing one asset and covering ten, cover ten.
- **Payload is not the constraint you think it is.** He explicitly rejected a
  size budget in favour of loading work. Spend bytes on quality; move them off
  the critical path instead of shrinking them.
- **He also said, mid-session:** *"I think you're spending way too many cycles
  validating and we could use some more cycles prepping and planning and
  making sure you have the best process."* See §8 for the loop that came out
  of that.

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
- **Hide the storm layer before screenshotting the hall.** The falling
  nuggets and the HUD are DOM *on top of* the canvas — they cover the thing
  under test, and they cost enough to make an fps reading meaningless (a run
  measured 25fps that was really 61). Inject
  `#nuggetStorm,.storm-hud,.arcade-hint{display:none!important}`.
- **Do not invent camera spots.** Hand-picked coordinates land inside walls
  and the collision solver quietly walks the camera back into the hall — one
  run "photographed" the cabinets while claiming to shoot the street. Read
  `H.hotspots[].stand` and let the game tell you where to stand.
- Localhost leaderboard fetches fail CORS by design; that console noise is
  identical ON and OFF, so diff the counts rather than reading the text.
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

## 5b. What THE GRAND REOPENING added to the law (2026-08-08)

- **The street atlas is 1024x2048 — NON-SQUARE.** Anything converting its
  uv rects to pixels must scale u by 1024 and v by 2048. The first target
  measurement scaled both by 1024 and silently graded every street region
  toward garbage (the white hen went charcoal).
- **Measure targets with HallArt OFF.** Once the painters blit Blender art,
  `makeAtlas()` measures YOUR OWN OUTPUT — set `HallArt.on = () => false`
  in the harness before building atlases or the pipeline eats its tail.
- **Emission clips hue before the packer sees it.** Strength ~1.1 keeps
  neon colors saturated; 2.0 turns yellow/green white. Brightness comes
  from the pack glow pass + highlight protection, not emission.
- **Grading dims emissives** — mean-matching scales the confetti down with
  the floor. `grade(..., protect=N)` keeps pixels that were hot in the raw
  render. Carpet uses protect=100.
- **Bevel modifiers run PRE-scale** (the half-size bug's cousin): `box()`
  applies scale before beveling or a 4px bevel becomes a dodecagon.
- Blitted regions are opaque JPEG — fine everywhere current, but a future
  region needing ALPHA (like nugGold) must stay procedural or ship as a
  separate PNG URI.
- Runtime text positions are a CONTRACT with the Blender builds (vending
  header y36, change header y26, shop sign strips, panel title 0.16h/0.9h,
  across smudge y0.585h). Move geometry -> move the text in arcade-art.js.

## 5c. THE LIGHTS GO ON (2026-08-09) — read before touching emissives

Beau reviewed 0b0eac0 on prod: the facade sign was BLOWN OUT and the whole
thing read "meh". Two separate mistakes, both instructive.

**Mistake 1 — I upgraded the wrong layer.** I re-skinned surfaces that were
already textured while the frame was dominated by flat-fill geometry (the
double-parked compact was three solid swatches; the across-the-road block
washed out) and by the fact that **the hall had no bloom**. In a dark neon
room, bloom IS the upgrade — a texture swap can't fake light. `js/arcade.js`
now renders into an FBO, extracts >0.74 luma, blurs it at quarter res twice
separably, and composites at 0.92 with a slight saturation push. It falls
back to direct rendering if the FBO won't complete (`H.post === false`).

**Mistake 2 — I trusted a number over a picture.** `street-facade` was IN my
A/B set. Its mean went 24 -> 30 and I read that as "more contrast" without
opening the file. The mean going UP is exactly what a blowout looks like.
Open the crops. Every time. (This is the S2.12 lesson, re-learned.)

The rules that came out of it:
- **176 is the emissive ceiling.** Quads drawn `{e: 1}` go through
  `mix(light, vec3(1.45), e)`, so any texel over 255/1.45 = 176 clips to
  flat white ON THE WALL however clean the texture looks alone. pack_hall's
  `soft_ceiling()` compresses neon into [120, 172].
- **Don't mean-grade emissive regions.** `hall_targets.json` was measured in
  a world with NO bloom; matching those means now double-counts brightness
  and lifts a sign's black box to gray. Neon keeps its own dark box.
- **Don't bake glow anymore.** The baked halo existed to fake bloom. With a
  real bloom pass it only greys the background. `NEON_GLOW` is all zeros now
  (kept as a dial for anything bloom can't reach).
- **Emission strength is for HUE, not brightness.** Fat Impact glyphs at
  high emission merge into one block under bloom. Letters sit at 0.5.

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

## 7. 🧊 THE GEOMETRY PIPELINE (2026-08-09) — read before modelling anything

Sections 1-6 are about what the hall is PAINTED with. This one is about what
it is SHAPED like, which until now was: axis-aligned boxes hand-coded in
js/arcade.js. Beau's verdict on the result was *"most of the arcade feels like
it wasn't built in blender... this seems like a free game"*, and he was right:
the compact was a slab with a smaller slab on top, the cabinets were a
five-segment extrusion with a joystick painted on, and the whole block across
the road was ONE QUAD with windows drawn on it.

    blender/hallmesh.py  --(Blender)-->  render_hall/mesh/*.json
    blender/pack_mesh.py --(python)-->   js/hallMeshData.js  (+ js/hallMesh.js)
    js/arcade.js         Builder.model(name, uvMap, xf)

### The conventions (a contract — do not drift)

- **Units are HALL metres.** The ceiling is 4.2, a cabinet is 1.94 tall.
  (nugrig is 1-unit-per-game-*pixel*; different rig, different rule.)
- **Blender is Z-up, the hall is Y-up:** `hall = (bx, bz, -by)`. det = +1, so
  handedness — and therefore triangle winding — survives.
- **A model's FRONT faces -Y in Blender**, which lands on the hall's +Z. Same
  convention arcade.js already used for NPCs.
- **Origin on the ground, centred**, so a call site places a model with a
  position, a yaw and nothing else.
- **Materials are atlas coordinates, not shaders.** `MATS` maps a material
  name to (region, sub-rect, emissive, tint) — exactly the four things the
  hall's vertex format carries.
- **`$MARQ` / `$PANEL` / `$SIDE` are SENTINEL regions**, remapped per instance
  via `xf.remap`. One cabinet model wears all ten games' artwork.
- **Every call site keeps its procedural rig** in an `if (!Model)` branch.
  `HallMesh.on = () => false` in a harness gives the byte-identical old hall.

### Baked AO is the single biggest lever, and it was free

The vertex format is pos/normal/uv/emissive/**tint**, and `tint` only ever
held a per-MATERIAL constant — a per-vertex float sitting in the buffer doing
nothing. `hallmesh._bake_ao` raycasts each model against itself (plus a ground
plane) and multiplies the result into it. Contact shadow and crevice darkening
on every surface, no new textures, no shader change, one byte per vertex.
Emissive surfaces are exempt — neon does not dim because it is near a wall.

### Payload comes off the critical path

`js/hallMeshData.js` (~670KB, ~334KB gzipped) is **not** in index.html.
`js/hallMesh.js` (2.2KB gzipped, and the only thing in the page) injects it as
an async `<script>` after first paint. A `<script>` and not `fetch()` on
purpose: this site must work from disk, where fetch is blocked by origin
rules. `enter()` waits on `HallMesh.whenReady()` if someone clicks the arcade
button before it lands, showing `.hall-booting`.

### The four traps, all of which cost real time

1. **`build_all()` must leave every model at the ORIGIN.** `extract()` bakes
   `matrix_world`, so objects nudged apart "just for the contact sheet" ship
   that nudge. The cabinets exported 2.2m sideways and drew *inside the west
   wall* — which looks exactly like geometry that failed to build.
   `export_all` now zeroes any stray location and says so.
2. **`recalc_face_normals` is only meaningful on a CLOSED manifold.** Give it
   an open shell and it picks a direction that is just as likely to be inward,
   and the hall culls back faces — so inward is not "shaded oddly", it is
   INVISIBLE. Build solids closed (the cabinet body is one prism, not side
   slabs plus loose front quads); `_orient()` catches the rest per shell,
   by signed volume when closed and by facing-vs-centre when open.
   **Verify by rendering with `use_backface_culling = True`** — that is the
   test the hall actually performs.
3. **Interpolate profiles with PCHIP, never smoothstep-per-segment.**
   Smoothstepping each span forces zero slope at every keyframe, so a profile
   scallops between its own keys. On the compact that swung the surface normal
   0.67 -> 0.82 -> 0.54 -> 0.89 between adjacent body rings, which striped the
   roof and banded the shading.
4. **Anything that has to be READ needs explicit UVs** (`Part.set_uv`). Box
   projection is fine for grain; a marquee projected by its dominant axis
   samples a hair-thin band of its own artwork stretched across the panel, and
   the control panel comes out mirrored.

Related: material boundaries should follow ring TOPOLOGY, not a normal
threshold. Classifying the compact's glass by face normal produced a sawtooth
boundary that read in-game as black spikes stabbing out of the pillars; giving
the cross-section an explicit waist point fixed it permanently.

### 32-bit indices

Ten Blender cabinets are ~56k vertices between them. `Builder.upload` switches
to `Uint32Array` above 65535 (via `OES_element_index_uint`, checked into
`H.uintIndex`) — an overflow does not error, it WRAPS, stitching triangles
between unrelated vertices.

### What is modelled, and what is next

Done: `compact`, `cabinet` (x10), the five regulars (`crumb` `dill` `gravy`
`hood` `hen`), `streetLamp`, `bench`, `facadeBay` (x12 across the road),
`acUnit`, `trimBase`, `trimCrown`.

Next, in rough value order: the vending + change machines and the jukebox; a
coffered ceiling; the bus shelter; bins/hydrant/newspaper box; the five street
game doors (club, grate, cellar, pier gate, garage); shopfront awnings and a
fire escape variant for `facadeBay`; and the hall's own entry vestibule.
`build_library()` keeps `hall_meshes.blend` in sync; `export_gltf()` is the
Unreal on-ramp (1 unit = 1 metre here, so these import at real scale).

## 8. THE WORKING LOOP (and the cycles this session wasted)

Beau's process note was *"way too many cycles validating... more cycles
prepping and planning."* He was right, and the fix is specific.

**What wasted time:** modelling ONE asset, packing it, running the full
Playwright A/B, opening the crops, then modelling the next. Six full
verification rounds for what was really one integration risk.

**The loop that works:**

1. **Recon + diagnose FIRST, in one pass.** Name the layer that has never been
   upgraded and say so out loud before touching anything. This session's whole
   value came from one sentence — *"the hall has no way to display a Blender
   mesh at all"* — and that was findable in ten minutes of reading.
2. **De-risk the SEAM once, with one throwaway asset.** Get a single model all
   the way through Blender → pack → engine → screenshot. Everything that can
   go wrong structurally (winding, uv resolution, index width, scale, the
   mirror pass) goes wrong here, on one cheap asset.
3. **Then BATCH.** Model everything else without stopping to verify each one.
   Preview in Blender while building (`preview()` renders in ~2s and the Read
   tool shows it) — that catches shape problems without touching the browser.
4. **One verification pass at the end.** Full A/B, all spots, fps, pageerrors,
   console. Look at the crops (§1, §5c — this is not optional, it is how the
   blown-out sign shipped).
5. **Write the handoff as you go, not after.**

**Blender-side checks that are nearly free and catch most of it:**
`preview()` for shape; `preview()` with `use_backface_culling = True` for
orientation; printing vert/tri counts for budget; printing the exported bbox
for scale and origin. Use these instead of a browser round-trip.

## 9. THE LEDGER — things already resolved, do not re-litigate

Each of these cost at least one wrong turn. They are settled.

| Question | Answer | Why |
|---|---|---|
| Ship meshes as JSON numbers or packed binary? | **Packed base64, quantized** | A car is ~400KB as decimal text and ~75KB packed, and it decodes straight into the typed arrays the vertex buffer wants. |
| Put the mesh data in index.html? | **No — async `<script>` injection** | Keeps ~334KB gzipped off first paint. `<script>` not `fetch()`, because the site must work from `file://` where fetch is blocked. |
| Recompute normals in JS to save bytes? | **No, ship them** | Loses Blender's split/auto-smooth normals, which is the entire reason to model in Blender. int8 normals are ~1 degree of error — invisible under this lighting. |
| Port the builders to JS and generate geometry at load (zero bytes)? | **No** | Throws away bevel, auto-smooth and any freeform modelling, and means maintaining two implementations. It is also not what "do it in Blender" means. |
| New atlas regions for the car's clean paint? | **No — sample a sub-rect of the existing region** | `gtaCarSide` has windows painted on it (drawn for a slab with none). Materials carry a `[u0,v0,u1,v1]` sub-rect, so paint samples a clean band below them. No repack of the 337KB sheet for one prop. |
| Per-face material heuristics for glass/paint? | **No — drive materials off ring TOPOLOGY** | Any positional/normal threshold produces a SAWTOOTH boundary. Give the cross-section an explicit waist point instead. |
| Trust `recalc_face_normals`? | **Only on closed manifolds** | Build solids closed; `_orient()` handles the rest per shell. Verify with backface culling on. |
| Instance the cabinet, or bake 10 copies? | **Bake 10** | The engine has no instancing path and `buildScene` bakes one static buffer. Cost is 32-bit indices, already handled. |
| Is 16-bit index overflow the cause of weird geometry? | **It was NOT, twice** | Both times the real cause was elsewhere (a sawtooth material boundary, then a baked object offset). `Builder.upload` now switches to Uint32 above 65535 anyway — but MEASURE before blaming it. |
| Where does baked AO live? | **The vertex `tint` channel** | It already existed and only ever held a per-material constant. Multiply into it, never overwrite. Emissives are exempt. |
| Should models carry their own world position? | **Never** | `extract()` bakes `matrix_world`. Origin on the ground, centred; the call site places it. `export_all` zeroes stray locations and says so. |

**Two habits worth keeping.** First: when something looks wrong, *measure the
thing itself* — dumping the exported triangle edge lengths, the face
orientation, the buffer vertex counts and finally the in-page placement math is
what actually found each bug; three plausible theories in a row were all wrong.
Second: a metric can lie. "46% of surface area faces inward" looked like a
smoking gun and was an artifact of counting the back faces of every small box.
A render with backface culling answered it in one shot.

## 10. 🔌 THE POWER PLANT (2026-08-09) — the payload rule changed, and so did the target

Beau, reviewing the geometry night from prod, closed the size question for good:

> *"Stop concerning yourself about that, it is 2026, include a load screen while
> those massive files download and if it blooms to a 250MB site, so be it. This
> is about seeing where the limit can go on upgrading graphics in blender and
> making something that is truly a video game. There is no limit here."*

So: **never propose a byte budget again.** Move payload off the critical path,
then spend. The only budget still real is the CONVERTER's first paint (it is the
product) and the 61fps floor.

### The diagnosis this section exists to fix

§7 gave the hall Blender *geometry* and §5 gave it Blender *paint*. Neither
touched the layer that actually makes it read "free": **the hall throws away
everything Blender knows about a surface except its colour.** `FS_LIT` is, and
has always been:

    albedo × (ambient + 8 Lambert point lights) × bakedAO

No specular. No normal maps. No roughness or metalness. No shadows. No tone
mapping. WebGL1. A wet street under a neon sign gets no highlight; brick has no
relief; a chrome bezel and a carpet respond to light identically. You cannot
texture your way out of that, and three sessions have now tried.

The lucky part: `hallrig.py` builds every texture out of **real 3D geometry**
under an ortho camera. A normal bake and a roughness/metallic bake are the same
scene rendered two more ways — authentic Blender data, not a JS approximation of
one.

### The staging (in order, each shippable on its own)

0. **The boot screen** — DONE. `js/hallBoot.js` is an asset ledger; every heavy
   payload registers a job and the arcade door draws a real bar off it.
   `js/hallArt.js` is now a 3KB loader and the ~450KB sheet moved to
   `js/hallArtData.js`, injected async exactly like the geometry. Nothing heavy
   is in index.html any more. `pack_hall.py` writes the DATA half only — the
   loader is hand-maintained code with a fallback contract.
1. **The seam** — WebGL2 (WebGL1 keeps today's shaders verbatim), a
   normal/roughness/metal shader with GGX specular and ACES tone mapping,
   proven end-to-end on ONE material before anything is batched.
2. **The batch** — bake the full map set for every region; bigger pages.
3. **Light** — more lights, shadow maps, volumetric lamp shafts, wet street.
4. **Geometry** — the §7 next-list.

### Traps already identified for stage 1 (read before writing the shader)

- **The albedo is already LIT.** `hallrig` renders with a 44° raking key and
  bakes that shading into the colour. Feeding it to a PBR shader double-lights
  it. True PBR wants a FLAT base-colour render, which is a material-override
  pass in the same rig. Migrate region by region: put a **"how much runtime
  lighting to apply"** value in the ORM texture's BLUE channel so pre-lit and
  properly-flat regions can coexist while the batch is in flight.
- **Do not add tangents to the vertex format.** Half the hall is hand-built
  quads in `buildScene`; every one would need a new attribute. Derive the TBN
  per-pixel from screen-space derivatives instead — free, and it works on
  procedural geometry and Blender meshes alike.
- **Normal maps must not ship as JPEG.** Block artifacts in a normal map make
  the lighting swim. Albedo can stay JPEG; normals want lossless.
- The atlas packer is deterministic, so the normal and ORM pages can be built by
  running the SAME `alloc` sequence and blitting from parallel sheets. Do not
  invent a second packer.

### What THE POWER PLANT actually shipped (2026-08-09, commits 1791a9a / bf16e85 / this one)

Stages 0-4 of the plan above, all on prod:

- **The boot screen** (`js/hallBoot.js`). An asset ledger; heavy payloads
  register a job before loading and the arcade door draws a bar off it.
  `js/hallArt.js` and `js/hallMesh.js` are hand-written loaders now; their data
  lives in `js/hallArtData.js` / `js/hallMeshData.js` / `js/hallMapsData.js`,
  all injected async. **index.html carries nothing heavy.**
- **The material shader.** WebGL2 gets normal + roughness + metalness with GGX
  specular; WebGL1 keeps the old renderer verbatim. `H.pbr = false` in a
  harness, or `HallMaps.on = () => false`, gives the byte-identical old hall.
- **The maps.** `hallrig.render_maps` renders `<name>_n.png` and `<name>_s.png`
  per asset; `pack_maps.py` packs them to a 2048² pair (449KB + 307KB PNG).
- **Thirty lights**, nearest-16 uploaded per frame, replacing the eight-slot
  steal-from-the-hall override table.
- **Rain that lands.** Anisotropic wet-street ripple + lamp shafts + light pools.
- **Four models**: `hydrant`, `awning`, `bin`, `busShelter`.

Measured at 1280×760, art ON vs OFF: street-ground mean 20.98 → 26.14, stddev
11.75 → **27.43** (+133%); every other spot within a few percent; blown-pixel
fraction flat or DOWN at 7 of 10 spots. 60fps both paths. Zero pageerrors, zero
atlas warnings, `gl.getError()` clean. WebGL1 with `webgl2` forced to null
still builds and renders.

### New entries for the ledger (§9) — each of these cost real time tonight

| Question | Answer | Why |
|---|---|---|
| Can a Bump node feed a normal-map bake? | **No** | Route a Bump output to an Emission and neither EEVEE nor Cycles evaluates it. Proven by rendering at 8× strength: face stddev moved 0.499 → 0.497. Geometry relief bakes fine; the fBm micro-grain is still albedo-only and would need an explicit height→normal node graph. |
| Blender 5 compositor for a render pass? | **Don't** | `Scene.node_tree` is gone (`compositing_node_group`), `CompositorNodeMixRGB`/`Math`/`Composite` no longer exist, File Output moved to `directory`/`file_name` and its node-level format only offers multilayer EXR. Swapping materials to emission needs none of it. |
| View transform for a data pass? | **Raw** | Standard pushes every value through the sRGB curve on the way to the PNG, bending every normal vector and every roughness in the set. |
| Should a packer regenerate its loader? | **Never** | `pack_mesh.py` wrote `js/hallMesh.js`, and silently reverted the boot-ledger wiring the first time geometry was repacked. Both packers now emit the DATA half only. |
| Which yaw for a prop on the near shopfronts? | **0, not PI** | A model's front faces -Y in Blender = +Z in the hall. `facadeBay` uses PI because it is across the road facing BACK. Copying that buried every awning inside the building. |
| `sw_glass` on a street prop? | **No such region** | The street sheet's swatch table (`SW2`) is not the main atlas's. This is the `lampHot` trap, walked into a second time — the model bails SILENTLY for the whole prop. Check the model's regions against the target atlas before believing a prop "failed to build".

### Still open, in value order

1. **Shadow maps.** Nothing in the hall casts. Baked AO + the mirror floor sell
   contact well enough that this stayed below the line tonight, but it is now
   the biggest single thing left in the lighting.
2. **Flat-albedo migration.** The albedo is still the pre-lit render, so the
   room's lights do not truly re-light anything — specular and relief are real,
   diffuse is still baked. The ORM blue channel exists precisely so this can go
   region by region. Do the ground and the walls first.
3. The rest of the §7 model list: vending/change/jukebox, coffered ceiling, the
   five street doors, fire escape, the hall's own vestibule.
4. The bump-grain normal graph (row 1 of the table above).

---

## 11. 📋 THE NEXT SESSION — read this first, it is the whole brief

Beau's verdict on THE POWER PLANT: *"this was a decent update but we've got a
long ways to go."* He is right, and the gap is measurable.

### The number this session exists to move

Across the twenty verification shots taken at the end of the last session:

| | dead black (luma < 8) | near-dead (luma < 20) |
|---|---|---|
| average frame | **13.8%** | **38.6%** |
| street-lamps | 29.5% | **60.1%** |
| street-facade | 25.0% | 58.4% |
| hall-westwall | 19.5% | 48.8% |

**Nearly two-fifths of every frame is nothing.** That is the single biggest
reason this reads as a free game, and no amount of material work fixes it,
because the problem is not how the lit parts look — it is how much of the
picture is unlit parts. A real game fills its frame: sky glow, distant
geometry, bounce light, atmosphere.

**Target: near-dead under 20%, dead black under 5%, with the blown-pixel
fraction NOT rising** (that last clause is the §5c lesson — it is trivial to
fix darkness by blowing out the highlights, and it looks worse).

Capture the baseline FIRST, with the same harness, before touching anything.

### Why the last session could not fix it

Two separate causes, and they need different work:

**(a) Nothing is there.** The sky above the street is not dark — it is *absent*.
The ceiling above the hall is a black plane with two white bars on it. No
amount of lighting fills a space with no geometry in it.

**(b) What is there receives no light.** A surface out of reach of a lamp gets
`uAmbient` (0.22, 0.21, 0.29) times a pre-lit texture, and that is all. There
is no bounce, no environment term, and emissive surfaces contribute NOTHING —
a magenta neon sign does not tint the wall it is bolted to.

Under (b) sits the structural blocker: **the albedo is still the pre-lit
render**. hallrig bakes a 44° key into every texture, so diffuse response is
frozen and raising the light count from 8 to 30 moved the mean by +4%. The
material shader is built and correct; it is being fed the wrong fuel.

### The four movements, in this order

**1. THE SKY — biggest win per unit of risk, do it first.**
Purely additive; nothing existing changes. A night sky dome with sodium glow at
the horizon, a distant Nuggetown skyline in silhouette with lit windows (GTN
already has the city's look — reuse it), a moon, drifting cloud, and rain that
is visible *against* the glow instead of against nothing. Then feed the sky
colour into the ambient term for upward-facing surfaces, which is free bounce.
Sixty percent of the street's dead frame is directly above the horizon line.

**2. THE RELIGHT — the headline, and the risky one. De-risk on ONE asset.**
- `hallrig.render_albedo`: a flat base-colour pass. The machinery is already
  proven — it is the same material-swap-to-emission trick `_orm_swap` uses, and
  §10's traps (Raw view transform, no compositor) already apply.
- **Re-render at 2× while in there.** Pages go 2048² → 4096², street to
  2048×4096. One Blender batch buys both flat albedo and the texel density the
  payload budget was lifted for. Check `MAX_TEXTURE_SIZE` and mipmaps.
- Replace the flat `uAmbient` constant with a hemisphere term (sky colour above,
  ground colour below, by normal.y) — this alone lifts every surface that
  currently gets one number.
- **Make emissive surfaces light the room.** Cheapest honest version: place a
  light at every emissive quad cluster (the rig already has a world light list
  and a nearest-N upload, so this is data, not architecture).
- Turn the ORM blue channel to 1.0 for architecture as each region migrates.
  That channel exists exactly so this can go one region at a time.
- Expect the hall to go DARK at first. Re-tune light intensities in the same
  step — they are currently tuned to ADD to a texture that was already lit.
- `hall_targets.json` and pack_hall's grading were built for the lit look and
  will need revisiting. Do not mean-grade a base-colour render to a target
  measured off a lit one.

**3. THE CEILING — the interior's sky.**
Coffered/drop ceiling with real fixtures (bodies, not bright rectangles), ducts,
cable trays, hanging signage, speakers. Plus the entry vestibule. This is the
§7 model list, reordered by how much black it deletes.

**4. SHADOWS — last, and cut this first if time runs out.**
Nothing in the hall casts. Do it AFTER the relight raises the floor, because
shadows remove light and would make the metric worse against today's baseline.
A single shadow map per zone with PCF for the key sources, plus cheap contact
shadows under props and NPCs.

### Ground rules carried forward

- Sections 0-10 still apply, especially §8's loop (recon once, de-risk the seam
  on one throwaway asset, then BATCH, then one verification pass) and §1's
  "open the crops, every time".
- **Always push to prod when verified.** Beau has no local setup; prod is his
  review environment and asking costs him a round trip. Do not ask.
- The A/B harness pattern and the ten camera spots from the last session are
  worth rebuilding first — they are what turns "looks better" into a number.

---

## 12. 🌃 THE FOUR MOVEMENTS (2026-08-09, late) — all four shipped

§11's brief, executed in order, in three commits on prod: `33e3c72` THE SKY,
`86d97bd` THE RELIGHT (+ THE CEILING), `c0a37de` SHADOWS.

### The number

Ten fixed spots at 1280×760, art ON, same harness every run:

| | dead black (<8) | near-dead (<20) | blown (>246) | mean |
|---|---|---|---|---|
| baseline (this session's own) | 18.11% | 55.43% | 0.33% | 29.17 |
| after THE SKY | 10.18% | 39.79% | 0.34% | 33.47 |
| after RELIGHT + CEILING | 0.95% | 13.27% | **0.00%** | 48.54 |
| after SHADOWS (shipped) | **1.00%** | **14.09%** | **0.00%** | 47.82 |

Target was near-dead under 20 and dead under 5 **without the blown fraction
rising**. All three, with room to spare, and nothing in the frame clips at all.

**The absolute numbers are NOT comparable to §11's table** — those ten camera
spots were lost with the old scratchpad and rebuilt from scratch, and these
ones look at more sky. Only same-harness deltas mean anything. The harness is
`shoot.js` (rebuild it; it is ~180 lines: a PNG-histogram decoder with no image
library, ten spots, `H.state = 'idle'` to freeze the camera, `H.t` pinned).

### The diagnosis that actually mattered

Not the lighting. **`hall_targets.json` "ceiling": [9.6, 8.7, 18.3].** A 3.8%
reflectance on the largest surface in the building. hall_targets was measured
off the ORIGINAL PROCEDURAL PAINTERS in a room whose only ambient was a flat
0.22 — so what it encodes is not a set of albedos, it is a set of FINISHED
PIXELS, and every light added in two sessions had been multiplying into a
number that was already the answer. Anything times 0.038 is nothing.

### New tools, in the order you will want them

- **`shoot.js`** — the darkness harness. dead / near-dead / blown / mean / sd.
- **`where.py <png>`** — flags blown magenta and dead cyan and lists the worst
  40px cells. Two guesses about the marquee were wrong; this answered it in one
  run. **Use it before theorising.**
- **`crop.py`** — `zoom` / `ab` / `probe` / `sheet`. §1 says open the crops.
- **`fallbacks.js`** — webgl2 / webgl1 / sky-off / art-off / pbr-off in one go.

### Pipeline changes

- `hallrig._flatten(sc)` + `render_flat` → **base colour × ambient occlusion**,
  no directional key, into `render_hall/flat/`. The lit set stays on disk.
- `hallrig.RES_MUL` / `--res 2` multiplies **pixels only, never ortho_scale**.
- `arcade-art.js` has **one** scale knob, `AS`: `alloc()` scales the 2d context
  and hands each painter its ORIGINAL dimensions, so every hard-coded offset in
  that file (vending y36, change y26, the shop sign strips — the §5b text
  contract) still lands. Gated on `MAX_TEXTURE_SIZE >= 4096`.
- `pack_hall.ALBEDO_LUMA` moves a region's LUMA to a real reflectance and
  leaves its HUE alone — the palette contract survives. `ALBEDO_FLOOR` stops
  AO plus contrast expansion pushing crevices through zero. `ART_CEIL` brings
  artwork white points down now that the room is bright.

### New ledger rows (§9) — each cost real time

| Question | Answer | Why |
|---|---|---|
| Why did 30 lights move the mean 4%? | **The albedo was 0.038** | Not a lighting bug. A palette measured as finished pixels and then used as reflectance. Check `hall_targets.json` before adding a light. |
| Raise albedo, keep the lights? | **No — retune in the same step** | First pass put wall panels at 52: the room came back a washed lavender box with blown UP from 0.37% to 0.85%. Brighter and WORSE. Shipped values are ~⅔ of that. |
| The marquee is blown, so the texture is too bright? | **No — the compositor had no shoulder** | marq_knight caps at 178/255 and still came out a white slab; the bloom landed on top and the 8-bit buffer clipped the sum. `where.py` found it; two texture repacks changed the blown count by exactly zero pixels first. |
| One world-space top-down shadow map? | **Never indoors** | It finds the CEILING first and shadows the entire room the ceiling is the lid of. One map per zone, eye under the ceiling at y=3.9. |
| Which faces cast? | **Back faces (`cullFace(FRONT)`)** | Puts the bias error inside the solid instead of on the lit surface where it shows. Plus a geometric-normal offset on the lookup — a depth bias alone either acnes the floor or peters the contact away. |
| Sky colour for fog? | **Not the dome's** | A ray at eye level down a street does not travel through open sky. Using `skyBase` for fog painted the whole block across the road traffic-cone orange. `skyFog` gates the glow on elevation. |
| Emissive geometry as a light source? | **Derive it from PLACEMENT** | Ten marquees, ten CRTs, ten panels, four tubes and 80m of trim threw FOUR lights between them. Derived, so the 11th cabinet lights itself. Long fixtures need a RUN — one point in a 6m tube lights a disc. |
| Nearest-N lights by distance? | **By CONTRIBUTION** | With 60 fixtures, three dim panel glows crowded out the streetlamp lighting the road. Weight by the shader's own attenuation so ranking and rendering agree. |
| A comment inside a template literal | **No backticks** | ``` `outside` ``` in a GLSL comment terminated the JS string. `node --check js/arcade.js` catches it in a second — run it after every shader edit. |
| `bin` exported as `bin.001` | **Wipe `bpy.data.objects`, not just the scene** | `hallmesh.wipe()` clears the HALLMESH collection; a stale datablock elsewhere still owns the name. A `.001` suffix silently breaks that model's lookup. |
| MCP for a long build+export? | **Go headless** | `build_all()` + `export_all()` over the socket returned "No data received" and the export did NOT happen — while leaving a plausible-looking mesh dir. Verify by reading a vertex range out of the JSON, not by trusting the call. |

### Still open, in value order

1. **The sky is procedural, not Blender.** Deliberate: the dome, the deck, the
   moon and the skyline are a GLSL function — zero payload, tunable by uniform,
   no atlas pressure. A Blender-rendered equirect panorama with real modelled
   towers is the upgrade, and it is a self-contained one.
2. **NPCs and the regulars do not cast.** The maps are baked off the STATIC
   buffers. A second small dynamic map, or projected blobs, would finish it.
3. **The hall's own reflections.** The floor mirrors by re-drawing the world
   scaled (1,-1,1); nothing else reflects. A screen-space pass on the wet
   street is the next big look item.
4. `hall_targets.json` is still a lit-world measurement everywhere `ALBEDO_LUMA`
   does not override it. Re-measuring it properly, off the flat pass, would let
   `ALBEDO_LUMA` be deleted rather than layered on top.
5. The §7 model list minus the ceiling: vending/change/jukebox, the five street
   doors, a fire escape variant for `facadeBay`.
6. The bump-grain normal graph (§10 ledger row 1) is still unbuilt.

## 13. 🎞 THE LONG NIGHT (2026-08-09, later) — five acts, all shipped

Beau's brief for this one was one sentence: *"lets be overly ambitious on what
we accomplish this round... let's rethink what we can accomplish and go
insane."* Five commits on prod: `4f3d61d` THE FLOAT BUFFER, `1ca1699` THE LENS,
`94be87f` THE SKYLINE, `ea304a5` THE WET STREET, `a58207a` THE MOTION LAYER.

### The number

Sixteen fixed spots at 1280×760, every renderer feature on, same harness:

| | dead (<8) | near-dead (<20) | blown (>246) | mean | chroma | fps |
|---|---|---|---|---|---|---|
| baseline (this session's own) | 0.63 | 16.33 | 0.00 | 53.34 | 50.80 | 60.0 |
| THE FLOAT BUFFER | 0.50 | 14.39 | 0.01 | 55.00 | 52.02 | 60.0 |
| THE LENS | **0.20** | **12.25** | 0.01 | 57.52 | **52.31** | 60.4 |
| THE SKYLINE | 0.34 | 13.54 | 0.01 | 57.20 | 51.88 | 60.2 |
| THE WET STREET | 0.34 | 13.93 | 0.01 | 57.12 | 52.00 | 60.4 |
| THE MOTION LAYER (shipped) | 0.34 | **13.80** | **0.01** | **57.22** | 51.82 | 60.1 |

**The spot table is NEW** (16 spots, built from the game's own hotspot `stand`
values) so these are not comparable to §12's. Only same-harness deltas mean
anything. `chroma` is new too — mean per-pixel saturation, added because §12's
lesson was that a *brighter* frame can be a *worse* frame and nothing was
measuring colour.

`blown 0.01%` is the headline, not `0.00%`. See below.

### The diagnosis that mattered, and again it was not lighting

**The scene FBO was `RGBA8`.** The lit shader's brightest possible emissive was
`tex.rgb * 1.45`, into a buffer that saturates at 1.0 — so a dim backlit panel
at 0.72 and a neon tube at full tilt arrived at the bright pass **as the same
pixel**. Every measured frame in this hall's history came back `blown 0.00%`,
and three sessions read that as a win. It was the symptom: the room had no
highlight range at all, which is why thirty fixtures and a full relight could
only ever move the midtones, and why every light source read as a flat pastel
rectangle instead of as a light.

Same shape as §12's albedo finding. The number that looked like success was the
ceiling.

### The tools, and the two rules they now enforce

**`blender/tools/` is CHECKED IN.** Three consecutive sessions built this kit in
a scratchpad, shipped, lost it, and rebuilt it from prose in this file. It ships
nothing. Read `blender/tools/README.md`.

`shoot.js` · `crop.py` (sheet/ab/zoom/probe/tunesheet) · `tune.js` · `motion.js`
· `fallbacks.js` · `probe.js` · `png.js` (PNG decode + stats + frame diff in
node stdlib — no image dependency, on purpose).

Two things it catches that summary statistics cannot:

1. **A fallback that renders an identical frame is not a passing test, it is a
   seam that never fired.** `fallbacks.js` diffs every degraded path against the
   shipped one. On its first run it found three dead seams that the mean/dead
   columns had reported as "ok".
2. **Spots come from the game.** The first spot table here was invented, put
   four cameras inside the facade row, and reported 48% dead black. It was a
   brick wall.

`tune.js` is the one that changed the working loop: it pokes
`NuggetArcade._TUNE` between frames, so a 4-D box of interacting dials gets
swept in one browser session instead of edit → reload → 16-spot run.

### New ledger rows (§9) — each cost real time

| Question | Answer | Why |
|---|---|---|
| `blown 0.00%` — good, right? | **No, it is the ceiling** | An 8-bit scene target clamps every emissive to 1.0 before the bloom pass sees it. Nothing in the room could be brighter than paper. |
| Emissive gain 4.0, since there is headroom now? | **2.2** | Gain is a RANGE knob, not a brightness knob. At 4.0 the neon is glorious and the marquee lettering is an illegible bar. Sweep against surfaces with READING on them. |
| Bloom threshold at 1.0 — principled? | **0.80** | The threshold secretly does a second job: a wide blur of everything above it is the only thing lifting the dim end. At 1.0 the drain wall went 0.3% → 30% black. |
| ACES for the tonemap? | **Khronos PBR Neutral** | ACES rotates highlight hues hard enough to undo the S2.12 palette contract and THE RELIGHT's albedos. And delete its black-offset term — it cost `dead 0.63 → 8.45` in one run. |
| Vignette as a CSS overlay? | **In the shader, pre-tonemap** | A black sheet over a finished frame costs the corners their contrast and colour. The same curve before the curve is an exposure change. |
| Seed the grain off `H.t`? | **Per FRAME** | The harness pins `H.t` to hold the room still. Grain that freezes with the clock is a fixed pattern. |
| Release rack focus in `stepZoom`? | **In the frame loop** | Returning from a game lands in `'return'`, not `'zoom'` — the hall gets stranded permanently soft. |
| Bake the skyline as an RGB panorama? | **Never — bake DATA** | R haze / G window / B shade / A silhouette, palette mixed at runtime. A picture would freeze the city out of the one table the dome, fog, ambient and wet road all share. |
| Point every tower at the origin? | **Random yaw** | From the origin you then only ever see ONE face, every visible normal is identical, the shade channel is constant, and the render comes back as flat cut-outs — i.e. as the hashed version it replaced. |
| Equirect azimuth mapping? | **Measure it** | `skyline.py calibrate()` renders four markers at known bearings and reads their columns back. The answer is `u = 0.75 - az/2π` in Blender's frame. Guessing yaws the whole city against the street. |
| Panorama V lookup? | **`1.0 - v`** | Nothing in this renderer sets `UNPACK_FLIP_Y_WEBGL`, so PNG row 0 — the highest latitude — lands at t=0. The city hung from the zenith by its roofs. |
| Puddles as a specular change? | **DIFFUSE first** | The road's ORM already opts fully in, so `max(pbr, wet)` erased it and only a 12% roughness term survived. Water darkens what it sits on; that is what draws the shape. |
| Linear remap for the puddle mask? | **Sharp `smoothstep`** | `skyFbm` piles its output within ~0.1 of the middle. A linear remap gave a mask whose mean value was 0.09 and whose effect was, correctly, invisible. Water has an EDGE. |
| The hall is monochrome — rebalance the lights? | **No. Measured, twice.** | A 3×3 sweep of cabinet-light against ambient moved chroma <1 point, and raising the cabinet lights made the room brighter and *less* colourful. The hue is in the ALBEDO. Do not re-run this. |
| A dead motion channel in `motion.js`? | **Check the window first** | The failing tube stutters every ~5s; a 1.4s sample sees only the healthy band. Per-channel sample windows. A measurement bug looks exactly like a rendering bug. |
| Guard a seam with `window.HallArt &&`? | **`typeof X !== 'undefined'`** | They are top-level `const`s in classic scripts and are NOT on window. The guard short-circuits and the assignment silently never happens. §4 said this about reading them; it is just as true writing. |
| A comment inside a template literal | **STILL no backticks** | Hit three more times tonight, all in GLSL comments. Run `node --check js/arcade.js` after every shader edit, every time. |

### Still open, in value order

1. **The street is the weak half now.** The hall's eight spots average
   `near-dead 6.1`; the street's eight average `21.5`. `13-drain` (30.6) and
   `10-busstop` (30.4) are the worst tiles in the build, and both are large flat
   brick with one tone and no wear. That is an ART problem, not a lighting one —
   grime, staining, a second brick variant, awnings and fire escapes to break
   the wall up. This is where the next night should go.
2. **Nothing dynamic casts a shadow.** Still true, still deliberate; the maps
   bake once off the static buffers. NPCs and the regulars are excluded. A
   second small dynamic map, or projected blobs, would finish it.
3. **Screen-space reflections.** The floor mirrors by re-drawing the world
   scaled (1,-1,1); the puddles now reflect the sky and the city, but nothing
   reflects the *street itself* — the parked car does not appear in the water
   under it.
4. `hall_targets.json` is still a lit-world measurement everywhere
   `ALBEDO_LUMA` does not override it. Re-measuring off the flat pass would let
   that whole override table be deleted rather than layered on.
5. The §7 model list minus the ceiling: vending/change/jukebox, the five street
   doors, a fire escape variant for `facadeBay`, the bus shelter.
6. The bump-grain normal graph (§10 ledger row 1) is still unbuilt.
7. The skyline panorama is 4096×512. At 1280 wide with a 62° FOV, 1:1 would be
   ~7400px around, so it is soft if you walk right up to the pier rail.

## 14. 🧱 THE GRIME (2026-08-09, latest) — the street, and a bug that was going to eat the hall

§13's still-open list had one item at the top: the street is the weak half, and
its two worst views are both large flat brick with one tone and no wear on it.
Shipped as `58eb3ef`.

### The number

| eight street spots, near-dead | before | after |
|---|---|---|
| 09-doorway | 14.70 | 13.56 |
| 10-busstop | 30.41 | 29.73 |
| 11-gta | 17.23 | **13.74** |
| 12-club | 0.38 | 0.38 |
| 13-drain | 32.26 | **25.65** |
| 14-croft | 16.73 | **9.54** |
| 15-pier | 39.80 | 39.82 |
| 16-skyward | 19.49 | 19.55 |
| **street average** | **21.4** | **19.0** |
| all sixteen | 13.85 | 12.63 |

mean 57.17 → 57.71, chroma 51.88 → 51.49, 60.2fps. The hall's eight spots are
untouched to two decimal places — every change here is gated outside the doors.

**15-pier (39.8) is now the worst tile in the build and it is not brick** — it
is the sea, the sky and the harbour rail. That is where the next art night
should look, not at another wall.

### Three things were wrong and only one of them was the texture

1. **ONE TONE.** `t_brick` was four shades, uniformly random — every brick the
   same colour as every other brick of its shade. Relief cannot rescue that.
   Eight shades now, over a much wider spread, with two burnt headers (nearly
   black, which every real stock wall has), spalled faces sitting RECESSED with
   the bevel opened up, and the occasional brick replaced in fresh mortar.
   `mapmat()` grew a **`stain`** channel so the coarse wrapped map drives BASE
   COLOUR as well as bump — that is where the soot comes from, and it is
   reusable on anything else that needs to look like it has been outside.

2. **ONE WALL, FOURTEEN TIMES.** `facadeBay`'s brick materials are `$BRICK`
   sentinels now, remapped per bay by the call site — the §7 cabinet trick
   applied to a terrace. Runs of 3-5 bays, so the street reads as premises with
   party walls rather than as an alternating pattern.

3. **NOTHING ON IT.** 42 metres of wall carrying four air conditioners and a
   neon sign. Two `fireEscape` models: landings, stringers, open grating,
   rails, a zigzag flight and a drop ladder hanging short of the pavement.

### New ledger rows (§9)

| Question | Answer | Why |
|---|---|---|
| A second BRICK to break the repeat? | **A different MATERIAL** | Two bricks side by side are still two bricks: the first attempt came back a grey-and-red chessboard of near-square blocks that read as tiling, not as a building. `t_brick2` is painted render over brick — big scored panels with no unit rhythm at all. |
| Bake the wear as a vertical gradient? | **It cannot tile** | A building's wear is a vertical story — soot at the top, damp at the bottom — and a vertical gradient in a tile that repeats 2.2x up a wall is a set of stripes. The picks are functions of (col mod 4, row mod 8); the vertical story is told by GEOMETRY (sills, fire escapes, AC units). |
| One repaired brick in sixteen? | **One in forty** | This texture repeats every 1.4m across the terrace. Anything conspicuous at 1-in-16 comes back as a polka dot. |
| Patches inside a panel box? | **They vanish** | The rig shoots a top-down ortho: anything whose top sits below the panel face is INSIDE the panel and renders as nothing at all. Put them a hair PROUD with a wide bevel so the raking key finds the edge. |
| Vertical stain planes for a downpipe? | **They render as PILLARS** | Standing proud of the panels they catch the raking key, so the streak comes out BRIGHTER than the wall it is supposed to be dirtying. Damp rises at a horizontal joint anyway, and a joint already tiles. |
| Which render set does `pack_hall` read? | **`render_hall/flat`** | Confirmed, not assumed: repack, then diff six regions the change does not touch. All matched to within JPEG noise (0.30–0.55) while `brick` moved 5.51. Packing from the lit set would silently re-grade the entire hall. |
| `blender --background --python hallmesh.py -- build_all` | **Does nothing** | `hallmesh.py` has no `__main__` block, so that command imports the module and exits successfully. Drive it with a `--python` driver that calls `build_all()`/`export_all()` and PRINTS the per-model vertex counts. |
| A new model, so bevel it like the rest? | **Not thin ironwork** | Every other model gets a bevel because a hard edge on a large flat surface reads as cardboard. A fire escape is 20mm bar seen from eight metres, and the bevel tripled it to 6576 verts. `bevel=0.0` → 2298. |

### 🚨 THE BUG THIS FOUND, which was going to take the whole hall down

**`OES_element_index_uint` is a WebGL*1* extension.** On WebGL2, 32-bit indices
are CORE and `getExtension` returns null for it — so `H.uintIndex` has been
**false on every WebGL2 context in the world** since §7, and `Builder.upload`
has been quietly falling back to `Uint16`, where an overflow does not error, it
**WRAPS**, stitching triangles between unrelated vertices.

It never fired because nothing had crossed 65535. Adding two fire escapes took
the street buffer to 67765 and the block across the road turned into a black
smear — 69% dead pixels — which is how it was found.

**The hall's own static buffer measured 64960.** That is 575 vertices of
headroom, 99.1% of the limit, on a renderer that believed it could not address
past it. One more ceiling module, one more trim run, and every browser would
have rendered the arcade as black spikes with no error anywhere.

Fixed. `upload()` now warns from 62000 up with the number of vertices left, so
the next session is told while there is still room to react.

### Still open, in value order

1. **`15-pier` is the worst tile in the build now (39.8) and it is not a wall.**
   Sea, sky and the harbour rail. The water is a single tiled region with a
   baked swell; the rail is four boxes.
2. **`10-busstop` (29.7) barely moved** — it is not brick-dominated, it is a
   bright sign against a dark shopfront, and the dark side is the shop, not the
   wall.
3. The terrace's GROUND floor is still blank brick end to end. Real streets put
   shutters, doorways and bins down there.
4. Nothing dynamic casts a shadow (§12, §13 — still deliberate).
5. Screen-space reflections: the puddles mirror the sky and the city, but not
   the street itself. The parked car does not appear in the water under it.
6. `hall_targets.json` re-measure off the flat pass, to delete `ALBEDO_LUMA`.
7. The §7 model list minus the ceiling and the fire escape: vending/change/
   jukebox, the five street doors.

## 15. 🔁 FOUR ROUNDS (2026-08-09, latest) — pick the next thing, do it, repeat

Beau's brief: *"figure out what to work on next and do it. Then the next time
you write a 'what's next', add that to your existing queue and do that as well.
Repeat that four total times."* Four commits, each chosen from the previous
one's own measurements: `b84ef7b` THE HARBOR, `0a35ba6` THE REGULARS CAST,
`8b8c1d7` THE JUKEBOX, `c9abbdc` THE SAUCE-O-MATIC.

| | dead | near | blown | mean | chroma | fps |
|---|---|---|---|---|---|---|
| THE GRIME (16 spots) | 0.39 | 12.63 | 0.01 | 57.71 | 51.49 | 60.2 |
| THE HARBOR (16) | 0.56 | 12.12 | 0.01 | 57.45 | 51.04 | 60.1 |
| THE REGULARS CAST (17) | 0.53 | 11.80 | 0.01 | 57.35 | 50.34 | 60.3 |
| THE JUKEBOX (17) | 0.53 | 11.85 | 0.01 | 57.54 | 50.27 | 60.5 |
| THE SAUCE-O-MATIC (18) | 0.51 | 11.46 | 0.01 | 58.22 | 50.40 | 60.3 |

**The spot table grew from 16 to 18**, so the ALL row is only comparable within
a block. `15-pier` alone went 39.82 → 32.17.

### The through-line: a spot table only measures what it points at

Round 2 started as "the regulars have no contact shadow" and turned into a
finding about the KIT. Nothing in the verification suite had ever pointed a
camera at a person — every one of the sixteen spots was aimed at a wall, a
cabinet, a road or the sky. That is exactly why five characters stood on the
pavement with no shadow for four sessions without it appearing in a number.

Two spots were added as a result, and both immediately earned their place:
- `17-regular` — Big Crumb full length from his own hotspot stand.
- `18-vending` — the golden nug's hotspot stand.

Between them the hall's two walk-to props and its people are now measured. If
you add a thing a player goes TO, add a spot that looks AT it.

### 🚨 The 32-bit index bug, second half

§14 found that `H.uintIndex` tested `OES_element_index_uint` — a WebGL**1**
extension that returns null on WebGL2 — and fixed the value.

**It left the assignment at the END of `build()`, seventy lines AFTER
`buildScene()` has already uploaded every buffer in the hall.** So it was still
`undefined` at the only moment it is read. The fix measured as working purely
because nothing had yet crossed 65535: street 59209, hall 64960.

Adding the jukebox took the hall to **69863** and the room came back as
diagonal shards across the entire frame. It is now next to `hdrCap` at context
creation, and the hall is the first buffer in this project's history actually
running on 32-bit indices (`bytes: 4`, read back off the live buffer).

**A capability probe that runs after the thing it gates is not a probe, it is a
comment.** Worth checking the others.

### New ledger rows (§9)

| Question | Answer | Why |
|---|---|---|
| The sea is dark, so light it? | **It was not reaching the horizon** | The harbour was a 24×18m apron; you could see the END of it, and the bare sky between its edge and the skyline was a solid orange slab across a fifth of the frame. Extend the plane past the far clip and let the fog close it. |
| Bright sky below the horizon? | **Tighten `skyBase`** | The ground→sky transition spanned -0.30..0.015, i.e. 17 degrees of full-brightness sodium BELOW the horizon line. |
| The sea can use the wet-street path? | **It was, and it had PUDDLES** | The sea plane is outside, faces up and is low, so it passed every test the road uses. A road is a rough surface with a film on it and smears its reflection; open water is smooth with SHAPE and its reflection is sharp. Opposite materials. |
| Contact shadows on the lit pass? | **Sprite pass, multiply blend** | The lit-path version drew — 180 draws a run, right transform, right winding — and put nothing on screen at any size or opacity. `ZERO / ONE_MINUS_SRC_COLOR` on the sprite pass multiplies the framebuffer by (1 - blob), which IS a shadow. Neutralise `uGlowGain` for that draw or the shadow gets 1.7× darker. |
| A swept arch is a crown? | **Not without its faces** | Left the tympanum open, so it read as a bent ribbon with the wall showing through. |
| Put glass over the title cards? | **Nothing here is transparent** | A "glass" box is an OPAQUE box; it turned the whole jukebox face into a white slab. The lit backing IS the window and the cards stand proud of it. |
| A flat panel deep inside a carcass? | **Build it as a closed solid** | §7 trap 2 again: an open shell has no inside, `_orient()` guesses its facing from the part centre, guesses wrong, and the hall culls it. The vending machine's face came back as a hole through to the wall. |
| Re-map a region across a modelled front? | **Not if it carries baked text** | §5b bakes header/side/bin labels into fixed places in `vending`. The face wears the WHOLE region and the geometry goes around it. |

### Still open, in value order

1. **`10-busstop` (29.7) has not moved all night** and is now the worst tile.
   Diagnosed but not fixed: it stands 1.2m from a sign, so part of the number
   is the spot — but the right third of it is a genuinely featureless dark slab.
2. **The terrace's GROUND floor is blank brick end to end.** Shutters,
   doorways, bins. Visible in every street view.
3. **The change machine** is the last procedural box in the hall (no hotspot,
   which is why it went last). `build_vending` is the pattern.
4. Screen-space reflections: the puddles mirror the sky and the city, but not
   the street — the parked car does not appear in the water under it.
5. `hall_targets.json` re-measure off the flat pass, to delete `ALBEDO_LUMA`.
6. **Audit the other capability probes for the ordering bug above.**
7. The hall is at 69863 vertices on 32-bit indices now — the 16-bit cliff is
   gone, but `upload()` still warns from 62000 and that warning is whitelisted
   in `fallbacks.js`. If the buffer ever needs splitting, that is the signal.

---

## 16. 🎬 SIX ACTS (2026-08-09, latest) — the walk, the edge, the street and the room

Beau's brief, in two messages: *"one thing to erase is the walking. walking
back and forth is not a fun feeling to see and should be removed"*, then
*"read the handoff and find more graphics to upgrade. I think you're also
forgetting about Blender. Lean into making this a video game and not something
that is free to play. this being on a webpage shouldn't scare you. it's 2026
and we have the machines to run great stuff"*, then *"pick multiple things to
do next and add it to the queue, then execute that queue. Repeat that five
times total."*

Six commits: `929a8b9` THE GLIDE, `aff0b4a` THE EDGE, `c474345` THE GROUND
FLOOR, `05d6a0e` THE WET ROAD, `684fb61` THE FLOOR PLAN, `e18a593` THE
PAVEMENT.

### The number

| | dead | near | blown | mean | chroma | hard | fps |
|---|---|---|---|---|---|---|---|
| start of session (18 spots) | 0.49 | 11.47 | 0.01 | 58.18 | 50.35 | — | 60.5 |
| THE EDGE (18) | 0.50 | 11.39 | 0.01 | 58.24 | 50.33 | 0.621 | 59.9 |
| THE GROUND FLOOR (18) | 0.42 | 10.05 | 0.00 | 60.71 | 49.92 | 0.650 | 55.7 |
| THE WET ROAD (18) | 0.42 | 10.13 | 0.00 | 61.10 | 49.93 | 0.655 | 60.4 |
| THE FLOOR PLAN (20) | 0.38 | 8.83 | 0.01 | 63.65 | 49.85 | 0.782 | 59.2 |
| THE PAVEMENT (20) | 0.38 | 8.42 | 0.01 | 64.80 | 49.35 | 0.777 | 58.8 |

The spot table grew 18 → 20, so ALL is only comparable within a block. The
comparable half is per-spot: `08-ceiling` 17.72 → 8.43, `02-aisle` 11.19 →
7.85, `13-drain` 25.14 → 17.40, `09-doorway` 13.50 → 10.61, `04-eastwall` mean
80.63 → 91.46, and **`10-busstop` 29.63 → 19.47 with dead black 0.74 → 0.04**
— the tile §15 signed off as "has not moved all night".

### The three findings worth more than the acts they came from

**1. `antialias: true` has been a lie since THE FLOAT BUFFER.** That flag only
multisamples the DEFAULT framebuffer and every pixel of this hall goes through
an offscreen RGBA16F attachment. Three sessions of lighting, geometry and
material work went onto a frame with no antialiasing at all.

**And nothing in the kit could see it.** dead / near / blown / mean / sd /
chroma are all HISTOGRAM statistics — they describe the distribution of colour
in a frame and are completely blind to how that colour is ARRANGED. A staircase
and a smooth ramp have the same histogram. `png.staircase()` (the `hard`
column) is the kit's first arrangement metric; the class of defect it catches —
aliasing, texture shimmer, a mip chain gone to mush, a normal map swimming — is
exactly the class that makes a frame look free-to-play.

**2. NOTHING IN THIS RENDERER IS TRANSPARENT, and it caught me three times in
one session** — the shop window, the crane cabinet's prize box, and (before
that, in §15) the jukebox title cards. Building "glass" in front of a light is
building an opaque box in front of a light nobody will ever see. **If you want
to see INTO something, do not build the thing you would be seeing through.**
Corner posts and a lit interior read as glass; the eye supplies the pane.

**3. The metric is a proxy and twice this session it was wrong.** THE WET ROAD
moved near-dead 10.05 → 10.13 — flat — while the road went from reflecting
nothing to carrying the whole terrace down its length; near-dead punishes a
reflective surface for reflecting a night sky, which is the correct thing for
it to do. THE PAVEMENT's horizon fix moved `15-pier` near-dead 32.02 → 33.88
because it DELETED a solid bright bar that the metric had been counting as
"not dark". Both times the crop was right and the table was not. Same family as
§13's `blown 0.00%`.

### Ledger rows (§9)

| Question | Answer | Why |
|---|---|---|
| Movement feels weightless — add head-bob? | **No. Add momentum.** | Bob is the 1998 patch for a camera that snaps 0→3.4m/s in one frame. `glide()` ramps velocity in over ~90ms and out over ~130ms; a blocked axis loses its momentum or you build a shove against a wall and slingshot off it. `motion.js` has a `no-bob` ANTI-channel that fails if `cam.y` moves while walking. |
| Raise the terrace for a proper 2.6m storey? | **0.56m, and measure what survives** | The arcade door sees that wall across ~60° of vertical FOV, so every metre eats ~66px of the sky above it — and the sky above it is THE SKYLINE. |
| Modelled it beautifully, why is it murk? | **Nothing was lighting it** | The streetlamps are on the kerb at z 6.9 and the terrace is at 13.9. Seven metres of road between the band and the nearest fixture. Tints 0.5-0.7 → 1.05-1.35 AND a light per unit. |
| Why does the wet road reflect nothing? | **It was never in `bufs.floor`** | Reflections are a MIRROR PASS; the road was in the opaque set, drawn after the mirror, on top of it. It needs its own translucent floor buffer (different atlas). |
| A dark machine in a dark room? | **Out-read the floor** | `furnBody` at the cabinets' 0.92 was a black slab cut out of the carpet — the carpet is the brightest thing in that room. |
| A prop looks fine, place it anywhere? | **Check `H.hotspots[].stand`** | A planter on a stand is a hotspot the player can no longer reach, and that does not read as a bug, it reads as the game ignoring you. |
| The horizon bar again? | **Ramp the OTHER way** | Sea top at the 70m clip is d.y −0.029; the panorama's towers stand on a plane at the camera's own height so their feet are at −0.006. The sky must still be GROUND at −0.029 and only reach full sodium above the city's feet. |
| Trust the comment next to the constant? | **No** | `aberration: 0.0035, // ~1px at the corners` was 3.6px. |
| Bare `NPCS` in a `new Function` probe? | **`NuggetArcade._NPCS`** | `new Function` bodies run in GLOBAL scope; a const inside the IIFE throws inside the rAF tick and playwright reports "promise was garbage collected". |
| Measure motion the instant the key goes down? | **Pre-roll it** | The idle breath fades over ~150ms and its tail reads as head-bob. |

### Still open, in value order

1. **`15-pier` (33.9 near-dead) is the worst tile and the metric is lying about
   it** — that frame is a night harbour and dark water is correct. Either give
   it something to look at (a moving vessel, a channel buoy wake, a gull) or
   stop reading its near-dead number.
2. **The root fix for the horizon:** `blender/skyline.py` should render the
   towers standing on a plane BELOW the camera so the panorama's bottom rows
   carry silhouette instead of empty alpha. The `skyBase` ramp is a seam over it.
3. **The carpet is the highest `hard` in the game** (2.17 at `02-aisle`): a
   uniform full-brightness confetti with no wear paths and no falloff. It is
   also the biggest surface in the hall.
4. **Screen-space reflections.** The mirror pass is planar and only reflects
   about y=0 — so nothing reflects in a shop window, a puddle on the pavement
   or the crane cabinets' own glass.
5. **The regulars have a rigid-body idle now, not an articulated one.** Splitting
   each model into body + head parts (two objects per NPC through the existing
   exporter) would buy a real head turn for very little.
6. `hall_targets.json` re-measure off the flat pass, to delete `ALBEDO_LUMA`.
7. Audit the remaining capability probes for the §15 ordering bug.
8. Buffers: hall static **85528**, street **110505**, both on `bytes: 4`
   (verified off the live buffers). `upload()` still warns from 62000 and that
   warning is whitelisted in `fallbacks.js`.

## 17. 🧍 THE CAST (2026-08-12) — the layer that had never been touched at all

Beau's brief was one line: *"pick it yourself and handle it all."*

So the round started by asking §0's question — *which layer of this picture has
never been upgraded?* — and the answer was not in doubt once `motion.js` ran.
Palette, lighting, geometry, post, materials and content have each had whole
sessions. Reflections got the mirror pass; motion got THE GLIDE. **Animation had
never been touched.** Twelve moving channels in the entire game, and only two of
them attached to a person — `npc.shift` and `npc.yaw`, both whole-body
transforms. There was not one object in this world with a part that moved
independently of its body.

That is worst exactly where §0 cares most. You walk up to a regular to talk to
them; `17-regular` exists *because* a player goes there. And what a player found
was five characters who slid to face them as rigid lumps and bobbed straight up
and down like corks.

### What shipped

**Articulation, end to end.** Each regular ships TWICE now: the one-piece model
unchanged, plus the same geometry split into parts (`CAST` in `hallmesh.py`).
Fifteen new part objects across five characters and the claw machine.

**The split is anatomical, not generic.** There is no skeleton here and adding
one would have made every character worse. A rig general enough for a bouncer
with no neck, a pickle in a hat, a cup that does not stand up, a robe with a cowl
and an actual chicken articulates all five badly. So:

| who | parts | what moves, and why that and nothing else |
|---|---|---|
| crumb | body armL armR footL footR | No neck — his head IS his body. Shoulders and ankles instead, and the breath is squash-stretch on the body. |
| dill | body hat arm | Tips the brim (he is a detective) and works the notepad while you talk. |
| hood | body head | The cowl turns and the ROBE DOES NOT. The best-looking change in the round. |
| gravy | body lid | He is a cup. The lid is the only part his anatomy justifies moving. |
| hen | body head | The only real neck in the cast, so the only real head turn — plus THE PECK. |
| claw | body trolley grab | A crane machine whose claw never moved. Two parts, not one: a trolley on a rail must not tilt. |

**THE HEAD LEADS AND THE BODY FOLLOWS WHAT THE NECK CANNOT REACH.** For anyone
with a `headMax`, the head turns first and the body only rotates away the excess.
This one ordering is most of the effect: it is the difference between a person
noticing you and a statue rotating to face you.

**The breath is a SQUASH, not a rise.** The old 5–11mm vertical `bobAmp` was the
head-bob mistake one scale down — periodic translation reads as floating. A body
that is breathing changes shape, and it does it about the floor.

**Crumb's feet were four and a half centimetres THROUGH the pavement** (`z
-0.045`) while his body started at `0.115`, so the only regular with visible feet
had them buried under a body that hovered above them. They stand on the floor
now. Detached limbs are the house idiom (Rayman) and they stay detached — being
their own parts is what lets the body shift its weight while they hold still. A
floating body over planted feet reads as weight; a floating body over floating
feet reads as a balloon.

### The number, and why it is the wrong lens

| | dead | near | blown | mean | sd | chroma | hard | fps |
|---|---|---|---|---|---|---|---|---|
| baseline (20 spots) | 0.381 | 8.331 | 0.007 | 65.104 | 42.305 | 49.357 | 0.772 | 60.2 |
| THE CAST (same 20) | 0.370 | 8.329 | 0.007 | 65.119 | 42.282 | 49.352 | 0.777 | 60.0 |

**Flat. That is the correct result and it was predictable before the run.**
`shoot.js` PINS THE CLOCK, so a statue and a living character photograph
identically — §16 wrote that sentence about the regulars already. Every statistic
in the kit is a histogram over one frame; this round changed nothing about any
single frame's distribution of colour and everything about the sequence of them.
Same family as §16's aliasing find and §13's `blown 0.00%`, and the third time
this project has had to say it: **the metric is a proxy, and here it was measuring
the wrong axis entirely.**

The two things it *did* catch are both real and both small: `17-regular` mean
55.14 → 55.85 with near-dead 6.48 → 6.19 (Crumb's feet stopped being inside the
pavement and started catching floor light), and `20-cranes` dead 0.24 → 0.02.

The evidence that matters is `motion.js` (12 channels → 20, all sweeping) and the
`pose.js` strips.

### The kit could not see any of this, so the kit grew

Two gaps, both found by trying to verify the work rather than by reasoning:

1. **Every tool here measured ONE FRAME at a PINNED CLOCK.** Fine while nothing
   had a moving part. A rig fails at its EXTREMES, and the middle of a cycle is
   exactly where nothing goes wrong: `shoot.js` photographs the hen at t=12.5 and
   reports a clean frame while the peck that would tear her head off happens at
   t=11.8. **`blender/tools/pose.js`** walks the clock and hands you the frames;
   `crop.py strip` lays them out in clock order. It asserts nothing — looking at
   the strip is the test, same contract as `crop.py`.
2. **Every GESTURE in the cast was unphotographable by anything in this repo.**
   Dill's brim and notepad, Gravy's lid, Crumb's unfolding arm are all gated on
   `H.dialog.npc` — and `stand()` sets `H.dialog = null` on every call. So the
   most characterful half of the round could not be captured in any mode.
   `pose.js --talk <id>` drives the NPC hotspot's own `act()` to open the real
   dialogue. A pose you cannot get the harness into is a pose that will regress
   unnoticed.

Also added: **`no-cast`**, the seam for tier 2 of the fallback (parts missing,
one-piece characters present — they go RIGID, never headless), and
**`17-regular` is in `fallbacks.js`'s CHECK list** now, because the `no-cast`
seam degrades the five regulars and not one of the three spots it used to sample
has a regular in it. It would have diffed at ~0% and been reported as a seam that
never fired. §15 verbatim, one more time: a spot table only measures what it
points at.

And **`21-hen`**, from her own hotspot `stand`. The first attempt at that spot
framed the Undercroft doors and a brick wall with a red comb clipping the bottom
edge: she is 0.78m tall, `EYE` is 1.62, and a standing eyeline 1.2m from her
looks straight over her head. Pitch is `atan((0.45 - 1.62) / 2.5)`, not a guess.

### Ledger rows (§9)

| Question | Answer | Why |
|---|---|---|
| Split a character for articulation — just export the parts? | **No: export the WHOLE model too** | A part set that half-arrives is a headless nugget, and §1.5 says nothing degrades to worse than what it replaced. `makeNpc` uses parts only when EVERY part resolves, and the check runs before anything uploads so a late failure cannot leak buffers. |
| Does a part inherit the character's AO? | **No — pass siblings as `occluders`** | `_bake_ao` raycasts an object against ITSELF. Baked separately, the head stops shading the shoulders and both parts come back lighter than the one-piece model. Baked AO is the biggest lever in this pipeline; a split must not cost any of it. |
| Does a part inherit the character's texture scale? | **No — pass the whole model's box as `uv_box`** | `finish()` box-projects against the part's own bbox, so a head projected alone gets finer grain than the body it sits on and the neck becomes a visible seam. |
| Where does a pivot live? | **In the exported geometry (`extract(pivot=)` -> `"v"` -> `HallMesh.pivot`)** | §16: do not trust the comment next to the constant. A pivot typed in both hallmesh.py and arcade.js is a pivot that will disagree with itself. |
| Give the neckless characters a head turn anyway? | **No** | Splitting a head off a single blob tears it open, and nothing in this renderer is transparent so you would see the inside. Crumb articulates at the shoulders, Dill tips the HAT. Match the rig to the anatomy. |
| Body and head both slew toward the player? | **Head first, body takes only the excess** | Both slewing together is what made them read as chess pieces. It also means `npc.yaw` on an articulated character correctly goes DEAD — see below. |
| A motion channel went dead — regression? | **Check whether it measured the OLD behaviour first** | `npc.yaw` pointed at the Hooded Nug, whose body now only turns when the cowl runs out of neck; an idle ±0.26rad glance is inside his 0.95 `headMax`, so the robe correctly never moves. Re-pointed at Crumb, who has no neck and still turns bodily. |
| Is a slow prop animation safer? | **No — it is invisible** | The claw first ran a 15-second sweep. `motion.js` caught that a 9s window could not contain one period, which is also the reason nobody would ever notice it: 7.4s now. |
| Squash-and-stretch skews the shading normals? | **Yes, and at these amplitudes it does not matter** | `vNormal = mat3(uModel) * aNormal`, renormalised in the fragment shader. Breath is 0.7–2.6%, so the skew is second-order. Do not raise it far without an inverse-transpose. |

### Still open, in value order

1. **The prize boxes in the crane cabinets are blown to featureless cream
   slabs** — `clawLit`/`clawLitS` on three sides of a small box, and from
   `20-cranes` you cannot see the prizes in the far machine at all. §5c's rule
   about emissives, on a surface that post-dates it.
2. **The hall's walls are the flattest thing left in the game**: one lavender
   tone, a thin panel grid, no wear, no posters, nothing. Worst at `07-jukebox`,
   which is a wall with a small object at the bottom of it.
3. **The carpet is still the highest `hard` in the game** (2.17 at `02-aisle`) —
   §16's open item 3, untouched.
4. **`06-scoreboard` photographs its OFFLINE state in every run, forever.** The
   worker only allows the production origin, the kit serves from localhost, so a
   big lit surface in the hall has never once been measured showing real scores.
   Mean 6.0 at that spot is measuring an error message.
5. Nothing dynamic casts a shadow — the articulated parts included. The shadow
   maps bake off the STATIC buffers, and the trolley/grab left that buffer.
6. `hallMeshData.js` is **956KB gzipped**, not the ~334KB three docs still claim.
   Corrected in AGENTS.md and CLAUDE.md this round.

## 18. 🧱 THE VERTICAL PLANE (2026-08-12) — the walls and the doors

Round 2's assessment came straight out of round 1's table, and it was the `hard`
column — the kit's only ARRANGEMENT metric — that made the call. It splits this
game clean in two:

| the flat half | hard | the detailed half | hard |
|---|---|---|---|
| `12-club` | **0.001** | `02-aisle` (carpet) | 2.167 |
| `13-drain` | 0.261 | `19-hockey` | 2.018 |
| `14-croft` | 0.293 | `20-cranes` | 1.786 |
| `18-vending` | 0.312 | `04-eastwall` | 1.144 |
| `07-jukebox` | 0.357 | `03-westwall` | 1.129 |

Every frame in the left column has a WALL or a DOOR as its subject. Five sessions
of art went onto the floor, the ceiling, the props, the terrace across the road
and the characters; the hall's own walls and the street's game doors were never
touched once.

And `12-club` measured **0.001** — adjacent pixels essentially never differ. It
was two quads: a 1.4 x 2.2m painted rectangle and a sign above it, standing in
for one of five street entrances a player walks up to and opens. §0: if it is
still a painted quad, model it.

### What shipped

**DIP HOP has a front door.** A real basement entrance: a steel surround, a
reveal with jambs and a head, the leaf set 0.30 back inside it with a proud
porthole and a push bar, a canopy carrying the neon, a stoop, a handrail, a
flyer board and a bracket lamp. It PROJECTS rather than recessing — the door
sits in the 6m gap `buildStreet` leaves in the terrace and there is a painted
wall immediately behind it, so the depth is built forward.

**The hall's walls have relief.** `wallPier` (a 1m pilaster stretched by its call
site, the `trimBase` pattern) down both cabinet rows, the back wall and the
entrance wall, with `wallCap` at both ends; `wallVent` grilles with real louvre
blades; `exitSign` over the doors — the only emissive in this room between the
cabinets and the ceiling; `conduit` runs at picture-rail height; two
`extinguisher`s, the only red and the only round things on those walls.

**The four wall posters are backlit shadowboxes.** `posterFrame` wears `$POSTER`
as a sentinel — the §7 cabinet trick applied to wall art, so one model carries
all four regions — and each throws a light of its own.

### The number

| | dead | near | blown | mean | sd | chroma | hard |
|---|---|---|---|---|---|---|---|
| after THE CAST (21 spots) | 0.453 | 9.738 | 0.007 | 63.720 | 41.654 | 49.581 | 0.754 |
| THE VERTICAL PLANE | 0.453 | 10.053 | 0.008 | 62.903 | 42.870 | 48.886 | **0.833** |

`hard` **+10.4%** overall, and it lands exactly where the work went:
`04-eastwall` +0.258, `07-jukebox` +0.216, `05-deluxe` +0.205, `03-westwall`
+0.189. Structured contrast (`sd`) is up 2.9% overall and **`12-club` went 23.57
-> 39.98, +70%**. Its own `hard` went 0.001 -> 0.075.

**Mean is DOWN 1.3% and that is the change working, not failing.** Relief casts
shadow: pilasters, a canopy and 78mm poster frames all take light out of a wall
that used to be an evenly lit plane. `sd` rising while `mean` falls is the
definition of structured contrast, which §1.3 has been saying beats detail since
the first Blender night. dead is flat, blown moved 0.007 -> 0.008, and both are
inside §11's standing targets. 60fps.

### Four things this cost time on, in the order they bit

1. **EVERY WALL-MODULE YAW I FIRST WROTE WAS INVERTED.** `hall = (bx, bz, -by)`,
   so a module built with its bulk at blender +Y lands at hall -Z under yaw 0 —
   and the yaw has to steer that bulk INTO the room or the relief is built
   inside the wall, where it is invisible. West wall -PI/2, east +PI/2, back
   wall PI, entrance wall 0. This is §10's ledger row ("0, not PI... copying the
   wrong one buried every awning inside the building") in a new costume, and it
   was caught by deriving it from the transform rather than by rendering it.
2. **The vent was a SOLID SLAB.** Frame box spanning y 0..0.055 with the six
   louvre blades at 0.011..0.039 — entirely inside it. That is §14's trap
   verbatim, walked into directly underneath a comment quoting §14's trap. A
   frame is FOUR RIM BOXES WITH A HOLE, the same rule as the shop window, the
   crane's prize box and this round's own door reveal. `preview()` caught it in
   two seconds, which is §8's loop paying for itself.
3. **Recessing the posters put them in the dark.** 78mm of shadowbox is 78mm of
   shadow plus AO, and `03-westwall`'s mean dropped 12 points in one build.
   `extract()` exempts anything with `em > 0.02` from the AO bake, so a small
   emissive both lights the art and takes it out of its own frame's shadow — and
   a backlit poster box is what these are in a real arcade anyway. §16: modelled
   beautifully and left unlit is still murk.
4. **THE UV TOOK THREE BUILDS**, and the reason is the useful part. At contact
   sheet size, "mirrored", "upside down" and "rotated 180" all look identical —
   like text that is wrong. Two of those want a u flip, one wants v, one wants
   both, and reasoning it out from view handedness got it wrong twice running.
   What settled it in one step: zoom to 2x on the BASELINE crop. The quad this
   replaced reads "PLAY / DIP / REPEAT / THE NUGGET ARCADE" top to bottom, so
   the vertical ORDER of the words tells you about v and the letter shapes tell
   you about u — two independent readings instead of one ambiguous one.

Also: the club's neon shipped once as a **0.56m-tall fascia**, which squashed a
2.2 x 1.1m sign into a 4.4:1 strip that read from the street as a pink glow bar
with no lettering in it. The round had deleted the identity of the thing it was
improving. The fascia carries the SIGN's aspect now, not the canopy's.

### Ledger rows (§9)

| Question | Answer | Why |
|---|---|---|
| Which yaw for a relief module on a wall? | **Steer the BULK into the room** | Not "front faces -Y" — that is about a model's frontage. A pilaster's visible surface is its far end. West -PI/2, east +PI/2, back PI, entrance 0. |
| Is v the same way up as geometry z? | **No — v = 0 is the region's TOP** | These sheets are painted into a canvas, where y runs downward, and `extract()` maps v straight into the region rect. Any `set_uv` that has to be READ must invert v. |
| How do you tell which UV axis is wrong? | **Zoom 2x on a known-good baseline crop** | Word ORDER reads v; letter SHAPE reads u. At contact-sheet size all three failure modes look the same and you will flip the wrong axis. |
| Recess something and it goes dark? | **Give it a small emissive** | `extract()` exempts `em > 0.02` from the AO bake, so it lights the art AND lifts it out of the frame's own shadow. |
| Does relief make a wall darker? | **Yes, and that is the point** | Mean fell 1.3% while `sd` rose 2.9%. §1.3: structured contrast beats detail. Judge a relief change on `sd` and `hard`, never on `mean`. |
| Resize a panel that carries baked text? | **Keep the ART's aspect, not the panel's** | The club fascia at 4.4:1 turned a readable sign into a glow bar. |

### Still open, in value order

1. **The crane prize boxes are still blown to featureless cream slabs** — carried
   over from §17 untouched. `clawLit`/`clawLitS` on three sides of a small box.
2. **`15-pier` (34.15 near-dead) and `21-hen` (37.81) are the two worst tiles**
   and both are dark corners. §16 already flagged the pier's metric as lying;
   Henrietta's corner is genuinely underlit — she is the only regular standing
   somewhere with no fixture near her.
3. **The carpet is STILL the highest `hard` in the game** (2.322 now) — §16's
   open item 3, and this round raised it further by putting more contrast in the
   frames it appears in. Uniform full-brightness confetti, no wear paths.
4. `06-scoreboard` still photographs its OFFLINE state in every run.
5. Nothing dynamic casts a shadow.

## 19. 🧽 THE WEAR (2026-08-12) — the hall had never been dirty, and one lamp was missing

Round 3, off round 2's table. The street got THE GRIME two sessions ago (§14);
the hall never did. Every surface in this room was factory-new and evenly lit,
and the three numbers that stood out said so from three different directions:

- `02-aisle` **hard 2.322**, the highest in the game — the carpet, which is the
  biggest surface in the building, identical from one metre away to fifteen.
- `21-hen` **37.8 near-dead** and `14-croft` **sd 15.9** (the lowest in the game),
  the two worst-lit tiles in the table — and they are the same corner.
- `20-cranes`: the prize boxes still blown to featureless cream, carried over
  from §17's open list.

### THE CARPET: a wear field in the vertex tint

Wear is POSITIONAL — it runs where the feet run — and a tiling texture cannot
hold anything positional. §14 learned that on the brick, where a vertical story
baked into a tile repeating 2.2× up a wall came out as stripes. So this is not a
new texture. `vExtra.y` (the per-vertex tint) multiplies the whole shaded colour,
**emissive included**, and `quadV` takes an `opts.tints` of four now, so the
carpet is subdivided at ~35cm and carries a wear field: a lane down the spine
from the door to the deluxe cabinet, branches out to each machine, a standing
patch where you play it, dark under the cabinets, and untrodden pile at the
skirting. All of it derived from `PLACEMENT`, so a machine that moves takes its
traffic with it.

**THE FIELD MUST BE MEAN-PRESERVING, and the first build was not.** It hung
everything off 1.0 and only ever subtracted, which took the whole floor down ~20%
and cost EIGHT POINTS OF MEAN on every hall view. The carpet is the main light
source for the bottom half of this room — dimming it dims everything standing on
it, and §11's headline is that too much of this frame is already nothing. Base
sits at 1.07 now, the untrodden edges go UP, and the field averages **1.023**
(measured over the floor before rebuilding, not guessed).

### 💡 THE LAMP THAT WASN'T THERE

The kerb ran out of streetlamps at x=15 and the street runs to 21.1, so the whole
east end — Henrietta, the Undercroft's cellar doors, two of the three worst tiles
in the table — was lit by nothing at all. Adding one lamp:

| | near-dead | dead | mean | sd |
|---|---|---|---|---|
| `14-croft` | 7.27 → **0.72** | 0.00 → 0.00 | 35.71 → **47.33** | 15.9 → 20.0 |
| `21-hen` | 37.81 → **31.40** | 2.06 → **0.81** | 35.85 → **41.74** | 29.2 → 33.0 |

**And the first attempt at it changed nothing at all, which is the finding.** The
lamp POSTS are built in `buildStreet`; the lamp LIGHTS were a separate hardcoded
block eight hundred lines away in `LIGHTS[]`. Adding a fifth lamp built a post
with a glow sprite on it and NO LIGHT, and both tiles came back pixel-identical
— a change that measures as nothing because it *is* nothing. Two lists that had
to agree, maintained independently. There is one list now (`LAMP_X`) and
`LIGHTS[]` spreads it. Same family as §17's pivot rule: **a value typed in two
places is a value that will disagree with itself.**

### The number

| | dead | near | blown | mean | sd | chroma | hard | fps |
|---|---|---|---|---|---|---|---|---|
| THE VERTICAL PLANE | 0.453 | 10.053 | 0.008 | 62.903 | 42.870 | 48.886 | 0.833 | 59.9 |
| THE WEAR | **0.408** | **9.603** | **0.007** | 62.247 | 42.875 | 49.137 | 0.856 | 60.1 |

Near-dead −0.449 is the largest single-round improvement of the session, and dead
and blown both fell with it — the combination §11 asks for and §5c warns is easy
to fake. Mean is down 0.66, most of which is the crane cabinets: `clawLit` went
0.46 → 0.30 and `clawLitS` 0.22 → 0.14, and you can see the prizes inside the far
machine now instead of a cream slab.

### Ledger rows (§9)

| Question | Answer | Why |
|---|---|---|
| Where does surface WEAR live — texture or geometry? | **The vertex tint** | Wear is positional and a tiling texture repeats. `opts.tints` on `quadV` costs no texture, no shader change and no atlas region, and the tint multiplies the emissive too, so worn carpet loses its glow as well as its colour. |
| Is a wear field allowed to be subtractive? | **No — make it mean-preserving** | Only subtracting cost 8 points of mean on every hall view. Lanes down, untrodden edges UP. Measure the field's average before you rebuild; ours is 1.023. |
| A change measured as EXACTLY nothing? | **Suspect two lists, not a weak effect** | The new lamp had geometry and no light because posts and lights were separate tables. Pixel-identical is not "too subtle", it is "did not happen". |
| How fine to subdivide for a vertex-tint field? | **~35cm** | Coarser facets through the 1m standing patches; finer is wasted (the field is smooth by design) and the floor is on `bufs.floor`, which is still under the Uint16 ceiling. |

### Still open, in value order

1. **`15-pier` is now the worst tile by a distance** (32.5 near-dead, 4.87 dead —
   the only spot above 1% dead black in the game). §16 flagged its metric as
   lying because dark water is correct, and this round did not touch it. Either
   give it something to look at or stop reading its near-dead number.
2. **`02-aisle` hard is still 2.42 and still the highest in the game.** The wear
   field varies the carpet's BRIGHTNESS but not its DENSITY — the confetti is
   still individually resolvable at fifteen metres, which is the texture-shimmer
   signature the tools README warns about. A mip/density falloff is the real fix.
3. **Nothing in the model pass is transparent** — five sessions of workarounds
   (shop window, jukebox cards, crane prize box, bus shelter, this round's club
   porthole). The renderer has no alpha pass at all.
4. Nothing dynamic casts a shadow.
5. `06-scoreboard` still photographs its OFFLINE state in every run.

## 20. 🪟 THE PANE (2026-08-12) — the renderer learns about glass

Round 4. Rounds 1–3 took animation, vertical geometry and surface wear, and the
thing left standing out of the ledger was not a layer that had been upgraded
badly — it was a capability that had never existed.

**"NOTHING IN THIS RENDERER IS TRANSPARENT"** appears in this handoff five
times: the shop window (§16), the jukebox title cards (§15), the crane machine's
prize box (§16, "three times in one session"), the bus shelter's glazing (§10),
and this session's own club-door porthole. Every single one was answered with the
same WORKAROUND — *if you want to see into something, do not build the thing you
would be seeing through* — and every time it was the right call, because the
renderer genuinely could not do it. There was not one pane of glass in this game.

### It is ADDITIVE, and that is the whole design

Real alpha transparency needs back-to-front sorting, and this renderer has
nowhere to put one: geometry is baked into a handful of static buffers and the
draw order is fixed at build time. Sorting would have meant restructuring the
draw loop.

But glass at night is not really a filter — it is a REFLECTION laid over whatever
is behind it. And addition does not care what order it happens in. So the
interior is drawn opaque exactly as it always was, the pane goes over the top
adding only what it reflects, and **there is no sort to get wrong and no
depth-order bug to chase**. `drawGlass()` is nine lines: `uGlass = 1`, blend
`ONE, ONE`, `depthMask(false)` (so a pane occludes nothing) with the depth TEST
still on (so a wall in front of it still hides it), draw, restore.

The shading is a branch in `FS_LIT2` rather than a new program, because
everything a pane needs was already computed in there for the wet road: the
reflection vector, the Fresnel term, `skyBase`, the city panorama and the
specular. Indoors there is no sky to reflect, so the pane returns the ambient
hemisphere instead — which already carries the room's own colour.

**Fresnel is the entire look.** Face-on, a pane is nearly invisible and you read
the lit interior straight through it; at a grazing angle it goes to a sheet of
reflected sky. That ramp is what makes an eye accept glass instead of a bright
decal — the same reason the wet road works.

### The domed CRT, which is the part worth copying

The first build glazed each cabinet screen with a FLAT quad and it read as *the
screen got brighter*, not as *there is glass on it*. The reason is exact: a flat
pane has the same `NdotV` at every pixel, so its Fresnel term is a CONSTANT and
the whole pane lifts uniformly. A real CRT bulges. `glassDome()` lays the pane
out as a 5×5 grid with the centre standing 28mm proud, so the middle faces you
and stays clear while the edges rake away and go to reflection — a real gradient,
from geometry, with no shader work. 5 segments and not 3 because `quadV` gives
each quad ONE face normal, so the ramp arrives in `seg` discrete bands; at 3 they
read as stripes across the tube.

Glazed this round: **the ten cabinet CRTs** (the most-looked-at surface in the
building, and a screen with no reflection is the flattest object it is possible
to put in a room), **both crane machines' fronts** — the exact case §16's ledger
had ruled out — and **the two lit shopfront windows**, window band only, not the
fascia and not the garage's roller door.

### The number, stated plainly

| | dead | near | blown | mean | sd | chroma | hard | fps |
|---|---|---|---|---|---|---|---|---|
| THE WEAR | 0.408 | 9.603 | 0.007 | 62.247 | 42.875 | 49.137 | 0.856 | 60.1 |
| THE PANE | 0.405 | 9.562 | 0.007 | 62.405 | 42.943 | 49.088 | 0.860 | 60.2 |

**Flat — every column inside run-to-run noise.** Not hidden and not spun: the
panes cover a few percent of any frame, so an average over a whole frame cannot
see them, and no amount of staring at that table would tell you whether this
round did anything at all.

What justifies it is the 2× crop of `03-westwall`, where the CRT visibly gains a
reflection with the game still readable through it. This is the third distinct
way this session has hit the same wall — §17 could not be measured because the
clock is pinned, §18 had to be judged on `sd` and `hard` because `mean` moves the
wrong way for relief, and now §20 cannot be measured because the affected area is
too small a fraction of a frame. **The kit measures FRAMES. It has never had a
way to measure a SURFACE.**

Honest caveat, recorded so nobody oversells this later: the aggregate says
nothing, and a reasonable person could look at the table and bin this round. It
is kept because the crop is unambiguous, because it costs no measurable
performance, and because it is the capability five previous workarounds were
written around — the next person who wants a real window can now build one.

### Ledger rows (§9)

| Question | Answer | Why |
|---|---|---|
| Transparency — sort the draws? | **No: additive** | Addition is order-independent, so a pane needs no sorting at all. Glass at night is a reflection over what is behind it, not a filter, so additive is also the physically closer model. |
| A new shader program for glass? | **No, a branch in FS_LIT2** | Everything a pane needs — R, Fresnel, `skyBase`, the city, the specular — was already computed there for the wet road. |
| Why does a flat pane not read as glass? | **Constant `NdotV` = constant Fresnel** | It lifts uniformly and reads as brightness. DOME it: `glassDome()`, 5×5, centre proud, and the ramp appears. |
| Segments for a domed pane? | **5, not 3** | `quadV` gives one normal per quad, so the Fresnel ramp comes in `seg` bands. Three of them read as stripes. |
| Can a pane occlude? | **Never — `depthMask(false)`, depth test ON** | Write depth and the pane hides everything drawn after it; drop the test and a wall stops hiding the pane. |

### Still open, in value order

1. **THE KIT CANNOT MEASURE A SURFACE.** Three rounds in a row have now produced
   changes that a whole-frame histogram cannot see. A per-REGION statistic — mask
   a crop to the object under test and report its own dead/near/sd/hard — would
   have measured all three, and it is the obvious next tool after `pose.js`.
2. `15-pier` is still the worst tile (32.5 near-dead, 4.87 dead, the only spot
   above 1% dead black) and has not been touched all session.
3. `02-aisle` hard is 2.44: the carpet's confetti still does not thin with
   distance. Brightness varies now; density does not.
4. Nothing dynamic casts a shadow.
5. The glass reflects the ambient hemisphere indoors, which is a flat colour —
   a real cubemap or SSR would put the ROOM in the cabinet glass.

## 21. ⚓ THE MOORING (2026-08-12) — build the instrument, then use it

Round 5, and it closes the loop on the session's own biggest finding.

Round 4's honest conclusion was that **three rounds running had produced changes
this kit could not see**: §17 because `shoot.js` pins the clock, §18 because
`mean` moves the WRONG WAY for relief, §20 because a pane is a few percent of a
frame. Every one of those was visible in a crop and invisible in the table. So
this round built the missing instrument first, then used it on the worst thing in
the game — which is also the fairest possible test of whether it works.

### 🔬 `blender/tools/region.js` — measure a SURFACE, not a frame

Point it at a box and it reports that box's own dead / near / blown / mean / sd /
chroma / hard, for two tagged runs, with the delta. It reads PNGs `shoot.js` has
already written, so there is no browser and no re-render, and it works
retroactively on every run still in `_shots`.

**Validated against the two rounds it was built to explain**, and the numbers are
the argument:

| | whole frame | the surface itself |
|---|---|---|
| §20 THE PANE, at the Flappy CRT | mean **+0.25%** | mean **+7.5%**, hard **+8.7%**, near −33% |
| §17 THE CAST, at Big Crumb | mean **+0.02%** | near-dead **−25.1%**, mean +2.4% |

Neither round was invisible. Both were invisible to a number averaged over
1280×760 pixels when the thing that changed occupied 1% of them.

### ⚓ And a boat, because `15-pier` had been the worst tile all session

32.5 near-dead and 4.87 dead — the only spot in the game above 1% dead black, and
untouched through four rounds. §16 had already ruled correctly on the number: it
is a night harbour and dark water IS dark. What the frame actually lacked was
anything ON the water — no scale, no foreground, and nothing between the rail and
a skyline forty metres out.

`trawler` is a small fishing boat lying off the pier head: lofted hull with a
sheer line and a boot-top stripe, wheelhouse, mast, derrick, fenders, a lit
window and a masthead light. She ROCKS — roll dominant, pitch a third of it and
out of phase, a small heave, three periods that do not divide into each other —
which is the only motion anywhere east of the pier gate. Two new `motion.js`
channels watch her.

**And the first placement was a trap that the metric walked straight into.** She
went in 5m off the gate, filling the bottom half of the frame with a blown-out
wheelhouse, and the table LOVED it: near-dead 32.5 → 29.9, mean +6.4, sd +31%.
The crop said she was a wall. Moved out to 15m and off to the north — which is
obviously right in the picture — the whole-frame numbers fall back to nothing
(near 32.5 → 32.3, mean +0.15).

**This is §16's lesson running the OTHER way, and it is the more dangerous
direction.** Everyone knows a metric can undersell a good change; this session
had already hit that three times. A metric can also OVERSELL a bad one, and a
number that agrees with you is much harder to argue with. A big bright object
near the camera improves every darkness statistic there is, whether or not it
belongs in the shot.

The region tool then measured what actually changed — the water she is in:

| `15-pier`, box 700 410 330 90 | before | after | |
|---|---|---|---|
| near-dead | 18.62 | 14.71 | **−21.0%** |
| mean | 25.21 | 29.15 | **+15.6%** |
| sd | 8.49 | 15.40 | **+81.4%** |
| chroma | 23.28 | 40.32 | **+73.2%** |
| hard | 1.083 | 0.668 | **−38.3%** |

`hard` falling 38% is worth reading twice: a solid hull REPLACED a patch of
high-frequency reflected-city noise, which is a shimmer source going away.

### 🚶 A false positive in the head-bob guard, found and fixed

`motion.js`'s `no-bob` anti-channel — the one thing standing between this project
and the gait THE GLIDE deleted — started reporting **HEAD-BOB IS BACK** at
0.0040–0.0044 against a threshold of 0.004.

It was not a regression, and the diagnosis is the useful part. `no-bob` runs
LAST, and every channel above it holds 'f' down for its window without ever
resetting the camera. By the time it fires, twenty walks have driven the camera
into the back wall: it sits at **z −17.85 with `speed` pinned at 0.62** by the
collision solver, and at that speed the hall treats it as nearly-standing so the
IDLE BREATH never fully fades. What the channel measured was that breath
decaying — a smooth monotonic ramp from 1.62376 to 1.62025, not an oscillation.
A fresh camera on open floor measures a range of **exactly 0.00000**.

Adding this round's two boat channels pushed ~19 more seconds of wall-shoving in
front of the check and tipped a marginal reading over the line.

**The obvious fix would have been to raise the threshold, and that would have
been the worst possible outcome** — blinding the only guard protecting a
behaviour Beau asked for by name. The check resets the camera to open floor
first. The row claims "flat while WALKING"; a camera wedged in a corner at
0.62 m/s is not walking.

### The session, end to end

| | dead | near | blown | mean | sd | chroma | hard |
|---|---|---|---|---|---|---|---|
| baseline (20 shared spots) | 0.381 | 8.331 | 0.007 | 65.104 | 42.305 | 49.357 | 0.772 |
| after five rounds | 0.383 | 8.431 | 0.007 | 65.104→**63.561** | **43.417** | 48.760 | **0.880** |

`hard` **+14.0%** and `sd` **+2.6%** — more structure and more arrangement — with
`mean` down 2.4% because three of the five rounds added shadow, relief and wear
to surfaces that used to be evenly lit. dead and blown are flat. 60.5fps
throughout, never below 59.8 on any path of the fallback matrix.

And two spots that were never in the baseline: `21-hen` (37.8 near-dead when it
was first pointed at, 31.3 now) and the fact that four of the five rounds moved
numbers this kit had to be EXTENDED to see.

### Ledger rows (§9)

| Question | Answer | Why |
|---|---|---|
| A change the frame table cannot see? | **Measure the SURFACE** — `region.js` | The pane read +0.25% on the frame and +7.5% on the CRT. Three rounds this session were invisible only because the average was taken over the wrong pixels. |
| The metric LIKES a change a lot? | **Suspect it as hard as when it dislikes one** | A boat parked 5m off the lens scored near −2.6, mean +6.4, sd +31% and was plainly wrong in the crop. Overselling is the harder direction to catch, because the number is agreeing with you. |
| `no-bob` fires? | **Check where the camera IS before believing it** | It runs last, after twenty un-reset walks, jammed in the back wall at 0.62 m/s where the idle breath never fades. Fresh camera: 0.00000. NEVER raise that threshold. |
| Ring-station loft or stacked rows for a hull? | **Rows** | A closed U at each frame gives a rounder bilge and an ambiguous inside/outside at the keel (§7 trap 2). This hull is seen from one side at twelve metres. |

### Still open, in value order

1. **`02-aisle` hard is 2.44 and still the highest in the game.** THE WEAR varied
   the carpet's BRIGHTNESS; its confetti DENSITY still does not thin with
   distance, so it stays individually resolvable at fifteen metres. That is the
   texture-shimmer signature the tools README names as the look of a free game.
2. **Nothing dynamic casts a shadow** — the shadow maps bake off the STATIC
   buffers, and this session moved the regulars' parts, the claw trolleys and
   the boat out of them.
3. **`06-scoreboard` photographs its OFFLINE state in every run, forever** — the
   worker only allows the production origin. A big lit surface in the hall has
   never once been measured showing real data.
4. Glass reflects the ambient hemisphere indoors, which is a flat colour. A
   cubemap or SSR would put the actual ROOM in the cabinet glass.
5. `15-pier` still reads 32.3 near-dead and 4.87 dead. It is a night harbour with
   a boat in it now; **stop reading its near-dead number.**

## 22. 🎚 THE HOUSE CALL (2026-08-24) — the hall learns to fit the machine it's on

A friend of Beau's clicked into the arcade and the tab froze — no walk-in
scene, no bar, nothing — and when he gave up and hit skip, the room ran as a
slideshow. Five art sessions of upgrades had been validated on exactly two
machines (this dev box and Beau's), and every quality knob in the renderer was
a harness seam, which is to say: a constant, everywhere, for everyone.

**What shipped** (all in js/arcade.js; verified headless at every tier):

- **The build is STAGED.** `build()` used to be one synchronous slab inside a
  click handler — 3.7s of atlas paint, geometry decode and shadow bake on THIS
  machine, and this machine is fast. It is `async` now, yields between stages,
  and registers a `HallBoot` job (`hallbuild`) so the boot bar covers the build
  as well as the downloads. The boot screen stays up for BOTH acts.
- **A TIER is decided before anything expensive is built** (`perfTier`):
  `low` / `med` / `high` off the unmasked renderer string (SwiftShader/software
  → low), deviceMemory, hardwareConcurrency, and old-integrated-GPU patterns.
  The tier picks atlas density (low = 1×, the pre-RELIGHT texel density),
  whether the shadow maps bake at all, the DPR ceiling (1.75 / 1.5 / 1.0) and
  the starting rung. WebGL1 is always tier low.
- **THE GOVERNOR walks a LADDER now, not just MSAA**: 4× → 2× → off →
  renderScale 0.8 → +no mirror pass → 0.62 + 8 lights → +8-bit post. The
  mirror pass is the whole world drawn twice, and rung 4 down trades it for a
  matte floor (a dry night, not a hole). `H.renderScale` works because the
  canvas is CSS-stretched: the backing store IS the render resolution.
- **The landing is persisted** (`nugHallTierAuto`), so a machine that had to
  fight down the ladder boots straight into a hall it can afford next visit.
  `NuggetArcade.quality('low'|'med'|'high'|'auto')` is the player override
  (`nugHallQuality`), and 'auto' clears both.
- **`uNumLights`** in FS_LIT2: the 16-light loop is per-fragment ALU and the
  rung can halve it. WebGL1's 8-light shader is untouched.
- **Attract screens** stop repainting from the street (ten CRTs, none visible
  out there — 180 texture uploads/sec pointed at a wall) and drop to one
  repaint per frame on low rungs; the scoreboard redraws 2×/sec outside.
- **🧹 THE CLEARING**: THE FLOOR PLAN's furniture is REMOVED — air hockey
  table, both crane machines (their split trolley/grab buffers, glass panes,
  five lights and glows), all five stools. Beau's call, from the friend's
  report. ~11k verts, four draws ×2 passes, and the busiest sightline in the
  room. The models stay in blender/hallmesh.py + hallMeshData if a lighter
  hall ever wants one back. Kit updates: `19-hockey`/`20-cranes` spots →
  `19-openfloor`; motion.js dropped its claw channels; `drawClaw` is gone.

**🚨 THE LATENT BUG THE LOW TIER EXPOSED (worth re-reading).** Skipping the
shadow bake left `uShadowH`/`uShadowS` (both `sampler2DShadow`) at their
default sampler unit — 0, where the albedo `sampler2D` sits — and a strict
driver (ANGLE/D3D11 here) refuses EVERY lit draw with "two textures of
different types use the same sampler location". The room rendered as a sky and
some glow sprites: no walls, no floor, no cabinets. This was latent for every
machine whose `bakeShadows` failed, since the day shadows shipped — the
`H.shadows = false` seam never caught it because that seam leaves the maps
BOUND. The fix is a 1×1 depth texture (`H.texFlatD`, COMPARE_REF_TO_TEXTURE)
that units 3/4 always bind when the real maps are absent. The rule for next
time: **a sampler uniform you sometimes don't set is a draw you sometimes
don't get** — every sampler in a program needs a legal binding on every path.

**Measured** (SwiftShader-class software path, 1280×760, governor unpinned):
boot main-thread stalls 3754ms → max ~600ms chunks with a moving bar; hall fps
31 → 42 at rung 4 before the governor has even finished walking. High tier is
frame-identical to shipped minus the furniture.

**Harness rules that changed:**
- `openHall` now pins `localStorage.nugHallQuality = 'high'` BEFORE enter —
  THE HOUSE CALL would otherwise tier this SwiftShader box as `low` and every
  measurement would be shot at 1× atlas with no shadows against tables shot at
  high. Same class of bug as an unpinned clock. `H.msaaAuto = false` still
  pins the rung; the localStorage pin covers what gets BUILT.
- The governor persists its verdict; a probe run that lets it walk will write
  `nugHallTierAuto` into that browser profile. Playwright contexts are fresh
  per launch, so the kit never sees a stale verdict — but a REAL browser will,
  which is the point.

## 23. 🪧 THE SIGHTLINE RULE (2026-08-24) — the walls were eating the signs

Beau's prod screenshots, three in a row: pilasters standing in front of the
leaderboard (player names amputated to "…IS ROBBINS"), a wall vent parked dead
centre of the neon phrase ("HOW MA[vent]UGS?"), and the interior NUGGET ARCADE
band hiding behind the vestibule header with only "NUGGET" peeking over.

One cause, three costumes: **wall furniture only ever checked PLACEMENT** —
cabinets — so every round that bolted something to a wall (piers §18, vents
§18, conduit §18, the vestibule §12) checked for cabinets and walked straight
through the wall ART. And the kit never saw it because every spot shoots from
a hotspot's stand at eye level — nobody had ever pointed a camera UP at a sign
from off-axis, which is how a player actually reads a wall.

What changed (all in buildScene):

- `WALL_ART_Z` + `clearOfWallArt()`: piers on the SIDE walls skip the
  scoreboard/phrase band (z −13.9..−17.7). Add to that list when wall art
  gains a new address; check it before bolting anything to a side wall.
- The west vent moved off the phrase (−16.1 → −9.5).
- The conduit runs END at the sign band now (12.6m centred at −7.4, terminal
  junction box at −13.58) instead of running 17m through both signs' tops.
- The interior marquee moved UP to crown the vestibule header (y 3.26..4.16,
  x ±1.8 — same aspect, sized to the header-to-ceiling band). The vestibule
  header spans y 2.60..3.20 and stands 0.67m proud: anything on the entrance
  wall between those heights is invisible from inside the room.

The general rule, third phrasing of the same lesson (§15 "a spot table only
measures what it points at", §16 "add a spot that looks AT it"): **an object's
placement check must include everything a PLAYER can read, not just everything
the code calls a collision.** Signs, boards and lettering are the first things
an eye goes to and the last things any collision table knows about.

## 24. 🤖 THE PIT (2026-09-04) — the first MINIGAME on the material pipeline

BatteredBots (game 17) is rendered on WebGL with the hall's ideas flattened to
top-down: a normal-mapped floor, point lights, bloom. The seam between the
renderer and Blender is `blender/BOTS_ART_CONTRACT.md` — regions, PPU 4, the
three aligned 1024² pages (albedo / normal / PAINT mask), floor pages at
2048×1152, and the exact arena geometry. `blender/botsrig.py` renders it
headless; `blender/pack_bots.py` writes `js/botsArt.js`;
`blender/tools/botsart_check.js` proves the file matches the contract. The
renderer has a procedural stand-in for every region and boots without the file.

Gotchas that cost the paint shop time (all also in the script docstrings):
- Blender 5.2's engine id is `BLENDER_EEVEE`; data passes (normal/rough) need
  the `Raw` view transform — Standard maps 0.5 → 188.
- Normal pages are WORLD-space normals, which equal camera space because the
  ortho camera sits at rotation (0,0,0). Do NOT use Blender's Vector Transform
  to "Camera" — it points +Z away. Verified: flat = (127,127,255).
- Floor pages: row 0 = world y 0 (y-down). Sample `v = y/360`, no flip.
- `ShaderNodeMix` sockets must be picked by identifier; a spherical gradient in
  object space dies at 1 BU; the Rendered viewport ignores `hide_render`;
  Blender resolves relative render paths against ITS cwd.
- The renderer's sprite shader rotates the sampled normal by the draw rotation
  (image-up = local −y): `n = (nx·cos + ny·sin, nx·sin − ny·cos, nz)`.
- Pacing is a rulebook problem, not a renderer one: the first cut's minigun
  clip (480 dmg) exceeded the field's total HP (460). Measure rounds in node
  (`BotsSim` runs headless) before touching visuals.
