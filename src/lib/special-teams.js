// PBE Cast special-teams engine.
//
// Reconstructs WHO is in the box and WHY the manpower is what it is, from the
// play stream up to a cursor. Two rules govern everything here:
//
//   1. situationCode is the authority for manpower. The penalty stream only
//      EXPLAINS it. If the two disagree after the call has been enforced, the
//      code wins and that side's countdowns are withheld rather than guessed.
//      A call itself is logged at a stopped clock with the PRE-penalty code;
//      that transition is not a disagreement.
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
  const { penalties, overall } = reconstruct(upTo, now, cls, mp);

  const state = delayed ? STATE.DELAYED_PENALTY : cls.state;

  return {
    state,
    manpower: cls.manpower,
    advantaged_side: delayed ? delayed.advantaged_side : cls.advantaged_side,
    shorthanded_side: delayed ? null : cls.shorthanded_side,
    active_penalties: penalties,
    delayed: delayed || null,
    pp_segment: cls.advantaged_side && !delayed ? segment(upTo, cls.advantaged_side) : null,
    // 'exact' when every countdown came from the official clock AND agrees
    // with the authoritative code; 'transition' while a fresh call is still
    // waiting for its first manpower-bearing play; 'partial' when any clock is
    // withheld. Each penalty also carries its own certainty.
    certainty: overall,
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

// Minors a power-play goal can release (a bench minor is a minor served by a
// designated player). Majors and misconducts are never released by a goal.
const RELEASABLE = new Set(['MIN', 'BEN']);
const DOUBLE_MINOR_S = 240;
const MINOR_S = 120;


/**
 * The first play after penalty call `p` whose situationCode reflects the
 * enforced penalty. A call is logged at a stopped clock and carries the
 * PRE-penalty code; the faceoff that restarts play (or any coded play at a
 * later clock second) is the first one that can show the new manpower. Other
 * plays in the same stoppage (further calls, the stoppage itself) cannot.
 */
// Order is the position in the (already ordered) play stream.
function verificationPlay(upTo, idx, p) {
  const start = Number(p.elapsed_s);
  for (let i = idx.get(p) + 1; i < upTo.length; i++) {
    const q = upTo[i];
    if (!parseSituationClient(q.situation_code)) continue;
    if (Number(q.elapsed_s) > start || q.type === 'faceoff') return q;
  }
  return null;
}

/**
 * Walk the penalty stream and keep the ones still being served at `now`.
 *
 * Three facts are kept apart for every penalty:
 *   A. assessed duration   - duration_min from the official call (always shown)
 *   B. remaining time      - official game clock since the call (elapsed_s), so
 *                            stoppages never consume it and no browser timer runs
 *   C. manpower agreement  - situationCode on plays AFTER the call's enforcement
 *
 * Each penalty carries its own certainty:
 *   exact       B is proven and C agrees
 *   transition  called, but no manpower-bearing play has followed yet; B is
 *               exact (0 s elapsed at the call) and C is not yet testable
 *   unknown     B cannot be proven or C contradicts it -> remaining withheld
 * A disagreement on one side withholds only that side's clocks.
 */
function reconstruct(upTo, now, cls, mp) {
  const penalties = [];
  const withheldSides = new Set();
  const untimed = { home: 0, away: 0 };   // manpower calls with no provable duration
  const clockOk = Number.isFinite(now);

  const idx = new Map(upTo.map((q, i) => [q, i]));
  const calls = upTo.filter(isPenalty);
  // Coincidental penalties are called at the same clock on opposite sides;
  // they cancel for manpower and are marked so nothing claims a power play.
  const bySecond = new Map();
  for (const p of calls) {
    const k = `${p.period}|${p.elapsed_s}`;
    bySecond.set(k, [...(bySecond.get(k) || []), p]);
  }

  // B: provisional end time of every timeable call, then power-play goals
  // release minors one at a time (the soonest-ending minor on the short side).
  const timed = [];
  for (const p of calls) {
    const pen = p.penalty || {};
    const severity = String(pen.severity || '').toUpperCase();
    // Number(null) is 0: a missing duration must stay missing, not look like a
    // zero-minute penalty-shot call.
    const rawDur = pen.duration_min;
    const minutes = rawDur === null || rawDur === undefined || rawDur === '' ? NaN : Number(rawDur);
    const start = Number(p.elapsed_s);
    const affectsManpower = !NON_MANPOWER.has(severity);
    const group = bySecond.get(`${p.period}|${p.elapsed_s}`) || [];
    const coincidental = group.length > 1 && new Set(group.map(g => g.side)).size > 1;
    if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isFinite(start)) {
      // Untimeable (or a penalty-shot call with no time): never timed. If it
      // could change manpower, that side's clocks are no longer provable.
      if (affectsManpower && minutes !== 0 && (p.side === 'home' || p.side === 'away')) { withheldSides.add(p.side); untimed[p.side] += 1; }
      continue;
    }
    const total = minutes * 60;
    const doubleMinor = severity === 'MIN' && total === DOUBLE_MINOR_S;
    timed.push({ p, pen, severity, minutes, start, total, end: start + total, affectsManpower, coincidental, doubleMinor, notes: [] });
  }
  const goals = upTo.filter(g => g.type === 'goal' && g.side && Number.isFinite(Number(g.elapsed_s)));
  for (const g of goals) {
    const at = Number(g.elapsed_s);
    // Only a goal by a side that was actually up a skater releases anything.
    if (classify(manpowerAt(g)).advantaged_side !== g.side) continue;
    const running = timed
      .filter(t => t.p.side && t.p.side !== g.side && RELEASABLE.has(t.severity) && t.affectsManpower && !t.coincidental
        && at > t.start && at < t.end && idx.get(g) > idx.get(t.p))
      .sort((a, b) => a.end - b.end || idx.get(a.p) - idx.get(b.p));
    const t = running[0];
    if (!t) continue;
    if (t.doubleMinor && at < t.start + MINOR_S) {
      // A goal in the first half of a double minor ends only the first minor;
      // the second starts at the goal.
      t.end = at + MINOR_S;
      t.notes.push('double_minor_first_half_released');
    } else {
      t.end = at;
    }
  }

  for (const t of timed) {
    const { p, pen } = t;
    if (!clockOk || now < t.start) continue;          // not yet called at this cursor
    const remaining = t.end - now;
    if (remaining <= 0) continue;                     // expired or released
    const who = playerOf(p, 'committed_by') || playerOf(p, 'served_by');
    const served = playerOf(p, 'served_by');
    const manpowerClaim = t.affectsManpower && !t.coincidental;
    const verified = manpowerClaim ? verificationPlay(upTo, idx, p) : null;
    let certainty = 'exact';
    if (manpowerClaim && !verified) certainty = 'transition';
    // A misconduct assessed together with the same player's minor is served
    // AFTER the minor; its start is not provable from the call alone.
    if (!t.affectsManpower && calls.some(o => o !== p && o.period === p.period && o.elapsed_s === p.elapsed_s
      && !NON_MANPOWER.has(String(o.penalty?.severity || '').toUpperCase())
      && (playerOf(o, 'committed_by')?.id ?? -1) === (who?.id ?? -2))) certainty = 'unknown';
    penalties.push({
      side: p.side || null,
      player_id: who?.id ?? null,
      player_name: who?.name || null,
      player_number: who?.number ?? null,
      served_by_name: served && served.id !== who?.id ? served.name : null,
      infraction: pen.desc_key || null,
      severity: t.severity || null,
      duration_min: t.minutes,
      start_sort_order: p.sort_order ?? null,
      start_period: p.period ?? null,
      start_clock: p.time_in_period || null,
      affects_manpower: t.affectsManpower,
      coincidental: t.coincidental,
      remaining_seconds: certainty === 'unknown' ? null : Math.max(0, Math.round(remaining)),
      certainty,
      ...(t.notes.length ? { notes: t.notes } : {})
    });
  }

  // C: cross-check against the authority. Only the manpower DIFFERENCE is
  // tested (coincidental minors legitimately change both counts: 4v4, or 4v3
  // on top of a power play). A call still in transition may or may not be
  // reflected yet (the source usually stamps the call with the pre-penalty
  // code, occasionally with the post-enforcement one), so it may count either
  // way; a VERIFIED penalty must be explained. A side with more than two
  // verified running penalties is a stacked call whose clock cannot have
  // started: not provable.
  const claim = x => x.affects_manpower && !x.coincidental;
  const count = (side, c) => penalties.filter(x => x.side === side && claim(x) && x.certainty === c).length;
  let contradiction = false;
  if (mp) {
    const pen = side => (side === 'away' ? mp.away_skaters - (mp.away_goalie_in_net ? 0 : 1) : mp.home_skaters - (mp.home_goalie_in_net ? 0 : 1));
    const target = pen('away') - pen('home');             // > 0: home is shorter
    const vh = count('home', 'exact'), va = count('away', 'exact');
    // transition calls and untimeable calls may or may not be on the ice count
    const th = count('home', 'transition') + untimed.home, ta = count('away', 'transition') + untimed.away;
    if (vh > 2 || va > 2) contradiction = true;
    else if (target < vh - va - ta || target > vh + th - va) contradiction = true;
  } else if (penalties.some(x => claim(x) && x.certainty === 'exact')) {
    contradiction = true;
  }
  // A contradiction cannot be pinned on one penalty, so every VERIFIED
  // manpower clock is withheld; coincidental, non-manpower and transition
  // clocks are proven by the official clock alone and stay. An untimeable call
  // (withheldSides) makes only its own side unprovable.
  if (contradiction) for (const x of penalties) if (claim(x) && x.certainty === 'exact') { x.remaining_seconds = null; x.certainty = 'unknown'; }
  for (const x of penalties) {
    if (x.affects_manpower && !x.coincidental && x.certainty === 'exact' && withheldSides.has(x.side)) {
      x.remaining_seconds = null; x.certainty = 'unknown';
    }
  }
  // Longest-serving first, so the box reads in the order it will empty.
  penalties.sort((a, b) => (a.remaining_seconds ?? 1e9) - (b.remaining_seconds ?? 1e9));
  const certainties = penalties.map(x => x.certainty);
  const overall = !clockOk || contradiction || withheldSides.size || certainties.includes('unknown') ? 'partial'
    : certainties.includes('transition') ? 'transition' : 'exact';
  return { penalties, overall };
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
