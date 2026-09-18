import { esc } from '../lib/dom.js';
import { dateLabel, daysUntil, todayET } from '../lib/format.js';

// Operating modes. Preseason Intelligence Mode is a legitimate state, not an
// error: before live games (and while licensed feeds are pending) the product
// runs on replay, research, shot intelligence, deployment, news and markets.
// Verified 2026-09-11 from api-web /schedule; the live board payload wins when present.
const CAL = { preseason_start: '2026-09-19', regular_season_start: '2026-09-29' };

export function seasonMode(board = null, today = todayET()) {
  const cal = board?.calendar?.preseason_start ? board.calendar : CAL;
  const live = board?.counts?.LIVE || 0;
  if (live) return { key: 'LIVE', live };
  if (today < cal.preseason_start) {
    return { key: 'PRESEASON_INTEL', label: 'Preseason Intelligence Mode', nextLabel: 'First live test', nextDate: cal.preseason_start, days: daysUntil(cal.preseason_start, today), opener: cal.regular_season_start };
  }
  if (today < cal.regular_season_start) {
    return { key: 'PRESEASON', label: 'Preseason', nextLabel: 'Opening night', nextDate: cal.regular_season_start, days: daysUntil(cal.regular_season_start, today), opener: cal.regular_season_start };
  }
  return { key: 'SEASON' };
}

