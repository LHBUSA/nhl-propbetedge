// The CONSUMER contract for preseason picks.
//
// Backend semantics are unchanged (record_class PRESEASON_REHEARSAL,
// official:false, rehearsal:true). This file asserts the PRESENTATION: a
// reader sees picks, not governance language, and the page never claims there
// are no picks while locked ones exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rehearsalCard, rehearsalSection, splitSquadNotice, splitSquadGames,
  preseasonRecordStrip, consumerModelName, picksMode, isPreseasonPickMode,
  preseasonPicks, PICKS_MODE, picksView
} from '../src/pages/pbe-picks.js';

const call = {
  game_id: 2026010001, home: 'STL', away: 'DAL',
  puck_drop_utc: '2026-09-19T23:00:00Z', locked_at: '2026-09-19T21:15:07Z',
  is_call: true, pick_team: 'STL', probability: 0.507132815565031,
  p_home: 0.507132815565031, p_away: 0.492867184434969,
  model_version: 'pbe-nhl-model-v1.1-shadow-da0d82a0',
  market_at_lock: { state: 'UNPRICED', reason: 'odds_http_401' },
  official: false, rehearsal: true, record_class: 'PRESEASON_REHEARSAL'
};

const stateWithPicks = {
  date: '2026-09-19',
  preseason: { ok: true, games: [call] },
  preseasonRecord: { ok: true, season: 20262027, locked_calls: 6, graded: 5, wins: 3, losses: 2, accuracy: 0.6, priced: 0, unpriced: 6, model_versions: [call.model_version] },
  splitSquad: [],
  slate: null, health: null, board: null, pro: null, account: { state: 'unknown' }
};

// ---- the pick is the star --------------------------------------------------
test('the card leads with the pick, not with governance language', () => {
  const html = rehearsalCard(call);
  assert.match(html, /PBE PRESEASON PICK/);
  assert.match(html, /STL/);
  assert.match(html, /50\.7%/);
  assert.match(html, /DAL @ STL/);
  assert.equal(/REHEARSAL/.test(html), false, 'rehearsal must not appear in consumer card copy');
  assert.equal(/shadow|publish gate|not an official/i.test(html), false);
});

