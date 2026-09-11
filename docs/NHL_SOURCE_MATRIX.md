# NHL Source Matrix — NHL.PropBetEdge.ai (2026-27)

**All checks performed 2026-09-11, 11:06–11:45 UTC.**
**How I checked:** live HTTP requests with curl 8.x and Python urllib from the owner's Windows workstation, which is on a residential IP. **None of these checks ran from a Cloudflare Worker.** Worker egress behaves differently (see ESPN), so every source below needs a Worker canary before production.
Trimmed sample payloads are in `psapi-nhl/nhl-intelligence/fixtures/sources/*.json`. Each file has a `_meta` block recording the URL, date, method, semantics and findings. No secrets are stored, and every Odds API URL has `apiKey` stripped.

Semantics vocabulary (never collapse these):
- **OFFICIAL**: published by the NHL as league data (scores, boxscores, rosters, scratches).
- **REPORTED**: a third party or editorial desk reports it. It is not a league record.
- **PROJECTED**: someone's forecast (projected lineups, expected starters).
- **DERIVED**: computed by us from OFFICIAL raw data, and labeled with the method and the source game(s).
- **MARKET**: sportsbook prices, shown as a captured snapshot with a timestamp.

Licensing verdicts: **APPROVED**, **APPROVED-WITH-ATTRIBUTION**, **RESTRICTED-DO-NOT-INTEGRATE**, **UNVERIFIED**. I am not a lawyer. These verdicts come from the published terms text quoted below.

---

## 0. The licensing fact that sits under everything NHL

NHL.com Terms of Service, "Last Updated: October 29, 2025" — https://www.nhl.com/info/terms-of-service:

> "You may access, use, and display the Services, but only for non-commercial, informational, personal use, without modification or alteration in any way, and only so long as you comply with these Terms."
>
> "For example, you may not: … Engage in unauthorized spidering, scraping, or harvesting of content or information, or use any other unauthorized automated means to compile information"

`api-web.nhle.com`, `api.nhle.com/stats/rest` and `forge-dapi.d3.nhle.com` are undocumented public endpoints. **No commercial license exists for them.** Plain facts such as scores, stats, schedules and who started in goal are generally not copyrightable in the US, and the whole industry runs on these endpoints. The ToS still imposes a contractual non-commercial restriction, though. So every OFFICIAL NHL source below carries the verdict **UNVERIFIED — OWNER RISK DECISION**. I am not calling it APPROVED because nothing grants us that right.

Hard lines that apply regardless of that decision:
- Do **not** use NHL logos, marks, player headshots (`assets.nhle.com/mugs/...` URLs appear in these payloads), video, or NHL.com article text/photos without a license. This matches brief §"Do not use Getty/NHLI/NHL copyrighted editorial photography".
- Store and render facts only. Link out for editorial content.

---

## 1. NHL api-web core (schedule, score, gamecenter, roster, club-stats, player, EDGE, leaders, standings)

| | |
|---|---|
| Fields | Schedule, scores, game state, linescore, play-by-play events with x/y, boxscore skater/goalie lines, rosters, season stats, EDGE goalie detail, leaders, standings |
| Endpoint | `https://api-web.nhle.com/v1/...` (schedule/{date}, score/{date}, gamecenter/{id}/play-by-play\|boxscore\|landing\|right-rail, roster/{team}/current, club-stats/{team}/now, player/{id}/landing\|game-log, edge/goalie-detail/{id}/now, goalie-stats-leaders, skater-stats-leaders, standings/now, standings/{date}, standings-season) |
| Cadence (measured) | CDN `Cache-Control: max-age=7–19, s-maxage=7–19` (schedule 14 s, landing 19 s, boxscore 18 s, standings 7–14 s). The live-game data rate during games has not been measured this season. |
| Semantics | OFFICIAL |
| Licensing | **UNVERIFIED — OWNER RISK DECISION** (see §0) |
| Attribution | "Data: NHL" is recommended. Do not display NHL marks. |
| Failure modes | Undocumented shape drift; HTTP 400 on bad params (`goalie-stats-leaders?categories=savePct` → 400; valid values are `wins, shutouts, savePctg, goalsAgainstAverage`); 307 redirects on `/now` routes; stale-season responses (below). Answered 200 with **no User-Agent**, so a Worker's default fetch is fine. |
| Fallback | Last good snapshot plus a STALE badge. There is no second official source. |

**Standings trap (verified):** `standings/now` redirects to the 2025-26 FINAL table (seasonId 20252026, date 2026-04-17, 82 GP). `standings/2026-10-05` returns `{"standings": []}` (200). `standings-season` lists 20262027 with standingsStart 2026-09-29 and standingsEnd 2027-04-10. **Label as "2025-26 FINAL" until the 2026-27 table is non-empty. Never present it as current.**

---

