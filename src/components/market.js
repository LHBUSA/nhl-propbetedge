import { esc } from '../lib/dom.js';
import { ageText } from '../lib/format.js';

// MARKET PRICE INTELLIGENCE. Scheduled snapshots, never "live". Consensus is
// the mean no-vig probability across >= 2 books quoting both sides.
export const BOOKS = {
  draftkings: 'DK', fanduel: 'FD', betmgm: 'MGM', williamhill_us: 'CZR', betrivers: 'BetRivers', betonlineag: 'BetOnline',
  bovada: 'Bovada', mybookieag: 'MyBookie', lowvig: 'LowVig', fanatics: 'Fanatics', espnbet: 'ESPN BET', ballybet: 'Bally',
  hardrockbet: 'Hard Rock', betus: 'BetUS', betparx: 'betPARX', fliff: 'Fliff'
};
export const bookName = key => BOOKS[key] || key;
export const price = p => (p === null || p === undefined || !Number.isFinite(Number(p)) ? '—' : Number(p) > 0 ? `+${Number(p)}` : `−${Math.abs(Number(p))}`);
const pct = v => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');

export function marketAge(meta) {
  if (!meta?.fetched_at) return '';
  return ageText((Date.now() - Date.parse(meta.fetched_at)) / 1000);
}

// Compact market rows for a game card. `ev` is one nhl-odds event.
export function cardMarket(ev, meta) {
  if (!ev?.pricing) return '';
  const g = ev.pricing;
  const ml = g.h2h;
  const tot = g.totals?.[0];
  const moved = (ev.opening?.movement || []).length;
  const stale = meta?.stale_after_s && meta?.fetched_at && (Date.now() - Date.parse(meta.fetched_at)) / 1000 > meta.stale_after_s;
  return `<div class="gmarket${stale ? ' is-stale-value' : ''}">
    ${ml ? `<div class="gmarket__row"><span class="gmarket__k">ML</span>
      <span>${esc(ev.away || '')} <b class="mono">${price(ml.best?.away?.price)}</b> <i>${esc(bookName(ml.best?.away?.book))}</i></span>
      <span>${esc(ev.home || '')} <b class="mono">${price(ml.best?.home?.price)}</b> <i>${esc(bookName(ml.best?.home?.book))}</i></span></div>` : ''}
    ${tot ? `<div class="gmarket__row"><span class="gmarket__k">O/U ${esc(tot.point)}</span>
      <span>o <b class="mono">${price(tot.best?.over?.price)}</b> <i>${esc(bookName(tot.best?.over?.book))}</i></span>
      <span>u <b class="mono">${price(tot.best?.under?.price)}</b> <i>${esc(bookName(tot.best?.under?.book))}</i></span></div>` : ''}
    <div class="gmarket__meta micro">Best of ${ml?.quotes?.length || 0} books${ml?.consensus ? ` · no-vig ${esc(ev.home)} ${pct(ml.consensus.home)}` : ''}${moved ? ` · ${moved} book move${moved === 1 ? '' : 's'} since open` : ''} · ${stale ? 'last verified ' : 'snapshot '}${esc(marketAge(meta))}</div>
  </div>`;
}

// Full market table for one game (Cast / Matchup).
export function marketPanel(ev, meta) {
  if (!ev?.pricing) return '';
  const ml = ev.pricing.h2h;
  const tot = ev.pricing.totals?.[0];
  const pl = ev.pricing.spreads?.[0];
  const rows = [];
  const byBook = new Map();
  for (const q of ml?.quotes || []) byBook.set(q.book, { ...(byBook.get(q.book) || {}), book: q.book, ml_away: q.away, ml_home: q.home, at: q.last_update });
  for (const q of tot?.quotes || []) byBook.set(q.book, { ...(byBook.get(q.book) || {}), book: q.book, over: q.over, under: q.under, at: byBook.get(q.book)?.at || q.last_update });
  for (const q of pl?.quotes || []) byBook.set(q.book, { ...(byBook.get(q.book) || {}), book: q.book, pl_away: q.away, pl_home: q.home });
  for (const r of byBook.values()) {
    const bestA = ml?.best?.away?.book === r.book; const bestH = ml?.best?.home?.book === r.book;
    rows.push(`<tr><td>${esc(bookName(r.book))}</td>
      <td class="num${bestA ? ' is-best' : ''}">${price(r.ml_away)}</td><td class="num${bestH ? ' is-best' : ''}">${price(r.ml_home)}</td>
      <td class="num">${price(r.pl_away)}</td><td class="num">${price(r.pl_home)}</td>
      <td class="num">${price(r.over)}</td><td class="num">${price(r.under)}</td>
      <td class="num faint">${r.at ? esc(ageText((Date.now() - Date.parse(r.at)) / 1000)) : '—'}</td></tr>`);
  }
  return `<div class="market-panel">
    <div class="kv">
      <div><span class="k">No-vig ${esc(ev.away)}</span><span class="v">${pct(ml?.consensus?.away)}</span></div>
      <div><span class="k">No-vig ${esc(ev.home)}</span><span class="v">${pct(ml?.consensus?.home)}</span></div>
      <div><span class="k">Fair ML</span><span class="v">${price(ml?.consensus?.away_fair)} / ${price(ml?.consensus?.home_fair)}</span></div>
      <div><span class="k">Total</span><span class="v">${tot ? `${esc(tot.point)} · ${pct(tot.consensus?.over)} o` : '—'}</span></div>
      <div><span class="k">Avg hold</span><span class="v">${pct(ml?.consensus?.avg_hold)}</span></div>
    </div>
    <div class="table-wrap" style="margin-top:10px"><table class="pbe-table market-table"><thead><tr><th>Book</th><th class="num">${esc(ev.away)} ML</th><th class="num">${esc(ev.home)} ML</th><th class="num">${esc(ev.away)} PL</th><th class="num">${esc(ev.home)} PL${pl ? ` ${pl.home_point > 0 ? '+' : ''}${esc(pl.home_point)}` : ''}</th><th class="num">O ${tot ? esc(tot.point) : ''}</th><th class="num">U</th><th class="num">Quote age</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <p class="micro market-note">Market snapshot (PropSports Market Feed), scheduled 08:00 / 13:00 / 18:00 ET — not a live feed. Consensus = mean no-vig probability across ${ml?.consensus?.books || 0} books quoting both sides. Market intelligence only; PropBetEdge model edges are separate and appear only from a released model.</p>
  </div>`;
}
