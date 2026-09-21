// Newsroom. Headlines + source + time + link out only (never bodies or
// summaries). Yahoo items carry "via Yahoo Sports · {publisher}" attribution.
import { $, esc, on, safeUrl } from '../lib/dom.js';
import { describeError, news } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { dayET, timeET, todayET } from '../lib/format.js';
import { createPoller } from '../lib/poll.js';
import { TEAMS, TEAM_BY_ABBREV } from '../lib/teams.js';
import { teamMark } from '../components/game.js';
import { playerIdentity } from '../components/player.js';

// Logos here always sit next to visible team text: decorative, so alt="".
const mark = (team, size) => teamMark(team, size).replace(/ alt="[^"]*"/, ' alt=""');

const TABS = [
  ['All', 'All'], ['Breaking', 'Breaking'], ['Injuries', 'Injuries'], ['Goalies', 'Goalies'], ['Lines', 'Lines'],
  ['Trades', 'Trades'], ['Transactions', 'Transactions'], ['Previews', 'Previews'], ['Recaps', 'Recaps'],
  ['League news', 'League news'], ['PBE', 'PBE notes']
];
const MATERIAL = new Set(['Injuries', 'Trades', 'Transactions', 'Goalies', 'Lines']);
const WIRE_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 2 * 60 * 1000;
const SOURCE_LABELS = {
  nhl_general: 'NHL.com · stories',
  nhl_injury: 'NHL.com · injury tag',
  nhl_transactions: 'NHL.com · transactions tag',
  yahoo: 'Yahoo Sports RSS'
};

// ---------------------------------------------------------------- helpers
const ageS = iso => (Date.now() - Date.parse(iso)) / 1000;
function rel(iso) {
  const s = ageS(iso);
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
}
const absET = iso => `${dayET(iso)} · ${timeET(iso)}`;
const dayKey = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const dayHead = iso => {
  const k = dayKey(iso);
  const today = todayET();
  if (k === today) return 'Today';
  const y = new Date(`${today}T12:00:00Z`); y.setUTCDate(y.getUTCDate() - 1);
  if (k === y.toISOString().slice(0, 10)) return 'Yesterday';
  return dayET(iso, true);
};
const monogram = name => esc(String(name || '').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '—');
const slug = s => String(s || '').toLowerCase().replace(/[^a-z]+/g, '-');
const isYahoo = item => item.origin === 'yahoo sports' || item.source === 'Yahoo Sports';
const sourceText = item => (isYahoo(item) ? `via Yahoo Sports${item.publisher ? ` · ${item.publisher}` : ''}` : (item.source || 'Source not stated'));

function wireTimestamp(item) {
  const published = Date.parse(item?.published_at || '');
  return Number.isFinite(published) ? published : null;
}

function wireWindow(items) {
  const valid = (Array.isArray(items) ? items : []).filter(item => wireTimestamp(item) !== null);
  if (!valid.length) return { anchor: null, items: [] };

  // Five days at most means a five-day slice of the freshest data the wire
  // actually returned. Anchoring to Date.now() can blank the entire product
  // when an upstream publisher pauses for a few days.
  const anchor = Math.max(...valid.map(item => wireTimestamp(item)));
  return {
    anchor,
    items: valid.filter(item => {
      const published = wireTimestamp(item);
      const age = anchor - published;
      return age >= -FUTURE_SKEW_MS && age <= WIRE_MAX_AGE_MS;
    })
  };
}

function inWireWindow(item, anchor) {
  const published = wireTimestamp(item);
  if (published === null || !Number.isFinite(anchor)) return false;
  const age = anchor - published;
  return age >= -FUTURE_SKEW_MS && age <= WIRE_MAX_AGE_MS;
}

function matchesTab(item, tab) {
  if (tab === 'All') return true;
  if (tab === 'Breaking') return Boolean(item.breaking);
  if (tab === 'PBE') return false;
  return item.category === tab;
}

function chips(item) {
  const teams = (item.teams || []).filter(t => TEAM_BY_ABBREV.has(t));
  const players = (item.players || []).filter(p => p && p.id);
  if (!teams.length && !players.length) return '';
  return `<div class="dk-chips">${teams.map(t => `<a class="dk-chip" href="#/team/${esc(t)}" title="Team link · basis: ${esc(item.teams_basis || 'not stated')}">${mark({ abbrev: t }, 18)}<span>${esc(t)}</span></a>`).join('')}${players.map(p => `<a class="dk-chip dk-chip--player" href="#/player/${esc(p.id)}">${playerIdentity({ id: p.id, name: p.name, team: teams.length === 1 ? teams[0] : null, size: 'xs' })}<span>${esc(p.name || p.id)}</span></a>`).join('')}</div>`;
}

