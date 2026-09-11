import assert from 'node:assert/strict';
import { boardAlerts, goalieAlerts, newsAlerts } from '../src/services/alert-rules.js';

const game = (id, sem, a = null, h = null, start = '2026-10-01T23:00:00Z') => ({
  id, start_time_utc: start, status: { semantics: sem },
  teams: { away: { abbrev: 'FLA', score: a }, home: { abbrev: 'CAR', score: h } }
});

// First load primes, never alerts (except already-disrupted games).
{
  const r = boardAlerts(null, { games: [game('1', 'LIVE', 1, 0), game('2', 'SCHEDULED')] }, new Set(['1']));
  assert.equal(r.alerts.length, 0);
  assert.ok(r.prime.includes('game:1:score:1-0'));
  const d = boardAlerts(null, { games: [game('3', 'POSTPONED')] });
  assert.equal(d.alerts.length, 1, 'a game already postponed on first sight is still an alert');
  assert.equal(d.alerts[0].severity, 'high');
}
// Postponement alerts for every game, watched or not.
{
  const r = boardAlerts({ games: [game('2', 'SCHEDULED')] }, { games: [game('2', 'POSTPONED')] });
  assert.equal(r.alerts[0].key, 'game:2:state:POSTPONED');
  assert.match(r.alerts[0].title, /postponed/);
}
// Goals and puck drop only for watched games.
{
  const prev = { games: [game('1', 'SCHEDULED'), game('4', 'LIVE', 0, 0)] };
  const next = { games: [game('1', 'LIVE', 0, 0), game('4', 'LIVE', 1, 0)] };
  const unwatched = boardAlerts(prev, next, new Set());
  assert.equal(unwatched.alerts.length, 0);
  const watched = boardAlerts(prev, next, new Set(['1', '4']));
  assert.deepEqual(watched.alerts.map(a => a.kind).sort(), ['game', 'goal']);
  assert.equal(watched.alerts.find(a => a.kind === 'goal').key, 'game:4:score:1-0');
}
// Start-time change before puck drop.
{
  const r = boardAlerts({ games: [game('5', 'SCHEDULED', null, null, '2026-10-01T23:00:00Z')] }, { games: [game('5', 'SCHEDULED', null, null, '2026-10-02T00:00:00Z')] }, new Set(['5']));
  assert.equal(r.alerts[0].severity, 'high');
}
// Goalie: UNKNOWN -> CONFIRMED alerts; unchanged primes.
{
  const unknown = { game_id: '9', teams: { home: { team: 'CAR', starter: { status: 'UNKNOWN', goalie_id: null } } } };
  const confirmed = { game_id: '9', teams: { home: { team: 'CAR', starter: { status: 'CONFIRMED', goalie_id: 42, name: 'F. Andersen', basis: 'box score', source: 'NHL' } } } };
  assert.equal(goalieAlerts(null, confirmed).alerts.length, 0, 'first sight primes');
  const r = goalieAlerts(unknown, confirmed);
  assert.equal(r.alerts.length, 1);
  assert.match(r.alerts[0].title, /Starter confirmed: F\. Andersen \(CAR\)/);
  assert.equal(goalieAlerts(confirmed, confirmed).alerts.length, 0);
}
// News: only new breaking items after first load.
{
  const a = { id: 'a', breaking: true, title: 'x', category: 'Injuries', source: 'NHL.com' };
  const b = { id: 'b', breaking: false, title: 'y', category: 'League news', source: 'NHL.com' };
  const c = { id: 'c', breaking: true, title: 'z', category: 'Trades', source: 'Yahoo Sports' };
  assert.equal(newsAlerts(null, [a, b]).alerts.length, 0);
  const r = newsAlerts([a, b], [c, a, b]);
  assert.deepEqual(r.alerts.map(x => x.key), ['news:c']);
}
console.log('alert rules: PASS');
