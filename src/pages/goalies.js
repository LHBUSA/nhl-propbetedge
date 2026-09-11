// Goalie Center. Who is starting, how rested, how they have been working.
// Truth levels are never collapsed: CONFIRMED / PROJECTED·REPORTED / UNKNOWN.
// The backend emits CONFIRMED (boxscore starter flag, at/after puck drop) or
// UNKNOWN today; nothing on this page projects a starter.
import { $, esc, on, safeUrl } from '../lib/dom.js';
import { dataLayer, describeError, nhl } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { addDays, clockET, dateLabel, dayET, gameTypeLabel, n, num, svPct, timeET, todayET } from '../lib/format.js';
import { createPoller } from '../lib/poll.js';
import { teamAccent, TEAM_BY_ABBREV } from '../lib/teams.js';
import { stateBadge, stateOf, teamMark } from '../components/game.js';
import { playerIdentity } from '../components/player.js';

// Logos here always sit next to visible team text: decorative, so alt="".
const mark = (team, size) => teamMark(team, size).replace(/ alt="[^"]*"/, ' alt=""');

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const LIVEISH = new Set(['LIVE', 'INTERMISSION']);
const PREISH = new Set(['SCHEDULED', 'PREGAME']);
const LEADER_CATS = [
  ['savePctg', 'Save %', v => svPct(v)],
  ['goalsAgainstAverage', 'Goals-against average', v => num(v, 2)],
  ['wins', 'Wins', v => num(v)]
];

