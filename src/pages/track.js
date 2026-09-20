// TRACK RECORD — a live read of the public picks ledger.
//
// Contract: propsports-api-worker/docs/NHL_PBE_PICKS_API_CONTRACT.md
//   GET /nhl/picks/track-record          aggregates computed in SQL from
//                                        OFFICIAL locked + graded picks
//   GET /nhl/picks/track-record/ledger   the per-pick public rows
//
// This page performs no arithmetic on picks and stores no copy of a result: it
// renders what those two responses contain. A field the API did not return is
// rendered as an em dash with its label intact — never as 0, never as a
// plausible-looking value. When the ledger is empty the page shows the API's
// OWN `reason`, not a sentence written here months ago.
import { esc, on } from '../lib/dom.js';
import { describeError, picksLedger, picksPreseasonHistory, picksPreseasonLedger, picksPreseasonRecord, picksTrackRecord } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { dayET, pct, timeET } from '../lib/format.js';

const DASH = '—';
const LEDGER_LIMIT = 25;

const present = value => (value === null || value === undefined || value === '' ? null : value);

function readKey(source, keys) {
  if (!source || typeof source !== 'object') return null;
  for (const key of keys) {
    const value = present(source[key]);
    if (value !== null) return value;
  }
  return null;
}

// Number(null) and Number('') are 0. Coercing before the absence check would
// turn "the API did not return this" into a confident zero, so absence is
// rejected first, everywhere.
const numeric = value => {
  if (present(value) === null || typeof value === 'boolean') return null;
  const v = Number(value);
  return Number.isFinite(v) ? v : null;
};

function readNum(source, keys) {
  return numeric(readKey(source, keys));
}

