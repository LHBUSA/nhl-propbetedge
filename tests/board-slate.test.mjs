// ICE BOARD — hierarchy, slate truth and interaction-state guards.
//
// The page renders through pure functions (heroInner / slateView / picksBlock /
// quickLaunch / intelStatus / boardView), so every state below is asserted
// against stubbed API payloads with no browser and no network.
//
// Payload shapes are the LIVE responses captured from
// https://nhl-api.propbetedge.ai on 2026-09-18 (nhl-intel-v2 board,
// nhl-picks-read-v1 health/slate), not invented shapes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

// The Ice Board renders the "what changed" rail through components/player.js,
// which imports the reviewed-portrait manifest the way Vite resolves JSON.
// Node needs an import attribute for that, so the JSON load is taught here —
// the product source stays exactly as the bundler expects it.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.json')) return { format: 'json', shortCircuit: true, source: fs.readFileSync(fileURLToPath(url), 'utf8') };
    return nextLoad(url, context);
  }
});

const {
  boardView, countdownShort, heroInner, heroState, intelStatus, nextSlateFacts,
  picksBlock, picksBlockFacts, picksSlateDate, quickLaunch, slateCard, slateView, tools
} = await import('../src/pages/board.js');
const { capabilities, capabilityCounts, modePanel, seasonMode, SOURCE_REQUIRED } = await import('../src/components/mode.js');

const boardSource = fs.readFileSync('src/pages/board.js', 'utf8');
const modeSource = fs.readFileSync('src/components/mode.js', 'utf8');

// ------------------------------------------------------------- fixtures
const team = (id, abbrev, place, name) => ({
  id, abbrev, place, name,
  logo: `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`,
  dark_logo: `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`,
  score: null, sog: null
});
const scheduled = { state: 'FUT', schedule_state: 'OK', semantics: 'SCHEDULED', period: null, period_type: null, clock: null, seconds_remaining: null, clock_running: null, in_intermission: null, last_period_type: null };
const game = (id, startUtc, away, home, venue, date = '2026-09-19') => ({
  id, season: 20262027, game_type: 1, date, start_time_utc: startUtc,
  status: { ...scheduled }, venue, neutral_site: false,
  teams: { away, home }, broadcasts: [{ network: 'NHLN', market: 'N', country: 'US' }]
});

const DAL = team(25, 'DAL', 'Dallas', 'Stars');
const STL = team(19, 'STL', 'St. Louis', 'Blues');
const MTL = team(8, 'MTL', 'Montréal', 'Canadiens');
const TOR = team(10, 'TOR', 'Toronto', 'Maple Leafs');
const WPG = team(52, 'WPG', 'Winnipeg', 'Jets');
const EDM = team(22, 'EDM', 'Edmonton', 'Oilers');
const CHI = team(16, 'CHI', 'Chicago', 'Blackhawks');
const MIN = team(30, 'MIN', 'Minnesota', 'Wild');
const VGK = team(54, 'VGK', 'Vegas', 'Golden Knights');
const LAK = team(26, 'LAK', 'Los Angeles', 'Kings');
const VAN = team(23, 'VAN', 'Vancouver', 'Canucks');
const SEA = team(55, 'SEA', 'Seattle', 'Kraken');

const AT_START = [
  game('2026010001', '2026-09-19T23:00:00Z', DAL, STL, 'Enterprise Center'),
  game('2026010006', '2026-09-19T23:00:00Z', MTL, TOR, 'Scotiabank Arena'),
  game('2026010007', '2026-09-19T23:00:00Z', TOR, MTL, 'Centre Bell')
];
const NEXT_GAMES = [
  ...AT_START,
  game('2026010003', '2026-09-20T00:00:00Z', WPG, EDM, 'Rogers Place'),
  game('2026010004', '2026-09-20T00:00:00Z', CHI, MIN, 'Grand Casino Arena'),
  game('2026010005', '2026-09-20T01:00:00Z', VGK, LAK, 'Crypto.com Arena'),
  game('2026010002', '2026-09-20T01:00:00Z', VAN, SEA, 'Climate Pledge Arena')
];
const ALL_IDS = NEXT_GAMES.map(g => g.id);