function related(item, open, anchor) {
  const list = (item.related || []).filter(r => safeUrl(r.url) && inWireWindow(r, anchor));
  const count = list.length;
  if (!count) return { button: '', list: '' };
  return {
    button: `<button class="dk-rel" type="button" data-rel="${esc(item.id)}" aria-expanded="${open}">+${count} source${count === 1 ? '' : 's'}</button>`,
    list: open && list.length ? `<ul class="dk-rel__list">${list.map(r => `<li><span class="micro">${esc(r.source || '')}</span><a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener nofollow">${esc(r.title || r.url)}</a>${r.published_at ? `<time class="micro" datetime="${esc(r.published_at)}">${esc(rel(r.published_at))}</time>` : ''}</li>`).join('')}</ul>` : ''
  };
}

function catBadge(item) {
  const cat = item.category || 'League news';
  const tip = `Category: ${cat} · basis: ${item.category_basis || 'not stated'}`;
  return `${item.breaking ? '<span class="dk-cat dk-cat--breaking" title="Material update inside the last 2 hours">Breaking</span>' : ''}<span class="dk-cat${MATERIAL.has(cat) ? ' dk-cat--material' : ''} dk-cat--${slug(cat)}" title="${esc(tip)}">${esc(cat)}</span>`;
}

