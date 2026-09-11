#!/usr/bin/env node
// Licensed NHL player-portrait pipeline (Wikimedia Commons via Wikidata P3522).
//
//   node scripts/player-portraits/build.mjs [--force] [--cache DIR] [--sheet DIR] [--python EXE]
//
// Stages: targets (api-web leaders + club goalies) -> Wikidata P3522 -> P18 image ->
// Commons extmetadata license gate -> face-anchored crop (crop.py) -> staged outputs ->
// visual review (review.json) -> publish approved only to public/assets/players + manifest + doc.
//
// NHL headshots (assets.nhle.com/mugs) are never fetched: they are NHL-copyrighted and
// PENDING OWNER DECISION. Idempotent: cached downloads and staged crops are reused unless --force.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'players');
const DOC = path.join(ROOT, 'docs', 'image-sources', 'players.md');
const REVIEW = path.join(HERE, 'review.json');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const FORCE = flag('--force');
const CACHE = path.resolve(opt('--cache', path.join(os.tmpdir(), 'pbe-player-portraits')));
const SHEET_DIR = path.resolve(opt('--sheet', CACHE));
const PYTHON = opt('--python', process.platform === 'win32' ? 'python' : 'python3');
const SRC_DIR = path.join(CACHE, 'src');
const STAGE_DIR = path.join(CACHE, 'staged');

const UA = 'PropBetEdge-PlayerPortraits/1.0 (https://nhl.propbetedge.ai; licensed-portrait pipeline)';
const SEASON = '20252026';
const TEAMS = 'ANA BOS BUF CGY CAR CHI COL CBJ DAL DET EDM FLA LAK MIN MTL NSH NJD NYI NYR OTT PHI PIT SJS SEA STL TBL TOR UTA VAN VGK WSH WPG'.split(' ');
const PHOTO_MAX_AGE_YEARS = 10;
// Juvenile rule: a photo taken before the player turned 21 that is already 6+ years old
// does not represent the current player.
const JUVENILE_AGE = 21;
const JUVENILE_PHOTO_AGE = 6;
const CROP_VERSION = 'yunet-v2'; // bump to invalidate cached crop decisions
const YUNET_URL = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx';
const YUNET_SHA256 = '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4';
const NOW_YEAR = new Date().getUTCFullYear();

for (const d of [CACHE, SRC_DIR, STAGE_DIR, OUT_DIR, SHEET_DIR]) fs.mkdirSync(d, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...m) => console.log(...m);

async function get(url, { type = 'json', headers = {}, tries = 4 } = {}) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
    } catch (e) { // socket reset / DNS blip: retry, then surface
      if (attempt >= tries) throw e;
      await sleep(1500 * attempt ** 2);
      continue;
    }
    if (res.ok) return type === 'json' ? res.json() : Buffer.from(await res.arrayBuffer());
    if (attempt >= tries || ![429, 500, 502, 503, 504].includes(res.status)) {
      throw new Error(`${res.status} ${url.slice(0, 160)}`);
    }
    const ra = Number(res.headers.get('retry-after')) || 0;
    await sleep(Math.max(ra * 1000, 1500 * attempt ** 2));
  }
}

// Run async fn over items with at most `n` in flight (network politeness + memory).
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z\s-]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
  .replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();

// ---------------------------------------------------------------- 1. targets
async function loadTargets() {
  const targets = new Map(); // id -> {id, name, first, last, role, team, why:Set}
  const add = (id, first, last, role, team, why) => {
    const key = String(id);
    if (!targets.has(key)) targets.set(key, { id: key, first, last, name: `${first} ${last}`, role, team, why: new Set() });
    targets.get(key).why.add(why);
  };
  const base = 'https://api-web.nhle.com/v1';
  const sk = await get(`${base}/skater-stats-leaders/${SEASON}/2?categories=points,goals,assists,goalsPp&limit=40`);
  for (const [cat, list] of Object.entries(sk)) for (const p of list) {
    add(p.id, p.firstName.default, p.lastName.default, p.position === 'G' ? 'goalie' : 'skater', p.teamAbbrev, `skater:${cat}`);
  }
  const gl = await get(`${base}/goalie-stats-leaders/${SEASON}/2?categories=wins,shutouts,savePctg,goalsAgainstAverage&limit=40`);
  for (const [cat, list] of Object.entries(gl)) for (const p of list) {
    add(p.id, p.firstName.default, p.lastName.default, 'goalie', p.teamAbbrev, `goalie:${cat}`);
  }
  await pool(TEAMS, 3, async (team) => {
    const cs = await get(`${base}/club-stats/${team}/${SEASON}/2`);
    const top = [...(cs.goalies || [])].sort((a, b) => (b.gamesStarted || 0) - (a.gamesStarted || 0)).slice(0, 2);
    for (const g of top) add(g.playerId, g.firstName.default, g.lastName.default, 'goalie', team, 'club:top2-goalie');
  });
  return [...targets.values()];
}

