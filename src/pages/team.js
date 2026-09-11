import { $, esc, on, safeUrl } from '../lib/dom.js';
import { describeError, news, nhl } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { ageText, dayET, gameTypeLabel, n, num, svPct, timeET, todayET } from '../lib/format.js';
import { TEAMS, TEAM_BY_ABBREV, teamAccent } from '../lib/teams.js';
import { stateBadge, teamMark } from '../components/game.js';
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
const errorBox = error => {
  const e = describeError(error);
  return `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`;
};
const mmss = seconds => {
  const s = n(seconds);
  if (s === null) return '—';
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
};
const heightText = inches => {
  const h = n(inches);
  return h === null ? '—' : `${Math.floor(h / 12)}'${h % 12}"`;
};
function ageOn(birth, today = todayET()) {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth || '');
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!b || !t) return null;
  let age = Number(t[1]) - Number(b[1]);
  if (Number(t[2]) < Number(b[2]) || (t[2] === b[2] && Number(t[3]) < Number(b[3]))) age -= 1;
  return age;
}
const signed = v => {
  const x = n(v);
  if (x === null) return '—';
  if (x === 0) return '0';
  return `<span class="rs-diff ${x > 0 ? 'is-pos' : 'is-neg'}">${x > 0 ? '+' : '−'}${Math.abs(x)}</span>`;
};
const CLINCH = { p: "Presidents' Trophy", z: 'Clinched conference', y: 'Clinched division', x: 'Clinched playoff berth', e: 'Eliminated' };
const panelHead = (title, right = '') => `<div class="panel-head"><h3>${esc(title)}</h3>${right}</div>`;
const loading = h => `<div class="pbe-skeleton" style="height:${h}px"></div>`;
const ordinal = v => {
  const x = n(v);
  if (x === null) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const m = x % 100;
  return `${x}${s[(m - 20) % 10] || s[m] || s[0]}`;
};
const newsTime = iso => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? ageText((Date.now() - t) / 1000) : '';
};
function newsItem(item) {
  const url = safeUrl(item.url);
  const yahoo = /yahoo/i.test(item.source || '') || /yahoo/i.test(item.via || '');
  const src = yahoo ? `${item.publisher || 'Yahoo Sports'} · via Yahoo Sports` : (item.source || item.publisher || 'Source');
  return `<li class="rs-news__item">
    ${item.category ? `<span class="pbe-badge pbe-badge--${item.material ? 'alert' : 'sched'}">${esc(item.category)}</span>` : ''}
    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener nofollow">${esc(item.title)}<span class="sr-only"> (opens source site)</span></a>` : `<span>${esc(item.title)}</span>`}
    <span class="micro">${esc(src)}${item.published_at ? ` · ${esc(newsTime(item.published_at))}` : ''}</span>
  </li>`;
}

// ---- sections
function header(team) {
  return `<header class="rs-thead" style="--accent:${teamAccent(team.abbrev)}">
    ${teamMark({ abbrev: team.abbrev }, 76)}
    <div class="rs-thead__id">
      <span class="eyebrow">${esc(team.conference)} Conference · ${esc(team.division)} Division</span>
      <h1 class="pbe-display">${esc(team.full)}</h1>
      <p class="rs-thead__line" id="rs-team-line"><span class="faint">Loading standings line…</span></p>
    </div>
    <nav class="rs-thead__links" aria-label="Team shortcuts">
      <a class="pbe-btn pbe-btn--sm" href="#/standings">Standings</a>
      <a class="pbe-btn pbe-btn--sm" href="#/players">Leaders</a>
    </nav>
  </header>`;
}

function scheduleSection(s, abbr) {
  if (s.error) return panelHead('Schedule') + errorBox(s.error);
  if (!s.data) return panelHead('Schedule') + loading(260);
  const games = (s.data.games || []).slice().sort((a, b) => Date.parse(a.start_time_utc) - Date.parse(b.start_time_utc));
  const season = seasonLabel(s.data.season) || seasonLabel(games.find(g => g.season)?.season);
  const now = Date.now();
  const upcoming = games.filter(g => ['SCHEDULED', 'PREGAME', 'LIVE'].includes(g.status?.semantics) && Date.parse(g.start_time_utc) > now - 6 * 3600 * 1000).slice(0, 8);
  const finals = games.filter(g => g.status?.semantics === 'FINAL').slice(-5).reverse();
  const opp = g => {
    const home = g.teams?.home?.abbrev === abbr;
    const o = home ? g.teams.away : g.teams.home;
    return { home, o };
  };
  const oppCell = g => {
    const { home, o } = opp(g);
    return `<span class="rs-opp"><span class="rs-ha">${home ? 'vs' : '@'}</span>${teamMark(o, 22)}<a href="#/team/${esc(o.abbrev)}"><b>${esc(o.abbrev)}</b></a><span class="rs-opp__name">${esc(o.name || '')}</span></span>`;
  };
  const when = g => `<span class="rs-game__date">${esc(dayET(g.start_time_utc))}</span>`;
  const typeTag = g => (g.game_type !== 2 ? `<span class="micro rs-game__type">${esc(gameTypeLabel(g.game_type))}</span>` : '');
  const upRows = upcoming.map(g => `<li class="rs-game">
      <div class="rs-game__when">${when(g)}<span class="rs-game__time mono">${g.status?.semantics === 'LIVE' ? stateBadge(g) : esc(timeET(g.start_time_utc))}</span></div>
      <div class="rs-game__opp">${oppCell(g)}${typeTag(g)}</div>
      <div class="rs-game__acts"><a href="#/cast/${esc(g.id)}">Cast</a><a href="#/matchup/${esc(g.id)}">Matchup</a></div>
    </li>`).join('');
  const result = g => {
    const { home } = opp(g);
    const us = home ? g.teams.home : g.teams.away;
    const them = home ? g.teams.away : g.teams.home;
    if (n(us.score) === null || n(them.score) === null) return '<span class="faint">score n/a</span>';
    const won = us.score > them.score;
    const ot = g.status?.last_period_type === 'OT' || g.status?.last_period_type === 'SO';
    const tag = won ? 'W' : ot ? 'OTL' : 'L';
    return `<span class="rs-res rs-res--${won ? 'w' : 'l'}">${tag}</span> <span class="mono">${esc(us.score)}–${esc(them.score)}${ot ? ` ${esc(g.status.last_period_type)}` : ''}</span>`;
  };
  const finRows = finals.map(g => `<li class="rs-game">
      <div class="rs-game__when">${when(g)}<span class="rs-game__time">${result(g)}</span></div>
      <div class="rs-game__opp">${oppCell(g)}${typeTag(g)}</div>
      <div class="rs-game__acts"><a href="#/cast/${esc(g.id)}">Replay</a><a href="#/matchup/${esc(g.id)}">Matchup</a></div>
    </li>`).join('');
  const regCount = games.filter(g => g.game_type === 2).length;
  return `${panelHead(`${season || ''} schedule`.trim(), freshStamp(s.meta, { label: `${season} · ${games.length} listed` }))}
    <p class="micro rs-sub">Next ${upcoming.length || 0} · ${regCount} regular-season games listed · times ET</p>
    ${upcoming.length ? `<ol class="rs-games" aria-label="Upcoming games">${upRows}</ol>` : '<p class="dim">No upcoming games in the source schedule window.</p>'}
    <h4 class="rs-h4">Recent results</h4>
    ${finRows ? `<ol class="rs-games" aria-label="Recent results">${finRows}</ol>`
      : `<p class="dim small">No completed games in the ${esc(season || 'current')} schedule yet — results appear here after each final.</p>`}`;
}

const SK_SORTS = [['points', 'Points'], ['goals', 'Goals'], ['shots', 'Shots'], ['toi', 'TOI/GP']];
function skatersSection(s, sort, showAll, rosterIds, abbr) {
  if (s.error) return panelHead('Skaters') + errorBox(s.error);
  if (!s.data) return panelHead('Skaters') + loading(320);
  const season = seasonLabel(s.data.season);
  const type = gameTypeLabel(s.data.game_type) || 'Regular season';
  const key = { points: 'points', goals: 'goals', shots: 'shots', toi: 'avgTimeOnIcePerGame' }[sort];
  const rows = (s.data.skaters || []).slice().sort((a, b) => (n(b[key]) ?? -1) - (n(a[key]) ?? -1) || (n(b.points) ?? 0) - (n(a.points) ?? 0));
  const shown = showAll ? rows : rows.slice(0, 12);
  const gone = id => rosterIds && !rosterIds.has(Number(id));
  const anyGone = rosterIds && shown.some(r => gone(r.playerId));
  const th = (k, l, title) => `<th class="num${k === sort ? ' is-sorted' : ''}" title="${esc(title)}">${l}</th>`;
  return `${panelHead(`${season} skater leaders`, freshStamp(s.meta, { label: `${season} ${type.toLowerCase()}` }))}
    <div class="rs-bar">
      <div class="chips" role="group" aria-label="Sort skaters">${SK_SORTS.map(([k, l]) => `<button class="chip" data-sk-sort="${k}" aria-pressed="${sort === k}">${l}</button>`).join('')}</div>
      <span class="micro">Totals for games played with ${esc(abbr)}</span>
    </div>
    ${rows.length ? `<div class="table-wrap"><table class="pbe-table rs-sk">
      <thead><tr><th>Player</th><th>Pos</th>${th('gp', 'GP', 'Games played')}${th('goals', 'G', 'Goals')}<th class="num" title="Assists">A</th>${th('points', 'P', 'Points')}${th('shots', 'SOG', 'Shots on goal')}<th class="num" title="Shots on goal per game played">SOG/GP</th><th class="num" title="Power-play goals">PPG</th>${th('toi', 'TOI/GP', 'Average time on ice per game')}</tr></thead>
      <tbody>${shown.map(r => {
        const gp = n(r.gamesPlayed);
        return `<tr>
          <td><a class="rs-pl" href="#/player/${esc(r.playerId)}">${playerIdentity({ id: r.playerId, name: `${r.firstName?.default || ''} ${r.lastName?.default || ''}`, team: abbr, size: 'xs' })}${esc(r.firstName?.default || '')} <b>${esc(r.lastName?.default || '')}</b></a>${gone(r.playerId) ? '<span class="rs-dagger" title="Not on the current roster listing">†</span>' : ''}</td>
          <td>${esc(r.positionCode || '')}</td>
          <td class="num">${num(r.gamesPlayed)}</td><td class="num">${num(r.goals)}</td><td class="num">${num(r.assists)}</td>
          <td class="num"><b>${num(r.points)}</b></td><td class="num">${num(r.shots)}</td>
          <td class="num">${gp ? (n(r.shots) / gp).toFixed(2) : '—'}</td><td class="num">${num(r.powerPlayGoals)}</td>
          <td class="num">${mmss(r.avgTimeOnIcePerGame)}</td>
        </tr>`;
      }).join('')}</tbody></table></div>
      <div class="rs-foot">
        ${anyGone ? '<span class="micro">† not on the current roster listing — totals are games played for this club.</span>' : '<span></span>'}
        ${rows.length > 12 ? `<button class="pbe-btn pbe-btn--sm" data-sk-all>${showAll ? 'Show top 12' : `Show all ${rows.length}`}</button>` : ''}
      </div>`
      : `<p class="dim">No ${esc(season)} skater rows returned by the club-stats source.</p>`}`;
}

function goaliesSection(s) {
  if (s.error) return panelHead('Goalies') + errorBox(s.error);
  if (!s.data) return panelHead('Goalies') + loading(160);
  const season = seasonLabel(s.data.season);
  const rows = (s.data.goalies || []).slice().sort((a, b) => (n(b.games_played) ?? 0) - (n(a.games_played) ?? 0));
  return `${panelHead(`${season} goalies`, `<span class="micro">${esc(season)} ${esc((gameTypeLabel(s.data.game_type) || 'Regular season').toLowerCase())}</span>`)}
    ${rows.length ? `<div class="table-wrap"><table class="pbe-table">
      <thead><tr><th>Goalie</th><th class="num">GP</th><th class="num">GS</th><th class="num" title="Wins-Losses-OT losses">W-L-OT</th><th class="num">SV%</th><th class="num">GAA</th><th class="num" title="Shots against">SA</th><th class="num" title="Shutouts">SO</th></tr></thead>
      <tbody>${rows.map(g => `<tr>
        <td><a class="rs-pl" href="#/player/${esc(g.id)}">${playerIdentity({ id: g.id, name: g.name, team: s?.data?.team, size: 'sm' })}<b>${esc(g.name)}</b></a></td>
        <td class="num">${num(g.games_played)}</td><td class="num">${num(g.games_started)}</td>
        <td class="num">${num(g.wins)}-${num(g.losses)}-${num(g.ot_losses)}</td>
        <td class="num">${svPct(g.save_pct)}</td><td class="num">${num(g.gaa, 2)}</td>
        <td class="num">${num(g.shots_against)}</td><td class="num">${num(g.shutouts)}</td>
      </tr>`).join('')}</tbody></table></div>
      <p class="micro rs-gsax">GSAx: not available — requires a validated xG model, none is released.</p>`
      : '<p class="dim">No goalie rows returned by the club-stats source.</p>'}`;
}

const GROUPS = [['forward', 'Forwards'], ['defense', 'Defense'], ['goalie', 'Goalies']];
function rosterSection(s, group = 'all') {
  if (s.error) return panelHead('Roster') + errorBox(s.error);
  if (!s.data) return panelHead('Roster') + loading(420);
  const season = seasonLabel(s.data.season);
  const players = s.data.players || [];
  const today = todayET();
  const body = GROUPS.filter(([g]) => group === 'all' || g === group).map(([g, label]) => {
    const list = players.filter(p => p.position_group === g).sort((a, b) => (n(a.sweater_number) ?? 999) - (n(b.sweater_number) ?? 999) || String(a.last_name).localeCompare(String(b.last_name)));
    if (!list.length) return '';
    return `<tr class="rs-grp rs-grp--2"><td colspan="7"><span class="rs-grp__in">${label} <span class="rs-grp__sub">${list.length}</span></span></td></tr>
      ${list.map(p => `<tr>
        <td class="num">${p.sweater_number ? esc(p.sweater_number) : '<span class="faint">—</span>'}</td>
        <td><a class="rs-pl" href="#/player/${esc(p.id)}">${playerIdentity({ id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`, team: s?.data?.team, number: p.sweater_number, size: 'xs' })}${esc(p.first_name)} <b>${esc(p.last_name)}</b></a></td>
        <td>${esc(p.position || '')}</td>
        <td>${esc(p.shoots_catches || '—')}</td>
        <td class="num">${esc(ageOn(p.birth_date, today) ?? '—')}</td>
        <td class="num">${esc(heightText(p.height_inches))}</td>
        <td class="num">${p.weight_pounds ? esc(p.weight_pounds) : '—'}</td>
      </tr>`).join('')}`;
  }).join('');
  return `${panelHead(`${season} roster`, freshStamp(s.meta, { label: `${season} · ${players.length} listed` }))}
    <p class="micro rs-sub">As listed by the NHL club roster · camp rosters run long before cuts</p>
    <div class="chips rs-chiprow" role="group" aria-label="Roster group">${[['all', 'All', players.length], ...GROUPS.map(([g, l]) => [g, l, players.filter(p => p.position_group === g).length])].map(([k, l, c]) => `<button class="chip" data-roster="${k}" aria-pressed="${group === k}">${l}<span class="count">${c}</span></button>`).join('')}</div>
    ${players.length ? `<div class="table-wrap rs-roster-wrap"><table class="pbe-table rs-roster">
      <thead><tr><th class="num">#</th><th>Player</th><th>Pos</th><th title="Shoots / catches">S/C</th><th class="num">Age</th><th class="num">Ht</th><th class="num" title="Weight, lb">Wt</th></tr></thead>
      <tbody>${body}</tbody></table></div>` : '<p class="dim">The roster source returned no players.</p>'}`;
}

