"""THE POWER PLANT pipeline, stage 2: hall material renders -> js/hallMapsData.js.

    blender --background --python hallrig.py -- render_maps     # renders mat/*.png
    python pack_maps.py                                         # this file

hallrig's colour pass has always answered "what does this surface look like".
render_maps answers the two questions the hall could never ask before:

    <name>_n.png   which way does each texel FACE     (tangent-space normal)
    <name>_s.png   r = roughness, g = metalness,
                   b = how much of the WebGL2 material shader this region
                       has opted into (see blender/HANDOFF.md §10)

Both are DATA, not pictures, so they get none of pack_hall's treatment — no
mean-grading, no contrast expansion, no grain, no soft ceiling. Grading a normal
map would tilt every vector in it; grading a roughness map would change what the
material IS. The only processing here is the supersample downscale, and normals
are re-normalised afterwards because averaging unit vectors does not produce one.

PNG, not JPEG. This is the one place in the repo where the payload rule bends
toward MORE bytes: JPEG's 8x8 blocking in a normal map becomes lighting that
visibly swims as the camera moves.

Regions are shared by ALIAS rather than duplicated — one `marqBase` normal map
is packed once and ten `marq_*` names point at the same rect, because the atlas
allocates ten marquee regions off one Blender render.
"""
import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image

SS = 4  # must match hallrig.SS

# One Blender render feeds many atlas regions. The atlas allocates per game;
# the art department renders the blank once.
GAME_MODES = ["catch", "blaster", "flappy", "dunk", "run", "sim", "brawl",
              "knight", "ranch", "kart"]
ALIASES = {
    "marqBase": ["marq_" + m for m in GAME_MODES],
    "panelBase": ["panel_" + m for m in GAME_MODES],
    "sideBase": ["side_" + m for m in GAME_MODES] + ["sideBase"],
}

# Regions whose "surface" is really ARTWORK — a printed marquee, a painted
# control panel, a neon sign. Relief and highlights on those read as damage,
# and the runtime draws crisp text over most of them anyway. Their PBR dial
# goes to zero, which makes the shader treat them exactly as it always has.
PBR_OFF = {"marqBase", "panelBase", "sideBase", "sign", "open", "phrase",
           "highscores", "water"}

# A few materials are lying about themselves in a way worth correcting once,
# here, rather than in ten Blender functions. Value = roughness override.
# (Wet night street: the whole look of the exterior depends on the pavement
# actually catching the lamps.)
ROUGH_FIX = {
    "sidewalk": 0.34,
    "road": 0.30,
    "carpet": 0.82,
    "metal": 0.28,
    "brick": 0.86,
    "pierWood": 0.62,
    "carRoof": 0.22,
    "carNose": 0.22,
    "carGlass": 0.10,
    "bezel": 0.35,
    "cabFront": 0.44,
}
METAL_FIX = {"metal": 0.85, "carGlass": 0.0, "bezel": 0.15}


def load_small(path, normalize=False):
    im = Image.open(path).convert("RGB")
    tw, th = im.width // SS, im.height // SS
    a = np.asarray(im.resize((tw, th), Image.LANCZOS)).astype(np.float64)
    if normalize:
        # Averaging unit vectors shortens them. Decode, renormalise, re-encode,
        # or every downscaled texel quietly claims to face slightly nowhere.
        v = a / 255.0 * 2.0 - 1.0
        n = np.linalg.norm(v, axis=-1, keepdims=True)
        v = v / np.maximum(n, 1e-6)
        v[..., 2] = np.abs(v[..., 2])       # a texel never faces away from its own face
        a = (v * 0.5 + 0.5) * 255.0
    return a


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    mat_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "render_hall", "mat")
    repo = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(here)

    names = sorted({f[:-6] for f in os.listdir(mat_dir) if f.endswith("_n.png")})
    pages = {}          # base name -> (normal array, orm array)
    for name in names:
        npath = os.path.join(mat_dir, name + "_n.png")
        spath = os.path.join(mat_dir, name + "_s.png")
        if not os.path.exists(spath):
            print("  skip (no ORM):", name)
            continue
        nrm = load_small(npath, normalize=True)
        orm = load_small(spath)
        if name in ROUGH_FIX:
            orm[..., 0] = ROUGH_FIX[name] * 255.0
        if name in METAL_FIX:
            orm[..., 1] = METAL_FIX[name] * 255.0
        if name in PBR_OFF:
            orm[..., 2] = 0.0
        pages[name] = (nrm, orm)

    if not pages:
        print("no maps found in", mat_dir)
        return

    # ---- shelf pack (tallest first, same discipline as pack_hall) ----
    PAD, AW = 2, 2048
    items = sorted(pages.items(), key=lambda kv: (-kv[1][0].shape[0], kv[0]))
    regions, x, y, shelf_h = {}, PAD, PAD, 0
    placed = []
    for name, (nrm, _orm) in items:
        h, w = nrm.shape[:2]
        if x + w + PAD > AW:
            x, y = PAD, y + shelf_h + PAD
            shelf_h = 0
        rect = [x, y, w, h]
        regions[name] = rect
        for alias in ALIASES.get(name, []):
            regions[alias] = rect
        placed.append((name, x, y))
        x += w + PAD
        shelf_h = max(shelf_h, h)
    AH = y + shelf_h + PAD
    AH = 1 << (AH - 1).bit_length()          # keep it power-of-two-friendly

    sheet_n = np.zeros((AH, AW, 3), np.float64)
    sheet_n[..., :] = [128, 128, 255]        # unmapped space still faces forward
    sheet_s = np.zeros((AH, AW, 3), np.float64)
    sheet_s[..., :] = [179, 0, 0]            # ...and stays opted out
    for name, px, py in placed:
        nrm, orm = pages[name]
        h, w = nrm.shape[:2]
        sheet_n[py:py + h, px:px + w] = nrm
        sheet_s[py:py + h, px:px + w] = orm

    def png_b64(arr):
        im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
        buf = io.BytesIO()
        im.save(buf, format="PNG", optimize=True)
        return base64.b64encode(buf.getvalue()).decode("ascii"), len(buf.getvalue())

    b64n, sz_n = png_b64(sheet_n)
    b64s, sz_s = png_b64(sheet_s)

    js = TEMPLATE.replace("__REGIONS__", json.dumps(regions, sort_keys=True,
                                                    separators=(",", ":")))
    js = js.replace("__N__", b64n).replace("__S__", b64s)
    out = os.path.join(repo, "js", "hallMapsData.js")
    with open(out, "w", newline="\n", encoding="utf-8") as f:
        f.write(js)
    print(f"maps {AW}x{AH}: {len(pages)} rendered, {len(regions)} region names")
    print(f"  normal {sz_n / 1024:.0f} KB   orm {sz_s / 1024:.0f} KB   "
          f"js {os.path.getsize(out) / 1024:.0f} KB")
    print("wrote", out)


TEMPLATE = r"""/* js/hallMapsData.js — the hall's material maps (THE POWER PLANT).
 *
 * GENERATED by blender/pack_maps.py from blender/hallrig.py render_maps.
 * Do not hand-edit.
 *
 * NOT in index.html: js/hallMaps.js injects this as an async <script> after
 * first paint. PNG rather than JPEG on purpose — block artifacts in a normal
 * map turn into lighting that swims when the camera moves.
 */
window.__HALL_MAPS__ = {r:__REGIONS__,n:'__N__',s:'__S__'};
"""

if __name__ == "__main__":
    main()
