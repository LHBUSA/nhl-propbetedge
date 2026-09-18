// Shared browser plumbing for the Ice Board interaction gate.
//
// Everything here is deliberately SELECTOR-AGNOSTIC: controls are discovered
// from the rendered DOM (anchors, buttons, [role=button], inputs, and anything
// the stylesheet dresses up with cursor:pointer) and then matched by their
// accessible name and the region they live in. No product class name is ever
// treated as a contract, so a redesign that renames `.mode-panel` to something
// else does not silently turn a real failure into a pass.
//
// The same module drives two runs:
//   * the BEFORE run against real production (no relay needed — the page is
//     already on the product origin the gateway allows), and
//   * the acceptance run against a local `vite preview`, where every gateway
//     call is relayed Node-side with the product Origin exactly like
//     tests/e2e/live-acceptance.mjs does, because production CORS blocks
//     localhost.

import { chromium } from 'playwright';

export const GATEWAY = 'https://nhl-api.propbetedge.ai';
export const NEWS_API = 'https://propbet-news-api.sales-fd3.workers.dev';
export const PRODUCT_ORIGIN = 'https://nhl.propbetedge.ai';

export const CHROME_PATH =
  process.env.PW_CHROME ||
  'C:/Users/goodl/AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe';

// Console noise that is neither a product error nor something this harness can
// fix: third-party beacons and the image proxy's own 4xx chatter. Everything
// else counts.
const IGNORED_CONSOLE = [
  /favicon\.ico/i,
  /Failed to load resource: net::ERR_INTERNET_DISCONNECTED/i
];

export async function launchBrowser() {
  return chromium.launch({ headless: true, executablePath: CHROME_PATH });
}

// Requests whose completion changes what is on screen. Anything else (beacons,
// fonts) must not hold the gate open.
const RENDERING_REQUEST = /nhl-api\.propbetedge\.ai|propbet-news-api|propbet-img-proxy|\/assets\//;

/**
 * Create a page with error capture and (optionally) the Node-side gateway relay.
 * Returns { page, errors, reset() } — `errors` accumulates page errors and
 * console errors; `reset()` empties it between controls.
 */
