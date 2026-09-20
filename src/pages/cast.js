import { $, esc, on } from '../lib/dom.js';
import { describeError, nhl, odds } from '../lib/api.js';
import { marketPanel } from '../components/market.js';
import { mountCenter } from './cast-center.js';
import { playerIdentity } from '../components/player.js';
import { freshStamp } from '../lib/freshness.js';
import { countdownParts, dateLabel, dayET, gameTypeLabel, num, pct, periodLabel, share, svPct, timeET, titleCase, todayET } from '../lib/format.js';
import { createPoller } from '../lib/poll.js';
import { resolveRecentCompleted } from '../lib/recent-games.js';
import { teamAccent } from '../lib/teams.js';
import { STATE, clockText, specialTeams } from '../lib/special-teams.js';
import { stateBadge, stateOf, teamMark } from '../components/game.js';
import { LAYERS, attachRinkInspector, renderRink, rinkInspector, rinkLegend, shotLabel } from '../components/rink.js';
import { SPEEDS, replayBar, seek, sliceCast } from '../components/replay.js';
import { watchButton } from '../components/alerts-ui.js';

const FEED_FILTERS = [
  ['all', 'All'], ['goal', 'Goals'], ['shots', 'Shots'], ['penalty', 'Penalties'],
  ['faceoff', 'Faceoffs'], ['hit', 'Hits'], ['other', 'Other']
];

function feedMatch(play, f) {
  if (f === 'all') return true;
  if (f === 'goal') return play.kind === 'goal';
  if (f === 'shots') return Boolean(play.shot);
  if (f === 'penalty') return play.kind === 'penalty' || play.kind === 'delayed-penalty';
  if (f === 'faceoff') return play.kind === 'faceoff';
  if (f === 'hit') return play.kind === 'hit';
  return !play.shot && !['goal', 'penalty', 'delayed-penalty', 'faceoff', 'hit'].includes(play.kind);
}

const who = (play, role) => play.players.find(p => p.role === role);
// Team abbreviation for a play's acting side (set per render in feedList).
let feedTeams = null;
const teamOf = play => (feedTeams && play.side ? feedTeams[play.side]?.abbrev : null);
const nm = p => (p?.name ? esc(p.name) : '<span class="faint">unlisted</span>');

function playText(play) {
  const s = play.shot;
  const dist = s?.distance_ft !== null && s?.distance_ft !== undefined ? `, ${s.distance_ft} ft` : '';
  const type = s?.shot_type ? esc(s.shot_type) : '';
  switch (play.type) {
    case 'goal': {
      const a1 = who(play, 'assist1'); const a2 = who(play, 'assist2');
      const assists = [a1, a2].filter(Boolean).map(nm).join(', ');
      const sc = who(play, 'scorer');
      return `${sc ? playerIdentity({ id: sc.id, name: sc.name, team: teamOf(play), size: 'xs' }) : ''}<b>GOAL</b> — ${nm(sc)}${type || dist ? ` <span class="dim">(${type}${dist})</span>` : ''}${assists ? ` · <span class="dim">A:</span> ${assists}` : ' · <span class="dim">unassisted</span>'}${s?.empty_net_against ? ' · <span class="dim">empty net</span>' : ''}`;
    }
    case 'shot-on-goal': return `Shot on goal — ${nm(who(play, 'shooter'))}${type || dist ? ` <span class="dim">(${type}${dist})</span>` : ''}${who(play, 'goalie') ? ` · saved by ${nm(who(play, 'goalie'))}` : ''}`;
    case 'missed-shot': return `Missed shot — ${nm(who(play, 'shooter'))}${s?.miss_reason ? ` <span class="dim">(${esc(titleCase(s.miss_reason))})</span>` : ''}`;
    case 'blocked-shot': return `Shot by ${nm(who(play, 'shooter'))} blocked by ${nm(who(play, 'blocker'))}`;
    case 'penalty': {
      const p = play.penalty || {};
      const mins = Number(p.duration_min);
      const dur = Number.isFinite(mins) ? `${mins}:00` : '';
      // The raw event truth is unchanged; it is simply read as a hockey event
      // rather than a database row.
      return `<b class="feed-pen">PENALTY${play.side ? ` · ${esc(feedTeams?.[play.side]?.abbrev || '')}` : ''}</b> — ${nm(who(play, 'committed_by') || who(play, 'served_by'))} · ${esc(titleCase(p.desc_key || 'penalty'))}${dur ? ` · ${esc(dur)}` : ''}${who(play, 'drawn_by') ? ` <span class="dim">· drawn by ${nm(who(play, 'drawn_by'))}</span>` : ''}${p.severity && p.severity !== 'MIN' ? ` <span class="dim">· ${esc(p.severity)}</span>` : ''}`;
    }
    case 'delayed-penalty': return `<b class="feed-pen feed-pen--delayed">DELAYED PENALTY</b>${play.side ? ` <span class="dim">· on ${esc(feedTeams?.[play.side]?.abbrev || '')}</span>` : ''}`;
    case 'faceoff': return `Faceoff won by ${nm(who(play, 'faceoff_winner'))} <span class="dim">vs ${who(play, 'faceoff_loser')?.name ? esc(who(play, 'faceoff_loser').name) : 'unlisted'}${play.zone ? ` · ${esc(play.zone)} zone` : ''}</span>`;
    case 'hit': return `${nm(who(play, 'hitter'))} hit ${nm(who(play, 'hittee'))}`;
    case 'giveaway': return `Giveaway — ${nm(who(play, 'player'))}`;
    case 'takeaway': return `Takeaway — ${nm(who(play, 'player'))}`;
    case 'stoppage': return `Stoppage <span class="dim">${esc(titleCase(play.reason || ''))}</span>`;
    case 'period-start': return `<b>Start of ${esc(periodLabel(play.period, play.period_type))}</b>`;
    case 'period-end': return `<b>End of ${esc(periodLabel(play.period, play.period_type))}</b>`;
    case 'game-end': return '<b>Game over</b>';
    case 'shootout-complete': return '<b>Shootout complete</b>';
    case 'failed-shot-attempt': return `Shootout attempt — ${nm(who(play, 'shooter'))} <span class="dim">no goal</span>`;
    default: return esc(titleCase(play.type || 'event'));
  }
}

