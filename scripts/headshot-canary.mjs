#!/usr/bin/env node
// Live NHL headshot canary — proves the REAL production image chain.
//
//   A  api-web.nhle.com/v1/player/{id}/landing  -> playerId, currentTeamAbbrev, headshot
//   B  the exact headshot URL the NHL payload returned (direct)
//   C  the SAME url through the deployed PropBetEdge image proxy
//   D  the URL the frontend constructs from {id, team} as a fallback
//
// Nothing here is mocked. The browser E2E suite stubs the proxy; this does not.
// Run: node scripts/headshot-canary.mjs [--json]
//
// Exit 0 = every layer passed for every player.

const PROXY = 'https://propbet-img-proxy.sales-fd3.workers.dev/?url=';
const NHL_HEADSHOT_SEASONS = ['20262027', '20252026']; // must match src/components/player.js

// Real, current NHL players. Skaters + goalies, a dozen clubs.
const PLAYERS = [
  { id: 8478402, expect: 'Connor McDavid' },
  { id: 8477934, expect: 'Leon Draisaitl' },
  { id: 8479318, expect: 'Auston Matthews' },
  { id: 8477492, expect: 'Nathan MacKinnon' },
  { id: 8480069, expect: 'Cale Makar' },
  { id: 8477493, expect: 'Aleksander Barkov' },
  { id: 8476883, expect: 'Andrei Vasilevskiy' },
  { id: 8476453, expect: 'Nikita Kucherov' },
  { id: 8478403, expect: 'Jack Eichel' },
  { id: 8478499, expect: 'Adin Hill' },
  { id: 8471675, expect: 'Sidney Crosby' },
  { id: 8479406, expect: 'Filip Gustavsson' },
  { id: 8480036, expect: 'Miro Heiskanen' },
  { id: 8478048, expect: 'Igor Shesterkin' },
  { id: 8471214, expect: 'Alex Ovechkin' }
];

const IMAGE_TYPES = /^image\/(png|jpeg|webp|avif|gif)$/;

