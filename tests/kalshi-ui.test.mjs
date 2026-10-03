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
const { castMarketHtml, castMarketPhase, kalshiColors, kalshiPollMs, KALSHI_CLOSED_POLL_MS } = await import('../src/pages/cast.js');
// The Cast has ONE market slot under the Live Rink (MLB PBEcast standard); the strip is retired.
const castKalshiSlots = (entry, g) => ({ strip: '', card: castMarketHtml(entry, g) });
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
  assert.match(text(kalshiCard(ENTRY, { placement: 'game-page' })), /not sportsbook odds and not a PropBetEdge model/);
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

test('Cast placement: one full compact card under a lifecycle label for every state; postponed nothing', () => {
  const live = { ...ENTRY, kalshi: { ...ENTRY.kalshi, freshness: 'live' } };
  for (const sem of ['SCHEDULED', 'PREGAME']) {
    const h = castMarketHtml(ENTRY, game(sem));
    assert.match(h, /^<div class="cast-mkt" data-phase="pre"><div class="cast-mkt-phase">[^]*MARKET OPEN · PRE-MATCH/);
    assert.match(h, /class="ic kx kx--compact"[^>]*data-kx-placement="cast"/);
  }
  const l = castMarketHtml(live, game('LIVE'));
  assert.match(l, /data-phase="live"/);
  assert.match(text(l), /LIVE MARKET Market Pulse/);
  assert.match(text(l), /Mid-market/);
  assert.match(text(l), /Updated \d+/);
  assert.match(text(l), /View market on Kalshi/);
  assert.doesNotMatch(l, /<details/, 'never a collapsed strip');
  assert.deepEqual(castMarketPhase(live, game('LIVE', { status: { semantics: 'LIVE', in_intermission: true, period: 2 } })), ['live', 'LIVE MARKET']);
  // A stale in-game quote is never labelled live.
  const stale = { ...ENTRY, kalshi: { ...ENTRY.kalshi, freshness: 'stale' } };
  assert.deepEqual(castMarketPhase(stale, game('LIVE')), ['stale', 'MARKET OPEN · QUOTE STALE']);
  // Live but the book is too wide for a Mid-market: the full card shows bid / ask.
  const wide = { ...live, kalshi: { ...live.kalshi, outcomes: live.kalshi.outcomes.map(o => ({ ...o, mid_bp: null })) } };
  assert.match(text(castMarketHtml(wide, game('LIVE'))), /YES bid \/ ask/);
  for (const sem of ['POSTPONED', 'CANCELLED']) assert.equal(castMarketHtml(live, game(sem)), '', sem);
  // FINAL game whose market still trades: the live card stays until the market closes.
  const f = castMarketHtml(ENTRY, game('FINAL'));
  assert.match(f, /data-phase="final-open"/);
  assert.match(text(f), /GAME FINAL · MARKET STILL TRADING/);
  assert.match(f, /class="ic kx kx--compact"[^>]*data-kx-placement="cast"/);
});

test('Cast wiring: one market slot directly under the Live Rink, patched in place', () => {
  const src = fs.readFileSync('src/pages/cast.js', 'utf8').split('\r\n').join('\n');
  assert.match(src, /\$\{liveRink\(cast, state, rink, \{ periods, latest, live \}\)\}\n\s*<div id="cast-kx" class="cast-kx-slot">\$\{kx\}<\/div>/);
  assert.doesNotMatch(src, /kalshiStrip|cast-kalshi-strip|cast-kalshi-card/);
  assert.match(src, /if \(slot\.dataset\.kxHtml === kx\) return;/);
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
    'kalshi-market-client.js': '68f9ed06de627654634e385acc79b1efdee858de4a59801e20b401b5c0bc43dc',
    'kalshi-market-ui.css': 'fb046ada2b2e5450207e4301c0e41a193aa599e4661843fdcdb50d45ac7191ae',
    'kalshi-market-ui.js': '03712a0eb48e5265523ec45b145fd2fa880c9435e1adf2c6ca988c78c3fa37a8'
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
  assert.match(card, /data-kx-placement="cast-history"/);
  assert.match(text(card), /^MARKET SETTLED How the market closed/);
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
  assert.match(t, /^MARKET CLOSED · AWAITING SETTLEMENT How the market closed/);
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
  assert.match(src, /marketHistoryCard\(entry, \{ placement: 'cast-history' \}\)/);
  const ms = Number(src.match(/KALSHI_FIRST_PAINT_MS = (\d+)/)[1]);
  assert.ok(ms > 0 && ms <= 800, `first-paint wait ${ms} ms`);
  assert.match(fs.readFileSync('src/pages/board.js', 'utf8'), /final \? marketCloseLine\(kalshiEntry\)/);
});

