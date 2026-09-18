// Chrome + destinations guards.
//
// Two jobs:
//  1. No QA fixture id may be a product destination. #/shots and the replay
//     entry must resolve a REAL game from the schedule or say plainly that
//     nothing can be resolved.
//  2. Every visible chrome control must do something real — and NHL Pro must
//     not exist at all in an environment that cannot sign anyone in.
//
// The browser-side proof is tests/e2e/chrome-destinations.mjs, which clicks
// every one of these controls against the production gateway.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = rel => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const shotlab = read('src/pages/shotlab.js');
const cast = read('src/pages/cast.js');
const castCenter = read('src/pages/cast-center.js');
const shell = read('src/components/shell.js');
const shellCss = read('src/styles/shell.css');
const pro = read('src/lib/pro.js');
const router = read('src/lib/router.js');

// ------------------------------------------------------------------ fixtures

const NL = String.fromCharCode(10);

function productSources() {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name).split(path.sep).join('/');
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.js')) out.push(p);
    }
  };
  walk('src');
  return out;
}

test('no product source hardcodes a 10-digit game id', () => {
  for (const file of productSources()) {
    read(file).split(NL).forEach((line, i) => {
      const hit = /(?<!\d)\d{10}(?!\d)/.exec(line);
      assert.ok(!hit, `hardcoded game id ${hit?.[0]} in ${file}:${i + 1} — destinations must resolve a real game`);
    });
  }
});

test('no in-app destination pins itself to a fixed calendar date', () => {
  for (const file of productSources()) {
    read(file).split(NL).forEach((line, i) => {
      const hit = /#\/[^'"`\s]*\d{4}-\d{2}-\d{2}/.exec(line);
      assert.ok(!hit, `hardcoded date in the link ${hit?.[0]} at ${file}:${i + 1} — slates come from the board`);
    });
  }
});

// ----------------------------------------------------------- #/shots landing

test('#/shots with no id is a routed landing state, not a required deep link', () => {
  assert.match(router, /\^\\\/shots\(\?:\\\/\(\\d\{10\}\)\)\?\$/, '#/shots and #/shots/<id> share one route');
  assert.match(shotlab, /resolveRecentCompleted/, 'the landing resolves a real recent game');
  assert.match(shotlab, /location\.replace\(`#\/shots\/\$\{hit\.games\[0\]\.id\}`\)/, 'it replaces rather than stacking history');
});

test('an unresolvable Shot Lab landing states the gap instead of guessing', () => {
  assert.match(shotlab, /No completed game with recorded shot coordinates could be resolved/);
  assert.match(shotlab, /Searched every NHL date from/);
  assert.doesNotMatch(shotlab, /Math\.random|placeholder coordinates/i);
});

test('a completed game with no recorded attempt offers a real alternative, not a filler', () => {
  assert.match(shotlab, /nextCompletedAfter\(state\.gameId\)/);
  assert.match(shotlab, /The source recorded no attempt for this completed game/);
});

// ----------------------------------------------------------- replay entry

test('the replay entry derives its slate from the schedule', () => {
  assert.match(castCenter, /resolveRecentCompleted/);
  assert.match(castCenter, /const explicitDate = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(params\.date \|\| ''\)/,
    'an explicit ?date= is always honoured');
  assert.match(castCenter, /Replay a completed game/, 'the empty slate offers real completed games');
});

test('cast deep-link behaviour is untouched', () => {
  assert.match(router, /\^\\\/cast\(\?:\\\/\(\\d\{10\}\)\)\?\$/);
  assert.match(cast, /params\.t/, '?t= replay cursor still read');
  assert.match(cast, /if \(params\.view === 'all'\) return mountCenter/);
});

// ----------------------------------------------------------- NHL Pro

test('NHL Pro is chrome-owned and hidden until sign-in actually exists', () => {
  assert.match(shell, /id="nhl-pro-btn"[^>]*hidden/, 'the Pro control ships hidden');
  assert.match(shell, /export function bindProButton/);
  assert.match(shell, /if \(!\(await signInAvailable\(\)\) \|\| disposed\) return;/,
    'no sign-in in this environment means no button at all');
  assert.match(shellCss, /\.pbepro__open\[hidden\] \{ display: none !important; \}/,
    'pro.css sets display:inline-flex, so [hidden] needs to win');
});

test('NHL Pro has one real action per account state', () => {
  assert.match(shell, /state === 'pro'/);
  assert.match(shell, /NHL Pro account and subscription/);
  assert.match(shell, /Sign in to NHL Pro or see Founding Season access/);
  assert.match(shell, /button\.dataset\.account = state/, 'the state is observable for QA');
});

