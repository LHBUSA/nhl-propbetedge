// Props Board frame. No odds pipeline exists yet, so this page shows the board
// the product will run — its columns and what each one requires — plus the
// verified market coverage from a one-time provider check. It renders no
// prices, no lines and no edges: nothing here may look like a quote.
import { $, esc } from '../lib/dom.js';
import { dateLabel, todayET } from '../lib/format.js';
import { teamMark } from '../components/game.js';

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

function boardFrame() {
  return `<section class="dk-props-board" aria-labelledby="dk-p-board">
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
          <b>Market snapshots not integrated — no prices are shown until a verified ingest exists.</b>
          <span class="dim">Each row will be one book's quote for one player market, stamped with its capture time.</span>
        </td></tr>
      </tbody>
    </table></div>
    <div class="dk-p-legend micro"><span><i class="dk-spec--official"></i>Official NHL data</span><span><i class="dk-spec--market"></i>Market snapshot</span><span><i class="dk-spec--model"></i>Versioned model output</span></div>
  </section>`;
}

function coveragePanel() {
  return `<section class="pbe-panel dk-cov">
    <div class="panel-head"><div><span class="eyebrow">Verified market coverage</span><h3>The Odds API · checked ${esc(dateLabel(COVERAGE_DATE))}, 2026</h3></div><span class="pbe-badge pbe-badge--sched">One-time check</span></div>
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

export function mount(root, params, ctx) {
  root.innerHTML = `<section class="wrap section dk dk-props">
    <div class="section-head section-head--editorial">
      <div><span class="eyebrow">Props</span><h2>Props Board</h2></div>
      <p>Every player market, every book, every quote with its age — once a verified market ingest exists. Until then the board stays empty rather than showing a number we cannot stand behind.</p>
    </div>
    <div id="dk-p-slate"></div>
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
      slateEl.innerHTML = `<div class="dk-p-slate"><span class="micro">${esc(label)} · ${games.length} game${games.length === 1 ? '' : 's'} · no markets captured</span>
        <div class="dk-p-slate__list">${games.map(g => `<a class="dk-p-slate__g" href="#/matchup/${esc(g.id)}">${mark(g.teams.away, 20)}<b>${esc(g.teams.away.abbrev)}</b><span class="faint">@</span>${mark(g.teams.home, 20)}<b>${esc(g.teams.home.abbrev)}</b></a>`).join('')}</div></div>`;
    } catch { /* slate context is optional on this page */ }
  })();

  return () => ctl.abort();
}
