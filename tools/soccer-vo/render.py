# Nugget Soccer's commentary, music and sound effects, rendered ONCE with ElevenLabs and shipped as files.
# The game never calls ElevenLabs; playing costs nothing. (Chris, 2026-10-22: budget approved: music + sfx
# cap raised to 16,500 (shared ledger), and a new 2,200-character voice budget for the commentary.)
#
#   DRY=1 python3 tools/soccer-vo/render.py           what would be made, and what it would cost (no calls)
#   python3 tools/soccer-vo/render.py [vo|sfx|music]  make whatever's missing (skips files that exist)
#
# Writes audio/soccer/{vo,sfx,music}/*.mp3 and audio/soccer/index.json (what the game loads).
# Key: ~/.config/elevenlabs.key (chmod 600, never in the repo). Music + sfx go through
# tools/blitz-vo/el_audio.py (one ledger, one cap, shared with Blitz and Alert); voices are logged to
# tools/soccer-vo/tts_ledger.json and refused past TTS_CAP.
import os, sys, json, time, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'audio', 'soccer')
DRY = os.environ.get('DRY') == '1'
TTS_CAP = 2200              # characters (= credits, tags included) for the commentary (Chris, 2026-10-22)
TTS_LEDGER = os.path.join(HERE, 'tts_ledger.json')

# ---- the booth (ElevenLabs premade voices, used by id) ------------------------------------------------
# The key can't list voices (no voices_read permission), so these are premades known to the account:
# a British broadcaster pushed hard with v3 tags for the play-by-play, and a warm British storyteller
# for the co-commentator.
CAST = {
    'pbp': {'voice': 'onwK4e9ZLuTAKqWW03F9', 'who': 'Daniel (premade): British broadcaster, play-by-play', 'stab': 0.3},
    'col': {'voice': 'JBFqnCBsd6RMkjVDRZzb', 'who': 'George (premade): warm British, co-commentator', 'stab': 0.5},
}

# ---- the lines -----------------------------------------------------------------------------------------
# key: <who>|<EVENT>; every string is one file (the audio tags are part of the text, and billed).
PBP = {
    'KICKOFF':  ['[excited] And we\'re underway!', '[excited] Here we go!'],
    'GOAL':     ['[shouting] GOAL!', '[shouting] He scores! What a finish!', '[excited] It\'s in!'],
    'GOAL_GREAT': ['[shouting] OH, WHAT A STRIKE!', '[shouting] That is a worldie!'],
    'GOAL_HEADER': ['[shouting] Headed in! GOAL!', '[excited] What a header!'],
    'GOAL_PEN': ['[excited] Sends the keeper the wrong way!', '[excited] Cool as you like!'],
    'OWN_GOAL': ['[gasps] Oh no, into his own net!', '[shocked] An own goal!'],
    'EQUALISER': ['[shouting] They\'re level!', '[excited] The equaliser!'],
    'LATE_GOAL': ['[shouting] LATE DRAMA!', '[shouting] At the death!'],
    'SAVE':     ['[excited] Good save!', 'Kept out by the keeper.'],
    'SAVE_GREAT': ['[shouting] WHAT A SAVE!', '[excited] Fingertips! Magnificent!'],
    'MISS':     ['[groans] Just wide!', '[disappointed] Over the bar.'],
    'POST':     ['[shouting] Off the post!', '[excited] The woodwork!'],
    'BLOCKED':  ['[excited] Blocked!', 'Charged down.'],
    'TACKLE':   ['[excited] Great tackle!', 'Wins it back.'],
    'FOUL':     ['Free kick, that\'s a foul.', '[sighs] Clipped him there.'],
    'YELLOW':   ['That\'s a yellow card.', 'Into the book he goes.'],
    'RED':      ['[shocked] It\'s red! He\'s off!'],
    'PENALTY':  ['[shouting] PENALTY!', '[excited] He points to the spot!'],
    'OFFSIDE':  ['The flag is up. Offside.'],
    'CORNER':   ['Corner kick.', '[excited] Behind for a corner!'],
    'FREEKICK': ['Free kick, in a dangerous area.'],
    'HALFTIME': ['And that\'s half time.'],
    'FULLTIME_WIN': ['[excited] It\'s all over! They\'ve done it!', '[excited] Full time! The points are theirs!'],
    'FULLTIME_DRAW': ['Full time, and it ends all square.'],
    'CUP_FINAL_INTRO': ['[excited] Welcome to the Cup Final! The stage is set, and the Golden Nugget awaits!'],
    'CUP_WINNERS': ['[shouting] THEY HAVE WON THE CUP!'],
    'SHOOTOUT_START': ['[serious] So, it comes down to penalties.'],
    'SHOOTOUT_SCORE': ['[excited] Scores!', 'Buried it.'],
    'SHOOTOUT_MISS': ['[shouting] Saved!', '[groans] He\'s missed it!'],
}
TEAMS = {
    'rovers': 'Fry Valley Rovers', 'sauce': 'Sauce City', 'crumb': 'Crumb Athletic', 'dippers': 'Dippers United',
    'ranch': 'Ranch Wanderers', 'hash': 'Hash Brown Albion', 'curly': 'Curly Fry City', 'pickle': 'Pickle Park Rangers',
}
for _id, _name in TEAMS.items():
    PBP['TEAM_' + _id] = [f'[excited] {_name}!']
