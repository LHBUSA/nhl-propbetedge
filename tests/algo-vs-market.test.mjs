// ALGO vs MARKET on NHL (shared module, vendored unchanged; contract algo-vs-market/1).
// Track record (#/track-record) and the Cast event layer render NOTHING until the API has a
// qualifying frozen comparison; with one they render the module's score + ledger; a LOCKED row
// (Pro-gated, ungraded) never shows a selection. The fixture is the REAL soccer response
// (one AGREEMENT, 2026-10-03) reshaped only in sport / algo identity / canonical id.
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

const FX = JSON.parse(fs.readFileSync(new URL('./fixtures/kalshi/nhl-avm-derived.json', import.meta.url), 'utf8'));
const { algoVsMarketCard, algoVsMarketEvent } = await import('../src/vendor/kalshi/kalshi-market-ui.js');
const { loadAlgoVsMarket, loadAlgoVsMarketEvent, avmWithEventLabels } = await import('../src/data/kalshi.js');
const { castAvmHtml } = await import('../src/pages/cast.js');
const { mount } = await import('../src/pages/track.js');

const GAME = { id: '2026020022', teams: { away: { abbrev: 'CHI' }, home: { abbrev: 'BUF' } } };
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const clone = v => structuredClone(v);
const lockedRow = r => ({ ...clone(r), status: 'LOCKED', algo_selection: null, algo_selection_label: null, algo_probability: null,
  market: { ...clone(r.market), selection: null, selection_label: null, selection_price_bp: null }, result: null });

function stubRoot() {
  return { innerHTML: '', addEventListener: () => {}, removeEventListener: () => {}, contains: () => true };
}
async function mountTrackWith(avmBody) {
  const real = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    if (String(url).includes('/v1/algo-vs-market/nhl')) return { ok: true, json: async () => clone(avmBody) };
    throw new TypeError('offline in test');
  };
  try {
    const root = stubRoot();
    const dispose = mount(root);
    await new Promise(r => setTimeout(r, 60));
    dispose();
    return { html: root.innerHTML, urls };
  } finally { globalThis.fetch = real; }
}

test('fixture is the real response shape: one AGREEMENT, scoreboard as returned', () => {
  const a = FX.track.algos[0];
  assert.equal(a.algo_id, 'nhl:pbe-nhl-model');
  assert.equal(a.ledger[0].canonical_event_id, '2026020022');
  assert.equal(a.ledger[0].status, 'AGREEMENT');
  assert.deepEqual([a.scoreboard.agreements, a.scoreboard.disagreements, a.scoreboard.pending, a.scoreboard.decided], [1, 0, 1, 0]);
});

test('track record: empty algos -> nothing new on the page (no box, no heading)', async () => {
  const { html, urls } = await mountTrackWith({ contract: 'algo-vs-market/1', sport: 'nhl', algos: [] });
  assert.ok(urls.some(u => u === 'https://propsports-markets.sales-fd3.workers.dev/v1/algo-vs-market/nhl'), 'reads our markets API');
  assert.doesNotMatch(html, /Algo vs Market|data-avm|data-track-avm|avm__/);
  assert.equal(algoVsMarketCard(null), '');
  assert.equal(algoVsMarketCard({ algo_id: 'x', scoreboard: null, ledger: [] }), '');
});

test('track record: a failed read renders nothing', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  try { assert.equal(await loadAlgoVsMarket(), null); assert.equal(await loadAlgoVsMarketEvent('2026020022'), null); }
  finally { globalThis.fetch = real; }
});

test('track record: the real comparison renders the score and the ledger row', async () => {
  const { html } = await mountTrackWith(FX.track);
  assert.match(html, /data-track-avm/);
  assert.match(html, /data-avm="nhl:pbe-nhl-model"/);
  const t = text(html.slice(html.indexOf('data-track-avm')));
  assert.match(t, /Algo vs Market When the algo and the market disagree, who wins\?/);
  assert.match(t, /PropBetEdge 0 — Market 0/);
  assert.match(t, /0 decided disagreements/);
  assert.match(t, /Agreed 1 Neither \/ void 0 Pending 1/);
  // Ledger row: lock date, event label (frozen market's own away/home labels), PBE pick, market pick + price, type, winner.
  assert.match(t, /2026-10-03 Bayern München @ Augsburg Bayern München Bayern München · 80\.5¢ Agree Pending/);
  assert.doesNotMatch(t, /beats the market/i);
});

test('track record: event label prefers the picks ledger matchup for that game', () => {
  const a = avmWithEventLabels(FX.track.algos[0], id => (id === '2026020022' ? 'CHI @ BUF' : null));
  assert.equal(a.ledger[0].event_label, 'CHI @ BUF');
  assert.equal(FX.track.algos[0].ledger[0].event_label, undefined, 'input not mutated');
});

test('cast: no comparison / another game -> nothing; the real comparison renders the event layer', () => {
  assert.equal(castAvmHtml(null, GAME), '');
  assert.equal(castAvmHtml({ comparisons: [] }, GAME), '');
  assert.equal(castAvmHtml(FX.event, { ...GAME, id: '2026020099' }), '');
  const html = castAvmHtml(FX.event, GAME);
  const t = text(html);
  assert.match(t, /^Algo vs Market Agreement · frozen 2026-10-03/);
  assert.match(t, /PBE NHL Model Bayern München 71\.4% vs Market at PBE lock Bayern München 80\.5¢/);
  assert.match(t, /Market price recorded 2 min before the algorithm locked/);
  // Non-qualifying statuses render nothing.
  assert.equal(castAvmHtml({ comparisons: [{ ...clone(FX.event.comparisons[0]), status: 'NO_HISTORICAL_MARKET_SNAPSHOT' }] }, GAME), '');
});

test('LOCKED rows show no selection, on the track record and on the Cast', () => {
  const r = lockedRow(FX.track.algos[0].ledger[0]);
  const card = algoVsMarketCard({ ...clone(FX.track.algos[0]), ledger: [r] }, { nameOf: () => 'CHI' });
  const row = card.slice(card.indexOf('<tbody>'), card.indexOf('</tbody>'));
  assert.match(row, /<td>Locked<\/td><td class="mono">—<\/td><td>—<\/td><td><b>Locked · pending<\/b><\/td>/);
  assert.doesNotMatch(row, /80\.5¢|71\.4%|CHI/);
  const ev = castAvmHtml({ comparisons: [lockedRow(FX.event.comparisons[0])] }, GAME);
  assert.match(text(ev), /Locked — revealed after the result/);
  const vs = ev.slice(ev.indexOf('avm__vs'), ev.indexOf('kx__note'));
  assert.match(vs, /<b>—<\/b>[\s\S]*<b>—<\/b>/);
  assert.doesNotMatch(vs, /Bayern|Augsburg|CHI|BUF|%|¢/);
});
