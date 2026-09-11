import { chromium } from 'file:///D:/Temp/claude/C--Users-goodl/3e8d982e-64bc-43ed-869a-c2fac1c70448/scratchpad/qa/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
async function shot(svgFile, size, out, { bg = null, pad = 0, radius = null } = {}) {
  let svg = fs.readFileSync(svgFile, 'utf8');
  if (radius !== null) svg = svg.replace(/rx="(112|7)"/, `rx="${radius}"`);
  const inner = size - pad * 2;
  await page.setContent(`<html><body style="margin:0;background:${bg || 'transparent'}"><div style="width:${size}px;height:${size}px;display:grid;place-items:center">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: out, omitBackground: !bg, clip: { x: 0, y: 0, width: size, height: size } });
}
await shot('mark-small.svg', 16, 'favicon-16x16.png');
await shot('mark-small.svg', 32, 'favicon-32x32.png');
await shot('mark-full.svg', 48, 'favicon-48x48.png');
await shot('mark-full.svg', 180, 'apple-touch-icon.png', { bg: '#0d0b08', radius: 0 });
await shot('mark-full.svg', 192, 'icon-192.png');
await shot('mark-full.svg', 512, 'icon-512.png');
// maskable: full-bleed tile, mark inside the 80% safe zone
await shot('mark-full.svg', 512, 'icon-maskable-512.png', { bg: '#0d0b08', pad: 56, radius: 0 });
await browser.close();
console.log('rendered');
