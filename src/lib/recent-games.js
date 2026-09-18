// Resolve a REAL recently-completed game from the live schedule.
//
// Product navigation must never carry a hardcoded game id: a fixture that was
// true in QA becomes a lie the moment the season moves. Every candidate here
// comes back from the gateway's own board for a real calendar date, and when
// nothing can be resolved the caller is told so rather than handed a guess.
//
// Cost control: one search per browser session per ET day. The result is
// memoised in-module, shared between concurrent callers through a single
// in-flight promise, and persisted in sessionStorage so a route change does not
// repeat it. In season the search is a single board read (today already has
// finals). Deep in the offseason it costs one bounded sweep of the previous
// season's own playoff window, derived from the calendar the board returns —
// never from a date typed into this file.
import { addDays, todayET } from './format.js';

const SESSION_KEY = 'pbe_nhl_recent_completed_v1';
const RECENT_DAYS = 7; // backward walk from today, one parallel batch
const OFF_BATCH = 10; // offseason sweep: days per batch
const OFF_BATCHES = 4; // at most 40 days around the previous playoff window
const MAX_CANDIDATES = 12;
const BOARD_MAX_AGE_MS = 300000;

const semantics = game => game?.status?.semantics || null;
export const isFinal = game => semantics(game) === 'FINAL';
export const isLive = game => semantics(game) === 'LIVE';

let memo = null;
let inflight = null;

function readSession(day) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.day === day ? parsed : null;
  } catch { return null; }
}

function writeSession(result) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(result)); } catch { /* private mode */ }
}

// Clear the cached resolution. Tests and the "search again" control use it.
export function resetRecentCompleted() {
  memo = null;
  inflight = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
}

const startMs = game => Date.parse(game?.start_time_utc || '') || 0;
const byLatest = (a, b) => startMs(b) - startMs(a);

function shiftYear(ymd, delta) {
  const m = /^(\d{4})-(\d{2}-\d{2})$/.exec(String(ymd || ''));
  return m ? `${Number(m[1]) + delta}-${m[2]}` : null;
}

async function readBoard(board, date, signal) {
  try {
    const res = await board(date, { signal, maxAgeMs: BOARD_MAX_AGE_MS });
    return { date, data: res?.data || null };
  } catch (error) {
    if (error?.kind === 'aborted') throw error;
    return { date, data: null, error };
  }
}

// Latest-first finals across a set of scanned days.
function collectFinals(scans) {
  const days = scans.filter(s => (s.data?.games || []).some(isFinal)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const games = [];
  for (const day of days) {
    for (const game of (day.data.games || []).filter(isFinal).sort(byLatest)) {
      if (games.length < MAX_CANDIDATES) games.push(game);
    }
  }
  return { date: days[0]?.date || null, games };
}

async function search(board, today, signal) {
  const scanned = [];
  const result = { day: today, date: null, games: [], live: [], phase: null, searchedFrom: null, searchedTo: null, boardReads: 0 };

  const todayScan = await readBoard(board, today, signal);
  scanned.push(todayScan);
  result.boardReads += 1;
  result.phase = todayScan.data?.season_phase || null;

  const todayGames = todayScan.data?.games || [];
  const live = todayGames.filter(isLive).sort(byLatest);
  const todayFinals = todayGames.filter(isFinal).sort(byLatest);
  if (live.length || todayFinals.length) {
    result.live = live;
    result.date = today;
    result.games = [...live, ...todayFinals].slice(0, MAX_CANDIDATES);
    result.searchedFrom = today;
    result.searchedTo = today;
    return result;
  }

  // 1. Recent days. In season this ends on the first read.
  const recent = Array.from({ length: RECENT_DAYS }, (_, i) => addDays(today, -(i + 1)));
  const recentScans = await Promise.all(recent.map(date => readBoard(board, date, signal)));
  scanned.push(...recentScans);
  result.boardReads += recentScans.length;
  result.searchedFrom = recent[recent.length - 1];
  result.searchedTo = today;
  {
    const hit = collectFinals(recentScans);
    if (hit.games.length) {
      result.date = hit.date;
      result.games = hit.games;
      return result;
    }
  }

  // 2. Offseason. The board's own calendar carries the upcoming season's
  //    playoff end; the season that actually finished ended a year earlier.
  //    Sweep back from there in bounded batches and stop on the first hit.
  const playoffEnd = todayScan.data?.calendar?.playoff_end || null;
  let anchor = playoffEnd && playoffEnd > today ? shiftYear(playoffEnd, -1) : playoffEnd;
  if (!anchor || anchor >= today) anchor = null;
  if (!anchor) {
    result.exhausted = true;
    return result;
  }

  let cursor = addDays(anchor, 7); // playoffs can run past the scheduled end
  if (cursor > today) cursor = addDays(today, -(RECENT_DAYS + 1));
  for (let batch = 0; batch < OFF_BATCHES; batch += 1) {
    const dates = Array.from({ length: OFF_BATCH }, (_, i) => addDays(cursor, -i)).filter(d => d < today);
    if (!dates.length) break;
    const scans = await Promise.all(dates.map(date => readBoard(board, date, signal)));
    scanned.push(...scans);
    result.boardReads += scans.length;
    result.searchedFrom = dates[dates.length - 1];
    const hit = collectFinals(scans);
    if (hit.games.length) {
      result.date = hit.date;
      result.games = hit.games;
      return result;
    }
    cursor = addDays(dates[dates.length - 1], -1);
  }
  result.exhausted = true;
  return result;
}

/**
 * @param {(date: string, opts?: object) => Promise<object>} board ctx.board
 * @returns {Promise<{day, date, games, live, phase, searchedFrom, searchedTo, boardReads, exhausted?}>}
 */
export function resolveRecentCompleted(board, { signal, today = todayET() } = {}) {
  if (memo?.day === today) return Promise.resolve(memo);
  const cached = readSession(today);
  if (cached) { memo = cached; return Promise.resolve(cached); }
  if (inflight?.day === today) return inflight.promise;
  const promise = search(board, today, signal)
    .then(result => {
      memo = result;
      writeSession(result);
      return result;
    })
    .finally(() => { if (inflight?.promise === promise) inflight = null; });
  inflight = { day: today, promise };
  return promise;
}

// The resolution already in hand, if any. Never triggers a request.
export function cachedRecentCompleted(today = todayET()) {
  if (memo?.day === today) return memo;
  const cached = readSession(today);
  if (cached) memo = cached;
  return memo?.day === today ? memo : null;
}

// The next completed game to try when the one we landed on turns out to carry
// no plottable coordinates. Returns null rather than inventing an alternative.
export function nextCompletedAfter(gameId, today = todayET()) {
  const hit = cachedRecentCompleted(today);
  if (!hit?.games?.length) return null;
  const i = hit.games.findIndex(g => String(g.id) === String(gameId));
  return hit.games[i + 1] || null;
}
