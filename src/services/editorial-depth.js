import { esc, safeUrl } from '../lib/dom.js';
import { ageText } from '../lib/format.js';
import { TEAM_BY_ABBREV, logoUrl } from '../lib/teams.js';

// Primary editorial layer for NHL.PropBetEdge.ai.
//
// Important boundary: the generic Sports News feed contains both raw source
// metadata and PBE-authored analysis. This module publishes ONLY the authored
// PBE-analysis subset and intentionally does not render upstream summaries,
// upstream article images, source bodies, or generated bet advice. The source
// outlet/link remains attached to every PBE card.
//
// Operational truth remains in the NHL source wire (injuries, goalies, lines,
// transactions, schedules, alerts). Editorial never replaces source-of-record
// state.
const NEWS_API = 'https://propbet-news-api.sales-fd3.workers.dev';
const NEWS_SITE = 'https://propbetedge.ai';
const REFRESH_MS = 5 * 60 * 1000;
const FETCH_LIMIT = 50;
const MAX_ITEMS = 12;

const SOURCE_LABELS = {
  'the-hockey-writers': 'The Hockey Writers',
  'daily-faceoff': 'Daily Faceoff',
  'nhl-rumors': 'NHL Rumors',
  espn: 'ESPN',
  nhl: 'NHL.com',
  'nhl.com': 'NHL.com'
};

const state = { items: [], loading: false, error: null, loadedAt: 0 };
let timer = null;
let observer = null;
let queued = false;

function articleUrl(article) {
  const slug = String(article?.slug || '').trim();
  return slug ? `${NEWS_SITE}/news/nhl/${encodeURIComponent(slug)}` : `${NEWS_SITE}/news/nhl`;
}

