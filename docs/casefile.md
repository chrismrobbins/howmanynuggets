# NPD CASE FILE № 000-001 — "THE CATCH INCIDENT"

> Filed by: **Det. Dill**, Nuggetown Police Department
> Status: **OPEN. FOREVER. DO NOT ARCHIVE.**
> (this is the canon reference for the storm-theft storyline — every game that
> pulls on this thread is logged here. Keep it current when you add one.)

---

## THE CRIME

On a night nobody can pin down, the **entire storm** inside the NUGGET CATCH
cabinet — a million-plus nuggets, swirling — went missing. No prints. No
witnesses. **No crumbs.** There are always crumbs.

The cabinet remains in the hall, taped off. It is a crime scene, not a broken
game. Do not "fix" it. (`startZoom` guard in js/arcade.js.)

## KNOWN FACTS (in canon order)

1. **The theft.** Syndicate batter residue on the cabinet. Tanker trucks idled
   out back at 3am, riding low — *"like a million nuggets low"* (witness: the
   Hooded Nug). They rolled toward the harbor.
2. **The Sauce Works connection.** The Battered Brawlers campaign established
   the Batter Syndicate had the muscle and the motive. The Mother Clucker
   never confessed. The Mother Clucker never says anything twice.
3. **The dump.** The syndicate dumped the storm off the pier. It did not
   drown. It **moved in**. (KEEPING IT REEL — landing THE STORM.)
4. **The habitat.** The storm is ALIVE in the harbor. Golden at the edges.
   Circling. Eating batter eels, presumably. The case stopped being larceny
   and became *habitat*.
5. **The surfacing.** THE HARBOR JOB (GRAND THEFT NUGGET, contract 11):
   at midnight, at the end of the north pier, the bay stood up, and went
   BACK UNDER. Never freed. Never killed. Still out there.
6. **The sample.** DJ DRIP held a recorder over the pier rail at midnight and
   the harbor answered ON BEAT. The DIP HOP encore samples the storm.
   Nothing moved. The case did not close. It got a soundtrack.
7. **NEW — the basement.** A diver in the storm drains (STORM DRAIN, game 14)
   observed something the size of a weather system using the flooded mains
   as a bus lane, heading harbor-side. Conclusion: the pier is not its home,
   it is its **front door**. The pipes run under the ENTIRE crime scene.
   The case just grew a basement.

9. **NEW — the paperwork, part two.** (Filed after fact 8, which is logged with
   the technical appendix below.) The pipes kept receipts. Eight brass
   **DPW SALVAGE TAGS** came up out of the flooded mains (STORM DRAIN,
   `nugDrainTags`): a hall token worn smooth, a bus transfer punched at 3:04 AM
   when the last bus is 1:15, a tanker gasket rated for slurry, a work order
   reading DO NOT DIVE — signed, countersigned, never actioned — a key cut for
   the taped-off cabinet found eleven pipes from the hall, a pressure chart that
   redlines then flatlines, half a manifest page, and an unsigned note in a
   careful hand: *"it likes the pipes better than the bay. leave it a door."*
   The other half of that manifest page came up off the pier in a corked bottle
   (KEEPING IT REEL, `nugReelManifest`): weights, a route, and a column of
   buyers, none of whom exist. Conclusion: the shipment is real, the hour is
   wrong, the recipients are fiction, and the DPW wrote every bit of it down and
   put it underwater. **No resolution added.** The department now has proof of a
   shipment and still cannot name a hand.

10. **NEW — the door.** The fort's own cellars go DOWN (THE UNDERCROFT,
    game 15, js/croft.js) — floors of rooms no drawing admits to, and at the
    bottom of a delve, once a run, a **vault door that is not on the plans**:
    iron, gold light in the seam, water on the far side, moving harbor-way
    (`nugCroftDoor`). Cross-reference TAG 077, the unsigned note out of the
    mains: *"it likes the pipes better than the bay. leave it a door."*
    Conclusion: somebody didn't just leave it a door — somebody **built** it
    one, and poured a fort on top. The cellar hatch on the street says KEEP
    SHUT; the note says LEAVE IT A DOOR; for the first time in this entire
    case, every piece of paper agrees. It stays shut. It does not open. It is
    not going to open. **No resolution added.**

11. **NEW — the garage has a basement.** (BATTEREDBOTS, game 17, js/bots.js.)
    Under the Grease Garage there is a service pit nobody mentioned, and on
    fight nights it has tires around it and a drain in the middle. Three floors
    down — THE SUMP, where the mains meet — a wrecked RC bot went down that
    drain *still transmitting*. Forty seconds of telemetry, heading harbor-side,
    at a speed no toy car does (`nugBotsPing`, 📡 THE LAST PING). Cross-reference
    fact 7: the pipes are a bus lane. Conclusion: the pipes don't just carry
    water, they carry THINGS, and something down there is in a hurry. The
    detective notes that the garage's accountant bets on the fights. He also
    notes that this is not a crime. **No resolution added.**

## THE BOARD (filed publicly, 2026-08-06)

The case file is on the sidewalk now. Det. Dill mounted a glass case outside the
arcade doors (the **N.P.D. CASE BOARD**, `openLocker()` in js/arcade.js) holding
all sixteen exhibits this arcade can produce, each marked FILED or OPEN, each
OPEN one naming where to go get it. His stated reasoning: *"the only people a
secret case file keeps in the dark are the ones who might help me."*

**Canon rule, load-bearing for every future game: a FULL board does not close
the case.** Sixteen of sixteen still reads OPEN. FOREVER. DO NOT ARCHIVE. A
new game may add a seventeenth exhibit; it may never add an ending.