// Mirrors propbetedge-workers a229028 (history-regression): a completed market with NO live quote
// (kalshi: null) must survive the board and event loaders and render history, never a live card.
test('completed market with kalshi null survives the NHL loaders and renders history', async () => {
  const noQuote = { ...structuredClone(SETTLED), kalshi: null };
  const closedNoQuote = { ...closedOf(SETTLED), kalshi: null };
  const client = createKalshiClient({
    sport: 'nhl',
    fetchImpl: async url => ({ ok: true, json: async () => url.includes('/event/')
      ? { contract: 'market-intel/1', enabled: true, event: noQuote }
      : { enabled: true, events: [noQuote, { ...closedNoQuote, event: { ...closedNoQuote.event, canonical_event_id: '2026020099' } }] } })
  });
  const board = await client.loadBoard();
  assert.ok(board.has(String(GAME_ID)), 'board dropped the completed entry');
  assert.ok(board.has('2026020099'), 'board dropped the CLOSED entry');
  const ev = await client.loadEvent(GAME_ID);
  assert.ok(ev, 'event read nulled the completed entry');
  assert.equal(ev.kalshi, null);
  const { strip, card } = castKalshiSlots(ev, game('FINAL'));
  assert.equal(strip, '');
  assert.match(text(card), /How the market closed/);
  assert.match(text(card), /Kalshi settlement: BUF — YES/);
  assert.doesNotMatch(card, /class="ic kx[^"]*"[^>]*data-kx-placement="cast"/, 'never a live card');
  const closedCard = text(castKalshiSlots(closedNoQuote, game('FINAL')).card);
  assert.match(closedCard, /Market closed · awaiting settlement/);
  assert.doesNotMatch(closedCard, /Settled YES|Settled NO/);
  assert.match(text(slateCard(game('FINAL'), { kalshi: client.forEvent(GAME_ID) })), /MARKET BUF .*settled YES/);
  // A stale quote is never labelled live on a compact card.
  assert.equal(kalshiLine({ ...ENTRY, kalshi: { ...ENTRY.kalshi, freshness: 'stale' } }), '');
});

// Score rail market segment (MLB score-ticker standard): exact, displayable, fresh two-sided markets only.
test('score rail: compact market text only for an exact, displayable, fresh market; patched in place', async () => {
  const { tickerMarketText, patchChipMarket } = await import('../src/components/score-ticker.js');
  const live = { ...ENTRY, kalshi: { ...ENTRY.kalshi, freshness: 'live' } };
  const g = (sem, ids = [16, 7]) => game(sem, { teams: { away: team('CHI', { id: ids[0] }), home: team('BUF', { id: ids[1] }) } });
  assert.equal(tickerMarketText(live, g('SCHEDULED')), 'CHI 32.5¢ · BUF 67.5¢');
  assert.equal(tickerMarketText(live, g('LIVE')), 'CHI 32.5¢ · BUF 67.5¢');
  assert.equal(tickerMarketText(live, g('FINAL')), '', 'final: no segment');
  assert.equal(tickerMarketText(live, g('POSTPONED')), '');
  assert.equal(tickerMarketText(live, g('SCHEDULED', [7, 16])), '', 'team ids must match away / home');
  assert.equal(tickerMarketText({ ...live, kalshi: { ...live.kalshi, freshness: 'stale' } }, g('LIVE')), '', 'stale');
  assert.equal(tickerMarketText({ ...live, event: { ...live.event, canonical_event_id: '2026020099' } }, g('LIVE')), '', 'other game');
  assert.equal(tickerMarketText({ ...live, kalshi: { ...live.kalshi, outcomes: live.kalshi.outcomes.map(o => ({ ...o, displayable: false })) } }, g('LIVE')), '');
  assert.equal(tickerMarketText(null, g('LIVE')), '');
  let inserted = '';
  patchChipMarket({ querySelector: () => null, insertAdjacentHTML: (_, h) => { inserted = h; } }, 'CHI 32.5¢ · BUF 67.5¢');
  assert.match(inserted, /class="stk-g__mkt"[^>]*><b>MKT<\/b><span class="stk-g__mkt-px">CHI 32\.5¢ · BUF 67\.5¢<\/span>/);
  const px = { textContent: 'CHI 32.5¢ · BUF 67.5¢' };
  let removed = false;
  const el = { querySelector: () => px, remove: () => { removed = true; } };
  patchChipMarket({ querySelector: () => el }, 'CHI 33.0¢ · BUF 67.0¢');
  assert.equal(px.textContent, 'CHI 33.0¢ · BUF 67.0¢');
  patchChipMarket({ querySelector: () => el }, '');
  assert.equal(removed, true);
  const src = fs.readFileSync('src/components/score-ticker.js', 'utf8');
  assert.equal((src.match(/kalshi\.loadBoard\(/g) || []).length, 1, 'one board read per refresh');
  assert.match(src, /track\.querySelectorAll\(`\.stk-g\[data-game="\$\{id\}"\]`\)\.forEach\(chip => patchChipMarket\(chip, after\)\)/, 'run + marquee clone patched in place');
});
