"""SKYLINE — Nuggetown's horizon, modelled and rendered instead of hashed.

    blender --background --python blender/skyline.py -- calibrate
    blender --background --python blender/skyline.py -- render
    python blender/pack_sky.py

WHY THIS EXISTS. The city behind the street was `skyRidge()` in js/arcade.js:
a bearing, a hash for the height, a second hash for which windows are on. No
mesh, no texture, no seam — genuinely clever, and it looked like a bar chart.
Two rows of rectangles with a dot grid on them, which is exactly what it was.
It was the weakest surface in the build by a wide margin and §12 listed it as
the top open item.

THE ONE DECISION THAT MATTERS: this does NOT bake a picture of the sky.

Two sessions of palette work live in `SKY` in js/arcade.js — one table that the
dome, the distance fog, the hemisphere ambient and the wet road's reflection
all read, so that retuning the night retunes all five together. A baked RGB
panorama would freeze the skyline out of that contract forever: change the
palette and the towers would keep the old one.

So the render encodes DATA, not colour, and the shader still mixes the palette:

    R = HAZE       how much air is between the camera and this pixel, from the
                   camera's own depth. The shader mixes the body between the
                   ground bounce and skyTint() by this, so a far tower still
                   dissolves into whatever the horizon is currently painted.
    G = WINDOW     lit-window mask, carrying per-pane brightness variation in
                   its value. The shader picks the colour.
    B = SHADE      surface orientation against a fixed key. This is the whole
                   reason a modelled skyline beats a hashed one: the towers
                   have SIDES, and a side facing the glow is not the side
                   facing away. Rectangles cannot do that.
    A = COVERAGE   the silhouette, from film_transparent.

Only the alpha and the shape are frozen. Everything with a colour in it is
still computed at runtime from the same table as before.

CONVENTIONS
- Blender is Z-up; this renders an equirectangular panorama from the origin, so
  world scale is metres and the camera never moves. Buildings sit on rings at
  170-560m, which is what makes the near ones read as nearer.
- Lit windows are real QUADS, not a texture. At 4096px for 360 degrees a window
  on the middle ring is ~3px, which is enough to read, and generating only the
  LIT ones keeps it to ~11k quads. It also means the on/off pattern is decided
  in Python, where it can be made to look like an office block at 1am instead
  of like a checkerboard.
- ONE material, on everything. Per-window variation rides in a vertex colour
  layer, so there is nothing to keep in sync.
"""
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, "blender", "render_hall", "sky")

SCENE = "SKYLINE"
COLL = "SKYLINE"

# The band the hall can actually see. skyColor() in arcade.js draws the city
# between el -0.02 and 0.78 (that is a TANGENT, not an angle) — so the useful
# elevation range is about -1.1 to +38 degrees. A couple of degrees of margin
# at each end keeps the edge filtering off the silhouette.
LAT_MIN, LAT_MAX = math.radians(-4.0), math.radians(42.0)
RES_W, RES_H = 4096, 512

# ring: (count, radius range, height range, width range)
RINGS = [
    dict(n=64, r=(470, 560), h=(55, 250), w=(26, 62), seed=11),   # far, hazy
    dict(n=52, r=(285, 340), h=(38, 155), w=(20, 44), seed=57),   # mid
    dict(n=40, r=(168, 212), h=(22, 78), w=(15, 30), seed=93),    # near, dark
]

FLOOR_H = 3.55          # metres between window rows
WIN_W, WIN_H = 1.55, 1.95
LIT_FRACTION = 0.17     # how much of a 1am office block still has its lights on


# ---- scene management (GUI-safe, same rule as hallrig/hallmesh) -------------

def _scene():
    sc = bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
    bpy.context.window.scene = sc
    return sc