export async function makePage(context, { relay = true } = {}) {
  const page = await context.newPage();
  const errors = [];
  // In-flight count of the requests that can still change the page. settle()
  // reads this, so the gate waits for the render to finish instead of
  // guessing how long it takes.
  let inflight = 0;
  page.__pbeInflight = () => inflight;
  page.on('request', r => { if (RENDERING_REQUEST.test(r.url())) inflight++; });
  const done = r => { if (RENDERING_REQUEST.test(r.url())) inflight = Math.max(0, inflight - 1); };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`.slice(0, 300)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORED_CONSOLE.some(re => re.test(text))) return;
    errors.push(`console: ${text.slice(0, 220)}`);
  });

  // Deliberate upstream latency, used to prove the gate does not depend on how
  // fast the gateway answers. Zero unless a run asks for it.
  const slowMs = Number(process.env.PBE_E2E_SLOW || 0);

  if (relay) {
    const proxy = async route => {
      const url = route.request().url();
      if (slowMs) await new Promise(r => setTimeout(r, slowMs));
      try {
        const upstream = await fetch(url, {
          headers: { Accept: 'application/json', Origin: PRODUCT_ORIGIN, Referer: `${PRODUCT_ORIGIN}/` }
        });
        const body = await upstream.text();
        const semantics = upstream.headers.get('X-NHL-Semantics');
        return route.fulfill({
          status: upstream.status,
          contentType: upstream.headers.get('content-type') || 'application/json',
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'X-NHL-Semantics',
            ...(semantics ? { 'X-NHL-Semantics': semantics } : {})
          },
          body
        });
      } catch {
        return route.abort();
      }
    };
    await page.route(`${GATEWAY}/**`, proxy);
    await page.route(`${NEWS_API}/**`, proxy);
  }

  return { page, errors, reset: () => { errors.length = 0; } };
}

/** Load a hash route and wait for the shell + a settled (non-skeleton) main. */
export async function gotoHash(page, base, hash, { settle = 2500 } = {}) {
  const url = `${base}/#${hash.replace(/^#/, '')}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#main', { timeout: 20000 });
  await waitForMount(page, { settle });
}

/**
 * A cheap fingerprint of everything the gate asserts on. When this stops
 * changing AND no rendering request is in flight, the page is done — which is
 * the condition the old fixed sleeps were standing in for.
 */
const SIGNATURE = () => {
  const main = document.querySelector('#main');
  const sel = 'a[href], button, [role="button"], input, select, textarea, summary';
  const panels = [...document.querySelectorAll('[role="dialog"], [role="menu"], .palette:not([hidden]), .alert-center:not([hidden]), .sheet')]
    .map(el => {
      const r = el.getBoundingClientRect();
      // Rounded geometry: a panel still sliding in keeps changing this, so an
      // animation cannot be mistaken for a finished state.
      return `${el.id || el.className}:${Math.round(r.top)}x${Math.round(r.height)}`;
    });
  return [
    location.hash,
    main?.children.length || 0,
    main?.querySelectorAll('*').length || 0,
    (main?.innerText || '').trim().length,
    main?.querySelectorAll('.pbe-skeleton').length || 0,
    document.querySelectorAll(sel).length,
    document.images.length,
    [...document.images].filter(i => i.complete).length,
    panels.join(',')
  ].join('|');
};

/**
 * Wait for a finished render: no rendering request in flight and a page
 * signature that has held steady for `idleMs`.
 *
 * Returns { settled, waitedMs, reason } — never throws and never silently
 * proceeds: a timeout is reported so a slow render shows up as itself rather
 * than as a mystery failure somewhere later.
 */
export async function settle(page, { idleMs = 400, timeout = 15000 } = {}) {
  const started = Date.now();
  const deadline = started + timeout;
  let last = null;
  let stableSince = 0;
  while (Date.now() < deadline) {
    const busy = typeof page.__pbeInflight === 'function' ? page.__pbeInflight() > 0 : false;
    let sig;
    try { sig = await page.evaluate(SIGNATURE); } catch { return { settled: false, waitedMs: Date.now() - started, reason: 'page gone' }; }
    if (busy) { last = sig; stableSince = 0; }
    else if (sig === last) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= idleMs) return { settled: true, waitedMs: Date.now() - started, reason: '' };
    } else { last = sig; stableSince = 0; }
    await page.waitForTimeout(50);
  }
  return { settled: false, waitedMs: Date.now() - started, reason: 'still changing at timeout' };
}

/**
 * Wait until #main looks genuinely mounted: real element children, real text,
 * and not still a pure skeleton — then wait for the render to actually finish.
 * Never throws — callers assert on the result.
 */
export async function waitForMount(page, { timeout = 12000, settle: idleMs = 400 } = {}) {
  try {
    await page.waitForFunction(() => {
      const main = document.querySelector('#main');
      if (!main || !main.children.length) return false;
      const text = (main.innerText || '').trim();
      const skeletons = main.querySelectorAll('.pbe-skeleton').length;
      const realNodes = main.querySelectorAll('*').length;
      if (text.length > 60) return true;
      return skeletons === 0 && realNodes > 6;
    }, null, { timeout });
  } catch { /* fall through — mountState() reports the truth */ }
  return settle(page, { idleMs: Math.min(Math.max(idleMs, 250), 800), timeout: Math.max(timeout, 15000) });
}

/** Describe what is currently mounted in #main. */
export function mountState(page) {
  return page.evaluate(() => {
    const main = document.querySelector('#main');
    const text = (main?.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      hash: location.hash || '',
      path: (location.hash || '#/').replace(/^#/, ''),
      children: main?.children.length || 0,
      nodes: main?.querySelectorAll('*').length || 0,
      textLen: text.length,
      text: text.slice(0, 200),
      skeletonOnly: Boolean(main) && main.querySelectorAll('.pbe-skeleton').length > 0 && text.length < 60,
      notFound: /does not exist/i.test(text.slice(0, 200)),
      activeNav: document.querySelector('[data-nav].is-active, [data-nav][aria-current="page"]')?.dataset?.nav || null,
      // Any dialog/menu/sheet currently visible counts as "a panel opened".
      openPanels: [...document.querySelectorAll('[role="dialog"], [role="menu"], [aria-expanded="true"], .alert-center:not([hidden]), .palette:not([hidden])')]
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map(el => el.getAttribute('aria-label') || el.id || el.className || el.tagName)
        .slice(0, 8)
    };
  });
}

/** True if a real mount happened (not empty shell, not the router 404). */
export function isMounted(m) {
  return m.children > 0 && !m.skeletonOnly && !m.notFound && (m.textLen > 60 || m.nodes > 8);
}

const DISCOVER_SRC = () => {
  const cssPath = el => {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node.tagName !== 'HTML') {
      const parent = node.parentElement;
      if (!parent) break;
      const idx = [...parent.children].indexOf(node) + 1;
      parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${idx})`);
      node = parent;
    }
    return parts.join(' > ');
  };

  const nameOf = el => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 90);
    const t = el.getAttribute('title') || el.getAttribute('placeholder') || el.value || '';
    if (t) return String(t).trim().slice(0, 90);
    const sr = el.querySelector('.sr-only');
    if (sr) return (sr.textContent || '').trim().slice(0, 90);
    return '';
  };

  const regionOf = el => {
    if (el.closest('.palette')) return 'search';
    if (el.closest('.sheet')) return 'sheet';
    if (el.closest('.alert-center')) return 'alerts';
    if (el.closest('.more__menu, [role="menu"]')) return 'more-menu';
    if (el.closest('.bottomnav')) return 'bottomnav';
    if (el.closest('header, .topbar')) return 'chrome';
    if (el.closest('#score-ticker, #score-ticker-slot')) return 'rail';
    if (el.closest('#mode-ribbon, .mode-ribbon')) return 'ribbon';
    if (el.closest('.mode-panel, #mode-panel')) return 'quicklaunch';
    if (el.closest('.changes')) return 'changes';
    if (el.closest('.hero')) return 'hero';
    if (el.closest('#ice-board, .board')) return 'board';
    if (el.closest('footer')) return 'footer';
    if (el.closest('.pbepro, #nhl-pro-modal')) return 'pro-modal';
    return 'other';
  };

  // checkVisibility() is the only measure that sees through a closed <details>
  // (content-visibility) — a bounding box alone reports collapsed content as
  // visible, which would let the harness "click" something nobody can reach.
  const visible = el => {
    if (typeof el.checkVisibility === 'function' &&
        !el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true, opacityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01;
  };

  const SEL = 'a[href], button, [role="button"], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
  const seen = new Set();
  const controls = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (el.closest('[hidden]')) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    controls.push({
      path: cssPath(el),
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      role: el.getAttribute('role') || '',
      name: nameOf(el),
      href: el.getAttribute('href') || '',
      target: el.getAttribute('target') || '',
      region: regionOf(el),
      visible: visible(el),
      disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || el.dataset.state === 'unavailable',
      ariaDisabled: el.getAttribute('aria-disabled') === 'true',
      dataState: el.dataset.state || '',
      dataAttrs: Object.keys(el.dataset || {}),
      cursor: cs.cursor,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    });
  }

  // Second sweep: anything the stylesheet makes LOOK clickable but that is not
  // a real control and is not inside one. These are the dead-UI candidates.
  const lookalikes = [];
  for (const el of document.querySelectorAll('body *')) {
    if (seen.has(el)) continue;
    if (el.closest(SEL)) continue;
    if (el.closest('[hidden]')) continue;
    if (getComputedStyle(el).cursor !== 'pointer') continue;
    if (!visible(el)) continue;
    // Skip wrappers whose only job is to hold a real control.
    if (el.querySelector(SEL)) continue;
    lookalikes.push({
      path: cssPath(el),
      tag: el.tagName.toLowerCase(),
      name: nameOf(el),
      region: regionOf(el),
      dataState: el.dataset.state || '',
      ariaDisabled: el.getAttribute('aria-disabled') === 'true'
    });
  }

  return { controls, lookalikes };
};

