// All NHL data goes browser -> /api/nhl (Vercel server proxy) -> PropSports
// Worker. No provider or PropSports credential ever reaches the browser.

export class ApiError extends Error {
  constructor(message, { status = 0, kind = 'error', payload = null } = {}) {
    super(message);
    this.status = status;
    // kind: unavailable (source down) | error | not_deployed (route missing on
    // the backend this environment points at) | legacy (old contract) | timeout | aborted
    this.kind = kind;
    this.payload = payload;
  }
}

function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

async function request(url, { signal, timeout = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeout);
  const relay = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', relay, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* non-JSON handled below */ }
    if (!response.ok) {
      // The legacy production worker answers unknown NHL routes with 404 or a
      // paid-plan 403 ("Demo key is MLB-only") and no provenance envelope.
      const legacyGate = response.status === 403 && data && !data.schema && /MLB-only|plan|API key/i.test(String(data.error || ''));
      const kind = response.status === 404 || legacyGate ? 'not_deployed' : response.status >= 500 ? 'unavailable' : 'error';
      throw new ApiError(data?.error || `HTTP ${response.status}`, { status: response.status, kind, payload: data });
    }
    if (!data || typeof data !== 'object') throw new ApiError('Non-JSON response', { status: response.status, kind: 'unavailable' });
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal?.aborted) throw new ApiError('aborted', { kind: 'aborted' });
    if (controller.signal.aborted) throw new ApiError('Request timed out', { kind: 'timeout' });
    throw new ApiError(String(error?.message || error), { kind: 'unavailable' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}

function withMeta(data) {
  const receivedAt = Date.now();
  return {
    data,
    meta: {
      schema: data.schema || null,
      source: data.source || null,
      source_urls: Array.isArray(data.source_urls) ? data.source_urls : [],
      fetched_at: data.fetched_at || null,
      ttl_s: Number.isFinite(data.ttl_s) ? data.ttl_s : null,
      stale_after_s: Number.isFinite(data.stale_after_s) ? data.stale_after_s : null,
      received_at: receivedAt
    }
  };
}

// Which contract this environment's API serves: 'v2' | 'legacy' | 'unknown'.
// Resolved once from the server-side probe; 'unknown' lets requests through.
let envPromise = null;
export function dataLayer() {
  if (!envPromise) {
    envPromise = fetch('/api/env', { headers: { Accept: 'application/json' } })
      .then(r => (r.ok ? r.json() : null))
      .then(j => j?.data_layer || 'unknown')
      .catch(() => 'unknown');
  }
  return envPromise;
}

// NHL data route. Throws ApiError { kind: 'not_deployed' } when this
// environment's backend lacks the v2 routes (without making the request), and
// { kind: 'legacy' } if a response arrives without the provenance envelope.
export async function nhl(path, params = {}, options = {}) {
  if (!options.skipEnvCheck && (await dataLayer()) === 'legacy') {
    throw new ApiError('NHL intelligence v2 routes are not deployed in this environment.', { kind: 'not_deployed' });
  }
  const query = qs(params);
  const url = `/api/nhl?path=${encodeURIComponent(path)}${query ? `&${query}` : ''}`;
  const data = await request(url, options);
  if (!data.schema && options.requireSchema !== false) {
    throw new ApiError('Backend serves the legacy NHL contract (no provenance envelope).', { kind: 'legacy', payload: data });
  }
  return withMeta(data);
}

export async function news(params = {}, options = {}) {
  return nhl('/nhl/news', params, options);
}

export function describeError(error) {
  if (!(error instanceof ApiError)) return { title: 'Unexpected error', body: String(error?.message || error) };
  switch (error.kind) {
    case 'not_deployed':
    case 'legacy':
      return {
        title: 'Data layer not deployed here',
        body: 'This environment points at a PropSports API that does not yet serve the NHL intelligence v2 routes. Nothing is shown rather than something invented.'
      };
    case 'timeout':
      return { title: 'Source timed out', body: 'The NHL source did not answer in time. Retrying automatically.' };
    case 'unavailable':
      return { title: 'Source unavailable', body: 'The NHL source is not responding. Last known data, if any, stays on screen marked STALE.' };
    default:
      return { title: 'Request failed', body: error.message };
  }
}
