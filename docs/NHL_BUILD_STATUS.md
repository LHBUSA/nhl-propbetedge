# NHL PropBetEdge — build status

Release line: **`main` is production** (Vercel deploys `main`; the Cloudflare `nhl-gateway` serves the browser). `nhl-ufc2-production` was merged and is an ancestor of `main`. Last updated 2026-09-11.

**Live:** nhl.propbetedge.ai served `2aba93b` (`dpl_BErKyuPQS8qG1iTVY1CYUdRSHDc9`) when this acceptance started and `d119017` (`dpl_Bgh3CLbHGMgK4AFjsN8CCkhE3yeY`, PR #5) by the time it finished. The identity + visual depth pass is **production complete** on both — see "Production acceptance" below. Do not re-promote branch builds or roll back to reach it.

Status words: **PROVEN** = verified by a command that was actually run (evidence given) · **IN PROGRESS** · **BLOCKED** (with the blocker) · **UNVERIFIED** (built or planned, not yet proven).

---

## Audit findings (2026-09-11 kickoff)

| # | Finding | Severity | Status |
|---|---|---|---|
| A1 | Production `propsports-api` runs `main` (legacy NHL shape). The `nhl-intelligence-v1` branch has never been deployed anywhere. `/health/nhl-sources` 404s in production. | High | Open — preview Worker deploy needs owner approval (see B1) |
| A2 | Vercel project `nhl-propbetedge` has **zero** env vars. The proxy called production unauthenticated, so every protected NHL route returned 403 in every preview. | High | Open (B1) |
| A3 | `api/nhl.js` forwarded the owner dashboard secret to any path beginning `/nhl/` — `/nhl/../mlb/...` would reach other protected routes with owner credentials. | **Security** | **Fixed** — strict route + query allowlist; CI test (`tests/frontend-checks.mjs`) |
| A4 | `geometric-v0` shot geometry chose the nearest net by `|x|` and clamped behind-net depth to 0 — every shot from outside the offensive zone got the wrong distance/danger. | High (data truth) | **Fixed** — `geometric-v1` uses play-level `homeTeamDefendingSide`; unknown direction ⇒ null |
| A5 | Shooting team taken from `eventOwnerTeamId`; blocked-shot `zoneCode` is blocker-relative. | Medium | **Fixed** — shooter team from `rosterSpots`; blocked zone withheld |
| A6 | `/schedule/today` fell back to the whole week when the date had no games (would show other days as "today"). | High | **Fixed** + regression |
| A7 | Goalie leaders asked the source for `savePct`; source only accepts `savePctg` (HTTP 400). The old Goalies tab was always broken. | Medium | **Fixed** (alias) |
| A8 | `/standings/now` returns the **2025-26 final** table (dated 2026-04-17) until the new season; old UI presented it as current. | Medium | **Fixed** — `semantics: PRIOR_SEASON_FINAL` |
| A9 | NHL Supabase schema lives on project `rlfyavnhbngwbldebrid` (the SQL comment says PROPBETEDGE/`tkmlnhmylqnttmnsnief` — wrong). All 10 NHL tables had **0 rows**; the archive cron never ran. | High | **Done** — 5,592 games archived, `nhl_games` populated; odds + line snapshot history started |
| A10 | Old frontend: single 19 KB file, "Model Readiness" marketing, Space Grotesk, no provenance, no mobile nav. | — | Replaced with the production shell below |
| A11 | Raw provider objects (`raw_details`, highlight URLs) leaked in public payloads. | Low | **Fixed** |
| A12 | "47 games that day" on the first home render — schedule games carry no `gameDate`; my day filter matched the whole week. Caught in QA screenshots. | High (fake number) | **Fixed** `4015fa6` + regression |

---

## PROVEN

| Item | Evidence |
|---|---|
| Backend regressions: NHL intelligence, NHL ingest, NHL news, primary NFL v5 (shared entry), NFL data fixture | all PASS locally at `4015fa6`; CI workflow runs all five |
| Live source shape canary (`/health/nhl-sources`) | 8/8 checks ok against api-web.nhle.com (schedule, score, 32-team standings, leaders, pbp situationCode + defending side + coords, boxscore starter flag, club stats) — run locally |
| Derived SOG = official SOG | 2025020500: derived 18/29 = official 18/29; 133/133 attempts roster-resolved; 0 missing coordinates |
| Next puck drop | Sep 19 2026 23:00Z, DAL@STL / MTL@TOR / TOR@MTL, 7 games that day (after A12 fix) |
| Pregame goalie honesty | future game ⇒ `UNKNOWN` with reason; completed game ⇒ `CONFIRMED` from boxscore starter flag with source URL + captured_at |
| Newsroom adapter | 4/4 feeds live (NHL.com forge general/injury/transactions + Yahoo NHL RSS), headlines + links only, no bodies; one-feed failure ⇒ `degraded`, not failure |
| Frontend build | `vite build` passes; main 9.6 KB gz, PBE Cast 8.9 KB gz, no chart libraries |
| Frontend static guards | `tests/frontend-checks.mjs`: proxy allowlist + no Math.random / stale copy / unqualified xG / VITE_ secrets — PASS |
| Local end-to-end | Vite → `/api/nhl` proxy → branch Worker (`wrangler dev --local`) → NHL; traversal `/nhl/../mlb/odds` ⇒ 400 |
| Hero art licensing | Pexels License, verified on the photo page; no logos/faces; AVIF/WebP 640–2560 + mobile crops; `docs/IMAGE_SOURCES.md` |
| History backfill | 2022-23 → 2025-26 reg + playoffs: 5,592 games archived (raw pbp + boxscore, sha256 manifest), 0 failed; `nhl_games` upserted and count-verified 1400/1400/1398/1394; second run 0 downloads, identical counts (`b2988b0`) |
| Shot-data audit | blocked-shot owner = shooting team 100% in all 4 seasons; direction sanity 1.000 every season; 0 missing coordinates; score-before-shot excludes the shot's own goal in 34,398/34,398 goals |
| xG baseline v1 (SHADOW) | pre-frozen 8 release criteria; test 2025-26 (118,251 shots): log loss 0.2253 vs 0.2322 distance-only vs 0.2480 constant, AUC 0.740, slope 0.912, ECE 0.0082 → PASS with thin margins; PP shots poorly calibrated (slope 0.64). JS/Python parity ≤ 2.2e-16. Not public. |
| SOG baseline | beats rolling mean but FAILS P(SOG≥2) calibration criterion; market benchmark N=0 |
| Derived line deployment | `shift-overlap-v1` from official shift charts + pbp strength timeline (`91e3bad`); live: 2025020500 MTL F1 Suzuki–Bolduc–Caufield, D1 Dobson–Hutson; deterministic regression |
| PBE Cast replay | `tests/e2e/replay.e2e.mjs`: 0–0 at event 1, 1–0 at first goal, step back restores 0–0, playback advances, deep link `?t=` restores; state rebuilt purely from events 0..k (`5222e56`) |
| Alerts | pure rules unit-tested (`tests/alerts.test.mjs`): first load primes, postponements alert for all games, goals/puck drop only for watched games, goalie UNKNOWN→CONFIRMED, breaking news; one bus, one seen-set (`1de68ab`) |
| Limited mode | production (legacy API) renders the real schedule with labelled provenance and zero console errors; `/api/env` server-side probe (`bf08a67`) |
| Odds snapshot pipeline | `nhl-odds` Worker code (`98a1354`, not deployed): one real ingest, 3 credits → 15 events, 15/15 matched to NHL game ids, 10 US books; FLA@CAR no-vig CAR 53.9% (fair −117/+117); 538 rows appended to `nhl_odds_snapshots` (count-verified). Reads never call the provider (regression). |
| Market UI | Ice Board cards + Cast market panel render that real snapshot through the Worker's own handler locally: best price/book, no-vig, books quoting, moves since open, per-book quote age (`5383884`) |
| Command center | `#/cast?view=all`: 2026-04-16 slate (6 finals) renders attempt share, SOG, last goal; live cadence 15 s for ≤ 6 games (`b6d8145`) |
| Line snapshots archive | daily Cloudflare archive appends derived deployment rows to `nhl_line_snapshots`, idempotent per game (`03bedd0`) |
| Backend fixes from page QA | goalie rest now uses the game's own season (2025020500: MTL 2 days, NYR 3); unknown ids → 404 not 503 (`cbd69a6`) |
| Lighthouse (production bundle, local) | Home desktop perf 97 / a11y 100 / BP 100; Home mobile 81–87 / 100 / 100 (CLS 0.558 → 0.021); Cast desktop 99/100, mobile 88/100; Standings mobile 98/100; Shot Lab mobile 94/97→fixed. SEO 92 everywhere (hash routing). Mobile home LCP ~3.9 s on simulated slow 4G (H1 rendered by JS) — known. |
| Desk pages | Goalie Center, Injury desk, Newsroom, Lines, Props (`6d834e2`): Lighthouse a11y 100, axe 0, CLS ≤ 0.003 |
| Lines integration | real derived last-game deployment on Lines (MTL 2026-05-29: F1–F4, D1–D3, PP1–2, PK1–2, limited-sample flags) (`b2e1a96`) |
| Best Line | Props renders every priced game from the stored snapshot: best price + book, EV vs ≥2-book no-vig consensus (market comparison, not model edge), puck line, total, moves since open (`5743fca`) |
| Backend QA fixes | as-of goalie workload (last 5 before the game date, game's season); "sign" no longer mis-files stories as Transactions (`7edb1a5`) |

## Identity + visual depth pass (2026-09-11)

| Item | Status | Evidence |
|---|---|---|
| App identity (favicon SVG/ICO/16/32, apple-touch 180, PWA 192/512/maskable) | **PROVEN** | Hockey-stick P mark (approved, merged `670dbc1` from a separate session) replaces the first faceoff-circle P (`f6604d0`); own drawing, no league marks; `tests/identity-checks.mjs` asserts every size |
| Meta / SEO / social: canonical, robots, OG + Twitter with purpose-built 1200×630 card, JSON-LD (Organization, WebSite, WebApplication, WebPage — no ratings/reviews/offers/user counts), web manifest, no service worker | **PROVEN** | identity-checks in CI; served locally 200 with correct types; no preview/local URLs in the built head |
| Page backdrops: 9 licensed Pexels photos (Cast, Props, Goalies, Lines, Injuries, News, Matchups, Players, Standings) + owned generated art (Shot Lab rink, Methodology geometry, Track Record terminal) | **PROVEN** | `6ad362d`; AVIF/WebP at 800/1400/2000 + 7:9 mobile, one image per route, preloaded only for the landing route; licenses in `docs/IMAGE_SOURCES.md` §5 |
| Player identity component + 45 licensed Commons portraits, fallback initials + team badge → neutral PBE mark | **PROVEN** | `dd1ddac`; credits visible on the player hero, in image titles, and in Methodology → Image credits (generated from the manifest) |
| Preseason Intelligence Mode (ribbon on every page, capability panel on the Ice Board) | **PROVEN** | `1836719`; renders in the v2 and legacy environments (limited-mode QA) |
| Visual QA 18 routes × 1440/1024/390/360 + limited mode; Lighthouse 11 pages × 2 | **PROVEN** | `docs/NHL_UI_VERIFICATION.md`, screenshots + contact sheets in `docs/qa/`; a11y 100 and best practices 100 on all 22 Lighthouse runs |
| Layout shift | **IMPROVED** | metric-matched font fallbacks (`src/styles/fonts.css`): Team desktop 0.122 → 0.004, Player mobile 0.119 → 0, Cast desktop 0.045 → 0.004. Ice Board: top-anchored hero + fixed-height rail + legacy-sized panel slot — desktop 0.07 → 0.004 (v2) and 0.113 → 0.004 (legacy, what production serves), phones 0.02 → 0 |
| Mobile LCP on photo-backdrop pages | **REGRESSED (accepted)** | backdrop became the LCP element; Cast mobile 3.0 → 4.4 s simulated (perf 88 → 78). Preload added; observed LCP = FCP. Owner can disable photos on phones in one line |
| Cast mobile CLS 0.062 (`#cast-body` skeleton under throttling) | **UNVERIFIED fix** | pre-existing (0.072 before the pass); not addressed here |
| NHL.com headshots | **LIVE since `d119017` — needs owner confirmation** | PR #5 made the NHL asset feed (`assets.nhle.com/mugs/...`, via `propbet-img-proxy.sales-fd3.workers.dev`) the fallback between the reviewed portrait and the initials, labelled "Player image · NHL asset feed". `docs/NHL_PRODUCT_DEPTH_V1.md` records an owner approval dated 2026-09-11; the brief this session was working to said headshots stay unused. Flagged, not reverted |
| Personality rights on 10 Commons portraits | **OWNER DECISION (does not block the live release)** | copyright licence is clean; publicity rights next to betting content are not. Prepared, unmerged withdrawal path: branch `nhl-portrait-optout-prep` (`586bb72`) |
| Team logos from `assets.nhle.com` | **OWNER DECISION (does not block the live release)** | league marks, hotlinked through one function (`logoUrl` in `src/lib/teams.js`) |
| Production carries the identity pass | **PROVEN (live)** | accepted against nhl.propbetedge.ai twice on 2026-09-11 (`2aba93b`, then `d119017`) — see "Production acceptance" |

## Production acceptance — nhl.propbetedge.ai (2026-09-11)

Chromium (Playwright) against the public site: 8 routes × 1440 / 390 (`/`, `/cast/2026020001`, `/cast/2025020500`, `/news`, `/players`, `/player/8480018`, `/injuries`, `/props`). Run once on `2aba93b`, then again after production moved to `d119017` mid-acceptance. Both runs green on every check below.

| Check | Result |
|---|---|
| Console errors / page errors | **0** on all 16 loads, both runs |
| Horizontal overflow | **0 px** on all 16 loads, both runs |
| Broken images | **0** — 271 images in the first run, 452 in the second (News 122, Players 82, Injuries 64, Props 44) |
| Portraits | 0 broken. On `2aba93b`, 45 reviewed Commons portraits with 15–23 initials fallbacks per page; on `d119017`, near-full coverage (Players 25 portraits, 0 fallbacks) because the NHL asset feed now fills the gaps |
| Cinematic backdrops | correct file per route and viewport (`cast/news/players/injuries/props-2000.avif` at 1440, `-m-700.avif` at 390); Ice Board keeps its hero photo |
| Identity / icons | every icon, the manifest and the OG card serve 200 and are **byte-identical to `main`** (SHA-256): hockey-stick P favicon (SVG/ICO/16/32), apple-touch 180, PWA 192/512/maskable, `og/propbetedge-nhl-1200x630.jpg` |
| Head / structured data | one `<title>`, one canonical, absolute `og:image`, `summary_large_image`, one JSON-LD block (Organization / WebSite / WebApplication / WebPage) with no rating, review, offer, award or interaction-count claim; 0 localhost or preview URLs |
| Live gateway data | all NHL data via `nhl-api.propbetedge.ai`: 43 responses per run, **all 200 with `X-NHL-Semantics: CURRENT`**, 0 failed requests. The gateway refuses off-product callers (403, `ERROR` semantics) |
| Scheduled odds-snapshot semantics | stated as a schedule, never as live: Cast pregame "Scheduled market snapshot below (08:00 / 13:00 / 18:00 ET). Not a live feed."; Props "MARKET SNAPSHOT (THE ODDS API), SCHEDULED 08:00 / 13:00 / 18:00 ET — NOT A LIVE FEED" with the snapshot's age (`CACHED · 4h 25m ago`), no-vig and book counts; player props read "no book has posted NHL player markets in this snapshot" |
| NHL Pro purchase / paywall surface | present on every page, opens and closes; Founding Season $9.99 / month and $3.99 / week; checkout **closed** — CTA "Founding Season checkout coming online", no Stripe link in the DOM, "No free trial. No fake urgency. Cancel anytime." No purchase attempted |

Open items this run surfaced (none of them release-blocking):

1. **NHL asset-feed headshots are live** (see the table above) and need owner confirmation, because the standing instruction to this session was that NHL.com headshots stay unused. They are proxied through `propbet-img-proxy.sales-fd3.workers.dev` — a `workers.dev` host serving third-party images from a production surface, which is worth its own look.
2. **Text below 10 px**: `.pbepro__open` (the `NHL PRO` topbar button) at 9 px, and `.pbeo-mini__source` links ("Source: …") at 9 px. 3–8 such nodes per page on `d119017`, versus 2 on `2aba93b`.
3. **Ice Board editorial sources** now include The Hockey Writers, ESPN and Daily Faceoff links. Confirm that path stays headline-and-link-only: ESPN and Daily Faceoff terms bar automated collection (`docs/NHL_SOURCE_MATRIX.md`).


## IN PROGRESS

- Live prop tracker (market line vs live stat + TOI pace) — needs posted player props (provider had none 18 days out).
- (done) Final QA matrix: 72/72 PASS — see `docs/NHL_UI_VERIFICATION.md`.

## BLOCKED

| # | Blocker | Needs |
|---|---|---|
| B1 | Branch preview Worker deploy (`wrangler deploy --env nhlpreview` → `propsports-api-nhl-preview`, no cron, no KV) was denied by the session's permission classifier as a production deploy. Until it exists, Vercel previews can only reach production's legacy NHL routes and every v2 surface shows "Data layer not deployed here" (honest, not faked). | Owner approval to deploy the preview Worker **and** to set Vercel *Preview* env `PROPSPORTS_BASE_URL` + `PROPSPORTS_DASHBOARD_SECRET` |
| B2 | Pregame starting goalies: no approved source. DailyFaceoff / LeftWingLock / RotoWire sites prohibit scraping/commercial use. Pregame status renders `UNKNOWN`. | Owner: LeftWingLock commercial API quote, or accept NHL.com "projected lineups" article risk |
| B3 | Injury status table (OUT/DTD/IR enum): ESPN covers 26/32 teams, comments are RotoWire's, Disney ToU bans automated collection. | Licensed injury feed. Degraded mode: NHL.com injury-tagged headlines (built) |
| B4 | Projected lines / PP units: restricted sources only. Derived "last-game deployment" from NHL shift charts is possible (not yet built). | Licensed lines feed for projections |
| B5 | Player props: The Odds API returned **no** NHL player markets 18 days out (h2h/spreads/totals from 10 US books did). | Game-day re-check; odds ingest Worker (below) |
| B6 | Odds ingest Worker (3×/day KV snapshot, NFL pattern) must be a separate Worker (Odds API terms forbid re-serving through the sellable PropSports API) — code can be written; deploy + `ODDS_API_KEY` secret need approval. | Owner approval |
| B7 | Supabase migration 002 (shot-event context columns) — written by the backfill lane, **not applied**. | Owner approval to apply |
| B8 | **Backend CI cannot run**: GitHub refuses to start jobs on the private `propsports-api-worker` repo — "recent account payments have failed or your spending limit needs to be increased". All six suites pass locally at every commit. | Owner: GitHub billing |
| ~~B9~~ | **Resolved 2026-09-11.** The identity pass reached production the normal way: `nhl-ufc2-production` merged to `main`, and `main` deploys production. Rollback candidate: `dpl_BErKyuPQS8qG1iTVY1CYUdRSHDc9` (`2aba93b`). | — |
| B10 | Model-version INSERTs for xG/SOG candidates generated as SQL, not executed. | Owner approval |

## UNVERIFIED / OWNER DECISIONS

- **NHL.com Terms of Service** limit use to "non-commercial, informational, personal use" and bar automated collection (`docs/NHL_SOURCE_MATRIX.md` §0). Every official-data feature depends on accepting that risk. Not a code problem — an owner decision.
- **Team logos** are hotlinked from `assets.nhle.com` (league marks), all through one function (`logoUrl` in `src/lib/teams.js`; nothing else references that host). The source matrix flags marks as unlicensed; returning `null` there switches every surface to monograms. Owner decision.
- **Player likeness.** 45 Wikimedia Commons portraits are shown with credits (copyright cleared: CC BY / BY-SA). 10 carry Commons personality-rights tags; publicity rights next to betting content are an owner decision. NHL.com headshots: PENDING OWNER DECISION, not used (`docs/IMAGE_SOURCES.md` §6).
- **propbet-news-api** (network news service) republishes AI-rewritten DailyFaceoff/ESPN bodies and generated betting advice at propbetedge.ai/news. NHL does not consume it. Network-wide exposure — owner should review.
- The Odds API key is shared across products (96,580 credits remaining after 3 spent in verification).
- Source checks were run from a residential IP, not from a Worker; Worker-egress behaviour (e.g. ESPN User-Agent gating) is unverified.

## Product decisions from the MLB review (2026-09-11)

MLB (`propbetedge-v2`) is the product-depth reference; its architecture shortcuts are not copied.

| MLB pattern | NHL decision | Status |
|---|---|---|
| PBEcast command center, pick strip, attention cues | PBE Cast is the flagship; multi-game view + pick-aware cues once picks exist | Single-game Cast + Replay built; command center next |
| Replay (accumulator state, backward-step corruption, today's picks on old dates) | Replay derived purely from event index; deep links; jump to goal/penalty/PP/period | **Built** |
| Track Record (profit-first, break-even, verdict tiers, unpriced exclusion; no CLV, mutable table, browser-triggered grading) | Same honesty, plus CLV, immutable locked predictions (DB trigger), append-only grades, server-side grading | Page frame built; ledger empty (0 predictions — verified) |
| Cancel alerts + HR watcher (two seen-lists, no persistence, no hidden-tab handling) | One alert bus, one seen-set, prime-on-load, persisted 36 h, visibility-aware watcher | **Built** |
| Best Line devig (≥2 books; "¢" edge math wrong across ±100; single global cache age) | ≥2-book two-sided devig consensus, edge in probability/EV terms, per-book quote age, market vs model separated | Blocked on odds ingest (B6) |
| Injuries (transactions-derived, no alerts) | Status table blocked by licensing; injury/transaction headlines + alerts for breaking material items | Headlines + alerts built |
| Forum | Not built. Community lives in Discord. | — |
| Shortcuts not copied | browser→provider calls, anon keys + Slack webhook in browser, client-side admin grading, K-line default 6.5, fake ticker headlines, heuristic "WP", fixed fielder positions | Enforced by proxy allowlist + `tests/frontend-checks.mjs` |

## Architecture decisions

- Browser → Cloudflare `nhl-gateway` (`https://nhl-api.propbetedge.ai`; allowlisted routes/params, product-origin CORS, scoped `NHL_GATEWAY_SECRET` attached inside Cloudflare) → `propsports-api` via service binding (`nhl-intelligence/src/entry.js`) → api-web.nhle.com / forge / Yahoo RSS. Vercel serves static files only; the `/api/nhl`, `/api/env`, `/api/odds` relays were removed 2026-09-11 (GitHub issue #3). No provider or PropSports credential in browser code or Vercel env.
- Every payload carries `schema, source_urls, fetched_at, ttl_s, stale_after_s`. The frontend derives CURRENT / CACHED / STALE / UNAVAILABLE / ERROR and keeps ageing labels on a 1 s ticker so a failed refresh can never leave data labelled LIVE.
- Newsroom headlines are dashboard-secret-only (paid API keys get 403): third-party headline terms do not allow re-serving through the sellable API.
- Production scheduling stays on Cloudflare cron. GitHub Actions run tests only.
