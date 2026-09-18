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
import { describeError, picksLedger, picksTrackRecord } from '../lib/api.js';
import { freshStamp } from '../lib/freshness.js';
import { dayET, pct, timeET } from '../lib/format.js';

const DASH = '—';
const LEDGER_LIMIT = 50;

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

const METRICS = [
  ['Locked calls', agg => intText(readNum(agg, ['locked_calls', 'locked', 'n_locked', 'locked_picks'])), 'Official picks locked before puck drop.'],
  ['Record', agg => recordText(agg), 'Wins-losses, plus pushes and voids when the API reports them.'],
  ['Hit rate (SU)', agg => rateText(readNum(agg, ['hit_rate', 'su_hit_rate', 'straight_up_hit_rate'])), 'Straight-up accuracy. UNPRICED picks are counted here.'],
  ['Brier', agg => fixed(readNum(agg, ['brier', 'brier_score'])), 'Calibration of the published probability. Lower is better.'],
  ['Log loss', agg => fixed(readNum(agg, ['log_loss', 'logloss'])), 'Penalty for confident misses. Lower is better.'],
  ['Priced', agg => intText(readNum(agg, ['priced', 'priced_count', 'priced_picks'])), 'Picks with a legitimate quoted price at lock.'],
  ['UNPRICED', agg => intText(readNum(agg, ['unpriced', 'unpriced_count', 'unpriced_picks'])), 'No quoted price at lock. Graded, but excluded from ROI and CLV.'],
  ['ROI', agg => signedText(readNum(agg, ['roi', 'roi_units', 'return_on_investment'])), 'Over priced picks only, as returned by the API.'],
  ['CLV', agg => signedText(readNum(agg, ['clv', 'avg_clv', 'clv_avg', 'mean_clv'])), 'Recorded price against captured closing price, priced picks only.'],
  ['Sample size', agg => intText(readNum(agg, ['sample_size', 'n', 'graded'])), 'Graded picks behind every number here.']
];

function aggregatesOf(data, modelVersion) {
  if (!data) return null;
  if (modelVersion) {
    const row = modelRows(data).find(r => String(readKey(r, ['model_version'])) === modelVersion);
    return row || null;
  }
  const root = readKey(data, ['lifetime', 'aggregates', 'totals', 'overall']);
  if (root && typeof root === 'object') return root;
  // Some shapes put the aggregate fields on the response itself.
  return METRICS.some(([, read]) => read(data) !== null) ? data : null;
}

function modelRows(data) {
  const rows = readKey(data, ['by_model_version', 'model_versions', 'models', 'per_model_version']);
  return Array.isArray(rows) ? rows : [];
}

