// The PropBetEdge network, as the footer presents it. Same convention as the
// other sports products (LHBUSA/UFC docs/PROPBETEDGE_NETWORK_CONVENTION.md).
//
// PROPBETEDGE_DISCORD_URL is the one canonical, non-expiring invite for the
// whole network (owner-confirmed 2026-09-11). Reference it; never paste an
// invite code into a page.
// The store is the network's one live checkout, which today runs on the UFC
// app; it moves to propbetedge.ai/store/nhl when the shared storefront ships.
export const PROPBETEDGE_DISCORD_URL = 'https://discord.gg/kb5zCTHbME';

export const PBE_NETWORK = {
  news: 'https://propbetedge.ai/',
  store: 'https://ufc.propbetedge.ai/store',
  discord: PROPBETEDGE_DISCORD_URL,
  sports: [
    { label: 'MLB', href: 'https://mlb.propbetedge.ai/' },
    { label: 'NFL', href: 'https://nfl.propbetedge.ai/' },
    { label: 'NBA', href: 'https://nba.propbetedge.ai/' },
    { label: 'UFC', href: 'https://ufc.propbetedge.ai/' }
  ]
};
