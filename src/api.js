const API = '/api/nhl';

function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

export async function nhl(path, params = {}, options = {}) {
  const url = `${API}?path=${encodeURIComponent(path)}${Object.keys(params).length ? `&${qs(params)}` : ''}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 9000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, error: text || `HTTP ${response.status}` }; }
    if (!response.ok) {
      const error = new Error(data?.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeSchedule(payload) {
  const games = Array.isArray(payload?.games) ? payload.games : [];
  return games.map(game => {
    if (game?.teams?.away || game?.teams?.home) return game;
    return {
      id: String(game.id || ''),
      date: game.date || null,
      start_time_utc: game.date || null,
      venue: game.venue || null,
      status: {
        state: game.status || null,
        semantics: ['LIVE', 'CRIT'].includes(game.status) ? 'LIVE' : ['FINAL', 'OFF'].includes(game.status) ? 'FINAL' : 'SCHEDULED'
      },
      teams: {
        away: { name: game.away || null, abbrev: game.awayAbbrev || null, score: game.awayScore ?? null, logo: null },
        home: { name: game.home || null, abbrev: game.homeAbbrev || null, score: game.homeScore ?? null, logo: null }
      },
      broadcasts: (game.tv || []).map(network => ({ network }))
    };
  });
}

export function teamLabel(team = {}) {
  return team.abbrev || team.name || 'TBD';
}

export function fmtTime(iso) {
  if (!iso) return 'TBD';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
}

export function fmtDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}
