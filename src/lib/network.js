// Canonical PropBetEdge network links used by the NHL product chrome.
// Keep cross-sport discovery in one source of truth so the nav, mobile sheet
// and footer never drift from each other.
//
// Family parity: sports / products / network URLs must match the vendored canonical
// registry src/lib/family.json (LHBUSA/propbetedge-workers shared/network/family.json);
// guarded by tests/network-family-parity.test.mjs.
//
// PROPBETEDGE_DISCORD_URL is the canonical non-expiring community invite.
// The store currently lives on the UFC product until the shared storefront
// ships at the network level.
export const PROPBETEDGE_DISCORD_URL = 'https://discord.gg/kb5zCTHbME';

export const PBE_NETWORK = {
  hub: 'https://propbetedge.ai/',
  // NHL's own section of the PropBetEdge newsroom (news <-> intelligence pair).
  news: 'https://propbetedge.ai/news/nhl',
  learn: 'https://learn.propbetedge.ai/',
  store: 'https://ufc.propbetedge.ai/store',
  discord: PROPBETEDGE_DISCORD_URL,
  // PropBetEdge's own X account (external: new tab, noopener noreferrer).
  x: 'https://x.com/PROPBETEDGE',
  xHandle: '@PROPBETEDGE',
  sports: [
    { id: 'mlb', label: 'MLB', icon: '⚾', href: 'https://mlb.propbetedge.ai/', status: 'LIVE' },
    { id: 'nfl', label: 'NFL', icon: '🏈', href: 'https://nfl.propbetedge.ai/', status: 'LIVE' },
    { id: 'nba', label: 'NBA', icon: '🏀', href: 'https://nba.propbetedge.ai/', status: 'LIVE' },
    { id: 'wnba', label: 'WNBA', icon: '🏀', href: 'https://wnba.propbetedge.ai/', status: 'LIVE' },
    { id: 'nhl', label: 'NHL', icon: '🏒', href: 'https://nhl.propbetedge.ai/', status: 'LIVE', current: true },
    { id: 'ufc', label: 'UFC', icon: '🥊', href: 'https://ufc.propbetedge.ai/', status: 'LIVE' },
    { id: 'tennis', label: 'Tennis', icon: '🎾', href: 'https://tennis.propbetedge.ai/', status: 'LIVE' },
    { id: 'soccer', label: 'Soccer', icon: '⚽', href: 'https://soccer.propbetedge.ai/', status: 'LIVE' },
    { id: 'golf', label: 'Golf', icon: '⛳', href: 'https://golf.propbetedge.ai/', status: 'LIVE' },
    { id: 'f1', label: 'F1', icon: '🏎️', href: 'https://f1.propbetedge.ai/', status: 'LIVE' }
  ],
  // Non-sport All Access products. Kept OUT of `sports` so nothing that iterates sports picks them up.
  products: [
    { id: 'members', kind: 'product', label: 'Command Center', href: 'https://members.propbetedge.ai/' },
    { id: 'compare', kind: 'product', label: 'Compare', href: 'https://compare.propbetedge.ai/' },
    { id: 'predictions', kind: 'product', label: 'Predictions', href: 'https://predictions.propbetedge.ai/' }
  ]
};
