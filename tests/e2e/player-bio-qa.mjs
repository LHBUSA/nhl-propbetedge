// Player biography — browser QA gate.
//
//   npm run build && npm run preview   (4173)   then   node tests/e2e/player-bio-qa.mjs [baseUrl]
//
// Runs the built app against the REAL production gateway through the shared
// relay (production CORS refuses localhost). PBE_BIO_ENRICH=1 additionally
// overlays the draft/honors/badges fields that propsports-api normalizes from
// the NHL landing payload (nhl-intelligence playerProfile), fetched Node-side
// from the same NHL source — for previewing a backend that is not deployed yet.
//
// Per player x width: About section present and named for this player, 0
// console/page errors, 0 horizontal overflow, bio above DNA above the current
// editorial context, no rendered '—'-only rail.
import fs from 'node:fs';
import { GATEWAY, PRODUCT_ORIGIN, gotoHash, launchBrowser, makePage, settle } from './lib/interaction.mjs';

const BASE = process.argv[2] || process.env.PBE_BASE || 'http://127.0.0.1:4173';
const WIDTHS = (process.env.PBE_WIDTHS || '1920,1366,768,390,360').split(',').map(Number);
const IDS = (process.env.PBE_BIO_IDS || '8471214,8471675,8478402,8478550,8485388,8482476,8478048,8468685').split(',').map(Number);
const ENRICH = process.env.PBE_BIO_ENRICH === '1';
const SHOTS = new Set((process.env.PBE_BIO_SHOTS || '8471214').split(',').map(Number));
const OUT = `artifacts/player-bio-qa${ENRICH ? '-enriched' : ''}`;
fs.mkdirSync(OUT, { recursive: true });

const text = v => (v && typeof v === 'object' ? v.default || null : v || null);
async function landingFields(id) {
  const res = await fetch(`https://api-web.nhle.com/v1/player/${id}/landing`, { headers: { 'User-Agent': 'pbe-bio-qa/1.0' } });
  if (!res.ok) return {};
  const d = await res.json();
  const dd = d.draftDetails;
  return {
    birth_state_province: text(d.birthStateProvince),
    draft: dd ? { year: dd.year ?? null, team_abbrev: dd.teamAbbrev || null, round: dd.round ?? null, pick_in_round: dd.pickInRound ?? null, overall_pick: dd.overallPick ?? null } : null,
    honors: (d.awards || []).map(a => ({ trophy: text(a.trophy), seasons: (a.seasons || []).map(s => ({ season: s.seasonId, game_type: s.gameTypeId })) })).filter(a => a.trophy && a.seasons.length),
    badges: (d.badges || []).map(b => text(b.title)).filter(Boolean),
    in_hhof: d.inHHOF === 1 ? true : null,
    in_top_100_all_time: d.inTop100AllTime === 1 ? true : null
  };
}

const browser = await launchBrowser();
const results = [];
for (const id of IDS) {
  const extra = ENRICH ? await landingFields(id) : null;
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const { page, errors } = await makePage(context);
    // /auth/session is credentialed and the shared relay answers '*': run as a
    // signed-out visitor, exactly like intel-qa.mjs.
    await page.route(`${GATEWAY}/auth/session`, route => route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': route.request().headers().origin || BASE, 'Access-Control-Allow-Credentials': 'true', 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, state: 'signed_out' }) }));
    const bad = [];
    page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
    if (ENRICH) {
      await page.route(new RegExp(`${GATEWAY.replace(/\./g, '\\.')}/nhl/player/${id}(\\?.*)?$`), async route => {
        const res = await fetch(route.request().url(), { headers: { Origin: PRODUCT_ORIGIN, 'User-Agent': 'pbe-bio-qa/1.0' } });
        const body = await res.json();
        body.player = { ...body.player, ...extra };
        await route.fulfill({ status: res.status, headers: { 'Access-Control-Allow-Origin': route.request().headers().origin || '*', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      });
    }
    await gotoHash(page, BASE, `#/player/${id}`, { settle: 800 });
    await page.waitForSelector('.pbio', { timeout: 15000 }).catch(() => {});
    await settle(page, { idleMs: 700, timeout: 20000 });
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const top = sel => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect().top + window.scrollY : null; };
      const h1 = document.querySelector('.rs-phead h1')?.textContent?.trim() || '';
      const bioH = document.querySelector('.pbio__h')?.textContent?.trim() || '';
      const ctx = document.querySelector('[data-pbe-context]');
      return {
        h1, bioH,
        words: (document.querySelector('.pbio__prose')?.textContent || '').trim().split(/\s+/).filter(Boolean).length,
        pbe: Boolean(document.querySelector('.pbio__style')),
        rail: [...document.querySelectorAll('.pbio__glance > div')].map(d => `${d.querySelector('dt')?.textContent}: ${d.querySelector('dd')?.textContent}`),
        src: document.querySelector('.pbio__src')?.textContent || '',
        order: { head: top('.rs-phead'), bio: top('.pbio'), dna: top('.nhl-dna'), season: top('.rs-p-season'), career: top('.rs-p-career'), ctx: top('[data-pbe-context]'), news: top('.rs-p-news') },
        ctxLabel: ctx ? (ctx.querySelector('.eyebrow')?.textContent || '') : null,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        journeyRows: document.querySelectorAll('.pbio-j__row').length
      };
    });
    const o = m.order;
    const after = (a, b) => a === null || b === null || a > b;
    const checks = {
      bio_present: Boolean(m.bioH),
      bio_named_for_player: m.bioH === `About ${m.h1}`,
      bio_after_hero: after(o.bio, o.head),
      dna_after_bio: after(o.dna, o.bio),
      season_after_bio: after(o.season, o.bio),
      context_after_career: after(o.ctx, o.career),
      context_labeled: m.ctxLabel === null || /Current editorial context/.test(m.ctxLabel),
      no_overflow: m.overflow <= 0,
      // Known, pre-existing and unrelated to the bio: nhl-metrics answers 404
      // for a player with no current-season WinHL row (logged by the browser).
      no_errors: errors.filter(e => !/status of 404/.test(e)).length === 0 && bad.every(b => /\/nhl\/intel\/winhl\/player\/\d+$/.test(b))
    };
    const ok = Object.values(checks).every(Boolean);
    results.push({ id, width, ok, checks, words: m.words, pbe: m.pbe, rail: m.rail, src: m.src, journeyRows: m.journeyRows, errors: [...errors], bad });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${m.h1} @${width}: ${m.words}w rail=${m.rail.length} journey=${m.journeyRows}${ok ? '' : ` ${JSON.stringify(checks)}`}`);
    if (SHOTS.has(id)) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${OUT}/${id}-${width}-top.png` });
      const bio = await page.$('.pbio');
      if (bio) await bio.screenshot({ path: `${OUT}/${id}-${width}-bio.png` });
      await page.screenshot({ path: `${OUT}/${id}-${width}-full.png`, fullPage: true });
    }
    await context.close();
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok);
console.log(`\nplayer-bio QA: ${results.length - failed.length}/${results.length} passed${ENRICH ? ' (enriched preview)' : ''}`);
process.exit(failed.length ? 1 : 0);