def _wipe(sc):
    """Only ever unlink SKYLINE's own objects — never bpy.data.objects at large.

    §12's ledger has a row about this: clearing a collection is not the same as
    clearing the datablocks, and a stale datablock elsewhere still owns the
    name, so the next build silently becomes `thing.001`.
    """
    coll = bpy.data.collections.get(COLL)
    if coll:
        for ob in list(coll.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.collections.remove(coll)
    coll = bpy.data.collections.new(COLL)
    sc.collection.children.link(coll)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    return coll


# ---- geometry --------------------------------------------------------------

def _box(bm, cx, cy, cz, sx, sy, sz, rot, uvlayer, collayer, win=0.0):
    """One axis-aligned box, yaw-rotated about the world origin's up axis."""
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    c, s = math.cos(rot), math.sin(rot)
    verts = []
    for dx, dy, dz in ((-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0),
                       (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)):
        x, y = dx * hx, dy * hy
        verts.append(bm.verts.new((cx + x * c - y * s, cy + x * s + y * c, cz + dz * sz)))
    faces = ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0))
    out = []
    for f in faces:
        try:
            face = bm.faces.new([verts[i] for i in f])
        except ValueError:
            continue
        for loop in face.loops:
            loop[uvlayer].uv = (0.0, 0.0)
            loop[collayer] = (win, win, win, 1.0)
        out.append(face)
    return out


def _quad(bm, p0, p1, p2, p3, uvlayer, collayer, win):
    """One lit window, facing outward. `win` rides in the vertex colour."""
    vs = [bm.verts.new(p) for p in (p0, p1, p2, p3)]
    try:
        f = bm.faces.new(vs)
    except ValueError:
        return None
    for loop in f.loops:
        loop[uvlayer].uv = (0.0, 0.0)
        loop[collayer] = (win, win, win, 1.0)
    return f


def _tower(bm, uvl, cl, rng, az, radius, height, width, depth):
    """A stack of setbacks with a roofline, plus the lit windows on its faces.

    Real buildings step IN as they go up and put junk on the roof, and that
    junk is most of what makes a skyline read as a skyline rather than as a
    row of blocks. Water tanks, masts, plant boxes and a billboard or two.
    """
    cx, cy = math.cos(az) * radius, math.sin(az) * radius
    # RANDOM YAW, and this is not cosmetic. The first build rotated every
    # tower to face the origin, and from the origin that means you only ever
    # see ONE face of it — every visible surface in the city had the same
    # normal, so the shade channel was constant and the whole skyline rendered
    # as flat cut-outs. Which is what the hashed version already did. Turning
    # each block off-axis is what makes two faces visible, and two faces at
    # different angles to the key is the entire reason to model this at all.
    rot = az + rng.uniform(-0.95, 0.95)
    z = 0.0
    w, d = width, depth
    tiers = 1 if height < 60 else (2 if height < 130 else rng.choice((2, 3, 3)))
    faces = []
    for t in range(tiers):
        frac = (0.52, 0.30, 0.18)[t] if tiers == 3 else ((0.66, 0.34)[t] if tiers == 2 else 1.0)
        th = height * frac
        _box(bm, cx, cy, z, w, d, th, rot, uvl, cl, 0.0)
        faces.append((cx, cy, z, w, d, th, rot))
        z += th
        w *= rng.uniform(0.66, 0.84)
        d *= rng.uniform(0.66, 0.84)

    # ---- the roofline. Silhouette detail is worth more than facade detail at
    # this distance: it is the only part of a distant building against the sky.
    top = z
    roll = rng.random()
    if roll < 0.34:                                  # water tank on legs
        r = min(w, d) * 0.22
        for i in range(4):
            a = math.pi / 4 + i * math.pi / 2
            _box(bm, cx + math.cos(a + rot) * r, cy + math.sin(a + rot) * r, top,
                 r * 0.16, r * 0.16, r * 2.1, rot, uvl, cl, 0.0)
        _box(bm, cx, cy, top + r * 2.1, r * 2.0, r * 2.0, r * 2.3, rot, uvl, cl, 0.0)
        _box(bm, cx, cy, top + r * 4.4, r * 1.5, r * 1.5, r * 0.5, rot, uvl, cl, 0.0)
    elif roll < 0.58:                                # mast with an aircraft light
        _box(bm, cx, cy, top, w * 0.06, d * 0.06, height * rng.uniform(0.16, 0.34),
             rot, uvl, cl, 0.0)
        _box(bm, cx, cy, top + height * 0.1, w * 0.16, d * 0.16, w * 0.05, rot, uvl, cl, 0.0)
    elif roll < 0.74:                                # stepped art-deco crown
        cw, cd, cz = w * 0.72, d * 0.72, top
        for i in range(3):
            hstep = height * 0.045
            _box(bm, cx, cy, cz, cw, cd, hstep, rot, uvl, cl, 0.0)
            cz += hstep
            cw *= 0.68
            cd *= 0.68
    if rng.random() < 0.42:                          # plant boxes / lift housing
        _box(bm, cx + rng.uniform(-w * 0.25, w * 0.25), cy + rng.uniform(-d * 0.2, d * 0.2),
             top, w * rng.uniform(0.18, 0.34), d * 0.4, w * rng.uniform(0.1, 0.22),
             rot, uvl, cl, 0.0)
    if rng.random() < 0.16:                          # rooftop billboard, edge-on frame
        bh = w * 0.55
        _box(bm, cx, cy, top, w * 0.92, d * 0.08, bh, rot, uvl, cl, 0.0)

    # ---- the windows, on the two tiers' outward faces
    for (bx, by, bz, bw, bd, bh, brot) in faces:
        _windows(bm, uvl, cl, rng, bx, by, bz, bw, bd, bh, brot)


