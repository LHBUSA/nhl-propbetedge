// Player-profile game context + goalie profile view model. Pure: no DOM, no fetch.
//
// One club game drives the hero chip and the goalie intelligence caption:
//   LIVE   the club's game is in progress (never labelled "Next")
//   TODAY  scheduled/pregame on today's ET date
//   NEXT   the next scheduled game after today
//   NONE   nothing scheduled in the club schedule window
// Live status (period/clock) and the starter come from /nhl/game/<id>/goalies
// (game.status + teams.<side>.starter), the same goalie-truth lane the Goalie
// Center and Matchup read. Nothing is inferred: no game = NONE, no starter
// report = no start badge.
import { dayET, timeET, todayET } from './format.js';
import { confirmedLabel, level } from './goalie-center.js';

const ms = iso => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : null; };
const ACTIVE = new Set(['SCHEDULED', 'PREGAME', 'LIVE']);

// games: club schedule rows ({ id, start_time_utc, status.semantics, teams }).
export function clubGameContext(games, team, now = Date.now()) {
  if (!team || !Array.isArray(games)) return { state: 'NONE', game: null };
  const today = todayET(new Date(now));
  const rows = games
    .filter(g => g && (g.teams?.home?.abbrev === team || g.teams?.away?.abbrev === team) && ms(g.start_time_utc) !== null)
    .sort((a, b) => ms(a.start_time_utc) - ms(b.start_time_utc));
  const live = rows.find(g => g.status?.semantics === 'LIVE');
  const pick = live
    || rows.find(g => ACTIVE.has(g.status?.semantics) && todayET(new Date(ms(g.start_time_utc))) === today)
    || rows.find(g => ACTIVE.has(g.status?.semantics) && ms(g.start_time_utc) > now - 6 * 3600e3 && todayET(new Date(ms(g.start_time_utc))) > today);
  if (!pick) return { state: 'NONE', game: null };
  const home = pick.teams.home.abbrev === team;
  const state = pick.status?.semantics === 'LIVE' ? 'LIVE' : todayET(new Date(ms(pick.start_time_utc))) === today ? 'TODAY' : 'NEXT';
  return { state, game: pick, home, opponent: (home ? pick.teams.away : pick.teams.home)?.abbrev || null, venueWord: home ? 'vs' : '@' };
}

// A fresher game status (from /nhl/game/<id>/goalies) wins over the schedule row.
export function withLiveStatus(ctx, gameStatus) {
  if (!ctx?.game || !gameStatus) return ctx;
  const game = { ...ctx.game, status: { ...ctx.game.status, ...gameStatus } };
  const sem = game.status.semantics;
  if (sem === 'LIVE') return { ...ctx, game, state: 'LIVE' };
  if (sem === 'FINAL' || sem === 'OFF') return { ...ctx, game, state: 'FINAL' };
  return { ...ctx, game };
}

const ORD = { 1: '1st', 2: '2nd', 3: '3rd' };
export function periodText(status) {
  if (!status) return 'LIVE';
  if (status.in_intermission) return `End ${ORD[status.period] || `P${status.period}`}`.trim();
  const p = status.period_type === 'OT' ? 'OT' : status.period_type === 'SO' ? 'SO' : (ORD[status.period] || (status.period ? `P${status.period}` : ''));
  return [p, status.clock].filter(Boolean).join(' ') || 'LIVE';
}

// Hero chip parts: { kicker, when, opp, time }.
export function heroGameParts(ctx) {
  if (!ctx?.game || ctx.state === 'NONE') return null;
  const g = ctx.game;
  const opp = `${ctx.venueWord} ${ctx.opponent || ''}`.trim();
  if (ctx.state === 'LIVE') return { kicker: 'Live', when: null, opp, time: periodText(g.status), live: true };
  if (ctx.state === 'FINAL') return { kicker: 'Final', when: dayET(g.start_time_utc), opp, time: null, live: false };
  return { kicker: ctx.state === 'TODAY' ? 'Today' : 'Next', when: ctx.state === 'TODAY' ? null : dayET(g.start_time_utc), opp, time: timeET(g.start_time_utc), live: false, preseason: g.game_type === 1 };
}

// Goalie intelligence caption: "LIVE @ NYR · 3rd 15:46", "TODAY vs NYR · 7:30 PM ET",
// "NEXT vs CHI · Thu, Oct 8", "NO UPCOMING GAME". Never invents an opponent.
export function opponentCaption(ctx) {
  const h = heroGameParts(ctx);
  if (!h) return 'NO UPCOMING GAME';
  if (ctx.state === 'LIVE') return `LIVE ${h.opp} · ${h.time}`;
  if (ctx.state === 'FINAL') return `FINAL ${h.opp}`;
  if (ctx.state === 'TODAY') return `TODAY ${h.opp} · ${h.time}`;
  return `NEXT ${h.opp} · ${h.when}`;
}