function manpowerChip(cast) {
  const m = cast.manpower;
  const g = cast.game;
  if (!m) return '';
  const a = g.teams.away.abbrev; const h = g.teams.home.abbrev;
  const parts = [`${m.away_skaters}v${m.home_skaters}`];
  const adjA = m.away_skaters - (m.away_goalie_in_net ? 0 : 1);
  const adjH = m.home_skaters - (m.home_goalie_in_net ? 0 : 1);
  if (adjA > adjH) parts.push(`${a} power play`);
  if (adjH > adjA) parts.push(`${h} power play`);
  if (!m.away_goalie_in_net) parts.push(`${a} net empty`);
  if (!m.home_goalie_in_net) parts.push(`${h} net empty`);
  return `<span class="manpower" title="${esc(m.method)}">${esc(parts.join(' · '))}</span>`;
}

// ---- special teams
//
// cast.plays is ALREADY sliced to the replay cursor by sliceCast(), so the
// engine reconstructs the historical box simply by reading it. Nothing here
// reaches for the final game state.
function specialTeamsOf(cast) {
  return specialTeams(cast.plays || []);
}

// The centre of the score header. Even strength stays clean and says nothing.
function specialTeamsBanner(cast, st) {
  const g = cast.game;
  const abbr = side => (side ? g.teams[side]?.abbrev || side.toUpperCase() : '');
  if (st.state === STATE.DELAYED_PENALTY) {
    const adv = st.delayed?.advantaged_side;
    return `<div class="stx stx--delayed" role="status">
      <span class="stx__label">DELAYED PENALTY</span>
      ${adv ? `<span class="stx__detail">${esc(abbr(adv))} extra attacker</span>` : ''}
    </div>`;
  }
  if (st.state === STATE.FOUR_ON_FOUR) {
    return `<div class="stx stx--even" role="status">
      <span class="stx__label">4 ON 4</span>
      <span class="stx__detail">${esc(st.manpower || '')}</span>
    </div>`;
  }
  if (st.state !== STATE.POWER_PLAY && st.state !== STATE.FIVE_ON_THREE) return '';

  const adv = st.advantaged_side;
  const sh = st.shorthanded_side;
  // The clock shown is the longest-running penalty that is actually provable.
  const lead = st.active_penalties.find(x => x.side === sh && x.remaining_seconds !== null);
  const time = lead ? clockText(lead.remaining_seconds) : null;
  const seg = st.pp_segment;
  return `<div class="stx stx--pp" role="status">
      <span class="stx__label">${esc(abbr(adv))} POWER PLAY</span>
      <span class="stx__mp mono">${esc(st.manpower || '')}${time ? ` · ${esc(time)}` : ''}</span>
      ${sh ? `<span class="stx__pk">${esc(abbr(sh))} PENALTY KILL</span>` : ''}
      ${seg && (seg.attempts || seg.sog || seg.goals) ? `<span class="stx__seg micro">THIS PP · ${seg.attempts} attempt${seg.attempts === 1 ? '' : 's'} · ${seg.sog} SOG · ${seg.goals} goal${seg.goals === 1 ? '' : 's'}</span>` : ''}
    </div>`;
}

// The box rail. Cards stack per side, so 5-on-3 is two cards under one crest
// with no special case.
function penaltyBox(cast, st) {
  const box = st.active_penalties.filter(x => x.player_name || x.infraction);
  if (!box.length) return '';
  const g = cast.game;
  const sides = ['away', 'home'].filter(side => box.some(x => x.side === side));
  const card = x => {
    const total = (x.duration_min || 0) * 60;
    const pctLeft = x.remaining_seconds !== null && total ? Math.max(0, Math.min(100, (x.remaining_seconds / total) * 100)) : null;
    return `<li class="pbox__pen">
      <div class="pbox__who">
        ${x.player_id ? playerIdentity({ id: x.player_id, name: x.player_name, team: g.teams[x.side]?.abbrev, size: 'sm' }) : ''}
        <span class="pbox__name">${esc(x.player_name || 'Unknown')}</span>
      </div>
      <div class="pbox__what">
        <span>${esc(titleCase(x.infraction || 'penalty'))}</span>
        <span class="dim">${x.duration_min ? `${x.duration_min} min` : ''}${x.coincidental ? ' · coincidental' : ''}${x.affects_manpower ? '' : ' · no manpower change'}</span>
      </div>
      ${x.remaining_seconds !== null
        ? `<div class="pbox__time"><span class="mono">${esc(clockText(x.remaining_seconds))}</span><span class="micro">remaining</span>
            <div class="pbox__bar" role="presentation"><i style="width:${pctLeft.toFixed(1)}%"></i></div>
           </div>`
        : `<div class="pbox__time pbox__time--unknown"><span class="micro">time not shown</span><span class="micro dim">expiry not reconstructable here</span></div>`}
      ${x.served_by_name ? `<p class="micro dim">Served by ${esc(x.served_by_name)}</p>` : ''}
    </li>`;
  };
  return `<section class="pbox" aria-label="Penalty box">
    <h3 class="pbox__title">PENALTY BOX</h3>
    <div class="pbox__sides">
      ${sides.map(side => `<div class="pbox__side pbox__side--${side}">
          <div class="pbox__team"><b>${esc(g.teams[side]?.abbrev || side)}</b></div>
          <ul class="pbox__list">${box.filter(x => x.side === side).map(card).join('')}</ul>
        </div>`).join('')}
    </div>
  </section>`;
}

