// ICE BOARD — the landing surface.
//
// Hierarchy, top to bottom, and the reason for each block:
//   A  HERO            state-aware. Leads with the true NHL state (live now /
//                      games today / the next slate) over the licensed rink
//                      photograph, with real matchups on screen.
//   B  TODAY / NEXT    the selected date's games. When that date has none, it
//                      says so plainly and the NEXT SLATE is surfaced under its
//                      own label — tomorrow's games are never shown as today's.
//   C  PBE PICKS       the legitimate facts only: games scheduled, lock target,
//                      official model, pipeline state. Never a pick, a
//                      probability, an edge or a shadow value.
//   D  WHAT CHANGED    the existing editorial/news rail, unchanged in behaviour.
//   E  QUICK LAUNCH    real tools, real routes, generic entry states only.
//   F  INTEL STATUS    the old three-column capability matrix, now a compact
//                      summary that expands. It no longer owns the first screen.
//
// Every value on this page came out of an API response. `null` renders as an em
// dash; nothing is guessed, and no unavailable capability is dressed up as one
// that works.
import { $, $$, esc, on } from '../lib/dom.js';
import { describeError, news, odds, picksHealth, picksPreseason, picksSlate } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { addDays, countdownParts, dateLabel, dayET, daysUntil, gameTypeLabel, timeET, timeLocal, todayET, ageText } from '../lib/format.js';
import { createPoller } from '../lib/poll.js';
import { stateOf, teamMark } from '../components/game.js';
import { modePanel, seasonMode } from '../components/mode.js';
import { playerIdentity } from '../components/player.js';
import { cardMarket } from '../components/market.js';
import { watchButton } from '../components/alerts-ui.js';
import { TEAM_BY_ABBREV, teamAccent } from '../lib/teams.js';
import { dataLayer, oddsConfigured } from '../lib/api.js';

const DASH = '—';
const HERO = '/assets/nhl/';
const heroPicture = () => `
  <picture class="hero__media">
    <source type="image/avif" media="(max-width: 600px)" srcset="${HERO}hero-ice-m-600.avif 600w, ${HERO}hero-ice-m-900.avif 900w" sizes="100vw">
    <source type="image/webp" media="(max-width: 600px)" srcset="${HERO}hero-ice-m-600.webp 600w, ${HERO}hero-ice-m-900.webp 900w" sizes="100vw">
    <source type="image/avif" srcset="${HERO}hero-ice-960.avif 960w, ${HERO}hero-ice-1440.avif 1440w, ${HERO}hero-ice-1920.avif 1920w, ${HERO}hero-ice-2560.avif 2560w" sizes="100vw">
    <source type="image/webp" srcset="${HERO}hero-ice-960.webp 960w, ${HERO}hero-ice-1440.webp 1440w, ${HERO}hero-ice-1920.webp 1920w, ${HERO}hero-ice-2560.webp 2560w" sizes="100vw">
    <img src="${HERO}hero-ice-1440.webp" alt="" width="1440" height="810" fetchpriority="high" decoding="async">
  </picture>`;

// Filter semantics are unchanged: they filter the SELECTED date.
const FILTERS = [['ALL', 'All'], ['LIVE', 'Live'], ['UPCOMING', 'Upcoming'], ['FINAL', 'Final']];
const matchesFilter = (game, f) => {
  const key = stateOf(game).key;
  if (f === 'ALL') return true;
  if (f === 'LIVE') return key === 'LIVE' || key === 'INTERMISSION';
  if (f === 'UPCOMING') return key === 'SCHEDULED' || key === 'PREGAME';
  if (f === 'FINAL') return key === 'FINAL';
  return true;
};

// ------------------------------------------------------------ derived facts
// Everything below reads the board payload the gateway actually returns:
// { date, season_phase, counts, games[], calendar, next_puck_drop }.

export function nextSlateFacts(today) {
  const n = today?.next_puck_drop;
  if (!n || !n.date) return null;
  const from = today.date || todayET();
  const cal = today.calendar || {};
  const at = Array.isArray(n.games_at_start) ? n.games_at_start : [];
  return {
    date: n.date,
    startUtc: n.start_time_utc || null,
    gameType: n.game_type ?? null,
    gamesThatDay: Number.isFinite(n.games_that_day) ? n.games_that_day : null,
    atStart: at,
    isToday: n.date === from,
    isTomorrow: n.date === addDays(from, 1),
    days: daysUntil(n.date, from),
    // Only the calendar decides whether a date is an opener.
    opener: n.date && n.date === cal.preseason_start ? 'PRESEASON'
      : n.date && n.date === cal.regular_season_start ? 'REGULAR_SEASON' : null
  };
}

const whenWord = next => (next.isToday ? 'today' : next.isTomorrow ? 'tomorrow' : dateLabel(next.date));

function slateTypeWord(games = [], fallbackType = null) {
  const types = new Set(games.map(g => Number(g.game_type)).filter(Number.isFinite));
  const only = types.size === 1 ? [...types][0] : Number.isFinite(Number(fallbackType)) ? Number(fallbackType) : null;
  if (only === 1) return 'preseason';
  if (only === 3) return 'playoff';
  if (only === 4) return 'All-Star';
  return null;
}

