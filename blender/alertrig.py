"""🚨 NUGGET ALERT — the Blender rig for every building and vehicle.

    blender -b -P blender/alertrig.py                 # build + bake AO + export + save the .blend
    python3 blender/pack_alert.py                     # render_alert/*.json -> js/alertMeshData.js

Chris: "using blender ... make the units and buildings better and more realistic to the original Red
Alert 2 game". RA2's art was pre-rendered 3D: chunky bevelled armour, real track runs and road wheels,
roofs covered in vents / railings / pipes, lattice cranes, and soft contact shadow under everything.
This rig is that, in our own nugget-world designs (never RA2's actual models or names).

CONVENTIONS (a contract with js/alertArt.js + js/alertUI.js — do not drift):
- Units are TILES. Geometry is authored in the GAME's frame: x right, y UP, z forward. Blender is only
  the geometry kernel here (bmesh + BVH); the .blend we save converts to Z-up for viewing only.
- Buildings are centred on their footprint (x in ±w/2, z in ±h/2), origin on the ground. The game draws
  them turned 180° (ALR_BLD_YAW), so the CAMERA sees local +x and +z: that's where the detail goes, and
  doors / the dock / the bay open on local +z.
- Units face +z, origin on the ground at the centre.
- Moving parts are separate models whose ORIGIN is the pivot alertUI.js already uses (turret heads,
  guns, the crane, the dish, the factory door, the flag, the hauler's drum + load, soldier legs).
- Material = one flat colour + a team flag. Team surfaces carry mask 1: the shader repaints them in
  the owner's colour, keeping their luminance (so a light grey team panel = a bright team colour).
- Baked AO is multiplied into the vertex colour (ground plane included = contact shadow). Lamps and
  glass are exempt.
"""
import bpy, bmesh, math, json, os, sys, random
from mathutils import noise as mnoise
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "render_alert")
TAU = math.tau

# ---- the palette: hex, team mask, surface class, ao-exempt ----------------------------------------------
# Surface classes index the material texture array js/alertArt.js paints at load (ALR_MAT_CLASSES):
# 0 none · 1 cast concrete · 2 slab · 3 roofing · 4 corrugated · 5 painted armour · 6 steel · 7 rubber
# 8 glass · 9 sacking · 10 wood · 11 riveted plate · 12 breading · 13 canvas
# The palette is deliberately muted and warm (RA2's renders were dusty, never toy-bright); team panels are a
# mid grey so the shader's luminance-kept repaint lands at the team colour, not above it.
def _m(hexc, cls, team=0, exempt=0):
    return (hexc, team, cls, exempt)


PAL = {
    "pad": _m("#8a8478", 2), "padDark": _m("#6c675e", 2), "padEdge": _m("#7d776c", 2),
    "conc": _m("#a39c8d", 1), "concLite": _m("#b3ac9c", 1), "concDark": _m("#857e71", 1),
    "roof": _m("#5d6062", 3), "roofDark": _m("#45484a", 4), "tar": _m("#3a3b3b", 2),
    "steel": _m("#7b8186", 6), "steelDark": _m("#565b60", 6), "dark": _m("#3b3e42", 6), "black": _m("#222427", 6),
    "glass": _m("#2c4656", 8, 0, 1), "glassLit": _m("#7fa9bf", 8, 0, 1), "light": _m("#ffe7a8", 0, 0, 1), "red": _m("#c23a24", 0, 0, 1),
    "gold": _m("#d29a32", 12), "goldDark": _m("#a07024", 12), "hazard": _m("#c49a2e", 5), "sauce": _m("#9c3a26", 11),
    "sauceDark": _m("#6e2a1a", 11), "copper": _m("#a8693a", 6), "copperDark": _m("#76482a", 6), "white": _m("#c9c5ba", 1),
    "olive": _m("#58603a", 13), "oliveDark": _m("#41472b", 13), "khaki": _m("#7d7752", 5), "rubber": _m("#2b2a29", 7),
    "sand": _m("#a69673", 9), "sandDark": _m("#8b7c5d", 9), "wood": _m("#6e5236", 10), "rust": _m("#6f4a32", 11),
    "breading": _m("#c98d3c", 12), "breadDark": _m("#956026", 12), "grass": _m("#56703a", 0),
    "team": _m("#b0b0b0", 5, 1), "teamDark": _m("#7e7e7e", 5, 1), "teamLite": _m("#c8c8c8", 5, 1),
    "bandTeam": _m("#8a8a8a", 11, 1),
    # vehicle drab: hulls are paint-and-dust, the team colour is the markings (turret, fenders, stripes)
    "armor": _m("#6d6f5f", 5), "armorDark": _m("#505246", 5),
    # phase 1: Alliance paint (pale grey-blue), white paint, the prism crystal, the blimp's fabric
    "allyArmor": _m("#7c858b", 5), "allyDark": _m("#5a6268", 5), "paintWhite": _m("#c8cac4", 5),
    "crystal": _m("#a6d6ee", 8, 0, 1), "crateWood": _m("#9a7a4c", 10),
    # 17 liquid: the Gravy Blimp's gravy (glossy, fat-swirled; exempt from AO — it's a wet surface, lit by the sun)
    "trussPaint": _m("#55604f", 6), "trussDark": _m("#3d4639", 6), "reed": _m("#6b7a3a", 14), "reedDry": _m("#9a8a52", 14),
    "cattail": _m("#4a3020", 13), "mud": _m("#4c4232", 2),
    "gravyLiquid": _m("#4a2810", 17, 0, 1), "gravyFat": _m("#6c4220", 17, 0, 1), "gravy": _m("#7a4e2a", 13), "gravyLt": _m("#93613a", 13),
    # the landscape: 14 foliage · 15 rock · 16 ore
    "leafA": _m("#46622b", 14), "leafB": _m("#55702f", 14), "leafC": _m("#344d22", 14), "leafD": _m("#617336", 14),
    "pineA": _m("#2f4a2c", 14), "pineB": _m("#3a5532", 14), "bark": _m("#4d3e2e", 10), "barkDark": _m("#3a2f24", 10),
    "rockA": _m("#6f6a60", 15), "rockB": _m("#5c5850", 15), "rockC": _m("#7b766b", 15),
    "ore": _m("#b98a2c", 16), "oreDark": _m("#80591e", 16), "oreLite": _m("#d4a440", 16), "gem": _m("#d89a36", 16),
}


def _rgb(h):
    v = int(h[1:], 16)
    return ((v >> 16) & 255, (v >> 8) & 255, v & 255)


# ---- the builder ----------------------------------------------------------------------------------------
class Model:
    """One model: a bmesh in GAME coordinates plus a material table (face.material_index)."""

    def __init__(self, name, smooth_deg=34):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []
        self.T = Matrix.Identity(4)
        self.stack = []
        self.smooth = math.radians(smooth_deg)

    # transform stack (yaw about y, then pitch about x, then roll about z — the game's alrTRS order)
    def push(self, x=0, y=0, z=0, yaw=0, pitch=0, roll=0, s=None):
        self.stack.append(self.T)
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, "Y") @ Matrix.Rotation(pitch, 4, "X") @ Matrix.Rotation(roll, 4, "Z")
        if s is not None:
            sv = s if isinstance(s, (tuple, list)) else (s, s, s)
            M = M @ Matrix.Diagonal((sv[0], sv[1], sv[2], 1))
        self.T = self.T @ M
        return self

    def pop(self):
        self.T = self.stack.pop()
        return self

    def mi(self, mat):
        if mat not in PAL:
            raise KeyError(mat)
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _done(self, verts, mat, bev=0.0, seg=1, ang=30, recalc=True):
        verts = [v for v in verts if v.is_valid]
        faces = list({f for v in verts for f in v.link_faces})
        idx = self.mi(mat)
        for f in faces:
            f.material_index = idx
        if recalc and faces:
            bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        if bev > 0 and faces:
            lim = math.radians(ang)
            edges = [e for e in {e for f in faces for e in f.edges} if len(e.link_faces) == 2 and e.calc_face_angle(0) > lim]
            if edges:
                bmesh.ops.bevel(self.bm, geom=edges, offset=bev, offset_type="OFFSET", segments=seg, profile=0.5,
                                affect="EDGES", clamp_overlap=True)
        return self

    def _xf(self, local):
        return self.T @ local

    # -- primitives (all sizes are FULL sizes) ------------------------------------------------------------
    def box(self, c, s, mat, bev=0.012, seg=1, taper=None, ang=30):
        """Box centred at c. taper=(sx, sz) scales the top face (a frustum: sloped armour, plinths)."""
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=Matrix.Identity(4))
        vs = r["verts"]
        if taper:
            for v in vs:
                if v.co.y > 0:
                    v.co.x *= taper[0]
                    v.co.z *= taper[1]
        M = self._xf(Matrix.Translation(c) @ Matrix.Diagonal((s[0], s[1], s[2], 1)))
        bmesh.ops.transform(self.bm, matrix=M, verts=vs)
        return self._done(vs, mat, bev, seg, ang)

    def cyl(self, c, r, h, mat, n=16, r2=None, axis="y", bev=0.0, seg=1, cap=True):
        """Cylinder / frustum centred at c along an axis ('y' up, 'x', 'z')."""
        res = bmesh.ops.create_cone(self.bm, cap_ends=cap, cap_tris=False, segments=n, radius1=r,
                                    radius2=r if r2 is None else r2, depth=h, matrix=Matrix.Identity(4))
        vs = res["verts"]
        rot = {"y": Matrix.Rotation(-math.pi / 2, 4, "X"), "x": Matrix.Rotation(math.pi / 2, 4, "Y"), "z": Matrix.Identity(4)}[axis]
        bmesh.ops.transform(self.bm, matrix=self._xf(Matrix.Translation(c) @ rot), verts=vs)
        return self._done(vs, mat, bev, seg)

    def ball(self, c, r, mat, u=14, v=8, s=(1, 1, 1)):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=u, v_segments=v, radius=r, matrix=Matrix.Identity(4))
        vs = res["verts"]
        M = self._xf(Matrix.Translation(c) @ Matrix.Diagonal((s[0], s[1], s[2], 1)))
        bmesh.ops.transform(self.bm, matrix=M, verts=vs)
        return self._done(vs, mat)

    def rock(self, c, r, mat, sub=2, s=(1, 1, 1), amp=0.28, freq=2.2, seed=0.0, flat_below=None):
        """A noise-displaced icosphere: a boulder, a leaf clump, an ore lump. `flat_below` clamps the
        bottom (in local y, before s) so it sits on / sinks into the ground."""
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=1.0, matrix=Matrix.Identity(4))
        vs = res["verts"]
        off = Vector((seed * 7.1, seed * 3.3, seed * 5.7))
        for v in vs:
            d = v.co.normalized()
            n = mnoise.noise(d * freq + off) * 0.7 + mnoise.noise(d * freq * 2.3 + off * 1.7) * 0.3
            v.co = d * (1.0 + amp * n)
            if flat_below is not None and v.co.y < flat_below:
                v.co.y = flat_below
        M = self._xf(Matrix.Translation(c) @ Matrix.Diagonal((s[0] * r, s[1] * r, s[2] * r, 1)))
        bmesh.ops.transform(self.bm, matrix=M, verts=vs)
        return self._done(vs, mat)

    def loft(self, rings, mat, cap0=True, cap1=True, bev=0.0, seg=1, closed=True):
        """Skin rings of equal length (local points). A ring may collapse to one repeated point."""
        bm = self.bm
        V = [[bm.verts.new(self._xf(Vector(p).to_4d()).to_3d()) for p in ring] for ring in rings]
        allv = [v for r in V for v in r]
        n = len(rings[0])
        for i in range(len(V) - 1):
            for j in range(n if closed else n - 1):
                k = (j + 1) % n
                q = [V[i][j], V[i][k], V[i + 1][k], V[i + 1][j]]
                u = []
                for v in q:
                    if not any((v.co - w.co).length < 1e-7 for w in u):
                        u.append(v)
                if len(u) >= 3:
                    try:
                        bm.faces.new(u)
                    except ValueError:
                        pass
        if closed:
            for ring, on in ((V[0], cap0), (V[-1], cap1)):
                if on and (ring[0].co - ring[1].co).length > 1e-7:
                    try:
                        bm.faces.new(ring)
                    except ValueError:
                        pass
        bmesh.ops.remove_doubles(bm, verts=allv, dist=1e-6)
        return self._done([v for v in allv if v.is_valid], mat, bev, seg)

    def lathe(self, prof, mat, c=(0, 0, 0), n=20, bev=0.0, seg=1, caps=True, ring=False):
        """Revolve [(radius, y), ...] about the vertical axis through c. Radius 0 = a pole. ring=True closes
        the profile back on itself (a band / washer / rim: a torus-like closed shell, no caps)."""
        P = list(prof) + ([prof[0]] if ring else [])
        rings = [[(c[0] + math.cos(j / n * TAU) * r, c[1] + y, c[2] + math.sin(j / n * TAU) * r) for j in range(n)] for r, y in P]
        on = caps and not ring
        return self.loft(rings, mat, cap0=on and P[0][0] > 1e-6, cap1=on and P[-1][0] > 1e-6, bev=bev, seg=seg)

    def prism_x(self, pts, x0, x1, mat, bev=0.012, seg=1):
        """A side profile [(z, y), ...] extruded along x from x0 to x1 (hulls, ramps, roofs)."""
        a = [(x0, y, z) for z, y in pts]
        b = [(x1, y, z) for z, y in pts]
        return self.loft([a, b], mat, bev=bev, seg=seg)

    def prism_z(self, pts, z0, z1, mat, bev=0.012, seg=1):
        """A front profile [(x, y), ...] extruded along z."""
        return self.loft([[(x, y, z0) for x, y in pts], [(x, y, z1) for x, y in pts]], mat, bev=bev, seg=seg)

    def prism_y(self, pts, y0, y1, mat, bev=0.012, seg=1, top=1.0, topc=(0, 0)):
        """A plan [(x, z), ...] extruded up; `top` scales the top outline about topc (sloped walls)."""
        lo = [(x, y0, z) for x, z in pts]
        hi = [(topc[0] + (x - topc[0]) * top, y1, topc[1] + (z - topc[1]) * top) for x, z in pts]
        return self.loft([lo, hi], mat, bev=bev, seg=seg)

    def tube(self, path, r, mat, n=8):
        """A pipe through a polyline of local points (mitred joints)."""
        P = [Vector(p) for p in path]
        rings = []
        for i, p in enumerate(P):
            d0 = (P[i] - P[i - 1]).normalized() if i > 0 else None
            d1 = (P[i + 1] - P[i]).normalized() if i < len(P) - 1 else None
            d = ((d0 or d1) + (d1 or d0)).normalized()
            up = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
            ax = d.cross(up).normalized()
            ay = d.cross(ax).normalized()
            rings.append([tuple(p + (ax * math.cos(j / n * TAU) + ay * math.sin(j / n * TAU)) * r) for j in range(n)])
        return self.loft(rings, mat)

    def torus(self, c, R, r, mat, n=24, m=8, axis="y"):
        rings = []
        for j in range(n + 1):
            a = j / n * TAU
            ring = []
            for k in range(m):
                b = k / m * TAU
                rr = R + math.cos(b) * r
                p = Vector((math.cos(a) * rr, math.sin(b) * r, math.sin(a) * rr))
                if axis == "z":
                    p = Vector((p.x, p.z, p.y))
                elif axis == "x":
                    p = Vector((p.y, p.x, p.z))
                ring.append(tuple(Vector(c) + p))
            rings.append(ring)
        return self.loft(rings, mat, cap0=False, cap1=False)

    def bar(self, a, b, w, mat, bev=0.0):
        """A square-section strut from a to b (lattice members, rails, braces)."""
        a, b = Vector(a), Vector(b)
        d = b - a
        L = d.length
        if L < 1e-6:
            return self
        dn = d.normalized()
        up = Vector((0, 1, 0)) if abs(dn.y) < 0.9 else Vector((1, 0, 0))
        ax = dn.cross(up).normalized() * (w / 2)
        ay = dn.cross(ax).normalized() * (w / 2)
        ring = lambda c: [tuple(c + ax + ay), tuple(c - ax + ay), tuple(c - ax - ay), tuple(c + ax - ay)]
        return self.loft([ring(a), ring(b)], mat, bev=bev)

    # -- kit-bash helpers ---------------------------------------------------------------------------------
    def railing(self, pts, h, mat="steel", post=0.012, step=0.12, closed=False):
        """Posts + a top rail + a mid rail along a polyline on a roof edge."""
        P = [Vector(p) for p in pts] + ([Vector(pts[0])] if closed else [])
        for i in range(len(P) - 1):
            a, b = P[i], P[i + 1]
            L = (b - a).length
            k = max(1, int(L / step))
            for j in range(k + (1 if i == len(P) - 2 and not closed else 0)):
                p = a + (b - a) * (j / k)
                self.bar(p, p + Vector((0, h, 0)), post, mat)
            self.bar(a + Vector((0, h, 0)), b + Vector((0, h, 0)), post * 0.9, mat)
            self.bar(a + Vector((0, h * 0.5, 0)), b + Vector((0, h * 0.5, 0)), post * 0.7, mat)
        return self

    def ladder(self, x, z, y0, y1, face="z", w=0.06, mat="steelDark"):
        s = 1 if face in ("z", "x") else -1
        o = Vector((0, 0, 0.012 * s)) if face in ("z", "-z") else Vector((0.012 * s, 0, 0))
        side = Vector((w / 2, 0, 0)) if face in ("z", "-z") else Vector((0, 0, w / 2))
        base = Vector((x, 0, z)) + o
        for sd in (side, -side):
            self.bar(base + sd + Vector((0, y0, 0)), base + sd + Vector((0, y1, 0)), 0.008, mat)
        y = y0 + 0.04
        while y < y1 - 0.01:
            self.bar(base + side + Vector((0, y, 0)), base - side + Vector((0, y, 0)), 0.006, mat)
            y += 0.045
        return self

    def windows(self, a, b, y, n, w, h, face, lit=None, frame="dark", sill=True):
        """n recessed windows evenly between points a and b (local x,z) on a wall facing `face`."""
        a, b = Vector((a[0], y, a[1])), Vector((b[0], y, b[1]))
        nrm = {"x": Vector((1, 0, 0)), "-x": Vector((-1, 0, 0)), "z": Vector((0, 0, 1)), "-z": Vector((0, 0, -1))}[face]
        for k in range(n):
            p = a + (b - a) * ((k + 0.5) / n)
            sx = (w, h, 0.016) if face in ("z", "-z") else (0.016, h, w)
            fx = (w + 0.024, h + 0.024, 0.012) if face in ("z", "-z") else (0.012, h + 0.024, w + 0.024)
            self.box(tuple(p + nrm * 0.004), fx, frame, bev=0)
            gl = "glassLit" if (lit is not None and (k * 7 + int(y * 13)) % 3 == lit) else "glass"
            self.box(tuple(p + nrm * 0.008), sx, gl, bev=0)
            if sill:
                ss = (w + 0.03, 0.012, 0.022) if face in ("z", "-z") else (0.022, 0.012, w + 0.03)
                self.box(tuple(p + nrm * 0.012 - Vector((0, h / 2 + 0.008, 0))), ss, "concLite", bev=0)
        return self

    def stripes(self, a, b, y, w, n, face="z", t=0.004, h=0.025):
        """Hazard stripes (yellow/black) along a line on the ground or a wall."""
        a, b = Vector(a), Vector(b)
        for k in range(n):
            p = a + (b - a) * ((k + 0.5) / n)
            L = (b - a).length / n
            if face == "y":
                d = (b - a).normalized()
                yaw = math.atan2(d.x, d.z)
                self.push(p.x, y, p.z, yaw)
                self.box((0, 0, 0), (w, t, L * 0.98), "hazard" if k % 2 == 0 else "black", bev=0)
                self.pop()
            else:
                self.box((p.x, p.y, p.z), (L * 0.98 if face == "z" else t, h, t if face == "z" else L * 0.98), "hazard" if k % 2 == 0 else "black", bev=0)
        return self

    def fan_unit(self, c, s=0.12, mat="steel"):
        """A rooftop AC unit: a box with a fan grille on top."""
        x, y, z = c
        self.box((x, y + s * 0.3, z), (s * 1.6, s * 0.6, s), mat, bev=0.006)
        self.cyl((x - s * 0.35, y + s * 0.62, z), s * 0.36, 0.012, "dark", n=12)
        self.cyl((x + s * 0.35, y + s * 0.62, z), s * 0.36, 0.012, "dark", n=12)
        for dx in (-s * 0.35, s * 0.35):
            self.bar((x + dx - s * 0.33, y + s * 0.635, z), (x + dx + s * 0.33, y + s * 0.635, z), 0.008, "steelDark")
            self.bar((x + dx, y + s * 0.635, z - s * 0.33), (x + dx, y + s * 0.635, z + s * 0.33), 0.008, "steelDark")
        return self

    def vent(self, c, r=0.03, h=0.06, mat="steel"):
        x, y, z = c
        self.cyl((x, y + h / 2, z), r, h, mat, n=10)
        self.cyl((x, y + h + 0.012, z), r * 1.5, 0.014, "steelDark", n=10, r2=r * 0.6)
        return self

    def lamp(self, x, z, h=0.42, y0=0.1):
        self.cyl((x, y0 + h / 2, z), 0.011, h, "dark", n=6)
        self.box((x, y0 + h + 0.01, z), (0.05, 0.022, 0.03), "dark", bev=0.004)
        self.box((x, y0 + h - 0.003, z), (0.04, 0.008, 0.022), "light", bev=0)
        return self

    def sandbags(self, pts, rows=2, mat="sand", size=0.085):
        """Staggered sandbag rows along a polyline (ground level y=0.1)."""
        P = [Vector(p) for p in pts]
        for i in range(len(P) - 1):
            a, b = P[i], P[i + 1]
            d = b - a
            L = d.length
            yaw = math.atan2(d.x, d.z)
            k = max(1, int(L / size))
            for r in range(rows):
                off = (0.5 if r % 2 else 0.0)
                for j in range(k - (1 if r % 2 else 0)):
                    p = a + d * ((j + 0.5 + off) / k)
                    self.push(p.x, 0.1 + 0.026 + r * 0.045, p.z, yaw + (0.08 if (j + r) % 3 == 0 else -0.05))
                    self.box((0, 0, 0), (0.062, 0.042, L / k * 0.94), mat if (j + r) % 4 else "sandDark", bev=0.016, seg=1)
                    self.pop()
        return self

    def drum(self, x, z, y0=0.1, mat="sauce"):
        self.cyl((x, y0 + 0.045, z), 0.032, 0.09, mat, n=12, bev=0.004)
        self.cyl((x, y0 + 0.03, z), 0.0335, 0.006, "dark", n=12)
        self.cyl((x, y0 + 0.062, z), 0.0335, 0.006, "dark", n=12)
        return self

    def crate(self, c, s=0.08, mat="wood"):
        self.box(c, (s, s, s), mat, bev=0.006)
        x, y, z = c
        self.box((x, y, z + s / 2 + 0.002), (s * 0.9, 0.012, 0.004), "dark", bev=0)
        return self

    def lattice(self, a_lo, a_hi, half_lo, half_hi, mat, bays=4, w=0.012):
        """A 4-legged lattice tower from (x,y,z) a_lo to a_hi with leg spread half_lo -> half_hi."""
        a_lo, a_hi = Vector(a_lo), Vector(a_hi)
        corners = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
        lv = lambda t: [a_lo + (a_hi - a_lo) * t + Vector((sx * (half_lo + (half_hi - half_lo) * t), 0, sz * (half_lo + (half_hi - half_lo) * t))) for sx, sz in corners]
        for i in range(4):
            self.bar(lv(0)[i], lv(1)[i], w * 1.4, mat)
        for b in range(bays + 1):
            ring = lv(b / bays)
            for i in range(4):
                self.bar(ring[i], ring[(i + 1) % 4], w, mat)
            if b < bays:
                nxt = lv((b + 1) / bays)
                for i in range(4):
                    self.bar(ring[i], nxt[(i + 1) % 4], w * 0.8, mat)
        return self


# ---- shared pieces --------------------------------------------------------------------------------------
def foundation(m, w, h):
    """A poured concrete apron: sloped edges into the dirt (not a bevelled game tile), one kerb line."""
    hw, hh = w / 2 - 0.02, h / 2 - 0.02
    m.prism_y([(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)], 0.0, 0.1, "padDark", bev=0.004, top=1.0 - 0.07 / max(w, h))
    m.box((0, 0.1, 0), (w - 0.2, 0.004, h - 0.2), "pad", bev=0)


def wall_block(m, c, s, mat="conc", band=0.5, band_h=0.045, parapet=True, plinth=True, roof="roof"):
    """A building block: plinth, walls, a team band at `band` of its height, a parapet and a roof."""
    x, y0, z = c
    w, h, d = s
    if plinth:
        m.box((x, y0 + 0.03, z), (w + 0.03, 0.06, d + 0.03), "concDark", bev=0.008)
    m.box((x, y0 + h / 2, z), (w, h, d), mat, bev=0.014, seg=2)
    if band:
        m.box((x, y0 + h * band, z), (w + 0.014, band_h, d + 0.014), "bandTeam", bev=0.004)
    if parapet:
        m.box((x, y0 + h + 0.012, z), (w + 0.02, 0.024, d + 0.02), "concLite", bev=0.006)
        m.box((x, y0 + h + 0.014, z), (w - 0.06, 0.024, d - 0.06), roof, bev=0)
    return y0 + h


def pilasters(m, a, b, y0, y1, n, face, s=0.035, mat="concDark"):
    a, b = Vector((a[0], 0, a[1])), Vector((b[0], 0, b[1]))
    for k in range(n):
        p = a + (b - a) * (k / (n - 1))
        if face in ("z", "-z"):
            m.box((p.x, (y0 + y1) / 2, p.z + (0.012 if face == "z" else -0.012)), (s, y1 - y0, 0.03), mat, bev=0.005)
        else:
            m.box((p.x + (0.012 if face == "x" else -0.012), (y0 + y1) / 2, p.z), (0.03, y1 - y0, s), mat, bev=0.005)


def corrugated(m, x0, x1, z0, z1, y, mat="roof", along="x", pitch=0.04):
    """Ribbed metal roofing."""
    m.box(((x0 + x1) / 2, y, (z0 + z1) / 2), (x1 - x0, 0.01, z1 - z0), mat, bev=0)
    if along == "x":
        z = z0 + pitch / 2
        while z < z1:
            m.box(((x0 + x1) / 2, y + 0.008, z), (x1 - x0, 0.008, 0.01), mat, bev=0)
            z += pitch
    else:
        x = x0 + pitch / 2
        while x < x1:
            m.box((x, y + 0.008, (z0 + z1) / 2), (0.01, 0.008, z1 - z0), mat, bev=0)
            x += pitch


def nugget(m, c, r, seed=1, mat="breading", lumps=True, n=16, v=10):
    """A lumpy nugget: an egg with low-frequency wobble + crumbs."""
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, TAU) for _ in range(4)]
    rings = []
    for i in range(v + 1):
        t = i / v
        a = t * math.pi
        rr = math.sin(a)
        yy = -math.cos(a)
        ring = []
        for j in range(n):
            b = j / n * TAU
            k = 1 + 0.09 * math.sin(3 * b + ph[0]) * math.sin(2.5 * a + ph[1]) + 0.06 * math.sin(5 * b + ph[2] + 2 * a)
            ring.append((c[0] + math.cos(b) * rr * r[0] * k, c[1] + yy * r[1] * (0.95 + 0.05 * k), c[2] + math.sin(b) * rr * r[2] * k))
        rings.append(ring)
    m.loft(rings, mat, cap0=False, cap1=False)
    if lumps:
        for _ in range(7):
            b, a = rnd.uniform(0, TAU), rnd.uniform(0.6, 2.4)
            p = (c[0] + math.cos(b) * math.sin(a) * r[0], c[1] - math.cos(a) * r[1], c[2] + math.sin(b) * math.sin(a) * r[2])
            m.ball(p, min(r) * rnd.uniform(0.14, 0.22), "breadDark" if rnd.random() < 0.5 else mat, u=6, v=4)


# =========================================================================================================
# BUILDINGS
# =========================================================================================================
def build_hq():
    """🍟 FRY YARD — the construction yard, 3×3: a two-tier command hall, the control tower, fry vats with a
    catwalk, the golden nugget on the roof. The tower crane is its own part (hq_crane)."""
    m = Model("b.hq")
    foundation(m, 3, 3)
    # the main hall
    top = wall_block(m, (-0.3, 0.1, 0.15), (1.9, 0.56, 1.62), band=0.62)
    m.windows((-1.2, 0.97), (0.6, 0.97), 0.33, 8, 0.1, 0.085, "z", lit=1)
    m.windows((-1.2, 0.97), (0.6, 0.97), 0.52, 8, 0.1, 0.05, "z", lit=2, sill=False)
    m.windows((0.66, -0.55), (0.66, 0.8), 0.33, 6, 0.1, 0.085, "x", lit=0)
    pilasters(m, (-1.25, 0.96), (0.65, 0.96), 0.12, 0.66, 9, "z")
    pilasters(m, (0.65, -0.65), (0.65, 0.96), 0.12, 0.66, 7, "x")
    # the entrance: a canopy, glass doors, steps
    m.box((-0.3, 0.3, 1.02), (0.42, 0.016, 0.16), "steelDark", bev=0.004)
    m.box((-0.3, 0.2, 0.968), (0.3, 0.2, 0.012), "glass", bev=0)
    m.box((-0.3, 0.2, 0.972), (0.012, 0.2, 0.01), "dark", bev=0)
    for k in range(3):
        m.box((-0.3, 0.105 + k * 0.012, 1.0 + 0.08 - k * 0.03), (0.44, 0.012, 0.06), "concLite", bev=0.003)
    m.box((-0.3, 0.42, 0.975), (0.5, 0.06, 0.012), "team", bev=0.003)
    m.lamp(-0.62, 1.12, 0.3)
    # roof clutter
    m.fan_unit((0.25, top + 0.02, 0.6), 0.11)
    m.fan_unit((0.25, top + 0.02, 0.25), 0.11)
    for x, z in ((-1.05, 0.75), (-0.9, 0.75), (0.45, -0.45), (0.0, 0.75)):
        m.vent((x, top + 0.02, z), 0.025, 0.05)
    m.box((-0.05, top + 0.05, -0.45), (0.12, 0.06, 0.12), "steelDark", bev=0.006)
    m.railing([(0.62, top + 0.02, 0.93), (0.62, top + 0.02, -0.63)], 0.06)
    m.railing([(0.62, top + 0.02, 0.93), (-1.22, top + 0.02, 0.93)], 0.06)
    # the upper command deck, slanted glass to the front
    y1 = top + 0.02
    m.box((-0.62, y1 + 0.17, -0.12), (0.98, 0.34, 0.9), "concLite", bev=0.014, seg=2)
    m.box((-0.62, y1 + 0.3, -0.12), (1.0, 0.035, 0.92), "team", bev=0.004)
    m.prism_x([(0.33, y1 + 0.02), (0.33, y1 + 0.26), (0.48, y1 + 0.26), (0.42, y1 + 0.02)], -1.1, -0.14, "concDark", bev=0.008)
    m.prism_x([(0.335, y1 + 0.24), (0.46, y1 + 0.235), (0.415, y1 + 0.06), (0.335, y1 + 0.06)], -1.08, -0.16, "glassLit", bev=0)
    for x in (-1.0, -0.82, -0.62, -0.42, -0.24):
        m.bar((x, y1 + 0.06, 0.42), (x, y1 + 0.24, 0.462), 0.012, "dark")
    m.box((-0.62, y1 + 0.355, -0.12), (0.94, 0.02, 0.86), "roof", bev=0.004)
    m.railing([(-1.08, y1 + 0.365, 0.3), (-0.16, y1 + 0.365, 0.3), (-0.16, y1 + 0.365, -0.54)], 0.05)
    # the golden nugget on its plinth
    m.cyl((-0.62, y1 + 0.4, -0.12), 0.22, 0.06, "steelDark", n=20, r2=0.19, bev=0.008)
    m.cyl((-0.62, y1 + 0.44, -0.12), 0.2, 0.02, "team", n=20)
    nugget(m, (-0.62, y1 + 0.62, -0.12), (0.24, 0.17, 0.2), seed=3, mat="gold")
    # the control tower (front right, the camera's corner)
    tx, tz = 0.95, 0.95
    m.cyl((tx, 0.1 + 0.42, tz), 0.17, 0.84, "concLite", n=18, r2=0.15, bev=0.006)
    for y in (0.3, 0.55):
        m.cyl((tx, y, tz), 0.175, 0.03, "concDark", n=18)
    m.windows((tx, tz + 0.165), (tx, tz + 0.165), 0.4, 1, 0.05, 0.08, "z", lit=0, sill=False)
    m.windows((tx + 0.165, tz), (tx + 0.165, tz), 0.62, 1, 0.05, 0.08, "x", lit=0, sill=False)
    m.lathe([(0.0, 0.94), (0.2, 0.94), (0.25, 0.97), (0.27, 1.1), (0.24, 1.12), (0.0, 1.12)], "glassLit", c=(tx, 0, tz), n=18)
    for k in range(9):
        a = k / 9 * TAU
        m.bar((tx + math.cos(a) * 0.255, 0.96, tz + math.sin(a) * 0.255), (tx + math.cos(a) * 0.272, 1.105, tz + math.sin(a) * 0.272), 0.014, "dark")
    m.lathe([(0.0, 1.12), (0.29, 1.12), (0.29, 1.15), (0.2, 1.19), (0.0, 1.19)], "team", c=(tx, 0, tz), n=18, bev=0.004)
    m.torus((tx, 0.93, tz), 0.25, 0.012, "steel", n=20, m=6)
    m.cyl((tx, 1.28, tz), 0.012, 0.2, "dark", n=6)
    m.cyl((tx, 1.385, tz), 0.018, 0.014, "red", n=8)
    m.push(tx + 0.12, 1.21, tz - 0.05, 0.6, -0.6)
    m.lathe([(0.0, 0.0), (0.03, 0.006), (0.065, 0.025), (0.065, 0.03), (0.0, 0.012)], "white", n=12)
    m.pop()
    # the fry vats (back right) with a catwalk
    vats = [(0.95, -0.55), (0.95, -1.05), (0.42, -1.05)]
    for x, z in vats:
        m.lathe([(0.0, 0.1), (0.2, 0.1), (0.2, 0.52), (0.17, 0.58), (0.06, 0.61), (0.0, 0.61)], "steel", c=(x, 0, z), n=20, bev=0)
        for y in (0.2, 0.36):
            m.torus((x, y, z), 0.2, 0.01, "steelDark", n=20, m=5)
        m.lathe([(0.205, 0.44), (0.205, 0.49), (0.0, 0.49)], "team", c=(x, 0, z), n=20)
        m.cyl((x, 0.635, z), 0.035, 0.05, "goldDark", n=10)
        for k in range(4):
            a = k / 4 * TAU + 0.4
            m.bar((x + math.cos(a) * 0.19, 0.1, z + math.sin(a) * 0.19), (x + math.cos(a) * 0.19, 0.22, z + math.sin(a) * 0.19), 0.03, "steelDark")
    m.box((0.68, 0.64, -0.8), (0.62, 0.014, 0.08), "steelDark", bev=0)
    m.box((0.95, 0.64, -0.8), (0.08, 0.014, 0.52), "steelDark", bev=0)
    m.railing([(0.38, 0.645, -0.76), (0.95, 0.645, -0.76)], 0.05, step=0.1)
    m.ladder(0.95, -0.34, 0.1, 0.62, "z")
    m.tube([(0.75, 0.3, -0.55), (0.66, 0.3, -0.55), (0.66, 0.3, -0.3)], 0.025, "copper")
    m.tube([(0.42, 0.3, -0.85), (0.42, 0.3, -0.62)], 0.025, "copper")
    # the crane's foot (the crane turns: part hq_crane)
    m.cyl((-1.05, 0.2, -1.0), 0.17, 0.2, "concDark", n=14, r2=0.15, bev=0.008)
    m.cyl((-1.05, 0.31, -1.0), 0.12, 0.03, "dark", n=14)
    # lamps, bollards, a parked forklift-ish cart
    return m


