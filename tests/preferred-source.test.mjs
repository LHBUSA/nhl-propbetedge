// Google Preferred Sources: nhl.propbetedge.ai is not a source Google lists,
// so the footer control deeplinks to the parent propbetedge.ai and never loads the SDK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preferredSourceTarget, renderPreferredSource } from '../src/components/preferred-source.js';

test('nhl host targets the parent source without the SDK', () => {
  assert.deepEqual(preferredSourceTarget('nhl.propbetedge.ai'), { source: 'propbetedge.ai', sdk: false });
  assert.deepEqual(preferredSourceTarget('nhl-propbetedge-git-x.vercel.app'), { source: 'propbetedge.ai', sdk: false });
});

test('footer control is our own link to the documented deeplink', () => {
  const html = renderPreferredSource({ surface: 'footer', sport: 'nhl' });
  assert.match(html, /href="https:\/\/www\.google\.com\/preferences\/source\?q=propbetedge\.ai"/);
  assert.match(html, /data-pbe-preferred-source/);
  assert.match(html, /data-sport="nhl"/);
  assert.doesNotMatch(html, /google-add-preferred-source-btn/);
});

test('premium footer renders it once and index.html never loads publisher.js', () => {
  const src = fs.readFileSync('src/components/chrome-upgrade.js', 'utf8');
  assert.equal(src.match(/renderPreferredSource\(/g).length, 1);
  assert.doesNotMatch(fs.readFileSync('index.html', 'utf8'), /publisher\.js/);
});

test('upgradeChrome actually renders the control into the footer (runtime, not text)', async () => {
  const footer = { innerHTML: '', classList: { s: new Set(), contains(c) { return this.s.has(c); }, add(c) { this.s.add(c); } } };
  globalThis.document = { querySelector: (sel) => (sel === '.footer' ? footer : null) };
  try {
    const { upgradeChrome } = await import('../src/components/chrome-upgrade.js');
    upgradeChrome();
    assert.equal(footer.innerHTML.match(/data-pbe-preferred-source/g)?.length, 1);
    assert.match(footer.innerHTML, /Add as preferred source/);
  } finally {
    delete globalThis.document;
  }
});
