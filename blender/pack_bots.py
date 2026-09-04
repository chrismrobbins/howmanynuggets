"""BATTEREDBOTS pipeline, stage 2: render_bots/raw -> js/botsArt.js.

    python blender/pack_bots.py [--keep-raw]

Run AFTER botsrig.py has filled blender/render_bots/raw and written
_manifest.json (which sprite was rendered at what cell / supersample).
Pillow + numpy, tooling only — the site stays build-step-free.

What it does, per blender/BOTS_ART_CONTRACT.md:
- premultiplied-LANCZOS downscale of every 8x render (never resize straight
  alpha: halos), one layout shared by THREE 1024x1024 pages:
      albedo  RGBA PNG, colour dilated into the transparent border so bilinear
              sampling never pulls black in
      normal  RGBA PNG, vectors re-normalised after the average (averaging unit
              vectors does not produce one), alpha copied from the albedo,
              transparent texels flat (128,128,255)
      mask    RGBA PNG, white where PAINT_* rendered, alpha from the albedo
  NO grading anywhere: these are albedos for a renderer that lights them, and a
  graded normal is a tilted normal.
- soft particles/decals get a small premultiplied blur (the "soft edge" the
  contract asks for is cheaper here than in a shader)
- the floors (`pit`, `fryer`, `sump`): 2x renders -> 2048x1152; albedo + rough
  as JPEG q92, normal as PNG (JPEG blocking in a normal map is lighting that
  swims)
- writes js/botsArt.js in the contract's exact shape, a contact sheet
  (render_bots/_contact.png) and every floor albedo at half size
  (render_bots/_floor_<arena>.png), keeps the 1x PNGs in render_bots/ and
  deletes the raws (100MB of 8x renders do not belong in the repo).
- INCREMENTAL: anything in the manifest whose raw is gone (an earlier run
  packed it and deleted the raws) is re-read from its 1x PNGs in render_bots/,
  already processed. So `botsrig.py nosprites floors=sump` + this script
  repacks one floor without re-rendering sixty sprites.
"""
import base64
import io
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
RENDERS = os.path.join(HERE, "render_bots")
RAW = os.path.join(RENDERS, "raw")
ATLAS = 1024
PAD = 2
JPEG_Q = 92

# blur radius in ATLAS px for the soft sprites (premultiplied, so no halos)
SOFT = {"p_smoke": 1.8, "puddle_ranch": 1.2, "scorch": 1.5, "skid": 1.0, "p_spark": 0.9,
        "p_fire_0": 0.7, "p_fire_1": 0.7, "p_fire_2": 0.7, "p_oil": 0.5}
FLAT_NORMAL = np.array([128.0, 128.0, 255.0])


def load(path):
    return np.asarray(Image.open(path).convert("RGBA")).astype(np.float64)


def down_premul(arr, ss):
    """(h,w,4) straight-alpha 0..255 -> premultiply -> LANCZOS /ss -> unpremultiply."""
    if ss == 1:
        return arr.copy()
    a = arr[..., 3:4] / 255.0
    pre = np.concatenate([arr[..., :3] * a, arr[..., 3:4]], axis=-1)
    im = Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA")
    tw, th = im.width // ss, im.height // ss
    small = np.asarray(im.resize((tw, th), Image.LANCZOS)).astype(np.float64)
    al = small[..., 3:4] / 255.0
    rgb = np.where(al > 1e-4, small[..., :3] / np.maximum(al, 1e-4), 0)
    return np.concatenate([np.clip(rgb, 0, 255), small[..., 3:4]], axis=-1)


def soften(arr, radius):
    a = arr[..., 3:4] / 255.0
    pre = np.concatenate([arr[..., :3] * a, arr[..., 3:4]], axis=-1)
    im = Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(radius))
    s = np.asarray(im).astype(np.float64)
    al = s[..., 3:4] / 255.0
    rgb = np.where(al > 1e-4, s[..., :3] / np.maximum(al, 1e-4), 0)
    return np.concatenate([np.clip(rgb, 0, 255), s[..., 3:4]], axis=-1)


def dilate_rgb(arr, iters=4, thresh=8):
    """Push edge colour outward into transparent texels (alpha untouched)."""
    rgb = arr[..., :3].copy()
    a = arr[..., 3]
    known = a > thresh
    for _ in range(iters):
        if known.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(a.shape, dtype=np.float64)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                sh = np.roll(np.roll(rgb, dy, axis=0), dx, axis=1)
                kn = np.roll(np.roll(known, dy, axis=0), dx, axis=1)
                acc += sh * kn[..., None]
                cnt += kn
        fill = (~known) & (cnt > 0)
        rgb[fill] = acc[fill] / cnt[fill][:, None]
        known = known | fill
    out = arr.copy()
    out[..., :3] = rgb
    return out