def build_hq_crane():
    """The yard's tower crane: a lattice mast, a cab, a lattice jib with trolley + hook, counterweights.
    Origin = the slewing ring (alertUI turns it about y)."""
    m = Model("b.hq_crane")
    m.lattice((0, 0.32, 0), (0, 1.12, 0), 0.055, 0.05, "hazard", bays=6, w=0.012)
    m.box((0, 1.15, 0), (0.13, 0.04, 0.13), "dark", bev=0.006)
    m.box((0.07, 1.23, 0.02), (0.08, 0.1, 0.1), "hazard", bev=0.01)
    m.box((0.112, 1.24, 0.02), (0.004, 0.05, 0.07), "glass", bev=0)
    # the jib (+z): a triangular lattice
    L = 0.95
    a0, a1 = Vector((-0.04, 1.17, 0.05)), Vector((0.04, 1.17, 0.05))
    top = Vector((0, 1.25, 0.05))
    m.bar(a0, a0 + Vector((0, 0, L)), 0.014, "hazard")
    m.bar(a1, a1 + Vector((0, 0, L)), 0.014, "hazard")
    m.bar(top, top + Vector((0, -0.05, L)), 0.012, "hazard")
    for k in range(9):
        z0, z1 = k * L / 9, (k + 1) * L / 9
        tz = lambda z: top + Vector((0, -0.05 * z / L, z))
        m.bar(a0 + Vector((0, 0, z0)), tz(z1), 0.007, "hazard")
        m.bar(a1 + Vector((0, 0, z0)), tz(z1), 0.007, "hazard")
        m.bar(a0 + Vector((0, 0, z1)), a1 + Vector((0, 0, z1)), 0.007, "hazard")
    # the counter-jib (-z) + weights
    m.box((0, 1.18, -0.2), (0.09, 0.025, 0.36), "hazard", bev=0.004)
    m.box((0, 1.13, -0.34), (0.11, 0.09, 0.1), "concDark", bev=0.008)
    m.bar(top, Vector((0, 1.18, -0.36)), 0.008, "steelDark")
    m.bar(Vector((0, 1.32, 0)), top + Vector((0, -0.03, 0.6)), 0.005, "steelDark")
    m.bar(Vector((0, 1.32, 0)), Vector((0, 1.19, -0.36)), 0.005, "steelDark")
    m.cyl((0, 1.29, 0), 0.012, 0.08, "hazard", n=6)
    # trolley, cable, hook block, a hanging load
    m.box((0, 1.155, 0.82), (0.07, 0.02, 0.06), "dark", bev=0.003)
    m.bar((0, 1.15, 0.82), (0, 0.78, 0.82), 0.005, "black")
    m.box((0, 0.76, 0.82), (0.04, 0.04, 0.03), "hazard", bev=0.005)
    m.box((0, 0.7, 0.82), (0.11, 0.05, 0.11), "steel", bev=0.006)
    m.cyl((0, 1.215, 0.98), 0.012, 0.01, "red", n=6)
    return m


def build_power():
    """⚡ GREASE PLANT, 2×2: two hyperboloid cooling towers on column skirts, a turbine hall with a ribbed
    roof, the steam main, and a transformer yard with insulator stacks behind a fence."""
    m = Model("b.power")
    foundation(m, 2, 2)
    for x, z in ((-0.42, -0.38), (0.38, 0.4)):
        # the skirt of columns, then the shell (outer + inner = a closed, thick-lipped shell)
        m.cyl((x, 0.135, z), 0.36, 0.05, "dark", n=24)
        for k in range(16):
            a = k / 16 * TAU
            m.bar((x + math.cos(a) * 0.39, 0.1, z + math.sin(a) * 0.39), (x + math.cos(a + 0.2) * 0.38, 0.18, z + math.sin(a + 0.2) * 0.38), 0.02, "concDark")
        out = [(0.385, 0.17), (0.35, 0.3), (0.315, 0.46), (0.295, 0.6), (0.29, 0.72), (0.3, 0.86), (0.325, 1.0)]
        inn = [(0.305, 1.0), (0.28, 0.86), (0.27, 0.72), (0.275, 0.6), (0.29, 0.46)]
        m.lathe(out + [(0.31, 1.012)] + inn + [(0.0, 0.46)], "conc", c=(x, 0, z), n=28)
        m.lathe([(0.0, 0.47), (0.28, 0.47)], "black", c=(x, 0, z), n=28)
        m.lathe([(0.3, 0.62), (0.3, 0.68), (0.285, 0.68), (0.285, 0.62)], "team", c=(x, 0, z), n=28, ring=True)
        m.lathe([(0.326, 0.94), (0.333, 1.014), (0.3, 1.014), (0.3, 0.94)], "concDark", c=(x, 0, z), n=28, ring=True)
        m.ladder(x, z + 0.318, 0.18, 0.98, "z", w=0.04)
    # the turbine hall
    hx, hz = 0.42, -0.45
    top = wall_block(m, (hx, 0.1, hz), (0.74, 0.32, 0.6), band=0.82, parapet=False)
    m.prism_x([(hz - 0.31, top), (hz - 0.31, top + 0.02), (hz, top + 0.11), (hz + 0.31, top + 0.02), (hz + 0.31, top)], hx - 0.38, hx + 0.38, "roof", bev=0.006)
    for k in range(9):
        x = hx - 0.34 + k * 0.085
        m.bar((x, top + 0.025, hz - 0.31), (x, top + 0.115, hz), 0.012, "roofDark")
        m.bar((x, top + 0.115, hz), (x, top + 0.025, hz + 0.31), 0.012, "roofDark")
    m.windows((hx - 0.3, hz + 0.305), (hx + 0.3, hz + 0.305), 0.25, 4, 0.09, 0.09, "z", lit=0)
    m.windows((hx + 0.375, hz - 0.2), (hx + 0.375, hz + 0.2), 0.25, 3, 0.09, 0.09, "x", lit=1)
    m.box((hx + 0.15, 0.2, hz + 0.305), (0.14, 0.2, 0.012), "steelDark", bev=0.003)
    for k in range(4):
        m.box((hx + 0.15, 0.13 + k * 0.045, hz + 0.312), (0.13, 0.006, 0.004), "dark", bev=0)
    m.vent((hx - 0.2, top + 0.06, hz), 0.035, 0.12, "steelDark")
    # the steam main: tower -> hall, with flanges
    m.tube([(-0.12, 0.3, -0.38), (0.0, 0.3, -0.38), (0.04, 0.3, -0.42)], 0.045, "steel", n=10)
    m.tube([(0.38, 0.28, 0.05), (0.38, 0.28, -0.14)], 0.045, "steel", n=10)
    for p in ((-0.06, 0.3, -0.38), (0.38, 0.28, -0.05)):
        m.cyl(p, 0.058, 0.02, "steelDark", n=10, axis="x" if p[0] < 0 else "z")
    # the transformer yard (front left)
    for k, (x, z) in enumerate(((-0.62, 0.42), (-0.62, 0.72))):
        m.box((x, 0.2, z), (0.22, 0.2, 0.18), "steelDark", bev=0.008)
        for j in range(6):
            m.box((x - 0.12, 0.2, z - 0.07 + j * 0.028), (0.03, 0.16, 0.006), "dark", bev=0)
        for j in range(3):
            xx = x - 0.06 + j * 0.06
            for d in range(5):
                m.cyl((xx, 0.32 + d * 0.022, z), 0.022, 0.012, "white", n=10)
            m.cyl((xx, 0.43, z), 0.006, 0.04, "copper", n=6)
    m.bar((-0.68, 0.46, 0.42), (-0.68, 0.46, 0.72), 0.008, "copper")
    m.bar((-0.56, 0.46, 0.42), (-0.56, 0.46, 0.72), 0.008, "copper")
    # the fence round the yard
    fence = [(-0.88, 0.1, 0.25), (-0.36, 0.1, 0.25), (-0.36, 0.1, 0.9), (-0.88, 0.1, 0.9)]
    m.railing(fence, 0.11, "steel", post=0.01, step=0.09, closed=True)
    m.box((-0.36, 0.17, 0.57), (0.004, 0.06, 0.06), "white", bev=0)
    return m