## 2. Goalie starters

### 2a. NHL gamecenter `landing` → `matchup.goalieComparison` — NOT a starter source
- Checked `gamecenter/2026020001/landing` (FLA @ CAR, 2026-09-29, gameState FUT). `matchup` has `skaterComparison, goalieComparison, skaterSeasonStats, goalieSeasonStats`, all with `contextSeason: 20252026`.
- `goalieComparison.{homeTeam,awayTeam}.leaders[]` holds the **top 2 roster goalies by prior-season GP** (CAR: Bussi 39 GP, Kochetkov 9 GP; FLA: Markstrom 44 GP, Schmid 34 GP) plus `teamTotals`.
- I searched the whole payload for `starter|probable|confirmed|projected|expected|starting`: **0 hits.**
- `right-rail` for the same game has `gameInfo.{team}.scratches: []` and no goalie field.
- **Verdict:** this is prior-season team goalie context (OFFICIAL stats). **Never label it as a starter or projected starter.** Fixture: `nhl-landing-future-goaliecomparison.json`, `nhl-right-rail-future.json`.
- **UNVERIFIED canary for 2026-09-19 (first preseason day):** poll `boxscore` and `right-rail` during gameState `PRE` (T-60 → puck drop). If `playerByGameStats.*.goalies[].starter` or `scratches` populate before puck drop, we get an OFFICIAL pre-drop confirmation. Today there is no evidence either way.

### 2b. NHL boxscore `playerByGameStats.{side}.goalies[].starter` — CONFIRMED source
| | |
|---|---|
| Fields | `playerId, name, sweaterNumber, toi, starter (bool), decision, shotsAgainst, saves, goalsAgainst, savePctg, ES/PP/SH splits` |
| Endpoint | `https://api-web.nhle.com/v1/gamecenter/{id}/boxscore` |
| Verified | `starter: true` marks the goalie who **started, even if pulled**. In 2025020518 Kuemper had `starter:true` with 16:00 TOI and no decision, while Forsberg played 42:40 and took the L. In 2025020534 Jarry had `starter:true` (36:08, W) and Pickard played 23:52. In 2025020500 Fowler (MTL) and Shesterkin (NYR) were starters and the backups had 00:00. |
| Cadence | max-age ~18 s. Populated once the game is live. A FUT boxscore has no `playerByGameStats`. |
| Semantics | **OFFICIAL → CONFIRMED (at/after puck drop)** |
| Licensing | UNVERIFIED — OWNER RISK DECISION (§0) |
| Failure mode | Not present pregame, so it cannot drive a pregame "confirmed" badge. |
| Fallback | UNKNOWN until puck drop. |
Fixture: `nhl-boxscore-goalie-starter.json`.

