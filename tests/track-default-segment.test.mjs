// Track Record opens on REGULAR SEASON (regular season is live). Preseason stays
// one click away and keeps its own ledger. Mounts the real page against a stub
// root and a recording fetch — no browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mount } from '../src/pages/track.js';

function stubRoot() {
  const listeners = [];
  return {
    innerHTML: '',
    listeners,
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    removeEventListener: () => {},
    contains: () => true
  };
}

test('#/track-record mounts with Regular Season selected and loads the regular ledger', async () => {
  const urls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => { urls.push(String(url)); throw new TypeError('offline in test'); };
  try {
    const root = stubRoot();
    const dispose = mount(root);
    assert.match(root.innerHTML, /data-segment="regular" aria-pressed="true"/, 'Regular Season tab is active on first render');
    assert.match(root.innerHTML, /data-segment="preseason" aria-pressed="false"/, 'Preseason tab is present but not active');
    assert.match(root.innerHTML, /Regular-season (performance|pick history)/, 'regular-season hero/ledger render first');
    await new Promise(r => setTimeout(r, 50));
    const ledgerCalls = urls.filter(u => /\/ledger\b/.test(u));
    assert.ok(ledgerCalls.some(u => u.includes('/nhl/picks/track-record/ledger')), `regular ledger is requested on mount (saw ${urls.join(', ') || 'no requests'})`);
    assert.ok(!ledgerCalls.some(u => u.includes('/nhl/picks/preseason/ledger')), 'preseason ledger is not requested on mount');

    // Clicking Preseason still switches segments and loads the preseason ledger.
    urls.length = 0;
    const btn = { dataset: { segment: 'preseason' } };
    const click = root.listeners.filter(l => l.type === 'click');
    for (const l of click) l.fn({ target: { closest: sel => (sel === '[data-segment]' ? btn : null) } });
    assert.match(root.innerHTML, /data-segment="preseason" aria-pressed="true"/, 'Preseason becomes active on click');
    await new Promise(r => setTimeout(r, 50));
    assert.ok(urls.some(u => u.includes('/nhl/picks/preseason/ledger')), `preseason ledger requested after click (saw ${urls.join(', ')})`);
    if (typeof dispose === 'function') dispose();
  } finally {
    globalThis.fetch = realFetch;
  }
});
