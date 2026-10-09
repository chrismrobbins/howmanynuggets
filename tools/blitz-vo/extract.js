// every line the game can say, from the game's own tables (so nothing drifts)
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const fs = require('fs');
(async () => {
  const b = await puppeteer.launch({ headless: 'new' });
  const pg = await b.newPage();
  await pg.goto('http://localhost:8787/', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 400));
  const L = await pg.evaluate(() => {
    const L = [];
    const add = (who, text, team, cat) => L.push({ who, text, team: team || '', cat: cat || '' });
    for (const k in BLZ_CALLS) for (const t of BLZ_CALLS[k]) add('pbp', t, '', 'call:' + k);
    for (const k in BLZ_PBP) for (const t of BLZ_PBP[k]) add('pbp', t, '', 'sit:' + k);
    for (const k in BLZ_MOVES) for (const t of BLZ_MOVES[k].say) add('pbp', t, '', 'move:' + k);
    for (const k in BLZ_COLOR) for (const t of BLZ_COLOR[k]) add('color', t, '', 'color:' + k);
    ['ONSIDE KICK!', 'FAKE PUNT!', "IT'S A FAKE!", "IT'S TIPPED!", 'UP FOR GRABS!', 'FROM THE TOP ROPE!', 'ELBOW DROP!', 'OH, THE ELBOW!',
      'TWO POINTS!', 'SAFETY!', 'THAT IS HALFTIME!', 'HALFTIME HERE AT THE FRYER!', 'LOOK AT HIM SHOWBOAT!', "HE'S DANCING IN!",
      'THE THIRTY!', 'THE TWENTY!', 'THE TEN!', 'A TIE. NOBODY IS HAPPY.',
      'WHAT A HUGE GAIN!', 'HE IS GOING TO RUN ALL DAY!', 'THAT IS A MONSTER GAIN!', 'BIG GAIN!', 'A HUGE CHUNK OF YARDAGE!', 'HE IS EATING UP YARDS!', 'WHAT A PICKUP!',
      'LOSING YARDAGE!', 'HE GOES BACKWARDS!', 'DROPPED FOR A LOSS!'].forEach((t) => add('pbp', t));
    ['LOOK AT THIS!', 'OH, HE IS FEELING IT!', 'CELEBRATION TIME!', 'GET A PICTURE OF THIS!'].forEach((t) => add('color', t));
    for (const k of BLZ_TEAM_ORDER) {
      const T = BLZ_TEAMS[k];
      add('pbp', T.full + '!', '', 'team'); add('pbp', 'WHAT A GAME! ' + T.full + ' WIN IT!', '', 'win'); add('pbp', T.full + ' WIN IT.', '', 'lose');
      for (const pos of ['WR1', 'WR2', 'RB', 'QB']) add('pbp', blzCallName({ name: BLZ_ROSTER[k][pos][0] }) + ' WITH THE CATCH!', '', 'catchname');
      const cad = BLZ_FLAVOR[k].cad;
      for (const n of BLZ_CAD_NUMS) add('qb', cad + ' ' + n + '!', k, 'cad');
      add('qb', 'SET!', k, 'set'); add('qb', 'HUT!', k, 'hut');
      for (const t of blzTrashPool(k)) add('player', t, k, 'trash');
    }
    for (const c of BLZ_CODES) add('pbp', c.name + '!', '', 'code');
    return L;
  });
  // one entry per (voice scope, normalized text)
  const norm = (t) => t.toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const seen = new Map();
  for (const l of L) {
    const scope = l.who === 'pbp' || l.who === 'color' ? l.who : l.who + ':' + l.team;
    const key = scope + '|' + norm(l.text);
    if (!seen.has(key)) seen.set(key, Object.assign({ key, scope }, l));
  }
  const out = [...seen.values()];
  fs.writeFileSync(require('path').join(__dirname, 'lines.json'), JSON.stringify(out, null, 1));
  const by = {};
  for (const l of out) by[l.who] = (by[l.who] || 0) + 1;
  console.log(out.length, 'lines', JSON.stringify(by));
  await b.close();
})();
