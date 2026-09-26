// Canonical PropBetEdge network links used by the NHL product chrome.
// Keep cross-sport discovery in one source of truth so the nav, mobile sheet
// and footer never drift from each other.
//
// PROPBETEDGE_DISCORD_URL is the canonical non-expiring community invite.
// The store currently lives on the UFC product until the shared storefront
// ships at the network level.
export const PROPBETEDGE_DISCORD_URL = 'https://discord.gg/kb5zCTHbME';

export const PBE_NETWORK = {
  hub: 'https://www.propbetedge.ai/',
  news: 'https://propbetedge.ai/',
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
    { id: 'tennis', label: 'Tennis', icon: '🎾', href: 'https://tennis.propbetedge.ai/', status: 'LIVE' }
  ]
};
