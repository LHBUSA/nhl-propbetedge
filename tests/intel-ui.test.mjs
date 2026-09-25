// PBE intelligence UI: every value on these surfaces comes from the nhl-metrics
// payload; a locked (free) value never renders as a number and a null never
// renders as zero. Fixtures are REAL payloads: the free one captured from
// https://nhl-api.propbetedge.ai/nhl/intel/game/<id> on 2026-09-25, the Pro one
// produced by nhl-metrics for a completed 2025-26 game (full serialization).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.json') && url.includes('/src/')) return { format: 'json', shortCircuit: true, source: fs.readFileSync(fileURLToPath(url), 'utf8') };
    return nextLoad(url, context);
  }
});

const read = rel => JSON.parse(fs.readFileSync(new URL(`./fixtures/${rel}`, import.meta.url), 'utf8'));
const free = read('intel-free-2026010051.json');
const pro = read('intel-pro-2025021282.json');

const { fmtScore, scoreRing, fatigueChips, pointComponents, weightedComponents, lockPanel, edgeLine } = await import('../src/components/intel-ui.js');
const { goalieIntelSection, goalieMatchup } = await import('../src/components/goalie-intel.js');
const { gameIntelPanel, gameIntelStrip } = await import('../src/components/game-intel.js');

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('null renders as unavailable, never as zero', () => {
  assert.equal(fmtScore(null), '—');
  assert.equal(fmtScore(undefined), '—');
  assert.equal(fmtScore(0), '0');
  assert.match(scoreRing(null, { label: 'x' }), /unavailable/);
  assert.match(scoreRing(null, { label: 'x' }), /iq-ring--na/);
  assert.match(fatigueChips(null), /unavailable/);
  assert.match(weightedComponents([{ key: 'a', label: 'A', weight: 0.5, subscore: null, status: 'unavailable', reason: 'no sample' }]), /Unavailable[\s\S]*no sample/);
  assert.match(pointComponents([{ key: 'k', label: 'K', rule: 'r', points: null, status: 'unavailable', reason: 'split not published' }]), /—[\s\S]*split not published/);
});

test('free game payload: facts render, scores are Pro prompts', () => {
  const html = goalieIntelSection(free, { pro: false, big: true });
  assert.match(html, /NHL PRO/);
  assert.match(html, /data-open-nhl-pro/);
  assert.doesNotMatch(html, /Goalie Form components/, 'no Form component breakdown for free');
  // Workload facts and the 14-day timeline are free.
  assert.match(html, /gi-timeline/);
  assert.match(html, /NHL Edge save % by shot location/);
  const panel = gameIntelPanel(free, { pro: false, props: { count: 0, markets: new Set() } });
  assert.match(panel, /Fatigue score \+ edge · Pro/);
  assert.match(panel, /Back-to-back/, 'the NYR back-to-back fact is free');
  assert.match(panel, /No book has posted player markets/);
  assert.match(panel, /no combined confidence score/i);
});

test('free payload carries no numeric PBE score for the panels to leak', () => {
  const walk = (node, out = []) => {
    if (Array.isArray(node)) node.forEach(n => walk(n, out));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) { if (['score', 'contribution', 'subscore'].includes(k) && typeof v === 'number') out.push(k); walk(v, out); }
    return out;
  };
  assert.deepEqual(walk(free), []);
  assert.equal(free.tier, 'free');
});

test('Pro payload: Form rings, edges and components render', () => {
  const html = goalieIntelSection(pro, { pro: true, big: true });
  assert.match(html, /Goalie Form components/);
  assert.doesNotMatch(html, /Unlock with NHL Pro/);
  const m = goalieMatchup(pro, { pro: true });
  assert.match(text(m), /TBL \+\d/, 'the goalie edge names the favoured side');
  const panel = gameIntelPanel(pro, { pro: true });
  assert.match(panel, /Lower schedule\/workload burden/);
  assert.match(panel, /Average WinHL of the last dressed lineup/);
  assert.doesNotMatch(panel, /Unlock with NHL Pro/);
});

test('team model probability is never invented', () => {
  const panel = gameIntelPanel(pro, { pro: true });
  assert.match(panel, /Team win probabilities come only from a released PBE Picks model; none is released\./);
  assert.doesNotMatch(panel, /win probability \d/i);
});

test('an UNKNOWN starter never gets a goalie edge', () => {
  assert.equal(free.edges.goalie_form.available, false);
  const html = edgeLine({ label: 'PBE Goalie Form', available: false, reason: 'At least one starter is UNKNOWN' }, { away: { abbrev: 'NYR' }, home: { abbrev: 'NYI' } });
  assert.match(html, /UNKNOWN/);
});

test('strip + lock markup', () => {
  assert.match(gameIntelStrip(free, { pro: false }), /Full game intelligence/);
  assert.match(lockPanel('T', 'C'), /Unlock with NHL Pro/);
});
