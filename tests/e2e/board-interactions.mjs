// Ice Board INTERACTION GATE — every control is clicked, nothing is trusted
// because it has an href.
//
//   npm run build && npm run preview           # 127.0.0.1:4173
//   node tests/e2e/board-interactions.mjs
//
// Flags
//   --base <url>     target (default http://127.0.0.1:4173)
//   --no-relay       do not relay the gateway Node-side (use when --base is
//                    the real product origin, which CORS already allows)
//   --label <name>   label used in the report header and artifact filenames
//   --json <path>    write the machine-readable result set
//   --widths a,b,c   override the responsive sweep
//   --quick          named checks only, skip the responsive sweep
//
// What it enforces
//   1. Every discovered control is clicked. A control passes only if the
//      location changed as intended AND the destination actually mounted
//      (real nodes in #main, not an empty shell and not the router's 404),
//      with zero page errors and zero console errors for that click.
//   2. NO DEAD UI. Anything that looks clickable (anchor, button,
//      [role=button], or cursor:pointer) must navigate, open a panel, or
//      change page state — or be explicitly marked disabled
//      (aria-disabled="true" / [data-state="unavailable"]) AND not be an
//      <a href>.
//   3. NO HARD-CODED QA FIXTURES in product navigation: no pinned historical
//      game id and no pinned calendar date in any control's href, and no such
//      literal in src/**. Historical ids are legal only inside tests/.
//   4. Named checks for every control the owner listed, each a real click.
//      A named control that does not exist is reported MISSING, never PASS.
//   5. Responsive sweep: 0 horizontal overflow, 0 console errors, 0 page
//      errors, no broken images, no unreachable control, screenshots saved.
//
// Local runs relay every gateway + newsroom request Node-side with the product
// Origin, exactly like tests/e2e/live-acceptance.mjs, because production CORS
// rejects localhost.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clickControl, clickPath, discover, fixtureViolation, gotoHash, isMounted, launchBrowser, relayLedger, settle,
  makePage, mountState, norm, pick, PRODUCT_ORIGIN, viewportMetrics, waitForMount
} from './lib/interaction.mjs';

const PRODUCT_ORIGIN_HDR = PRODUCT_ORIGIN;

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const flag = name => argv.includes(`--${name}`);

const BASE = (arg('base', process.env.NHL_BROWSER_BASE || 'http://127.0.0.1:4173')).replace(/\/$/, '');
const RELAY = !flag('no-relay');
const LABEL = arg('label', RELAY ? 'local-build' : 'production');
const OUT_DIR = arg('out', 'artifacts/board-interactions');
const JSON_OUT = arg('json', null);
const WIDTHS = (arg('widths', '1440,1280,1024,768,430,390,360')).split(',').map(Number);
const QUICK = flag('quick');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

fs.mkdirSync(path.resolve(REPO, OUT_DIR), { recursive: true });

// ── result ledger ────────────────────────────────────────────────────────────
const results = [];
const record = (name, status, detail = '', extra = {}) => {
  results.push({ name, status, detail, ...extra });
  return status;
};
const PASS = (n, d = '', e = {}) => record(n, 'PASS', d, e);
const FAIL = (n, d = '', e = {}) => record(n, 'FAIL', d, e);
const MISSING = (n, d = '', e = {}) => record(n, 'MISSING', d, e);

// One reporter, used both at the end of a clean run and by the crash handler,
// so a run that dies still prints everything it proved before it died.
let inventory = null;
let reported = false;
function report() {
  reported = true;
  const pad = Math.min(62, Math.max(...results.map(r => r.name.length), 10) + 1);
  console.log(`\n── ICE BOARD INTERACTION REPORT · ${LABEL} · ${BASE} ──\n`);
  for (const r of results) {
    console.log(`${r.name.padEnd(pad)} — ${r.status}${r.status === 'PASS' ? '' : `  [${r.detail}]`}`);
  }
  const totals = results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  console.log(`\nTOTALS  PASS ${totals.PASS || 0} · FAIL ${totals.FAIL || 0} · MISSING ${totals.MISSING || 0} · controls discovered ${inventory?.controls?.length ?? 0}`);
  console.log(`screenshots: ${path.resolve(REPO, OUT_DIR)}`);
  if (JSON_OUT) {
    fs.writeFileSync(path.resolve(REPO, JSON_OUT), JSON.stringify({ label: LABEL, base: BASE, at: new Date().toISOString(), totals, results, inventory }, null, 2));
    console.log(`json: ${JSON_OUT}`);
  }
  return totals;
}

// ── current-season reference, used to spot pinned QA fixtures ────────────────
const now = new Date();
const SEASON_YEAR = now.getUTCMonth() + 1 >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const TODAY_ISO = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10); // ET-ish

/**
 * A pinned QA fixture is a literal id/date in navigation that the live data
 * layer would never produce today: a game id from an earlier season, or a
 * date parameter in the past. Ids that match the current season are the live
 * slate and are legitimate.
 */
function pinnedFixture(href = '') {
  if (!href) return null;
  const idMatch = href.match(/(?:^|[/=])((?:19|20)\d{8})(?:\b|$)/);
  if (idMatch) {
    const season = Number(idMatch[1].slice(0, 4));
    if (season < SEASON_YEAR) return `pinned historical game id ${idMatch[1]} (season ${season}, current ${SEASON_YEAR})`;
  }
  const dateMatch = href.match(/[?&]date=(\d{4}-\d{2}-\d{2})/);
  if (dateMatch && dateMatch[1] < TODAY_ISO) return `pinned past date ${dateMatch[1]}`;
  // Generic belt-and-braces from the shared table.
  return fixtureViolation(href) && /2025|2024/.test(href) ? fixtureViolation(href) : null;
}

// One definition of "a game card is on the board", shared by every check so a
// markup rename cannot make one counter see cards and another see none.
const CARD_SEL = '#main [data-game], #main .scard:not(.pbe-skeleton), #main .gcard:not(.pbe-skeleton)';

// ── navigation helpers ───────────────────────────────────────────────────────
const EXTERNAL = href => /^(https?:)?\/\//.test(href) || href.startsWith('mailto:') || href.startsWith('tel:');

async function ensureBoard(page, bag) {
  const m = await mountState(page);
  if (m.hash === '' || m.hash === '#/' ) {
    if (isMounted(m)) { bag.reset(); return; }
  }
  await page.evaluate(() => { location.hash = '/'; });
  await waitForMount(page, { settle: 900 });
  bag.reset();
}

/** Click a control and describe what the click actually did. */
async function act(page, bag, control, { settle = 1400, expectPanel = false } = {}) {
  bag.reset();
  const before = await mountState(page);
  const beforeScroll = await page.evaluate(() => window.scrollY);
  const beforeBody = await page.evaluate(() => (document.querySelector('#main')?.innerText || '').slice(0, 4000));
  const clicked = await clickControl(page, control);
  if (!clicked) return { clicked: false, before };
  // Give the SPA a chance to swap routes / open a panel.
  if (!expectPanel) {
    await page.waitForFunction(h => location.hash !== h, before.hash, { timeout: 2500 }).catch(() => {});
  }
  await waitForMount(page, { timeout: 9000, settle });
  const after = await mountState(page);
  const afterScroll = await page.evaluate(() => window.scrollY);
  const afterBody = await page.evaluate(() => (document.querySelector('#main')?.innerText || '').slice(0, 4000));
  return {
    clicked: true,
    before,
    after,
    navigated: after.hash !== before.hash,
    panelOpened: after.openPanels.length > before.openPanels.length,
    scrolled: Math.abs(afterScroll - beforeScroll) > 24,
    bodyChanged: afterBody !== beforeBody,
    errors: [...bag.errors]
  };
}

