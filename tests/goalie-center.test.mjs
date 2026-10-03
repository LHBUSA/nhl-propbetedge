// Goalie Center 3.0 frontend regressions. Fixtures are production payloads
// captured 2026-10-02 (nhl-metrics via nhl-gateway): STL@DAL live (2026020020),
// ANA@VGK pregame with NHL.com projections (2026020021), the league board.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.json') && url.includes('/src/')) return { format: 'json', shortCircuit: true, source: fs.readFileSync(fileURLToPath(url), 'utf8') };
    return nextLoad(url, context);
  }
});

const read = rel => JSON.parse(fs.readFileSync(new URL(`./fixtures/goalie-center/${rel}`, import.meta.url), 'utf8'));
const { sideView, seasonBlock, comparisonRows, sortBoard, primaryLine } = await import('../src/lib/goalie-center.js');
const { overviewCell, truthBlock, liveLine, seasonSection, recentForm, leagueBoard, comparisonTable } = await import('../src/components/goalie-center.js');
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const clone = x => JSON.parse(JSON.stringify(x));
const fmt = { fmtSv: v => (v === null || v === undefined ? '—' : Number(v).toFixed(3).replace(/^0/, '')), fmtNum: v => (v === null || v === undefined ? '—' : String(v)) };

const liveIntel = read('intel-2026020020-live.json');
const liveLane = read('live-2026020020.json');
const preIntel = read('intel-2026020021-pre.json');

test('LIVE game with an official starter renders CONFIRMED with that NHL id (no UNKNOWN)', () => {
  for (const side of ['away', 'home']) {
    const v = sideView(liveIntel.sides[side], liveLane.sides[side]);
    assert.equal(v.level, 'CONFIRMED');
    assert.equal(v.headline.id, liveLane.sides[side].starter.goalie_id);
    const html = overviewCell(v, { state: 'LIVE' });
    assert.match(html, /Confirmed/);
    assert.doesNotMatch(html, /Starter flag unavailable|Starter not reported/);
    assert.match(html, new RegExp(`#/player/${v.headline.id}`));
  }
  // The live lane alone (intelligence not loaded yet) is enough to confirm.
  const lone = sideView(null, liveLane.sides.home);
  assert.equal(lone.level, 'CONFIRMED');
  assert.equal(lone.headline.id, 8479979);
});

test('DAL identity: the headline goalie is the starter id (Oettinger), never a workload-sorted DeSmith', () => {
  const side = clone(liveIntel.sides.home);
  side.goalies.reverse(); // DeSmith first, as the old workload sort did
  side.starter = { status: 'PROJECTED', name: 'Jake Oettinger', goalie_id: 8479979, source: 'NHL.com' };
  const v = sideView(side, null);
  assert.equal(v.headline.id, 8479979);
  assert.ok(!v.others.some(o => o.id === 8479979));
  // The old failure shape (unresolved id): nobody takes the slot.
  side.starter = { status: 'PROJECTED', name: 'Jake Oettinger', goalie_id: null, source: 'NHL.com' };
  const u = sideView(side, null);
  assert.equal(u.headline, null);
  assert.equal(u.projectedUnmatched, true);
  assert.match(text(truthBlock(u)), /not matched to an NHL id/);
  assert.doesNotMatch(overviewCell(u, { state: 'PRE' }), /DeSmith/);
});

test('UNKNOWN never promotes the most recently active goalie', () => {
  const side = clone(preIntel.sides.away);
  side.starter = { status: 'UNKNOWN', goalie_id: null, name: null, basis: 'Starter not reported.' };
  const v = sideView(side, null);
  assert.equal(v.headline, null);
  assert.match(text(overviewCell(v, { state: 'PRE' })), /Starter not reported/);
});

test('pregame projections from production carry roster-bound ids', () => {
  for (const side of ['away', 'home']) {
    const v = sideView(preIntel.sides[side], null);
    assert.equal(v.level, 'PROJECTED');
    assert.ok(Number.isFinite(v.headline.id));
    assert.equal(v.headline.record.id, v.headline.id);
  }
});

