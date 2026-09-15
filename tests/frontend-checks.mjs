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
