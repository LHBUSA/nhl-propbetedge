// Server-side proxy: browser -> Vercel -> PropSports Worker.
// The dashboard secret / API key lives only in Vercel env and is attached here.
// Paths and query parameters are allowlisted: the secret must never be
// steerable toward non-NHL routes (e.g. "/nhl/../mlb/..."), and this is not
// an open proxy.
const DEFAULT_BASE = 'https://propsports-api.sales-fd3.workers.dev';

const ROUTES = [
  /^\/health\/nhl-sources$/,
  /^\/nhl\/(?:board|news|schedule|schedule\/today|scoreboard|games\/live|standings|leaders|goalies\/leaders)$/,
  /^\/nhl\/game\/\d{10}(?:\/(?:boxscore|plays|shots|cast|goalies|deployment))?$/,
  /^\/nhl\/player\/\d{6,10}(?:\/(?:stats|game-log))?$/,
  /^\/nhl\/team\/[A-Z]{2,4}\/(?:roster|stats|schedule|deployment)$/,
  /^\/nhl\/goalie\/\d{6,10}\/edge$/
];

const PARAMS = {
  date: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
  season: v => /^\d{8}$/.test(v),
  gameType: v => /^[123]$/.test(v),
  category: v => /^[A-Za-z][A-Za-z ]{0,31}$/.test(v),
  limit: v => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 100,
  position: v => v === 'goalie' || v === 'skater'
};

export function resolveTarget(query = {}, base = DEFAULT_BASE) {
  const raw = typeof query.path === 'string' ? query.path : '/nhl/board';
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (path.includes('..') || path.includes('//') || !ROUTES.some(re => re.test(path))) return { error: 'Unsupported NHL proxy path' };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === 'path') continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (!PARAMS[key]) return { error: `Unsupported query parameter: ${key}` };
    if (v === undefined || v === null || v === '') continue;
    if (!PARAMS[key](String(v))) return { error: `Invalid value for ${key}` };
    params.set(key, String(v));
  }
  const qs = params.toString();
  return { url: `${base.replace(/\/$/, '')}${path}${qs ? `?${qs}` : ''}` };
}

function cacheHeader(upstreamControl, ok) {
  if (!ok) return 'no-store';
  const m = /max-age=(\d+)/.exec(upstreamControl || '');
  const ttl = m ? Math.min(Number(m[1]), 900) : 10;
  if (ttl <= 0) return 'no-store';
  return `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${Math.max(10, ttl * 2)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  const target = resolveTarget(req.query || {}, process.env.PROPSPORTS_BASE_URL || DEFAULT_BASE);
  if (target.error) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(400).json({ ok: false, error: target.error });
    return;
  }

  const headers = { Accept: 'application/json' };
  if (process.env.PROPSPORTS_DASHBOARD_SECRET) headers['X-Dashboard-Secret'] = process.env.PROPSPORTS_DASHBOARD_SECRET;
  else if (process.env.PROPSPORTS_API_KEY) headers['X-API-Key'] = process.env.PROPSPORTS_API_KEY;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const upstream = await fetch(target.url, { headers, signal: controller.signal });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', cacheHeader(upstream.headers.get('cache-control'), upstream.ok));
    res.send(body);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({
      ok: false,
      error: 'PropSports upstream unavailable',
      semantics: 'UNAVAILABLE',
      details: controller.signal.aborted ? 'timeout' : String(error?.message || error),
      fetched_at: new Date().toISOString()
    });
  } finally {
    clearTimeout(timer);
  }
}