// The hero is a pure function of the TODAY board. Each key is a real league
// state, and the copy for it states only what the payload proves.
export function heroState(today) {
  if (!today) return { key: 'LOADING', title: 'Read the ice before the market does.', deck: '', eyebrow: 'NHL' };
  const counts = today.counts || {};
  const total = Number(counts.total) || 0;
  const live = Number(counts.LIVE) || 0;
  const final = Number(counts.FINAL) || 0;
  const games = Array.isArray(today.games) ? today.games : [];
  const next = nextSlateFacts(today);
  const eyebrow = phaseLine(today);
  const typeToday = slateTypeWord(games);
  const firstDrop = games
    .map(g => g.start_time_utc)
    .filter(Boolean)
    .sort()[0] || null;

  if (live) {
    return {
      key: 'LIVE', eyebrow, next, live,
      title: `${live} NHL game${live === 1 ? '' : 's'} live right now`,
      deck: `${total} game${total === 1 ? '' : 's'} on tonight's board${final ? ` · ${final} already final` : ''}. Shot share, deployment and the rink map update as the play-by-play lands.`
    };
  }
  if (total && final === total) {
    return {
      key: 'FINAL', eyebrow, next,
      title: `Today's ${total} game${total === 1 ? '' : 's'} ${total === 1 ? 'is' : 'are'} final`,
      deck: `Every one is replayable event by event${next && !next.isToday ? ` · next puck drop ${whenWord(next)} ${timeET(next.startUtc)}` : ''}.`
    };
  }
  if (total) {
    return {
      key: 'TODAY', eyebrow, next,
      title: `${total} NHL${typeToday ? ` ${typeToday}` : ''} game${total === 1 ? '' : 's'} today`,
      deck: `${firstDrop ? `First puck drop ${timeET(firstDrop)}. ` : ''}Goalies are confirmed at puck drop, never projected here.`
    };
  }
  if (next && next.isTomorrow && next.opener === 'PRESEASON') {
    return { key: 'OPENER_TOMORROW', eyebrow, next, title: 'NHL preseason starts tomorrow', deck: openerDeck(next, 'preseason') };
  }
  if (next && next.isTomorrow && next.opener === 'REGULAR_SEASON') {
    return { key: 'OPENING_NIGHT_TOMORROW', eyebrow, next, title: 'NHL opening night is tomorrow', deck: openerDeck(next, 'regular-season') };
  }
  if (next && next.isTomorrow) {
    return { key: 'TOMORROW', eyebrow, next, title: 'NHL is back tomorrow', deck: openerDeck(next, slateTypeWord(next.atStart, next.gameType)) };
  }
  if (next && next.opener === 'PRESEASON') {
    return { key: 'OPENER_AHEAD', eyebrow, next, title: `NHL preseason opens ${dateLabel(next.date, { long: true })}`, deck: openerDeck(next, 'preseason') };
  }
  if (next && next.opener === 'REGULAR_SEASON') {
    return { key: 'OPENING_NIGHT_AHEAD', eyebrow, next, title: `NHL opening night is ${dateLabel(next.date, { long: true })}`, deck: openerDeck(next, 'regular-season') };
  }
  if (next) {
    return { key: 'NEXT_AHEAD', eyebrow, next, title: `Next NHL games ${dateLabel(next.date, { long: true })}`, deck: openerDeck(next, slateTypeWord(next.atStart, next.gameType)) };
  }
  return {
    key: 'NO_SCHEDULE', eyebrow, next: null,
    title: 'No upcoming NHL game is listed',
    deck: 'The source schedule window carries no future puck drop. Nothing has been filled in to cover that.'
  };
}

function openerDeck(next, typeWord) {
  const games = next.gamesThatDay;
  const parts = [];
  if (games !== null) parts.push(`${games} ${typeWord ? `${typeWord} ` : ''}game${games === 1 ? '' : 's'}`);
  if (next.startUtc) parts.push(`first puck drop ${timeET(next.startUtc)}`);
  if (next.atStart.length > 1) parts.push(`${next.atStart.length} games at the opening faceoff`);
  return parts.length ? `${parts.join(' · ')}.` : '';
}

// The season label is DERIVED, never hardcoded: a literal would silently be
// wrong from the next season on. regular_season_start anchors the split year,
// with the games' own season id as a fallback.
export function seasonLabel(board) {
  const cal = board?.calendar || {};
  const anchor = cal.regular_season_start || cal.preseason_start || board?.date;
  const fromGame = String(board?.games?.[0]?.season || board?.next_puck_drop?.games_at_start?.[0]?.season || '');
  if (/^\d{8}$/.test(fromGame)) return `${fromGame.slice(0, 4)}–${fromGame.slice(6, 8)} NHL`;
  const year = Number(String(anchor || '').slice(0, 4));
  if (!Number.isFinite(year) || !year) return 'NHL';
  return `${year}–${String((year + 1) % 100).padStart(2, '0')} NHL`;
}

function phaseLine(board) {
  const cal = board.calendar || {};
  const today = board.date;
  const season = seasonLabel(board);
  switch (board.season_phase) {
    case 'OFFSEASON': {
      const d = daysUntil(cal.preseason_start, today);
      return d > 0 ? `${season} · Preseason opens ${dateLabel(cal.preseason_start)} · ${d} day${d === 1 ? '' : 's'}` : season;
    }
    case 'PRESEASON': {
      const d = daysUntil(cal.regular_season_start, today);
      return `${season} · Preseason · Opening night ${dateLabel(cal.regular_season_start)}${d > 0 ? ` · ${d}d` : ''}`;
    }
    case 'REGULAR_SEASON': return `${season} · Regular season · ${dateLabel(today, { long: true })}`;
    case 'PLAYOFFS': return `${season} · Stanley Cup Playoffs`;
    default: return season;
  }
}

// The date whose slate the PBE Picks block and the picks lock chips describe:
// the selected date when it has games, otherwise the real next slate.
export function picksSlateDate(state) {
  if (state.board?.games?.length) return state.date;
  const next = nextSlateFacts(state.today);
  return next?.date || state.date;
}

// ---------------------------------------------------------------- countdown
function countdownMarkup(iso) {
  const c = countdownParts(iso);
  if (!c) return '';
  if (c.done) return '<div class="cd cd--done"><b>PUCK DROPPED</b></div>';
  const cell = (v, l) => `<div><b class="mono">${String(v).padStart(2, '0')}</b><span>${l}</span></div>`;
  return `<div class="cd" aria-label="Countdown to next puck drop">${cell(c.days, 'Days')}${cell(c.hours, 'Hrs')}${cell(c.mins, 'Min')}${cell(c.secs, 'Sec')}</div>`;
}

export function countdownShort(iso) {
  const c = countdownParts(iso);
  if (!c) return '';
  if (c.done) return 'PUCK DROPPED';
  if (c.days) return `in ${c.days}d ${c.hours}h`;
  if (c.hours) return `in ${c.hours}h ${String(c.mins).padStart(2, '0')}m`;
  return `in ${c.mins}m ${String(c.secs).padStart(2, '0')}s`;
}

// -------------------------------------------------------------------- hero
function heroMatchup(g) {
  const a = g.teams?.away || {};
  const h = g.teams?.home || {};
  const st = stateOf(g);
  const scored = ['LIVE', 'INTERMISSION', 'FINAL'].includes(st.key)
    && a.score !== null && a.score !== undefined
    && h.score !== null && h.score !== undefined;
  const when = scored ? `${a.score}–${h.score} · ${st.text}` : timeET(g.start_time_utc);
  return `<li class="hmatch" data-state="${esc(st.key)}" style="--away:${teamAccent(a.abbrev)};--home:${teamAccent(h.abbrev)}">
    <a href="#/matchup/${esc(g.id)}">
      <span class="hmatch__side">${teamMark(a, 26)}<b>${esc(a.abbrev || 'TBD')}</b></span>
      <span class="hmatch__at" aria-hidden="true">@</span>
      <span class="hmatch__side">${teamMark(h, 26)}<b>${esc(h.abbrev || 'TBD')}</b></span>
      <span class="hmatch__when mono">${esc(when)}</span>
      <span class="hmatch__venue truncate">${esc(g.venue || '')}</span>
    </a>
  </li>`;
}

const pickProbability = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0.5 && n <= 1 ? n : null;
};

