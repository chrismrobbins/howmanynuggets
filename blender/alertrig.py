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
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "render_alert")
TAU = math.tau

# ---- the palette (hex, team mask, ao-exempt) ------------------------------------------------------------
PAL = {
    "pad": ("#7c7970", 0), "padDark": ("#5c5a54", 0), "padEdge": ("#8f8b80", 0),
    "conc": ("#aca596", 0), "concLite": ("#c2bcae", 0), "concDark": ("#888275", 0),
    "roof": ("#6a6e72", 0), "roofDark": ("#4e5256", 0), "tar": ("#3c3f42", 0),
    "steel": ("#80898f", 0), "steelDark": ("#596067", 0), "dark": ("#3a3f45", 0), "black": ("#1f2226", 0),
    "glass": ("#294d63", 0, 1), "glassLit": ("#8fc9e8", 0, 1), "light": ("#fff0b0", 0, 1), "red": ("#d8321e", 0, 1),
    "gold": ("#e6a82a", 0), "goldDark": ("#b07618", 0), "hazard": ("#e8b51e", 0), "sauce": ("#b3351f", 0),
    "sauceDark": ("#7f2414", 0), "copper": ("#c47b3c", 0), "copperDark": ("#8e5426", 0), "white": ("#e4e1d8", 0),
    "olive": ("#5f6a3a", 0), "oliveDark": ("#454d29", 0), "khaki": ("#8d8858", 0), "rubber": ("#2a2a2b", 0),
    "sand": ("#b8a67a", 0), "sandDark": ("#9a8a62", 0), "wood": ("#7a5a38", 0), "rust": ("#7d4f33", 0),
    "breading": ("#dc9c3e", 0), "breadDark": ("#a8692a", 0), "grass": ("#5d7a34", 0),
    "team": ("#d6d6d6", 1), "teamDark": ("#9c9c9c", 1), "teamLite": ("#efefef", 1),
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
    """RA2's concrete pad: a bevelled slab, a lighter top with expansion seams, hazard-painted corners."""
    m.box((0, 0.04, 0), (w - 0.03, 0.08, h - 0.03), "padDark", bev=0.03, seg=2)
    m.box((0, 0.09, 0), (w - 0.12, 0.022, h - 0.12), "pad", bev=0.012)
    for i in range(1, int(w * 2)):
        x = -w / 2 + i * 0.5
        m.box((x, 0.1015, 0), (0.008, 0.002, h - 0.16), "padDark", bev=0)
    for j in range(1, int(h * 2)):
        z = -h / 2 + j * 0.5
        m.box((0, 0.1015, z), (w - 0.16, 0.002, 0.008), "padDark", bev=0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            cx, cz = sx * (w / 2 - 0.14), sz * (h / 2 - 0.14)
            m.box((cx, 0.102, cz), (0.14, 0.003, 0.03), "hazard", bev=0)
            m.box((cx, 0.102, cz), (0.03, 0.003, 0.14), "hazard", bev=0)


def wall_block(m, c, s, mat="conc", band=0.5, band_h=0.045, parapet=True, plinth=True, roof="roof"):
    """A building block: plinth, walls, a team band at `band` of its height, a parapet and a roof."""
    x, y0, z = c
    w, h, d = s
    if plinth:
        m.box((x, y0 + 0.03, z), (w + 0.03, 0.06, d + 0.03), "concDark", bev=0.008)
    m.box((x, y0 + h / 2, z), (w, h, d), mat, bev=0.014, seg=2)
    if band:
        m.box((x, y0 + h * band, z), (w + 0.014, band_h, d + 0.014), "team", bev=0.004)
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
    for x, z in ((1.38, 1.38), (-1.38, 1.38), (1.38, -0.2)):
        m.lamp(x, z)
    for k in range(4):
        m.cyl((-1.2 + k * 0.18, 0.14, 1.3), 0.014, 0.08, "hazard", n=8)
    m.crate((1.25, 0.14, 0.35), 0.08)
    m.crate((1.3, 0.14, 0.22), 0.07, "olive")
    m.drum(1.15, 0.2)
    m.drum(1.15, 0.12, mat="team")
    m.stripes((-1.42, 0, 1.43), (1.42, 0, 1.43), 0.103, 0.035, 18, face="y")
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
    m.box((-0.36, 0.17, 0.57), (0.004, 0.06, 0.06), "hazard", bev=0)
    m.lamp(0.88, 0.88)
    m.lamp(-0.88, -0.88)
    return m


def build_refinery():
    """🥫 SAUCE REFINERY, 3×3: a gabled processing hall with skylights, a conveyor gantry up from the dock
    hopper, three domed sauce silos with ladders, a striped chimney, the dock apron (+z) with chevrons."""
    m = Model("b.refinery")
    foundation(m, 3, 3)
    # the dock apron: asphalt, chevrons, guide lights
    m.box((0.55, 0.104, 1.0), (1.24, 0.008, 0.84), "tar", bev=0)
    m.stripes((-0.07, 0, 1.41), (1.17, 0, 1.41), 0.11, 0.05, 10, face="y")
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
    m.box((0.2, 0.47, hz + 0.72), (0.42, 0.03, 0.03), "hazard", bev=0.004)
    m.lathe([(0.04, 0.32), (0.16, 0.55), (0.17, 0.6), (0.0, 0.6)], "steelDark", c=(0.25, 0, 0.62), n=12, bev=0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.bar((0.25 + sx * 0.12, 0.1, 0.62 + sz * 0.12), (0.25 + sx * 0.12, 0.5, 0.62 + sz * 0.12), 0.02, "hazard")
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
    m.bar((0.1, 0.1, 0.36), (0.1, 0.78, 0.36), 0.025, "hazard")
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
    m.lamp(-1.35, 1.32)
    m.lamp(1.38, 1.32)
    m.drum(-1.3, 0.75)
    m.drum(-1.22, 0.8, mat="team")
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
    m.lamp(0.9, -0.9)
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
    for s in (-1, 1):
        for k in range(6):
            m.box((s * 0.66, 0.16 + k * 0.11, fz + 0.093), (0.1, 0.05, 0.006), "hazard" if k % 2 == 0 else "black", bev=0)
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
    m.lamp(-0.95, 1.35)
    m.lamp(0.95, 1.35)
    m.crate((1.25, 0.145, 1.0), 0.09)
    m.drum(1.3, 1.2)
    m.drum(1.22, 1.25, mat="team")
    return m


def build_factory_door():
    """The roll-up door: origin at its centre, 1.04 × 0.64 (alertUI slides + squashes it up)."""
    m = Model("b.factory_door")
    m.box((0, 0, 0), (1.06, 0.66, 0.025), "steel", bev=0.004)
    for k in range(9):
        m.box((0, -0.3 + k * 0.075, 0.014), (1.04, 0.01, 0.008), "steelDark", bev=0)
    m.box((0, 0.2, 0.019), (0.5, 0.07, 0.006), "team", bev=0)
    for x in (-0.48, 0.48):
        m.box((x, 0, 0.016), (0.03, 0.64, 0.006), "hazard", bev=0)
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
    m.lamp(0.88, 0.88)
    m.lamp(-0.88, -0.88)
    m.crate((0.8, 0.145, 0.3), 0.08)
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
    m.crate((-0.36, 0.14, -0.36), 0.08, "olive")
    m.box((-0.36, 0.185, -0.36), (0.06, 0.008, 0.06), "dark", bev=0)
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
    m.prism_x([(-0.42, 0.11), (-0.44, 0.24), (0.12, 0.27), (0.43, 0.2), (0.43, 0.16), (0.36, 0.1)], -0.19, 0.19, "teamDark", bev=0.01, seg=2)
    m.prism_x([(-0.4, 0.24), (-0.4, 0.29), (0.14, 0.29), (0.4, 0.215), (0.4, 0.2), (0.12, 0.27)], -0.205, 0.205, "team", bev=0.01, seg=2)
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
    m.box((0.09, 0.27, 0.22), (0.07, 0.016, 0.06), "teamDark", bev=0.006)
    m.tube([(-0.17, 0.3, -0.3), (-0.17, 0.3, 0.05), (-0.15, 0.3, 0.08)], 0.008, "steelDark", n=5)
    return m


def build_tank_turret():
    """The turret: origin on the ring (alertUI: hull y 0.29). Faceted cast armour, a mantlet, the
    commander's cupola with an MG, smoke launchers, a bustle rack, an antenna."""
    m = Model("u.tank_turret")
    plan = [(-0.12, -0.2), (0.12, -0.2), (0.17, -0.06), (0.15, 0.1), (0.07, 0.17), (-0.07, 0.17), (-0.15, 0.1), (-0.17, -0.06)]
    m.prism_y(plan, 0.0, 0.11, "team", bev=0.012, seg=2, top=0.8, topc=(0, -0.02))
    m.prism_y([(x * 0.98, z * 0.98) for x, z in plan], -0.02, 0.0, "teamDark", bev=0.004)
    m.box((0, 0.065, 0.17), (0.12, 0.08, 0.06), "teamDark", bev=0.012, seg=2)
    # the cupola + hatch + MG
    m.cyl((-0.06, 0.13, -0.05), 0.045, 0.04, "teamDark", n=12, bev=0.004)
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
    m.cyl((0, 0, 0.04), 0.032, 0.07, "teamDark", n=12, axis="z", bev=0.004)
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
    m.prism_x([(-0.48, 0.13), (-0.5, 0.29), (0.14, 0.33), (0.5, 0.24), (0.5, 0.2), (0.42, 0.12)], -0.23, 0.23, "teamDark", bev=0.012, seg=2)
    m.prism_x([(-0.47, 0.29), (-0.47, 0.345), (0.16, 0.345), (0.47, 0.255), (0.47, 0.24), (0.14, 0.33)], -0.245, 0.245, "team", bev=0.012, seg=2)
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
    m.prism_y([(x * 0.98, z * 0.98) for x, z in plan], -0.02, 0.0, "teamDark", bev=0.004)
    m.box((0, 0.085, 0.22), (0.2, 0.1, 0.06), "teamDark", bev=0.014, seg=2)
    for s in (-1, 1):
        m.box((s * 0.25, 0.09, -0.02), (0.08, 0.09, 0.2), "steelDark", bev=0.01, seg=2)
        for i in range(2):
            for j in range(2):
                m.cyl((s * 0.25 + (i - 0.5) * 0.035, 0.07 + j * 0.04, 0.08), 0.013, 0.012, "black", n=8, axis="z")
        m.box((s * 0.2, 0.09, -0.02), (0.03, 0.03, 0.08), "dark", bev=0.003)
    m.cyl((-0.08, 0.165, -0.07), 0.05, 0.05, "teamDark", n=12, bev=0.004)
    m.cyl((-0.08, 0.195, -0.07), 0.045, 0.012, "steelDark", n=12)
    m.box((0.09, 0.16, 0.06), (0.05, 0.04, 0.06), "steelDark", bev=0.005)
    m.box((0.09, 0.16, 0.092), (0.04, 0.025, 0.004), "glass", bev=0)
    m.box((0, 0.07, -0.27), (0.26, 0.07, 0.06), "olive", bev=0.008)
    m.cyl((0.12, 0.27, -0.2), 0.004, 0.26, "black", n=4)
    return m


def build_heavy_gun():
    """The twin guns: origin at the trunnion (turret local (0, 0.09, 0.15)), barrels at x ±0.055 to +z."""
    m = Model("u.heavy_gun")
    m.box((0, 0, 0.03), (0.2, 0.06, 0.06), "teamDark", bev=0.01, seg=2)
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
        m.prism_x([(-0.46, 0.2), (-0.46, 0.235), (0.4, 0.235), (0.42, 0.2)], s * 0.2, s * 0.34, "teamDark", bev=0.006)
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
    m.prism_x([(-0.44, 0.22), (-0.47, 0.47), (0.1, 0.47), (0.1, 0.22)], -0.26, 0.26, "team", bev=0.014, seg=2)
    m.box((0, 0.462, -0.18), (0.44, 0.02, 0.48), "black", bev=0)
    for k in range(4):
        m.box((0.262, 0.34, -0.38 + k * 0.14), (0.008, 0.2, 0.02), "teamDark", bev=0)
        m.box((-0.262, 0.34, -0.38 + k * 0.14), (0.008, 0.2, 0.02), "teamDark", bev=0)
    m.box((0, 0.48, 0.1), (0.54, 0.03, 0.03), "hazard", bev=0.004)
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
        m.prism_x([(-0.02, 0.0), (0.02, 0.0), (0.0, 0.035)], -0.01, 0.01, "hazard", bev=0)
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
    m.box((0, 0.23, 0.005), (0.2, 0.09, 0.17), "team", bev=0.03, seg=2)
    m.box((0, 0.23, 0.092), (0.08, 0.05, 0.012), "teamDark", bev=0.005)
    m.box((0, 0.27, -0.1), (0.13, 0.12, 0.06), "olive", bev=0.018, seg=2)
    m.lathe([(0.0, 0.335), (0.072, 0.335), (0.074, 0.348), (0.066, 0.385), (0.042, 0.41), (0.0, 0.416)], "team", c=(0, 0.0, -0.005), n=14)
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


MODELS = [build_hq, build_hq_crane, build_power, build_refinery, build_barracks, build_barracks_flag, build_factory,
          build_factory_door, build_radar, build_radar_dish, build_turret, build_turret_head, build_tesla,
          build_tank, build_tank_turret, build_tank_gun, build_heavy, build_heavy_turret, build_heavy_gun,
          build_harv, build_harv_drum, build_harv_load, lambda: build_inf("rifle"), lambda: build_inf("rocket"), build_leg]

# the game draws a building's part parented to its body: give the AO bake the body as an occluder
OCCLUDERS = {"b.hq_crane": "b.hq", "b.radar_dish": "b.radar", "b.turret_head": "b.turret", "b.factory_door": None,
             "u.tank_turret": "u.tank", "u.heavy_turret": "u.heavy", "u.harv_drum": "u.harv"}
PART_AT = {"b.hq_crane": (-1.05, 0, -1.0), "b.radar_dish": (0.45, 0.78, -0.45), "b.turret_head": (0, 0.32, 0),
           "u.tank_turret": (0, 0.29, 0), "u.heavy_turret": (0, 0.34, 0), "u.harv_drum": (0, 0.12, 0.52)}


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
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()
    # the occluder set: this model + (optionally) its parent body, moved into this part's frame, + ground
    tris = _tris_of(bm)
    ground_y = 0.0
    if occ is not None:
        off = Vector(occ_at)
        tris += [[p - off for p in t] for t in _tris_of(occ.bm)]
        ground_y = -off.y
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

    out_p, out_n, out_c, out_i = [], [], [], []
    seen = {}
    ao_cache = {}
    cos_lim = math.cos(m.smooth)
    for f in bm.faces:
        mat = m.mats[f.material_index]
        hexc, team = PAL[mat][0], PAL[mat][1]
        exempt = len(PAL[mat]) > 2
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
            tri.append(seen[key])
        out_i += tri
    return {"name": m.name, "p": out_p, "n": out_n, "c": out_c, "i": out_i}


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
