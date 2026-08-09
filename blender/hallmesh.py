"""HALLMESH — the Nugget Arcade's GEOMETRY factory.

Third sibling of nugrig.py (GTN sprites) and hallrig.py (hall textures).
Those two rebuilt what the hall is PAINTED with. This one rebuilds what the
hall is SHAPED like.

The problem it exists to solve: every prop and every regular on the street is
hand-coded in js/arcade.js out of axis-aligned boxes (`box3`), wobbled
spheres (`blob3`) and tiled wall quads. The double-parked compact is a slab
with a smaller slab on it. No amount of texture or bloom fixes a silhouette
that has no wheel arches. So: model it in Blender, bevel it, smooth it, and
ship the triangles.

    import hallmesh
    hallmesh.build_all()                       # everything into the HALLMESH scene
    hallmesh.export_all(r"C:/repo/blender/render_hall/mesh")   # -> .json per model
    hallmesh.preview("compact")                # build one + point the camera at it

Then `python blender/pack_mesh.py` quantizes the JSON into js/hallMesh.js.

CONVENTIONS (a contract with js/arcade.js — do not drift):

- **Units are HALL units** (1.0 = one hall metre; the ceiling is at 4.2,
  an arcade cabinet is 1.94 tall). Not nugrig's 1-unit-per-game-pixel.
- **Blender is Z-up, the hall is Y-up.** Export converts
  `hall = (bx, bz, -by)` — determinant +1, so handedness and therefore
  triangle winding survive. The hall culls back faces and flips
  `frontFace` for the mirror pass; a mirrored model is not an option.
- Therefore **a model's FRONT faces -Y in Blender** (the front orthographic
  view), which lands on the hall's +Z. That matches arcade.js's NPC
  convention: "local origin at the feet, +z is the character's front".
- **Origin at the feet / at the ground**, centred in X and Y, so a call site
  can place a model with a position + a yaw and nothing else.
- **Materials are atlas coordinates, not shaders.** Every material name is a
  key into MATS below, which resolves to (region, sub-rect, emissive, tint)
  — the exact four things the hall's vertex format carries. Blender's own
  material colours are set for preview only and are never exported.
- Faces get **box-projected UVs into the 0..1 of their sub-rect**, clamped
  with an inset so a bevelled corner can never bleed into the atlas
  neighbour.

WHY SUB-RECTS: `gtaCarSide` has WINDOWS PAINTED ON IT (arcade-art.js
pGtaCarSide) — it was drawn for a slab that had no real ones. Rather than
repack the whole 337KB street sheet for one prop, the paint materials sample
a clean horizontal band of that region, below the painted glass. Same
pixels, no pipeline churn, and the geometry supplies the windows now.
"""
import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if "__file__" in dir() else r"c:\dev\HowManyNugs\howmanynuggets"
OUT_DEFAULT = os.path.join(REPO, "blender", "render_hall", "mesh")

SCENE = "HALLMESH"

# ---- the material table = the contract with the street atlas -----------------------
# name: (atlas region, [u0, v0, u1, v1] sub-rect of it, emissive, tint)
# Regions are allocated in ArcadeArt.makeStreetAtlas (js/arcade-art.js). The
# sw_* swatches are collapsed to a single texel at runtime, so their sub-rect
# is decorative — any value resolves to the same point.
MATS = {
    # -- the compact ---------------------------------------------------------------
    "paint":    ("gtaCarSide", [0.03, 0.55, 0.97, 0.72], 0.0, 1.10),
    "paintLo":  ("gtaCarSide", [0.03, 0.78, 0.97, 0.97], 0.0, 0.95),
    "roof":     ("gtaCarRoof", [0.04, 0.04, 0.96, 0.96], 0.0, 1.05),
    "glass":    ("gtaCarGlass", [0.04, 0.04, 0.96, 0.96], 0.0, 1.0),
    "tire":     ("sw_black", [0, 0, 1, 1], 0.0, 1.15),
    "trim":     ("sw_iron", [0, 0, 1, 1], 0.0, 0.55),
    "chrome":   ("sw_iron", [0, 0, 1, 1], 0.0, 1.5),
    "hub":      ("sw_iron", [0, 0, 1, 1], 0.0, 1.05),
    "amber":    ("sw_amber", [0, 0, 1, 1], 0.22, 1.0),
    "lampRed":  ("sw_red", [0, 0, 1, 1], 0.14, 0.95),
    "lampW":    ("sw_white", [0, 0, 1, 1], 0.10, 0.85),
    # -- the regulars --------------------------------------------------------------
    "nug":      ("nugSkin", [0.02, 0.02, 0.98, 0.98], 0.0, 1.05),
    "nugDark":  ("nugSkin", [0.02, 0.02, 0.98, 0.98], 0.0, 0.78),
    "pickle":   ("pickle", [0.02, 0.02, 0.98, 0.98], 0.0, 1.05),
    "pickleDk": ("pickle", [0.02, 0.02, 0.98, 0.98], 0.0, 0.8),
    "cloth":    ("hoodCloth", [0.02, 0.02, 0.98, 0.98], 0.0, 0.85),
    "clothDk":  ("hoodCloth", [0.02, 0.02, 0.98, 0.98], 0.0, 0.62),
    "cup":      ("cupGravy", [0.01, 0.01, 0.99, 0.99], 0.0, 1.05),
    "hen":      ("henWhite", [0.02, 0.02, 0.98, 0.98], 0.0, 1.0),
    "henDark":  ("henWhite", [0.02, 0.02, 0.98, 0.98], 0.0, 0.82),
    "felt":     ("sw_iron", [0, 0, 1, 1], 0.0, 0.72),
    "feltDk":   ("sw_iron", [0, 0, 1, 1], 0.0, 0.5),
    "black":    ("sw_black", [0, 0, 1, 1], 0.0, 1.0),
    "white":    ("sw_white", [0, 0, 1, 1], 0.0, 0.9),
    "paper":    ("sw_white", [0, 0, 1, 1], 0.0, 1.0),
    "badge":    ("sw_badge", [0, 0, 1, 1], 0.30, 1.0),
    "comb":     ("sw_comb", [0, 0, 1, 1], 0.0, 1.0),
    "beak":     ("sw_beak", [0, 0, 1, 1], 0.0, 1.0),
    "eye":      ("sw_amber", [0, 0, 1, 1], 0.60, 1.0),
    "lid":      ("sw_white", [0, 0, 1, 1], 0.0, 0.78),
    "sauce":    ("sw_red", [0, 0, 1, 1], 0.0, 0.9),
    "wood":     ("sw_woodDark", [0, 0, 1, 1], 0.0, 1.0),
    # -- the arcade cabinet (MAIN atlas) --------------------------------------------
    # $MARQ/$PANEL/$SIDE are SENTINELS, not real regions. js/arcade.js remaps
    # them per instance (xf.remap) to marq_<mode> / panel_<mode> / side_<mode>,
    # so one model wears all ten games' artwork. A missing remap resolves to
    # nothing and Builder.model() bails to the procedural cabinet — which is
    # the behaviour we want, not a silently untextured machine.
    "cabMarq":  ("$MARQ", [0.0, 0.0, 1.0, 1.0], 0.72, 1.0),
    "cabPanel": ("$PANEL", [0.0, 0.0, 1.0, 1.0], 0.15, 1.0),
    "cabSide":  ("$SIDE", [0.0, 0.0, 1.0, 1.0], 0.0, 1.0),
    "cabFront": ("cabFront", [0.02, 0.02, 0.98, 0.98], 0.0, 1.0),
    "cabBezel": ("bezel", [0.02, 0.02, 0.98, 0.98], 0.0, 1.0),
    "cabMetal": ("metal", [0.05, 0.05, 0.95, 0.95], 0.0, 1.0),
    "cabMetalD": ("metal", [0.05, 0.05, 0.95, 0.95], 0.0, 0.62),
    "cabDark":  ("dark", [0.1, 0.1, 0.9, 0.9], 0.0, 1.0),
    # T-molding has to be LIGHT — it is the edge highlight that makes a cabinet
    # read as a machine. sw_black tinted up is still black (0 x 1.45 = 0), which
    # is how the first pass shipped an invisible one.
    "cabTrim":  ("sw_white", [0, 0, 1, 1], 0.0, 0.62),
    "cabTrimD": ("sw_black", [0, 0, 1, 1], 0.0, 0.9),
    "cabGlass": ("sw_glass", [0, 0, 1, 1], 0.0, 1.0),
    "btnRed":   ("sw_red", [0, 0, 1, 1], 0.10, 1.0),
    "btnAmber": ("sw_amber", [0, 0, 1, 1], 0.10, 1.0),
    "btnCyan":  ("sw_cyan", [0, 0, 1, 1], 0.10, 1.0),
    "btnWhite": ("sw_white", [0, 0, 1, 1], 0.06, 0.9),
    "cabLight": ("sw_warm", [0, 0, 1, 1], 0.55, 1.0),
    "coinSlot": ("sw_black", [0, 0, 1, 1], 0.0, 0.35),
    # -- THE CEILING (MAIN atlas only — checked against the sheet before
    #    modelling, which is the lampHot trap and it has been walked into twice)
    "ceilRib":  ("metal", [0.06, 0.06, 0.94, 0.94], 0.0, 0.74),
    "ceilRod":  ("sw_black", [0, 0, 1, 1], 0.0, 0.55),
    "fixBody":  ("metal", [0.06, 0.06, 0.94, 0.94], 0.0, 0.92),
    "fixEnd":   ("dark", [0.1, 0.1, 0.9, 0.9], 0.0, 1.0),
    # 0.62 and NOT 1.0. sw_tube is 207/255 and the shader does
    # mix(light, 1.45, e), so e=1 puts it at 300 and it clips to a flat white
    # slab — which is exactly what the old three-quad tube did. At 0.62 it
    # lands around 209: still the hottest thing on the ceiling, still well
    # under the blown line, and the BLOOM does the glowing (HANDOFF 5c).
    "fixDiff":  ("sw_tube", [0, 0, 1, 1], 0.62, 1.0),
    "duct":     ("metal", [0.06, 0.06, 0.94, 0.94], 0.0, 0.80),
    "ductBand": ("metal", [0.06, 0.06, 0.94, 0.94], 0.0, 0.58),
    # `dark` was the obvious pick and it was wrong: a near-black face on a dark
    # ceiling means only the lit edge survives, and the sign reads as a stray
    # neon line floating in the room. A blade sign is a PHYSICAL object first.
    "signFace": ("metal", [0.06, 0.06, 0.94, 0.94], 0.0, 0.86),
    "signGlow": ("sw_cyan", [0, 0, 1, 1], 0.55, 1.0),
    "vestBody": ("wainscot", [0.05, 0.05, 0.95, 0.95], 0.0, 0.88),
    "vestLip":  ("metal", [0.06, 0.06, 0.94, 0.94], 0.0, 0.70),
    "vestGlow": ("sw_warm", [0, 0, 1, 1], 0.50, 1.0),
    # -- street furniture and architecture (STREET atlas) ----------------------------
    "iron":     ("sw_iron", [0, 0, 1, 1], 0.0, 1.0),
    "ironD":    ("sw_iron", [0, 0, 1, 1], 0.0, 0.60),
    "metalD":   ("sw_iron", [0, 0, 1, 1], 0.0, 0.85),
    "metalG":   ("sw_iron", [0, 0, 1, 1], 0.0, 1.15),
    # the lamp lens is the one thing on the street that has to look HOT.
    # 176 is the emissive texel ceiling (HANDOFF 5c) — sw_amber is already
    # under it, so the glow comes from e + bloom, not from a brighter texel.
    "lampGlass": ("sw_amber", [0, 0, 1, 1], 0.85, 1.0),
    # sw_warm is a MAIN-atlas swatch and the street sheet has no such region —
    # a model that names one it cannot reach makes Builder.model() bail to the
    # fallback, silently, for the whole prop.
    "lampHot":  ("sw_white", [0, 0, 1, 1], 1.0, 1.0),
    # $BRICK / $BRICKD are SENTINELS, exactly like $MARQ above. js/arcade.js
    # remaps them per bay (xf.remap) to brick/brickD or brick2/brick2D, so one
    # facadeBay model builds a terrace out of two different buildings instead
    # of fourteen copies of one. A missing remap resolves to nothing and the
    # call site falls back to the flat painted wall behind, which is what the
    # street looked like before any of this — not a hole.
    "brick":    ("$BRICK", [0.02, 0.02, 0.98, 0.98], 0.0, 1.0),
    "brickD":   ("$BRICK", [0.02, 0.02, 0.98, 0.98], 0.0, 0.72),
    # the fire escape's open grating: dark, and darker than its ironwork,
    # because you are mostly looking through it at the wall behind
    "grate":    ("sw_iron", [0, 0, 1, 1], 0.0, 0.46),
    # -- the jukebox (MAIN atlas only — it stands in the hall) ---------------------
    "jukeBody":   ("cabFront", [0.05, 0.05, 0.95, 0.95], 0.0, 0.95),
    "jukeCrown":  ("cabFront", [0.05, 0.05, 0.95, 0.95], 0.0, 1.20),
    "jukeChrome": ("metal", [0, 0, 1, 1], 0.0, 1.02),
    "jukeTube":   ("sw_white", [0, 0, 1, 1], 0.30, 1.0),
    "jukeLit":    ("sw_amber", [0, 0, 1, 1], 0.30, 0.62),
    "jukeStrip":  ("sw_white", [0, 0, 1, 1], 0.16, 0.92),
    "jukeBtn":    ("sw_amber", [0, 0, 1, 1], 0.40, 1.0),
    "jukeCard":   ("sw_black", [0, 0, 1, 1], 0.0, 1.0),
    # -- the SAUCE-O-MATIC. vendFace is the WHOLE region on purpose: §5b's
    # composition contract bakes header/side/bin text into fixed places in it,
    # and any sub-rect would scramble the lot.
    "vendFace":   ("vending", [0, 0, 1, 1], 0.35, 1.0),
    "vendBody":   ("metal", [0, 0, 1, 1], 0.0, 0.62),
    "vendTrim":   ("metal", [0, 0, 1, 1], 0.0, 1.05),
    "vendPlinth": ("dark", [0.05, 0.05, 0.95, 0.95], 0.0, 0.85),
    "vendVoid":   ("sw_black", [0, 0, 1, 1], 0.0, 1.0),
    "vendFlap":   ("metal", [0, 0, 1, 1], 0.0, 0.48),
    "vendCoin":   ("metal", [0, 0, 1, 1], 0.0, 1.25),
    "vendSlot":   ("sw_black", [0, 0, 1, 1], 0.0, 1.0),
    "vendBtn":    ("sw_red", [0, 0, 1, 1], 0.22, 1.0),
    "jukeGrille": ("metal", [0, 0, 1, 1], 0.0, 0.88),
    "jukeDark":   ("cabFront", [0.05, 0.05, 0.95, 0.95], 0.0, 0.70),
    "stone":    ("sw_curb", [0, 0, 1, 1], 0.0, 1.35),
    "glassDark": ("sw_black", [0, 0, 1, 1], 0.0, 1.0),
    # -- street furniture, round two -------------------------------------------------
    "hydRed":   ("sw_red", [0, 0, 1, 1], 0.0, 1.05),
    "hydCap":   ("sw_amber", [0, 0, 1, 1], 0.0, 0.85),
    "canvasA":  ("sw_red", [0, 0, 1, 1], 0.0, 0.95),
    "canvasB":  ("sw_white", [0, 0, 1, 1], 0.0, 0.88),
    "awnFrame": ("sw_iron", [0, 0, 1, 1], 0.0, 0.75),
    "binMetal": ("sw_iron", [0, 0, 1, 1], 0.0, 0.80),
    "binDark":  ("sw_iron", [0, 0, 1, 1], 0.0, 0.48),
    "binLid":   ("sw_iron", [0, 0, 1, 1], 0.0, 0.95),
    "shelterIron":  ("sw_iron", [0, 0, 1, 1], 0.0, 0.72),
    # sw_glass is a MAIN-atlas swatch and the street sheet has no such region.
    # Naming it made Builder.model() bail for the whole shelter, silently —
    # the same trap "lampHot" is documented for, walked into again. sw_black
    # with a low roughness in the ORM page reads as dark glass anyway now.
    "shelterGlass": ("sw_black", [0, 0, 1, 1], 0.0, 0.90),
    "shelterRoof":  ("sw_curb", [0, 0, 1, 1], 0.0, 0.85),
    "shelterWood":  ("sw_woodDark", [0, 0, 1, 1], 0.0, 1.00),
    "shelterLight": ("sw_white", [0, 0, 1, 1], 0.75, 1.0),
    # hall trim lives on the MAIN atlas (it is built into B, not ST), so it
    # wears the wainscot panelling the room is already trimmed in.
    "trimWood": ("wainscot", [0.10, 0.10, 0.90, 0.90], 0.0, 1.15),
    # -- 🏪 THE GROUND FLOOR (STREET atlas) -------------------------------------------
    # The terrace's bottom 1.46m was one brick panel per bay, fourteen bays
    # wide, and it is the biggest single object in every street view. A city
    # block at street level with no doors in it reads as scenery, not a place.
    #
    # Painted TIMBER, not more brick. A shopfront is a joinery object stuck
    # onto a masonry building and it is the one part of a Victorian terrace
    # that was never the same colour twice — which is exactly the variety the
    # measured verdict on this wall kept asking for.
    # TINTS ARE HIGH ON PURPOSE. The first pass wore the terrace's own dark
    # values (0.5-0.7) and the whole band came back as murk: every piece of
    # joinery was modelled, none of it was READABLE. A shopfront is the one
    # part of a night street that is deliberately painted to catch light.
    "shopPier":   ("sw_woodDark", [0, 0, 1, 1], 0.0, 1.35),
    "shopPierB":  ("sw_iron", [0, 0, 1, 1], 0.0, 0.95),
    "shopFascia": ("sw_woodDark", [0, 0, 1, 1], 0.0, 1.05),
    "shopCorn":   ("sw_curb", [0, 0, 1, 1], 0.0, 1.35),
    # $SIGN is a SENTINEL. Fourteen fascias all wearing sw_amber came back as
    # one continuous orange bar 42 metres long — which is a light fitting, not
    # a parade of shops. The call site deals a colour per unit.
    #
    # A SHUT shop's sign is not off, it is UNLIT — the streetlamp still finds
    # it. 0.05 is the difference between "closed" and "demolished".
    "shopSignD":  ("$SIGN", [0, 0, 1, 1], 0.05, 0.85),
    "shopSign":   ("$SIGN", [0, 0, 1, 1], 0.34, 1.0),
    "shutBox":    ("sw_iron", [0, 0, 1, 1], 0.0, 0.86),
    "shutter":    ("sw_iron", [0, 0, 1, 1], 0.0, 1.28),
    "shutRail":   ("sw_iron", [0, 0, 1, 1], 0.0, 0.72),
    "shopIron":   ("sw_iron", [0, 0, 1, 1], 0.0, 1.15),
    "shopPlinth": ("sw_curb", [0, 0, 1, 1], 0.0, 1.15),
    "shopRiser":  ("sw_woodDark", [0, 0, 1, 1], 0.0, 1.10),
    "shopGlass":  ("sw_black", [0, 0, 1, 1], 0.0, 0.92),
    # The lit interior is the entire point of the OPEN variant: it is a light
    # SOURCE in the dead band, and the call site promotes it to a world light
    # so the pavement in front of it actually gets some.
    "shopLit":    ("sw_amber", [0, 0, 1, 1], 0.50, 1.0),
    "shopLitC":   ("sw_white", [0, 0, 1, 1], 0.42, 0.95),
    "shopVoid":   ("sw_black", [0, 0, 1, 1], 0.0, 1.0),
    "shopDoorL":  ("sw_woodDark", [0, 0, 1, 1], 0.0, 1.25),
    "shopFan":    ("sw_amber", [0, 0, 1, 1], 0.28, 0.88),
    "shopLamp":   ("sw_white", [0, 0, 1, 1], 0.70, 1.0),
    # 🪧 the blade signs. $BLADE is a SENTINEL like $BRICK — the call site
    # remaps it per unit so the terrace does not grow fourteen pink signs.
    "bladeArm":   ("sw_iron", [0, 0, 1, 1], 0.0, 0.72),
    "bladeFace":  ("sw_iron", [0, 0, 1, 1], 0.0, 0.66),
    "bladeGlow":  ("$BLADE", [0, 0, 1, 1], 0.58, 1.0),
    # the bus shelter's lit route map — see build_bus_shelter's note
    "shelterMap": ("sw_white", [0, 0, 1, 1], 0.42, 0.95),
    "shelterAd":  ("sw_amber", [0, 0, 1, 1], 0.34, 0.95),
    # -- 🛣 the road surface. Dark and ROUGH on purpose: these are the only
    #    things on a wet road that are NOT reflective, and that contrast is the
    #    entire reason they are worth modelling.
    "ironCast":   ("sw_iron", [0, 0, 1, 1], 0.0, 0.42),
    "ironRib":    ("sw_iron", [0, 0, 1, 1], 0.0, 0.58),
    "ironRim":    ("sw_curb", [0, 0, 1, 1], 0.0, 0.62),
    # -- 🎱 THE FLOOR PLAN (MAIN atlas ONLY — these stand INSIDE the hall).
    #    Checked against the main sheet before modelling, which is the lampHot
    #    trap and it has now been walked into three times: sw_iron, sw_curb and
    #    sw_woodDark are STREET swatches and naming one here makes
    #    Builder.model() bail for the whole prop, silently.
    # 1.30 and not 0.92: cabFront is a DARK region and this carpet is the
    # brightest thing in the room, so a body at the cabinets' own value came
    # back as a black slab cut out of the floor. A machine has to out-read the
    # carpet it is standing on.
    "furnBody":   ("cabFront", [0.05, 0.05, 0.95, 0.95], 0.0, 1.30),
    "furnDark":   ("sw_black", [0, 0, 1, 1], 0.0, 1.0),
    "furnRail":   ("metal", [0.06, 0.06, 0.94, 0.94], 0.0, 1.05),
    "furnChrome": ("metal", [0.06, 0.06, 0.94, 0.94], 0.0, 1.35),
    "furnTrim":   ("sw_white", [0, 0, 1, 1], 0.0, 0.58),
    "furnPad":    ("wainscot", [0.10, 0.10, 0.90, 0.90], 0.0, 0.85),
    # The rink is the point of the air hockey table: a big pale lit plane at
    # waist height in the middle of a dark room. 0.30 and not higher — §5c, a
    # white swatch at high e clips to a flat slab and the BLOOM does the rest.
    "rink":       ("sw_white", [0, 0, 1, 1], 0.30, 0.95),
    "rinkLine":   ("sw_cyan", [0, 0, 1, 1], 0.34, 1.0),
    "rinkGoal":   ("sw_black", [0, 0, 1, 1], 0.0, 1.0),
    "scoreFace":  ("dark", [0.1, 0.1, 0.9, 0.9], 0.0, 1.0),
    "scoreLit":   ("sw_red", [0, 0, 1, 1], 0.46, 1.0),
    # the claw cabinet
    "clawGlass":  ("sw_glass", [0, 0, 1, 1], 0.0, 1.45),
    "clawLit":    ("sw_warm", [0, 0, 1, 1], 0.46, 1.0),
    # The flanks are dimmer than the back on purpose. Lighting all three
    # equally turned the cabinet into a paper lantern: an even slab with no
    # depth and no prizes visible in it. A box you look INTO needs its far
    # wall to be the brightest thing in it.
    "clawLitS":   ("sw_warm", [0, 0, 1, 1], 0.22, 0.92),
    "clawHead":   ("sw_magenta", [0, 0, 1, 1], 0.42, 1.0),
    "clawNug":    ("nugGold", [0.1, 0.1, 0.9, 0.9], 0.0, 1.15),
    "clawPlush":  ("sw_cyan", [0, 0, 1, 1], 0.0, 0.95),
    "clawPlushB": ("sw_magenta", [0, 0, 1, 1], 0.0, 0.90),
    "chgFace":    ("change", [0, 0, 1, 1], 0.16, 1.0),
    "chgLit":     ("sw_green", [0, 0, 1, 1], 0.40, 1.0),
}

