# NHL.PropBetEdge.ai — "UFC 2.0" Production Build Master Brief

## Read this first

You are building the production NHL product for Justin Erickson / PropBetEdge.

This is not a landing-page exercise and it is not a generic sports dashboard. The target is the same level of seriousness, depth, visual quality, data provenance, and production verification as the existing PropBetEdge UFC and NFL products — then push beyond them where hockey gives us better real-time opportunities.

The product should feel like a premium hockey intelligence terminal with a newsroom and a live broadcast layer.

The working phrase is **UFC 2.0 for hockey**.

Communication style: direct, concrete, no filler. If a source, route, schema assumption, or existing comment is wrong, say so and fix the contract. Do not silently invent a workaround. Do not ask for approval on ordinary reversible implementation choices; keep moving until the acceptance bar is met. Stop only for a genuine external blocker, missing secret, licensing issue, or irreversible production action.

---

# 1. Repositories, branches, and architecture — non-negotiable

## Frontend

Repository:
`LHBUSA/nhl-propbetedge`

Work ONLY on:
`nhl-ufc2-production`

That branch was created from `nhl-product-v1`, which already contains the first Vite/Vercel NHL product scaffold. Do not reset it, replace it with another framework, or start over from empty `main`.

Existing frontend PR from the first scaffold:
`LHBUSA/nhl-propbetedge#1`

The Vercel project is already connected to this GitHub repository. Use branch previews. Do not promote production until the preview passes the acceptance bar below.

## API / Cloudflare backend

Repository:
`LHBUSA/propsports-api-worker`

NHL work branch:
`nhl-intelligence-v1`

Existing NHL backend PR:
`LHBUSA/propsports-api-worker#13`

This is a **Cloudflare Worker runtime**. GitHub Actions may test code or invoke Wrangler for deployment, but GitHub Actions must NEVER become the production runtime or scheduled data system.

Do not rewrite the worker architecture into Vercel, GitHub Actions, or another platform.

## Persistence

Supabase already has the isolated NHL persistence schema applied. Existing tables include:

- `nhl_ingest_runs`
- `nhl_games`
- `nhl_players`
- `nhl_shot_events`
- `nhl_goalie_snapshots`
- `nhl_line_snapshots`
- `nhl_odds_snapshots`
- `nhl_model_versions`
- `nhl_predictions`
- `nhl_prediction_grades`

All are RLS-enabled. Service-role writes only unless an explicit safe read policy/API layer is later introduced.

The backend branch also contains a daily Cloudflare cron archive path intended to persist completed NHL games and shot events into Supabase. Treat it as existing work to verify and improve, not something to replace with a GitHub scheduler.

## Required architecture

```
Browser
  -> NHL PropBetEdge frontend on Vercel
  -> owned PropBetEdge / PropSports Cloudflare routes
  -> approved upstream providers
  -> Supabase/R2 persistence as needed
```

Protected provider/API keys must never be shipped to browser JavaScript.

Use the existing Vercel server-side proxy for protected PropSports requests where appropriate, or make public calls directly to our owned Worker if they are intentionally public and CORS-safe. Do not put a PropSports private key, sportsbook key, Supabase service role, or source secret into `VITE_*` variables.

---

# 2. Current NHL backend surface — inspect before changing

The NHL intelligence branch already normalizes official NHL data and includes or is intended to include routes equivalent to:

Public/current-data layer:

- `/v1/nhl/schedule`
- `/v1/nhl/schedule/today`
- `/v1/nhl/scoreboard`
- `/v1/nhl/games/live`
- `/v1/nhl/standings`
- `/v1/nhl/leaders`
- `/v1/nhl/goalies/leaders`
- `/health/nhl-sources`

Expanded/protected layer:

- `/v1/nhl/game/:id`
- `/v1/nhl/game/:id/boxscore`
- `/v1/nhl/game/:id/plays`
- `/v1/nhl/game/:id/shots`
- `/v1/nhl/player/:id/stats`
- `/v1/nhl/player/:id/game-log`
- `/v1/nhl/team/:abbr/roster`
- `/v1/nhl/team/:abbr/stats`
- `/v1/nhl/goalie/:id/edge`

The shot route currently computes geometric features such as distance and angle and labels coarse danger buckets. Those are **raw engineered features, not calibrated xG probabilities**. Preserve that truth in every UI label and API contract until a trained xG model actually exists.

