// WinHL — PropBetEdge's NHL skater impact metric (0-100).
//
// Every number on this page comes from the nhl-metrics WinHL snapshot through
// the gateway: free viewers see the top of the season table; NHL Pro adds the
// full table, position/team filters, last-10 / last-5 windows, trend, team
// depth and the per-player component breakdown. Missing values render as
// unavailable, never as zero. WinHL is a PropBetEdge composite, not an official
// NHL statistic, and it is not xG, possession value, GAR or WAR.
//
// Season: the page never names a season itself. With no ?season= the gateway
// serves the default board, which is the current NHL regular season (marked
// PROVISIONAL early on); completed seasons are picked from the board's own
// `seasons` list. Preseason is never scored.
import { $, esc, on } from '../lib/dom.js';
import { describeError } from '../lib/api.js';
import { intel, onTierChange } from '../lib/intel.js';
import { freshStamp } from '../lib/freshness.js';
import { TEAMS } from '../lib/teams.js';
import { playerIdentity } from '../components/player.js';
import { DASH, fmtScore, lockPanel, mmss, versionTag, weightedComponents } from '../components/intel-ui.js';

const POSITIONS = [['', 'All skaters'], ['F', 'Forwards'], ['D', 'Defense'], ['C', 'Centers'], ['L', 'Left wing'], ['R', 'Right wing']];
const WINDOWS = [['season', 'Season'], ['last10', 'Last 10'], ['last5', 'Last 5']];
const POS_LABEL = { C: 'C', L: 'LW', R: 'RW', D: 'D' };
const SEASON_ID = /^\d{8}$/;

// Request params for a board/detail read. No season = the server default
// (current season); only an explicit non-default selection is sent.
export function winhlParams({ pos = '', season = '' } = {}) {
  return { pos: pos || undefined, season: SEASON_ID.test(season) ? season : undefined };
}

// Season picker built from the API's own season list (newest first).
export function seasonChips(board, selected = '') {
  const seasons = Array.isArray(board?.seasons) ? board.seasons : [];
  if (seasons.length < 2) return '';
  const active = s => (selected ? s.season === selected : s.default);
  return `<div class="iq-tabs" role="group" aria-label="Season">${seasons.map(s => `<button type="button" class="chip${active(s) ? ' is-active' : ''}" aria-pressed="${active(s)}" data-season="${esc(s.default ? '' : s.season)}">${esc(s.label)}${s.status === 'provisional' ? ' · Provisional' : s.status === 'final' || s.status === 'prior_final' ? ' · Final' : ''}</button>`).join('')}</div>`;
}

// Headline badges + label for the board on screen.
export function seasonHeadline(board) {
  if (!board) return { label: 'WinHL', badges: '' };
  const status = board.status || 'current';
  const badges = `<span class="pbe-badge pbe-badge--sched">Regular season</span>${board.provisional ? '<span class="pbe-badge pbe-badge--preseason">Provisional</span>' : ''}${status === 'final' || status === 'prior_final' ? '<span class="pbe-badge pbe-badge--final">Final</span>' : ''}`;
  const suffix = board.provisional ? ' · provisional' : status === 'final' || status === 'prior_final' ? ' · final' : '';
  return { label: `WinHL ${board.season_label} regular season${suffix}`, badges };
}

function trendMarkup(p) {
  if (p.trend === undefined) return '';
  if (p.trend === null) return `<span class="wl-trend wl-trend--steady" title="Trend needs both a season and a last-10 score">${DASH}</span>`;
  const arrow = p.trend_label === 'up' ? '▲' : p.trend_label === 'down' ? '▼' : '■';
  return `<span class="wl-trend wl-trend--${esc(p.trend_label)}" title="Last 10 vs season, like-for-like components">${arrow} ${p.trend > 0 ? '+' : ''}${esc(p.trend.toFixed(1))}</span>`;
}

