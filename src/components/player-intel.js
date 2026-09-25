// Player-page intelligence: WinHL (skaters), PBE Goalie Form + NHL Edge
// (goalies), player fatigue (NHL Pro) and the ledger's PBE Fight Score.
import { esc } from '../lib/dom.js';
import { describeError } from '../lib/api.js';
import { goalieCard } from './goalie-intel.js';
import { DASH, fmtScore, lockPanel, mmss, pointComponents, scoreRing, versionTag, weightedComponents } from './intel-ui.js';

const err = e => `<p class="micro faint">${esc(describeError(e).title)}.</p>`;

function winhlBlock(s) {
  if (!s) return '<div class="pbe-skeleton" style="height:120px"></div>';
  if (s.error) return s.error.status === 404 ? '<p class="micro faint">No WinHL row: this player has no qualifying skater season line in the WinHL window.</p>' : err(s.error);
  const d = s.data;
  const p = d.player;
  if (p.locked) {
    return `${p.season ? `<div class="gi-card__head">${scoreRing(p.season.score, { label: 'WinHL', size: 64, caption: `League #${p.season.rank_league}` })}<span class="micro">${esc(d.season_label)} season</span></div>` : ''}
      ${lockPanel('WinHL for every skater', 'Score, league/position/team rank, last-10 and last-5 form, trend and the component breakdown.', { compact: true })}`;
  }
  const w = x => (x && Number.isFinite(x.score) ? fmtScore(x.score, 1) : DASH);
  return `<div class="gi-card__head">${scoreRing(p.season?.score ?? null, { label: 'WinHL', size: 70, caption: p.season?.rank_league ? `League #${p.season.rank_league}` : 'Not ranked' })}
      <div class="micro">${esc(d.season_label)} · L10 <b class="mono">${w(p.last10)}</b> · L5 <b class="mono">${w(p.last5)}</b> · trend ${p.trend === null ? DASH : `${p.trend > 0 ? '+' : ''}${p.trend}`}<br>${esc(p.group === 'D' ? 'Defense' : 'Forward')} rank ${esc(p.season?.rank_position ?? DASH)} · ${esc(p.team)} rank ${esc(p.season?.rank_team ?? DASH)}</div></div>
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
    const score = x.summary && Number.isFinite(Number(x.summary.score)) ? ` · PBE Fight Score <b class="mono">${fmtScore(x.summary.score, 1)}</b>${x.summary.provisional ? ' (provisional)' : ''}` : '';
    return `<div class="micro" data-fight-intel="${esc(x.season)}"><b>${esc(x.label)}</b> · ${r.fights} fight${r.fights === 1 ? '' : 's'} · fan-vote <b>${r.w}-${r.l}-${r.d}</b>${r.preseason ? ` · ${r.preseason} preseason not counted` : ''}${score}</div>`;
  }).join('') + '<p class="micro faint">Fan votes are not official NHL results. <a class="gold" href="#/fights">Fight ledger ›</a></p>';
}

export function playerIntelSection(p, st, fights = null) {
  const goalie = p.position === 'G';
  const tier = st.tier;
  if (goalie) {
    const g = st.goalie;
    const body = !g ? '<div class="pbe-skeleton" style="height:160px"></div>' : g.error ? err(g.error) : goalieCard({
      id: g.data.goalie_id, name: g.data.name, is_starter: false, season_line: g.data.season_line, baseline_line: g.data.baseline_line,
      form: g.data.form, workload: g.data.workload, recent_window: g.data.recent_window, edge: g.data.edge
    }, { team: g.data.team, gameDate: new Date().toISOString().slice(0, 10), pro: tier === 'pro' });
    return `<div class="panel-head"><h3>PBE goalie intelligence</h3><span class="micro">as of today · no opponent</span></div>
      ${tier !== 'pro' ? lockPanel('PBE Goalie Form', 'The 0–100 reading and every component, for every goalie.', { compact: true }) : ''}${body}`;
  }
  return `<div class="panel-head"><h3>PBE intelligence</h3><a class="micro gold" href="#/winhl">WinHL leaderboard ›</a></div>
    <div class="iq-grid iq-grid--3">
      <div class="gi-card"><span class="gx-cell__k">WinHL</span>${winhlBlock(st.winhl)}</div>
      <div class="gi-card"><span class="gx-cell__k">Fatigue</span>${fatigueBlock(st.fatigue, tier)}</div>
      <div class="gi-card"><span class="gx-cell__k">Fight ledger</span>${fightScoreBlock(st.fightLedger, fights) || '<div class="pbe-skeleton" style="height:60px"></div>'}</div>
    </div>`;
}
