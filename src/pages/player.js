import { $, esc, on, safeUrl } from '../lib/dom.js';
import { describeError, news, nhl } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { ageText, dateLabel, dayET, n, num, pct, svPct, timeET, todayET } from '../lib/format.js';
import { TEAM_BY_ABBREV, teamAccent } from '../lib/teams.js';
import { teamMark } from '../components/game.js';
import { playerIdentity, playerPhoto, photoCredit } from '../components/player.js';
import { fightEvents, fightOutcomeForPlayer } from '../lib/fights.js';

// ---- private helpers (lane-local by contract)
const seasonLabel = s => {
  const t = String(s ?? '');
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}–${t.slice(6, 8)}` : '';
};
const typeLabel = t => (Number(t) === 3 ? 'playoffs' : 'regular season');
const txt = v => (v && typeof v === 'object' ? v.default || '' : v || '');
const POS = { C: 'Center', L: 'Left wing', R: 'Right wing', D: 'Defense', G: 'Goalie' };
const toSec = mmssText => {
  const m = /^(\d+):(\d{2})$/.exec(String(mmssText || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
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
function currentSeasonId(anchor = todayET()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(anchor || ''));
  const year = m ? Number(m[1]) : new Date().getUTCFullYear();
  const month = m ? Number(m[2]) : new Date().getUTCMonth() + 1;
  const start = month >= 7 ? year : year - 1;
  return Number(`${start}${start + 1}`);
}
const gamePim = row => n(
  row?.pim
  ?? row?.penaltyMinutes
  ?? row?.penaltyMins
  ?? row?.penalty_minutes
  ?? row?.penaltyMinutesTotal
);
const gameTypeShort = value => Number(value) === 1 ? 'PRE' : Number(value) === 3 ? 'POST' : 'REG';

const signedNum = v => {
  const x = n(v);
  if (x === null) return '—';
  return x > 0 ? `+${x}` : x < 0 ? `−${Math.abs(x)}` : '0';
};
const errorBox = (error, playerId) => {
  const details = String(error?.payload?.details || '');
  if (/upstream_404/.test(details)) {
    return `<div class="pbe-empty"><h3>No NHL player with id ${esc(playerId)}.</h3><p>The NHL source has no player record for this id. Find players through the <a class="gold" href="#/players">leader boards</a> or a club roster.</p></div>`;
  }
  const e = describeError(error);
  return `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`;
};
const panelHead = (title, right = '') => `<div class="panel-head"><h2>${esc(title)}</h2>${right}</div>`;
const newsTime = iso => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? ageText((Date.now() - t) / 1000) : '';
};

// Latest NHL season with a row of the given game type. Traded players have one
// row per club: counting stats are summed and rates recomputed from the sums.
function seasonTotals(rows, gameType, season = null) {
  const nhlRows = (rows || []).filter(r => r.leagueAbbrev === 'NHL' && Number(r.gameTypeId) === gameType);
  if (!nhlRows.length) return null;
  const target = season ?? Math.max(...nhlRows.map(r => Number(r.season)));
  const list = nhlRows.filter(r => Number(r.season) === Number(target));
  if (!list.length) return null;
  const sum = k => list.reduce((acc, r) => (n(r[k]) === null ? acc : (acc ?? 0) + Number(r[k])), null);
  const out = { season: target, teams: [...new Set(list.map(r => txt(r.teamName)).filter(Boolean))], rows: list.length };
  for (const k of ['gamesPlayed', 'goals', 'assists', 'points', 'plusMinus', 'pim', 'powerPlayGoals', 'powerPlayPoints', 'shorthandedGoals', 'gameWinningGoals', 'shots',
    'gamesStarted', 'wins', 'losses', 'otLosses', 'shutouts', 'shotsAgainst', 'goalsAgainst']) out[k] = sum(k);
  if (list.length === 1) {
    const r = list[0];
    out.shootingPctg = r.shootingPctg; out.avgToiSec = toSec(r.avgToi);
    out.savePctg = r.savePctg; out.gaa = r.goalsAgainstAvg;
  } else {
    out.shootingPctg = out.shots ? out.goals / out.shots : null;
    const toiW = list.reduce((a, r) => (toSec(r.avgToi) !== null && n(r.gamesPlayed) ? a + toSec(r.avgToi) * r.gamesPlayed : a), 0);
    out.avgToiSec = out.gamesPlayed ? toiW / out.gamesPlayed || null : null;
    out.savePctg = out.shotsAgainst ? (out.shotsAgainst - out.goalsAgainst) / out.shotsAgainst : null;
    const toiTotal = list.reduce((a, r) => a + (toSec(r.timeOnIce) || 0), 0);
    out.gaa = toiTotal ? (out.goalsAgainst * 3600) / toiTotal : null;
  }
  return out;
}

// Player identity hero: approved licensed portrait when one exists, otherwise
// the shared team-accented identity card (components/player.js).
function monogram(p) {
  return playerIdentity({
    id: p.id,
    name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`,
    team: p.current_team_abbrev,
    // The profile payload already carries the league's own headshot URL; use
    // it rather than rebuilding one from the club abbreviation.
    headshot: p.headshot,
    number: p.sweater_number,
    size: 'xl',
    credit: true,
    priority: true
  });
}