export function heroSignal(state) {
  const date = state.picks?.date || null;
  const preseason = state.picks?.preseason;
  const calls = preseason?.ok === true && Array.isArray(preseason.games)
    ? preseason.games.filter(g => g?.is_call === true && g.pick_team)
    : [];
  const best = calls
    .map(g => ({ ...g, _p: pickProbability(g.probability) }))
    .sort((a, b) => (b._p ?? -1) - (a._p ?? -1))[0] || null;

  if (best) {
    const p = best._p;
    return `<a class="hero-signal hero-signal--pick" href="#/pbe-picks${date ? `?date=${esc(date)}` : ''}">
      <span class="hero-signal__k">PBE pick spotlight${date ? ` · ${esc(dateLabel(date))}` : ''}</span>
      <strong>${esc(best.pick_team)}</strong>
      ${p !== null ? `<b class="mono">${(p * 100).toFixed(1)}%</b>` : ''}
      <small>Locked before puck drop · open the full PBE Picks slate →</small>
    </a>`;
  }

  const officialLocked = (state.picks?.slate?.games || []).filter(g => g?.prediction_state === 'LOCKED_OFFICIAL').length;
  if (officialLocked) {
    return `<a class="hero-signal hero-signal--pick" href="#/pbe-picks${date ? `?date=${esc(date)}` : ''}">
      <span class="hero-signal__k">PBE signal${date ? ` · ${esc(dateLabel(date))}` : ''}</span>
      <strong>${officialLocked} locked pick${officialLocked === 1 ? '' : 's'}</strong>
      <small>Official calls are frozen before puck drop · open PBE Picks →</small>
    </a>`;
  }

  const liveGames = (state.today?.games || []).filter(g => ['LIVE', 'INTERMISSION'].includes(stateOf(g).key));
  if (liveGames.length) {
    const g = liveGames[0];
    const a = g.teams?.away || {}; const h = g.teams?.home || {};
    const scored = a.score !== null && a.score !== undefined && h.score !== null && h.score !== undefined;
    return `<a class="hero-signal hero-signal--live" href="#/cast/${esc(g.id)}">
      <span class="hero-signal__k">Live PBE Cast</span>
      <strong>${esc(a.abbrev || 'TBD')} ${scored ? esc(a.score) : ''} <i>–</i> ${scored ? esc(h.score) : ''} ${esc(h.abbrev || 'TBD')}</strong>
      <small>${esc(stateOf(g).text)} · jump into the live telemetry desk →</small>
    </a>`;
  }

  const nextLock = (state.picks?.slate?.games || [])
    .map(g => ({ g, t: g?.lock_window?.target_utc || null }))
    .filter(x => x.t && Date.parse(x.t) > Date.now())
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))[0];
  if (nextLock) {
    const g = nextLock.g;
    return `<a class="hero-signal" href="#/pbe-picks${date ? `?date=${esc(date)}` : ''}">
      <span class="hero-signal__k">Next PBE lock</span>
      <strong class="mono">${esc(timeET(nextLock.t))}</strong>
      <small>${esc(g.away?.abbrev || 'TBD')} @ ${esc(g.home?.abbrev || 'TBD')} · model call freezes before puck drop →</small>
    </a>`;
  }
  return '';
}

export function heroInner(state) {
  const today = state.today;
  const hs = heroState(today);
  const next = hs.next;
  const slateDate = today ? picksSlateDate({ ...state, today }) : state.date;
  const live = hs.key === 'LIVE';

  // The games shown in the rail are always labelled with the day they are on.
  const todayGames = today?.games || [];
  const railGames = live
    ? [...todayGames].sort((a, b) => {
        const rank = g => ['LIVE', 'INTERMISSION'].includes(stateOf(g).key) ? 0 : stateOf(g).key === 'FINAL' ? 2 : 1;
        return rank(a) - rank(b) || String(a.start_time_utc || '').localeCompare(String(b.start_time_utc || ''));
      }).slice(0, 4)
    : hs.key === 'TODAY'
      ? todayGames.slice(0, 4)
      : (next?.atStart || []).slice(0, 4);
  const railDate = live || hs.key === 'TODAY' ? today?.date : next?.date;
  const railTotal = live || hs.key === 'TODAY' ? (today.counts?.total || 0) : (next?.gamesThatDay ?? railGames.length);

  const ctas = [];
  if (live) ctas.push(`<a class="pbe-btn pbe-btn--primary" href="#/cast">Open PBE Cast</a>`);
  if (!live && (hs.key === 'TODAY' || hs.key === 'FINAL')) ctas.push(`<a class="pbe-btn pbe-btn--primary" href="#ice-board" data-jump>Today's slate</a>`);
  if (!live && next && !next.isToday && hs.key !== 'TODAY' && hs.key !== 'FINAL') {
    ctas.push(`<button type="button" class="pbe-btn pbe-btn--primary" data-goto="${esc(next.date)}">View ${esc(next.isTomorrow ? "tomorrow's slate" : `the ${dateLabel(next.date)} slate`)}</button>`);
  }
  ctas.push(`<a class="pbe-btn" href="#/pbe-picks${slateDate ? `?date=${esc(slateDate)}` : ''}">PBE Picks</a>`);
  if (!live) ctas.push(`<a class="pbe-btn pbe-btn--ghost" href="#/cast">PBE Cast</a>`);

  const failedNow = !today && state.error;
  return `<div class="hero__copy">
      <span class="eyebrow hero__eyebrow" id="hero-phase">${esc(hs.eyebrow || 'NHL')}</span>
      <h1 class="pbe-display hero__title" id="hero-title">${esc(hs.title)}</h1>
      ${hs.deck ? `<p class="hero__deck">${esc(hs.deck)}</p>` : ''}
      ${heroSignal(state)}
      <div class="hero__cta">${ctas.join('')}</div>
    </div>
    <div class="hero__rail" data-fresh-scope>
      ${failedNow
    ? `<div class="pbe-error"><strong>${esc(describeError(state.error).title)}</strong>${esc(describeError(state.error).body)}</div>`
    : !today
      ? '<div class="pbe-skeleton hero__rail-skel"></div>'
      : `<div class="hero__rail-head">
            <span class="eyebrow">${live ? 'Live now' : hs.key === 'TODAY' ? 'Today' : 'Next puck drop'}</span>
            ${freshStamp(state.todayMeta, { failed: state.todayFailed })}
          </div>
          ${next && !live ? `<div class="hero__drop">
            <div class="hero__drop-when">
              <b>${esc(dayET(next.startUtc, true))}</b>
              <span class="mono">${esc(timeET(next.startUtc))}</span>
              ${next.gameType && next.gameType !== 2 ? `<span class="pbe-badge pbe-badge--sched">${esc(gameTypeLabel(next.gameType))}</span>` : ''}
            </div>
            <div data-countdown="${esc(next.startUtc || '')}">${countdownMarkup(next.startUtc)}</div>
          </div>` : ''}
          ${railGames.length ? `<div class="hero__rail-label micro">${esc(railDate ? dateLabel(railDate, { long: true }) : '')}${railTotal ? ` · ${railTotal} game${railTotal === 1 ? '' : 's'}` : ''}</div>
            <ul class="hero__mm">${railGames.map(heroMatchup).join('')}</ul>` : ''}
          ${railDate && railTotal > railGames.length ? `<button type="button" class="hero__rail-more" data-goto="${esc(railDate)}">All ${railTotal} games on ${esc(dateLabel(railDate))} →</button>` : ''}`}
    </div>`;
}