Before relying on any external official NHL endpoint, run live canaries against the current source shape. Mocked unit tests are necessary but do not prove that a league endpoint still exists or has the assumed JSON shape.

Do not break existing MLB/NFL routes in `propsports-api-worker`.

---

# 3. Calendar truth for this launch

Current date at kickoff: September 11, 2026.

The 2026-27 NHL preseason begins **September 19, 2026**.
The 2026-27 NHL regular season begins **September 29, 2026**.
The league has **32 teams**.
The 2026-27 regular season is an **84-game-per-team** schedule.

Remove or reject stale product copy such as:

- "Launching Oct 2026"
- "30 teams tracked"
- "before tip-off"

Use hockey-native language: **puck drop**, not tip-off.

The product must work in these states:

1. pre-preseason / no games today
2. preseason
3. regular-season pregame slate
4. one or many live games
5. intermission
6. final games
7. postponed/cancelled games if surfaced by source
8. stale-source/degraded mode
9. source unavailable

No page should look broken merely because no game is live.

---

# 4. Product thesis

NHL PropBetEdge should answer the questions a serious hockey bettor/fan asks before and during a game:

- Who is actually starting in goal?
- Did the goalie status just change?
- Which forward lines and D pairs are expected / confirmed?
- Who is injured, questionable, scratched, or returning?
- What changed since this morning?
- What are the strongest shot-volume and special-teams mismatches?
- How have lines/prices moved?
- What is happening in the game right now, beyond the score?
- Which player props are pacing toward or away from their target?
- Where are shot attempts coming from?
- Is the apparent pressure real or just low-quality volume?
- What is PBE's model saying, and what version/method produced that answer?
- How has the model actually performed after grading?

Build around those questions.

---

# 5. Information architecture

The final primary navigation should be compact and intentional. Recommended core surfaces:

1. **Ice Board** — home / today's games / live board
2. **PBE Cast** — full live play-by-play intelligence
3. **Props** — player/game prop market board
4. **Goalies** — starter status, workload, form, splits
5. **Lines** — forward lines, D pairs, PP/PK units where sourced
6. **Injuries** — injury/availability desk with provenance
7. **News** — hockey newsroom and material updates
8. **Shot Lab** — rink maps, Corsi/Fenwick, shot locations, later xG
9. **Matchups** — team-vs-team research view
10. **Players** — search + deep-dive pages
11. **Standings** — current standings
12. **Track Record** — immutable graded PBE picks/model results
13. **Methodology** — model/data definitions and source/staleness rules

Do not cram every possible page into the top nav. On mobile, use an intentional menu/bottom navigation pattern rather than horizontal overflow.

---

# 6. Visual target — world class, not dashboard-template generic

## Brand foundation

Use the current PropBetEdge design language established in the NFL product as the parent system:

- warm near-black ink ground
- warm paper text
- disciplined PropBetEdge gold
- crimson reserved for truly live/urgent states
- cool model blue only for model semantics
- green only for positive meaning, never brand chrome
- Playfair Display only for editorial/brand moments
- Inter for UI
- JetBrains Mono for odds, clocks, labels, percentages, data, timestamps

Do not create a ninth conflicting color system.

Gold is a line/accent before it is a fill. Avoid the casino-gold look.

## NHL-specific atmosphere

The NHL product should feel colder and faster without abandoning the parent brand:

- subtle ice/cyan atmospheric light may appear as a low-opacity environmental wash
- team colors may appear only as controlled accents on team-specific surfaces
- primary brand still reads PropBetEdge, not ESPN, NHL.com, or a sportsbook clone

## Mandatory background image treatment

The product needs a **premium full-bleed hockey background image / visual moment** on the home experience and selected editorial surfaces.

Rules:

- Do not hotlink a random image.
- Do not use Getty/NHLI/NHL copyrighted editorial photography without a license that allows this use.
- Search the existing PropBetEdge repositories for owned/licensed assets first.
- If a new external image is used, verify commercial reuse terms, download it locally, optimize to WebP/AVIF, and record source + license + original URL in `docs/IMAGE_SOURCES.md`.
- If no legally safe high-quality image is available, keep the code ready for `public/assets/nhl/hero-ice.webp`, use the best existing owned PBE asset as a temporary fallback, and explicitly report the missing art dependency. Do not silently use questionable photography.
- Add dark readability overlays and responsive focal positioning; do not destroy the image with a huge opaque gradient.
- Hero/background image must not make LCP terrible. Produce responsive assets and preload only the correct critical asset.

