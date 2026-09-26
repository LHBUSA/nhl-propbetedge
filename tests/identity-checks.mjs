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
const metadataHead = head.replace(/<script[\s\S]*?<\/script>/g, '');
assert.ok(!/localhost|127\.0\.0\.1|vercel\.app|workers\.dev/.test(metadataHead), 'no dev/preview hosts in head metadata');
assert.match(head, /host\.endsWith\('\.vercel\.app'\)/, 'analytics explicitly stays off on Vercel preview hosts');
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
// PropBetEdge's network X account; stale identities never return anywhere in the shell.
assert.equal(one('name', 'twitter:site'), '@PROPBETEDGE');
assert.equal(html.split('"https://x.com/PROPBETEDGE"').length - 1, 1, 'Organization sameAs once');
assert.doesNotMatch(html, /MLBHRALERTSPBE|propbetedgeai|twitter\.com\/intent|x\.com\/intent\/tweet/i);

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

// Landing-image preload: the boot script's route -> backdrop map must match
// src/lib/backdrops.js + the router, and every preloaded file must exist.
{
  const bd = head.match(/var BD = (\{[^}]+\})/);
  assert.ok(bd, 'boot script declares its backdrop map');
  const bootMap = JSON.parse(bd[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":'));
  const lib = fs.readFileSync('src/lib/backdrops.js', 'utf8');
  const routeKey = JSON.parse(lib.match(/const ROUTE_KEY = (\{[\s\S]*?\});/)[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":'));
  const photoKeys = [...lib.matchAll(/^\s{2}(\w+):\s+\{ pos:/gm)].map(m => m[1]);
  const router = fs.readFileSync('src/lib/router.js', 'utf8');
  const routes = router.split('\n').filter(l => l.includes('pattern:') && l.includes("id: '")).map(l => {
    const after = l.split('pattern: /^')[1].slice(2); // drop the escaped leading slash
    return [after.match(/^[a-z-]*/)[0], l.match(/id: '([a-z]+)'/)[1]];
  });
  assert.ok(routes.length >= 15, 'router table parsed');
  for (const [seg, id] of routes) {
    const key = routeKey[id];
    const expected = key && photoKeys.includes(key) ? key : undefined;
    if (!seg) continue; // Ice Board: hero preload
    assert.equal(bootMap[seg], expected, `boot preload for #/${seg} matches backdrops.js (${expected || 'none'})`);
  }
  for (const key of photoKeys) for (const size of ['800', '1400', '2000', 'm-700']) for (const ext of ['avif', 'webp']) {
    assert.ok(fs.existsSync(`public/assets/nhl/backdrops/${key}-${size}.${ext}`), `backdrop ${key}-${size}.${ext} exists`);
  }
}

console.log('identity checks: PASS');
