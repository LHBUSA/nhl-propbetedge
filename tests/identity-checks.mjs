// Static identity / metadata checks: favicon family, manifest, canonical,
// Open Graph + Twitter cards, JSON-LD. Runs in CI before the build.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SITE = 'https://nhl.propbetedge.ai/';
const html = fs.readFileSync('index.html', 'utf8');
const head = html.slice(0, html.indexOf('</head>'));

const all = (re) => [...head.matchAll(re)];
const meta = (attr, key) => all(new RegExp(`<meta\\s+${attr}="${key.replace(/[:.]/g, m => `\\${m}`)}"\\s+content="([^"]*)"`, 'g')).map(m => m[1]);
const one = (attr, key) => {
  const v = meta(attr, key);
  assert.equal(v.length, 1, `exactly one ${attr}=${key} (found ${v.length})`);
  return v[0];
};

// PNG / JPEG dimensions without dependencies.
function dims(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  throw new Error(`unknown image format: ${file}`);
}
const publicPath = url => `public${new URL(url, SITE).pathname}`;

// Title / description / canonical
const title = (head.match(/<title>([^<]+)<\/title>/g) || []);
assert.equal(title.length, 1, 'one <title>');
const desc = one('name', 'description');
assert.ok(desc.length >= 80 && desc.length <= 300, 'description length is sensible');
const canon = all(/<link rel="canonical" href="([^"]+)"/g).map(m => m[1]);
assert.deepEqual(canon, [SITE], 'one canonical, the production origin');
assert.ok(!/localhost|127\.0\.0\.1|vercel\.app|workers\.dev/.test(head), 'no dev/preview hosts in <head>');
one('name', 'robots');
one('name', 'theme-color');

// Open Graph
assert.equal(one('property', 'og:type'), 'website');
assert.equal(one('property', 'og:url'), SITE);
one('property', 'og:site_name'); one('property', 'og:title'); one('property', 'og:description'); one('property', 'og:image:alt');
const og = one('property', 'og:image');
assert.ok(og.startsWith(SITE), 'og:image is absolute on the production origin');
assert.ok(fs.existsSync(publicPath(og)), `og:image file exists: ${publicPath(og)}`);
const [w, h] = dims(publicPath(og));
assert.equal(String(w), one('property', 'og:image:width'));
assert.equal(String(h), one('property', 'og:image:height'));
assert.deepEqual([w, h], [1200, 630]);
assert.ok(fs.statSync(publicPath(og)).size < 300 * 1024, 'og image under 300 KB');

// Twitter / X
assert.equal(one('name', 'twitter:card'), 'summary_large_image');
one('name', 'twitter:title'); one('name', 'twitter:description'); one('name', 'twitter:image:alt');
assert.equal(one('name', 'twitter:image'), og);

// Favicon family + manifest
const icons = all(/<link rel="(icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g).map(m => m[2]);
for (const href of icons) assert.ok(fs.existsSync(`public${href}`), `linked asset exists: ${href}`);
for (const [file, size] of [['favicon-16x16.png', 16], ['favicon-32x32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]]) {
  assert.deepEqual(dims(`public/${file}`), [size, size], `${file} is ${size}x${size}`);
}
assert.ok(fs.readFileSync('public/favicon.ico').readUInt16BE(0) === 0 && fs.readFileSync('public/favicon.ico').readUInt16LE(2) === 1, 'favicon.ico is an ICO');
const manifest = JSON.parse(fs.readFileSync('public/site.webmanifest', 'utf8'));
assert.equal(manifest.name, 'PropBetEdge NHL');
assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
for (const i of manifest.icons) {
  const [iw, ih] = dims(`public${i.src}`);
  assert.equal(`${iw}x${ih}`, i.sizes, `manifest icon ${i.src} matches declared size`);
}

// JSON-LD: parses, truthful types only, no ratings/reviews/offers claims
const ld = all(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
assert.equal(ld.length, 1, 'one JSON-LD block');
const graph = JSON.parse(ld[0][1])['@graph'];
assert.deepEqual(graph.map(n => n['@type']).sort(), ['Organization', 'WebApplication', 'WebPage', 'WebSite']);
const flat = JSON.stringify(graph);
for (const banned of ['aggregateRating', 'review', 'offers', 'award', 'interactionStatistic']) assert.ok(!flat.includes(banned), `no ${banned} claims`);
for (const node of graph) if (node.url) assert.ok(node.url.startsWith('https://'), 'absolute https urls');

console.log('identity checks: PASS');
