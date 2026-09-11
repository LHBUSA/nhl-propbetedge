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

const SIZES = { xs: 24, sm: 32, md: 48, lg: 88, xl: 168 };
const PHOTOS = portraits?.players || {};
const IMG_PROXY = 'https://propbet-img-proxy.sales-fd3.workers.dev/?url=';
const NHL_HEADSHOT_SEASONS = ['20262027', '20252026'];

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

function officialHeadshotCandidates(id, team, provided = null) {
  const playerId = String(id || '').trim();
  const club = String(team || '').trim().toUpperCase();
  const urls = [];
  const supplied = safeUrl(provided);
  if (supplied) urls.push(supplied);
  if (/^\d{6,10}$/.test(playerId) && /^[A-Z]{2,4}$/.test(club)) {
    NHL_HEADSHOT_SEASONS.forEach(season => {
      urls.push(`https://assets.nhle.com/mugs/nhl/${season}/${club}/${playerId}.png`);
    });
  }
  return [...new Set(urls)].map(proxyImage).filter(Boolean);
}

function imageMarkup({ photo, official, px, want }) {
  const localBase = photo ? `/assets/players/${photo.file}` : null;
  const srcSize = want <= 96 ? 96 : want <= 192 ? 192 : 384;
  const officialPrimary = official[0] || null;
  const officialFallbacks = official.slice(1);

  if (photo) {
    const fallbacks = official.join('|');
    return `<img class="pid__img pid__img--reviewed" src="${localBase}-${srcSize}.webp" srcset="${localBase}-96.webp 96w, ${localBase}-192.webp 192w, ${localBase}-384.webp 384w" sizes="${px}px" width="${px}" height="${px}" alt="" loading="lazy" decoding="async" title="${esc(photoCredit(photo))}" data-fallback="${esc(fallbacks)}" onload="this.parentNode.classList.add('is-loaded')" onerror="const q=(this.dataset.fallback||'').split('|').filter(Boolean);if(q.length){this.dataset.fallback=q.slice(1).join('|');this.classList.remove('pid__img--reviewed');this.classList.add('pid__img--official');this.removeAttribute('srcset');this.src=q[0];return;}this.parentNode.classList.add('is-failed');this.remove()">`;
  }

  if (officialPrimary) {
    const fallbacks = officialFallbacks.join('|');
    return `<img class="pid__img pid__img--official" src="${esc(officialPrimary)}" width="${px}" height="${px}" alt="" loading="lazy" decoding="async" title="Player image · NHL asset feed" data-fallback="${esc(fallbacks)}" onload="this.parentNode.classList.add('is-loaded')" onerror="const q=(this.dataset.fallback||'').split('|').filter(Boolean);if(q.length){this.dataset.fallback=q.slice(1).join('|');this.src=q[0];return;}this.parentNode.classList.add('is-failed');this.remove()">`;
  }

  return '';
}

// opts: { id, name, team, position, number, size, credit, href, label, headshot }
export function playerIdentity({ id, name, team, position = null, number = null, size = 'md', credit = false, href = null, label = false, headshot = null } = {}) {
  const px = SIZES[size] || SIZES.md;
  const photo = id ? playerPhoto(id) : null;
  const official = id ? officialHeadshotCandidates(id, team, headshot) : [];
  const hasImage = Boolean(photo || official.length);
  const accent = teamAccent(team);
  const logo = team && size !== 'xs' ? safeUrl(logoUrl({ abbrev: team })) : null;
  const ini = initials(name);
  const want = px * 2;
  const img = imageMarkup({ photo, official, px, want });
  const fallback = `<span class="pid__fallback" aria-hidden="true">${ini ? `<b>${esc(ini)}</b>` : '<i class="pid__pbe"></i>'}${number !== null && number !== undefined && size !== 'xs' && size !== 'sm' ? `<em>#${esc(number)}</em>` : ''}</span>`;
  const badge = logo && size !== 'sm' ? `<span class="pid__team" aria-hidden="true"><img src="${esc(logo)}" alt="" width="${Math.round(px * 0.34)}" height="${Math.round(px * 0.34)}" loading="lazy" decoding="async" onerror="this.parentNode.remove()"></span>` : '';
  const frame = `<span class="pid__frame${hasImage ? ' has-photo' : ''}${!photo && official.length ? ' has-official-photo' : ''}">${fallback}${img}</span>`;
  const text = label ? `<span class="pid__text"><b>${esc(name || '')}</b>${position || team ? `<small>${esc([position, team].filter(Boolean).join(' · '))}</small>` : ''}</span>` : '';
  const creditText = photo ? photoCredit(photo) : (official.length ? 'Player image: NHL asset feed' : '');
  const creditLine = credit && creditText ? `<small class="pid__credit">${esc(creditText)}</small>` : '';
  const tag = href ? 'a' : 'span';
  return `<${tag} class="pid pid--${size}${label ? ' pid--labelled' : ''}" style="--pid:${px}px;--team:${accent}"${href ? ` href="${esc(href)}"` : ''}${!label && name ? ` title="${esc(name)}"` : ''}>${frame}${badge}${text}${creditLine}</${tag}>`;
}
