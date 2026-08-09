"""THE GRAND REOPENING pipeline, stage 2: hall renders -> js/hallArt.js.

Run AFTER hallrig.render_all() has filled blender/render_hall:

    python blender/pack_hall.py [renders_dir] [repo_root]

Needs Pillow + numpy (tooling only; the site stays build-step-free).

What it does, in the S2.12/S2.13 tradition:
- premultiplied-LANCZOS downscale of the 4x renders
- grades every region's MEAN to the procedural painter's mean (palette
  fidelity — the targets live in blender/hall_targets.json, measured off
  the real painters by scratch harness; regenerate with measure-targets)
- then contrast-expands about that mean (structured contrast — 1.0 was
  invisible, 2.0 was wallpaper; these sit at the proven midpoints)
- bakes a soft glow pass into the neon signs (EEVEE-Next has no bloom)
- tints the marquee blank and the control-panel blank per game (10 each)
  using the same palette table as ArcadeArt.GAMES
- adds wrap-safe grain to the tileables so JPEG blocking never shows
- shelf-packs ONE opaque sheet, embeds it as a JPEG data URI in
  js/hallArt.js (canvas blits only — no WebGL, so no POT constraint;
  data URIs never taint, so photo modes and file:// keep working)
"""
import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image

SS = 4

# ArcadeArt.GAMES palette (keep in sync with js/arcade-art.js)
GAMES = {
    "catch":   ("#ffd166", "#ff2fa0"),
    "blaster": ("#ff5252", "#ffd166"),
    "flappy":  ("#4dd0e1", "#ffe23a"),
    "dunk":    ("#ff8a3d", "#d32f2f"),
    "run":     ("#39ff7a", "#26e0ff"),
    "sim":     ("#7c4dff", "#26e0ff"),
    "brawl":   ("#ff5252", "#8a1c10"),
    "knight":  ("#ffb020", "#ff3d3d"),
    "ranch":   ("#ffd166", "#e95420"),
    "kart":    ("#39ff7a", "#0a7a3a"),
}

# Regions graded to the measured procedural means. Value = contrast factor
# about the target mean AFTER the grade (the midpoint law).
GRADE = {
    "carpet": 1.45, "wall": 1.4, "wainscot": 1.35, "ceiling": 1.35,
    "brick": 1.5, "sidewalk": 1.4, "metal": 1.3, "dark": 1.2,
    "cabFront": 1.3, "bezel": 1.25, "door": 1.25, "vending": 1.2,
    "change": 1.2, "road": 1.5, "pierWood": 1.45, "water": 1.6,
    "shopNoodle": 1.2, "shopLaundro": 1.2, "shopGarage": 1.2,
    "across": 1.25, "sideBase": 1.3,
    "nugSkin": 1.25, "hoodCloth": 1.3, "cupGravy": 1.15,
    "henWhite": 1.15, "pickle": 1.25,
}
# sheet name -> hall_targets.json key (atlas, region). sideBase/marqBase/
# panelBase grade against their runtime counterparts.
TARGET_KEY = {
    "sideBase": ("main", "side_blaster"),
    "marqBase": None, "panelBase": None,  # tinted separately
    "road": ("street", "road"), "pierWood": ("street", "pierWood"),
    "water": ("street", "water"), "shopNoodle": ("street", "shopNoodle"),
    "shopLaundro": ("street", "shopLaundro"), "shopGarage": ("street", "shopGarage"),
    "across": ("street", "across"), "nugSkin": ("street", "nugSkin"),
    "hoodCloth": ("street", "hoodCloth"), "cupGravy": ("street", "cupGravy"),
    "henWhite": ("street", "henWhite"), "pickle": ("street", "pickle"),
}

# Neon signage: no grading (emissive, drawn with e:1 in-engine), baked glow.
NEON_GLOW = {"sign": 10, "open": 7, "phrase": 8, "highscores": 8}

# Tileables get wrap-safe grain (masks JPEG blocking, adds tooth).
GRAINY = {"carpet", "wall", "wainscot", "ceiling", "brick", "sidewalk",
          "metal", "dark", "road", "pierWood", "nugSkin", "hoodCloth",
          "henWhite", "pickle"}

