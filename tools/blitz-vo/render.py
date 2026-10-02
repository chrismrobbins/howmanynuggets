# Pre-render every Nugget Blitz line with Kokoro (an open neural TTS) → small MP3s + a manifest.
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))  # run from anywhere: inputs/outputs sit next to the script
import kokoro_env  # Homebrew espeak-ng for the out-of-vocabulary fallback
import json, re, subprocess, sys, os, time, hashlib
import numpy as np, soundfile as sf
from kokoro import KPipeline

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(REPO, 'audio', 'blitz', 'vo')
MANIFEST = os.path.join(REPO, 'js', 'blitzVO.js')
lines = json.load(open('lines.json'))
only = sys.argv[1] if len(sys.argv) > 1 else None

# who speaks: (kokoro voice, speed)
CAST = {
    'pbp': ('am_michael', 1.12),
    'color': ('af_heart', 1.04),
}
TEAM_VOICE = {
    'nugs': ('am_puck', 1.12), 'frygods': ('bm_george', 0.96), 'tots': ('am_eric', 1.18), 'ranch': ('am_fenrir', 1.0),
    'bosses': ('am_onyx', 1.02), 'rings': ('bm_fable', 1.08), 'mustard': ('am_liam', 1.12), 'curly': ('am_echo', 1.14),
}
# pronunciation help for the made-up words (applied to the lowercased line)
SAY = [
    (r"\bfryvre\b", 'fry-ver'), (r"\bsauceders\b", 'sauce-ders'), (r"\bnuggetown\b", 'nugget town'), (r"\bfrympus\b", 'frim-pus'),
    (r"\bbloomin'", 'bloomin'), (r"\bbee-lieve\b", 'bee-leeve'), (r"\bnug in nugget\b", 'nugg in nugget'), (r"\bn f n\b", 'N. F. N.'),
    (r"\blil\b", 'lil'), (r"\bvidalia\b", 'vih-dale-ya'), (r"\btot tot\b", 'tot, tot'),
]
OVERRIDE = {
    'SET': 'Ready... set!', 'HUT': 'Hut, hut, hike!',
    'SPEARED': 'Oh, he got speared!', 'TWO POINTS': "That's two points!", 'SIX POINTS': "That's six points!",
    'IT S TIPPED': 'The ball is tipped!', 'OH THE DISRESPECT': 'Oh, the disrespect!', 'OH THEY ARE JAWING': 'Oh, these two are talking trash!',
    'WE PUT THE NUG IN NUGGET': 'We put the nug... in nugget!', 'TEN PIECE NO WAITING': 'Ten piece. No waiting!',
    'TOTS TOTS TOTS': 'Tots! Tots! Tots!', 'ONSIDE KICK': "It's an onside kick!", 'SACKED': "He's sacked!",
}
OV = json.load(open('overrides.json')) if os.path.exists('overrides.json') else {}
def speakable(text, key=''):
    if key in OV: return OV[key]                       # judged best by the Whisper round-trip (variants.py)
    k = key.split('|', 1)[1] if '|' in key else ''
    if k in OVERRIDE: return OVERRIDE[k]
    m = re.match(r'^(THE .*) WIN IT$', k)
    if m: return m.group(1).lower().capitalize() + ' win the game.'
    m = re.match(r'^WHAT A GAME (THE .*) WIN IT$', k)
    if m: return 'What a game! ' + m.group(1).lower().capitalize() + ' win it!'
    t = text.lower()
    for a, b in SAY: t = re.sub(a, b, t)
    # sentence case: the first letter of each sentence up (ALL CAPS reads as acronyms)
    t = re.sub(r'(^|[.!?]\s+)([a-z])', lambda m: m.group(1) + m.group(2).upper(), t)
    t = re.sub(r"\bi\b", 'I', t)
    return t

def trim_norm(a, sr):
    if len(a) == 0: return a
    env = np.abs(a)
    thr = max(1e-4, env.max() * 0.012)
    idx = np.where(env > thr)[0]
    if len(idx):
        s0 = max(0, idx[0] - int(0.03 * sr)); s1 = min(len(a), idx[-1] + int(0.06 * sr))
        a = a[s0:s1]
    # loudness: RMS to ~-17 dBFS, peaks under -1 dBFS
    rms = np.sqrt(np.mean(a ** 2)) + 1e-9
    a = a * (10 ** (-17 / 20) / rms)
    pk = np.abs(a).max()
    if pk > 10 ** (-1 / 20): a = a * (10 ** (-1 / 20) / pk)
    f = int(0.008 * sr)
    if len(a) > 2 * f:
        a[:f] *= np.linspace(0, 1, f); a[-f:] *= np.linspace(1, 0, f)
    return a.astype(np.float32)

pipes = {'a': KPipeline(lang_code='a'), 'b': KPipeline(lang_code='b')}
manifest = {}
if os.path.exists('manifest.json'): manifest = json.load(open('manifest.json'))
t0 = time.time(); n = 0
counters = {}
for l in lines:
    scope = l['scope']
    if only and not scope.startswith(only): continue
    if l['key'] in manifest and manifest[l['key']][2] == speakable(l['text'], l['key']) and os.path.exists(os.path.join(OUT, manifest[l['key']][0])): continue
    voice, speed = CAST.get(l['who']) or TEAM_VOICE[l['team']]
    speed = OV.get('_speed:' + l['key'], speed)
    tag = l['who'] if l['who'] in CAST else ('qb-' if l['who'] == 'qb' else 'pl-') + l['team']
    fname = tag + '-' + hashlib.sha1(l['key'].encode()).hexdigest()[:8] + '.mp3'
    say = speakable(l['text'], l['key'])
    pipe = pipes['b' if voice.startswith('b') else 'a']
    chunks, phon = [], []
    for gs, ps, audio in pipe(say, voice=voice, speed=speed):
        a = audio.numpy() if hasattr(audio, 'numpy') else np.asarray(audio)
        chunks.append(a); phon.append(ps)
    a = trim_norm(np.concatenate(chunks) if chunks else np.zeros(1, np.float32), 24000)
    sf.write('tmp.wav', a, 24000)
    subprocess.run(['lame', '--quiet', '-m', 'm', '-b', '48', '--resample', '24', 'tmp.wav', os.path.join(OUT, fname)], check=True)
    manifest[l['key']] = [fname, round(len(a) / 24000, 2), say, ' | '.join(phon)]
    n += 1
    if n % 25 == 0: print(n, 'lines', round(time.time() - t0), 's', flush=True)
json.dump(manifest, open('manifest.json', 'w'), indent=1)
# the runtime manifest: key → [file, seconds]
js = {k: v[:2] for k, v in manifest.items()}
with open(MANIFEST, 'w') as f:
    f.write('// ---- 🎙️ NUGGET BLITZ: THE VOICES ---- generated by the Kokoro render script (do not hand-edit)\n')
    f.write('// key = voice scope | normalized text  →  [file in audio/blitz/vo/, seconds]\n')
    f.write('const BLZ_VO = ' + json.dumps(js, separators=(',', ':')) + ';\n')
print('done', n, 'lines in', round(time.time() - t0), 's')
