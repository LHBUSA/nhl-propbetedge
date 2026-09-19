// The consumer contract for preseason rehearsal picks.
//
// A rehearsal is a REAL locked call, so it must be shown; it is NOT an official
// pick, so it must never be labelled or counted as one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rehearsalCard, rehearsalSection, splitSquadNotice, splitSquadGames, REHEARSAL_BADGE } from '../src/pages/pbe-picks.js';

const call = {
  game_id: 2026010001, home: 'STL', away: 'DAL',
  puck_drop_utc: '2026-09-19T23:00:00Z', locked_at: '2026-09-19T21:15:07Z',
  is_call: true, pick_team: 'STL', probability: 0.507132815565031,
  p_home: 0.507132815565031, p_away: 0.492867184434969,
  model_version: 'pbe-nhl-model-v1.1-shadow-da0d82a0',
  market_at_lock: { state: 'UNPRICED', reason: 'odds_http_401' },
  official: false, rehearsal: true, record_class: 'PRESEASON_REHEARSAL'
};

test('a rehearsal card shows the pick, both probabilities, model and lock time', () => {
  const html = rehearsalCard(call);
  assert.match(html, /PBE PRESEASON REHEARSAL PICK/);
  assert.match(html, />STL</);
  assert.match(html, /DAL @ STL/);
  assert.match(html, /50\.7%/);
  assert.match(html, /49\.3%/);
  assert.match(html, /pbe-nhl-model-v1\.1-shadow-da0d82a0/);
  assert.match(html, /UNPRICED/);
});

test('a rehearsal card is never labelled official', () => {
  const html = rehearsalCard(call);
  assert.equal(/LOCKED_OFFICIAL/.test(html), false);
  assert.equal(/OFFICIAL MODEL LIVE/.test(html), false);
  assert.match(html, new RegExp(REHEARSAL_BADGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /excluded from the official record/i);
  assert.match(html, /not an official PBE pick/i);
});

test('a no-call renders as a no-call, never as a pick', () => {
  const html = rehearsalCard({ ...call, is_call: false, pick_team: null, probability: null, no_call_reason: 'exact_tie_no_call' });
  assert.match(html, /NO REHEARSAL CALL/);
  assert.match(html, /exact_tie_no_call/);
  assert.equal(/PBE PRESEASON REHEARSAL PICK/.test(html), false);
});

test('a graded rehearsal shows its result', () => {
  const html = rehearsalCard({ ...call, result: 'WIN', home_score: 4, away_score: 2 });
  assert.match(html, /WIN/);
  assert.match(html, /2–4/);
});

test('the section carries the rehearsal record, kept separate from the official one', () => {
  const html = rehearsalSection({
    preseason: { ok: true, games: [call] },
    preseasonRecord: { ok: true, locked_calls: 5, graded: 2, wins: 1, losses: 1, accuracy: 0.5, priced: 0, unpriced: 5, model_versions: ['pbe-nhl-model-v1.1-shadow-da0d82a0'] },
    splitSquad: []
  });
  assert.match(html, /2026 PRESEASON REHEARSAL RECORD/);
  assert.match(html, /1–1/);
  assert.match(html, /50\.0%/);
  assert.match(html, /kept separate from the official PBE record/);
  assert.equal(/LOCKED_OFFICIAL/.test(html), false);
});

test('no rehearsal data renders nothing rather than an empty promise', () => {
  assert.equal(rehearsalSection({ preseason: null }), '');
  assert.equal(rehearsalSection({ preseason: { ok: true, games: [] } }), '');
});

test('split-squad games are named and explained, never silently dropped', () => {
  const html = splitSquadNotice([{ home: 'TOR', away: 'MTL' }, { home: 'MTL', away: 'TOR' }]);
  assert.match(html, /SPLIT-SQUAD IDENTITY EXCLUDED/);
  assert.match(html, /MTL @ TOR/);
  assert.match(html, /TOR @ MTL/);
  assert.match(html, /cannot model them independently/);
});

test('split-squad detection mirrors the runner: a club twice on one date', () => {
  // the real picks-slate shape
  const slate = { games: [
    { game_id: 1, home: { abbrev: 'STL' }, away: { abbrev: 'DAL' } },
    { game_id: 2, home: { abbrev: 'TOR' }, away: { abbrev: 'MTL' } },
    { game_id: 3, home: { abbrev: 'MTL' }, away: { abbrev: 'TOR' } },
    { game_id: 4, home: { abbrev: 'SEA' }, away: { abbrev: 'VAN' } }
  ] };
  const flagged = splitSquadGames(slate);
  assert.equal(flagged.length, 2);
  assert.deepEqual(flagged.map(g => g.game_id).sort(), [2, 3]);
});

test('the official slate and the rehearsal block never share a state name', async () => {
  const src = await import('node:fs').then(fs => fs.readFileSync(new URL('../src/pages/pbe-picks.js', import.meta.url), 'utf8'));
  assert.match(src, /LOCKED_REHEARSAL/);
  // the rehearsal block must not reuse the official state
  const section = src.slice(src.indexOf('export function rehearsalSection'), src.indexOf('// ------------------------------------------------------------------ header'));
  assert.equal(/LOCKED_OFFICIAL/.test(section), false);
});
