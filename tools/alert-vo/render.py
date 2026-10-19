# Nugget Alert's voices, music and sound effects, rendered ONCE with ElevenLabs and shipped as files.
# The game never calls ElevenLabs; playing costs nothing. (Chris, 2026-10-19: "do the voices and music
# first using elevenlabs" · budget: music + sfx cap raised to 14,000 · "you choose" the voices · tone:
# "straight RA2, nugget words" — played completely seriously, the jokes are in the words.)
#
#   DRY=1 python3 tools/alert-vo/render.py      what would be made, and what it would cost (no key needed)
#   python3 tools/alert-vo/render.py [vo|sfx|music]   make whatever's missing (skips files that exist)
#
# Writes audio/alert/{vo,sfx,music}/*.mp3 and audio/alert/index.json (what the game loads).
# Key: ~/.config/elevenlabs.key (chmod 600, never in the repo). Music + sfx go through
# tools/blitz-vo/el_audio.py (one ledger, one cap, shared with Blitz); voices are logged to
# tools/alert-vo/tts_ledger.json and refused past TTS_CAP.
import os, sys, json, time, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'audio', 'alert')
DRY = os.environ.get('DRY') == '1'
TTS_CAP = 3500              # characters (= credits) for Nugget Alert's voices, from the plan Chris approved (~3,100)
TTS_LEDGER = os.path.join(HERE, 'tts_ledger.json')

# ---- the cast (library voices, used by id) ----------------------------------------------------------
# Battle Control is a calm, clipped British woman (the computer that runs your base); the soldiers are
# the gruff, the tough and the tired. Four of these already speak in Nugget Blitz and were picked by ear.
CAST = {
    # (Chris, same day: "make the announcer grittier" — a cold, hard, gravelly delivery, less stable; the game
    # also runs her through a battlefield radio chain, js/alertAudio.js)
    'eva':    {'voice': 'Xb7hH8MSUJpSbSDYk0k2', 'who': 'Alice — confident British (ElevenLabs premade), delivered gritty', 'stab': 0.25, 'tag': '[cold, stern, gravelly]'},
    'inf':    {'voice': 'DGzg6RaUqxGRTHSBjfgF', 'who': 'Brock — commanding, loud sergeant (Blitz: the Nugs)', 'stab': 0.3, 'tag': '[eager]'},
    'rocket': {'voice': 'IRHApOXLvnW57QJPQH2P', 'who': 'Adam — American, dark and tough (Blitz: Curly Fries)', 'stab': 0.35, 'tag': '[confident]'},
    'tank':   {'voice': '2EiwWnXFnvU5JabPnv8n', 'who': 'Clyde — war veteran (ElevenLabs premade)', 'stab': 0.35, 'tag': '[gruff]'},
    'heavy':  {'voice': 'Bj9UqZbhQsanLzgalpEG', 'who': 'Austin — deep, raspy (Blitz: Sauce Bosses)', 'stab': 0.3, 'tag': '[menacing]'},
    'harv':   {'voice': 'Av4Fi2idMFuA8kTbVZgv', 'who': 'Russel — raw cowboy (Blitz: Ranch Hands)', 'stab': 0.4, 'tag': '[relaxed]'},
    # phase 1 (2026-10-19): the two armies. Alliance units are crisp; the Federation's carry a Russian accent tag.
    'engineer':  {'voice': 'IKne3meq5aSn9XLyUdCD', 'who': 'Charlie (premade)', 'stab': 0.4, 'tag': '[cheerful]'},
    'jetpack':   {'voice': 'zCgijgIKIMkFHnzXcCva', 'who': 'Brad — energetic, rushed (Blitz: Honey Mustards)', 'stab': 0.3, 'tag': '[excited]'},
    'ifv':       {'voice': 'TX3LPaxmHKxFdv7VOQHJ', 'who': 'Liam (premade)', 'stab': 0.4, 'tag': '[focused]'},
    'prismtank': {'voice': 'onwK4e9ZLuTAKqWW03F9', 'who': 'Daniel (premade)', 'stab': 0.45, 'tag': '[precise]'},
    'mirage':    {'voice': 'bIHbv24MWmeRgasZH58o', 'who': 'Will (premade)', 'stab': 0.45, 'tag': '[sly]'},
    'jet':       {'voice': 'iP95p4xoKVk53GoZ742B', 'who': 'Chris (premade), a pilot on the radio', 'stab': 0.35, 'tag': '[pilot]'},
    'conscript': {'voice': 'N2lVS1w4EtoT3dr4eOWO', 'who': 'Callum (premade)', 'stab': 0.35, 'tag': '[Russian accent]'},
    'zapper':    {'voice': 'wXvR48IpOq9HACltTmt7', 'who': 'Dante — growly (Blitz: Onion Rings)', 'stab': 0.3, 'tag': '[growling]'},
    'flaktrack': {'voice': 'pqHfZKP75CvOlQylNhV4', 'who': 'Bill (premade)', 'stab': 0.35, 'tag': '[Russian accent]'},
    'harvF':     {'voice': 'QzTKubutNn9TjrB7Xb2Q', 'who': 'Jerry B. — gruff (Blitz: Tater Tots)', 'stab': 0.4, 'tag': '[gruff]'},
    'v3':        {'voice': 'nPczCjzI2devNBz1zQrb', 'who': 'Brian (premade)', 'stab': 0.35, 'tag': '[Russian accent]'},
    'apoc':      {'voice': 'mSOmKHC6GZcZbSTGlqHO', 'who': 'Mister Gruff (Blitz: colour)', 'stab': 0.3, 'tag': '[booming]'},
    'blimp':     {'voice': 'ysswSXp8U9dFpzPJqFje', 'who': 'Azazel — deep, gravelly (Blitz: Fry Gods)', 'stab': 0.3, 'tag': '[deep, slow]'},
}

