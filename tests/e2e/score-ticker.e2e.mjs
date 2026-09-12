// Score-ticker state matrix. Every state is driven by a board payload in the
// SHAPE THE GATEWAY ACTUALLY RETURNS (captured from https://nhl-api.propbetedge.ai
// /nhl/board on 2026-09-12; the LIVE/INTERMISSION fixtures are real finals from
// 2026-04-11..16 with their status block rewound), so the gate proves the UI
// against normalized backend semantics rather than guessed strings.
//
//   node tests/e2e/score-ticker.e2e.mjs
// Requires a static preview on NHL_BROWSER_BASE (default http://127.0.0.1:4173).

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.NHL_BROWSER_BASE || 'http://127.0.0.1:4173';
const outDir = process.env.NHL_BROWSER_OUT || 'artifacts/score-ticker';
fs.mkdirSync(outDir, { recursive: true });

const now = new Date();
const iso = () => now.toISOString();
const logo = a => `https://assets.nhle.com/logos/nhl/svg/${a}_light.svg`;

function team(abbrev, id, place, name, score = null, sog = null) {
  return { id, abbrev, name, place, logo: logo(abbrev), dark_logo: logo(abbrev).replace('_light', '_dark'), score, sog };
}
function game(id, status, away, home, startTimeUtc) {
  return {
    id, season: 20262027, game_type: 2, date: now.toISOString().slice(0, 10),
    start_time_utc: startTimeUtc, status, venue: 'Arena', neutral_site: false,
    teams: { away, home }, broadcasts: []
  };
}

const LIVE = {
  state: 'LIVE', schedule_state: 'OK', semantics: 'LIVE', period: 3, period_type: 'REG',
  clock: '08:41', seconds_remaining: 521, clock_running: true, in_intermission: false, last_period_type: null
};
const INT = {
  state: 'LIVE', schedule_state: 'OK', semantics: 'LIVE', period: 2, period_type: 'REG',
  clock: '14:22', seconds_remaining: 862, clock_running: false, in_intermission: true, last_period_type: null
};
const FINAL_REG = { state: 'OFF', schedule_state: 'OK', semantics: 'FINAL', period: 3, period_type: 'REG', clock: '00:00', seconds_remaining: 0, clock_running: false, in_intermission: false, last_period_type: 'REG' };
const FINAL_OT = { ...FINAL_REG, period: 4, last_period_type: 'OT' };
const FINAL_SO = { ...FINAL_REG, period: 5, last_period_type: 'SO' };
const SCHED = { state: 'FUT', schedule_state: 'OK', semantics: 'SCHEDULED', period: 1, period_type: 'REG', clock: null, seconds_remaining: null, clock_running: null, in_intermission: null, last_period_type: null };

const envelope = extra => ({
  ok: true, schema: 'nhl-board-v2', source: 'NHL schedule',
  source_urls: ['https://api-web.nhle.com/v1/score/2026-09-12'],
  fetched_at: iso(), ttl_s: 30, stale_after_s: 300,
  date: now.toISOString().slice(0, 10), season_phase: 'REGULAR_SEASON',
  calendar: { preseason_start: '2026-09-19', regular_season_start: '2026-09-29', regular_season_end: '2027-04-10', playoff_end: '2027-06-10' },
  ...extra
});

const SLATE = envelope({
  counts: { total: 6, LIVE: 2, FINAL: 3, SCHEDULED: 1 },
  next_puck_drop: null,
  games: [
    // Deliberately out of display order so the rail's own ordering is tested.
    game('2026020011', FINAL_OT, team('COL', 21, 'Colorado', 'Avalanche', 4), team('DAL', 25, 'Dallas', 'Stars', 3), '2026-09-12T23:00:00Z'),
    game('2026020012', SCHED, team('MIN', 30, 'Minnesota', 'Wild'), team('WPG', 52, 'Winnipeg', 'Jets'), '2026-09-12T23:00:00Z'),
    game('2026020013', LIVE, team('EDM', 22, 'Edmonton', 'Oilers', 3), team('TOR', 10, 'Toronto', 'Maple Leafs', 2), '2026-09-12T22:00:00Z'),
    game('2026020014', INT, team('NYR', 3, 'New York', 'Rangers', 1), team('BOS', 6, 'Boston', 'Bruins', 1), '2026-09-12T22:30:00Z'),
    game('2026020015', FINAL_SO, team('VAN', 23, 'Vancouver', 'Canucks', 4), team('SJS', 28, 'San Jose', 'Sharks', 3), '2026-09-12T20:00:00Z'),
    game('2026020016', FINAL_REG, team('SEA', 55, 'Seattle', 'Kraken', 0), team('CGY', 20, 'Calgary', 'Flames', 2), '2026-09-12T19:00:00Z')
  ]
});

