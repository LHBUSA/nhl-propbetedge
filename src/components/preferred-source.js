/* Google Preferred Sources — shared PropBetEdge control.
 *
 * The control is OUR markup (stable layout, visible on first paint). Google's
 * SDK is loaded in manual mode and only ever invoked from our click handler,
 * so nothing depends on when the async publisher.js runs relative to SPA
 * rendering.
 *
 * Click handling is one delegated document listener: buttons rendered by any
 * later root.innerHTML are covered without rebinding, and it cannot double-bind.
 *
 * Source policy (checked in google.com/preferences/source on 2026-09-30):
 *   eligible:   propbetedge.ai, mlb.propbetedge.ai, ufc.propbetedge.ai -> SDK, own host
 *   not listed: nfl/nba/wnba/nhl/tennis/soccer.propbetedge.ai        -> deeplink to propbetedge.ai
 * The SDK always targets the current page (canonical URL), so it is only used
 * on hosts Google lists; everywhere else the control goes to the parent source.
 */

const PARENT_SOURCE = 'propbetedge.ai';
const ELIGIBLE_SOURCES = new Set(['propbetedge.ai', 'mlb.propbetedge.ai', 'ufc.propbetedge.ai']);
const SDK_SRC = 'https://news.google.com/swg/js/v1/publisher.js';

let sdkApi = null;
let installed = false;

export function preferredSourceTarget(host = currentHost()) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (ELIGIBLE_SOURCES.has(h)) return { source: h, sdk: true };
  return { source: PARENT_SOURCE, sdk: false };
}

export function preferredSourceDeeplink(source = preferredSourceTarget().source) {
  return `https://www.google.com/preferences/source?q=${encodeURIComponent(source)}`;
}

function currentHost() {
  return typeof location === 'undefined' ? PARENT_SOURCE : location.hostname;
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/* surface: 'footer' | 'article' | 'homepage'. The href is the working fallback,
 * so the control still does the right thing with the SDK blocked or before any
 * JS has bound. */
export function renderPreferredSource({ surface = 'footer', sport = 'network' } = {}) {
  const href = escapeAttr(preferredSourceDeeplink());
  const attrs = `href="${href}" target="_blank" rel="noopener" data-pbe-preferred-source data-surface="${escapeAttr(surface)}" data-sport="${escapeAttr(sport)}"`;

  if (surface === 'article') {
    return `
      <aside class="pbe-psrc pbe-psrc--article" aria-labelledby="pbe-psrc-article-title">
        <div class="pbe-psrc-copy">
          <strong id="pbe-psrc-article-title">Enjoy PropBetEdge reporting?</strong>
          <span>Make us a preferred source in Google.</span>
        </div>
        <a class="pbe-psrc-btn" ${attrs} aria-label="Add PropBetEdge as a preferred source in Google Search (opens Google)">Add PropBetEdge</a>
      </aside>`;
  }

  return `
    <div class="pbe-psrc pbe-psrc--${escapeAttr(surface)}">
      <div class="pbe-psrc-copy">
        <span class="pbe-psrc-eyebrow">Google Search</span>
        <strong>Make PropBetEdge a preferred source</strong>
        <span>See more PropBetEdge reporting in Google.</span>
      </div>
      <a class="pbe-psrc-btn" ${attrs} aria-label="Add PropBetEdge as a preferred source in Google Search (opens Google)">Add as preferred source</a>
    </div>`;
}


/* Idempotent. Call once at startup (safe to call again after any render). */
export function mountPreferredSource() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.addEventListener('click', onClick);

  if (!preferredSourceTarget().sdk) return;
  (self.PREFERRED_SOURCE = self.PREFERRED_SOURCE || []).push((api) => {
    api.init({ theme: 'dark', lang: 'en' });
    sdkApi = api;
  });
  ensureSdkScript();
}

function ensureSdkScript() {
  if (document.querySelector(`script[src="${SDK_SRC}"]`)) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = SDK_SRC;
  s.setAttribute('preferred-sources-control', 'manual');
  document.head.appendChild(s);
}

function onClick(event) {
  const el = event.target?.closest?.('[data-pbe-preferred-source]');
  if (!el) return;
  // Modified clicks keep native link behaviour (new tab/window on the deeplink).
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    track(el, 'deeplink_fallback');
    return;
  }

  let method = 'deeplink_fallback';
  if (sdkApi && preferredSourceTarget().sdk) {
    try {
      sdkApi.addPreferredSource();
      method = 'sdk';
      event.preventDefault();
    } catch (_) { /* fall through to the deeplink href */ }
  }
  track(el, method);
}

function track(el, method) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', 'preferred_source_click', {
    surface: el.dataset.surface || 'footer',
    sport: el.dataset.sport || 'network',
    method,
  });
}