// ---------------------------------------------------------------- 2. Wikidata
async function wikidata(ids) {
  const found = new Map(); // nhlId -> [{item,label,alts,occ,images,dob}]
  for (let i = 0; i < ids.length; i += 60) {
    const batch = ids.slice(i, i + 60);
    const q = `SELECT ?item ?nhl ?label ?dob
      (GROUP_CONCAT(DISTINCT STR(?image); separator="|") AS ?images)
      (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts)
      (GROUP_CONCAT(DISTINCT STR(?occ); separator="|") AS ?occs)
      (GROUP_CONCAT(DISTINCT STR(?sport); separator="|") AS ?sports) WHERE {
      VALUES ?nhl { ${batch.map((x) => `"${x}"`).join(' ')} }
      ?item wdt:P3522 ?nhl .
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "en") }
      OPTIONAL { ?item skos:altLabel ?alt FILTER(LANG(?alt) = "en") }
      OPTIONAL { ?item wdt:P106 ?occ }
      OPTIONAL { ?item wdt:P641 ?sport }
      OPTIONAL { ?item wdt:P569 ?dob }
    } GROUP BY ?item ?nhl ?label ?dob`;
    const r = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/sparql-results+json' } });
    for (const b of r.results.bindings) {
      const id = b.nhl.value;
      const rec = {
        item: b.item.value.split('/').pop(),
        label: b.label?.value || '',
        alts: (b.alts?.value || '').split('|').filter(Boolean),
        occs: (b.occs?.value || '').split('|').filter(Boolean),
        sports: (b.sports?.value || '').split('|').filter(Boolean),
        dob: b.dob?.value?.slice(0, 10) || '',
        images: (b.images?.value || '').split('|').filter(Boolean)
          .map((u) => decodeURIComponent(u.split('/Special:FilePath/').pop())),
      };
      if (!found.has(id)) found.set(id, []);
      if (!found.get(id).some((x) => x.item === rec.item)) found.get(id).push(rec);
    }
    await sleep(500);
  }
  return found;
}

const ICE_HOCKEY_PLAYER = 'http://www.wikidata.org/entity/Q11774891';
const ICE_HOCKEY = 'http://www.wikidata.org/entity/Q41466';

function similarity(a, b) { // 1 - Levenshtein / max length
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

function nameMatches(t, wd) {
  const full = norm(t.name);
  const labels = [wd.label, ...wd.alts].map(norm);
  if (labels.includes(full)) return true;
  // transliteration variants (Shesterkin/Shestyorkin): the P3522 id already matched exactly
  if (labels.some((l) => similarity(l, full) >= 0.8)) return true;
  const last = norm(t.last), first = norm(t.first).split(' ')[0];
  const lbl = norm(wd.label);
  if (!lbl.endsWith(last) && !lbl.split(' ').includes(last.split(' ').pop())) return false;
  const lf = lbl.split(' ')[0];
  return lf === first || lf.startsWith(first) || first.startsWith(lf); // Alex/Alexander, Mitch/Mitchell
}

// ---------------------------------------------------------------- 3. Commons
async function commonsInfo(titles, width) {
  const info = new Map();
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo'
      + `&iiprop=url|extmetadata|size|mime&iiurlwidth=${width}&titles=${encodeURIComponent(batch.map((t) => `File:${t}`).join('|'))}`;
    const r = await get(url);
    const norms = new Map((r.query?.normalized || []).map((n) => [n.to, n.from]));
    for (const p of r.query?.pages || []) {
      const from = (norms.get(p.title) || p.title).replace(/^File:/, '');
      info.set(from, p.imageinfo?.[0] || null);
      info.set(p.title.replace(/^File:/, ''), p.imageinfo?.[0] || null);
    }
    await sleep(300);
  }
  return info;
}

