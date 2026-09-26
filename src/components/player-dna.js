// NHL Skater DNA card (nhl-skater-dna/1.0.0, FROZEN) — V2 visual system.
//
// Mounted on skater profiles by src/lib/player-dna-mount.js, which renders it
// ONLY when the DNA API answers 200.
//
// Pure render functions. PRESENTATION ONLY: every number shown is read from a
// STORED snapshot or the stored DNA-over-time summary. The browser never
// computes a percentile, a score, an overall/composite score, a trait or a
// trend summary. The fingerprint, trajectory and heatmap only DRAW the stored
// 0-100 dimension scores; a missing score is drawn as a gap, never as 0.
// Goalie DNA is not released.
//
// Information order (owner V2 brief): A identity hero · B fingerprint ·
// C defining strengths / watch areas · D dimension evidence · E career DNA
// (summary + trajectory) · F all-traits heatmap · G exact season table.

import { esc } from '../lib/dom.js';
import { teamAccent } from '../lib/teams.js';

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
// Short axis labels for the fingerprint, and a compact set for phones.
const ABBR = {
  shot_generation: 'GEN', shot_location: 'LOC', goal_scoring: 'GOAL', finishing: 'FIN', playmaking: 'PLAY',
  power_play: 'PP', faceoffs: 'FO', shot_blocking: 'BLK', physicality: 'HIT', penalty_differential: 'PEN'
};
const SHORT = {
  shot_generation: 'SHOT GEN', shot_location: 'SHOT LOC', goal_scoring: 'GOALS', finishing: 'FINISH',
  playmaking: 'PLAYMAKE', power_play: 'POWER PLAY', faceoffs: 'FACEOFFS', shot_blocking: 'BLOCKS',
  physicality: 'PHYSICAL', penalty_differential: 'PEN DIFF'
};

// Dimensions are grouped so the eye reads related skills together.
export const DIMENSION_GROUPS = [
  { key: 'shooting', label: 'Shooting', dims: ['shot_generation', 'shot_location', 'goal_scoring', 'finishing'] },
  { key: 'creation', label: 'Creation', dims: ['playmaking', 'power_play'] },
  { key: 'role', label: 'Role & Engagement', dims: ['faceoffs', 'shot_blocking', 'physicality', 'penalty_differential'] }
];
const FINGERPRINT_ORDER = DIMENSION_GROUPS.flatMap(g => g.dims);

const COMPONENT_LABELS = {
  sog_per60: ['Shots on goal /60', 'per60'],
  unblocked_attempts_per60: ['Unblocked attempts /60', 'per60'],
  attempts_per60: ['All shot attempts /60', 'per60'],
  avg_unblocked_distance_ft: ['Avg. attempt distance', 'ft'],
  inner_share: ['Inner-slot share', 'pct'],
  inner_attempts_per60: ['Inner-slot attempts /60', 'per60'],
  goals_per60: ['Goals /60', 'per60'],
  shooting_pct: ['Shooting % (no empty net)', 'pct'],
  unblocked_finishing_pct: ['Goals per unblocked attempt', 'pct'],
  primary_assists_per60: ['Primary assists /60', 'per60'],
  assists_per60: ['Assists /60', 'per60'],
  pp_points_per60: ['PP points per 60 PP min', 'per60'],
  pp_primary_points_per60: ['PP goals + primary assists per 60 PP min', 'per60'],
  faceoff_win_pct: ['Faceoff win %', 'pct'],
  blocks_per60: ['Blocked shots /60', 'per60'],
  hits_per60: ['Hits /60', 'per60'],
  penalties_drawn_per60: ['Penalties drawn /60', 'per60'],
  penalties_taken_per60: ['Penalties taken /60', 'per60']
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
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}–${t.slice(6, 8)}` : t;
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
const dimLabel = k => DIMENSION_LABELS[k] || k;
const num1 = v => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }));
const scored = d => d && d.score !== null && d.score !== undefined && Number.isFinite(Number(d.score));
const clamp = v => Math.max(0, Math.min(100, Number(v)));
const ordinal = n => { const v = Number(n); const s = ['th', 'st', 'nd', 'rd']; const m = v % 100; return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`; };
const confText = d => (d?.label ? `${d.label} CONFIDENCE` : '');
const r1 = v => Math.round(v * 10) / 10;
const ranked = s => !!(s?.qualification?.qualified && s?.rank_claim);

