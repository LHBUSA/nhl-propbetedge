// Usage: node shoot.mjs <outDir> <route[,route...]> <width[,width...]> [base]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [outDir = 'shots', routesArg = '/', widthsArg = '1440', base = 'http://127.0.0.1:5173'] = process.argv.slice(2);
const routes = routesArg.split(',');
const widths = widthsArg.split(',').map(Number);
fs.mkdirSync(outDir, { recursive: true });

const exe = process.env.PW_CHROMIUM;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const report = [];
for (const width of widths) {
  const height = width <= 480 ? 844 : width <= 1024 ? 768 : 900;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  for (const route of routes) {
    const page = await context.newPage();
    const errors = [];
    const failed = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', r => failed.push(`${r.failure()?.errorText} ${r.url()}`));
    page.on('response', r => { if (r.status() >= 400 && (r.url().includes('/api/') || r.url().includes('nhl-api.propbetedge.ai'))) failed.push(`${r.status()} ${r.url()}`); });
    const url = `${base}/#${route}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => errors.push(`goto: ${e.message}`));
    await page.waitForTimeout(1500);
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflow = Math.max(0, doc.scrollWidth - window.innerWidth);
      const offenders = overflow ? [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed').slice(0, 5).map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`) : [];
      const broken = [...document.images].filter(img => img.complete && img.naturalWidth === 0 && img.getAttribute('src')).map(img => img.src);
      const tiny = [...document.querySelectorAll('body *')].filter(el => {
        if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        return fs < 10 && el.getClientRects().length;
      }).slice(0, 5).map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}:${getComputedStyle(el).fontSize}`);
      return { overflow, offenders, broken, tiny, height: doc.scrollHeight };
    });
    const name = `${route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}-${width}.png`;
    await page.screenshot({ path: path.join(outDir, name), fullPage: process.env.FULL !== '0' });
    report.push({ route, width, ...metrics, errors, failed, shot: name });
    await page.close();
  }
  await context.close();
}
await browser.close();
for (const r of report) {
  console.log(`${String(r.width).padEnd(5)} ${r.route.padEnd(24)} overflow=${r.overflow} broken=${r.broken.length} tiny=${r.tiny.length} errors=${r.errors.length} failed=${r.failed.length} h=${r.height} ${r.shot}`);
  if (r.offenders.length) console.log('   overflow:', r.offenders.join(' | '));
  if (r.tiny.length) console.log('   tiny:', r.tiny.join(' | '));
  for (const e of r.errors.slice(0, 4)) console.log('   err:', e.slice(0, 220));
  for (const f of r.failed.slice(0, 4)) console.log('   fail:', f.slice(0, 220));
  for (const b of r.broken.slice(0, 3)) console.log('   broken:', b);
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
