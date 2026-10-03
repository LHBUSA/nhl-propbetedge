// PBE Picks x Kalshi: the pick side's prediction-market line on official pick cards and ledger rows.
// Rules asserted: same game + same side only; exact proposition; never a live quote on a settled pick;
// stored close evidence wording ("before start" / "first observed", never "opened"; "awaiting settlement"
// for a closed market); stale quote -> nothing; frozen Algo vs Market only from AGREEMENT/DISAGREEMENT
// (LOCKED reveals nothing); every price links to Kalshi with rel="noopener noreferrer sponsored";
// nothing usable -> '' (no placeholder). Fixture = LIVE NHL event captured 2026-10-03 (CHI @ BUF).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.json')) return { format: 'json', shortCircuit: true, source: fs.readFileSync(fileURLToPath(url), 'utf8') };
    return nextLoad(url, context);
  }
});

const { pickMarketLine, pickAvmLine, findAvmRow, pickMarketSlot } = await import('../src/lib/pick-market.js');
const { gameCardMarkup } = await import('../src/pages/pbe-picks.js');
const { ledgerMarket, trackView } = await import('../src/pages/track.js');

const LIVE = JSON.parse(fs.readFileSync(new URL('./fixtures/kalshi/nhl-event-2026020022.json', import.meta.url), 'utf8')).event;
const URL_ = LIVE.kalshi.market_url;
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const clone = v => JSON.parse(JSON.stringify(v));
const REL = 'rel="noopener noreferrer sponsored"';

const CLOSED = {
  event: { sport: 'nhl', canonical_event_id: '2026020022', state: 'post' },
  kalshi: null,
  market: {
    venue: 'kalshi', lifecycle: 'SETTLED', market_url: URL_, proposition: 'team_wins_game',
    close: { lifecycle: 'SETTLED', shape: 'two_way', outcomes: [
      { role: 'away', abbr: 'CHI', first_bp: 3300, first_label: 'first_observed', before_start_bp: 3250, final_trade_bp: 100, result: 'no' },
      { role: 'home', abbr: 'BUF', first_bp: 6700, first_label: 'first_observed', before_start_bp: 6750, final_trade_bp: 9900, result: 'yes' }
    ] }
  }
};

const AVM = { algos: [{ algo_id: 'nhl:pbe-nhl-model', ledger: [
  { canonical_event_id: '2026020022', status: 'LOCKED', algo_selection: null, algo_probability: null, market: null },
  { canonical_event_id: '2026020023', status: 'DISAGREEMENT', algo_selection: 'home', algo_probability: 0.714, market: { market_url: URL_, prices: { home: { mid_bp: 8050 }, away: { mid_bp: 1950 } } } },
  { canonical_event_id: '2026020024', status: 'AGREEMENT', algo_selection: 'away', algo_probability: 0.6, market: { market_url: URL_, prices: { away: { mid_bp: 5500 }, home: { mid_bp: 4500 } } } }
] }] };

test('live: the pick side only, linked to Kalshi, labelled as the PBE pick side', () => {
  const home = pickMarketLine(LIVE, 'home');
  assert.match(text(home), /^KALSHI BUF 67\.5¢ PBE pick side$/);
  assert.ok(home.includes(`href="${URL_}"`) && home.includes(REL) && home.includes('target="_blank"'));
  assert.doesNotMatch(home, /32\.5/, 'the other side is not shown');
  assert.doesNotMatch(text(home), /odds|sportsbook/i);
  assert.match(text(pickMarketLine(LIVE, 'away')), /CHI 32\.5¢/);
});

test('nothing when the market is not usable', () => {
  assert.equal(pickMarketLine(null, 'home'), '');
  assert.equal(pickMarketLine(LIVE, null), '');
  assert.equal(pickMarketLine(LIVE, 'draw'), '', 'no draw outcome in a two-way market');
  const stale = clone(LIVE); stale.kalshi.freshness = 'stale';
  assert.equal(pickMarketLine(stale, 'home'), '', 'a stale quote is never shown as current');
  const prop = clone(LIVE); prop.kalshi.proposition = 'team_wins_period'; prop.market && (prop.market.proposition = 'team_wins_period');
  assert.equal(pickMarketLine(prop, 'home'), '', 'proposition must match exactly');
  const nomid = clone(LIVE); nomid.kalshi.outcomes[1].mid_bp = null;
  assert.equal(pickMarketLine(nomid, 'home'), '');
  assert.equal(pickMarketSlot(null, 'home'), '', 'no placeholder');
});