# preview-only colours, so the Blender viewport isn't a grey blob
_PREVIEW = {
    "paint": (0.62, 0.13, 0.08), "paintLo": (0.34, 0.07, 0.04),
    "roof": (0.55, 0.11, 0.07), "glass": (0.03, 0.04, 0.07),
    "tire": (0.02, 0.02, 0.03), "trim": (0.10, 0.11, 0.15),
    "chrome": (0.55, 0.58, 0.65), "hub": (0.32, 0.35, 0.42), "amber": (1.0, 0.55, 0.05),
    "lampRed": (0.8, 0.06, 0.05), "lampW": (0.9, 0.88, 0.8),
    "nug": (0.85, 0.62, 0.22), "nugDark": (0.5, 0.34, 0.12),
    "pickle": (0.32, 0.55, 0.14), "pickleDk": (0.2, 0.35, 0.09),
    "cloth": (0.22, 0.24, 0.3), "clothDk": (0.12, 0.13, 0.17),
    "cup": (0.75, 0.7, 0.6), "hen": (0.9, 0.88, 0.82), "henDark": (0.7, 0.68, 0.62),
    "felt": (0.16, 0.18, 0.24), "feltDk": (0.09, 0.1, 0.14),
    "black": (0.02, 0.02, 0.03), "white": (0.85, 0.83, 0.76), "paper": (0.9, 0.88, 0.8),
    "badge": (1.0, 0.78, 0.3), "comb": (0.75, 0.13, 0.13), "beak": (0.85, 0.55, 0.1),
    "eye": (1.0, 0.6, 0.1), "lid": (0.8, 0.78, 0.72), "sauce": (0.8, 0.2, 0.15),
    "wood": (0.25, 0.18, 0.05),
    "cabMarq": (0.9, 0.85, 0.5), "cabPanel": (0.3, 0.32, 0.45), "cabSide": (0.28, 0.1, 0.35),
    "cabFront": (0.10, 0.10, 0.14), "cabBezel": (0.05, 0.05, 0.07),
    "cabMetal": (0.30, 0.32, 0.38), "cabMetalD": (0.16, 0.17, 0.21),
    "cabDark": (0.03, 0.03, 0.04), "cabTrim": (0.62, 0.64, 0.70), "cabTrimD": (0.2, 0.2, 0.24),
    "cabGlass": (0.02, 0.05, 0.10), "btnRed": (0.9, 0.12, 0.12), "btnAmber": (1.0, 0.65, 0.06),
    "btnCyan": (0.1, 0.8, 0.95), "btnWhite": (0.85, 0.85, 0.8),
    "cabLight": (1.0, 0.86, 0.62), "coinSlot": (0.02, 0.02, 0.03),
    "iron": (0.22, 0.25, 0.33), "ironD": (0.13, 0.15, 0.20),
    "grate": (0.10, 0.11, 0.14),
    "jukeBody": (0.10, 0.09, 0.13), "jukeCrown": (0.15, 0.13, 0.19),
    "jukeChrome": (0.55, 0.57, 0.66), "jukeTube": (0.85, 0.80, 1.0),
    "jukeLit": (0.92, 0.66, 0.24), "jukeStrip": (0.80, 0.80, 0.76),
    "jukeBtn": (1.0, 0.68, 0.14), "jukeGrille": (0.24, 0.25, 0.30),
    "jukeCard": (0.06, 0.06, 0.08),
    "vendFace": (0.34, 0.16, 0.13), "vendBody": (0.18, 0.19, 0.24),
    "vendTrim": (0.42, 0.44, 0.52), "vendPlinth": (0.07, 0.07, 0.09),
    "vendVoid": (0.02, 0.02, 0.03), "vendFlap": (0.14, 0.15, 0.19),
    "vendCoin": (0.55, 0.57, 0.64), "vendSlot": (0.02, 0.02, 0.03),
    "vendBtn": (0.85, 0.14, 0.10),
    "jukeDark": (0.05, 0.05, 0.07),
    "metalD": (0.19, 0.21, 0.27), "metalG": (0.30, 0.33, 0.40),
    "lampGlass": (1.0, 0.72, 0.25), "lampHot": (1.0, 0.90, 0.70),
    "brick": (0.32, 0.16, 0.13), "brickD": (0.20, 0.10, 0.08),
    "stone": (0.42, 0.42, 0.47), "glassDark": (0.02, 0.03, 0.05),
    "trimWood": (0.30, 0.22, 0.10),
    "hydRed": (0.72, 0.11, 0.07), "hydCap": (0.85, 0.62, 0.10),
    "canvasA": (0.72, 0.13, 0.09), "canvasB": (0.88, 0.85, 0.78),
    "awnFrame": (0.20, 0.22, 0.28),
    "binMetal": (0.22, 0.24, 0.30), "binDark": (0.10, 0.11, 0.15),
    "binLid": (0.30, 0.33, 0.40),
    "shelterIron": (0.18, 0.20, 0.26), "shelterGlass": (0.04, 0.09, 0.15),
    "shelterRoof": (0.36, 0.36, 0.42), "shelterWood": (0.28, 0.20, 0.07),
    "shelterLight": (0.95, 0.94, 0.86),
    "shopPier": (0.26, 0.20, 0.06), "shopPierB": (0.13, 0.15, 0.20),
    "shopFascia": (0.18, 0.14, 0.04), "shopCorn": (0.40, 0.40, 0.46),
    "shopSignD": (0.55, 0.36, 0.09), "shopSign": (1.0, 0.72, 0.16),
    "shutBox": (0.14, 0.15, 0.20), "shutter": (0.24, 0.27, 0.34),
    "shutRail": (0.11, 0.13, 0.17), "shopIron": (0.28, 0.31, 0.38),
    "shopPlinth": (0.36, 0.36, 0.42), "shopRiser": (0.17, 0.13, 0.04),
    "shopGlass": (0.02, 0.03, 0.06), "shopLit": (1.0, 0.78, 0.36),
    "shopLitC": (0.86, 0.88, 0.92), "shopVoid": (0.01, 0.01, 0.02),
    "shopDoorL": (0.24, 0.18, 0.05), "shopFan": (0.95, 0.72, 0.28),
    "shopLamp": (1.0, 0.96, 0.84),
    "bladeArm": (0.18, 0.20, 0.26), "bladeFace": (0.16, 0.18, 0.23),
    "bladeGlow": (1.0, 0.35, 0.68),
    "shelterMap": (0.88, 0.90, 0.94), "shelterAd": (1.0, 0.74, 0.28),
    "ironCast": (0.09, 0.10, 0.13), "ironRib": (0.14, 0.15, 0.19),
    "ironRim": (0.20, 0.20, 0.24),
    "furnBody": (0.10, 0.10, 0.14), "furnDark": (0.02, 0.02, 0.03),
    "furnRail": (0.34, 0.36, 0.43), "furnChrome": (0.58, 0.60, 0.68),
    "furnTrim": (0.58, 0.60, 0.64), "furnPad": (0.26, 0.20, 0.10),
    "rink": (0.92, 0.94, 0.98), "rinkLine": (0.15, 0.88, 1.0),
    "rinkGoal": (0.02, 0.02, 0.03), "scoreFace": (0.05, 0.05, 0.07),
    "scoreLit": (1.0, 0.24, 0.24),
    "clawGlass": (0.04, 0.09, 0.15), "clawLit": (1.0, 0.85, 0.63),
    "clawLitS": (0.85, 0.72, 0.53),
    "clawHead": (1.0, 0.18, 0.63), "clawNug": (0.85, 0.62, 0.22),
    "clawPlush": (0.15, 0.88, 1.0), "clawPlushB": (1.0, 0.18, 0.63),
    "chgFace": (0.20, 0.22, 0.28), "chgLit": (0.22, 1.0, 0.48),
}


# ---- scene management (GUI-safe: only ever touches the HALLMESH scene) --------------

def _scene():
    sc = bpy.data.scenes.get(SCENE)
    if not sc:
        sc = bpy.data.scenes.new(SCENE)
    try:
        bpy.context.window.scene = sc
    except Exception:
        pass  # headless right after open_mainfile: context.screen is None
    return sc


def wipe():
    """Remove ONLY the objects linked to the HALLMESH scene."""
    sc = _scene()
    for o in list(sc.collection.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)


def _material(name):
    key = "HM_" + name
    m = bpy.data.materials.get(key)
    if not m:
        m = bpy.data.materials.new(key)
        m.use_nodes = True
        c = _PREVIEW.get(name, (0.6, 0.6, 0.6))
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (*c, 1.0)
            try:
                bsdf.inputs["Roughness"].default_value = 0.45
            except Exception:
                pass
        m.diffuse_color = (*c, 1.0)
    return m


# ---- profile helpers ---------------------------------------------------------------

