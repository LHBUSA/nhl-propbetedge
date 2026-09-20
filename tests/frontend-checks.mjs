// Static guards that run in CI before the build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 1. Data path: browser -> Cloudflare nhl-gateway. Vercel serves static files
// only; the retired /api/nhl, /api/env and /api/odds relays must not return.
// (The route/query allowlist now lives in the gateway: LHBUSA/propsports-api-worker
// nhl-gateway/ + test/nhl-gateway-regression.mjs.)
assert.ok(!fs.existsSync('api'), 'no Vercel API functions: NHL data runs on Cloudflare');
const apiSource = fs.readFileSync('src/lib/api.js', 'utf8');
assert.match(apiSource, /'https:\/\/nhl-api\.propbetedge\.ai'/, 'production gateway is the default data origin');
assert.match(apiSource, /credentials: 'omit'/, 'public data requests never carry cookies');
assert.doesNotMatch(apiSource, /credentials: 'include'/, 'api.js (public data) never sends credentials');
// Credentials go to the gateway only from account.js, and only to /auth or /pro.
{
  const account = fs.readFileSync('src/lib/account.js', 'utf8');
  assert.match(account, /if \(!\/\^\\\/\(auth\|pro\)\\\/\/\.test\(path\)\) throw/, 'account.js refuses non-auth paths');
  assert.doesNotMatch(account, /localStorage|sessionStorage|document\.cookie/, 'account state is never stored or read in the browser');
}

