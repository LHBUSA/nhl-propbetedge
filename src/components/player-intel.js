// Player-page intelligence: WinHL (skaters), PBE Goalie Form + NHL Edge
// (goalies), player fatigue (NHL Pro) and the ledger's PBE Fight Score.
import { esc } from '../lib/dom.js';
import { ageText } from '../lib/format.js';
import { describeError } from '../lib/api.js';
import { goalieCard } from './goalie-intel.js';
import { goalieStartStatus, hydrateGoalie, opponentCaption, sampleNotes } from '../lib/player-game.js';
import { DASH, fmtScore, lockPanel, mmss, pointComponents, scoreRing, versionTag, weightedComponents } from './intel-ui.js';

const err = e => `<p class="micro faint">${esc(describeError(e).title)}.</p>`;

// "2026–27 regular season · provisional": the season the WinHL row belongs to.
export function winhlSeasonCaption(d) {
  if (!d?.season_label) return '';
  const final = d.status === 'final' || d.status === 'prior_final';
  return `${d.season_label} regular season${d.provisional ? ' · provisional' : final ? ' · final' : ''}`;
}

export const PROVISIONAL_TIP = 'Early-season sample: skaters are ranked from their first regular-season game until 200 have played 10+ games. Scores and ranks will move a lot; this is not a mature-season ranking.';

// Season caption + GP + age, with the provisional explanation as a tooltip.
export function winhlSeasonLine(d, gp = null, now = Date.now()) {
  const caption = winhlSeasonCaption(d);
  if (!caption) return '';
  const age = d.captured_at ? ageText((now - Date.parse(d.captured_at)) / 1000) : null;
  const parts = [caption, Number.isFinite(gp) ? `${gp} GP` : null, age ? `updated ${age}` : null].filter(Boolean);
  return `<span class="micro wl-seasonline"${d.provisional ? ` title="${esc(PROVISIONAL_TIP)}"` : ''}>${esc(parts.join(' · '))}</span>`;
}

