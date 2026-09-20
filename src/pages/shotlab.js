import { $, esc, on } from '../lib/dom.js';
import { describeError, nhl } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { countdownParts, dateLabel, dayET, gameTypeLabel, periodLabel, timeET, titleCase, todayET } from '../lib/format.js';
import { createPoller } from '../lib/poll.js';
import { cachedRecentCompleted, nextCompletedAfter, resolveRecentCompleted } from '../lib/recent-games.js';
import { teamAccent } from '../lib/teams.js';
import { stateBadge, stateOf, teamMark } from '../components/game.js';
import { LAYERS, layerMatch, renderRink, rinkLegend, shotLabel } from '../components/rink.js';

// Shot Lab: every attempt from the official play-by-play at its recorded
// location, with geometric-v1 distance/angle. Nothing here is a model output.

const BIN_FT = 5;
const BIN_COUNT = 15; // 0-5 ... 65-70 ft, then one 70+ bin
const TYPE_ORDER = [
  ['wrist', 'Wrist'], ['snap', 'Snap'], ['slap', 'Slap'], ['backhand', 'Backhand'],
  ['tip-in', 'Tip-in'], ['deflected', 'Deflected'], ['wrap-around', 'Wrap-around']
];
const RESULT = { goal: 'Goal', 'shot-on-goal': 'On goal', 'missed-shot': 'Missed', 'blocked-shot': 'Blocked' };
const RESULT_RANK = { goal: 0, 'shot-on-goal': 1, 'missed-shot': 2, 'blocked-shot': 3 };
const DANGER_LABEL = { high: 'High', medium: 'Med', low: 'Low' };
const DANGER_RANK = { high: 0, medium: 1, low: 2 };
const STRENGTH_RANK = { EV: 0, PP: 1, SH: 2 };
const SIDES = ['away', 'home'];
const ROW_LIMIT = 40;

const COLUMNS = [
  ['order', 'Per', ''], ['time', 'Time', 'num'], ['team', 'Team', ''], ['shooter', 'Shooter', ''],
  ['type', 'Type', ''], ['result', 'Result', ''], ['dist', 'Dist ft', 'num'], ['angle', 'Angle°', 'num'],
  ['danger', 'Danger', ''], ['strength', 'Str', '']
];