function headerMarkup(p, meta, nextGame) {
  const goalie = p.position === 'G';
  const team = p.current_team_abbrev;
  const known = TEAM_BY_ABBREV.has(team);
  const age = ageOn(p.birth_date);
  const born = [txt(p.birth_city), txt(p.birth_state_province), txt(p.birth_country)].filter(Boolean).join(', ');
  return `<header class="rs-phead" style="--accent:${teamAccent(team)}">
    ${monogram(p)}
    <div class="rs-phead__id">
      <span class="eyebrow">${esc(POS[p.position] || p.position || 'Player')}${p.sweater_number ? ` · #${esc(p.sweater_number)}` : ''}${p.is_active === false ? ' · inactive' : ''}</span>
      <h1 class="pbe-display">${esc(p.full_name || `${p.first_name || ''} ${p.last_name || ''}`)}</h1>
    </div>
    ${playerPhoto(p.id) ? `<small class="rs-phead__credit">${esc(photoCredit(playerPhoto(p.id)))}</small>` : ''}
    <p class="rs-phead__team">${team ? `${known ? `<a href="#/team/${esc(team)}">` : '<span>'}${teamMark({ abbrev: team, logo: p.team_logo }, 26)}<b>${esc(p.current_team_name || team)}</b>${known ? '</a>' : '</span>'}` : '<span class="dim">No current NHL club listed</span>'}
      ${nextGame || ''}</p>
    <div class="rs-phead__stamp">${freshStamp(meta)}</div>
    <dl class="kv rs-kvfix rs-phead__kv">
      <div><dt>${goalie ? 'Catches' : 'Shoots'}</dt><dd>${esc(p.shoots_catches || '—')}</dd></div>
      <div><dt>Age</dt><dd>${age ?? '—'}</dd></div>
      <div><dt>Height</dt><dd>${esc(heightText(p.height_inches))}</dd></div>
      <div><dt>Weight</dt><dd>${p.weight_pounds ? `${esc(p.weight_pounds)} lb` : '—'}</dd></div>
      <div class="rs-kv-wide"><dt>Born</dt><dd class="rs-born">${esc(p.birth_date ? dateLabel(p.birth_date).replace(/^\w+, /, '') + `, ${p.birth_date.slice(0, 4)}` : '—')}${born ? ` · ${esc(born)}` : ''}</dd></div>
    </dl>
  </header>`;
}

function seasonLine(p, totals, gameType, fightState = {}) {
  const goalie = p.position === 'G';
  if (!totals) return `${panelHead('Season line')}<p class="dim">No NHL ${esc(typeLabel(gameType))} row in this player's season totals.</p>`;
  const label = `${seasonLabel(totals.season)} ${typeLabel(gameType)}`;
  const cell = (k, v) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
  const f = fightState?.data;
  const fightRecord = f ? `${f.wins || 0}-${f.losses || 0}-${f.draws || 0}` : '—';
  const cells = goalie
    ? [cell('GP', num(totals.gamesPlayed)), cell('GS', num(totals.gamesStarted)), cell('W', num(totals.wins)), cell('L', num(totals.losses)), cell('OTL', num(totals.otLosses)),
      cell('SV%', svPct(totals.savePctg)), cell('GAA', num(totals.gaa, 2)), cell('SA', num(totals.shotsAgainst)), cell('SO', num(totals.shutouts)),
      cell('FIGHT W-L-D', `<b>${esc(fightRecord)}</b>`)]
    : [cell('GP', num(totals.gamesPlayed)), cell('G', num(totals.goals)), cell('A', num(totals.assists)), cell('P', `<b>${num(totals.points)}</b>`), cell('+/−', signedNum(totals.plusMinus)),
      cell('PIM', num(totals.pim)), cell('PPG', num(totals.powerPlayGoals)), cell('PPP', num(totals.powerPlayPoints)), cell('SOG', num(totals.shots)),
      cell('SOG/GP', totals.gamesPlayed ? (totals.shots / totals.gamesPlayed).toFixed(2) : '—'), cell('S%', pct(totals.shootingPctg, 1)), cell('TOI/GP', mmss(totals.avgToiSec)),
      cell('FIGHT W-L-D', `<b>${esc(fightRecord)}</b>`)];
  return `${panelHead(`${label} line`, `<span class="micro">NHL · ${esc(totals.teams.join(' / ') || '')}${totals.rows > 1 ? ' · combined' : ''}</span>`)}
    <dl class="kv rs-kvfix rs-season-kv">${cells.join('')}</dl>`;
}