def renormalize(nrm, alpha):
    """Decode, unit-length, re-encode; transparent -> flat."""
    v = nrm[..., :3] / 127.5 - 1.0
    ln = np.linalg.norm(v, axis=-1, keepdims=True)
    v = np.where(ln > 1e-3, v / np.maximum(ln, 1e-3), np.array([0, 0, 1.0]))
    enc = np.clip((v * 0.5 + 0.5) * 255.0, 0, 255)
    enc[alpha <= 2] = FLAT_NORMAL
    out = np.zeros_like(nrm)
    out[..., :3] = enc
    out[..., 3] = alpha
    return out


def stencil(msk, alpha):
    lum = (msk[..., 0] * 0.2126 + msk[..., 1] * 0.7152 + msk[..., 2] * 0.0722)
    v = np.clip(lum, 0, 255)
    out = np.zeros_like(msk)
    out[..., 0] = out[..., 1] = out[..., 2] = v
    out[..., 3] = alpha
    return out


def to_img(arr, mode="RGBA"):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode)


def data_uri(im, fmt, **kw):
    buf = io.BytesIO()
    if fmt == "PNG":
        im.save(buf, format="PNG", optimize=True)
        mime = "image/png"
    else:
        im.save(buf, format="JPEG", quality=JPEG_Q, optimize=True, subsampling=0, **kw)
        mime = "image/jpeg"
    b = buf.getvalue()
    return "data:%s;base64,%s" % (mime, base64.b64encode(b).decode("ascii")), len(b)


def shelf_pack(sizes, width=ATLAS, pad=PAD):
    """name -> [x, y, w, h]; tallest first, rows left to right."""
    items = sorted(sizes.items(), key=lambda kv: (-kv[1][1], -kv[1][0], kv[0]))
    regions, x, y, shelf = {}, pad, pad, 0
    for name, (w, h) in items:
        if x + w + pad > width:
            x, y, shelf = pad, y + shelf + pad, 0
        regions[name] = [x, y, w, h]
        x += w + pad
        shelf = max(shelf, h)
    return regions, y + shelf + pad


