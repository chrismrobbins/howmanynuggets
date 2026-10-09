# Render every Nugget Blitz line with ElevenLabs (eleven_v3, acted delivery) → MP3s + js/blitzVO.js.
#   python render_el.py [scope-prefix]     e.g. `python render_el.py pbp` or `python render_el.py qb:nugs`
# Key: ~/.config/elevenlabs.key (never in the repo). Needs lines.json from extract.js.
# Unchanged lines are skipped (el_manifest.json remembers what each file says and how it was asked).
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))  # run from anywhere: inputs/outputs sit next to the script
import json, re, sys, hashlib, subprocess, urllib.request, urllib.error, concurrent.futures as cf, time

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(REPO, 'audio', 'blitz', 'vo')
MANIFEST = os.path.join(REPO, 'js', 'blitzVO.js')
KEY = open(os.path.expanduser('~/.config/elevenlabs.key')).read().strip()
lines = json.load(open('lines.json'))
only = sys.argv[1] if len(sys.argv) > 1 else None

# ---- the cast (picked by Chris from the tryout pages, 2026-10-09) ----
BOOTH = {'pbp': 'DduhIyyKkOosbP8VefhP',    # David - Sports Arena Announcer
         'color': 'mSOmKHC6GZcZbSTGlqHO'}  # Mister Gruff - miserable old neighbour
TEAM = {'ranch': 'Av4Fi2idMFuA8kTbVZgv'}   # Russel - Raw Cowboy; the other seven come from the team tryout
TEAM.update(json.load(open('team_cast.json')) if os.path.exists('team_cast.json') else {})

# ---- delivery: an audio tag + stability per kind of line (0.0 = most acted, 0.5 = natural) ----
SHOUT = {'call:td', 'call:fire', 'call:dfire', 'call:hit', 'call:int', 'call:fumble', 'call:sack', 'call:bomb', 'call:late',
         'sit:pick6', 'win', 'code', 'catchname', 'cad', 'hut'}
EXCITE = {'call:first', 'call:good', 'call:heat', 'call:dheat', 'call:spin', 'call:stiff', 'call:hurdle', 'call:pressure',
          'sit:kick', 'sit:ret', 'sit:red', 'sit:goal', 'sit:late', 'sit:fourth', 'team', 'set'}
LETDOWN = {'call:nogood', 'sit:incomplete', 'lose'}
INLINE = {  # the lines extract.js lists by hand (no table to take a kind from)
    'ONSIDE KICK!': 'x', 'FAKE PUNT!': 's', "IT'S A FAKE!": 's', "IT'S TIPPED!": 'x', 'UP FOR GRABS!': 'x', 'OH, THE ELBOW!': 's',
    'TWO POINTS!': 'x', 'SAFETY!': 's', 'THAT IS HALFTIME!': 'n', 'HALFTIME HERE AT THE FRYER!': 'n', 'LOOK AT HIM SHOWBOAT!': 'x',
    "HE'S DANCING IN!": 's', 'THE THIRTY!': 'x', 'THE TWENTY!': 'x', 'THE TEN!': 's', 'A TIE. NOBODY IS HAPPY.': 'd',
    'WHAT A HUGE GAIN!': 's', 'HE IS GOING TO RUN ALL DAY!': 's', 'THAT IS A MONSTER GAIN!': 's', 'BIG GAIN!': 'x',
    'A HUGE CHUNK OF YARDAGE!': 'x', 'HE IS EATING UP YARDS!': 'x', 'WHAT A PICKUP!': 'x',
    'LOSING YARDAGE!': 'd', 'HE GOES BACKWARDS!': 'd', 'DROPPED FOR A LOSS!': 'd',
    'LOOK AT THIS!': 'a', 'OH, HE IS FEELING IT!': 'a', 'CELEBRATION TIME!': 'a', 'GET A PICTURE OF THIS!': 'a'}
