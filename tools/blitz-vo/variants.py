# for each troublesome line: render candidate phrasings in its real voice, let Whisper judge, keep the clearest
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))  # run from anywhere: inputs/outputs sit next to the script
import kokoro_env
import json, re, sys
import numpy as np
from kokoro import KPipeline
from faster_whisper import WhisperModel
from num2words import num2words
exec(open('render.py').read().split('pipes = {')[0].split('import kokoro_env')[1].replace('from kokoro import KPipeline', ''))  # CAST, TEAM_VOICE, trim_norm
pipes = {'a': KPipeline(lang_code='a'), 'b': KPipeline(lang_code='b')}
asr = WhisperModel('base.en', device='cpu', compute_type='int8')
CONTR = {"he's": 'he is', "it's": 'it is', "that's": 'that is', "you're": 'you are', "they're": 'they are', "we're": 'we are'}
def words(t):
    t = t.lower().replace('-', ' ')
    t = re.sub(r'\d+', lambda m: num2words(int(m.group(0))).replace('-', ' '), t)
    for a, b in CONTR.items(): t = re.sub(r'\b' + re.escape(a) + r'\b', b, t)
    t = re.sub(r"[^a-z0-9' ]+", ' ', t)
    return [w.strip("'") for w in t.split() if w.strip("'")]
def wer(ref, hyp):
    r, h = words(ref), words(hyp)
    d = [[0] * (len(h) + 1) for _ in range(len(r) + 1)]
    for i in range(len(r) + 1): d[i][0] = i
    for j in range(len(h) + 1): d[0][j] = j
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i][j] = min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (r[i-1] != h[j-1]))
    return d[len(r)][len(h)] / max(1, len(r))
def score(voice, speed, text, tries=2):
    pipe = pipes['b' if voice.startswith('b') else 'a']
    tot = 0; hyp = ''
    for _ in range(tries):
        a = np.concatenate([(x.numpy() if hasattr(x, 'numpy') else x) for _, _, x in pipe(text, voice=voice, speed=speed)])
        a = trim_norm(a, 24000)
        import scipy.signal as ss
        a16 = ss.resample_poly(a, 2, 3).astype(np.float32)
        segs, _ = asr.transcribe(a16, language='en', beam_size=3)
        hyp = ' '.join(s.text for s in segs).strip()
        tot += wer(text, hyp)
    return tot / tries, hyp
JOBS = []
for tm, (v, sp) in TEAM_VOICE.items():
    JOBS.append(('qb:' + tm + '|SET', v, sp, ['Set!', 'Ready, set!', 'Set. Set!', 'Get set!']))
    JOBS.append(('qb:' + tm + '|HUT', v, sp, ['Hike!', 'Hut! Hike!', 'Hut, hut, hike!', 'Hike it!']))
    JOBS.append(('player:' + tm + '|HIKE IT I DARE YOU', v, sp, ['Go ahead, hike it! I dare you!', 'Hike the ball! I dare you!', 'Snap it! I dare you!']))
pv, ps = CAST['pbp']; cv, cs = CAST['color']
JOBS += [
    ('pbp|FALLS INCOMPLETE', pv, ps, ['The pass falls incomplete!', 'Incomplete! It falls to the turf!', 'Falls incomplete!']),
    ('pbp|PICK SIX', pv, ps, ["That's a pick six!", "Pick six! He's gone!", 'Pick six!']),
    ('pbp|FAKE PUNT', pv, ps, ["It's a fake punt!", 'Fake punt! They faked it!', 'Fake punt!']),
    ('color|OH THE DISRESPECT', cv, cs, ['Oh! The disrespect!', 'Now that is disrespectful!', 'Oh, come on! The disrespect!']),
]
best = {}
for key, v, sp, cands in JOBS:
    res = [(score(v, sp, c), c) for c in cands]
    res.sort(key=lambda r: r[0][0])
    (w, hyp), c = res[0]
    best[key] = c
    print(key, '->', repr(c), round(w, 2), '|', hyp, '| others:', [(cc, round(rr[0], 2)) for rr, cc in res[1:]], flush=True)
json.dump(best, open('overrides.json', 'w'), indent=1)
