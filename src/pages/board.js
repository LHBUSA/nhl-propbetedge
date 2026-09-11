import { $, esc, on } from '../lib/dom.js';
import { describeError, news, odds } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { addDays, countdownParts, dateLabel, dayET, daysUntil, gameTypeLabel, timeET, todayET, ageText } from '../lib/format.js';
import { createPoller } from '../lib/poll.js';
import { gameCard, stateOf, teamMark } from '../components/game.js';
import { modePanel, seasonMode } from '../components/mode.js';
import { playerIdentity } from '../components/player.js';
import { dataLayer, oddsConfigured } from '../lib/api.js';

const HERO = '/assets/nhl/';
const heroPicture = () => `
  <picture class="hero__media">
    <source type="image/avif" media="(max-width: 600px)" srcset="${HERO}hero-ice-m-600.avif 600w, ${HERO}hero-ice-m-900.avif 900w" sizes="100vw">
    <source type="image/webp" media="(max-width: 600px)" srcset="${HERO}hero-ice-m-600.webp 600w, ${HERO}hero-ice-m-900.webp 900w" sizes="100vw">
    <source type="image/avif" srcset="${HERO}hero-ice-960.avif 960w, ${HERO}hero-ice-1440.avif 1440w, ${HERO}hero-ice-1920.avif 1920w, ${HERO}hero-ice-2560.avif 2560w" sizes="100vw">
    <source type="image/webp" srcset="${HERO}hero-ice-960.webp 960w, ${HERO}hero-ice-1440.webp 1440w, ${HERO}hero-ice-1920.webp 1920w, ${HERO}hero-ice-2560.webp 2560w" sizes="100vw">
    <img src="${HERO}hero-ice-1440.webp" alt="" width="1440" height="810" fetchpriority="high" decoding="async">
  </picture>`;

const FILTERS = [['ALL', 'All'], ['LIVE', 'Live'], ['UPCOMING', 'Upcoming'], ['FINAL', 'Final']];
const matchesFilter = (game, f) => {
  const key = stateOf(game).key;
  if (f === 'ALL') return true;
  if (f === 'LIVE') return key === 'LIVE' || key === 'INTERMISSION';
  if (f === 'UPCOMING') return key === 'SCHEDULED' || key === 'PREGAME';
  if (f === 'FINAL') return key === 'FINAL';
  return true;
};

function phaseLine(board) {
  const cal = board.calendar || {};
  const today = board.date;
  switch (board.season_phase) {
    case 'OFFSEASON': {
      const d = daysUntil(cal.preseason_start, today);
      return d > 0 ? `2026–27 NHL · Preseason opens ${dateLabel(cal.preseason_start)} · ${d} day${d === 1 ? '' : 's'}` : '2026–27 NHL';
    }
    case 'PRESEASON': {
      const d = daysUntil(cal.regular_season_start, today);
      return `2026–27 NHL · Preseason · Opening night ${dateLabel(cal.regular_season_start)}${d > 0 ? ` · ${d}d` : ''}`;
    }
    case 'REGULAR_SEASON': return `2026–27 NHL · Regular season · ${dateLabel(today, { long: true })}`;
    case 'PLAYOFFS': return '2026–27 NHL · Stanley Cup Playoffs';
    default: return '2026–27 NHL';
  }
}

function countdownMarkup(iso) {
  const c = countdownParts(iso);
  if (!c) return '';
  if (c.done) return '<div class="cd cd--done"><b>PUCK DROPPED</b></div>';
  const cell = (v, l) => `<div><b class="mono">${String(v).padStart(2, '0')}</b><span>${l}</span></div>`;
  return `<div class="cd" aria-label="Countdown to next puck drop">${cell(c.days, 'Days')}${cell(c.hours, 'Hrs')}${cell(c.mins, 'Min')}${cell(c.secs, 'Sec')}</div>`;
}

