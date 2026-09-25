// Player-page fight record: one season scope, one outcome rule, three surfaces
// (stat strip, PBE intelligence card, Fight History) that cannot disagree.
// Fixtures are real free-tier production payloads of
// GET https://nhl-api.propbetedge.ai/nhl/intel/fights/player/:id (2026-09-25):
//   8482116 Tim Stützle  — 2025-26: 1 fight, LOST the fan vote to Samuel Girard
//   8479398 Samuel Girard — the same fight from the winner's side
//   8475795 Dylan McIlrath — 2025-26 1-1-0 plus one 2026-27 PRESEASON fight
// Run: node --test tests/fight-record.test.mjs
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
const { defaultFightScope, fightRecordFor, fightSeasons, ledgerOutcome, recordText } = await import('../src/lib/fight-record.js');
const { fightOutcomeForPlayer } = await import('../src/lib/fights.js');
const { playerIntelSection } = await import('../src/components/player-intel.js');

const read = id => JSON.parse(fs.readFileSync(new URL(`./fixtures/fights-player-${id}.json`, import.meta.url), 'utf8'));
const STUTZLE = 8482116; const GIRARD = 8479398; const MCILRATH = 8475795;
const stutzle = read(STUTZLE); const girard = read(GIRARD); const mcilrath = read(MCILRATH);
const fight = stutzle.seasons.find(s => s.season === '20252026').fights[0];

test('the real fight: winner gets W, loser gets L, from both perspectives and both rule sets', () => {
  assert.equal(fight.result.winner_name, 'Samuel Girard');
  assert.equal(ledgerOutcome(fight, GIRARD).outcome, 'WIN');
  assert.equal(ledgerOutcome(fight, STUTZLE).outcome, 'LOSS');
  assert.equal(fightOutcomeForPlayer(fight, GIRARD).outcome, 'WIN', 'Cast rule agrees');
  assert.equal(fightOutcomeForPlayer(fight, STUTZLE).outcome, 'LOSS', 'Cast rule agrees');
  assert.equal(ledgerOutcome(fight, 8400000).outcome, 'UNRELATED');
});

test('winner receives 1-0-0 and loser 0-1-0 for 2025-26, matching the server summary', () => {
  const w = fightRecordFor(fightSeasons(girard, GIRARD), '20252026');
  const l = fightRecordFor(fightSeasons(stutzle, STUTZLE), '20252026');
  assert.equal(recordText(w.record), '1-0-0');
  assert.equal(recordText(l.record), '0-1-0');
  for (const [payload, id] of [[girard, GIRARD], [stutzle, STUTZLE], [mcilrath, MCILRATH]]) {
    for (const s of fightSeasons(payload, id)) {
      if (!s.summary) continue;
      const { w: sw, l: sl, d: sd } = s.summary.record;
      assert.deepEqual([s.record.w, s.record.l, s.record.d], [sw, sl, sd], `${id} ${s.season} equals the server ledger summary`);
    }
  }
});

test('identity is the player id: names only pick which fighter won', () => {
  const swapped = { ...fight, fighters: fight.fighters.map(p => ({ ...p, name: p.player_id === GIRARD ? 'S. Girard' : 'Tim Stutzle' })) };
  assert.equal(ledgerOutcome(swapped, GIRARD).outcome, 'WIN', 'initial + last name still resolves to the id');
  const noDiacritic = { ...fight, result: { ...fight.result, winner_name: 'Tim Stutzle' } };
  assert.equal(ledgerOutcome(noDiacritic, STUTZLE).outcome, 'WIN', 'Stützle == Stutzle');
  assert.equal(ledgerOutcome(noDiacritic, GIRARD).outcome, 'LOSS');
  // A winner name that matches BOTH fighters decides nothing (never W for both).
  const twins = { ...fight, fighters: fight.fighters.map(p => ({ ...p, name: 'Sam Girard' })) };
  assert.equal(ledgerOutcome(twins, GIRARD).decided, false);
  assert.equal(ledgerOutcome(twins, STUTZLE).decided, false);
  assert.equal(fightOutcomeForPlayer(twins, GIRARD).outcome, 'PENDING');
  // A winner name that matches neither decides nothing.
  const stranger = { ...fight, result: { ...fight.result, winner_name: 'Someone Else' } };
  assert.equal(ledgerOutcome(stranger, GIRARD).outcome, 'UNMATCHED');
  // Fewer than 5 votes decides nothing (server rule).
  const thin = { ...fight, result: { ...fight.result, vote_count: 4 } };
  assert.equal(ledgerOutcome(thin, GIRARD).outcome, 'TOO_FEW_VOTES');
});

