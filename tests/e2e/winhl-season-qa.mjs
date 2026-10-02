// Production acceptance: WinHL season default, archive switching, provisional
// UX, matchup WinHL, direct API selection, preseason isolation, provenance.
//   node tests/e2e/winhl-season-qa.mjs [baseUrl] [matchupGameId]
// Read-only. QA_OUT=<dir> saves screenshots + JSON results.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'https://nhl.propbetedge.ai';
const GAME = process.argv[3] || null;
const API = 'https://nhl-api.propbetedge.ai';
const EXEC = process.env.PW_CHROME || 'C:/Users/goodl/AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe';
const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440];
const OUT = process.env.QA_OUT || null;

const api = async p => { const r = await fetch(`${API}${p}`, { headers: { Origin: 'https://nhl.propbetedge.ai', 'User-Agent': 'pbe-qa' } }); return { status: r.status, body: await r.json() }; };
const results = [];
const check = (w, ok, msg) => results.push({ w, ok: Boolean(ok), msg });

// ---------------------------------------------------------------- API contract
const { body: board } = await api('/nhl/intel/winhl');
const label = board.season_label;
check('api', board.season === board.current_season && board.is_default === true, `default = current = ${board.season} (${board.status})`);
check('api', board.season_type === 'REGULAR_SEASON' && board.game_type === 2, 'default board is regular season (game_type 2), never preseason');
const sel = await api('/nhl/intel/winhl?season=20252026');
check('api', sel.status === 200 && sel.body.season === '20252026' && sel.body.status === 'final' && sel.body.is_default === false && sel.body.selected_by === 'request', `?season=20252026 -> ${sel.body.season_label} ${sel.body.status}, ${sel.body.total_scored} scored`);
const seasons = await api('/nhl/intel/winhl/seasons');
check('api', seasons.body.default_season === board.season && seasons.body.seasons.some(s => s.season === '20252026' && !s.default), 'seasons list: current default + 2025-26 selectable');
check('api', (await api('/nhl/intel/winhl?season=2025-26')).status === 400, 'malformed season -> 400');
check('api', (await api('/nhl/intel/winhl?season=20192020')).status === 404, 'unknown season -> 404 (no silent fallback)');
const leader = board.players[0];
const pl = await api(`/nhl/intel/winhl/player/${leader.id}`);
check('api', pl.body.season === board.season && pl.body.is_default && pl.body.player?.season?.gp === leader.gp, `player API ${leader.name}: ${pl.body.season_label}, ${pl.body.player?.season?.gp} GP`);
const { body: health } = await api('/nhl/intel/health');
check('api', Boolean(health.winhl_provenance_verified_at), `provenance verified at ${health.winhl_provenance_verified_at}`);
check('api', health.winhl_last_rejected === null, `no refused board (${health.winhl_last_rejected})`);
if (GAME) {
  const gi = await api(`/nhl/intel/game/${GAME}`);
  const lu = gi.body.sides?.away?.winhl_lineup;
  // WinHL lineup only: shot environment / special teams are a separate team metric
  // with their own labelled season rule (prior season until teams average 5 GP).
  check('api', gi.status === 200 && lu && !/2025[-–]26/.test(JSON.stringify(lu)) && lu.scored > 0, `matchup intel ${GAME}: WinHL lineup ${lu?.scored}/${lu?.dressed} scored, no 2025-26 lineup data`);
}

// ---------------------------------------------------------------- browser, every width
const browser = await chromium.launch({ headless: true, executablePath: EXEC });
for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  const overflow = async where => { const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check(w, o <= 0, `${where}: no horizontal overflow (${o}px)`); };

  await page.goto(`${BASE}/#/winhl`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.wl-podium, .iq-na, .pbe-error', { timeout: 30000 });
  const head = (await page.$eval('#wl-tools', el => el.innerText)).replace(/\n/g, ' ').toLowerCase(); // toolbar is CSS-uppercased
  check(w, head.includes(`${label} regular season`), 'WinHL headline = current season');
  check(w, !/preseason/i.test(head), 'no preseason in headline');
  if (board.provisional) {
    check(w, head.includes('provisional'), 'headline says provisional');
    check(w, Boolean(await page.$('.pbe-badge--preseason[title*="not a mature-season ranking"]')), 'provisional badge carries the explanation tooltip');
    const rows = await page.$$eval('.wl-row .micro', els => els.map(e => e.innerText));
    check(w, rows.length > 0 && rows.every(t => /GP/.test(t)), 'every row shows GP');
  }
  const chip = await page.$('[data-season="20252026"]');
  check(w, Boolean(chip), '2025-26 chip present');
  if (chip) {
    await chip.click();
    const switched = await page.waitForFunction(() => /2025–26 regular season · final/i.test(document.querySelector('#wl-tools')?.innerText || ''), null, { timeout: 30000 }).then(() => true).catch(() => false);
    check(w, switched, 'archived 2025-26 board loads on click');
    await page.click('[data-season=""]');
    const back = await page.waitForFunction(l => (document.querySelector('#wl-tools')?.innerText || '').toLowerCase().includes(`${l} regular season`), label, { timeout: 30000 }).then(() => true).catch(() => false);
    check(w, back, 'switches back to the current-season default');
  }
  await overflow('WinHL');
  if (OUT) await page.screenshot({ path: `${OUT}/winhl-${w}.png` });

  await page.goto(`${BASE}/#/player/${leader.id}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.wl-seasonline', { timeout: 30000 }).catch(() => {});
  const line = await page.$eval('.wl-seasonline', el => ({ t: el.innerText.toLowerCase(), title: el.getAttribute('title') })).catch(() => null); // CSS-uppercased
  check(w, line && line.t.toLowerCase().startsWith(`${label} regular season`) && /\d+ gp/.test(line.t) && /updated/.test(line.t), `player WinHL line: ${line?.t}`);
  if (board.provisional) check(w, line && /provisional/.test(line.t) && /mature-season/.test(line.title || ''), 'player WinHL marked provisional with tooltip');
  await overflow('player');
  if (OUT) await page.screenshot({ path: `${OUT}/player-${w}.png` });

  if (GAME) {
    await page.goto(`${BASE}/#/matchup/${GAME}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const txt = await page.evaluate(() => document.body.innerText);
    check(w, /WinHL lineup/i.test(txt), 'matchup shows the WinHL lineup cell');
    check(w, !/2025[-–]26 regular season/i.test(txt), 'matchup carries no 2025-26 WinHL season');
    await overflow('matchup');
    if (OUT) await page.screenshot({ path: `${OUT}/matchup-${w}.png` });
  }
  check(w, errors.length === 0, `console errors: ${errors.length ? errors.slice(0, 3).join(' | ') : 'none'}`);
  await page.close();
}
await browser.close();
const bad = results.filter(r => !r.ok);
for (const r of results) if (!r.ok || r.w === 'api') console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.w} ${r.msg}`);
console.log(`${results.length - bad.length}/${results.length} passed`);
if (OUT) fs.writeFileSync(`${OUT}/winhl-qa.json`, JSON.stringify(results, null, 1));
process.exit(bad.length ? 1 : 0);