function heroPanel(board, meta, failed) {
  const next = board.next_puck_drop;
  const live = (board.counts?.LIVE || 0);
  const todayCount = board.counts?.total || 0;
  const cal = board.calendar || {};
  return `<div class="hero__panel" data-fresh-scope>
    <div class="panel-head"><span class="eyebrow">${live ? 'Live now' : 'Next puck drop'}</span>${freshStamp(meta, { failed })}</div>
    ${live ? `<div class="hero__live"><span class="pbe-badge pbe-badge--live">${live} live</span><a class="gold" href="#/cast">Open PBE Cast →</a></div>` : ''}
    ${next ? `
      <div class="hero__next">
        <div class="hero__next-when"><b>${esc(dayET(next.start_time_utc))}</b><span class="mono">${esc(timeET(next.start_time_utc))}</span><span class="micro">${esc(gameTypeLabel(next.game_type))}</span></div>
        <div data-countdown="${esc(next.start_time_utc)}">${countdownMarkup(next.start_time_utc)}</div>
        <ul class="hero__matchups">
          ${next.games_at_start.slice(0, 3).map(g => `<li><a href="#/cast/${esc(g.id)}">${teamMark(g.teams.away, 22)}<b>${esc(g.teams.away.abbrev)}</b><span class="faint">@</span>${teamMark(g.teams.home, 22)}<b>${esc(g.teams.home.abbrev)}</b><span class="faint truncate">${esc(g.venue || '')}</span></a></li>`).join('')}
        </ul>
        ${next.games_that_day > next.games_at_start.length ? `<p class="micro">${next.games_that_day} games that day</p>` : ''}
      </div>` : '<p class="dim">No future puck drop is listed in the source schedule window.</p>'}
    <dl class="hero__facts">
      <div><dt>Today</dt><dd>${esc(dateLabel(board.date))} · ${todayCount} game${todayCount === 1 ? '' : 's'}</dd></div>
      <div><dt>Preseason</dt><dd>${esc(dateLabel(cal.preseason_start) || '—')}</dd></div>
      <div><dt>Opening night</dt><dd>${esc(dateLabel(cal.regular_season_start) || '—')}</dd></div>
      <div><dt>League</dt><dd>32 teams · 84 games</dd></div>
    </dl>
  </div>`;
}

// "What changed today": material updates only. Sources, in order: newsroom
// items tagged as material, then real board state changes. Nothing invented.
function changesMarkup(board, newsState) {
  const items = [];
  for (const g of board?.games || []) {
    const st = stateOf(g);
    const m = `${g.teams.away.abbrev} @ ${g.teams.home.abbrev}`;
    if (['POSTPONED', 'SUSPENDED', 'CANCELLED'].includes(st.key)) items.push({ tag: st.key, tone: 'alert', text: `${m} ${st.key.toLowerCase()}`, href: `#/cast/${g.id}`, src: 'NHL schedule' });
    if (st.key === 'LIVE' || st.key === 'INTERMISSION') items.push({ tag: 'LIVE', tone: 'live', text: `${m} · ${g.teams.away.score}–${g.teams.home.score} · ${st.text.replace('LIVE · ', '')}`, href: `#/cast/${g.id}`, src: 'NHL' });
    if (st.key === 'FINAL') items.push({ tag: st.text, tone: 'final', text: `${g.teams.away.abbrev} ${g.teams.away.score}, ${g.teams.home.abbrev} ${g.teams.home.score}`, href: `#/cast/${g.id}`, src: 'NHL' });
  }
  const newsItems = newsState?.items || [];
  for (const item of newsItems.slice(0, 12)) {
    items.push({ tag: item.breaking ? 'BREAKING' : (item.category || 'NEWS'), tone: item.material ? 'alert' : 'news', text: item.title, href: item.url, external: true, src: item.source, at: item.published_at, more: item.related_count || 0, pl: item.players?.[0] || null, team: item.teams?.length === 1 ? item.teams[0] : null });
  }
  const newsLine = newsState?.error
    ? `<span class="micro">Newsroom: ${esc(newsState.error)}</span>`
    : newsState?.meta ? freshStamp(newsState.meta, { source: 'Newsroom' }) : '';
  if (!items.length) {
    if (newsState?.error) {
      return `<div class="changes__empty"><b>Material updates unavailable here.</b> <span class="dim">The newsroom feed is not connected in this environment, so changes cannot be listed — which is not the same as nothing changing.</span> ${newsLine}</div>`;
    }
    if (!newsState) return '<div class="pbe-skeleton" style="height:44px"></div>';
    return `<div class="changes__empty"><b>No material changes in the last 24 hours.</b> <span class="dim">Injury, goalie, line and transaction reports appear here as sources publish them.</span> ${newsLine}</div>`;
  }
  return `<ol class="changes__list">${items.slice(0, 6).map(it => `<li class="change change--${it.tone}${it.pl || it.team ? ' has-id' : ''}">
      ${it.pl ? playerIdentity({ id: it.pl.id, name: it.pl.name, team: it.team, size: 'md' }) : it.team ? teamMark({ abbrev: it.team }, 40) : ''}
      <span class="pbe-badge pbe-badge--${it.tone === 'news' ? 'sched' : it.tone}">${esc(it.tag)}</span>
      <a href="${esc(it.href)}" ${it.external ? 'target="_blank" rel="noopener nofollow"' : ''}>${esc(it.text)}</a>
      <span class="micro">${esc(it.src || '')}${it.more ? ` +${it.more} more` : ''}${it.at ? ` · ${esc(ageText((Date.now() - Date.parse(it.at)) / 1000))}` : ''}</span>
    </li>`).join('')}</ol><div class="changes__foot">${newsLine}${items.length > 6 ? ` <a class="micro gold" href="#/news">All ${items.length} updates →</a>` : ''}</div>`;
}

