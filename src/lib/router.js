// Hash router. Every page module exports mount(root, params, ctx) and returns
// an unmount() that clears its timers, listeners and in-flight requests.
import * as boardPage from '../pages/board.js';

// The Ice Board is the landing route: bundled with the shell so first paint
// does not wait on a second chunk. Everything else loads on demand.
const ROUTES = [
  { pattern: /^\/?$/, id: 'board', load: async () => boardPage },
  { pattern: /^\/pbe-picks$/, id: 'picks', load: () => import('../pages/pbe-picks.js') },
  { pattern: /^\/cast(?:\/(\d{10}))?$/, id: 'cast', keys: ['gameId'], load: () => import('../pages/cast.js') },
  { pattern: /^\/props$/, id: 'props', load: () => import('../pages/props.js') },
  { pattern: /^\/goalies(?:\/(\d{10}))?$/, id: 'goalies', keys: ['gameId'], load: () => import('../pages/goalies.js') },
  { pattern: /^\/lines$/, id: 'lines', load: () => import('../pages/lines.js') },
  { pattern: /^\/injuries$/, id: 'injuries', load: () => import('../pages/injuries.js') },
  { pattern: /^\/news$/, id: 'news', load: () => import('../pages/news.js') },
  { pattern: /^\/shots(?:\/(\d{10}))?$/, id: 'shots', keys: ['gameId'], load: () => import('../pages/shotlab.js') },
  { pattern: /^\/matchup(?:\/(\d{10}))?$/, id: 'matchup', keys: ['gameId'], load: () => import('../pages/matchup.js') },
  { pattern: /^\/players$/, id: 'players', load: () => import('../pages/players.js') },
  { pattern: /^\/player\/(\d{6,10})$/, id: 'players', keys: ['playerId'], load: () => import('../pages/player.js') },
  { pattern: /^\/team\/([A-Z]{2,4})$/, id: 'standings', keys: ['team'], load: () => import('../pages/team.js') },
  { pattern: /^\/standings$/, id: 'standings', load: () => import('../pages/standings.js') },
  { pattern: /^\/track-record$/, id: 'track', load: () => import('../pages/track.js') },
  { pattern: /^\/methodology$/, id: 'methodology', load: () => import('../pages/methodology.js') },
  { pattern: /^\/auth\/verify$/, id: 'auth', load: () => import('../pages/auth-verify.js') }
];

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  for (const route of ROUTES) {
    const m = path.match(route.pattern);
    if (m) {
      const params = { ...query };
      (route.keys || []).forEach((key, i) => { if (m[i + 1]) params[key] = m[i + 1]; });
      return { route, params, path };
    }
  }
  return { route: null, params: query, path };
}

export function createRouter({ root, ctx, onRoute }) {
  let current = null;
  let token = 0;

  async function navigate() {
    const mine = ++token;
    const { route, params, path } = parseHash();
    try { current?.(); } catch (error) { console.warn('[router] unmount failed', error); }
    current = null;
    onRoute?.(route?.id || null, path);
    if (!route) {
      root.innerHTML = `<section class="wrap section"><div class="pbe-empty"><h3>That page does not exist.</h3><p><a class="gold" href="#/">Back to the Ice Board</a></p></div></section>`;
      return;
    }
    const mod = await route.load();
    if (mine !== token) return;
    root.innerHTML = '';
    root.classList.remove('page-enter');
    void root.offsetWidth;
    root.classList.add('page-enter');
    const unmount = mod.mount(root, params, ctx);
    current = typeof unmount === 'function' ? unmount : null;
    if (!params.keepScroll) window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', navigate);
  return { start: navigate, stop: () => window.removeEventListener('hashchange', navigate) };
}
