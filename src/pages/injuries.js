// Injury & Availability Desk (degraded mode, source matrix §4c).
// A structured status table (OUT / DTD / IR) is BLOCKED pending a licensed
// injury feed. This desk shows REPORTED items — NHL.com injury-tagged stories,
// transactions and trades — as headlines with links. A report is never
// converted into a status and no diagnosis is inferred.
import { $, esc, on, safeUrl } from '../lib/dom.js';
import { describeError, news } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { dayET, timeET } from '../lib/format.js';
import { createPoller } from '../lib/poll.js';
import { TEAMS, TEAM_BY_ABBREV, teamAccent } from '../lib/teams.js';
import { teamMark } from '../components/game.js';
import { playerIdentity } from '../components/player.js';

// Logos here always sit next to visible team text: decorative, so alt="".
const mark = (team, size) => teamMark(team, size).replace(/ alt="[^"]*"/, ' alt=""');

const CATS = [
  ['Injuries', 'Injury reports', 'Injury report'],
  ['Transactions', 'Transactions', 'Transaction'],
  ['Trades', 'Trades', 'Trade']
];
const DAY = 24 * 3600 * 1000;

// ---------------------------------------------------------------- helpers
function rel(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
}
const monogram = name => esc(String(name || '').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '—');
const isYahoo = item => item.origin === 'yahoo sports' || item.source === 'Yahoo Sports';
const sourceText = item => (isYahoo(item) ? `via Yahoo Sports${item.publisher ? ` · ${item.publisher}` : ''}` : (item.source || 'Source not stated'));
const catLabel = cat => CATS.find(c => c[0] === cat)?.[2] || cat;

function chips(item) {
  const teams = (item.teams || []).filter(t => TEAM_BY_ABBREV.has(t));
  const players = (item.players || []).filter(p => p && p.id);
  if (!teams.length && !players.length) return '';
  return `<div class="dk-chips">${teams.map(t => `<a class="dk-chip" href="#/team/${esc(t)}" title="Team link · basis: ${esc(item.teams_basis || 'not stated')}">${mark({ abbrev: t }, 18)}<span>${esc(t)}</span></a>`).join('')}${players.map(p => `<a class="dk-chip dk-chip--player" href="#/player/${esc(p.id)}">${playerIdentity({ id: p.id, name: p.name, team: teams.length === 1 ? teams[0] : null, size: 'xs' })}<span>${esc(p.name || p.id)}</span></a>`).join('')}</div>`;
}

function rowMarkup(item, open) {
  const url = safeUrl(item.url);
  const list = (item.related || []).filter(r => safeUrl(r.url));
  const count = item.related_count || list.length;
  const cat = item.category;
  return `<li class="dk-row dk-row--desk${item.breaking ? ' is-breaking' : ''}" data-cat="${esc(cat)}">
    <div class="dk-row__time"><time datetime="${esc(item.published_at)}">${esc(rel(item.published_at))}</time><span class="mono">${esc(dayET(item.published_at))}</span><span class="mono">${esc(timeET(item.published_at))}</span></div>
    <div class="dk-row__main">
      <div class="dk-row__tags">${item.breaking ? '<span class="dk-cat dk-cat--breaking" title="Material update inside the last 2 hours">Breaking</span>' : ''}<span class="dk-cat dk-cat--material dk-cat--${esc(String(cat).toLowerCase())}" title="${esc(`Category: ${cat} · basis: ${item.category_basis || 'not stated'}`)}">${esc(catLabel(cat))}</span><span class="dk-row__src">${esc(sourceText(item))}</span></div>
      <a class="dk-row__title" ${url ? `href="${esc(url)}" target="_blank" rel="noopener nofollow"` : ''}>${esc(item.title)}${url ? '<span class="dk-ext" aria-hidden="true">↗</span>' : ''}</a>
      <div class="dk-row__foot">${chips(item)}${count ? `<button class="dk-rel" type="button" data-rel="${esc(item.id)}" aria-expanded="${open}">+${count} source${count === 1 ? '' : 's'}</button>` : ''}</div>
      ${open && list.length ? `<ul class="dk-rel__list">${list.map(r => `<li><span class="micro">${esc(r.source || '')}</span><a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener nofollow">${esc(r.title || r.url)}</a>${r.published_at ? `<time class="micro" datetime="${esc(r.published_at)}">${esc(rel(r.published_at))}</time>` : ''}</li>`).join('')}</ul>` : ''}
    </div>
  </li>`;
}

