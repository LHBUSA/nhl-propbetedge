// Compact Skater DNA inside PBE Cast (nhl-skater-dna/1.0.0, FROZEN).
//
// Stored snapshots only: this module never computes a percentile, score,
// trait or ranking. It (1) picks WHICH event and WHICH canonical player ids
// the current cast moment is about, straight from the play's own player roles
// (never inferred), (2) chooses which STORED dimension to show first for that
// event type (presentation only; DNA describes a profile, it does not explain
// the event), and (3) caches each player's stored snapshot once per session.
// Goalie DNA is not released: goalies never get a DNA card.
import { esc } from './dom.js';
import { dnaConfigured, nhl } from './api.js';
import { specialTeams, STATE } from './special-teams.js';

export const DNA_VERSION = 'nhl-skater-dna/1.0.0';

const SHOTS = new Set(['shot-on-goal', 'missed-shot', 'blocked-shot']);
// Event type -> the roles that carry a canonical player id we may show, and the
// stored dimension shown first for that role (subtle priority only).
const ROLES = {
  goal: [['scorer', 'goal_scoring'], ['assist1', 'playmaking'], ['assist2', 'playmaking']],
  'shot-on-goal': [['shooter', 'shot_generation']],
  'missed-shot': [['shooter', 'shot_generation']],
  'blocked-shot': [['shooter', 'shot_generation']],
  penalty: [['committed_by', 'penalty_differential']],
  faceoff: [['faceoff_winner', 'faceoffs'], ['faceoff_loser', 'faceoffs']]
};
const LABELS = {
  shot_generation: 'Shot Generation', shot_location: 'Shot Location', goal_scoring: 'Goal Scoring', finishing: 'Finishing',
  playmaking: 'Playmaking', power_play: 'Power Play', faceoffs: 'Faceoffs', shot_blocking: 'Shot Blocking',
  physicality: 'Physicality', penalty_differential: 'Penalty Differential'
};
const PEER = { forward: 'forwards', defense: 'defensemen' };
const ROLE_LABEL = { scorer: 'Goal', assist1: 'Primary assist', assist2: 'Secondary assist', shooter: 'Shot', committed_by: 'Penalty', faceoff_winner: 'Faceoff won', faceoff_loser: 'Faceoff lost' };
const seasonLabel = s => `${String(s).slice(0, 4)}–${String(s).slice(6, 8)}`;
const isEligible = p => Boolean(ROLES[p?.type]);

/**
 * The cast moment DNA is about. Pure and deterministic: the same plays, cursor
 * and selection always give the same event and players (replay-safe).
 *   plays        ordered play stream as displayed (already sliced at a replay cursor)
 *   selectedSort sort_order the user selected (feed / rink), or null
 *   roster       cast.roster [{ id, position }]
 */
export function momentContext(plays, { selectedSort = null, roster = [] } = {}) {
  const list = Array.isArray(plays) ? plays : [];
  let idx = -1;
  if (selectedSort !== null && selectedSort !== undefined) idx = list.findIndex(p => Number(p.sort_order) === Number(selectedSort) && isEligible(p));
  if (idx < 0) for (let i = list.length - 1; i >= 0; i -= 1) if (isEligible(list[i])) { idx = i; break; }
  if (idx < 0) return null;
  const play = list[idx];
  const pos = new Map((roster || []).map(r => [Number(r.id), r.position || null]));
  // Power play at this exact event (from the authoritative situation code).
  const st = specialTeams(list, { cursorIndex: idx });
  const pp = st.state === STATE.POWER_PLAY || st.state === STATE.FIVE_ON_THREE ? st.advantaged_side : null;
  const actors = [];
  for (const [role, dim] of ROLES[play.type]) {
    const who = (play.players || []).find(x => x.role === role);
    const id = Number(who?.id);
    if (!who || !Number.isInteger(id) || id <= 0) continue;           // no canonical id -> nothing shown
    if (pos.get(id) === 'G') continue;                                 // goalie DNA is not released
    const onPp = pp && who.side === pp && play.type !== 'faceoff' && play.type !== 'penalty';
    actors.push({ id, name: who.name || null, number: who.number ?? null, side: who.side || null, role, priority: onPp ? 'power_play' : dim, power_play: Boolean(onPp) });
  }
  if (!actors.length) return null;
  return { sort_order: play.sort_order ?? null, type: play.type, period: play.period ?? null, clock: play.time_in_period || null, actors };
}

/**
 * Stored lines for the compact card: the event-related stored dimension first
 * (only if it is LIVE and scored; a PROXY or unscored dimension is never
 * promoted), then the stored defining strengths (verbatim, deduplicated). At
 * most `max` lines. Every value is read from the snapshot.
 */
