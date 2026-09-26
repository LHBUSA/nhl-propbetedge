import { $, $$, esc, on } from '../lib/dom.js';
import { TEAMS } from '../lib/teams.js';
import { timeET, dayET } from '../lib/format.js';
import { PBE_NETWORK } from '../lib/network.js';
import { onAccount, refreshAccount, signInAvailable } from '../lib/account.js';
import { isMember, proButtonHtml, proButtonLabel } from '../lib/pro-membership-ui.js';
import { ALL_ACCESS_URL } from '../lib/pbe-membership.js';

// Keep the desktop header focused on the five highest-value product surfaces,
// with PBE Picks — the flagship — directly after the Ice Board and WinHL (the
// PropBetEdge skater metric) as the fifth. Everything else lives one click away
// in More, grouped into the four product sections below. Mobile carries Board,
// PBE Picks, Cast and Props in its persistent bottom navigation; the sheet
// carries every section, grouped the same way.
//
// `collapse` names the width below which a header item yields its slot and
// shows in its own section of the More panel instead (never both at once):
// WinHL below 1280px ('lg'), Props below 1024px ('md'). Breakpoints: shell.css.
export const NAV = [
  { id: 'board', href: '#/', label: 'Ice Board', short: 'Board', icon: 'board', group: 'live' },
  { id: 'picks', href: '#/pbe-picks', label: 'PBE Picks', short: 'PBE Picks', icon: 'picks', pro: true, group: 'prediction' },
  { id: 'cast', href: '#/cast', label: 'PBE Cast', short: 'Cast', icon: 'cast', group: 'live' },
  { id: 'props', href: '#/props', label: 'Props', short: 'Props', icon: 'props', group: 'prediction', collapse: 'md' },
  { id: 'winhl', href: '#/winhl', label: 'WinHL', short: 'WinHL', group: 'intelligence', collapse: 'lg' }
];
export const MORE = [
  { id: 'standings', href: '#/standings', label: 'Standings', group: 'live' },
  { id: 'news', href: '#/news', label: 'News', short: 'News', icon: 'news', group: 'live' },
  { id: 'shots', href: '#/shots', label: 'Shot Lab', short: 'Shot Lab', icon: 'shots', group: 'prediction' },
  { id: 'matchup', href: '#/matchup', label: 'Matchups', group: 'prediction' },
  { id: 'goalies', href: '#/goalies', label: 'Goalies', group: 'intelligence' },
  { id: 'fatigue', href: '#/fatigue', label: 'Fatigue', group: 'intelligence' },
  { id: 'fights', href: '#/fights', label: 'Fights', group: 'intelligence' },
  { id: 'lines', href: '#/lines', label: 'Lines', group: 'intelligence' },
  { id: 'injuries', href: '#/injuries', label: 'Injuries', group: 'intelligence' },
  { id: 'players', href: '#/players', label: 'Players', group: 'research' },
  { id: 'teams', href: '#/teams', label: 'Teams', group: 'research' },
  { id: 'track', href: '#/track-record', label: 'Track Record', group: 'research' },
  { id: 'methodology', href: '#/methodology', label: 'Methodology', group: 'research' }
];
// The four product sections (owner IA, 2026-09-25). Order within a section is
// the order the items are declared above.
export const NAV_GROUPS = [
  { id: 'live', label: 'Live' },
  { id: 'prediction', label: 'Prediction' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'research', label: 'Research' }
];
// The desktop More panel lays the four sections out as three balanced columns
// (Live and Prediction share one), so the tallest column is six rows and the
// panel never needs an inner scrollbar.
const MORE_COLUMNS = [['live', 'prediction'], ['intelligence'], ['research']];
const ALL_NAV = [...NAV, ...MORE];
const BOTTOM = ['board', 'picks', 'cast', 'props'];
// PropBetEdge All Access is the network's primary offer: a first-class gold
// link to the network page in the desktop header, a bottom tab on phones (a
// prominent first row of the More sheet below 360px, where a sixth tab would
// clip the flagship label) and two footer links. It is a link to the network
// page, never a checkout, so it renders for every membership state. It is
// deliberately NOT part of NAV/ALL_NAV: those are hash routes the palette
// and router own, and this destination is external.
export const ALL_ACCESS_NAV = Object.freeze({ id: 'all-access', href: ALL_ACCESS_URL, label: 'All Access', short: 'All Access' });

