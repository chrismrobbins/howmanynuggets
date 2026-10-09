# Re-roll the takes Whisper can't understand: up to TRIES fresh renders each, keep the clearest.
#   (run with a Python that has faster-whisper; see README)   python fix_el.py [max-score, default 0.34]
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
import json, sys, shutil
import render_el as R
from asr_el import hear, score
LIMIT = float(sys.argv[1]) if len(sys.argv) > 1 else 0.34
TRIES = 3
man = json.load(open('el_manifest.json'))
lines = {l['key']: l for l in json.load(open('lines.json'))}
# lines whose script changed since the last render get rendered too (e.g. SET's wording)
todo = []
for tk, e in man.items():
    l = lines.get(e['key'])
    if not l: continue
    take = int(tk.split('#')[1]) if '#' in tk else 0
    text, stab = R.script(l, take)
    if text != e['said']: todo.append((tk, l, text, stab, 9.0)); continue
    sc = score(e['said'], hear(e['file']))
    if sc > LIMIT: todo.append((tk, l, text, stab, sc))
print(len(todo), 'takes to re-roll', flush=True)
for tk, l, text, stab, old in todo:
    vid = R.voice(l)
    best = (old if old < 9 else 99, None)
    for n in range(TRIES):
        tmp = os.path.join(R.OUT, f'_try{n}.mp3')
        try: dur = R.finish(R.tts(vid, text, stab), tmp)
        except Exception as e: print('FAIL', tk, e); continue
        sc = score(text, hear(os.path.basename(tmp)))
        if sc < best[0]: best = (sc, (tmp, dur))
        if sc == 0: break
    if best[1]:
        tmp, dur = best[1]
        tag = man[tk]['file'].split('-')[:-1]
        fname = '-'.join(tag) + '-' + R.hashlib.sha1((tk + '|' + vid + '|' + text + '|r').encode()).hexdigest()[:8] + '.mp3'
        old_file = man[tk]['file']
        shutil.move(tmp, os.path.join(R.OUT, fname))
        if old_file != fname and os.path.exists(os.path.join(R.OUT, old_file)): os.remove(os.path.join(R.OUT, old_file))
        man[tk].update(file=fname, dur=dur, said=text, stability=stab)
        print(f'{tk:40} {old:.2f} -> {best[0]:.2f}', flush=True)
    else:
        print(f'{tk:40} kept ({old:.2f})', flush=True)
    for n in range(TRIES):
        p = os.path.join(R.OUT, f'_try{n}.mp3')
        if os.path.exists(p): os.remove(p)
    json.dump(man, open('el_manifest.json', 'w'), indent=1)
R.write_runtime(man)
