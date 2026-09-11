// Withdraw individual player portraits.
//
// Prepared for the 10 published portraits whose Commons file carries a
// personality-rights restriction tag (personality-flagged.json). It is NOT
// applied: without --apply this only prints what would change.
//
//   node scripts/player-portraits/withdraw.mjs                 # dry run, the flagged 10
//   node scripts/player-portraits/withdraw.mjs --apply         # withdraw the flagged 10
//   node scripts/player-portraits/withdraw.mjs --ids 8477934,8479343 --apply
//   node scripts/player-portraits/withdraw.mjs --restore --ids 8477934   # re-allow, then rebuild
//
// What a withdrawal does, per player:
//   1. moves the review ledger entry from `approved` to `rejected` with reason
//      `personality_rights_withdrawn`, so `build.mjs` never republishes it
//      (a different Commons photo later returns the player to "pending",
//      which is a fresh decision, not a silent re-add);
//   2. drops the player from src/data/player-portraits.json (what the app
//      reads) and from public/assets/players/manifest.json;
//   3. deletes that player's four image files;
//   4. adds the player to src/data/portrait-optout.json, which also suppresses
//      the NHL asset-feed headshot for them. Without step 4 a withdrawn player
//      would simply fall through to the NHL mug (the priority since PR #5),
//      which is a different rights question, not the initials fallback asked for.
//
// A suppressed player renders as initials + team badge everywhere
// (playerIdentity in src/components/player.js),
// and the Methodology "Image credits" table is generated from the same
// manifest, so the credit disappears with the portrait.
//
// Restoring images after a withdrawal needs `node scripts/player-portraits/build.mjs`
// (the files are deleted here, not kept).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const FLAGGED = path.join(HERE, 'personality-flagged.json');
const REVIEW = path.join(HERE, 'review.json');
const APP_MANIFEST = path.join(REPO, 'src', 'data', 'player-portraits.json');
const OPTOUT = path.join(REPO, 'src', 'data', 'portrait-optout.json');
const PUB_DIR = path.join(REPO, 'public', 'assets', 'players');
const PUB_MANIFEST = path.join(PUB_DIR, 'manifest.json');
const OUTPUTS = (id) => [`${id}-96.webp`, `${id}-192.webp`, `${id}-384.webp`, `${id}-192.avif`];
const REASON = 'personality_rights_withdrawn';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const value = (flag) => { const i = argv.indexOf(flag); return i === -1 ? null : argv[i + 1]; };
const apply = has('--apply');
const restore = has('--restore');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

const flagged = readJson(FLAGGED);
const ids = (value('--ids') ? value('--ids').split(',') : Object.keys(flagged.players)).map((s) => s.trim()).filter(Boolean);

const review = readJson(REVIEW);
const app = readJson(APP_MANIFEST);
const pub = fs.existsSync(PUB_MANIFEST) ? readJson(PUB_MANIFEST) : null;
const optout = readJson(OPTOUT);
optout.players ||= {};
review.approved ||= {};
review.rejected ||= {};

const plan = [];
for (const id of ids) {
  const name = app.players?.[id]?.name || flagged.players[id] || review.approved[id]?.name || review.rejected[id]?.name || '(unknown)';
  if (restore) {
    const entry = review.rejected[id];
    if (!entry || entry.reason !== REASON) { plan.push({ id, name, action: 'skip', why: 'not withdrawn by this tool' }); continue; }
    plan.push({ id, name, action: 'restore', files: 'rebuild required (build.mjs)' });
    continue;
  }
  if (!app.players?.[id] && !review.approved[id]) { plan.push({ id, name, action: 'skip', why: 'not published' }); continue; }
  plan.push({ id, name, action: 'withdraw', files: OUTPUTS(id).filter((f) => fs.existsSync(path.join(PUB_DIR, f))) });
}

const doing = plan.filter((p) => p.action !== 'skip');
console.log(`${restore ? 'Restore' : 'Withdraw'} ${doing.length} portrait(s)${apply ? '' : '  [DRY RUN — nothing written; pass --apply]'}`);
for (const p of plan) {
  console.log(`  ${p.action.toUpperCase().padEnd(8)} ${p.id.padEnd(9)} ${p.name}${p.why ? `  (${p.why})` : ''}${Array.isArray(p.files) ? `  ${p.files.length} files` : p.files ? `  ${p.files}` : ''}`);
}
console.log(`Published portraits now: ${Object.keys(app.players || {}).length}${doing.length && !restore ? ` -> ${Object.keys(app.players || {}).length - doing.length}` : ''}`);

if (!apply) {
  console.log('\nNo files changed. Re-run with --apply to write, then commit:');
  console.log('  src/data/player-portraits.json, src/data/portrait-optout.json, public/assets/players/**, scripts/player-portraits/review.json');
  process.exit(0);
}

for (const p of doing) {
  if (restore) {
    const entry = review.rejected[p.id];
    delete review.rejected[p.id];
    review.approved[p.id] = { name: entry.name, file: entry.file };
    delete optout.players[p.id];
    continue;
  }
  const approved = review.approved[p.id];
  if (approved) {
    delete review.approved[p.id];
    review.rejected[p.id] = { name: approved.name, file: approved.file, reason: REASON, withdrawn_at: new Date().toISOString().slice(0, 10) };
  }
  delete app.players?.[p.id];
  if (pub?.players) delete pub.players[p.id];
  for (const f of OUTPUTS(p.id)) { const abs = path.join(PUB_DIR, f); if (fs.existsSync(abs)) fs.unlinkSync(abs); }
  optout.players[p.id] = { name: p.name, reason: REASON, withdrawn_at: new Date().toISOString().slice(0, 10) };
}

writeJson(REVIEW, review);
writeJson(OPTOUT, optout);
if (!restore) {
  app.generated_at = new Date().toISOString();
  writeJson(APP_MANIFEST, app);
  if (pub) { pub.generated_at = app.generated_at; writeJson(PUB_MANIFEST, pub); }
}
console.log(`\nDone. ${restore ? 'Run `node scripts/player-portraits/build.mjs` to re-publish the images.' : 'Those players now render as initials + team badge.'}`);