export function modeRibbon(mode) {
  if (!mode || !['PRESEASON_INTEL', 'PRESEASON'].includes(mode.key)) return '';
  return `<div class="mode-ribbon" role="note">
    <div class="mode-ribbon__in">
      <span class="mode-ribbon__tag">${esc(mode.label)}</span>
      <span class="mode-ribbon__next">${esc(mode.nextLabel)} <b>${esc(dateLabel(mode.nextDate))}</b>${mode.days > 0 ? ` · ${mode.days} day${mode.days === 1 ? '' : 's'}` : ' · today'}</span>
      <span class="mode-ribbon__now">Live now: replay · shot intelligence · deployment · research · news · markets</span>
      <a class="mode-ribbon__link" href="#/?mode=1">What's available</a>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- capability
// Three interaction states, and the interaction really matches the state:
//
//   AVAILABLE       a working tool, today, on real data. Always a link.
//   AWAITING        the capability exists but its data arrives at puck drop.
//                   Linked ONLY when the destination gives useful CURRENT
//                   context (its own honest empty/entry state), and the card
//                   says what it is waiting for so it never implies the data
//                   is already there.
//   SOURCE_REQUIRED no licensed source is connected. NOT a link, not an <a>,
//                   aria-disabled, and nothing behind it to land on.
//
// Nothing here may point at a hardcoded game id or date: a route that needs a
// fixture gets its generic entry state, which picks the real current game.
export const AVAILABLE = 'AVAILABLE';
export const AWAITING = 'AWAITING';
export const SOURCE_REQUIRED = 'SOURCE_REQUIRED';

const cap = (state, label, note, href = null, chip = null) => ({ state, label, note, href, chip });

export function capabilities(mode, env = {}) {
  const v2 = env.dataLayer !== 'legacy';
  const available = v2 ? [
    cap(AVAILABLE, 'Historical replay', 'Any completed game, event by event', '#/cast'),
    cap(AVAILABLE, 'Shot intelligence', 'Real-coordinate rink maps, Corsi/Fenwick', '#/shots'),
    cap(AVAILABLE, 'Line deployment', 'Official rosters and last-game deployment', '#/lines'),
    cap(AVAILABLE, 'Team & player research', 'Leaders, game logs, rosters', '#/players'),
    cap(AVAILABLE, 'Standings & history', '2025-26 final table, labelled', '#/standings'),
    cap(AVAILABLE, 'Newsroom', 'Injuries, transactions, trades', '#/news'),
    cap(AVAILABLE, 'PBE Picks desk', 'Slate, model status and the lock pipeline', '#/pbe-picks'),
    ...(env.odds ? [cap(AVAILABLE, 'Market snapshots', 'Best line, 10 books, 3×/day', '#/props')] : []),
    cap(AVAILABLE, 'Source health', 'Every source and its freshness rule', '#/methodology')
  ] : [
    cap(AVAILABLE, 'Official schedule', 'Every game, puck-drop times', '#/'),
    cap(AVAILABLE, 'Next puck drop', 'Countdown and matchups', '#/'),
    cap(AVAILABLE, 'Methodology', 'Sources and truth rules', '#/methodology')
  ];

  const from = mode?.nextDate ? `Live from ${dateLabel(mode.nextDate)}` : 'Live at puck drop';
  const awaiting = [
    cap(AWAITING, 'Live PBE Cast', 'Play-by-play and the live rink map', '#/cast', from),
    cap(AWAITING, 'Confirmed starting goalies', 'Read off the box score at puck drop — never projected', '#/goalies', 'At puck drop'),
    cap(AWAITING, 'Player prop markets', 'When the books post them near game day', env.odds ? '#/props' : null, 'When books post'),
    ...(v2 ? [] : [cap(AWAITING, 'Replay, shot maps, research', 'Activates with the NHL data layer', '#/methodology', 'Data layer')])
  ];

  const source = [
    cap(SOURCE_REQUIRED, 'Projected starting goalies', 'No licensed projection feed is connected, so nothing is projected.', null, 'Source required'),
    cap(SOURCE_REQUIRED, 'Injury status table', 'No licensed injury feed is connected. Newsroom reports are not a status table.', null, 'Source required'),
    cap(SOURCE_REQUIRED, 'Projected lines & PP units', 'No licensed line feed is connected. Official rosters are in Line deployment.', null, 'Source required')
  ];

  return { available, awaiting, source };
}

export function capabilityCounts(groups) {
  return { available: groups.available.length, awaiting: groups.awaiting.length, source: groups.source.length };
}

function capCard(entry) {
  const inner = `<b>${esc(entry.label)}</b><span>${esc(entry.note)}</span>${entry.chip ? `<i class="cap__chip">${esc(entry.chip)}</i>` : ''}`;
  if (entry.state === SOURCE_REQUIRED) {
    // Deliberately not an anchor and not focusable: there is nothing to land on.
    return `<li class="cap cap--source" aria-disabled="true"><div class="cap__in">${inner}</div></li>`;
  }
  if (!entry.href) {
    return `<li class="cap cap--${entry.state === AWAITING ? 'wait' : 'now'} cap--flat" aria-disabled="true"><div class="cap__in">${inner}</div></li>`;
  }
  return `<li class="cap cap--${entry.state === AWAITING ? 'wait' : 'now'}"><a class="cap__in" href="${esc(entry.href)}">${inner}</a></li>`;
}

function capColumn(title, tone, list, foot = '') {
  return `<div class="cap-col cap-col--${tone}">
    <span class="eyebrow">${esc(title)}</span>
    <ul>${list.map(capCard).join('')}</ul>
    ${foot}
  </div>`;
}

// NHL INTELLIGENCE STATUS. A compact one-line summary that expands; it is the
// LAST block on the Ice Board and must never take the first viewport again.
export function modePanel(mode, env = {}, { open = false } = {}) {
  if (!mode || !['PRESEASON_INTEL', 'PRESEASON'].includes(mode.key)) return '';
  const groups = capabilities(mode, env);
  const c = capabilityCounts(groups);
  const days = Math.max(0, Number(mode.days) || 0);
  return `<section class="intel" id="mode-panel" aria-labelledby="intel-h">
    <div class="intel__bar">
      <div class="intel__id">
        <span class="eyebrow">NHL intelligence status</span>
        <h2 id="intel-h">${esc(mode.label)}</h2>
      </div>
      <ul class="intel__counts">
        <li class="intel__c intel__c--now"><b class="mono">${c.available}</b><span>tools live now</span></li>
        <li class="intel__c intel__c--wait"><b class="mono">${c.awaiting}</b><span>awaiting puck drop</span></li>
        <li class="intel__c intel__c--src"><b class="mono">${c.source}</b><span>source required</span></li>
      </ul>
      <div class="intel__when"><b class="mono">${days}</b><span>day${days === 1 ? '' : 's'} to the ${esc(String(mode.nextLabel || '').toLowerCase())}</span></div>
    </div>
    <details class="intel__detail"${open ? ' open' : ''}>
      <summary><span>Full capability detail</span></summary>
      <div class="cap-cols">
        ${capColumn('Available now', 'now', groups.available)}
        ${capColumn('Awaiting puck drop', 'wait', groups.awaiting)}
        ${capColumn('Source required', 'src', groups.source,
          '<p class="cap-col__foot micro">These stay empty until a licensed feed exists. <a class="gold" href="#/methodology">Why, and what would change it →</a></p>')}
      </div>
    </details>
  </section>`;
}