// --------------------------------------------------------------- game cards
// Rich, team-identity cards. Every chip is a statement the API supports:
// a market row exists or the market is NOT POSTED; goalies are on record or
// NOT CONFIRMED; the lock target comes from the picks lock policy.
function teamRow(team = {}, game, winner) {
  const showScore = ['LIVE', 'INTERMISSION', 'FINAL'].includes(stateOf(game).key) && team.score !== null && team.score !== undefined;
  // The board payload carries `place` on some routes and not on others. The
  // static league directory (identity facts only) fills the club's full name
  // when the payload omits it; nothing else is read from it.
  const full = team.place && team.name
    ? `${team.place} ${team.name}`
    : TEAM_BY_ABBREV.get(String(team.abbrev || '').toUpperCase())?.full || team.name || '';
  return `<div class="steam${winner ? ' is-winner' : ''}">
    ${teamMark(team, 38)}
    <div class="steam__id"><b>${esc(team.abbrev || 'TBD')}</b><span>${esc(full)}</span></div>
    ${showScore
    ? `<div class="steam__sog mono" title="Shots on goal">${team.sog ?? DASH}<small>SOG</small></div><div class="steam__score mono">${esc(team.score)}</div>`
    : ''}
  </div>`;
}

export function slateCard(game, { market = null, marketMeta = null, lock = null, odds: oddsOn = false, showDate = false } = {}) {
  const a = game.teams?.away || {};
  const h = game.teams?.home || {};
  const st = stateOf(game);
  const final = st.key === 'FINAL';
  const liveish = st.key === 'LIVE' || st.key === 'INTERMISSION';
  const upcoming = st.key === 'SCHEDULED' || st.key === 'PREGAME';
  const tv = [...new Set((game.broadcasts || []).filter(b => b.country === 'US' || b.country === 'CA').map(b => b.network).filter(Boolean))].slice(0, 3).join(' · ');
  const type = gameTypeLabel(game.game_type);
  const local = timeLocal(game.start_time_utc);
  const c = upcoming ? countdownParts(game.start_time_utc) : null;
  const soon = c && !c.done && c.days < 2;

  const chips = [];
  if (upcoming && oddsOn && !market) chips.push(['unavailable', 'MARKET NOT POSTED', 'scard__market-wait']);
  if (upcoming) chips.push(['unknown', 'GOALIES NOT CONFIRMED', '']);
  if (liveish || final) chips.push(['confirmed', 'STARTERS ON RECORD', '']);
  if (upcoming && lock?.minutes !== null && lock?.minutes !== undefined) {
    chips.push(['sched', `PBE PICK LOCK T-${lock.minutes}${lock.targetUtc ? ` · ${timeET(lock.targetUtc)}` : ''}`, '']);
  }

  return `<article class="scard" data-state="${esc(st.key)}" data-game="${esc(game.id)}" style="--away:${teamAccent(a.abbrev)};--home:${teamAccent(h.abbrev)}">
    <header class="scard__head">
      <span class="pbe-badge pbe-badge--${esc(st.cls)}" data-live-badge="${st.key === 'LIVE' ? '1' : ''}">${esc(st.text)}</span>
      <span class="scard__when mono">${esc(showDate ? dayET(game.start_time_utc, true) : dayET(game.start_time_utc))}${st.key === 'SCHEDULED' ? '' : ` · ${esc(timeET(game.start_time_utc))}`}</span>
      ${type && game.game_type !== 2 ? `<span class="micro scard__type">${esc(type)}</span>` : ''}
      ${final ? '' : watchButton(game.id, true)}
    </header>
    <div class="scard__teams">
      ${teamRow(a, game, final && a.score > h.score)}
      <span class="scard__at" aria-hidden="true">@</span>
      ${teamRow(h, game, final && h.score > a.score)}
    </div>
    ${soon ? `<div class="scard__cd mono" data-countdown-short="${esc(game.start_time_utc)}">${esc(countdownShort(game.start_time_utc))}</div>` : ''}
    ${market && !final ? cardMarket(market, marketMeta) : ''}
    <dl class="scard__meta">
      <div><dt>Puck drop</dt><dd>${esc(timeET(game.start_time_utc))}${local ? ` · ${esc(local)}` : ''}</dd></div>
      <div><dt>Venue</dt><dd>${esc(game.venue || 'Not listed')}${game.neutral_site ? ' · neutral site' : ''}</dd></div>
      <div><dt>TV</dt><dd>${esc(tv || 'Not listed')}</dd></div>
    </dl>
    ${chips.length ? `<div class="scard__chips">${chips.map(([tone, text, cls]) => `<span class="pbe-badge pbe-badge--${tone}${cls ? ` ${cls}` : ''}">${esc(text)}</span>`).join('')}</div>` : ''}
    <footer class="scard__actions">
      <a class="scard__primary" href="#/${liveish ? 'cast' : 'matchup'}/${esc(game.id)}">${liveish ? 'Open PBE Cast' : 'Matchup'}</a>
      ${liveish ? `<a href="#/matchup/${esc(game.id)}">Matchup</a>` : `<a href="#/cast/${esc(game.id)}">PBE Cast</a>`}
      <a href="#/pbe-picks${game.date ? `?date=${esc(game.date)}` : ''}">PBE Picks</a>
      ${market ? `<a href="#/props?game=${esc(game.id)}&focus=market">Betting Odds</a>` : oddsOn ? '<span class="scard__action-off" aria-disabled="true">Odds pending</span>' : ''}
      ${Array.isArray(market?.props) && market.props.length ? `<a href="#/props?game=${esc(game.id)}&focus=props">View Props</a>` : ''}
    </footer>
  </article>`;
}