// ---------------------------------------------------------------- helpers
const seasonLabel = id => {
  const s = String(id || '');
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}–${s.slice(6, 8)}` : '';
};
const typeWord = t => ({ 1: 'preseason', 2: 'regular season', 3: 'playoffs' }[Number(t)] || '');
// NHL game ids encode the game type in digits 5-6 (01 pre, 02 reg, 03 playoffs).
const idType = id => ({ '01': 'PRE', '02': 'REG', '03': 'PO' }[String(id || '').slice(4, 6)] || '');
// Season id a calendar date belongs to (NHL seasons roll over in summer).
const seasonIdFor = ymd => {
  const y = Number(String(ymd).slice(0, 4)); const m = Number(String(ymd).slice(5, 7));
  return m >= 7 ? Number(`${y}${y + 1}`) : Number(`${y - 1}${y}`);
};
const monogram = name => esc(String(name || '').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '—');
const shortDate = ymd => (YMD.test(ymd || '') ? dateLabel(ymd).replace(/^\w+,\s*/, '') : '—');
const teamName = abbrev => TEAM_BY_ABBREV.get(abbrev)?.name || abbrev || '';
const whenText = g => `${dayET(g.start_time_utc)} · ${timeET(g.start_time_utc)}`;

async function pool(items, limit, fn) {
  let i = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(lanes);
}

function level(status) {
  if (status === 'CONFIRMED') return 'CONFIRMED';
  if (status === 'PROJECTED' || status === 'REPORTED') return 'PROJECTED';
  return 'UNKNOWN';
}

function errorBox(error) {
  const e = describeError(error);
  return `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`;
}

// ---------------------------------------------------------------- pieces
function ladder(lv) {
  const cells = [['CONFIRMED', 'Confirmed'], ['PROJECTED', 'Projected · Reported'], ['UNKNOWN', 'Unknown']];
  return `<div class="dk-ladder" role="img" aria-label="Starter truth level: ${esc(lv)}">${cells.map(([k, l]) =>
    `<span class="dk-ladder__cell${k === lv ? ' is-on' : ''}" data-lv="${k}">${esc(l)}</span>`).join('')}</div>`;
}

function starterBlock(t, big) {
  const s = t.starter || { status: 'UNKNOWN', basis: 'The source did not return a starter record.' };
  const lv = level(s.status);
  const g = (t.goalies || []).find(x => x.id === s.goalie_id);
  const name = g?.name || s.name;
  const src = safeUrl(s.source_url);
  const who = lv === 'UNKNOWN'
    ? `<div class="dk-starter__who">${playerIdentity({ team: t.team, size: big ? 'lg' : 'md' })}<div><b>Starter not confirmed</b><span class="micro">No defensible source yet</span></div></div>`
    : `<div class="dk-starter__who">${playerIdentity({ id: s.goalie_id, name, team: t.team, size: big ? 'lg' : 'md' })}<div>${s.goalie_id ? `<a href="#/player/${esc(s.goalie_id)}"><b>${esc(name || 'Unnamed')}</b></a>` : `<b>${esc(name || 'Unnamed')}</b>`}<span class="micro">${lv === 'CONFIRMED' ? 'Started · on record' : 'Reported starter · not official'}</span></div></div>`;
  return `<div class="dk-starter dk-starter--${lv.toLowerCase()}${big ? ' dk-starter--big' : ''}">
    ${ladder(lv)}
    ${who}
    <p class="dk-starter__basis">${esc(s.basis || '')}</p>
    ${lv !== 'UNKNOWN' ? `<p class="micro dk-starter__src">Source ${esc(s.source || '—')}${s.captured_at ? ` · captured ${esc(dayET(s.captured_at))} ${esc(clockET(s.captured_at))}` : ''}${src ? ` · <a class="gold" href="${esc(src)}" target="_blank" rel="noopener nofollow">record ↗</a>` : ''}</p>` : ''}
  </div>`;
}

function restBlock(t, game) {
  const r = t.rest;
  // Rest is computed from the game's own season schedule (backend 7edb1a5).
  if (!r) return '<p class="micro dk-rest__note">Rest context unavailable — the team schedule source did not answer.</p>';
  const prev = r.previous_game_date;
  const b2b = r.back_to_back;
  return `<dl class="kv dk-rest">
    <div><dt>Days rest</dt><dd>${prev ? esc(r.days_rest ?? '—') : '—'}</dd></div>
    <div><dt>Back-to-back</dt><dd>${b2b === true ? '<span class="pbe-badge pbe-badge--alert">B2B</span>' : b2b === false ? 'No' : '—'}</dd></div>
    <div class="dk-rest__prev"><dt>Previous game</dt><dd>${prev ? `${esc(shortDate(prev))}${r.previous_game_type ? ` <span class="faint">${esc(gameTypeLabel(r.previous_game_type))}</span>` : ''}` : '<span class="dk-dd-text">No prior game this season</span>'}</dd></div>
  </dl>`;
}

function goalieTable(t, big, gameId = '') {
  const rows = t.goalies || [];
  const starterId = t.starter?.status === 'CONFIRMED' ? t.starter.goalie_id : null;
  const season = `${seasonLabel(t.stats_season) || 'Season not stated'} ${typeWord(t.stats_game_type) || ''}`.trim();
  if (!rows.length) {
    return `<p class="micro dk-note-line">${t.partial?.club_stats ? 'Club goalie stats unavailable — source did not answer.' : 'No goalie season lines listed by the source.'}</p>`;
  }
  return `<div class="dk-tablehead"><span class="micro">Goalies · ${esc(season)}</span><span class="micro faint">NHL club stats</span></div>
    <div class="table-wrap" tabindex="0" role="region" aria-label="${esc(t.team || '')} goalie season lines${gameId ? ` · game ${esc(gameId)}` : ''}"><table class="pbe-table dk-gtable">
      <thead><tr><th>Goalie</th><th class="num">GP</th><th class="num">GS</th><th class="num">W-L-OTL</th><th class="num">SV%</th><th class="num">GAA</th><th class="num">SA</th>${big ? '<th class="num">SO</th>' : ''}</tr></thead>
      <tbody>${rows.map(g => `<tr${g.id === starterId ? ' class="is-starter"' : ''}>
        <td><a class="dk-gname" href="#/player/${esc(g.id)}">${playerIdentity({ id: g.id, name: g.name, team: t.team, size: 'sm' })}<span>${esc(g.name || 'Unnamed')}</span></a>${g.id === starterId ? ' <span class="pbe-badge pbe-badge--confirmed">Started</span>' : ''}</td>
        <td class="num">${num(g.games_played)}</td><td class="num">${num(g.games_started)}</td>
        <td class="num">${num(g.wins)}-${num(g.losses)}-${num(g.ot_losses)}</td>
        <td class="num">${svPct(g.save_pct)}</td><td class="num">${num(g.gaa, 2)}</td><td class="num">${num(g.shots_against)}</td>
        ${big ? `<td class="num">${num(g.shutouts)}</td>` : ''}
      </tr>`).join('')}</tbody>
    </table></div>`;
}

function workload(g, game) {
  if (!Array.isArray(g.recent)) {
    return `<div class="dk-work"><div class="dk-work__head"><b>${esc(g.name || '')}</b><span class="micro">Game log unavailable</span></div></div>`;
  }
  if (!g.recent.length) {
    return `<div class="dk-work"><div class="dk-work__head"><b>${esc(g.name || '')}</b><span class="micro">No appearances in the source game log</span></div></div>`;
  }
  const games = [...g.recent].reverse(); // oldest → newest, newest on the right
  const po = games.filter(x => idType(x.game_id) === 'PO').length;
  // The game log is "now": for a past game the latest appearances can post-date it.
  const after = game?.date && g.recent[0]?.date && g.recent[0].date > game.date;
  const cells = games.map(x => {
    const sa = n(x.shots_against);
    const h = sa === null ? 0 : Math.max(4, Math.min(sa, 50) / 50 * 100);
    const t = idType(x.game_id);
    const tip = `${x.date || ''} ${x.home_road === 'H' ? 'vs' : '@'} ${x.opponent || ''} · ${x.started ? 'started' : 'relief'} · ${sa ?? '—'} SA · ${x.goals_against ?? '—'} GA · SV ${svPct(x.save_pct)}${x.decision ? ` · ${x.decision}` : ''}${x.toi ? ` · TOI ${x.toi}` : ''}`;
    return `<li class="dk-work__cell${x.started ? ' is-start' : ''}" title="${esc(tip)}">
      <span class="dk-work__date mono">${esc(shortDate(x.date))}</span>
      <span class="dk-work__opp mono">${x.home_road === 'H' ? 'vs' : '@'}${esc(x.opponent || '—')}${t === 'PO' ? '<em>PO</em>' : t === 'PRE' ? '<em>PRE</em>' : ''}</span>
      <span class="dk-work__bar" aria-hidden="true"><i style="height:${h.toFixed(0)}%"></i></span>
      <b class="dk-work__sa mono">${sa ?? '—'}<small>SA</small></b>
      <span class="dk-work__sv mono">${svPct(x.save_pct)}</span>
      <span class="dk-work__gs">${x.started ? 'GS' : 'REL'}</span>
    </li>`;
  }).join('');
  return `<div class="dk-work">
    <div class="dk-work__head"><b>${esc(g.name || '')}</b><span class="micro">Last ${games.length} appearances${po ? ` · ${po} playoff` : ''}${after ? ' · latest on record, after this game' : ''}</span></div>
    <ol class="dk-work__strip">${cells}</ol>
  </div>`;
}

function workloadTable(g) {
  if (!Array.isArray(g.recent) || !g.recent.length) return '';
  return `<div class="table-wrap dk-worktable" tabindex="0" role="region" aria-label="${esc(g.name || 'Goalie')} recent appearances"><table class="pbe-table">
    <thead><tr><th>Date</th><th>Opp</th><th>Type</th><th>Role</th><th class="num">SA</th><th class="num">GA</th><th class="num">SV%</th><th>Dec</th><th class="num">TOI</th></tr></thead>
    <tbody>${g.recent.map(x => `<tr><td class="mono">${esc(shortDate(x.date))}</td><td class="mono">${x.home_road === 'H' ? 'vs' : '@'} ${esc(x.opponent || '—')}</td><td class="mono">${esc(idType(x.game_id) || '—')}</td><td>${x.started ? 'Started' : 'Relief'}</td><td class="num">${num(x.shots_against)}</td><td class="num">${num(x.goals_against)}</td><td class="num">${svPct(x.save_pct)}</td><td class="mono">${esc(x.decision || '—')}</td><td class="num">${esc(x.toi || '—')}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function teamPanel(t, side, game, big) {
  const abbrev = t?.team || game.teams?.[side]?.abbrev || '';
  const teamObj = { ...(game.teams?.[side] || {}), abbrev };
  const where = side === 'away' ? 'Away' : 'Home';
  if (!t) {
    return `<section class="dk-tp" style="--c:${teamAccent(abbrev)}"><header class="dk-tp__head">${mark(teamObj, big ? 44 : 34)}<div><b>${esc(abbrev || 'TBD')}</b><span>${where}</span></div></header><p class="dim">Team not yet set by the source.</p></section>`;
  }
  const topTwo = (t.goalies || []).slice(0, 2);
  return `<section class="dk-tp" style="--c:${teamAccent(abbrev)}">
    <header class="dk-tp__head">${mark(teamObj, big ? 44 : 34)}<div><b>${esc(abbrev)}</b><span>${esc(game.teams?.[side]?.name || teamName(abbrev))} · ${where}</span></div>
      <a class="dk-link" href="#/team/${esc(abbrev)}">Team</a></header>
    ${starterBlock(t, big)}
    ${restBlock(t, game)}
    ${goalieTable(t, big, game.id)}
    ${topTwo.length ? `<div class="dk-tablehead"><span class="micro">Recent workload · top ${topTwo.length} by starts</span><span class="micro faint">Player game logs</span></div>
      <div class="dk-works">${topTwo.map(g => `${workload(g, game)}${big ? workloadTable(g) : ''}`).join('')}</div>` : ''}
  </section>`;
}

function gameArticle(game, entry, { big = false } = {}) {
  const g = entry?.data?.game || game;
  const a = g.teams?.away || {}; const h = g.teams?.home || {};
  const body = !entry
    ? '<div class="dk-game__teams"><div class="pbe-skeleton" style="height:360px"></div><div class="pbe-skeleton" style="height:360px"></div></div>'
    : entry.data
      ? `<div class="dk-game__teams">${teamPanel(entry.data.teams?.away, 'away', g, big)}${teamPanel(entry.data.teams?.home, 'home', g, big)}</div>`
      : errorBox(entry.error);
  const type = gameTypeLabel(g.game_type);
  return `<article class="dk-game${big ? ' dk-game--big' : ''}" data-game="${esc(g.id)}" data-fresh-scope style="--away:${teamAccent(a.abbrev)};--home:${teamAccent(h.abbrev)}">
    <header class="dk-game__head">
      <div class="dk-game__match">
        ${mark(a, big ? 56 : 36)}<span class="dk-game__abbr">${esc(a.abbrev || 'TBD')}</span>
        <span class="dk-game__at">@</span>
        ${mark(h, big ? 56 : 36)}<span class="dk-game__abbr">${esc(h.abbrev || 'TBD')}</span>
      </div>
      <div class="dk-game__meta">
        ${stateBadge(g)}
        <span class="mono">${esc(whenText(g))}</span>
        ${type ? `<span class="micro">${esc(type)}</span>` : ''}
        ${g.venue ? `<span class="dim dk-game__venue">${esc(g.venue)}</span>` : ''}
      </div>
      <div class="dk-game__links">
        ${entry?.data ? freshStamp(entry.meta, { failed: entry.failed }) : ''}
        ${big ? '' : `<a class="dk-link dk-link--gold" href="#/goalies/${esc(g.id)}">Focus</a>`}
        <a class="dk-link" href="#/cast/${esc(g.id)}">PBE Cast</a>
        <a class="dk-link" href="#/matchup/${esc(g.id)}">Matchup</a>
      </div>
    </header>
    ${body}
    <footer class="dk-game__foot micro">GSAx: unavailable — requires a validated xG model; none is released.</footer>
  </article>`;
}

function starterGrid(games, store, limited = false) {
  const cell = (entry, side, game) => {
    const team = game.teams?.[side] || {};
    const head = `${mark(team, 24)}<b>${esc(team.abbrev || 'TBD')}</b>`;
    if (limited) return `<span class="dk-sg__team">${head}<span class="pbe-badge pbe-badge--unavailable">Unavailable</span></span>`;
    if (!entry) return `<span class="dk-sg__team">${head}<span class="pbe-skeleton dk-sg__skel"></span></span>`;
    if (!entry.data) return `<span class="dk-sg__team">${head}<span class="micro">No data</span></span>`;
    const t = entry.data.teams?.[side];
    const lv = level(t?.starter?.status);
    const g = (t?.goalies || []).find(x => x.id === t?.starter?.goalie_id);
    const name = g?.name || t?.starter?.name;
    const badge = lv === 'CONFIRMED' ? '<span class="pbe-badge pbe-badge--confirmed">Confirmed</span>'
      : lv === 'PROJECTED' ? '<span class="pbe-badge pbe-badge--reported">Reported</span>'
        : '<span class="pbe-badge pbe-badge--unknown">Unknown</span>';
    return `<span class="dk-sg__team">${head}${badge}${lv !== 'UNKNOWN' && name ? `<span class="dk-sg__name">${esc(name)}</span>` : ''}</span>`;
  };
  return `<div class="dk-sg">
    ${games.map(g => {
      const entry = store.get(String(g.id));
      return `<a class="dk-sg__row" href="#/goalies/${esc(g.id)}" title="${esc(`${g.teams?.away?.abbrev || 'TBD'} @ ${g.teams?.home?.abbrev || 'TBD'} · goalie detail`)}">
        <span class="dk-sg__when">${stateBadge(g)}</span>
        <span class="dk-sg__cell">${cell(entry, 'away', g)}</span>
        <span class="dk-sg__cell">${cell(entry, 'home', g)}</span>
        <span class="dk-sg__go" aria-hidden="true">›</span>
      </a>`;
    }).join('')}
  </div>`;
}

function gridBlock(games, store, limited = false) {
  if (limited) {
    return `<div class="dk-sgwrap">
      <div class="pbe-note dk-banner"><b>Limited mode.</b> Goalie status, rest and season lines need the NHL intelligence v2 routes, which this environment's API does not serve yet. The schedule below is real (legacy route); nothing else is shown rather than guessed.</div>
      <div class="dk-sgwrap__head"><span class="eyebrow">Schedule</span><span class="micro">${games.length} game${games.length === 1 ? '' : 's'}</span></div>
      ${starterGrid(games, store, true)}
    </div>`;
  }
  let confirmed = 0; let loaded = 0;
  games.forEach(g => {
    const d = store.get(String(g.id))?.data;
    if (d) loaded += 1;
    ['away', 'home'].forEach(s => { if (d?.teams?.[s]?.starter?.status === 'CONFIRMED') confirmed += 1; });
  });
  return `<div class="dk-sgwrap">
    <div class="dk-sgwrap__head"><span class="eyebrow">Starter board</span>
      <span class="micro">${games.length} game${games.length === 1 ? '' : 's'} · ${confirmed} of ${games.length * 2} starters confirmed${loaded < games.length ? ` · loading ${games.length - loaded}` : ''}</span></div>
    ${starterGrid(games, store)}
    <p class="micro dk-sgwrap__foot">Confirmed = NHL box-score starter flag, recorded at puck drop. Before that every starter stays Unknown — no licensed pregame source is integrated and we do not project starters.</p>
  </div>`;
}

function leadersMarkup(leaders, calendar) {
  const entries = LEADER_CATS.map(([k]) => leaders[k]);
  if (entries.every(x => !x)) return `<div class="dk-leaders">${'<div class="pbe-skeleton" style="height:320px"></div>'.repeat(3)}</div>`;
  if (entries.every(x => x && !x.data)) return errorBox(entries[0].error);
  const anyData = entries.find(x => x?.data)?.data;
  let seasonText = 'window as served by the source';
  if (anyData?.season) seasonText = `${seasonLabel(anyData.season)} ${typeWord(anyData.game_type) || ''}`.trim();
  else if (calendar?.regular_season_start && todayET() < calendar.regular_season_start) {
    const y = Number(calendar.regular_season_start.slice(0, 4));
    seasonText = `${y - 1}–${String(y).slice(2)} ${typeWord(anyData?.game_type) || 'regular season'} (most recent completed season)`;
  }
  const panel = ([key, label, fmt]) => {
    const entry = leaders[key];
    if (!entry) return '<div class="pbe-skeleton" style="height:320px"></div>';
    if (!entry.data) return `<section class="pbe-panel dk-lead"><div class="panel-head"><h3>${esc(label)}</h3></div>${errorBox(entry.error)}</section>`;
    const rows = entry.data.leaders || [];
    return `<section class="pbe-panel dk-lead">
      <div class="panel-head"><h3>${esc(label)}</h3>${freshStamp(entry.meta)}</div>
      ${rows.length ? `<ol class="dk-lead__list">${rows.map((r, i) => `<li>
        <span class="dk-lead__rk mono">${i + 1}</span>
        ${mark({ abbrev: r.team, logo: r.team_logo }, 22)}
        <a class="dk-lead__name" href="#/player/${esc(r.id)}">${esc(r.name || '')}</a>
        <span class="dk-lead__team mono">${esc(r.team || '')}</span>
        <b class="dk-lead__val mono">${esc(fmt(r.value))}</b>
      </li>`).join('')}</ol>` : '<p class="dim">The source lists no leaders for this window.</p>'}
    </section>`;
  };
  return `<p class="dk-season"><span class="pbe-badge pbe-badge--sched">Season</span> <span>${esc(seasonText)}</span>${anyData?.season_note ? ` <span class="faint">· ${esc(anyData.season_note)}</span>` : ''}</p>
    <div class="dk-leaders">${LEADER_CATS.map(panel).join('')}</div>`;
}

// ---------------------------------------------------------------- mount
export function mount(root, params, ctx) {
  const focusId = params.gameId || null;
  const state = {
    date: YMD.test(params.date || '') ? params.date : null,
    resolved: false,
    slateNote: '',
    board: null, boardMeta: null, boardFailed: false, boardError: null,
    games: [],
    store: new Map(),       // gameId -> { data, meta, failed, error }
    loadedOnce: false,
    leaders: {},
    calendar: null,
    focus: null,            // { data, meta, failed, error }
    pickGames: [],
    limited: false          // environment without the v2 data layer
  };
  const ctl = new AbortController();

  root.innerHTML = `<section class="wrap section dk dk-goalies">
    <div class="section-head">
      <div><span class="eyebrow">Goalie Center${focusId ? ' · Game focus' : ''}</span><h2 id="dk-g-title">${focusId ? 'Who is in net' : 'Who is starting in goal'}</h2></div>
      <p>Starter status in three truth levels — Confirmed, Projected · Reported, Unknown — with rest, workload and season lines, each labelled by source and season.</p>
    </div>
    <div id="dk-g-tools"></div>
    <div id="dk-g-body"></div>
    <section class="dk-sub" aria-labelledby="dk-lead-title">
      <div class="section-head section-head--editorial"><div><span class="eyebrow">League</span><h2 id="dk-lead-title">Goalie leaders</h2></div></div>
      <div id="dk-g-leaders"></div>
    </section>
  </section>`;
  const tools = $('#dk-g-tools', root);
  const body = $('#dk-g-body', root);
  const leadersEl = $('#dk-g-leaders', root);

  const renderLeaders = () => { leadersEl.innerHTML = leadersMarkup(state.leaders, state.calendar); };

  const renderTools = () => {
    if (focusId) {
      const date = state.focus?.data?.game?.date;
      tools.innerHTML = `<div class="dk-toolbar">
        <a class="pbe-btn pbe-btn--sm" href="#/goalies${date ? `?date=${esc(date)}` : ''}">‹ All games${date ? ` · ${esc(dateLabel(date))}` : ''}</a>
        ${state.pickGames.length <= 1 ? '<div class="dk-picker" aria-hidden="true"></div>' : `<nav class="dk-picker" aria-label="Other games this date">${state.pickGames.map(g => `<a class="dk-pick${String(g.id) === String(focusId) ? ' is-active' : ''}"${String(g.id) === String(focusId) ? ' aria-current="page"' : ''} href="#/goalies/${esc(g.id)}"><span class="mono">${esc(g.teams.away.abbrev)} <span class="faint">@</span> ${esc(g.teams.home.abbrev)}</span><span class="micro">${esc(stateOf(g).text)}</span></a>`).join('')}</nav>`}
      </div>`;
      return;
    }
    const date = state.date || todayET();
    const isToday = date === todayET();
    tools.innerHTML = `<div class="dk-toolbar">
      <div class="dk-toolbar__title"><b>${esc(dateLabel(date, { long: true }))}</b>${state.slateNote ? `<span class="pbe-badge pbe-badge--sched">${esc(state.slateNote)}</span>` : ''}</div>
      <div class="datenav" role="group" aria-label="Choose date">
        <button class="pbe-btn pbe-btn--sm" data-shift="-1" aria-label="Previous day">‹</button>
        <button class="pbe-btn pbe-btn--sm${isToday ? ' is-current' : ''}" data-goto="${todayET()}">Today</button>
        <button class="pbe-btn pbe-btn--sm" data-shift="1" aria-label="Next day">›</button>
        <label class="sr-only" for="dk-g-date">Date</label>
        <input id="dk-g-date" class="datenav__input" type="date" value="${esc(date)}">
      </div>
      ${state.board ? freshStamp(state.boardMeta, { failed: state.boardFailed, label: 'Schedule' }) : ''}
    </div>`;
  };

  const renderSlate = () => {
    if (!state.board) {
      body.innerHTML = state.boardError ? errorBox(state.boardError) : '<div class="pbe-skeleton" style="height:120px;margin-bottom:16px"></div><div class="pbe-skeleton" style="height:420px"></div>';
      return;
    }
    const games = state.games;
    if (!games.length) {
      const next = state.board.next_puck_drop;
      body.innerHTML = `<div class="pbe-empty"><h3>No NHL games on ${esc(dateLabel(state.date, { long: true }))}.</h3>
        <p>${next ? `Next puck drop: <b>${esc(dayET(next.start_time_utc, true))} · ${esc(timeET(next.start_time_utc))}</b> — ${esc(next.games_that_day)} game${next.games_that_day === 1 ? '' : 's'}.` : 'The source schedule lists no upcoming game in its current window.'}</p>
        ${next && next.date !== state.date ? `<p style="margin-top:14px"><button class="pbe-btn pbe-btn--primary" data-goto="${esc(next.date)}">Open the ${esc(dateLabel(next.date))} slate</button></p>` : ''}</div>`;
      return;
    }
    if (state.limited) { body.innerHTML = gridBlock(games, state.store, true); return; }
    body.innerHTML = `${gridBlock(games, state.store)}
      <div class="dk-games">${games.map(g => gameArticle(g, state.store.get(String(g.id)))).join('')}</div>`;
  };

  // Replace one game (and the grid summary) without re-rendering the page.
  const patchGame = id => {
    const game = state.games.find(g => String(g.id) === String(id));
    const node = body.querySelector(`[data-game="${CSS.escape(String(id))}"]`);
    if (!game || !node) { renderSlate(); return; }
    node.outerHTML = gameArticle(game, state.store.get(String(id)));
    const grid = body.querySelector('.dk-sgwrap');
    if (grid) grid.outerHTML = gridBlock(state.games, state.store);
  };

  async function loadGoalies(id, signal) {
    const key = String(id);
    try {
      const res = await nhl(`/nhl/game/${key}/goalies`, {}, { signal, timeout: 15000 });
      state.store.set(key, { data: res.data, meta: res.meta, failed: false, error: null });
    } catch (error) {
      if (error.kind === 'aborted' || signal.aborted) return;
      const prev = state.store.get(key);
      state.store.set(key, prev?.data ? { ...prev, failed: true, error } : { data: null, meta: null, failed: true, error });
    }
    if (!signal.aborted) patchGame(key);
  }

  async function resolveDate(signal) {
    if (state.date) { state.resolved = true; return; }
    const today = await ctx.board(todayET(), { signal });
    state.calendar = today.data.calendar || null;
    if (today.data.games?.length) {
      state.date = todayET();
      state.slateNote = 'Today';
    } else if (today.data.next_puck_drop?.date) {
      state.date = today.data.next_puck_drop.date;
      state.slateNote = 'Next slate';
    } else {
      state.date = todayET();
    }
    state.resolved = true;
  }

  const volatile = g => {
    const k = stateOf(g).key;
    if (LIVEISH.has(k) || k === 'PREGAME') return true;
    // A scheduled game inside 15 minutes of puck drop is about to flip.
    return k === 'SCHEDULED' && Date.parse(g.start_time_utc) - Date.now() < 15 * 60 * 1000;
  };

  const slatePoller = focusId ? null : createPoller(async signal => {
    if (!state.resolved) await resolveDate(signal);
    const res = await ctx.board(state.date, { signal, maxAgeMs: 20000 });
    state.board = res.data; state.boardMeta = res.meta; state.boardFailed = false; state.boardError = null;
    state.calendar = state.calendar || res.data.calendar || null;
    state.games = res.data.games || [];
    state.limited = (await dataLayer()) === 'legacy';
    renderTools();
    renderSlate();
    renderLeaders();
    if (state.limited) return null;
    const targets = state.loadedOnce ? state.games.filter(volatile) : state.games;
    state.loadedOnce = true;
    await pool(targets, 4, g => loadGoalies(g.id, signal));
    const anyLive = state.games.some(g => LIVEISH.has(stateOf(g).key));
    const anyPending = state.date === todayET() && state.games.some(g => PREISH.has(stateOf(g).key));
    return anyLive ? 60000 : anyPending ? 300000 : null;
  }, {
    onError(error) {
      state.boardError = error;
      state.boardFailed = Boolean(state.board);
      renderTools();
      renderSlate();
      return error.kind === 'not_deployed' || error.kind === 'legacy' ? null : 15000;
    }
  });

  const renderFocus = () => {
    const f = state.focus;
    if (!f) { body.innerHTML = '<div class="pbe-skeleton" style="height:520px"></div>'; return; }
    if (!f.data) { body.innerHTML = errorBox(f.error); return; }
    const g = f.data.game;
    $('#dk-g-title', root).textContent = `${g.teams.away.abbrev || 'TBD'} @ ${g.teams.home.abbrev || 'TBD'} · who is in net`;
    body.innerHTML = gameArticle(g, f, { big: true });
  };

  const focusPoller = focusId ? createPoller(async signal => {
    const res = await nhl(`/nhl/game/${focusId}/goalies`, {}, { signal, timeout: 15000 });
    state.focus = { data: res.data, meta: res.meta, failed: false, error: null };
    renderFocus();
    renderTools();
    if (!state.pickGames.length && res.data.game?.date) {
      ctx.board(res.data.game.date, { signal: ctl.signal }).then(b => {
        state.pickGames = b.data.games || [];
        renderTools();
      }).catch(() => {});
    }
    const k = stateOf(res.data.game).key;
    return LIVEISH.has(k) ? 60000 : PREISH.has(k) ? 300000 : null;
  }, {
    onError(error) {
      state.focus = state.focus?.data ? { ...state.focus, failed: true } : { data: null, meta: null, failed: true, error };
      renderFocus();
      return error.kind === 'not_deployed' || error.kind === 'legacy' ? null : 15000;
    }
  }) : null;

  // League leaders are season aggregates: fetched once.
  LEADER_CATS.forEach(([key]) => {
    nhl('/nhl/goalies/leaders', { category: key, limit: 10 }, { signal: ctl.signal })
      .then(res => { state.leaders[key] = { data: res.data, meta: res.meta }; })
      .catch(error => { if (error.kind !== 'aborted') state.leaders[key] = { data: null, error }; })
      .finally(() => { if (!ctl.signal.aborted) renderLeaders(); });
  });
  ctx.board(todayET(), { signal: ctl.signal })
    .then(b => { state.calendar = b.data.calendar || state.calendar; if (!ctl.signal.aborted) renderLeaders(); })
    .catch(() => {});

  renderTools();
  if (focusId) renderFocus(); else renderSlate();
  renderLeaders();
  slatePoller?.start();
  focusPoller?.start();

  const setDate = date => {
    if (!YMD.test(date || '') || focusId) return;
    state.date = date;
    state.resolved = true;
    state.slateNote = date === todayET() ? 'Today' : '';
    state.board = null; state.boardError = null; state.games = [];
    state.store.clear();
    state.loadedOnce = false;
    history.replaceState(null, '', `#/goalies?date=${date}`);
    renderTools();
    renderSlate();
    slatePoller?.refresh();
  };

  const disposers = [
    on(root, 'click', '[data-shift]', (_, btn) => setDate(addDays(state.date || todayET(), Number(btn.dataset.shift)))),
    on(root, 'click', '[data-goto]', (_, btn) => setDate(btn.dataset.goto)),
    on(root, 'change', '#dk-g-date', (_, input) => setDate(input.value))
  ];

  return () => {
    slatePoller?.stop();
    focusPoller?.stop();
    ctl.abort();
    disposers.forEach(d => d());
  };
}
