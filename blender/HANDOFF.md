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
