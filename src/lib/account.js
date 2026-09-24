// NHL Pro account state. The ONLY browser module that sends credentials, and
// only to the gateway's /auth/* and /pro/* routes. The browser never decides
// access: every answer here comes from nhl-gateway, which checks the
// server-side session and the billing ledger on each call. Nothing is kept in
// browser storage, and no query parameter or stored value can change the state.
import { GATEWAY_URL } from './api.js';
import { readMembership } from './pbe-membership.js';

const listeners = new Set();
let current = { state: 'unknown' };
let inflight = null;

// Readiness is environment configuration, not account state. Resolve it once
// per page load so every caller that asks "can anyone sign in here?" shares a
// single gateway read.
let readinessPromise = null;
function readiness() {
  if (!readinessPromise) {
    readinessPromise = fetch(`${GATEWAY_URL}/readiness`, { mode: 'cors', credentials: 'omit', headers: { Accept: 'application/json' } })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return readinessPromise;
}

// Sign-in exists in this environment only when the gateway reports every auth
// dependency configured. Until then the UI keeps the purchase surface closed
// and shows no sign-in form that could not work.
export async function signInAvailable() {
  const auth = (await readiness())?.auth;
  return Boolean(auth && auth.store && auth.throttle_key && auth.entitlement && auth.email);
}

async function authCall(path, { method = 'GET', body } = {}) {
  if (!/^\/(auth|pro)\//.test(path)) throw new Error('account.js only talks to /auth and /pro');
  let res;
  try {
    res = await fetch(`${GATEWAY_URL}${path}`, {
      method,
      mode: 'cors',
      credentials: 'include',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    // The call never reached the gateway (offline, DNS, CORS refusal). Status 0
    // means "no answer": callers must report that as a failure, never let it
    // escape as an unhandled rejection that leaves the UI mid-action.
    return { status: 0, data: null };
  }
  let data = null;
  try { data = await res.json(); } catch { /* handled by status */ }
  return { status: res.status, data };
}

function publish(next) {
  current = next;
  for (const fn of listeners) { try { fn(current); } catch { /* listener errors never break auth */ } }
}

export function onAccount(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

export function accountState() { return current; }

export async function refreshAccount() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { status, data } = await authCall('/auth/session');
      if (status !== 200 || !data || typeof data.state !== 'string') return publish({ state: 'signed_out' });
      // membership is the shared PropBetEdge contract object the gateway derived
      // from the billing verdict. readMembership accepts only a well-formed
      // object and never widens it: a non-pro state is always FREE here.
      const membership = readMembership(data.state === 'pro' ? data.membership : null, 'nhl');
      return publish({ state: data.state, email: data.email || null, subscription: data.subscription || null, membership });
    } catch {
      return publish({ state: 'signed_out' });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function requestSignIn(email) {
  const { status, data } = await authCall('/auth/request', { method: 'POST', body: { email } });
  if (status === 200) return { ok: true, message: data?.message || 'If that email has NHL Pro access, a sign-in link has been sent.' };
  if (status === 0) return { ok: false, message: 'Could not reach the sign-in service. Check your connection and try again.' };
  if (status === 429) return { ok: false, message: 'Too many requests. Wait a minute and try again.' };
  return { ok: false, message: data?.error || 'Sign-in is unavailable right now.' };
}

export async function confirmSignIn(token) {
  const { status, data } = await authCall('/auth/verify', { method: 'POST', body: { token } });
  if (status === 200 && data?.ok) {
    await refreshAccount();
    return { ok: true };
  }
  // No answer at all is "unavailable" (worth retrying), never "expired" (which
  // would tell someone their perfectly good link is dead).
  const error = data?.error || (status === 0 || status >= 500 ? 'unavailable' : 'expired');
  return { ok: false, error };
}

export async function signOut() {
  await authCall('/auth/logout', { method: 'POST', body: {} }).catch(() => {});
  publish({ state: 'signed_out' });
}

// Protected data: returns { ok, status, data }. A non-200 carries no protected
// values by construction (the gateway decides entitlement before reading them).
export async function proData(path) {
  const { status, data } = await authCall(path);
  if (status === 401 || status === 402) publish({ state: status === 401 ? 'signed_out' : 'not_entitled' });
  return { ok: status === 200 && data?.ok !== false, status, data };
}
