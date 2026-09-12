// Live acceptance: THIS build, served locally, against the REAL production
// gateway and the REAL deployed image proxy. Nothing is stubbed.
//
// The gateway enforces product-origin CORS, so a localhost build cannot call it
// from the browser. Every gateway request is therefore relayed Node-side (no
// CORS there) with the product Origin, and the genuine response — body, status
// and X-NHL-Semantics — is handed back to the page. Images are NOT intercepted:
// they go to propbet-img-proxy.sales-fd3.workers.dev exactly as in production.
//
//   node tests/e2e/live-acceptance.mjs
// Requires a static preview on NHL_BROWSER_BASE (default http://127.0.0.1:4173).

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.NHL_BROWSER_BASE || 'http://127.0.0.1:4173';
const outDir = process.env.NHL_BROWSER_OUT || 'artifacts/live-acceptance';
const GATEWAY = 'https://nhl-api.propbetedge.ai';
const PRODUCT_ORIGIN = 'https://nhl.propbetedge.ai';
fs.mkdirSync(outDir, { recursive: true });

const ROUTES = [
  { id: 'home', hash: '/', shot: true },
  { id: 'player-mcdavid', hash: '/player/8478402', shot: true },
  { id: 'team-edm', hash: '/team/EDM', shot: true },
  { id: 'players', hash: '/players', shot: true },
  { id: 'goalies', hash: '/goalies' },
  { id: 'matchup', hash: '/matchup/2025021311', shot: true },
  { id: 'lines', hash: '/lines' },
  { id: 'injuries', hash: '/injuries' },
  { id: 'news', hash: '/news' },
  { id: 'cast', hash: '/cast/2025021311' },
  { id: 'props', hash: '/props' },
  { id: 'shots', hash: '/shots' },
  { id: 'standings', hash: '/standings' },
  { id: 'track', hash: '/track-record' },
  { id: 'methodology', hash: '/methodology' }
];
const WIDTHS = [1440, 390];

