# NHL UI verification

Run: 2026-09-11 (identity pass) · frontend `nhl-ufc2-production` at the commit that adds this file · Chromium (Playwright) · harness `tests/e2e/shoot.mjs`.

Stack under test (local, because the branch preview Worker deploy is blocked — NHL_BUILD_STATUS B1):
Vite dev server → the real `api/nhl.js` / `api/odds.js` / `api/env.js` handlers → branch Worker (`wrangler dev --local`, `nhl-intelligence-v1`) → live api-web.nhle.com / forge / Yahoo RSS; odds from the real `nhl-odds` handler serving the snapshot of a real ingest (2026-09-11 12:13Z, 15 games, 10 books).

Checks per route × width: horizontal overflow (document scrollWidth − viewport), broken images (complete with naturalWidth 0 — covers portraits and logos), text under 10 px, console errors / page errors.

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

111 requests were logged as `net::ERR_ABORTED`: polls cancelled when the harness closes each page. Other failed requests: 0.

## Limited mode (production's legacy API) — 16 / 16 PASS

Same code with `PROPSPORTS_BASE_URL` pointed at the legacy production Worker and no dashboard secret — the environment nhl.propbetedge.ai serves today. Covers the Preseason Intelligence Mode ribbon and the Ice Board capability panel where the v2 data layer is missing.

| Route | Width | Result |
|---|---|---|
| `#/` | 1440px | PASS |
| `#/cast/2025020500` | 1440px | PASS |
| `#/news` | 1440px | PASS |
| `#/props` | 1440px | PASS |
| `#/goalies` | 1440px | PASS |
| `#/lines?team=MTL` | 1440px | PASS |
| `#/players` | 1440px | PASS |
| `#/standings` | 1440px | PASS |
| `#/` | 390px | PASS |
| `#/cast/2025020500` | 390px | PASS |
| `#/news` | 390px | PASS |
| `#/props` | 390px | PASS |
| `#/goalies` | 390px | PASS |
| `#/lines?team=MTL` | 390px | PASS |
| `#/players` | 390px | PASS |
| `#/standings` | 390px | PASS |

## Identity / social checks

- `tests/identity-checks.mjs` (CI): one title / description / canonical (`https://nhl.propbetedge.ai/`); no localhost, `vercel.app` or `workers.dev` URL in `<head>`; `og:image` absolute, file exists, 1200×630 JPEG under 300 KB, `twitter:image` identical; every linked icon exists at its declared size (PNG IHDR parse), `favicon.ico` is an ICO, manifest icons match their declared sizes and include a maskable icon; exactly one JSON-LD block, parsing to Organization / WebSite / WebApplication / WebPage with no rating, review, offer, award or interaction-count claims; the boot-script backdrop preload map matches `src/lib/backdrops.js` and the router, and all 72 backdrop files exist. PASS.
- Served locally: `/favicon.ico` (image/x-icon), `/favicon.svg` (image/svg+xml), 16/32 PNG, `/apple-touch-icon.png` 180×180, `/site.webmanifest` (application/manifest+json), `/og/propbetedge-nhl-1200x630.jpg` 1200×630, `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png` — all 200 with the right type.
- Built `dist/index.html`: one each of canonical / manifest / apple-touch-icon, four icon links, no duplicate meta tags, no preview or local URLs.
- The Vercel branch preview for each pushed head built READY. It sits behind Vercel Authentication, so social scrapers cannot read it (expected). Production (`6d834e2`, a dashboard promotion) predates the pass: its `/og/…`, `/apple-touch-icon.png`, `/site.webmanifest` and `/icon-512.png` return 404 until a build from this pass is promoted.

## Lighthouse (production bundle via `vite preview`, local, simulated throttling)

Measured at `af116be`, except the Ice Board rows, which were re-measured on the final CSS. The footer network column (`75d9818`, from a parallel session) landed in between; it is covered by the screenshot matrix above.

