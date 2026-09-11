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

const CAP = (label, href, note) => ({ label, href, note });

// Capability panel for the Ice Board. `env`: { dataLayer, odds }.
export function modePanel(mode, env = {}) {
  if (!mode || !['PRESEASON_INTEL', 'PRESEASON'].includes(mode.key)) return '';
  const v2 = env.dataLayer !== 'legacy';
  const available = v2 ? [
    CAP('Historical replay', '#/cast?view=all&date=2026-04-16', 'Any completed game, event by event'),
    CAP('Shot intelligence', '#/shots/2025020500', 'Real-coordinate rink maps, Corsi/Fenwick'),
    CAP('Line deployment', '#/lines', 'Last completed game, from shift charts'),
    CAP('Team & player research', '#/players', 'Leaders, game logs, rosters'),
    CAP('Standings & history', '#/standings', '2025-26 final table, labelled'),
    CAP('Newsroom', '#/news', 'Injuries, transactions, trades'),
    ...(env.odds ? [CAP('Market snapshots', '#/props', 'Best line, 10 books, 3×/day')] : []),
    CAP('Source health', '#/methodology', 'Every source and its freshness rule')
  ] : [
    CAP('Official schedule', '#/', 'Every game, puck-drop times'),
    CAP('Next puck drop', '#/', 'Countdown and matchups'),
    CAP('Methodology', '#/methodology', 'Sources and truth rules')
  ];
  const awaiting = [
    CAP('Live PBE Cast', '#/cast', `From ${dateLabel(mode.nextDate)}`),
    CAP('Confirmed starting goalies', '#/goalies', 'At puck drop, from the box score'),
    CAP('Player prop markets', '#/props', 'When books post them near game day'),
    ...(v2 ? [] : [CAP('Replay, shot maps, research', '#/methodology', 'Activates with the NHL data layer')])
  ];
  const licensed = [
    CAP('Projected starting goalies', '#/goalies', 'Licensed feed required'),
    CAP('Injury status table', '#/injuries', 'Licensed feed required'),
    CAP('Projected lines & PP units', '#/lines', 'Licensed feed required')
  ];
  const col = (title, tone, list) => `<div class="mode-col mode-col--${tone}">
    <span class="eyebrow">${esc(title)}</span>
    <ul>${list.map(c => `<li><a href="${esc(c.href)}"><b>${esc(c.label)}</b><span>${esc(c.note)}</span></a></li>`).join('')}</ul>
  </div>`;
  return `<section class="mode-panel" aria-labelledby="mode-title">
    <div class="mode-panel__head">
      <div>
        <span class="eyebrow mode-panel__tag">${esc(mode.label)}</span>
        <h2 id="mode-title" class="mode-panel__title">The desk is open. The puck drops ${esc(dateLabel(mode.nextDate, { long: true }))}.</h2>
      </div>
      <div class="mode-panel__count"><b class="mono">${Math.max(0, mode.days)}</b><span>day${mode.days === 1 ? '' : 's'} to the ${esc(mode.nextLabel.toLowerCase())}</span></div>
    </div>
    <div class="mode-cols">
      ${col('Available now', 'now', available)}
      ${col('Awaiting live season data', 'wait', awaiting)}
      ${col('Licensing-dependent', 'lic', licensed)}
    </div>
  </section>`;
}
