import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePropMarkets, fairAmerican, implied, marketCounts, propMoves } from '../src/lib/prop-market.js';

const ev = props => [{ event_id: 'e1', game_id: '2026020001', away: 'FLA', home: 'CAR', commence_time: '2026-09-29T21:00:00Z', props }];
const q = (book, line, over, under, extra = {}) => ({ market: 'player_shots_on_goal', player: 'Sebastian Aho', line, over, under, book, last_update: '2026-09-29T17:00:00Z', ...extra });

test('main line = most books; best price per side at that line', () => {
  const [row] = aggregatePropMarkets(ev([q('dk', 2.5, -120, 100), q('fd', 2.5, -110, -110), q('mgm', 3.5, 150, -190)]));
  assert.equal(row.main_line, 2.5);
  assert.equal(row.books, 2);
  assert.equal(row.books_any_line, 3);
  assert.deepEqual(row.other_lines, [3.5]);
  assert.deepEqual(row.best_over, { price: -110, book: 'fd' });
  assert.deepEqual(row.best_under, { price: 100, book: 'dk' });
});

test('no-vig consensus needs two books quoting both sides of the same line', () => {
  const [single] = aggregatePropMarkets(ev([q('dk', 2.5, -120, 100), q('fd', 2.5, -110, null)]));
  assert.equal(single.consensus, null);
  const [two] = aggregatePropMarkets(ev([q('dk', 2.5, -110, -110), q('fd', 2.5, -110, -110)]));
  assert.equal(two.consensus.books, 2);
  assert.ok(Math.abs(two.consensus.over - 0.5) < 1e-9);
  assert.equal(two.consensus.fair_over, -100);
});

test('an over-only market never invents an under', () => {
  const [row] = aggregatePropMarkets(ev([q('dk', 0.5, 250, null, { market: 'player_goals' })]));
  assert.equal(row.best_under, null);
  assert.equal(row.consensus, null);
});

test('empty snapshot -> no rows; counts are zero, not missing', () => {
  assert.deepEqual(aggregatePropMarkets([]), []);
  const c = marketCounts([]);
  assert.equal(c.player_total_saves, 0);
  assert.equal(Object.keys(c).length, 5);
});

test('prop moves are counted per game/player/market', () => {
  const m = propMoves([{ event_id: 'e1', movement_since_previous: [{ book: 'dk', market: 'player_shots_on_goal', player: 'A', from: {}, to: {} }, { book: 'dk', market: 'h2h' }] }]);
  assert.equal(m.get('e1|player_shots_on_goal|A'), 1);
  assert.equal(m.size, 1);
});

test('price math', () => {
  assert.equal(implied(50), null);
  assert.ok(Math.abs(implied(-110) - 0.5238095) < 1e-6);
  assert.equal(fairAmerican(0.6), -150);
  assert.equal(fairAmerican(1), null);
});
