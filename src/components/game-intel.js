// Game Intelligence summary. Shows only supported components; each missing
// one renders as unavailable with its reason. There is deliberately NO overall
// "confidence" number: no such aggregation is defined or validated.
import { esc } from '../lib/dom.js';
import { goalieMatchup } from './goalie-intel.js';
import { DASH, edgeLine, fatigueChips, fmtScore, lockPanel, pct3, scoreRing, unavailableBox } from './intel-ui.js';

const pctText = v => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : DASH);
const n2 = v => (Number.isFinite(v) ? v.toFixed(1) : DASH);

function cell(k, bodyHtml) {
  return `<div class="gx-cell"><span class="gx-cell__k">${esc(k)}</span>${bodyHtml}</div>`;
}

function duo(intel, fn) {
  const a = intel.sides.away; const h = intel.sides.home;
  return `<div class="gx-duo"><div><span class="micro">${esc(a.team)}</span>${fn(a)}</div><div><span class="micro">${esc(h.team)}</span>${fn(h)}</div></div>`;
}

// props: { count, markets: Set, sample: [{player, market, line, best_over, book}] } | null
export function gameIntelPanel(intel, { pro = false, props = null, propsError = null } = {}) {
  if (!intel?.sides) return '';
  const teams = { away: { abbrev: intel.game.teams.away.abbrev }, home: { abbrev: intel.game.teams.home.abbrev } };
  const fatigueLocked = intel.sides.away.fatigue?.locked;
  const winLocked = intel.sides.away.winhl_lineup?.locked;
  const cells = [];

  cells.push(cell('Team model', `<p class="micro">${esc(intel.model?.reason || 'No released PBE team model.')}</p><a class="gold micro" href="#/pbe-picks">PBE Picks status ›</a>`));

  cells.push(cell('Goalie matchup', goalieMatchup(intel, { pro })));

  cells.push(cell('Fatigue', `${duo(intel, s => `${!fatigueLocked ? scoreRing(s.fatigue.score, { label: `${s.team} fatigue`, size: 48, inverse: true }) : ''}${fatigueChips(s.fatigue.facts)}`)}
    ${fatigueLocked ? '<span class="micro gold">Fatigue score + edge · Pro</span>' : edgeLine(intel.edges.fatigue, teams)}`));

  cells.push(cell('WinHL lineup', winLocked
    ? `${lockPanel('Average WinHL of each side\'s last dressed lineup', null, { compact: true })}`
    : `${duo(intel, s => `<b>${fmtScore(s.winhl_lineup.average, 1)}</b><span class="micro faint">${s.winhl_lineup.scored}/${s.winhl_lineup.dressed} scored</span>${(s.winhl_lineup.top || []).slice(0, 3).map(p => `<a class="micro" href="#/player/${esc(p.id)}">${esc(p.name)} ${fmtScore(p.score)}</a>`).join('')}`)}
      ${edgeLine(intel.edges.winhl_lineup, teams)}<p class="micro faint">${esc(intel.sides.away.winhl_lineup.basis || '')}</p>`));

  const env = intel.sides.away.shot_environment;
  cells.push(cell('Shot environment', env
    ? `${duo(intel, s => `<b>${n2(s.shot_environment?.sf_pg)}<span class="micro"> SF</span></b><span class="micro">${n2(s.shot_environment?.sa_pg)} SA / game</span><span class="micro faint">Last 10: ${n2(s.shot_environment?.last10?.sf_pg)} SF · ${n2(s.shot_environment?.last10?.sa_pg)} SA</span>`)}<p class="micro faint">${esc(env.season)} NHL team stats</p>`
    : unavailableBox('Shot environment unavailable', 'Team shot rates were not in the league snapshot.')));

  const st = intel.sides.away.special_teams;
  cells.push(cell('Special teams', st
    ? `${duo(intel, s => `<b>${pctText(s.special_teams?.pp_pct)}<span class="micro"> PP</span></b><span class="micro">${pctText(s.special_teams?.pk_pct)} PK</span>`)}<p class="micro faint">${esc(st.season)} NHL team stats</p>`
    : unavailableBox('Special teams unavailable', 'Team special-teams rates were not in the league snapshot.')));

  cells.push(cell('Injuries & scratches', `<p class="micro">No licensed injury-status feed is integrated, so no OUT/DTD table is shown. NHL.com injury headlines live on the injury desk.</p><a class="gold micro" href="#/injuries">Injury desk ›</a> <a class="gold micro" href="#/lines">Last-game lines ›</a>`));

  cells.push(cell('Prop market', propsError
    ? `<p class="micro faint">Market snapshot unavailable.</p>`
    : props && props.count
      ? `<b class="mono">${props.count}</b><span class="micro">player quotes across ${props.markets.size} market${props.markets.size === 1 ? '' : 's'} in the latest stored snapshot</span><a class="gold micro" href="#/props">Props board ›</a><span class="micro faint">Market prices only — no released prop model.</span>`
      : '<p class="micro">No book has posted player markets for this game in the latest stored snapshot.</p><a class="gold micro" href="#/props">Props board ›</a>'));

  cells.push(cell('Fight activity', duo(intel, s => (s.fights ? `<b>${s.fights.fights}</b><span class="micro">fights · ${s.fights.distinct_fighters} fighters</span><span class="micro faint">Fan-vote ${s.fights.fan_vote_record.w}-${s.fights.fan_vote_record.l}-${s.fights.fan_vote_record.d}</span>` : '<span class="micro faint">No fights on record this season</span>')) + '<a class="gold micro" href="#/fights">Fight ledger ›</a>'));

  return `<section class="pbe-panel gx" aria-label="Game intelligence">
    <div class="panel-head"><h3>Game intelligence</h3><span class="micro faint">${intel.captured_at ? `computed ${esc(new Date(intel.captured_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}` : ''}</span></div>
    ${!pro ? lockPanel('Scores, edges and lineup strength', 'Free shows every sourced fact. NHL Pro adds PBE Goalie Form, the Fatigue Score and edge, and WinHL lineup strength for both sides.', { compact: true }) : ''}
    <div class="gx-grid">${cells.join('')}</div>
    <p class="micro faint">Each block is shown only when its source supports it. There is no combined confidence score: none is defined or validated.</p>
  </section>`;
}

// One-line strip for Ice Board / Cast pregame.
export function gameIntelStrip(intel, { pro = false } = {}) {
  if (!intel?.sides) return '';
  const a = intel.sides.away; const h = intel.sides.home;
  const starter = s => `${esc(s.team)} ${esc(s.starter?.name || 'starter unknown')}${s.starter?.status && s.starter.status !== 'UNKNOWN' ? ` <span class="faint">(${esc(s.starter.status === 'CONFIRMED' ? 'confirmed' : 'projected')})</span>` : ''}`;
  const rest = s => (s.fatigue?.facts?.back_to_back ? '<span class="iq-chip iq-chip--warn">B2B</span>' : Number.isFinite(s.fatigue?.facts?.days_rest) ? `<span class="iq-chip">${s.fatigue.facts.days_rest}d rest</span>` : '');
  return `<div class="gx-strip" aria-label="Pregame intelligence">
    <span><span class="micro">Goalies</span> ${starter(a)} · ${starter(h)}</span>
    <span>${esc(a.team)} ${rest(a)} ${esc(h.team)} ${rest(h)}</span>
    ${pro && Number.isFinite(a.fatigue?.score) ? `<span class="micro">Fatigue ${esc(a.team)} ${fmtScore(a.fatigue.score)} · ${esc(h.team)} ${fmtScore(h.fatigue.score)}</span>` : ''}
    <a class="gold micro" href="#/matchup/${esc(intel.game_id)}">Full game intelligence ›</a>
  </div>`;
}

export { pct3 };
