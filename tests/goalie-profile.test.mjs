// Goalie player profile repair (2026-10-06). Fixture = real production reads taken while NYI @ NYR (2026020048) was
// LIVE in the 3rd with Semyon Varlamov in net (tests/fixtures/goalie-profile-2026-10-06.json). The page said
// "Unnamed", "as of today · no opponent" (hardcoded) and "Next · Tue, Oct 6 · @ NYR" during the live game.
// Root cause: nhl-metrics only fills name/team from a current-season line (Varlamov has none, his last NHL season
// is 2024-25), the page passed the payload through unhydrated, and the hero treated any non-final game as "Next".
// Run: node --test tests/goalie-profile.test.mjs
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
const G = await import('../src/lib/player-game.js');
const { playerIntelSection } = await import('../src/components/player-intel.js');

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/goalie-profile-2026-10-06.json', import.meta.url), 'utf8'));
const LIVE_AT = Date.parse('2026-10-07T01:46:00Z'); // 9:46 pm ET Oct 6, P3 15:46
const V = fx.varlamov;
const ctxLive = () => G.withLiveStatus(G.clubGameContext(fx.nyi_schedule, 'NYI', LIVE_AT), fx.game_goalies.game.status);
const render = (p, pi) => playerIntelSection({ ...p, position: 'G' }, { tier: 'free', fightLedger: null, ...pi }, null);

test('Varlamov, NYI @ NYR live: LIVE (never Next), real opponent, live clock', () => {
  const sched = G.clubGameContext(fx.nyi_schedule, 'NYI', LIVE_AT);
  assert.equal(sched.state, 'LIVE', 'the schedule row already says LIVE');
  assert.equal(sched.opponent, 'NYR');
  const ctx = ctxLive();
  const hero = G.heroGameParts(ctx);
  assert.equal(hero.kicker, 'Live');
  assert.equal(hero.opp, '@ NYR');
  assert.equal(hero.time, '3rd 15:46');
  assert.equal(G.opponentCaption(ctx), 'LIVE @ NYR · 3rd 15:46');
});

test('Varlamov: identity hydrated from the profile, never Unnamed; confirmed live start is visible', () => {
  assert.equal(V.intel.name, null, 'fixture really is the unhydrated payload');
  const html = render(V.profile, { goalie: { data: V.intel }, ctx: ctxLive(), gameGoalies: fx.game_goalies });
  assert.doesNotMatch(html, /Unnamed/);
  assert.doesNotMatch(html, /no opponent/);
  assert.match(html, /<b>Semyon Varlamov<\/b>/);
  assert.match(html, /data-goalie-context="LIVE">LIVE @ NYR · 3rd 15:46/);
  assert.match(html, /data-start-state="LIVE START"/);
  assert.match(html, /Confirmed · only goalie with ice time/);
  assert.match(html, /0 GS \/ 0 GP in 7d .* completed games through 2026-10-06/, 'workload stays truthful about completed games');
});

test('Varlamov: 2024–25 is labelled a prior-season baseline; the 2026–27 sample is called out as empty', () => {
  const gv = G.hydrateGoalie(V.intel, V.profile, LIVE_AT);
  assert.equal(gv.baseline_source, 'profile');
  assert.equal(gv.baseline_line.season, 20242025, 'last NHL regular season; the 2025-26 AHL line is skipped');
  assert.equal(gv.baseline_line.shots_against, 262);
  assert.equal(gv.baseline_line.saves, 233);
  const html = render(V.profile, { goalie: { data: V.intel }, ctx: ctxLive(), gameGoalies: fx.game_goalies });
  assert.match(html, /2024–25 prior-season baseline SV%/);
  assert.match(html, /\.889/);
  assert.match(html, /2026–27 current-season sample: no completed NHL games yet/);
  assert.match(html, /Shot-location splits are 2024–25/);
});

test('normal current-season goalie (Shesterkin): current line kept, no prior-season label, live start shown', () => {
  const S = fx.shesterkin;
  const gv = G.hydrateGoalie(S.intel, S.profile, LIVE_AT);
  assert.equal(gv.name, 'Igor Shesterkin');
  assert.equal(gv.baseline_source === 'profile', false);
  const nyr = G.withLiveStatus(G.clubGameContext(fx.nyi_schedule, 'NYR', LIVE_AT), fx.game_goalies.game.status);
  assert.equal(G.opponentCaption(nyr), 'LIVE vs NYI · 3rd 15:46');
  const html = render(S.profile, { goalie: { data: S.intel }, ctx: nyr, gameGoalies: fx.game_goalies });
  assert.doesNotMatch(html, /prior-season baseline/);
  assert.match(html, /2026–27 current-season sample/);
  assert.match(html, /data-start-state="LIVE START"/);
});