test('prior-season fight appears when that season is selected; current season is 0-0-0 only when selected', () => {
  const seasons = fightSeasons(stutzle, STUTZLE);
  assert.deepEqual(seasons.map(s => s.season), ['20262027', '20252026']);
  assert.equal(recordText(fightRecordFor(seasons, '20252026').record), '0-1-0');
  assert.equal(fightRecordFor(seasons, '20252026').rows.length, 1);
  assert.equal(recordText(fightRecordFor(seasons, '20262027').record), '0-0-0');
  assert.equal(fightRecordFor(seasons, '20242025'), null, 'a season the ledger does not cover is unknown, not 0-0-0');
  assert.equal(recordText(null), '—');
  // The page's stat line is 2025-26, so History opens on 2025-26, not 2026-27.
  assert.equal(defaultFightScope(seasons, 20252026), '20252026');
  assert.equal(defaultFightScope(seasons, 20192020), '20262027', 'uncovered stat season falls back to the newest ledger season');
});

test('season switching never mixes records; career sums the seasons', () => {
  const seasons = fightSeasons(mcilrath, MCILRATH);
  const cur = fightRecordFor(seasons, '20262027');
  const prev = fightRecordFor(seasons, '20252026');
  const career = fightRecordFor(seasons, 'career');
  assert.equal(recordText(prev.record), '1-1-0');
  assert.equal(cur.rows.length, 1, 'the 2026-27 preseason fight is listed');
  assert.equal(cur.record.fights, 0, '...but never counted');
  assert.equal(cur.record.preseason, 1);
  assert.equal(recordText(cur.record), '0-0-0');
  assert.ok(cur.rows.every(r => r.season === '20262027') && prev.rows.every(r => r.season === '20252026'));
  assert.equal(recordText(career.record), '1-1-0');
  assert.equal(career.rows.length, cur.rows.length + prev.rows.length);
  assert.equal(career.label, '2025-26 to 2026-27');
});

test('stat strip, intelligence card and Fight History agree for the same season', async () => {
  // The page module needs a DOM only at mount; the render helpers are pure.
  const src = fs.readFileSync(new URL('../src/pages/player.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /currentSeasonId|loadFights|fightOutcomeForPlayer/, 'no second, current-season-only fight derivation');
  assert.match(src, /fightRecordFor\(fights, totals\.season\)/, 'stat strip uses the stat line season');
  assert.match(src, /defaultFightScope\(fights \|\| \[\], st\.totals\?\.season\)/, 'Fight History defaults to the stat line season');

  const seasons = fightSeasons(stutzle, STUTZLE);
  const card = playerIntelSection({ position: 'C' }, { tier: 'free', fightLedger: { data: stutzle }, winhl: null, fatigue: null }, seasons);
  const cardRow = card.match(/data-fight-intel="20252026"><b>2025-26<\/b> · (\d+) fights? · fan-vote <b>([\d-]+)<\/b>/);
  assert.ok(cardRow, 'card names the 2025-26 season explicitly');
  assert.equal(cardRow[2], recordText(fightRecordFor(seasons, '20252026').record));
  assert.equal(cardRow[1], '1');
  assert.doesNotMatch(card, /data-fight-intel="20262027"/, 'a season with no fights is not shown as a fight row');
});