// Single-series bar chart: SVG plot stretched to the column, HTML labels so
// text never scales below the type floor.
function barChart(input, { avg = null, avgText = '', label, valueFmt = v => String(v) }) {
  if (!input.length) return '';
  // Short windows keep a fixed slot width instead of stretching a few bars.
  const points = input.concat(Array.from({ length: Math.max(0, 10 - input.length) }, () => ({ v: null, axis: '', title: '' })));
  const N = points.length;
  const max = Math.max(1, ...points.map(p => n(p.v) ?? 0), avg ?? 0);
  const H = 100;
  const y = v => H - (v / max) * (H - 4);
  const bars = points.map((p, i) => {
    const v = n(p.v);
    if (v === null || p.v === undefined) return '';
    const h = Math.max(v === 0 ? 0 : 1.5, H - y(v));
    return `<rect x="${i * 10 + 2}" y="${(H - h).toFixed(2)}" width="6" height="${h.toFixed(2)}" class="rs-bar-rect${p.hi ? ' is-hi' : ''}"><title>${esc(p.title)}</title></rect>`;
  }).join('');
  const avgLine = avg !== null ? `<line x1="0" x2="${input.length * 10}" y1="${y(avg).toFixed(2)}" y2="${y(avg).toFixed(2)}" class="rs-avg" vector-effect="non-scaling-stroke"/>` : '';
  const key = i => (i % 4 === 0 || i === N - 1 ? ' class="k"' : '');
  return `<figure class="rs-chart" style="--n:${N}">
    <div class="rs-chart__vals" aria-hidden="true">${points.map((p, i) => `<span${key(i)}>${n(p.v) === null ? '' : esc(valueFmt(p.v))}</span>`).join('')}</div>
    <svg class="rs-chart__svg" viewBox="0 0 ${N * 10} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">
      <line x1="0" x2="${N * 10}" y1="${H}" y2="${H}" class="rs-base" vector-effect="non-scaling-stroke"/>${avgLine}${bars}
    </svg>
    <div class="rs-chart__axis" aria-hidden="true">${points.map((p, i) => `<span${key(i)}>${esc(p.axis)}</span>`).join('')}</div>
    ${avg !== null ? `<figcaption class="rs-chart__cap"><i class="rs-avg-key" aria-hidden="true"></i>${esc(avgText)}</figcaption>` : ''}
  </figure>`;
}

// SV% by game: a line on a stated domain (rates need no zero baseline), HTML dots.
function lineChart(points, { avg = null, avgText = '', label }) {
  const N = points.length;
  const vals = points.map(p => n(p.v)).filter(v => v !== null);
  if (!N || !vals.length) return '<p class="dim small">No game with shots against in this window.</p>';
  const lo = Math.min(0.8, Math.floor(Math.min(...vals) * 20) / 20);
  const hi = 1;
  const yPct = v => ((hi - v) / (hi - lo)) * 100;
  const segs = [];
  let cur = [];
  points.forEach((p, i) => {
    const v = n(p.v);
    if (v === null) { if (cur.length) segs.push(cur); cur = []; return; }
    cur.push(`${i * 10 + 5},${yPct(v).toFixed(2)}`);
  });
  if (cur.length) segs.push(cur);
  return `<figure class="rs-chart rs-chart--line" style="--n:${N}">
    <div class="rs-line-plot">
      <span class="rs-line-y rs-line-y--top">${svPct(hi)}</span><span class="rs-line-y rs-line-y--bot">${svPct(lo)}</span>
      <svg class="rs-chart__svg" viewBox="0 0 ${N * 10} 100" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">
        <line x1="0" x2="${N * 10}" y1="100" y2="100" class="rs-base" vector-effect="non-scaling-stroke"/>
        ${avg !== null ? `<line x1="0" x2="${N * 10}" y1="${yPct(avg).toFixed(2)}" y2="${yPct(avg).toFixed(2)}" class="rs-avg" vector-effect="non-scaling-stroke"/>` : ''}
        ${segs.map(s => `<polyline points="${s.join(' ')}" class="rs-line" vector-effect="non-scaling-stroke"/>`).join('')}
      </svg>
      ${points.map((p, i) => (n(p.v) === null ? '' : `<i class="rs-dot" style="left:${(((i + 0.5) / N) * 100).toFixed(2)}%;top:${yPct(p.v).toFixed(2)}%" title="${esc(p.title)}"></i>`)).join('')}
    </div>
    <div class="rs-chart__axis" aria-hidden="true">${points.map((p, i) => `<span${i % 4 === 0 || i === N - 1 ? ' class="k"' : ''}>${esc(p.axis)}</span>`).join('')}</div>
    <figcaption class="rs-chart__cap"><i class="rs-avg-key" aria-hidden="true"></i>${esc(avgText)} · axis ${esc(svPct(lo))}–${esc(svPct(hi))}</figcaption>
  </figure>`;
}

