const DEFAULT_BASE = 'https://propsports-api.sales-fd3.workers.dev';
const ALLOWED_PREFIXES = ['/nhl/', '/health/nhl-sources'];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const rawPath = typeof req.query.path === 'string' ? req.query.path : '/nhl/schedule/today';
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  if (!ALLOWED_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix))) {
    res.status(400).json({ ok: false, error: 'Unsupported NHL proxy path' });
    return;
  }

  const base = (process.env.PROPSPORTS_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === 'path') continue;
    if (Array.isArray(value)) value.forEach(v => params.append(key, String(v)));
    else if (value !== undefined && value !== null) params.set(key, String(value));
  }

  const target = `${base}${path}${params.size ? `?${params}` : ''}`;
  const headers = { Accept: 'application/json' };
  if (process.env.PROPSPORTS_DASHBOARD_SECRET) {
    headers['X-Dashboard-Secret'] = process.env.PROPSPORTS_DASHBOARD_SECRET;
  } else if (process.env.PROPSPORTS_API_KEY) {
    headers['X-API-Key'] = process.env.PROPSPORTS_API_KEY;
  }

  try {
    const upstream = await fetch(target, { headers });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', upstream.ok ? 's-maxage=10, stale-while-revalidate=30' : 'no-store');
    res.send(body);
  } catch (error) {
    res.status(502).json({ ok: false, error: 'PropSports upstream unavailable', details: String(error?.message || error) });
  }
}
