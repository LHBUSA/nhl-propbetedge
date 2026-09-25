// Roster Fatigue Intelligence.
//
// Schedule facts (rest days, back-to-back, 3-in-4, 4-in-6, road streak, venue
// time-zone change) are free. The PBE Fatigue Score (team, 0-100, higher =
// more burden), its points table and player ice-time fatigue are NHL Pro.
// This is a burden index built from sourced schedule and ice-time facts — not
// a medical assessment, and it does not claim fatigue causes any result.
// Travel distance is not shown: no integrated source carries venue coordinates.
import { $, esc, on } from '../lib/dom.js';
import { describeError } from '../lib/api.js';
import { intel, onTierChange } from '../lib/intel.js';
import { freshStamp } from '../lib/freshness.js';
import { addDays, dateLabel, dayET, timeET, todayET } from '../lib/format.js';
import { teamMark } from '../components/game.js';
import { edgeLine, fatigueChips, fmtScore, lockPanel, mmss, pointComponents, scoreRing, versionTag } from '../components/intel-ui.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const mark = (abbrev, size = 28) => teamMark({ abbrev }, size).replace(/ alt="[^"]*"/, ' alt=""');

function sideMarkup(side, row, full, tier) {
  const t = row?.[side];
  if (!t) return '';
  const fullSide = full?.sides?.[side];
  const pro = tier === 'pro' && fullSide && !fullSide.fatigue?.locked;
  const players = pro && Array.isArray(fullSide.player_fatigue) ? fullSide.player_fatigue.filter(p => Number.isFinite(p.score)).slice(0, 5) : [];
  return `<div class="fg-side">
    <div class="fg-side__head">${mark(t.team)}<b>${esc(t.team)}</b><span class="micro">${side === 'away' ? 'Away' : 'Home'}</span>
      <span class="fg-side__score">${pro ? scoreRing(fullSide.fatigue.score, { label: `${t.team} fatigue`, size: 58, inverse: true, caption: 'Fatigue' }) : tier === 'pro' && Number.isFinite(t.fatigue_score) ? scoreRing(t.fatigue_score, { label: `${t.team} fatigue`, size: 58, inverse: true, caption: 'Fatigue' }) : ''}</span></div>
    ${fatigueChips(t.fatigue_facts)}
    ${pro ? `<details><summary class="micro gold">Points table</summary>${pointComponents(fullSide.fatigue.components)}</details>
      ${players.length ? `<div><span class="micro">Heaviest individual loads (last dressed lineup)</span><table class="pbe-table fg-players"><thead><tr><th>Player</th><th class="num">TOI L3</th><th class="num">vs season</th><th class="num">Score</th></tr></thead><tbody>${players.map(p => `<tr><td><a href="#/player/${esc(p.id)}">${esc(p.name)}</a> <span class="faint">${esc(p.position || '')}</span></td><td class="num">${esc(mmss(p.facts?.toi_last3_s))}</td><td class="num">${Number.isFinite(p.facts?.toi_vs_season) ? `${Math.round(p.facts.toi_vs_season * 100)}%` : '—'}</td><td class="num">${fmtScore(p.score)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="micro faint">No skater has three recent games on record yet (player fatigue needs 3 appearances in 21 days).</p>'}` : ''}
  </div>`;
}

function gameMarkup(row, full, tier) {
  if (row.pending) {
    return `<article class="fg-game" data-game="${esc(row.game_id)}"><div class="fg-game__head"><b class="mono">${esc(row.game_id)}</b><span class="micro">Computing…</span></div><div class="pbe-skeleton" style="height:120px"></div></article>`;
  }
  const g = row.game;
  const teams = { away: { abbrev: g.teams.away.abbrev }, home: { abbrev: g.teams.home.abbrev } };
  return `<article class="fg-game" data-game="${esc(row.game_id)}">
    <div class="fg-game__head">
      <b>${esc(g.teams.away.abbrev)} @ ${esc(g.teams.home.abbrev)}</b>
      <span class="mono dim">${esc(dayET(g.start_time_utc))} · ${esc(timeET(g.start_time_utc))}</span>
      ${g.game_type === 1 ? '<span class="pbe-badge pbe-badge--sched">Preseason</span>' : ''}
      <a class="dk-link" href="#/matchup/${esc(row.game_id)}">Game intelligence</a>
    </div>
    <div class="fg-sides">${sideMarkup('away', row, full, tier)}${sideMarkup('home', row, full, tier)}</div>
    ${tier === 'pro' && row.edges?.fatigue ? `<div class="gx-strip">${edgeLine(row.edges.fatigue, teams)}</div>` : ''}
  </article>`;
}

export function mount(root, params, ctx) {
  const state = { date: YMD.test(params.date || '') ? params.date : null, tier: null, slate: null, meta: null, error: null, full: new Map() };
  const ctl = new AbortController();
  root.innerHTML = `<section class="wrap section">
    <div class="section-head section-head--editorial">
      <div><span class="eyebrow">Intelligence · Roster fatigue</span><h2>Fatigue</h2></div>
      <p>Who is carrying the heavier schedule and ice-time load into tonight. Schedule facts come from the NHL schedule and box scores. The PBE Fatigue Score is a transparent burden index — not a medical assessment, and not a claim that fatigue decides games.</p>
    </div>
    <div id="fg-tools"></div>
    <div id="fg-body"><div class="pbe-skeleton" style="height:360px"></div></div>
    <p class="micro faint" style="margin-top:18px">Travel distance is not shown: no integrated source carries verified venue coordinates. The time-zone change comes from each venue's UTC offset in the NHL schedule. Points table: <a class="gold" href="#/methodology?section=fatigue">Methodology › Fatigue</a>.</p>
  </section>`;
  const tools = $('#fg-tools', root); const body = $('#fg-body', root);

  const renderTools = () => {
    const date = state.date || todayET();
    tools.innerHTML = `<div class="iq-head">
      <div class="datenav" role="group" aria-label="Choose date">
        <button class="pbe-btn pbe-btn--sm" data-shift="-1" aria-label="Previous day">‹</button>
        <button class="pbe-btn pbe-btn--sm${date === todayET() ? ' is-current' : ''}" data-goto="${todayET()}">Today</button>
        <button class="pbe-btn pbe-btn--sm" data-shift="1" aria-label="Next day">›</button>
        <b style="margin-left:8px">${esc(dateLabel(date, { long: true }))}</b>
      </div>
      ${state.slate ? freshStamp(state.meta, { label: 'Slate' }) : ''}
      ${versionTag('pbe-fatigue-team-v1.0')}
    </div>
    ${state.tier === 'free' ? lockPanel('PBE Fatigue Score, the points table and player ice-time fatigue', 'Free shows every schedule fact. NHL Pro adds the 0–100 team burden score, each component\'s points, the fatigue edge per game and the heaviest individual ice-time loads.', { compact: true }) : ''}`;
  };

  const renderBody = () => {
    if (state.error && !state.slate) { const e = describeError(state.error); body.innerHTML = `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`; return; }
    if (!state.slate) { body.innerHTML = '<div class="pbe-skeleton" style="height:360px"></div>'; return; }
    const games = state.slate.games || [];
    if (!games.length) { body.innerHTML = `<div class="pbe-empty"><h3>No NHL games on ${esc(dateLabel(state.date, { long: true }))}.</h3></div>`; return; }
    body.innerHTML = `<div class="iq-grid">${games.map(r => gameMarkup(r, state.full.get(String(r.game_id)), state.tier)).join('')}</div>`;
  };

  async function loadGame(id) {
    try {
      const res = await intel(`/game/${id}`, { signal: ctl.signal });
      state.full.set(String(id), res.data);
      const idx = (state.slate?.games || []).findIndex(g => String(g.game_id) === String(id));
      if (idx >= 0 && state.slate.games[idx].pending) {
        const d = res.data;
        const side = s => ({ team: d.sides[s].team, starter: d.sides[s].starter, fatigue_facts: d.sides[s].fatigue.facts, fatigue_score: d.sides[s].fatigue.score ?? null });
        state.slate.games[idx] = { game_id: d.game_id, game: d.game, away: side('away'), home: side('home'), edges: res.tier === 'pro' ? d.edges : null };
      }
    } catch (error) {
      if (error.kind === 'aborted') return;
    }
    if (!ctl.signal.aborted) renderBody();
  }

  async function load() {
    const date = state.date || todayET();
    try {
      if (!state.date) {
        const b = await ctx.board(todayET(), { signal: ctl.signal });
        state.date = b.data.games?.length ? todayET() : (b.data.next_puck_drop?.date || todayET());
      }
      const res = await intel('/slate', { params: { date: state.date }, signal: ctl.signal });
      state.tier = res.tier; state.slate = res.data; state.meta = res.meta; state.error = null;
    } catch (error) {
      if (error.kind === 'aborted') return;
      state.error = error;
    }
    renderTools(); renderBody();
    // Pending games and Pro detail: fetch game intelligence two at a time.
    const ids = (state.slate?.games || []).filter(g => g.pending || state.tier === 'pro').map(g => g.game_id);
    let i = 0;
    const lane = async () => { while (i < ids.length && !ctl.signal.aborted) await loadGame(ids[i++]); };
    await Promise.all([lane(), lane()]);
    void date;
  }

  const setDate = d => { if (!YMD.test(d || '')) return; state.date = d; state.slate = null; state.full.clear(); history.replaceState(null, '', `#/fatigue?date=${d}`); renderTools(); renderBody(); load(); };
  const disposers = [
    on(root, 'click', '[data-shift]', (_, b) => setDate(addDays(state.date || todayET(), Number(b.dataset.shift)))),
    on(root, 'click', '[data-goto]', (_, b) => setDate(b.dataset.goto)),
    onTierChange(() => { state.slate = null; state.full.clear(); renderBody(); load(); })
  ];
  renderTools();
  load();
  return () => { ctl.abort(); disposers.forEach(d => d()); };
}
