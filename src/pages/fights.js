// Fights — the documented fight ledger.
//
// A fight here is a pair of opposing fighting majors in the official NHL play
// stream. The NHL never declares a winner: a result is shown only when the
// HockeyFights fan vote exists for that exact fight, and it is always labelled
// FAN VOTE · NOT OFFICIAL. PBE Fight Score is built only from those fan-vote
// decisions (no decision, no score). Post-fight windows count recorded events
// in fixed game-time windows around the fight: descriptive, not causal.
import { $, esc, on } from '../lib/dom.js';
import { describeError } from '../lib/api.js';
import { intel } from '../lib/intel.js';
import { freshStamp } from '../lib/freshness.js';
import { dateLabel } from '../lib/format.js';
import { teamAccent } from '../lib/teams.js';
import { teamMark } from '../components/game.js';
import { DASH, fmtScore, versionTag } from '../components/intel-ui.js';

const mark = (abbrev, size = 22) => teamMark({ abbrev }, size).replace(/ alt="[^"]*"/, ' alt=""');
const TYPES = [['2', 'Regular season + playoffs'], ['3', 'Playoffs'], ['1', 'Preseason'], ['all', 'All games']];

function seasonsAround(now = new Date()) {
  const y = now.getUTCFullYear(); const m = now.getUTCMonth() + 1;
  const start = m >= 7 ? y : y - 1;
  return [`${start}${start + 1}`, `${start - 1}${start}`];
}
const seasonLabel = s => `${s.slice(0, 4)}–${s.slice(6, 8)}`;

function resultLine(f) {
  const r = f.result;
  if (r?.status === 'available') {
    return `<span class="ft-result"><b class="gold">FAN VOTE · NOT OFFICIAL</b> · ${esc(r.winner_name)}${Number.isFinite(r.winner_pct) ? ` ${esc(r.winner_pct)}%` : ''} · ${esc(r.vote_count)} votes${Number.isFinite(r.rating) ? ` · rating ${esc(r.rating)}/10` : ''}</span>`;
  }
  return '<span class="ft-result">No fan-vote result — the NHL does not declare fight winners.</span>';
}

function momentumTable(f) {
  const m = f.momentum;
  if (!m?.available) return `<p class="micro faint">Post-fight window unavailable${m?.reason ? ` — ${esc(m.reason)}` : ''}.</p>`;
  const a = f.teams?.away || 'Away'; const h = f.teams?.home || 'Home';
  const row = (label, k) => `<tr><td>${esc(label)}</td><td>${m.pre.away[k]}</td><td>${m.pre.home[k]}</td><td>${m.post.away[k]}</td><td>${m.post.home[k]}</td></tr>`;
  return `<details><summary class="micro gold">5:00 before / after (descriptive, not causal)</summary>
    <table class="pbe-table ft-mom"><thead><tr><th></th><th>${esc(a)} pre</th><th>${esc(h)} pre</th><th>${esc(a)} post</th><th>${esc(h)} post</th></tr></thead>
    <tbody>${row('Shot attempts', 'attempts')}${row('Shots on goal', 'shots_on_goal')}${row('Goals', 'goals')}${row('Penalties', 'penalties')}</tbody></table>
    <p class="micro faint">${esc(m.semantics)} Pre window ${Math.round(m.pre_window_s / 60)} min, post window ${Math.round(m.post_window_s / 60)} min${m.truncated ? ' (truncated by a period/game boundary)' : ''}.</p></details>`;
}

function fightCard(f) {
  const [a, b] = f.fighters || [];
  const winner = f.result?.status === 'available' ? String(f.result.winner_name || '').toLowerCase() : '';
  const who = p => {
    const last = String(p?.name || '').toLowerCase().split(' ').pop();
    const isW = winner && last && winner.split(' ').pop() === last;
    return `<div class="ft-fighter${isW ? ' is-fan-winner' : ''}" style="--fight-team:${teamAccent(p?.team_abbrev)}">
      <span class="micro mono">${mark(p?.team_abbrev)} ${esc(p?.team_abbrev || '')}</span>
      ${p?.player_id ? `<a href="#/player/${esc(p.player_id)}"><b>${esc(p.name || 'Unknown')}</b></a>` : `<b>${esc(p?.name || 'Unknown')}</b>`}
      <span class="micro faint">${esc(p?.penalty_minutes ?? DASH)} PIM</span></div>`;
  };
  return `<article class="ft-card">
    <div class="micro dim">${esc(dateLabel(f.date))} · ${esc(f.teams?.away || '')} @ ${esc(f.teams?.home || '')} · P${esc(f.period)} ${esc(f.clock || '')} · <a class="gold" href="#/cast/${esc(f.game_id)}">PBE Cast</a></div>
    <div class="ft-card__vs">${who(a)}<span class="ft-vs">vs</span>${who(b)}</div>
    ${resultLine(f)}
    ${momentumTable(f)}
  </article>`;
}