COLOR_TAG = {'hit': '[laughs]', 'late': '[laughs]', 'sack': '[laughs]', 'oops': '[sarcastic]', 'drop': '[sarcastic]', 'int': '[sarcastic]',
             'stuff': '[sarcastic]', 'taunt': '[amused]', 'showboat': '[amused]', 'grab': '[impressed]', 'dive': '[impressed]',
             'big': '[excited]', 'td': '[excited]', 'fire': '[excited]'}
# frequent lines get extra takes so repeats aren't identical
TAKES = {'cad': 2, 'set': 3, 'hut': 3, 'call:td': 2, 'call:hit': 2, 'call:first': 2, 'sit:incomplete': 2}

def kind(l):
    c = l.get('cat') or ''
    if c.startswith('move:'): return 'shout'
    if c in SHOUT: return 'shout'
    if c in EXCITE: return 'excite'
    if c in LETDOWN: return 'down'
    if c == 'trash': return 'trash'
    if c.startswith('color:'): return 'color'
    if not c: return {'s': 'shout', 'x': 'excite', 'd': 'down', 'n': 'plain', 'a': 'color'}.get(INLINE.get(l['text']), 'plain')
    return 'plain'

SAY = [(r"\bnuggetown\b", 'Nugget-town'), (r"\bfrympus\b", 'Frim-pus'), (r"\btot tot\b", 'Tot-tot'), (r"\bn f n\b", 'N.F.N.'),
       (r"\bbee-lieve\b", 'bee-lieve'), (r"\blil\b", 'lil')]
NUM = {'22': 'twenty-two', '34': 'thirty-four', '44': 'forty-four', '80': 'eighty'}

def sentence(t):
    t = t.lower().replace('%', ' percent')
    for a, b in SAY: t = re.sub(a, b, t)
    t = re.sub(r'\b(22|34|44|80)\b', lambda m: NUM[m.group(1)], t)
    t = re.sub(r'(^|[.!?]\s+)([a-z])', lambda m: m.group(1) + m.group(2).upper(), t)
    return re.sub(r"\bi\b", 'I', t)

def script(l, take):
    """what we ask the voice to say (text with v3 audio tags) and how loose to let it act"""
    k, text, c = kind(l), l['text'], l.get('cat') or ''
    words = len(text.split())
    s = sentence(text)
    if c == 'cad':   # one call per bubble; the game repeats it (word num, word num, SET)
        return f'[shouting] {s}', 0.0
    if c == 'set':  return ['[shouting] Ready... SET!', '[shouting] Get set!', '[shouting] Ready, SET!'][take % 3], 0.0  # a bare 'Set!' comes out 'Sit!'
    if c == 'hut' and l['team'] == 'mustard' and take == 2: return '[shouting] Ready... HIKE!', 0.0  # Brad stutters 'hut, hut'
    if c == 'hut' and l['team'] == 'bosses':  # Austin's drawl turns a bare HIKE into 'Hank'
        return ['[shouting] Hike the ball!', '[shouting] Go! Go! HIKE!', '[shouting] Ready... HIKE!'][take % 3], 0.0
    if c == 'hut':  return ['[shouting] HUT! HIKE!', '[shouting] Hike!', '[shouting] Hut, hut, HIKE!'][take % 3], 0.0
    if k == 'shout': return '[shouting] ' + (s.upper() if words <= 2 else s), 0.0
    if k == 'excite': return '[excited] ' + s, 0.0 if take else 0.5
    if k == 'down': return '[disappointed] ' + s, 0.5
    if k == 'trash':
        tag = '[shouting]' if text.endswith('!') and words <= 5 else '[mischievously]'
        return f'{tag} {s}', 0.0
    if k == 'color':
        cc = c.split(':')[1] if ':' in c else ''
        return (COLOR_TAG.get(cc, '') + ' ' + s).strip(), 0.5
    return s, 0.5

def voice(l):
    return BOOTH.get(l['who']) or TEAM.get(l['team'])