Visual concept: a cinematic, low-angle hockey scene / ice-level arena atmosphere with speed, boards, spray, hard light, and negative space for the PBE headline. It should read as **premium sports intelligence**, not a youth-hockey flyer.

## Above the fold

The first screen should immediately contain product utility:

- brand + season state
- current date / next puck drop
- live game count or "next slate"
- one strong editorial line, not paragraphs of marketing
- direct entry into live/today's Ice Board
- key alert rail: goalie change / scratch / injury / material line move when real data exists

Do not bury the games below a giant static landing page.

---

# 7. Ice Board — today's operating surface

Build a true hockey slate terminal.

Each game card/row should support, when sourced:

- away/home team names + logos
- scheduled puck-drop time
- live period + clock
- score
- shots on goal
- game state
- TV/network metadata if available
- moneyline / puck line / total
- meaningful line movement indicator
- starting goalie status per team
- rest/back-to-back context
- injuries/scratches count or alert
- special-teams snapshot
- PBE pick/edge only when a real model record exists
- freshness timestamp

Card actions:

- Open PBE Cast
- Matchup
- Props
- Goalies / Lines context

No fake probability dials.

---

# 8. PBE Cast — flagship feature

This is a top-priority surface. Think of it as PropBetEdge's own live hockey intelligence broadcast.

It should work for live games and as a replay/research experience for completed games.

## Core header

- game selector
- away/home teams + logos
- score
- period
- official clock
- live/final/pregame state
- current manpower state where derivable (5v5, 5v4, 4v4, empty net, etc.)
- shots on goal
- current goalies
- data freshness / stale marker

## Live play-by-play

Render the complete normalized event stream with clear event types:

- goals
- shots on goal
- missed shots
- blocked shots
- penalties
- faceoffs
- hits
- takeaways/giveaways if source provides them
- goalie changes
- period start/end
- other meaningful league events

Requirements:

- newest event can be emphasized while preserving full scrollback
- event timestamp + period
- team/players involved
- score state after event when available
- no raw-provider junk objects leaking into UI
- escape all source text before rendering

## Rink / Shot Map

Use **real shot coordinates only**.

Never use `Math.random()`, guessed coordinates, jittered missing points, or any fallback that fabricates where a shot occurred.

Missing coordinate => event remains in feed/stat totals but is absent from map and counted in a visible "coordinates unavailable" note if material.

Layer toggles:

- all attempts
- unblocked attempts / Fenwick
- shots on goal
- goals
- missed
- blocked
- team A / team B
- period

Visual encoding should distinguish event type and team without relying on color alone.

## Shot intelligence

Initially support real derived features:

- shot distance
- shot angle
- shot type
- event result
- high/medium/low geometric danger bucket **explicitly labeled as geometric / raw-feature heuristic**
- Corsi events
- Fenwick events
- on-goal rate
- team attempt share

Do not label geometric danger as xG.

## Game pressure / momentum

A "pressure" view may be built from real recent event rates such as rolling shot attempts, SOG, offensive-zone proxies if available, special-teams state, and score context.

If implemented before a calibrated model exists, label it descriptively (for example "5-minute pressure") rather than "win probability".

No fake win probability formula presented as a model.

## Live prop tracker

When PBE has pregame picks/markets, show live progress for:

- player shots on goal
- goalie saves
- points
- goals/assists where applicable
- team/game totals where applicable

Each tracker must identify:

- target line
- current live value
- book / market snapshot if stored
- generated/locked timestamp
- PBE model version if it is a model pick

Do not convert a raw pace percentage into an implied chance unless mathematically justified and documented.

## Live odds

If owned odds ingestion is present:

- display current market
- opening / previous snapshot
- movement
- age of quote
- book
- market stale state

Never call stale lines "live".

## Polling

Suggested behavior:

- live game: refresh approximately every 5-10 seconds, depending on upstream tolerance/cache strategy
- pregame: 30-60 seconds for volatile availability/odds surfaces
- final: stop aggressive polling
- page hidden: back off polling

Avoid duplicate timers and ensure unmount cleans them all.