// ------------------------------------------------------- B. today / next slate
function slateNav(state) {
  const today = todayET();
  const tomorrow = addDays(today, 1);
  const next = nextSlateFacts(state.today);
  const btn = (date, label, sub) => `<button type="button" class="slatenav__b${state.date === date ? ' is-current' : ''}" data-goto="${esc(date)}">
    <b>${esc(label)}</b><span>${esc(sub)}</span></button>`;
  const todayCount = state.today?.counts?.total;
  return `<div class="slatenav" role="group" aria-label="Jump to a slate">
    ${btn(today, 'Today', Number.isFinite(todayCount) ? `${todayCount} game${todayCount === 1 ? '' : 's'}` : dateLabel(today))}
    ${btn(tomorrow, 'Tomorrow', dateLabel(tomorrow))}
    ${next && next.date !== today && next.date !== tomorrow ? btn(next.date, 'Next slate', `${dateLabel(next.date)}${next.gamesThatDay ? ` · ${next.gamesThatDay} games` : ''}`) : ''}
    <span class="slatenav__spacer"></span>
    <button class="pbe-btn pbe-btn--sm" data-shift="-1" aria-label="Previous day">‹</button>
    <button class="pbe-btn pbe-btn--sm" data-shift="1" aria-label="Next day">›</button>
    <label class="sr-only" for="board-date">Date</label>
    <input id="board-date" class="datenav__input" type="date" value="${esc(state.date)}">
  </div>`;
}

function cardOpts(state, game) {
  return {
    market: state.market?.byGame.get(String(game.id)) || null,
    marketMeta: state.market?.meta,
    lock: state.picks?.locks?.get(String(game.id)) || null,
    odds: Boolean(state.env?.odds)
  };
}

export function slateView(state) {
  const { board, meta, failed, error, date, filter } = state;
  const isToday = date === todayET();
  const games = board?.games || [];
  const counts = { ALL: games.length, LIVE: 0, UPCOMING: 0, FINAL: 0 };
  games.forEach(g => FILTERS.slice(1).forEach(([k]) => { if (matchesFilter(g, k)) counts[k] += 1; }));
  const visible = games.filter(g => matchesFilter(g, filter));
  const hasGames = games.length > 0;

  const chips = `<div class="chips" role="group" aria-label="Filter games">${FILTERS.map(([k, l]) => `<button class="chip" data-filter="${k}" aria-pressed="${filter === k}">${l}<span class="count">${counts[k]}</span></button>`).join('')}</div>`;

  let body;
  if (!board && error) {
    const e = describeError(error);
    body = `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`;
  } else if (!board) {
    body = `<div class="board-grid">${'<div class="scard pbe-skeleton" style="height:300px"></div>'.repeat(3)}</div>`;
  } else if (!hasGames) {
    body = `<p class="slate-none"><b>No NHL games ${isToday ? 'today' : `on ${esc(dateLabel(date, { long: true }))}`}.</b>
      <span class="dim">${esc(isToday ? 'Nothing is scheduled on this date in the NHL’s own calendar.' : 'The NHL calendar lists no game on this date.')}</span></p>`;
  } else if (!visible.length) {
    body = `<div class="pbe-empty"><h3>Nothing ${esc(filter.toLowerCase())} right now.</h3><p>${counts.ALL} game${counts.ALL === 1 ? '' : 's'} on this date. <button class="pbe-btn pbe-btn--sm" data-filter="ALL">Show all</button></p></div>`;
  } else {
    body = `<div class="board-grid">${visible.map(g => slateCard(g, cardOpts(state, g))).join('')}</div>`;
  }

  return `<div class="section-head">
      <div><span class="eyebrow">Ice Board${isToday ? ' · Today' : ''}</span><h2>${esc(dateLabel(date, { long: true }))}</h2></div>
      ${board ? freshStamp(meta, { failed }) : ''}
    </div>
    ${slateNav(state)}
    <div class="board-bar" data-filters="${hasGames ? 'primary' : 'quiet'}">
      ${hasGames
    ? chips
    : `<details class="filters-quiet"><summary>Filters · All, Live, Upcoming, Final</summary>${chips}</details>`}
    </div>
    ${body}
    ${hasGames ? '' : nextSlateSection(state)}`;
}

// NEXT SLATE is its own labelled block. It never borrows today's heading and
// every card in it carries its own date.
function nextSlateSection(state) {
  const next = nextSlateFacts(state.today);
  if (!next || next.date === state.date) return '';
  const nb = state.next?.board?.date === next.date ? state.next.board : null;
  const games = nb?.games || next.atStart || [];
  const typeWord = slateTypeWord(games, next.gameType);
  const total = next.gamesThatDay ?? games.length;
  return `<section class="nextslate" aria-labelledby="nextslate-h" data-fresh-scope>
    <div class="section-head nextslate__head">
      <div>
        <span class="eyebrow">Next slate · ${esc(whenWord(next))}</span>
        <h2 id="nextslate-h">${esc(dateLabel(next.date, { long: true }))} · ${total} ${esc(typeWord ? `${typeWord} ` : '')}game${total === 1 ? '' : 's'}</h2>
        <p>First puck drop ${esc(timeET(next.startUtc))}${next.atStart.length > 1 ? ` · ${next.atStart.length} games at the opening faceoff` : ''}.</p>
      </div>
      <div class="nextslate__tools">
        ${state.next?.meta ? freshStamp(state.next.meta) : ''}
        <button type="button" class="pbe-btn pbe-btn--primary" data-goto="${esc(next.date)}">Open this slate</button>
      </div>
    </div>
    ${games.length
    ? `<div class="board-grid">${games.map(g => slateCard(g, { ...cardOpts(state, g), showDate: true })).join('')}</div>`
    : '<div class="board-grid">' + '<div class="scard pbe-skeleton" style="height:300px"></div>'.repeat(3) + '</div>'}
  </section>`;
}

// --------------------------------------------------------- C. PBE Picks entry
// Only legitimate facts. The model is a shadow candidate with publishable:false,
// so there is no pick, no probability, no edge and no shadow value here — and
// when an official model exists this block populates without a redesign.
const present = v => (v === null || v === undefined || v === '' ? null : v);

export function picksBlockFacts(state) {
  const p = state.picks || {};
  const health = p.health || null;
  const slate = p.slate || null;
  const status = slate?.model_status || health?.model_status || null;
  const pipeline = health?.pipeline || null;
  const policy = pipeline?.lock_policy || null;
  const runs = pipeline?.latest_runs || {};
  const lastRun = Object.values(runs).filter(r => r && typeof r === 'object')
    .sort((a, b) => String(b.finished_at || b.started_at || '').localeCompare(String(a.finished_at || a.started_at || '')))[0] || null;
  const lockMinutes = present(policy?.target_lock_minutes_before_start);
  const scheduled = Number.isFinite(Number(slate?.count)) ? Number(slate.count)
    : Array.isArray(slate?.games) ? slate.games.length
      : null;
  const official = status ? (status.publishable === true && present(status.official_model) ? String(status.official_model) : 'None') : null;
  const runOk = lastRun && String(lastRun.status || '').toLowerCase() === 'ok';
  const runAt = lastRun ? present(lastRun.finished_at) || present(lastRun.started_at) : null;

  return {
    date: p.date || null,
    available: Boolean(health || slate),
    scheduled,
    lockMinutes: lockMinutes === null ? null : Number(lockMinutes),
    lockPolicy: present(policy?.version) || present(status?.lock_policy_version),
    official,
    modelVersion: status ? present(status.model_version) : null,
    lifecycle: status ? present(status.status) : null,
    pipelineActive: lastRun ? Boolean(runOk) : null,
    pipelineAt: runAt,
    publishedPicks: Number.isFinite(Number(pipeline?.locks?.official)) ? Number(pipeline.locks.official) : null,
    error: p.healthError || p.slateError || null
  };
}

