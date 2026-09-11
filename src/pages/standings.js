import { $, esc, on } from '../lib/dom.js';
import { describeError, nhl } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { dateLabel, n, svPct } from '../lib/format.js';
import { TEAM_BY_ABBREV } from '../lib/teams.js';
import { teamMark } from '../components/game.js';

const VIEWS = [['division', 'Division'], ['conference', 'Conference'], ['league', 'League'], ['wildcard', 'Wild card']];
const CONFERENCES = [['Eastern', ['Atlantic', 'Metropolitan']], ['Western', ['Central', 'Pacific']]];
const REGULAR_SEASON_START = '2026-09-29';

// NHL clinch indicator codes, as published by the standings source.
const CLINCH = {
  p: "Presidents' Trophy",
  z: 'Clinched conference',
  y: 'Clinched division',
  x: 'Clinched playoff berth',
  e: 'Eliminated'
};

// Standings dated Jul-Dec belong to the season starting that year; Jan-Jun to the one before.
function seasonFromDate(ymd) {
  const m = /^(\d{4})-(\d{2})/.exec(ymd || '');
  if (!m) return '';
  const start = Number(m[2]) >= 7 ? Number(m[1]) : Number(m[1]) - 1;
  return `${start}–${String(start + 1).slice(2)}`;
}

