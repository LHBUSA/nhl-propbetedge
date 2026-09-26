// NHL Skater DNA on the player profile (nhl-skater-dna/1.0.0, FROZEN).
//
// Data: gateway /nhl/dna/players/:id/history -> stored snapshots + the stored
// DNA-over-time summary. The panel renders ONLY on a 200 with ok:true. Any
// other outcome (451 rights gate, 404 no DNA, 400 unknown route on a gateway
// without DNA, 5xx, network) renders NOTHING: production stays dark until the
// backend is enabled. Skaters only; goalie DNA is not released.
//
// The browser never computes a percentile, score, trait or trend: it only
// selects which stored snapshot to show.
import { dnaConfigured, nhl } from './api.js';
import { renderSkaterDna } from '../components/player-dna.js';

// No request that can fail is made unless the DNA service is both bound on the
// gateway (readiness, already fetched once per session) and published
// (/nhl/dna/meta always answers 200): a dark page logs no console errors.
export async function fetchSkaterDna(playerId, { signal, nhlImpl = nhl, configured = dnaConfigured } = {}) {
  try {
    if (!(await configured())) return null;
    const meta = await nhlImpl('/nhl/dna/meta', {}, { signal, requireSchema: false, timeout: 6000 });
    if (meta?.data?.published !== true) return null;
    const res = await nhlImpl(`/nhl/dna/players/${Number(playerId)}/history`, {}, { signal, requireSchema: false, timeout: 9000 });
    const d = res?.data;
    if (!d || d.ok !== true || !Array.isArray(d.snapshots) || !d.snapshots.length) return null;
    if (d.snapshots.some(s => s.kind !== 'skater')) return null;
    return d;
  } catch {
    return null;   // 451 / 404 / 400 / 5xx / timeout / abort: stay dark
  }
}

// Default = the latest ACTUAL season (even when unranked: raw values, no
// percentiles), per the MLB lesson. An unknown requested season falls back.
export function selectSnapshot(payload, season = null) {
  const snaps = [...(payload?.snapshots || [])].sort((a, b) => a.season - b.season);
  if (!snaps.length) return null;
  if (season !== null) {
    const hit = snaps.find(s => String(s.season) === String(season));
    if (hit) return hit;
  }
  const active = payload.history?.active_season;
  return snaps.find(s => s.season === active) || snaps[snaps.length - 1];
}

export function renderDnaPanel(payload, { season = null, focus = null } = {}) {
  const snapshot = selectSnapshot(payload, season);
  if (!snapshot) return '';
  return renderSkaterDna({ snapshot, history: payload.history || null, season: snapshot.season, focus });
}
