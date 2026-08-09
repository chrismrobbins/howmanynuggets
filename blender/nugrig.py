"""NUGRIG — the GTN art department's Blender factory (FRESH PAINT, Season 2.5).

Every sprite in js/gtaArt.js is born here: parametric 3D builds of the
Nuggetown fleet, citizens, ground tiles, and street props, rendered
top-down at 8x supersample the way DMA rendered GTA 1's cars.

Three entry points (run inside Blender's Python console, or headless):

    import nugrig
    nugrig.render_all(r"C:/path/to/renders")   # re-render every sprite PNG
    nugrig.build_library(r"C:/repo/blender")   # rebuild the 4 .blend files
    nugrig.export_gltf(r"C:/path/to/glb")      # one .glb per collection (Unreal etc.)

After render_all, run blender/pack_atlas.py (plain Python, needs Pillow +
numpy) to regrade/downscale/pack and regenerate js/gtaArt.js.

Conventions: 1 Blender unit = 1 game pixel. Vehicles/peds face +Y (sprite
"up"); the engine rotates them with ctx.rotate. Materials named PAINT_*
become the runtime tint mask (white = tintable paint).
"""
import math
import os
import random

import bpy

SS = 8  # supersample factor

CAR_DIMS = {"compact": (19, 10), "sedan": (22, 11), "sports": (20, 10),
            "bus": (34, 12), "tanker": (32, 12), "cruiser": (20, 10),
            "van": (26, 13)}
PED_POSES = ("idle", "walk0", "walk1", "flee0", "flee1", "daze")
TILE = 24
PED_CV = 15


# ---- scene / render rig ----------------------------------------------------

def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)


def rig_setup():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        try:
            sc.render.engine = "BLENDER_EEVEE"
        except Exception:
            sc.render.engine = "CYCLES"
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"  # punchy colors at sprite scale
    sc.view_settings.look = "None"
    w = bpy.data.worlds.get("NugNight") or bpy.data.worlds.new("NugNight")
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.012, 0.02, 0.05, 1.0)
    bg.inputs[1].default_value = 1.0
    sc.world = w
    key = bpy.data.objects.get("NugKey")
    if not key:
        ld = bpy.data.lights.new("NugKey", "SUN")
        key = bpy.data.objects.new("NugKey", ld)
        bpy.context.collection.objects.link(key)
    key.data.color = (1.0, 0.88, 0.66)       # warm streetlight key
    key.data.energy = 3.2
    key.data.angle = math.radians(15)
    key.rotation_euler = (math.radians(18), math.radians(-12), 0)
    fill = bpy.data.objects.get("NugFill")
    if not fill:
        ld2 = bpy.data.lights.new("NugFill", "SUN")
        fill = bpy.data.objects.new("NugFill", ld2)
        bpy.context.collection.objects.link(fill)
    fill.data.color = (0.45, 0.62, 1.0)       # cool moon rim
    fill.data.energy = 1.1
    fill.data.angle = math.radians(30)
    fill.rotation_euler = (math.radians(-35), math.radians(20), 0)
    cam = bpy.data.objects.get("NugCam")
    if not cam:
        cd = bpy.data.cameras.new("NugCam")
        cam = bpy.data.objects.new("NugCam", cd)
        bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.sensor_fit = "HORIZONTAL"
    cam.location = (0, 0, 80)
    cam.rotation_euler = (0, 0, 0)
    cam.data.clip_start = 0.1
    cam.data.clip_end = 400
    sc.camera = cam
    try:
        sc.eevee.use_raytracing = True  # EEVEE-Next (4.2+)
    except Exception:
        pass
    return sc.render.engine


def rig_tiles():
    """Tile-pass lighting: a lower, raking key so ground relief casts real
    shadows. v2 lesson: 58-degree rake made wallpaper; 44 is the sweet spot."""
    rig_setup()
    key = bpy.data.objects["NugKey"]
    key.rotation_euler = (math.radians(44), math.radians(-12), 0)
    key.data.energy = 4.2
    key.data.angle = math.radians(8)
    bpy.data.objects["NugFill"].data.energy = 1.0


def shot(name, w_px, h_px, render_dir):
    sc = bpy.context.scene
    cam = bpy.data.objects["NugCam"]
    cam.data.ortho_scale = w_px
    sc.render.resolution_x = w_px * SS
    sc.render.resolution_y = h_px * SS
    sc.render.resolution_percentage = 100
    os.makedirs(render_dir, exist_ok=True)
    sc.render.filepath = os.path.join(render_dir, name + ".png")
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


# ---- materials ---------------------------------------------------------------