function longDate(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${ymd}T12:00:00Z`));
}

const signed = v => {
  const x = n(v);
  if (x === null) return '<span class="faint">—</span>';
  if (x === 0) return '<span class="rs-diff">0</span>';
  return `<span class="rs-diff ${x > 0 ? 'is-pos' : 'is-neg'}">${x > 0 ? '+' : '−'}${Math.abs(x)}</span>`;
};

const clinchBadge = code => {
  const c = String(code || '').toLowerCase();
  if (!c) return '';
  return `<abbr class="rs-clinch rs-clinch--${esc(c)}" title="${esc(CLINCH[c] || `Source code ${c}`)}">${esc(c)}</abbr>`;
};

const HEAD = `<thead><tr>
  <th class="rk" scope="col" title="Rank in this view">Rk</th>
  <th class="tm" scope="col">Team</th>
  <th class="num" scope="col" title="Games played">GP</th>
  <th class="num" scope="col" title="Wins">W</th>
  <th class="num" scope="col" title="Regulation losses">L</th>
  <th class="num" scope="col" title="Overtime / shootout losses">OTL</th>
  <th class="num rs-pts" scope="col" title="Points">PTS</th>
  <th class="num" scope="col" title="Points percentage">P%</th>
  <th class="num" scope="col" title="Regulation wins">RW</th>
  <th class="num" scope="col" title="Goals for">GF</th>
  <th class="num" scope="col" title="Goals against">GA</th>
  <th class="num" scope="col" title="Goal differential">DIFF</th>
  <th class="num" scope="col" title="Record, last 10 games">L10</th>
  <th class="num" scope="col" title="Current streak">STRK</th>
  <th class="num" scope="col" title="Home record W-L-OTL">HOME</th>
  <th class="num" scope="col" title="Road record W-L-OTL">ROAD</th>
  <th class="cl" scope="col" title="Clinch status">CL</th>
</tr></thead>`;
const COLS = 17;

function row(r, rank, extraClass = '') {
  const abbr = r.team;
  const known = TEAM_BY_ABBREV.has(abbr);
  const name = r.name || TEAM_BY_ABBREV.get(abbr)?.name || '';
  const team = `${teamMark({ abbrev: abbr, logo: r.logo }, 24)}<b>${esc(abbr)}</b><span class="rs-tname">${esc(name)}</span>`;
  return `<tr class="${extraClass}">
    <td class="rk num">${esc(rank ?? '—')}</td>
    <td class="tm">${known ? `<a class="rs-team" href="#/team/${esc(abbr)}">${team}</a>` : `<span class="rs-team">${team}</span>`}</td>
    <td class="num">${esc(r.games_played ?? '—')}</td>
    <td class="num">${esc(r.wins ?? '—')}</td>
    <td class="num">${esc(r.losses ?? '—')}</td>
    <td class="num">${esc(r.ot_losses ?? '—')}</td>
    <td class="num rs-pts">${esc(r.points ?? '—')}</td>
    <td class="num">${svPct(r.point_pct)}</td>
    <td class="num">${esc(r.regulation_wins ?? '—')}</td>
    <td class="num">${esc(r.goals_for ?? '—')}</td>
    <td class="num">${esc(r.goals_against ?? '—')}</td>
    <td class="num">${signed(r.goal_diff)}</td>
    <td class="num">${esc(r.l10 || '—')}</td>
    <td class="num">${esc(r.streak || '—')}</td>
    <td class="num">${esc(r.home || '—')}</td>
    <td class="num">${esc(r.road || '—')}</td>
    <td class="cl">${clinchBadge(r.clinch)}</td>
  </tr>`;
}

const groupRow = (label, sub = '', level = 1) => `<tr class="rs-grp rs-grp--${level}"><td colspan="${COLS}"><span class="rs-grp__in">${esc(label)}${sub ? ` <span class="rs-grp__sub">${esc(sub)}</span>` : ''}</span></td></tr>`;

const bySeq = key => (a, b) => (n(a[key]) ?? 99) - (n(b[key]) ?? 99);

function tableBody(rows, view) {
  const out = [];
  if (view === 'league') {
    [...rows].sort(bySeq('league_seq')).forEach(r => out.push(row(r, r.league_seq)));
    return out.join('');
  }
  for (const [conf, divisions] of CONFERENCES) {
    const confRows = rows.filter(r => r.conference === conf);
    if (!confRows.length) continue;
    if (view === 'conference') {
      out.push(groupRow(`${conf} Conference`));
      confRows.sort(bySeq('conference_seq')).forEach(r => out.push(row(r, r.conference_seq)));
      continue;
    }
    if (view === 'division') {
      for (const div of divisions) {
        const divRows = confRows.filter(r => r.division === div).sort(bySeq('division_seq'));
        if (!divRows.length) continue;
        out.push(groupRow(`${div} Division`, conf));
        divRows.forEach(r => out.push(row(r, r.division_seq)));
      }
      continue;
    }
    // Wild card: top three per division, then the conference wild-card race.
    out.push(groupRow(`${conf} Conference`));
    const leaders = new Set();
    for (const div of divisions) {
      const top = confRows.filter(r => r.division === div).sort(bySeq('division_seq')).slice(0, 3);
      top.forEach(r => leaders.add(r.team));
      out.push(groupRow(`${div} · top 3`, '', 2));
      top.forEach(r => out.push(row(r, r.division_seq)));
    }
    const hasWc = confRows.some(r => n(r.wildcard_seq) > 0);
    const rest = confRows.filter(r => !leaders.has(r.team)).sort(hasWc ? bySeq('wildcard_seq') : bySeq('conference_seq'));
    out.push(groupRow('Wild card', 'top 2 hold playoff spots', 2));
    rest.forEach((r, i) => out.push(row(r, `WC${i + 1}`, i === 1 ? 'rs-cut' : '')));
  }
  return out.join('');
}

export function mount(root, params, ctx) {
  const state = {
    view: VIEWS.some(([k]) => k === params.view) ? params.view : 'division',
    data: null, meta: null, error: null
  };
  root.innerHTML = `<section class="wrap section rs-standings">
    <div class="section-head">
      <div><span class="eyebrow">Standings</span><h2>NHL standings</h2></div>
      <p>The official NHL table: record, points pace, regulation wins, goal differential, form and home/road splits — stamped with the date the source froze it.</p>
    </div>
    <div id="rs-st-body"></div>
  </section>`;
  const body = $('#rs-st-body', root);
  const controller = new AbortController();

  const render = () => {
    if (!state.data) {
      if (state.error) {
        const e = describeError(state.error);
        body.innerHTML = `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`;
      } else {
        body.innerHTML = '<div class="pbe-skeleton" style="height:44px;margin-bottom:12px"></div><div class="pbe-skeleton" style="height:640px"></div>';
      }
      return;
    }
    const d = state.data;
    const rows = Array.isArray(d.standings) ? d.standings : [];
    const prior = d.semantics === 'PRIOR_SEASON_FINAL';
    const season = seasonFromDate(d.standings_date);
    const regStart = ctx?.latestBoard?.data?.calendar?.regular_season_start || REGULAR_SEASON_START;
    const startYear = Number(season.slice(0, 4));
    const nextSeason = startYear ? `${startYear + 1}–${String(startYear + 2).slice(2)}` : 'new';
    const banner = prior
      ? `<div class="rs-banner" role="note"><span class="pbe-badge pbe-badge--final">Prior season</span><p><b>${esc(season)} final standings</b> (as of ${esc(longDate(d.standings_date))}). The ${esc(nextSeason)} table starts ${esc(dateLabel(regStart).replace(/^\w+, /, ''))}.</p></div>`
      : '';
    const label = `${season ? `${season} · ` : ''}as of ${longDate(d.standings_date) || 'date not stated'}`;
    const legend = Object.entries(CLINCH).filter(([k]) => rows.some(r => String(r.clinch || '').toLowerCase() === k));
    const viewName = VIEWS.find(([k]) => k === state.view)[1];
    body.innerHTML = `
      ${banner}
      <div class="rs-toolbar">
        <div class="chips" role="group" aria-label="Standings view">${VIEWS.map(([k, l]) => `<button class="chip" data-view="${k}" aria-pressed="${state.view === k}">${l}</button>`).join('')}</div>
        ${freshStamp(state.meta, { label })}
      </div>
      ${rows.length ? `<div class="table-wrap rs-st-wrap">
        <table class="pbe-table rs-st">
          <caption class="sr-only">${esc(season)} NHL standings, ${esc(viewName)} view${prior ? ', final regular-season table' : ''}</caption>
          ${HEAD}
          <tbody>${tableBody(rows, state.view)}</tbody>
        </table>
      </div>
      <div class="rs-legend">
        <span>P% = points ÷ possible points</span><span>RW = regulation wins</span><span>DIFF = GF − GA, signed</span>
        ${state.view === 'wildcard' ? '<span>Dashed rule = playoff line</span>' : ''}
        ${legend.map(([k, v]) => `<span>${clinchBadge(k)} ${esc(v)}</span>`).join('')}
      </div>` : `<div class="pbe-empty"><h3>No standings rows.</h3><p>The NHL standings source returned an empty table${d.standings_date ? ` for ${esc(longDate(d.standings_date))}` : ''}. Nothing is shown rather than something invented.</p></div>`}`;
  };

  render();
  nhl('/nhl/standings', {}, { signal: controller.signal })
    .then(res => { state.data = res.data; state.meta = res.meta; render(); })
    .catch(error => { if (error.kind === 'aborted') return; state.error = error; render(); });

  const disposers = [
    on(root, 'click', '[data-view]', (_, btn) => {
      state.view = btn.dataset.view;
      history.replaceState(null, '', `#/standings${state.view === 'division' ? '' : `?view=${state.view}`}`);
      render();
    })
  ];

  return () => {
    controller.abort();
    disposers.forEach(d => d());
  };
}