function frequencyTable(log) {
  const chron = log.slice().reverse(); // oldest -> newest
  const windows = [];
  if (chron.length > 10) windows.push([10, 'Last 10']);
  if (chron.length > 20) windows.push([20, 'Last 20']);
  windows.push([chron.length, `All ${chron.length}`]);
  const tests = [['SOG ≥ 2', r => n(r.shots) >= 2], ['SOG ≥ 3', r => n(r.shots) >= 3], ['SOG ≥ 4', r => n(r.shots) >= 4], ['Points ≥ 1', r => n(r.points) >= 1]];
  return `<div class="table-wrap"><table class="pbe-table rs-freq">
    <thead><tr><th>Outcome</th>${windows.map(([, l]) => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead>
    <tbody>${tests.map(([label, test]) => `<tr><td>${esc(label)}</td>${windows.map(([w]) => {
      const games = chron.slice(-w);
      const hits = games.filter(test).length;
      return `<td class="num"><b>${hits}/${games.length}</b> <span class="rs-freq__pct">${games.length ? Math.round((hits / games.length) * 100) : 0}%</span></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function chartsSection(p, logState, totals) {
  const goalie = p.position === 'G';
  if (logState.error) return panelHead(goalie ? 'Workload' : 'Shot volume') + errorBox(logState.error, p.id);
  if (!logState.data) return panelHead(goalie ? 'Workload' : 'Shot volume') + '<div class="pbe-skeleton" style="height:220px"></div>';
  const log = logState.data.game_log || [];
  const season = `${seasonLabel(logState.data.season)} ${typeLabel(logState.data.game_type)}`;
  if (!log.length) return `${panelHead(goalie ? 'Workload' : 'Shot volume')}<p class="dim">No ${esc(season)} games in the source game log.</p>`;
  const last = log.slice(0, 20).reverse();
  const axis = r => `${r.homeRoadFlag === 'R' ? '@' : ''}${r.opponentAbbrev || ''}`;
  const when = r => `${dateLabel(r.gameDate)} ${r.homeRoadFlag === 'R' ? '@' : 'vs'} ${r.opponentAbbrev}`;
  if (!goalie) {
    const totalShots = log.reduce((a, r) => a + (n(r.shots) || 0), 0);
    const avg = totalShots / log.length;
    return `${panelHead('Shots on goal by game', `<span class="micro">${esc(season)} · last ${last.length}</span>`)}
      ${barChart(last.map(r => ({ v: r.shots, axis: axis(r), title: `${when(r)}: ${num(r.shots)} SOG` })), {
        avg, avgText: `Dashed = ${avg.toFixed(2)} SOG/GP across all ${log.length} logged games`, label: `Shots on goal per game, last ${last.length} games, ${season}`
      })}
      <h3 class="rs-h4">Historical frequency</h3>
      ${frequencyTable(log)}
      <p class="micro rs-freq-note">Historical frequency over ${log.length} games (${esc(season)}) — not a probability or a projection.</p>`;
  }
  const sa = last.map(r => ({ v: r.shotsAgainst, axis: axis(r), title: `${when(r)}: ${num(r.shotsAgainst)} SA, ${num(r.goalsAgainst)} GA${Number(r.gamesStarted) ? '' : ' (relief)'}` }));
  const saTotal = log.reduce((a, r) => a + (n(r.shotsAgainst) || 0), 0);
  const gaTotal = log.reduce((a, r) => a + (n(r.goalsAgainst) || 0), 0);
  const sv = last.map(r => ({ v: n(r.shotsAgainst) ? r.savePctg : null, axis: axis(r), title: `${when(r)}: ${svPct(r.savePctg)} (${num(r.shotsAgainst)} SA)` }));
  const seasonSv = totals?.savePctg ?? (saTotal ? (saTotal - gaTotal) / saTotal : null);
  return `${panelHead('Shots against by game', `<span class="micro">${esc(season)} · last ${last.length} appearances</span>`)}
    ${barChart(sa, { avg: saTotal / log.length, avgText: `Dashed = ${(saTotal / log.length).toFixed(1)} SA per appearance across ${log.length} logged games`, label: `Shots against per game, last ${last.length} appearances, ${season}` })}
    <h3 class="rs-h4">Save % by game</h3>
    ${lineChart(sv, { avg: n(seasonSv), avgText: `Dashed = ${svPct(seasonSv)} ${seasonLabel(logState.data.season)} ${typeLabel(logState.data.game_type)} SV%`, label: `Save percentage per game, last ${last.length} appearances` })}
    <p class="micro rs-freq-note">GSAx: not available — requires a validated xG model, none is released.</p>`;
}

function gameLogSection(p, logState, gameType, hasPlayoffs) {
  const goalie = p.position === 'G';
  const toggles = hasPlayoffs ? `<div class="chips" role="group" aria-label="Game type">${[[2, 'Regular season'], [3, 'Playoffs']].map(([k, l]) => `<button class="chip" data-gt="${k}" aria-pressed="${gameType === k}">${l}</button>`).join('')}</div>` : '';
  if (logState.error) return `${panelHead('Game log')}${toggles}${errorBox(logState.error, p.id)}`;
  if (!logState.data) return `${panelHead('Game log')}${toggles}<div class="pbe-skeleton" style="height:360px"></div>`;
  const d = logState.data;
  const log = d.game_log || [];
  const season = `${seasonLabel(d.season)} ${typeLabel(d.game_type)}`;
  const opp = r => {
    const o = r.opponentAbbrev;
    return `<span class="rs-opp"><span class="rs-ha">${r.homeRoadFlag === 'R' ? '@' : 'vs'}</span>${TEAM_BY_ABBREV.has(o) ? `<a href="#/team/${esc(o)}"><b>${esc(o)}</b></a>` : `<b>${esc(o || '—')}</b>`}</span>`;
  };
  const date = r => {
    const [wd, md] = dateLabel(r.gameDate).split(', ');
    return `<a href="#/cast/${esc(r.gameId)}" title="Replay in PBE Cast"><span class="rs-wd">${esc(wd)}, </span>${esc(md || '')}</a>`;
  };
  const head = goalie
    ? '<th>Date</th><th>Opp</th><th class="rs-hide-sm">H/A</th><th class="num" title="Shots against">SA</th><th class="num" title="Goals against">GA</th><th class="num">SV%</th><th>Dec</th><th class="num" title="Games started">GS</th><th class="num">TOI</th>'
    : '<th>Date</th><th>Opp</th><th class="rs-hide-sm">H/A</th><th class="num" title="Shots on goal">SOG</th><th class="num">G</th><th class="num">A</th><th class="num">P</th><th class="num">TOI</th><th class="num" title="Power-play goals">PPG</th>';
  const rowsHtml = log.map(r => goalie
    ? `<tr><td>${date(r)}</td><td>${opp(r)}</td><td class="rs-hide-sm">${r.homeRoadFlag === 'R' ? 'A' : 'H'}</td><td class="num">${num(r.shotsAgainst)}</td><td class="num">${num(r.goalsAgainst)}</td><td class="num"><b>${n(r.shotsAgainst) ? svPct(r.savePctg) : '—'}</b></td><td>${esc(r.decision || '—')}</td><td class="num">${num(r.gamesStarted)}</td><td class="num">${esc(r.toi || '—')}</td></tr>`
    : `<tr><td>${date(r)}</td><td>${opp(r)}</td><td class="rs-hide-sm">${r.homeRoadFlag === 'R' ? 'A' : 'H'}</td><td class="num"><b>${num(r.shots)}</b></td><td class="num">${num(r.goals)}</td><td class="num">${num(r.assists)}</td><td class="num">${num(r.points)}</td><td class="num">${esc(r.toi || '—')}</td><td class="num">${num(r.powerPlayGoals)}</td></tr>`).join('');
  return `${panelHead(`${season} game log`, freshStamp(logState.meta, { label: `${season} · ${log.length} games` }))}
    <div class="rs-bar">${toggles}<span class="micro">Dates are NHL game dates (ET) · tap a date to replay in PBE Cast</span></div>
    ${log.length ? `<div class="table-wrap rs-log-wrap"><table class="pbe-table rs-log"><thead><tr>${head}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`
      : `<p class="dim">No ${esc(season)} games in the source game log.</p>`}`;
}

function fightSection(p, s) {
  const title = 'Fan-voted fight record';
  if (s.error) {
    return `${panelHead(title)}<p class="dim small">Fight history is temporarily unavailable. Game and player stats remain unaffected.</p>`;
  }
  if (!s.data) {
    return `${panelHead(title)}<div class="pbe-skeleton" style="height:180px"></div>`;
  }
  const d = s.data;
  const fights = d.fights || [];
  const record = `${d.wins || 0}-${d.losses || 0}-${d.draws || 0}`;
  const decided = (d.wins || 0) + (d.losses || 0) + (d.draws || 0);
  const winPct = decided ? Math.round(((d.wins || 0) / decided) * 100) : null;
  const rows = fights.map(item => {
    const r = item.fight?.result || {};
    const vote = r?.type === 'fan_vote' && r?.status === 'available'
      ? [Number.isFinite(Number(r.winner_pct)) ? `${Number(r.winner_pct)}% winner vote` : null,
         Number.isFinite(Number(r.vote_count)) ? `${Number(r.vote_count)} vote${Number(r.vote_count) === 1 ? '' : 's'}` : null,
         Number.isFinite(Number(r.rating)) ? `rating ${Number(r.rating).toFixed(1)}/10` : null].filter(Boolean).join(' · ')
      : 'Fan-vote result pending';
    const badge = item.outcome === 'WIN' ? 'pbe-badge--good'
      : item.outcome === 'LOSS' ? 'pbe-badge--alert'
        : item.outcome === 'DRAW' ? 'pbe-badge--sched' : '';
    return `<li class="rs-fight-row">
      <div class="rs-fight-row__result"><span class="pbe-badge ${badge}">${esc(item.outcome)}</span></div>
      <div class="rs-fight-row__main">
        <strong>${esc(item.opponent?.name || 'Opponent not listed')}</strong>
        <span class="micro">${esc(item.opponent?.team_abbrev || '')}${item.game_type ? ` · ${esc(gameTypeShort(item.game_type))}` : ''}${item.date ? ` · ${esc(dateLabel(item.date))}` : ''}${item.fight?.period ? ` · P${esc(item.fight.period)} ${esc(item.fight.clock || '')}` : ''}</span>
        <span class="micro dim">${esc(vote)}</span>
      </div>
      ${item.game_id ? `<a class="rs-fight-row__cast" href="#/cast/${esc(item.game_id)}">PBE Cast →</a>` : ''}
    </li>`;
  }).join('');
  return `${panelHead(title, `<span class="micro">${esc(seasonLabel(d.season))} · NHL fight occurrence + fan vote</span>`)}
    <div class="rs-fight-summary">
      <div class="rs-fight-record"><span class="eyebrow">FIGHT W-L-D</span><b>${esc(record)}</b><small>${d.total || 0} documented fight${d.total === 1 ? '' : 's'}${d.pending ? ` · ${d.pending} pending` : ''}</small></div>
      <dl class="kv rs-kvfix rs-fight-kv">
        <div><dt>Fights</dt><dd>${num(d.total)}</dd></div>
        <div><dt>FW</dt><dd>${num(d.wins)}</dd></div>
        <div><dt>FL</dt><dd>${num(d.losses)}</dd></div>
        <div><dt>FD</dt><dd>${num(d.draws)}</dd></div>
        <div><dt>Win%</dt><dd>${winPct === null ? '—' : `${winPct}%`}</dd></div>
      </dl>
    </div>
    <p class="micro rs-fight-note">Fight occurrence is documented from paired NHL fighting majors in PBE Cast. W-L-D uses HockeyFights fan voting delivered through PropSports and is not an official NHL decision.</p>
    ${rows ? `<ol class="rs-fight-list">${rows}</ol>` : '<p class="dim small">No documented fights in the current NHL season yet.</p>'}`;
}

function careerSection(p) {
  const c = p.career_totals || {};
  const goalie = p.position === 'G';
  const rows = [['Regular season', c.regularSeason], ['Playoffs', c.playoffs]].filter(([, r]) => r && n(r.gamesPlayed));
  if (!rows.length) return `${panelHead('NHL career')}<p class="dim small">No NHL career totals in the source record.</p>`;
  const head = goalie
    ? '<th></th><th class="num">GP</th><th class="num">W</th><th class="num">L</th><th class="num">OTL</th><th class="num">SV%</th><th class="num">GAA</th><th class="num">SO</th>'
    : '<th></th><th class="num">GP</th><th class="num">G</th><th class="num">A</th><th class="num">P</th><th class="num">PPG</th><th class="num">SOG</th><th class="num">TOI/GP</th>';
  const body = rows.map(([l, r]) => goalie
    ? `<tr><td>${l}</td><td class="num">${num(r.gamesPlayed)}</td><td class="num">${num(r.wins)}</td><td class="num">${num(r.losses)}</td><td class="num">${num(r.otLosses)}</td><td class="num">${svPct(r.savePctg)}</td><td class="num">${num(r.goalsAgainstAvg, 2)}</td><td class="num">${num(r.shutouts)}</td></tr>`
    : `<tr><td>${l}</td><td class="num">${num(r.gamesPlayed)}</td><td class="num">${num(r.goals)}</td><td class="num">${num(r.assists)}</td><td class="num"><b>${num(r.points)}</b></td><td class="num">${num(r.powerPlayGoals)}</td><td class="num">${num(r.shots)}</td><td class="num">${esc(r.avgToi || '—')}</td></tr>`).join('');
  return `${panelHead('NHL career')}<div class="table-wrap"><table class="pbe-table rs-career"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function newsSection(p, s) {
  if (s.error) return `${panelHead('Related headlines')}<p class="dim small">Newsroom ${s.error.kind === 'not_deployed' || s.error.kind === 'legacy' ? 'is not connected in this build' : 'is unavailable right now'}.</p>`;
  if (!s.data) return `${panelHead('Related headlines')}<div class="pbe-skeleton" style="height:120px"></div>`;
  const id = Number(p.id);
  const items = (s.data.items || []).filter(i => (i.players || []).some(x => Number(x.id) === id)).slice(0, 8);
  return `${panelHead('Related headlines', freshStamp(s.meta, { source: 'Newsroom' }))}
    ${items.length ? `<ol class="rs-news">${items.map(item => {
      const url = safeUrl(item.url);
      const yahoo = /yahoo/i.test(item.source || '') || /yahoo/i.test(item.via || '');
      const src = yahoo ? `${item.publisher || 'Yahoo Sports'} · via Yahoo Sports` : (item.source || item.publisher || 'Source');
      return `<li class="rs-news__item">${item.category ? `<span class="pbe-badge pbe-badge--${item.material ? 'alert' : 'sched'}">${esc(item.category)}</span>` : ''}
        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener nofollow">${esc(item.title)}<span class="sr-only"> (opens source site)</span></a>` : `<span>${esc(item.title)}</span>`}
        <span class="micro">${esc(src)}${item.published_at ? ` · ${esc(newsTime(item.published_at))}` : ''}</span></li>`;
    }).join('')}</ol>` : `<p class="dim small">No headline in the current newsroom window (${(s.data.items || []).length} items) is tagged to this player.</p>`}`;
}

export function mount(root, params) {
  const id = params.playerId;
  const st = { player: {}, log: {}, fights: {}, news: {}, next: null, gameType: 2, season: null, hasPlayoffs: false, totals: null };
  root.innerHTML = `<section class="wrap section rs-player"><div id="rs-p-head"><div class="pbe-skeleton" style="height:180px"></div></div>
    <div id="rs-p-body"></div></section>`;
  const headEl = $('#rs-p-head', root);
  const bodyEl = $('#rs-p-body', root);
  const controller = new AbortController();
  const signal = controller.signal;
  let logCtl = null;

  const renderHead = () => {
    const p = st.player.data?.player;
    if (st.player.error) { headEl.innerHTML = errorBox(st.player.error, id); return; }
    if (!p) return;
    headEl.innerHTML = headerMarkup(p, st.player.meta, st.next);
  };
  const renderBody = () => {
    const p = st.player.data?.player;
    if (!p) { bodyEl.innerHTML = ''; return; }
    bodyEl.innerHTML = `
      <section class="pbe-panel rs-p-season">${seasonLine(p, st.totals, st.gameType, st.fights)}</section>
      <section class="pbe-panel rs-p-fights">${fightSection(p, st.fights)}</section>
      <div class="rs-player-grid">
        <section class="pbe-panel" id="rs-p-charts">${chartsSection(p, st.log, st.totals)}</section>
        <div class="rs-col">
          <section class="pbe-panel">${newsSection(p, st.news)}</section>
          <section class="pbe-panel">${careerSection(p)}</section>
        </div>
      </div>
      <section class="pbe-panel rs-p-log">${gameLogSection(p, st.log, st.gameType, st.hasPlayoffs)}</section>`;
  };

  const loadFights = async () => {
    const season = currentSeasonId();
    st.fights = {};
    renderBody();
    try {
      const segments = await Promise.all([1, 2, 3].map(async gameType => {
        try {
          const res = await nhl(`/nhl/player/${id}/game-log`, { season, gameType }, { signal });
          return { gameType, rows: res.data?.game_log || [] };
        } catch (error) {
          if (error.kind === 'aborted') throw error;
          return { gameType, rows: [] };
        }
      }));

      const candidates = new Map();
      let pimFieldSeen = false;
      for (const segment of segments) {
        for (const row of segment.rows) {
          const pim = gamePim(row);
          if (pim !== null) pimFieldSeen = true;
          if (pim === null || pim < 5 || !row.gameId) continue;
          candidates.set(String(row.gameId), {
            game_id: String(row.gameId),
            date: row.gameDate || null,
            game_type: segment.gameType
          });
        }
      }

      const documented = [];
      const queue = [...candidates.values()];
      for (let i = 0; i < queue.length; i += 4) {
        const batch = queue.slice(i, i + 4);
        const casts = await Promise.all(batch.map(async candidate => {
          try {
            const res = await nhl(`/nhl/game/${candidate.game_id}/cast`, {}, { signal, timeout: 9000 });
            return { candidate, cast: res.data };
          } catch (error) {
            if (error.kind === 'aborted') throw error;
            return null;
          }
        }));
        for (const hit of casts.filter(Boolean)) {
          for (const fight of fightEvents(hit.cast)) {
            if (!(fight.fighters || []).some(x => String(x.player_id) === String(id))) continue;
            const classified = fightOutcomeForPlayer(fight, id);
            if (classified.outcome === 'UNRELATED') continue;
            documented.push({
              game_id: hit.candidate.game_id,
              date: hit.cast?.game?.date || hit.candidate.date,
              game_type: hit.cast?.game?.game_type || hit.candidate.game_type,
              fight,
              outcome: classified.outcome,
              opponent: classified.opponent || null
            });
          }
        }
      }

      documented.sort((a, b) => {
        const da = String(a.date || '');
        const db = String(b.date || '');
        if (da !== db) return db.localeCompare(da);
        return Number(b.fight?.first_sort_order || 0) - Number(a.fight?.first_sort_order || 0);
      });
      const wins = documented.filter(x => x.outcome === 'WIN').length;
      const losses = documented.filter(x => x.outcome === 'LOSS').length;
      const draws = documented.filter(x => x.outcome === 'DRAW').length;
      const pending = documented.filter(x => x.outcome === 'PENDING').length;
      st.fights = {
        data: {
          season,
          total: documented.length,
          wins,
          losses,
          draws,
          pending,
          fights: documented,
          candidate_games: queue.length,
          pim_field_seen: pimFieldSeen
        }
      };
    } catch (error) {
      if (error.kind !== 'aborted') st.fights = { error };
    }
    if (!signal.aborted) renderBody();
  };

  const loadLog = () => {
    logCtl?.abort();
    logCtl = new AbortController();
    const mine = logCtl;
    st.log = {};
    renderBody();
    const q = st.season ? { season: st.season, gameType: st.gameType } : {};
    nhl(`/nhl/player/${id}/game-log`, q, { signal: mine.signal })
      .then(res => { st.log = { data: res.data, meta: res.meta }; })
      .catch(error => { if (error.kind !== 'aborted') st.log = { error }; })
      .finally(() => { if (mine === logCtl && !signal.aborted) renderBody(); });
  };

  nhl(`/nhl/player/${id}`, {}, { signal })
    .then(res => {
      st.player = { data: res.data, meta: res.meta };
      const p = res.data.player || {};
      const reg = seasonTotals(p.season_totals, 2);
      st.season = reg?.season ?? null;
      st.totals = reg;
      st.hasPlayoffs = Boolean(reg && seasonTotals(p.season_totals, 3, reg.season));
      renderHead();
      loadLog();
      loadFights();
      // Next game for the player's club (context for tonight), from the club schedule.
      if (TEAM_BY_ABBREV.has(p.current_team_abbrev)) {
        nhl(`/nhl/team/${p.current_team_abbrev}/schedule`, {}, { signal })
          .then(r => {
            const g = (r.data.games || []).filter(x => ['SCHEDULED', 'PREGAME', 'LIVE'].includes(x.status?.semantics) && Date.parse(x.start_time_utc) > Date.now() - 6 * 3600 * 1000)
              .sort((a, b) => Date.parse(a.start_time_utc) - Date.parse(b.start_time_utc))[0];
            if (!g) return;
            const home = g.teams.home.abbrev === p.current_team_abbrev;
            const o = home ? g.teams.away : g.teams.home;
            st.next = `<a class="rs-next" href="#/matchup/${esc(g.id)}"><span class="micro">Next</span><span>${esc(dayET(g.start_time_utc))}</span><span>${home ? 'vs' : '@'} <b>${esc(o.abbrev)}</b></span><span class="mono">${esc(timeET(g.start_time_utc))}</span>${g.game_type === 1 ? '<span class="faint">preseason</span>' : ''}</a>`;
            renderHead();
          })
          .catch(() => {});
      }
    })
    .catch(error => {
      if (error.kind === 'aborted') return;
      st.player = { error };
      renderHead();
      renderBody();
    });

  news({ limit: 100 }, { signal, timeout: 9000 })
    .then(res => { st.news = { data: res.data, meta: res.meta }; renderBody(); })
    .catch(error => { if (error.kind !== 'aborted') { st.news = { error }; renderBody(); } });

  const disposers = [
    on(root, 'click', '[data-gt]', (_, b) => {
      const gt = Number(b.dataset.gt);
      if (gt === st.gameType) return;
      st.gameType = gt;
      const p = st.player.data?.player || {};
      st.totals = seasonTotals(p.season_totals, gt, st.season);
      loadLog();
    })
  ];
  return () => {
    controller.abort();
    logCtl?.abort();
    disposers.forEach(d => d());
  };
}
