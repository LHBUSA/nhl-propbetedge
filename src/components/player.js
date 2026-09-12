import { esc, safeUrl } from '../lib/dom.js';
import { logoUrl, teamAccent } from '../lib/teams.js';
import portraits from '../data/player-portraits.json';

// Player identity, one component for the whole product.
// Priority: reviewed local portrait -> NHL asset-feed headshot -> branded
// initials/team fallback. Remote NHL images are requested through the shared
// PropBetEdge Cloudflare image proxy, never hotlinked from the browser.
// The product owner approved use of NHL player imagery for identity surfaces
// on 2026-09-11. This is a product decision, not a representation that PBE
// owns the underlying third-party image rights; see docs/NHL_PRODUCT_DEPTH_V1.md.
//
// Callers pass `headshot` whenever their payload already carries the league's
// own URL (the player profile and the club roster both do). Season/club URLs
// are only *constructed* when no authoritative URL was supplied, because a
// stale club abbreviation resolves to the league's generic silhouette rather
// than to an error the browser could fall back from.

const SIZES = { xs: 24, sm: 32, md: 48, lg: 88, xl: 168 };
const PHOTOS = portraits?.players || {};
const IMG_PROXY = 'https://propbet-img-proxy.sales-fd3.workers.dev/?url=';
const NHL_HEADSHOT_SEASONS = ['20262027', '20252026'];

// The shared image proxy answers every request with HTTP 200: an unreachable
// upstream comes back as a 1x1 transparent GIF. A 200 that decodes to 1x1 is
// therefore a failure and must fall through to the branded treatment instead
// of leaving an empty frame. Measured against the deployed proxy on
// 2026-09-12 (scripts/headshot-canary.mjs).
const SENTINEL_PX = 1;
const RUNTIME = '__pbePid';

if (typeof window !== 'undefined' && !window[RUNTIME]) {
  const runtime = {
    // Photo misses stay observable (window.__pbePid.misses) without writing to
    // the production console once per avatar.
    misses: 0,
    missed: [],
    next(img) {
      const queue = String(img.dataset.fallback || '').split('|').filter(Boolean);
      const frame = img.parentNode;
      if (queue.length) {
        img.dataset.fallback = queue.slice(1).join('|');
        img.classList.remove('pid__img--reviewed');
        img.classList.add('pid__img--official');
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.src = queue[0];
        return;
      }
      runtime.misses += 1;
      if (runtime.missed.length < 50) runtime.missed.push(img.currentSrc || img.src);
      if (import.meta.env.DEV) console.warn('[nhl-photo] no usable image; branded fallback kept:', img.currentSrc || img.src);
      frame?.classList.remove('is-loaded');
      frame?.classList.add('is-failed');
      img.remove();
    },
    loaded(img) {
      if (img.naturalWidth <= SENTINEL_PX || img.naturalHeight <= SENTINEL_PX) return runtime.next(img);
      img.parentNode?.classList.add('is-loaded');
    }
  };
  window[RUNTIME] = runtime;
}

const ON_LOAD = `window.${RUNTIME}.loaded(this)`;
const ON_ERROR = `window.${RUNTIME}.next(this)`;

export function playerPhoto(id) {
  const entry = PHOTOS[String(id)];
  return entry || null;
}