test('the card badge is PRESEASON, never PRESEASON · REHEARSAL', () => {
  const html = rehearsalCard(call);
  assert.match(html, /pbe-badge--preseason">PRESEASON</);
  assert.equal(/PRESEASON · REHEARSAL/.test(html), false);
});

test('the model name is consumer-readable, not an artifact id', () => {
  assert.equal(consumerModelName('pbe-nhl-model-v1.1-shadow-da0d82a0'), 'PBE NHL v1.1');
  assert.equal(consumerModelName('pbe-nhl-model-v1.2'), 'PBE NHL v1.2');
  assert.equal(consumerModelName(null), 'PBE NHL model');
  const html = rehearsalCard(call);
  assert.match(html, /PBE NHL v1\.1/);
  assert.equal(/da0d82a0/.test(html), false, 'the raw artifact id must not be consumer copy');
});

test('the card carries puck drop, lock time, market and both probabilities', () => {
  const html = rehearsalCard(call);
  assert.match(html, /Puck Drop/);
  assert.match(html, /Locked/);
  assert.match(html, /UNPRICED/);
  assert.match(html, /49\.3%/);
});

test('the footer disclosure is small and said once', () => {
  const html = rehearsalCard(call);
  assert.match(html, /PRESEASON · Tracked separately from the regular-season record\./);
  const disclosures = html.match(/tracked separately/gi) || [];
  assert.equal(disclosures.length, 1, 'the separation is stated once per card, not repeatedly');
});

test('a no-call renders as NO PICK, never as a pick', () => {
  const html = rehearsalCard({ ...call, is_call: false, pick_team: null, probability: null, no_call_reason: 'exact_tie_no_call' });
  assert.match(html, /NO PICK/);
  assert.equal(/PBE PRESEASON PICK/.test(html), false);
});

test('a graded pick shows its result', () => {
  const html = rehearsalCard({ ...call, result: 'WIN', home_score: 4, away_score: 2 });
  assert.match(html, /WIN/);
  assert.match(html, /2–4/);
});

// ---- record strip ----------------------------------------------------------
test('the record strip is season-wide, never the visible-day count', () => {
  const html = preseasonRecordStrip({ season: 20262027, locked_calls: 6, graded: 5, wins: 3, losses: 2, accuracy: 0.6 }, 1);
  assert.match(html, /2026–27 PRESEASON RECORD/);
  assert.equal(/REHEARSAL/.test(html), false);
  assert.match(html, /<b>6<\/b><span>picks<\/span>/);
  assert.doesNotMatch(html, /<b>1<\/b><span>picks<\/span>/);
  assert.match(html, /3–2/);
  assert.match(html, /60\.0%/);
  assert.match(html, /do not count toward the regular-season PBE record/);
});

test('the record strip updates once results exist', () => {
  const html = preseasonRecordStrip({ season: 20262027, locked_calls: 5, graded: 3, wins: 2, losses: 1, accuracy: 0.6667 }, 1);
  assert.match(html, /2–1/);
  assert.match(html, /66\.7%/);
});

// ---- page mode -------------------------------------------------------------
test('preseason picks drive the page mode', () => {
  assert.equal(picksMode(stateWithPicks, []), PICKS_MODE.PRESEASON);
  assert.equal(isPreseasonPickMode(stateWithPicks), true);
  assert.equal(preseasonPicks(stateWithPicks).length, 1);
  // a no-call alone is not a pick
  const noCalls = { preseason: { ok: true, games: [{ ...call, is_call: false }] } };
  assert.equal(isPreseasonPickMode(noCalls), false);
  assert.equal(picksMode(noCalls, []), PICKS_MODE.NONE);
  assert.equal(picksMode({}, [{ prediction_state: 'LOCKED_OFFICIAL' }]), PICKS_MODE.OFFICIAL);
});

test('the hero never says nobody while preseason picks exist', () => {
  const html = picksView(stateWithPicks);
  assert.equal(/Right now: nobody/.test(html), false, 'the hero contradicted the picks on the same page');
  assert.equal(/NO OFFICIAL MODEL/.test(html), false);
  assert.match(html, /PBE NHL PICKS/);
  assert.match(html, /PBE Preseason Picks/);
  assert.match(html, /Model-generated NHL picks locked before puck drop/);
});

test('the hero shows the counts above the fold', () => {
  const html = picksView(stateWithPicks);
  const hero = html.slice(0, html.indexOf('</div>', html.indexOf('pks-hero__stats')));
  assert.match(hero, /locked before puck drop/);
  assert.match(hero, /preseason record/);
});

test('with no preseason picks the original hero is untouched', () => {
  const html = picksView({ date: '2026-09-19', preseason: null, slate: null, health: null, board: null, splitSquad: [] });
  assert.match(html, /NO OFFICIAL MODEL/);
  assert.equal(/Tonight's PBE Preseason Picks/.test(html), false);
});

test('picks are rendered above the official slate block', () => {
  const html = picksView(stateWithPicks);
  assert.ok(html.indexOf('pks-preseason') < html.indexOf('pks-slate'), 'the picks must come before the slate section');
});

// ---- split squad -----------------------------------------------------------
test('split-squad games say NO PICK · SPLIT SQUAD in plain language', () => {
  const html = splitSquadNotice([{ home: 'TOR', away: 'MTL' }, { home: 'MTL', away: 'TOR' }]);
  assert.match(html, /NO PICK · SPLIT SQUAD/);
  assert.match(html, /MTL @ TOR/);
  assert.match(html, /TOR @ MTL/);
  assert.match(html, /cannot reliably distinguish two rosters/);
  assert.equal(/IDENTITY EXCLUDED|REHEARSAL/.test(html), false, 'database language must not reach the reader');
});

test('split-squad detection mirrors the runner: a club twice on one date', () => {
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

// ---- separation still holds ------------------------------------------------
test('the section still never labels a preseason pick official', () => {
  const html = rehearsalSection(stateWithPicks);
  assert.equal(/LOCKED_OFFICIAL|OFFICIAL MODEL LIVE/.test(html), false);
  assert.match(html, /do not count toward the regular-season PBE record/);
});

test('no preseason data and no split squads renders nothing', () => {
  assert.equal(rehearsalSection({ preseason: null, splitSquad: [] }), '');
});