def main(argv):
    keep_raw = "--keep-raw" in argv
    manifest = json.load(open(os.path.join(RENDERS, "_manifest.json")))
    ppu = int(manifest.get("ppu", 4))
    sprites = {}
    reused = 0

    for name, info in sorted(manifest["sprites"].items()):
        cw, ch = info["cell"]
        ss = int(info["ss"])
        want = (cw * ppu, ch * ppu)
        if not os.path.exists(os.path.join(RAW, name + ".png")):
            # packed on an earlier run: the 1x PNGs ARE the processed sprite
            alb = load(os.path.join(RENDERS, name + ".png"))
            nrm = load(os.path.join(RENDERS, name + "_n.png"))
            msk = load(os.path.join(RENDERS, name + "_m.png"))
            for tag, arr in (("albedo", alb), ("normal", nrm), ("mask", msk)):
                got = (arr.shape[1], arr.shape[0])
                assert got == want, f"{name} {tag} (1x): {got} != {want}"
            sprites[name] = (alb, nrm, msk)
            reused += 1
            continue
        alb = down_premul(load(os.path.join(RAW, name + ".png")), ss)
        nrm = down_premul(load(os.path.join(RAW, name + "_n.png")), ss)
        msk = down_premul(load(os.path.join(RAW, name + "_m.png")), ss)
        for tag, arr in (("albedo", alb), ("normal", nrm), ("mask", msk)):
            got = (arr.shape[1], arr.shape[0])
            assert got == want, f"{name} {tag}: {got} != {want}"
        if name in SOFT:
            alb = soften(alb, SOFT[name])
        alpha = alb[..., 3]
        if alpha.max() < 8:
            print(f"  WARNING {name}: empty render")
        alb = dilate_rgb(alb)
        nrm = renormalize(nrm, alpha)
        msk = stencil(msk, alpha)
        sprites[name] = (alb, nrm, msk)
        to_img(alb).save(os.path.join(RENDERS, name + ".png"))
        to_img(nrm).save(os.path.join(RENDERS, name + "_n.png"))
        to_img(msk).save(os.path.join(RENDERS, name + "_m.png"))
    if reused:
        print(f"  reused {reused} sprite(s) from 1x PNGs (no raw)")

    regions, used_h = shelf_pack({n: (a.shape[1], a.shape[0]) for n, (a, _, _) in sprites.items()})
    assert used_h <= ATLAS, f"atlas overflow: needs {used_h} rows"

    page_a = np.zeros((ATLAS, ATLAS, 4))
    page_n = np.zeros((ATLAS, ATLAS, 4))
    page_n[..., :3] = FLAT_NORMAL
    page_m = np.zeros((ATLAS, ATLAS, 4))
    for name, (alb, nrm, msk) in sprites.items():
        x, y, w, h = regions[name]
        page_a[y:y + h, x:x + w] = alb
        page_n[y:y + h, x:x + w] = nrm
        page_m[y:y + h, x:x + w] = msk
    uri_a, na = data_uri(to_img(page_a), "PNG")
    uri_n, nn = data_uri(to_img(page_n), "PNG")
    uri_m, nm = data_uri(to_img(page_m), "PNG")
    print(f"pages: albedo {na / 1024:.0f} KB, normal {nn / 1024:.0f} KB, mask {nm / 1024:.0f} KB, "
          f"{len(regions)} regions, {used_h}/{ATLAS} rows used")

    floors = {}
    for arena, finfo in sorted(manifest.get("floors", {}).items()):
        pw, ph = finfo["px"]
        ss = int(finfo["ss"])
        base = os.path.join(RAW, "floor_" + arena)
        if not os.path.exists(base + ".png"):
            # packed on an earlier run: re-read the processed 1x pages
            fin = os.path.join(RENDERS, "floor_" + arena)
            alb = Image.open(fin + ".png").convert("RGB")
            nrm_im = Image.open(fin + "_n.png").convert("RGB")
            rgh = Image.open(fin + "_r.png").convert("L")
            assert alb.size == (pw, ph) and nrm_im.size == (pw, ph) and rgh.size == (pw, ph), f"floor {arena} 1x size"
            print(f"floor {arena}: reused 1x PNGs (no raw)")
        else:
            alb = Image.open(base + ".png").convert("RGB").resize((pw, ph), Image.LANCZOS)
            nrm_raw = np.asarray(Image.open(base + "_n.png").convert("RGB").resize((pw, ph), Image.LANCZOS)).astype(np.float64)
            nrm = renormalize(np.concatenate([nrm_raw, np.full(nrm_raw.shape[:2] + (1,), 255.0)], axis=-1),
                              np.full(nrm_raw.shape[:2], 255.0))
            nrm_im = to_img(nrm[..., :3], "RGB")
            rgh = Image.open(base + "_r.png").convert("L").resize((pw, ph), Image.LANCZOS)
        ua, sa = data_uri(alb, "JPEG")
        un, sn = data_uri(nrm_im, "PNG")
        ur, sr = data_uri(rgh, "JPEG")
        floors[arena] = dict(w=pw, h=ph, albedo=ua, normal=un, rough=ur)
        alb.save(os.path.join(RENDERS, f"floor_{arena}.png"))
        nrm_im.save(os.path.join(RENDERS, f"floor_{arena}_n.png"))
        rgh.save(os.path.join(RENDERS, f"floor_{arena}_r.png"))
        alb.resize((pw // 2, ph // 2), Image.LANCZOS).save(os.path.join(RENDERS, f"_floor_{arena}.png"))
        print(f"floor {arena}: albedo jpeg {sa / 1024:.0f} KB, normal png {sn / 1024:.0f} KB, rough jpeg {sr / 1024:.0f} KB")

    # ---- js/botsArt.js ----
    floors_js = "{\n" + ",\n".join(
        f"    {k}: {{ w: {v['w']}, h: {v['h']},\n      albedo: '{v['albedo']}',\n"
        f"      normal: '{v['normal']}',\n      rough: '{v['rough']}' }}" for k, v in floors.items()) + "\n  }"
    js = JS_TEMPLATE.replace("__W__", str(ATLAS)).replace("__H__", str(ATLAS)).replace("__PPU__", str(ppu))
    js = js.replace("__REGIONS__", json.dumps(regions, sort_keys=True, separators=(",", ":")))
    js = js.replace("__ALBEDO__", uri_a).replace("__NORMAL__", uri_n).replace("__MASK__", uri_m)
    js = js.replace("__FLOORS__", floors_js)
    out_js = os.path.join(REPO, "js", "botsArt.js")
    with open(out_js, "w", newline="\n", encoding="utf-8") as f:
        f.write(js)
    print(f"wrote {out_js} ({os.path.getsize(out_js) / 1024:.0f} KB)")

    contact(sprites, regions)
    if not keep_raw and os.path.isdir(RAW):
        shutil.rmtree(RAW)
        print("deleted", RAW)


def contact(sprites, regions):
    """Every sprite: albedo | normal | mask, labelled, on one reviewable sheet."""
    T = 112
    cols = 5
    names = sorted(sprites, key=lambda n: (-regions[n][3], n))
    try:
        font = ImageFont.load_default(size=13)
    except TypeError:
        font = ImageFont.load_default()
    tile_w, tile_h = T * 3 + 16, T + 26
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tile_w + 8, rows * tile_h + 8), (24, 24, 28))
    dr = ImageDraw.Draw(sheet)
    checker = Image.new("RGB", (T, T), (70, 70, 76))
    cd = ImageDraw.Draw(checker)
    for yy in range(0, T, 8):
        for xx in range(0, T, 8):
            if (xx // 8 + yy // 8) % 2:
                cd.rectangle([xx, yy, xx + 7, yy + 7], fill=(90, 90, 98))
    for i, name in enumerate(names):
        alb, nrm, msk = sprites[name]
        ox, oy = 8 + (i % cols) * tile_w, 8 + (i // cols) * tile_h
        h, w = alb.shape[:2]
        scale = min(T / w, T / h)
        if scale > 1:
            scale = max(1, int(scale))
        tw, th = max(1, int(w * scale)), max(1, int(h * scale))
        rs = Image.NEAREST if scale >= 1 else Image.LANCZOS
        for k, arr in enumerate((alb, nrm, msk)):
            im = to_img(arr).resize((tw, th), rs)
            bg = checker.copy() if k == 0 else Image.new("RGB", (T, T), (128, 128, 255) if k == 1 else (40, 40, 40))
            bg.paste(im, ((T - tw) // 2, (T - th) // 2), im)
            sheet.paste(bg, (ox + k * (T + 4), oy + 20))
        dr.text((ox + 2, oy + 3), f"{name}  {w}x{h}  x{scale:g}", fill=(230, 230, 230), font=font)
    sheet.save(os.path.join(RENDERS, "_contact.png"))
    print("wrote", os.path.join(RENDERS, "_contact.png"))


JS_TEMPLATE = r"""// ---- BATTEREDBOTS ART DEPARTMENT ----------------------------------------------------
// "Somebody breaded the battlebots." — game 17, mode `bots`
//
// GENERATED by blender/pack_bots.py from blender/botsrig.py renders. Do not hand-edit.
//
// Three aligned 1024x1024 pages (same layout, same R): `albedo` is lit colour on a
// transparent film, `normal` is a camera-space normal (RGB = n*0.5+0.5, +X right,
// +Y image-up, +Z toward the camera, flat = 128,128,255, alpha from the albedo),
// `mask` is white where the sauce PAINT goes (the renderer tints it by team). PPU 4:
// a 26-unit bot is 104 px here. Every sprite is nose-UP; the renderer rotates.
// Nothing in these pages is emissive — the lamps, sparks and neon are the renderer's.
//
// `floors[arena]` — `pit` THE GARAGE PIT, `fryer` THE FRYER, `sump` THE SUMP — are
// 2048x1152 pages over the 640x360 world (3.2 px/unit), row 0 = world y 0 (the
// contract's y grows downward), one wall/start/pad shell in three dressings.
// albedo/rough JPEG, normal PNG. Nothing baked: the sump is dark because its
// concrete is dark, the fryer is cold because its steel is neutral.
//
// The contract is blender/BOTS_ART_CONTRACT.md. js/bots.js paints procedural stand-ins
// for every region and only ever gets BETTER when this file arrives (HallBoot.inject).

const BotsArt = (() => {
  const W = __W__, H = __H__, PPU = __PPU__;
  const R = __REGIONS__;
  const albedo = '__ALBEDO__';
  const normal = '__NORMAL__';
  const mask = '__MASK__';
  const floors = __FLOORS__;
  return { W, H, PPU, R, albedo, normal, mask, floors };
})();
window.BotsArt = BotsArt;
"""

if __name__ == "__main__":
    main(sys.argv[1:])
