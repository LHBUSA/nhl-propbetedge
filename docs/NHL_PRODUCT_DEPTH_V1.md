# NHL Product Depth V1 — Editorial + Player Identity

Date: 2026-09-11
Owner direction: make PropBetEdge NHL original reporting the primary editorial experience and materially improve player photography across the product.

## Product hierarchy

The NHL product now separates three layers deliberately:

1. **PropBetEdge NHL originals — primary editorial layer.** The public PropBetEdge Sports News Cloudflare API (`/news/by-sport/nhl`) powers the first-party newsroom feature and the Ice Board dispatch.
2. **NHL.com / external source wire — verification and status context.** The existing `nhl-intelligence/src/nhl-news.js` adapter remains the source for operational news classification, source health, injuries, goalie/line status context, transaction monitoring and watcher alerts.
3. **NHL game/roster/stat APIs — operational truth.** Scores, schedules, rosters, player data and other factual state remain sourced through the existing Cloudflare NHL gateway contract.

Editorial content must never silently replace source-of-record operational data.

## Player-image hierarchy

`src/components/player.js` is the single identity authority:

1. reviewed local Wikimedia portrait, when one is already in `player-portraits.json`;
2. NHL asset-feed headshot by NHL player ID/team, requested through the existing PropBetEdge Cloudflare image proxy;
3. branded initials + team mark;
4. neutral PBE mark when player identity is unavailable.

The verified NHL payload/fixture URL family is `https://assets.nhle.com/mugs/nhl/{season}/{TEAM}/{playerId}.png`. Current-season assets are tried before the prior-season fallback.

### Rights note

The product owner approved using NHL player imagery for product identity surfaces on 2026-09-11. That direction resolves the prior *product-decision* blocker documented in `IMAGE_SOURCES.md`; it does **not** itself establish ownership or a commercial image license. The NHL asset-feed images remain third-party imagery. A rights review can still narrow or replace this fallback later without changing the identity component contract.

Remote images are proxied through Cloudflare so the browser does not hotlink the NHL asset host directly. No image credential or private token is exposed.

## Architecture

- GitHub stores the source and history.
- Vercel presents the static frontend.
- Cloudflare operates NHL APIs, the public PBE News API, and the image proxy.
- No Vercel Function or GitHub Actions production runtime is introduced.

## Acceptance

- PBE NHL originals visibly lead the Newsroom.
- PBE Originals tab is no longer an empty placeholder.
- Ice Board has a first-party PBE NHL Dispatch before the external/source-wire changes block.
- Existing source-wire polling and watcher behavior remain intact.
- Player identity uses photo coverage product-wide through the shared component, not page-specific hacks.
- Broken/missing photos fall back cleanly; no guessed person image is substituted.
- 390px and desktop layouts remain usable.
- No browser secrets or privileged calls are introduced.
