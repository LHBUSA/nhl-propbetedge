// Turns a real Pro-tier nhl-metrics game-intel payload into a SYNTHETIC test
// fixture safe for this public repo: same shape, but every PBE-proprietary
// number (Goalie Form, fatigue scores, player fatigue, WinHL, edges) is replaced
// by a deterministic pseudo-random value. Public schedule facts are kept.
//   node scripts/redact-intel-fixture.mjs tests/fixtures/local/<real>.json tests/fixtures/<out>.json
import fs from 'node:fs';

const [src, out] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(src, 'utf8'));
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const PROPRIETARY = new Set(['score', 'subscore', 'contribution', 'average', 'points', 'adjusted', 'rank_league', 'percentile', 'winhl', 'value', 'coverage']);
const fake = (k, v) => {
  if (k === 'rank_league') return 1 + Math.floor(rnd() * 400);
  if (k === 'coverage') return v;
  if (Math.abs(v) <= 1 && !Number.isInteger(v)) return Math.round(rnd() * 1000) / 1000;
  return Math.round(rnd() * Math.max(10, Math.abs(v) * 1.5) * 10) / 10 * Math.sign(v || 1);
};
function scrub(node, inside) {
  if (Array.isArray(node)) return node.map(n => scrub(n, inside));
  if (!node || typeof node !== 'object') return node;
  const o = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'facts') o[k] = v; // public schedule facts
    else if (typeof v === 'number' && inside && PROPRIETARY.has(k)) o[k] = fake(k, v);
    else o[k] = scrub(v, inside || ['form', 'fatigue', 'player_fatigue', 'winhl_lineup'].includes(k));
  }
  return o;
}
for (const side of Object.values(data.sides)) for (const k of ['goalies', 'fatigue', 'player_fatigue', 'winhl_lineup']) side[k] = scrub(side[k], k !== 'goalies');
// Edges: synthetic values with the same favoured side as the original, so the
// fixture still exercises both directions.
for (const [k, e] of Object.entries(data.edges)) {
  if (k === 'shot_environment' || !e?.available) continue;
  const hi = Math.round((55 + rnd() * 30) * 10) / 10, lo = Math.round((25 + rnd() * 25) * 10) / 10;
  const awayHigh = (e.favors === 'away') === (k !== 'fatigue'); // fatigue: lower is better
  e.away = awayHigh ? hi : lo; e.home = awayHigh ? lo : hi; e.diff = Math.round((e.away - e.home) * 10) / 10;
}
data._fixture_note = 'SYNTHETIC TEST FIXTURE: shape of a real Pro-tier payload; every PBE-proprietary number is pseudo-random. Not PBE output.';
fs.writeFileSync(out, JSON.stringify(data));
