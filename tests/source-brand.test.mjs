// Network source-brand standard (DATA · PropSports): customer surfaces carry no upstream branding or endpoint URLs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scan } from '../scripts/guard-source-brand.mjs';
import { customerSource, publisherUrl } from '../src/lib/brand.js';
import { freshStamp } from '../src/lib/freshness.js';

test('source-brand guard: src is clean', () => { assert.deepEqual(scan(), []); });
test('lane labels map to PropSports; named publisher keeps its credit', () => {
  assert.equal(customerSource('NHL'), 'PropSports');
  assert.equal(customerSource('NHL boxscore'), 'PropSports · boxscore');
  assert.equal(customerSource('NHL.com'), 'NHL.com');
  assert.equal(customerSource('Newsroom'), 'Newsroom');
});
test('source links: publisher pages only, never API endpoints', () => {
  assert.equal(publisherUrl('https://api-web.nhle.com/v1/gamecenter/1/boxscore'), null);
  assert.equal(publisherUrl('https://api.nhle.com/stats/rest/en/skater'), null);
  assert.match(publisherUrl('https://www.nhl.com/news/nhl-lineup-projections-2026-27-season'), /nhl\.com\/news/);
});
test('freshness stamp: no upstream URL, host or lane name in DOM text or attributes', () => {
  const html = freshStamp({ source: 'NHL', source_urls: ['https://api-web.nhle.com/v1/score/2026-10-03'], fetched_at: new Date().toISOString(), ttl_s: 30, stale_after_s: 300 }, { source: 'NHL boxscore' });
  assert.doesNotMatch(html, /nhle\.com|api-web|data-provenance/);
  assert.match(html, /title="DATA · PropSports · last observed/);
  assert.match(html, /PropSports · boxscore/);
});
