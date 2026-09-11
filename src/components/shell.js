import { $, $$, esc, on } from '../lib/dom.js';
import { TEAMS } from '../lib/teams.js';
import { timeET, dayET } from '../lib/format.js';

export const NAV = [
  { id: 'board', href: '#/', label: 'Ice Board', short: 'Board', icon: 'board' },
  { id: 'cast', href: '#/cast', label: 'PBE Cast', short: 'Cast', icon: 'cast' },
  { id: 'props', href: '#/props', label: 'Props', short: 'Props', icon: 'props' },
  { id: 'goalies', href: '#/goalies', label: 'Goalies', short: 'Goalies', icon: 'goalie' },
  { id: 'lines', href: '#/lines', label: 'Lines', short: 'Lines', icon: 'lines' },
  { id: 'injuries', href: '#/injuries', label: 'Injuries', short: 'Injuries', icon: 'injury' },
  { id: 'news', href: '#/news', label: 'News', short: 'News', icon: 'news' },
  { id: 'shots', href: '#/shots', label: 'Shot Lab', short: 'Shot Lab', icon: 'shots' }
];
export const MORE = [
  { id: 'matchup', href: '#/matchup', label: 'Matchups' },
  { id: 'players', href: '#/players', label: 'Players' },
  { id: 'standings', href: '#/standings', label: 'Standings' },
  { id: 'track', href: '#/track-record', label: 'Track Record' },
  { id: 'methodology', href: '#/methodology', label: 'Methodology' }
];
const BOTTOM = ['board', 'cast', 'props', 'news'];

const ICONS = {
  board: '<path d="M3 5h18v14H3z M3 12h18 M12 5v14" />',
  cast: '<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4 M17.7 6.3a8 8 0 0 1 0 11.4"/>',
  props: '<path d="M4 18l5-6 4 3 7-9 M15 6h5v5"/>',
  news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z M17 9h3v8a2 2 0 0 1-2 2 M7 9h7 M7 13h7"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20a2 2 0 0 0 4 0"/>'
};
const icon = name => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

