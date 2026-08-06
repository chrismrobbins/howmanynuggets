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
| ~~`CLAUDE.md`~~ | **Not in the repo.** It is untracked and lives only on Beau's machine; `.gitignore` line 5 names a different file (`Claude.md`), which masks it on case-insensitive filesystems but not in a Linux container. Either way you will not have it, and that is expected — not a broken checkout. Do not hunt for it and do not recreate it. `AGENTS.md` carries everything a shift needs. |
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

Beau is asleep at 1 AM and does not watch this repo. **Cut a GitHub
release** — that is how he finds out what you did, and GitHub does the
notifying:

```bash
gh release create nightshift-$(date +%F) \
  --title "NIGHT SHIFT <MM-DD> — <N> shipped, <main|BRANCH ONLY>" \
  --notes-file report.md
```

Do it whether the night went well or badly — **one format for both.** A
missing release is itself the signal that something broke, so do not skip
it, and do not "wait to publish until things look better."

> **Do not try to email.** Beau's Outlook send tool is blocked by
> enterprise policy — this was tried and confirmed dead on 2026-08-05.
> There is no mail connector on this routine and adding one will not help.
> The release is the channel. If you cannot cut a release, say so as
> loudly as you can in your final message and leave the ledger entry
> pushed regardless.

Title: `NIGHT SHIFT <MM-DD> — <N> shipped, <main|BRANCH ONLY>`

Body (Markdown), in this order:

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
long version; the release is the briefing.

### 8. When you cannot push at all — the 08-06 lesson

**Read this before you assume `git push` will work.** On the first run of
this series (2026-08-06) the shift built seven features, verified them
47/47 in a real browser, committed `42ac049`… and could not push a single
byte. The container had **no write path to GitHub whatsoever**:

```
git-upload-pack   → 200   (reads fine)
git-receive-pack  → 403   (writes refused at the gateway)
GitHub MCP        → 403 Resource not accessible by integration
REST api.github.com → 403
```

The 403 came *before any ref was named*, so pushing to a
`nightshift/<date>` branch was refused too — the fallback in order 5 was
not available, and the "guaranteed" ledger commit was not guaranteed
either. Every assumption in this file about delivery failed at once.

**So: prove the channel BEFORE you spend the night building.** First thing
after `git pull`, push an empty commit to a scratch branch:

```bash
git commit --allow-empty -m "probe" && \
  git push origin HEAD:refs/heads/nightshift-probe && \
  git push origin --delete nightshift-probe
```

If that fails, you already know tonight cannot ship. Say so immediately,
then decide whether to build anyway — and if you do, **the container is
ephemeral, so unpushed work dies with it.** Get it out:

1. `git bundle create nightshift-<date>.bundle main` — a bundle carries
   real history and can be fetched into a fresh clone.
2. `git format-patch` as a second copy.
3. Send the bundle, the patch, **and** the full report to the session as
   files, and put the recovery command in your final message:
   `git fetch <bundle> && git merge FETCH_HEAD`.
4. State the exact 403s verbatim. Do not retry a policy denial in a loop —
   the proxy README is explicit that these are not transient.

The 08-06 shift did all of this unprompted and correctly. That is the bar.

**Report channels, in order of certainty — and none of them are free:**

1. **The ledger commit** — only "guaranteed" if pushing works. It didn't
   on 08-06. Push it first anyway.
2. **The GitHub release** — needs `contents: write`, same as pushing, and
   `gh` may not even be installed in the container. Verify with
   `gh release view nightshift-$(date +%F)`.
3. **Files sent to the session + your final message** — the only channel
   that survived 08-06. Always use it, even when the others worked.

Say explicitly which channels worked and which failed. A channel nobody
knows is broken is worse than no channel at all.

---

## The ledger

Newest last. One entry per run: what shipped, what verified, where it
went, and what the next shift should know.

