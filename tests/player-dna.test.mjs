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
const traitNames = html => [...html.matchAll(/nhl-dna__trait--(strong|watch)" data-dim="[^"]+"><b class="nhl-dna__trait-score">[^<]*<\/b><span class="nhl-dna__trait-name">([^<]+)<\/span>/g)].map(m => [m[1], m[2]]);

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
  assert.match(html, /Summary uses ranked forward seasons only \(2022–23, 2023–24, 2024–25, 2025–26\)/);
  assert.ok(!/Summary uses[^<]*2026–27/.test(html), 'the unranked season is not in the summary basis');
  assert.match(html, /Biggest gain<\/span><b>Shot Blocking <em>\+10<\/em>/);
  assert.match(html, /Biggest drop<\/span><b><small>No high-confidence move of 10\+ points<\/small>/);
  assert.match(html, /nhl-dna__hcell is-gap[^"]*" title="2026–27 · [^"]*Measured only \(season not ranked\)">—</);
  assert.match(html, /<th scope="col" class="is-unranked"[^>]*>2026–27<small>measured<\/small>/);
});

test('focus mode is a data attribute; the exact season table lists every season', () => {
  const html = renderSkaterDna({ snapshot: ranked, history, focus: 'finishing' });
  assert.match(html, /aria-label="DNA over time" data-focus="finishing"/);
  assert.match(html, /<tr class="is-focus" data-dim="finishing">/);
  assert.match(html, /nhl-dna__traitbtn is-active" data-dna-focus="finishing" aria-pressed="true"/);
  for (const s of ['2022–23', '2023–24', '2024–25', '2025–26', '2026–27']) assert.ok(html.includes(`<th scope="col" class="num">${s}`), s);
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

test('mount allowlist: component <- lib/player-dna-mount.js <- pages/player.js only; css <- main.js', () => {
  assert.equal(DNA_PUBLICATION_GATE, 'PUBLICATION_BLOCKED_RIGHTS_REVIEW');
  const root = new URL('../src/', import.meta.url);
  const hits = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs|css|html)$/.test(e.name) && !/player-dna\.(js|css)$/.test(e.name)) {
        const t = fs.readFileSync(p, 'utf8');
        if (/player-dna/.test(t)) hits.push(path.relative(root.pathname.replace(/^\/([A-Za-z]:)/, '$1'), p).split(path.sep).join('/'));
      }
    }
  };
  walk(root.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  assert.deepEqual(hits.sort(), ['lib/player-dna-mount.js', 'main.js', 'pages/player.js']);
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/player-dna/.test(index));
});

test('the synthetic fixture contains no real-player ids', () => {
  const ids = new Set([...alpha, fx.bravo.snapshot, fx.charlie.snapshot].map(s => s.player_id));
  for (const id of ids) assert.ok(id >= 9990000 && id < 9999999, `synthetic id ${id}`);
  assert.match(fx.note, /SYNTHETIC/);
});

