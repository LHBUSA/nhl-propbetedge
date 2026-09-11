# NHL PropBetEdge — build status

Branches: frontend `nhl-ufc2-production` (LHBUSA/nhl-propbetedge) · backend `nhl-intelligence-v1` (LHBUSA/propsports-api-worker).
Nothing merged to `main`. Production NHL/PropSports Worker not deployed. Last updated 2026-09-11.

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
| A9 | NHL Supabase schema lives on project `rlfyavnhbngwbldebrid` (the SQL comment says PROPBETEDGE/`tkmlnhmylqnttmnsnief` — wrong). All 10 NHL tables had **0 rows**; the archive cron never ran. | High | History backfill running locally (see Models) |
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

## IN PROGRESS

- Desk pages: Goalies, Injuries, News, Lines, Props (lane finishing); then integrate derived deployment into Lines and the market snapshot into Props / Best Line.
- Live prop tracker (market line vs live stat + TOI pace) — needs posted player props (provider has none 18 days out).
- Final QA matrix 1440 / 1024 / 390 / 360 across every route; `docs/NHL_UI_VERIFICATION.md`.

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
| B9 | **Production frontend was promoted** from the dashboard to `98530a4` (not by this session). Production's API is still the legacy Worker, so nhl.propbetedge.ai runs in limited mode once a build ≥ `bf08a67` is promoted; `98530a4` itself shows raw 403 errors on the board. | Owner: promote `bf08a67`+ or roll back; long-term fix is B1 + backend promotion |
| B10 | Model-version INSERTs for xG/SOG candidates generated as SQL, not executed. | Owner approval |

## UNVERIFIED / OWNER DECISIONS

- **NHL.com Terms of Service** limit use to "non-commercial, informational, personal use" and bar automated collection (`docs/NHL_SOURCE_MATRIX.md` §0). Every official-data feature depends on accepting that risk. Not a code problem — an owner decision.
- **Team logos** are hotlinked from `assets.nhle.com` (league marks). The brief asks for logos; the source matrix flags marks as unlicensed. One switch (`logoUrl` in `src/lib/teams.js`) falls back to monograms. Player headshots are **not** used.
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

- Browser → Vercel `/api/nhl` (server-side secret, allowlisted) → PropSports Worker (`nhl-intelligence/src/entry.js`) → api-web.nhle.com / forge / Yahoo RSS. No provider or PropSports credential in browser code.
- Every payload carries `schema, source_urls, fetched_at, ttl_s, stale_after_s`. The frontend derives CURRENT / CACHED / STALE / UNAVAILABLE / ERROR and keeps ageing labels on a 1 s ticker so a failed refresh can never leave data labelled LIVE.
- Newsroom headlines are dashboard-secret-only (paid API keys get 403): third-party headline terms do not allow re-serving through the sellable API.
- Production scheduling stays on Cloudflare cron. GitHub Actions run tests only.