def build_refinery():
    """🥫 SAUCE REFINERY, 3×3: a gabled processing hall with skylights, a conveyor gantry up from the dock
    hopper, three domed sauce silos with ladders, a striped chimney, the dock apron (+z) with chevrons."""
    m = Model("b.refinery")
    foundation(m, 3, 3)
    # the dock apron: asphalt, chevrons, guide lights
    m.box((0.55, 0.104, 1.0), (1.24, 0.008, 0.84), "tar", bev=0)
    for k in range(4):
        z = 0.75 + k * 0.17
        m.box((-0.02, 0.112, z), (0.03, 0.01, 0.03), "light", bev=0)
        m.box((1.12, 0.112, z), (0.03, 0.01, 0.03), "light", bev=0)
    for k in range(3):
        m.push(0.55, 0.11, 0.8 + k * 0.18, 0)
        m.prism_y([(-0.16, 0.0), (0.0, 0.08), (0.16, 0.0), (0.16, 0.035), (0.0, 0.115), (-0.16, 0.035)], 0, 0.003, "hazard", bev=0)
        m.pop()
    # the processing hall
    hx, hz = -0.35, -0.3
    top = wall_block(m, (hx, 0.1, hz), (1.68, 0.5, 1.4), band=0.78, parapet=False)
    m.prism_x([(hz - 0.72, top), (hz, top + 0.24), (hz + 0.72, top)], hx - 0.86, hx + 0.86, "roof", bev=0.01)
    for k in range(4):
        x = hx - 0.6 + k * 0.4
        m.prism_x([(hz + 0.12, top + 0.205), (hz + 0.4, top + 0.11), (hz + 0.4, top + 0.13), (hz + 0.12, top + 0.225)], x - 0.13, x + 0.13, "glassLit", bev=0)
    m.box((hx, top + 0.245, hz), (1.72, 0.02, 0.05), "roofDark", bev=0.004)
    m.windows((hx - 0.78, hz + 0.705), (hx + 0.78, hz + 0.705), 0.3, 7, 0.09, 0.09, "z", lit=0)
    m.windows((hx + 0.845, hz - 0.6), (hx + 0.845, hz + 0.6), 0.3, 6, 0.09, 0.09, "x", lit=2)
    pilasters(m, (hx - 0.84, hz + 0.7), (hx + 0.84, hz + 0.7), 0.12, 0.58, 8, "z")
    # the unloading bay + hopper at the dock
    m.box((0.2, 0.32, hz + 0.712), (0.36, 0.28, 0.02), "black", bev=0)
    m.box((0.2, 0.47, hz + 0.72), (0.42, 0.03, 0.03), "steelDark", bev=0.004)
    m.lathe([(0.04, 0.32), (0.16, 0.55), (0.17, 0.6), (0.0, 0.6)], "steelDark", c=(0.25, 0, 0.62), n=12, bev=0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.bar((0.25 + sx * 0.12, 0.1, 0.62 + sz * 0.12), (0.25 + sx * 0.12, 0.5, 0.62 + sz * 0.12), 0.02, "steelDark")
    # the conveyor gantry: hopper -> the hall's roof
    a, b = Vector((0.25, 0.62, 0.62)), Vector((-0.1, 1.02, -0.05))
    d = (b - a)
    yaw = math.atan2(d.x, d.z)
    pitch = -math.atan2(d.y, math.hypot(d.x, d.z))
    m.push(*((a + b) / 2), yaw, pitch)
    L = d.length
    m.box((0, 0, 0), (0.12, 0.07, L), "steel", bev=0.006)
    m.box((0, 0.04, 0), (0.1, 0.012, L * 0.98), "black", bev=0)
    for k in range(7):
        m.bar((-0.065, -0.035, -L / 2 + k * L / 6), (0.065, 0.035, -L / 2 + (k + 0.5) * L / 6), 0.008, "steelDark")
    m.pop()
    m.bar((0.1, 0.1, 0.36), (0.1, 0.78, 0.36), 0.025, "steelDark")
    # the sauce silos
    for x, z, r in ((0.98, -0.85, 0.3), (0.98, -0.18, 0.27), (1.05, 0.42, 0.22)):
        h = 0.8
        m.lathe([(0.0, 0.1), (r, 0.1), (r, h), (r * 0.82, h + 0.08), (r * 0.42, h + 0.13), (0.0, h + 0.14)], "sauce", c=(x, 0, z), n=22)
        for y in (0.28, 0.45, 0.62):
            m.torus((x, y, z), r + 0.004, 0.008, "sauceDark", n=22, m=5)
        m.lathe([(r + 0.006, 0.5), (r + 0.006, 0.56), (0.0, 0.56)], "team", c=(x, 0, z), n=22)
        m.cyl((x, h + 0.17, z), 0.03, 0.06, "steel", n=8)
        m.ladder(x, z + r, 0.1, h + 0.04, "z", w=0.05)
        m.railing([(x - r * 0.6, h + 0.09, z + r * 0.5), (x + r * 0.6, h + 0.09, z + r * 0.5)], 0.05, step=0.08)
        m.tube([(x - r, 0.62, z), (0.5, 0.62, z)], 0.032, "steel", n=8)
    # the chimney (smoke comes out of it: alertUI)
    m.cyl((-0.95, 0.35 + 0.45, -0.75), 0.1, 0.9, "concLite", n=14, r2=0.075, bev=0)
    for k, y in enumerate((1.0, 1.12, 1.24)):
        m.cyl((-0.95, y, -0.75), 0.087 - k * 0.003, 0.05, "red" if k % 2 == 0 else "white", n=14)
    m.cyl((-0.95, 1.29, -0.75), 0.08, 0.04, "dark", n=14)
    return m


def build_barracks():
    """🪖 BOOT CAMP, 2×2: a ribbed quonset hut with a gabled porch, a sandbag wall, a watchtower, crates and
    drums. The flag waves on its own part (barracks_flag)."""
    m = Model("b.barracks")
    foundation(m, 2, 2)
    cx, cz, hl, r = -0.12, -0.18, 0.64, 0.42
    n = 14
    # the shell: outer + inner arcs make a closed, thick shell
    prof_o = [(math.cos(k / n * math.pi) * r, math.sin(k / n * math.pi) * r) for k in range(n + 1)]
    prof_i = [(math.cos(k / n * math.pi) * (r - 0.02), math.sin(k / n * math.pi) * (r - 0.02)) for k in range(n, -1, -1)]
    pts = [(cz + a, 0.1 + b) for a, b in prof_o + prof_i]
    m.prism_x(pts, cx - hl, cx + hl, "olive", bev=0)
    for k in range(9):
        x = cx - hl + 0.04 + k * (2 * hl - 0.08) / 8
        m.push(x, 0.1, cz, math.pi / 2)
        m.torus((0, 0, 0), r + 0.004, 0.009, "oliveDark", n=20, m=4, axis="z")
        m.pop()
    m.box((cx, 0.1 - 0.02, cz), (2 * hl + 0.02, 0.04, 2 * r + 0.06), "concDark", bev=0.006)
    # the end walls
    for s in (-1, 1):
        end = [(cz + a, 0.1 + b) for a, b in prof_o]
        m.prism_x(end, cx + s * hl - 0.012, cx + s * hl + 0.012, "oliveDark", bev=0)
    m.windows((cx + hl + 0.013, cz - 0.2), (cx + hl + 0.013, cz + 0.2), 0.3, 2, 0.08, 0.08, "x", lit=0, sill=False)
    m.box((cx + hl + 0.02, 0.2, cz), (0.012, 0.2, 0.12), "dark", bev=0)
    # windows along the shell's lower flank
    for k in range(4):
        x = cx - 0.45 + k * 0.3
        m.push(x, 0.1, cz, 0, 0)
        m.box((0, 0.2, r - 0.04), (0.09, 0.07, 0.03), "glass", bev=0)
        m.pop()
    # the porch on +z with a little gable
    px, pz = cx + 0.1, cz + r
    m.box((px, 0.22, pz + 0.07), (0.3, 0.24, 0.16), "olive", bev=0.006)
    m.prism_x([(pz - 0.02, 0.34), (pz + 0.07, 0.42), (pz + 0.16, 0.34)], px - 0.18, px + 0.18, "oliveDark", bev=0.004)
    m.box((px, 0.2, pz + 0.152), (0.12, 0.2, 0.012), "dark", bev=0)
    m.box((px, 0.32, pz + 0.155), (0.2, 0.035, 0.008), "team", bev=0)
    m.box((px, 0.37, pz + 0.155), (0.04, 0.015, 0.01), "light", bev=0)
    m.box((px, 0.103, pz + 0.22), (0.28, 0.008, 0.12), "concLite", bev=0)
    # sandbags along the front + the right side
    m.sandbags([(-0.88, 0, 0.82), (0.02, 0, 0.82)], rows=2)
    m.sandbags([(0.86, 0, 0.82), (0.86, 0, 0.05)], rows=2)
    # the watchtower (back left)
    wx, wz = -0.74, -0.74
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.bar((wx + sx * 0.1, 0.1, wz + sz * 0.1), (wx + sx * 0.075, 0.62, wz + sz * 0.075), 0.022, "wood")
    m.bar((wx - 0.1, 0.3, wz + 0.1), (wx + 0.09, 0.5, wz + 0.09), 0.01, "wood")
    m.bar((wx + 0.1, 0.3, wz + 0.1), (wx - 0.09, 0.5, wz + 0.09), 0.01, "wood")
    m.box((wx, 0.63, wz), (0.24, 0.02, 0.24), "wood", bev=0.004)
    m.box((wx, 0.68, wz + 0.11), (0.24, 0.08, 0.012), "sand", bev=0.004)
    m.box((wx + 0.11, 0.68, wz), (0.012, 0.08, 0.24), "sand", bev=0.004)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.bar((wx + sx * 0.11, 0.64, wz + sz * 0.11), (wx + sx * 0.11, 0.8, wz + sz * 0.11), 0.01, "wood")
    m.push(wx, 0, wz)
    m.prism_y([(-0.15, -0.15), (0.15, -0.15), (0.15, 0.15), (-0.15, 0.15)], 0.8, 0.88, "oliveDark", bev=0.004, top=0.12)
    m.pop()
    m.box((wx + 0.06, 0.73, wz + 0.1), (0.03, 0.02, 0.03), "light", bev=0)
    # the flagpole foot (the flag itself is a part) + kit
    m.cyl((0.72, 0.13, -0.65), 0.05, 0.05, "concDark", n=10)
    m.cyl((0.72, 0.6, -0.65), 0.014, 0.95, "steel", n=8, r2=0.009)
    m.ball((0.72, 1.08, -0.65), 0.022, "gold", u=8, v=5)
    m.crate((0.6, 0.145, 0.25), 0.09)
    m.crate((0.62, 0.235, 0.26), 0.07, "olive")
    m.crate((0.48, 0.145, 0.3), 0.07)
    m.drum(0.62, 0.48, mat="olive")
    m.drum(0.54, 0.52, mat="team")
    return m


def build_barracks_flag():
    """The flag: origin at the pole, waving in +x (a rippled strip)."""
    m = Model("b.barracks_flag")
    rings = []
    for k in range(9):
        x = 0.012 + k * 0.04
        zz = math.sin(k * 0.9) * 0.025 * (k / 8)
        rings.append([(x, -0.11, zz - 0.004), (x, 0.11, zz - 0.004), (x, 0.11, zz + 0.004), (x, -0.11, zz + 0.004)])
    m.loft(rings, "team")
    nugget(m, (0.17, 0.0, math.sin(4 * 0.9) * 0.012 + 0.008), (0.045, 0.04, 0.012), seed=5, mat="gold", lumps=False, n=10, v=6)
    return m


def build_factory():
    """🏭 TANK FRYER, 3×3: a big hangar with a ribbed barrel roof and a skylight spine, buttresses, the
    portal frame with chevrons round the door (+z), roof stacks, a side office, the ramp."""
    m = Model("b.factory")
    foundation(m, 3, 3)
    hx, hz = 0.0, -0.2
    W, D, H = 2.6, 1.9, 0.62
    top = wall_block(m, (hx, 0.1, hz), (W, H, D), band=0.85, parapet=False)
    # the barrel roof: a thick arched shell along x + ribs + a skylight spine
    n, r = 16, 0.95
    prof_o = [(math.cos(k / n * math.pi) * r, math.sin(k / n * math.pi) * 0.42) for k in range(n + 1)]
    prof_i = [(math.cos(k / n * math.pi) * (r - 0.02), math.sin(k / n * math.pi) * 0.4) for k in range(n, -1, -1)]
    m.prism_x([(hz + a, top + b) for a, b in prof_o + prof_i], -W / 2 + 0.02, W / 2 - 0.02, "roof", bev=0)
    for k in range(8):
        x = -W / 2 + 0.1 + k * (W - 0.2) / 7
        rib = [(hz + math.cos(j / n * math.pi) * (r + 0.012), top + math.sin(j / n * math.pi) * 0.432) for j in range(n + 1)]
        rib_in = [(hz + math.cos(j / n * math.pi) * (r - 0.005), top + math.sin(j / n * math.pi) * 0.41) for j in range(n, -1, -1)]
        m.prism_x(rib + rib_in, x - 0.018, x + 0.018, "roofDark", bev=0)
    m.box((hx, top + 0.43, hz), (W - 0.3, 0.03, 0.2), "glassLit", bev=0.006)
    for k in range(10):
        m.box((-W / 2 + 0.25 + k * (W - 0.5) / 9, top + 0.448, hz), (0.012, 0.012, 0.22), "dark", bev=0)
    # the gable walls under the arch
    for s in (-1, 1):
        m.prism_x([(hz + a, top + b) for a, b in prof_o], s * W / 2 - 0.02, s * W / 2 + 0.005, "concDark", bev=0)
    m.windows((W / 2 + 0.006, hz - 0.5), (W / 2 + 0.006, hz + 0.5), top + 0.17, 5, 0.1, 0.12, "x", lit=1, sill=False)
    # buttresses down the +x side
    for k in range(5):
        z = hz - D / 2 + 0.15 + k * (D - 0.3) / 4
        m.prism_z([(W / 2, 0.1), (W / 2 + 0.1, 0.1), (W / 2 + 0.04, top), (W / 2, top)], z - 0.04, z + 0.04, "concDark", bev=0.006)
    m.windows((W / 2 + 0.005, hz - 0.75), (W / 2 + 0.005, hz + 0.75), 0.4, 4, 0.12, 0.1, "x", lit=0)
    # the portal frame round the door (door opening: x ±0.55, y 0.1..0.78 on z = hz + D/2)
    fz = hz + D / 2
    m.box((-0.66, 0.46, fz + 0.04), (0.14, 0.72, 0.1), "concLite", bev=0.012, seg=2)
    m.box((0.66, 0.46, fz + 0.04), (0.14, 0.72, 0.1), "concLite", bev=0.012, seg=2)
    m.box((0, 0.86, fz + 0.04), (1.46, 0.16, 0.1), "concLite", bev=0.012, seg=2)
    m.box((0, 0.86, fz + 0.095), (1.2, 0.08, 0.01), "team", bev=0.003)
    m.box((0, 0.44, fz - 0.01), (1.12, 0.7, 0.02), "black", bev=0)
    for x in (-0.45, 0.45):
        m.box((x, 0.96, fz + 0.1), (0.07, 0.03, 0.05), "dark", bev=0.004)
        m.box((x, 0.945, fz + 0.12), (0.05, 0.01, 0.02), "light", bev=0)
    # the side office (front left)
    ox, oz = -1.1, 0.95
    otop = wall_block(m, (ox, 0.1, oz), (0.6, 0.34, 0.5), band=0.7)
    m.windows((ox - 0.26, oz + 0.255), (ox + 0.26, oz + 0.255), 0.28, 3, 0.11, 0.09, "z", lit=0)
    m.fan_unit((ox, otop + 0.02, oz), 0.1)
    # roof stacks + vents
    for x in (-0.8, 0.0, 0.8):
        m.cyl((x, top + 0.45, hz - 0.5), 0.06, 0.3, "steelDark", n=12)
        m.cyl((x, top + 0.61, hz - 0.5), 0.07, 0.03, "black", n=12)
    for x in (-1.0, -0.4, 0.4, 1.0):
        m.vent((x, top + 0.18, hz + 0.72), 0.03, 0.06)
    # the ramp + apron
    m.prism_x([(fz + 0.02, 0.1), (fz + 0.02, 0.135), (fz + 0.36, 0.1)], -0.55, 0.55, "padDark", bev=0.004)
    m.stripes((-0.55, 0, fz + 0.4), (0.55, 0, fz + 0.4), 0.104, 0.03, 10, face="y")
    return m


def build_factory_door():
    """The roll-up door: origin at its centre, 1.04 × 0.64 (alertUI slides + squashes it up)."""
    m = Model("b.factory_door")
    m.box((0, 0, 0), (1.06, 0.66, 0.025), "steel", bev=0.004)
    for k in range(9):
        m.box((0, -0.3 + k * 0.075, 0.014), (1.04, 0.01, 0.008), "steelDark", bev=0)
    m.box((0, 0.2, 0.019), (0.5, 0.07, 0.006), "team", bev=0)
    return m


def build_radar():
    """📡 SAUCE RADAR, 2×2: the ops building with a raked glass band, a lattice tower carrying the dish
    (radar_dish), roof antennas and a cable tray."""
    m = Model("b.radar")
    foundation(m, 2, 2)
    bx, bz = -0.2, 0.2
    top = wall_block(m, (bx, 0.1, bz), (1.26, 0.38, 1.1), band=0.88)
    # the raked observation band on the two camera faces
    m.prism_x([(bz + 0.55, 0.26), (bz + 0.62, 0.26), (bz + 0.58, 0.42), (bz + 0.55, 0.42)], bx - 0.63, bx + 0.63, "concDark", bev=0.004)
    m.prism_x([(bz + 0.592, 0.275), (bz + 0.618, 0.275), (bz + 0.583, 0.41), (bz + 0.565, 0.41)], bx - 0.6, bx + 0.6, "glassLit", bev=0)
    m.prism_z([(bx + 0.63, 0.26), (bx + 0.7, 0.26), (bx + 0.66, 0.42), (bx + 0.63, 0.42)], bz - 0.55, bz + 0.55, "concDark", bev=0.004)
    m.prism_z([(bx + 0.672, 0.275), (bx + 0.698, 0.275), (bx + 0.663, 0.41), (bx + 0.645, 0.41)], bz - 0.52, bz + 0.52, "glassLit", bev=0)
    m.windows((bx - 0.55, bz + 0.552), (bx + 0.55, bz + 0.552), 0.18, 6, 0.08, 0.06, "z", lit=1, sill=False)
    m.box((bx - 0.35, 0.18, bz + 0.555), (0.12, 0.16, 0.012), "steelDark", bev=0)
    # roof: equipment, antennas, a small dish
    m.fan_unit((bx - 0.3, top + 0.02, bz - 0.2), 0.1)
    m.box((bx + 0.2, top + 0.06, bz + 0.1), (0.3, 0.08, 0.22), "steel", bev=0.008)
    for k in range(3):
        x = bx - 0.45 + k * 0.12
        m.cyl((x, top + 0.2, bz + 0.38), 0.006, 0.36, "dark", n=5)
        m.cyl((x, top + 0.3, bz + 0.38), 0.025, 0.006, "steel", n=8)
    m.push(bx + 0.35, top + 0.08, bz - 0.3, 2.4, -0.7)
    m.lathe([(0.0, 0.0), (0.035, 0.006), (0.07, 0.022), (0.072, 0.028), (0.0, 0.012)], "white", n=14)
    m.pop()
    m.cyl((bx + 0.35, top + 0.04, bz - 0.3), 0.02, 0.06, "dark", n=6)
    # the lattice tower for the big dish (dish pivot at (0.45, 0.78, -0.45))
    tx, tz = 0.45, -0.45
    m.box((tx, 0.13, tz), (0.36, 0.06, 0.36), "concDark", bev=0.01)
    m.lattice((tx, 0.16, tz), (tx, 0.7, tz), 0.15, 0.08, "steelDark", bays=4, w=0.016)
    m.cyl((tx, 0.72, tz), 0.15, 0.04, "steel", n=16)
    m.cyl((tx, 0.755, tz), 0.12, 0.03, "team", n=16)
    m.railing([(tx - 0.13, 0.74, tz - 0.13), (tx + 0.13, 0.74, tz - 0.13), (tx + 0.13, 0.74, tz + 0.13), (tx - 0.13, 0.74, tz + 0.13)], 0.05, closed=True, step=0.09)
    m.ladder(tx, tz + 0.14, 0.16, 0.72, "z", w=0.04)
    # the cable tray from the tower to the building
    m.box(((tx + bx + 0.63) / 2 - 0.05, 0.3, tz), (0.2, 0.012, 0.05), "steelDark", bev=0)
    return m


def build_radar_dish():
    """The dish: origin at the bearing; a yoke, then a parabolic reflector tipped up and facing +z, with a
    feed horn on three struts and a back frame."""
    m = Model("b.radar_dish")
    m.cyl((0, 0.04, 0), 0.07, 0.08, "steelDark", n=12)
    m.box((0, 0.12, 0), (0.18, 0.04, 0.06), "dark", bev=0.006)
    for s in (-1, 1):
        m.box((s * 0.08, 0.2, 0), (0.02, 0.14, 0.05), "dark", bev=0.004)
    m.push(0, 0.22, 0.02, 0, -0.55)
    # parabola, thick (outer + inner) so it's one closed shell
    R, f = 0.36, 0.16
    prof = []
    for k in range(9):
        r = R * k / 8
        prof.append((r, r * r / (4 * f) * 0.9))
    back = [(r, y - 0.018) for r, y in reversed(prof)]
    m.push(0, 0, 0, 0, math.pi / 2)
    m.lathe(prof + [(R + 0.01, prof[-1][1])] + back, "concLite", n=26)
    m.lathe([(R + 0.012, prof[-1][1] - 0.02), (R + 0.012, prof[-1][1] + 0.012), (R - 0.01, prof[-1][1] + 0.012), (R - 0.01, prof[-1][1] - 0.02)], "team", n=26, ring=True)
    # feed horn on struts
    for k in range(3):
        a = k / 3 * TAU + 0.5
        m.bar((math.cos(a) * R * 0.85, prof[-2][1], math.sin(a) * R * 0.85), (0, 0.27, 0), 0.008, "dark")
    m.cyl((0, 0.28, 0), 0.025, 0.05, "dark", n=8)
    m.ball((0, 0.31, 0), 0.018, "red", u=8, v=5)
    # back frame
    for k in range(6):
        a = k / 6 * TAU
        m.bar((0, -0.03, 0), (math.cos(a) * R * 0.8, prof[6][1] - 0.02, math.sin(a) * R * 0.8), 0.012, "steelDark")
    m.pop()
    m.pop()
    return m


def build_turret():
    """🔫 NUG GUN, 1×1: a sloped octagonal emplacement with a team band, sandbags on two sides, ammo."""
    m = Model("b.turret")
    m.box((0, 0.04, 0), (0.94, 0.08, 0.94), "padDark", bev=0.025, seg=2)
    m.lathe([(0.0, 0.08), (0.42, 0.08), (0.36, 0.3), (0.32, 0.32), (0.0, 0.32)], "concDark", n=8, bev=0.012, seg=2)
    m.lathe([(0.39, 0.16), (0.373, 0.22), (0.0, 0.22)], "team", n=8)
    m.lathe([(0.27, 0.32), (0.27, 0.33), (0.0, 0.33)], "dark", n=16)
    m.sandbags([(-0.42, 0, 0.44), (0.42, 0, 0.44)], rows=1, size=0.09)
    m.sandbags([(0.44, 0, 0.42), (0.44, 0, -0.42)], rows=1, size=0.09)
    return m


def build_turret_head():
    """The gun house: origin on the ring. Sloped armour faces, a mantlet, twin barrels with muzzle brakes
    (+z), a sight box, a team roof plate."""
    m = Model("b.turret_head")
    plan = [(-0.15, -0.2), (0.15, -0.2), (0.21, -0.04), (0.16, 0.16), (-0.16, 0.16), (-0.21, -0.04)]
    m.prism_y(plan, 0.0, 0.17, "steel", bev=0.012, seg=2, top=0.82, topc=(0, -0.01))
    m.prism_y([(x * 0.78, z * 0.78 - 0.01) for x, z in plan], 0.17, 0.18, "team", bev=0.004)
    m.box((0, 0.09, 0.17), (0.2, 0.11, 0.06), "steelDark", bev=0.012, seg=2)
    for s in (-1, 1):
        x = s * 0.055
        m.cyl((x, 0.09, 0.42), 0.022, 0.46, "dark", n=10, axis="z")
        m.cyl((x, 0.09, 0.32), 0.03, 0.08, "dark", n=10, axis="z")
        m.box((x, 0.09, 0.66), (0.05, 0.05, 0.05), "black", bev=0.006)
        m.cyl((x, 0.09, 0.69), 0.012, 0.01, "black", n=8, axis="z")
    m.box((0.12, 0.2, -0.02), (0.06, 0.05, 0.08), "steelDark", bev=0.006)
    m.box((0.12, 0.205, 0.025), (0.04, 0.025, 0.006), "glass", bev=0)
    m.box((0, 0.1, -0.21), (0.22, 0.08, 0.03), "steelDark", bev=0.006)
    m.cyl((-0.1, 0.24, -0.12), 0.005, 0.12, "dark", n=5)
    return m


def build_tesla():
    """⚡ TESLA FRYER, 1×1: a stepped plinth with four buttress legs, the column, stacked copper toroids
    with insulator rings, the discharge sphere on top."""
    m = Model("b.tesla")
    m.box((0, 0.04, 0), (0.94, 0.08, 0.94), "padDark", bev=0.025, seg=2)
    m.lathe([(0.0, 0.08), (0.38, 0.08), (0.34, 0.2), (0.25, 0.26), (0.0, 0.26)], "dark", n=8, bev=0.01)
    m.lathe([(0.355, 0.15), (0.335, 0.2), (0.0, 0.2)], "team", n=8)
    for k in range(4):
        a = k / 4 * TAU + TAU / 8
        c, s = math.cos(a), math.sin(a)
        m.push(c * 0.3, 0, s * 0.3, -a + math.pi / 2)
        m.prism_z([(-0.035, 0.1), (0.035, 0.1), (0.02, 0.62), (-0.02, 0.62)], -0.07, 0.04, "steelDark", bev=0.006)
        m.pop()
        m.bar((c * 0.27, 0.6, s * 0.27), (c * 0.09, 0.66, s * 0.09), 0.025, "steelDark")
    m.cyl((0, 0.75, 0), 0.08, 1.0, "steel", n=12, r2=0.055)
    for k in range(6):
        y = 0.44 + k * 0.125
        R = 0.2 - k * 0.018
        m.torus((0, y, 0), R, 0.03, "copper", n=20, m=7)
        m.torus((0, y + 0.03, 0), R - 0.02, 0.016, "copperDark", n=18, m=5)
        m.cyl((0, y + 0.062, 0), R * 0.6, 0.016, "white", n=14)
    m.torus((0, 1.23, 0), 0.08, 0.02, "steelDark", n=18, m=6)
    m.ball((0, 1.33, 0), 0.13, "steel", u=20, v=12)
    m.torus((0, 1.33, 0), 0.15, 0.012, "copper", n=22, m=6)
    for k in range(4):
        a = k / 4 * TAU
        m.bar((math.cos(a) * 0.1, 1.38, math.sin(a) * 0.1), (math.cos(a) * 0.15, 1.46, math.sin(a) * 0.15), 0.008, "copper")
    m.tube([(0.3, 0.12, -0.3), (0.3, 0.12, 0.0), (0.12, 0.3, 0.0)], 0.014, "black", n=6)
    return m


# =========================================================================================================
# UNITS (face +z)
# =========================================================================================================
def track_run(m, x, w, z0, z1, y0=0.02, r=0.075, wheels=5, wr=0.058, lugs=True):
    """One side's track: a stadium-shaped belt with lugs, road wheels + hubs on the outside, the sprocket
    at the front and the idler at the back."""
    sgn = 1 if x > 0 else -1
    pts = []
    for k in range(9):          # front round (sprocket)
        a = -math.pi / 2 + k / 8 * math.pi
        pts.append((z1 - r + math.cos(a) * r, y0 + r + math.sin(a) * r))
    for k in range(9):          # back round (idler)
        a = math.pi / 2 + k / 8 * math.pi
        pts.append((z0 + r + math.cos(a) * r, y0 + r + math.sin(a) * r))
    m.prism_x(pts, x - w / 2, x + w / 2, "rubber", bev=0.006)
    if lugs:
        n = int((z1 - z0 - 2 * r) / 0.045)
        for k in range(n + 1):
            z = z0 + r + k * (z1 - z0 - 2 * r) / max(1, n)
            m.box((x, y0 + 2 * r + 0.004, z), (w * 1.02, 0.008, 0.016), "dark", bev=0)
    xo = x + sgn * (w / 2 + 0.006)
    span = z1 - z0 - 2 * r
    for k in range(wheels):
        z = z0 + r + span * k / (wheels - 1)
        m.cyl((xo, y0 + wr, z), wr, 0.022, "steelDark", n=14, axis="x", bev=0.004)
        m.cyl((xo + sgn * 0.012, y0 + wr, z), wr * 0.45, 0.012, "dark", n=10, axis="x")
    m.cyl((xo, y0 + r, z1 - r), r * 0.85, 0.02, "dark", n=12, axis="x", bev=0.003)
    for k in range(8):
        a = k / 8 * TAU
        m.box((xo, y0 + r + math.sin(a) * r * 0.85, z1 - r + math.cos(a) * r * 0.85), (0.024, 0.02, 0.02), "dark", bev=0)
    m.cyl((xo, y0 + r, z0 + r), r * 0.8, 0.02, "steelDark", n=12, axis="x", bev=0.003)


def build_tank():
    """BREADED TANK — a light/medium battle tank in the RA2 'Grizzly' mould: sloped glacis, side skirts,
    five road wheels a side, an engine deck with grilles, headlights."""
    m = Model("u.tank")
    for s in (-1, 1):
        track_run(m, s * 0.255, 0.13, -0.42, 0.42)
        # the fender / skirt over the track, team-coloured, bevelled ends
        m.prism_x([(-0.45, 0.178), (-0.43, 0.2), (0.4, 0.2), (0.46, 0.178)], s * 0.19, s * 0.33, "team", bev=0.005)
        for z in (-0.44, 0.45):
            m.box((s * 0.26, 0.16, z), (0.12, 0.04, 0.006), "rubber", bev=0)
    # the hull: lower tub + an upper deck with a long sloped glacis
    m.prism_x([(-0.42, 0.11), (-0.44, 0.24), (0.12, 0.27), (0.43, 0.2), (0.43, 0.16), (0.36, 0.1)], -0.19, 0.19, "armorDark", bev=0.01, seg=2)
    m.prism_x([(-0.4, 0.24), (-0.4, 0.29), (0.14, 0.29), (0.4, 0.215), (0.4, 0.2), (0.12, 0.27)], -0.205, 0.205, "armor", bev=0.01, seg=2)
    # the engine deck: grilles + exhausts + a rear plate
    for k in range(6):
        m.box((0, 0.296, -0.36 + k * 0.03), (0.3, 0.006, 0.012), "dark", bev=0)
    m.box((0.12, 0.297, -0.18), (0.08, 0.008, 0.08), "steelDark", bev=0.003)
    for s in (-1, 1):
        m.cyl((s * 0.13, 0.22, -0.44), 0.022, 0.05, "dark", n=8, axis="z")
        m.box((s * 0.15, 0.15, 0.44), (0.05, 0.03, 0.03), "steelDark", bev=0.004)
        m.box((s * 0.15, 0.15, 0.457), (0.035, 0.018, 0.006), "light", bev=0)
        m.box((s * 0.08, 0.235, 0.39), (0.04, 0.012, 0.03), "dark", bev=0.003)
    m.box((0, 0.17, -0.445), (0.26, 0.06, 0.02), "steelDark", bev=0.004)
    # spare track links on the glacis, a tow cable, the driver's hatch
    for k in range(3):
        m.box((-0.1 + k * 0.05, 0.245, 0.3), (0.045, 0.012, 0.03), "rubber", bev=0.002)
    m.box((0.09, 0.27, 0.22), (0.07, 0.016, 0.06), "armorDark", bev=0.006)
    m.tube([(-0.17, 0.3, -0.3), (-0.17, 0.3, 0.05), (-0.15, 0.3, 0.08)], 0.008, "steelDark", n=5)
    return m


def build_tank_turret():
    """The turret: origin on the ring (alertUI: hull y 0.29). Faceted cast armour, a mantlet, the
    commander's cupola with an MG, smoke launchers, a bustle rack, an antenna."""
    m = Model("u.tank_turret")
    plan = [(-0.12, -0.2), (0.12, -0.2), (0.17, -0.06), (0.15, 0.1), (0.07, 0.17), (-0.07, 0.17), (-0.15, 0.1), (-0.17, -0.06)]
    m.prism_y(plan, 0.0, 0.11, "team", bev=0.012, seg=2, top=0.8, topc=(0, -0.02))
    m.prism_y([(x * 0.98, z * 0.98) for x, z in plan], -0.02, 0.0, "armorDark", bev=0.004)
    m.box((0, 0.065, 0.17), (0.12, 0.08, 0.06), "armorDark", bev=0.012, seg=2)
    # the cupola + hatch + MG
    m.cyl((-0.06, 0.13, -0.05), 0.045, 0.04, "armor", n=12, bev=0.004)
    m.cyl((-0.06, 0.155, -0.05), 0.04, 0.012, "steelDark", n=12)
    m.box((-0.03, 0.17, -0.02), (0.012, 0.012, 0.09), "black", bev=0)
    # the sight + smoke launchers
    m.box((0.07, 0.125, 0.05), (0.04, 0.035, 0.05), "steelDark", bev=0.005)
    m.box((0.07, 0.125, 0.078), (0.03, 0.02, 0.004), "glass", bev=0)
    for s in (-1, 1):
        for k in range(3):
            m.cyl((s * 0.16, 0.08 + k * 0.016, 0.02), 0.009, 0.04, "dark", n=6, axis="z")
    # the bustle rack + antenna
    m.box((0, 0.06, -0.225), (0.2, 0.05, 0.05), "steelDark", bev=0.004)
    m.box((0, 0.07, -0.23), (0.16, 0.035, 0.035), "olive", bev=0.008)
    m.cyl((0.09, 0.22, -0.16), 0.004, 0.22, "black", n=4)
    return m


def build_tank_gun():
    """The gun: origin at the trunnion (turret local (0, 0.075, 0.12)); the barrel runs +z with a fume
    extractor and a muzzle brake."""
    m = Model("u.tank_gun")
    m.cyl((0, 0, 0.04), 0.032, 0.07, "armorDark", n=12, axis="z", bev=0.004)
    m.cyl((0, 0, 0.24), 0.019, 0.36, "dark", n=12, axis="z", r2=0.017)
    m.cyl((0, 0, 0.22), 0.028, 0.08, "dark", n=12, axis="z", bev=0.004)
    m.box((0, 0, 0.43), (0.04, 0.035, 0.05), "black", bev=0.006)
    m.cyl((0, 0, 0.455), 0.01, 0.01, "black", n=8, axis="z")
    return m


def build_heavy():
    """DEEP FRYER — the twin-gun heavy tank in the RA2 'Apocalypse' mould: four separate track pods,
    a tall slab-sided hull with a heavy glacis, armour skirts, a big engine deck."""
    m = Model("u.heavy")
    for s in (-1, 1):
        for z0, z1 in ((-0.5, -0.03), (0.03, 0.5)):
            track_run(m, s * 0.31, 0.15, z0, z1, r=0.08, wheels=3, wr=0.06)
        m.prism_x([(-0.53, 0.2), (-0.51, 0.225), (0.48, 0.225), (0.54, 0.2)], s * 0.225, s * 0.395, "team", bev=0.006)
        m.box((s * 0.31, 0.215, 0.0), (0.17, 0.03, 0.05), "teamDark", bev=0.004)
    m.prism_x([(-0.48, 0.13), (-0.5, 0.29), (0.14, 0.33), (0.5, 0.24), (0.5, 0.2), (0.42, 0.12)], -0.23, 0.23, "armorDark", bev=0.012, seg=2)
    m.prism_x([(-0.47, 0.29), (-0.47, 0.345), (0.16, 0.345), (0.47, 0.255), (0.47, 0.24), (0.14, 0.33)], -0.245, 0.245, "armor", bev=0.012, seg=2)
    for k in range(8):
        m.box((0, 0.352, -0.43 + k * 0.03), (0.36, 0.006, 0.012), "dark", bev=0)
    for s in (-1, 1):
        m.cyl((s * 0.2, 0.37, -0.32), 0.026, 0.06, "dark", n=8)
        m.cyl((s * 0.2, 0.405, -0.32), 0.03, 0.012, "black", n=8)
        m.box((s * 0.18, 0.18, 0.51), (0.06, 0.035, 0.03), "steelDark", bev=0.004)
        m.box((s * 0.18, 0.18, 0.528), (0.045, 0.02, 0.006), "light", bev=0)
    for k in range(4):
        m.box((-0.14 + k * 0.09, 0.3, 0.38), (0.07, 0.014, 0.035), "rubber", bev=0.002)
    m.box((0, 0.2, -0.505), (0.32, 0.08, 0.02), "steelDark", bev=0.004)
    return m


def build_heavy_turret():
    """The big turret: origin on the ring (hull y 0.34). A wide slab turret with a sloped face, missile
    pods on both cheeks, a cupola, a rear stowage box."""
    m = Model("u.heavy_turret")
    plan = [(-0.16, -0.24), (0.16, -0.24), (0.21, -0.1), (0.2, 0.12), (0.1, 0.22), (-0.1, 0.22), (-0.2, 0.12), (-0.21, -0.1)]
    m.prism_y(plan, 0.0, 0.14, "team", bev=0.014, seg=2, top=0.82, topc=(0, -0.02))
    m.prism_y([(x * 0.98, z * 0.98) for x, z in plan], -0.02, 0.0, "armorDark", bev=0.004)
    m.box((0, 0.085, 0.22), (0.2, 0.1, 0.06), "armorDark", bev=0.014, seg=2)
    for s in (-1, 1):
        m.box((s * 0.25, 0.09, -0.02), (0.08, 0.09, 0.2), "steelDark", bev=0.01, seg=2)
        for i in range(2):
            for j in range(2):
                m.cyl((s * 0.25 + (i - 0.5) * 0.035, 0.07 + j * 0.04, 0.08), 0.013, 0.012, "black", n=8, axis="z")
        m.box((s * 0.2, 0.09, -0.02), (0.03, 0.03, 0.08), "dark", bev=0.003)
    m.cyl((-0.08, 0.165, -0.07), 0.05, 0.05, "armor", n=12, bev=0.004)
    m.cyl((-0.08, 0.195, -0.07), 0.045, 0.012, "steelDark", n=12)
    m.box((0.09, 0.16, 0.06), (0.05, 0.04, 0.06), "steelDark", bev=0.005)
    m.box((0.09, 0.16, 0.092), (0.04, 0.025, 0.004), "glass", bev=0)
    m.box((0, 0.07, -0.27), (0.26, 0.07, 0.06), "olive", bev=0.008)
    m.cyl((0.12, 0.27, -0.2), 0.004, 0.26, "black", n=4)
    return m


def build_heavy_gun():
    """The twin guns: origin at the trunnion (turret local (0, 0.09, 0.15)), barrels at x ±0.055 to +z."""
    m = Model("u.heavy_gun")
    m.box((0, 0, 0.03), (0.2, 0.06, 0.06), "armorDark", bev=0.01, seg=2)
    for s in (-1, 1):
        x = s * 0.055
        m.cyl((x, 0, 0.26), 0.021, 0.42, "dark", n=12, axis="z", r2=0.019)
        m.cyl((x, 0, 0.24), 0.03, 0.08, "dark", n=12, axis="z", bev=0.004)
        m.box((x, 0, 0.48), (0.044, 0.038, 0.05), "black", bev=0.006)
    return m


def build_harv():
    """SAUCE HAULER — the harvester in the RA2 'War Miner' mould: six big tyres, an armoured cab up front,
    a deep team-coloured hopper, the scoop arms out to the drum (harv_drum), exhaust stacks."""
    m = Model("u.harv")
    for s in (-1, 1):
        for z in (-0.32, -0.05, 0.22):
            x = s * 0.27
            m.push(x, 0.11, z, 0, 0, math.pi / 2)
            m.lathe([(0.06, -0.05), (0.095, -0.05), (0.11, -0.035), (0.112, 0.035), (0.095, 0.05), (0.06, 0.05)], "rubber", n=18)
            m.pop()
            for k in range(9):
                a = k / 9 * TAU
                m.box((x, 0.11 + math.sin(a) * 0.108, z + math.cos(a) * 0.108), (0.1, 0.014, 0.018), "rubber", bev=0)
            m.cyl((x + s * 0.045, 0.11, z), 0.06, 0.012, "steelDark", n=12, axis="x")
            m.cyl((x + s * 0.052, 0.11, z), 0.025, 0.012, "dark", n=8, axis="x")
        m.prism_x([(-0.46, 0.2), (-0.46, 0.235), (0.4, 0.235), (0.42, 0.2)], s * 0.2, s * 0.34, "armorDark", bev=0.006)
    m.box((0, 0.17, -0.04), (0.36, 0.08, 0.9), "dark", bev=0.01)
    # the cab
    m.prism_x([(0.16, 0.22), (0.16, 0.5), (0.3, 0.5), (0.42, 0.36), (0.44, 0.22)], -0.22, 0.22, "team", bev=0.012, seg=2)
    m.prism_x([(0.305, 0.48), (0.405, 0.365), (0.41, 0.37), (0.31, 0.485)], -0.19, 0.19, "glassLit", bev=0)
    for s in (-1, 1):
        m.box((s * 0.222, 0.42, 0.25), (0.006, 0.07, 0.1), "glass", bev=0)
        m.box((s * 0.17, 0.3, 0.43), (0.05, 0.03, 0.025), "steelDark", bev=0.003)
        m.box((s * 0.17, 0.3, 0.444), (0.035, 0.018, 0.005), "light", bev=0)
    m.box((0, 0.51, 0.23), (0.4, 0.02, 0.12), "teamDark", bev=0.004)
    m.box((0.12, 0.53, 0.22), (0.04, 0.02, 0.03), "light", bev=0)
    # the hopper (team) — the load part sits in it (alertUI: (0, 0.36+, -0.2))
    m.prism_x([(-0.44, 0.22), (-0.47, 0.47), (0.1, 0.47), (0.1, 0.22)], -0.26, 0.26, "armor", bev=0.014, seg=2)
    m.box((0, 0.42, -0.18), (0.535, 0.04, 0.5), "team", bev=0.004)
    m.box((0, 0.462, -0.18), (0.44, 0.02, 0.48), "black", bev=0)
    for k in range(4):
        m.box((0.262, 0.32, -0.38 + k * 0.14), (0.008, 0.16, 0.02), "armorDark", bev=0)
        m.box((-0.262, 0.32, -0.38 + k * 0.14), (0.008, 0.16, 0.02), "armorDark", bev=0)
    m.box((0, 0.48, 0.1), (0.54, 0.03, 0.03), "steelDark", bev=0.004)
    # the scoop arms out to the drum at (0, 0.12, 0.52)
    for s in (-1, 1):
        m.bar((s * 0.24, 0.24, 0.3), (s * 0.25, 0.13, 0.52), 0.035, "steelDark")
        m.cyl((s * 0.25, 0.12, 0.52), 0.04, 0.03, "dark", n=10, axis="x")
    m.box((0, 0.21, 0.47), (0.4, 0.02, 0.1), "steel", bev=0.004)
    # stacks, a ladder, a beacon
    m.cyl((-0.17, 0.62, 0.12), 0.022, 0.24, "dark", n=8)
    m.cyl((-0.17, 0.745, 0.12), 0.026, 0.012, "black", n=8)
    m.ladder(0.27, 0.0, 0.2, 0.46, "x", w=0.05)
    m.cyl((0.0, 0.53, 0.3), 0.02, 0.03, "hazard", n=8)
    return m


def build_harv_drum():
    """The cutter drum: origin on its axle (x), with spiral teeth."""
    m = Model("u.harv_drum")
    m.cyl((0, 0, 0), 0.085, 0.46, "steel", n=14, axis="x", bev=0.004)
    for s in (-1, 1):
        m.cyl((s * 0.225, 0, 0), 0.095, 0.015, "dark", n=14, axis="x")
    for k in range(18):
        a = k / 18 * TAU * 2
        x = -0.2 + k / 17 * 0.4
        m.push(x, math.sin(a) * 0.09, math.cos(a) * 0.09, 0, -a)
        m.prism_x([(-0.02, 0.0), (0.02, 0.0), (0.0, 0.035)], -0.01, 0.01, "steelDark", bev=0)
        m.pop()
    return m


def build_harv_load():
    """A heap of sauce ore: lumpy golden chunks (alertUI scales it in y with the cargo)."""
    m = Model("u.harv_load")
    rnd = random.Random(9)
    for i in range(14):
        x, z = rnd.uniform(-0.17, 0.17), rnd.uniform(-0.18, 0.18)
        r = rnd.uniform(0.05, 0.08)
        nugget(m, (x, rnd.uniform(-0.01, 0.04), z), (r, r * 0.75, r), seed=i, mat="gold" if i % 3 else "goldDark", lumps=False, n=8, v=5)
    return m


def build_inf(kind):
    """A nugget trooper: a lumpy breaded body, a team helmet + vest, a backpack, arms on the weapon.
    Origin on the ground; legs are separate (u.leg at hips ±0.045, y 0.13)."""
    m = Model("u." + ("inf" if kind == "rifle" else "rocket"), smooth_deg=50)
    nugget(m, (0, 0.25, 0), (0.1, 0.125, 0.088), seed=2 if kind == "rifle" else 4, lumps=True, n=14, v=9)
    m.box((0, 0.23, 0.005), (0.2, 0.09, 0.17), "olive", bev=0.03, seg=2)
    m.box((0, 0.23, 0.092), (0.08, 0.05, 0.012), "team", bev=0.005)
    m.box((0.1, 0.27, 0.0), (0.012, 0.04, 0.05), "team", bev=0.003)
    m.box((-0.1, 0.27, 0.0), (0.012, 0.04, 0.05), "team", bev=0.003)
    m.box((0, 0.27, -0.1), (0.13, 0.12, 0.06), "olive", bev=0.018, seg=2)
    m.lathe([(0.0, 0.335), (0.072, 0.335), (0.074, 0.348), (0.066, 0.385), (0.042, 0.41), (0.0, 0.416)], "teamDark", c=(0, 0.0, -0.005), n=14)
    m.lathe([(0.064, 0.33), (0.086, 0.334), (0.086, 0.341), (0.0, 0.341)], "teamDark", c=(0, 0, -0.005), n=14)
    m.box((0.03, 0.31, 0.083), (0.016, 0.014, 0.008), "black", bev=0)
    m.box((-0.03, 0.31, 0.083), (0.016, 0.014, 0.008), "black", bev=0)
    m.bar((0.09, 0.27, 0.0), (0.06, 0.24, 0.12), 0.04, "breading")
    m.bar((-0.09, 0.27, 0.0), (-0.02, 0.23, 0.13), 0.04, "breading")
    if kind == "rifle":
        m.box((0.02, 0.245, 0.13), (0.02, 0.03, 0.2), "black", bev=0.004)
        m.box((0.02, 0.24, 0.035), (0.022, 0.04, 0.05), "wood", bev=0.006)
        m.box((0.02, 0.215, 0.12), (0.014, 0.03, 0.02), "black", bev=0)
        m.cyl((0.02, 0.25, 0.27), 0.006, 0.08, "black", n=6, axis="z")
    else:
        m.cyl((0.075, 0.36, 0.0), 0.034, 0.42, "olive", n=12, axis="z", bev=0.004)
        m.cyl((0.075, 0.36, 0.215), 0.04, 0.02, "dark", n=12, axis="z")
        m.cyl((0.075, 0.36, -0.215), 0.04, 0.02, "dark", n=12, axis="z")
        m.ball((0.075, 0.36, 0.235), 0.026, "sauce", u=10, v=6)
        m.box((0.075, 0.395, 0.04), (0.02, 0.03, 0.03), "black", bev=0.003)
    return m


def build_leg():
    """A leg: origin at the hip, the boot down at y -0.12."""
    m = Model("u.leg", smooth_deg=50)
    m.cyl((0, -0.055, 0), 0.026, 0.11, "olive", n=10, r2=0.024)
    m.box((0, -0.122, 0.012), (0.05, 0.026, 0.075), "black", bev=0.01, seg=2)
    return m


# =========================================================================================================
# THE LANDSCAPE: trees (t.0-2 broadleaf, t.3-5 pine), rocks (r.0-3), shrubs (s.0-3), ore (o.0-8 = 3 levels × 3)
# =========================================================================================================
def _branchy_trunk(m, rnd, h, r0, lean):
    """A trunk that bends a little, flares at the root, and forks into 3-4 limbs; returns limb tips."""
    pts = [Vector((0, 0, 0))]
    for k in range(1, 5):
        t = k / 4
        pts.append(Vector((lean[0] * t * t + rnd.uniform(-0.01, 0.01), h * t, lean[1] * t * t + rnd.uniform(-0.01, 0.01))))
    rings = []
    for i, p in enumerate(pts):
        rr = r0 * (1.0 - 0.45 * i / 4)
        rings.append([(p.x + math.cos(j / 9 * TAU) * rr * (1.35 if i == 0 else 1), p.y, p.z + math.sin(j / 9 * TAU) * rr * (1.35 if i == 0 else 1)) for j in range(9)])
    m.loft(rings, "bark")
    tips = []
    top = pts[-1]
    nl = rnd.choice((3, 4))
    for k in range(nl):
        a = k / nl * TAU + rnd.uniform(-0.4, 0.4)
        d = rnd.uniform(0.14, 0.24)
        tip = top + Vector((math.cos(a) * d, rnd.uniform(0.12, 0.25), math.sin(a) * d))
        mid = top + (tip - top) * 0.5 + Vector((0, 0.03, 0))
        m.tube([tuple(top - Vector((0, 0.05, 0))), tuple(mid), tuple(tip)], r0 * 0.38, "barkDark", n=6)
        tips.append(tip)
    return top, tips


def build_broadleaf(i):
    """An oak/maple-ish tree: a short forked trunk under a broad, dense crown of many small leaf clumps
    (a lollipop is one big ball on a stick; a tree is a cloud of clumps that starts low and hangs)."""
    m = Model("t.%d" % i, smooth_deg=70)
    rnd = random.Random(100 + i)
    h = (0.3, 0.36, 0.27)[i]
    top, tips = _branchy_trunk(m, rnd, h, 0.055, (rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05)))
    leaves = ["leafA", "leafC", "leafB", "leafA", "leafC"]
    crown_c = top + Vector((0, 0.3, 0))
    W, Hc = (0.3, 0.33, 0.27)[i], (0.25, 0.28, 0.23)[i]
    k = 0
    for t in tips:     # a clump on every limb tip
        m.rock(tuple(t + Vector((0, 0.04, 0))), rnd.uniform(0.1, 0.13), "leafC", sub=2, s=(1, 0.8, 1), amp=0.3, freq=3.2, seed=i * 29 + k)
        k += 1
    for j in range(rnd.randint(20, 24)):
        # sample an ellipsoid shell, flattened underneath, so the crown is a full canopy
        a = rnd.uniform(0, TAU)
        e = rnd.uniform(-0.55, 1.0)
        rr = math.sqrt(max(0.0, 1 - e * e)) * rnd.uniform(0.75, 1.0)
        c = crown_c + Vector((math.cos(a) * rr * W, e * Hc, math.sin(a) * rr * W))
        mat = "leafB" if e > 0.55 else ("leafC" if e < -0.2 else leaves[(j + i) % 5])
        m.rock(tuple(c), rnd.uniform(0.09, 0.125), mat, sub=2, s=(1.0, 0.82, 1.0), amp=0.32, freq=3.4, seed=i * 31 + j + 7)
    return m


def build_pine(i):
    """A pine: a straight trunk and 6-8 tiers of drooping, ragged boughs, narrowing to a spire."""
    m = Model("t.%d" % (3 + i), smooth_deg=55)
    rnd = random.Random(200 + i)
    H = (1.25, 1.4, 1.1)[i]
    m.cyl((0, H * 0.3, 0), 0.04, H * 0.6, "bark", n=8, r2=0.025)
    m.lathe([(0.075, 0.0), (0.05, 0.05), (0.0, 0.05)], "barkDark", n=8)
    tiers = (7, 8, 6)[i]
    for k in range(tiers):
        t = k / (tiers - 1)
        y = 0.22 + t * (H - 0.38)
        R = (0.36 - 0.27 * t) * rnd.uniform(0.9, 1.08)
        n = 14
        edge = []
        for j in range(n):
            a = j / n * TAU + k * 0.37
            jag = 1.0 + (0.22 if j % 2 == 0 else -0.06) + rnd.uniform(-0.08, 0.08)
            droop = rnd.uniform(0.0, 0.05)
            edge.append((math.cos(a) * R * jag, y - 0.06 - droop - R * 0.18, math.sin(a) * R * jag))
        apex = [(0.0, y + 0.16 + R * 0.25, 0.0)] * n
        mid = [(e[0] * 0.55, y + 0.05, e[2] * 0.55) for e in edge]
        under = [(e[0] * 0.35, y - 0.04, e[2] * 0.35) for e in edge]
        m.loft([apex, mid, edge, under, [(0.0, y - 0.02, 0.0)] * n], "pineA" if k % 2 == 0 else "pineB", cap0=False, cap1=False)
    m.cyl((0, H + 0.04, 0), 0.03, 0.14, "pineB", n=6, r2=0.0)
    return m


def build_shrub(i):
    """A low bush: 4-6 leaf clumps hugging the ground."""
    m = Model("s.%d" % i, smooth_deg=70)
    rnd = random.Random(300 + i)
    for k in range(rnd.randint(4, 6)):
        a = rnd.uniform(0, TAU)
        d = rnd.uniform(0.0, 0.1)
        r = rnd.uniform(0.06, 0.11)
        m.rock((math.cos(a) * d, r * 0.55, math.sin(a) * d), r, ("leafB", "leafA", "leafD", "leafC")[(k + i) % 4], sub=2, s=(1.0, 0.72, 1.0), amp=0.35, freq=3.0, seed=50 + i * 7 + k)
    return m


def build_rocks(i):
    """A boulder group: one big weathered stone half-sunk, two or three smaller ones leaning on it."""
    m = Model("r.%d" % i, smooth_deg=48)
    rnd = random.Random(400 + i)
    big = rnd.uniform(0.16, 0.22)
    m.rock((0, big * 0.35, 0), big, ("rockA", "rockC")[i % 2], sub=3, s=(1.15, 0.7, 0.95), amp=0.24, freq=1.8, seed=i * 3.3, flat_below=-0.45)
    for k in range(rnd.randint(2, 3)):
        a = rnd.uniform(0, TAU)
        d = big * rnd.uniform(0.9, 1.4)
        r = big * rnd.uniform(0.35, 0.6)
        m.rock((math.cos(a) * d, r * 0.3, math.sin(a) * d), r, ("rockB", "rockA", "rockC")[k % 3], sub=2, s=(1.1, 0.75, 1.0), amp=0.3, freq=2.4, seed=i * 5 + k + 1, flat_below=-0.4)
    return m


def build_ore(level, v):
    """Sauce ore: heaps of gold lumps half-buried in stained earth — 1-3 heaps a tile, bigger with
    density — plus a crystal outcrop on the richest tiles."""
    m = Model("o.%d" % (level * 3 + v), smooth_deg=55)
    rnd = random.Random(500 + level * 10 + v)
    heaps = (1, 2, 3)[level]
    for hp in range(heaps):
        cx, cz = rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25)
        R = (0.1, 0.13, 0.16)[level] * rnd.uniform(0.8, 1.15)
        for k in range(rnd.randint(5, 8) + level * 2):
            a = rnd.uniform(0, TAU)
            d = R * math.sqrt(rnd.random())
            r = rnd.uniform(0.03, 0.05) + level * 0.008
            y = r * (0.2 + 0.9 * (1 - d / R)) * (0.6 + level * 0.25)
            m.rock((cx + math.cos(a) * d, y, cz + math.sin(a) * d), r, ("ore", "oreDark", "ore", "oreLite")[rnd.randrange(4)], sub=1, s=(1.0, 0.7, 1.0), amp=0.38, freq=2.5, seed=level * 40 + v * 13 + hp * 5 + k, flat_below=-0.35)
    if level == 2:
        cx, cz = rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2)
        for j in range(4):
            h = rnd.uniform(0.08, 0.14)
            m.push(cx + rnd.uniform(-0.025, 0.025), 0, cz + rnd.uniform(-0.025, 0.025), rnd.uniform(0, TAU), rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4))
            m.cyl((0, h * 0.4, 0), 0.02, h * 0.8, "gem", n=6)
            m.cyl((0, h * 0.8 + 0.025, 0), 0.02, 0.05, "gem", n=6, r2=0.0)
            m.pop()
    return m


LANDSCAPE = [lambda i=i: build_broadleaf(i) for i in range(3)] + [lambda i=i: build_pine(i) for i in range(3)] + \
            [lambda i=i: build_shrub(i) for i in range(4)] + [lambda i=i: build_rocks(i) for i in range(4)] + \
            [lambda l=l, v=v: build_ore(l, v) for l in range(3) for v in range(3)]