# ---- the lines -----------------------------------------------------------------------------------------
# key: what the game asks for. Battle Control's keys are the exact on-screen messages (alrSay text).
# Units: <type>:<when>, when = select | move | attack. Each unit line gets TAKES takes.
EVA = {
    'BATTLE CONTROL ONLINE': 'Battle control online.',
    'BUILDING': 'Building.',
    'CONSTRUCTION COMPLETE': 'Construction complete.',
    'TRAINING': 'Training.',
    'UNIT READY': 'Unit ready.',
    'LOW POWER': 'Low power.',
    'INSUFFICIENT FUNDS': 'Insufficient funds.',
    'OUR BASE IS UNDER ATTACK': 'Our base is under attack.',
    'UNIT UNDER ATTACK': 'Unit under attack.',
    'HARVESTER UNDER ATTACK': 'Sauce hauler under attack.',
    'BUILDING LOST': 'Building lost.',
    'UNIT LOST': 'Unit lost.',
    'ON HOLD': 'On hold.',
    'CANCELED': 'Canceled.',
    'BUILDING SOLD': 'Building sold.',
    'REPAIRING': 'Repairing.',
    'CANNOT DEPLOY HERE': 'Cannot deploy here.',
    'NEW CONSTRUCTION OPTIONS': 'New construction options.',
    'RADAR ONLINE': 'Radar online.',
    'RADAR OFFLINE': 'Radar offline.',
    'ENEMY BUILDING DESTROYED': 'Enemy structure destroyed.',
    'MISSION ACCOMPLISHED': 'Mission accomplished. The Fry Federation has been deep-fried.',
    'MISSION FAILED': 'Mission failed.',
    'BUILDING CAPTURED': 'Building captured.',
    'OUR BUILDING HAS BEEN CAPTURED': 'Our building has been captured.',
    'UNIT PROMOTED': 'Unit promoted.',
    'BUILDING REPAIRED': 'Building repaired.',
}
UNITS = {
    'inf': {
        'select': ['Nug Trooper, reporting!', 'Breaded and ready!', 'Yes, sir!', 'Standing by!'],
        'move':   ['Moving out!', 'On the double!', 'Roger that!', 'Going crispy!'],
        'attack': ['Open fire!', 'Light \'em up!', 'Fry \'em!'],
    },
    'rocket': {
        'select': ['Rocket Nug.', 'Got a sauce rocket with your name on it.', 'Ready to launch.'],
        'move':   ['On my way.', 'Repositioning.', 'Copy that.'],
        'attack': ['Target locked.', 'Rocket away!', 'Dip this!'],
    },
    'tank': {
        'select': ['Breaded Tank, ready to roll.', 'Armor\'s extra crispy.', 'Tank here.'],
        'move':   ['Rolling out.', 'Moving.', 'Treads turning.'],
        'attack': ['Fire!', 'Target acquired.', 'Main gun, fire!'],
    },
    'heavy': {
        'select': ['Deep Fryer online.', 'The oil is hot.', 'Heavy armor, ready.'],
        'move':   ['Advancing.', 'Heavy armor moving.', 'Clear the road.'],
        'attack': ['Deep fry them.', 'Both barrels!', 'Into the fryer!'],
    },
    'harv': {
        'select': ['Sauce Hauler.', 'Ready to haul.', 'Load\'s riding light, boss.'],
        'move':   ['Heading out.', 'Gotcha.', 'On the road.'],
        'attack': ['Hauling sauce.', 'Back to the field.'],
    },
    # phase 1: two to select, two to move, one to attack (lean: tags are billed too)
    'engineer':  {'select': ['Fry Cook here.', 'Need something fixed?'], 'move': ['On my way.', 'Coming through, hot pan!'], 'attack': ['I\'ll take it from here.']},
    'jetpack':   {'select': ['Jetpack Nug!', 'Ready to fly!'], 'move': ['Taking off!', 'Up, up and away!'], 'attack': ['Strafing run!']},
    'ifv':       {'select': ['IFV ready.', 'Missiles armed.'], 'move': ['Moving.', 'On the move.'], 'attack': ['Missiles away!']},
    'prismtank': {'select': ['Prism Fry, charged.', 'Light it up?'], 'move': ['Adjusting position.', 'Moving.'], 'attack': ['Focusing beam!']},
    'mirage':    {'select': ['Mirage Nug.', 'Now you see me.'], 'move': ['Relocating.', 'Blending in.'], 'attack': ['Surprise!']},
    'jet':       {'select': ['Nug Jet, standing by.', 'Ready for launch.'], 'move': ['Wheels up.', 'Airborne.'], 'attack': ['Target in sight. Weapons free.']},
    'conscript': {'select': ['Tater Conscript!', 'For the Federation!'], 'move': ['Moving out!', 'Da, comrade!'], 'attack': ['For the Fryer!']},
    'zapper':    {'select': ['Zap Nug, charged.', 'Fully grounded.'], 'move': ['Moving.', 'Shocking pace.'], 'attack': ['Feel the current!']},
    'flaktrack': {'select': ['Flak Track ready.', 'Eyes on the sky.'], 'move': ['Rolling.', 'Da.'], 'attack': ['Flak up!']},
    'harvF':     {'select': ['War Hauler.', 'Got sauce?'], 'move': ['Moving out.', 'Yeah, yeah.'], 'attack': ['Back to work.']},
    'v3':        {'select': ['V3 ready.', 'Rockets loaded.'], 'move': ['Repositioning.', 'Moving.'], 'attack': ['Launching!']},
    'apoc':      {'select': ['Family Size, ready.', 'Extra large.'], 'move': ['Coming through.', 'Make way.'], 'attack': ['Supersize them.']},
    'blimp':     {'select': ['Gravy Blimp reporting.', 'Bombardiers to your stations.'], 'move': ['Setting course.', 'Maneuver props engaged.'], 'attack': ['Bombs away.']},
}
# (one take each: every pool already has 3–4 different lines, and audio tags are billed as characters)
TAKES = 1

