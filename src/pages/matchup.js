import { $, esc, on, safeUrl } from '../lib/dom.js';
import { describeError, nhl } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { dateLabel, dayET, gameTypeLabel, n, num, share, svPct, timeET, todayET } from '../lib/format.js';
import { createPoller } from '../lib/poll.js';
import { TEAM_BY_ABBREV, teamAccent } from '../lib/teams.js';
import { stateBadge, stateOf, teamMark } from '../components/game.js';
import { playerIdentity } from '../components/player.js';

// ---- private helpers (lane-local by contract)
const seasonLabel = s => {
  const t = String(s ?? '');
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}–${t.slice(6, 8)}` : '';
};
const seasonFromDate = ymd => {
  const m = /^(\d{4})-(\d{2})/.exec(ymd || '');
  if (!m) return '';
  const start = Number(m[2]) >= 7 ? Number(m[1]) : Number(m[1]) - 1;
  return `${start}–${String(start + 1).slice(2)}`;
};
const panelHead = (title, right = '') => `<div class="panel-head"><h3>${esc(title)}</h3>${right}</div>`;
const errorBox = (error, gameId) => {
  if (/upstream_404/.test(String(error?.payload?.details || ''))) {
    return `<div class="pbe-empty"><h3>No NHL game ${esc(gameId)}.</h3><p>The NHL source has no game with this id. Pick a game from the slate above.</p></div>`;
  }
  const e = describeError(error);
  return `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`;
};
const mmss = seconds => {
  const s = n(seconds);
  if (s === null) return '—';
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
};
const signed = v => {
  const x = n(v);
  if (x === null) return '—';
  if (x === 0) return '0';
  return `<span class="rs-diff ${x > 0 ? 'is-pos' : 'is-neg'}">${x > 0 ? '+' : '−'}${Math.abs(x)}</span>`;
};
// "26-9-6" -> points share of the split (W*2 + OTL) / (GP*2)
function splitPct(rec) {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(String(rec || ''));
  if (!m) return null;
  const [w, l, o] = m.slice(1).map(Number);
  const gp = w + l + o;
  return gp ? (w * 2 + o) / (gp * 2) : null;
}

function cmpRow(label, a, b, fmt, { note = '', bar = true } = {}) {
  const s = bar && n(a) !== null && n(b) !== null && a >= 0 && b >= 0 ? share(a, b) : null;
  return `<div class="cmp-row"><span class="label"><span>${esc(label)}${note ? ` <span class="faint">${esc(note)}</span>` : ''}</span></span>
    <span class="cmp-val">${fmt(a)}</span>
    <span class="cmp-bar">${s !== null ? `<i class="a" style="width:${(s * 100).toFixed(1)}%"></i><i class="h" style="width:${((1 - s) * 100).toFixed(1)}%"></i>` : ''}</span>
    <span class="cmp-val">${fmt(b)}</span></div>`;
}

function slateCards(games) {
  return `<div class="rs-slate">${games.map(g => {
    const st = stateOf(g);
    const scored = ['LIVE', 'INTERMISSION', 'FINAL'].includes(st.key);
    return `<a class="rs-slate__card" href="#/matchup/${esc(g.id)}" style="--away:${teamAccent(g.teams.away.abbrev)};--home:${teamAccent(g.teams.home.abbrev)}">
      <span class="rs-slate__teams">${teamMark(g.teams.away, 30)}<b>${esc(g.teams.away.abbrev)}</b>${scored ? `<span class="mono">${esc(g.teams.away.score ?? '')}</span>` : ''}<span class="faint">@</span>${teamMark(g.teams.home, 30)}<b>${esc(g.teams.home.abbrev)}</b>${scored ? `<span class="mono">${esc(g.teams.home.score ?? '')}</span>` : ''}</span>
      <span class="rs-slate__meta">${stateBadge(g)}<span class="micro">${esc(dayET(g.start_time_utc))}${g.game_type === 1 ? ' · preseason' : ''}</span></span>
      <span class="micro rs-slate__venue">${esc(g.venue || '')}</span>
    </a>`;
  }).join('')}</div>`;
}

function headerMarkup(game, meta, failed) {
  const a = game.teams.away; const h = game.teams.home;
  const st = stateOf(game);
  const scored = ['LIVE', 'INTERMISSION', 'FINAL'].includes(st.key);
  const side = (t, cls) => `<div class="rs-mh__team rs-mh__team--${cls}">
    ${teamMark(t, 60)}
    <div class="rs-mh__id"><b>${esc(t.abbrev)}</b><span>${esc(`${t.place || ''} ${t.name || ''}`.trim())}</span></div>
    ${scored ? `<span class="rs-mh__score mono">${esc(t.score ?? '—')}</span>` : ''}
  </div>`;
  return `<header class="rs-mh" style="--away:${teamAccent(a.abbrev)};--home:${teamAccent(h.abbrev)}">
    ${side(a, 'away')}
    <div class="rs-mh__mid">
      ${stateBadge(game)}
      <span class="rs-mh__when">${esc(dayET(game.start_time_utc, true))}${st.key === 'SCHEDULED' ? '' : ` · ${esc(timeET(game.start_time_utc))}`}</span>
      <span class="micro">${esc(gameTypeLabel(game.game_type))}${game.venue ? ` · ${esc(game.venue)}` : ''}</span>
      ${freshStamp(meta, { failed })}
    </div>
    ${side(h, 'home')}
  </header>
  <nav class="rs-mh__links" aria-label="Game shortcuts">
    <a class="pbe-btn pbe-btn--primary pbe-btn--sm" href="#/cast/${esc(game.id)}">PBE Cast</a>
    <a class="pbe-btn pbe-btn--sm" href="#/goalies/${esc(game.id)}">Goalie Center</a>
    ${TEAM_BY_ABBREV.has(a.abbrev) ? `<a class="pbe-btn pbe-btn--sm" href="#/team/${esc(a.abbrev)}">${esc(a.abbrev)} team page</a>` : ''}
    ${TEAM_BY_ABBREV.has(h.abbrev) ? `<a class="pbe-btn pbe-btn--sm" href="#/team/${esc(h.abbrev)}">${esc(h.abbrev)} team page</a>` : ''}
  </nav>`;
}

function comparePanel(game, s) {
  const a = game.teams.away.abbrev; const h = game.teams.home.abbrev;
  if (s.error) return panelHead('Team comparison') + errorBox(s.error, game.id);
  if (!s.data) return panelHead('Team comparison') + '<div class="pbe-skeleton" style="height:300px"></div>';
  const rows = s.data.standings || [];
  const ra = rows.find(r => r.team === a); const rh = rows.find(r => r.team === h);
  const season = seasonFromDate(s.data.standings_date);
  const prior = s.data.semantics === 'PRIOR_SEASON_FINAL';
  const label = `${season} ${prior ? 'final standings (prior season)' : 'standings to date'}`;
  if (!ra || !rh) return `${panelHead('Team comparison')}<p class="dim">${esc(!ra ? a : h)} is missing from the standings table returned by the source.</p>`;
  const perGp = (r, k) => (n(r.games_played) ? r[k] / r.games_played : null);
  const f2 = v => (n(v) === null ? '—' : Number(v).toFixed(2));
  const hindsight = game.status?.semantics === 'FINAL' && seasonLabel(game.season) === season;
  return `${panelHead('Team comparison', freshStamp(s.meta, { label: `${season} · as of ${s.data.standings_date}` }))}
    <div class="rs-cmp-head"><span class="rs-cmp-key"><i class="sw sw--a"></i>${esc(a)} · away</span><span class="pbe-badge pbe-badge--${prior ? 'final' : 'sched'}">${esc(label)}</span><span class="rs-cmp-key">${esc(h)} · home<i class="sw sw--h"></i></span></div>
    <div class="cmp rs-cmp">
      ${cmpRow('Points %', ra.point_pct, rh.point_pct, svPct)}
      ${cmpRow('Goals for / GP', perGp(ra, 'goals_for'), perGp(rh, 'goals_for'), f2)}
      ${cmpRow('Goals against / GP', perGp(ra, 'goals_against'), perGp(rh, 'goals_against'), f2, { note: 'lower is better' })}
      ${cmpRow('Goal differential', ra.goal_diff, rh.goal_diff, signed, { bar: false })}
      ${cmpRow('Regulation wins', ra.regulation_wins, rh.regulation_wins, v => num(v))}
      ${cmpRow(`Venue split · ${a} road / ${h} home`, splitPct(ra.road), splitPct(rh.home), svPct, { note: 'points %' })}
    </div>
    <div class="table-wrap rs-cmp-table"><table class="pbe-table">
      <thead><tr><th>${esc(season)}</th><th class="num">Record</th><th class="num">PTS</th><th class="num">Home</th><th class="num">Road</th><th class="num">L10</th><th class="num">Strk</th></tr></thead>
      <tbody>${[ra, rh].map(r => `<tr><td><a class="rs-tm" href="#/team/${esc(r.team)}" aria-label="${esc(r.team)} team page">${teamMark({ abbrev: r.team, logo: r.logo }, 20)}<b>${esc(r.team)}</b></a></td><td class="num">${esc(r.wins)}-${esc(r.losses)}-${esc(r.ot_losses)}</td><td class="num">${esc(r.points)}</td><td class="num">${esc(r.home || '—')}</td><td class="num">${esc(r.road || '—')}</td><td class="num">${esc(r.l10 || '—')}</td><td class="num">${esc(r.streak || '—')}</td></tr>`).join('')}</tbody>
    </table></div>
    ${hindsight ? `<p class="micro rs-after">Season-final numbers include games played after this ${esc(dateLabel(game.date))} game.</p>` : ''}
    <p class="micro rs-after">Context, not a prediction. No win probability or head-to-head pick is published.</p>`;
}

function goaliePanel(g) {
  const teams = g.teams || {};
  const col = side => {
    const t = teams[side];
    if (!t) return '';
    const s = t.starter || {};
    const src = safeUrl(s.source_url);
    const season = seasonLabel(t.stats_season);
    const goalies = (t.goalies || []).slice().sort((x, y) => (n(y.games_started) ?? 0) - (n(x.games_started) ?? 0));
    const l5 = gl => {
      const r = gl.recent || [];
      const sa = r.reduce((acc, x) => acc + (n(x.shots_against) || 0), 0);
      const ga = r.reduce((acc, x) => acc + (n(x.goals_against) || 0), 0);
      return sa ? { v: (sa - ga) / sa, gp: r.length } : null;
    };
    return `<div class="rs-gcol">
      <div class="rs-gcol__head">${teamMark({ abbrev: t.team }, 26)}<b>${esc(t.team)}</b>
        <span class="pbe-badge pbe-badge--${s.status === 'CONFIRMED' ? 'confirmed' : 'unknown'}">${esc(s.status || 'UNKNOWN')}</span></div>
      <p class="rs-gcol__starter">${playerIdentity({ id: s.status === 'CONFIRMED' ? s.goalie_id : null, name: s.status === 'CONFIRMED' ? s.name : null, team: t.team, size: 'md' })} ${s.status === 'CONFIRMED' && s.name ? `<b>${s.goalie_id ? `<a href="#/player/${esc(s.goalie_id)}">${esc(s.name)}</a>` : esc(s.name)}</b> started` : '<b>Starter unknown</b>'}</p>
      <p class="micro rs-gcol__basis">${esc(s.basis || 'No basis stated by the source.')}${src ? ` · <a class="gold" href="${esc(src)}" target="_blank" rel="noopener nofollow">source</a>` : ''}</p>
      ${goalies.length ? `<div class="table-wrap"><table class="pbe-table rs-gtab">
        <thead><tr><th>${esc(season)}</th><th class="num">GS</th><th class="num" title="Wins-Losses-OT losses">W-L-OT</th><th class="num">SV%</th><th class="num">GAA</th><th class="num" title="Save % over the last five appearances in the source window">L5 SV%</th></tr></thead>
        <tbody>${goalies.map(gl => {
          const f = l5(gl);
          return `<tr><td><a href="#/player/${esc(gl.id)}">${esc(gl.name)}</a></td><td class="num">${num(gl.games_started)}</td><td class="num">${num(gl.wins)}-${num(gl.losses)}-${num(gl.ot_losses)}</td><td class="num">${svPct(gl.save_pct)}</td><td class="num">${num(gl.gaa, 2)}</td><td class="num">${f ? `${svPct(f.v)}` : '—'}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="dim small">No goalie rows for this club in the stats window.</p>'}
    </div>`;
  };
  const seasons = [...new Set(['away', 'home'].map(k => seasonLabel(teams[k]?.stats_season)).filter(Boolean))];
  return `${panelHead('Goalies', `<span class="micro">${esc(seasons.join(' / '))} regular season stats</span>`)}
    <div class="rs-gcols">${col('away')}${col('home')}</div>
    <p class="micro rs-after">PropBetEdge does not project starters. Pregame status stays UNKNOWN until the NHL box score records the starter at puck drop. ${esc(g.gsax_status && /unavailable|not/i.test(g.gsax_status) ? 'GSAx: not available until a validated xG model is released.' : '')}</p>`;
}

function restPanel(g) {
  const a = g.teams?.away; const h = g.teams?.home;
  const line = t => {
    const r = t?.rest || {};
    const d = n(r.days_rest);
    return `<div class="rs-rest__row">${teamMark({ abbrev: t.team }, 22)}<b>${esc(t.team)}</b>
      ${d !== null ? `<span class="mono">${d} day${d === 1 ? '' : 's'} rest</span>` : '<span class="pbe-badge pbe-badge--unknown">Rest unknown</span>'}
      ${r.back_to_back === true ? '<span class="pbe-badge pbe-badge--alert">Back-to-back</span>' : ''}
      <span class="micro">${r.previous_game_date ? `prev game ${esc(dateLabel(r.previous_game_date))}` : 'no previous game in the source schedule window'}</span></div>`;
  };
  const da = n(a?.rest?.days_rest); const dh = n(h?.rest?.days_rest);
  let edge = 'Rest comparison needs both clubs’ previous game dates; at least one is not in the source schedule window.';
  if (da !== null && dh !== null) {
    edge = da === dh
      ? `Both clubs on ${da} day${da === 1 ? '' : 's'} rest.`
      : `${h.team} on ${dh} day${dh === 1 ? '' : 's'} rest vs ${a.team} ${da} day${da === 1 ? '' : 's'}.`;
  }
  return `${panelHead('Rest & schedule spot')}
    <div class="rs-rest">${line(a)}${line(h)}</div>
    <p class="rs-rest__edge ${da !== null && dh !== null ? '' : 'dim'}">${esc(edge)}</p>`;
}

function formPanel(game, sched) {
  const abbrs = [game.teams.away.abbrev, game.teams.home.abbrev];
  const loaded = abbrs.every(t => sched[t]?.data || sched[t]?.error);
  if (!loaded) return panelHead('Last 10 form') + '<div class="pbe-skeleton" style="height:90px"></div>';
  const start = Date.parse(game.start_time_utc);
  const blocks = abbrs.map(t => {
    const s = sched[t];
    if (s.error) return `<div class="rs-form__row"><b>${esc(t)}</b> <span class="dim small">schedule unavailable</span></div>`;
    const season = seasonLabel(s.data.season) || seasonLabel((s.data.games || []).find(x => x.season)?.season);
    const finals = (s.data.games || []).filter(x => x.game_type === 2 && x.status?.semantics === 'FINAL' && Date.parse(x.start_time_utc) < start)
      .sort((x, y) => Date.parse(x.start_time_utc) - Date.parse(y.start_time_utc)).slice(-10);
    if (!finals.length) {
      const other = seasonLabel(game.season) && season && seasonLabel(game.season) !== season;
      return `<div class="rs-form__row">${teamMark({ abbrev: t }, 22)}<b>${esc(t)}</b><span class="dim small">${other ? `The club schedule route serves ${esc(season)}; this game is from ${esc(seasonLabel(game.season))}.` : `No ${esc(season || '2026–27')} games yet.`}</span></div>`;
    }
    let w = 0; let l = 0; let o = 0; let gf = 0; let ga = 0;
    const seq = finals.map(x => {
      const home = x.teams.home.abbrev === t;
      const us = home ? x.teams.home : x.teams.away; const them = home ? x.teams.away : x.teams.home;
      gf += n(us.score) || 0; ga += n(them.score) || 0;
      const ot = ['OT', 'SO'].includes(x.status?.last_period_type);
      if (us.score > them.score) { w += 1; return 'W'; }
      if (ot) { o += 1; return 'O'; }
      l += 1; return 'L';
    });
    return `<div class="rs-form__row">${teamMark({ abbrev: t }, 22)}<b>${esc(t)}</b>
      <span class="mono">${w}-${l}-${o}</span><span class="mono dim">GF ${gf} · GA ${ga}</span>
      <span class="rs-form__seq" aria-label="Results oldest to newest">${seq.map(r => `<i class="rs-form__r rs-form__r--${r}" title="${r === 'W' ? 'Win' : r === 'O' ? 'OT/SO loss' : 'Regulation loss'}">${r}</i>`).join('')}</span></div>`;
  });
  return `${panelHead('Last 10 form', '<span class="micro">Regular-season games before this one</span>')}<div class="rs-form">${blocks.join('')}</div>`;
}

function scorersPanel(game, stats, sort) {
  const abbrs = [game.teams.away.abbrev, game.teams.home.abbrev];
  const key = sort === 'shots' ? r => (n(r.gamesPlayed) >= 10 ? r.shots / r.gamesPlayed : -1) : r => n(r.points) ?? -1;
  const table = t => {
    const s = stats[t];
    if (!s) return '<div class="pbe-skeleton" style="height:220px"></div>';
    if (s.error) return errorBox(s.error, game.id);
    const rows = (s.data.skaters || []).slice().sort((x, y) => key(y) - key(x)).slice(0, 6);
    const season = seasonLabel(s.data.season);
    return `<div class="rs-sc">
      <div class="rs-sc__head">${teamMark({ abbrev: t }, 22)}<b>${esc(t)}</b><span class="micro">${esc(season)} ${esc((gameTypeLabel(s.data.game_type) || 'regular season').toLowerCase())}</span></div>
      <div class="table-wrap"><table class="pbe-table rs-sc__t">
        <thead><tr><th>Skater</th><th class="num">GP</th><th class="num">G</th><th class="num">P</th><th class="num" title="Shots on goal per game played">SOG/GP</th><th class="num">TOI/GP</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td><a class="rs-pl" href="#/player/${esc(r.playerId)}">${playerIdentity({ id: r.playerId, name: `${r.firstName?.default || ''} ${r.lastName?.default || ''}`, team: t, size: 'xs' })}${esc((r.firstName?.default || '').slice(0, 1))}. <b>${esc(r.lastName?.default || '')}</b></a></td><td class="num">${num(r.gamesPlayed)}</td><td class="num">${num(r.goals)}</td><td class="num">${num(r.points)}</td><td class="num">${n(r.gamesPlayed) ? (r.shots / r.gamesPlayed).toFixed(2) : '—'}</td><td class="num">${mmss(r.avgTimeOnIcePerGame)}</td></tr>`).join('')}</tbody>
      </table></div></div>`;
  };
  return `${panelHead('Top skaters', `<div class="chips" role="group" aria-label="Rank skaters by">${[['points', 'Points'], ['shots', 'SOG/GP']].map(([k, l]) => `<button class="chip" data-sc="${k}" aria-pressed="${sort === k}">${l}</button>`).join('')}</div>`)}
    <div class="rs-scs">${table(abbrs[0])}${table(abbrs[1])}</div>
    ${sort === 'shots' ? '<p class="micro rs-after">SOG/GP ranking requires 10+ games played.</p>' : ''}
    <p class="micro rs-after">Club-stat totals for games played with each club; players who have since moved still appear.</p>`;
}