### 2026-08-05 — shift established
Protocol written. Reporting went through two revisions the same day and
landed on **a GitHub release per run** (order 7): email was the ask, but
Beau's Outlook send tool is blocked by enterprise policy, so the mail
connector was removed rather than left to fail nightly. The tree was carrying two nights of unpushed work
(🎂 Founder's Day + 🏙️ GTN Season 2, S2.2–S2.8, verified 44/44); it shipped
as `e178830` so the series starts from a clean `main`. Seven runs armed
for 08-06 → 08-18. Open threads the next shift could pull on: S2.10 still
waits on Chris's MP stack; the Hooded Nug's rumor slate is **reopened** at
four-for-four; and Dill's case is open forever by canon — the storm is
alive in the harbor.

### 2026-08-06 — run 1 of 7 — 7 shipped, verified 47/47, delivered by bundle

**Where it went:** `main` in the end — but *not* from the container, and not
that night. All 47 checks green in a real headless Chromium, no page errors,
no atlas-overflow warnings, framerate at parity with `506f8b4`. Then the push
was refused at the gateway: `403` on `git-receive-pack`, before any ref was
named, so the branch fallback was dead too (see order 8). `42ac049` existed
only inside an ephemeral container.

The shift carried it out by hand — `git bundle` + `git format-patch` + the
full report, sent as session files with the recovery command. Beau downloaded
the bundle; it verified clean, fetched to `42ac049` exactly, and was rebased
onto `main` later the same day. **Nothing was lost: the tree that landed is
the tree that passed 47/47.** The only conflict was this ledger — two authors
writing the same entry from opposite sides of a broken channel.

**What shipped**

1. **🗂️ THE N.P.D. CASE BOARD** *(js/arcade.js, js/arcade-art.js,
   css/locker.css, index.html)* — a glass case on two legs on the sidewalk
   between the hydrant and Det. Dill (x −6.5..−4.9, z 1.15). E opens the case
   file: 14 exhibits, one per game plus the crime itself, each FILED or OPEN,
   and each OPEN one names the game that produces it. Built from the same
   cross-game flag readers the street NPCs already use. Dill's reasoning, in
   character: *"the only people a secret case file keeps in the dark are the
   ones who might help me."* **A full board still reads OPEN. FOREVER.**
2. **⭐ THE HOUSE SPECIAL** *(js/storm.js, index.html, css/storm.css)* — one
   date-seeded game per night pays ×1.5, and clearing it on back-to-back nights
   builds a streak. Same pick for everybody; the HUD names it and the mode
   switch rings its button.
3. **🏷️ THE DPW SALVAGE TAGS** *(js/drain.js, css/drain.css)* — eight brass tags
   wired into Storm Drain at fixed depths (60m → 860m), bitmask-persistent, each
   one a found object with a line of lore. All eight is a new canon flag.
4. **🌩 THE BATTER SQUALL** *(js/gta.js)* — a fifth GTN weather state. Worst grip
   in the game (0.70) and the best cover in the game. See S2.11 in
   GTA_SPRINTS.md.
5. **🍾 THE SYNDICATE MANIFEST** *(js/reel.js)* — an 11th Keeping It Reel catch: a
   corked bottle off the DEEP bottom, on THE MIDNIGHT only. The other half of
   salvage tag 049.
6. **🎧 DIP HOP side D — "THE NIGHT SHIFT"** *(js/beat.js)* — a fourth track,
   138bpm, half-time kick under fast hats. 2 AM, nobody left to impress.
7. **🎶 A FOURTH JUKEBOX LOOP** *(js/arcade.js)* — also THE NIGHT SHIFT: 72bpm,
   minor, almost no lead. What the box plays when the last player leaves.

Plus: Dill gained `board` / `salvage` / `manifest` branches, and the Hooded Nug
reviews the case board as a competing rumor format — *"that is MY format. he
even used the string."*

**Engineering notes the next shift needs**

- **All score banking now goes through `nugStormBank(mode, amount)`** in
  storm.js — the single path from `storm.caught` to `onArcadeScore`, called by
  both `setStormMode` and `stopStorm`. Any future score modifier belongs THERE,
  or it can be dodged by quitting the other way.
- **`gtaWxBlind()`** (fog + squall×0.62) is now the read for "how much the NPD
  can't see" — `copSight`, the heat-decay radius, and headlight reach all use
  it. `gtaWxFog()` still drives the fog VEIL specifically; don't swap that one.
- **In `beatGenTrack`, a lead pattern's digits ARE the note lanes.** Side D's
  first draft never used lane 1 in 57 notes, because both of its snare steps sat
  under lead notes and none of its lead digits were ≡1 mod 4. A charted track
  needs a `1` (or `5`) in the lead line. Caught by test 5c, not by eye.
- The reel junk-snag table now filters on `spec.zone` and `spec.min` instead of
  grabbing any spd-0 spec near the bottom — that's what makes the bottle
  deep-only, and it also stopped boots snagging out past the swirl.
- New STREET-atlas region `npdBoard` (192×128). The street page still has room;
  the main 2048² page was not touched.
- `.gitignore` now covers `node_modules/`, `package.json`, `package-lock.json`.
  `npm i playwright` creates all three; none of them ship. The site is still
  plain `<script>` tags with no build step.

**Verification — 47/47**, one or more explicit tests per feature plus a hall
regression pass. Four things that cost time tonight, so they don't cost it again:

- `npx playwright install chromium` **fails in this container** (download
  blocked, exit 1). Chromium 1194 is already at `/opt/pw-browsers/chromium` —
  launch with `executablePath: '/opt/pw-browsers/chromium'` and it just works.
- **Don't assert an absolute framerate floor.** Headless SwiftShader renders
  this hall at 2–6 fps no matter what you do. The only meaningful check is A/B:
  serve pristine HEAD from a `git worktree` on a second port and compare.
  Tonight measured at parity with `506f8b4` at three camera positions.
- `H.toast` is drawn IN-CANVAS (`{text, until}`), not in the DOM. Read
  `NuggetArcade._H.toast.text`; there is no toast element to query.
- Watch exact flag contracts when seeding localStorage: `gtaDillDone()` wants
  `nugGtaDill` **>= 4**, not `'1'`.

**What did NOT happen:** `worker/**` untouched (no deploy of the production
API). Nugget Catch left taped off. S2.10 / online untouched. And **`CLAUDE.md`
does not exist in this repo** — standing order 1 listed it as required reading,
but the tree only has `AGENTS.md`; `.gitignore` excludes a *different* file
(`Claude.md`, "internal design spec"), which masks it on case-insensitive
filesystems but not in a Linux container. Tonight it was simply skipped and
nothing appeared to be missing. **Resolved:** order 1 now says so outright, so
no future shift wastes time hunting for it.

**Next shift should pick up:** the case board is a frame with room in it — a
15th exhibit is now the cheapest way to make any new feature land in canon (add
a reader row to the table in `docs/casefile.md` AND a row to `LOCKER_EXHIBITS`
in js/arcade.js). The house special is a hook with nothing hanging off it yet:
a streak currently buys pride and nothing else. The Hood ends his case-board
branch by asking what Dill left OFF the board — a deliberately dangling thread.
And S2.10 still waits on Chris.

**Postscript, added on recovery:** fix the write channel before another night
runs, or every remaining run repeats this exactly — build, verify, and die with
the container. Order 8 now makes each shift probe the channel *before* it
builds, so a still-blocked night costs seconds instead of a night's work.
