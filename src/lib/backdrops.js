// Page backdrops: atmosphere behind each surface's header, never behind data.
// Only the current route's image is requested (no preloads — the Ice Board
// hero is the one landing image preloaded in index.html). AVIF via image-set
// with a WebP fallback; the file size is chosen from viewport width × DPR.
// Licensing for every photo: docs/IMAGE_SOURCES.md.

const DIR = '/assets/nhl/backdrops/';

// key -> focal points (desktop / mobile) and an optional opacity override.
// All nine are Pexels License photos (docs/image-sources/backdrops.md).
export const PHOTO_BACKDROPS = {
  cast:      { pos: '52% 46%', mpos: '50% 32%' },  // goalie in the crease under a floodlight
  props:     { pos: '50% 40%', mpos: '45% 45%' },  // dark scratched ice — terminal surface
  goalies:   { pos: '47% 65%', mpos: '50% 45%' },  // blocker, catcher, pads
  lines:     { pos: '50% 60%', mpos: '50% 60%' },  // a line on the bench side, cut at the waist
  injuries:  { pos: '50% 52%', mpos: '50% 50%', opacity: .5 },  // empty rink, kept restrained
  news:      { pos: '65% 70%', mpos: '60% 58%' },  // taped blades, locker-room floor
  matchups:  { pos: '58% 25%', mpos: '60% 45%' },  // faceoff, crossed sticks
  players:   { pos: '50% 55%', mpos: '55% 45%' },  // skater, ice spray
  standings: { pos: '50% 40%', mpos: '50% 45%' }   // stands, light through haze
};

// Owned generated art (no network): overhead rink geometry, data terminal.
const GENERATED = { shotlab: 'rink', methodology: 'rink-lines', track: 'terminal' };

const ROUTE_KEY = {
  cast: 'cast', props: 'props', goalies: 'goalies', lines: 'lines', injuries: 'injuries', news: 'news',
  matchup: 'matchups', players: 'players', standings: 'standings', shots: 'shotlab', track: 'track', methodology: 'methodology'
};

let supportsImageSet = null;
function imageSetOK() {
  if (supportsImageSet === null) {
    try { supportsImageSet = CSS.supports('background-image', 'image-set(url("a.avif") type("image/avif") 1x)'); } catch { supportsImageSet = false; }
  }
  return supportsImageSet;
}

export function backdropUrl(key, viewportWidth = window.innerWidth, dpr = window.devicePixelRatio || 1) {
  const mobile = viewportWidth <= 700;
  const need = Math.min(viewportWidth * dpr, 2000);
  const size = mobile ? 'm-700' : need <= 800 ? '800' : need <= 1400 ? '1400' : '2000';
  return { avif: `${DIR}${key}-${size}.avif`, webp: `${DIR}${key}-${size}.webp`, mobile };
}

export function applyBackdrop(wrap, routeId) {
  const el = wrap?.firstElementChild;
  if (!el) return;
  const key = ROUTE_KEY[routeId] || null;
  el.className = 'backdrop';
  el.style.backgroundImage = '';
  el.style.removeProperty('--bd-pos');
  el.style.removeProperty('opacity');
  const generated = key && GENERATED[key];
  const photo = key && PHOTO_BACKDROPS[key];
  if (!generated && !photo) { wrap.hidden = true; delete wrap.dataset.key; delete wrap.dataset.kind; return; }
  wrap.hidden = false;
  wrap.dataset.key = key;
  wrap.dataset.kind = generated ? 'generated' : 'photo';
  if (generated) {
    el.classList.add(`backdrop--${generated}`);
    return;
  }
  const { avif, webp, mobile } = backdropUrl(key);
  el.classList.add('backdrop--photo');
  el.style.setProperty('--bd-pos', (mobile ? photo.mpos : photo.pos) || '50% 40%');
  if (photo.opacity) el.style.opacity = String(photo.opacity);
  el.style.backgroundImage = imageSetOK()
    ? `image-set(url("${avif}") type("image/avif") 1x, url("${webp}") type("image/webp") 1x)`
    : `url("${webp}")`;
}