// ------------------------------------------------------------------ A. hero
function seasonSelector(seasons, selected, latest) {
  return `<div class="nhl-dna__seasons" role="tablist" aria-label="Season">${seasons.map(s => {
    const on = String(s.season) === String(selected);
    const cur = String(s.season) === String(latest);
    return `<button type="button" role="tab" class="nhl-dna__season${on ? ' is-active' : ''}${cur ? ' is-current' : ''}" data-dna-season="${esc(s.season)}" aria-selected="${on}" title="${esc(`${seasonLabel(s.season)}${s.ranked ? '' : ' · measured, not ranked'}`)}">${esc(seasonLabel(s.season))}${s.ranked ? '' : '<small>measured</small>'}</button>`;
  }).join('')}</div>`;
}

function statusLine(snapshot, isLatest) {
  const q = snapshot.qualification || {};
  if (q.withheld === 'EARLY_SEASON') return `<p class="nhl-dna__status nhl-dna__status--measured">${isLatest ? 'CURRENT SEASON · ' : ''}EARLY SEASON · MEASURED, NOT RANKED</p>`;
  if (!q.qualified) return `<p class="nhl-dna__status nhl-dna__status--measured">${isLatest ? 'CURRENT SEASON · ' : ''}MEASURED, NOT RANKED</p>`;
  if (!snapshot.rank_claim) return '<p class="nhl-dna__status nhl-dna__status--measured">SMALL PEER GROUP · NOT A LEAGUE RANK</p>';
  return '';
}

function hero(snapshot, player, seasons, selected, latest) {
  const q = snapshot.qualification || {};
  const pop = snapshot.population || {};
  const team = snapshot.team_context?.latest_team || player?.team || null;
  const name = player?.name || snapshot.name || '';
  const t = snapshot.traits || { strongest: [], watch: [] };
  const signature = ranked(snapshot) && t.strongest.length
    ? `<ol class="nhl-dna__sig">${t.strongest.map(k => `<li class="nhl-dna__sig-item"><b class="nhl-dna__sig-score">${esc(snapshot.dimensions?.[k]?.score)}</b><span>${esc(dimLabel(k).toUpperCase())}</span></li>`).join('')}</ol>`
    : ranked(snapshot)
      ? '<p class="nhl-dna__sig-none">Balanced profile — no dimension in the 67+ band.</p>'
      : '<p class="nhl-dna__sig-none">Signature appears once the season is ranked.</p>';
  const context = [
    ranked(snapshot) && pop.n ? `${esc(pop.n)} qualified ${esc(PEER_PLURAL[snapshot.peer_group] || snapshot.peer_group)}` : `${esc(num1(q.sample))} / ${esc(num1(q.threshold))} ${esc(SAMPLE_LABELS[q.metric] || '')} to qualify`,
    `${esc(snapshot.sample?.gp ?? '—')} GP`,
    `${esc(num1(snapshot.sample?.toi_min))} TOI`
  ].join(' · ');
  const traded = snapshot.team_context?.traded ? ` · ${esc(snapshot.team_context.teams.join(' → '))}` : '';
  return `<header class="nhl-dna__hero">
    <div class="nhl-dna__rink" aria-hidden="true"><i></i><i></i></div>
    <div class="nhl-dna__top">
      <p class="nhl-dna__eyebrow">PLAYER DNA <span class="nhl-dna__tab is-active" role="tab" aria-selected="true">SKATER DNA</span></p>
      ${seasonSelector(seasons, selected, latest)}
    </div>
    <div class="nhl-dna__id">
      <div class="nhl-dna__who">
        ${player?.identityHtml || `<span class="nhl-dna__mono" aria-hidden="true">${esc(String(name).split(' ').map(w => w[0] || '').join('').slice(0, 2))}</span>`}
        <div class="nhl-dna__who-text">
          <h3 class="nhl-dna__name">${esc(name)}</h3>
          <p class="nhl-dna__line"><b>${esc(snapshot.position || '—')}</b> · ${esc(team || '—')}${traded} · <b>${esc(seasonLabel(snapshot.season))}</b></p>
          <p class="nhl-dna__peer"><span class="nhl-dna__peer-tag">${esc(PEER[snapshot.peer_group] || snapshot.peer_group)}</span> peer group</p>
        </div>
      </div>
      <div class="nhl-dna__signature" aria-label="DNA signature">
        <p class="nhl-dna__kicker">DNA SIGNATURE</p>
        ${signature}
        <p class="nhl-dna__context">${context}</p>
      </div>
    </div>
    ${statusLine(snapshot, String(snapshot.season) === String(latest))}
  </header>`;
}

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

