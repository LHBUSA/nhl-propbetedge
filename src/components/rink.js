import { esc } from '../lib/dom.js';
import { periodLabel } from '../lib/format.js';

// Regulation NHL rink in feet, centre ice at (0,0): 200 x 85, corner radius 28,
// goal lines at x = +/-89, blue lines at +/-25, end-zone faceoff circles at
// (+/-69, +/-22). SVG y is flipped so source +y renders upward.
//
// The coordinate system is PHYSICAL and is never rescaled: every shot is drawn
// at its own source coordinate in feet. Stroke widths are therefore also in
// feet, which is why boards, lines and markers carry vector-effect
// "non-scaling-stroke" — the geometry stays true while the strokes stay one
// device pixel crisp from a 390px phone to a 4K panel.

// Shared definitions. Defined ONCE per rink and referenced by <use> or by
// url(#id), never duplicated per marker: a filter instance per shot would make
// live polling expensive for no visual gain.
//
// IDs are stable rather than randomised. Two rinks in one document would share
// them, and because every definition is geometrically identical that resolves
// to the same picture; a random suffix would only defeat SVG caching.
const DEFS = `
  <defs>
    <!-- centre illumination falling off toward the boards -->
    <radialGradient id="pbe-ice" cx="50%" cy="50%" r="72%">
      <stop offset="0%" stop-color="#23262a"/>
      <stop offset="55%" stop-color="#1b1d1f"/>
      <stop offset="100%" stop-color="#131517"/>
    </radialGradient>

    <!-- the boards read as a physical edge, not a glowing outline -->
    <filter id="pbe-board-depth" x="-6%" y="-14%" width="112%" height="128%">
      <feDropShadow dx="0" dy="0" stdDeviation="1.1" flood-color="#000" flood-opacity=".55"/>
    </filter>

    <!-- one restrained glow, shared by goals and the highlighted attempt -->
    <filter id="pbe-mk-glow" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation=".9" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <!-- end-zone faceoff circle + dot: four instances -->
    <symbol id="pbe-faceoff" overflow="visible">
      <circle r="15" class="rk-circle" vector-effect="non-scaling-stroke"/>
      <circle r="1" class="rk-dot"/>
    </symbol>

    <!-- neutral-zone faceoff dot: four instances -->
    <symbol id="pbe-nz-dot" overflow="visible">
      <circle r="1" class="rk-dot"/>
    </symbol>

    <!-- crease, drawn for the right-hand net and mirrored for the left -->
    <symbol id="pbe-crease" overflow="visible">
      <path d="M0,-4 L-4.5,-4 A4.5,4.5 0 0,0 -4.5,4 L0,4 Z" class="rk-crease" vector-effect="non-scaling-stroke"/>
    </symbol>

    <!-- net, drawn behind the right-hand goal line and mirrored for the left -->
    <symbol id="pbe-net" overflow="visible">
      <rect x="0" y="-3" width="3.3" height="6" class="rk-net" vector-effect="non-scaling-stroke"/>
    </symbol>
  </defs>`;

