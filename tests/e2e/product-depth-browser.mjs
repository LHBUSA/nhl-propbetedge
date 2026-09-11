import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.NHL_BROWSER_BASE || 'http://127.0.0.1:4173';
const outDir = process.env.NHL_BROWSER_OUT || 'artifacts/product-depth-browser';
const widths = [1440, 390];
fs.mkdirSync(outDir, { recursive: true });

const now = new Date();
const iso = minutesAgo => new Date(now.getTime() - minutesAgo * 60000).toISOString();
const longBody = 'PropBetEdge NHL analysis fixture. '.repeat(30);

const pbeArticles = [
  {
    id: 'pbe-nhl-1', slug: 'pbe-nhl-camp-analysis-1', sport: 'nhl',
    title: 'Training camp pressure points reshape the opening-week hockey board',
    author: 'Legacy Byline Hidden By NHL Vertical', body: longBody,
    published_at: iso(18), source: 'nhl.com', source_url: 'https://www.nhl.com/news/source-story-1',
    image_url: 'https://third-party.example.test/should-never-render.jpg',
    summary: 'UPSTREAM SUMMARY MUST NOT RENDER',
    take: { summary: 'GENERATED TAKE SUMMARY MUST NOT RENDER', impact_score: 4, teams: ['DET'], bet_advice: 'BET ADVICE MUST NOT RENDER' }
  },
  {
    id: 'pbe-nhl-2', slug: 'pbe-nhl-goalie-analysis-2', sport: 'nhl',
    title: 'Goalie deployment is the first market signal to watch this week',
    author: 'PropBetEdge Editorial Team', body: longBody,
    published_at: iso(67), source: 'daily-faceoff', source_url: 'https://www.dailyfaceoff.com/source-story-2',
    take: { impact_score: 3, teams: ['CAR'] }
  },
  {
    id: 'pbe-nhl-3', slug: 'pbe-nhl-depth-analysis-3', sport: 'nhl',
    title: 'Depth-chart movement creates an early information edge',
    author: 'PropBetEdge Editorial Team', body: longBody,
    published_at: iso(121), source: 'the-hockey-writers', source_url: 'https://thehockeywriters.com/source-story-3',
    take: { impact_score: 3, teams: ['EDM'] }
  },
  {
    id: 'raw-wire-row', slug: 'raw-wire-row', sport: 'nhl',
    title: 'Raw source row must never appear in the PBE analysis rail',
    author: null, body: '', published_at: iso(5), source: 'espn', source_url: 'https://www.espn.com/raw-wire',
    summary: 'raw wire'
  }
];

const sourceWire = {
  schema: 'nhl-news-v2', source: 'NHL source wire', source_urls: ['https://www.nhl.com/news'],
  fetched_at: now.toISOString(), ttl_s: 120, stale_after_s: 600, degraded: false,
  sources: [{ key: 'nhl_general', ok: true, count: 1, ms: 42, url: 'https://www.nhl.com/news' }],
  items: [{
    id: 'wire-1', title: 'Verified NHL source-wire injury update', source: 'NHL.com', origin: 'nhl.com',
    url: 'https://www.nhl.com/news/source-wire', published_at: iso(9), category: 'Injuries',
    category_basis: 'fixture', material: true, breaking: false,
    teams: ['CAR'], teams_basis: 'fixture',
    players: [{ id: '9999999', name: 'QA Player' }],
    related: [], related_count: 0
  }]
};

const board = {
  schema: 'nhl-board-v2', source: 'NHL schedule', source_urls: ['https://api-web.nhle.com/'],
  fetched_at: now.toISOString(), ttl_s: 60, stale_after_s: 600,
  date: now.toISOString().slice(0, 10), season_phase: 'OFFSEASON',
  calendar: { preseason_start: '2026-09-20', regular_season_start: '2026-10-06' },
  counts: { total: 0, LIVE: 0 }, games: [], next_puck_drop: null
};

function json(route, payload, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(payload) });
}

async function installRoutes(page) {
  await page.route('https://propbet-news-api.sales-fd3.workers.dev/**', route => json(route, { articles: pbeArticles, page: 1, limit: 50, total: pbeArticles.length }));
  await page.route('https://propbet-img-proxy.sales-fd3.workers.dev/**', route => route.fulfill({
    status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#1b1812"/><circle cx="90" cy="65" r="34" fill="#d6a648"/><path d="M38 170c7-48 32-70 52-70s45 22 52 70" fill="#d6a648"/></svg>'
  }));
  await page.route('https://nhl-api.propbetedge.ai/**', route => {
    const u = new URL(route.request().url());
    if (u.pathname === '/readiness') return json(route, { ok: true, schema: 'nhl-readiness-v1', data_layer: 'v2', odds: 'not_configured', fetched_at: now.toISOString() });
    if (u.pathname === '/nhl/board') return json(route, board);
    if (u.pathname === '/nhl/news') return json(route, sourceWire);
    return json(route, { ok: false, schema: 'fixture', error: `Unmocked route ${u.pathname}` }, 404);
  });
}

function fail(message, details = '') {
  throw new Error(`${message}${details ? `\n${details}` : ''}`);
}

