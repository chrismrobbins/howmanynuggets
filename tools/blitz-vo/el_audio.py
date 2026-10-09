# Budgeted ElevenLabs music + sound effects for Nugget Blitz.
# Chris: "we need to be cautious on consumption". Every call goes through spend(): it is logged to
# el_ledger.json and REFUSED if it would push the music/sfx total past CAP. Sound effects report their
# exact cost (character-cost header); music doesn't, so it's logged at the measured rate
# (2026-10-09: 10 s of music = 125 credits, read off the dashboard balance).
import os, json, time, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
LEDGER = os.path.join(HERE, 'el_ledger.json')
KEY = open(os.path.expanduser('~/.config/elevenlabs.key')).read().strip()
CAP = 10000                 # credits for music + sound effects, agreed with Chris
MUSIC_PER_SEC = 12.5        # measured, see above
SFX_PER_SEC = 10            # measured: 2 s = 20 credits

def ledger():
    return json.load(open(LEDGER)) if os.path.exists(LEDGER) else {'cap': CAP, 'spent': 0, 'calls': []}

def spent():
    return ledger()['spent']

def _log(kind, what, secs, cost, out):
    L = ledger()
    L['spent'] = round(L['spent'] + cost, 1)
    L['calls'].append({'t': time.strftime('%Y-%m-%d %H:%M'), 'kind': kind, 'what': what[:120], 'secs': secs, 'credits': cost, 'file': out})
    json.dump(L, open(LEDGER, 'w'), indent=1)
    return L['spent']

def _guard(est, what):
    if spent() + est > CAP:
        raise SystemExit(f'BUDGET: {what!r} (~{est:.0f} credits) would pass the {CAP} cap ({spent():.0f} spent). Ask Chris first.')

def _post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read(), r.headers.get('character-cost')

def music(prompt, secs, out):
    est = secs * MUSIC_PER_SEC
    _guard(est, out)
    raw, _ = _post('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',
                   {'prompt': prompt, 'music_length_ms': int(secs * 1000), 'force_instrumental': True})
    open(out, 'wb').write(raw)
    total = _log('music', prompt, secs, est, os.path.basename(out))
    print(f'  music {os.path.basename(out)} {secs}s ~{est:.0f} cr  (total {total:.0f}/{CAP})', flush=True)

def sfx(text, secs, out, influence=0.4):
    est = secs * SFX_PER_SEC
    _guard(est, out)
    raw, cost = _post('https://api.elevenlabs.io/v1/sound-generation',
                      {'text': text, 'duration_seconds': secs, 'prompt_influence': influence})
    open(out, 'wb').write(raw)
    c = float(cost) if cost else est
    total = _log('sfx', text, secs, c, os.path.basename(out))
    print(f'  sfx {os.path.basename(out)} {secs}s {c:.0f} cr  (total {total:.0f}/{CAP})', flush=True)
