// One player's fight record, per season, from the nhl-metrics fight ledger
// (/nhl/intel/fights/player/:id). The player page's stat strip, its PBE
// intelligence card and its Fight History all read THIS module, so for any one
// season they cannot disagree.
//
// Rules (mirror nhl-metrics src/lib/fights.mjs fanVoteOutcome + fighterBoard):
// - Fight occurrence comes from paired NHL fighting majors.
// - A decision exists only when HockeyFights published a fan vote with at least
//   MIN_VOTES votes. The NHL never declares a winner; this is not official.
// - Identity is the NHL player_id. The fan-vote winner is a NAME, so the name is
//   used only to decide WHICH of the two fighters won; that fighter's player_id
//   then decides WIN or LOSS. A name that matches neither fighter, or both,
//   decides nothing.
// - Regular season + playoffs count toward W-L-D. Preseason fights are listed
//   but never counted (the server summary excludes them too).
import { samePersonLabel } from './fights.js';

export const MIN_VOTES = 5;
export const COUNTED_GAME_TYPES = Object.freeze([2, 3]);

export const seasonLabel = s => {
  const t = String(s ?? '');
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(6, 8)}` : '';
};

// WIN / LOSS / DRAW, or an undecided reason, for playerId in one fight.
export function ledgerOutcome(fight, playerId) {
  const fighters = Array.isArray(fight?.fighters) ? fight.fighters : [];
  const me = fighters.find(p => p.player_id != null && String(p.player_id) === String(playerId)) || null;
  const opponent = fighters.find(p => p !== me) || null;
  if (!me) return { outcome: 'UNRELATED', decided: false, opponent: null };
  const r = fight?.result;
  const votes = Number(r?.vote_count) || 0;
  if (r?.type !== 'fan_vote' || r?.status !== 'available' || !r.winner_name) return { outcome: 'PENDING', decided: false, opponent, votes };
  if (votes < MIN_VOTES) return { outcome: 'TOO_FEW_VOTES', decided: false, opponent, votes };
  if (/\b(draw|tie)\b/i.test(String(r.winner_name))) return { outcome: 'DRAW', decided: true, opponent, votes };
  const winners = fighters.filter(p => samePersonLabel(r.winner_name, p.name));
  if (winners.length !== 1 || winners[0].player_id == null) return { outcome: 'UNMATCHED', decided: false, opponent, votes };
  return { outcome: String(winners[0].player_id) === String(playerId) ? 'WIN' : 'LOSS', decided: true, opponent, votes };
}

function tally(rows) {
  const counted = rows.filter(x => x.counted);
  const w = counted.filter(x => x.outcome === 'WIN').length;
  const l = counted.filter(x => x.outcome === 'LOSS').length;
  const d = counted.filter(x => x.outcome === 'DRAW').length;
  return { fights: counted.length, w, l, d, undecided: counted.length - w - l - d, preseason: rows.length - counted.length };
}

// Normalizes the ledger payload: [{ season, rows, record }], newest season first.
export function fightSeasons(payload, playerId) {
  const out = [];
  for (const s of Array.isArray(payload?.seasons) ? payload.seasons : []) {
    const season = String(s.season || '');
    if (!/^\d{8}$/.test(season)) continue;
    const rows = (s.fights || []).map(fight => {
      const o = ledgerOutcome(fight, playerId);
      return {
        fight,
        season,
        outcome: o.outcome,
        decided: o.decided,
        opponent: o.opponent,
        game_id: fight.game_id || null,
        date: fight.date || null,
        game_type: Number(fight.game_type) || null,
        counted: COUNTED_GAME_TYPES.includes(Number(fight.game_type))
      };
    }).filter(x => x.outcome !== 'UNRELATED')
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.fight?.first_sort_order || 0) - Number(a.fight?.first_sort_order || 0));
    out.push({ season, label: seasonLabel(season), rows, record: tally(rows), summary: s.summary || null });
  }
  return out.sort((a, b) => b.season.localeCompare(a.season));
}

// Record for one scope: a season id ('20252026') or 'career' (every season the
// ledger returned). A season the ledger does not cover returns null: unknown is
// not 0-0-0.
export function fightRecordFor(seasons, scope) {
  if (!Array.isArray(seasons)) return null;
  if (scope === 'career') {
    if (!seasons.length) return null;
    const rows = seasons.flatMap(s => s.rows);
    return { scope, label: `${seasons.at(-1).label} to ${seasons[0].label}`, rows, record: tally(rows) };
  }
  const s = seasons.find(x => x.season === String(scope));
  return s ? { scope: s.season, label: s.label, rows: s.rows, record: s.record } : null;
}

export const recordText = r => (r ? `${r.w}-${r.l}-${r.d}` : '—');

// Default Fight History tab: the season the page's stat line shows when the
// ledger covers it; otherwise the newest ledger season.
export function defaultFightScope(seasons, statSeason) {
  if (!Array.isArray(seasons) || !seasons.length) return null;
  return seasons.some(s => s.season === String(statSeason)) ? String(statSeason) : seasons[0].season;
}
