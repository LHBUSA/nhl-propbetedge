// Page backdrops: atmosphere behind each surface.
//
// Two layers share one file per route:
//   - the band at the top of the page (.backdrop-wrap), as before;
//   - the floor (.backdrop-floor), fixed to the bottom of the viewport, so the
//     page still has ice and arena light under it however far you scroll.
// The floor re-uses the URL the band already requested, so it costs no extra
// request and no extra bytes. The always-on field behind both of them
// (.atmos) is pure CSS — see src/styles/atmosphere.css.
//
// Only the current route's image is requested (no preloads — the Ice Board
// hero is the one landing image preloaded in index.html). AVIF via image-set
// with a WebP fallback; the file size is chosen from viewport width × DPR.
// Licensing for every photo: docs/IMAGE_SOURCES.md.

const DIR = '/assets/nhl/backdrops/';

// key -> focal points (desktop / mobile) and an optional opacity override.
// All nine are Pexels License photos (docs/image-sources/backdrops.md).
//
// `floor` is how strongly that photo is allowed to read at the bottom of the
// viewport, and `fpos` is the crop it uses there — usually a different part of
// the frame from the top band, so the two layers do not read as one repeat.
// Dense data surfaces (standings, props, injuries) are deliberately quiet.
export const PHOTO_BACKDROPS = {
  cast:      { pos: '52% 46%', mpos: '50% 32%', floor: .30, fpos: '50% 18%' },  // goalie in the crease under a floodlight
  props:     { pos: '50% 40%', mpos: '45% 45%', floor: .16, fpos: '50% 62%' },  // dark scratched ice — terminal surface
  goalies:   { pos: '47% 65%', mpos: '50% 45%', floor: .20, fpos: '50% 25%' },  // blocker, catcher, pads
  lines:     { pos: '50% 60%', mpos: '50% 60%', floor: .22, fpos: '50% 80%' },  // a line on the bench side, cut at the waist
  injuries:  { pos: '50% 52%', mpos: '50% 50%', opacity: .5, floor: .17, fpos: '50% 28%' },  // empty rink, kept restrained
  news:      { pos: '65% 70%', mpos: '60% 58%', floor: .26, fpos: '60% 28%' },  // taped blades, locker-room floor
  matchups:  { pos: '58% 25%', mpos: '60% 45%', floor: .28, fpos: '55% 72%' },  // faceoff, crossed sticks
  players:   { pos: '50% 55%', mpos: '55% 45%', floor: .26, fpos: '50% 24%' },  // skater, ice spray
  standings: { pos: '50% 40%', mpos: '50% 45%', floor: .13, fpos: '50% 22%' },  // stands, light through haze
  // Routes that used to carry generated SVG art (and the team + PBE Picks pages)
  // re-use one of the nine licensed plates above: `file` names the plate.
  team:        { file: 'players',   pos: '50% 50%', mpos: '55% 45%', floor: .22, fpos: '50% 70%' },
  shotlab:     { file: 'props',     pos: '50% 48%', mpos: '45% 45%', floor: .18, fpos: '50% 30%' },
  track:       { file: 'standings', pos: '50% 34%', mpos: '50% 40%', floor: .22, fpos: '50% 60%' },
  methodology: { file: 'injuries',  pos: '50% 50%', mpos: '50% 50%', opacity: .55, floor: .16, fpos: '50% 30%' },
  picks:       { file: 'cast',      pos: '52% 40%', mpos: '50% 30%', floor: .26, fpos: '50% 70%' },
  // Intelligence routes (2026-09-25) re-use licensed plates; no new asset.
  winhl:       { file: 'players',   pos: '50% 42%', mpos: '55% 40%', floor: .24, fpos: '50% 68%' },
  fatigue:     { file: 'lines',     pos: '50% 55%', mpos: '50% 55%', floor: .20, fpos: '50% 78%' },
  fights:      { file: 'matchups',  pos: '58% 30%', mpos: '60% 45%', floor: .24, fpos: '55% 70%' },
  teams:       { file: 'standings', pos: '50% 38%', mpos: '50% 45%', floor: .16, fpos: '50% 24%' }
};

// Generated SVG route art is retired: every backdrop is a licensed raster plate.
const GENERATED = {};

// The Ice Board has its own full-bleed hero, so it takes no top band — but it
// still gets a floor, from the arena/stands plate, so the long scroll below the
// hero is not the flat slab it used to be.
const FLOOR_ONLY = { board: { key: 'standings', floor: .22, fpos: '50% 26%' } };

