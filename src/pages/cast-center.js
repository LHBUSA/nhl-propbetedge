// PBE Cast command center: every game on a slate in one view. Board state
// for all games; the full cast payload only for live games (<= 6, 15 s) and
// once for finals (<= 8) so each tile shows real attempt share, the last
// event and manpower. Slate scout ranks real recent activity only.
import { $, esc, on } from '../lib/dom.js';
import { describeError, nhl } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { dateLabel, periodLabel, share, pct, todayET } from '../lib/format.js';
import { createPoller } from '../lib/poll.js';
import { teamAccent } from '../lib/teams.js';
import { stateBadge, stateOf, teamMark } from '../components/game.js';
import { watchButton } from '../components/alerts-ui.js';

const LIVE = new Set(['LIVE', 'INTERMISSION']);

function recent(plays, seconds, side) {
  const shots = plays.filter(p => p.shot && !p.shot.shootout && Number.isFinite(p.elapsed_s));
  const end = Math.max(0, ...plays.map(p => p.elapsed_s || 0));
  return shots.filter(p => p.side === side && p.elapsed_s > end - seconds).length;
}

function lastEvent(plays, final = false) {
  const kinds = final ? ['goal'] : ['goal', 'shot-on-goal', 'penalty', 'missed-shot', 'blocked-shot', 'faceoff', 'hit', 'period-start', 'period-end'];
  const p = [...plays].reverse().find(x => kinds.includes(x.type) && x.period_type !== 'SO');
  if (!p) return null;
  const who = p.players?.find(x => ['scorer', 'shooter', 'committed_by', 'faceoff_winner', 'hitter'].includes(x.role));
  const label = { goal: 'Goal', 'shot-on-goal': 'Shot on goal', penalty: 'Penalty', 'missed-shot': 'Missed shot', 'blocked-shot': 'Blocked shot', faceoff: 'Faceoff', hit: 'Hit', 'period-start': 'Period start', 'period-end': 'Period end' }[p.type];
  return `${periodLabel(p.period, p.period_type)} ${p.time_in_period || ''} · ${label}${who?.name ? ` — ${who.name}` : ''}`;
}

function tile(g, cast) {
  const st = stateOf(g);
  const a = g.teams.away; const h = g.teams.home;
  const scored = ['LIVE', 'INTERMISSION', 'FINAL'].includes(st.key);
  const t = cast?.totals?.teams;
  const cf = t ? share(t.away.corsi, t.home.corsi) : null;
  const m = cast?.manpower;
  const man = m && (m.away_skaters !== m.home_skaters || !m.away_goalie_in_net || !m.home_goalie_in_net) ? `${m.away_skaters}v${m.home_skaters}` : null;
  const last = cast ? lastEvent(cast.plays, st.key === 'FINAL') : null;
  return `<article class="ctile" data-state="${esc(st.key)}" style="--away:${teamAccent(a.abbrev)};--home:${teamAccent(h.abbrev)}">
    <header class="ctile__head">${stateBadge(g)}${man ? `<span class="manpower">${esc(man)}</span>` : ''}${LIVE.has(st.key) || st.key === 'SCHEDULED' || st.key === 'PREGAME' ? watchButton(g.id, true) : ''}</header>
    <a class="ctile__body" href="#/cast/${esc(g.id)}">
      ${[['away', a], ['home', h]].map(([side, team]) => `<div class="ctile__team">${teamMark(team, 28)}<b>${esc(team.abbrev)}</b>
        ${scored ? `<span class="ctile__sog mono">${team.sog ?? '—'} SOG</span><span class="ctile__score mono">${team.score ?? '—'}</span>` : ''}
        ${cast && LIVE.has(st.key) ? `<span class="ctile__recent mono" title="Shot attempts in the last 5 minutes of game time">${recent(cast.plays, 300, side)} att/5m</span>` : ''}</div>`).join('')}
    </a>
    ${cf !== null ? `<div class="ctile__cf"><span class="micro">Attempts ${esc(a.abbrev)} ${pct(cf, 0)}</span><span class="cmp-bar"><i class="a" style="width:${(cf * 100).toFixed(1)}%"></i><i class="h" style="width:${((1 - cf) * 100).toFixed(1)}%"></i></span></div>` : ''}
    ${last ? `<p class="ctile__last">${st.key === 'FINAL' ? '<span class="micro">Last goal</span> ' : ''}${esc(last)}</p>` : ''}
  </article>`;
}