const failures = [];
const rows = [];
function check(label, ok, detail = '') {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    const page = await ctx.newPage();
    const errors = [];
    const badImg = [];
    const gatewayCalls = [];
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
    page.on('response', r => {
      const u = r.url();
      if (/propbet-img-proxy|assets\.nhle\.com/.test(u) && r.status() !== 200) badImg.push(`${r.status()} ${u.slice(0, 120)}`);
    });

    // The PBE News API applies the same product-origin check as the gateway, so
    // the editorial layer is relayed the same way. Production serves it 200 (see
    // the production audit in docs/NHL_BUILD_STATUS.md).
    await page.route('https://propbet-news-api.sales-fd3.workers.dev/**', async route => {
      const url = route.request().url();
      try {
        const upstream = await fetch(url, { headers: { Accept: 'application/json', Origin: PRODUCT_ORIGIN, Referer: `${PRODUCT_ORIGIN}/` } });
        return route.fulfill({ status: upstream.status, contentType: upstream.headers.get('content-type') || 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: await upstream.text() });
      } catch { return route.abort(); }
    });

    // Relay the gateway server-side, preserving status, body and semantics.
    await page.route(`${GATEWAY}/**`, async route => {
      const url = route.request().url();
      try {
        const upstream = await fetch(url, { headers: { Accept: 'application/json', Origin: PRODUCT_ORIGIN, Referer: `${PRODUCT_ORIGIN}/` } });
        const body = await upstream.text();
        gatewayCalls.push({ url: url.replace(GATEWAY, ''), status: upstream.status, semantics: upstream.headers.get('X-NHL-Semantics') });
        return route.fulfill({
          status: upstream.status,
          contentType: upstream.headers.get('content-type') || 'application/json',
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'X-NHL-Semantics',
            ...(upstream.headers.get('X-NHL-Semantics') ? { 'X-NHL-Semantics': upstream.headers.get('X-NHL-Semantics') } : {})
          },
          body
        });
      } catch (error) {
        gatewayCalls.push({ url: url.replace(GATEWAY, ''), status: 0, error: String(error.message) });
        return route.abort();
      }
    });

    await page.goto(`${base}/#${route.hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#score-ticker', { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('#score-ticker')?.dataset.fresh !== 'LOADING', null, { timeout: 25000 });
    await page.waitForTimeout(4500);
    // Bring lazy avatars in so their real load outcome is measured, then return.
    await page.evaluate(async () => {
      for (const img of document.querySelectorAll('.pid__img')) img.loading = 'eager';
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 1800));
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(3500);

    const m = await page.evaluate(() => {
      const pids = [...document.querySelectorAll('.pid')];
      const imgs = [...document.querySelectorAll('.pid__img')];
      const href = p => ((p.tagName === 'A' ? p : p.closest('a'))?.getAttribute('href') || '');
      const linked = pids.filter(p => /#\/player\/\d{6,}/.test(href(p)));
      const rail = document.querySelector('#score-ticker');
      return {
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        brokenAll: [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map(i => i.src.slice(0, 120)),
        emptyFrames: [...document.querySelectorAll('.pid__frame')].filter(f => {
          const fb = f.querySelector('.pid__fallback');
          return !f.querySelector('.pid__img') && fb && getComputedStyle(fb).visibility === 'hidden';
        }).length,
        photoMisses: window.__pbePid?.misses ?? null,
        pids: pids.length,
        linked: linked.length,
        linkedNoImg: linked.filter(p => !p.querySelector('.pid__img')).length,
        photos: imgs.length,
        photosLoaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
        official: imgs.filter(i => i.classList.contains('pid__img--official')).length,
        objectFit: [...new Set(imgs.filter(i => i.classList.contains('pid__img--official')).map(i => getComputedStyle(i).objectFit))],
        aspect: [...new Set(imgs.map(i => { const r = i.getBoundingClientRect(); return r.width && r.height ? (r.width / r.height).toFixed(2) : 'n/a'; }))],
        railFresh: rail?.dataset.fresh,
        railText: (rail?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
        railGames: rail.querySelectorAll('#stk-run .stk-g').length
      };
    });

    const id = `${route.id}@${width}`;
    check(`${id}: no console/page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    check(`${id}: no horizontal overflow`, m.overflow === 0, `${m.overflow}px`);
    check(`${id}: no broken images`, m.brokenAll.length === 0, m.brokenAll.slice(0, 3).join(' | '));
    check(`${id}: no empty identity frame`, m.emptyFrames === 0, String(m.emptyFrames));
    check(`${id}: every rendered avatar image loaded`, m.photos === m.photosLoaded, `${m.photosLoaded}/${m.photos}`);
    check(`${id}: no non-200 image responses`, badImg.length === 0, badImg.slice(0, 3).join(' | '));
    if (m.official) check(`${id}: NHL mugs are contained, not face-cropped`, m.objectFit.every(v => v === 'contain'), m.objectFit.join(','));
    check(`${id}: identity frames stay square`, m.aspect.every(v => v === 'n/a' || Math.abs(Number(v) - 1) < 0.02), m.aspect.join(','));
    check(`${id}: score rail rendered`, Boolean(m.railFresh) && m.railFresh !== 'LOADING', String(m.railFresh));
    check(`${id}: rail is NHL-only`, !/\b(NFL|MLB|NBA|UFC|ESPN)\b/.test(m.railText), m.railText);
    const nonNhl = gatewayCalls.filter(c => !/^\/(nhl\/|readiness|odds)/.test(c.url));
    check(`${id}: no non-NHL gateway calls`, nonNhl.length === 0, nonNhl.map(c => c.url).join(','));

    rows.push({ id, ...m, errors: errors.length, gatewayCalls: gatewayCalls.length });
    console.log(`${id.padEnd(28)} pids=${String(m.pids).padStart(3)} photos=${m.photosLoaded}/${m.photos} official=${String(m.official).padStart(3)} lostSlots=${m.linkedNoImg} misses=${m.photoMisses} overflow=${m.overflow} broken=${m.brokenAll.length} errs=${errors.length} rail=${m.railFresh}/${m.railGames}`);
    if (errors.length) errors.slice(0, 3).forEach(e => console.log('    ! ' + e));

    if (route.shot) {
      await page.screenshot({ path: path.join(outDir, `${route.id}-${width}.png`), fullPage: false });
      if (width === 1440 && route.id === 'home') await page.locator('#score-ticker').screenshot({ path: path.join(outDir, 'rail-1440.png') });
      if (width === 390 && route.id === 'home') await page.locator('#score-ticker').screenshot({ path: path.join(outDir, 'rail-390.png') });
    }
    await ctx.close();
  }
}
await browser.close();

const totals = k => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
console.log('\nTOTALS');
console.log(` identity slots ${totals('pids')} · avatar images ${totals('photos')} · loaded ${totals('photosLoaded')} · NHL asset-feed ${totals('official')}`);
console.log(` broken images 0? ${rows.every(r => r.brokenAll.length === 0)} · empty frames ${totals('emptyFrames')} · runtime photo misses ${totals('photoMisses')}`);
console.log(` console errors ${totals('errors')} · max overflow ${Math.max(...rows.map(r => r.overflow))}px`);
console.log(`screenshots: ${outDir}`);
console.log(`\nlive acceptance: ${rows.length * 11 - failures.length} checks pass, ${failures.length} fail`);
if (failures.length) {
  console.error('\nFAILURES:\n' + failures.map(f => ' - ' + f).join('\n'));
  process.exit(1);
}
