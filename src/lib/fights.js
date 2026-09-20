// NHL fight derivation for PBE Cast.
//
// PropSports can now return a first-class `cast.fights` ledger. This client
// helper keeps the UI backwards-compatible with an older gateway deployment by
// deriving the exact same event from the normalized fighting-major penalties.
// Winner/result data is NEVER derived client-side: it only appears when the
// PropSports payload carries an explicitly non-official fan-vote result.

const FIGHT_RE = /\b(fight|fighting)\b/i;
const MAJOR_RE = /^(?:MAJ|MAJOR)$/i;

const who = (play, role) => (play?.players || []).find(p => p.role === role) || null;

export function isFightingMajor(play) {
  if (!play || play.type !== 'penalty') return false;
  const p = play.penalty || {};
  return FIGHT_RE.test(String(p.desc_key || ''))
    && (MAJOR_RE.test(String(p.severity || '')) || Number(p.duration_min) === 5);
}

function participant(play, game) {
  const p = who(play, 'committed_by') || who(play, 'served_by') || who(play, 'player');
  if (!p) return null;
  const side = p.side || play.side || null;
  return {
    player_id: p.id ?? null,
    name: p.name || null,
    sweater_number: p.number ?? null,
    side,
    team_abbrev: side ? game?.teams?.[side]?.abbrev || null : null,
    penalty_sort_order: play.sort_order ?? null,
    penalty_minutes: Number.isFinite(Number(play.penalty?.duration_min)) ? Number(play.penalty.duration_min) : null
  };
}

function key(play) {
  const elapsed = Number.isFinite(Number(play.elapsed_s)) ? Number(play.elapsed_s) : String(play.time_in_period || '');
  return `${play.period || 0}|${elapsed}`;
}

export function deriveFightEvents(plays, game = {}) {
  const majors = (Array.isArray(plays) ? plays : []).filter(isFightingMajor);
  const groups = new Map();
  for (const p of majors) groups.set(key(p), [...(groups.get(key(p)) || []), p]);

  const events = [];
  for (const group of groups.values()) {
    const away = group.filter(p => (participant(p, game)?.side || p.side) === 'away');
    const home = group.filter(p => (participant(p, game)?.side || p.side) === 'home');
    const used = new Set();

    for (const a of away) {
      const ai = who(a, 'committed_by') || who(a, 'served_by');
      const ad = who(a, 'drawn_by');
      const candidates = home
        .map((h, i) => {
          const hi = who(h, 'committed_by') || who(h, 'served_by');
          const hd = who(h, 'drawn_by');
          let score = 0;
          if (ai?.id != null && hd?.id === ai.id) score += 2;
          if (hi?.id != null && ad?.id === hi.id) score += 2;
          score -= Math.abs(Number(a.sort_order || 0) - Number(h.sort_order || 0)) / 1000;
          return { h, i, score };
        })
        .filter(x => !used.has(x.i))
        .sort((x, y) => y.score - x.score);
      if (!candidates.length) continue;
      const hit = candidates[0];
      used.add(hit.i);
      const pa = participant(a, game);
      const ph = participant(hit.h, game);
      if (!pa || !ph) continue;
      const sorts = [Number(a.sort_order), Number(hit.h.sort_order)].filter(Number.isFinite);
      const elapsed = Number.isFinite(Number(a.elapsed_s)) ? Number(a.elapsed_s)
        : Number.isFinite(Number(hit.h.elapsed_s)) ? Number(hit.h.elapsed_s) : null;
      events.push({
        id: `fight_${game?.id || game?.game_id || 'game'}_${a.period || hit.h.period || 0}_${elapsed ?? String(a.time_in_period || '').replace(/\D/g, '')}_${events.length + 1}`,
        period: a.period ?? hit.h.period ?? null,
        period_type: a.period_type || hit.h.period_type || null,
        clock: a.time_in_period || hit.h.time_in_period || null,
        elapsed_s: elapsed,
        first_sort_order: sorts.length ? Math.min(...sorts) : null,
        last_sort_order: sorts.length ? Math.max(...sorts) : null,
        fighters: [pa, ph],
        penalty_minutes_each: pa.penalty_minutes === ph.penalty_minutes ? pa.penalty_minutes : null,
        source: 'NHL play stream',
        detection: 'paired opposing fighting majors at the same stoppage',
        result: null
      });
    }
  }
  return events.sort((a, b) => (a.first_sort_order ?? 0) - (b.first_sort_order ?? 0));
}

export function fightEvents(cast) {
  const server = Array.isArray(cast?.fights) ? cast.fights : [];
  if (server.length) return server;
  return deriveFightEvents(cast?.plays || [], cast?.game || {});
}

export function fightForPlayer(cast, playerId) {
  if (playerId === null || playerId === undefined) return null;
  return fightEvents(cast).find(f => (f.fighters || []).some(p => String(p.player_id) === String(playerId))) || null;
}

export function fightForPlay(cast, play) {
  if (!play) return null;
  const sort = Number(play.sort_order);
  return fightEvents(cast).find(f => {
    const lo = Number(f.first_sort_order);
    const hi = Number(f.last_sort_order);
    if (Number.isFinite(sort) && Number.isFinite(lo) && Number.isFinite(hi)) return sort >= lo && sort <= hi;
    return f.period === play.period && f.clock === play.time_in_period;
  }) || null;
}

export function latestFight(cast) {
  const fights = fightEvents(cast);
  return fights.length ? fights[fights.length - 1] : null;
}
