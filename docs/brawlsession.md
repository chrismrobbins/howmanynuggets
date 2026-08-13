# 🥊 THE BRAWLERS ART SESSION PROMPT

The prompt to paste into a fresh Claude Code session for a graphics pass on
**BATTERED BRAWLERS** (`js/brawl.js`, mode `brawl`).

**Why this is a separate file from `artsession.md`.** That one is written for the
arcade HALL, and almost none of it transfers. The hall is hand-rolled WebGL with
a material shader, a bloom chain, Blender geometry and a 21-spot measurement kit.
Brawlers is a 2888-line **canvas 2D pixel-art game** with none of those things and
no harness at all. A session that pastes the hall prompt at it will spend its
first hour discovering that and its second hour building the wrong thing.

**Checked in for the same reason `blender/tools/` is:** the last three times this
project needed a repeatable protocol it lived in a chat window.

---

## The prompt

Copy everything between the rules. There is **one blank** — the first bullet.

---

Read `docs/brawlsession.md` §"What you are working on" and `AGENTS.md` before you
plan anything. Do NOT assume the arcade hall's pipeline applies — Brawlers is a
different renderer with different rules, and the differences are the whole job.

**What's wrong right now:** `<ONE OR TWO CONCRETE COMPLAINTS. Something that
looks bad or feels bad when you actually play a round of Brawlers. If you have
nothing specific, write "nothing specific" and move on.>`

The bar is a real video game somebody would pay for. It's 2026 and I have a real
machine — assume one. Payload is not a constraint. **But do not reach for Blender
by reflex here**: read the trap in §"The trap this game sets" first and justify
whichever way you go.

Work in **four rounds**. Each round:

1. **Say out loud which layer of this picture has never been upgraded** —
   parallax, lighting, palette, animation, silhouette, hit feedback, post,
   backgrounds, or content — and why you picked it. Working out what to do next
   is part of the round, not a preamble to it.
2. **Pick several things, not one.** Go wide rather than deep.
3. **Measure before, build, measure after — and you will have to BUILD the
   thing that measures.** There is no harness for this game (see §"There is no
   harness"). Build one, check it in under `blender/tools/`, and make it capture
   frames *during play*, not just on the title screen.
4. **Look at the crops.** If the number and the picture disagree, the picture
   wins — say so in the commit and explain why the metric was the wrong lens.
   If a change turns out to be invisible, bin it and tell me.
5. **A beat-em-up is judged in MOTION.** A still frame of a fighting game tells
   you almost nothing. Capture frame sequences through a punch, a hit, a KO and
   a walk cycle before you claim anything reads better.
6. **Ship the round on its own** — commit and push, then verify the deploy
   landed. One commit per round so I can bisect.
7. Feed the new measurements into the next round's assessment.

Every call site keeps its existing procedural rig as a fallback — the house rule
(`blender/HANDOFF.md` §1.5) does not care which renderer you are in.

Write your findings into `AGENTS.md` and update your memory as you go, not at the
end. Don't ask permission to promote and don't ask me which slice to do — prod is
my review environment. If you find something broken that isn't in scope, fix it
and tell me.

---

## What you are working on

Read this before planning. All of it is checkable in `js/brawl.js`.

| | |
|---|---|
| Files | `js/brawl.js` (2888 lines), `css/brawl.css` (44 lines) |
| Renderer | **Canvas 2D.** `brawl.g = cv.getContext('2d')`, `imageSmoothingEnabled = false` |
| Resolution | The world is **~200px tall**. `brawl.scale = max(2, floor(vh / 200))`, and the canvas is sized in WORLD pixels, then CSS-scaled up by an integer. A character is roughly 20px tall. |
| Drawing | 185 `fillRect` calls plus a `px(g, x, y, w, h, color)` helper. That is the entire vocabulary. |
| Characters | `nugBody(r, seed, base, dark)` generates a lumpy blob **per pixel** into a small cached canvas; limbs, gloves and faces are `fillRect` on top. `drawPlayer()` is the reference rig. |
| Backgrounds | Three acts, one long pre-rendered strip each: `brawlStripRestaurant`, `brawlStripNuggetown`, `brawlStripSauceWorks`. Built once in `brawlLayout()` and cached on `brawl.bg`. |
| The belt | `entY(d) = brawl.ground + 4 + d` — depth is a Y offset. `drawables.sort((a, b) => a.d - b.d)` already sorts by depth. |
| Animation | `step = floor(p.walk) % 4` and a **1px bob**. That is the whole cycle. |
| Effects it has | `brawl.shake`, `brawl.hitstop`, `brawl.crowdHype`, splats that stain the belt. Its own, not `ArcadeKit`'s. |
| Launching it | `startStorm(1e6, 5000)` then `setStormMode('brawl')`. It is in `pausesStorm()`. In the hall it is the west wall at z −16.8. |

### Layers that have never been touched (verified in the source, not guessed)

- **There is NO PARALLAX.** The background is one strip drawn `drawImage(brawl.bg,
  -round(brawl.cam), 0)` — dead 1:1 with the camera. A side-scrolling brawler's
  entire sense of space comes from layers moving at different rates, and this
  game has exactly one layer.
- **Nothing casts a shadow.** The depth sort exists and is used for draw order
  only; no fighter has a contact shadow, so nobody is standing ON the belt.
- **There is no lighting of any kind.** Flat colour fills. The three acts are
  distinguished by palette alone.
- **The walk cycle is four frames and a 1px bob**, and the same bob plays while
  idle. Anticipation, follow-through and recovery do not exist.
- **No screen-space anything.** The hall got bloom, grain, a vignette, a tonemap
  and MSAA this year; this canvas gets a raw `drawImage` and integer scaling.
- **No `brawlDebug`.** Blaster, Storm Drain and The Undercroft all expose a test
  seam; Brawlers does not, which is the first thing a harness will want.

## The trap this game sets

**The hall's answer to every art problem was "do it in Blender." Here that answer
may be wrong, and this repo already has the receipt.**

GTN S2.12 FRESH PAINT re-rendered every sprite in that game in Blender, graded to
the measured palette, and shipped. Beau reviewed it on prod and called it
invisible — the A/B harness said **+4% contrast**. `blender/HANDOFF.md` §1 opens
with that lesson: *palette fidelity ≠ looking good.* The fix was S2.13, which
added structured CONTENT and depth cues — plazas, alleys, curbs, shadows, light
pools — and moved the same measurement 8–15%.

Brawlers is a harder version of the same trap, because a character here is about
**20 pixels tall**. A downscaled 3D render at that size is mush; hand-placed
pixels and a good silhouette will beat it. GTN's sprites survive only because
they are rendered at 8× and packed with premultiplied LANCZOS, and they are seen
top-down at a distance.

So: Blender is on the table for *backgrounds* (a strip is 200px tall and can be
rendered big), and it is a real question for *characters*. Decide it with a test,
not a preference — and if you do go to Blender, `blender/README.md` has the 2D
sprite path (`nugrig.py` → `pack_atlas.py` → a data-URI atlas with every call
site keeping its `fillRect` fallback).

## There is no harness

`blender/tools/` measures **the hall**. `shoot.js` teleports `NuggetArcade._H`
around 21 hall camera spots; `pose.js`, `fallbacks.js`, `motion.js` and
`region.js` all sit on `hallharness.js`, which calls `NuggetArcade.enter()`.
**None of it works on a minigame canvas.** The pieces you can reuse directly are
`png.js` (decode, stats, chroma, staircase, diff) and `crop.py` (sheet, ab, zoom,
strip) — both take PNG bytes and know nothing about the hall.

So round 1 builds `brawlharness.js` alongside them, and **checks it in**. What it
needs, learned from the hall kit's four hard lessons:

- **Deterministic state.** Pin the clock, pin the RNG, and expose a `brawlDebug`
  seam (act / stage / spawn / heat / hearts / freeze) so a run can be put in the
  same place twice. Every other game in this repo has one; copy `croftDebug`.
- **Shoot the CANVAS, not the page.** The banner, the HUD and the storm layer are
  DOM on top of it — the hall kit learned that the hard way and it cost a run
  that measured 25fps that was really 61.
- **Shoot DURING PLAY.** A brawler's title screen is not the game. Capture on a
  fixed frame of a fixed act with a fixed enemy set.
- **Frame SEQUENCES, not single frames.** `pose.js` exists in the hall kit
  because a rig fails at the extremes of its cycle; a punch is the same problem.
  `crop.py strip` will lay the frames out for you in clock order.
- **Measure the SURFACE, not the frame** where it matters — `region.js` takes a
  box and reports its own stats. On a 200px-tall game a character is a tiny
  fraction of the pixels, so frame averages will hide almost everything you do.

## Why each line is in there

| Line | What it prevents |
|---|---|
| "do NOT assume the hall's pipeline applies" | The single most likely way to waste a session: reaching for `hallmesh.py` at a game that has no 3D at all. |
| **The blank** | The highest-value input there is. "Erase the walking" got the head-bob deleted in twenty minutes. |
| "read the trap first / justify whichever way you go" | S2.12 shipped a whole Blender remaster of a 2D game and measured +4%. |
| "you will have to BUILD the thing that measures" | There is genuinely no harness; a session that assumes one will fake its numbers or skip them. |
| "a beat-em-up is judged in MOTION" | Every tool in this repo defaults to one frame at a pinned clock, and a fighting game is the worst possible subject for that. |
| "several things, not one" | Beau has chosen coverage over polish every single time he has been asked. |
| "one commit per round" | Bisectability, and progress arriving instead of one enormous drop. |
| "don't ask permission" | Prod is the review environment; asking costs a round trip. |

## Variants

**Short session:** keep everything, change *four rounds* to *two*, and accept a
smaller harness (deterministic launch + canvas capture + `crop.py strip`).

**You want the backgrounds specifically:** replace the round loop with
`The three act strips are the target. Do them. Measure, look at the crops and at
a scrolling sequence, ship, then tell me what you'd do next and why.`

**You have no complaints:** drop the blank and add `I have no complaints — play a
round, find the weakest thing yourself, and prove it with a measurement before
you touch it.`
