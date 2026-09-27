// Compact Skater DNA in PBE Cast: stored snapshots only, canonical ids only,
// no goalie DNA, proxies never promoted, cached once, fails closed.
// Synthetic fixtures only (public repo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { _resetDnaCache, compactLines, loadDna, momentContext, peekDna, renderCompactDna } from '../src/lib/cast-dna.js';

const P = (o) => ({ period: 2, time_in_period: '05:00', elapsed_s: 1500, situation_code: '1551', side: 'away', players: [], ...o });
const roster = [{ id: 9990001, position: 'C' }, { id: 9990002, position: 'D' }, { id: 9990003, position: 'L' }, { id: 9990009, position: 'G' }];
const goal = P({ sort_order: 10, type: 'goal', players: [{ role: 'scorer', id: 9990001, name: 'Synth Alpha', side: 'away' }, { role: 'assist1', id: 9990002, name: 'Synth Beta', side: 'away' }, { role: 'goalie', id: 9990009, name: 'Synth Goalie', side: 'home' }] });
const shot = P({ sort_order: 20, type: 'shot-on-goal', players: [{ role: 'shooter', id: 9990003, name: 'Synth Gamma', side: 'away' }, { role: 'goalie', id: 9990009, side: 'home' }] });
const hit = P({ sort_order: 30, type: 'hit', players: [{ role: 'hitter', id: 9990002, side: 'away' }] });
const snap = (id, o = {}) => ({
  kind: 'skater', version: 'nhl-skater-dna/1.0.0', player_id: id, season: 20252026, peer_group: 'forward', rank_claim: true,
  qualification: { qualified: true }, population: { n: 401 },
  dimensions: {
    goal_scoring: { status: 'LIVE', score: 95 }, playmaking: { status: 'LIVE', score: 100 }, power_play: { status: 'LIVE', score: 88 },
    shot_generation: { status: 'LIVE', score: 89 }, shot_location: { status: 'PROXY', score: 97 }, faceoffs: { status: 'NOT_APPLICABLE', score: null },
    penalty_differential: { status: 'LIVE', score: 72 }
  },
  traits: { strongest: ['playmaking', 'goal_scoring', 'power_play'], watch: [] }, ...o
});

test('moment: latest eligible event at the cursor; hits are not a DNA context', () => {
  const ctx = momentContext([goal, shot, hit], { roster });
  assert.equal(ctx.sort_order, 20, 'the hit is skipped; the shot is the latest eligible event');
  assert.deepEqual(ctx.actors.map(a => [a.id, a.role, a.priority]), [[9990003, 'shooter', 'shot_generation']]);
});

test('moment: goal -> scorer + assists by canonical id; goalie never included', () => {
  const ctx = momentContext([goal], { roster });
  assert.deepEqual(ctx.actors.map(a => [a.id, a.role, a.priority]), [[9990001, 'scorer', 'goal_scoring'], [9990002, 'assist1', 'playmaking']]);
  assert.ok(!ctx.actors.some(a => a.id === 9990009));
});

test('moment: a player without a canonical id is never shown (no inference)', () => {
  const noId = P({ sort_order: 5, type: 'penalty', players: [{ role: 'committed_by', name: 'Unknown' }] });
  assert.equal(momentContext([noId], { roster }), null);
});

test('moment: the user selection wins; replay at the same cursor gives the same context', () => {
  assert.equal(momentContext([goal, shot], { roster, selectedSort: 10 }).sort_order, 10);
  const a = momentContext([goal, shot, hit].slice(0, 2), { roster });
  const b = momentContext([goal, shot, hit].slice(0, 2), { roster });
  assert.deepEqual(a, b);
});

test('moment: a power-play goal promotes Power Play for the advantaged skaters', () => {
  const ppGoal = { ...goal, situation_code: '1541', sort_order: 11 };
  const ctx = momentContext([P({ sort_order: 9, type: 'faceoff', situation_code: '1541', players: [] }), ppGoal], { roster });
  assert.equal(ctx.actors[0].priority, 'power_play');
});

