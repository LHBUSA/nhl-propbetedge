// Static contract for the NHL score rail. The browser gate
// (tests/e2e/score-ticker.e2e.mjs) proves behaviour; this proves the
// architecture, so the rail cannot quietly become a second data system, a
// multi-sport widget, or a surface that invents a game.
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Read line-ending agnostic: a CRLF checkout must not change the contract.
const read = f => fs.readFileSync(f, 'utf8').split('\r\n').join('\n');
const ticker = read('src/components/score-ticker.js');
// Comments are allowed to name the data path; code is not allowed to re-declare it.
const tickerCode = ticker.replace(/^\s*\/\/.*$/gm, '');
const css = read('src/styles/score-ticker.css');
const main = read('src/main.js');
const tokens = read('src/styles/tokens.css');

// --- one data path, the existing one -----------------------------------
assert.match(ticker, /ctx\.board\(date, \{ signal, maxAgeMs/, 'the rail reads the shared board cache, not its own client');
assert.ok(!/\bfetch\s*\(/.test(tickerCode), 'the rail makes no request of its own; everything goes through ctx.board()');
assert.ok(!/nhl-api\.propbetedge\.ai|api-web\.nhle\.com/.test(tickerCode), 'no second endpoint is hard-coded into the rail');
assert.match(ticker, /createPoller/, 'polling uses the shared visibility-aware poller (one timer, full cleanup)');
assert.match(ticker, /POLL_LIVE = 10000/, 'live cadence is ~10s');
assert.match(ticker, /POLL_SLATE = 60000/, 'non-live slate cadence is ~60s');

// --- NHL only ----------------------------------------------------------
for (const sport of ['NFL', 'MLB', 'NBA', 'UFC', 'espn', 'ESPN']) {
  assert.ok(!new RegExp(`\\b${sport}\\b`).test(tickerCode), `the rail must not reference ${sport}`);
  assert.ok(!new RegExp(`\\b${sport}\\b`).test(css), `the rail styles must not reference ${sport}`);
}

// --- normalized backend semantics, never guessed strings ---------------
assert.match(ticker, /import \{ stateOf \} from '\.\/game\.js'/, 'game state comes from the shared normalizer, not a local string table');
assert.ok(!/gameState|periodDescriptor|'OFF'|'CRIT'/.test(ticker), 'raw provider state values are not re-derived in the rail');
assert.match(ticker, /const ORDER = \{ LIVE: 0, INTERMISSION: 0/, 'live games sort first');

// --- truth rules -------------------------------------------------------
assert.ok(!/Math\.random\s*\(/.test(ticker), 'no randomness');
assert.ok(!/setInterval|Date\.now\(\) - .*clock|tickClock/.test(ticker), 'the game clock is never interpolated locally; only the source clock is shown');
assert.match(ticker, /const has = scored && value !== null && value !== undefined/, 'a score renders only where the source carries one');
assert.match(ticker, /No NHL games today/, 'the zero-games state is stated, not filled');
assert.match(ticker, /next_puck_drop/, 'the empty state uses the board\'s own verified next puck drop');
assert.ok(!/games_that_day \|\| 1|\|\| 'TBD'|placeholder/i.test(ticker), 'no invented counts or placeholder fixtures');

// --- freshness: one system, shared with every other surface ------------
assert.match(ticker, /import \{ freshnessState \} from '\.\.\/lib\/freshness\.js'/, 'freshness reuses the app\'s own semantics');
assert.match(ticker, /gateway_semantics === 'STALE'/, 'a gateway STALE response is honoured');
assert.match(ticker, /Scores delayed/, 'a stale rail says so');
assert.match(ticker, /stale \? 'LIVE · DELAYED' : 'LIVE'/, 'LIVE is never claimed unqualified over stale data');
assert.match(ticker, /failed = true;\n\s+paint\(\);/, 'a failed refresh repaints as stale rather than blanking the rail');

// --- scrolling / accessibility ----------------------------------------
assert.match(ticker, /clone\.setAttribute\('aria-hidden', 'true'\)/, 'the marquee clone is hidden from assistive tech');
assert.match(ticker, /a\.removeAttribute\('href'\); a\.setAttribute\('tabindex', '-1'\)/, 'the clone is not a second set of tab stops');
assert.match(ticker, /prefers-reduced-motion: reduce/, 'reduced motion is honoured in JS, not only in CSS');
assert.match(ticker, /if \(sig === lastSig\) return;/, 'unchanged content is not re-rendered, so the marquee never jerks back');
assert.match(ticker, /aria-live="off"/, 'score changes are not re-announced on every refresh');
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'CSS also disables automatic movement');
assert.match(css, /\.stk__viewport\.is-locked \{ overflow-x: auto; \}/, 'static horizontal scrolling survives reduced motion');
assert.match(css, /animation-play-state: paused/, 'auto-movement pauses on hover/focus');
assert.match(css, /@media \(max-width: 640px\)/, 'the rail has a phone layout contract');

// Nothing below the 10px floor, and the rail is a real touch target.
assert.ok(!/font-size:\s*[0-9](px)?\b|\/1 var\(--pbe-font-data\);\s*font-size:\s*[0-9]px/.test(css), 'no sub-10px type in the rail');
assert.match(tokens, /--nhl-ticker-h: 44px;/, 'rail height keeps links at a practical touch target');
assert.match(tokens, /--nhl-chrome-h: calc\(var\(--nhl-topbar-h\) \+ var\(--nhl-ticker-h\)\)/, 'the rail is part of the measured chrome, so the hero and #main stay aligned');

// --- mounted through the app lifecycle, not a page hack ----------------
// Current production owns a newer compact shell. The ticker mount is therefore
// created additively after #topbar so this feature cannot regress the nav.
assert.match(main, /const scoreTickerSlot = document\.createElement\('div'\)/, 'the app creates one ticker mount point');
assert.match(main, /scoreTickerSlot\.id = 'score-ticker-slot'/, 'the ticker mount keeps the stable shell id');
assert.match(main, /querySelector\('#topbar'\)\?\.insertAdjacentElement\('afterend', scoreTickerSlot\)/, 'the rail sits directly below the top navigation');
assert.match(main, /mountScoreTicker\(scoreTickerSlot, ctx\)/, 'the rail is booted once from the app lifecycle');
assert.match(main, /styles\/score-ticker\.css/, 'rail styles ship with the shell');
assert.match(css, /#main \{ min-height: calc\(100vh - var\(--nhl-chrome-h\)\); \}/, 'page height reserves both topbar and ticker without reverting shell.css');

console.log('score ticker: PASS — one NHL data path, normalized semantics, stale honesty, reduced motion, app-mounted');