COL = {
    'GOAL':     ['[laughs] Oh, he enjoyed that.', 'Clinical. Absolutely clinical.', 'Defending there was soft as a fresh nugget.'],
    'SAVE':     ['Strong wrists from the keeper.', 'He read that all the way.'],
    'MISS':     ['[sighs] He\'ll have nightmares about that.', 'Has to hit the target.'],
    'TACKLE':   ['Timed to perfection.', 'Proper tackle, that.'],
    'FOUL':     ['[chuckles] Bit late, that.', 'He knew what he was doing.'],
    'HALFTIME': ['Plenty for both managers to think about.'],
    'FULLTIME_WIN': ['Deserved it, on the balance of play.', '[warmly] They\'ll enjoy the bus home.'],
    'IDLE':     ['Lovely evening for football.', 'Patient build-up here.', 'They need more width.', '[chuckles] Crowd are in good voice.'],
    'CUP_WINNERS': ['[warmly] What a moment. They\'ll remember this forever.'],
}

# ---- the soundtrack ---------------------------------------------------------------------------------------
MUSIC = [
    ('menu',   40, 'Upbeat anthemic indie electronic instrumental, euphoric stadium energy, driving four-on-the-floor drums, bright jangly guitars, big synth hook, hand claps, modern football video game menu soundtrack, seamless loop, 124 bpm'),
    ('goal',    6, 'Short triumphant stadium sting, punchy drums and a bright brass and synth hit, celebratory, football goal jingle'),
    ('cupwin', 10, 'Triumphant trophy fanfare, majestic brass and timpani with cymbal swells, glorious championship victory, short orchestral ending'),
]
LOOP_MUSIC = {'menu'}

