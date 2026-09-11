// LIMITED MODE. When the environment's PropSports API does not yet serve the
// NHL v2 routes (production runs the legacy worker until nhl-intelligence-v1
// is promoted), the Ice Board falls back to the legacy public schedule route.
// Real NHL schedule data only; provenance is labelled as the legacy route and
// fetched_at is the moment this browser received it. No scores are inferred.
import { addDays } from './format.js';
import { gatewayUrl } from './api.js';
import { TEAMS } from './teams.js';

// Verified 2026-09-11 from api-web.nhle.com /schedule (preSeasonStartDate,
// regularSeasonStartDate, regularSeasonEndDate). Used only in limited mode.
const CALENDAR_2026_27 = {
  preseason_start: '2026-09-19',
  regular_season_start: '2026-09-29',
  regular_season_end: '2027-04-10',
  playoff_end: null
};

const byName = new Map(TEAMS.map(t => [t.name.toLowerCase(), t]));

function legacyTeam(name, score) {
  const t = byName.get(String(name || '').toLowerCase());
  return {
    id: null,
    abbrev: t?.abbrev || null,
    name: name || null,
    place: t?.place || null,
    logo: null,
    dark_logo: null,
    score: Number.isFinite(Number(score)) && score !== null ? Number(score) : null,
    sog: null
  };
}

function legacySemantics(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'LIVE' || s === 'CRIT') return 'LIVE';
  if (s === 'FINAL' || s === 'OFF') return 'FINAL';
  if (s === 'PRE') return 'PREGAME';
  if (s === 'FUT') return 'SCHEDULED';
  return 'UNAVAILABLE';
}

function legacyGame(g) {
  const id = String(g.id || '');
  return {
    id,
    season: null,
    game_type: /^\d{10}$/.test(id) ? Number(id.slice(4, 6)) : null,
    date: null,
    start_time_utc: g.date || null,
    status: { state: g.status || null, schedule_state: null, semantics: legacySemantics(g.status), period: null, period_type: null, clock: null, in_intermission: null, last_period_type: null },
    venue: g.venue || null,
    teams: { away: legacyTeam(g.away, g.awayScore), home: legacyTeam(g.home, g.homeScore) },
    broadcasts: (g.tv || []).map(network => ({ network, market: null, country: 'US' }))
  };
}

function phase(date) {
  const c = CALENDAR_2026_27;
  if (date < c.preseason_start) return 'OFFSEASON';
  if (date < c.regular_season_start) return 'PRESEASON';
  if (date <= c.regular_season_end) return 'REGULAR_SEASON';
  return 'UNKNOWN';
}

async function legacySchedule(date, signal) {
  const res = await fetch(gatewayUrl('/nhl/schedule', { date }), { signal, mode: 'cors', credentials: 'omit', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`legacy schedule HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.games)) throw new Error('legacy schedule shape mismatch');
  return data.games.map(legacyGame);
}

export async function legacyBoard(date, { signal } = {}) {
  const games = await legacySchedule(date, signal);
  const now = new Date().toISOString();
  let next = null;
  const upcoming = games.filter(g => g.status.semantics === 'SCHEDULED' && g.start_time_utc > now);
  let day = date;
  let dayGames = upcoming;
  for (let hop = 1; !dayGames.length && hop <= 21; hop += 1) {
    day = addDays(date, hop);
    dayGames = (await legacySchedule(day, signal)).filter(g => g.status.semantics === 'SCHEDULED' && g.start_time_utc > now);
  }
  if (dayGames.length) {
    const sorted = [...dayGames].sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc));
    next = {
      start_time_utc: sorted[0].start_time_utc,
      date: day,
      game_type: sorted[0].game_type,
      games_at_start: sorted.filter(g => g.start_time_utc === sorted[0].start_time_utc),
      games_that_day: sorted.length
    };
  }
  const counts = games.reduce((acc, g) => { acc[g.status.semantics] = (acc[g.status.semantics] || 0) + 1; return acc; }, { total: games.length });
  const data = {
    ok: true,
    schema: 'legacy-compat',
    compat: true,
    source: 'NHL via PropSports (legacy route)',
    source_urls: ['/nhl/schedule (legacy PropSports route)'],
    fetched_at: now,
    ttl_s: 30,
    stale_after_s: 300,
    date,
    season_phase: phase(date),
    calendar: CALENDAR_2026_27,
    counts,
    next_puck_drop: next,
    games
  };
  return {
    data,
    meta: { schema: data.schema, source: data.source, source_urls: data.source_urls, fetched_at: now, ttl_s: 30, stale_after_s: 300, received_at: Date.now() }
  };
}