JPEG_QUALITY = 87


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
    return small[..., :3]  # opaque sheet


def grade(arr, target_rgb, contrast, protect=0):
    """Mean-match then contrast-expand. protect>0 keeps emissive highlights
    (the carpet confetti lesson: mean-matching dims EVERYTHING, including
    the parts that are supposed to glow)."""
    m = np.maximum(arr.reshape(-1, 3).mean(axis=0), 1e-3)
    out = np.clip(arr * (np.array(target_rgb, dtype=np.float64) / m), 0, 255)
    if contrast != 1.0:
        mm = out.reshape(-1, 3).mean(axis=0)
        out = np.clip(mm + (out - mm) * contrast, 0, 255)
    if protect:
        lum = arr @ np.array([0.2126, 0.7152, 0.0722])
        p = np.clip((lum - protect) / 80.0, 0, 1)[..., None]
        out = out * (1 - p) + arr * p
    return out


def glow(arr, radius):
    """Threshold the hot pixels, big soft blur, screen-blend back."""
    lum = arr @ np.array([0.2126, 0.7152, 0.0722])
    hot = np.clip((lum - 120.0) / 135.0, 0, 1)[..., None] * arr
    im = Image.fromarray(np.clip(hot, 0, 255).astype(np.uint8), "RGB")
    from PIL import ImageFilter
    bl = np.asarray(im.filter(ImageFilter.GaussianBlur(radius))).astype(np.float64)
    bl2 = np.asarray(im.filter(ImageFilter.GaussianBlur(radius * 3))).astype(np.float64)
    g = np.clip(bl * 0.85 + bl2 * 0.55, 0, 255)
    return 255 - (255 - arr) * (255 - g) / 255  # screen


def grain(arr, seed, amp=3.2):
    rng = np.random.default_rng(seed)
    n = rng.normal(0, amp, arr.shape[:2])[..., None]
    return np.clip(arr + n, 0, 255)


def colorize(base, mask, color):
    """mask (0..1) area of base gets multiplied toward color."""
    c = np.array(hex_rgb(color), dtype=np.float64) / 255.0
    tinted = base * c
    return base * (1 - mask) + tinted * mask


