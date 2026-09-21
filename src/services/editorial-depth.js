import { esc, safeUrl } from '../lib/dom.js';
import { ageText } from '../lib/format.js';
import { TEAM_BY_ABBREV, logoUrl } from '../lib/teams.js';
import { playerIdentity } from '../components/player.js';
import '../styles/contextual-intel.css';

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
  const players = Array.isArray(article?.take?.players)
    ? article.take.players.map(v => String(v || '').trim()).filter(Boolean)
    : [];
  return {
    id: String(article.id || article.slug || article.title),
    slug: String(article.slug || '').trim(),
    title: String(article.title || '').trim(),
    author: String(article.author || 'PropBetEdge NHL Desk').trim(),
    category: String(article.category || 'analysis').trim().toLowerCase(),
    editor_pick: Boolean(article.is_editor_pick),
    published_at: new Date(publishedAt).toISOString(),
    impact: Number(article?.take?.impact_score) || null,
    teams,
    players,
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

function categoryLabel(article) {
  const raw = String(article?.category || 'analysis').replace(/[-_]+/g, ' ').trim();
  return raw ? raw.replace(/\b\w/g, ch => ch.toUpperCase()) : 'Analysis';
}

function teamWatermark(article) {
  const team = primaryTeam(article);
  const logo = team ? safeUrl(logoUrl({ abbrev: team })) : null;
  if (!logo) return '<span class="pbeo-hero__watermark pbeo-hero__watermark--pbe" aria-hidden="true">PBE</span>';
  return `<img class="pbeo-hero__watermark" src="${esc(logo)}" alt="" loading="eager" decoding="async" onerror="this.remove()">`;
}

function storyMeta(article, compact = false) {
  return `<div class="pbeo-meta">
    <span>${esc(categoryLabel(article))}</span>
    ${article.editor_pick ? '<b class="pbeo-editor-pick">Editor pick</b>' : ''}
    ${impact(article)}
    <time datetime="${esc(article.published_at)}">${esc(relative(article.published_at))}</time>
    ${compact ? '' : `<b class="pbeo-author">${esc(article.author || 'PropBetEdge NHL Desk')}</b>`}
  </div>`;
}

function leadCard(article) {
  return `<article class="pbeo-hero-story">
    <div class="pbeo-hero-story__art">
      ${teamWatermark(article)}
      <span class="pbeo-hero-story__edition">PROPBETEDGE NHL</span>
    </div>
    <div class="pbeo-hero-story__body">
      ${storyMeta(article)}
      <a class="pbeo-story-link" href="${esc(article.url)}" target="_blank" rel="noopener"><h3>${esc(article.title)}</h3></a>
      <p class="pbeo-hero-story__dek">Independent PBE analysis built from attributed reporting, connected to the same hockey intelligence layer powering the rest of this product.</p>
      ${provenance(article)}
      <div class="pbeo-byline"><span>${esc(article.author || 'PropBetEdge NHL Desk')}</span><a href="${esc(article.url)}" target="_blank" rel="noopener">Read full analysis →</a></div>
    </div>
  </article>`;
}

function railStory(article, index) {
  const team = primaryTeam(article);
  const logo = team ? safeUrl(logoUrl({ abbrev: team })) : null;
  return `<article class="pbeo-rail-story">
    <span class="pbeo-rail-story__num">${String(index + 1).padStart(2, '0')}</span>
    <div class="pbeo-rail-story__copy">
      ${storyMeta(article, true)}
      <a class="pbeo-story-link" href="${esc(article.url)}" target="_blank" rel="noopener"><h4>${esc(article.title)}</h4></a>
      <div class="pbeo-rail-story__foot"><span>${esc(article.author || 'PBE NHL Desk')}</span><a href="${esc(article.source_url)}" target="_blank" rel="noopener">Source: ${esc(article.source_label)} ↗</a></div>
    </div>
    ${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" decoding="async">` : ''}
  </article>`;
}

function shelfCard(article) {
  const team = primaryTeam(article);
  const logo = team ? safeUrl(logoUrl({ abbrev: team })) : null;
  return `<article class="pbeo-shelf-card">
    <div class="pbeo-shelf-card__art">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" decoding="async">` : '<span>PBE</span>'}</div>
    <div class="pbeo-shelf-card__body">
      ${storyMeta(article, true)}
      <a class="pbeo-story-link" href="${esc(article.url)}" target="_blank" rel="noopener"><h4>${esc(article.title)}</h4></a>
      <div class="pbeo-shelf-card__foot"><span>${esc(article.author || 'PBE NHL Desk')}</span><a href="${esc(article.url)}" target="_blank" rel="noopener">Read →</a></div>
    </div>
  </article>`;
}

function newsroomPanel(items, full = false) {
  if (!items.length) {
    return `<section class="pbeo pbeo--empty pbeo-newsroom-v2" data-pbe-originals>
      <div class="pbeo-newsroom-mast"><div><span class="eyebrow">PropBetEdge NHL Newsroom</span><h3>The desk is online. The authored feed is temporarily unavailable.</h3></div></div>
      <p class="dim">The verified league wire remains available below. We do not relabel source-wire stories as PropBetEdge analysis.</p>
    </section>`;
  }

  const [lead, ...rest] = items;
  const rail = rest.slice(0, 3);
  const shelf = rest.slice(3, full ? 12 : 7);

  return `<section class="pbeo pbeo-newsroom-v2${full ? ' pbeo--full' : ''}" data-pbe-originals>
    <header class="pbeo-newsroom-mast">
      <div>
        <span class="eyebrow">PROPBETEDGE NHL · NEWSROOM</span>
        <h3>${full ? 'Original hockey intelligence. One desk.' : 'The stories shaping the ice right now.'}</h3>
        <p>Original PropBetEdge analysis leads. Verified NHL source-wire reporting stays attached underneath for operational truth and corroboration.</p>
      </div>
      <div class="pbeo-newsroom-mast__right">
        <span class="pbeo-live"><i></i> DESK LIVE</span>
        <span class="micro">${items.length} current PBE analyses</span>
      </div>
    </header>

    <nav class="pbeo-newsroom-links" aria-label="NHL intelligence shortcuts">
      <a href="#/">Ice Board</a>
      <a href="#/cast">PBE Cast</a>
      <a href="#/pbe-picks">PBE Picks</a>
      <a href="#/players">Players</a>
      <a href="#/standings">Standings</a>
    </nav>

    <div class="pbeo-front">
      ${leadCard(lead)}
      ${rail.length ? `<aside class="pbeo-rail"><div class="pbeo-rail__head"><span class="eyebrow">Latest from the desk</span><span class="micro">PBE analysis</span></div>${rail.map(railStory).join('')}</aside>` : ''}
    </div>

    ${shelf.length ? `<div class="pbeo-shelf-head"><span class="eyebrow">More from PropBetEdge NHL</span><span class="micro">Analysis archive · newest first</span></div><div class="pbeo-shelf">${shelf.map(shelfCard).join('')}</div>` : ''}

    <footer class="pbeo-newsroom-foot">
      <div><b>Editorial discipline</b><span>PBE analysis is commentary and interpretation. Injuries, goalie status, lines, transactions and game state remain grounded in the verified operational wire.</span></div>
      ${full ? '' : `<a href="#/news?cat=PBE">Open the full PBE NHL desk →</a>`}
    </footer>
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

function keyText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function currentResearchContext() {
  const path = (location.hash.replace(/^#/, '').split('?')[0] || '/');
  const teamMatch = /^\/team\/([A-Z]{2,4})$/i.exec(path);
  if (teamMatch) {
    const team = teamMatch[1].toUpperCase();
    return { kind: 'team', team, label: TEAM_BY_ABBREV.get(team)?.full || team, anchor: document.querySelector('.rs-thead') };
  }

  const playerMatch = /^\/player\/(\d{6,10})$/.exec(path);
  if (!playerMatch) return null;
  const anchor = document.querySelector('.rs-phead');
  if (!anchor) return null;
  const name = String(anchor.querySelector('h1')?.textContent || '').trim();
  if (!name) return null;
  const teamHref = anchor.querySelector('.rs-phead__team a[href^="#/team/"]')?.getAttribute('href') || '';
  const team = (/^#\/team\/([A-Z]{2,4})$/i.exec(teamHref)?.[1] || '').toUpperCase() || null;
  return { kind: 'player', id: playerMatch[1], name, team, label: name, anchor };
}

function researchMatches(ctx) {
  if (!ctx) return { items: [], direct: false };
  if (ctx.kind === 'team') {
    return { items: state.items.filter(article => article.teams.includes(ctx.team)).slice(0, 4), direct: true };
  }

  const name = keyText(ctx.name);
  const direct = state.items.filter(article => {
    const title = keyText(article.title);
    const tagged = article.players.some(player => keyText(player) === name);
    return tagged || (name && title.includes(name));
  });
  if (direct.length) return { items: direct.slice(0, 4), direct: true };
  if (ctx.team) return { items: state.items.filter(article => article.teams.includes(ctx.team)).slice(0, 3), direct: false };
  return { items: [], direct: false };
}

function contextStory(article) {
  return `<article class="pbec-story">
    <div class="pbec-story__meta"><span>PBE NHL</span>${impact(article)}<time datetime="${esc(article.published_at)}">${esc(relative(article.published_at))}</time></div>
    <a class="pbec-story__title" href="${esc(article.url)}" target="_blank" rel="noopener">${esc(article.title)}</a>
    <div class="pbec-story__foot"><span>PropBetEdge NHL Desk</span><a href="${esc(article.source_url)}" target="_blank" rel="noopener">Source: ${esc(article.source_label)} ↗</a></div>
  </article>`;
}

function contextPanel(ctx, items, direct) {
  const player = ctx.kind === 'player';
  const team = ctx.team && TEAM_BY_ABBREV.has(ctx.team) ? TEAM_BY_ABBREV.get(ctx.team) : null;
  const heading = player
    ? (direct ? `Analysis touching ${ctx.name}` : `Team context around ${ctx.name}`)
    : `What our desk is analyzing about ${ctx.label}`;
  const eyebrow = player
    ? (direct ? 'PBE NHL · Player context' : `PBE NHL · ${ctx.team || 'Team'} context`)
    : `PBE NHL · ${ctx.team}`;
  const identity = player
    ? playerIdentity({ id: ctx.id, name: ctx.name, team: ctx.team, size: 'lg' })
    : team ? `<span class="pbec-team-mark"><img src="${esc(logoUrl({ abbrev: team.abbrev }))}" alt="" width="56" height="56" loading="lazy" decoding="async"></span>` : '';
  return `<section class="pbec" data-pbe-context data-context-kind="${esc(ctx.kind)}">
    <div class="pbec-head">
      <div class="pbec-head__identity">${identity}</div>
      <div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(heading)}</h2><p>PBE analysis is research context, not a status source. Injuries, goalies, lines and game state remain source-wire driven.</p></div>
      <a class="pbec-head__all" href="#/news?cat=PBE">Open PBE NHL Desk →</a>
    </div>
    <div class="pbec-grid">${items.map(contextStory).join('')}</div>
  </section>`;
}

function enhanceResearchContext() {
  const existing = document.querySelector('[data-pbe-context]');
  const ctx = currentResearchContext();
  if (!ctx || !ctx.anchor || !state.items.length) {
    existing?.remove();
    return;
  }
  const match = researchMatches(ctx);
  if (!match.items.length) {
    existing?.remove();
    return;
  }
  const signature = `${ctx.kind}:${ctx.id || ctx.team}:${match.direct ? 'direct' : 'team'}:${match.items.map(a => a.id).join(',')}`;
  if (existing?.dataset.pbeSig === signature) return;
  const holder = document.createElement('div');
  holder.innerHTML = contextPanel(ctx, match.items, match.direct);
  const node = holder.firstElementChild;
  if (!node) return;
  node.dataset.pbeSig = signature;
  if (existing) existing.replaceWith(node);
  else ctx.anchor.insertAdjacentElement('afterend', node);
}

function apply() {
  queued = false;
  enhanceNews();
  enhanceBoard();
  enhanceResearchContext();
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