// ------------------------------------------------------------------ B. fingerprint
// Draws the 10 STORED scores on a fixed 0-100 radial scale. It never derives an
// overall score. Missing axes are gaps (no vertex); the outline only joins
// ADJACENT scored axes, and is filled only when every axis is scored.
export function fingerprint(snapshot) {
  const dims = snapshot.dimensions || {};
  const keys = FINGERPRINT_ORDER.filter(k => k in dims);
  const n = keys.length;
  if (!ranked(snapshot) || !n) {
    return `<section class="nhl-dna__print is-empty" aria-label="DNA fingerprint"><p class="nhl-dna__neutral">The fingerprint appears once the season is ranked. Measured values are listed below.</p></section>`;
  }
  const W = 420; const C = W / 2; const R = 150;
  const ang = i => (-90 + (360 / n) * i) * Math.PI / 180;
  const pt = (i, v) => [r1(C + Math.cos(ang(i)) * R * v / 100), r1(C + Math.sin(ang(i)) * R * v / 100)];
  const rings = [33, 67, 100].map(v => `<circle class="nhl-dna__ring nhl-dna__ring--${v}" cx="${C}" cy="${C}" r="${r1(R * v / 100)}"/>`).join('');
  const spokes = keys.map((k, i) => { const [x, y] = pt(i, 100); return `<line class="nhl-dna__spoke${dims[k].status === 'PROXY' ? ' is-proxy' : ''}" x1="${C}" y1="${C}" x2="${x}" y2="${y}"/>`; }).join('');
  const vals = keys.map((k, i) => (scored(dims[k]) ? { k, i, v: clamp(dims[k].score) } : null));
  const all = vals.every(Boolean);
  let outline = '';
  if (all) {
    outline = `<polygon class="nhl-dna__shape" points="${vals.map(p => pt(p.i, p.v).join(',')).join(' ')}"/>`;
  } else {
    const segs = [];
    for (let i = 0; i < n; i += 1) {
      const a = vals[i]; const b = vals[(i + 1) % n];
      if (a && b && n > 2) segs.push(`<line class="nhl-dna__edge" x1="${pt(a.i, a.v)[0]}" y1="${pt(a.i, a.v)[1]}" x2="${pt(b.i, b.v)[0]}" y2="${pt(b.i, b.v)[1]}"/>`);
    }
    outline = segs.join('');
  }
  const pucks = vals.filter(Boolean).map(p => {
    const [x, y] = pt(p.i, p.v);
    const d = dims[p.k];
    return `<circle class="nhl-dna__puck${d.status === 'PROXY' ? ' is-proxy' : ''}" cx="${x}" cy="${y}" r="6" data-dim="${esc(p.k)}"><title>${esc(`${dimLabel(p.k)} · ${d.score} · ${confText(d)}${d.status === 'PROXY' ? ' · PROXY' : ''}`)}</title></circle>`;
  }).join('');
  const gaps = keys.map((k, i) => (scored(dims[k]) ? '' : (() => { const [x, y] = pt(i, 18); return `<text class="nhl-dna__gapmark" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">—<title>${esc(`${dimLabel(k)} · ${reasonText(dims[k].status, dims[k].reason)}`)}</title></text>`; })())).join('');
  const labels = keys.map((k, i) => {
    const [x, y] = pt(i, 122);
    const c = Math.cos(ang(i));
    const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
    const dy = Math.sin(ang(i)) > 0.5 ? 14 : Math.sin(ang(i)) < -0.5 ? -4 : 5;
    const d = dims[k];
    const v = `<tspan class="nhl-dna__axis-v">${scored(d) ? esc(d.score) : '—'}</tspan>`;
    const px = d.status === 'PROXY' ? ' is-proxy' : '';
    return `<text class="nhl-dna__axis nhl-dna__axis--full${px}" x="${x}" y="${r1(y + dy)}" text-anchor="${anchor}">${esc(SHORT[k] || k)} ${v}</text><text class="nhl-dna__axis nhl-dna__axis--abbr${px}" x="${x}" y="${r1(y + dy)}" text-anchor="${anchor}">${esc(ABBR[k] || k)} ${v}</text>`;
  }).join('');
  const scoredN = vals.filter(Boolean).length;
  const aria = `DNA fingerprint: ${keys.map(k => `${dimLabel(k)} ${scored(dims[k]) ? dims[k].score : 'not scored'}`).join(', ')}.`;
  const table = `<div class="nhl-dna__sr"><table><caption>DNA fingerprint values</caption><thead><tr><th scope="col">Dimension</th><th scope="col">Percentile</th><th scope="col">Confidence</th></tr></thead><tbody>${keys.map(k => `<tr><th scope="row">${esc(dimLabel(k))}${dims[k].status === 'PROXY' ? ' (proxy)' : ''}</th><td>${scored(dims[k]) ? esc(dims[k].score) : '—'}</td><td>${esc(dims[k].label || '—')}</td></tr>`).join('')}</tbody></table></div>`;
  const groups = DIMENSION_GROUPS.map(g => `<li><b>${esc(g.label === 'Shooting' ? 'Offense' : g.label)}</b> ${g.dims.filter(k => k in dims).map(k => esc(SHORT[k])).join(' · ')}</li>`).join('');
  return `<section class="nhl-dna__print" aria-label="DNA fingerprint" data-scored="${scoredN}">
    <div class="nhl-dna__print-head"><p class="nhl-dna__kicker">DNA FINGERPRINT</p><p class="nhl-dna__print-sub">Percentile vs qualified ${esc(PEER_PLURAL[snapshot.peer_group] || snapshot.peer_group)} · ${esc(seasonLabel(snapshot.season))}</p></div>
    <svg class="nhl-dna__radar" viewBox="-70 -14 ${W + 140} ${W + 28}" role="img" aria-label="${esc(aria)}">
      <defs><pattern id="dna-hatch-${esc(snapshot.player_id)}" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#fff"/><line x1="0" y1="0" x2="0" y2="6" stroke="#b38a2a" stroke-width="3"/></pattern></defs>
      <g class="nhl-dna__faceoff">${rings}<circle class="nhl-dna__dot" cx="${C}" cy="${C}" r="4"/></g>
      ${spokes}${outline}${pucks}${gaps}${labels}
    </svg>
    <p class="nhl-dna__abbr-key">${keys.map(k => `<span><b>${esc(ABBR[k])}</b> ${esc(dimLabel(k))}</span>`).join('')}</p>
    <ul class="nhl-dna__legend">${groups}<li class="nhl-dna__legend-proxy"><i></i> Proxy (Shot Location)</li><li class="nhl-dna__legend-zones">Rings: 33 · 67 · 100</li></ul>
    ${table}
  </section>`;
}