function standingsSection(s, abbr) {
  if (s.error) return panelHead('Standings') + errorBox(s.error);
  if (!s.data) return panelHead('Standings') + loading(150);
  const r = (s.data.standings || []).find(x => x.team === abbr);
  const season = seasonFromDate(s.data.standings_date);
  const prior = s.data.semantics === 'PRIOR_SEASON_FINAL';
  const label = prior ? `${season} final` : `${season} to date`;
  if (!r) return `${panelHead(`${label} standings`)}<p class="dim">${esc(abbr)} is not in the standings table returned by the source.</p>`;
  return `${panelHead(`${label} standings`, freshStamp(s.meta, { label: `as of ${s.data.standings_date}` }))}
    ${prior ? `<p class="micro rs-sub">Prior-season final table · the 2026–27 table starts Sep 29</p>` : ''}
    <dl class="kv rs-kvfix rs-kv">
      <div><dt>Record</dt><dd>${esc(r.wins)}-${esc(r.losses)}-${esc(r.ot_losses)}</dd></div>
      <div><dt>Points</dt><dd>${esc(r.points)} <small class="faint">${svPct(r.point_pct)}</small></dd></div>
      <div><dt>${esc(r.division)}</dt><dd>${ordinal(r.division_seq)}</dd></div>
      <div><dt>${esc(r.conference)}</dt><dd>${ordinal(r.conference_seq)}</dd></div>
      <div><dt>League</dt><dd>${ordinal(r.league_seq)}</dd></div>
      <div><dt>GF / GA</dt><dd>${esc(r.goals_for)} / ${esc(r.goals_against)}</dd></div>
      <div><dt>Diff</dt><dd>${signed(r.goal_diff)}</dd></div>
      <div><dt>Reg. wins</dt><dd>${esc(r.regulation_wins ?? '—')}</dd></div>
      <div><dt>Home</dt><dd>${esc(r.home || '—')}</dd></div>
      <div><dt>Road</dt><dd>${esc(r.road || '—')}</dd></div>
      <div><dt>Last 10</dt><dd>${esc(r.l10 || '—')}</dd></div>
      <div><dt>Streak</dt><dd>${esc(r.streak || '—')}</dd></div>
    </dl>`;
}