SFX = [
    # crowd
    ('crowd1',   20, 'Big football stadium crowd ambience, steady murmur and cheering of tens of thousands of fans, no announcer, seamless loop'),
    ('crowd2',   20, 'Lively football stadium crowd atmosphere, excited fans, distant drums and claps, no announcer, seamless loop'),
    ('chant1',    8, 'Football stadium crowd chanting in unison, rhythmic wordless oh-oh-oh terrace song, thousands of fans'),
    ('chant2',    8, 'Football crowd singing a terrace anthem together, unintelligible words, stadium echo, clapping on the beat'),
    ('chant3',    8, 'Football fans chanting with drums and rhythmic clapping, wordless stadium chant, huge crowd'),
    ('roar',      6, 'Huge football stadium crowd erupting in a goal celebration roar, cheering and screaming'),
    ('ooh1',      3, 'Football stadium crowd groaning ooh at a near miss'),
    ('ooh2',      3, 'Big crowd gasp and disappointed aah after a shot just misses, football stadium'),
    ('applause',  4, 'Football stadium crowd applauding, clapping and light cheers'),
    ('boo',       4, 'Football stadium crowd booing the referee'),
    # referee
    ('whistle_short', 0.8, 'Single short sharp referee whistle blast, football'),
    ('whistle_long',  1.5, 'One long referee whistle blast, football'),
    ('whistle_end',   3,   'Referee blowing three whistle blasts for full time, short short long, football'),
    # ball
    ('kick_pass1', 0.5, 'Football boot passing a soccer ball, short thump, close'),
    ('kick_pass2', 0.5, 'Soft side-foot pass of a soccer ball on grass, single kick'),
    ('kick_shot1', 0.7, 'Powerful hard strike of a soccer ball, loud thwack'),
    ('kick_shot2', 0.7, 'Football striker blasting a shot, hard leather ball kick, punchy'),
    ('header',     0.5, 'Soccer ball headed, a dull thud off a forehead'),
    ('net',        1.5, 'Soccer ball hitting and rippling the goal net, swish of netting'),
    ('post',       1,   'Soccer ball hitting the metal goal post, ringing clang'),
    ('bounce',     0.5, 'Single soccer ball bounce on grass'),
    # players
    ('tackle',     0.7, 'Football tackle, bodies colliding and a boot hitting the ball, grunt'),
    ('slide',      1,   'Football slide tackle across wet grass, sliding swoosh'),
    ('catch',      0.6, 'Goalkeeper gloves catching a soccer ball, firm padded slap'),
]

def tts_ledger():
    return json.load(open(TTS_LEDGER)) if os.path.exists(TTS_LEDGER) else {'cap': TTS_CAP, 'spent': 0, 'calls': []}

