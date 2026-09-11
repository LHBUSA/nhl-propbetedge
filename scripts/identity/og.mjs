import { chromium } from 'file:///D:/Temp/claude/C--Users-goodl/3e8d982e-64bc-43ed-869a-c2fac1c70448/scratchpad/qa/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto('file:///D:/Temp/claude/C--Users-goodl/3e8d982e-64bc-43ed-869a-c2fac1c70448/scratchpad/identity/og.html', { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: 'og.png' });
await b.close();