def pw(t, keys):
    """Monotone cubic (Fritsch-Carlson PCHIP) through [(t, value), ...].

    NOT smoothstep-per-segment, which was the first thing tried and is a trap:
    smoothstepping each span forces the slope to ZERO at every keyframe, so a
    profile scallops between its own keys. On the compact that made the
    windscreen an S-curve instead of a rake and swung the surface normal
    0.67 -> 0.82 -> 0.54 -> 0.89 from one body ring to the next, which
    striped the roof (the material classifier reads normals) and banded the
    shading. PCHIP gives real slopes at the keys, and — unlike Catmull-Rom —
    never overshoots, so a plateau in a profile (the top of a wheel arch,
    the parallel middle of a flank) stays a plateau.
    """
    n = len(keys)
    if n == 1 or t <= keys[0][0]:
        return keys[0][1]
    if t >= keys[-1][0]:
        return keys[-1][1]
    xs = [k[0] for k in keys]
    ys = [k[1] for k in keys]
    h = [max(xs[i + 1] - xs[i], 1e-9) for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    i = 0
    while i < n - 2 and t > xs[i + 1]:
        i += 1
    s = (t - xs[i]) / h[i]
    s2, s3 = s * s, s * s * s
    return ((2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h[i] * m[i]
            + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h[i] * m[i + 1])


def smoothstep(a, b, t):
    if b == a:
        return 0.0
    t = max(0.0, min(1.0, (t - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ---- the builder -------------------------------------------------------------------

class Part:
    """One object under construction: a bmesh plus a material-slot table."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.fixed = self.bm.faces.layers.int.new("uvfixed")
        self.slots = []       # material names, in slot order
        self._slot = {}

    def set_uv(self, mat, fn):
        """Give every face of material `mat` an EXPLICIT uv from a position
        function, and mark it so finish()'s box projection leaves it alone.

        Box projection is fine for a texture that is basically grain — paint,
        brushed metal, cloth. It is useless for a PICTURE. A cabinet marquee
        projected by its dominant axis samples a hair-thin band of its own
        artwork stretched across the whole panel, and the control panel comes
        out mirrored. Anything that has to be READ gets mapped by hand.
        """
        want = self._slot.get(mat)
        if want is None:
            return
        for f in self.bm.faces:
            if f.material_index != want:
                continue
            for l in f.loops:
                p = l.vert.co
                u, v = fn(p.x, p.y, p.z)
                l[self.uv].uv = (min(1.0, max(0.0, u)), min(1.0, max(0.0, v)))
            f[self.fixed] = 1

    def slot(self, mat):
        if mat not in self._slot:
            self._slot[mat] = len(self.slots)
            self.slots.append(mat)
        return self._slot[mat]

    def face(self, pts, mat):
        """Add one n-gon from a list of (x, y, z). Winding is fixed later by
        recalc_face_normals, so callers may be sloppy — but only if the part
        ends up closed. Open shells must wind CCW seen from the front."""
        vs = [self.bm.verts.new(Vector(p)) for p in pts]
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        f.material_index = self.slot(mat)
        return f

    # -- primitives ------------------------------------------------------------------

    def loft(self, rings, mat, cap_a=True, cap_b=True, cap_mat=None, closed=True, mat_fn=None):
        """Skin a list of equal-length rings (each a list of (x,y,z)).

        This is the workhorse: a car body, a torso, a sleeve — anything with a
        cross-section that changes along a path.
        """
        vs = [[self.bm.verts.new(Vector(p)) for p in r] for r in rings]
        n = len(rings[0])
        for i in range(len(rings) - 1):
            for j in range(n):
                k = (j + 1) % n if closed else j + 1
                if not closed and k >= n:
                    continue
                quad = [vs[i][j], vs[i][k], vs[i + 1][k], vs[i + 1][j]]
                # collapse degenerate rings (a ring that came to a point)
                uniq = []
                for v in quad:
                    if not any((v.co - u.co).length < 1e-6 for u in uniq):
                        uniq.append(v)
                if len(uniq) < 3:
                    continue
                m = mat_fn(i, j) if mat_fn else mat
                if m is None:
                    continue    # mat_fn may punch holes (the Hood's face opening)
                try:
                    f = self.bm.faces.new(uniq)
                except ValueError:
                    continue
                f.material_index = self.slot(m)
        cm = cap_mat or mat
        if cap_a and closed:
            try:
                self.bm.faces.new(vs[0]).material_index = self.slot(cm)
            except ValueError:
                pass
        if cap_b and closed:
            try:
                self.bm.faces.new(list(reversed(vs[-1]))).material_index = self.slot(cm)
            except ValueError:
                pass
        return vs

    def box(self, c, size, mat, taper=1.0):
        """Axis-aligned box centred at c with (sx, sy, sz) dimensions. `taper`
        scales the +Z face's footprint (a box3 that can be a frustum)."""
        cx, cy, cz = c
        sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
        lo = [(cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
              (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz)]
        hi = [(cx - sx * taper, cy - sy * taper, cz + sz), (cx + sx * taper, cy - sy * taper, cz + sz),
              (cx + sx * taper, cy + sy * taper, cz + sz), (cx - sx * taper, cy + sy * taper, cz + sz)]
        return self.loft([lo, hi], mat)

    def cyl(self, c, axis, r0, r1, length, mat, slices=16, cap=True):
        """Cylinder/cone about 'x', 'y' or 'z', centred at c."""
        rings = []
        for t, r in ((-0.5, r0), (0.5, r1)):
            ring = []
            for j in range(slices):
                a = (j / slices) * math.tau
                ca, sa = math.cos(a) * r, math.sin(a) * r
                d = t * length
                if axis == "z":
                    ring.append((c[0] + ca, c[1] + sa, c[2] + d))
                elif axis == "x":
                    ring.append((c[0] + d, c[1] + ca, c[2] + sa))
                else:
                    ring.append((c[0] + ca, c[1] + d, c[2] + sa))
            rings.append(ring)
        return self.loft(rings, mat, cap_a=cap, cap_b=cap)

    def revolve(self, profile, mat, axis_x=0.0, axis_y=0.0, slices=18):
        """Lathe a [(radius, z), ...] profile around the vertical axis. Radius 0
        at either end closes the shape (a sphere, a teardrop, a cup)."""
        rings = []
        for r, z in profile:
            ring = []
            for j in range(slices):
                a = (j / slices) * math.tau
                ring.append((axis_x + math.cos(a) * r, axis_y + math.sin(a) * r, z))
            rings.append(ring)
        return self.loft(rings, mat, cap_a=profile[0][0] > 1e-4, cap_b=profile[-1][0] > 1e-4)

    def ovoid(self, c, radii, mat, stacks=9, slices=16, squash=None):
        """An egg. `squash(v)` in 0..1 (bottom→top) scales the radius — this is
        what makes a nugget a nugget rather than a ball."""
        rx, ry, rz = radii
        prof = []
        for i in range(stacks + 1):
            v = i / stacks
            ph = v * math.pi
            r = math.sin(ph)
            z = -math.cos(ph)
            if squash:
                r *= squash(v)
            prof.append((r, z))
        rings = []
        for r, z in prof:
            ring = []
            for j in range(slices):
                a = (j / slices) * math.tau
                ring.append((c[0] + math.cos(a) * r * rx, c[1] + math.sin(a) * r * ry, c[2] + z * rz))
            rings.append(ring)
        return self.loft(rings, mat, cap_a=False, cap_b=False)

    def limb(self, a, b, r0, r1, mat, slices=8, cap=True):
        """A tapered capsule from a to b — an arm, a leg, a hat band, a stalk."""
        a, b = Vector(a), Vector(b)
        d = b - a
        if d.length < 1e-6:
            return
        up = Vector((0, 0, 1)) if abs(d.normalized().z) < 0.95 else Vector((1, 0, 0))
        ax = d.normalized().cross(up).normalized()
        ay = d.normalized().cross(ax).normalized()
        rings = []
        for t, r in ((0.0, r0), (1.0, r1)):
            c = a + d * t
            rings.append([tuple(c + ax * (math.cos(j / slices * math.tau) * r)
                                + ay * (math.sin(j / slices * math.tau) * r))
                          for j in range(slices)])
        return self.loft(rings, mat, cap_a=cap, cap_b=cap)

    def blob(self, c, size, mat, stacks=10, slices=14, prof=None, lump=0.0,
             seed=0.0, flat=1.0):
        """The character workhorse: an ovoid whose radius follows `prof` up its
        height and wobbles per-angle by `lump`. A nugget, a pickle, a hen — all
        the same call with different numbers. Origin at the BOTTOM, not the
        centre, because every regular stands on the pavement."""
        prof = prof or [(0.0, 0.0), (0.10, 0.62), (0.35, 0.98), (0.62, 1.0),
                        (0.85, 0.78), (1.0, 0.0)]
        cx, cy, cz = c
        w, dep, h = size
        rings = []
        for i in range(stacks + 1):
            v = i / stacks
            r = pw(v, prof)
            ring = []
            for j in range(slices):
                a = (j / slices) * math.tau
                k = 1.0
                if lump:
                    k += lump * (math.sin(a * 3 + seed) * math.cos(v * 5.5 + seed * 1.7)
                                 + 0.6 * math.sin(v * 3.0 + a * 2 + seed))
                ring.append((cx + math.cos(a) * r * w * 0.5 * k,
                             cy + math.sin(a) * r * dep * 0.5 * flat * k,
                             cz + v * h))
            rings.append(ring)
        return self.loft(rings, mat, cap_a=False, cap_b=False)

    def brim(self, c, r_in, r_out, mat, thick=0.022, tilt=0.0, slices=22):
        """A hat brim: an annulus with real thickness that can dip at the front
        and lift at the back (`tilt`). A flat box for a fedora is a crime."""
        cx, cy, cz = c

        def rz(a):
            return cz + tilt * math.cos(a)   # -y is the face direction

        rings = []
        for r, dz in ((r_in, thick / 2), (r_out, 0.0), (r_out, -thick * 0.35), (r_in, -thick / 2)):
            rings.append([(cx + math.cos(a) * r, cy + math.sin(a) * r, rz(a) + dz)
                          for a in [(j / slices) * math.tau for j in range(slices)]])
        rings.append(rings[0])   # close the section: a torus, so it stays manifold
        return self.loft(rings, mat, cap_a=False, cap_b=False)

    # -- finish ------------------------------------------------------------------------

    def finish(self, bevel=0.012, segments=2, smooth_deg=38, uv_scale=None):
        """UV-project, bevel, auto-smooth, and link into the HALLMESH scene."""
        bm = self.bm
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _orient(bm)

        # box-project every face into the 0..1 of its own material sub-rect,
        # using the part's bounding box so the projection is scale-independent.
        xs = [v.co.x for v in bm.verts] or [0]
        ys = [v.co.y for v in bm.verts] or [0]
        zs = [v.co.z for v in bm.verts] or [0]
        lo = Vector((min(xs), min(ys), min(zs)))
        hi = Vector((max(xs), max(ys), max(zs)))
        span = Vector((max(hi.x - lo.x, 1e-4), max(hi.y - lo.y, 1e-4), max(hi.z - lo.z, 1e-4)))
        if uv_scale:
            span = Vector((span.x / uv_scale, span.y / uv_scale, span.z / uv_scale))
        for f in bm.faces:
            if f[self.fixed]:
                continue      # already mapped by hand (artwork panels)
            n = f.normal
            ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
            for l in f.loops:
                p = l.vert.co - lo
                if az >= ax and az >= ay:
                    u, v = p.x / span.x, p.y / span.y
                elif ax >= ay:
                    u, v = p.y / span.y, p.z / span.z
                else:
                    u, v = p.x / span.x, p.z / span.z
                l[self.uv].uv = (min(1.0, max(0.0, u % 1.0 if u > 1.0 else u)),
                                 min(1.0, max(0.0, v % 1.0 if v > 1.0 else v)))

        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(self.name, me)
        for mname in self.slots:
            ob.data.materials.append(_material(mname))
        _scene().collection.objects.link(ob)

        if bevel and bevel > 0:
            mod = ob.modifiers.new("bev", "BEVEL")
            mod.width = bevel
            mod.segments = segments
            mod.limit_method = "ANGLE"
            mod.angle_limit = math.radians(32)
            mod.harden_normals = False
            try:
                mod.miter_outer = "MITER_ARC"
            except Exception:
                pass
        _shade_auto_smooth(ob, smooth_deg)
        return ob


def _orient(bm):
    """Point every face OUTWARD, per connected shell.

    `recalc_face_normals` is only meaningful for CLOSED manifolds. Give it an
    open shell — a side panel, a strip of T-molding, a bezel frame — and it
    picks a consistent direction that is just as likely to be inward. The hall
    culls back faces, so an inward shell is not subtly wrong, it is INVISIBLE.
    The first Blender cabinet had 46% of its surface area facing inward and
    rendered as ten attract screens floating in mid-air with no machines
    around them.

    So decide per shell, with the right test for each kind:
      closed shell -> signed volume. Exact, and correct even for concave parts.
      open shell   -> which way it faces relative to the whole object's centre.
                      A shell that wraps an object faces away from its middle.
    """
    bm.faces.ensure_lookup_table()
    bm.faces.index_update()
    if not bm.verts:
        return
    ctr = Vector((0, 0, 0))
    for v in bm.verts:
        ctr += v.co
    ctr /= len(bm.verts)

    seen = set()
    for f0 in bm.faces:
        if f0.index in seen:
            continue
        comp, stack = [], [f0]
        while stack:
            g = stack.pop()
            if g.index in seen:
                continue
            seen.add(g.index)
            comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        stack.append(h)
        closed = all(len(e.link_faces) == 2 for f in comp for e in f.edges)
        if closed:
            vol = 0.0
            for f in comp:
                vs = f.verts
                a = vs[0].co
                for k in range(1, len(vs) - 1):
                    vol += a.dot(vs[k].co.cross(vs[k + 1].co))
            flip = vol < 0
        else:
            s = 0.0
            for f in comp:
                d = f.calc_center_median() - ctr
                if d.length > 1e-9:
                    s += f.calc_area() * d.normalized().dot(f.normal)
            flip = s < 0
        if flip:
            bmesh.ops.reverse_faces(bm, faces=comp)


def _shade_auto_smooth(ob, deg):
    """Blender 4.1+ dropped mesh.use_auto_smooth for a 'Smooth by Angle'
    modifier. Try the operator, fall back to flat-but-smooth polys."""
    for p in ob.data.polygons:
        p.use_smooth = True
    try:
        prev = bpy.context.view_layer.objects.active
        sel = [o for o in bpy.context.view_layer.objects if o.select_get()]
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.shade_auto_smooth(angle=math.radians(deg))
        bpy.ops.object.select_all(action="DESELECT")
        for o in sel:
            try:
                o.select_set(True)
            except Exception:
                pass
        bpy.context.view_layer.objects.active = prev
    except Exception:
        pass


# ---- export ------------------------------------------------------------------------

def _to_hall(v):
    """Blender Z-up -> hall Y-up. det = +1, so winding survives."""
    return (v[0], v[2], -v[1])


# ---- ambient occlusion ---------------------------------------------------------------
# THE BIGGEST QUALITY LEVER IN THE WHOLE PIPELINE, and it ships for free.
#
# The hall's vertex format is pos(3) normal(3) uv(2) emissive(1) TINT(1). Until
# now `tint` only ever carried a per-MATERIAL constant — one number repeated
# across every vertex that used it. It is a per-vertex float sitting in the
# buffer doing nothing.
#
# So: raycast the model against itself, work out how occluded each vertex is,
# and multiply that into tint. Result is contact shadow and crevice darkening
# on every surface — under the car, inside a wheel arch, in the corner where a
# cabinet meets the floor, up under a hat brim — with no new textures, no new
# bytes, and no shader change. That absence of any occlusion anywhere is most
# of what makes a scene read as "drawn" instead of "built".
#
# Raycast rather than Cycles' bake-to-vertex-colour: no engine config, no
# material node surgery, runs headless, deterministic, and the radius is a
# dial rather than a scene property.

def _hemisphere(n_rays):
    """Fibonacci hemisphere directions around +Z, cosine-ish weighted."""
    out = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(n_rays):
        z = (i + 0.5) / n_rays          # 0..1, never exactly 0 or 1
        r = math.sqrt(max(0.0, 1 - z * z))
        a = ga * i
        out.append(Vector((math.cos(a) * r, math.sin(a) * r, z)))
    return out


AO = dict(rays=28, dist=0.40, floor=0.42, power=1.15, ground=True)


def _bake_ao(me, mw, rays, dist, floor, power, ground):
    """Per-vertex AO in 0..1 (1 = fully open) for an already-evaluated mesh.

    `floor` is how dark a fully occluded vertex may get — never 0, or crevices
    punch black holes in a room that is already dark. `ground` adds the
    pavement as an occluder so things sitting on it get a contact shadow
    creeping up their sides, which is most of what sells weight.
    """
    from mathutils.bvhtree import BVHTree

    verts = [mw @ v.co for v in me.vertices]
    normals = [(mw.to_3x3() @ v.normal).normalized() for v in me.vertices]
    tris = [tuple(lt.vertices) for lt in me.loop_triangles]

    if ground:
        base = len(verts)
        s = 6.0
        verts += [Vector((-s, -s, 0)), Vector((s, -s, 0)), Vector((s, s, 0)), Vector((-s, s, 0))]
        tris += [(base, base + 1, base + 2), (base, base + 2, base + 3)]

    bvh = BVHTree.FromPolygons(verts, tris, all_triangles=True)
    dirs = _hemisphere(rays)
    out = []
    for i in range(len(normals)):
        p, n = verts[i], normals[i]
        up = Vector((0, 0, 1)) if abs(n.z) < 0.95 else Vector((1, 0, 0))
        tx = n.cross(up).normalized()
        ty = n.cross(tx).normalized()
        origin = p + n * 1e-3
        hit = 0.0
        for d in dirs:
            wd = (tx * d.x + ty * d.y + n * d.z).normalized()
            loc, _nn, _idx, dd = bvh.ray_cast(origin, wd, dist)
            if loc is not None:
                hit += 1.0 - (dd / dist) ** 2      # near hits occlude hardest
        open_f = max(0.0, 1.0 - hit / rays)
        out.append(floor + (1.0 - floor) * (open_f ** power))
    return out


def extract(ob, ao=True, ao_opts=None):
    """Evaluate modifiers and pull out (verts, tris, mats) in HALL space."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()

    o = dict(AO)
    o.update(ao_opts or {})
    vao = _bake_ao(me, ob.matrix_world, o["rays"], o["dist"], o["floor"],
                   o["power"], o["ground"]) if ao else None

    # split (auto-smooth) normals if this Blender exposes them
    corner = None
    try:
        corner = [tuple(c.vector) for c in me.corner_normals]
    except Exception:
        try:
            me.calc_normals_split()
            corner = [tuple(l.normal) for l in me.loops]
        except Exception:
            corner = None

    slot_names = []
    for ms in ev.data.materials:
        slot_names.append(ms.name[3:] if ms and ms.name.startswith("HM_") else "paint")

    mats, mat_ix = [], {}
    verts, vix, tris = [], {}, []
    mw = ob.matrix_world
    nrm_mw = mw.to_3x3().inverted_safe().transposed()

    for lt in me.loop_triangles:
        mname = slot_names[lt.material_index] if lt.material_index < len(slot_names) else "paint"
        if mname not in MATS:
            mname = "paint"
        if mname not in mat_ix:
            mat_ix[mname] = len(mats)
            mats.append(mname)
        mi = mat_ix[mname]
        region, rect, em, tint = MATS[mname]
        tri = []
        for k in range(3):
            li = lt.loops[k]
            vi = lt.vertices[k]
            co = mw @ me.vertices[vi].co
            # AO rides in the tint channel. Emissive surfaces are exempt: neon
            # does not get darker because it is near a wall.
            shade = 1.0 if (vao is None or em > 0.02) else vao[vi]
            if corner:
                nv = Vector(corner[li])
            else:
                nv = Vector(lt.normal)
            nv = (nrm_mw @ nv).normalized()
            uvv = me.uv_layers.active.data[li].uv if me.uv_layers.active else (0.5, 0.5)
            # region-local uv, inset so a bevel highlight can't sample a neighbour
            fu = rect[0] + (rect[2] - rect[0]) * min(1.0, max(0.0, uvv[0]))
            fv = rect[1] + (rect[3] - rect[1]) * min(1.0, max(0.0, uvv[1]))
            p = _to_hall((co.x, co.y, co.z))
            nn = _to_hall((nv.x, nv.y, nv.z))
            # normals to 2dp (~0.3 degrees): merges the split-normal near-duplicates
            # the beveller leaves behind without welding across a real crease.
            key = (round(p[0], 4), round(p[1], 4), round(p[2], 4),
                   round(nn[0], 2), round(nn[1], 2), round(nn[2], 2),
                   round(fu, 4), round(fv, 4), mi, round(shade, 2))
            ix = vix.get(key)
            if ix is None:
                ix = len(verts)
                vix[key] = ix
                verts.append([p[0], p[1], p[2], nn[0], nn[1], nn[2], fu, fv, mi, shade])
            tri.append(ix)
        if tri[0] != tri[1] and tri[1] != tri[2] and tri[0] != tri[2]:
            tris.append(tri)

    ev.to_mesh_clear()
    return {
        "mats": [{"r": MATS[m][0], "e": MATS[m][2], "t": MATS[m][3]} for m in mats],
        "verts": verts,
        "tris": tris,
    }


# ---- THE COMPACT ---------------------------------------------------------------------
# The double-parked car outside the hall — GRAND THEFT NUGGET's front door, and
# the single most-stared-at object on the street (you walk up to it to launch
# the game). It used to be six quads: a slab, a smaller slab, four flat stubs.
#
# It is now a lofted body: a nose that drops, a hood that crowns, a raked
# windscreen, a greenhouse that tucks in, wheel arches cut into the rocker, and
# four round wheels sitting under them.
#
# The footprint is a CONTRACT: js/arcade.js parks it in a 2.4 x 1.2 slot at
# x -10.6..-8.2, z 8.75..9.95, and hangs the blinking-hazard glow sprites off
# the corners at local (+-0.50, +-1.02). Keep the length 2.4, the width ~1.16,
# and put amber at those corners.

CAR_TOP = [                              # upper silhouette: bumper, hood, roof, boot
    (-1.20, 0.415), (-1.13, 0.505), (-0.99, 0.565), (-0.62, 0.595),
    (-0.36, 0.615), (-0.24, 0.715), (-0.03, 0.950), (0.33, 0.980),
    (0.58, 0.950), (0.72, 0.800), (0.87, 0.665), (1.07, 0.630), (1.20, 0.495),
]
CAR_BELT = [                             # the shoulder line (widest point)
    (-1.20, 0.300), (-1.10, 0.400), (-0.94, 0.468), (0.94, 0.468),
    (1.10, 0.402), (1.20, 0.318),
]
CAR_HW = [                               # half width at the belt
    (-1.20, 0.435), (-1.08, 0.525), (-0.88, 0.572), (-0.30, 0.580),
    (0.30, 0.580), (0.88, 0.572), (1.08, 0.532), (1.20, 0.445),
]
CAR_TW = [                               # half width along the top edge
    (-1.20, 0.355), (-1.08, 0.455), (-0.88, 0.518), (-0.42, 0.522),
    (-0.20, 0.458), (0.02, 0.432), (0.44, 0.432), (0.64, 0.468),
    (0.86, 0.508), (1.08, 0.472), (1.20, 0.375),
]
CAR_ROCKER = [                           # the sill, centre of the underside
    (-1.20, 0.205), (-1.06, 0.132), (-0.90, 0.146), (0.90, 0.146),
    (1.06, 0.132), (1.20, 0.212),
]
CAR_ARCH = [                             # extra lift at the OUTER edge = the arches
    (-1.20, 0.0), (-1.03, 0.0), (-0.96, 0.10), (-0.83, 0.225), (-0.63, 0.225),
    (-0.50, 0.10), (-0.43, 0.0), (0.43, 0.0), (0.50, 0.10), (0.63, 0.225),
    (0.83, 0.225), (0.96, 0.10), (1.03, 0.0), (1.20, 0.0),
]
CAR_YS = [-1.200, -1.160, -1.100, -1.030, -0.955, -0.870, -0.760, -0.660,
          -0.560, -0.470, -0.400, -0.340, -0.270, -0.180, -0.090, 0.000,
          0.110, 0.230, 0.340, 0.440, 0.530, 0.610, 0.680, 0.760,
          0.845, 0.930, 1.010, 1.080, 1.140, 1.200]
CAR_WHEEL_Y = 0.735
CAR_WHEEL_R = 0.248


def _arch_w(f):
    """How much of the arch lift a point at |x|/hw = f receives. 0 at the
    centre of the underside, all of it at the outer edge."""
    return smoothstep(0.50, 0.97, f)


def _car_ring(y):
    hw = pw(y, CAR_HW)
    tw = pw(y, CAR_TW)
    top = pw(y, CAR_TOP)
    belt = pw(y, CAR_BELT)
    rock = pw(y, CAR_ROCKER)
    arch = max(0.0, pw(y, CAR_ARCH))

    def b(f):
        return rock + arch * _arch_w(f)

    low = max(b(1.0) + 0.022, rock + 0.022)
    shx = hw * 0.52 + tw * 0.48
    shz = belt + (top - belt) * 0.58
    crown = top + 0.014
    # the waist rides between the belt and the shoulder, tucking in as it rises
    wz = min(max(pw(y, CAR_WAIST), belt + 0.030), shz - 0.030)
    wx = hw + (tw - hw) * ((wz - belt) / max(top - belt, 1e-4)) * 0.62
    pts = [
        (0.0, b(0.0)),
        (0.50 * hw, b(0.50)), (0.86 * hw, b(0.86)),
        (hw, low), (hw, belt), (wx, wz), (shx, shz), (tw, top - 0.022), (tw * 0.60, crown - 0.006),
        (0.0, crown),
        (-tw * 0.60, crown - 0.006), (-tw, top - 0.022), (-shx, shz), (-wx, wz), (-hw, belt), (-hw, low),
        (-0.86 * hw, b(0.86)), (-0.50 * hw, b(0.50)),
    ]
    return [(x, y, z) for (x, z) in pts]


# THE WAISTLINE — where paint stops and glass starts. This is a real edge loop
# in the body, not a threshold: the first version classified each face by its
# centre height and normal, and the boundary came out as a SAWTOOTH, because
# adjacent faces around the greenhouse shoulder straddle any line you pick. In
# the hall that read as black spikes stabbing out of the A- and C-pillars (you
# see the far side's jagged edge past the near roof). Give the cross-section a
# waist point and the boundary follows the geometry, cleanly, every time.
CAR_WAIST = [
    (-1.20, 0.545), (-0.60, 0.590), (-0.36, 0.618), (-0.20, 0.652),
    (0.30, 0.668), (0.62, 0.680), (0.86, 0.700), (1.20, 0.600),
]

# Where the glasshouse is, along the length. Chosen to land BETWEEN rings in
# CAR_YS so each boundary is one clean transverse edge.
CAR_CABIN = (-0.36, 0.87)     # windscreen base .. backlight base
CAR_LID = (-0.045, 0.575)     # the painted roof panel between them

# Ring point roles (see _car_ring): 18 points, so quad j spans point j -> j+1.
_J_UNDER = (0, 1, 2, 15, 16, 17)      # the floor pan
_J_FLANK = (3, 4, 13, 14)             # arch-to-belt, belt-to-waist: door skin
_J_GLASS = (5, 6, 11, 12)             # waist-to-shoulder-to-top: side windows
_J_TOP = (7, 8, 9, 10)                # the lid: roof, windscreen or backlight


def _car_face_mat(y, j):
    """Material for the quad at ring-midpoint y, loop position j."""
    if CAR_CABIN[0] <= y <= CAR_CABIN[1]:
        if j in _J_TOP:
            return "roof" if CAR_LID[0] <= y <= CAR_LID[1] else "glass"
        if j in _J_GLASS:
            return "glass"
    if j in _J_UNDER:
        return "paintLo"
    return "paint"


def build_compact():
    P = Part("compact")
    rings = [_car_ring(y) for y in CAR_YS]

    # --- body shell, lofted and then re-materialled by position ------------------
    ymid = [(CAR_YS[i] + CAR_YS[i + 1]) / 2 for i in range(len(CAR_YS) - 1)]
    P.loft(rings, "paint", cap_a=True, cap_b=True,
           mat_fn=lambda i, j: _car_face_mat(ymid[i], j))

    # --- wheels: tyre, sidewall shoulder, and a hub that catches the streetlamp ---
    for sy in (-1, 1):
        for sx in (-1, 1):
            y = sy * CAR_WHEEL_Y
            x = sx * (pw(y, CAR_HW) - 0.052)
            R = CAR_WHEEL_R
            # a tyre with rounded shoulders: three radial rings, not a can
            prof = [(-0.075, R * 0.80), (-0.052, R * 0.97), (0.052, R * 0.97), (0.075, R * 0.80)]
            rr = []
            for off, rad in prof:
                ring = []
                for j in range(18):
                    a = (j / 18) * math.tau
                    ring.append((x + off * sx, y + math.cos(a) * rad, R + math.sin(a) * rad))
                rr.append(ring)
            P.loft(rr, "tire", cap_a=True, cap_b=True)
            # hub cap, proud of the sidewall. Small and dim on purpose: at
            # R*0.42 in chrome it read as a pale dinner plate from the pavement.
            P.cyl((x + 0.082 * sx, y, R), "x", R * 0.34, R * 0.27, 0.026, "hub", slices=14)

    # --- bumpers: a bar that wraps the corners, sitting proud of the paint --------
    for sy, ykey in ((-1, -1.20), (1, 1.20)):
        yb = ykey - sy * 0.012
        hw = pw(ykey, CAR_HW)
        seg = []
        for j in range(9):
            t = j / 8.0
            xx = (t * 2 - 1) * hw * 1.02
            # bow the bar forward at the centre
            yy = yb + sy * 0.045 * (1 - (t * 2 - 1) ** 2)
            seg.append((xx, yy, 0.0))
        rings = []
        for dz, inset in ((0.175, 0.86), (0.235, 1.0), (0.300, 0.90)):
            rings.append([(x * inset, y + (yb - y) * (1 - inset) * 0.0, dz) for (x, y, _z) in seg])
        # skin the bar as an open strip (front face only — the back is inside paint)
        for i in range(len(rings) - 1):
            for j in range(len(seg) - 1):
                a, b_, c, d = rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]
                if sy < 0:
                    P.face([a, b_, c, d], "trim")
                else:
                    P.face([d, c, b_, a], "trim")

    # --- the face: grille, lamps, and the corner ambers the hazards hang off ------
    ny = -1.20
    P.box((0.0, ny + 0.030, 0.400), (pw(ny, CAR_HW) * 1.28, 0.070, 0.100), "trim")
    P.box((0.0, ny + 0.022, 0.400), (pw(ny, CAR_HW) * 0.55, 0.070, 0.026), "chrome")
    for sx in (-1, 1):
        P.box((sx * 0.300, ny + 0.062, 0.442), (0.230, 0.055, 0.068), "lampW")
    ty = 1.20
    for sx in (-1, 1):
        P.box((sx * 0.310, ty - 0.050, 0.470), (0.230, 0.060, 0.090), "lampRed")
    P.box((0.0, ty - 0.038, 0.450), (0.300, 0.055, 0.062), "trim")

    # corner markers — these sit under the blinking 'hazard' glow sprites that
    # js/arcade.js parks at local (+-0.50, +-1.02). Move them and the blink
    # detaches from the car. Tucked in far enough to read as a lens, not a flag.
    for sy in (-1, 1):
        for sx in (-1, 1):
            # ride the flank, don't guess at it: at |y|=1.02 the body has already
            # tucked in to ~0.545, so a lens parked at a hardcoded 0.50 buries
            # itself inside the paint and only the corner peeks out.
            hwm = pw(sy * 1.020, CAR_HW)
            P.box((sx * (hwm - 0.012), sy * 1.020, 0.452), (0.075, 0.105, 0.070), "amber")

    # --- wing mirrors: a stalk and a housing, at the base of the A-pillar ---------
    # z 0.60, not 0.64: the greenhouse has already tucked in by the belt, and at
    # 0.64 the stalk started in mid-air with a cube hovering beside the screen.
    for sx in (-1, 1):
        P.box((sx * 0.545, -0.330, 0.598), (0.090, 0.046, 0.030), "trim")
        P.box((sx * 0.612, -0.335, 0.612), (0.070, 0.105, 0.068), "paint")

    # --- door seam + handle: a shallow groove is worth more than a painted line ---
    # INSET (hw - 0.020, box 0.020 wide) so the seam is a crease in the flank,
    # not a panel bolted onto it.
    for sx in (-1, 1):
        hwm = 0.578
        P.box((sx * (hwm - 0.020), 0.055, 0.395), (0.020, 0.020, 0.300), "paintLo")
        P.box((sx * (hwm - 0.002), -0.115, 0.505), (0.026, 0.110, 0.034), "chrome")

    # segments=1: on a body this smooth the second bevel segment costs ~1.4k
    # triangles and a pile of split-normal duplicate vertices to buy an edge
    # highlight nobody can see from the pavement.
    return P.finish(bevel=0.016, segments=1, smooth_deg=42)


# ---- THE REGULARS ---------------------------------------------------------------------
# The five who stand outside the hall after dark. In js/arcade.js they were
# `blob3` (a wobbled UV sphere) with `box3` cubes stuck on for eyes, hats and
# hands. Local origin at the FEET, front at -Y (Blender) = +Z (hall), and the
# height of each is a contract with NPCS[] in arcade.js — a model taller than
# its `h` pushes its name prompt and its head glow into its own skull.
#
#   crumb 1.00   gravy 0.55 (sits on the bench at yBase 0.45)   hood 1.05
#   hen   0.78   dill  1.12

def _eyes(P, y, z, sep, r, mat="black"):
    """A pair of eyes set INTO the face rather than bolted onto it.

    `y` is the face SURFACE. The ball is squashed front-to-back and its centre
    pushed behind that surface, so only the front ~40% of it emerges. Full
    spheres parked proud of the skin read as googly eyes — which is exactly
    how Gravy's first pair came out."""
    for sx in (-1, 1):
        P.blob((sx * sep, y + r * 0.40, z), (r * 2, r * 1.6, r * 2), mat, stacks=6, slices=8)


def build_crumb():
    """BIG CRUMB — the bouncer. A slab of nugget in night sunglasses and a bow
    tie, arms crossed, unimpressed."""
    P = Part("crumb")
    NUG = [(0.0, 0.0), (0.05, 0.55), (0.16, 0.82), (0.30, 0.96), (0.46, 1.0),
           (0.63, 0.98), (0.78, 0.90), (0.90, 0.70), (1.0, 0.0)]
    HW = 0.86 / 2   # remember the half-width; hanging arms off a guessed number
                    # is what buried the first pair INSIDE his own body
    # the man himself: one big flattened nugget, lumpy the way a nugget is
    P.blob((0, 0, 0.115), (0.86, 0.60, 0.855), "nug", prof=NUG, lump=0.055, seed=1.7,
           stacks=13, slices=16)
    # feet: two rounded shoes, toes forward
    for sx in (-1, 1):
        P.blob((sx * 0.170, -0.045, 0.0), (0.235, 0.340, 0.130), "nugDark",
               prof=[(0, 0.75), (0.5, 1.0), (1.0, 0.55)], stacks=5, slices=10)
    # crossed arms: shoulder OUTSIDE the flank, forearms folded over the belly.
    # Slung LOW — at z 0.615 the shoulders sat level with the shades and the
    # arms looked like they grew out of his cheeks.
    for sx in (-1, 1):
        P.limb((sx * (HW - 0.02), -0.02, 0.470), (sx * (HW + 0.070), -0.10, 0.330), 0.092, 0.080, "nug")
        P.limb((sx * (HW + 0.070), -0.10, 0.330), (-sx * 0.095, -0.265, 0.352), 0.080, 0.065, "nug")
        P.blob((-sx * 0.110, -0.280, 0.305), (0.145, 0.145, 0.125), "nugDark", stacks=6, slices=9)
    # the shades: a wraparound band with two lenses, out on the face not the brow
    P.limb((-0.335, -0.235, 0.700), (0.335, -0.235, 0.700), 0.032, 0.032, "black", slices=8)
    for sx in (-1, 1):
        P.blob((sx * 0.160, -0.262, 0.640), (0.265, 0.130, 0.125), "black",
               prof=[(0, 0.5), (0.4, 1.0), (0.75, 1.0), (1.0, 0.45)], stacks=5, slices=10)
    # earpieces, back along the sides of his head
    for sx in (-1, 1):
        P.limb((sx * 0.320, -0.245, 0.702), (sx * 0.395, 0.060, 0.678), 0.026, 0.020, "black", slices=6)
    # bow tie: two wedges and a knot, worn at the collar — ABOVE the folded arms
    for sx in (-1, 1):
        P.blob((sx * 0.115, -0.272, 0.478), (0.185, 0.115, 0.150), "sauce",
               prof=[(0, 0.95), (0.5, 0.55), (1.0, 0.95)], stacks=4, slices=8)
    P.blob((0, -0.292, 0.510), (0.085, 0.085, 0.085), "wood", stacks=5, slices=8)
    return P.finish(bevel=0.008, segments=1, smooth_deg=48)


def build_dill():
    """DETECTIVE DILL — a dill pickle in a fedora and a trench collar, badge on
    the chest, notepad out, working the Catch Incident."""
    P = Part("dill")
    PICKLE = [(0.0, 0.0), (0.04, 0.62), (0.14, 0.88), (0.30, 0.99), (0.50, 1.0),
              (0.68, 0.96), (0.82, 0.86), (0.92, 0.66), (1.0, 0.0)]
    # the pickle: taller than he is wide, gently bumpy, flattened front-to-back
    P.blob((0, 0, 0.04), (0.40, 0.36, 0.92), "pickle", prof=PICKLE, lump=0.05, seed=4.1,
           stacks=14, slices=14)
    # trench collar: sits ON the shoulders and slopes DOWN and out. The first
    # pass flared upward at r=0.255 and read as a dinner plate round his neck.
    P.limb((0, -0.005, 0.700), (0, -0.005, 0.605), 0.150, 0.215, "felt", slices=14, cap=False)
    P.limb((0, -0.005, 0.700), (0, -0.005, 0.660), 0.150, 0.158, "feltDk", slices=14, cap=False)
    # arms out of the collar, one holding the notepad
    P.limb((-0.170, -0.02, 0.635), (-0.215, -0.145, 0.50), 0.062, 0.052, "felt")
    P.limb((0.170, -0.02, 0.635), (0.175, -0.175, 0.545), 0.062, 0.052, "felt")
    P.blob((-0.215, -0.165, 0.455), (0.10, 0.10, 0.095), "pickleDk", stacks=5, slices=8)
    P.blob((0.175, -0.195, 0.505), (0.10, 0.10, 0.095), "pickleDk", stacks=5, slices=8)
    # the notepad, flipped open
    P.box((0.185, -0.235, 0.545), (0.115, 0.020, 0.145), "paper")
    P.box((0.185, -0.245, 0.612), (0.115, 0.016, 0.030), "paper", taper=0.9)
    # the badge
    P.blob((0.115, -0.155, 0.585), (0.085, 0.045, 0.105), "badge", stacks=5, slices=8)
    # THE FEDORA: brim with a real dip at the front, a creased crown, a band
    P.brim((0, -0.01, 0.955), 0.115, 0.275, "felt", thick=0.026, tilt=-0.030)
    P.blob((0, -0.01, 0.945), (0.325, 0.315, 0.175), "felt",
           prof=[(0, 1.0), (0.55, 0.97), (0.82, 0.80), (1.0, 0.42)], stacks=6, slices=14)
    P.limb((0, -0.01, 0.975), (0, -0.01, 1.020), 0.170, 0.168, "feltDk", slices=14, cap=False)
    # the crown pinch — two dents either side of the centre crease
    for sx in (-1, 1):
        P.blob((sx * 0.085, -0.01, 1.070), (0.115, 0.20, 0.075), "felt", stacks=5, slices=9)
    _eyes(P, -0.145, 0.735, 0.080, 0.038)
    return P.finish(bevel=0.008, segments=1, smooth_deg=48)


def build_gravy():
    """GRAVY JONES — a weathered sauce cup settled on the bench, lid ajar, eyes
    at half mast. He does not get up."""
    P = Part("gravy")
    # the cup: a tapered tub with a rolled rim, dented on one side
    rings = []
    for v, r, z in ((0.00, 0.150, 0.000), (0.10, 0.158, 0.055), (0.45, 0.180, 0.245),
                    (0.80, 0.198, 0.420), (0.94, 0.205, 0.480), (1.00, 0.212, 0.505)):
        ring = []
        for j in range(18):
            a = (j / 18) * math.tau
            dent = 1.0 - 0.055 * math.exp(-((math.cos(a - 2.2) - 1) ** 2) * 6) * (1 - v)
            ring.append((math.cos(a) * r * dent, math.sin(a) * r * dent, z))
        rings.append(ring)
    P.loft(rings, "cup", cap_a=True, cap_b=False)
    # the rolled rim
    P.limb((0, 0, 0.505), (0, 0, 0.527), 0.212, 0.206, "cup", slices=18, cap=False)
    # the lid, ajar: an offset disc tipped off the rim
    P.brim((0.015, -0.02, 0.560), 0.0, 0.215, "lid", thick=0.030, tilt=0.038, slices=18)
    P.limb((0.015, -0.02, 0.545), (0.015, -0.02, 0.566), 0.200, 0.212, "lid", slices=18, cap=False)
    # a sauce tide-line where the cup has been sitting a while
    P.limb((0, 0, 0.300), (0, 0, 0.318), 0.186, 0.187, "sauce", slices=18, cap=False)
    # heavy lids over tired eyes. The lid is a HOOD over the top third — the
    # first version was as big as the eye and sat in front of it, so Gravy had
    # two white tabs for a face.
    _eyes(P, -0.170, 0.348, 0.064, 0.042)
    for sx in (-1, 1):
        P.blob((sx * 0.064, -0.182, 0.402), (0.112, 0.070, 0.038), "cup",
               prof=[(0, 0.9), (0.55, 1.0), (1.0, 0.55)], stacks=4, slices=9)
    return P.finish(bevel=0.007, segments=1, smooth_deg=48)


def build_hood():
    """THE HOODED NUG — a robe to the floor, a deep cowl, and two amber glints
    where a face should be. Four for four on rumours."""
    P = Part("hood")
    # the robe: flares to the pavement, no feet, gathers at the shoulders
    ROBE = [(0.0, 1.0), (0.20, 0.86), (0.48, 0.74), (0.72, 0.70), (0.88, 0.66), (1.0, 0.58)]
    rings = []
    for i in range(11):
        v = i / 10
        r = pw(v, ROBE)
        ring = []
        for j in range(16):
            a = (j / 16) * math.tau
            fold = 1 + 0.045 * math.sin(a * 6 + 0.4) * (0.4 + 0.6 * (1 - v))
            ring.append((math.cos(a) * 0.310 * r * fold, math.sin(a) * 0.265 * r * fold, v * 0.700))
        rings.append(ring)
    P.loft(rings, "cloth", cap_a=True, cap_b=False)
    # shoulders under the cloth
    P.limb((-0.205, 0.0, 0.600), (0.205, 0.0, 0.600), 0.140, 0.140, "cloth", slices=10)
    # the nug inside, in shadow
    P.blob((0, -0.020, 0.640), (0.270, 0.245, 0.310), "nugDark", stacks=8, slices=12)

    # THE COWL. First attempt was an arc swept over the head; it rendered as a
    # MUSHROOM CAP — a wide flat disc with no face under it. A cowl is not a
    # dome on a stick: it is a closed teardrop of cloth with a CAVE punched
    # into the front. So this builds a closed shell and pushes the front-centre
    # inward, leaving a recess dark enough for two eyes to live in.
    CZ0, CH = 0.560, 0.520
    SL, ST = 18, 11
    FRONT = -math.pi / 2      # -Y is the face direction

    def cowl_pt(v, j):
        a = (j / SL) * math.tau
        ph = math.pi * (0.10 + 0.86 * v)
        rr = math.sin(ph)
        zz = CZ0 + CH * (0.5 - math.cos(ph) * 0.5)
        # angular and vertical falloff around the face opening
        da = math.atan2(math.sin(a - FRONT), math.cos(a - FRONT))
        fa = max(0.0, 1.0 - (abs(da) / 1.05) ** 2)
        fv = max(0.0, 1.0 - ((v - 0.44) / 0.40) ** 2)
        dish = 1.0 - 0.62 * fa * fv
        return (math.cos(a) * 0.300 * rr * dish,
                math.sin(a) * 0.285 * rr * dish - 0.030 * (1 - v),
                zz)

    cowl = [[cowl_pt(i / (ST - 1), j) for j in range(SL)] for i in range(ST)]

    def cowl_mat(i, j):
        v = (i + 0.5) / (ST - 1)
        a = ((j + 0.5) / SL) * math.tau
        da = math.atan2(math.sin(a - FRONT), math.cos(a - FRONT))
        inside = abs(da) < 0.80 and 0.16 < v < 0.72
        return "clothDk" if inside else "cloth"

    P.loft(cowl, "cloth", cap_a=False, cap_b=False, mat_fn=cowl_mat)
    # the eyes, down in the recess. The only bright thing on him.
    for sx in (-1, 1):
        P.blob((sx * 0.072, -0.150, 0.660), (0.056, 0.050, 0.068), "eye", stacks=5, slices=8)
    return P.finish(bevel=0.007, segments=1, smooth_deg=50)


def build_hen():
    """HENRIETTA — an actual hen. Comb, wattle, tail fan, and the small
    skeptical eyes of someone who has heard this before."""
    P = Part("hen")
    # body: an egg tipped nose-down, tail high
    P.blob((0, 0.03, 0.155), (0.30, 0.40, 0.375), "hen",
           prof=[(0, 0.0), (0.10, 0.68), (0.34, 0.96), (0.60, 1.0), (0.82, 0.82), (1.0, 0.0)],
           stacks=10, slices=14)
    # neck and head
    P.limb((0, -0.045, 0.400), (0, -0.100, 0.545), 0.098, 0.082, "hen", slices=10, cap=False)
    P.blob((0, -0.115, 0.475), (0.185, 0.195, 0.215), "hen", stacks=8, slices=12)
    # the comb: three lobes along the crown
    for i, (yy, rr, zz) in enumerate(((-0.055, 0.042, 0.660), (-0.115, 0.052, 0.672), (-0.170, 0.038, 0.652))):
        P.blob((0, yy, zz), (0.030, rr * 2, rr * 2.1), "comb", stacks=5, slices=8)
    # wattle, under the beak
    P.blob((0, -0.185, 0.500), (0.055, 0.048, 0.090), "comb", stacks=5, slices=8)
    # beak: a tapered wedge, not a box
    P.limb((0, -0.180, 0.560), (0, -0.290, 0.545), 0.052, 0.010, "beak", slices=8)
    _eyes(P, -0.205, 0.588, 0.072, 0.030)
    # wings folded along the flanks
    for sx in (-1, 1):
        P.blob((sx * 0.150, 0.020, 0.195), (0.075, 0.320, 0.260), "henDark",
               prof=[(0, 0.35), (0.4, 1.0), (0.75, 0.92), (1.0, 0.30)], stacks=6, slices=10)
    # tail fan: three swept feathers
    for i, sx in enumerate((-1, 0, 1)):
        P.blob((sx * 0.075, 0.290 + abs(sx) * 0.02, 0.330 - abs(sx) * 0.04),
               (0.075, 0.240, 0.300), "hen",
               prof=[(0, 0.30), (0.45, 1.0), (1.0, 0.22)], stacks=5, slices=8)
    # legs and feet
    for sx in (-1, 1):
        P.limb((sx * 0.075, -0.010, 0.150), (sx * 0.082, -0.020, 0.030), 0.030, 0.024, "beak", slices=7)
        for ty, tx in ((-0.075, 0.0), (-0.050, 0.045), (-0.050, -0.045)):
            P.limb((sx * 0.082, -0.020, 0.024), (sx * 0.082 + tx, ty, 0.014), 0.020, 0.010, "beak", slices=6)
    return P.finish(bevel=0.006, segments=1, smooth_deg=48)


# ---- THE CABINET -----------------------------------------------------------------------
# Ten of these stand in the hall and they are what a visitor looks at for most
# of their visit. The old one was five extruded quads off a side profile: no
# T-molding, no coin door, no speakers, and a joystick painted onto the control
# panel as a picture of a joystick.
#
# THE PROFILE IS A CONTRACT. js/arcade.js's PROF/CAB_ZB still compute the CRT
# quad (`screen.pts`), the zoom target, the interaction AABB and the marquee
# glow position from these exact numbers — that metadata stays in JS and only
# the visible geometry moves here. Change a number and the camera will fly to
# a screen that is no longer where the picture is.
CAB_PROF = [
    (0.000, 0.340),   # floor
    (1.020, 0.340),   # lower front (coin door)
    (1.120, 0.460),   # deck lip
    (1.200, 0.140),   # control panel (slanted top)
    (1.680, 0.020),   # screen face (leans back)
    (1.940, 0.160),   # marquee (leans forward)
]
CAB_W, CAB_H, CAB_ZB, CAB_ZMAX = 0.920, 1.940, -0.420, 0.460


def build_cabinet():
    """One model, ten machines. Blender front is -Y; the JS profile measures
    `zFront` as POSITIVE toward the player, so V() flips it once here rather
    than sprinkling minus signs through ninety coordinates."""
    P = Part("cabinet")
    hw = CAB_W / 2
    prof = CAB_PROF
    T = 0.026          # T-molding thickness: the strip that caps a cabinet's edges

    def V(x, zf, y):
        return (x, -zf, y)

    # --- THE BODY: ONE CLOSED PRISM ------------------------------------------------
    # Extrude the side outline across the cabinet's width. The tube WALLS are
    # the front segments (coin door, deck, control panel, screen face, marquee)
    # plus the top and back; the two CAPS are the side-art panels.
    #
    # Closed and manifold on purpose. The first version built the sides as
    # separate open slabs and the front as loose quads, which left the body a
    # single open shell — and `recalc_face_normals` cannot tell you which way
    # an open shell should face. Half the machine ended up inside-out, and
    # since the hall culls back faces, that is not "shaded oddly", it is GONE:
    # ten attract screens hanging in mid-air with no cabinets around them.
    # A closed solid has exactly one right answer and Blender always finds it.
    poly = [(z, y) for (y, z) in prof] + [(CAB_ZB, CAB_H), (CAB_ZB, 0.0)]
    seg_mat = ["cabFront", "cabMetal", "cabPanel", "cabBezel", "cabMarq",
               "cabDark", "cabDark", "cabDark"]   # ...top, back, underside
    fw = hw - T
    P.loft([[V(-fw, z, y) for (z, y) in poly], [V(fw, z, y) for (z, y) in poly]],
           "cabFront", cap_a=True, cap_b=True, cap_mat="cabSide",
           mat_fn=lambda i, j: seg_mat[j] if j < len(seg_mat) else "cabDark")

    # --- ARTWORK UVs: the per-game panels have to be READ, not projected ----------
    # Same mapping the original JS quads used, so every marquee, panel and side
    # panel that ArcadeArt paints still lands exactly where its painter expects.
    def across(x):
        return (x + fw) / (2 * fw)

    def seg_v(i, y):
        """0 at the far end of profile segment i, 1 at the near end — matching
        the v the old B.quad() call handed this face."""
        y1, y2 = prof[i][0], prof[i + 1][0]
        return 1.0 - (y - y1) / (y2 - y1)

    P.set_uv("cabFront", lambda x, y, z: (across(x), seg_v(0, z)))
    P.set_uv("cabMetal", lambda x, y, z: (across(x), seg_v(1, z)))
    P.set_uv("cabBezel", lambda x, y, z: (across(x), seg_v(3, z)))
    P.set_uv("cabMarq", lambda x, y, z: (across(x), seg_v(4, z)))
    # the control panel is nearly horizontal: run v along its DEPTH, front to back
    P.set_uv("cabPanel", lambda x, y, z: (across(x), ((-y) - prof[3][1]) / (prof[2][1] - prof[3][1])))
    # side art spans the whole side profile: u across the depth, v down the height
    P.set_uv("cabSide", lambda x, y, z: (((-y) - CAB_ZB) / (CAB_ZMAX - CAB_ZB), 1.0 - z / CAB_H))

    # --- T-MOLDING: the proud lip that follows a cabinet's whole edge ---------------
    # The signature detail of an arcade machine. Without it you have a box with
    # a picture on the side.
    for sx in (-1, 1):
        mold = []
        for out_d, grow in ((0.000, -0.014), (T * 0.70, -0.003), (T * 1.05, 0.004),
                            (T * 0.70, -0.003), (0.000, -0.014)):
            mold.append([V(sx * (fw + out_d), z, y) for (z, y) in _grow(poly, grow)])
        P.loft(mold, "cabTrim", cap_a=False, cap_b=False)

    # --- MARQUEE LIGHT BOX: a hood over the top, glowing from underneath -----------
    P.box(V(0, 0.215, 1.985), (CAB_W + 0.03, 0.135, 0.055), "cabTrimD")
    P.box(V(0, 0.185, 1.950), (CAB_W - 0.10, 0.075, 0.018), "cabLight")

    # --- SPEAKER GRILLE under the marquee ------------------------------------------
    P.box(V(0, 0.058, 1.742), (CAB_W - 0.14, 0.028, 0.088), "cabMetalD")
    for i in range(9):
        gx = -0.31 + i * 0.0775
        P.limb(V(gx, 0.074, 1.706), V(gx, 0.074, 1.778), 0.014, 0.014, "cabDark", slices=7)

    # --- BEZEL: the CRT sits in a recess with a lip that catches the room ----------
    y1, z1 = prof[3]
    y2, z2 = prof[4]
    nl = math.hypot(z2 - z1, y2 - y1)
    bny, bnz = -(z2 - z1) / nl, (y2 - y1) / nl      # outward normal of the screen face

    def fp(t, xx, off):
        return V(xx, z1 + (z2 - z1) * t + bnz * off, y1 + (y2 - y1) * t + bny * off)

    inx = hw * 0.80
    frames = [(0.015, 0.095, -inx - 0.034, inx + 0.034),
              (0.905, 0.985, -inx - 0.034, inx + 0.034)]
    for (ta, tb, xa, xb) in frames:
        P.loft([[fp(ta, xa, 0.004), fp(tb, xa, 0.004), fp(tb, xb, 0.004), fp(ta, xb, 0.004)],
                [fp(ta, xa, 0.040), fp(tb, xa, 0.040), fp(tb, xb, 0.040), fp(ta, xb, 0.040)]],
               "cabTrimD")
    for sx in (-1, 1):
        xa, xb = sx * (inx + 0.002), sx * (inx + 0.034)
        P.loft([[fp(0.05, xa, 0.004), fp(0.95, xa, 0.004), fp(0.95, xb, 0.004), fp(0.05, xb, 0.004)],
                [fp(0.05, xa, 0.040), fp(0.95, xa, 0.040), fp(0.95, xb, 0.040), fp(0.05, xb, 0.040)]],
               "cabTrimD")

    # --- CONTROL PANEL: a joystick and buttons you could actually grab -------------
    py1, pz1 = prof[2]
    py2, pz2 = prof[3]
    pl = math.hypot(pz2 - pz1, py2 - py1)
    pny, pnz = -(pz2 - pz1) / pl, (py2 - py1) / pl

    def cp(t, xx, off=0.0):
        return V(xx, pz1 + (pz2 - pz1) * t + pnz * off, py1 + (py2 - py1) * t + pny * off)

    jx, jt = -0.250, 0.50
    P.limb(cp(jt, jx, 0.002), cp(jt, jx, 0.020), 0.054, 0.045, "cabMetal", slices=12)
    P.limb(cp(jt, jx, 0.016), cp(jt, jx, 0.088), 0.017, 0.015, "cabMetalD", slices=8)
    P.blob(cp(jt, jx, 0.076), (0.072, 0.072, 0.074), "btnRed", stacks=7, slices=10)
    cols = ["btnRed", "btnAmber", "btnCyan"]
    for row, tt in enumerate((0.34, 0.64)):
        for i in range(3):
            bx = 0.020 + i * 0.100
            P.limb(cp(tt, bx, 0.001), cp(tt, bx, 0.014), 0.041, 0.037, "cabMetalD", slices=10)
            P.blob(cp(tt, bx, 0.009), (0.068, 0.068, 0.026), cols[(i + row) % 3],
                   prof=[(0, 0.92), (0.55, 1.0), (1.0, 0.45)], stacks=4, slices=10)
    for bx in (-0.075, 0.015):
        P.limb(cp(0.88, bx, 0.001), cp(0.88, bx, 0.011), 0.029, 0.027, "cabMetalD", slices=8)
        P.blob(cp(0.88, bx, 0.007), (0.048, 0.048, 0.018), "btnWhite",
               prof=[(0, 0.92), (0.55, 1.0), (1.0, 0.45)], stacks=4, slices=8)

    # --- COIN DOOR: recessed steel, two slots, a return cup, a lock ---------------
    cz = prof[0][1]
    P.box(V(0, cz - 0.012, 0.560), (0.380, 0.028, 0.440), "cabMetalD")
    P.box(V(0, cz + 0.008, 0.560), (0.345, 0.020, 0.405), "cabMetal")
    for sx in (-1, 1):
        P.box(V(sx * 0.100, cz + 0.022, 0.690), (0.118, 0.022, 0.118), "cabMetalD")
        P.box(V(sx * 0.100, cz + 0.033, 0.706), (0.015, 0.012, 0.064), "coinSlot")
    P.box(V(0, cz + 0.016, 0.428), (0.195, 0.026, 0.078), "coinSlot")
    P.limb(V(0, cz + 0.008, 0.585), V(0, cz + 0.028, 0.585), 0.026, 0.022, "cabMetal", slices=8)

    # --- kick plate and levelers ---------------------------------------------------
    P.box(V(0, cz - 0.004, 0.068), (CAB_W - 0.06, 0.018, 0.128), "cabMetalD")
    for sx in (-1, 1):
        for zz in (cz - 0.07, CAB_ZB + 0.09):
            P.limb(V(sx * (hw - 0.075), zz, 0.0), V(sx * (hw - 0.075), zz, 0.032),
                   0.026, 0.026, "cabMetalD", slices=6)
    return P.finish(bevel=0.006, segments=1, smooth_deg=34)


def _grow(poly, d):
    """Offset a closed 2D outline outward by d (used for the T-molding lip)."""
    if not d:
        return list(poly)
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    out = []
    for (x, y) in poly:
        vx, vy = x - cx, y - cy
        L = math.hypot(vx, vy) or 1.0
        out.append((x + vx / L * d, y + vy / L * d))
    return out


REGULARS = {
    "crumb": build_crumb, "dill": build_dill, "gravy": build_gravy,
    "hood": build_hood, "hen": build_hen,
}


# ---- THE STREET AND THE ROOM -----------------------------------------------------------
# Props and architecture. Same rules as everything else: origin on the ground,
# front at -Y (Blender) = +Z (hall), and never move the object — build_all()
# keeps everything at the origin because extract() bakes matrix_world.
#
# The trim pieces are ONE UNIT LONG on X and get stretched by the call site
# (Builder.model's per-axis scale). A moulding profile does not distort when
# you stretch it along its own run, so a 1m section covers a 20m wall.

def build_street_lamp():
    """A cast-iron streetlamp: stepped plinth, fluted tapered post, a curved
    arm, and a real lantern with a glowing lens. Was a four-quad box pole with
    a four-quad box on the end."""
    P = Part("streetLamp")
    # stepped plinth
    P.cyl((0, 0, 0.055), "z", 0.150, 0.150, 0.110, "iron", slices=12)
    P.cyl((0, 0, 0.140), "z", 0.128, 0.104, 0.070, "iron", slices=12)
    P.cyl((0, 0, 0.210), "z", 0.098, 0.086, 0.075, "ironD", slices=12)
    # the post, tapering, with two collars
    P.cyl((0, 0, 1.700), "z", 0.070, 0.050, 3.000, "iron", slices=12, cap=False)
    for zz, r in ((0.62, 0.082), (2.62, 0.062)):
        P.cyl((0, 0, zz), "z", r, r, 0.055, "ironD", slices=12)
    # the arm: a quarter-turn sweep out over the pavement (model front, -Y)
    steps = 7
    prev = None
    for i in range(steps + 1):
        t = i / steps
        a = t * math.pi * 0.5
        y = -0.70 * math.sin(a)
        z = 3.20 - 0.24 * (1 - math.cos(a))
        if prev:
            P.limb(prev, (0, y, z), 0.044 - 0.010 * t, 0.042 - 0.010 * t, "iron", slices=8, cap=False)
        prev = (0, y, z)
    # the lantern: a tapered housing, a glowing lens beneath, a finial on top
    P.cyl((0, -0.700, 3.010), "z", 0.075, 0.185, 0.110, "ironD", slices=10)
    P.cyl((0, -0.700, 2.880), "z", 0.180, 0.140, 0.170, "lampGlass", slices=10, cap=False)
    P.cyl((0, -0.700, 2.790), "z", 0.140, 0.055, 0.045, "lampHot", slices=10)
    P.blob((0, -0.700, 3.070), (0.070, 0.070, 0.110), "iron", stacks=5, slices=8)
    return P.finish(bevel=0.006, segments=1, smooth_deg=40)


def build_bench():
    """A slatted park bench with cast-iron ends. 2.0 long, seat facing +Z in
    the hall — Gravy Jones sits on it, so the seat height is a contract (his
    yBase is 0.45)."""
    P = Part("bench")
    L = 2.0
    for sx in (-1, 1):
        ex = sx * (L / 2 - 0.10)
        # end frame: two legs, an armrest curl, a back stile
        P.limb((ex, 0.115, 0.0), (ex, 0.150, 0.450), 0.036, 0.030, "ironD", slices=8)
        P.limb((ex, -0.150, 0.0), (ex, -0.170, 0.450), 0.036, 0.030, "ironD", slices=8)
        P.limb((ex, -0.170, 0.440), (ex, 0.150, 0.440), 0.030, 0.030, "ironD", slices=8)
        P.limb((ex, 0.150, 0.430), (ex, 0.190, 0.930), 0.032, 0.026, "ironD", slices=8)
        P.limb((ex, -0.180, 0.470), (ex, -0.150, 0.700), 0.026, 0.022, "ironD", slices=8)
        P.limb((ex, -0.150, 0.700), (ex, 0.060, 0.760), 0.026, 0.024, "ironD", slices=8)
        P.blob((ex, 0.075, 0.740), (0.070, 0.140, 0.070), "ironD", stacks=5, slices=8)
    # seat slats, front to back
    for i, yy in enumerate((-0.135, -0.045, 0.045, 0.135)):
        P.box((0, yy, 0.470), (L - 0.06, 0.072, 0.036), "wood")
    # back slats, raked
    for i, (yy, zz) in enumerate(((0.165, 0.620), (0.180, 0.730), (0.196, 0.840))):
        P.box((0, yy, zz), (L - 0.10, 0.032, 0.078), "wood")
    return P.finish(bevel=0.005, segments=1, smooth_deg=40)


def build_facade_bay():
    """One bay of the block across the road: pilasters, two windows set into
    real reveals with sills and lintels, a stringcourse and a cornice.

    The whole opposite side of the street was ONE FLAT QUAD with windows
    painted on it. Painted windows have no reveal, so they never catch a
    shadow and the block reads as wallpaper — which is precisely what it
    looked like. This sits proud of that quad, which stays as the backdrop.
    """
    P = Part("facadeBay")
    W, H = 3.00, 5.40
    hw = W / 2
    D = 0.150            # how far the bay stands off the flat wall behind it
    # pilasters up both edges
    for sx in (-1, 1):
        P.box((sx * (hw - 0.130), -D / 2, 2.500), (0.260, D, 5.000), "brickD")
        P.box((sx * (hw - 0.130), -D - 0.020, 2.500), (0.200, 0.045, 4.900), "brickD")
    # spandrel panels between the windows, standing proud
    for zz, hh in ((0.900, 1.800), (3.150, 0.700)):
        P.box((0, -D / 2, zz), (W - 0.520, D, hh), "brick")
    # two windows, each in a recess with a sill and a lintel
    for zc in (2.150, 4.250):
        P.box((0, -D + 0.055, zc), (W - 0.640, 0.110, 1.180), "glassDark")
        # reveal: jambs, head and cill returns around the opening
        for sx in (-1, 1):
            P.box((sx * (W / 2 - 0.320), -D / 2 + 0.010, zc), (0.090, D - 0.020, 1.300), "brickD")
        P.box((0, -D / 2 + 0.010, zc + 0.650), (W - 0.560, D - 0.020, 0.100), "brickD")
        # sill, proud and shadow-casting
        P.box((0, -D - 0.060, zc - 0.660), (W - 0.440, 0.170, 0.090), "stone")
        # lintel band
        P.box((0, -D - 0.035, zc + 0.720), (W - 0.480, 0.115, 0.085), "stone")
        # window mullion + transom
        P.box((0, -D + 0.005, zc), (0.045, 0.055, 1.180), "ironD")
        P.box((0, -D + 0.005, zc + 0.330), (W - 0.640, 0.055, 0.040), "ironD")
    # stringcourse and cornice
    P.box((0, -D - 0.075, 3.560), (W, 0.180, 0.120), "stone")
    P.box((0, -D - 0.110, 5.180), (W, 0.250, 0.180), "stone")
    P.box((0, -D - 0.070, 5.330), (W, 0.180, 0.120), "brickD")
    return P.finish(bevel=0.006, segments=1, smooth_deg=36)


def build_ac_unit():
    """A window air-conditioner, dripping onto the pavement since forever."""
    P = Part("acUnit")
    P.box((0, -0.180, 0.170), (0.560, 0.360, 0.340), "metalD")
    P.box((0, -0.362, 0.170), (0.500, 0.020, 0.280), "metalG")
    for i in range(6):
        P.box((-0.200 + i * 0.080, -0.372, 0.170), (0.022, 0.014, 0.250), "metalD")
    # the bracket that holds it up
    for sx in (-1, 1):
        P.limb((sx * 0.240, -0.010, 0.010), (sx * 0.240, -0.340, 0.010), 0.020, 0.016, "ironD", slices=6)
        P.limb((sx * 0.240, -0.340, 0.010), (sx * 0.240, -0.030, -0.230), 0.016, 0.014, "ironD", slices=6)
    return P.finish(bevel=0.005, segments=1, smooth_deg=40)


def build_trim_base():
    """One metre of skirting board. Stretched along a wall by the call site."""
    P = Part("trimBase")
    prof = [(0.000, 0.000), (0.062, 0.000), (0.062, 0.115), (0.048, 0.140),
            (0.048, 0.168), (0.020, 0.196), (0.000, 0.196)]
    rings = [[(x, -py, pz) for (py, pz) in prof] for x in (0.0, 1.0)]
    P.loft(rings, "trimWood", cap_a=True, cap_b=True)
    return P.finish(bevel=0.004, segments=1, smooth_deg=34)


def build_trim_crown():
    """One metre of crown moulding: origin at the ceiling line, hangs down."""
    P = Part("trimCrown")
    prof = [(0.000, 0.000), (0.170, 0.000), (0.150, -0.055), (0.100, -0.105),
            (0.052, -0.140), (0.030, -0.185), (0.030, -0.245), (0.000, -0.245)]
    rings = [[(x, -py, pz) for (py, pz) in prof] for x in (0.0, 1.0)]
    P.loft(rings, "trimWood", cap_a=True, cap_b=True)
    return P.finish(bevel=0.004, segments=1, smooth_deg=34)


# ---- THE CEILING: the interior's sky ---------------------------------------------
# Measured across ten fixed camera spots, the hall's dead-black fraction sat at
# 22% and essentially ALL of it was one surface: a 15 x 20 metre plane at y=4.2
# with an albedo of 0.038 and two white bars painted on it. No lighting fixes an
# albedo of four percent, and no amount of light fills a plane that has nothing
# on it to catch any.
#
# So the ceiling gets what the street got: geometry. Ribs to break the plane
# into coffers, luminaires with actual bodies instead of glowing rectangles,
# a duct run, and signage hanging off it. Every one of these is a metre-long
# module stretched by its call site — the trimBase/trimCrown pattern, which is
# already proven and means arcade.js can re-lay the whole grid by editing a
# loop instead of a mesh.
#
# All origins sit ON the ceiling line and hang DOWN, so a call site places one
# with an (x, z) and nothing else. Blender is Z-up and the hall is Y-up, so
# "hangs down" is negative Z here.

def build_ceil_beam():
    """One metre of coffer rib.

    The hall's existing flat ceiling plane stays exactly where it is and becomes
    the PAN of every coffer. These are the edges — and edges are the entire
    point, because a rib catches a grazing light from the tube beside it while
    the pan behind it stays dark, which is what makes a ceiling read as a
    ceiling instead of as the absence of one.
    """
    P = Part("ceilBeam")
    prof = [(-0.092, 0.000), (0.092, 0.000), (0.092, -0.116),
            (0.058, -0.194), (-0.058, -0.194), (-0.092, -0.116)]
    rings = [[(x, py, pz) for (py, pz) in prof] for x in (0.0, 1.0)]
    P.loft(rings, "ceilRib", cap_a=True, cap_b=True)
    return P.finish(bevel=0.005, segments=1, smooth_deg=34)


def build_ceil_light():
    """A luminaire with a BODY: housing, end caps, a recessed diffuser and the
    two stems that hold it off the deck.

    What was there before: three quads at y 4.04-4.14 drawn emissive, i.e. a
    bright rectangle. A bright rectangle is a picture of a light. This one has
    a metal shell that takes the room's own light on its sides, a diffuser set
    up INSIDE the shell so the glow has a lip to spill past, and a shadow line
    where it meets the ceiling. Unit is 1 metre; the call site stretches it.
    """
    P = Part("ceilLight")
    # stems up into the deck
    for sx in (0.16, 0.84):
        P.box((sx, 0.0, -0.045), (0.035, 0.035, 0.09), "ceilRod")
    # the housing: a shallow tray, open at the bottom
    hw, hd = 0.145, 0.115
    outer = [(-hw, 0.0), (hw, 0.0), (hw, -hd), (0.104, -hd - 0.028),
             (-0.104, -hd - 0.028), (-hw, -hd)]
    rings = [[(x, py, pz) for (py, pz) in outer] for x in (0.0, 1.0)]
    P.loft(rings, "fixBody", cap_a=True, cap_b=True)
    # the diffuser, recessed 0.03 inside the tray's mouth so the lip reads
    P.box((0.5, 0.0, -hd - 0.012), (0.94, 0.176, 0.020), "fixDiff")
    # end caps, slightly proud
    for ex in (0.012, 0.988):
        P.box((ex, 0.0, -0.072), (0.024, 0.31, 0.152), "fixEnd")
    return P.finish(bevel=0.006, segments=1, smooth_deg=36)


def build_ceil_duct():
    """One metre of rectangular duct on threaded rod.

    Every arcade, bowling alley and diner ceiling in the world has one of these
    and none of them are flat. It reads instantly, it is cheap, and it puts a
    horizontal edge across the room at a height nothing else occupies.
    """
    P = Part("ceilDuct")
    for rx in (0.14, 0.86):
        for ry in (-0.185, 0.185):
            P.box((rx, ry, -0.135), (0.022, 0.022, 0.27), "ceilRod")
    P.box((0.5, 0.0, -0.40), (1.0, 0.36, 0.26), "duct")
    # flanged joint at one end — the seam that makes it read as ductWORK
    P.box((0.03, 0.0, -0.40), (0.06, 0.40, 0.30), "ductBand")
    return P.finish(bevel=0.008, segments=1, smooth_deg=34)


def build_hang_sign():
    """A double-sided hanging sign on two rods: dark face, lit edge band.

    Origin at the ceiling line, hanging into the room. One metre wide; the call
    site scales and remaps nothing — the face texture is the `dark` region and
    the glow band is a swatch, both of which exist on the MAIN atlas (checking
    that BEFORE modelling is the lampHot trap, walked into twice).
    """
    P = Part("hangSign")
    for rx in (0.16, 0.84):
        P.box((rx, 0.0, -0.20), (0.020, 0.020, 0.40), "ceilRod")
    P.box((0.5, 0.0, -0.575), (1.0, 0.085, 0.40), "signFace")
    # lit bands top and bottom — the bits that actually throw light
    P.box((0.5, 0.0, -0.788), (0.96, 0.098, 0.048), "signGlow")
    P.box((0.5, 0.0, -0.366), (0.96, 0.098, 0.030), "signGlow")
    return P.finish(bevel=0.006, segments=1, smooth_deg=34)


def build_vestibule():
    """The entry soffit: a dropped header over the doorway with a downlight
    reveal, plus the two jambs.

    The doorway was a 2.5m hole in a wall with nothing framing it. This is what
    you actually walk under on the way in, and it is the first geometry the
    camera sees on the intro dolly.
    """
    P = Part("vestibule")
    # ORIGIN ON THE GROUND, like every other model — the ceiling modules are
    # the documented exception and this is not one of them. The header sits
    # ABOVE the 2.6m opening; the jambs stand beside it. Getting this backwards
    # hangs a beam across the doorway you walk through.
    W, D, OPEN = 3.10, 0.62, 2.60
    P.box((0.0, 0.0, OPEN + 0.30), (W, D, 0.60), "vestBody")            # header
    P.box((0.0, 0.0, OPEN - 0.038), (W - 0.26, D - 0.14, 0.075), "vestLip")
    P.box((0.0, 0.0, OPEN - 0.088), (W - 0.62, D - 0.30, 0.030), "vestGlow")  # reveal
    for sx in (-(W / 2 - 0.11), (W / 2 - 0.11)):                        # jambs
        P.box((sx, 0.0, OPEN / 2), (0.22, D, OPEN), "vestBody")
    return P.finish(bevel=0.008, segments=1, smooth_deg=36)


MODELS = {"compact": build_compact, "cabinet": build_cabinet}
MODELS.update(REGULARS)
MODELS.update({
    "streetLamp": build_street_lamp,
    "bench": build_bench,
    "facadeBay": build_facade_bay,
    "acUnit": build_ac_unit,
    "trimBase": build_trim_base,
    "trimCrown": build_trim_crown,
    # THE CEILING (all MAIN atlas)
    "ceilBeam": build_ceil_beam,
    "ceilLight": build_ceil_light,
    "ceilDuct": build_ceil_duct,
    "hangSign": build_hang_sign,
    "vestibule": build_vestibule,
})


# ---- STREET FURNITURE, ROUND TWO ------------------------------------------------
# The HANDOFF §7 next-list, worked down by how much of the frame each one owns.
# Every one of these replaces a handful of axis-aligned quads doing an
# impression of an object: the hydrant was six flat faces with a folded card for
# a bonnet, the shopfronts' awnings were one quad each, and the exit from the
# entire arcade was a pole with a sign on it.
#
# Same conventions as everything above: origin on the ground, centred, front
# faces -Y in Blender (= +Z in the hall), materials name atlas regions — and
# only regions that exist on the STREET sheet, because a model naming one it
# cannot reach makes Builder.model() bail silently for the whole prop.

def build_hydrant():
    """A fire hydrant with a bonnet, two side nozzles and a pumper outlet.

    Revolved, not boxed. A hydrant is one of the most recognisable silhouettes
    on any street, and the eye reads a missing shoulder immediately even when it
    cannot say what is wrong.
    """
    P = Part("hydrant")
    P.revolve([
        (0.150, 0.000), (0.152, 0.030), (0.128, 0.048), (0.118, 0.070),
        (0.122, 0.300), (0.128, 0.372), (0.121, 0.400), (0.106, 0.418),
        (0.104, 0.452), (0.118, 0.468), (0.116, 0.494),
    ], "hydRed", slices=20)
    P.revolve([
        (0.116, 0.494), (0.132, 0.508), (0.128, 0.540), (0.104, 0.566),
        (0.062, 0.588), (0.030, 0.596),
    ], "hydCap", slices=20)
    P.box((0, 0, 0.616), (0.052, 0.052, 0.046), "hydCap")
    for sx in (-1, 1):
        P.cyl((sx * 0.118, 0, 0.330), "x", 0.052, 0.052, 0.075, "hydCap", slices=14)
        P.cyl((sx * 0.162, 0, 0.330), "x", 0.058, 0.050, 0.028, "hydCap", slices=14)
    P.cyl((0, -0.118, 0.262), "y", 0.062, 0.062, 0.080, "hydCap", slices=14)
    P.cyl((0, -0.166, 0.262), "y", 0.068, 0.058, 0.030, "hydCap", slices=14)
    # bolt ring around the base flange: small, but it is what says "cast iron"
    for i in range(8):
        a = i * math.pi / 4
        P.box((math.cos(a) * 0.132, math.sin(a) * 0.132, 0.026),
              (0.024, 0.024, 0.020), "hydCap")
    return P.finish(bevel=0.004, segments=1, smooth_deg=40)


def build_awning():
    """A shopfront awning: sloped canvas on a tube frame, scalloped valance.

    The stripes are GEOMETRY — alternating material on adjacent panels — not a
    texture. So the stripe stays crisp at any distance, needs no atlas region of
    its own, and the scallops along the bottom edge are real half-round tabs
    that catch the streetlamp instead of a painted zigzag that cannot.
    """
    P = Part("awning")
    W, DEP = 2.42, 0.86
    RISE, DROP = 0.62, 0.30
    N = 10
    hw = W / 2
    for i in range(N):
        x0 = -hw + W * i / N
        x1 = -hw + W * (i + 1) / N
        mat = "canvasA" if i % 2 == 0 else "canvasB"
        P.face([(x0, 0.0, RISE), (x1, 0.0, RISE),
                (x1, -DEP, RISE - DROP), (x0, -DEP, RISE - DROP)], mat)
        P.face([(x0, 0.0, RISE - 0.030), (x0, -DEP, RISE - DROP - 0.030),
                (x1, -DEP, RISE - DROP - 0.030), (x1, 0.0, RISE - 0.030)], mat)
        P.face([(x0, -DEP, RISE - DROP), (x1, -DEP, RISE - DROP),
                (x1, -DEP, RISE - DROP - 0.150), (x0, -DEP, RISE - DROP - 0.150)], mat)
        P.face([(x0, -DEP - 0.014, RISE - DROP), (x0, -DEP - 0.014, RISE - DROP - 0.150),
                (x1, -DEP - 0.014, RISE - DROP - 0.150), (x1, -DEP - 0.014, RISE - DROP)], mat)
        P.cyl(((x0 + x1) / 2, -DEP - 0.007, RISE - DROP - 0.150), "y",
              (x1 - x0) / 2, (x1 - x0) / 2, 0.014, mat, slices=10)
    P.cyl((0, -DEP, RISE - DROP), "x", 0.026, 0.026, W + 0.04, "awnFrame", slices=10)
    P.cyl((0, 0, RISE + 0.012), "x", 0.022, 0.022, W + 0.04, "awnFrame", slices=10)
    for sx in (-1, 1):
        P.limb((sx * (hw - 0.05), 0.0, RISE), (sx * (hw - 0.05), -DEP, RISE - DROP),
               0.020, 0.018, "awnFrame", slices=8)
        P.limb((sx * (hw - 0.05), -DEP, RISE - DROP), (sx * (hw - 0.05), -0.02, RISE - 0.34),
               0.016, 0.014, "awnFrame", slices=8)
    return P.finish(bevel=0.004, segments=1, smooth_deg=34)


def build_jukebox():
    """The hall's jukebox, which has been a BOX with two neon strips on it.

    Everything around it is Blender now — ten cabinets, a coffered ceiling, a
    vestibule, the regulars — and this is a named interactable with its own
    three-track music engine, a saved preference and a hotspot the player walks
    across the room to reach. It was six quads.

    The silhouette is the whole job. A jukebox is recognisable from across a
    room and NONE of what makes it recognisable is its box: it is the ARCH, the
    two pilasters standing proud of the body with their bubble tubes, the
    domed selection window, and the grille skirt. So the profile is lofted —
    the crown is a real half-round with a rolled edge, not a chamfer.

    Origin on the floor, centred, front facing -Y (= +Z in the hall) like every
    other model here. The call site keeps the neon strips, the beat-synced
    glows and the hotspot exactly as they were; only the shell moved.
    """
    P = Part("jukebox")
    W, D, H = 0.86, 0.62, 1.58
    hw, hd = W / 2, D / 2

    # ---- the body, with a waisted profile so it is not a fridge
    rings = []
    for (z, wsc, dsc) in ((0.000, 0.94, 0.92), (0.140, 1.00, 1.00), (0.760, 1.00, 1.00),
                          (1.020, 0.97, 0.95), (1.180, 0.95, 0.93)):
        rings.append([(-hw * wsc, -hd * dsc, z), (hw * wsc, -hd * dsc, z),
                      (hw * wsc, hd * dsc, z), (-hw * wsc, hd * dsc, z)])
    P.loft(rings, "jukeBody", cap_a=True, cap_b=False)

    # ---- THE ARCH. Half-round crown swept across the front, with a rolled lip.
    # This is the shape people actually recognise; a chamfered box is a box.
    # A SWEPT SURFACE IS NOT A CROWN. The first version ran a ribbon over the
    # top and left the tympanum open, so the arch read as a bent strip with the
    # wall showing through underneath it. It needs the sweep AND both flat
    # faces that close it, or it is not a solid.
    N = 13
    prev = None
    for i in range(N + 1):
        t = i / N
        a = math.pi * t
        x = -hw * 0.95 * math.cos(a)
        z = 1.180 + 0.300 * math.sin(a)
        ring = [(x, -hd * 0.93, z), (x, hd * 0.93, z)]
        if prev is not None:
            P.face([prev[0], ring[0], ring[1], prev[1]], "jukeCrown")
            # front and back tympanum, wound opposite ways so both face out
            P.face([(prev[0][0], -hd * 0.93, 1.180), (x, -hd * 0.93, 1.180),
                    ring[0], prev[0]], "jukeCrown")
            P.face([prev[1], ring[1], (x, hd * 0.93, 1.180),
                    (prev[0][0], hd * 0.93, 1.180)], "jukeCrown")
        prev = ring
    # the lip that runs round the outside of the arch, standing proud
    for i in range(N + 1):
        t = i / N
        a = math.pi * t
        x = -(hw * 0.95 + 0.045) * math.cos(a)
        z = 1.180 + (0.300 + 0.045) * math.sin(a)
        if i:
            P.limb((px0, -hd * 0.96, pz0), (x, -hd * 0.96, z), 0.032, 0.032, "jukeChrome", slices=6)
            P.limb((px0, hd * 0.96, pz0), (x, hd * 0.96, z), 0.032, 0.032, "jukeChrome", slices=6)
        px0, pz0 = x, z

    # ---- THE PILASTERS. Two chrome columns standing PROUD of the body, which
    # is what gives a jukebox its depth from an angle. The bubble tube runs up
    # the inside of each; the call site's violet neon lands on top of them.
    for sx in (-1, 1):
        P.cyl((sx * (hw - 0.045), -hd - 0.035, 0.760), "z", 0.062, 0.062, 1.180, "jukeChrome", slices=12)
        P.cyl((sx * (hw - 0.045), -hd - 0.035, 1.380), "z", 0.050, 0.062, 0.120, "jukeChrome", slices=12)
        P.cyl((sx * (hw - 0.045), -hd - 0.062, 0.780), "z", 0.026, 0.026, 1.120, "jukeTube", slices=8)
        P.box((sx * (hw - 0.045), -hd - 0.035, 0.150), (0.150, 0.070, 0.170), "jukeChrome")

    # ---- the face: a recessed selection window with a domed reveal
    # THE SELECTION WINDOW. No glass pane in front of the cards: nothing in
    # this pass is transparent, so a "glass" box is an OPAQUE box, and putting
    # one over the title cards turned the whole face into a white slab with
    # nothing on it. The lit backing IS the window, and the cards stand proud
    # of it — which is also how you would build the real thing.
    P.box((0.0, -hd + 0.004, 1.190), (W - 0.250, 0.030, 0.400), "jukeLit")
    for r in range(4):
        for c2 in range(2):
            P.box((-0.14 + c2 * 0.28, -hd - 0.012, 1.032 + r * 0.088),
                  (0.230, 0.016, 0.052), "jukeCard")
    P.box((0.0, -hd - 0.030, 1.408), (W - 0.190, 0.055, 0.045), "jukeChrome")
    P.box((0.0, -hd - 0.030, 0.972), (W - 0.190, 0.055, 0.045), "jukeChrome")
    # the title strip + button bank
    P.box((0.0, -hd - 0.022, 0.880), (W - 0.250, 0.045, 0.110), "jukeStrip")
    for i in range(7):
        P.cyl((-0.24 + i * 0.08, -hd - 0.050, 0.880), "y", 0.016, 0.016, 0.030, "jukeBtn", slices=8)
    # ---- the grille skirt: real slats, so it reads as a speaker and not a panel
    for i in range(5):
        P.box((-0.24 + i * 0.12, -hd - 0.014, 0.480), (0.075, 0.028, 0.480), "jukeGrille")
    P.box((0.0, -hd - 0.004, 0.480), (W - 0.180, 0.020, 0.520), "jukeDark")
    # kick plate
    P.box((0.0, -hd - 0.018, 0.075), (W - 0.120, 0.040, 0.110), "jukeChrome")
    return P.finish(bevel=0.006, segments=1, smooth_deg=40)


def build_vending():
    """The SAUCE-O-MATIC, which has been a box wearing a very good painting.

    THE CONSTRAINT THAT SHAPES THIS ONE (§5b, the composition contract): the
    `vending` region carries BAKED TEXT — header, side labels, bin labels — laid
    out by its painter at fixed places in a 256x384 rect. Re-mapping that region
    across a modelled front in sub-rects would scramble every one of them.

    So the front face wears the WHOLE region exactly as the flat box did, and
    all the geometry goes AROUND it: a frame standing proud of the glass, a
    delivery bin that is genuinely recessed, a coin mech column, a kick plate
    and a rolled top. The painting is untouched and the machine stops being a
    rectangle — which was the actual complaint.

    Origin on the floor, centred, front faces -Y (= the hall's +Z).
    """
    P = Part("vending")
    W, D, H = 1.00, 0.66, 1.90
    hw, hd = W / 2, D / 2

    # carcass: sides, back and top, in machine-grey. The front is left OPEN for
    # the face panel below so nothing double-draws through it.
    for sx in (-1, 1):
        P.box((sx * (hw - 0.030), 0.0, H / 2), (0.060, D, H), "vendBody")
    P.box((0.0, hd - 0.030, H / 2), (W, 0.060, H), "vendBody")
    P.box((0.0, 0.0, H - 0.035), (W, D, 0.070), "vendBody")
    P.box((0.0, 0.0, 0.045), (W, D, 0.090), "vendPlinth")
    # a rolled top edge, because a square top reads as a crate
    P.cyl((0.0, -hd + 0.045, H - 0.010), "x", 0.055, 0.055, W - 0.020, "vendTrim", slices=10)

    # THE FACE. Full region, set back behind its own frame — and built as a
    # thin BOX, not a single quad. §7 trap 2: an open shell has no inside, so
    # _orient() has to guess which way it faces from its position relative to
    # the part centre, and a lone panel deep inside a carcass guesses wrong and
    # is culled. It came back as a hole through to the wall. A closed solid
    # orients off signed volume and cannot be wrong — and a vending machine
    # door has thickness anyway.
    P.box((0.0, -hd + 0.075, (0.230 + H - 0.090) / 2),
          (W - 0.150, 0.040, H - 0.320), "vendFace")
    # the frame that makes it a WINDOW rather than a sticker
    for (cx, cz, sx2, sz2) in ((0.0, H - 0.065, W - 0.100, 0.055),
                               (0.0, 0.205, W - 0.100, 0.055),
                               (-hw + 0.060, (H + 0.230) / 2 - 0.02, 0.055, H - 0.330),
                               (hw - 0.060, (H + 0.230) / 2 - 0.02, 0.055, H - 0.330)):
        P.box((cx, -hd + 0.020, cz), (sx2, 0.075, sz2), "vendTrim")

    # ---- the delivery bin, actually recessed, with a flap over it
    P.box((0.0, -hd + 0.120, 0.130), (W - 0.260, 0.190, 0.150), "vendVoid")
    P.box((0.0, -hd + 0.028, 0.196), (W - 0.250, 0.030, 0.120), "vendFlap")
    P.box((0.0, -hd + 0.012, 0.258), (W - 0.230, 0.045, 0.035), "vendTrim")

    # ---- coin mech: a column standing proud on the right, where your hand goes
    P.box((hw - 0.155, -hd - 0.040, 1.180), (0.190, 0.090, 0.560), "vendTrim")
    P.cyl((hw - 0.155, -hd - 0.090, 1.360), "y", 0.052, 0.052, 0.030, "vendCoin", slices=12)
    P.box((hw - 0.155, -hd - 0.088, 1.215), (0.090, 0.026, 0.016), "vendSlot")
    for i in range(3):
        P.box((hw - 0.200 + i * 0.045, -hd - 0.088, 1.075), (0.030, 0.024, 0.030), "vendBtn")
    return P.finish(bevel=0.006, segments=1, smooth_deg=38)


def build_fire_escape():
    """A two-storey fire escape: landings, stringers, rails, and a drop ladder.

    THE GRIME session's brief was that the block across the road is "big flat
    brick with one tone and no wear", and half of that is a TEXTURE problem
    (see t_brick / t_brick2) but the other half is that the wall has nothing on
    it. Forty-two metres of terrace carried fourteen identical bays, four air
    conditioners and a neon sign. A fire escape is the single biggest thing you
    can bolt to a wall like that: it breaks the silhouette at every storey, it
    throws a real shadow across the brick behind it (the street shadow map is
    baked off the static buffers, and this is static), and it says the building
    has an inside.

    Origin at the pavement, on the wall plane, front facing -Y as every model
    here does. Built as ONE part so a bay costs one draw and one lookup.

    The stair runs alternate direction per storey, which is what makes a fire
    escape read as a fire escape rather than as a shelf: the zigzag IS the
    silhouette. Everything is open — no solid treads — so the wall behind stays
    visible through it, which is most of why it reads as ironwork.
    """
    P = Part("fireEscape")
    W = 2.10                 # landing width, a hair under the 3m bay
    D = 1.05                 # how far it stands off the wall
    hw = W / 2
    STOREY = 2.10
    LEVELS = (2.30, 4.40)    # landing heights: over each of the bay's windows

    def landing(z, sx):
        # deck: open grating, drawn as a run of flats with gaps between them
        for i in range(5):
            y = -0.10 - D * (i + 0.5) / 5
            P.box((0, y, z), (W, D / 5 * 0.60, 0.028), "grate")
        # stringers front and back
        P.box((0, -0.10 - D, z - 0.020), (W, 0.055, 0.130), "ironD")
        P.box((0, -0.12, z - 0.020), (W, 0.045, 0.110), "ironD")
        for ex in (-1, 1):
            P.box((ex * hw, -0.10 - D / 2, z - 0.020), (0.050, D, 0.110), "ironD")
        # railing: two rails and the uprights between them
        for rz, rr in ((z + 0.44, 0.019), (z + 0.86, 0.022)):
            P.cyl((0, -0.10 - D, rz), "x", rr, rr, W, "iron", slices=6)
            for ex in (-1, 1):
                P.cyl((ex * hw, -0.10 - D / 2, rz), "y", rr, rr, D, "iron", slices=6)
        for i in range(6):
            ux = -hw + W * i / 5
            P.cyl((ux, -0.10 - D, z + 0.45), "z", 0.011, 0.011, 0.90, "iron", slices=5)
        for ex in (-1, 1):
            P.cyl((ex * hw, -0.10 - D / 2, z + 0.45), "z", 0.014, 0.014, 0.90, "iron", slices=6)
        # the brackets that actually hold it up — a fire escape with no visible
        # fixing floats, and floating is the one thing ironwork must not do
        for ex in (-1, 1):
            P.limb((ex * (hw - 0.10), -0.02, z - 0.02),
                   (ex * (hw - 0.10), -0.10 - D + 0.08, z - 0.02), 0.022, 0.018, "ironD", slices=6)
            P.limb((ex * (hw - 0.10), -0.10 - D + 0.08, z - 0.04),
                   (ex * (hw - 0.10), -0.06, z - 0.62), 0.020, 0.016, "ironD", slices=6)

    def flight(z0, z1, sx):
        """One run of stair, sx = which side it climbs from."""
        n = 7
        for i in range(n):
            t0 = i / n
            x = sx * (hw - 0.28) * (1.0 - t0) + -sx * (hw - 0.28) * t0
            z = z0 + (z1 - z0) * (i + 0.5) / n
            P.box((x, -0.10 - D * 0.55, z), (W / n * 0.92, 0.34, 0.026), "grate")
        # the two stringers the treads sit on
        for ey in (-0.10 - D * 0.30, -0.10 - D * 0.80):
            P.limb((sx * (hw - 0.10), ey, z0 - 0.05), (-sx * (hw - 0.10), ey, z1 - 0.05),
                   0.030, 0.030, "ironD", slices=6)
        # a handrail over the outer stringer
        P.limb((sx * (hw - 0.10), -0.10 - D * 0.80, z0 + 0.86),
               (-sx * (hw - 0.10), -0.10 - D * 0.80, z1 + 0.86), 0.018, 0.018, "iron", slices=6)
        for i in range(4):
            t0 = (i + 0.5) / 4
            x = sx * (hw - 0.10) * (1.0 - t0) + -sx * (hw - 0.10) * t0
            P.cyl((x, -0.10 - D * 0.80, z0 + (z1 - z0) * t0 + 0.43), "z",
                  0.011, 0.011, 0.86, "iron", slices=6)

    for i, z in enumerate(LEVELS):
        landing(z, 1 if i % 2 == 0 else -1)
    flight(LEVELS[0], LEVELS[1], 1)
    # THE DROP LADDER, hanging short of the pavement the way they always do.
    for sx in (-1, 1):
        P.limb((sx * 0.30, -0.10 - D * 0.86, LEVELS[0] - 0.06),
               (sx * 0.30, -0.10 - D * 0.86, 0.95), 0.020, 0.020, "iron", slices=6)
    for i in range(5):
        P.cyl((0, -0.10 - D * 0.86, 1.05 + i * 0.28), "x", 0.014, 0.014, 0.60, "iron", slices=5)
    # NO BEVEL. Every other model here gets one because a hard edge on a large
    # flat surface reads as untextured cardboard — but this is 20mm bar seen
    # from eight metres, and the bevel was tripling the vertex count of the
    # heaviest prop on the street to soften an edge nobody can resolve.
    return P.finish(bevel=0.0, segments=1, smooth_deg=38)


def build_bin():
    """A municipal litter bin: slatted drum, domed lid, chunky rim.

    There has been a coffee cup and a stack of crates on this pavement since
    the street opened and nowhere to put either.
    """
    P = Part("bin")
    P.revolve([
        (0.180, 0.000), (0.196, 0.028), (0.192, 0.060), (0.206, 0.640),
        (0.216, 0.680), (0.212, 0.706),
    ], "binMetal", slices=18)
    for i in range(14):
        a = i * math.pi * 2 / 14
        P.box((math.cos(a) * 0.212, math.sin(a) * 0.212, 0.360),
              (0.026, 0.026, 0.470), "binDark")
    P.revolve([
        (0.226, 0.706), (0.228, 0.734), (0.204, 0.760), (0.140, 0.790),
        (0.060, 0.806), (0.0, 0.810),
    ], "binLid", slices=18)
    P.cyl((0, 0, 0.818), "z", 0.044, 0.030, 0.030, "binLid", slices=12)
    return P.finish(bevel=0.005, segments=1, smooth_deg=40)


def build_bus_shelter():
    """A bus shelter: glazed back and ends, cantilevered roof, perch bench.

    The exit from the entire arcade has been a pole with a sign on it. This
    stands behind the existing pole rather than replacing it — the bus hotspot
    and its stand coordinate are a contract with the hall.
    """
    P = Part("busShelter")
    W, D, Hh = 3.10, 1.28, 2.42
    hw, hd = W / 2, D / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box((sx * (hw - 0.055), sy * (hd - 0.055), Hh / 2),
                  (0.075, 0.075, Hh), "shelterIron")
    # 🚏 THE BACKLIT ADVERT. Every bus shelter on earth has exactly one, and it
    # is the only lit thing at a bus stop. The first pass put lit panels on the
    # ENDS, which is where the route map goes — and the crop then showed the
    # same black slab, because from the stop's own hotspot you are looking at
    # the shelter's BACK. Measure where the camera is before deciding where the
    # light goes.
    for i in (-1, 0, 1):
        mat = "shelterAd" if i == -1 else "shelterGlass"
        d = 0.055 if i == -1 else 0.028
        P.box((i * (W / 3), hd - 0.040, 1.320), (W / 3 - 0.075, d, 1.760), mat)
    for i in (-1, 1):
        P.box((i * (W / 6), hd - 0.030, 1.320), (0.048, 0.052, 1.860), "shelterIron")
    for sx in (-1, 1):
        P.box((sx * (hw - 0.030), 0, 1.320), (0.028, D - 0.140, 1.760), "shelterGlass")
    # roof tilted back so the rain runs off it, with a proud fascia both edges
    P.face([(-hw - 0.10, -hd - 0.22, Hh), (hw + 0.10, -hd - 0.22, Hh),
            (hw + 0.10, hd + 0.10, Hh + 0.085), (-hw - 0.10, hd + 0.10, Hh + 0.085)],
           "shelterRoof")
    P.box((0, -hd - 0.19, Hh - 0.055), (W + 0.20, 0.070, 0.115), "shelterIron")
    P.box((0, hd + 0.07, Hh + 0.030), (W + 0.20, 0.070, 0.115), "shelterIron")
    P.box((0, 0, Hh - 0.030), (W + 0.16, D + 0.28, 0.055), "shelterIron")
    P.box((0, hd - 0.30, 0.560), (W - 0.40, 0.300, 0.055), "shelterWood")
    for sx in (-1, 1):
        P.box((sx * (hw - 0.42), hd - 0.30, 0.280), (0.050, 0.260, 0.560), "shelterIron")
    P.box((0, 0.10, Hh - 0.095), (W - 0.60, 0.130, 0.045), "shelterLight")
    # 🚏 THE LIT PANELS. `10-busstop` has been the worst tile in the game all
    # night at 29.6% near-dead, and the crop says why: the right third of that
    # frame is this shelter's end, and an end made of dark glass on dark iron
    # against a night street is a BLACK SLAB. Every bus shelter ever built has
    # a backlit route map at one end and a backlit advert at the other, for the
    # same reason: it is the only lit thing at a bus stop.
    #
    # These are boxes inside the existing glazing, not replacements for it, so
    # the shelter's silhouette and its collision box are unchanged.
    for sx, mat in ((-1, "shelterMap"), (1, "shelterMap")):
        P.box((sx * (hw - 0.030), 0, 1.340), (0.020, D - 0.300, 1.420), mat)
        P.box((sx * (hw - 0.055), 0, 1.340), (0.030, D - 0.230, 1.520), "shelterIron")
    return P.finish(bevel=0.006, segments=1, smooth_deg=36)


MODELS.update({
    "hydrant": build_hydrant,
    "awning": build_awning,
    "fireEscape": build_fire_escape,
    "jukebox": build_jukebox,
    "vending": build_vending,
    "bin": build_bin,
    "busShelter": build_bus_shelter,
})


# ---- 🏪 THE GROUND FLOOR --------------------------------------------------------
# The block across the road is fourteen bays of facadeBay standing on a brick
# panel 1.46m tall that runs the full 42m without one opening in it. Every
# street view in the game contains it, and it is the last thing on this street
# that still says "backdrop" rather than "place".
#
# HOW TALL, AND WHY IT WAS MEASURED TWICE. facadeBay's own first window sill
# lands at 1.49, so the band under it was 0..1.46 and the first pass built the
# whole storey inside that. Every piece of joinery was there and NONE of it
# read: at 9.7m from the arcade door that band is 90 pixels of a 760-pixel
# frame, and a 1.13m door in it is a hatch. So the terrace is lifted 0.56m and
# the storey is 2.02 — low, but a door in it is 1.5m and reads as a door.
#
# NOT the 2.6m a real ground floor wants, and this is the constraint worth
# writing down: the arcade door sees this wall across ~60 degrees of vertical
# FOV, so every metre of terrace eats roughly 66 pixels of the sky above it,
# and the sky above it is THE SKYLINE — a whole session's work, 156 modelled
# towers. A full-height storey would have swallowed it from the most-used
# vantage in the game. 0.56 was picked by measuring what survived.
#
# Three units, picked per bay by the call site, plus a blade sign that hangs
# over the pavement. They share a fascia/pier frame on purpose: a terrace is
# one building with different tenants in it, not three different buildings.

SHOP_W, SHOP_H = 3.00, 2.02
# y is DEPTH here and negative is toward the road. facadeBay's own front face
# sits at -0.150 and its sills reach -0.295, so the shopfront frame at -0.31
# stands proud of the masonry above it exactly as a real one does.
_SF_FRONT, _SF_GLASS, _SF_BACK = -0.310, -0.120, 0.020


def _shop_frame(P, pier="shopPier", sign="shopSignD"):
    """The parts every unit shares: two piers, a fascia, a cornice, a plinth.

    Kept in one function because the whole point of a terrace is that the
    JOINERY lines up across the tenancies even when nothing else does.
    """
    W, Z1 = SHOP_W, SHOP_H
    hw = W / 2
    d = abs(_SF_FRONT - _SF_BACK)
    cy = (_SF_FRONT + _SF_BACK) / 2
    # piers up both edges, full height, standing proudest of everything
    for sx in (-1, 1):
        P.box((sx * (hw - 0.135), cy, Z1 / 2), (0.270, d, Z1), pier)
    # fascia band with the shop's name on it, and a cornice over the top that
    # catches the streetlamp and throws a line of shadow down the front
    P.box((0, cy + 0.020, Z1 - 0.140), (W - 0.060, d - 0.040, 0.280), "shopFascia")
    P.box((0, _SF_FRONT - 0.045, Z1 - 0.150), (W - 0.520, 0.050, 0.165), sign)
    P.box((0, _SF_FRONT - 0.030, Z1 - 0.010), (W + 0.050, 0.130, 0.075), "shopCorn")
    P.box((0, _SF_FRONT + 0.015, Z1 - 0.290), (W - 0.100, 0.075, 0.045), "shopIron")
    # plinth: the wet granite kerbstone every shopfront in the world sits on
    P.box((0, cy - 0.015, 0.045), (W, d + 0.030, 0.090), "shopPlinth")


def build_shop_shut():
    """A unit with the shutter down: corrugated steel, a housing, a hasp.

    Half a night street is CLOSED, and a closed shop is not an absence — it is
    a big ribbed metal plane that catches a streetlamp in a way nothing else on
    this wall does.
    """
    P = Part("shopShut")
    W, Z1 = SHOP_W, SHOP_H
    _shop_frame(P, pier="shopPier", sign="shopSignD")
    # the shutter housing under the fascia
    P.box((0, _SF_GLASS - 0.010, Z1 - 0.330), (W - 0.400, 0.190, 0.115), "shutBox")
    # THE CORRUGATION. One flat box would be a grey rectangle; a shutter is
    # read entirely by the horizontal banding, and at this distance that has to
    # be real geometry — a normal map on a 24px swatch cannot make ribs.
    z0, z1 = 0.130, Z1 - 0.395
    n = max(6, int(round((z1 - z0) / 0.150)))
    lath = (z1 - z0) / n
    for i in range(n):
        zc = z0 + lath * (i + 0.5)
        # alternate laths step forward a hair: that is the whole corrugation
        y = _SF_GLASS + (0.014 if i % 2 else -0.014)
        P.box((0, y, zc), (W - 0.420, 0.052, lath * 0.86), "shutter")
    # bottom rail, its hasp, and the concrete channel it lands in
    P.box((0, _SF_GLASS, z0 - 0.030), (W - 0.420, 0.080, 0.105), "shutRail")
    P.box((0, _SF_GLASS - 0.045, z0 + 0.020), (0.115, 0.055, 0.085), "shopIron")
    for sx in (-1, 1):
        P.box((sx * (W / 2 - 0.290), _SF_GLASS + 0.020, (z0 + z1) / 2),
              (0.055, 0.070, z1 - z0 + 0.10), "shutBox")
    return P.finish(bevel=0.005, segments=1, smooth_deg=36)


def build_shop_open():
    """A unit that is still trading: stall riser, display glass, a lit back.

    This is the one that does the lighting work. The measured problem with the
    ground band was never that it lacked detail, it was that it was DARK — so
    the unit that earns its place is the one that emits.
    """
    P = Part("shopOpen")
    W, Z1 = SHOP_W, SHOP_H
    _shop_frame(P, pier="shopPier", sign="shopSign")
    wx, ww = -0.290, W - 1.010          # window centre and width
    gz0, gz1 = 0.420, Z1 - 0.330
    gzc = (gz0 + gz1) / 2
    ry = (_SF_GLASS + _SF_BACK) / 2     # reveal spans back plane -> glass line
    rd = abs(_SF_BACK - _SF_GLASS)
    # stall riser: the panelled skirt under the window
    P.box((wx, _SF_GLASS - 0.070, 0.255), (ww, 0.150, 0.330), "shopRiser")
    P.box((wx, _SF_GLASS - 0.100, 0.255), (ww - 0.220, 0.045, 0.215), "shopPier")
    # 🔆 THE LIT PANEL *IS* THE WINDOW. The first pass put a `shopGlass` pane in
    # front of an emissive interior, which is the §15 ledger row verbatim:
    # NOTHING IN THIS RENDERER IS TRANSPARENT, so "glass over a light" is an
    # opaque black box over a light nobody will ever see. The lit plane is the
    # opening; the joinery stands in front of it and the goods stand on it.
    P.box((wx, _SF_BACK - 0.020, gzc), (ww - 0.050, 0.045, gz1 - gz0), "shopLit")
    P.box((wx, _SF_BACK - 0.055, gz1 - 0.090), (ww - 0.190, 0.040, 0.070), "shopLitC")
    # the reveal: jambs and head standing between that plane and the frame, so
    # the opening has real depth and the light has something to fall on
    for sx in (-1, 1):
        P.box((wx + sx * (ww / 2 - 0.045), ry, gzc), (0.090, rd, gz1 - gz0), "shopPier")
    P.box((wx, ry, gz1 - 0.045), (ww, rd, 0.090), "shopPier")
    # goods in the window: dark silhouettes standing IN FRONT of the light, so
    # it reads as a shop and not as a glowing rectangle
    for ox, ow, oh in ((-0.640, 0.300, 0.330), (-0.040, 0.230, 0.450), (0.540, 0.340, 0.260)):
        P.box((wx + ox, _SF_GLASS + 0.045, gz0 + oh / 2), (ow, 0.110, oh), "shopVoid")
    # mullion + transom bar, in front of the light
    P.box((wx, _SF_GLASS - 0.025, gzc), (0.048, 0.060, gz1 - gz0), "shopPier")
    P.box((wx, _SF_GLASS - 0.025, gz1 - 0.190), (ww, 0.060, 0.042), "shopPier")
    # a cill that stands proud and drips
    P.box((wx, _SF_GLASS - 0.115, gz0 - 0.020), (ww + 0.080, 0.140, 0.055), "shopCorn")
    # the door: a REAL recess on the right. Jambs and a head, with the leaf at
    # the back of it — not a solid void box with the leaf buried inside.
    dx, dw = W / 2 - 0.520, 0.680
    dz1 = Z1 - 0.330
    lz = dz1 - 0.195                       # leaf height: the head and fanlight above it
    P.box((dx, _SF_BACK + 0.010, lz / 2 + 0.020), (dw - 0.110, 0.050, lz), "shopDoorL")
    P.box((dx, _SF_BACK + 0.010, lz + 0.095), (dw - 0.110, 0.052, 0.110), "shopFan")
    for sx in (-1, 1):
        P.box((dx + sx * (dw / 2 - 0.035), ry, dz1 / 2), (0.070, rd, dz1), "shopPier")
    P.box((dx, ry, dz1 - 0.035), (dw, rd, 0.070), "shopPier")
    P.box((dx, _SF_GLASS - 0.055, 0.045), (dw + 0.060, 0.200, 0.090), "shopCorn")
    P.box((dx + 0.195, _SF_BACK - 0.030, 0.900), (0.055, 0.055, 0.060), "shopIron")
    return P.finish(bevel=0.005, segments=1, smooth_deg=36)


def build_shop_door():
    """A private entrance: a recessed porch, a panelled door, a bracket lamp.

    Not every ground floor is a shop. Two of these in fourteen bays is what
    stops the terrace reading as a row of identical retail units, and the porch
    is the only place on this wall with real depth in shadow.
    """
    P = Part("shopDoor")
    W, Z1 = SHOP_W, SHOP_H
    _shop_frame(P, pier="shopPierB", sign="shopSignD")
    # brick between the porch and the piers — this unit is mostly WALL, which
    # is the contrast that makes the trading units read as openings
    for sx in (-1, 1):
        P.box((sx * (W / 2 - 0.560), _SF_GLASS + 0.045, (Z1 - 0.300) / 2),
              (0.580, 0.180, Z1 - 0.300), "shopPierB")
    # THE PORCH. A recess is jambs + a head + a leaf at the back of it. Built
    # as one "void" box with the door inside, the box IS the door and every
    # detail is buried in it — which is what the first pass shipped and what
    # the preview render caught before any of it reached the browser.
    pz1 = Z1 - 0.320
    py = (_SF_GLASS + _SF_BACK) / 2
    pd = abs(_SF_BACK - _SF_GLASS)
    lz = pz1 - 0.210                       # leaf height under the fanlight and head
    P.box((0, _SF_BACK + 0.010, lz / 2 + 0.020), (0.720, 0.050, lz), "shopDoorL")
    # four raised panels on the leaf, proportioned to it
    for f, hh in ((0.30, 0.30), (0.70, 0.34)):
        for sx in (-1, 1):
            P.box((sx * 0.165, _SF_BACK - 0.022, 0.020 + lz * f), (0.250, 0.032, lz * hh), "shopPier")
    # fanlight over the leaf, then the reveal that makes it a porch
    P.box((0, _SF_BACK + 0.010, lz + 0.105), (0.720, 0.052, 0.120), "shopFan")
    for sx in (-1, 1):
        P.box((sx * 0.430, py, pz1 / 2), (0.080, pd, pz1), "shopPierB")
    P.box((0, py, pz1 - 0.040), (0.940, pd, 0.080), "shopPierB")
    # letterbox and knob
    P.box((-0.245, _SF_BACK - 0.032, 0.940), (0.060, 0.048, 0.060), "shopIron")
    P.box((0, _SF_BACK - 0.028, 0.760), (0.200, 0.036, 0.045), "shopIron")
    # the step, and a bracket lamp over the head that lights it
    P.box((0, _SF_GLASS - 0.070, 0.045), (1.000, 0.230, 0.090), "shopCorn")
    P.box((0, _SF_FRONT + 0.060, Z1 - 0.235), (0.075, 0.075, 0.055), "bladeArm")
    P.box((0, _SF_FRONT - 0.055, Z1 - 0.250), (0.230, 0.170, 0.090), "shopLamp")
    return P.finish(bevel=0.005, segments=1, smooth_deg=36)


def build_shop_blade():
    """A projecting neon blade on a bracket — the silhouette-breaker.

    Everything else on this wall is FLAT to it. One object hanging out over the
    pavement is worth more to a street's read than any amount of relief, and
    because the street shadow map bakes off the static buffers this one throws
    a real bar of shadow down the brick behind it.

    $BLADE is a sentinel: the call site remaps it per unit so the terrace does
    not grow fourteen identical pink signs.

    ORIGIN AND HEIGHT: this one does NOT sit on the ground — origin is the
    BOTTOM of the blade and the whole sign is 0.57 tall, so the call site
    places it with an explicit `y`. It hangs in the SPANDREL between the two
    facadeBay windows (2.80..3.50), which is both where a real projecting sign
    goes and the only band on that wall with nothing already in it.
    """
    P = Part("shopBlade")
    # (all z below are relative to the blade's own bottom)
    # wall plate, the arm out over the pavement, and a stay under it
    P.box((0, -0.030, 0.430), (0.140, 0.085, 0.300), "bladeArm")
    P.box((0, -0.300, 0.545), (0.050, 0.570, 0.050), "bladeArm")
    P.box((0, -0.175, 0.395), (0.038, 0.300, 0.038), "bladeArm")
    for oy in (-0.145, -0.485):
        P.box((0, oy, 0.530), (0.032, 0.032, 0.075), "bladeArm")
    # the blade itself. A CLOSED box: an open shell here gets its facing
    # guessed by signed volume and half the signs in the street vanish.
    P.box((0, -0.315, 0.255), (0.070, 0.480, 0.505), "bladeFace")
    # The tube. ONE box, wider in x than the blade it sits in, so it stands
    # proud on BOTH faces — you read this sign walking either way down the
    # road, and a tube on one side only is a sign that is off half the time.
    P.box((0, -0.315, 0.255), (0.096, 0.360, 0.375), "bladeGlow")
    return P.finish(bevel=0.005, segments=1, smooth_deg=36)


def build_manhole():
    """A cast-iron manhole cover, seated in its frame and standing 25mm proud.

    THE ROAD IS A FLOOR GAME SURFACE and it was one flat plane with a dashed
    line on it — the biggest single object in every street view and the only
    one with nothing on it. Since THE WET ROAD it also reflects, which makes
    this worth real geometry rather than a decal: a manhole is the one thing on
    a wet road that stays MATT, and a dry patch in a mirror reads instantly.
    """
    P = Part("manhole")
    R = 0.360
    # the frame seated in the asphalt, then the cover sitting in it
    P.revolve([(R + 0.075, 0.000), (R + 0.075, 0.022), (R + 0.010, 0.026)], "ironRim", slices=24)
    P.revolve([
        (R, 0.010), (R, 0.030), (R - 0.030, 0.038), (0.0, 0.040),
    ], "ironCast", slices=24)
    # the raised pattern: two rings of radial ribs, offset, the way a real one
    # is cast so a tyre bites on it in the wet
    for ring, n, w in ((0.255, 16, 0.052), (0.135, 10, 0.048)):
        for i in range(n):
            a = i * math.tau / n + (0.0 if ring > 0.2 else math.pi / n)
            P.box((math.cos(a) * ring, math.sin(a) * ring, 0.046),
                  (w, w, 0.014), "ironRib")
    # the two lifting keyholes
    for sx in (-1, 1):
        P.box((sx * 0.115, 0.0, 0.044), (0.070, 0.032, 0.020), "ironRim")
    return P.finish(bevel=0.004, segments=1, smooth_deg=40)


def build_gully():
    """A kerbside drain: a slotted grating in its frame, flush with the gutter.

    Different object from the STORM DRAIN grate the player dives into (that one
    is a hotspot with its own art on the street sheet). These are the ordinary
    ones, six of them down the gutter line, and they are what makes a kerb read
    as drainage rather than as an extruded rectangle.
    """
    P = Part("gully")
    W, D = 0.520, 0.330
    P.box((0, 0, 0.016), (W + 0.080, D + 0.070, 0.032), "ironRim")
    P.box((0, 0, 0.030), (W, D, 0.028), "ironCast")
    for i in range(5):
        y = -D / 2 + D * (i + 0.5) / 5
        P.box((0, y, 0.042), (W - 0.070, D / 11, 0.016), "ironRib")
    return P.finish(bevel=0.003, segments=1, smooth_deg=40)


# ---- 🎱 THE FLOOR PLAN ------------------------------------------------------
# The hall is 15m x 20m with ten cabinets pushed against its walls and NOTHING
# in between. Twelve metres by eighteen of empty carpet is not a room you have
# been in; it is a lobby waiting for a room. Every act so far has been the
# street, and the hall is where the games are.
#
# Constraint that shapes all of this: the main atlas is FULL (10 cabinets), so
# none of these can have artwork of their own. They are built from regions that
# already exist — cabFront, metal, wainscot, dark, change, nugGold and the main
# swatch set — exactly the way the jukebox and the SAUCE-O-MATIC were.
# sw_iron / sw_curb / sw_woodDark are STREET swatches; naming one here makes
# Builder.model() bail for the whole prop, silently. That trap has now cost
# three separate props.


def build_air_hockey():
    """An air hockey table: rink, rails, goal mouths, a score head on a post.

    The centrepiece, and it was chosen for its LIGHT before its shape. A big
    pale lit plane at waist height is the one thing this room has never had:
    every other emissive in the hall is at eye level or above (marquees, CRTs,
    the neon trim, the ceiling tubes), so the floor is lit only by what spills
    down onto it. This lights the room from the middle, low down, which is
    where an arcade actually glows from.
    """
    P = Part("airHockey")
    L, W, Hh = 2.34, 1.32, 0.79     # a real table is 2.13 x 1.07; this reads bigger
    hl, hw = L / 2, W / 2
    P.box((0, 0, Hh / 2 + 0.055), (L, W, Hh - 0.110), "furnBody", taper=1.04)
    P.box((0, 0, 0.055), (L - 0.180, W - 0.180, 0.110), "furnDark")
    # the playing surface, inset inside the rails
    P.box((0, 0, Hh + 0.004), (L - 0.150, W - 0.150, 0.030), "rink")
    # centre line + three face-off circles, as flat inlays proud of the rink
    P.box((0, 0, Hh + 0.021), (0.030, W - 0.170, 0.006), "rinkLine")
    for sx in (-1, 0, 1):
        P.cyl((sx * (hl - 0.520), 0, Hh + 0.021), "z", 0.185, 0.185, 0.006, "rinkLine", slices=20)
        P.cyl((sx * (hl - 0.520), 0, Hh + 0.025), "z", 0.150, 0.150, 0.006, "rink", slices=20)
    # rails all round, standing proud of the surface
    for sy in (-1, 1):
        P.box((0, sy * (hw - 0.045), Hh + 0.055), (L, 0.090, 0.110), "furnRail")
    for sx in (-1, 1):
        for oy in (-1, 1):
            P.box((sx * (hl - 0.045), oy * (hw - 0.330), Hh + 0.055),
                  (0.090, W - 0.660, 0.110), "furnRail")
        # the goal mouth between them: a dark void, which is the shape that
        # says "air hockey" from the other side of a room
        P.box((sx * (hl - 0.060), 0, Hh + 0.040), (0.075, 0.560, 0.085), "rinkGoal")
    # a puck and two mallets, left where the last players left them
    P.cyl((0.62, 0.24, Hh + 0.032), "z", 0.042, 0.042, 0.020, "furnDark", slices=14)
    for sx, oy in ((-1, -0.30), (1, 0.26)):
        P.cyl((sx * 0.78, oy, Hh + 0.035), "z", 0.075, 0.075, 0.026, "clawPlush", slices=16)
        P.cyl((sx * 0.78, oy, Hh + 0.072), "z", 0.030, 0.026, 0.048, "clawPlush", slices=12)
    # Score head on a post. At the END and not the middle of the long rail:
    # the first build centred it and the post stood straight through the one
    # thing on this table worth looking at.
    px = hl - 0.130
    P.box((px, -hw - 0.010, Hh + 0.560), (0.070, 0.070, 1.010), "furnChrome")
    P.box((px, -hw - 0.055, Hh + 1.010), (0.620, 0.150, 0.330), "furnBody")
    P.box((px, -hw - 0.135, Hh + 1.010), (0.520, 0.030, 0.230), "scoreFace")
    for sx in (-1, 1):
        P.box((px + sx * 0.125, -hw - 0.152, Hh + 1.010), (0.150, 0.020, 0.160), "scoreLit")
    return P.finish(bevel=0.008, segments=1, smooth_deg=38)


def build_claw():
    """A crane cabinet: lit prize box, gantry, claw, chute, control panel.

    A tall lit box is the cheapest silhouette there is, and this room has
    exactly one shape in it repeated ten times. Two of these break the skyline
    of the floor.

    The prize box is built the same way the shopfronts were and for the same
    reason: nothing in this renderer is transparent, so the "glass" is an
    opaque dark box and the LIT BACK PANEL is what you actually see, with the
    prizes standing in front of it as silhouettes.
    """
    P = Part("claw")
    W, D, Hh = 0.96, 0.94, 2.06
    hw, hd = W / 2, D / 2
    P.box((0, 0, 0.470), (W, D, 0.940), "furnBody")
    P.box((0, 0, 0.040), (W - 0.140, D - 0.140, 0.080), "furnDark")
    P.box((-0.230, -hd + 0.055, 0.300), (0.360, 0.110, 0.330), "furnDark")
    P.box((-0.230, -hd + 0.020, 0.470), (0.400, 0.055, 0.045), "furnRail")
    # Control panel: a shelf standing PROUD of the front, at the top of the
    # base. The first build sank it at z 0.985, which is exactly where the
    # prize box starts, and it vanished behind the box's own bottom rail.
    P.box((0.180, -hd - 0.075, 0.905), (0.480, 0.230, 0.070), "furnRail")
    P.cyl((0.100, -hd - 0.080, 0.965), "z", 0.026, 0.020, 0.115, "furnChrome", slices=10)
    P.ovoid((0.100, -hd - 0.080, 1.032), (0.045, 0.045, 0.042), "clawPlushB", stacks=6, slices=12)
    P.cyl((0.300, -hd - 0.080, 0.952), "z", 0.048, 0.048, 0.030, "clawHead", slices=12)
    # THE PRIZE BOX, and the front of it is OPEN.
    #
    # First build put a dark `clawGlass` pane across the front with the lit
    # panel at the BACK — which is a crane machine seen from behind a sheet of
    # black card, because nothing in this renderer is transparent. That is the
    # third time this session (shop window, jukebox before it, now this). The
    # rule: if you want to see INTO something, do not build the thing you would
    # be seeing through. Corner posts and a lit interior read as glass on their
    # own; the eye supplies the pane.
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box((sx * (hw - 0.038), sy * (hd - 0.038), 1.520), (0.070, 0.070, 1.020), "furnRail")
    # The interior is lit on THREE sides, not just the back. First build put
    # dark `clawGlass` panels down both flanks, and from any three-quarter view
    # — which is every view of a machine standing in a room — the flank is most
    # of what you see, so the cabinet came back as a black hole with a pink hat
    # on. A crane is glazed all round; the light has to be too.
    P.box((0, hd - 0.030, 1.520), (W - 0.130, 0.045, 1.000), "clawLit")
    for sx in (-1, 1):
        P.box((sx * (hw - 0.048), 0, 1.520), (0.040, D - 0.150, 0.980), "clawLitS")
    P.box((0, 0, 1.035), (W - 0.130, D - 0.130, 0.045), "furnRail")   # the box floor
    P.box((0, -hd + 0.026, 1.075), (W - 0.130, 0.038, 0.115), "furnRail")  # front kick rail
    # the heap of prizes, standing in front of the lit back
    for px, py, pz, r, mat in (
        (-0.235, -0.075, 1.135, 0.118, "clawNug"), (0.010, -0.145, 1.125, 0.102, "clawPlush"),
        (0.245, -0.055, 1.140, 0.122, "clawPlushB"), (-0.115, 0.095, 1.145, 0.104, "clawPlush"),
        (0.180, 0.135, 1.150, 0.108, "clawNug"), (-0.270, 0.170, 1.145, 0.098, "clawPlushB"),
        (0.055, 0.055, 1.330, 0.096, "clawNug"), (-0.170, -0.020, 1.335, 0.088, "clawPlush"),
    ):
        P.ovoid((px, py, pz), (r, r * 0.86, r * 0.94), mat, stacks=7, slices=12)
    # gantry rail across the top, the trolley, and the claw hanging off it
    P.box((0, 0.060, 2.000), (W - 0.180, 0.055, 0.045), "furnChrome")
    P.box((-0.090, 0.060, 1.950), (0.180, 0.130, 0.090), "furnRail")
    P.cyl((-0.090, 0.060, 1.845), "z", 0.008, 0.008, 0.130, "furnChrome", slices=8)
    for i in range(3):
        a = i * math.tau / 3
        P.box((-0.090 + math.cos(a) * 0.052, 0.060 + math.sin(a) * 0.052, 1.760),
              (0.030, 0.030, 0.130), "furnChrome")
    # marquee header
    P.box((0, 0, 2.030), (W + 0.070, D + 0.070, 0.060), "furnBody")
    P.box((0, -hd - 0.010, 2.170), (W, 0.075, 0.230), "clawHead")
    P.box((0, 0, 2.300), (W + 0.050, D + 0.050, 0.050), "furnRail")
    return P.finish(bevel=0.006, segments=1, smooth_deg=36)


def build_change_machine():
    """The change machine, and it is the last procedural box in the hall.

    A 0.6 x 0.48 x 1.5 slab with a painting on it since the room opened,
    standing next to the door where everybody walks past it. `change` is a real
    atlas region, so the FACE stays exactly as painted and the geometry goes
    around it — the same contract §5b sets for the SAUCE-O-MATIC's vendFace.
    """
    P = Part("changeMachine")
    W, D, Hh = 0.62, 0.44, 1.56
    hw, hd = W / 2, D / 2
    P.box((0, 0, 0.055), (W - 0.070, D - 0.070, 0.110), "furnDark")
    P.box((0, 0, 0.780), (W, D, 1.340), "furnBody")
    P.box((0, 0, 1.500), (W + 0.045, D + 0.045, 0.120), "furnRail")
    # the painted face, inset behind a proud bezel
    P.box((0, -hd - 0.008, 0.900), (W - 0.120, 0.030, 0.980), "chgFace")
    for sx in (-1, 1):
        P.box((sx * (hw - 0.032), -hd - 0.020, 0.900), (0.060, 0.055, 1.020), "furnRail")
    P.box((0, -hd - 0.020, 1.415), (W, 0.055, 0.060), "furnRail")
    # a lit CHANGE strip in the crown, the bill slot, and the coin cup
    P.box((0, -hd - 0.030, 1.500), (W - 0.130, 0.040, 0.070), "chgLit")
    P.box((0, -hd - 0.026, 0.640), (0.230, 0.030, 0.028), "furnDark")
    P.box((0, -hd - 0.024, 0.660), (0.260, 0.026, 0.014), "furnChrome")
    P.box((0, -hd + 0.060, 0.330), (0.300, 0.150, 0.190), "furnDark")
    P.box((0, -hd - 0.012, 0.435), (0.340, 0.055, 0.040), "furnRail")
    return P.finish(bevel=0.006, segments=1, smooth_deg=36)


def build_stool():
    """A fixed stool: padded disc, chrome column, weighted base, foot ring.

    Nobody plays a two-hour session standing up, and a cabinet with no seat in
    front of it reads as a display piece rather than a machine somebody uses.
    """
    P = Part("stool")
    P.cyl((0, 0, 0.020), "z", 0.230, 0.215, 0.040, "furnRail", slices=18)
    P.cyl((0, 0, 0.330), "z", 0.042, 0.038, 0.580, "furnChrome", slices=14)
    P.revolve([(0.190, 0.230), (0.196, 0.244), (0.190, 0.258)], "furnChrome", slices=18)
    P.cyl((0, 0, 0.640), "z", 0.250, 0.262, 0.075, "furnPad", slices=20)
    P.revolve([(0.262, 0.678), (0.255, 0.692), (0.180, 0.700), (0.0, 0.702)], "furnPad", slices=20)
    return P.finish(bevel=0.005, segments=1, smooth_deg=40)


MODELS.update({
    "airHockey": build_air_hockey,
    "claw": build_claw,
    "changeMachine": build_change_machine,
    "stool": build_stool,
})


MODELS.update({
    "shopShut": build_shop_shut,
    "shopOpen": build_shop_open,
    "shopDoor": build_shop_door,
    "shopBlade": build_shop_blade,
    "manhole": build_manhole,
    "gully": build_gully,
})


def build_all(only=None):
    """Every model at the ORIGIN. Do not lay them out in a row.

    extract() bakes `matrix_world` into the vertices, so an object nudged
    aside "just for the contact sheet" ships that nudge to the hall. It cost a
    whole debugging pass: the cabinets were exported 2.2m sideways and 3m back
    and drew *inside the west wall*, which looks exactly like geometry that
    failed to build. preview() frames one object at a time and contact sheets
    are composited from separate renders — nothing needs them spread out.
    """
    wipe()
    return [fn() for name, fn in MODELS.items() if not only or name in only]


# ---- preview ------------------------------------------------------------------------
# Not a production render — a look-at-it rig. The hall's own lighting decides how
# these actually read; this just answers "is the SHAPE right".

def preview(target=None, out=None, res=760, azim=38, elev=22, dist=None):
    sc = _scene()
    obs = [o for o in sc.collection.all_objects if o.type == "MESH" and not o.name.startswith("_")]
    if target:
        obs = [o for o in obs if o.name == target]
    if not obs:
        raise RuntimeError("nothing to preview")
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in obs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
    ctr = (lo + hi) / 2
    rad = max((hi - lo).length / 2, 0.2)
    dist = dist or rad * 3.2

    try:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        sc.render.engine = "BLENDER_EEVEE"
    try:
        sc.eevee.use_raytracing = True
    except Exception:
        pass
    sc.render.resolution_x = res
    sc.render.resolution_y = int(res * 0.72)
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.file_format = "PNG"

    w = bpy.data.worlds.get("MeshNight") or bpy.data.worlds.new("MeshNight")
    w.use_nodes = True
    w.node_tree.nodes.get("Background").inputs[0].default_value = (0.035, 0.04, 0.06, 1.0)
    sc.world = w

    def lamp(name, kind):
        o = sc.collection.all_objects.get(name)
        if not o:
            o = bpy.data.objects.new(name, bpy.data.lights.new(name, kind))
            sc.collection.objects.link(o)
        return o

    k = lamp("_key", "AREA")
    k.data.energy = 260 * rad * rad
    k.data.size = rad * 2.5
    k.data.color = (1.0, 0.93, 0.84)
    k.location = ctr + Vector((-dist * 0.55, -dist * 0.62, dist * 0.85))
    k.rotation_euler = (math.radians(52), 0, math.radians(-42))
    f = lamp("_fill", "AREA")
    f.data.energy = 70 * rad * rad
    f.data.size = rad * 4
    f.data.color = (0.45, 0.6, 1.0)
    f.location = ctr + Vector((dist * 0.8, dist * 0.35, dist * 0.4))
    f.rotation_euler = (math.radians(74), 0, math.radians(115))
    r = lamp("_rim", "AREA")
    r.data.energy = 120 * rad * rad
    r.data.size = rad * 2
    r.data.color = (1.0, 0.35, 0.75)
    r.location = ctr + Vector((dist * 0.3, dist * 0.9, dist * 0.5))
    r.rotation_euler = (math.radians(66), 0, math.radians(160))

    # a ground plane so the silhouette has something to sit on
    gp = sc.collection.all_objects.get("_ground")
    if not gp:
        me = bpy.data.meshes.new("_ground")
        bm = bmesh.new()
        s = rad * 14
        vs = [bm.verts.new((-s, -s, 0)), bm.verts.new((s, -s, 0)),
              bm.verts.new((s, s, 0)), bm.verts.new((-s, s, 0))]
        bm.faces.new(vs)
        bm.to_mesh(me)
        bm.free()
        gp = bpy.data.objects.new("_ground", me)
        mg = bpy.data.materials.get("_gnd") or bpy.data.materials.new("_gnd")
        mg.use_nodes = True
        b = mg.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = (0.05, 0.05, 0.06, 1)
        b.inputs["Roughness"].default_value = 0.35
        gp.data.materials.append(mg)
        sc.collection.objects.link(gp)

    cam = sc.collection.all_objects.get("_cam")
    if not cam:
        cam = bpy.data.objects.new("_cam", bpy.data.cameras.new("_cam"))
        sc.collection.objects.link(cam)
    a, e = math.radians(azim), math.radians(elev)
    cam.location = ctr + Vector((math.sin(a) * math.cos(e) * dist,
                                 -math.cos(a) * math.cos(e) * dist,
                                 math.sin(e) * dist))
    d = (ctr - cam.location).normalized()
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 60
    sc.camera = cam

    hide = [o for o in sc.collection.all_objects
            if o.type == "MESH" and not o.name.startswith("_") and o not in obs]
    for o in hide:
        o.hide_render = True
    out = out or os.path.join(OUT_DEFAULT, "_preview.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    for o in hide:
        o.hide_render = False
    return out


def build_library(repo=None, path=None):
    """Save every model into blender/hall_meshes.blend, one collection each.

    The factory above is the source of truth — this file exists so the shapes
    can be OPENED, poked at, and re-rendered without running any of it, and so
    there is something to hand an artist. Keep it in sync with whatever you
    render (same rule as nugrig.build_library).
    """
    path = path or os.path.join(repo or os.path.join(REPO, "blender"), "hall_meshes.blend")
    obs = build_all()
    sc = _scene()
    for ob in obs:
        col = bpy.data.collections.get(ob.name) or bpy.data.collections.new(ob.name)
        if col.name not in sc.collection.children:
            sc.collection.children.link(col)
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        col.objects.link(ob)
    bpy.ops.wm.save_as_mainfile(filepath=path, copy=True)
    return path


def export_gltf(out_dir=None):
    """One .glb per model — the Unreal on-ramp. 1 unit = 1 hall metre here
    (NOT nugrig's 1-unit-per-game-pixel), so these import at real scale."""
    out_dir = out_dir or os.path.join(OUT_DEFAULT, "glb")
    os.makedirs(out_dir, exist_ok=True)
    sc = _scene()
    written = []
    for ob in list(sc.collection.all_objects):
        if ob.type != "MESH" or ob.name.startswith("_"):
            continue
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        fp = os.path.join(out_dir, ob.name + ".glb")
        bpy.ops.export_scene.gltf(filepath=fp, use_selection=True, export_format="GLB")
        written.append(fp)
    return written


def export_all(out_dir=None, names=None):
    out_dir = out_dir or OUT_DEFAULT
    os.makedirs(out_dir, exist_ok=True)
    sc = _scene()
    written = []
    for ob in sc.collection.all_objects:
        if ob.type != "MESH" or ob.name.startswith("_"):
            continue
        if names and ob.name not in names:
            continue
        # Models are placed by the call site in js/arcade.js; a translation on
        # the object here would be baked into every vertex and silently offset
        # the thing in the hall. Refuse it rather than ship it.
        if max(abs(v) for v in ob.location) > 1e-6:
            print("hallmesh: %s is at %s — zeroing before export" % (ob.name, tuple(ob.location)))
            ob.location = (0, 0, 0)
            bpy.context.view_layer.update()
        d = extract(ob)
        d["name"] = ob.name
        path = os.path.join(out_dir, ob.name + ".json")
        with open(path, "w") as fh:
            json.dump(d, fh)
        written.append((ob.name, len(d["verts"]), len(d["tris"])))
    return written
