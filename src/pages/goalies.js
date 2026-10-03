// Goalie Center 3.0. Answers first: who is in net, saves, goals allowed,
// record, save rate, workload, and how the two goalies compare — then
// shot-location tracking, then PBE analysis.
//
// One starter truth per team (nhl-metrics goalie-truth library, by NHL id):
//   Confirmed  = official NHL boxscore (starter flag, or the only goalie with
//                ice time — the NHL omits the flag during live games)
//   Projected  = NHL.com projected lineup (reported, not official), bound to the
//                official roster id
//   Unknown    = no approved starter evidence yet
// "In net now" (play-by-play) is shown separately and never becomes "started".
import { $, esc, on } from '../lib/dom.js';
import { dataLayer, describeError } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { addDays, dateLabel, dayET, gameTypeLabel, timeET, todayET } from '../lib/format.js';
import { createPoller } from '../lib/poll.js';
import { teamAccent } from '../lib/teams.js';
import { stateBadge, stateOf, teamMark } from '../components/game.js';
import { intel } from '../lib/intel.js';
import { comparisonRows, sideView, sortBoard } from '../lib/goalie-center.js';
import { comparisonTable, leagueBoard, liveLine, overviewCell, recentForm, seasonSection, stamp, truthBlock } from '../components/goalie-center.js';
import { edgeSplits, goalieWarnings, workloadTimeline } from '../components/goalie-intel.js';
import { lockPanel, pct3, scoreRing, versionTag, weightedComponents } from '../components/intel-ui.js';
import { playerIdentity } from '../components/player.js';
import { num, svPct } from '../lib/format.js';

const mark = (team, size) => teamMark(team, size).replace(/ alt="[^"]*"/, ' alt=""');
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const LIVEISH = new Set(['LIVE', 'INTERMISSION']);
const PREISH = new Set(['SCHEDULED', 'PREGAME']);
const LIVE_MS = 15000;          // live goalie lane (gateway coalesces ~10 s)
const INTEL_LIVE_MS = 120000;   // heavier intelligence while live
const INTEL_PRE_MS = 300000;

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
const errorBox = error => { const e = describeError(error); return `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`; };
const semOf = g => stateOf(g).key;
const metricsState = g => (LIVEISH.has(semOf(g)) ? 'LIVE' : semOf(g) === 'FINAL' ? 'FINAL' : 'PRE');

const METHOD_NOTE = `<aside class="gc-method" aria-label="How to read the Goalie Center">
  <dl>
    <div><dt><span class="pbe-badge gc-badge gc-badge--confirmed">Confirmed</span></dt><dd>Official NHL boxscore after puck drop — the NHL starter flag, or, while a game is live and the NHL omits that flag, the only goalie with ice time (derived by us, not an NHL flag). The basis is shown with every confirmed starter.</dd></div>
    <div><dt><span class="pbe-badge gc-badge gc-badge--projected">Projected · Reported</span></dt><dd>NHL.com projected lineup when it names the starter, matched to the official roster by NHL id. Reported, not official.</dd></div> <!-- source-brand:allow (named publisher: NHL.com projected-lineup reporting) -->
    <div><dt><span class="pbe-badge gc-badge gc-badge--unknown">Unknown</span></dt><dd>No approved starter evidence yet. Nobody is put in the starter slot.</dd></div>
    <div><dt>In net now</dt><dd>The goalie on the latest opponent shot in the NHL play-by-play — observed, never treated as the starter.</dd></div>
  </dl>
  <p class="micro">GSAx is not shown because PropBetEdge has not released a validated NHL expected-goals model. <a class="gold" href="#/methodology">Methodology</a></p>
</aside>`;