export function compactLines(snapshot, priority, { max = 3 } = {}) {
  if (!snapshot || snapshot.kind !== 'skater') return [];
  const ranked = snapshot.qualification?.qualified === true && snapshot.rank_claim === true;
  if (!ranked) return [];
  const dims = snapshot.dimensions || {};
  const line = (k, related) => ({ key: k, label: LABELS[k] || k, score: dims[k].score, status: dims[k].status, proxy: dims[k].status === 'PROXY', related });
  const out = [];
  const p = dims[priority];
  if (p && p.status === 'LIVE' && p.score !== null && p.score !== undefined) out.push(line(priority, true));
  for (const k of snapshot.traits?.strongest || []) {
    if (out.length >= max) break;
    if (out.some(x => x.key === k) || !dims[k] || dims[k].score === null) continue;
    out.push(line(k, false));
  }
  return out.slice(0, max);
}

/** Compact card markup (stored values only). */
export function renderCompactDna(snapshot, actor, { gameSeason = null } = {}) {
  if (!snapshot || snapshot.kind !== 'skater' || Number(snapshot.player_id) !== Number(actor.id)) return '';
  const ranked = snapshot.qualification?.qualified === true && snapshot.rank_claim === true;
  const lines = compactLines(snapshot, actor.priority);
  const season = seasonLabel(snapshot.season);
  const seasonNote = gameSeason && String(snapshot.season) !== String(gameSeason) ? `Latest stored DNA · ${season}` : season;
  const peer = String(snapshot.peer_group || '').toUpperCase();
  const body = ranked
    ? (lines.length
      ? `<ul class="cast-dna__lines">${lines.map(l => `<li class="${l.related ? 'is-related' : ''}${l.proxy ? ' is-proxy' : ''}" data-dim="${esc(l.key)}"><span>${esc(l.label)}${l.proxy ? ' <b class="cast-dna__proxy">PROXY</b>' : ''}</span><b class="mono">${esc(l.score)}</b></li>`).join('')}</ul>`
      : '<p class="cast-dna__quiet">Balanced profile · no defining strength</p>')
      + `<p class="cast-dna__pop">${esc(snapshot.population?.n ?? '')} qualified ${esc(PEER[snapshot.peer_group] || 'peers')} · percentile, same season</p>`
    : '<p class="cast-dna__quiet">Current season measured · percentile DNA not ranked yet</p>';
  return `<div class="cast-dna" data-cast-dna="${esc(actor.id)}" data-season="${esc(snapshot.season)}">
    <div class="cast-dna__head"><span class="cast-dna__eyebrow">PLAYER DNA</span><span class="cast-dna__meta">${esc(peer)} · ${esc(seasonNote)}</span></div>
    ${body}
    <a class="cast-dna__link" href="#/player/${esc(actor.id)}">Open full Player DNA →</a>
  </div>`;
}

export const roleLabel = r => ROLE_LABEL[r] || r;

// ---------------------------------------------------------------- session cache
// One request per player + season for the whole PBE Cast session; failures are
// remembered too, so polling never re-requests. A cast never waits on DNA.
const cache = new Map();          // `${id}|${season}|${version}` -> { status, snapshot }
let publication = null;           // Promise<boolean>: gateway bound AND DNA published

async function published(nhlImpl, configured) {
  if (!publication) {
    publication = (async () => {
      try {
        if (!(await configured())) return false;
        const meta = await nhlImpl('/nhl/dna/meta', {}, { requireSchema: false, timeout: 6000 });
        return meta?.data?.published === true;
      } catch { return false; }
    })();
  }
  return publication;
}

export function peekDna(id, season) {
  return cache.get(`${Number(id)}|${season}|${DNA_VERSION}`) || null;
}

/**
 * Load a player's stored snapshot for `season` once. A 404 for that season
 * (e.g. a new season not stored yet) falls back to the player's latest stored
 * snapshot, which the card labels with its own season.
 */
export async function loadDna(id, season, { nhlImpl = nhl, configured = dnaConfigured } = {}) {
  const key = `${Number(id)}|${season}|${DNA_VERSION}`;
  const hit = cache.get(key);
  if (hit) return hit.promise || hit;
  const entry = { status: 'pending', snapshot: null };
  entry.promise = (async () => {
    try {
      if (!(await published(nhlImpl, configured))) { entry.status = 'none'; return entry; }
      let res = null;
      // absent=empty: an expected miss is a 200 with snapshot:null, so asking
      // about a player without stored DNA never logs a failed request.
      try { res = await nhlImpl(`/nhl/dna/players/${Number(id)}`, season ? { season, absent: 'empty' } : { absent: 'empty' }, { requireSchema: false, timeout: 8000 }); } catch { res = null; }
      if (!res?.data?.snapshot && season) {
        try { res = await nhlImpl(`/nhl/dna/players/${Number(id)}`, { absent: 'empty' }, { requireSchema: false, timeout: 8000 }); } catch { res = null; }
      }
      const snap = res?.data?.snapshot;
      if (snap && snap.kind === 'skater' && Number(snap.player_id) === Number(id) && snap.version === DNA_VERSION) { entry.snapshot = snap; entry.status = 'ready'; }
      else entry.status = 'none';
    } catch { entry.status = 'none'; }
    delete entry.promise;
    return entry;
  })();
  cache.set(key, entry);
  return entry.promise;
}

// Test hook: forget the session cache.
export function _resetDnaCache() { cache.clear(); publication = null; }
