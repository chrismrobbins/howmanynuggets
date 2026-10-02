# transcribe every rendered line back and score it against what it was meant to say
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))  # run from anywhere: inputs/outputs sit next to the script
import json, re, os, subprocess
import numpy as np
from faster_whisper import WhisperModel
man = json.load(open('manifest.json'))
model = WhisperModel('base.en', device='cpu', compute_type='int8')
from num2words import num2words
CONTR = {"he's": 'he is', "it's": 'it is', "that's": 'that is', "you're": 'you are', "they're": 'they are', "we're": 'we are', "can't": 'cannot',
         "don't": 'do not', "i'm": 'i am', "what's": 'what is', "there's": 'there is', "let's": 'let us', "isn't": 'is not', "he'll": 'he will'}
def words(t):
    t = t.lower().replace('-', ' ')
    t = re.sub(r'(\d+)(st|nd|rd|th)\b', lambda m: num2words(int(m.group(1)), to='ordinal'), t)
    t = re.sub(r'\d+', lambda m: num2words(int(m.group(0))).replace('-', ' '), t)
    for a, b in CONTR.items(): t = re.sub(r'\b' + re.escape(a) + r'\b', b, t)
    t = t.replace('half time', 'halftime').replace('pick up', 'pickup')
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
NUM = {'22': 'twenty two', '34': 'thirty four', '44': 'forty four', '80': 'eighty'}
rows = []
for key, (fname, dur, say, phon) in man.items():
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')), 'audio', 'blitz', 'vo', fname), '-f', 's16le', '-ac', '1', '-ar', '16000', '-'], capture_output=True).stdout
    pcm = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    segs, _ = model.transcribe(pcm, language='en', beam_size=3)
    hyp = ' '.join(s.text for s in segs).strip()
    ref = say
    rows.append((wer(ref, hyp), key, fname, dur, hyp))
rows.sort(reverse=True)
bad = [r for r in rows if r[0] > 0.34]
print('clips', len(rows), 'mean WER', round(sum(r[0] for r in rows) / len(rows), 3), 'over 0.34:', len(bad))
for r in bad[:60]: print(round(r[0], 2), r[2], r[3], '|', r[1], '=>', r[4])
json.dump(rows, open('asr.json', 'w'))
