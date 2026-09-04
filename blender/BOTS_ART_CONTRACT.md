# 🤖 BATTEREDBOTS — the art contract (game 17, mode `bots`)

This file is the seam between `js/bots.js` (the WebGL renderer) and the Blender
paint shop (`blender/botsrig.py` → `blender/pack_bots.py` → `js/botsArt.js`).
Both sides build against it independently. **Do not drift from it** — change
the number here first, then both sides.

## Units and scale

- **1 game unit = 1 world px.** The world is **640 × 360 units** (16:9). The
  renderer scales it to the viewport with letterboxing.
- **Sprites are rendered at PPU = 4 px per unit** (so a 26-unit bot is 104 px in
  the atlas). The hall's lesson: 4K panels magnify everything, so ship crisp.
- **Floor pages are 2048 × 1152 px** covering the full 640 × 360 world
  (3.2 px per unit).
- Every sprite is rendered **nose-UP** (+Y in Blender = image top). The renderer
  rotates at draw time by `heading + π/2` (GTN convention). No angle sheets.
- Blender rig: the straight-down ortho camera from `nugrig.rig_setup()`
  (`location (0,0,80)`, `rotation (0,0,0)`), warm key + cool fill. 1 Blender
  unit = 1 game unit; set `ortho_scale` to the cell width in units.
- Supersample 8× then premultiplied-LANCZOS downscale (like `pack_atlas.py`) —
  never resize straight alpha.

## The three pages (same layout, same size: 1024 × 1024)

`js/botsArt.js` ships a shelf-packed sprite atlas as **three** aligned pages:

| page | what | encoding |
|---|---|---|
| `albedo` | lit color, transparent background | PNG data URI |
| `normal` | camera-space normal, RGB = (n.x, n.y, n.z) × 0.5 + 0.5. +X = image right, +Y = image **up**, +Z = toward the camera. Flat = (128,128,255). Alpha copied from albedo. | PNG data URI |
| `mask` | white where the sauce PAINT goes (materials named `PAINT_*`), black elsewhere, alpha from albedo. The renderer tints this region by the bot's team color. | PNG data URI |

`R[name] = [x, y, w, h]` in atlas px, identical on all three pages.

## Sprite regions (name → cell size in units → px at PPU 4)

Chassis (three damage states; `_0` pristine, `_1` battered — breading flaked,
plates dented, `_2` wreck — burnt, wheels gone, still a silhouette):

| region | cell | notes |
|---|---|---|
| `bot_dicer_0/1/2` | 32×32 → 128×128 | lightweight nugget on 4 wheels, 24 long × 14 wide, wedge nose; the spinner disc is NOT part of the chassis |
| `bot_tender_0/1/2` | 32×32 → 128×128 | middleweight, 26×16, pneumatic flipper plate across the nose (drawn closed) |
| `bot_brick_0/1/2` | 32×32 → 128×128 | heavyweight, 28×18, low wedge front, triple-dipped batter texture |

Bot layers (rotate with the bot, drawn over the chassis):

| region | cell | notes |
|---|---|---|
| `disc_still`, `disc_spin`, `disc_blur` | 20×20 → 80×80 | the Dicer's horizontal spinner: still (teeth visible), spinning (teeth streaked), blur (a disc with a bright rim) |
| `flipper_up` | 26×14 → 104×56 | the Tenderizer's flipper plate, raised (drawn for 0.25 s on a flip) |
| `turret_minigun`, `turret_flamer`, `turret_mortar`, `turret_rocket`, `turret_emp` | 16×16 → 64×64 | sauce-bottle turrets mounted on the chassis top, nose up; rotate independently of the chassis |

Arena props and hazards (static orientation unless noted):

| region | cell | notes |
|---|---|---|
| `tire` | 8×8 → 32×32 | one tire top-down (the wall is tiled from it by the renderer) |
| `drum` | 10×10 → 40×40 | oil drum top-down |
| `lamp` | 12×12 → 48×48 | clamp work lamp seen from above (the fixture; its light is a renderer point light) |
| `blade` | 28×10 → 112×40 | slicer blade, teeth along the long edge, nose up = teeth toward +Y |
| `mallet` | 16×16 → 64×64 | pneumatic mallet head from above |
| `mallet_arm` | 8×40 → 32×160 | the arm, nose up |
| `pad` | 18×18 → 72×72 | weapon pad plate (neutral steel; the renderer adds the colored ring) |
| `pit_hole` | 64×64 → 256×256 | the open drain: black hole with wet rim, grate slid aside |
| `grate` | 64×64 → 256×256 | the closed drain grate (also painted into the floor page; this sprite slides aside on open) |
| `booth` | 40×80 → 160×320 | announcer booth from above, glass roof |
| `driver` | 8×10 → 32×40 | a nugget holding an RC transmitter, top-down, facing +Y |
| `crowd` | 128×24 → 512×96 | a strip of nugget crowd silhouettes seen from above, for the stands behind the polycarbonate; tiled |