| Page | Form factor | Perf | A11y | Best practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|---|
| Ice Board | desktop | 97 | 100 | 100 | 92 | 1.0 s | 0.004 |
| Ice Board | mobile | 82 | 100 | 100 | 92 | 3.9 s | 0.02 |
| PBE Cast (replay) | desktop | 96 | 100 | 100 | 92 | 1.1 s | 0.004 |
| PBE Cast (replay) | mobile | 78 | 100 | 100 | 92 | 4.4 s | 0.062 |
| Props | desktop | 98 | 100 | 100 | 92 | 1.0 s | 0.004 |
| Props | mobile | 83 | 100 | 100 | 92 | 3.7 s | 0 |
| Goalie Center | desktop | 92 | 100 | 100 | 92 | 1.5 s | 0.004 |
| Goalie Center | mobile | 81 | 100 | 100 | 92 | 3.9 s | 0 |
| Lines | desktop | 97 | 100 | 100 | 92 | 0.9 s | 0.004 |
| Lines | mobile | 83 | 100 | 100 | 92 | 3.6 s | 0 |
| News | desktop | 100 | 100 | 100 | 92 | 0.5 s | 0.019 |
| News | mobile | 85 | 100 | 100 | 92 | 3.4 s | 0 |
| Shot Lab | desktop | 97 | 100 | 100 | 92 | 0.9 s | 0.05 |
| Shot Lab | mobile | 83 | 100 | 100 | 92 | 3.7 s | 0.058 |
| Players | desktop | 98 | 100 | 100 | 92 | 0.9 s | 0.004 |
| Players | mobile | 88 | 100 | 100 | 92 | 3.1 s | 0 |
| Player (portrait) | desktop | 97 | 100 | 100 | 92 | 0.9 s | 0.004 |
| Player (portrait) | mobile | 81 | 100 | 100 | 92 | 4.1 s | 0 |
| Standings | desktop | 98 | 100 | 100 | 92 | 0.8 s | 0.006 |
| Standings | mobile | 88 | 100 | 100 | 92 | 3.0 s | 0 |
| Methodology | desktop | 98 | 100 | 100 | 92 | 0.9 s | 0.004 |
| Methodology | mobile | 87 | 100 | 100 | 92 | 3.2 s | 0 |

What changed in this pass, measured:
- **Font-swap CLS removed.** Metric-matched local fallbacks (`src/styles/fonts.css`): Team desktop 0.122 → 0.004, Player mobile 0.119 → 0, PBE Cast desktop 0.045 → 0.004.
- **Ice Board CLS → 0.004 desktop / 0 phones in both environments.** Before: 0.07 desktop (v2), 0.113 desktop in the legacy environment production serves, 0.02 phones. The hero is now top-anchored, the What-changed rail keeps one height on wide screens whatever it resolves to, the next-puck-drop slot reserves the taller legacy panel, and the phase line reserves two lines on phones (measured with a layout-shift observer and Lighthouse).
- Pre-existing, not addressed: PBE Cast mobile CLS about 0.06 (`#cast-body` placeholder under throttling; 0.072 before the pass) and Shot Lab about 0.05.
- **Mobile LCP on photo-backdrop pages is higher than before the pass** (PBE Cast 3.0 s → about 4.3 s simulated): the backdrop is now the largest element. In the unthrottled trace it paints at first contentful paint, and the boot script preloads it alongside the bundle, but Lantern's simulation charges it for the ~80 KB of web fonts requested earlier. Accepted as the cost of the visual system; turning photos off on phones is a one-line change in `applyBackdrop` if the owner prefers the score.
- A11y fixes found by this run: heading order on Player / Team, link names on leaders / matchup team links, Methodology TOC target size. Props phones: prose notes at 12 px.
- SEO 92 everywhere is hash routing. Mobile perf varies about ±5 run to run on this machine (memory pressure during the run).

## Screenshots

`docs/qa/` — 76 WebP files: every route above at 1440 / 1024 / 390 / 360 (viewport height, `<route>-<width>.webp`) plus `contact-sheet-<width>.webp` per width.

## Not verified here

- Live games: none before 2026-09-19. Live polling, intermission, manpower changes and alerts are verified with completed games, replay and unit tests, not a live feed.
- Postponed / cancelled: state mapping unit-tested; no real postponed game available.
- Vercel preview with the v2 data layer (blocked, B1). Social-card unfurl on real platforms needs a public URL (production promotion).
- Safari / Firefox rendering of the fallback font faces and `image-set()` (Chromium only; `image-set` has a WebP `url()` fallback).