// Every published reviewed portrait with its attribution, for the credits list
// that compact avatars (title-only credit) rely on.
export function portraitCredits() {
  return Object.entries(PHOTOS)
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function photoCredit(entry) {
  if (!entry) return '';
  return entry.credit || `Photo: ${entry.author} · ${entry.license} · Wikimedia Commons`;
}

function initials(name) {
  const parts = String(name || '').replace(/\./g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function proxyImage(raw) {
  const url = safeUrl(raw);
  if (!url) return null;
  if (url.startsWith(IMG_PROXY)) return url;
  return `${IMG_PROXY}${encodeURIComponent(url)}`;
}

export function officialHeadshotCandidates(id, team, provided = null) {
  const playerId = String(id || '').trim();
  const club = String(team || '').trim().toUpperCase();
  const urls = [];
  // Authoritative first: the URL the NHL payload itself returned.
  const supplied = safeUrl(provided);
  if (supplied) urls.push(supplied);
  if (/^\d{6,10}$/.test(playerId) && /^[A-Z]{2,4}$/.test(club)) {
    NHL_HEADSHOT_SEASONS.forEach(season => {
      urls.push(`https://assets.nhle.com/mugs/nhl/${season}/${club}/${playerId}.png`);
    });
  }
  return [...new Set(urls)].map(proxyImage).filter(Boolean);
}

function imageMarkup({ photo, official, px, want, priority }) {
  const localBase = photo ? `/assets/players/${photo.file}` : null;
  const srcSize = want <= 96 ? 96 : want <= 192 ? 192 : 384;
  const officialPrimary = official[0] || null;
  const officialFallbacks = official.slice(1);
  // Only a hero identity is worth competing with the page's own LCP element.
  const loadAttrs = priority
    ? 'loading="eager" fetchpriority="high" decoding="async"'
    : 'loading="lazy" decoding="async"';

  if (photo) {
    const fallbacks = official.join('|');
    return `<img class="pid__img pid__img--reviewed" src="${localBase}-${srcSize}.webp" srcset="${localBase}-96.webp 96w, ${localBase}-192.webp 192w, ${localBase}-384.webp 384w" sizes="${px}px" width="${px}" height="${px}" alt="" ${loadAttrs} title="${esc(photoCredit(photo))}" data-fallback="${esc(fallbacks)}" onload="${ON_LOAD}" onerror="${ON_ERROR}">`;
  }

  if (officialPrimary) {
    const fallbacks = officialFallbacks.join('|');
    return `<img class="pid__img pid__img--official" src="${esc(officialPrimary)}" width="${px}" height="${px}" alt="" ${loadAttrs} title="Player image · NHL asset feed" data-fallback="${esc(fallbacks)}" onload="${ON_LOAD}" onerror="${ON_ERROR}">`;
  }

  return '';
}

// opts: { id, name, team, position, number, size, credit, href, label, headshot, priority }
export function playerIdentity({ id, name, team, position = null, number = null, size = 'md', credit = false, href = null, label = false, headshot = null, priority = false } = {}) {
  const px = SIZES[size] || SIZES.md;
  const photo = id ? playerPhoto(id) : null;
  const official = id ? officialHeadshotCandidates(id, team, headshot) : [];
  const hasImage = Boolean(photo || official.length);
  const accent = teamAccent(team);
  const logo = team && size !== 'xs' ? safeUrl(logoUrl({ abbrev: team })) : null;
  const ini = initials(name);
  const want = px * 2;
  const img = imageMarkup({ photo, official, px, want, priority });
  const fallback = `<span class="pid__fallback" aria-hidden="true">${ini ? `<b>${esc(ini)}</b>` : '<i class="pid__pbe"></i>'}${number !== null && number !== undefined && size !== 'xs' && size !== 'sm' ? `<em>#${esc(number)}</em>` : ''}</span>`;
  const badge = logo && size !== 'sm' ? `<span class="pid__team" aria-hidden="true"><img src="${esc(logo)}" alt="" width="${Math.round(px * 0.34)}" height="${Math.round(px * 0.34)}" loading="lazy" decoding="async" onerror="this.parentNode.remove()"></span>` : '';
  const frame = `<span class="pid__frame${hasImage ? ' has-photo' : ''}${!photo && official.length ? ' has-official-photo' : ''}">${fallback}${img}</span>`;
  const text = label ? `<span class="pid__text"><b>${esc(name || '')}</b>${position || team ? `<small>${esc([position, team].filter(Boolean).join(' · '))}</small>` : ''}</span>` : '';
  const creditText = photo ? photoCredit(photo) : (official.length ? 'Player image: NHL asset feed' : '');
  const creditLine = credit && creditText ? `<small class="pid__credit">${esc(creditText)}</small>` : '';
  const tag = href ? 'a' : 'span';
  return `<${tag} class="pid pid--${size}${label ? ' pid--labelled' : ''}" style="--pid:${px}px;--team:${accent}"${href ? ` href="${esc(href)}"` : ''}${!label && name ? ` title="${esc(name)}"` : ''}>${frame}${badge}${text}${creditLine}</${tag}>`;
}
