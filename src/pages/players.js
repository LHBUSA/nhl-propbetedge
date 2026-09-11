import { $, esc, on } from '../lib/dom.js';
import { describeError, nhl } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { gameTypeLabel, n, num, svPct, todayET } from '../lib/format.js';
import { TEAMS, TEAM_BY_ABBREV } from '../lib/teams.js';
import { teamMark } from '../components/game.js';
import { playerIdentity } from '../components/player.js';

const REGULAR_SEASON_START = '2026-09-29';
const CATS = {
  points: { kind: 'skater', label: 'Points', short: 'P' },
  goals: { kind: 'skater', label: 'Goals', short: 'G' },
  assists: { kind: 'skater', label: 'Assists', short: 'A' },
  goalsPp: { kind: 'skater', label: 'PP goals', short: 'PPG' },
  toi: { kind: 'skater', label: 'TOI / GP', short: 'TOI/GP' },
  savePctg: { kind: 'goalie', label: 'Save %', short: 'SV%' },
  goalsAgainstAverage: { kind: 'goalie', label: 'GAA', short: 'GAA', lowerIsBetter: true },
  wins: { kind: 'goalie', label: 'Wins', short: 'W' }
};
const DIVISIONS = [['Eastern', 'Atlantic'], ['Eastern', 'Metropolitan'], ['Western', 'Central'], ['Western', 'Pacific']];