// Static rink geometry, grouped semantically so a future interaction layer has
// somewhere to attach. The groups carry data-zone rather than hover analytics:
// we do not have zone-level data and do not pretend to.
const RINK = `
  <g class="rk-surface">
    <rect x="-100" y="-42.5" width="200" height="85" rx="28" ry="28" class="rk-ice"/>
  </g>

  <g class="rk-zones" aria-hidden="true">
    <g class="rk-zone rk-zone--left" data-zone="end"><rect x="-100" y="-42.5" width="75" height="85" class="rk-zone-hit"/></g>
    <g class="rk-zone rk-zone--neutral" data-zone="neutral"><rect x="-25" y="-42.5" width="50" height="85" class="rk-zone-hit"/></g>
    <g class="rk-zone rk-zone--right" data-zone="end"><rect x="25" y="-42.5" width="75" height="85" class="rk-zone-hit"/></g>
  </g>

  <g class="rk-markings" aria-hidden="true">
    <line x1="0" y1="-42.5" x2="0" y2="42.5" class="rk-red rk-center" vector-effect="non-scaling-stroke"/>
    <line x1="-25" y1="-42.5" x2="-25" y2="42.5" class="rk-blue" vector-effect="non-scaling-stroke"/>
    <line x1="25" y1="-42.5" x2="25" y2="42.5" class="rk-blue" vector-effect="non-scaling-stroke"/>
    <line x1="-89" y1="-36.8" x2="-89" y2="36.8" class="rk-red rk-thin" vector-effect="non-scaling-stroke"/>
    <line x1="89" y1="-36.8" x2="89" y2="36.8" class="rk-red rk-thin" vector-effect="non-scaling-stroke"/>
    <circle cx="0" cy="0" r="15" class="rk-circle rk-blue-stroke" vector-effect="non-scaling-stroke"/>
    <circle cx="0" cy="0" r=".6" class="rk-dot-blue"/>
    <use href="#pbe-faceoff" x="-69" y="-22"/>
    <use href="#pbe-faceoff" x="-69" y="22"/>
    <use href="#pbe-faceoff" x="69" y="-22"/>
    <use href="#pbe-faceoff" x="69" y="22"/>
    <use href="#pbe-nz-dot" x="-20" y="-22"/>
    <use href="#pbe-nz-dot" x="-20" y="22"/>
    <use href="#pbe-nz-dot" x="20" y="-22"/>
    <use href="#pbe-nz-dot" x="20" y="22"/>
    <use href="#pbe-crease" x="89" y="0"/>
    <use href="#pbe-crease" x="-89" y="0" transform="scale(-1,1)" transform-origin="-89 0"/>
    <use href="#pbe-net" x="89" y="0"/>
    <use href="#pbe-net" x="-89" y="0" transform="scale(-1,1)" transform-origin="-89 0"/>
    <path d="M89,-11 L100,-14 M89,11 L100,14 M-89,-11 L-100,-14 M-89,11 L-100,14" class="rk-red rk-thin" vector-effect="non-scaling-stroke"/>
  </g>

  <rect x="-100" y="-42.5" width="200" height="85" rx="28" ry="28" class="rk-boards" vector-effect="non-scaling-stroke"/>`;

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
  const ns = 'vector-effect="non-scaling-stroke"';
  let shape;
  if (play.type === 'goal') shape = `<circle cx="${x}" cy="${sy}" r="2.9" class="${cls} mk--goal" ${ns}/><circle cx="${x}" cy="${sy}" r="1.3" class="mk-core mk-core--${side}"/>`;
  else if (play.type === 'shot-on-goal') shape = `<circle cx="${x}" cy="${sy}" r="1.55" class="${cls}" ${ns}/>`;
  else if (play.type === 'missed-shot') shape = `<path d="M${x - 1.4},${sy - 1.4} L${x + 1.4},${sy + 1.4} M${x - 1.4},${sy + 1.4} L${x + 1.4},${sy - 1.4}" class="${cls} mk--x" ${ns}/>`;
  else shape = `<path d="M${x},${sy - 1.8} L${x + 1.7},${sy + 1.2} L${x - 1.7},${sy + 1.2} Z" class="${cls} mk--tri" ${ns}/>`;
  const hoverRing = `<circle cx="${x}" cy="${sy}" r="4.7" class="mk-hover-ring" ${ns}/>`;
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
  const ring = hlPos?.ok ? `<circle cx="${hlPos.x}" cy="${-hlPos.y}" r="4.5" class="mk-ring" vector-effect="non-scaling-stroke"/>` : '';
  // The trajectory layer exists so a future release can draw a real path. It is
  // deliberately EMPTY: we hold no start/end path data, and an invented arc
  // would be a fabricated claim about where a puck travelled.
  const svg = `<svg class="rink" viewBox="-101 -43.5 202 87" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Shot map: ${plotted} attempts plotted from source coordinates">
    ${DEFS}${RINK}<g class="rk-trajectories"></g><g class="rk-marks">${marks.join('')}</g>${ring}</svg>`;
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
