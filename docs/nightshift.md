# THE NIGHT SHIFT — protocol & ledger

> Somebody keeps building things while Nuggetown sleeps. This is the shift
> log, and the standing orders that come with the keys.

This file is the operating protocol for the **recurring unattended agent
runs** Beau authorized on 2026-08-05: every other night at 01:13, seven
runs, 2026-08-06 through 2026-08-18. Each run ships 5–10 new features.

**If you are that agent: this file is your brief. Read it fully, then
follow it. It outranks your instincts.** Humans: edit freely — changing
this file changes what the night shift does.

---

## Standing orders

### 1. Load the canon before you write a line

Read in this order, every run, no skipping:

| File | Why |
|---|---|
| `AGENTS.md` | The add-a-game checklist and the hall gotchas. Every rule in it exists because it already bit someone. |
| `CLAUDE.md` | Layout, script load order, the arcade↔backend seam. |
| `docs/casefile.md` | Det. Dill's **canon** case file for the storm-theft storyline. Your features must not contradict it. |
| `GTA_SPRINTS.md` | Grand Theft Nugget build log + the Season 2 plan. |
| **The ledger at the bottom of this file** | What the previous runs in this series already built. Do not duplicate or collide with them. |

Then `git log --oneline -25` and read the subjects.

Then `git pull`. **Always.** Two humans work here with AI assistance,
often on the same day.

### 2. Pick the work yourself

Choose 5–10 features that belong in this world. The bar is *in-universe*:
Nuggetown after dark, Det. Dill, the Hooded Nug's rumor slate, the Catch
Incident, the arcade hall, the street outside the doors. A feature that
would make Beau grin is worth more than a feature that would make a
product manager nod.

Bias toward **depth in what exists** over bolting on something orphaned.
Spread the work — don't spend all seven nights in one file.

Off-limits without a human:
- **S2.10 / online activities** — needs Chris's multiplayer stack. Leave it.
- **Nugget Catch** — it is a police-taped CRIME SCENE in the hall, on
  purpose. Do not "fix" it back to playable.
- **`worker/**`** — pushing it auto-deploys the production API. Touch it
  only if a feature genuinely requires it, and say so loudly in the report.
- Anything that reads like a rewrite, a dependency, or a build step. This
  site is classic `<script>` tags and works from disk. Keep it that way.

### 3. The rules that have drawn blood

- **Prefix every top-level helper.** All game files share ONE global
  scope. `spawnNugget` collided twice and `spawnEnemy` once — each time it
  silently broke a *different* game. Prefix or IIFE-wrap. No exceptions.
- **The main texture atlas (2048²) is FULL at 10 cabinets.** New games go
  in `ArcadeArt.STREET_GAMES` with a street entry point. Overflowed
  regions render BLACK and it is only a console *warning* — a 9th game
  once silently blacked out five control panels and the light tubes.
- **Street art goes on the second atlas** (`makeStreetAtlas`, 1024²),
  never the main page.
- **Quad winding** follows the per-wall rules in `buildScene` or your
  geometry is back-face culled — "built but invisible."
- **Check `PLACEMENT` / `H.hotspots` / prop positions** before placing
  anything, and check E-press priority if you add an interactable (a race
  pad on a service curb once stole the press — see the PAD RULE in gta.js).
- Adding a game means the **whole** checklist in `AGENTS.md`, including
  the `js/storm.js` sync hooks, `js/account.js`, and the worker entry.

### 4. Verify — this is the gate, not a formality

Static-serve and drive headless Chromium:

```bash
npm i playwright && npx playwright install --with-deps chromium
python3 -m http.server 8787   # background
# flags: --use-gl=angle --enable-unsafe-swiftshader
```

Harness notes that save hours:

- `NuggetArcade._H` is exposed for deterministic teleporting
  (`H.cam.x/z/yaw/pitch`).
- Launch games with `setStormMode('<mode>')` after `startStorm(1e6, 5000)`
  — **not** a bare `storm.mode = ...`, which skips the sync hooks.