export function renderShell(app) {
  app.innerHTML = `
    <a class="skip-link" href="#main" data-skip>Skip to content</a>
    <header class="topbar" id="topbar">
      <div class="topbar__in">
        <a class="brand" href="#/" title="PropBetEdge NHL — Ice Board">
          <span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 32 32" width="34" height="34"><rect width="32" height="32" rx="7" fill="#14110d"/><rect x=".75" y=".75" width="30.5" height="30.5" rx="6.4" fill="none" stroke="#d4af37" stroke-opacity=".45" stroke-width="1"/><path fill="#e2bf4a" fill-rule="evenodd" d="M7 5 H16.5 A7 7 0 0 1 16.5 19 H11.3 V27 H7 Z M16.5 9 A3 3 0 1 0 16.51 9 Z"/><circle cx="16.5" cy="12" r="1.1" fill="#f6e39b"/></svg></span>
          <span class="brand__word">PropBet<b>Edge</b></span>
          <span class="brand__sport">NHL</span>
        </a>
        <nav class="mainnav" aria-label="Primary">
          ${NAV.map(item => `<a href="${item.href}" data-nav="${item.id}">${esc(item.label)}</a>`).join('')}
          <div class="more">
            <button class="more__btn" type="button" aria-expanded="false" aria-controls="more-menu" data-more>More <span aria-hidden="true">▾</span></button>
            <div class="more__menu" id="more-menu" role="menu" hidden>
              ${MORE.map(item => `<a role="menuitem" href="${item.href}" data-nav="${item.id}">${esc(item.label)}</a>`).join('')}
            </div>
          </div>
        </nav>
        <div class="topbar__tools">
          <span class="season-chip" id="season-chip" aria-live="polite"></span>
          <div class="alerts-wrap">
            <button class="bell-btn" type="button" data-alerts aria-expanded="false" aria-controls="alert-center" aria-label="Alerts">${icon('bell')}<span class="bell-count" id="alert-count" hidden></span></button>
            <div class="alert-center" id="alert-center" hidden>
              <div class="panel-head"><span class="eyebrow">Alerts · last 36 hours</span><button type="button" class="pbe-btn pbe-btn--ghost pbe-btn--sm" data-close-alerts>Close</button></div>
              <ul class="alert-list" id="alert-list"></ul>
            </div>
          </div>
          <button class="search-btn" type="button" data-open-search>
            ${icon('search')}<span class="search-btn__label" aria-hidden="true">Search</span><kbd aria-hidden="true">Ctrl K</kbd><span class="sr-only">Search teams, games and pages (Ctrl K)</span>
          </button>
        </div>
      </div>
    </header>
    <div class="backdrop-wrap" id="backdrop" aria-hidden="true" hidden><div class="backdrop"></div></div>
    <div id="mode-ribbon"></div>
    <main id="main" tabindex="-1"></main>
    <div class="toasts" id="toasts" aria-live="polite"></div>
    <footer class="footer">
      <div class="wrap footer__in">
        <div>
          <div class="brand brand--footer"><span class="brand__word">PropBet<b>Edge</b></span><span class="brand__sport">NHL</span></div>
          <p class="footer__copy">Hockey intelligence for bettors who want to know what changed. Research tooling, not a guarantee. 21+. If you or someone you know has a gambling problem, call 1-800-GAMBLER.</p>
        </div>
        <div class="footer__cols">
          <div><span class="micro">Data</span><p>Game, play-by-play and player data: NHL (api-web.nhle.com) via PropSports API. Every volatile panel shows its source and age.</p></div>
          <div><span class="micro">Rules</span><p><a href="#/methodology">Methodology &amp; data truth rules</a><br><a href="#/track-record">Track record</a><br><a href="https://hub.propbetedge.ai/" rel="noopener">All PropBetEdge sports ↗</a></p></div>
          <div><span class="micro">Imagery</span><p>Hero photography: Tony Schnagl / Pexels (Pexels License).</p></div>
        </div>
      </div>
    </footer>
    <nav class="bottomnav" aria-label="Primary (mobile)">
      ${NAV.filter(item => BOTTOM.includes(item.id)).map(item => `<a href="${item.href}" data-nav="${item.id}">${icon(item.icon)}<span>${esc(item.short)}</span></a>`).join('')}
      <button type="button" data-sheet aria-expanded="false" aria-controls="nav-sheet">${icon('more')}<span>More</span></button>
    </nav>
    <div class="sheet" id="nav-sheet" hidden>
      <div class="sheet__scrim" data-close-sheet></div>
      <div class="sheet__panel" role="dialog" aria-modal="true" aria-label="All sections">
        <div class="sheet__head"><span class="eyebrow">All sections</span><button type="button" class="pbe-btn pbe-btn--ghost pbe-btn--sm" data-close-sheet aria-label="Close menu">Close</button></div>
        <div class="sheet__grid">
          ${[...NAV, ...MORE].map(item => `<a href="${item.href}" data-nav="${item.id}">${esc(item.label)}</a>`).join('')}
        </div>
        <button type="button" class="pbe-btn sheet__search" data-open-search>${icon('search')} Search teams &amp; games</button>
      </div>
    </div>
    <div class="palette" id="palette" hidden>
      <div class="palette__scrim" data-close-palette></div>
      <div class="palette__panel" role="dialog" aria-modal="true" aria-label="Search">
        <label class="palette__field">${icon('search')}<span class="sr-only">Search</span>
          <input id="palette-input" type="search" autocomplete="off" spellcheck="false" placeholder="Team, matchup, page, or 10-digit game ID" aria-controls="palette-results">
          <kbd>Esc</kbd>
        </label>
        <ul class="palette__results" id="palette-results" role="listbox"></ul>
      </div>
    </div>`;
  return $('#main', app);
}

export function setActiveNav(id) {
  for (const node of $$('[data-nav]')) {
    const active = node.dataset.nav === id;
    node.classList.toggle('is-active', active);
    if (active) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  }
  const moreActive = MORE.some(item => item.id === id);
  $('[data-more]')?.classList.toggle('is-active', moreActive);
}

export function setSeasonChip(text, tone = '') {
  const chip = $('#season-chip');
  if (!chip) return;
  chip.textContent = text || '';
  chip.dataset.tone = tone;
}