const shooterOf = play => play.players?.find(p => p.role === 'scorer' || p.role === 'shooter') || null;
const inPlay = shots => shots.filter(p => p.shot && !p.shot.shootout);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const pctText = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const clockSeconds = t => {
  const m = /^(\d+):(\d{2})$/.exec(String(t || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Same rule renderRink uses to decide whether a shot can be placed.
function plottable(play, normalize) {
  const s = play.shot;
  if (!s?.has_coordinates || s.x === null || s.y === null) return { ok: false, why: 'no source coordinates' };
  if (normalize && (s.target_net_x === null || s.target_net_x === undefined || !play.side)) return { ok: false, why: 'attack direction unknown (switch off “Normalize ends”)' };
  return { ok: true };
}

function tally(list) {
  const t = { att: 0, fen: 0, sog: 0, goals: 0, blocked: 0, missed: 0, nocoord: 0, high: 0, medium: 0, low: 0, nogeo: 0 };
  for (const p of list) {
    const s = p.shot;
    t.att += 1;
    if (s.unblocked) t.fen += 1;
    if (s.on_goal) t.sog += 1;
    if (s.goal) t.goals += 1;
    if (s.blocked) t.blocked += 1;
    if (p.type === 'missed-shot') t.missed += 1;
    if (!s.has_coordinates) t.nocoord += 1;
    if (s.danger_bucket === 'high') t.high += 1;
    else if (s.danger_bucket === 'medium') t.medium += 1;
    else if (s.danger_bucket === 'low') t.low += 1;
    else t.nogeo += 1;
  }
  return t;
}

function median(values) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// ---------------------------------------------------------------- picker

function pickerMarkup(games, currentId) {
  if (!games.length) return '';
  return `<nav class="lab-picker" aria-label="Games on this slate">
    ${games.map(g => {
      const st = stateOf(g);
      const scored = ['LIVE', 'INTERMISSION', 'FINAL'].includes(st.key);
      const active = String(g.id) === String(currentId);
      return `<a class="lab-pick${active ? ' is-active' : ''}" href="#/shots/${esc(g.id)}" data-state="${esc(st.key)}"${active ? ' aria-current="page"' : ''}>
        <span class="lab-pick__teams mono">${esc(g.teams.away.abbrev)} <span class="faint">@</span> ${esc(g.teams.home.abbrev)}</span>
        <span class="lab-pick__state">${scored ? `${esc(g.teams.away.score ?? '')}–${esc(g.teams.home.score ?? '')} · ` : ''}${esc(st.text)}</span>
      </a>`;
    }).join('')}
  </nav>`;
}

// ---------------------------------------------------------------- header

function seasonText(season) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(season || ''));
  return m ? `${m[1]}-${m[3]}` : '';
}

function gameHeader(data, meta, failed) {
  const g = data.game;
  const st = stateOf(g);
  const a = g.teams.away; const h = g.teams.home;
  const scored = ['LIVE', 'INTERMISSION', 'FINAL'].includes(st.key);
  const when = st.key === 'FINAL' ? dayET(g.start_time_utc, true) : `${dayET(g.start_time_utc, true)} · ${timeET(g.start_time_utc)}`;
  const team = (t, side) => `<div class="lab-head__team lab-head__team--${side}">
      ${teamMark(t, 44)}
      <div class="lab-head__id"><b>${esc(t.abbrev || '')}</b><span>${esc([t.place, t.name].filter(Boolean).join(' '))}</span></div>
      ${scored ? `<div class="lab-head__score mono">${esc(t.score ?? '—')}</div>` : ''}
    </div>`;
  const season = seasonText(g.season);
  const liveLab = ['LIVE', 'INTERMISSION'].includes(st.key)
    ? '<div class="lab-live-state" role="status"><i aria-hidden="true"></i><span><b>LIVE SHOT LAB</b><small>Spatial attempts refresh every 5 seconds from official play-by-play</small></span></div>'
    : '';
  return `<div class="lab-head" style="--away:${teamAccent(a.abbrev)};--home:${teamAccent(h.abbrev)}">
      ${team(a, 'away')}
      <div class="lab-head__mid">
        ${stateBadge(g)}
        ${liveLab}
        <span class="lab-head__when mono">${esc(when)}</span>
        ${freshStamp(meta, { failed })}
      </div>
      ${team(h, 'home')}
    </div>
    <div class="lab-head__sub">
      <span class="micro">${[season ? `${season} ${gameTypeLabel(g.game_type)}` : gameTypeLabel(g.game_type), g.venue, `Game ${g.id}`].filter(Boolean).map(esc).join(' · ')}</span>
      <span class="lab-head__links"><a class="pbe-btn pbe-btn--sm" href="#/cast/${esc(g.id)}">${st.key === 'FINAL' ? 'Replay in PBE Cast' : 'PBE Cast'}</a><a class="pbe-btn pbe-btn--sm" href="#/matchup/${esc(g.id)}">Matchup</a></span>
    </div>`;
}

// ---------------------------------------------------------------- summary

function summaryPanel(game, shots) {
  const all = inPlay(shots);
  const total = tally(all);
  const side = { away: tally(all.filter(p => p.side === 'away')), home: tally(all.filter(p => p.side === 'home')) };
  const unattributed = all.filter(p => p.side !== 'away' && p.side !== 'home').length;
  const shootout = shots.filter(p => p.shot?.shootout).length;
  const a = esc(game.teams.away.abbrev); const h = esc(game.teams.home.abbrev);
  const tile = (label, value, sub = '') => `<div class="lab-tile"><span class="lab-tile__k">${label}</span><b class="lab-tile__v mono">${value}</b>${sub ? `<span class="lab-tile__s">${sub}</span>` : ''}</div>`;
  const cfA = side.away.att; const cfH = side.home.att;
  const cf = cfA + cfH ? [Math.round((cfA / (cfA + cfH)) * 100), Math.round((cfH / (cfA + cfH)) * 100)] : null;
  const row = (label, key) => `<tr><th scope="row">${label}</th><td class="num">${side.away[key]}</td><td class="num">${side.home[key]}</td></tr>`;
  return `<section class="pbe-panel lab-card lab-summary">
      <div class="panel-head"><h3>Game summary</h3><span class="micro">All periods · excl. shootout</span></div>
      <div class="lab-tiles">
        ${tile('Attempts', total.att, 'Corsi')}
        ${tile('Unblocked', total.fen, 'Fenwick')}
        ${tile('On goal', total.sog, 'SOG')}
        ${tile('Goals', total.goals)}
        ${tile('Blocked', total.blocked)}
        ${tile('No coords', total.nocoord, total.nocoord ? 'counted, not plotted' : 'all placed')}
      </div>
      <div class="lab-danger-block">
        <div class="lab-danger-block__head"><span class="micro">Geometric danger</span><span class="pbe-badge pbe-badge--heuristic">Geometric heuristic · not xG</span></div>
        <div class="lab-tiles lab-tiles--2">
          ${tile('High', total.high, '≤ 25 ft and ≤ 45°')}
          ${tile('Medium', total.medium, '≤ 45 ft and ≤ 60°')}
        </div>
      </div>
      <div class="table-wrap lab-table-tight"><table class="pbe-table lab-split">
        <thead><tr><th>By team</th><th class="num">${a}</th><th class="num">${h}</th></tr></thead>
        <tbody>
          ${row('Attempts (CF)', 'att')}
          <tr><th scope="row">Attempt share</th><td class="num">${cf ? `${cf[0]}%` : '—'}</td><td class="num">${cf ? `${cf[1]}%` : '—'}</td></tr>
          ${row('Unblocked (FF)', 'fen')}
          ${row('On goal', 'sog')}
          <tr><th scope="row">On-goal rate</th><td class="num">${pctText(side.away.sog, side.away.att)}</td><td class="num">${pctText(side.home.sog, side.home.att)}</td></tr>
          ${row('Goals', 'goals')}
          ${row('Missed', 'missed')}
          ${row('Blocked (as shooter)', 'blocked')}
          ${row('High danger <span class="faint">heuristic</span>', 'high')}
          ${row('Medium danger <span class="faint">heuristic</span>', 'medium')}
        </tbody>
      </table></div>
      ${unattributed || shootout ? `<p class="micro lab-foot">${unattributed ? `${plural(unattributed, 'attempt')} without a resolvable shooting team (in totals, not in team columns). ` : ''}${shootout ? `${plural(shootout, 'shootout attempt')} excluded from the map, splits and table.` : ''}</p>` : ''}
    </section>`;
}

function strengthPanel(game, shots) {
  const all = inPlay(shots);
  const states = [['EV', 'Even'], ['PP', 'Power play'], ['SH', 'Shorthanded']];
  const cell = (list, state) => {
    const f = list.filter(p => (state ? p.strength?.state === state : !(p.strength?.state in STRENGTH_RANK)));
    return { att: f.length, sog: f.filter(p => p.shot.on_goal).length, g: f.filter(p => p.shot.goal).length };
  };
  const bySide = Object.fromEntries(SIDES.map(s => [s, all.filter(p => p.side === s)]));
  const unknown = SIDES.reduce((n, s) => n + cell(bySide[s], null).att, 0);
  const rows = states.map(([k, label]) => {
    const a = cell(bySide.away, k); const h = cell(bySide.home, k);
    return `<tr><th scope="row"><span class="lab-str" title="${label}">${k}</span> <span class="dim lab-str-label">${label}</span></th>
      <td class="num">${a.att}</td><td class="num">${a.sog}</td><td class="num">${a.g}</td>
      <td class="num lab-col-split">${h.att}</td><td class="num">${h.sog}</td><td class="num">${h.g}</td></tr>`;
  }).join('');
  return `<section class="pbe-panel lab-card">
      <div class="panel-head"><h3>Strength split</h3><span class="micro">Shooting team's manpower</span></div>
      <div class="table-wrap lab-table-tight"><table class="pbe-table lab-split">
        <thead>
          <tr><th rowspan="2">State</th><th class="num lab-group" colspan="3">${esc(game.teams.away.abbrev)}</th><th class="num lab-group lab-col-split" colspan="3">${esc(game.teams.home.abbrev)}</th></tr>
          <tr><th class="num">Att</th><th class="num">SOG</th><th class="num">G</th><th class="num lab-col-split">Att</th><th class="num">SOG</th><th class="num">G</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="micro lab-foot">From each event's situationCode. A pulled-goalie extra attacker counts as EV, not PP.${unknown ? ` ${plural(unknown, 'attempt')} with no readable situation code left out.` : ''}</p>
    </section>`;
}

// ---------------------------------------------------------------- distance histogram

function histogramPanel(game, list, filterNote) {
  const bins = { away: Array(BIN_COUNT).fill(0), home: Array(BIN_COUNT).fill(0) };
  const dists = { away: [], home: [] };
  let without = 0;
  for (const p of list) {
    if (p.side !== 'away' && p.side !== 'home') continue;
    if (!finite(p.shot.distance_ft)) { without += 1; continue; }
    const d = p.shot.distance_ft;
    bins[p.side][Math.min(BIN_COUNT - 1, Math.floor(d / BIN_FT))] += 1;
    dists[p.side].push(d);
  }
  const a = game.teams.away.abbrev; const h = game.teams.home.abbrev;
  const counted = dists.away.length + dists.home.length;
  const binLabel = i => (i === BIN_COUNT - 1 ? `${(BIN_COUNT - 1) * BIN_FT}+ ft` : `${i * BIN_FT}–${(i + 1) * BIN_FT} ft`);
  let body;
  if (!counted) {
    body = `<p class="dim lab-hist__empty">${list.length ? 'None of the attempts in this view has a measured distance.' : 'No attempts match the current map filters.'}</p>`;
  } else {
    const max = Math.max(1, ...bins.away, ...bins.home);
    const W = BIN_COUNT * 10; const H = 100; const mid = H / 2;
    const bars = [];
    for (let i = 0; i < BIN_COUNT; i += 1) {
      for (const side of SIDES) {
        const v = bins[side][i];
        if (!v) continue;
        const hgt = (v / max) * (mid - 3);
        const y = side === 'away' ? mid - 1 - hgt : mid + 1;
        bars.push(`<rect x="${i * 10 + 1.2}" y="${y.toFixed(2)}" width="7.6" height="${hgt.toFixed(2)}" class="lab-hbar lab-hbar--${side}"/>`);
      }
      bars.push(`<rect x="${i * 10}" y="0" width="10" height="${H}" class="lab-hhit"><title>${esc(`${binLabel(i)}: ${a} ${bins.away[i]} · ${h} ${bins.home[i]}`)}</title></rect>`);
    }
    const peak = side => {
      const m = Math.max(...bins[side]);
      return m ? `peak ${binLabel(bins[side].indexOf(m))}` : '';
    };
    const line = side => {
      const m = median(dists[side]);
      return m === null ? 'no attempts in view' : `${dists[side].length} att · median ${m.toFixed(1)} ft · ${peak(side)}`;
    };
    body = `<div class="lab-hist">
        <div class="lab-hist__side" aria-hidden="true"><span>${esc(a)}</span><span>${esc(h)}</span></div>
        <div class="lab-hist__plot">
          <svg class="lab-hist__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Shot distance distribution in ${BIN_FT}-foot bins: ${esc(a)} above the axis, ${esc(h)} below">
            <line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="lab-haxis"/>
            ${bars.join('')}
          </svg>
          <div class="lab-hist__axis mono" aria-hidden="true">${Array.from({ length: BIN_COUNT }, (_, i) => `<span>${i % 2 === 0 ? (i === BIN_COUNT - 1 ? `${i * BIN_FT}+` : i * BIN_FT) : ''}</span>`).join('')}</div>
        </div>
      </div>
      <ul class="lab-hist__legend">
        <li><i class="lab-sw lab-sw--away"></i><b>${esc(a)}</b> <span class="dim">${esc(line('away'))}</span></li>
        <li><i class="lab-sw lab-sw--home"></i><b>${esc(h)}</b> <span class="dim">${esc(line('home'))}</span></li>
      </ul>
      <p class="micro lab-foot">Feet from the attacking net (geometric-v1). Tallest bar = ${plural(max, 'attempt')}.${without ? ` ${plural(without, 'attempt')} without a measurable distance left out.` : ''} Blocked attempts are measured at the block location.</p>`;
  }
  return `<section class="pbe-panel lab-card">
      <div class="panel-head"><h3>Distance profile</h3><span class="micro">${esc(filterNote)}</span></div>
      ${body}
    </section>`;
}

// ---------------------------------------------------------------- shot types

function typePanel(game, shots) {
  const all = inPlay(shots);
  const labels = new Map(TYPE_ORDER);
  for (const p of all) {
    const t = p.shot.shot_type;
    if (t && !labels.has(t)) labels.set(t, titleCase(t));
  }
  const keys = [...labels.keys(), null];
  const stat = (side, key) => {
    const f = all.filter(p => p.side === side && (p.shot.shot_type || null) === key);
    return { att: f.length, sog: f.filter(p => p.shot.on_goal).length, g: f.filter(p => p.shot.goal).length };
  };
  const unknown = all.filter(p => !p.shot.shot_type);
  const unknownBlocked = unknown.filter(p => p.shot.blocked).length;
  const rows = keys.map(key => {
    const a = stat('away', key); const h = stat('home', key);
    const cells = (s, split) => `<td class="num${split ? ' lab-col-split' : ''}">${s.att}</td><td class="num">${s.att ? pctText(s.sog, s.att) : '—'}</td><td class="num">${s.g}</td>`;
    return `<tr${!a.att && !h.att ? ' class="is-zero"' : ''}><th scope="row">${key === null ? 'Unknown' : esc(labels.get(key))}</th>${cells(a)}${cells(h, true)}</tr>`;
  }).join('');
  return `<section class="pbe-panel lab-card">
      <div class="panel-head"><h3>Shot types</h3><span class="micro">All periods · on-goal = SOG ÷ attempts</span></div>
      <div class="table-wrap lab-table-tight"><table class="pbe-table lab-split">
        <thead>
          <tr><th rowspan="2">Type</th><th class="num lab-group" colspan="3">${esc(game.teams.away.abbrev)}</th><th class="num lab-group lab-col-split" colspan="3">${esc(game.teams.home.abbrev)}</th></tr>
          <tr><th class="num">Att</th><th class="num">On-goal</th><th class="num">G</th><th class="num lab-col-split">Att</th><th class="num">On-goal</th><th class="num">G</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="micro lab-foot">Unknown = the source recorded no shot type${unknown.length ? ` (${plural(unknown.length, 'attempt')}${unknownBlocked ? `, ${unknownBlocked === unknown.length ? 'all' : unknownBlocked} of them blocked` : ''})` : ''}. Type labels are the source's, not ours.</p>
    </section>`;
}

// ---------------------------------------------------------------- shot table

function sortValue(play, key, teams) {
  const s = play.shot;
  switch (key) {
    case 'order': return play.sort_order ?? null;
    case 'time': {
      const t = clockSeconds(play.time_in_period);
      return t === null ? null : (play.period || 0) * 10000 + t;
    }
    case 'team': return play.side ? teams[play.side]?.abbrev || null : null;
    case 'shooter': return shooterOf(play)?.name || null;
    case 'type': return s.shot_type || null;
    case 'result': return RESULT_RANK[play.type] ?? null;
    case 'dist': return finite(s.distance_ft) ? s.distance_ft : null;
    case 'angle': return finite(s.angle_deg) ? s.angle_deg : null;
    case 'danger': return DANGER_RANK[s.danger_bucket] ?? null;
    case 'strength': return play.strength ? `${STRENGTH_RANK[play.strength.state] ?? 9}${play.strength.label}` : null;
    default: return null;
  }
}

function sortShots(list, { key, dir }, teams) {
  return [...list].sort((x, y) => {
    const a = sortValue(x, key, teams); const b = sortValue(y, key, teams);
    if (a === null && b === null) return (x.sort_order ?? 0) - (y.sort_order ?? 0);
    if (a === null) return 1; // missing values always sink, whatever the direction
    if (b === null) return -1;
    const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
    return c ? c * dir : (x.sort_order ?? 0) - (y.sort_order ?? 0);
  });
}

function shotTable(game, list, st) {
  const teams = game.teams;
  const sorted = sortShots(list, st.sort, teams);
  const shown = st.showAll ? sorted : sorted.slice(0, ROW_LIMIT);
  const head = COLUMNS.map(([key, label, cls]) => {
    const active = st.sort.key === key;
    const ariaSort = active ? (st.sort.dir === 1 ? 'ascending' : 'descending') : 'none';
    return `<th class="${cls}" aria-sort="${ariaSort}"><button type="button" class="lab-sort${active ? ' is-active' : ''}" data-sort="${key}">${label}<span class="lab-sort__ind" aria-hidden="true">${active ? (st.sort.dir === 1 ? '▲' : '▼') : '↕'}</span></button></th>`;
  }).join('');
  const rows = shown.map(p => {
    const s = p.shot;
    const team = p.side ? teams[p.side] : null;
    const shooter = shooterOf(p);
    const sel = st.selected === p.sort_order;
    const place = plottable(p, st.normalize);
    return `<tr class="lab-row${sel ? ' is-selected' : ''}${s.goal ? ' is-goal' : ''}" data-shot="${esc(p.sort_order)}" tabindex="0" aria-selected="${sel}" title="${place.ok ? 'Show on the rink' : `Not plotted: ${esc(place.why)}`}">
      <td class="mono">${esc(periodLabel(p.period, p.period_type))}</td>
      <td class="num">${esc(p.time_in_period || '—')}</td>
      <td>${team ? `<span class="lab-team" style="--c:${teamAccent(team.abbrev)}">${esc(team.abbrev)}</span>` : '<span class="faint">—</span>'}</td>
      <td class="lab-shooter">${shooter?.name ? (shooter.id ? `<a href="#/player/${esc(shooter.id)}">${esc(shooter.name)}</a>` : esc(shooter.name)) : '<span class="faint">unlisted</span>'}</td>
      <td>${s.shot_type ? esc(titleCase(s.shot_type)) : '<span class="faint">—</span>'}</td>
      <td><span class="lab-result lab-result--${esc(p.type)}">${esc(RESULT[p.type] || titleCase(p.type))}</span>${s.empty_net_against ? ' <span class="faint">EN</span>' : ''}</td>
      <td class="num">${finite(s.distance_ft) ? s.distance_ft.toFixed(1) : '<span class="faint">—</span>'}</td>
      <td class="num">${finite(s.angle_deg) ? s.angle_deg.toFixed(1) : '<span class="faint">—</span>'}</td>
      <td>${s.danger_bucket ? `<span class="lab-danger lab-danger--${esc(s.danger_bucket)}">${DANGER_LABEL[s.danger_bucket] || esc(s.danger_bucket)}</span>` : '<span class="faint">—</span>'}</td>
      <td class="mono">${p.strength ? `${esc(p.strength.label)}${p.strength.state !== 'EV' ? ` <span class="lab-str">${esc(p.strength.state)}</span>` : ''}` : '<span class="faint">—</span>'}</td>
    </tr>`;
  }).join('');
  return `<section class="pbe-panel lab-card lab-shots">
      <div class="panel-head"><h3>Every attempt</h3><span class="micro">${list.length} in view · follows map filters · select a row to find it on the rink</span></div>
      ${list.length ? `<div class="table-wrap"><table class="pbe-table lab-shot-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${sorted.length > ROW_LIMIT ? `<div class="lab-more"><button type="button" class="pbe-btn pbe-btn--sm" data-show-all>${st.showAll ? `Show first ${ROW_LIMIT}` : `Show all ${sorted.length} attempts`}</button></div>` : ''}`
        : '<p class="dim">No attempts match the current map filters.</p>'}
    </section>`;
}

// ---------------------------------------------------------------- empty / pregame

function emptyRink(title, text) {
  const rink = renderRink([], {});
  return `<div class="lab-rink-empty">
      <div class="rink-wrap">${rink.svg}</div>
      <div class="lab-rink-empty__msg"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>
    </div>`;
}

function pregamePanel(game) {
  const st = stateOf(game);
  const c = countdownParts(game.start_time_utc);
  const cd = c && !c.done ? (c.days ? `${c.days}d ${c.hours}h` : `${c.hours}h ${c.mins}m`) : null;
  const halted = ['POSTPONED', 'SUSPENDED', 'CANCELLED'].includes(st.key);
  const eyebrow = halted ? titleCase(st.key.toLowerCase()) : st.key === 'LIVE' || st.key === 'INTERMISSION' ? 'Live' : 'Pregame';
  return `<section class="pbe-panel lab-card lab-pregame">
      <span class="eyebrow">${esc(eyebrow)}</span>
      <h3>${esc(game.teams.away.name || game.teams.away.abbrev)} at ${esc(game.teams.home.name || game.teams.home.abbrev)}</h3>
      <p class="dim">${esc(dayET(game.start_time_utc, true))} · ${esc(timeET(game.start_time_utc))}${game.venue ? ` · ${esc(game.venue)}` : ''}</p>
      ${cd && !halted ? `<p class="mono lab-pregame__cd">Puck drop in ${esc(cd)}</p>` : ''}
      <ul class="lab-pregame__list">
        <li><span class="lab-pregame__k micro">Map</span><span>Each attempt is placed at its recorded play-by-play coordinates. Nothing is drawn before the first attempt.</span></li>
        <li><span class="lab-pregame__k micro">Totals</span><span>Corsi, Fenwick, SOG, strength and shot-type splits count from puck drop.</span></li>
        <li><span class="lab-pregame__k micro">Refresh</span><span>Every 10 seconds while the game is live.</span></li>
        <li><span class="lab-pregame__k micro">Danger</span><span><span class="pbe-badge pbe-badge--heuristic">Geometric heuristic · not xG</span></span></li>
      </ul>
    </section>`;
}

function definitions() {
  return `<footer class="lab-defs" aria-label="Definitions">
      <h3 class="micro">Definitions</h3>
      <dl>
        <div><dt>Corsi (CF)</dt><dd>All shot attempts: goals, shots on goal, missed and blocked.</dd></div>
        <div><dt>Fenwick (FF)</dt><dd>Unblocked attempts: Corsi minus blocked.</dd></div>
        <div><dt>geometric-v1</dt><dd>Distance and angle from the attacking net (goal line at x = ±89 ft). The attacking end comes from the play-level defending side, never from which net is closer. 0° is straight on; over 90° is behind the goal line.</dd></div>
        <div><dt>Danger bucket</dt><dd>High ≤ 25 ft and ≤ 45°; medium ≤ 45 ft and ≤ 60°; low otherwise. A geometric heuristic, not xG and not a probability.</dd></div>
        <div><dt>Blocked attempts</dt><dd>Location is the block location reported by the source, not where the shot was released. The shooting team comes from the game roster.</dd></div>
        <div><dt>Missing data</dt><dd>An attempt without coordinates stays in every total and in the table. It is never placed on the rink.</dd></div>
      </dl>
      <p class="micro">Source: NHL play-by-play. Full method on the <a class="gold link-u" href="#/methodology">Methodology</a> page.</p>
    </footer>`;
}

// ---------------------------------------------------------------- mount

export function mount(root, params, ctx) {
  const state = {
    gameId: params.gameId || null,
    data: null, meta: null, failed: false, error: null,
    layer: 'all', team: 'both', period: 'all', normalize: true,
    selected: null, sort: { key: 'order', dir: 1 }, showAll: false,
    pickDate: params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null,
    pickGames: [], pickLabel: '', pickLoading: true, pickRequested: false,
    // Landing resolution for #/shots with no game id: never a fixture id.
    resolving: false, resolution: null, resolveError: null
  };
  const aborter = new AbortController();

  root.innerHTML = `<section class="wrap section lab" data-fresh-scope>
    <div class="section-head lab-intro"><div><span class="eyebrow">Shot Lab · live spatial telemetry</span><h2>Every attempt, where it happened</h2></div>
      <p>Shot Lab is its own live analysis surface: during active games the rink, distance profile, strength splits, shot types and attempt ledger refresh every 5 seconds from official play-by-play. PBE Cast is the separate play-by-play desk. Attempts without coordinates are counted, never placed; danger buckets are geometric heuristics, not a model.</p></div>
    <div id="lab-picker"></div>
    <div id="lab-body"></div>
  </section>`;
  const picker = $('#lab-picker', root);
  const body = $('#lab-body', root);

  // Real dates only: "today" and the next scheduled slate both come from the
  // board this session already read. Nothing is written into this file.
  function jumpMarkup() {
    const today = todayET();
    const next = ctx.latestBoard?.data?.next_puck_drop?.date || null;
    const out = [];
    if (state.pickDate && state.pickDate !== today) out.push(`<button type="button" class="pbe-btn pbe-btn--sm pbe-btn--ghost" data-pick-date="${esc(today)}">Today</button>`);
    if (next && next !== state.pickDate) out.push(`<button type="button" class="pbe-btn pbe-btn--sm pbe-btn--ghost" data-pick-date="${esc(next)}">Next slate · ${esc(dateLabel(next))}</button>`);
    return out.length ? `<div class="row lab-pickbar__jump">${out.join('')}</div>` : '';
  }

  // Why a June game is on screen in September. Only shown when this game is
  // the one the landing resolver picked and it is not from today's slate.
  function landingNote() {
    const hit = cachedRecentCompleted();
    const top = hit?.games?.[0];
    if (!top || !state.gameId || String(top.id) !== String(state.gameId)) return '';
    if (!hit.date || hit.date === todayET()) return '';
    return `<p class="micro lab-pickbar__note">No NHL games today. Showing the most recent completed game on the schedule — ${esc(dateLabel(hit.date, { long: true }))}.</p>`;
  }

  function renderPicker() {
    picker.innerHTML = `<div class="lab-pickbar">
        <label class="lab-pickbar__date"><span class="micro">Slate</span>
          <input id="lab-date" class="lab-date mono" type="date" value="${esc(state.pickDate || '')}" aria-label="Choose a date to load its games"></label>
        <span class="lab-pickbar__label micro">${state.pickLoading ? 'Loading slate…' : esc(state.pickLabel)}</span>
        ${jumpMarkup()}
      </div>
      ${landingNote()}
      ${pickerMarkup(state.pickGames, state.gameId)}`;
  }

  let pickToken = 0;
  async function loadPicker(date) {
    const mine = ++pickToken;
    state.pickLoading = true;
    renderPicker();
    try {
      const target = date || todayET();
      let res = await ctx.board(target, { signal: aborter.signal });
      let games = res.data.games || [];
      let shown = target;
      let label = target === todayET() ? 'Today' : dateLabel(target, { long: true });
      if (!games.length && !date && res.data.next_puck_drop?.date) {
        shown = res.data.next_puck_drop.date;
        res = await ctx.board(shown, { signal: aborter.signal });
        games = res.data.games || [];
        label = `Next slate · ${dateLabel(shown, { long: true })}`;
      }
      if (mine !== pickToken) return;
      state.pickGames = games;
      state.pickDate = shown;
      state.pickLabel = games.length ? `${label} · ${plural(games.length, 'game')}` : `No NHL games · ${label}`;
    } catch (error) {
      if (error?.kind === 'aborted' || mine !== pickToken) return;
      state.pickGames = [];
      state.pickLabel = `Slate unavailable · ${describeError(error).title}`;
    }
    state.pickLoading = false;
    renderPicker();
  }

  function filteredShots() {
    return inPlay(state.data?.shots || []).filter(p => (state.team === 'both' || p.side === state.team)
      && (state.period === 'all' || String(p.period) === String(state.period))
      && layerMatch(p, state.layer));
  }

  function filterNote(game) {
    const layer = LAYERS.find(([k]) => k === state.layer)?.[1] || 'All attempts';
    const per = state.period === 'all' ? 'all periods' : periodLabel(Number(state.period), Number(state.period) > 3 ? 'OT' : 'REG');
    return `${layer} · ${per}${state.team !== 'both' ? ` · ${game.teams[state.team].abbrev} only` : ''}`;
  }

  function rinkPanel(game, shots) {
    const periods = [...new Set(inPlay(shots).map(p => p.period))].filter(Boolean).sort((x, y) => x - y);
    const rink = renderRink(shots, { layer: state.layer, team: state.team, period: state.period, normalize: state.normalize, teams: game.teams, highlight: state.selected });
    const omittedTotal = rink.omitted.coordinates + rink.omitted.direction;
    const sel = state.selected !== null ? shots.find(p => p.sort_order === state.selected) : null;
    const selPlace = sel ? plottable(sel, state.normalize) : null;
    const selHidden = sel && !filteredShots().includes(sel);
    return `<section class="pbe-panel lab-card lab-rink" id="lab-rink">
        <div class="panel-head"><h3>Shot map</h3><span class="micro">${rink.plotted} plotted${omittedTotal ? ` · ${omittedTotal} not plotted` : ''}</span></div>
        <div class="rink-controls">
          <div class="chips" role="group" aria-label="Shot layer">${LAYERS.map(([k, l]) => `<button type="button" class="chip" data-layer="${k}" aria-pressed="${state.layer === k}">${l}</button>`).join('')}</div>
          <div class="chips" role="group" aria-label="Team and period">${[['both', 'Both'], ['away', game.teams.away.abbrev], ['home', game.teams.home.abbrev]].map(([k, l]) => `<button type="button" class="chip" data-team="${k}" aria-pressed="${state.team === k}">${esc(l)}</button>`).join('')}
            <select class="chip chip-select lab-select" data-period aria-label="Period"><option value="all">All periods</option>${periods.map(p => `<option value="${p}" ${String(state.period) === String(p) ? 'selected' : ''}>${esc(periodLabel(p, p > 3 ? 'OT' : 'REG'))}</option>`).join('')}</select>
            <button type="button" class="chip" data-normalize aria-pressed="${state.normalize}" title="Rotate each team's attempts so away attacks left and home attacks right">Normalize ends</button>
          </div>
        </div>
        <div class="rink-ends micro" aria-hidden="true">${state.normalize ? `<span>← ${esc(game.teams.away.abbrev)} attack</span><span>${esc(game.teams.home.abbrev)} attack →</span>` : '<span>As recorded by source</span>'}</div>
        <div class="rink-wrap lab-rink__ice">${rink.svg}</div>
        ${rinkLegend()}
        ${omittedTotal ? `<p class="micro rink-omit">Not plotted: ${rink.omitted.coordinates ? `${rink.omitted.coordinates} without source coordinates` : ''}${rink.omitted.coordinates && rink.omitted.direction ? ' · ' : ''}${rink.omitted.direction ? `${rink.omitted.direction} with unknown attack direction (switch off “Normalize ends” to show as recorded)` : ''}. They remain in the table and totals.</p>` : ''}
        ${sel ? `<div class="lab-selected" role="status">
            <span class="micro">Selected</span>
            <span class="lab-selected__text">${esc(shotLabel(sel, game.teams))}${sel.shot.danger_bucket ? ` · ${esc(DANGER_LABEL[sel.shot.danger_bucket])} danger (heuristic)` : ''}${!selPlace.ok ? ` <span class="gold">· not plotted: ${esc(selPlace.why)}</span>` : selHidden ? ' <span class="gold">· hidden by the current filters</span>' : ''}</span>
            <button type="button" class="pbe-btn pbe-btn--sm pbe-btn--ghost" data-clear>Clear</button>
          </div>` : ''}
      </section>`;
  }

  function renderBody() {
    if (!state.gameId) {
      if (state.resolving) {
        body.innerHTML = '<div class="pbe-skeleton" style="height:96px;margin-bottom:16px"></div><div class="pbe-skeleton" style="height:460px"></div>';
        return;
      }
      const searched = state.resolution?.searchedFrom && state.resolution?.searchedTo
        ? ` Searched every NHL date from ${dateLabel(state.resolution.searchedFrom, { long: true })} to ${dateLabel(state.resolution.searchedTo, { long: true })}${state.resolution.date ? '' : ' and the last completed playoff window'}.`
        : '';
      const text = state.resolveError
        ? `${describeError(state.resolveError).title}. Pick a date above to load its games — nothing is shown from memory.`
        : `No completed game with recorded shot coordinates could be resolved from the schedule.${searched} Choose a game above, or pick any date to load its shot map.`;
      body.innerHTML = `<section class="pbe-panel lab-card lab-rink lab-rink--solo">
          ${emptyRink(state.resolveError ? 'Schedule unavailable.' : 'Pick a game.', text)}
          ${rinkLegend()}
        </section>
        ${definitions()}`;
      return;
    }
    if (!state.data) {
      body.innerHTML = state.error
        ? `<div class="pbe-error"><strong>${esc(describeError(state.error).title)}</strong>${esc(describeError(state.error).body)}</div>`
        : '<div class="pbe-skeleton" style="height:96px;margin-bottom:16px"></div><div class="lab-grid"><div class="pbe-skeleton" style="height:460px"></div><div class="pbe-skeleton" style="height:460px"></div></div>';
      return;
    }
    const data = state.data;
    const game = data.game;
    const shots = Array.isArray(data.shots) ? data.shots : [];
    const live = inPlay(shots);
    const st = stateOf(game);
    const errorNote = state.failed && state.error ? `<div class="pbe-note lab-note"><b>Refresh failed.</b> ${esc(describeError(state.error).body)} Showing the last successful read, marked STALE.</div>` : '';

    if (!live.length) {
      const halted = ['POSTPONED', 'SUSPENDED', 'CANCELLED'].includes(st.key);
      const title = halted ? `Game ${st.key.toLowerCase()}.` : 'No attempts recorded yet.';
      const text = halted ? 'The source lists this game as not completed. No shot data exists for it yet.' : 'Shot locations populate from the first recorded attempt.';
      // A completed game with no recorded attempt is a source gap, not an empty
      // game. Offer the next real completed game instead of inventing one.
      const fallback = st.key === 'FINAL' ? nextCompletedAfter(state.gameId) : null;
      body.innerHTML = `${gameHeader(data, state.meta, state.failed)}${errorNote}
        ${fallback ? `<div class="pbe-note lab-note"><b>The source recorded no attempt for this completed game.</b> Nothing is estimated. <a class="gold link-u" href="#/shots/${esc(fallback.id)}">Open the previous completed game (${esc(fallback.teams.away.abbrev)} @ ${esc(fallback.teams.home.abbrev)}, ${esc(dateLabel(fallback.date, { long: true }))})</a>.</div>` : ''}
        <div class="lab-grid">
          <section class="pbe-panel lab-card lab-rink">
            <div class="panel-head"><h3>Shot map</h3><span class="micro">0 plotted</span></div>
            ${emptyRink(title, text)}
            ${rinkLegend()}
          </section>
          <div class="lab-col">${pregamePanel(game)}</div>
        </div>
        ${definitions()}`;
      return;
    }

    const list = filteredShots();
    body.innerHTML = `${gameHeader(data, state.meta, state.failed)}${errorNote}
      <div class="lab-grid">
        ${rinkPanel(game, shots)}
        <div class="lab-col">
          ${summaryPanel(game, shots)}
          ${strengthPanel(game, shots)}
        </div>
      </div>
      <div class="lab-grid lab-grid--pair">
        ${histogramPanel(game, list, filterNote(game))}
        ${typePanel(game, shots)}
      </div>
      ${shotTable(game, list, state)}
      ${definitions()}`;
  }

  function select(id, { reveal = false } = {}) {
    state.selected = state.selected === id ? null : id;
    if (state.selected !== null && state.data) {
      const play = (state.data.shots || []).find(p => p.sort_order === state.selected);
      if (play && !filteredShots().includes(play)) { state.layer = 'all'; state.team = 'both'; state.period = 'all'; }
      if (play && !state.showAll && sortShots(filteredShots(), state.sort, state.data.game.teams).indexOf(play) >= ROW_LIMIT) state.showAll = true;
    }
    renderBody();
    if (reveal && state.selected !== null) {
      const rink = $('#lab-rink', body);
      if (rink) {
        const r = rink.getBoundingClientRect();
        const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nhl-topbar-h')) || 60;
        if (r.top < topbar || r.bottom > window.innerHeight) {
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          window.scrollTo({ top: window.scrollY + r.top - topbar - 12, behavior: reduce ? 'auto' : 'smooth' });
        }
      }
    }
  }

  const poller = state.gameId ? createPoller(async signal => {
    const res = await nhl(`/nhl/game/${state.gameId}/shots`, {}, { signal, timeout: 12000 });
    state.data = res.data; state.meta = res.meta; state.failed = false; state.error = null;
    if (!state.pickRequested) {
      state.pickRequested = true;
      loadPicker(state.pickDate || res.data.game?.date || null);
    }
    renderBody();
    const key = stateOf(res.data.game).key;
    if (key === 'LIVE' || key === 'INTERMISSION') return 5000;
    if (key === 'FINAL' || key === 'POSTPONED' || key === 'CANCELLED') return null;
    const until = Date.parse(res.data.game.start_time_utc) - Date.now();
    if (!Number.isFinite(until)) return 60000;
    return until < 20 * 60 * 1000 ? 20000 : until < 24 * 3600 * 1000 ? 60000 : 300000;
  }, {
    onError(error) {
      state.error = error;
      state.failed = Boolean(state.data);
      if (!state.pickRequested) {
        state.pickRequested = true;
        loadPicker(state.pickDate);
      }
      renderBody();
      return error.kind === 'not_deployed' || error.kind === 'legacy' ? null : 5000;
    }
  }) : null;

  // #/shots with no game id. The landing game is resolved from the live
  // schedule — the most recent live game, else the most recent completed one —
  // and never from an id written into this file. When the schedule genuinely
  // has no completed game to show, the page says so and offers the selector.
  async function landing() {
    state.resolving = true;
    renderBody();
    let hit = null;
    try {
      hit = await resolveRecentCompleted(ctx.board, { signal: aborter.signal });
    } catch (error) {
      if (error?.kind === 'aborted' || aborter.signal.aborted) return;
      state.resolveError = error;
    }
    if (aborter.signal.aborted) return;
    state.resolution = hit;
    state.resolving = false;
    if (hit?.games?.length) { location.replace(`#/shots/${hit.games[0].id}`); return; }
    renderBody();
    loadPicker(null);
  }

  renderPicker();
  renderBody();
  if (!state.gameId) {
    state.pickRequested = true;
    if (state.pickDate) loadPicker(state.pickDate);
    else landing();
  }
  poller?.start();

  const disposers = [
    on(root, 'click', '[data-layer]', (_, b) => { state.layer = b.dataset.layer; renderBody(); }),
    on(root, 'click', '[data-team]', (_, b) => { state.team = b.dataset.team; renderBody(); }),
    on(root, 'change', '[data-period]', (_, s) => { state.period = s.value; renderBody(); }),
    on(root, 'click', '[data-normalize]', () => { state.normalize = !state.normalize; renderBody(); }),
    on(root, 'click', '[data-clear]', () => { state.selected = null; renderBody(); }),
    on(root, 'click', '[data-show-all]', () => { state.showAll = !state.showAll; renderBody(); }),
    on(root, 'click', '[data-sort]', (_, b) => {
      const key = b.dataset.sort;
      state.sort = state.sort.key === key ? { key, dir: -state.sort.dir } : { key, dir: 1 };
      renderBody();
      $(`[data-sort="${key}"]`, body)?.focus({ preventScroll: true });
    }),
    on(root, 'click', 'tr[data-shot]', (event, tr) => {
      if (event.target.closest('a')) return;
      select(Number(tr.dataset.shot), { reveal: true });
    }),
    on(root, 'keydown', 'tr[data-shot]', (event, tr) => {
      if (event.target.closest('a')) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(Number(tr.dataset.shot), { reveal: true }); }
    }),
    on(root, 'click', '.lab-rink__ice .mk-g', (_, g) => {
      const id = Number(g.dataset.sort);
      if (Number.isFinite(id)) select(id);
    }),
    on(root, 'change', '#lab-date', (_, input) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.value)) return;
      state.pickGames = [];
      loadPicker(input.value);
    }),
    on(root, 'click', '[data-pick-date]', (_, b) => {
      state.pickGames = [];
      loadPicker(b.dataset.pickDate);
    })
  ];

  return () => {
    poller?.stop();
    aborter.abort();
    pickToken += 1;
    disposers.forEach(d => d());
  };
}
