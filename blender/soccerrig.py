"""⚽ NUGGET SOCCER — the Blender rig for the players, the ball, the goals and the stadium.

    blender -b -P blender/soccerrig.py                    # build + bake AO + export render_soccer/*.json
    SOC_ONLY=p.body,ball blender -b -P blender/soccerrig.py
    python3 blender/pack_soccer.py                        # render_soccer/*.json -> js/soccerMeshData.js

This is a thin layer over blender/alertrig.py (Nugget Alert's model factory): the same Model / FModel
builder, the same export() (triangulate, smooth by angle, bake AO into the vertex colour, JSON), the
same palette dict (we add our entries to alertrig.PAL at import time).

CONVENTIONS (a contract with the game — do not drift):
- Units are METRES. Game frame: x right, y UP, z forward. Players face +z.
- Player parts are rigid, code-animated, each with its ORIGIN at its joint:
    p.body / p.bodyGK   origin = pelvis centre (the game puts it 0.86 above the ground)
                        hips at (±0.10, 0, 0), shoulders at (±0.25, 0.50, 0)
    p.arm / p.armGK     origin = shoulder, hangs down −y (hand at about −0.52 / −0.60)
    p.thigh             origin = hip, knee at (0, −0.42, 0)
    p.shin              origin = knee, sole flat at y −0.44 (studs dip 1 cm below), toe +z
    p.hair0..2          accessories in the BODY's frame (origin = the body origin)
  Each limb ends in a sphere centred on its joint, inside a matching cap on its parent, so a joint can
  turn ±60° without opening a gap.
- Kit colours: three team masks in the vertex alpha. 255 = mask 1 (kit1: shirts, the stand seats),
  128 = mask 2 (kit2: shorts), 64 = mask 3 (kit3: socks). The shader keeps the luminance of these
  mid-light greys and repaints the hue; everything else is fixed colour.
- uv = (surface class, grime) exactly as Nugget Alert (classes listed in alertrig.py's palette notes).
- Baked AO (DIST 0.45 m) is in the vertex colour. Player parts, the ball and the hair have no ground
  contact shadow (they're drawn floating at their joints); pitch furniture and the stadium do.
- Stadium modules: the stand's FRONT edge is z = 0 and it climbs toward +z (the pitch is at −z); see
  STAND_ROWS for the seat positions. Fans face +z like everything else (turn them to face the pitch).
"""
import bpy, bmesh, math, json, os, sys, random
from mathutils import Vector, Matrix
from mathutils import noise as mnoise
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import alertrig as A  # noqa: E402

OUT = os.path.join(HERE, "render_soccer")
TAU = math.tau
_m = A._m

# ---- palette additions (hex, class, team mask, ao-exempt) -----------------------------------------------
A.PAL.update({
    # the kit: team masks 1 / 2 / 3 (shirt / shorts / socks) — mid-light greys, darker trim variants
    "kit1": _m("#b4b4b4", 13, 1), "kit1Dark": _m("#7c7c7c", 13, 1), "kit1Lite": _m("#cccccc", 13, 1),
    "kit2": _m("#b0b0b0", 13, 2), "kit2Dark": _m("#787878", 13, 2),
    "kit3": _m("#b4b4b4", 13, 3), "kit3Dark": _m("#7a7a7a", 13, 3),
    # the nugget face and kit details (fixed)
    "eyeWhite": _m("#f3f0e6", 0), "pupil": _m("#141518", 0), "crestGold": _m("#d8a63a", 12),
    "crestNavy": _m("#26345a", 13), "sponsor": _m("#ebe8df", 13), "sponsorRed": _m("#c33326", 13),
    "boot": _m("#1c1d21", 7), "bootStripe": _m("#c6e23a", 5), "stud": _m("#c4c6c4", 6),
    "glove": _m("#b8e23c", 7), "gloveDark": _m("#2a2c31", 7), "gloveWhite": _m("#eae8e0", 7),
    "padGrey": _m("#45484e", 7), "headband": _m("#d23a2c", 13), "headbandDark": _m("#8e2219", 13),
    "beanie": _m("#2a4778", 13), "beanieCuff": _m("#e2ddd0", 13),
    # the ball
    "ballWhite": _m("#eeece6", 0), "ballDark": _m("#232733", 0), "ballGold": _m("#d6a23a", 12), "ballSeam": _m("#5d5f63", 7),
    # pitch furniture
    "goalWhite": _m("#efede8", 5), "net": _m("#dcdcd4", 13), "netFrame": _m("#b9bec2", 6),
    "flagPole": _m("#e3c43a", 5), "flagCloth": _m("#d8402a", 13), "flagBase": _m("#2b2c2e", 7),
    "adFace": _m("#808080", 0, 0, 1), "adFrame": _m("#3a3d42", 6),
    # the stadium
    "standConc": _m("#a4a29b", 1), "standConcDark": _m("#85837d", 1), "standConcLite": _m("#bdbab2", 1),
    "standStep": _m("#c3c0b8", 2), "nosing": _m("#d6b43c", 5), "standSteel": _m("#c3c7c9", 6),
    "roofSheet": _m("#8e959b", 4), "roofUnder": _m("#b4b8ba", 3), "fascia": _m("#d9d9d4", 5),
    "fasciaStripe": _m("#2c3442", 5), "seatFrame": _m("#3c3f44", 6), "perspex": _m("#334652", 8, 0, 1),
    "towerSteel": _m("#9ea4a8", 6), "fanLegs": _m("#3d4250", 13), "lampHousing": _m("#33363b", 6),
})
P_SET = {"p.body", "p.bodyGK", "p.arm", "p.armGK", "p.thigh", "p.shin", "p.hair0", "p.hair1", "p.hair2", "ball"}
A.NO_GROUND.update(P_SET | {"fan0", "fan1", "fan2", "fan3"})


def FM(name, smooth=50):
    return A.FModel(name, smooth)


# ---- helpers --------------------------------------------------------------------------------------------
def mesh(m, pts, faces, mat):
    """Raw faces with the winding given (no normal recalculation: open patches stay the way we wound them)."""
    bm = m.bm
    V = [bm.verts.new(m._xf(Vector(p).to_4d()).to_3d()) for p in pts]
    for f in faces:
        try:
            bm.faces.new([V[k] for k in f])
        except ValueError:
            pass
    return m._done(V, mat, recalc=False)


def wire(m, pts, w, mat):
    """A square-section polyline with no end caps (net strings, thin rails)."""
    P = [Vector(p) for p in pts]
    rings = []
    for i, p in enumerate(P):
        d0 = (P[i] - P[i - 1]).normalized() if i > 0 else None
        d1 = (P[i + 1] - P[i]).normalized() if i < len(P) - 1 else None
        d = ((d0 if d0 is not None else d1) + (d1 if d1 is not None else d0)).normalized()
        up = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
        ax = d.cross(up).normalized() * (w / 2)
        ay = d.cross(ax).normalized() * (w / 2)
        rings.append([tuple(p + ax + ay), tuple(p - ax + ay), tuple(p - ax - ay), tuple(p + ax - ay)])
    return m.loft(rings, mat, cap0=False, cap1=False)


def sweep(m, path, prof, mat, closed_path=False, cap=True):
    """Sweep a cross-section prof [(u, v), ...] along a path of (point, u_axis, v_axis) frames."""
    rings = [[tuple(Vector(p) + Vector(ua) * u + Vector(va) * v) for u, v in prof] for p, ua, va in path]
    if closed_path:
        rings.append(rings[0])
    return m.loft(rings, mat, cap0=cap and not closed_path, cap1=cap and not closed_path)


def pole(m, c, r, y0, y1, mat, n=12, step=0.3):
    """A capped vertical cylinder with a ring every `step` (so baked AO stays where it's cast)."""
    k = max(1, int(math.ceil((y1 - y0) / step)))
    prof = [(0.0, y0)] + [(r, y0 + (y1 - y0) * i / k) for i in range(k + 1)] + [(0.0, y1)]
    return m.lathe(prof, mat, c=c, n=n)


