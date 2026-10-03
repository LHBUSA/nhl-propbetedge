// Kalshi Market Intelligence on NHL (shared component, contract market-intel/1).
// Truth rules: no entry -> nothing rendered; every price links to the Kalshi
// market (new tab, rel sponsored); both NHL teams render; FINAL renders the market
// history (or nothing); team colours only from the shipped league directory; the browser never
// calls a Kalshi API host. The fixture is the LIVE event response captured from
// propsports-markets on 2026-10-03 (CHI @ BUF, gamePk 2026020022).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

// components/player.js imports the portrait manifest the way Vite resolves JSON.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.json')) return { format: 'json', shortCircuit: true, source: fs.readFileSync(fileURLToPath(url), 'utf8') };
    return nextLoad(url, context);
  }
});

const { kalshiCard, kalshiStrip, kalshiLine, marketCloseLine, marketHistoryCard, __resetKalshiFlashes } = await import('../src/vendor/kalshi/kalshi-market-ui.js');
const { createKalshiClient } = await import('../src/vendor/kalshi/kalshi-market-client.js');
const { kalshi, kalshiPollState } = await import('../src/data/kalshi.js');
const { castKalshiSlots, kalshiColors, kalshiPollMs, KALSHI_CLOSED_POLL_MS } = await import('../src/pages/cast.js');
const { slateCard } = await import('../src/pages/board.js');

const FIXTURE = JSON.parse(fs.readFileSync(new URL('./fixtures/kalshi/nhl-event-2026020022.json', import.meta.url), 'utf8'));
const ENTRY = FIXTURE.event;
const GAME_ID = 2026020022;
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const team = (abbrev, extra = {}) => ({ abbrev, name: abbrev, ...extra });
const game = (semantics, extra = {}) => ({
  id: GAME_ID,
  date: '2026-10-03',
  start_time_utc: '2026-10-03T23:00:00Z',
  game_type: 2,
  venue: 'KeyBank Center',
  status: { semantics, period: semantics === 'LIVE' ? 2 : null, clock: semantics === 'LIVE' ? '11:04' : null },
  teams: { away: team('CHI', { score: semantics === 'SCHEDULED' ? null : 1 }), home: team('BUF', { score: semantics === 'SCHEDULED' ? null : 2 }) },
  broadcasts: [],
  ...extra
});

test('fixture is a real NHL market-intel/1 event with both teams', () => {
  assert.equal(FIXTURE.contract, 'market-intel/1');
  assert.equal(ENTRY.event.sport, 'nhl');
  assert.equal(ENTRY.event.canonical_event_id, String(GAME_ID));
  assert.deepEqual(ENTRY.kalshi.outcomes.map(o => [o.role, o.abbr]), [['away', 'CHI'], ['home', 'BUF']]);
});

test('no entry -> nothing rendered anywhere', () => {
  assert.equal(kalshiCard(null, { placement: 'game-page' }), '');
  assert.equal(kalshiStrip(null, { placement: 'cast-live' }), '');
  assert.equal(kalshiLine(null), '');
  for (const sem of ['SCHEDULED', 'PREGAME', 'LIVE', 'FINAL']) {
    assert.deepEqual(castKalshiSlots(null, game(sem)), { strip: '', card: '' }, `Cast ${sem}`);
    assert.doesNotMatch(slateCard(game(sem), {}), /kx-line|KALSHI/, `card ${sem}`);
  }
  // A market for another game is never shown on this one.
  const other = { ...ENTRY, event: { ...ENTRY.event, canonical_event_id: '2026020099' } };
  assert.deepEqual(castKalshiSlots(other, game('SCHEDULED')), { strip: '', card: '' });
});

