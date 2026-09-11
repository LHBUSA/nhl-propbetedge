import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/board.css';
import './styles/cast.css';
import './styles/pages.css';
import './styles/pages-desk.css';
import './styles/pages-research.css';
import './styles/pages-lab.css';
import './styles/backdrops.css';
import './styles/mode.css';
import './styles/identity.css';

import { ApiError, dataLayer, nhl } from './lib/api.js';
import { legacyBoard } from './lib/legacy.js';
import { startFreshTicker } from './lib/freshness.js';
import { daysUntil, dateLabel, todayET } from './lib/format.js';
import { createRouter } from './lib/router.js';
import { bindShell, renderShell, setActiveNav, setSeasonChip } from './components/shell.js';
import { bindAlertsUI } from './components/alerts-ui.js';
import { startWatcher } from './services/watcher.js';
import { applyBackdrop } from './lib/backdrops.js';
import { modeRibbon, seasonMode } from './components/mode.js';

const app = document.querySelector('#app');
const main = renderShell(app);
// Purchase UI is additive and presentation-only. Load it after renderShell so
// it can attach to the existing toolbar without observing or racing the shell.
import('./lib/pro.js').catch(error => console.error('[nhl-pro] failed to load', error));

// Shared, short-lived app state. Pages read the board through here so the
// search palette and the season chip reuse one request.
const boardCache = new Map();
const ctx = {
  latestBoard: null,
  async board(date = todayET(), { signal, maxAgeMs = 20000 } = {}) {
    const hit = boardCache.get(date);
    if (hit?.value && Date.now() - hit.at < maxAgeMs) return hit.value;
    // Concurrent callers (palette warm-up + page) share one request. The
    // shared request is not bound to any caller's signal: one page leaving
    // must not cancel what another page is waiting on. A caller whose own
    // signal aborts simply stops waiting.
    if (hit?.pending) return abortable(hit.pending, signal);
    const pending = loadBoard(date);
    boardCache.set(date, { ...hit, pending });
    try {
      return await abortable(pending, signal);
    } finally {
      const cur = boardCache.get(date);
      if (cur?.pending === pending) delete cur.pending;
    }
  },
  slateGames() {
    const b = ctx.latestBoard?.data;
    if (!b) return [];
    return b.games?.length ? b.games : (b.next_puck_drop?.games_at_start || []);
  }
};

function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new ApiError('aborted', { kind: 'aborted' }));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new ApiError('aborted', { kind: 'aborted' }));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(v => { signal.removeEventListener('abort', onAbort); resolve(v); },
      e => { signal.removeEventListener('abort', onAbort); reject(e); });
  });
}

async function loadBoard(date, signal) {
  let value;
  try {
    if ((await dataLayer()) === 'legacy') throw Object.assign(new Error('legacy'), { kind: 'legacy' });
    value = await nhl('/nhl/board', { date }, { signal });
  } catch (error) {
    // Environment without the v2 data layer: limited mode from the legacy
    // public schedule (labelled as such), never an invented slate.
    if (!['not_deployed', 'legacy'].includes(error?.kind)) throw error;
    value = await legacyBoard(date, { signal });
  }
  boardCache.set(date, { at: Date.now(), value });
  if (date === todayET()) {
    ctx.latestBoard = value;
    updateSeasonChip(value.data);
  }
  return value;
}

function updateSeasonChip(board) {
  const live = (board.counts?.LIVE || 0);
  if (live) return setSeasonChip(`${live} live now`, 'live');
  const cal = board.calendar || {};
  const today = board.date;
  if (board.season_phase === 'OFFSEASON' && cal.preseason_start && today < cal.preseason_start) {
    const d = daysUntil(cal.preseason_start, today);
    return setSeasonChip(`Preseason in ${d} day${d === 1 ? '' : 's'}`);
  }
  if (board.season_phase === 'PRESEASON' && cal.regular_season_start) {
    const d = daysUntil(cal.regular_season_start, today);
    return setSeasonChip(d === 0 ? 'Opening night' : `Opening night in ${d}d`);
  }
  if (board.season_phase === 'REGULAR_SEASON') return setSeasonChip(`${dateLabel(today)} · ${board.counts?.total || 0} games`);
  if (board.season_phase === 'PLAYOFFS') return setSeasonChip('Stanley Cup Playoffs');
  return setSeasonChip('');
}

bindShell(ctx);
bindAlertsUI();
startFreshTicker();
startWatcher(ctx);
const backdrop = document.querySelector('#backdrop');
// Operating-mode ribbon: rendered synchronously from the verified calendar so
// it never shifts layout; the Ice Board shows the full capability panel instead.
const ribbon = document.querySelector('#mode-ribbon');
ribbon.innerHTML = modeRibbon(seasonMode());
createRouter({
  root: main,
  ctx,
  onRoute: id => {
    setActiveNav(id);
    applyBackdrop(backdrop, id);
    ribbon.hidden = id === 'board' || !ribbon.innerHTML;
  }
}).start();
// Warm the slate for the palette/season chip without blocking the first page.
ctx.board().catch(() => {});
