// Kalshi Market Intelligence for NHL (contract market-intel/1).
// The browser reads our propsports-markets API only, never Kalshi itself; the
// shared vendored client (src/vendor/kalshi/) coalesces requests and resolves
// failures to "nothing", so no market UI renders without a real entry.
// Event ids are canonical NHL gamePks (10 digits), the same ids the board uses.
import { createKalshiClient } from '../vendor/kalshi/kalshi-market-client.js';

const base = import.meta.env?.VITE_MARKETS_URL || undefined;
export const kalshi = createKalshiClient(base ? { sport: 'nhl', base } : { sport: 'nhl' });

// Poll state for a game from our own status semantics: in progress -> 'live',
// before puck drop -> 'pregame', anything else (final, postponed) -> null (stop).
export function kalshiPollState(key) {
  if (key === 'LIVE' || key === 'INTERMISSION') return 'live';
  if (key === 'SCHEDULED' || key === 'PREGAME') return 'pregame';
  return null;
}

// ALGO vs MARKET (contract algo-vs-market/1, same propsports-markets API): the official
// PBE NHL Model's pick and the market's pick, both frozen at the PBE lock. The browser
// renders exactly what the API returns: `algos` is empty until the first qualifying frozen
// comparison, and a failed read is null (nothing renders, nothing is invented).
const AVM_BASE = String(base || 'https://propsports-markets.sales-fd3.workers.dev').replace(/\/+$/, '');
async function avmRead(path, fetchImpl) {
  try {
    const res = await fetchImpl(`${AVM_BASE}${path}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
const defaultFetch = (...a) => globalThis.fetch(...a);

/** Track record: { algos: [...] } or null on failure. */
export async function loadAlgoVsMarket({ fetchImpl = defaultFetch } = {}) {
  const body = await avmRead('/v1/algo-vs-market/nhl', fetchImpl);
  return body && Array.isArray(body.algos) ? body : null;
}

/** One game (canonical id = NHL gamePk): { comparisons: [...] } or null on failure. */
export async function loadAlgoVsMarketEvent(gameId, { fetchImpl = defaultFetch } = {}) {
  if (!gameId) return null;
  const body = await avmRead(`/v1/algo-vs-market/event/nhl/${encodeURIComponent(String(gameId))}`, fetchImpl);
  return body && Array.isArray(body.comparisons) ? body : null;
}

// "AWAY @ HOME" -> { away, home } (the picks ledger's own matchup label).
export function splitMatchup(matchup) {
  const m = /^\s*(.+?)\s+@\s+(.+?)\s*$/.exec(String(matchup || ''));
  return m ? { away: m[1], home: m[2] } : null;
}

// Event label for an AVM ledger row from data the page already has: the picks ledger's matchup
// for that game, else the frozen market's own away/home labels; otherwise the row is unchanged.
export function avmWithEventLabels(algo, matchupOf = () => null) {
  if (!algo || !Array.isArray(algo.ledger)) return algo;
  const ledger = algo.ledger.map(r => {
    if (r.event_label) return r;
    const fromPage = matchupOf(r.canonical_event_id);
    const p = r.market?.prices;
    const label = fromPage || (p?.away?.label && p?.home?.label ? `${p.away.label} @ ${p.home.label}` : null);
    return label ? { ...r, event_label: label } : r;
  });
  return { ...algo, ledger };
}