## WITNESS LEDGER (street regulars, js/arcade.js `NPCS`)

| Witness | Statement quality | Knows about |
|---|---|---|
| **Big Crumb** (door) | reliable, heard *nothing* — which he finds suspicious | the redlining pressure gauge; filed a report nobody read |
| **The Hooded Nug** | infuriatingly accurate | ALL SIX rumors: garage, pier, basement club, the humming gutters, the cellar doors, the fights under the garage floor |
| **Gravy Jones** (bench) | damp, slow, credible | mustard-crowd history; DJ DRIP is his estranged nephew |
| **Henrietta** | bwok | more than she lets on |
| **Det. Dill** | it's his case | everything above, written down, underlined twice |

## EVIDENCE FLAGS (for contributors — the technical appendix)

Cross-game canon flags live in localStorage; street NPC dialogue rebuilds per
conversation and reads them via these globals:

| Flag (localStorage) | Reader | Set by |
|---|---|---|
| `nugReelStorm` | `reelStormLanded()` | landing THE STORM in Keeping It Reel |
| `nugGtaProg` / `nugGtaSawStorm` | `gtaProgress()` / `gtaSawStorm()` | GTN campaign / THE HARBOR JOB |
| `nugBeatEncore` | `beatEncoreDone()` | earning THE STORM REMIX encore in Dip Hop |
| `nugDrainStorm` | `drainSawStorm()` | meeting THE PASSING below 400m in Storm Drain |
| (OVEN RELIGHT marks) | `flappyStormFlown()` `dunkSecretServed()` `blasterHeld()` `runReachedPier()` `simSawStorm()` | the relit classics' storm-adjacent feats |
| `nugGtaEvidence` | `gtaEvidence()` (count 0–12) | pinning evidence to the CASE BOARD (GTN Season 2) |
| `nugGtaDill` | `gtaDillDone()` | finishing all four jobs of DILL'S CHAIN |
| `nugGtaRaces` / `nugGtaGpWin` | `gtaRacesWon()` / `gtaGpWon()` | the street-race ladder / the GOLDEN NUG GP |
| `nugDrainTags` | `drainTagCount()` (0–8) / `drainSalvageDone()` | pulling the 🏷️ DPW SALVAGE TAGS out of the mains |
| `nugReelManifest` | `reelManifestFound()` | snagging 🍾 THE SYNDICATE MANIFEST off the deep bottom |
| `nugCroftDoor` | `croftFoundDoor()` | finding 🚪 THE DOOR beneath Fort Nugget (The Undercroft, the B4+ stairs; also unlocks THE DARK BELOW oath) |
| `nugBotsPing` | `botsPingHeard()` | winning a BATTEREDBOTS match in 🌊 THE SUMP — 📡 THE LAST PING: a wreck went down the drain still transmitting; forty seconds, harbor-way, forty knots. Canon-safe: nobody saw anything, a radio did. Also `nugBotsLeague` / `botsLeagueWon()` (a CLUCKED METAL win unlocks THE FRYER CIRCUIT) |
| `nugFortuneJack` | `fortuneJackpotHit()` | banking the 🌀 wedge AND solving that board — THE STORM JACKPOT in Reel of Fortune (also unlocks THE RIGGED WHEEL tier). Canon-safe: a wheel only carries what somebody carved, a puzzle only knows what somebody WROTE — and the puzzles quote this file. Nothing moved; the case grew a game show; it stays open |

**Adding an exhibit?** Put its reader in this table AND add a row to
`LOCKER_EXHIBITS` in js/arcade.js, or it exists but nobody can see it. Every
entry needs a FILED line (what it proves) and an OPEN line (where to go get it).

8. **NEW — the paperwork.** A civilian assembled the department's first
   complete evidence board: twelve exhibits, one red string (GRAND THEFT
   NUGGET Season 2 — the CASE BOARD, `nugGtaEvidence`). The detective then
   ran four off-book jobs with said civilian (DILL'S CHAIN, `nugGtaDill`):
   a stakeout, an evidence run, a tail on the syndicate's accountant — who
   *waves at the Grease Garage shutter on his way home, noted, underlined
   twice* — and a sting in which the syndicate's books burned themselves.
   Outcome: buyers who never existed, ash that can't testify, and the case
   **exactly as open as before**. That is not failure. That is job security.

## SEASONAL ADDENDUM — 🎂 FOUNDER'S DAY (filed Aug 3, 2026)

Once a year, on **August 3rd**, the street decorates itself (`nugFoundersDay()`
in js/util.js; `localStorage.nugFoundersDayForce` `'1'`/`'0'` overrides for
testing): banner over the road, balloons on the lamps, THE FOUNDER'S CAKE by
the doors — **one candle, every year, exactly one** (the Hood has a theory;
the detective declines to file it). Blowing out the candle stores the year in
`nugFoundersWish`; the flame re-lights the following August 3rd. The jukebox
gains a fifth stop that night only ("ONE CANDLE"). All five regulars have
Founder's Day dialogue.

Officer's note, for the record: on Founder's night there are **no thefts, no
noise complaints, and the harbor sits quiet.** One candle only has so much
jurisdiction, and yet. Nobody knows what was founded — the paperwork burned in
the fryer fire of aught-six. We kept the party. *(No storm evidence was added
or resolved. The case remains open, as required.)*

**Canon rules for future games:**
- The storm is never caught, freed, or killed. Glimpses only. It always goes
  back under (or deeper).
- The case is *open forever* — each game may add evidence, never resolution.
- All water in Nuggetown is the same water. The harbor, the pier, the rain,
  the pipes. Plan accordingly.

*"everything in this town is the weather." — Det. Dill*