function gameHead(g, { big = false, links = true } = {}) {
  const a = g.teams?.away || {}; const h = g.teams?.home || {};
  return `<header class="gc-game__head">
    <div class="gc-game__match">${mark(a, big ? 44 : 28)}<b>${esc(a.abbrev || 'TBD')}</b><span class="faint">@</span>${mark(h, big ? 44 : 28)}<b>${esc(h.abbrev || 'TBD')}</b></div>
    <div class="gc-game__meta">${stateBadge(g)}<span class="mono">${esc(dayET(g.start_time_utc))} · ${esc(timeET(g.start_time_utc))}</span>${gameTypeLabel(g.game_type) ? `<span class="micro">${esc(gameTypeLabel(g.game_type))}</span>` : ''}</div>
    ${links ? `<div class="gc-game__links">${big ? '' : `<a class="dk-link dk-link--gold" href="#/goalies/${esc(g.id)}">Focus</a>`}<a class="dk-link" href="#/cast/${esc(g.id)}">PBE Cast</a><a class="dk-link" href="#/matchup/${esc(g.id)}">Matchup</a></div>` : ''}
  </header>`;
}

function views(entry) {
  const i = entry?.intel?.data?.sides || null;
  const l = entry?.live?.data?.sides || null;
  return { away: sideView(i?.away, l?.away), home: sideView(i?.home, l?.home) };
}

function stamps(entry) {
  const out = [];
  if (entry?.intel?.data) out.push(freshStamp(entry.intel.meta, { failed: entry.intel.failed, source: 'PBE intelligence · NHL', label: 'Starters & season' }));
  if (entry?.live?.data?.sides) out.push(freshStamp(entry.live.meta, { failed: entry.live.failed, source: 'NHL boxscore', label: 'Live line' }));
  return out.join('');
}

// ---------------------------------------------------------------- overview
function overviewGame(g, entry) {
  const st = metricsState(g);
  let body;
  if (!entry?.intel) body = '<div class="pbe-skeleton" style="height:120px"></div>';
  else if (!entry.intel.data && !entry.live?.data?.sides) body = `<p class="micro">Goalie data unavailable — ${esc(describeError(entry.intel.error).title)}.</p>`;
  else {
    const v = views(entry);
    body = `<div class="gc-cells">${overviewCell(v.away, { state: st })}${overviewCell(v.home, { state: st })}</div>`;
  }
  return `<article class="gc-game" data-game="${esc(g.id)}" style="--away:${teamAccent(g.teams?.away?.abbrev)};--home:${teamAccent(g.teams?.home?.abbrev)}">
    ${gameHead(g)}${body}<div class="gc-stamps">${stamps(entry)}</div></article>`;
}

// ---------------------------------------------------------------- focus
function formBlock(g, pro) {
  const f = g?.form && !g.form.locked ? g.form : null;
  if (!f) return lockPanel('PBE Goalie Form', 'A transparent 0–100 PropBetEdge reading from shot-weighted recent save rate, the season baseline, rest and workload, and the opponent’s shot volume — every component shown. It is PBE analysis, not an NHL statistic.', { compact: true });
  return `<div class="gc-pbe">${scoreRing(f.score, { label: `${g.name} PBE Goalie Form`, size: 64, caption: 'PBE Goalie Form' })}
    <details><summary class="micro gold">Components ${versionTag(f.version)}</summary>${weightedComponents(f.components, { valueFmt: c => (c.key.includes('save') ? pct3(c.value) : c.value === null || c.value === undefined ? '—' : String(c.value)) })}${f.unavailable_reason ? `<p class="micro faint">${esc(f.unavailable_reason)}</p>` : ''}</details></div>`;
}

