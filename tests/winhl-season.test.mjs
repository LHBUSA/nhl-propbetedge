// WinHL season default. The current NHL season (2026–27) is the default and
// headline on every WinHL surface; preseason is never the default; 2025–26
// stays selectable; the page asks the API for its default instead of naming a
// season. Fixtures are produced by the real nhl-metrics serializer
// (propsports-api-worker nhl-metrics/test/winhl-season.test.mjs feed: a
// synthetic 2026-27 feed two days into the regular season, plus the archived
// 2025-26 board); player names in the 2026-27 fixtures are synthetic.
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

const read = rel => JSON.parse(fs.readFileSync(new URL(`./fixtures/${rel}`, import.meta.url), 'utf8'));
const board = read('winhl-board-2026-27-free.json');
const prior = read('winhl-board-2025-26-final.json');
const player = read('winhl-player-2026-27-pro.json');
const src = rel => fs.readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const { winhlParams, seasonChips, seasonHeadline } = await import('../src/pages/winhl.js');
const { winhlSeasonCaption } = await import('../src/components/player-intel.js');

// 1. Default is 2026–27.
test('the API default board is the 2026–27 regular season', () => {
  assert.equal(board.season, '20262027');
  assert.equal(board.season_label, '2026–27');
  assert.equal(board.season_type, 'REGULAR_SEASON');
  assert.equal(board.is_default, true);
  assert.equal(board.current_season, '20262027');
  assert.equal(board.default_season, '20262027');
});

test('with no selection the page sends no season, so the API default (current season) is served', () => {
  assert.deepEqual(winhlParams({}), { pos: undefined, season: undefined });
  assert.deepEqual(winhlParams({ pos: 'D', season: '' }), { pos: 'D', season: undefined });
  assert.match(src('pages/winhl.js'), /season: SEASON_ID\.test\(params\.season \|\| ''\) \? params\.season : ''/);
});

test('headline names 2026–27 regular season and marks the early sample PROVISIONAL', () => {
  const h = seasonHeadline(board);
  assert.equal(h.label, 'WinHL 2026–27 regular season · provisional');
  assert.match(text(h.badges), /Regular season Provisional/);
});

// 2. Preseason is not the default.
test('preseason is never the default board or label', () => {
  assert.notEqual(board.status, 'preseason');
  assert.equal(board.game_type, 2);
  const h = seasonHeadline(board);
  assert.doesNotMatch(h.label, /preseason/i);
  assert.doesNotMatch(text(h.badges), /preseason/i);
  assert.doesNotMatch(board.season_note, /preseason/i);
});

// 3. 2025–26 remains selectable.
test('2025–26 is offered as a selectable final season and the 2026–27 chip is active by default', () => {
  const chips = seasonChips(board);
  assert.match(chips, /aria-pressed="true" data-season="">2026–27 · Provisional</);
  assert.match(chips, /aria-pressed="false" data-season="20252026">2025–26 · Final</);
  assert.deepEqual(winhlParams({ season: '20252026' }), { pos: undefined, season: '20252026' });
  const picked = seasonChips(board, '20252026');
  assert.match(picked, /aria-pressed="true" data-season="20252026"/);
});

test('the 2025–26 board is served on request, labelled final, never as the default', () => {
  assert.equal(prior.season, '20252026');
  assert.equal(prior.is_default, false);
  assert.equal(prior.status, 'final');
  assert.equal(seasonHeadline(prior).label, 'WinHL 2025–26 regular season · final');
});

// 4. API and frontend agree on the current season.
test('board, player detail and season list agree on one current season', () => {
  for (const body of [board, player]) {
    assert.equal(body.current_season, '20262027');
    assert.equal(body.season, body.current_season);
  }
  assert.equal(board.seasons.find(s => s.default).season, board.current_season);
  assert.equal(prior.current_season, board.current_season);
});

// 5. No stale 2025–26 headline copy.
test('no source file presents 2025–26 as the current or headline season', () => {
  const allowed = [
    /Trained on 2022-23 and 2023-24, tuned on 2024-25 and tested once on 2025-26/, // model split (history)
    /selected season id, e\.g\. 20252026/, // JSDoc example
    /a season id \('20252026'\)/, // JSDoc example
    /NHL_HEADSHOT_SEASONS = \['20262027', '20252026'\]/ // headshot fallback order, current first
  ];
  const offenders = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(e.name)) {
        fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          if (/2025[-–]26|20252026/.test(line) && !allowed.some(re => re.test(line))) offenders.push(`${p}:${i + 1}`);
        });
      }
    }
  };
  walk(fileURLToPath(new URL('../src', import.meta.url)));
  walk(fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '') + '/public');
  assert.deepEqual(offenders, []);
  const idx = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(idx, /2025[-–]26/);
});

// 6. Player/team WinHL use current-season records by default.
test('player page asks for the default (current-season) WinHL row and labels it', () => {
  assert.match(src('pages/player.js'), /intel\(`\/winhl\/player\/\$\{id\}`, \{ signal \}\)/, 'no season pinned on the player page');
  assert.equal(player.is_default, true);
  assert.ok(player.player.season.gp <= 2, 'the 2026-27 line, not a 2025-26 season line');
  assert.equal(winhlSeasonCaption(player), '2026–27 regular season · provisional');
});

test('matchup lineup WinHL names its season', () => {
  assert.match(src('components/game-intel.js'), /winhl_lineup\.season_label/);
});

// Early-season UX: no provisional surface can pass for a mature ranking.
test('every provisional WinHL surface carries caption, GP, last updated and the explanation', async () => {
  const { winhlSeasonLine, PROVISIONAL_TIP } = await import('../src/components/player-intel.js');
  const now = Date.parse(player.captured_at) + 7 * 60 * 1000;
  const line = winhlSeasonLine(player, player.player.season.gp, now);
  assert.match(text(line), /^2026–27 regular season · provisional · \d+ GP · updated 7m ago$/);
  assert.ok(line.includes(`title="${PROVISIONAL_TIP}"`));
  assert.match(PROVISIONAL_TIP, /not a mature-season ranking/);
  assert.ok(seasonHeadline(board).badges.includes(`title="${PROVISIONAL_TIP}"`));
  // A final season shows no provisional tooltip.
  assert.doesNotMatch(winhlSeasonLine(prior, 70, now), /title=/);
  assert.match(text(winhlSeasonLine(prior, 70, now)), /^2025–26 regular season · final · 70 GP/);
  // Board rows show GP and a provisional marker.
  assert.match(src('pages/winhl.js'), /\$\{esc\(p\.gp\)\} GP\$\{\(p\.flags \|\| \[\]\)\.includes\('provisional_sample'\) \? ' · provisional' : ''\}/);
  assert.match(src('components/game-intel.js'), /provisional: early-season sample/);
});