const intText = v => (Number.isFinite(v) ? String(Math.round(v)) : null);
const fixed = (v, digits = 3) => (Number.isFinite(v) ? v.toFixed(digits) : null);
const signedText = (v, digits = 2) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(digits)}` : null);

// A rate is only formatted as a percentage when it really is a unit-interval
// rate. Anything else is shown as the raw number the API returned rather than
// assuming a scale and mislabelling it.
function rateText(v) {
  if (!Number.isFinite(v)) return null;
  return v >= 0 && v <= 1 ? pct(v) : String(v);
}

function americanPrice(value) {
  const v = numeric(value);
  if (v === null) return null;
  return v > 0 ? `+${v}` : String(v);
}

// ------------------------------------------------------------- aggregates
function recordText(agg) {
  const wins = readNum(agg, ['wins', 'w']);
  const losses = readNum(agg, ['losses', 'l']);
  if (wins === null && losses === null) return null;
  const pushes = readNum(agg, ['pushes', 'p']);
  const voids = readNum(agg, ['voids', 'v']);
  return [wins, losses, pushes, voids]
    .filter(n => n !== null)
    .map(n => String(Math.round(n)))
    .join('-');
}

function seasonLabel(value) {
  const raw = String(value || '');
  if (/^\d{8}$/.test(raw)) return raw.slice(0, 4) + '–' + raw.slice(6);
  return raw || 'All seasons';
}

const REGULAR_METRICS = [
  ['Locked calls', agg => intText(readNum(agg, ['locked_calls', 'locked', 'n_locked', 'locked_picks'])), 'Official regular-season picks locked before puck drop.'],
  ['Record', agg => recordText(agg), 'Wins-losses, plus pushes and voids when the API reports them.'],
  ['Hit rate (SU)', agg => rateText(readNum(agg, ['hit_rate', 'su_hit_rate', 'straight_up_hit_rate'])), 'Straight-up accuracy. UNPRICED picks are counted here.'],
  ['Brier', agg => fixed(readNum(agg, ['brier', 'brier_score'])), 'Calibration of the published probability. Lower is better.'],
  ['Log loss', agg => fixed(readNum(agg, ['log_loss', 'logloss'])), 'Penalty for confident misses. Lower is better.'],
  ['Priced', agg => intText(readNum(agg, ['priced_calls', 'priced', 'priced_count', 'priced_picks'])), 'Picks with a legitimate quoted price at lock.'],
  ['UNPRICED', agg => intText(readNum(agg, ['unpriced_calls', 'unpriced', 'unpriced_count', 'unpriced_picks'])), 'No quoted price at lock. Graded, but excluded from ROI and CLV.'],
  ['ROI', agg => signedText(readNum(agg, ['roi', 'roi_units', 'return_on_investment'])), 'Over priced picks only, as returned by the API.'],
  ['CLV', agg => signedText(readNum(agg, ['clv_pts', 'clv', 'avg_clv', 'clv_avg', 'mean_clv'])), 'Recorded price against captured closing price, priced picks only.'],
  ['Sample size', agg => intText(readNum(agg, ['graded_calls', 'sample_size', 'n', 'graded'])), 'Graded picks behind every number here.']
];

const PRESEASON_METRICS = [
  ['Locked picks', agg => intText(readNum(agg, ['locked_calls'])), 'Every preseason call locked before puck drop.'],
  ['Graded', agg => intText(readNum(agg, ['graded'])), 'Finished picks with a recorded result.'],
  ['Record', agg => recordText(agg), 'Preseason wins and losses only.'],
  ['Accuracy', agg => rateText(readNum(agg, ['accuracy'])), 'Straight-up preseason accuracy.'],
  ['Priced', agg => intText(readNum(agg, ['priced'])), 'Preseason calls with a recorded market price.'],
  ['UNPRICED', agg => intText(readNum(agg, ['unpriced'])), 'Preseason calls without a qualifying price at lock.']
];

function modelRows(data) {
  const rows = readKey(data, ['by_model_version', 'model_versions', 'models', 'per_model_version']);
  return Array.isArray(rows) ? rows : [];
}

function regularAggregate(data, modelVersion, season) {
  if (!data) return null;
  if (modelVersion) {
    const row = modelRows(data).find(r => String(readKey(r, ['model_version'])) === modelVersion);
    if (!row) return null;
    if (season) {
      const seasons = Array.isArray(row.seasons) ? row.seasons : [];
      return seasons.find(r => String(r.season) === String(season)) || null;
    }
    return row.lifetime || row;
  }
  if (season) {
    const matches = modelRows(data)
      .map(row => (Array.isArray(row.seasons) ? row.seasons : []).find(r => String(r.season) === String(season)))
      .filter(Boolean);
    return matches.length === 1 ? matches[0] : null;
  }
  const root = readKey(data, ['lifetime', 'aggregates', 'totals', 'overall']);
  if (root && typeof root === 'object') return root;
  return REGULAR_METRICS.some(([, read]) => read(data) !== null) ? data : null;
}

function preseasonAggregate(data, season) {
  if (!data) return null;
  if (!season) return data;
  const rows = Array.isArray(data.seasons) ? data.seasons : [];
  return rows.find(row => String(row.season) === String(season)) || null;
}

function metricsGrid(metrics, agg, sample) {
  return '<div class="trk-metrics">' + metrics.map(([label, read, help]) => {
    const value = agg ? read(agg) : null;
    return '<div class="trk-metric">' +
      '<span class="trk-metric__k">' + esc(label) + '</span>' +
      '<b class="trk-metric__v mono"' + (value === null ? ' aria-label="No value returned"' : '') + '>' + (value === null ? DASH : esc(value)) + '</b>' +
      '<span class="trk-metric__n micro">' + esc(sample) + '</span>' +
      '<span class="trk-metric__help">' + esc(help) + '</span>' +
    '</div>';
  }).join('') + '</div>';
}

// ------------------------------------------------------------------ ledger
function rowPrice(row) {
  return row && row.price && typeof row.price === 'object' ? row.price : null;
}

const LEDGER_COLUMNS = [
  ['Season', '', row => seasonLabel(readKey(row, ['season']))],
  ['Type', '', row => {
    const type = readNum(row, ['game_type']);
    if (type === 1) return 'PRESEASON';
    if (type === 2) return 'REGULAR';
    if (type === 3) return 'PLAYOFFS';
    return null;
  }],
  ['Locked at', '', row => {
    const at = readKey(row, ['locked_at_utc', 'locked_at', 'lock_time']);
    return at ? dayET(at) + ' ' + timeET(at) : null;
  }],
  ['Game', '', row => readKey(row, ['matchup', 'game', 'game_label'])
    || (readKey(row, ['away']) && readKey(row, ['home'])
      ? readKey(row, ['away']) + ' @ ' + readKey(row, ['home']) : null)
    || (readKey(row, ['away_abbrev']) && readKey(row, ['home_abbrev'])
      ? readKey(row, ['away_abbrev']) + ' @ ' + readKey(row, ['home_abbrev']) : null)],
  ['Pick', '', row => readKey(row, ['pick', 'pick_team', 'selection'])],
  ['Probability', 'num', row => rateText(readNum(row, ['probability', 'p_pick', 'model_probability']))],
  ['Model version', '', row => readKey(row, ['model_version'])],
  ['Price', 'num', row => {
    const p = rowPrice(row);
    const state = p ? readKey(p, ['state']) : readKey(row, ['market_state', 'price_state', 'market_at_lock']);
    if (String(state || '').toUpperCase() === 'UNPRICED') return 'UNPRICED';
    return americanPrice(p ? readKey(p, ['best_price']) : readKey(row, ['recorded_price', 'best_price'])) || (state ? String(state) : null);
  }],
  ['Book', '', row => {
    const p = rowPrice(row);
    return p ? readKey(p, ['best_book']) : readKey(row, ['recorded_book', 'book', 'best_book']);
  }],
  ['Result', '', row => readKey(row, ['result', 'outcome']) || 'PENDING'],
  ['Graded at', '', row => {
    const at = readKey(row, ['graded_at']);
    return at ? dayET(at) + ' ' + timeET(at) : null;
  }]
];

function ledgerRows(data) {
  const rows = readKey(data, ['picks', 'rows', 'items', 'ledger']);
  return Array.isArray(rows) ? rows : [];
}

const apiReason = data => readKey(data, ['detail', 'reason']);
const apiReasonCode = data => readKey(data, ['reason']);

function ledgerTable(state) {
  const rows = ledgerRows(state.ledger);
  const activeRecord = state.segment === 'preseason' ? state.preseasonRecord : state.regularRecord;
  const reason = apiReason(state.ledger) || apiReason(activeRecord);
  const code = apiReasonCode(state.ledger) || apiReasonCode(activeRecord);
  let body;
  if (rows.length) {
    body = rows.map(row => '<tr>' + LEDGER_COLUMNS.map(([, cls, read]) => {
      const value = read(row);
      return '<td class="' + cls + '">' + (value === null || value === undefined ? DASH : esc(String(value))) + '</td>';
    }).join('') + '</tr>').join('');
  } else {
    const message = state.ledgerError
      ? unavailableText(state.ledgerError)
      : reason
        ? String(reason)
        : 'The ledger API returned no rows and no reason.';
    body = '<tr class="trk-ledger__empty"><td colspan="' + LEDGER_COLUMNS.length + '">' +
      '<div class="trk-ledger__msg">' +
        '<b>No picks on this page.</b>' +
        '<span>' + esc(message) + '</span>' +
        '<span class="micro">Reported by the API' + (code ? ' as “' + esc(String(code)) + '”' : '') + '.</span>' +
      '</div>' +
    '</td></tr>';
  }
  return '<div class="table-wrap trk-ledger">' +
    '<table class="pbe-table">' +
      '<thead><tr>' + LEDGER_COLUMNS.map(([label, cls]) => '<th class="' + cls + '" scope="col">' + esc(label) + '</th>').join('') + '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
    '</table>' +
  '</div>';
}

function unavailableText(error) {
  if (error?.kind === 'pipeline_unavailable') {
    const said = error.payload?.error || error.message || '';
    return 'The PBE Picks read API is not served by this gateway yet' + (said ? ', which answered “' + said + '”' : '') + '.';
  }
  const d = describeError(error);
  return d.title + ': ' + d.body;
}

// ------------------------------------------------------------------ static
const RULES = [
  ['Locked before puck drop', 'A prediction is written with its generated and locked timestamps, its line, price, book and model version before the game starts. Nothing is accepted after puck drop.'],
  ['Immutable once locked', 'A database trigger rejects any change to a locked prediction. There are no retroactive edits, not even typo fixes.'],
  ['Grades are append-only', 'A grade is a revision record written next to the prediction. A correction adds a new revision and the full history stays visible.'],
  ['UNPRICED picks', 'If no legitimate quoted price existed at lock, the pick is shown and graded with an UNPRICED tag, and left out of units, ROI, break-even and CLV.'],
  ['Losing models show as losing', 'A model that loses keeps its full public record. Retiring a model does not delete or hide its picks.'],
  ['Hit rate is not edge', 'Beating a league-average hit rate is not an edge. Edge is measured against the break-even rate of the prices actually recorded, and against the closing line.']
];

const SHADOW = [
  ['Expected goals (xG) baseline', 'Shadow only, not validated for release. Never shown as a pick.'],
  ['Shots-on-goal count model', 'Shadow only. Has not passed its release criteria. Never shown as a pick.'],
  ['Goalie saves model', 'Planned. Not built.']
];

// --------------------------------------------------------------- rendering
function segmentRecord(state) {
  return state.segment === 'preseason' ? state.preseasonRecord : state.regularRecord;
}

function segmentRecordError(state) {
  return state.segment === 'preseason' ? state.preseasonRecordError : state.regularRecordError;
}

function segmentRecordMeta(state) {
  return state.segment === 'preseason' ? state.preseasonRecordMeta : state.regularRecordMeta;
}

function seasonValues(state) {
  const values = new Set();
  if (state.segment === 'preseason') {
    for (const row of Array.isArray(state.preseasonRecord?.seasons) ? state.preseasonRecord.seasons : []) {
      if (present(row?.season) !== null) values.add(String(row.season));
    }
    if (!values.size && present(state.preseasonRecord?.season) !== null) values.add(String(state.preseasonRecord.season));
  } else {
    for (const model of modelRows(state.regularRecord)) {
      for (const row of Array.isArray(model?.seasons) ? model.seasons : []) {
        if (present(row?.season) !== null) values.add(String(row.season));
      }
    }
  }
  return [...values].sort((a, b) => Number(b) - Number(a));
}

function segmentAggregate(state) {
  return state.segment === 'preseason'
    ? preseasonAggregate(state.preseasonRecord, state.season)
    : regularAggregate(state.regularRecord, state.modelVersion, state.season);
}

function activeMetrics(state) {
  return state.segment === 'preseason' ? PRESEASON_METRICS : REGULAR_METRICS;
}

function segmentTabs(state) {
  const preCount = intText(readNum(state.preseasonRecord, ['locked_calls'])) || '0';
  const regCount = intText(readNum(regularAggregate(state.regularRecord, '', ''), ['locked_calls'])) || '0';
  return `<div class="chips trk-filter trk-segments" role="group" aria-label="Track record segment">
    <button class="chip" data-segment="preseason" aria-pressed="${String(state.segment === 'preseason')}">Preseason · ${esc(preCount)}</button>
    <button class="chip" data-segment="regular" aria-pressed="${String(state.segment === 'regular')}">Regular Season · ${esc(regCount)}</button>
  </div>`;
}

function seasonFilter(state) {
  const seasons = seasonValues(state);
  if (!seasons.length) return '';
  return `<div class="trk-filter-row">
    <span class="micro">Season</span>
    <div class="chips trk-filter" role="group" aria-label="Filter by season">
      <button class="chip" data-season="" aria-pressed="${String(!state.season)}">All seasons</button>
      ${seasons.map(value => `<button class="chip" data-season="${esc(value)}" aria-pressed="${String(String(state.season || '') === value)}">${esc(seasonLabel(value))}</button>`).join('')}
    </div>
  </div>`;
}

function modelFilter(state) {
  if (state.segment !== 'regular') return '';
  const rows = modelRows(state.regularRecord);
  if (rows.length < 2 && !state.modelVersion) return '';
  const chips = [['', 'All models'], ...rows.map(row => {
    const value = String(readKey(row, ['model_version']) || '');
    return [value, value || DASH];
  })];
  return `<div class="trk-filter-row">
    <span class="micro">Model</span>
    <div class="chips trk-filter" role="group" aria-label="Filter regular-season record by model">
      ${chips.map(([value, label]) => `<button class="chip" data-model="${esc(value)}" aria-pressed="${String((state.modelVersion || '') === value)}">${esc(label)}</button>`).join('')}
    </div>
  </div>`;
}

function heroBlock(state) {
  const agg = segmentAggregate(state);
  const meta = segmentRecordMeta(state);
  const error = segmentRecordError(state);
  if (state.segment === 'preseason') {
    const locked = intText(readNum(agg, ['locked_calls']));
    const graded = intText(readNum(agg, ['graded']));
    const record = agg ? recordText(agg) : null;
    const accuracy = agg ? rateText(readNum(agg, ['accuracy'])) : null;
    const hasRows = Number(locked || 0) > 0;
    return `<div class="trk-hero pbe-panel" data-fresh-scope>
      <div class="trk-hero__copy">
        <span class="pbe-badge pbe-badge--preseason">PRESEASON RECORD</span>
        <h2 class="trk-hero__title">${hasRows ? 'Every preseason pick stays on the board.' : 'No preseason picks locked yet.'}</h2>
        <p>${error
          ? esc(unavailableText(error))
          : 'Preseason is its own permanent track record. These results never roll into the regular-season record, and pending calls stay visible until they are graded.'}</p>
      </div>
      <dl class="trk-status">
        <div><dt>Locked picks</dt><dd class="mono">${locked ?? DASH}</dd></div>
        <div><dt>Graded</dt><dd class="mono">${graded ?? DASH}</dd></div>
        <div><dt>Record</dt><dd class="mono">${record ?? DASH}</dd></div>
        <div><dt>Accuracy</dt><dd class="mono">${accuracy ?? DASH}</dd></div>
      </dl>
      <p class="trk-hero__prov micro">${meta ? freshStamp(meta, { source: 'PBE preseason ledger' }) : 'Read directly from the persisted preseason picks ledger.'}</p>
    </div>`;
  }

  const status = state.regularRecord?.model_status || null;
  const locked = agg ? intText(readNum(agg, ['locked_calls'])) : null;
  const graded = agg ? intText(readNum(agg, ['graded_calls', 'sample_size'])) : null;
  const record = agg ? recordText(agg) : null;
  const hasRows = Number(locked || 0) > 0;
  return `<div class="trk-hero pbe-panel" data-fresh-scope>
    <div class="trk-hero__copy">
      <span class="pbe-badge pbe-badge--model">REGULAR-SEASON RECORD</span>
      <h2 class="trk-hero__title">${hasRows ? 'Every settled regular-season pick stays public.' : 'The regular-season record starts at 0–0.'}</h2>
      <p>${error
        ? esc(unavailableText(error))
        : hasRows
          ? 'Regular-season results are isolated from preseason. Settled official calls remain in the public ledger forever, including retired model versions.'
          : 'No regular-season official picks have been graded yet. This record never inherits preseason wins or losses.'}</p>
    </div>
    <dl class="trk-status">
      <div><dt>Locked picks</dt><dd class="mono">${locked ?? '0'}</dd></div>
      <div><dt>Graded</dt><dd class="mono">${graded ?? '0'}</dd></div>
      <div><dt>Record</dt><dd class="mono">${record ?? '0-0'}</dd></div>
      <div><dt>Current model</dt><dd class="mono">${esc(readKey(status, ['model_version']) || DASH)}</dd></div>
    </dl>
    <p class="trk-hero__prov micro">${meta ? freshStamp(meta, { source: 'PBE official ledger' }) : 'Read directly from the official picks ledger.'}</p>
  </div>`;
}

function summaryBlock(state) {
  const agg = segmentAggregate(state);
  const metrics = activeMetrics(state);
  const sample = state.segment === 'preseason'
    ? (agg ? (intText(readNum(agg, ['graded'])) || '0') + ' graded · preseason only' : 'No preseason aggregate returned')
    : (agg ? (intText(readNum(agg, ['graded_calls', 'sample_size'])) || '0') + ' graded · regular season only' : 'No regular-season aggregate returned');

  return `<div class="trk-block">
    <div class="trk-block__head">
      <h3>${state.segment === 'preseason' ? 'Preseason performance' : 'Regular-season performance'}</h3>
      <span class="micro">${state.season ? esc(seasonLabel(state.season)) : 'All seasons'}${state.modelVersion && state.segment === 'regular' ? ' · ' + esc(state.modelVersion) : ''}</span>
    </div>
    ${seasonFilter(state)}
    ${modelFilter(state)}
    ${metricsGrid(metrics, agg, sample)}
    ${!agg ? `<p class="pbe-note page-note" style="margin-top:12px"><b>No aggregate returned for this filter.</b> Nothing is computed in the browser.</p>` : ''}
  </div>`;
}

function pagination(state) {
  const total = Math.max(0, Number(state.ledger?.total ?? ledgerRows(state.ledger).length ?? 0));
  const pages = Math.max(1, Math.ceil(total / LEDGER_LIMIT));
  const page = Math.min(state.page, pages - 1);
  const start = total ? page * LEDGER_LIMIT + 1 : 0;
  const end = total ? Math.min(total, (page + 1) * LEDGER_LIMIT) : 0;
  return `<div class="trk-pagination" aria-label="Pick history pagination">
    <span class="micro">${total ? `${start}–${end} of ${total} picks · Page ${page + 1} of ${pages}` : '0 picks'}</span>
    <div>
      <button class="pbe-btn pbe-btn--sm" data-page="${Math.max(0, page - 1)}" ${page <= 0 ? 'disabled' : ''}>Previous</button>
      <button class="pbe-btn pbe-btn--sm" data-page="${Math.min(pages - 1, page + 1)}" ${page >= pages - 1 ? 'disabled' : ''}>Next</button>
    </div>
  </div>`;
}

function ledgerBlock(state) {
  const title = state.segment === 'preseason' ? 'Preseason pick history' : 'Regular-season pick history';
  const note = state.segment === 'preseason'
    ? 'Newest first · every locked preseason pick · pending and graded'
    : 'Newest first · every settled official pick · current picks remain on PBE Picks until graded';
  return `<div class="trk-block">
    <div class="trk-block__head"><h3>${title}</h3><span class="micro">${note}</span></div>
    ${ledgerTable(state)}
    ${pagination(state)}
  </div>`;
}

export function trackView(state) {
  const activeError = segmentRecordError(state);
  return `<section class="wrap section trk">
    <div class="section-head section-head--editorial">
      <div><span class="eyebrow">Track Record</span><h2>Every pick. Every season.</h2></div>
      <p>Preseason and regular season are separate records. Every locked call is retained in its own history instead of being reduced to one headline number.</p>
    </div>

    ${segmentTabs(state)}
    ${heroBlock(state)}

    ${activeError ? `<div class="trk-block"><div class="pbe-note page-note"><b>Record feed unavailable.</b> ${esc(unavailableText(activeError))}</div></div>` : ''}

    ${summaryBlock(state)}
    ${ledgerBlock(state)}

    <div class="trk-block">
      <div class="trk-block__head"><h3>Rules the ledger is held to</h3></div>
      <ol class="trk-rules">
        ${RULES.map(([title, text], i) => `<li><span class="trk-rules__n mono">${String(i + 1).padStart(2, '0')}</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div></li>`).join('')}
      </ol>
    </div>

    <div class="trk-block trk-shadow pbe-panel">
      <div class="trk-block__head"><h3>Records never bleed into each other</h3><span class="micro">Preseason ≠ regular season</span></div>
      <p class="dim">Preseason calls have their own permanent ledger. Regular-season official calls have their own permanent ledger. Training-only shadow output outside the approved preseason lane remains internal.</p>
      <ul class="trk-shadow__list">
        ${SHADOW.map(([name, status]) => `<li><b>${esc(name)}</b><span>${esc(status)}</span></li>`).join('')}
      </ul>
      <p class="micro trk-shadow__foot">Method and release criteria: <a class="gold" href="#/methodology">Methodology</a> · Current slate: <a class="gold" href="#/pbe-picks">PBE Picks</a></p>
    </div>
  </section>`;
}

async function preseasonLedgerWithFallback(state, signal) {
  const params = {
    season: state.season || undefined,
    limit: LEDGER_LIMIT,
    offset: state.page * LEDGER_LIMIT
  };
  try {
    return await picksPreseasonLedger(params, { signal, timeout: 9000 });
  } catch (error) {
    if (error?.kind !== 'pipeline_unavailable' && error?.status !== 404) throw error;
    // Compatibility path while the new paginated gateway route rolls out:
    // the existing season-wide endpoint is the same persisted rehearsal view.
    const res = await picksPreseasonHistory({ season: state.season || undefined }, { signal, timeout: 9000 });
    const rows = Array.isArray(res?.data?.games) ? res.data.games.filter(row => row?.is_call === true) : [];
    rows.sort((a, b) => String(b.puck_drop_utc || b.locked_at || '').localeCompare(String(a.puck_drop_utc || a.locked_at || '')));
    const offset = state.page * LEDGER_LIMIT;
    return {
      ...res,
      data: {
        ...(res.data || {}),
        segment: 'preseason',
        count: rows.slice(offset, offset + LEDGER_LIMIT).length,
        total: rows.length,
        limit: LEDGER_LIMIT,
        offset,
        picks: rows.slice(offset, offset + LEDGER_LIMIT),
        compatibility_fallback: true
      }
    };
  }
}

export function mount(root) {
  const state = {
    segment: 'preseason',
    season: '',
    page: 0,
    modelVersion: '',
    preseasonRecord: null, preseasonRecordMeta: null, preseasonRecordError: null,
    regularRecord: null, regularRecordMeta: null, regularRecordError: null,
    ledger: null, ledgerMeta: null, ledgerError: null
  };

  const render = () => { root.innerHTML = trackView(state); };
  render();

  const controller = new AbortController();
  const { signal } = controller;

  const loadPreseasonRecord = () => picksPreseasonRecord({}, { signal, timeout: 9000 })
    .then(res => {
      state.preseasonRecord = res.data;
      state.preseasonRecordMeta = res.meta;
      state.preseasonRecordError = null;
    })
    .catch(error => {
      if (error?.kind !== 'aborted') {
        state.preseasonRecord = null;
        state.preseasonRecordError = error;
      }
    })
    .then(render);

  const loadRegularRecord = () => picksTrackRecord({}, { signal, timeout: 9000 })
    .then(res => {
      state.regularRecord = res.data;
      state.regularRecordMeta = res.meta;
      state.regularRecordError = null;
    })
    .catch(error => {
      if (error?.kind !== 'aborted') {
        state.regularRecord = null;
        state.regularRecordError = error;
      }
    })
    .then(render);

  const loadLedger = () => {
    state.ledgerError = null;
    const request = state.segment === 'preseason'
      ? preseasonLedgerWithFallback(state, signal)
      : picksLedger({
          model_version: state.modelVersion || undefined,
          season: state.season || undefined,
          limit: LEDGER_LIMIT,
          offset: state.page * LEDGER_LIMIT
        }, { signal, timeout: 9000 });

    return request
      .then(res => {
        state.ledger = res.data;
        state.ledgerMeta = res.meta;
        state.ledgerError = null;
      })
      .catch(error => {
        if (error?.kind !== 'aborted') {
          state.ledger = null;
          state.ledgerError = error;
        }
      })
      .then(render);
  };

  loadPreseasonRecord();
  loadRegularRecord();
  loadLedger();

  const disposers = [
    on(root, 'click', '[data-segment]', (_, btn) => {
      const segment = btn.dataset.segment === 'regular' ? 'regular' : 'preseason';
      if (segment === state.segment) return;
      state.segment = segment;
      state.season = '';
      state.modelVersion = '';
      state.page = 0;
      state.ledger = null;
      render();
      loadLedger();
    }),
    on(root, 'click', '[data-season]', (_, btn) => {
      state.season = btn.dataset.season || '';
      state.page = 0;
      state.ledger = null;
      render();
      loadLedger();
    }),
    on(root, 'click', '[data-model]', (_, btn) => {
      state.modelVersion = btn.dataset.model || '';
      state.page = 0;
      state.ledger = null;
      render();
      loadLedger();
    }),
    on(root, 'click', '[data-page]', (_, btn) => {
      if (btn.disabled) return;
      const page = Number(btn.dataset.page);
      if (!Number.isInteger(page) || page < 0 || page === state.page) return;
      state.page = page;
      state.ledger = null;
      render();
      loadLedger();
    })
  ];

  return () => {
    controller.abort();
    disposers.forEach(dispose => dispose());
  };
}