# =========================================================================================================
# PHASE 1 (two armies + air): the 33 models the PHASE-1 session built procedurally (js/alertArtP1.js) and
# handed off (AGENTS.md "HANDOFF ... Blender pass on Nugget Alert's PHASE-1 models"). Same names, same
# footprints, same pivots (ALR_RIG in js/alertUI.js). Alliance kit is pale grey-blue paint, Federation kit
# is olive drab; team colour is the markings.
# =========================================================================================================
def wheel(m, x, y, z, r, w, rim="steelDark"):
    """A road wheel on an axle along x: a rounded tyre with tread blocks, a rim, a hub."""
    sg = 1 if x >= 0 else -1
    m.push(x, y, z, 0, 0, math.pi / 2)
    m.lathe([(r * 0.62, -w / 2), (r * 0.9, -w / 2), (r, -w * 0.32), (r, w * 0.32), (r * 0.9, w / 2), (r * 0.62, w / 2)], "rubber", n=16, ring=True)
    m.pop()
    for k in range(10):
        a = k / 10 * TAU
        m.box((x, y + math.sin(a) * r * 0.98, z + math.cos(a) * r * 0.98), (w * 0.86, r * 0.16, r * 0.2), "rubber", bev=0)
    m.cyl((x + sg * w * 0.32, y, z), r * 0.62, w * 0.3, rim, n=12, axis="x", bev=0.003)
    m.cyl((x + sg * w * 0.48, y, z), r * 0.22, w * 0.12, "dark", n=8, axis="x")


def crystal(m, c, r, up, down, n=6, mat="crystal"):
    """A cut crystal: a crown band and two pyramids."""
    x, y, z = c
    m.lathe([(0.0, y - down), (r, y), (r * 0.82, y + up * 0.28), (0.0, y + up)], mat, c=(x, 0, z), n=n)


def nug_body(m, seed, lumps=True):
    nugget(m, (0, 0.25, 0), (0.1, 0.125, 0.088), seed=seed, lumps=lumps, n=14, v=9)


def eyes(m, y=0.31):
    m.box((0.03, y, 0.083), (0.016, 0.014, 0.008), "black", bev=0)
    m.box((-0.03, y, 0.083), (0.016, 0.014, 0.008), "black", bev=0)


def small_pad(m, mat="padDark"):
    """A 1×1 emplacement's apron: sloped poured concrete."""
    m.prism_y([(-0.47, -0.47), (0.47, -0.47), (0.47, 0.47), (-0.47, 0.47)], 0.0, 0.08, mat, bev=0.004, top=0.95)


# ---- buildings ------------------------------------------------------------------------------------------
def build_powerF():
    """⚛️ FRYER REACTOR (Federation power), 3×2: a riveted reactor drum on an octagonal plinth, a glowing
    core ring, the big discharge coil on top, a control shed, an insulator yard."""
    m = Model("b.powerF")
    foundation(m, 3, 2)
    cx, cz = -0.48, -0.02
    m.lathe([(0.0, 0.1), (0.84, 0.1), (0.8, 0.22), (0.7, 0.26), (0.0, 0.26)], "concDark", c=(cx, 0, cz), n=8, bev=0.01)
    m.lathe([(0.0, 0.26), (0.64, 0.26), (0.64, 0.74), (0.58, 0.8), (0.5, 0.86), (0.0, 0.86)], "rust", c=(cx, 0, cz), n=24)
    for y in (0.34, 0.66):
        m.torus((cx, y, cz), 0.645, 0.018, "steelDark", n=24, m=6)
    m.lathe([(0.652, 0.47), (0.652, 0.53), (0.63, 0.53), (0.63, 0.47)], "bandTeam", c=(cx, 0, cz), n=24, ring=True)
    for k in range(10):           # ribs + glowing core ports between them
        a = k / 10 * TAU
        m.box((cx + math.cos(a) * 0.655, 0.5, cz + math.sin(a) * 0.655), (0.05, 0.46, 0.05), "steelDark", bev=0.008)
        b2 = a + TAU / 20
        m.push(cx + math.cos(b2) * 0.645, 0.6, cz + math.sin(b2) * 0.645, math.atan2(math.cos(b2), math.sin(b2)))
        m.box((0, 0, 0), (0.1, 0.07, 0.02), "black", bev=0)
        m.box((0, 0, 0.008), (0.08, 0.05, 0.01), "light", bev=0)
        m.pop()
    # the core well + the coil
    m.lathe([(0.0, 0.86), (0.36, 0.86), (0.36, 0.9), (0.0, 0.9)], "dark", c=(cx, 0, cz), n=20)
    m.lathe([(0.0, 0.9), (0.24, 0.9), (0.0, 0.905)], "glassLit", c=(cx, 0, cz), n=20)
    m.cyl((cx, 1.2, cz), 0.09, 0.62, "steel", n=12, r2=0.06)
    for k in range(6):
        y = 1.0 + k * 0.085
        m.torus((cx, y, cz), 0.2 - k * 0.02, 0.022, "copper", n=20, m=6)
    m.torus((cx, 1.5, cz), 0.13, 0.016, "steelDark", n=16, m=6)
    m.ball((cx, 1.62, cz), 0.12, "steel", u=18, v=10)
    m.torus((cx, 1.62, cz), 0.135, 0.01, "copper", n=18, m=5)
    for k in range(3):
        a = 0.9 + k * 2.09
        ix, iz = cx + math.cos(a) * 0.42, cz + math.sin(a) * 0.42
        m.cyl((ix, 0.89, iz), 0.03, 0.05, "dark", n=8)
        for d in range(4):
            m.cyl((ix, 0.93 + d * 0.025, iz), 0.028, 0.012, "white", n=10)
    # the control shed (back right)
    top = wall_block(m, (0.92, 0.1, -0.4), (0.9, 0.38, 0.8), band=0.8)
    m.windows((0.52, 0.0), (1.32, 0.0), 0.3, 4, 0.1, 0.07, "z", lit=1)
    m.box((1.375, 0.22, -0.4), (0.012, 0.22, 0.14), "steelDark", bev=0)
    m.fan_unit((0.75, top + 0.02, -0.5), 0.1)
    m.vent((1.12, top + 0.02, -0.55), 0.03, 0.08)
    # the insulator yard (front right) behind a fence
    for x in (0.66, 1.18):
        m.cyl((x, 0.14, 0.55), 0.06, 0.08, "concDark", n=8)
        m.cyl((x, 0.36, 0.55), 0.018, 0.4, "steelDark", n=6)
        for d in range(6):
            m.cyl((x, 0.22 + d * 0.06, 0.55), 0.06 if d % 2 == 0 else 0.045, 0.022, "white", n=12)
        m.cyl((x, 0.6, 0.55), 0.05, 0.03, "copper", n=10)
    m.box((0.92, 0.2, 0.55), (0.24, 0.2, 0.2), "steelDark", bev=0.008)
    for j in range(6):
        m.box((0.79, 0.2, 0.47 + j * 0.032), (0.03, 0.16, 0.006), "dark", bev=0)
    m.bar((0.66, 0.61, 0.55), (1.18, 0.61, 0.55), 0.008, "copper")
    m.tube([(0.66, 0.61, 0.55), (0.2, 0.86, 0.3), (cx + 0.3, 0.9, 0.2)], 0.007, "black", n=5)
    m.railing([(0.42, 0.1, 0.22), (1.42, 0.1, 0.22), (1.42, 0.1, 0.9), (0.42, 0.1, 0.9)], 0.1, post=0.01, step=0.1, closed=True)
    # coolant mains from the drum to the shed
    m.tube([(cx + 0.62, 0.36, -0.3), (0.47, 0.36, -0.3)], 0.045, "steel", n=10)
    m.tube([(cx + 0.62, 0.52, -0.55), (0.47, 0.52, -0.55)], 0.04, "sauce", n=10)
    for x in (0.3, 0.42):
        m.cyl((x, 0.36, -0.3), 0.058, 0.02, "steelDark", n=10, axis="x")
    return m


def landing_pad(m, x, z):
    """A helipad-style landing pad: octagonal slab (top y 0.12), a painted ring and a team centre disc."""
    m.lathe([(0.0, 0.1), (0.48, 0.1), (0.47, 0.12), (0.0, 0.12)], "pad", c=(x, 0, z), n=8)
    m.lathe([(0.39, 0.1205), (0.36, 0.1205), (0.36, 0.1215), (0.39, 0.1215)], "white", c=(x, 0, z), n=24, ring=True)
    m.lathe([(0.0, 0.121), (0.1, 0.121), (0.0, 0.1215)], "team", c=(x, 0, z), n=16)
    for k in range(8):
        a = k / 8 * TAU + TAU / 16
        m.box((x + math.cos(a) * 0.44, 0.128, z + math.sin(a) * 0.44), (0.026, 0.014, 0.026), "light" if k % 2 else "red", bev=0)


def build_airhq():
    """✈️ AIR NUG COMMAND, 3×3: four landing pads at (±0.95, ±0.95) kept clear, a control block with a
    glass cab and a white radome, a hangar between the left pads, a fuel farm between the right ones."""
    m = Model("b.airhq")
    foundation(m, 3, 3)
    for x, z in ((-0.95, -0.95), (0.95, -0.95), (-0.95, 0.95), (0.95, 0.95)):
        landing_pad(m, x, z)
    # the control block
    top = wall_block(m, (0, 0.1, 0), (0.84, 0.36, 0.84), band=0.82)
    m.windows((-0.34, 0.425), (0.34, 0.425), 0.3, 4, 0.1, 0.08, "z", lit=0)
    m.windows((0.425, -0.34), (0.425, 0.34), 0.3, 4, 0.1, 0.08, "x", lit=2)
    m.box((0, 0.18, 0.43), (0.16, 0.16, 0.014), "steelDark", bev=0)
    m.box((0, 0.3, 0.48), (0.28, 0.014, 0.1), "steelDark", bev=0.004)
    # the glass control cab and the radome
    m.lathe([(0.0, top), (0.34, top), (0.34, top + 0.04), (0.0, top + 0.04)], "concDark", n=8)
    m.lathe([(0.0, top + 0.04), (0.31, top + 0.04), (0.36, top + 0.17), (0.0, top + 0.17)], "glassLit", n=8)
    for k in range(8):
        a = k / 8 * TAU + TAU / 16
        m.bar((math.cos(a) * 0.315, top + 0.045, math.sin(a) * 0.315), (math.cos(a) * 0.355, top + 0.165, math.sin(a) * 0.355), 0.014, "dark")
    m.lathe([(0.0, top + 0.17), (0.38, top + 0.17), (0.36, top + 0.21), (0.0, top + 0.21)], "steelDark", n=8)
    prof = [(math.cos(k / 8 * math.pi / 2) * 0.24, top + 0.22 + math.sin(k / 8 * math.pi / 2) * 0.24) for k in range(9)]
    m.lathe([(0.0, top + 0.21), (0.26, top + 0.21)] + prof, "white", n=20)
    m.lathe([(0.255, top + 0.215), (0.255, top + 0.245), (0.235, top + 0.245), (0.235, top + 0.215)], "team", n=20, ring=True)
    m.ball((0, top + 0.47, 0), 0.02, "red", u=8, v=5)
    m.cyl((0.3, top + 0.3, -0.3), 0.012, 0.55, "dark", n=6, r2=0.006)
    for k in range(3):
        m.box((0.3, top + 0.15 + k * 0.12, -0.3), (0.12 - k * 0.03, 0.008, 0.008), "steel", bev=0)
    # hangar (between the left pads) and fuel farm (between the right pads)
    m.box((-0.92, 0.115, 0), (0.98, 0.03, 0.42), "concDark", bev=0.004)
    n, r = 12, 0.19
    po = [(math.cos(k / n * math.pi) * r, math.sin(k / n * math.pi) * r) for k in range(n + 1)]
    pi_ = [(math.cos(k / n * math.pi) * (r - 0.015), math.sin(k / n * math.pi) * (r - 0.015)) for k in range(n, -1, -1)]
    m.prism_x([(a, 0.13 + b) for a, b in po + pi_], -1.36, -0.48, "roofDark", bev=0)
    m.prism_x([(a, 0.13 + b) for a, b in po], -0.485, -0.47, "steelDark", bev=0)
    m.box((-0.47, 0.2, 0), (0.008, 0.14, 0.2), "black", bev=0)
    for z in (-0.1, 0.1):
        m.cyl((0.92, 0.22, z), 0.085, 0.7, "white", n=16, axis="x", bev=0.01)
        m.cyl((0.92, 0.22, z), 0.087, 0.05, "team", n=16, axis="x")
        for x in (0.66, 1.18):
            m.box((x, 0.15, z), (0.03, 0.08, 0.13), "concDark", bev=0.004)
    m.tube([(0.57, 0.22, 0.0), (0.43, 0.22, 0.0)], 0.022, "sauce", n=8)
    # the taxi strip out front: painted centre-line dashes + edge lights
    for k in range(5):
        m.box((0, 0.102, 0.55 + k * 0.18), (0.03, 0.003, 0.1), "white", bev=0)
    for x in (-0.3, 0.3):
        for k in range(3):
            m.box((x, 0.11, 0.6 + k * 0.35), (0.03, 0.02, 0.03), "light", bev=0)
    return m


def build_depot():
    """🔧 DIP & FIX, 3×3: a raised steel service deck with ramps, two industrial robot arms, the back shop
    with its roller door, tyre stacks and fluid drums at the service bay."""
    m = Model("b.depot")
    foundation(m, 3, 3)
    top = wall_block(m, (0, 0.1, -1.12), (2.64, 0.46, 0.56), band=0.78)
    m.prism_z([(-1.33, top), (1.33, top), (1.3, top + 0.08), (-1.3, top + 0.08)], -1.4, -0.84, "roofDark", bev=0.004)
    m.windows((-1.1, -0.835), (-0.45, -0.835), 0.32, 3, 0.1, 0.08, "z", lit=0)
    m.windows((0.45, -0.835), (1.1, -0.835), 0.32, 3, 0.1, 0.08, "z", lit=1)
    m.box((0, 0.28, -0.83), (0.6, 0.34, 0.016), "steel", bev=0)
    for k in range(7):
        m.box((0, 0.13 + k * 0.045, -0.82), (0.58, 0.008, 0.006), "steelDark", bev=0)
    for x in (-0.9, 0.9):
        m.cyl((x, top + 0.12, -1.18), 0.06, 0.24, "steelDark", n=10)
    # the service deck
    pz = 0.15
    m.box((0, 0.15, pz), (1.48, 0.1, 1.24), "steelDark", bev=0.01)
    m.box((0, 0.203, pz), (1.36, 0.008, 1.12), "steel", bev=0)
    for k in range(-4, 5):
        m.box((k * 0.15, 0.209, pz), (0.01, 0.004, 1.1), "dark", bev=0)
    m.lathe([(0.0, 0.205), (0.22, 0.205), (0.0, 0.212)], "team", c=(0, 0, pz), n=16)
    for s in (-1, 1):
        m.prism_x([(pz + s * 0.62, 0.1), (pz + s * 0.62, 0.2), (pz + s * 0.9, 0.1)], -0.45, 0.45, "padDark", bev=0.004)
    # the robot arms
    for s in (-1, 1):
        bx, z = s * 1.12, pz
        m.box((bx, 0.16, z), (0.3, 0.12, 0.3), "steelDark", bev=0.02)
        m.cyl((bx, 0.27, z), 0.12, 0.1, "hazard", n=16, bev=0.008)
        sh, el, wr, tl = Vector((bx, 0.36, z)), Vector((s * 0.82, 0.92, z)), Vector((s * 0.34, 0.76, z)), Vector((s * 0.28, 0.56, z))
        m.box(tuple(sh), (0.12, 0.12, 0.16), "hazard", bev=0.02)
        m.bar(sh, el, 0.09, "hazard", bev=0.012)
        m.bar(el, wr, 0.07, "hazard", bev=0.01)
        m.cyl(tuple(el), 0.065, 0.14, "dark", n=12, axis="z")
        m.cyl(tuple(wr), 0.05, 0.11, "dark", n=12, axis="z")
        m.bar(wr, tl, 0.04, "steel")
        m.box(tuple(tl), (0.08, 0.06, 0.08), "dark", bev=0.01)
        m.cyl((tl.x, tl.y - 0.08, z), 0.01, 0.1, "steel", n=6)
        m.tube([(bx + s * 0.1, 0.24, z - 0.12), (bx + s * 0.1, 0.24, -0.84)], 0.018, "black", n=6)
        m.tube([tuple(sh + Vector((0, 0.05, 0.08))), tuple(el + Vector((0, -0.05, 0.08)))], 0.012, "black", n=5)
    # the service bay kit: tyres, drums
    for k in range(3):
        m.push(-1.2, 0.1 + k * 0.06 + 0.03, 1.2)
        m.torus((0, 0, 0), 0.08, 0.03, "rubber", n=14, m=6)
        m.pop()
    m.drum(1.22, 1.22, mat="sauce")
    m.drum(1.12, 1.26, mat="olive")
    m.drum(1.2, 1.12, mat="steel")
    return m


def build_labA():
    """🧪 TEST KITCHEN (Alliance lab), 3×3: a ribbed glass-and-panel dome, a white lab block with a glass
    curtain wall, a glass link tube, an antenna array."""
    m = Model("b.labA")
    foundation(m, 3, 3)
    dx, dz = -0.42, -0.38
    m.lathe([(0.0, 0.1), (0.92, 0.1), (0.9, 0.2), (0.88, 0.27), (0.0, 0.27)], "concDark", c=(dx, 0, dz), n=24, bev=0.008)
    m.lathe([(0.885, 0.2), (0.885, 0.26), (0.86, 0.26), (0.86, 0.2)], "bandTeam", c=(dx, 0, dz), n=24, ring=True)
    rows = 7
    for k in range(rows):
        a0, a1 = k / rows * math.pi / 2, (k + 1) / rows * math.pi / 2
        mat = ("white", "glass", "white", "glassLit", "white", "glass", "white")[k]
        m.lathe([(math.cos(a0) * 0.86, 0.27 + math.sin(a0) * 0.82), (math.cos(a1) * 0.86, 0.27 + math.sin(a1) * 0.82),
                 (math.cos(a1) * 0.84, 0.27 + math.sin(a1) * 0.8), (math.cos(a0) * 0.84, 0.27 + math.sin(a0) * 0.8)], mat, c=(dx, 0, dz), n=24, ring=True)
    for k in range(12):
        a = k / 12 * TAU
        pts = [(dx + math.cos(a) * math.cos(t) * 0.872, 0.27 + math.sin(t) * 0.83, dz + math.sin(a) * math.cos(t) * 0.872) for t in [j / 6 * 1.35 for j in range(7)]]
        m.tube(pts, 0.014, "steel", n=5)
    m.cyl((dx, 1.11, dz), 0.12, 0.06, "white", n=12, r2=0.1)
    m.cyl((dx, 1.32, dz), 0.012, 0.36, "dark", n=6)
    m.ball((dx, 1.32, dz), 0.04, "glassLit", u=10, v=6)
    # the lab block
    lx, lz = 0.78, 0.6
    top = wall_block(m, (lx, 0.1, lz), (1.2, 0.5, 1.2), mat="white", band=0.88)
    m.box((lx, 0.36, lz + 0.605), (1.04, 0.36, 0.012), "glass", bev=0)
    m.box((lx + 0.605, 0.36, lz), (0.012, 0.36, 1.04), "glass", bev=0)
    for k in range(7):
        m.box((lx - 0.51 + k * 0.17, 0.36, lz + 0.614), (0.016, 0.36, 0.01), "steel", bev=0)
        m.box((lx + 0.614, 0.36, lz - 0.51 + k * 0.17), (0.01, 0.36, 0.016), "steel", bev=0)
    for k in range(3):
        m.box((lx, 0.2 + k * 0.12, lz + 0.616), (1.04, 0.01, 0.01), "steel", bev=0)
        m.box((lx + 0.616, 0.2 + k * 0.12, lz), (0.01, 0.01, 1.04), "steel", bev=0)
    m.box((lx - 0.15, top + 0.03, lz + 0.1), (0.38, 0.03, 0.46), "glassLit", bev=0.006)
    m.fan_unit((lx + 0.3, top + 0.02, lz - 0.3), 0.1)
    for k in range(3):
        x, z, h = lx + 0.34 - k * 0.07, lz + 0.34 - k * 0.24, 0.42 - k * 0.1
        m.cyl((x, top + h / 2, z), 0.01, h, "dark", n=6)
        m.cyl((x, top + h - 0.08, z), 0.05, 0.012, "steel", n=10)
    # the glass link tube from the lab to the dome
    a, b = Vector((0.24, 0.32, 0.08)), Vector((-0.1, 0.32, -0.2))
    d = b - a
    m.push(*((a + b) / 2), math.atan2(d.x, d.z))
    m.cyl((0, 0, 0), 0.09, d.length + 0.1, "glass", n=12, axis="z")
    for t in (-0.18, 0.0, 0.18):
        m.cyl((0, 0, t), 0.1, 0.03, "steel", n=12, axis="z")
    m.pop()
    m.box((lx - 0.25, 0.2, lz + 0.62), (0.2, 0.2, 0.012), "steelDark", bev=0)
    m.box((lx - 0.25, 0.36, lz + 0.7), (0.32, 0.014, 0.18), "steel", bev=0.004)
    # the sample tank
    m.lathe([(0.0, 0.1), (0.18, 0.1), (0.18, 0.5), (0.1, 0.56), (0.0, 0.57)], "steel", c=(-1.1, 0, 1.05), n=16)
    m.lathe([(0.185, 0.2), (0.185, 0.42), (0.17, 0.42), (0.17, 0.2)], "glassLit", c=(-1.1, 0, 1.05), n=16, ring=True)
    m.tube([(-0.92, 0.3, 1.05), (-0.25, 0.3, 1.05)], 0.024, "steel", n=8)
    return m


def build_labF():
    """☢️ THE FRY LAB (Federation lab), 3×3: a stepped brutalist block with buttresses and slit windows,
    three tall stacks, a big dish on a tower, reagent tanks."""
    m = Model("b.labF")
    foundation(m, 3, 3)
    top = wall_block(m, (-0.2, 0.1, -0.25), (1.9, 0.62, 1.64), mat="concDark", band=0.72)
    t2 = wall_block(m, (-0.32, top, -0.42), (1.24, 0.24, 1.04), mat="conc", band=0, plinth=False)
    m.box((-0.32, t2 + 0.06, -0.42), (0.5, 0.08, 0.4), "steelDark", bev=0.008)
    for x in (-0.95, -0.45, 0.05, 0.55):
        m.prism_x([(0.57, 0.1), (0.72, 0.1), (0.57, 0.62)], x - 0.05, x + 0.05, "concDark", bev=0.006)
    for y in (0.3, 0.52):
        for x in (-0.7, -0.2, 0.3):
            m.box((x, y, 0.575), (0.32, 0.03, 0.012), "black", bev=0)
            m.box((x, y, 0.58), (0.28, 0.018, 0.008), "light" if y > 0.4 else "glassLit", bev=0)
    m.windows((0.755, -0.85), (0.755, 0.35), 0.45, 4, 0.16, 0.04, "x", lit=0, sill=False)
    m.box((-0.2, 0.22, 0.585), (0.4, 0.24, 0.02), "steelDark", bev=0.004)
    for k in range(4):
        m.box((-0.2, 0.13 + k * 0.06, 0.597), (0.38, 0.008, 0.004), "dark", bev=0)
    # the stacks
    for x, z, h in ((-0.95, -1.1, 1.85), (-0.55, -1.15, 1.65), (-0.15, -1.1, 1.75)):
        m.cyl((x, (0.1 + h) / 2, z), 0.17, h - 0.1, "concDark", n=14, r2=0.12)
        m.lathe([(0.138, h - 0.32), (0.132, h - 0.24), (0.118, h - 0.24), (0.124, h - 0.32)], "bandTeam", c=(x, 0, z), n=14, ring=True)
        m.lathe([(0.13, h - 0.06), (0.135, h), (0.1, h), (0.1, h - 0.06)], "dark", c=(x, 0, z), n=14, ring=True)
        m.lathe([(0.0, h - 0.02), (0.1, h - 0.02), (0.0, h - 0.019)], "black", c=(x, 0, z), n=14)
        m.ladder(x, z + 0.14, 0.1, h - 0.1, "z", w=0.04)
        m.box((x + 0.13, h - 0.12, z + 0.02), (0.03, 0.03, 0.03), "red", bev=0)
    # the dish tower (front right) + a fixed big dish
    tx, tz = 0.98, 0.68
    m.box((tx, 0.32, tz), (0.4, 0.44, 0.4), "concDark", bev=0.012)
    m.box((tx, 0.5, tz), (0.41, 0.04, 0.41), "bandTeam", bev=0.004)
    m.cyl((tx, 0.67, tz), 0.08, 0.26, "steelDark", n=10, r2=0.06)
    m.push(tx, 0.84, tz, -0.7, -0.6)
    m.box((0, 0, 0), (0.16, 0.1, 0.16), "dark", bev=0.01)
    R, f = 0.56, 0.3
    prof = [(R * k / 8, (R * k / 8) ** 2 / (4 * f)) for k in range(9)]
    m.push(0, 0.05, 0, 0, 0)
    m.lathe(prof + [(R + 0.01, prof[-1][1])] + [(r, y - 0.02) for r, y in reversed(prof)], "concLite", n=24)
    m.lathe([(R + 0.012, prof[-1][1] - 0.02), (R + 0.012, prof[-1][1] + 0.012), (R - 0.012, prof[-1][1] + 0.012), (R - 0.012, prof[-1][1] - 0.02)], "steelDark", n=24, ring=True)
    for k in range(4):
        a = k / 4 * TAU + 0.4
        m.bar((math.cos(a) * R * 0.9, prof[-2][1], math.sin(a) * R * 0.9), (0, 0.42, 0), 0.012, "dark")
    m.cyl((0, 0.44, 0), 0.035, 0.07, "steelDark", n=8)
    m.pop()
    m.pop()
    # the reagent tanks
    for x, z in ((1.12, -0.3), (1.12, -0.85)):
        m.lathe([(0.0, 0.1), (0.2, 0.1), (0.2, 0.6), (0.12, 0.66), (0.0, 0.67)], "armor", c=(x, 0, z), n=16)
        m.lathe([(0.205, 0.38), (0.205, 0.44), (0.19, 0.44), (0.19, 0.38)], "bandTeam", c=(x, 0, z), n=16, ring=True)
        m.tube([(x - 0.2, 0.45, z), (0.76, 0.45, z)], 0.035, "sauce", n=8)
    return m


def build_bunker():
    """🧱 NUG BUNKER, 1×1: a squat cast pillbox with a firing slit and an MG, sandbagged at the front."""
    m = Model("b.bunker")
    small_pad(m)
    m.prism_y([(-0.36, -0.34), (0.36, -0.34), (0.38, 0.3), (-0.38, 0.3)], 0.08, 0.3, "conc", bev=0.03, seg=2, top=0.86)
    m.prism_y([(-0.3, -0.29), (0.3, -0.29), (0.32, 0.25), (-0.32, 0.25)], 0.3, 0.34, "concDark", bev=0.012, top=0.9)
    m.box((0, 0.17, 0.0), (0.74, 0.04, 0.66), "bandTeam", bev=0.006)
    m.box((0, 0.24, 0.31), (0.48, 0.05, 0.03), "black", bev=0)
    m.box((0, 0.27, 0.31), (0.52, 0.012, 0.05), "concDark", bev=0)
    m.cyl((0.05, 0.24, 0.39), 0.022, 0.12, "dark", n=8, axis="z")
    m.cyl((0.05, 0.24, 0.47), 0.01, 0.08, "black", n=6, axis="z")
    m.box((-0.06, 0.37, -0.05), (0.14, 0.04, 0.14), "steelDark", bev=0.01)
    m.cyl((0.18, 0.38, -0.18), 0.008, 0.12, "dark", n=5)
    m.sandbags([(-0.4, 0, 0.45), (0.4, 0, 0.45)], rows=2, size=0.1)
    m.sandbags([(0.45, 0, 0.4), (0.45, 0, -0.2)], rows=1, size=0.1)
    return m


def build_sam():
    """🚀 SAUCE SAM base, 1×1: a sloped octagonal launch pit; the launcher is sam_head on top (y 0.3)."""
    m = Model("b.sam")
    small_pad(m)
    m.lathe([(0.0, 0.08), (0.4, 0.08), (0.34, 0.26), (0.28, 0.3), (0.0, 0.3)], "concDark", n=8, bev=0.012)
    m.lathe([(0.37, 0.16), (0.352, 0.21), (0.0, 0.21)], "bandTeam", n=8)
    m.box((0.3, 0.17, 0.12), (0.12, 0.12, 0.18), "steelDark", bev=0.01)
    m.box((0.36, 0.2, 0.12), (0.008, 0.05, 0.08), "glassLit", bev=0)
    m.crate((-0.32, 0.13, -0.32), 0.09, "olive")
    m.crate((-0.2, 0.13, -0.36), 0.08, "olive")
    return m


def build_sam_head():
    """The launcher: a turntable, a trunnion yoke, a 4-cell missile box raised ~35° toward +z."""
    m = Model("b.sam_head")
    m.cyl((0, 0.03, 0), 0.23, 0.06, "steelDark", n=16, r2=0.21, bev=0.006)
    m.box((0, 0.1, -0.04), (0.22, 0.08, 0.22), "dark", bev=0.02)
    for s in (-1, 1):
        m.prism_z([(s * 0.17, 0.06), (s * 0.21, 0.06), (s * 0.21, 0.26), (s * 0.17, 0.22)], -0.08, 0.1, "steel", bev=0.006)
    m.cyl((0, 0.18, 0), 0.025, 0.44, "dark", n=8, axis="x")
    m.push(0, 0.18, 0, 0, -0.61)
    m.box((0, 0, 0.0), (0.32, 0.24, 0.44), "armor", bev=0.018, seg=2)
    m.box((0, 0.122, -0.04), (0.28, 0.006, 0.3), "team", bev=0)
    for x in (-0.075, 0.075):
        for y in (-0.058, 0.058):
            m.cyl((x, y, 0.225), 0.052, 0.02, "dark", n=12, axis="z")
            m.cyl((x, y, 0.227), 0.04, 0.02, "black", n=12, axis="z")
            m.cyl((x, y, 0.24), 0.028, 0.06, "white", n=10, axis="z", r2=0.0)
    m.box((0.17, 0.06, 0.06), (0.04, 0.06, 0.12), "steelDark", bev=0.006)
    m.box((0.192, 0.06, 0.1), (0.006, 0.03, 0.04), "glassLit", bev=0)
    m.pop()
    return m


def build_prism():
    """💎 PRISM FRY TOWER, 1×1 (~1.57 tall): an octagonal base, a white tapering spire with four fins and
    glazed slots, a cradle of four arms, the crystal at y 1.36."""
    m = Model("b.prism")
    small_pad(m)
    m.lathe([(0.0, 0.08), (0.4, 0.08), (0.34, 0.22), (0.3, 0.26), (0.0, 0.26)], "concDark", n=8, bev=0.012)
    m.lathe([(0.33, 0.2), (0.31, 0.25), (0.0, 0.25)], "bandTeam", n=8)
    m.lathe([(0.0, 0.26), (0.28, 0.26), (0.2, 0.32), (0.0, 0.32)], "steel", n=8)
    for k in range(4):
        m.push(0, 0, 0, k * math.pi / 2 + math.pi / 4)
        m.prism_x([(0.12, 0.3), (0.29, 0.3), (0.11, 0.88)], -0.02, 0.02, "white", bev=0.006)
        m.pop()
    m.cyl((0, 0.72, 0), 0.16, 0.8, "white", n=8, r2=0.085, bev=0.006)
    for k in range(4):
        a = (k + 0.5) / 4 * TAU
        m.push(math.cos(a) * 0.125, 0.7, math.sin(a) * 0.125, math.atan2(math.cos(a), math.sin(a)), -0.09)
        m.box((0, 0, 0), (0.04, 0.5, 0.02), "glassLit", bev=0)
        m.pop()
    for y in (0.52, 0.86):
        rr = 0.15 - (y - 0.3) * 0.08
        m.lathe([(rr + 0.006, y), (rr + 0.006, y + 0.04), (rr - 0.01, y + 0.04), (rr - 0.01, y)], "team", n=8, ring=True)
    m.cyl((0, 1.145, 0), 0.1, 0.05, "steelDark", n=8, r2=0.14)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        m.bar((math.cos(a) * 0.12, 1.16, math.sin(a) * 0.12), (math.cos(a) * 0.23, 1.36, math.sin(a) * 0.23), 0.022, "steelDark")
        m.ball((math.cos(a) * 0.23, 1.37, math.sin(a) * 0.23), 0.02, "glassLit", u=8, v=5)
    crystal(m, (0, 1.36, 0), 0.2, 0.27, 0.2, n=6)
    return m


def build_flak():
    """💥 FLAK FRYER base, 1×1: a sandbag-ringed gun pit; the gun is flak_head on top (y 0.3)."""
    m = Model("b.flak")
    small_pad(m)
    m.lathe([(0.0, 0.08), (0.36, 0.08), (0.3, 0.26), (0.26, 0.3), (0.0, 0.3)], "concDark", n=10, bev=0.01)
    m.lathe([(0.34, 0.15), (0.325, 0.2), (0.0, 0.2)], "bandTeam", n=10)
    pts = [(math.cos(k / 14 * TAU) * 0.42, 0, math.sin(k / 14 * TAU) * 0.42) for k in range(15)]
    m.sandbags(pts[:11], rows=2, size=0.1)
    m.crate((-0.3, 0.33, -0.18), 0.07, "olive")
    return m


