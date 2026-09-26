// Skater DNA mount on the player profile. Fixture is SYNTHETIC (no real NHL data).
// Dark on everything except a 200 ok:true; goalies never mount; the browser only
// selects stored snapshots, it never computes a percentile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fetchSkaterDna, renderDnaPanel, selectSnapshot } from '../src/lib/player-dna-mount.js';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/nhl-dna-synthetic.json', import.meta.url), 'utf8'));
const payload = { ok: true, player_id: fx.alpha.snapshots[0].player_id, history: fx.alpha.history, snapshots: fx.alpha.snapshots };
const ok = data => async p => (p === '/nhl/dna/meta' ? { data: { ok: true, published: true } } : { data, meta: {} });
const yes = async () => true;
const fail = (status, kind) => async () => { const e = new Error(`HTTP ${status}`); e.status = status; e.kind = kind; throw e; };

test('renders on 200 ok:true', async () => {
  const d = await fetchSkaterDna(payload.player_id, { nhlImpl: ok(payload), configured: yes });
  assert.ok(d);
  assert.match(renderDnaPanel(d), /class="nhl-dna"/);
});

test('renders NOTHING on 451 / 404 / 400 / 503 / network / ok:false / empty / goalie payload', async () => {
  for (const impl of [fail(451, 'error'), fail(404, 'not_deployed'), fail(400, 'error'), fail(503, 'unavailable'), async () => { throw new TypeError('network'); },
    ok({ ok: false, status: 'PUBLICATION_BLOCKED_RIGHTS_REVIEW' }), ok({ ok: true, snapshots: [] }), ok({ ok: true, snapshots: [{ ...fx.alpha.snapshots[0], kind: 'goalie' }] })]) {
    assert.equal(await fetchSkaterDna(1, { nhlImpl: impl, configured: yes }), null);
  }
  assert.equal(renderDnaPanel(null), '');
});

test('requests the history route without the provenance-envelope requirement', async () => {
  let seen = null;
  await fetchSkaterDna(8000001, { configured: yes, nhlImpl: async (p, q, o) => { if (p === '/nhl/dna/meta') return { data: { published: true } }; seen = { p, o }; return { data: payload }; } });
  assert.equal(seen.p, '/nhl/dna/players/8000001/history');
  assert.equal(seen.o.requireSchema, false);
});

test('default season is the latest ACTUAL season, even when unranked (raw values, no percentiles)', () => {
  const s = selectSnapshot(payload);
  assert.equal(s.season, 20262027);
  assert.equal(s.qualification.qualified, false);
  const html = renderDnaPanel(payload);
  assert.match(html, /data-season="20262027"/);
  assert.ok(Object.values(s.dimensions).every(d => d.score === null));
  assert.ok(Object.values(s.dimensions).some(d => Object.values(d.components).some(c => c.value !== null)), 'raw measured values exist');
});

test('season switch selects a stored snapshot; unknown season falls back; nothing is recomputed', () => {
  const s = selectSnapshot(payload, '20242025');
  assert.equal(s, fx.alpha.snapshots.find(x => x.season === 20242025), 'the exact stored object');
  const html = renderDnaPanel(payload, { season: '20242025' });
  assert.match(html, /data-season="20242025"/);
  for (const [, d] of Object.entries(s.dimensions)) if (d.score !== null) assert.ok(html.includes(`>${d.score}<`), `stored score ${d.score} shown verbatim`);
  assert.equal(selectSnapshot(payload, '19991999').season, 20262027);
});

test('goalie profiles never mount: the page only fetches DNA for non-goalies', () => {
  const src = fs.readFileSync(new URL('../src/pages/player.js', import.meta.url), 'utf8');
  const i = src.indexOf('fetchSkaterDna(');
  assert.ok(i > 0);
  assert.match(src.slice(Math.max(0, i - 120), i), /if \(p\.position !== 'G'\)/);
  assert.ok(!/renderGoalieDnaNotice|GOALIE DNA/.test(src));
});

test('dark page makes no failing request: unbound gateway -> no call; unpublished meta -> no history call', async () => {
  const calls = [];
  const impl = async p => { calls.push(p); return p === '/nhl/dna/meta' ? { data: { ok: true, published: false } } : { data: payload }; };
  assert.equal(await fetchSkaterDna(1, { nhlImpl: impl, configured: async () => false }), null);
  assert.deepEqual(calls, [], 'gateway without DNA: nothing requested');
  assert.equal(await fetchSkaterDna(1, { nhlImpl: impl, configured: yes }), null);
  assert.deepEqual(calls, ['/nhl/dna/meta'], 'gated: only the always-200 meta probe');
});
