// Track Record ledger: a PRICED official pick shows its frozen PRICE and BOOK
// (full sportsbook name) with a lock tooltip; an UNPRICED pick keeps UNPRICED
// and a dash. Mounts the real page against a stub root and a stub fetch.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mount } from '../src/pages/track.js';

function stubRoot() {
  return { innerHTML: '', addEventListener: () => {}, removeEventListener: () => {}, contains: () => true };
}

const MODEL = { model_version: 'pbe-nhl-model-v1.2', status: 'champion', publishable: true, official_model: 'pbe-nhl-model-v1.2' };
const row = (gameId, matchup, pick, price) => ({
  game_id: gameId, season: 20262027, game_type: 2, game_date: '2026-10-02', start_utc: '2026-10-02T22:30:00+00:00',
  matchup, pick, probability: 0.58, model_version: 'pbe-nhl-model-v1.2', locked_at_utc: '2026-10-02T20:45:31+00:00',
  price, result: 'WIN', grade_revision: 1, grade_revisions_total: 1
});
const LEDGER = {
  ok: true, schema: 'nhl-picks-read-v1', model_status: MODEL, publish_gate: { open: true, reason: null }, semantics: 'CURRENT',
  count: 2, total: 2, limit: 25, offset: 0,
  picks: [
    row('2026020017', 'NYR @ DET', 'NYR', {
      state: 'PRICED', best_price: 115, best_book: 'williamhill_us', consensus_price: 119, book_count: 11,
      captured_at: '2026-10-02T20:40:00+00:00', closing_price: null, decimal_odds: 2.15, age_seconds: 331, source: 'LOCK',
      closing_book: null, closing_captured_at: null
    }),
    row('2026020015', 'EDM @ VAN', 'EDM', {
      state: 'UNPRICED', best_price: null, best_book: null, consensus_price: null, book_count: null, captured_at: null, closing_price: null
    })
  ]
};

test('PRICED ledger rows show PRICE + BOOK with a lock tooltip; UNPRICED rows stay UNPRICED', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = String(url);
    const body = u.includes('/track-record/ledger') ? LEDGER : { ok: true, model_status: MODEL, publish_gate: { open: true }, semantics: 'CURRENT' };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const root = stubRoot();
    const dispose = mount(root);
    await new Promise(r => setTimeout(r, 80));
    const html = root.innerHTML;
    const priced = html.split('<tr>').find(r => r.includes('NYR @ DET'));
    const unpriced = html.split('<tr>').find(r => r.includes('EDM @ VAN'));
    assert.ok(priced, 'priced row rendered');
    assert.match(priced, /\+115/, 'frozen American price');
    assert.match(priced, />Caesars</, 'full book name, not the provider key');
    assert.doesNotMatch(priced, /williamhill_us/);
    assert.match(priced, /title="Price captured at official pick lock\."/);
    assert.ok(unpriced, 'unpriced row rendered');
    assert.match(unpriced, />UNPRICED</);
    assert.doesNotMatch(unpriced, /title="Price captured/);
    if (typeof dispose === 'function') dispose();
  } finally {
    globalThis.fetch = realFetch;
  }
});
