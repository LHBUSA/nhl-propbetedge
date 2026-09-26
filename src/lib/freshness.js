import { esc } from './dom.js';
import { ageText, clockET } from './format.js';

// Provenance states rendered by every volatile surface:
// CURRENT  fetched within its TTL
// CACHED   older than TTL (edge/proxy cache) but inside the stale threshold
// STALE    past the stale threshold OR the latest refresh failed and the
//          screen is showing last-known data
// UNAVAILABLE  no data and the source/route is not available
// ERROR    no data and the request failed
export function freshnessState({ meta, failed = false, hasData = true, unavailable = false }) {
  if (!hasData) return unavailable ? 'UNAVAILABLE' : failed ? 'ERROR' : 'UNAVAILABLE';
  if (failed) return 'STALE';
  const fetched = Date.parse(meta?.fetched_at || '');
  if (!Number.isFinite(fetched)) return 'STALE';
  const age = (Date.now() - fetched) / 1000;
  const staleAfter = meta?.stale_after_s ?? 300;
  const ttl = meta?.ttl_s ?? 30;
  if (age > staleAfter) return 'STALE';
  if (age > ttl * 2 + 5) return 'CACHED';
  return 'CURRENT';
}

// A stamp that keeps ageing on its own (see startFreshTicker), so a label can
// never stay CURRENT after refreshes stop.
export function freshStamp(meta, { failed = false, hasData = true, unavailable = false, source = null, label = null } = {}) {
  const state = freshnessState({ meta, failed, hasData, unavailable });
  const src = source || 'PropSports';
  const provenance = meta?.source || '';
  const fetchedAt = meta?.fetched_at || '';
  const age = fetchedAt ? (Date.now() - Date.parse(fetchedAt)) / 1000 : NaN;
  return `<span class="fresh" data-state="${state}" data-fetched="${esc(fetchedAt)}" data-ttl="${meta?.ttl_s ?? ''}" data-stale="${meta?.stale_after_s ?? ''}" data-failed="${failed ? '1' : ''}" data-has="${hasData ? '1' : ''}" data-provenance="${esc(provenance)}"${fetchedAt ? ` title="Source: ${esc(src)} · fetched ${esc(clockET(fetchedAt))}${meta?.source_urls?.length ? ` · ${esc(meta.source_urls.join(' , '))}` : ''}"` : ''}>
    <i class="fresh__dot" aria-hidden="true"></i><b class="fresh__state">${state}</b>${label ? ` · ${esc(label)}` : ''} · ${esc(src)}${fetchedAt ? ` · <span class="fresh__age">${esc(ageText(age))}</span>` : ''}
  </span>`;
}

let ticker = null;
export function startFreshTicker() {
  if (ticker) return;
  const tick = () => {
    for (const node of document.querySelectorAll('.fresh[data-fetched]')) {
      const fetched = node.dataset.fetched;
      if (!fetched) continue;
      const meta = {
        fetched_at: fetched,
        ttl_s: node.dataset.ttl ? Number(node.dataset.ttl) : null,
        stale_after_s: node.dataset.stale ? Number(node.dataset.stale) : null
      };
      const state = freshnessState({ meta, failed: node.dataset.failed === '1', hasData: node.dataset.has === '1' });
      if (node.dataset.state !== state) {
        node.dataset.state = state;
        const label = node.querySelector('.fresh__state');
        if (label) label.textContent = state;
      }
      const ageNode = node.querySelector('.fresh__age');
      if (ageNode) ageNode.textContent = ageText((Date.now() - Date.parse(fetched)) / 1000);
      // A LIVE badge inside a scope whose data went stale must stop claiming LIVE.
      const scope = node.closest('[data-fresh-scope]');
      if (scope) scope.dataset.freshState = state;
    }
  };
  tick();
  ticker = setInterval(tick, 1000);
}