---

# 9. Goalies — one of the product's strongest hockey differentiators

Build a dedicated Goalie Center.

Support three truth levels and never collapse them:

- **CONFIRMED** — backed by an authoritative/approved report
- **PROJECTED / REPORTED** — credible external report, not official confirmation
- **UNKNOWN** — no defensible source

Potential fields, only where sourced or legitimately derived:

- expected/confirmed starter
- team/opponent
- start status
- source + timestamp
- season save percentage
- recent save percentage / workload
- GAA
- shots faced / saves recent games
- days rest
- back-to-back status
- high/medium/low danger save splits if NHL Edge/source provides them
- home/away splits if sample/context is sufficient
- opponent shot generation

### GSAx rule

Do not display GSAx until a real expected-goals model exists and is validated.

Once xG exists:

`GSAx = expected goals faced - goals allowed`

Filter empty-net events and goalie-pulled contexts correctly. Version the model used to compute the number.

---

# 10. Line combinations / lineup intelligence

Official NHL APIs may not provide every real-time forward line, D-pair, PP1/PP2, PK unit, or confirmed scratch in a usable contract.

Do not guess.

Create a source matrix in `docs/NHL_SOURCE_MATRIX.md` before production wiring of non-official data. For every candidate source document:

- field(s) supplied
- URL / access method
- update cadence
- official vs reported vs projected semantics
- license/terms suitability
- attribution requirement
- failure mode
- fallback

Data model already includes `nhl_line_snapshots` with source/confidence fields. Use snapshots rather than overwriting history.

Desired UI when data exists:

- F1/F2/F3/F4
- D1/D2/D3
- PP1/PP2
- PK units
- changes since prior snapshot
- player moved up/down
- scratch / return flags
- timestamp + source

A change detector should be a real product feature: "What changed since morning skate?"

---

# 11. Injury / availability desk

Build this as an editorial + data surface, not a dump of statuses.

For each player when sourced:

- player/team/photo
- status vocabulary normalized to a controlled enum
- body area / description only if reported
- expected return only if source reports one
- practice/skate status if available
- source
- published/captured timestamp
- last material change

Never infer an injury diagnosis.

Never convert a rumor into "OUT".

The page should highlight **changes**, because changes move props and markets:

- newly out
- upgraded/downgraded
- game-time decision / questionable equivalent where source semantics exist
- returned
- placed on / removed from injured reserve if captured
- scratch announcements

Build stale state and source provenance into every material status.

---

# 12. News / updates — make the product feel alive every day

Create an NHL Newsroom that combines high-quality hockey updates with PBE's data surfaces.

Minimum categories:

- Breaking / roster moves
- Injuries / availability
- Goalies / line changes
- Trades / transactions
- Team news
- League news
- Game previews / recaps
- PBE model / market notes when generated internally

Use approved feeds/APIs/public sources with proper attribution. Do not scrape and republish copyrighted article bodies. Store/render headline, deck/summary written by us if generated, source, link, timestamp, teams/players/topics, and image only when license permits.

Create a source adapter rather than hardcoding one provider throughout UI.

If the existing PropBetEdge news infrastructure can support NHL safely, reuse the architecture and shared conventions rather than duplicating an entirely new newsroom stack.

Add entity linking so a news item can deep-link to:

- team page
- player page
- game / PBE Cast
- injury record
- goalie/line change

A strong home-page module is "What changed today" — material updates, not generic content volume.

---

# 13. Odds / markets / props

Inspect the existing PropBetEdge odds infrastructure and available provider credentials before adding a new provider.

Do not assume an `ODDS_API_KEY` supports every NHL player market; verify current provider coverage and market keys.

Store snapshots in `nhl_odds_snapshots` or an intentionally migrated successor so line movement and CLV are possible.

Priority markets:

Game:

- moneyline
- puck line
- total

Player:

- shots on goal
- goalie saves
- points
- goals
- assists

Add additional markets only after real coverage is verified.

The Props Board should expose:

- player
- team/opponent
- market
- line
- price
- book
- quote age
- opening/previous line when stored
- model fair line/probability only when generated by a real versioned model
- edge
- availability impact flags
- goalie/line context where relevant

No fake books, no fake consensus, no hardcoded demonstration prices in production paths.

---

# 14. Historical pipeline + model program