function leadMarkup(item, open, anchor) {
  const url = safeUrl(item.url);
  const r = related(item, open, anchor);
  return `<article class="dk-wire-priority${item.breaking ? ' is-breaking' : ''}">
    <div class="dk-wire-priority__eyebrow"><span>Priority update</span>${catBadge(item)}</div>
    <h3 class="dk-wire-priority__title">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener nofollow">${esc(item.title)}<span class="dk-ext" aria-hidden="true">↗</span></a>` : esc(item.title)}</h3>
    <div class="dk-wire-priority__meta">
      <span>${esc(sourceText(item))}</span>
      <time datetime="${esc(item.published_at)}">${esc(rel(item.published_at))}</time>
      <span class="mono">${esc(absET(item.published_at))}</span>
    </div>
    <div class="dk-wire-priority__foot">${chips(item)}${r.button}</div>
    ${r.list}
  </article>`;
}

function rowMarkup(item, open, anchor) {
  const url = safeUrl(item.url);
  const r = related(item, open, anchor);
  return `<li class="dk-wire-row${item.breaking ? ' is-breaking' : ''}">
    <div class="dk-wire-row__when"><time datetime="${esc(item.published_at)}">${esc(rel(item.published_at))}</time><span class="mono">${esc(timeET(item.published_at))}</span></div>
    <div class="dk-wire-row__main">
      <div class="dk-wire-row__meta">${catBadge(item)}<span>${esc(sourceText(item))}</span></div>
      <a class="dk-wire-row__title" ${url ? `href="${esc(url)}" target="_blank" rel="noopener nofollow"` : ''}>${esc(item.title)}${url ? '<span class="dk-ext" aria-hidden="true">↗</span>' : ''}</a>
      <div class="dk-wire-row__foot">${chips(item)}${r.button}</div>
      ${r.list}
    </div>
  </li>`;
}

function listMarkup(items, expanded, anchor) {
  let last = null;
  const out = [];
  for (const item of items) {
    const head = dayHead(item.published_at);
    if (head !== last) { out.push(`<li class="dk-dayhead"><span class="eyebrow">${esc(head)}</span></li>`); last = head; }
    out.push(rowMarkup(item, expanded.has(item.id), anchor));
  }
  return `<ol class="dk-wire-list">${out.join('')}</ol>`;
}

function healthStrip(data, meta, failed) {
  const sources = data?.sources || [];
  const online = sources.filter(s => s.ok).length;
  const degraded = failed || sources.some(s => !s.ok);
  return `<details class="dk-wire-health"${degraded ? ' open' : ''}>
    <summary>
      <span class="dk-wire-health__state${degraded ? ' is-degraded' : ''}"><i aria-hidden="true"></i>${degraded ? 'DEGRADED' : 'LIVE'}</span>
      <b>${online}/${sources.length} sources online</b>
      <span class="dk-wire-health__fresh">${freshStamp(meta, { failed, source: 'Newsroom' })}</span>
      <span class="dk-wire-health__toggle">Source diagnostics</span>
    </summary>
    <div class="dk-wire-health__grid" aria-label="Source diagnostics">
      ${sources.map(s => `<div class="dk-wire-health__source${s.ok ? '' : ' is-down'}" title="${esc(s.url || '')}${s.error ? ` · ${esc(s.error)}` : ''}">
        <i aria-hidden="true"></i>
        <span>${esc(SOURCE_LABELS[s.key] || s.key)}</span>
        <span class="mono">${s.ok ? `${esc(s.count)} items · ${esc(s.ms)} ms` : `down · ${esc(String(s.error || 'error').slice(0, 40))}`}</span>
      </div>`).join('')}
    </div>
  </details>`;
}

// ---------------------------------------------------------------- mount
export function mount(root, params) {
  const tabKeys = TABS.map(t => t[0]);
  const state = {
    tab: tabKeys.includes(params.cat) ? params.cat : 'All',
    team: TEAM_BY_ABBREV.has(String(params.team || '').toUpperCase()) ? String(params.team).toUpperCase() : '',
    data: null, meta: null, failed: false, error: null,
    expanded: new Set()
  };

  root.innerHTML = `<section class="wrap section dk dk-news">
    <div class="section-head section-head--editorial">
      <div><span class="eyebrow">Newsroom</span><h2>What changed around the league</h2></div>
      <p>Headlines and links from NHL.com and Yahoo Sports, categorized and linked to teams and players. We never republish article text — every story opens at its source.</p>
    </div>
    <div id="dk-n-banner"></div>
    <div id="dk-n-health"></div>
    <div class="dk-n-controls">
      <div class="dk-tabs" role="tablist" aria-label="Category" id="dk-n-tabs"></div>
      <div class="dk-n-team">
        <label class="micro" for="dk-n-team">Team</label>
        <select id="dk-n-team" class="dk-select"></select>
      </div>
    </div>
    <div id="dk-n-body"></div>
  </section>`;

  const els = {
    banner: $('#dk-n-banner', root), health: $('#dk-n-health', root),
    tabs: $('#dk-n-tabs', root), team: $('#dk-n-team', root), body: $('#dk-n-body', root)
  };

  const writeUrl = () => {
    const q = new URLSearchParams();
    if (state.tab !== 'All') q.set('cat', state.tab);
    if (state.team) q.set('team', state.team);
    const s = q.toString();
    history.replaceState(null, '', `#/news${s ? `?${s}` : ''}`);
  };

  const render = () => {
    // Show at most five days of the freshest source-wire data returned. The
    // newest valid headline anchors the slice, so a short upstream publishing
    // pause cannot blank the entire wire.
    const wire = wireWindow(state.data?.items || []);
    const items = wire.items;
    const teamItems = state.team ? items.filter(i => (i.teams || []).includes(state.team)) : items;
    const counts = Object.fromEntries(tabKeys.map(k => [k, teamItems.filter(i => matchesTab(i, k)).length]));

    els.banner.innerHTML = state.data?.degraded
      ? `<div class="pbe-note dk-banner"><b>Degraded feed.</b> ${esc((state.data.sources || []).filter(s => !s.ok).map(s => SOURCE_LABELS[s.key] || s.key).join(', ') || 'A source')} did not answer; the remaining sources are shown.</div>`
      : '';
    els.health.innerHTML = state.data ? healthStrip(state.data, state.meta, state.failed) : state.error ? '' : '<div class="pbe-skeleton dk-health-skel"></div>';
    els.tabs.innerHTML = TABS.map(([k, l]) => `<button role="tab" class="chip${state.tab === k ? ' is-active' : ''}${k === 'Breaking' && counts[k] ? ' dk-chip-brk' : ''}" data-tab="${esc(k)}" aria-selected="${state.tab === k}">${esc(l)}${state.data && k !== 'PBE' ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('');

    const teamCounts = new Map();
    items.forEach(i => (i.teams || []).forEach(t => teamCounts.set(t, (teamCounts.get(t) || 0) + 1)));
    els.team.innerHTML = `<option value="">All 32 teams</option>${TEAMS.map(t => `<option value="${t.abbrev}"${state.team === t.abbrev ? ' selected' : ''}>${esc(t.abbrev)} · ${esc(t.name)}${state.data ? ` (${teamCounts.get(t.abbrev) || 0})` : ''}</option>`).join('')}`;

    if (!state.data) {
      els.body.innerHTML = state.error
        ? `<div class="pbe-error"><strong>${esc(describeError(state.error).title)}</strong>${esc(state.error.kind === 'not_deployed' || state.error.kind === 'legacy' ? 'The newsroom feed is not connected in this build. Nothing is shown rather than something invented.' : describeError(state.error).body)}</div>`
        : '<div class="dk-wire-shell"><div class="pbe-skeleton" style="height:124px;margin-bottom:10px"></div><div class="pbe-skeleton" style="height:620px"></div></div>';
      return;
    }

    if (state.tab === 'PBE') {
      els.body.innerHTML = `<div class="pbe-empty dk-empty"><span class="pbe-badge pbe-badge--model">PBE notes</span><h3>No PBE market or model notes published.</h3>
        <p>Notes appear here only when a versioned PropBetEdge model or a verified market snapshot produces them. Neither exists for the NHL yet, so nothing is written in their place.</p>
        <p style="margin-top:12px"><a class="gold" href="#/methodology">How PBE notes will be sourced →</a></p></div>`;
      return;
    }

    const filtered = teamItems.filter(i => matchesTab(i, state.tab));
    if (!filtered.length) {
      const tabLabel = TABS.find(t => t[0] === state.tab)?.[1] || state.tab;
      els.body.innerHTML = `<div class="pbe-empty dk-empty"><h3>No ${state.tab === 'All' ? '' : `${esc(tabLabel.toLowerCase())} `}headlines${state.team ? ` for ${esc(TEAM_BY_ABBREV.get(state.team)?.full || state.team)}` : ''} in the current feed window.</h3>
        <p>${state.tab === 'Breaking' ? 'Breaking marks a material update (injury, goalie, lines, trade, transaction) published inside the last two hours.' : `The wire shows at most five days of the freshest available source coverage: ${items.length} headlines across ${(state.data.sources || []).length} sources.`}</p>
        ${state.team || state.tab !== 'All' ? '<p style="margin-top:12px"><button class="pbe-btn pbe-btn--sm" data-reset>Show all headlines</button></p>' : ''}</div>`;
      return;
    }
    const lead = filtered.find(i => i.breaking) || filtered.find(i => i.material) || filtered[0];
    const rest = filtered.filter(i => i !== lead);
    const materialCount = filtered.filter(i => i.material).length;
    const breakingCount = filtered.filter(i => i.breaking).length;
    els.body.innerHTML = `<section class="dk-wire-shell">
      <div class="dk-wire-summary" aria-label="Current source-wire view">
        <span><b>${filtered.length}</b> in view</span>
        <span><b>${materialCount}</b> material</span>
        <span class="${breakingCount ? ' has-breaking' : ''}"><b>${breakingCount}</b> breaking</span>
        <span><b>${teamCounts.size}</b> teams tagged</span>
      </div>
      ${leadMarkup(lead, state.expanded.has(lead.id), wire.anchor)}
      ${rest.length ? listMarkup(rest, state.expanded, wire.anchor) : ''}
      <details class="dk-wire-method">
        <summary>How the wire is labelled</summary>
        <p>Categories come from source tags when available, otherwise deterministic headline rules. Material means injuries, goalies, lines, trades or transactions. Breaking means a material update published inside two hours. Team/player links come from source entity tags or direct headline mentions; related coverage is folded under +N sources.</p>
      </details>
    </section>`;
  };

  render();

  const poller = createPoller(async signal => {
    const res = await news({ limit: 100 }, { signal, timeout: 12000 });
    state.data = res.data; state.meta = res.meta; state.failed = false; state.error = null;
    render();
    return 120000;
  }, {
    onError(error) {
      state.error = error;
      state.failed = Boolean(state.data);
      render();
      return error.kind === 'not_deployed' || error.kind === 'legacy' ? null : 20000;
    }
  });
  poller.start();

  const disposers = [
    on(root, 'click', '[data-tab]', (_, btn) => { state.tab = btn.dataset.tab; writeUrl(); render(); }),
    on(root, 'change', '#dk-n-team', (_, sel) => { state.team = TEAM_BY_ABBREV.has(sel.value) ? sel.value : ''; writeUrl(); render(); }),
    on(root, 'click', '[data-reset]', () => { state.tab = 'All'; state.team = ''; writeUrl(); render(); }),
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