const ICONS = {
  board: '<path d="M3 5h18v14H3z M3 12h18 M12 5v14" />',
  picks: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2.2v2.6 M12 19.2v2.6 M2.2 12h2.6 M19.2 12h2.6"/>',
  cast: '<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4 M17.7 6.3a8 8 0 0 1 0 11.4"/>',
  props: '<path d="M4 18l5-6 4 3 7-9 M15 6h5v5"/>',
  news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z M17 9h3v8a2 2 0 0 1-2 2 M7 9h7 M7 13h7"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  star: '<path d="M12 3.4l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.7l6-.8z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20a2 2 0 0 0 4 0"/>'
};
const icon = name => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

// One section of the More panel: its More items, preceded by any header item
// of the same section that has collapsed out of the header at this width
// (shell.css shows those rows only below their breakpoint).
function moreSection(groupId) {
  const group = NAV_GROUPS.find(g => g.id === groupId);
  const collapsed = NAV.filter(item => item.collapse && item.group === groupId);
  const items = MORE.filter(item => item.group === groupId);
  if (!group || !(items.length + collapsed.length)) return '';
  const row = (item, extra = '') => `<a role="menuitem" tabindex="-1" href="${item.href}" data-nav="${item.id}"${extra}><span>${esc(item.label)}</span><i class="more__arrow" aria-hidden="true">→</i></a>`;
  return `<div class="more__section" role="group" aria-labelledby="more-g-${group.id}"><span class="more__group" id="more-g-${group.id}">${esc(group.label)}</span>${collapsed.map(item => row(item, ` data-collapsed-from="${item.collapse}"`)).join('')}${items.map(item => row(item)).join('')}</div>`;
}