function metricsGrid(agg, sample) {
  return `<div class="trk-metrics">
    ${METRICS.map(([label, read, help]) => {
      const value = agg ? read(agg) : null;
      return `<div class="trk-metric">
        <span class="trk-metric__k">${esc(label)}</span>
        <b class="trk-metric__v mono"${value === null ? ' aria-label="No value returned"' : ''}>${value === null ? DASH : esc(value)}</b>
        <span class="trk-metric__n micro">${esc(sample)}</span>
        <span class="trk-metric__help">${esc(help)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// ------------------------------------------------------------------ ledger
const LEDGER_COLUMNS = [
  ['Locked at', '', row => {
    const at = readKey(row, ['locked_at_utc', 'locked_at', 'lock_time']);
    return at ? `${dayET(at)} ${timeET(at)}` : null;
  }],
  ['Game', '', row => readKey(row, ['matchup', 'game', 'game_label'])
    || (readKey(row, ['away_abbrev']) && readKey(row, ['home_abbrev'])
      ? `${readKey(row, ['away_abbrev'])} @ ${readKey(row, ['home_abbrev'])}` : null)],
  ['Pick', '', row => readKey(row, ['pick', 'pick_team', 'selection'])],
  ['Probability', 'num', row => rateText(readNum(row, ['probability', 'p_pick', 'model_probability']))],
  ['Model version', '', row => readKey(row, ['model_version'])],
  ['Price', 'num', row => {
    const state = readKey(row, ['market_state', 'price_state']);
    if (String(state).toUpperCase() === 'UNPRICED') return 'UNPRICED';
    return americanPrice(readKey(row, ['recorded_price', 'price', 'best_price'])) || (state ? String(state) : null);
  }],
  ['Book', '', row => readKey(row, ['recorded_book', 'book', 'best_book'])],
  ['Closing', 'num', row => americanPrice(readKey(row, ['closing_price', 'close_price']))],
  ['Result', '', row => readKey(row, ['result', 'outcome'])],
  ['Grade rev', 'num', row => intText(readNum(row, ['grade_revision', 'revision']))]
];

function ledgerRows(data) {
  const rows = readKey(data, ['picks', 'rows', 'items', 'ledger']);
  return Array.isArray(rows) ? rows : [];
}

// nhl-picks-read-v1 answers with a machine `reason` code plus a human `detail`.
// The page shows the sentence the API wrote and keeps its code beside it; it
// never substitutes wording of its own.
const apiReason = data => readKey(data, ['detail', 'reason']);
const apiReasonCode = data => readKey(data, ['reason']);

function ledgerTable(state) {
  const rows = ledgerRows(state.ledger);
  const reason = apiReason(state.ledger) || apiReason(state.record);
  const code = apiReasonCode(state.ledger) || apiReasonCode(state.record);
  let body;
  if (rows.length) {
    body = rows.map(row => `<tr>${LEDGER_COLUMNS.map(([, cls, read]) => {
      const value = read(row);
      return `<td class="${cls}">${value === null || value === undefined ? DASH : esc(String(value))}</td>`;
    }).join('')}</tr>`).join('');
  } else {
    const message = state.ledgerError
      ? unavailableText(state.ledgerError)
      : reason
        ? String(reason)
        : 'The ledger API returned no rows and no reason.';
    body = `<tr class="trk-ledger__empty"><td colspan="${LEDGER_COLUMNS.length}">
      <div class="trk-ledger__msg">
        <b>No locked, graded picks are published.</b>
        <span>${esc(message)}</span>
        <span class="micro">Reported by the API${code ? ` as “${esc(String(code))}”` : ''}, not written into this page.</span>
      </div>
    </td></tr>`;
  }
  return `<div class="table-wrap trk-ledger">
    <table class="pbe-table">
      <thead><tr>${LEDGER_COLUMNS.map(([label, cls]) => `<th class="${cls}" scope="col">${esc(label)}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function unavailableText(error) {
  if (error?.kind === 'pipeline_unavailable') {
    const said = error.payload?.error || error.message || '';
    return `The PBE Picks read API is not served by this gateway yet${said ? `, which answered “${said}”` : ''}.`;
  }
  const d = describeError(error);
  return `${d.title}: ${d.body}`;
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
function heroBlock(state) {
  const agg = aggregatesOf(state.record, null);
  const status = state.record?.model_status || null;
  const locked = agg ? intText(readNum(agg, ['locked_calls', 'locked', 'n_locked', 'locked_picks'])) : null;
  const versions = modelRows(state.record).length;
  const reason = apiReason(state.record);
  const unavailable = Boolean(state.recordError);
  const hasRows = Boolean(locked && Number(locked) > 0) || ledgerRows(state.ledger).length > 0;

  return `<div class="trk-hero pbe-panel" data-fresh-scope>
    <div class="trk-hero__copy">
      <span class="pbe-badge pbe-badge--${unavailable ? 'unavailable' : hasRows ? 'model' : 'heuristic'}">${unavailable ? 'Ledger feed unavailable' : hasRows ? 'Public record live' : 'No picks locked'}</span>
      <h2 class="trk-hero__title">${hasRows ? 'Every locked call, graded in public.' : 'No NHL predictions have been locked yet.'}</h2>
      <p>${esc(unavailable
        ? unavailableText(state.recordError)
        : reason
          ? String(reason)
          : hasRows
            ? 'Winners and losers, retired model versions included. Nothing is removed once it is written.'
            : 'The API reports no locked, graded picks and gave no reason. Nothing is backfilled, simulated or estimated here.')}</p>
    </div>
    <dl class="trk-status">
      <div><dt>Locked predictions</dt><dd class="mono">${locked === null ? DASH : esc(locked)}</dd></div>
      <div><dt>Model versions with a record</dt><dd class="mono">${state.record ? versions : DASH}</dd></div>
      <div><dt>Current model</dt><dd class="mono">${esc(readKey(status, ['model_version']) || DASH)}</dd></div>
      <div><dt>Publishable</dt><dd>${status && typeof status.publishable === 'boolean' ? (status.publishable ? 'Yes' : 'No') : DASH}</dd></div>
    </dl>
    <p class="trk-hero__prov micro">${state.recordMeta ? freshStamp(state.recordMeta, { source: 'PBE Picks ledger' }) : 'Read directly from the picks ledger API on every page view.'}</p>
  </div>`;
}

function modelBreakdown(state) {
  const rows = modelRows(state.record);
  const chips = [['', 'All versions'], ...rows.map(r => {
    const v = String(readKey(r, ['model_version']) || '');
    return [v, v || DASH];
  })];
  const agg = aggregatesOf(state.record, state.modelVersion);
  const sample = agg ? `${intText(readNum(agg, ['sample_size', 'n', 'graded'])) ?? DASH} graded` : 'no aggregate returned';
  return `<div class="trk-block">
    <div class="trk-block__head"><h3>${state.modelVersion ? `Model ${esc(state.modelVersion)}` : 'Lifetime'}</h3>
      <span class="micro">${esc(state.modelVersion ? 'One model version' : 'All official model versions')}</span></div>
    ${rows.length > 1 || state.modelVersion ? `<div class="chips trk-filter" role="group" aria-label="Filter by model version">
      ${chips.map(([value, label]) => `<button class="chip" data-model="${esc(value)}" aria-pressed="${String((state.modelVersion || '') === value)}">${esc(label)}</button>`).join('')}
    </div>` : ''}
    ${metricsGrid(agg, sample)}
    ${state.record && !agg ? `<p class="pbe-note page-note" style="margin-top:12px"><b>No aggregate block was returned${state.modelVersion ? ' for this model version' : ''}.</b> Nothing is computed in the browser, so no numbers are shown.</p>` : ''}
    ${rows.length ? `<div class="table-wrap trk-ledger" style="margin-top:16px">
      <table class="pbe-table">
        <thead><tr><th scope="col">Model version</th>${METRICS.slice(0, 7).map(([label]) => `<th class="num" scope="col">${esc(label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr><td class="mono">${esc(readKey(r, ['model_version']) || DASH)}</td>${METRICS.slice(0, 7).map(([, read]) => {
          const v = read(r);
          return `<td class="num">${v === null ? DASH : esc(v)}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>` : ''}
  </div>`;
}

export function trackView(state) {
  return `<section class="wrap section trk">
    <div class="section-head section-head--editorial"><div><span class="eyebrow">Track Record</span><h2>The public ledger</h2></div>
      <p>Every NHL pick PropBetEdge publishes is locked before puck drop, graded in public and kept forever, winners and losers alike.</p></div>

    ${heroBlock(state)}

    ${state.recordError ? `<div class="trk-block">${`<div class="pbe-note page-note"><b>Aggregates unavailable.</b> ${esc(unavailableText(state.recordError))} No figure is shown in its place.</div>`}</div>` : ''}

    ${modelBreakdown(state)}

    <div class="trk-block">
      <div class="trk-block__head"><h3>Ledger</h3><span class="micro">Newest first · every locked pick${state.modelVersion ? ` · ${esc(state.modelVersion)}` : ''}</span></div>
      ${ledgerTable(state)}
      ${ledgerRows(state.ledger).length >= LEDGER_LIMIT ? `<p class="micro" style="margin-top:10px">Showing the newest ${LEDGER_LIMIT} rows returned by the API.</p>` : ''}
    </div>

    <div class="trk-block">
      <div class="trk-block__head"><h3>Rules the ledger is held to</h3></div>
      <ol class="trk-rules">
        ${RULES.map(([title, text], i) => `<li><span class="trk-rules__n mono">${String(i + 1).padStart(2, '0')}</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div></li>`).join('')}
      </ol>
    </div>

    <div class="trk-block trk-shadow pbe-panel">
      <div class="trk-block__head"><h3>Shadow models stay internal</h3><span class="micro">Not picks · not counted here</span></div>
      <p class="dim">Models in training are scored in private against out-of-time data. They are never shown as picks and never enter this ledger until they are released with a model version.</p>
      <ul class="trk-shadow__list">
        ${SHADOW.map(([name, status]) => `<li><b>${esc(name)}</b><span>${esc(status)}</span></li>`).join('')}
      </ul>
      <p class="micro trk-shadow__foot">Method and release criteria: <a class="gold" href="#/methodology">Methodology</a> · Tonight's slate: <a class="gold" href="#/pbe-picks">PBE Picks</a></p>
    </div>
  </section>`;
}

export function mount(root) {
  const state = {
    modelVersion: '',
    record: null, recordMeta: null, recordError: null,
    ledger: null, ledgerMeta: null, ledgerError: null
  };
  const render = () => { root.innerHTML = trackView(state); };
  render();

  const controller = new AbortController();
  const { signal } = controller;

  const loadRecord = () => picksTrackRecord({}, { signal, timeout: 9000 })
    .then(res => { state.record = res.data; state.recordMeta = res.meta; state.recordError = null; })
    .catch(error => { if (error?.kind !== 'aborted') { state.record = null; state.recordError = error; } })
    .then(render);

  const loadLedger = () => picksLedger({ model_version: state.modelVersion || undefined, limit: LEDGER_LIMIT }, { signal, timeout: 9000 })
    .then(res => { state.ledger = res.data; state.ledgerMeta = res.meta; state.ledgerError = null; })
    .catch(error => { if (error?.kind !== 'aborted') { state.ledger = null; state.ledgerError = error; } })
    .then(render);

  loadRecord();
  loadLedger();

  const dispose = on(root, 'click', '[data-model]', (_, btn) => {
    state.modelVersion = btn.dataset.model || '';
    state.ledger = null;
    render();
    loadLedger();
  });

  return () => { controller.abort(); dispose(); };
}