def build_flak_head():
    """The flak gun: a turntable, two side ammo drums, a raised quad autocannon behind a shield.
    Also mounted on the Flak Track at 0.6 scale."""
    m = Model("b.flak_head")
    m.cyl((0, 0.03, 0), 0.22, 0.06, "armorDark", n=14, r2=0.21, bev=0.006)
    m.box((0, 0.09, -0.06), (0.26, 0.08, 0.2), "armor", bev=0.016)
    for s in (-1, 1):
        m.cyl((s * 0.17, 0.14, -0.02), 0.07, 0.06, "armorDark", n=14, axis="x", bev=0.006)
        m.cyl((s * 0.2, 0.14, -0.02), 0.03, 0.02, "steelDark", n=10, axis="x")
    m.cyl((0, 0.14, 0), 0.032, 0.3, "dark", n=8, axis="x")
    m.push(0, 0.14, 0, 0, -0.8)
    m.box((0, 0, 0), (0.2, 0.15, 0.2), "armor", bev=0.016)
    m.box((0, 0.077, -0.02), (0.16, 0.006, 0.12), "team", bev=0)
    for x in (-0.045, 0.045):
        for y in (-0.032, 0.032):
            m.cyl((x, y, 0.15), 0.025, 0.06, "steelDark", n=8, axis="z")
            m.cyl((x, y, 0.25), 0.017, 0.2, "dark", n=8, axis="z")
            m.cyl((x, y, 0.36), 0.025, 0.05, "black", n=8, axis="z")
    m.pop()
    m.push(0, 0.14, 0.09, 0, -0.25)
    m.box((0, 0, 0), (0.34, 0.18, 0.024), "armor", bev=0.008)
    m.pop()
    return m


def build_wallA_post():
    """Alliance wall post: a precast concrete pier with a cap, centred in its tile."""
    m = Model("b.wallA_post")
    m.box((0, 0.02, 0), (0.42, 0.04, 0.42), "padDark", bev=0.01)
    m.box((0, 0.24, 0), (0.34, 0.42, 0.34), "conc", bev=0.02, seg=2)
    m.box((0, 0.3, 0), (0.352, 0.05, 0.352), "bandTeam", bev=0.004)
    m.box((0, 0.47, 0), (0.38, 0.04, 0.38), "concLite", bev=0.01)
    m.box((0, 0.5, 0), (0.22, 0.03, 0.22), "conc", bev=0.008)
    return m


def build_wallA_bar():
    """Alliance wall panel: x 0 -> +0.5; a precast slab with a coping and panel joints."""
    m = Model("b.wallA_bar")
    m.box((0.25, 0.02, 0), (0.5, 0.04, 0.3), "padDark", bev=0.006)
    m.box((0.25, 0.21, 0), (0.5, 0.36, 0.22), "conc", bev=0.012)
    m.box((0.25, 0.27, 0), (0.5, 0.04, 0.23), "bandTeam", bev=0)
    m.box((0.25, 0.405, 0), (0.5, 0.035, 0.26), "concLite", bev=0.008)
    for x in (0.17, 0.34):
        for s in (-1, 1):
            m.box((x, 0.19, s * 0.112), (0.008, 0.3, 0.004), "concDark", bev=0)
    return m


def build_wallF_post():
    """Federation wall post: a rough cast block with chipped capstones and rusted rebar."""
    m = Model("b.wallF_post")
    m.box((0, 0.02, 0), (0.46, 0.04, 0.46), "padDark", bev=0.01)
    m.box((0, 0.2, 0), (0.38, 0.36, 0.38), "concDark", bev=0.02, seg=2)
    m.box((0, 0.2, 0), (0.39, 0.05, 0.39), "bandTeam", bev=0)
    m.push(0.02, 0.42, -0.01, 0.15, 0.06, 0.05)
    m.box((0, 0, 0), (0.34, 0.1, 0.32), "conc", bev=0.03, seg=2)
    m.pop()
    for x, z, h, t in ((0.09, 0.08, 0.18, 0.2), (-0.08, -0.07, 0.14, -0.25), (0.07, -0.09, 0.12, 0.1)):
        m.push(x, 0.46, z, 0, t, t * 0.6)
        m.cyl((0, h / 2, 0), 0.008, h, "rust", n=5)
        m.pop()
    return m


def build_wallF_bar():
    """Federation wall section: x 0 -> +0.5; a cast wall topped with tumbled blocks and rebar."""
    m = Model("b.wallF_bar")
    m.box((0.25, 0.02, 0), (0.5, 0.04, 0.34), "padDark", bev=0.006)
    m.box((0.25, 0.17, 0), (0.52, 0.3, 0.3), "concDark", bev=0.014)
    m.box((0.25, 0.17, 0), (0.52, 0.04, 0.31), "bandTeam", bev=0)
    for x, dx, a, b2 in ((0.13, 0.26, 0.06, -0.03), (0.38, 0.24, -0.05, 0.04)):
        m.push(x, 0.36, 0, 0.06, a, b2)
        m.box((0, 0, 0), (dx, 0.1, 0.26), "conc", bev=0.025, seg=2)
        m.pop()
    for x, z, t in ((0.06, 0.06, 0.3), (0.26, -0.05, -0.2), (0.45, 0.05, 0.15)):
        m.push(x, 0.4, z, 0, t, -t * 0.5)
        m.cyl((0, 0.06, 0), 0.007, 0.12, "rust", n=5)
        m.pop()
    return m


def build_derrick():
    """🛢️ FRY OIL DERRICK (neutral), 2×2: a lattice drilling tower, two crude tanks, the pump jack base
    (its walking beam is derrick_pump at (-0.3, 0.44, 0.45)), a pipeline."""
    m = Model("b.derrick")
    foundation(m, 2, 2)
    X, Z = -0.45, -0.42
    m.box((X, 0.13, Z), (0.62, 0.06, 0.62), "concDark", bev=0.01)
    m.lattice((X, 0.16, Z), (X, 1.42, Z), 0.24, 0.06, "rust", bays=6, w=0.016)
    m.box((X, 1.45, Z), (0.2, 0.05, 0.2), "steelDark", bev=0.008)
    m.cyl((X, 1.51, Z), 0.04, 0.08, "steel", n=8)
    m.box((X, 0.82, Z), (0.5, 0.02, 0.5), "steelDark", bev=0)
    m.cyl((X, 0.76, Z), 0.006, 1.2, "black", n=4)
    m.ball((X, 1.56, Z), 0.025, "red", u=8, v=5)
    for x, z, r, h in ((0.5, -0.45, 0.3, 0.68), (0.55, 0.38, 0.24, 0.55)):
        m.lathe([(0.0, 0.1), (r, 0.1), (r, h), (r * 0.9, h + 0.04), (0.0, h + 0.06)], "rust", c=(x, 0, z), n=20)
        for y in (0.25, 0.45):
            m.torus((x, y, z), r + 0.004, 0.007, "steelDark", n=20, m=4)
        m.lathe([(r + 0.006, h - 0.16), (r + 0.006, h - 0.1), (r - 0.01, h - 0.1), (r - 0.01, h - 0.16)], "bandTeam", c=(x, 0, z), n=20, ring=True)
        m.ladder(x, z + r, 0.1, h, "z", w=0.04)
    m.tube([(0.5, 0.3, -0.15), (0.55, 0.3, 0.14)], 0.03, "steelDark", n=8)
    px, pz = -0.3, 0.45
    m.box((px, 0.13, pz - 0.05), (0.24, 0.05, 0.7), "steelDark", bev=0.008)
    for s in (-1, 1):
        m.bar((px + s * 0.08, 0.15, pz - 0.15), (px + s * 0.03, 0.44, pz), 0.03, "hazard")
        m.bar((px + s * 0.08, 0.15, pz + 0.12), (px + s * 0.03, 0.44, pz), 0.03, "hazard")
    m.cyl((px, 0.44, pz), 0.025, 0.1, "dark", n=8, axis="x")
    m.box((px, 0.22, pz - 0.3), (0.16, 0.14, 0.14), "steel", bev=0.012)
    m.cyl((px, 0.22, pz - 0.3), 0.03, 0.2, "dark", n=8, axis="x")
    m.cyl((px, 0.14, pz + 0.37), 0.05, 0.08, "steel", n=8, r2=0.04)
    m.cyl((px, 0.2, pz + 0.37), 0.06, 0.04, "sauce", n=10)
    m.tube([(px + 0.05, 0.16, pz + 0.37), (0.35, 0.16, pz + 0.37), (0.35, 0.16, 0.6)], 0.025, "dark", n=6)
    return m


def build_derrick_pump():
    """The pump jack's walking beam: pivot at the bearing, rocks about x; horse head +z, weight -z."""
    m = Model("b.derrick_pump")
    m.box((0, 0, 0), (0.08, 0.07, 0.08), "dark", bev=0.01)
    m.box((0, 0.045, 0.02), (0.056, 0.06, 0.66), "hazard", bev=0.01)
    m.prism_x([(0.33, 0.1), (0.42, 0.06), (0.44, -0.04), (0.4, -0.1), (0.34, -0.04), (0.34, 0.02)], -0.04, 0.04, "hazard", bev=0.006)
    m.cyl((0, -0.17, 0.42), 0.004, 0.26, "black", n=4)
    m.box((0, -0.3, 0.42), (0.03, 0.025, 0.03), "steel", bev=0.003)
    m.box((0, 0.04, -0.3), (0.1, 0.1, 0.08), "steelDark", bev=0.012)
    for s in (-1, 1):
        m.box((s * 0.05, -0.1, -0.3), (0.016, 0.22, 0.024), "steel", bev=0.003)
    return m


# ---- units ----------------------------------------------------------------------------------------------
def build_engineer():
    """🔧 FRY COOK: a hard hat, team overalls with a bib, a toolbox and a spatula. Legs are u.leg."""
    m = Model("u.engineer", smooth_deg=50)
    nug_body(m, 6)
    m.box((0, 0.2, 0.0), (0.21, 0.14, 0.18), "teamDark", bev=0.03, seg=2)
    m.box((0, 0.27, 0.085), (0.11, 0.08, 0.016), "teamDark", bev=0.004)
    for s in (-1, 1):
        m.box((s * 0.05, 0.3, 0.0), (0.024, 0.024, 0.2), "teamDark", bev=0.004)
    m.lathe([(0.0, 0.34), (0.08, 0.34), (0.082, 0.36), (0.072, 0.4), (0.04, 0.425), (0.0, 0.43)], "hazard", n=14)
    m.lathe([(0.075, 0.338), (0.105, 0.338), (0.105, 0.348), (0.0, 0.348)], "hazard", n=14)
    m.box((0, 0.43, 0), (0.024, 0.016, 0.15), "goldDark", bev=0)
    eyes(m, 0.31)
    m.bar((0.1, 0.27, 0.0), (0.12, 0.2, 0.07), 0.04, "breading")
    m.bar((-0.1, 0.27, 0.0), (-0.12, 0.17, 0.0), 0.04, "breading")
    m.box((-0.13, 0.12, 0.0), (0.06, 0.07, 0.13), "sauce", bev=0.008)
    m.box((-0.13, 0.162, 0.0), (0.012, 0.016, 0.06), "dark", bev=0)
    m.push(0.12, 0.2, 0.08, 0, -0.9)
    m.box((0, 0, 0.02), (0.016, 0.016, 0.1), "wood", bev=0.003)
    m.box((0, 0, 0.1), (0.06, 0.008, 0.07), "steel", bev=0.002)
    m.pop()
    return m


def build_jetpack():
    """🚀 JETPACK NUG: flight helmet with goggles, a twin-tank jet pack (nozzles at (±0.055, ~0.2, -0.15))."""
    m = Model("u.jetpack", smooth_deg=50)
    nug_body(m, 8)
    m.box((0, 0.23, 0.005), (0.2, 0.09, 0.17), "olive", bev=0.03, seg=2)
    m.box((0, 0.23, 0.092), (0.08, 0.05, 0.012), "team", bev=0.004)
    m.lathe([(0.0, 0.335), (0.074, 0.335), (0.076, 0.35), (0.066, 0.39), (0.0, 0.415)], "teamDark", c=(0, 0, -0.005), n=14)
    m.box((0, 0.35, 0.068), (0.13, 0.026, 0.03), "dark", bev=0.006)
    for s in (-1, 1):
        m.cyl((s * 0.03, 0.35, 0.085), 0.016, 0.01, "glassLit", n=8, axis="z")
    eyes(m, 0.31)
    m.bar((0.09, 0.27, 0.0), (0.06, 0.24, 0.12), 0.04, "breading")
    m.bar((-0.09, 0.27, 0.0), (-0.02, 0.23, 0.13), 0.04, "breading")
    m.box((0.02, 0.245, 0.13), (0.02, 0.03, 0.2), "black", bev=0.004)
    m.box((0, 0.29, -0.1), (0.15, 0.14, 0.06), "steelDark", bev=0.012)
    for s in (-1, 1):
        x = s * 0.055
        m.lathe([(0.0, 0.2), (0.034, 0.2), (0.04, 0.23), (0.04, 0.38), (0.03, 0.41), (0.0, 0.42)], "steel", c=(x, 0, -0.15), n=12)
        m.lathe([(0.042, 0.33), (0.042, 0.35), (0.03, 0.35), (0.03, 0.33)], "team", c=(x, 0, -0.15), n=12, ring=True)
        m.lathe([(0.03, 0.2), (0.026, 0.17), (0.022, 0.17), (0.022, 0.2)], "dark", c=(x, 0, -0.15), n=12, ring=True)
        m.prism_x([(-0.13, 0.24), (-0.2, 0.2), (-0.2, 0.3), (-0.13, 0.32)], x + s * 0.03, x + s * 0.04, "dark", bev=0)
    return m


def build_conscript():
    """🪖 TATER CONSCRIPT: a fur ushanka with a team badge, a long greatcoat belted, a long rifle."""
    m = Model("u.conscript", smooth_deg=50)
    nug_body(m, 10)
    m.lathe([(0.0, 0.11), (0.116, 0.11), (0.114, 0.18), (0.108, 0.27), (0.0, 0.28)], "khaki", n=14)
    m.lathe([(0.118, 0.2), (0.118, 0.225), (0.1, 0.225), (0.1, 0.2)], "dark", n=14, ring=True)
    m.box((0, 0.19, 0.108), (0.008, 0.16, 0.006), "oliveDark", bev=0)
    for y in (0.22, 0.17, 0.13):
        m.box((0.014, y, 0.112), (0.01, 0.01, 0.006), "goldDark", bev=0)
    for s in (-1, 1):
        m.box((s * 0.09, 0.28, 0), (0.06, 0.016, 0.08), "team", bev=0.004)
    m.ball((0, 0.375, 0), 0.084, "rust", u=12, v=7, s=(1, 0.62, 1))
    m.box((0, 0.405, 0), (0.15, 0.06, 0.15), "wood", bev=0.025, seg=2)
    for s in (-1, 1):
        m.box((s * 0.077, 0.33, -0.005), (0.032, 0.08, 0.09), "rust", bev=0.012)
    m.box((0, 0.37, 0.072), (0.12, 0.044, 0.024), "wood", bev=0.008)
    m.box((0, 0.375, 0.085), (0.026, 0.026, 0.006), "team", bev=0.002)
    eyes(m, 0.315)
    m.bar((0.09, 0.27, 0.0), (0.06, 0.24, 0.12), 0.05, "khaki")
    m.bar((-0.09, 0.27, 0.0), (-0.02, 0.23, 0.13), 0.05, "khaki")
    m.box((0.02, 0.255, 0.16), (0.02, 0.03, 0.26), "black", bev=0.004)
    m.box((0.02, 0.245, 0.04), (0.024, 0.045, 0.09), "wood", bev=0.006)
    m.cyl((0.02, 0.262, 0.33), 0.004, 0.08, "steel", n=4, axis="z")
    return m


def build_zapper():
    """⚡ ZAP NUG: bulky armour, a bucket helmet with a glowing visor, coil gauntlets, a coil backpack."""
    m = Model("u.zapper", smooth_deg=45)
    nugget(m, (0, 0.2, 0), (0.09, 0.08, 0.08), seed=12, lumps=False, n=12, v=8)
    m.box((0, 0.26, -0.005), (0.24, 0.2, 0.2), "armorDark", bev=0.035, seg=2)
    m.box((0, 0.28, 0.07), (0.17, 0.14, 0.08), "team", bev=0.02)
    m.box((0, 0.16, 0), (0.22, 0.05, 0.18), "dark", bev=0.012)
    for s in (-1, 1):
        m.ball((s * 0.13, 0.33, 0), 0.05, "steel", u=10, v=6, s=(1, 0.8, 1))
    m.cyl((0, 0.39, 0.01), 0.07, 0.1, "steel", n=12, r2=0.06, bev=0.006)
    m.cyl((0, 0.447, 0.01), 0.06, 0.016, "dark", n=12, r2=0.03)
    m.box((0, 0.4, 0.075), (0.1, 0.032, 0.012), "black", bev=0)
    m.box((0, 0.4, 0.08), (0.08, 0.018, 0.008), "glassLit", bev=0)
    for s in (-1, 1):
        x = s * 0.12
        m.box((x, 0.26, 0.04), (0.07, 0.07, 0.1), "armorDark", bev=0.012)
        m.cyl((x, 0.25, 0.135), 0.03, 0.11, "steel", n=10, axis="z", r2=0.026)
        for k in range(3):
            m.torus((x, 0.25, 0.1 + k * 0.03), 0.034, 0.008, "copper", n=12, m=5, axis="z")
        m.ball((x, 0.25, 0.205), 0.022, "glassLit", u=8, v=5)
    m.box((0, 0.29, -0.13), (0.16, 0.16, 0.08), "dark", bev=0.015)
    m.cyl((0, 0.43, -0.14), 0.018, 0.14, "steel", n=8, r2=0.012)
    for k in range(3):
        m.torus((0, 0.38 + k * 0.04, -0.14), 0.045 - k * 0.008, 0.01, "copper", n=12, m=5)
    m.ball((0, 0.51, -0.14), 0.02, "glassLit", u=8, v=5)
    return m


def build_dog():
    """🌭 CORN DOG: a battered corn-dog body on a stick (the tail), a dog's head, a team collar.
    Four dog_legs attach at (±0.05, 0.12, ±0.11)."""
    m = Model("u.dog", smooth_deg=55)
    rings = []
    for i in range(11):
        t = i / 10
        z = -0.2 + t * 0.4
        r = 0.068 * (math.sin(t * math.pi) ** 0.35) + 0.002
        rings.append([(math.cos(j / 12 * TAU) * r * (1 + 0.06 * math.sin(j * 2.3 + i)), 0.17 + math.sin(j / 12 * TAU) * r * 0.95, z) for j in range(12)])
    m.loft(rings, "breading", cap0=False, cap1=False)
    for k, (x, y, z) in enumerate(((0.04, 0.21, -0.05), (-0.045, 0.18, 0.06), (0.03, 0.13, 0.09), (-0.03, 0.22, -0.12))):
        m.ball((x, y, z), 0.022, "breadDark", u=6, v=4)
    for k in range(6):
        m.push(0, 0.238, -0.13 + k * 0.05, 0.7 if k % 2 else -0.7)
        m.box((0, 0, 0), (0.06, 0.008, 0.014), "gold", bev=0.002)
        m.pop()
    m.ball((0, 0.26, 0.2), 0.065, "breading", u=12, v=8, s=(1, 0.9, 1))
    m.box((0, 0.235, 0.27), (0.07, 0.06, 0.07), "breading", bev=0.025, seg=2)
    m.ball((0, 0.245, 0.305), 0.014, "black", u=6, v=4)
    eyes(m, 0.275)
    for s in (-1, 1):
        m.push(s * 0.06, 0.29, 0.18, 0, 0, s * 0.5)
        m.box((0, -0.02, 0), (0.024, 0.07, 0.044), "breadDark", bev=0.01)
        m.pop()
    m.torus((0, 0.205, 0.148), 0.06, 0.012, "team", n=14, m=5, axis="z")
    m.ball((0, 0.15, 0.16), 0.012, "goldDark", u=6, v=4)
    m.tube([(0, 0.17, -0.19), (0, 0.24, -0.33)], 0.012, "wood", n=6)
    return m


def build_dog_leg():
    m = Model("u.dog_leg", smooth_deg=50)
    m.cyl((0, -0.05, 0), 0.02, 0.1, "breadDark", n=8, r2=0.017)
    m.box((0, -0.11, 0.008), (0.044, 0.024, 0.056), "breading", bev=0.01)
    return m


def build_ifv():
    """🚙 NUG IFV (Alliance): a six-wheeled armoured carrier with a sloped nose and rear hatch; its missile
    turret sits at (0, 0.24, -0.04)."""
    m = Model("u.ifv")
    for s in (-1, 1):
        for z in (-0.27, 0.0, 0.27):
            wheel(m, s * 0.205, 0.075, z, 0.075, 0.07)
    m.box((0, 0.11, 0), (0.34, 0.06, 0.76), "dark", bev=0.012)
    m.prism_x([(-0.4, 0.12), (-0.4, 0.24), (0.2, 0.25), (0.42, 0.17), (0.43, 0.12)], -0.2, 0.2, "allyArmor", bev=0.012, seg=2)
    for s in (-1, 1):
        m.prism_x([(-0.38, 0.15), (-0.38, 0.17), (0.38, 0.17), (0.4, 0.15)], s * 0.2, s * 0.24, "allyDark", bev=0.004)
        m.box((s * 0.201, 0.2, -0.1), (0.006, 0.03, 0.22), "team", bev=0)
    m.box((0, 0.252, -0.24), (0.24, 0.012, 0.16), "team", bev=0)
    m.box((0.08, 0.235, 0.3), (0.1, 0.02, 0.05), "glass", bev=0.004)
    for s in (-1, 1):
        m.box((s * 0.14, 0.16, 0.425), (0.05, 0.03, 0.012), "light", bev=0)
    m.box((0, 0.18, -0.405), (0.22, 0.1, 0.016), "allyDark", bev=0.004)
    m.cyl((0.15, 0.32, -0.33), 0.004, 0.16, "black", n=4)
    return m


def build_ifv_turret():
    """The IFV turret: a small armoured ring with twin missile pods (team-banded) and a sight."""
    m = Model("u.ifv_turret")
    m.cyl((0, 0.02, 0), 0.11, 0.04, "allyDark", n=12, r2=0.1, bev=0.004)
    m.box((0, 0.07, 0), (0.14, 0.08, 0.18), "allyArmor", bev=0.016, seg=2)
    m.box((0, 0.085, 0.092), (0.06, 0.024, 0.008), "glassLit", bev=0)
    for s in (-1, 1):
        m.box((s * 0.13, 0.08, 0.0), (0.09, 0.08, 0.2), "allyDark", bev=0.012)
        m.box((s * 0.13, 0.122, -0.02), (0.08, 0.004, 0.12), "team", bev=0)
        for y in (0.062, 0.098):
            for dx in (-0.02, 0.02):
                m.cyl((s * 0.13 + dx, y, 0.1), 0.014, 0.008, "black", n=8, axis="z")
                m.cyl((s * 0.13 + dx, y, 0.104), 0.009, 0.006, "sauce", n=6, axis="z")
    m.cyl((-0.03, 0.125, -0.05), 0.02, 0.03, "dark", n=8)
    return m


def build_prismtank():
    """💎 PRISM TANK hull (Alliance): low pale armour on five-wheel tracks, a white glacis; the crystal
    turret sits at (0, 0.28, -0.03)."""
    m = Model("u.prismtank")
    for s in (-1, 1):
        track_run(m, s * 0.25, 0.13, -0.42, 0.42)
        m.prism_x([(-0.44, 0.178), (-0.42, 0.2), (0.4, 0.2), (0.45, 0.178)], s * 0.19, s * 0.32, "allyDark", bev=0.005)
    m.prism_x([(-0.4, 0.12), (-0.4, 0.27), (0.12, 0.28), (0.42, 0.19), (0.42, 0.15), (0.36, 0.11)], -0.18, 0.18, "allyArmor", bev=0.012, seg=2)
    m.prism_x([(0.13, 0.279), (0.41, 0.195), (0.4, 0.19), (0.12, 0.274)], -0.17, 0.17, "paintWhite", bev=0)
    m.box((0, 0.282, -0.22), (0.28, 0.008, 0.22), "team", bev=0)
    for s in (-1, 1):
        m.box((s * 0.1, 0.25, 0.22), (0.07, 0.02, 0.04), "glassLit", bev=0.004)
        m.box((s * 0.13, 0.16, 0.425), (0.05, 0.024, 0.01), "light", bev=0)
    for k in range(5):
        m.box((0, 0.276, -0.38 + k * 0.03), (0.22, 0.006, 0.012), "dark", bev=0)
    return m


def build_prismtank_turret():
    """A stepped round turret with a cradle of three arms holding the prism crystal."""
    m = Model("u.prismtank_turret")
    m.lathe([(0.0, 0.0), (0.16, 0.0), (0.155, 0.04), (0.15, 0.045), (0.11, 0.075), (0.0, 0.075)], "allyArmor", n=16, bev=0.004)
    m.lathe([(0.112, 0.07), (0.108, 0.085), (0.0, 0.085)], "team", n=16)
    for k in range(3):
        a = k / 3 * TAU + math.pi / 2
        m.bar((math.cos(a) * 0.1, 0.07, math.sin(a) * 0.1), (math.cos(a) * 0.13, 0.2, math.sin(a) * 0.13), 0.018, "steelDark")
        m.ball((math.cos(a) * 0.13, 0.205, math.sin(a) * 0.13), 0.013, "glassLit", u=8, v=5)
    crystal(m, (0, 0.19, 0), 0.11, 0.17, 0.1, n=6)
    return m


def build_mirage():
    """🌳 MIRAGE TANK hull: low and sleek with raked side skirts; the projector turret sits at (0, 0.28, -0.05)."""
    m = Model("u.mirage")
    for s in (-1, 1):
        track_run(m, s * 0.24, 0.12, -0.42, 0.42)
        m.push(s * 0.315, 0.16, 0, 0, 0, -s * 0.25)
        m.box((0, 0, 0), (0.02, 0.1, 0.8), "allyArmor", bev=0.006)
        m.pop()
    m.prism_x([(-0.4, 0.13), (-0.4, 0.26), (0.1, 0.27), (0.43, 0.18), (0.43, 0.15), (0.36, 0.12)], -0.2, 0.2, "allyArmor", bev=0.012, seg=2)
    m.box((0, 0.272, -0.2), (0.3, 0.008, 0.24), "team", bev=0)
    m.box((0, 0.245, 0.24), (0.12, 0.016, 0.05), "glassLit", bev=0.003)
    for s in (-1, 1):
        m.box((s * 0.12, 0.275, -0.33), (0.08, 0.02, 0.1), "allyDark", bev=0.005)
        m.box((s * 0.14, 0.17, 0.432), (0.044, 0.02, 0.01), "light", bev=0)
    return m


def build_mirage_turret():
    """The mirage projector: a flat turret, a white barrel ending in a big lens, two fins."""
    m = Model("u.mirage_turret")
    m.cyl((0, 0.015, 0), 0.15, 0.03, "allyDark", n=14, r2=0.14, bev=0.004)
    m.prism_x([(-0.12, 0.03), (-0.12, 0.08), (0.06, 0.1), (0.13, 0.06), (0.13, 0.03)], -0.12, 0.12, "allyArmor", bev=0.01)
    m.box((0, 0.093, -0.05), (0.14, 0.006, 0.1), "team", bev=0)
    m.cyl((0, 0.06, 0.16), 0.04, 0.16, "paintWhite", n=12, axis="z", r2=0.05, bev=0.004)
    m.cyl((0, 0.06, 0.255), 0.066, 0.03, "dark", n=16, axis="z", bev=0.004)
    m.cyl((0, 0.06, 0.272), 0.055, 0.008, "glassLit", n=16, axis="z")
    m.ball((0, 0.06, 0.276), 0.025, "crystal", u=10, v=6, s=(1, 1, 0.6))
    for s in (-1, 1):
        m.prism_x([(0.1, 0.06), (0.22, 0.06), (0.2, 0.08), (0.1, 0.11)], s * 0.045 - 0.004, s * 0.045 + 0.004, "paintWhite", bev=0)
    return m


def build_v3():
    """🚀 SAUCE V3 launcher truck (Federation): six wheels, a cab, a flatbed; the launch rail is v3_rack at
    (0, 0.3, -0.3)."""
    m = Model("u.v3")
    for s in (-1, 1):
        for z in (-0.33, -0.17, 0.27):
            wheel(m, s * 0.2, 0.075, z, 0.075, 0.065)
        m.prism_x([(-0.42, 0.16), (-0.42, 0.18), (-0.08, 0.18), (-0.06, 0.16)], s * 0.16, s * 0.24, "armorDark", bev=0.004)
        m.prism_x([(0.18, 0.16), (0.18, 0.18), (0.36, 0.18), (0.38, 0.16)], s * 0.16, s * 0.24, "armorDark", bev=0.004)
    m.box((0, 0.12, -0.02), (0.3, 0.06, 0.84), "dark", bev=0.008)
    m.prism_x([(0.18, 0.15), (0.18, 0.37), (0.36, 0.37), (0.45, 0.25), (0.46, 0.15)], -0.19, 0.19, "armor", bev=0.014, seg=2)
    m.prism_x([(0.365, 0.355), (0.44, 0.26), (0.445, 0.265), (0.37, 0.36)], -0.16, 0.16, "glassLit", bev=0)
    for s in (-1, 1):
        m.box((s * 0.192, 0.3, 0.28), (0.006, 0.06, 0.12), "glass", bev=0)
        m.box((s * 0.15, 0.19, 0.452), (0.05, 0.03, 0.012), "light", bev=0)
    m.box((0, 0.372, 0.27), (0.3, 0.008, 0.14), "team", bev=0)
    m.box((0, 0.17, -0.12), (0.4, 0.05, 0.6), "armorDark", bev=0.008)
    for s in (-1, 1):
        m.box((s * 0.201, 0.17, -0.12), (0.004, 0.03, 0.5), "team", bev=0)
    m.box((0, 0.24, -0.3), (0.24, 0.1, 0.12), "dark", bev=0.012)
    m.box((0.13, 0.23, -0.05), (0.1, 0.08, 0.12), "armorDark", bev=0.01)
    m.cyl((-0.15, 0.31, 0.17), 0.018, 0.22, "dark", n=8)
    return m


def build_v3_rack():
    """The V3 launch rail: the origin is the hinge, raised 25° (built in), a ram underneath."""
    m = Model("u.v3_rack")
    m.cyl((0, 0, 0), 0.03, 0.2, "dark", n=10, axis="x")
    m.push(0, 0, 0, 0, -0.436)
    m.box((0, 0.015, 0.28), (0.14, 0.03, 0.68), "armorDark", bev=0.006)
    for s in (-1, 1):
        m.box((s * 0.065, 0.045, 0.28), (0.02, 0.06, 0.66), "armor", bev=0.004)
        m.box((s * 0.077, 0.045, 0.2), (0.006, 0.03, 0.32), "team", bev=0)
    for k in range(4):
        m.box((0, 0.032, k * 0.18), (0.12, 0.008, 0.024), "steel", bev=0)
    m.box((0, -0.04, 0.26), (0.04, 0.08, 0.04), "steel", bev=0.004)
    m.pop()
    m.box((0, 0.02, 0), (0.16, 0.06, 0.08), "steelDark", bev=0.008)
    return m


def build_v3_rocket():
    """The V3 rocket: ~0.6 long, centred, nose +z, four tail fins."""
    m = Model("u.v3_rocket", smooth_deg=50)
    prof = [(0.0, -0.3), (0.028, -0.29), (0.036, -0.24), (0.042, -0.2), (0.042, 0.18), (0.035, 0.23), (0.02, 0.27), (0.0, 0.3)]
    m.push(0, 0, 0, 0, math.pi / 2)
    m.lathe([(r, y) for r, y in prof], "paintWhite", n=14)
    m.lathe([(0.0435, 0.1), (0.0435, 0.14), (0.04, 0.14), (0.04, 0.1)], "team", n=14, ring=True)
    m.lathe([(0.036, 0.22), (0.0, 0.3), (0.0, 0.299), (0.035, 0.219)], "sauce", n=14)
    m.pop()
    for k in range(4):
        m.push(0, 0, 0, 0, 0, k * math.pi / 2 + math.pi / 4)
        m.prism_x([(-0.24, 0.04), (-0.15, 0.04), (-0.22, 0.1), (-0.27, 0.1)], -0.004, 0.004, "dark", bev=0)
        m.pop()
    return m


def build_apoc():
    """🐘 FAMILY SIZE (the super-tank): two track pods a side under heavy pod armour, a massive sloped
    hull, exhaust stacks; turret at (0, 0.38, -0.04)."""
    m = Model("u.apoc")
    for s in (-1, 1):
        for x in (0.29, 0.48):
            track_run(m, s * x, 0.16, -0.6, 0.6, r=0.1, wheels=6, wr=0.07)
        m.prism_x([(-0.62, 0.22), (-0.6, 0.29), (0.56, 0.29), (0.64, 0.22)], s * 0.2, s * 0.58, "armor", bev=0.012)
        m.box((s * 0.385, 0.293, -0.3), (0.3, 0.006, 0.05), "team", bev=0)
        for k in range(4):
            m.box((s * 0.385, 0.298, 0.2 + k * 0.1), (0.03, 0.01, 0.03), "dark", bev=0.003)
        m.cyl((s * 0.45, 0.36, -0.52), 0.035, 0.14, "dark", n=10, r2=0.03)
        m.cyl((s * 0.45, 0.43, -0.52), 0.026, 0.01, "black", n=10)
    m.prism_x([(-0.56, 0.18), (-0.56, 0.36), (0.18, 0.39), (0.6, 0.28), (0.6, 0.2), (0.5, 0.16)], -0.21, 0.21, "armor", bev=0.016, seg=2)
    for k in range(8):
        m.box((0, 0.375, -0.52 + k * 0.035), (0.3, 0.006, 0.014), "dark", bev=0)
    m.box((0, 0.36, -0.56), (0.32, 0.06, 0.04), "armorDark", bev=0.008)
    for s in (-1, 1):
        m.box((s * 0.12, 0.23, 0.6), (0.06, 0.035, 0.012), "light", bev=0)
    for k in range(4):
        m.box((-0.15 + k * 0.1, 0.33, 0.45), (0.08, 0.014, 0.04), "rubber", bev=0.002)
    return m