test('compact lines: stored values verbatim; event dimension first; proxy never promoted; no overall score', () => {
  const s = snap(9990001);
  assert.deepEqual(compactLines(s, 'goal_scoring').map(l => [l.key, l.score, l.related]), [['goal_scoring', 95, true], ['playmaking', 100, false], ['power_play', 88, false]]);
  assert.ok(!compactLines(s, 'shot_location').some(l => l.key === 'shot_location'), 'PROXY dimension is not promoted to the headline');
  assert.ok(!compactLines(s, 'faceoffs').some(l => l.key === 'faceoffs'), 'NOT_APPLICABLE dimension is not shown');
  const html = renderCompactDna(s, { id: 9990001, priority: 'goal_scoring' }, { gameSeason: 20252026 });
  for (const v of ['95', '100', '88']) assert.match(html, new RegExp(`>${v}<`));
  assert.doesNotMatch(html, /overall|composite|average/i);
  assert.doesNotMatch(html, /because|caused|explains/i, 'DNA never claims to explain the event');
  assert.match(html, /href="#\/player\/9990001"/);
});

test('identity must match: a snapshot for another player renders nothing', () => {
  assert.equal(renderCompactDna(snap(9990002), { id: 9990001, priority: 'goal_scoring' }), '');
});

test('unqualified / early-season: measured-only copy, no score, no strength', () => {
  const html = renderCompactDna(snap(9990001, { qualification: { qualified: false }, rank_claim: false }), { id: 9990001, priority: 'goal_scoring' });
  assert.match(html, /Current season measured · percentile DNA not ranked yet/);
  assert.doesNotMatch(html, /cast-dna__lines/);
});

test('a different stored season is labelled with its own season', () => {
  assert.match(renderCompactDna(snap(9990001), { id: 9990001, priority: 'goal_scoring' }, { gameSeason: 20262027 }), /Latest stored DNA · 2025–26/);
});

test('cache: one request per player+season; 404 season falls back to latest; failures remembered', async () => {
  _resetDnaCache();
  const calls = [];
  const nhlImpl = async (path, params) => {
    calls.push(path + JSON.stringify(params));
    if (path === '/nhl/dna/meta') return { data: { published: true } };
    assert.equal(params.absent, 'empty', 'expected misses are asked as absent=empty (no failed request)');
    if (path === '/nhl/dna/players/9990001' && params.season) return { data: { ok: true, snapshot: null, status: 'NO_STORED_DNA' } };
    if (path === '/nhl/dna/players/9990001') return { data: { snapshot: snap(9990001) } };
    return { data: { ok: true, snapshot: null, status: 'NO_STORED_DNA' } };
  };
  const configured = async () => true;
  const a = await loadDna(9990001, 20262027, { nhlImpl, configured });
  assert.equal(a.status, 'ready');
  await loadDna(9990001, 20262027, { nhlImpl, configured });
  assert.equal(calls.filter(c => c.startsWith('/nhl/dna/players/9990001')).length, 2, 'season miss + latest fallback, then cached');
  const b = await loadDna(9990002, 20252026, { nhlImpl, configured });
  assert.equal(b.status, 'none');
  const n = calls.length;
  await loadDna(9990002, 20252026, { nhlImpl, configured });
  assert.equal(calls.length, n, 'a failure is not retried on every poll');
  assert.equal(peekDna(9990001, 20262027).snapshot.player_id, 9990001);
});

test('unpublished / unbound gateway: no player request at all', async () => {
  _resetDnaCache();
  const calls = [];
  const nhlImpl = async p => { calls.push(p); return { data: { published: false } }; };
  const r = await loadDna(9990001, 20252026, { nhlImpl, configured: async () => true });
  assert.equal(r.status, 'none');
  assert.deepEqual(calls, ['/nhl/dna/meta']);
});

test('PBE Cast wiring: moment card is isolated (try/catch) and never computes DNA', () => {
  const cast = readFileSync(new URL('../src/pages/cast.js', import.meta.url), 'utf8');
  const fn = cast.slice(cast.indexOf('function momentCard('), cast.indexOf('function pressureChart('));
  assert.match(fn, /try \{[\s\S]*\} catch \{/);
  assert.doesNotMatch(fn, /percentile\s*\(|Math\.(round|floor)\([^)]*score/);
  const lib = readFileSync(new URL('../src/lib/cast-dna.js', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /goalie-dna|Goalie DNA\b(?! is not released)/i);
});
