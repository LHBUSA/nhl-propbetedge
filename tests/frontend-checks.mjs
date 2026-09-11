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
assert.match(apiSource, /credentials: 'omit'/, 'gateway requests never carry cookies');

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
console.log(`frontend checks: PASS (${files.length} files)`);
