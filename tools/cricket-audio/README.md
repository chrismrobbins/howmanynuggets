# Nugget Cricket audio (tools/cricket-audio)

Same pipeline as Nugget Blitz (see `tools/blitz-vo/README.md`); everything is
made ONCE and shipped as files — playing costs no ElevenLabs credits.

- **Commentary:** `render_vo.py` renders every line in `lines.json` in **Raju**
  (ElevenLabs library voice `IX4AgWzTnD6q0cNvHqvK`, "Raju – Cricket Match
  Commentator", an Indian cricket commentator — Chris's pick from a tryout page).
  Big moments get 2 takes. Output: `audio/cricket/vo/*.mp3` + `js/cricketVO.js`.
  `vo_manifest.json` remembers what each file says (unchanged lines are skipped).
  - `lines.json` is every literal line `crkSay(...)` can say (number-free); a line
    with numbers or team names shows on the ticker and the commentator says its
    `voice` alternative (3rd argument of `crkSay`). A line with no recording is
    simply not spoken — `crkVO.miss` lists them while you play.
- **Soundtrack + sounds:** `make_audio.py` (through `tools/blitz-vo/el_audio.py`,
  the budgeted wrapper: logged to `el_ledger.json`, refused past the cap) →
  `src/` (gitignored raw downloads) → `build_audio.py` (librosa loop cutting,
  loudness) → `audio/cricket/music/` + `index.json`. Bump `CRK_DISC_V` in
  `js/cricketAudio.js` when the files change.
- First pass (2026-10-09): tryout 190 + soundtrack/sounds 925 + commentary 738
  ≈ 1,850 credits of the 3,000 Chris approved.

- **The music changed** ("something Indian … hindustani funk/rock … psychedelic"): two 40 s psych takes
  (`src/match-psych-a.mp3` → copied to `src/match.mp3`, and `match-psych-b`, built alongside); the IPL take is
  `src/match-ipl.mp3`. To switch the game to take B, copy it over `src/match.mp3`, rebuild, bump `CRK_DISC_V`.