// ------------------------------------------------------------------ C. strengths / watch
function traitsBlock(snapshot) {
  const t = snapshot.traits || { strongest: [], watch: [] };
  const card = (k, cls) => `<li class="nhl-dna__trait nhl-dna__trait--${cls}" data-dim="${esc(k)}"><b class="nhl-dna__trait-score">${esc(snapshot.dimensions?.[k]?.score)}</b><span class="nhl-dna__trait-name">${esc(dimLabel(k))}</span></li>`;
  if (!ranked(snapshot)) {
    return `<section class="nhl-dna__traits"><p class="nhl-dna__neutral">Strengths and watch areas appear once the season is ranked.</p></section>`;
  }
  if (!t.strongest.length && !t.watch.length) {
    return `<section class="nhl-dna__traits"><p class="nhl-dna__neutral">No dimension clears the strength (67+) or watch (33 and below) bands at medium confidence. A balanced profile.</p></section>`;
  }
  return `<section class="nhl-dna__traits">
    <div class="nhl-dna__traits-strong"><h4>Defining strengths</h4>${t.strongest.length ? `<ul>${t.strongest.map(k => card(k, 'strong')).join('')}</ul>` : '<p class="nhl-dna__neutral">None in the 67+ band.</p>'}</div>
    <div class="nhl-dna__traits-watch"><h4>Watch areas <small>lower-percentile profile areas</small></h4>${t.watch.length ? `<ul>${t.watch.map(k => card(k, 'watch')).join('')}</ul>` : '<p class="nhl-dna__neutral">None in the 33-and-below band.</p>'}</div>
  </section>`;
}