### 2c. DailyFaceoff (starting goalies, line combinations, news) — The Nation Network
- robots.txt (https://www.dailyfaceoff.com/robots.txt): `Allow: /`, `Disallow: /api/`, `Disallow: /cms/`. **Robots permission is not a license.**
- dailyfaceoff.com has no Terms page of its own. `/terms*` 404s, and the footer links only a Privacy Policy, which names the operator as **The Nation Network**. The network Terms apply to "any all of its subsidiaries, affiliates, brands"; the footer lists DailyFaceOff.com. Terms of Service, "Updated and Effective as of January 9th, 2019" — https://oilersnation.com/terms-of-service:
  > "(g) use any robot, spider, rover, scraper or any other data-mining technology or automatic or manual process to monitor, cache, frame, mask, extract data from, copy or distribute any data from the Services, our network or databases"
  >
  > "You may not copy, make derivative works, resell, distribute, or make any commercial use of (other than to keep and share information for your own non-commercial purposes) any content, materials, or databases from our network or systems."
- `HEAD https://www.dailyfaceoff.com/starting-goalies` returned **403** (bot protection). I did not fetch the page content.
- Semantics: PROJECTED / REPORTED ("confirmed" on DFO means DFO's report, not a league record).
- **Verdict: RESTRICTED-DO-NOT-INTEGRATE** for goalies, lines and news RSS, unless we get a written license from The Nation Network.

### 2d. LeftWingLock (starting goalies, line combos, injury tracker)
- robots.txt: `Allow: /`.
- Terms — https://leftwinglock.com/tos.php:
  > "Permission is granted to temporarily download one copy of the materials … for personal, non-commercial transitory viewing on your personal devices only. … you may not: modify or copy the materials; use the materials for any commercial purpose, or for any public display (commercial or non-commercial)"
  >
  > "We reserve to right to immediately ban (without notice) any account that employs scraping technology to automate the process of accessing our propietary data including, but not limited to, data found in the following tools: Starting Goalies, Line Combinations, … Injury Tracker …"
- **A licensed path exists.** https://leftwinglock.com/api/ sells an API covering "Goalies, Lines, Stats" in three tiers: "Personal" (no distribution), "**Branded** — For commercial use. Left Wing Lock branding will be applied", and "**Professional** — For commercial use without Left Wing Lock branding". Pricing is quote-only ("$ X / $ Y / $ Z per month").
- Semantics: PROJECTED / REPORTED.
- **Verdict:** site content is **RESTRICTED-DO-NOT-INTEGRATE**. The LWL API is **UNVERIFIED** until the owner gets a quote and a contract. It is the most direct licensable pregame goalie and line source I found.

### 2e. RotoWire (starting goalies, injury news; also the upstream of ESPN's injury notes)
- Terms — https://www.rotowire.com/termsandconditions.php:
  > "The Services are provided only for your own personal, non-commercial use."
  >
  > "You shall not directly or indirectly archive, reproduce, distribute, modify, display, perform, publish, license, create derivative works from, or offer for sale content and information contained on or obtained from or through the Services"
  >
  > "…use manual or automated software, devices, or other processes to 'crawl' or 'spider' any of the Roto Sports Network website pages"
- **Verdict: RESTRICTED-DO-NOT-INTEGRATE** (the site). RotoWire sells data feeds commercially, but I did not price or verify them in this pass: **UNVERIFIED**.

### 2f. NHL.com "Projected lineups, starting goalies for today" (forge content API) — see §5c
This is NHL.com editorial, PROJECTED, and it includes projected goalies. It is the only no-cost pregame goalie projection I found. Its licensing bucket is §0 plus editorial copyright.

**Goalie bottom line:** CONFIRMED is supported at/after puck drop only. A pregame PROJECTED or REPORTED starter has **no approved source today.** Options are (1) the LWL commercial API, (2) the NHL.com projected-lineups article (owner risk), or (3) the PRE-state canary in 2a. Until one of those lands, pregame goalie status must render **UNKNOWN**.

---

## 3. Line combinations

### 3a. NHL stats REST shift charts — DERIVED "last-game deployment"
| | |
|---|---|
| Fields | `id, gameId, playerId, firstName, lastName, teamId, teamAbbrev, teamName, period, shiftNumber, startTime, endTime, duration ("mm:ss"), typeCode (517 = shift, 505 = goal row), eventDescription (EVG/PPG/…), eventDetails (assisters), detailCode, hexValue` |
| Endpoint | `https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId={id}` → `{data:[…], total}` |
| Verified | 2025020500: 769 rows (760 shifts plus 9 goal rows). Also populated for 2025021312 (738), 2025030411 (833) and 2025010050 (791). No `Cache-Control` header (`cf-cache-status: DYNAMIC`). Answered 200 with no UA. |
| Cadence | Available after the final for all four sampled games. **Live-game population timing is UNVERIFIED.** |
| Semantics | Raw data is OFFICIAL. Lines are **DERIVED**: there is no line or unit label, so we must cluster overlapping forward trios and D pairs by shared even-strength TOI. PP/PK units need strength-state context, which comes from pbp `situationCode` joined on time. |
| Licensing | UNVERIFIED — OWNER RISK DECISION (§0) |
| Attribution | Label as "Derived from NHL shift data, game {id} ({date}). Historical deployment, not a projection." |
| Failure modes | `data: []` / `total: 0` for a game (not observed in 4 samples, but the parser must treat it as "no deployment data", not "no lines"); OT clock-format edge cases; mid-game line blending. |
| Fallback | Show no lines. **Never** fill gaps with a guess. |
- play-by-play has **no on-ice skater lists or line info** (it carries `situationCode`, event owner, x/y and `rosterSpots` only). The boxscore has per-player `toi`/`shifts` and no linemates. Fixtures: `nhl-shiftcharts-sample.json`, `nhl-pbp-sample.json`.
- Projected pregame lines: DailyFaceoff and LeftWingLock sites are **RESTRICTED** (§2c/2d). The LWL API is **UNVERIFIED** (licensable). NHL.com projected lineups are covered in §5c.

### 3b. Official scratches — NHL `right-rail` `gameInfo.{awayTeam,homeTeam}.scratches[]`
- Completed 2025020500 shows `{id, firstName, lastName}` per scratched player (MTL: Struble, Dobes, Davidson; NYR: Brodzinski, Morrow). It gives **no reason**. The FUT game shows `[]`. Semantics: OFFICIAL. Pre-drop timing is UNVERIFIED (same canary as 2a). Fixture: `nhl-right-rail-completed-scratches.json`.
- A scratch is not an injury. Render "Scratched" and **never infer "injured"**.

---

## 4. Injuries

**There is no official NHL injury report.** The NHL does not mandate injury disclosure. Clubs use "upper body/lower body", and neither the NHL API nor the stats REST API exposes injuries or transactions. I checked: `api-web.nhle.com/v1/injuries` → 404, `/v1/transactions` → 404, `/v1/news` → 404, `api.nhle.com/stats/rest/en/injuries` → 404, `/transactions` → 404.

### 4a. ESPN site API injuries
| | |
|---|---|
| Endpoint | `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries` (team route `/teams/{id}/injuries` behaves the same) |
| Fields | per team `{id, displayName, injuries[]}`. Each row: `id, status, date, type{id,name,description,abbreviation}, details{fantasyStatus, type (body area), detail, side, returnDate}, shortComment, longComment, source{"basic/manual"}, athlete{displayName, position, team, status, notes.items[].source = "RotoWire"}` |
| Vocab (measured, 79 rows) | `status`: Day-To-Day 42, Out 20, Injured Reserve 15, Suspension 2. `fantasyStatus`: Day-To-Day, OUT, IR, IR-LT. `type.name`: INJURY_STATUS_DAYTODAY etc. |
| Freshness | Newest row 2026-09-10T20:24Z (Fiala, IR). The payload `season` block still says "Off Season / 2025-26". Rows date back to 2025-09-30. |
| Coverage trap | **Only 26 of 32 teams are present.** Teams with no listed injuries are omitted (COL, MTL, NSH, NYI, STL and SEA were absent). Absence means "no ESPN-listed injury", **not "healthy"**. |
| **UA gating (surprise)** | From this IP, Akamai returned **403 "Access Denied" with no User-Agent, with a Chrome UA, with `Mozilla/5.0`, and with a custom `PropBetEdge-NHL/1.0` UA**. It returned **200 with `curl/*` or `python-requests/*`**. The result was deterministic across two rounds. A Worker's default fetch sends no UA, which **may be the real cause of the NFL team's "ESPN 403s Workers" finding**, not IP reputation. |
| Core API | `sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/teams/{id}/injuries` → 200 (list of `$ref`s), and it was **not** UA-gated here. League-level `/leagues/nhl/injuries` → 404. `/leagues/nhl/transactions` → 200 with `count: 0`. |
| Semantics | **REPORTED.** The comment text is RotoWire-authored. `returnDate` is an estimate. |
| Licensing | Disney Terms of Use, "Last Updated: May 24, 2024" — https://disneytermsofuse.com/english/ (covers ESPN): *"access, monitor, copy or extract the Disney Products using a robot, spider, script, or other automated means, including … data mining or web scraping or otherwise compiling, building, creating or contributing to any collection of data, data set or database"* is prohibited. The license is *"for your personal, noncommercial use only … with no right to reproduce, distribute, … or transform any Disney Product"*. It also prohibits: *"bypass, modify, defeat, tamper with or circumvent any of the functions or protections"*. **Spoofing a curl UA to get past the Akamai 403 would itself be circumvention.** |
| **Verdict** | **RESTRICTED-DO-NOT-INTEGRATE** |
| Failure modes | 403 by UA or IP; silent team omission; offseason season label; RotoWire text inside. |
| Fallback | See 4b and 4c. |
Fixtures: `espn-injuries-sample.json` (comments truncated or omitted), `espn-core-injury-item.json`.

### 4b. NHL.com content API, injury/transaction-tagged stories (forge-dapi)
- `https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=injury&$limit=N` and `tags.slug=transactions`: 200, `Cache-Control: public, max-age=20`, no UA needed.
- Items: `contentDate, lastUpdatedDate, headline, title, slug, summary, tags[] (incl. playerid-<nhlId>, teamid-<id>, injury, transactions, press-release), selfUrl, thumbnail`. **The playerid-/teamid- tags give free entity linking to NHL IDs.**
- Freshness: newest injury story 2026-09-10T21:00Z (Fiala). Newest transaction story 2026-09-10T21:23Z (Bowman, VGK).
- Semantics: **REPORTED** (NHL.com editorial and club press releases). A story is not a status record. Do not convert a headline into OUT.
- Licensing: §0 (UNVERIFIED — OWNER RISK DECISION). Use headline, link and timestamp only; never the body or thumbnail.
- Fixtures: `nhl-forge-stories-injury.json`, `nhl-forge-stories-transactions.json`.

### 4c. Defensible Injury Desk (degraded mode)
OFFICIAL scratches (§3b) + boxscore/roster presence + NHL.com injury/transaction headlines with links (4b) + the "Injured:" line in NHL.com projected lineups (5c, owner risk). There will be **no structured status enum** (OUT/DTD/IR) unless a licensed feed is bought. Candidates are the LWL API "Injury Tracker", RotoWire data, or Sportradar; none were verified in this pass.

---

## 5. News

### 5a. propbet-news-api (our network) — **do not consume as-is**
- `GET /news?sport=nhl`, `/news/by-sport/nhl`, `/health`: **403 `{"error":"Access denied. Use this API via RapidAPI."}`** unless `Origin`/`Referer` is a propbetedge.ai host. `nhl.`, `nfl.` and the apex domain were all accepted. A server-side Worker call needs an Origin header or a RapidAPI key. The Origin check is spoofable, so it is not real auth.
- `/health` 200: `version 4.3.0`, `sports [mlb,nfl,nba,nhl]`, `"18 RSS sources → relevance scoring → Claude Haiku AI enrichment → prop-bet impact scores"`, `"updated every 1-2 hours per sport"`. `/sources` → 404. `sport=NHL` (upper case) → 0 results because the parameter is case-sensitive.
- NHL total 1,270 articles. Newest `published_at` 2026-09-10T23:30Z at an 11:10Z check, which is an **~11.7 h gap** overnight, against a 1–2 h claim.
- Fields: `id, sport, category (transaction/general/injury/roster-move), title, slug, summary, body, body_html, author, image_url, source, source_url, published_at, url (propbetedge.ai/news/nhl/…), take{summary, advice, impact_score, teams, players, prop_types, model: claude-haiku-4-5}, media_embeds`.
- **Source mix of the latest 50: the-hockey-writers 22, daily-faceoff 19, nhl-rumors 6, espn 3.**
- **Problems:** (1) `title` is an AI rewrite, not the source headline ("Bowman's Extension Signals Vegas Confidence in Depth—But Wait for Line Movement"). (2) `body` is a full AI rewrite of the third-party article, which makes it a derivative work. That is expressly barred by The Nation Network's Terms for DailyFaceoff content (§2c) and by Disney's Terms for ESPN content (§4a). (3) `image_url` hotlinks ESPN's CDN. (4) `take.advice` is generated betting advice ("Fade Bowman overs…"), which conflicts with the no-fabrication rule when shown as analysis.
- **Verdict: RESTRICTED-DO-NOT-INTEGRATE as-is.** The feed is usable only if it is filtered to APPROVED sources and rendered as source headline + link + time. This is also a network-wide exposure: propbetedge.ai/news already publishes these rewrites. **The owner should know.**
- Fixture: `propbet-news-api-nhl-sample.json` (bodies omitted).

### 5b. ESPN site API news
`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news` has the same UA gating as 4a. Fields: `headline, description, published, lastModified, type (HeadlineNews/Story/Media), premium, links.web.href, categories[] (athleteId/teamId), images`. Newest item 2026-09-10T22:48Z. **Verdict: RESTRICTED-DO-NOT-INTEGRATE** (Disney ToU, §4a). Fixture: `espn-news-sample.json`.

### 5c. NHL.com content API (forge-dapi) — league news metadata and projected lineups
- `…/v2/content/en-us/stories?$limit=N[&tags.slug=…]`: newest story 2026-09-11T10:00Z. Headline + link + time + NHL entity tags.
- **Projected lineups:** `…/stories/nhl-lineup-projections-2025-26-season` ("Projected lineups, starting goalies for today", described as "Latest line combinations, defense pairs, injury news from NHL.com writers") was last updated 2026-06-14 (SCF Game 6). Each game block is markdown: `**<Team> projected lineup**`, forward lines as `A -- B -- C`, D pairs, goalies, `*Scratched:*`, `*Injured:* Name (body area)`, and a `**Status report**`. Team beat stories also appear under `tags.slug=lineup` ("PROJECTED LINEUP: Jarry starts, …"). **No 2026-27 edition exists yet** (newest `lineup`-tagged item is 2026-06-14). Semantics: **PROJECTED**. Parsing is fragile because markdown is not an API contract. Fixture: `nhl-forge-projected-lineups-story.json`.
- Licensing: §0, **UNVERIFIED — OWNER RISK DECISION**. The article is editorial copyright, which is a step further than raw stats. If used, show "NHL.com projects …" with timestamp and link, never as our own claim and never as CONFIRMED.
- The NHL.com RSS (`https://www.nhl.com/rss/news.xml`) returned **403**. `/rss/news` returned an HTML page, not a feed. Forge is the only working NHL.com news channel.

### 5d. RSS/Atom feeds (headline + link + time metadata only; never bodies)
Probe date 2026-09-11 ~11:15Z. Items and newest date are as fetched. Fixture: `rss-probe-summary.json`.

| Feed | URL | Result | Newest item | Terms (quote / URL) | Verdict |
|---|---|---|---|---|---|
| Yahoo Sports NHL | https://sports.yahoo.com/nhl/rss/ (`/nhl/rss.xml` 301s here) | RSS 200, 50 items, per-item `<source>` (The Hockey News team sites, AP, SB Nation, NY Post) | 2026-09-11T05:20Z | https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html (updated 4 Aug 2026): *"If you use an RSS feed provided by us … you are only permitted to display the content that is provided in the feed, without modification, and you must provide attribution to our source website and link to the full article … You may not incorporate advertising into any Yahoo RSS Feed."* | **APPROVED-WITH-ATTRIBUTION**: unmodified headline, "via Yahoo Sports / {item source}", link to the Yahoo article, no ads inside the feed module. Titles contain HTML entities (`&#39;`): decode once, then escape on render. |
| Sportsnet NHL | https://www.sportsnet.ca/hockey/nhl/feed/ | RSS 200, 52 items (includes full `content:encoded`) | 2026-09-10T19:29-04:00 | No terms page found (`/terms-of-use/`, `/terms/`, `/terms-conditions/`, `/legal/` all 404). Rogers Sports & Media terms not located. | **UNVERIFIED**. Do not use until the terms are found. |
| The Hockey News | https://thehockeynews.com/.rss/full/ | RSS 200, 50 items, full bodies | 2026-09-10T21:12Z | The THN homepage links its Terms to RTB/Roundtable (https://rtb.io/…/rtb-platform-user-terms-of-use, updated Feb 1 2025): *"you may use the Platform only for your own personal, noncommercial use (except as specifically pre-approved in writing by RTB for commercial use)"*, and it bars *"data mining, robots or similar data gathering or extraction methods"*. | **RESTRICTED-DO-NOT-INTEGRATE** directly. THN items still reach us legitimately via the Yahoo feed under Yahoo's RSS clause. |
| ESPN NHL | https://www.espn.com/espn/rss/nhl/news | RSS 200 (no UA / curl UA), 19 items. The connection was reset with a `Mozilla/5.0` UA. | 2026-09-10T18:48-05:00 | Disney ToU (§4a). The ESPN RSS info page was unreachable (bot challenge). | **RESTRICTED-DO-NOT-INTEGRATE** |
| CBS Sports NHL | https://www.cbssports.com/rss/headlines/nhl/ | RSS 200, 36 items, **stale** | 2026-09-02T16:43Z | https://www.viacomcbs.legal/us/en/cbsi/terms-of-use (effective May 27 2025): *"You are only permitted to access and view the Content for personal, non-commercial purposes … and may not build a business or other enterprise utilizing any of the Content"*, and bars *"unauthorized spidering, 'scraping,' data mining"*. | **RESTRICTED-DO-NOT-INTEGRATE** |
| Daily Faceoff | https://www.dailyfaceoff.com/feed (also `/rss`) | RSS 200, 25 items, full bodies | 2026-09-10T23:05Z | The Nation Network Terms (§2c) | **RESTRICTED-DO-NOT-INTEGRATE** |
| Pro Hockey Rumors | https://www.prohockeyrumors.com/feed | RSS 200, 15 items, full bodies | 2026-09-11T02:00Z | No Terms page (`/terms-of-service`, `/terms-of-use` 404). The operator is Dierkes Information Services, Inc. (privacy policy, updated 6-22-26). The site footer advertises its "RSS Feed". | **UNVERIFIED**. The feed is advertised publicly with no written license. Ask the operator before use. Strong transaction/signing coverage. |
| TSN | `/rss/nhl`, `/datafiles/rss/Nhl.xml`, `/nhl/rss`, `/rss` | all 404 | n/a | n/a | No feed found |
| NBC ProHockeyTalk | https://www.nbcsports.com/nhl/feed | 404 | n/a | n/a | No feed found |

---

## 6. Odds and props

### 6a. The Odds API
Credits spent this session: **3**.

| Call | Metered? | Result | Quota headers after |
|---|---|---|---|
| `GET /v4/sports?all=true` | no | `icehockey_nhl` **active**. `icehockey_nhl_preseason` **inactive**. `icehockey_nhl_championship_winner` active (outrights). AHL inactive. | remaining **96,583**, used 3,417, last 0 |
| `GET /v4/sports/icehockey_nhl/events` | no | **32 events**, earliest **2026-09-29T21:10Z** (FLA @ CAR), latest 2026-10-10T22:10Z | remaining 96,583, used 3,417, last 0 |
| `GET /v4/sports/icehockey_nhl/events/9de33ce1…/odds?regions=us&markets=h2h,spreads,totals,player_shots_on_goal,player_total_saves,player_points,player_goals,player_assists&oddsFormat=american` | **yes** | **10 books**: draftkings, williamhill_us, fanduel, betonlineag, lowvig, betmgm, betrivers, bovada, fanatics, betus. Markets: h2h 10/10, totals 10/10, spreads 8/10 (betonlineag and lowvig had no spreads). **All 5 player markets absent.** | remaining **96,580**, used **3,420**, last **3** |

Findings:
- **Player props are not posted 18 days before puck drop.** The event-odds cost was 3 because you pay only for markets actually returned. Prop availability has to be canaried near game day. The NFL pattern captures props only inside a window of N days.
- **The event list is incomplete.** 32 events vs **83** NHL regular-season games scheduled 2026-09-29..10-10, so books have posted only a subset. Re-list events every ingest and never treat the list as the schedule.
- The Odds API `commence_time` is the NHL `startTimeUTC` **+10 min** (21:10Z vs 21:00Z). Match to NHL game IDs by team pair + date with a tolerance, not by exact time.
- Team-name mapping traps: `"Montréal Canadiens"` (accent), `"St Louis Blues"` (no period), `"Utah Mammoth"`.
- Sample prices (DK, captured 11:12Z): CAR −130 / FLA +110; puck line CAR −1.5 +190; total 6.5 O +100 / U −120. Cross-check: the NHL schedule's embedded DraftKings odds (providerId 9) matched −130/+110.
- **The key is shared.** It lives in `ufc-propbetedge/.env` and shows 3,417 credits already used this cycle. The reset date and which products share it were not checked.
- Terms — https://the-odds-api.com/terms-and-conditions.html (updated 31 Aug 2026): *"Displaying our data in a UI, website, or mobile app, including for commercial use"* and *"Calculating and displaying values you derive from our data"* are permitted. *"Attribution to The Odds API is not required"*. **But:** *"Do not resell, repackage, or redistribute our data as a standalone data product. This includes … offering our data through your own API, data feed…"*. **Verdict: APPROVED for NHL.PropBetEdge.ai UI. Odds must NOT be exposed through the PropSports/RapidAPI/commercial API gateway.**
- Semantics: MARKET snapshot (`LAST_VERIFIED_MARKET`, `captured_at`, age).
- Fixtures: `odds-sports-hockey.json`, `odds-events-nhl.json`, `odds-event-sample.json` (2 books).

### 6b. NHL schedule embedded odds (`oddsPartners`, `awayTeam.odds`/`homeTeam.odds`)
Partners on 2026-09-29: Unibet (SE), Tipsport (CZ), Veikkaus (FI, decimal), FanDuel (CA), Sportradar (DE), DraftKings (US), Doxxbet (SK). Values are strings keyed by `providerId`, and there are no props, totals or timestamps. This is affiliate display odds under the NHL ToS. **UNVERIFIED**. Use it only as a sanity cross-check and never as a primary odds source. Fixture: `nhl-schedule-odds-partners.json`.

### 6c. What an NHL odds ingest needs (reuse the `nfl-odds` v3.0.0-snapshot pattern: `C:\Workers\nfl-propbetedge-new\workers\nfl-odds`)
1. **One provider authority Worker (`nhl-odds`) with its own KV namespace.** The cron fires `0 12,13,17,18,22,23 * * *` UTC, and the handler ingests only when the New York hour is in `INGEST_HOURS_ET` (default 8,13,18), which makes it DST-safe. A token-protected `POST /ingest` (`ODDS_ADMIN_TOKEN`) is the only manual trigger. **Every user GET reads KV and makes 0 provider calls. User traffic never determines spend.**
2. **KV keys** mirror NFL under an `nhl-odds:v1:` prefix: `meta`, `featured:regular` (one `/sports/icehockey_nhl/odds` call covers all listed events, h2h/spreads/totals, 3 credits), `event:{id}` (per-event player boards), `board-index`, `ingest:last-attempt`, `batches` (last 60).
3. **Snapshot semantics:** `LAST_VERIFIED_MARKET` with `batch_id`, `captured_at`, `age_seconds`, `provider_last_update`, `credits_spent`, and `LATEST_INGEST_UNAVAILABLE` when the newest attempt failed after the batch being served. Per-market availability is `IN_SNAPSHOT` / `NOT_OFFERED_AT_INGEST` / `NOT_REQUESTED_BY_INGEST`. There is no synthetic fallback.
4. **NHL specifics:** `PLAYER_MARKETS` = the NHL keys (`player_points, player_shots_on_goal, player_goals, player_assists, player_total_saves, player_power_play_points, player_blocked_shots, player_goal_scorer_anytime`…). The first five were accepted without a 422 in the call above. The rest come from the Odds API market docs and have not been live-verified. `INGEST_PROP_WINDOW_DAYS` = 1–2. Team-name→NHL-abbrev map, ±15 min commence tolerance, and re-list events every run. The preseason key is inactive today.
5. **Budget, estimated:** ~7 games/day average (1,344 games over ~194 days) and ~15 on peak days. With 5 prop markets × 1 region, a 1-day window costs about 35–75 credits per ingest, plus 3 featured, times 3 ingests. That is about **115–235 credits/day, or ~3.5–7k/month**, on a key that already shows 3,420 used. Set `INGEST_PLAYER_MARKETS` explicitly. Leaving it unset captures every market.

---

## 7. Licensed data options not verified in this pass
- **LeftWingLock API** (Branded / Professional commercial tiers): goalies, lines, stats. Quote-only. This is the best lead for pregame goalies and lines.
- **RotoWire data feeds**: injuries and goalie news. Not priced.
- **Sportradar**: listed by the NHL as an odds partner (`oddsPartners`, "Sportradar (DE)"). Its commercial NHL feeds (lineups, injuries) were not evaluated. Pricing and terms are UNVERIFIED.

---

## 8. Feature → source → status

| Feature | Source(s) | Status | Notes |
|---|---|---|---|
| **Ice Board** | NHL schedule/score (§1). Odds snapshot (§6a). Goalie badge = boxscore `starter` (§2b). | **SUPPORTED** (NHL licensing = owner risk decision, §0) | Pregame goalie badge must read UNKNOWN until puck drop. Injury badges have no licensed source (§4). |
| **PBE Cast** | NHL play-by-play / boxscore / landing / right-rail (§1) | **SUPPORTED** (§0 risk) | CDN max-age 14–19 s, so ~15–20 s is the realistic freshness floor. |
| **Goalie Center** | Stats: api-web goalie leaders, player landing/game-log, EDGE goalie-detail, club-stats (OFFICIAL). CONFIRMED starter: boxscore `starter` at/after puck drop. | Stats **SUPPORTED**. Pregame starter status is **BLOCKED-by-licensing**. | DFO/LWL/RotoWire sites are restricted. Options are the LWL API (quote), the NHL.com projected-lineups article (owner risk, not yet published for 2026-27), and the PRE-state canary. `goalieComparison` ≠ starter. No GSAx until an xG model is validated. |
| **Lines** | NHL shift charts (§3a) → last-game deployment. Official scratches (§3b). | **DERIVED-ONLY** | Pregame projected lines are **BLOCKED-by-licensing** (DFO/LWL). The NHL.com projection is UNVERIFIED (owner risk). Label every line "Derived from shift data, game X". |
| **Injury Desk** | ESPN (restricted). NHL.com injury/transaction headlines (forge, §4b). Official scratches. | **BLOCKED-by-licensing** for a structured status table | The defensible degraded mode is scratches plus linked NHL.com headlines, with no OUT/DTD/IR enum. A real desk needs a licensed feed. |
| **Newsroom** | Yahoo NHL RSS (APPROVED-WITH-ATTRIBUTION). NHL.com forge metadata (§0 risk). PHR and Sportsnet (UNVERIFIED). | **SUPPORTED** (Yahoo headlines/links now); others UNVERIFIED | Do **not** consume propbet-news-api as-is: AI-rewritten DFO/ESPN/THW bodies and generated betting advice. |
| **Odds** | The Odds API via the snapshot ingest (§6) | **SUPPORTED** | h2h/spreads/totals, 10 US books, APPROVED terms. Must not be re-exposed through a sellable API. |
| **Props** | The Odds API player markets | **BLOCKED-by-data** as of 2026-09-11 | 0 of 5 player markets posted 18 days out. Game-day availability is **UNVERIFIED** until a canary runs. |
| **Shot Lab** | NHL play-by-play x/y, shot type, zone, situationCode (§1) | **SUPPORTED** (DERIVED visuals; §0 risk) | No xG or GSAx until a model exists and is validated. |
| **Standings** | api-web standings (§1) | **SUPPORTED** (§0 risk) | `standings/now` serves 2025-26 FINAL until 2026-27 games are played. Label it as such. |

---

## 9. Canaries to run (not done here)
1. **From a deployed Worker:** ESPN site API with the default fetch (expected 403), the NHL api-web/stats/forge endpoints, the Yahoo RSS, and the Odds API. This establishes Worker-egress truth.
2. **2026-09-19 preseason, gameState PRE (T-60 → drop):** do boxscore `goalies[].starter` and right-rail `scratches` populate before puck drop?
3. **Game-day props:** one event-odds call on the morning of a regular-season game (~5–8 credits) to learn when NHL player markets appear and which books carry them.
4. **Shift charts during a live game:** are rows published in-game or only post-final?
5. **Weekly:** check whether NHL.com publishes the 2026-27 "Projected lineups, starting goalies" story (forge `tags.slug=lineup`).

## 10. Owner decisions required
1. Accept or reject the NHL.com ToS non-commercial risk (§0). Every OFFICIAL feature depends on this.
2. Whether to license pregame goalies/lines/injuries (LWL API quote; RotoWire or Sportradar alternatives).
3. Whether to use NHL.com's projected-lineups editorial with "NHL.com projects…" attribution.
4. Fix propbet-news-api network-wide: drop DailyFaceoff/ESPN full-body rewrites and generated `take.advice`, or restrict it to APPROVED sources.
5. Confirm which products share the Odds API key and when the quota resets, before adding an NHL ingest.
