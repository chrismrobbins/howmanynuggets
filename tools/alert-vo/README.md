# Nugget Alert voices, music and sound effects (tools/alert-vo)

Everything Nugget Alert says or plays is an ElevenLabs recording made once by `render.py` and shipped in
`audio/alert/` (`vo/`, `music/`, `sfx/` + `index.json`, the manifest the game fetches). The game never
calls ElevenLabs, and with no files it falls back to the synth and the on-screen text.

- **Script, cast and prompts** all live at the top of `render.py`: `CAST` (library voice ids), `EVA`
  (Battle Control; keys are the exact `alrSay()` messages), `UNITS` (`<type>:select|move|attack`),
  `MUSIC`, `SFX`. Tone (Chris): straight RA2, played seriously; the jokes are in the words.
- **Budget:** music + sfx go through `tools/blitz-vo/el_audio.py`, which shares Blitz's ledger and
  refuses past its cap (14,000, raised for this soundtrack). Voices are logged to `tts_ledger.json` and
  refused past `TTS_CAP` (3,500 characters). Audio tags like `[calm]` are billed as characters, so
  they're kept short, with one take per line. Ask Chris before any new batch.
- **Run:** key in `~/.config/elevenlabs.key` (chmod 600, never in the repo).
  `DRY=1 python3 tools/alert-vo/render.py` shows what's missing and what it costs.
  `python3 tools/alert-vo/render.py [vo|sfx|music]` makes only missing files (delete a file to redo it),
  then rewrites `index.json`. Bump `ALR_AUDIO_V` in `js/alertAudio.js` after a new render.
- **No post-processing step:** there's no ffmpeg on the machine this was set up on. `js/alertAudio.js`
  trims the leading silence and loudness-matches each clip when it decodes, and loops the songs with
  a 3 s crossfade, so a song's own ending never matters.