function teamLine(s, abbr) {
  if (!s.data) return s.error ? '<span class="faint">Standings unavailable</span>' : '<span class="faint">Loading standings line…</span>';
  const r = (s.data.standings || []).find(x => x.team === abbr);
  if (!r) return '<span class="faint">Not in the standings table</span>';
  const season = seasonFromDate(s.data.standings_date);
  const prior = s.data.semantics === 'PRIOR_SEASON_FINAL';
  return `<span class="rs-thead__season">${esc(season)} ${prior ? 'final' : 'to date'}</span>
    <b class="mono">${esc(r.wins)}-${esc(r.losses)}-${esc(r.ot_losses)}</b>
    <span class="mono">${esc(r.points)} PTS</span>
    <span>${ordinal(r.division_seq)} ${esc(r.division)}</span>
    <span class="mono">${signed(r.goal_diff)} diff</span>
    ${r.clinch ? `<span class="micro">${esc(CLINCH[String(r.clinch).toLowerCase()] || `clinch ${r.clinch}`)}</span>` : ''}`;
}

function newsSection(s, abbr) {
  if (s.error) {
    return panelHead(`${abbr} headlines`) + `<p class="dim small">Newsroom ${s.error.kind === 'not_deployed' || s.error.kind === 'legacy' ? 'is not connected in this build' : 'is unavailable right now'}. Nothing is shown rather than something invented.</p>`;
  }
  if (!s.data) return panelHead(`${abbr} headlines`) + loading(200);
  const items = (s.data.items || []).filter(i => Array.isArray(i.teams) && i.teams.includes(abbr)).slice(0, 12);
  return `${panelHead(`${abbr} headlines`, freshStamp(s.meta, { source: 'Newsroom' }))}
    <p class="micro rs-sub">Headlines and links only · tagged to ${esc(abbr)} by the newsroom${s.data.degraded ? ' · some sources degraded' : ''}</p>
    ${items.length ? `<ol class="rs-news">${items.map(newsItem).join('')}</ol>` : `<p class="dim small">No headline in the current newsroom window (${(s.data.items || []).length} items) is tagged to ${esc(abbr)}.</p>`}`;
}