// This goalie's start status in the context game, from the game goalies lane.
// Returns null unless the lane names THIS goalie (CONFIRMED / PROJECTED).
export function goalieStartStatus(gameGoalies, goalieId, ctxState) {
  const id = Number(goalieId);
  if (!gameGoalies?.teams || !Number.isFinite(id)) return null;
  for (const side of ['away', 'home']) {
    const s = gameGoalies.teams[side]?.starter;
    if (!s || Number(s.goalie_id) !== id) continue;
    const lv = level(s.status);
    if (lv === 'UNKNOWN') return null;
    const live = ctxState === 'LIVE';
    const label = lv === 'CONFIRMED' ? (live ? 'LIVE START' : ctxState === 'FINAL' ? 'STARTED TODAY' : 'STARTING TODAY') : 'PROJECTED STARTER';
    return { level: lv, live, label, detail: lv === 'CONFIRMED' ? confirmedLabel(s) : 'Projected · Reported', basis: s.basis || null, source: s.source || null };
  }
  return null;
}

// "20242025" -> "2024–25".
export const seasonLabel = s => { const t = String(s ?? ''); return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}–${t.slice(6, 8)}` : ''; };
export function currentSeason(now = Date.now()) {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 6 ? y : y - 1; // the NHL season id rolls over in July
  return Number(`${start}${start + 1}`);
}

// Most recent completed NHL regular-season line from the profile's season totals.
export function lastNhlSeason(seasonTotals, before = Infinity) {
  return (seasonTotals || [])
    .filter(s => s && s.gameTypeId === 2 && (s.leagueAbbrev || 'NHL') === 'NHL' && Number(s.season) < before && Number(s.shotsAgainst) > 0)
    .sort((a, b) => Number(b.season) - Number(a.season) || Number(b.sequence || 0) - Number(a.sequence || 0))[0] || null;
}

// Goalie intelligence payload + the authoritative profile -> the card's input.
// Identity fields the payload omits come from the profile (never "Unnamed" on a
// known player's own page). When the payload has neither a season nor a baseline
// line, the profile's last completed NHL regular season becomes the explicitly
// labelled prior-season baseline (real NHL totals, nothing derived beyond saves = SA - GA).
export function hydrateGoalie(data, profile, now = Date.now()) {
  const d = data || {};
  const p = profile || {};
  const cur = currentSeason(now);
  const curRow = (p.season_totals || []).find(s => s.gameTypeId === 2 && (s.leagueAbbrev || 'NHL') === 'NHL' && Number(s.season) === cur) || null;
  let baseline = d.baseline_line || null;
  let baselineSource = baseline ? 'intel' : null;
  if (!d.season_line && !baseline) {
    const last = lastNhlSeason(p.season_totals, cur);
    if (last) {
      baseline = { season: Number(last.season), shots_against: Number(last.shotsAgainst), saves: Number(last.shotsAgainst) - Number(last.goalsAgainst), games: last.gamesPlayed ?? null, save_pct: last.savePctg ?? null };
      baselineSource = 'profile';
    }
  }
  return {
    id: d.goalie_id ?? p.id ?? null,
    name: d.name || p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    team: d.team || p.current_team_abbrev || null,
    headshot: p.headshot || null,
    season_line: d.season_line || null,
    baseline_line: baseline,
    baseline_source: baselineSource,
    current_season: cur,
    current_sample: { season: cur, gp: curRow?.gamesPlayed ?? 0, gs: curRow?.gamesStarted ?? null, shots_against: curRow?.shotsAgainst ?? 0 },
    form: d.form, workload: d.workload, recent_window: d.recent_window, edge: d.edge
  };
}

// Sample notes under the card: which season each number belongs to.
export function sampleNotes(g) {
  const notes = [];
  const cur = seasonLabel(g.current_season);
  if (g.season_line) notes.push(`${cur} current-season sample`);
  else if (g.baseline_line) {
    const b = seasonLabel(g.baseline_line.season);
    const gp = g.current_sample?.gp || 0;
    notes.push(`${b} prior-season baseline${g.baseline_line.games ? ` (${g.baseline_line.games} GP)` : ''}`);
    notes.push(gp ? `${cur} current-season sample: ${gp} GP, not mature yet` : `${cur} current-season sample: no completed NHL games yet`);
  }
  const es = g.edge?.season ? Number(g.edge.season) : null;
  if (es && es !== g.current_season) notes.push(`Shot-location splits are ${seasonLabel(es)} (most recent NHL tracking season)`);
  return notes;
}
