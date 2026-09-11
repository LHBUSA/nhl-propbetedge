# NHL UI verification

Run: 2026-09-11 · frontend branch `nhl-ufc2-production` · Chromium (Playwright 1.55) · harness `tests/e2e/shoot.mjs`.

Stack under test (local, because the branch preview Worker deploy is blocked — see NHL_BUILD_STATUS B1):
Vite dev server → the real `api/nhl.js` / `api/odds.js` / `api/env.js` handlers → branch Worker (`wrangler dev --local`, `nhl-intelligence-v1`) → live api-web.nhle.com / forge / Yahoo RSS; odds from the real `nhl-odds` handler serving the snapshot of a real ingest (2026-09-11 12:13Z, 15 games, 10 books).

Checks per route × width: horizontal overflow (document scrollWidth − viewport), broken images (complete with naturalWidth 0), text under 10px, console errors / page errors.

## Result: 72 / 72 route×width combinations PASS

| Route | 1440px | 1024px | 390px | 360px |
|---|---|---|---|---|
| `#/` | PASS | PASS | PASS | PASS |
| `#/cast/2025020500` | PASS | PASS | PASS | PASS |
| `#/cast/2026020001` | PASS | PASS | PASS | PASS |
| `#/cast?view=all&date=2026-04-16` | PASS | PASS | PASS | PASS |
| `#/props` | PASS | PASS | PASS | PASS |
| `#/goalies` | PASS | PASS | PASS | PASS |
| `#/goalies/2025020500` | PASS | PASS | PASS | PASS |
| `#/lines?team=MTL` | PASS | PASS | PASS | PASS |
| `#/injuries` | PASS | PASS | PASS | PASS |
| `#/news` | PASS | PASS | PASS | PASS |
| `#/shots/2025020500` | PASS | PASS | PASS | PASS |
| `#/matchup/2026020001` | PASS | PASS | PASS | PASS |
| `#/players` | PASS | PASS | PASS | PASS |
| `#/player/8478402` | PASS | PASS | PASS | PASS |
| `#/team/TOR` | PASS | PASS | PASS | PASS |
| `#/standings` | PASS | PASS | PASS | PASS |
| `#/track-record` | PASS | PASS | PASS | PASS |
| `#/methodology` | PASS | PASS | PASS | PASS |

"Failed requests" logged by the harness as `net::ERR_ABORTED` are requests cancelled when the harness closes the page; they are not counted. A single-page probe with no navigation shows no failed request.

## Limited mode (production's legacy API)

Same bundle pointed at `https://propsports-api.sales-fd3.workers.dev` (legacy NHL contract):

| Route | Width | Result |
|---|---|---|
| `#/` | 1440px | PASS |
| `#/cast/2025020500` | 1440px | PASS |
| `#/news` | 1440px | PASS |
| `#/props` | 1440px | PASS |
| `#/goalies` | 1440px | PASS |
| `#/standings` | 1440px | PASS |
| `#/` | 390px | PASS |
| `#/cast/2025020500` | 390px | PASS |
| `#/news` | 390px | PASS |
| `#/props` | 390px | PASS |
| `#/goalies` | 390px | PASS |
| `#/standings` | 390px | PASS |

## Interaction tests

- `tests/e2e/replay.e2e.mjs` — PBE Cast replay: opens at 326/326 and 4–5; start → 1/326 and 0–0; next goal → 1–0 and deep link written; ArrowLeft → 0–0; ArrowRight → back to the goal; Fast playback advances; end → 4–5 and SOG 18 = official; `?t=175` deep link restores 1–0; 0 page errors. PASS.
- `tests/alerts.test.mjs` — alert rules. PASS.
- Lab lane scripted interactions (Shot Lab layers, row → rink highlight, sort; Methodology TOC): 38/38 PASS.

## Lighthouse (production bundle via `vite preview`, local)

| Page | Form factor | Perf | A11y | Best practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|---|
| Home | desktop | 97 | 100 | 100 | 92 | 0.9 s | 0.07 |
| Home | mobile | 81–87 | 100 | 100 | 92 | 3.9 s | 0.021 |
| PBE Cast (replay) | desktop | 99 | 100 | 100 | 92 | 0.9 s | 0.045 |
| PBE Cast (replay) | mobile | 88 | 100 | 100 | 92 | 3.0 s | 0.072 |
| Standings | mobile | 98 | 100 | 100 | 92 | 2.1 s | 0.006 |
| Shot Lab | mobile | 94 | 97 → fixed (`cff4045`) | 100 | 92 | 2.7 s | 0.086 |
| Goalies / Injuries / News / Lines / Props | mobile (dev) | — | 100 | — | — | — | ≤ 0.003 |

Mobile perf varies ±6 run to run under simulated throttling. Known: home mobile LCP ~3.9 s (the H1 is rendered by JS after the shell loads on simulated slow 4G). SEO 92 reflects hash routing.

## Screenshots

`docs/qa/` — 40 WebP captures (viewport height) of Home, PBE Cast (replay, pregame, command center), Injuries, News, Props, Shot Lab, Lines and Goalies at 1440 / 1024 / 390 / 360.

## Not verified here

- Live games: no NHL game is live before 2026-09-19. Live polling (5 s), intermission, manpower changes and alerts were verified with completed games, replay and unit tests, not against a live feed.
- Postponed / cancelled: state mapping is unit-tested (`semantics('FUT','PPD') → POSTPONED`); no real postponed game was available.
- Vercel preview with the v2 data layer (blocked, B1). Production currently serves the promoted `98530a4` build (B9).
- Worker-egress behaviour of every source (checks ran from a residential IP).