function unknownTeam(code) {
  return `<section class="wrap section rs-teampage">
    <div class="pbe-empty"><h3>No NHL team “${esc(code)}”.</h3>
      <p>The league has 32 clubs. Pick one below, or open the <a class="gold" href="#/standings">standings</a>.</p></div>
    <div class="rs-teamgrid" style="margin-top:24px">${TEAMS.map(t => `<a class="rs-tile" href="#/team/${t.abbrev}">${teamMark({ abbrev: t.abbrev }, 28)}<b>${t.abbrev}</b><span>${esc(t.name)}</span></a>`).join('')}</div>
  </section>`;
}

export function mount(root, params) {
  const abbr = String(params.team || '').toUpperCase();
  const team = TEAM_BY_ABBREV.get(abbr);
  if (!team) {
    root.innerHTML = unknownTeam(abbr);
    return () => {};
  }
  const st = { schedule: {}, roster: {}, stats: {}, news: {}, standings: {} };
  const ui = { sort: 'points', showAll: false, group: 'all' };
  root.innerHTML = `<section class="wrap section rs-teampage">
    ${header(team)}
    <div class="rs-team-grid">
      <div class="rs-col">
        <section class="pbe-panel" id="rs-t-sched"></section>
        <section class="pbe-panel" id="rs-t-sk"></section>
        <section class="pbe-panel" id="rs-t-g"></section>
      </div>
      <div class="rs-col">
        <section class="pbe-panel" id="rs-t-st"></section>
        <section class="pbe-panel" id="rs-t-roster"></section>
        <section class="pbe-panel" id="rs-t-news"></section>
      </div>
    </div>
  </section>`;
  const el = id => $(`#${id}`, root);
  const rosterIds = () => (st.roster.data ? new Set((st.roster.data.players || []).map(p => Number(p.id))) : null);
  const draw = {
    schedule: () => { el('rs-t-sched').innerHTML = scheduleSection(st.schedule, abbr); },
    stats: () => {
      el('rs-t-sk').innerHTML = skatersSection(st.stats, ui.sort, ui.showAll, rosterIds(), abbr);
      el('rs-t-g').innerHTML = goaliesSection(st.stats);
    },
    roster: () => { el('rs-t-roster').innerHTML = rosterSection(st.roster, ui.group); draw.stats(); },
    standings: () => {
      el('rs-t-st').innerHTML = standingsSection(st.standings, abbr);
      el('rs-team-line').innerHTML = teamLine(st.standings, abbr);
    },
    news: () => { el('rs-t-news').innerHTML = newsSection(st.news, abbr); }
  };
  Object.values(draw).forEach(f => f());

  const controller = new AbortController();
  const signal = controller.signal;
  const load = (key, promise) => promise
    .then(res => { st[key] = { data: res.data, meta: res.meta }; draw[key](); })
    .catch(error => { if (error.kind === 'aborted') return; st[key] = { error }; draw[key](); });
  load('schedule', nhl(`/nhl/team/${abbr}/schedule`, {}, { signal }));
  load('roster', nhl(`/nhl/team/${abbr}/roster`, {}, { signal }));
  load('stats', nhl(`/nhl/team/${abbr}/stats`, {}, { signal }));
  load('standings', nhl('/nhl/standings', {}, { signal }));
  load('news', news({ limit: 100 }, { signal, timeout: 9000 }));

  const disposers = [
    on(root, 'click', '[data-sk-sort]', (_, b) => { ui.sort = b.dataset.skSort; draw.stats(); }),
    on(root, 'click', '[data-sk-all]', () => { ui.showAll = !ui.showAll; draw.stats(); }),
    on(root, 'click', '[data-roster]', (_, b) => { ui.group = b.dataset.roster; el('rs-t-roster').innerHTML = rosterSection(st.roster, ui.group); })
  ];
  return () => {
    controller.abort();
    disposers.forEach(d => d());
  };
}