// ------------------------------------------------------------------ D. dimension evidence
function statusChip(d) {
  if (d.status === 'PROXY') return '<span class="nhl-dna__chip nhl-dna__chip--proxy" title="Geometric shot-location heuristic. Not expected goals; never a headline trait.">PROXY</span>';
  if (d.status === 'RESEARCH_ONLY' || d.status === 'SOURCE_REQUIRED') return '<span class="nhl-dna__chip nhl-dna__chip--muted">RESEARCH</span>';
  return '';
}

// The first component's raw value, for a measured-but-unranked row.
function firstValue(d) {
  const [ck, c] = Object.entries(d.components || {})[0] || [];
  return ck && c && c.value !== null && c.value !== undefined ? formatComponent(ck, c.value) : null;
}

function puckScale(key, d) {
  const proxy = d.status === 'PROXY';
  return `<span class="nhl-dna__scale-track${proxy ? ' is-proxy' : ''}" role="img" aria-label="${esc(`${dimLabel(key)} ${d.score} of 100${proxy ? ', proxy' : ''}`)}">
      <i class="nhl-dna__zone nhl-dna__zone--low"></i><i class="nhl-dna__zone nhl-dna__zone--mid"></i><i class="nhl-dna__zone nhl-dna__zone--high"></i>
      <b class="nhl-dna__marker" style="left:${clamp(d.score)}%"></b>
    </span>`;
}

function dimensionRow(key, d) {
  const isScored = scored(d);
  const comps = Object.entries(d.components || {}).map(([ck, c]) => `<li class="nhl-dna__ev">
      <span class="nhl-dna__ev-name">${esc(COMPONENT_LABELS[ck]?.[0] || ck)}${c.direction === -1 ? ' <span class="nhl-dna__dir" title="Lower is better">↓ lower is better</span>' : ''}</span>
      <b class="nhl-dna__ev-val">${esc(formatComponent(ck, c.value))}</b>
      <span class="nhl-dna__ev-pct">${c.percentile === null || c.percentile === undefined ? '<span class="nhl-dna__dim">no percentile</span>' : `${esc(ordinal(c.percentile))} percentile`}${c.n ? ` <small>· ${esc(c.n)} peers</small>` : ''}</span>
    </li>`).join('');
  const caveat = key === 'penalty_differential'
    ? '<p class="nhl-dna__caveat">Penalty calls carry home/road and officiating effects; read this as an indicator, not a pure skill measure.</p>'
    : '';
  const sample = d.sample?.value !== null && d.sample?.value !== undefined ? `${num1(d.sample.value)} ${SAMPLE_LABELS[d.sample.metric] || ''}` : '';
  const conf = isScored ? `<small class="nhl-dna__conf nhl-dna__conf--${esc(String(d.label || '').toLowerCase())}" title="Confidence ${esc(d.confidence)}">${d.status === 'PROXY' ? 'PROXY · ' : ''}${esc(confText(d))}</small>` : '';
  return `<details class="nhl-dna__dim-row${isScored ? '' : ' is-gap'}${d.status === 'PROXY' ? ' is-proxy' : ''}" data-dim="${esc(key)}">
    <summary>
      <span class="nhl-dna__dim-name">${esc(dimLabel(key))} ${statusChip(d)}</span>
      ${isScored
        ? `${puckScale(key, d)}<span class="nhl-dna__score-box"><span class="nhl-dna__score">${esc(d.score)}</span>${conf}</span>`
        : MEASURED_ONLY.has(d.reason) && firstValue(d)
          ? `<span class="nhl-dna__measured"><b>${esc(firstValue(d))}</b> <small>${esc(reasonText(d.status, d.reason))}</small></span>`
          : `<span class="nhl-dna__gap">${esc(reasonText(d.status, d.reason))}</span>`}
    </summary>
    <div class="nhl-dna__evidence">
      <p class="nhl-dna__kicker">HOW THIS SCORE IS BUILT</p>
      <ul class="nhl-dna__evlist">${comps}</ul>
      ${sample ? `<p class="nhl-dna__dim">Sample: ${esc(sample)}</p>` : ''}
      ${caveat}
    </div>
  </details>`;
}

