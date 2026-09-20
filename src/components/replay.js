import { esc } from '../lib/dom.js';
import { parseSituationClient, periodLabel } from '../lib/format.js';

// Replay state is a pure function of (plays, cursor): everything is rebuilt
// from events 0..cursor, so stepping backwards can never corrupt state.

export const SPEEDS = [['slow', 'Slow', 1200], ['normal', '1×', 450], ['fast', 'Fast', 140], ['instant', 'Max', 35]];

function emptySide() { return { corsi: 0, fenwick: 0, sog: 0, goals: 0, missed: 0, blocked: 0, blocks_made: 0, hits: 0, giveaways: 0, takeaways: 0, faceoffs_won: 0, penalties: 0, pim: 0, coords_missing: 0, geo_high: 0, geo_medium: 0 }; }

export function aggregate(plays) {
  const teams = { away: emptySide(), home: emptySide() };
  const ev = { away: { corsi: 0, fenwick: 0 }, home: { corsi: 0, fenwick: 0 } };
  const periods = new Map();
  for (const p of plays) {
    if (!p.side || p.period_type === 'SO') continue;
    const t = teams[p.side];
    const o = teams[p.side === 'away' ? 'home' : 'away'];
    if (p.shot) {
      if (!periods.has(p.period)) periods.set(p.period, { period: p.period, period_type: p.period_type, away: { corsi: 0, fenwick: 0, sog: 0, goals: 0 }, home: { corsi: 0, fenwick: 0, sog: 0, goals: 0 } });
      const per = periods.get(p.period)[p.side];
      t.corsi++; per.corsi++;
      if (p.shot.unblocked) { t.fenwick++; per.fenwick++; }
      if (p.shot.on_goal) { t.sog++; per.sog++; }
      if (p.shot.goal) { t.goals++; per.goals++; }
      if (p.type === 'missed-shot') t.missed++;
      if (p.shot.blocked) { t.blocked++; o.blocks_made++; }
      if (!p.shot.has_coordinates) t.coords_missing++;
      if (p.shot.danger_bucket === 'high') t.geo_high++;
      if (p.shot.danger_bucket === 'medium') t.geo_medium++;
      if (p.situation_code === '1551') { ev[p.side].corsi++; if (p.shot.unblocked) ev[p.side].fenwick++; }
    } else if (p.type === 'hit') t.hits++;
    else if (p.type === 'giveaway') t.giveaways++;
    else if (p.type === 'takeaway') t.takeaways++;
    else if (p.type === 'faceoff') t.faceoffs_won++;
    else if (p.type === 'penalty') { t.penalties++; t.pim += p.penalty?.duration_min || 0; }
  }
  return { teams, five_on_five: ev, by_period: [...periods.values()].sort((a, b) => a.period - b.period) };
}

// Cast payload as it stood right after plays[cursor].
export function sliceCast(cast, cursor) {
  const plays = cast.plays.slice(0, cursor + 1);
  const at = plays[plays.length - 1] || null;
  const totals = aggregate(plays);
  let score = { away: 0, home: 0 };
  for (const p of plays) if (p.score_after && p.score_after.away !== null) score = p.score_after;
  const goalies = { away: null, home: null };
  for (let i = plays.length - 1; i >= 0 && (!goalies.away || !goalies.home); i--) {
    const p = plays[i];
    const g = p.players?.find(x => x.role === 'goalie');
    if (!p.shot || !g || !p.side) continue;
    const def = p.side === 'away' ? 'home' : 'away';
    if (!goalies[def]) goalies[def] = { id: g.id, name: g.name, number: g.number };
  }
  const sit = parseSituationClient(at?.situation_code);
  if (sit) {
    if (goalies.away) goalies.away.in_net_now = sit.away_goalie_in_net;
    if (goalies.home) goalies.home.in_net_now = sit.home_goalie_in_net;
  }
  const game = structuredClone(cast.game);
  game.teams.away.score = score.away; game.teams.home.score = score.home;
  game.teams.away.sog = totals.teams.away.sog; game.teams.home.sog = totals.teams.home.sog;
  game.status = { ...game.status, semantics: 'REPLAY', period: at?.period ?? null, period_type: at?.period_type ?? null, clock: at?.time_remaining ?? null, in_intermission: at?.type === 'period-end' };
  return {
    ...cast,
    replay: { cursor, total: cast.plays.length, at },
    game,
    plays,
    totals,
    manpower: sit ? { ...sit, method: 'situationCode of the event at the replay cursor' } : null,
    goalies_in_net: goalies
  };
}

