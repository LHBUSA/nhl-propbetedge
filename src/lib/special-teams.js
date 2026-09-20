// PBE Cast special-teams engine.
//
// Reconstructs WHO is in the box and WHY the manpower is what it is, from the
// play stream up to a cursor. Two rules govern everything here:
//
//   1. situationCode is the authority for manpower. The penalty stream only
//      EXPLAINS it. If the two disagree, the code wins and every countdown is
//      withheld rather than guessed.
//   2. A countdown is shown only when it is provable. `elapsed_s` on each play
//      is total elapsed GAME seconds, so penalty time elapsed is exactly
//      (cursor.elapsed_s - penalty.elapsed_s) — the official clock, not a
//      browser timer, and it does not run through stoppages.
//
// Nothing here invents a countdown, a box occupant or a manpower state.

import { parseSituationClient } from './format.js';

export const STATE = Object.freeze({
  EV: 'EV',
  POWER_PLAY: 'POWER_PLAY',
  SHORTHANDED: 'SHORTHANDED',
  FOUR_ON_FOUR: 'FOUR_ON_FOUR',
  FIVE_ON_THREE: 'FIVE_ON_THREE',
  DELAYED_PENALTY: 'DELAYED_PENALTY'
});

// Severities that put a player in the box WITHOUT shorthanding the team: a
// team-mate serves the time and the on-ice count is unchanged.
const NON_MANPOWER = new Set(['MIS', 'GAM', 'MAT']);

const other = side => (side === 'home' ? 'away' : 'home');
const isPenalty = p => p?.kind === 'penalty' || p?.type === 'penalty';
const isDelayed = p => p?.kind === 'delayed-penalty' || p?.type === 'delayed-penalty';

function playerOf(play, role) {
  return (play.players || []).find(x => x.role === role) || null;
}

/** The on-ice picture, straight from the authoritative situation code. */
export function manpowerAt(play) {
  const sit = parseSituationClient(play?.situation_code);
  if (!sit) return null;
  return {
    code: sit.code,
    away_skaters: sit.away_skaters,
    home_skaters: sit.home_skaters,
    away_goalie_in_net: sit.away_goalie_in_net,
    home_goalie_in_net: sit.home_goalie_in_net,
    label: `${sit.away_skaters}v${sit.home_skaters}`
  };
}

/**
 * Classify the state from manpower alone.
 *
 * A pulled goalie inflates a skater count without creating a power play, so
 * the comparison is made on PENALISED strength: a side that has pulled its
 * goalie has one of its skaters discounted for this purpose.
 */
export function classify(mp) {
  if (!mp) return { state: STATE.EV, advantaged_side: null, shorthanded_side: null, manpower: null };
  const awayPenalised = mp.away_skaters - (mp.away_goalie_in_net ? 0 : 1);
  const homePenalised = mp.home_skaters - (mp.home_goalie_in_net ? 0 : 1);
  const label = `${mp.away_skaters}v${mp.home_skaters}`;
  if (awayPenalised === homePenalised) {
    // 4v4 (or 3v3 in overtime) is even strength with fewer skaters, never a
    // power play, and a 6v5 pulled goalie is not one either.
    const state = awayPenalised === 5 ? STATE.EV : awayPenalised === 4 ? STATE.FOUR_ON_FOUR : STATE.EV;
    return { state, advantaged_side: null, shorthanded_side: null, manpower: label };
  }
  const advantaged = awayPenalised > homePenalised ? 'away' : 'home';
  const diff = Math.abs(awayPenalised - homePenalised);
  return {
    state: diff >= 2 ? STATE.FIVE_ON_THREE : STATE.POWER_PLAY,
    advantaged_side: advantaged,
    shorthanded_side: other(advantaged),
    manpower: label
  };
}

/**
 * Full special-teams state as of plays[cursorIndex].
 *
 * @param {object[]} plays  ordered play stream
 * @param {number}   cursorIndex  inclusive; defaults to the last play
 */