Pickups (drawn upright, pulse in the renderer):

| region | cell |
|---|---|
| `pickup_minigun`, `pickup_flamer`, `pickup_mortar`, `pickup_rocket`, `pickup_emp`, `pickup_nitro` | 10×10 → 40×40 |

Particles and decals (albedo only matters; normal flat is fine):

| region | cell | notes |
|---|---|---|
| `p_spark` | 4×4 → 16×16 | soft hot dot |
| `p_smoke` | 16×16 → 64×64 | soft grey puff |
| `p_fire_0/1/2` | 12×12 → 48×48 | flame frames |
| `p_crumb_0/1/2/3` | 3×3 → 12×12 | breading flakes |
| `p_plate_0/1/2` | 6×4 → 24×16 | shed armor chunks |
| `p_oil` | 12×12 → 48×48 | dark splat |
| `puddle_ranch` | 36×36 → 144×144 | white ranch puddle, soft edge (decal) |
| `scorch` | 24×24 → 96×96 | burn mark (decal) |
| `skid` | 6×3 → 24×12 | one skid-mark dab (decal, rotated) |

## Floor pages (per arena)

`BotsArt.floors[arena] = { w: 2048, h: 1152, albedo, normal, rough }` — albedo
and rough as JPEG data URIs (q 92), normal as PNG.

### Arena `pit` — THE GARAGE PIT (Night 1)

World 640 × 360. Geometry the sim and the page both obey:

- **Arena outer edge** (tire-wall outer face): x 40..600, y 36..324.
- **Wall thickness 12** → playable interior x 52..588, y 48..312.
- **The margins** outside the wall are the pit apron: polycarbonate rail on the
  wall's outer edge (a bright thin line), stands with the crowd top and bottom
  (y 8..36 and y 324..352), the announcer booth on the left margin (x 0..40),
  the driver rail on the right margin (x 600..640).
- **Drain (THE PIT):** center (320, 180), grate radius 26 painted closed.
- **Start pads (6), r 12:** (90,80) (90,280) (550,80) (550,280) (320,62) (320,298).
  Hex outline in worn yellow paint.
- **Weapon pads (6), r 10:** (180,110) (460,110) (180,250) (460,250) (320,100) (320,260).
  Steel plate + bolt heads; NO color (the renderer rings them).
- **Slicer slots (4):** dark slits in the wall face, half-width 26: top wall at
  x 200 and 440 (blade emerges downward to y 70), bottom wall at x 200 and 440
  (blade emerges upward to y 290).
- **Mallet:** pivot on the left wall at (52, 180); head rests at (84, 180),
  strike zone r 22. Paint a worn circle where it lands.
- **Clamp lamps (4)** hang above (130,75) (510,75) (130,285) (510,285) — paint
  faint light pools under them in the albedo? NO. Lights are real in the
  renderer; paint the floor unlit-neutral (the hall's §5c lesson: don't bake glow).
- Dressing: concrete with expansion joints on a ~64-unit grid, oil stains
  (glossy in `rough`), tire marks, a faded painted CLUCKED METAL wordmark around
  the drain, hazard stripes on the inner wall face, scuffs at the start pads.

Normal page: joints as V-grooves, the grate bars as relief, tire wall as a ring
of rounded bumps, slicer slots recessed, bolt heads on pads.

Rough page: grayscale. Concrete ~0.8, painted marks ~0.6, oil ~0.15, steel
pads ~0.35, polycarbonate rail ~0.1.

## Emissive law

Nothing in these pages is emissive. Lamps, sparks, fire, and neon are renderer
lights and additive particles. The mask page carries the PAINT stencil only.

## Fallback law

`js/bots.js` paints procedural stand-ins for EVERY region above on canvases at
init and uses them until `js/botsArt.js` arrives (it is injected async by
`HallBoot.inject`). If the file never arrives, the game plays on the stand-ins.
The renderer therefore needs nothing from this file to boot — the paint shop
only ever makes it better.