function factRow(label, value, note) {
  return `<div><dt>${esc(label)}</dt><dd class="mono">${value === null || value === undefined ? DASH : esc(String(value))}</dd>${note ? `<dd class="micro">${esc(note)}</dd>` : ''}</div>`;
}

export function picksBlock(state) {
  const f = picksBlockFacts(state);
  const dateText = f.date ? dateLabel(f.date, { long: true }) : null;
  const officialLive = f.official && f.official !== 'None';
  const scheduled = Number.isFinite(Number(f.scheduled)) ? Number(f.scheduled) : null;
  const slateLine = dateText
    ? (scheduled === null ? dateText : `${dateText} · ${scheduled} game${scheduled === 1 ? '' : 's'}`)
    : 'Next slate';

  const title = officialLive
    ? 'Official PBE Picks are live'
    : f.available
      ? 'PBE is running the next slate'
      : 'PBE Picks';

  const badge = officialLive
    ? 'PICKS LIVE'
    : f.available && f.pipelineActive
      ? 'MODEL RUNNING'
      : f.available
        ? 'PICKS PREPARING'
        : 'UNAVAILABLE';

  const copy = officialLive
    ? `${slateLine}. ${f.publishedPicks ?? 0} locked pick${Number(f.publishedPicks) === 1 ? '' : 's'} published for this slate. Every call is locked before puck drop and carried into the public track record.`
    : f.available
      ? `${slateLine}. PBE is running model rehearsals for this slate. Picks stay off the homepage until they are ready to publish; every public call will be locked before puck drop and tracked from day one.`
      : 'PBE Picks is temporarily unavailable. The Ice Board stays live, and no pick or probability is invented while the picks service is offline.';

  return `<section class="picks-entry" aria-labelledby="picks-entry-h">
    <div class="picks-entry__head">
      <div>
        <span class="eyebrow">PBE Picks</span>
        <h2 id="picks-entry-h">${esc(title)}</h2>
      </div>
      <span class="pbe-badge pbe-badge--${officialLive ? 'model' : f.available ? 'heuristic' : 'unavailable'}">${esc(badge)}</span>
    </div>
    <p class="picks-entry__rule dim">${esc(copy)}</p>
    <div class="picks-entry__cta">
      <a class="pbe-btn pbe-btn--primary" href="#/pbe-picks${f.date ? `?date=${esc(f.date)}` : ''}">Open PBE Picks</a>
      <a class="pbe-btn pbe-btn--ghost" href="#/methodology">How picks are tracked</a>
    </div>
  </section>`;
}

// ------------------------------------------------------- D. what changed rail
// "What changed today": material updates only. Sources, in order: newsroom
// items tagged as material, then real board state changes. Nothing invented.
export function changesMarkup(board, newsState) {
  const items = [];
  for (const g of board?.games || []) {
    const st = stateOf(g);
    const m = `${g.teams.away.abbrev} @ ${g.teams.home.abbrev}`;
    if (['POSTPONED', 'SUSPENDED', 'CANCELLED'].includes(st.key)) items.push({ tag: st.key, tone: 'alert', text: `${m} ${st.key.toLowerCase()}`, href: `#/cast/${g.id}`, src: 'NHL schedule' });
    if (st.key === 'LIVE' || st.key === 'INTERMISSION') items.push({ tag: 'LIVE', tone: 'live', text: `${m} · ${g.teams.away.score}–${g.teams.home.score} · ${st.text.replace('LIVE · ', '')}`, href: `#/cast/${g.id}`, src: 'NHL' });
    if (st.key === 'FINAL') items.push({ tag: st.text, tone: 'final', text: `${g.teams.away.abbrev} ${g.teams.away.score}, ${g.teams.home.abbrev} ${g.teams.home.score}`, href: `#/cast/${g.id}`, src: 'NHL' });
  }
  const newsItems = newsState?.items || [];
  for (const item of newsItems.slice(0, 12)) {
    items.push({ tag: item.breaking ? 'BREAKING' : (item.category || 'NEWS'), tone: item.material ? 'alert' : 'news', text: item.title, href: item.url, external: true, src: item.source, at: item.published_at, more: item.related_count || 0, pl: item.players?.[0] || null, team: item.teams?.length === 1 ? item.teams[0] : null });
  }
  const newsLine = newsState?.error
    ? `<span class="micro">Newsroom: ${esc(newsState.error)}</span>`
    : newsState?.meta ? freshStamp(newsState.meta, { source: 'Newsroom' }) : '';
  if (!items.length) {
    if (newsState?.error) {
      return `<div class="changes__empty"><b>Material updates unavailable here.</b> <span class="dim">The newsroom feed is not connected in this environment, so changes cannot be listed — which is not the same as nothing changing.</span> ${newsLine}</div>`;
    }
    if (!newsState) return '<div class="pbe-skeleton changes__skel"></div>';
    return `<div class="changes__empty"><b>No material changes in the last 24 hours.</b> <span class="dim">Injury, goalie, line and transaction reports appear here as sources publish them.</span> ${newsLine}</div>`;
  }
  return `<ol class="changes__list">${items.slice(0, 6).map(it => `<li class="change change--${it.tone}${it.pl || it.team ? ' has-id' : ''}">
      ${it.pl ? playerIdentity({ id: it.pl.id, name: it.pl.name, team: it.team, size: 'md' }) : it.team ? teamMark({ abbrev: it.team }, 40) : ''}
      <span class="pbe-badge pbe-badge--${it.tone === 'news' ? 'sched' : it.tone}">${esc(it.tag)}</span>
      <a href="${esc(it.href)}" ${it.external ? 'target="_blank" rel="noopener nofollow"' : ''}>${esc(it.text)}</a>
      <span class="micro">${esc(it.src || '')}${it.more ? ` +${it.more} more` : ''}${it.at ? ` · ${esc(ageText((Date.now() - Date.parse(it.at)) / 1000))}` : ''}</span>
    </li>`).join('')}</ol><div class="changes__foot">${newsLine}${items.length > 6 ? ` <a class="micro gold" href="#/news">All ${items.length} updates →</a>` : ''}</div>`;
}

