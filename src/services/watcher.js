// Background attention watcher. One visibility-aware poller for the app:
// board every 60 s (10 s while a watched game is live), goalie status for
// watched games from 90 min before puck drop until confirmed, and breaking
// newsroom items every ~3 min. Rules are pure (alert-rules.js); the bus
// dedupes by key. Runs only where the v2 data layer exists.
import { dataLayer, nhl, news } from '../lib/api.js';
import { createPoller } from '../lib/poll.js';
import { todayET } from '../lib/format.js';
import { alerts, watch } from './alerts.js';
import { boardAlerts, goalieAlerts, newsAlerts } from './alert-rules.js';

export function startWatcher(ctx) {
  let prevBoard = null;
  let prevNews = null;
  let lastNewsAt = 0;
  const prevGoalies = new Map();

  const poller = createPoller(async signal => {
    if ((await dataLayer()) === 'legacy') return null;
    const watched = watch.ids();
    const { data: board } = await ctx.board(todayET(), { signal, maxAgeMs: 8000 });
    alerts.apply(boardAlerts(prevBoard, board, watched));
    prevBoard = board;

    const soon = (board.games || []).filter(g => watched.has(String(g.id))
      && ['SCHEDULED', 'PREGAME', 'LIVE'].includes(g.status?.semantics)
      && Date.parse(g.start_time_utc) - Date.now() < 90 * 60 * 1000);
    for (const g of soon.slice(0, 4)) {
      const prev = prevGoalies.get(String(g.id));
      if (prev && ['away', 'home'].every(s => prev.teams?.[s]?.starter?.status === 'CONFIRMED')) continue;
      try {
        const { data } = await nhl(`/nhl/game/${g.id}/goalies`, {}, { signal });
        alerts.apply(goalieAlerts(prev || null, data));
        prevGoalies.set(String(g.id), data);
      } catch (error) {
        if (error.kind === 'aborted') throw error;
      }
    }

    if (Date.now() - lastNewsAt > 170000) {
      try {
        const { data } = await news({ limit: 60 }, { signal });
        alerts.apply(newsAlerts(prevNews, data.items || []));
        prevNews = data.items || [];
        lastNewsAt = Date.now();
      } catch (error) {
        if (error.kind === 'aborted') throw error;
      }
    }
    const watchedLive = (board.games || []).some(g => watched.has(String(g.id)) && g.status?.semantics === 'LIVE');
    return watchedLive ? 10000 : 60000;
  }, { onError: () => 30000 });

  // Delay the first sweep so it never competes with the landing page.
  const timer = setTimeout(() => poller.start(), 4000);
  return () => { clearTimeout(timer); poller.stop(); };
}
