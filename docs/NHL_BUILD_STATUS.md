## 2026-09-25 — NHL Pro sale audit + player fight-record consistency

**NHL Pro sale.** No launch-date, preseason or "coming soon" gate exists in the gateway (`requirePro()` = session + billing
ledger only) or billing (`purchase_activation: external_gate`). The only purchase gate was the frontend `OPEN_FOR_PURCHASE`.
- All Access checkout (`buy.stripe.com/8x2eVd…A0N`) renders a live $29/month Stripe checkout; billing v1.5.0 grants `nhl_pro`
  to every active `pbe_all_access` member. → NHL Pro is purchasable and usable today via All Access.
- Both NHL-only Payment Links (`14AbJ1…A0B` $9.99/mo, `6oUfZh…A0C` $3.99/wk) render Stripe's inactive message **"NHL Pro Founding
  Season checkout is not open yet."** (headless render 2026-09-25). No Stripe API key is available locally, so they were not
  re-activated. `OPEN_FOR_PURCHASE` stays `false`; the NHL-only CTA now reads "NHL-only checkout paused · All Access above
  includes NHL Pro". Re-activate the two links in Stripe → set `OPEN_FOR_PURCHASE = true` (one line; tests pin it).
- Entitlement path behind the NHL links: PROVEN by the 2026-09-15 production canary (monthly + weekly grant `nhl_pro`, forged /
  wrong-price / cancelled / expired refused; session cookie, logout, CSRF). A fresh synthetic-webhook canary was not run
  (tool permission denied for forging signed webhooks into production billing).
- Owner: `justin@proptechusa.ai` → `nhl_pro` + `pbe_all_access` entitled, `access_source: owner` (read-only billing read).
- Copy: season chip "NHL Pro is live · Opening night in Nd"; Pro sheet eyebrow "… · LIVE NOW"; Props coverage footer no longer
  says the board cannot "go live". No other "coming soon"/launch-lock copy exists in `src/`.

**Fight record.** Root cause: the player page ran a second, client-side fight derivation hard-wired to `currentSeasonId()`
(2026-27) for BOTH the stat strip and the "Fan-voted fight record" panel, while the stat strip's stats and the PBE intelligence
card used 2025-26. Now all three read one normalization (`src/lib/fight-record.js`) of `/nhl/intel/fights/player/:id`; the stat
strip uses the stat line's season, Fight History has tabs [2026-27] [2025-26] [Career] and opens on the stat line's season;
preseason fights are listed but not counted (as on the server). Winner orientation: player_id first, name only picks which
fighter won; a name matching both/neither decides nothing (client + `nhl-metrics@17ffba8`, deployed `f29b7f53`, rollback
`7d7bf1d1`). Production audit of all 309 2025-26 fights: 0 mismatches, 0 ambiguous, 0 records changed by the deploy.

## 2026-09-25 — NHL Intelligence Program — RESULTS

| Phase | Status | Evidence |
|---|---|---|
| 1 `nhl-metrics` Worker | PROVEN (production) | `propsports-api-worker@8da8950`; `GET nhl-api.propbetedge.ai/nhl/intel/health` → ok, league/WinHL/fights snapshots captured 2026-09-25 |
| 2 Gateway 1.2.0 intel routes | PROVEN (production) | `propsports-api-worker@34309ba`; `/nhl/intel/winhl?pos=F` and `/nhl/intel/slate` return tier `free` payloads |
| 3 Frontend (Goalie Center 2.0, `#/fatigue`, `#/winhl`, `#/fights`, `#/teams`, Props market upgrade, Game Intelligence in Matchup/Cast/Player, nav IA, Methodology) | PROVEN (production) | `7822b91`; Vercel status success; nhl.propbetedge.ai serves the tested bundle `index-DSZbg4AH.js`; production QA below |
| 4 Shadow saves model | IN PROGRESS (backend session) | release criteria frozen `1dc2a40`; v1 fit misses frozen tail-calibration thresholds on validation; test split NOT evaluated |
| 5 Release gates | see Phase 3 gates | |