function header(cast, meta, failed) {
  const g = cast.game;
  const st = stateOf(g);
  const a = g.teams.away; const h = g.teams.home;
  const scored = ['LIVE', 'INTERMISSION', 'FINAL', 'REPLAY'].includes(st.key);
  const clock = st.key === 'LIVE' || st.key === 'INTERMISSION' || st.key === 'REPLAY'
    ? `${periodLabel(g.status.period, g.status.period_type)} · ${g.status.clock || '—'}${st.key === 'INTERMISSION' ? ' · INT' : ''}`
    : st.key === 'FINAL' ? dayET(g.start_time_utc, true) : `${dayET(g.start_time_utc)} · ${timeET(g.start_time_utc)}`;
  const gin = cast.goalies_in_net || {};
  const goalie = side => gin[side]?.name
    ? `<a class="cast-gin" href="#/player/${esc(gin[side].id)}">${playerIdentity({ id: gin[side].id, name: gin[side].name, team: g.teams[side].abbrev, size: 'sm' })}<span>${esc(gin[side].name)}</span></a>${gin[side].in_net_now === false ? ' <span class="pbe-badge pbe-badge--alert">PULLED</span>' : ''}`
    : '<span class="faint">no attempt faced yet</span>';
  const team = (t, side) => `<div class="cast-team cast-team--${side}">
      ${teamMark(t, 52)}
      <div class="cast-team__id"><b>${esc(t.abbrev || '')}</b><span>${esc(t.name || '')}</span></div>
      ${scored ? `<div class="cast-team__score mono">${t.score ?? '—'}</div>` : ''}
      <div class="cast-team__sog mono">${scored ? `${t.sog ?? '—'} <small>SOG</small>` : ''}</div>
    </div>`;
  return `<div class="cast-head" style="--away:${teamAccent(a.abbrev)};--home:${teamAccent(h.abbrev)}">
      ${team(a, 'away')}
      <div class="cast-mid">
        ${stateBadge(g, { short: true })}
        <div class="cast-clock mono">${esc(clock)}</div>
        ${specialTeamsBanner(cast, specialTeamsOf(cast)) || manpowerChip(cast)}
        ${cast.replay ? `<span class="micro">Event ${cast.replay.cursor + 1} of ${cast.replay.total} · derived from play-by-play</span>` : freshStamp(meta, { failed })}
      </div>
      ${team(h, 'home')}
    </div>
    <div class="cast-sub">
      <span><span class="micro">${esc(a.abbrev || 'Away')} in net</span> ${goalie('away')}</span>
      <span><span class="micro">${esc(h.abbrev || 'Home')} in net</span> ${goalie('home')}</span>
      <span class="micro">${esc(gameTypeLabel(g.game_type))} · ${esc(g.venue || '')} · Game ${esc(g.id)}</span>
      ${['FINAL', 'REPLAY'].includes(st.key) ? '' : watchButton(g.id)}
    </div>
    ${penaltyBox(cast, specialTeamsOf(cast))}`;
}

function pressureChart(plays, game) {
  const attempts = plays.filter(p => p.shot && !p.shot.shootout && Number.isFinite(p.elapsed_s) && p.side);
  if (!attempts.length) return '<p class="dim">Pressure appears after the first recorded shot attempt.</p>';
  const end = Math.max(3600, ...plays.map(p => p.elapsed_s || 0));
  const W = 600; const H = 120; const padX = 4; const padTop = 10; const padBottom = 4;
  const win = 300; const step = 30;
  const series = { away: [], home: [] };
  let max = 1;
  for (let t = win; t <= end + 1; t += step) {
    for (const side of ['away', 'home']) {
      const v = attempts.filter(p => p.side === side && p.elapsed_s > t - win && p.elapsed_s <= t).length;
      series[side].push([t, v]);
      if (v > max) max = v;
    }
  }
  const x = t => padX + (t / end) * (W - 2 * padX);
  const y = v => padTop + (1 - (v / max)) * (H - padTop - padBottom);
  const path = pts => pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const periods = [1200, 2400, 3600, 3900].filter(t => t < end).map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="${padTop}" y2="${H - padBottom}" class="pc-period"/>`).join('');
  const tickValues = [...new Set([max, Math.round(max / 2), 0])].sort((a, b) => b - a);
  const grid = tickValues.map(v => `<line x1="${padX}" x2="${W - padX}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="pc-grid${v === 0 ? ' pc-grid--zero' : ''}"/>`).join('');
  const scale = tickValues.map(v => `<span class="pressure-axis__tick mono" style="top:${((y(v) / H) * 100).toFixed(2)}%">${v}</span>`).join('');
  const goals = plays.filter(p => p.type === 'goal' && Number.isFinite(p.elapsed_s) && p.side)
    .map(p => `<line x1="${x(p.elapsed_s)}" x2="${x(p.elapsed_s)}" y1="${H - 14}" y2="${H}" class="pc-goal pc-goal--${p.side}"><title>${esc(shotLabel(p, game.teams))}</title></line>`).join('');
  return `<div class="pressure-shell">
      <div class="pressure-axis" aria-hidden="true">${scale}</div>
      <div class="pressure-plot">
        <span class="pressure-unit micro" aria-hidden="true">Attempts / 5 min</span>
        <svg class="pressure" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Rolling five-minute shot attempts by team. Peak ${max} attempts in a five-minute window.">
          ${grid}
          ${periods}
          <path d="${path(series.away)}" class="pc-line pc-line--away"/>
          <path d="${path(series.home)}" class="pc-line pc-line--home"/>
          ${goals}
        </svg>
      </div>
    </div>
    <div class="pressure__legend micro"><span class="sw sw--away"></span>${esc(game.teams.away.abbrev)} <span class="sw sw--home"></span>${esc(game.teams.home.abbrev)} · peak ${max} attempts / 5 min · vertical ticks = goals</div>`;
}

function cmpRow(label, a, b, fmt = v => v ?? '—') {
  const s = share(a, b);
  return `<div class="cmp-row"><span class="label"><span>${esc(label)}</span>${s !== null ? `<span class="faint">${pct(s, 0)} / ${pct(1 - s, 0)}</span>` : ''}</span>
    <span class="cmp-val">${esc(fmt(a))}</span>
    <span class="cmp-bar">${s !== null ? `<i class="a" style="width:${(s * 100).toFixed(1)}%"></i><i class="h" style="width:${((1 - s) * 100).toFixed(1)}%"></i>` : ''}</span>
    <span class="cmp-val">${esc(fmt(b))}</span></div>`;
}

