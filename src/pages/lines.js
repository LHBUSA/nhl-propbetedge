// Lines. Projected lines / PP units are BLOCKED by licensing (source matrix
// §3). What is shown: DERIVED last-game deployment from official shift charts
// (labelled as such, never as projected lines) and the official roster grouped
// by position.
import { $, esc, on } from '../lib/dom.js';
import { describeError, nhl } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { dateLabel, todayET } from '../lib/format.js';
import { TEAMS, TEAM_BY_ABBREV, teamAccent } from '../lib/teams.js';
import { teamMark } from '../components/game.js';

// Logos here always sit next to visible team text: decorative, so alt="".
const mark = (team, size) => teamMark(team, size).replace(/ alt="[^"]*"/, ' alt=""');

const GROUPS = [
  ['forward', 'Forwards', [['C', 'Centers'], ['L', 'Left wings'], ['R', 'Right wings']]],
  ['defense', 'Defense', [['D', 'Defensemen']]],
  ['goalie', 'Goalies', [['G', 'Goaltenders']]]
];

const seasonLabel = id => {
  const s = String(id || '');
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}–${s.slice(6, 8)}` : '';
};
const height = inches => (Number.isFinite(inches) && inches > 0 ? `${Math.floor(inches / 12)}′${inches % 12}″` : '—');
function age(birth, today = todayET()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth || '')) return null;
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
const byNumber = (a, b) => (a.sweater_number ?? 999) - (b.sweater_number ?? 999) || String(a.last_name).localeCompare(String(b.last_name));

function statusStrip() {
  const row = (tone, label, state, text) => `<li class="dk-status__row dk-status__row--${tone}"><i aria-hidden="true"></i><b>${esc(label)}</b><span class="pbe-badge pbe-badge--${tone === 'ok' ? 'confirmed' : tone === 'build' ? 'sched' : 'unavailable'}">${esc(state)}</span><span class="dk-status__text">${esc(text)}</span></li>`;
  return `<ul class="dk-status" aria-label="Line data coverage">
    ${row('ok', 'Official roster', 'Live', 'NHL roster by position, sweater number and handedness.')}
    ${row('ok', 'Last-game deployment', 'Derived', 'From NHL shift charts — lines, pairs, PP and PK units by shared ice time in the last completed game.')}
    ${row('off', 'Projected lines & PP units', 'Blocked', 'Only restricted sources publish them; licensing required.')}
  </ul>`;
}

function rosterMarkup(entry, abbrev) {
  if (!entry) return '<div class="pbe-skeleton" style="height:560px"></div>';
  if (!entry.data) {
    const e = describeError(entry.error);
    return `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`;
  }
  const players = entry.data.players || [];
  const season = seasonLabel(entry.data.season);
  if (!players.length) return `<div class="pbe-empty"><h3>No roster listed.</h3><p>The NHL source returned no players for ${esc(abbrev)}.</p></div>`;
  const table = (label, subs, list) => {
    if (!list.length) return '';
    const bodies = subs.map(([pos, subLabel]) => {
      const rows = list.filter(p => p.position === pos).sort(byNumber);
      if (!rows.length) return '';
      return `<tbody>
        ${subs.length > 1 ? `<tr class="dk-subhead"><th colspan="8" scope="colgroup">${esc(subLabel)} <span>${rows.length}</span></th></tr>` : ''}
        ${rows.map(p => {
          const a = age(p.birth_date);
          return `<tr>
            <td class="num dk-sweater">${p.sweater_number ?? '<span class="faint">—</span>'}</td>
            <td><a class="dk-pname" href="#/player/${esc(p.id)}">${esc(p.first_name || '')} <b>${esc(p.last_name || '')}</b></a></td>
            <td class="mono">${esc(p.position || '—')}</td>
            <td class="mono">${esc(p.shoots_catches || '—')}</td>
            <td class="num">${esc(height(p.height_inches))}</td>
            <td class="num">${p.weight_pounds ?? '—'}</td>
            <td class="num">${a ?? '—'}</td>
            <td class="mono">${esc(p.birth_country || '—')}</td>
          </tr>`;
        }).join('')}
      </tbody>`;
    }).join('');
    // Players whose position code is outside the listed subs still appear.
    const known = new Set(subs.map(s => s[0]));
    const other = list.filter(p => !known.has(p.position));
    return `<section class="dk-rgroup">
      <div class="dk-rgroup__head"><h3>${esc(label)}</h3><span class="micro">${list.length} listed</span></div>
      <div class="table-wrap" tabindex="0" role="region" aria-label="${esc(label)} roster"><table class="pbe-table dk-rtable">
        <thead><tr><th class="num">#</th><th>Player</th><th>Pos</th><th>${label === 'Goalies' ? 'Catches' : 'Shoots'}</th><th class="num">Ht</th><th class="num">Wt</th><th class="num">Age</th><th>Born</th></tr></thead>
        ${bodies}
        ${other.length ? `<tbody>${other.map(p => `<tr><td class="num">${p.sweater_number ?? '—'}</td><td><a class="dk-pname" href="#/player/${esc(p.id)}">${esc(p.first_name || '')} <b>${esc(p.last_name || '')}</b></a></td><td class="mono">${esc(p.position || '—')}</td><td class="mono">${esc(p.shoots_catches || '—')}</td><td class="num">${esc(height(p.height_inches))}</td><td class="num">${p.weight_pounds ?? '—'}</td><td class="num">${age(p.birth_date) ?? '—'}</td><td class="mono">${esc(p.birth_country || '—')}</td></tr>`).join('')}</tbody>` : ''}
      </table></div>
    </section>`;
  };
  return `<div class="dk-roster__head">
      <div><span class="eyebrow">Official roster (NHL) · not line combinations</span>
      <p class="micro">${season ? `${esc(season)} season roster` : 'Season not stated by source'} · ${players.length} players listed · grouped by position, sorted by sweater number</p></div>
      ${freshStamp(entry.meta)}
    </div>
    ${GROUPS.map(([group, label, subs]) => table(label, subs, players.filter(p => p.position_group === group))).join('')}
    ${players.some(p => !['forward', 'defense', 'goalie'].includes(p.position_group)) ? table('Other', [], players.filter(p => !['forward', 'defense', 'goalie'].includes(p.position_group))) : ''}`;
}

function summaryMarkup(entry) {
  const players = entry?.data?.players;
  if (!players?.length) return '';
  const count = g => players.filter(p => p.position_group === g).length;
  const d = players.filter(p => p.position_group === 'defense');
  const noNum = players.filter(p => p.sweater_number === null || p.sweater_number === undefined).length;
  const ages = players.map(p => age(p.birth_date)).filter(a => a !== null);
  const avg = ages.length ? (ages.reduce((s, a) => s + a, 0) / ages.length).toFixed(1) : '—';
  return `<section class="pbe-panel">
    <div class="panel-head"><h3>Roster at a glance</h3><span class="micro">Counts from the official list</span></div>
    <dl class="kv dk-l-kv">
      <div><dt>Forwards</dt><dd>${count('forward')}</dd></div>
      <div><dt>Defense</dt><dd>${count('defense')}</dd></div>
      <div><dt>Goalies</dt><dd>${count('goalie')}</dd></div>
      <div><dt>D · L / R</dt><dd>${d.filter(p => p.shoots_catches === 'L').length} / ${d.filter(p => p.shoots_catches === 'R').length}</dd></div>
      <div><dt>No # yet</dt><dd>${noNum}</dd></div>
      <div><dt>Avg age</dt><dd>${avg}</dd></div>
    </dl>
  </section>`;
}

function changesPanel() {
  const lane = (title, hint) => `<div class="dk-chg__lane"><span class="micro">${esc(title)}</span><div class="dk-chg__slot">${esc(hint)}</div></div>`;
  return `<section class="pbe-panel dk-chg">
    <div class="panel-head"><h3>What changed since morning skate</h3><span class="pbe-badge pbe-badge--unavailable">Not active</span></div>
    <div class="dk-chg__timeline" aria-hidden="true">
      <span><i></i>Morning skate</span><span class="dk-chg__line"></span><span><i></i>Pregame</span><span class="dk-chg__line"></span><span><i></i>Puck drop</span>
    </div>
    <div class="dk-chg__lanes">
      ${lane('Moved up', 'No snapshot')}
      ${lane('Moved down', 'No snapshot')}
      ${lane('In / Out', 'No snapshot')}
    </div>
    <p class="micro dk-chg__note">Activates when line snapshots exist. Every change will cite its source and capture time; nothing is inferred from a previous game.</p>
  </section>`;
}

const mmss = s => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—');
const GAME_TYPE = { 1: 'preseason', 2: 'regular season', 3: 'playoffs' };

function unitRows(units, label) {
  if (!units?.length) return `<p class="micro">No ${esc(label.toLowerCase())} with shared ice time in this game.</p>`;
  return `<ol class="dk-units">${units.map(u => `<li class="dk-unit${u.limited_sample ? ' is-limited' : ''}">
    <span class="dk-unit__tag mono">${esc(u.unit)}</span>
    <span class="dk-unit__players">${u.players.map(p => `<a href="#/player/${esc(p.id)}">${esc(p.name || '')}</a> <span class="faint mono">${esc(p.position || '')}</span>`).join('<span class="dk-sep" aria-hidden="true"> · </span>')}</span>
    <span class="dk-unit__time mono" title="Seconds all members were on the ice together at this strength">${mmss(u.shared_s)} together${u.limited_sample ? ' · <span class="dk-limited">limited sample</span>' : ''}</span>
  </li>`).join('')}</ol>`;
}

// DERIVED · LAST-GAME DEPLOYMENT from official shift charts. Never labelled
// as projected or confirmed lines.
function deploymentPanel(abbrev, entry) {
  const head = `<div class="panel-head"><h3>Last-game deployment</h3><span class="pbe-badge pbe-badge--heuristic">Derived · not a projection</span></div>`;
  if (!entry) return `<section class="pbe-panel dk-deploy">${head}<div class="pbe-skeleton" style="height:320px"></div></section>`;
  if (!entry.data) {
    const e = describeError(entry.error);
    return `<section class="pbe-panel dk-deploy">${head}<p class="dim">${esc(e.title)}. ${esc(e.body)}</p></section>`;
  }
  const d = entry.data;
  if (!d.available) return `<section class="pbe-panel dk-deploy">${head}<p class="dim">${esc(d.reason || 'No completed game to derive from.')}</p></section>`;
  const t = d.teams?.[d.side];
  const opp = d.game?.teams?.[d.side === 'home' ? 'away' : 'home']?.abbrev;
  const lg = d.last_game || {};
  return `<section class="pbe-panel dk-deploy">
    ${head}
    <p class="micro dk-deploy__label">${esc(abbrev)} ${d.side === 'home' ? 'vs' : '@'} ${esc(opp || '')} · ${esc(lg.date ? dateLabel(lg.date, { long: true }) : '')} · ${esc(seasonLabel(lg.season))} ${esc(GAME_TYPE[lg.game_type] || '')} · game <a class="link-u" href="#/cast/${esc(lg.id)}">${esc(lg.id)}</a></p>
    <p class="dim small">Who actually shared the ice in that game, from the official NHL shift charts and play-by-play strength (${esc(d.method)}). It shows deployment, not tonight's lineup.</p>
    <div class="dk-deploy__grid">
      <div><h4 class="eyebrow">Forward lines · 5v5</h4>${unitRows(t?.forward_lines, 'Forward lines')}</div>
      <div><h4 class="eyebrow">Defense pairs · 5v5</h4>${unitRows(t?.defense_pairs, 'Defense pairs')}</div>
      <div><h4 class="eyebrow">Power play</h4>${unitRows(t?.power_play_units, 'Power-play units')}</div>
      <div><h4 class="eyebrow">Penalty kill</h4>${unitRows(t?.penalty_kill_units, 'Penalty-kill units')}</div>
    </div>
    <div class="dk-deploy__foot">${freshStamp(entry.meta, { source: 'NHL shift charts' })}</div>
  </section>`;
}

// ---------------------------------------------------------------- mount
export function mount(root, params, ctx) {
  const pick = String(params.team || '').toUpperCase();
  const state = {
    team: TEAM_BY_ABBREV.has(pick) ? pick : '',
    rosters: new Map(),
    deployments: new Map(),
    slate: null, // { label, games }
  };
  const ctl = new AbortController();

  root.innerHTML = `<section class="wrap section dk dk-lines">
    <div class="section-head section-head--editorial">
      <div><span class="eyebrow">Lines</span><h2>Lines &amp; deployment</h2></div>
      <p>Who dresses and where they play. Projected combinations stay off this page until a licensed source exists; what is here is official.</p>
    </div>
    ${statusStrip()}
    <div id="dk-l-teambar"></div>
    <div class="dk-l-grid">
      <div class="dk-l-main"><div id="dk-l-deploy"></div><div id="dk-l-roster"></div></div>
      <aside class="dk-l-side">
        <div id="dk-l-summary"></div>
        ${changesPanel()}
      </aside>
    </div>
  </section>`;
  const els = { bar: $('#dk-l-teambar', root), roster: $('#dk-l-roster', root), summary: $('#dk-l-summary', root), deploy: $('#dk-l-deploy', root) };

  const renderBar = () => {
    const t = TEAM_BY_ABBREV.get(state.team);
    const slate = state.slate;
    els.bar.innerHTML = `<div class="dk-teambar" style="--c:${teamAccent(state.team)}">
      <div class="dk-teambar__id">${state.team ? mark({ abbrev: state.team }, 48) : ''}<div><b>${esc(t ? t.full : 'Choose a team')}</b><span class="micro">${esc(t ? `${t.conference} · ${t.division}` : '')}</span></div></div>
      <div class="dk-teambar__pick">
        <label class="micro" for="dk-l-team">Team</label>
        <select id="dk-l-team" class="dk-select">${state.team ? '' : '<option value="">Select…</option>'}${TEAMS.map(x => `<option value="${x.abbrev}"${x.abbrev === state.team ? ' selected' : ''}>${esc(x.abbrev)} · ${esc(x.full)}</option>`).join('')}</select>
        ${state.team ? `<a class="dk-link" href="#/team/${esc(state.team)}">Team page</a>` : ''}
      </div>
      ${!slate ? '<div class="dk-teambar__slate"><span class="micro">Next slate</span><div class="pbe-skeleton dk-slate-skel"></div></div>' : ''}
      ${slate?.games?.length ? `<div class="dk-teambar__slate"><span class="micro">${esc(slate.label)}</span><div class="dk-slatechips">${slate.games.map(g => `<span class="dk-slatepair">${['away', 'home'].map((s, i) => `${i ? '<span class="faint">@</span>' : ''}<button class="dk-slatebtn" data-team="${esc(g.teams[s].abbrev)}" aria-pressed="${state.team === g.teams[s].abbrev}">${esc(g.teams[s].abbrev)}</button>`).join('')}</span>`).join('')}</div></div>` : ''}
    </div>`;
  };

  const renderRoster = () => {
    if (!state.team) {
      els.roster.innerHTML = '<div class="pbe-skeleton" style="height:560px"></div>';
      return;
    }
    const entry = state.rosters.get(state.team);
    els.roster.innerHTML = rosterMarkup(entry, state.team);
    els.summary.innerHTML = summaryMarkup(entry);
    els.deploy.innerHTML = deploymentPanel(state.team, state.deployments.get(state.team));
  };

  async function loadDeployment(team) {
    if (state.deployments.get(team)?.data) return;
    state.deployments.delete(team);
    try {
      const res = await nhl(`/nhl/team/${team}/deployment`, {}, { signal: ctl.signal });
      state.deployments.set(team, { data: res.data, meta: res.meta });
    } catch (error) {
      if (error.kind === 'aborted') return;
      state.deployments.set(team, { data: null, error });
    }
    if (team === state.team) renderRoster();
  }

  async function loadRoster(team) {
    loadDeployment(team);
    if (state.rosters.has(team) && state.rosters.get(team)?.data) { renderRoster(); return; }
    state.rosters.delete(team);
    renderRoster();
    try {
      const res = await nhl(`/nhl/team/${team}/roster`, {}, { signal: ctl.signal });
      state.rosters.set(team, { data: res.data, meta: res.meta });
    } catch (error) {
      if (error.kind === 'aborted') return;
      state.rosters.set(team, { data: null, error });
    }
    if (team === state.team) renderRoster();
  }

  const setTeam = team => {
    if (!TEAM_BY_ABBREV.has(team)) return;
    state.team = team;
    history.replaceState(null, '', `#/lines?team=${team}`);
    renderBar();
    loadRoster(team);
  };

  // Default: first team of the next slate (today, else the next puck-drop date).
  (async () => {
    try {
      const today = await ctx.board(todayET(), { signal: ctl.signal });
      let games = today.data.games || [];
      let label = 'Today';
      if (!games.length && today.data.next_puck_drop?.date) {
        const nd = today.data.next_puck_drop.date;
        try {
          const next = await ctx.board(nd, { signal: ctl.signal });
          games = next.data.games || [];
        } catch { games = today.data.next_puck_drop.games_at_start || []; }
        label = `Next slate · ${dateLabel(nd)}`;
      }
      state.slate = { label, games: games.filter(g => g.teams?.away?.abbrev && g.teams?.home?.abbrev) };
      if (!state.team) {
        const first = state.slate.games[0]?.teams.away.abbrev;
        state.team = TEAM_BY_ABBREV.has(first) ? first : TEAMS[0].abbrev;
        history.replaceState(null, '', `#/lines?team=${state.team}`);
        loadRoster(state.team);
      }
    } catch (error) {
      if (error.kind === 'aborted') return;
      if (!state.team) { state.team = TEAMS[0].abbrev; loadRoster(state.team); }
    }
    renderBar();
  })();

  renderBar();
  if (state.team) loadRoster(state.team); else renderRoster();

  const disposers = [
    on(root, 'change', '#dk-l-team', (_, sel) => setTeam(sel.value)),
    on(root, 'click', '[data-team]', (_, btn) => setTeam(btn.dataset.team))
  ];

  return () => {
    ctl.abort();
    disposers.forEach(d => d());
  };
}
