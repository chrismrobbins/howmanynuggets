"""HALLRIG — the Nugget Arcade hall's Blender factory (THE GRAND REOPENING).

Sibling of nugrig.py (GTN's FRESH PAINT factory), same conventions:
1 Blender unit = 1 texture pixel, ortho camera on +Z looking down, renders
at SS x supersample, Standard view transform. Every texture the hall and
street wear in js/arcade-art.js is reborn here as real, lit 3D — padded
wall panels, drop ceilings, raked brick, diamond-tread kick plates, a
joystick you could grab — then packed by pack_hall.py into js/hallArt.js.

Entry points (headless or the Python console):

    import hallrig
    hallrig.render_all(r"C:/repo/blender/render_hall")   # every PNG
    hallrig.render_one("carpet", out_dir)                # iterate on one
    hallrig.build_library(r"C:/repo/blender")            # hall_textures.blend

Scene safety: everything happens in a scene named HALLRIG so a GUI session
with another file open never loses work. _wipe() only unlinks HALLRIG's own
objects — NEVER bpy.data.objects at large.

Composition contract with arcade-art.js (keep these in sync):
- Regions with runtime text ON TOP (bake geometry, leave the zone quiet):
  marqbase (whole center), panelbase (top 0.16h + bottom 0.9h strips),
  vending header/side/bin labels, change header + sticker, bezel NUGCO
  badge, shop sign strips (top ~70px), side art (everything on top).
- Regions with text BAKED here (fallback = the old painter, whole):
  sign, open, phrase, highscores.
- Tileables must wrap: all macro structure is periodic geometry; all grain
  comes from the wrapped-fBm maps in _noise_maps (never Blender noise
  textures — those don't tile across render edges).
"""
import math
import os
import sys

import bpy
import numpy as np

SS = 4  # supersample factor (hall regions are 128-1024px; 4x + LANCZOS is plenty)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if "__file__" in dir() else r"c:\dev\HowManyNugs\howmanynuggets"
OUT_DEFAULT = os.path.join(REPO, "blender", "render_hall")
MAPS = os.path.join(OUT_DEFAULT, "maps")

NEON = {
    "magenta": (1.0, 0.08, 0.5), "cyan": (0.1, 0.85, 1.0),
    "yellow": (1.0, 0.85, 0.15), "violet": (0.5, 0.3, 1.0),
    "green": (0.2, 1.0, 0.45), "amber": (1.0, 0.65, 0.1),
    "red": (1.0, 0.28, 0.28), "warm": (1.0, 0.83, 0.6),
}

FONT_CANDIDATES = {
    "impact": [r"C:\Windows\Fonts\impact.ttf"],
    "black": [r"C:\Windows\Fonts\ariblk.ttf", r"C:\Windows\Fonts\arialbd.ttf"],
    "georgia_i": [r"C:\Windows\Fonts\georgiai.ttf", r"C:\Windows\Fonts\georgia.ttf"],
    "mono": [r"C:\Windows\Fonts\consolab.ttf", r"C:\Windows\Fonts\consola.ttf"],
}


# ---- scene management (GUI-safe) --------------------------------------------------

def _scene():
    sc = bpy.data.scenes.get("HALLRIG")
    if not sc:
        sc = bpy.data.scenes.new("HALLRIG")
    # make it current so bpy.ops primitives land here
    try:
        bpy.context.window.scene = sc
    except Exception:
        pass  # headless right after open_mainfile: context.screen is None
    return sc


def _wipe(sc=None):
    """Remove ONLY the objects linked to the HALLRIG scene."""
    sc = sc or _scene()
    for o in list(sc.collection.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    for cu in list(bpy.data.curves):
        if cu.users == 0:
            bpy.data.curves.remove(cu)


def rig(key_deg=44, key_energy=3.4, key_color=(1.0, 0.93, 0.82),
        fill_energy=0.9, fill_color=(0.5, 0.62, 1.0), world=(0.004, 0.006, 0.014)):
    """Camera on +Z, warm raking key from the image top, cool fill. The 44°
    rake is the S2.13 sweet spot (58 was wallpaper)."""
    sc = _scene()
    try:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        try:
            sc.render.engine = "BLENDER_EEVEE"
        except Exception:
            sc.render.engine = "CYCLES"
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    w = bpy.data.worlds.get("HallNight") or bpy.data.worlds.new("HallNight")
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (*world, 1.0)
    bg.inputs[1].default_value = 1.0
    sc.world = w

    def lamp(name, kind):
        ob = None
        for o in sc.collection.all_objects:
            if o.name.startswith(name):
                ob = o
        if not ob:
            ld = bpy.data.lights.new(name, kind)
            ob = bpy.data.objects.new(name, ld)
            sc.collection.objects.link(ob)
        return ob

    key = lamp("HallKey", "SUN")
    key.data.color = key_color
    key.data.energy = key_energy
    key.data.angle = math.radians(9)
    key.rotation_euler = (math.radians(key_deg), math.radians(-10), 0)
    fill = lamp("HallFill", "SUN")
    fill.data.color = fill_color
    fill.data.energy = fill_energy
    fill.data.angle = math.radians(35)
    fill.rotation_euler = (math.radians(-30), math.radians(18), 0)

    cam = None
    for o in sc.collection.all_objects:
        if o.type == "CAMERA":
            cam = o
    if not cam:
        cd = bpy.data.cameras.new("HallCam")
        cam = bpy.data.objects.new("HallCam", cd)
        sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.sensor_fit = "HORIZONTAL"
    cam.location = (0, 0, 600)
    cam.rotation_euler = (0, 0, 0)
    cam.data.clip_start = 0.1
    cam.data.clip_end = 2000
    sc.camera = cam
    try:
        sc.eevee.use_raytracing = True
    except Exception:
        pass
    return sc


def accent(name, color, x, y, z, energy=800, size=120):
    """A colored area light — bakes the arcade's neon spill into speculars."""
    sc = _scene()
    ld = bpy.data.lights.new(name, "AREA")
    ld.color = color
    ld.energy = energy
    ld.size = size
    ob = bpy.data.objects.new(name, ld)
    ob.location = (x, y, z)
    sc.collection.objects.link(ob)
    return ob


def shot(name, w_px, h_px, render_dir):
    sc = _scene()
    cam = sc.camera
    cam.data.ortho_scale = w_px
    cam.location = (0, 0, 600)
    sc.render.resolution_x = w_px * SS
    sc.render.resolution_y = h_px * SS
    sc.render.resolution_percentage = 100
    os.makedirs(render_dir, exist_ok=True)
    sc.render.filepath = os.path.join(render_dir, name + ".png")
    bpy.ops.render.render(write_still=True, scene=sc.name)
    return sc.render.filepath


# ---- wrapped-fBm grain maps (tileable BY CONSTRUCTION) ----------------------------

def _fbm(size, cells, octaves, seed, gain=0.55):
    rng = np.random.default_rng(seed)
    out = np.zeros((size, size))
    amp, tot, c = 1.0, 0.0, cells
    for _ in range(octaves):
        grid = rng.random((c, c))
        idx = np.linspace(0, c, size, endpoint=False)
        i0 = np.floor(idx).astype(int) % c
        f = idx - np.floor(idx)
        f = f * f * (3 - 2 * f)  # smoothstep
        i1 = (i0 + 1) % c
        a = grid[np.ix_(i0, i0)]
        b = grid[np.ix_(i0, i1)]
        cc = grid[np.ix_(i1, i0)]
        d = grid[np.ix_(i1, i1)]
        fx = f[np.newaxis, :]
        fy = f[:, np.newaxis]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy)
        tot += amp
        amp *= gain
        c = min(c * 2, size)
    out /= tot
    return out


def _blur_x(a, r):
    """Wrap-safe horizontal box blur (keeps tiles seamless)."""
    out = np.zeros_like(a)
    for dx in range(-r, r + 1):
        out += np.roll(a, dx, axis=1)
    return out / (2 * r + 1)


def _save_map(name, arr):
    os.makedirs(MAPS, exist_ok=True)
    path = os.path.join(MAPS, name + ".png")
    h, w = arr.shape
    im = bpy.data.images.get("MAP_" + name)
    if im:
        bpy.data.images.remove(im)
    im = bpy.data.images.new("MAP_" + name, w, h, alpha=False, float_buffer=False)
    rgba = np.empty((h, w, 4), dtype=np.float32)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = arr
    rgba[..., 3] = 1.0
    im.pixels = rgba.ravel()
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    return path


_MAPS_BUILT = False


def _noise_maps():
    """Generate every tileable grain map once per session."""
    global _MAPS_BUILT
    if _MAPS_BUILT and os.path.isdir(MAPS):
        return
    _save_map("grain_fine", _fbm(512, 64, 4, 11))       # concrete/asphalt tooth
    _save_map("grain_coarse", _fbm(512, 16, 5, 23))     # patchy variation
    _save_map("carpet_pile", _fbm(512, 96, 3, 31))      # tight loop pile
    _save_map("brushed", _blur_x(_fbm(512, 128, 2, 41), 24))  # horizontal streaks
    wood = _fbm(512, 8, 5, 53)
    _save_map("wood_grain", _blur_x(wood, 40))          # long fibers
    _save_map("fabric", _fbm(512, 128, 2, 61))          # panel cloth
    _MAPS_BUILT = True


# ---- materials --------------------------------------------------------------------