function teamFocus(view, g, entry, { pro }) {
  if (!view) return '<section class="gc-team"><p class="dim">Team not set by the source.</p></section>';
  const st = metricsState(g);
  const h = view.headline;
  const rec = h?.record || null;
  const others = view.others.filter(o => (o.season_lines?.current?.line?.gp ?? 0) > 0 || (o.season_lines?.previous?.line?.gp ?? 0) > 0 || o.live?.toi_s);
  return `<section class="gc-team" style="--c:${teamAccent(view.team)}">
    <header class="gc-team__head">${playerIdentity({ id: h?.id, name: h?.name, team: view.team, size: 'lg' })}
      <div><span class="eyebrow">${esc(view.team || '')}</span>${h ? `<h3><a href="#/player/${esc(h.id)}">${esc(h.name || 'Unnamed')}</a></h3>` : `<h3 class="gc-name--none">${st === 'PRE' ? 'Starter not reported' : 'Starter flag unavailable'}</h3>`}</div></header>
    ${truthBlock(view, { live: st !== 'PRE' })}
    ${h && st !== 'PRE' ? liveLine(h.live, { final: st === 'FINAL' }) : ''}
    ${view.inNet && !view.inNet.same_as_starter && !view.inNet.net_empty_now ? liveLine(view.others.find(o => o.id === view.inNet.goalie_id)?.live || null, { title: `${view.inNet.name || 'Goalie'} · in net now` }) : ''}
    ${rec ? `<div class="gc-block">${seasonSection(rec)}</div>
      <div class="gc-block"><div class="gc-sub"><span class="eyebrow">Recent form</span></div>${recentForm(rec)}</div>
      <div class="gc-block"><div class="gc-sub"><span class="eyebrow">Workload &amp; rest</span>${stamp('NHL schedule + game logs')}</div>${goalieWarnings(rec)}${workloadTimeline(rec, entry.intel?.data?.game?.date)}</div>
      <div class="gc-block"><div class="gc-sub"><span class="eyebrow">Shot location · PropSports</span></div>${edgeSplits(rec)}</div>
      <div class="gc-block gc-block--pbe"><div class="gc-sub"><span class="eyebrow">PBE analysis</span></div>${formBlock(rec, pro)}</div>` : h ? '<p class="micro gc-none">No season, form or tracking record for this goalie in the intelligence payload yet.</p>' : ''}
    ${others.length ? `<div class="gc-block"><div class="gc-sub"><span class="eyebrow">Other goalies</span></div><ul class="gc-others">${others.map(o => {
      const cur = o.season_lines?.current?.line; const prev = o.season_lines?.previous?.line;
      const l = cur && cur.gp ? cur : prev; const lab = cur && cur.gp ? '' : ' (prior season)';
      return `<li>${playerIdentity({ id: o.id, name: o.name, team: view.team, size: 'sm' })}<a href="#/player/${esc(o.id)}">${esc(o.name || 'Unnamed')}</a><span class="micro">${l ? `${l.gp} GP · ${l.gs ?? '—'} GS · ${l.save_pct !== null && l.save_pct !== undefined ? svPct(l.save_pct) : '—'} SV%${esc(lab)}` : 'No season line'}</span></li>`;
    }).join('')}</ul></div>` : ''}
  </section>`;
}

function focusMarkup(g, entry) {
  if (!entry?.intel) return '<div class="pbe-skeleton" style="height:520px"></div>';
  if (!entry.intel.data && !entry.live?.data?.sides) return errorBox(entry.intel.error);
  const v = views(entry);
  const pro = entry.intel.tier === 'pro';
  const rows = comparisonRows(v.away, v.home, { fmtSv: x => (x === null || x === undefined ? '—' : svPct(x)), fmtNum: (x, d = 0) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? '—' : d ? num(x, d) : Number(x).toLocaleString('en-US')) });
  return `<article class="gc-focus" data-game="${esc(g.id)}">
    ${gameHead(g, { big: true })}
    <div class="gc-stamps">${stamps(entry)}</div>
    <section class="gc-block" aria-labelledby="gc-cmp-h"><div class="gc-sub"><span class="eyebrow" id="gc-cmp-h">Goalie vs goalie</span></div>${comparisonTable(rows, v.away, v.home)}</section>
    <div class="gc-teams">${teamFocus(v.away, g, entry, { pro })}${teamFocus(v.home, g, entry, { pro })}</div>
  </article>`;
}