def build_apoc_turret():
    """The super-tank turret: a broad slab turret with a sloped face, AA missile pods on the flanks, a
    cupola, a rear stowage box."""
    m = Model("u.apoc_turret")
    plan = [(-0.22, -0.34), (0.22, -0.34), (0.27, -0.12), (0.25, 0.18), (0.13, 0.3), (-0.13, 0.3), (-0.25, 0.18), (-0.27, -0.12)]
    m.prism_y([(x * 1.04, z * 1.04) for x, z in plan], -0.02, 0.04, "armorDark", bev=0.006)
    m.prism_y(plan, 0.04, 0.2, "armor", bev=0.016, seg=2, top=0.85, topc=(0, -0.03))
    m.prism_y([(x * 0.6, z * 0.6 - 0.05) for x, z in plan], 0.2, 0.208, "team", bev=0)
    m.box((0, 0.12, 0.28), (0.26, 0.12, 0.1), "armorDark", bev=0.016, seg=2)
    for s in (-1, 1):
        m.box((s * 0.3, 0.13, -0.08), (0.11, 0.12, 0.26), "armorDark", bev=0.014, seg=2)
        m.box((s * 0.357, 0.13, -0.08), (0.006, 0.06, 0.2), "team", bev=0)
        for y in (0.105, 0.155):
            for dx in (-0.024, 0.024):
                m.cyl((s * 0.3 + dx, y, 0.051), 0.018, 0.008, "black", n=8, axis="z")
                m.cyl((s * 0.3 + dx, y, 0.054), 0.011, 0.006, "sauce", n=6, axis="z")
    m.cyl((0.1, 0.225, -0.15), 0.06, 0.05, "armor", n=14, bev=0.006)
    m.cyl((0.1, 0.252, -0.15), 0.052, 0.012, "steelDark", n=14)
    m.box((-0.12, 0.13, -0.38), (0.3, 0.1, 0.08), "olive", bev=0.01)
    m.cyl((-0.15, 0.36, -0.28), 0.004, 0.3, "black", n=4)
    return m


def build_apoc_gun():
    """The twin 'family size' guns: origin at the trunnion, barrels at x ±0.07 running +z."""
    m = Model("u.apoc_gun")
    m.box((0, 0, 0.02), (0.24, 0.1, 0.08), "armorDark", bev=0.014, seg=2)
    for s in (-1, 1):
        x = s * 0.07
        m.cyl((x, 0, 0.1), 0.042, 0.12, "dark", n=12, axis="z", r2=0.036, bev=0.004)
        m.cyl((x, 0, 0.36), 0.026, 0.42, "dark", n=12, axis="z", r2=0.024)
        m.cyl((x, 0, 0.3), 0.036, 0.08, "dark", n=12, axis="z", bev=0.004)
        m.box((x, 0, 0.6), (0.08, 0.07, 0.07), "black", bev=0.008)
    return m


def build_flaktrack():
    """💥 FLAK TRACK: a half-track — front wheels, rear track runs, an armoured body; the flak gun ring top
    is at (0, 0.26, -0.12)."""
    m = Model("u.flaktrack")
    for s in (-1, 1):
        track_run(m, s * 0.19, 0.12, -0.42, 0.08, r=0.07, wheels=4, wr=0.055)
        wheel(m, s * 0.19, 0.075, 0.28, 0.075, 0.07)
        m.prism_x([(0.17, 0.16), (0.2, 0.19), (0.37, 0.19), (0.4, 0.16)], s * 0.14, s * 0.26, "armorDark", bev=0.004)
    m.box((0, 0.12, -0.05), (0.26, 0.06, 0.84), "dark", bev=0.008)
    m.prism_x([(-0.42, 0.14), (-0.42, 0.26), (0.08, 0.26), (0.1, 0.14)], -0.17, 0.17, "armor", bev=0.012, seg=2)
    m.prism_x([(0.08, 0.14), (0.08, 0.3), (0.2, 0.3), (0.38, 0.24), (0.4, 0.14)], -0.13, 0.13, "armor", bev=0.012, seg=2)
    m.box((0, 0.27, 0.215), (0.2, 0.03, 0.006), "black", bev=0)
    for s in (-1, 1):
        m.box((s * 0.171, 0.21, -0.17), (0.004, 0.04, 0.42), "team", bev=0)
        m.box((s * 0.08, 0.22, 0.4), (0.036, 0.024, 0.01), "light", bev=0)
    m.cyl((0, 0.25, -0.12), 0.13, 0.03, "dark", n=14, r2=0.12)
    m.box((0, 0.25, -0.41), (0.28, 0.05, 0.03), "armorDark", bev=0.006)
    return m


def build_harvF():
    """🚜 WAR HAULER (Federation harvester): tracked, an armoured cab with vision slits, a drab hopper with a
    team band, the shared drum + load; harvF_gun on the cab roof at (0, 0.5, 0.3)."""
    m = Model("u.harvF")
    for s in (-1, 1):
        track_run(m, s * 0.27, 0.16, -0.5, 0.38, r=0.09, wheels=5, wr=0.065)
        for k in range(4):
            m.push(s * 0.36, 0.13, -0.38 + k * 0.22, 0, 0, s * 0.2)
            m.box((0, 0, 0), (0.012, 0.1, 0.12), "armorDark", bev=0.003)
            m.pop()
    m.box((0, 0.2, -0.05), (0.4, 0.1, 0.94), "dark", bev=0.012)
    m.prism_x([(0.15, 0.22), (0.15, 0.5), (0.36, 0.5), (0.46, 0.4), (0.47, 0.22)], -0.25, 0.25, "armor", bev=0.014, seg=2)
    m.box((0, 0.43, 0.43), (0.4, 0.024, 0.04), "black", bev=0)
    for s in (-1, 1):
        m.box((s * 0.12, 0.43, 0.44), (0.07, 0.012, 0.03), "glassLit", bev=0)
        m.box((s * 0.252, 0.42, 0.3), (0.006, 0.03, 0.18), "black", bev=0)
        m.box((s * 0.2, 0.3, 0.465), (0.056, 0.036, 0.01), "light", bev=0)
    m.box((0, 0.503, 0.3), (0.42, 0.008, 0.22), "team", bev=0)
    m.prism_x([(-0.52, 0.22), (-0.52, 0.47), (0.08, 0.47), (0.08, 0.22)], -0.3, 0.3, "armorDark", bev=0.014, seg=2)
    m.box((0, 0.42, -0.22), (0.605, 0.04, 0.6), "team", bev=0.004)
    m.box((0, 0.472, -0.22), (0.54, 0.01, 0.56), "black", bev=0)
    for s in (-1, 1):
        for z in (-0.42, -0.22, -0.02):
            m.box((s * 0.305, 0.33, z), (0.012, 0.22, 0.024), "armor", bev=0)
        m.cyl((s * 0.2, 0.55, 0.13), 0.025, 0.24, "dark", n=8)
        m.cyl((s * 0.2, 0.67, 0.13), 0.02, 0.01, "black", n=8)
    for s in (-1, 1):
        m.bar((s * 0.24, 0.24, 0.3), (s * 0.25, 0.13, 0.52), 0.04, "steelDark")
        m.cyl((s * 0.25, 0.12, 0.52), 0.04, 0.03, "dark", n=10, axis="x")
    return m


def build_harvF_gun():
    """The War Hauler's roof gun: a small mount with twin MGs behind a shield."""
    m = Model("u.harvF_gun")
    m.cyl((0, 0.015, 0), 0.07, 0.03, "armorDark", n=10, r2=0.065, bev=0.003)
    m.box((0, 0.06, 0), (0.09, 0.06, 0.1), "armor", bev=0.012)
    m.box((0, 0.092, -0.01), (0.07, 0.004, 0.07), "team", bev=0)
    for s in (-1, 1):
        m.cyl((s * 0.018, 0.06, 0.12), 0.009, 0.14, "dark", n=6, axis="z")
        m.cyl((s * 0.018, 0.06, 0.19), 0.012, 0.02, "black", n=6, axis="z")
    m.push(0, 0.07, 0.06, 0, -0.2)
    m.box((0, 0, 0), (0.12, 0.07, 0.012), "armor", bev=0.004)
    m.pop()
    return m


def build_jet():
    """✈️ NUG JET: origin at the centre of mass, nose +z, ~0.95 long, 0.8 span: an area-ruled fuselage,
    swept wings with team tips, twin canted tails, a bubble canopy, intakes, twin nozzles, two missiles."""
    m = Model("u.jet", smooth_deg=40)
    rings = []
    sec = [(0.47, 0.004, 0.004), (0.42, 0.024, 0.02), (0.33, 0.05, 0.042), (0.2, 0.07, 0.058), (0.05, 0.078, 0.064),
           (-0.15, 0.08, 0.062), (-0.32, 0.075, 0.055), (-0.44, 0.065, 0.05)]
    for z, rx, ry in sec:
        rings.append([(math.cos(j / 14 * TAU) * rx, math.sin(j / 14 * TAU) * ry, z) for j in range(14)])
    m.loft(list(reversed(rings)), "allyArmor")
    m.push(0, 0.05, 0.19)
    m.ball((0, 0, 0), 0.04, "glass", u=12, v=6, s=(1, 0.8, 2.2))
    m.pop()
    for s in (-1, 1):
        m.prism_y([(s * 0.05, 0.14), (s * 0.4, -0.08), (s * 0.4, -0.16), (s * 0.05, -0.22)], -0.02, -0.004, "allyArmor", bev=0.003)
        m.prism_y([(s * 0.31, -0.04), (s * 0.4, -0.08), (s * 0.4, -0.16), (s * 0.31, -0.16)], -0.0035, -0.002, "team", bev=0)
        m.prism_y([(s * 0.05, -0.29), (s * 0.18, -0.4), (s * 0.18, -0.45), (s * 0.05, -0.45)], -0.01, 0.002, "allyArmor", bev=0.002)
        m.push(s * 0.045, 0.04, 0, 0, 0, -s * 0.28)
        m.prism_x([(-0.27, 0.0), (-0.41, 0.17), (-0.46, 0.17), (-0.45, 0.0)], -0.006, 0.006, "allyDark", bev=0.002)
        m.prism_x([(-0.405, 0.15), (-0.46, 0.15), (-0.462, 0.17), (-0.41, 0.17)], -0.007, 0.007, "team", bev=0)
        m.pop()
        m.box((s * 0.075, -0.01, 0.06), (0.04, 0.06, 0.2), "allyDark", bev=0.01)
        m.box((s * 0.075, -0.01, 0.161), (0.03, 0.045, 0.006), "black", bev=0)
        m.cyl((s * 0.03, -0.005, -0.47), 0.036, 0.07, "dark", n=12, axis="z", r2=0.03)
        m.cyl((s * 0.03, -0.005, -0.505), 0.024, 0.004, "light", n=10, axis="z")
        m.box((s * 0.24, -0.03, -0.06), (0.01, 0.024, 0.1), "dark", bev=0)
        m.cyl((s * 0.24, -0.055, -0.05), 0.016, 0.22, "paintWhite", n=10, axis="z")
        m.cyl((s * 0.24, -0.055, 0.085), 0.016, 0.05, "sauce", n=10, axis="z", r2=0.0)
        m.box((s * 0.4, -0.012, -0.12), (0.01, 0.014, 0.03), "red" if s < 0 else "glassLit", bev=0)
    return m


def build_blimp():
    """🎈 GRAVY BLIMP: a fabric envelope shaped like a gravy boat (spout up at the nose, a handle at the
    back), team bands, cruciform fins, a hanging gondola, two engine nacelles (props are blimp_prop)."""
    m = Model("u.blimp", smooth_deg=40)
    N, n = 20, 18
    rings = []
    for i in range(N + 1):
        t = -1 + 2 * i / N
        z = t * 1.1
        r = 0.46 * max(0.0, 1 - t * t) ** 0.45 + 0.002
        if t > 0:
            r *= 1 - 0.3 * t * t
        yo = (t - 0.3) ** 2 * 0.45 if t > 0.3 else 0.0
        rings.append([(math.cos(j / n * TAU) * r, yo + math.sin(j / n * TAU) * r * 0.95, z) for j in range(n)])
    m.loft(rings, "gravy", cap0=False, cap1=False)
    for i in (5, 13):
        t = -1 + 2 * i / N
        r = 0.46 * max(0.0, 1 - t * t) ** 0.45
        if t > 0:
            r *= 1 - 0.3 * t * t
        yo = (t - 0.3) ** 2 * 0.45 if t > 0.3 else 0.0
        m.push(0, yo, t * 1.1, 0, math.pi / 2)
        m.lathe([(r + 0.006, -0.04), (r + 0.006, 0.04), (r - 0.02, 0.04), (r - 0.02, -0.04)], "team", n=n, ring=True)
        m.pop()
    lip = []
    for i in range(2, N - 1):
        t = -1 + 2 * i / N
        r = 0.46 * max(0.0, 1 - t * t) ** 0.45
        if t > 0:
            r *= 1 - 0.3 * t * t
        yo = (t - 0.3) ** 2 * 0.45 if t > 0.3 else 0.0
        lip.append((r + 0.012, yo + 0.12, t * 1.1))
    for s in (-1, 1):
        m.tube([(s * x, y, z) for x, y, z in lip], 0.02, "white", n=6)
    m.prism_y([(-0.16, 0.7), (0.16, 0.7), (0.06, 1.12), (0, 1.2), (-0.06, 1.12)], 0.315, 0.35, "white", bev=0.006)
    m.prism_y([(-0.13, 0.72), (0.13, 0.72), (0.05, 1.1), (-0.05, 1.1)], 0.35, 0.358, "gravyLt", bev=0)
    m.tube([(0, 0.3 + math.sin(k / 8 * math.pi) * 0.28, -0.72 - (1 - math.cos(k / 8 * math.pi)) * 0.2) for k in range(9)], 0.045, "gravyLt", n=8)
    for roll in (math.pi / 2, -math.pi / 2, math.pi):
        m.push(0, 0, 0, 0, 0, roll)
        m.prism_x([(-0.8, 0.2), (-1.12, 0.48), (-1.2, 0.48), (-1.1, 0.08)], -0.012, 0.012, "gravy", bev=0.004)
        m.prism_x([(-1.08, 0.42), (-1.12, 0.48), (-1.2, 0.48), (-1.18, 0.42)], -0.014, 0.014, "team", bev=0)
        m.pop()
    m.box((0, -0.44, 0.05), (0.16, 0.06, 0.6), "dark", bev=0.01)
    m.prism_x([(-0.37, -0.47), (-0.37, -0.6), (0.4, -0.6), (0.5, -0.53), (0.47, -0.47)], -0.15, 0.15, "armor", bev=0.02, seg=2)
    m.box((0, -0.5, 0.49), (0.2, 0.05, 0.02), "glassLit", bev=0)
    m.box((0, -0.603, 0.05), (0.304, 0.012, 0.78), "team", bev=0)
    for s in (-1, 1):
        for k in range(5):
            m.box((s * 0.152, -0.51, -0.25 + k * 0.13), (0.008, 0.04, 0.06), "glassLit" if k % 2 else "glass", bev=0)
        m.tube([(s * 0.15, -0.5, -0.45), (s * 0.44, -0.3, -0.45)], 0.02, "dark", n=6)
        m.tube([(s * 0.3, -0.12, -0.45), (s * 0.44, -0.3, -0.45)], 0.014, "dark", n=6)
        m.cyl((s * 0.44, -0.3, -0.46), 0.06, 0.32, "armorDark", n=14, axis="z", r2=0.05, bev=0.006)
        m.cyl((s * 0.44, -0.3, -0.4), 0.062, 0.04, "team", n=14, axis="z")
        m.ball((s * 0.44, -0.3, -0.3), 0.06, "dark", u=12, v=7)
    m.box((0, -0.63, -0.1), (0.14, 0.04, 0.2), "dark", bev=0.006)
    return m


def build_blimp_prop():
    """A pusher prop: a spinner and three wooden blades (spun about z)."""
    m = Model("u.blimp_prop")
    m.cyl((0, 0, -0.005), 0.03, 0.05, "dark", n=10, axis="z", r2=0.025)
    m.cyl((0, 0, -0.05), 0.026, 0.04, "steel", n=10, axis="z", r2=0.0)
    for k in range(3):
        m.push(0, 0, 0, 0, 0, k * TAU / 3)
        m.push(0, 0.09, -0.01, 0.3)
        m.box((0, 0, 0), (0.044, 0.16, 0.01), "wood", bev=0.003)
        m.box((0, 0.07, 0), (0.046, 0.024, 0.012), "team", bev=0)
        m.pop()
        m.pop()
    return m


def build_crate():
    """📦 BONUS CRATE (0.34 cube, origin on the ground): a braced plank crate with steel corners, the
    nugget mark stencilled on each side."""
    m = Model("u.crate")
    h = 0.17
    m.box((0, h, 0), (2 * h, 2 * h, 2 * h), "crateWood", bev=0.012)
    for s in (-1, 1):
        for t in (-1, 1):
            m.box((s * (h - 0.015), h, t * (h - 0.015)), (0.04, 2 * h + 0.004, 0.04), "wood", bev=0.004)
            m.box((0, h + s * (h - 0.015), t * (h - 0.015)), (2 * h + 0.004, 0.04, 0.04), "wood", bev=0.004)
            m.box((s * (h - 0.015), h + t * (h - 0.015), 0), (0.04, 0.04, 2 * h + 0.004), "wood", bev=0.004)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                m.box((sx * (h - 0.01), h + sy * (h - 0.01), sz * (h - 0.01)), (0.05, 0.05, 0.05), "steelDark", bev=0.006)
    for yaw in (0, math.pi / 2, math.pi, -math.pi / 2):
        m.push(math.sin(yaw) * (h + 0.003), h, math.cos(yaw) * (h + 0.003), yaw)
        nugget(m, (0, 0, 0), (0.08, 0.07, 0.008), seed=3, mat="gold", lumps=False, n=10, v=6)
        m.pop()
    m.push(0, 2 * h + 0.003, 0)
    nugget(m, (0, 0, 0), (0.08, 0.008, 0.07), seed=4, mat="gold", lumps=False, n=10, v=6)
    m.pop()
    return m


def build_gravy_stream():
    """The pour: a column of gravy from y 0 (where it hits) to y 1 (the spout), stretched to fit by the
    game. It necks and bulges like a heavy liquid falling, flares where it lands, and twists a little."""
    m = Model("u.gravy_stream", smooth_deg=80)
    rings = []
    for i in range(25):
        t = i / 24
        r = 0.07 + 0.016 * math.sin(t * 19.0) + 0.01 * math.sin(t * 41.0 + 1.3)
        r *= 0.75 + 0.25 * (1 - t)
        if t < 0.08:
            r += (0.08 - t) / 0.08 * 0.09          # the flare where it lands
        tw = t * 2.2
        rings.append([(math.cos(j / 12 * TAU + tw) * r * (1 + 0.12 * math.sin(j * 1.7 + i)), t, math.sin(j / 12 * TAU + tw) * r) for j in range(12)])
    m.loft(rings, "gravyLiquid")
    for k in range(4):                                # a few fatty glints running down it
        t = 0.2 + k * 0.17
        a = k * 1.9
        m.ball((math.cos(a) * 0.07, t, math.sin(a) * 0.07), 0.018, "gravyFat", u=8, v=5, s=(1, 2.2, 1))
    return m


def build_gravy_pool():
    """A pool of gravy, radius 1 (the game scales it as it spreads and drains): a low glossy dome with a
    lobed, rolled rim, a few skin wrinkles and bubbles."""
    m = Model("u.gravy_pool", smooth_deg=75)
    rnd = random.Random(77)
    n = 56
    lob = [1.0 + 0.12 * math.sin(j / n * TAU * 3 + 0.4) + 0.07 * math.sin(j / n * TAU * 7 + 1.1) + 0.03 * math.sin(j / n * TAU * 13) for j in range(n)]
    # a low dome with slow concentric ripples + a rolled rim: the ripples tilt the surface enough to catch the
    # sun's highlight the way a wet pool does (a flat disc never shows a specular)
    prof = [(0.0, 0.036)] + [(k / 12 * 0.9, 0.034 - 0.012 * (k / 12) ** 2 + 0.0035 * math.sin(k * 1.9)) for k in range(1, 13)] + [(0.96, 0.014), (1.0, 0.005), (0.98, 0.0)]
    rings = [[(math.cos(j / n * TAU) * r * lob[j], y + (0.002 * math.sin(j * 0.9 + r * 9) if 0.05 < r < 0.9 else 0), math.sin(j / n * TAU) * r * lob[j]) for j in range(n)] for r, y in prof]
    m.loft(rings, "gravyLiquid", cap0=False, cap1=True)
    for k in range(9):                               # bubbles + fat blobs on the surface
        a, d = rnd.uniform(0, TAU), rnd.uniform(0.05, 0.75)
        r = rnd.uniform(0.025, 0.06)
        m.ball((math.cos(a) * d, 0.03, math.sin(a) * d), r, "gravyFat" if k % 3 == 0 else "gravyLiquid", u=10, v=6, s=(1, 0.45, 1))
    return m


# ---- the water maps: bridges (a segment = one tile along local +z, two tiles wide: x ±1; deck top y 0.02),
#      the repair hut, reeds ----------------------------------------------------------------------------------
def build_bridge_deck():
    """One tile of concrete road deck: slab, asphalt with a dashed centre line, kerbs, railings, two box
    girders underneath."""
    m = Model("w.bridge_deck")
    m.box((0, -0.03, 0), (1.96, 0.1, 1.0), "concDark", bev=0.006)
    m.box((0, 0.022, 0), (1.66, 0.006, 1.0), "tar", bev=0)
    m.box((0, 0.026, -0.2), (0.04, 0.002, 0.36), "white", bev=0)
    for s_ in (-1, 1):
        m.box((s_ * 0.91, 0.04, 0), (0.12, 0.05, 1.0), "concLite", bev=0.006)
        for k in range(4):
            z = -0.375 + k * 0.25
            m.box((s_ * 0.93, 0.12, z), (0.022, 0.12, 0.022), "steel", bev=0)
        m.box((s_ * 0.93, 0.18, 0), (0.026, 0.02, 1.0), "steel", bev=0.003)
        m.box((s_ * 0.93, 0.12, 0), (0.016, 0.014, 1.0), "steelDark", bev=0)
        m.box((s_ * 0.55, -0.14, 0), (0.22, 0.14, 1.0), "concDark", bev=0.008)
    return m


def build_bridge_truss():
    """One tile of steel through-truss over the deck (long bridges): top + bottom chords, a vertical and a
    diagonal a side, cross bracing overhead."""
    m = Model("w.bridge_truss")
    top = 0.62
    for s_ in (-1, 1):
        x = s_ * 1.0
        m.box((x, top, 0), (0.07, 0.07, 1.0), "trussPaint", bev=0.008)
        m.box((x, 0.08, 0), (0.07, 0.09, 1.0), "trussPaint", bev=0.008)
        m.bar((x, 0.1, -0.5), (x, top, -0.5), 0.06, "trussPaint")
        m.bar((x, 0.1, -0.5), (x, top, 0.5), 0.045, "trussDark")
        for k in range(3):
            m.cyl((x + s_ * 0.036, top, -0.4 + k * 0.4), 0.008, 0.01, "trussDark", n=6, axis="x")
    m.bar((-1.0, top, 0.0), (1.0, top, 0.0), 0.04, "trussPaint")
    m.bar((-1.0, top, -0.5), (1.0, top, 0.5), 0.026, "trussDark")
    m.bar((1.0, top, -0.5), (-1.0, top, 0.5), 0.026, "trussDark")
    return m


def build_bridge_portal():
    """The truss's end frame (the portal) with its sign plate; sits at a truss bridge's two ends."""
    m = Model("w.bridge_portal")
    top = 0.62
    for s_ in (-1, 1):
        m.bar((s_ * 1.0, 0.08, 0.5), (s_ * 1.0, top, 0.0), 0.08, "trussPaint")
    m.box((0, top, 0.0), (2.08, 0.1, 0.1), "trussPaint", bev=0.01)
    m.box((0, top - 0.11, 0.06), (0.9, 0.12, 0.02), "trussDark", bev=0.004)
    m.box((0, top - 0.11, 0.072), (0.8, 0.08, 0.006), "hazard", bev=0)
    return m


def build_bridge_pier():
    """A pier under the deck (every other tile): a cutwater wall from the riverbed to a cap beam."""
    m = Model("w.bridge_pier")
    pts = [(-0.82, -0.12), (0.82, -0.12)] + [(0.82 + math.cos(a) * 0.12, math.sin(a) * 0.12) for a in [-math.pi / 2 + k * math.pi / 6 for k in range(7)]][1:-1] + \
          [(0.82, 0.12), (-0.82, 0.12)] + [(-0.82 - math.cos(a) * 0.12, -math.sin(a) * 0.12) for a in [-math.pi / 2 + k * math.pi / 6 for k in range(7)]][1:-1]
    m.prism_y(pts, -0.62, -0.18, "concDark", bev=0.01)
    m.box((0, -0.16, 0), (1.9, 0.06, 0.32), "conc", bev=0.008)
    m.prism_y([(x * 1.08, z * 1.3) for x, z in pts], -0.62, -0.5, "mud", bev=0.006)
    return m


def build_bridge_end():
    """The abutment on the bank (+z faces the water): the approach slab, a concrete headwall down into the
    bank under the deck's end, straight wing walls along the deck's sides, two bollards a side."""
    m = Model("w.bridge_end")
    m.box((0, -0.01, 0.0), (2.0, 0.06, 1.0), "concDark", bev=0.006)
    m.box((0, 0.022, 0.0), (1.66, 0.006, 1.0), "tar", bev=0)
    m.box((0, -0.24, 0.47), (2.16, 0.48, 0.12), "conc", bev=0.01)
    for s_ in (-1, 1):
        m.box((s_ * 1.04, -0.12, 0.1), (0.1, 0.3, 0.84), "conc", bev=0.01)
        m.box((s_ * 1.04, 0.04, 0.1), (0.13, 0.03, 0.86), "concLite", bev=0.006)
        for z in (-0.2, 0.3):
            m.cyl((s_ * 0.9, 0.08, z), 0.032, 0.12, "concLite", n=10, bev=0.004)
    return m


def build_bridge_ruin():
    """A broken deck section: a slab snapped at one end, kerb and railing torn, rebar sticking out."""
    m = Model("w.bridge_ruin")
    pts = [(-0.98, -0.5), (0.98, -0.5), (0.98, 0.2), (0.6, 0.34), (0.2, 0.18), (-0.15, 0.42), (-0.55, 0.22), (-0.98, 0.36)]
    m.prism_y(pts, -0.08, 0.02, "concDark", bev=0.008)
    m.box((0, 0.022, -0.15), (1.6, 0.006, 0.66), "tar", bev=0)
    for x in (-0.8, -0.4, 0.0, 0.35, 0.7):
        m.push(x, -0.03, 0.3 + (x * 0.1), 0, 0.3 + x * 0.2, x * 0.4)
        m.cyl((0, 0, 0.08), 0.008, 0.18, "rust", n=5, axis="z")
        m.pop()
    m.box((0.91, 0.04, -0.15), (0.12, 0.05, 0.7), "concLite", bev=0.006)
    m.bar((0.93, 0.12, -0.45), (0.95, 0.2, 0.25), 0.022, "steel")
    m.box((-0.55, -0.14, -0.1), (0.22, 0.14, 0.8), "concDark", bev=0.008)
    return m


def build_bhut():
    """The bridge repair hut (1×1, neutral): a small concrete control house with a steel door, a warning
    sign, a cable mast."""
    m = Model("b.bhut")
    small_pad(m)
    top = wall_block(m, (0, 0.08, 0), (0.62, 0.34, 0.56), band=0.82)
    m.prism_x([(-0.31, top), (-0.31, top + 0.03), (0.31, top + 0.08), (0.31, top)], -0.33, 0.33, "roofDark", bev=0.004)
    m.box((0, 0.22, 0.285), (0.18, 0.26, 0.02), "steelDark", bev=0.004)
    m.box((0.06, 0.22, 0.298), (0.016, 0.016, 0.01), "steel", bev=0)
    m.box((0.2, 0.35, 0.29), (0.14, 0.1, 0.012), "hazard", bev=0.003)
    m.box((0.2, 0.35, 0.297), (0.1, 0.02, 0.004), "black", bev=0)
    m.windows((0.315, -0.1), (0.315, 0.1), 0.3, 1, 0.12, 0.08, "x", lit=0)
    m.cyl((-0.22, top + 0.25, -0.18), 0.01, 0.5, "dark", n=6)
    m.cyl((-0.22, top + 0.5, -0.18), 0.018, 0.02, "red", n=8)
    m.box((-0.24, 0.12, 0.3), (0.12, 0.08, 0.1), "steelDark", bev=0.008)
    return m


def build_reeds():
    """A clump of reeds and cattails for the banks."""
    m = Model("w.reeds", smooth_deg=60)
    rnd = random.Random(808)
    for k in range(16):
        a, d = rnd.uniform(0, TAU), rnd.uniform(0, 0.16)
        x, z = math.cos(a) * d, math.sin(a) * d
        h = rnd.uniform(0.22, 0.42)
        lean = (rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08))
        m.loft([[(x - 0.008, 0, z), (x + 0.008, 0, z), (x, 0, z + 0.01)], [(x + lean[0], h, z + lean[1])] * 3], "reed" if k % 3 else "reedDry", cap0=False, cap1=False)
        if k % 4 == 0:
            m.cyl((x + lean[0] * 0.8, h * 0.85, z + lean[1] * 0.8), 0.014, 0.07, "cattail", n=6)
    return m


WATERWORKS = [build_bridge_deck, build_bridge_truss, build_bridge_portal, build_bridge_pier, build_bridge_end,
              build_bridge_ruin, build_bhut, build_reeds]

PHASE1 = [build_gravy_stream, build_gravy_pool, build_powerF, build_airhq, build_depot, build_labA, build_labF, build_bunker, build_sam, build_sam_head,
          build_prism, build_flak, build_flak_head, build_wallA_post, build_wallA_bar, build_wallF_post, build_wallF_bar,
          build_derrick, build_derrick_pump, build_engineer, build_jetpack, build_conscript, build_zapper, build_dog,
          build_dog_leg, build_ifv, build_ifv_turret, build_prismtank, build_prismtank_turret, build_mirage,
          build_mirage_turret, build_v3, build_v3_rack, build_v3_rocket, build_apoc, build_apoc_turret, build_apoc_gun,
          build_flaktrack, build_harvF, build_harvF_gun, build_jet, build_blimp, build_blimp_prop, build_crate]


# =========================================================================================================
# PHASE 2 (superweapons + support): the NUG-SAT UPLINK — RA2's Spy Satellite Uplink, in our world
# =========================================================================================================
SPYSAT_DISH_AT = (-0.25, 0.4, -0.25)   # the dish's bearing (= ALR_RIG.spysat_dish in js/alertUI.js)


