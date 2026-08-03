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

## WITNESS LEDGER (street regulars, js/arcade.js `NPCS`)

| Witness | Statement quality | Knows about |
|---|---|---|
| **Big Crumb** (door) | reliable, heard *nothing* — which he finds suspicious | the redlining pressure gauge; filed a report nobody read |
| **The Hooded Nug** | infuriatingly accurate | ALL FOUR rumors: garage, pier, basement club, the humming gutters |
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

**Canon rules for future games:**
- The storm is never caught, freed, or killed. Glimpses only. It always goes
  back under (or deeper).
- The case is *open forever* — each game may add evidence, never resolution.
- All water in Nuggetown is the same water. The harbor, the pier, the rain,
  the pipes. Plan accordingly.

*"everything in this town is the weather." — Det. Dill*