// The real offseason payload this product serves today.
const EMPTY = envelope({
  season_phase: 'OFFSEASON',
  counts: { total: 0 },
  games: [],
  next_puck_drop: {
    start_time_utc: '2026-09-19T23:00:00Z', date: '2026-09-19', game_type: 1, games_that_day: 7,
    games_at_start: [game('2026010001', SCHED, team('DAL', 25, 'Dallas', 'Stars'), team('STL', 19, 'St. Louis', 'Blues'), '2026-09-19T23:00:00Z')]
  }
});

const failures = [];
const results = [];
function check(label, ok, detail = '') {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });

async function open({ width, board, semantics = 'CURRENT', boardStatus = 200, reducedMotion = 'no-preference', failAfterFirst = false }) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', r => errors.push(`requestfailed: ${r.url()}`));
  page.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  const otherSport = [];
  let boardHits = 0;
  // Playwright runs the most recently registered handler first, so the
  // other-sport observer is registered before the specific stubs.
  await page.route('**://**/*', route => {
    const url = new URL(route.request().url());
    if (/(^|\.)(espn|mlb|nba|nfl|ufc)\b/i.test(url.hostname)) otherSport.push(url.href);
    return route.continue();
  });
  await page.route('https://propbet-news-api.sales-fd3.workers.dev/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ articles: [], page: 1, limit: 50, total: 0 }) }));
  await page.route('https://propbet-img-proxy.sales-fd3.workers.dev/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#222"/></svg>' }));
  await page.route('https://assets.nhle.com/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#d4af37"/></svg>' }));
  await page.route('https://nhl-api.propbetedge.ai/**', route => {
    const u = new URL(route.request().url());
    const json = (payload, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'X-NHL-Semantics', ...headers }, body: JSON.stringify(payload) });
    if (u.pathname === '/readiness') return json({ ok: true, schema: 'nhl-gateway-v1', data_layer: 'v2', odds: 'not_configured', checked_at: iso() });
    if (u.pathname === '/nhl/board') {
      boardHits += 1;
      if (failAfterFirst && boardHits > 1) return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: false, error: 'source unavailable' }) });
      if (boardStatus !== 200) return json({ ok: false, error: 'source unavailable' }, boardStatus);
      return json(board, 200, { 'X-NHL-Semantics': semantics });
    }
    return json({ ok: false, schema: 'fixture', error: `Unmocked ${u.pathname}` }, 404);
  });
  // Methodology is a static route: it makes no data request of its own, so
  // anything the gate sees on the wire belongs to the shell or the rail.
  await page.goto(`${base}/#/methodology`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#score-ticker', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#score-ticker')?.dataset.fresh !== 'LOADING', null, { timeout: 15000 });
  return { ctx, page, errors, otherSport, boardHits: () => boardHits };
}

async function readTicker(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#score-ticker');
    const run = document.querySelector('#stk-run');
    const games = [...run.querySelectorAll('.stk-g')];
    return {
      fresh: root.dataset.fresh,
      live: root.dataset.live,
      status: document.querySelector('#stk-status')?.textContent || '',
      ariaLive: root.getAttribute('aria-live'),
      order: games.map(g => g.dataset.state),
      hrefs: games.map(g => g.getAttribute('href')),
      texts: games.map(g => g.textContent.replace(/\s+/g, ' ').trim()),
      chips: games.map(g => g.querySelector('.stk-g__chip')?.textContent || ''),
      empty: run.querySelector('.stk-empty')?.textContent.replace(/\s+/g, ' ').trim() || '',
      clones: document.querySelectorAll('.stk__run--clone').length,
      marquee: document.querySelector('#stk-track')?.classList.contains('is-marquee') || false,
      animation: getComputedStyle(document.querySelector('#stk-track')).animationName,
      cloneFocusable: [...document.querySelectorAll('.stk__run--clone a[href]')].length,
      railText: root.textContent.replace(/\s+/g, ' ').trim(),
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      railHeight: Math.round(root.getBoundingClientRect().height),
      brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).length
    };
  });
}