/** Assert a click navigated somewhere that really mounted. */
function assertNav(name, r, { hash, hashRe, allowSame = false } = {}) {
  if (!r.clicked) return MISSING(name, 'control not present / not clickable');
  if (r.errors.length) return FAIL(name, `errors on click: ${r.errors.slice(0, 2).join(' | ')}`);
  if (!allowSame && !r.navigated) return FAIL(name, `hash never changed (stayed ${r.before.hash || '#/'})`);
  const got = r.after.hash;
  if (hash && got.replace(/^#/, '') !== hash.replace(/^#/, '')) return FAIL(name, `expected ${hash}, got ${got}`);
  if (hashRe && !hashRe.test(got)) return FAIL(name, `expected ${hashRe}, got ${got}`);
  if (!isMounted(r.after)) {
    return FAIL(name, `navigated to ${got} but nothing mounted (${r.after.notFound ? 'router 404' : r.after.skeletonOnly ? 'skeleton only' : `${r.after.children} children / ${r.after.textLen} chars`})`);
  }
  return PASS(name, `${r.before.hash || '#/'} → ${got} · mounted ${r.after.children} blocks`);
}

/** Text of the board region, used to prove a date/filter click really re-rendered. */
function boardHeading(page) {
  return page.evaluate(() => {
    const b = document.querySelector('#ice-board, .board, [aria-label="Ice Board"]');
    // The freshness stamp ticks every second. Strip it, or "the board changed"
    // is true even when the click did nothing at all.
    return (b?.innerText || '')
      .replace(/\s+/g, ' ')
      .replace(/\d+\s*(S|M|H|D)\s*AGO/gi, 'AGE')
      .replace(/just now/gi, 'AGE')
      .trim()
      .slice(0, 160);
  });
}

/** Open every collapsed <details> inside #main (capability detail, quiet filters…). */
async function openDisclosures(page) {
  const opened = await page.evaluate(() => {
    let n = 0;
    for (const d of document.querySelectorAll('#main details:not([open])')) { d.open = true; n += 1; }
    return n;
  });
  if (opened) await settle(page);
  return opened;
}

/**
 * Every capability entry in the intelligence panel, linked or not. A card that
 * is deliberately unavailable is a non-anchor with aria-disabled — that is a
 * correct state, not dead UI, so it has to be visible to the harness even
 * though it is not an interactive control.
 */
function capabilityCards(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#mode-panel, .mode-panel, .intel, [aria-labelledby="intel-h"]');
    if (!panel) return [];
    const cssPath = el => {
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && node.tagName !== 'HTML') {
        const p = node.parentElement;
        if (!p) break;
        parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${[...p.children].indexOf(node) + 1})`);
        node = p;
      }
      return parts.join(' > ');
    };
    return [...panel.querySelectorAll('li')]
      .filter(li => !li.querySelector('li'))
      .map(li => {
        const a = li.querySelector('a[href]');
        const label = (li.querySelector('b')?.innerText || li.innerText || '').replace(/\s+/g, ' ').trim();
        const r = li.getBoundingClientRect();
        return {
          label: label.slice(0, 80),
          text: (li.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
          hasAnchor: Boolean(a),
          href: a?.getAttribute('href') || '',
          path: a ? cssPath(a) : cssPath(li),
          ariaDisabled: li.getAttribute('aria-disabled') === 'true' || a?.getAttribute('aria-disabled') === 'true',
          dataState: li.dataset.state || '',
          visible: r.width > 0 && r.height > 0
        };
      });
  });
}

/**
 * Find a date whose board really has games, using only what the page offers
 * (slate jump buttons, the next-slate block, tomorrow) — never a pinned date.
 */
async function findGamesDate(page) {
  const candidates = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[data-goto]')) {
      const d = el.dataset.goto;
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.push(d);
    }
    const t = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    out.push(t);
    return [...new Set(out)];
  });
  for (const date of candidates) {
    await page.evaluate(d => { location.hash = `/?date=${d}`; }, date);
    await waitForMount(page, { settle: 2400 });
    const games = await page.evaluate(sel => document.querySelectorAll(sel).length, CARD_SEL);
    if (games > 0) return { date, games };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
const crash = err => {
  if (reported) return;
  record('Interaction gate runs to completion', 'FAIL', `harness crashed: ${String(err?.stack || err).replace(/\s+/g, ' ').slice(0, 220)}`);
  report();
  process.exit(1);
};
process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const bag = await makePage(context, { relay: RELAY });
const { page } = bag;

console.log(`\nIce Board interaction gate · ${LABEL} · ${BASE} · ${new Date().toISOString()}\n`);

await gotoHash(page, BASE, '/', { settle: 5000 });
const boot = await mountState(page);
if (!isMounted(boot)) FAIL('Ice Board boots', `nothing mounted at #/ (${boot.textLen} chars)`);
else PASS('Ice Board boots', `${boot.children} blocks · ${boot.textLen} chars`);
if (bag.errors.length) FAIL('Ice Board boot is error-free', bag.errors.slice(0, 3).join(' | '));
else PASS('Ice Board boot is error-free');

inventory = await discover(page);

// ── 1. named chrome checks ───────────────────────────────────────────────────
async function named(name, spec, opts = {}) {
  await ensureBoard(page, bag);
  const { controls } = await discover(page);
  const control = pick(controls, spec);
  if (!control) return MISSING(name, `no visible control matching ${JSON.stringify(spec.names || spec.name || spec)}`);
  const r = await act(page, bag, control, opts);
  return { control, r };
}

async function namedNav(name, spec, expect, opts = {}) {
  const out = await named(name, spec, opts);
  if (typeof out === 'string') return out;                       // MISSING
  return assertNav(name, out.r, expect);
}

// Skip link — keyboard users' first control on the page.
{
  await ensureBoard(page, bag);
  const skip = (await discover(page)).controls.find(c => /skip to content/i.test(c.name));
  if (!skip) MISSING('Skip to content', 'no skip link');
  else {
    bag.reset();
    await page.evaluate(p => document.querySelector(p)?.click(), skip.path);
    await settle(page);
    const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    focused === 'main' || focused === 'MAIN'
      ? PASS('Skip to content', 'moves focus to #main')
      : FAIL('Skip to content', `focus went to "${focused}", not #main — NO REAL ACTION`);
  }
}

// Brand / logo
await namedNav('Logo → Ice Board', { region: 'chrome', names: ['propbetedge nhl', 'propbetedge'] }, { hashRe: /^#?\/?$/, allowSame: true });

// Primary nav
const NAV_CHECKS = [
  ['Nav · Ice Board', ['ice board'], /^#\/$/],
  ['Nav · PBE Picks', ['pbe picks'], /^#\/pbe-picks/],
  ['Nav · PBE Cast', ['pbe cast'], /^#\/cast/],
  ['Nav · Props', ['props'], /^#\/props/],
  ['Nav · Shot Lab', ['shot lab'], /^#\/shots/]
];
for (const [name, names, hashRe] of NAV_CHECKS) {
  if (name === 'Nav · Ice Board') {
    // Already on the board: a same-route click must at least keep the board mounted.
    await ensureBoard(page, bag);
    const { controls } = await discover(page);
    const c = pick(controls, { region: 'chrome', names, tag: 'a' });
    if (!c) { MISSING(name, 'nav item absent'); continue; }
    await clickControl(page, c);
    await waitForMount(page, { settle: 900 });
    const m = await mountState(page);
    if (isMounted(m) && /^#?\/?$/.test(m.hash) && m.activeNav === 'board') PASS(name, 'stays on a mounted Ice Board, marked current');
    else FAIL(name, `hash ${m.hash} · activeNav ${m.activeNav} · mounted ${isMounted(m)}`);
    continue;
  }
  await namedNav(name, { region: 'chrome', names, tag: 'a' }, { hashRe });
}

// A route whose entry state has to choose a real game (Shot Lab, PBE Cast) may
// legitimately LAND on a historical id — but only when the schedule resolves it
// at runtime. The id must never be baked into the link the user clicked.
for (const [name, names, hashRe] of [
  ['Shot Lab · entry id comes from live data', ['shot lab'], /^#\/shots(\/\d{10})?/],
  ['PBE Cast · entry id comes from live data', ['pbe cast'], /^#\/cast(\/\d{10})?/]
]) {
  await ensureBoard(page, bag);
  const c = pick((await discover(page)).controls, { region: 'chrome', names, tag: 'a' });
  if (!c) { MISSING(name, 'nav item absent'); continue; }
  const hrefId = (c.href.match(/\d{10}/) || [])[0] || null;
  const r = await act(page, bag, c, { settle: 2600 });
  const landedId = (r.after?.hash.match(/\d{10}/) || [])[0] || null;
  if (!r.clicked) MISSING(name, 'not clickable');
  else if (hrefId) FAIL(name, `the link itself carries a pinned game id (${c.href})`);
  else if (!isMounted(r.after)) FAIL(name, `landed ${r.after.hash} but nothing mounted`);
  else if (!hashRe.test(r.after.hash)) FAIL(name, `unexpected destination ${r.after.hash}`);
  else PASS(name, landedId
    ? `href "${c.href}" carries no id; the page resolved ${landedId} from the schedule`
    : `href "${c.href}" carries no id; the page showed its slate entry state`);
}

// ── More menu behaviour ──────────────────────────────────────────────────────
await ensureBoard(page, bag);
let inv = await discover(page);
const moreBtn = pick(inv.controls, { region: 'chrome', names: ['more'], tag: 'button' });
if (!moreBtn) {
  MISSING('More · opens', 'no More button in the header');
  MISSING('More · closes on second click');
  MISSING('More · closes on outside click');
  MISSING('More · closes on Escape');
  MISSING('More · closes after navigation');
} else {
  const menuOpen = () => page.evaluate(() => {
    const btn = document.querySelector('[data-more], .more__btn, header button[aria-controls]');
    const menu = btn?.getAttribute('aria-controls') ? document.getElementById(btn.getAttribute('aria-controls')) : document.querySelector('.more__menu, header [role="menu"]');
    if (!menu) return false;
    const r = menu.getBoundingClientRect();
    return !menu.hidden && r.width > 0 && r.height > 0;
  });

  await clickControl(page, moreBtn);
  await settle(page);
  const opened = await menuOpen();
  opened ? PASS('More · opens', 'menu became visible') : FAIL('More · opens', 'menu never became visible');

  if (opened) {
    await clickControl(page, moreBtn);
    await settle(page);
    (await menuOpen()) ? FAIL('More · closes on second click', 'still open') : PASS('More · closes on second click');

    await clickControl(page, moreBtn);
    await settle(page);
    await page.mouse.click(700, 620);
    await settle(page);
    (await menuOpen()) ? FAIL('More · closes on outside click', 'still open') : PASS('More · closes on outside click');

    await clickControl(page, moreBtn);
    await settle(page);
    await page.keyboard.press('Escape');
    await settle(page);
    (await menuOpen()) ? FAIL('More · closes on Escape', 'still open') : PASS('More · closes on Escape');
  } else {
    FAIL('More · closes on second click', 'menu never opened');
    FAIL('More · closes on outside click', 'menu never opened');
    FAIL('More · closes on Escape', 'menu never opened');
  }

  // Every item inside More, each a real click, plus the after-navigation close.
  await ensureBoard(page, bag);
  await clickPath(page, (await discover(page)).controls.find(c => norm(c.name).startsWith('more') && c.tag === 'button' && c.region === 'chrome')?.path || moreBtn.path);
  await settle(page);
  const menuItems = (await discover(page)).controls.filter(c => c.region === 'more-menu' && c.tag === 'a' && c.visible);
  if (!menuItems.length) MISSING('More · items', 'menu exposed no items');
  let firstItemChecked = false;
  for (const item of menuItems) {
    const label = item.name.replace(/\s+/g, ' ').trim();
    await ensureBoard(page, bag);
    // Close first: ensureBoard() is a no-op when we never left the board, so a
    // menu left open by the previous step would be toggled SHUT by the click.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const btn = (await discover(page)).controls.find(c => c.region === 'chrome' && c.tag === 'button' && norm(c.name).startsWith('more'));
    if (btn) { await clickControl(page, btn); await settle(page); }
    const live = (await discover(page)).controls.find(c => c.region === 'more-menu' && norm(c.name) === norm(item.name));
    if (!live) { MISSING(`More item · ${label}`, 'item vanished between discovery and click'); continue; }
    const r = await act(page, bag, live);
    assertNav(`More item · ${label}`, r, { hashRe: new RegExp(`^#${(live.href || '').replace(/^#/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
    if (!firstItemChecked) {
      firstItemChecked = true;
      const stillOpen = await menuOpen();
      stillOpen ? FAIL('More · closes after navigation', 'menu still open on the destination page') : PASS('More · closes after navigation');
    }
  }
}

// ── Search palette ───────────────────────────────────────────────────────────
const paletteOpen = () => page.evaluate(() => {
  const p = document.querySelector('.palette, #palette, [role="dialog"][aria-label*="earch" i]');
  if (!p) return false;
  const r = p.getBoundingClientRect();
  return !p.hidden && r.width > 0 && r.height > 0;
});
const paletteInput = () => page.locator('.palette input, #palette-input, [role="dialog"] input[type="search"]').first();

await ensureBoard(page, bag);
inv = await discover(page);
const searchBtn = pick(inv.controls, { region: 'chrome', names: ['search'], tag: 'button' });
if (!searchBtn) {
  ['Search · click opens', 'Search · Ctrl-K opens', 'Search · Escape closes', 'Search · typing a team navigates', 'Search · page result navigates', 'Search · Enter selects highlighted']
    .forEach(n => MISSING(n, 'no Search control in the header'));
} else {
  await clickControl(page, searchBtn);
  await settle(page);
  (await paletteOpen()) ? PASS('Search · click opens') : FAIL('Search · click opens', 'palette never became visible');

  await page.keyboard.press('Escape');
  await settle(page);
  (await paletteOpen()) ? FAIL('Search · Escape closes', 'palette still visible') : PASS('Search · Escape closes');

  await page.keyboard.press('Control+K');
  await settle(page);
  const viaKey = await paletteOpen();
  viaKey ? PASS('Search · Ctrl-K opens') : FAIL('Search · Ctrl-K opens', 'Ctrl-K did not open the palette');
  if (viaKey) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }

  // Typing a team name must produce a team result that really navigates.
  const openPalette = async () => {
    if (await paletteOpen()) return true;
    const b = (await discover(page)).controls.find(c => c.region === 'chrome' && c.tag === 'button' && norm(c.name).includes('search'));
    if (!b) return false;
    await clickControl(page, b);
    await settle(page);
    return paletteOpen();
  };

  async function paletteQuery(name, query, matcher, hashRe) {
    await ensureBoard(page, bag);
    if (!(await openPalette())) return MISSING(name, 'palette would not open');
    bag.reset();
    await paletteInput().fill('');
    await paletteInput().type(query, { delay: 25 });
    await settle(page);
    const hit = await page.evaluate(m => {
      const links = [...document.querySelectorAll('.palette a, #palette-results a, [role="dialog"] [role="option"] a, [role="dialog"] li a')];
      const idx = links.findIndex(a => new RegExp(m, 'i').test(a.getAttribute('href') || ''));
      if (idx < 0) return null;
      const a = links[idx];
      return { href: a.getAttribute('href'), text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70) };
    }, matcher);
    if (!hit) return FAIL(name, `typing "${query}" produced no result matching ${matcher}`);
    const beforeHash = (await mountState(page)).hash;
    await page.evaluate(m => {
      const a = [...document.querySelectorAll('.palette a, #palette-results a, [role="dialog"] li a')].find(x => new RegExp(m, 'i').test(x.getAttribute('href') || ''));
      a?.click();
    }, matcher);
    await page.waitForFunction(h => location.hash !== h, beforeHash, { timeout: 4000 }).catch(() => {});
    await waitForMount(page, { settle: 1400 });
    const after = await mountState(page);
    if (!hashRe.test(after.hash)) return FAIL(name, `expected ${hashRe}, got ${after.hash}`);
    if (!isMounted(after)) return FAIL(name, `navigated to ${after.hash} but nothing mounted`);
    if (bag.errors.length) return FAIL(name, `errors: ${bag.errors.slice(0, 2).join(' | ')}`);
    if (await paletteOpen()) return FAIL(name, 'palette stayed open after selecting a result');
    return PASS(name, `"${query}" → ${hit.text} → ${after.hash}`);
  }

  await paletteQuery('Search · typing a team navigates', 'Edmonton', '#/team/', /^#\/team\/[A-Z]{2,4}$/);
  await paletteQuery('Search · page result navigates', 'Standings', '#/standings', /^#\/standings/);

  // Enter must activate the highlighted result, not the first DOM node blindly.
  await ensureBoard(page, bag);
  if (!(await openPalette())) MISSING('Search · Enter selects highlighted', 'palette would not open');
  else {
    bag.reset();
    await paletteInput().fill('');
    await paletteInput().type('Methodology', { delay: 25 });
    await settle(page);
    const target = await page.evaluate(() => {
      const opts = [...document.querySelectorAll('.palette [role="option"], #palette-results li')];
      const hi = opts.find(o => o.getAttribute('aria-selected') === 'true') || opts[0];
      return hi?.querySelector('a')?.getAttribute('href') || null;
    });
    const beforeHash = (await mountState(page)).hash;
    await page.keyboard.press('Enter');
    await page.waitForFunction(h => location.hash !== h, beforeHash, { timeout: 4000 }).catch(() => {});
    await waitForMount(page, { settle: 1300 });
    const after = await mountState(page);
    if (!target) FAIL('Search · Enter selects highlighted', 'no highlighted result to select');
    else if (after.hash.replace(/^#/, '') !== target.replace(/^#/, '')) FAIL('Search · Enter selects highlighted', `highlighted ${target}, landed ${after.hash}`);
    else if (!isMounted(after)) FAIL('Search · Enter selects highlighted', `landed ${after.hash} but nothing mounted`);
    else if (bag.errors.length) FAIL('Search · Enter selects highlighted', bag.errors.slice(0, 2).join(' | '));
    else PASS('Search · Enter selects highlighted', `${target} mounted`);
  }
}

// ── Alerts bell ──────────────────────────────────────────────────────────────
await ensureBoard(page, bag);
inv = await discover(page);
const bell = pick(inv.controls, { region: 'chrome', names: ['alerts', 'alert'], tag: 'button' });
if (!bell) { MISSING('Alerts bell · opens panel'); MISSING('Alerts bell · closes'); }
else {
  bag.reset();
  const panelVisible = () => page.evaluate(() => {
    const p = document.querySelector('.alert-center, #alert-center, [aria-label*="alert" i][role="dialog"]');
    if (!p) return false;
    const r = p.getBoundingClientRect();
    return !p.hidden && r.width > 0 && r.height > 0;
  });
  await clickControl(page, bell);
  await settle(page);
  const open = await panelVisible();
  if (!open) FAIL('Alerts bell · opens panel', 'bell click produced no visible panel — NO REAL ACTION');
  else if (bag.errors.length) FAIL('Alerts bell · opens panel', bag.errors.slice(0, 2).join(' | '));
  else PASS('Alerts bell · opens panel');
  if (open) {
    const closer = (await discover(page)).controls.find(c => c.region === 'alerts' && c.tag === 'button' && /close/i.test(c.name));
    if (closer) { await clickControl(page, closer); await settle(page); }
    else { await page.keyboard.press('Escape'); await settle(page); }
    (await panelVisible()) ? FAIL('Alerts bell · closes', 'panel stayed open') : PASS('Alerts bell · closes');
  } else FAIL('Alerts bell · closes', 'panel never opened');
}

// ── NHL Pro ──────────────────────────────────────────────────────────────────
await ensureBoard(page, bag);
inv = await discover(page);
const pro = pick(inv.controls, { regions: ['chrome', 'hero', 'board'], names: ['nhl pro', 'open nhl pro', 'go pro', 'pro'] , tag: 'button' });
if (!pro) {
  // Absent is not automatically wrong. The chrome deliberately withholds the
  // NHL Pro control when the gateway reports sign-in cannot work here — a
  // control that could not complete is worse than no control. Ask the gateway
  // itself rather than assuming either way.
  const hiddenNode = await page.evaluate(() => {
    const el = document.querySelector('[data-open-nhl-pro], #nhl-pro-btn');
    return el ? { present: true, hidden: el.hasAttribute('hidden'), account: el.dataset.account || '' } : { present: false };
  });
  let signIn = null;
  try {
    const r = await fetch(`${'https://nhl-api.propbetedge.ai'}/readiness`, { headers: { Accept: 'application/json', Origin: PRODUCT_ORIGIN_HDR } });
    const j = await r.json();
    const a = j?.auth || {};
    signIn = Boolean(a.store && a.throttle_key && a.entitlement && a.email);
  } catch { signIn = null; }
  if (hiddenNode.present && hiddenNode.hidden && signIn === false) {
    PASS('NHL Pro · opens pricing', `correctly withheld: gateway /readiness reports sign-in unavailable (auth.email=false), so no dead control is rendered (account="${hiddenNode.account}")`);
    PASS('NHL Pro · closes', 'not applicable — no control is rendered');
  } else if (hiddenNode.present && hiddenNode.hidden) {
    FAIL('NHL Pro · opens pricing', `control exists but is hidden while the gateway reports sign-in ${signIn === null ? 'unknown' : 'available'}`);
    FAIL('NHL Pro · closes', 'control never shown');
  } else {
    MISSING('NHL Pro · opens pricing', 'no NHL Pro control anywhere in the chrome');
    MISSING('NHL Pro · closes', 'no NHL Pro control anywhere in the chrome');
  }
} else {
  bag.reset();
  const dlg = () => page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].some(d => {
    const r = d.getBoundingClientRect();
    return !d.closest('[hidden]') && !d.hasAttribute('hidden') && r.width > 0 && r.height > 0 && /pro|pricing|founding/i.test((d.getAttribute('aria-labelledby') ? document.getElementById(d.getAttribute('aria-labelledby'))?.innerText || '' : '') + ' ' + (d.className || '') + ' ' + (d.id || ''));
  }));
  await clickControl(page, pro);
  await settle(page);
  const open = await dlg();
  if (!open) FAIL('NHL Pro · opens pricing', 'button produced no pricing dialog — NO REAL ACTION');
  else if (bag.errors.length) FAIL('NHL Pro · opens pricing', bag.errors.slice(0, 2).join(' | '));
  else PASS('NHL Pro · opens pricing');
  if (open) {
    await page.keyboard.press('Escape');
    await settle(page);
    let still = await dlg();
    if (still) {
      const x = (await discover(page)).controls.find(c => c.region === 'pro-modal' && /close/i.test(c.name));
      if (x) { await clickControl(page, x); await settle(page); still = await dlg(); }
    }
    still ? FAIL('NHL Pro · closes', 'dialog would not close') : PASS('NHL Pro · closes');
  } else FAIL('NHL Pro · closes', 'dialog never opened');
}

// ── Season / preseason chip ──────────────────────────────────────────────────
await ensureBoard(page, bag);
{
  const chip = await page.evaluate(() => {
    const el = document.querySelector('#season-chip, .season-chip, header [aria-live]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || '').trim(),
      href: el.getAttribute('href') || '',
      cursor: getComputedStyle(el).cursor,
      visible: r.width > 0 && r.height > 0,
      interactive: ['A', 'BUTTON'].includes(el.tagName) || el.getAttribute('role') === 'button' || el.hasAttribute('tabindex')
    };
  });
  if (!chip || !chip.visible) MISSING('Season chip', 'no season/preseason chip rendered');
  else if (!chip.interactive && chip.cursor !== 'pointer') PASS('Season chip', `status text only, correctly non-interactive ("${chip.text}")`);
  else {
    const before = (await mountState(page)).hash;
    await page.evaluate(() => document.querySelector('#season-chip, .season-chip')?.click());
    await settle(page);
    const after = await mountState(page);
    if (after.hash !== before || after.openPanels.length) PASS('Season chip', `interactive, ${before} → ${after.hash}`);
    else FAIL('Season chip', `looks clickable (cursor:${chip.cursor}) but the click does nothing — DEAD UI`);
  }
}

// ── Mode ribbon ("What's available") — persistent chrome off the board route ──
{
  await page.evaluate(() => { location.hash = '/news'; });
  await waitForMount(page, { settle: 2200 });
  bag.reset();
  const ribbon = (await discover(page)).controls.find(c => c.region === 'ribbon' && c.visible);
  if (!ribbon) MISSING('Mode ribbon · What\'s available', 'no mode ribbon rendered (may be out of season)');
  else {
    const before = (await mountState(page)).hash;
    await clickControl(page, ribbon);
    await settle(page);
    await waitForMount(page, { settle: 1500 });
    const after = await mountState(page);
    const panel = await page.evaluate(() => {
      const p = document.querySelector('.mode-panel, #mode-panel');
      return p ? { present: true, top: Math.round(p.getBoundingClientRect().top) } : { present: false };
    });
    if (after.hash === before) FAIL('Mode ribbon · What\'s available', 'click changed nothing — NO REAL ACTION');
    else if (!isMounted(after)) FAIL('Mode ribbon · What\'s available', `landed ${after.hash} but nothing mounted`);
    else if (!panel.present) FAIL('Mode ribbon · What\'s available', `landed ${after.hash} but the capability panel it promises is not on the page — WRONG TARGET`);
    else if (bag.errors.length) FAIL('Mode ribbon · What\'s available', bag.errors.slice(0, 2).join(' | '));
    else PASS('Mode ribbon · What\'s available', `${before} → ${after.hash}, capability panel at y=${panel.top}`);
  }
  await ensureBoard(page, bag);
}

// ── Board date navigation + filters ──────────────────────────────────────────
await ensureBoard(page, bag);

for (const [name, spec] of [
  ['Board · Previous day', { region: 'board', names: ['previous day', 'previous'] }],
  ['Board · Next day', { region: 'board', names: ['next day', 'next'] }]
]) {
  await ensureBoard(page, bag);
  const c = pick((await discover(page)).controls, { ...spec, tag: 'button' });
  if (!c) { MISSING(name, 'control absent'); continue; }
  bag.reset();
  const h0 = await boardHeading(page);
  const hash0 = (await mountState(page)).hash;
  await clickControl(page, c);
  await settle(page);
  const h1 = await boardHeading(page);
  const hash1 = (await mountState(page)).hash;
  if (h1 === h0 && hash1 === hash0) FAIL(name, 'neither the URL nor the board date changed — NO REAL ACTION');
  else if (bag.errors.length) FAIL(name, bag.errors.slice(0, 2).join(' | '));
  else if (!/date=\d{4}-\d{2}-\d{2}/.test(hash1)) FAIL(name, `board re-rendered but the URL did not record the date (${hash1 || '#/'}) — the date is not shareable/back-navigable`);
  else PASS(name, `${hash0 || '#/'} → ${hash1}`);
}

// Slate jump buttons — Today / Tomorrow / Next slate. These are promoted on a
// zero-game date, so each has to move the board to its own labelled date.
for (const label of ['Today', 'Tomorrow', 'Next slate']) {
  const name = `Slate nav · ${label}`;
  await ensureBoard(page, bag);
  const c = pick((await discover(page)).controls, { region: 'board', names: [label], tag: 'button' });
  if (!c) {
    // "Next slate" is a product decision, not an omission: it is only drawn
    // when the next slate is neither today nor tomorrow. Say which it is.
    const dates = await page.evaluate(() => [...document.querySelectorAll('#main [data-goto]')].map(e => e.dataset.goto).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)));
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    if (label === 'Next slate' && !dates.some(d => d > tomorrow)) PASS(name, 'not applicable — the next slate IS tomorrow, so no third jump button is drawn');
    else MISSING(name, 'slate jump button not present');
    continue;
  }
  const info = await page.evaluate(p => {
    const el = document.querySelector(p);
    return { goto: el?.dataset?.goto || '', current: /is-current/.test(el?.className || '') || el?.getAttribute('aria-current') === 'true' };
  }, c.path);
  const nowDate = (await mountState(page)).hash.match(/date=(\d{4}-\d{2}-\d{2})/)?.[1] || TODAY_ISO;
  bag.reset();
  const before = await boardHeading(page);
  await clickControl(page, c);
  await settle(page);
  const after = await boardHeading(page);
  const m = await mountState(page);
  const hash = m.hash;
  if (!info.goto) FAIL(name, 'button carries no target date');
  else if (info.goto === nowDate) {
    // Already on that date it cannot move, so it must be marked current and
    // must leave a mounted board behind.
    (info.current && isMounted(m))
      ? PASS(name, `already on ${info.goto}; marked current, board stays mounted`)
      : FAIL(name, `points at the current date ${info.goto} but is not marked current (is-current=${info.current}, mounted=${isMounted(m)})`);
  } else if (after === before && !hash.includes(info.goto)) FAIL(name, `click did not move the board to ${info.goto} — NO REAL ACTION`);
  else if (bag.errors.length) FAIL(name, bag.errors.slice(0, 2).join(' | '));
  else if (!isMounted(m)) FAIL(name, `moved to ${info.goto} but the board did not mount`);
  else PASS(name, `${info.goto} · ${hash || '#/'} · ${after.slice(0, 54)}`);
}

// Today (round trip: leave today, come back)
await ensureBoard(page, bag);
{
  const c = pick((await discover(page)).controls, { region: 'board', names: ['today'], tag: 'button' });
  if (!c) MISSING('Board · Today');
  else {
    // Move off today first so the control has something to do.
    const shift = pick((await discover(page)).controls, { region: 'board', names: ['next day', 'next'], tag: 'button' });
    if (shift) { await clickControl(page, shift); await settle(page); }
    bag.reset();
    const before = await boardHeading(page);
    const live = pick((await discover(page)).controls, { region: 'board', names: ['today'], tag: 'button' });
    if (!live) MISSING('Board · Today', 'control vanished after a date shift');
    else {
      await clickControl(page, live);
      await settle(page);
      const after = await boardHeading(page);
      const hash = (await mountState(page)).hash;
      if (after === before) FAIL('Board · Today', 'board did not return to today');
      else if (bag.errors.length) FAIL('Board · Today', bag.errors.slice(0, 2).join(' | '));
      else PASS('Board · Today', `returns to today (${hash || '#/'})`);
    }
  }
}

// Date input
await ensureBoard(page, bag);
{
  const c = pick((await discover(page)).controls, { region: 'board', tag: 'input' });
  if (!c || c.type !== 'date') MISSING('Board · Date input', 'no date input on the board');
  else {
    bag.reset();
    const before = await boardHeading(page);
    const target = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await page.locator(c.path).first().fill(target);
    await page.locator(c.path).first().dispatchEvent('change');
    await settle(page);
    const after = await boardHeading(page);
    const hash = (await mountState(page)).hash;
    if (after === before && !hash.includes(target)) FAIL('Board · Date input', `setting ${target} changed nothing — NO REAL ACTION`);
    else if (bag.errors.length) FAIL('Board · Date input', bag.errors.slice(0, 2).join(' | '));
    else if (!hash.includes(target)) FAIL('Board · Date input', `board moved to ${target} but the URL says ${hash || '#/'}`);
    else PASS('Board · Date input', `${target} → ${hash}`);
  }
}

// ── Filters ──────────────────────────────────────────────────────────────────
// The chips are only the primary control on a date that HAS games. On a
// zero-game date they collapse into a quiet disclosure by design, so the gate
// checks two different things:
//   (a) on a games date, each chip really filters;
//   (b) on the zero-game date, the quiet state is correct and the chips still
//       work once the disclosure is opened.

// (b) quiet state on today, asserted BEFORE anything is expanded.
await ensureBoard(page, bag);
{
  const quiet = await page.evaluate(sel => {
    const bar = document.querySelector('[data-filters]');
    const chips = [...document.querySelectorAll('#main [data-filter]')];
    const visibleChips = chips.filter(c => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const details = document.querySelector('#main details');
    const hasGames = document.querySelectorAll(sel).length > 0;
    return {
      mode: bar?.dataset?.filters || null,
      chips: chips.length,
      visibleChips: visibleChips.length,
      hasGames,
      disclosure: Boolean(bar?.querySelector('details') || (details && details.contains(chips[0] || null)))
    };
  }, CARD_SEL);
  if (quiet.hasGames) PASS('Filters · zero-game quiet state', 'today has games; the quiet state does not apply');
  else if (quiet.mode === null) MISSING('Filters · zero-game quiet state', 'board exposes no [data-filters] state');
  else if (quiet.mode !== 'quiet') FAIL('Filters · zero-game quiet state', `zero-game date but data-filters="${quiet.mode}"`);
  else if (!quiet.chips) FAIL('Filters · zero-game quiet state', 'quiet mode removed the chips entirely — the filters are gone, not collapsed');
  else if (quiet.visibleChips === quiet.chips) FAIL('Filters · zero-game quiet state', `all ${quiet.chips} zero chips are still rendered prominently`);
  else PASS('Filters · zero-game quiet state', `data-filters="quiet" · ${quiet.chips} chips collapsed behind a disclosure`);

  // The disclosure must open on a real click and reveal working chips.
  const summary = (await discover(page)).controls.find(c => c.tag === 'summary' && /filter/i.test(c.name));
  if (!summary) {
    if (quiet.hasGames) PASS('Filters · quiet disclosure opens', 'not applicable on a games date');
    else MISSING('Filters · quiet disclosure opens', 'no filters disclosure present');
  } else {
    bag.reset();
    await clickControl(page, summary);
    await settle(page);
    const after = await page.evaluate(() => [...document.querySelectorAll('#main [data-filter]')]
      .filter(c => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length);
    if (after < 4) FAIL('Filters · quiet disclosure opens', `opened but only ${after} chips became visible`);
    else if (bag.errors.length) FAIL('Filters · quiet disclosure opens', bag.errors.slice(0, 2).join(' | '));
    else PASS('Filters · quiet disclosure opens', `${after} chips revealed`);
  }
}

// (a) real filtering, on a date the league actually has games.
const gamesDate = await findGamesDate(page);
if (!gamesDate) {
  for (const l of ['All', 'Live', 'Upcoming', 'Final']) MISSING(`Board filter · ${l}`, 'no date with games reachable from the board');
  MISSING('Board · game card links', 'no date with games reachable from the board');
} else {
  console.log(`  (filters exercised on ${gamesDate.date}, ${gamesDate.games} games)`);
  for (const label of ['All', 'Live', 'Upcoming', 'Final']) {
    const name = `Board filter · ${label}`;
    await page.evaluate(d => { location.hash = `/?date=${d}`; }, gamesDate.date);
    await waitForMount(page, { settle: 2200 });
    await openDisclosures(page);
    bag.reset();
    const c = pick((await discover(page)).controls, { region: 'board', names: [label], tag: 'button' });
    if (!c) { MISSING(name, `filter chip absent on ${gamesDate.date}`); continue; }
    const before = await page.evaluate(sel => ({
      cards: document.querySelectorAll(sel).length,
      body: (document.querySelector('#ice-board, .board')?.innerText || '').slice(0, 2500)
    }), CARD_SEL);
    await clickControl(page, c);
    await settle(page);
    const state = await page.evaluate(p => document.querySelector(p)?.getAttribute('aria-pressed'), c.path);
    const after = await page.evaluate(sel => ({
      cards: document.querySelectorAll(sel).length,
      body: (document.querySelector('#ice-board, .board')?.innerText || '').slice(0, 2500)
    }), CARD_SEL);
    if (bag.errors.length) FAIL(name, bag.errors.slice(0, 2).join(' | '));
    else if (state !== 'true') FAIL(name, `click did not set aria-pressed (got ${state}) — NO REAL ACTION`);
    else if (label !== 'All' && after.cards === before.cards && after.body === before.body) FAIL(name, `selected, but the slate did not change (${after.cards} cards either way)`);
    else PASS(name, `aria-pressed=true · ${before.cards} → ${after.cards} cards on ${gamesDate.date}`);
  }

  // Game cards, on the date that has them. Reset the board first: the filter
  // loop above left a non-ALL filter selected, which can legitimately render
  // zero cards and would be misread as "the cards carry no links".
  await ensureBoard(page, bag);
  await page.evaluate(d => { location.hash = `/?date=${d}`; }, gamesDate.date);
  await waitForMount(page, { settle: 2800 });
  const cards = (await discover(page)).controls.filter(c => c.region === 'board' && c.tag === 'a' && /^#\//.test(c.href) && c.visible);
  if (!cards.length) MISSING('Board · game card links', `${gamesDate.games} cards on ${gamesDate.date} but none carry a link`);
  else {
    // One of each distinct destination the card offers (Matchup / Picks / Cast).
    const byTarget = new Map();
    for (const c of cards) {
      const key = (c.href.match(/^#\/[a-z-]+/) || [c.href])[0];
      if (!byTarget.has(key)) byTarget.set(key, c);
    }
    for (const [key, c] of byTarget) {
      await ensureBoard(page, bag);
      await page.evaluate(d => { location.hash = `/?date=${d}`; }, gamesDate.date);
      await waitForMount(page, { settle: 2600 });
      const live = (await discover(page)).controls.find(x => x.path === c.path && x.href === c.href);
      if (!live) continue;
      const r = await act(page, bag, live, { settle: 2600 });
      assertNav(`Board · game card → ${key}`, r, { hashRe: /^#\// });
    }
  }
  await ensureBoard(page, bag);
}

// ── Hero CTAs, What Changed, next puck drop, Next Slate ──────────────────────
await ensureBoard(page, bag);
inv = await discover(page);

// Hero CTAs. The hero rewrites itself per league state (live / today / opener),
// so the CTAs are read off the page and each is judged on what it must do:
// an in-page jump scrolls, a route link navigates and mounts, a date button
// moves the board. A hero with no CTA at all is a failure.
{
  await ensureBoard(page, bag);
  const ctas = await page.evaluate(() => {
    const zone = document.querySelector('.hero__cta, .hero [class*="cta"]') || document.querySelector('.hero__copy, .hero');
    if (!zone) return [];
    const cssPath = el => {
      const parts = []; let n = el;
      while (n && n.nodeType === 1 && n.tagName !== 'HTML') { const p = n.parentElement; if (!p) break; parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${[...p.children].indexOf(n) + 1})`); n = p; }
      return parts.join(' > ');
    };
    return [...zone.querySelectorAll('a[href], button')].map(el => ({
      path: cssPath(el),
      label: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      href: el.getAttribute('href') || '',
      goto: el.dataset.goto || '',
      jump: 'jump' in el.dataset
    }));
  });
  if (!ctas.length) MISSING('Hero CTA', 'the hero renders no call to action');
  for (const cta of ctas) {
    const name = `Hero CTA · ${cta.label || cta.href || 'unnamed'}`;
    await ensureBoard(page, bag);
    bag.reset();
    await page.evaluate(() => window.scrollTo(0, 0));
    const before = await mountState(page);
    const beforeBoard = await boardHeading(page);
    await clickPath(page, cta.path);
    await settle(page);
    await waitForMount(page, { settle: 1400 });
    const after = await mountState(page);
    const y = await page.evaluate(() => window.scrollY);
    const afterBoard = await boardHeading(page);
    if (bag.errors.length) { FAIL(name, bag.errors.slice(0, 2).join(' | ')); continue; }
    if (cta.jump || cta.href === '#ice-board') {
      y > 120 ? PASS(name, `in-page jump, scrolled to y=${Math.round(y)}`) : FAIL(name, `in-page jump did not move the page (y=${Math.round(y)}) — NO REAL ACTION`);
    } else if (cta.goto) {
      (afterBoard !== beforeBoard || after.hash.includes(cta.goto))
        ? PASS(name, `board moved to ${cta.goto}`)
        : FAIL(name, `date CTA for ${cta.goto} changed nothing — NO REAL ACTION`);
    } else if (/^#\//.test(cta.href)) {
      const fx = pinnedFixture(cta.href);
      if (after.hash === before.hash) FAIL(name, `hash never changed (stayed ${before.hash || '#/'})`);
      else if (!isMounted(after)) FAIL(name, `navigated to ${after.hash} but nothing mounted`);
      else if (fx) FAIL(name, `navigates, but the destination is a QA fixture: ${cta.href} (${fx})`);
      else PASS(name, `${before.hash || '#/'} → ${after.hash} · mounted`);
    } else {
      (after.hash !== before.hash || after.openPanels.length > before.openPanels.length || afterBoard !== beforeBoard)
        ? PASS(name, 'produced a real state change')
        : FAIL(name, 'click produced no navigation, panel or board change — NO REAL ACTION');
    }
  }
}

// What Changed → Newsroom
await namedNav('What Changed · Newsroom link', { regions: ['changes', 'hero'], names: ['newsroom', 'open newsroom', 'newsroom →'], tag: 'a' }, { hashRe: /^#\/news/ });

// What Changed items (external editorial) — validated by fetch, never by href alone.
{
  await ensureBoard(page, bag);
  const items = (await discover(page)).controls.filter(c => ['changes', 'hero'].includes(c.region) && c.tag === 'a' && EXTERNAL(c.href) && !/^mailto:/.test(c.href));
  if (!items.length) MISSING('What Changed · story links', 'no editorial items rendered');
  else {
    const checked = [];
    for (const it of items.slice(0, 5)) {
      try {
        // Bounded: a slow third-party publisher must not stall the gate.
        const res = await fetch(it.href, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(12000),
          headers: { 'user-agent': 'Mozilla/5.0 pbe-interaction-gate' }
        });
        checked.push({ href: it.href, status: res.status });
      } catch (e) { checked.push({ href: it.href, status: 0, error: String(e.message).slice(0, 60) }); }
    }
    const bad = checked.filter(c => c.status === 0 || c.status >= 400);
    const anyBlank = items.every(i => i.target === '_blank');
    if (bad.length) FAIL('What Changed · story links', `${bad.length}/${checked.length} unreachable: ${bad.map(b => `${b.status} ${b.href.slice(0, 60)}`).join(' | ')}`);
    else PASS('What Changed · story links', `${checked.length} sampled, all reachable${anyBlank ? ', all open in a new tab' : ''}`);
  }
}

// Next puck drop matchup links
{
  await ensureBoard(page, bag);
  const links = (await discover(page)).controls.filter(c => c.region === 'hero' && c.tag === 'a' && /^#\/(cast|matchup)\//.test(c.href));
  if (!links.length) MISSING('Next puck drop · matchup links', 'hero lists no matchup links');
  else {
    const r = await act(page, bag, links[0], { settle: 2600 });
    assertNav(`Next puck drop · matchup link (${links[0].name.slice(0, 24)})`, r, { hashRe: /^#\/(cast|matchup)\/\d{10}/ });
    if (links.length > 1) {
      await ensureBoard(page, bag);
      const again = (await discover(page)).controls.filter(c => c.region === 'hero' && c.tag === 'a' && /^#\/(cast|matchup)\//.test(c.href));
      const last = again[again.length - 1];
      if (!last) MISSING('Next puck drop · matchup link (last)', 'the hero re-rendered without its matchup links');
      else {
        const r2 = await act(page, bag, last, { settle: 2600 });
        assertNav(`Next puck drop · matchup link (${last.name.slice(0, 24)})`, r2, { hashRe: /^#\/(cast|matchup)\/\d{10}/ });
      }
    }
  }
}

// Next Slate button (empty-state CTA)
{
  await ensureBoard(page, bag);
  const c = (await discover(page)).controls.find(x => x.region === 'board' && x.tag === 'button' && /slate/i.test(x.name));
  if (!c) MISSING('Board · Next Slate', 'no next-slate CTA (there may be games today)');
  else {
    bag.reset();
    const before = await boardHeading(page);
    await clickControl(page, c);
    await settle(page);
    const after = await boardHeading(page);
    const hash = (await mountState(page)).hash;
    if (after === before) FAIL('Board · Next Slate', 'board did not move to the next slate — NO REAL ACTION');
    else if (bag.errors.length) FAIL('Board · Next Slate', bag.errors.slice(0, 2).join(' | '));
    else PASS('Board · Next Slate', `${hash || '#/'} · ${after.slice(0, 60)}`);
  }
}

// ── Quick Launch / capability cards ──────────────────────────────────────────
// Two legitimate shapes here, and the gate must tell them apart:
//   * a LINKED card — must click through to a page that really mounts, with no
//     pinned fixture in its href; and
//   * an UNAVAILABLE card — must be a non-anchor carrying aria-disabled, with
//     nothing behind it to land on. That is the correct way to say "no source",
//     so it passes; an unavailable card that is still an <a href>, or a
//     non-anchor with no aria-disabled, is the failure.
{
  await ensureBoard(page, bag);

  // The panel is a disclosure; opening it is itself a control worth checking.
  const detailSummary = (await discover(page)).controls.find(c => c.tag === 'summary' && /capabilit|detail|available/i.test(c.name));
  if (detailSummary) {
    bag.reset();
    // Start from a known-closed state so the click is unambiguously an OPEN.
    const closed = await page.evaluate(n => {
      const d = [...document.querySelectorAll('#main details')].find(x => (x.querySelector('summary')?.innerText || '').trim() === n);
      if (!d) return null;
      d.open = false;
      return { open: d.open, cards: d.querySelectorAll('li').length };
    }, detailSummary.name);
    await page.waitForTimeout(250);
    await clickControl(page, detailSummary);
    await settle(page);
    const after = await page.evaluate(n => {
      const d = [...document.querySelectorAll('#main details')].find(x => (x.querySelector('summary')?.innerText || '').trim() === n);
      return d ? { open: d.open, visible: [...d.querySelectorAll('li')].filter(li => li.checkVisibility?.({ checkVisibilityCSS: true, contentVisibilityAuto: true }) ?? true).length } : null;
    }, detailSummary.name);
    if (!closed || !after) MISSING('Quick Launch · capability detail opens', 'disclosure vanished');
    else if (!after.open) FAIL('Quick Launch · capability detail opens', 'summary click did not open the disclosure — NO REAL ACTION');
    else if (!after.visible) FAIL('Quick Launch · capability detail opens', 'opened but revealed no capability cards');
    else if (bag.errors.length) FAIL('Quick Launch · capability detail opens', bag.errors.slice(0, 2).join(' | '));
    else PASS('Quick Launch · capability detail opens', `closed → open, ${after.visible} capability cards revealed`);
  }
  await openDisclosures(page);

  const cards = (await capabilityCards(page)).filter(c => c.label);
  const EXPECTED = [
    'Historical replay', 'Shot intelligence', 'Line deployment', 'Team & player research',
    'Standings & history', 'Newsroom', 'Market snapshots', 'Source health', 'Live PBE Cast',
    'Confirmed starting goalies', 'Player prop markets', 'Projected starting goalies',
    'Injury status', 'Projected lines & PP units'
  ];
  const match = (list, label) => list.find(c => norm(c.label).startsWith(norm(label)) || norm(c.label).includes(norm(label)));

  if (!cards.length) {
    EXPECTED.forEach(l => MISSING(`Quick Launch · ${l}`, 'no capability panel on the board'));
  } else {
    const handled = new Set();
    const runCard = async (label, card) => {
      const name = `Quick Launch · ${label}`;
      handled.add(norm(card.label));

      if (!card.hasAnchor) {
        if (card.ariaDisabled || card.dataState === 'unavailable') {
          return PASS(name, `correctly unavailable: non-anchor, aria-disabled ("${card.text.slice(0, 70)}")`);
        }
        return FAIL(name, 'card is not a link and is not marked aria-disabled — DEAD UI');
      }

      const fixture = pinnedFixture(card.href);
      await ensureBoard(page, bag);
      await openDisclosures(page);
      const live = match((await capabilityCards(page)).filter(c => c.label), label);
      if (!live?.hasAnchor) return MISSING(name, 'card changed shape between discovery and click');
      const r = await act(page, bag, { path: live.path }, { settle: 2800 });
      const res = assertNav(name, r, { hashRe: /^#\// });
      if (res === 'PASS') {
        if (fixture) {
          results[results.length - 1].status = 'FAIL';
          results[results.length - 1].detail = `navigates, but the destination is a QA fixture: ${card.href} (${fixture})`;
        } else {
          results[results.length - 1].destText = (await page.evaluate(() => (document.querySelector('#main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 200)));
        }
      }
      return res;
    };

    for (const label of EXPECTED) {
      const card = match(cards, label);
      if (!card) { MISSING(`Quick Launch · ${label}`, 'card not present'); continue; }
      await runCard(label, card);
    }
    // Anything the redesign added still has to work.
    for (const card of cards) {
      if (handled.has(norm(card.label))) continue;
      if (!card.label || card.label.length < 3) continue;
      await runCard(card.label.split(' ').slice(0, 5).join(' '), card);
    }
  }
  await ensureBoard(page, bag);
}

// ── Generic sweep: EVERY remaining internal control gets clicked ─────────────
{
  await ensureBoard(page, bag);
  await openDisclosures(page);
  const all = (await discover(page)).controls.filter(c => c.visible);
  const internal = all.filter(c => c.tag === 'a' && /^#/.test(c.href) && c.href !== '#main');
  const seen = new Set();
  let swept = 0, broke = 0;
  for (const c of internal) {
    const key = `${c.region}::${c.href}`;
    if (seen.has(key)) continue;           // one representative per region+target
    seen.add(key);
    await ensureBoard(page, bag);
    const live = (await discover(page)).controls.find(x => x.path === c.path && x.href === c.href);
    if (!live) continue;
    const r = await act(page, bag, live, { settle: 1700 });
    swept += 1;
    if (!r.clicked) { broke += 1; record(`Sweep · ${c.region} → ${c.href}`, 'FAIL', 'not clickable'); continue; }
    if (r.errors.length) { broke += 1; record(`Sweep · ${c.region} → ${c.href}`, 'FAIL', r.errors.slice(0, 2).join(' | ')); continue; }
    if (!isMounted(r.after)) { broke += 1; record(`Sweep · ${c.region} → ${c.href}`, 'FAIL', r.after.notFound ? 'router 404' : 'destination did not mount'); continue; }
  }
  broke === 0
    ? PASS('Sweep · every internal link mounts a real page', `${swept} unique destinations clicked`)
    : record('Sweep · every internal link mounts a real page', 'FAIL', `${broke}/${swept} destinations failed`);
}

// ── NO DEAD UI ───────────────────────────────────────────────────────────────
{
  await ensureBoard(page, bag);
  await openDisclosures(page);
  const { controls, lookalikes } = await discover(page);
  const dead = [];
  for (const l of lookalikes) {
    if (l.ariaDisabled || l.dataState === 'unavailable') continue;
    dead.push(`${l.region} <${l.tag}> "${l.name.slice(0, 50)}" has cursor:pointer but is not a control`);
  }
  // Buttons with no data-* handler hook AND no href are re-verified by clicking.
  for (const c of controls) {
    if (!c.visible || c.tag !== 'button' || c.disabled) continue;
    if (c.dataAttrs.length) continue;           // has a delegated handler hook
    await ensureBoard(page, bag);
    const live = (await discover(page)).controls.find(x => x.path === c.path);
    if (!live) continue;
    const r = await act(page, bag, live, { settle: 900 });
    if (r.clicked && !r.navigated && !r.panelOpened && !r.bodyChanged && !r.scrolled) {
      dead.push(`${c.region} <button> "${c.name.slice(0, 50)}" click produced no navigation, panel or state change`);
    }
  }
  // Disabled things must not be anchors.
  for (const c of controls) {
    if (c.disabled && c.tag === 'a' && c.href) dead.push(`${c.region} "${c.name.slice(0, 40)}" is marked disabled but is still an <a href="${c.href}">`);
  }
  dead.length ? record('NO DEAD UI', 'FAIL', dead.slice(0, 8).join(' ;; ')) : PASS('NO DEAD UI', 'every clickable-looking element acts or is explicitly disabled');
}

// ── NO HARD-CODED QA FIXTURES ────────────────────────────────────────────────
{
  await ensureBoard(page, bag);
  await openDisclosures(page);
  const { controls } = await discover(page);
  const runtime = [];
  for (const c of controls) {
    if (!c.href) continue;
    const why = pinnedFixture(c.href);
    if (why) runtime.push(`${c.region} "${c.name.split('\n')[0].slice(0, 40)}" → ${c.href} (${why})`);
  }

  // Source-level scan: a literal fixture in src/** is the real defect, even if
  // the control happens not to be rendered right now. Only meaningful when the
  // target is this working tree's own build — a remote base is a different SHA.
  const LOCAL = /127\.0\.0\.1|localhost/.test(BASE);
  const srcHits = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!/\.(js|mjs|ts|html)$/.test(entry.name)) continue;
      const text = fs.readFileSync(p, 'utf8');
      const re = /['"`](#?\/[^'"`\s]*?(?:(?:19|20)\d{8}|[?&]date=\d{4}-\d{2}-\d{2})[^'"`\s]*)['"`]/g;
      let m;
      while ((m = re.exec(text))) {
        if (pinnedFixture(m[1])) srcHits.push(`${path.relative(REPO, p)}: ${m[1]}`);
      }
    }
  };
  if (LOCAL) { try { walk(path.join(REPO, 'src')); } catch { /* no src tree here */ } }

  const all = [...runtime, ...srcHits.map(h => `src literal → ${h}`)];
  all.length
    ? record('NO HARD-CODED QA FIXTURES', 'FAIL', all.slice(0, 8).join(' ;; '))
    : PASS('NO HARD-CODED QA FIXTURES', 'no pinned historical game id or date in product navigation');
}

// ── Responsive sweep ─────────────────────────────────────────────────────────
if (!QUICK) {
  for (const width of WIDTHS) {
    const rc = await browser.newContext({ viewport: { width, height: width <= 430 ? 844 : 1000 }, deviceScaleFactor: 1, isMobile: width <= 430, hasTouch: width <= 430 });
    const rb = await makePage(rc, { relay: RELAY });
    try {
      await gotoHash(rb.page, BASE, '/', { settle: 5000 });
      await rb.page.evaluate(async () => {
        for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 1600));
        window.scrollTo(0, 0);
      });
      await settle(rb.page);
      const m = await viewportMetrics(rb.page);
      const shot = path.resolve(REPO, OUT_DIR, `${LABEL}-board-${width}.png`);
      await rb.page.screenshot({ path: shot, fullPage: false });

      const problems = [];
      if (m.overflow !== 0) problems.push(`horizontal overflow ${m.overflow}px`);
      if (rb.errors.length) problems.push(`errors: ${rb.errors.slice(0, 2).join(' | ')}`);
      if (m.broken.length) problems.push(`broken images: ${m.broken.slice(0, 2).join(', ')}`);
      if (m.offscreen.length) problems.push(`unreachable controls: ${m.offscreen.slice(0, 3).join('; ')}`);

      // Mobile widths must still expose primary navigation somewhere reachable.
      if (width <= 430) {
        const navReach = await rb.page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          return [...document.querySelectorAll('a[href], button')].filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.left >= -2 && r.right <= vw + 2;
          }).length;
        });
        if (navReach < 4) problems.push(`only ${navReach} reachable controls at ${width}px`);
      }

      problems.length
        ? record(`Responsive · ${width}px`, 'FAIL', problems.join(' ;; '), { shot })
        : PASS(`Responsive · ${width}px`, `overflow 0 · ${m.imgs} images all loaded · 0 errors`, { shot });
    } catch (e) {
      record(`Responsive · ${width}px`, 'FAIL', `harness error: ${String(e.message).slice(0, 160)}`);
    } finally {
      await rc.close();
    }
  }

  // Mobile bottom nav + sheet, which only exist below the desktop breakpoint.
  const mc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mb = await makePage(mc, { relay: RELAY });
  try {
    await gotoHash(mb.page, BASE, '/', { settle: 5000 });
    const mInv = await discover(mb.page);
    const bottom = mInv.controls.filter(c => c.region === 'bottomnav' && c.visible);
    if (!bottom.length) MISSING('Mobile · bottom navigation', 'no bottom nav at 390px');
    else {
      let ok = 0;
      for (const b of bottom.filter(c => c.tag === 'a')) {
        mb.reset();
        const before = await mountState(mb.page);
        // A tab pointing at the route we are already on cannot change the hash;
        // it passes by staying mounted and marked current.
        const sameRoute = (b.href || '').replace(/^#/, '') === (before.hash || '#/').replace(/^#/, '');
        await clickControl(mb.page, b);
        await settle(mb.page);
        await waitForMount(mb.page, { settle: 1200 });
        const after = await mountState(mb.page);
        const moved = sameRoute ? after.hash === before.hash : after.hash !== before.hash;
        if (moved && isMounted(after) && !mb.errors.length) ok += 1;
        else record(`Mobile · bottom nav "${b.name}"`, 'FAIL', `${before.hash} → ${after.hash} · mounted ${isMounted(after)} · errors ${mb.errors.length}`);
        await mb.page.evaluate(() => { location.hash = '/'; });
        await waitForMount(mb.page, { settle: 900 });
      }
      PASS('Mobile · bottom navigation', `${ok}/${bottom.filter(c => c.tag === 'a').length} destinations mounted`);
    }

    const sheetBtn = mInv.controls.find(c => c.region === 'bottomnav' && c.tag === 'button');
    if (!sheetBtn) MISSING('Mobile · More sheet');
    else {
      mb.reset();
      await clickControl(mb.page, sheetBtn);
      await settle(mb.page);
      const items = (await discover(mb.page)).controls.filter(c => c.region === 'sheet' && c.visible && c.tag === 'a' && /^#/.test(c.href));
      if (!items.length) FAIL('Mobile · More sheet', 'sheet opened no navigable items — NO REAL ACTION');
      else {
        const before = await mountState(mb.page);
        // Choose an item that is not the route we are already on, so "did it
        // navigate?" is a real question.
        const here = (before.hash || '#/').replace(/^#/, '') || '/';
        const target = items.find(i => (i.href || '').replace(/^#/, '') !== here) || items[0];
        await clickControl(mb.page, target);
        await settle(mb.page);
        await waitForMount(mb.page, { settle: 1200 });
        const after = await mountState(mb.page);
        const sheetClosed = await mb.page.evaluate(() => {
          const s = document.querySelector('.sheet, #nav-sheet');
          if (!s) return true;
          const r = s.getBoundingClientRect();
          return s.hidden || r.width === 0;
        });
        if (after.hash !== before.hash && isMounted(after) && sheetClosed && !mb.errors.length) PASS('Mobile · More sheet', `${items.length} items · first navigates to ${after.hash} and the sheet closes`);
        else FAIL('Mobile · More sheet', `${before.hash} → ${after.hash} · mounted ${isMounted(after)} · sheetClosed ${sheetClosed} · errors ${mb.errors.length}`);
      }
    }
  } catch (e) {
    record('Mobile · bottom navigation', 'FAIL', `harness error: ${String(e.message).slice(0, 160)}`);
  } finally {
    await mc.close();
  }
}

await browser.close();

// ── the harness's own health ────────────────────────────────────────────────
// The localhost relay is scaffolding, not product. Say plainly whether it held
// up, so a dropped connection inside it is never read as a broken control.
{
  const unreachable = relayLedger.filter(l => l.startsWith('UNREACHABLE'));
  const recovered = relayLedger.filter(l => l.startsWith('recovered'));
  if (unreachable.length) FAIL('Harness · gateway relay', `${unreachable.length} call(s) never reached the gateway: ${unreachable.slice(0, 2).join(' | ')}`);
  else if (recovered.length) PASS('Harness · gateway relay', `${recovered.length} transient failure(s), all recovered on retry`);
  else PASS('Harness · gateway relay', 'every relayed call succeeded first time');
}

// ── report ───────────────────────────────────────────────────────────────────
const totals = report();

const bad = (totals.FAIL || 0) + (totals.MISSING || 0);
if (bad) {
  console.error(`\n${bad} control(s) FAIL or MISSING.`);
  process.exit(1);
}
