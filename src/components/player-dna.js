// NHL Skater DNA card (nhl-skater-dna/1.0.0, FROZEN).
//
// Mounted on skater profiles by src/lib/player-dna-mount.js, which renders it
// ONLY when the DNA API answers 200. While the backend's rights gate is closed
// (PUBLICATION_BLOCKED_RIGHTS_REVIEW -> 451) nothing is shown.
//
// Pure render functions: every number shown is read from a STORED snapshot or
// the stored DNA-over-time summary. The browser never computes a percentile,
// a score, a trait or a trend summary. Goalie DNA is not released.

import { esc } from '../lib/dom.js';

export const DNA_PUBLICATION_GATE = 'PUBLICATION_BLOCKED_RIGHTS_REVIEW';

export const DIMENSION_LABELS = {
  shot_generation: 'Shot Generation',
  shot_location: 'Shot Location',
  goal_scoring: 'Goal Scoring',
  finishing: 'Finishing',
  playmaking: 'Playmaking',
  power_play: 'Power Play Production',
  faceoffs: 'Faceoffs',
  shot_blocking: 'Shot Blocking',
  physicality: 'Physicality',
  penalty_differential: 'Penalty Differential'
};

// Trend rows are grouped so the eye reads related skills together.
export const DIMENSION_GROUPS = [
  { key: 'shooting', label: 'Shooting', dims: ['shot_generation', 'shot_location', 'goal_scoring', 'finishing'] },
  { key: 'creation', label: 'Creation', dims: ['playmaking', 'power_play'] },
  { key: 'role', label: 'Role & Engagement', dims: ['faceoffs', 'shot_blocking', 'physicality', 'penalty_differential'] }
];

const COMPONENT_LABELS = {
  sog_per60: ['Shots on goal', 'per60'],
  unblocked_attempts_per60: ['Unblocked attempts', 'per60'],
  attempts_per60: ['All shot attempts', 'per60'],
  avg_unblocked_distance_ft: ['Avg. attempt distance', 'ft'],
  inner_share: ['Inner-slot share', 'pct'],
  inner_attempts_per60: ['Inner-slot attempts', 'per60'],
  goals_per60: ['Goals', 'per60'],
  shooting_pct: ['Shooting % (no empty net)', 'pct'],
  unblocked_finishing_pct: ['Goals per unblocked attempt', 'pct'],
  primary_assists_per60: ['Primary assists', 'per60'],
  assists_per60: ['Assists', 'per60'],
  pp_points_per60: ['PP points per 60 PP min', 'per60'],
  pp_primary_points_per60: ['PP goals + primary assists per 60 PP min', 'per60'],
  faceoff_win_pct: ['Faceoff win %', 'pct'],
  blocks_per60: ['Blocked shots', 'per60'],
  hits_per60: ['Hits', 'per60'],
  penalties_drawn_per60: ['Penalties drawn', 'per60'],
  penalties_taken_per60: ['Penalties taken', 'per60']
};

const SAMPLE_LABELS = { toi_min: 'TOI min', loc_n: 'located attempts', sog_non_en: 'shots', pp_toi_min: 'PP min', faceoffs: 'faceoffs' };

// Plain-language reasons for gaps. A gap is never drawn as a zero.
export function reasonText(status, reason) {
  if (reason === 'SOURCE_REALTIME_UNBIASED_NOT_TRUSTED_THIS_SEASON') return 'Not tracked reliably before 2024-25';
  if (reason === 'NOT_APPLICABLE_DEFENSE') return 'Not applicable to defensemen';
  if (reason === 'NOT_APPLICABLE_FORWARD') return 'Not applicable to forwards';
  if (reason === 'NO_FACEOFF_ROLE') return 'No regular faceoff role (under 250 draws)';
  if (reason === 'NO_PP_ROLE') return 'No regular power-play role (under 50 PP minutes)';
  if (reason === 'PP_TOI_SOURCE_MISSING') return 'Power-play ice time not available';
  if (reason === 'EARLY_SEASON') return 'Early season: percentiles withheld until clubs average 20 games';
  if (reason === 'INSUFFICIENT_SAMPLE') return 'Below qualification: measured, not ranked';
  if (reason === 'INSUFFICIENT_DATA') return 'Not enough data for a percentile';
  if (reason === 'UNRANKED_SEASON') return 'Measured only (season not ranked)';
  if (status === 'NOT_AVAILABLE_THIS_SEASON') return 'Not available this season';
  if (status === 'NOT_APPLICABLE') return 'Not applicable';
  if (status === 'SOURCE_REQUIRED' || status === 'RESEARCH_ONLY') return 'Research only, not published';
  return 'Not scored';
}

