import { esc, safeUrl } from '../lib/dom.js';
import { gameTypeLabel, periodLabel, timeET, dayET } from '../lib/format.js';
import { logoUrl, teamAccent } from '../lib/teams.js';
import { watchButton } from './alerts-ui.js';
import { cardMarket } from './market.js';

export function teamMark(team = {}, size = 36) {
  const src = safeUrl(logoUrl(team));
  const abbr = esc(team.abbrev || '—');
  // onerror swaps to the abbreviation, so a blocked logo never renders broken.
  return `<span class="team-mark" style="--mark:${size}px">${src
    ? `<img src="${esc(src)}" alt="${abbr}" width="${size}" height="${size}" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:this.alt}))">`
    : `<span>${abbr}</span>`}</span>`;
}

export function stateOf(game) {
  const s = game?.status || {};
  const sem = s.semantics || 'UNAVAILABLE';
  if (sem === 'REPLAY') return { key: 'REPLAY', cls: 'sched', text: `REPLAY · ${periodLabel(s.period, s.period_type)}${s.clock ? ` ${s.clock}` : ''}` };
  if (sem === 'LIVE' && s.in_intermission) return { key: 'INTERMISSION', cls: 'inter', text: `${periodLabel(s.period, s.period_type)} INT` };
  if (sem === 'LIVE') {
    const per = periodLabel(s.period, s.period_type);
    return { key: 'LIVE', cls: 'live', text: `LIVE${per ? ` · ${per}` : ''}${s.clock ? ` ${s.clock}` : ''}` };
  }
  if (sem === 'FINAL') {
    const suffix = s.last_period_type === 'OT' ? '/OT' : s.last_period_type === 'SO' ? '/SO' : '';
    return { key: 'FINAL', cls: 'final', text: `FINAL${suffix}` };
  }
  if (sem === 'PREGAME') return { key: 'PREGAME', cls: 'sched', text: 'PREGAME' };
  if (sem === 'SCHEDULED') return { key: 'SCHEDULED', cls: 'sched', text: timeET(game.start_time_utc) };
  if (sem === 'POSTPONED' || sem === 'SUSPENDED' || sem === 'CANCELLED') return { key: sem, cls: 'alert', text: sem };
  return { key: 'UNAVAILABLE', cls: 'unavailable', text: 'STATE UNAVAILABLE' };
}

// short: state word only, for surfaces that already show the clock.
export function stateBadge(game, { short = false } = {}) {
  const st = stateOf(game);
  const text = short && ['LIVE', 'REPLAY', 'INTERMISSION'].includes(st.key)
    ? (st.key === 'INTERMISSION' ? 'INTERMISSION' : st.key)
    : st.text;
  return `<span class="pbe-badge pbe-badge--${st.cls}" data-live-badge="${st.key === 'LIVE' ? '1' : ''}">${esc(text)}</span>`;
}

const scoreShown = game => ['LIVE', 'FINAL'].includes(game?.status?.semantics);

function teamLine(team, game, winner) {
  const showScore = scoreShown(game) && team.score !== null && team.score !== undefined;
  return `<div class="gteam${winner ? ' is-winner' : ''}">
    ${teamMark(team, 34)}
    <div class="gteam__id"><b>${esc(team.abbrev || 'TBD')}</b><span>${esc(team.name || '')}</span></div>
    ${showScore ? `<div class="gteam__sog mono" title="Shots on goal">${team.sog ?? '—'}<small>SOG</small></div><div class="gteam__score mono">${esc(team.score)}</div>` : ''}
  </div>`;
}

export function gameCard(game, { compact = false, market = null, marketMeta = null } = {}) {
  const a = game.teams?.away || {};
  const h = game.teams?.home || {};
  const st = stateOf(game);
  const final = game.status?.semantics === 'FINAL';
  const awayWin = final && a.score > h.score;
  const homeWin = final && h.score > a.score;
  const tv = (game.broadcasts || []).filter(b => b.country === 'US' || b.country === 'CA').map(b => b.network).filter(Boolean);
  const tvText = [...new Set(tv)].slice(0, 3).join(' · ');
  const type = gameTypeLabel(game.game_type);
  return `<article class="gcard" data-state="${esc(st.key)}" style="--away:${teamAccent(a.abbrev)};--home:${teamAccent(h.abbrev)}">
    <header class="gcard__head">
      ${stateBadge(game)}
      <span class="gcard__when mono">${esc(dayET(game.start_time_utc))}${st.key !== 'SCHEDULED' ? ` · ${esc(timeET(game.start_time_utc))}` : ''}</span>
      ${type && game.game_type !== 2 ? `<span class="micro gcard__type">${esc(type)}</span>` : ''}
      ${st.key === 'FINAL' ? '' : watchButton(game.id, true)}
    </header>
    <div class="gcard__teams">
      ${teamLine(a, game, awayWin)}
      ${teamLine(h, game, homeWin)}
    </div>
    ${market && st.key !== 'FINAL' ? cardMarket(market, marketMeta) : ''}
    ${compact ? '' : `<dl class="gcard__meta">
      <div><dt>Venue</dt><dd>${esc(game.venue || 'Not listed')}</dd></div>
      <div><dt>TV</dt><dd>${esc(tvText || 'Not listed')}</dd></div>
      <div><dt>Goalies</dt><dd>${final || st.key === 'LIVE' || st.key === 'INTERMISSION' ? 'Starters on record' : 'Confirm at puck drop'}</dd></div>
    </dl>`}
    <footer class="gcard__actions">
      <a class="gcard__primary" href="#/cast/${esc(game.id)}">${st.key === 'LIVE' || st.key === 'INTERMISSION' ? 'Watch in PBE Cast' : final ? 'Replay in PBE Cast' : 'PBE Cast preview'}</a>
      <a href="#/matchup/${esc(game.id)}">Matchup</a>
      <a href="#/goalies/${esc(game.id)}">Goalies</a>
    </footer>
  </article>`;
}
