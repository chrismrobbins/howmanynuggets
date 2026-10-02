import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))  # run from anywhere: inputs/outputs sit next to the script
exec(open('variants.py').read().split('JOBS = []')[0])
best = json.load(open('overrides.json'))
for tm in ['frygods', 'bosses', 'mustard', 'curly', 'tots', 'nugs']:
    v, sp = TEAM_VOICE[tm]
    cands = [('Ready, hike!', sp), ('Hike the ball!', sp), ('Hut, hike!', 0.95), ('Hut! Hut! Hike!', 0.95), ('Hike! Hike!', 1.0), ('Hut! Hike!', 0.92)]
    res = []
    for c, s_ in cands:
        (w, hyp) = score(v, s_, c, tries=3)
        res.append((w, c, s_, hyp))
    res.sort(key=lambda r: r[0])
    w, c, s_, hyp = res[0]
    print(tm, '->', repr(c), s_, round(w, 2), '|', hyp, '| others:', [(r[1], round(r[0], 2)) for r in res[1:]], flush=True)
    best['qb:' + tm + '|HUT'] = c
    best['_speed:qb:' + tm + '|HUT'] = s_
json.dump(best, open('overrides.json', 'w'), indent=1)
