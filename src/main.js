import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/board.css';
import './styles/cast.css';
import './styles/pages.css';

import { nhl } from './lib/api.js';
import { startFreshTicker } from './lib/freshness.js';
import { daysUntil, dateLabel, todayET } from './lib/format.js';
import { createRouter } from './lib/router.js';
import { bindShell, renderShell, setActiveNav, setSeasonChip } from './components/shell.js';

const app = document.querySelector('#app');
const main = renderShell(app);

// Shared, short-lived app state. Pages read the board through here so the
// search palette and the season chip reuse one request.
const boardCache = new Map();
const ctx = {
  latestBoard: null,
  async board(date = todayET(), { signal, maxAgeMs = 20000 } = {}) {
    const hit = boardCache.get(date);
    if (hit && Date.now() - hit.at < maxAgeMs) return hit.value;
    const value = await nhl('/nhl/board', { date }, { signal });
    boardCache.set(date, { at: Date.now(), value });
    if (date === todayET()) {
      ctx.latestBoard = value;
      updateSeasonChip(value.data);
    }
    return value;
  },
  slateGames() {
    const b = ctx.latestBoard?.data;
    if (!b) return [];
    return b.games?.length ? b.games : (b.next_puck_drop?.games_at_start || []);
  }
};

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
startFreshTicker();
createRouter({ root: main, ctx, onRoute: id => setActiveNav(id) }).start();
// Warm the slate for the palette/season chip without blocking the first page.
ctx.board().catch(() => {});