function podium(players) {
  const top = players.slice(0, 3);
  if (!top.length) return '';
  return `<div class="wl-podium">${top.map((p, i) => `
    <a class="wl-pod wl-pod--${i + 1}" href="#/player/${esc(p.id)}">
      <span class="wl-pod__rank">${i + 1}</span>
      ${playerIdentity({ id: p.id, name: p.name, team: p.team, size: 'lg', priority: i === 0 })}
      <span class="wl-pod__name">${esc(p.name)}</span>
      <span class="wl-pod__meta mono">${esc(p.team)} · ${esc(POS_LABEL[p.position] || p.position)} · ${esc(p.gp)} GP · ${esc(mmss(p.toi_per_game_s))} TOI</span>
      <b class="iq-ring__v mono" style="position:static;transform:none;font-size:34px">${fmtScore(p.score)}</b>
      ${trendMarkup(p)}
    </a>`).join('')}</div>`;
}

function rows(players, offset = 3) {
  return `<ol class="wl-list">${players.slice(offset).map(p => `<li>
    <button type="button" class="wl-row" data-player="${esc(p.id)}" aria-label="${esc(p.name)} WinHL ${fmtScore(p.score)}">
      <span class="wl-row__rk">${esc(p.rank)}</span>
      <span class="wl-row__who">${playerIdentity({ id: p.id, name: p.name, team: p.team, size: 'sm' })}<span class="wl-row__name"><b>${esc(p.name)}</b><span class="micro">${esc(p.team)} · ${esc(POS_LABEL[p.position] || p.position)} · ${esc(p.gp)} GP${(p.flags || []).includes('provisional_sample') ? ' · provisional' : ''}</span></span></span>
      ${trendMarkup(p)}
      <span class="wl-row__score">${fmtScore(p.score)}</span>
    </button></li>`).join('')}</ol>`;
}

function detailMarkup(entry, tier) {
  if (!entry) return '';
  if (entry.loading) return '<div class="pbe-skeleton" style="height:260px"></div>';
  if (entry.error) return `<div class="pbe-error"><strong>${esc(describeError(entry.error).title)}</strong>${esc(describeError(entry.error).body)}</div>`;
  const d = entry.data?.player;
  if (!d) return '';
  if (tier !== 'pro' || d.locked) {
    return `<section class="pbe-panel wl-detail"><div class="panel-head"><h3>${esc(d.name)} · WinHL breakdown</h3></div>
      ${d.season ? `<p>Season WinHL <b class="mono">${fmtScore(d.season.score)}</b> · league rank ${esc(d.season.rank_league)}</p>` : ''}
      ${lockPanel('Component breakdown, last-10 / last-5 windows and 14-day rank history', 'See exactly which inputs drive the score: goal creation, shot generation, special teams, ice time, penalty-kill role, defensive events, discipline, NHL shot-attempt share and faceoffs.')}
    </section>`;
  }
  const win = w => (w && Number.isFinite(w.score) ? `<div><span class="micro">${esc(w === d.season ? 'Season' : w === d.last10 ? 'Last 10' : 'Last 5')}</span><b class="mono">${fmtScore(w.score, 1)}</b><span class="micro faint">${esc(w.gp)} GP${w.first_date ? ` · ${esc(w.first_date)} → ${esc(w.last_date)}` : ''}</span></div>` : `<div><span class="micro">${esc(w === d.last10 ? 'Last 10' : w === d.last5 ? 'Last 5' : 'Season')}</span><b class="mono">${DASH}</b><span class="micro faint">${esc(w?.unavailable_reason || 'Not enough games in this window')}</span></div>`);
  const hist = Array.isArray(entry.data.history) ? entry.data.history.slice().reverse() : [];
  return `<section class="pbe-panel wl-detail" aria-label="${esc(d.name)} WinHL breakdown">
    <div class="panel-head"><h3>${esc(d.name)} · WinHL breakdown</h3>${versionTag(entry.data.version)}</div>
    <div class="gi-cmp">${win(d.season)}${win(d.last10)}${win(d.last5)}</div>
    <p class="micro dim" style="margin:10px 0">Ranks — league ${esc(d.season?.rank_league ?? DASH)} · ${esc(d.group === 'D' ? 'defense' : 'forwards')} ${esc(d.season?.rank_position ?? DASH)} (position) · ${esc(d.team)} ${esc(d.season?.rank_team ?? DASH)} · trend ${d.trend === null ? DASH : `${d.trend > 0 ? '+' : ''}${d.trend}`}</p>
    <h4 class="micro">Season components (percentile within position group)</h4>
    ${weightedComponents(d.season?.components || [])}
    ${hist.length ? `<h4 class="micro" style="margin-top:14px">Season score, last ${hist.length} snapshots</h4><div class="wl-hist" role="img" aria-label="Daily season WinHL">${hist.map(h => `<i style="height:${Math.max(4, h.score)}%" title="${esc(h.date)}: ${esc(h.score)} (rank ${esc(h.rank_league)})"></i>`).join('')}</div>` : '<p class="micro faint" style="margin-top:12px">Rank history builds one snapshot per day.</p>'}
    <p style="margin-top:12px"><a class="gold" href="#/player/${esc(d.id)}">Open player page ›</a></p>
  </section>`;
}

