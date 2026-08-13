# 🎨 THE ART SESSION PROMPT

The prompt to paste into a fresh Claude Code session when you want another
round of graphics work on the arcade. Written 2026-08-09 after the six-act
session (`929a8b9`..`e18a593`), reverse-engineered from what actually made that
session productive rather than from what it felt like.

**Checked in for the same reason `blender/tools/` is:** the last two times this
project needed a repeatable protocol, it lived in a chat window and was
reconstructed from prose the next time somebody needed it.

---

## The prompt

Copy everything between the rules. There is **one blank** — the first bullet.

---

Read `blender/HANDOFF.md` — §0 first, then the newest section — and `AGENTS.md`
before you plan anything.

**What's wrong right now:** `<ONE OR TWO CONCRETE COMPLAINTS. Something that
looks bad, feels bad, or that you noticed on prod. If you have nothing
specific, write "nothing specific" and move on.>`

The bar is a real video game somebody would pay for, not a free browser thing.
It's 2026 and I have a real machine — assume one. Payload is not a constraint:
move bytes off the critical path behind the boot screen and then spend them.
Lean on Blender. If something is still hand-coded boxes or a painted quad,
model it.

Work in **five rounds**. Each round:

1. **Say out loud which layer of the picture has never been upgraded** —
   palette, lighting, geometry, motion, post, materials, reflections,
   animation, or content — and why you picked it. Working out what to do next
   is part of the round, not a preamble to it.
2. **Pick several things, not one.** Go wide rather than deep.
3. **Measure before, build, measure after** with `blender/tools/shoot.js`, and
   **look at the crops.** If the number and the picture disagree, the picture
   wins — say so in the commit and explain why the metric was the wrong lens.
   If a change turns out to be invisible, bin it and tell me.
4. **Run `blender/tools/fallbacks.js` and `blender/tools/motion.js`** before you
   ship. A degraded path that renders an identical frame is a seam that never
   fired, and a channel that stops sweeping is a feature that stopped running.
5. **Ship the round on its own** — commit and push, then verify the deploy
   actually landed. One commit per round so I can bisect.
6. Feed the new measurements into the next round's assessment.

Write `blender/HANDOFF.md` and update your memory as you go, not at the end.

Don't ask permission to promote and don't ask me which slice to do — prod is my
review environment. If you find something broken that isn't in scope, fix it
and tell me.

---

## Why each line is in there

| Line | What it prevents |
|---|---|
| "read the handoff, §0 first" | Every art session before this one mis-scoped its first attempt in the same direction. §0 is Beau's own words about what "upgrade" means. |
| **The blank** | The single highest-value thing you can give an agent. "Erase the walking" produced a fix in twenty minutes; without it that head-bob would still be there. A concrete complaint is worth more than a paragraph of direction. |
| "assume a real machine" | Otherwise it optimises for a phone and ships the cheap option. |
| "payload is not a constraint" | Already in `AGENTS.md`, still worth repeating — three sessions burned cycles negotiating byte budgets. |
| "lean on Blender" | It is the most under-used tool in the repo and the reason the room stopped looking hand-coded. |
| "say out loud which layer" | The one sentence that produced the biggest find of the six-act session (*"the hall has no antialiasing at all"*). Naming the untouched layer before planning is the whole method. |
| "several things, not one" | Beau has chosen coverage over polish every single time he has been asked. |
| "look at the crops / the picture wins" | Two changes in one night measured flat or worse while obviously improving the picture. An agent that only reads its table will revert good work. |
| "invisible → bin it" | A whole sprint once re-graded textures that were already fine. |
| "fallbacks + motion before shipping" | These two caught three dead seams and a statue. Summary statistics cannot see either. |
| "one commit per round" | Bisectability, and it means you can see progress arriving instead of one enormous drop. |
| "don't ask permission" | Prod is the review environment; asking costs a round trip. |

## Not for the minigames

This prompt is for the **arcade hall**. The 15 games are different renderers with
different pipelines and, mostly, no harness — `blender/tools/` drives
`NuggetArcade._H` and knows nothing about a minigame canvas. There is a separate
prompt for BATTERED BRAWLERS at `docs/brawlsession.md`; write a new one rather
than bending this if you take on another game.

## Variants

**Short session / one evening:** keep everything, change *five rounds* to
*two rounds*.

**You have a specific target in mind:** replace the round loop with
`Do <the thing>. Measure it, look at the crops, run fallbacks.js and
motion.js, ship it, then tell me what you'd do next and why.`

**You want it to choose entirely on its own:** drop the blank and add
`I have no complaints — find the weakest thing yourself and prove it with a
measurement before you touch it.` Expect a slightly slower start; the agent
will spend its first pass reading and shooting a baseline, which is correct.

## One thing to keep doing

The most useful sentence in the six-act session was the follow-up:

> *"understanding and evaluating what to upgrade next should also be in your
> rounds here."*

That is what turned five separate tasks into five rounds that each started from
the last one's numbers. It is baked into the prompt above, but if a session
starts drifting into "do the list I gave it", that sentence pulls it back.