function licenseGate(ii) {
  const m = ii.extmetadata || {};
  const v = (k) => stripHtml(m[k]?.value);
  const short = v('LicenseShortName');
  const s = short.toLowerCase();
  const nonFree = /true/i.test(v('NonFree'));
  if (nonFree || /fair use|non-free|nonfree/.test(s)) return { ok: false, reason: 'license_non_free', short };
  if (/\bnc\b|-nc|\bnd\b|-nd|noncommercial|noderiv/.test(s)) return { ok: false, reason: 'license_nc_or_nd', short };
  let family = null;
  if (/^cc0|cc-zero|^cc zero/.test(s)) family = 'CC0';
  else if (/^public domain|^pd\b|^pd-/.test(s)) family = 'Public domain';
  else if (/^cc[ -]by[ -]sa[ -]?\d/.test(s) || /^cc[ -]by-sa$/.test(s)) family = 'CC BY-SA';
  else if (/^cc[ -]by[ -]?\d/.test(s) || /^cc[ -]by$/.test(s)) family = 'CC BY';
  if (!family) return { ok: false, reason: 'license_not_allowed', short };
  const author = v('Artist').replace(/\s*\(talk\)\s*$/i, '');
  const attrRequired = !/false/i.test(v('AttributionRequired'));
  if (!author && attrRequired && family !== 'CC0' && family !== 'Public domain') {
    return { ok: false, reason: 'no_author_for_attribution', short };
  }
  const licenseUrl = v('LicenseUrl') || (family === 'CC0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : '');
  if (!licenseUrl && family !== 'Public domain') return { ok: false, reason: 'license_url_missing', short };
  const date = v('DateTimeOriginal');
  const year = Number((date.match(/\b(19[5-9]\d|20[0-4]\d)\b/) || [])[1]) || null;
  const authorOut = author || 'Unknown author';
  const credit = `${authorOut}, ${short}, via Wikimedia Commons (cropped)`;
  return {
    ok: true, family, short, author: authorOut, licenseUrl, credit, year,
    usageTerms: v('UsageTerms'), restrictions: v('Restrictions'),
  };
}

// ---------------------------------------------------------------- 4/5. crop
function srcPath(title, width) {
  const h = createHash('sha1').update(title).digest('hex').slice(0, 10);
  return path.join(SRC_DIR, `${h}-${width}`);
}

async function download(url, file) {
  if (fs.existsSync(file) && !FORCE) return file;
  const buf = await get(url, { type: 'buf' });
  fs.writeFileSync(file, buf);
  await sleep(250);
  return file;
}

function runCrop(file, id, origWidth) {
  const r = spawnSync(PYTHON, [path.join(HERE, 'crop.py'), 'crop', '--in', file, '--id', id,
    '--out-dir', STAGE_DIR, '--orig-width', String(origWidth || 0), '--model', MODEL],
  { encoding: 'utf8', maxBuffer: 1 << 20 });
  if (r.status !== 0) return { status: 'reject', reason: 'crop_process_error', detail: (r.stderr || '').slice(-300) };
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { status: 'reject', reason: 'crop_output_error' }; }
}

const MODEL = path.join(CACHE, 'face_detection_yunet_2023mar.onnx');
async function ensureModel() {
  const ok = () => fs.existsSync(MODEL) && createHash('sha256').update(fs.readFileSync(MODEL)).digest('hex') === YUNET_SHA256;
  if (ok()) return true;
  try { fs.writeFileSync(MODEL, await get(YUNET_URL, { type: 'buf' })); } catch { /* fall through */ }
  if (ok()) return true;
  if (fs.existsSync(MODEL)) fs.rmSync(MODEL); // never run an unverified model
  console.warn('    YuNet model unavailable or hash mismatch: falling back to Haar cascades');
  return false;
}

const OUTPUTS = (id) => [`${id}-96.webp`, `${id}-192.webp`, `${id}-384.webp`, `${id}-192.avif`];
const staged = (id) => OUTPUTS(id).every((f) => fs.existsSync(path.join(STAGE_DIR, f)));

