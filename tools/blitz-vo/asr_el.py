# Whisper round-trip for the ElevenLabs clips: did each take say what it was asked to (tags stripped)?
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
import json, re, subprocess, sys
import numpy as np
from faster_whisper import WhisperModel
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
man = json.load(open('el_manifest.json'))
model = WhisperModel('base.en', device='cpu', compute_type='int8')
CONTR = {"he's": 'he is', "it's": 'it is', "that's": 'that is', "you're": 'you are', "they're": 'they are', "we're": 'we are', "can't": 'cannot',
         "don't": 'do not', "i'm": 'i am', "what's": 'what is', "let's": 'let us', "gonna": 'going to'}
NUMS = {'22': 'twenty two', '34': 'thirty four', '44': 'forty four', '80': 'eighty', '30': 'thirty', '20': 'twenty', '10': 'ten'}
LAUGH = {'ha', 'haha', 'hahaha', 'heh', 'hehe', 'ho', 'hoho', 'ah', 'oh', 'ugh', 'ahh', 'ohh', 'hmm', 'uh', 'whoa', 'wow'}
def words(t):
    t = re.sub(r'\[[^\]]*\]', ' ', t).lower().replace('-', ' ')
    for a, b in NUMS.items(): t = re.sub(r'\b' + a + r'\b', b, t)
    for a, b in CONTR.items(): t = re.sub(r'\b' + re.escape(a) + r'\b', b, t)
    t = re.sub(r"[^a-z' ]+", ' ', t)
    return [w.strip("'") for w in t.split() if w.strip("'") and w.strip("'") not in LAUGH]
def wer(ref, hyp):
    r, h = words(ref), words(hyp)
    d = [[0] * (len(h) + 1) for _ in range(len(r) + 1)]
    for i in range(len(r) + 1): d[i][0] = i
    for j in range(len(h) + 1): d[0][j] = j
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i][j] = min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (r[i-1] != h[j-1]))
    return d[len(r)][len(h)] / max(1, len(r))
def score(ref, hyp):
    # word error, forgiving word splits ("spine buster" for SPINEBUSTER): also compare the letters with the spaces taken out
    r, h = ''.join(words(ref)), ''.join(words(hyp))
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j-1] + 1, prev + (r[i-1] != h[j-1])); prev, d[j] = d[j], cur
    return min(wer(ref, hyp), d[len(h)] / max(1, len(r)) * 1.5)
only = sys.argv[1] if len(sys.argv) > 1 else None
def hear(file):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', os.path.join(REPO, 'audio', 'blitz', 'vo', file), '-f', 's16le', '-ac', '1', '-ar', '16000', '-'], capture_output=True).stdout
    pcm = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    segs, _ = model.transcribe(pcm, language='en', beam_size=3)
    return ' '.join(s.text for s in segs).strip()
if __name__ == '__main__':
    rows = []
    for tk, e in man.items():
        if only and not tk.startswith(only): continue
        hyp = hear(e['file'])
        rows.append((round(score(e['said'], hyp), 2), tk, e['dur'], e['said'], hyp))
    rows.sort(reverse=True)
    print('clips', len(rows), 'mean WER', round(sum(r[0] for r in rows) / len(rows), 3), 'over 0.34:', sum(r[0] > 0.34 for r in rows),
          'longest', max(r[2] for r in rows))
    for r in rows[:45]: print(r[0], r[2], '|', r[1], '|', r[3], '=>', r[4])
    json.dump(rows, open('asr_el.json', 'w'), indent=0)