Phase 3 gates (run 2026-09-25, recovered after a PC hard restart at ~17:31Z; nothing had been committed or pushed before it):
- `npm test` — 113 pass / 0 fail. `npm run build` — PASS.
- `tests/e2e/intel-qa.mjs` — 11/11 at each of 1440/1280/1024/768/430/390/360/320 (free tier, zero relay incidents); mocked-Pro presentation PASS at 1440/390.
- Score ticker 52/52; headshot canary 15/15.
- `chrome-destinations.mjs` — 253 ok; 9 failures, all **identical on clean production `146ca20`** (baseline run in a detached worktree): Shot Lab bare-landing / completed-game checks and replay tiles (preseason: no completed game on today's slate), and the three NHL Pro auth-button checks (localhost origin is not an allowed auth origin). Expectations updated for the new IA (desktop nav `…|Props|WinHL`, bottom nav `+All Access`, 13-item More menu, 18-item sheet).
- `pbe-picks-qa.mjs` — 15 failures, **identical on clean `146ca20`**: `/auth/session` CORS from localhost (12) and Track Record "invented percentage" heuristic flagging real ledger percentages (3). Pre-existing; not a regression. UNVERIFIED on the production origin until post-deploy QA.
- **Production QA (https://nhl.propbetedge.ai, after deploy):** intel QA 44/44 (1440/768/390/320, zero relay incidents); PBE Picks gate 0 failures after two harness fixes (relay now echoes the page origin with credentials, as the real gateway does — the `/auth/session` CORS failures were the harness's `*` header, the gateway itself returns the correct origin; the Track Record percentage check is scoped out of Track Record, whose 65.1% = 28/43 graded preseason ledger); chrome/destinations 253 ok with the same 9 pre-existing failures.
- **Still degraded / UNVERIFIED:** (a) Shot Lab bare landing + replay tiles fail until a completed game is on the slate (preseason state; re-check after first completed game); (b) the three chrome-gate NHL Pro auth-button checks fail on production `146ca20` and on this build alike; not investigated in this program; (c) real signed-in Pro session never exercised (mocked Pro only); (d) player-prop board has 0 real prop rows until books post NHL player markets.
- Public-repo guard: the Pro-tier test fixture is now SYNTHETIC (`scripts/redact-intel-fixture.mjs`); the real Pro payload stays in gitignored `tests/fixtures/local/`.

## 2026-09-25 — NHL Intelligence Program (Goalie 2.0 · Fatigue · WinHL · Props · Fight Score · Game Intel) — PLAN (Phase 0 audit)

Status words as below: PROVEN / IN PROGRESS / BLOCKED / UNVERIFIED. This section is the plan written **before** implementation; the
results section above it is updated as each phase passes its gates.

### Audit — what exists today (verified 2026-09-25)

| Layer | Fact |
|---|---|
| Frontend | `main` 1ad59cb (Vite, hash router `src/lib/router.js`, 18 routes). Goalie Center = starter ladder CONFIRMED/PROJECTED/UNKNOWN + club season lines + last-5 appearances + days rest/B2B from `/nhl/game/:id/goalies`. Props = stored Odds API snapshot (best line, no-vig consensus, moves) and an explicit "no released player-prop model". Fights = `src/lib/fights.js` (server ledger first, client derivation fallback, fan-vote only, never official). |
| Gateway | `nhl-gateway` 1.1.0 (custom domain nhl-api.propbetedge.ai): strict route/param allowlist, product-origin CORS, edge cache + stale-if-error, `/pro/*` gated by `requirePro()` (session + billing ledger, All Access aware). Service bindings: PROPSPORTS, NHL_ODDS, BILLING. |
| Backend | `propsports-api` (shared with MLB/NFL) serves `/v1/nhl/*` from `nhl-intelligence/src/nhl-data.js` straight from api-web.nhle.com + api.nhle.com/stats (no NHL persistence on the read path). Daily 11:00Z archive writes `nhl_games`, `nhl_shot_events`, `nhl_line_snapshots` (rlfy). `nhl-odds` (3x/day KV snapshot; player markets requested per event: SOG, saves, points, goals, assists). `nhl-picks` (v1.1 shadow + v1.2 runner, tkmln ledger). |
| Odds today | 33 events in the 12:00Z snapshot, **0 player-prop rows** (preseason; books have not posted NHL player markets). |
| History on disk | `D:\Workers\_data\nhl-archive` 5.1 GB: raw play-by-play + boxscore (gz, sha256 manifest) 2010-11 → 2025-26 (no 2020-21 / 2021-22 folders). |

### Source audit — what the official feeds really carry

| Need | Source (probed 2026-09-25) | Verdict |
|---|---|---|
| Per-player per-game TOI split: EV / PP / SH / **OT** TOI, shifts | `api.nhle.com/stats/rest/en/skater/timeonice?isGame=true` (one call returned 9,216 rows with `limit=-1`) | SUPPORTED |
| Goals, A1/A2 (`totalPrimaryAssists`), shots, attempts, hits, blocks, takeaways, giveaways | `skater/summary`, `skater/scoringpergame`, `skater/realtime` | SUPPORTED |
| Penalties drawn / taken | `skater/penalties` | SUPPORTED |
| On-ice 5v5 shot-attempt share (NHL "SAT", relative) | `skater/scoringRates` / `skater/percentages` | SUPPORTED (NHL's own stat; labelled as such, never called xG or possession value) |
| Faceoffs W/L | `skater/faceoffwins` | SUPPORTED |
| Goalie per-game SA / saves / TOI / GS | `goalie/summary?isGame=true`, player game logs | SUPPORTED |
| Goalie **high-danger / location** save % with league average + percentile | NHL Edge `edge/goalie-detail` (`shotLocationSummary`: all/high/mid/long) | SUPPORTED (official NHL Edge values shown as-is; not our computation) |
| Team per-game shots for/against, PP% / PK% | `team/summary?isGame=true`, `team/realtime` | SUPPORTED |
| Schedule home/road, venue, **venue timezone**, OT/SO outcome | `club-schedule-season/{team}/{season}` | SUPPORTED |
| Travel miles | No coordinates in any NHL feed | NOT SUPPORTED today → timezone shift + home/road transitions only; miles need a verified venue coordinate table |
| Pregame lines / PP units | none licensed | NOT SUPPORTED (derived last-game deployment only) |
| xG / GSAx / RAPM / WAR | none validated | NOT BUILT — never displayed |
| Fight winner | NHL never declares one; HockeyFights fan vote (10-20 fights/page, `/fightlog/1/reg{YYYY}/{page}`) | FAN VOTE ONLY, labelled non-official |
| Historical prop prices | none stored before 2026-09-11; 0 NHL player-prop rows so far | market-benchmark backtest NOT possible yet |

Rights: every official-data feature depends on the NHL.com ToS risk already recorded in `docs/NHL_SOURCE_MATRIX.md` §0 (owner decision
outstanding). HockeyFights enrichment already runs in production (Cast); the season ledger reads the same public fight-log pages at
most once per day.

### Feasibility per requested feature

| Feature | Buildable today from authoritative data? | Needs |
|---|---|---|
| Goalie Intelligence 2.0 (starts/apps/SA/TOI 7-14d, rest, B2B, consecutive starts, rolling SV%, season vs recent, opponent shot environment, Edge HD splits) | **YES** | new Worker aggregation (per game, cached) |
| PBE Goalie Form Score v1 | **YES** | deterministic lib + tests |
| Team fatigue (games in 3/4/6/7 days, B2B, 3-in-4, 4-in-6, road streak, transitions, prior-game OT, top-4 D TOI load, goalie workload, PP/PK minutes) | **YES** | Worker aggregation from schedules + per-game TOI |
| Player fatigue (TOI last 3/5/7 vs season, PP/PK/OT TOI, consecutive games, trend) | **YES** | same |
| Travel distance | **NO** (timezone shift YES) | verified venue coordinates |
| WinHL v1 (season / last 10 / last 5 / trend / ranks / components / min-sample flags) | **YES** | Worker cron + KV daily snapshots (rank history) |
| Props market board (SOG, saves, points, goals, assists; best line, consensus, movement, books quoting, freshness) | **YES** (renders real rows as soon as books post) | frontend upgrade on existing `/odds` |
| Prop model (SOG, saves) | **SHADOW only** | offline backtest + held-out calibration, pregame lock, grader, then an independent forward record — which cannot exist before real games are graded |
| Fight ledger / fighter history / team fight activity / Fight Score | **YES** (NHL penalties + fan votes) | season ledger job + KV |
| Post-fight momentum (shots, attempts, goals, penalties in fixed windows) | **YES** (play-by-play) | computed in the ledger job; labelled descriptive, not causal |
| Game Intelligence summary | **YES** for goalie matchup / fatigue edge / roster WinHL / shot environment / special teams / props / fights; team model probability only if a released model exists (none today) | aggregation endpoint |

### Architecture decision

- **New isolated Worker `nhl-metrics`** (`LHBUSA/propsports-api-worker/nhl-metrics/`), reached ONLY by `nhl-gateway` through a service
  binding with a bearer token. It does **not** modify `propsports-api`, so MLB/NFL cannot regress. Pure, unit-tested libraries compute
  every score; the Worker only fetches official feeds, calls the libs, and stores results.
- **Storage: Cloudflare KV** (new namespace) for current snapshots + one daily snapshot per metric (rank history, `captured_at`,
  `source_urls`). No Supabase migration is required for this program. If a durable SQL history is wanted later, the KV rows map 1:1.
- **Cron in Cloudflare** (never GitHub Actions): league snapshot (WinHL, player TOI windows) + fight ledger + shadow prop lock/grade.
- **Free vs Pro**: the Worker serializes each payload per tier in ONE function; free gets starter truth, fatigue schedule flags, the
  top of the WinHL table and the fight ledger; the scores, components, full WinHL table, player fatigue and Game Intelligence detail are
  served only on `/pro/intel/*`, which the gateway gates with the existing `requirePro()` before the Worker is called.
- Every endpoint: `schema`, `version`, `source_urls`, `captured_at`, `ttl_s`, `stale_after_s`, `partial` / `unavailable` reasons; the
  gateway adds `X-NHL-Semantics`.

### Phase plan (each phase: tests → Worker deploy (rollback id recorded) → gateway deploy (rollback id recorded) → frontend push → prod QA)

1. `nhl-metrics` Worker + libs: goalie form, fatigue (team/player), WinHL, fight ledger/score/momentum, game intel, SOG/saves shadow models.
2. Gateway 1.2.0: `/nhl/intel/*` (free) + `/pro/intel/*` (Pro) routes, `NHL_METRICS` binding, regression tests.
3. Frontend: Goalie Center 2.0, `#/fatigue`, `#/winhl`, `#/fights`, Props market upgrade + model validation status, Game Intelligence in Matchup / Cast pregame / Ice Board, nav IA (LIVE · PREDICTION · INTELLIGENCE · RESEARCH), Methodology formulas.
4. Shadow prop model: backtest on the archive (train ≤ 2024-25, hold out 2025-26), calibration report, pregame lock + grader in the Worker. Status stays **SHADOW** until a forward record exists.
5. Release gates: `npm test`, `npm run build`, existing E2E (ticker, live acceptance, picks, chrome/destinations, headshots) + new feature canaries, 8 widths, console/CSP, signed-out vs Pro.

## 2026-09-21 — Newsroom V3: real PropBetEdge editorial media — PRODUCTION

- **Frontend commit:** `81a5cfd863d2c4420f2dd1ab63502b509904e99c` — `Bring real PBE media into NHL newsroom`.
- **Shared media resolver:** `LHBUSA/propbetedge-news-site@f86ae9c25b94b6db58ef217cdcd3b142f4e8eef8` exposes the existing read-only `/api/sports-media` resolver cross-origin for dedicated PBE products.
- **Editorial boundary preserved:** raw source-wire rows still fail `isPbeAnalysis()`; only authored PBE articles can consume editorial summary, `image_url`, official YouTube metadata, or contextual media recovery.
- **Visual hierarchy:** dominant photo-led lead story, photographed three-story rail, photo-led archive shelf, responsive desktop/tablet/mobile treatment. Team/PBE marks are fallback art only.
- **Player-photo recovery:** when an authored story has no usable story image, the newsroom resolves named players before teams through the shared PBE sports-media resolver and routes the image through the existing PBE image proxy.
- **Video:** authored stories carrying official YouTube metadata receive WATCH treatment in cards/hero plus a dedicated video row linking into the full PropBetEdge article experience.
- **Editorial copy:** authored PBE summaries now supply real story decks instead of the generic placeholder explainer.
- **Production receipt:** Vercel deployment `dpl_7QhTnNwYzEQ8QUsprdsBoqvCY65x` is `READY` / production and GitHub status context `Vercel` is success for `81a5cfd`.
- **Resolver production canary:** `GET https://propbetedge.ai/api/sports-media?sport=nhl&kind=player&name=Connor%20McDavid` returned HTTP 200 with an NHL player headshot and `Access-Control-Allow-Origin: *`.
- **Validation before push:** browser-module syntax check PASS; rich-media-after-authored-discriminator contract PASS; Vercel production build PASS. Full local `npm test` was not available through the connector runtime, so do not represent the entire Node test suite as executed by this receipt.

# NHL PropBetEdge — build status

Release line: **`main` is production** (Vercel deploys `main`; the Cloudflare `nhl-gateway` serves the browser). `nhl-ufc2-production` was merged and is an ancestor of `main`. Last updated 2026-09-12. Current work branch: `nhl-live-scores-photos-v1` (live scores + player photos), not merged.

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


## Live scores + player photos pass — branch `nhl-live-scores-photos-v1` (2026-09-12)

Two goals only: make player photos actually work in production, and add an NHL-only real-time score rail. `main` untouched; nothing promoted.

### Player photos — what the production chain actually does

The chain was audited live before any code changed. **The image proxy was not broken and the constructed URL shape was not wrong.**

| Layer | Result | Evidence |
|---|---|---|
| A · `api-web.nhle.com/v1/player/{id}/landing` | **PROVEN** 15/15 — `playerId`, `currentTeamAbbrev` and an `assets.nhle.com` `headshot` on every one | `scripts/headshot-canary.mjs`, 2026-09-12 |
| B · the exact headshot URL the NHL payload returned, fetched direct | **PROVEN** 15/15 — HTTP 200, `image/png`, 119–210 KB, decoded 336×336 | same run |
| C · the SAME url through the **deployed** `propbet-img-proxy.sales-fd3.workers.dev` | **PROVEN** 15/15 — HTTP 200, `image/png`, byte-identical to direct, `cache-control: public, max-age=86400, s-maxage=604800`, `access-control-allow-origin: *`, `x-proxy-source: assets.nhle.com`, upstream 30x resolved by the proxy (no redirect surfaced to the caller), query URL correctly percent-encoded | same run |
| D · the URL the frontend *constructs* from `{id, team}` | **PROVEN** 15/15 — 200, and identical to the payload headshot for every player | same run |

15 real players, skaters and goalies, 12 clubs: McDavid (EDM), Draisaitl (EDM), Matthews (TOR), MacKinnon (COL), Makar (COL, D), Barkov (FLA), Vasilevskiy (TBL, G), Kucherov (TBL), Eichel (VGK), Hill (VGK, G), Crosby (PIT), Gustavsson (MIN, G), Heiskanen (DAL, D), Shesterkin (NYR, G), Ovechkin (WSH).

**Root cause: frontend wiring, plus two proxy failure semantics the frontend could not see.**

1. `playerIdentity()` already accepted a `headshot` option. **No call site passed it.** Both the player-profile payload (`player.headshot`) and the club-roster payload (`players[].headshot`) carry the league's own URL; the app discarded both and rebuilt a URL from the club abbreviation. Now wired at `src/pages/player.js` and `src/pages/team.js`.
2. `src/pages/matchup.js` (`scorersPanel`) passed **no club at all**, so no URL could be built and every top-skater avatar fell back to initials. Measured against production `main`: `#/matchup/2025021311` had 12 player-linked slots, **8 with no image**. After the fix: 14 slots, 14 images, 0 lost.
3. The shared image proxy **never signals failure with a status code**. An unreachable upstream returns **HTTP 200 + a 37-byte 1×1 transparent GIF**; a missing NHL mug (`assets.nhle.com` answers 302) returns **HTTP 200 + the league's own `default-skater.png`, 11,875 bytes, 336×336**. Because both are valid 200 images the component's `onerror` chain could never fire, and `is-loaded` then hid the branded fallback — so a proxy failure left an **empty frame**. `src/components/player.js` now treats a decoded 1×1 as a miss and restores the branded initials (`.pid__frame.is-failed`).

Also in this pass: the hero identity loads `eager` + `fetchpriority="high"` (it was lazy); non-critical avatars stay lazy; photo misses are counted at `window.__pbePid.misses` and log to the console in development only.

Not fixed, deliberately: a Newsroom player chip on an item that names **no single club** still renders branded initials (1 slot of 25 observed). The news payload gives `{id, name}` with no team, there is no team-less NHL mug URL (`assets.nhle.com/mugs/nhl/{season}/{id}.png` → 302), and guessing a club would now render the league silhouette — worse than initials. Resolving it per avatar would mean an API call per rendered avatar, which the brief forbids.

### Live acceptance — this build, real gateway, real image proxy

`node tests/e2e/live-acceptance.mjs` serves the built app locally and relays the production gateway Node-side (the gateway enforces product-origin CORS, so a localhost build cannot call it from the browser). **Images are not intercepted** — they go to the deployed proxy exactly as in production. 15 routes × 1440 / 390 = 30 page loads:

| Check | Result |
|---|---|
| Checks passed | **330 / 330** |
| Identity slots · avatar images | 508 · 478 |
| Avatar images that loaded | **478 / 478** |
| NHL asset-feed headshots among them | 416 |
| Broken images | **0** |
| Empty identity frames | **0** |
| Runtime photo misses (`window.__pbePid.misses`) | **0** |
| Non-200 image responses | **0** |
| Console / page errors | **0** |
| Horizontal overflow (1440 and 390) | **0 px** |
| NHL mugs `object-fit` | `contain` everywhere — no face crop; frames square to ±0.02 |
| Gateway calls outside `/nhl/*`, `/readiness`, `/odds` | **0** |

Per-surface avatar images loaded (1440): team EDM 61/61, goalies 48/48, lines 36/36, players 25/25, injuries 20/20, news 24/24, matchup 14/14, cast 9/9, player hero 2/2.

Screenshots committed to `docs/qa/live-scores-photos-v1/` (17 WebP, indexed in `docs/NHL_UI_VERIFICATION.md`); raw PNGs land in the gitignored `artifacts/live-acceptance/`: `home-1440.png`, `home-390.png`, `player-mcdavid-1440.png`, `team-edm-1440.png`, `players-1440.png`, `matchup-1440.png`, plus `home-real-slate-{1440,390}.png` and `rail-real-slate-{1440,390}.png` (rail photographed against the real 2026-04-13 slate pulled live from the gateway, because 2026-09-12 is the offseason and has no games).

### NHL score rail

`src/components/score-ticker.js` + `src/styles/score-ticker.css`, mounted once from the shell (`#score-ticker-slot`, directly below the top navigation and above the backdrop, the mode ribbon and page content).

- **Data path:** `ctx.board()` → `https://nhl-api.propbetedge.ai/nhl/board` → propsports-api → NHL. It shares the app's board cache and request de-duplication and opens no client of its own (`tests/score-ticker.test.mjs` asserts there is no `fetch(` in it). NHL only: no other sport is referenced or requested.
- **Game state** comes from the shared `stateOf()` normalizer, so LIVE / INTERMISSION / FINAL (+ `/OT`, `/SO` from `last_period_type`) / SCHEDULED / PREGAME / POSTPONED are the backend's semantics, never guessed strings. The clock shown is only ever the source clock; nothing is interpolated locally.
- **Cadence:** 10 s with a live game, 60 s with a slate but none live, 300 s with no games; paused while the tab is hidden, through the existing `createPoller`.
- **Stale:** a gateway `X-NHL-Semantics: STALE`, or a failed refresh, keeps the last-known scores, labels the rail "Scores delayed · <age>", and turns every live chip into `LIVE · DELAYED` with the pulse stopped. The rail is never blanked, and a live badge never stays bare over stale data.
- **No games:** "No NHL games today" plus the board's own verified `next_puck_drop` (date, ET time, first matchup, `+N more`). Nothing invented.
- **Scrolling:** desktop marquee only when content overflows, on pointer-fine viewports ≥ 900 px — one clone, not hundreds of nodes; `translateX(0 → -50%)` so the loop never resets visibly; paused on hover/focus; re-rendered only when a content signature changes, so a 10 s refresh cannot jerk it back. Mobile gets native horizontal scrolling instead. `prefers-reduced-motion` removes the clone and the animation and keeps manual scrolling.
- **Accessibility:** `aria-live="off"` (scores are not re-announced every 10 s), each game is a labelled link to `#/cast/{gameId}`, the clone is `aria-hidden` with no tab stops, the viewport is keyboard-focusable, rail height 44 px, nothing below the 10 px type floor.

State matrix — `node tests/e2e/score-ticker.e2e.mjs`, **52 / 52 PASS** at 1440 and 390:
LIVE · INTERMISSION · FINAL · FINAL/OT · FINAL/SO · SCHEDULED · ordering (live first, finals last) · gateway STALE · refresh failure after a good load · no games today · board 503 · reduced motion · mobile manual swipe · NHL-only content and network · 0 overflow · 0 broken images · 0 console errors.
Fixtures use the gateway's real payload shape; the OT/SO finals are real results (2026-04-13: DET 3 @ TBL 4 OT, CAR 2 @ PHI 3 SO, COL 2 @ EDM 1 SO) and the empty state is the real 2026-09-12 offseason payload.

### Layout

`--nhl-ticker-h: 44px` and `--nhl-chrome-h = topbar + ticker` are now tokens. `#main`'s reserved height and the Ice Board hero's negative pull both use `--nhl-chrome-h`, so the hero art still runs up under the fixed chrome and the rail's height is reserved from first paint (no layout shift).

### Test results at `nhl-live-scores-photos-v1`

| Gate | Result |
|---|---|
| `npm test` (frontend checks, product depth, score ticker, identity, alerts, pricing) | **PASS** |
| `npm run build` | **PASS** — `index` 92.68 kB / 30.46 kB gz, CSS 157.11 kB / 28.72 kB gz |
| `node scripts/headshot-canary.mjs` (live NHL API + live proxy, nothing mocked) | **PASS 15/15** |
| `node tests/e2e/score-ticker.e2e.mjs` | **PASS 52/52** |
| `node tests/e2e/product-depth-browser.mjs` (existing gate) | **PASS** at 1440 and 390 |
| `node tests/e2e/live-acceptance.mjs` (this build vs real gateway + real proxy) | **PASS 330/330** |
| Horizontal overflow, 15 routes × 1440 / 1024 / 390 / 360 | **0 px** |

The backend (`propsports-api-worker`) was **not changed**, so no MLB/NFL regression is in scope for this pass. Both payloads the photo fix consumes (`/nhl/player/:id`, `/nhl/team/:abbr/roster`) already returned `headshot`.

### Still open after this pass

1. **The shared image proxy is an open image proxy.** `propbet-img-proxy.sales-fd3.workers.dev` proxied `https://www.google.com/favicon.ico` and an arbitrary Wikimedia URL on request (measured 2026-09-12). There is no host allowlist, and it answers every failure with 200. The master brief §20 says "Never make an open arbitrary-URL proxy." It is a shared network Worker outside this repo and was not changed here. **Owner decision plus a separate change on that Worker.**
2. A missing NHL mug silently becomes the league's `default-skater.png` (a grey silhouette) rather than the branded PBE treatment, because the proxy resolves the 302 and returns 200. With the authoritative payload URL now wired this can only happen where the **league itself** has no photo. Distinguishing it in the browser would cost a canvas fingerprint per avatar; instead the canary asserts server-side that no tested player resolves to the silhouette.
3. Newsroom player chips on multi-club items stay as branded initials (above).
4. `tests/e2e/replay.e2e.mjs` cannot run against a localhost build: the gateway's product-origin CORS rejects `127.0.0.1`. Pre-existing, not a regression from this branch, and not part of CI. `tests/e2e/live-acceptance.mjs` shows the Node-side relay pattern that would fix it if it is ever wanted in CI.
5. The live rail has **not** been seen against a genuinely in-progress NHL game. The 2026-27 preseason opens 2026-09-19; today is the offseason and `/nhl/board` returns 0 games. LIVE and INTERMISSION are proven against the gateway's real payload shape with the status block set to those states, not against a game actually being played.

## Atmosphere pass — `nhl-atmosphere-v1` (2026-09-12)

Perceived-depth pass, not a redesign. Nav, footer, ticker, player photos, routing, search, alerts and mobile nav are untouched.

**The problem, measured.** The route backdrop was a band `clamp(380px, 64vh, 660px)` tall pinned to the top of the page. Below it the page was `body { background: var(--pbe-ink) }` — literally one flat `#14110d` slab. Sampling the live production Ice Board at scroll 1100 gave `rgb(20,17,13)` at every point outside a panel: the left gutter, the gap between panels and the bottom of the viewport were the same single colour.

**The system now has four layers**, all behind content, all `pointer-events: none`:

| z | Layer | What it is | Cost |
|---|---|---|---|
| −3 | `.atmos` | opaque graded field + arena light pools + two light beams + vignette + a 120×120 inline grain tile | 0 requests |
| −2 | `.backdrop-floor` | the route's own plate, fixed to the bottom of the viewport, masked upward, screen-blended | 0 requests on every route with a band |
| 0 | `.backdrop-wrap` | the existing top band, now taller with a falloff that resolves to transparent instead of to flat ink | unchanged |
| 1 | `#main` | content | — |

`body` had to become `background: transparent` (html keeps `--pbe-ink` as the canvas fallback): an in-flow block background paints *above* negative z-index layers, so an opaque body hid the entire field. That one line was why the first attempt rendered no different from production.

**Screen blend is what makes the floor read.** The plates are dark, so at a plain 15% opacity they were invisible. `mix-blend-mode: screen` keeps only what is *lit* in the frame — ice, rig, haze — and can never lay a dark smear across a data surface. Per-route strength is set in `src/lib/backdrops.js`: showcase surfaces carry more (Cast .30, Matchups .28, News/Players .26), dense data surfaces stay quiet (Standings .13, Props .16, Injuries .17).

**Dense data keeps its own ground.** The standings sticky rank/team columns paint an opaque `--pbe-ink` of their own; with the field showing through the rest of the table they seamed against it visibly. `.table-wrap`, `.rs-st-wrap` and `.rs-st` now carry `background: var(--pbe-ink)`, so atmosphere lives *around* the data, not under it.

### Measured results

| Check | Result |
|---|---|
| Frames captured | 60 (15 routes × 1440 / 390, at top and mid-scroll) |
| Horizontal overflow | **0 px** on every frame, both widths |
| Console / page errors | **0** |
| Broken or 4xx assets (avif/webp/png/svg/css/js) | **0** |
| Text contrast, measured from the rendered pixels | **268 / 268 boxes ≥ 5.52:1**; min `.micro` 5.52, `.pbe-table td` 6.39, `h1` 15.54. **0 below 4.5:1** |
| Flat-slab check, Ice Board at scroll 1100 | was `rgb(20,17,13)` at every sampled point; now 4 distinct values across gutter, panel gap and floor |

Contrast is measured, not asserted: each frame is screenshotted, the dark half of every text element's box is sampled for its true rendered background, and that is compared with the element's computed colour. The pass **raised** the two faintest label roles (`--pbe-faint` `#8a867d → #9b968c`, `--pbe-faint-text` `#8e8a80 → #9c978d`) because the lifted field cost them about 0.8 of contrast; every role now clears WCAG AA with margin, and `.pbe-table td` improved from 5.19:1 to 6.39:1.

### Performance

No new image asset was added to the repository. The whole field is gradients plus one inline noise tile.

| Route | Production (`main`) | This branch |
|---|---|---|
| PBE Cast — image bytes / backdrop files | 371 KB / 1 (`cast-2000.avif`) | **371 KB / 1 — byte-identical** |
| Ice Board — image bytes / backdrop files | 155 KB / 0 | 162 KB / 1 (`standings-800.avif`) |
| CSS | 176 KB | 179 KB |

The floor re-uses the exact URL the band already requested, so on every route that has a band it is free. The Ice Board is the one route that gains a file — it has a hero instead of a band — and that plate is deliberately the **800 px** variant (the floor is masked, screened and under .3 opacity, so it does not need 2000 px) and is requested from `requestIdleCallback` so it never competes with the hero for bandwidth. Net: **+7 KB, off the critical path, on one route.**

### Imagery

**No new photography was sourced.** The nine existing Pexels-licensed plates (`docs/image-sources/backdrops.md`) already are the art direction — ice-level, cold, cinematic, no league marks, no identifiable faces — and the brief asked for depth without competing background images. Re-using them harder was cheaper, kept the licensing surface unchanged, and avoided a second set of images fighting the first. The one change worth recording: **the Ice Board now carries the `standings` plate** (Pexels 6468744, Tony Schnagl — defocused stands, light through haze) as its floor layer, so the long scroll below the hero has arena presence. Same file, same licence, no new asset.

### Screenshots

`docs/qa/atmosphere-v1/` — 17 WebP: `home-top-1440`, `home-mid-1440`, `home-deep-1440`, `home-top-390`, `home-mid-390`, `cast-1440`, `cast-390`, `props-1440`, `team-1440`, `player-1440`, `player-390`, `standings-1440`, `news-1440`, `goalies-1440`, `lines-1440`, `matchup-1440`, `shotlab-1440`.

### Regressions re-run at this branch

`npm test` PASS · score-ticker state matrix **52/52** · product-depth browser gate PASS at 1440 and 390 · live acceptance against the real gateway and the real image proxy **330/330**, 478/478 avatar images decoded, 0 broken, 0 empty frames.

## PBE Picks flagship surface + live Track Record (2026-09-18)

New route `#/pbe-picks` (`src/pages/pbe-picks.js`, lazy chunk 21.3 KB / 7.6 KB gz) and a rewritten
`src/pages/track.js` that reads the picks ledger instead of stating a dated fact. Both consume
`nhl-picks-read-v1` through `src/lib/api.js` (`picksHealth` / `picksSlate` / `picksTrackRecord` /
`picksLedger`, `credentials: 'omit'`). Navigation: desktop **Ice Board · PBE Picks · PBE Cast · Props ·
Shot Lab**, mobile bottom **Board · PBE Picks · Cast · Props · More** (News moved into More).

| Item | Status | Evidence |
|---|---|---|
| Picks read API carries the routes | **PROVEN** | The gateway answered 400 `Unsupported path` at 11:35Z and 200 `nhl-picks-read-v1` at 12:00Z on 2026-09-18. Both paths are handled and both were exercised by the browser QA. |
| Nothing is published as a pick | **PROVEN** | `model_status` = `pbe-nhl-model-v1.1` / `shadow_candidate` / `publishable:false`, `publish_gate` = `{open:false, reason:"no_official_model"}`. All 7 games on 2026-09-19 render `prediction_state: NONE`, 0 pick badges, 0 percentages anywhere on the page (asserted in the browser). |
| Free session never touches Pro | **PROVEN** | 0 `/pro/*` requests across 12 route/width runs; `loadPicksData` unit-asserted for `signed_out`, `unknown`, `not_entitled`, `free`. |
| Official-pick render needs no redesign | **PROVEN** | `tests/pbe-picks.test.mjs` renders the same components from a Pro payload: pick team, both probabilities, model version + artifact + snapshot id, lock stamps, PRICED market with `captured_at`/age labelled "not a live price", goalie block labelled NOT A MODEL INPUT. |
| Track Record is a live read | **PROVEN** | `lifetime: null`, `models: []` ⇒ every metric renders `—` with "NO AGGREGATE RETURNED"; the empty state prints the API's own `detail` sentence and quotes its `reason` code `no_official_model`. |
| Browser QA | **PROVEN** | `node tests/e2e/pbe-picks-qa.mjs`: 12 route/width combinations (1440/390/360 × picks, picks-with-slate, track-record, home), **0 failing checks**, 0 console/page errors, 0 horizontal overflow. Screenshots in `artifacts/pbe-picks-qa/`. |
| 360px chrome overflow | **FIXED** | Pre-existing: brand + NHL Pro + bell + search were 10px wider than the gutter box on `#/` as well. Tightened in `shell.css` under 400px; `scrollWidth === clientWidth === 360` on all three routes. |

Contract items still to pin with the backend: ROI/CLV units are printed as the raw signed number the API
returns (no unit is assumed); `predictions.expected/created/rejected` are `null` today and render as em
dashes while `grading_backlog: 0` renders as `0`.

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