def tts(voice, text, stab, dest):
    L = tts_ledger()
    if L['spent'] + len(text) > TTS_CAP:
        raise SystemExit(f'BUDGET: {text!r} would pass the {TTS_CAP}-character voice cap ({L["spent"]} spent). Ask Chris first.')
    key = open(os.path.expanduser('~/.config/elevenlabs.key')).read().strip()
    body = json.dumps({'text': text, 'model_id': 'eleven_v3', 'voice_settings': {'stability': stab}}).encode()
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_64', data=body,
                                 headers={'xi-api-key': key, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        raw, cost = r.read(), r.headers.get('character-cost')
    open(dest, 'wb').write(raw)
    c = float(cost) if cost else len(text)
    L['spent'] = round(L['spent'] + c, 1)
    L['calls'].append({'t': time.strftime('%Y-%m-%d %H:%M'), 'voice': voice, 'text': text, 'credits': c, 'file': os.path.basename(dest)})
    json.dump(L, open(TTS_LEDGER, 'w'), indent=1)
    print(f'  vo {os.path.basename(dest)} {c:.0f} cr  (voices total {L["spent"]:.0f}/{TTS_CAP})', flush=True)

def slug(s): return ''.join(c.lower() if c.isalnum() else '-' for c in s).strip('-')

def plan():
    """every file the game wants: (kind, file, what to send, est. credits, meta)"""
    jobs = []
    for who, table in (('pbp', PBP), ('col', COL)):
        C = CAST[who]
        for ev, lines in table.items():
            for i, line in enumerate(lines):
                jobs.append(('vo', f'vo/{who}-{slug(ev)}-{i}.mp3', (C['voice'], line, C['stab']), len(line), {'key': f'{who}|{ev}'}))
    for name, secs, prompt in MUSIC:
        jobs.append(('music', f'music/{name}.mp3', (prompt, secs), secs * 12.5, {'key': name, 'loop': name in LOOP_MUSIC}))
    for name, secs, prompt in SFX:
        jobs.append(('sfx', f'sfx/{name}.mp3', (prompt, secs), secs * 10, {'key': name}))
    return jobs

def index(jobs):
    """the manifest the game reads: only files that exist"""
    I = {'v': int(time.time()), 'vo': {}, 'music': {}, 'sfx': {}}
    for kind, f, _, _, meta in jobs:
        if not os.path.exists(os.path.join(OUT, f)): continue
        if kind == 'vo': I['vo'].setdefault(meta['key'], []).append(f)
        elif kind == 'music': I['music'][meta['key']] = {'file': f, 'loop': meta['loop']}
        else: I['sfx'][meta['key']] = f
    json.dump(I, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
    return I

def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    jobs = [j for j in plan() if not only or j[0] == only]
    todo = [j for j in jobs if not os.path.exists(os.path.join(OUT, j[1]))]
    est = {k: sum(j[3] for j in todo if j[0] == k) for k in ('vo', 'music', 'sfx')}
    print(f'{len(todo)} of {len(jobs)} files to make · est. credits: voices {est["vo"]:.0f}, music {est["music"]:.0f}, sfx {est["sfx"]:.0f} · total {sum(est.values()):.0f}')
    print('cast:'); [print(f'  {k:4} {c["who"]}') for k, c in CAST.items()]
    # check both caps before anything is made
    vo_spent = tts_ledger()['spent']
    if vo_spent + est['vo'] > TTS_CAP:
        raise SystemExit(f'BUDGET: voices would reach {vo_spent + est["vo"]:.0f} of {TTS_CAP}. Nothing rendered; ask Chris.')
    el_path = os.path.join(ROOT, 'tools', 'blitz-vo', 'el_ledger.json')
    shared = json.load(open(el_path))['spent'] if os.path.exists(el_path) else 0
    print(f'voices: {vo_spent:.0f} spent + {est["vo"]:.0f} = {vo_spent + est["vo"]:.0f} of {TTS_CAP} · '
          f'music+sfx (shared): {shared:.0f} spent + {est["music"] + est["sfx"]:.0f} = {shared + est["music"] + est["sfx"]:.0f} of 16500')
    if DRY:
        for j in todo[:8]: print('  e.g.', j[0], j[1], '←', str(j[2][0] if j[0] != 'vo' else j[2][1])[:90])
        return
    for d in ('vo', 'music', 'sfx'): os.makedirs(os.path.join(OUT, d), exist_ok=True)
    sys.path.insert(0, os.path.join(ROOT, 'tools', 'blitz-vo'))
    import el_audio    # (reads the key; music + sfx share Blitz's ledger and its cap)
    if shared + est['music'] + est['sfx'] > el_audio.CAP:
        raise SystemExit(f'BUDGET: music + sfx would pass the shared {el_audio.CAP} cap. Nothing rendered; ask Chris.')
    for kind, f, what, _, meta in todo:
        dest = os.path.join(OUT, f)
        try:
            if kind == 'vo': tts(*what, dest)
            elif kind == 'music': el_audio.music(what[0], what[1], dest)
            else: el_audio.sfx(what[0], what[1], dest)
        except urllib.error.HTTPError as e:
            body = e.read()[:300]
            print(f'  FAILED {f}: {e.code} {body!r}', flush=True)
            # a bad key fails every call the same way: stop at the first one
            if e.code in (401, 403) or b'invalid_api_key' in body or b'authentication' in body:
                raise SystemExit('the ElevenLabs key was refused; nothing was rendered after this point')
        index(plan())
    I = index(plan())
    print(f'index: {sum(len(v) for v in I["vo"].values())} voice takes · {len(I["music"])} songs · {len(I["sfx"])} sounds')

if __name__ == '__main__':
    main()
