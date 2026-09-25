// PBE Picks browser QA: THIS build, served locally, against the REAL production
// gateway. Nothing in the product is stubbed.
//
// The gateway enforces product-origin CORS, so a localhost build cannot call it
// from the page. Every gateway request is relayed Node-side (no CORS there) with
// the product Origin, and the genuine status and body are handed back — exactly
// as tests/e2e/live-acceptance.mjs does it. That includes the picks routes,
// which the gateway may not carry yet: a 400/404/503 must reach the page so the
// page can show its honest "pipeline not available" state, and this harness
// asserts that it does rather than skipping.
//
//   npm run build && npm run preview &   (127.0.0.1:4173)
//   node tests/e2e/pbe-picks-qa.mjs

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.NHL_BROWSER_BASE || 'http://127.0.0.1:4173';
const outDir = process.env.NHL_BROWSER_OUT || 'artifacts/pbe-picks-qa';
const GATEWAY = 'https://nhl-api.propbetedge.ai';
const PRODUCT_ORIGIN = 'https://nhl.propbetedge.ai';
const EXECUTABLE = process.env.PW_CHROMIUM
  || 'C:/Users/goodl/AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe';

fs.mkdirSync(outDir, { recursive: true });

// Today's slate is often empty (offseason / dark day), which exercises the
// empty state but not the card. Ask the real board where the next puck drop is
// and QA that date too, so the card path is proven against real games.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let slateDate = today;
try {
  const board = await (await fetch(`${GATEWAY}/nhl/board?date=${today}`, { headers: { Accept: 'application/json', Origin: PRODUCT_ORIGIN } })).json();
  if (!board?.counts?.total && board?.next_puck_drop?.date) slateDate = board.next_puck_drop.date;
} catch { /* the board route is checked by the assertions below */ }

const ROUTES = [
  { id: 'pbe-picks', hash: '/pbe-picks' },
  { id: 'pbe-picks-slate', hash: `/pbe-picks?date=${slateDate}`, expectCards: slateDate !== today },
  { id: 'track-record', hash: '/track-record' },
  { id: 'home', hash: '/' }
];
const WIDTHS = [1440, 390, 360];
console.log(`today (ET) ${today} · slate date under QA ${slateDate}\n`);