test('early season: no current line -> "No 2026–27 regular-season appearance yet" + labelled baseline', () => {
  const g = { season_lines: { current: { season: '20262027', line: null }, previous: { season: '20252026', line: { season: '20252026', gp: 55, gs: 54, wins: 31, losses: 16, ot_losses: 5, saves: 1400, shots_against: 1520, goals_against: 120, save_pct: 0.921, gaa: 2.3, shutouts: 4 } } } };
  const html = text(seasonSection(g));
  assert.match(html, /No 2026–27 regular-season appearance yet/);
  assert.match(html, /2025–26 baseline/);
  assert.match(html, /prior season, not current/);
  assert.equal(primaryLine(g).baseline, true);
  assert.equal(seasonBlock(g).current, null);
});

test('pulled starter: STARTED keeps the original starter; IN NET NOW shows the replacement', () => {
  const lane = clone(liveLane.sides.home);
  const replacement = 8479193;
  lane.goalies.push({ id: replacement, name: 'C. DeSmith', toi: '10:00', toi_s: 600, saves: 5, shots_against: 5, goals_against: 0, save_pct: 1, integrity: { status: 'OK' } });
  lane.in_net = { goalie_id: replacement, net_empty_now: false };
  const v = sideView(liveIntel.sides.home, lane);
  assert.equal(v.headline.id, 8479979);
  assert.equal(v.inNet.goalie_id, replacement);
  assert.equal(v.inNet.same_as_starter, false);
  const html = text(truthBlock(v, { live: true }));
  assert.match(html, /Started .*Oettinger/);
  assert.match(html, /In net now .*DeSmith/);
  assert.match(html, /Replaced starter/);
});

test('saves: SA 30, GA 2 -> 28 saves rendered; held lines never show numbers; null is never 0', () => {
  const html = text(liveLine({ saves: 28, shots_against: 30, goals_against: 2, save_pct: 0.9333, toi: '47:18', decision: null, even_strength: { saves: 20, shots: 21 }, power_play: null, shorthanded: null, integrity: { status: 'OK' } }));
  assert.match(html, /Saves 28/); assert.match(html, /Shots faced 30/); assert.match(html, /Goals allowed 2/); assert.match(html, /\.933/); assert.match(html, /47:18/);
  assert.match(html, /20\/21 even strength/);
  const held = text(liveLine({ saves: 27, shots_against: 30, goals_against: 2, integrity: { status: 'HOLD', reason: 'Source fields disagree.' } }));
  assert.match(held, /Held/); assert.doesNotMatch(held, /Saves 27/);
  const nul = text(liveLine({ saves: null, shots_against: null, goals_against: null, save_pct: null, toi: null, integrity: { status: 'INCOMPLETE' } }));
  assert.doesNotMatch(nul, /\b0\b/); assert.doesNotMatch(nul, /\.000/);
  const fin = text(liveLine({ saves: 28, shots_against: 30, goals_against: 2, decision: 'O', integrity: { status: 'OK' } }, { final: true }));
  assert.match(fin, /Decision OTL/);
});

test('recent form keeps preseason separate and never fabricates zero', () => {
  const g = { recent_form: { regular: { last5: { appearances: 2, starts: 2, relief: 0, wins: 1, losses: 1, ot_losses: 0, saves: 50, shots_against: 54, goals_against: 4, save_pct: 0.9259, gaa: 2, shutouts: null, avg_shots_against: 27, toi_s: 7200 }, last10: null }, playoffs: {}, preseason: { last5: { appearances: 3, starts: null, relief: null, wins: 2, losses: 1, ot_losses: 0, saves: 70, shots_against: 75, goals_against: 5, save_pct: 0.9333, gaa: 1.67, shutouts: null, avg_shots_against: 25, toi_s: 10000 } } } };
  const html = recentForm(g);
  assert.match(html, /Regular season/); assert.match(html, /Preseason/);
  assert.match(html, /gc-form__pre/);
  assert.ok((text(html).match(/—/g) || []).length >= 3, 'unknown starts/shutouts render as —');
});