function sourceLabel(source) {
  const key = String(source || '').trim().toLowerCase();
  if (!key) return 'source reporting';
  return SOURCE_LABELS[key] || key.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function isPbeAnalysis(article) {
  const author = String(article?.author || '').trim();
  const body = String(article?.body || '').trim();
  const source = String(article?.source || '').trim();
  const sourceUrl = safeUrl(article?.source_url);
  const title = String(article?.title || '').trim();
  const slug = String(article?.slug || '').trim();
  // Raw ingested wire rows have no PBE byline/body. Requiring both gives this
  // surface a deterministic distinction between PBE analysis and source wire.
  return Boolean(author && body.length >= 500 && source && sourceUrl && title && slug);
}

function normalize(article) {
  if (!isPbeAnalysis(article)) return null;
  const publishedAt = String(article.published_at || '').trim();
  if (!Number.isFinite(Date.parse(publishedAt))) return null;
  const teams = Array.isArray(article?.take?.teams)
    ? article.take.teams.map(v => String(v || '').trim().toUpperCase()).filter(Boolean)
    : [];
  return {
    id: String(article.id || article.slug || article.title),
    slug: String(article.slug || '').trim(),
    title: String(article.title || '').trim(),
    published_at: new Date(publishedAt).toISOString(),
    impact: Number(article?.take?.impact_score) || null,
    teams,
    url: articleUrl(article),
    source: String(article.source || '').trim(),
    source_label: sourceLabel(article.source),
    source_url: safeUrl(article.source_url)
  };
}

function relative(iso) {
  const seconds = (Date.now() - Date.parse(iso)) / 1000;
  return Number.isFinite(seconds) ? ageText(seconds) : '';
}

function primaryTeam(article) {
  return article.teams.find(team => TEAM_BY_ABBREV.has(team)) || null;
}

function media(article, cls = '') {
  const team = primaryTeam(article);
  const logo = team ? safeUrl(logoUrl({ abbrev: team })) : null;
  return `<div class="pbeo-media ${cls}${logo ? ' pbeo-media--team' : ''}">
    ${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" decoding="async" onerror="this.remove();this.parentNode.classList.add('is-fallback')">` : ''}
    <span class="pbeo-media__fallback" aria-hidden="true"><i></i><b>PBE</b><small>${team ? esc(team) : 'NHL'}</small></span>
  </div>`;
}

function impact(article) {
  return article.impact && article.impact >= 3
    ? `<span class="pbeo-impact">PBE impact ${esc(article.impact)}/5</span>`
    : '';
}

function provenance(article) {
  return `<div class="pbeo-provenance"><span>PBE analysis based on attributed reporting</span><a href="${esc(article.source_url)}" target="_blank" rel="noopener">Source: ${esc(article.source_label)} ↗</a></div>`;
}

function leadCard(article) {
  return `<article class="pbeo-lead">
    ${media(article, 'pbeo-media--lead')}
    <div class="pbeo-lead__body">
      <div class="pbeo-meta"><span>PROPBETEDGE NHL</span>${impact(article)}<time datetime="${esc(article.published_at)}">${esc(relative(article.published_at))}</time></div>
      <a class="pbeo-story-link" href="${esc(article.url)}" target="_blank" rel="noopener"><h3>${esc(article.title)}</h3></a>
      ${provenance(article)}
      <div class="pbeo-byline"><span>PropBetEdge NHL Desk</span><a href="${esc(article.url)}" target="_blank" rel="noopener">Read PBE analysis →</a></div>
    </div>
  </article>`;
}

function miniCard(article) {
  return `<article class="pbeo-mini">
    ${media(article, 'pbeo-media--mini')}
    <div><div class="pbeo-meta"><span>PBE NHL</span><time datetime="${esc(article.published_at)}">${esc(relative(article.published_at))}</time></div>
      <a class="pbeo-story-link" href="${esc(article.url)}" target="_blank" rel="noopener"><h4>${esc(article.title)}</h4></a>
      <div class="pbeo-mini__source"><a href="${esc(article.source_url)}" target="_blank" rel="noopener">Source: ${esc(article.source_label)} ↗</a></div>
    </div>
  </article>`;
}

function newsroomPanel(items, full = false) {
  if (!items.length) {
    return `<section class="pbeo pbeo--empty" data-pbe-originals><div class="pbeo-head"><div><span class="eyebrow">PropBetEdge NHL Desk</span><h3>PBE analysis feed temporarily unavailable</h3></div></div><p class="dim">The verified source wire remains available below. No source story is relabeled as PBE analysis when the authored feed is unavailable.</p></section>`;
  }
  const [lead, ...rest] = items;
  const visible = full ? rest.slice(0, 11) : rest.slice(0, 3);
  return `<section class="pbeo${full ? ' pbeo--full' : ''}" data-pbe-originals>
    <div class="pbeo-head">
      <div><span class="eyebrow">PropBetEdge NHL Desk · PBE analysis</span><h3>${full ? 'Our NHL intelligence desk' : 'From the PBE NHL desk'}</h3></div>
      <div class="pbeo-head__right"><span class="pbeo-live"><i></i> First-party analysis</span>${full ? '' : `<a href="${NEWS_SITE}/news/nhl" target="_blank" rel="noopener">All PBE NHL articles →</a>`}</div>
    </div>
    <p class="pbeo-disclosure">PBE analysis leads this editorial surface. Every story keeps its underlying reporting source attached; operational NHL status remains source-wire driven.</p>
    <div class="pbeo-grid">${leadCard(lead)}${visible.length ? `<div class="pbeo-stack">${visible.map(miniCard).join('')}</div>` : ''}</div>
    ${full && visible.length > 3 ? `<div class="pbeo-more">${visible.slice(3).map(miniCard).join('')}</div>` : ''}
  </section>`;
}

function boardPanel(items) {
  if (!items.length) return '';
  return `<section class="pbeo-board" data-pbe-originals-board>
    <div class="pbeo-board__head"><div><span class="eyebrow">PBE NHL Dispatch</span><h2>What our NHL desk is analyzing</h2></div><a class="micro gold" href="#/news">Open Newsroom →</a></div>
    <div class="pbeo-board__grid">${items.slice(0, 3).map((article, index) => `<article class="pbeo-board__story${index === 0 ? ' is-lead' : ''}">${index === 0 ? media(article, 'pbeo-media--board') : ''}<div><span class="pbeo-meta"><b>PBE NHL</b>${impact(article)}<time>${esc(relative(article.published_at))}</time></span><a class="pbeo-story-link" href="${esc(article.url)}" target="_blank" rel="noopener"><h3>${esc(article.title)}</h3></a><div class="pbeo-mini__source"><a href="${esc(article.source_url)}" target="_blank" rel="noopener">Source: ${esc(article.source_label)} ↗</a></div></div></article>`).join('')}</div>
  </section>`;
}

function sig() {
  return state.items.map(a => `${a.id}:${a.published_at}`).join('|') || `empty:${state.error || 'none'}`;
}

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

function enhanceNews() {
  const root = document.querySelector('.dk-news');
  if (!root) return;

  const intro = root.querySelector('.section-head--editorial');
  if (intro) {
    setText(intro.querySelector('.eyebrow'), 'PropBetEdge NHL Newsroom');
    setText(intro.querySelector('h2'), 'PBE analysis first. Verified source wire underneath.');
    setText(intro.querySelector('p'), 'Our NHL desk leads the editorial experience. Every PBE article keeps its underlying reporting source attached, while operational status remains grounded in the verified NHL source wire.');
  }

  const pbeTab = root.querySelector('[data-tab="PBE"]');
  if (pbeTab) {
    const label = `PBE NHL${state.items.length ? ` · ${state.items.length}` : ''}`;
    setText(pbeTab, label);
  }

  const pbeActive = Boolean(pbeTab?.classList.contains('is-active'));
  const allActive = Boolean(root.querySelector('[data-tab="All"]')?.classList.contains('is-active'));
  const teamControl = root.querySelector('.dk-n-team');
  const health = root.querySelector('#dk-n-health');
  const banner = root.querySelector('#dk-n-banner');
  const body = root.querySelector('#dk-n-body');
  const signature = sig();

  if (pbeActive) {
    if (teamControl) teamControl.hidden = true;
    if (health) health.hidden = true;
    if (banner) banner.hidden = true;
    root.querySelector('[data-pbe-wire-head]')?.remove();
    root.querySelector(':scope > [data-pbe-originals]')?.remove();
    if (body && (body.dataset.pbeEditorialSig !== signature || !body.querySelector('[data-pbe-originals]'))) {
      body.dataset.pbeEditorialSig = signature;
      body.innerHTML = newsroomPanel(state.items, true);
    }
    return;
  }

  if (teamControl) teamControl.hidden = false;
  if (health) health.hidden = false;
  if (banner) banner.hidden = false;
  if (body) delete body.dataset.pbeEditorialSig;

  const feature = root.querySelector(':scope > [data-pbe-originals]');
  if (allActive) {
    if (!feature || feature.dataset.pbeSig !== signature) {
      const holder = document.createElement('div');
      holder.innerHTML = newsroomPanel(state.items, false);
      const node = holder.firstElementChild;
      if (node) {
        node.dataset.pbeSig = signature;
        if (feature) feature.replaceWith(node);
        else if (banner) banner.parentNode.insertBefore(node, banner);
      }
    }
    if (body && !root.querySelector('[data-pbe-wire-head]')) {
      const wire = document.createElement('div');
      wire.className = 'pbeo-wire-head';
      wire.dataset.pbeWireHead = '1';
      wire.innerHTML = '<span class="eyebrow">Verified source wire</span><b>NHL.com + approved external metadata</b><small>Operational status and corroboration remain source-of-record driven.</small>';
      body.parentNode.insertBefore(wire, body);
    }
  } else {
    feature?.remove();
    root.querySelector('[data-pbe-wire-head]')?.remove();
  }
}

function enhanceBoard() {
  const changes = document.querySelector('.wrap.changes');
  if (!changes) return;
  const signature = sig();
  const existing = document.querySelector('[data-pbe-originals-board]');
  if (!state.items.length) {
    existing?.remove();
    return;
  }
  if (existing?.dataset.pbeSig === signature) return;
  const holder = document.createElement('div');
  holder.innerHTML = boardPanel(state.items);
  const node = holder.firstElementChild;
  if (!node) return;
  node.dataset.pbeSig = signature;
  if (existing) existing.replaceWith(node);
  else changes.parentNode.insertBefore(node, changes);
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
    const response = await fetch(`${NEWS_API}/news/by-sport/nhl?limit=${FETCH_LIMIT}&page=1`, {
      credentials: 'omit',
      mode: 'cors',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`PBE NHL news ${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload?.articles)
      ? payload.articles.map(normalize).filter(Boolean).slice(0, MAX_ITEMS)
      : [];
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
  if (host) {
    observer = new MutationObserver(queue);
    observer.observe(host, { childList: true, subtree: true });
  }
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
