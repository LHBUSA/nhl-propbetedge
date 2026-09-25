// Chrome + destinations acceptance. THIS build, served locally, against the
// REAL production gateway. Every gateway request is relayed Node-side with the
// product Origin (same technique as tests/e2e/live-acceptance.mjs) because the
// gateway enforces product-origin CORS.
//
// It clicks. Nothing is asserted from source: NHL Pro, the search palette, the
// More menu, the alert bell, the Shot Lab landing and the replay entry are all
// driven through real user gestures and checked for a hash change, a mounted
// destination and zero console errors.
//
//   npm run build && npm run preview -- --port 4173 --host 127.0.0.1
//   node tests/e2e/chrome-destinations.mjs

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.NHL_BROWSER_BASE || 'http://127.0.0.1:4173';
const outDir = process.env.NHL_BROWSER_OUT || 'artifacts/chrome-destinations';
const GATEWAY = 'https://nhl-api.propbetedge.ai';
const PRODUCT_ORIGIN = 'https://nhl.propbetedge.ai';
const EXEC = process.env.PW_CHROME || 'C:/Users/goodl/AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe';
const WIDTHS = [1440, 1024, 768, 390, 360];
const FIXTURE_IDS = ['2025020500', '2026-04-16'];

fs.mkdirSync(outDir, { recursive: true });

const failures = [];
const notes = [];
function check(label, ok, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else { console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); failures.push(`${label}${detail ? ` — ${detail}` : ''}`); }
  return ok;
}
const note = text => { notes.push(text); console.log(`  ·    ${text}`); };

const browser = await chromium.launch({ headless: true, executablePath: EXEC });

async function relay(page, { readiness = null, session = null } = {}) {
  await page.route('https://propbet-news-api.sales-fd3.workers.dev/**', async route => {
    try {
      const upstream = await fetch(route.request().url(), { headers: { Accept: 'application/json', Origin: PRODUCT_ORIGIN, Referer: `${PRODUCT_ORIGIN}/` } });
      return route.fulfill({ status: upstream.status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: await upstream.text() });
    } catch { return route.abort(); }
  });
  // Credentialed reads (account.js -> /auth/*) cannot use a wildcard origin, so
  // the relay echoes the page origin and allows credentials for everything.
  const cors = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' };
  await page.route(`${GATEWAY}/**`, async route => {
    const url = route.request().url();
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Headers': 'content-type,accept', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
    }
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (readiness && url.includes('/readiness')) return json(readiness);
    if (session && url.includes('/auth/session')) return json(session);
    try {
      const upstream = await fetch(url, { headers: { Accept: 'application/json', Origin: PRODUCT_ORIGIN, Referer: `${PRODUCT_ORIGIN}/` } });
      const body = await upstream.text();
      const sem = upstream.headers.get('X-NHL-Semantics');
      return route.fulfill({
        status: upstream.status,
        contentType: upstream.headers.get('content-type') || 'application/json',
        headers: { ...cors, 'Access-Control-Expose-Headers': 'X-NHL-Semantics', ...(sem ? { 'X-NHL-Semantics': sem } : {}) },
        body
      });
    } catch { return route.abort(); }
  });
}