export function mount(root, params, ctx) {
  const gameId = params.gameId || null;
  const st = { g: {}, standings: {}, stats: {}, sched: {}, sort: 'points', slate: null, slateLabel: '', slateError: null, started: false };
  root.innerHTML = `<section class="wrap section rs-matchup" data-fresh-scope>
    <div class="section-head"><div><span class="eyebrow">Matchup</span><h2>${gameId ? 'Game context' : 'Pick a matchup'}</h2></div>
      <p>Records, goal rates, goalies, rest and form side by side — every number labelled with its season. Context, never a pick.</p></div>
    <div id="rs-m-picker"></div>
    <div id="rs-m-body"></div>
  </section>`;
  const picker = $('#rs-m-picker', root);
  const body = $('#rs-m-body', root);
  const controller = new AbortController();
  const signal = controller.signal;

  const renderPicker = () => {
    if (!st.slate) { picker.innerHTML = gameId ? '' : '<div class="pbe-skeleton" style="height:96px"></div>'; return; }
    if (!st.slate.length) { picker.innerHTML = ''; return; }
    if (!gameId) { picker.innerHTML = `<p class="micro rs-slate-label">${esc(st.slateLabel)}</p>${slateCards(st.slate)}`; return; }
    picker.innerHTML = `<div class="rs-strip" role="list" aria-label="${esc(st.slateLabel)}"><span class="micro rs-strip__label">${esc(st.slateLabel)}</span>${st.slate.map(g => `<a role="listitem" class="rs-strip__pick${String(g.id) === String(gameId) ? ' is-active' : ''}" href="#/matchup/${esc(g.id)}"><b class="mono">${esc(g.teams.away.abbrev)}</b><span class="faint">@</span><b class="mono">${esc(g.teams.home.abbrev)}</b></a>`).join('')}</div>`;
  };

  const renderBody = () => {
    if (!gameId) {
      if (st.slateError) body.innerHTML = errorBox(st.slateError, '');
      else if (st.slate && !st.slate.length) body.innerHTML = '<div class="pbe-empty"><h3>No games on the slate.</h3><p>The source schedule lists no game today or on the next slate. Open any game from a team page to see its matchup.</p></div>';
      else body.innerHTML = '';
      return;
    }
    const g = st.g.data;
    if (!g) {
      body.innerHTML = st.g.error ? errorBox(st.g.error, gameId) : '<div class="pbe-skeleton" style="height:150px;margin-bottom:16px"></div><div class="rs-m-grid"><div class="pbe-skeleton" style="height:360px"></div><div class="pbe-skeleton" style="height:360px"></div></div>';
      return;
    }
    const game = g.game;
    body.innerHTML = `${headerMarkup(game, st.g.meta, st.g.failed)}
      <div class="rs-m-grid">
        <section class="pbe-panel">${comparePanel(game, st.standings)}</section>
        <div class="rs-col">
          <section class="pbe-panel">${restPanel(g)}</section>
          <section class="pbe-panel">${formPanel(game, st.sched)}</section>
        </div>
      </div>
      <section class="pbe-panel rs-m-goalies">${goaliePanel(g)}</section>
      <section class="pbe-panel rs-m-sc">${scorersPanel(game, st.stats, st.sort)}</section>`;
  };

  const loadTeams = game => {
    if (st.started) return;
    st.started = true;
    for (const t of [game.teams.away.abbrev, game.teams.home.abbrev]) {
      if (!TEAM_BY_ABBREV.has(t)) {
        const err = { error: new Error(`Unknown club ${t}`) };
        st.stats[t] = err; st.sched[t] = err;
        continue;
      }
      nhl(`/nhl/team/${t}/stats`, {}, { signal })
        .then(res => { st.stats[t] = { data: res.data, meta: res.meta }; })
        .catch(error => { if (error.kind !== 'aborted') st.stats[t] = { error }; })
        .finally(() => { if (!signal.aborted) renderBody(); });
      nhl(`/nhl/team/${t}/schedule`, {}, { signal })
        .then(res => { st.sched[t] = { data: res.data, meta: res.meta }; })
        .catch(error => { if (error.kind !== 'aborted') st.sched[t] = { error }; })
        .finally(() => { if (!signal.aborted) renderBody(); });
    }
  };

  // Goalie status is the only volatile input (starter flag lands at puck drop).
  const poller = gameId ? createPoller(async pollSignal => {
    const res = await nhl(`/nhl/game/${gameId}/goalies`, {}, { signal: pollSignal, timeout: 15000 });
    st.g = { data: res.data, meta: res.meta, failed: false };
    loadTeams(res.data.game);
    renderBody();
    const key = stateOf(res.data.game).key;
    if (['FINAL', 'POSTPONED', 'CANCELLED'].includes(key)) return null;
    if (key === 'LIVE' || key === 'INTERMISSION') return 60000;
    const until = Date.parse(res.data.game.start_time_utc) - Date.now();
    if (until < 45 * 60 * 1000) return 60000;
    if (until < 4 * 3600 * 1000) return 300000;
    return null;
  }, {
    onError(error) {
      if (st.g.data) st.g.failed = true;
      else st.g = { error };
      renderBody();
      return error.kind === 'not_deployed' || error.kind === 'legacy' || /upstream_404/.test(String(error?.payload?.details || '')) ? null : 15000;
    }
  }) : null;

  if (gameId) {
    nhl('/nhl/standings', {}, { signal })
      .then(res => { st.standings = { data: res.data, meta: res.meta }; })
      .catch(error => { if (error.kind !== 'aborted') st.standings = { error }; })
      .finally(() => { if (!signal.aborted) renderBody(); });
  }

  (async () => {
    try {
      const today = todayET();
      let res = await ctx.board(today);
      let games = res.data.games || [];
      let label = 'Today';
      if (!games.length && res.data.next_puck_drop?.date) {
        res = await ctx.board(res.data.next_puck_drop.date);
        games = res.data.games || [];
        label = `Next slate · ${dateLabel(res.data.date)}`;
      }
      st.slate = games; st.slateLabel = label;
    } catch (error) {
      if (error?.kind === 'aborted' || signal.aborted) return;
      st.slate = []; st.slateError = gameId ? null : error;
    }
    if (signal.aborted) return;
    renderPicker();
    renderBody();
  })();

  renderPicker();
  renderBody();
  poller?.start();

  const disposers = [
    on(root, 'click', '[data-sc]', (_, b) => { st.sort = b.dataset.sc; renderBody(); })
  ];
  return () => {
    poller?.stop();
    controller.abort();
    disposers.forEach(d => d());
  };
}