- The page **autofocuses the amount input** and its guard eats synthetic
  keys. `blur()` first, and for GTN route keys through `gtaPress('KeyX')`
  via evaluate.
- `const` globals (like `gta`) are **not** on `window` — use bare
  identifiers inside `waitForFunction`.
- Probe NPC dialogue via `H.hotspots.find(<label>).act()` then read
  `H.dialog.nodes`.
- Capture `pageerror` **and console warnings** (the atlas guard is a
  warning). Take screenshots and actually look at them.
- Leaderboard fetches from localhost fail CORS **by design** — the
  scoreboard's OFFLINE state is correct, not a bug.

Also run `node --check` on every `.js` file you touched.

Write one explicit test per feature you built. Report the count honestly
as `passed/total`.

### 5. The push gate

**Green — every feature verified, no page errors, no atlas warnings:**
commit to `main` and push. This deploys the live site. That is authorized.

**Anything else — a failed check, a browser you could not bootstrap, a
feature you could not exercise:** do **NOT** push `main`. Push
`nightshift/<YYYY-MM-DD>` instead and say plainly in the ledger what
failed and what you could not verify.

An unverified arcade must not reach howmanynuggets.com because a cron
said so. When in doubt, take the branch. Beau would rather merge a branch
than debug a live site.

Never force-push. Never rewrite published history. If `git push` is
rejected, `git pull --rebase`, re-verify, and try once more.

### 6. Leave the paperwork

Every run updates: `AGENTS.md` (the status block), `CLAUDE.md` (if the
layout table changed), `docs/casefile.md` (if you touched canon),
`GTA_SPRINTS.md` (if you touched GTN), and **the ledger below**.

Commit messages here are a craft, not a changelog. Read the last few in
`git log` and match that register — in-universe, specific, a little
proud. End with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

### 7. File the report — the last thing you do

Beau does not watch this repo at 1 AM. **Email him the shift report** at
`beau@caf2code.com` using the Microsoft 365 / Outlook connector attached
to this routine (`outlook_send_mail`). Send it whether the night went well
or badly — **one format for both.** No email is itself a signal that
something went wrong, so do not skip it, and do not "wait to send until
things look better."

Subject: `NIGHT SHIFT <MM-DD> — <N> shipped, <main|BRANCH ONLY>`

Body, plain text, in this order:

1. **Outcome line first.** Where the code went, the short SHA, the
   diffstat, the verified count as `passed/total`, framerate, and whether
   there were any page errors or atlas warnings. If the gate failed, say
   `GATE FAILED` in the first line and name the branch.
2. **What shipped** — numbered, one line each, in plain language a human
   can skim. Say what the player can now *do*, not which function you
   added. Lead each with its emoji if it has one.
3. **What did not** — anything you started and abandoned, anything that
   failed verification, anything you deliberately skipped and why.
4. **Next shift should pick up** — the same note you leave in the ledger.
5. **Links** — the compare URL
   (`https://github.com/chrismrobbins/howmanynuggets/compare/<prev>...<new>`)
   and https://howmanynuggets.com if you pushed `main`.

Keep it tight enough to read on a phone. The ledger entry below is the
long version; the email is the briefing.

---

## The ledger

Newest last. One entry per run: what shipped, what verified, where it
went, and what the next shift should know.

### 2026-08-05 — shift established
Protocol written, then amended the same day: every run now **emails the
report to beau@caf2code.com** (order 7). The tree was carrying two nights of unpushed work
(🎂 Founder's Day + 🏙️ GTN Season 2, S2.2–S2.8, verified 44/44); it shipped
as `e178830` so the series starts from a clean `main`. Seven runs armed
for 08-06 → 08-18. Open threads the next shift could pull on: S2.10 still
waits on Chris's MP stack; the Hooded Nug's rumor slate is **reopened** at
four-for-four; and Dill's case is open forever by canon — the storm is
alive in the harbor.
