// NHL intelligence surfaces — browser QA gate.
//
//   npm run build && npm run preview   (4173)   then   node tests/e2e/intel-qa.mjs [baseUrl]
//
// Runs the built app against the REAL production gateway (relayed Node-side
// with the product Origin, exactly like live-acceptance.mjs, because production
// CORS refuses localhost). Nothing is mocked. Game and player ids are resolved
// at runtime from the live board and WinHL table — never hardcoded.
//
// Per route x width: 0 console/page errors, 0 horizontal overflow, the
// surface's key structure present, and the free-tier boundary held (no PBE
// score ring with a number on goalie / fatigue / game-intelligence surfaces).
import fs from 'node:fs';
import { GATEWAY, PRODUCT_ORIGIN, gotoHash, launchBrowser, makePage, relayLedger, settle } from './lib/interaction.mjs';

const BASE = process.argv[2] || process.env.PBE_BASE || 'http://127.0.0.1:4173';
const WIDTHS = (process.env.PBE_WIDTHS || '1440,1280,1024,768,430,390,360,320').split(',').map(Number);
const OUT = 'artifacts/intel-qa';
fs.mkdirSync(OUT, { recursive: true });

async function gw(path) {
  const res = await fetch(`${GATEWAY}${path}`, { headers: { Origin: PRODUCT_ORIGIN, 'User-Agent': 'pbe-intel-qa/1.0' } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// Real ids from live data.
const board = await gw('/nhl/board');
const nextDate = board.games?.length ? board.date : board.next_puck_drop?.date;
const slate = board.games?.length ? board : await gw(`/nhl/board?date=${nextDate}`);
const gameId = slate.games?.[0]?.id;
const winhl = await gw('/nhl/intel/winhl');
const skaterId = winhl.players?.[0]?.id;
if (!gameId || !skaterId) throw new Error(`could not resolve live ids (game ${gameId}, skater ${skaterId})`);
console.log(`live ids: game ${gameId} (${slate.date}), skater ${skaterId} (${winhl.players[0].name})`);

// /auth/* and /pro/* are credentialed: the shared relay answers with
// Access-Control-Allow-Origin: *, which a credentialed fetch rejects. The gate
// runs as a SIGNED-OUT visitor (the free tier) by default; PBE_QA_PRO=1 runs a
// MOCKED Pro session whose /pro/intel/game response is the real Pro-tier
// nhl-metrics fixture (tests/fixtures/intel-pro-*.json) — a presentation check
// only, since no real Pro mailbox is available to this harness.
const PRO = process.env.PBE_QA_PRO === '1';
const proFixture = PRO ? fs.readFileSync('tests/fixtures/intel-pro-2025021282.json', 'utf8') : null;
async function stubAuth(page) {
  const cors = req => ({ 'Access-Control-Allow-Origin': req.headers().origin || BASE, 'Access-Control-Allow-Credentials': 'true', 'Content-Type': 'application/json' });
  await page.route(`${GATEWAY}/auth/session`, route => route.fulfill({
    status: 200, headers: cors(route.request()),
    body: JSON.stringify(PRO
      ? { ok: true, state: 'pro', email: 'qa***@example.com', membership: { state: 'sport_pro', entitled: true, sport: 'nhl', access_source: 'sport', contract: '1.1.0' } }
      : { ok: true, state: 'signed_out' })
  }));
  if (PRO) await page.route(`${GATEWAY}/pro/**`, route => {
    const url = route.request().url();
    if (/\/pro\/intel\/game\//.test(url)) return route.fulfill({ status: 200, headers: cors(route.request()), body: proFixture });
    return route.fulfill({ status: 402, headers: cors(route.request()), body: JSON.stringify({ ok: false, error: 'mocked: only game intelligence is fixtured' }) });
  });
}

const noNumericRing = async page => page.$$eval('.iq-ring__v', els => els.filter(e => /\d/.test(e.textContent || '')).length);

const ROUTES = [
  { key: 'winhl', hash: '#/winhl', wait: '.wl-pod', checks: async p => ({
    podium: (await p.$$('.wl-pod')).length >= 3,
    rows: (await p.$$('.wl-row')).length >= 5,
    free_lock: (await p.$$('.iq-lock')).length >= 1,
    no_trend_free: (await p.$$('.wl-trend')).length === 0
  }) },
  { key: 'fatigue', hash: '#/fatigue', wait: '.fg-game, .pbe-empty', checks: async p => ({
    games_or_empty: (await p.$$('.fg-game, .pbe-empty')).length >= 1,
    facts: (await p.$$('.iq-chips, .pbe-empty')).length >= 1,
    no_free_scores: (await noNumericRing(p)) === 0
  }) },
  { key: 'fights', hash: '#/fights?season=20252026', wait: '.ft-card', checks: async p => ({
    cards: (await p.$$('.ft-card')).length >= 1,
    not_official_label: /NOT OFFICIAL/.test(await p.textContent('#ft-body')),
    descriptive_label: /not causal/i.test(await p.textContent('#ft-body'))
  }) },
  { key: 'goalies', hash: `#/goalies/${gameId}`, wait: '.dk-gi, .dk-game', timeout: 30000, checks: async p => ({
    ladder_kept: (await p.$$('.dk-ladder')).length >= 1,
    intel: (await p.$$('.gi-matchup')).length >= 1,
    timeline: (await p.$$('.gi-timeline')).length >= 1,
    no_free_scores: (await noNumericRing(p)) === 0
  }) },
  { key: 'matchup', hash: `#/matchup/${gameId}`, wait: '.gx', timeout: 30000, checks: async p => ({
    panel: (await p.$$('.gx-cell')).length >= 8,
    no_confidence_score: /no combined confidence score/i.test(await p.textContent('.gx')),
    no_free_scores: (await noNumericRing(p)) === 0
  }) },
  { key: 'props', hash: '#/props', wait: '#dk-p-validation .panel-head', checks: async p => ({
    shadow_badge: /SHADOW/.test(await p.textContent('#dk-p-validation')),
    board: (await p.$$('#dk-p-frame')).length === 1
  }) },
  { key: 'player', hash: `#/player/${skaterId}`, wait: '.rs-p-intel .gi-card', checks: async p => ({
    intel_panel: (await p.$$('.rs-p-intel')).length === 1
  }) },
  { key: 'teams', hash: '#/teams', wait: '.tm-card', checks: async p => ({ teams: (await p.$$('.tm-card')).length === 32 }) },
  { key: 'methodology', hash: '#/methodology?section=winhl', wait: '#mth-winhl', checks: async p => ({
    sections: (await p.$$('#mth-winhl, #mth-goalie-form, #mth-fatigue, #mth-fights, #mth-props-model')).length === 5
  }) },
  { key: 'board', hash: '#/', wait: '.hero, main section', checks: async p => ({ shell: (await p.$$('#topbar')).length === 1 }) }
];

const ONLY = process.env.PBE_ROUTES ? new Set(process.env.PBE_ROUTES.split(',')) : null;
const browser = await launchBrowser();
const results = [];
let failures = 0;
for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: width < 700 ? 860 : 1000 }, deviceScaleFactor: 1 });
  for (const r of ROUTES.filter(x => !ONLY || ONLY.has(x.key))) {
    const { page, errors } = await makePage(context);
    await stubAuth(page);
    const row = { width, route: r.key, ok: true, problems: [] };
    try {
      await gotoHash(page, BASE, r.hash, { settle: 600 });
      await page.waitForSelector(r.wait, { timeout: r.timeout || 20000 }).catch(() => row.problems.push(`missing ${r.wait}`));
      await settle(page, { idleMs: 600, timeout: r.timeout || 20000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) {
        const who = await page.evaluate(() => {
          const W = document.documentElement.clientWidth; const out = [];
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            const right = r.right + window.scrollX;
            if (right <= W + 1 || !r.width) continue;
            let p = el.parentElement; let clipped = false;
            while (p) { if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) { clipped = true; break; } p = p.parentElement; }
            if (!clipped) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}@${Math.round(right)}`);
          }
          return `scrollX=${window.scrollX} ${out.slice(0, 4).join(', ')}`;
        });
        row.problems.push(`overflow ${overflow}px (${who})`);
      }
      const checks = await r.checks(page);
      if (PRO) {
        // Mocked Pro session: the free-boundary checks invert on the surfaces
        // served from the Pro fixture (numbers must now render).
        if ('no_free_scores' in checks && ['goalies', 'matchup'].includes(r.key)) { delete checks.no_free_scores; checks.pro_scores_render = (await page.$$eval('.iq-ring__v', els => els.filter(e => /\d/.test(e.textContent || '')).length)) > 0; checks.no_pro_lock = (await page.$$('.gx .iq-lock, .gi .iq-lock')).length === 0; }
        delete checks.free_lock; delete checks.no_trend_free;
      }
      for (const [k, v] of Object.entries(checks)) if (!v) row.problems.push(`check ${k}`);
      // In mocked-Pro mode the harness itself answers un-fixtured /pro/ routes
      // with 402; the browser logs those. They are scaffolding, not product.
      const real = PRO ? errors.filter(e => !/status of 402/.test(e)) : errors;
      if (real.length) row.problems.push(...real.map(e => `error ${e}`));
      if (width === 1440 || width === 390 || width === 320) await page.screenshot({ path: `${OUT}/${r.key}-${width}${PRO ? '-pro' : ''}.png`, fullPage: false });
    } catch (e) {
      row.problems.push(`exception ${String(e.message).slice(0, 160)}`);
    }
    row.ok = row.problems.length === 0;
    if (!row.ok) failures += 1;
    results.push(row);
    console.log(`${row.ok ? 'PASS' : 'FAIL'} ${String(width).padStart(4)} ${r.key}${row.ok ? '' : ` :: ${row.problems.join(' | ')}`}`);
    await page.close();
  }
  // Nav IA at this width (desktop header vs mobile sheet).
  const { page } = await makePage(context);
  await stubAuth(page);
  await gotoHash(page, BASE, '#/', { settle: 400 });
  const nav = await page.evaluate(() => ({
    header: [...document.querySelectorAll('.mainnav > a')].map(a => a.getAttribute('href')),
    more: [...document.querySelectorAll('.more__menu a')].map(a => a.getAttribute('href')),
    groups: [...document.querySelectorAll('.more__menu .more__group')].map(g => g.textContent.trim()),
    sheetGroups: [...document.querySelectorAll('.sheet__grid .sheet__group')].map(g => g.textContent.trim())
  }));
  const dup = [...nav.header, ...nav.more].length !== new Set([...nav.header, ...nav.more]).size;
  const navOk = nav.header.length === 5 && nav.groups.join('|') === 'Live|Prediction|Intelligence|Research' && nav.sheetGroups.length === 4 && !dup;
  if (!navOk) failures += 1;
  results.push({ width, route: 'nav', ok: navOk, problems: navOk ? [] : [JSON.stringify(nav)] });
  console.log(`${navOk ? 'PASS' : 'FAIL'} ${String(width).padStart(4)} nav`);
  await page.close();
  await context.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, game_id: gameId, skater_id: skaterId, results, relay: relayLedger }, null, 2));
console.log(`\nintel QA: ${results.length - failures} PASS / ${failures} FAIL · relay incidents ${relayLedger.length}`);
process.exit(failures ? 1 : 0);
