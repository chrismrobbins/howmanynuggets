# 🎨 The GTN Art Department (blender/)

The 3D source for every sprite in `js/gtaArt.js` — GRAND THEFT NUGGET's
FRESH PAINT remaster. GTA 1's cars were real 3D models rendered top-down
into sprites; these are Nuggetown's, and this folder is where they live so
we can keep updating, upgrading, and eventually walking them into Unreal.

## What's here

| File | Contents |
|------|----------|
| `gta_vehicles.blend` | The fleet, one collection per class: compact, sedan, sports, bus, BATTER tanker, NPD cruiser, BATTER van |
| `gta_peds.blend` | The citizen nug: idle/walk/flee/daze pose collections + the NPD cap |
| `gta_tiles.blend` | Ground tiles: asphalt (+manhole), sidewalk pavers, boardwalk, grass, bay water, roof gravel |
| `gta_props.blend` | Noodle cart, phone booth, nug crate, the golden nug, two tree cultivars |
| `nugrig.py` | THE FACTORY — parametric builders for everything above, plus the render rig. The .blends are *built by* this script; edit either, but the script is the source of truth |
| `pack_atlas.py` | Stage 2: downscale/grade/pack renders and regenerate `js/gtaArt.js` (plain Python; needs `pip install pillow numpy`) |

Conventions: **1 Blender unit = 1 game pixel.** Vehicles and peds face +Y
(sprite "up" — the engine rotates them). Materials named `PAINT_*` become
the runtime tint mask: they render WHITE and the game multiplies in each
car's color, pearl coat, respray, or ped outfit at play time.

## Regenerating the sprites

In Blender (GUI or `blender -b -P`), from the repo root:

```python
import sys; sys.path.append("blender")
import nugrig
nugrig.render_all("blender/renders")     # every PNG, 8x supersampled
nugrig.build_library("blender")          # rebuild the 4 .blend files
```

then, plain Python:

```bash
python blender/pack_atlas.py blender/renders .
```

which rewrites `js/gtaArt.js` (atlas embedded as a data URI — `nugget.png`
stays the repo's one and only binary art asset, and photo mode's
`toDataURL` never taints). The game hot-falls-back to its fillRect rigs if
the atlas is ever missing, so a broken regen can't kill the city.

## The Unreal on-ramp

Every asset is a self-contained collection at the origin of its family
file (offset in a row for browsing). To export the lot:

```python
import nugrig
nugrig.export_gltf("blender/glb")   # one .glb per collection
```

`.glb` drags straight into Unreal (or Godot, or three.js). Mind the scale:
1 unit here = 1 game *pixel*, so set your import scale accordingly —
a compact is 19 units long. `blender/renders/` and `blender/glb/` are
gitignored; the .blends and scripts are the source.
