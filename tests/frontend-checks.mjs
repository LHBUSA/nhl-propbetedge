// Static guards that run in CI before the build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveTarget } from '../api/nhl.js';

// 1. Proxy allowlist: the owner secret can only reach NHL routes.
const base = 'https://propsports.example';
assert.equal(resolveTarget({ path: '/nhl/board' }, base).url, `${base}/nhl/board`);
assert.equal(resolveTarget({ path: '/nhl/game/2025020500/cast' }, base).url, `${base}/nhl/game/2025020500/cast`);
assert.equal(resolveTarget({ path: '/nhl/schedule', date: '2026-09-29' }, base).url, `${base}/nhl/schedule?date=2026-09-29`);
for (const bad of ['/nhl/../mlb/odds', '/mlb/odds', '/nhl/admin/ingest/schedule', '//evil.test/x', '/nhl/game/123/cast', 'https://evil.test', '/nhl/team/tor/../../x']) {
  assert.ok(resolveTarget({ path: bad }, base).error, `rejected: ${bad}`);
}
assert.ok(resolveTarget({ path: '/nhl/board', url: 'https://evil.test' }, base).error, 'unknown params rejected');
assert.ok(resolveTarget({ path: '/nhl/board', date: '2026-9-1' }, base).error, 'malformed date rejected');

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
walk('api');
files.push('index.html');
const banned = [
  [/Math\.random\s*\(/, 'Math.random in shipped code'],
  [/Launching Oct/i, 'stale launch copy'],
  [/30 teams/i, '30-team copy (NHL has 32)'],
  [/tip-?off/i, '"tip-off" (use puck drop)'],
  [/VITE_[A-Z_]*(KEY|SECRET|TOKEN)/, 'secret exposed through VITE_ env']
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