const ROUTE_KEY = {
  cast: 'cast', props: 'props', goalies: 'goalies', lines: 'lines', injuries: 'injuries', news: 'news',
  matchup: 'matchups', players: 'players', standings: 'standings', shots: 'shotlab', track: 'track', methodology: 'methodology',
  team: 'team', picks: 'picks', winhl: 'winhl', fatigue: 'fatigue', fights: 'fights', teams: 'teams'
};

let supportsImageSet = null;
function imageSetOK() {
  if (supportsImageSet === null) {
    try { supportsImageSet = CSS.supports('background-image', 'image-set(url("a.avif") type("image/avif") 1x)'); } catch { supportsImageSet = false; }
  }
  return supportsImageSet;
}

export function backdropUrl(key, viewportWidth = window.innerWidth, dpr = window.devicePixelRatio || 1) {
  key = PHOTO_BACKDROPS[key]?.file || key;
  const mobile = viewportWidth <= 700;
  const need = Math.min(viewportWidth * dpr, 2000);
  const size = mobile ? 'm-700' : need <= 800 ? '800' : need <= 1400 ? '1400' : '2000';
  return { avif: `${DIR}${key}-${size}.avif`, webp: `${DIR}${key}-${size}.webp`, mobile };
}

function cssImage(key, { small = false } = {}) {
  // The floor is masked, screen-blended and sits under .3 opacity, so when it
  // is the ONLY thing requesting a plate it takes the small variant. Where a
  // band is already on screen the floor must reuse that exact URL instead, or
  // it would add a request rather than share one.
  const { avif, webp } = small
    ? backdropUrl(key, 800, 1)
    : backdropUrl(key);
  return imageSetOK()
    ? `image-set(url("${avif}") type("image/avif") 1x, url("${webp}") type("image/webp") 1x)`
    : `url("${webp}")`;
}

// Off the critical path: the Ice Board's floor plate is the one image this pass
// adds anywhere, and it must never compete with the hero for bandwidth.
const idle = cb => (typeof requestIdleCallback === 'function'
  ? requestIdleCallback(cb, { timeout: 2500 })
  : setTimeout(cb, 900));

// The floor never introduces a download of its own: it is only turned on for a
// key whose band is already being requested for this route, or (Ice Board) for
// the one plate that route is allowed to carry.
let floorToken = 0;
function applyFloor(floor, key, strength, pos, { small = false, defer = false } = {}) {
  if (!floor) return;
  const mine = ++floorToken;
  if (!key) {
    floor.classList.remove('is-on');
    floor.style.removeProperty('--bdf-img');
    return;
  }
  const paint = () => {
    if (mine !== floorToken) return; // the route changed while we waited
    floor.style.setProperty('--bdf-img', cssImage(key, { small }));
    floor.style.setProperty('--bdf-o', String(strength));
    floor.style.setProperty('--bdf-pos', pos);
    floor.classList.add('is-on');
  };
  if (defer) { floor.classList.remove('is-on'); idle(paint); } else paint();
}

export function applyBackdrop(wrap, routeId, floor = null) {
  const el = wrap?.firstElementChild;
  if (!el) return;
  const key = ROUTE_KEY[routeId] || null;
  el.className = 'backdrop';
  el.style.backgroundImage = '';
  el.style.removeProperty('--bd-pos');
  el.style.removeProperty('opacity');
  const generated = key && GENERATED[key];
  const photo = key && PHOTO_BACKDROPS[key];
  if (!generated && !photo) {
    wrap.hidden = true;
    delete wrap.dataset.key;
    delete wrap.dataset.kind;
    const only = FLOOR_ONLY[routeId];
    if (only) applyFloor(floor, only.key, only.floor, only.fpos, { small: true, defer: true });
    else applyFloor(floor, null);
    return;
  }
  wrap.hidden = false;
  wrap.dataset.key = key;
  wrap.dataset.kind = generated ? 'generated' : 'photo';
  if (generated) {
    el.classList.add(`backdrop--${generated}`);
    // Generated art is a flat tile; the floor stays off rather than repeating it.
    applyFloor(floor, null);
    return;
  }
  const { mobile } = backdropUrl(key);
  el.classList.add('backdrop--photo');
  el.style.setProperty('--bd-pos', (mobile ? photo.mpos : photo.pos) || '50% 40%');
  if (photo.opacity) el.style.opacity = String(photo.opacity);
  el.style.backgroundImage = cssImage(key);
  applyFloor(floor, key, photo.floor ?? .15, photo.fpos || '50% 30%');
}