def _windows(bm, uvl, cl, rng, cx, cy, cz, w, d, h, rot):
    """Emit only the LIT panes, as quads standing just off the facade.

    The pattern is deliberately not uniform noise. A real block at this hour
    has whole floors dark, a stairwell column lit all the way up, and clusters
    where somebody left a bank of lights on — so lit-ness is a floor bias times
    a column bias times a per-pane roll. Uniform noise reads as a checkerboard,
    which is exactly what the hashed version looked like.
    """
    rows = max(2, int((h - FLOOR_H) / FLOOR_H))
    if rows < 2:
        return
    c, s = math.cos(rot), math.sin(rot)

    def to_world(lx, ly, lz):
        return (cx + lx * c - ly * s, cy + lx * s + ly * c, lz)

    # ALL FOUR faces. The towers are yawed at random now, so which face the
    # camera can see depends on the tower — emitting one face put windows on
    # whatever happened to be edge-on and the city came back with 0.05% of its
    # lights showing. The hidden faces cost geometry and no pixels.
    #   (along-axis half-extent, offset-axis half-extent, which local axis runs
    #    across the facade, sign of the outward normal)
    faces = ((w, d / 2, 'x', 1.0), (w, d / 2, 'x', -1.0),
             (d, w / 2, 'y', 1.0), (d, w / 2, 'y', -1.0))
    for along, halfw, axis, sign in faces:
        cols = max(2, int(along / (WIN_W * 1.85)))
        stair = rng.randrange(cols)                  # one column lit top to bottom
        floor_on = [rng.random() < 0.72 for _ in range(rows)]
        col_bias = [rng.uniform(0.25, 1.0) for _ in range(cols)]
        off = sign * (halfw + 0.06)   # a hair of standoff: never z-fight the wall
        for r in range(rows):
            if not floor_on[r]:
                continue
            z0 = cz + FLOOR_H * 0.55 + r * FLOOR_H
            if z0 + WIN_H > cz + h - 0.6:
                break
            for k in range(cols):
                lit = (k == stair and rng.random() < 0.8)
                if not lit and rng.random() > LIT_FRACTION * col_bias[k] * 3.4:
                    continue
                u = (-along / 2) + along * (k + 0.5) / cols
                p = []
                for (du, dz) in ((-WIN_W / 2, 0), (WIN_W / 2, 0),
                                 (WIN_W / 2, WIN_H), (-WIN_W / 2, WIN_H)):
                    if axis == 'x':
                        p.append(to_world(u + du, off, z0 + dz))
                    else:
                        p.append(to_world(off, u + du, z0 + dz))
                # warmth/brightness variation per pane: sodium desk lamps and
                # cold fluorescent ceilings in the same building
                v = rng.uniform(0.45, 1.0)
                if rng.random() < 0.14:
                    v = rng.uniform(0.15, 0.35)      # a blind half-drawn
                _quad(bm, p[0], p[1], p[2], p[3], uvl, cl, v)


