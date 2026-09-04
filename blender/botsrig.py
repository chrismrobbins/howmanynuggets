"""BOTSRIG — the BATTEREDBOTS paint shop (game 17, mode `bots`).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background \
        --python blender/botsrig.py -- blender/render_bots [only=a,b] [nofloor] [floors=pit,fryer,sump] [nosprites] [ss=8]

then:  python blender/pack_bots.py        ->  js/botsArt.js + render_bots/_contact.png
       node blender/tools/botsart_check.js

Every region named in blender/BOTS_ART_CONTRACT.md is born here, THREE times
through the same straight-down ortho camera so the pages land in register:

    <name>.png     ALBEDO  lit colour, transparent film, Standard view transform
    <name>_n.png   NORMAL  n*0.5+0.5 with the Raw transform (data, not a picture).
                   The camera sits at rotation (0,0,0), so WORLD normals already
                   are the contract's camera space: +X right, +Y up, +Z toward the
                   lens, flat = (128,128,255). (Blender's own "camera" space in the
                   Vector Transform node points +Z AWAY from the lens — it gave
                   B=0 for a flat plane. Do not put that node back.)
    <name>_m.png   MASK    PAINT_* materials white, everything else black.

Sprites: 1 BU = 1 game unit, nose toward +Y, cell centred on the origin, rendered
at PPU 4 x SS 8 (a 32-unit cell = 1024 px raw). The floors (`pit`, `fryer`,
`sump` -- one shell of walls/starts/pads shared with js/botsSim.js ARENAS, three
dressings) are modelled at world scale with Blender y = -game y (the contract's
y grows DOWN: a top-wall blade "emerges downward to y 70"), camera on (320,-180),
ortho 640, rendered 2x over 2048x1152 as albedo / normal / rough.
`nosprites floors=fryer,sump` re-renders just those floors.

Lighting: a soft warm key from the top-left at ~50 degrees off vertical plus a
cool fill and a grey dome, balanced so a flat up-facing surface renders at
roughly its own base colour — these are ALBEDOS the renderer lights again with
the normal page, so: form, no hard shadows, nothing baked, nothing emissive
(particles excepted: they are additive sprites, not surfaces).

Conventions inherited from nugrig.py: PAINT_* = the tint mask, `box()` applies
scale BEFORE the bevel, materials are cached by name across builds.
"""
import json
import math
import os
import random
import sys

import bpy
from mathutils import Vector

SS = 8            # sprite supersample
PPU = 4           # atlas px per game unit
FLOOR_SS = 2
FLOOR_PX = (2048, 1152)
WORLD = (640, 360)

# region -> cell (w, h) in game units. THE CONTRACT. Do not drift.
CELLS = {}
for _k in ("dicer", "tender", "brick"):
    for _s in range(3):
        CELLS[f"bot_{_k}_{_s}"] = (32, 32)
for _k in ("disc_still", "disc_spin", "disc_blur"):
    CELLS[_k] = (20, 20)
CELLS["flipper_up"] = (26, 14)
for _k in ("minigun", "flamer", "mortar", "rocket", "emp"):
    CELLS["turret_" + _k] = (16, 16)
    CELLS["pickup_" + _k] = (10, 10)
CELLS["pickup_nitro"] = (10, 10)
CELLS.update({"tire": (8, 8), "drum": (10, 10), "lamp": (12, 12), "blade": (28, 10),
              "mallet": (16, 16), "mallet_arm": (8, 40), "pad": (18, 18),
              "pit_hole": (64, 64), "grate": (64, 64), "booth": (40, 80),
              "driver": (8, 10), "crowd": (128, 24)})
CELLS.update({"p_spark": (4, 4), "p_smoke": (16, 16), "p_oil": (12, 12),
              "puddle_ranch": (36, 36), "scorch": (24, 24), "skid": (6, 3)})
for _i in range(3):
    CELLS[f"p_fire_{_i}"] = (12, 12)
    CELLS[f"p_plate_{_i}"] = (6, 4)
for _i in range(4):
    CELLS[f"p_crumb_{_i}"] = (3, 3)

BOT_DIMS = {"dicer": (24, 14), "tender": (26, 16), "brick": (28, 18)}  # (L, W)


# ---- scene / rig -------------------------------------------------------------------

def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.lights, bpy.data.cameras):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def _sun(name, color, energy, angle_deg, from_vec):
    ld = bpy.data.lights.new(name, "SUN")
    ob = bpy.data.objects.new(name, ld)
    bpy.context.collection.objects.link(ob)
    ld.color = color
    ld.energy = energy
    ld.angle = math.radians(angle_deg)
    d = -Vector(from_vec).normalized()
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return ob


def rig_setup(key=2.2, fill=0.6, dome=0.45):
    """Straight-down ortho camera, soft top-left key, cool fill, grey dome.
    A flat up-facing white surface comes out ~1.0: dome + key*cos50/pi +
    fill*cos38/pi = 0.45 + 0.45 + 0.15."""
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            sc.render.engine = eng
            break
        except Exception:
            continue
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    w = bpy.data.worlds.get("BotsDome") or bpy.data.worlds.new("BotsDome")
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (dome, dome * 1.01, dome * 1.06, 1.0)
    bg.inputs[1].default_value = 1.0
    sc.world = w
    try:
        sc.eevee.taa_render_samples = 32
        sc.eevee.use_raytracing = True
        sc.eevee.use_shadows = True
    except Exception:
        pass
    # key from the top-left, 50 degrees off vertical; fill from the lower right
    _sun("BotsKey", (1.0, 0.94, 0.84), key, 28, (-0.542, 0.542, 0.643))
    _sun("BotsFill", (0.6, 0.72, 1.0), fill, 45, (0.5, -0.38, 0.79))
    cd = bpy.data.cameras.new("BotsCam")
    cam = bpy.data.objects.new("BotsCam", cd)
    bpy.context.collection.objects.link(cam)
    cd.type = "ORTHO"
    cd.sensor_fit = "HORIZONTAL"
    cd.clip_start = 0.1
    cd.clip_end = 600
    cam.location = (0, 0, 80)
    cam.rotation_euler = (0, 0, 0)
    sc.camera = cam
    return sc


def shot(name, cw, px_w, px_h, render_dir, center=(0, 0), cam_z=80):
    sc = bpy.context.scene
    cam = sc.camera
    cam.data.ortho_scale = cw
    cam.location = (center[0], center[1], cam_z)
    sc.render.resolution_x = int(px_w)
    sc.render.resolution_y = int(px_h)
    sc.render.resolution_percentage = 100
    os.makedirs(render_dir, exist_ok=True)
    sc.render.filepath = os.path.join(render_dir, name + ".png")
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


def _lights(hide):
    for o in bpy.data.objects:
        if o.type == "LIGHT":
            o.hide_render = hide


def _slots():
    for o in bpy.data.objects:
        if o.hide_render:
            continue
        for slot in getattr(o, "material_slots", []):
            if slot.material is not None:
                yield o, slot


def _data_mode(sc, on):
    """Data passes: no world, no lights, Raw transform (Standard would sRGB-encode
    0.5 to 188)."""
    if on:
        sc["_bots_world"] = sc.world.name if sc.world else ""
        sc.world = None
        _lights(True)
        try:
            sc.view_settings.view_transform = "Raw"
        except Exception:
            sc.view_settings.view_transform = "Standard"
    else:
        sc.view_settings.view_transform = "Standard"
        _lights(False)
        wn = sc.get("_bots_world", "")
        if wn:
            sc.world = bpy.data.worlds.get(wn)


def pass_albedo(name, cw, px_w, px_h, render_dir, **kw):
    return shot(name, cw, px_w, px_h, render_dir, **kw)


def _normal_swap():
    """Rewire every material to EMIT its shading normal — the Bump chain included,
    because the breading's crumb IS that bump and a plain geometry normal would
    throw it away. World space == camera space here (see module doc)."""
    saved, seen = [], set()
    for ob, slot in _slots():
        m = slot.material
        if m.name in seen:
            continue
        seen.add(m.name)
        nt = m.node_tree
        out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
        if not out:
            continue
        prev = [(l.from_node.name, l.from_socket.name) for l in out.inputs[0].links]
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        tmp = []
        src = None
        if bsdf and bsdf.inputs["Normal"].links:
            src = bsdf.inputs["Normal"].links[0].from_socket
        if src is None:
            g = nt.nodes.new("ShaderNodeNewGeometry")
            g.name = "NRM_GEO"
            tmp.append(g.name)
            src = g.outputs["Normal"]
        enc = nt.nodes.new("ShaderNodeVectorMath")
        enc.name = "NRM_ENC"
        enc.operation = "MULTIPLY_ADD"
        enc.inputs[1].default_value = (0.5, 0.5, 0.5)
        enc.inputs[2].default_value = (0.5, 0.5, 0.5)
        em = nt.nodes.new("ShaderNodeEmission")
        em.name = "NRM_EM"
        em.inputs[1].default_value = 1.0
        nt.links.new(src, enc.inputs[0])
        nt.links.new(enc.outputs[0], em.inputs[0])
        for l in list(out.inputs[0].links):
            nt.links.remove(l)
        nt.links.new(em.outputs[0], out.inputs[0])
        tmp += [enc.name, em.name]
        saved.append((m, tmp, prev, out.name))
    return saved


def _swap_restore(saved):
    for m, tmp, prev, outname in saved:
        nt = m.node_tree
        out = nt.nodes.get(outname)
        if out:
            for l in list(out.inputs[0].links):
                nt.links.remove(l)
            for sn, sk in prev:
                src = nt.nodes.get(sn)
                if src:
                    nt.links.new(src.outputs[sk], out.inputs[0])
        for nm in tmp:
            n = nt.nodes.get(nm)
            if n:
                nt.nodes.remove(n)


def pass_normal(name, cw, px_w, px_h, render_dir, **kw):
    sc = bpy.context.scene
    saved = _normal_swap()
    _data_mode(sc, True)
    try:
        return shot(name + "_n", cw, px_w, px_h, render_dir, **kw)
    finally:
        _data_mode(sc, False)
        _swap_restore(saved)


def _slot_swap(pick):
    stash = []
    for ob, slot in _slots():
        rep = pick(slot.material)
        if rep is not None and rep is not slot.material:
            stash.append((ob, slot.slot_index if hasattr(slot, "slot_index") else None, slot, slot.material))
            slot.material = rep
    return stash


def _slot_restore(stash):
    for ob, _i, slot, m in stash:
        slot.material = m


def pass_mask(name, cw, px_w, px_h, render_dir, **kw):
    sc = bpy.context.scene
    mw, mb = emis("MASK_W", (1, 1, 1)), emis("MASK_B", (0, 0, 0))
    stash = _slot_swap(lambda m: mw if m.name.startswith("PAINT") else mb)
    _data_mode(sc, True)
    try:
        return shot(name + "_m", cw, px_w, px_h, render_dir, **kw)
    finally:
        _data_mode(sc, False)
        _slot_restore(stash)


def _mat_rough(m):
    if "rough" in m:
        return float(m["rough"])
    nt = getattr(m, "node_tree", None)
    if nt:
        for n in nt.nodes:
            if n.type == "BSDF_PRINCIPLED":
                try:
                    return float(n.inputs["Roughness"].default_value)
                except Exception:
                    pass
    return 0.8


def pass_rough(name, cw, px_w, px_h, render_dir, **kw):
    """Grayscale roughness per material, emitted flat under the Raw transform."""
    sc = bpy.context.scene
    cache = {}

    def pick(m):
        r = round(_mat_rough(m), 3)
        key = "ROUGH_%0.3f" % r
        if key not in cache:
            cache[key] = emis(key, (r, r, r))
        return cache[key]

    stash = _slot_swap(pick)
    _data_mode(sc, True)
    try:
        return shot(name + "_r", cw, px_w, px_h, render_dir, **kw)
    finally:
        _data_mode(sc, False)
        _slot_restore(stash)


# ---- materials -----------------------------------------------------------------------

