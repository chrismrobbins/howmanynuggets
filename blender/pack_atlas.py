"""FRESH PAINT pipeline, stage 2: renders -> graded sprites -> js/gtaArt.js.

Run AFTER nugrig.render_all() has filled a renders directory:

    python blender/pack_atlas.py [renders_dir] [repo_root]

Defaults assume you're running from the repo root with renders in
blender/renders. Needs Pillow + numpy (pip install pillow numpy) — tooling
only, nothing here ships; the site stays build-step-free.

What it does: premultiplied-LANCZOS downscale of the 8x renders, grades the
ground tiles so their mean color lands EXACTLY on the procedural night
palette (minimap/fog/headlights all assume those tones), converts mask
renders to white alpha stencils, shelf-packs one atlas, and rewrites
js/gtaArt.js with the atlas embedded as a base64 data URI — so nugget.png
stays the one and only binary art asset in the repo.
"""
import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image

SS = 8

TILE_TARGETS = {
    "tile_road_a": "#232330",
    "tile_road_b": "#26262e",
    "tile_road_manhole": ("like", "tile_road_a"),
    "tile_walk_a": "#33333e",
    "tile_walk_b": "#303039",
    "tile_board_a": "#3a2c1c",
    "tile_board_b": "#342818",
    "tile_grass_a": "#122016",
    "tile_grass_b": "#101c14",
    "tile_water_a": "#0d2438",
    "tile_water_b": "#0b2032",
}
ROOF_TILES = {"tile_roof_a", "tile_roof_b"}  # grayscale, runtime-tinted
ROOF_MEAN = 225.0
ENTITY_DIM = 0.94  # gentle night dim on cars/peds/props


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def load_small(path):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(np.float64)
    alpha = a[..., 3:4] / 255.0
    pre = np.concatenate([a[..., :3] * alpha, a[..., 3:4]], axis=-1)
    pim = Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA")
    tw, th = im.width // SS, im.height // SS
    small = np.asarray(pim.resize((tw, th), Image.LANCZOS)).astype(np.float64)
    al = small[..., 3:4] / 255.0
    un = np.where(al > 1e-4, small[..., :3] / np.maximum(al, 1e-4), 0)
    return np.concatenate([np.clip(un, 0, 255), small[..., 3:4]], axis=-1)


def mean_rgb(arr):
    al = arr[..., 3] > 32
    if not al.any():
        return np.array([1.0, 1.0, 1.0])
    return np.maximum(arr[..., :3][al].mean(axis=0), 1e-3)


def grade_to(arr, target, factors=None):
    if factors is None:
        factors = np.array(hex_rgb(target), dtype=np.float64) / mean_rgb(arr)
    arr = arr.copy()
    arr[..., :3] = np.clip(arr[..., :3] * factors, 0, 255)
    return arr, factors


def to_gray(arr, target_mean):
    lum = arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114
    m = lum[arr[..., 3] > 32].mean()
    lum = np.clip(lum * (target_mean / max(m, 1e-3)), 0, 255)
    out = arr.copy()
    out[..., 0] = out[..., 1] = out[..., 2] = lum
    return out


def mask_to_stencil(arr):
    lum = (arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114) / 255.0
    a = np.clip(lum * (arr[..., 3] / 255.0) * 255.0, 0, 255)
    out = np.zeros_like(arr)
    out[..., 0] = out[..., 1] = out[..., 2] = 255
    out[..., 3] = a
    return out


def main():
    renders = sys.argv[1] if len(sys.argv) > 1 else "blender/renders"
    repo = sys.argv[2] if len(sys.argv) > 2 else "."
    sprites, factors_bank = {}, {}

    names = sorted(f[:-4] for f in os.listdir(renders) if f.endswith(".png"))
    names.sort(key=lambda n: 0 if isinstance(TILE_TARGETS.get(n), str) else 1)

    for name in names:
        arr = load_small(os.path.join(renders, name + ".png"))
        if name in TILE_TARGETS:
            t = TILE_TARGETS[name]
            if isinstance(t, tuple):
                arr, _ = grade_to(arr, None, factors_bank[t[1]])
            else:
                arr, f = grade_to(arr, t)
                factors_bank[name] = f
            arr[..., 3] = 255
        elif name in ROOF_TILES:
            arr = to_gray(arr, ROOF_MEAN)
            arr[..., 3] = 255
        elif name.endswith("_mask"):
            arr = mask_to_stencil(arr)
        else:
            arr[..., :3] = np.clip(arr[..., :3] * ENTITY_DIM, 0, 255)
        sprites[name] = Image.fromarray(arr.astype(np.uint8), "RGBA")

    PAD, AW = 2, 160
    items = sorted(sprites.items(), key=lambda kv: (-kv[1].height, kv[0]))
    regions, x, y, shelf_h = {}, PAD, PAD, 0
    for name, im in items:
        if x + im.width + PAD > AW:
            x, y = PAD, y + shelf_h + PAD
            shelf_h = 0
        regions[name] = [x, y, im.width, im.height]
        x += im.width + PAD
        shelf_h = max(shelf_h, im.height)
    AH = y + shelf_h + PAD

    atlas = Image.new("RGBA", (AW, AH), (0, 0, 0, 0))
    for name, im in sprites.items():
        atlas.paste(im, tuple(regions[name][:2]))

    buf = io.BytesIO()
    atlas.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    js = JS_TEMPLATE.replace("__REGIONS__", json.dumps(regions, sort_keys=True))
    js = js.replace("__B64__", b64)
    out_js = os.path.join(repo, "js", "gtaArt.js")
    with open(out_js, "w", newline="\n") as f:
        f.write(js)
    print(f"atlas {AW}x{AH}, {len(regions)} regions, png {len(buf.getvalue())} bytes")
    print("wrote", out_js)