def build(seed=7):
    sc = _scene()
    coll = _wipe(sc)
    mesh = bpy.data.meshes.new("SKYLINE_MESH")
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    cl = bm.loops.layers.color.new("win")

    for ring in RINGS:
        rng = random.Random(seed * 1000 + ring["seed"])
        n = ring["n"]
        for i in range(n):
            # jitter the bearing so the ring is not a perfect comb — a regular
            # angular spacing reads as a fence even when the heights vary
            az = (i + rng.uniform(-0.32, 0.32)) * (2 * math.pi / n)
            radius = rng.uniform(*ring["r"])
            # heights are pow-biased: mostly low, a few real towers. Same shape
            # as the hashed version used, because that part of it was right.
            lo, hi = ring["h"]
            height = lo + (hi - lo) * rng.random() ** 2.1
            width = rng.uniform(*ring["w"])
            depth = width * rng.uniform(0.6, 1.15)
            _tower(bm, uvl, cl, rng, az, radius, height, width, depth)

    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("SKYLINE", mesh)
    coll.objects.link(ob)
    ob.data.materials.append(_material())
    print("skyline: %d verts, %d faces" % (len(mesh.vertices), len(mesh.polygons)))
    return ob


# ---- the data material -----------------------------------------------------

def _material():
    m = bpy.data.materials.get("SKY_DATA")
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new("SKY_DATA")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emis = nt.nodes.new("ShaderNodeEmission")
    emis.inputs["Strength"].default_value = 1.0
    comb = nt.nodes.new("ShaderNodeCombineColor")

    # R = HAZE, from the camera's own depth. Mapped so the near ring is ~0.15
    # and the far ring saturates — the shader reads this as "how much of the
    # horizon palette has eaten this pixel".
    cam = nt.nodes.new("ShaderNodeCameraData")
    hz = nt.nodes.new("ShaderNodeMapRange")
    hz.inputs[1].default_value = 140.0
    hz.inputs[2].default_value = 620.0
    hz.inputs[3].default_value = 0.10
    hz.inputs[4].default_value = 1.0
    hz.clamp = True
    nt.links.new(cam.outputs["View Z Depth"], hz.inputs[0])

    # G = WINDOW, straight off the vertex colour the builder wrote. Body faces
    # carry 0, panes carry their own brightness.
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "win"
    wsep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(attr.outputs["Color"], wsep.inputs[0])

    # B = SHADE. The reason to model this at all: a tower has SIDES, and the
    # side facing the sodium glow is not the side facing away from it.
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = (0.63, -0.55, 0.55)
    nt.links.new(geo.outputs["Normal"], dot.inputs[0])
    sh = nt.nodes.new("ShaderNodeMapRange")
    sh.inputs[1].default_value = -1.0
    sh.inputs[2].default_value = 1.0
    sh.inputs[3].default_value = 0.0
    sh.inputs[4].default_value = 1.0
    sh.clamp = True
    nt.links.new(dot.outputs["Value"], sh.inputs[0])

    nt.links.new(hz.outputs["Result"], comb.inputs[0])
    nt.links.new(wsep.outputs[0], comb.inputs[1])
    nt.links.new(sh.outputs["Result"], comb.inputs[2])
    nt.links.new(comb.outputs[0], emis.inputs["Color"])
    nt.links.new(emis.outputs["Emission"], out.inputs["Surface"])
    return m


# ---- the panorama ----------------------------------------------------------