export const seasonLabel = s => {
  const t = String(s ?? '');
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(6, 8)}` : t;
};

function formatComponent(key, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const kind = COMPONENT_LABELS[key]?.[1];
  const v = Number(value);
  if (kind === 'pct') return `${(v * 100).toFixed(1)}%`;
  if (kind === 'ft') return `${v.toFixed(1)} ft`;
  if (kind === 'per60') return `${v.toFixed(2)} /60`;
  return v.toFixed(2);
}

const PEER = { forward: 'FORWARD', defense: 'DEFENSE' };
const PEER_PLURAL = { forward: 'forwards', defense: 'defensemen' };
const MEASURED_ONLY = new Set(['INSUFFICIENT_SAMPLE', 'EARLY_SEASON']);
const pctText = p => (p === null || p === undefined ? '—' : String(p));
const dimLabel = k => DIMENSION_LABELS[k] || k;
const num1 = v => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }));

function banner(snapshot) {
  const q = snapshot.qualification || {};
  if (q.withheld === 'EARLY_SEASON') {
    return `<p class="nhl-dna__banner nhl-dna__banner--early" role="note"><b>Early season.</b> Raw measurements are shown. Percentiles and traits are withheld until clubs average 20 games.</p>`;
  }
  if (!q.qualified) {
    return `<p class="nhl-dna__banner" role="note"><b>Not yet qualified.</b> ${esc(num1(q.sample))} of ${esc(num1(q.threshold))} ${esc(SAMPLE_LABELS[q.metric] || q.metric || '')} needed. Raw measurements are shown; percentiles are withheld.</p>`;
  }
  if (!snapshot.rank_claim) {
    return `<p class="nhl-dna__banner" role="note"><b>Small peer group.</b> Percentiles are not presented as league ranks.</p>`;
  }
  return '';
}

function traitsBlock(snapshot) {
  const t = snapshot.traits || { strongest: [], watch: [] };
  const list = (keys, cls) => keys.map(k => `<li class="nhl-dna__trait nhl-dna__trait--${cls}"><span>${esc(dimLabel(k))}</span><b>${esc(pctText(snapshot.dimensions?.[k]?.score))}</b></li>`).join('');
  if (!snapshot.qualification?.qualified || !snapshot.rank_claim) {
    return `<div class="nhl-dna__traits"><p class="nhl-dna__neutral">Strengths and watch areas appear once the season is ranked.</p></div>`;
  }
  if (!t.strongest.length && !t.watch.length) {
    return `<div class="nhl-dna__traits"><p class="nhl-dna__neutral">No dimension clears the strength (67+) or watch (33 and below) bands at medium confidence. A balanced profile.</p></div>`;
  }
  return `<div class="nhl-dna__traits">
    <div><h4>Strengths</h4>${t.strongest.length ? `<ul>${list(t.strongest, 'strong')}</ul>` : '<p class="nhl-dna__neutral">None in the 67+ band.</p>'}</div>
    <div><h4>Watch areas</h4>${t.watch.length ? `<ul>${list(t.watch, 'watch')}</ul>` : '<p class="nhl-dna__neutral">None in the 33-and-below band.</p>'}</div>
  </div>`;
}

function statusChip(d) {
  if (d.status === 'PROXY') return '<span class="nhl-dna__chip nhl-dna__chip--proxy" title="Geometric shot-location heuristic. Not expected goals; never a headline trait.">PROXY</span>';
  if (d.status === 'RESEARCH_ONLY' || d.status === 'SOURCE_REQUIRED') return '<span class="nhl-dna__chip nhl-dna__chip--muted">RESEARCH</span>';
  return '';
}

function confChip(d) {
  if (!d.label) return '';
  return `<span class="nhl-dna__conf nhl-dna__conf--${esc(String(d.label).toLowerCase())}" title="Confidence ${esc(d.confidence)}">${esc(d.label)}</span>`;
}

// The first component's raw value, for a measured-but-unranked row.
function firstValue(d) {
  const [ck, c] = Object.entries(d.components || {})[0] || [];
  return ck && c && c.value !== null && c.value !== undefined ? formatComponent(ck, c.value) : null;
}

function dimensionRow(key, d) {
  const scored = d.score !== null && d.score !== undefined;
  const comps = Object.entries(d.components || {}).map(([ck, c]) => `<tr>
      <th scope="row">${esc(COMPONENT_LABELS[ck]?.[0] || ck)}${c.direction === -1 ? ' <span class="nhl-dna__dir" title="Lower is better">↓</span>' : ''}</th>
      <td class="num">${esc(formatComponent(ck, c.value))}</td>
      <td class="num">${c.percentile === null || c.percentile === undefined ? '<span class="nhl-dna__dim">—</span>' : esc(c.percentile)}</td>
      <td class="num nhl-dna__dim">${c.n ? esc(c.n) : ''}</td>
    </tr>`).join('');
  const caveat = key === 'penalty_differential'
    ? '<p class="nhl-dna__caveat">Penalty calls carry home/road and officiating effects; read this as an indicator, not a pure skill measure.</p>'
    : '';
  const sample = d.sample?.value !== null && d.sample?.value !== undefined ? `${num1(d.sample.value)} ${SAMPLE_LABELS[d.sample.metric] || ''}` : '';
  return `<details class="nhl-dna__dim-row${scored ? '' : ' is-gap'}${d.status === 'PROXY' ? ' is-proxy' : ''}" data-dim="${esc(key)}">
    <summary>
      <span class="nhl-dna__dim-name">${esc(dimLabel(key))} ${statusChip(d)}</span>
      ${scored
        ? `<span class="nhl-dna__bar" role="img" aria-label="${esc(dimLabel(key))} ${esc(d.score)} of 100"><i style="width:${Math.max(0, Math.min(100, Number(d.score)))}%"></i></span>
           <span class="nhl-dna__score">${esc(d.score)}</span>${confChip(d)}`
        : MEASURED_ONLY.has(d.reason) && firstValue(d)
          ? `<span class="nhl-dna__measured"><b>${esc(firstValue(d))}</b> <small>${esc(reasonText(d.status, d.reason))}</small></span>`
          : `<span class="nhl-dna__gap">${esc(reasonText(d.status, d.reason))}</span>`}
    </summary>
    <div class="nhl-dna__evidence">
      <table><thead><tr><th scope="col">Component</th><th scope="col" class="num">Value</th><th scope="col" class="num">Pctl</th><th scope="col" class="num">Peers</th></tr></thead><tbody>${comps}</tbody></table>
      ${sample ? `<p class="nhl-dna__dim">Sample: ${esc(sample)}</p>` : ''}
      ${caveat}
    </div>
  </details>`;
}

function insight(title, body) {
  return `<div class="nhl-dna__insight"><span>${esc(title)}</span><b>${body}</b></div>`;
}

function historyBlock(history, focus) {
  if (!history || !history.trends?.length) return '';
  const sm = history.summary || {};
  const delta = r => (r ? `${esc(dimLabel(r.key))} <em>${r.delta > 0 ? '+' : ''}${esc(r.delta)}</em> <small>${esc(seasonLabel(r.from_season))} → ${esc(seasonLabel(r.to_season))}</small>` : '<small>No high-confidence move of 10+ points</small>');
  const strip = `<div class="nhl-dna__insights">
    ${insight('Biggest gain', delta(sm.biggest_gain))}
    ${insight('Biggest drop', delta(sm.biggest_drop))}
    ${insight('Highest current', sm.top_current ? `${esc(dimLabel(sm.top_current.key))} <em>${esc(sm.top_current.score)}</em>` : '<small>No ranked season</small>')}
    ${insight('Most volatile', sm.most_volatile ? `${esc(dimLabel(sm.most_volatile.key))} <small>${esc(sm.most_volatile.min)}–${esc(sm.most_volatile.max)}</small>` : '<small>Needs 3 consecutive high-confidence seasons</small>')}
  </div>
  <p class="nhl-dna__dim nhl-dna__basis">Summary uses ${esc(sm.basis || 'ranked seasons only')}${(sm.ranked_seasons || []).length ? ` (${esc(sm.ranked_seasons.map(seasonLabel).join(', '))})` : ''}. Unranked seasons are shown as measured only.</p>`;
  const seasons = history.seasons || [];
  const byKey = new Map(history.trends.map(t => [t.key, t]));
  const cell = p => (p.score === null || p.score === undefined
    ? `<span class="nhl-dna__cell is-gap" title="${esc(reasonText(null, p.reason))}">${p.reason === 'UNRANKED_SEASON' ? 'meas.' : '—'}</span>`
    : `<span class="nhl-dna__cell" style="--v:${Number(p.score)}">${esc(p.score)}</span>`);
  const rows = DIMENSION_GROUPS.map(g => {
    const trs = g.dims.filter(k => byKey.has(k)).map(k => {
      const t = byKey.get(k);
      return `<div class="nhl-dna__trow${focus === k ? ' is-focus' : ''}" data-dim="${esc(k)}">
        <button type="button" class="nhl-dna__tname" data-dna-focus="${esc(k)}" aria-pressed="${focus === k}">${esc(dimLabel(k))}${t.status === 'PROXY' ? ' <span class="nhl-dna__chip nhl-dna__chip--proxy">PROXY</span>' : ''}</button>
        <div class="nhl-dna__tcells">${t.points.map(cell).join('')}</div>
      </div>`;
    }).join('');
    return trs ? `<div class="nhl-dna__tgroup"><h5>${esc(g.label)}</h5>${trs}</div>` : '';
  }).join('');
  const head = `<div class="nhl-dna__trow nhl-dna__trow--head"><span></span><div class="nhl-dna__tcells">${seasons.map(s => `<span class="nhl-dna__cell nhl-dna__cell--head${s.ranked ? '' : ' is-unranked'}" title="${esc(s.ranked ? `${PEER[s.peer_group] || s.peer_group} · ${s.population_n} peers` : reasonText(null, s.reason))}">${esc(seasonLabel(s.season))}</span>`).join('')}</div></div>`;
  const table = `<details class="nhl-dna__table"><summary>Exact season table</summary><div class="nhl-dna__scroll"><table>
    <thead><tr><th scope="col">Dimension</th>${seasons.map(s => `<th scope="col" class="num">${esc(seasonLabel(s.season))}${s.ranked ? '' : '<br><small>measured</small>'}</th>`).join('')}</tr></thead>
    <tbody>${history.trends.map(t => `<tr><th scope="row">${esc(dimLabel(t.key))}</th>${t.points.map(p => `<td class="num">${p.score === null || p.score === undefined ? `<span class="nhl-dna__dim" title="${esc(reasonText(null, p.reason))}">—</span>` : esc(p.score)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div></details>`;
  return `<section class="nhl-dna__history" aria-label="DNA over time"${focus ? ` data-focus="${esc(focus)}"` : ''}>
    <h3>DNA over time</h3>
    ${strip}
    ${(sm.ranked_seasons || []).length ? `<div class="nhl-dna__trends">${head}${rows}</div>` : '<p class="nhl-dna__neutral">No ranked season yet. Trends appear once a season qualifies; the table below keeps the measured seasons.</p>'}
    ${table}
  </section>`;
}

/**
 * Skater DNA card.
 * @param {object} opts
 * @param {object} opts.snapshot  stored snapshot for the selected season
 * @param {object} [opts.history] stored DNA-over-time summary (dnaHistory)
 * @param {number} [opts.season]  selected season id, e.g. 20252026
 * @param {string} [opts.focus]   dimension key in focus mode
 */
export function renderSkaterDna({ snapshot, history = null, season = null, focus = null } = {}) {
  if (!snapshot || snapshot.kind !== 'skater') return '';
  const selected = season ?? snapshot.season;
  const seasons = history?.seasons?.length ? history.seasons : [{ season: snapshot.season, ranked: !!snapshot.rank_claim }];
  const q = snapshot.qualification || {};
  const pop = snapshot.population || {};
  const order = snapshot.dimension_order || Object.keys(snapshot.dimensions || {});
  const selector = `<div class="nhl-dna__seasons" role="tablist" aria-label="Season">${seasons.map(s => `<button type="button" role="tab" class="nhl-dna__season${String(s.season) === String(selected) ? ' is-active' : ''}" data-dna-season="${esc(s.season)}" aria-selected="${String(s.season) === String(selected)}">${esc(seasonLabel(s.season))}${s.ranked ? '' : '<small>measured</small>'}</button>`).join('')}</div>`;
  return `<section class="nhl-dna" data-gate="${DNA_PUBLICATION_GATE}" data-player-id="${esc(snapshot.player_id)}" data-season="${esc(selected)}" aria-label="Player DNA">
  <header class="nhl-dna__head">
    <div>
      <p class="nhl-dna__eyebrow">PLAYER DNA</p>
      <div class="nhl-dna__tabs" role="tablist" aria-label="DNA type"><span class="nhl-dna__tab is-active" role="tab" aria-selected="true">SKATER DNA</span></div>
    </div>
    ${selector}
  </header>
  <dl class="nhl-dna__meta">
    <div><dt>Peer group</dt><dd>${esc(PEER[snapshot.peer_group] || snapshot.peer_group)}${pop.n ? ` <small>${esc(pop.n)} qualified</small>` : ''}</dd></div>
    <div><dt>Position</dt><dd>${esc(snapshot.position || '—')}${snapshot.team_context?.latest_team ? ` <small>${esc(snapshot.team_context.latest_team)}${snapshot.team_context.traded ? ` · ${esc(snapshot.team_context.teams.join(' → '))}` : ''}</small>` : ''}</dd></div>
    <div><dt>Qualification</dt><dd>${q.qualified ? 'Qualified' : 'Not qualified'} <small>${esc(num1(q.sample))} / ${esc(num1(q.threshold))} ${esc(SAMPLE_LABELS[q.metric] || '')}</small></dd></div>
    <div><dt>Sample</dt><dd>${esc(snapshot.sample?.gp ?? '—')} GP <small>${esc(num1(snapshot.sample?.toi_min))} TOI min</small></dd></div>
  </dl>
  ${banner(snapshot)}
  ${traitsBlock(snapshot)}
  <div class="nhl-dna__dims">
    ${q.qualified && snapshot.rank_claim ? `<p class="nhl-dna__scale"><span>0</span><span>Percentile vs qualified ${esc(PEER_PLURAL[snapshot.peer_group] || snapshot.peer_group)}, same season</span><span>100</span></p>` : ''}
    ${order.map(k => dimensionRow(k, snapshot.dimensions[k])).join('')}
  </div>
  ${historyBlock(history, focus)}
  <footer class="nhl-dna__foot">
    <span>Data · PropSports</span>
    <span>${esc(snapshot.version || '')}${snapshot.season_state === 'IN_PROGRESS' ? ' · season in progress' : ''}</span>
  </footer>
</section>`;
}

// Goalie DNA is held (one live dimension; save-percentage reliability too low
// for a percentile profile). Goalie pages keep their normal statistics.
export function renderGoalieDnaNotice() {
  return '<p class="nhl-dna__neutral">Goalie DNA is not released. Goalie statistics are shown in the goalie profile.</p>';
}
