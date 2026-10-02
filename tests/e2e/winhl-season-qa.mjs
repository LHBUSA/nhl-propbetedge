// Production QA: WinHL season default at every standard width.
//   node tests/e2e/winhl-season-qa.mjs [baseUrl]
// Checks per width: the WinHL page headline is the current season (from the
// API), no preseason default, no 2025-26 headline, the 2025-26 chip exists and
// switches the board, no horizontal overflow, no console errors. The player
// page WinHL block names the current season.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'https://nhl.propbetedge.ai';
const API = 'https://nhl-api.propbetedge.ai';
const EXEC = process.env.PW_CHROME || 'C:/Users/goodl/AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe';
const WIDTHS = [1440, 1280, 1024, 768, 414, 390, 360, 320];
const OUT = process.env.QA_OUT || null;

const api = async p => (await fetch(`${API}${p}`, { headers: { Origin: 'https://nhl.propbetedge.ai', 'User-Agent': 'pbe-qa' } })).json();
const board = await api('/nhl/intel/winhl');
const label = board.season_label;
const results = [];
const fail = (w, msg) => results.push({ w, ok: false, msg });
const pass = (w, msg) => results.push({ w, ok: true, msg });

if (board.season !== board.current_season) fail('api', `default ${board.season} != current ${board.current_season}`);
else pass('api', `default = current = ${board.season} (${board.status})`);

const browser = await chromium.launch({ headless: true, executablePath: EXEC });
for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/#/winhl`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.wl-podium, .iq-na, .pbe-error', { timeout: 30000 });
  const tools = await page.$eval('#wl-tools', el => el.innerText);
  const head = tools.split('\n').join(' ');
  if (!head.includes(`${label} regular season`)) fail(w, `headline lacks "${label} regular season": ${head.slice(0, 200)}`);
  else pass(w, 'headline current season');
  if (/2025[-–]26 regular season(?! · final)/.test(head) && board.season !== '20252026') fail(w, 'stale 2025-26 headline');
  if (/preseason/i.test(head)) fail(w, 'preseason in headline');
  const chip = await page.$('[data-season="20252026"]');
  if (!chip) fail(w, 'no 2025-26 chip');
  else {
    await chip.click();
    await page.waitForFunction(() => /2025–26 regular season · final/.test(document.querySelector('#wl-tools')?.innerText || ''), null, { timeout: 30000 }).then(() => pass(w, '2025-26 selectable')).catch(() => fail(w, '2025-26 chip did not switch the board'));
    await page.click('[data-season=""]');
    await page.waitForFunction(l => (document.querySelector('#wl-tools')?.innerText || '').includes(`${l} regular season`), label, { timeout: 30000 }).catch(() => fail(w, 'could not switch back to default'));
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) fail(w, `horizontal overflow ${overflow}px`);
  if (OUT) await page.screenshot({ path: `${OUT}/winhl-${w}.png`, fullPage: false });
  // Player page WinHL block for the board leader.
  const leader = board.players[0];
  await page.goto(`${BASE}/#/player/${leader.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const pText = await page.evaluate(() => document.body.innerText);
  if (!pText.includes(`${label} regular season`)) fail(w, `player page lacks "${label} regular season"`);
  else pass(w, 'player page current season');
  const pOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (pOverflow > 0) fail(w, `player overflow ${pOverflow}px`);
  if (errors.length) fail(w, `console errors: ${errors.slice(0, 3).join(' | ')}`);
  await page.close();
}
await browser.close();
const bad = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.w} ${r.msg}`);
console.log(`${results.length - bad.length}/${results.length} passed`);
if (OUT) fs.writeFileSync(`${OUT}/winhl-qa.json`, JSON.stringify(results, null, 1));
process.exit(bad.length ? 1 : 0);