export function bindShell(ctx) {
  const disposers = [];
  const moreBtn = $('[data-more]');
  const moreMenu = $('#more-menu');
  const sheet = $('#nav-sheet');
  const sheetBtn = $('[data-sheet]');
  const palette = $('#palette');
  const input = $('#palette-input');
  const results = $('#palette-results');
  let lastFocus = null;
  let active = 0;
  let items = [];

  const closeMore = () => { moreMenu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); };
  const closeSheet = () => { sheet.hidden = true; sheetBtn.setAttribute('aria-expanded', 'false'); document.documentElement.classList.remove('is-locked'); };
  const closePalette = () => {
    if (palette.hidden) return;
    palette.hidden = true;
    document.documentElement.classList.remove('is-locked');
    lastFocus?.focus?.();
  };

  function buildIndex(query) {
    const q = query.trim().toLowerCase();
    const out = [];
    if (/^\d{10}$/.test(q)) out.push({ group: 'Game', label: `Open game ${q} in PBE Cast`, href: `#/cast/${q}` });
    const games = ctx.slateGames?.() || [];
    for (const g of games) {
      const a = g.teams.away; const h = g.teams.home;
      const label = `${a.abbrev} @ ${h.abbrev}`;
      const hay = `${label} ${a.name} ${h.name} ${a.place} ${h.place}`.toLowerCase();
      if (!q || hay.includes(q)) out.push({ group: g.status.semantics === 'LIVE' ? 'Live game' : 'Game', label: `${label} · ${dayET(g.start_time_utc)} ${timeET(g.start_time_utc)}`, href: `#/cast/${g.id}` });
    }
    for (const t of TEAMS) {
      const hay = `${t.abbrev} ${t.full} ${t.division}`.toLowerCase();
      if (q && hay.includes(q)) out.push({ group: 'Team', label: `${t.full} (${t.abbrev})`, href: `#/team/${t.abbrev}` });
    }
    for (const item of [...NAV, ...MORE]) {
      if (!q || item.label.toLowerCase().includes(q)) out.push({ group: 'Page', label: item.label, href: item.href });
    }
    return out.slice(0, 40);
  }

  function renderResults() {
    items = buildIndex(input.value);
    active = Math.min(active, Math.max(0, items.length - 1));
    results.innerHTML = items.length
      ? items.map((item, i) => `<li role="option" id="pal-${i}" aria-selected="${i === active}"><a href="${esc(item.href)}" data-pal="${i}"><span class="micro">${esc(item.group)}</span><span>${esc(item.label)}</span></a></li>`).join('')
      : `<li class="palette__empty">No team, game or page matches “${esc(input.value)}”. Player search arrives with the player index.</li>`;
    input.setAttribute('aria-activedescendant', items.length ? `pal-${active}` : '');
  }

  const openPalette = () => {
    lastFocus = document.activeElement;
    closeSheet();
    palette.hidden = false;
    document.documentElement.classList.add('is-locked');
    input.value = '';
    active = 0;
    renderResults();
    input.focus();
  };

  disposers.push(on(document, 'click', '[data-more]', () => {
    const open = moreMenu.hidden;
    moreMenu.hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open));
  }));
  disposers.push(on(document, 'click', '[data-sheet]', () => {
    sheet.hidden = false;
    sheetBtn.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('is-locked');
    $('.sheet__grid a', sheet)?.focus();
  }));
  disposers.push(on(document, 'click', '[data-close-sheet]', closeSheet));
  disposers.push(on(document, 'click', '[data-open-search]', openPalette));
  disposers.push(on(document, 'click', '[data-close-palette]', closePalette));
  disposers.push(on(document, 'click', '#palette-results a, .sheet a, .more__menu a', () => { closePalette(); closeSheet(); closeMore(); }));
  disposers.push(on(document, 'click', '[data-skip]', event => { event.preventDefault(); $('#main')?.focus(); }));

  const onDocClick = event => { if (!event.target.closest('.more')) closeMore(); };
  document.addEventListener('click', onDocClick);
  disposers.push(() => document.removeEventListener('click', onDocClick));

  const onKey = event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      palette.hidden ? openPalette() : closePalette();
      return;
    }
    if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '') && palette.hidden) {
      event.preventDefault();
      openPalette();
      return;
    }
    if (event.key === 'Escape') { closePalette(); closeSheet(); closeMore(); }
    if (!palette.hidden && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length);
      renderResults();
      $(`#pal-${active}`)?.scrollIntoView({ block: 'nearest' });
    }
    if (!palette.hidden && event.key === 'Enter' && items[active]) {
      event.preventDefault();
      location.hash = items[active].href.slice(1);
      closePalette();
    }
  };
  document.addEventListener('keydown', onKey);
  disposers.push(() => document.removeEventListener('keydown', onKey));
  input.addEventListener('input', () => { active = 0; renderResults(); });

  const onHash = () => { closeSheet(); closeMore(); };
  window.addEventListener('hashchange', onHash);
  disposers.push(() => window.removeEventListener('hashchange', onHash));

  return () => disposers.forEach(d => d());
}