/** Enumerate every interactive control and every clickable-looking non-control. */
export function discover(page) {
  return page.evaluate(DISCOVER_SRC);
}

/** Viewport metrics used by the responsive sweep. */
export function viewportMetrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const imgs = [...document.images].filter(i => i.getAttribute('src'));
    const vw = doc.clientWidth;
    const offscreen = [];
    const SEL = 'a[href], button, [role="button"], input, select';
    for (const el of document.querySelectorAll(SEL)) {
      if (el.closest('[hidden]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= vw + 2 && r.left >= -2) continue;
      // Outside the viewport is not the same as unreachable. A control inside a
      // deliberate horizontal scroller (a mobile card rail) is reached by
      // swiping, so it only counts as unreachable when NO ancestor can scroll
      // sideways to bring it into view.
      let scrollable = false;
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 2) { scrollable = true; break; }
      }
      if (scrollable) continue;
      offscreen.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40)}" @${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    return {
      overflow: Math.max(0, doc.scrollWidth - doc.clientWidth),
      broken: imgs.filter(i => i.complete && !(i.naturalWidth > 1)).map(i => i.currentSrc || i.src).slice(0, 8),
      imgs: imgs.length,
      offscreen: offscreen.slice(0, 8)
    };
  });
}

/**
 * Hard-coded QA fixtures that must never appear in product navigation:
 * a literal 10-digit NHL game id, or a pinned calendar date in a query string.
 */
