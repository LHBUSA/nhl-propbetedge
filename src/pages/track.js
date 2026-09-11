import { esc } from '../lib/dom.js';

// Track Record. Fact checked 2026-09-11 against the prediction store:
// nhl_predictions has 0 rows and no NHL model is released. There is no read
// API for predictions yet, so this page renders the commitment and an honest,
// empty ledger. It must never show sample rows or zero-valued "results".

const CHECKED_AT = 'Sep 11, 2026';

const LEDGER_COLUMNS = [
  ['Locked at', ''], ['Game', ''], ['Player', ''], ['Market', ''], ['Side', ''],
  ['Line', 'num'], ['Price', 'num'], ['Book', ''], ['Model version', ''], ['Generated', ''],
  ['Result', ''], ['Actual', 'num'], ['Closing line', 'num'], ['CLV', 'num'], ['Grade', '']
];

const METRICS = [
  ['Graded picks', 'Locked picks with a final grade.'],
  ['Record', 'W-L-P-V: wins, losses, pushes, voids.'],
  ['Hit rate', 'Wins ÷ (wins + losses). Pushes and voids excluded.'],
  ['Units · ROI', 'Profit at the recorded price, one unit per pick.'],
  ['Break-even rate', 'The hit rate the recorded prices require.'],
  ['Vs break-even', 'Hit rate minus break-even rate.'],
  ['Average CLV', 'Recorded price against the captured closing price.'],
  ['Sample size', 'Graded picks behind every number here.']
];

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

export function mount(root) {
  root.innerHTML = `<section class="wrap section trk">
    <div class="section-head section-head--editorial"><div><span class="eyebrow">Track Record</span><h2>The public ledger</h2></div>
      <p>Every NHL pick PropBetEdge publishes will be locked before puck drop, graded in public and kept forever, winners and losers alike.</p></div>

    <div class="trk-hero pbe-panel">
      <div class="trk-hero__copy">
        <span class="pbe-badge pbe-badge--unavailable">No picks locked</span>
        <h2 class="trk-hero__title">No NHL predictions have been locked yet.</h2>
        <p>No NHL model has been released, so there is nothing to grade. We will not backfill, simulate or show hypothetical results. The first row appears here when a released model locks a pick before puck drop.</p>
      </div>
      <dl class="trk-status">
        <div><dt>Locked predictions</dt><dd class="mono">0</dd></div>
        <div><dt>Released NHL models</dt><dd>None</dd></div>
        <div><dt>Ledger feed</dt><dd>Not built yet</dd></div>
        <div><dt>Last checked</dt><dd class="mono">${esc(CHECKED_AT)}</dd></div>
      </dl>
      <p class="trk-hero__prov micro">Status is a dated check of the prediction store, not a live read. This page will read the ledger directly once its read API exists.</p>
    </div>

    <div class="trk-block">
      <div class="trk-block__head"><h3>What the ledger will measure</h3><span class="micro">Nothing graded · no values shown</span></div>
      <div class="trk-metrics">
        ${METRICS.map(([label, help]) => `<div class="trk-metric">
          <span class="trk-metric__k">${esc(label)}</span>
          <b class="trk-metric__v mono" aria-label="No value">—</b>
          <span class="trk-metric__n micro">0 graded</span>
          <span class="trk-metric__help">${esc(help)}</span>
        </div>`).join('')}
      </div>
    </div>

    <div class="trk-block">
      <div class="trk-block__head"><h3>Ledger</h3><span class="micro">Newest first · every locked pick</span></div>
      <div class="table-wrap trk-ledger">
        <table class="pbe-table">
          <thead><tr>${LEDGER_COLUMNS.map(([label, cls]) => `<th class="${cls}" scope="col">${esc(label)}</th>`).join('')}</tr></thead>
          <tbody>
            <tr class="trk-ledger__empty"><td colspan="${LEDGER_COLUMNS.length}">
              <div class="trk-ledger__msg">
                <b>No locked predictions.</b>
                <span>Rows appear here only after a released, versioned model locks a pick before puck drop.</span>
              </div>
            </td></tr>
          </tbody>
        </table>
      </div>
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
      <p class="micro trk-shadow__foot">Method and release criteria: <a class="gold" href="#/methodology">Methodology</a></p>
    </div>
  </section>`;
  return () => {};
}