// ---------------------------------------------------------------- V2 visual system
const tag = (html, re) => (html.match(re) || []).length;
test('V2 hero: identity + DNA SIGNATURE shows exactly the stored strongest traits', () => {
  const html = renderSkaterDna({ snapshot: ranked, history, player: { name: 'Synth Alpha Full', team: 'AAA', identityHtml: '<span class="pid">ID</span>' } });
  assert.match(html, /<h3 class="nhl-dna__name">Synth Alpha Full<\/h3>/);
  assert.match(html, /<span class="pid">ID<\/span>/, 'identity chip comes from the page (existing headshot component)');
  const sig = [...html.matchAll(/nhl-dna__sig-score">(\d+)<\/b><span>([^<]+)<\/span>/g)].map(m => [Number(m[1]), m[2]]);
  assert.deepEqual(sig.map(x => x[1]), ranked.traits.strongest.map(k => ({ shot_generation: 'SHOT GENERATION', playmaking: 'PLAYMAKING' })[k]));
  assert.deepEqual(sig.map(x => x[0]), ranked.traits.strongest.map(k => ranked.dimensions[k].score));
  assert.match(html, /400 qualified forwards · \d+ GP · [\d,.]+ TOI/);
});

test('V2 fingerprint: exactly the stored scores, gaps are gaps, no overall score, text equivalent', () => {
  const html = renderSkaterDna({ snapshot: ranked, history });
  const scoredDims = Object.entries(ranked.dimensions).filter(([, d]) => d.score !== null);
  assert.equal(tag(html, /class="nhl-dna__puck/g), scoredDims.length, 'one puck per stored score');
  for (const [k, d] of scoredDims) assert.match(html, new RegExp(`data-dim="${k}"><title>[^<]* · ${d.score} · `));
  assert.match(html, /<div class="nhl-dna__sr"><table><caption>DNA fingerprint values/);
  assert.match(html, /role="img" aria-label="DNA fingerprint: /);
  assert.ok(!/overall|composite|DNA score/i.test(html), 'no overall score anywhere');
  const gap = structuredClone(ranked); gap.dimensions.faceoffs.score = null; gap.dimensions.faceoffs.status = 'NOT_APPLICABLE'; gap.dimensions.faceoffs.reason = 'NO_FACEOFF_ROLE';
  const g = renderSkaterDna({ snapshot: gap });
  assert.equal(tag(g, /class="nhl-dna__puck/g), scoredDims.length - 1);
  assert.ok(!/nhl-dna__shape/.test(g), 'no filled shape when an axis is missing');
  assert.match(g, /nhl-dna__gapmark[^>]*>—<title>Faceoffs · No regular faceoff role/);
  assert.match(renderSkaterDna({ snapshot: fx.charlie.snapshot }), /nhl-dna__print is-empty/);
  assert.equal(tag(renderSkaterDna({ snapshot: fx.charlie.snapshot }), /class="nhl-dna__puck/g), 0);
});

test('V2 proxy is visually distinct in the fingerprint, rows, trajectory and heatmap', () => {
  const html = renderSkaterDna({ snapshot: ranked, history, focus: 'shot_location' });
  assert.match(html, /nhl-dna__spoke is-proxy/);
  assert.match(html, /nhl-dna__puck is-proxy" [^>]*data-dim="shot_location"/);
  assert.match(html, /nhl-dna__dim-row is-proxy" data-dim="shot_location"[\s\S]*?nhl-dna__scale-track is-proxy[\s\S]*?PROXY · MEDIUM CONFIDENCE/);
  assert.match(html, /nhl-dna__traj is-proxy/);
  assert.match(html, /nhl-dna__hcell is-proxy/);
});

test('V2 dimension rows: puck marker at the stored score + confidence text; evidence lists raw value, percentile, peers', () => {
  const html = renderSkaterDna({ snapshot: ranked, history });
  const d = ranked.dimensions.shot_generation;
  assert.match(html, new RegExp(`data-dim="shot_generation"[\\s\\S]*?nhl-dna__marker" style="left:${d.score}%"[\\s\\S]*?nhl-dna__score">${d.score}<\\/span><small class="nhl-dna__conf[^>]*>HIGH CONFIDENCE`));
  assert.match(html, /HOW THIS SCORE IS BUILT/);
  const c = d.components.sog_per60;
  const ord = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`;
  assert.match(html, new RegExp(`Shots on goal /60</span>\\s*<b class="nhl-dna__ev-val">${Number(c.value).toFixed(2)} /60</b>\\s*<span class="nhl-dna__ev-pct">${ord(c.percentile)} percentile <small>· ${c.n} peers</small>`));
});

test('V2 trajectory: fixed 0–100 axis, stored points only, never bridges a gap, current season emphasized', () => {
  const html = renderSkaterDna({ snapshot: ranked, history, focus: 'physicality' });
  const phys = history.trends.find(t => t.key === 'physicality');
  // count within ONE drawing (the full variant; the compact phone variant is identical data)
  const fig = html.slice(html.indexOf('nhl-dna__trajsvg--full'), html.indexOf('</svg>', html.indexOf('nhl-dna__trajsvg--full')));
  const compact = html.slice(html.indexOf('nhl-dna__trajsvg--compact'), html.indexOf('</svg>', html.indexOf('nhl-dna__trajsvg--compact')));
  assert.equal(tag(compact, /class="nhl-dna__traj[ "]/g), tag(fig, /class="nhl-dna__traj[ "]/g), 'compact variant draws the same segments');
  for (const v of [0, 33, 67, 100]) assert.match(fig, new RegExp(`class="nhl-dna__tick"[^>]*>${v}<`));
  let expected = 0;
  for (let i = 0; i + 1 < phys.points.length; i++) if (phys.points[i].score !== null && phys.points[i + 1].score !== null) expected++;
  assert.equal(tag(fig, /class="nhl-dna__traj[ "]/g), expected, 'segments only between adjacent scored seasons');
  assert.equal(tag(fig, /class="nhl-dna__tpt/g), phys.points.filter(p => p.score !== null).length);
  assert.ok(tag(fig, /data-gap=/g) >= 1, 'the gap season is marked, not plotted');
  // the active (current) season label is always emphasized; its dot too when it is scored
  assert.match(fig, /nhl-dna__xlab is-current"[^>]*>2026–27</);
  const h2 = structuredClone(history); h2.active_season = 20252026;
  assert.match(renderSkaterDna({ snapshot: ranked, history: h2, focus: 'shot_generation' }), /nhl-dna__tpt is-current" data-season="20252026"/);
  assert.match(fig, /data-gap="20222023">—<title>2022–23 · Physicality · Not available this season/);
});

test('V2 heatmap: stored score or "—" per cell, never 0 for a gap; tooltip text', () => {
  const html = renderSkaterDna({ snapshot: ranked, history });
  const i = html.indexOf('nhl-dna__htable');
  const heat = html.slice(i, html.indexOf('</table>', i));
  for (const t of history.trends) for (const p of t.points) {
    if (p.score === null) continue;
    assert.ok(heat.includes(`style="--v:${p.score}" title="`), `${t.key} ${p.season}`);
  }
  assert.ok(!/nhl-dna__hcell is-gap[^>]*>0</.test(heat));
  assert.match(heat, /title="2022–23 · Shot Generation · \d+(st|nd|rd|th) percentile · (HIGH|MEDIUM|LOW)"/);
});

test('V2 unqualified current season is labelled; footer keeps attribution + model version', () => {
  const latest = alpha[alpha.length - 1];
  const html = renderSkaterDna({ snapshot: fx.charlie.snapshot });
  assert.match(html, /CURRENT SEASON · MEASURED, NOT RANKED/);
  assert.match(renderSkaterDna({ snapshot: latest, history, season: latest.season }), /CURRENT SEASON · EARLY SEASON · MEASURED, NOT RANKED/);
  assert.match(html, /<footer class="nhl-dna__foot">\s*<span>Data · PropSports<\/span>\s*<span>nhl-skater-dna\/1\.0\.0/);
});

// ---- final visual polish (owner 2026-09-26) ---------------------------------
import { trajectory } from '../src/components/player-dna.js';

test('trajectory: a first-season point at 100 is labelled to the right of the dot, clear of the axis 100', () => {
  const h = structuredClone(history);
  const t = h.trends.find(x => x.key === 'shot_generation');
  t.points[0] = { ...t.points.find(p => p.score !== null && p.score !== undefined), season: t.points[0].season, score: 100 };
  const svg = trajectory(h, 'shot_generation', h.active_season);
  const edge = svg.match(/<text class="nhl-dna__tval" x="([\d.]+)" y="[\d.]+" text-anchor="start" data-label-edge="left">100<\/text>/);
  assert.ok(edge, 'edge label anchored start');
  const circle = svg.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="\d+"><title>[^<]*100th percentile/);
  assert.ok(circle && Number(edge[1]) > Number(circle[1]), 'label sits right of the dot; the dot itself is unchanged');
});

test('single ranked season: compact Career DNA, no trajectory/heatmap, exact table kept, nothing filled in', () => {
  const one = structuredClone(history);
  const keep = one.summary.ranked_seasons.at(-1);
  one.summary.ranked_seasons = [keep];
  one.summary.biggest_gain = null; one.summary.biggest_drop = null; one.summary.most_volatile = null;
  one.seasons = one.seasons.filter(s => s.season === keep);
  one.trends = one.trends.map(t => ({ ...t, points: t.points.filter(p => p.season === keep) }));
  one.active_season = keep;
  const snapFor = alpha.find(s => s.season === keep);
  const html = renderSkaterDna({ snapshot: snapFor, history: one });
  assert.match(html, /Career DNA <small class="nhl-dna__avail">1 season available<\/small>/);
  assert.doesNotMatch(html, /nhl-dna__trajfig|nhl-dna__heat/);
  assert.match(html, /Exact season table/);
  assert.match(html, /Career trends appear once two seasons are ranked/);
});

test('two or more ranked seasons keep the full career view', () => {
  const html = renderSkaterDna({ snapshot: ranked, history });
  assert.match(html, /nhl-dna__trajfig/);
  assert.match(html, /nhl-dna__heat/);
});