test('comparison shows values only, no verdict', () => {
  const a = sideView(liveIntel.sides.away, liveLane.sides.away);
  const h = sideView(liveIntel.sides.home, liveLane.sides.home);
  const rows = comparisonRows(a, h, fmt);
  const labels = rows.map(r => r[0]);
  for (const k of ['Status', 'Record', 'Starts', 'Saves', 'Goals allowed', 'SV%', 'GAA', 'Shutouts', 'Last 5 SV%', 'Rest']) assert.ok(labels.includes(k), k);
  const html = text(comparisonTable(rows, a, h));
  assert.doesNotMatch(html, /better goalie:|winner|edge to/i);
});

test('league board: sortable, one row per id, every row links to the player, GP/GS beside rates', () => {
  const league = read('league.json');
  const rows = sortBoard(league.goalies, 'save_pct');
  const ids = rows.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i - 1].save_pct >= rows[i].save_pct);
  const html = leagueBoard(league, rows, { sort: 'save_pct', minGs: 0 });
  assert.equal((html.match(/href="#\/player\/\d+"/g) || []).length, Math.min(rows.length, 50));
  assert.match(html, /<th class="num">GP<\/th>/);
  assert.ok(sortBoard(league.goalies, 'gs', { minGs: 2 }).every(r => r.gs >= 2));
});

test('page copy: no stale "we do not project starters" text, one GSAx note', () => {
  const src = fs.readFileSync(new URL('../src/pages/goalies.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /no licensed pregame source|do not project starters/);
  assert.equal((src.match(/GSAx/g) || []).length, 1);
  const matchup = fs.readFileSync(new URL('../src/pages/matchup.js', import.meta.url), 'utf8');
  assert.doesNotMatch(matchup, /does not project starters/);
});

test('starter basis: the official flag and the derived only-goalie-with-TOI inference are labelled apart', async () => {
  const { starterBasis, confirmedLabel } = await import('../src/lib/goalie-center.js');
  // propsports /nhl/game/:id/goalies (starter_basis), captured from production 2026-10-03.
  const flag = { status: 'CONFIRMED', goalie_id: 8482193, basis_code: 'BOXSCORE_STARTER_FLAG', starter_basis: 'OFFICIAL_STARTER_FLAG' };
  const derived = { status: 'CONFIRMED', goalie_id: 8480981, basis_code: 'BOXSCORE_ONLY_GOALIE_WITH_TOI', starter_basis: 'DERIVED_ONLY_GOALIE_WITH_TOI' };
  assert.equal(starterBasis(flag), 'OFFICIAL_STARTER_FLAG');
  assert.equal(starterBasis(derived), 'DERIVED_ONLY_GOALIE_WITH_TOI');
  assert.equal(confirmedLabel(flag), 'Confirmed · NHL starter flag');
  assert.equal(confirmedLabel(derived), 'Confirmed · only goalie with ice time');
  assert.doesNotMatch(confirmedLabel(derived), /flag/, 'the derived basis never claims the NHL flag');
  // nhl-metrics sends only basis_code: same mapping.
  assert.equal(starterBasis({ status: 'CONFIRMED', basis_code: 'BOXSCORE_ONLY_GOALIE_WITH_TOI' }), 'DERIVED_ONLY_GOALIE_WITH_TOI');
  // No basis outside CONFIRMED; an unknown basis is not invented.
  assert.equal(starterBasis({ status: 'PROJECTED', starter_basis: 'OFFICIAL_STARTER_FLAG' }), null);
  assert.equal(starterBasis({ status: 'UNKNOWN', basis_code: 'STARTER_FLAG_UNAVAILABLE' }), null);
  assert.equal(confirmedLabel({ status: 'CONFIRMED' }), 'Confirmed');
});

test('methodology states both confirmed bases and never says confirmed comes only from the flag', () => {
  const src = fs.readFileSync(new URL('../src/pages/methodology.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Only from the NHL box score starter flag/);
  assert.match(src, /OFFICIAL_STARTER_FLAG/);
  assert.match(src, /DERIVED_ONLY_GOALIE_WITH_TOI/);
  assert.match(src, /not an NHL starter flag/);
});