const CALENDAR = { preseason_start: '2026-09-19', regular_season_start: '2026-09-29', regular_season_end: '2027-04-10', playoff_end: '2027-06-10' };
const ZERO_DAY = {
  schema: 'nhl-intel-v2', source: 'NHL', fetched_at: new Date().toISOString(), ttl_s: 30, stale_after_s: 300,
  date: '2026-09-18', season_phase: 'OFFSEASON', calendar: CALENDAR, counts: { total: 0 }, games: [],
  next_puck_drop: {
    start_time_utc: '2026-09-19T23:00:00Z', date: '2026-09-19', game_type: 1,
    games_at_start: AT_START, games_that_day: 7
  }
};
const NEXT_BOARD = {
  schema: 'nhl-intel-v2', source: 'NHL', fetched_at: new Date().toISOString(), ttl_s: 30, stale_after_s: 300,
  date: '2026-09-19', season_phase: 'PRESEASON', calendar: CALENDAR,
  counts: { total: 7, SCHEDULED: 7 }, games: NEXT_GAMES, next_puck_drop: ZERO_DAY.next_puck_drop
};
const MODEL_STATUS = { model_version: 'pbe-nhl-model-v1.1', status: 'shadow_candidate', publishable: false, official_model: null, shadow_running: false, lock_policy_version: 'lock-policy-v1.1-1' };
const HEALTH = {
  schema: 'nhl-picks-read-v1', model_status: MODEL_STATUS, publish_gate: { open: false, reason: 'no_official_model' },
  pipeline: {
    picks_published: false,
    lock_policy: { version: 'lock-policy-v1.1-1', target_lock_minutes_before_start: 45, window_opens_minutes_before_start: 105, window_closes_minutes_before_start: 15, max_market_age_hours: 12 },
    next_eligible_games: [], next_lock_window: null,
    latest_runs: { shadow_runner: { status: 'ok', started_at: '2026-09-18T13:40:36.114Z', finished_at: '2026-09-18T13:40:37.622Z' } },
    predictions: { expected: null, created: null, rejected: null, pre_lock: 0, no_call: 0, locked: 0 },
    locks: { official: 0, internal_shadow: 0 },
    grading_backlog: 0,
    stale_blockers: [{ kind: 'snapshot', blocker: 'no_run_recorded' }]
  }
};
const PICKS_SLATE = {
  schema: 'nhl-picks-read-v1', model_status: MODEL_STATUS, date: '2026-09-19', count: 7,
  games: NEXT_GAMES.map(g => ({
    game_id: g.id, start_utc: g.start_time_utc, state: 'FUT', schedule_state: 'OK',
    home: { abbrev: g.teams.home.abbrev, name: g.teams.home.name },
    away: { abbrev: g.teams.away.abbrev, name: g.teams.away.name },
    prediction_state: 'NONE',
    lock_window: { opens_utc: '2026-09-19T21:15:00.000Z', target_utc: '2026-09-19T22:15:00.000Z', closes_utc: '2026-09-19T22:45:00.000Z', policy_version: 'lock-policy-v1.1-1' }
  }))
};
const LOCKS = new Map(PICKS_SLATE.games.map(g => [g.game_id, { targetUtc: g.lock_window.target_utc, minutes: 45 }]));
const META = { schema: 'nhl-intel-v2', source: 'NHL', fetched_at: ZERO_DAY.fetched_at, ttl_s: 30, stale_after_s: 300, source_urls: [] };