def mat(name, color, metallic=0.0, rough=0.6, alpha=1.0, coat=0.0, bump=0.0,
        bump_scale=6.0, emit=None, emit_str=0.0, specular=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    m["rough"] = rough
    if specular is not None:
        for key in ("Specular IOR Level", "Specular"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = specular
                break
    if coat > 0:
        try:
            bsdf.inputs["Coat Weight"].default_value = coat
        except KeyError:
            pass
    if emit is not None:
        try:
            bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emit_str
        except KeyError:
            pass
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        _blended(m)
    if bump > 0:
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = bump_scale
        tex.inputs["Detail"].default_value = 4.0
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump
        nt.links.new(tex.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def _blended(m):
    for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
        try:
            setattr(m, attr, val)
        except Exception:
            pass
    try:
        m.shadow_method = "NONE"
    except Exception:
        pass


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
    m["rough"] = 0.9
    return m


def mix_rgb(nt):
    """ShaderNodeMix in RGBA mode. Its sockets share NAMES ("A" is a float, a
    vector and a colour), so pick them by identifier or the link goes to the
    float socket and does nothing."""
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    sock = lambda coll, ident: next(s for s in coll if s.identifier == ident)
    return (mix, sock(mix.inputs, "Factor_Float"), sock(mix.inputs, "A_Color"),
            sock(mix.inputs, "B_Color"), sock(mix.outputs, "Result_Color"))


def _obj_coords(nt):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    return tc.outputs["Object"]


def batter_mat(name, base=(0.92, 0.52, 0.13), dark=(0.44, 0.17, 0.035), light=(1.0, 0.76, 0.32),
               scale=2.4, bump=1.1, rough=0.68, toast=0.3):
    """Breaded batter: a crumb noise drives the bump AND a colour ramp (darker in
    the crevices, paler on the crests), a second big noise toasts patches."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    m["rough"] = rough
    oc = _obj_coords(nt)
    crumb = nt.nodes.new("ShaderNodeTexNoise")
    crumb.inputs["Scale"].default_value = scale
    crumb.inputs["Detail"].default_value = 7.0
    crumb.inputs["Roughness"].default_value = 0.62
    nt.links.new(oc, crumb.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.36
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (*light, 1)
    mid = ramp.color_ramp.elements.new(0.52)
    mid.color = (*base, 1)
    nt.links.new(crumb.outputs["Fac"], ramp.inputs["Fac"])
    toastn = nt.nodes.new("ShaderNodeTexNoise")
    toastn.inputs["Scale"].default_value = scale * 0.28
    toastn.inputs["Detail"].default_value = 2.0
    nt.links.new(oc, toastn.inputs["Vector"])
    tr = nt.nodes.new("ShaderNodeMapRange")
    tr.inputs["From Min"].default_value = 0.42
    tr.inputs["From Max"].default_value = 0.62
    tr.inputs["To Max"].default_value = toast
    tr.clamp = True
    nt.links.new(toastn.outputs["Fac"], tr.inputs["Value"])
    mix, mfac, ma, mb, mout = mix_rgb(nt)
    mb.default_value = (dark[0] * 0.9, dark[1] * 0.8, dark[2] * 0.7, 1)
    nt.links.new(ramp.outputs["Color"], ma)
    nt.links.new(tr.outputs["Result"], mfac)
    nt.links.new(mout, bsdf.inputs["Base Color"])
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = bump
    bp.inputs["Distance"].default_value = 0.6
    nt.links.new(crumb.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def flaked_mat(name, batter, steel_color=(0.5, 0.5, 0.53), scale=0.75, lo=0.5, hi=0.56):
    """Battered state: the batter has flaked off in patches and bare steel shows.
    Mix Shader between a copy of the batter chain and a metal, by a thresholded
    big noise."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = batter.copy()
    m.name = name
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    steel = nt.nodes.new("ShaderNodeBsdfPrincipled")
    steel.inputs["Base Color"].default_value = (*steel_color, 1)
    steel.inputs["Metallic"].default_value = 0.85
    steel.inputs["Roughness"].default_value = 0.42
    n2 = nt.nodes.new("ShaderNodeTexNoise")
    n2.inputs["Scale"].default_value = scale
    n2.inputs["Detail"].default_value = 3.0
    nt.links.new(_obj_coords(nt), n2.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = lo
    mr.inputs["From Max"].default_value = hi
    mr.clamp = True
    nt.links.new(n2.outputs["Fac"], mr.inputs["Value"])
    mixs = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mr.outputs["Result"], mixs.inputs["Fac"])
    nt.links.new(bsdf.outputs[0], mixs.inputs[1])
    nt.links.new(steel.outputs[0], mixs.inputs[2])
    for l in list(out.inputs[0].links):
        nt.links.remove(l)
    nt.links.new(mixs.outputs[0], out.inputs[0])
    m["rough"] = 0.55
    return m


def char_mat(name="BOT_CHAR"):
    """Burnt through: near-black carbon with faint ember-brown in the crevices."""
    return batter_mat(name, base=(0.05, 0.045, 0.04), dark=(0.015, 0.012, 0.01),
                      light=(0.16, 0.08, 0.035), scale=2.8, bump=1.2, rough=0.92, toast=0.0)


def bot_mats(kind="dicer"):
    M = dict(
        steel=mat("BOT_STEEL", (0.56, 0.57, 0.6), metallic=0.85, rough=0.36, bump=0.06, bump_scale=30),
        steel_dark=mat("BOT_STEEL_DK", (0.3, 0.31, 0.34), metallic=0.8, rough=0.48),
        bolt=mat("BOT_BOLT", (0.72, 0.72, 0.75), metallic=0.9, rough=0.3),
        rubber=mat("BOT_RUBBER", (0.035, 0.035, 0.038), rough=0.88, bump=0.35, bump_scale=9),
        hub=mat("BOT_HUB", (0.62, 0.6, 0.58), metallic=0.9, rough=0.32),
        under=mat("BOT_UNDER", (0.06, 0.06, 0.07), rough=0.8),
        rust=mat("BOT_RUST", (0.22, 0.1, 0.045), rough=0.9, bump=0.5, bump_scale=5),
        scorched=mat("BOT_SCORCHED", (0.075, 0.068, 0.062), metallic=0.3, rough=0.85, bump=0.35, bump_scale=6),
        paint=mat("PAINT_SAUCE", (0.84, 0.84, 0.87), rough=0.2, coat=0.6, bump=0.12, bump_scale=3),
        paint_burnt=mat("PAINT_SAUCE_BURNT", (0.3, 0.3, 0.32), rough=0.7, bump=0.3, bump_scale=4),
        char=char_mat(),
        hole=mat("BOT_HOLE", (0.012, 0.01, 0.01), rough=0.9),
    )
    if kind == "brick":
        M["batter"] = batter_mat("NUG_BATTER_TRIPLE", base=(0.8, 0.4, 0.09), dark=(0.32, 0.12, 0.02),
                                 light=(0.95, 0.64, 0.24), scale=1.6, bump=1.4, rough=0.72, toast=0.45)
    elif kind == "tender":
        M["batter"] = batter_mat("NUG_BATTER_MID", base=(0.9, 0.54, 0.16), dark=(0.42, 0.18, 0.04),
                                 light=(1.0, 0.78, 0.36), scale=2.2, bump=1.1)
    else:
        M["batter"] = batter_mat("NUG_BATTER")
    M["flaked"] = flaked_mat(M["batter"].name + "_FLAKED", M["batter"])
    return M


# ---- geometry helpers ------------------------------------------------------------------

def _link(o):
    bpy.context.collection.objects.link(o)
    return o


def mesh_obj(name, verts, faces, m=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    me.update()
    o = bpy.data.objects.new(name, me)
    _link(o)
    if m:
        me.materials.append(m)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return o


def prism(name, poly, z0, z1, m, x=0, y=0, smooth=False):
    """Extrude a CCW 2D polygon between z0 and z1."""
    n = len(poly)
    verts = [(px + x, py + y, z0) for px, py in poly] + [(px + x, py + y, z1) for px, py in poly]
    faces = [list(range(n))[::-1], list(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return mesh_obj(name, verts, faces, m, smooth)


def box(name, sx, sy, sz, x=0, y=0, z=0, m=None, bevel=0.0, seg=3, pivot=False):
    """pivot=True bakes the placement into the MESH and leaves the object origin
    at the world origin — for parts that swing about an edge (the flipper)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=pivot, rotation=False, scale=True)
    if bevel > 0:
        bv = o.modifiers.new("bv", "BEVEL")
        bv.width = min(bevel, min(sx, sy, sz) * 0.49)
        bv.segments = seg
        bv.limit_method = "ANGLE"
    if m:
        o.data.materials.append(m)
    return o


def cyl(name, r, depth, x=0, y=0, z=0, m=None, rot=(0, 0, 0), verts=32, bevel=0.0, caps=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth,
                                        location=(x, y, z), rotation=rot,
                                        end_fill_type=("NGON" if caps else "NOTHING"))
    o = bpy.context.active_object
    o.name = name
    if bevel > 0:
        bv = o.modifiers.new("bv", "BEVEL")
        bv.width = bevel
        bv.segments = 3
        bv.limit_method = "ANGLE"
    if m:
        o.data.materials.append(m)
    return o


def sph(name, r, x=0, y=0, z=0, m=None, squash=1.0, sx=1.0, sy=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=r, location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    if squash != 1.0 or sx != 1.0 or sy != 1.0:
        o.scale = (sx, sy, squash)
        # explicit: Blender 5.2 defaults location=True, which would bake the
        # placement into the mesh and leave the origin at world 0 -- fine until
        # a caller rotates the object, which then swings about (0,0)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    if m:
        o.data.materials.append(m)
    return o


def torus(name, R, r, x=0, y=0, z=0, m=None, rot=(0, 0, 0), segs=(48, 16)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=segs[0],
                                     minor_segments=segs[1], location=(x, y, z), rotation=rot)
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.shade_smooth()
    if m:
        o.data.materials.append(m)
    return o


def plane(name, sx, sy, m, x=0, y=0, z=0):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if m:
        o.data.materials.append(m)
    return o


_disp_ref = {}


def nugget(name, sx, sy, sz, x=0, y=0, z=0, m=None, seed=0, lump=0.9, lump_scale=None):
    """A nugget: squashed sphere with cloud displacement for the lumpy outline,
    the crumb detail comes from the material's bump. `seed` moves the noise
    field (Displace reads an offset empty's object space)."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=40, radius=1.0, location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    tx = bpy.data.textures.get("nugclouds_%d" % seed)
    if not tx:
        tx = bpy.data.textures.new("nugclouds_%d" % seed, "CLOUDS")
        tx.noise_scale = lump_scale or (max(sx, sy) * 0.45)
        tx.noise_depth = 2
    ref = bpy.data.objects.new("dispRef_%s" % name, None)
    _link(ref)
    rnd = random.Random(seed)
    ref.location = (rnd.uniform(-50, 50), rnd.uniform(-50, 50), rnd.uniform(-50, 50))
    ref.hide_render = True
    md = o.modifiers.new("disp", "DISPLACE")
    md.texture = tx
    md.strength = lump
    md.mid_level = 0.5
    md.texture_coords = "OBJECT"
    md.texture_coords_object = ref
    if m:
        o.data.materials.append(m)
    return o


def cut(target, cutter):
    """Boolean-difference `cutter` out of `target`; the cutter never renders."""
    cutter.hide_render = True
    cutter.hide_viewport = True  # the Rendered viewport ignores hide_render
    cutter.display_type = "WIRE"
    md = target.modifiers.new("cut", "BOOLEAN")
    md.operation = "DIFFERENCE"
    md.object = cutter
    try:
        md.solver = "EXACT"
    except Exception:
        pass
    return target


def dent(target, x, y, z, r, m_dark=None):
    c = sph("dentcut", r, x, y, z)
    cut(target, c)
    return c


def gear_profile(n, r_out, r_in, duty=0.5, sub=2):
    """CCW polygon: n lugs alternating r_out/r_in."""
    pts = []
    step = 2 * math.pi / n
    for i in range(n):
        a0 = i * step
        for k in range(sub):
            pts.append((a0 + step * duty * k / sub, r_out))
        for k in range(sub):
            pts.append((a0 + step * (duty + (1 - duty) * k / sub), r_in))
    return [(r * math.cos(a), r * math.sin(a)) for a, r in pts]


def saw_profile(n, r_out, r_in):
    """CCW polygon of hooked saw teeth (a flat rake face, a sloped back)."""
    pts = []
    step = 2 * math.pi / n
    for i in range(n):
        a0 = i * step
        pts.append((a0, r_in))
        pts.append((a0 + step * 0.55, r_out))
        pts.append((a0 + step * 0.62, r_out * 0.97))
    return [(r * math.cos(a), r * math.sin(a)) for a, r in pts]


def wheel(name, x, y, r, w, M, z=None, yaw=0.0, lugs=14):
    """Knobby RC wheel, axle along X: gear prism rotated onto its side + hub."""
    z = r if z is None else z
    o = prism(name, gear_profile(lugs, r, r * 0.86, duty=0.55), -w / 2, w / 2, M["rubber"])
    o.location = (x, y, z)
    o.rotation_euler = (0, math.pi / 2, yaw)
    h = cyl(name + "_hub", r * 0.55, w + 0.15, x, y, z, M["hub"], rot=(0, math.pi / 2, yaw), verts=24)
    b = cyl(name + "_nut", r * 0.18, w + 0.5, x, y, z, M["bolt"], rot=(0, math.pi / 2, yaw), verts=6)
    return [o, h, b]


def bolt(x, y, z, r=0.36, h=0.32, m=None):
    return cyl("bolt", r, h, x, y, z + h / 2, m or bpy.data.materials["BOT_BOLT"], verts=6)


def armor_plate(name, sx, sy, x, y, z, M, tilt=(0, 0, 0), thick=0.55, bolts=True, m=None):
    p = box(name, sx, sy, thick, x, y, z, m or M["steel"], bevel=0.18, seg=2)
    p.rotation_euler = tilt
    objs = [p]
    if bolts:
        for bx in (-1, 1):
            for by in (-1, 1):
                b = bolt(bx * (sx / 2 - 0.65), by * (sy / 2 - 0.65), thick / 2, m=M["bolt"])
                b.parent = p  # no inverse: bolt coords are plate-local
                objs.append(b)
    return objs


def sauce_glob(r, x, y, z, m, sy=1.0, drips=()):
    """The team-colour sauce: a glossy squashed glob (PAINT_*) plus a drip or two.
    Named `sauce` so the damage pass can find it."""
    objs = [sph("sauce", r, x, y, z, m, squash=0.42, sx=1.0, sy=sy)]
    for (dx, dy, dr) in drips:
        objs.append(sph("saucedrip", dr, dx, dy, z - 0.1, m, squash=0.45))
    return objs


def wedge(name, w, depth, z_lo, z_hi, y_front, m, x=0):
    """A scraper wedge: flat underside, sloped top rising from the front tip."""
    yb = y_front - depth
    verts = [(-w / 2, yb, z_lo), (w / 2, yb, z_lo), (w / 2, y_front, z_lo), (-w / 2, y_front, z_lo),
             (-w / 2, yb, z_hi), (w / 2, yb, z_hi)]
    faces = [(0, 3, 2, 1), (0, 1, 5, 4), (3, 0, 4), (1, 2, 5), (2, 3, 4, 5)]
    o = mesh_obj(name, verts, faces, m)
    o.location.x = x
    bv = o.modifiers.new("bv", "BEVEL")
    bv.width = 0.25
    bv.segments = 2
    bv.limit_method = "ANGLE"
    return o


# ---- THE CHASSIS -----------------------------------------------------------------------

def make_bot(kind, state):
    """One chassis at the origin, nose +Y. state 0 pristine, 1 battered, 2 wreck."""
    L, W = BOT_DIMS[kind]
    M = bot_mats(kind)
    rnd = random.Random(hash((kind, state)) & 0xFFFF)
    wreck, battered = state == 2, state == 1
    batter = M["batter"] if state == 0 else (M["flaked"] if battered else M["char"])
    steel = M["steel"] if not wreck else M["scorched"]
    steel_dk = M["steel_dark"] if not wreck else M["scorched"]
    paint = M["paint"] if not wreck else M["paint_burnt"]
    boltm = M["bolt"] if not wreck else M["steel_dark"]
    drop = 1.7 if wreck else 0.0
    objs = []
    plates = []

    def T(o):
        if isinstance(o, list):
            objs.extend(o)
        else:
            objs.append(o)
        return o

    def P(*a, **k):
        k.setdefault("m", steel)
        ps = armor_plate(*a, **k)
        plates.append(ps)
        objs.extend(ps)
        return ps

    if kind == "dicer":
        bw, bl = W / 2 - 2.0, L / 2 - 2.6
        body = T(nugget("body", bw, bl, 2.5, y=-1.2, z=3.1 - drop, m=batter, seed=11, lump=1.0))
        T(box("under", W - 5, L - 7, 1.4, y=-1.0, z=0.9 - drop, m=M["under"], bevel=0.3))
        T(wedge("wedge", W - 3.4, 5.5, 0.5 - drop, 2.9 - drop, L / 2 - 0.2, steel_dk))
        for i, (bx, by) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
            T(bolt(bx * (W / 2 - 3.2), L / 2 - 4.6 + by * 0.0, 2.3 - drop, r=0.34, m=boltm))
        if not wreck:
            for sx in (-1, 1):
                T(wheel("whF%d" % sx, sx * (W / 2 - 1.15), L / 2 - 5.3, 2.7, 2.4, M,
                        yaw=(math.radians(14) if battered and sx > 0 else 0)))
                T(wheel("whR%d" % sx, sx * (W / 2 - 1.15), -L / 2 + 3.6, 2.7, 2.4, M))
        top = 5.8 - drop
        P("plateL", 3.2, 6.5, -(W / 2 - 3.3), -0.6, top - 0.3, M, tilt=(0, math.radians(-16), 0))
        if not battered:
            P("plateR", 3.2, 6.5, (W / 2 - 3.3), -0.6, top - 0.3, M, tilt=(0, math.radians(16), 0))
        P("plateB", 4.6, 2.4, 0, -L / 2 + 2.6, top - 1.3, M, tilt=(math.radians(-20), 0, 0))
        T(sauce_glob(2.6, 0, -2.2, top - 0.6, paint, sy=1.35, drips=((1.9, -4.6, 0.6), (-1.6, 0.4, 0.5))))
        T(cyl("hubpost", 1.25, 1.6, 0, L / 2 - 4.4, top - 0.2, steel_dk, verts=16))
        T(cyl("hubnut", 0.5, 0.6, 0, L / 2 - 4.4, top + 0.6, boltm, verts=6))
        T(cyl("ant", 0.18, 4.0, -(W / 2 - 4.2), -L / 2 + 4.0, top + 0.6, steel_dk, rot=(math.radians(25), 0, 0), verts=8))
    elif kind == "tender":
        bw, bl = W / 2 - 2.3, L / 2 - 3.6
        body = T(nugget("body", bw, bl, 2.8, y=-2.4, z=3.3 - drop, m=batter, seed=23, lump=1.1))
        T(box("under", W - 5, L - 6, 1.6, y=-1.0, z=0.9 - drop, m=M["under"], bevel=0.3))
        hinge_y = L / 2 - 7.6
        T(cyl("hinge", 0.7, W - 5, 0, hinge_y, 2.9 - drop, steel_dk, rot=(0, math.pi / 2, 0), verts=16))
        fl = box("flipper", W - 4.2, 7.4, 0.8, 0, 3.7, -0.4, m=steel, bevel=0.25, seg=2, pivot=True)
        fl.location = (0, hinge_y, 2.9 - drop)
        fl.rotation_euler = (math.radians(-7), 0, 0) if not wreck else (math.radians(-4), 0, math.radians(6))
        T(fl)
        for bx in (-1, 1):
            for by in (1.5, 5.5):
                b = bolt(bx * (W / 2 - 3.0), by, 0.4, m=boltm)
                b.parent = fl
                T(b)
        for sx in (-1, 1):
            T(cyl("ram%d" % sx, 1.0, 6.0, sx * (W / 2 - 3.4), hinge_y - 3.2, 1.9 - drop, steel_dk,
                  rot=(math.pi / 2, 0, 0), verts=16))
        if not wreck:
            for sx in (-1, 1):
                T(wheel("whF%d" % sx, sx * (W / 2 - 1.3), L / 2 - 6.3, 2.9, 2.6, M,
                        yaw=(math.radians(-12) if battered and sx < 0 else 0)))
                T(wheel("whR%d" % sx, sx * (W / 2 - 1.3), -L / 2 + 4.0, 2.9, 2.6, M))
        top = 6.4 - drop
        P("plateT", 6.0, 4.4, 0, -6.4, top - 0.7, M, tilt=(math.radians(10), 0, 0), thick=0.8)
        if not battered:
            P("skirtL", 2.6, 7.0, -(W / 2 - 3.4), -2.5, top - 1.0, M, tilt=(0, math.radians(-22), 0))
        P("skirtR", 2.6, 7.0, (W / 2 - 3.4), -2.5, top - 1.0, M, tilt=(0, math.radians(22), 0))
        T(sauce_glob(2.9, 0, -1.6, top - 0.6, paint, sy=1.1, drips=((2.4, -3.6, 0.6), (-2.6, 0.8, 0.5))))
        T(cyl("tank", 1.1, 5.0, 0, -L / 2 + 5.0, top - 0.6, steel_dk, rot=(0, math.pi / 2, 0), verts=16))
    else:  # brick
        bw, bl = W / 2 - 2.4, L / 2 - 4.0
        body = T(nugget("body", bw, bl, 3.4, y=-1.4, z=3.6 - drop, m=batter, seed=37, lump=1.5))
        T(box("under", W - 5, L - 7, 1.8, y=-1.2, z=0.9 - drop, m=M["under"], bevel=0.3))
        T(wedge("wedge", W - 2.4, 7.0, 0.4 - drop, 3.4 - drop, L / 2 - 0.2, steel_dk))
        for bx in (-2, -1, 0, 1, 2):
            T(bolt(bx * 2.9, L / 2 - 6.2, 2.85 - drop, r=0.36, m=boltm))
        if not wreck:
            ys = (L / 2 - 7.0, -0.2, -L / 2 + 4.6)
            for sx in (-1, 1):
                for i, wy in enumerate(ys):
                    T(wheel("wh%d_%d" % (sx, i), sx * (W / 2 - 1.3), wy, 2.7, 2.6, M,
                            yaw=(math.radians(15) if battered and sx > 0 and i == 1 else 0)))
        top = 7.9 - drop
        pys = (-6.4, -1.8, 2.6)
        for i, py in enumerate(pys):
            if battered and i == 1:
                continue
            P("plate%d" % i, 8.2, 4.0, 0, py, top - 0.9 + i * 0.3, M,
              tilt=(math.radians(-8 + i * 6), 0, 0), thick=0.9)
        for sx in (-1, 1):
            T(box("rail%d" % sx, 1.2, L - 11, 1.0, sx * (W / 2 - 2.6), -1.5, top - 3.4, m=steel_dk, bevel=0.25))
        T(sauce_glob(3.1, 0, -L / 2 + 5.2, top - 1.3, paint, sy=0.85, drips=((2.8, -L / 2 + 2.4, 0.6), (-3.0, -L / 2 + 7.6, 0.55))))
        T(cyl("stack", 0.9, 3.2, (W / 2 - 4.4), -L / 2 + 6.0, top - 1.2, steel_dk, verts=12))
        T(cyl("stackhole", 0.55, 0.4, (W / 2 - 4.4), -L / 2 + 6.0, top + 0.4, M["hole"], verts=12))

    # ---- damage ----
    if battered:
        for ps in plates:
            p = ps[0]
            dent(p, p.location.x + rnd.uniform(-0.6, 0.6), p.location.y + rnd.uniform(-1.2, 1.2),
                 p.location.z + 0.95, 0.9)
        p0 = plates[0][0]
        p0.rotation_euler = (p0.rotation_euler.x + math.radians(rnd.uniform(6, 10)),
                             p0.rotation_euler.y + math.radians(rnd.uniform(-6, 6)), math.radians(4))
        sauce = next(o for o in objs if o.name == "sauce")
        stop = sauce.location.z + sauce.dimensions.z / 2 if sauce.dimensions.z else sauce.location.z + 1.1
        dent(sauce, sauce.location.x + 0.8, sauce.location.y - 0.5, stop + 0.45, 0.75)
        dent(sauce, sauce.location.x - 1.1, sauce.location.y + 1.2, stop + 0.35, 0.55)
        # a gouge in the batter
        g = sph("gouge", 1.6, body.location.x + rnd.uniform(-2, 2), body.location.y + rnd.uniform(-3, 3),
                body.location.z + 2.6, squash=0.6)
        cut(body, g)
    if wreck:
        crater = sph("crater", bw * 0.42, body.location.x + 0.8, body.location.y - 1.0,
                     body.location.z + 2.6, squash=0.7)
        cut(body, crater)
        T(sph("craterfloor", bw * 0.3, body.location.x + 0.8, body.location.y - 1.0,
              body.location.z + 1.0, m=M["hole"], squash=0.35))
        if plates:
            p0 = plates[0][0]
            p0.rotation_euler = (math.radians(38), math.radians(-12), math.radians(9))
            p0.location.z += 1.2
            p0.data.materials[0] = M["rust"]
        for ps in plates[1:]:
            ps[0].rotation_euler = (ps[0].rotation_euler.x + math.radians(rnd.uniform(-10, 10)),
                                    ps[0].rotation_euler.y + math.radians(rnd.uniform(-14, 14)),
                                    math.radians(rnd.uniform(-8, 8)))
        # axle stubs where wheels were
        for sx in (-1, 1):
            T(cyl("stub%d" % sx, 0.5, W - 5.5, 0, -L / 2 + 3.8, 1.2, M["rust"], rot=(0, math.pi / 2, 0), verts=10))
    return objs


# ---- bot layers --------------------------------------------------------------------------

def make_disc(kind):
    M = bot_mats()
    bright = mat("BOT_STEEL_BRIGHT", (0.86, 0.87, 0.9), metallic=0.95, rough=0.18)
    objs = []
    if kind == "disc_still":
        d = prism("disc", saw_profile(10, 9.4, 7.6), 0.0, 0.9, M["steel"])
        bv = d.modifiers.new("bv", "BEVEL")
        bv.width = 0.2
        bv.segments = 2
        objs.append(d)
        for i in range(10):
            a = i * 2 * math.pi / 10 + 0.25
            objs.append(cyl("hole", 0.7, 1.4, 5.4 * math.cos(a), 5.4 * math.sin(a), 0.45, M["hole"], verts=12))
    elif kind == "disc_spin":
        objs.append(cyl("core", 7.4, 0.9, 0, 0, 0.45, M["steel"], verts=64))
        streak = prism("streak", gear_profile(36, 9.3, 8.9, duty=0.5, sub=1), 0.0, 0.8, M["steel_dark"])
        objs.append(streak)
        ring = cyl("ring", 8.95, 0.85, 0, 0, 0.42, M["steel"], verts=64)
        objs.append(ring)
        for i in range(36):
            a = i * 2 * math.pi / 36
            objs.append(box("blur", 0.25, 2.0, 0.05, 6.2 * math.cos(a), 6.2 * math.sin(a), 0.9, m=M["steel_dark"]))
            objs[-1].rotation_euler = (0, 0, a + math.pi / 2)
    else:  # disc_blur
        objs.append(cyl("core", 9.4, 0.9, 0, 0, 0.45, M["steel"], verts=96))
        rim = torus("rim", 8.9, 0.42, 0, 0, 0.92, bright, segs=(96, 12))
        objs.append(rim)
        objs.append(cyl("ring2", 7.3, 0.12, 0, 0, 0.92, M["steel_dark"], verts=96))
    objs.append(cyl("hub", 2.4, 1.6, 0, 0, 0.8, M["steel_dark"], verts=32, bevel=0.2))
    objs.append(cyl("hubnut", 0.9, 0.7, 0, 0, 1.75, M["bolt"], verts=6))
    if kind != "disc_blur":
        for i in range(6):
            a = i * math.pi / 3
            objs.append(bolt(1.7 * math.cos(a), 1.7 * math.sin(a), 1.6, r=0.3, h=0.3))
    return objs


def make_flipper_up():
    M = bot_mats("tender")
    W = 16
    objs = []
    hinge_y = -3.6
    objs.append(cyl("hinge", 0.8, W - 4.6, 0, hinge_y, 2.9, M["steel_dark"], rot=(0, math.pi / 2, 0), verts=16))
    fl = box("flipper", W - 4.2, 7.4, 0.8, 0, 3.7, -0.4, m=M["steel"], bevel=0.25, seg=2, pivot=True)
    fl.location = (0, hinge_y, 2.9)
    fl.rotation_euler = (math.radians(-68), 0, 0)
    objs.append(fl)
    for bx in (-1, 1):
        for by in (1.5, 5.5):
            b = bolt(bx * (W / 2 - 3.0), by, 0.4, m=M["bolt"])
            b.parent = fl
            objs.append(b)
    for sx in (-1, 1):
        r = cyl("ram%d" % sx, 1.0, 7.5, sx * (W / 2 - 3.4), hinge_y + 1.0, 4.2, M["steel_dark"],
                rot=(math.radians(-50), 0, 0), verts=16)
        objs.append(r)
        objs.append(cyl("rod%d" % sx, 0.5, 5.0, sx * (W / 2 - 3.4), hinge_y + 3.6, 7.0, M["bolt"],
                        rot=(math.radians(-50), 0, 0), verts=12))
    return objs


SAUCES = {
    "minigun": dict(body=(0.72, 0.07, 0.04), cap=(0.95, 0.95, 0.95), label=(0.9, 0.88, 0.82), r=2.1, L=6.6),
    "flamer": dict(body=(0.85, 0.28, 0.04), cap=(0.15, 0.15, 0.15), label=(0.95, 0.75, 0.2), r=1.7, L=7.4),
    "mortar": dict(body=(0.22, 0.09, 0.04), cap=(0.7, 0.55, 0.15), label=(0.85, 0.6, 0.2), r=2.6, L=5.4),
    "rocket": dict(body=(0.88, 0.68, 0.05), cap=(0.75, 0.1, 0.05), label=(0.3, 0.12, 0.05), r=2.0, L=6.8),
    "emp": dict(body=(0.92, 0.92, 0.88), cap=(0.15, 0.35, 0.65), label=(0.2, 0.45, 0.75), r=2.1, L=6.2),
    "nitro": dict(body=(0.1, 0.35, 0.9), cap=(0.7, 0.72, 0.75), label=(0.95, 0.95, 0.95), r=1.8, L=7.0),
}


def make_bottle(kind, scale=1.0, y0=0.0, z=0.0):
    """A sauce bottle lying on its side, nozzle toward +Y."""
    S = SAUCES[kind]
    plastic = mat("SAUCE_" + kind, S["body"], rough=0.28, coat=0.5)
    capm = mat("SAUCECAP_" + kind, S["cap"], rough=0.4)
    labm = mat("SAUCELAB_" + kind, S["label"], rough=0.6)
    r, L = S["r"] * scale, S["L"] * scale
    objs = []
    y = y0 - L * 0.15
    body = cyl("bottle", r, L, 0, y, z + r, plastic, rot=(math.pi / 2, 0, 0), verts=32)
    objs.append(body)
    objs.append(sph("butt", r, 0, y - L / 2, z + r, plastic, squash=1.0, sy=0.55))
    lab = cyl("label", r * 1.03, L * 0.42, 0, y - L * 0.05, z + r, labm, rot=(math.pi / 2, 0, 0), verts=32)
    objs.append(lab)
    sh = cyl("shoulder", r * 0.62, L * 0.18, 0, y + L / 2 + L * 0.08, z + r, plastic, rot=(math.pi / 2, 0, 0), verts=24)
    objs.append(sh)
    neck_y = y + L / 2 + L * 0.24
    objs.append(cyl("cap", r * 0.5, L * 0.22, 0, neck_y, z + r, capm, rot=(math.pi / 2, 0, 0), verts=20))
    tip = neck_y + L * 0.11
    dark = mat("BOT_STEEL_DK", (0.3, 0.31, 0.34), metallic=0.8, rough=0.48)
    boltm = mat("BOT_BOLT", (0.72, 0.72, 0.75), metallic=0.9, rough=0.3)
    if kind == "minigun":
        for i in range(3):
            a = i * 2 * math.pi / 3 + math.pi / 2
            objs.append(cyl("barrel%d" % i, 0.42 * scale, 4.0 * scale, 0.75 * scale * math.cos(a), tip + 1.6 * scale,
                            z + r + 0.75 * scale * math.sin(a), dark, rot=(math.pi / 2, 0, 0), verts=12))
        objs.append(cyl("collar", 1.2 * scale, 0.6 * scale, 0, tip + 0.6 * scale, z + r, boltm, rot=(math.pi / 2, 0, 0), verts=16))
    elif kind == "flamer":
        objs.append(cyl("nozzle", 0.5 * scale, 2.6 * scale, 0, tip + 1.2 * scale, z + r, dark, rot=(math.pi / 2, 0, 0), verts=12))
        bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.5 * scale, radius2=1.3 * scale, depth=1.4 * scale,
                                        location=(0, tip + 2.9 * scale, z + r), rotation=(math.pi / 2, 0, 0))
        cone = bpy.context.active_object
        cone.data.materials.append(dark)
        objs.append(cone)
        objs.append(cyl("pilot", 0.22 * scale, 2.0 * scale, 0.9 * scale, tip + 0.8 * scale, z + r + 0.6 * scale, boltm,
                        rot=(math.pi / 2, 0, 0), verts=8))
    elif kind == "mortar":
        tube = cyl("tube", 1.5 * scale, 3.6 * scale, 0, tip + 1.0 * scale, z + r + 0.8 * scale, dark,
                   rot=(math.radians(60), 0, 0), verts=20)
        objs.append(tube)
        objs.append(cyl("tubehole", 1.1 * scale, 0.6 * scale, 0, tip + 1.9 * scale, z + r + 2.35 * scale,
                        mat("BOT_HOLE", (0.012, 0.01, 0.01), rough=0.9), rot=(math.radians(60), 0, 0), verts=20))
    elif kind == "rocket":
        objs.append(cyl("rocket", 0.7 * scale, 3.4 * scale, 0, tip + 1.4 * scale, z + r, boltm, rot=(math.pi / 2, 0, 0), verts=14))
        bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=0.7 * scale, radius2=0.0, depth=1.2 * scale,
                                        location=(0, tip + 3.7 * scale, z + r), rotation=(-math.pi / 2, 0, 0))
        cone = bpy.context.active_object
        cone.data.materials.append(capm)
        objs.append(cone)
        for i in range(3):
            a = i * 2 * math.pi / 3 + math.pi / 2
            f = box("fin%d" % i, 0.25 * scale, 1.6 * scale, 1.1 * scale, 0, y - L / 2 + 0.9 * scale, z + r - 0.55 * scale, m=capm)
            f.rotation_euler = (0, a, 0)
            f.location = (0.9 * scale * math.cos(a) * 0 + 0, y - L / 2 + 0.9 * scale, z + r)
            objs.append(f)
    elif kind == "emp":
        for i in range(3):
            objs.append(torus("coil%d" % i, 1.1 * scale, 0.22 * scale, 0, tip + (0.6 + i * 0.7) * scale, z + r,
                              mat("BOT_COPPER", (0.72, 0.42, 0.2), metallic=0.9, rough=0.3),
                              rot=(math.pi / 2, 0, 0), segs=(32, 8)))
        objs.append(cyl("probe", 0.3 * scale, 3.4 * scale, 0, tip + 1.6 * scale, z + r, dark, rot=(math.pi / 2, 0, 0), verts=10))
    elif kind == "nitro":
        objs.append(cyl("valve", 0.55 * scale, 1.4 * scale, 0, tip + 0.5 * scale, z + r, boltm, rot=(math.pi / 2, 0, 0), verts=12))
        objs.append(cyl("handle", 0.25 * scale, 2.2 * scale, 0, tip + 0.9 * scale, z + r, boltm, rot=(0, math.pi / 2, 0), verts=8))
    return objs


def make_turret(kind):
    M = bot_mats()
    objs = [torus("ring", 4.6, 0.55, 0, 0, 0.55, M["steel_dark"], segs=(48, 12)),
            cyl("base", 4.2, 0.6, 0, 0, 0.3, M["steel"], verts=48)]
    for i in range(8):
        a = i * math.pi / 4
        objs.append(bolt(3.6 * math.cos(a), 3.6 * math.sin(a), 0.6, r=0.3, h=0.3))
    for sx in (-1, 1):
        objs.append(box("cradle%d" % sx, 0.8, 4.0, 2.6, sx * 2.6, -1.0, 0.6, m=M["steel_dark"], bevel=0.15))
    objs += make_bottle(kind, scale=1.0, y0=0.6, z=1.0)
    return objs


def make_pickup(kind):
    return make_bottle(kind, scale=0.8, y0=0.0, z=0.0)


# ---- arena props ------------------------------------------------------------------------------

def prop_mats():
    return dict(
        rubber=mat("BOT_RUBBER", (0.035, 0.035, 0.038), rough=0.88, bump=0.35, bump_scale=9),
        steel=mat("BOT_STEEL", (0.56, 0.57, 0.6), metallic=0.85, rough=0.36, bump=0.06, bump_scale=30),
        steel_dk=mat("BOT_STEEL_DK", (0.3, 0.31, 0.34), metallic=0.8, rough=0.48),
        iron=mat("PROP_IRON", (0.22, 0.22, 0.24), metallic=0.7, rough=0.55, bump=0.2, bump_scale=8),
        bolt=mat("BOT_BOLT", (0.72, 0.72, 0.75), metallic=0.9, rough=0.3),
        hole=mat("BOT_HOLE", (0.012, 0.01, 0.01), rough=0.9),
        concrete=mat("PIT_CONC", (0.36, 0.355, 0.34), rough=0.8, bump=0.25, bump_scale=3),
        wet=mat("PIT_WET", (0.02, 0.024, 0.028), rough=0.06, coat=0.3),
        # specular 0: a black dielectric under a grey dome renders grey (49/255)
        # from its Fresnel alone, and a hole has to read as a HOLE
        shaft=mat("PIT_SHAFT", (0.004, 0.004, 0.005), rough=0.7, specular=0.0),
        drum=mat("PROP_DRUM", (0.12, 0.2, 0.24), metallic=0.4, rough=0.5, bump=0.15, bump_scale=6),
        drumrust=mat("BOT_RUST", (0.3, 0.15, 0.07), rough=0.9, bump=0.5, bump_scale=5),
        alu=mat("PROP_ALU", (0.7, 0.71, 0.73), metallic=0.9, rough=0.3, bump=0.05, bump_scale=20),
        cord=mat("PROP_CORD", (0.9, 0.55, 0.1), rough=0.6),
        glass=mat("PROP_GLASS", (0.03, 0.06, 0.09), metallic=0.4, rough=0.06, coat=0.8),
        booth=mat("PROP_BOOTH", (0.16, 0.17, 0.2), metallic=0.5, rough=0.5, bump=0.1, bump_scale=10),
        red=mat("PROP_RED", (0.55, 0.06, 0.04), rough=0.4),
        white=mat("PROP_WHITE", (0.85, 0.85, 0.82), rough=0.5),
    )


def make_grate(cx=0.0, cy=0.0, r=26.0, z=0.0, M=None):
    """The closed drain grate: steel ring frame, bars along X clipped to the
    circle, two cross straps, black shaft beneath. Shared by the `grate`
    sprite and the floor page so they register."""
    M = M or prop_mats()
    objs = []
    frame = cyl("gframe", r, 1.2, cx, cy, z + 0.6, M["steel_dk"], verts=96, bevel=0.2)
    hole = cyl("gframecut", r - 2.2, 3.0, cx, cy, z + 0.6, None, verts=96)
    cut(frame, hole)
    objs.append(frame)
    objs.append(cyl("gshaft", r - 1.5, 0.3, cx, cy, z - 3.0, M["shaft"], verts=64))
    ri = r - 2.0
    yb = -ri + 2.0
    while yb < ri - 1.0:
        half = math.sqrt(max(ri * ri - yb * yb, 0.0)) - 0.2
        objs.append(box("gbar", half * 2, 1.4, 1.0, cx, cy + yb, z, m=M["steel"], bevel=0.2, seg=2))
        yb += 3.6
    for bx in (-8.5, 8.5):
        objs.append(box("gstrap", 1.1, (ri - 1.0) * 2 * math.sqrt(1 - (bx / ri) ** 2), 1.1, cx + bx, cy, z + 0.05,
                        m=M["steel_dk"], bevel=0.15, seg=2))
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 8
        objs.append(bolt(cx + (r - 1.1) * math.cos(a), cy + (r - 1.1) * math.sin(a), z + 1.2, r=0.55, h=0.35, m=M["bolt"]))
    return objs


def make_prop(name):
    M = prop_mats()
    objs = []

    def T(o):
        if isinstance(o, list):
            objs.extend(o)
        else:
            objs.append(o)
        return o

    if name == "tire":
        T(torus("tire", 2.55, 1.15, 0, 0, 1.15, M["rubber"], segs=(64, 20)))
        T(cyl("tirehole", 1.4, 0.2, 0, 0, 0.1, M["hole"], verts=32))
        for i in range(18):
            a = i * 2 * math.pi / 18
            b = box("lug", 0.5, 1.6, 0.25, 2.55 * math.cos(a), 2.55 * math.sin(a), 2.15, m=M["rubber"])
            b.rotation_euler = (0, 0, a + math.pi / 2)
            T(b)
    elif name == "drum":
        T(cyl("drum", 4.4, 8.0, 0, 0, 4.0, M["drum"], verts=48, bevel=0.3))
        T(torus("rib1", 4.4, 0.35, 0, 0, 6.2, M["drum"], segs=(48, 10)))
        T(cyl("lid", 4.0, 0.3, 0, 0, 8.05, M["drumrust"], verts=48))
        T(torus("lidrim", 4.15, 0.3, 0, 0, 8.1, M["drum"], segs=(48, 10)))
        T(cyl("bung", 0.8, 0.5, 2.2, 1.4, 8.3, M["steel_dk"], verts=16))
        T(cyl("bung2", 0.5, 0.5, -2.4, -1.0, 8.3, M["steel_dk"], verts=12))
    elif name == "lamp":
        dome = T(sph("dome", 4.3, 0, 0.6, 6.0, M["alu"], squash=0.55))
        T(cyl("neck", 0.8, 3.0, 0, 0.6, 7.6, M["steel_dk"], verts=16))
        T(torus("hook", 1.4, 0.25, 0, 0.6, 9.6, M["steel_dk"], rot=(math.pi / 2, 0, 0), segs=(32, 8)))
        T(box("arm", 1.0, 4.0, 1.0, 0, -3.4, 6.0, m=M["steel_dk"], bevel=0.2))
        T(box("clamp", 3.2, 2.0, 2.2, 0, -5.0, 5.0, m=M["red"], bevel=0.4))
        T(box("jaw", 3.6, 0.7, 1.6, 0, -6.2, 5.2, m=M["steel_dk"], bevel=0.2))
        for i in range(6):
            a = -0.9 + i * 0.35
            T(cyl("cord", 0.25, 1.4, 1.8 + math.sin(a * 3) * 0.6, -3.5 - i * 1.1, 4.0, M["cord"],
                  rot=(math.pi / 2, 0, a * 0.3), verts=8))
        for i in range(4):
            a = i * math.pi / 2 + math.pi / 4
            T(box("cage", 0.3, 5.6, 0.3, 0, 0.6, 8.2, m=M["steel_dk"]))
            objs[-1].rotation_euler = (0, 0, a)
    elif name == "blade":
        pts = [(-13.0, -2.6), (13.0, -2.6), (13.0, 1.4)]
        n, tw = 14, 26.0 / 14
        for i in range(n - 1, -1, -1):  # teeth walk the top edge right -> left
            x0 = -13.0 + i * tw
            pts.append((x0 + tw * 0.55, 3.0))
            pts.append((x0, 1.4))
        d = prism("blade", pts, 0.6, 1.4, M["steel"])
        bv = d.modifiers.new("bv", "BEVEL")
        bv.width = 0.15
        bv.segments = 2
        T(d)
        T(box("rail", 26.6, 1.8, 1.4, 0, -3.6, 0, m=M["steel_dk"], bevel=0.3))
        for x in (-10, -5, 0, 5, 10):
            T(bolt(x, -3.6, 1.4, r=0.4, m=M["bolt"]))
    elif name == "mallet":
        T(cyl("head", 6.6, 5.0, 0, 0, 2.5, M["iron"], verts=64, bevel=0.6))
        T(torus("band", 6.5, 0.45, 0, 0, 4.2, M["steel"], segs=(64, 10)))
        T(cyl("boss", 2.2, 0.8, 0, 0, 5.4, M["steel_dk"], verts=32, bevel=0.2))
        for i in range(6):
            a = i * math.pi / 3
            T(bolt(4.4 * math.cos(a), 4.4 * math.sin(a), 5.0, r=0.55, h=0.4, m=M["bolt"]))
        T(box("stub", 3.0, 3.0, 2.2, 0, -7.0, 1.4, m=M["steel_dk"], bevel=0.3))
    elif name == "mallet_arm":
        T(box("arm", 3.0, 36.0, 2.0, 0, 1.0, 0.5, m=M["steel_dk"], bevel=0.35))
        T(cyl("ram", 2.5, 12.0, 0, -5.0, 2.2, M["steel"], rot=(math.pi / 2, 0, 0), verts=32))
        T(cyl("rod", 1.1, 8.0, 0, 5.0, 2.2, M["bolt"], rot=(math.pi / 2, 0, 0), verts=16))
        T(cyl("pivot", 3.4, 2.6, 0, -17.5, 1.3, M["iron"], verts=48, bevel=0.3))
        T(cyl("pivotbolt", 1.2, 0.8, 0, -17.5, 2.9, M["bolt"], verts=6))
        T(box("fork", 3.6, 4.0, 2.4, 0, 17.0, 0.4, m=M["steel_dk"], bevel=0.4))
        for sx in (-1, 1):
            T(cyl("hose%d" % sx, 0.35, 22.0, sx * 1.9, -3.0, 2.6, M["rubber"], rot=(math.pi / 2, 0, 0), verts=8))
        for y in (-12, -8, 12):
            T(bolt(0, y, 2.5, r=0.4, m=M["bolt"]))
    elif name == "pad":
        T(cyl("plate", 8.6, 0.6, 0, 0, 0.3, M["steel"], verts=8, bevel=0.15))
        T(cyl("inner", 3.6, 0.2, 0, 0, 0.55, M["steel_dk"], verts=32))
        T(cyl("core", 2.0, 0.2, 0, 0, 0.7, M["iron"], verts=32))
        for i in range(8):
            a = i * math.pi / 4 + math.pi / 8
            T(bolt(6.9 * math.cos(a), 6.9 * math.sin(a), 0.6, r=0.42, h=0.35, m=M["bolt"]))
        for i in range(4):
            a = i * math.pi / 2
            b = box("groove", 0.5, 4.0, 0.1, 5.6 * math.cos(a), 5.6 * math.sin(a), 0.6, m=M["steel_dk"])
            b.rotation_euler = (0, 0, a)
            T(b)
    elif name == "pit_hole":
        rim = cyl("rim", 30.0, 1.0, 0, 0, 0.5, M["concrete"], verts=96, bevel=0.4)
        cut(rim, cyl("rimcut", 26.0, 3.0, 0, 0, 0.5, None, verts=96))
        T(rim)
        wet = cyl("wet", 26.2, 0.5, 0, 0, -0.25, M["wet"], verts=96)
        cut(wet, cyl("wetcut", 22.0, 2.0, 0, 0, -0.25, None, verts=96))
        T(wet)
        T(cyl("shaft", 22.6, 0.4, 0, 0, -24.0, M["shaft"], verts=96))
        T(cyl("shaftwall", 22.5, 24.0, 0, 0, -12.0, M["shaft"], verts=96, caps=False))
        for i in range(10):
            a = i * 2 * math.pi / 10 + 0.3
            T(bolt(27.9 * math.cos(a), 27.9 * math.sin(a), 1.0, r=0.6, h=0.35, m=M["steel_dk"]))
    elif name == "grate":
        T(make_grate(0, 0, 26.0, 0.0, M))
    elif name == "booth":
        shell = T(box("shell", 36, 76, 14, 0, 0, 0, m=M["booth"], bevel=1.6, seg=3))
        T(box("glass", 30, 66, 1.0, 0, 2, 14.0, m=M["glass"]))
        for gx in (-7.5, 7.5):
            T(box("mullx", 1.0, 66, 1.4, gx, 2, 14.0, m=M["steel"]))
        for gy in range(-4, 5):
            T(box("mully", 30, 1.0, 1.4, 0, 2 + gy * 8.25, 14.0, m=M["steel"]))
        T(box("frame", 32, 68, 1.4, 0, 2, 13.9, m=M["steel_dk"]))
        T(box("ac", 7, 7, 3, -11, -33, 14, m=M["steel_dk"], bevel=0.5))
        T(cyl("fan", 2.6, 0.4, -11, -33, 17.1, M["iron"], verts=24))
        T(cyl("dishpost", 0.6, 6, 12, -33, 17, M["steel_dk"], verts=12))
        T(sph("dish", 4.0, 12, -33, 21, M["alu"], squash=0.3))
        T(box("onair", 12, 3.5, 2.0, 0, 37.5, 12.5, m=M["red"], bevel=0.4))
        T(box("onairwhite", 10, 1.4, 0.3, 0, 37.5, 14.5, m=M["white"], bevel=0.1))
    elif name == "driver":
        Mb = bot_mats()
        jersey = mat("PAINT_JERSEY", (0.84, 0.84, 0.87), rough=0.7)
        T(sph("torso", 2.6, 0, -0.6, 2.0, jersey, squash=0.7, sx=1.1, sy=0.85))
        T(sph("head", 1.9, 0, 0.2, 4.0, Mb["batter"], squash=0.85))
        for sx in (-1, 1):
            a = box("arm%d" % sx, 1.2, 3.6, 1.1, sx * 2.0, 1.4, 2.4, m=Mb["batter"], bevel=0.4)
            a.rotation_euler = (0, 0, sx * math.radians(-18))
            T(a)
        T(box("tx", 3.2, 2.2, 1.2, 0, 2.6, 2.8, m=M["steel_dk"], bevel=0.3))
        T(cyl("stick", 0.3, 1.2, -0.7, 2.4, 4.0, M["bolt"], verts=8))
        T(cyl("stick2", 0.3, 1.2, 0.7, 2.4, 4.0, M["bolt"], verts=8))
        T(cyl("antenna", 0.15, 4.0, 1.2, 5.2, 3.4, M["steel"], rot=(math.pi / 2, 0, 0), verts=6))
    elif name == "crowd":
        rnd = random.Random(404)
        Mb = bot_mats()
        shades = [Mb["batter"],
                  batter_mat("NUG_CROWD_A", base=(0.8, 0.5, 0.18), dark=(0.38, 0.17, 0.04), light=(0.94, 0.74, 0.4), scale=3.0),
                  batter_mat("NUG_CROWD_B", base=(0.9, 0.62, 0.26), dark=(0.45, 0.22, 0.06), light=(0.98, 0.84, 0.52), scale=3.0)]
        caps = [mat("CAP_RED", (0.7, 0.08, 0.06), rough=0.6), mat("CAP_BLUE", (0.08, 0.2, 0.7), rough=0.6),
                mat("CAP_YEL", (0.9, 0.7, 0.1), rough=0.6), mat("CAP_WHITE", (0.85, 0.85, 0.85), rough=0.6),
                mat("CAP_GREEN", (0.1, 0.5, 0.2), rough=0.6)]
        foam = mat("FOAM", (0.95, 0.85, 0.2), rough=0.8)
        heads = []
        for row, ry in enumerate((-7.5, 0.0, 7.5)):
            x = -64 + rnd.uniform(0, 2)
            while x < 64:
                r = rnd.uniform(1.6, 2.15)
                hy = ry + rnd.uniform(-1.6, 1.6)
                heads.append((x, hy, r, rnd.random(), rnd.randrange(3), rnd.randrange(5)))
                x += rnd.uniform(4.2, 5.6)
        for (hx, hy, r, roll, si, ci) in heads:
            for wrap in (0, -128, 128):
                px = hx + wrap
                if px < -70 or px > 70:
                    continue
                zc = 2.0 + r * 0.6
                T(sph("head", r, px, hy, zc, shades[si], squash=0.75))
                T(sph("body", r * 1.35, px, hy - 0.6, 1.0, shades[si] if roll > 0.5 else caps[ci], squash=0.45))
                if roll < 0.4:
                    T(cyl("cap", r * 0.78, 0.5, px, hy + 0.2, zc + r * 0.55, caps[ci], verts=20))
                    T(box("brim", r * 1.1, r * 0.8, 0.2, px, hy + r * 0.8, zc + r * 0.45, m=caps[ci], bevel=0.1))
                elif roll > 0.9:
                    T(box("foam", 1.2, 2.6, 0.6, px + r * 1.1, hy + 1.6, zc + 1.0, m=foam, bevel=0.2))
                elif roll > 0.8:
                    T(cyl("arm", 0.5, 3.0, px - r * 1.05, hy + 1.0, zc + 0.6, shades[si], rot=(math.radians(60), 0, 0), verts=8))
    return objs


# ---- particles & decals ------------------------------------------------------------------------

def soft_mat(name, color, alpha_max=0.9, hardness=0.9, emit=None, emit_str=0.0, rough=0.9,
             facing=False):
    """Soft-edged alpha. facing=False: a spherical falloff across the object's
    extent (flat decals — scorch, skid, the spark halo). facing=True: fade by
    view angle (Layer Weight), which is the only thing that softens a SPHERE —
    every point of a sphere's surface sits at its bounding-box extent, so the
    spatial gradient is zero all over it and the smoke puffs rendered as nothing."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    m["rough"] = rough
    if emit is not None:
        try:
            bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emit_str
        except KeyError:
            pass
    if facing:
        lw = nt.nodes.new("ShaderNodeLayerWeight")
        lw.inputs["Blend"].default_value = 0.5
        inv = nt.nodes.new("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        nt.links.new(lw.outputs["Facing"], inv.inputs[1])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
        ramp.color_ramp.elements[1].position = hardness
        ramp.color_ramp.elements[1].color = (alpha_max, alpha_max, alpha_max, 1)
        nt.links.new(inv.outputs[0], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], bsdf.inputs["Alpha"])
        _blended(m)
        return m
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    # Generated (bounding-box 0..1) coords remapped to -1..1, so the falloff
    # reaches ZERO exactly at the object's own extent whatever its size. In
    # object space the spherical gradient dies at radius 1 BU — a 12-unit
    # scorch and every smoke puff rendered as nothing.
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Location"].default_value = (-1.0, -1.0, -1.0)
    mp.inputs["Scale"].default_value = (2.0, 2.0, 2.0)
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], grad.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = hardness
    ramp.color_ramp.elements[1].color = (alpha_max, alpha_max, alpha_max, 1)
    nt.links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Alpha"])
    _blended(m)
    return m


def make_particle(name):
    M = prop_mats()
    objs = []
    rnd = random.Random(hash(name) & 0xFFFF)

    def T(o):
        objs.append(o)
        return o

    if name == "p_spark":
        hot = mat("P_SPARK", (1.0, 0.95, 0.8), rough=0.5, emit=(1.0, 0.8, 0.45), emit_str=6.0)
        T(sph("core", 0.75, 0, 0, 0, hot))
        halo = soft_mat("P_SPARKHALO", (1.0, 0.7, 0.3), alpha_max=0.7, hardness=0.8, emit=(1.0, 0.6, 0.2), emit_str=2.5)
        T(plane("halo", 4.0, 4.0, halo, 0, 0, 1.2))
    elif name == "p_smoke":
        grey = soft_mat("P_SMOKE", (0.66, 0.66, 0.7), alpha_max=1.0, hardness=0.75, rough=1.0, facing=True)
        for i in range(7):
            a = i * 2 * math.pi / 7
            r = rnd.uniform(2.6, 3.8)
            T(sph("puff", r, math.cos(a) * rnd.uniform(1.5, 3.2), math.sin(a) * rnd.uniform(1.5, 3.2),
                  rnd.uniform(0, 1.5), grey))
        T(sph("puffc", 3.6, 0, 0, 1.0, grey))
    elif name.startswith("p_fire"):
        i = int(name[-1])
        lean = (-0.8, 0.0, 0.9)[i]
        # emission strengths under ~2: Standard clips at 1.0 and a hot flame goes
        # flat lemon-yellow; the renderer draws these additive anyway
        core = mat("P_FIRECORE", (1.0, 0.9, 0.5), rough=0.9, emit=(1.0, 0.85, 0.35), emit_str=1.9)
        mid = mat("P_FIREMID", (1.0, 0.5, 0.08), rough=0.9, emit=(1.0, 0.42, 0.05), emit_str=1.5)
        edge = soft_mat("P_FIREEDGE", (0.8, 0.15, 0.02), alpha_max=0.95, hardness=0.8, emit=(0.9, 0.18, 0.02),
                        emit_str=1.2, facing=True)
        T(sph("base", 4.6, 0, -1.5, 0, edge, squash=0.8, sx=1.1))
        T(sph("mid", 3.4, lean * 0.5, 0.0, 0.5, mid, sy=1.25))
        T(sph("tip", 1.9, lean * 1.2, 3.0 + i * 0.3, 0.8, mid, sy=1.4))
        T(sph("core", 2.1, lean * 0.3, -0.6, 1.0, core, sy=1.3))
        T(sph("lick", 1.0, -lean * 1.5, 3.8, 0.8, edge, sy=1.6))
    elif name.startswith("p_crumb"):
        Mb = bot_mats()
        i = int(name[-1])
        o = T(nugget("crumb", 1.0, 0.85 + i * 0.1, 0.6, m=Mb["batter"], seed=70 + i, lump=0.5, lump_scale=0.6))
        o.rotation_euler = (0, 0, i * 0.7)
    elif name.startswith("p_plate"):
        i = int(name[-1])
        Mb = bot_mats()
        m = (Mb["steel"], Mb["rust"], Mb["steel_dark"])[i]
        p = T(box("chunk", 4.2 - i * 0.4, 2.4, 0.5, 0, 0, 0, m=m, bevel=0.15, seg=2))
        p.rotation_euler = (math.radians(8 * i), math.radians(-6 * i), math.radians(12 * i))
        T(bolt(1.2, 0.5, 0.5, r=0.32, m=Mb["bolt"]))
        if i == 2:
            T(bolt(-1.2, -0.4, 0.5, r=0.32, m=Mb["bolt"]))
    elif name == "p_oil":
        oil = mat("P_OIL", (0.02, 0.018, 0.016), rough=0.22, specular=0.35)
        T(sph("splat", 3.6, 0, 0, 0, oil, squash=0.08, sx=1.15, sy=0.9))
        for k in range(5):
            a = k * 2 * math.pi / 5 + 0.4
            rr = rnd.uniform(3.2, 4.8)
            T(sph("drop", rnd.uniform(0.6, 1.3), rr * math.cos(a), rr * math.sin(a), 0, oil, squash=0.08))
    elif name == "puddle_ranch":
        ranch = mat("P_RANCH", (0.93, 0.91, 0.84), rough=0.14, coat=0.5)
        T(sph("pool", 12.0, 0, 0, 0, ranch, squash=0.05, sx=1.1, sy=0.92))
        for k in range(6):
            a = k * 2 * math.pi / 6 + 0.3
            rr = rnd.uniform(9.0, 13.5)
            T(sph("lobe", rnd.uniform(3.0, 5.5), rr * math.cos(a), rr * math.sin(a), 0, ranch, squash=0.05))
        T(sph("fleck", 0.6, 3, 2, 0.2, mat("P_HERB", (0.1, 0.3, 0.08), rough=0.8), squash=0.4))
        T(sph("fleck2", 0.5, -4, -3, 0.2, bpy.data.materials["P_HERB"], squash=0.4))
    elif name == "scorch":
        sc = soft_mat("P_SCORCH", (0.03, 0.025, 0.02), alpha_max=1.0, hardness=1.0, rough=0.95)
        nt = sc.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        ramp = next(n for n in nt.nodes if n.type == "VALTORGB")
        # dense core, ragged edge: alpha = ease(grad) * (0.35..1.15 by noise);
        # the spherical gradient is already 1 at the centre, 0 at the extent
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
        ramp.color_ramp.elements[1].position = 1.0
        ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        ramp.color_ramp.interpolation = "EASE"
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 0.45
        nz.inputs["Detail"].default_value = 5
        nt.links.new(_obj_coords(nt), nz.inputs["Vector"])
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["To Min"].default_value = 0.35
        mr.inputs["To Max"].default_value = 1.15
        nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.use_clamp = True
        nt.links.new(ramp.outputs["Color"], mul.inputs[0])
        nt.links.new(mr.outputs["Result"], mul.inputs[1])
        for l in list(bsdf.inputs["Alpha"].links):
            nt.links.remove(l)
        nt.links.new(mul.outputs[0], bsdf.inputs["Alpha"])
        T(plane("scorch", 24, 24, sc, 0, 0, 0.1))
    elif name == "skid":
        rub = soft_mat("P_SKID", (0.05, 0.05, 0.05), alpha_max=0.8, hardness=1.0, rough=0.7)
        T(plane("skid", 6, 3, rub, 0, 0, 0.1))
    return objs


# ---- THE GARAGE PIT -------------------------------------------------------------------------------

def G(x, y):
    """Game coords (y down) -> Blender (y up)."""
    return x, -y


def floor_mats():
    M = prop_mats()
    M.update(
        conc=[mat("PIT_CONC", (0.36, 0.355, 0.34), rough=0.8, bump=0.25, bump_scale=3),
              mat("PIT_CONC2", (0.34, 0.335, 0.325), rough=0.82, bump=0.25, bump_scale=3.3),
              mat("PIT_CONC3", (0.385, 0.375, 0.355), rough=0.78, bump=0.25, bump_scale=2.7)],
        joint=mat("PIT_JOINT", (0.06, 0.06, 0.06), rough=0.9),
        worn=mat("PIT_WORN", (0.29, 0.285, 0.275), rough=0.5, bump=0.1, bump_scale=2),
        yellow=mat("PIT_YELLOW", (0.78, 0.6, 0.1), rough=0.6, bump=0.2, bump_scale=3),
        black=mat("PIT_BLACK", (0.05, 0.05, 0.05), rough=0.6),
        paintworn=mat("PIT_PAINTWORN", (0.62, 0.56, 0.4), rough=0.6, bump=0.3, bump_scale=2),
        oil=mat("PIT_OIL", (0.02, 0.018, 0.016), rough=0.15, coat=0.5),
        mark=mat("PIT_MARK", (0.16, 0.16, 0.155), rough=0.6),
        poly=mat("PIT_POLY", (0.78, 0.83, 0.88), metallic=0.1, rough=0.1, coat=0.8),
        stand=mat("PIT_STAND", (0.13, 0.14, 0.18), rough=0.8, bump=0.15, bump_scale=6),
        nosing=mat("PIT_NOSING", (0.26, 0.27, 0.31), rough=0.6),
        platform=mat("PIT_PLATFORM", (0.17, 0.17, 0.18), rough=0.75, bump=0.15, bump_scale=4),
        wallbase=mat("PIT_WALLBASE", (0.03, 0.03, 0.032), rough=0.9),
        apron=mat("PIT_APRON", (0.2, 0.2, 0.215), rough=0.7, bump=0.2, bump_scale=4),
    )
    return M


FONT_CANDIDATES = [r"C:\Windows\Fonts\impact.ttf", r"C:\Windows\Fonts\ariblk.ttf", r"C:\Windows\Fonts\arialbd.ttf"]


def _font():
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            for f in bpy.data.fonts:
                if f.filepath == p:
                    return f
            return bpy.data.fonts.load(p)
    return None


def letter(name, ch, size, x, y, rot, m, z=0.0):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = ch
    cu.size = size
    f = _font()
    if f:
        cu.font = f
    cu.extrude = 0.04
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    o = bpy.data.objects.new(name, cu)
    o.location = (x, y, z)
    o.rotation_euler = (0, 0, rot)
    _link(o)
    o.data.materials.append(m)
    return o


def arc_text(text, cx, cy, radius, a_start, a_end, size, m, tops_out=True, z=0.05):
    n = len(text)
    for i, ch in enumerate(text):
        t = i / max(n - 1, 1)
        a = a_start + (a_end - a_start) * t
        x, y = cx + radius * math.cos(a), cy + radius * math.sin(a)
        rot = a - math.pi / 2 if tops_out else a + math.pi / 2
        if ch != " ":
            letter("wm_%s_%d" % (text, i), ch, size, x, y, rot, m, z)


def arc_marks(cx, cy, r, a0, a1, w, m, z=0.06, seg_len=3.0, name="mark"):
    """A tyre mark: flat segments along an arc."""
    length = abs(a1 - a0) * r
    n = max(3, int(length / seg_len))
    for i in range(n):
        a = a0 + (a1 - a0) * (i + 0.5) / n
        b = box(name, w, seg_len * 1.15, 0.08, cx + r * math.cos(a), cy + r * math.sin(a), z, m=m)
        b.rotation_euler = (0, 0, a)


# ---- THE ARENA FLOORS -------------------------------------------------------------------------------
# Three arenas, one shell. The sim's ARENAS (js/botsSim.js) share walls, box, starts,
# pads and lamps; the shell helpers below build exactly that geometry and every
# builder dresses it differently. Blender y = -game y throughout (see G()).

X0, X1, Y0, Y1 = 40, 600, 36, 324          # tyre-wall outer face
IX0, IX1, IY0, IY1 = 52, 588, 48, 312      # playable interior
STARTS = ((90, 80), (90, 280), (550, 80), (550, 280), (320, 62), (320, 298))
PADS = ((180, 110), (460, 110), (180, 250), (460, 250), (320, 100), (320, 260))


def _floor_slabs(mats, joint, rnd, grid=64, bevel=0.55, thick=2.0):
    """Slabs on a grid with V-groove joints (bevel) over a dark joint bed."""
    W, H = WORLD
    plane("bed", W + 40, H + 40, joint, *G(W / 2, H / 2), z=-1.2)
    for gx in range(0, W, grid):
        for gy in range(0, H + grid - 1, grid):
            cx, cy = G(gx + grid / 2, gy + grid / 2)
            b = box("slab", grid - 1.0, grid - 1.0, thick, cx, cy, -thick + rnd.uniform(-0.04, 0.04),
                    m=mats[rnd.randrange(len(mats))], bevel=bevel, seg=2)
            b.rotation_euler = (rnd.uniform(-0.0015, 0.0015), rnd.uniform(-0.0015, 0.0015), 0)


def _floor_apron(m):
    """The margins outside the rail, painted darker: the arena reads as a lit
    stage inside a workshop (structured contrast, not grain)."""
    W, H = WORLD
    for (ax, ay, sx, sy) in ((W / 2, Y0 / 2, W, Y0), (W / 2, (H + Y1) / 2, W, H - Y1),
                             (X0 / 2, H / 2, X0, H), ((W + X1) / 2, H / 2, W - X1, H)):
        box("apron", sx + 0.5, sy + 0.5, 0.35, *G(ax, ay), z=-0.05, m=m)


def _floor_tyre_wall(M, rnd):
    """Rubber bed + a ring of tyres on the wall centreline."""
    x0, x1, y0, y1 = X0, X1, Y0, Y1
    for (bx, by, sx, sy) in ((x0 + 6, (y0 + y1) / 2, 12, y1 - y0), (x1 - 6, (y0 + y1) / 2, 12, y1 - y0),
                             ((x0 + x1) / 2, y0 + 6, x1 - x0, 12), ((x0 + x1) / 2, y1 - 6, x1 - x0, 12)):
        box("wallbase", sx, sy, 3.6, *G(bx, by), z=0, m=M["wallbase"])
    per = []
    nx = round((x1 - x0 - 12) / 10.8)
    for i in range(nx + 1):
        tx = x0 + 6 + (x1 - x0 - 12) * i / nx
        per += [(tx, y0 + 6), (tx, y1 - 6)]
    ny = round((y1 - y0 - 12) / 10.8)
    for i in range(1, ny):
        ty = y0 + 6 + (y1 - y0 - 12) * i / ny
        per += [(x0 + 6, ty), (x1 - 6, ty)]
    for (tx, ty) in per:
        bx, by = G(tx + rnd.uniform(-0.4, 0.4), ty + rnd.uniform(-0.4, 0.4))
        torus("tyre", 3.6, 1.85, bx, by, 3.6 + 1.85 + rnd.uniform(-0.3, 0.3), M["rubber"],
              rot=(rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), rnd.uniform(0, 1)), segs=(40, 14))


def _floor_curb(yellow, black, skip=lambda px, py: False):
    """Hazard curb on the inner face, interrupted wherever `skip` says (slots,
    pipe mouths)."""
    for x in range(IX0, IX1, 8):
        for yy in (IY0 + 1.5, IY1 - 1.5):
            if skip(x + 4, yy):
                continue
            box("curb", 8, 3, 1.0, *G(x + 4, yy), z=0, m=(yellow if (x // 8) % 2 == 0 else black))
    for y in range(IY0, IY1, 8):
        for xx in (IX0 + 1.5, IX1 - 1.5):
            if skip(xx, y + 4):
                continue
            box("curb", 3, 8, 1.0, *G(xx, y + 4), z=0, m=(yellow if (y // 8) % 2 == 0 else black))


def _floor_slots(M, slots):
    """Slicer slots: recessed dark slits in the wall foot."""
    for sx, sy in slots:
        box("slot", 52, 3.2, 3.0, *G(sx, sy), z=-2.6, m=M["shaft"])
        box("slotlip", 54, 5.0, 0.4, *G(sx, sy), z=-0.35, m=M["steel_dk"])
        box("slotcut", 52, 3.2, 1.0, *G(sx, sy), z=-0.34, m=M["shaft"])


def _floor_rail(M):
    """Polycarbonate rail on the outer face + posts."""
    x0, x1, y0, y1 = X0, X1, Y0, Y1
    for (bx, by, sx, sy) in ((x0 - 0.7, (y0 + y1) / 2, 1.2, y1 - y0 + 2), (x1 + 0.7, (y0 + y1) / 2, 1.2, y1 - y0 + 2),
                             ((x0 + x1) / 2, y0 - 0.7, x1 - x0 + 2, 1.2), ((x0 + x1) / 2, y1 + 0.7, x1 - x0 + 2, 1.2)):
        box("rail", sx, sy, 7.0, *G(bx, by), z=0, m=M["poly"])
    for x in range(x0, x1 + 1, 40):
        for yy in (y0 - 0.7, y1 + 0.7):
            cyl("post", 1.1, 8.0, *G(x, yy), z=4.0, m=M["steel_dk"], verts=12)
    for y in range(y0, y1 + 1, 36):
        for xx in (x0 - 0.7, x1 + 0.7):
            cyl("post", 1.1, 8.0, *G(xx, y), z=4.0, m=M["steel_dk"], verts=12)


def _floor_stands(M):
    """Stands top and bottom: three stepped rows with a lighter nosing."""
    x0, x1, y0, y1 = X0, X1, Y0, Y1
    for side in (0, 1):
        for i in range(3):
            depth = 9.3
            if side == 0:
                cy = y0 - 4.6 - i * depth
            else:
                cy = y1 + 4.6 + i * depth
            box("step", x1 - x0, depth, 3.0 + i * 3.0, *G((x0 + x1) / 2, cy), z=0, m=M["stand"])
            ny = (cy + depth / 2 - 0.6) if side == 0 else (cy - depth / 2 + 0.6)
            box("nosing", x1 - x0, 1.2, 3.2 + i * 3.0, *G((x0 + x1) / 2, ny), z=0, m=M["nosing"])


def _floor_margins(M):
    """Booth plinth (left margin) and driver rail platform (right margin)."""
    box("plinth", 36, 78, 4.0, *G(20, 180), z=0, m=M["platform"], bevel=0.8)
    box("plinthstep", 6, 20, 2.0, *G(39, 180), z=0, m=M["nosing"])
    box("drvplat", 34, 210, 3.0, *G(621, 180), z=0, m=M["platform"], bevel=0.6)
    box("drvrail", 1.2, 206, 6.5, *G(605.5, 180), z=3.0, m=M["steel"])
    for i in range(6):
        y = 100 + i * 32
        box("station", 10, 8, 1.2, *G(622, y), z=3.0, m=M["stand"], bevel=0.3)
        cyl("railpost", 0.9, 7.0, *G(605.5, y - 16), z=3.5, m=M["steel_dk"], verts=10)
    box("cabletray", 4, 200, 1.0, *G(636, 180), z=3.0, m=M["steel_dk"])


def _floor_start_hexes(yellow, mark, rnd):
    """Start pads: worn yellow hex outlines + scuffs. THE CONTRACT: r 12."""
    for (px, py) in STARTS:
        bx, by = G(px, py)
        for i in range(6):
            a = i * math.pi / 3
            ap = 12 * math.cos(math.pi / 6)
            b = box("hex", 12.4, 1.5, 0.12, bx + ap * math.cos(a + math.pi / 6), by + ap * math.sin(a + math.pi / 6),
                    0.0, m=yellow)
            b.rotation_euler = (0, 0, a + math.pi / 6 + math.pi / 2)
        for k in range(3):
            a = rnd.uniform(0, math.pi * 2)
            rr = rnd.uniform(4, 10)
            s = box("scuff", 1.6, rnd.uniform(3, 6), 0.06, bx + rr * math.cos(a), by + rr * math.sin(a), 0.0, m=mark)
            s.rotation_euler = (0, 0, rnd.uniform(0, math.pi))


def _floor_weapon_pads(M):
    """Weapon pads: steel plate + bolts, no colour (the renderer rings them)."""
    for (px, py) in PADS:
        bx, by = G(px, py)
        cyl("wpad", 10.0, 0.6, bx, by, 0.3, M["steel"], verts=8, bevel=0.15)
        cyl("wpadin", 4.2, 0.2, bx, by, 0.55, M["steel_dk"], verts=32)
        for i in range(8):
            a = i * math.pi / 4 + math.pi / 8
            bolt(bx + 8.2 * math.cos(a), by + 8.2 * math.sin(a), 0.6, r=0.5, h=0.35, m=M["bolt"])


def line_text(text, cx, cy, size, m, rot=0.0, spacing=0.78, z=0.05):
    """Stencil letters on a straight baseline, centred on (cx, cy)."""
    n = len(text)
    step = size * spacing
    for i, ch in enumerate(text):
        if ch == " ":
            continue
        d = (i - (n - 1) / 2) * step
        letter("st_%s_%d" % (text.replace(" ", "_"), i), ch, size, cx + d * math.cos(rot), cy + d * math.sin(rot), rot, m, z)


def ring(name, cx, cy, r_out, r_in, m, z=0.0, h=0.25, verts=96):
    o = cyl(name, r_out, h, cx, cy, z + h / 2, m, verts=verts)
    cut(o, cyl(name + "cut", r_in, h * 4, cx, cy, z + h / 2, None, verts=verts))
    return o


# ---- THE GARAGE PIT --------------------------------------------------------------------------------

def make_floor_pit():
    M = floor_mats()
    rnd = random.Random(1701)
    _floor_slabs(M["conc"], M["joint"], rnd)
    _floor_apron(M["apron"])
    _floor_tyre_wall(M, rnd)
    slots = [(200, 48), (440, 48), (200, 312), (440, 312)]
    in_slot = lambda px, py: any(abs(px - sx) < 27 and abs(py - sy) < 4 for sx, sy in slots)
    _floor_curb(M["yellow"], M["black"], in_slot)
    _floor_slots(M, slots)
    _floor_rail(M)
    _floor_stands(M)
    _floor_margins(M)
    # -- the drain, closed
    make_grate(*G(320, 180), r=26.0, z=0.0, M=M)
    ring("drainring", *G(320, 180), 29.5, 26.0, M["worn"], z=0.0, h=0.5)
    # -- faded wordmark around the drain
    cx, cy = G(320, 180)
    arc_text("CLUCKED", cx, cy, 48.0, math.radians(150), math.radians(30), 16.0, M["paintworn"], tops_out=True)
    arc_text("METAL", cx, cy, 48.0, math.radians(230), math.radians(310), 16.0, M["paintworn"], tops_out=False)
    _floor_start_hexes(M["yellow"], M["mark"], rnd)
    _floor_weapon_pads(M)
    # -- mallet: pivot base on the left wall, worn strike circle
    bx, by = G(52, 180)
    cyl("pivotbase", 5.0, 3.0, bx, by, 3.6 + 1.5, M["iron"], verts=48, bevel=0.4)
    cyl("pivotbolt", 1.6, 1.0, bx, by, 6.6, M["bolt"], verts=6)
    box("pivotarm", 8, 3, 2.0, bx + 6, by, 3.6, m=M["steel_dk"], bevel=0.3)
    sx, sy = G(84, 180)
    cyl("strike", 22.0, 0.25, sx, sy, 0.0, M["worn"], verts=96)
    for i in range(7):
        a = rnd.uniform(0, math.pi * 2)
        c = box("crack", rnd.uniform(6, 14), 0.5, 0.2, sx + rnd.uniform(-8, 8) * math.cos(a),
                sy + rnd.uniform(-8, 8) * math.sin(a), 0.1, m=M["joint"])
        c.rotation_euler = (0, 0, a)
    for i in range(24):
        a = i * math.pi / 12 + rnd.uniform(-0.05, 0.05)
        box("chip", rnd.uniform(1, 2.5), 1.2, 0.2, sx + 21.5 * math.cos(a), sy + 21.5 * math.sin(a), 0.05, m=M["conc"][1])
    # -- oil stains (glossy in rough) and tyre marks
    spots = [(140, 160), (250, 300), (400, 70), (520, 200), (300, 230), (200, 180), (470, 290), (120, 240)]
    for (px, py) in spots:
        bx, by = G(px, py)
        sph("oil", rnd.uniform(5, 9), bx + rnd.uniform(-2, 2), by, 0.0, M["oil"], squash=0.02, sx=rnd.uniform(0.8, 1.3))
        for k in range(rnd.randrange(2, 5)):
            a = rnd.uniform(0, math.pi * 2)
            rr = rnd.uniform(6, 12)
            sph("oildrop", rnd.uniform(1, 2.5), bx + rr * math.cos(a), by + rr * math.sin(a), 0.0, M["oil"], squash=0.02)
    for k in range(9):
        cx0, cy0 = G(rnd.uniform(120, 520), rnd.uniform(90, 270))
        r = rnd.uniform(18, 60)
        a0 = rnd.uniform(0, math.pi * 2)
        a1 = a0 + rnd.uniform(0.6, 2.0) * rnd.choice((-1, 1))
        arc_marks(cx0, cy0, r, a0, a1, 1.7, M["mark"])
        arc_marks(cx0, cy0, r - 5.5, a0 + 0.05, a1 - 0.05, 1.7, M["mark"])
    for k in range(6):  # straight streaks off the start pads
        px, py = rnd.choice(STARTS)
        bx, by = G(px, py)
        a = rnd.uniform(0, math.pi * 2)
        s = box("streak", 1.6, rnd.uniform(14, 30), 0.06, bx + 16 * math.cos(a), by + 16 * math.sin(a), 0.02, m=M["mark"])
        s.rotation_euler = (0, 0, a + math.pi / 2)


# ---- THE FRYER -------------------------------------------------------------------------------------

def brushed_mat(name, color, metallic=0.85, rough=0.3, streak=0.05, along_x=True):
    """Brushed stainless: a noise squeezed flat along one axis drives a shallow
    bump, so the normal page carries the grain and the albedo stays a neutral
    steel (the renderer's cold lamps will do the rest)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = mat(name, color, metallic=metallic, rough=rough)
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (streak, 1.0, 1.0) if along_x else (1.0, streak, 1.0)
    nt.links.new(_obj_coords(nt), mp.inputs["Vector"])
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 40.0
    tex.inputs["Detail"].default_value = 3.0
    tex.inputs["Roughness"].default_value = 0.7
    nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.08
    bp.inputs["Distance"].default_value = 0.4
    nt.links.new(tex.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def fryer_mats():
    M = floor_mats()
    M.update(
        tile=[brushed_mat("FRY_TILE", (0.56, 0.585, 0.615)),
              brushed_mat("FRY_TILE2", (0.53, 0.555, 0.585), along_x=False),
              brushed_mat("FRY_TILE3", (0.585, 0.605, 0.63))],
        seam=mat("FRY_SEAM", (0.08, 0.085, 0.095), rough=0.7),
        grease=mat("FRY_GREASE", (0.19, 0.16, 0.1), rough=0.15, coat=0.4),
        slick=mat("FRY_SLICK", (0.26, 0.22, 0.13), rough=0.12, coat=0.6),
        ring=mat("FRY_RING", (0.74, 0.38, 0.09), rough=0.6, bump=0.3, bump_scale=2),
        ringworn=mat("FRY_RINGWORN", (0.55, 0.32, 0.12), rough=0.55, bump=0.3, bump_scale=2),
        scorch=mat("FRY_SCORCH", (0.11, 0.095, 0.075), rough=0.7),
        vat=mat("FRY_VAT", (0.4, 0.42, 0.45), metallic=0.85, rough=0.35, bump=0.05, bump_scale=30),
        vatwall=mat("FRY_VATWALL", (0.24, 0.25, 0.27), metallic=0.8, rough=0.4),
        hotoil=mat("FRY_OIL", (0.1, 0.05, 0.012), rough=0.08, coat=0.6),
        rim=mat("FRY_RIM", (0.5, 0.28, 0.09), rough=0.5),
        crumb=mat("FRY_CRUMB", (0.66, 0.42, 0.14), rough=0.72, bump=0.6, bump_scale=6),
        kapron=mat("FRY_APRON", (0.22, 0.225, 0.24), rough=0.5, bump=0.1, bump_scale=8),
        kcurb=mat("FRY_CURB", (0.7, 0.52, 0.1), rough=0.6, bump=0.2, bump_scale=3),
        kblack=mat("FRY_CURBDK", (0.07, 0.07, 0.075), rough=0.6),
        kmark=mat("FRY_MARK", (0.3, 0.3, 0.3), rough=0.5),
    )
    return M


def make_floor_fryer():
    """THE FRYER, between the vats: a stainless kitchen floor. No drain, no
    slots, no mallet; basket landing rings, vats along the apron where the
    stands were, grease drifting across the tiles. Cold, neutral albedo."""
    M = fryer_mats()
    rnd = random.Random(2301)
    _floor_slabs(M["tile"], M["seam"], rnd, grid=32, bevel=0.3, thick=1.2)
    _floor_apron(M["kapron"])
    _floor_tyre_wall(M, rnd)
    _floor_curb(M["kcurb"], M["kblack"])
    _floor_rail(M)
    _floor_margins(M)
    # -- the vats replace the stands: stainless boxes of dark hot oil with a
    #    muted orange rim, under where the renderer draws the crowd (y 22 / 338)
    for vy0, vy1 in ((8, 36), (324, 352)):
        cy = (vy0 + vy1) / 2
        box("vatbed", X1 - X0, vy1 - vy0, 1.0, *G((X0 + X1) / 2, cy), z=0, m=M["vatwall"])
        x = X0 + 20
        while x < X1 - 20:
            vx = x + 23
            for (dx, dy, sx, sy) in ((0, -10.5, 46, 3), (0, 10.5, 46, 3), (-21.5, 0, 3, 24), (21.5, 0, 3, 24)):
                box("vatwall", sx, sy, 4.0, *G(vx + dx, cy + dy), z=0, m=M["vat"], bevel=0.4, seg=2)
            box("vatwell", 40, 18, 2.6, *G(vx, cy), z=0, m=M["vatwall"])
            box("vatoil", 40, 18, 0.4, *G(vx, cy), z=2.6, m=M["hotoil"])
            for (dx, dy, sx, sy) in ((0, -9.4, 40, 0.9), (0, 9.4, 40, 0.9), (-19.6, 0, 0.9, 18), (19.6, 0, 0.9, 18)):
                box("vatrim", sx, sy, 0.4, *G(vx + dx, cy + dy), z=4.0, m=M["rim"])
            # a basket handle resting across the vat
            hb = box("vathandle", 1.6, 26, 1.0, *G(vx + rnd.uniform(-14, 14), cy), z=4.2, m=M["steel_dk"], bevel=0.3)
            hb.rotation_euler = (0, 0, rnd.uniform(-0.15, 0.15))
            x += 60
    # -- basket landing rings: worn orange rings, scorched inside, crumbs around
    for (bx, by, r) in ((200, 180, 34), (440, 180, 34), (320, 300, 30)):
        cx, cy = G(bx, by)
        ring("landring", cx, cy, r + 1.4, r - 1.4, M["ring"], z=0.0, h=0.14)
        # worn gaps in the paint
        for k in range(5):
            a = rnd.uniform(0, math.pi * 2)
            w = box("ringworn", rnd.uniform(3, 7), 3.4, 0.2, cx + r * math.cos(a), cy + r * math.sin(a), 0.05, m=M["ringworn"])
            w.rotation_euler = (0, 0, a + math.pi / 2)
        for k in range(4):
            a = rnd.uniform(0, math.pi * 2)
            rr = rnd.uniform(0, r * 0.55)
            sph("scorch", rnd.uniform(4, 9), cx + rr * math.cos(a), cy + rr * math.sin(a), 0.0, M["scorch"],
                squash=0.02, sx=rnd.uniform(0.8, 1.3))
        for k in range(22):
            a = rnd.uniform(0, math.pi * 2)
            rr = rnd.uniform(0, r * 1.25)
            sph("crumb", rnd.uniform(0.6, 1.3), cx + rr * math.cos(a), cy + rr * math.sin(a), 0.0, M["crumb"],
                squash=0.5, sx=rnd.uniform(0.8, 1.4))
    _floor_start_hexes(M["kcurb"], M["kmark"], rnd)
    _floor_weapon_pads(M)
    # -- grease: the sim's three drifting slicks (long smears along their drift)
    #    plus darker greasy patches wherever the fry cooks have walked
    for (sx, sy, r, vx, vy) in ((320, 180, 28, 22, 9), (140, 100, 22, -14, 17), (500, 260, 22, 12, -15)):
        cx, cy = G(sx, sy)
        a = math.atan2(-vy, vx)
        for k in range(3):
            t = (k - 1) * 0.55
            o = sph("slick", r * (1.0 - abs(t) * 0.35), cx + math.cos(a) * r * t * 1.2, cy + math.sin(a) * r * t * 1.2,
                    0.0, M["slick"], squash=0.012, sx=1.35, sy=0.7)
            o.rotation_euler = (0, 0, a)
        for k in range(6):
            d = r * rnd.uniform(0.9, 1.9)
            o = sph("slicktail", rnd.uniform(1.5, 4), cx - math.cos(a) * d + rnd.uniform(-4, 4),
                    cy - math.sin(a) * d + rnd.uniform(-4, 4), 0.0, M["slick"], squash=0.02, sx=1.6, sy=0.6)
            o.rotation_euler = (0, 0, a)
    for k in range(11):
        px, py = rnd.uniform(75, 565), rnd.uniform(70, 290)
        cx, cy = G(px, py)
        a = rnd.uniform(0, math.pi)
        o = sph("grease", rnd.uniform(6, 14), cx, cy, 0.0, M["grease"], squash=0.012, sx=rnd.uniform(1.0, 1.8), sy=0.8)
        o.rotation_euler = (0, 0, a)
    # -- footprints of the fry cooks: short scuffed streaks between the vats and the rings
    for k in range(14):
        cx, cy = G(rnd.uniform(70, 570), rnd.uniform(60, 300))
        a = rnd.uniform(0, math.pi * 2)
        s = box("streak", 1.4, rnd.uniform(8, 22), 0.05, cx, cy, 0.02, m=M["kmark"])
        s.rotation_euler = (0, 0, a)


# ---- THE SUMP --------------------------------------------------------------------------------------

def sump_mats():
    M = floor_mats()
    M.update(
        sconc=[mat("SUMP_CONC", (0.2, 0.2, 0.205), rough=0.4, bump=0.3, bump_scale=3),
               mat("SUMP_CONC2", (0.185, 0.185, 0.19), rough=0.42, bump=0.3, bump_scale=3.3),
               mat("SUMP_CONC3", (0.215, 0.21, 0.205), rough=0.38, bump=0.3, bump_scale=2.7)],
        sjoint=mat("SUMP_JOINT", (0.025, 0.025, 0.03), rough=0.5),
        water=mat("SUMP_WATER", (0.075, 0.085, 0.095), rough=0.08, coat=0.5),
        stain=mat("SUMP_STAIN", (0.135, 0.13, 0.12), rough=0.45),
        scum=mat("SUMP_SCUM", (0.1, 0.12, 0.105), rough=0.4),
        crust=mat("SUMP_CRUST", (0.3, 0.3, 0.28), rough=0.6, bump=0.3, bump_scale=3),
        rust=mat("SUMP_RUST", (0.3, 0.155, 0.065), metallic=0.3, rough=0.8, bump=0.5, bump_scale=5),
        rustdk=mat("SUMP_RUSTDK", (0.19, 0.1, 0.045), metallic=0.3, rough=0.85, bump=0.5, bump_scale=5),
        rustbolt=mat("SUMP_RUSTBOLT", (0.36, 0.22, 0.11), metallic=0.4, rough=0.7),
        ruststain=mat("SUMP_RUSTSTAIN", (0.2, 0.12, 0.06), rough=0.55),
        stencil=mat("SUMP_STENCIL", (0.58, 0.58, 0.56), rough=0.6, bump=0.35, bump_scale=2),
        sapron=mat("SUMP_APRON", (0.13, 0.135, 0.145), rough=0.35, bump=0.15, bump_scale=5),
        syellow=mat("SUMP_YELLOW", (0.52, 0.4, 0.09), rough=0.55, bump=0.2, bump_scale=3),
        sblack=mat("SUMP_BLACK", (0.04, 0.04, 0.042), rough=0.55),
        smark=mat("SUMP_MARK", (0.1, 0.1, 0.1), rough=0.45),
    )
    return M


def make_floor_sump():
    """THE SUMP, where the mains meet: wet dark concrete below the garage, the
    pit's drain gone to rust, six pipe mouths in the wall feet, tide lines,
    DPW stencils. Slicer slots at top x 200 and bottom x 440 only. No mallet.
    Dark — but NOT lit: the renderer's ambient is already low here."""
    M = sump_mats()
    rnd = random.Random(2901)
    _floor_slabs(M["sconc"], M["sjoint"], rnd)
    _floor_apron(M["sapron"])
    _floor_tyre_wall(M, rnd)
    slots = [(200, 48), (440, 312)]
    pipes = [(IX0 + 6, 120), (IX0 + 6, 240), (IX1 - 6, 120), (IX1 - 6, 240), (200, IY0 + 6), (440, IY1 - 6)]

    def skip(px, py):
        if any(abs(px - sx) < 27 and abs(py - sy) < 4 for sx, sy in slots):
            return True
        return any((px - qx) ** 2 + (py - qy) ** 2 < 12.5 ** 2 for qx, qy in pipes)

    _floor_curb(M["syellow"], M["sblack"], skip)
    _floor_slots(M, slots)
    _floor_rail(M)
    _floor_stands(M)
    _floor_margins(M)
    # -- standing water: a broad irregular pool around the drain, pools in the
    #    low corners, a film along the wall feet (rough 0.08 in the rough page)
    cx, cy = G(320, 180)
    for k in range(9):
        a = k * math.pi * 2 / 9 + rnd.uniform(-0.2, 0.2)
        d = rnd.uniform(18, 40)
        sph("pool", rnd.uniform(26, 42), cx + d * math.cos(a), cy + d * math.sin(a), 0.0, M["water"],
            squash=0.008, sx=rnd.uniform(0.9, 1.4), sy=rnd.uniform(0.8, 1.1))
    for (px, py, r) in ((75, 70, 22), (565, 290, 26), (560, 75, 16), (80, 290, 18), (150, 200, 20), (470, 150, 17)):
        bx, by = G(px, py)
        for k in range(3):
            sph("pool", r * rnd.uniform(0.6, 1.0), bx + rnd.uniform(-6, 6), by + rnd.uniform(-6, 6), 0.0, M["water"],
                squash=0.01, sx=rnd.uniform(0.9, 1.5))
    for (bx, by, sx, sy) in ((320, IY0 + 6, IX1 - IX0 - 10, 7), (320, IY1 - 6, IX1 - IX0 - 10, 7),
                             (IX0 + 6, 180, 7, IY1 - IY0 - 10), (IX1 - 6, 180, 7, IY1 - IY0 - 10)):
        box("wallfilm", sx, sy, 0.1, *G(bx, by), z=0.02, m=M["water"])
    # -- water stains radiating from the drain (the pool's high-water marks)
    for k in range(18):
        a = k * math.pi * 2 / 18 + rnd.uniform(-0.12, 0.12)
        ln = rnd.uniform(34, 78)
        d = 30 + ln / 2
        s = box("stain", ln, rnd.uniform(2.5, 7), 0.06, cx + d * math.cos(a), cy + d * math.sin(a), 0.03, m=M["stain"])
        s.rotation_euler = (0, 0, a)
    for k in range(3):
        ring("tide", cx, cy, 52 + k * 16 + rnd.uniform(-3, 3), 50 + k * 16 + rnd.uniform(-3, 3), M["stain"], z=0.02, h=0.08)
    # -- the drain, gone to rust
    MR = dict(M, steel=M["rust"], steel_dk=M["rustdk"], bolt=M["rustbolt"])
    make_grate(cx, cy, r=26.0, z=0.0, M=MR)
    ring("drainring", cx, cy, 29.5, 26.0, M["rustdk"], z=0.0, h=0.5)
    for k in range(10):
        a = rnd.uniform(0, math.pi * 2)
        ln = rnd.uniform(6, 16)
        s = box("rustrun", ln, rnd.uniform(1.2, 3), 0.1, cx + (29 + ln / 2) * math.cos(a), cy + (29 + ln / 2) * math.sin(a),
                0.06, m=M["ruststain"])
        s.rotation_euler = (0, 0, a)
    # -- six pipe mouths in the wall feet: dark r 9 with a rusty rim, a rust
    #    fan bleeding into the arena from each
    for (px, py) in pipes:
        bx, by = G(px, py)
        cyl("pipemouth", 9.0, 0.5, bx, by, 0.25, M["shaft"], verts=48)
        torus("piperim", 9.7, 1.3, bx, by, 0.9, M["rust"], segs=(48, 12))
        for i in range(8):
            a = i * math.pi / 4 + math.pi / 8
            bolt(bx + 9.7 * math.cos(a), by + 9.7 * math.sin(a), 1.6, r=0.5, h=0.4, m=M["rustbolt"])
        inward = math.atan2(cy - by, cx - bx)
        for k in range(5):
            a = inward + rnd.uniform(-0.45, 0.45)
            ln = rnd.uniform(10, 26)
            s = box("rustfan", ln, rnd.uniform(1.5, 4), 0.08, bx + (10 + ln / 2) * math.cos(a), by + (10 + ln / 2) * math.sin(a),
                    0.05, m=M["ruststain"])
            s.rotation_euler = (0, 0, a)
    # -- waterline stains along the wall bases: a dark scum band and a pale
    #    mineral crust line, broken into runs
    for side in range(4):
        along = side < 2
        L = (IX1 - IX0) if along else (IY1 - IY0)
        pos = 0.0
        while pos < L - 6:
            run = rnd.uniform(14, 46)
            run = min(run, L - pos)
            mid = pos + run / 2
            if along:
                fy = IY0 + 3 + 2.6 if side == 0 else IY1 - 3 - 2.6
                bx, by = G(IX0 + mid, fy)
                box("scum", run, 5.2, 0.05, bx, by, 0.03, m=M["scum"])
                cyy = IY0 + 3 + 5.2 + 0.6 if side == 0 else IY1 - 3 - 5.2 - 0.6
                box("crust", run * rnd.uniform(0.6, 1.0), 1.1, 0.08, *G(IX0 + mid + rnd.uniform(-3, 3), cyy), z=0.04, m=M["crust"])
            else:
                fx = IX0 + 3 + 2.6 if side == 2 else IX1 - 3 - 2.6
                bx, by = G(fx, IY0 + mid)
                box("scum", 5.2, run, 0.05, bx, by, 0.03, m=M["scum"])
                cxx = IX0 + 3 + 5.2 + 0.6 if side == 2 else IX1 - 3 - 5.2 - 0.6
                box("crust", 1.1, run * rnd.uniform(0.6, 1.0), 0.08, *G(cxx, IY0 + mid + rnd.uniform(-3, 3)), z=0.04, m=M["crust"])
            pos += run + rnd.uniform(3, 12)
    _floor_start_hexes(M["syellow"], M["smark"], rnd)
    _floor_weapon_pads(M)
    # -- DPW stencils in worn white
    line_text("DPW 077", *G(150, 138), 11.0, M["stencil"], rot=0.0)
    line_text("DPW 077", *G(492, 226), 11.0, M["stencil"], rot=math.pi / 2)
    line_text("DO NOT DIVE", *G(160, 182), 9.5, M["stencil"], rot=0.0)
    line_text("MAINS 3", *G(560, 180), 7.5, M["stencil"], rot=-math.pi / 2)
    # worn: chips out of the letters
    for k in range(22):
        px, py = rnd.choice(((150, 138), (492, 226), (160, 182)))
        bx, by = G(px + rnd.uniform(-34, 34), py + rnd.uniform(-5, 5))
        sph("chip", rnd.uniform(0.6, 1.6), bx, by, 0.0, M["sconc"][rnd.randrange(3)], squash=0.3)
    # -- a little oil, and tyre marks that shine where they cross the wet
    for (px, py) in ((250, 285), (410, 90), (520, 215)):
        bx, by = G(px, py)
        sph("oil", rnd.uniform(4, 7), bx, by, 0.0, M["oil"], squash=0.02, sx=rnd.uniform(0.8, 1.3))
    for k in range(6):
        cx0, cy0 = G(rnd.uniform(120, 520), rnd.uniform(90, 270))
        r = rnd.uniform(18, 60)
        a0 = rnd.uniform(0, math.pi * 2)
        a1 = a0 + rnd.uniform(0.6, 2.0) * rnd.choice((-1, 1))
        arc_marks(cx0, cy0, r, a0, a1, 1.7, M["smark"])
        arc_marks(cx0, cy0, r - 5.5, a0 + 0.05, a1 - 0.05, 1.7, M["smark"])


FLOOR_BUILDERS = {"pit": make_floor_pit, "fryer": make_floor_fryer, "sump": make_floor_sump}


# ---- the batch -----------------------------------------------------------------------------------

def _builders():
    B = {}
    for kind in BOT_DIMS:
        for s in range(3):
            B[f"bot_{kind}_{s}"] = (lambda k=kind, st=s: make_bot(k, st))
    for d in ("disc_still", "disc_spin", "disc_blur"):
        B[d] = (lambda dd=d: make_disc(dd))
    B["flipper_up"] = make_flipper_up
    for w in ("minigun", "flamer", "mortar", "rocket", "emp"):
        B["turret_" + w] = (lambda ww=w: make_turret(ww))
        B["pickup_" + w] = (lambda ww=w: make_pickup(ww))
    B["pickup_nitro"] = lambda: make_pickup("nitro")
    for p in ("tire", "drum", "lamp", "blade", "mallet", "mallet_arm", "pad", "pit_hole", "grate",
              "booth", "driver", "crowd"):
        B[p] = (lambda pp=p: make_prop(pp))
    for p in CELLS:
        if p.startswith("p_") or p in ("puddle_ranch", "scorch", "skid"):
            B[p] = (lambda pp=p: make_particle(pp))
    missing = set(CELLS) - set(B)
    assert not missing, missing
    return B


def render_sprite(name, render_dir, ss=SS):
    cw, ch = CELLS[name]
    clear_scene()
    rig_setup()
    _builders()[name]()
    px_w, px_h = cw * PPU * ss, ch * PPU * ss
    pass_albedo(name, cw, px_w, px_h, render_dir)
    pass_normal(name, cw, px_w, px_h, render_dir)
    pass_mask(name, cw, px_w, px_h, render_dir)


def render_floor(arena, render_dir, ss=FLOOR_SS):
    clear_scene()
    rig_setup(key=1.6, fill=0.5, dome=0.55)
    bpy.context.scene.render.film_transparent = False
    FLOOR_BUILDERS[arena]()
    W, H = WORLD
    px_w, px_h = FLOOR_PX[0] * ss, FLOOR_PX[1] * ss
    center = G(W / 2, H / 2)
    kw = dict(center=center, cam_z=200)
    name = "floor_" + arena
    pass_albedo(name, W, px_w, px_h, render_dir, **kw)
    pass_normal(name, W, px_w, px_h, render_dir, **kw)
    pass_rough(name, W, px_w, px_h, render_dir, **kw)
    bpy.context.scene.render.film_transparent = True


def main(argv):
    # absolute: Blender resolves a relative render.filepath against ITS cwd, not ours
    out = os.path.abspath(argv[0] if argv else "blender/render_bots")
    opts = dict(a.split("=", 1) if "=" in a else (a, "1") for a in argv[1:])
    ss = int(opts.get("ss", SS))
    raw = os.path.join(out, "raw")
    os.makedirs(raw, exist_ok=True)
    names = list(CELLS)
    floors = [] if "nofloor" in opts else list(FLOOR_BUILDERS)
    if "floors" in opts:
        floors = [f for f in opts["floors"].split(",") if f in FLOOR_BUILDERS]
    if "only" in opts:
        picked = [n for n in opts["only"].split(",") if n]
        names = [n for n in picked if n in CELLS]
        floors = [f for f in floors if "floor_" + f in picked]
        unknown = [n for n in picked if n not in CELLS and n[6:] not in FLOOR_BUILDERS]
        if unknown:
            print("[botsrig] unknown regions:", unknown)
    manifest_path = os.path.join(out, "_manifest.json")
    manifest = {"ppu": PPU, "sprites": {}, "floors": {}}
    if os.path.exists(manifest_path):
        try:
            manifest = json.load(open(manifest_path))
        except Exception:
            pass
    manifest["ppu"] = PPU
    if "nosprites" not in opts:
        for i, n in enumerate(names):
            print(f"[botsrig] {i + 1}/{len(names)} {n}", flush=True)
            render_sprite(n, raw, ss)
            manifest["sprites"][n] = {"cell": list(CELLS[n]), "ss": ss}
            json.dump(manifest, open(manifest_path, "w"), indent=1, sort_keys=True)
    for arena in floors:
        print(f"[botsrig] floor {arena}", flush=True)
        render_floor(arena, raw)
        manifest.setdefault("floors", {})[arena] = {"px": list(FLOOR_PX), "ss": FLOOR_SS}
        json.dump(manifest, open(manifest_path, "w"), indent=1, sort_keys=True)
    json.dump(manifest, open(manifest_path, "w"), indent=1, sort_keys=True)
    print("[botsrig] done ->", raw)


if __name__ == "__main__" and "--" in sys.argv and bpy.app.background:
    main(sys.argv[sys.argv.index("--") + 1:])
