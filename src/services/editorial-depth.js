import { esc, safeUrl } from '../lib/dom.js';
import { ageText } from '../lib/format.js';

// First-party editorial layer for NHL.PropBetEdge.ai.
// This reads the public PropBetEdge Sports News Cloudflare API. It does NOT
// replace the NHL source wire used for verified injuries, goalie/line status,
// transactions, schedules or alerts. Editorial leads; source-of-record data
// stays operationally authoritative.
const NEWS_API = 'https://propbet-news-api.sales-fd3.workers.dev';
const IMAGE_PROXY = 'https://propbet-img-proxy.sales-fd3.workers.dev/?url=';
const NEWS_SITE = 'https://propbetedge.ai';
const REFRESH_MS = 5 * 60 * 1000;
const MAX_ITEMS = 12;

const state = { items: [], loading: false, error: null, loadedAt: 0 };
let timer = null;
let observer = null;
let queued = false;

function articleUrl(article) {
  const slug = String(article?.slug || '').trim();
  return slug ? `${NEWS_SITE}/news/nhl/${encodeURIComponent(slug)}` : `${NEWS_SITE}/news/nhl`;
}

function imageUrl(raw) {
  const url = safeUrl(raw);
  if (!url) return null;
  if (url.startsWith(IMAGE_PROXY) || url.includes('propbetedge.ai')) return url;
  return `${IMAGE_PROXY}${encodeURIComponent(url)}`;
}

function normalize(article) {
  if (!article || typeof article !== 'object') return null;
  const title = String(article.title || '').trim();
  const publishedAt = String(article.published_at || '').trim();
  if (!title || !Number.isFinite(Date.parse(publishedAt))) return null;
  return {
    id: String(article.id || article.slug || title),
    slug: String(article.slug || '').trim(),
    title,
    published_at: new Date(publishedAt).toISOString(),
    summary: String(article.take?.summary || article.summary || '').trim(),
    image_url: imageUrl(article.image_url),
    impact: Number(article.take?.impact_score) || null,
    author: String(article.author || 'PropBetEdge Editorial').trim(),
    url: articleUrl(article)
  };
}

function relative(iso) {
  const seconds = (Date.now() - Date.parse(iso)) / 1000;
  return Number.isFinite(seconds) ? ageText(seconds) : '';
}

function media(article, cls = '') {
  return `<div class="pbeo-media ${cls}">${article.image_url
    ? `<img src="${esc(article.image_url)}" alt="" loading="lazy" decoding="async" onerror="this.remove();this.parentNode.classList.add('is-fallback')">`
    : ''}<span class="pbeo-media__fallback" aria-hidden="true"><i></i><b>PBE</b><small>NHL</small></span></div>`;
}

function impact(article) {
  return article.impact && article.impact >= 3 ? `<span class="pbeo-impact">Impact ${esc(article.impact)}/5</span>` : '';
}

function leadCard(article) {
  return `<a class="pbeo-lead" href="${esc(article.url)}" target="_blank" rel="noopener">
    ${media(article, 'pbeo-media--lead')}
    <div class="pbeo-lead__body">
      <div class="pbeo-meta"><span>PROPBETEDGE NHL</span>${impact(article)}<time datetime="${esc(article.published_at)}">${esc(relative(article.published_at))}</time></div>
      <h3>${esc(article.title)}</h3>
      ${article.summary ? `<p>${esc(article.summary)}</p>` : ''}
      <div class="pbeo-byline">${esc(article.author)} <span>Read original →</span></div>
    </div>
  </a>`;
}

function miniCard(article) {
  return `<a class="pbeo-mini" href="${esc(article.url)}" target="_blank" rel="noopener">
    ${media(article, 'pbeo-media--mini')}
    <div><div class="pbeo-meta"><span>PBE NHL</span><time datetime="${esc(article.published_at)}">${esc(relative(article.published_at))}</time></div><h4>${esc(article.title)}</h4>${article.summary ? `<p>${esc(article.summary)}</p>` : ''}</div>
  </a>`;
}

function newsroomPanel(items, full = false) {
  if (!items.length) return `<section class="pbeo pbeo--empty"><div class="pbeo-head"><div><span class="eyebrow">PropBetEdge NHL · Original reporting</span><h3>Newsroom feed temporarily unavailable</h3></div></div><p class="dim">The official/source wire below remains available. We do not replace a missing first-party feed with invented stories.</p></section>`;
  const [lead, ...rest] = items;
  const visible = full ? rest.slice(0, 11) : rest.slice(0, 3);
  return `<section class="pbeo${full ? ' pbeo--full' : ''}" data-pbe-originals>
    <div class="pbeo-head">
      <div><span class="eyebrow">PropBetEdge NHL · Original reporting</span><h3>${full ? 'The PBE NHL desk' : 'From our newsroom'}</h3></div>
      <div class="pbeo-head__right"><span class="pbeo-live"><i></i> First-party feed</span>${full ? '' : `<a href="${NEWS_SITE}/news/nhl" target="_blank" rel="noopener">All NHL reporting →</a>`}</div>
    </div>
    <div class="pbeo-grid">${leadCard(lead)}${visible.length ? `<div class="pbeo-stack">${visible.map(miniCard).join('')}</div>` : ''}</div>
    ${full && visible.length ? `<div class="pbeo-more">${visible.slice(3).map(miniCard).join('')}</div>` : ''}
  </section>`;
}

