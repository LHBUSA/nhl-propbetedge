import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/board.css';
import './styles/cast.css';
import './styles/pages.css';
import './styles/pages-desk.css';
import './styles/pages-research.css';
import './styles/pages-lab.css';

import { dataLayer, nhl } from './lib/api.js';
import { legacyBoard } from './lib/legacy.js';
import { startFreshTicker } from './lib/freshness.js';
import { daysUntil, dateLabel, todayET } from './lib/format.js';
import { createRouter } from './lib/router.js';
import { bindShell, renderShell, setActiveNav, setSeasonChip } from './components/shell.js';
import { bindAlertsUI } from './components/alerts-ui.js';
import { startWatcher } from './services/watcher.js';

const app = document.querySelector('#app');
const main = renderShell(app);

// Shared, short-lived app state. Pages read the board through here so the
// search palette and the season chip reuse one request.
const boardCache = new Map();
const ctx = {
  latestBoard: null,
  async board(date = todayET(), { signal, maxAgeMs = 20000 } = {}) {
    const hit = boardCache.get(date);
    if (hit?.value && Date.now() - hit.at < maxAgeMs) return hit.value;
    // Concurrent callers (palette warm-up + page) share one request.
    if (hit?.pending) return hit.pending;
    const pending = loadBoard(date, signal);
    boardCache.set(date, { ...hit, pending });
    try {
      return await pending;
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
createRouter({ root: main, ctx, onRoute: id => setActiveNav(id) }).start();
// Warm the slate for the palette/season chip without blocking the first page.
ctx.board().catch(() => {});