def mat(name, color, metallic=0.0, rough=0.6, emit=None, emit_str=0.0, alpha=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    if emit is not None:
        try:
            bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emit_str
        except KeyError:
            bsdf.inputs["Emission"].default_value = (*emit, 1.0)
    return m


def emis(name, color):
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
    em.inputs[1].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def bumpmat(name, color, rough=0.8, noise_scale=8.0, bump=0.4, detail=4.0, metallic=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = noise_scale
    tex.inputs["Detail"].default_value = detail
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = bump
    nt.links.new(tex.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], bsdf.inputs["Normal"])
    return m


# ---- geometry helpers --------------------------------------------------------

def box(name, sx, sy, sz, x=0, y=0, z=0, m=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        bv = o.modifiers.new("bv", "BEVEL")
        bv.width = bevel
        bv.segments = 3
        bv.limit_method = "ANGLE"
    if m:
        o.data.materials.append(m)
    return o


def cyl(name, r, depth, x=0, y=0, z=0, m=None, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth,
                                        location=(x, y, z), rotation=rot)
    o = bpy.context.active_object
    o.name = name
    if m:
        o.data.materials.append(m)
    return o


def sph(name, r, x=0, y=0, z=0, m=None, squash=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=r,
                                         location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    if squash != 1.0:
        o.scale = (1, 1, squash)
        bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.shade_smooth()
    if m:
        o.data.materials.append(m)
    return o


def plane(name, s, m, x=0, y=0, z=0):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    o.scale = (s, s, 1)
    bpy.ops.object.transform_apply(scale=True)
    if m:
        o.data.materials.append(m)
    return o


def gridplane(name, s, m, subdiv=48, disp=0.0, disp_scale=6.0, z=0):
    """Subdivided plane with clouds displacement — real relief, not just bump."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=subdiv, y_subdivisions=subdiv,
                                    size=1, location=(0, 0, z))
    o = bpy.context.active_object
    o.name = name
    o.scale = (s, s, 1)
    bpy.ops.object.transform_apply(scale=True)
    if disp > 0:
        tex = bpy.data.textures.get("disp_" + name) or bpy.data.textures.new("disp_" + name, "CLOUDS")
        tex.noise_scale = disp_scale
        md = o.modifiers.new("disp", "DISPLACE")
        md.texture = tex
        md.strength = disp
        md.mid_level = 0.5
    if m:
        o.data.materials.append(m)
    return o


def stain_mat(name, dark=0.15, alpha_max=0.45):
    """Soft radial stain decal (oil, grime): dark center fading to nothing."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.blend_method = "BLEND"
    try:
        m.shadow_method = "NONE"
    except Exception:
        pass
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (dark * 0.2, dark * 0.18, dark * 0.16, 1)
    bsdf.inputs["Roughness"].default_value = 0.25
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    mapn = nt.nodes.new("ShaderNodeMapping")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0, 0, 0, 0)
    ramp.color_ramp.elements[1].position = 0.9
    ramp.color_ramp.elements[1].color = (alpha_max, alpha_max, alpha_max, 1)
    nt.links.new(coord.outputs["Object"], mapn.inputs["Vector"])
    nt.links.new(mapn.outputs["Vector"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Alpha"])
    return m


# ---- mask / wreck passes -------------------------------------------------------

def mask_pass(name, w_px, h_px, render_dir):
    """PAINT_* materials render white emission, all else black — the tint mask."""
    mw, mb = emis("MASK_W", (1, 1, 1)), emis("MASK_B", (0, 0, 0))
    stash = []
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        for i, slot in enumerate(o.material_slots):
            if slot.material is None or slot.material.name in ("MASK_W", "MASK_B"):
                continue
            stash.append((o, i, slot.material))
            slot.material = mw if slot.material.name.startswith("PAINT") else mb
    path = shot(name, w_px, h_px, render_dir)
    for o, i, m in stash:
        o.material_slots[i].material = m
    return path


def wreck_pass(name, w_px, h_px, render_dir):
    """Paint burns, glass and lights gut, chrome rusts; render; restore."""
    burnt = mat("CAR_BURNT", (0.045, 0.04, 0.038), rough=0.95)
    dark = mat("CAR_DARK", (0.02, 0.02, 0.03), rough=0.85)
    rust = mat("CAR_RUST", (0.16, 0.09, 0.05), rough=0.9)
    swap = {"PAINT_BODY": burnt, "CAR_GLASS": dark, "CAR_HLIGHT": dark,
            "CAR_TLIGHT": dark, "CAR_CHROME": rust, "CAR_STEEL": rust}
    stash = []
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        for i, slot in enumerate(o.material_slots):
            if slot.material and slot.material.name in swap:
                stash.append((o, i, slot.material))
                slot.material = swap[slot.material.name]
    path = shot(name, w_px, h_px, render_dir)
    for o, i, m in stash:
        o.material_slots[i].material = m
    return path


# ---- the fleet -----------------------------------------------------------------

def car_mats():
    return dict(
        paint=mat("PAINT_BODY", (0.85, 0.85, 0.88), metallic=0.65, rough=0.3),
        glass=mat("CAR_GLASS", (0.01, 0.03, 0.07), metallic=0.9, rough=0.22),
        rubber=mat("CAR_RUBBER", (0.015, 0.015, 0.02), rough=0.95),
        chrome=mat("CAR_CHROME", (0.65, 0.68, 0.75), metallic=1.0, rough=0.28),
        steel=mat("CAR_STEEL", (0.6, 0.58, 0.52), metallic=0.55, rough=0.45),
        dark=mat("CAR_DARK", (0.02, 0.02, 0.03), rough=0.85),
        hlight=mat("CAR_HLIGHT", (0.9, 0.85, 0.7), emit=(1.0, 0.85, 0.5), emit_str=4.0),
        tlight=mat("CAR_TLIGHT", (0.4, 0.05, 0.05), emit=(1.0, 0.1, 0.08), emit_str=2.5),
        burnt=mat("CAR_BURNT", (0.045, 0.04, 0.038), rough=0.95),
        rust=mat("CAR_RUST", (0.16, 0.09, 0.05), rough=0.9),
    )


def _common_lights(B, M, L, W, hl_z=1.8, slim=False):
    hw = 1.6 if not slim else 1.9
    hh = 0.8 if not slim else 0.55
    B("hlL", hw, 0.8, hh, x=-(W / 2 - 2.1), y=L / 2 - 0.9, z=hl_z, m=M["hlight"])
    B("hlR", hw, 0.8, hh, x=W / 2 - 2.1, y=L / 2 - 0.9, z=hl_z, m=M["hlight"])
    B("tlL", hw, 0.6, hh, x=-(W / 2 - 2.1), y=-L / 2 + 0.7, z=hl_z + 0.1, m=M["tlight"])
    B("tlR", hw, 0.6, hh, x=W / 2 - 2.1, y=-L / 2 + 0.7, z=hl_z + 0.1, m=M["tlight"])


def make_car(cls, M=None):
    """Build one vehicle at the origin, nose toward +Y. Returns its objects."""
    M = M or car_mats()
    objs = []

    def B(*a, **k):
        o = box(*a, **k)
        objs.append(o)
        return o

    def WH(x, y, r=1.7, w=1.2):
        o = cyl("wheel", r, w, x=x, y=y, z=r * 0.9, m=M["rubber"],
                rot=(0, math.pi / 2, 0), verts=20)
        objs.append(o)
        return o

    L, W = CAR_DIMS[cls]

    if cls == "compact":  # a round little hatchback
        B("body", W - 1.6, L - 2, 2.8, m=M["paint"], bevel=0.9)
        B("nose", W - 2.6, 2.2, 2.2, y=L / 2 - 1.6, m=M["paint"], bevel=0.7)
        B("tail", W - 2.6, 1.8, 2.4, y=-L / 2 + 1.4, m=M["paint"], bevel=0.7)
        B("greenhouse", W - 3.2, 8.5, 1.6, y=-0.8, z=2.8, m=M["glass"], bevel=0.5)
        B("roof", W - 4.6, 5.6, 0.9, y=-1.1, z=4.4, m=M["paint"], bevel=0.45)
        for x in (-(W / 2 - 0.4), W / 2 - 0.4):
            WH(x, L / 2 - 3.2)
            WH(x, -L / 2 + 3.2)
        B("bumpF", W - 2, 0.9, 1.4, y=L / 2 - 0.35, m=M["chrome"], bevel=0.3)
        B("bumpR", W - 2, 0.9, 1.4, y=-L / 2 + 0.35, m=M["chrome"], bevel=0.3)
        B("grille", 3.4, 0.7, 0.9, y=L / 2 - 1.1, z=1.6, m=M["dark"])
        _common_lights(B, M, L, W)
        B("mirL", 0.8, 0.7, 0.5, x=-(W / 2 - 0.9), y=1.9, z=3.0, m=M["paint"])
        B("mirR", 0.8, 0.7, 0.5, x=W / 2 - 0.9, y=1.9, z=3.0, m=M["paint"])

    elif cls == "sedan":  # three-box: long hood, long trunk
        B("body", W - 1.6, L - 2, 2.7, m=M["paint"], bevel=0.85)
        B("hoodline", W - 2.4, 3.0, 3.0, y=L / 2 - 3.2, m=M["paint"], bevel=0.7)
        B("trunkline", W - 2.4, 2.6, 3.0, y=-L / 2 + 2.6, m=M["paint"], bevel=0.7)
        B("greenhouse", W - 3.0, 9.0, 1.7, y=-1.2, z=2.7, m=M["glass"], bevel=0.5)
        B("roof", W - 4.4, 5.8, 0.9, y=-1.4, z=4.4, m=M["paint"], bevel=0.45)
        for x in (-(W / 2 - 0.4), W / 2 - 0.4):
            WH(x, L / 2 - 3.8)
            WH(x, -L / 2 + 3.8)
        B("bumpF", W - 1.8, 0.9, 1.4, y=L / 2 - 0.35, m=M["chrome"], bevel=0.3)
        B("bumpR", W - 1.8, 0.9, 1.4, y=-L / 2 + 0.35, m=M["chrome"], bevel=0.3)
        B("grille", 4.2, 0.7, 0.9, y=L / 2 - 1.1, z=1.7, m=M["dark"])
        _common_lights(B, M, L, W)
        B("mirL", 0.8, 0.7, 0.5, x=-(W / 2 - 0.8), y=2.6, z=3.0, m=M["paint"])
        B("mirR", 0.8, 0.7, 0.5, x=W / 2 - 0.8, y=2.6, z=3.0, m=M["paint"])

    elif cls == "sports":  # low wedge, cab-rearward, spoiler
        B("body", W - 1.8, L - 2, 2.0, m=M["paint"], bevel=0.8)
        B("noseWedge", W - 2.8, 5.0, 1.5, y=L / 2 - 3.0, m=M["paint"], bevel=0.6)
        B("haunch", W - 1.6, 6.0, 2.5, y=-L / 2 + 3.6, m=M["paint"], bevel=0.8)
        B("greenhouse", W - 3.6, 6.6, 1.5, y=-2.2, z=2.4, m=M["glass"], bevel=0.5)
        B("roof", W - 5.0, 3.4, 0.7, y=-2.5, z=3.9, m=M["paint"], bevel=0.35)
        B("spoiler", W - 2.6, 1.1, 0.5, y=-L / 2 + 0.9, z=3.4, m=M["paint"], bevel=0.25)
        B("spoilStrutL", 0.5, 0.6, 1.2, x=-(W / 2 - 2.4), y=-L / 2 + 0.9, z=2.2, m=M["dark"])
        B("spoilStrutR", 0.5, 0.6, 1.2, x=W / 2 - 2.4, y=-L / 2 + 0.9, z=2.2, m=M["dark"])
        for x in (-(W / 2 - 0.35), W / 2 - 0.35):
            WH(x, L / 2 - 3.4, r=1.6)
            WH(x, -L / 2 + 3.0, r=1.8)
        B("bumpF", W - 2.2, 0.8, 1.0, y=L / 2 - 0.3, m=M["dark"], bevel=0.25)
        B("bumpR", W - 2.2, 0.8, 1.0, y=-L / 2 + 0.3, m=M["dark"], bevel=0.25)
        B("vent", 3.0, 1.6, 0.35, y=L / 2 - 4.6, z=2.25, m=M["dark"])
        _common_lights(B, M, L, W, hl_z=1.4, slim=True)

    elif cls == "bus":  # a rolling brick with hatches
        B("body", W - 1.2, L - 1.6, 4.6, m=M["paint"], bevel=0.7)
        B("roofline", W - 2.6, L - 4.5, 0.8, y=-1.0, z=4.6, m=M["paint"], bevel=0.4)
        B("windshield", W - 2.4, 1.2, 2.0, y=L / 2 - 1.3, z=2.4, m=M["glass"])
        B("rearglass", W - 3.4, 0.8, 1.6, y=-L / 2 + 1.1, z=2.6, m=M["glass"])
        B("winL", 0.7, L - 8, 1.5, x=-(W / 2 - 0.95), y=-0.5, z=2.9, m=M["glass"])
        B("winR", 0.7, L - 8, 1.5, x=W / 2 - 0.95, y=-0.5, z=2.9, m=M["glass"])
        for i in range(3):
            B("hatch" + str(i), 3.4, 2.6, 0.35, y=L / 2 - 9.5 - i * 7.5, z=5.45,
              m=M["dark"], bevel=0.15)
        for x in (-(W / 2 - 0.35), W / 2 - 0.35):
            WH(x, L / 2 - 4.5, r=1.9)
            WH(x, -L / 2 + 5.5, r=1.9)
            WH(x, -L / 2 + 9.2, r=1.9)
        B("bumpF", W - 1.0, 1.0, 1.6, y=L / 2 - 0.35, m=M["dark"], bevel=0.3)
        B("bumpR", W - 1.0, 1.0, 1.6, y=-L / 2 + 0.35, m=M["dark"], bevel=0.3)
        _common_lights(B, M, L, W, hl_z=2.2)

    elif cls == "tanker":  # cab + the batter barrel (canon: S.W. Logistics)
        B("cab", W - 2.2, 6.0, 3.6, y=L / 2 - 3.6, m=M["paint"], bevel=0.8)
        B("cabroof", W - 3.4, 3.0, 0.7, y=L / 2 - 3.0, z=3.6, m=M["paint"], bevel=0.35)
        B("cabglass", W - 3.0, 1.0, 1.6, y=L / 2 - 1.4, z=2.0, m=M["glass"])
        B("chassis", W - 3.5, L - 9, 1.6, y=-2.5, m=M["dark"])
        bar = cyl("barrel", 4.4, L - 11, x=0, y=-3.5, z=4.5, m=M["steel"],
                  rot=(math.pi / 2, 0, 0), verts=32)
        objs.append(bar)
        for i, by in enumerate((3.0, -3.5, -9.0)):
            bd = cyl("band" + str(i), 4.55, 0.7, x=0, y=by, z=4.5, m=M["dark"],
                     rot=(math.pi / 2, 0, 0), verts=32)
            objs.append(bd)
        B("placard", 2.6, 2.6, 0.4, y=-3.5, z=8.75, m=M["rust"])
        for x in (-(W / 2 - 0.35), W / 2 - 0.35):
            WH(x, L / 2 - 2.6, r=1.9)
            WH(x, -L / 2 + 3.4, r=1.9)
            WH(x, -L / 2 + 7.0, r=1.9)
        B("bumpF", W - 2.0, 0.9, 1.5, y=L / 2 - 0.3, m=M["chrome"], bevel=0.3)
        B("bumpR", W - 2.6, 0.9, 1.5, y=-L / 2 + 0.3, m=M["dark"], bevel=0.3)
        B("hlL", 1.5, 0.8, 0.8, x=-(W / 2 - 2.3), y=L / 2 - 0.8, z=1.9, m=M["hlight"])
        B("hlR", 1.5, 0.8, 0.8, x=W / 2 - 2.3, y=L / 2 - 0.8, z=1.9, m=M["hlight"])
        B("tlL", 1.5, 0.6, 0.8, x=-(W / 2 - 2.9), y=-L / 2 + 0.6, z=1.9, m=M["tlight"])
        B("tlR", 1.5, 0.6, 0.8, x=W / 2 - 2.9, y=-L / 2 + 0.6, z=1.9, m=M["tlight"])

    elif cls == "cruiser":  # the black-and-white (livery painted by the engine)
        B("body", W - 1.6, L - 2, 2.7, m=M["paint"], bevel=0.85)
        B("hoodline", W - 2.4, 3.2, 3.0, y=L / 2 - 3.0, m=M["paint"], bevel=0.7)
        B("trunkline", W - 2.4, 2.4, 3.0, y=-L / 2 + 2.4, m=M["paint"], bevel=0.7)
        B("greenhouse", W - 3.0, 8.0, 1.7, y=-0.9, z=2.7, m=M["glass"], bevel=0.5)
        B("roof", W - 4.4, 4.8, 0.9, y=-1.1, z=4.4, m=M["paint"], bevel=0.45)
        B("pushbar", W - 3.6, 0.7, 1.5, y=L / 2 - 0.15, m=M["dark"], bevel=0.2)
        for x in (-(W / 2 - 0.4), W / 2 - 0.4):
            WH(x, L / 2 - 3.5)
            WH(x, -L / 2 + 3.5)
        B("bumpF", W - 1.8, 0.9, 1.3, y=L / 2 - 0.45, m=M["dark"], bevel=0.3)
        B("bumpR", W - 1.8, 0.9, 1.3, y=-L / 2 + 0.45, m=M["dark"], bevel=0.3)
        B("grille", 4.0, 0.7, 0.9, y=L / 2 - 1.2, z=1.7, m=M["dark"])
        _common_lights(B, M, L, W)
        B("mirL", 0.8, 0.7, 0.5, x=-(W / 2 - 0.8), y=2.2, z=3.0, m=M["paint"])
        B("mirR", 0.8, 0.7, 0.5, x=W / 2 - 0.8, y=2.2, z=3.0, m=M["paint"])

    elif cls == "van":  # the armored BATTER VAN
        B("body", W - 1.4, L - 3.5, 4.4, y=-0.75, m=M["paint"], bevel=0.6)
        B("hood", W - 2.6, 3.2, 2.6, y=L / 2 - 2.2, m=M["paint"], bevel=0.6)
        B("windshield", W - 3.0, 1.0, 1.8, y=L / 2 - 4.0, z=2.8, m=M["glass"])
        B("roofvent", 3.0, 2.2, 0.4, y=-2.0, z=4.4, m=M["dark"], bevel=0.15)
        B("doorseam", 0.35, 0.9, 3.4, y=-L / 2 + 1.85, z=0.6, m=M["dark"])
        B("plateL", 0.5, L - 8, 0.9, x=-(W / 2 - 0.65), y=-1.0, z=3.4, m=M["dark"])
        B("plateR", 0.5, L - 8, 0.9, x=W / 2 - 0.65, y=-1.0, z=3.4, m=M["dark"])
        for x in (-(W / 2 - 0.35), W / 2 - 0.35):
            WH(x, L / 2 - 3.6, r=1.9)
            WH(x, -L / 2 + 3.6, r=1.9)
        B("bumpF", W - 1.6, 1.0, 1.5, y=L / 2 - 0.35, m=M["dark"], bevel=0.25)
        B("bumpR", W - 1.6, 1.0, 1.5, y=-L / 2 + 0.35, m=M["dark"], bevel=0.25)
        B("grille", 4.6, 0.7, 1.1, y=L / 2 - 1.0, z=1.5, m=M["dark"])
        _common_lights(B, M, L, W, hl_z=2.0)

    return objs


# ---- the citizens ---------------------------------------------------------------

def nug_mats():
    return dict(
        breading=bumpmat("NUG_BREAD", (0.8, 0.55, 0.22), rough=0.75, noise_scale=14,
                         bump=0.8, detail=6),
        jacket=mat("PAINT_JACKET", (0.85, 0.85, 0.88), rough=0.7),
        arm=mat("PAINT_ARM", (0.62, 0.62, 0.66), rough=0.75),
        shoe=mat("NUG_SHOE", (0.05, 0.035, 0.02), rough=0.9),
    )


def make_nug(pose, M=None):
    """One citizen at the origin, facing +Y. Returns its objects."""
    M = M or nug_mats()
    objs = []

    def track(o):
        objs.append(o)
        return o

    if pose == "daze":
        track(sph("jacket", 3.2, y=0, z=0.9, m=M["jacket"], squash=0.32))
        track(sph("head", 2.2, y=2.2, z=1.2, m=M["breading"], squash=0.5))
        track(box("armL", 3.4, 1.6, 0.7, x=-3.6, y=0.4, m=M["arm"]))
        track(box("armR", 3.4, 1.6, 0.7, x=3.6, y=-0.2, m=M["arm"]))
        track(box("legL", 1.4, 2.6, 0.7, x=-1.3, y=-3.4, m=M["shoe"]))
        track(box("legR", 1.4, 2.6, 0.7, x=1.1, y=-3.9, m=M["shoe"]))
        return objs
    stride = {"idle": 0.5, "walk0": 2.0, "walk1": -2.0, "flee0": 2.6, "flee1": -2.6}[pose]
    track(sph("jacket", 3.3, y=-0.3, z=1.2, m=M["jacket"], squash=0.55))
    track(sph("belly", 2.6, y=0.3, z=1.5, m=M["jacket"], squash=0.6))
    track(sph("head", 2.45, y=0.8, z=3.1, m=M["breading"], squash=0.85))
    track(box("footL", 1.8, 2.2, 0.8, x=-1.3, y=stride, z=0, m=M["shoe"], bevel=0.2))
    track(box("footR", 1.8, 2.2, 0.8, x=1.2, y=-stride, z=0, m=M["shoe"], bevel=0.2))
    if pose.startswith("flee"):
        f = 0.8 if pose == "flee0" else 0.0
        track(box("armL", 1.6, 2.8, 1.0, x=-3.3, y=2.0 - f, z=1.6, m=M["arm"], bevel=0.3))
        track(box("armR", 1.6, 2.8, 1.0, x=3.3, y=1.2 + f, z=1.6, m=M["arm"], bevel=0.3))
    else:
        sw = {"idle": 0.0, "walk0": 1.6, "walk1": -1.6}[pose]
        track(box("armL", 1.5, 2.4, 1.0, x=-3.5, y=-sw, z=1.5, m=M["arm"], bevel=0.3))
        track(box("armR", 1.5, 2.4, 1.0, x=3.5, y=sw, z=1.5, m=M["arm"], bevel=0.3))
    return objs


def make_cap():
    """The NPD cap, aligned over the head; whole-sprite tinted at runtime."""
    capm = mat("CAP_W", (0.85, 0.85, 0.9), rough=0.6)
    objs = [sph("cap", 1.9, y=0.8, z=4.6, m=capm, squash=0.5),
            box("brim", 2.2, 1.4, 0.25, y=2.2, z=4.3, m=capm, bevel=0.1)]
    return objs


# ---- the ground -----------------------------------------------------------------

def make_tile(kind, variant="a", seed=0):
    """One 24px ground tile's geometry (plus apron, cropped by the camera).
    Render under rig_tiles(). Road variants: a=tar seam, b=repair patch,
    c=clean slab (the common one), d=oil stain — the engine hash-picks
    mostly c so nothing wallpapers."""
    random.seed(seed)
    objs = []

    def track(o):
        objs.append(o)
        return o

    if kind in ("road", "road_manhole"):
        asph = bumpmat("T_ASPH_" + variant, (0.3, 0.3, 0.34), rough=0.8,
                       noise_scale=10, bump=0.7, detail=8)
        track(gridplane("ground", 30, asph, subdiv=56, disp=0.28, disp_scale=5))
        if variant == "a":  # one shallow tar seam, not a lightning bolt
            drk = mat("T_SEAM", (0.17, 0.17, 0.2), rough=0.55)
            b = box("seam", random.uniform(9, 14), 0.6, 0.06, x=random.uniform(-5, 5),
                    y=random.uniform(-8, 8), z=0.3, m=drk)
            b.rotation_euler = (0, 0, random.uniform(0, math.pi))
            track(b)
        if variant == "b":  # a repair patch, gently darker
            patch = bumpmat("T_PATCH", (0.25, 0.25, 0.28), rough=0.85, noise_scale=13, bump=0.4)
            track(box("patch", random.uniform(6, 9), random.uniform(5, 7), 0.08,
                      x=random.uniform(-6, 6), y=random.uniform(-6, 6), z=0.16, m=patch))
        if variant == "d":  # an oil stain, faint
            track(plane("stain", random.uniform(5, 8), stain_mat("T_STAIN"),
                        x=random.uniform(-6, 6), y=random.uniform(-6, 6), z=0.32))
        if kind == "road_manhole":
            mrim = mat("T_MANRIM", (0.09, 0.09, 0.1), rough=0.8)
            track(cyl("rim", 4.9, 0.16, z=0.22, m=mrim, verts=28))
            track(cyl("manhole", 4.3, 0.3, z=0.24,
                      m=mat("T_MANHOLE", (0.3, 0.27, 0.2), metallic=0.75, rough=0.45), verts=28))
            for i in range(5):
                track(box("slot" + str(i), 0.7, 2.8, 0.08, x=-2.4 + i * 1.2, z=0.55, m=mrim))
    elif kind == "walk":
        shades = [bumpmat("T_CONC%s_%d" % (variant, i),
                          (0.39 + i * 0.025, 0.39 + i * 0.025, 0.44 + i * 0.025),
                          rough=0.9, noise_scale=17, bump=0.4, detail=6) for i in range(3)]
        track(plane("under", 30, mat("T_GAP", (0.1, 0.1, 0.12), rough=0.95), z=-0.1))
        s = TILE / 2
        for gy in range(-1, 3):
            for gx in range(-1, 3):
                b = box("pav_%d_%d" % (gx, gy), s - 0.8, s - 0.8, 0.55,
                        x=(gx - 0.5) * s + random.uniform(-0.1, 0.1),
                        y=(gy - 0.5) * s + random.uniform(-0.1, 0.1),
                        m=random.choice(shades), bevel=0.22)
                b.rotation_euler = (random.uniform(-0.008, 0.008), random.uniform(-0.008, 0.008), 0)
                track(b)
    elif kind == "found":  # building footprint / vacant-lot rubble slab
        fc = bumpmat("T_FOUND", (0.22, 0.22, 0.26), rough=0.95, noise_scale=14, bump=0.5, detail=6)
        track(gridplane("slab", 30, fc, subdiv=40, disp=0.18, disp_scale=6))
        drk = mat("T_FSEAM", (0.12, 0.12, 0.14), rough=0.9)
        for i in range(2):
            b = box("crack" + str(i), random.uniform(5, 9), 0.4, 0.06,
                    x=random.uniform(-7, 7), y=random.uniform(-7, 7), z=0.14, m=drk)
            b.rotation_euler = (0, 0, random.uniform(0, math.pi))
            track(b)
    elif kind == "board":
        track(plane("under", 30, mat("T_VOID", (0.01, 0.015, 0.03), rough=1.0), z=-0.3))
        for i in range(5):
            wcol = 0.30 + random.uniform(-0.05, 0.05)
            wm = bumpmat("T_WOOD_%s_%d" % (variant, i), (wcol, wcol * 0.72, wcol * 0.45),
                         rough=0.85, noise_scale=3, bump=0.5, detail=6)
            track(box("plank" + str(i), 30, TILE / 5 - 0.6, 0.4,
                      y=(i - 2) * (TILE / 5) + random.uniform(-0.15, 0.15), m=wm, bevel=0.12))
    elif kind == "grass":
        gr = bumpmat("T_GRASS_" + variant, (0.18, 0.34, 0.2), rough=0.95,
                     noise_scale=18, bump=0.9, detail=8)
        track(plane("ground", 30, gr, z=0))
        gr2 = bumpmat("T_GRASS2_" + variant, (0.14, 0.28, 0.16), rough=0.95,
                      noise_scale=25, bump=0.8)
        for i in range(6):
            track(sph("clump" + str(i), random.uniform(1.2, 2.6),
                      x=random.uniform(-10, 10), y=random.uniform(-10, 10), z=-0.6,
                      m=gr2, squash=0.4))
    elif kind == "water":
        wm = bumpmat("T_WATER_" + variant, (0.1, 0.22, 0.34), rough=0.15,
                     noise_scale=4 + seed % 4, bump=0.7, detail=5, metallic=0.3)
        track(plane("sea", 30, wm, z=0))
    elif kind == "roof":  # gray gravel, tinted per district block at runtime
        rg = bumpmat("T_ROOF_" + variant, (0.5, 0.5, 0.5), rough=0.95,
                     noise_scale=26, bump=0.9, detail=8)
        track(gridplane("roof", 30, rg, subdiv=40, disp=0.2, disp_scale=8))
        gray = mat("T_ROOFBOX", (0.42, 0.42, 0.44), metallic=0.5, rough=0.55)
        gdark = mat("T_ROOFDARK", (0.16, 0.16, 0.17), rough=0.8)
        if variant == "a":  # AC unit + pipe run
            track(box("ac", 5.5, 4.5, 2.2, x=4, y=-3.5, m=gray, bevel=0.3))
            track(cyl("fan", 1.6, 0.2, x=4, y=-3.5, z=2.35, m=gdark, verts=16))
            track(cyl("pipe", 0.55, 14, x=-6, y=2, z=0.6, m=gray, rot=(math.pi / 2, 0, 0.4)))
        elif variant == "b":  # access hatch + vents
            track(box("hatch", 4.5, 4.5, 1.0, x=-4.5, y=4, m=gray, bevel=0.25))
            for i in range(3):
                track(cyl("vent" + str(i), 0.9, 1.4, x=3 + i * 2.6, y=-5 + i * 3, z=0.7,
                          m=gdark, verts=12))
        elif variant == "c":  # skylight
            track(box("skyframe", 7.3, 5.8, 0.5, x=2, y=2, m=gdark, bevel=0.2))
            track(box("sky", 6.5, 5, 1.2, x=2, y=2,
                      m=mat("T_SKYGLASS", (0.06, 0.1, 0.2), metallic=0.9, rough=0.15), bevel=0.3))
        else:  # d: gravel border + lone pipe
            track(box("border", 26, 1.6, 0.5, y=10.5, m=gdark))
            track(box("border2", 1.6, 26, 0.5, x=-10.5, m=gdark))
            track(cyl("pipe2", 0.7, 10, x=4, y=-4, z=0.7, m=gray, rot=(math.pi / 2, 0, -0.7)))
    return objs


TILE_BUILDS = [  # (region name, kind, variant, seed)
    ("tile_road_a", "road", "a", 211), ("tile_road_b", "road", "b", 247),
    ("tile_road_c", "road", "c", 251), ("tile_road_d", "road", "d", 263),
    ("tile_road_manhole", "road_manhole", "c", 299),
    ("tile_walk_a", "walk", "a", 205), ("tile_walk_b", "walk", "b", 223),
    ("tile_board_a", "board", "a", 107), ("tile_board_b", "board", "b", 131),
    ("tile_grass_a", "grass", "a", 113), ("tile_grass_b", "grass", "b", 141),
    ("tile_water_a", "water", "a", 103), ("tile_water_b", "water", "b", 129),
    ("tile_roof_a", "roof", "a", 117), ("tile_roof_b", "roof", "b", 153),
    ("tile_roof_c", "roof", "c", 161), ("tile_roof_d", "roof", "d", 171),
    ("tile_found", "found", "a", 277),
]


# ---- the props ------------------------------------------------------------------

def make_prop(name):
    objs = []

    def track(o):
        objs.append(o)
        return o

    if name == "prop_cart":  # NOODLE NUG
        wood = bumpmat("P_CARTWOOD", (0.4, 0.24, 0.12), rough=0.8, noise_scale=6, bump=0.4)
        track(box("counter", 16, 10, 4, y=-2, m=wood, bevel=0.4))
        track(box("glowstrip", 15, 1.6, 0.3, y=2.6, z=4.0,
                  m=mat("P_GLOW", (1.0, 0.85, 0.3), emit=(1.0, 0.8, 0.2), emit_str=5.0)))
        pole = mat("P_POLE", (0.04, 0.04, 0.05), rough=0.7, metallic=0.5)
        track(cyl("poleL", 0.5, 9, x=-7.5, y=-2, z=4.5, m=pole))
        track(cyl("poleR", 0.5, 9, x=7.5, y=-2, z=4.5, m=pole))
        pink = mat("P_AWNPINK", (1.0, 0.12, 0.55), rough=0.6)
        white = mat("P_AWNWHITE", (0.9, 0.9, 0.95), rough=0.6)
        for i in range(5):
            track(box("awn" + str(i), 3.6, 12, 0.5, x=-7.2 + i * 3.6, y=0.5, z=9.0,
                      m=(pink if i % 2 else white), bevel=0.15))
    elif name == "prop_booth":  # the syndicate calls collect
        shell = mat("P_BOOTH2", (0.05, 0.18, 0.38), rough=0.5, metallic=0.2)
        track(box("shell", 11, 11, 19, m=shell, bevel=0.6))
        track(box("roofcap", 12, 12, 1.4, z=19, m=shell, bevel=0.4))
        track(box("sign", 8.5, 8.5, 1.0, z=20.4,
                  m=mat("P_PHSIGN2", (0.9, 0.65, 0.08), rough=0.4,
                        emit=(1.0, 0.75, 0.1), emit_str=1.1), bevel=0.3))
        track(box("glyph", 5.0, 1.6, 0.3, z=21.4, m=mat("P_GLYPH", (0.06, 0.1, 0.2), rough=0.6)))
    elif name == "prop_crate":
        pine = bumpmat("P_PINE", (0.45, 0.3, 0.15), rough=0.85, noise_scale=5, bump=0.5)
        track(box("crate", 10, 10, 7, m=pine, bevel=0.35))
        slat = mat("P_SLAT", (0.28, 0.18, 0.08), rough=0.9)
        track(box("slatV", 2.2, 10.6, 0.5, z=7.0, m=slat))
        track(box("slatH", 10.6, 2.2, 0.5, z=7.0, m=slat))
        edge = bumpmat("P_PINE2", (0.55, 0.38, 0.2), rough=0.8, noise_scale=7, bump=0.4)
        for gx in (-3.4, 3.4):
            track(box("edge" + str(gx), 1.6, 10.4, 0.3, x=gx, z=7.05, m=edge))
    elif name == "prop_goldnug":
        gold = bumpmat("P_GOLDNUG", (0.95, 0.72, 0.2), rough=0.4, noise_scale=9,
                       bump=1.2, detail=8, metallic=0.6)
        try:
            b = gold.node_tree.nodes["Principled BSDF"]
            b.inputs["Emission Color"].default_value = (1.0, 0.75, 0.2, 1.0)
            b.inputs["Emission Strength"].default_value = 0.6
        except Exception:
            pass
        n = sph("nug", 3.6, z=2.4, m=gold, squash=0.75)
        n.scale = (1.15, 0.9, 1.0)
        bpy.ops.object.transform_apply(scale=True)
        track(n)
        track(sph("lump1", 1.6, x=2.2, y=1.4, z=3.0, m=gold))
        track(sph("lump2", 1.4, x=-2.0, y=-1.6, z=2.8, m=gold))
    elif name == "prop_fountain":  # plaza centerpiece (S2.13)
        stone = bumpmat("P_STONE", (0.4, 0.4, 0.44), rough=0.85, noise_scale=10, bump=0.5)
        stone2 = bumpmat("P_STONE2", (0.3, 0.3, 0.34), rough=0.9, noise_scale=12, bump=0.4)
        wat = mat("P_FWATER", (0.1, 0.3, 0.5), rough=0.1, metallic=0.3,
                  emit=(0.2, 0.5, 0.8), emit_str=0.5)
        track(cyl("basin", 10.5, 2.2, z=1.1, m=stone, verts=32))
        track(cyl("bowl", 9.0, 0.6, z=2.4, m=stone2, verts=32))
        track(cyl("water", 8.4, 0.3, z=2.6, m=wat, verts=32))
        track(cyl("pillar", 1.6, 4.4, z=2.2, m=stone, verts=16))
        track(cyl("cup", 3.2, 0.8, z=5.0, m=stone2, verts=20))
        track(cyl("cupwater", 2.7, 0.3, z=5.6, m=wat, verts=20))
    elif name == "prop_bench":  # park/plaza bench: slats on iron legs
        iron = mat("P_IRON", (0.04, 0.04, 0.05), rough=0.6, metallic=0.6)
        for i in range(3):
            wcol = 0.34 + i * 0.03
            track(box("slat" + str(i), 9, 1.15, 0.5, y=1.4 - i * 1.4, z=2.2,
                      m=bumpmat("P_BWOOD" + str(i), (wcol, wcol * 0.68, wcol * 0.4),
                                rough=0.8, noise_scale=3, bump=0.6), bevel=0.15))
        track(box("back", 9, 0.9, 0.5, y=2.6, z=3.4,
                  m=bumpmat("P_BWOOD0", (0.34, 0.23, 0.14), rough=0.8, noise_scale=3, bump=0.6), bevel=0.15))
        for x in (-3.8, 3.8):
            track(box("legF" + str(x), 0.7, 0.7, 2.2, x=x, y=-1.4, m=iron))
            track(box("legB" + str(x), 0.7, 0.7, 3.2, x=x, y=2.2, m=iron))
    elif name == "prop_dumpster":  # NPD's least favorite hiding spot
        metal = bumpmat("P_DUMP", (0.1, 0.3, 0.24), rough=0.7, noise_scale=8, bump=0.3, metallic=0.4)
        dark = mat("P_DUMPDARK", (0.03, 0.03, 0.04), rough=0.8)
        track(box("bin", 13, 8.5, 5.5, m=metal, bevel=0.5))
        track(box("lidL", 6.0, 8.9, 0.7, x=-3.2, z=5.5, m=metal, bevel=0.3))
        b = box("lidR", 6.0, 8.9, 0.9, x=3.4, z=5.6, m=dark, bevel=0.3)
        b.rotation_euler = (0, math.radians(-7), 0)  # one lid never closes
        track(b)
        for x in (-5.5, 5.5):
            track(box("wheel" + str(x), 1.2, 1.2, 1.0, x=x, y=3.4, z=-0.4, m=dark))
        track(box("sticker", 2.6, 0.2, 1.6, y=-4.35, z=2.6,
                  m=mat("P_TAG", (0.7, 0.62, 0.2), rough=0.6)))
    elif name.startswith("prop_tree"):
        variant = name[-1]
        seed = 9 if variant == "a" else 27
        random.seed(seed)
        leaf = bumpmat("P_LEAF_" + variant, (0.1, 0.3, 0.14), rough=0.9,
                       noise_scale=10, bump=1.0, detail=6)
        leaf2 = bumpmat("P_LEAF2_" + variant, (0.16, 0.42, 0.2), rough=0.9,
                        noise_scale=12, bump=0.9)
        track(sph("core", 5.2, z=3, m=leaf, squash=0.6))
        for i in range(6):
            a = i * math.pi / 3 + seed
            track(sph("puff" + str(i), random.uniform(2.2, 3.4),
                      x=math.cos(a) * random.uniform(3.0, 4.6),
                      y=math.sin(a) * random.uniform(3.0, 4.6),
                      z=random.uniform(2.2, 3.8),
                      m=(leaf if i % 2 else leaf2), squash=0.65))
    return objs


PROPS = ("prop_cart", "prop_booth", "prop_crate", "prop_goldnug",
         "prop_tree_a", "prop_tree_b", "prop_fountain", "prop_bench", "prop_dumpster")
PROP_CANVAS = {"prop_cart": (24, 24), "prop_booth": (15, 23), "prop_crate": (12, 12),
               "prop_goldnug": (12, 12), "prop_tree_a": (18, 18), "prop_tree_b": (18, 18),
               "prop_fountain": (24, 24), "prop_bench": (12, 9), "prop_dumpster": (16, 12)}


# ---- entry points ----------------------------------------------------------------

def render_all(render_dir):
    """Re-render every sprite PNG (then run pack_atlas.py)."""
    for cls, (L, W) in CAR_DIMS.items():
        clear_scene()
        rig_setup()
        make_car(cls)
        w_px, h_px = W + 4, L + 4
        shot("car_" + cls, w_px, h_px, render_dir)
        mask_pass("car_" + cls + "_mask", w_px, h_px, render_dir)
        wreck_pass("car_" + cls + "_wreck", w_px, h_px, render_dir)
    for pose in PED_POSES:
        clear_scene()
        rig_setup()
        make_nug(pose)
        shot("ped_" + pose, PED_CV, PED_CV, render_dir)
        mask_pass("ped_" + pose + "_mask", PED_CV, PED_CV, render_dir)
    clear_scene()
    rig_setup()
    make_cap()
    shot("ped_cap", PED_CV, PED_CV, render_dir)
    for name, kind, variant, seed in TILE_BUILDS:
        clear_scene()
        rig_tiles()  # tiles get the raking key; entities keep the overhead rig
        make_tile(kind, variant, seed)
        shot(name, TILE, TILE, render_dir)
    for name in PROPS:
        clear_scene()
        rig_setup()
        make_prop(name)
        shot(name, *PROP_CANVAS[name], render_dir)


def _to_collection(objs, cname, dx):
    col = bpy.data.collections.get(cname) or bpy.data.collections.new(cname)
    if cname not in {c.name for c in bpy.context.scene.collection.children}:
        bpy.context.scene.collection.children.link(col)
    for o in objs:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        col.objects.link(o)
        o.location.x += dx
    return col


def _save(path):
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)


def build_library(out_dir):
    """One compressed .blend per family; each asset in its own collection,
    laid out in a row so the file opens human-readable."""
    os.makedirs(out_dir, exist_ok=True)

    clear_scene()
    rig_setup()
    dx = 0
    for cls in CAR_DIMS:
        _to_collection(make_car(cls), "car_" + cls, dx)
        dx += 40
    _save(os.path.join(out_dir, "gta_vehicles.blend"))

    clear_scene()
    rig_setup()
    dx = 0
    for pose in PED_POSES:
        _to_collection(make_nug(pose), "ped_" + pose, dx)
        dx += 20
    _to_collection(make_cap(), "ped_cap", dx)
    _save(os.path.join(out_dir, "gta_peds.blend"))

    clear_scene()
    rig_setup()
    dx = 0
    for name, kind, variant, seed in TILE_BUILDS:
        _to_collection(make_tile(kind, variant, seed), name, dx)
        dx += 40
    _save(os.path.join(out_dir, "gta_tiles.blend"))

    clear_scene()
    rig_setup()
    dx = 0
    for name in PROPS:
        _to_collection(make_prop(name), name, dx)
        dx += 35
    _save(os.path.join(out_dir, "gta_props.blend"))


def export_gltf(out_dir):
    """One .glb per collection in the CURRENT file — the Unreal on-ramp."""
    os.makedirs(out_dir, exist_ok=True)
    for col in bpy.data.collections:
        if not col.objects:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in col.objects:
            o.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(out_dir, col.name + ".glb"),
            use_selection=True)