async function open(width, hash = '/', opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width <= 400 ? 844 : 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
  const badResponses = [];
  page.on('response', r => { if (r.status() >= 400 && !r.url().startsWith(base)) badResponses.push(`${r.status()} ${r.url().slice(0, 160)}`); });
  await relay(page, opts);
  await page.goto(`${base}/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#topbar', { timeout: 20000 });
  return { ctx, page, errors, badResponses };
}

const hash = page => page.evaluate(() => location.hash);
const mounted = page => page.evaluate(() => {
  const main = document.querySelector('#main');
  const text = (main?.textContent || '').trim();
  return {
    hasSection: Boolean(main?.querySelector('section, .pbe-empty')),
    is404: /That page does not exist/.test(text),
    chars: text.length,
    heading: main?.querySelector('h1, h2, h3')?.textContent?.trim().slice(0, 80) || ''
  };
});
const settle = (page, ms = 2500) => page.waitForTimeout(ms);

// ------------------------------------------------------------ destinations

console.log('\n== #/shots landing (no game id) ==');
let landedShotGame = null;
{
  const { ctx, page, errors } = await open(1440, '/shots');
  await page.waitForFunction(() => /^#\/shots\/\d{10}$/.test(location.hash) || document.querySelector('.lab-rink-empty__msg'), null, { timeout: 45000 }).catch(() => {});
  await settle(page, 6000);
  const h = await hash(page);
  check('#/shots resolves away from the bare landing route', /^#\/shots\/\d{10}$/.test(h), h);
  landedShotGame = (h.match(/\d{10}/) || [])[0] || null;
  check('#/shots did not land on a QA fixture id', !FIXTURE_IDS.some(f => h.includes(f)), h);
  const info = await page.evaluate(() => ({
    head: document.querySelector('.lab-head__sub .micro')?.textContent?.trim() || '',
    away: document.querySelector('.lab-head__team--away .lab-head__id b')?.textContent || '',
    home: document.querySelector('.lab-head__team--home .lab-head__id b')?.textContent || '',
    state: document.querySelector('.lab-head__mid .pbe-badge')?.textContent || '',
    when: document.querySelector('.lab-head__when')?.textContent || '',
    plotted: document.querySelector('.lab-rink .panel-head .micro')?.textContent || '',
    marks: document.querySelectorAll('.lab-rink__ice .mk-g').length,
    note: document.querySelector('.lab-pickbar__note')?.textContent?.trim() || '',
    rows: document.querySelectorAll('tr[data-shot]').length
  }));
  note(`landed on ${landedShotGame}: ${info.away} @ ${info.home} · ${info.state} · ${info.when}`);
  note(`context: ${info.head}`);
  note(`landing note: ${info.note || '(none)'}`);
  check('landed game is completed', /FINAL/.test(info.state), info.state);
  check('landed game actually has plotted shot coordinates', info.marks > 0, `${info.marks} marks · ${info.plotted}`);
  check('shot table rendered real attempts', info.rows > 0, String(info.rows));
  check('no console errors on the Shot Lab landing', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: path.join(outDir, 'shots-landing-1440.png') });
  // The picker must let the user leave the resolved slate.
  const jump = await page.locator('[data-pick-date]').count();
  check('Shot Lab offers a real jump target (today / next slate)', jump > 0, String(jump));
  if (jump) {
    await page.locator('[data-pick-date]').last().click();
    await settle(page, 3000);
    const label = await page.locator('.lab-pickbar__label').textContent();
    check('jump target loads a real slate', Boolean(label && label.trim().length), String(label));
    note(`jump loaded: ${String(label).trim()}`);
  }
  await ctx.close();
}

console.log('\n== #/shots with an explicit date ==');
{
  const { ctx, page, errors } = await open(1440, '/shots?date=2026-06-14');
  await settle(page, 5000);
  const state = await page.evaluate(() => ({
    hash: location.hash,
    picks: [...document.querySelectorAll('.lab-pick')].map(a => a.textContent.replace(/\s+/g, ' ').trim()),
    label: document.querySelector('.lab-pickbar__label')?.textContent?.trim() || ''
  }));
  check('an explicit date is honoured and never redirected', state.hash === '#/shots?date=2026-06-14', state.hash);
  check('the explicit slate lists its real games', state.picks.length > 0, state.picks.join(' | '));
  note(`explicit slate: ${state.label} → ${state.picks.join(' | ')}`);
  check('no console errors on the dated Shot Lab', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

console.log('\n== replay entry #/cast?view=all ==');
{
  const { ctx, page, errors } = await open(1440, '/cast?view=all');
  await page.waitForSelector('.ctile, .pbe-empty', { timeout: 45000 });
  await settle(page, 6000);
  const info = await page.evaluate(() => ({
    hash: location.hash,
    title: document.querySelector('#cc-title')?.textContent?.trim() || '',
    note: document.querySelector('#cc-note')?.textContent?.trim() || '',
    tiles: [...document.querySelectorAll('.ctile')].map(t => t.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)),
    links: [...document.querySelectorAll('.ctile__body')].map(a => a.getAttribute('href'))
  }));
  note(`command center: ${info.title} — ${info.note || '(no note)'}`);
  info.tiles.forEach(t => note(`  tile: ${t}`));
  check('replay entry opens a real slate, not a fixed date', !FIXTURE_IDS.some(f => info.hash.includes(f)), info.hash);
  check('replay entry lists real completed games', info.tiles.length > 0 && info.tiles.some(t => /FINAL/.test(t)), info.tiles.join(' | '));
  check('every tile deep-links to a real game id', info.links.length > 0 && info.links.every(h => /^#\/cast\/\d{10}$/.test(h)), info.links.join(','));
  await page.screenshot({ path: path.join(outDir, 'replay-entry-1440.png') });
  // Opening one must reach the broadcast.
  await page.locator('.ctile__body').first().click();
  await page.waitForFunction(() => /^#\/cast\/\d{10}$/.test(location.hash), null, { timeout: 15000 });
  await settle(page, 6000);
  const m = await mounted(page);
  check('choosing a completed game opens PBE Cast', !m.is404 && m.chars > 400, `${await hash(page)} · ${m.chars} chars`);
  check('no console errors on the replay entry', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

console.log('\n== deep links still behave exactly as before ==');
if (landedShotGame) {
  const { ctx, page, errors } = await open(1440, `/cast/${landedShotGame}?t=40`);
  await settle(page, 8000);
  const info = await page.evaluate(() => ({
    hash: location.hash,
    replayBar: Boolean(document.querySelector('.replay-bar, [data-cursor], .cast-replaybar')),
    heading: document.querySelector('#main h2')?.textContent?.trim() || '',
    chars: (document.querySelector('#main')?.textContent || '').length
  }));
  check('#/cast/<id>?t= deep link is untouched', info.hash === `#/cast/${landedShotGame}?t=40`, info.hash);
  check('deep-linked cast mounts', info.chars > 600, String(info.chars));
  check('no console errors on the cast deep link', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------ NHL Pro

console.log('\n== NHL Pro per account state ==');
const PROD_READINESS_AUTH = { store: true, throttle_key: true, entitlement: true, email: false };
const FULL_AUTH = { store: true, throttle_key: true, entitlement: true, email: true };
const readinessWith = auth => ({ ok: true, schema: 'nhl-gateway-v1', semantics: 'CURRENT', data_layer: 'v2', backend: 'test', backend_status: 200, credential: 'attached', newsroom: 'internal', odds: 'configured', picks: 'configured', auth, checked_at: new Date().toISOString() });

{
  // 1. This environment as it really is today: auth.email is not configured.
  const { ctx, page, errors } = await open(1440, '/');
  await settle(page, 6000);
  const live = await page.evaluate(() => {
    const b = document.querySelector('[data-open-nhl-pro]');
    return { exists: Boolean(b), hidden: b ? b.hidden || getComputedStyle(b).display === 'none' : null, count: document.querySelectorAll('[data-open-nhl-pro]').length };
  });
  check('auth-unavailable: no dead NHL Pro button is rendered', !live.exists || live.hidden === true, JSON.stringify(live));
  check('auth-unavailable: exactly one Pro control exists at most', live.count <= 1, String(live.count));
  note(`production readiness today reports auth.email=false → NHL Pro control ${live.exists && !live.hidden ? 'VISIBLE' : 'absent'}`);
  check('no console errors with Pro unconfigured', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
{
  // 2. Auth configured, signed out.
  const { ctx, page, errors } = await open(1440, '/', { readiness: readinessWith(FULL_AUTH), session: { state: 'signed_out' } });
  await page.waitForSelector('[data-open-nhl-pro]:not([hidden])', { timeout: 20000 });
  const before = await page.evaluate(() => ({ account: document.querySelector('[data-open-nhl-pro]').dataset.account, label: document.querySelector('[data-open-nhl-pro]').getAttribute('aria-label'), count: document.querySelectorAll('[data-open-nhl-pro]').length }));
  check('signed out: one NHL Pro button, labelled for sign-in', before.count === 1 && /sign in/i.test(before.label || ''), JSON.stringify(before));
  await page.locator('[data-open-nhl-pro]').click();
  await settle(page, 800);
  const opened = await page.evaluate(() => {
    const m = document.querySelector('#nhl-pro-modal');
    return { open: Boolean(m && !m.hidden), signin: Boolean(m?.querySelector('#nhl-pro-signin') && !m.querySelector('#nhl-pro-signin').hidden), account: Boolean(m?.querySelector('#nhl-pro-account') && !m.querySelector('#nhl-pro-account').hidden) };
  });
  check('signed out: clicking NHL Pro opens the sign-in / upgrade surface', opened.open && opened.signin, JSON.stringify(opened));
  await page.screenshot({ path: path.join(outDir, 'nhlpro-signed-out-1440.png') });
  await page.keyboard.press('Escape');
  await settle(page, 500);
  check('signed out: Escape closes the Pro surface', await page.evaluate(() => document.querySelector('#nhl-pro-modal').hidden));
  check('no console errors in the signed-out Pro flow', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
{
  // 3. Auth configured, entitled.
  const session = { state: 'pro', email: 'pro@example.com', subscription: { plan: 'monthly', current_period_end: '2026-10-18T00:00:00Z', cancel_at_period_end: false } };
  const { ctx, page, errors } = await open(1440, '/', { readiness: readinessWith(FULL_AUTH), session });
  await page.waitForSelector('[data-open-nhl-pro][data-account="pro"]', { timeout: 20000 });
  const label = await page.locator('[data-open-nhl-pro]').getAttribute('aria-label');
  check('pro: the button switches to account context', /account/i.test(label || ''), String(label));
  await page.locator('[data-open-nhl-pro]').click();
  await settle(page, 800);
  const panel = await page.evaluate(() => {
    const p = document.querySelector('#nhl-pro-account');
    return { open: Boolean(document.querySelector('#nhl-pro-modal') && !document.querySelector('#nhl-pro-modal').hidden), visible: Boolean(p && !p.hidden), email: document.querySelector('#nhl-pro-account-email')?.textContent || '', plan: document.querySelector('#nhl-pro-account-plan')?.textContent || '', signout: Boolean(document.querySelector('[data-pro-signout]')) };
  });
  check('pro: clicking NHL Pro opens the account/subscription panel', panel.open && panel.visible && panel.signout, JSON.stringify(panel));
  note(`pro panel: ${panel.email} · ${panel.plan}`);
  await page.screenshot({ path: path.join(outDir, 'nhlpro-pro-1440.png') });
  check('no console errors in the pro flow', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
note(`production auth readiness used for the live check: ${JSON.stringify(PROD_READINESS_AUTH)}`);

// ------------------------------------------------------------ chrome per width

for (const width of WIDTHS) {
  const desktopNav = width > 768;
  console.log(`\n== chrome @ ${width} ==`);
  const { ctx, page, errors, badResponses } = await open(width, '/');
  await settle(page, 5000);

  // Topbar hierarchy + no overflow.
  const bar = await page.evaluate(() => {
    const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: Math.round(r.x), w: Math.round(r.width) } : null; };
    const chip = document.querySelector('#season-chip');
    return {
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      brand: box(document.querySelector('.brand')),
      nav: box(document.querySelector('.mainnav')),
      pro: box(document.querySelector('[data-open-nhl-pro]')),
      chip: box(chip),
      chipText: chip?.textContent?.trim() || '',
      chipTone: chip?.dataset.tone || '',
      chipColor: chip ? getComputedStyle(chip).color : '',
      navActiveColor: getComputedStyle(document.querySelector('.mainnav a.is-active') || document.body).color,
      bell: box(document.querySelector('[data-alerts]')),
      search: box(document.querySelector('[data-open-search]')),
      navItems: [...document.querySelectorAll('.mainnav > a')].map(a => a.textContent.trim()),
      bottomItems: [...document.querySelectorAll('.bottomnav a')].map(a => a.textContent.trim())
    };
  });
  check(`@${width}: no horizontal overflow`, bar.overflow === 0, `${bar.overflow}px`);
  if (desktopNav) {
    check(`@${width}: nav membership preserved`, bar.navItems.join('|') === 'Ice Board|PBE Picks|PBE Cast|Props|WinHL', bar.navItems.join('|'));
    const order = [bar.brand, bar.nav, bar.chip, bar.bell, bar.search].filter(Boolean).map(b => b.x);
    check(`@${width}: brand → nav → tools left-to-right`, order.every((x, i) => i === 0 || x >= order[i - 1]), order.join(','));
  } else {
    check(`@${width}: mobile bottom nav membership preserved`, bar.bottomItems.join('|') === 'Board|PBE Picks|Cast|Props|All Access', bar.bottomItems.join('|'));
  }
  if (bar.chip) {
    check(`@${width}: season chip does not borrow the nav's active colour`, bar.chipColor !== bar.navActiveColor, `${bar.chipColor} vs ${bar.navActiveColor}`);
    note(`@${width}: season chip reads "${bar.chipText}" (tone=${bar.chipTone || 'none'})`);
  } else {
    note(`@${width}: season chip lives in the More panel header (desktop) and the mobile sheet, never the topbar`);
  }
  await page.screenshot({ path: path.join(outDir, `chrome-${width}.png`) });
  await page.locator('#topbar').screenshot({ path: path.join(outDir, `topbar-${width}.png`) });

  // ---- search: click opens
  const searchBtn = desktopNav ? page.locator('.topbar__tools [data-open-search]') : page.locator('.topbar__tools [data-open-search]');
  await searchBtn.click();
  await settle(page, 400);
  check(`@${width}: clicking search opens the palette`, await page.evaluate(() => !document.querySelector('#palette').hidden));
  await page.keyboard.press('Escape');
  await settle(page, 300);
  check(`@${width}: Escape closes the palette`, await page.evaluate(() => document.querySelector('#palette').hidden));
  // ---- search: Ctrl-K opens
  await page.keyboard.press('Control+k');
  await settle(page, 400);
  check(`@${width}: Ctrl-K opens the palette`, await page.evaluate(() => !document.querySelector('#palette').hidden));
  if (width === 1440) await page.screenshot({ path: path.join(outDir, 'search-open-1440.png') });
  // ---- typing a team navigates
  await page.locator('#palette-input').fill('Oilers');
  await settle(page, 400);
  const teamHref = await page.evaluate(() => document.querySelector('#palette-results a')?.getAttribute('href') || '');
  check(`@${width}: typing a team surfaces a real team result`, /^#\/team\/[A-Z]{2,4}$/.test(teamHref), teamHref);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /^#\/team\//.test(location.hash), null, { timeout: 10000 });
  await settle(page, 3500);
  let m = await mounted(page);
  check(`@${width}: Enter selects the highlighted result and the team page mounts`, !m.is404 && m.chars > 200, `${await hash(page)} · ${m.chars}`);
  check(`@${width}: the palette closed after navigating`, await page.evaluate(() => document.querySelector('#palette').hidden));
  // ---- a page result navigates by click
  await page.keyboard.press('Control+k');
  await settle(page, 300);
  await page.locator('#palette-input').fill('Standings');
  await settle(page, 300);
  await page.locator('#palette-results a').first().click();
  await page.waitForFunction(() => location.hash.startsWith('#/standings'), null, { timeout: 10000 });
  await settle(page, 4000);
  m = await mounted(page);
  check(`@${width}: a page result navigates and mounts`, !m.is404 && m.chars > 200, `${await hash(page)} · ${m.chars}`);
  // ---- a game result navigates
  await page.keyboard.press('Control+k');
  await settle(page, 300);
  await page.locator('#palette-input').fill('2025030416');
  await settle(page, 300);
  const gameHref = await page.evaluate(() => document.querySelector('#palette-results a')?.getAttribute('href') || '');
  check(`@${width}: a 10-digit game id resolves to a cast deep link`, /^#\/cast\/\d{10}$/.test(gameHref), gameHref);
  await page.locator('#palette-results a').first().click();
  await page.waitForFunction(() => /^#\/cast\/\d{10}/.test(location.hash), null, { timeout: 10000 });
  await settle(page, 4000);
  m = await mounted(page);
  check(`@${width}: a game result navigates and PBE Cast mounts`, !m.is404 && m.chars > 400, `${await hash(page)} · ${m.chars}`);

  // ---- alert bell
  await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2500);
  await page.locator('[data-alerts]').click();
  await settle(page, 300);
  check(`@${width}: the bell opens its panel`, await page.evaluate(() => !document.querySelector('#alert-center').hidden));
  check(`@${width}: the bell reports expanded state`, await page.evaluate(() => document.querySelector('[data-alerts]').getAttribute('aria-expanded') === 'true'));
  if (width === 1440) await page.screenshot({ path: path.join(outDir, 'alerts-open-1440.png') });
  await page.locator('[data-close-alerts]').click();
  await settle(page, 300);
  check(`@${width}: Close closes the alert panel`, await page.evaluate(() => document.querySelector('#alert-center').hidden));
  await page.locator('[data-alerts]').click();
  await settle(page, 300);
  await page.mouse.click(3, 420);
  await settle(page, 300);
  check(`@${width}: an outside click closes the alert panel`, await page.evaluate(() => document.querySelector('#alert-center').hidden));

  // ---- More
  if (desktopNav) {
    await page.locator('[data-more]').click();
    await settle(page, 300);
    check(`@${width}: More opens`, await page.evaluate(() => !document.querySelector('#more-menu').hidden));
    check(`@${width}: More moves focus into the menu`, await page.evaluate(() => document.activeElement?.closest('#more-menu') !== null));
    await page.keyboard.press('ArrowDown');
    check(`@${width}: ArrowDown walks the menu`, await page.evaluate(() => document.activeElement?.querySelector('span')?.textContent?.trim()) === 'News');
    check(`@${width}: More panel shows everything without an inner scrollbar`, await page.evaluate(() => { const m = document.querySelector('#more-menu'); const r = m.getBoundingClientRect(); return m.scrollHeight <= m.clientHeight && m.scrollWidth <= m.clientWidth && r.left >= 0 && r.right <= document.documentElement.clientWidth && r.bottom <= innerHeight; }));
    await page.keyboard.press('Escape');
    await settle(page, 300);
    check(`@${width}: Escape closes More and restores focus to the button`, await page.evaluate(() => document.querySelector('#more-menu').hidden && document.activeElement?.hasAttribute('data-more')));
    await page.locator('[data-more]').click();
    await settle(page, 300);
    await page.mouse.click(3, 420);
    await settle(page, 400);
    check(`@${width}: an outside click closes More`, await page.evaluate(() => document.querySelector('#more-menu').hidden));
    if (width === 1440) {
      await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
      await settle(page, 2000);
      await page.locator('[data-more]').click();
      await settle(page, 300);
      await page.screenshot({ path: path.join(outDir, 'more-open-1440.png') });
      await page.keyboard.press('Escape');
    }
    // every VISIBLE item navigates to a page that mounts. Header items that
    // collapse at this width (WinHL <1280, Props <1024) join their section.
    await page.locator('[data-more]').click();
    await settle(page, 250);
    const items = await page.evaluate(() => [...document.querySelectorAll('#more-menu a[role="menuitem"]')].filter(a => a.offsetParent !== null).map(a => ({ label: a.querySelector('span').textContent.trim(), href: a.getAttribute('href') })));
    await page.keyboard.press('Escape');
    const expected = ['Standings', 'News', ...(width < 1024 ? ['Props'] : []), 'Shot Lab', 'Matchups', ...(width < 1280 ? ['WinHL'] : []), 'Goalies', 'Fatigue', 'Fights', 'Lines', 'Injuries', 'Players', 'Teams', 'Track Record', 'Methodology'];
    check(`@${width}: More carries the full secondary set`, items.map(i => i.label).join('|') === expected.join('|'), items.map(i => i.label).join('|'));
    for (const item of items) {
      await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
      await settle(page, 1800);
      await page.locator('[data-more]').click();
      await settle(page, 250);
      await page.locator(`#more-menu a[href="${item.href}"]`).click();
      await page.waitForFunction(h => location.hash === h, item.href, { timeout: 10000 }).catch(() => {});
      await settle(page, 3000);
      const r = await mounted(page);
      const closed = await page.evaluate(() => document.querySelector('#more-menu').hidden);
      const got = await hash(page);
      check(`@${width}: More → ${item.label} navigates and mounts`, got.split('?')[0] === item.href && !r.is404 && r.chars > 150, `${got} · 404=${r.is404} · ${r.chars} chars`);
      check(`@${width}: More closed after navigating to ${item.label}`, closed);
    }
  } else {
    await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
    await settle(page, 2500);
    await page.locator('[data-sheet]').click();
    await settle(page, 400);
    check(`@${width}: the mobile More sheet opens`, await page.evaluate(() => !document.querySelector('#nav-sheet').hidden));
    const season = await page.evaluate(() => { const s = document.querySelector('#sheet-season'); return { hidden: s?.hidden, text: s?.textContent?.trim() || '' }; });
    note(`@${width}: sheet season state → ${season.hidden ? '(hidden)' : season.text}`);
    if (width === 390) await page.screenshot({ path: path.join(outDir, 'sheet-open-390.png') });
    const sheetItems = await page.evaluate(() => [...document.querySelectorAll('.sheet__grid a')].map(a => ({ label: a.textContent.trim(), href: a.getAttribute('href') })));
    check(`@${width}: the sheet carries every section`, sheetItems.length === 18, String(sheetItems.length)); // 5 header items + 13 in More (IA 2026-09-25)
    await page.keyboard.press('Escape');
    await settle(page, 300);
    check(`@${width}: Escape closes the sheet`, await page.evaluate(() => document.querySelector('#nav-sheet').hidden));
    await page.locator('[data-sheet]').click();
    await settle(page, 300);
    await page.locator('.sheet__scrim').click({ position: { x: 5, y: 5 } });
    await settle(page, 300);
    check(`@${width}: the scrim closes the sheet`, await page.evaluate(() => document.querySelector('#nav-sheet').hidden));
    for (const item of sheetItems.filter(i => !['#/', '#/pbe-picks', '#/cast', '#/props', '#/shots'].includes(i.href))) {
      await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
      await settle(page, 1500);
      await page.locator('[data-sheet]').click();
      await settle(page, 250);
      await page.locator(`.sheet__grid a[href="${item.href}"]`).click();
      await settle(page, 2800);
      const r = await mounted(page);
      const got = await hash(page);
      check(`@${width}: sheet → ${item.label} navigates and mounts`, got.split('?')[0] === item.href && !r.is404 && r.chars > 150, `${got} · ${r.chars}`);
      check(`@${width}: the sheet closed after navigating to ${item.label}`, await page.evaluate(() => document.querySelector('#nav-sheet').hidden));
    }
  }

  check(`@${width}: zero console errors across the whole chrome pass`, errors.length === 0, errors.slice(0, 4).join(' | '));
  if (badResponses.length) note(`@${width}: non-2xx sub-resources — ${[...new Set(badResponses)].slice(0, 6).join(' | ')}`);
  await ctx.close();
}

await browser.close();

console.log('\n' + '='.repeat(70));
console.log(`screenshots: ${outDir}`);
console.log(`notes:\n${notes.map(n => '  - ' + n).join('\n')}`);
if (failures.length) {
  console.error(`\nFAILURES (${failures.length}):\n` + failures.map(f => ' - ' + f).join('\n'));
  process.exit(1);
}
console.log('\nchrome + destinations: ALL CHECKS PASS');
