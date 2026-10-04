// Footer parity with the canonical PropBetEdge family registry (owner decision 2026-10-03).
// src/lib/family.json is vendored verbatim from LHBUSA/propbetedge-workers shared/network/family.json;
// this test fails if src/lib/network.js (the footer + sheet source) drifts from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PBE_NETWORK } from '../src/lib/network.js';
import { ALL_ACCESS_URL } from '../src/lib/pbe-membership.js';

const FAMILY = JSON.parse(fs.readFileSync(new URL('../src/lib/family.json', import.meta.url), 'utf8'));
const FOOTERS = ['src/components/shell.js', 'src/components/chrome-upgrade.js'];

test('sports: same set, order and canonical URLs as the family registry', () => {
  assert.deepEqual(PBE_NETWORK.sports.map((s) => s.id), FAMILY.sports.map((s) => s.key));
  assert.deepEqual(PBE_NETWORK.sports.map((s) => s.href), FAMILY.sports.map((s) => s.url));
});

test('Predictions is a separate non-sport product with the canonical URL', () => {
  assert.deepEqual(PBE_NETWORK.products.map((p) => [p.id, p.href]), FAMILY.products.map((p) => [p.key, p.url]));
  assert.ok(PBE_NETWORK.products.every((p) => p.kind === 'product'));
  assert.ok(!PBE_NETWORK.sports.some((s) => s.id === 'predictions' || /predictions\./.test(s.href)));
});

test('network URLs: PropBetEdge home, All Access, Learn', () => {
  const want = Object.fromEntries(FAMILY.network.map((n) => [n.key, n.url]));
  assert.equal(PBE_NETWORK.hub, want.hub);
  assert.equal(ALL_ACCESS_URL, want.all_access);
  assert.equal(PBE_NETWORK.learn, want.learn);
});

for (const file of FOOTERS) {
  test(`${file}: family URLs come only from the registry; products rendered once, outside the sports list`, () => {
    const src = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /f1\.propbetedge\.ai|predictions\.propbetedge\.ai/);
    for (const h of FAMILY.retired_hosts) assert.ok(!src.includes(h), h);
    assert.doesNotMatch(src, /http:\/\/[^'"`]*propbetedge\.ai/);
    assert.doesNotMatch(src, /\b(11|eleven) sports\b/i);
    assert.match(src, /PBE_NETWORK\.sports\.map/);
  });
}

test('premium footer renders Predictions exactly once, in its own Intelligence row', () => {
  const src = fs.readFileSync('src/components/chrome-upgrade.js', 'utf8');
  const footer = src.slice(src.indexOf('function premiumFooter'), src.indexOf('export function upgradeChrome'));
  assert.equal((footer.match(/PBE_NETWORK\.products\.map/g) || []).length, 1);
  assert.equal((footer.match(/PBE_NETWORK\.sports\.map/g) || []).length, 1);
  assert.match(footer, /footer-premium__intel[\s\S]*PBE_NETWORK\.products\.map/);
  const shell = fs.readFileSync('src/components/shell.js', 'utf8');
  const basic = shell.slice(shell.indexOf('<footer'), shell.indexOf('</footer>'));
  assert.equal((basic.match(/PBE_NETWORK\.products\.map/g) || []).length, 1);
});
