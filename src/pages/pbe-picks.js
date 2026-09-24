// PBE PICKS — the flagship prediction surface.
//
// Contract: propsports-api-worker/docs/NHL_PBE_PICKS_API_CONTRACT.md.
//
// The rule this page is built around: `pbe-nhl-model-v1.1` is a
// `shadow_candidate` with `publishable: false`. There is no champion model, no
// official pick and no public record. So this page renders the REAL product
// structure — the slate, the model status, the lock pipeline, what a PBE Pick
// is and what NHL Pro adds — and it never invents a pick, a probability or a
// prediction state. Every value on screen came out of an API response; anything
// the API did not return renders as an em dash with its label still visible, so
// a missing field reads as missing rather than as zero.
//
// Free vs Pro: the public slate/health routes are called with no credentials
// (src/lib/api.js). Pick values live only behind /pro/*, which is reached ONLY
// through src/lib/account.js and ONLY when the gateway has already told us the
// account state is `pro`. A signed-out or unentitled viewer never causes a
// /pro/ request, and the free render path has no pick values to leak because
// nothing ever writes them into state.
import { esc, on } from '../lib/dom.js';
import { describeError, picksHealth, picksPreseason, picksPreseasonRecord, picksSlate } from '../lib/api.js';
import { onAccount, proData, refreshAccount, signInAvailable } from '../lib/account.js';
import { accountMembership, membershipBadgeHtml, picksProHeading } from '../lib/pro-membership-ui.js';
import { freshStamp } from '../lib/freshness.js';
import { addDays, ageText, dateLabel, dayET, gameTypeLabel, pct, timeET, timeLocal, todayET } from '../lib/format.js';
import { stateOf, teamMark } from '../components/game.js';
import { teamAccent } from '../lib/teams.js';

const DASH = '—';

// ------------------------------------------------------------------ reading
// Nothing below invents a value: a key that is absent returns null and every
// renderer turns null into DASH.
const present = value => (value === null || value === undefined || value === '' ? null : value);

