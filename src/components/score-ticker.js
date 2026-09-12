import { esc, safeUrl } from '../lib/dom.js';
import { createPoller } from '../lib/poll.js';
import { freshnessState } from '../lib/freshness.js';
import { ageText, dayET, timeET, todayET } from '../lib/format.js';
import { logoUrl } from '../lib/teams.js';
import { stateOf } from './game.js';

// NHL score rail. One data path, the same one every other surface uses:
//   browser -> https://nhl-api.propbetedge.ai/nhl/board -> propsports-api -> NHL.
// It reads through ctx.board(), so it shares the app's board cache and request
// de-duplication with the Ice Board, the search palette and the watcher rather
// than opening a second polling system. NHL games only: this component never
// requests, receives or renders another sport.

const POLL_LIVE = 10000;    // a live slate, per the NHL scoreboard's own cadence
const POLL_SLATE = 60000;   // games today, none live
const POLL_EMPTY = 300000;  // no games at all (offseason / dark day)

// Live games first, then what is about to start, then what has finished.
const ORDER = { LIVE: 0, INTERMISSION: 0, PREGAME: 1, SCHEDULED: 2, FINAL: 3 };

function rank(game) {
  const key = stateOf(game).key;
  return ORDER[key] ?? 4;
}

function sortGames(games) {
  return [...games].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d) return d;
    return String(a.start_time_utc || '').localeCompare(String(b.start_time_utc || '')) || String(a.id).localeCompare(String(b.id));
  });
}

function mark(team) {
  const src = safeUrl(logoUrl(team));
  const abbr = esc(team?.abbrev || '—');
  if (!src) return `<span class="stk-g__logo" aria-hidden="true"></span>`;
  return `<img class="stk-g__logo" src="${esc(src)}" alt="" width="18" height="18" loading="lazy" decoding="async" data-abbr="${abbr}" onerror="this.remove()">`;
}

// Score is shown only where the source actually carries one.
function side(team, game, { scored }) {
  const value = team?.score;
  const has = scored && value !== null && value !== undefined;
  return `<span class="stk-g__side">${mark(team)}<b>${esc(team?.abbrev || '—')}</b>${has ? `<i>${esc(value)}</i>` : ''}</span>`;
}

function gameMarkup(game, { stale }) {
  const st = stateOf(game);
  const scored = st.key === 'LIVE' || st.key === 'INTERMISSION' || st.key === 'FINAL';
  const s = game.status || {};
  let detail = st.text;
  let chip = '';
  if (st.key === 'LIVE') {
    // stateOf already renders "LIVE · 3rd 08:41"; the rail splits the state
    // word into its own chip so the period/clock stays readable.
    detail = st.text.replace(/^LIVE(\s·\s)?/, '') || 'LIVE';
    chip = stale ? 'LIVE · DELAYED' : 'LIVE';
  } else if (st.key === 'INTERMISSION') {
    detail = `INT · ${['', '1st', '2nd', '3rd'][Number(s.period)] || `P${s.period || ''}`}`;
    chip = stale ? 'INT · DELAYED' : 'INT';
  }
  const label = `${game.teams?.away?.abbrev || '?'} ${scored ? `${game.teams?.away?.score ?? ''} ` : 'at '}${game.teams?.home?.abbrev || '?'} ${scored ? `${game.teams?.home?.score ?? ''} ` : ''}· ${st.text}`;
  return `<a class="stk-g" data-state="${esc(st.key)}" href="#/cast/${esc(game.id)}" aria-label="${esc(label)}">
    ${side(game.teams?.away, game, { scored })}<span class="stk-g__vs" aria-hidden="true">${scored ? '·' : '@'}</span>${side(game.teams?.home, game, { scored })}
    ${detail ? `<span class="stk-g__st">${esc(detail)}</span>` : ''}
    ${chip ? `<span class="stk-g__chip">${esc(chip)}</span>` : ''}
  </a>`;
}

function emptyMarkup(board) {
  const next = board?.next_puck_drop;
  const when = next?.start_time_utc;
  const first = next?.games_at_start?.[0];
  const more = Math.max(0, Number(next?.games_that_day || 0) - 1);
  const detail = when
    ? `Next puck drop · ${dayET(when)} ${timeET(when)}${first ? ` · ${first.teams?.away?.abbrev || ''} @ ${first.teams?.home?.abbrev || ''}` : ''}${more ? ` +${more} more` : ''}`
    : '';
  return `<span class="stk-empty"><b>No NHL games today</b>${detail ? `<span>${esc(detail)}</span>` : ''}</span>`;
}

function signature(games, board, stale) {
  if (!games.length) return `empty|${board?.date || ''}|${board?.next_puck_drop?.start_time_utc || ''}|${stale ? 's' : ''}`;
  return games.map(g => {
    const s = g.status || {};
    return [g.id, s.semantics, s.period, s.clock, s.in_intermission ? 'i' : '', s.last_period_type, g.teams?.away?.score, g.teams?.home?.score].join(':');
  }).join('|') + (stale ? '|STALE' : '');
}

