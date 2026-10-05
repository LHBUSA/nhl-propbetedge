// NHL premium account surface — presentation model (owner decisions 2026-10-05,
// network account standard; NFL benchmark). Pure, no DOM, so tests render
// every state.
//
// Renders FROM the gateway's verdict (lib/account.js -> nhl-gateway
// /auth/session); it never decides or widens access. Three link jobs that used
// to share one constant are now separate:
//   LOCAL_ALL_ACCESS_PATH    the native /all-access page on this site (every
//                            informational All Access link)
//   NETWORK_ALL_ACCESS_URL   propbetedge.ai/pro, reference only
//   ALL_ACCESS_CHECKOUT_URL  the canonical Stripe link (explicit purchase CTAs)
// "Platinum" is presentation for the all_access state. The backend state, the
// Stripe product and the vendored membership contract are unchanged.
import { ALL_ACCESS_OFFER, ALL_ACCESS_URL } from './pbe-membership.js';
import { PBE_NETWORK } from './network.js';

export const LOCAL_ALL_ACCESS_PATH = '/all-access';
export const NETWORK_ALL_ACCESS_URL = ALL_ACCESS_URL;
export const ALL_ACCESS_CHECKOUT_URL = ALL_ACCESS_OFFER.checkoutUrl;
export const OFFER_LINE = '10 sports + PropBetEdge Predictions';
export const PLATINUM_TRUTH = 'PropBetEdge All Access · 10 sports + Predictions';
export const SECONDARY_LINE = 'One membership across the PropBetEdge intelligence network.';

// Member designation per contract state. FREE has none: a reader without
// access is never labelled FREE anywhere in the NHL UI.
export function designation(state) {
  if (state === 'sport_pro') return { badge: 'NHL PRO MEMBER', short: 'NHL PRO', eyebrow: 'NHL · PRO MEMBER', status: 'NHL PRO ACTIVE', truth: 'NHL Pro · hockey intelligence', tone: 'pro' };
  if (state === 'all_access') return { badge: '◆ PLATINUM', short: 'PLATINUM', eyebrow: 'NHL · PLATINUM MEMBER', status: 'PLATINUM ACCESS ACTIVE', truth: PLATINUM_TRUTH, tone: 'platinum' };
  if (state === 'owner') return { badge: 'VERIFIED OWNER', short: 'OWNER', eyebrow: 'NHL · VERIFIED OWNER', status: 'OWNER ACCESS ACTIVE', truth: null, tone: 'owner' };
  return null;
}

// lib/account.js state + membership -> one view. The gateway's own states:
// signed_out | not_entitled | unavailable | pro (plus 'unknown' before it
// answers). An outage is the access-check view: never FREE, never a sale.
export function accountView(account, membership) {
  const s = account?.state || 'unknown';
  if (s === 'unknown') return 'loading';
  if (s === 'unavailable') return 'check';
  if (s === 'not_entitled') return 'ended';
  if (s !== 'pro') return 'signed_out';
  const m = membership?.state;
  return m === 'owner' ? 'owner' : m === 'all_access' ? 'all_access' : 'sport_pro';
}

export const isMemberView = view => view === 'sport_pro' || view === 'all_access' || view === 'owner';

// What NHL Pro actually gates on the server (nhl-gateway /pro/picks/* and
// /pro/intel/*), by live hash route. The first 16 official 2026-27 locks are
// permanently UNPRICED, so market context is described as "at lock, where
// priced", never as priced picks.
export const NHL_PRO_CAPABILITIES = Object.freeze([
  { key: 'picks', label: 'PBE Picks', sub: 'Official calls + probability', href: '#/pbe-picks' },
  { key: 'provenance', label: 'Call provenance', sub: 'Model, lock time, inputs', href: '#/pbe-picks' },
  { key: 'market', label: 'Market at lock', sub: 'Best price + no-vig, where priced', href: '#/pbe-picks' },
  { key: 'fatigue', label: 'Player fatigue', sub: 'Pro-only workload read', href: '#/fatigue' },
  { key: 'winhl', label: 'WinHL filters', sub: 'Windows + team splits', href: '#/winhl' },
  { key: 'game-intel', label: 'Game intelligence', sub: 'Pro tier in PBE Cast', href: '#/cast' }
]);

// Free for every reader (no account): listed separately so the grid never
// presents a free tool as something membership unlocks.
export const NHL_FREE_TOOLS = Object.freeze(['PBE Cast live rink', 'Goalies', 'Lines', 'Shot Lab', 'Standings', 'Track Record']);

// The network, straight from PBE_NETWORK (parity-tested against the vendored
// canonical family.json): 10 sports, then Predictions as its own product.
export const displaySport = s => (s.id === 'f1' ? 'F1 Intelligence' : s.label);
export function networkSports() { return PBE_NETWORK.sports.slice(); }
export function predictionsProduct() { return PBE_NETWORK.products.find(p => p.id === 'predictions') || null; }
export function sportsLine() { return networkSports().map(displaySport).join(' · '); }