def mat(name, color, metallic=0.0, rough=0.6, emit=None, emit_str=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    if emit is not None:
        try:
            bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emit_str
        except KeyError:
            bsdf.inputs["Emission"].default_value = (*emit, 1.0)
    return m


def emis(name, color, strength=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = (*color, 1.0)
    em.inputs[1].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def mapmat(name, color, map_name, bump=0.35, rough=0.7, metallic=0.0,
           rough_span=0.0, scale=1.0, emit=None, emit_str=0.0):
    """Principled material driven by one of the wrapped-fBm maps: bump always,
    roughness variation optionally (rough_span spreads rough +/- span/2)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    _noise_maps()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    if emit is not None:
        try:
            bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emit_str
        except KeyError:
            pass
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    img = nt.nodes.new("ShaderNodeTexImage")
    img.image = bpy.data.images.get("MAP_" + map_name) or bpy.data.images.load(os.path.join(MAPS, map_name + ".png"))
    img.image.colorspace_settings.name = "Non-Color"
    img.extension = "REPEAT"
    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = bump
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], img.inputs["Vector"])
    nt.links.new(img.outputs["Color"], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    if rough_span > 0:
        ramp = nt.nodes.new("ShaderNodeMapRange")
        ramp.inputs["To Min"].default_value = max(0.0, rough - rough_span / 2)
        ramp.inputs["To Max"].default_value = min(1.0, rough + rough_span / 2)
        nt.links.new(img.outputs["Color"], ramp.inputs["Value"])
        nt.links.new(ramp.outputs["Result"], bsdf.inputs["Roughness"])
    return m


# ---- geometry helpers --------------------------------------------------------------

def box(name, sx, sy, sz, x=0, y=0, z=0, m=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, sz)  # scale IS dimension with size=1 (the half-size bug)
    if bevel > 0:
        # modifiers run PRE-scale: bake the scale first or the bevel width
        # gets multiplied by the dimensions (4px bevel -> dodecagon pads)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        md = o.modifiers.new("bev", "BEVEL")
        md.width = bevel
        md.segments = 2
        md.limit_method = "ANGLE"
    if m:
        o.data.materials.append(m)
    return o


def cyl(name, r, depth, x=0, y=0, z=0, m=None, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts,
                                        location=(x, y, z), rotation=rot)
    o = bpy.context.active_object
    o.name = name
    if m:
        o.data.materials.append(m)
    return o


def sph(name, r, x=0, y=0, z=0, m=None, squash=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, y, z),
                                         segments=24, ring_count=16)
    o = bpy.context.active_object
    o.name = name
    o.scale = (1, 1, squash)
    if m:
        o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return o


def plane(name, sx, sy, m, x=0, y=0, z=0):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, 1)
    if m:
        o.data.materials.append(m)
    return o


def poly_tube(name, pts, r, m, cyclic=False, z=0.0):
    """Neon: a smooth tube along a polyline (image-plane coords)."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 6
    sp = cu.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for i, (px, py) in enumerate(pts):
        sp.points[i].co = (px, py, z, 1)
    sp.use_cyclic_u = cyclic
    sp.use_endpoint_u = not cyclic
    sp.order_u = min(4, len(pts))
    o = bpy.data.objects.new(name, cu)
    _scene().collection.objects.link(o)
    if m:
        o.data.materials.append(m)
    return o


def rrect_tube(name, cx, cy, w, h, corner, r, m, z=0.0):
    """Rounded-rect neon border tube."""
    pts = []
    steps = 6
    for i, (sx, sy, a0) in enumerate([(1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)]):
        ccx = cx + sx * (w / 2 - corner)
        ccy = cy + sy * (h / 2 - corner)
        for s in range(steps + 1):
            a = math.radians(a0 + 90 * s / steps)
            pts.append((ccx + corner * math.cos(a), ccy + corner * math.sin(a)))
    return poly_tube(name, pts, r, m, cyclic=True, z=z)


def _font(kind):
    for p in FONT_CANDIDATES.get(kind, []):
        if os.path.exists(p):
            for f in bpy.data.fonts:
                if f.filepath == p:
                    return f
            return bpy.data.fonts.load(p)
    return None


def text3d(name, body, size, x, y, m, kind="impact", extrude=0.0, bevel=0.0,
           fill="BOTH", z=0.0, align="CENTER", squeeze=1.0):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    f = _font(kind)
    if f:
        cu.font = f
    cu.extrude = extrude
    cu.bevel_depth = bevel
    cu.fill_mode = fill
    cu.align_x = align
    cu.align_y = "CENTER"
    o = bpy.data.objects.new(name, cu)
    o.location = (x, y, z)
    o.scale = (squeeze, 1, 1)
    _scene().collection.objects.link(o)
    if m:
        o.data.materials.append(m)
    return o


def nug_blob(name, r, x=0, y=0, z=0, golden=True):
    """The star of the show, in the third dimension."""
    m = mat("HALL_nug_gold" if golden else "HALL_nug",
            (1.0, 0.72, 0.16) if golden else (0.85, 0.58, 0.2),
            metallic=0.75 if golden else 0.1, rough=0.32 if golden else 0.55)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=r, location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    tx = bpy.data.textures.get("nugclouds")
    if not tx:
        tx = bpy.data.textures.new("nugclouds", "CLOUDS")
        tx.noise_scale = r * 0.9
    md = o.modifiers.new("disp", "DISPLACE")
    md.texture = tx
    md.strength = r * 0.42
    o.scale = (1.08, 0.92, 0.7)
    o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return o


# ---- asset builders -----------------------------------------------------------------
# All build in the image plane: X right, Y up, +Z toward camera. Sizes in px.

def t_carpet(W=448, H=448):
    """Cosmic-bowling carpet: near-black pile + wrapped emissive neon confetti."""
    rig(key_deg=50, key_energy=2.2, fill_energy=0.7)
    m = mapmat("HALL_carpet", (0.045, 0.035, 0.13), "carpet_pile",
               bump=0.85, rough=0.92, scale=1.6)
    plane("floor", W * 1.2, H * 1.2, m)
    rng = np.random.default_rng(7)
    shapes = ["squiggle", "tri", "ring", "star", "bolt"]
    colors = list(NEON.values())[:5]
    for i in range(56):
        px = float(rng.uniform(-W / 2, W / 2))
        py = float(rng.uniform(-H / 2, H / 2))
        rot = float(rng.uniform(0, 6.28))
        color = colors[i % 5]
        kind = shapes[i % 5]
        for ox in (-W, 0, W):
            for oy in (-H, 0, H):
                if abs(px + ox) > W / 2 + 30 or abs(py + oy) > H / 2 + 30:
                    continue
                _confetti(f"cf{i}_{ox}_{oy}", kind, px + ox, py + oy, rot, color)


def _confetti(name, kind, x, y, rot, color):
    m = emis("HALL_neon_" + str(color), color, 1.1)
    c, s = math.cos(rot), math.sin(rot)

    def T(px, py):
        return (x + px * c - py * s, y + px * s + py * c)

    if kind == "squiggle":
        pts = [T(-16, 0), T(-6, -11), T(6, 11), T(16, 0)]
        poly_tube(name, pts, 3.3, m, z=1.5)
    elif kind == "tri":
        pts = [T(0, -11), T(10, 8), T(-10, 8)]
        poly_tube(name, pts, 3.1, m, cyclic=True, z=1.5)
    elif kind == "ring":
        pts = [T(8 * math.cos(a), 8 * math.sin(a)) for a in np.linspace(0, 6.283, 12, endpoint=False)]
        poly_tube(name, pts, 3.1, m, cyclic=True, z=1.5)
    elif kind == "star":
        pts = []
        for k in range(8):
            r = 12 if k % 2 == 0 else 3.5
            a = k * math.pi / 4
            pts.append(T(r * math.cos(a), r * math.sin(a)))
        poly_tube(name, pts, 2.9, m, cyclic=True, z=1.5)
    else:  # bolt
        pts = [T(-3, -13), T(4, -2), T(-1, -2), T(4, 12)]
        poly_tube(name, pts, 3.3, m, z=1.5)


def t_wall(W=256, H=256):
    """Padded acoustic panels, 2x2, deep recessed joints = real AO."""
    rig(key_deg=40, key_energy=2.8)
    accent("spillM", NEON["magenta"], -W * 0.4, H * 0.45, 90, energy=250, size=160)
    accent("spillC", NEON["cyan"], W * 0.4, -H * 0.45, 90, energy=180, size=160)
    plane("back", W * 1.2, H * 1.2, mat("HALL_wallback", (0.02, 0.016, 0.045), rough=0.95), z=-6)
    pm = mapmat("HALL_wallpad", (0.093, 0.082, 0.19), "fabric",
                bump=0.9, rough=0.88, scale=1.2)
    gap = 9
    pw = (W - gap * 2) / 2
    ph = (H - gap * 2) / 2
    for ix in (-1, 1):
        for iy in (-1, 1):
            b = box(f"pad{ix}{iy}", pw, ph, 9,
                    ix * (pw + gap) / 2, iy * (ph + gap) / 2, 0, pm, bevel=4.5)
            b.modifiers["bev"].segments = 3


def t_wainscot(W=256, H=128):
    """Brushed-steel kick band with a catching top rail."""
    rig(key_deg=35, key_energy=3.0)
    accent("spillC", NEON["cyan"], 0, H * 0.7, 110, energy=300, size=220)
    bm = mapmat("HALL_brushed", (0.10, 0.105, 0.16), "brushed",
                bump=0.25, rough=0.38, metallic=0.85, rough_span=0.18)
    plane("band", W * 1.2, H * 1.2, bm)
    cyl("rail", 4.5, W * 1.2, 0, H / 2 - 5, 4,
        mat("HALL_rail", (0.35, 0.37, 0.5), metallic=0.9, rough=0.25),
        rot=(0, math.pi / 2, 0))
    # faint scuffs
    sm = mat("HALL_scuff", (0.05, 0.05, 0.08), rough=0.95)
    rng = np.random.default_rng(5)
    for i in range(4):
        plane(f"scuff{i}", rng.uniform(20, 50), rng.uniform(3, 7), sm,
              float(rng.uniform(-W / 2, W / 2)), float(rng.uniform(-H / 2, 0)), 0.5)


def t_ceiling(W=256, H=256):
    """Drop ceiling: recessed mineral tiles in a T-bar grid."""
    rig(key_deg=55, key_energy=2.0, fill_energy=0.8)
    tm = mapmat("HALL_ceiltile", (0.055, 0.05, 0.1), "grain_fine",
                bump=0.7, rough=0.9, scale=1.3)
    gm = mat("HALL_tbar", (0.16, 0.16, 0.23), metallic=0.7, rough=0.4)
    plane("void", W * 1.2, H * 1.2, mat("HALL_ceilvoid", (0.01, 0.01, 0.02), rough=1.0), z=-8)
    tw = (W - 12) / 2
    for ix in (-1, 1):
        for iy in (-1, 1):
            box(f"tile{ix}{iy}", tw, tw, 5, ix * (tw + 12) / 2 * 0.98, iy * (tw + 12) / 2 * 0.98, -4, tm, bevel=1.5)
    for orient in ("h", "v"):
        for off in (-W / 2, 0, W / 2):
            if orient == "h":
                box(f"barh{off}", W * 1.2, 6, 3, 0, off, 0, gm)
            else:
                box(f"barv{off}", 6, H * 1.2, 3, off, 0, 0, gm)


def t_brick(W=256, H=256):
    """Real bricks, raked. 4 columns x 8 rows to match the painter's 64x32."""
    rig(key_deg=44, key_energy=3.6, fill_energy=0.8)
    plane("mortar", W * 1.2, H * 1.2, mapmat("HALL_mortar", (0.05, 0.035, 0.04), "grain_fine", bump=0.5, rough=0.95), z=-3)
    shades = [(0.145, 0.085, 0.075), (0.12, 0.07, 0.065), (0.17, 0.1, 0.085), (0.10, 0.06, 0.06)]
    mats = [mapmat(f"HALL_brick{i}", s, "grain_fine", bump=0.8, rough=0.85, scale=1.5)
            for i, s in enumerate(shades)]
    bw, bh = 64, 32
    rng = np.random.default_rng(9)
    for row in range(8):
        off = bw / 2 if row % 2 else 0
        for col in range(-1, 5):
            x = col * bw + off + bw / 2 - W / 2
            y = row * bh + bh / 2 - H / 2
            b = box(f"br{row}_{col}", bw - 5, bh - 5, 5 + float(rng.uniform(0, 1.6)),
                    x, y, 0, mats[int(rng.integers(0, 4))], bevel=2.2)
            b.rotation_euler = (0, 0, float(rng.uniform(-0.012, 0.012)))


def t_sidewalk(W=256, H=256):
    """Rain-slick concrete: 2x2 slabs, joints on the edges, neon in the sheen."""
    rig(key_deg=48, key_energy=2.6)
    accent("spillM", NEON["magenta"], -W * 0.5, H * 0.6, 130, energy=420, size=200)
    accent("spillC", NEON["cyan"], W * 0.5, -H * 0.3, 130, energy=320, size=200)
    cm = mapmat("HALL_conc", (0.075, 0.08, 0.10), "grain_fine",
                bump=0.8, rough=0.55, rough_span=0.5, scale=1.2)
    sw = (W - 8) / 2
    for ix in (-1, 1):
        for iy in (-1, 1):
            b = box(f"slab{ix}{iy}", sw, sw, 6, ix * (sw + 8) / 2, iy * (sw + 8) / 2, 0, cm, bevel=2.0)
            b.rotation_euler = (0.004 * ix, 0.004 * iy, 0)
    plane("under", W * 1.2, H * 1.2, mat("HALL_joint", (0.015, 0.015, 0.025), rough=0.9), z=-3.5)


def t_road(W=192, H=192):
    """Street asphalt: aggregate tooth, tar snake, worn center dashes."""
    rig(key_deg=48, key_energy=2.4)
    accent("spillC", NEON["cyan"], W * 0.4, H * 0.5, 120, energy=260, size=180)
    am = mapmat("HALL_asphalt", (0.055, 0.055, 0.07), "grain_fine",
                bump=1.0, rough=0.5, rough_span=0.55, scale=1.5)
    plane("tarmac", W * 1.2, H * 1.2, am)
    tm = mat("HALL_tar", (0.02, 0.02, 0.028), rough=0.25)
    poly_tube("tar", [(-W / 2, -30), (-W * 0.2, -20), (W * 0.1, -38), (W / 2, -30)], 2.5, tm, z=1.2)
    dm = mapmat("HALL_lanepaint", (0.62, 0.55, 0.18), "grain_fine", bump=0.3, rough=0.7)
    for x in (-72, -24, 24, 72):
        p = plane(f"dash{x}", 26, 6, dm, x, 0, 1.0)
        p.rotation_euler = (0, 0, 0.01)


def t_pierwood(W=128, H=128):
    """Weathered pier planks with real gaps and nail heads."""
    rig(key_deg=42, key_energy=3.0, key_color=(0.8, 0.85, 1.0), fill_color=(0.3, 0.4, 0.8))
    plane("under", W * 1.2, H * 1.2, mat("HALL_sea", (0.01, 0.02, 0.035), rough=0.6), z=-5)
    shades = [(0.16, 0.11, 0.07), (0.13, 0.09, 0.06), (0.19, 0.135, 0.085), (0.11, 0.08, 0.055)]
    nm = mat("HALL_nail", (0.2, 0.2, 0.24), metallic=0.9, rough=0.5)
    rng = np.random.default_rng(3)
    pw = 32
    for i in range(4):
        m = mapmat(f"HALL_plank{i}", shades[i], "wood_grain", bump=0.65, rough=0.8, scale=1.5)
        y = i * pw + pw / 2 - W / 2
        b = box(f"plank{i}", W * 1.2, pw - 4, 5 + float(rng.uniform(0, 1.4)), 0, y, 0, m, bevel=1.8)
        b.rotation_euler = (0, 0, float(rng.uniform(-0.006, 0.006)))
        for nx in (-W * 0.38, W * 0.38):
            cyl(f"nail{i}{nx}", 1.6, 2, nx + float(rng.uniform(-6, 6)), y, 3.2, nm, verts=10)


def t_water(W=128, H=128):
    """Harbor chop under the moon: REAL displaced swell (a flat glossy plane
    reads as a slab from a top ortho — the spec never finds the camera)."""
    rig(key_deg=52, key_energy=3.0, key_color=(0.65, 0.78, 1.0), fill_energy=1.3)
    accent("moon", (0.8, 0.9, 1.0), W * 0.2, H * 0.35, 120, energy=700, size=60)
    accent("neon", NEON["magenta"], -W * 0.45, -H * 0.4, 90, energy=200, size=110)
    wm = mapmat("HALL_water", (0.015, 0.06, 0.11), "grain_coarse",
                bump=0.5, rough=0.22, scale=1.0)
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=96, y_subdivisions=96, size=1)
    o = bpy.context.active_object
    o.name = "sea"
    o.scale = (W * 1.2, H * 1.2, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    tx = bpy.data.textures.get("seawaves")
    if not tx:
        tx = bpy.data.textures.new("seawaves", "CLOUDS")
        tx.noise_scale = 26
        tx.noise_depth = 3
    md = o.modifiers.new("disp", "DISPLACE")
    md.texture = tx
    md.strength = 7.0
    bpy.ops.object.shade_smooth()
    o.data.materials.append(wm)


def t_metal(W=128, H=128):
    rig(key_deg=30, key_energy=3.2)
    accent("spillC", NEON["cyan"], W * 0.3, H * 0.5, 100, energy=200, size=160)
    bm = mapmat("HALL_sheet", (0.13, 0.14, 0.21), "brushed",
                bump=0.22, rough=0.35, metallic=0.9, rough_span=0.2)
    plane("sheet", W * 1.2, H * 1.2, bm)


def t_dark(W=128, H=128):
    rig(key_deg=40, key_energy=1.6, fill_energy=0.5)
    dm = mapmat("HALL_matte", (0.045, 0.04, 0.075), "grain_fine",
                bump=0.45, rough=0.75, rough_span=0.2, scale=1.0)
    plane("matte", W * 1.2, H * 1.2, dm)


def t_cabfront(W=256, H=256):
    """Cabinet lower front: black laminate, recessed coin door, diamond tread."""
    rig(key_deg=38, key_energy=2.6)
    accent("spillM", NEON["magenta"], 0, H * 0.55, 110, energy=300, size=200)
    lam = mapmat("HALL_lam", (0.075, 0.065, 0.13), "wood_grain",
                 bump=0.5, rough=0.5, rough_span=0.3, scale=1.0)
    plane("front", W * 1.2, H * 1.2, lam)
    # neon T-molding frame accent (the painter's magenta stroke, now a real strip)
    rrect_tube("tmold", 0, 0, W - 12, H - 12, 10, 2.2, emis("HALL_tmold", NEON["magenta"], 1.1), z=2)
    # coin door: recessed panel
    dm = mat("HALL_coindoor", (0.10, 0.11, 0.18), metallic=0.75, rough=0.45)
    box("doorrec", W * 0.36, H * 0.32, 3, 0, -H * 0.15, -1.5,
        mat("HALL_coinrec", (0.03, 0.03, 0.05), rough=0.9))
    box("door", W * 0.34, H * 0.30, 4, 0, -H * 0.15, 1.5, dm, bevel=2.0)
    sm = mat("HALL_slot", (0.008, 0.008, 0.012), rough=0.6)
    lm = emis("HALL_coinled", NEON["red"], 2.4)
    for off in (-0.22, 0.22):
        sx = off * W * 0.34
        box(f"slot{off}", 12, H * 0.30 * 0.4, 2, sx, -H * 0.15 + 6, 3.6, sm, bevel=1.0)
        sph(f"led{off}", 3.2, sx, -H * 0.15 - H * 0.30 * 0.32, 3.8, lm)
    # kick plate with real diamond tread
    km = mat("HALL_kick", (0.11, 0.12, 0.19), metallic=0.85, rough=0.45)
    box("kick", W * 1.05, 34, 4, 0, -H / 2 + 18, 1.0, km, bevel=1.5)
    tm2 = mat("HALL_tread", (0.14, 0.15, 0.23), metallic=0.85, rough=0.4)
    for i in range(-8, 9):
        b = box(f"tread{i}", 16, 3.4, 2.2, i * 15, -H / 2 + 18, 3.4, tm2, bevel=1.0)
        b.rotation_euler = (0, 0, math.radians(38))


def t_bezel(W=256, H=192):
    """CRT bezel: beveled plastic, glass void, speaker grille holes."""
    rig(key_deg=36, key_energy=2.4)
    accent("spillC", NEON["cyan"], -W * 0.4, H * 0.55, 100, energy=220, size=170)
    pm = mapmat("HALL_bezelplast", (0.085, 0.08, 0.14), "grain_fine",
                bump=0.4, rough=0.5, rough_span=0.25, scale=1.3)
    plane("face", W * 1.2, H * 1.2, pm)
    # the glass void (screen quad floats in front of this in-engine)
    box("voidrec", W * 0.82, H * 0.76, 3, 0, H * 0.04, -1.4,
        mat("HALL_crtvoid", (0.004, 0.005, 0.012), rough=0.15))
    fr = rrect_tube("bezframe", 0, H * 0.04, W * 0.84, H * 0.78, 9, 3.0,
                    mat("HALL_bezrim", (0.17, 0.18, 0.28), metallic=0.6, rough=0.35), z=1.6)
    gm = mat("HALL_grillhole", (0.006, 0.006, 0.01), rough=0.9)
    for i in range(8):
        for j in range(2):
            cyl(f"gr{i}{j}", 2.6, 2, -W * 0.2 + i * 12, -H / 2 + 14 - j * -8, 0.8, gm, verts=10)
    # four corner screws
    scm = mat("HALL_screw", (0.3, 0.31, 0.4), metallic=0.9, rough=0.35)
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        cyl(f"scr{sx}{sy}", 3, 2.4, sx * (W / 2 - 10), sy * (H / 2 - 10), 1.2, scm, verts=12)


def t_door(W=192, H=448):
    """The entrance door: porthole with pink glow, push bar, kick plate."""
    rig(key_deg=34, key_energy=2.6)
    accent("inside", NEON["magenta"], 0, H * 0.19, 60, energy=160, size=60)
    dm = mapmat("HALL_doorskin", (0.115, 0.135, 0.24), "brushed",
                bump=0.2, rough=0.45, metallic=0.35, rough_span=0.2)
    plane("slab", W * 1.15, H * 1.05, dm)
    frm = mat("HALL_doorframe", (0.05, 0.05, 0.09), metallic=0.4, rough=0.55)
    rrect_tube("edge", 0, 0, W - 10, H - 10, 8, 3.2, frm, z=1.5)
    # porthole (image y: center of window at h*0.30 from top -> y = H/2 - 0.30H)
    py = H / 2 - H * 0.30
    pr = W * 0.27
    cyl("glassrec", pr, 4, 0, py, -1.6, mat("HALL_glass", (0.01, 0.02, 0.05), rough=0.1))
    # a curl of pink neon behind the glass (the arcade inside)
    poly_tube("innerglow", [(-pr * 0.55, py + pr * 0.1), (-pr * 0.1, py - pr * 0.35),
                            (pr * 0.45, py - pr * 0.1)], 2.4,
              emis("HALL_portglow", NEON["magenta"], 1.4), z=-0.5)
    tor = cyl("rim", pr + 5, 6, 0, py, 1.2, mat("HALL_portrim", (0.33, 0.36, 0.52), metallic=0.9, rough=0.3))
    cyl("rimhole", pr - 2, 8, 0, py, 1.2, mat("HALL_glass2", (0.01, 0.02, 0.05), rough=0.1))
    # push bar (y = H/2 - 0.61H)
    by = H / 2 - H * 0.61
    bm2 = mat("HALL_bar", (0.42, 0.45, 0.62), metallic=0.95, rough=0.22)
    cyl("bar", 7, W * 0.86, 0, by, 8, bm2, rot=(0, math.pi / 2, 0))
    for bx in (-W * 0.36, W * 0.36):
        box(f"bkt{bx}", 10, 8, 9, bx, by, 4, mat("HALL_bkt", (0.14, 0.15, 0.24), metallic=0.8, rough=0.4))
    # kick plate
    box("kickpl", W * 0.9, 54, 3, 0, -H / 2 + 34, 1.2,
        mapmat("HALL_doorkick", (0.16, 0.17, 0.26), "brushed", bump=0.2, rough=0.35, metallic=0.9), bevel=1.5)


def t_vending(W=256, H=384):
    """SAUCE-O-MATIC: lit header, glowing shelves of sauce cups, coin column.
    Header/side/bin text zones stay quiet — runtime paints the words."""
    rig(key_deg=36, key_energy=2.0)
    body = mapmat("HALL_vendbody", (0.09, 0.11, 0.22), "brushed",
                  bump=0.18, rough=0.4, metallic=0.55, rough_span=0.2)
    plane("shell", W * 1.15, H * 1.05, body)
    rrect_tube("vedge", 0, 0, W - 8, H - 8, 10, 2.6,
               mat("HALL_vframe", (0.04, 0.04, 0.08), rough=0.6), z=1.4)
    # header: backlit red acrylic (text drawn at runtime)
    hm = mat("HALL_vhead", (0.75, 0.13, 0.07), rough=0.35, emit=(1.0, 0.25, 0.12), emit_str=0.7)
    box("head", W - 20, 54, 6, 0, H / 2 - 35, 1.5, hm, bevel=3.0)
    # glass window, left 3/4 (x centered at -22), shelves + cups behind
    gx, gw = -26, W - 68
    gy0 = H / 2 - 72  # window top
    gh = 190
    box("winrec", gw, gh, 3, gx, gy0 - gh / 2, -2.0, mat("HALL_vininterior", (0.015, 0.02, 0.04), rough=0.85))
    accent("winlight", (1.0, 0.9, 0.75), gx, gy0 - 20, 40, energy=90, size=gw * 0.8)
    cupm = mat("HALL_cup", (0.9, 0.87, 0.78), rough=0.5)
    lids = [(0.78, 0.16, 0.14), (0.95, 0.5, 0.2), (0.95, 0.82, 0.2), (0.2, 0.75, 0.4)]
    shm = mat("HALL_shelf", (0.16, 0.19, 0.3), metallic=0.6, rough=0.4)
    for row in range(3):
        sy = gy0 - 28 - row * 60
        box(f"shelf{row}", gw - 12, 4, 10, gx, sy - 22, -0.5, shm)
        for col in range(4):
            cx = gx - (gw - 44) / 2 + col * (gw - 44) / 3
            c = cyl(f"cup{row}{col}", 10, 21, cx, sy - 10, 0.5, cupm, rot=(math.pi / 2, 0, 0), verts=16)
            c.scale = (1, 1, 0.9)
            lm = mat(f"HALL_lid{(col + row) % 4}", lids[(col + row) % 4], rough=0.25)
            cyl(f"lid{row}{col}", 10.5, 2.5, cx, sy + 1, 0.5, lm, rot=(math.pi / 2, 0, 0), verts=16)
    glm = mat("HALL_vglass", (0.05, 0.08, 0.13), rough=0.05, metallic=0.0)
    g = plane("glass", gw, gh, glm, gx, gy0 - gh / 2, 4)
    # coin column on the right
    ccx = W / 2 - 33
    box("col", 34, gh, 5, ccx, gy0 - gh / 2, 0.5, mat("HALL_vcol", (0.05, 0.06, 0.13), rough=0.6), bevel=2.0)
    box("coinslot", 12, 22, 3, ccx, gy0 - 27, 3.4, mat("HALL_vslot", (0.005, 0.005, 0.01), rough=0.5))
    sph("vled", 3.4, ccx, gy0 - 64, 3.6, emis("HALL_vled", NEON["green"], 2.6))
    # dispensing bin
    box("binrec", W - 60, 50, 4, 0, -H / 2 + 66, -1.5, mat("HALL_vbinrec", (0.01, 0.012, 0.025), rough=0.9))
    box("binlip", W - 52, 8, 8, 0, -H / 2 + 38, 2.0, mat("HALL_vbinlip", (0.13, 0.14, 0.22), metallic=0.7, rough=0.4), bevel=2.0)


def t_change(W=128, H=256):
    """The change machine, permanently generous. Header + sticker text = runtime."""
    rig(key_deg=36, key_energy=2.2)
    body = mapmat("HALL_chbody", (0.10, 0.11, 0.17), "brushed",
                  bump=0.2, rough=0.4, metallic=0.75, rough_span=0.2)
    plane("shell", W * 1.15, H * 1.05, body)
    rrect_tube("cedge", 0, 0, W - 6, H - 6, 6, 2.0,
               mat("HALL_chframe", (0.03, 0.03, 0.06), rough=0.6), z=1.2)
    box("chhead", W - 16, 34, 5, 0, H / 2 - 25, 1.5,
        mat("HALL_chheadm", (0.8, 0.55, 0.1), rough=0.4, emit=(1.0, 0.66, 0.12), emit_str=0.55), bevel=2.5)
    sm = mat("HALL_chslot", (0.004, 0.005, 0.01), rough=0.5)
    for i, sy in enumerate((H / 2 - 63, H / 2 - 83)):
        box(f"chs{i}", W * 0.6, 8, 3, 0, sy, 2.2, sm, bevel=1.0)
    box("chret", W * 0.5, 32, 4, 0, -H / 2 + 47, -1.2, mat("HALL_chret", (0.012, 0.015, 0.03), rough=0.9))
    box("chretlip", W * 0.5, 5, 6, 0, -H / 2 + 30, 1.5, mat("HALL_chlip", (0.14, 0.15, 0.24), metallic=0.8, rough=0.35))


def t_marqbase(W=512, H=128):
    """Backlit acrylic marquee blank, rendered warm-white — pack_hall.py tints
    it per game with the c2→c1→c2 gradient; runtime draws icon/title/tag."""
    rig(key_deg=40, key_energy=1.2, fill_energy=0.4)
    pm = mat("HALL_acrylic", (0.92, 0.9, 0.86), rough=0.35, emit=(1.0, 0.98, 0.94), emit_str=0.55)
    plane("panel", W * 1.05, H * 1.05, pm)
    # backlight hotspot: brighter center band, corners fall away
    accent("bl1", (1.0, 0.98, 0.95), 0, 0, 70, energy=900, size=W * 0.5)
    accent("bl2", (1.0, 0.98, 0.95), -W * 0.3, 0, 60, energy=250, size=W * 0.25)
    accent("bl3", (1.0, 0.98, 0.95), W * 0.3, 0, 60, energy=250, size=W * 0.25)
    fm = mat("HALL_marqframe", (0.018, 0.018, 0.04), rough=0.45, metallic=0.3)
    box("ftop", W * 1.05, 10, 12, 0, H / 2 - 5, 3, fm, bevel=2.0)
    box("fbot", W * 1.05, 10, 12, 0, -H / 2 + 5, 3, fm, bevel=2.0)
    box("flft", 10, H * 1.05, 12, -W / 2 + 5, 0, 3, fm, bevel=2.0)
    box("frgt", 10, H * 1.05, 12, W / 2 - 5, 0, 3, fm, bevel=2.0)


def t_sidebase(W=200, H=300):
    """Cabinet flank blank: black laminate + T-molding + floor scuff AO.
    The game's vinyl art (bands/icon/title) draws on top at runtime."""
    rig(key_deg=38, key_energy=2.2)
    accent("spillM", NEON["magenta"], -W * 0.4, H * 0.5, 110, energy=200, size=180)
    lam = mapmat("HALL_sidelam", (0.06, 0.05, 0.11), "wood_grain",
                 bump=0.35, rough=0.55, rough_span=0.3, scale=1.6)
    plane("flank", W * 1.1, H * 1.05, lam)
    tm = emis("HALL_sidemold", (0.75, 0.1, 0.42), 0.5)
    box("moldf", 5, H * 1.05, 4, W / 2 - 4, 0, 1.5, tm)
    box("moldb", 5, H * 1.05, 4, -W / 2 + 4, 0, 1.5, tm)
    # bottom grime gradient = a dark soft box catching no key
    plane("grime", W * 1.1, 40, mat("HALL_sgrime", (0.02, 0.018, 0.04), rough=0.98), 0, -H / 2 + 18, 0.8)


def t_panelbase(W=224, H=112):
    """Control deck with a REAL joystick + two dome buttons (white — pack
    tints per game via the mask passes). Title/players strips stay quiet."""
    rig(key_deg=42, key_energy=2.8)
    accent("spillC", NEON["cyan"], W * 0.4, H * 0.6, 90, energy=180, size=140)
    pm = mapmat("HALL_deck", (0.10, 0.105, 0.17), "brushed",
                bump=0.22, rough=0.4, metallic=0.8, rough_span=0.2)
    plane("deck", W * 1.1, H * 1.1, pm)
    # joystick at (0.24w, 0.52h) image coords -> x = -0.26W, y = -0.02H
    jx, jy = -W * 0.26, -H * 0.02
    cyl("jbase", 26, 6, jx, jy, 1.5, mat("HALL_jbase", (0.03, 0.03, 0.06), rough=0.5), verts=28)
    cyl("jring", 27, 2, jx, jy, 3.6, mat("HALL_jring", (0.2, 0.22, 0.35), metallic=0.85, rough=0.3), verts=28)
    sh = cyl("jshaft", 4.5, 30, jx + 5, jy + 2, 16, mat("HALL_jshaft", (0.05, 0.05, 0.09), metallic=0.6, rough=0.35))
    sh.rotation_euler = (math.radians(-18), math.radians(10), 0)
    sph("BALLTOP", 12, jx + 10, jy + 8, 30, mat("PANEL_BALL", (0.95, 0.95, 0.95), rough=0.25))
    # buttons at 0.6w/0.78w, 0.5h -> x = 0.10W / 0.28W, y = 0
    for tag, bx in (("B1", W * 0.10), ("B2", W * 0.28)):
        cyl(f"brim{tag}", 17, 5, bx, 0, 1.5, mat("HALL_brim", (0.02, 0.02, 0.045), rough=0.45), verts=24)
        d = sph(f"PANEL_{tag}", 13, bx, 0, 4.5, mat(f"PANEL_{tag}", (0.95, 0.95, 0.95), rough=0.28), squash=0.55)
    scm = mat("HALL_pscrew", (0.32, 0.34, 0.45), metallic=0.9, rough=0.35)
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        cyl(f"pscr{sx}{sy}", 2.8, 2, sx * (W / 2 - 8), sy * (H / 2 - 8), 1.2, scm, verts=10)


def _iso_mask(targets):
    """Blackout every material, flash `targets` (material names) white."""
    white = emis("MASK_WHITE", (1, 1, 1), 1.0)
    black = emis("MASK_BLACK", (0, 0, 0), 1.0)
    sc = _scene()
    saved = []
    for o in sc.collection.all_objects:
        if o.type not in ("MESH", "CURVE", "FONT"):
            continue
        slots = o.material_slots
        for sl in slots:
            saved.append((sl, sl.material))
            name = sl.material.name if sl.material else ""
            sl.material = white if name in targets else black
    return saved


def _restore_mask(saved):
    for sl, m in saved:
        sl.material = m


def t_sign(W=1024, H=256):
    """The exterior hero: NUGGET ARCADE — extruded channel letters, a real
    neon border tube, chase bulbs, and a 3D golden nug. Text is BAKED."""
    rig(key_deg=30, key_energy=1.4, fill_energy=0.5)
    bx = mapmat("HALL_signbox", (0.007, 0.007, 0.016), "grain_fine",
                bump=0.25, rough=0.6, scale=1.5)
    plane("boxface", W * 1.02, H * 1.02, bx)
    rrect_tube("border", 0, 0, W - 40, H - 40, 44, 5.0, emis("HALL_signtube", NEON["cyan"], 1.6), z=6)
    # chase bulbs just inside the border
    onm = emis("HALL_bulb_on", (1.0, 0.88, 0.3), 1.3)
    offm = mat("HALL_bulb_off", (0.25, 0.2, 0.08), rough=0.5)
    per = 2 * (W - 112) + 2 * (H - 112)
    for i in range(40):
        d = (i / 40) * per
        if d < W - 112:
            x, y = -W / 2 + 56 + d, H / 2 - 56
        elif (d := d - (W - 112)) < H - 112:
            x, y = W / 2 - 56, H / 2 - 56 - d
        elif (d := d - (H - 112)) < W - 112:
            x, y = W / 2 - 56 - d, -H / 2 + 56
        else:
            d -= W - 112
            x, y = -W / 2 + 56, -H / 2 + 56 + d
        sph(f"bulb{i}", 5, x, y, 8, onm if i % 2 else offm)
    nug_blob("nug", 44, -W / 2 + 108, 0, 26)
    accent("nuglight", (1.0, 0.85, 0.4), -W / 2 + 108, 30, 90, energy=110, size=80)
    ym = mat("HALL_letter_y", (1.0, 0.82, 0.1), rough=0.35, emit=(1.0, 0.86, 0.2), emit_str=0.5)
    mm = mat("HALL_letter_m", (1.0, 0.12, 0.55), rough=0.35, emit=(1.0, 0.15, 0.6), emit_str=0.5)
    t1 = text3d("nugget", "NUGGET", 96, -W * 0.08, H * 0.155, ym, kind="impact", extrude=7, bevel=1.5, z=8, squeeze=0.98)
    t2 = text3d("arcade", "ARCADE", 96, W * 0.12, -H * 0.20, mm, kind="impact", extrude=7, bevel=1.5, z=8, squeeze=0.98)


def _tube_text(name, body, size, x, y, color, strength=1.5, kind="impact", r=2.6, squeeze=1.0):
    """Neon tube lettering: glyph outlines beveled with no fill = real tubes."""
    m = emis("HALL_tube_" + name, color, strength)
    return text3d(name, body, size, x, y, m, kind=kind, extrude=0.0, bevel=r, fill="NONE", z=6, squeeze=squeeze)


def t_open(W=256, H=128):
    rig(key_deg=30, key_energy=0.9, fill_energy=0.4)
    plane("boxface", W * 1.02, H * 1.02,
          mapmat("HALL_openbox", (0.006, 0.007, 0.017), "grain_fine", bump=0.2, rough=0.7, scale=1.5))
    _tube_text("open", "OPEN", 62, 0, H * 0.14, NEON["magenta"], 1.6, r=2.8)
    _tube_text("247", "24/7", 36, 0, -H * 0.26, NEON["cyan"], 1.5, r=2.2)


def t_phrase(W=512, H=128):
    rig(key_deg=30, key_energy=0.9, fill_energy=0.4)
    plane("boxface", W * 1.02, H * 1.02,
          mapmat("HALL_phrasebox", (0.007, 0.006, 0.015), "grain_fine", bump=0.2, rough=0.7, scale=1.5))
    _tube_text("phrase", "HOW MANY NUGS?", 58, 0, 0, NEON["magenta"], 1.6, kind="georgia_i", r=2.4)


def t_highscores(W=512, H=128):
    rig(key_deg=30, key_energy=0.9, fill_energy=0.4)
    plane("boxface", W * 1.02, H * 1.02,
          mapmat("HALL_hsbox", (0.005, 0.009, 0.015), "grain_fine", bump=0.2, rough=0.7, scale=1.5))
    _tube_text("hs", "HIGH SCORES", 54, 0, 0, NEON["green"], 1.6, r=2.4)
    sm = emis("HALL_tube_star", NEON["yellow"], 1.5)
    for sx in (-W * 0.42, W * 0.42):
        pts = []
        for k in range(10):
            r = 16 if k % 2 == 0 else 6.5
            a = k * math.pi / 5 + math.pi / 2
            pts.append((sx + r * math.cos(a), r * math.sin(a)))
        poly_tube(f"star{sx}", pts, 2.0, sm, cyclic=True, z=6)


# ---- street dioramas ---------------------------------------------------------------

def _shop_shell(W, H, sign_h=70):
    """Brick facade shell shared by the three shops (sign strip stays quiet)."""
    plane("mortar", W * 1.2, H * 1.2,
          mapmat("HALL_smortar", (0.045, 0.032, 0.038), "grain_fine", bump=0.5, rough=0.95), z=-3)
    shades = [(0.135, 0.095, 0.11), (0.11, 0.08, 0.095), (0.16, 0.11, 0.12)]
    mats = [mapmat(f"HALL_sbrick{i}", s, "grain_fine", bump=0.75, rough=0.85, scale=1.4)
            for i, s in enumerate(shades)]
    rng = np.random.default_rng(17)
    bw, bh = 32, 16
    for row in range(int(H / bh) + 1):
        off = bw / 2 if row % 2 else 0
        for col in range(-1, int(W / bw) + 1):
            x = col * bw + off + bw / 2 - W / 2
            y = row * bh + bh / 2 - H / 2
            box(f"sb{row}_{col}", bw - 3, bh - 3, 3 + float(rng.uniform(0, 1.0)),
                x, y, 0, mats[int(rng.integers(0, 3))], bevel=1.2)


def t_shopnoodle(W=256, H=224):
    """NOODLE NUG: warm window, a nug slurping at the counter, red awning."""
    rig(key_deg=40, key_energy=1.6)
    _shop_shell(W, H)
    # window: image y 92..202 -> center y = -(147 - H/2) = H/2-147
    wy = H / 2 - 147
    box("winrec", 204, 98, 4, 0, wy, 2.5, mat("HALL_nwin", (0.16, 0.10, 0.03), rough=0.6,
                                              emit=(1.0, 0.72, 0.3), emit_str=0.35))
    accent("warm", (1.0, 0.75, 0.35), 0, wy, 60, energy=220, size=140)
    frm = mat("HALL_nwinfrm", (0.09, 0.05, 0.02), rough=0.6)
    box("winf_t", 216, 6, 8, 0, wy + 52, 4, frm)
    box("winf_b", 216, 6, 8, 0, wy - 52, 4, frm)
    box("winf_l", 6, 110, 8, -105, wy, 4, frm)
    box("winf_r", 6, 110, 8, 105, wy, 4, frm)
    # interior scene in silhouette-brown: counter, the slurper, bowl, steam
    cm = mat("HALL_ncounter", (0.28, 0.17, 0.05), rough=0.7)
    box("counter", 190, 10, 6, 0, wy - 22, 4.5, cm)
    dk = mat("HALL_nsil", (0.21, 0.12, 0.035), rough=0.8)
    sph("head", 17, -8, wy - 3, 5.5, dk)
    box("bodyn", 32, 10, 6, -8, wy - 14, 5, dk)
    cyl("stick1", 1.4, 24, 8, wy + 4, 6, dk, rot=(0, 0, math.radians(-35)))
    bm = mat("HALL_nbowl", (0.85, 0.8, 0.66), rough=0.5)
    box("bowl", 22, 8, 7, 22, wy - 6, 5.5, bm, bevel=2.5)
    stm = emis("HALL_steam", (1.0, 0.9, 0.75), 0.7)
    poly_tube("steam", [(24, wy + 2), (20, wy + 12), (26, wy + 20)], 1.2, stm, z=7)
    # red/white awning: image y ~66..90 -> segments across
    ay = H / 2 - 79
    for i in range(8):
        c = (0.75, 0.13, 0.1) if i % 2 == 0 else (0.9, 0.86, 0.76)
        am = mat(f"HALL_awn{i % 2}", c, rough=0.75)
        b = box(f"awn{i}", 29, 22, 8, -W / 2 + 12 + 29 * i + 14.5, ay, 6, am)
        b.rotation_euler = (math.radians(-28), 0, 0)
    box("awnbar", 232, 5, 5, 0, ay + 12, 9, mat("HALL_awnbar", (0.35, 0.07, 0.05), rough=0.6))
    # sign strip (top ~46px) stays brick — runtime neon text lands there
    accent("signglow", NEON["magenta"], 0, H / 2 - 40, 50, energy=60, size=120)


def t_shoplaundro(W=256, H=224):
    """SUDS & SPUDS: glass front, four washers, one still tumbling."""
    rig(key_deg=40, key_energy=1.6)
    _shop_shell(W, H)
    wy = H / 2 - 143  # glass 84..202
    box("glassrec", 220, 112, 3, 0, wy, 2.0, mat("HALL_lwin", (0.03, 0.05, 0.1), rough=0.3,
                                                 emit=(0.5, 0.75, 0.95), emit_str=0.10))
    accent("cool", (0.65, 0.85, 1.0), 0, wy, 60, energy=170, size=150)
    wm = mat("HALL_washer", (0.16, 0.2, 0.3), metallic=0.5, rough=0.4)
    drm = mat("HALL_wdrum", (0.02, 0.03, 0.07), rough=0.3)
    rimm = mat("HALL_wrim", (0.5, 0.55, 0.7), metallic=0.9, rough=0.25)
    for i in range(4):
        wx = -W / 2 + 36 + i * 52 + 22
        box(f"wash{i}", 44, 58, 12, wx, wy - 16, 4, wm, bevel=3.0)
        cyl(f"wdoor{i}", 15, 4, wx, wy - 12, 10.5, drm, verts=22)
        cyl(f"wrim{i}", 16.5, 2, wx, wy - 12, 11.5, rimm, verts=22)
        if i == 1:
            sudm = emis("HALL_suds", (0.65, 0.8, 1.0), 1.2)
            sph(f"suds{i}", 8, wx - 2, wy - 12, 12.5, sudm, squash=0.5)
    box("bench", 220, 8, 8, 0, wy - 56, 5, mat("HALL_lbench", (0.22, 0.27, 0.36), rough=0.6))
    accent("signglow", NEON["cyan"], 0, H / 2 - 40, 50, energy=60, size=120)


def t_shopgarage(W=256, H=224):
    """GREASE GARAGE, shutter up: warm bay, tool wall, tire stack, THE kart."""
    rig(key_deg=40, key_energy=1.5)
    _shop_shell(W, H)
    by = H / 2 - 147  # bay 90..204
    box("bayrec", 216, 114, 4, 0, by, 1.5, mat("HALL_gbay", (0.14, 0.09, 0.025), rough=0.8,
                                               emit=(1.0, 0.7, 0.3), emit_str=0.16))
    accent("bay", (1.0, 0.8, 0.45), 0, by + 10, 55, energy=200, size=130)
    # rolled shutter under the lintel
    sm = mat("HALL_shutter", (0.22, 0.2, 0.17), metallic=0.6, rough=0.5)
    c = cyl("roll", 9, 214, 0, H / 2 - 82, 8, sm, rot=(0, math.pi / 2, 0))
    # work light on a cord
    cyl("cord", 0.8, 16, 0, by + 44, 6, mat("HALL_cord", (0.02, 0.02, 0.03), rough=0.9))
    sph("bulb", 6, 0, by + 34, 7, emis("HALL_worklight", (1.0, 0.85, 0.55), 3.2))
    # tool wall
    twm = mat("HALL_toolwall", (0.1, 0.065, 0.02), rough=0.85)
    box("tools", 52, 60, 3, -W / 2 + 52, by + 14, 3.5, twm)
    tm = mat("HALL_tool", (0.5, 0.55, 0.7), metallic=0.9, rough=0.3)
    rng = np.random.default_rng(21)
    for i in range(6):
        box(f"tool{i}", 4, 16, 2, -W / 2 + 34 + (i % 3) * 15, by + 30 - (i // 3) * 24, 5.5, tm)
    # tire stack
    tirem = mat("HALL_tire", (0.035, 0.035, 0.045), rough=0.9)
    for i in range(3):
        t = cyl(f"tire{i}", 17, 9, W / 2 - 42, by - 40 + i * 11, 4 + i * 2, tirem, verts=20)
        t.rotation_euler = (math.radians(78), 0, 0)
    # THE kart: green body, fat tires, nose to the street
    km = mat("HALL_kart", (0.04, 0.48, 0.23), rough=0.35, metallic=0.3)
    kt = mat("HALL_karttrim", (0.22, 1.0, 0.48), rough=0.3, emit=(0.22, 1.0, 0.48), emit_str=0.8)
    box("kartbody", 94, 18, 12, 11, by - 40, 6, km, bevel=3.0)
    box("kartstripe", 94, 4, 2, 11, by - 33, 12.5, kt)
    box("spoiler", 30, 4, 3, -24, by - 26, 14, kt)
    wt = mat("HALL_kwheel", (0.03, 0.03, 0.04), rough=0.85)
    for wx in (-31, 37):
        c = cyl(f"kw{wx}", 9, 10, wx + 11, by - 48, 5, wt, rot=(0, math.pi / 2, 0), verts=18)
    sph("headlight", 3.4, 58, by - 38, 9, emis("HALL_khl", (1.0, 0.9, 0.3), 3.0))
    accent("signglow", NEON["green"], 0, H / 2 - 30, 50, energy=60, size=120)


def t_across(W=512, H=192):
    """The far side of the street: building row, lit windows, fire escapes."""
    rig(key_deg=32, key_energy=0.42, fill_energy=0.30, fill_color=(0.35, 0.45, 0.9))
    plane("sky", W * 1.05, H * 1.05,
          mat("HALL_sky", (0.014, 0.018, 0.055), rough=1.0), z=-30)
    rng = np.random.default_rng(13)
    warm = emis("HALL_win_warm", (1.0, 0.8, 0.5), 1.15)
    cool = emis("HALL_win_cool", (0.55, 0.7, 1.0), 0.85)
    dark = mat("HALL_win_dark", (0.03, 0.04, 0.07), rough=0.3)
    fm = mat("HALL_fire", (0.05, 0.05, 0.08), metallic=0.6, rough=0.6)
    for i in range(9):
        bw = 42 + ((i * 37) % 46)
        bh = 60 + ((i * 53) % 90)
        bx = i * 58 - W / 2 + bw / 2
        shade = (0.016, 0.020, 0.042) if i % 2 else (0.023, 0.029, 0.055)
        bm = mapmat(f"HALL_bldg{i}", shade, "grain_coarse", bump=0.35, rough=0.85, scale=1.2)
        box(f"bldg{i}", bw, bh, 14 + (i % 3) * 6, bx, -H / 2 + bh / 2, 0, bm)
        for z in range(10):
            if (z * 7 + i * 13) % 3 == 0:
                wm2 = warm if (z * 11 + i) % 7 == 0 else (cool if (z + i) % 3 else dark)
                box(f"win{i}_{z}", 6, 9, 2, bx - bw / 2 + 10 + (z % 3) * 12,
                    -H / 2 + bh - 14 - (z // 3) * 18, (14 + (i % 3) * 6) / 2 + 0.5, wm2)
        if i % 3 == 1:
            for r in range(3):
                box(f"fe{i}_{r}", bw * 0.5, 2, 3, bx, -H / 2 + bh * 0.3 + r * 16, (14 + (i % 3) * 6) / 2 + 2, fm)
    # rooftop water tank
    wt = cyl("tank", 14, 26, W * 0.22, -H / 2 + 152, 4, mat("HALL_tank", (0.06, 0.045, 0.04), rough=0.8), verts=16)
    # the distant NUGGETOWN smudge — a soft magenta glow, letters at runtime? no:
    # the painter bakes it; here a glowing panel reads as the distant sign
    box("smudge", 74, 12, 2, W * 0.32, -H * 0.08, 6, emis("HALL_smudge", (1.0, 0.3, 0.6), 1.1))


def t_carnose(W=128, H=64):
    """The double-parked compact, head on: grille, bumper, headlight pods.
    Flat sw_carRed was the single most-looked-at surface on the street."""
    rig(key_deg=38, key_energy=2.4)
    accent("streetlamp", (1.0, 0.85, 0.55), 0, H * 0.7, 70, energy=180, size=90)
    paint = mapmat("HALL_carpaint", (0.52, 0.09, 0.06), "grain_fine",
                   bump=0.12, rough=0.28, metallic=0.45, scale=0.8)
    plane("panel", W * 1.2, H * 1.2, paint)
    # hood shut-line + a shallow power bulge
    box("shutline", W * 1.2, 2.0, 1.2, 0, H * 0.30, 0.6,
        mat("HALL_carshut", (0.06, 0.012, 0.01), rough=0.6))
    box("bulge", W * 0.52, 18, 3.0, 0, H * 0.12, 1.2, paint, bevel=4.0)
    # grille: slats between two headlight pods
    box("grille", W * 0.44, 15, 3.5, 0, -H * 0.06, -1.0,
        mat("HALL_grille", (0.02, 0.02, 0.028), rough=0.75))
    gm = mat("HALL_slat", (0.13, 0.13, 0.16), metallic=0.8, rough=0.4)
    for i in range(4):
        box(f"slat{i}", W * 0.42, 1.8, 2.0, 0, -H * 0.06 + 5.4 - i * 3.6, 0.4, gm)
    hl = mat("HALL_headlamp", (0.85, 0.85, 0.78), rough=0.12, metallic=0.2,
             emit=(1.0, 0.95, 0.8), emit_str=0.55)
    for hx in (-W * 0.33, W * 0.33):
        box(f"pod{hx}", 22, 13, 4.0, hx, -H * 0.05, 0.8,
            mat("HALL_podrim", (0.05, 0.05, 0.06), rough=0.5), bevel=2.0)
        box(f"lamp{hx}", 17, 9, 3.0, hx, -H * 0.05, 2.6, hl, bevel=1.5)
    # bumper across the bottom, with a scuff it earned
    box("bumper", W * 1.2, 12, 6.0, 0, -H * 0.36, 2.0,
        mapmat("HALL_bumper", (0.10, 0.10, 0.12), "brushed", bump=0.2,
               rough=0.42, metallic=0.85), bevel=2.5)
    plane("scuff", 26, 4, mat("HALL_carscuff", (0.03, 0.03, 0.035), rough=0.95),
          -W * 0.22, -H * 0.36, 5.2)


def t_carroof(W=128, H=64):
    """Roof/hood sheet seen from above: wet paint, a seam, rain beading."""
    rig(key_deg=58, key_energy=2.0)
    accent("lamp", (1.0, 0.86, 0.6), -W * 0.3, H * 0.4, 80, energy=220, size=110)
    paint = mapmat("HALL_carroof", (0.50, 0.085, 0.055), "grain_fine",
                   bump=0.1, rough=0.22, metallic=0.5, scale=0.7)
    plane("sheet", W * 1.2, H * 1.2, paint)
    box("seam", 2.0, H * 1.2, 1.0, 0, 0, 0.5,
        mat("HALL_roofseam", (0.05, 0.01, 0.008), rough=0.6))
    bead = mat("HALL_bead", (0.6, 0.65, 0.75), rough=0.05, metallic=0.1)
    rng = np.random.default_rng(71)
    for i in range(34):
        sph(f"bead{i}", float(rng.uniform(0.8, 2.0)),
            float(rng.uniform(-W / 2, W / 2)), float(rng.uniform(-H / 2, H / 2)),
            0.9, bead, squash=0.45)


def t_carglass(W=128, H=64):
    """Cabin glass: near-black, but it REFLECTS — a streetlamp smear and the
    faint shape of a headrest nobody is using."""
    rig(key_deg=30, key_energy=1.4)
    accent("lamp", (1.0, 0.88, 0.62), -W * 0.28, H * 0.55, 60, energy=260, size=70)
    accent("neon", NEON["magenta"], W * 0.42, -H * 0.2, 55, energy=90, size=60)
    glass = mapmat("HALL_carglass", (0.012, 0.014, 0.03), "grain_fine",
                   bump=0.05, rough=0.06, metallic=0.25, scale=0.6)
    plane("pane", W * 1.2, H * 1.2, glass)
    box("headrest", 20, 13, 2.0, W * 0.12, -H * 0.10, 1.0,
        mat("HALL_headrest", (0.035, 0.033, 0.045), rough=0.85), bevel=3.0)
    box("pillar", 7, H * 1.2, 3.0, -W * 0.46, 0, 1.4,
        mat("HALL_pillar", (0.05, 0.012, 0.01), rough=0.5))


# ---- the street regulars (character skins — wrap the NPC meshes) -------------------
# The five NPCs are real 3D geometry in arcade.js (blob3/box3/tube3); these
# textures wrap those meshes, so bake MATERIAL, not lighting direction: soft
# high key, relief from geometry bumps, seamless left-right (cylinder wraps).

def t_nugskin(W=96, H=96):
    """Crispy breading: golden crust with REAL crumb geometry."""
    rig(key_deg=52, key_energy=2.6, key_color=(1.0, 0.9, 0.7), fill_energy=1.0)
    base = mapmat("HALL_crust", (0.72, 0.44, 0.12), "grain_fine",
                  bump=1.0, rough=0.65, rough_span=0.3, scale=1.0)
    plane("skin", W * 1.2, H * 1.2, base)
    rng = np.random.default_rng(37)
    crumbs = [mat("HALL_crumb_d", (0.45, 0.24, 0.06), rough=0.8),
              mat("HALL_crumb_l", (0.9, 0.66, 0.28), rough=0.55),
              mat("HALL_crumb_g", (0.98, 0.8, 0.4), rough=0.45)]
    for i in range(64):
        px = float(rng.uniform(-W / 2, W / 2))
        py = float(rng.uniform(-H / 2, H / 2))
        r = float(rng.uniform(1.6, 4.2))
        m = crumbs[int(rng.integers(0, 3))]
        for ox in (-W, 0, W):
            for oy in (-H, 0, H):
                if abs(px + ox) > W / 2 + 8 or abs(py + oy) > H / 2 + 8:
                    continue
                sph(f"cr{i}_{ox}_{oy}", r, px + ox, py + oy, r * 0.35, m, squash=0.55)


def t_hoodcloth(W=64, H=64):
    """The Hooded Nug's hood: worn twill weave, threadbare in places."""
    rig(key_deg=48, key_energy=2.2, fill_energy=0.8)
    base = mapmat("HALL_twill", (0.135, 0.135, 0.21), "fabric",
                  bump=0.9, rough=0.9, scale=1.0)
    plane("cloth", W * 1.2, H * 1.2, base)
    tm = mat("HALL_thread", (0.28, 0.28, 0.42), rough=0.85)
    for i in range(8):
        y = i * 8 - W / 2 + 4
        c = cyl(f"weft{i}", 0.9, W * 1.2, 0, y, 0.8, tm, rot=(0, math.pi / 2, 0), verts=8)
    for i in range(8):
        x = i * 8 - W / 2 + 4
        cyl(f"warp{i}", 0.9, H * 1.2, x, 0, 1.3, tm, rot=(math.pi / 2, 0, 0), verts=8)
    dm = mat("HALL_wear", (0.05, 0.05, 0.09), rough=0.98)
    rng = np.random.default_rng(43)
    for i in range(5):
        plane(f"wear{i}", float(rng.uniform(6, 14)), float(rng.uniform(3, 7)), dm,
              float(rng.uniform(-W / 2, W / 2)), float(rng.uniform(-H / 2, H / 2)), 1.8)


def t_cupgravy(W=192, H=96):
    """Gravy Jones: waxed paper cup wall (u=around, v=top->bottom). The brown
    band is baked; the GRAVY lettering stays runtime, on top, twice around."""
    rig(key_deg=40, key_energy=2.4, fill_energy=0.9)
    paper = mapmat("HALL_cuppaper", (0.83, 0.79, 0.7), "grain_fine",
                   bump=0.3, rough=0.55, rough_span=0.2, scale=2.0)
    plane("cupwall", W * 1.2, H * 1.2, paper)
    seam = mat("HALL_cupseam", (0.6, 0.55, 0.44), rough=0.7)
    for x in range(-W // 2, W // 2 + 1, 24):
        box(f"seam{x}", 2, H * 1.2, 1.2, x, 0, 0.6, seam)
    # the band: image v 0.42..0.72 -> y from H*(0.5-0.42)=7.7 down to -21
    bandm = mapmat("HALL_cupband", (0.36, 0.22, 0.08), "grain_fine",
                   bump=0.25, rough=0.6, scale=2.0)
    box("band", W * 1.2, H * 0.3, 2, 0, H * (0.5 - 0.57), 1.0, bandm)
    # coffee-ring of age near the top
    rm = mat("HALL_cupring", (0.5, 0.36, 0.16), rough=0.7)
    pts = [(W * 0.0 + 8 * math.cos(a), H * 0.3 + 8 * math.sin(a)) for a in np.linspace(0, 6.283, 14, endpoint=False)]
    poly_tube("ring", pts, 0.9, rm, cyclic=True, z=1.2)


def t_henwhite(W=64, H=64):
    """Henrietta: shingled white feathers, soft and dimensional."""
    rig(key_deg=50, key_energy=2.4, key_color=(1.0, 0.97, 0.9), fill_energy=1.1)
    plane("down", W * 1.2, H * 1.2, mapmat("HALL_down", (0.82, 0.78, 0.66), "fabric",
                                           bump=0.35, rough=0.8, scale=3.0))
    fm = mat("HALL_feather", (0.94, 0.91, 0.82), rough=0.7)
    fm2 = mat("HALL_feather2", (0.87, 0.83, 0.7), rough=0.75)
    rng = np.random.default_rng(29)
    for row in range(5):
        for col in range(5):
            px = col * 13 + (6.5 if row % 2 else 0) - W / 2 + 6
            py = row * 13 - H / 2 + 6
            for ox in (-W, 0, W):
                for oy in (-H, 0, H):
                    if abs(px + ox) > W / 2 + 10 or abs(py + oy) > H / 2 + 10:
                        continue
                    f = sph(f"f{row}{col}_{ox}_{oy}", 7.5, px + ox, py + oy, 1.2,
                            fm if (row + col) % 2 else fm2, squash=0.35)
                    f.scale = (0.75, 1.15, 0.35)
                    f.rotation_euler = (0, 0, float(rng.uniform(-0.25, 0.25)))


def t_pickle(W=64, H=64):
    """Det. Dill: glossy warty pickle skin."""
    rig(key_deg=46, key_energy=2.6, key_color=(0.95, 1.0, 0.85), fill_energy=0.9)
    base = mapmat("HALL_dillskin", (0.16, 0.30, 0.09), "grain_coarse",
                  bump=0.5, rough=0.35, rough_span=0.25, scale=1.6)
    plane("skin", W * 1.2, H * 1.2, base)
    wm = mat("HALL_wart", (0.5, 0.62, 0.28), rough=0.4)
    wm2 = mat("HALL_wart2", (0.1, 0.2, 0.06), rough=0.45)
    rng = np.random.default_rng(53)
    for i in range(40):
        px = float(rng.uniform(-W / 2, W / 2))
        py = float(rng.uniform(-H / 2, H / 2))
        r = float(rng.uniform(1.0, 2.4))
        m = wm if i % 3 else wm2
        for ox in (-W, 0, W):
            for oy in (-H, 0, H):
                if abs(px + ox) > W / 2 + 5 or abs(py + oy) > H / 2 + 5:
                    continue
                sph(f"w{i}_{ox}_{oy}", r, px + ox, py + oy, r * 0.5, m, squash=0.7)


# ---- registry / entry points --------------------------------------------------------

ASSETS = {
    # hall
    "carpet": (t_carpet, 448, 448),
    "wall": (t_wall, 256, 256),
    "wainscot": (t_wainscot, 256, 128),
    "ceiling": (t_ceiling, 256, 256),
    "brick": (t_brick, 256, 256),
    "sidewalk": (t_sidewalk, 256, 256),
    "metal": (t_metal, 128, 128),
    "dark": (t_dark, 128, 128),
    "cabFront": (t_cabfront, 256, 256),
    "bezel": (t_bezel, 256, 192),
    "door": (t_door, 192, 448),
    "vending": (t_vending, 256, 384),
    "change": (t_change, 128, 256),
    "marqBase": (t_marqbase, 512, 128),
    "sideBase": (t_sidebase, 200, 300),
    "panelBase": (t_panelbase, 224, 112),
    "sign": (t_sign, 1024, 256),
    "open": (t_open, 256, 128),
    "phrase": (t_phrase, 512, 128),
    "highscores": (t_highscores, 512, 128),
    # street
    "road": (t_road, 192, 192),
    "pierWood": (t_pierwood, 128, 128),
    "water": (t_water, 128, 128),
    "shopNoodle": (t_shopnoodle, 256, 224),
    "shopLaundro": (t_shoplaundro, 256, 224),
    "shopGarage": (t_shopgarage, 256, 224),
    "across": (t_across, 512, 192),
    # the street: the double-parked compact (was three flat swatches)
    "carNose": (t_carnose, 128, 64),
    "carRoof": (t_carroof, 128, 64),
    "carGlass": (t_carglass, 128, 64),
    # the street regulars (NPC skins)
    "nugSkin": (t_nugskin, 96, 96),
    "hoodCloth": (t_hoodcloth, 64, 64),
    "cupGravy": (t_cupgravy, 192, 96),
    "henWhite": (t_henwhite, 64, 64),
    "pickle": (t_pickle, 64, 64),
}


def render_one(name, out_dir=None):
    out_dir = out_dir or OUT_DEFAULT
    fn, w, h = ASSETS[name]
    _wipe()
    _noise_maps()
    fn()
    path = shot(name, w, h, out_dir)
    # panelBase also emits the tint masks for pack_hall.py
    if name == "panelBase":
        for tag, targets in (("ball", {"PANEL_BALL"}), ("b1", {"PANEL_B1"}), ("b2", {"PANEL_B2"})):
            saved = _iso_mask(targets)
            shot(f"panelBase_mask_{tag}", w, h, out_dir)
            _restore_mask(saved)
    return path


# ---- THE POWER PLANT: material map passes -------------------------------------
# For a year this rig has thrown away everything it knew about a surface except
# its colour, because colour was all the hall could display. It can display more
# now (js/arcade.js, the WebGL2 material shader), so render the rest.
#
# TWO EXTRA PASSES PER ASSET, both through the same ortho camera as the colour
# pass, so all three land in perfect register:
#
#   _n   the NORMAL pass. Not a filter run over the colour render — the actual
#        shading normal of the actual modelled geometry, bump included. The
#        camera looks down -Z at a flat subject, so world normals ARE tangent
#        space here and the encode is a plain n*0.5+0.5.
#   _s   the ORM pass. Every material's surface is temporarily rewired to an
#        emission of (roughness, metallic, pbr-opt-in) and the scene is
#        rendered flat. Emissive materials report pbr=0: neon does not get a
#        specular highlight painted on it, it IS the light.
#
# Why a compositor File Output for the normal and a material swap for the ORM:
# the normal pass must keep the real materials (their bump chains are half the
# surface detail, and a material_override would delete them), while roughness
# and metalness are per-material CONSTANTS that no render pass exposes.

def _encode_normal(nt, vec_socket, out_node):
    """Wire a normal vector -> emission -> material output, encoded 0..1."""
    enc = nt.nodes.new("ShaderNodeVectorMath")
    enc.name = "NRM_ENC"
    enc.operation = "MULTIPLY_ADD"
    enc.inputs[1].default_value = (0.5, 0.5, 0.5)
    enc.inputs[2].default_value = (0.5, 0.5, 0.5)
    em = nt.nodes.new("ShaderNodeEmission")
    em.name = "NRM_TMP"
    em.inputs[1].default_value = 1.0
    nt.links.new(vec_socket, enc.inputs[0])
    nt.links.new(enc.outputs[0], em.inputs[0])
    nt.links.new(em.outputs[0], out_node.inputs[0])
    return [enc.name, em.name]


def _normal_swap(sc):
    """Rewire every material to emit its own SHADING normal.

    The important part is where the vector comes from. Half these materials get
    their surface detail from a Bump node driving the Principled's Normal input
    (mapmat + the wrapped-fBm grain maps) — that bump IS the brick's mortar and
    the carpet's pile, and a plain geometry normal would throw all of it away.
    So: use whatever is plugged into the BSDF's Normal socket if anything is,
    and fall back to the raw geometry normal only for materials with no bump.
    """
    saved = []
    seen = set()
    for ob in sc.collection.all_objects:
        for slot in getattr(ob, "material_slots", []):
            m = slot.material
            if not m or m.name in seen:
                continue
            seen.add(m.name)
            nt = getattr(m, "node_tree", None)
            if not nt:
                continue
            out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
            if not out:
                continue
            prev = [(l.from_node.name, l.from_socket.name) for l in out.inputs[0].links]
            src = None
            bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf and "Normal" in bsdf.inputs and bsdf.inputs["Normal"].links:
                src = bsdf.inputs["Normal"].links[0].from_socket
            if src is None:
                geo = nt.nodes.new("ShaderNodeNewGeometry")
                geo.name = "NRM_GEO"
                src = geo.outputs["Normal"]
            for l in list(out.inputs[0].links):
                nt.links.remove(l)
            tmp = _encode_normal(nt, src, out)
            if src.node.name == "NRM_GEO":
                tmp.append("NRM_GEO")
            saved.append((m, tmp, prev, out.name))
    return saved


def _mat_pbr(m):
    """(roughness, metallic, pbr-opt-in) for a material, read off its BSDF."""
    rough, metal, lit = 0.7, 0.0, 1.0
    nt = getattr(m, "node_tree", None)
    if not nt:
        return rough, metal, lit
    for n in nt.nodes:
        if n.type == "EMISSION":
            return 0.9, 0.0, 0.0            # it is a light, not a surface
        if n.type == "BSDF_PRINCIPLED":
            try:
                rough = float(n.inputs["Roughness"].default_value)
                metal = float(n.inputs["Metallic"].default_value)
            except Exception:
                pass
            try:
                es = float(n.inputs["Emission Strength"].default_value)
                ec = n.inputs["Emission Color"].default_value
                if es > 0.01 and max(ec[0], ec[1], ec[2]) > 0.01:
                    lit = 0.0               # emissive Principled: same rule
            except Exception:
                pass
    return rough, metal, lit


def _orm_swap(sc):
    """Rewire every material in the scene to emit its own ORM triple.
    Returns the undo list."""
    saved = []
    seen = set()
    for ob in sc.collection.all_objects:
        for slot in getattr(ob, "material_slots", []):
            m = slot.material
            if not m or m.name in seen:
                continue
            seen.add(m.name)
            nt = getattr(m, "node_tree", None)
            if not nt:
                continue
            out = None
            for n in nt.nodes:
                if n.type == "OUTPUT_MATERIAL":
                    out = n
                    break
            if not out:
                continue
            prev = [(l.from_node.name, l.from_socket.name) for l in out.inputs[0].links]
            r, g_, b = _mat_pbr(m)
            em = nt.nodes.new("ShaderNodeEmission")
            em.name = "ORM_TMP"
            em.inputs[0].default_value = (r, g_, b, 1.0)
            em.inputs[1].default_value = 1.0
            for l in list(out.inputs[0].links):
                nt.links.remove(l)
            nt.links.new(em.outputs[0], out.inputs[0])
            saved.append((m, [em.name], prev, out.name))
    return saved


def _swap_restore(saved):
    """Undo _orm_swap / _normal_swap: drop the temp nodes, relink the original."""
    for m, tmp_names, prev, outname in saved:
        nt = m.node_tree
        out = nt.nodes.get(outname)
        if out:
            for l in list(out.inputs[0].links):
                nt.links.remove(l)
            for src_name, sock in prev:
                src = nt.nodes.get(src_name)
                if src:
                    nt.links.new(src.outputs[sock], out.inputs[0])
        for nm in tmp_names:
            n = nt.nodes.get(nm)
            if n:
                nt.nodes.remove(n)


def render_maps_one(name, out_dir=None):
    """Normal + ORM for one asset, through the same camera as the colour pass
    so all three land in perfect register."""
    out_dir = out_dir or OUT_DEFAULT
    map_dir = os.path.join(out_dir, "mat")
    os.makedirs(map_dir, exist_ok=True)
    fn, w, h = ASSETS[name]
    _wipe()
    _noise_maps()
    fn()
    sc = _scene()

    # Both passes are DATA, not pictures. Standard view transform would push
    # every value through the sRGB curve on its way to the PNG and quietly bend
    # every normal vector and every roughness in the set.
    vt_prev, world_prev = sc.view_settings.view_transform, sc.world
    sc.world = None
    try:
        sc.view_settings.view_transform = "Raw"
    except Exception:
        sc.view_settings.view_transform = "Standard"
    try:
        saved = _normal_swap(sc)
        try:
            shot(name + "_n", w, h, map_dir)
        finally:
            _swap_restore(saved)
        saved = _orm_swap(sc)
        try:
            shot(name + "_s", w, h, map_dir)
        finally:
            _swap_restore(saved)
    finally:
        sc.view_settings.view_transform = vt_prev
        sc.world = world_prev
    return map_dir


def render_maps(out_dir=None, only=None):
    out_dir = out_dir or OUT_DEFAULT
    names = only or list(ASSETS)
    for n in names:
        render_maps_one(n, out_dir)
        print("mapped", n)
    print(f"render_maps: {len(names)} assets -> {os.path.join(out_dir, 'mat')}")
    return os.path.join(out_dir, "mat")


def render_all(out_dir=None):
    out_dir = out_dir or OUT_DEFAULT
    done = []
    for name in ASSETS:
        done.append(render_one(name, out_dir))
        print("rendered", name)
    print(f"render_all: {len(done)} assets -> {out_dir}")
    return done


def build_library(out_dir=None):
    """One hall_textures.blend: every asset in its own scene, camera + lights
    included, so any texture can be reopened, art-directed, re-rendered."""
    out_dir = out_dir or os.path.join(REPO, "blender")
    global_sc = None
    for name in ASSETS:
        fn, w, h = ASSETS[name]
        sc = bpy.data.scenes.get("HALLRIG")
        if sc:
            sc.name = "HALLRIG_tmp"
        _wipe(bpy.data.scenes.get("HALLRIG_tmp")) if bpy.data.scenes.get("HALLRIG_tmp") else None
        sc = bpy.data.scenes.new("HALLRIG")
        try:
            bpy.context.window.scene = sc
        except Exception:
            pass
        _noise_maps()
        fn()
        sc.name = "hall_" + name
        cam = sc.camera
        if cam:
            cam.data.ortho_scale = w
        sc.render.resolution_x = w * SS
        sc.render.resolution_y = h * SS
    path = os.path.join(out_dir, "hall_textures.blend")
    bpy.ops.wm.save_as_mainfile(filepath=path)
    print("library saved:", path)
    return path


if __name__ == "__main__":
    # headless: blender --background --python hallrig.py -- [render_all|render_one <name>|library]
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not argv or argv[0] == "render_all":
        render_all()
    elif argv[0] == "render_one":
        for n in argv[1:]:
            render_one(n)
    elif argv[0] == "render_maps":
        render_maps(only=argv[1:] or None)
    elif argv[0] == "library":
        render_all()
        build_library()