// ---------------------------------------------------------------- mount
export function mount(root, params, ctx) {
  const focusId = params.gameId || null;
  const state = {
    date: YMD.test(params.date || '') ? params.date : null,
    resolved: false, slateNote: '',
    board: null, boardMeta: null, boardFailed: false, boardError: null,
    games: [], store: new Map(),          // gameId -> { intel:{data,meta,tier,error,failed,at}, live:{...} }
    focusGame: null, pickGames: [], limited: false,
    league: null, sort: 'wins', minGs: 0
  };
  const ctl = new AbortController();
  root.innerHTML = `<section class="wrap section dk dk-goalies gc">
    <div class="section-head">
      <div><span class="eyebrow">Goalie Center${focusId ? ' · Focus' : ''}</span><h2 id="dk-g-title">${focusId ? 'Who is in net' : 'Who is in net tonight'}</h2></div>
      <p>Starter truth, saves, goals allowed, record and save rate first — then recent form, workload, shot location and PBE analysis.</p>
    </div>
    <div id="dk-g-tools"></div>
    <div id="dk-g-body"></div>
    <section class="dk-sub gc-league" aria-labelledby="dk-lead-title">
      <div class="section-head section-head--editorial"><div><span class="eyebrow">League</span><h2 id="dk-lead-title">League goalie board</h2></div><div id="gc-league-stamp"></div></div>
      <div id="dk-g-leaders"></div>
    </section>
    ${METHOD_NOTE}
  </section>`;
  const tools = $('#dk-g-tools', root);
  const body = $('#dk-g-body', root);
  const leagueEl = $('#dk-g-leaders', root);
  const entryFor = id => { const k = String(id); if (!state.store.has(k)) state.store.set(k, {}); return state.store.get(k); };

  const renderLeague = () => {
    const L = state.league;
    $('#gc-league-stamp', root).innerHTML = L?.data ? freshStamp(L.meta, { source: 'NHL stats', label: 'Season totals' }) : '';
    if (!L) { leagueEl.innerHTML = '<div class="pbe-skeleton" style="height:320px"></div>'; return; }
    if (!L.data) { leagueEl.innerHTML = errorBox(L.error); return; }
    leagueEl.innerHTML = leagueBoard(L.data, sortBoard(L.data.goalies, state.sort, { minGs: state.minGs }), { sort: state.sort, minGs: state.minGs });
  };

  const renderTools = () => {
    if (focusId) {
      const date = state.focusGame?.date;
      tools.innerHTML = `<div class="dk-toolbar">
        <a class="pbe-btn pbe-btn--sm" href="#/goalies${date ? `?date=${esc(date)}` : ''}">‹ All games${date ? ` · ${esc(dateLabel(date))}` : ''}</a>
        ${state.pickGames.length <= 1 ? '' : `<nav class="dk-picker" aria-label="Other games this date">${state.pickGames.map(g => `<a class="dk-pick${String(g.id) === String(focusId) ? ' is-active' : ''}"${String(g.id) === String(focusId) ? ' aria-current="page"' : ''} href="#/goalies/${esc(g.id)}"><span class="mono">${esc(g.teams.away.abbrev)} <span class="faint">@</span> ${esc(g.teams.home.abbrev)}</span><span class="micro">${esc(stateOf(g).text)}</span></a>`).join('')}</nav>`}
      </div>`;
      return;
    }
    const date = state.date || todayET();
    tools.innerHTML = `<div class="dk-toolbar">
      <div class="dk-toolbar__title"><b>${esc(dateLabel(date, { long: true }))}</b>${state.slateNote ? `<span class="pbe-badge pbe-badge--sched">${esc(state.slateNote)}</span>` : ''}</div>
      <div class="datenav" role="group" aria-label="Choose date">
        <button class="pbe-btn pbe-btn--sm" data-shift="-1" aria-label="Previous day">‹</button>
        <button class="pbe-btn pbe-btn--sm${date === todayET() ? ' is-current' : ''}" data-goto="${todayET()}">Today</button>
        <button class="pbe-btn pbe-btn--sm" data-shift="1" aria-label="Next day">›</button>
        <label class="sr-only" for="dk-g-date">Date</label>
        <input id="dk-g-date" class="datenav__input" type="date" value="${esc(date)}">
      </div>
      ${state.board ? freshStamp(state.boardMeta, { failed: state.boardFailed, label: 'Schedule' }) : ''}
    </div>`;
  };

  const summary = () => {
    let confirmed = 0; let projected = 0;
    for (const g of state.games) {
      const v = views(state.store.get(String(g.id)));
      for (const s of [v.away, v.home]) { if (s?.level === 'CONFIRMED') confirmed += 1; else if (s?.level === 'PROJECTED') projected += 1; }
    }
    return `<p class="gc-summary micro">${state.games.length} game${state.games.length === 1 ? '' : 's'} · <b>${confirmed}</b> confirmed · <b>${projected}</b> projected · <b>${state.games.length * 2 - confirmed - projected}</b> unknown</p>`;
  };

  const renderSlate = () => {
    if (!state.board) { body.innerHTML = state.boardError ? errorBox(state.boardError) : '<div class="pbe-skeleton" style="height:420px"></div>'; return; }
    if (!state.games.length) {
      const next = state.board.next_puck_drop;
      body.innerHTML = `<div class="pbe-empty"><h3>No NHL games on ${esc(dateLabel(state.date, { long: true }))}.</h3>
        <p>${next ? `Next puck drop: <b>${esc(dayET(next.start_time_utc, true))} · ${esc(timeET(next.start_time_utc))}</b>.` : 'The source schedule lists no upcoming game in its current window.'}</p>
        ${next && next.date !== state.date ? `<p style="margin-top:14px"><button class="pbe-btn pbe-btn--primary" data-goto="${esc(next.date)}">Open the ${esc(dateLabel(next.date))} slate</button></p>` : ''}</div>`;
      return;
    }
    if (state.limited) {
      body.innerHTML = '<div class="pbe-note dk-banner"><b>Limited mode.</b> Goalie truth needs the NHL intelligence routes, which this environment does not serve. Nothing is shown rather than guessed.</div>';
      return;
    }
    body.innerHTML = `<div class="gc-board-head"><span class="eyebrow">Tonight’s goalie board</span>${summary()}</div>
      <div class="gc-games">${state.games.map(g => overviewGame(g, state.store.get(String(g.id)))).join('')}</div>`;
  };
  const renderFocus = () => {
    const g = state.focusGame;
    if (!g) { body.innerHTML = state.boardError ? errorBox(state.boardError) : '<div class="pbe-skeleton" style="height:520px"></div>'; return; }
    $('#dk-g-title', root).textContent = `${g.teams?.away?.abbrev || 'TBD'} @ ${g.teams?.home?.abbrev || 'TBD'} · who is in net`;
    body.innerHTML = focusMarkup(g, state.store.get(String(focusId)));
  };
  const render = () => (focusId ? renderFocus() : renderSlate());

  async function loadIntel(id, signal) {
    const e = entryFor(id);
    try {
      const res = await intel(`/game/${id}`, { signal });
      e.intel = { data: res.data, meta: res.meta, tier: res.tier, failed: false, at: Date.now() };
    } catch (error) {
      if (error.kind === 'aborted' || signal.aborted) return;
      e.intel = e.intel?.data ? { ...e.intel, failed: true, at: Date.now() } : { data: null, error, failed: true, at: Date.now() };
    }
  }
  async function loadLive(id, signal) {
    const e = entryFor(id);
    try {
      const res = await intel(`/goalies/live/${id}`, { signal, tier: 'free' });
      e.live = { data: res.data, meta: res.meta, failed: false, at: Date.now() };
    } catch (error) {
      if (error.kind === 'aborted' || signal.aborted) return;
      e.live = e.live?.data ? { ...e.live, failed: true } : { data: null, error, failed: true };
    }
  }
  const intelDue = g => {
    const e = state.store.get(String(g.id));
    if (!e?.intel) return true;
    const st = metricsState(g);
    if (st === 'FINAL') return !e.intel.data;
    return Date.now() - (e.intel.at || 0) > (st === 'LIVE' ? INTEL_LIVE_MS : INTEL_PRE_MS);
  };
  const liveDue = g => {
    const st = metricsState(g);
    if (st === 'LIVE') return true;
    return st === 'FINAL' && !state.store.get(String(g.id))?.live?.data;
  };
  const nextDelay = games => (games.some(g => LIVEISH.has(semOf(g))) ? LIVE_MS
    : state.date === todayET() && games.some(g => PREISH.has(semOf(g))) ? INTEL_PRE_MS : null);

  async function resolveDate(signal) {
    if (state.date) { state.resolved = true; return; }
    const today = await ctx.board(todayET(), { signal });
    if (today.data.games?.length) { state.date = todayET(); state.slateNote = 'Today'; }
    else if (today.data.next_puck_drop?.date) { state.date = today.data.next_puck_drop.date; state.slateNote = 'Next slate'; }
    else state.date = todayET();
    state.resolved = true;
  }

  const slatePoller = focusId ? null : createPoller(async signal => {
    if (!state.resolved) await resolveDate(signal);
    const res = await ctx.board(state.date, { signal, maxAgeMs: 15000 });
    state.board = res.data; state.boardMeta = res.meta; state.boardFailed = false; state.boardError = null;
    state.games = res.data.games || [];
    state.limited = (await dataLayer()) === 'legacy';
    renderTools(); renderSlate();
    if (state.limited) return null;
    await pool(state.games.filter(liveDue), 4, async g => { await loadLive(g.id, signal); if (!signal.aborted) renderSlate(); });
    pool(state.games.filter(intelDue), 2, async g => { await loadIntel(g.id, signal); if (!signal.aborted) renderSlate(); }).catch(() => {});
    return nextDelay(state.games);
  }, { onError(error) { state.boardError = error; state.boardFailed = Boolean(state.board); renderTools(); renderSlate(); return error.kind === 'not_deployed' || error.kind === 'legacy' ? null : 15000; } });

  const focusPoller = focusId ? createPoller(async signal => {
    const e = entryFor(focusId);
    const g0 = state.focusGame;
    const tasks = [];
    if (!g0 || liveDue(g0)) tasks.push(loadLive(focusId, signal));
    if (!g0 || intelDue(g0)) tasks.push(loadIntel(focusId, signal));
    await Promise.all(tasks);
    const ig = e.intel?.data?.game; const lg = e.live?.data?.game;
    // Game header: the live lane's state is fresher than the intelligence build.
    const base = ig ? { ...ig, status: lg?.status || { semantics: ig.state } } : lg ? { ...lg } : null;
    if (base) {
      state.focusGame = { ...base, teams: { away: { abbrev: ig?.teams?.away?.abbrev || lg?.teams?.away?.abbrev }, home: { abbrev: ig?.teams?.home?.abbrev || lg?.teams?.home?.abbrev } } };
    }
    renderTools(); renderFocus();
    if (state.focusGame?.date && !state.pickGames.length) {
      ctx.board(state.focusGame.date, { signal: ctl.signal }).then(b => {
        state.pickGames = b.data.games || [];
        const live = state.pickGames.find(x => String(x.id) === String(focusId));
        if (live) state.focusGame = { ...state.focusGame, ...live, teams: { ...live.teams } };
        renderTools(); renderFocus();
      }).catch(() => {});
    }
    return state.focusGame ? nextDelay([state.focusGame]) : 15000;
  }, { onError(error) { state.boardError = error; renderFocus(); return 15000; } }) : null;

  intel('/goalies/league', { signal: ctl.signal, tier: 'free' })
    .then(res => { state.league = { data: res.data, meta: res.meta }; })
    .catch(error => { if (error.kind !== 'aborted') state.league = { data: null, error }; })
    .finally(() => { if (!ctl.signal.aborted) renderLeague(); });

  renderTools(); render(); renderLeague();
  slatePoller?.start(); focusPoller?.start();

  const setDate = date => {
    if (!YMD.test(date || '') || focusId) return;
    state.date = date; state.resolved = true; state.slateNote = date === todayET() ? 'Today' : '';
    state.board = null; state.boardError = null; state.games = []; state.store.clear();
    history.replaceState(null, '', `#/goalies?date=${date}`);
    renderTools(); renderSlate(); slatePoller?.refresh();
  };
  const disposers = [
    on(root, 'click', '[data-shift]', (_, btn) => setDate(addDays(state.date || todayET(), Number(btn.dataset.shift)))),
    on(root, 'click', '[data-goto]', (_, btn) => setDate(btn.dataset.goto)),
    on(root, 'change', '#dk-g-date', (_, input) => setDate(input.value)),
    on(root, 'click', '[data-gc-sort]', (_, b) => { state.sort = b.dataset.gcSort; renderLeague(); }),
    on(root, 'click', '[data-gc-mings]', (_, b) => { state.minGs = Number(b.dataset.gcMings) || 0; renderLeague(); })
  ];
  return () => { slatePoller?.stop(); focusPoller?.stop(); ctl.abort(); disposers.forEach(d => d()); };
}
