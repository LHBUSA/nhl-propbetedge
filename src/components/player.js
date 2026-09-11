import { esc, safeUrl } from '../lib/dom.js';
import { logoUrl, teamAccent } from '../lib/teams.js';
import portraits from '../data/player-portraits.json';

// Player identity, one component for the whole product.
// Photo source contract (docs/IMAGE_SOURCES.md): ONLY approved, licensed
// portraits listed in the manifest (Wikimedia Commons, CC0/PD/CC BY/CC BY-SA,
// cropped and reviewed). NHL.com headshots are not used (owner decision
// pending). Fallback: team-accented initials card with number and team mark.
// Never a broken image, never a fake photo.

const SIZES = { xs: 24, sm: 32, md: 48, lg: 88, xl: 168 };
const PHOTOS = portraits?.players || {};

export function playerPhoto(id) {
  const entry = PHOTOS[String(id)];
  return entry || null;
}

// Every published portrait with its attribution, for the credits list that
// compact avatars (title-only credit) rely on.
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

// opts: { id, name, team, position, number, size, credit, href }
export function playerIdentity({ id, name, team, position = null, number = null, size = 'md', credit = false, href = null, label = false } = {}) {
  const px = SIZES[size] || SIZES.md;
  const photo = id ? playerPhoto(id) : null;
  const accent = teamAccent(team);
  const logo = team && size !== 'xs' ? safeUrl(logoUrl({ abbrev: team })) : null;
  const ini = initials(name);
  const want = px * 2;
  const base = photo ? `/assets/players/${photo.file}` : null;
  const srcSize = want <= 96 ? 96 : want <= 192 ? 192 : 384;
  const img = photo
    ? `<img class="pid__img" src="${base}-${srcSize}.webp" srcset="${base}-96.webp 96w, ${base}-192.webp 192w, ${base}-384.webp 384w" sizes="${px}px" width="${px}" height="${px}" alt="" loading="lazy" decoding="async" title="${esc(photoCredit(photo))}" onload="this.parentNode.classList.add('is-loaded')" onerror="this.parentNode.classList.add('is-failed');this.remove()">`
    : '';
  const fallback = `<span class="pid__fallback" aria-hidden="true">${ini ? `<b>${esc(ini)}</b>` : '<i class="pid__pbe"></i>'}${number !== null && number !== undefined && size !== 'xs' && size !== 'sm' ? `<em>#${esc(number)}</em>` : ''}</span>`;
  const badge = logo && size !== 'sm' ? `<span class="pid__team" aria-hidden="true"><img src="${esc(logo)}" alt="" width="${Math.round(px * 0.34)}" height="${Math.round(px * 0.34)}" loading="lazy" decoding="async" onerror="this.parentNode.remove()"></span>` : '';
  const frame = `<span class="pid__frame${photo ? ' has-photo' : ''}">${fallback}${img}</span>`;
  const text = label ? `<span class="pid__text"><b>${esc(name || '')}</b>${position || team ? `<small>${esc([position, team].filter(Boolean).join(' · '))}</small>` : ''}</span>` : '';
  const creditLine = credit && photo ? `<small class="pid__credit">${esc(photoCredit(photo))}</small>` : '';
  const tag = href ? 'a' : 'span';
  return `<${tag} class="pid pid--${size}${label ? ' pid--labelled' : ''}" style="--pid:${px}px;--team:${accent}"${href ? ` href="${esc(href)}"` : ''}${!label && name ? ` title="${esc(name)}"` : ''}>${frame}${badge}${text}${creditLine}</${tag}>`;
}