def build_spysat():
    """🛰️ NUG-SAT UPLINK (both armies, after their lab), 3×3: a raised round plinth carrying the big sky dish
    (spysat_dish, slewing on its bearing), steps up it toward the camera, a control block with a lit ops
    window on the two camera faces, a lattice mast with a red beacon, cable trays, a generator, floodlights."""
    m = Model("b.spysat")
    foundation(m, 3, 3)
    cx, _, cz = SPYSAT_DISH_AT
    # the plinth: a stepped drum, a team band, a railing round the top, the bearing ring
    m.lathe([(0.0, 0.1), (1.0, 0.1), (0.98, 0.17), (0.92, 0.19), (0.92, 0.3), (0.88, 0.32), (0.0, 0.32)], "concDark", c=(cx, 0, cz), n=40, bev=0.006)
    m.lathe([(0.925, 0.22), (0.925, 0.27), (0.91, 0.27), (0.91, 0.22)], "bandTeam", c=(cx, 0, cz), n=40, ring=True)
    m.lathe([(0.0, 0.32), (0.86, 0.32), (0.86, 0.325), (0.0, 0.325)], "pad", c=(cx, 0, cz), n=40)
    m.lathe([(0.0, 0.325), (0.4, 0.325), (0.4, 0.37), (0.34, 0.4), (0.0, 0.4)], "steelDark", c=(cx, 0, cz), n=32)
    m.lathe([(0.405, 0.34), (0.405, 0.36), (0.39, 0.36), (0.39, 0.34)], "hazard", c=(cx, 0, cz), n=32, ring=True)
    gap = 0.5   # the railing opens where the steps come up (toward the camera, +x +z)
    rp = [(cx + math.cos(a) * 0.84, 0.325, cz + math.sin(a) * 0.84) for a in [math.pi / 4 + gap / 2 + k / 22 * (TAU - gap) for k in range(23)]]
    m.railing(rp, 0.07, step=0.14)
    # steps up the plinth, toward the camera
    m.push(cx + math.cos(math.pi / 4) * 0.98, 0.1, cz + math.sin(math.pi / 4) * 0.98, math.pi / 4)
    for k in range(4):
        h = (k + 1) * 0.055
        m.box((0, h / 2, 0.12 - k * 0.06), (0.32, h, 0.07), "concLite", bev=0.004)
    m.pop()
    # floodlights on the plinth rim, pointing at the dish
    for a in (1.9, 3.5, 5.1):
        m.lamp(cx + math.cos(a) * 0.95, cz + math.sin(a) * 0.95, h=0.3, y0=0.1)
    # the control block, front right (the camera's side)
    bx, bz = 0.9, 0.92
    top = wall_block(m, (bx, 0.1, bz), (1.0, 0.44, 0.92), band=0.86)
    # the ops window: a raked glass band on both camera faces
    m.prism_x([(bz + 0.46, 0.27), (bz + 0.52, 0.27), (bz + 0.49, 0.43), (bz + 0.46, 0.43)], bx - 0.5, bx + 0.5, "concDark", bev=0.004)
    m.prism_x([(bz + 0.492, 0.285), (bz + 0.515, 0.285), (bz + 0.485, 0.42), (bz + 0.47, 0.42)], bx - 0.47, bx + 0.47, "glassLit", bev=0)
    m.prism_z([(bx + 0.5, 0.27), (bx + 0.56, 0.27), (bx + 0.53, 0.43), (bx + 0.5, 0.43)], bz - 0.46, bz + 0.46, "concDark", bev=0.004)
    m.prism_z([(bx + 0.532, 0.285), (bx + 0.555, 0.285), (bx + 0.525, 0.42), (bx + 0.51, 0.42)], bz - 0.43, bz + 0.43, "glassLit", bev=0)
    m.windows((bx - 0.4, bz + 0.462), (bx + 0.2, bz + 0.462), 0.18, 4, 0.08, 0.06, "z", lit=1, sill=False)
    m.box((bx + 0.33, 0.2, bz + 0.465), (0.16, 0.2, 0.012), "steelDark", bev=0)
    m.box((bx + 0.33, 0.32, bz + 0.52), (0.24, 0.014, 0.12), "steel", bev=0.004)
    m.stripes((bx + 0.2, 0.1, bz + 0.6), (bx + 0.46, 0.1, bz + 0.6), 0.104, 0.05, 5, face="y")
    # roof: AC, a small backup dish, antennas, a satellite-link dome
    m.fan_unit((bx - 0.22, top + 0.02, bz - 0.22), 0.1)
    m.vent((bx + 0.25, top + 0.02, bz - 0.25))
    m.lathe([(0.0, 0.0), (0.13, 0.0), (0.13, 0.03), (0.12, 0.08), (0.08, 0.12), (0.0, 0.135)], "white", c=(bx + 0.2, top + 0.02, bz + 0.15), n=18)
    for k in range(3):
        x = bx - 0.38 + k * 0.1
        m.cyl((x, top + 0.18, bz + 0.3), 0.006, 0.34, "dark", n=5)
        m.cyl((x, top + 0.28, bz + 0.3), 0.022, 0.006, "steel", n=8)
    m.push(bx - 0.1, top + 0.06, bz + 0.25, 2.3, -0.8)
    m.lathe([(0.0, 0.0), (0.03, 0.005), (0.06, 0.02), (0.062, 0.026), (0.0, 0.011)], "white", n=14)
    m.pop()
    # the lattice mast, back right, with a red beacon and an aircraft light
    mx, mz = 1.05, -0.95
    m.box((mx, 0.13, mz), (0.3, 0.06, 0.3), "concDark", bev=0.01)
    m.lattice((mx, 0.16, mz), (mx, 1.5, mz), 0.12, 0.04, "steelDark", bays=7, w=0.014)
    m.cyl((mx, 1.53, mz), 0.012, 0.18, "dark", n=6)
    m.ball((mx, 1.63, mz), 0.035, "red", u=10, v=6)
    m.box((mx + 0.05, 1.0, mz), (0.02, 0.16, 0.06), "white", bev=0.003)
    m.box((mx, 1.0, mz + 0.05), (0.06, 0.16, 0.02), "white", bev=0.003)
    # the generator + its fuel tank, back left
    gx, gz = -1.1, 1.0
    m.box((gx, 0.2, gz), (0.36, 0.2, 0.5), "steel", bev=0.012)
    m.box((gx, 0.31, gz), (0.37, 0.025, 0.51), "bandTeam", bev=0.004)
    for k in range(4):
        m.box((gx + 0.185, 0.2, gz - 0.18 + k * 0.12), (0.008, 0.12, 0.07), "dark", bev=0)
    m.vent((gx, 0.32, gz - 0.12), r=0.03, h=0.08)
    m.lathe([(0.0, 0.1), (0.13, 0.1), (0.13, 0.42), (0.08, 0.46), (0.0, 0.47)], "armor", c=(gx + 0.02, 0, gz - 0.55), n=14)
    m.tube([(gx + 0.02, 0.2, gz - 0.42), (gx + 0.02, 0.2, gz - 0.25)], 0.02, "steelDark", n=6)
    # cable trays: the block to the plinth, the generator to the block, the mast to the block
    m.box(((bx - 0.5 + cx + 0.65) / 2, 0.13, (bz + cz + 0.62) / 2 + 0.05), (0.42, 0.014, 0.07), "steelDark", bev=0)
    m.tube([(gx + 0.18, 0.12, gz), (bx - 0.5, 0.12, gz - 0.05)], 0.018, "dark", n=6)
    m.tube([(mx, 0.12, mz + 0.15), (mx, 0.12, bz - 0.46)], 0.018, "dark", n=6)
    for x, z in ((-1.3, -1.3), (1.32, 0.2), (-1.32, 0.3)):
        m.drum(x, z)
    return m


def build_spysat_dish():
    """The uplink's dish: origin on the bearing. A turntable and yoke, then a big parabolic reflector tipped
    up at the sky (55° from flat), team rim, a feed horn on four struts with a lit tip, a truss back frame
    and a counterweight on the yoke's tail."""
    m = Model("b.spysat_dish")
    m.cyl((0, 0.03, 0), 0.32, 0.06, "steel", n=28, bev=0.006)
    m.cyl((0, 0.07, 0), 0.24, 0.03, "steelDark", n=24)
    m.box((0, 0.14, 0), (0.22, 0.1, 0.3), "dark", bev=0.01)
    for sx in (-1, 1):
        m.prism_x([(-0.14, 0.12), (0.14, 0.12), (0.06, 0.44), (-0.06, 0.44)], sx * 0.15 - 0.022, sx * 0.15 + 0.022, "steelDark", bev=0.005)
    m.cyl((0, 0.42, 0), 0.05, 0.38, "dark", n=12, axis="x")
    # the counterweight, out behind (−z)
    m.box((0, 0.24, -0.26), (0.24, 0.14, 0.12), "concDark", bev=0.01)
    m.bar((0, 0.3, -0.2), (0, 0.42, 0), 0.03, "steelDark")
    m.push(0, 0.42, 0.04, 0, -(math.pi / 2 - 0.96))   # tipped up: the dish's axis is 55° above the horizon, facing +z
    m.push(0, 0, 0, 0, math.pi / 2)
    R, f = 0.92, 0.42
    prof = [(R * k / 10, (R * k / 10) ** 2 / (4 * f)) for k in range(11)]
    back = [(r, y - 0.024) for r, y in reversed(prof)]
    m.lathe(prof + [(R + 0.012, prof[-1][1])] + back, "concLite", n=40)
    m.lathe([(R + 0.016, prof[-1][1] - 0.026), (R + 0.016, prof[-1][1] + 0.014), (R - 0.02, prof[-1][1] + 0.014), (R - 0.02, prof[-1][1] - 0.026)], "team", n=40, ring=True)
    for k in range(1, 4):   # panel seams
        r = R * k / 4
        y = r * r / (4 * f)
        m.lathe([(r + 0.006, y + 0.004), (r + 0.006, y + 0.009), (r - 0.006, y + 0.009), (r - 0.006, y + 0.004)], "white", n=40, ring=True)
    for k in range(4):
        a = k / 4 * TAU + math.pi / 4
        m.bar((math.cos(a) * R * 0.86, prof[8][1], math.sin(a) * R * 0.86), (0, 0.5, 0), 0.016, "dark")
    m.cyl((0, 0.52, 0), 0.05, 0.1, "dark", n=12, r2=0.035)
    m.cyl((0, 0.58, 0), 0.03, 0.03, "steel", n=10)
    m.ball((0, 0.6, 0), 0.026, "light", u=10, v=6)
    # the back frame: a hub and radial trusses
    m.cyl((0, -0.06, 0), 0.12, 0.08, "steelDark", n=16)
    for k in range(8):
        a = k / 8 * TAU
        m.bar((math.cos(a) * 0.1, -0.06, math.sin(a) * 0.1), (math.cos(a) * R * 0.78, prof[8][1] - 0.035, math.sin(a) * R * 0.78), 0.016, "steelDark")
    m.pop()
    m.pop()
    return m


PHASE2 = [build_spysat, build_spysat_dish]


# =========================================================================================================
# HELICOPTERS: the NUG HAWK, SKY FRYER, TATER COPTER and HOG LIFTER, and their rotors
# Bodies: origin = the ground-contact point of the gear (y 0 = bottom of the wheels), z 0 under the mast.
# Rotors: origin = the hub. Main rotors spin about local y, tail rotors about local x. Their pivots on the
# body are the *_AT constants below (= the game's rotor placement).
# =========================================================================================================
HAWK_ROTOR_AT = (0, 0.485, 0.04)
HAWK_TAIL_AT = (0.05, 0.58, -0.69)       # on the fin's right (+x) face
LIFT_ROTOR_FRONT_AT = (0, 0.54, 0.52)
LIFT_ROTOR_REAR_AT = (0, 0.67, -0.52)
LIFT_HOOK_AT = (0, 0.04, 0)
TATER_ROTOR_AT = (0, 0.52, 0.02)
TATER_TAIL_AT = (-0.05, 0.62, -0.735)    # on the fin's left (-x) face
HOG_ROTOR_AT = (0, 0.94, 0)
HOG_TAIL_AT = (0.05, 0.72, -1.0)         # on the fin's right (+x) face


def _sup(c, e):
    return math.copysign(abs(c) ** (2.0 / e), c)


def _ring(z, hw, y0, y1, n=20, e=2.6):
    """A rounded-box (superellipse) fuselage section at z: x in ±hw, y in y0..y1."""
    cy, ry = (y0 + y1) / 2, (y1 - y0) / 2
    return [(hw * _sup(math.cos(j / n * TAU), e), cy + ry * _sup(math.sin(j / n * TAU), e), z) for j in range(n)]


def _fuse(m, secs, mat, n=20, e=2.6, bev=0.0):
    m.loft([_ring(z, hw, y0, y1, n, e) for z, hw, y0, y1 in secs], mat, bev=bev)