export function specialTeams(plays, { cursorIndex = null } = {}) {
  const list = Array.isArray(plays) ? plays : [];
  const end = cursorIndex === null || cursorIndex === undefined
    ? list.length - 1
    : Math.max(-1, Math.min(cursorIndex, list.length - 1));
  const upTo = list.slice(0, end + 1);
  const at = upTo[upTo.length - 1] || null;

  const empty = {
    state: STATE.EV, manpower: null, advantaged_side: null, shorthanded_side: null,
    active_penalties: [], pp_segment: null, certainty: 'unknown', source: 'no play at cursor'
  };
  if (!at) return empty;

  // Manpower comes from the newest play that actually carries a code, because
  // some events (period-end, stoppage) may omit it.
  let mpPlay = null;
  for (let i = upTo.length - 1; i >= 0; i--) {
    if (parseSituationClient(upTo[i].situation_code)) { mpPlay = upTo[i]; break; }
  }
  const mp = manpowerAt(mpPlay);
  const cls = classify(mp);

  // A delayed penalty is signalled before the whistle: the offending team does
  // not yet have a player in the box, and the other side may pull its goalie
  // for an extra attacker. That is NOT a normal empty-net pull.
  const delayed = delayedPenaltyAt(upTo);

  const now = Number(at.elapsed_s);
  const { penalties, exact } = reconstruct(upTo, now, cls);

  const state = delayed ? STATE.DELAYED_PENALTY : cls.state;

  return {
    state,
    manpower: cls.manpower,
    advantaged_side: delayed ? delayed.advantaged_side : cls.advantaged_side,
    shorthanded_side: delayed ? null : cls.shorthanded_side,
    active_penalties: penalties,
    delayed: delayed || null,
    pp_segment: cls.advantaged_side && !delayed ? segment(upTo, cls.advantaged_side) : null,
    // 'exact' only when every displayed countdown came from the official clock
    // AND the reconstruction agrees with the authoritative code.
    certainty: exact ? 'exact' : 'partial',
    source: mp ? `situationCode ${mp.code}` : 'no situation code at cursor'
  };
}

// A delayed penalty is live when the most recent delayed-penalty signal has not
// yet been followed by the penalty call or a faceoff.
function delayedPenaltyAt(upTo) {
  for (let i = upTo.length - 1; i >= 0; i--) {
    const p = upTo[i];
    if (isDelayed(p)) {
      const offending = p.side || null;
      return {
        offending_side: offending,
        advantaged_side: offending ? other(offending) : null,
        period: p.period,
        clock: p.time_in_period || null
      };
    }
    // anything that resolves the delay ends the state
    if (isPenalty(p) || p.type === 'faceoff' || p.type === 'goal' || p.type === 'stoppage' || p.type === 'period-end') return null;
  }
  return null;
}

/**
 * Walk the penalty stream and keep the ones still being served at `now`.
 *
 * Returns `exact: false` when anything prevents an honest countdown, in which
 * case callers must render the penalty WITHOUT a remaining time.
 */
