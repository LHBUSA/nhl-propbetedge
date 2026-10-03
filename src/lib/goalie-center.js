// Goalie Center 3.0 view model. Pure: no DOM, no fetch.
//
// One source of truth per team: starter = { goalie_id, status, source } from
// nhl-metrics (game intelligence pregame; the live goalie lane once the puck
// drops — both use the same goalie-truth library). The headline goalie is the
// goalie whose NHL id is starter.goalie_id — never "the most active goalie".
// UNKNOWN puts nobody in the headline slot. "In net now" is observed and kept
// apart from "started". Values the source does not give stay null (shown "—").

export const STATUS_TEXT = { CONFIRMED: 'Confirmed', PROJECTED: 'Projected · Reported', UNKNOWN: 'Unknown' };
export const level = s => (s === 'CONFIRMED' ? 'CONFIRMED' : s === 'PROJECTED' || s === 'REPORTED' ? 'PROJECTED' : 'UNKNOWN');

const nn = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export const seasonText = s => {
  const t = String(s ?? '');
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}–${t.slice(6, 8)}` : '';
};

// intelSide: nhl-metrics game intelligence side. liveSide: /goalies/live side.
export function sideView(intelSide, liveSide = null) {
  if (!intelSide && !liveSide) return null;
  const team = intelSide?.team || liveSide?.team || null;
  const liveStarter = liveSide?.starter || null;
  const intelStarter = intelSide?.starter || null;
  // Once the game is under way the live lane is fresher; both are the same truth.
  const starter = liveStarter && (liveStarter.status === 'CONFIRMED' || !intelStarter || intelStarter.status !== 'CONFIRMED')
    ? liveStarter
    : intelStarter || liveStarter || { status: 'UNKNOWN', goalie_id: null, name: null, basis: 'Starter not reported.' };
  const goalies = Array.isArray(intelSide?.goalies) ? intelSide.goalies : [];
  const liveLines = Array.isArray(liveSide?.goalies) ? liveSide.goalies : [];
  const id = level(starter.status) === 'UNKNOWN' ? null : nn(starter.goalie_id);
  const record = id === null ? null : goalies.find(g => nn(g.id) === id) || null;
  const liveLine = id === null ? null : liveLines.find(l => nn(l.id) === id) || record?.live || null;
  const headline = id === null ? null : {
    id,
    name: record?.name || liveLine?.name || starter.name || null,
    record,
    live: liveLine
  };
  const others = goalies.filter(g => nn(g.id) !== id).map(g => ({ ...g, live: liveLines.find(l => nn(l.id) === nn(g.id)) || g.live || null }));
  let inNet = null;
  if (liveSide?.in_net) {
    const nid = nn(liveSide.in_net.goalie_id);
    const name = liveLines.find(l => nn(l.id) === nid)?.name || goalies.find(g => nn(g.id) === nid)?.name || liveSide.in_net.name || null;
    inNet = { ...liveSide.in_net, goalie_id: nid, name, same_as_starter: id !== null && nid === id };
  }
  return { team, starter, level: level(starter.status), headline, others, inNet, projectedUnmatched: level(starter.status) === 'PROJECTED' && id === null };
}

// Current season vs labelled baseline. Never presents the prior season as current.
export function seasonBlock(g) {
  const sl = g?.season_lines || null;
  const cur = sl?.current || null;
  const prev = sl?.previous || null;
  const curLine = cur?.line && (nn(cur.line.gp) ?? 0) > 0 ? cur.line : null;
  return {
    currentSeason: cur?.season || null,
    current: curLine,
    baselineSeason: prev?.season || null,
    baseline: prev?.line && (nn(prev.line.gp) ?? 0) > 0 ? prev.line : null
  };
}

// The line used for the overview/comparison: current season when it has an
// appearance, otherwise the labelled baseline (with its season).
export function primaryLine(g) {
  const s = seasonBlock(g);
  if (s.current) return { line: s.current, season: s.currentSeason, baseline: false };
  if (s.baseline) return { line: s.baseline, season: s.baselineSeason, baseline: true };
  return null;
}

export const recordText = l => (l && [l.wins, l.losses, l.ot_losses].every(v => nn(v) !== null) ? `${l.wins}-${l.losses}-${l.ot_losses}` : null);

// Side-by-side rows for the two headline goalies. Values only; no verdict.
export function comparisonRows(away, home, { fmtSv, fmtNum }) {
  const pl = v => (v?.headline?.record ? primaryLine(v.headline.record) : null);
  const a = pl(away); const h = pl(home);
  const l5 = v => v?.headline?.record?.recent_form?.regular?.last5 || null;
  const w = v => v?.headline?.record?.workload || v?.headline?.record?.form?.workload || null;
  const both = (fa, fh = fa) => [fa(away, a), fh(home, h)];
  const rows = [
    ['Status', ...both(v => STATUS_TEXT[v?.level] || '—')],
    ['Season', ...both((v, p) => (p ? `${seasonText(p.season)}${p.baseline ? ' baseline' : ''}` : '—'))],
    ['Record', ...both((v, p) => recordText(p?.line) || '—')],
    ['Starts', ...both((v, p) => fmtNum(p?.line?.gs))],
    ['Saves', ...both((v, p) => fmtNum(p?.line?.saves))],
    ['Goals allowed', ...both((v, p) => fmtNum(p?.line?.goals_against))],
    ['SV%', ...both((v, p) => fmtSv(p?.line?.save_pct))],
    ['GAA', ...both((v, p) => fmtNum(p?.line?.gaa, 2))],
    ['Shutouts', ...both((v, p) => fmtNum(p?.line?.shutouts))],
    ['Last 5 SV%', ...both(v => fmtSv(l5(v)?.save_pct))],
    ['Rest', ...both(v => (nn(w(v)?.days_rest) === null ? '—' : `${w(v).days_rest}d`))]
  ];
  return rows;
}

// League board sort (client side over the server-cached snapshot).
export const BOARD_COLUMNS = [
  { key: 'wins', label: 'W', dir: -1 },
  { key: 'saves', label: 'Saves', dir: -1 },
  { key: 'save_pct', label: 'SV%', dir: -1 },
  { key: 'gaa', label: 'GAA', dir: 1 },
  { key: 'shutouts', label: 'SO', dir: -1 },
  { key: 'gs', label: 'GS', dir: -1 }
];
export function sortBoard(rows, key = 'wins', { minGs = 0 } = {}) {
  const col = BOARD_COLUMNS.find(c => c.key === key) || BOARD_COLUMNS[0];
  return (rows || [])
    .filter(r => (nn(r.gs) ?? 0) >= minGs)
    .filter(r => nn(r[col.key]) !== null)
    .slice()
    .sort((a, b) => (a[col.key] - b[col.key]) * col.dir || (b.gs ?? 0) - (a.gs ?? 0) || a.id - b.id);
}