function fighterRows(list, sort) {
  const rows = [...list].sort(sort === 'active'
    ? (x, y) => y.fights - x.fights || (y.score ?? -1) - (x.score ?? -1)
    : (x, y) => (y.score ?? -1) - (x.score ?? -1) || y.fights - x.fights).slice(0, 40);
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Fighter leaderboard"><table class="pbe-table">
    <thead><tr><th>#</th><th>Fighter</th><th class="num">Fights</th><th class="num">Fan-vote W-L-D</th><th class="num">Undecided</th><th class="num">Avg votes</th><th class="num">Fight Score</th><th class="num">Opp. score</th><th class="num">Fight PIM</th><th>Last</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr><td class="mono">${i + 1}</td><td><a href="#/player/${esc(r.player_id)}">${esc(r.name)}</a> <span class="faint mono">${esc(r.team || '')}</span></td>
      <td class="num">${esc(r.fights)}</td><td class="num">${r.record.w}-${r.record.l}-${r.record.d}</td><td class="num">${esc(r.record.undecided)}</td>
      <td class="num">${r.avg_votes ?? DASH}</td><td class="num"><b>${fmtScore(r.score, 1)}</b>${r.provisional ? ' <span class="faint" title="Fewer than 3 fan-vote decisions">·p</span>' : ''}</td>
      <td class="num">${r.avg_opponent_score ?? DASH}</td><td class="num">${esc(r.fighting_pim)}</td><td class="mono">${esc(r.last_fight_date || DASH)}</td></tr>`).join('')}</tbody></table></div>`;
}

function teamRows(teams) {
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Team fight activity"><table class="pbe-table">
    <thead><tr><th>Team</th><th class="num">Fights</th><th class="num">Games with a fight</th><th class="num">Fighters</th><th class="num">Fan-vote W-L-D</th><th class="num" title="Average change in shot-attempt differential, post window minus pre window">Post-fight attempt swing*</th></tr></thead>
    <tbody>${teams.map(t => `<tr><td>${mark(t.team)} <a href="#/team/${esc(t.team)}">${esc(t.team)}</a></td><td class="num">${t.fights}</td><td class="num">${t.games_with_fights}</td><td class="num">${t.distinct_fighters}</td><td class="num">${t.fan_vote_record.w}-${t.fan_vote_record.l}-${t.fan_vote_record.d}</td><td class="num">${t.post_fight_attempt_swing === null ? DASH : `${t.post_fight_attempt_swing > 0 ? '+' : ''}${t.post_fight_attempt_swing}`}</td></tr>`).join('')}</tbody></table></div>
    <p class="micro faint">* Descriptive, not causal: the average change in the team's shot-attempt differential between the 5:00 before and the 5:00 after its fights. It does not show that fighting changes play.</p>`;
}

