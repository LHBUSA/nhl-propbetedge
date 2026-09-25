// NHL intelligence client (nhl-gateway -> nhl-metrics).
//
// Free viewers read /nhl/intel/* with no credentials. Pro values live only
// behind /pro/intel/*, reached ONLY through account.js (the one module that
// sends credentials) and ONLY after the gateway has said the account is `pro`.
// A signed-out or unentitled viewer never causes a /pro/ request, and the
// gateway re-checks entitlement on every Pro call anyway: nothing here decides
// access, it only avoids asking for what the gateway would refuse.
import { ApiError, nhl } from './api.js';
import { accountState, onAccount, proData, refreshAccount, signInAvailable } from './account.js';

let accountReady = null;
// Resolve the account state once per page load (shares account.js's request).
export async function intelTier() {
  const cur = accountState();
  if (cur.state && cur.state !== 'unknown') return cur.state === 'pro' ? 'pro' : 'free';
  if (!accountReady) {
    accountReady = (async () => {
      if (!(await signInAvailable())) return 'free';
      // refreshAccount() publishes the state; it does not return it.
      await refreshAccount();
      return accountState().state === 'pro' ? 'pro' : 'free';
    })().catch(() => 'free');
  }
  return accountReady;
}

// Re-render hook for pages: fires when the account state changes (sign-in/out).
export function onTierChange(fn) {
  let last = null;
  return onAccount(a => {
    const tier = a?.state === 'pro' ? 'pro' : a?.state === 'unknown' ? null : 'free';
    if (tier && tier !== last) { const first = last === null; last = tier; if (!first) fn(tier); }
  });
}

function query(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

function meta(data) {
  return {
    schema: data?.schema || null,
    source: 'PBE intelligence · NHL',
    source_urls: Array.isArray(data?.source_urls) ? data.source_urls : [],
    fetched_at: data?.captured_at || data?.fetched_at || null,
    ttl_s: Number.isFinite(data?.ttl_s) ? data.ttl_s : 900,
    stale_after_s: Number.isFinite(data?.stale_after_s) ? data.stale_after_s : 3 * 3600,
    received_at: Date.now()
  };
}

// path: the part after /intel (e.g. '/winhl', '/game/<10-digit game id>').
// proParams are only sent on the Pro route (e.g. window/team filters).
// proOnly: the resource has no free route (e.g. player fatigue). A refused Pro
// call then ends as a 'locked' error instead of falling back to a route that
// does not exist.
export async function intel(path, { params = {}, proParams = {}, signal, tier = null, proOnly = false } = {}) {
  const t = tier || (await intelTier());
  if (proOnly && t !== 'pro') throw new ApiError('NHL Pro required', { status: 402, kind: 'locked' });
  if (t === 'pro') {
    const res = await proData(`/pro/intel${path}${query({ ...params, ...proParams })}`);
    if (res.ok) return { data: res.data, meta: meta(res.data), tier: 'pro' };
    if (proOnly) throw new ApiError(res.data?.error || 'NHL Pro required', { status: res.status, kind: res.status === 401 || res.status === 402 ? 'locked' : 'unavailable', payload: res.data });
    // Entitlement ended or the route refused: fall through to the free read.
    if (res.status !== 401 && res.status !== 402 && res.status !== 404) {
      throw new ApiError(res.data?.error || `HTTP ${res.status}`, { status: res.status, kind: res.status === 0 || res.status >= 500 ? 'unavailable' : 'error', payload: res.data });
    }
  }
  const res = await nhl(`/nhl/intel${path}`, params, { signal, timeout: 25000 });
  return { data: res.data, meta: { ...res.meta, ...meta(res.data), gateway_semantics: res.meta.gateway_semantics }, tier: 'free' };
}

export const isLocked = value => Boolean(value && typeof value === 'object' && value.locked === true);