function statsPanel(cast) {
  const t = cast.totals?.teams || {};
  const ev = cast.totals?.five_on_five || {};
  const g = cast.game;
  const a = t.away || {}; const h = t.home || {};
  const off = new Map((cast.official_team_stats || []).map(s => [s.category, s]));
  const offRow = (cat, label, fmt) => {
    const s = off.get(cat);
    return s ? `<tr><td>${esc(label)}</td><td class="num">${esc(fmt ? fmt(s.away) : s.away)}</td><td class="num">${esc(fmt ? fmt(s.home) : s.home)}</td></tr>` : '';
  };
  const periods = cast.totals?.by_period || [];
  const goalies = cast.boxscore?.goalies || [];
  const skaters = (cast.boxscore?.skaters || []).filter(p => (p.sog ?? 0) > 0 || (p.points ?? 0) > 0)
    .sort((x, y) => (y.sog ?? 0) - (x.sog ?? 0) || (y.points ?? 0) - (x.points ?? 0)).slice(0, 8);
  return `
    <section class="pbe-panel cast-card">
      <div class="panel-head"><h3>Shot share</h3><span class="micro shot-share__teams"><span><i class="shot-share__sw" style="--team:${teamAccent(g.teams.away.abbrev)}"></i>${esc(g.teams.away.abbrev)}</span><span><i class="shot-share__sw" style="--team:${teamAccent(g.teams.home.abbrev)}"></i>${esc(g.teams.home.abbrev)}</span></span></div>
      <div class="cmp" style="--away:${teamAccent(g.teams.away.abbrev)};--home:${teamAccent(g.teams.home.abbrev)}">
        ${cmpRow('Shot attempts (Corsi)', a.corsi, h.corsi)}
        ${cmpRow('Unblocked (Fenwick)', a.fenwick, h.fenwick)}
        ${cmpRow('Shots on goal', g.teams.away.sog ?? a.sog, g.teams.home.sog ?? h.sog)}
        ${cmpRow('5v5 attempts', ev.away?.corsi, ev.home?.corsi)}
      </div>
      <div class="danger-row">
        <span class="pbe-badge pbe-badge--heuristic">Geometric heuristic · not xG</span>
        <span class="mono">High ${a.geo_high ?? '—'} · ${h.geo_high ?? '—'}</span>
        <span class="mono">Med ${a.geo_medium ?? '—'} · ${h.geo_medium ?? '—'}</span>
      </div>
      ${(a.coords_missing || h.coords_missing) ? `<p class="micro">Coordinates missing: ${(a.coords_missing || 0) + (h.coords_missing || 0)} attempts (counted, not plotted)</p>` : ''}
    </section>
    ${periods.length ? `<section class="pbe-panel cast-card"><div class="panel-head"><h3>By period</h3><span class="micro">Attempts / SOG / goals</span></div>
      <div class="table-wrap"><table class="pbe-table"><thead><tr><th>Per</th><th class="num">${esc(g.teams.away.abbrev)} CF</th><th class="num">SOG</th><th class="num">G</th><th class="num">${esc(g.teams.home.abbrev)} CF</th><th class="num">SOG</th><th class="num">G</th></tr></thead>
      <tbody>${periods.map(p => `<tr><td>${esc(periodLabel(p.period, p.period_type))}</td><td class="num">${p.away.corsi}</td><td class="num">${p.away.sog}</td><td class="num">${p.away.goals}</td><td class="num">${p.home.corsi}</td><td class="num">${p.home.sog}</td><td class="num">${p.home.goals}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
    ${off.size ? `<section class="pbe-panel cast-card"><div class="panel-head"><h3>Official team stats</h3><span class="micro">${cast.replay ? 'Full-game values' : 'NHL'}</span></div>
      <div class="table-wrap"><table class="pbe-table"><thead><tr><th>Stat</th><th class="num">${esc(g.teams.away.abbrev)}</th><th class="num">${esc(g.teams.home.abbrev)}</th></tr></thead><tbody>
        ${offRow('faceoffWinningPctg', 'Faceoff %', v => pct(v, 1))}
        ${offRow('powerPlay', 'Power play')}
        ${offRow('pim', 'PIM')}
        ${offRow('hits', 'Hits')}
        ${offRow('blockedShots', 'Blocked shots')}
        ${offRow('giveaways', 'Giveaways')}
        ${offRow('takeaways', 'Takeaways')}
      </tbody></table></div></section>` : ''}
    <section class="pbe-panel cast-card"><div class="panel-head"><h3>Goalies</h3><span class="micro">${cast.replay ? 'Full-game box score' : 'Box score'}</span></div>
      ${goalies.length ? `<div class="table-wrap"><table class="pbe-table"><thead><tr><th>Goalie</th><th class="num">SA</th><th class="num">SV</th><th class="num">SV%</th><th class="num">TOI</th></tr></thead><tbody>
        ${goalies.filter(x => x.toi && x.toi !== '00:00').map(x => `<tr><td><b>${esc(x.name)}</b> <span class="faint">${esc(g.teams[x.side].abbrev)}</span>${x.starter ? ' <span class="pbe-badge pbe-badge--confirmed">Started</span>' : ''}</td><td class="num">${num(x.shots_against)}</td><td class="num">${num(x.saves)}</td><td class="num">${svPct(x.save_pct)}</td><td class="num">${esc(x.toi || '—')}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="dim">Goalie lines appear once the game starts.</p>'}
      <p class="micro gsax-note">GSAx: unavailable until a validated xG model is released.</p>
    </section>
    <section class="pbe-panel cast-card"><div class="panel-head"><h3>Prop tracker</h3><span class="pbe-badge pbe-badge--unavailable">No PBE picks</span></div>
      <p class="dim small">No PBE prediction was locked for this game and no market snapshot is stored yet, so there is no line to track against. Live stat lines below are official box-score values.</p>
      ${skaters.length ? `<div class="table-wrap"><table class="pbe-table"><thead><tr><th>Skater</th><th class="num">SOG</th><th class="num">G</th><th class="num">A</th><th class="num">P</th><th class="num">TOI</th></tr></thead><tbody>
        ${skaters.map(x => `<tr><td><a href="#/player/${esc(x.id)}">${esc(x.name)}</a> <span class="faint">${esc(g.teams[x.side].abbrev)}</span></td><td class="num">${num(x.sog)}</td><td class="num">${num(x.goals)}</td><td class="num">${num(x.assists)}</td><td class="num">${num(x.points)}</td><td class="num">${esc(x.toi || '—')}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
    </section>`;
}

function feedList(cast, filter, selected) {
  const plays = [...cast.plays].filter(p => feedMatch(p, filter)).reverse();
  if (!plays.length) {
    return `<p class="dim feed-empty">${cast.plays.length ? 'No events of this type yet.' : 'The play-by-play stream starts at puck drop.'}</p>`;
  }
  const g = cast.game;
  feedTeams = g.teams;
  let lastPeriod = null;
  const out = [];
  plays.forEach((p, i) => {
    if (p.period !== lastPeriod) {
      out.push(`<li class="feed-period micro">${esc(periodLabel(p.period, p.period_type) || 'Pregame')}</li>`);
      lastPeriod = p.period;
    }
    const team = p.side ? g.teams[p.side] : null;
    const scoreAfter = p.score_after ? `<span class="feed-score mono">${p.score_after.away}–${p.score_after.home}</span>` : '';
    out.push(`<li class="feed-item feed-item--${esc(p.kind)}${i === 0 && filter === 'all' ? ' is-latest' : ''}${selected === p.sort_order ? ' is-selected' : ''}"${p.shot?.has_coordinates ? ` data-select="${p.sort_order}"` : ''}>
      ${p.shot?.has_coordinates ? `<button type="button" class="feed-loc" data-select="${p.sort_order}" aria-label="Show this ${esc(p.time_in_period || '')} attempt on the rink" aria-pressed="${selected === p.sort_order}">⌖</button>` : '<span class="feed-loc feed-loc--none" aria-hidden="true"></span>'}
      <span class="feed-time mono">${esc(p.time_in_period || '')}</span>
      <span class="feed-team" style="--c:${team ? teamAccent(team.abbrev) : 'transparent'}">${team ? esc(team.abbrev) : ''}</span>
      <span class="feed-text">${playText(p)}${p.strength && p.strength.state !== 'EV' && p.kind !== 'faceoff' ? ` <span class="feed-str">${esc(p.strength.label)} ${esc(p.strength.state)}</span>` : ''}</span>
      ${scoreAfter}
    </li>`);
  });
  return `<ol class="feed-list">${out.join('')}</ol>`;
}

function pregamePanel(cast, market = null) {
  const g = cast.game;
  const c = countdownParts(g.start_time_utc);
  return `<div class="pbe-panel cast-pregame">
    <span class="eyebrow">Pregame</span>
    <h3>${esc(g.teams.away.name || g.teams.away.abbrev)} at ${esc(g.teams.home.name || g.teams.home.abbrev)}</h3>
    <p class="dim">${esc(dayET(g.start_time_utc, true))} · ${esc(timeET(g.start_time_utc))} · ${esc(g.venue || '')}</p>
    ${c && !c.done ? `<p class="mono cast-pregame__cd">Puck drop in ${c.days ? `${c.days}d ` : ''}${c.hours}h ${c.mins}m</p>` : ''}
    <ul class="cast-pregame__list">
      <li><span class="pbe-badge pbe-badge--unknown">Starter watch</span> NHL.com projections appear when published; the NHL box score confirms the starter at puck drop.</li>
      ${market
        ? `<li><span class="pbe-badge pbe-badge--sched">Odds</span> Scheduled market snapshot below (08:00 / 13:00 / 18:00 ET). Not a live feed.</li>`
        : `<li><span class="pbe-badge pbe-badge--unavailable">Odds</span> No market snapshot for this game yet. Nothing is estimated.</li>`}
      <li><span class="pbe-badge pbe-badge--sched">Feed</span> PBE Cast switches to 5-second refresh when the game goes live.</li>
    </ul>
    <div class="row"><a class="pbe-btn" href="#/matchup/${esc(g.id)}">Matchup</a><a class="pbe-btn" href="#/goalies/${esc(g.id)}">Goalie Center</a></div>
  </div>`;
}

function pickerMarkup(games, currentId, label) {
  if (!games.length) return '';
  return `<nav class="cast-picker" aria-label="${esc(label || 'Games')}">
    ${games.map(g => {
      const st = stateOf(g);
      return `<a class="pick${String(g.id) === String(currentId) ? ' is-active' : ''}" href="#/cast/${esc(g.id)}" data-state="${st.key}">
        <span class="pick__teams mono">${esc(g.teams.away.abbrev)} <span class="faint">@</span> ${esc(g.teams.home.abbrev)}</span>
        <span class="pick__state">${['LIVE', 'INTERMISSION', 'FINAL'].includes(st.key) ? `${g.teams.away.score ?? ''}–${g.teams.home.score ?? ''} · ` : ''}${esc(st.text)}</span>
      </a>`;
    }).join('')}
  </nav>`;
}

export function mount(root, params, ctx) {
  if (params.view === 'all') return mountCenter(root, params, ctx);
  const state = {
    gameId: params.gameId || null,
    cast: null, meta: null, failed: false, error: null,
    layer: 'all', team: 'both', period: 'all', normalize: true,
    feed: 'all', selected: null,
    tab: 'feed',
    replayDate: params.date || null,
    pickGames: [], pickLabel: '', recentCompleted: null,
    // Replay: cursor is an index into cast.plays (null = full/live view).
    cursor: null, playing: false, speed: 'normal', startSort: /^\d+$/.test(params.t || '') ? Number(params.t) : null
  };
  let playTimer = null;
  // Shot sort_orders already drawn for this game. null until the first paint so
  // an initial load never animates a backlog of historical attempts.
  let seenShots = null;
  let inspector = null;

  root.innerHTML = `<section class="wrap section cast" data-fresh-scope>
    <div class="section-head"><div><span class="eyebrow">PBE Cast</span><h2>Live hockey intelligence broadcast</h2></div>
      <p>Every event from the official play-by-play, every shot at its recorded location. Missing data stays missing.</p></div>
    <div id="cast-picker"></div>
    <div id="cast-body"></div>
  </section>`;
  const body = $('#cast-body', root);
  const picker = $('#cast-picker', root);

  // The most recent completed game, resolved from the schedule, so "replay" is
  // one real click away on a day with nothing to broadcast. No fixture id.
  const replayShortcut = () => {
    const g = state.recentCompleted;
    if (!g || String(g.id) === String(state.gameId)) return '';
    return `<a class="pbe-btn pbe-btn--sm" href="#/cast/${esc(g.id)}">Replay ${esc(g.teams.away.abbrev)} @ ${esc(g.teams.home.abbrev)} · ${esc(dateLabel(g.date))}</a>`;
  };

  const renderPicker = () => {
    picker.innerHTML = `${pickerMarkup(state.pickGames, state.gameId, state.pickLabel)}
      <div class="cast-replay"><a class="pbe-btn pbe-btn--sm" href="#/cast?view=all${state.replayDate ? `&date=${esc(state.replayDate)}` : ''}">Command center</a>${replayShortcut()}<label class="micro" for="replay-date">Replay a date</label>
        <input id="replay-date" class="datenav__input" type="date" value="${esc(state.replayDate || '')}" max="${todayET()}">
        ${state.pickLabel ? `<span class="micro">${esc(state.pickLabel)}</span>` : ''}</div>`;
  };

  async function loadPicker() {
    try {
      let date = state.replayDate || todayET();
      let res = await ctx.board(date);
      let games = res.data.games || [];
      let label = date === todayET() ? 'Today' : dateLabel(date, { long: true });
      let emptyToday = false;
      if (!games.length && !state.replayDate) {
        emptyToday = true;
        const next = res.data.next_puck_drop;
        if (next) {
          res = await ctx.board(next.date);
          games = res.data.games || [];
          label = `Next slate · ${dateLabel(next.date)}`;
        }
      }
      state.pickGames = games;
      state.pickLabel = label;
      // Nothing today: surface the real last completed game as a replay entry.
      if (emptyToday) {
        const hit = await resolveRecentCompleted(ctx.board, {}).catch(() => null);
        state.recentCompleted = hit?.games?.[0] || null;
      }
      if (!state.gameId && games.length) {
        const st = g => stateOf(g).key;
        const live = games.find(g => ['LIVE', 'INTERMISSION'].includes(st(g)));
        const finals = games.filter(g => st(g) === 'FINAL');
        location.replace(`#/cast/${(live || finals[finals.length - 1] || games[0]).id}`);
        return;
      }
    } catch (error) {
      state.pickLabel = describeError(error).title;
    }
    renderPicker();
  }

  function renderBody() {
    if (!state.gameId) {
      body.innerHTML = '<div class="pbe-empty"><h3>Pick a game.</h3><p>Choose a game above, or pick any past date to replay it event by event.</p></div>';
      return;
    }
    if (!state.cast) {
      body.innerHTML = state.error
        ? `<div class="pbe-error"><strong>${esc(describeError(state.error).title)}</strong>${esc(describeError(state.error).body)}</div>`
        : '<div class="pbe-skeleton" style="height:140px;margin-bottom:16px"></div><div class="cast-grid"><div class="pbe-skeleton" style="height:420px"></div><div class="pbe-skeleton" style="height:420px"></div><div class="pbe-skeleton" style="height:420px"></div></div>';
      return;
    }
    const full = state.cast;
    if (state.cursor !== null) state.cursor = Math.min(state.cursor, full.plays.length - 1);
    const cast = state.cursor === null || state.cursor < 0 ? full : sliceCast(full, state.cursor);
    const g = cast.game;
    const st = stateOf(full.game);
    const pre = st.key === 'SCHEDULED' || st.key === 'PREGAME';
    const periods = [...new Set(full.plays.filter(p => p.shot).map(p => p.period))].filter(Boolean);
    // In replay, ring the most recent attempt at the cursor unless the user picked one.
    const lastShot = cast.replay ? [...cast.plays].reverse().find(p => p.shot?.has_coordinates) : null;
    const rink = renderRink(cast.plays, { layer: state.layer, team: state.team, period: state.period, normalize: state.normalize, teams: g.teams, highlight: state.selected ?? lastShot?.sort_order ?? null });
    const omittedTotal = rink.omitted.coordinates + rink.omitted.direction;
    const feedScroll = $('.feed-scroll', body)?.scrollTop || 0;
    body.innerHTML = `
      ${header(cast, state.meta, state.failed)}
      ${!pre && full.plays.length ? replayBar(state, full, { live: ['LIVE', 'INTERMISSION'].includes(st.key) }) : ''}
      ${cast.partial?.boxscore || cast.partial?.right_rail ? `<div class="pbe-note" style="margin-top:12px"><b>Partial data.</b> ${cast.partial.boxscore ? 'Box score unavailable. ' : ''}${cast.partial.right_rail ? 'Official team stats unavailable. ' : ''}Play-by-play is current.</div>` : ''}
      <div class="cast-tabs" role="tablist" aria-label="PBE Cast sections">
        ${[['feed', 'Play-by-play'], ['rink', 'Shot map'], ['stats', 'Intelligence']].map(([k, l]) => `<button role="tab" class="chip" aria-selected="${state.tab === k}" data-tab="${k}">${l}</button>`).join('')}
      </div>
      <div class="cast-grid" data-tab="${state.tab}">
        <div class="cast-col cast-col--rink">
          ${pre ? pregamePanel(cast, state.market) : ''}
          ${state.market && !['FINAL'].includes(st.key) ? `<section class="pbe-panel cast-card"><div class="panel-head"><h3>Market</h3><span class="pbe-badge pbe-badge--sched">Snapshot · not live</span></div>${marketPanel(state.market.event, state.market.meta)}</section>` : ''}
          <section class="pbe-panel cast-card">
            <div class="panel-head"><h3>Shot map</h3><span class="micro">${rink.plotted} plotted${omittedTotal ? ` · ${omittedTotal} not plotted` : ''}</span></div>
            <div class="rink-controls">
              <div class="chips" role="group" aria-label="Shot layer">${LAYERS.map(([k, l]) => `<button class="chip" data-layer="${k}" aria-pressed="${state.layer === k}">${l}</button>`).join('')}</div>
              <div class="chips" role="group" aria-label="Team">${[['both', 'Both'], ['away', g.teams.away.abbrev], ['home', g.teams.home.abbrev]].map(([k, l]) => `<button class="chip" data-team="${k}" aria-pressed="${state.team === k}">${esc(l)}</button>`).join('')}
                <select class="chip chip-select" data-period aria-label="Period"><option value="all">All periods</option>${periods.map(p => `<option value="${p}" ${String(state.period) === String(p) ? 'selected' : ''}>${esc(periodLabel(p, p > 3 ? 'OT' : 'REG'))}</option>`).join('')}</select>
                <button class="chip" data-normalize aria-pressed="${state.normalize}" title="Rotate each team's attempts so away attacks left and home attacks right">Normalize ends</button>
              </div>
            </div>
            <div class="rink-ends micro" aria-hidden="true">${state.normalize ? `<span>← ${esc(g.teams.away.abbrev)} attack</span><span>${esc(g.teams.home.abbrev)} attack →</span>` : '<span>As recorded by source</span>'}</div>
            <div class="rink-stage"><div class="rink-wrap">${rink.svg}</div>${rinkInspector()}</div>
            ${rinkLegend()}
            ${omittedTotal ? `<p class="micro rink-omit">Not plotted: ${rink.omitted.coordinates ? `${rink.omitted.coordinates} without source coordinates` : ''}${rink.omitted.coordinates && rink.omitted.direction ? ' · ' : ''}${rink.omitted.direction ? `${rink.omitted.direction} with unknown attack direction (switch off “Normalize ends” to show as recorded)` : ''}. They remain in the feed and totals.</p>` : ''}
          </section>
          <section class="pbe-panel cast-card">
            <div class="panel-head"><h3>5-minute pressure</h3><span class="pbe-badge pbe-badge--heuristic">Descriptive · not a model</span></div>
            ${pressureChart(cast.plays, g)}
          </section>
        </div>
        <div class="cast-col cast-col--feed">
          <section class="pbe-panel cast-card cast-feed">
            <div class="panel-head"><h3>Play-by-play</h3><span class="micro">${cast.plays.length} events</span></div>
            <div class="chips feed-filters" role="group" aria-label="Filter events">${FEED_FILTERS.map(([k, l]) => `<button class="chip" data-feed="${k}" aria-pressed="${state.feed === k}">${l}</button>`).join('')}</div>
            <div class="feed-scroll">${feedList(cast, state.feed, state.selected)}</div>
          </section>
        </div>
        <div class="cast-col cast-col--stats">${pre && !full.plays.length
          ? '<section class="pbe-panel cast-card"><div class="panel-head"><h3>Intelligence</h3><span class="pbe-badge pbe-badge--sched">At puck drop</span></div><p class="dim small">Shot share, Corsi/Fenwick, period splits, official team stats, goalie lines and live stat lines populate from the first recorded event.</p></section>'
          : statsPanel(cast)}</div>
      </div>`;
    const scroller = $('.feed-scroll', body);
    if (scroller) scroller.scrollTop = feedScroll;
    markArrivingShots(body);
    mountInspector();
  }

  // ONE inspector per render pass. The body is replaced wholesale each poll, so
  // the old controller is disposed and a new one attached; a pinned shot is
  // re-pinned if it still exists, so live data never yanks the card out from
  // under the reader.
  function mountInspector() {
    const wasPinned = inspector?.pinned() ?? null;
    inspector?.dispose();
    inspector = attachRinkInspector(body, {
      teams: state.cast?.game?.teams || {},
      onPin: id => { if (id !== null) { state.selected = id; syncFeedSelection(); } }
    });
    if (wasPinned !== null) inspector.pin(wasPinned);
  }

  // Keep the feed's selected row in step with a rink pin without re-rendering
  // the whole body, which would destroy the pin we just made.
  function syncFeedSelection() {
    body.querySelectorAll('.feed-item').forEach(li => {
      const id = li.querySelector('[data-select]')?.dataset.select;
      li.classList.toggle('is-selected', id !== undefined && Number(id) === state.selected);
    });
  }

  // The body is re-rendered wholesale on every poll, so every marker is a new
  // node each time. Only attempts we have never drawn before are allowed to
  // play the arrival animation — otherwise a live game would pulse its entire
  // shot history on every tick, which is noise rather than information.
  function markArrivingShots(scope) {
    const nodes = scope.querySelectorAll('.rk-marks .mk-g[data-sort]');
    if (!seenShots) { // first paint of this game: nothing is "new"
      seenShots = new Set();
      for (const n of nodes) seenShots.add(n.dataset.sort);
      return;
    }
    for (const n of nodes) {
      const id = n.dataset.sort;
      if (seenShots.has(id)) continue;
      seenShots.add(id);
      n.classList.add('mk-g--arriving');
    }
  }

  // ---- replay engine
  const speedMs = () => SPEEDS.find(s => s[0] === state.speed)?.[2] ?? 450;
  const stopPlay = () => { if (playTimer) clearTimeout(playTimer); playTimer = null; state.playing = false; };
  const writeDeepLink = () => {
    const at = state.cursor === null ? null : state.cast?.plays[state.cursor];
    history.replaceState(null, '', `#/cast/${state.gameId}${at ? `?t=${at.sort_order}` : ''}`);
  };
  const goTo = index => {
    if (!state.cast) return;
    seenShots = null; // replay jumps redraw history; that is not new arrival
    const n = state.cast.plays.length;
    state.cursor = index === null || index >= n - 1 ? (index === null ? null : n - 1) : Math.max(0, index);
    state.selected = null;
    renderBody();
  };
  const tick = () => {
    const n = state.cast?.plays.length || 0;
    if (!state.playing || !n) return;
    const next = (state.cursor ?? -1) + 1;
    if (next >= n) {
      const liveNow = ['LIVE', 'INTERMISSION'].includes(stateOf(state.cast?.game).key);
      stopPlay();
      state.cursor = liveNow ? null : n - 1;
      renderBody();
      writeDeepLink();
      return;
    }
    state.cursor = next;
    state.selected = null;
    renderBody();
    playTimer = setTimeout(tick, speedMs());
  };
  const togglePlay = () => {
    if (!state.cast) return;
    const liveNow = ['LIVE', 'INTERMISSION'].includes(stateOf(state.cast.game).key);
    // A live game at cursor=null is already following the live edge. The play
    // action is replay-only and must never restart a live game from event one.
    if (liveNow && state.cursor === null) return;
    if (state.playing) { stopPlay(); renderBody(); writeDeepLink(); return; }
    const n = state.cast.plays.length;
    if (state.cursor === null || state.cursor >= n - 1) state.cursor = -1;
    state.playing = true;
    tick();
  };
  const step = dir => {
    stopPlay();
    const n = state.cast?.plays.length || 0;
    const cur = state.cursor ?? n - 1;
    goTo(Math.min(n - 1, Math.max(0, cur + dir)));
    writeDeepLink();
  };

  const poller = state.gameId ? createPoller(async signal => {
    const res = await nhl(`/nhl/game/${state.gameId}/cast`, {}, { signal, timeout: 12000 });
    state.cast = res.data; state.meta = res.meta; state.failed = false; state.error = null;
    if (state.startSort !== null) {
      const idx = res.data.plays.findIndex(p => p.sort_order === state.startSort);
      if (idx >= 0) state.cursor = idx;
      state.startSort = null;
    }
    renderBody();
    const key = stateOf(res.data.game).key;
    if (key === 'LIVE' || key === 'INTERMISSION') return 5000;
    if (key === 'FINAL' || key === 'POSTPONED' || key === 'CANCELLED') return null;
    const until = Date.parse(res.data.game.start_time_utc) - Date.now();
    return until < 20 * 60 * 1000 ? 20000 : 60000;
  }, {
    onError(error) {
      state.error = error;
      state.failed = Boolean(state.cast);
      renderBody();
      return error.kind === 'not_deployed' || error.kind === 'legacy' ? null : 5000;
    }
  }) : null;

  renderPicker();
  renderBody();
  loadPicker();
  poller?.start();

  // Market snapshot for this game, if the odds service exists here.
  const oddsCtl = new AbortController();
  if (state.gameId) {
    odds({ game: state.gameId }, { signal: oddsCtl.signal, timeout: 8000 })
      .then(res => {
        const event = (res.data.events || [])[0];
        if (event) { state.market = { event, meta: res.meta }; renderBody(); }
      })
      .catch(() => {});
  }

  const disposers = [
    on(root, 'click', '[data-layer]', (_, b) => { state.layer = b.dataset.layer; renderBody(); }),
    on(root, 'click', '[data-team]', (_, b) => { state.team = b.dataset.team; renderBody(); }),
    on(root, 'change', '[data-period]', (_, s) => { state.period = s.value; renderBody(); }),
    on(root, 'click', '[data-normalize]', () => { state.normalize = !state.normalize; renderBody(); }),
    on(root, 'click', '[data-feed]', (_, b) => { state.feed = b.dataset.feed; renderBody(); }),
    on(root, 'click', '[data-tab]', (_, b) => { if (b.tagName === 'BUTTON') { state.tab = b.dataset.tab; renderBody(); } }),
    on(root, 'click', '[data-select]', (event, li) => {
      if (li.tagName === 'LI' && event.target.closest('a')) return;
      event.stopPropagation();
      const id = Number(li.dataset.select);
      state.selected = state.selected === id ? null : id;
      if (state.selected !== null && state.team !== 'both') state.team = 'both';
      renderBody();
      if (window.matchMedia('(max-width: 768px)').matches && state.selected !== null) { state.tab = 'rink'; renderBody(); }
    }),
    on(root, 'click', '[data-rp]', (_, b) => {
      const n = state.cast?.plays.length || 0;
      const act = b.dataset.rp;
      if (act === 'play') return togglePlay();
      if (act === 'back') return step(-1);
      if (act === 'fwd') return step(1);
      stopPlay();
      if (act === 'start') goTo(0);
      if (act === 'end' || act === 'live') goTo(null);
      writeDeepLink();
      return n;
    }),
    on(root, 'click', '[data-rp-speed]', (_, b) => { state.speed = b.dataset.rpSpeed; renderBody(); }),
    on(root, 'click', '[data-rp-goto]', (_, b) => { stopPlay(); goTo(Number(b.dataset.rpGoto)); writeDeepLink(); }),
    on(root, 'click', '[data-rp-seek]', (_, b) => {
      if (!state.cast) return;
      stopPlay();
      const n = state.cast.plays.length;
      const idx = seek(state.cast.plays, state.cursor ?? n - 1, b.dataset.rpSeek, Number(b.dataset.dir));
      if (idx !== null) { goTo(idx); writeDeepLink(); }
    }),
    on(root, 'input', '#rp-range', (_, r) => { stopPlay(); goTo(Number(r.value)); }),
    on(root, 'change', '#rp-range', () => writeDeepLink()),
    on(root, 'change', '#replay-date', (_, input) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.value)) return;
      state.replayDate = input.value;
      state.pickGames = [];
      renderPicker();
      loadPicker();
    })
  ];

  const onKey = event => {
    if (!state.cast || /input|select|textarea/i.test(event.target?.tagName || '') && event.target.id !== 'rp-range') return;
    if (document.querySelector('#palette:not([hidden])')) return;
    if (event.key === ' ' && !event.target.closest?.('button, a, [role="button"]')) { event.preventDefault(); togglePlay(); }
    else if (event.key === 'ArrowLeft' && event.target.id !== 'rp-range') { event.preventDefault(); step(-1); }
    else if (event.key === 'ArrowRight' && event.target.id !== 'rp-range') { event.preventDefault(); step(1); }
  };
  document.addEventListener('keydown', onKey);

  return () => {
    stopPlay();
    oddsCtl.abort();
    poller?.stop();
    document.removeEventListener('keydown', onKey);
    inspector?.dispose();
    disposers.forEach(d => d());
  };
}