async function assertPlayerPhoto(page, route, width) {
  await page.waitForSelector('.pid__img--official', { timeout: 10000 });
  const identity = await page.locator('.pid__img--official').first().evaluate(img => ({
    src: img.src,
    broken: Boolean(img.complete && img.naturalWidth === 0)
  }));
  if (!identity.src.includes('propbet-img-proxy.sales-fd3.workers.dev')) fail(`${route} ${width}: player headshot bypassed CF image proxy: ${identity.src}`);
  if (!decodeURIComponent(identity.src).includes('/20262027/CAR/9999999.png')) fail(`${route} ${width}: current-season NHL headshot candidate missing: ${identity.src}`);
  if (identity.broken) fail(`${route} ${width}: player headshot rendered broken`);
  return identity.src;
}

async function assertPage(page, route, width) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await installRoutes(page);
  await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForSelector(route === '/news' ? '.dk-news' : '.wrap.changes', { timeout: 15000 });
  await page.waitForSelector(route === '/news' ? '.pbeo[data-pbe-originals]' : '.pbeo-board[data-pbe-originals-board]', { timeout: 15000 });
  await page.waitForTimeout(350);

  // This comes from the bundled product itself: the operational source-wire
  // fixture includes an unlisted player on a material update, forcing
  // playerIdentity through its official NHL-headshot fallback rather than a
  // reviewed local portrait.
  const playerPhoto = await assertPlayerPhoto(page, route, width);

  const metrics = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    broken: [...document.images].filter(img => img.complete && img.naturalWidth === 0 && img.getAttribute('src')).map(img => img.src),
    pbeCards: document.querySelectorAll('[data-pbe-originals] .pbeo-lead, [data-pbe-originals] .pbeo-mini, [data-pbe-originals-board] .pbeo-board__story').length,
    sourceLinks: [...document.querySelectorAll('[data-pbe-originals] a, [data-pbe-originals-board] a')].filter(a => /Source:/.test(a.textContent || '')).length,
    unsafeImages: [...document.querySelectorAll('[data-pbe-originals] img, [data-pbe-originals-board] img')].map(img => img.src).filter(src => /third-party\.example|dailyfaceoff|thehockeywriters|espncdn/i.test(src)),
    body: document.body.textContent || ''
  }));

  if (metrics.overflow) fail(`${route} ${width}: horizontal overflow ${metrics.overflow}px`);
  if (metrics.broken.length) fail(`${route} ${width}: broken images`, metrics.broken.join('\n'));
  if (metrics.pbeCards < 3) fail(`${route} ${width}: expected >=3 PBE analysis cards, got ${metrics.pbeCards}`);
  if (metrics.sourceLinks < 3) fail(`${route} ${width}: missing per-card source attribution (${metrics.sourceLinks})`);
  if (metrics.unsafeImages.length) fail(`${route} ${width}: third-party article image leaked`, metrics.unsafeImages.join('\n'));
  for (const banned of ['UPSTREAM SUMMARY MUST NOT RENDER', 'GENERATED TAKE SUMMARY MUST NOT RENDER', 'BET ADVICE MUST NOT RENDER', 'Raw source row must never appear in the PBE analysis rail', 'Legacy Byline Hidden By NHL Vertical']) {
    if (metrics.body.includes(banned)) fail(`${route} ${width}: blocked generic-feed field leaked: ${banned}`);
  }

  if (route === '/news') {
    const pbeTab = page.locator('[data-tab="PBE"]');
    if (!await pbeTab.count()) fail(`${route} ${width}: PBE tab missing`);
    const label = await pbeTab.textContent();
    if (!/^PBE NHL/.test(label || '')) fail(`${route} ${width}: PBE tab not upgraded (${label})`);
    await pbeTab.click();
    await page.waitForSelector('#dk-n-body [data-pbe-originals]', { timeout: 10000 });
    const tabCards = await page.locator('#dk-n-body [data-pbe-originals] .pbeo-lead, #dk-n-body [data-pbe-originals] .pbeo-mini').count();
    if (tabCards < 3) fail(`${route} ${width}: PBE tab did not populate (${tabCards})`);
  }

  if (errors.length) fail(`${route} ${width}: console/page errors`, errors.join('\n'));
  const filename = `${route === '/' ? 'ice-board' : 'newsroom'}-${width}.png`;
  await page.screenshot({ path: path.join(outDir, filename), fullPage: true });
  return { route, width, ...metrics, screenshot: filename, playerPhoto };
}

const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width <= 480 ? 844 : 900 }, deviceScaleFactor: 1 });
    for (const route of ['/', '/news']) {
      const page = await context.newPage();
      try {
        report.push(await assertPage(page, route, width));
      } catch (error) {
        const filename = `FAILED-${route === '/' ? 'ice-board' : 'newsroom'}-${width}.png`;
        await page.screenshot({ path: path.join(outDir, filename), fullPage: true }).catch(() => {});
        fs.writeFileSync(path.join(outDir, 'failure.txt'), String(error?.stack || error));
        throw error;
      } finally {
        await page.close();
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
}

for (const row of report) console.log(`PASS ${row.width} ${row.route} overflow=${row.overflow} broken=${row.broken.length} cards=${row.pbeCards} sources=${row.sourceLinks}`);
console.log('NHL product-depth browser gate: PASS');
