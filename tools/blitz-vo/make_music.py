# Nugget Blitz soundtrack (funk-rock, Chris's pick 2026-10-09) + stingers + crowd, through the budgeted wrapper.
# Raw downloads land in music_src/ (gitignored); build_music.py turns them into the game's loops.
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
import concurrent.futures as cf
import el_audio as A
STYLE = ('90s funk-rock for an arcade football video game. Slap bass, wah guitar, tight funky drums, a punchy brass horn '
         'section with stabs, stadium organ hits. Instrumental, no vocals.')
LOOP = ' A steady groove that keeps going: no intro, no fade, no ending, so it can loop.'
MUSIC = {
 'theme': (45, STYLE + ' The main menu theme: the catchiest hook of the soundtrack, confident swagger, 110 BPM.' + LOOP),
 'q1':    (45, STYLE + ' First quarter: upbeat and fun, bouncing groove, horns trading riffs with the guitar, 115 BPM.' + LOOP),
 'q2':    (45, STYLE + ' Second quarter: a strutting, swaggering groove, fat clavinet, horn swells, 104 BPM.' + LOOP),
 'q3':    (45, STYLE + ' Third quarter: harder and grittier, more distortion on the guitar, driving drums, 120 BPM.' + LOOP),
 'q4':    (45, STYLE + ' Fourth quarter crunch time: the most intense track, fast and urgent, screaming horns, heavy riffs, 132 BPM.' + LOOP),
 'half':  (40, 'Funky marching band halftime show for an arcade football video game: drumline, sousaphone bass, a big brass section playing a funk groove, stadium feel. Instrumental, no vocals.' + LOOP),
 'win':   (15, STYLE + ' Victory: a triumphant, celebratory funk-rock fanfare that builds and ends on one big final hit.'),
 'lose':  (12, STYLE + ' Defeat: deflated and sad, slow, a lonely brass line that droops and fizzles out to an ending.'),
}
SFX = {
 'st-td':       (3, 'Funky brass horn section fanfare, triumphant ta-da, with a drum fill and a cymbal crash'),
 'st-first':    (2, 'Short upbeat funky brass horn stab, two quick notes'),
 'st-sack':     (2, 'Descending electric guitar dive bomb with a wah, ending on a cymbal crash'),
 'st-int':      (2, 'Dramatic brass hit of surprise, dun-dunnn'),
 'st-fire':     (3, 'Screaming funk wah guitar lick with a rising brass swell, on fire'),
 'st-charge':   (3, 'Stadium organ playing the classic six-note charge bugle call, crowd shouts CHARGE at the end'),
 'st-trombone': (3, 'Sad trombone, wah wah wah waaah'),
 'st-big':      (2, 'Dramatic brass and timpani hit, dun dunnn'),
 'st-heat':     (2, 'Fast funky organ trill rising in pitch'),
 'st-roll':     (2, 'Marching snare drum roll building up into a cymbal crash'),
 'cr-aww':      (3, 'Big stadium crowd groaning AWWW in disappointment'),
 'cr-boo':      (3, 'Big stadium crowd booing loudly'),
 'cr-yeah':     (3, 'Big stadium crowd cheering YEAH and clapping after a good play'),
 'cr-clap':     (3, 'Stadium crowd clapping together in rhythm'),
 'cr-bed':      (15, 'Steady ambient murmur of a huge football stadium crowd between plays, chatter and distant shouts, constant level'),
}
jobs = [('m', k, s, p) for k, (s, p) in MUSIC.items()] + [('s', k, s, p) for k, (s, p) in SFX.items()]
jobs = [j for j in jobs if not os.path.exists(f'music_src/{j[1]}.mp3')]
est = sum(s * (A.MUSIC_PER_SEC if t == 'm' else A.SFX_PER_SEC) for t, k, s, p in jobs)
print(len(jobs), 'to make, ~', round(est), 'credits; spent so far', A.spent(), flush=True)
if A.spent() + est > A.CAP: raise SystemExit('over budget, stopping')
def go(j):
    t, k, s, p = j
    try:
        (A.music if t == 'm' else A.sfx)(p, s, f'music_src/{k}.mp3'); return k, None
    except BaseException as e: return k, repr(e)[:300]
with cf.ThreadPoolExecutor(2) as ex:
    for k, err in ex.map(go, jobs):
        if err: print('FAIL', k, err, flush=True)
print('spent', A.spent())
