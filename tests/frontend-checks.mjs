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