export function mount(root, params) {
  const seasons = seasonsAround();
  const state = { season: seasons.includes(params.season) ? params.season : seasons[0], type: TYPES.some(([k]) => k === params.type) ? params.type : '2', sort: 'score', data: null, meta: null, error: null };
  const ctl = new AbortController();
  root.innerHTML = `<section class="wrap section">
    <div class="section-head section-head--editorial">
      <div><span class="eyebrow">Intelligence · Documented fights</span><h2>Fights</h2></div>
      <p>Every fight paired from opposing fighting majors in the official NHL play-by-play. Results come only from the HockeyFights fan vote and are never official — the NHL does not declare fight winners.</p>
    </div>
    <div id="ft-tools"></div>
    <div id="ft-body"><div class="pbe-skeleton" style="height:420px"></div></div>
  </section>`;
  const tools = $('#ft-tools', root); const body = $('#ft-body', root);

  const renderTools = () => {
    tools.innerHTML = `<div class="iq-head">
      <div class="iq-tabs" role="group" aria-label="Season">${seasons.map(s => `<button type="button" class="chip${state.season === s ? ' is-active' : ''}" aria-pressed="${state.season === s}" data-season="${s}">${seasonLabel(s)}</button>`).join('')}</div>
      <div class="iq-tabs" role="group" aria-label="Games">${TYPES.map(([k, l]) => `<button type="button" class="chip${state.type === k ? ' is-active' : ''}" aria-pressed="${state.type === k}" data-type="${k}">${esc(l)}</button>`).join('')}</div>
      ${state.data ? freshStamp(state.meta, { label: 'Fight ledger' }) : ''}
      ${versionTag('pbe-fight-score-v1.0')}
    </div>`;
  };

  const renderBody = () => {
    if (state.error && !state.data) {
      const e = describeError(state.error);
      body.innerHTML = state.error.status === 404
        ? `<div class="iq-na"><b>No fight ledger for ${esc(seasonLabel(state.season))} yet.</b><span>The ledger starts when the season's first completed game is processed.</span></div>`
        : `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`;
      return;
    }
    if (!state.data) { body.innerHTML = '<div class="pbe-skeleton" style="height:420px"></div>'; return; }
    const d = state.data;
    const total = d.totals?.fights ?? 0;
    const scored = (d.fighters || []).filter(r => Number.isFinite(r.score));
    body.innerHTML = `
      <div class="gx-strip"><b class="mono">${esc(total)}</b> documented fights · <b class="mono">${esc(d.totals?.fan_vote_results ?? 0)}</b> with a fan-vote result · ${esc(d.totals?.games_processed ?? 0)} games processed${d.scanned_through ? ` through ${esc(d.scanned_through)}` : ''}</div>
      ${total ? `
      <section class="dk-sub"><div class="section-head"><div><span class="eyebrow">Leaderboard</span><h2>Fighters</h2></div>
        <div class="iq-tabs"><button type="button" class="chip${state.sort === 'score' ? ' is-active' : ''}" data-sort="score">By Fight Score</button><button type="button" class="chip${state.sort === 'active' ? ' is-active' : ''}" data-sort="active">Most fights</button></div></div>
        <p class="iq-note">PBE Fight Score is the fan-vote result share (win 1, draw ½, loss 0), each fight weighted by its vote count (full weight at 30 votes; fewer than 5 votes = undecided) and shrunk toward 50 by three neutral pseudo-fights. ${scored.length} fighters have at least one decision; ·p marks fewer than three.</p>
        ${fighterRows(d.fighters || [], state.sort)}</section>
      <section class="dk-sub"><div class="section-head"><div><span class="eyebrow">Teams</span><h2>Team fight activity</h2></div></div>${teamRows(d.teams || [])}</section>
      <section class="dk-sub"><div class="section-head"><div><span class="eyebrow">Ledger</span><h2>Recent fights</h2></div></div><div class="ft-cards">${(d.recent || []).slice(0, 24).map(fightCard).join('')}</div></section>`
      : `<div class="iq-na"><b>No fights recorded for this selection.</b><span>Nothing is shown rather than something invented.</span></div>`}`;
  };

  async function load() {
    try {
      const res = await intel('/fights', { params: { season: state.season, game_type: state.type }, signal: ctl.signal, tier: 'free' });
      state.data = res.data; state.meta = res.meta; state.error = null;
    } catch (error) {
      if (error.kind === 'aborted') return;
      state.data = null; state.error = error;
    }
    renderTools(); renderBody();
  }

  const disposers = [
    on(root, 'click', '[data-season]', (_, b) => { state.season = b.dataset.season; state.data = null; renderTools(); renderBody(); load(); }),
    on(root, 'click', '[data-type]', (_, b) => { state.type = b.dataset.type; state.data = null; renderTools(); renderBody(); load(); }),
    on(root, 'click', '[data-sort]', (_, b) => { state.sort = b.dataset.sort; renderBody(); })
  ];
  renderTools();
  load();
  return () => { ctl.abort(); disposers.forEach(d => d()); };
}