function blockedPanel() {
  return `<section class="dk-blocked" aria-label="Structured injury status">
    <div class="dk-blocked__head">
      <span class="pbe-badge pbe-badge--unavailable">Blocked</span>
      <h3>Structured status table</h3>
      <div class="dk-blocked__vocab" aria-label="Status vocabulary, not populated">${['OUT', 'DTD', 'IR', 'IR-LT', 'GTD'].map(s => `<span>${s}</span>`).join('')}</div>
    </div>
    <p>An OUT / day-to-day / IR table needs a licensed injury feed. The NHL publishes no injury report, and the public trackers that do (ESPN, RotoWire, DailyFaceoff) bar automated or commercial use — so none is shown. What follows is what can be sourced today: NHL.com injury reports, official transactions and trades, each linked to its source.</p>
  </section>`;
}

// ---------------------------------------------------------------- mount
export function mount(root, params) {
  const state = {
    view: 'all',
    team: TEAM_BY_ABBREV.has(String(params.team || '').toUpperCase()) ? String(params.team).toUpperCase() : '',
    feeds: {},          // cat -> { items, meta, error }
    loaded: false,
    failed: false,
    expanded: new Set()
  };

  root.innerHTML = `<section class="wrap section dk dk-inj">
    <div class="section-head section-head--editorial">
      <div><span class="eyebrow">Injury &amp; Availability Desk</span><h2>Who is out — and what changed</h2></div>
      <p>Reported availability news, official roster moves and trades, newest first. Reports are shown as reports: we never turn a headline into a status.</p>
    </div>
    ${blockedPanel()}
    <div id="dk-i-summary"></div>
    <div class="dk-teamfilter">
      <div class="dk-teamfilter__head"><span class="micro">Filter by team</span><span class="micro faint" id="dk-i-present"></span></div>
      <div class="dk-teamchips" role="group" aria-label="Team filter" id="dk-i-teams"></div>
    </div>
    <div class="dk-i-grid">
      <div class="dk-i-main">
        <div class="dk-tabs" role="tablist" aria-label="Report type" id="dk-i-tabs"></div>
        <div id="dk-i-feed"></div>
      </div>
      <aside class="dk-i-side">
        <section class="pbe-panel dk-rules">
          <div class="panel-head"><h3>Desk rules</h3></div>
          <ol>
            <li><b>Never infer a diagnosis.</b> Wording stays the source's, behind the link.</li>
            <li><b>Never convert a report into a status.</b> “Expected to miss” is not OUT; a scratch is not an injury.</li>
            <li><b>Body area only if the source reports it</b> — in its own headline, never guessed.</li>
            <li><b>Every item carries its source and time.</b> Older reports are not re-dated.</li>
          </ol>
        </section>
        <section class="pbe-panel" id="dk-i-teamcount"></section>
        <section class="pbe-panel" id="dk-i-sources"></section>
        <nav class="pbe-panel dk-i-links" aria-label="Related desks">
          <a href="#/goalies"><b>Goalie Center</b><span>Confirmed starters at puck drop</span></a>
          <a href="#/lines"><b>Lines</b><span>Official rosters by team</span></a>
          <a href="#/news"><b>Newsroom</b><span>Every category, every source</span></a>
        </nav>
      </aside>
    </div>
  </section>`;

  const els = {
    summary: $('#dk-i-summary', root), teams: $('#dk-i-teams', root), present: $('#dk-i-present', root),
    tabs: $('#dk-i-tabs', root), feed: $('#dk-i-feed', root),
    teamcount: $('#dk-i-teamcount', root), sources: $('#dk-i-sources', root)
  };

  const allItems = () => {
    const byId = new Map();
    CATS.forEach(([c]) => (state.feeds[c]?.items || []).forEach(i => { if (!byId.has(i.id)) byId.set(i.id, i); }));
    return [...byId.values()].filter(i => i.published_at).sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
  };

  const render = () => {
    const items = allItems();
    const now = Date.now();
    const teamCounts = new Map();
    items.forEach(i => (i.teams || []).forEach(t => teamCounts.set(t, (teamCounts.get(t) || 0) + 1)));
    const teamItems = state.team ? items.filter(i => (i.teams || []).includes(state.team)) : items;
    const byCat = c => teamItems.filter(i => i.category === c);
    const recent = list => list.filter(i => now - Date.parse(i.published_at) <= DAY).length;
    const anyOk = CATS.some(([c]) => state.feeds[c]?.meta);

    // Summary strip: real counts from the feed window.
    els.summary.innerHTML = state.loaded && !anyOk ? '' : state.loaded ? `<dl class="kv dk-i-kv">
      ${CATS.map(([c, label]) => `<div><dt>${esc(label)} · 24h</dt><dd>${recent(byCat(c))}<small> / ${byCat(c).length} in window</small></dd></div>`).join('')}
      <div><dt>Teams mentioned</dt><dd>${teamCounts.size}<small> of 32</small></dd></div>
    </dl>` : '<div class="pbe-skeleton" style="height:62px;margin-bottom:16px"></div>';

    root.querySelector('.dk-teamfilter').hidden = state.loaded && !anyOk;
    els.tabs.hidden = state.loaded && !anyOk;
    els.present.textContent = state.loaded ? `${teamCounts.size} team${teamCounts.size === 1 ? '' : 's'} in the feed` : '';
    els.teams.innerHTML = `<button class="chip dk-tchip" data-team="" aria-pressed="${!state.team}">All</button>${TEAMS.map(t => {
      const c = teamCounts.get(t.abbrev) || 0;
      return `<button class="chip dk-tchip${c ? ' is-present' : ''}" data-team="${t.abbrev}" aria-pressed="${state.team === t.abbrev}" ${c || state.team === t.abbrev ? '' : 'disabled'} title="${esc(t.full)}${c ? ` · ${c} item${c === 1 ? '' : 's'}` : ' · nothing in the feed'}" style="--c:${teamAccent(t.abbrev)}">${esc(t.abbrev)}${c ? `<span class="count">${c}</span>` : ''}</button>`;
    }).join('')}`;

    const viewCount = v => (v === 'all' ? teamItems.length : byCat(v).length);
    els.tabs.innerHTML = [['all', 'All'], ...CATS.map(([c, l]) => [c, l])].map(([k, l]) => `<button role="tab" class="chip${state.view === k ? ' is-active' : ''}" data-view="${esc(k)}" aria-selected="${state.view === k}">${esc(l)}${state.loaded ? `<span class="count">${viewCount(k)}</span>` : ''}</button>`).join('');

    // Feed
    const errors = CATS.map(([c]) => state.feeds[c]).filter(f => f?.error);
    if (!state.loaded) {
      els.feed.innerHTML = '<div class="pbe-skeleton" style="height:540px"></div>';
    } else if (!items.length && errors.length === CATS.length) {
      const e = describeError(errors[0].error);
      els.feed.innerHTML = `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(errors[0].error.kind === 'not_deployed' || errors[0].error.kind === 'legacy' ? 'The newsroom feed that powers this desk is not connected in this build. Nothing is shown rather than something invented.' : e.body)}</div>`;
    } else {
      const visible = state.view === 'all' ? teamItems : byCat(state.view);
      if (!visible.length) {
        els.feed.innerHTML = `<div class="pbe-empty dk-empty"><h3>Nothing reported${state.team ? ` for ${esc(TEAM_BY_ABBREV.get(state.team)?.full || state.team)}` : ''} in this window.</h3><p>No item in the current feed window matches. That is not a clean bill of health — it means no source in this feed has reported one.</p>${state.team || state.view !== 'all' ? '<p style="margin-top:12px"><button class="pbe-btn pbe-btn--sm" data-reset>Show everything</button></p>' : ''}</div>`;
      } else {
        const fresh = visible.filter(i => now - Date.parse(i.published_at) <= DAY);
        const older = visible.filter(i => now - Date.parse(i.published_at) > DAY);
        const group = (title, list, emptyText) => `<div class="dk-group">
          <div class="dk-group__head"><h3>${esc(title)}</h3><span class="micro">${list.length} item${list.length === 1 ? '' : 's'}</span></div>
          ${list.length ? `<ol class="dk-rows">${list.map(i => rowMarkup(i, state.expanded.has(i.id))).join('')}</ol>` : `<p class="dk-group__empty dim">${esc(emptyText)}</p>`}
        </div>`;
        els.feed.innerHTML = `${errors.length ? `<div class="pbe-note dk-banner"><b>Partial feed.</b> ${esc(errors.map(e => catLabel(e.cat)).join(', '))} did not load; other categories are shown.</div>` : ''}
          ${group('Last 24 hours', fresh, 'No new reports in the last 24 hours.')}
          ${older.length ? group('Earlier', older, '') : ''}`;
      }
    }

    // Reports by team (derived counts from this window, not a status)
    const top = [...teamCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
    const max = top[0]?.[1] || 1;
    els.teamcount.innerHTML = `<div class="panel-head"><h3>Most-mentioned teams</h3><span class="micro">This window</span></div>
      ${top.length ? `<ol class="dk-bars">${top.map(([t, c]) => `<li><button class="dk-bars__btn" data-team="${esc(t)}" aria-pressed="${state.team === t}">${mark({ abbrev: t }, 20)}<b class="mono">${esc(t)}</b><span class="dk-bars__track"><i style="width:${(c / max * 100).toFixed(0)}%;--c:${teamAccent(t)}"></i></span><span class="mono">${c}</span></button></li>`).join('')}</ol>
      <p class="micro dk-bars__note">Count of reports and moves tagged to each team — volume, not severity.</p>` : `<p class="dim">${!state.loaded ? 'Loading…' : anyOk ? 'No team-tagged items yet.' : 'Unavailable — the feed did not load.'}</p>`}`;

    const firstMeta = CATS.map(([c]) => state.feeds[c]?.meta).find(Boolean);
    els.sources.innerHTML = `<div class="panel-head"><h3>Sources</h3></div>
      ${firstMeta ? `<p style="margin-bottom:10px">${freshStamp(firstMeta, { failed: state.failed, source: 'Newsroom' })}</p>` : ''}
      <ul class="dk-srclist">
        <li><i class="${anyOk ? 'ok' : ''}" aria-hidden="true"></i><span><b>NHL.com</b> injury &amp; transactions tags — reported${anyOk ? '' : ' · not loaded'}</span></li>
        <li><i class="${anyOk ? 'ok' : ''}" aria-hidden="true"></i><span><b>Yahoo Sports RSS</b> — headlines via their publishers${anyOk ? '' : ' · not loaded'}</span></li>
        <li><i aria-hidden="true"></i><span><b>Licensed status feed</b> — not integrated (blocked)</span></li>
      </ul>`;
  };

  render();

  const poller = createPoller(async signal => {
    const results = await Promise.all(CATS.map(([c]) => news({ category: c, limit: 100 }, { signal, timeout: 12000 })
      .then(res => ({ c, res }))
      .catch(error => ({ c, error }))));
    if (signal.aborted) return null;
    let ok = 0;
    for (const r of results) {
      if (r.error?.kind === 'aborted') return null;
      if (r.res) { state.feeds[r.c] = { items: r.res.data.items || [], meta: r.res.meta, error: null }; ok += 1; }
      else state.feeds[r.c] = { ...(state.feeds[r.c] || { items: [] }), error: r.error, cat: r.c };
    }
    state.loaded = true;
    state.failed = ok < CATS.length && allItems().length > 0;
    render();
    const blocked = results.every(r => r.error && (r.error.kind === 'not_deployed' || r.error.kind === 'legacy'));
    return blocked ? null : ok ? 300000 : 30000;
  });
  poller.start();

  const disposers = [
    on(root, 'click', '[data-view]', (_, btn) => { state.view = btn.dataset.view; render(); }),
    on(root, 'click', '[data-team]', (_, btn) => {
      if (btn.disabled) return;
      const t = btn.dataset.team;
      state.team = state.team === t ? '' : t;
      history.replaceState(null, '', `#/injuries${state.team ? `?team=${state.team}` : ''}`);
      render();
    }),
    on(root, 'click', '[data-reset]', () => { state.view = 'all'; state.team = ''; history.replaceState(null, '', '#/injuries'); render(); }),
    on(root, 'click', '[data-rel]', (_, btn) => {
      const id = btn.dataset.rel;
      if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
      render();
    })
  ];

  return () => {
    poller.stop();
    disposers.forEach(d => d());
  };
}