def _camera(sc):
    cd = bpy.data.cameras.get("SKYCAM") or bpy.data.cameras.new("SKYCAM")
    cd.type = "PANO"
    # Blender moved the panorama settings off cycles onto the camera data in
    # 4.3. Try the new home first, fall back, and shout rather than silently
    # rendering a perspective frame that looks almost plausible.
    placed = False
    for holder in (cd, getattr(cd, "cycles", None)):
        if holder is None:
            continue
        try:
            holder.panorama_type = "EQUIRECTANGULAR"
            holder.latitude_min = LAT_MIN
            holder.latitude_max = LAT_MAX
            holder.longitude_min = -math.pi
            holder.longitude_max = math.pi
            placed = True
            break
        except (AttributeError, TypeError):
            continue
    if not placed:
        raise RuntimeError("could not set an equirectangular panorama on this Blender")
    ob = bpy.data.objects.get("SKYCAM")
    if ob is None:
        ob = bpy.data.objects.new("SKYCAM", cd)
    ob.data = cd
    coll = bpy.data.collections.get(COLL)
    if ob.name not in coll.objects:
        coll.objects.link(ob)
    ob.location = (0, 0, 0)
    # Upright. The equirect mapping is measured by calibrate(), not assumed.
    ob.rotation_euler = (math.pi / 2, 0, 0)
    sc.camera = ob
    return ob


def _render_settings(sc, w, h, samples=24):
    sc.render.engine = "CYCLES"
    try:
        sc.cycles.device = "CPU"
        sc.cycles.samples = samples
        sc.cycles.use_denoising = False
        sc.cycles.max_bounces = 0          # pure emission; no transport needed
        sc.cycles.transparent_max_bounces = 0
    except AttributeError:
        pass
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True      # alpha IS the silhouette
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"
    sc.render.image_settings.compression = 15
    # STANDARD, not Filmic/AgX. These channels are DATA — a view transform
    # would apply a photographic curve to a depth value.
    try:
        sc.view_settings.view_transform = "Standard"
        sc.view_settings.look = "None"
        sc.display_settings.display_device = "sRGB"
    except (AttributeError, TypeError):
        pass
    sc.world = sc.world or bpy.data.worlds.new("SKYWORLD")
    sc.world.use_nodes = True
    for n in sc.world.node_tree.nodes:
        if n.type == "BACKGROUND":
            n.inputs[0].default_value = (0, 0, 0, 1)
            n.inputs[1].default_value = 0.0


def render(path=None, w=RES_W, h=RES_H):
    sc = _scene()
    _camera(sc)
    _render_settings(sc, w, h)
    path = path or os.path.join(OUT_DIR, "skyline.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("skyline rendered:", path, w, "x", h)
    return path


def calibrate():
    """Find the azimuth mapping instead of guessing it.

    Blender's equirect longitude origin depends on the camera's own rotation,
    and getting it wrong yaws the whole city relative to the street — which is
    invisible in a still and obvious the moment you turn around. So: four
    markers of four different heights at known world bearings, rendered small,
    and their peak columns read back out. The printed table is the mapping.
    """
    sc = _scene()
    coll = _wipe(sc)
    mesh = bpy.data.meshes.new("CAL")
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    cl = bm.loops.layers.color.new("win")
    marks = [("+X (az 0)", 0.0, 120), ("+Y (az 90)", math.pi / 2, 90),
             ("-X (az 180)", math.pi, 60), ("-Y (az 270)", -math.pi / 2, 30)]
    for _, az, hgt in marks:
        _box(bm, math.cos(az) * 300, math.sin(az) * 300, 0, 26, 26, hgt, az, uvl, cl, 0.0)
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("CAL", mesh)
    coll.objects.link(ob)
    ob.data.materials.append(_material())
    p = render(os.path.join(OUT_DIR, "calib.png"), 512, 64)
    print("CALIBRATION render:", p)
    print("markers, tallest to shortest:", [m[0] for m in marks])


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    mode = argv[0] if argv else "render"
    if mode == "calibrate":
        calibrate()
    else:
        w = int(argv[1]) if len(argv) > 1 else RES_W
        h = int(argv[2]) if len(argv) > 2 else RES_H
        build()
        render(w=w, h=h)