// ---------------------------------------------------------------- main
async function main() {
  const tally = {};
  const bump = (k) => { tally[k] = (tally[k] || 0) + 1; };
  const statePath = path.join(CACHE, 'crop-state.json');
  const cropState = fs.existsSync(statePath) && !FORCE ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};

  log('1/6 targets from api-web ...');
  const targets = await loadTargets();
  log(`    ${targets.length} unique players (${targets.filter((t) => t.role === 'skater').length} skaters, ${targets.filter((t) => t.role === 'goalie').length} goalies)`);

  log('2/6 Wikidata P3522 ...');
  const wd = await wikidata(targets.map((t) => t.id));
  const rows = [];
  for (const t of targets) {
    const row = { ...t, why: [...t.why].join(','), stage: 'target' };
    rows.push(row);
    const recs = wd.get(t.id) || [];
    if (!recs.length) { row.reject = 'no_wikidata_match'; continue; }
    if (recs.length > 1) { row.reject = 'ambiguous_wikidata_items'; continue; }
    const rec = recs[0];
    row.qid = rec.item; row.wdLabel = rec.label; row.dob = rec.dob;
    if (!rec.occs.includes(ICE_HOCKEY_PLAYER) && !rec.sports.includes(ICE_HOCKEY)) { row.reject = 'wikidata_not_ice_hockey_player'; continue; }
    if (!nameMatches(t, rec)) { row.reject = 'wikidata_name_mismatch'; continue; }
    row.stage = 'wikidata';
    if (!rec.images.length) { row.reject = 'no_p18_image'; continue; }
    row.images = rec.images; row.stage = 'p18';
  }

  // one Commons file as P18 for two different players = we cannot tell who is who
  const users = new Map();
  for (const r of rows) for (const im of r.images || []) users.set(im, (users.get(im) || 0) + 1);
  for (const r of rows.filter((x) => x.stage === 'p18')) {
    r.images = r.images.filter((im) => users.get(im) === 1);
    if (!r.images.length) { r.reject = 'p18_shared_by_multiple_players'; r.stage = 'wikidata'; }
  }

  log('3/6 Commons license gate ...');
  const titles = [...new Set(rows.flatMap((r) => r.images || []))];
  const info = await commonsInfo(titles, 960);
  for (const row of rows.filter((r) => r.stage === 'p18')) {
    let last = null;
    for (const title of row.images) {
      const ii = info.get(title);
      if (!ii) { last = { reason: 'commons_file_missing' }; continue; }
      if (!/^image\/(jpeg|png|webp)$/.test(ii.mime)) { last = { reason: 'unsupported_mime' }; continue; }
      const lic = licenseGate(ii);
      if (!lic.ok) { last = lic; continue; }
      if (lic.year && NOW_YEAR - lic.year > PHOTO_MAX_AGE_YEARS) { last = { reason: 'photo_older_than_10y', year: lic.year }; continue; }
      const born = Number(String(row.dob).slice(0, 4)) || null;
      if (lic.year && born && lic.year - born < JUVENILE_AGE && NOW_YEAR - lic.year >= JUVENILE_PHOTO_AGE) {
        last = { reason: 'juvenile_dated_photo', year: lic.year }; continue;
      }
      row.file = title; row.ii = ii; row.lic = lic; row.stage = 'license'; last = null;
      break;
    }
    if (last) { row.reject = last.reason; row.licenseSeen = last.short; row.photoYear = last.year; }
  }

  log('4/6 download + face crop (sequential) ...');
  const yunet = await ensureModel();
  const licensed = rows.filter((r) => r.stage === 'license');
  for (const [k, row] of licensed.entries()) {
    const key = `${CROP_VERSION}${yunet ? '' : '-haar'}:${row.file}`;
    const prev = cropState[row.id];
    if (!FORCE && prev && prev.file === key && (prev.result.status !== 'ok' || staged(row.id))) {
      row.crop = prev.result;
    } else {
      const ii = row.ii;
      let res;
      try {
        const f1 = await download(ii.thumburl || ii.url, srcPath(row.file, 960));
        res = runCrop(f1, row.id, ii.width);
        if (res.status === 'need_larger') {
          const big = await commonsInfo([row.file], res.width);
          const bi = big.get(row.file);
          const f2 = await download(bi?.thumburl || ii.url, srcPath(row.file, res.width));
          res = runCrop(f2, row.id, 0);
        }
        if (res.status === 'need_larger') res = { status: 'reject', reason: 'low_resolution' };
        cropState[row.id] = { file: key, result: res };
        fs.writeFileSync(statePath, JSON.stringify(cropState));
      } catch (e) { // transient network failure: not cached, retried on the next run
        res = { status: 'reject', reason: 'download_error', detail: String(e.message || e).slice(0, 120) };
      }
      row.crop = res;
    }
    if (row.crop.status === 'ok') row.stage = 'crop';
    else row.reject = row.crop.reason;
    if ((k + 1) % 10 === 0) log(`    ${k + 1}/${licensed.length}`);
  }

  // ---------------------------------------------------------------- 6. review + publish
  log('5/6 visual review gate ...');
  const review = fs.existsSync(REVIEW) ? JSON.parse(fs.readFileSync(REVIEW, 'utf8')) : { approved: {}, rejected: {} };
  const cropped = rows.filter((r) => r.stage === 'crop');
  const pending = [];
  for (const row of cropped) {
    const rej = review.rejected?.[row.id];
    const ok = review.approved?.[row.id];
    if (rej && rej.file === row.file) { row.reject = `visual:${rej.reason}`; continue; }
    if (ok && ok.file === row.file) { row.stage = 'approved'; continue; }
    pending.push(row);
  }
  // contact sheet of everything cropped (approved + pending) for the reviewer
  const sheetItems = cropped.filter((r) => !r.reject && staged(r.id)).map((r) => ({
    id: r.id, path: path.join(STAGE_DIR, `${r.id}-192.webp`), name: `${r.name} (${r.role[0].toUpperCase()})`,
    note: `${r.stage === 'approved' ? 'OK' : 'PENDING'} ${r.lic.year || '????'} s${Math.round(r.crop.sharp)}${r.crop.others_in_crop ? ' +face' : ''}`,
  }));
  const listFile = path.join(CACHE, 'sheet-list.json');
  fs.writeFileSync(listFile, JSON.stringify(sheetItems));
  const sheet = spawnSync(PYTHON, [path.join(HERE, 'crop.py'), 'sheet', '--list', listFile, '--out', path.join(SHEET_DIR, 'players-contact')], { encoding: 'utf8' });
  const pages = sheet.status === 0 ? JSON.parse(sheet.stdout).pages : [];
  fs.writeFileSync(path.join(SHEET_DIR, 'players-contact-index.json'), JSON.stringify(sheetItems.map((s, i) => ({ n: i + 1, id: s.id, name: s.name, note: s.note })), null, 1));

  log('6/6 publish approved ...');
  const approved = rows.filter((r) => r.stage === 'approved').sort((a, b) => a.name.localeCompare(b.name));
  const keep = new Set(approved.flatMap((r) => OUTPUTS(r.id)));
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (/^\d+-\d+\.(webp|avif)$/.test(f) && !keep.has(f)) fs.rmSync(path.join(OUT_DIR, f));
  }
  let totalBytes = 0;
  for (const r of approved) for (const f of OUTPUTS(r.id)) {
    const src = path.join(STAGE_DIR, f), dst = path.join(OUT_DIR, f);
    const buf = fs.readFileSync(src);
    if (FORCE || !fs.existsSync(dst) || !buf.equals(fs.readFileSync(dst))) fs.writeFileSync(dst, buf);
    totalBytes += buf.length;
  }
  const manifest = {
    generated_at: new Date().toISOString(),
    source: 'Wikimedia Commons via Wikidata P3522',
    players: Object.fromEntries(approved.map((r) => [r.id, {
      name: r.name, file: r.id, sizes: [96, 192, 384], author: r.lic.author, license: r.lic.short,
      license_url: r.lic.licenseUrl, source_page: r.ii.descriptionurl, credit: r.lic.credit,
    }])),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);

  for (const r of rows) if (r.reject) bump(r.reject);
  const counts = {
    targets: rows.length,
    skaters: rows.filter((r) => r.role === 'skater').length,
    goalies: rows.filter((r) => r.role === 'goalie').length,
    wikidata: rows.filter((r) => r.qid && r.reject !== 'wikidata_not_ice_hockey_player' && r.reject !== 'wikidata_name_mismatch').length,
    wikidataAny: rows.filter((r) => r.qid).length,
    p18: rows.filter((r) => r.images).length,
    license: licensed.length,
    crop: cropped.length,
    pending: pending.length,
    approved: approved.length,
    approvedSkaters: approved.filter((r) => r.role === 'skater').length,
    approvedGoalies: approved.filter((r) => r.role === 'goalie').length,
    totalBytes,
  };
  const licMix = {};
  for (const r of approved) licMix[r.lic.short] = (licMix[r.lic.short] || 0) + 1;
  fs.writeFileSync(path.join(CACHE, 'run-report.json'), JSON.stringify({ counts, tally, licMix, pages,
    rows: rows.map(({ ii, images, ...r }) => ({ ...r, images })) }, null, 1));
  writeDoc({ counts, tally, licMix, approved, rows });

  log(JSON.stringify({ counts, licMix, tally, pages, pending: pending.map((r) => `${r.id} ${r.name}`) }, null, 1));
}