function boardPanel(items) {
  if (!items.length) return '';
  return `<section class="pbeo-board" data-pbe-originals-board>
    <div class="pbeo-board__head"><div><span class="eyebrow">PBE NHL Dispatch</span><h2>What our newsroom is watching</h2></div><a class="micro gold" href="#/news">Open Newsroom →</a></div>
    <div class="pbeo-board__grid">${items.slice(0, 3).map((article, index) => `<a href="${esc(article.url)}" target="_blank" rel="noopener" class="pbeo-board__story${index === 0 ? ' is-lead' : ''}">${index === 0 ? media(article, 'pbeo-media--board') : ''}<div><span class="pbeo-meta"><b>PBE NHL</b>${impact(article)}<time>${esc(relative(article.published_at))}</time></span><h3>${esc(article.title)}</h3>${index === 0 && article.summary ? `<p>${esc(article.summary)}</p>` : ''}</div></a>`).join('')}</div>
  </section>`;
}

function enhanceNews() {
  const root = document.querySelector('.dk-news');
  if (!root) return;

  const intro = root.querySelector('.section-head--editorial');
  if (intro) {
    const eyebrow = intro.querySelector('.eyebrow');
    const title = intro.querySelector('h2');
    const copy = intro.querySelector('p');
    if (eyebrow) eyebrow.textContent = 'PropBetEdge NHL Newsroom';
    if (title) title.textContent = 'Original reporting first. Source wire underneath.';
    if (copy) copy.textContent = 'PropBetEdge NHL reporting leads this desk. NHL.com and the external source wire remain underneath for official status, corroboration and market-moving context.';
  }

  const pbeTab = root.querySelector('[data-tab="PBE"]');
  if (pbeTab) {
    pbeTab.innerHTML = `PBE Originals${state.items.length ? `<span class="count">${state.items.length}</span>` : ''}`;
  }

  const pbeActive = Boolean(pbeTab?.classList.contains('is-active'));
  const teamControl = root.querySelector('.dk-n-team');
  const health = root.querySelector('#dk-n-health');
  const body = root.querySelector('#dk-n-body');

  let feature = root.querySelector('[data-pbe-originals]');
  if (pbeActive) {
    if (feature) feature.remove();
    if (teamControl) teamControl.hidden = true;
    if (health) health.hidden = true;
    if (body && !body.querySelector('[data-pbe-originals]')) body.innerHTML = newsroomPanel(state.items, true);
    root.querySelector('[data-pbe-wire-head]')?.remove();
    return;
  }

  if (teamControl) teamControl.hidden = false;
  if (health) health.hidden = false;
  const allActive = !root.querySelector('[data-tab].is-active') || root.querySelector('[data-tab="All"]')?.classList.contains('is-active');
  if (allActive) {
    if (!feature) {
      const banner = root.querySelector('#dk-n-banner');
      feature = document.createElement('div');
      feature.innerHTML = newsroomPanel(state.items, false);
      const node = feature.firstElementChild;
      if (banner && node) banner.parentNode.insertBefore(node, banner);
    }
    if (body && !root.querySelector('[data-pbe-wire-head]')) {
      const wire = document.createElement('div');
      wire.className = 'pbeo-wire-head';
      wire.dataset.pbeWireHead = '1';
      wire.innerHTML = '<span class="eyebrow">Verified source wire</span><b>NHL.com + external reporting</b><small>Operational status and corroboration remain source-of-record driven.</small>';
      body.parentNode.insertBefore(wire, body);
    }
  } else {
    feature?.remove();
    root.querySelector('[data-pbe-wire-head]')?.remove();
  }
}

function enhanceBoard() {
  const changes = document.querySelector('.wrap.changes');
  if (!changes || document.querySelector('[data-pbe-originals-board]') || !state.items.length) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = boardPanel(state.items);
  const node = wrap.firstElementChild;
  if (node) changes.parentNode.insertBefore(node, changes);
}

function apply() {
  queued = false;
  enhanceNews();
  enhanceBoard();
}

function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(apply);
}

async function load() {
  if (state.loading) return;
  state.loading = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`${NEWS_API}/news/by-sport/nhl?limit=${MAX_ITEMS}&page=1`, {
      credentials: 'omit',
      mode: 'cors',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`PBE NHL news ${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload?.articles) ? payload.articles.map(normalize).filter(Boolean) : [];
    items.sort((a, b) => b.published_at.localeCompare(a.published_at));
    state.items = items;
    state.error = null;
    state.loadedAt = Date.now();
  } catch (error) {
    state.error = String(error?.message || error);
  } finally {
    clearTimeout(timeout);
    state.loading = false;
    queue();
  }
}

export function startEditorialDepth() {
  if (window.PBENhlEditorialDepth) return window.PBENhlEditorialDepth;
  const host = document.getElementById('view-container') || document.querySelector('main');
  if (host) observer = new MutationObserver(queue), observer.observe(host, { childList: true, subtree: true });
  window.addEventListener('hashchange', queue);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - state.loadedAt > REFRESH_MS) load();
  });
  load();
  timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
  queue();
  window.PBENhlEditorialDepth = { state, refresh: load, apply };
  return window.PBENhlEditorialDepth;
}