The product can launch useful live intelligence before a mature model exists, but the data collection/training loop should begin immediately.

## Historical backfill

Build a resumable NHL history backfill that can populate:

- games
- normalized play-by-play / shot attempts
- player/goalie game data
- team context
- final results

Prefer official NHL gamecenter/play-by-play history when viable, with a raw snapshot archive when practical so parsers can be reproduced.

Requirements:

- resumable checkpoints
- deterministic upserts
- source URLs / source version context
- row counts
- failed-game queue
- no silent parse loss
- canary samples manually compared against source
- rate-safe concurrency

Use Cloudflare Queues/Workers/Cron for ongoing production orchestration. A local one-time backfill script is acceptable for historical loading. Do not turn GitHub Actions into the recurring production ingest scheduler.

## xG model v1

Do not rush a marketing xG number.

Start with an auditable baseline, for example logistic regression and/or a tree/boosted challenger, using only features known at shot time.

Candidate features where reliably available:

- shot distance
- shot angle
- shot type
- strength state
- empty-net state
- rebound / time-since-prior-event proxy
- rush/context indicators if derivable without leakage
- score/period context where justified
- shooter/goalie effects only after enough data and with shrinkage/regularization

Evaluation:

- strict chronological / out-of-time validation
- Brier score
- log loss
- calibration curve / reliability bins
- discrimination metric such as ROC-AUC as secondary context
- season-by-season stability
- leakage audit

Persist model versions in `nhl_model_versions` and predictions/features with version references.

Only after validation should the UI expose **xG** and **GSAx**.

## SOG prop model

Baseline can use count modeling (Poisson/negative-binomial or another validated count model) using as-of information such as:

- player shot attempts / SOG rates
- expected TOI
- line role
- PP role
- opponent shot suppression
- pace/attempt environment
- home/away
- rest/back-to-back
- recent role changes
- teammate availability where defensibly encoded

Do not over-weight arbitrary recent streaks.

## Goalie saves model

Candidate structure:

- projected opponent SOG / attempts
- start probability / confirmation
- team defensive environment
- opponent shot generation
- game total / market context if allowed in model class
- goalie save-rate estimate with regression to mean
- rest/workload

Evaluate probabilistically and against closing market, not just hit rate.

## Track record

Predictions/picks must lock before game/market resolution. Existing locked predictions are immutable by schema. Grading lives in revisioned grade records.

Track:

- W/L/P/Void as applicable
- realized value
- model probability/fair line
- market line/price at lock
- closing line/value when captured
- model version
- generated/locked timestamp

Never rewrite old predictions after results are known.

---

# 15. Player pages

Each player page should combine research and market context:

- identity / team / position / sweater
- headshot when licensed/available
- season stats
- recent game log
- role / line / PP context when available
- injury status
- news
- upcoming opponent
- relevant prop markets
- historical prop outcomes
- shot volume / locations for skaters
- goalie workload / save profile for goalies

Prefer useful dense information over giant decorative profile cards.

---

# 16. Team / matchup pages

Matchup page should compare the two teams using real hockey context:

- records / standings
- recent form
- goals for/against
- shot attempt share / Corsi/Fenwick where computed
- SOG generation/allowed
- special teams PP/PK
- expected/confirmed goalies
- rest / travel / back-to-back
- injuries / scratches
- line changes
- odds movement
- recent head-to-head as context only, never treated as predictive magic

Label sample windows clearly.

---

# 17. Special teams

At minimum support official/team-stat PP and PK rates when available.

Do not promise "zone entry intelligence" unless we have an actual source or a validated event-derived method for zone entries.

Possible useful fields:

- PP%
- PK%
- opportunities per game
- PP SOG/attempt rate if derivable
- recent sample with clear window
- PP1 personnel when sourced

---

# 18. Search and command behavior

A premium terminal should be easy to navigate fast.

Implement a global search/command interaction if it fits the current stack:

- teams
- players
- today's games
- recent games
- news topics

Keyboard accessibility matters on desktop.

Do not make search a decorative input that returns nothing.

---

# 19. Data truth rules — absolute

These rules override visual convenience.

