// Props Board. Where the nhl-odds snapshot service exists, a Best Line board
// renders real stored quotes (best price per side, book, no-vig consensus).
// The player-props board stays an empty frame until books post player
// markets. No price is ever shown that a stored snapshot does not contain,
// and market comparisons are never presented as model edges.
import { $, esc } from '../lib/dom.js';
import { odds } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { dateLabel, dayET, timeET, todayET } from '../lib/format.js';
import { teamMark } from '../components/game.js';
import { bookName, price } from '../components/market.js';

// Logos here always sit next to visible team text: decorative, so alt="".
const mark = (team, size) => teamMark(team, size).replace(/ alt="[^"]*"/, ' alt=""');

const COLUMNS = [
  ['Player', 'NHL player ID', 'official'],
  ['Team / Opp', 'NHL schedule', 'official'],
  ['Market', 'SOG · saves · points · goals · assists', 'market'],
  ['Line', 'Book quote', 'market'],
  ['Price', 'Book quote, American', 'market'],
  ['Book', 'Named sportsbook', 'market'],
  ['Quote age', 'Snapshot capture time', 'market'],
  ['Prev line', 'Stored earlier snapshot', 'market'],
  ['Model fair', 'Versioned model only', 'model'],
  ['Edge', 'Model vs price', 'model'],
  ['Flags', 'Goalie · lineup · injury', 'official']
];

// One-time provider check recorded in docs/NHL_SOURCE_MATRIX.md §6a
// (The Odds API, 2026-09-11). Coverage facts only — no prices.
const COVERAGE_DATE = '2026-09-11';
const GAME_MARKETS = [
  ['Moneyline', 'h2h', 10, 'Posted'],
  ['Total', 'totals', 10, 'Posted'],
  ['Puck line', 'spreads', 8, 'Posted']
];
const PLAYER_MARKETS = [
  ['Shots on goal', 'player_shots_on_goal'],
  ['Goalie saves', 'player_total_saves'],
  ['Points', 'player_points'],
  ['Goals', 'player_goals'],
  ['Assists', 'player_assists']
];
const BOOKS = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'BetRivers', 'Fanatics', 'Bovada', 'BetOnline', 'LowVig', 'BetUS'];

function boardFrame(hasMarket = false) {
  return `<section class="dk-props-board" id="dk-p-frame" aria-labelledby="dk-p-board">
    <div class="dk-props-board__head">
      <div><span class="eyebrow">Props Board</span><h3 id="dk-p-board">Player markets</h3></div>
      <div class="chips dk-p-markets" aria-label="Markets (inactive until snapshots exist)">
        ${PLAYER_MARKETS.map(([l]) => `<span class="chip dk-chip-off">${esc(l)}</span>`).join('')}
      </div>
    </div>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Props board columns"><table class="pbe-table dk-ptable">
      <thead>
        <tr>${COLUMNS.map(([l]) => `<th>${esc(l)}</th>`).join('')}</tr>
        <tr class="dk-ptable__spec">${COLUMNS.map(([, s, kind]) => `<td class="dk-spec dk-spec--${kind}">${esc(s)}</td>`).join('')}</tr>
      </thead>
      <tbody>
        <tr><td colspan="${COLUMNS.length}" class="dk-ptable__empty">
          <span class="pbe-badge pbe-badge--unavailable">No market data</span>
          <b>${hasMarket ? 'No book has posted NHL player markets in the current snapshot.' : 'Market snapshots not integrated — no prices are shown until a verified ingest exists.'}</b>
          <span class="dim">Each row will be one book's quote for one player market, stamped with its capture time.</span>
        </td></tr>
      </tbody>
    </table></div>
    <div class="dk-p-legend micro"><span><i class="dk-spec--official"></i>Official NHL data</span><span><i class="dk-spec--market"></i>Market snapshot</span><span><i class="dk-spec--model"></i>Versioned model output</span></div>
  </section>`;
}

function coveragePanel() {
  return `<section class="pbe-panel dk-cov">
    <div class="panel-head"><div><span class="eyebrow">Verified market coverage</span><h3>PropSports.PropTechUSA.ai Market Feed · checked ${esc(dateLabel(COVERAGE_DATE))}, 2026</h3></div><span class="pbe-badge pbe-badge--sched">One-time check</span></div>
    <p class="dim dk-cov__lede">What US books had posted for the NHL opener (FLA @ CAR, Sep 29) 18 days out. Coverage only — prices were not stored for display.</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Verified market coverage"><table class="pbe-table dk-covtable">
      <thead><tr><th>Market</th><th>Books posting</th><th>Status</th></tr></thead>
      <tbody>
        ${GAME_MARKETS.map(([l, key, n, s]) => `<tr><td><b>${esc(l)}</b> <span class="micro">${esc(key)}</span></td><td><span class="dk-books" aria-hidden="true"><span style="--n:${n}"></span></span><span class="mono dk-books__n">${n} of 10</span></td><td><span class="pbe-badge pbe-badge--confirmed">${esc(s)}</span></td></tr>`).join('')}
        ${PLAYER_MARKETS.map(([l, key]) => `<tr><td><b>${esc(l)}</b> <span class="micro">${esc(key)}</span></td><td><span class="dk-books" aria-hidden="true"><span style="--n:0"></span></span><span class="mono dk-books__n">0 of 10</span></td><td><span class="pbe-badge pbe-badge--unavailable">Not posted</span></td></tr>`).join('')}
      </tbody>
    </table></div>
    <p class="micro dk-cov__books">Books seen: ${BOOKS.map(esc).join(' · ')}. Two did not post a puck line.</p>
    <p class="micro dk-cov__foot">When books open NHL player markets is not yet measured; a game-day re-check is required before this board can go live.</p>
  </section>`;
}