def smooth01(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def bvh_of(m):
    return BVHTree.FromBMesh(m.bm)


def surf(bvh, o, d):
    """Ray from o along d onto a surface: (location, normal) or (None, None)."""
    loc, nrm, _, _ = bvh.ray_cast(Vector(o), Vector(d).normalized(), 5.0)
    return loc, nrm


def push_on(m, loc, nrm, out=0.0, roll=0.0):
    """Push a frame whose local +z is the surface normal at loc."""
    p = loc + nrm * out
    m.push(p.x, p.y, p.z, math.atan2(nrm.x, nrm.z), -math.asin(max(-1, min(1, nrm.y))), roll)


def bread_limb(m, y_top, y_bot, r_top, r_bot, seed, n=10, mid=4, dome_top=True, dome_bot=True, mat="breading", amp=0.07, rt=None, rb=None):
    """A breaded limb along y with dome ends (the domes are the joint spheres)."""
    rt = r_top if rt is None else rt
    rb = r_bot if rb is None else rb
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    prof = []  # (radius, y)
    if dome_top:
        for k in range(0, 3):
            ph = k / 3 * (math.pi / 2)
            prof.append((rt * math.sin(ph), y_top + rt * math.cos(ph)))
    for k in range(mid + 1):
        t = k / mid
        prof.append((r_top + (r_bot - r_top) * t, y_top + (y_bot - y_top) * t))
    if dome_bot:
        for k in range(1, 4):
            ph = (math.pi / 2) - k / 3 * (math.pi / 2)
            prof.append((rb * math.sin(ph), y_bot - rb * math.cos(ph)))
    rings = []
    for r, y in prof:
        ring = []
        for j in range(n):
            b = j / n * TAU
            d = Vector((math.cos(b), 0, math.sin(b)))
            k = 1.0 + amp * mnoise.noise(Vector((d.x * 2.2, y * 9.0, d.z * 2.2)) + off)
            ring.append((d.x * r * k, y, d.z * r * k))
        rings.append(ring)
    return m.loft(rings, mat)


# =========================================================================================================
# THE PLAYER
# =========================================================================================================
RX, RZ, YC, RY = 0.22, 0.16, 0.335, 0.415          # the nugget torso: y from −0.08 to 0.75
HIP = (0.10, 0.0, 0.0)
SHOULDER = (0.25, 0.50, 0.0)
KNEE_Y, SOLE_Y = -0.42, -0.44
PH = [0.7, 2.1, 4.0]


def torso_pt(a, b, wob=True, d=0.0):
    """The torso surface at polar angle a (0 = bottom, π = top) and azimuth b (π/2 = front, +z)."""
    y = YC - math.cos(a) * RY
    sa = max(0.0, math.sin(a))
    s = sa ** (0.6 if a < math.pi / 2 else 0.45)
    c, sn = math.cos(b), math.sin(b)
    px = math.copysign(abs(c) ** 0.85, c)
    pz = math.copysign(abs(sn) ** 0.85, sn)
    k = 1.0
    if wob:
        w = smooth01(0.58, 0.70, y)
        k = 1.0 + w * (0.05 * math.sin(3 * b + PH[0]) * math.sin(2.5 * a + PH[1]) + 0.03 * math.sin(5 * b + PH[2] + 2 * a))
    rz = RZ * s * k + d
    if wob:   # a slightly fuller face, a rounder back
        rz *= 1.0 + 0.06 * max(0.0, sn) * smooth01(0.45, 0.6, y)
    return (px * (RX * s * k + d), y, pz * rz)


def a_of(y):
    return math.acos(max(-1.0, min(1.0, (YC - y) / RY)))


def torso(m, mat="breading", n=20, v=15):
    rings = []
    for i in range(v + 1):
        a = i / v * math.pi
        rings.append([torso_pt(a, j / n * TAU) for j in range(n)])
    m.loft(rings, mat, cap0=False, cap1=False)


def torso_bvh():
    t = A.Model("tmp")
    torso(t)
    return bvh_of(t)


def neck_y(b):
    """The shirt's top edge: a crew/V neck in front, over the shoulders at the sides."""
    sn = math.sin(b)
    return 0.525 - 0.085 * max(0.0, sn) ** 4 - 0.05 * max(0.0, -sn) ** 2


def shirt_d(y):
    return 0.016 + 0.03 * smooth01(0.0, 1.0, (0.17 - y) / 0.09)


def shirt(m, mat="kit1", trim="kit1Dark", n=20, hem=0.07, rings_n=7):
    R = []
    for i in range(rings_n + 1):
        t = i / rings_n
        ring = []
        for j in range(n):
            b = j / n * TAU
            y = hem + (neck_y(b) - hem) * t
            ring.append(torso_pt(a_of(y), b, wob=False, d=shirt_d(y)))
        R.append(ring)
    m.loft(R, mat, cap0=False, cap1=False)
    # the collar (a rolled trim round the neckline) and the hem (a turned-up band)
    col = []
    for j in range(n + 1):
        b = j / n * TAU
        y = neck_y(b)
        col.append(torso_pt(a_of(y), b, wob=False, d=shirt_d(y) + 0.004))
    A.Model.tube(m, col, 0.017, trim, n=5)
    hemr = []
    for j in range(n + 1):
        b = j / n * TAU
        hemr.append(torso_pt(a_of(hem + 0.006), b, wob=False, d=shirt_d(hem) + 0.003))
    A.Model.tube(m, hemr, 0.011, mat, n=4)


def shorts(m, mat="kit2", stripe="sponsor", n=20):
    prof = [(0.150, 0.198, 0.150), (0.11, 0.214, 0.164), (0.03, 0.222, 0.172), (-0.04, 0.218, 0.168), (-0.075, 0.196, 0.15), (-0.085, 0.12, 0.09)]
    R = []
    for y, rx, rz in prof:
        ring = []
        for j in range(n):
            b = j / n * TAU
            c, sn = math.cos(b), math.sin(b)
            ring.append((math.copysign(abs(c) ** 0.8, c) * rx, y, math.copysign(abs(sn) ** 0.8, sn) * rz))
        R.append(ring)
    m.loft(R, mat, cap0=False, cap1=True)
    for s in (-1, 1):   # side stripes
        m.push(s * 0.221, 0.0, 0.0, 0, 0, 0)
        m.box((0, 0.0, 0), (0.008, 0.13, 0.03), stripe, bev=0)
        m.pop()


def face(m, bvh, y_eye=0.60, x_eye=0.062, grin=True):
    for s in (-1, 1):
        loc, nrm = surf(bvh, (s * x_eye, y_eye, 0.6), (0, 0, -1))
        push_on(m, loc, nrm)
        m.push(0, 0, 0.0, s=(1, 1.28, 1))
        m.cyl((0, 0, 0.002), 0.036, 0.012, "eyeWhite", n=12, axis="z")
        m.cyl((-s * 0.006, 0.002, 0.009), 0.019, 0.006, "pupil", n=10, axis="z")
        m.pop()
        m.box((-s * 0.012, 0.018, 0.013), (0.008, 0.008, 0.003), "eyeWhite", bev=0)   # the glint
        m.pop()
        # a brow: a short dark crumb ridge
        loc, nrm = surf(bvh, (s * (x_eye + 0.004), y_eye + 0.068, 0.6), (0, 0, -1))
        push_on(m, loc, nrm, roll=s * 0.22)
        m.box((0, 0, 0), (0.05, 0.012, 0.012), "breadDark", bev=0)
        m.pop()
    if grin:
        pts = []
        for k in range(7):
            x = -0.04 + 0.08 * k / 6
            y = y_eye - 0.085 + 0.025 * (x / 0.04) ** 2
            loc, nrm = surf(bvh, (x, y, 0.6), (0, 0, -1))
            pts.append(tuple(loc + nrm * 0.002))
        m.tube(pts, 0.0075, "pupil", n=5)


def crumbs(m, bvh, k=7, seed=3, y_min=0.6):
    rnd = random.Random(seed)
    placed = 0
    tries = 0
    while placed < k and tries < 200:
        tries += 1
        b = rnd.uniform(0, TAU)
        a = rnd.uniform(2.1, 2.9)
        d = Vector((math.cos(b) * math.sin(a), -math.cos(a), math.sin(b) * math.sin(a)))
        if d.z > 0.2 and abs(d.x) < 0.75 and a < 2.75:     # keep the face clear
            continue
        loc, nrm = surf(bvh, Vector((0, YC, 0)) + d * 0.8, -d)
        if loc is None or loc.y < y_min:
            continue
        m.ball(tuple(loc - nrm * 0.006), rnd.uniform(0.018, 0.028), "breadDark" if rnd.random() < 0.6 else "breading", u=6, v=4,
               s=(1, 0.7, 1))
        placed += 1


def crest_and_sponsor(m, bvh_shirt):
    # the crest: a little shield on the left chest (+x is the player's left)
    loc, nrm = surf(bvh_shirt, (0.085, 0.40, 0.6), (0, 0, -1))
    push_on(m, loc, nrm)
    sh = [(-0.028, 0.03), (0.028, 0.03), (0.028, 0.0), (0.0, -0.034), (-0.028, 0.0)]
    m.prism_z(sh, -0.004, 0.004, "crestGold", bev=0)
    m.prism_z([(x * 0.7, y * 0.7) for x, y in sh], 0.003, 0.006, "crestNavy", bev=0)
    m.pop()
    # the sponsor: a pale rounded patch across the chest with a red mark
    loc, nrm = surf(bvh_shirt, (0.0, 0.28, 0.6), (0, 0, -1))
    push_on(m, loc, nrm)
    m.box((0, 0, 0.0), (0.17, 0.05, 0.008), "sponsor", bev=0.003)
    m.box((-0.05, 0, 0.005), (0.04, 0.026, 0.004), "sponsorRed", bev=0)
    m.box((0.025, 0, 0.005), (0.07, 0.01, 0.004), "sponsorRed", bev=0)
    m.pop()


def shirt_bvh(mat="kit1"):
    t = A.Model("tmp")
    shirt(t)
    return bvh_of(t)


def build_body(gk=False):
    m = FM("p.bodyGK" if gk else "p.body", 50)
    tb = torso_bvh()
    torso(m)
    shirt(m, trim="kit1Dark" if not gk else "kit1Dark")
    shorts(m)
    face(m, tb)
    crumbs(m, tb, k=5 if gk else 6, seed=5)
    sb = shirt_bvh()
    if not gk:
        crest_and_sponsor(m, sb)
        for s in (-1, 1):   # the sleeves' shoulder caps (the arm's top sphere sits inside)
            m.ball((s * SHOULDER[0], SHOULDER[1], 0), 0.08, "kit1", u=10, v=6)
    else:
        # the keeper's padded top: big padded shoulders, quilted ribs across the chest and back, a number
        for s in (-1, 1):
            m.ball((s * SHOULDER[0], SHOULDER[1], 0), 0.088, "kit1", u=10, v=6)
            m.push(s * (SHOULDER[0] - 0.01), SHOULDER[1] + 0.03, 0, 0, 0, -s * 0.5)
            m.ball((0, 0.0, 0), 0.07, "kit1Dark", u=8, v=4, s=(1.0, 0.55, 1.15))
            m.pop()
        for y in (0.22,):
            ring = []
            for j in range(15):
                b = math.pi * 0.08 + (math.pi * 0.84) * j / 14
                ring.append(torso_pt(a_of(y), b, wob=False, d=shirt_d(y) + 0.004))
            m.tube(ring, 0.012, "kit1Dark", n=5)
        # a padded chest block
        loc, nrm = surf(sb, (0.0, 0.39, 0.6), (0, 0, -1))
        push_on(m, loc, nrm)
        m.box((0, 0, 0.0), (0.2, 0.08, 0.02), "kit1Dark", bev=0.008)
        m.box((0.06, 0.0, 0.012), (0.04, 0.03, 0.006), "crestGold", bev=0)
        m.pop()
    return m


def build_arm(gk=False):
    """The shoulder sphere, a sleeve, a breaded arm, a mitten (gk: a long padded sleeve and big gloves)."""
    m = FM("p.armGK" if gk else "p.arm", 50)
    if not gk:
        m.lathe([(0.0, 0.072), (0.042, 0.058), (0.064, 0.03), (0.072, 0.0), (0.07, -0.08), (0.066, -0.14), (0.0, -0.14)], "kit1", n=12)
        m.lathe([(0.064, -0.122), (0.071, -0.126), (0.071, -0.142), (0.064, -0.146)], "kit1Dark", n=12, ring=True)
        bread_limb(m, -0.10, -0.42, 0.053, 0.046, seed=2, n=9, mid=3, dome_top=False, dome_bot=False, amp=0.06)
        hand(m, -0.47)
    else:
        m.lathe([(0.0, 0.074), (0.044, 0.06), (0.066, 0.03), (0.074, 0.0), (0.07, -0.12), (0.064, -0.25), (0.058, -0.40), (0.056, -0.44),
                 (0.0, -0.44)], "kit1", n=10)
        m.ball((0, -0.24, -0.032), 0.052, "kit1Dark", u=8, v=5, s=(1.15, 1.2, 0.7))      # the elbow pad (behind)
        m.lathe([(0.052, -0.41), (0.062, -0.415), (0.062, -0.44), (0.052, -0.445)], "kit1Dark", n=12, ring=True)
        glove(m, -0.52)
    return m


def hand(m, y):
    m.ball((0, y, 0.0), 0.05, "breading", u=10, v=6, s=(1.0, 1.4, 0.82))
    m.ball((0, y - 0.035, 0.008), 0.042, "breading", u=8, v=5, s=(1.0, 1.0, 0.9))
    m.push(0.0, y + 0.012, 0.038, 0, -0.5)
    m.ball((0, 0, 0), 0.02, "breadDark", u=6, v=4, s=(1.0, 1.6, 1.0))                 # the thumb (+z)
    m.pop()


def glove(m, y):
    m.lathe([(0.0, y + 0.085), (0.056, y + 0.082), (0.064, y + 0.06), (0.0, y + 0.05)], "gloveDark", n=10)  # the cuff
    m.box((0, y + 0.068, 0.0), (0.135, 0.022, 0.13), "gloveWhite", bev=0.008)            # the wrist strap
    m.box((0, y - 0.005, 0.0), (0.12, 0.12, 0.085), "glove", bev=0.03)                   # the palm
    m.box((0, y - 0.095, 0.0), (0.118, 0.08, 0.07), "glove", bev=0.026)  # the fingers
    for x in (-0.03, 0.0, 0.03):
        m.box((x, y - 0.1, 0.0), (0.004, 0.06, 0.072), "gloveDark", bev=0)
    m.push(0.0, y + 0.005, 0.05, 0, -0.6)
    m.box((0, -0.03, 0), (0.04, 0.075, 0.04), "glove", bev=0.016)                       # the thumb (+z)
    m.pop()
    m.box((0, y - 0.01, 0.043), (0.07, 0.07, 0.006), "gloveDark", bev=0)                 # the grip patch


def build_thigh():
    m = FM("p.thigh", 50)
    m.lathe([(0.0, 0.094), (0.05, 0.08), (0.08, 0.048), (0.094, 0.0), (0.096, -0.09), (0.098, -0.168), (0.0, -0.168)], "kit2", n=14)
    m.lathe([(0.09, -0.152), (0.101, -0.156), (0.101, -0.172), (0.09, -0.176)], "kit2Dark", n=14, ring=True)
    bread_limb(m, -0.14, KNEE_Y, 0.078, 0.062, seed=4, n=10, mid=4, dome_top=False, dome_bot=True, rb=0.064, amp=0.06)
    return m


def build_shin():
    m = FM("p.shin", 50)
    bread_limb(m, 0.0, -0.08, 0.061, 0.058, seed=7, n=10, mid=1, dome_top=True, dome_bot=False, rt=0.061, amp=0.05)
    # the sock: a turned-over band at the top, the shin-pad bulge, the ankle
    m.lathe([(0.0, -0.06), (0.068, -0.06), (0.07, -0.075), (0.066, -0.12), (0.066, -0.17), (0.061, -0.24),
             (0.05, -0.32), (0.048, -0.37), (0.0, -0.37)], "kit3", n=10)
    m.lathe([(0.068, -0.075), (0.0715, -0.08), (0.0715, -0.105), (0.068, -0.11)], "kit3Dark", n=10, ring=True)
    m.push(0, -0.19, 0.04, s=(1, 1, 1))
    m.ball((0, 0, 0), 0.05, "kit3", u=8, v=4, s=(0.95, 1.8, 0.55))                     # the shin pad under the sock
    m.pop()
    boot(m)
    return m


def boot(m):
    """The boot: a loft of rounded sections heel→toe, sole flat at SOLE_Y, a bright stripe, studs."""
    yb = SOLE_Y + 0.012
    secs = [(-0.08, -0.395, 0.032), (-0.072, -0.35, 0.046), (-0.04, -0.335, 0.052), (0.0, -0.34, 0.054), (0.04, -0.372, 0.055),
            (0.09, -0.392, 0.055), (0.14, -0.402, 0.05), (0.175, -0.41, 0.04), (0.198, -0.42, 0.022)]
    rings = []
    n = 10
    for z, yt, hw in secs:
        ring = []
        hh = (yt - yb) / 2
        yc = (yt + yb) / 2
        for j in range(n):
            b = j / n * TAU
            c, s = math.cos(b), math.sin(b)
            x = math.copysign(abs(c) ** 0.55, c) * hw
            y = yc + math.copysign(abs(s) ** 0.55, s) * hh
            ring.append((x, max(yb, y), z))
        rings.append(ring)
    m.loft(rings, "boot")
    # the sole plate, its flat underside at SOLE_Y
    m.prism_y([(-0.045, -0.075), (0.045, -0.075), (0.054, 0.0), (0.052, 0.12), (0.03, 0.195), (-0.03, 0.195), (-0.052, 0.12), (-0.054, 0.0)],
              SOLE_Y, yb + 0.003, "boot", bev=0)
    # the stripe: a swoosh down each side
    for s in (-1, 1):
        m.push(s * 0.053, -0.385, 0.03, s * 0.0, 0, 0)
        m.push(0, 0, 0, 0, 0.42)
        m.box((0, 0, 0), (0.006, 0.014, 0.13), "bootStripe", bev=0)
        m.pop()
        m.pop()
    m.box((0, -0.4, 0.13), (0.07, 0.006, 0.05), "bootStripe", bev=0)     # a lace-panel flash on top of the toe box
    # studs: dip 1.2 cm below the sole (into the turf)
    for x, z in ((-0.03, -0.05), (0.03, -0.05), (-0.035, 0.07), (0.035, 0.07), (-0.025, 0.15), (0.025, 0.15)):
        m.cyl((x, SOLE_Y - 0.004, z), 0.011, 0.016, "stud", n=4, r2=0.008)


def build_hair(k):
    m = FM("p.hair%d" % k, 45)
    tb = torso_bvh()
    c = Vector((0, 0.44, 0))
    cb = Vector((0, 0.62, 0))   # the beanie's centre
    if k == 0:   # a headband with tails knotted at the back
        rings = []
        n = 20
        for j in range(n):
            b = j / n * TAU
            d = Vector((math.cos(b), 0, math.sin(b)))
            sec = []
            for dy, out in ((-0.02, 0.004), (-0.02, 0.016), (0.02, 0.016), (0.02, 0.004)):
                loc, nrm = surf(tb, Vector((0, 0.695 + dy, 0)) + d * 0.6, -d)
                sec.append(tuple(loc + d * out))
            rings.append(sec)
        rings.append(rings[0])
        m.loft(rings, "headband", cap0=False, cap1=False)
        loc, nrm = surf(tb, (0, 0.695, -0.6), (0, 0, 1))
        m.ball(tuple(loc + Vector((0, 0, -0.012))), 0.022, "headbandDark", u=8, v=5)
        for s in (-1, 1):
            m.push(loc.x + s * 0.012, loc.y - 0.005, loc.z - 0.02, s * 0.3, 0.35, s * 0.35)
            m.box((0, -0.05, -0.005), (0.026, 0.1, 0.008), "headband", bev=0, taper=(1.6, 1.0))
            m.pop()
    elif k == 1:  # a mohawk: a crest of crunchy crumb spikes front to back
        for i in range(9):
            t = i / 8
            ang = math.radians(-38 + t * 100)           # from the brow (front, +z) over to the back
            d = Vector((0, math.cos(ang), -math.sin(ang)))   # ang < 0 → the front (+z)
            loc, nrm = surf(tb, c + d * 0.8, -d)
            h = 0.06 + 0.05 * math.sin(t * math.pi)
            push_on(m, loc, nrm, out=-0.01)
            m.push(0, 0, 0, 0, -0.35)
            m.cyl((0, 0, h / 2), 0.03 - 0.008 * abs(t - 0.5), h, "breadDark" if i % 2 else "crestGold", n=6, r2=0.004, axis="z")
            m.pop()
            m.pop()
    else:        # a knitted beanie with a turned-up cuff and a bobble
        n = 14
        rings = []
        for i, ph in enumerate((0, 18, 34, 48, 60)):
            a = math.radians(ph)
            ring = []
            for j in range(n):
                b = j / n * TAU
                d = Vector((math.cos(b) * math.sin(a), math.cos(a), math.sin(b) * math.sin(a)))
                loc, nrm = surf(tb, cb + d * 0.8, -d)
                ring.append(tuple(loc + d * 0.02))
            rings.append(ring)
        m.loft(rings, "beanie", cap0=False, cap1=False)
        a0, a1 = math.radians(56), math.radians(70)
        cuff = []
        for j in range(n):
            b = j / n * TAU
            sec = []
            for a, out in ((a0, 0.02), (a0, 0.04), (a1, 0.04), (a1, 0.012)):
                d = Vector((math.cos(b) * math.sin(a), math.cos(a), math.sin(b) * math.sin(a)))
                loc, nrm = surf(tb, cb + d * 0.8, -d)
                sec.append(tuple(loc + d * out))
            cuff.append(sec)
        cuff.append(cuff[0])
        m.loft(cuff, "beanieCuff", cap0=False, cap1=False)
        top, _ = surf(tb, cb + Vector((0, 0.8, 0)), (0, -1, 0))
        m.ball(tuple(top + Vector((0, 0.055, 0))), 0.036, "beanieCuff", u=7, v=5)
    return m


# =========================================================================================================
# THE BALL
# =========================================================================================================
def build_ball():
    """A truncated icosahedron projected onto the sphere: 12 dark pentagons, 20 white hexagons, each panel a
    slightly inset pillow over a darker seam sphere."""
    m = FM("ball", 72)
    R = 0.1115
    phi = (1 + 5 ** 0.5) / 2
    V = [Vector(v).normalized() for v in [(-1, phi, 0), (1, phi, 0), (-1, -phi, 0), (1, -phi, 0), (0, -1, phi), (0, 1, phi), (0, -1, -phi),
                                          (0, 1, -phi), (phi, 0, -1), (phi, 0, 1), (-phi, 0, -1), (-phi, 0, 1)]]
    F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4),
         (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    P = lambda a, b: V[a] + (V[b] - V[a]) / 3
    panels = []
    for f in F:
        a, b, c = f
        panels.append(([P(a, b), P(b, a), P(b, c), P(c, b), P(c, a), P(a, c)], "ballWhite"))
    for vi in range(12):
        nb = sorted({x for f in F if vi in f for x in f if x != vi})
        cen = V[vi]
        ax = (V[nb[0]] - cen).normalized()
        ay = cen.cross(ax).normalized()
        nb.sort(key=lambda x: math.atan2((V[x] - cen).dot(ay), (V[x] - cen).dot(ax)))
        panels.append(([P(vi, x) for x in nb], "ballDark"))
    for poly, mat in panels:
        cen = sum(poly, Vector()) / len(poly)
        cn = cen.normalized()
        # wind outward
        if (poly[1] - poly[0]).cross(poly[2] - poly[1]).dot(cn) < 0:
            poly = poly[::-1]
        k = len(poly)
        seam = 0.075
        outer = []
        for i in range(k):
            p0 = poly[i].lerp(cen, seam)
            p1 = poly[(i + 1) % k].lerp(cen, seam)
            outer += [p0, p0.lerp(p1, 0.5)]
        mid = [poly[i].lerp(cen, 0.52) for i in range(k)]
        pts = [cn * R * 1.0] + [p.normalized() * R * 0.997 for p in mid] + [p.normalized() * R * 0.985 for p in outer]
        faces = []
        for i in range(k):
            faces.append((0, 1 + i, 1 + (i + 1) % k))
            o = 1 + k
            m0, m1 = 1 + i, 1 + (i + 1) % k
            oc, oe, on = o + 2 * i, o + 2 * i + 1, o + (2 * i + 2) % (2 * k)
            faces += [(m0, oc, oe), (m0, oe, m1), (m1, oe, on)]
        mesh(m, [tuple(p) for p in pts], faces, mat)
    res = bmesh.ops.create_icosphere(m.bm, subdivisions=2, radius=R * 0.968, matrix=Matrix.Identity(4))
    m._done(res["verts"], "ballSeam")
    return m


# =========================================================================================================
# PITCH FURNITURE
# =========================================================================================================
GOAL_X, GOAL_H, GOAL_R = 3.66, 2.44, 0.06
NET_DEPTH, NET_KINK = 2.0, (2.30, -0.9)   # the net's roof runs back to the kink bar (y 2.30, z −0.9), then slopes to the ground at z −2.0
NET_STEP, NET_W = 0.18, 0.011


def build_goal():
    m = FM("goal", 40)
    X, H = GOAL_X, GOAL_H
    ky, kz = NET_KINK
    # posts and crossbar: white, round, a little ground socket
    for s in (-1, 1):
        pole(m, (s * X, 0, 0), GOAL_R, 0.0, H + GOAL_R, "goalWhite", n=16, step=0.35)
        m.cyl((s * X, 0.01, 0), GOAL_R + 0.02, 0.02, "netFrame", n=12)
    m.push(0, H, 0, 0, 0, math.pi / 2)
    pole(m, (0, 0, 0), GOAL_R, -X - GOAL_R, X + GOAL_R, "goalWhite", n=16, step=0.5)
    m.pop()
    # the back frame: stanchions from the post tops back to the kink, down to the ground; ground bars
    for s in (-1, 1):
        m.tube([(s * X, H - 0.02, -0.04), (s * X, ky, kz), (s * X, 0.03, -NET_DEPTH)], 0.022, "netFrame", n=8)
        m.tube([(s * X, 0.025, -0.04), (s * X, 0.025, -NET_DEPTH)], 0.02, "netFrame", n=6)
    m.tube([(-X, ky, kz), (X, ky, kz)], 0.022, "netFrame", n=8)
    m.tube([(-X, 0.025, -NET_DEPTH), (X, 0.025, -NET_DEPTH)], 0.022, "netFrame", n=8)

    sag = 0.07

    def line(pts):
        wire(m, pts, NET_W, "net")

    def segs(a, b, L, bulge=lambda t: Vector()):
        k = max(1, int(math.ceil(L / 1.25)))
        return [tuple(a.lerp(b, i / k) + bulge(i / k)) for i in range(k + 1)]

    inset = 0.035   # strings sit just inside the frame (behind the posts / bar)
    # roof: crossbar → kink bar
    A0, A1 = Vector((0, H - inset, -inset)), Vector((0, ky - inset, kz))
    nz = int(round(abs(kz) / NET_STEP))
    for i in range(1, nz + 1):
        t = i / nz
        p = A0.lerp(A1, t)
        line(segs(Vector((-X, p.y, p.z)), Vector((X, p.y, p.z)), 2 * X, lambda u: Vector((0, -sag * 0.6 * math.sin(math.pi * u), 0))))
    nx = int(round(2 * X / NET_STEP))
    for i in range(nx + 1):
        x = -X + 2 * X * i / nx
        line([(x, H - inset, -inset), (x, ky - inset - sag * 0.6 * math.sin(math.pi * i / nx), kz)])
    # back: kink bar → ground bar (sloped)
    B0, B1 = Vector((0, ky - inset, kz)), Vector((0, 0.02, -NET_DEPTH + 0.0))
    L = (B1 - B0).length
    nv = int(round(L / NET_STEP))
    for i in range(1, nv + 1):
        t = i / nv
        p = B0.lerp(B1, t)
        bul = sag * math.sin(math.pi * t)
        line(segs(Vector((-X, p.y, p.z)), Vector((X, p.y, p.z)), 2 * X,
                  lambda u, bul=bul: Vector((0, 0, -bul * (0.4 + 0.6 * math.sin(math.pi * u))))))
    for i in range(nx + 1):
        x = -X + 2 * X * i / nx
        u = i / nx
        pts = []
        for k in range(5):
            t = k / 4
            p = B0.lerp(B1, t)
            bul = sag * math.sin(math.pi * t) * (0.4 + 0.6 * math.sin(math.pi * u))
            pts.append((x, p.y - (sag * 0.6 * math.sin(math.pi * u) if k == 0 else 0), p.z - bul))
        line(pts)
    # sides: the panel under roof + slope, in the plane x = ±X (strings just inside it)
    def top_y(z):   # the side panel's upper edge at depth z (z ≤ 0)
        if z >= kz:
            return H + (ky - H) * (z / kz)
        return ky * (z + NET_DEPTH) / (NET_DEPTH + kz)

    def back_z(y):  # its back edge at height y
        if y <= ky:
            return -NET_DEPTH + (NET_DEPTH + kz) * (y / ky)
        return kz * (H - y) / (H - ky)

    for s in (-1, 1):
        xs = s * (X - 0.012)
        nzs = int(round(NET_DEPTH / NET_STEP))
        for i in range(1, nzs):
            z = -NET_DEPTH * i / nzs
            yt = top_y(z) - 0.02
            line(segs(Vector((xs, 0.02, z)), Vector((xs, yt, z)), yt))
        nys = int(round(H / NET_STEP))
        for i in range(1, nys):
            y = H * i / nys
            zb = back_z(y)
            line(segs(Vector((xs, y, -0.03)), Vector((xs, y, zb)), abs(zb)))
    return m


def build_flag():
    m = FM("flag", 45)
    m.cyl((0, 0.012, 0), 0.05, 0.024, "flagBase", n=10, r2=0.04)
    for k in range(6):   # a striped pole: six 0.25 m bands
        m.lathe([(0.016, k * 0.25), (0.016, (k + 1) * 0.25)], "flagPole" if k % 2 == 0 else "flagCloth", n=8, caps=False)
    m.ball((0, 1.505, 0), 0.022, "flagPole", u=8, v=4)
    # the cloth: a waving panel, two-sided
    nu, nv = 5, 3
    W, Hh, y1 = 0.44, 0.32, 1.48
    pts, pts2 = [], []
    for j in range(nv + 1):
        for i in range(nu + 1):
            u, v = i / nu, j / nv
            x = 0.016 + u * W
            y = y1 - v * Hh - u * 0.03
            z = 0.045 * math.sin(u * 2.6 + 0.4) * u
            pts.append((x, y, z + 0.004))
            pts2.append((x, y, z - 0.004))
    faces, faces2 = [], []
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            q = (a, a + nu + 1, a + nu + 2, a + 1)
            faces.append(q)
            faces2.append(q[::-1])
    mesh(m, pts, faces, "flagCloth")
    mesh(m, pts2, faces2, "flagCloth")
    return m


def build_adboard():
    m = FM("adboard", 30)
    m.box((0, 0.5, -0.015), (6.0, 0.9, 0.03), "adFace", bev=0)                # the face: z = 0, x −3..3, y 0.05..0.95
    m.box((0, 0.975, -0.05), (6.08, 0.05, 0.1), "adFrame", bev=0.008)
    m.box((0, 0.025, -0.05), (6.08, 0.05, 0.1), "adFrame", bev=0.008)
    for s in (-1, 1):
        m.box((s * 3.02, 0.5, -0.05), (0.04, 1.0, 0.1), "adFrame", bev=0.006)
    m.box((0, 0.5, -0.09), (6.0, 0.9, 0.02), "adFrame", bev=0)                 # the back skin
    for x in (-2.2, 0.0, 2.2):
        m.bar((x, 0.9, -0.1), (x, 0.025, -0.62), 0.05, "adFrame")
        m.bar((x, 0.026, -0.1), (x, 0.026, -0.66), 0.05, "adFrame")
    return m


def lattice(m, a_lo, a_hi, half_lo, half_hi, mat, bays=4, w=0.012):
    """alertrig's 4-legged lattice, but the legs are split at every bay (vertices for the baked AO)."""
    a_lo, a_hi = Vector(a_lo), Vector(a_hi)
    corners = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    lv = lambda t: [a_lo + (a_hi - a_lo) * t + Vector((sx * (half_lo + (half_hi - half_lo) * t), 0, sz * (half_lo + (half_hi - half_lo) * t)))
                    for sx, sz in corners]
    for b in range(bays + 1):
        ring = lv(b / bays)
        for i in range(4):
            m.bar(ring[i], ring[(i + 1) % 4], w, mat)
        if b < bays:
            nxt = lv((b + 1) / bays)
            for i in range(4):
                m.bar(ring[i], nxt[(i + 1) % 4], w * 0.8, mat)
    for i in range(4):
        wire(m, [lv(b / bays)[i] for b in range(bays + 1)], w * 1.4, mat)


def build_flood():
    m = FM("floodlight", 30)
    m.box((0, 0.2, 0), (3.2, 0.4, 3.2), "standConcDark", bev=0.04)
    lattice(m, (0, 0.4, 0), (0, 29.2, 0), 1.25, 0.42, "towerSteel", bays=12, w=0.11)
    # the head: struts up to the lamp bank, tilted down at the pitch (−z)
    m.box((0, 29.25, 0), (1.3, 0.2, 1.3), "towerSteel", bev=0)
    for s in (-1, 1):
        m.bar((s * 0.42, 29.2, 0.42), (s * 2.6, 31.0, -0.2), 0.14, "towerSteel")
        m.bar((s * 0.42, 29.2, -0.42), (s * 1.2, 30.2, -0.9), 0.12, "towerSteel")
    # the service platform
    m.box((0, 29.4, -0.6), (6.6, 0.12, 1.6), "lampHousing", bev=0)
    for x in (-3.2, -1.6, 0.0, 1.6, 3.2):
        m.bar((x, 29.45, -1.38), (x, 30.5, -1.38), 0.05, "towerSteel")
    m.bar((-3.2, 30.5, -1.38), (3.2, 30.5, -1.38), 0.05, "towerSteel")
    m.push(0, 31.6, -0.6, 0, -math.radians(25))
    m.box((0, 0, 0.12), (7.4, 4.2, 0.24), "lampHousing", bev=0.03)
    for xx in (-3.7, 3.7):
        m.box((xx, 0, 0.0), (0.16, 4.3, 0.5), "towerSteel", bev=0)
    for yy in (-2.1, 2.1):
        m.box((0, yy, 0.0), (7.5, 0.16, 0.5), "towerSteel", bev=0)
    for r in range(4):
        for c in range(7):
            x = -3.0 + c * 1.0
            y = -1.5 + r * 1.0
            m.box((x, y, -0.18), (0.86, 0.86, 0.36), "lampHousing", bev=0)
            m.box((x, y, -0.37), (0.7, 0.7, 0.03), "light", bev=0)
    m.pop()
    return m


def build_dugout():
    """A 6 m team shelter facing +z: a quarter-pipe roof of dark tinted perspex on white ribs, seats in kit1."""
    m = FM("dugout", 38)
    m.box((0, 0.06, -0.05), (6.3, 0.12, 2.3), "standConc", bev=0.02)
    W = 3.05
    arc = []
    for k in range(9):
        t = k / 8 * (math.pi / 2)
        arc.append((1.05 - 2.15 * math.cos(t), 0.12 + 1.98 * math.sin(t), t))
    # the shell: sweep a thin slab along the arc, across x
    rings = []
    for z, y, t in arc:
        nz, ny = -math.cos(t) * 1.98, math.sin(t) * 2.15      # outward-ish normal of the ellipse (scaled)
        L = math.hypot(nz, ny)
        nz, ny = nz / L * 0.03, ny / L * 0.03
        rings.append([(-W, y, z), (W, y, z), (W, y - ny, z - nz), (-W, y - ny, z - nz)])
    rings_t = [[(p[0], p[1], p[2]) for p in r] for r in rings]
    m.loft(rings_t, "perspex")
    for x in (-W, -1.52, 0.0, 1.52, W):
        m.tube([(x, y + 0.02, z - 0.0) for z, y, t in arc], 0.035, "goalWhite", n=6)
    for s in (-1, 1):
        m.prism_x([(z, y) for z, y, t in arc] + [(1.05, 0.12)], s * W - 0.012, s * W + 0.012, "perspex", bev=0)
        m.tube([(s * W, 0.12, 1.05), (s * W, 2.1, 1.05)], 0.035, "goalWhite", n=6)
    m.box((0, 2.06, 1.05), (6.2, 0.1, 0.1), "goalWhite", bev=0.01)
    # the bench: a dark rail, bucket seats in the home colour
    m.box((0, 0.3, -0.45), (5.8, 0.36, 0.3), "seatFrame", bev=0.02)
    for i in range(8):
        x = -2.6 + i * (5.2 / 7)
        m.box((x, 0.53, -0.38), (0.5, 0.08, 0.46), "kit1", bev=0.03)
        m.push(x, 0.88, -0.66, 0, -0.18)
        m.box((0, 0, 0), (0.5, 0.62, 0.07), "kit1", bev=0.03)
        m.pop()
        for s in (-1, 1):
            m.box((x + s * 0.255, 0.68, -0.44), (0.04, 0.3, 0.34), "kit1Dark", bev=0.01)
    m.box((0, 0.2, 0.75), (6.0, 0.16, 0.12), "standConcLite", bev=0.02)        # a kick step at the front
    return m


# =========================================================================================================
# THE STADIUM
# =========================================================================================================
ROWS, RISE, RUN = 16, 0.45, 0.85
WALL_H, WALL_T, TREAD0 = 1.1, 0.3, 0.65
SEAT_H, SEAT_Z = 0.44, 0.40          # the seat top above its tread, the seat centre behind the tread's front edge
AISLES, AISLE_W = (-10.0, -10.0 / 3, 10.0 / 3, 10.0), 1.2
ROOF_Z0, ROOF_Z1 = 4.8, 15.2
COL_Z = 14.6


def tread_y(i):
    return TREAD0 + RISE * i


def tread_z(i):
    return WALL_T + RUN * i


STAND_ROWS = [(round(tread_y(i) + SEAT_H, 3), round(tread_z(i) + SEAT_Z, 3)) for i in range(ROWS)]
BACK_Z = tread_z(ROWS)                 # 13.9
BACK_TOP = tread_y(ROWS - 1) + 1.4


def roof_y(z):
    """The roof's underside: highest at the front lip (it rises toward the pitch)."""
    return 12.3 + (z - ROOF_Z0) / (ROOF_Z1 - ROOF_Z0) * (11.75 - 12.3)


def seat_prof():
    """The seat row's cross-section (z from the tread front, y from the tread top): pan and back (convex each)."""
    pan = [(0.16, SEAT_H - 0.05), (0.62, SEAT_H - 0.06), (0.62, SEAT_H - 0.005), (0.2, SEAT_H), (0.16, SEAT_H - 0.02)]
    back = [(0.6, SEAT_H - 0.02), (0.67, SEAT_H - 0.02), (0.74, SEAT_H + 0.38), (0.67, SEAT_H + 0.40)]
    return pan, back


def build_stand():
    m = FM("stand", 34)
    blocks = [(AISLES[i] + AISLE_W / 2, AISLES[i + 1] - AISLE_W / 2) for i in range(3)]
    aisles = [(-10.0, -10 + AISLE_W / 2)] + [(a - AISLE_W / 2, a + AISLE_W / 2) for a in AISLES[1:3]] + [(10 - AISLE_W / 2, 10.0)]
    # the front wall with its coping and a rail
    m.box((0, WALL_H / 2, WALL_T / 2), (20.0, WALL_H, WALL_T), "standConcDark", bev=0.03)
    m.box((0, WALL_H + 0.04, WALL_T / 2), (20.0, 0.08, WALL_T + 0.06), "standConcLite", bev=0.02)
    for k in range(8):
        x = -8.75 + k * 2.5
        m.bar((x, WALL_H + 0.08, 0.15), (x, WALL_H + 0.85, 0.15), 0.045, "standSteel")
    m.tube([(-10, WALL_H + 0.85, 0.15), (10, WALL_H + 0.85, 0.15)], 0.03, "standSteel", n=6)
    pan, back = seat_prof()
    for i in range(ROWS):
        y1, z0 = tread_y(i), tread_z(i)
        y0 = 0.0 if i == 0 else y1 - RISE
        for x0, x1 in blocks + aisles:
            m.box(((x0 + x1) / 2, (y0 + y1) / 2, z0 + RUN / 2), (x1 - x0, y1 - y0, RUN), "standConc", bev=0.025 if (x0, x1) in blocks else 0)
        for x0, x1 in blocks:
            m.prism_x([(z0 + z, y1 + y) for z, y in pan], x0 + 0.05, x1 - 0.05, "kit1", bev=0)
            m.prism_x([(z0 + z, y1 + y) for z, y in back], x0 + 0.05, x1 - 0.05, "kit1", bev=0)
            m.box(((x0 + x1) / 2, y1 + 0.19, z0 + 0.42), (x1 - x0 - 0.3, 0.38, 0.1), "seatFrame", bev=0)
        for x0, x1 in aisles:   # the intermediate step in each aisle, a yellow nosing on both steps
            m.box(((x0 + x1) / 2, y1 + RISE / 4, z0 + RUN * 0.75), (x1 - x0, RISE / 2, RUN / 2), "standStep", bev=0.015)
            m.box(((x0 + x1) / 2, y1 + RISE / 2 + 0.005, z0 + RUN / 2 + 0.03), (x1 - x0, 0.012, 0.06), "nosing", bev=0)
            if i > 0:
                m.box(((x0 + x1) / 2, y1 + 0.005, z0 + 0.03), (x1 - x0, 0.012, 0.06), "nosing", bev=0)
    # handrails up the middle of the full aisles
    for a in AISLES[1:3]:
        pts = [(a, tread_y(i) + 0.95, tread_z(i) + 0.4) for i in (0, ROWS - 1)]
        m.tube(pts, 0.025, "standSteel", n=6)
        for i in range(0, ROWS, 3):
            m.bar((a, tread_y(i) + RISE / 2, tread_z(i) + 0.4), (a, tread_y(i) + 0.95 + (0.0), tread_z(i) + 0.4), 0.04, "standSteel")
    # the back wall (ground to above the top row) and its coping
    m.box((0, BACK_TOP / 2, BACK_Z + 0.15), (20.0, BACK_TOP, 0.3), "standConcDark", bev=0.03)
    m.box((0, BACK_TOP + 0.04, BACK_Z + 0.15), (20.0, 0.08, 0.38), "standConcLite", bev=0.02)
    roof(m, -10.0, 10.0, (-20.0 / 3, 0.0, 20.0 / 3))
    return m


def roof(m, x0, x1, cols):
    """The cantilevered roof: a sheet rising toward the pitch, ribbed on top, a fascia with a lamp strip,
    tapered beams under it from columns behind the stand, masts with tie rods."""
    z0, z1 = ROOF_Z0, ROOF_Z1
    m.prism_x([(z0, roof_y(z0)), (z1, roof_y(z1)), (z1, roof_y(z1) + 0.22), (z0, roof_y(z0) + 0.22)], x0, x1, "roofSheet", bev=0)
    ang = math.atan2(roof_y(z0) - roof_y(z1), z1 - z0)
    zm = (z0 + z1) / 2
    for k in range(20):
        x = x0 + 0.5 + k * (x1 - x0) / 20
        m.push(x, roof_y(zm) + 0.26, zm, 0, ang)
        m.box((0, 0, 0), (0.08, 0.08, z1 - z0), "roofSheet", bev=0)
        m.pop()
    m.prism_x([(z0 - 0.25, roof_y(z0) - 0.45), (z0 + 0.05, roof_y(z0) - 0.45), (z0 + 0.05, roof_y(z0) + 0.4), (z0 - 0.25, roof_y(z0) + 0.4)],
              x0, x1, "fascia", bev=0.03)
    m.box(((x0 + x1) / 2, roof_y(z0) - 0.1, z0 - 0.26), (x1 - x0, 0.16, 0.02), "fasciaStripe", bev=0)
    for k in range(5):
        x = x0 + (k + 0.5) * (x1 - x0) / 5
        m.box((x, roof_y(z0) - 0.48, z0 + 0.3), (2.2, 0.06, 0.25), "light", bev=0)
    for xc in cols:
        pole(m, (xc, 0, COL_Z), 0.26, 0.0, roof_y(COL_Z) + 2.6, "standSteel", n=12, step=2.5)
        m.prism_x([(z1, roof_y(z1)), (z0 + 0.1, roof_y(z0)), (z0 + 0.1, roof_y(z0) - 0.35), (COL_Z, roof_y(COL_Z) - 1.4), (z1, roof_y(z1) - 1.2)],
                  xc - 0.2, xc + 0.2, "standSteel", bev=0.02)
        top = Vector((xc, roof_y(COL_Z) + 2.6, COL_Z))
        m.tube([tuple(top), (xc, roof_y(z0 + 2.5) + 0.25, z0 + 2.5)], 0.05, "standSteel", n=6)
        m.tube([tuple(top), (xc, roof_y(z1) + 0.25, z1 - 0.1)], 0.05, "standSteel", n=6)


def build_corner():
    """The corner filler: rows on quarter circles about the origin (the pitch-side inner corner), θ from +x
    (0) to +z (90°). A stand on yaw 0 centred at (−10, 0, 0) abuts its x = 0 face; a stand on yaw +90°
    centred at (0, 0, −10) abuts its z = 0 face. Radial aisles at 0°/90° (halves) and 45°."""
    m = FM("standCorner", 34)
    K = 10

    def arc(r, a0, a1, k):
        return [(r * math.cos(a0 + (a1 - a0) * j / k), r * math.sin(a0 + (a1 - a0) * j / k)) for j in range(k + 1)]

    def sector(r0, r1, a0, a1, y0, y1, mat, k, bev=0.0):
        outer = arc(r1, a0, a1, k)
        inner = arc(r0, a1, a0, k) if r0 > 1e-6 else [(0.0, 0.0)]
        m.prism_y(outer + inner, y0, y1, mat, bev=bev)

    def arc_sweep(prof, r_front, y_base, a0, a1, k, mat):
        rings = []
        for j in range(k + 1):
            a = a0 + (a1 - a0) * j / k
            c, s = math.cos(a), math.sin(a)
            rings.append([((r_front + z) * c, y_base + y, (r_front + z) * s) for z, y in prof])
        m.loft(rings, mat)

    Q = math.pi / 2
    sector(0.0, WALL_T, 0, Q, 0, WALL_H, "standConcDark", 4)
    sector(0.0, WALL_T + 0.03, 0, Q, WALL_H, WALL_H + 0.08, "standConcLite", 4)
    pan, back = seat_prof()
    for i in range(ROWS):
        y1, r0 = tread_y(i), tread_z(i)
        y0 = 0.0 if i == 0 else y1 - RISE
        k = max(2, int(K * (r0 + RUN) / 14) + 2)
        sector(r0, r0 + RUN, 0, Q, y0, y1, "standConc", k)
        rs = r0 + SEAT_Z
        h = (AISLE_W / 2) / rs
        spans = [(h, Q / 2 - h), (Q / 2 + h, Q - h)]
        for a0, a1 in spans:
            if (a1 - a0) * rs < 0.5:
                continue
            kk = max(1, int(math.ceil((a1 - a0) * rs / 1.6)))
            arc_sweep(pan, r0, y1, a0, a1, kk, "kit1")
            arc_sweep(back, r0, y1, a0, a1, kk, "kit1")
            arc_sweep([(0.37, 0.0), (0.47, 0.0), (0.47, 0.38), (0.37, 0.38)], r0, y1, a0 + 0.02 / rs * 7, a1 - 0.02 / rs * 7, kk, "seatFrame")
        # aisle steps: half aisles on the 0° and 90° edges, a full aisle at 45°
        for a0, a1 in ((0.0, min(Q / 2, h)), (max(Q / 2, Q - h), Q), (max(0.0, Q / 2 - h), min(Q, Q / 2 + h))):
            sector(r0 + RUN / 2, r0 + RUN, a0, a1, y1, y1 + RISE / 2, "standStep", 1)
            sector(r0 + RUN / 2 + 0.0, r0 + RUN / 2 + 0.06, a0, a1, y1 + RISE / 2, y1 + RISE / 2 + 0.012, "nosing", 1)
    # the back wall
    sector(BACK_Z, BACK_Z + 0.3, 0, Q, 0, BACK_TOP, "standConcDark", K)
    sector(BACK_Z - 0.04, BACK_Z + 0.34, 0, Q, BACK_TOP, BACK_TOP + 0.08, "standConcLite", K)
    # the roof: a quarter annulus, fascia, lamps, columns on the 22.5° / 45° / 67.5° radials
    z0, z1 = ROOF_Z0, ROOF_Z1
    rings = []
    for j in range(K + 1):
        a = Q * j / K
        c, s = math.cos(a), math.sin(a)
        rings.append([(z0 * c, roof_y(z0), z0 * s), (z1 * c, roof_y(z1), z1 * s), (z1 * c, roof_y(z1) + 0.22, z1 * s), (z0 * c, roof_y(z0) + 0.22, z0 * s)])
    m.loft(rings, "roofSheet")
    fas = []
    for j in range(K + 1):
        a = Q * j / K
        c, s = math.cos(a), math.sin(a)
        fas.append([((z0 - 0.25) * c, roof_y(z0) - 0.45, (z0 - 0.25) * s), ((z0 + 0.05) * c, roof_y(z0) - 0.45, (z0 + 0.05) * s),
                    ((z0 + 0.05) * c, roof_y(z0) + 0.4, (z0 + 0.05) * s), ((z0 - 0.25) * c, roof_y(z0) + 0.4, (z0 - 0.25) * s)])
    m.loft(fas, "fascia")
    for j in range(1, 7):
        a0 = Q * (j - 0.5) / 7
        a1 = Q * (j + 0.4) / 7
        for z in [z0 + 0.3]:
            sector(z - 0.12, z + 0.12, a0, a1, roof_y(z0) - 0.5, roof_y(z0) - 0.44, "light", 1)
    for k in range(9):   # ribs radially
        a = Q * (k + 0.5) / 9
        c, s = math.cos(a), math.sin(a)
        wire(m, [(z0 * c, roof_y(z0) + 0.26, z0 * s), (z1 * c, roof_y(z1) + 0.26, z1 * s)], 0.08, "roofSheet")
    for a in (Q / 4, Q / 2, 3 * Q / 4):
        c, s = math.cos(a), math.sin(a)
        m.push(0, 0, 0, Q - a)       # local +z along the radial
        pole(m, (0, 0, COL_Z), 0.26, 0.0, roof_y(COL_Z) + 2.6, "standSteel", n=12, step=2.5)
        m.prism_x([(z1, roof_y(z1)), (z0 + 0.1, roof_y(z0)), (z0 + 0.1, roof_y(z0) - 0.35), (COL_Z, roof_y(COL_Z) - 1.4), (z1, roof_y(z1) - 1.2)],
                  -0.2, 0.2, "standSteel", bev=0.02)
        top = (0, roof_y(COL_Z) + 2.6, COL_Z)
        m.tube([top, (0, roof_y(z0 + 2.5) + 0.25, z0 + 2.5)], 0.05, "standSteel", n=6)
        m.tube([top, (0, roof_y(z1) + 0.25, z1 - 0.1)], 0.05, "standSteel", n=6)
        m.pop()
    return m


# =========================================================================================================
# THE CROWD: seated fans, tiny (≤150 tris), origin at the seat surface, facing +z
# =========================================================================================================
def fan_body(m, h, w, d, shirt=True, n=8, lean=0.0):
    """A low-poly nugget: a lathe in two materials (a kit1 shirt up to ~60%, breading above)."""
    ys = [0.0, h * 0.2, h * 0.45, h * 0.62, h * 0.84, h]
    rs = [w * 0.4, w * 0.5, w * 0.5, w * 0.47, w * 0.34, 0.0]
    k = d / w

    def rings(a, b):
        return [[(math.cos(j / n * TAU) * rs[i] + lean * ys[i], ys[i], math.sin(j / n * TAU) * rs[i] * k) for j in range(n)] for i in range(a, b + 1)]
    if shirt:
        m.loft(rings(0, 3), "kit1", cap0=False, cap1=False)
        m.loft(rings(3, 5), "breading", cap0=False, cap1=False)
    else:
        m.loft(rings(0, 5), "breading", cap0=False, cap1=False)
    return ys, rs


def quad(m, c, w, h, mat):
    x, y, z = c
    mesh(m, [(x - w / 2, y - h / 2, z), (x + w / 2, y - h / 2, z), (x + w / 2, y + h / 2, z), (x - w / 2, y + h / 2, z)], [(0, 1, 2, 3)], mat)


def fan_eyes(m, y, z, dx=0.045, sz=0.042):
    for s in (-1, 1):
        quad(m, (s * dx, y, z), sz, sz * 1.25, "eyeWhite")
        quad(m, (s * dx * 0.85, y - 0.004, z + 0.004), sz * 0.5, sz * 0.62, "pupil")


def fan_legs(m, w):
    """Thighs forward along the seat, knees bent down at the front (the shins are hidden by the row in front)."""
    m.prism_x([(0.02, 0.0), (0.33, 0.0), (0.38, -0.12), (0.38, 0.06), (0.34, 0.12), (0.02, 0.12)], -w * 0.36, w * 0.36, "fanLegs", bev=0)


def build_fan(k):
    m = FM("fan%d" % k, 50)
    if k == 0:      # stocky, shirt, hands on knees
        w, d = 0.38, 0.28
        fan_body(m, 0.5, w, d)
        fan_eyes(m, 0.37, d * 0.5 * 0.96 + 0.004)
        fan_legs(m, w)
        for s in (-1, 1):
            m.bar((s * 0.19, 0.27, 0.02), (s * 0.14, 0.13, 0.26), 0.055, "breading")
    elif k == 1:    # scarf and bobble hat, no shirt
        w, d = 0.34, 0.26
        fan_body(m, 0.52, w, d, shirt=False, n=7)
        fan_eyes(m, 0.37, d * 0.5 * 0.97 + 0.004)
        fan_legs(m, w)
        m.lathe([(0.165, 0.26), (0.195, 0.295), (0.15, 0.325)], "kit1", n=6, ring=True, c=(0, 0, 0))
        m.lathe([(0.0, 0.585), (0.09, 0.545), (0.115, 0.47)], "beanie", n=7, caps=False)
    elif k == 2:    # tall and thin, scarf stretched out in front at the chest
        w, d = 0.3, 0.24
        fan_body(m, 0.6, w, d)
        fan_eyes(m, 0.46, d * 0.5 * 0.96 + 0.004)
        fan_legs(m, w)
        for s in (-1, 1):
            m.bar((s * 0.15, 0.4, 0.0), (s * 0.2, 0.34, 0.2), 0.05, "breading")
        m.box((0, 0.36, 0.215), (0.46, 0.08, 0.016), "kit1", bev=0)
    else:           # arms up
        w, d = 0.36, 0.27
        fan_body(m, 0.55, w, d, lean=0.0)
        fan_eyes(m, 0.41, d * 0.5 * 0.96 + 0.004)
        fan_legs(m, w)
        for s in (-1, 1):
            m.bar((s * 0.16, 0.37, 0.0), (s * 0.29, 0.78, 0.05), 0.055, "breading")
            m.bar((s * 0.16, 0.37, 0.0), (s * 0.2, 0.5, 0.017), 0.075, "kit1")
    return m


def seat_occluder():
    o = A.Model("seat")
    o.box((0, -0.03, 0.0), (0.5, 0.06, 0.44), "conc", bev=0)
    o.box((0, 0.2, -0.25), (0.5, 0.42, 0.06), "conc", bev=0)
    o.box((0, -0.44, 0.3), (1.0, 0.02, 1.0), "conc", bev=0)     # the tread the feet rest on
    return o


def ground_occluder():
    g = A.Model("ground")
    S = 40.0
    mesh(g, [(-S, 0, -S), (S, 0, -S), (S, 0, S), (-S, 0, S)], [(0, 3, 2, 1)], "conc")
    return g


MODELS = [lambda: build_body(False), lambda: build_body(True), lambda: build_arm(False), lambda: build_arm(True), build_thigh, build_shin,
          lambda: build_hair(0), lambda: build_hair(1), lambda: build_hair(2), build_ball, build_goal, build_flag, build_stand, build_corner,
          build_flood, build_dugout, build_adboard, lambda: build_fan(0), lambda: build_fan(1), lambda: build_fan(2), lambda: build_fan(3)]
NAMES = ["p.body", "p.bodyGK", "p.arm", "p.armGK", "p.thigh", "p.shin", "p.hair0", "p.hair1", "p.hair2", "ball", "goal", "flag", "stand",
         "standCorner", "floodlight", "dugout", "adboard", "fan0", "fan1", "fan2", "fan3"]


def main():
    os.makedirs(OUT, exist_ok=True)
    only = os.environ.get("SOC_ONLY")
    only = set(only.split(",")) if only else None
    ground = ground_occluder()
    seat = seat_occluder()
    body_occ = None
    summary = []
    for name, fn in zip(NAMES, MODELS):
        if only and name not in only:
            continue
        m = fn()
        assert m.name == name, (m.name, name)
        occ = None
        if name.startswith("p.hair"):
            if body_occ is None:
                body_occ = A.Model("occ")
                torso(body_occ)
            occ = body_occ
        elif name.startswith("fan"):
            occ = seat
        elif name not in A.NO_GROUND:
            occ = ground
        data = A.export(m, occ)
        with open(os.path.join(OUT, name + ".json"), "w") as f:
            json.dump(data, f, separators=(",", ":"))
        P = data["p"]
        lo = [min(P[k::3]) for k in range(3)]
        hi = [max(P[k::3]) for k in range(3)]
        summary.append((name, len(P) // 3, len(data["i"]) // 3, lo, hi))
    for name, nv, nt, lo, hi in summary:
        print("SOC %-12s verts %6d  tris %6d  bbox (%.3f %.3f %.3f)..(%.3f %.3f %.3f)" % ((name, nv, nt) + tuple(lo) + tuple(hi)))
    print("SOC total tris", sum(s[2] for s in summary))
    print("SOC rows", STAND_ROWS)


if __name__ == "__main__":
    main()