1. **Never fabricate a sports fact.**
2. No `Math.random()` in data rendering, model inputs, probabilities, shot locations, or placeholders.
3. Missing coordinate => `null`, not guessed location.
4. Missing starter => UNKNOWN, not projected unless a source actually projects it.
5. Missing line combo => unavailable, not inferred from last game unless explicitly labeled historical fallback.
6. No made-up injuries, return dates, books, prices, line movement, or probabilities.
7. Never label stale provider data LIVE.
8. Every meaningful time-sensitive panel must expose freshness or source age.
9. Source text is untrusted input; escape it before inserting into DOM.
10. A model claim requires a model version and reproducible method.
11. A heuristic must be called a heuristic.
12. No 30-team copy; NHL has 32 teams.
13. No "Launching Oct 2026" copy; preseason and regular-season dates are already known.

---

# 20. Security and privacy

- Secrets only in Cloudflare/Vercel/Supabase secret managers or local ignored env files.
- Never commit live keys.
- Never expose service-role credentials client-side.
- Preserve rate limiting/auth in PropSports.
- Restrict internal backfill/control routes with existing owner/dashboard auth patterns.
- Validate user-controlled IDs/path params before passing upstream.
- Never make an open arbitrary-URL proxy.

---

# 21. Reliability / source semantics

For every time-sensitive source create or preserve metadata equivalent to:

- `source`
- `source_url` where appropriate
- `captured_at` / `fetched_at`
- `stale_at` or TTL semantics
- `status` / source health

The frontend should have distinct visual states for:

- LIVE / current
- recent / cached
- stale
- unavailable
- source error

A network exception must not leave the previous value looking live forever.

Keep useful last-known data on screen when safe, but mark its age loudly.

---

# 22. Testing

## Backend tests

Add/maintain deterministic regression fixtures for:

- schedule normalization
- game state
- play-by-play normalization
- shot event classification
- coordinates
- Corsi/Fenwick totals
- goalie extraction
- auth / paid route protection
- Supabase game/shot upsert payloads
- archive idempotency
- source canary behavior

Mock tests must not replace live canaries.

## Frontend tests / QA

At minimum verify:

- home / Ice Board
- PBE Cast
- Goalies
- Lines
- Injuries
- News
- Props
- Shot Lab
- Player page
- Matchup
- Track Record / empty state

States to force/test:

- no games
- upcoming games
- live
- intermission
- final
- missing shot coordinates
- missing goalie source
- stale odds
- source 500/error
- mobile nav open/closed

## Browser verification

Use Playwright/browser tooling if available and produce screenshots at:

- 1440px desktop
- 1024px laptop/tablet landscape
- 390px mobile
- optional 360px narrow mobile for overflow stress

Screenshots must cover at least:

- Home / Ice Board
- PBE Cast
- Injuries
- News
- Props
- Shot Lab

Measure/document:

- horizontal overflow = 0
- broken images = 0
- console errors = 0 on core pages
- failed production API calls = 0 except deliberately forced error tests

Do not declare something "production ready" based on a successful build alone.

---

# 23. Performance and accessibility

- Responsive image formats/sizes.
- Lazy-load non-critical imagery.
- Avoid huge JS dependencies for simple charts.
- Poll only when page is visible/relevant.
- Clean all intervals/listeners on unmount.
- Accessible focus states.
- Buttons/links have real labels.
- Semantic tables where applicable.
- Never rely on red/green alone.
- No meaningful text under 10px.
- Respect reduced motion.
- Avoid inaccessible gold-on-light combinations.

Aim for Lighthouse accessibility/best-practices scores >= 90 on core pages and a reasonable performance score with the hero image loaded. Report the actual numbers; do not massage them.

---

# 24. Execution order

Follow this order unless a real dependency forces a change.

## Phase 0 — Audit first

Before editing:

1. inspect `nhl-ufc2-production`
2. inspect `LHBUSA/UFC` for product depth/pipeline patterns
3. inspect `LHBUSA/nfl-propbetedge-new` and its `PROPBETEDGE_DESIGN_SYSTEM.md` for brand/system conventions
4. inspect `LHBUSA/propsports-api-worker` `nhl-intelligence-v1`
5. inspect current Supabase NHL schema/migration definitions in repo
6. inspect Vercel preview/build config
7. document real current gaps in `docs/NHL_BUILD_STATUS.md`

Do not redesign blindly before you understand what is already working.

## Phase 1 — Product shell + visual system