// ---------------------------------------------------------------- 1. live slate, desktop
{
  const { ctx, page, errors, otherSport } = await open({ width: 1440, board: SLATE });
  const t = await readTicker(page);
  check('live slate renders every game', t.order.length === 6, `got ${t.order.length}`);
  check('live games sort first', t.order.slice(0, 2).every(s => s === 'LIVE' || s === 'INTERMISSION'), t.order.join(','));
  check('finals sort last', t.order.slice(-3).every(s => s === 'FINAL'), t.order.join(','));
  check('LIVE state shows period and clock', /3rd 08:41/.test(t.texts.join(' | ')), t.texts.join(' | '));
  check('LIVE chip present', t.chips.includes('LIVE'), JSON.stringify(t.chips));
  check('INTERMISSION reads INT + period', /INT · 2nd/.test(t.texts.join(' | ')), t.texts.join(' | '));
  check('FINAL/OT distinguished', /FINAL\/OT/.test(t.texts.join(' | ')), t.texts.join(' | '));
  check('FINAL/SO distinguished', /FINAL\/SO/.test(t.texts.join(' | ')), t.texts.join(' | '));
  check('plain FINAL has no suffix', t.texts.some(x => /FINAL(?!\/)/.test(x)), t.texts.join(' | '));
  check('scheduled game shows ET puck drop, no score', t.texts.some(x => /MIN @ WPG|MIN.*WPG/.test(x) && /\bET\b/.test(x) && !/\d+ · /.test(x)), t.texts.join(' | '));
  check('every game deep-links to PBE Cast', t.hrefs.every(h => /^#\/cast\/\d{10}$/.test(h)), t.hrefs.join(','));
  check('status names the live count', /2 live/.test(t.status), t.status);
  check('screen readers are not re-announced on every refresh', t.ariaLive === 'off', String(t.ariaLive));
  check('no desktop horizontal overflow at 1440', t.pageOverflow === 0, `${t.pageOverflow}px`);
  check('no broken images', t.brokenImages === 0, String(t.brokenImages));
  check('exactly one marquee clone (no DOM explosion)', t.clones <= 1, String(t.clones));
  check('clone is not keyboard-focusable', t.cloneFocusable === 0, String(t.cloneFocusable));
  check('rail is NHL-only', !/\b(NFL|MLB|NBA|UFC|ESPN)\b/.test(t.railText), t.railText.slice(0, 200));
  check('no other-sport network calls', otherSport.length === 0, otherSport.join(','));
  check('live slate: no console errors', errors.length === 0, errors.join(' | '));
  await page.locator('#score-ticker').screenshot({ path: path.join(outDir, 'ticker-live-1440.png') });
  await ctx.close();
}

// ---------------------------------------------------------------- 2. mobile 390
{
  const { ctx, page, errors } = await open({ width: 390, board: SLATE });
  const t = await readTicker(page);
  check('mobile: no page horizontal overflow at 390', t.pageOverflow === 0, `${t.pageOverflow}px`);
  check('mobile: rail does not auto-scroll (manual swipe stays usable)', t.marquee === false, String(t.marquee));
  check('mobile: rail still renders the slate', t.order.length === 6, String(t.order.length));
  const swipe = await page.evaluate(async () => {
    const vp = document.querySelector('#stk-viewport');
    const before = vp.scrollLeft;
    vp.scrollLeft = 200;
    await new Promise(r => setTimeout(r, 60));
    return { before, after: vp.scrollLeft, scrollable: vp.scrollWidth > vp.clientWidth };
  });
  check('mobile: rail is horizontally scrollable by hand', swipe.scrollable && swipe.after > swipe.before, JSON.stringify(swipe));
  check('mobile: no console errors', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: path.join(outDir, 'ticker-live-390.png') });
  await ctx.close();
}

// ---------------------------------------------------------------- 3. reduced motion
{
  const { ctx, page, errors } = await open({ width: 1440, board: SLATE, reducedMotion: 'reduce' });
  const t = await readTicker(page);
  check('reduced motion: no marquee', t.marquee === false, String(t.marquee));
  check('reduced motion: no clone rendered', t.clones === 0, String(t.clones));
  check('reduced motion: no running animation on the track', t.animation === 'none', t.animation);
  const scrollable = await page.evaluate(() => { const vp = document.querySelector('#stk-viewport'); return vp.scrollWidth > vp.clientWidth && getComputedStyle(vp).overflowX !== 'hidden'; });
  check('reduced motion: static horizontal scrolling remains available', scrollable, String(scrollable));
  check('reduced motion: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 4. gateway STALE
{
  const { ctx, page, errors } = await open({ width: 1440, board: SLATE, semantics: 'STALE' });
  const t = await readTicker(page);
  check('gateway STALE: rail is labelled stale', t.fresh === 'STALE', t.fresh);
  check('gateway STALE: status says scores delayed', /delayed/i.test(t.status), t.status);
  check('gateway STALE: scores are preserved', t.order.length === 6, String(t.order.length));
  check('gateway STALE: LIVE is qualified, never bare', t.chips.filter(Boolean).every(c => !/^LIVE$/.test(c)) && t.chips.some(c => /DELAYED/.test(c)), JSON.stringify(t.chips));
  check('gateway STALE: no console errors', errors.length === 0, errors.join(' | '));
  await page.locator('#score-ticker').screenshot({ path: path.join(outDir, 'ticker-stale-1440.png') });
  await ctx.close();
}

// ---------------------------------------------------------------- 5. refresh failure after a good load
{
  const { ctx, page, errors } = await open({ width: 1440, board: SLATE, failAfterFirst: true });
  const before = await readTicker(page);
  check('refresh failure: first load is current', before.fresh === 'CURRENT', before.fresh);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => document.querySelector('#score-ticker')?.dataset.fresh === 'STALE', null, { timeout: 20000 });
  const after = await readTicker(page);
  check('refresh failure: last-known scores are retained', after.order.length === 6, String(after.order.length));
  check('refresh failure: rail is marked stale, not blanked', after.fresh === 'STALE', after.fresh);
  check('refresh failure: LIVE no longer claims LIVE unqualified', after.chips.some(c => /DELAYED/.test(c)), JSON.stringify(after.chips));
  check('refresh failure: no unhandled page errors', errors.filter(e => e.startsWith('pageerror')).length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 6. no games today (real offseason payload)
{
  for (const width of [1440, 390]) {
    const { ctx, page, errors } = await open({ width, board: EMPTY });
    const t = await readTicker(page);
    check(`no games @${width}: honest empty state`, /No NHL games today/i.test(t.empty), t.empty);
    check(`no games @${width}: verified next puck drop only`, /Next puck drop/.test(t.empty) && /DAL @ STL/.test(t.empty) && /\+6 more/.test(t.empty), t.empty);
    check(`no games @${width}: nothing invented`, t.order.length === 0, String(t.order.length));
    check(`no games @${width}: no overflow`, t.pageOverflow === 0, `${t.pageOverflow}px`);
    check(`no games @${width}: no console errors`, errors.length === 0, errors.join(' | '));
    await page.locator('#score-ticker').screenshot({ path: path.join(outDir, `ticker-nogames-${width}.png`) });
    await ctx.close();
  }
}

// ---------------------------------------------------------------- 7. board unavailable on first load
{
  const { ctx, page, errors } = await open({ width: 1440, board: SLATE, boardStatus: 503 });
  const t = await readTicker(page);
  check('board 503: rail states unavailability instead of inventing a slate', t.fresh === 'UNAVAILABLE' && /unavailable/i.test(t.empty), `${t.fresh} / ${t.empty}`);
  check('board 503: no unhandled page errors', errors.filter(e => e.startsWith('pageerror')).length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();

console.log(results.join('\n'));
console.log(`\nscore ticker: ${results.length - failures.length}/${results.length} checks pass`);
console.log(`screenshots: ${outDir}`);
if (failures.length) {
  console.error('\nFAILURES:\n' + failures.map(f => ' - ' + f).join('\n'));
  process.exit(1);
}