export function mountScoreTicker(host, ctx) {
  if (!host) return () => {};
  const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const wide = typeof matchMedia === 'function' ? matchMedia('(min-width: 900px) and (hover: hover)') : null;

  host.innerHTML = `<section class="stk" id="score-ticker" aria-label="NHL scores" aria-live="off" data-fresh="LOADING">
    <div class="stk__in">
      <span class="stk__brand"><b>NHL</b><span class="stk__status" id="stk-status">Scores</span></span>
      <div class="stk__viewport" id="stk-viewport" tabindex="0" role="group" aria-label="NHL score rail, scrollable">
        <div class="stk__track" id="stk-track"><div class="stk__run" id="stk-run"><span class="stk-empty"><b>Loading today's NHL slate…</b></span></div></div>
      </div>
    </div>
  </section>`;

  const root = host.querySelector('.stk');
  const viewport = host.querySelector('#stk-viewport');
  const track = host.querySelector('#stk-track');
  const run = host.querySelector('#stk-run');
  const status = host.querySelector('#stk-status');

  let lastSig = null;
  let failed = false;
  let last = null;   // last good { data, meta }

  function layout() {
    // One clone, not a hundred: the track holds the rail twice and slides by
    // exactly half its width, so the loop never visibly resets.
    track.querySelectorAll('.stk__run--clone').forEach(node => node.remove());
    track.classList.remove('is-marquee');
    viewport.classList.remove('is-locked');
    const overflows = run.scrollWidth > viewport.clientWidth + 2;
    if (!overflows || reduce?.matches || !wide?.matches) return;
    const clone = run.cloneNode(true);
    clone.id = '';
    clone.classList.add('stk__run--clone');
    clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('a').forEach(a => { a.removeAttribute('href'); a.setAttribute('tabindex', '-1'); });
    track.append(clone);
    track.style.setProperty('--stk-dur', `${Math.max(24, Math.round(run.scrollWidth / 42))}s`);
    track.classList.add('is-marquee');
    viewport.classList.add('is-locked');
  }

  function paint() {
    const data = last?.data || null;
    const meta = last?.meta || null;
    const gatewayStale = meta?.gateway_semantics === 'STALE';
    const fresh = freshnessState({ meta, failed, hasData: Boolean(data) });
    const stale = failed || gatewayStale || fresh === 'STALE';
    const games = sortGames(data?.games || []);
    const live = games.filter(g => ['LIVE', 'INTERMISSION'].includes(stateOf(g).key)).length;

    root.dataset.fresh = data ? (stale ? 'STALE' : fresh) : 'UNAVAILABLE';
    root.dataset.live = live ? '1' : '';
    const age = meta?.fetched_at ? ageText((Date.now() - Date.parse(meta.fetched_at)) / 1000) : '';
    status.textContent = !data
      ? 'Scores unavailable'
      : stale
        ? `Scores delayed${age ? ` · ${age}` : ''}`
        : live
          ? `${live} live`
          : games.length
            ? `${games.length} today`
            : 'Today';
    status.title = meta?.fetched_at ? `NHL board fetched ${new Date(meta.fetched_at).toISOString()}` : '';

    const sig = data ? signature(games, data, stale) : 'none';
    if (sig === lastSig) return;
    lastSig = sig;
    run.innerHTML = !data
      ? '<span class="stk-empty"><b>NHL scores unavailable</b><span>The board did not answer. Nothing is shown rather than something invented.</span></span>'
      : games.length
        ? games.map(g => gameMarkup(g, { stale })).join('')
        : emptyMarkup(data);
    layout();
  }

  const poller = createPoller(async signal => {
    const date = todayET();
    try {
      const res = await ctx.board(date, { signal, maxAgeMs: 8000 });
      last = res;
      failed = false;
      paint();
      const games = res?.data?.games || [];
      const live = games.some(g => ['LIVE', 'INTERMISSION'].includes(stateOf(g).key));
      return live ? POLL_LIVE : games.length ? POLL_SLATE : POLL_EMPTY;
    } catch (error) {
      if (error?.kind === 'aborted') throw error;
      // Keep the last-known rail on screen and say so; never blank it, and
      // never let a live badge keep claiming LIVE unqualified.
      failed = true;
      paint();
      throw error;
    }
  }, { onError: () => POLL_SLATE, maxBackoff: 300000 });

  const relayout = () => { lastSig = null; paint(); };
  const onResize = () => layout();
  window.addEventListener('resize', onResize, { passive: true });
  reduce?.addEventListener?.('change', relayout);
  wide?.addEventListener?.('change', relayout);
  poller.start();

  return () => {
    poller.stop();
    window.removeEventListener('resize', onResize);
    reduce?.removeEventListener?.('change', relayout);
    wide?.removeEventListener?.('change', relayout);
  };
}