const zeroState = () => ({
  date: '2026-09-18', filter: 'ALL',
  board: ZERO_DAY, meta: META, failed: false, error: null,
  today: ZERO_DAY, todayMeta: META, todayFailed: false,
  next: { board: NEXT_BOARD, meta: META },
  picks: { date: '2026-09-19', health: HEALTH, slate: PICKS_SLATE, healthError: null, slateError: null, locks: LOCKS },
  news: { items: [], meta: META }, market: null,
  env: { dataLayer: 'v2', odds: true }
});
const gameDayState = () => ({
  ...zeroState(), date: '2026-09-19', board: NEXT_BOARD, today: NEXT_BOARD, next: null
});

// ------------------------------------------- 1. next slate derivation
const next = nextSlateFacts(ZERO_DAY);
assert.equal(next.date, '2026-09-19', 'the next slate date comes from next_puck_drop');
assert.equal(next.isTomorrow, true, 'next_puck_drop.date is one day after the board date');
assert.equal(next.isToday, false);
assert.equal(next.gamesThatDay, 7, 'games_that_day is read, never counted from games_at_start');
assert.equal(next.atStart.length, 3, 'three games share the first puck drop');
assert.equal(next.opener, 'PRESEASON', 'the calendar, not a guess, decides that this is the preseason opener');
assert.equal(nextSlateFacts({ date: '2026-09-18' }), null, 'no next_puck_drop yields no next slate, not a fabricated one');

// ---------------------------------------------- 2. hero, state by state
const hero = heroState(ZERO_DAY);
assert.equal(hero.key, 'OPENER_TOMORROW');
assert.equal(hero.title, 'NHL preseason starts tomorrow', 'today the hero leads with the real league state');
assert.match(hero.deck, /7 preseason games/, 'the deck carries the real game count');
assert.match(hero.deck, /first puck drop 7:00 PM ET/, 'and the real first puck drop in ET');
assert.match(hero.deck, /3 games at the opening faceoff/, 'and how many share it');

