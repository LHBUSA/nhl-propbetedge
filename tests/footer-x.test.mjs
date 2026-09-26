// Every NHL footer template shows PropBetEdge's own X account exactly once.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PBE_NETWORK } from '../src/lib/network.js';

test('network registry carries the canonical X account', () => {
  assert.equal(PBE_NETWORK.x, 'https://x.com/PROPBETEDGE');
  assert.equal(PBE_NETWORK.xHandle, '@PROPBETEDGE');
});

for (const file of ['src/components/shell.js', 'src/components/chrome-upgrade.js']) {
  test(`${file}: one footer X link, new tab, safe rel, accessible name`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const anchors = [...src.matchAll(/<a [^>]*href="\$\{PBE_NETWORK\.x\}"[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
    assert.equal(anchors.length, 1);
    assert.match(anchors[0], /target="_blank" rel="noopener noreferrer"/);
    assert.match(anchors[0], /aria-label="Follow PropBetEdge on X \(\$\{PBE_NETWORK\.xHandle\}\)"/);
    assert.doesNotMatch(src, /MLBHRALERTSPBE|propbetedgeai|X \/ Twitter/i);
  });
}