function boardSection(state) {
  const { board, meta, failed, error, date, filter } = state;
  const isToday = date === todayET();
  const games = board?.games || [];
  const counts = { ALL: games.length, LIVE: 0, UPCOMING: 0, FINAL: 0 };
  games.forEach(g => FILTERS.slice(1).forEach(([k]) => { if (matchesFilter(g, k)) counts[k] += 1; }));
  const visible = games.filter(g => matchesFilter(g, filter));
  const next = board?.next_puck_drop;
  let body;
  if (!board && error) {
    const e = describeError(error);
    body = `<div class="pbe-error"><strong>${esc(e.title)}</strong>${esc(e.body)}</div>`;
  } else if (!board) {
    body = `<div class="board-grid">${'<div class="gcard pbe-skeleton" style="height:236px"></div>'.repeat(6)}</div>`;
  } else if (!games.length) {
    body = `<div class="pbe-empty"><h3>No NHL games on ${esc(dateLabel(date, { long: true }))}.</h3>
      <p>${next ? `Next puck drop: <b>${esc(dayET(next.start_time_utc, true))} · ${esc(timeET(next.start_time_utc))}</b> — ${next.games_that_day} game${next.games_that_day === 1 ? '' : 's'} (${esc(gameTypeLabel(next.game_type).toLowerCase())}).` : 'The source schedule lists no upcoming game in its current window.'}</p>
      ${next ? `<p style="margin-top:14px"><button class="pbe-btn pbe-btn--primary" data-goto="${esc(next.date)}">View the ${esc(dateLabel(next.date))} slate</button></p>` : ''}</div>`;
  } else if (!visible.length) {
    body = `<div class="pbe-empty"><h3>Nothing ${filter.toLowerCase()} right now.</h3><p>${counts.ALL} game${counts.ALL === 1 ? '' : 's'} on this date. <button class="pbe-btn pbe-btn--sm" data-filter="ALL">Show all</button></p></div>`;
  } else {
    body = `<div class="board-grid">${visible.map(g => gameCard(g, { market: state.market?.byGame.get(String(g.id)) || null, marketMeta: state.market?.meta })).join('')}</div>`;
  }
  return `<div class="section-head">
      <div><span class="eyebrow">Ice Board${isToday ? ' · Today' : ''}</span><h2>${esc(dateLabel(date, { long: true }))}</h2></div>
      <div class="board-tools">
        <div class="datenav" role="group" aria-label="Choose date">
          <button class="pbe-btn pbe-btn--sm" data-shift="-1" aria-label="Previous day">‹</button>
          <button class="pbe-btn pbe-btn--sm${isToday ? ' is-current' : ''}" data-goto="${todayET()}">Today</button>
          <button class="pbe-btn pbe-btn--sm" data-shift="1" aria-label="Next day">›</button>
          <label class="sr-only" for="board-date">Date</label>
          <input id="board-date" class="datenav__input" type="date" value="${esc(date)}">
        </div>
      </div>
    </div>
    <div class="board-bar">
      <div class="chips" role="group" aria-label="Filter games">${FILTERS.map(([k, l]) => `<button class="chip" data-filter="${k}" aria-pressed="${filter === k}">${l}<span class="count">${counts[k]}</span></button>`).join('')}</div>
      ${board ? freshStamp(meta, { failed }) : ''}
    </div>
    ${state.env && modePanel(seasonMode(state.today || board), state.env) ? `<div id="mode-panel">${modePanel(seasonMode(state.today || board), state.env)}</div>` : ''}
    ${board?.compat ? `<div class="pbe-note page-note"><b>Limited data layer.</b> This environment's PropSports API does not serve the NHL intelligence routes yet, so the board shows the official schedule from the legacy route only — no live clock, shots, goalies or newsroom here. Nothing is filled in.</div>` : ''}
    <div class="coverage" aria-label="Data coverage"${seasonMode(state.today || board).key.startsWith('PRESEASON') ? ' hidden' : ''}>
      <span><i class="ok"></i>Schedule${board?.compat ? '' : ' &amp; scores'} · NHL</span>
      <span><i class="${board?.compat ? 'off' : 'ok'}"></i>Play-by-play &amp; shot coordinates${board?.compat ? ' · not in this environment' : ' · NHL'}</span>
      <span><i class="${board?.compat ? 'off' : 'part'}"></i>Starting goalies · ${board?.compat ? 'not in this environment' : 'confirmed at puck drop'}</span>
      ${state.market?.meta ? `<span><i class="ok"></i>Odds · scheduled snapshot · ${esc(state.market.count)} games</span><span><i class="${state.market.props ? 'ok' : 'off'}"></i>Player props · ${state.market.props ? 'posted' : 'not posted yet'}</span>` : '<span><i class="off"></i>Odds &amp; props · not in this environment</span>'}
      <span><i class="off"></i>Injuries &amp; lines · see source matrix</span>
    </div>
    ${body}`;
}

export function mount(root, params, ctx) {
  const state = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : todayET(),
    filter: 'ALL',
    board: null, meta: null, failed: false, error: null,
    today: null, todayMeta: null, todayFailed: false,
    news: null,
    env: null
  };
  Promise.all([dataLayer(), oddsConfigured()]).then(([layer, odds]) => {
    state.env = { dataLayer: layer, odds };
    renderBoard();
    if (params.mode) $('#mode-panel', root)?.scrollIntoView({ block: 'start' });
  });
  root.innerHTML = `
    <section class="hero" aria-labelledby="hero-title">
      ${heroPicture()}
      <div class="hero__scrim" aria-hidden="true"></div>
      <div class="hero__in wrap">
        <div class="hero__copy">
          <span class="eyebrow hero__eyebrow" id="hero-phase">2026–27 NHL</span>
          <h1 class="pbe-display hero__title" id="hero-title">Read the ice<br>before the market does.</h1>
          <p class="hero__deck">Who is starting, who is out, what moved, and where the pressure is really coming from — every number sourced and time-stamped.</p>
          <div class="hero__cta">
            <a class="pbe-btn pbe-btn--primary" href="#ice-board" data-jump>Open the Ice Board</a>
            <a class="pbe-btn" href="#/cast">PBE Cast</a>
            <a class="pbe-btn pbe-btn--ghost" href="#/methodology">How we source</a>
          </div>
        </div>
        <div id="hero-panel" class="hero__panel-slot"><div class="hero__panel pbe-skeleton hero__panel--loading"></div></div>
      </div>
      <div class="wrap changes" aria-labelledby="changes-title">
        <div class="changes__head"><span class="eyebrow" id="changes-title">What changed · last 24 hours</span><a class="micro changes__all" href="#/news">Newsroom →</a></div>
        <div id="changes"><div class="pbe-skeleton" style="height:44px"></div></div>
      </div>
    </section>
    <section class="wrap section board" id="ice-board" aria-label="Ice Board" data-fresh-scope></section>`;

  const boardEl = $('#ice-board', root);
  const renderBoard = () => { boardEl.innerHTML = boardSection(state); };
  const renderHero = () => {
    if (!state.today) return;
    $('#hero-phase', root).textContent = phaseLine(state.today);
    $('#hero-panel', root).innerHTML = heroPanel(state.today, state.todayMeta, state.todayFailed);
    $('#changes', root).innerHTML = changesMarkup(state.today, state.news);
  };
  renderBoard();

  // Today (hero + changes rail) and the selected board date poll separately;
  // when they are the same date one request serves both.
  const poller = createPoller(async signal => {
    const todayRes = await ctx.board(todayET(), { signal, maxAgeMs: 8000 });
    state.today = todayRes.data; state.todayMeta = todayRes.meta; state.todayFailed = false;
    if (state.date === todayET()) {
      state.board = todayRes.data; state.meta = todayRes.meta; state.failed = false; state.error = null;
    } else if (!state.board || state.board.date !== state.date || state.board.counts?.LIVE) {
      const res = await ctx.board(state.date, { signal, maxAgeMs: state.board?.counts?.LIVE ? 8000 : 60000 });
      state.board = res.data; state.meta = res.meta; state.failed = false; state.error = null;
    }
    renderHero();
    renderBoard();
    const live = (state.today.counts?.LIVE || 0) + (state.board?.counts?.LIVE || 0);
    return live ? 10000 : 60000;
  }, {
    onError(error) {
      state.error = error;
      state.failed = Boolean(state.board);
      state.todayFailed = Boolean(state.today);
      if (state.board?.date !== state.date) { state.board = null; }
      renderHero();
      renderBoard();
      if (!state.today) $('#hero-panel', root).innerHTML = `<div class="hero__panel"><div class="pbe-error"><strong>${esc(describeError(error).title)}</strong>${esc(describeError(error).body)}</div></div>`;
      return error.kind === 'not_deployed' || error.kind === 'legacy' ? null : 10000;
    }
  });
  poller.start();

  // Market snapshot (optional service; 3 scheduled ingests a day). Absent =
  // no market rows, never placeholder prices.
  const oddsCtl = new AbortController();
  const loadOdds = () => odds({}, { signal: oddsCtl.signal, timeout: 8000 })
    .then(res => {
      const byGame = new Map((res.data.events || []).filter(e => e.game_id).map(e => [String(e.game_id), e]));
      state.market = { byGame, meta: res.meta, count: byGame.size, props: (res.data.events || []).some(e => e.props?.length) };
      renderBoard();
    })
    .catch(() => { state.market = null; });
  loadOdds();
  const oddsTimer = setInterval(loadOdds, 10 * 60 * 1000);

  // Newsroom (optional source). Failure is shown, never filled.
  const newsCtl = new AbortController();
  news({ limit: 40 }, { signal: newsCtl.signal, timeout: 9000 })
    .then(res => {
      // Material items from the last 24h lead; nothing older is called a change.
      const dayAgo = Date.now() - 24 * 3600 * 1000;
      const items = (res.data.items || []).filter(i => i.material && Date.parse(i.published_at) >= dayAgo);
      state.news = { items, meta: res.meta, degraded: res.data.degraded };
      renderHero();
    })
    .catch(error => {
      if (error.kind === 'aborted') return;
      state.news = { items: [], error: error.kind === 'not_deployed' ? 'feed not connected in this build' : 'feed unavailable' };
      renderHero();
    });

  const countdownTimer = setInterval(() => {
    const node = $('[data-countdown]', root);
    if (node) node.innerHTML = countdownMarkup(node.dataset.countdown);
  }, 1000);

  const setDate = date => {
    state.date = date;
    state.board = null; state.error = null;
    history.replaceState(null, '', date === todayET() ? '#/' : `#/?date=${date}`);
    renderBoard();
    poller.refresh();
  };

  const disposers = [
    on(root, 'click', '[data-filter]', (_, btn) => { state.filter = btn.dataset.filter; renderBoard(); }),
    on(root, 'click', '[data-shift]', (_, btn) => setDate(addDays(state.date, Number(btn.dataset.shift)))),
    on(root, 'click', '[data-goto]', (_, btn) => setDate(btn.dataset.goto)),
    on(root, 'change', '#board-date', (_, input) => { if (/^\d{4}-\d{2}-\d{2}$/.test(input.value)) setDate(input.value); }),
    on(root, 'click', '[data-jump]', event => { event.preventDefault(); boardEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); })
  ];

  return () => {
    poller.stop();
    newsCtl.abort();
    oddsCtl.abort();
    clearInterval(oddsTimer);
    clearInterval(countdownTimer);
    disposers.forEach(d => d());
  };
}