function dimensions(buf) {
  if (buf.length > 24 && buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
    return { format: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

async function image(url, label) {
  const started = Date.now();
  const res = await fetch(url, { redirect: 'manual' });
  const out = {
    label,
    url,
    status: res.status,
    redirected: res.status >= 300 && res.status < 400,
    location: res.headers.get('location'),
    contentType: res.headers.get('content-type'),
    cacheControl: res.headers.get('cache-control'),
    cors: res.headers.get('access-control-allow-origin'),
    proxySource: res.headers.get('x-proxy-source'),
    ms: 0,
    bytes: 0,
    dims: null,
    ok: false,
    why: []
  };
  const buf = Buffer.from(await res.arrayBuffer());
  out.ms = Date.now() - started;
  out.bytes = buf.length;
  out.dims = dimensions(buf);
  if (out.status !== 200) out.why.push('HTTP ' + out.status);
  if (!IMAGE_TYPES.test(String(out.contentType || '').split(';')[0].trim())) out.why.push('content-type ' + out.contentType);
  if (out.bytes < 1024) out.why.push(out.bytes + ' bytes');
  if (!out.dims || out.dims.w < 32 || out.dims.h < 32) out.why.push('no decodable image dimensions');
  out.ok = out.why.length === 0;
  return out;
}

function constructedUrls(id, team) {
  return NHL_HEADSHOT_SEASONS.map(season => 'https://assets.nhle.com/mugs/nhl/' + season + '/' + team + '/' + id + '.png');
}

async function run() {
  const json = process.argv.includes('--json');
  const rows = [];
  for (const player of PLAYERS) {
    const row = { id: player.id, expect: player.expect, pass: false, notes: [] };
    try {
      const res = await fetch('https://api-web.nhle.com/v1/player/' + player.id + '/landing');
      if (res.status !== 200) throw new Error('landing HTTP ' + res.status);
      const p = await res.json();
      row.name = ((p.firstName && p.firstName.default) || '') + ' ' + ((p.lastName && p.lastName.default) || '');
      row.name = row.name.trim();
      row.team = p.currentTeamAbbrev || null;
      row.position = p.position || null;
      row.headshot = p.headshot || null;
      row.A = Number(p.playerId) === player.id && Boolean(row.team) && /^https:\/\/assets\.nhle\.com\//.test(String(row.headshot));
      if (Number(p.playerId) !== player.id) row.notes.push('landing playerId ' + p.playerId);
      if (row.name !== player.expect) row.notes.push('name is "' + row.name + '", expected "' + player.expect + '"');
      if (!row.A) { rows.push(row); continue; }

      row.b = await image(row.headshot, 'direct');
      row.c = await image(PROXY + encodeURIComponent(row.headshot), 'proxy');
      if (row.c.ok && row.b.ok && row.c.bytes !== row.b.bytes) row.notes.push('proxy returned ' + row.c.bytes + ' bytes vs ' + row.b.bytes + ' direct');

      // The URL the app builds when a payload headshot is absent, so a silent
      // league path change is caught here and not in a user's browser.
      const built = constructedUrls(player.id, row.team);
      row.constructedMatches = built.includes(row.headshot);
      row.d = await image(PROXY + encodeURIComponent(built[0]), 'constructed');
      if (!row.constructedMatches) row.notes.push('constructed ' + built[0] + ' != payload headshot');

      row.pass = row.A && row.b.ok && row.c.ok && row.d.ok && row.name === player.expect;
    } catch (error) {
      row.notes.push(String((error && error.message) || error));
    }
    rows.push(row);
  }

  const failed = rows.filter(r => !r.pass);
  if (json) {
    console.log(JSON.stringify({ checked_at: new Date().toISOString(), proxy: PROXY, players: rows.length, failed: failed.length, rows }, null, 2));
  } else {
    console.log('NHL headshot canary - ' + rows.length + ' players, live chain, proxy ' + PROXY + '\n');
    const pad = (v, n) => String(v).padEnd(n);
    console.log(pad('player', 20) + pad('team', 6) + pad('pos', 5) + pad('A api', 7) + pad('B direct', 22) + pad('C proxy', 24) + pad('D built', 12));
    for (const r of rows) {
      const b = r.b ? r.b.status + ' ' + String(r.b.contentType).split(';')[0] + ' ' + (r.b.dims ? r.b.dims.w + 'x' + r.b.dims.h : '?') : '-';
      const c = r.c ? r.c.status + ' ' + String(r.c.contentType).split(';')[0] + ' ' + (r.c.bytes / 1024).toFixed(0) + 'KB' : '-';
      const d = r.d ? r.d.status + ' ' + (r.constructedMatches ? '=payload' : 'DIFFERS') : '-';
      console.log(pad(String(r.name || r.expect).slice(0, 19), 20) + pad(r.team || '-', 6) + pad(r.position || '-', 5) + pad(r.A ? 'ok' : 'FAIL', 7) + pad(b, 22) + pad(c, 24) + pad(d, 12) + (r.pass ? '' : '  <-- ' + r.notes.join('; ')));
    }
    const sample = rows.find(r => r.c);
    if (sample) {
      console.log('\nproxy response headers (' + sample.name + '):');
      console.log('  status ' + sample.c.status + ' - content-type ' + sample.c.contentType + ' - ' + sample.c.bytes + ' bytes');
      console.log('  cache-control ' + sample.c.cacheControl);
      console.log('  access-control-allow-origin ' + sample.c.cors);
      console.log('  x-proxy-source ' + sample.c.proxySource + '   30x surfaced to caller: ' + (sample.c.redirected ? 'yes' : 'no - proxy returned the image itself'));
    }
    console.log('\n' + (rows.length - failed.length) + '/' + rows.length + ' players pass every layer.');
    for (const r of failed) console.log('  FAIL ' + r.expect + ': ' + (r.notes.join('; ') || 'see row'));
  }
  process.exit(failed.length ? 1 : 0);
}

run().catch(error => { console.error(error); process.exit(1); });