const mmss = seconds => {
  const s = n(seconds);
  if (s === null) return '—';
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
};
const fmtValue = (cat, v) => {
  if (cat === 'toi') return mmss(v);
  if (cat === 'savePctg') return svPct(v);
  if (cat === 'goalsAgainstAverage') return num(v, 2);
  return num(v);
};
const seasonLabel = s => {
  const t = String(s ?? '');
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}–${t.slice(6, 8)}` : '';
};

// The source "current" window, labelled with the season it actually covers.
function windowLabel(data) {
  if (data?.season) return `${seasonLabel(data.season)} ${String(gameTypeLabel(data.game_type) || 'regular season').toLowerCase()}`;
  const before = todayET() < REGULAR_SEASON_START;
  return before ? '2025–26 regular season (most recent completed)' : 'Current season to date';
}

function leadersTable(state) {
  const cat = state.cat;
  const entry = state.cache.get(cat);
  const meta = CATS[cat];
  if (!entry) return '<div class="pbe-skeleton" style="height:560px"></div>';
  if (entry.error) {
    const e = describeError(entry.error);
    return `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`;
  }
  const d = entry.data;
  const rows = (d.leaders || []).slice(0, 25);
  if (!rows.length) return `<div class="pbe-empty"><h3>No leaders returned.</h3><p>The NHL leaders source returned no rows for ${esc(meta.label)}.</p></div>`;
  const values = rows.map(r => n(r.value)).filter(v => v !== null);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // Bar = share of the leader's value (inverted for GAA, where lower leads).
  const width = v => {
    const x = n(v);
    if (x === null || !max) return 0;
    return meta.lowerIsBetter ? (min / x) * 100 : (x / max) * 100;
  };
  let lastValue = null; let lastRank = 0;
  return `<div class="table-wrap"><table class="pbe-table rs-leaders">
    <caption class="sr-only">${esc(meta.label)} leaders, ${esc(windowLabel(d))}</caption>
    <thead><tr><th class="num">Rk</th><th>Player</th><th>Team</th><th class="num">${esc(meta.short)}</th><th class="rs-hide-sm">Pos</th></tr></thead>
    <tbody>${rows.map((r, i) => {
      const rank = r.value === lastValue ? lastRank : i + 1;
      lastValue = r.value; lastRank = rank;
      const known = TEAM_BY_ABBREV.has(r.team);
      return `<tr>
        <td class="num rs-rank">${rank}</td>
        <td><a class="rs-pl" href="#/player/${esc(r.id)}">${playerIdentity({ id: r.id, name: r.name || `${r.first_name || ''} ${r.last_name || ''}`, team: r.team, size: 'sm' })}<span class="rs-pl__no mono">${r.sweater_number ? `#${esc(r.sweater_number)}` : ''}</span><span><span class="rs-fn">${esc(r.first_name || '')} </span><span class="rs-fi">${esc((r.first_name || '').slice(0, 1))}. </span><b>${esc(r.last_name || r.name || '')}</b></span></a></td>
        <td>${known ? `<a class="rs-tm" href="#/team/${esc(r.team)}">${teamMark({ abbrev: r.team, logo: r.team_logo }, 22)}<b>${esc(r.team)}</b></a>` : `<span class="rs-tm">${esc(r.team || '—')}</span>`}</td>
        <td class="num rs-val"><span class="rs-val__bar" style="--w:${width(r.value).toFixed(1)}%" aria-hidden="true"></span><b>${esc(fmtValue(cat, r.value))}</b></td>
        <td class="rs-hide-sm rs-pos">${esc(r.position || '')}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

export function mount(root, params) {
  const state = {
    cat: CATS[params.cat] ? params.cat : 'points',
    cache: new Map()
  };
  root.innerHTML = `<section class="wrap section rs-players">
    <div class="section-head">
      <div><span class="eyebrow">Players</span><h2>League leaders</h2></div>
      <p>Top 25 in each category from the official NHL leader boards. Tap a player for game logs, shot volume and historical frequencies; tap a club for its roster.</p>
    </div>
    <div class="rs-players-grid">
      <div class="rs-col">
        <section class="pbe-panel">
          <div class="rs-cats">
            <div class="rs-cats__grp"><span class="micro">Skaters</span><div class="chips" role="group" aria-label="Skater categories">${Object.entries(CATS).filter(([, c]) => c.kind === 'skater').map(([k, c]) => `<button class="chip" data-cat="${k}" aria-pressed="${state.cat === k}">${c.label}</button>`).join('')}</div></div>
            <div class="rs-cats__grp"><span class="micro">Goalies</span><div class="chips" role="group" aria-label="Goalie categories">${Object.entries(CATS).filter(([, c]) => c.kind === 'goalie').map(([k, c]) => `<button class="chip" data-cat="${k}" aria-pressed="${state.cat === k}">${c.label}</button>`).join('')}</div></div>
          </div>
          <div class="rs-bar" id="rs-lead-meta"></div>
          <div id="rs-lead"></div>
        </section>
      </div>
      <div class="rs-col">
        <section class="pbe-panel">
          <div class="panel-head"><h3>Browse by team</h3><span class="micro">32 clubs · rosters live on team pages</span></div>
          <div class="rs-divs">${DIVISIONS.map(([conf, div]) => `<div class="rs-div">
            <span class="micro">${esc(div)} <span class="faint">· ${esc(conf)}</span></span>
            <div class="rs-teamgrid">${TEAMS.filter(t => t.division === div).map(t => `<a class="rs-tile" href="#/team/${t.abbrev}">${teamMark({ abbrev: t.abbrev }, 26)}<b>${t.abbrev}</b><span>${esc(t.name)}</span></a>`).join('')}</div>
          </div>`).join('')}</div>
        </section>
        <div class="pbe-note rs-search-note"><b>No free-text player search yet.</b> The Ctrl-K palette searches teams, games and pages. To find any player, open their club's roster or a leader board.</div>
      </div>
    </div>
  </section>`;

  const leadEl = $('#rs-lead', root);
  const metaEl = $('#rs-lead-meta', root);
  const controllers = new Set();

  const render = () => {
    const entry = state.cache.get(state.cat);
    const c = CATS[state.cat];
    metaEl.innerHTML = entry?.data
      ? `<span class="rs-season"><b>${esc(c.kind === 'goalie' ? 'Goalies' : 'Skaters')} · ${esc(c.label)}</b> · ${esc(windowLabel(entry.data))}</span>${freshStamp(entry.meta)}
         <p class="micro rs-season-note">${esc(entry.data.season_note || '')}${c.kind === 'goalie' ? ' Minimum-games qualification is the NHL source’s.' : ''}</p>`
      : '';
    leadEl.innerHTML = leadersTable(state);
  };

  const load = cat => {
    if (state.cache.has(cat) && !state.cache.get(cat).error) return render();
    state.cache.delete(cat);
    render();
    const ctl = new AbortController();
    controllers.add(ctl);
    const path = CATS[cat].kind === 'goalie' ? '/nhl/goalies/leaders' : '/nhl/leaders';
    nhl(path, { category: cat, limit: 25 }, { signal: ctl.signal })
      .then(res => { state.cache.set(cat, { data: res.data, meta: res.meta }); })
      .catch(error => { if (error.kind !== 'aborted') state.cache.set(cat, { error }); })
      .finally(() => { controllers.delete(ctl); if (state.cat === cat) render(); });
  };
  load(state.cat);

  const disposers = [
    on(root, 'click', '[data-cat]', (_, b) => {
      state.cat = b.dataset.cat;
      root.querySelectorAll('[data-cat]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.cat === state.cat)));
      history.replaceState(null, '', `#/players${state.cat === 'points' ? '' : `?cat=${state.cat}`}`);
      load(state.cat);
    })
  ];
  return () => {
    controllers.forEach(c => c.abort());
    disposers.forEach(d => d());
  };
}
