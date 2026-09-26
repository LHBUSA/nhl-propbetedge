// NHL Skater DNA card (research, behind PUBLICATION_BLOCKED_RIGHTS_REVIEW).
// Fixture is SYNTHETIC: invented players and numbers, no real NHL data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DNA_PUBLICATION_GATE, renderGoalieDnaNotice, renderSkaterDna } from '../src/components/player-dna.js';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/nhl-dna-synthetic.json', import.meta.url), 'utf8'));
const alpha = fx.alpha.snapshots;
const ranked = alpha[3];          // 2025-26, ranked
const early = alpha[4];           // 2026-27, early season
const history = fx.alpha.history;
const section = (html, cls) => {
  const i = html.indexOf(`class="${cls}"`);
  if (i < 0) return '';
  const end = html.indexOf('</div>\n  <div class="nhl-dna__dims">', i);
  return html.slice(i, end > i ? end : undefined);
};
const traitNames = html => [...section(html, 'nhl-dna__traits').matchAll(/nhl-dna__trait--(strong|watch)"><span>([^<]+)<\/span>/g)].map(m => [m[1], m[2]]);

test('traits render verbatim from the snapshot (never recomputed)', () => {
  const html = renderSkaterDna({ snapshot: ranked, history });
  assert.deepEqual(traitNames(html), [['strong', 'Shot Generation'], ['strong', 'Playmaking'], ['watch', 'Physicality']]);
  // mutate the scores: the rendered traits must still follow snapshot.traits only
  const tampered = structuredClone(ranked);
  tampered.dimensions.faceoffs.score = 99;
  assert.deepEqual(traitNames(renderSkaterDna({ snapshot: tampered })), traitNames(html));
});

test('no 34-66 dimension is labelled a strength or watch area; PROXY 95 is not a headline', () => {
  const html = renderSkaterDna({ snapshot: ranked, history });
  const names = traitNames(html).map(t => t[1]);
  assert.ok(!names.includes('Finishing'), 'finishing 58 is mid-band');
  assert.ok(!names.includes('Shot Location'), 'PROXY never headlines');
  assert.match(html, /data-dim="shot_location"[^>]*>[\s\S]*?nhl-dna__chip--proxy/);
  assert.equal(ranked.dimensions.shot_location.score, 95);
});

test('zero traits is a valid, neutral result', () => {
  const html = renderSkaterDna({ snapshot: fx.bravo.snapshot });
  assert.match(html, /No dimension clears the strength \(67\+\) or watch \(33 and below\) bands/);
  assert.equal(traitNames(html).length, 0);
});

test('unqualified: measurements shown, no percentiles, no traits', () => {
  const html = renderSkaterDna({ snapshot: fx.charlie.snapshot });
  assert.match(html, /Not yet qualified/);
  assert.match(html, /Raw measurements are shown; percentiles are withheld/);
  assert.match(html, /nhl-dna__measured"><b>1\.50 \/60<\/b>/);
  assert.ok(!/nhl-dna__bar"/.test(html), 'no percentile bars');
  assert.ok(!/nhl-dna__scale/.test(html), 'no percentile scale when nothing is ranked');
  assert.equal(traitNames(html).length, 0);
  assert.match(html, /Not applicable to defensemen/);
  assert.match(html, /No regular power-play role/);
});

test('early season: banner, measured values, percentiles and traits withheld', () => {
  const html = renderSkaterDna({ snapshot: early, history, season: 20262027 });
  assert.match(html, /Early season\.<\/b> Raw measurements are shown\. Percentiles and traits are withheld until clubs average 20 games/);
  assert.ok(!/nhl-dna__bar"/.test(html));
  assert.match(html, /data-dna-season="20262027"[^>]*aria-selected="true"/);
});

test('gaps render as gaps with a plain-language reason, never as zero', () => {
  const html = renderSkaterDna({ snapshot: alpha[0], history });
  assert.match(html, /data-dim="physicality"[\s\S]*?Not tracked reliably before 2024-25/);
  const phys = history.trends.find(t => t.key === 'physicality');
  assert.equal(phys.points[0].score, null);
  assert.ok(!/nhl-dna__cell" style="--v:0">0</.test(html), 'a missing season is not drawn as 0');
  assert.match(renderSkaterDna({ snapshot: fx.bravo.snapshot }), /No regular faceoff role/);
});

test('DNA over time: summary read verbatim; unranked season shown as measured only', () => {
  const html = renderSkaterDna({ snapshot: early, history, season: 20262027 });
  assert.match(html, /Summary uses ranked forward seasons only \(2022-23, 2023-24, 2024-25, 2025-26\)/);
  assert.ok(!/Summary uses[^<]*2026-27/.test(html), 'the unranked season is not in the summary basis');
  assert.match(html, /Biggest gain<\/span><b>Shot Blocking <em>\+10<\/em>/);
  assert.match(html, /Biggest drop<\/span><b><small>None of 10\+ points<\/small>/);
  assert.match(html, /nhl-dna__cell is-gap" title="Measured only \(season not ranked\)">meas\./);
  assert.match(html, /nhl-dna__cell--head is-unranked/);
});

test('focus mode is a data attribute; the exact season table lists every season', () => {
  const html = renderSkaterDna({ snapshot: ranked, history, focus: 'finishing' });
  assert.match(html, /aria-label="DNA over time" data-focus="finishing"/);
  assert.match(html, /nhl-dna__trow is-focus" data-dim="finishing"/);
  for (const s of ['2022-23', '2023-24', '2024-25', '2025-26', '2026-27']) assert.ok(html.includes(`<th scope="col" class="num">${s}`), s);
});

test('penalty differential carries the home/road/officiating caveat; attribution is PropSports', () => {
  const html = renderSkaterDna({ snapshot: ranked });
  assert.match(html, /home\/road and officiating effects/);
  assert.match(html, /Data · PropSports/);
});

test('no goalie DNA tab: only SKATER DNA; goalie kind renders nothing', () => {
  const html = renderSkaterDna({ snapshot: ranked });
  assert.equal((html.match(/class="nhl-dna__tab[ "]/g) || []).length, 1);
  assert.ok(!/GOALIE DNA/.test(html));
  assert.equal(renderSkaterDna({ snapshot: { ...ranked, kind: 'goalie' } }), '');
  assert.match(renderGoalieDnaNotice(), /Goalie DNA is not released/);
});

test('rights gate: the component is not imported by any page, route or module', () => {
  assert.equal(DNA_PUBLICATION_GATE, 'PUBLICATION_BLOCKED_RIGHTS_REVIEW');
  const root = new URL('../src/', import.meta.url);
  const hits = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs|css|html)$/.test(e.name) && !/player-dna\.(js|css)$/.test(e.name)) {
        const t = fs.readFileSync(p, 'utf8');
        if (/player-dna/.test(t)) hits.push(p);
      }
    }
  };
  walk(root.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  if (/player-dna/.test(index)) hits.push('index.html');
  assert.deepEqual(hits, [], 'mount only after the owner clears the rights review');
});

test('the synthetic fixture contains no real-player ids', () => {
  const ids = new Set([...alpha, fx.bravo.snapshot, fx.charlie.snapshot].map(s => s.player_id));
  for (const id of ids) assert.ok(id >= 9990000 && id < 9999999, `synthetic id ${id}`);
  assert.match(fx.note, /SYNTHETIC/);
});
