import { esc } from '../lib/dom.js';
import { periodLabel } from '../lib/format.js';

// Regulation NHL rink in feet, centre ice at (0,0): 200 x 85, corner radius 28,
// goal lines at x = +/-89, blue lines at +/-25, end-zone faceoff circles at
// (+/-69, +/-22). SVG y is flipped so source +y renders upward.
const RINK = `
  <rect x="-100" y="-42.5" width="200" height="85" rx="28" ry="28" class="rk-ice"/>
  <line x1="0" y1="-42.5" x2="0" y2="42.5" class="rk-red rk-center"/>
  <line x1="-25" y1="-42.5" x2="-25" y2="42.5" class="rk-blue"/>
  <line x1="25" y1="-42.5" x2="25" y2="42.5" class="rk-blue"/>
  <line x1="-89" y1="-36.8" x2="-89" y2="36.8" class="rk-red rk-thin"/>
  <line x1="89" y1="-36.8" x2="89" y2="36.8" class="rk-red rk-thin"/>
  <circle cx="0" cy="0" r="15" class="rk-circle rk-blue-stroke"/>
  <circle cx="0" cy="0" r=".6" class="rk-dot-blue"/>
  ${[[-69, -22], [-69, 22], [69, -22], [69, 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15" class="rk-circle"/><circle cx="${x}" cy="${y}" r="1" class="rk-dot"/>`).join('')}
  ${[[-20, -22], [-20, 22], [20, -22], [20, 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" class="rk-dot"/>`).join('')}
  <path d="M89,-4 L84.5,-4 A4.5,4.5 0 0,0 84.5,4 L89,4 Z" class="rk-crease"/>
  <path d="M-89,-4 L-84.5,-4 A4.5,4.5 0 0,1 -84.5,4 L-89,4 Z" class="rk-crease"/>
  <rect x="89" y="-3" width="3.3" height="6" class="rk-net"/>
  <rect x="-92.3" y="-3" width="3.3" height="6" class="rk-net"/>
  <path d="M89,-11 L100,-14 M89,11 L100,14 M-89,-11 L-100,-14 M-89,11 L-100,14" class="rk-red rk-thin"/>
  <rect x="-100" y="-42.5" width="200" height="85" rx="28" ry="28" class="rk-boards"/>`;

const TYPES = {
  goal: 'Goal',
  'shot-on-goal': 'Shot on goal',
  'missed-shot': 'Missed',
  'blocked-shot': 'Blocked'
};

// Layer filters (Corsi = every attempt; Fenwick = unblocked).
export const LAYERS = [
  ['all', 'All attempts'],
  ['fenwick', 'Unblocked'],
  ['sog', 'On goal'],
  ['goal', 'Goals'],
  ['missed-shot', 'Missed'],
  ['blocked-shot', 'Blocked']
];

export function layerMatch(play, layer) {
  const s = play.shot;
  if (!s) return false;
  if (layer === 'all') return true;
  if (layer === 'fenwick') return s.unblocked;
  if (layer === 'sog') return s.on_goal;
  if (layer === 'goal') return s.goal;
  return play.type === layer;
}

// Deterministic transform of REAL coordinates: rotate 180° so the away team
// always attacks the left net and the home team the right. Shots whose attack
// direction is unknown cannot be normalized and are not placed.
function placed(play, normalize) {
  const s = play.shot;
  if (!s?.has_coordinates || s.x === null || s.y === null) return { ok: false, why: 'coordinates' };
  if (!normalize) return { ok: true, x: s.x, y: s.y };
  if (s.target_net_x === null || s.target_net_x === undefined || !play.side) return { ok: false, why: 'direction' };
  const wantNet = play.side === 'home' ? 89 : -89;
  const flip = Math.sign(s.target_net_x) !== Math.sign(wantNet);
  return { ok: true, x: flip ? -s.x : s.x, y: flip ? -s.y : s.y };
}

function marker(play, x, y, label) {
  const sy = -y;
  const side = play.side === 'home' ? 'home' : 'away';
  const cls = `mk mk--${side}`;
  const shotType = String(play.shot?.shot_type || 'unknown');
  let shape;
  if (play.type === 'goal') shape = `<circle cx="${x}" cy="${sy}" r="2.9" class="${cls} mk--goal"/><circle cx="${x}" cy="${sy}" r="1.3" class="mk-core mk-core--${side}"/>`;
  else if (play.type === 'shot-on-goal') shape = `<circle cx="${x}" cy="${sy}" r="1.55" class="${cls}"/>`;
  else if (play.type === 'missed-shot') shape = `<path d="M${x - 1.4},${sy - 1.4} L${x + 1.4},${sy + 1.4} M${x - 1.4},${sy + 1.4} L${x + 1.4},${sy - 1.4}" class="${cls} mk--x"/>`;
  else shape = `<path d="M${x},${sy - 1.8} L${x + 1.7},${sy + 1.2} L${x - 1.7},${sy + 1.2} Z" class="${cls} mk--tri"/>`;
  const hoverRing = `<circle cx="${x}" cy="${sy}" r="4.7" class="mk-hover-ring"/>`;
  return `<g class="mk-g" data-sort="${play.sort_order}" data-shot-type="${esc(shotType)}" tabindex="-1"><title>${esc(label)}</title>${hoverRing}${shape}</g>`;
}

export function shotLabel(play, teams) {
  const s = play.shot;
  const shooter = play.players.find(p => p.role === 'scorer' || p.role === 'shooter');
  const team = play.side ? teams?.[play.side]?.abbrev : '';
  const bits = [
    `${periodLabel(play.period, play.period_type)} ${play.time_in_period || ''}`.trim(),
    team,
    TYPES[play.type] || play.type,
    shooter?.name,
    s?.shot_type,
    s?.distance_ft !== null && s?.distance_ft !== undefined ? `${s.distance_ft} ft` : null,
    play.strength?.label && play.strength.label !== '5v5' ? play.strength.label : null
  ];
  return bits.filter(Boolean).join(' · ');
}

// Returns { svg, plotted, omitted: { coordinates, direction } }.
export function renderRink(plays, { layer = 'all', team = 'both', period = 'all', normalize = true, teams = {}, highlight = null } = {}) {
  const omitted = { coordinates: 0, direction: 0 };
  let plotted = 0;
  const marks = [];
  const pool = plays.filter(p => p.shot && !p.shot.shootout
    && (team === 'both' || p.side === team)
    && (period === 'all' || String(p.period) === String(period))
    && layerMatch(p, layer));
  // Goals last so they sit on top.
  pool.sort((a, b) => (a.type === 'goal') - (b.type === 'goal'));
  for (const play of pool) {
    const pos = placed(play, normalize);
    if (!pos.ok) { omitted[pos.why] += 1; continue; }
    plotted += 1;
    marks.push(marker(play, pos.x, pos.y, shotLabel(play, teams)));
  }
  const hl = highlight ? pool.find(p => p.sort_order === highlight) : null;
  const hlPos = hl ? placed(hl, normalize) : null;
  const ring = hlPos?.ok ? `<circle cx="${hlPos.x}" cy="${-hlPos.y}" r="4.5" class="mk-ring"/>` : '';
  const svg = `<svg class="rink" viewBox="-101 -43.5 202 87" role="img" aria-label="Shot map: ${plotted} attempts plotted from source coordinates">
    ${RINK}<g class="rk-marks">${marks.join('')}</g>${ring}</svg>`;
  return { svg, plotted, omitted, total: pool.length };
}

export function rinkLegend() {
  return `<ul class="rink-legend" aria-label="Legend">
    <li><svg viewBox="-4 -4 8 8" aria-hidden="true"><circle r="2.9" class="mk mk--away mk--goal"/><circle r="1.3" class="mk-core mk-core--away"/></svg>Goal</li>
    <li><svg viewBox="-4 -4 8 8" aria-hidden="true"><circle r="1.8" class="mk mk--away"/></svg>On goal</li>
    <li><svg viewBox="-4 -4 8 8" aria-hidden="true"><path d="M-1.6,-1.6 L1.6,1.6 M-1.6,1.6 L1.6,-1.6" class="mk mk--away mk--x"/></svg>Missed</li>
    <li><svg viewBox="-4 -4 8 8" aria-hidden="true"><path d="M0,-2 L1.9,1.4 L-1.9,1.4 Z" class="mk mk--away mk--tri"/></svg>Blocked</li>
    <li><span class="sw sw--away"></span>Away · outline</li>
    <li><span class="sw sw--home"></span>Home · solid</li>
  </ul>`;
}
