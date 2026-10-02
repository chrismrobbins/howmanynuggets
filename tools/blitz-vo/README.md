# Nugget Blitz voices (tools/blitz-vo)

Every spoken line in Nugget Blitz is a pre-rendered clip — **no browser speech
engine** (Chris: "the voices are far too robotic"). Clips live in
`audio/blitz/vo/`, the manifest the game reads is `js/blitzVO.js`
(key = `voice scope | normalized text` → `[file, seconds]`).

Renderer: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), an open
neural TTS model, run offline. Cast (in `render.py`):

| who | voice | notes |
|---|---|---|
| play-by-play | `am_michael` @1.12 | the booth |
| colour | `af_heart` @1.04 | Kokoro's best-rated voice |
| each team (cadence + trash talk) | `am_puck` nugs · `bm_george` fry gods · `am_eric` tots · `am_fenrir` ranch · `am_onyx` bosses · `bm_fable` rings · `am_liam` mustard · `am_echo` curly |  |

## Adding or changing a line

1. Change the text in `js/blitz.js` (the pools are `BLZ_CALLS`, `BLZ_COLOR`,
   `BLZ_PBP`, `BLZ_MOVES[*].say`, `BLZ_FLAVOR`, `BLZ_TRASH`; a few inline lines
   are listed in `extract.js`). A line the game says but has no clip is simply
   not voiced — `blzVoice.miss` lists them while you play.
2. Serve the repo on :8787 and run `node extract.js` (writes `lines.json`).
3. `uv venv -p python3.12 .venv && source .venv/bin/activate && uv pip install kokoro==0.9.4 "transformers>=4.44" "tokenizers>=0.19" soundfile numpy`
   and `brew install espeak-ng` (the pip-bundled espeak's data path is broken
   on macOS; `kokoro_env.py` points misaki at Homebrew's).
4. `python render.py` — renders only new/changed lines (file names are a hash
   of the key, so nothing else moves), trims, loudness-normalizes, encodes
   48 kbps mono MP3 with `lame`, rewrites `js/blitzVO.js`.
5. **Check it with your ears, and then with Whisper:** `uv pip install faster-whisper num2words scipy`
   then `python asr.py` transcribes every clip back and prints the worst
   matches. Short barks ("Hut!") and odd phrasings garble; `variants.py`
   renders candidate phrasings in the real voice and keeps the one Whisper
   understands (written to `overrides.json`, which `render.py` honours — the
   on-screen bubble keeps its words, the voice says the clearer line).
6. Bump the `?v=` on `js/blitzVO.js` in index.html.

Last full render: 360 clips, 3.3 MB, mean word error 5.5% (most of what's
left is made-up names and puns: "Tot Tot" heard as "Todd Todd").