// ------------------------------------------------------------ E. quick launch
// Real tools only. Every destination is a generic route with its own valid
// entry state — no route here is handed a hardcoded game id or date.
const ICON = {
  replay: '<path d="M3 10a8 8 0 1 1 2.3 5.7"/><polyline points="3 4 3 10 9 10"/>',
  shots: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M12 5v14"/><circle cx="7.5" cy="12" r="1.6"/><circle cx="16.5" cy="10" r="1.6"/>',
  lines: '<path d="M4 7h7M4 12h13M4 17h9"/><circle cx="19" cy="7" r="1.5"/><circle cx="20" cy="17" r="1.5"/>',
  players: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 11.2A3 3 0 1 0 16 5"/><path d="M17 20a6 6 0 0 0-2.5-4.9"/>',
  standings: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  news: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 9h4v8a2 2 0 0 1-2 2h-2"/><path d="M6 9h8M6 12.5h8M6 16h5"/>',
  markets: '<polyline points="3 16 9 10 13 14 21 6"/><polyline points="15 6 21 6 21 12"/>',
  methodology: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'
};
const icon = id => `<svg class="ql__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[id] || ICON.methodology}</svg>`;

export function tools(env = {}) {
  return [
    ['replay', 'Replay', 'Any completed game, event by event', '#/cast'],
    ['shots', 'Shot Lab', 'Every attempt, placed on the rink', '#/shots'],
    ['lines', 'Lines', 'Official rosters and last-game deployment', '#/lines'],
    ['players', 'Players', 'Leaders, game logs, rosters', '#/players'],
    ['standings', 'Standings', 'Final 2025-26 table, labelled', '#/standings'],
    ['news', 'News', 'Injuries, transactions, trades', '#/news'],
    ...(env.odds ? [['markets', 'Markets', 'Best line across books, snapshot', '#/props']] : []),
    ['methodology', 'Methodology', 'Every source and its freshness rule', '#/methodology']
  ].map(([id, label, note, href]) => ({ id, label, note, href }));
}

export function quickLaunch(state) {
  const list = tools(state.env || {});
  return `<div class="section-head section-head--tight">
      <div><span class="eyebrow">Research</span><h2>Quick launch</h2></div>
      <p>${list.length} tools that work on real data today.</p>
    </div>
    <ul class="ql">${list.map(t => `<li><a class="ql__card" href="${esc(t.href)}">${icon(t.id)}<b>${esc(t.label)}</b><span>${esc(t.note)}</span></a></li>`).join('')}</ul>`;
}

// --------------------------------------------------------- F. intel status
export function intelStatus(state) {
  const mode = seasonMode(state.today || state.board);
  const panel = state.env ? modePanel(mode, state.env, { open: Boolean(state.openMode) }) : '';
  const compat = state.board?.compat
    ? `<div class="pbe-note page-note"><b>Limited data layer.</b> This environment's PropSports API does not serve the NHL intelligence routes yet, so the board shows the official schedule from the legacy route only — no live clock, shots, goalies or newsroom here. Nothing is filled in.</div>`
    : '';
  const coverage = mode.key.startsWith('PRESEASON') ? '' : `<div class="coverage" aria-label="Data coverage">
      <span><i class="ok"></i>Schedule${state.board?.compat ? '' : ' &amp; scores'} · NHL</span>
      <span><i class="${state.board?.compat ? 'off' : 'ok'}"></i>Play-by-play &amp; shot coordinates${state.board?.compat ? ' · not in this environment' : ' · NHL'}</span>
      <span><i class="${state.board?.compat ? 'off' : 'part'}"></i>Starting goalies · ${state.board?.compat ? 'not in this environment' : 'confirmed at puck drop'}</span>
      ${state.market?.meta ? `<span><i class="ok"></i>Odds · scheduled snapshot · ${esc(state.market.count)} games</span><span><i class="${state.market.props ? 'ok' : 'off'}"></i>Player props · ${state.market.props ? 'posted' : 'not posted yet'}</span>` : '<span><i class="off"></i>Odds &amp; props · not in this environment</span>'}
      <span><i class="off"></i>Injuries &amp; lines · licensed source required</span>
    </div>`;
  return `${compat}${coverage}${panel}`;
}

// ------------------------------------------------------------------- view
// The whole page below the hero photograph, as one pure function of state.
export function boardView(state) {
  return `${heroInner(state)}
    ${slateView(state)}
    ${picksBlock(state)}
    ${changesMarkup(state.today, state.news)}
    ${quickLaunch(state)}
    ${intelStatus(state)}`;
}

