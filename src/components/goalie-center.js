// Goalie Center 3.0 markup. Pure render over lib/goalie-center.js views.
// Official performance first (live line, season line, recent form), then
// shot-location tracking, then PBE analysis. Unknown renders "—" or a stated
// reason; null is never drawn as 0.
import { esc } from '../lib/dom.js';
import { clockET, dayET, num, svPct } from '../lib/format.js';
import { playerIdentity } from './player.js';
import { customerSource, publisherUrl } from '../lib/brand.js';
import { level, primaryLine, recordText, seasonBlock, seasonText, STATUS_TEXT } from '../lib/goalie-center.js';

const DASH = '—';
const isNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const n0 = v => (isNum(v) ? Number(v).toLocaleString('en-US') : DASH);
const sv = v => (isNum(v) ? svPct(v) : DASH);
const gaa = v => (isNum(v) ? num(v, 2) : DASH);
const mmss = s => (isNum(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : DASH);
const SAVES_TIP = 'Shots on goal stopped by the goalie.';
export const stamp = (label, iso) => `<span class="gc-src micro">${esc(label)}${iso ? ` · ${esc(dayET(iso))} ${esc(clockET(iso))} ET` : ''}</span>`;

const badge = lv => `<span class="pbe-badge gc-badge gc-badge--${lv.toLowerCase()}">${esc(STATUS_TEXT[lv])}</span>`;
const nameLink = (id, name) => (isNum(id) ? `<a class="gc-name" href="#/player/${esc(id)}">${esc(name || 'Unnamed')}</a>` : `<b class="gc-name">${esc(name || 'Unnamed')}</b>`);

function cells(list, cls = '') {
  return `<dl class="gc-strip${cls}">${list.map(([k, v, tip]) => `<div${tip ? ` title="${esc(tip)}"` : ''}><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

// ---------------------------------------------------------------- truth
export function truthBlock(view, { live = false } = {}) {
  if (!view) return '';
  const s = view.starter || {};
  const lv = view.level;
  // Customer label: PropSports for observed data; a named publisher (linked reporting) keeps its credit + link.
  const pubUrl = publisherUrl(s.source_url);
  const srcName = customerSource(s.source);
  const when = s.captured_at ? ` · ${dayET(s.captured_at)} ${clockET(s.captured_at)}` : '';
  const src = srcName ? `${srcName}${when}` : '';
  const started = lv === 'UNKNOWN'
    ? `<div class="gc-truth__row"><span class="gc-truth__k">${live ? 'Started' : 'Starter'}</span><span><b>${live ? 'Starter flag unavailable' : 'Starter not reported'}</b></span>${badge('UNKNOWN')}</div>`
    : `<div class="gc-truth__row"><span class="gc-truth__k">${lv === 'CONFIRMED' ? 'Started' : 'Projected'}</span><span>${nameLink(view.headline?.id, view.headline?.name || s.name)}</span>${badge(lv)}</div>`;
  const net = view.inNet
    ? `<div class="gc-truth__row gc-truth__row--net"><span class="gc-truth__k">In net now</span><span>${view.inNet.net_empty_now ? '<b>Net empty</b> <span class="micro">extra attacker</span>' : `${nameLink(view.inNet.goalie_id, view.inNet.name)}${view.inNet.same_as_starter ? '' : lv === 'UNKNOWN' ? ' <span class="micro">starter flag unavailable</span>' : ' <span class="pbe-badge pbe-badge--alert">Replaced starter</span>'}`}</span></div>`
    : '';
  const unmatched = view.projectedUnmatched ? '<p class="micro gc-note">The reported goalie is not matched to an NHL id on the official roster, so no goalie stats are attached.</p>' : '';
  return `<div class="gc-truth gc-truth--${lv.toLowerCase()}">${started}${net}${unmatched}
    <p class="micro gc-truth__basis">${esc(s.basis || '')}${src ? ` · ${pubUrl && srcName !== 'PropSports' ? `<a class="gold" href="${esc(pubUrl)}" target="_blank" rel="noopener nofollow">${esc(srcName)} ↗</a>${esc(when)}` : esc(src)}` : ''}</p></div>`;
}

// ---------------------------------------------------------------- live line
export function liveLine(line, { final = false, started = null, title = null } = {}) {
  if (!line) return '';
  const held = line.integrity?.status === 'HOLD';
  const head = `<div class="gc-sub"><span class="eyebrow">${final ? 'Final' : 'Tonight'}${title ? ` · ${esc(title)}` : ''}</span>${stamp('NHL boxscore')}</div>`;
  if (held) return `${head}<p class="gc-held"><span class="pbe-badge pbe-badge--alert">Held</span> ${esc(line.integrity.reason)}</p>`;
  const split = (k, s) => (s ? `<span><b>${esc(s.saves)}/${esc(s.shots)}</b> ${esc(k)}</span>` : '');
  const splits = [split('even strength', line.even_strength), split('power play', line.power_play), split('shorthanded', line.shorthanded)].filter(Boolean).join('');
  return `${head}${cells([
    ['Saves', n0(line.saves), SAVES_TIP],
    ['Shots faced', n0(line.shots_against)],
    ['Goals allowed', n0(line.goals_against)],
    ['SV%', sv(line.save_pct)],
    ['TOI', esc(line.toi || DASH)],
    ...(final || line.decision ? [['Decision', esc(line.decision ? ({ W: 'W', L: 'L', O: 'OTL' }[line.decision] || line.decision) : 'No decision')]] : []),
    ...(started ? [['Started', esc(started)]] : [])
  ], ' gc-strip--live')}${splits ? `<p class="gc-splits micro">Saves/shots by strength: ${splits}</p>` : ''}`;
}

// ---------------------------------------------------------------- season
const seasonCells = l => [
  ['GS', n0(l.gs)], ['W-L-OTL', esc(recordText(l) || DASH)], ['Saves', n0(l.saves), SAVES_TIP], ['SA', n0(l.shots_against)],
  ['GA', n0(l.goals_against)], ['SV%', sv(l.save_pct)], ['GAA', gaa(l.gaa)], ['SO', n0(l.shutouts)]
];
export function seasonSection(g) {
  const s = seasonBlock(g);
  const cur = s.current
    ? `<div class="gc-sub"><span class="eyebrow">${esc(seasonText(s.currentSeason))} regular season</span><span class="micro">GP ${n0(s.current.gp)}</span>${stamp('NHL stats')}</div>${cells(seasonCells(s.current))}`
    : `<div class="gc-sub"><span class="eyebrow">${esc(seasonText(s.currentSeason) || 'Current season')}</span></div><p class="gc-none">No ${esc(seasonText(s.currentSeason) || 'current-season')} regular-season appearance yet</p>`;
  const base = !s.current && s.baseline
    ? `<div class="gc-sub gc-sub--base"><span class="eyebrow">${esc(seasonText(s.baselineSeason))} baseline</span><span class="micro">GP ${n0(s.baseline.gp)} · prior season, not current</span></div>${cells(seasonCells(s.baseline), ' gc-strip--base')}`
    : '';
  return cur + base;
}

// ---------------------------------------------------------------- recent form
const TYPE = { 2: 'Regular season', 3: 'Playoffs', 1: 'Preseason' };
export function recentForm(g) {
  const rf = g?.recent_form;
  if (!rf) return '<p class="micro gc-none">Game log unavailable.</p>';
  const rows = [
    [2, 'Last 5', rf.regular?.last5], [2, 'Last 10', rf.regular?.last10],
    [3, 'Last 5', rf.playoffs?.last5], [3, 'Last 10', rf.playoffs?.last10],
    [1, 'Last 5', rf.preseason?.last5]
  ].filter(([, , w]) => w && w.appearances);
  // Last 10 only when it adds games beyond Last 5.
  const shown = rows.filter(([t, l, w]) => l !== 'Last 10' || w.appearances > (rows.find(r => r[0] === t && r[1] === 'Last 5')?.[2]?.appearances ?? 0));
  if (!shown.length) return '<p class="micro gc-none">No qualifying recent sample.</p>';
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Recent form"><table class="pbe-table gc-form">
    <thead><tr><th>Window</th><th class="num">Apps</th><th class="num">GS</th><th class="num">REL</th><th class="num">W-L-OTL</th><th class="num" title="${SAVES_TIP}">Saves</th><th class="num">SA</th><th class="num">GA</th><th class="num">SV%</th><th class="num">GAA</th><th class="num">SO</th><th class="num">Avg SA</th><th class="num">TOI</th></tr></thead>
    <tbody>${shown.map(([t, l, w]) => `<tr${t === 1 ? ' class="gc-form__pre"' : ''}><td>${esc(l)} <span class="micro">${esc(TYPE[t])}</span></td><td class="num">${n0(w.appearances)}</td><td class="num">${n0(w.starts)}</td><td class="num">${n0(w.relief)}</td><td class="num">${esc(`${w.wins}-${w.losses}-${w.ot_losses}`)}</td><td class="num">${n0(w.saves)}</td><td class="num">${n0(w.shots_against)}</td><td class="num">${n0(w.goals_against)}</td><td class="num">${sv(w.save_pct)}</td><td class="num">${gaa(w.gaa)}</td><td class="num">${n0(w.shutouts)}</td><td class="num">${isNum(w.avg_shots_against) ? esc(w.avg_shots_against) : DASH}</td><td class="num">${mmss(w.toi_s)}</td></tr>`).join('')}</tbody>
  </table></div><p class="micro gc-note">Official NHL game logs. Each window is one competition type; preseason never mixes into regular-season results. W-L-OTL counts recorded decisions only.</p>`;
}

// ---------------------------------------------------------------- overview cell
export function overviewCell(view, { state }) {
  if (!view) return '<div class="gc-cell"><p class="micro">No data</p></div>';
  const h = view.headline;
  const lv = view.level;
  const liveish = state === 'LIVE' || state === 'FINAL';
  const p = h?.record ? primaryLine(h.record) : null;
  const ln = h?.live && liveish && h.live.integrity?.status !== 'HOLD' ? h.live : null;
  return `<div class="gc-cell">
    <div class="gc-cell__who">${playerIdentity({ id: h?.id, name: h?.name, team: view.team, size: 'md' })}
      <div><span class="micro">${esc(view.team || '')}</span>${h ? nameLink(h.id, h.name) : `<b class="gc-name gc-name--none">${liveish ? 'Starter flag unavailable' : 'Starter not reported'}</b>`}${badge(lv)}</div></div>
    ${view.inNet && !view.inNet.same_as_starter && !view.inNet.net_empty_now ? `<p class="micro gc-cell__net">In net now: ${nameLink(view.inNet.goalie_id, view.inNet.name)}</p>` : ''}
    ${ln ? `<div class="gc-cell__live"><span><b>${n0(ln.saves)}</b> saves</span><span><b>${n0(ln.goals_against)}</b> GA</span><span><b>${sv(ln.save_pct)}</b></span></div>` : ''}
    ${p ? `<p class="gc-cell__season micro"><b>${esc(recordText(p.line) || DASH)}</b> · ${sv(p.line.save_pct)} SV% · ${gaa(p.line.gaa)} GAA <span>${esc(seasonText(p.season))}${p.baseline ? ' baseline' : ''}</span></p>` : h ? `<p class="gc-cell__season micro">No season line on record</p>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- comparison
export function comparisonTable(rows, away, home) {
  const head = v => (v?.headline ? `${playerIdentity({ id: v.headline.id, name: v.headline.name, team: v.team, size: 'sm' })}${nameLink(v.headline.id, v.headline.name)}` : `<span class="gc-name--none">${esc(v?.team || '')} · not set</span>`);
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Goalie comparison"><table class="pbe-table gc-cmp">
    <thead><tr><th></th><th class="gc-cmp__g">${head(away)}</th><th class="gc-cmp__g">${head(home)}</th></tr></thead>
    <tbody>${rows.map(([k, a, h]) => `<tr><th scope="row">${esc(k)}</th><td class="num">${esc(a)}</td><td class="num">${esc(h)}</td></tr>`).join('')}</tbody>
  </table></div><p class="micro gc-note">Official values side by side; a rate is shown with its season and sample. No overall "better goalie" is declared from raw stats.</p>`;
}

// ---------------------------------------------------------------- league board
export function leagueBoard(payload, rows, { sort, minGs }) {
  const cols = [['wins', 'W'], ['saves', 'Saves'], ['save_pct', 'SV%'], ['gaa', 'GAA'], ['shutouts', 'SO'], ['gs', 'GS']];
  const th = (key, label) => `<th class="num"><button type="button" class="gc-sort${sort === key ? ' is-on' : ''}" data-gc-sort="${key}" aria-pressed="${sort === key}"${key === 'saves' ? ` title="${SAVES_TIP}"` : ''}>${esc(label)}</button></th>`;
  return `<div class="gc-board__bar">
      <span class="micro">${esc(seasonText(payload.season))} regular season${payload.is_current_season ? '' : ' (prior season)'} · ${n0(payload.count)} goalies</span>
      <div class="chips" role="group" aria-label="Minimum games started">${[0, 5, 10, 20].map(v => `<button type="button" class="chip" data-gc-mings="${v}" aria-pressed="${minGs === v}">${v ? `${v}+ GS` : 'All'}</button>`).join('')}</div>
    </div>
    ${payload.season_note ? `<p class="micro gc-note">${esc(payload.season_note)}</p>` : ''}
    <div class="table-wrap gc-board__wrap" tabindex="0" role="region" aria-label="League goalie board"><table class="pbe-table gc-board">
      <thead><tr><th class="num">#</th><th>Goalie</th><th class="num">GP</th>${cols.map(([k, l]) => th(k, l)).join('')}<th class="num">L</th><th class="num">OTL</th><th class="num">SA</th><th class="num">GA</th></tr></thead>
      <tbody>${rows.slice(0, 50).map((r, i) => `<tr><td class="num">${i + 1}</td><td><a class="gc-board__name" href="#/player/${esc(r.id)}">${playerIdentity({ id: r.id, name: r.name, team: r.team, size: 'xs' })}<span>${esc(r.name || '')}</span></a> <span class="micro">${esc(r.team || '')}</span></td><td class="num">${n0(r.gp)}</td><td class="num">${n0(r.wins)}</td><td class="num">${n0(r.saves)}</td><td class="num">${sv(r.save_pct)}</td><td class="num">${gaa(r.gaa)}</td><td class="num">${n0(r.shutouts)}</td><td class="num">${n0(r.gs)}</td><td class="num">${n0(r.losses)}</td><td class="num">${n0(r.ot_losses)}</td><td class="num">${n0(r.shots_against)}</td><td class="num">${n0(r.goals_against)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="micro gc-note">${esc(payload.qualification || '')} Sorted by ${esc(cols.find(c => c[0] === sort)?.[1] || 'W')}. Source: NHL stats (goalie summary), cached server-side.</p>`;
}

export { level };