export function markers(plays) {
  const out = [];
  plays.forEach((p, i) => {
    if (p.type === 'goal') out.push({ i, kind: 'goal', label: `${periodLabel(p.period, p.period_type)} ${p.time_in_period} goal` });
    else if (p.type === 'penalty') out.push({ i, kind: 'penalty', label: `${periodLabel(p.period, p.period_type)} ${p.time_in_period} penalty` });
    else if (p.type === 'period-start' && p.period > 1) out.push({ i, kind: 'period', label: `Start of ${periodLabel(p.period, p.period_type)}` });
  });
  return out;
}

// Index of the next/previous event matching `kind` from `from`.
export function seek(plays, from, kind, dir = 1) {
  const test = {
    goal: p => p.type === 'goal',
    penalty: p => p.type === 'penalty',
    pp: (p, prev) => {
      const s = p.strength?.state; const ps = prev?.strength?.state;
      return (p.situation_code && prev?.situation_code && p.situation_code !== prev.situation_code && (s === 'PP' || s === 'SH') && ps === 'EV');
    },
    period: p => p.type === 'period-start',
    shot: p => Boolean(p.shot)
  }[kind];
  for (let i = from + dir; i >= 0 && i < plays.length; i += dir) {
    if (test(plays[i], plays[i - 1])) return i;
  }
  return null;
}

export function replayBar(state, cast, { live = false } = {}) {
  const n = cast.plays.length;
  const cur = state.cursor ?? n - 1;
  const at = cast.plays[cur];
  const pct = n > 1 ? (cur / (n - 1)) * 100 : 100;
  // Markers are visual; the Goal/Penalty/Power play/Period chips are the
  // keyboard- and touch-sized way to jump (markers can sit pixels apart).
  const marks = markers(cast.plays).map(m => `<span class="rp-mark rp-mark--${m.kind}" style="left:${n > 1 ? (m.i / (n - 1)) * 100 : 0}%" title="${esc(m.label)}" aria-hidden="true"></span>`).join('');
  const atLiveEdge = live && state.cursor === null;
  const badgeClass = atLiveEdge ? 'live' : state.cursor === null ? 'final' : 'sched';
  const badgeText = atLiveEdge ? 'Live' : state.cursor === null ? 'Full game' : 'Replay';
  const playControl = atLiveEdge
    ? '<span class="rp-live-follow" aria-live="polite"><span class="rp-live-follow__dot" aria-hidden="true"></span>LIVE · Following</span>'
    : `<button class="rp-btn rp-btn--play" data-rp="play" aria-label="${state.playing ? 'Pause' : 'Play'}">${state.playing ? '❚❚' : '▶'}</button>`;
  return `<div class="replay" role="group" aria-label="${atLiveEdge ? 'Live broadcast controls' : 'Replay controls'}">
    <div class="replay__row">
      <span class="pbe-badge pbe-badge--${badgeClass}">${badgeText}</span>
      <div class="replay__btns">
        <button class="rp-btn" data-rp="start" aria-label="Start of game">⏮</button>
        <button class="rp-btn" data-rp="back" aria-label="Previous event">◀</button>
        ${playControl}
        <button class="rp-btn" data-rp="fwd" aria-label="Next event">▶</button>
        <button class="rp-btn" data-rp="end" aria-label="End of game">⏭</button>
      </div>
      ${atLiveEdge ? '' : `<div class="chips replay__speed" role="group" aria-label="Speed">${SPEEDS.map(([k, l]) => `<button class="chip" data-rp-speed="${k}" aria-pressed="${state.speed === k}">${l}</button>`).join('')}</div>`}
      <span class="replay__pos mono">${cur + 1}/${n}${at ? ` · ${esc(periodLabel(at.period, at.period_type))} ${esc(at.time_remaining || '')} left` : ''}</span>
      ${live && state.cursor !== null ? '<button class="chip replay__live" type="button" data-rp="live">Jump to live</button>' : ''}
    </div>
    <div class="replay__track">
      <label class="sr-only" for="rp-range">Replay position</label>
      <input id="rp-range" class="replay__range" type="range" min="0" max="${Math.max(0, n - 1)}" value="${cur}" style="--pct:${pct}%">
      <div class="replay__marks">${marks}</div>
    </div>
    <div class="chips replay__jumps" role="group" aria-label="Jump to">
      <button class="chip" data-rp-seek="goal" data-dir="-1">‹ Goal</button><button class="chip" data-rp-seek="goal" data-dir="1">Goal ›</button>
      <button class="chip" data-rp-seek="penalty" data-dir="1">Penalty ›</button>
      <button class="chip" data-rp-seek="pp" data-dir="1">Power play ›</button>
      <button class="chip" data-rp-seek="period" data-dir="1">Period ›</button>
      <span class="micro replay__keys">${atLiveEdge ? 'Live feed auto-follows · ← step back to replay' : 'Space play · ← → step'}</span>
    </div>
  </div>`;
}
