# Nugget Blitz voices (tools/blitz-vo)

Every spoken line in Nugget Blitz is a pre-rendered clip; the browser never
synthesizes speech. Clips live in `audio/blitz/vo/` (`el-*.mp3`), and the
manifest the game reads is `js/blitzVO.js`:
`key → [[file, seconds], …one per take]`, key = `voice scope | normalized text`.

History: browser speechSynthesis ("far too robotic") → Kokoro-82M, an open TTS
(2026-10-02; clear but flat: "still weak, I want it to sound more real") →
**ElevenLabs `eleven_v3`** (2026-10-09), which can act: `[shouting]`,
`[laughs]`, `[sarcastic]`… tags in the text. Chris picked every voice by ear
from two tryout pages.

## The cast (`render_el.py`, `team_cast.json`)

| who | ElevenLabs voice | |
|---|---|---|
| play-by-play | David - Sports Arena Announcer | `DduhIyyKkOosbP8VefhP` |
| colour | Mister Gruff - miserable old neighbor | `mSOmKHC6GZcZbSTGlqHO` |
| The Nugs | Brock - Commanding and Loud Sergeant | `DGzg6RaUqxGRTHSBjfgF` |
| The Fry Gods | Azazel - Menacing and Gravelly Demon | `ysswSXp8U9dFpzPJqFje` |
| The Tater Tots | Jerry B. - New York Italian Mobster | `QzTKubutNn9TjrB7Xb2Q` |
| The Ranch Hands | Russel - Raw Cowboy | `Av4Fi2idMFuA8kTbVZgv` |
| The Sauce Bosses | Austin - Deep, Raspy and Authentic | `Bj9UqZbhQsanLzgalpEG` |
| The Onion Rings | Dante - Growly and Menacing Monster | `wXvR48IpOq9HACltTmt7` |
| The Honey Mustard | Brad - Energetic, Rushed and Intense | `zCgijgIKIMkFHnzXcCva` |
| The Curly Fries | Adam - American, Dark and Tough | `IRHApOXLvnW57QJPQH2P` |

Library voices are used by id; they don't need adding to the account.
Rendering needs a paid (commercial) ElevenLabs plan. Chris has one.

## Adding or changing a line

1. Change the text in `js/blitz.js` (pools: `BLZ_CALLS`, `BLZ_COLOR`, `BLZ_PBP`,
   `BLZ_MOVES[*].say`, `BLZ_FLAVOR`, `BLZ_TRASH`; inline lines are listed in
   `extract.js`). **A line with no clip is silent**: `blzVoice.miss` lists the
   keys the game wanted while you play.
2. Serve the repo on :8787 and run
   `PUPPETEER=~/node_modules/puppeteer node tools/blitz-vo/extract.js`
   (writes `lines.json`, each line tagged with its pool, e.g. `call:td`).
3. API key: `~/.config/elevenlabs.key` (chmod 600, never in the repo; a
   TTS + voices-read scoped key is enough).
   `DRY=1 python3 tools/blitz-vo/render_el.py` shows what would be rendered,
   with the acted script and the character count (= credits).
   `python3 tools/blitz-vo/render_el.py [scope]` renders only new or changed
   lines. Delivery comes from the line's pool (`kind()`/`script()`): big
   plays are shouted at stability 0.0, situational calls are excited,
   incompletions are disappointed, and colour gets a tag per pool. Common
   lines get several takes (`TAKES`). Output is trimmed, normalized to
   -16 LUFS, 64 kbps mono.
4. **Check it.** In a venv with `faster-whisper numpy`, run `python asr_el.py`:
   it transcribes every take back and scores it against the words it was
   asked to say, forgiving word splits like "spine buster". Then run
   `python fix_el.py` to re-roll any take Whisper can't understand (up to 3
   fresh renders, keep the clearest). If a line keeps failing, change its
   wording in `script()`. A bare "Set!" comes out "Sit!", and Austin's drawl
   turns "Hike!" into "Hank!". Last pass: 436 takes, mean word error 3.9%.
5. Bump the `?v=` on `js/blitzVO.js` in index.html.

## Music and sound effects (`el_audio.py`, `make_music.py`, `build_music.py`)

The soundtrack, stingers and crowd are ElevenLabs recordings too. **Every
music/sfx call goes through `el_audio.py`**: it logs to `el_ledger.json` and
refuses anything past `CAP` (10,000 credits for music + sfx, agreed with
Chris). Ask him before a new batch.
1. Edit the prompts in `make_music.py` and delete the old file in
   `music_src/` for anything to redo. `python3 make_music.py` makes only
   what's missing and prints the estimated cost first.
2. Build the game's files (no credits) in a venv with `librosa soundfile`:
   `python build_music.py`. It writes `audio/blitz/music/` + `index.json`.
3. Bump `BLZ_DISC_V` in js/blitzAudio.js (the files are fetched with it).
