// Server-side proxy to the nhl-odds Worker (scheduled market snapshots).
// The read token lives only in Vercel env. Reads never trigger provider
// spend: the Worker serves its last KV snapshot.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const base = (process.env.NHL_ODDS_BASE_URL || '').replace(/\/$/, '');
  const token = process.env.NHL_ODDS_READ_TOKEN || '';
  if (!base || !token) return res.status(503).json({ ok: false, semantics: 'NOT_CONFIGURED', error: 'Market snapshots are not configured in this environment.' });
  const game = typeof req.query?.game === 'string' && /^\d{10}$/.test(req.query.game) ? req.query.game : null;
  if (req.query?.game && !game) return res.status(400).json({ ok: false, error: 'Invalid game id' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetch(`${base}/odds${game ? `?game=${game}` : ''}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, signal: controller.signal });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (upstream.ok) res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120, stale-while-revalidate=600');
    res.send(body);
  } catch (error) {
    res.status(502).json({ ok: false, semantics: 'UNAVAILABLE', error: 'Market snapshot service unavailable', details: controller.signal.aborted ? 'timeout' : String(error?.message || error) });
  } finally {
    clearTimeout(timer);
  }
}
