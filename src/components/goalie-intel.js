// Goalie Intelligence 2.0 blocks (Goalie Center, Matchup). Pure markup over a
// game-intelligence payload from nhl-metrics.
//
// Free: starter truth, rest/workload facts, 14-day workload timeline, season vs
// recent save rate, and NHL Edge location splits exactly as the NHL publishes
// them. Pro: the PBE Goalie Form score, its components and the goalie edge.
// Nothing here computes a score; missing values render as unavailable.
import { esc } from '../lib/dom.js';
import { playerIdentity } from './player.js';
import { DASH, edgeLine, lockPanel, pct3, scoreRing, versionTag, weightedComponents } from './intel-ui.js';

const LOC = { all: 'All shots', high: 'High-danger', mid: 'Mid-range', long: 'Long-range' };
const LEVEL = s => (s === 'CONFIRMED' ? 'Confirmed' : s === 'PROJECTED' || s === 'REPORTED' ? 'Projected' : 'Unknown');

function addDays(ymd, d) {
  const t = Date.parse(`${ymd}T00:00:00Z`) + d * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function starterGoalie(side) {
  if (!side) return null;
  return (side.goalies || []).find(g => g.is_starter) || null;
}

const formOf = g => (g?.form && !g.form.locked ? g.form : null);
const workloadOf = g => (g?.form && !g.form.locked ? g.form.workload : g?.workload) || null;
const recentOf = g => (g?.form && !g.form.locked ? g.form.recent_window : g?.recent_window) || null;

export function goalieWarnings(g) {
  const w = workloadOf(g);
  if (!w) return '';
  const chips = [];
  if (w.back_to_back) chips.push('<span class="iq-chip iq-chip--warn">Played yesterday</span>');
  if (w.starts_7d >= 3) chips.push(`<span class="iq-chip iq-chip--warn">${w.starts_7d} starts in 7 days</span>`);
  if (Number.isFinite(w.consecutive_team_starts) && w.consecutive_team_starts >= 5) chips.push(`<span class="iq-chip iq-chip--warn">${w.consecutive_team_starts} straight team starts</span>`);
  if (w.shots_against_7d > 100) chips.push(`<span class="iq-chip iq-chip--warn">${w.shots_against_7d} shots faced in 7 days</span>`);
  if (!chips.length && Number.isFinite(w.days_rest) && w.days_rest >= 2) chips.push(`<span class="iq-chip iq-chip--good">${w.days_rest} days rest</span>`);
  return chips.length ? `<div class="gi-warn">${chips.join('')}</div>` : '';
}

export function workloadTimeline(g, gameDate) {
  const w = workloadOf(g);
  if (!w || !gameDate) return '';
  const byDate = new Map((w.timeline || []).map(a => [a.date, a]));
  const days = Array.from({ length: 14 }, (_, i) => addDays(gameDate, i - 14));
  return `<div><div class="gi-timeline" role="img" aria-label="Appearances in the 14 days before this game">${days.map(d => {
    const a = byDate.get(d);
    const cls = !a ? '' : a.started === true ? ' is-start' : a.started === null ? ' is-app is-unknown' : ' is-app';
    const tip = a ? `${d}: ${a.started === true ? 'started' : a.started === false ? 'relief' : 'appeared (start not flagged by the source)'}${Number.isFinite(a.shots_against) ? ` · ${a.shots_against} SA` : ''}${a.game_type === 1 ? ' · preseason' : ''}` : `${d}: no appearance`;
    return `<span class="gi-day${cls}" title="${esc(tip)}"></span>`;
  }).join('')}</div>
  <div class="gi-legend micro faint"><span><i style="background:var(--pbe-model)"></i>Start</span><span><i style="background:rgba(122,169,255,.35)"></i>Relief</span><span><i style="background:repeating-linear-gradient(45deg,rgba(122,169,255,.45),rgba(122,169,255,.45) 2px,transparent 2px,transparent 4px)"></i>Start not flagged</span><span>14 days → game day</span></div></div>`;
}

export function seasonVsRecent(g) {
  const season = g?.season_line?.save_pct ?? (g?.baseline_line?.shots_against ? g.baseline_line.saves / g.baseline_line.shots_against : null);
  const seasonLabel = g?.season_line ? 'Season' : g?.baseline_line ? `Baseline ${g.baseline_line.season ? `${String(g.baseline_line.season).slice(0, 4)}-${String(g.baseline_line.season).slice(6, 8)}` : ''}` : 'Season';
  const r = recentOf(g);
  const leagueAll = (g?.edge?.locations || []).find(l => l.location === 'all')?.league_save_pct ?? null;
  const league = formOf(g)?.league_save_pct ?? leagueAll;
  return `<div class="gi-cmp">
    <div><span class="micro">${esc(seasonLabel)} SV%</span><b>${pct3(season)}</b><span class="micro faint">${esc(g?.season_line?.shots_against ?? g?.baseline_line?.shots_against ?? DASH)} SA</span></div>
    <div><span class="micro">Recent SV%</span><b>${pct3(r?.save_pct)}</b><span class="micro faint">${r?.appearances ? `${r.appearances} apps · ${r.shots} SA` : 'No recent sample'}</span></div>
    <div><span class="micro">League SV%</span><b>${pct3(league)}</b><span class="micro faint">${formOf(g) ? 'season baseline' : 'tracking-data league avg'}</span></div>
  </div>`;
}

export function edgeSplits(g) {
  const e = g?.edge;
  if (!e?.locations?.length) return '<p class="micro faint">Shot-location tracking splits unavailable for this goalie.</p>';
  const season = e.season ? `${String(e.season).slice(0, 4)}-${String(e.season).slice(6, 8)}` : '';
  return `<div><span class="micro">Save % by shot location${season ? ` · ${esc(season)}` : ''} · tracking data via PropSports</span>
    <table class="pbe-table gi-split"><thead><tr><th>Location</th><th>SV%</th><th>League</th><th>Pctile</th><th>Saves</th></tr></thead>
    <tbody>${e.locations.filter(l => LOC[l.location]).map(l => `<tr><td>${esc(LOC[l.location])}</td><td class="mono">${pct3(l.save_pct)}</td><td class="mono faint">${pct3(l.league_save_pct)}</td><td class="mono">${Number.isFinite(l.percentile) ? `${Math.round(l.percentile * 100)}` : DASH}</td><td class="mono">${l.saves ?? DASH}</td></tr>`).join('')}</tbody></table></div>`;
}

export function goalieCard(g, { team, gameDate, pro }) {
  const f = formOf(g);
  const w = workloadOf(g);
  return `<div class="gi-card">
    <div class="gi-card__head">${playerIdentity({ id: g.id, name: g.name, team, size: 'sm' })}<div><a href="#/player/${esc(g.id)}"><b>${esc(g.name || 'Unnamed')}</b></a>${g.is_starter ? ' <span class="pbe-badge pbe-badge--confirmed">Starter</span>' : ''}<div class="micro faint">${w ? `${w.starts_7d} GS / ${w.appearances_7d} GP in 7d · ${w.starts_14d} GS in 14d · ${w.shots_against_14d} SA in 14d` : 'Workload unavailable'}</div></div>
      ${f ? scoreRing(f.score, { label: `${g.name} PBE Goalie Form`, size: 64, caption: 'Goalie Form' }) : ''}</div>
    ${goalieWarnings(g)}
    ${workloadTimeline(g, gameDate)}
    ${seasonVsRecent(g)}
    ${edgeSplits(g)}
    ${pro && f ? `<details><summary class="micro gold">PBE Goalie Form components ${versionTag(f.version)}</summary>${weightedComponents(f.components, { valueFmt: c => (c.key.includes('save') ? pct3(c.value) : c.value === null || c.value === undefined ? DASH : String(c.value)) })}${f.unavailable_reason ? `<p class="micro faint">${esc(f.unavailable_reason)}</p>` : ''}</details>` : ''}
  </div>`;
}

export function goalieMatchup(intel, { pro = false } = {}) {
  if (!intel?.sides) return '';
  const side = s => {
    const t = intel.sides[s];
    const st = t?.starter || {};
    const g = starterGoalie(t);
    const f = formOf(g);
    return `<div class="gi-matchup__side">
      ${f ? scoreRing(f.score, { label: `${st.name || t.team} Goalie Form`, size: 58 }) : playerIdentity({ id: st.goalie_id, name: st.name, team: t.team, size: 'md' })}
      <div class="gi-matchup__who"${st.basis ? ` title="${esc(st.basis)}"` : ''}><span class="micro">${esc(t.team)} · ${esc(LEVEL(st.status))}</span><b>${esc(st.name || 'No starter yet')}</b>
        <span class="micro faint">${g ? (() => { const w = workloadOf(g); return w ? `${Number.isFinite(w.days_rest) ? `${w.days_rest}d rest` : 'rest n/a'} · ${w.starts_7d} GS/7d` : ''; })() : (st.status === 'UNKNOWN' ? 'Not confirmed or projected' : '')}</span></div>
    </div>`;
  };
  const teams = { away: { abbrev: intel.game?.teams?.away?.abbrev }, home: { abbrev: intel.game?.teams?.home?.abbrev } };
  return `<div class="gi-matchup" aria-label="Goalie matchup">${side('away')}
    <div class="gi-matchup__mid"><span class="micro">Goalie matchup</span>${pro ? edgeLine(intel.edges?.goalie_form, teams) : '<span class="micro gold">Form edge · Pro</span>'}</div>
    ${side('home')}</div>`;
}

// Top-of-game summary: the goalie-vs-goalie matchup (+ the Pro prompt).
export function goalieIntelTop(intel, { pro = false } = {}) {
  if (!intel?.sides) return '';
  return `<section class="gi gi--top" aria-label="Goalie matchup">${goalieMatchup(intel, { pro })}${!pro ? lockPanel('PBE Goalie Form', 'A transparent 0–100 reading from shot-weighted recent save rate, the season baseline, rest and workload, and the opponent’s shot volume — with every component shown.', { compact: true }) : ''}</section>`;
}

// Detail cards: timeline, warnings, season vs recent, NHL Edge splits, Form components.
export function goalieIntelCards(intel, { pro = false, big = false } = {}) {
  if (!intel?.sides) return '';
  const date = intel.game?.date;
  const cards = s => {
    const t = intel.sides[s];
    const list = (t.goalies || []).filter(g => g.is_starter || (workloadOf(g)?.appearances_14d ?? 0) > 0).slice(0, big ? 3 : 1);
    if (!list.length) return `<div class="iq-na"><b>${esc(t.team)}</b><span>No goalie appearance on record in the last 14 days.</span></div>`;
    return list.map(g => goalieCard(g, { team: t.team, gameDate: date, pro })).join('');
  };
  return `<section class="gi" aria-label="Goalie intelligence"><div class="dk-tablehead"><span class="micro">Goalie intelligence · workload, rest, season vs recent, shot-location tracking</span></div><div class="gi-cards">${cards('away')}${cards('home')}</div></section>`;
}

export function goalieIntelSection(intel, { pro = false, big = false } = {}) {
  if (!intel?.sides) return '';
  const date = intel.game?.date;
  const team = s => intel.sides[s];
  const cards = s => {
    const t = team(s);
    const list = (t.goalies || []).filter(g => g.is_starter || (workloadOf(g)?.appearances_14d ?? 0) > 0).slice(0, big ? 3 : 1);
    if (!list.length) return `<div class="iq-na"><b>${esc(t.team)}</b><span>No goalie appearance on record in the last 14 days.</span></div>`;
    return list.map(g => goalieCard(g, { team: t.team, gameDate: date, pro })).join('');
  };
  return `<section class="gi" aria-label="Goalie intelligence">
    ${goalieMatchup(intel, { pro })}
    ${!pro ? lockPanel('PBE Goalie Form', 'A transparent 0–100 reading from shot-weighted recent save rate, the season baseline, rest and workload, and the opponent\'s shot volume — with every component shown.', { compact: true }) : ''}
    <div class="gi-cards">${cards('away')}${cards('home')}</div>
  </section>`;
}
