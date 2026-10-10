# Nugget Cricket's soundtrack + sounds, made ONCE through the budgeted wrapper (tools/blitz-vo/el_audio.py:
# logged to el_ledger.json, refused past the cap). Raw downloads → src/ (gitignored); build_audio.py makes the game files.
import os, sys; os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join('..', 'blitz-vo'))
import el_audio as A
MUSIC = {
 'match': (40, 'Upbeat IPL-style cricket stadium anthem for an arcade video game: dhol drums, punchy brass stabs, a bright electric guitar riff, claps, festival energy. Instrumental, no vocals. A steady groove that keeps going: no intro, no fade, no ending, so it can loop.'),
 'win':   (10, 'Triumphant festive brass and dhol victory fanfare for a cricket video game, ending on a big final hit. Instrumental, no vocals.'),
 'lose':  (8,  'Short deflated brass sting for losing a cricket match in a video game, a sad descending line that fizzles out. Instrumental, no vocals.'),
}
SFX = {
 'bat':       (1, 'A cricket bat striking a leather cricket ball cleanly, a sharp loud wooden crack'),
 'edge':      (1, 'A cricket ball taking a thin edge off the bat, a quick light wooden click'),
 'stumps':    (2, 'Cricket stumps being knocked over by the ball, wooden stumps and bails clattering'),
 'catch':     (1, 'A hard leather cricket ball slapping into a fielder\'s hands, a solid thud'),
 'pad':       (1, 'A cricket ball thudding into a batsman\'s leg pad, a dull padded thump'),
 'four':      (2, 'Short bright brass sting for hitting a four in a cricket video game'),
 'six':       (3, 'Big triumphant brass and dhol sting with an air horn for a six in a cricket video game'),
 'wicket':    (2, 'Dramatic drum hit and brass stab for taking a wicket in a cricket video game'),
 'cr-roar':   (3, 'Huge cricket stadium crowd erupting in cheers after a six, air horns and drums'),
 'cr-aww':    (2, 'Big stadium crowd groaning in disappointment'),
 'cr-appeal': (2, 'Cricket fielders and crowd loudly appealing HOWZAT together'),
}
jobs = [('m', k, s, p) for k, (s, p) in MUSIC.items()] + [('s', k, s, p) for k, (s, p) in SFX.items()]
jobs = [j for j in jobs if not os.path.exists(f'src/{j[1]}.mp3')]
est = sum(s * (A.MUSIC_PER_SEC if t == 'm' else A.SFX_PER_SEC) for t, k, s, p in jobs)
print(len(jobs), 'to make, ~', round(est), 'credits; music/sfx spent so far', A.spent(), flush=True)
for t, k, s, p in jobs:
    try: (A.music if t == 'm' else A.sfx)(p, s, f'src/{k}.mp3')
    except BaseException as e: print('FAIL', k, repr(e)[:200], flush=True)
print('spent', A.spent())