function productsPanel() {
  return `<section class="dk-two" aria-labelledby="dk-p-two">
    <div class="dk-two__head"><span class="eyebrow">Two separate products</span><h3 id="dk-p-two" class="dk-two__title">Market price intelligence is not model edge.</h3></div>
    <div class="dk-two__grid">
      <article class="dk-two__card">
        <span class="pbe-badge pbe-badge--sched">Market</span>
        <h4>Market price intelligence</h4>
        <p>What the books are offering: the line, the price, which book, how old the quote is and how it moved since the last snapshot. Pure observation — it says nothing about who is right.</p>
        <dl><div><dt>Needs</dt><dd>Snapshot ingest (3×/day) · stored history</dd></div><div><dt>Status</dt><dd><span class="pbe-badge pbe-badge--unavailable">Not integrated</span></dd></div></dl>
      </article>
      <article class="dk-two__card dk-two__card--model">
        <span class="pbe-badge pbe-badge--model">Model</span>
        <h4>PropBetEdge model edge</h4>
        <p>A fair line from a versioned, validated model, compared with the market. Shown only when the model is released, with its version and a public track record.</p>
        <dl><div><dt>Needs</dt><dd>Validated model · locked predictions · grading</dd></div><div><dt>Status</dt><dd><span class="pbe-badge pbe-badge--unavailable">No model released</span></dd></div></dl>
      </article>
    </div>
  </section>`;
}

function activationPanel() {
  const step = (state, title, text) => `<li class="dk-steps__item"><span class="pbe-badge pbe-badge--${state === 'Done' ? 'confirmed' : state === 'Pending' ? 'sched' : 'unavailable'}">${esc(state)}</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div></li>`;
  return `<section class="pbe-panel dk-steps">
    <div class="panel-head"><h3>What turns this board on</h3></div>
    <ol>
      ${step('Done', 'Provider coverage verified', 'Game markets posted by 10 US books; terms allow display in this product.')}
      ${step('Pending', 'Snapshot ingest deployed', 'A separate odds Worker capturing snapshots three times a day. Awaiting owner approval.')}
      ${step('Pending', 'Player markets posted', 'Game-day check of when books open SOG, saves, points, goals and assists.')}
      ${step('Not started', 'Model fair lines', 'Only after a versioned model is validated and its picks lock before puck drop.')}
    </ol>
  </section>`;
}