function winhlBlock(s) {
  if (!s) return '<div class="pbe-skeleton" style="height:120px"></div>';
  if (s.error) return s.error.status === 404 ? '<p class="micro faint">No WinHL row: this player has no qualifying skater season line in the WinHL window.</p>' : err(s.error);
  const d = s.data;
  const p = d.player;
  if (p.locked) {
    return `${p.season ? `<div class="gi-card__head">${scoreRing(p.season.score, { label: 'WinHL', size: 64, caption: `League #${p.season.rank_league}` })}${winhlSeasonLine(d, p.season.gp ?? null)}</div>` : ''}
      ${lockPanel('WinHL for every skater', 'Score, league/position/team rank, last-10 and last-5 form, trend and the component breakdown.', { compact: true })}`;
  }
  const w = x => (x && Number.isFinite(x.score) ? fmtScore(x.score, 1) : DASH);
  return `<div class="gi-card__head">${scoreRing(p.season?.score ?? null, { label: 'WinHL', size: 70, caption: p.season?.rank_league ? `League #${p.season.rank_league}` : 'Not ranked' })}
      <div class="micro">${winhlSeasonLine(d, p.season?.gp ?? null)}<br>L10 <b class="mono">${w(p.last10)}</b> · L5 <b class="mono">${w(p.last5)}</b> · trend ${p.trend === null ? DASH : `${p.trend > 0 ? '+' : ''}${p.trend}`}<br>${esc(p.group === 'D' ? 'Defense' : 'Forward')} rank ${esc(p.season?.rank_position ?? DASH)} · ${esc(p.team)} rank ${esc(p.season?.rank_team ?? DASH)}</div></div>
    ${p.season?.unavailable_reason ? `<p class="micro faint">${esc(p.season.unavailable_reason)}</p>` : ''}
    <details><summary class="micro gold">Components ${versionTag(d.version)}</summary>${weightedComponents(p.season?.components || [])}</details>`;
}

function fatigueBlock(s, tier) {
  if (tier !== 'pro') return lockPanel('Player fatigue', 'Ice time over the last 3/5/7 games vs season average, back-to-backs, PP/PK and overtime load.', { compact: true });
  if (!s) return '<div class="pbe-skeleton" style="height:120px"></div>';
  if (s.error?.kind === 'locked') return lockPanel('Player fatigue', 'Your NHL Pro access could not be confirmed for this read.', { compact: true });
  if (s.error) return err(s.error);
  const d = s.data;
  if (d.available === false) return `<p class="micro faint">${esc(d.reason)}</p>`;
  const f = d.facts || {};
  return `<div class="gi-card__head">${scoreRing(d.score, { label: 'Player fatigue', size: 64, inverse: true, caption: 'Fatigue' })}
      <div class="micro">TOI last 3 <b class="mono">${mmss(f.toi_last3_s)}</b> · last 7 <b class="mono">${mmss(f.toi_last7_s)}</b> · season <b class="mono">${mmss(f.season_avg_toi_s)}</b><br>${esc(f.games_last_7d ?? DASH)} games in 7 days · ${esc(f.consecutive_games ?? DASH)} straight games · PK ${mmss(f.sh_toi_last3_s)} / PP ${mmss(f.pp_toi_last3_s)} per game (last 3)</div></div>
    ${d.min_sample && !d.min_sample.met ? `<p class="micro faint">Score needs ${d.min_sample.required_recent_games_21d} games in 21 days (has ${d.min_sample.has}).</p>` : ''}
    <details><summary class="micro gold">Points table ${versionTag(d.version)}</summary>${pointComponents(d.components)}</details>
    <p class="micro faint">${esc(d.semantics || '')}</p>`;
}

// fights: fightSeasons() output from lib/fight-record.js, the same data the
// stat strip and Fight History read. W-L-D is the counted (regular season +
// playoffs) fan-vote record; the PBE Fight Score is the ledger's own summary.
function fightScoreBlock(s, fights) {
  if (!s || s.error) return '';
  if (!fights) return '';
  const seasons = fights.filter(x => x.rows.length);
  if (!seasons.length) return '<p class="micro faint">No documented fights in the fight ledger (current or previous season).</p>';
  return seasons.map(x => {
    const r = x.record;
    const score = x.summary && Number.isFinite(Number(x.summary.score)) ? ` · <span title="Based on community fight results.">PBE Fight Score ⓘ</span> <b class="mono">${fmtScore(x.summary.score, 1)}</b>${x.summary.provisional ? ' (provisional)' : ''}` : '';
    return `<div class="micro" data-fight-intel="${esc(x.season)}"><b>${esc(x.label)}</b> · ${r.fights} fight${r.fights === 1 ? '' : 's'} · community W-L-D <b>${r.w}-${r.l}-${r.d}</b>${r.preseason ? ` · ${r.preseason} preseason not counted` : ''}${score}</div>`;
  }).join('') + '<p class="micro faint"><a class="gold" href="#/fights">Fight ledger ›</a></p>';
}

export function playerIntelSection(p, st, fights = null) {
  const goalie = p.position === 'G';
  const tier = st.tier;
  if (goalie) {
    const g = st.goalie;
    // The goalie payload can omit identity and season lines: hydrate from the profile (lib/player-game.js).
    const ctx = st.ctx || null;
    const gv = g && !g.error ? hydrateGoalie(g.data, p) : null;
    const start = gv ? goalieStartStatus(st.gameGoalies, gv.id, ctx?.state) : null;
    const startBadge = start ? `<div class="gi-start${start.live ? ' is-live' : ''}" data-start-state="${esc(start.label)}"${start.basis ? ` title="${esc(start.basis)}"` : ''}><span class="pbe-badge pbe-badge--${start.level === 'CONFIRMED' ? 'confirmed' : 'sched'}">${esc(start.label)}</span><span class="micro">${esc(start.detail)}${start.live ? ' · in this game now; workload below counts completed games only' : ''}</span></div>` : '';
    const notes = gv ? sampleNotes(gv) : [];
    const body = !g ? '<div class="pbe-skeleton" style="height:160px"></div>' : g.error ? err(g.error) : `${startBadge}${goalieCard({
      id: gv.id, name: gv.name, is_starter: start?.level === 'CONFIRMED', season_line: gv.season_line, baseline_line: gv.baseline_line, current_season: gv.current_season,
      form: gv.form, workload: gv.workload, recent_window: gv.recent_window, edge: gv.edge
    }, { team: gv.team, gameDate: gv.workload?.as_of || new Date().toISOString().slice(0, 10), pro: tier === 'pro', headshot: gv.headshot })}${notes.length ? `<p class="micro faint gi-sample">${notes.map(esc).join(' · ')}</p>` : ''}`;
    const caption = ctx ? opponentCaption(ctx) : 'Checking schedule';
    return `<div class="panel-head"><h3>PBE goalie intelligence</h3><span class="micro" data-goalie-context="${esc(ctx?.state || 'PENDING')}">${esc(caption)}</span></div>
      ${tier !== 'pro' ? lockPanel('PBE Goalie Form', 'The 0–100 reading and every component, for every goalie.', { compact: true }) : ''}${body}`;
  }
  return `<div class="panel-head"><h3>PBE intelligence</h3><a class="micro gold" href="#/winhl">WinHL leaderboard ›</a></div>
    <div class="iq-grid iq-grid--3">
      <div class="gi-card"><span class="gx-cell__k">WinHL</span>${winhlBlock(st.winhl)}</div>
      <div class="gi-card"><span class="gx-cell__k">Fatigue</span>${fatigueBlock(st.fatigue, tier)}</div>
      <div class="gi-card"><span class="gx-cell__k">Fight ledger</span>${fightScoreBlock(st.fightLedger, fights) || '<div class="pbe-skeleton" style="height:60px"></div>'}</div>
    </div>`;
}