function dimensionBlock(snapshot) {
  const dims = snapshot.dimensions || {};
  const order = snapshot.dimension_order || Object.keys(dims);
  const grouped = DIMENSION_GROUPS.map(g => {
    const ks = g.dims.filter(k => order.includes(k) && dims[k]);
    return ks.length ? `<div class="nhl-dna__dgroup"><h5>${esc(g.label)}</h5>${ks.map(k => dimensionRow(k, dims[k])).join('')}</div>` : '';
  }).join('');
  const extra = order.filter(k => !FINGERPRINT_ORDER.includes(k) && dims[k]).map(k => dimensionRow(k, dims[k])).join('');
  return `<section class="nhl-dna__dims" aria-label="Dimension evidence">
    <div class="nhl-dna__section-head"><h4>Full dimension evidence</h4>${ranked(snapshot) ? `<p class="nhl-dna__scale"><span>0</span><span>Percentile vs qualified ${esc(PEER_PLURAL[snapshot.peer_group] || snapshot.peer_group)}, same season · zones 0–33 · 34–66 · 67–100</span><span>100</span></p>` : ''}</div>
    ${grouped}${extra}
  </section>`;
}

// ------------------------------------------------------------------ E. career DNA
function insight(title, body, cls = '') {
  return `<div class="nhl-dna__insight${cls}"><span>${esc(title)}</span><b>${body}</b></div>`;
}

// Trajectory for ONE dimension on a fixed 0-100 axis. Stored points only; a
// line segment joins two ADJACENT seasons only when both are scored, so a gap
// is never bridged or interpolated.
export function trajectory(history, key, activeSeason) {
  const t = history.trends.find(x => x.key === key);
  if (!t) return '';
  const aria = `${dimLabel(key)} by season: ${t.points.map(p => `${seasonLabel(p.season)} ${scored(p) ? p.score : 'no percentile'}`).join(', ')}.`;
  const proxy = t.status === 'PROXY';
  return `<figure class="nhl-dna__trajfig">
    ${trajectorySvg(t, key, activeSeason, { W: 760, H: 300, L: 52, Rp: 48, T: 40, B: 44, cls: 'full', aria })}
    ${trajectorySvg(t, key, activeSeason, { W: 340, H: 240, L: 38, Rp: 24, T: 34, B: 36, cls: 'compact', aria, short: true })}
    <figcaption class="nhl-dna__dim">${esc(dimLabel(key))}${proxy ? ' · proxy' : ''} · fixed 0–100 percentile scale · gaps are not connected</figcaption>
  </figure>`;
}

// One drawing of the trajectory. The compact variant (phones) uses a narrower
// canvas so its text stays >= 10 px when scaled to the screen.
function trajectorySvg(t, key, activeSeason, { W, H, L, Rp, T, B, cls, aria, short = false }) {
  const n = t.points.length;
  const x = i => r1(n === 1 ? (L + W - Rp) / 2 : L + (W - L - Rp) * (i / (n - 1)));
  const y = v => r1(T + (H - T - B) * (1 - v / 100));
  const grid = [0, 33, 67, 100].map(v => `<line class="nhl-dna__grid${v === 33 || v === 67 ? ' is-band' : ''}" x1="${L}" y1="${y(v)}" x2="${W - Rp}" y2="${y(v)}"/><text class="nhl-dna__tick" x="${L - 8}" y="${y(v) + 5}" text-anchor="end">${v}</text>`).join('');
  const proxy = t.status === 'PROXY';
  const segs = [];
  for (let i = 0; i + 1 < n; i += 1) {
    const a = t.points[i]; const b = t.points[i + 1];
    if (scored(a) && scored(b)) segs.push(`<line class="nhl-dna__traj${proxy ? ' is-proxy' : ''}" x1="${x(i)}" y1="${y(clamp(a.score))}" x2="${x(i + 1)}" y2="${y(clamp(b.score))}"/>`);
  }
  const dots = t.points.map((p, i) => {
    const cur = String(p.season) === String(activeSeason);
    const sl = short ? `’${String(p.season).slice(6, 8)}` : seasonLabel(p.season);
    const lab = `<text class="nhl-dna__xlab${cur ? ' is-current' : ''}" x="${x(i)}" y="${H - 12}" text-anchor="middle">${esc(sl)}</text>`;
    if (!scored(p)) {
      return `${lab}<text class="nhl-dna__gapmark" x="${x(i)}" y="${y(50)}" text-anchor="middle" data-gap="${esc(p.season)}">—<title>${esc(`${seasonLabel(p.season)} · ${dimLabel(key)} · ${reasonText(p.reason, p.reason)}`)}</title></text>`;
    }
    const tip = `${seasonLabel(p.season)} · ${dimLabel(key)} · ${ordinal(p.score)} percentile · ${p.label || ''}`;
    return `${lab}<g class="nhl-dna__tpt${cur ? ' is-current' : ''}${proxy ? ' is-proxy' : ''}" data-season="${esc(p.season)}" data-score="${esc(p.score)}"><circle cx="${x(i)}" cy="${y(clamp(p.score))}" r="${cur ? 9 : 6}"><title>${esc(tip)}</title></circle><text class="nhl-dna__tval" x="${x(i)}" y="${y(clamp(p.score)) - (cur ? 15 : 12)}" text-anchor="middle">${esc(p.score)}</text></g>`;
  }).join('');
  return `<svg class="nhl-dna__trajsvg nhl-dna__trajsvg--${cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}"${cls === 'compact' ? ' aria-hidden="true"' : ''}>${grid}${segs.join('')}${dots}</svg>`;
}

