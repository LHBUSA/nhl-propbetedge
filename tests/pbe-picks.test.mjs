// PBE Picks — route, navigation, render and Pro-boundary guards.
//
// The page renders through pure functions (picksView / gameCardMarkup), so the
// "no official model" and "official picks" states are asserted here against
// stubbed API payloads without a browser. The Pro boundary is asserted
// functionally: loadPicksData is given spies and must not touch the /pro reader
// for a signed-out or unentitled account.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { NAV, MORE } from '../src/components/shell.js';
import {
  gameCardMarkup, loadPicksData, mergeSlate, picksView, probabilityText, proEligible
} from '../src/pages/pbe-picks.js';
import { trackView } from '../src/pages/track.js';

const picksSource = fs.readFileSync('src/pages/pbe-picks.js', 'utf8');
const trackSource = fs.readFileSync('src/pages/track.js', 'utf8');
const routerSource = fs.readFileSync('src/lib/router.js', 'utf8');
const shellSource = fs.readFileSync('src/components/shell.js', 'utf8');

// --------------------------------------------------------------- 1. route
assert.match(routerSource, /pattern: \/\^\\\/pbe-picks\$\/, id: 'picks'/, '#/pbe-picks is a registered route with id "picks"');
assert.match(routerSource, /import\('\.\.\/pages\/pbe-picks\.js'\)/, 'the picks page is lazily imported like every other route');
assert.match(fs.readFileSync('src/lib/backdrops.js', 'utf8'), /picks: 'picks'/, 'the picks route id maps to the picks backdrop plate');
assert.match(picksSource, /export function mount\(root, params, ctx\)/, 'the page exports the standard mount(root, params, ctx)');
assert.match(picksSource, /return \(\) => \{/, 'mount returns an unmount');

// ------------------------------------------------------------ 2. navigation
const navIds = NAV.map(n => n.id);
assert.deepEqual(navIds, ['board', 'picks', 'cast', 'props', 'shots'], 'desktop primary order: Ice Board, PBE Picks, PBE Cast, Props, Shot Lab');
const picksItem = NAV.find(n => n.id === 'picks');
assert.equal(picksItem.label, 'PBE Picks', 'desktop label');
assert.equal(picksItem.href, '#/pbe-picks');
assert.equal(picksItem.pro, true, 'PBE Picks carries the restrained gold PRO treatment flag');
assert.ok(MORE.some(m => m.id === 'news'), 'News stays in More on desktop');
assert.ok(MORE.some(m => m.id === 'track'), 'Track Record stays reachable from More');
assert.ok(!navIds.includes('news'), 'News is not promoted to the desktop primary nav');

// Mobile bottom nav: Board, PBE Picks, Cast, Props, More (News moved to More).
const bottom = shellSource.match(/const BOTTOM = \[([^\]]*)\]/)[1].split(',').map(s => s.trim().replace(/'/g, ''));
assert.deepEqual(bottom, ['board', 'picks', 'cast', 'props'], 'bottom nav ids (the fifth cell is the More button)');
assert.ok(!bottom.includes('news'), 'News is no longer in the mobile bottom nav');
assert.equal(picksItem.short, 'PBE Picks', 'the bottom nav says PBE Picks');
assert.match(shellSource, /picks: '<circle/, 'PBE Picks has its own bottom-nav icon');
assert.match(fs.readFileSync('src/styles/shell.css', 'utf8'), /\.mainnav > a\[data-pro\]/, 'the PRO nav treatment is styled, not inlined');

// ------------------------------- 3. no official model: structure, no values
// Payload shapes below are the LIVE nhl-picks-read-v1 responses captured from
// https://nhl-api.propbetedge.ai on 2026-09-18, not invented shapes.
const NO_MODEL_STATUS = {
  model_version: 'pbe-nhl-model-v1.1',
  status: 'shadow_candidate',
  publishable: false,
  official_model: null,
  shadow_running: false,
  lock_policy_version: 'lock-policy-v1.1-1'
};
const LIVE_HEALTH = {
  schema: 'nhl-picks-read-v1',
  model_status: NO_MODEL_STATUS,
  publish_gate: { open: false, reason: 'no_official_model' },
  pipeline: {
    picks_published: false,
    lock_policy: { version: 'lock-policy-v1.1-1', target_lock_minutes_before_start: 45, window_opens_minutes_before_start: 105, window_closes_minutes_before_start: 15, max_market_age_hours: 12 },
    next_eligible_games: [],
    next_lock_window: null,
    latest_runs: {},
    predictions: { expected: null, created: null, rejected: null, pre_lock: 0, no_call: 0, locked: 0 },
    locks: { official: 0, internal_shadow: 0 },
    grading_backlog: 0,
    stale_blockers: [{ kind: 'snapshot', blocker: 'no_run_recorded' }, { kind: 'scoring', blocker: 'no_run_recorded' }]
  }
};
const LIVE_SLATE_GAME = {
  game_id: '2026010001',
  start_utc: '2026-09-19T23:00:00Z',
  state: 'FUT',
  schedule_state: 'OK',
  home: { abbrev: 'STL', name: 'Blues' },
  away: { abbrev: 'DAL', name: 'Stars' },
  prediction_state: 'NONE',
  lock_window: { opens_utc: '2026-09-19T21:15:00.000Z', target_utc: '2026-09-19T22:15:00.000Z', closes_utc: '2026-09-19T22:45:00.000Z', policy_version: 'lock-policy-v1.1-1' }
};
const BOARD = {
  date: '2026-09-19',
  games: [{
    id: '2026010001',
    start_time_utc: '2026-09-19T23:00:00Z',
    game_type: 1,
    venue: 'Enterprise Center',
    status: { semantics: 'SCHEDULED', period: 1, period_type: 'REG' },
    teams: {
      away: { abbrev: 'DAL', name: 'Stars', place: 'Dallas' },
      home: { abbrev: 'STL', name: 'Blues', place: 'St. Louis' }
    }
  }],
  next_puck_drop: { start_time_utc: '2026-09-19T23:00:00Z', date: '2026-09-19' }
};
const emptyState = {
  date: '2026-09-19',
  slate: { schema: 'nhl-picks-read-v1', model_status: NO_MODEL_STATUS, publish_gate: { open: false, reason: 'no_official_model' }, date: '2026-09-19', count: 1, games: [LIVE_SLATE_GAME] },
  slateMeta: { fetched_at: new Date().toISOString(), source: 'PBE Picks', ttl_s: 60, stale_after_s: 600 },
  slateError: null,
  health: LIVE_HEALTH,
  healthMeta: null, healthError: null,
  board: BOARD, boardMeta: null, boardError: null,
  pro: null, proError: null,
  account: { state: 'signed_out' }
};

const emptyHtml = picksView(emptyState);
assert.match(emptyHtml, /Who does the PBE algorithm pick/, 'the page answers the question it is named for');
assert.match(emptyHtml, /NO OFFICIAL MODEL/, 'the no-champion state is stated up front');
assert.match(emptyHtml, /shadow_candidate/, 'the real model lifecycle from the API is shown');
assert.match(emptyHtml, /pbe-nhl-model-v1\.1/, 'the real model version from the API is shown');
assert.match(emptyHtml, /DAL/, 'real game identity is rendered');
assert.match(emptyHtml, /STL/, 'real game identity is rendered');
assert.match(emptyHtml, /What the pipeline is doing/, 'the lock pipeline block is present');
assert.match(emptyHtml, /What PBE Picks is/, 'the explanation block is present');
assert.match(emptyHtml, /NHL Pro/, 'the Pro entry point is present');
assert.match(emptyHtml, /href="#\/track-record"/, 'Track Record is linked prominently');
assert.match(emptyHtml, /href="#\/methodology"/, 'Methodology is linked prominently');
assert.match(emptyHtml, /No official pick is published for this game/, 'each card states the absence honestly');
assert.ok(!/PBE PICK</.test(emptyHtml), 'no pick badge without a pick');
// Live contract details must actually land on screen.
assert.match(emptyHtml, /NONE/, 'the API prediction_state is rendered verbatim');
assert.match(emptyHtml, /PUBLISH GATE CLOSED · no_official_model/, 'the server-decided publish gate is shown with its reason');
assert.match(emptyHtml, /opens .* · target .* · closes /, 'the real lock window (opens/target/closes) is rendered');
assert.match(emptyHtml, /Stale blockers/, 'stale blockers are surfaced');
assert.match(emptyHtml, /snapshot: no_run_recorded/, 'each stale blocker is named, not counted');
// 0 is an answer; null is not. Both must be distinguishable on screen.
assert.match(emptyHtml, /Grading backlog<\/dt><dd class="mono">0</, 'a real zero prints as 0');
assert.match(emptyHtml, /Predictions expected<\/dt><dd class="mono">—</, 'a null prints as an em dash, never as 0');
// No fabricated numbers: nothing that looks like a probability is on screen.
const stripped = emptyHtml.replace(/<!--[\s\S]*?-->/g, '');
assert.ok(!/\d{1,3}(?:\.\d+)?\s*%/.test(stripped), 'no percentage is rendered while no model publishes');
assert.ok(!/\bp_home\b|\bp_away\b/.test(stripped), 'no Pro probability key leaks into the free render');

// A gateway that does not carry the routes yet must read as unavailable, not NONE.
const absent = picksView({
  ...emptyState,
  slate: null,
  slateMeta: null,
  slateError: Object.assign(new Error('Unsupported path'), { kind: 'pipeline_unavailable', status: 400, payload: { error: 'Unsupported path' } }),
  health: null,
  healthError: Object.assign(new Error('Unsupported path'), { kind: 'pipeline_unavailable', status: 400, payload: { error: 'Unsupported path' } })
});
assert.match(absent, /not available in this environment/, 'an absent pipeline is stated, not guessed');
assert.match(absent, /Unsupported path/, "the gateway's own words are quoted");
assert.match(absent, /PREDICTION STATE UNAVAILABLE/, 'an unknown prediction state is never rendered as NONE');
assert.ok(!/\d{1,3}(?:\.\d+)?\s*%/.test(absent), 'nothing numeric is invented when the pipeline is absent');

// ------------------------------- 4. official picks render with no redesign
const OFFICIAL_STATUS = {
  model_version: 'pbe-nhl-model-v2.0',
  status: 'champion',
  publishable: true,
  official_model: 'pbe-nhl-model-v2.0',
  shadow_running: true,
  lock_policy_version: 'lock-v1'
};
const officialState = {
  ...emptyState,
  account: { state: 'pro' },
  slate: {
    model_status: OFFICIAL_STATUS,
    games: [{ game_id: '2026010001', prediction_state: 'LOCKED_OFFICIAL', state: 'SCHEDULED', start_utc: '2026-09-19T23:00:00Z', lock_window: { state: 'CLOSED', closes_utc: '2026-09-19T22:30:00Z' } }]
  },
  health: { model_status: OFFICIAL_STATUS },
  pro: {
    model_status: OFFICIAL_STATUS,
    picks: [{
      game_id: '2026010001',
      pick_team: 'STL',
      p_home: 0.582,
      p_away: 0.418,
      model_version: 'pbe-nhl-model-v2.0',
      model_artifact_sha256: 'abc123def456abc123def456',
      feature_snapshot_id: 'snap-991',
      generated_at_utc: '2026-09-19T21:00:00Z',
      locked_at_utc: '2026-09-19T22:30:00Z',
      lock_policy_version: 'lock-v1',
      reasons: ['Rest advantage', 'Home shot-share edge'],
      market: {
        state: 'PRICED', market_snapshot_id: 'mkt-7', captured_at: '2026-09-19T22:29:00Z', age_seconds: 60,
        best_price: -118, best_book: 'BookA', consensus_price: -122, book_count: 6,
        market_prob: 0.541, no_vig_prob: 0.529, pbe_prob: 0.582, delta_pts: 5.3
      },
      goalies: {
        home: { state: 'CONFIRMED', name: 'Jordan Binnington', source: 'NHL', captured_at: '2026-09-19T21:45:00Z' },
        away: { state: 'PROJECTED', name: 'Jake Oettinger', source: 'NHL', captured_at: '2026-09-19T21:45:00Z' },
        not_a_model_input: true
      }
    }]
  }
};
const officialHtml = picksView(officialState);
assert.match(officialHtml, /LOCKED_OFFICIAL/, 'the official prediction state is shown');
assert.match(officialHtml, /PBE PICK/, 'the selected side is marked');
assert.match(officialHtml, /58\.2%/, 'the selected probability comes through unchanged');
assert.match(officialHtml, /41\.8%/, 'the opponent probability is shown beside it');
assert.match(officialHtml, /pbe-nhl-model-v2\.0/, 'the model version rides with the pick');
assert.match(officialHtml, /Captured snapshot/, 'market context is labelled as a snapshot');
assert.match(officialHtml, /not a live price/i, 'a cached snapshot is never labelled live');
assert.ok(!/\blive\b(?![^<]*not a live price)/i.test(officialHtml.match(/<div class="pkc-market">[\s\S]*?<\/div>/)?.[0] || ''), 'the market block never says live');
assert.match(officialHtml, /NOT A MODEL INPUT/, 'goalie context is explicitly not a model input');
assert.match(officialHtml, /-118/, 'the recorded price is the API value');
assert.match(officialHtml, /Rest advantage/, 'approved reasons are listed');
// Same components, no redesign: the card class vocabulary is identical.
for (const cls of ['pkc__head', 'pkc__teams', 'pkc__lock', 'pkc__actions']) {
  assert.ok(emptyHtml.includes(cls) && officialHtml.includes(cls), `both states use .${cls}`);
}

// A pick whose pick_team matches neither side must not borrow a probability.
const mismatched = gameCardMarkup(mergeSlate({
  slate: officialState.slate,
  board: BOARD,
  pro: { picks: [{ game_id: '2026010001', pick_team: 'XXX', p_home: 0.6, p_away: 0.4 }] }
})[0], { pipelineAvailable: true });
assert.ok(!/class="mono pkc-pick__p"/.test(mismatched), 'an unrecognised pick_team yields no headline probability');

// ------------------------------------------------- 5. the free/Pro boundary
{
  const calls = [];
  const publicSlate = async () => { calls.push('slate'); return { data: { model_status: NO_MODEL_STATUS, games: [] }, meta: null }; };
  const publicHealth = async () => { calls.push('health'); return { data: {}, meta: null }; };
  const proSlate = async () => { calls.push('pro'); return { ok: true, status: 200, data: { picks: [] } }; };

  for (const state of ['signed_out', 'unknown', 'not_entitled', 'free']) {
    calls.length = 0;
    const out = await loadPicksData({ date: '2026-09-19', account: { state }, publicSlate, publicHealth, proSlate });
    assert.ok(!calls.includes('pro'), `account state "${state}" must never reach a /pro/ route`);
    assert.equal(out.proRequested, false);
    assert.equal(out.pro, null);
    assert.equal(proEligible({ state }), false);
  }

  calls.length = 0;
  const pro = await loadPicksData({ date: '2026-09-19', account: { state: 'pro' }, publicSlate, publicHealth, proSlate });
  assert.ok(calls.includes('pro'), 'an entitled account does read the Pro route');
  assert.equal(pro.proRequested, true);
  assert.deepEqual(pro.pro, { picks: [] });

  // A refused Pro response carries no values and is reported, not swallowed.
  calls.length = 0;
  const refused = await loadPicksData({
    date: '2026-09-19', account: { state: 'pro' }, publicSlate, publicHealth,
    proSlate: async () => ({ ok: false, status: 402, data: { error: 'no active nhl_pro entitlement' } })
  });
  assert.equal(refused.pro, null);
  assert.match(refused.proError, /entitlement/);
}

// Only account.js may speak to /pro; the page must go through it.
assert.match(picksSource, /from '\.\.\/lib\/account\.js'/, 'Pro data is read through account.js');
assert.ok(!/credentials:\s*'include'/.test(picksSource), 'the picks page never fetches with credentials itself');
assert.ok(!/fetch\(/.test(picksSource), 'the picks page never calls fetch directly');
assert.match(picksSource, /proEligible\(account\)/, 'the Pro read is gated on the gateway-decided account state');

// ------------------------------------- 6. no hardcoded pick/probability data
for (const [name, source] of [['pbe-picks.js', picksSource], ['track.js', trackSource]]) {
  assert.ok(!/\d{1,3}(?:\.\d+)?\s*%/.test(source), `${name}: no hardcoded percentage literal`);
  assert.ok(!/(?<![\w.])0\.\d+/.test(source), `${name}: no hardcoded probability literal`);
  assert.ok(!/pick_team\s*[:=]\s*['"]/.test(source), `${name}: no hardcoded pick`);
  assert.ok(!/\b(?:sample|demo|example|placeholder|fake|mock)[_ ]?(?:pick|row|game|record)\b/i.test(source), `${name}: no sample rows`);
  assert.ok(!/Math\.random/.test(source), `${name}: no randomness`);
}

// -------------------------------------------- 7. Track Record reads the API
assert.match(trackSource, /picksTrackRecord/, 'track record reads /nhl/picks/track-record');
assert.match(trackSource, /picksLedger/, 'track record reads /nhl/picks/track-record/ledger');
assert.ok(!/Sep 11, 2026|Not built yet/.test(trackSource), 'the dated static statement is gone');

// Live nhl-picks-read-v1 shape: lifetime is null, models is empty, `reason` is a
// machine code and `detail` is the human sentence.
const LIVE_DETAIL = 'No official NHL model has been released. The model in the ledger is a shadow candidate: it is not publishable, has no champion and has no official record.';
const trackEmpty = trackView({
  modelVersion: '',
  record: { schema: 'nhl-picks-read-v1', model_status: NO_MODEL_STATUS, lifetime: null, models: [], reason: 'no_official_model', detail: LIVE_DETAIL },
  recordMeta: null, recordError: null,
  ledger: { schema: 'nhl-picks-read-v1', count: 0, total: 0, limit: 50, offset: 0, picks: [], reason: 'no_official_model', detail: LIVE_DETAIL },
  ledgerMeta: null, ledgerError: null
});
assert.match(trackEmpty, /shadow candidate: it is not publishable/, "the empty state quotes the API's own detail sentence");
assert.match(trackEmpty, /as “no_official_model”/, 'the API reason code is shown beside it');
assert.ok(!/0 graded|Locked predictions<\/dt><dd class="mono">0/.test(trackEmpty), 'a null aggregate is never rendered as zero');
assert.match(trackEmpty, /Rules the ledger is held to/, 'the rules section is kept');
assert.match(trackEmpty, /Shadow models stay internal/, 'the shadow-models section is kept');
assert.match(trackEmpty, /Locked calls/, 'the metric labels stay visible while empty');
assert.match(trackEmpty, /Brier/, 'Brier is a declared metric');
assert.match(trackEmpty, /Log loss/, 'log loss is a declared metric');
assert.match(trackEmpty, /UNPRICED/, 'priced vs UNPRICED is a declared metric');
assert.ok(!/\d{1,3}(?:\.\d+)?\s*%/.test(trackEmpty), 'no rate is shown when the API returned none');
assert.ok((trackEmpty.match(/—/g) || []).length >= 10, 'every unreturned metric renders as an em dash');

const trackFull = trackView({
  modelVersion: '',
  record: {
    model_status: { ...NO_MODEL_STATUS, model_version: 'pbe-nhl-model-v2.0', publishable: true },
    lifetime: { locked_calls: 120, wins: 68, losses: 52, hit_rate: 0.5667, brier: 0.2291, log_loss: 0.6612, priced: 101, unpriced: 19, roi: 3.4, clv: 1.2, sample_size: 120 },
    models: [
      { model_version: 'pbe-nhl-model-v2.0', locked_calls: 90, wins: 52, losses: 38, hit_rate: 0.5778, brier: 0.2275, log_loss: 0.6588, priced: 80, unpriced: 10, roi: 4.1, clv: 1.5, sample_size: 90 },
      { model_version: 'pbe-nhl-model-v1.9', locked_calls: 30, wins: 16, losses: 14, hit_rate: 0.5333, brier: 0.2340, log_loss: 0.6680, priced: 21, unpriced: 9, roi: -1.0, clv: 0.2, sample_size: 30 }
    ]
  },
  recordMeta: null, recordError: null,
  ledger: {
    count: 1, total: 1,
    picks: [{
      locked_at_utc: '2026-11-02T23:30:00Z', matchup: 'DAL @ STL', pick: 'STL', probability: 0.582,
      model_version: 'pbe-nhl-model-v2.0', recorded_price: -118, recorded_book: 'BookA',
      closing_price: -126, result: 'WIN', grade_revision: 1
    }]
  },
  ledgerMeta: null, ledgerError: null
});
assert.match(trackFull, /DAL @ STL/, 'ledger rows render');
assert.match(trackFull, /56\.7%/, 'the lifetime hit rate is formatted from the API value');
assert.match(trackFull, /pbe-nhl-model-v1\.9/, 'a retired model version is never filtered out');
assert.match(trackFull, /data-model="pbe-nhl-model-v2\.0"/, 'a per-model-version filter is offered');
assert.match(trackFull, /\+3\.40/, 'ROI is shown signed, as returned');

console.log('PBE Picks: PASS — route, nav, honest empty state, official render, Pro boundary, ledger read');