def tts(vid, text, stab):
    body = json.dumps({'text': text, 'model_id': 'eleven_v3', 'voice_settings': {'stability': stab}}).encode()
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128', data=body,
                                 headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r: return r.read()
        except urllib.error.HTTPError as e:
            msg = e.read()[:200]
            if e.code in (409, 429, 500, 502, 503) and attempt < 3: time.sleep(3 * (attempt + 1)); continue
            raise RuntimeError(f'HTTP {e.code} {msg}')

def finish(raw, dest):
    """trim silence, loudness to -16 LUFS, 64 kbps mono 44.1 kHz"""
    tmp = dest + '.src.mp3'
    open(tmp, 'wb').write(raw)
    af = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,'
          'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,'
          'loudnorm=I=-16:TP=-1.5:LRA=11')
    subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-i', tmp, '-af', af, '-ar', '44100', '-ac', '1', '-b:a', '64k', dest], check=True)
    os.remove(tmp)
    d = subprocess.run(['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest], capture_output=True, text=True).stdout
    return round(float(d), 2)

def write_runtime(man):
    # runtime manifest: key → [[file, seconds], …takes]
    rt = {}
    for tk, e in sorted(man.items()):
        rt.setdefault(e['key'], []).append([e['file'], e['dur']])
    with open(MANIFEST, 'w') as f:
        f.write('// ---- 🎙️ NUGGET BLITZ: THE VOICES ---- generated by tools/blitz-vo/render_el.py (do not hand-edit)\n')
        f.write('// key = voice scope | normalized text  →  [[file in audio/blitz/vo/, seconds], …one per take]\n')
        f.write('const BLZ_VO = ' + json.dumps(rt, separators=(',', ':')) + ';\n')
    return rt

def main():
    man = json.load(open('el_manifest.json')) if os.path.exists('el_manifest.json') else {}
    jobs = []
    for l in lines:
        if only and not l['scope'].startswith(only): continue
        vid = voice(l)
        if not vid: continue
        n = TAKES.get(l.get('cat') or '', 1)
        for take in range(n):
            text, stab = script(l, take)
            tk = l['key'] + ('#' + str(take) if take else '')
            tag = l['who'] if l['who'] in BOOTH else ('qb-' if l['who'] == 'qb' else 'pl-') + l['team']
            fname = 'el-' + tag + '-' + hashlib.sha1((tk + '|' + vid + '|' + text).encode()).hexdigest()[:8] + '.mp3'
            e = man.get(tk)   # unchanged = same words, same voice, file still there (fix_el.py may have re-rolled it under another name)
            if e and e['said'] == text and e['voice'] == vid and os.path.exists(os.path.join(OUT, e['file'])): continue
            jobs.append((l, tk, vid, text, stab, fname))
    print(len(jobs), 'clips to render,', sum(len(j[3]) for j in jobs), 'characters', flush=True)
    if os.environ.get('DRY'):
        for j in jobs: print(f'{j[1][:44]:44} {j[4]}  {j[3]}')
        sys.exit()

    def go(j):
        l, tk, vid, text, stab, fname = j
        try:
            dur = finish(tts(vid, text, stab), os.path.join(OUT, fname))
            return tk, {'file': fname, 'dur': dur, 'key': l['key'], 'said': text, 'voice': vid, 'stability': stab}, None
        except Exception as e:
            return tk, None, str(e)
    done = 0
    with cf.ThreadPoolExecutor(3) as ex:
        for tk, ent, err in ex.map(go, jobs):
            if err: print('FAIL', tk, err, flush=True); continue
            man[tk] = ent; done += 1
            if done % 20 == 0:
                print(done, 'done', flush=True); json.dump(man, open('el_manifest.json', 'w'), indent=1)
    json.dump(man, open('el_manifest.json', 'w'), indent=1)

    rt = write_runtime(man)
    print('rendered', done, 'of', len(jobs), '· manifest keys', len(rt))

if __name__ == '__main__':
    main()
