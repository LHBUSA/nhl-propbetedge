// Shared markup for PBE intelligence surfaces (Goalie Form, Fatigue, WinHL,
// Fight Score, Game Intelligence). Pure string builders: no fetching, no state.
// A null value always renders as unavailable — never as 0 — and a locked
// (free-tier) value renders as a Pro prompt, never as a placeholder number.
import { esc } from '../lib/dom.js';

export const DASH = '—';
const fin = v => typeof v === 'number' && Number.isFinite(v);

export function fmtScore(v, digits = 0) {
  return fin(v) ? v.toFixed(digits) : DASH;
}

export function mmss(seconds) {
  if (!fin(seconds)) return DASH;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function pct3(v) {
  return fin(v) ? v.toFixed(3).replace(/^0/, '') : DASH;
}

// Tone for a 0..100 score. `inverse` for burden indexes (higher = worse).
export function tone(score, { inverse = false } = {}) {
  if (!fin(score)) return 'na';
  const s = inverse ? 100 - score : score;
  return s >= 70 ? 'hi' : s >= 45 ? 'mid' : 'lo';
}

// Circular gauge. The arc length is the score; null draws an empty ring.
export function scoreRing(score, { label = '', size = 76, inverse = false, caption = '' } = {}) {
  const r = 30; const c = 2 * Math.PI * r;
  const v = fin(score) ? Math.max(0, Math.min(100, score)) : 0;
  const t = tone(score, { inverse });
  return `<figure class="iq-ring iq-ring--${t}" style="--iq-ring:${size}px" aria-label="${esc(label)}: ${fin(score) ? score.toFixed(0) : 'unavailable'}">
    <svg viewBox="0 0 76 76" aria-hidden="true"><circle class="iq-ring__track" cx="38" cy="38" r="${r}"/><circle class="iq-ring__arc" cx="38" cy="38" r="${r}" stroke-dasharray="${((v / 100) * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 38 38)"/></svg>
    <b class="iq-ring__v mono">${fin(score) ? score.toFixed(0) : DASH}</b>
    ${caption ? `<figcaption class="micro">${esc(caption)}</figcaption>` : ''}
  </figure>`;
}

export function versionTag(version) {
  return version ? `<span class="iq-ver mono" title="Formula version">${esc(version)}</span>` : '';
}

// Pro prompt in place of a computed value. Opens the existing NHL Pro sheet.
export function lockPanel(title, copy, { compact = false } = {}) {
  return `<div class="iq-lock${compact ? ' iq-lock--compact' : ''}">
    <span class="iq-lock__badge">NHL PRO</span>
    <b class="iq-lock__title">${esc(title)}</b>
    ${copy ? `<p class="iq-lock__copy">${esc(copy)}</p>` : ''}
    <button type="button" class="pbe-btn pbe-btn--primary pbe-btn--sm" data-open-nhl-pro>Unlock with NHL Pro</button>
  </div>`;
}

// Weighted components (Goalie Form, WinHL): percentile/subscore bar + weight + contribution.
export function weightedComponents(components, { valueFmt = null } = {}) {
  const rows = (components || []).filter(c => c.weight > 0 || c.status === 'not_applicable');
  if (!rows.length) return '';
  return `<ul class="iq-comps">${rows.map(c => {
    const sub = fin(c.subscore) ? c.subscore : fin(c.percentile) ? c.percentile : null;
    const ok = sub !== null;
    const value = valueFmt ? valueFmt(c) : fin(c.value) ? String(Math.round(c.value * 1000) / 1000) : DASH;
    return `<li class="iq-comp${ok ? '' : ' is-na'}">
      <div class="iq-comp__head"><span class="iq-comp__label">${esc(c.label)}</span><span class="iq-comp__val mono">${esc(value)}</span></div>
      <div class="iq-comp__bar" aria-hidden="true"><i style="width:${ok ? Math.max(2, sub).toFixed(0) : 0}%"></i></div>
      <div class="iq-comp__meta micro">${ok ? `${sub.toFixed(0)} / 100` : esc(c.status === 'not_applicable' ? 'Not applicable' : 'Unavailable')}${fin(c.weight) && c.weight > 0 ? ` · weight ${(c.weight * 100).toFixed(0)}%` : ''}${fin(c.contribution) ? ` · adds ${c.contribution.toFixed(1)}` : ''}</div>
      ${!ok && c.reason ? `<p class="iq-comp__why micro">${esc(c.reason)}</p>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

// Points components (Fatigue): points out of max, with the rule text.
export function pointComponents(components) {
  return `<ul class="iq-pts">${(components || []).map(c => {
    const ok = fin(c.points);
    return `<li class="iq-pt${ok && c.points > 0 ? ' is-on' : ''}${ok ? '' : ' is-na'}">
      <span class="iq-pt__label">${esc(c.label)}</span>
      <b class="iq-pt__v mono">${ok ? `+${c.points}` : DASH}</b>
      <span class="iq-pt__rule micro">${esc(c.rule || '')}${ok ? '' : ` · ${esc(c.reason || 'unavailable')}`}${c.note ? ` · ${esc(c.note)}` : ''}</span>
    </li>`;
  }).join('')}</ul>`;
}

// Schedule facts as chips (free).
export function fatigueChips(facts) {
  if (!facts) return `<span class="micro faint">Schedule facts unavailable</span>`;
  const chips = [];
  if (facts.back_to_back) chips.push('<span class="iq-chip iq-chip--warn">Back-to-back</span>');
  else if (Number.isFinite(facts.days_rest)) chips.push(`<span class="iq-chip">${facts.days_rest} day${facts.days_rest === 1 ? '' : 's'} rest</span>`);
  else chips.push('<span class="iq-chip">No prior game</span>');
  if (facts.three_in_four) chips.push('<span class="iq-chip iq-chip--warn">3 in 4</span>');
  if (facts.four_in_six) chips.push('<span class="iq-chip iq-chip--warn">4 in 6</span>');
  if (Number.isFinite(facts.games_last_7d)) chips.push(`<span class="iq-chip">${facts.games_last_7d} in last 7d</span>`);
  if (facts.road_streak >= 2) chips.push(`<span class="iq-chip">Road game ${facts.road_streak}</span>`);
  if (Number.isFinite(facts.timezone_shift_h) && facts.timezone_shift_h >= 1) chips.push(`<span class="iq-chip">${facts.timezone_shift_h}h zone change</span>`);
  return `<span class="iq-chips">${chips.join('')}</span>`;
}

export function edgeLine(edge, teams) {
  if (!edge) return '';
  if (edge.locked) return `<span class="iq-edge iq-edge--locked">${esc(edge.label)} · <span class="gold">Pro</span></span>`;
  if (!edge.available) return `<span class="iq-edge iq-edge--na">${esc(edge.label)} · ${esc(edge.reason || 'unavailable')}</span>`;
  const who = edge.favors === 'even' ? 'Even' : `${esc(teams?.[edge.favors]?.abbrev || edge.favors)} +${Math.abs(edge.diff)}`;
  return `<span class="iq-edge"><b>${who}</b> <span class="dim">${esc(edge.label)}</span> <span class="mono faint">${esc(teams?.away?.abbrev || 'Away')} ${esc(String(edge.away))} · ${esc(teams?.home?.abbrev || 'Home')} ${esc(String(edge.home))}</span></span>`;
}

export function unavailableBox(title, body) {
  return `<div class="iq-na"><b>${esc(title)}</b><span>${esc(body)}</span></div>`;
}