function readKey(source, keys) {
  if (!source || typeof source !== 'object') return null;
  for (const key of keys) {
    const value = present(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function readNum(source, keys) {
  return numeric(readKey(source, keys));
}

// A probability is only rendered when it really is one. A value outside the
// unit interval is a scale we have not agreed with the API, so it renders as
// unavailable rather than as a wrong percentage.
// Number(null) and Number('') are 0, so every numeric formatter below refuses
// an absent value BEFORE coercion. An absent probability must read as absent,
// never as zero.
const numeric = value => {
  if (present(value) === null || typeof value === 'boolean') return null;
  const v = Number(value);
  return Number.isFinite(v) ? v : null;
};

export function probabilityText(value) {
  const v = numeric(value);
  if (v === null || v < 0 || v > 1) return null;
  return pct(v);
}

export function americanPrice(value) {
  const v = numeric(value);
  if (v === null) return null;
  return v > 0 ? `+${v}` : String(v);
}

function signed(value, digits = 1) {
  const v = numeric(value);
  if (v === null) return null;
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
}

// ------------------------------------------------------------ model status
// `model_status` rides on every picks response: { model_version, status,
// publishable, official_model, shadow_running, lock_policy_version }.
export function modelStatusOf(...sources) {
  for (const source of sources) {
    const status = source?.model_status;
    if (status && typeof status === 'object') return status;
  }
  return null;
}

export function hasOfficialModel(status) {
  if (!status) return false;
  return status.publishable === true && Boolean(present(status.official_model));
}

const PREDICTION_TONE = {
  LOCKED_OFFICIAL: 'model',
  // A rehearsal is a REAL locked call from the pipeline, but never an official
  // pick. It gets its own state so it can never be rendered as either an
  // official pick or hidden internal output.
  LOCKED_REHEARSAL: 'rehearsal',
  LOCKED_INTERNAL: 'heuristic',
  SNAPSHOT_READY: 'sched',
  NONE: 'unavailable'
};

// ------------------------------------------------------------------- games
// The picks slate is authoritative for prediction state. Real game identity
// (teams, venue, live state) comes from the public Ice Board route the rest of
// the app already uses, so the page shows genuine games even while the picks
// pipeline is absent — with the prediction state honestly marked unavailable.
export function mergeSlate({ slate, board, pro }) {
  const boardGames = Array.isArray(board?.games) ? board.games : [];
  const boardById = new Map(boardGames.map(g => [String(g.id), g]));
  const slateGames = Array.isArray(slate?.games) ? slate.games : [];
  const proPicks = Array.isArray(pro?.picks) ? pro.picks : [];
  const proById = new Map(proPicks.map(p => [String(p.game_id ?? p.id ?? ''), p]));

  const rows = slateGames.length
    ? slateGames.map(g => {
      const id = String(g.game_id ?? g.id ?? '');
      return { id, slate: g, board: boardById.get(id) || null };
    })
    : boardGames.map(g => ({ id: String(g.id), slate: null, board: g }));

  return rows.map(row => {
    const s = row.slate || {};
    const b = row.board || {};
    // nhl-picks-read-v1 puts home/away at the top of the game object and carries
    // only abbrev + name; the Ice Board route nests them under `teams` and adds
    // the official logo. Both are the NHL's own identity data, so the two are
    // merged with the board on top. Nothing is synthesised either way.
    const boardTeams = (b.teams && typeof b.teams === 'object') ? b.teams : {};
    const slateTeams = (s.home || s.away)
      ? { home: s.home || {}, away: s.away || {} }
      : (s.teams && typeof s.teams === 'object' ? s.teams : {});
    const teams = {
      home: { ...(slateTeams.home || {}), ...(boardTeams.home || {}) },
      away: { ...(slateTeams.away || {}), ...(boardTeams.away || {}) }
    };
    return {
      id: row.id,
      away: teams.away || {},
      home: teams.home || {},
      start_utc: present(s.start_utc) || present(b.start_time_utc) || null,
      game_type: present(b.game_type),
      venue: present(b.venue),
      // stateOf() needs the Ice Board status envelope; the picks slate carries a
      // plain `state` word, which is rendered verbatim when that is all we have.
      boardState: row.board ? stateOf(row.board) : null,
      slateState: present(s.state),
      prediction_state: present(s.prediction_state),
      lock_window: s.lock_window && typeof s.lock_window === 'object' ? s.lock_window : present(s.lock_window),
      // Pro values, and only Pro values, live here.
      pick: proById.get(row.id) || null
    };
  });
}

// --------------------------------------------------------------- data load
// Injectable readers so the Pro boundary can be proven in a test without a
// browser: a signed-out account must never reach proSlate.
export const proEligible = account => account?.state === 'pro';

export async function loadPicksData({
  date,
  account,
  signal,
  publicSlate = (d, o) => picksSlate(d, o),
  publicHealth = o => picksHealth(o),
  proSlate = (d) => proData(`/pro/picks/slate?date=${encodeURIComponent(d)}`),
  publicPreseason = (d, o) => picksPreseason(d, o),
  publicPreseasonRecord = o => picksPreseasonRecord({}, o)
} = {}) {
  const settle = promise => promise.then(value => ({ value, error: null }), error => ({ value: null, error }));
  const [slate, health, preseason, preseasonRecord] = await Promise.all([
    settle(publicSlate(date, { signal, timeout: 9000 })),
    settle(publicHealth({ signal, timeout: 9000 })),
    settle(publicPreseason(date, { signal, timeout: 9000 })),
    settle(publicPreseasonRecord({ signal, timeout: 9000 }))
  ]);
  const out = {
    slate: slate.value?.data || null,
    slateMeta: slate.value?.meta || null,
    slateError: slate.error || null,
    health: health.value?.data || null,
    healthMeta: health.value?.meta || null,
    healthError: health.error || null,
    pro: null,
    proError: null,
    proRequested: false,
    preseason: preseason.value?.data || null,
    preseasonError: preseason.error || null,
    preseasonRecord: preseasonRecord.value?.data || null,
    splitSquad: []
  };
  if (!proEligible(account)) return out;
  out.proRequested = true;
  try {
    const res = await proSlate(date);
    // A non-200 carries no protected values by construction (account.js).
    out.pro = res?.ok ? res.data : null;
    if (!res?.ok) out.proError = res?.data?.error || `pro slate unavailable (HTTP ${res?.status ?? DASH})`;
  } catch (error) {
    out.proError = String(error?.message || error);
  }
  return out;
}

// ------------------------------------------------------------------ pieces
// The pipeline being absent is ONE fact, so it is stated once at the top of the
// page. Individual blocks then just show their labels with em dashes rather
// than repeating the same paragraph five times.
export function pipelineDown(state) {
  for (const error of [state.slateError, state.healthError]) {
    if (error?.kind === 'pipeline_unavailable') return error;
  }
  return null;
}

function pipelineBanner(error) {
  if (!error) return '';
  const said = error.payload?.error || error.message || '';
  return `<div class="pbe-note pks-note"><b>The PBE Picks pipeline is not available in this environment.</b>
    The gateway this build points at does not serve the picks read API yet${said ? `, and answered “${esc(said)}”` : ''}.
    So there is no model status, no prediction state and no lock window to show below — those fields are blank, not zero,
    and nothing on this page has been filled in to cover the gap.</div>`;
}

function errorNote(error, what, { quiet = false } = {}) {
  if (!error || (quiet && error.kind === 'pipeline_unavailable')) return '';
  if (error.kind === 'pipeline_unavailable') {
    const said = error.payload?.error || error.message || '';
    return `<div class="pbe-note pks-note"><b>${esc(what)} is not available in this environment.</b>
      The PBE Picks read API is not served by this gateway yet${said ? `, which answered “${esc(said)}”` : ''}.
      Nothing is filled in, and no prediction state is assumed.</div>`;
  }
  const d = describeError(error);
  return `<div class="pbe-error"><strong>${esc(d.title)}</strong>${esc(d.body)}</div>`;
}

function statusRow(label, value, note = '') {
  return `<div><dt>${esc(label)}</dt><dd class="mono">${value === null || value === undefined ? DASH : esc(String(value))}</dd>${note ? `<dd class="pks-kv__note micro">${esc(note)}</dd>` : ''}</div>`;
}

export function consumerModelStatus(state) {
  const status = modelStatusOf(state.slate, state.health);
  const version = status ? readKey(status, ['model_version']) : null;
  if (!isPreseasonPickMode(state)) return '';
  return `<div class="pks-modelmini">
    <div><dt>Model</dt><dd>${esc(consumerModelName(version))}</dd></div>
    <div><dt>Mode</dt><dd>Preseason</dd></div>
    <div><dt>Status</dt><dd>Active</dd></div>
  </div>`;
}

export function modelStatusBlock(state, { quiet = false } = {}) {
  const status = modelStatusOf(state.slate, state.health);
  const official = hasOfficialModel(status);
  const version = status ? readKey(status, ['model_version']) : null;
  const lifecycle = status ? readKey(status, ['status']) : null;
  const publishable = status && typeof status.publishable === 'boolean' ? (status.publishable ? 'YES' : 'NO') : null;
  const officialModel = status ? readKey(status, ['official_model']) : null;
  const shadow = status && typeof status.shadow_running === 'boolean' ? (status.shadow_running ? 'RUNNING' : 'STOPPED') : null;
  const policy = status ? readKey(status, ['lock_policy_version']) : null;

  const headline = !status
    ? 'Model status unavailable'
    : official
      ? 'An official model is publishing picks'
      : 'No official model — nothing is published as a pick';

  return `<section class="pks-block" aria-labelledby="pks-model-h">
    <div class="pks-block__head">
      <div><span class="eyebrow">Model status</span><h2 id="pks-model-h">${esc(headline)}</h2></div>
      <span class="pbe-badge pbe-badge--${official ? 'model' : status ? 'heuristic' : 'unavailable'}">${esc(lifecycle || (status ? 'STATUS UNAVAILABLE' : 'UNAVAILABLE'))}</span>
    </div>
    ${status ? '' : errorNote(state.slateError || state.healthError, 'Model status', { quiet })}
    <dl class="pks-kv">
      ${statusRow('Model version', version)}
      ${statusRow('Lifecycle', lifecycle)}
      ${statusRow('Publishable', publishable, 'A shadow candidate is never published as a pick.')}
      ${statusRow('Official model', officialModel, 'The champion whose picks would be locked and graded in public.')}
      ${statusRow('Shadow run', shadow, 'Shadow output stays behind the admin token and never reaches this page.')}
      ${statusRow('Lock policy', policy)}
      ${(() => {
        const gate = state.slate?.publish_gate || state.health?.publish_gate || null;
        if (!gate || typeof gate !== 'object') return '';
        const open = typeof gate.open === 'boolean' ? (gate.open ? 'OPEN' : 'CLOSED') : null;
        return statusRow('Publish gate', [open, present(gate.reason)].filter(Boolean).join(' · ') || null, 'Decided on the server. A closed gate serves no pick to anyone.');
      })()}
    </dl>
    ${status && !official ? `<p class="pks-block__foot dim">A shadow candidate is scored privately against out-of-time games. It is not a pick, it does not appear on a card, and it does not enter the public record. When a model is promoted to champion, the cards on this page start carrying its selections — the page does not change shape.</p>` : ''}
  </section>`;
}

// The lock pipeline, straight from GET /nhl/picks/health. nhl-picks-read-v1
// nests it as `pipeline: { next_eligible_games, next_lock_window, latest_runs,
// predictions, locks, grading_backlog, stale_blockers, lock_policy }`.
//
// Rows are declared, so a field the API returns as null still shows its label
// with an em dash. 0 is a real answer and is printed as 0; null is not.
function stamp(iso) {
  return iso ? `${dayET(iso)} ${timeET(iso)}` : null;
}

function runText(run) {
  if (run === null || run === undefined) return null;
  if (typeof run !== 'object') return String(run);
  const at = readKey(run, ['finished_at', 'started_at', 'run_at', 'at', 'completed_at']);
  const label = readKey(run, ['status', 'state', 'outcome']);
  return [label ? String(label) : null, stamp(at)].filter(Boolean).join(' · ') || null;
}

function countText(value) {
  if (Array.isArray(value)) return String(value.length);
  const n = numeric(value);
  return n === null ? null : String(n);
}

export function pipelineFacts(health) {
  const pipeline = (health && typeof health.pipeline === 'object' && health.pipeline) || health || null;
  const predictions = (pipeline && typeof pipeline.predictions === 'object' && pipeline.predictions) || pipeline;
  const runs = (pipeline && typeof pipeline.latest_runs === 'object' && pipeline.latest_runs) || {};
  const locks = (pipeline && typeof pipeline.locks === 'object' && pipeline.locks) || {};
  const policy = (pipeline && typeof pipeline.lock_policy === 'object' && pipeline.lock_policy) || null;
  const blockers = readKey(pipeline, ['stale_blockers', 'blockers']);
  const window = readKey(pipeline, ['next_lock_window', 'next_lock']);

  return [
    ['Next eligible games', countText(readKey(pipeline, ['next_eligible_games', 'eligible_games'])), 'Games in scope for the next lock pass.'],
    ['Next lock window', typeof window === 'object' ? lockWindowText(window) : (window === null ? null : String(window)), 'When picks would be frozen before puck drop.'],
    ['Lock target', policy ? (countText(readKey(policy, ['target_lock_minutes_before_start'])) ?? null) : null, 'Minutes before puck drop, from the frozen lock policy.'],
    ['Latest snapshot run', runText(readKey(runs, ['snapshot', 'feature_snapshot'])), 'Feature snapshot build.'],
    ['Latest scoring run', runText(readKey(runs, ['scoring', 'score'])), 'Model scoring pass.'],
    ['Latest grading run', runText(readKey(runs, ['grading', 'grade'])), 'Result grading pass.'],
    ['Predictions expected', countText(readKey(predictions, ['expected', 'predictions_expected'])), ''],
    ['Predictions created', countText(readKey(predictions, ['created', 'predictions_created'])), ''],
    ['Predictions rejected', countText(readKey(predictions, ['rejected', 'predictions_rejected'])), 'Rejected by the lock policy, not silently dropped.'],
    ['Locks · official', countText(readKey(locks, ['official'])), 'Publishable picks frozen before puck drop.'],
    ['Locks · internal shadow', countText(readKey(locks, ['internal_shadow', 'internal'])), 'Never shown as a pick, never in the public record.'],
    ['Grading backlog', countText(readKey(pipeline, ['grading_backlog', 'backlog'])), 'Graded results still owed to the ledger.'],
    ['Stale blockers', Array.isArray(blockers)
      ? (blockers.length
        ? blockers.map(b => (typeof b === 'string' ? b : [readKey(b, ['kind']), readKey(b, ['blocker', 'reason'])].filter(Boolean).join(': '))).join(' · ')
        : 'None')
      : (blockers === null ? null : String(blockers)), 'Inputs the pipeline refuses to lock against.']
  ];
}

export function pipelineBlock(state, { quiet = false } = {}) {
  const health = state.health;
  const gate = health?.publish_gate && typeof health.publish_gate === 'object' ? health.publish_gate : null;
  return `<section class="pks-block" aria-labelledby="pks-pipe-h">
    <div class="pks-block__head">
      <div><span class="eyebrow">Lock pipeline</span><h2 id="pks-pipe-h">What the pipeline is doing</h2></div>
      ${gate ? `<span class="pbe-badge pbe-badge--${gate.open ? 'confirmed' : 'heuristic'}">PUBLISH GATE ${gate.open ? 'OPEN' : 'CLOSED'}${present(gate.reason) ? ` · ${esc(String(gate.reason))}` : ''}</span>` : ''}
      ${health ? freshStamp(state.healthMeta, { source: 'PBE Picks' }) : ''}
    </div>
    ${health ? '' : errorNote(state.healthError, 'Pipeline health', { quiet })}
    <dl class="pks-kv pks-kv--wide">
      ${pipelineFacts(health).map(([label, value, note]) => statusRow(label, value, note)).join('')}
    </dl>
  </section>`;
}

// --------------------------------------------------------------- game card
// nhl-picks-read-v1: { opens_utc, target_utc, closes_utc, policy_version }.
function lockWindowText(lock) {
  if (lock === null || lock === undefined) return null;
  if (typeof lock === 'string') return lock;
  const label = readKey(lock, ['state', 'status']);
  const opens = readKey(lock, ['opens_utc', 'opens_at', 'start_utc']);
  const target = readKey(lock, ['target_utc', 'target_at']);
  const closes = readKey(lock, ['closes_utc', 'closes_at', 'end_utc', 'lock_at_utc', 'locks_at_utc']);
  const parts = [
    label ? String(label) : null,
    opens ? `opens ${timeET(opens)}` : null,
    target ? `target ${timeET(target)}` : null,
    closes ? `closes ${timeET(closes)}` : null
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function teamRow(team, { probability = null, selected = false } = {}) {
  const prob = probabilityText(probability);
  return `<div class="pkc-team${selected ? ' is-picked' : ''}">
    ${teamMark(team, 34)}
    <div class="pkc-team__id"><b>${esc(team.abbrev || 'TBD')}</b><span>${esc(team.name || team.place || '')}</span></div>
    ${prob ? `<div class="pkc-team__p mono" title="Model probability">${esc(prob)}</div>` : ''}
    ${selected ? '<span class="pbe-badge pbe-badge--model">PBE PICK</span>' : ''}
  </div>`;
}

function marketBlock(market) {
  if (!market || typeof market !== 'object') return '';
  const marketState = readKey(market, ['state']);
  const capturedAt = readKey(market, ['captured_at']);
  const age = readNum(market, ['age_seconds']);
  const cells = [
    ['Best price', americanPrice(readKey(market, ['best_price']))],
    ['Book', readKey(market, ['best_book'])],
    ['Consensus', americanPrice(readKey(market, ['consensus_price']))],
    ['Books', readNum(market, ['book_count'])],
    ['Market prob', probabilityText(readKey(market, ['market_prob']))],
    ['No-vig prob', probabilityText(readKey(market, ['no_vig_prob']))],
    ['PBE prob', probabilityText(readKey(market, ['pbe_prob']))],
    ['Delta', signed(readKey(market, ['delta_pts']))]
  ].filter(([, v]) => v !== null && v !== undefined);
  return `<div class="pkc-market">
    <div class="pkc-sub"><span class="micro">Market context</span>
      <span class="pbe-badge pbe-badge--${marketState === 'PRICED' ? 'sched' : 'unavailable'}">${esc(marketState || 'STATE UNAVAILABLE')}</span></div>
    ${cells.length ? `<dl class="kv pkc-kv">${cells.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`).join('')}</dl>` : '<p class="micro">No market values were returned for this pick.</p>'}
    <p class="micro pkc-cap">Captured snapshot${capturedAt ? ` · ${esc(dayET(capturedAt))} ${esc(timeET(capturedAt))}` : ''}${Number.isFinite(age) ? ` · ${esc(ageText(age))}` : ''} — not a live price.</p>
  </div>`;
}

function goalieBlock(goalies) {
  if (!goalies || typeof goalies !== 'object') return '';
  const side = (key, label) => {
    const g = goalies[key];
    if (!g || typeof g !== 'object') return '';
    const stateWord = readKey(g, ['state']);
    const name = readKey(g, ['name']);
    const source = readKey(g, ['source']);
    const at = readKey(g, ['captured_at']);
    return `<li><span class="micro">${esc(label)}</span>
      <b>${esc(name || DASH)}</b>
      <span class="pbe-badge pbe-badge--${stateWord === 'CONFIRMED' ? 'confirmed' : stateWord === 'PROJECTED' ? 'reported' : 'unknown'}">${esc(stateWord || 'UNKNOWN')}</span>
      <span class="micro">${esc(source || 'source unavailable')}${at ? ` · ${esc(timeET(at))}` : ''}</span></li>`;
  };
  return `<div class="pkc-goalies">
    <div class="pkc-sub"><span class="micro">Goalie context</span><span class="pbe-badge pbe-badge--heuristic">NOT A MODEL INPUT</span></div>
    <ul class="pkc-goalies__list">${side('away', 'Away')}${side('home', 'Home')}</ul>
    <p class="micro">Shown for context only. This model version is not goalie-aware, so nothing here changed the numbers above.</p>
  </div>`;
}

export function gameCardMarkup(game, { pipelineAvailable = true, splitSquad = false } = {}) {
  const pick = game.pick || null;
  const pickTeam = pick ? readKey(pick, ['pick_team']) : null;
  const pHome = pick ? readKey(pick, ['p_home']) : null;
  const pAway = pick ? readKey(pick, ['p_away']) : null;
  const homeAbbrev = game.home?.abbrev || null;
  const awayAbbrev = game.away?.abbrev || null;
  const stateWord = game.boardState?.text || game.slateState || null;
  const stateCls = game.boardState?.cls || 'unavailable';
  const prediction = game.prediction_state;
  const lockText = lockWindowText(game.lock_window);
  const local = game.start_utc ? timeLocal(game.start_utc) : null;
  // The selected side's probability is only ever read from the side the API
  // itself named; an unrecognised pick_team yields no number at all.
  const pickProb = probabilityText(
    pickTeam && pickTeam === homeAbbrev ? pHome : pickTeam && pickTeam === awayAbbrev ? pAway : null
  );

  const pickStrip = splitSquad
    ? `<p class="pkc-none pkc-none--split">No PBE pick — this is a split-squad game, so the team-level model cannot reliably separate the two rosters playing at the same time.</p>`
    : pick
    ? `<div class="pkc-pick">
        <div class="pkc-pick__head"><span class="eyebrow">PBE Pick</span>
          <b class="pkc-pick__team">${esc(pickTeam || DASH)}</b>
          ${pickProb ? `<span class="mono pkc-pick__p">${esc(pickProb)}</span>` : ''}
        </div>
        <dl class="kv pkc-kv">
          ${probabilityText(pAway) ? `<div><dt>${esc(awayAbbrev || 'Away')}</dt><dd>${esc(probabilityText(pAway))}</dd></div>` : ''}
          ${probabilityText(pHome) ? `<div><dt>${esc(homeAbbrev || 'Home')}</dt><dd>${esc(probabilityText(pHome))}</dd></div>` : ''}
          ${readKey(pick, ['model_version']) ? `<div><dt>Model</dt><dd>${esc(readKey(pick, ['model_version']))}</dd></div>` : ''}
          ${readKey(pick, ['lock_policy_version']) ? `<div><dt>Lock policy</dt><dd>${esc(readKey(pick, ['lock_policy_version']))}</dd></div>` : ''}
          ${readKey(pick, ['locked_at_utc']) ? `<div><dt>Locked</dt><dd>${esc(dayET(readKey(pick, ['locked_at_utc'])))} ${esc(timeET(readKey(pick, ['locked_at_utc'])))}</dd></div>` : ''}
          ${readKey(pick, ['generated_at_utc']) ? `<div><dt>Generated</dt><dd>${esc(timeET(readKey(pick, ['generated_at_utc'])))}</dd></div>` : ''}
          ${readKey(pick, ['feature_snapshot_id']) ? `<div><dt>Snapshot</dt><dd class="truncate">${esc(readKey(pick, ['feature_snapshot_id']))}</dd></div>` : ''}
          ${readKey(pick, ['model_artifact_sha256']) ? `<div><dt>Artifact</dt><dd class="truncate">${esc(String(readKey(pick, ['model_artifact_sha256'])).slice(0, 12))}</dd></div>` : ''}
        </dl>
        ${Array.isArray(pick.reasons) && pick.reasons.length ? `<ul class="pkc-reasons">${pick.reasons.map(r => `<li>${esc(typeof r === 'string' ? r : readKey(r, ['label', 'text', 'name']) || '')}</li>`).join('')}</ul>` : ''}
        ${marketBlock(pick.market)}
        ${goalieBlock(pick.goalies || pick.goalie_context)}
      </div>`
    : `<p class="pkc-none dim">${pipelineAvailable
      ? 'No official pick is published for this game.'
      : 'No pick and no prediction state — the picks pipeline is not answering here.'}</p>`;

  return `<article class="pkc" data-game="${esc(game.id)}" style="--away:${teamAccent(awayAbbrev)};--home:${teamAccent(homeAbbrev)}">
    <header class="pkc__head">
      <span class="pbe-badge pbe-badge--${esc(stateCls)}">${esc(stateWord || 'STATE UNAVAILABLE')}</span>
      <span class="pbe-badge pbe-badge--${esc(splitSquad ? 'quiet' : (PREDICTION_TONE[prediction] || 'unavailable'))}">${esc(splitSquad ? 'NO PICK · SPLIT SQUAD' : (prediction || 'PREDICTION STATE UNAVAILABLE'))}</span>
    </header>
    <div class="pkc__when mono">${esc(game.start_utc ? `${dayET(game.start_utc)} · ${timeET(game.start_utc)}` : 'Puck drop TBD')}${local ? ` · ${esc(local)}` : ''}${game.game_type && game.game_type !== 2 ? ` · ${esc(gameTypeLabel(game.game_type))}` : ''}</div>
    <div class="pkc__teams">
      ${teamRow(game.away, { probability: pAway, selected: Boolean(pickTeam) && pickTeam === awayAbbrev })}
      ${teamRow(game.home, { probability: pHome, selected: Boolean(pickTeam) && pickTeam === homeAbbrev })}
    </div>
    <div class="pkc__lock"><span class="micro">${splitSquad ? 'Pick status' : 'Lock window'}</span><span class="mono">${esc(splitSquad ? 'Excluded · split squad' : (lockText || (pipelineAvailable ? 'Not published' : 'Unavailable')))}</span></div>
    ${pickStrip}
    <footer class="pkc__actions">
      <a href="#/matchup/${esc(game.id)}">Matchup</a>
      <a href="#/cast/${esc(game.id)}">PBE Cast</a>
      <a href="#/goalies/${esc(game.id)}">Goalies</a>
    </footer>
  </article>`;
}

// ------------------------------------------------------------ explanation
const WHAT_IT_IS = [
  ['A versioned model, or nothing', 'A PBE Pick is the output of a named, versioned model artifact. No hand-picks, no editorial leans, no "model-assisted" picks.'],
  ['Locked before puck drop', 'The selection, its probability, the model version and the market it was priced into are written before the game starts. Nothing is accepted after that.'],
  ['Immutable and graded in public', 'A locked pick cannot be edited. The result is written as an append-only grade revision and stays in the ledger forever, win or lose.'],
  ['Market context is not the pick', 'Prices are a captured snapshot with their own timestamp and age. Market agreement is never presented as model edge.']
];

const PREDICTION_LEGEND = [
  ['NONE', 'No prediction exists for this game.'],
  ['SNAPSHOT_READY', 'The feature snapshot is built; nothing has been locked.'],
  ['LOCKED_INTERNAL', 'A shadow candidate locked internally. Not a pick, never shown as one.'],
  ['PRESEASON PICK', 'A preseason pick, locked before puck drop. Tracked separately from the regular-season record.'],
  ['LOCKED_OFFICIAL', 'An official, publishable model locked this pick before puck drop.']
];

function explainBlock() {
  return `<section class="pks-block" aria-labelledby="pks-what-h">
    <div class="pks-block__head"><div><span class="eyebrow">What PBE Picks is</span><h2 id="pks-what-h">The rules this surface is held to</h2></div></div>
    <ol class="pks-rules">
      ${WHAT_IT_IS.map(([title, body], i) => `<li><span class="pks-rules__n mono">${String(i + 1).padStart(2, '0')}</span><div><b>${esc(title)}</b><p>${esc(body)}</p></div></li>`).join('')}
    </ol>
    <div class="pks-legend">
      <span class="micro">Prediction states</span>
      <dl>${PREDICTION_LEGEND.map(([k, v]) => `<div><dt class="mono">${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    </div>
  </section>`;
}

// Members are described by the shared membership object the gateway derived
// (NHL PRO ACTIVE / ALL ACCESS ACTIVE / OWNER); the heading follows the label.
export function proBlock(state) {
  const pro = proEligible(state.account);
  const m = accountMembership(state.account);
  return `<section class="pks-block pks-pro" aria-labelledby="pks-pro-h" data-pbe-membership="${esc(m.state)}">
    <div class="pks-block__head">
      <div><span class="eyebrow">NHL Pro</span><h2 id="pks-pro-h">${pro ? esc(picksProHeading(m)) : 'What NHL Pro adds to this page'}</h2></div>
      ${pro ? membershipBadgeHtml(m) : '<span class="pbe-badge pbe-badge--sched">PRO</span>'}
    </div>
    <ul class="pks-pro__list">
      <li><b>The selection itself</b><span>Which team an official model took, with its probability and the opponent's.</span></li>
      <li><b>Provenance of the call</b><span>Model version, artifact hash, feature snapshot id, generated and locked timestamps, lock policy version.</span></li>
      <li><b>Market context at lock</b><span>Best price and book, consensus, implied and no-vig probability, with the snapshot's capture time and age.</span></li>
      <li><b>Approved reasons</b><span>The feature contributions cleared for display — not a generated narrative.</span></li>
    </ul>
    ${pro
      ? `<p class="dim">${state.proError
        ? `Pro values are not on screen: ${esc(state.proError)}.`
        : 'Pro values appear on the cards above as soon as an official model locks a pick. There is nothing withheld from you today — there is nothing yet.'}</p>`
      : `<p class="dim">Entitlement is decided by the gateway on every request. This page never asks for Pro data unless the gateway has already confirmed an active NHL Pro or All Access membership, so a free session carries no pick values at all.</p>
         <div class="pks-pro__cta"><button type="button" class="pbe-btn pbe-btn--primary" data-open-nhl-pro>See NHL Pro</button>
         <a class="pbe-btn pbe-btn--ghost" href="#/methodology">How the model is held to account</a></div>`}
  </section>`;
}

// --------------------------------------------------------------- page mode
// The page has three presentation modes. A locked preseason call is a REAL
// pick to a reader, so the hero must never claim there are none while five of
// them sit further down the same page.
export const PICKS_MODE = Object.freeze({ PRESEASON: 'PRESEASON_PICKS', OFFICIAL: 'OFFICIAL_PICKS', NONE: 'NO_PICKS' });

export function preseasonPicks(state) {
  const games = state?.preseason?.ok === true && Array.isArray(state.preseason.games) ? state.preseason.games : [];
  return games.filter(g => g && g.is_call === true);
}

export function isPreseasonPickMode(state) {
  return preseasonPicks(state).length > 0;
}

export function picksMode(state, games = []) {
  if (isPreseasonPickMode(state)) return PICKS_MODE.PRESEASON;
  if (games.some(g => g.prediction_state === 'LOCKED_OFFICIAL')) return PICKS_MODE.OFFICIAL;
  return PICKS_MODE.NONE;
}

// --------------------------------------------------------------- rehearsal
// PRESEASON PICKS (backend record_class PRESEASON_REHEARSAL).
// Public-facing these are simply preseason picks. They are still never merged
// into the official slate and never counted in the official track record; that
// separation is stated once, not repeated on every component.
export const REHEARSAL_BADGE = 'PRESEASON';
export const REHEARSAL_COPY = 'Preseason results are tracked separately and do not count toward the regular-season PBE record.';

export function rehearsalCard(game) {
  const call = game.is_call === true && present(game.pick_team);
  const pickP = call ? probabilityText(game.probability) : null;
  const home = esc(game.home || '');
  const away = esc(game.away || '');
  const ph = probabilityText(game.p_home);
  const pa = probabilityText(game.p_away);
  const graded = present(game.result);
  const market = game.market_at_lock && typeof game.market_at_lock === 'object'
    ? String(game.market_at_lock.state || '')
    : String(game.market_at_lock || '');
  const id = esc(String(game.game_id || ''));
  return `<article class="pks-pick" data-rehearsal="${id}">
    <header class="pks-pick__head">
      <span class="pks-pick__match">${away} @ ${home}</span>
      <span class="pbe-badge pbe-badge--preseason">PRESEASON</span>
    </header>
    ${call
      ? `<div class="pks-pick__call">
          <span class="pks-pick__label">PBE PRESEASON PICK</span>
          <b class="pks-pick__team">${esc(game.pick_team)}</b>
          ${pickP ? `<span class="pks-pick__prob">${pickP}</span>` : ''}
        </div>`
      : `<div class="pks-pick__call pks-pick__call--none">
          <span class="pks-pick__label">NO PICK</span>
          <b class="pks-pick__team">${esc(game.no_call_reason || 'no call')}</b>
        </div>`}
    <dl class="pks-pick__grid">
      <div><dt>Puck Drop</dt><dd>${esc(puckLabel(game.puck_drop_utc))}</dd></div>
      <div><dt>Locked</dt><dd>${esc(lockLabel(game.locked_at))}</dd></div>
      <div><dt>Model</dt><dd>${esc(consumerModelName(game.model_version))}</dd></div>
      <div><dt>Market</dt><dd>${esc(market || '—')}</dd></div>
      <div><dt>${home}</dt><dd>${ph || '—'}</dd></div>
      <div><dt>${away}</dt><dd>${pa || '—'}</dd></div>
      ${graded ? `<div><dt>Result</dt><dd class="pks-pick__result pks-pick__result--${esc(String(game.result).toLowerCase())}">${esc(game.result)}${present(game.home_score) ? ` · ${esc(String(game.away_score))}–${esc(String(game.home_score))}` : ''}</dd></div>` : ''}
    </dl>
    ${id ? `<div class="pks-pick__cta">
      <a class="pbe-btn pbe-btn--ghost" href="#/matchup/${id}">Matchup</a>
      <a class="pbe-btn pbe-btn--ghost" href="#/cast/${id}">PBE Cast</a>
    </div>` : ''}
    <p class="pks-pick__foot micro">PRESEASON · Tracked separately from the regular-season record.</p>
  </article>`;
}

// The reader does not need our artifact ids. "pbe-nhl-model-v1.1-shadow-da0d82a0"
// becomes "PBE NHL v1.1"; the full id stays in the API and in Model Status.
export function consumerModelName(version) {
  const m = /v(\d+\.\d+)/.exec(String(version || ''));
  return m ? `PBE NHL v${m[1]}` : 'PBE NHL model';
}

function puckLabel(utc) {
  if (!present(utc)) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(utc));
  } catch { return String(utc); }
}
function lockLabel(utc) {
  if (!present(utc)) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(utc));
  } catch { return String(utc); }
}

// Split-squad games are excluded by the model, and the product says so rather
// than quietly dropping the fixture.
// Mirrors the runner's rule (markSplitSquad): a club appearing in more than one
// game on the same date is icing two rosters, so neither game gets a call.
export function splitSquadGames(source) {
  // The picks SLATE lists every fixture on the date, including the split-squad
  // pair the runner excluded; the board route does not. Accept either shape.
  const games = Array.isArray(source?.games) ? source.games : Array.isArray(source) ? source : [];
  const perClub = new Map();
  for (const g of games) {
    for (const t of [g?.home?.abbrev || g?.home, g?.away?.abbrev || g?.away]) {
      if (t) perClub.set(t, (perClub.get(t) || 0) + 1);
    }
  }
  return games
    .filter(g => [g?.home?.abbrev || g?.home, g?.away?.abbrev || g?.away].some(t => t && perClub.get(t) > 1))
    .map(g => ({ home: g?.home?.abbrev || g?.home || '', away: g?.away?.abbrev || g?.away || '', game_id: g?.game_id || g?.id || null }));
}

export function splitSquadNotice(games) {
  if (!games || !games.length) return '';
  return `<div class="pks-nopick">
    ${games.map(g => `<article class="pks-nopick__game">
      <header><span class="pks-pick__match">${esc(g.away)} @ ${esc(g.home)}</span><span class="pbe-badge pbe-badge--quiet">NO PICK · SPLIT SQUAD</span></header>
      <p class="micro">Split-squad game. The current team-level model cannot reliably distinguish two rosters from the same club playing at the same time.</p>
    </article>`).join('')}
  </div>`;
}

function compactSeasonLabel(value) {
  const raw = String(value || '');
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}–${raw.slice(6)}`;
  return raw || 'Current';
}

export function preseasonRecordStrip(rec, visibleCount = 0, seasonHint = null) {
  const graded = rec?.graded ?? 0;
  const wins = rec?.wins ?? 0;
  const losses = rec?.losses ?? 0;
  // This is a season record strip, not a count of the cards visible for the
  // currently selected date. Mixing those scopes produced "1 picks / 5 graded".
  const count = rec?.locked_calls ?? visibleCount;
  const season = rec?.season ?? rec?.seasons?.[0]?.season ?? seasonHint ?? null;
  const seasonLabel = compactSeasonLabel(season);
  return `<div class="pks-record" aria-label="${esc(seasonLabel)} preseason record">
    <span class="pks-record__title">${esc(seasonLabel)} PRESEASON RECORD</span>
    <ul>
      <li><b>${count}</b><span>picks</span></li>
      <li><b>${graded}</b><span>graded</span></li>
      <li><b>${graded ? `${wins}–${losses}` : '0–0'}</b><span>record</span></li>
      <li><b>${rec && rec.accuracy !== null && rec.accuracy !== undefined ? `${(rec.accuracy * 100).toFixed(1)}%` : '—'}</b><span>accuracy</span></li>
    </ul>
    <p class="micro">Preseason results are tracked separately and do not count toward the regular-season PBE record.</p>
  </div>`;
}

export function rehearsalSection(state) {
  const data = state.preseason;
  const games = data && data.ok === true && Array.isArray(data.games) ? data.games : [];
  if (!games.length) return '';
  const rec = state.preseasonRecord && state.preseasonRecord.ok === true ? state.preseasonRecord : null;
  const calls = games.filter(g => g.is_call === true);
  return `<section class="pks-preseason" id="pks-preseason" data-fresh-scope>
    ${calls.length ? preseasonRecordStrip(rec, calls.length, calls[0]?.season ?? games[0]?.season ?? null) : ''}
    ${consumerModelStatus(state)}
    <div class="pks-picks">${games.map(rehearsalCard).join('')}</div>
  </section>`;
}

// ------------------------------------------------------------------ header
function slateSection(state, games, { quiet = false } = {}) {
  const pipelineAvailable = Boolean(state.slate);
  const splitIds = new Set((state.splitSquad || []).map((g) => String(g?.game_id ?? g?.id ?? '')).filter(Boolean));
  const isToday = state.date === todayET();
  const next = state.board?.next_puck_drop || null;
  let body;
  if (!state.board && !state.slate && (state.boardError || state.slateError)) {
    body = errorNote(state.boardError || state.slateError, 'Today’s slate');
  } else if (!state.board && !state.slate) {
    body = `<div class="pks-grid">${'<div class="pkc pbe-skeleton" style="height:300px"></div>'.repeat(3)}</div>`;
  } else if (!games.length) {
    body = `<div class="pbe-empty"><h3>No NHL games on ${esc(dateLabel(state.date, { long: true }))}.</h3>
      <p>${next?.date
        ? `The next puck drop is <b>${esc(dayET(next.start_time_utc, true))} · ${esc(timeET(next.start_time_utc))}</b>.`
        : 'The source schedule lists no upcoming game in its current window.'}</p>
      ${next?.date ? `<p style="margin-top:14px"><button class="pbe-btn pbe-btn--primary" data-goto="${esc(next.date)}">Open the ${esc(dateLabel(next.date))} slate</button></p>` : ''}</div>`;
  } else {
    body = `<div class="pks-grid">${games.map(g => gameCardMarkup(g, {
      pipelineAvailable,
      splitSquad: splitIds.has(String(g.id)),
    })).join('')}</div>`;
  }
  return `<div class="section-head">
      <div><span class="eyebrow">Slate${isToday ? ' · Today' : ''}</span><h2>${esc(dateLabel(state.date, { long: true }))}</h2></div>
      <div class="datenav" role="group" aria-label="Choose date">
        <button class="pbe-btn pbe-btn--sm" data-shift="-1" aria-label="Previous day">‹</button>
        <button class="pbe-btn pbe-btn--sm${isToday ? ' is-current' : ''}" data-goto="${esc(todayET())}">Today</button>
        <button class="pbe-btn pbe-btn--sm" data-shift="1" aria-label="Next day">›</button>
        <label class="sr-only" for="picks-date">Date</label>
        <input id="picks-date" class="datenav__input" type="date" value="${esc(state.date)}">
      </div>
    </div>
    ${pipelineAvailable ? '' : errorNote(state.slateError, 'Prediction state', { quiet })}
    ${body}`;
}

function heroBlock(state, games) {
  const status = modelStatusOf(state.slate, state.health);
  const official = hasOfficialModel(status);
  const isToday = state.date === todayET();
  const next = state.board?.next_puck_drop || null;
  const pipelineAvailable = Boolean(state.slate);
  const mode = picksMode(state, games);
  const pre = preseasonPicks(state);
  const rec = state.preseasonRecord && state.preseasonRecord.ok === true ? state.preseasonRecord : null;

  if (mode === PICKS_MODE.PRESEASON) {
    const graded = rec?.graded ?? 0;
    const wl = graded ? `${rec.wins}–${rec.losses}` : '0–0';
    return `<div class="pks-hero pks-hero--picks pbe-panel" data-fresh-scope>
      <div class="pks-hero__copy">
        <span class="pks-hero__eyebrow">PBE NHL PICKS</span>
        <h1 class="pks-hero__title">${isToday ? "Tonight's PBE Preseason Picks" : `PBE Preseason Picks · ${esc(dateLabel(state.date))}`}</h1>
        <p>Model-generated NHL picks locked before puck drop. Every preseason call is tracked from day one.</p>
        <div class="pks-hero__cta">
          <a class="pbe-btn" href="#pks-preseason">See tonight's picks</a>
          <a class="pbe-btn pbe-btn--ghost" href="#/track-record">Track Record</a>
        </div>
      </div>
      <ul class="pks-hero__stats">
        <li><b>${pre.length}</b><span>${pre.length === 1 ? 'pick' : 'picks'} ${isToday ? 'tonight' : ''}</span></li>
        <li><b>${wl}</b><span>preseason record</span></li>
        <li><b>${pre.length}</b><span>locked before puck drop</span></li>
      </ul>
      <p class="pks-hero__prov micro">${state.slateMeta ? freshStamp(state.slateMeta, { source: 'PBE Picks' }) : 'PBE Picks read API not answering in this environment'}</p>
    </div>`;
  }

  const officialCount = games.filter(g => g.prediction_state === 'LOCKED_OFFICIAL').length;
  return `<div class="pks-hero pbe-panel" data-fresh-scope>
    <div class="pks-hero__copy">
      <span class="pbe-badge pbe-badge--${official ? 'model' : 'heuristic'}">${official ? 'OFFICIAL MODEL LIVE' : 'NO OFFICIAL MODEL'}</span>
      <h1 class="pks-hero__title">Who does the PBE algorithm pick ${isToday ? 'tonight' : `on ${esc(dateLabel(state.date))}`}?</h1>
      <p>${official
        ? 'Every call below was generated by a versioned model and locked before puck drop. The same page shows you what it was priced against and how it has been graded.'
        : 'No NHL model has been promoted to champion yet, so PropBetEdge publishes no regular-season pick, probability or record. What you can see is the real slate, the real model status and the real lock pipeline behind it.'}</p>
      <div class="pks-hero__cta">
        <a class="pbe-btn" href="#/track-record">Track Record</a>
        <a class="pbe-btn pbe-btn--ghost" href="#/methodology">Methodology</a>
      </div>
    </div>
    <dl class="pks-hero__facts">
      <div><dt>Slate</dt><dd>${esc(dateLabel(state.date, { long: true }))} · ${games.length} game${games.length === 1 ? '' : 's'}</dd></div>
      <div><dt>Official picks published</dt><dd class="mono">${pipelineAvailable ? officialCount : DASH}</dd></div>
      <div><dt>Model</dt><dd class="mono">${esc(status ? readKey(status, ['model_version']) || DASH : DASH)}</dd></div>
      <div><dt>Next puck drop</dt><dd>${next?.start_time_utc ? `${esc(dayET(next.start_time_utc))} · ${esc(timeET(next.start_time_utc))}` : DASH}</dd></div>
    </dl>
    <p class="pks-hero__prov micro">${state.slateMeta ? freshStamp(state.slateMeta, { source: 'PBE Picks' }) : 'PBE Picks read API not answering in this environment'}</p>
  </div>`;
}

// The whole page as a pure function of state, so every render path can be
// asserted in a test with no browser and no network.
export function picksView(state) {
  const games = mergeSlate({ slate: state.slate, board: state.board, pro: state.pro });
  const down = pipelineDown(state);
  const quiet = Boolean(down);
  return `<section class="wrap section pks">
    ${heroBlock(state, games)}
    ${pipelineBanner(down)}
    ${rehearsalSection(state)}
    <div class="pks-slate" id="pks-slate">${slateSection(state, games, { quiet })}</div>
    ${modelStatusBlock(state, { quiet })}
    ${pipelineBlock(state, { quiet })}
    ${explainBlock()}
    ${proBlock(state)}
    <nav class="pks-links" aria-label="Related">
      <a class="pks-link" href="#/track-record"><span class="eyebrow">Track Record</span><b>Every locked call, graded in public</b><span class="dim">Winners and losers, retired model versions included.</span></a>
      <a class="pks-link" href="#/methodology"><span class="eyebrow">Methodology</span><b>How a model is allowed to become a pick</b><span class="dim">Release criteria, lock policy and the data truth rules.</span></a>
    </nav>
  </section>`;
}

// ------------------------------------------------------------------- mount
export function mount(root, params, ctx) {
  const state = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(params?.date || '') ? params.date : todayET(),
    slate: null, slateMeta: null, slateError: null,
    health: null, healthMeta: null, healthError: null,
    board: null, boardMeta: null, boardError: null,
    pro: null, proError: null,
    preseason: null, preseasonError: null, preseasonRecord: null, splitSquad: [],
    account: { state: 'unknown' }
  };

  const render = () => { root.innerHTML = picksView(state); };
  render();

  let controller = new AbortController();
  let token = 0;

  async function load() {
    const mine = ++token;
    controller.abort();
    controller = new AbortController();
    const { signal } = controller;

    // Real game identity from the public Ice Board route, shared with the rest
    // of the app through ctx so this page costs no extra request when the board
    // has already been fetched for the same date.
    ctx?.board?.(state.date, { signal, maxAgeMs: 30000 })
      .then(res => {
        if (mine !== token) return;
        state.board = res.data; state.boardMeta = res.meta; state.boardError = null;
        render();
      })
      .catch(error => {
        if (mine !== token || error?.kind === 'aborted') return;
        state.board = null; state.boardError = error;
        render();
      });

    const data = await loadPicksData({ date: state.date, account: state.account, signal });
    if (mine !== token) return;
    Object.assign(state, data);
    state.splitSquad = splitSquadGames(state.slate || state.board);
    render();
  }

  load();

  // Account state is decided by the gateway. The page only reacts to it; it
  // never infers Pro from anything in the browser.
  const offAccount = onAccount(account => {
    const was = proEligible(state.account);
    state.account = account;
    if (proEligible(account) !== was) load();
    else render();
  });
  signInAvailable().then(available => { if (available) refreshAccount(); }).catch(() => {});

  const setDate = date => {
    state.date = date;
    state.slate = null; state.health = null; state.board = null; state.pro = null;
    state.slateError = null; state.healthError = null; state.boardError = null;
    history.replaceState(null, '', date === todayET() ? '#/pbe-picks' : `#/pbe-picks?date=${date}`);
    render();
    load();
  };

  const disposers = [
    on(root, 'click', '[data-shift]', (_, btn) => setDate(addDays(state.date, Number(btn.dataset.shift)))),
    on(root, 'click', '[data-goto]', (_, btn) => setDate(btn.dataset.goto)),
    on(root, 'change', '#picks-date', (_, input) => { if (/^\d{4}-\d{2}-\d{2}$/.test(input.value)) setDate(input.value); })
  ];

  return () => {
    token += 1;
    controller.abort();
    offAccount();
    disposers.forEach(d => d());
  };
}
