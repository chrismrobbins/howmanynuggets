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
| ~~`CLAUDE.md`~~ | **Not in the repo — it is gitignored** (`.gitignore` line 5) and exists only on Beau's machine. If you are running in a cloud container it will be absent, and that is expected, not a broken checkout. Do not go looking for it and do not recreate it. `AGENTS.md` carries everything a shift needs. |
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

### 2026-08-06 — run 1: built, verified, could not ship
Seven features, **verified 47/47** in headless Chromium, zero page errors,
zero atlas warnings, framerate at parity with `506f8b4`. Committed
`42ac049` (16 files, +1002/−26) — 🗂️ THE N.P.D. CASE BOARD (14 exhibits on
the sidewalk, all of them still reading OPEN. FOREVER. DO NOT ARCHIVE),
⭐ THE HOUSE SPECIAL (one game on nightly special, date-seeded, 1.5× with a
carrying streak), 🏷️ THE DPW SALVAGE TAGS (eight brass tags at fixed depths
in Storm Drain — one is a bus transfer punched at 3:04 AM when the last bus
is 1:15; one is a key cut for the taped-off cabinet), 🌩 THE BATTER SQUALL
(a fifth GTN weather state: worst grip in the game, best cover in the
game), 🍾 THE SYNDICATE MANIFEST (an 11th Keeping It Reel catch, deep
bottom only — the other half of tag 049), 🎧 DIP HOP side D "THE NIGHT
SHIFT", and a fourth jukebox loop of the same title at 72bpm for after the
last player leaves. Its own tests caught two bugs eyeballing missed: side D
never used lane 1 across 57 notes, and the manifest flag was being
swallowed by the NEW-SPECIES branch on the one catch that matters.

**None of it reached GitHub** — writes are refused at the container gateway
(see order 8). The commit existed only in an ephemeral container; the shift
routed around it with a bundle, a patch, and a full report sent as session
files. **The write path must be fixed before another night runs**, or each
one repeats this exactly. Threads it left: the case board is a frame with
room in it (a 15th exhibit is now the cheapest way to make a feature
canon), the house special is a hook with nothing hanging off it, and the
Hood ends his board branch asking what Dill left off it.
four-for-four; and Dill's case is open forever by canon — the storm is
alive in the harbor.