function reconstruct(upTo, now, cls) {
  const penalties = [];
  let exact = Number.isFinite(now);

  const calls = upTo.filter(isPenalty);
  // Coincidental penalties are called at the same clock on opposite sides;
  // they cancel for manpower and are marked so nothing claims a power play.
  const bySecond = new Map();
  for (const p of calls) {
    const k = `${p.period}|${p.elapsed_s}`;
    bySecond.set(k, [...(bySecond.get(k) || []), p]);
  }

  for (const p of calls) {
    const pen = p.penalty || {};
    const severity = String(pen.severity || '').toUpperCase();
    const minutes = Number(pen.duration_min);
    const start = Number(p.elapsed_s);
    const affectsManpower = !NON_MANPOWER.has(severity);
    const group = bySecond.get(`${p.period}|${p.elapsed_s}`) || [];
    const coincidental = group.length > 1 && new Set(group.map(g => g.side)).size > 1;

    if (!Number.isFinite(minutes) || !Number.isFinite(start)) {
      // A penalty we cannot time at all: still report it, never time it.
      exact = false;
      continue;
    }

    const elapsed = now - start;
    const total = minutes * 60;
    if (elapsed < 0) continue;              // not yet called at this cursor
    let remaining = total - elapsed;

    // A minor ends early on a power-play goal against. Majors do not, and a
    // penalty that never shorthanded anyone cannot be ended by a goal.
    let endedEarly = false;
    if (severity === 'MIN' && affectsManpower && !coincidental) {
      const killedBy = upTo.find(g => g.type === 'goal'
        && Number(g.elapsed_s) > start
        && Number(g.elapsed_s) <= start + total
        && g.side && g.side !== p.side);
      if (killedBy) {
        // Only treat it as terminating if the scoring side was actually up a
        // skater at that moment; a 4v4 or even-strength goal does not release.
        const gm = classify(manpowerAt(killedBy));
        if (gm.advantaged_side === killedBy.side) {
          endedEarly = Number(killedBy.elapsed_s) <= now;
          if (endedEarly) remaining = 0;
        }
      }
    }

    if (remaining <= 0 || endedEarly) continue;   // expired

    const who = playerOf(p, 'committed_by') || playerOf(p, 'served_by');
    const served = playerOf(p, 'served_by');

    penalties.push({
      side: p.side || null,
      player_id: who?.id ?? null,
      player_name: who?.name || null,
      player_number: who?.number ?? null,
      served_by_name: served && served.id !== who?.id ? served.name : null,
      infraction: pen.desc_key || null,
      severity: severity || null,
      duration_min: minutes,
      start_sort_order: p.sort_order ?? null,
      start_period: p.period ?? null,
      start_clock: p.time_in_period || null,
      affects_manpower: affectsManpower,
      coincidental,
      // Withheld below if the reconstruction does not agree with the code.
      remaining_seconds: Math.max(0, Math.round(remaining)),
      certainty: 'exact'
    });
  }

  // Cross-check against the authority. If the number of manpower-affecting
  // penalties we reconstructed does not explain the situation code, we keep the
  // penalties (they are real events) but strip every countdown.
  const shortCount = side => penalties.filter(x => x.side === side && x.affects_manpower && !x.coincidental).length;
  if (cls.shorthanded_side) {
    const expected = cls.state === STATE.FIVE_ON_THREE ? 2 : 1;
    if (shortCount(cls.shorthanded_side) !== expected) exact = false;
  } else if (cls.state === STATE.EV && penalties.some(x => x.affects_manpower && !x.coincidental)) {
    exact = false;
  }

  if (!exact) {
    for (const x of penalties) { x.remaining_seconds = null; x.certainty = 'unknown'; }
  }
  // Longest-serving first, so the box reads in the order it will empty.
  penalties.sort((a, b) => (a.remaining_seconds ?? 1e9) - (b.remaining_seconds ?? 1e9));
  return { penalties, exact };
}

/**
 * Events since the current power play began, so "THIS PP" counts only what
 * happened during this segment. Derived from the play stream, never estimated.
 */
function segment(upTo, advantaged) {
  let startIdx = -1;
  for (let i = upTo.length - 1; i >= 0; i--) {
    const c = classify(manpowerAt(upTo[i]));
    if (c.advantaged_side === advantaged) { startIdx = i; continue; }
    if (parseSituationClient(upTo[i].situation_code)) break;
  }
  if (startIdx < 0) return null;
  const seg = upTo.slice(startIdx);
  const mine = seg.filter(p => p.shot && p.side === advantaged && !p.shot.shootout);
  return {
    started_period: seg[0]?.period ?? null,
    started_clock: seg[0]?.time_in_period || null,
    attempts: mine.length,
    sog: mine.filter(p => p.shot.on_goal).length,
    goals: mine.filter(p => p.shot.goal).length,
    missed: mine.filter(p => p.type === 'missed-shot').length,
    blocked: mine.filter(p => p.shot.blocked).length
  };
}

/** mm:ss from whole seconds, or null when the time is not provable. */
export function clockText(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
