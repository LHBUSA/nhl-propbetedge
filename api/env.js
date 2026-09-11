// Reports which NHL data contract this environment's PropSports API serves,
// probed server-side so the browser never fires requests that are certain to
// fail. v2 responses carry a `schema`; the legacy worker's do not.
const DEFAULT_BASE = 'https://propsports-api.sales-fd3.workers.dev';
let cache = null;

export default async function handler(req, res) {
  const base = (process.env.PROPSPORTS_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  if (!cache || Date.now() - cache.at > 5 * 60 * 1000) {
    let layer = 'unknown';
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const r = await fetch(`${base}/nhl/schedule?date=2026-01-01`, { headers: { Accept: 'application/json' }, signal: controller.signal });
      clearTimeout(timer);
      const body = await r.json().catch(() => null);
      layer = r.ok && body && typeof body === 'object' ? (body.schema ? 'v2' : 'legacy') : 'unknown';
    } catch {
      layer = 'unknown';
    }
    cache = { at: Date.now(), layer };
  }
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  res.status(200).json({
    ok: true,
    data_layer: cache.layer,
    odds: process.env.NHL_ODDS_BASE_URL && process.env.NHL_ODDS_READ_TOKEN ? 'configured' : 'not_configured',
    checked_at: new Date(cache.at).toISOString()
  });
}
