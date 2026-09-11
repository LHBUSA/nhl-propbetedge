// Renders the NHL icon family from the three SVG masters beside this file
// into public/. Chromium does the rasterising so the PNGs match what a
// browser draws from the SVG.
//
//   PW_CHROMIUM=<chrome.exe> PLAYWRIGHT_MODULE=<.../playwright/index.mjs> \
//     node scripts/identity/render.mjs
//
//   mark-small.svg  -> favicon.svg, favicon-16x16.png, favicon-32x32.png,
//                      favicon.ico (16/32/48, PNG-encoded entries)
//   mark-full.svg   -> icon-192.png, icon-512.png
//   mark-bleed.svg  -> apple-touch-icon.png (180, square: iOS masks it)
//   mark-maskable.svg -> icon-maskable-512.png (mark inside the 80% safe zone)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, '..', '..', 'public');
const mod = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const { chromium } = await import(mod);

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });

async function png(master, size, { bg = null, pad = 0 } = {}) {
  const svg = fs.readFileSync(path.join(HERE, master), 'utf8');
  const inner = size - pad * 2;
  await page.setContent(`<html><body style="margin:0;background:${bg || 'transparent'}"><div style="width:${size}px;height:${size}px;display:grid;place-items:center">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  return page.screenshot({ omitBackground: !bg, clip: { x: 0, y: 0, width: size, height: size } });
}

function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(([size, data], i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e); header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(([, d]) => d)]);
}

const out = (name, buf) => fs.writeFileSync(path.join(PUBLIC, name), buf);

fs.copyFileSync(path.join(HERE, 'mark-small.svg'), path.join(PUBLIC, 'favicon.svg'));
const s16 = await png('mark-small.svg', 16), s32 = await png('mark-small.svg', 32), s48 = await png('mark-small.svg', 48);
out('favicon-16x16.png', s16);
out('favicon-32x32.png', s32);
out('favicon.ico', ico([[16, s16], [32, s32], [48, s48]]));
out('icon-192.png', await png('mark-full.svg', 192));
out('icon-512.png', await png('mark-full.svg', 512));
out('apple-touch-icon.png', await png('mark-bleed.svg', 180, { bg: '#0c0a07' }));
out('icon-maskable-512.png', await png('mark-maskable.svg', 512, { bg: '#0c0a07' }));

await browser.close();
console.log('rendered icon family into', PUBLIC);