---

## Live scores + player photos pass (2026-09-12) — `nhl-live-scores-photos-v1`

Run against **this branch's build**, served locally, with the production Cloudflare gateway relayed Node-side (the gateway rejects a `127.0.0.1` origin) and the **real, un-intercepted** `propbet-img-proxy.sales-fd3.workers.dev` for every player image. `node tests/e2e/live-acceptance.mjs`.

15 routes × 1440 / 390 = 30 page loads, **330 / 330 checks pass**.

| Measure | Result |
|---|---|
| Console / page errors | **0** across all 30 loads |
| Horizontal overflow, 1440 and 390 | **0 px** on every route |
| Horizontal overflow, 1024 | **0 px** on every route |
| Horizontal overflow, 360 | **27 px** on every route — **pre-existing**, identical on a clean build of `main` (`c35edc4`); offender is `.topbar__tools`, untouched by this branch. The deployed production bundle measures 10 px at 360, so the local number also reflects web fonts not loading locally. 360 is outside this pass's acceptance widths |
| Broken images | **0** (478 avatar images requested, 478 decoded) |
| Empty identity frames | **0** |
| Runtime photo misses (`window.__pbePid.misses`) | **0** |
| Non-200 responses from the image proxy / asset feed | **0** |
| NHL mug `object-fit` | `contain` on every official headshot; identity frames square to ±0.02 |
| Gateway calls outside `/nhl/*`, `/readiness`, `/odds` | **0** |

Avatar images loaded per surface at 1440: team EDM 61/61 · goalies 48/48 · lines 36/36 · players 25/25 · injuries 20/20 · news 24/24 · matchup 14/14 · PBE Cast 9/9 · player hero 2/2.

Matchup regression, measured on the live production site before the fix and on this build after: `#/matchup/2025021311` went from **12 player-linked slots with 8 showing no image** to **14 slots, 14 images, 0 lost**.

### Score-rail state matrix

`node tests/e2e/score-ticker.e2e.mjs` — **52 / 52 PASS** at 1440 and 390. States: LIVE, INTERMISSION, FINAL, FINAL/OT, FINAL/SO, SCHEDULED, ordering, gateway `STALE`, refresh failure after a good load, no games today, board 503, reduced motion, mobile manual swipe, NHL-only content and network.

### Screenshots

`docs/qa/live-scores-photos-v1/` — 17 WebP files:

| File | What it shows |
|---|---|
| `home-1440.webp`, `home-390.webp` | Ice Board with the rail in today's real state (offseason: "No NHL games today" + the verified next puck drop) |
| `home-real-slate-1440.webp`, `home-real-slate-390.webp` | the same shell with the rail carrying the **real** 2026-04-13 slate, pulled live from the gateway (2026-09-12 has no games) |
| `rail-real-slate-1440.webp`, `rail-real-slate-390.webp` | the rail alone against that real slate — real club marks, real scores, FINAL/OT and FINAL/SO |
| `player-mcdavid-1440.webp`, `player-mcdavid-390.webp` | player page with the real NHL asset-feed headshot, credited |
| `team-edm-1440.webp`, `players-1440.webp`, `players-390.webp` | roster and league-leader surfaces with many working photos |
| `matchup-1440.webp` | matchup page (the surface whose avatars were falling back to initials) |
| `rail-fixture-live-1440.webp`, `rail-fixture-live-390.webp`, `rail-fixture-stale-1440.webp` | rail in LIVE and "scores delayed" states, from the state-matrix gate (stubbed club marks) |
| `rail-nogames-1440.webp`, `rail-nogames-390.webp` | the zero-games state |

### Not verified in this pass

- **The rail against a genuinely in-progress NHL game.** The 2026-27 preseason opens 2026-09-19; `/nhl/board` returns 0 games today. LIVE and INTERMISSION are proven against the gateway's real payload shape with the status block set to those states, not against a game actually being played.
- Lighthouse was not re-run for this pass; the rail adds 44 px of reserved chrome and no new network request beyond the board the app already fetched.
