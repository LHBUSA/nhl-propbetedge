// Renders the 1200x630 social card from og.html beside this file (the mark
// inside it is mark-full.svg) to og.png; save it as
// public/og/propbetedge-nhl-1200x630.jpg (JPEG q86, keep it under 300 KB).
//   PW_CHROMIUM=<chrome.exe> PLAYWRIGHT_MODULE=<.../playwright/index.mjs> node scripts/identity/og.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const mod = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const { chromium } = await import(mod);
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto(pathToFileURL(path.join(HERE, 'og.html')).href, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: path.join(HERE, 'og.png') });
await b.close();