export function renderShell(app) {
  app.innerHTML = `
    <a class="skip-link" href="#main" data-skip>Skip to content</a>
    <div class="atmos" aria-hidden="true"><i class="atmos__grain"></i></div>
    <div class="backdrop-floor" id="backdrop-floor" aria-hidden="true"></div>
    <header class="topbar" id="topbar">
      <div class="topbar__in">
        <a class="brand" href="#/" title="PropBetEdge NHL — Ice Board">
          <span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 512 512" width="34" height="34"><rect width="512" height="512" rx="104" fill="#14110d"/><rect x="12" y="12" width="488" height="488" rx="94" fill="none" stroke="#d4af37" stroke-opacity=".45" stroke-width="16"/><g transform="translate(260 256) scale(0.86) skewX(-7) translate(-256 -256)"><path fill="#e8c452" fill-rule="evenodd" d="M214 82 Q214 72 224 72 H330 A122 122 0 0 1 330 316 H318 V352 A88 88 0 0 1 230 440 H92 Q52 440 52 406 Q52 372 92 368 L190 364 Q214 362 214 336 Z M318 142 H328 A52 52 0 0 1 328 246 H318 Z"/></g></svg></span>
          <span class="brand__word">PropBet<b>Edge</b></span>
          <span class="brand__sport">NHL</span>
        </a>
        <nav class="mainnav" aria-label="Primary">
          ${NAV.map(item => `<a href="${item.href}" data-nav="${item.id}"${item.pro ? ' data-pro="1"' : ''}${item.collapse ? ` data-collapse="${item.collapse}"` : ''}>${esc(item.label)}</a>`).join('')}
          <div class="more">
            <button class="more__btn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="more-menu" data-more>More <svg class="more__caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <div class="more__menu" id="more-menu" hidden>
              <div class="more__head">
                <span class="more__title">All NHL sections</span>
                <span class="season-chip" id="season-chip" data-tone="" hidden><i class="season-chip__dot" aria-hidden="true"></i><span class="season-chip__text" id="season-chip-text" aria-live="polite"></span></span>
              </div>
              <div class="more__cols" role="menu" aria-label="All NHL sections">
                ${MORE_COLUMNS.map(col => `<div class="more__col">${col.map(moreSection).join('')}</div>`).join('')}
              </div>
              <div class="more__foot">
                <button type="button" class="more__search" data-open-search>${icon('search')}<span>Search teams, games and pages</span><kbd aria-hidden="true">Ctrl K</kbd></button>
              </div>
            </div>
          </div>
        </nav>
        <div class="topbar__tools">
          <!-- NHL Pro is ALWAYS present: the premium product does not vanish
               because one auth dependency is down. What it OPENS adapts -
               explainer, sign-in, or the member panel (see bindProButton). -->
          <a class="topbar__aa" id="nhl-all-access-link" href="${ALL_ACCESS_NAV.href}" rel="noopener" data-all-access="header" aria-label="PropBetEdge All Access: every Pro sport"><i aria-hidden="true">★</i>ALL ACCESS</a>
          <button class="pbepro__open" type="button" id="nhl-pro-btn" data-open-nhl-pro data-account="unknown" aria-label="See what NHL Pro includes"><span>NHL</span> PRO</button>
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
          <div><span class="micro">Data</span><p>Game, play-by-play and player data: <a class="gold link-u" href="https://propsports.proptechusa.ai" target="_blank" rel="noopener">PropSports</a>. Every volatile panel shows its source and age.</p></div>
          <div><span class="micro">PropBetEdge</span><p><a class="footer__aa" href="${ALL_ACCESS_NAV.href}" rel="noopener" data-pbe-footer-all-access>ALL ACCESS</a><br><a class="footer__aa" href="${ALL_ACCESS_NAV.href}" rel="noopener" data-pbe-footer-all-access-included>WHAT'S INCLUDED</a><br><a href="${PBE_NETWORK.news}">Sports News</a><br><a href="${PBE_NETWORK.store}">Store</a><br><a href="https://billing.stripe.com/p/login/cNi3cv2vY7em3lr4oj7wA00" target="_blank" rel="noopener noreferrer">Manage billing ↗</a><br><a href="mailto:sales@proptechusa.ai">Contact us</a><br><a href="${PBE_NETWORK.discord}" target="_blank" rel="noopener">Discord ↗</a><br><a class="pbe-x-link" href="${PBE_NETWORK.x}" target="_blank" rel="noopener noreferrer" aria-label="Follow PropBetEdge on X (${PBE_NETWORK.xHandle})" title="Follow PropBetEdge on X"><span aria-hidden="true">𝕏</span> ${PBE_NETWORK.xHandle}</a><br>${PBE_NETWORK.sports.map(s => `<a href="${s.href}">${s.label}</a>`).join(' · ')}</p></div>
          <div><span class="micro">Rules</span><p><a href="#/methodology">Methodology &amp; data truth rules</a><br><a href="#/track-record">Track record</a></p></div>
          <div><span class="micro">Imagery</span><p>Photography via Pexels; player portraits via Wikimedia Commons, each credited. <a href="#/methodology?section=credits">Image credits</a></p></div>
        </div>
      </div>
    </footer>
    <nav class="bottomnav" aria-label="Primary (mobile)">
      ${ALL_NAV.filter(item => BOTTOM.includes(item.id)).map(item => `<a href="${item.href}" data-nav="${item.id}"${item.pro ? ' data-pro="1"' : ''}>${icon(item.icon)}<span>${esc(item.short)}</span></a>`).join('')}
      <a class="bottomnav__aa" id="nhl-bottom-all-access" href="${ALL_ACCESS_NAV.href}" rel="noopener" data-all-access="bottom">${icon('star')}<span>${esc(ALL_ACCESS_NAV.short)}</span></a>
      <button type="button" data-sheet aria-expanded="false" aria-controls="nav-sheet">${icon('more')}<span>More</span></button>
    </nav>
    <div class="sheet" id="nav-sheet" hidden>
      <div class="sheet__scrim" data-close-sheet></div>
      <div class="sheet__panel" role="dialog" aria-modal="true" aria-label="All sections">
        <div class="sheet__head"><span class="eyebrow">All sections</span><span class="sheet__season micro" id="sheet-season" hidden></span><button type="button" class="pbe-btn pbe-btn--ghost pbe-btn--sm" data-close-sheet aria-label="Close menu">Close</button></div>
        <a class="sheet__aa" id="nhl-sheet-all-access" href="${ALL_ACCESS_NAV.href}" rel="noopener" data-all-access="sheet">${icon('star')}<span class="sheet__aa-title">ALL ACCESS</span><span class="sheet__aa-copy">Every PropBetEdge Pro sport, one membership</span><span class="sheet__aa-arrow" aria-hidden="true">↗</span></a>
        <div class="sheet__grid">
          ${NAV_GROUPS.map(g => `<span class="sheet__group">${esc(g.label)}</span>${ALL_NAV.filter(item => item.group === g.id).map(item => `<a href="${item.href}" data-nav="${item.id}"${item.pro ? ' data-pro="1"' : ''}>${esc(item.label)}</a>`).join('')}`).join('')}
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
  const moreBtn = $('[data-more]');
  moreBtn?.classList.toggle('is-active', MORE.some(item => item.id === id));
  // A header item that has collapsed into More (NAV.collapse) lights the More
  // button instead; shell.css decides by width which of the two shows it.
  if (moreBtn) moreBtn.dataset.current = NAV.find(item => item.id === id && item.collapse)?.collapse || '';
}

// Season state is product chrome, not a debug badge: it stays on one quiet
// line, never borrows the gold the navigation uses for "you are here", and is
// mirrored into the mobile sheet where the topbar has no room for it.
export function setSeasonChip(text, tone = '') {
  const chip = $('#season-chip');
  const label = $('#season-chip-text');
  if (!chip || !label) return;
  label.textContent = text || '';
  chip.dataset.tone = tone;
  chip.hidden = !text;
  chip.setAttribute('title', text ? `NHL season state — ${text}` : '');
  const sheet = $('#sheet-season');
  if (sheet) {
    sheet.textContent = text || '';
    sheet.dataset.tone = tone;
    sheet.hidden = !text;
  }
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

  // Rows for header items still in the header are display:none, so the
  // keyboard walks only what is on screen.
  const moreItems = () => $$('a[role="menuitem"]', moreMenu).filter(a => a.offsetParent !== null);
  // The panel is centred under the More button, then nudged so it never leaves
  // the viewport (the button moves as the header collapses).
  const placeMore = () => {
    moreMenu.style.setProperty('--more-shift', '0px');
    const r = moreMenu.getBoundingClientRect();
    const edge = 12;
    const room = document.documentElement.clientWidth - edge;
    const shift = r.left < edge ? edge - r.left : r.right > room ? room - r.right : 0;
    moreMenu.style.setProperty('--more-shift', `${Math.round(shift)}px`);
  };
  const openMore = ({ focus = 'first' } = {}) => {
    moreMenu.hidden = false;
    moreBtn.setAttribute('aria-expanded', 'true');
    placeMore();
    const items = moreItems();
    (focus === 'last' ? items[items.length - 1] : items[0])?.focus();
  };
  const closeMore = ({ restoreFocus = false } = {}) => {
    if (moreMenu.hidden) return;
    moreMenu.hidden = true;
    moreBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) moreBtn.focus();
  };
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
    for (const item of ALL_NAV) {
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
    // Opened from the More panel's search row: close the panel and hand focus
    // back to the More button when the palette closes.
    if (!moreMenu.hidden) { closeMore(); lastFocus = moreBtn; } else lastFocus = document.activeElement;
    closeSheet();
    palette.hidden = false;
    document.documentElement.classList.add('is-locked');
    input.value = '';
    active = 0;
    renderResults();
    input.focus();
  };

  disposers.push(on(document, 'click', '[data-more]', () => {
    if (moreMenu.hidden) openMore(); else closeMore();
  }));
  // Menu pattern: the items are not in the tab order; the button opens the menu
  // and the arrows walk it. Tab or Escape leaves, Escape returns focus.
  const onMoreKey = event => {
    const items = moreItems();
    if (!items.length) return;
    if (event.key === 'Tab') { closeMore(); return; }
    const i = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[i < 0 ? 0 : next].focus();
    } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && i >= 0) {
      // Columns: move to the nearest row of the neighbouring column.
      event.preventDefault();
      const cols = $$('.more__col', moreMenu).map(col => items.filter(a => col.contains(a))).filter(col => col.length);
      const c = cols.findIndex(col => col.includes(items[i]));
      const target = cols[(c + (event.key === 'ArrowRight' ? 1 : -1) + cols.length) % cols.length];
      const y = items[i].getBoundingClientRect().top;
      const dist = a => Math.abs(a.getBoundingClientRect().top - y);
      target.reduce((best, a) => (dist(a) < dist(best) ? a : best)).focus();
    } else if (event.key === 'Home') { event.preventDefault(); items[0].focus(); }
    else if (event.key === 'End') { event.preventDefault(); items[items.length - 1].focus(); }
  };
  moreMenu.addEventListener('keydown', onMoreKey);
  disposers.push(() => moreMenu.removeEventListener('keydown', onMoreKey));
  const onMoreBtnKey = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMore({ focus: event.key === 'ArrowUp' ? 'last' : 'first' }); }
  };
  moreBtn.addEventListener('keydown', onMoreBtnKey);
  disposers.push(() => moreBtn.removeEventListener('keydown', onMoreBtnKey));
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
    if (event.key === 'Escape') {
      if (!moreMenu.hidden) { closeMore({ restoreFocus: true }); return; }
      closePalette();
      closeSheet();
    }
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

  const onResize = () => { if (!moreMenu.hidden) placeMore(); };
  window.addEventListener('resize', onResize);
  disposers.push(() => window.removeEventListener('resize', onResize));

  const onHash = () => { closeSheet(); closeMore(); };
  window.addEventListener('hashchange', onHash);
  disposers.push(() => window.removeEventListener('hashchange', onHash));

  disposers.push(bindProButton());

  return () => disposers.forEach(d => d());
}

// NHL Pro: exactly one real action per account state, and nothing at all when
// this environment cannot sign anyone in.
//
//   auth not configured -> the button never appears (a dead control is worse
//                          than no control);
//   signed out          -> opens the sign-in / NHL Pro pricing surface;
//   pro                 -> opens the same surface on the account panel, which
//                          carries the live membership state. The control
//                          itself shows the shared membership badge (NHL PRO
//                          ACTIVE / ALL ACCESS ACTIVE / OWNER).
//
// Unresolved and free sessions paint the identical neutral "NHL PRO" markup,
// so nothing flickers while the gateway answers.
//
// Account state comes only from lib/account.js, which asks the gateway. Chrome
// never calls a /pro/* route and never infers access from the browser.
export function bindProButton({ timeoutMs = 6000 } = {}) {
  const button = $('#nhl-pro-btn');
  let stop = null;
  let disposed = false;
  if (!button) return () => {};

  let authReady = false;
  const paint = account => {
    const state = account?.state || 'unknown';
    button.dataset.account = state;
    const pro = isMember(account);
    button.classList.toggle('is-pro', pro);
    const html = proButtonHtml(account);
    if (button.innerHTML !== html) button.innerHTML = html;
    button.setAttribute('aria-label', proButtonLabel(account, authReady));
  };
  paint(null);

  (async () => {
    // The premium product does not disappear because one dependency is down.
    // The control is always present; what it OPENS adapts. It still waits for
    // the surface to exist, so it can never be a button that opens nothing.
    const deadline = Date.now() + timeoutMs;
    while (!document.getElementById('nhl-pro-modal') && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 60));
      if (disposed) return;
    }
    if (disposed || !document.getElementById('nhl-pro-modal')) return;
    authReady = await signInAvailable().catch(() => false);
    if (disposed) return;
    stop = onAccount(paint);
    // Only ask the gateway who is signed in when sign-in exists at all.
    if (authReady) refreshAccount();
  })();

  return () => { disposed = true; stop?.(); };
}