function heatmap(history, focus) {
  const seasons = history.seasons || [];
  const byKey = new Map(history.trends.map(t => [t.key, t]));
  const cell = (k, t, p) => {
    if (!scored(p)) {
      return `<td class="nhl-dna__hcell is-gap${t.status === 'PROXY' ? ' is-proxy' : ''}" title="${esc(`${seasonLabel(p.season)} · ${dimLabel(k)} · ${reasonText(p.reason, p.reason)}`)}">—</td>`;
    }
    return `<td class="nhl-dna__hcell${t.status === 'PROXY' ? ' is-proxy' : ''}" style="--v:${clamp(p.score)}" title="${esc(`${seasonLabel(p.season)} · ${dimLabel(k)} · ${ordinal(p.score)} percentile · ${p.label || ''}`)}">${esc(p.score)}</td>`;
  };
  const body = DIMENSION_GROUPS.map(g => {
    const ks = g.dims.filter(k => byKey.has(k));
    if (!ks.length) return '';
    return `<tr class="nhl-dna__hgroup"><th scope="rowgroup" colspan="${seasons.length + 1}">${esc(g.label)}</th></tr>${ks.map(k => {
      const t = byKey.get(k);
      return `<tr class="${focus === k ? 'is-focus' : ''}" data-dim="${esc(k)}"><th scope="row"><button type="button" class="nhl-dna__tname" data-dna-focus="${esc(k)}" aria-pressed="${focus === k}">${esc(dimLabel(k))}${t.status === 'PROXY' ? ' <span class="nhl-dna__chip nhl-dna__chip--proxy">PROXY</span>' : ''}</button></th>${t.points.map(p => cell(k, t, p)).join('')}</tr>`;
    }).join('')}`;
  }).join('');
  return `<div class="nhl-dna__heat">
    <h4>All traits by season</h4>
    <div class="nhl-dna__scroll" tabindex="0" role="region" aria-label="All traits by season"><table class="nhl-dna__htable">
      <thead><tr><th scope="col">Dimension</th>${seasons.map(s => `<th scope="col" class="${s.ranked ? '' : 'is-unranked'}" title="${esc(s.ranked ? `${PEER[s.peer_group] || s.peer_group} · ${s.population_n} peers` : reasonText(null, s.reason))}">${esc(seasonLabel(s.season))}${s.ranked ? '' : '<small>measured</small>'}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>
  </div>`;
}

function historyBlock(history, focus) {
  if (!history || !history.trends?.length) return '';
  const sm = history.summary || {};
  const delta = r => (r ? `${esc(dimLabel(r.key))} <em>${r.delta > 0 ? '+' : ''}${esc(r.delta)}</em> <small>${esc(seasonLabel(r.from_season))} → ${esc(seasonLabel(r.to_season))} · ${esc(r.from)} → ${esc(r.to)}</small>` : '<small>No high-confidence move of 10+ points</small>');
  const strip = `<div class="nhl-dna__insights">
    ${insight('Biggest gain', delta(sm.biggest_gain), sm.biggest_gain ? ' is-gain' : ' is-none')}
    ${insight('Biggest drop', delta(sm.biggest_drop), sm.biggest_drop ? ' is-drop' : ' is-none')}
    ${insight('Highest current', sm.top_current ? `${esc(dimLabel(sm.top_current.key))} <em>${esc(sm.top_current.score)}</em>` : '<small>No ranked season</small>', sm.top_current ? ' is-top' : ' is-none')}
    ${insight('Most volatile', sm.most_volatile ? `${esc(dimLabel(sm.most_volatile.key))} <small>${esc(sm.most_volatile.min)}–${esc(sm.most_volatile.max)}</small>` : '<small>Needs 3 consecutive high-confidence seasons</small>', sm.most_volatile ? ' is-vol' : ' is-none')}
  </div>
  <p class="nhl-dna__dim nhl-dna__basis">Summary uses ${esc(sm.basis || 'ranked seasons only')}${(sm.ranked_seasons || []).length ? ` (${esc(sm.ranked_seasons.map(seasonLabel).join(', '))})` : ''}. Unranked seasons are shown as measured only.</p>`;
  const seasons = history.seasons || [];
  const hasRanked = (sm.ranked_seasons || []).length > 0;
  // Trajectory trait: the chosen focus, else the stored top-current dimension,
  // else the first dimension with any stored score.
  const keys = history.trends.map(t => t.key);
  const pick = (focus && keys.includes(focus)) ? focus
    : (sm.top_current && keys.includes(sm.top_current.key)) ? sm.top_current.key
      : (history.trends.find(t => t.points.some(scored))?.key || keys[0]);
  const selector = `<div class="nhl-dna__traitsel" role="group" aria-label="Trajectory trait">${DIMENSION_GROUPS.map(g => {
    const ks = g.dims.filter(k => keys.includes(k));
    return ks.length ? `<div class="nhl-dna__traitsel-group"><span>${esc(g.label)}</span>${ks.map(k => `<button type="button" class="nhl-dna__traitbtn${k === pick ? ' is-active' : ''}${history.trends.find(t => t.key === k)?.status === 'PROXY' ? ' is-proxy' : ''}" data-dna-focus="${esc(k)}" aria-pressed="${k === pick}">${esc(dimLabel(k))}</button>`).join('')}</div>` : '';
  }).join('')}</div>`;
  const table = `<details class="nhl-dna__table"><summary>Exact season table</summary><div class="nhl-dna__scroll"><table>
    <thead><tr><th scope="col">Dimension</th>${seasons.map(s => `<th scope="col" class="num">${esc(seasonLabel(s.season))}${s.ranked ? '' : '<br><small>measured</small>'}</th>`).join('')}</tr></thead>
    <tbody>${history.trends.map(t => `<tr><th scope="row">${esc(dimLabel(t.key))}</th>${t.points.map(p => `<td class="num">${!scored(p) ? `<span class="nhl-dna__dim" title="${esc(reasonText(p.reason, p.reason))}">—</span>` : esc(p.score)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div></details>`;
  return `<section class="nhl-dna__history" aria-label="DNA over time"${focus ? ` data-focus="${esc(focus)}"` : ''}>
    <h3>Career DNA</h3>
    ${strip}
    ${hasRanked ? `<div class="nhl-dna__career">${selector}${trajectory(history, pick, history.active_season)}</div>${heatmap(history, pick)}` : '<p class="nhl-dna__neutral">No ranked season yet. Trends appear once a season qualifies; the table below keeps the measured seasons.</p>'}
    ${table}
  </section>`;
}

/**
 * Skater DNA card.
 * @param {object} opts
 * @param {object} opts.snapshot  stored snapshot for the selected season
 * @param {object} [opts.history] stored DNA-over-time summary (dnaHistory)
 * @param {number} [opts.season]  selected season id, e.g. 20252026
 * @param {string} [opts.focus]   dimension key selected for the trajectory
 * @param {object} [opts.player]  profile identity { name, team, identityHtml } (display only;
 *                                identityHtml = the page's existing playerIdentity() markup)
 */
export function renderSkaterDna({ snapshot, history = null, season = null, focus = null, player = null } = {}) {
  if (!snapshot || snapshot.kind !== 'skater') return '';
  const selected = season ?? snapshot.season;
  const seasons = history?.seasons?.length ? history.seasons : [{ season: snapshot.season, ranked: ranked(snapshot) }];
  const latest = history?.active_season ?? seasons[seasons.length - 1]?.season ?? snapshot.season;
  const accent = teamAccent(snapshot.team_context?.latest_team || player?.team);
  return `<section class="nhl-dna" data-player-id="${esc(snapshot.player_id)}" data-season="${esc(selected)}" aria-label="Player DNA" style="--dna-team:${accent}">
  ${hero(snapshot, player, seasons, selected, latest)}
  ${banner(snapshot)}
  <div class="nhl-dna__overview">
    ${fingerprint(snapshot)}
    ${traitsBlock(snapshot)}
  </div>
  ${dimensionBlock(snapshot)}
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