JS_TEMPLATE = r"""// ---- GTN ART DEPARTMENT ------------------------------------------------------
// "The syndicate got a 3D printer." — FRESH PAINT (Season 2.5)
//
// Every sprite in here was modeled and lit in Blender and rendered top-down at
// 8x, the same way DMA did it for GTA 1 — then graded to the Nuggetown night
// palette and packed into one atlas, embedded below as a data URI so
// nugget.png stays the one and only binary art asset in this repo. The city
// keeps its procedural bones: lane paint, neon, glows, livery, damage and
// weather still draw ON TOP of these sprites, and every caller falls back to
// the old fillRect rigs if the atlas ever fails to decode.
//
// Regeneration recipe lives in GTA_SPRINTS.md (the FRESH PAINT sprint note).
// Regions are [x, y, w, h] in atlas pixels. Loaded before js/gta.js.

const GTA_ART_REGIONS = __REGIONS__;

const GtaArt = (() => {
  const img = new Image();
  let ok = false;
  img.onload = () => { ok = true; };
  img.onerror = () => { ok = false; };
  img.src = 'data:image/png;base64,__B64__';

  const tcache = new Map(); // tinted sprite canvases, keyed name|color

  // straight centered blit (w/h optional dest scale)
  function draw(g, name, cx, cy, w, h) {
    const r = GTA_ART_REGIONS[name];
    if (!ok || !r) return false;
    const dw = w || r[2], dh = h || r[3];
    g.drawImage(img, r[0], r[1], r[2], r[3], cx - dw / 2, cy - dh / 2, dw, dh);
    return true;
  }

  // paint-mask tint: body rendered WHITE in Blender, mask says where the
  // paint is; multiply keeps the baked shading. Cached per (body, color).
  function tinted(body, color) {
    const key = body + '|' + color;
    let cv = tcache.get(key);
    if (cv) return cv;
    const rb = GTA_ART_REGIONS[body], rm = GTA_ART_REGIONS[body + '_mask'];
    if (!ok || !rb) return null;
    cv = document.createElement('canvas');
    cv.width = rb[2]; cv.height = rb[3];
    const c = cv.getContext('2d');
    c.drawImage(img, rb[0], rb[1], rb[2], rb[3], 0, 0, rb[2], rb[3]);
    if (rm) {
      const mk = document.createElement('canvas');
      mk.width = rb[2]; mk.height = rb[3];
      const mc = mk.getContext('2d');
      mc.drawImage(img, rm[0], rm[1], rm[2], rm[3], 0, 0, rb[2], rb[3]);
      mc.globalCompositeOperation = 'source-in';
      mc.fillStyle = color;
      mc.fillRect(0, 0, rb[2], rb[3]);
      c.globalCompositeOperation = 'multiply';
      c.drawImage(mk, 0, 0);
      c.globalCompositeOperation = 'source-over';
    }
    tcache.set(key, cv);
    return cv;
  }

  // whole-sprite tint (roof gravel, the NPD cap): multiply everywhere,
  // then restore the sprite's own alpha.
  function tintedAll(name, color) {
    const key = name + '*' + color;
    let cv = tcache.get(key);
    if (cv) return cv;
    const r = GTA_ART_REGIONS[name];
    if (!ok || !r) return null;
    cv = document.createElement('canvas');
    cv.width = r[2]; cv.height = r[3];
    const c = cv.getContext('2d');
    c.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = color;
    c.fillRect(0, 0, r[2], r[3]);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    c.globalCompositeOperation = 'source-over';
    tcache.set(key, cv);
    return cv;
  }

  return { on: () => ok, draw, tinted, tintedAll, img, R: GTA_ART_REGIONS };
})();
"""

if __name__ == "__main__":
    main()
