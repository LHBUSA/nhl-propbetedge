// Kalshi PERPETUALS partner offer (kalshi-partner/2) on NHL: vendored client unchanged, one footer
// mount, same-origin fixed rewrites, fail closed, and no offer economics/referral id in NHL source.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { partnerOffer, normalizeConfig, PARTNER_DISABLED } from '../src/vendor/kalshi/kalshi-partner.js';

const VENDORED = 'src/vendor/kalshi/kalshi-partner.js';
const CANONICAL = 'D:/Workers/propbetedge-workers/workers/propsports-markets/client/kalshi-partner.js';
// SHA-256 (LF) of the canonical client at propbetedge-workers 4c3972a.
const PINNED = '063e631feadb8011fd6e1a3e7cc92908dd7f402f69fd3f5cb0153b5db4b09b7f';
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex');

test('kalshi-partner.js is vendored byte-identical', () => {
  assert.equal(sha(VENDORED), PINNED, 'vendored kalshi-partner.js was edited; re-vendor it from the canonical source');
});

test('vendored kalshi-partner.js matches the canonical file when it is present', { skip: !fs.existsSync(CANONICAL) && 'canonical checkout absent' }, () => {
  assert.equal(sha(VENDORED), sha(CANONICAL), 'canonical kalshi-partner.js changed; re-vendor it and update PINNED');
});

test('same-origin rewrites are fixed paths to propsports-markets only', () => {
  const { rewrites } = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const kx = rewrites.filter(r => r.source.startsWith('/go/kalshi'));
  assert.deepEqual(kx, [
    { source: '/go/kalshi-perps/config', destination: 'https://propsports-markets.sales-fd3.workers.dev/v1/partner/kalshi' },
    { source: '/go/kalshi-perps', destination: 'https://propsports-markets.sales-fd3.workers.dev/go/kalshi-perps' }
  ]);
  // No path params, wildcards or captures: the route can never forward an arbitrary destination.
  for (const r of kx) assert.doesNotMatch(r.source + r.destination, /\/:|\(|\*|\$/);
});

test('exactly one mount: the network footer slot, footer variant, nhl attribution', () => {
  const comp = fs.readFileSync('src/components/kalshi-partner-footer.js', 'utf8');
  assert.match(comp, /placement: 'sport_footer', product: 'nhl', sport: 'nhl'/);
  assert.match(comp, /variant: 'footer'/);
  assert.match(comp, /loadPartnerConfig\(PARTNER_CONFIG_URL\)/);
  assert.match(comp, /'\/go\/kalshi-perps\/config'/);
  const chrome = fs.readFileSync('src/components/chrome-upgrade.js', 'utf8');
  assert.equal((chrome.match(/id="nhl-kxo"/g) || []).length, 1);
  assert.ok(chrome.indexOf('id="nhl-kxo"') > chrome.indexOf('footer-premium__grid'), 'slot sits in the footer');

  // Only the footer component imports the partner client; no picks/game/prop/cast/market file does.
  const files = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs|html|css)$/.test(e.name)) files.push(p.replace(/\\/g, '/')); } };
  walk('src');
  const importers = files.filter(f => f.endsWith('.js') && f !== VENDORED && /from ['"][^'"]*kalshi-partner\.js['"]|import\(['"][^'"]*kalshi-partner\.js/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(importers, ['src/components/kalshi-partner-footer.js']);
  const mounters = files.filter(f => /mountKalshiPartnerFooter\(\)/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(mounters.sort(), ['src/all-access-main.js', 'src/main.js']);
});

test('no referral id, referral URL or offer economics hardcoded in NHL source', () => {
  const files = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else files.push(p.replace(/\\/g, '/')); } };
  walk('src');
  for (const f of [...files, 'index.html', 'all-access.html', 'vercel.json']) {
    if (f === VENDORED) continue;
    const s = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /kalshi\.com\/p\/|referral[=]/i, `${f} carries a referral URL`);
  }
  const comp = fs.readFileSync('src/components/kalshi-partner-footer.js', 'utf8') + fs.readFileSync('src/styles/kalshi-partner.css', 'utf8');
  assert.doesNotMatch(comp, /\$\d|\d+\s?% off|\d+ (months?|years?)\b|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i, 'economics and the referral id live only in the propsports-markets Worker');
});

test('fail closed: disabled or malformed config renders nothing', () => {
  const ctx = { placement: 'sport_footer', product: 'nhl', sport: 'nhl' };
  assert.equal(partnerOffer(PARTNER_DISABLED, ctx, { variant: 'footer' }), '');
  assert.equal(partnerOffer(normalizeConfig(null), ctx, { variant: 'footer' }), '');
  assert.equal(partnerOffer(normalizeConfig({ contract: 'kalshi-partner/2', enabled: true, path: 'https://evil.example/', program: 'perpetuals' }), ctx, { variant: 'footer' }), '');
  const html = partnerOffer(normalizeConfig({ contract: 'kalshi-partner/2', enabled: true, path: '/go/kalshi-perps', program: 'perpetuals' }), ctx, { variant: 'footer' });
  assert.match(html, /class="kxo kxo--footer kxo--generic"/);
  assert.match(html, /href="\/go\/kalshi-perps\?placement=sport_footer&amp;product=nhl&amp;sport=nhl"/);
  assert.match(html, /rel="sponsored noopener noreferrer"/);
});
