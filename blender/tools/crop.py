"""blender/tools/crop.py — LOOK AT THE PICTURE.

Handoff §1: "Measure before painting... and look at real crops, not your
imagination." A stats table has twice said a change was fine when the crop
said the marquee was a white slab. These four modes are the ones that have
actually settled arguments:

    python blender/tools/crop.py sheet  baseline                 # contact sheet of a run
    python blender/tools/crop.py ab     baseline act1            # same spot, side by side, every spot
    python blender/tools/crop.py zoom   baseline/05-deluxe.png 640 300 260 160
    python blender/tools/crop.py probe  baseline/05-deluxe.png 640 300

`sheet` is the one to run first: 16 shots on one page is the difference
between "the numbers moved" and knowing WHERE they moved.
Paths are relative to blender/tools/_shots/.
"""
import sys, os, json
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_shots')


def _p(rel):
    return rel if os.path.isabs(rel) else os.path.join(ROOT, rel)


def _font(sz=15):
    for name in ('consola.ttf', 'DejaVuSansMono.ttf', 'arial.ttf'):
        try:
            return ImageFont.truetype(name, sz)
        except OSError:
            pass
    return ImageFont.load_default()


def _label(img, text, sz=15):
    """Caption strip under a tile — a contact sheet with no labels is a mood board."""
    f = _font(sz)
    bar = Image.new('RGB', (img.width, sz + 10), (12, 12, 16))
    ImageDraw.Draw(bar).text((6, 4), text, font=f, fill=(215, 220, 235))
    out = Image.new('RGB', (img.width, img.height + bar.height), (12, 12, 16))
    out.paste(img, (0, 0))
    out.paste(bar, (0, img.height))
    return out


def _shots(tag):
    d = _p(tag)
    return sorted(f for f in os.listdir(d) if f.endswith('.png'))


def sheet(tag, cols=4, tw=430):
    """Every spot in a run on one page, captioned with its own darkness stats."""
    d = _p(tag)
    stats = {}
    sp = os.path.join(d, 'stats.json')
    if os.path.exists(sp):
        stats = {r['name']: r for r in json.load(open(sp))['rows']}
    tiles = []
    for f in _shots(tag):
        im = Image.open(os.path.join(d, f)).convert('RGB')
        im = im.resize((tw, round(im.height * tw / im.width)), Image.LANCZOS)
        name = f[:-4]
        r = stats.get(name)
        cap = name if not r else '%s  dead %.1f  near %.1f  blown %.2f  mean %.0f' % (
            name, r['dead'], r['near'], r['blown'], r['mean'])
        tiles.append(_label(im, cap))
    if not tiles:
        raise SystemExit('no shots in ' + d)
    twid, thgt = tiles[0].width, tiles[0].height
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new('RGB', (cols * (twid + 8) + 8, rows * (thgt + 8) + 8), (8, 8, 10))
    for i, t in enumerate(tiles):
        out.paste(t, (8 + (i % cols) * (twid + 8), 8 + (i // cols) * (thgt + 8)))
    p = os.path.join(d, '_sheet.jpg')
    out.save(p, quality=92)
    print(p, out.size)


def ab(tag_a, tag_b, tw=560):
    """A over B for every shot the two runs share. The only honest 'better'."""
    da, db = _p(tag_a), _p(tag_b)
    common = [f for f in _shots(tag_a) if os.path.exists(os.path.join(db, f))]
    tiles = []
    for f in common:
        a = Image.open(os.path.join(da, f)).convert('RGB')
        b = Image.open(os.path.join(db, f)).convert('RGB')
        h = round(a.height * tw / a.width)
        a = a.resize((tw, h), Image.LANCZOS)
        b = b.resize((tw, h), Image.LANCZOS)
        pair = Image.new('RGB', (tw * 2 + 6, h), (8, 8, 10))
        pair.paste(a, (0, 0)); pair.paste(b, (tw + 6, 0))
        tiles.append(_label(pair, '%s      %s  |  %s' % (f[:-4], tag_a, tag_b)))
    if not tiles:
        raise SystemExit('no shots in common')
    out = Image.new('RGB', (tiles[0].width + 16, sum(t.height + 8 for t in tiles) + 8), (8, 8, 10))
    y = 8
    for t in tiles:
        out.paste(t, (8, y)); y += t.height + 8
    p = os.path.join(db, '_ab_vs_%s.jpg' % tag_a)
    out.save(p, quality=92)
    print(p, out.size)


def zoom(rel, x, y, w, h, scale=3):
    """2-3x NEAREST crop. Bilinear upscaling hides exactly the artifacts we hunt."""
    im = Image.open(_p(rel)).convert('RGB').crop((x, y, x + w, y + h))
    im = im.resize((w * scale, h * scale), Image.NEAREST)
    p = _p(rel).replace('.png', '_zoom_%d_%d.png' % (x, y))
    im.save(p)
    print(p, im.size)


def probe(rel, x, y, r=4):
    """The pixel value under a claim. Ends 'that looks blown to me' arguments."""
    im = Image.open(_p(rel)).convert('RGB')
    px = [im.getpixel((cx, cy)) for cx in range(max(0, x - r), min(im.width, x + r + 1))
          for cy in range(max(0, y - r), min(im.height, y + r + 1))]
    n = len(px)
    avg = tuple(round(sum(p[i] for p in px) / n) for i in range(3))
    print('at (%d,%d) r=%d  mean rgb %s  luma %.1f  max %s  min %s' % (
        x, y, r, avg, 0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2],
        tuple(max(p[i] for p in px) for i in range(3)),
        tuple(min(p[i] for p in px) for i in range(3))))


def tunesheet(spot, tw=430):
    """One row per dial value for a single spot — the honest way to pick a number.

    tune.js writes _tune/<combo>/<spot>.png; this lines every combo up against
    the SAME wall so the choice is a comparison and not a memory of what the
    last reload looked like.
    """
    d = _p('_tune')
    combos = sorted(c for c in os.listdir(d) if os.path.isdir(os.path.join(d, c)))
    tiles = []
    for c in combos:
        f = os.path.join(d, c, spot + '.png')
        if not os.path.exists(f):
            continue
        im = Image.open(f).convert('RGB')
        im = im.resize((tw, round(im.height * tw / im.width)), Image.LANCZOS)
        tiles.append(_label(im, c))
    if not tiles:
        raise SystemExit('no tune shots for ' + spot)
    cols = min(len(tiles), 4)
    rows = (len(tiles) + cols - 1) // cols
    w, h = tiles[0].width, tiles[0].height
    out = Image.new('RGB', (cols * (w + 8) + 8, rows * (h + 8) + 8), (8, 8, 10))
    for i, t in enumerate(tiles):
        out.paste(t, (8 + (i % cols) * (w + 8), 8 + (i // cols) * (h + 8)))
    p = os.path.join(d, '_%s.jpg' % spot)
    out.save(p, quality=93)
    print(p, out.size)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    mode, a = sys.argv[1], sys.argv[2:]
    if mode == 'sheet':
        sheet(a[0], *(int(v) for v in a[1:]))
    elif mode == 'tunesheet':
        tunesheet(a[0], *(int(v) for v in a[1:]))
    elif mode == 'ab':
        ab(a[0], a[1], *(int(v) for v in a[2:]))
    elif mode == 'zoom':
        zoom(a[0], *(int(v) for v in a[1:]))
    elif mode == 'probe':
        probe(a[0], *(int(v) for v in a[1:]))
    else:
        raise SystemExit(__doc__)