// ------------------------------------------------------------------ mount
export function mount(root, params, ctx) {
  const state = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : todayET(),
    filter: 'ALL',
    board: null, meta: null, failed: false, error: null,
    today: null, todayMeta: null, todayFailed: false,
    next: null,
    picks: { date: null, health: null, slate: null, preseason: null, healthError: null, slateError: null, preseasonError: null, locks: new Map(), loadedAt: 0 },
    news: null,
    market: null,
    env: null,
    openMode: Boolean(params.mode)
  };

  root.innerHTML = `
    <section class="hero hero--slate" aria-labelledby="hero-title">
      ${heroPicture()}
      <div class="hero__scrim" aria-hidden="true"></div>
      <div class="hero__in wrap" id="hero-in">${heroInner(state)}</div>
    </section>
    <section class="wrap section board" id="ice-board" aria-label="Ice Board" data-fresh-scope></section>
    <section class="wrap section-tight" id="picks-entry" aria-label="PBE Picks"></section>
    <section class="wrap section-tight changes" aria-labelledby="changes-title">
      <div class="changes__head"><span class="eyebrow" id="changes-title">What changed · last 24 hours</span><a class="micro changes__all" href="#/news">Newsroom →</a></div>
      <div id="changes"><div class="pbe-skeleton changes__skel"></div></div>
    </section>
    <section class="wrap section-tight" id="quick-launch" aria-label="Research and tools"></section>
    <section class="wrap section-tight" id="intel-status" aria-label="NHL intelligence status"></section>`;

  const heroEl = $('#hero-in', root);
  const boardEl = $('#ice-board', root);
  const picksEl = $('#picks-entry', root);
  const qlEl = $('#quick-launch', root);
  const intelEl = $('#intel-status', root);

  const renderHero = () => { heroEl.innerHTML = heroInner(state); };
  const renderBoard = () => { boardEl.innerHTML = slateView(state); };
  const renderPicks = () => { picksEl.innerHTML = picksBlock(state); };
  const renderChanges = () => { $('#changes', root).innerHTML = changesMarkup(state.today, state.news); };
  const renderTail = () => { qlEl.innerHTML = quickLaunch(state); intelEl.innerHTML = intelStatus(state); };
  renderBoard();
  renderPicks();

  Promise.all([dataLayer(), oddsConfigured()])
    .then(([layer, oddsOn]) => { state.env = { dataLayer: layer, odds: oddsOn }; })
    .catch(() => { state.env = { dataLayer: 'unknown', odds: false }; })
    .then(() => {
      renderBoard();
      renderTail();
      if (params.mode) $('#mode-panel', root)?.scrollIntoView({ block: 'start' });
    });

  // Today (hero + changes rail) and the selected board date poll separately;
  // when they are the same date one request serves both. When today has no
  // games the NEXT slate is fetched through the same accessor so the section
  // below shows real cards instead of the three matchups in next_puck_drop.
  const poller = createPoller(async signal => {
    const todayRes = await ctx.board(todayET(), { signal, maxAgeMs: 8000 });
    state.today = todayRes.data; state.todayMeta = todayRes.meta; state.todayFailed = false;
    if (state.date === todayET()) {
      state.board = todayRes.data; state.meta = todayRes.meta; state.failed = false; state.error = null;
    } else if (!state.board || state.board.date !== state.date || state.board.counts?.LIVE) {
      const res = await ctx.board(state.date, { signal, maxAgeMs: state.board?.counts?.LIVE ? 8000 : 60000 });
      state.board = res.data; state.meta = res.meta; state.failed = false; state.error = null;
    }
    const next = nextSlateFacts(state.today);
    if (!state.board?.games?.length && next && next.date !== state.date) {
      if (state.next?.board?.date !== next.date) {
        const res = await ctx.board(next.date, { signal, maxAgeMs: 120000 });
        state.next = { board: res.data, meta: res.meta };
      }
    } else if (state.next && state.board?.games?.length) {
      state.next = null;
    }
    loadPicks();
    renderHero();
    renderBoard();
    renderTail();
    const live = (state.today.counts?.LIVE || 0) + (state.board?.counts?.LIVE || 0);
    return live ? 10000 : 60000;
  }, {
    onError(error) {
      state.error = error;
      state.failed = Boolean(state.board);
      state.todayFailed = Boolean(state.today);
      if (state.board?.date !== state.date) { state.board = null; }
      renderHero();
      renderBoard();
      renderTail();
      return error.kind === 'not_deployed' || error.kind === 'legacy' ? null : 10000;
    }
  });
  poller.start();

  // PBE Picks: PUBLIC read APIs only, never /pro/*. Game cards receive only
  // lock-policy timestamps. The hero may surface a public preseason pick
  // spotlight because that same call is already published on the free Picks
  // surface; official protected pick values remain behind NHL Pro.
  const picksCtl = new AbortController();
  let picksToken = 0;
  function loadPicks() {
    const date = picksSlateDate(state);
    const now = Date.now();
    if (!date || (state.picks.date === date && now - (state.picks.loadedAt || 0) < 60000)) return;
    const mine = ++picksToken;
    state.picks = { ...state.picks, date, healthError: null, slateError: null, preseasonError: null };
    const settle = p => p.then(v => ({ v, e: null }), e => ({ v: null, e }));
    Promise.all([
      settle(picksHealth({ signal: picksCtl.signal, timeout: 9000 })),
      settle(picksSlate(date, { signal: picksCtl.signal, timeout: 9000 })),
      settle(picksPreseason(date, { signal: picksCtl.signal, timeout: 9000 }))
    ]).then(([health, slate, preseason]) => {
      if (mine !== picksToken) return;
      if (health.e?.kind === 'aborted' || slate.e?.kind === 'aborted' || preseason.e?.kind === 'aborted') return;
      const minutes = health.v?.data?.pipeline?.lock_policy?.target_lock_minutes_before_start ?? null;
      const locks = new Map();
      for (const g of slate.v?.data?.games || []) {
        const target = g.lock_window?.target_utc || null;
        if (target || minutes !== null) locks.set(String(g.game_id ?? g.id ?? ''), { targetUtc: target, minutes: minutes === null ? null : Number(minutes) });
      }
      state.picks = {
        date,
        health: health.v?.data || null, healthError: health.e || null,
        slate: slate.v?.data || null, slateError: slate.e || null,
        preseason: preseason.v?.data || null, preseasonError: preseason.e || null,
        locks,
        loadedAt: Date.now()
      };
      renderHero();
      renderPicks();
      renderBoard();
    });
  }

  // Market snapshot (optional service; 3 scheduled ingests a day). Absent =
  // no market rows, never placeholder prices.
  const oddsCtl = new AbortController();
  const loadOdds = () => odds({}, { signal: oddsCtl.signal, timeout: 8000 })
    .then(res => {
      const byGame = new Map((res.data.events || []).filter(e => e.game_id).map(e => [String(e.game_id), e]));
      state.market = { byGame, meta: res.meta, count: byGame.size, props: (res.data.events || []).some(e => e.props?.length) };
      renderBoard();
      renderTail();
    })
    .catch(() => { state.market = null; });
  loadOdds();
  const oddsTimer = setInterval(loadOdds, 10 * 60 * 1000);

  // Newsroom (optional source). Failure is shown, never filled.
  const newsCtl = new AbortController();
  news({ limit: 40 }, { signal: newsCtl.signal, timeout: 9000 })
    .then(res => {
      // Material items from the last 24h lead; nothing older is called a change.
      const dayAgo = Date.now() - 24 * 3600 * 1000;
      const items = (res.data.items || []).filter(i => i.material && Date.parse(i.published_at) >= dayAgo);
      state.news = { items, meta: res.meta, degraded: res.data.degraded };
      renderChanges();
    })
    .catch(error => {
      if (error.kind === 'aborted') return;
      state.news = { items: [], error: error.kind === 'not_deployed' ? 'feed not connected in this build' : 'feed unavailable' };
      renderChanges();
    });

  const countdownTimer = setInterval(() => {
    const node = $('[data-countdown]', root);
    if (node) node.innerHTML = countdownMarkup(node.dataset.countdown);
    for (const el of $$('[data-countdown-short]', root)) el.textContent = countdownShort(el.dataset.countdownShort);
  }, 1000);

  const setDate = date => {
    state.date = date;
    state.board = null; state.error = null;
    history.replaceState(null, '', date === todayET() ? '#/' : `#/?date=${date}`);
    renderBoard();
    poller.refresh();
  };

  const disposers = [
    on(root, 'click', '[data-filter]', (_, btn) => { state.filter = btn.dataset.filter; renderBoard(); }),
    on(root, 'click', '[data-shift]', (_, btn) => setDate(addDays(state.date, Number(btn.dataset.shift)))),
    on(root, 'click', '[data-goto]', (_, btn) => setDate(btn.dataset.goto)),
    on(root, 'change', '#board-date', (_, input) => { if (/^\d{4}-\d{2}-\d{2}$/.test(input.value)) setDate(input.value); }),
    on(root, 'click', '[data-jump]', event => { event.preventDefault(); boardEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); })
  ];

  return () => {
    poller.stop();
    newsCtl.abort();
    oddsCtl.abort();
    picksCtl.abort();
    picksToken += 1;
    clearInterval(oddsTimer);
    clearInterval(countdownTimer);
    disposers.forEach(d => d());
  };
}