def _sec_at(secs, z):
    """Linear interpolation of (hw, y0, y1) along a section list (sorted either way)."""
    S = sorted(secs)
    if z <= S[0][0]:
        return S[0][1:]
    for a, b in zip(S, S[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / max(1e-9, b[0] - a[0])
            return tuple(a[k] + (b[k] - a[k]) * t for k in (1, 2, 3))
    return S[-1][1:]


def _ang(yc, y0, y1, e):
    cy, ry = (y0 + y1) / 2, (y1 - y0) / 2
    t = max(-0.995, min(0.995, (yc - cy) / ry))
    return math.asin(math.copysign(abs(t) ** (e / 2), t))


def _arc(z, hw, y0, y1, a0, a1, k, e, d=0.0):
    cy, ry = (y0 + y1) / 2, (y1 - y0) / 2
    return [((hw + d) * _sup(math.cos(a0 + (a1 - a0) * j / k), e), cy + (ry + d) * _sup(math.sin(a0 + (a1 - a0) * j / k), e), z) for j in range(k + 1)]


def _skin(m, secs, z0, z1, mat, ycut, upper=True, e=2.6, t=0.005, nz=6, k=12, solid=False):
    """A shell over the part of a fuselage above (upper) / below ycut, from z0 to z1: canopy glazing, a
    paint band, a roof or belly. solid=True: the segment itself (arc closed by its chord), not a skin."""
    rings = []
    for i in range(nz + 1):
        z = z0 + (z1 - z0) * i / nz
        hw, y0, y1 = _sec_at(secs, z)
        a = _ang(ycut, y0, y1, e)
        a0, a1 = (a, math.pi - a) if upper else (math.pi - a, TAU + a)
        if solid:
            rings.append(_arc(z, hw, y0, y1, a0, a1, k, e))
        else:
            rings.append(_arc(z, hw, y0, y1, a0, a1, k, e, t) + list(reversed(_arc(z, hw, y0, y1, a0, a1, k, e, -t))))
    m.loft(rings, mat)


def _frame(m, secs, z0, z1, ang, mat="dark", e=2.6, r=0.005, nz=6, d=0.006):
    """A canopy frame bar running along z at one angle round the section."""
    pts = []
    for i in range(nz + 1):
        z = z0 + (z1 - z0) * i / nz
        hw, y0, y1 = _sec_at(secs, z)
        pts.append(_arc(z, hw, y0, y1, ang, ang, 1, e, d)[0])
    m.tube(pts, r, mat, n=5)


def _hoop(m, secs, z, ycut, mat="dark", e=2.6, r=0.005, d=0.006, upper=True, k=12):
    """A frame / band hoop round the section at z above (or below) ycut."""
    hw, y0, y1 = _sec_at(secs, z)
    a = _ang(ycut, y0, y1, e)
    a0, a1 = (a, math.pi - a) if upper else (math.pi - a, TAU + a)
    m.tube(_arc(z, hw, y0, y1, a0, a1, k, e, d), r, mat, n=5)


def _rotor(m, nb, R, chord, hub, tip="white", droop=0.035, feather=0.08, blade="dark", phase=0.0, links=True):
    """A rotor about local y: hub, swashplate + pitch links, blade grips, drooped blades with tip stripes."""
    m.cyl((0, -hub * 0.55, 0), hub * 0.42, hub * 0.9, "steelDark", n=8)                   # mast stub
    if links:
        m.cyl((0, -hub * 0.85, 0), hub * 0.85, hub * 0.18, "steel", n=12)                  # swashplate
    m.cyl((0, 0, 0), hub, hub * 0.5, "steelDark", n=12)                                    # hub plate
    m.cyl((0, hub * 0.4, 0), hub * 0.72, hub * 0.32, "steel", n=12, r2=hub * 0.5)          # hub cap
    m.ball((0, hub * 0.6, 0), hub * 0.42, "steel", u=8, v=4, s=(1, 0.6, 1))
    t = max(0.008, chord * 0.2)
    for k in range(nb):
        a = phase + k / nb * TAU
        m.push(0, 0, 0, a, 0, -droop)
        m.box((hub * 1.15, 0, 0), (hub * 0.9, t * 2.2, chord * 0.7), "steel", bev=0)       # grip
        m.cyl((hub * 0.85, 0, 0), t * 1.3, t * 3.2, "dark", n=5, cap=R > 0.3)              # hinge bolt
        m.push(0, 0, 0, 0, feather)
        L = R - hub * 1.5
        m.box((hub * 1.5 + L / 2, 0, 0), (L, t, chord), blade, bev=t * 0.3 if R > 0.3 else 0)
        m.box((R - 0.035, 0, 0), (0.05, t + 0.002, chord + 0.002), tip, bev=0)
        m.pop()
        m.pop()
        if links:
            m.push(0, 0, 0, a + 0.35 / nb * TAU * 0.5)
            m.bar((hub * 0.75, -hub * 0.8, 0), (hub * 0.9, -t, 0), 0.006, "steelDark")
            m.pop()
    return m


def _tail_rotor(m, nb, R, chord, hub, side=1, tip="hazard", phase=0.0):
    """A tail rotor spinning about local x (blades in the yz plane); its hub cap faces outward (side)."""
    m.push(0, 0, 0, 0, 0, -side * math.pi / 2)   # local y -> world ±x
    _rotor(m, nb, R, chord, hub, tip=tip, droop=0.0, feather=0.18, phase=phase, links=False)
    m.pop()
    return m


def _hwheel(m, x, y, z, r, w, rim="steelDark"):
    """A light aircraft wheel on an axle along x: a rounded tyre, a hubcap, an axle nut."""
    sg = 1 if x >= 0 else -1
    m.push(x, y, z, 0, 0, math.pi / 2)
    m.lathe([(r * 0.6, -w / 2), (r * 0.92, -w / 2), (r, -w * 0.2), (r, w * 0.2), (r * 0.92, w / 2), (r * 0.6, w / 2)], "rubber", n=14, ring=True)
    m.pop()
    m.cyl((x + sg * w * 0.2, y, z), r * 0.62, w * 0.62, rim, n=12, axis="x")
    m.cyl((x + sg * w * 0.5, y, z), r * 0.25, w * 0.12, "dark", n=6, axis="x")


def _strut(m, a, b, r=0.009, mat="steelDark"):
    m.tube([a, b], r, mat, n=6)


def _nav_lights(m, x, y, z):
    m.box((x, y, z), (0.01, 0.014, 0.024), "glassLit", bev=0)
    m.box((-x, y, z), (0.01, 0.014, 0.024), "red", bev=0)


def _star(m, c, r, x0, x1, mat="team", rot=0.0):
    """A five-point star on a side (in the zy plane), extruded x0..x1."""
    cz, cy = c
    pts = []
    for k in range(10):
        a = rot + math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.42
        pts.append((cz + math.cos(a) * rr, cy + math.sin(a) * rr))
    m.prism_x(pts, x0, x1, mat, bev=0)


# ---- NUG HAWK (Alliance troop carrier) ------------------------------------------------------------------
HAWK_NOSE = [(0.375, 0.02, 0.15, 0.19), (0.36, 0.07, 0.11, 0.235), (0.33, 0.105, 0.08, 0.275), (0.28, 0.13, 0.065, 0.315),
             (0.2, 0.14, 0.06, 0.345), (0.1, 0.14, 0.06, 0.36)]
HAWK_REAR = [(-0.14, 0.14, 0.06, 0.36), (-0.2, 0.13, 0.075, 0.355), (-0.26, 0.1, 0.11, 0.345), (-0.31, 0.065, 0.17, 0.335),
             (-0.34, 0.05, 0.21, 0.33)]
HAWK_BOOM = [(-0.3, 0.05, 0.22, 0.33), (-0.45, 0.036, 0.25, 0.322), (-0.6, 0.028, 0.265, 0.316), (-0.71, 0.022, 0.275, 0.31)]
HAWK_ALL = HAWK_NOSE + HAWK_REAR


def build_hawk():
    """🚁 NUG HAWK (Alliance): a utility troop helicopter. Glazed nose, open side cargo doors with door
    gunners, twin engine nacelles, a swept team fin with the tail rotor (u.hawk_tail) on its right, a
    stabilator, two main wheels + a tail wheel. Main rotor (u.hawk_rotor) at HAWK_ROTOR_AT."""
    m = Model("u.hawk", smooth_deg=40)
    E = 2.6
    _fuse(m, HAWK_NOSE, "allyArmor", e=E)
    _fuse(m, HAWK_REAR, "allyArmor", e=E)
    _fuse(m, HAWK_BOOM, "allyArmor", n=14, e=2.3)
    # the cabin between the bulkheads: roof + belly (the sides are the open doors), dark interior
    cab = [(0.1, 0.14, 0.06, 0.36), (-0.14, 0.14, 0.06, 0.36)]
    _skin(m, cab, -0.14, 0.1, "allyArmor", 0.31, True, E, nz=1, solid=True)
    _skin(m, cab, -0.14, 0.1, "allyArmor", 0.11, False, E, nz=1, solid=True)
    m.box((0, 0.21, -0.02), (0.2, 0.22, 0.24), "black", bev=0)
    for s in (-1, 1):
        # door frame + the slid-back door's rail
        m.box((s * 0.141, 0.312, -0.02), (0.012, 0.012, 0.25), "allyDark", bev=0)
        m.box((s * 0.141, 0.108, -0.02), (0.012, 0.012, 0.25), "allyDark", bev=0)
        for z in (0.1, -0.14):
            m.box((s * 0.141, 0.21, z), (0.014, 0.21, 0.012), "allyDark", bev=0)
        m.box((s * 0.15, 0.325, -0.22), (0.008, 0.008, 0.16), "steelDark", bev=0)
        # door gunner (helmet, torso) + his gun on a pintle
        m.box((s * 0.11, 0.2, 0.05), (0.04, 0.07, 0.045), "allyDark", bev=0.006)
        m.ball((s * 0.11, 0.255, 0.05), 0.022, "paintWhite", u=10, v=6)
        m.box((s * 0.123, 0.255, 0.064), (0.012, 0.01, 0.006), "glass", bev=0)
        m.bar((s * 0.12, 0.13, 0.07), (s * 0.13, 0.215, 0.07), 0.008, "steelDark")
        m.bar((s * 0.11, 0.222, 0.07), (s * 0.2, 0.218, 0.085), 0.01, "black")
        m.cyl((s * 0.125, 0.225, 0.07), 0.012, 0.03, "dark", n=6, axis="x")
        # troop seats facing out (canvas backs, steel frames) further aft
        for z in (-0.04, -0.1):
            m.box((s * 0.075, 0.2, z), (0.012, 0.08, 0.045), "sandDark", bev=0.003)
            m.box((s * 0.09, 0.155, z), (0.035, 0.008, 0.045), "steelDark", bev=0)
        m.box((s * 0.095, 0.18, -0.07), (0.02, 0.05, 0.03), "olive", bev=0.004)   # a nugget trooper's kit bag
        # cockpit door + crew door step, window in the rear fuselage
        m.box((s * 0.145, 0.07, 0.04), (0.02, 0.006, 0.06), "steelDark", bev=0)
        m.push(s * 0.124, 0.27, -0.205, s * 0.32)
        m.box((0, 0, 0), (0.006, 0.04, 0.045), "glass", bev=0)
        m.pop()
        # panel lines
        m.box((s * 0.139, 0.2, 0.17), (0.003, 0.2, 0.004), "allyDark", bev=0)
        _nav_lights(m, 0.142, 0.13, 0.13) if s > 0 else None
    # the glazed nose: canopy skin, frames, a team nose band below
    _skin(m, HAWK_NOSE, 0.15, 0.345, "glass", 0.185, True, E, nz=6)
    for ang in (math.pi / 2, 0.55, math.pi - 0.55):
        _frame(m, HAWK_NOSE, 0.15, 0.345, ang, "allyDark", E)
    for z in (0.15, 0.255):
        _hoop(m, HAWK_NOSE, z, 0.185, "allyDark", E)
    _skin(m, HAWK_NOSE, 0.285, 0.322, "team", 0.18, False, E, nz=3)
    _skin(m, HAWK_ALL, 0.12, 0.14, "bandTeam", 0.13, False, E, nz=1, t=0.004)
    m.box((0, 0.075, 0.27), (0.04, 0.03, 0.04), "dark", bev=0.006)
    m.cyl((0, 0.065, 0.29), 0.014, 0.008, "light", n=10, axis="z")             # searchlight
    m.bar((0.0, 0.24, 0.355), (0, 0.24, 0.42), 0.006, "steelDark")             # pitot probe
    # the roof: transmission fairing, twin nacelles with intakes + exhausts, mast
    m.prism_x([(0.22, 0.34), (0.16, 0.4), (-0.12, 0.42), (-0.24, 0.37), (-0.26, 0.345)], -0.07, 0.07, "allyArmor", bev=0.016, seg=2)
    m.box((0, 0.425, 0.04), (0.11, 0.04, 0.16), "allyDark", bev=0.012)
    m.cyl((0, 0.455, HAWK_ROTOR_AT[2]), 0.022, 0.06, "steelDark", n=10)
    for s in (-1, 1):
        x = s * 0.085
        m.cyl((x, 0.395, 0.04), 0.042, 0.28, "allyArmor", n=14, axis="z", bev=0.006)
        m.cyl((x, 0.395, 0.18), 0.043, 0.012, "allyDark", n=14, axis="z")
        m.cyl((x, 0.395, 0.186), 0.032, 0.008, "black", n=12, axis="z")
        m.cyl((x, 0.395, 0.192), 0.012, 0.02, "steel", n=8, axis="z", r2=0.004)
        m.box((x, 0.437, 0.04), (0.03, 0.006, 0.14), "allyDark", bev=0)           # cowl latch strip
        m.tube([(x, 0.395, -0.09), (s * 0.12, 0.4, -0.15), (s * 0.15, 0.41, -0.18)], 0.026, "dark", n=10)
        m.cyl((s * 0.152, 0.411, -0.182), 0.021, 0.006, "black", n=10, axis="x")
        m.box((s * 0.13, 0.36, -0.02), (0.01, 0.03, 0.12), "allyDark", bev=0)    # cowl seam
    m.box((0.0, 0.47, -0.2), (0.006, 0.04, 0.03), "dark", bev=0)                 # antenna
    # the tail: fin (team-topped), stabilator, tail-rotor gearbox, tail wheel, beacon
    fin = [(-0.58, 0.3), (-0.645, 0.66), (-0.715, 0.66), (-0.72, 0.3), (-0.66, 0.29)]
    m.prism_x(fin, -0.014, 0.014, "allyArmor", bev=0.005)
    m.prism_x([(-0.6144, 0.49), (-0.645, 0.66), (-0.715, 0.66), (-0.7178, 0.49)], -0.016, 0.016, "team", bev=0)
    m.prism_x([(-0.6, 0.39), (-0.61, 0.45), (-0.63, 0.45), (-0.625, 0.39)], -0.0155, 0.0155, "allyDark", bev=0)
    m.cyl((0.022, HAWK_TAIL_AT[1], HAWK_TAIL_AT[2]), 0.022, 0.024, "steelDark", n=10, axis="x", bev=0.003)
    m.cyl((0.006, HAWK_TAIL_AT[1], HAWK_TAIL_AT[2]), 0.028, 0.012, "allyDark", n=10, axis="x")
    m.prism_y([(-0.15, -0.62), (0.15, -0.62), (0.15, -0.66), (0.03, -0.68), (-0.03, -0.68), (-0.15, -0.66)], 0.296, 0.31, "allyArmor", bev=0.004)
    for s in (-1, 1):
        m.box((s * 0.13, 0.303, -0.64), (0.04, 0.016, 0.042), "team", bev=0)
    m.ball((0, 0.665, -0.68), 0.01, "red", u=8, v=5)
    m.ball((0, 0.325, -0.4), 0.01, "red", u=8, v=5)
    m.box((0, 0.27, -0.45), (0.02, 0.03, 0.03), "allyDark", bev=0.004)
    _strut(m, (0, 0.26, -0.45), (0, 0.03, -0.49), 0.008)
    m.box((0, 0.03, -0.49), (0.04, 0.01, 0.01), "steelDark", bev=0)
    _hwheel(m, 0.0, 0.028, -0.49, 0.028, 0.022)
    # main gear: wheels on trailing arms + a shock strut to the fuselage side
    for s in (-1, 1):
        _hwheel(m, s * 0.17, 0.042, 0.19, 0.042, 0.032)
        _strut(m, (s * 0.155, 0.042, 0.19), (s * 0.12, 0.08, 0.13), 0.009)
        _strut(m, (s * 0.155, 0.042, 0.19), (s * 0.145, 0.15, 0.21), 0.007, "steel")
        m.box((s * 0.142, 0.15, 0.21), (0.014, 0.03, 0.03), "allyDark", bev=0.003)
    return m


def build_hawk_rotor():
    """The NUG HAWK's main rotor: 4 drooped blades, radius 0.66 (spun about y)."""
    m = Model("u.hawk_rotor")
    _rotor(m, 4, 0.66, 0.06, 0.045, tip="white", phase=math.pi / 4)
    return m


def build_hawk_tail():
    """The NUG HAWK's tail rotor: 4 blades, radius 0.12, spinning about x; the hub cap faces +x."""
    m = Model("u.hawk_tail")
    _tail_rotor(m, 4, 0.12, 0.026, 0.018, side=1, tip="white", phase=math.pi / 4)
    return m


# ---- SKY FRYER (Alliance heavy lifter) ------------------------------------------------------------------
LIFT_SECS = [(0.7, 0.05, 0.17, 0.26), (0.685, 0.11, 0.12, 0.315), (0.645, 0.145, 0.095, 0.365), (0.58, 0.16, 0.085, 0.4),
             (0.5, 0.16, 0.08, 0.42), (-0.38, 0.16, 0.08, 0.42), (-0.45, 0.16, 0.11, 0.42), (-0.55, 0.155, 0.17, 0.42),
             (-0.62, 0.15, 0.22, 0.42)]


def build_lift():
    """🚁 SKY FRYER (Alliance): a tandem-rotor heavy lifter. A long boxy fuselage with round windows, a glazed
    nose, the front pylon over the cockpit and the tall rear pylon with its twin engines, a closed loading
    ramp, sponsons, four wheels, team stripes, and the cargo hook at LIFT_HOOK_AT (the load hangs there).
    u.lift_rotor turns at LIFT_ROTOR_FRONT_AT and LIFT_ROTOR_REAR_AT."""
    m = Model("u.lift", smooth_deg=40)
    E = 3.2
    _fuse(m, LIFT_SECS, "allyArmor", n=22, e=E)
    # nose glazing + chin windows + frames
    _skin(m, LIFT_SECS, 0.56, 0.69, "glass", 0.215, True, E, nz=5, k=14)
    for ang in (math.pi / 2, 0.45, math.pi - 0.45):
        _frame(m, LIFT_SECS, 0.56, 0.69, ang, "allyDark", E, nz=5)
    _hoop(m, LIFT_SECS, 0.56, 0.215, "allyDark", E, k=14)
    _hoop(m, LIFT_SECS, 0.63, 0.215, "allyDark", E, k=14)
    for s in (-1, 1):
        m.push(s * 0.08, 0.135, 0.665, 0, -0.55)
        m.box((0, 0, 0), (0.06, 0.05, 0.006), "glass", bev=0)
        m.pop()
    _skin(m, LIFT_SECS, 0.5, 0.53, "team", 0.2, False, E, nz=1, k=14)
    # the pylons (front over the cockpit, rear tall) and the drive-shaft tunnel between
    m.prism_x([(0.32, 0.40), (0.32, 0.43), (0.42, 0.495), (0.6, 0.495), (0.665, 0.4), (0.665, 0.34)], -0.09, 0.09, "allyArmor", bev=0.018, seg=2)
    m.prism_x([(-0.22, 0.40), (-0.22, 0.43), (-0.34, 0.57), (-0.42, 0.625), (-0.6, 0.625), (-0.64, 0.56), (-0.64, 0.4)], -0.1, 0.1, "allyArmor", bev=0.018, seg=2)
    m.box((0, 0.44, 0.04), (0.11, 0.05, 0.62), "allyDark", bev=0.014)
    for k in range(7):
        m.box((0, 0.466, -0.2 + k * 0.08), (0.112, 0.004, 0.006), "dark", bev=0)
    m.cyl((0, 0.515, LIFT_ROTOR_FRONT_AT[2]), 0.024, 0.04, "steelDark", n=10)
    m.cyl((0, 0.645, LIFT_ROTOR_REAR_AT[2]), 0.026, 0.05, "steelDark", n=10)
    m.box((0, 0.596, -0.51), (0.204, 0.022, 0.2), "team", bev=0)
    m.box((0, 0.47, 0.5), (0.184, 0.018, 0.16), "team", bev=0)
    for s in (-1, 1):
        m.box((s * 0.1, 0.52, -0.42), (0.006, 0.06, 0.08), "black", bev=0)        # pylon grille
        for k in range(4):
            m.box((s * 0.103, 0.495 + k * 0.016, -0.42), (0.004, 0.004, 0.08), "steelDark", bev=0)
        m.box((s * 0.091, 0.45, 0.5), (0.004, 0.03, 0.06), "black", bev=0)
    m.ball((0, 0.632, -0.62), 0.012, "red", u=8, v=5)
    # twin engines on the rear pylon flanks
    for s in (-1, 1):
        x = s * 0.185
        m.cyl((x, 0.5, -0.44), 0.056, 0.3, "allyArmor", n=16, axis="z", bev=0.006)
        m.cyl((x, 0.5, -0.285), 0.058, 0.014, "allyDark", n=16, axis="z")
        m.cyl((x, 0.5, -0.29), 0.042, 0.014, "black", n=14, axis="z")
        m.cyl((x, 0.5, -0.282), 0.018, 0.03, "steel", n=10, axis="z", r2=0.004)
        m.cyl((x, 0.5, -0.61), 0.046, 0.05, "dark", n=14, axis="z", r2=0.036)
        m.cyl((x, 0.5, -0.637), 0.032, 0.006, "black", n=12, axis="z")
        m.box((x, 0.5, -0.44), (0.114, 0.012, 0.03), "team", bev=0)
        m.box((x, 0.557, -0.44), (0.02, 0.006, 0.2), "allyDark", bev=0)
        m.box((s * 0.13, 0.48, -0.44), (0.05, 0.03, 0.12), "allyDark", bev=0.008)   # mount pylon
    # sponsons, round windows, side stripe, doors, ramp
    for s in (-1, 1):
        m.prism_x([(-0.32, 0.09), (-0.32, 0.16), (0.2, 0.2), (0.36, 0.15), (0.38, 0.1), (0.36, 0.09)], s * 0.14, s * 0.225, "allyArmor", bev=0.02, seg=2)
        m.box((s * 0.226, 0.13, -0.05), (0.004, 0.035, 0.4), "allyDark", bev=0)
        m.cyl((s * 0.226, 0.165, 0.12), 0.012, 0.006, "steel", n=8, axis="x")
        for k in range(6):
            z = -0.3 + k * 0.13
            m.cyl((s * 0.16, 0.3, z), 0.027, 0.012, "allyDark", n=12, axis="x")
            m.cyl((s * 0.165, 0.3, z), 0.02, 0.008, "glassLit" if k % 3 == 1 else "glass", n=12, axis="x")
        m.box((s * 0.161, 0.235, 0.06), (0.006, 0.022, 0.86), "team", bev=0)
        m.box((s * 0.161, 0.37, 0.04), (0.004, 0.004, 0.86), "allyDark", bev=0)
        for z in (-0.2, 0.25):
            m.box((s * 0.161, 0.3, z - 0.065), (0.004, 0.12, 0.003), "allyDark", bev=0)
        _nav_lights(m, 0.165, 0.33, 0.55) if s > 0 else None
    m.box((0.161, 0.29, 0.44), (0.006, 0.17, 0.08), "allyDark", bev=0)          # crew door (right)
    m.box((0.165, 0.33, 0.44), (0.004, 0.04, 0.04), "glass", bev=0)
    m.box((0.164, 0.25, 0.47), (0.004, 0.012, 0.008), "steel", bev=0)
    m.push(0, 0.08, -0.38, 0, math.atan2(0.14, 0.24))
    m.box((0, -0.006, -0.14), (0.27, 0.01, 0.27), "allyDark", bev=0.004)
    m.cyl((0, -0.006, 0.0), 0.012, 0.28, "steelDark", n=8, axis="x")
    for x in (-0.07, 0.07):
        m.box((x, -0.013, -0.14), (0.02, 0.006, 0.25), "steelDark", bev=0)
    m.pop()
    m.box((0, 0.32, -0.622), (0.26, 0.18, 0.006), "allyDark", bev=0)             # rear bulkhead + a lamp
    m.box((0, 0.39, -0.627), (0.04, 0.012, 0.006), "light", bev=0)
    # belly: the cargo hook (hatch, block, hook), antennas, searchlight
    m.box((0, 0.079, 0.0), (0.09, 0.006, 0.09), "dark", bev=0)
    m.box((0, 0.062, 0.0), (0.035, 0.03, 0.03), "steelDark", bev=0.004)
    m.torus((0, 0.042, 0.0), 0.011, 0.004, "hazard", n=10, m=5, axis="z")
    m.box((0, 0.075, 0.6), (0.05, 0.02, 0.04), "dark", bev=0.005)
    m.cyl((0, 0.066, 0.61), 0.013, 0.006, "light", n=10)
    m.box((0, 0.065, -0.2), (0.004, 0.03, 0.04), "dark", bev=0)
    # four wheels: twin nose wheels on a fork, mains under the sponsons
    for s in (-1, 1):
        _hwheel(m, s * 0.175, 0.045, 0.42, 0.045, 0.034)
        _strut(m, (s * 0.158, 0.045, 0.42), (s * 0.13, 0.1, 0.42), 0.01)
        _strut(m, (s * 0.158, 0.045, 0.42), (s * 0.12, 0.09, 0.47), 0.007, "steel")
        _hwheel(m, s * 0.19, 0.045, -0.26, 0.045, 0.036)
        _strut(m, (s * 0.19, 0.045, -0.26), (s * 0.19, 0.1, -0.26), 0.012)
    return m


def build_lift_rotor():
    """The SKY FRYER's rotor: 3 broad drooped blades, radius 0.6 (both pylons; spun about y, the two counter-rotate)."""
    m = Model("u.lift_rotor")
    _rotor(m, 3, 0.6, 0.068, 0.05, tip="white")
    return m


# ---- TATER COPTER (Federation troop carrier / gunship) --------------------------------------------------
TATER_SECS = [(0.425, 0.03, 0.14, 0.2), (0.4, 0.08, 0.1, 0.245), (0.36, 0.112, 0.08, 0.275), (0.3, 0.13, 0.075, 0.3),
              (0.22, 0.14, 0.075, 0.345), (0.12, 0.15, 0.08, 0.385), (-0.05, 0.155, 0.08, 0.4), (-0.2, 0.14, 0.1, 0.39),
              (-0.28, 0.1, 0.16, 0.37), (-0.34, 0.065, 0.22, 0.355)]
TATER_BOOM = [(-0.3, 0.06, 0.235, 0.35), (-0.5, 0.042, 0.27, 0.345), (-0.68, 0.03, 0.29, 0.345), (-0.765, 0.024, 0.3, 0.345)]


def build_tater():
    """🚁 TATER COPTER (Federation): a bulbous troop-carrying gunship. Stepped tandem bubble canopies, a chin
    gun, stub wings with rocket pods, big round engine intakes on top, an exhaust each side, fixed wheels,
    a team star on the nose and a team tail band; tail rotor (u.tater_tail) on the fin's left."""
    m = Model("u.tater", smooth_deg=40)
    E = 2.3
    _fuse(m, TATER_SECS, "olive", n=20, e=E)
    _fuse(m, TATER_BOOM, "olive", n=14, e=2.2)
    # tandem bubbles: the gunner low in front, the pilot higher behind
    for cy, cz, r, sy, sz in ((0.245, 0.335, 0.072, 0.78, 1.15), (0.33, 0.205, 0.08, 0.72, 1.3)):
        m.ball((0, cy, cz), r, "glass", u=12, v=7, s=(1.0, sy, sz))
        ring = [(math.cos(a) * r * 1.02, cy, cz + math.sin(a) * r * sz * 1.02) for a in [k / 12 * TAU for k in range(13)]]
        m.tube(ring, 0.006, "oliveDark", n=5)
        m.tube([(0, cy + math.sin(a) * r * sy * 1.03, cz + math.cos(a) * r * sz * 1.03) for a in [k / 6 * math.pi for k in range(7)]], 0.005, "oliveDark", n=5)
        m.tube([(math.cos(a) * r * 1.03, cy + math.sin(a) * r * sy * 1.03, cz) for a in [k / 6 * math.pi for k in range(7)]], 0.005, "oliveDark", n=5)
    m.box((0, 0.3, 0.27), (0.11, 0.03, 0.05), "oliveDark", bev=0.008)                # canopy step
    # chin gun turret + nose sensors, team star on the nose sides
    m.ball((0, 0.085, 0.38), 0.032, "dark", u=10, v=6)
    m.cyl((0, 0.075, 0.43), 0.007, 0.08, "black", n=6, axis="z")
    m.box((0.045, 0.1, 0.395), (0.02, 0.02, 0.03), "dark", bev=0.004)
    m.box((0.045, 0.1, 0.411), (0.014, 0.014, 0.004), "glassLit", bev=0)
    m.bar((-0.05, 0.18, 0.4), (-0.06, 0.18, 0.48), 0.006, "steelDark")              # air-data boom
    for s in (-1, 1):
        hw, y0, y1 = _sec_at(TATER_SECS, 0.24)
        _star(m, (0.215, 0.16), 0.036, s * (hw - 0.012), s * (hw + 0.004))
    # the cabin: doors, windows, step; panel lines
    for s in (-1, 1):
        x = s * 0.152
        m.box((x, 0.21, -0.02), (0.008, 0.2, 0.12), "oliveDark", bev=0.003)
        m.box((s * 0.155, 0.22, 0.02), (0.006, 0.04, 0.035), "glass", bev=0)
        m.box((s * 0.155, 0.22, -0.06), (0.006, 0.04, 0.035), "glass", bev=0)
        m.box((s * 0.155, 0.16, 0.035), (0.004, 0.008, 0.016), "steel", bev=0)
        for z in (-0.13, -0.19):
            m.box((s * 0.145, 0.26, z), (0.006, 0.03, 0.03), "glass", bev=0)
        m.box((s * 0.15, 0.11, -0.02), (0.02, 0.006, 0.07), "steelDark", bev=0)
        m.box((s * 0.15, 0.3, 0.1), (0.004, 0.16, 0.004), "oliveDark", bev=0)
        m.box((s * 0.15, 0.32, -0.1), (0.004, 0.004, 0.18), "oliveDark", bev=0)
    _nav_lights(m, 0.32, 0.18, 0.0)
    # stub wings (anhedral) with rocket pods and tip rails
    for s in (-1, 1):
        m.push(s * 0.13, 0.235, -0.03, 0, 0, -s * 0.16)
        m.prism_y([(0, 0.075), (s * 0.2, 0.05), (s * 0.2, -0.04), (0, -0.07)], -0.012, 0.012, "olive", bev=0.006)
        m.box((s * 0.2, -0.0, 0.005), (0.012, 0.03, 0.1), "oliveDark", bev=0.003)
        for xo in (0.08, 0.16):
            px = s * xo
            m.box((px, -0.025, 0.005), (0.014, 0.03, 0.05), "oliveDark", bev=0.003)
            m.cyl((px, -0.06, 0.01), 0.03, 0.15, "oliveDark", n=12, axis="z")
            m.cyl((px, -0.06, 0.087), 0.03, 0.008, "armorDark", n=12, axis="z", r2=0.024)
            m.cyl((px, -0.06, 0.09), 0.023, 0.004, "black", n=10, axis="z")
            for k in range(5):
                a = k / 5 * TAU
                m.cyl((px + math.cos(a) * 0.014, -0.06 + math.sin(a) * 0.014, 0.093), 0.0045, 0.004, "sauce", n=4, axis="z", cap=False)
            m.cyl((px, -0.06, -0.07), 0.026, 0.02, "armorDark", n=12, axis="z", r2=0.012)
            m.box((px, -0.06, 0.01), (0.062, 0.006, 0.02), "team", bev=0)
        m.pop()
    # engines: two nacelles on the roof, big round intakes with dust domes, exhausts out the sides
    m.prism_x([(0.17, 0.37), (0.12, 0.42), (-0.16, 0.43), (-0.28, 0.38), (-0.3, 0.355)], -0.075, 0.075, "olive", bev=0.016, seg=2)
    m.cyl((0, 0.47, TATER_ROTOR_AT[2]), 0.035, 0.06, "oliveDark", n=12, r2=0.024)
    m.cyl((0, 0.49, TATER_ROTOR_AT[2]), 0.02, 0.04, "steelDark", n=10)
    for s in (-1, 1):
        x = s * 0.085
        m.cyl((x, 0.43, 0.0), 0.05, 0.26, "olive", n=16, axis="z", bev=0.006)
        m.cyl((x, 0.43, 0.135), 0.054, 0.016, "steelDark", n=16, axis="z")
        m.cyl((x, 0.43, 0.14), 0.04, 0.008, "black", n=14, axis="z")
        m.ball((x, 0.43, 0.14), 0.026, "steel", u=10, v=6, s=(1, 1, 0.9))
        m.box((x, 0.481, -0.02), (0.03, 0.006, 0.16), "oliveDark", bev=0)
        m.box((s * 0.13, 0.43, 0.0), (0.012, 0.03, 0.1), "black", bev=0)        # louvres
        for k in range(3):
            m.box((s * 0.137, 0.42 + k * 0.01, 0.0), (0.004, 0.003, 0.1), "oliveDark", bev=0)
        m.tube([(x, 0.43, -0.12), (s * 0.13, 0.425, -0.17), (s * 0.18, 0.41, -0.2)], 0.03, "dark", n=10)
        m.cyl((s * 0.182, 0.41, -0.202), 0.024, 0.006, "black", n=10, axis="x")
        m.box((s * 0.15, 0.4, -0.19), (0.04, 0.012, 0.03), "armorDark", bev=0)
    m.box((0.0, 0.45, -0.22), (0.006, 0.05, 0.03), "dark", bev=0)
    m.ball((0, 0.36, -0.3), 0.01, "red", u=8, v=5)
    # the tail: team band, fin (team-tipped) with the gearbox on its left, stabiliser, tail skid
    _skin(m, TATER_BOOM, -0.55, -0.6, "team", 0.27, True, 2.2, nz=1, k=10, t=0.004)
    _skin(m, TATER_BOOM, -0.55, -0.6, "team", 0.36, False, 2.2, nz=1, k=10, t=0.004)
    fin = [(-0.64, 0.31), (-0.7, 0.71), (-0.77, 0.71), (-0.775, 0.3), (-0.7, 0.3)]
    m.prism_x(fin, -0.014, 0.014, "olive", bev=0.005)
    m.prism_x([(-0.6912, 0.65), (-0.7, 0.71), (-0.77, 0.71), (-0.771, 0.65)], -0.016, 0.016, "team", bev=0)
    m.cyl((-0.022, TATER_TAIL_AT[1], TATER_TAIL_AT[2]), 0.024, 0.024, "oliveDark", n=10, axis="x", bev=0.003)
    m.prism_y([(-0.14, -0.6), (0.14, -0.6), (0.14, -0.64), (0.03, -0.66), (-0.03, -0.66), (-0.14, -0.64)], 0.3, 0.314, "olive", bev=0.004)
    m.ball((0, 0.715, -0.74), 0.01, "red", u=8, v=5)
    _strut(m, (0, 0.3, -0.7), (0, 0.24, -0.76), 0.007)
    # fixed gear: twin nose wheels, mains on splayed legs
    m.box((0, 0.085, 0.29), (0.04, 0.03, 0.04), "oliveDark", bev=0.005)
    _strut(m, (0, 0.085, 0.29), (0, 0.032, 0.3), 0.008)
    for s in (-1, 1):
        _hwheel(m, s * 0.03, 0.032, 0.3, 0.032, 0.022)
        _hwheel(m, s * 0.21, 0.045, -0.08, 0.045, 0.034)
        _strut(m, (s * 0.193, 0.045, -0.08), (s * 0.13, 0.13, -0.08), 0.01)
        _strut(m, (s * 0.193, 0.045, -0.08), (s * 0.13, 0.11, -0.15), 0.007)
        _strut(m, (s * 0.19, 0.06, -0.08), (s * 0.2, 0.215, -0.04), 0.008, "steel")
    return m


def build_tater_rotor():
    """The TATER COPTER's main rotor: 5 drooped blades, radius 0.7 (spun about y)."""
    m = Model("u.tater_rotor")
    _rotor(m, 5, 0.7, 0.058, 0.05, tip="hazard")
    return m


def build_tater_tail():
    """The TATER COPTER's tail rotor: 3 blades, radius 0.13, spinning about x; the hub cap faces -x."""
    m = Model("u.tater_tail")
    _tail_rotor(m, 3, 0.13, 0.034, 0.02, side=-1, tip="hazard")
    return m


# ---- HOG LIFTER (Federation flying crane) ---------------------------------------------------------------
HOG_CAB = [(0.79, 0.05, 0.6, 0.665), (0.76, 0.1, 0.535, 0.705), (0.69, 0.13, 0.505, 0.735), (0.58, 0.13, 0.505, 0.745),
           (0.48, 0.12, 0.53, 0.745), (0.4, 0.11, 0.55, 0.745)]
HOG_SPINE = [(0.42, 0.11, 0.55, 0.745), (-0.45, 0.11, 0.55, 0.745), (-0.55, 0.08, 0.6, 0.735), (-0.62, 0.06, 0.63, 0.725)]
HOG_BOOM = [(-0.58, 0.055, 0.635, 0.73), (-0.85, 0.036, 0.66, 0.725), (-1.02, 0.028, 0.672, 0.722)]
HOG_LEG_TOP = (0.34, 0.58, 0.3)
HOG_FOOT = (0.42, 0.045, 0.46)


def build_hog():
    """🚁 HOG LIFTER (Federation): a flying crane. A slim spine (underside y 0.55) with a glazed cab, a big
    engine house on top, four tall splayed legs on outriggers with clamp arms on their inner faces (the
    tank rides in the gap between them), a tail boom with the fin and tail rotor (u.hog_tail) on its right."""
    m = Model("u.hog", smooth_deg=40)
    E = 2.4
    _fuse(m, HOG_CAB, "olive", n=20, e=E)
    _fuse(m, HOG_SPINE, "olive", n=20, e=3.0)
    _fuse(m, HOG_BOOM, "olive", n=14, e=2.2)
    # the cab glazing (wrapping down at the front), frames, chin windows, team nose band
    _skin(m, HOG_CAB, 0.5, 0.775, "glass", 0.6, True, E, nz=5, k=12)
    for ang in (math.pi / 2, 0.5, math.pi - 0.5):
        _frame(m, HOG_CAB, 0.5, 0.775, ang, "oliveDark", E, nz=4)
    for z in (0.5, 0.62, 0.71):
        _hoop(m, HOG_CAB, z, 0.6, "oliveDark", E, k=10)
    for s in (-1, 1):
        m.push(s * 0.06, 0.56, 0.745, 0, -0.75)
        m.box((0, 0, 0), (0.06, 0.05, 0.006), "glass", bev=0)
        m.pop()
    _skin(m, HOG_CAB, 0.43, 0.47, "team", 0.6, False, E, nz=1, k=12)
    m.box((0.0, 0.53, 0.62), (0.05, 0.03, 0.06), "oliveDark", bev=0.006)
    m.cyl((0.0, 0.512, 0.635), 0.014, 0.006, "light", n=10)
    for s in (-1, 1):
        m.box((s * 0.12, 0.61, 0.38), (0.006, 0.07, 0.06), "glass", bev=0)       # aft-facing station's side window
        m.box((s * 0.111, 0.66, 0.0), (0.004, 0.004, 0.84), "oliveDark", bev=0)
        m.box((s * 0.111, 0.6, 0.15), (0.004, 0.08, 0.004), "oliveDark", bev=0)
        m.box((s * 0.111, 0.6, -0.25), (0.004, 0.08, 0.004), "oliveDark", bev=0)
        m.box((s * 0.112, 0.69, -0.32), (0.006, 0.03, 0.18), "team", bev=0)
    _nav_lights(m, 0.13, 0.62, 0.55)
    # the engine house: a big cowling, twin engines with intakes, exhausts, transmission hump, mast
    m.prism_x([(0.3, 0.74), (0.24, 0.84), (-0.2, 0.86), (-0.36, 0.8), (-0.4, 0.74)], -0.13, 0.13, "olive", bev=0.02, seg=2)
    m.box((0, 0.875, 0.0), (0.14, 0.05, 0.22), "oliveDark", bev=0.014)
    m.cyl((0, 0.905, HOG_ROTOR_AT[2]), 0.03, 0.05, "steelDark", n=10)
    for s in (-1, 1):
        x = s * 0.15
        m.cyl((x, 0.8, -0.02), 0.062, 0.42, "olive", n=16, axis="z", bev=0.006)
        m.cyl((x, 0.8, 0.195), 0.065, 0.014, "steelDark", n=16, axis="z")
        m.cyl((x, 0.8, 0.2), 0.05, 0.008, "black", n=14, axis="z")
        m.ball((x, 0.8, 0.2), 0.03, "steel", u=10, v=6, s=(1, 1, 0.9))
        m.box((x, 0.8, -0.02), (0.128, 0.014, 0.03), "team", bev=0)
        m.box((x, 0.863, -0.05), (0.03, 0.006, 0.26), "oliveDark", bev=0)
        m.tube([(x, 0.8, -0.22), (s * 0.18, 0.8, -0.28), (s * 0.22, 0.81, -0.31)], 0.036, "dark", n=10)
        m.cyl((s * 0.222, 0.81, -0.312), 0.03, 0.006, "black", n=10, axis="x")
        m.box((s * 0.131, 0.79, 0.08), (0.006, 0.05, 0.12), "black", bev=0)    # louvres
        for k in range(4):
            m.box((s * 0.135, 0.772 + k * 0.012, 0.08), (0.004, 0.003, 0.12), "oliveDark", bev=0)
    m.ball((0, 0.87, -0.3), 0.012, "red", u=8, v=5)
    # belly: a winch housing + equipment bay under the spine (above the load)
    m.box((0, 0.535, -0.05), (0.14, 0.03, 0.22), "oliveDark", bev=0.006)
    m.cyl((0, 0.525, -0.05), 0.02, 0.12, "steelDark", n=10, axis="x")
    # outriggers + side beams + legs + feet + clamps
    lx, ly, lz = HOG_LEG_TOP
    fx, fy, fz = HOG_FOOT
    for s in (-1, 1):
        for f in (-1, 1):
            m.box((s * 0.22, ly, f * lz), (0.26, 0.05, 0.05), "oliveDark", bev=0.01)
            m.bar((s * 0.11, 0.69, f * lz), (s * (lx - 0.02), ly + 0.02, f * lz), 0.02, "oliveDark")    # tie-rod
        m.box((s * lx, ly, 0), (0.05, 0.05, 2 * lz + 0.05), "oliveDark", bev=0.01)
        m.box((s * (lx + 0.026), ly, 0), (0.004, 0.022, 2 * lz - 0.04), "team", bev=0)
        for f in (-1, 1):
            top = Vector((s * lx, ly - 0.02, f * lz))
            foot = Vector((s * fx, fy + 0.02, f * fz))
            mid = top.lerp(foot, 0.55)
            m.tube([tuple(top), tuple(mid)], 0.022, "olive", n=8)
            m.tube([tuple(top.lerp(foot, 0.5)), tuple(foot)], 0.014, "steel", n=6)
            m.cyl(tuple(mid), 0.026, 0.03, "oliveDark", n=10)
            m.box(tuple(top.lerp(foot, 0.2)), (0.052, 0.012, 0.052), "hazard", bev=0)
            m.box((s * fx, fy + 0.02, f * fz), (0.05, 0.02, 0.03), "steelDark", bev=0.004)
            _hwheel(m, s * (fx + 0.035), 0.045, f * fz, 0.045, 0.032)
            # the clamp: an arm off the leg, a hydraulic ram below it, a rubber-faced grapple pad
            at = top.lerp(foot, 0.27)
            lo = top.lerp(foot, 0.52)
            pad = Vector((s * 0.272, 0.33, f * 0.31))
            m.bar(tuple(at), tuple(pad + Vector((s * 0.01, 0.05, 0))), 0.024, "steelDark")
            m.tube([tuple(lo), tuple(pad + Vector((s * 0.012, -0.04, 0)))], 0.009, "steel", n=6)
            m.box(tuple(pad + Vector((s * 0.008, 0, 0))), (0.014, 0.16, 0.1), "hazard", bev=0.003)
            m.box(tuple(pad), (0.012, 0.14, 0.085), "rubber", bev=0.003)
            m.box(tuple(pad + Vector((s * 0.012, 0.0, 0))), (0.01, 0.04, 0.04), "steelDark", bev=0)
        for f in (-1, 1):   # side braces: each leg's knee up to the beam's middle
            knee = Vector((s * lx, ly - 0.02, f * lz)).lerp(Vector((s * fx, fy + 0.02, f * fz)), 0.62)
            m.bar(tuple(knee + Vector((s * 0.02, 0, 0))), (s * (lx + 0.01), ly - 0.02, f * 0.06), 0.014, "oliveDark")
    # the tail: team band, fin with the gearbox on its right, stabiliser, beacon, tail bumper
    _skin(m, HOG_BOOM, -0.72, -0.77, "team", 0.66, True, 2.2, nz=1, k=10, t=0.004)
    _skin(m, HOG_BOOM, -0.72, -0.77, "team", 0.73, False, 2.2, nz=1, k=10, t=0.004)
    fin = [(-0.86, 0.71), (-0.96, 0.98), (-1.04, 0.98), (-1.045, 0.68), (-0.95, 0.68)]
    m.prism_x(fin, -0.016, 0.016, "olive", bev=0.005)
    m.prism_x([(-0.9378, 0.92), (-0.96, 0.98), (-1.04, 0.98), (-1.0412, 0.92)], -0.018, 0.018, "team", bev=0)
    m.cyl((0.024, HOG_TAIL_AT[1], HOG_TAIL_AT[2]), 0.028, 0.026, "oliveDark", n=10, axis="x", bev=0.003)
    m.prism_y([(-0.18, -0.86), (0.18, -0.86), (0.18, -0.91), (0.03, -0.93), (-0.03, -0.93), (-0.18, -0.91)], 0.69, 0.705, "olive", bev=0.004)
    m.ball((0, 0.985, -1.0), 0.012, "red", u=8, v=5)
    _strut(m, (0, 0.67, -0.98), (0, 0.6, -1.03), 0.008)
    return m


def build_hog_rotor():
    """The HOG LIFTER's main rotor: 6 drooped blades, radius 0.85 (spun about y)."""
    m = Model("u.hog_rotor")
    _rotor(m, 6, 0.85, 0.066, 0.06, tip="hazard", droop=0.03)
    return m


def build_hog_tail():
    """The HOG LIFTER's tail rotor: 4 blades, radius 0.16, spinning about x; the hub cap faces +x."""
    m = Model("u.hog_tail")
    _tail_rotor(m, 4, 0.16, 0.038, 0.022, side=1, tip="hazard", phase=math.pi / 4)
    return m


HELIS = [build_hawk, build_hawk_rotor, build_hawk_tail, build_lift, build_lift_rotor, build_tater, build_tater_rotor,
         build_tater_tail, build_hog, build_hog_rotor, build_hog_tail]


MODELS = [build_hq, build_hq_crane, build_power, build_refinery, build_barracks, build_barracks_flag, build_factory,
          build_factory_door, build_radar, build_radar_dish, build_turret, build_turret_head, build_tesla,
          build_tank, build_tank_turret, build_tank_gun, build_heavy, build_heavy_turret, build_heavy_gun,
          build_harv, build_harv_drum, build_harv_load, lambda: build_inf("rifle"), lambda: build_inf("rocket"), build_leg] + LANDSCAPE + PHASE1 + PHASE2 + HELIS + WATERWORKS

# the game draws a building's part parented to its body: give the AO bake the body as an occluder
OCCLUDERS = {"b.hq_crane": "b.hq", "b.radar_dish": "b.radar", "b.turret_head": "b.turret", "b.factory_door": None,
             "u.tank_turret": "u.tank", "u.heavy_turret": "u.heavy", "u.harv_drum": "u.harv",
             "b.sam_head": "b.sam", "b.flak_head": "b.flak", "b.derrick_pump": "b.derrick", "u.ifv_turret": "u.ifv",
             "u.prismtank_turret": "u.prismtank", "u.mirage_turret": "u.mirage", "u.v3_rack": "u.v3",
             "u.apoc_turret": "u.apoc", "u.harvF_gun": "u.harvF", "b.spysat_dish": "b.spysat",
             "u.hawk_rotor": "u.hawk", "u.hawk_tail": "u.hawk", "u.lift_rotor": "u.lift", "u.tater_rotor": "u.tater",
             "u.tater_tail": "u.tater", "u.hog_rotor": "u.hog", "u.hog_tail": "u.hog"}
PART_AT = {"b.hq_crane": (-1.05, 0, -1.0), "b.radar_dish": (0.45, 0.78, -0.45), "b.turret_head": (0, 0.32, 0),
           "u.tank_turret": (0, 0.29, 0), "u.heavy_turret": (0, 0.34, 0), "u.harv_drum": (0, 0.12, 0.52),
           "b.sam_head": (0, 0.3, 0), "b.flak_head": (0, 0.3, 0), "b.derrick_pump": (-0.3, 0.44, 0.45),
           "u.ifv_turret": (0, 0.24, -0.04), "u.prismtank_turret": (0, 0.28, -0.03), "u.mirage_turret": (0, 0.28, -0.05),
           "u.v3_rack": (0, 0.3, -0.3), "u.apoc_turret": (0, 0.38, -0.04), "u.apoc_gun": (0, 0.5, 0.16),
           "u.harvF_gun": (0, 0.5, 0.3), "b.spysat_dish": SPYSAT_DISH_AT, "u.leg": (0.045, 0.13, 0), "u.dog_leg": (0.05, 0.12, 0.11),
           "u.tank_gun": (0, 0.365, 0.12), "u.heavy_gun": (0, 0.43, 0.15), "u.harv_load": (0, 0.42, -0.2),
           "u.hawk_rotor": HAWK_ROTOR_AT, "u.hawk_tail": HAWK_TAIL_AT, "u.lift_rotor": LIFT_ROTOR_FRONT_AT,   # (+ LIFT_ROTOR_REAR_AT)
           "u.tater_rotor": TATER_ROTOR_AT, "u.tater_tail": TATER_TAIL_AT, "u.hog_rotor": HOG_ROTOR_AT, "u.hog_tail": HOG_TAIL_AT}
SUBDIV = {"u.crate": 0.09}   # small models whose big faces sit in corner pieces (AO would grey the whole face)
NO_GROUND = {"w.bridge_deck", "w.bridge_truss", "w.bridge_portal", "w.bridge_pier", "w.bridge_ruin", "u.gravy_stream", "u.gravy_pool", "u.jet", "u.blimp", "u.blimp_prop", "u.v3_rocket", "b.factory_door", "b.barracks_flag"} | \
    {"u.hawk", "u.hawk_rotor", "u.hawk_tail", "u.lift", "u.lift_rotor", "u.tater", "u.tater_rotor", "u.tater_tail", "u.hog", "u.hog_rotor", "u.hog_tail"}


# =========================================================================================================
# export: triangulate, smooth by angle (per material), bake AO, dedupe, write JSON
# =========================================================================================================
def _hemi(n):
    out = []
    g = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        y = 1 - (i + 0.5) / n
        r = math.sqrt(max(0.0, 1 - y * y))
        out.append(Vector((math.cos(i * g) * r, y, math.sin(i * g) * r)))
    return out


def _tris_of(bm):
    return [[v.co.copy() for v in f.verts] for f in bm.faces]


def export(m, occ=None, occ_at=(0, 0, 0)):
    bm = m.bm
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    # AO is per VERTEX: a wall that's only four corners gets the ground's darkness at the bottom pair and the
    # parapet's at the top pair, and the blend greys the whole face. Split long edges so the shadow stays
    # where it's cast (contact at the foot, a band under the parapet) and the middle of the wall stays lit.
    lim = 0.32 if m.name.startswith("b.") else SUBDIV.get(m.name)
    for _ in range(3 if lim else 0):
        long = [e for e in bm.edges if e.calc_length() > lim]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()
    # the occluder set: this model + (optionally) its parent body, moved into this part's frame, + ground
    tris = _tris_of(bm)
    off = Vector(occ_at)
    ground_y = -off.y            # a part mounted up on its body: the real ground is below its origin
    if occ is not None:
        tris += [[p - off for p in t] for t in _tris_of(occ.bm)]
    if m.name not in NO_GROUND:  # aircraft / a rocket in flight: no ground to cast contact shadow
        S = 4.0
        G = [Vector((-S, ground_y, -S)), Vector((S, ground_y, -S)), Vector((S, ground_y, S)), Vector((-S, ground_y, S))]
        tris += [[G[0], G[1], G[2]], [G[0], G[2], G[3]]]
    verts, polys = [], []
    for t in tris:
        b = len(verts)
        verts += t
        polys.append(tuple(range(b, b + len(t))))
    bvh = BVHTree.FromPolygons(verts, polys, all_triangles=False)
    H = _hemi(28)
    DIST = 0.45

    def ao_at(p, n):
        up = Vector((0, 1, 0)) if abs(n.y) < 0.95 else Vector((1, 0, 0))
        tx = n.cross(up).normalized()
        ty = n.cross(tx).normalized()
        o = p + n * 0.003
        occl = 0.0
        wsum = 0.0
        for d in H:
            w = d.y
            ray = (tx * d.x + n * d.y + ty * d.z).normalized()
            hit = bvh.ray_cast(o, ray, DIST)
            wsum += w
            if hit[0] is not None:
                occl += w * (1.0 - (hit[3] / DIST) ** 0.7)
        a = 1.0 - occl / wsum
        return max(0.38, min(1.0, 0.25 + 0.85 * a))

    out_p, out_n, out_c, out_u, out_i = [], [], [], [], []
    seen = {}
    ao_cache = {}
    cos_lim = math.cos(m.smooth)
    for f in bm.faces:
        mat = m.mats[f.material_index]
        hexc, team, cls, exempt = PAL[mat]
        rgb = _rgb(hexc)
        fn = f.normal
        tri = []
        for v in f.verts:
            acc = Vector((0, 0, 0))
            for g in v.link_faces:
                if g.material_index == f.material_index and g.normal.dot(fn) >= cos_lim:
                    acc += g.normal * g.calc_area()
            nrm = acc.normalized() if acc.length > 1e-12 else fn.copy()
            key = (v.index, round(nrm.x, 3), round(nrm.y, 3), round(nrm.z, 3), f.material_index)
            if key not in seen:
                if exempt:
                    ao = 1.0
                else:
                    ak = (v.index, round(nrm.x, 2), round(nrm.y, 2), round(nrm.z, 2))
                    if ak not in ao_cache:
                        ao_cache[ak] = ao_at(v.co, nrm)
                    ao = ao_cache[ak]
                seen[key] = len(out_p) // 3
                out_p += [round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4)]
                out_n += [round(nrm.x, 3), round(nrm.y, 3), round(nrm.z, 3)]
                out_c += [int(rgb[0] * ao + 0.5), int(rgb[1] * ao + 0.5), int(rgb[2] * ao + 0.5), 255 if team else 0]
                # uv = (surface class, grime): the shader dirties cavities by the second channel
                out_u += [cls, int(max(0.0, min(1.0, (1.0 - ao) / 0.6)) * 255 + 0.5)]
            tri.append(seen[key])
        out_i += tri
    return {"name": m.name, "p": out_p, "n": out_n, "c": out_c, "u": out_u, "i": out_i}


def to_blend(m, data, x):
    """Drop the exported mesh into the scene (Z-up) with its vertex colours, laid out in a row."""
    me = bpy.data.meshes.new(m.name)
    P = data["p"]
    vs = [(P[k], -P[k + 2], P[k + 1]) for k in range(0, len(P), 3)]
    I = data["i"]
    me.from_pydata(vs, [], [tuple(I[k:k + 3]) for k in range(0, len(I), 3)])
    col = me.color_attributes.new("Col", "BYTE_COLOR", "POINT")
    C = data["c"]
    for k in range(len(vs)):
        a = C[k * 4 + 3] / 255
        r, g, b = C[k * 4] / 255, C[k * 4 + 1] / 255, C[k * 4 + 2] / 255
        if a:
            r, g, b = r * 0.35, g * 0.55, b * 1.0   # preview team panels as blue
        col.data[k].color = (r, g, b, 1)
    ob = bpy.data.objects.new(m.name, me)
    ob.location = (x, 0, 0)
    bpy.context.scene.collection.objects.link(ob)


def main():
    os.makedirs(OUT, exist_ok=True)
    for o in list(bpy.context.scene.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    built = {}
    for fn in MODELS:
        m = fn()
        built[m.name] = m
    # the parents first (their bmesh must be un-triangulated copies for occlusion; copy before export)
    occ_copy = {}
    for name in set(v for v in OCCLUDERS.values() if v):
        c = Model(name)
        c.bm = built[name].bm.copy()
        occ_copy[name] = c
    x = 0.0
    summary = []
    only = os.environ.get("ALR_ONLY")
    for name, m in built.items():
        if only and name not in only.split(","):
            continue
        parent = OCCLUDERS.get(name)
        data = export(m, occ_copy.get(parent) if parent else None, PART_AT.get(name, (0, 0, 0)))
        with open(os.path.join(OUT, name + ".json"), "w") as f:
            json.dump(data, f, separators=(",", ":"))
        to_blend(m, data, x)
        x += 4.0 if name.startswith("b.") else 1.5
        summary.append((name, len(data["p"]) // 3, len(data["i"]) // 3))
    for s in summary:
        print("ALR %-18s verts %6d  tris %6d" % s)
    print("ALR total tris", sum(s[2] for s in summary))
    if not only:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "alert_models.blend"))


if __name__ == "__main__":
    main()