- port/adapt PBE design tokens cleanly
- production nav
- premium NHL background visual
- Ice Board
- responsive shell
- current season/preseason state
- meaningful empty/degraded states

Do not fake deep functionality just to fill cards.

## Phase 2 — Verify live NHL source contracts

- live canary each official endpoint used by backend
- normalize source errors
- fix source routes only on `nhl-intelligence-v1`
- do not break non-NHL PropSports paths
- verify schedule/game/standings/leader/roster/player/goalie endpoints against real source payloads

## Phase 3 — PBE Cast

Build the flagship live experience using real normalized play-by-play and shot data.

## Phase 4 — Goalies / lines / injuries / newsroom

- source matrix first for non-official signals
- implement adapters
- snapshot changes
- surface provenance and timestamps

## Phase 5 — Odds / props / tracking

- verify provider market coverage
- ingest snapshots server-side
- props board
- live prop progress in PBE Cast
- market movement

## Phase 6 — Historical backfill + model shadow lane

- history ingestion
- xG baseline training/validation
- SOG / saves model baselines
- versioning
- shadow predictions
- no public xG/GSAx claims until release criteria are met

## Phase 7 — Production QA

- desktop/mobile screenshots
- CI
- live source canaries
- accessibility/performance
- stale/error/offseason states
- no console errors
- no broken assets
- no direct protected provider calls from browser

Only after all relevant release blockers are cleared should you recommend merging/promoting.

---

# 25. Git discipline

Frontend work stays on:
`nhl-ufc2-production`

Backend work stays on:
`nhl-intelligence-v1`

Commit by coherent milestone, not every tiny line edit.

Do not merge either branch to `main` automatically.

Do not deploy the NHL backend to the production Cloudflare Worker automatically unless Justin explicitly asks for production promotion after verification.

Vercel branch previews are expected and encouraged.

If you need to change shared PropSports code, run MLB/NFL regression tests too.

---

# 26. Required deliverables

By the end, leave these artifacts in the repo(s):

Frontend repo:

- production NHL UI
- `docs/NHL_BUILD_STATUS.md`
- `docs/IMAGE_SOURCES.md`
- `docs/NHL_SOURCE_MATRIX.md`
- `docs/NHL_UI_VERIFICATION.md`
- screenshots directory or linked QA artifacts
- clear env example with names only, never secrets

Backend repo:

- verified NHL source normalizers
- archive/backfill logic
- deterministic regression tests
- source canary
- any NHL-only schema migration additions
- model/backfill docs and verification results

If a feature is blocked by source licensing or unavailable data, mark it clearly as blocked. Do not turn a product requirement into fake data to make the screen look complete.

---

# 27. Acceptance bar — do not call it done until this is true

## Product

- Home looks premium and distinctly hockey/PropBetEdge.
- Background imagery is high quality, legal to use, local, optimized, and readable.
- Today's schedule is useful even when no games are live.
- PBE Cast is a real live/replay intelligence surface, not a score widget.
- News and injuries make the product useful every day.
- Goalie state and line/availability changes are first-class.
- Props/odds have freshness and source semantics.
- Model claims are versioned and real.

## Data

- no fabricated sports values anywhere in production paths
- no randomized coordinates
- all time-sensitive values have age/source semantics
- live source canaries pass
- historical writes are idempotent
- completed games/shot events persist correctly
- stale source does not masquerade as live

## Engineering

- frontend build passes
- backend regression passes
- shared PropSports regression passes where touched
- zero core-page console errors
- no leaked secrets
- no GitHub scheduler replacing Cloudflare runtime
- no unrelated MLB/NFL regression

## Visual

- 1440 screenshot set passes
- 390 screenshot set passes
- zero horizontal overflow
- no clipped nav
- no tiny unreadable labels
- no broken logos/headshots/backgrounds
- no giant dead whitespace
- no generic bootstrap/dashboard-template feel

---

# 28. First response / kickoff behavior

Do not give Justin a long planning essay and then stop.

Start by auditing the two working branches and the UFC/NFL quality references, then immediately begin implementing Phase 1 and verifying Phase 2 in parallel where safe.

In your first substantive progress update, report only:

- what you found
- what you changed
- what is already proven
- what remains blocked

Then keep working.

The goal is not to "design a concept." The goal is to leave **NHL.PropBetEdge.ai as a production-grade hockey intelligence product** before the 2026-27 season starts.