test('chrome never carries credentials itself', () => {
  assert.doesNotMatch(shell, /fetch\s*\(/, 'shell.js makes no request of its own');
  assert.doesNotMatch(shell.replace(/\/\/.*$/gm, ''), /['"`][^'"`]*\/pro\//, 'chrome never references a /pro/* route');
  assert.doesNotMatch(shell, /proData|credentials:/, 'chrome never reads protected data itself');
  assert.match(shell, /import \{ onAccount, refreshAccount, signInAvailable \} from '\.\.\/lib\/account\.js'/);
});

test('exactly one NHL Pro control can exist', () => {
  assert.match(pro, /if \(tools && !tools\.querySelector\('\[data-open-nhl-pro\]'\)\)/,
    'pro.js must not add a second button next to the shell one');
  assert.equal((shell.match(/data-open-nhl-pro/g) || []).length, 1);
});

// ----------------------------------------------------------- nav + menus

test('nav membership set by the nav lane is preserved', () => {
  const nav = shell.match(/export const NAV = \[([\s\S]*?)\];/)[1];
  assert.deepEqual([...nav.matchAll(/label: '([^']+)'/g)].map(m => m[1]),
    ['Ice Board', 'PBE Picks', 'PBE Cast', 'Props', 'Shot Lab']);
  const more = shell.match(/export const MORE = \[([\s\S]*?)\];/)[1];
  assert.deepEqual([...more.matchAll(/label: '([^']+)'/g)].map(m => m[1]),
    ['News', 'Goalies', 'Lines', 'Injuries', 'Matchups', 'Players', 'Standings', 'Track Record', 'Methodology']);
  assert.match(shell, /const BOTTOM = \['board', 'picks', 'cast', 'props'\]/);
});

test('every More destination is a routed page', () => {
  const more = shell.match(/export const MORE = \[([\s\S]*?)\];/)[1];
  const routes = [...router.matchAll(/id: '([a-z]+)'/g)].map(m => m[1]);
  for (const id of [...more.matchAll(/id: '([a-z]+)'/g)].map(m => m[1])) {
    assert.ok(routes.includes(id), `More item "${id}" has no route`);
  }
});

test('the More menu follows the menu keyboard pattern', () => {
  assert.match(shell, /role="menuitem" tabindex="-1"/, 'menu items stay out of the tab order');
  assert.match(shell, /moreItems\(\)\[0\]\?\.focus\(\)/, 'opening moves focus into the menu');
  assert.match(shell, /ArrowDown/);
  assert.match(shell, /closeMore\(\{ restoreFocus: true \}\)/, 'Escape returns focus to the button');
  assert.match(shell, /if \(event\.key === 'Tab'\) \{ closeMore\(\); return; \}/);
});

test('search, sheet and bell are all wired to real handlers', () => {
  assert.match(shell, /\[data-open-search\]', openPalette/);
  assert.match(shell, /event\.key\.toLowerCase\(\) === 'k'/);
  assert.match(shell, /event\.key === 'Enter' && items\[active\]/);
  assert.match(shell, /closePalette\(\); closeSheet\(\); closeMore\(\)/, 'results close every overlay');
  // The bell panel is owned by components/alerts-ui.js; the markup it binds to
  // has to exist in the shell.
  assert.match(shell, /data-alerts aria-expanded="false" aria-controls="alert-center"/);
  assert.match(shell, /id="alert-center"/);
  assert.match(read('src/components/alerts-ui.js'), /'\[data-alerts\]'/);
});

test('season state reads as chrome, not as navigation', () => {
  assert.match(shell, /id="season-chip-text"/);
  assert.match(shell, /id="sheet-season"/, 'the compact widths keep the information in the sheet');
  const block = shellCss.match(/\.season-chip \{([\s\S]*?)\}/)[1];
  assert.doesNotMatch(block, /--pbe-gold/, 'the chip must not borrow the nav active colour');
  assert.match(shellCss, /\.season-chip\[data-tone="live"\]/);
});

// ------------------------------------------------- resolver behaviour (unit)

globalThis.sessionStorage = {
  store: new Map(),
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
  setItem(k, v) { this.store.set(k, String(v)); },
  removeItem(k) { this.store.delete(k); }
};
const { resolveRecentCompleted, resetRecentCompleted, nextCompletedAfter } = await import('../src/lib/recent-games.js');

const CALENDAR = { preseason_start: '2026-09-19', regular_season_start: '2026-09-29', regular_season_end: '2027-04-10', playoff_end: '2027-06-10' };
const game = (id, date, semantics, hh = '00') => ({
  id, date, start_time_utc: `${date}T${hh}:00:00Z`,
  status: { semantics }, teams: { away: { abbrev: 'AAA', score: 1 }, home: { abbrev: 'HHH', score: 2 } }
});

function stubBoard(byDate, phase = 'OFFSEASON') {
  const reads = [];
  const board = async date => {
    reads.push(date);
    return { data: { date, season_phase: phase, calendar: CALENDAR, counts: { total: (byDate[date] || []).length }, games: byDate[date] || [] } };
  };
  board.reads = reads;
  return board;
}

test('a live game today wins, on a single board read', async () => {
  resetRecentCompleted();
  const board = stubBoard({ '2026-12-01': [game('2026020101', '2026-12-01', 'FINAL'), game('2026020102', '2026-12-01', 'LIVE')] }, 'REGULAR_SEASON');
  const hit = await resolveRecentCompleted(board, { today: '2026-12-01' });
  assert.equal(hit.games[0].id, '2026020102');
  assert.equal(hit.date, '2026-12-01');
  assert.equal(board.reads.length, 1, 'in season this costs one request');
});

test('an empty today falls back to the latest completed day, latest game first', async () => {
  resetRecentCompleted();
  const board = stubBoard({
    '2026-12-01': [],
    '2026-11-30': [game('2026020201', '2026-11-30', 'FINAL', '23'), game('2026020202', '2026-11-30', 'FINAL', '01')],
    '2026-11-28': [game('2026020150', '2026-11-28', 'FINAL')]
  }, 'REGULAR_SEASON');
  const hit = await resolveRecentCompleted(board, { today: '2026-12-01' });
  assert.equal(hit.date, '2026-11-30');
  assert.deepEqual(hit.games.map(g => g.id), ['2026020201', '2026020202', '2026020150']);
  assert.ok(board.reads.length <= 8, `bounded walk, got ${board.reads.length} reads`);
});

test('deep in the offseason it sweeps the previous playoff window from the board calendar', async () => {
  resetRecentCompleted();
  const board = stubBoard({ '2026-06-14': [game('2025030416', '2026-06-14', 'FINAL')], '2026-06-11': [game('2025030415', '2026-06-11', 'FINAL')] });
  const hit = await resolveRecentCompleted(board, { today: '2026-09-18' });
  assert.equal(hit.date, '2026-06-14');
  assert.equal(hit.games[0].id, '2025030416');
  assert.equal(hit.games[1].id, '2025030415', 'earlier completed games stay available as fallbacks');
  assert.ok(!board.reads.slice(1).some(d => d >= '2026-09-18'), 'after the first read it never asks for today or the future');
  assert.ok(board.reads.length < 40, `bounded sweep, got ${board.reads.length} reads`);
});

test('nothing completed anywhere is reported as unavailable, never invented', async () => {
  resetRecentCompleted();
  const board = stubBoard({ '2026-09-19': [game('2026010001', '2026-09-19', 'SCHEDULED')] });
  const hit = await resolveRecentCompleted(board, { today: '2026-09-18' });
  assert.deepEqual(hit.games, []);
  assert.equal(hit.date, null);
  assert.equal(hit.exhausted, true);
  assert.ok(hit.searchedFrom && hit.searchedTo, 'the page can say what was searched');
});

test('the resolution is cached: a second landing costs the gateway nothing', async () => {
  resetRecentCompleted();
  const board = stubBoard({ '2026-12-01': [game('2026020101', '2026-12-01', 'FINAL')] }, 'REGULAR_SEASON');
  await resolveRecentCompleted(board, { today: '2026-12-01' });
  const first = board.reads.length;
  await resolveRecentCompleted(board, { today: '2026-12-01' });
  await resolveRecentCompleted(board, { today: '2026-12-01' });
  assert.equal(board.reads.length, first, 'repeat landings reuse the cached resolution');
});

test('concurrent landings share one search', async () => {
  resetRecentCompleted();
  const board = stubBoard({ '2026-12-01': [game('2026020101', '2026-12-01', 'FINAL')] }, 'REGULAR_SEASON');
  await Promise.all([
    resolveRecentCompleted(board, { today: '2026-12-01' }),
    resolveRecentCompleted(board, { today: '2026-12-01' }),
    resolveRecentCompleted(board, { today: '2026-12-01' })
  ]);
  assert.equal(board.reads.length, 1);
});

test('nextCompletedAfter walks the real candidate list and then stops', async () => {
  resetRecentCompleted();
  const board = stubBoard({ '2026-06-14': [game('2025030416', '2026-06-14', 'FINAL')], '2026-06-11': [game('2025030415', '2026-06-11', 'FINAL')] });
  await resolveRecentCompleted(board, { today: '2026-09-18' });
  assert.equal(nextCompletedAfter('2025030416', '2026-09-18').id, '2025030415');
  assert.equal(nextCompletedAfter('2025030415', '2026-09-18'), null);
});

test('a board failure degrades to unavailable rather than to a guess', async () => {
  resetRecentCompleted();
  const board = async () => { throw Object.assign(new Error('gateway down'), { kind: 'unavailable' }); };
  const hit = await resolveRecentCompleted(board, { today: '2026-09-18' });
  assert.deepEqual(hit.games, []);
  assert.equal(hit.date, null);
});