export function mount(root, params) {
  const state = { tier: null, pos: POSITIONS.some(([k]) => k === params.pos) ? params.pos || '' : '', season: SEASON_ID.test(params.season || '') ? params.season : '', seasons: [], window: 'season', team: '', board: null, meta: null, error: null, detail: null, detailId: null, depth: null };
  const ctl = new AbortController();
  root.innerHTML = `<section class="wrap section">
    <div class="section-head section-head--editorial">
      <div><span class="eyebrow">Intelligence · PropBetEdge metric</span><h2>WinHL</h2></div>
      <p>How much is this skater contributing to winning hockey? A 0–100 score built from official NHL per-game rates, ranked within position. 50 is the median qualified player at the position. Not an official NHL statistic, and not xG, possession value, GAR or WAR.</p>
    </div>
    <div id="wl-tools"></div>
    <div id="wl-body"><div class="pbe-skeleton" style="height:420px"></div></div>
    <div id="wl-detail"></div>
    <div id="wl-depth"></div>
    <p class="micro faint" style="margin-top:18px">Formula, weights and qualification rules: <a class="gold" href="#/methodology?section=winhl">Methodology › WinHL</a>.</p>
  </section>`;
  const tools = $('#wl-tools', root); const body = $('#wl-body', root); const detail = $('#wl-detail', root); const depth = $('#wl-depth', root);

  const renderTools = () => {
    const pro = state.tier === 'pro';
    tools.innerHTML = `<div class="iq-head">
      <div class="iq-tabs" role="group" aria-label="Position">${POSITIONS.map(([k, l]) => `<button type="button" class="chip${state.pos === k ? ' is-active' : ''}" aria-pressed="${state.pos === k}" data-pos="${esc(k)}">${esc(l)}</button>`).join('')}</div>
      <div class="iq-tabs" role="group" aria-label="Window">${WINDOWS.map(([k, l]) => `<button type="button" class="chip${state.window === k ? ' is-active' : ''}" aria-pressed="${state.window === k}" data-window="${esc(k)}"${!pro && k !== 'season' ? ' data-locked="1" title="NHL Pro"' : ''}>${esc(l)}${!pro && k !== 'season' ? ' · Pro' : ''}</button>`).join('')}</div>
      ${pro ? `<label class="chip"><span class="sr-only">Team</span><select class="chip-select" data-team><option value="">All teams</option>${TEAMS.map(t => `<option value="${esc(t.abbrev)}"${state.team === t.abbrev ? ' selected' : ''}>${esc(t.abbrev)}</option>`).join('')}</select></label>` : ''}
      ${seasonChips({ seasons: state.seasons }, state.season)}
      ${state.board ? freshStamp(state.meta, { label: seasonHeadline(state.board).label }) : ''}
    </div>
    ${state.board ? `<p class="iq-note"><span class="wl-season">${seasonHeadline(state.board).badges}</span> ${esc(state.board.season_note)} ${state.board.window !== 'season' ? `Window: ${esc(state.board.windows?.[state.board.window]?.games || '')}, rates scored against the season distribution.` : ''} ${versionTag(state.board.version)}</p>` : ''}`;
  };

  const renderBody = () => {
    if (state.error && !state.board) { const e = describeError(state.error); body.innerHTML = `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`; return; }
    if (!state.board) { body.innerHTML = '<div class="pbe-skeleton" style="height:420px"></div>'; return; }
    const players = state.board.players || [];
    if (!players.length) { const q = state.board.qualify || {}; body.innerHTML = `<div class="iq-na"><b>No scored players for this filter.</b><span>Players need ${esc(q.min_gp ?? 10)}+ game${(q.min_gp ?? 10) === 1 ? '' : 's'} and 5:00+ per game in the window.</span></div>`; return; }
    body.innerHTML = `${podium(players)}${rows(players)}
      ${state.board.truncated_for_tier ? lockPanel(`The full WinHL table — all ${state.board.total_scored} scored skaters`, 'NHL Pro unlocks every rank, last-10 and last-5 form, trend arrows, team filters, team depth and each player\'s component breakdown.') : ''}`;
  };

  const renderDepth = () => {
    if (state.tier !== 'pro' || !state.team) { depth.innerHTML = ''; return; }
    const players = state.board?.players || [];
    const f = players.filter(p => p.group === 'F'); const d = players.filter(p => p.group === 'D');
    const col = (title, list) => `<section class="pbe-panel"><div class="panel-head"><h3>${esc(title)}</h3><span class="micro">${list.length} scored</span></div>${list.length ? `<ol class="wl-list">${list.map(p => `<li><button type="button" class="wl-row" data-player="${esc(p.id)}"><span class="wl-row__rk">${esc(p.rank_team ?? '')}</span><span class="wl-row__who"><span class="wl-row__name"><b>${esc(p.name)}</b><span class="micro">${esc(POS_LABEL[p.position] || p.position)} · ${esc(mmss(p.toi_per_game_s))}</span></span></span>${trendMarkup(p)}<span class="wl-row__score">${fmtScore(p.score)}</span></button></li>`).join('')}</ol>` : '<p class="dim">None scored.</p>'}</section>`;
    depth.innerHTML = `<div class="section-head" style="margin-top:22px"><div><span class="eyebrow">Team depth</span><h2>${esc(state.team)} by WinHL</h2></div></div><div class="wl-depth">${col('Forwards', f)}${col('Defense', d)}</div>`;
  };

  async function load() {
    try {
      state.tier = state.tier || null;
      const res = await intel('/winhl', { params: winhlParams(state), proParams: { window: state.window, team: state.team || undefined, limit: 100 }, signal: ctl.signal });
      state.tier = res.tier;
      if (res.tier !== 'pro') { state.window = 'season'; state.team = ''; }
      state.board = res.data; state.meta = res.meta; state.error = null;
      if (Array.isArray(res.data?.seasons)) state.seasons = res.data.seasons;
    } catch (error) {
      if (error.kind === 'aborted') return;
      state.error = error;
    }
    renderTools(); renderBody(); renderDepth();
  }

  async function openDetail(id) {
    state.detailId = id;
    state.detail = { loading: true };
    detail.innerHTML = detailMarkup(state.detail, state.tier);
    try {
      const res = await intel(`/winhl/player/${id}`, { params: { season: winhlParams(state).season }, signal: ctl.signal });
      if (state.detailId !== id) return;
      state.detail = { data: res.data };
      state.tier = res.tier;
    } catch (error) {
      if (error.kind === 'aborted') return;
      state.detail = { error };
    }
    detail.innerHTML = detailMarkup(state.detail, state.tier);
    detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const disposers = [
    on(root, 'click', '[data-season]', (_, b) => { state.season = b.dataset.season; state.board = null; state.detail = null; detail.innerHTML = ''; renderTools(); renderBody(); load(); }),
    on(root, 'click', '[data-pos]', (_, b) => { state.pos = b.dataset.pos; state.board = null; renderTools(); renderBody(); load(); }),
    on(root, 'click', '[data-window]', (_, b) => {
      if (b.dataset.locked) { document.querySelector('[data-open-nhl-pro].pbepro__open')?.click(); return; }
      state.window = b.dataset.window; state.board = null; renderTools(); renderBody(); load();
    }),
    on(root, 'change', '[data-team]', (_, s) => { state.team = s.value; state.board = null; renderTools(); renderBody(); load(); }),
    on(root, 'click', '[data-player]', (_, b) => openDetail(Number(b.dataset.player))),
    onTierChange(() => { state.board = null; renderBody(); load(); })
  ];
  renderTools();
  load();
  return () => { ctl.abort(); disposers.forEach(d => d()); };
}
