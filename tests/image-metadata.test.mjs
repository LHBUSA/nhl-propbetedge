// Every ImageObject in the shipped JSON-LD follows the network image-rights contract
// (propbetedge-news-site docs/IMAGE_METADATA_CONTRACT.md): owned art says PropBetEdge,
// the social card also credits the Pexels photo it is built on, nothing else is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const images = [];
(function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object') { if (o['@type'] === 'ImageObject') images.push(o); Object.values(o).forEach(walk); }
})(graph);

test('logo is PropBetEdge art', () => {
  const logo = images.find((i) => i.url.endsWith('/icon-512.png'));
  assert.deepEqual(logo.creator, { '@type': 'Organization', name: 'PropBetEdge' });
  assert.equal(logo.copyrightNotice, '© 2026 PropBetEdge');
});

test('social card credits the Pexels hero photo it is composited on', () => {
  const card = images.find((i) => i.url.endsWith('/og/propbetedge-nhl-1200x630.jpg'));
  assert.equal(card.creator.name, 'PropBetEdge');
  assert.equal(card.copyrightNotice, '© 2026 PropBetEdge. Photo: Tony Schnagl / Pexels License');
  assert.equal(card.acquireLicensePage, 'https://www.pexels.com/photo/a-person-ice-skating-on-ice-rink-6468935/');
  assert.equal(card.width, 1200);
  assert.equal(card.height, 630);
});