// 1b. PBE Picks is a first-class surface: desktop primary nav AND the mobile
// bottom nav, with a registered route and a page that invents nothing.
{
  const shell = fs.readFileSync('src/components/shell.js', 'utf8');
  assert.match(shell, /id: 'picks', href: '#\/pbe-picks', label: 'PBE Picks'/, 'PBE Picks is in the desktop NAV');
  const navBlock = shell.match(/export const NAV = \[([\s\S]*?)\];/)[1];
  assert.ok(navBlock.includes("id: 'picks'"), 'PBE Picks sits in NAV, not in More');
  const bottom = shell.match(/const BOTTOM = \[([^\]]*)\]/)[1];
  assert.ok(/'picks'/.test(bottom), 'PBE Picks is in the mobile bottom nav');
  assert.ok(!/'news'/.test(bottom), 'News moved out of the mobile bottom nav into More');
  assert.match(fs.readFileSync('src/lib/router.js', 'utf8'), /id: 'picks'/, '#/pbe-picks is routed');

  // No pick, probability or price may be hardcoded into the prediction pages.
  for (const page of ['src/pages/pbe-picks.js', 'src/pages/track.js']) {
    const text = fs.readFileSync(page, 'utf8');
    assert.ok(!/\d{1,3}(?:\.\d+)?\s*%/.test(text), `hardcoded percentage in ${page}`);
    assert.ok(!/(?<![\w.])0\.\d+/.test(text), `hardcoded probability literal in ${page}`);
    assert.ok(!/pick_team\s*[:=]\s*['"]/.test(text), `hardcoded pick in ${page}`);
    assert.ok(!/fetch\s*\(/.test(text), `${page} must read through lib/api.js and lib/account.js`);
  }
}

// 1c. PBE Cast live/replay polish must preserve the live edge and visual team identity.
{
  const cast = fs.readFileSync('src/pages/cast.js', 'utf8');
  const replay = fs.readFileSync('src/components/replay.js', 'utf8');
  const css = fs.readFileSync('src/styles/cast.css', 'utf8');

  assert.match(cast, /replayBar\(state, full, \{ live: \['LIVE', 'INTERMISSION'\]\.includes\(st\.key\) \}\)/, 'live Cast tells replay controls when the source game is live');
  assert.match(cast, /act === 'end' \|\| act === 'live'/, 'Jump to live returns to the canonical live/full cursor');
  assert.match(replay, /data-rp="live">Jump to live<\/button>/, 'live replay exposes a dedicated Jump to live action');
  assert.match(replay, /badgeText = atLiveEdge \? 'Live'/, 'live edge is labelled Live instead of Full game');
  assert.match(cast, /--away:\$\{teamAccent\(g\.teams\.away\.abbrev\)\};--home:\$\{teamAccent\(g\.teams\.home\.abbrev\)\}/, 'Shot Share bars use team accents');
  assert.match(css, /\.cast-col--stats \.cmp-bar \.a \{ background: var\(--away\)/, 'away Shot Share segment uses the actual away team accent');
  assert.match(css, /\.cast-col--stats \.cmp-bar \.h \{ background: var\(--home\)/, 'home Shot Share segment uses the actual home team accent');
  assert.match(css, /\.rink-legend \{[^\n]*color: var\(--pbe-paper\)/, 'shot-map legend uses primary high-contrast text');
  assert.match(cast, /class="pressure-axis"/, 'pressure chart renders a numeric Y-axis');
  assert.match(cast, /Attempts \/ 5 min/, 'pressure chart labels its rolling five-minute unit');
  assert.match(cast, /Peak \$\{max\} attempts in a five-minute window/, 'pressure chart accessibility copy exposes the real peak scale');
  assert.match(css, /\.pc-grid \{/, 'pressure chart renders quantitative grid lines');
  assert.match(css, /\.replay__live \{/, 'Jump to live has a dedicated visible treatment');
}

// 1d. Shot Lab is a first-class live spatial surface, not a PBE Cast alias.
{
  const lab = fs.readFileSync('src/pages/shotlab.js', 'utf8');
  const rink = fs.readFileSync('src/components/rink.js', 'utf8');
  const css = fs.readFileSync('src/styles/pages-lab.css', 'utf8');

  assert.match(lab, /Shot Lab · live spatial telemetry/, 'Shot Lab declares its own live spatial-telemetry identity');
  assert.match(lab, /LIVE SHOT LAB/, 'live games display an explicit Shot Lab live state');
  assert.match(lab, /return 5000;/, 'live Shot Lab polls on a five-second cadence');
  assert.match(lab, /ctx\.board\(today, \{ signal: aborter\.signal, maxAgeMs: 5000 \}\)/, 'bare Shot Lab landing rechecks today before using cached recent games');
  assert.match(lab, /pickDate:[\s\S]*params\.gameId \? null : todayET\(\)/, 'bare Shot Lab date picker defaults to the current ET date');
  assert.match(lab, /function preferredSlateGame\(games, now = Date\.now\(\)\)/, 'Shot Lab has an explicit same-day game priority resolver');
  assert.ok(
    lab.indexOf("['LIVE', 'INTERMISSION'].includes(stateOf(g).key)") < lab.indexOf("['PREGAME', 'SCHEDULED'].includes(stateOf(g).key)")
      && lab.indexOf("['PREGAME', 'SCHEDULED'].includes(stateOf(g).key)") < lab.indexOf("stateOf(g).key === 'FINAL'"),
    'Shot Lab prefers live, then upcoming, then final games on the current slate'
  );
  assert.match(lab, /const preferred = preferredSlateGame\(games\);/, 'bare Shot Lab opens the preferred game from today before historical fallback');
  assert.match(lab, /data-shot-type=/, 'Shot Lab rows expose shot-type cross-filter metadata');
  assert.match(rink, /class="mk-hover-ring"/, 'rink markers carry a dedicated hover halo');
  assert.match(lab, /crossHighlight\(\{ shotId:/, 'attempt rows cross-highlight their exact rink point');
  assert.match(lab, /crossHighlight\(\{ shotType:/, 'shot-type rows cross-highlight matching rink points');
  assert.match(lab, /class="lab-hist__scale mono"/, 'distance profile includes a numeric attempt scale');
  assert.match(lab, /Attempts \/ 5-ft bin/, 'distance profile states its Y-axis unit');
  assert.match(css, /\.lab \.rink-legend \{ color: #fffdf7;/, 'Shot Lab overrides the rink legend to primary high contrast');
  assert.match(css, /\.mk-g\.is-cross-hit \.mk-hover-ring/, 'cross-filtered rink points receive a visible halo');
}

// 1e. Rink: premium spatial surface, with the sports truth untouched.
{
  const rink = fs.readFileSync('src/components/rink.js', 'utf8');
  const castCss = fs.readFileSync('src/styles/cast.css', 'utf8');
  const cast = fs.readFileSync('src/pages/cast.js', 'utf8');

  // -- geometry and precision are frozen
  assert.match(rink, /viewBox="-101 -43\.5 202 87"/, 'rink keeps the regulation 200x85 viewBox');
  assert.match(rink, /preserveAspectRatio="xMidYMid meet"/, 'rink cannot distort at any container size');
  assert.match(castCss, /\.rink-wrap \{[^}]*aspect-ratio: 202 \/ 87/, 'the wrapper aspect ratio matches the viewBox');
  assert.ok(!/toFixed\(|Math\.round\(/.test(rink), 'source shot coordinates are never rounded for display');

  // -- crisp strokes from phone to 4K, asserted on RENDERED output rather than
  //    on source text, because marker attributes are interpolated
  const { renderRink } = await import('../src/components/rink.js');
  const sample = [{
    sort_order: 1, type: 'goal', side: 'home', period: 1, period_type: 'REG', time_in_period: '10:00',
    players: [], strength: null,
    shot: { has_coordinates: true, x: 60, y: 10, target_net_x: 89, shot_type: 'wrist', on_goal: true, unblocked: true, goal: true, shootout: false, distance_ft: 31 }
  }, {
    sort_order: 2, type: 'blocked-shot', side: 'away', period: 1, period_type: 'REG', time_in_period: '09:00',
    players: [], strength: null,
    shot: { has_coordinates: true, x: -40, y: -5, target_net_x: -89, shot_type: 'slap', on_goal: false, unblocked: false, goal: false, shootout: false, distance_ft: 50 }
  }];
  const out = renderRink(sample, { teams: { home: { abbrev: 'STL' }, away: { abbrev: 'DAL' } }, highlight: 1 });
  const svg = out.svg;

  assert.equal(out.plotted, 2, 'the sample renders both attempts');
  for (const cls of ['rk-boards', 'rk-center', 'rk-circle', 'mk-hover-ring', 'mk-ring']) {
    const re = new RegExp(`class="[^"]*${cls}[^"]*"[^>]*vector-effect="non-scaling-stroke"|vector-effect="non-scaling-stroke"[^>]*class="[^"]*${cls}`);
    assert.ok(re.test(svg), `${cls} carries a non-scaling stroke in rendered output`);
  }

  // coordinates survive untouched: 60 stays 60, not 60.00 or 60.000001
  assert.ok(svg.includes('cx="60"'), 'a source x coordinate is rendered verbatim');
  assert.ok(svg.includes('cy="-10"'), 'a source y coordinate is only sign-flipped for SVG, never rounded');

  // -- shared definitions, instantiated rather than duplicated
  assert.match(rink, /<defs>/, 'rink declares a shared defs section');
  assert.match(rink, /<radialGradient id="pbe-ice"/, 'ice surface is a shared gradient, not a flat fill');
  assert.match(rink, /<filter id="pbe-board-depth"/, 'boards read as a physical edge through one shared filter');
  assert.match(rink, /<filter id="pbe-mk-glow"/, 'one shared marker glow exists');
  for (const id of ['pbe-faceoff', 'pbe-nz-dot', 'pbe-crease', 'pbe-net']) {
    assert.match(rink, new RegExp(`<symbol id="${id}"`), `${id} is a reusable symbol`);
  }
  assert.equal((rink.match(/<use href="#pbe-faceoff"/g) || []).length, 4, 'four end-zone faceoff circles are instantiated by reference');
  assert.equal((rink.match(/<use href="#pbe-nz-dot"/g) || []).length, 4, 'four neutral-zone dots are instantiated by reference');
  assert.equal((rink.match(/<filter /g) || []).length, 2, 'exactly two filters exist; a filter is never created per shot');

  // -- semantic zones for future interaction, with no invented analytics
  assert.match(rink, /class="rk-zones"/, 'rink geometry is grouped into semantic zones');
  assert.match(rink, /data-zone="neutral"/, 'the neutral zone is addressable');
  assert.match(rink, /class="rk-markings"/, 'rink markings are their own layer');
  assert.match(castCss, /\.rk-zone-hit \{[^}]*pointer-events: none/, 'zone rectangles never steal a pointer event from a marker');
  assert.ok(!/pointer-events="bounding-box"/.test(rink), 'no unreliable bounding-box hit area is used');

  // -- marker hierarchy and live animation hooks
  assert.match(castCss, /@keyframes rk-arrive/, 'newly arriving attempts have an arrival animation');
  assert.match(castCss, /\.mk-g--arriving \{/, 'the arrival hook is a dedicated class');
  assert.match(castCss, /@keyframes rk-pulse/, 'the highlighted attempt has a controlled pulse');
  assert.match(castCss, /\.mk-g:has\(\.mk--goal\) \{ filter: url\(#pbe-mk-glow\)/, 'goals carry the strongest emphasis via the shared glow');
  assert.match(cast, /function markArrivingShots/, 'the live page decides what is actually new');
  assert.match(cast, /if \(seenShots\.has\(id\)\) continue;/, 'already-drawn attempts never replay the arrival animation');
  assert.ok(!/setInterval|requestAnimationFrame/.test(fs.readFileSync('src/components/rink.js', 'utf8')), 'the rink runs no JS animation loop');

  // -- reduced motion is honoured
  const rm = castCss.slice(castCss.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(castCss.includes('@media (prefers-reduced-motion: reduce)'), 'a reduced-motion fallback exists');
  for (const sel of ['.mk-g--arriving', '.mk-ring', '.shot-trajectory.is-live']) {
    assert.ok(rm.includes(sel), `${sel} is disabled under reduced motion`);
  }

  // -- trajectory ARCHITECTURE only: no fabricated puck paths
  assert.match(castCss, /\.shot-trajectory \{/, 'a trajectory class architecture exists for future real path data');
  assert.match(castCss, /\.shot-trajectory\.is-live \{/, 'the live trajectory variant exists');
  assert.match(castCss, /stroke-dasharray/, 'trajectories animate by dash offset when real data arrives');
  assert.match(rink, /<g class="rk-trajectories"><\/g>/, 'the trajectory layer ships EMPTY: no puck path is invented');
  assert.ok(!/shot-trajectory/.test(rink), 'rink.js renders no trajectory from data we do not hold');

  // -- the existing contract is untouched
  // asserted on rendered output: the marker attribute list grew for the
  // inspector, but the cross-filter contract itself must be identical
  assert.ok(/class="mk-g"[^>]*data-sort="1"/.test(svg), 'markers still carry data-sort');
  assert.ok(/class="mk-g"[^>]*data-shot-type="wrist"/.test(svg), 'markers still carry data-shot-type');
  assert.match(rink, /class="mk-hover-ring"/, 'the hover halo survives');
  assert.match(rink, /pool\.sort\(\(a, b\) => \(a\.type === 'goal'\) - \(b\.type === 'goal'\)\)/, 'goals still render above other attempts');
  assert.match(rink, /omitted\[pos\.why\] \+= 1/, 'omitted-shot accounting is unchanged');
  assert.match(rink, /const flip = Math\.sign\(s\.target_net_x\) !== Math\.sign\(wantNet\)/, 'the normalize-ends transform is unchanged');
  assert.match(castCss, /\.mk--away \{ fill: none/, 'away attempts stay outline-only so home/away survives without colour');
  assert.match(castCss, /\.mk--home \{ fill: var\(--pbe-gold-bright\)/, 'home attempts stay filled');
}

// 1f. Shot inspector: every plotted shot is inspectable, from real fields only.
{
  const rinkSrc = fs.readFileSync('src/components/rink.js', 'utf8');
  const castSrc = fs.readFileSync('src/pages/cast.js', 'utf8');
  const labSrc = fs.readFileSync('src/pages/shotlab.js', 'utf8');
  const castCss2 = fs.readFileSync('src/styles/cast.css', 'utf8');
  const { renderRink: rr, inspectorHtml, rinkInspector } = await import('../src/components/rink.js');

  const play = {
    sort_order: 42, type: 'shot-on-goal', side: 'home', period: 2, period_type: 'REG', time_in_period: '12:41',
    players: [{ role: 'shooter', name: 'Kirill Kaprizov' }],
    strength: { label: '5v4', state: 'PP' },
    score_after: { away: 1, home: 2 },
    shot: { has_coordinates: true, x: 55, y: -12, target_net_x: 89, shot_type: 'Wrist shot', on_goal: true, unblocked: true, goal: false, shootout: false, distance_ft: 24 }
  };
  const svg2 = rr([play], { teams: { home: { abbrev: 'MIN' }, away: { abbrev: 'STL' } } }).svg;

  // -- real-data attributes, and nothing invented
  for (const attr of ['data-sort="42"', 'data-shot-type="Wrist shot"', 'data-shooter="Kirill Kaprizov"',
    'data-team="home"', 'data-result="Shot on goal"', 'data-clock="12:41"', 'data-distance="24"',
    'data-strength="5v4"', 'data-score="1-2"']) {
    assert.ok(svg2.includes(attr), `marker exposes ${attr}`);
  }
  for (const fake of ['xg', 'expected-goal', 'danger', 'quality', 'velocity', 'trajectory-path']) {
    assert.ok(!new RegExp(`data-[a-z-]*${fake}`, 'i').test(svg2), `no fabricated ${fake} attribute`);
  }

  // -- exact coordinates survive the interaction work
  assert.ok(svg2.includes('cx="55"'), 'source x is unchanged by the inspector work');
  assert.ok(svg2.includes('cy="12"'), 'source y is only sign-flipped, never moved or jittered');

  // -- accessible name equivalent to the spec example
  // the FIRST aria-label in the document is the svg's own; read the marker's
  const label = /class="mk-g"[^>]*aria-label="([^"]+)"/.exec(svg2)?.[1] || '';
  for (const part of ['Kirill Kaprizov', 'Shot on goal', '12:41', 'Wrist shot', '24 ft']) {
    assert.ok(label.includes(part), `accessible label carries ${part} (got: ${label})`);
  }
  assert.match(svg2, /<title>/, 'the <title> fallback survives');
  assert.match(svg2, /role="button"/, 'markers are exposed as activatable');

  // -- roving tabindex: focusable without 150 tab stops
  const multi = rr([play, { ...play, sort_order: 43 }, { ...play, sort_order: 44 }], {}).svg;
  assert.equal((multi.match(/tabindex="0"/g) || []).length, 1, 'the shot layer is ONE tab stop');
  assert.equal((multi.match(/tabindex="-1"/g) || []).length, 2, 'the remaining markers are arrow-reachable');

  // -- ONE shared popover, not a node per marker
  assert.match(rinkInspector(), /id="shot-ins"/, 'a single shared inspector element exists');
  assert.equal((rinkInspector().match(/id="shot-ins"/g) || []).length, 1, 'exactly one inspector node');
  assert.ok(!/shot-ins/.test(svg2), 'no tooltip node is emitted per marker');
  assert.match(rinkSrc, /export function attachRinkInspector/, 'one shared inspector controller exists');

  // -- inspector content comes from the marker's real attributes
  const fakeEl = { dataset: { team: 'home', result: 'Goal', period: '2nd', clock: '12:41', shotType: 'Wrist shot', distance: '24', strength: '5v4', score: '1-2', shooter: 'Kirill Kaprizov' } };
  const html = inspectorHtml(fakeEl, { home: { abbrev: 'MIN' } });
  for (const bit of ['MIN', 'Goal', 'Kirill Kaprizov', '12:41', 'Wrist shot', '24 ft', '5v4']) {
    assert.ok(html.includes(bit), `inspector shows ${bit}`);
  }
  const bare = inspectorHtml({ dataset: { team: 'away', result: 'Blocked' } }, {});
  assert.ok(!/ft<\/dd>/.test(bare), 'a shot with no recorded distance shows no distance row');
  assert.ok(!/undefined|null|NaN/.test(bare), 'absent fields are omitted, never rendered as placeholders');

  // -- delegated events, no listener per marker, no loops
  assert.ok(!/querySelectorAll\([^)]*mk-g[^)]*\)[\s\S]{0,80}addEventListener/.test(rinkSrc), 'no per-marker listener binding');
  assert.ok(!/setInterval|requestAnimationFrame/.test(rinkSrc), 'the inspector adds no animation or polling loop');
  assert.equal((rinkSrc.match(/<filter /g) || []).length, 2, 'still exactly two SVG filters; the inspector reuses the shared glow');
  assert.match(castCss2, /\.mk-g\.is-inspected \{[\s\S]{0,120}filter: url\(#pbe-mk-glow\)/, 'the inspected marker reuses the existing glow');

  // -- keyboard: activate and escape
  assert.match(rinkSrc, /e\.key === 'Enter' \|\| e\.key === ' '/, 'Enter and Space activate a marker');
  assert.match(rinkSrc, /e\.key !== 'Escape'/, 'Escape is handled');
  assert.match(rinkSrc, /focused\?\.focus\(\{ preventScroll: true \}\)/, 'Escape returns focus to the marker');
  assert.match(rinkSrc, /ArrowRight' \|\| e\.key === 'ArrowDown'/, 'arrow keys walk the shot layer');

  // -- dense areas: elevate, never relocate
  assert.match(castCss2, /\.rk-marks:has\(\.mk-g\.is-inspected\) \.mk-g:not\(\.is-inspected\) \{ opacity/, 'neighbouring marks dim rather than move');
  assert.ok(!/jitter|cluster|collide|spread/i.test(rinkSrc), 'no clustering or jitter of real coordinates');

  // -- live behaviour: a pin survives polling and is never auto-opened
  assert.match(castSrc, /const wasPinned = inspector\?\.pinned\(\) \?\? null;/, 'a pinned shot survives a re-render');
  assert.match(rinkSrc, /function repin\(\)/, 'the controller can re-pin after the host re-renders');
  assert.ok(!/markArrivingShots[\s\S]{0,400}\.pin\(/.test(castSrc), 'a newly arrived shot never auto-opens the inspector');

  // -- cross-filter contract intact, and the data-sort collision is fixed
  assert.match(labSrc, /on\(root, 'click', 'button\.lab-sort\[data-sort\]'/, 'table sorting is scoped to header buttons, not every [data-sort]');
  assert.ok(!/on\(root, 'click', '\[data-sort\]'/.test(labSrc), 'the bare [data-sort] click handler is gone: rink markers carry data-sort too');
  assert.match(labSrc, /on\(root, 'click', 'tr\[data-shot\]', \(_, tr\) => inspector\?\.pin/, 'a table row click pins the matching rink shot');
  assert.match(labSrc, /crossHighlight\(\{ shotId: id, source: row \}\)/, 'pinning a rink shot cross-highlights its row');
  assert.ok(/class="mk-g"[^>]*data-sort="42"[^>]*data-shot-type="Wrist shot"/.test(svg2), 'the cross-filter attributes survive alongside the new inspector data');
}

// 2. Truth rules: no randomness or stale launch copy in shipped source.
const files = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(js|css|html)$/.test(entry.name)) files.push(p);
  }
};
walk('src');
files.push('index.html', 'vite.config.js');
for (const dir of ['src']) {
  const walkInclude = d => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walkInclude(p);
      else if (/\.js$/.test(entry.name) && !p.endsWith(path.join('lib', 'account.js'))) {
        assert.ok(!/credentials:\s*'include'/.test(fs.readFileSync(p, 'utf8')), `credentialed fetch outside account.js: ${p}`);
      }
    }
  };
  walkInclude(dir);
}
const banned = [
  [/Math\.random\s*\(/, 'Math.random in shipped code'],
  [/Launching Oct/i, 'stale launch copy'],
  [/30 teams/i, '30-team copy (NHL has 32)'],
  [/tip-?off/i, '"tip-off" (use puck drop)'],
  [/VITE_[A-Z_]*(KEY|SECRET|TOKEN)/, 'secret exposed through VITE_ env'],
  [/\/api\/(nhl|env|odds)(?![A-Za-z])/, 'retired Vercel data relay (/api/nhl, /api/env, /api/odds)'],
  [/X-Dashboard-Secret|X-NHL-Gateway-Secret|PROPSPORTS_DASHBOARD_SECRET|NHL_GATEWAY_SECRET|X-API-Key/i, 'backend credential referenced in browser code']
];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const [re, why] of banned) assert.ok(!re.test(text), `${why}: ${file}`);
  // Every line that mentions xG/GSAx must say it is not (yet) available.
  text.split('\n').forEach((line, i) => {
    if (/\b(xG|GSAx)\b/.test(line)) {
      assert.ok(/\b(not|until|unavailable|validated|no)\b/i.test(line), `unqualified xG/GSAx claim: ${file}:${i + 1}`);
    }
  });
}
// 3. Page/background artwork is raster only (WebP/AVIF/JPG, locally hosted).
// Brand marks and inline data-viz SVG elements are out of scope; a CSS
// background painted from an SVG is not. The one allowed exception is the
// 72px empty-state glyph (an icon, not artwork).
for (const file of files.filter(f => f.endsWith('.css'))) {
  const text = fs.readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    if (!/url\(\s*["']?(data:image\/svg|[^)"']*\.svg)/i.test(line)) return;
    const allowed = /^\.pbe-empty::before|^\.pid__pbe|^\.pbeo-media__fallback i/.test(line.trim());
    assert.ok(allowed, `decorative SVG background at ${file}:${i + 1}`);
  });
}
const backdropsLib = fs.readFileSync('src/lib/backdrops.js', 'utf8');
assert.match(backdropsLib, /const GENERATED = \{\};/, 'no generated (SVG) route art');
assert.match(fs.readFileSync('src/styles/atmosphere.css', 'utf8'), /\/assets\/nhl\/grain-128\.webp/, 'grain is the raster tile');
assert.ok(fs.statSync('public/assets/nhl/grain-128.webp').size < 8000, 'grain tile stays tiny');

console.log(`frontend checks: PASS (${files.length} files)`);