export const FIXTURE_RE = [
  { re: /(?:^|[/=])(19|20)\d{8}(?:\b|$)/, why: 'hard-coded 10-digit NHL game id' },
  { re: /[?&]date=\d{4}-\d{2}-\d{2}/, why: 'hard-coded calendar date' },
  { re: /[?&]gameId=\d{6,}/, why: 'hard-coded game id parameter' }
];

export function fixtureViolation(href = '') {
  if (!href) return null;
  for (const { re, why } of FIXTURE_RE) if (re.test(href)) return why;
  return null;
}

/**
 * Re-locate a control just before clicking it.
 *
 * Structural paths go stale: the board re-renders as soon as the poller
 * resolves, and a slate-nav button can appear or disappear, shifting every
 * nth-child index after it. Clicking a stale path silently hits the WRONG
 * control and the harness would report a false failure (or worse, a false
 * pass). So the element at `path` is verified against the control's identity
 * (name + href + data hooks) and, if it no longer matches, the page is
 * re-scanned for the same identity.
 *
 * Returns a fresh path, or null when the control has genuinely gone.
 */
export async function resolvePath(page, control) {
  if (!control?.path) return null;
  return page.evaluate(({ path, name, href, tag, dataAttrs }) => {
    const cssPath = el => {
      const parts = [];
      let n = el;
      while (n && n.nodeType === 1 && n.tagName !== 'HTML') {
        const p = n.parentElement;
        if (!p) break;
        parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${[...p.children].indexOf(n) + 1})`);
        n = p;
      }
      return parts.join(' > ');
    };
    const nameOf = el => {
      const aria = el.getAttribute('aria-label');
      if (aria) return aria.trim();
      const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) return t.slice(0, 90);
      return (el.getAttribute('title') || el.getAttribute('placeholder') || el.value || '').toString().trim().slice(0, 90);
    };
    const same = el => el
      && el.tagName.toLowerCase() === tag
      && nameOf(el) === name
      && (el.getAttribute('href') || '') === (href || '')
      && (!dataAttrs?.length || dataAttrs.every(k => k in el.dataset));

    const at = document.querySelector(path);
    if (same(at)) return path;
    const SEL = 'a[href], button, [role="button"], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
    for (const el of document.querySelectorAll(SEL)) if (same(el)) return cssPath(el);
    return null;
  }, { path: control.path, name: control.name || '', href: control.href || '', tag: control.tag, dataAttrs: control.dataAttrs || [] });
}

/** Click a discovered control, re-locating it first when we know its identity. */
export async function clickControl(page, control, opts = {}) {
  const fresh = control?.name !== undefined ? await resolvePath(page, control) : control?.path;
  if (!fresh) return false;
  return clickPath(page, fresh, opts);
}

/** Click a discovered control by its structural path; returns false if gone. */
export async function clickPath(page, path, { force = false, timeout = 8000 } = {}) {
  const loc = page.locator(path).first();
  if (!(await loc.count())) return false;
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await loc.click({ timeout, force, noWaitAfter: true });
    return true;
  } catch {
    try {
      await loc.dispatchEvent('click');
      return true;
    } catch {
      return false;
    }
  }
}

/** Normalise a name for tolerant matching across a redesign. */
export const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Find one discovered control by region + fuzzy accessible name. */
export function pick(controls, { region, regions, name, names, tag, href, visibleOnly = true }) {
  // Drop aliases that normalise to nothing (glyphs like "‹"): an empty want
  // prefix-matches EVERY control and would silently click the wrong element.
  const wants = (names || (name ? [name] : [])).map(norm).filter(Boolean);
  const regionSet = regions || (region ? [region] : null);
  return controls.find(c => {
    if (visibleOnly && !c.visible) return false;
    if (regionSet && !regionSet.includes(c.region)) return false;
    if (tag && c.tag !== tag) return false;
    if (href && c.href !== href) return false;
    if (!wants.length) return true;
    const n = norm(c.name);
    return wants.some(w => n === w || n.startsWith(w) || n.includes(w));
  }) || null;
}