test('settled pick: stored evidence only, never a live quote', () => {
  assert.equal(pickMarketLine(LIVE, 'home', { settled: true }), '', 'an open market without a recorded close renders nothing for a settled pick');
  const won = text(pickMarketLine(CLOSED, 'home', { settled: true }));
  assert.equal(won, 'KALSHI BUF 67.5¢ before start · settled YES');
  assert.equal(text(pickMarketLine(CLOSED, 'away', { settled: true })), 'KALSHI CHI 32.5¢ before start · settled NO');
  const first = clone(CLOSED); first.market.close.outcomes[1].before_start_bp = null;
  assert.equal(text(pickMarketLine(first, 'home', { settled: true })), 'KALSHI BUF first observed 67.0¢ · settled YES');
  const closed = clone(CLOSED); closed.market.lifecycle = 'CLOSED'; closed.market.close.lifecycle = 'CLOSED'; closed.market.close.outcomes.forEach(o => { o.result = null; });
  assert.equal(text(pickMarketLine(closed, 'home', { settled: true })), 'KALSHI BUF 67.5¢ before start · awaiting settlement');
  assert.ok(pickMarketLine(CLOSED, 'home').includes(REL), 'a closed market is history even without the settled flag');
  assert.doesNotMatch(won, /open(ed|ing)?\b/i);
});

test('Algo vs Market: frozen comparisons only, same side, LOCKED reveals nothing', () => {
  assert.equal(findAvmRow(AVM, '2026020022', 'home'), null, 'LOCKED row');
  assert.equal(findAvmRow(AVM, '2026020023', 'away'), null, 'other side');
  const line = pickAvmLine(findAvmRow(AVM, '2026020023', 'home'));
  assert.equal(text(line), 'AT PBE LOCK PBE 71.4% · Market 80.5¢ · −9.1 pts');
  assert.ok(line.includes(REL) && line.includes(`href="${URL_}"`));
  assert.equal(text(pickAvmLine(findAvmRow(AVM, '2026020024', 'away'))), 'AT PBE LOCK PBE 60.0% · Market 55.0¢ · +5.0 pts');
  assert.equal(pickAvmLine(AVM.algos[0].ledger[0]), '');
});

const game = (extra = {}) => ({
  id: '2026020022', away: { abbrev: 'CHI', name: 'Blackhawks' }, home: { abbrev: 'BUF', name: 'Sabres' },
  start_utc: '2026-10-03T23:00:00Z', boardState: { key: 'SCHEDULED', cls: 'sched', text: '7:00 PM' }, slateState: 'FUT',
  prediction_state: 'LOCKED_OFFICIAL', lock_window: null,
  pick: { pick_team: 'BUF', p_home: 0.61, p_away: 0.39, model_version: 'pbe-nhl-model-v1.2' }, ...extra
});

test('pick card: Kalshi line for the pick side; none without a pick, for a split squad, or a finished game without a close', () => {
  const card = gameCardMarkup(game(), { marketFor: () => LIVE });
  assert.match(text(card), /PBE Pick BUF 61\.0% KALSHI BUF 67\.5¢ PBE pick side/);
  assert.doesNotMatch(gameCardMarkup(game({ pick: null }), { marketFor: () => LIVE }), /KALSHI/, 'Pro-gated card (no pick) reveals nothing');
  assert.doesNotMatch(gameCardMarkup(game(), { marketFor: () => LIVE, splitSquad: true }), /KALSHI/);
  assert.doesNotMatch(gameCardMarkup(game(), { marketFor: () => null }), /KALSHI|kx-/);
  const final = game({ boardState: { key: 'FINAL', cls: 'final', text: 'FINAL' }, slateState: 'OFF' });
  assert.doesNotMatch(gameCardMarkup(final, { marketFor: () => LIVE }), /KALSHI/, 'a finished game never shows a live quote');
  assert.match(text(gameCardMarkup(final, { marketFor: () => CLOSED })), /KALSHI BUF 67\.5¢ before start · settled YES/);
  const withAvm = gameCardMarkup(game({ id: '2026020023' }), { marketFor: () => null, avm: AVM });
  assert.match(text(withAvm), /AT PBE LOCK PBE 71\.4% · Market 80\.5¢ · −9\.1 pts/);
});

test('track ledger: the Kalshi column exists only when a row has a real value', () => {
  const row = { game_id: '2026020022', matchup: 'CHI @ BUF', pick: 'BUF', probability: 0.6, start_utc: '2026-10-03T23:00:00Z', result: 'WIN', season: 20262027, game_type: 2 };
  const base = { segment: 'regular', ledger: { picks: [row], total: 1 }, regularRecord: null, preseasonRecord: null };
  assert.equal(ledgerMarket(row, { ...base, marketFor: () => LIVE }), '', 'graded pick + open market without a close -> nothing');
  assert.doesNotMatch(trackView({ ...base, marketFor: () => LIVE }), /<th class="trk-kx"/);
  assert.match(text(ledgerMarket(row, { ...base, marketFor: () => CLOSED })), /KALSHI BUF 67\.5¢ before start · settled YES/);
  assert.match(trackView({ ...base, marketFor: () => CLOSED }), /<th class="trk-kx" scope="col">Kalshi<\/th>/);
});
