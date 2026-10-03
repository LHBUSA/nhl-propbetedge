// Kalshi Market Intelligence for NHL (contract market-intel/1).
// The browser reads our propsports-markets API only, never Kalshi itself; the
// shared vendored client (src/vendor/kalshi/) coalesces requests and resolves
// failures to "nothing", so no market UI renders without a real entry.
// Event ids are canonical NHL gamePks (10 digits), the same ids the board uses.
import { createKalshiClient } from '../vendor/kalshi/kalshi-market-client.js';

const base = import.meta.env?.VITE_MARKETS_URL || undefined;
export const kalshi = createKalshiClient(base ? { sport: 'nhl', base } : { sport: 'nhl' });

// Poll state for a game from our own status semantics: in progress -> 'live',
// before puck drop -> 'pregame', anything else (final, postponed) -> null (stop).
export function kalshiPollState(key) {
  if (key === 'LIVE' || key === 'INTERMISSION') return 'live';
  if (key === 'SCHEDULED' || key === 'PREGAME') return 'pregame';
  return null;
}
