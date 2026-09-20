import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveFightEvents, fightEvents, isFightingMajor } from '../src/lib/fights.js';
import { markers, seek, sliceCast } from '../src/components/replay.js';

const game = {
  id: '2026010999',
  teams: { away: { abbrev: 'SJS', score: 0, sog: 0 }, home: { abbrev: 'ANA', score: 0, sog: 0 } },
  status: { semantics: 'FINAL', period: 3, period_type: 'REG', clock: '00:00' }
};

const major = (side, sort, id, name, number, opponentId, opponentName) => ({
  event_id: sort,
  sort_order: sort,
  type: 'penalty',
  kind: 'penalty',
  period: 2,
  period_type: 'REG',
  time_in_period: '11:42',
  time_remaining: '08:18',
  elapsed_s: 1902,
  situation_code: '1441',
  side,
  players: [
    { role: 'committed_by', id, name, number, side },
    { role: 'drawn_by', id: opponentId, name: opponentName, number: null, side: side === 'away' ? 'home' : 'away' }
  ],
  penalty: { severity: 'MAJ', desc_key: 'fighting', duration_min: 5 },
  shot: null
});

const plays = [
  major('away', 100, 1, 'Shark Fighter', 44, 2, 'Duck Fighter'),
  major('home', 101, 2, 'Duck Fighter', 55, 1, 'Shark Fighter'),
  {
    event_id: 102, sort_order: 102, type: 'stoppage', kind: 'stoppage',
    period: 2, period_type: 'REG', time_in_period: '11:45', time_remaining: '08:15',
    elapsed_s: 1905, situation_code: '1441', side: null, players: [], shot: null
  }
];

test('paired opposing fighting majors become one fight event', () => {
  assert.equal(isFightingMajor(plays[0]), true);
  const fights = deriveFightEvents(plays, game);
  assert.equal(fights.length, 1);
  assert.equal(fights[0].first_sort_order, 100);
  assert.equal(fights[0].last_sort_order, 101);
  assert.equal(fights[0].fighters[0].team_abbrev, 'SJS');
  assert.equal(fights[0].fighters[1].team_abbrev, 'ANA');
  assert.equal(fights[0].penalty_minutes_each, 5);
  assert.equal(fights[0].result, null, 'the client never invents a winner');
});

test('an unrelated five-minute major is not a fight', () => {
  const boarding = {
    ...plays[0],
    penalty: { severity: 'MAJ', desc_key: 'boarding', duration_min: 5 }
  };
  assert.equal(isFightingMajor(boarding), false);
  assert.equal(deriveFightEvents([boarding], game).length, 0);
});

test('server fan-vote result wins over fallback derivation', () => {
  const serverFight = {
    ...deriveFightEvents(plays, game)[0],
    result: {
      type: 'fan_vote',
      status: 'available',
      winner_name: 'Duck Fighter',
      winner_pct: 61,
      vote_count: 44,
      rating: 6.2,
      official: false
    }
  };
  const out = fightEvents({ game, plays, fights: [serverFight] });
  assert.equal(out[0].result.winner_name, 'Duck Fighter');
  assert.equal(out[0].result.official, false);
});

test('replay markers collapse two fighting penalties into one fight marker', () => {
  const fights = deriveFightEvents(plays, game);
  const out = markers(plays, fights);
  assert.equal(out.filter(x => x.kind === 'fight').length, 1);
  assert.equal(out.filter(x => x.kind === 'penalty').length, 0, 'paired fight majors are not double-counted as penalty markers');
});

test('fight seek lands on the completed paired-major event', () => {
  assert.equal(seek(plays, -1, 'fight', 1), 1);
});

test('replay hides the fight until both fighting majors exist at the cursor', () => {
  const full = {
    game,
    plays,
    fights: deriveFightEvents(plays, game),
    totals: { teams: { away: {}, home: {} } },
    goalies_in_net: { away: null, home: null }
  };
  const first = sliceCast(full, 0);
  const paired = sliceCast(full, 1);
  assert.equal(first.fights.length, 0, 'one unpaired fighting penalty is not yet a fight');
  assert.equal(paired.fights.length, 1, 'the historical fight appears once the opposing major is called');
});
