# NHL Product Depth V1 — PBE Editorial + Player Identity

Date: 2026-09-11
Owner direction: make PropBetEdge NHL articles the primary editorial experience and materially improve player photography across the product.

## Product hierarchy

The NHL product separates three layers deliberately:

1. **PropBetEdge NHL Desk — primary editorial layer.** The public PropBetEdge Sports News Cloudflare API (`/news/by-sport/nhl`) is filtered to the PBE-authored analysis subset. PBE analysis leads the Newsroom and Ice Board editorial rail.
2. **NHL.com / approved external metadata — verification and status context.** The existing `nhl-intelligence/src/nhl-news.js` adapter remains the source for operational news classification, source health, injuries, goalie/line status context, transaction monitoring and watcher alerts.
3. **NHL game/roster/stat APIs — operational truth.** Scores, schedules, rosters, player data and other factual state remain sourced through the existing Cloudflare NHL gateway contract.

Editorial content must never silently replace source-of-record operational data.

## PBE article contract

The generic Sports News table also contains raw source-wire rows. A row is eligible for the PBE NHL editorial surface only when it has the deterministic characteristics of a published PBE analysis article:

- a PBE byline is present;
- a substantive PBE article body is present;
- title and PBE slug are present;
- underlying source and source URL are present.

The NHL vertical deliberately **does not render** these known-risk generic fields from that feed:

- upstream/source summary text;
- upstream article imagery;
- generated `take.summary` copy;
- generated `bet_advice`.

The product shows the PBE article title/link and keeps the underlying source outlet + source link attached to every card. This makes PBE the primary editorial experience without falsely presenting the originating report as PropBetEdge reporting.

The existing network-wide Sports News pipeline still deserves its own provenance/rights hardening; this NHL UI change does not declare that broader issue resolved.

## Player-image hierarchy

`src/components/player.js` is the single identity authority:

1. reviewed local Wikimedia portrait, when one is already in `player-portraits.json`;
2. NHL asset-feed headshot by NHL player ID/team, requested through the existing PropBetEdge Cloudflare image proxy;
3. branded initials + team mark;
4. neutral PBE mark when player identity is unavailable.

The verified NHL payload/fixture URL family is `https://assets.nhle.com/mugs/nhl/{season}/{TEAM}/{playerId}.png`. Current-season assets are tried before the prior-season fallback.

### Rights note

The product owner approved using NHL player imagery for product identity surfaces on 2026-09-11. That direction resolves the prior *product-decision* blocker documented in `IMAGE_SOURCES.md`; it does **not** itself establish ownership or a commercial image license. The NHL asset-feed images remain third-party imagery. A rights review can still narrow or replace this fallback later without changing the identity component contract.

Remote player images are proxied through Cloudflare so the browser does not hotlink the NHL asset host directly. No image credential or private token is exposed.

## Architecture

- GitHub stores the source and history.
- Vercel presents the static frontend.
- Cloudflare operates NHL APIs, the PBE News API, and the image proxy.
- Supabase remains the durable news/article system of record.
- No Vercel Function or GitHub Actions production runtime is introduced.

## Acceptance

- PBE NHL analysis visibly leads the Newsroom.
- The old empty PBE tab becomes a populated PBE NHL desk when authored articles exist.
- Ice Board has a first-party PBE NHL Dispatch before the external/source-wire changes block.
- Every PBE editorial card retains an attributed underlying source link.
- The NHL vertical does not render upstream summaries, third-party article images, generated take summaries or generated betting advice from the generic feed.
- Existing source-wire polling and watcher behavior remain intact.
- Player identity uses photo coverage product-wide through the shared component, not page-specific hacks.
- Broken/missing photos fall back cleanly; no guessed person image is substituted.
- 390px and desktop layouts remain usable.
- No browser secrets or privileged calls are introduced.