// ---------------------------------------------------------------- doc
function writeDoc({ counts, tally, licMix, approved, rows }) {
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
  const tallyRows = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const mix = Object.entries(licMix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none';
  const table = approved.map((r) => `| ${esc(r.name)} | ${r.role} | ${r.id} | [${esc(r.file)}](${r.ii.descriptionurl}) | ${esc(r.lic.author)} | [${esc(r.lic.short)}](${r.lic.licenseUrl}) | ${r.lic.year || 'n/a'} |`).join('\n');
  const noPhoto = rows.filter((r) => !r.stage || r.stage !== 'approved').map((r) => `${r.name} (${r.reject || 'pending review'})`);
  const md = `# Player portraits — image sources

Generated by \`scripts/player-portraits/build.mjs\` (${new Date().toISOString().slice(0, 10)}). Re-run: \`node scripts/player-portraits/build.mjs\` (add \`--force\` to rebuild everything). Assets: \`public/assets/players/\`. Manifest: \`public/assets/players/manifest.json\`.

## Contract

| Source | Status |
|---|---|
| Wikimedia Commons files reached through the Wikidata item's P18 (image), with the Wikidata item found by **P3522 = NHL.com player ID** | **ALLOWED** when Commons \`extmetadata\` shows CC0, Public domain, CC BY (any version) or CC BY-SA (any version) |
| Commons files marked non-free / fair use, any NC or ND license, GFDL-only, custom "Attribution" licenses, missing license URL, or a CC BY/BY-SA file with no author | **REFUSED** |
| NHL headshots (\`assets.nhle.com/mugs/...\`, present in api-web payloads) | **PENDING OWNER DECISION — not enabled.** NHL-copyrighted photos; NHL.com terms restrict use to non-commercial/personal use (\`docs/NHL_SOURCE_MATRIX.md\` §0). The pipeline never requests them. |
| Getty / NHLI / team / agency photography, AI-generated or lookalike images, search-engine images | **REFUSED** |

A player gets a portrait only when the file is confidently that player: the Wikidata item must carry the player's NHL id (P3522), be an ice hockey player (P106 Q11774891 or P641 Q41466), have an English label or alias matching the NHL name (accents normalised; short forenames such as Alex/Alexander accepted), and pass a visual review.

**Copyright licence is not a publicity-rights licence.** Commons licences cover the photograph's copyright only. Using a real athlete's likeness next to betting content can raise separate personality/publicity-rights questions; portraits are editorial identification only — never imply endorsement.

## Attribution requirements for the UI

- **Large portraits** (192/384 in a hero, profile header or card): show a visible credit line under or over the image, using the manifest \`credit\` string, with the licence name linked to \`license_url\` and the credit linked to \`source_page\`.
- **Compact avatars** (96 and below): put the \`credit\` string in the element's \`title\`/hover tooltip **and** list every portrait shown on the page in a reachable credits list (e.g. a "Photo credits" footer or /credits page) with author, licence link and source page.
- The credit strings end with "(cropped)" because CC BY / BY-SA require indicating changes. Cropped BY-SA images stay under their BY-SA licence.
- Do not strip, shorten or re-word the author name.

## Method

1. **Targets** — api-web (no key), 2025-26 regular season: skater leaders (points, goals, assists, goalsPp; top 40 each), goalie leaders (wins, shutouts, savePctg, goalsAgainstAverage; top 40 each), and each of the 32 clubs' top-2 goalies by games started (\`/club-stats/{TEAM}/20252026/2\`). Deduplicated by NHL id. Headshot URLs in these payloads are ignored.
2. **Identity** — Wikidata SPARQL on P3522 in batches of 60; P18, English label/aliases, P106/P641 and P569 read in the same query.
3. **Licence gate** — Commons \`imageinfo\` (\`extmetadata\`: LicenseShortName, LicenseUrl, Artist, Credit, AttributionRequired, UsageTerms, NonFree, DateTimeOriginal). Author is the \`Artist\` field with HTML stripped. Photos whose DateTimeOriginal is more than ${PHOTO_MAX_AGE_YEARS} years old are refused as not representing the current player, and so are photos taken before the player turned ${JUVENILE_AGE} that are already ${JUVENILE_PHOTO_AGE}+ years old (juvenile/draft-era photos). A Commons file that is P18 for two different target players is refused for both (identity ambiguous).
4. **Download** — the 960 px Commons thumbnail (a standard Wikimedia thumbnail step), never the full original; a 1280/1920 px thumbnail is fetched only when the face is too small for a sharp 384 px crop.
5. **Crop** (\`crop.py\`) — face detection with OpenCV's YuNet DNN detector (\`cv2.FaceDetectorYN\`, model \`face_detection_yunet_2023mar.onnx\` from opencv_zoo, MIT licence, SHA-256 pinned in \`build.mjs\`, downloaded to the cache, never committed). The bundled Haar frontal cascade was tried first and missed most three-quarter faces under helmets and visors (25 crops vs 57); it remains the automatic fallback (confirmed by the alt2 cascade) if the model cannot be fetched or fails its hash. Square ~3.0× the YuNet face-box height (3.2× for Haar), face centre ~43 % from the top so helmets keep headroom; the crop may tighten to 2.5× only to stay inside the photo. **Rejected, never guessed:** no face, detector score < 0.88, face not near-frontal (eyes too close together) or tilted > 22°, face < 60 px, head top outside the source photo, no headroom, two comparable faces (ambiguous subject), crop side < 256 source px, or > 16 % of the square needing matte fill.
6. **Export** — \`{nhlId}-96.webp\` (≤ 12 KB), \`{nhlId}-192.webp\` (≤ 30 KB), \`{nhlId}-384.webp\` (≤ 70 KB), \`{nhlId}-192.avif\`; opaque RGB on a neutral dark matte (#14171C) where the photo does not fill; no transparency.
7. **Visual review** — every accepted crop is placed on a contact sheet and inspected (goalies in a full mask, obstructed or blurred frames, head-down/eyes-hidden shots, low-quality video stills and dated awkward frames are removed); decisions are stored in \`scripts/player-portraits/review.json\` keyed by NHL id **and** Commons file, so a changed P18 image returns to "pending" and is not published until re-reviewed. Only approved players are copied to \`public/assets/players/\` and listed in the manifest.

## Counts (this run)

| Stage | Players |
|---|---|
| Targets (unique NHL ids) | ${counts.targets} (${counts.skaters} skaters, ${counts.goalies} goalies) |
| Wikidata item found via P3522 | ${counts.wikidataAny} |
| … and verified (ice hockey player + name match) | ${counts.wikidata} |
| … with a P18 image | ${counts.p18} |
| Licence accepted (and photo ≤ ${PHOTO_MAX_AGE_YEARS} years old) | ${counts.license} |
| Crop accepted by the automatic face gate | ${counts.crop} |
| Visually accepted → published | **${counts.approved}** (${counts.approvedSkaters} skaters, ${counts.approvedGoalies} goalies) |
| Pending visual review (not published) | ${counts.pending} |

Published bytes (all four files per player): ${(counts.totalBytes / 1024).toFixed(1)} KB. Licence mix: ${mix}.

Commons "Restrictions" tags on published files (e.g. personality rights): ${approved.filter((r) => r.lic.restrictions).map((r) => `${r.name} (${r.lic.restrictions})`).join('; ') || 'none'}.

### Rejection reasons

| Reason | Players |
|---|---|
${tallyRows}

## Attribution table (published portraits)

| Player | Role | NHL id | Commons file | Author | Licence | Photo year |
|---|---|---|---|---|---|---|
${table}

## Target players without a portrait

${noPhoto.join('; ')}.
`;
  fs.mkdirSync(path.dirname(DOC), { recursive: true });
  fs.writeFileSync(DOC, md);
}

main().catch((e) => { console.error(e); process.exit(1); });
