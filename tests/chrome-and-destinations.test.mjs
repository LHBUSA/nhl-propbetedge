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

// Owner decision 2026-09-18: the premium product does not disappear because one
// authentication dependency is down. The control is ALWAYS in the topbar; what
// it opens adapts to readiness and account state.
test('NHL Pro is always present, including when auth readiness is false', () => {
  const btn = shell.match(/<button class="pbepro__open"[^>]*>/)[0];
  assert.ok(!/\shidden[\s>]/.test(btn), 'the Pro control is never withheld from the topbar');
  assert.match(shell, /export function bindProButton/);
  assert.ok(!/if \(!\(await signInAvailable\(\)\)[^\n]*\) return;/.test(shell),
    'readiness must not gate whether the control exists');
  assert.match(shell, /if \(authReady\) refreshAccount\(\);/,
    'the gateway is only asked who is signed in when sign-in exists');
  assert.match(shell, /while \(!document\.getElementById\('nhl-pro-modal'\)/,
    'it still waits for the surface, so it can never open nothing');
});

test('with readiness false the explainer is real content and carries no dead sign-in', () => {
  // The explainer itself is unconditional: features, pricing truth, no trial.
  assert.match(pro, /const FEATURES = \[/);
  assert.match(pro, /No free trial\. No fake urgency\. Cancel anytime\./);
  // The sign-in FORM stays hidden and is replaced by a plain statement.
  assert.match(pro, /id="nhl-pro-signin" hidden/);
  assert.match(pro, /id="nhl-pro-signin-unavailable" hidden/);
  assert.match(pro, /Member sign-in is not available yet/);
  const wire = pro.match(/async function wireAccount\(\)[\s\S]*?\n\}/)[0];
  assert.match(wire, /if \(!available\) \{[\s\S]*?note\.hidden = false;[\s\S]*?return;/,
    'unavailable readiness reveals the note and returns before wiring any form');
  const submitIndex = wire.indexOf("getElementById('nhl-pro-signin-form')");
  const returnIndex = wire.indexOf('return;');
  assert.ok(returnIndex !== -1 && submitIndex !== -1 && returnIndex < submitIndex,
    'no submit handler is bound when sign-in does not exist');
});

test('OPEN_FOR_PURCHASE false never exposes checkout', () => {
  assert.match(pro, /const OPEN_FOR_PURCHASE = false/);
  assert.match(pro, /Founding Season checkout coming online/);
  const start = pro.match(/function startCheckout\(\)[\s\S]*?\n\}/)[0];
  assert.match(start, /if \(!OPEN_FOR_PURCHASE\) \{[\s\S]*?return message\(/,
    'the CTA refuses before it can ever reach a Stripe URL');
  const assignIndex = start.indexOf('location.assign');
  const guardIndex = start.indexOf('!OPEN_FOR_PURCHASE');
  assert.ok(guardIndex !== -1 && guardIndex < assignIndex, 'the purchase guard precedes any navigation');
});

// A browser proof (scratch harness, three states + five failure modes) showed
// the sign-in form stuck on "Sending…" forever when the gateway could not be
// reached: fetch rejected, nothing caught it, and the reader was left mid-
// action with an unhandled TypeError in the console. The contract below is
// what stops that coming back.
test('a call that never reaches the gateway is reported, not swallowed', () => {
  const account = read('src/lib/account.js');
  const call = account.match(/async function authCall\([\s\S]*?\n\}/)[0];
  assert.match(call, /try \{[\s\S]*?await fetch\([\s\S]*?\} catch \{[\s\S]*?return \{ status: 0, data: null \};/,
    'a transport failure resolves with status 0 instead of rejecting');
  assert.match(account, /if \(status === 0\) return \{ ok: false, message: 'Could not reach the sign-in service/,
    'and the sign-in request turns that into a plain, retryable message');
  assert.match(account, /status === 0 \|\| status >= 500 \? 'unavailable' : 'expired'/,
    'a link cannot be called expired merely because the network failed');
  // The failure path must never look like the success path.
  assert.ok(!/status === 0[^\n]*ok: true/.test(account), 'no failure is ever reported as success');
});

test('when readiness is true the legitimate sign-in path returns', () => {
  const wire = pro.match(/async function wireAccount\(\)[\s\S]*?\n\}/)[0];
  assert.match(wire, /const available = await signInAvailable\(\)/);
  assert.match(wire, /signin\.hidden = false/, 'the real form appears only when sign-in exists');
  assert.match(wire, /requestSignIn\(email\)/, 'and it posts through the one credentialed module');
  assert.match(shell, /Sign in to NHL Pro or see Founding Season access/,
    'the control relabels itself for the signed-out, auth-ready state');
  assert.match(shell, /See what NHL Pro includes/,
    'and reads as an explainer when sign-in does not exist');
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