const heroHtml = heroInner(zeroState());
for (const abbrev of ['DAL', 'STL', 'MTL', 'TOR']) {
  assert.ok(heroHtml.includes(`<b>${abbrev}</b>`), `the hero shows the real matchup ${abbrev}`);
}
assert.match(heroHtml, /View tomorrow&#39;s slate|View tomorrow's slate/, 'primary CTA opens tomorrow’s slate');
assert.match(heroHtml, /href="#\/pbe-picks\?date=2026-09-19"/, 'PBE Picks CTA carries the real next-slate date');
assert.match(heroHtml, /href="#\/cast"/, 'PBE Cast CTA points at the generic cast entry state');
assert.ok(heroHtml.includes('hero-ice') === false, 'the photograph is in the page shell, not re-rendered per state');
assert.match(heroHtml, /Sat, Sep 19/, 'the rail labels the day those matchups are on');

// Every other league state resolves to its own honest headline.
const at = (board, patch) => ({ ...board, ...patch });
assert.equal(heroState(at(ZERO_DAY, { next_puck_drop: { ...ZERO_DAY.next_puck_drop, date: '2026-09-29', start_time_utc: '2026-09-29T23:00:00Z', games_that_day: 12 } })).key, 'OPENING_NIGHT_AHEAD');
assert.equal(heroState(at(ZERO_DAY, { date: '2026-09-10' })).key, 'OPENER_AHEAD', 'before preseason: the opener is named with its date, not called tomorrow');
assert.equal(heroState(at(ZERO_DAY, { next_puck_drop: null })).key, 'NO_SCHEDULE', 'no future puck drop is stated, never filled in');
const gameDayHero = heroState(NEXT_BOARD);
assert.equal(gameDayHero.key, 'TODAY');
assert.equal(gameDayHero.title, '7 NHL preseason games today', 'game day says today, with the real count and game type');
assert.match(gameDayHero.deck, /First puck drop 7:00 PM ET/);
const liveBoard = at(NEXT_BOARD, { counts: { total: 7, LIVE: 2, FINAL: 1 } });
assert.equal(heroState(liveBoard).key, 'LIVE');
assert.match(heroState(liveBoard).title, /^2 NHL games live right now$/);
assert.match(heroInner({ ...gameDayState(), today: liveBoard, board: liveBoard }), /href="#\/cast">Open PBE Cast/, 'a live hero leads into PBE Cast');
const finalBoard = at(NEXT_BOARD, { counts: { total: 7, FINAL: 7 } });
assert.equal(heroState(finalBoard).key, 'FINAL');
assert.match(heroState(finalBoard).title, /are final$/);
assert.equal(heroState(null).key, 'LOADING', 'no board yet is a state, not an assumption');

// ------------------------------- 3. zero-game day: today empty, next slate up
const zero = slateView(zeroState());
assert.match(zero, /No NHL games today/, 'a zero-game day says so, plainly and immediately');
const [beforeNext, afterNext] = zero.split('class="nextslate"');
assert.ok(afterNext, 'a zero-game day surfaces a clearly labelled NEXT SLATE section');
assert.ok(!/data-game="/.test(beforeNext), 'tomorrow’s games are never rendered above the NEXT SLATE label');
assert.match(afterNext, /Next slate · tomorrow/, 'the section says which day it is');
assert.match(afterNext, /Saturday, September 19 · 7 preseason games/, 'with the real date and count');
for (const id of ALL_IDS) assert.ok(afterNext.includes(`data-game="${id}"`), `next slate card for ${id}`);
assert.ok(!/Ice Board · Today<\/span><h2>Saturday/.test(zero), 'the next slate never borrows today’s heading');

// ------------------------------------------------ 4. filters stay honest
assert.match(zero, /data-filters="quiet"/, 'four zero pills are not the primary interaction on an empty date');
assert.match(zero, /filters-quiet/, 'the filters collapse rather than disappear: the semantics are unchanged');
const gday = slateView(gameDayState());
assert.match(gday, /data-filters="primary"/, 'a date with games shows its filters');
assert.ok(!/filters-quiet/.test(gday), 'and shows them uncollapsed');
for (const f of ['ALL', 'LIVE', 'UPCOMING', 'FINAL']) {
  assert.ok(gday.includes(`data-filter="${f}"`), `${f} filter survives the redesign`);
  assert.ok(zero.includes(`data-filter="${f}"`), `${f} filter is still reachable on an empty date`);
}
assert.match(gday, /data-filter="UPCOMING" aria-pressed="false">Upcoming<span class="count">7<\/span>/, 'counts still describe the selected date');
// Fast navigation, derived from the real board only.
assert.match(zero, /data-goto="2026-09-18"[^>]*>\s*<b>Today<\/b>/, 'TODAY jump');
assert.match(zero, /data-goto="2026-09-19"[^>]*>\s*<b>Tomorrow<\/b>/, 'TOMORROW jump');
assert.ok(!/<b>Next slate<\/b>/.test(zero), 'NEXT SLATE is not duplicated when the next slate IS tomorrow');
const farState = { ...zeroState(), today: at(ZERO_DAY, { next_puck_drop: { ...ZERO_DAY.next_puck_drop, date: '2026-09-29' } }) };
assert.match(slateView(farState), /<b>Next slate<\/b>/, 'a next slate further out gets its own jump');

// ------------------------------------------------------ 5. game cards
const card = slateCard(NEXT_GAMES[0], { lock: LOCKS.get('2026010001'), odds: true, showDate: true });
assert.ok(card.includes('DAL') && card.includes('STL'), 'both clubs by abbreviation');
assert.ok(card.includes('Dallas Stars') && card.includes('St. Louis Blues'), 'and by name');
assert.match(card, /assets\.nhle\.com\/logos\/nhl\/svg\/DAL_dark\.svg/, 'official club marks come through the existing logo path');
assert.match(card, /Enterprise Center/, 'venue');
assert.match(card, /Preseason/, 'game type');
assert.match(card, /7:00 PM ET/, 'puck drop in ET');
assert.match(card, /MARKET NOT POSTED/, 'no market row while odds are configured is stated, not blank');
assert.match(card, /GOALIES NOT CONFIRMED/, 'goalies are never projected here');
assert.match(card, /PBE PICK LOCK T-45 · 6:15 PM ET/, 'the lock target is the picks policy, not a prediction');
assert.match(card, /href="#\/matchup\/2026010001"/);
assert.match(card, /href="#\/cast\/2026010001"/);
assert.match(card, /href="#\/pbe-picks\?date=2026-09-19"/);
assert.ok(!/\d{1,3}(?:\.\d+)?\s*%/.test(card), 'no percentage on a card with no model');
assert.ok(!/MARKET NOT POSTED/.test(slateCard(NEXT_GAMES[0], { odds: false })), 'with no market service configured the card claims nothing about a market');
const finalGame = { ...NEXT_GAMES[0], status: { ...scheduled, semantics: 'FINAL', last_period_type: 'REG' }, teams: { away: { ...DAL, score: 3, sog: 31 }, home: { ...STL, score: 2, sog: 28 } } };
const finalCard = slateCard(finalGame, { odds: true });
assert.match(finalCard, /STARTERS ON RECORD/, 'a finished game does have goalies on record');
assert.ok(!/GOALIES NOT CONFIRMED/.test(finalCard));
assert.match(finalCard, /is-winner/, 'the winner is marked from the real score');
const nullScore = slateCard({ ...NEXT_GAMES[0], status: { ...scheduled, semantics: 'FINAL' }, teams: { away: { ...DAL, score: 2, sog: null }, home: { ...STL, score: 1, sog: null } } }, {});
assert.match(nullScore, /—<small>SOG<\/small>/, 'a null SOG renders as an em dash, never 0');
assert.equal(countdownShort(null), '', 'no start time, no countdown');

// --------------------------------------------- 6. PBE Picks entry block
const facts = picksBlockFacts(zeroState());
assert.equal(facts.scheduled, 7, 'games scheduled comes from the picks slate count');
assert.equal(facts.lockMinutes, 45, 'the lock target is read from the frozen lock policy');
assert.equal(facts.official, 'None', 'publishable:false with no official_model is "None"');
assert.equal(facts.pipelineActive, true, 'a completed ok shadow run is the evidence for "active"');
assert.equal(facts.publishedPicks, 0, '0 published picks is a real 0');

const picks = picksBlock(zeroState());
assert.match(picks, /PBE is running the next slate/);
assert.match(picks, /Saturday, September 19 · 7 games/);
assert.match(picks, /MODEL RUNNING/);
assert.match(picks, /model rehearsals for this slate/i);
assert.match(picks, /href="#\/pbe-picks\?date=2026-09-19"/, 'and it links to the real PBE Picks slate');
assert.match(picks, /How picks are tracked/, 'methodology stays available without exposing internal operations');
// No pick, probability, edge or shadow value may appear here.
assert.ok(!/\d{1,3}(?:\.\d+)?\s*%/.test(picks), 'no percentage in the PBE Picks block');
assert.ok(!/(?<![\w.-])0\.\d+/.test(picks), 'no probability literal in the PBE Picks block');
assert.ok(!/pbe-badge--model/.test(picks), 'no official model/pick badge while nothing is published');
assert.ok(!/\bPBE PICK\b/.test(picks), 'the block never shows a selection');
assert.ok(!/shadow_candidate|internal_shadow/.test(picks), 'shadow values never reach the page');
assert.ok(!/Lock target|Prospective pipeline|Published picks|lock-policy|champion/i.test(picks), 'the consumer homepage does not expose model-governance internals');
// Pipeline absent: every field blanks out, nothing is assumed.
const down = { ...zeroState(), picks: { date: '2026-09-19', health: null, slate: null, healthError: { kind: 'pipeline_unavailable' }, slateError: null, locks: new Map() } };
const downHtml = picksBlock(down);
assert.match(downHtml, /UNAVAILABLE/);
assert.match(downHtml, /temporarily unavailable/i);
assert.ok(!/Lock target|Prospective pipeline|Published picks|lock-policy/i.test(downHtml), 'pipeline failure does not fall back to an internal status console');
// An official model must populate the same block without a redesign.
const official = { ...zeroState() };
const OFFICIAL_STATUS = { ...MODEL_STATUS, status: 'champion', publishable: true, official_model: 'pbe-nhl-model-v2.0' };
official.picks = {
  ...official.picks,
  health: { ...HEALTH, model_status: OFFICIAL_STATUS, pipeline: { ...HEALTH.pipeline, locks: { official: 7, internal_shadow: 0 } } },
  slate: { ...PICKS_SLATE, model_status: OFFICIAL_STATUS }
};
const officialHtml = picksBlock(official);
assert.match(officialHtml, /Official PBE Picks are live/);
assert.match(officialHtml, /PICKS LIVE/);
assert.match(officialHtml, /7 locked picks published for this slate/);
assert.ok(!/pbe-nhl-model-v2\.0|lock-policy/i.test(officialHtml), 'homepage stays consumer-facing even after an official model goes live');
assert.equal(picksSlateDate(zeroState()), '2026-09-19', 'an empty today asks the next slate');
assert.equal(picksSlateDate(gameDayState()), '2026-09-19', 'a populated date asks for itself');

// ----------------------------------- 7. capability states and interaction
const mode = seasonMode(ZERO_DAY, '2026-09-18');
const groups = capabilities(mode, { dataLayer: 'v2', odds: true });
const counts = capabilityCounts(groups);
assert.ok(counts.available >= 8, 'the working tools are counted, not listed as a wall');
assert.equal(counts.source, 3, 'three capabilities genuinely need a licensed source');
assert.ok(groups.source.every(c => c.state === SOURCE_REQUIRED && c.href === null), 'a source-required capability has nowhere to send anyone');
assert.ok(groups.available.every(c => c.href), 'every available capability is a link');

const panel = modePanel(mode, { dataLayer: 'v2', odds: true });
assert.match(panel, /NHL intelligence status/);
assert.match(panel, new RegExp(`<b class="mono">${counts.available}</b><span>tools live now`), 'the compact summary states the counts');
assert.match(panel, /<b class="mono">3<\/b><span>source required/);
assert.match(panel, /<details class="intel__detail">\s*<summary>/, 'the full matrix is behind a disclosure, closed by default');
assert.ok(!/<details class="intel__detail" open/.test(panel), 'and it does not open itself on the first viewport');
assert.match(modePanel(mode, { dataLayer: 'v2', odds: true }, { open: true }), /<details class="intel__detail" open>/, '#/?mode=1 still opens it');
// SOURCE REQUIRED is not an anchor anywhere.
for (const entry of groups.source) {
  const label = entry.label.replace(/&/g, '&amp;');
  const li = panel.split('<li').map(chunk => chunk.split('</li>')[0]).find(chunk => chunk.includes(label));
  assert.ok(li, `${entry.label} is rendered`);
  assert.match(li, /class="cap cap--source" aria-disabled="true"/, `${entry.label} is a disabled informational card`);
  assert.ok(!/<a /.test(li), `${entry.label} is not an anchor`);
  assert.match(li, /SOURCE REQUIRED|Source required/, `${entry.label} shows its state`);
}
assert.match(panel, /Projected starting goalies/);
// Awaiting entries say what they are waiting for, and only link where the
// destination has a useful current state of its own.
const awaitingCast = groups.awaiting.find(c => c.label === 'Live PBE Cast');
assert.equal(awaitingCast.href, '#/cast', 'the cast entry state is useful today (it picks a game)');
assert.equal(capabilities(mode, { dataLayer: 'v2', odds: false }).awaiting.find(c => c.label === 'Player prop markets').href, null,
  'with no market service there is nowhere useful to send anyone');
assert.ok(groups.awaiting.every(c => c.chip), 'every awaiting card says what it waits for, so none implies the data exists');

// ----------------------------------------- 8. quick launch: real routes only
const launch = quickLaunch({ env: { dataLayer: 'v2', odds: true } });
const ROUTES = ['#/cast', '#/shots', '#/lines', '#/players', '#/standings', '#/news', '#/props', '#/methodology'];
for (const href of ROUTES) assert.ok(launch.includes(`href="${href}"`), `Quick Launch links ${href}`);
assert.match(launch, /<svg class="ql__icon"/, 'each tool carries a real icon');
assert.ok(!tools({ odds: false }).some(t => t.href === '#/props'), 'Markets only appears when odds are configured');
assert.ok(tools({ odds: true }).every(t => /^#\/[a-z-]*$/.test(t.href)), 'every tool points at a generic route, never a fixture');

// ------------------------------------------ 9. no hardcoded id or date in hrefs
// Literal href text in the source (with every ${...} expression stripped) may
// not contain a game id or a date: those must come from the payload.
const literalHrefs = source => {
  const stripped = (() => {
    let s = source;
    for (let i = 0; i < 6; i += 1) s = s.replace(/\$\{[^{}]*\}/g, '');
    return s;
  })();
  return [...stripped.matchAll(/href="([^"]*)"/g)].map(m => m[1]);
};
for (const [name, source] of [['board.js', boardSource], ['mode.js', modeSource]]) {
  for (const href of literalHrefs(source)) {
    assert.ok(!/\d{10}/.test(href), `hardcoded game id in a ${name} href: ${href}`);
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(href), `hardcoded date in a ${name} href: ${href}`);
  }
}
// And in the RENDERED page: every id that appears in an href is a real id from
// the payload this render was given.
const rendered = boardView(zeroState());
for (const m of rendered.matchAll(/href="[^"]*?(\d{10})[^"]*"/g)) {
  assert.ok(ALL_IDS.includes(m[1]), `rendered href carries an id that is not in the payload: ${m[0]}`);
}
for (const m of rendered.matchAll(/href="[^"]*?date=(\d{4}-\d{2}-\d{2})[^"]*"/g)) {
  assert.ok(['2026-09-18', '2026-09-19'].includes(m[1]), `rendered href carries a date that is not in the payload: ${m[0]}`);
}

// ---------------------------------------- 10. hierarchy and truth, end to end
const order = ['hero__copy', '>Ice Board', 'class="nextslate"', 'class="picks-entry"', 'changes__empty', 'class="ql"', 'class="intel"']
  .map(marker => ({ marker, at: rendered.indexOf(marker) }));
assert.ok(order.every(o => o.at >= 0), `every block renders: ${order.filter(o => o.at < 0).map(o => o.marker)}`);
for (let i = 1; i < order.length; i += 1) {
  assert.ok(order[i].at > order[i - 1].at, `${order[i].marker} comes after ${order[i - 1].marker}`);
}
// The capability matrix must not be the first thing on the page any more.
assert.ok(rendered.indexOf('class="intel"') > rendered.indexOf('class="ql"'), 'the capability panel is last');
assert.ok(rendered.indexOf('hero__title') < rendered.indexOf('cap-cols'), 'hockey leads, the matrix follows');
// Nothing on the page invents a value.
assert.ok(!/\d{1,3}(?:\.\d+)?\s*%/.test(rendered), 'no percentage anywhere on the Ice Board with no published model');
// The word "Projected" may appear ONLY inside a source-required card, where it
// names the thing we do not have — never as a value the product offers.
const intel = intelStatus(zeroState());
const projectedChunks = intel.split('<li').map(c => c.split('</li>')[0]).filter(c => c.includes('Projected'));
assert.equal((intel.match(/Projected/g) || []).length, projectedChunks.length, 'every "Projected" is inside a capability card');
assert.ok(projectedChunks.every(c => c.includes('cap--source') && c.includes('aria-disabled="true"')), 'and every one of them is a disabled source-required card');
assert.ok(!/Math\.random/.test(boardSource) && !/Math\.random/.test(modeSource));

console.log('board slate checks: PASS');