test('every Kalshi price links to kalshi.com in a new tab with rel sponsored', () => {
  const { card } = castKalshiSlots(ENTRY, game('SCHEDULED'));
  const anchors = card.match(/<a [^>]*>/g) || [];
  assert.equal(anchors.length, 3, 'two outcome prices + the footer link');
  for (const a of anchors) {
    assert.match(a, /href="https:\/\/kalshi\.com\/markets\/kxnhlgame\//);
    assert.match(a, /target="_blank"/);
    assert.match(a, /rel="noopener noreferrer sponsored"/);
  }
  assert.match(text(card), /View market on Kalshi/);
  assert.match(text(card), /not sportsbook odds and not a PropBetEdge model/);
});

test('an NHL entry renders both teams in the card, strip and game-card line', () => {
  __resetKalshiFlashes();
  const live = { ...ENTRY, kalshi: { ...ENTRY.kalshi, freshness: 'live' } };
  const card = text(kalshiCard(ENTRY, { placement: 'game-page' }));
  assert.match(card, /CHI Chicago wins · YES 32\.5¢ Mid-market/);
  assert.match(card, /BUF Buffalo wins · YES 67\.5¢ Mid-market/);
  const strip = text(kalshiStrip(live, { placement: 'cast-live' }));
  assert.match(strip, /CHI 32\.5¢/);
  assert.match(strip, /BUF 67\.5¢/);
  const line = text(kalshiLine(live));
  assert.match(line, /KALSHI CHI 32\.5¢ · BUF 67\.5¢/);
});

test('Cast placement: pregame full card, live strip, postponed nothing', () => {
  const live = { ...ENTRY, kalshi: { ...ENTRY.kalshi, freshness: 'live' } };
  for (const sem of ['SCHEDULED', 'PREGAME']) {
    const s = castKalshiSlots(ENTRY, game(sem));
    assert.equal(s.strip, '');
    assert.match(s.card, /class="ic kx"[^>]*data-kx-placement="game-page"/);
  }
  const l = castKalshiSlots(live, game('LIVE'));
  assert.equal(l.card, '');
  assert.match(l.strip, /<details class="kx-strip"[^>]*data-kx-placement="cast-live"/);
  assert.match(castKalshiSlots(live, game('LIVE'), { open: true }).strip, /<details open class="kx-strip"/, 'expanded strip survives re-render');
  // Live but the book is too wide for a strip (no Mid-market): the full card stays.
  const wide = { ...live, kalshi: { ...live.kalshi, outcomes: live.kalshi.outcomes.map(o => ({ ...o, mid_bp: null })) } };
  const w = castKalshiSlots(wide, game('LIVE'));
  assert.equal(w.strip, '');
  assert.match(text(w.card), /YES bid \/ ask/);
  for (const sem of ['POSTPONED', 'CANCELLED']) assert.deepEqual(castKalshiSlots(live, game(sem)), { strip: '', card: '' }, sem);
  // FINAL game whose market still trades: the live card stays on the replay until the market closes.
  const f = castKalshiSlots(ENTRY, game('FINAL'));
  assert.equal(f.strip, '');
  assert.match(f.card, /class="ic kx"[^>]*data-kx-placement="game-page"/);
});

test('poll state: live 20 s, pregame 45 s, final stops', () => {
  assert.equal(kalshiPollState('LIVE'), 'live');
  assert.equal(kalshiPollState('INTERMISSION'), 'live');
  assert.equal(kalshiPollState('SCHEDULED'), 'pregame');
  assert.equal(kalshiPollState('PREGAME'), 'pregame');
  assert.equal(kalshiPollState('FINAL'), null);
  assert.equal(kalshi.sport, 'nhl');
  assert.equal(kalshi.pollMsFor('live'), 20000);
  assert.equal(kalshi.pollMsFor('pregame'), 45000);
});

test('team colours only from the shipped league directory; unknown teams get none', () => {
  assert.deepEqual(kalshiColors(game('SCHEDULED')), { away: '#CF0A2C', home: '#2F6BD0' });
  assert.deepEqual(kalshiColors({ teams: { away: { abbrev: 'XXX' }, home: {} } }), {});
  const { card } = castKalshiSlots(ENTRY, game('SCHEDULED'));
  assert.match(card, /--kx-team:#CF0A2C/);
  assert.match(card, /--kx-team:#2F6BD0/);
});

test('game card: live line for not-final games; FINAL shows only a recorded market close', () => {
  const live = { ...ENTRY, kalshi: { ...ENTRY.kalshi, freshness: 'live' } };
  const upcoming = slateCard(game('SCHEDULED'), { kalshi: live });
  const footer = upcoming.slice(upcoming.indexOf('<footer class="scard__actions">'));
  assert.match(footer, /class="kx-line mono"/);
  assert.match(footer, /data-kx-placement="game-card"/);
  assert.match(slateCard(game('LIVE'), { kalshi: live }), /kx-line/);
  // FINAL with no recorded close (market.close null): nothing.
  assert.doesNotMatch(slateCard(game('FINAL'), { kalshi: live }), /kx-line|KALSHI|MARKET/);
  // Stale markets never reach a compact card.
  assert.doesNotMatch(slateCard(game('SCHEDULED'), { kalshi: { ...live, kalshi: { ...live.kalshi, freshness: 'stale' } } }), /kx-line/);
});

test('client reads our markets API for NHL and resolves failures to nothing', async () => {
  const calls = [];
  const client = createKalshiClient({
    sport: 'nhl',
    fetchImpl: async url => {
      calls.push(url);
      if (url.includes('/event/')) return { ok: true, json: async () => FIXTURE };
      return { ok: true, json: async () => ({ enabled: true, events: [ENTRY] }) };
    }
  });
  const board = await client.loadBoard();
  assert.equal(board.size, 1);
  assert.equal(client.forEvent(GAME_ID)?.kalshi.event_ticker, ENTRY.kalshi.event_ticker);
  assert.equal((await client.loadEvent(GAME_ID)).event.canonical_event_id, String(GAME_ID));
  assert.deepEqual(calls, [
    'https://propsports-markets.sales-fd3.workers.dev/v1/market-intelligence/sport/nhl',
    `https://propsports-markets.sales-fd3.workers.dev/v1/market-intelligence/event/nhl/${GAME_ID}`
  ]);
  const down = createKalshiClient({ sport: 'nhl', fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(await down.loadEvent(GAME_ID), null);
  assert.equal((await down.loadBoard()).size, 0);
});

test('page code never references a Kalshi API host; only our markets API is called', () => {
  const FORBIDDEN = /api\.elections\.kalshi\.com|external-api\.kalshi\.com|trading-api\.kalshi\.com|demo-api\.kalshi\.co|\/trade-api\//i;
  const files = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs|css|html|json)$/.test(e.name)) files.push(p);
    }
  };
  walk('src');
  files.push('index.html');
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), FORBIDDEN, `Kalshi API host referenced in ${f}`);
  // Pages reach Kalshi data only through the NHL client module.
  for (const page of ['src/pages/cast.js', 'src/pages/board.js']) {
    const src = fs.readFileSync(page, 'utf8');
    assert.match(src, /from '\.\.\/data\/kalshi\.js'/);
    assert.doesNotMatch(src, /https?:\/\/[^'"`\s]*(?:propsports-markets|kalshi\.com)/, `${page} hardcodes a market host`);
  }
});

test('the shared component is vendored unchanged', () => {
  // SHA-256 of propbetedge-workers/workers/propsports-markets/client/* at vendoring time.
  const expected = {
    'kalshi-market-client.js': '653cb0fc2673f909552453052560bfd6194e0e4d045c51b1eb73483957d4c049',
    'kalshi-market-ui.css': 'db0f4b1efd5209966fb627f72e217b9539876d5123edc10d80524d172da41a06',
    'kalshi-market-ui.js': 'c343805e546cde66d01676c9c6c9f6f4ca746a8ba138b4b1ad0159a341f3db2a'
  };
  for (const [name, sha] of Object.entries(expected)) {
    // Hash the committed (LF) text so a CRLF checkout does not read as an edit.
    const body = fs.readFileSync(`src/vendor/kalshi/${name}`, 'utf8').replace(/\r\n/g, '\n');
    assert.equal(crypto.createHash('sha256').update(body).digest('hex'), sha, `${name} was edited; re-vendor it from the canonical source`);
  }
});

// ── Market history ("How the market closed"). SETTLED_FIXTURE is the REAL settled
// tennis event (00a0f4e8-67cb-593c-a77b-65b62d709937) reshaped only in sport, ids and
// names to an NHL game (CHI @ BUF); every price, timestamp and settlement is as stored.
const SETTLED_FIXTURE = JSON.parse(fs.readFileSync(new URL('./fixtures/kalshi/nhl-event-settled-derived.json', import.meta.url), 'utf8'));
const SETTLED = SETTLED_FIXTURE.event;
const closedOf = entry => {
  const c = structuredClone(entry);
  c.market.lifecycle = 'CLOSED';
  c.market.close.lifecycle = 'CLOSED';
  for (const o of c.market.close.outcomes) o.result = null;
  c.market_history.lifecycle = 'CLOSED';
  c.market_history.status_label = 'Market closed';
  for (const o of c.market_history.outcomes) o.settlement = null;
  delete c.market_history.markers?.settlement;
  return c;
};

test('settled fixture: real stored history, NHL ids only', () => {
  assert.equal(SETTLED.event.canonical_event_id, String(GAME_ID));
  assert.equal(SETTLED.market.lifecycle, 'SETTLED');
  assert.equal(SETTLED.market_history.lifecycle, 'SETTLED');
  assert.deepEqual(SETTLED.market_history.outcomes.map(o => [o.abbr, o.settlement?.result]), [['CHI', 'no'], ['BUF', 'yes']]);
});

test('FINAL game Cast mounts "How the market closed" for a SETTLED market', () => {
  const { strip, card } = castKalshiSlots(SETTLED, game('FINAL'));
  assert.equal(strip, '');
  assert.match(card, /data-kx-history/);
  assert.match(card, /data-kx-placement="market-history"/);
  const t = text(card);
  assert.match(t, /How the market closed/);
  assert.match(t, /Market history · Kalshi/);
  assert.match(t, /First observed/);
  assert.match(t, /Final trade/);
  assert.match(t, /Kalshi settlement: BUF — YES/);
  assert.match(t, /Settled YES/);
  assert.match(t, /Settled NO/);
  assert.match(t, /not sportsbook odds and not a PropBetEdge model/);
  assert.match(t, /Settlement is the market venue's, not our result/);
  assert.doesNotMatch(t, /Kalshi intelligence/i);
  assert.match(card, /<svg [^>]*aria-label="Observed market prices over time"/);
  assert.doesNotMatch(card, /style="/, 'no inline styles in the history card');
  // Partial history is disclosed; "First observed" is never called an opening price.
  assert.match(t, /“First observed” is our first record, not the opening price/);
  for (const a of card.match(/<a [^>]*>/g) || []) {
    assert.match(a, /href="https:\/\/kalshi\.com\/markets\/kxnhlgame\//);
    assert.match(a, /rel="noopener noreferrer sponsored"/);
    assert.match(a, /target="_blank"/);
  }
  assert.ok((card.match(/<a [^>]*>/g) || []).length >= 1, 'Kalshi attribution link present');
  assert.equal(marketHistoryCard(SETTLED), marketHistoryCard(SETTLED), 'deterministic');
});

test('CLOSED (game final, market not settled) says awaiting settlement, never a result', () => {
  const closed = closedOf(SETTLED);
  const { card } = castKalshiSlots(closed, game('FINAL'));
  const t = text(card);
  assert.match(t, /Market closed · awaiting settlement/);
  assert.match(t, /Awaiting settlement/);
  assert.doesNotMatch(t, /Settled YES|Settled NO|settlement: /);
  const line = text(slateCard(game('FINAL'), { kalshi: closed }));
  assert.match(line, /MARKET .*awaiting settlement/);
});

test('history: no entry / no history / another game -> nothing', () => {
  assert.equal(marketHistoryCard(null), '');
  assert.equal(marketHistoryCard({ ...SETTLED, market_history: null }), '');
  assert.equal(marketCloseLine(null), '');
  assert.equal(marketCloseLine({ ...SETTLED, market: { ...SETTLED.market, close: null } }), '');
  assert.deepEqual(castKalshiSlots(null, game('FINAL')), { strip: '', card: '' });
  const other = { ...SETTLED, event: { ...SETTLED.event, canonical_event_id: '2026020099' } };
  assert.deepEqual(castKalshiSlots(other, game('FINAL')), { strip: '', card: '' });
  assert.doesNotMatch(slateCard(game('FINAL'), {}), /kx-line|MARKET/);
});

test('result card: restrained market line for a FINAL game with a recorded close', () => {
  const html = slateCard(game('FINAL'), { kalshi: SETTLED });
  const footer = html.slice(html.indexOf('<footer class="scard__actions">'));
  assert.match(footer, /class="kx-line kx-line--closed mono"/);
  assert.match(text(footer), /MARKET BUF .*settled YES/);
  // Live line never on a final card.
  assert.doesNotMatch(html, /data-kx-placement="game-card"/);
});

test('market poll cadence: live 20 s, pregame 45 s, CLOSED 5 min, SETTLED stops', () => {
  assert.equal(kalshiPollMs(ENTRY, 'LIVE'), 20000);
  assert.equal(kalshiPollMs(ENTRY, 'SCHEDULED'), 45000);
  assert.equal(kalshiPollMs(closedOf(SETTLED), 'FINAL'), KALSHI_CLOSED_POLL_MS);
  assert.equal(KALSHI_CLOSED_POLL_MS, 300000);
  assert.equal(kalshiPollMs(SETTLED, 'FINAL'), null);
  assert.equal(kalshiPollMs(ENTRY, 'POSTPONED'), null);
});

test('Cast mounts the market module for FINAL games, with a bounded first-paint wait', () => {
  const src = fs.readFileSync('src/pages/cast.js', 'utf8');
  assert.match(src, /marketModule\(entry/);
  const ms = Number(src.match(/KALSHI_FIRST_PAINT_MS = (\d+)/)[1]);
  assert.ok(ms > 0 && ms <= 800, `first-paint wait ${ms} ms`);
  assert.match(fs.readFileSync('src/pages/board.js', 'utf8'), /final \? marketCloseLine\(kalshiEntry\)/);
});