# ---- the soundtrack ---------------------------------------------------------------------------------------
# Original instrumentals in the spirit of an early-2000s RTS (industrial rock/electro, marching drums), named
# for what they do in the game. The game loops them with a crossfade, so endings don't matter.
MUSIC = [
    ('menu',    40, 'Brooding industrial electronic instrumental, slow heavy analog synth bass, distant marching snare, low metallic hits, military command-center tension, dark and cinematic, 90 bpm'),
    ('build',   55, 'Driving mid-tempo industrial electro-rock instrumental, pulsing synth bass, tight drum machine, muted distorted guitar chugs, focused and determined, military base building, 118 bpm'),
    ('battle',  55, 'Aggressive industrial metal instrumental, chugging heavily distorted guitars, pounding marching drums, synth stabs and alarms, relentless war march, 138 bpm'),
    ('final',   55, 'Relentless fast industrial techno-metal instrumental, double-kick drums, screaming synth leads, heavy guitars, epic final assault, 150 bpm'),
    ('victory', 12, 'Triumphant short military industrial rock fanfare, big drums and power chords, a heroic ending'),
    ('defeat',  12, 'Short somber industrial ending, slow low synth drone, a single distant snare roll, defeat'),
]

# ---- sound effects (each is one file the game plays for that event) -------------------------------------------
SFX = [
    ('rifle',   0.6, 'Short burst of three rifle shots, outdoor, punchy, video game'),
    ('cannon',  1.2, 'Tank cannon firing, deep boom with a sharp crack, outdoor, video game'),
    ('heavy',   1.5, 'Two heavy tank cannons firing one after the other, huge booming blasts, video game'),
    ('rocket',  1.2, 'Shoulder-fired rocket launch, whoosh and hiss, video game'),
    ('zap',     1.5, 'Tesla coil electric discharge, crackling high-voltage lightning zap with a buzzing hum, video game'),
    ('boomS',   1.5, 'Small explosion, shell impact on the ground with debris, video game'),
    ('boomL',   2.5, 'Large vehicle explosion, fiery blast with metal debris raining down, video game'),
    ('place',   1.2, 'Heavy prefabricated building slamming into place, deep metal clank and hydraulic hiss, video game'),
    ('cash',    1.0, 'Coins and credits counted into a register, quick digital cash ding, video game'),
    ('squish',  0.8, 'Short soft crunchy splat, a chicken nugget being squashed, cartoon, video game'),
    ('alarm',   2.0, 'Military base alarm klaxon, two short blasts, video game'),
    ('build',   1.5, 'Construction sparks, welding and power tools, short, video game'),
    ('sell',    1.2, 'Mechanical deconstruction, metal panels unbolting and lowering, video game'),
    # phase 1
    ('bark',    0.8, 'Two quick aggressive dog barks, video game'),
    ('jet',     1.5, 'Fighter jet fast flyby whoosh roar, video game'),
    ('prism',   1.2, 'Bright crystalline laser beam firing, a shimmering high-energy zap, video game'),
    ('flak',    1.0, 'Anti-aircraft flak bursts, rapid thumping cannon shots popping in the sky, video game'),
    ('chrono',  1.2, 'Science-fiction teleport, a warping whoosh with a crackle, video game'),
    ('bomb',    1.8, 'Falling bomb whistle then a heavy explosion, video game'),
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

def plan():
    """every file the game wants: (kind, file, what to send, est. credits, meta)"""
    jobs = []
    for k, line in EVA.items():
        C = CAST['eva']
        jobs.append(('vo', f'vo/eva-{slug(k)}.mp3', (C['voice'], f'{C["tag"]} {line}', C['stab']), len(C['tag']) + 1 + len(line), {'key': 'eva|' + k}))
    for u, whens in UNITS.items():
        C = CAST[u]
        for when, lines in whens.items():
            for i, line in enumerate(lines):
                for t in range(TAKES):
                    jobs.append(('vo', f'vo/{u}-{when}-{i}-{t}.mp3', (C['voice'], f'{C["tag"]} {line}', C['stab']), len(C['tag']) + 1 + len(line), {'key': f'{u}:{when}', 'line': line}))
    for name, secs, prompt in MUSIC:
        jobs.append(('music', f'music/{name}.mp3', (prompt, secs), secs * 12.5, {'key': name, 'loop': name not in ('victory', 'defeat')}))
    for name, secs, prompt in SFX:
        jobs.append(('sfx', f'sfx/{name}.mp3', (prompt, secs), secs * 10, {'key': name}))
    return jobs

def slug(s): return ''.join(c.lower() if c.isalnum() else '-' for c in s).strip('-')

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
    print('cast:'); [print(f'  {k:7} {c["who"]}') for k, c in CAST.items()]
    if DRY:
        for j in todo[:8]: print('  e.g.', j[0], j[1], '←', str(j[2][0] if j[0] != 'vo' else j[2][1])[:90])
        return
    for d in ('vo', 'music', 'sfx'): os.makedirs(os.path.join(OUT, d), exist_ok=True)
    sys.path.insert(0, os.path.join(ROOT, 'tools', 'blitz-vo'))
    import el_audio    # (reads the key; music + sfx share Blitz's ledger and its cap)
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
                raise SystemExit('the ElevenLabs key was refused — nothing was rendered after this point')
        index(jobs if not only else plan())
    I = index(plan())
    print(f'index: {sum(len(v) for v in I["vo"].values())} voice takes · {len(I["music"])} songs · {len(I["sfx"])} sounds')

if __name__ == '__main__':
    main()