def diag_gradient(w, h, c2, c1, lo=0.33, hi=0.62):
    """The pMarquee background: c2 -> c1 -> c2 along the (0,0)->(w,h) diagonal,
    shaded like the painter (shade 0.25 ends, 0.45 middle -> lo/hi here)."""
    yy, xx = np.mgrid[0:h, 0:w]
    t = (xx / max(w - 1, 1) + yy / max(h - 1, 1)) / 2  # 0..1 along diagonal
    tri = 1 - np.abs(t - 0.5) * 2  # 0 at ends, 1 in middle
    a = np.array(hex_rgb(c2), dtype=np.float64) * lo
    b = np.array(hex_rgb(c1), dtype=np.float64) * hi
    return (a[None, None, :] * (1 - tri[..., None]) + b[None, None, :] * tri[..., None]) / 255.0


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    renders = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "render_hall")
    repo = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(here)
    targets = json.load(open(os.path.join(here, "hall_targets.json")))

    def target_for(name):
        atlas, key = TARGET_KEY.get(name, ("main", name)) or (None, None)
        if atlas is None:
            return None
        t = targets.get(atlas, {}).get(key)
        return t[:3] if t else None

    sprites = {}

    def add(name, arr):
        sprites[name] = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

    names = sorted(f[:-4] for f in os.listdir(renders)
                   if f.endswith(".png") and not f.startswith("panelBase_mask"))
    for name in names:
        arr = load_small(os.path.join(renders, name + ".png"))
        if name in NEON_GLOW:
            arr = np.clip(glow(arr, NEON_GLOW[name]) * 1.28, 0, 255)
        elif name == "marqBase":
            base = arr @ np.array([0.2126, 0.7152, 0.0722]) / 255.0  # 0..1 shading
            for mode, (c1, c2) in GAMES.items():
                gr = diag_gradient(arr.shape[1], arr.shape[0], c2, c1)
                tinted = np.clip(base[..., None] * gr * 255 * 1.35, 0, 255)
                # keep the acrylic's white hot-spot: screen a little of the
                # original highlights back on top so it still reads backlit
                hot = np.clip((base - 0.72) / 0.28, 0, 1)[..., None] * 255
                tinted = 255 - (255 - tinted) * (255 - hot * 0.5) / 255
                add("marq_" + mode, tinted)
            continue
        elif name == "panelBase":
            masks = {}
            for tag in ("ball", "b1", "b2"):
                mp = os.path.join(renders, f"panelBase_mask_{tag}.png")
                m = load_small(mp) @ np.array([0.2126, 0.7152, 0.0722]) / 255.0
                masks[tag] = np.clip(m, 0, 1)[..., None]
            t = target_for("panel_blaster") or targets["main"].get("panel_blaster", [40, 42, 60])[:3]
            for mode, (c1, c2) in GAMES.items():
                p = arr.copy()
                p = colorize(p, masks["ball"], c1)
                p = colorize(p, masks["b1"], c1)
                p = colorize(p, masks["b2"], c2)
                add("panel_" + mode, p)
            continue
        else:
            if name == "carpet":
                arr = glow(arr, 3)  # the painter's shadowBlur halo
            t = target_for(name)
            if t:
                arr = grade(arr, t, GRADE.get(name, 1.2),
                            protect=100 if name == 'carpet' else 0)
        if name in GRAINY:
            arr = grain(arr, hash(name) & 0xFFFF)
        add(name, arr)

    # ---- shelf pack ----
    PAD, AW = 2, 2048
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

    sheet = Image.new("RGB", (AW, AH), (6, 6, 12))
    for name, im in sprites.items():
        sheet.paste(im, tuple(regions[name][:2]))

    buf = io.BytesIO()
    sheet.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True, subsampling=1)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    js = JS_TEMPLATE.replace("__REGIONS__", json.dumps(regions, sort_keys=True))
    js = js.replace("__B64__", b64)
    out_js = os.path.join(repo, "js", "hallArt.js")
    with open(out_js, "w", newline="\n", encoding="utf-8") as f:
        f.write(js)
    print(f"sheet {AW}x{AH}, {len(regions)} regions, jpeg {len(buf.getvalue()) / 1024:.0f} KB "
          f"(b64 {len(b64) / 1024:.0f} KB)")
    print("wrote", out_js)


JS_TEMPLATE = r"""// ---- HALL ART DEPARTMENT -----------------------------------------------------
// "The lease said AS-IS. We said OTHERWISE." — THE GRAND REOPENING
//
// Every surface in the Nugget Arcade hall — and the street outside, and the
// regulars who loiter on it — was modeled and lit in Blender (blender/
// hallrig.py), rendered at 4x, graded to the exact procedural palette the
// hall has always worn, and packed into this one sheet. The painters in
// js/arcade-art.js blit their regions from it and keep their procedural
// rigs as fallback: if this sheet ever fails to decode, the hall degrades
// to the old paint, never to black. Text stays runtime-crisp on top.
//
// Regeneration: blender/hallrig.py (render_all) -> blender/pack_hall.py.
// Regions are [x, y, w, h] in sheet pixels. Loads before js/arcade-art.js.

const HALL_ART_REGIONS = __REGIONS__;

const HallArt = (() => {
  const img = new Image();
  let ok = false;
  img.onload = () => { ok = true; if (api.onReady) api.onReady(); };
  img.onerror = () => { ok = false; };
  img.src = 'data:image/jpeg;base64,__B64__';

  // Fill the current painter's region (painters run inside a translate+clip,
  // so the destination is always 0,0..w,h). Returns false -> caller paints
  // its procedural fallback.
  function blit(g, name, w, h) {
    const r = HALL_ART_REGIONS[name];
    if (!api.on() || !r) return false;
    g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, w, h);
    return true;
  }

  const api = { on: () => ok, blit, img, R: HALL_ART_REGIONS, onReady: null };
  return api;
})();
"""

if __name__ == "__main__":
    main()
