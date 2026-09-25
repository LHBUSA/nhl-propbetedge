// Player-prop MARKET intelligence from the stored nhl-odds snapshot. Pure.
//
// One row per game x player x market: the main line (the line the most books
// quote), best over / under price at that line with its book, how many books
// quote it, the no-vig consensus (only when at least two books quote BOTH sides
// of the same line), the other lines on offer, the newest quote time and any
// book moves since the previous snapshot. This is market observation only — it
// is never a PropBetEdge model edge, and nothing is filled in that a book did
// not quote.

export const PROP_MARKETS = [
  ['player_shots_on_goal', 'Shots on goal'],
  ['player_total_saves', 'Goalie saves'],
  ['player_points', 'Points'],
  ['player_goals', 'Goals'],
  ['player_assists', 'Assists']
];
export const PROP_LABEL = Object.fromEntries(PROP_MARKETS);

export function implied(american) {
  if (american === null || american === undefined || american === '') return null;
  const p = Number(american);
  if (!Number.isFinite(p) || p === 0 || (p > -100 && p < 100)) return null;
  return p < 0 ? -p / (-p + 100) : 100 / (p + 100);
}

export function fairAmerican(prob) {
  if (!(prob > 0 && prob < 1)) return null;
  return prob >= 0.5 ? -Math.round((100 * prob) / (1 - prob)) : Math.round((100 * (1 - prob)) / prob);
}

// A quoted American price. null / '' / 0 / (-100,100) are "not quoted" —
// Number(null) is 0, which must never read as a price.
export const isPrice = v => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v)) && Math.abs(Number(v)) >= 100;

// Better price for the bettor: higher decimal payout.
const better = (a, b) => {
  const da = Number(a) > 0 ? 1 + a / 100 : 1 + 100 / -a;
  const db = Number(b) > 0 ? 1 + b / 100 : 1 + 100 / -b;
  return da >= db;
};

export function aggregatePropMarkets(events) {
  const groups = new Map();
  for (const e of events || []) {
    for (const q of e.props || []) {
      if (!q.player || !q.market || !Number.isFinite(Number(q.line))) continue;
      const key = `${e.event_id}|${q.market}|${q.player}`;
      if (!groups.has(key)) groups.set(key, { game: { game_id: e.game_id || null, away: e.away, home: e.home, commence_time: e.commence_time }, player: q.player, market: q.market, quotes: [] });
      groups.get(key).quotes.push(q);
    }
  }
  const rows = [];
  for (const g of groups.values()) {
    const byLine = new Map();
    for (const q of g.quotes) {
      const k = Number(q.line);
      if (!byLine.has(k)) byLine.set(k, []);
      byLine.get(k).push(q);
    }
    // Main line: most books; ties -> the lower line (deterministic).
    const [mainLine, mainQuotes] = [...byLine.entries()].sort((a, b) => new Set(b[1].map(q => q.book)).size - new Set(a[1].map(q => q.book)).size || a[0] - b[0])[0];
    let bestOver = null; let bestUnder = null;
    for (const q of mainQuotes) {
      if (isPrice(q.over) && (!bestOver || better(Number(q.over), bestOver.price))) bestOver = { price: Number(q.over), book: q.book };
      if (isPrice(q.under) && (!bestUnder || better(Number(q.under), bestUnder.price))) bestUnder = { price: Number(q.under), book: q.book };
    }
    const twoSided = mainQuotes.filter(q => isPrice(q.over) && isPrice(q.under));
    let consensus = null;
    if (new Set(twoSided.map(q => q.book)).size >= 2) {
      const probs = twoSided.map(q => { const o = implied(q.over); const u = implied(q.under); return o / (o + u); });
      const over = probs.reduce((s, p) => s + p, 0) / probs.length;
      consensus = { over, under: 1 - over, fair_over: fairAmerican(over), fair_under: fairAmerican(1 - over), books: new Set(twoSided.map(q => q.book)).size };
    }
    const updates = g.quotes.map(q => q.last_update).filter(Boolean).sort();
    rows.push({
      ...g,
      main_line: mainLine,
      books: new Set(mainQuotes.map(q => q.book)).size,
      books_any_line: new Set(g.quotes.map(q => q.book)).size,
      other_lines: [...byLine.keys()].filter(l => l !== mainLine).sort((a, b) => a - b),
      best_over: bestOver,
      best_under: bestUnder,
      consensus,
      last_update: updates.length ? updates[updates.length - 1] : null,
      quotes: undefined
    });
  }
  return rows.sort((a, b) => String(a.game.commence_time || '').localeCompare(String(b.game.commence_time || ''))
    || String(a.market).localeCompare(String(b.market)) || String(a.player).localeCompare(String(b.player)));
}

// Book moves on player props between the previous and current snapshot, as
// reported by nhl-odds (movement_since_previous entries with market player_*).
export function propMoves(events) {
  const out = new Map();
  for (const e of events || []) {
    for (const m of e.movement_since_previous || []) {
      if (!String(m.market || '').startsWith('player_')) continue;
      const key = `${e.event_id}|${m.market}|${m.player}`;
      out.set(key, (out.get(key) || 0) + 1);
    }
  }
  return out;
}

export function marketCounts(rows) {
  const counts = Object.fromEntries(PROP_MARKETS.map(([k]) => [k, 0]));
  for (const r of rows) if (r.market in counts) counts[r.market] += 1;
  return counts;
}