const failures = [];
const rows = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width, height: width >= 1440 ? 1000 : 844 } });
    const page = await ctx.newPage();
    const errors = [];
    const networkLogs = [];
    const gatewayCalls = [];
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    // The browser writes its own console entry for every non-2xx response. When
    // the gateway genuinely answers 400 for a route it does not carry yet, that
    // line is a true statement about the network, not a product fault — the page
    // is required to handle it, which the assertions below verify. Anything else
    // on the error channel is a real failure.
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const text = m.text().slice(0, 200);
      if (/Failed to load resource: the server responded with a status of (400|404|503)/.test(text)) networkLogs.push(text);
      else errors.push(`console: ${text}`);
    });

    const relay = async r => {
      const request = r.request();
      const url = request.url();
      try {
        const upstream = await fetch(url, { headers: { Accept: 'application/json', Origin: PRODUCT_ORIGIN, Referer: `${PRODUCT_ORIGIN}/` } });
        const body = await upstream.text();
        gatewayCalls.push({ url: url.replace(GATEWAY, ''), status: upstream.status });
        return r.fulfill({
          status: upstream.status,
          contentType: upstream.headers.get('content-type') || 'application/json',
          // A credentialed fetch (/auth/*, /pro/*) rejects '*', so echo the page
          // origin with credentials, as the real gateway does.
          headers: {
            'Access-Control-Allow-Origin': request.headers().origin || '*',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Expose-Headers': 'X-NHL-Semantics',
            ...(upstream.headers.get('X-NHL-Semantics') ? { 'X-NHL-Semantics': upstream.headers.get('X-NHL-Semantics') } : {})
          },
          body
        });
      } catch (error) {
        gatewayCalls.push({ url: url.replace(GATEWAY, ''), status: 0, error: String(error.message) });
        return r.abort();
      }
    };

    await page.route('https://propbet-news-api.sales-fd3.workers.dev/**', relay);
    await page.route(`${GATEWAY}/**`, relay);

    await page.goto(`${base}/#${route.hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#score-ticker', { timeout: 20000 });
    await page.waitForTimeout(6000);

    const m = await page.evaluate(() => {
      const nav = [...document.querySelectorAll('.mainnav > a')].map(a => a.textContent.trim());
      const bottom = [...document.querySelectorAll('.bottomnav a, .bottomnav button')].map(a => a.textContent.trim());
      const sheet = [...document.querySelectorAll('.sheet__grid a')].map(a => a.textContent.trim());
      const main = document.querySelector('#main');
      const wide = [...document.querySelectorAll('#main *')]
        .filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 4)
        .map(el => `${el.tagName}.${el.className}`.slice(0, 70));
      return {
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        wide,
        nav,
        bottom,
        sheet,
        navHasPicks: nav.some(t => /PBE Picks/i.test(t)),
        bottomHasPicks: bottom.some(t => /PBE Picks/i.test(t)),
        bottomHasNews: bottom.some(t => /^News$/i.test(t)),
        sheetHasNews: sheet.some(t => /^News$/i.test(t)),
        text: (main?.textContent || '').replace(/\s+/g, ' ').trim(),
        cards: document.querySelectorAll('.pkc').length,
        pickBadges: document.querySelectorAll('.pkc .pbe-badge--model').length,
        brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).length
      };
    });

    const id = `${route.id}@${width}`;
    // A percentage anywhere on a page with no published model would be invented.
    const percentages = (m.text.match(/\d{1,3}(?:\.\d+)?\s*%/g) || []);
    const proCalls = gatewayCalls.filter(c => c.url.startsWith('/pro/'));
    const picksCalls = gatewayCalls.filter(c => c.url.startsWith('/nhl/picks'));

    check(`${id}: no console/page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    // A browser network log is only tolerated when a gateway route really answered
    // that status; it may never be a cover for an unexplained failure.
    check(`${id}: every tolerated network log has a matching gateway status`,
      networkLogs.length <= gatewayCalls.filter(c => [400, 404, 503].includes(c.status)).length,
      `${networkLogs.length} logs vs ${gatewayCalls.filter(c => [400, 404, 503].includes(c.status)).length} non-2xx gateway answers`);
    check(`${id}: no horizontal overflow`, m.overflow === 0, `${m.overflow}px ${m.wide.join(', ')}`);
    check(`${id}: no broken images`, m.brokenImages === 0, String(m.brokenImages));
    check(`${id}: nav contains PBE Picks`, width > 768 ? m.navHasPicks : m.bottomHasPicks, `desktop=${m.navHasPicks} bottom=${m.bottomHasPicks}`);
    check(`${id}: News is out of the bottom nav`, !m.bottomHasNews);
    check(`${id}: News stays reachable in More`, m.sheetHasNews);
    check(`${id}: no /pro/ request while signed out`, proCalls.length === 0, proCalls.map(c => c.url).join(','));
    // Track Record shows the graded ledger record (accuracy = wins / graded from
    // /nhl/picks/*/record, since 273f22d), so percentages there are not invented.
    if (route.id !== 'track-record') check(`${id}: no invented percentage on screen`, percentages.length === 0, percentages.slice(0, 5).join(','));
    if (route.expectCards) {
      check(`${id}: one card per real game`, m.cards > 0, `${m.cards} cards`);
      check(`${id}: no pick badge while no official model publishes`, m.pickBadges === 0, `${m.pickBadges} pick badges`);
      // Either the API's own prediction_state, or an explicit unavailable — never
      // a state this page decided on its own.
      check(`${id}: every card carries a sourced prediction state`,
        /\bNONE\b|SNAPSHOT_READY|LOCKED_INTERNAL|LOCKED_OFFICIAL|PREDICTION STATE UNAVAILABLE/.test(m.text),
        m.text.slice(0, 200));
    }
    if (route.id.startsWith('pbe-picks')) {
      check(`${id}: picks read API was actually called`, picksCalls.length > 0, JSON.stringify(picksCalls));
      check(`${id}: the page states the pipeline state honestly`,
        /not available in this environment/i.test(m.text)
        || /No official pick is published/i.test(m.text)
        || /No NHL games on/i.test(m.text)
        || m.pickBadges > 0,
        m.text.slice(0, 200));
      check(`${id}: the no-champion truth is stated, not implied`,
        /NO OFFICIAL MODEL/i.test(m.text) || /OFFICIAL MODEL LIVE/i.test(m.text), m.text.slice(0, 160));
      check(`${id}: Track Record and Methodology are linked`, /Track Record/.test(m.text) && /Methodology/.test(m.text));
    }

    await page.screenshot({ path: path.join(outDir, `${route.id}-${width}.png`), fullPage: false });
    if (route.id !== 'home') await page.screenshot({ path: path.join(outDir, `${route.id}-${width}-full.png`), fullPage: true });

    rows.push({ id, overflow: m.overflow, errors: errors.length, netLogs: networkLogs.length, cards: m.cards, picksCalls: picksCalls.map(c => `${c.url.split('?')[0]}:${c.status}`).join(' ') });
    console.log(`${id.padEnd(22)} overflow=${m.overflow} errs=${errors.length} netlogs=${networkLogs.length} cards=${m.cards} navPicks=${m.navHasPicks} bottomPicks=${m.bottomHasPicks} pro=${proCalls.length} picks=[${rows.at(-1).picksCalls}]`);
    if (errors.length) errors.slice(0, 3).forEach(e => console.log('    ! ' + e));

    await ctx.close();
  }
}
await browser.close();

console.log(`\nscreenshots: ${outDir}`);
console.log(`pbe-picks QA: ${rows.length} route/width combinations, ${failures.length} failing checks`);
if (failures.length) {
  console.error('\nFAILURES:\n' + failures.map(f => ' - ' + f).join('\n'));
  process.exit(1);
}