function scout(games, casts) {
  const live = games.filter(g => LIVE.has(stateOf(g).key) && casts.get(String(g.id)));
  if (!live.length) return '';
  const rows = [];
  for (const g of live) {
    const c = casts.get(String(g.id));
    for (const side of ['away', 'home']) rows.push({ g, side, n: recent(c.plays, 300, side), team: g.teams[side].abbrev });
  }
  rows.sort((x, y) => y.n - x.n);
  const pp = live.filter(g => { const m = casts.get(String(g.id))?.manpower; return m && m.away_skaters !== m.home_skaters; });
  return `<div class="scout">
    <span class="eyebrow">Slate scout · last 5 min of game time</span>
    <div class="scout__row">${rows.slice(0, 4).map(r => `<a href="#/cast/${esc(r.g.id)}" class="scout__item"><b class="mono">${r.n}</b><span>${esc(r.team)} attempts</span></a>`).join('')}
      ${pp.map(g => `<a href="#/cast/${esc(g.id)}" class="scout__item scout__item--pp"><b class="mono">PP</b><span>${esc(g.teams.away.abbrev)} @ ${esc(g.teams.home.abbrev)}</span></a>`).join('')}</div>
  </div>`;
}

export function mountCenter(root, params, ctx) {
  const state = { date: /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : todayET(), board: null, meta: null, failed: false, error: null, casts: new Map() };
  root.innerHTML = `<section class="wrap section cast" data-fresh-scope>
    <div class="section-head"><div><span class="eyebrow">PBE Cast · Command center</span><h2 id="cc-title">Every game, one screen</h2></div>
      <p>Score, shots, manpower and the latest event for the whole slate. Open any game for the full broadcast.</p></div>
    <div class="cc-tools"><a class="pbe-btn pbe-btn--sm" href="#/cast">Single game</a>
      <label class="micro" for="cc-date">Slate date</label><input id="cc-date" class="datenav__input" type="date" value="${esc(state.date)}"><span id="cc-fresh"></span></div>
    <div id="cc-scout"></div>
    <div id="cc-grid" class="cc-grid"></div>
  </section>`;

  const render = () => {
    $('#cc-title', root).textContent = `${dateLabel(state.date, { long: true })}`;
    $('#cc-fresh', root).innerHTML = state.board ? freshStamp(state.meta, { failed: state.failed }) : '';
    const games = state.board?.games || [];
    $('#cc-scout', root).innerHTML = scout(games, state.casts);
    $('#cc-grid', root).innerHTML = state.error && !state.board
      ? `<div class="pbe-error"><strong>${esc(describeError(state.error).title)}</strong>${esc(describeError(state.error).body)}</div>`
      : !state.board ? '<div class="pbe-skeleton" style="height:180px"></div>'.repeat(4)
        : games.length ? games.map(g => tile(g, state.casts.get(String(g.id)))).join('')
          : `<div class="pbe-empty"><h3>No games on ${esc(dateLabel(state.date, { long: true }))}.</h3><p>${state.board.next_puck_drop ? `Next slate: ${esc(dateLabel(state.board.next_puck_drop.date, { long: true }))}. <button class="pbe-btn pbe-btn--sm" data-cc-date="${esc(state.board.next_puck_drop.date)}">Open it</button>` : ''}</p></div>`;
  };

  const loadedFinals = new Set();
  const poller = createPoller(async signal => {
    const res = await ctx.board(state.date, { signal, maxAgeMs: 8000 });
    state.board = res.data; state.meta = res.meta; state.failed = false; state.error = null;
    const games = res.data.games || [];
    const live = games.filter(g => LIVE.has(stateOf(g).key)).slice(0, 6);
    const finals = games.filter(g => stateOf(g).key === 'FINAL' && !loadedFinals.has(String(g.id))).slice(0, 8);
    await Promise.all([...live, ...finals].map(async g => {
      try {
        const c = await nhl(`/nhl/game/${g.id}/cast`, {}, { signal, timeout: 12000 });
        state.casts.set(String(g.id), c.data);
        if (stateOf(g).key === 'FINAL') loadedFinals.add(String(g.id));
      } catch (error) {
        if (error.kind === 'aborted') throw error;
      }
    }));
    render();
    return live.length ? 15000 : 60000;
  }, {
    onError(error) {
      state.error = error; state.failed = Boolean(state.board);
      render();
      return error.kind === 'not_deployed' || error.kind === 'legacy' ? null : 10000;
    }
  });
  render();
  poller.start();

  const setDate = d => { state.date = d; state.board = null; state.casts = new Map(); loadedFinals.clear(); history.replaceState(null, '', `#/cast?view=all&date=${d}`); render(); poller.refresh(); };
  const disposers = [
    on(root, 'change', '#cc-date', (_, i) => { if (/^\d{4}-\d{2}-\d{2}$/.test(i.value)) setDate(i.value); }),
    on(root, 'click', '[data-cc-date]', (_, b) => setDate(b.dataset.ccDate))
  ];
  return () => { poller.stop(); disposers.forEach(d => d()); };
}