// ---- Best Line (market price intelligence). Rendered only from a stored
// scheduled snapshot; consensus needs >= 2 books quoting both sides.
const evPct = v => (Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%` : '—');
function bestLineBoard(events, meta) {
  const rows = events.filter(e => e.game_id).sort((a, b) => a.commence_time.localeCompare(b.commence_time)).map(e => {
    const ml = e.pricing?.h2h; const tot = e.pricing?.totals?.[0]; const pl = e.pricing?.spreads?.[0];
    const evA = ml?.ev_vs_consensus?.away; const evH = ml?.ev_vs_consensus?.home;
    const cell = (p, book, ev) => `<td class="num${Number.isFinite(ev) && ev > 0 ? ' dk-bl__plus' : ''}"><b>${price(p)}</b><span class="dk-bl__book">${esc(bookName(book))}</span>${Number.isFinite(ev) ? `<span class="dk-bl__ev" title="Expected value of the best price against the no-vig consensus of ${ml?.consensus?.books || 0} books — market comparison, not a model">${evPct(ev)}</span>` : ''}</td>`;
    const moved = (e.opening?.movement || []).length;
    return `<tr>
      <td><a class="dk-bl__game" href="#/cast/${esc(e.game_id)}">${mark({ abbrev: e.away }, 20)}<b>${esc(e.away)}</b><span class="faint">@</span>${mark({ abbrev: e.home }, 20)}<b>${esc(e.home)}</b></a><span class="micro">${esc(dayET(e.commence_time))} · ${esc(timeET(e.commence_time))}</span></td>
      ${cell(ml?.best?.away?.price, ml?.best?.away?.book, evA)}
      ${cell(ml?.best?.home?.price, ml?.best?.home?.book, evH)}
      <td class="num">${ml?.consensus ? `${(ml.consensus.home * 100).toFixed(1)}%` : '—'}<span class="dk-bl__book">${ml?.consensus ? `${ml.consensus.books} books` : 'no consensus'}</span></td>
      <td class="num">${pl ? `${esc(String(pl.home_point))} <b>${price(pl.best?.home?.price)}</b><span class="dk-bl__book">${esc(bookName(pl.best?.home?.book))}</span>` : '—'}</td>
      <td class="num dk-bl__tot">${tot ? `<b>${esc(tot.point)}</b><span>o ${price(tot.best?.over?.price)} <i>${esc(bookName(tot.best?.over?.book))}</i></span><span>u ${price(tot.best?.under?.price)} <i>${esc(bookName(tot.best?.under?.book))}</i></span>` : '—'}</td>
      <td class="num">${moved ? `${moved}` : '0'}</td>
    </tr>`;
  });
  const props = events.flatMap(e => (e.props || []).map(p => ({ ...p, game: e })));
  return `<section class="dk-bl" aria-labelledby="dk-bl-title">
    <div class="dk-props-board__head">
      <div><span class="eyebrow">Best Line · market price intelligence</span><h3 id="dk-bl-title">Best available price, every game</h3></div>
      ${freshStamp(meta, { source: 'Market snapshot' })}
    </div>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Best line by game"><table class="pbe-table dk-bltable">
      <thead><tr><th>Game</th><th class="num">Away ML · best</th><th class="num">Home ML · best</th><th class="num">No-vig home</th><th class="num">Home puck line</th><th class="num">Total · best o / u</th><th class="num">Book moves since open</th></tr></thead>
      <tbody>${rows.join('') || `<tr><td colspan="7" class="dk-ptable__empty">No priced games in the current snapshot.</td></tr>`}</tbody>
    </table></div>
    <p class="micro dk-bl__note">Scheduled snapshot (08:00 / 13:00 / 18:00 ET), not a live feed. Percentages next to a price compare that price with the mean no-vig probability of the books quoting both sides — a market comparison, never a PropBetEdge model edge. ${props.length ? '' : 'Player props: no book has posted NHL player markets in this snapshot.'}</p>
  </section>`;
}

export function mount(root, params, ctx) {
  root.innerHTML = `<section class="wrap section dk dk-props">
    <div class="section-head section-head--editorial">
      <div><span class="eyebrow">Props</span><h2>Props Board</h2></div>
      <p>Every market, every book, every quote with its age. Nothing is shown that a stored, verified snapshot does not contain.</p>
    </div>
    <div id="dk-p-slate"></div>
    <div id="dk-p-bestline"></div>
    ${boardFrame()}
    <div class="dk-p-grid">
      ${coveragePanel()}
      ${activationPanel()}
    </div>
    ${productsPanel()}
    <nav class="dk-p-links" aria-label="Related">
      <a class="pbe-btn" href="#/track-record">Track Record</a>
      <a class="pbe-btn pbe-btn--ghost" href="#/methodology">Methodology</a>
      <a class="pbe-btn pbe-btn--ghost" href="#/goalies">Goalie Center</a>
    </nav>
  </section>`;

  // The slate the board will cover: real schedule, no prices.
  const ctl = new AbortController();
  const slateEl = $('#dk-p-slate', root);
  (async () => {
    try {
      const today = await ctx.board(todayET(), { signal: ctl.signal });
      let games = today.data.games || [];
      let label = 'Today';
      if (!games.length && today.data.next_puck_drop?.date) {
        const nd = today.data.next_puck_drop.date;
        const next = await ctx.board(nd, { signal: ctl.signal });
        games = next.data.games || [];
        label = `Next slate · ${dateLabel(nd)}`;
      }
      if (!games.length) return;
      slateEl.innerHTML = `<div class="dk-p-slate"><span class="micro">${esc(label)} · ${games.length} game${games.length === 1 ? '' : 's'} · markets not posted in the snapshot</span>
        <div class="dk-p-slate__list">${games.map(g => `<a class="dk-p-slate__g" href="#/matchup/${esc(g.id)}">${mark(g.teams.away, 20)}<b>${esc(g.teams.away.abbrev)}</b><span class="faint">@</span>${mark(g.teams.home, 20)}<b>${esc(g.teams.home.abbrev)}</b></a>`).join('')}</div></div>`;
    } catch { /* slate context is optional on this page */ }
  })();

  // Market snapshot, when this environment has the odds service.
  odds({}, { signal: ctl.signal, timeout: 8000 })
    .then(res => {
      $('#dk-p-bestline', root).innerHTML = bestLineBoard(res.data.events || [], res.meta);
      if (!(res.data.events || []).some(e => e.props?.length)) $('#dk-p-frame', root).outerHTML = boardFrame(true);
    })
    .catch(() => { /* absent service: the frame below explains what is missing */ });

  return () => ctl.abort();
}