test('confirmed upcoming starter: TODAY + STARTING TODAY; projected; another goalie confirmed = no badge', () => {
  const pre = Date.parse('2026-10-06T20:00:00Z'); // 4 pm ET, before puck drop
  const ctx = G.clubGameContext(fx.nyi_schedule.map((g) => (g.id === '2026020048' ? { ...g, status: { ...g.status, state: 'PRE', semantics: 'PREGAME' } } : g)), 'NYI', pre);
  assert.equal(ctx.state, 'TODAY');
  assert.equal(G.opponentCaption(ctx), 'TODAY @ NYR · 7:30 PM ET');
  const lane = (status, id = 8473575) => ({ teams: { away: { starter: { ...fx.game_goalies.teams.away.starter, status, goalie_id: id, starter_basis: 'OFFICIAL_STARTER_FLAG' } } } });
  assert.equal(G.goalieStartStatus(lane('CONFIRMED'), 8473575, 'TODAY').label, 'STARTING TODAY');
  assert.equal(G.goalieStartStatus(lane('PROJECTED'), 8473575, 'TODAY').label, 'PROJECTED STARTER');
  assert.equal(G.goalieStartStatus(lane('CONFIRMED', 8478009), 8473575, 'TODAY'), null, 'Sorokin confirmed: Varlamov gets no start badge');
  assert.equal(G.goalieStartStatus(lane('UNKNOWN'), 8473575, 'TODAY'), null);
});

test('NEXT and NO UPCOMING GAME states; never an invented opponent', () => {
  const after = Date.parse('2026-10-07T12:00:00Z');
  const ctx = G.clubGameContext(fx.nyi_schedule.map((g) => (g.id === '2026020048' ? { ...g, status: { ...g.status, semantics: 'FINAL' } } : g)), 'NYI', after);
  assert.equal(ctx.state, 'NEXT');
  assert.equal(G.opponentCaption(ctx), 'NEXT vs CHI · Thu, Oct 8');
  assert.equal(G.heroGameParts(ctx).kicker, 'Next');
  const none = G.clubGameContext([], 'NYI', after);
  assert.equal(G.opponentCaption(none), 'NO UPCOMING GAME');
  assert.equal(G.heroGameParts(none), null);
  const html = render(V.profile, { goalie: { data: V.intel }, ctx: none, gameGoalies: null });
  assert.match(html, />NO UPCOMING GAME</);
  assert.doesNotMatch(html, /data-start-state/);
});

test('goalies keep goalie intelligence and never get Skater DNA; skaters keep WinHL + the DNA mount', () => {
  const html = render(V.profile, { goalie: { data: V.intel }, ctx: ctxLive(), gameGoalies: fx.game_goalies });
  for (const block of ['gi-timeline', 'Recent SV%', 'League SV%', 'Save % by shot location', 'Pctile', 'PBE Goalie Form']) assert.ok(html.includes(block), block);
  assert.doesNotMatch(html, /nhl-dna|WinHL/);
  const skater = playerIntelSection({ position: 'C' }, { tier: 'free', winhl: null, fatigue: null, fightLedger: null }, null);
  assert.match(skater, /WinHL/);
  assert.doesNotMatch(skater, /goalie intelligence/i);
  // the Skater DNA mount is unchanged: fetched only for non-goalies
  const page = fs.readFileSync(new URL('../src/pages/player.js', import.meta.url), 'utf8');
  assert.match(page, /if \(p\.position !== 'G'\) \{\s*fetchSkaterDna\(id/);
});

test('season helpers', () => {
  assert.equal(G.currentSeason(LIVE_AT), 20262027);
  assert.equal(G.currentSeason(Date.parse('2027-03-01T00:00:00Z')), 20262027);
  assert.equal(G.seasonLabel(20242025), '2024–25');
  assert.equal(G.periodText({ period: 2, in_intermission: true }), 'End 2nd');
  assert.equal(G.periodText({ period: 4, period_type: 'OT', clock: '03:10' }), 'OT 03:10');
});
